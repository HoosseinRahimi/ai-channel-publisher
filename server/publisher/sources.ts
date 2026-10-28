import { eq } from "drizzle-orm";
import { publisherSources } from "../../drizzle/schema";
import { requireDb } from "../db";
import { validatePublisherSource, type SourceInput } from "./editorial";

export async function createPublisherSource(input: SourceInput) {
  const db = await requireDb();
  const source = validatePublisherSource(input);
  const inserted = await db.insert(publisherSources).values(source);
  return { id: Number(inserted[0].insertId) };
}

export async function updatePublisherSource(id: number, input: SourceInput) {
  const db = await requireDb();
  const source = validatePublisherSource(input);
  const result = await db.update(publisherSources).set(source).where(eq(publisherSources.id, id));
  if (!result[0].affectedRows) throw new Error("Source not found.");
  return { id };
}

export async function setPublisherSourceActive(id: number, active: boolean) {
  const db = await requireDb();
  const result = await db.update(publisherSources).set({ isActive: active }).where(eq(publisherSources.id, id));
  if (!result[0].affectedRows) throw new Error("Source not found.");
  return { id, active };
}
