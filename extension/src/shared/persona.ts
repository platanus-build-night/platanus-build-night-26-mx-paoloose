// Loads a persona package (folder or IndexedDB) into a resolved Persona object.
// Used by both the brain and the UI. M5: installed personas live in IndexedDB;
// bundled personas ship inside the extension at dist/personas/<id>/.

import type { Persona, EmotionDef, PersonaExample, WelcomeLine } from "../types.ts";
import { listInstalledPersonas, getInstalledPersona, storePersona } from "../brain/state-personas.ts";
import { SERVER_URL } from "./env.ts";

interface PersonaJson {
  id: string;
  name: string;
  tagline?: string;
  origin?: string;
  author?: string;
  version?: string;
  description?: string;
  default_emotion?: string;
  systemPrompt: string;
  examples?: PersonaExample[];
  welcome_dialog?: WelcomeLine[];
  metadata?: Record<string, unknown>;
}

interface EmotionsCriteriaJson {
  emotions: Array<{ code: string; name: string; asset: string; criteria: string }>;
}

function packagedBaseUrl(personaId: string): string {
  return chrome.runtime.getURL(`assets/personas/${personaId}/`);
}

export interface PersonaSummary {
  id: string;
  name: string;
}

export interface PersonaMarketplaceItem {
  id: string;
  name: string;
  description?: string;
  author?: string;
}

/** Merge installed (IndexedDB) + bundled personas. */
export async function listPersonas(): Promise<PersonaSummary[]> {
  const installed = (await listInstalledPersonas()).map((p) => ({ id: p.id, name: p.name }));
  try {
    const res = await fetch(chrome.runtime.getURL("assets/personas/index.json"));
    if (!res.ok) return installed;
    const bundled = (await res.json()) as PersonaSummary[];
    // installed wins on id collision
    const map = new Map<string, PersonaSummary>();
    for (const b of bundled) map.set(b.id, b);
    for (const i of installed) map.set(i.id, i);
    return Array.from(map.values());
  } catch {
    return installed;
  }
}

/** List all bundled personas with full metadata for the marketplace. */
export async function listMarketplacePersonas(): Promise<PersonaMarketplaceItem[]> {
  try {
    const res = await fetch(chrome.runtime.getURL("assets/personas/index.json"));
    if (!res.ok) return [];
    return (await res.json()) as PersonaMarketplaceItem[];
  } catch {
    return [];
  }
}

/** Resolve a persona from IndexedDB first, then bundled dist. */
export async function loadPersona(personaId: string): Promise<Persona> {
  const installed = await getInstalledPersona(personaId);
  if (installed) {
    return resolveInstalled(installed);
  }
  return loadBundled(personaId);
}

function resolveInstalled(installed: Awaited<ReturnType<typeof getInstalledPersona>>): Persona {
  if (!installed) throw new Error("persona not found");
  const manifest = installed.manifest as PersonaJson;
  const criteria = installed.emotionsCriteria as EmotionsCriteriaJson;

  const emotions: EmotionDef[] = criteria.emotions.map((e) => ({
    code: e.code,
    name: e.name,
    asset: installed.assets[e.asset] ?? installed.assets[`emotions/${e.asset}`] ?? "",
    criteria: e.criteria,
  }));

  return {
    id: manifest.id,
    name: manifest.name,
    tagline: manifest.tagline,
    origin: manifest.origin,
    author: manifest.author,
    version: manifest.version,
    description: manifest.description,
    defaultEmotion: manifest.default_emotion,
    systemPrompt: manifest.systemPrompt,
    examples: manifest.examples,
    welcomeDialog: manifest.welcome_dialog,
    emotions,
    themeCss: installed.themeCss,
    metadata: manifest.metadata,
  };
}

async function loadBundled(personaId: string): Promise<Persona> {
  const base = packagedBaseUrl(personaId);

  const personaJson = (await (await fetch(base + "persona.json")).json()) as PersonaJson;
  const criteria = (await (
    await fetch(base + "emotions/emotions_criteria.json")
  ).json()) as EmotionsCriteriaJson;

  const emotions: EmotionDef[] = criteria.emotions.map((e) => ({
    code: e.code,
    name: e.name,
    asset: base + e.asset,
    criteria: e.criteria,
  }));

  let themeCss: string | undefined;
  try {
    const res = await fetch(base + "theme.css");
    if (res.ok) themeCss = await res.text();
  } catch {
    // theme.css is optional
  }

  return {
    id: personaJson.id,
    name: personaJson.name,
    tagline: personaJson.tagline,
    origin: personaJson.origin,
    author: personaJson.author,
    version: personaJson.version,
    description: personaJson.description,
    defaultEmotion: personaJson.default_emotion,
    systemPrompt: personaJson.systemPrompt,
    examples: personaJson.examples,
    welcomeDialog: personaJson.welcome_dialog,
    emotions,
    themeCss,
    metadata: personaJson.metadata,
  };
}

/** Fetch a persona package from the server by ID and store it locally. */
export async function installPersonaById(personaId: string): Promise<void> {
  const res = await fetch(`${SERVER_URL}/api/personas/${personaId}/package`);
  if (!res.ok) throw new Error(`Failed to fetch persona: ${res.status}`);

  const pkg = (await res.json()) as {
    manifest: PersonaJson;
    emotionsCriteria: EmotionsCriteriaJson;
    assets: Record<string, string>;
    themeCss?: string;
  };

  // Validate: every declared emotion must have an asset present
  for (const e of pkg.emotionsCriteria.emotions) {
    const key = e.asset.startsWith("emotions/") ? e.asset : `emotions/${e.asset}`;
    if (!pkg.assets[key]) {
      throw new Error(`Persona package missing asset for emotion "${e.code}" (${e.asset})`);
    }
  }

  await storePersona({
    id: pkg.manifest.id,
    name: pkg.manifest.name,
    manifest: pkg.manifest,
    emotionsCriteria: pkg.emotionsCriteria,
    assets: pkg.assets,
    themeCss: pkg.themeCss,
    installedAt: Date.now(),
  });
}

/** The emotion code to fall back to when the agent emits an undeclared one. */
export function neutralEmotion(persona: Persona): string {
  if (persona.defaultEmotion && persona.emotions.some((e) => e.code === persona.defaultEmotion)) {
    return persona.defaultEmotion;
  }
  const preferred = persona.emotions.find((e) => /curious|neutral|calm/i.test(e.code));
  return (preferred ?? persona.emotions[0])?.code ?? "neutral";
}

/** The resting/idle emotion to show when the consul is silent (popup, corner). */
export function restEmotion(persona: Persona): string {
  return neutralEmotion(persona);
}

/** The asset URL for a given emotion code (falls back to the resting emotion). */
export function spriteFor(persona: Persona, emotionCode: string): string | undefined {
  const match = persona.emotions.find((e) => e.code === emotionCode);
  const rest = persona.emotions.find((e) => e.code === restEmotion(persona));
  return (match ?? rest ?? persona.emotions[0])?.asset;
}
