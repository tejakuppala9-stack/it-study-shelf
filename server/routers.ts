import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createStudyMaterial, deleteStudyMaterial, getStudyMaterialById, listStudyMaterials } from "./db";
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
        if (fileBuffer.length > 15 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "Files must be 15 MB or smaller" });
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
