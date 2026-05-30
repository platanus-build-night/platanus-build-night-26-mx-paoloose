import { NextResponse } from "next/server";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const PERSONAS_DIR = path.resolve(process.cwd(), "../personas");

export async function GET() {
  try {
    const dirs = await readdir(PERSONAS_DIR, { withFileTypes: true });
    const personas = [];
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      const manifestPath = path.join(PERSONAS_DIR, d.name, "persona.json");
      try {
        const raw = await readFile(manifestPath, "utf-8");
        const manifest = JSON.parse(raw) as { id: string; name: string; description?: string };
        personas.push({
          id: manifest.id,
          name: manifest.name,
          description: manifest.description,
        });
      } catch {
        // skip invalid / empty folders
      }
    }
    return NextResponse.json({ personas });
  } catch {
    return NextResponse.json({ personas: [] });
  }
}
