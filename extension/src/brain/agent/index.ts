// Picks the consul implementation: real Claude / OpenAI when a BYOK key is present,
// the deterministic mock otherwise (so the demo always works).

import type { Settings } from "../../types.ts";
import type { Deliberate } from "./types.ts";
import { deliberateMock } from "./mock.ts";
import { makeClaudeDeliberate } from "./claude.ts";
import { makeOpenAIDeliberate } from "./openai.ts";

export type { DeliberationContext, Deliberate } from "./types.ts";

export function deliberatorFor(settings: Settings): Deliberate {
  if (!settings.apiKey?.trim()) {
    return deliberateMock;
  }
  const key = settings.apiKey.trim();
  if (settings.provider === "openai-compatible") {
    return makeOpenAIDeliberate(key, settings.apiBaseUrl ?? undefined, settings.model ?? undefined);
  }
  // anthropic or anthropic-compatible
  return makeClaudeDeliberate(key, settings.apiBaseUrl ?? undefined, settings.model ?? undefined);
}

export const isMock = (settings: Settings): boolean => !settings.apiKey?.trim();
