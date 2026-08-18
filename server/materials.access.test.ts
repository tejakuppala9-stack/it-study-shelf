import { beforeEach, describe, expect, it, vi } from "vitest";
import { beforeAll } from "vitest";
import { SignJWT } from "jose";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const storedMaterials: any[] = [];
const deletedKeys: string[] = [];
const likeState = new Set<string>();
let adminCookie = "";
beforeAll(async () => { adminCookie = await new SignJWT({ purpose: "admin-portal" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.JWT_SECRET)); });
let nextId = 1;

vi.mock("./storage", () => ({
  storagePut: vi.fn(async (key: string) => ({ key, url: `/manus-storage/${key}` })),
  storageDelete: vi.fn(async (key: string) => { deletedKeys.push(key); }),
}));

vi.mock("./db", () => ({
  listStudyMaterials: vi.fn(async (filters?: { subject?: string; semester?: number }) => storedMaterials.filter(material => (!filters?.subject || material.subject === filters.subject) && (!filters?.semester || material.semester === filters.semester))),
  getStudyMaterialById: vi.fn(async (id: number) => storedMaterials.find(material => material.id === id)),
  createStudyMaterial: vi.fn(async (material: any) => { const id = nextId++; storedMaterials.push({ ...material, id }); return id; }),
  deleteStudyMaterial: vi.fn(async (id: number) => { const index = storedMaterials.findIndex(material => material.id === id); if (index >= 0) storedMaterials.splice(index, 1); }),
  toggleStudyMaterialLike: vi.fn(async (materialId: number, actorKey: string) => { const key = `${materialId}:${actorKey}`; if (likeState.has(key)) { likeState.delete(key); return { liked: false, likeCount: 0 }; } likeState.add(key); return { liked: true, likeCount: 1 }; }),
}));

function contextFor(role: "user" | "admin"): TrpcContext {
  return {
    user: { id: role === "admin" ? 2 : 1, openId: `${role}-open-id`, email: `${role}@example.com`, name: role === "admin" ? "Admin" : "Student", loginMethod: "manus", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: role === "admin" ? { cookie: `studyshelf_admin_access=${adminCookie}` } : {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const uploadInput = (title: string, subject: string, semester: number, academicYear = 1) => ({
  title,
  subject,
  semester,
  academicYear,
  description: `A detailed ${title} resource for semester ${semester}.`,
  fileName: `${title.toLowerCase().replaceAll(" ", "-")}.pdf`,
  mimeType: "application/pdf" as const,
  fileBase64: "aGVsbG8=",
});

describe("materials persistence and role access", () => {
  beforeEach(() => { storedMaterials.length = 0; deletedKeys.length = 0; likeState.clear(); nextId = 1; });

  it("keeps multiple sequential admin uploads in the library", async () => {
    const caller = appRouter.createCaller(contextFor("admin"));
    await caller.materials.upload(uploadInput("Data Structures Notes", "Data Structures", 2));
    await caller.materials.upload(uploadInput("Routing Fundamentals", "Networking", 1, 2));
    await caller.materials.upload(uploadInput("Process Scheduling", "OS", 2, 3));
    const all = await caller.materials.list();
    expect(all).toHaveLength(3);
    expect(all.map(material => material.title)).toEqual(["Data Structures Notes", "Routing Fundamentals", "Process Scheduling"]);
  });

  it("preserves uploaded records through filtered reads until admin deletion", async () => {
    const caller = appRouter.createCaller(contextFor("admin"));
    const created = await caller.materials.upload(uploadInput("Network Security Guide", "Networking", 2, 3));
    const filtered = await caller.materials.list({ subject: "Networking", semester: 2 });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.title).toBe("Network Security Guide");
    await caller.materials.delete({ id: created.id });
    expect(await caller.materials.list()).toHaveLength(0);
    expect(deletedKeys).toHaveLength(1);
  });

  it("denies students from uploading or deleting", async () => {
    const caller = appRouter.createCaller(contextFor("user"));
    await expect(caller.materials.upload(uploadInput("Student upload", "OS", 2))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.materials.delete({ id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("supports repeated admin like and unlike toggles with count changes", async () => {
    const caller = appRouter.createCaller(contextFor("admin"));
    const liked = await caller.materials.like({ id: 1 });
    const unliked = await caller.materials.like({ id: 1 });
    expect(liked).toEqual({ liked: true, likeCount: 1 });
    expect(unliked).toEqual({ liked: false, likeCount: 0 });
  });

  it("rejects invalid semester and academic year input before reaching storage", async () => {
    const caller = appRouter.createCaller(contextFor("admin"));
    await expect(caller.materials.upload(uploadInput("Invalid semester", "OS", 3))).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.materials.upload({ ...uploadInput("Invalid year", "OS", 1), academicYear: 5 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(storedMaterials).toHaveLength(0);
  });
});
