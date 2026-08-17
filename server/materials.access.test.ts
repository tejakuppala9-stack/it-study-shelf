import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function contextFor(role: "user" | "admin"): TrpcContext {
  return {
    user: {
      id: role === "admin" ? 2 : 1,
      openId: `${role}-open-id`,
      email: `${role}@example.com`,
      name: role === "admin" ? "Admin" : "Student",
      loginMethod: "manus",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("materials role access", () => {
  it("returns a material list for a valid subject filter", async () => {
    const caller = appRouter.createCaller(contextFor("user"));
    const result = await caller.materials.list({ subject: "OS", semester: 2 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("returns not found for a missing material detail", async () => {
    const caller = appRouter.createCaller(contextFor("user"));
    await expect(caller.materials.getById({ id: 999999 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects invalid semester input before reaching storage", async () => {
    const caller = appRouter.createCaller(contextFor("admin"));
    await expect(caller.materials.upload({
      title: "Invalid semester",
      subject: "OS",
      semester: 9,
      description: "A valid description that should fail validation.",
      fileName: "notes.pdf",
      mimeType: "application/pdf",
      fileBase64: "aGVsbG8=",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("denies students from uploading", async () => {
    const caller = appRouter.createCaller(contextFor("user"));
    await expect(caller.materials.upload({
      title: "Student upload",
      subject: "OS",
      semester: 2,
      description: "A valid description for a test upload.",
      fileName: "notes.pdf",
      mimeType: "application/pdf",
      fileBase64: "dGVzdA==",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies students from deleting", async () => {
    const caller = appRouter.createCaller(contextFor("user"));
    await expect(caller.materials.delete({ id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows admins past role gating before validating the record", async () => {
    const caller = appRouter.createCaller(contextFor("admin"));
    await expect(caller.materials.delete({ id: 999999 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
