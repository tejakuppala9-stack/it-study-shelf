import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function adminContext() {
  const ctx: TrpcContext = {
    user: { id: 1, openId: "admin", email: "admin@example.com", name: "Admin", loginMethod: "manus", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { cookie: (_name: string, value: string) => { ctx.req.headers.cookie = `studyshelf_admin_access=${value}`; }, clearCookie: () => undefined } as TrpcContext["res"],
  };
  return ctx;
}

describe("auth.verifyAdminPassword", () => {
  it("accepts the configured temporary admin password and unlocks admin procedures", async () => {
    const ctx = adminContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.auth.verifyAdminPassword({ password: "admin1234" })).resolves.toEqual({ verified: true });
    await expect(caller.students.list()).resolves.toBeInstanceOf(Array);
  });

  it("rejects an incorrect password and blocks admin procedures without an access cookie", async () => {
    const ctx = adminContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.auth.verifyAdminPassword({ password: "wrong-password" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.students.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
