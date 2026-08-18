import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as XLSX from "xlsx";
import { createStudyMaterial, createStudentRegistryRecord, deleteStudyMaterial, deleteStudentRegistryRecord, getStudyMaterialById, getStudentByStudentId, listStudyMaterials, listStudentRegistry } from "./db";
import { storageDelete, storagePut } from "./storage";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  students: router({
    list: protectedProcedure.query(({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only administrators can manage student IDs" });
      return listStudentRegistry();
    }),
    verify: protectedProcedure
      .input(z.object({ studentId: z.string().trim().min(2).max(100) }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role === "admin") return { verified: true, studentId: input.studentId };
        const student = await getStudentByStudentId(input.studentId);
        if (!student) throw new TRPCError({ code: "UNAUTHORIZED", message: "That student ID is not registered by the administrator" });
        if (!student.email || !ctx.user.email || student.email.toLowerCase() !== ctx.user.email.toLowerCase()) throw new TRPCError({ code: "UNAUTHORIZED", message: "This student ID is not linked to the signed-in student account" });
        return { verified: true, studentId: student.studentId, fullName: student.fullName };
      }),
    add: protectedProcedure
      .input(z.object({ studentId: z.string().trim().min(2).max(100), fullName: z.string().trim().min(2).max(255), email: z.string().email(), semester: z.number().int().min(1).max(8).optional(), department: z.string().trim().min(2).max(160).default("Information Technology") }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only administrators can manage student IDs" });
        if (await getStudentByStudentId(input.studentId)) throw new TRPCError({ code: "CONFLICT", message: "That student ID is already registered" });
        const id = await createStudentRegistryRecord({ ...input, email: input.email || null, createdBy: ctx.user.id });
        return { id };
      }),
    importExcel: protectedProcedure
      .input(z.object({ fileBase64: z.string().min(1), fileName: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only administrators can manage student IDs" });
        const workbook = XLSX.read(Buffer.from(input.fileBase64, "base64"), { type: "buffer" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0] || ""];
        if (!firstSheet) throw new TRPCError({ code: "BAD_REQUEST", message: "The Excel file has no worksheet" });
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });
        if (!rows.length) throw new TRPCError({ code: "BAD_REQUEST", message: "The Excel sheet has no student rows" });
        let added = 0; let skipped = 0; const errors: string[] = [];
        for (let index = 0; index < rows.length; index += 1) {
          const row = rows[index];
          const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toLowerCase().replace(/[\s_-]/g, ""), String(value ?? "").trim()]));
          const studentId = normalized.studentid || normalized.id || "";
          const fullName = normalized.fullname || normalized.name || "";
          if (!studentId || !fullName || !normalized.email) { errors.push(`Row ${index + 2}: studentId, fullName, and email are required`); continue; }
          if (await getStudentByStudentId(studentId)) { skipped += 1; continue; }
          const semesterValue = normalized.semester ? Number(normalized.semester) : undefined;
          if (semesterValue !== undefined && (!Number.isInteger(semesterValue) || semesterValue < 1 || semesterValue > 8)) { errors.push(`Row ${index + 2}: semester must be between 1 and 8`); continue; }
          await createStudentRegistryRecord({ studentId, fullName, email: normalized.email || null, semester: semesterValue, department: normalized.department || "Information Technology", createdBy: ctx.user.id });
          added += 1;
        }
        return { added, skipped, errors };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only administrators can manage student IDs" });
        await deleteStudentRegistryRecord(input.id);
        return { success: true } as const;
      }),
  }),

  materials: router({
    list: publicProcedure
      .input(z.object({ subject: z.string().optional(), semester: z.number().int().min(1).max(8).optional() }).optional())
      .query(({ input }) => listStudyMaterials(input)),
    getById: publicProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(async ({ input }) => {
        const material = await getStudyMaterialById(input.id);
        if (!material) throw new TRPCError({ code: "NOT_FOUND", message: "Study material not found" });
        return material;
      }),
    upload: protectedProcedure
      .input(z.object({
        title: z.string().trim().min(2).max(255),
        subject: z.string().trim().min(2).max(120),
        semester: z.number().int().min(1).max(8),
        description: z.string().trim().min(10).max(5000),
        fileName: z.string().trim().min(1).max(255),
        mimeType: z.enum(["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]),
        fileBase64: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only administrators can upload materials" });
        const fileBuffer = Buffer.from(input.fileBase64, "base64");
        if (!fileBuffer.length) throw new TRPCError({ code: "BAD_REQUEST", message: "The uploaded file is empty" });
        const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
        const uploaded = await storagePut(`study-materials/${ctx.user.id}/${Date.now()}-${safeName}`, fileBuffer, input.mimeType);
        try {
          const id = await createStudyMaterial({
            title: input.title,
            subject: input.subject,
            semester: input.semester,
            description: input.description,
            fileUrl: uploaded.url,
            fileKey: uploaded.key,
            fileName: input.fileName,
            mimeType: input.mimeType,
            fileSize: fileBuffer.length,
            uploadedBy: ctx.user.id,
          });
          return { id };
        } catch (error) {
          await storageDelete(uploaded.key).catch(() => undefined);
          throw error;
        }
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only administrators can delete materials" });
        const material = await getStudyMaterialById(input.id);
        if (!material) throw new TRPCError({ code: "NOT_FOUND", message: "Study material not found" });
        await storageDelete(material.fileKey);
        await deleteStudyMaterial(material.id);
        return { success: true } as const;
      }),
  }),
});

export type AppRouter = typeof appRouter;
