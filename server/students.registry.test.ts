import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const records: any[] = [];
let nextId = 1;

vi.mock("./db", () => ({
  listStudentRegistry: vi.fn(async () => records),
  getStudentByStudentId: vi.fn(async (studentId: string) => records.find(record => record.studentId === studentId)),
  createStudentRegistryRecord: vi.fn(async (record: any) => { const id = nextId++; records.push({ ...record, id }); return id; }),
  deleteStudentRegistryRecord: vi.fn(async (id: number) => { const index = records.findIndex(record => record.id === id); if (index >= 0) records.splice(index, 1); }),
  listStudyMaterials: vi.fn(async () => []),
  getStudyMaterialById: vi.fn(async () => undefined),
  createStudyMaterial: vi.fn(async () => 1),
  deleteStudyMaterial: vi.fn(async () => undefined),
}));

vi.mock("./storage", () => ({ storagePut: vi.fn(), storageDelete: vi.fn() }));

function contextFor(role: "user" | "admin"): TrpcContext {
  return {     user: { id: role === "admin" ? 2 : 1, openId: role, email: role === "admin" ? "admin@example.com" : "asha@example.com", name: role, loginMethod: "manus", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

function excelBase64(rows: Record<string, unknown>[]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "Students");
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })).toString("base64");
}

describe("student registry", () => {
  beforeEach(() => { records.length = 0; nextId = 1; });

  it("persists a single registered student and verifies the ID", async () => {
    const admin = appRouter.createCaller(contextFor("admin"));
    await admin.students.add({ studentId: "IT-001", fullName: "Asha Rao", email: "asha@example.com", semester: 3, department: "Information Technology" });
    const student = appRouter.createCaller(contextFor("user"));
    await expect(student.students.verify({ studentId: "IT-001" })).resolves.toMatchObject({ verified: true, fullName: "Asha Rao" });
  });

  it("imports valid Excel rows, skips duplicates, and reports invalid rows", async () => {
    const admin = appRouter.createCaller(contextFor("admin"));
    const result = await admin.students.importExcel({ fileName: "students.xlsx", fileBase64: excelBase64([{ studentId: "IT-002", fullName: "Mina Shah", email: "mina@example.com", semester: 2 }, { studentId: "IT-002", fullName: "Duplicate", email: "mina@example.com", semester: 2 }, { studentId: "IT-003", fullName: "Invalid Semester", email: "invalid@example.com", semester: 9 }]) });
    expect(result).toMatchObject({ added: 1, skipped: 1 });
    expect(result.errors).toHaveLength(1);
    expect(records).toHaveLength(1);
  });

  it("keeps IDs until admin deletion and blocks unregistered students", async () => {
    const admin = appRouter.createCaller(contextFor("admin"));
    const created = await admin.students.add({ studentId: "IT-004", fullName: "Nikhil Das", email: "nikhil@example.com", semester: 4, department: "Information Technology" });
    const student = appRouter.createCaller(contextFor("user"));
    await expect(student.students.verify({ studentId: "UNKNOWN" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await admin.students.delete({ id: created.id });
    await expect(student.students.verify({ studentId: "IT-004" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("prevents students from managing the registry", async () => {
    const student = appRouter.createCaller(contextFor("user"));
    await expect(student.students.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(student.students.add({ studentId: "IT-005", fullName: "Blocked User", email: "blocked@example.com", semester: 1, department: "Information Technology" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
