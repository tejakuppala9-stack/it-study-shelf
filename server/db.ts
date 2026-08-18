import { and, count, desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertStudentRegistryRecord, InsertStudyMaterial, InsertUser, materialLikes, studentRegistry, studyMaterials, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function listStudyMaterials(filters?: { subject?: string; semester?: number; provider?: string }) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filters?.subject) conditions.push(eq(studyMaterials.subject, filters.subject));
  if (filters?.semester) conditions.push(eq(studyMaterials.semester, filters.semester));
  if (filters?.provider) conditions.push(eq(studyMaterials.provider, filters.provider));

  const materials = await db.select().from(studyMaterials).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(studyMaterials.createdAt));
  if (!materials.length) return materials;
  const counts = await db.select({ materialId: materialLikes.materialId, likes: count(materialLikes.id) }).from(materialLikes).where(inArray(materialLikes.materialId, materials.map(material => material.id))).groupBy(materialLikes.materialId);
  const countMap = new Map(counts.map(row => [row.materialId, Number(row.likes)]));
  return materials.map(material => ({ ...material, likeCount: countMap.get(material.id) || 0 }));
}

export async function getStudyMaterialById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(studyMaterials).where(eq(studyMaterials.id, id)).limit(1);
  if (!result[0]) return undefined;
  const [likes] = await db.select({ likes: count(materialLikes.id) }).from(materialLikes).where(eq(materialLikes.materialId, id));
  return { ...result[0], likeCount: Number(likes?.likes || 0) };
}

export async function createStudyMaterial(material: InsertStudyMaterial) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(studyMaterials).values(material);
  return Number(result[0].insertId);
}

export async function deleteStudyMaterial(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(materialLikes).where(eq(materialLikes.materialId, id));
  await db.delete(studyMaterials).where(eq(studyMaterials.id, id));
}

export async function toggleStudyMaterialLike(materialId: number, actorKey: string, userId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const existing = await db.select().from(materialLikes).where(and(eq(materialLikes.materialId, materialId), eq(materialLikes.actorKey, actorKey))).limit(1);
  if (existing[0]) await db.delete(materialLikes).where(eq(materialLikes.id, existing[0].id));
  else await db.insert(materialLikes).values({ materialId, userId: userId ?? null, actorKey });
  const [likes] = await db.select({ likes: count(materialLikes.id) }).from(materialLikes).where(eq(materialLikes.materialId, materialId));
  return { liked: !existing[0], likeCount: Number(likes?.likes || 0) };
}

export async function listStudentRegistry() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(studentRegistry).orderBy(desc(studentRegistry.createdAt));
}

export async function getStudentByStudentId(studentId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(studentRegistry).where(eq(studentRegistry.studentId, studentId)).limit(1);
  return result[0];
}

export async function createStudentRegistryRecord(record: InsertStudentRegistryRecord) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(studentRegistry).values(record);
  return Number(result[0].insertId);
}

export async function deleteStudentRegistryRecord(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(studentRegistry).where(eq(studentRegistry.id, id));
}
