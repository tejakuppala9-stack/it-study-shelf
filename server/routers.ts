import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as XLSX from "xlsx";
import { parse as parseCookie } from "cookie";
import { SignJWT, jwtVerify } from "jose";
import { createStudyMaterial, createStudentRegistryRecord, deleteStudyMaterial, deleteStudentRegistryRecord, getStudyMaterialById, getStudentByStudentId, listStudyMaterials, listStudentRegistry, toggleStudyMaterialLike } from "./db";
import { storagePut } from "./storage";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import type { User } from "../drizzle/schema";

const ADMIN_ACCESS_COOKIE = "studyshelf_admin_access";
const STUDENT_ACCESS_COOKIE = "studyshelf_student_access";
const passwordAdminUser = (): User => {
  const now = new Date();
  return { id: 0, openId: "studyshelf-password-admin", name: "Administrator", email: null, loginMethod: "password", role: "admin", createdAt: now, updatedAt: now, lastSignedIn: now };
};
const getPasswordAdmin = async (ctx: { req: any }) => {
  const token = parseCookie(ctx.req.headers.cookie || "")[ADMIN_ACCESS_COOKIE];
  if (!token || !process.env.JWT_SECRET) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET), { algorithms: ["HS256"] });
    if (payload.purpose !== "admin-portal") return null;
    return passwordAdminUser();
  } catch {
    return null;
  }
};
const adminPortalProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (ctx.user && ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Administrator access required" });
  const admin = await getPasswordAdmin(ctx);
  if (!admin) throw new TRPCError({ code: "UNAUTHORIZED", message: "Admin Portal password required" });
  return next({ ctx: { ...ctx, user: admin } });
});

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(async opts => (await getPasswordAdmin(opts.ctx)) || opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      ctx.res.clearCookie(ADMIN_ACCESS_COOKIE, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
    verifyAdminPassword: publicProcedure
      .input(z.object({ password: z.string().min(1).max(128) }))
      .mutation(async ({ input, ctx }) => {
        if (!process.env.ADMIN_PORTAL_PASSWORD || input.password !== process.env.ADMIN_PORTAL_PASSWORD) throw new TRPCError({ code: "UNAUTHORIZED", message: "Incorrect administrator password" });
        const token = await new SignJWT({ purpose: "admin-portal" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.JWT_SECRET));
        (ctx.res as any).cookie(ADMIN_ACCESS_COOKIE, token, { httpOnly: true, secure: true, sameSite: "none", maxAge: 60 * 60 * 1000, path: "/" });
        return { verified: true } as const;
      }),
  }),

  students: router({
    list: adminPortalProcedure.query(({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only administrators can manage student IDs" });
      return listStudentRegistry();
    }),
    verifyPublic: publicProcedure
      .input(z.object({ studentId: z.string().trim().min(2).max(100) }))
      .query(async ({ input, ctx }) => {
        const student = await getStudentByStudentId(input.studentId);
        if (!student) throw new TRPCError({ code: "UNAUTHORIZED", message: "That Student ID is not registered by the administrator" });
        if (process.env.JWT_SECRET) {
          const token = await new SignJWT({ purpose: "student-portal", studentId: student.studentId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d").sign(new TextEncoder().encode(process.env.JWT_SECRET));
          (ctx.res as any).cookie(STUDENT_ACCESS_COOKIE, token, { httpOnly: true, secure: true, sameSite: "none", maxAge: 30 * 24 * 60 * 60 * 1000, path: "/" });
        }
        return { verified: true, studentId: student.studentId };
      }),
    verify: protectedProcedure
      .input(z.object({ studentId: z.string().trim().min(2).max(100) }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role === "admin") return { verified: true, studentId: input.studentId };
        const student = await getStudentByStudentId(input.studentId);
        if (!student) throw new TRPCError({ code: "UNAUTHORIZED", message: "That student ID is not registered by the administrator" });
        return { verified: true, studentId: student.studentId, fullName: student.fullName };
      }),
    add: adminPortalProcedure
      .input(z.object({ studentId: z.string().trim().min(2).max(100), fullName: z.string().trim().min(2).max(255), email: z.string().email().optional(), semester: z.number().int().min(1).max(8).optional(), year: z.number().int().min(1).max(4), department: z.string().trim().min(2).max(160) }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only administrators can manage student IDs" });
        if (await getStudentByStudentId(input.studentId)) throw new TRPCError({ code: "CONFLICT", message: "That student ID is already registered" });
        const id = await createStudentRegistryRecord({ ...input, email: input.email ?? null, createdBy: ctx.user.id });
        return { id };
      }),
    importExcel: adminPortalProcedure
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
          if (!studentId || !fullName || !(normalized.branch || normalized.department) || !normalized.year) { errors.push(`Row ${index + 2}: studentId, fullName, branch, and year are required`); continue; }
          if (await getStudentByStudentId(studentId)) { skipped += 1; continue; }
          const semesterValue = normalized.semester ? Number(normalized.semester) : undefined;
          const yearValue = normalized.year ? Number(normalized.year) : undefined;
          if (semesterValue !== undefined && (!Number.isInteger(semesterValue) || semesterValue < 1 || semesterValue > 2)) { errors.push(`Row ${index + 2}: semester must be 1 or 2`); continue; }
          if (yearValue !== undefined && (!Number.isInteger(yearValue) || yearValue < 1 || yearValue > 4)) { errors.push(`Row ${index + 2}: year must be between 1 and 4`); continue; }
          await createStudentRegistryRecord({ studentId, fullName, email: normalized.email || null, semester: semesterValue, year: yearValue, department: normalized.branch || normalized.department || "Information Technology", createdBy: ctx.user.id });
          added += 1;
        }
        return { added, skipped, errors };
      }),
    delete: adminPortalProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        await deleteStudentRegistryRecord(input.id);
        return { success: true } as const;
      }),
  }),

  materials: router({
    like: publicProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user?.role === "admin") return toggleStudyMaterialLike(input.id, `admin:${ctx.user.id}`, ctx.user.id);
        const token = parseCookie(ctx.req.headers.cookie || "")[STUDENT_ACCESS_COOKIE];
        if (!token || !process.env.JWT_SECRET) throw new TRPCError({ code: "UNAUTHORIZED", message: "Verify your Student ID before liking materials" });
        try {
          const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET), { algorithms: ["HS256"] });
          if (payload.purpose !== "student-portal" || typeof payload.studentId !== "string") throw new Error("Invalid student session");
          return toggleStudyMaterialLike(input.id, `student:${payload.studentId}`);
        } catch {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Verify your Student ID before liking materials" });
        }
      }),
    list: publicProcedure
      .input(z.object({ subject: z.string().optional(), semester: z.number().int().min(1).max(2).optional(), provider: z.string().trim().max(255).optional() }).optional())
      .query(({ input }) => listStudyMaterials(input)),
    getById: publicProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(async ({ input }) => {
        const material = await getStudyMaterialById(input.id);
        if (!material) throw new TRPCError({ code: "NOT_FOUND", message: "Study material not found" });
        return material;
      }),
    upload: adminPortalProcedure
      .input(z.object({
        title: z.string().trim().min(2).max(255),
        subject: z.string().trim().min(2).max(120),
        semester: z.number().int().min(1).max(2),
        academicYear: z.number().int().min(1).max(4),
        provider: z.string().trim().min(2).max(255),
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
            academicYear: input.academicYear,
            provider: input.provider,
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
          // The storage service has no supported delete endpoint. The failed database write is surfaced;
          // the uploaded object remains unreachable because no material record references it.
          throw error;
        }
      }),
    delete: adminPortalProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const material = await getStudyMaterialById(input.id);
        if (!material) throw new TRPCError({ code: "NOT_FOUND", message: "Study material not found" });
        // The storage service does not expose a supported object-delete endpoint.
        // Removing the database record immediately revokes all application access to this file.
        await deleteStudyMaterial(material.id);
        return { success: true } as const;
      }),
  }),
});

export type AppRouter = typeof appRouter;
