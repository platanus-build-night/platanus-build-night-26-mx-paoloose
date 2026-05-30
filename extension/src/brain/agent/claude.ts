// Real consul brain — Anthropic Messages API with tool use (BYOK).
// Each turn forces exactly one tool call, which we map to a Turn.

import type { ConsulTool, Turn } from "../../types.ts";
import type { Deliberate, DeliberationContext } from "./types.ts";
import { buildTools } from "./tools.ts";
import { buildMessages, buildSystemPrompt } from "./prompt.ts";
import { neutralEmotion } from "../../shared/persona.ts";

const DEFAULT_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-haiku-4-5-20251001"; // fast: the page is blocked while we wait
const TOOL_NAMES = new Set<ConsulTool>([
  "say",
  "offer_stamp",
  "deny_entry",
  "start_break_activity",
  "create_activity",
  "switch_activity",
  "end_activity",
]);

interface ToolUseBlock {
  type: "tool_use";
  name: string;
  input: Record<string, unknown>;
}

function validEmotion(ctx: DeliberationContext, raw: unknown): string {
  const code = typeof raw === "string" ? raw : "";
  return ctx.persona.emotions.some((e) => e.code === code) ? code : neutralEmotion(ctx.persona);
}

export function makeClaudeDeliberate(
  apiKey: string,
  baseUrl?: string,
  model?: string,
): Deliberate {
  return async (ctx, transcript): Promise<Turn> => {
    const tools = buildTools(ctx.persona.emotions.map((e) => e.code));
    const body = {
      model: model || DEFAULT_MODEL,
      max_tokens: 600,
      system: buildSystemPrompt(ctx),
      messages: buildMessages(ctx, transcript),
      tools,
      tool_choice: { type: "any" as const },
    };

    const res = await fetch(baseUrl || DEFAULT_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as { content?: unknown[] };
    const block = (data.content ?? []).find(
      (b): b is ToolUseBlock =>
        typeof b === "object" && b !== null && (b as { type?: string }).type === "tool_use",
    );
    if (!block || !TOOL_NAMES.has(block.name as ConsulTool)) {
      throw new Error("consul returned no valid tool call");
    }

    const { message, emotion, internalReason, ...params } = block.input;
    return {
      tool: block.name as ConsulTool,
      message: typeof message === "string" ? message : "",
      emotion: validEmotion(ctx, emotion),
      internalReason: typeof internalReason === "string" ? internalReason : undefined,
      params: params as Record<string, unknown>,
      author: "consul",
      at: Date.now(),
    };
  };
}
