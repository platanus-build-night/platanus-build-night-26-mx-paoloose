import { NextResponse } from "next/server";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const PERSONAS_DIR = path.resolve(process.cwd(), "../personas");

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const personaDir = path.join(PERSONAS_DIR, id);

  try {
    const manifestRaw = await readFile(path.join(personaDir, "persona.json"), "utf-8");
    const manifest = JSON.parse(manifestRaw);

    const criteriaRaw = await readFile(path.join(personaDir, "emotions/emotions_criteria.json"), "utf-8");
    const emotionsCriteria = JSON.parse(criteriaRaw);

    // Read all emotion assets as base64 data URIs
    const assets: Record<string, string> = {};
    const emotionsDir = path.join(personaDir, "emotions");
    const emotionFiles = await readdir(emotionsDir);
    for (const file of emotionFiles) {
      if (file.endsWith(".json")) continue;
      const ext = path.extname(file).slice(1);
      const mime = ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "application/octet-stream";
      const buffer = await readFile(path.join(emotionsDir, file));
      assets[`emotions/${file}`] = `data:${mime};base64,${buffer.toString("base64")}`;
    }

    let themeCss: string | undefined;
    try {
      themeCss = await readFile(path.join(personaDir, "theme.css"), "utf-8");
    } catch {
      // optional
    }

    return NextResponse.json({
      manifest,
      emotionsCriteria,
      assets,
      themeCss,
    });
  } catch (err) {
    return NextResponse.json({ error: `Persona not found: ${String(err)}` }, { status: 404 });
  }
}
