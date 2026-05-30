// Persona installation state — stores downloaded/loaded persona packages in IndexedDB.

import { db } from "./db.ts";
import type { InstalledPersona } from "./db.ts";

export async function listInstalledPersonas(): Promise<InstalledPersona[]> {
  return (await db()).getAll("personas");
}

export async function getInstalledPersona(id: string): Promise<InstalledPersona | undefined> {
  return (await db()).get("personas", id);
}

export async function storePersona(persona: InstalledPersona): Promise<void> {
  await (await db()).put("personas", persona);
}

export async function removePersona(id: string): Promise<void> {
  await (await db()).delete("personas", id);
}
