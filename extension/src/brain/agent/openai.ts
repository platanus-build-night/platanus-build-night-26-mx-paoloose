// OpenAI-compatible consul brain — chat completions with tool use (BYOK).
// Works with OpenAI, Azure, and local proxies that expose the OpenAI chat format.

import type { ConsulTool, Turn } from "../../types.ts";
import type { Deliberate, DeliberationContext } from "./types.ts";
import { buildSystemPrompt } from "./prompt.ts";
import { neutralEmotion } from "../../shared/persona.ts";

const DEFAULT_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o";

const TOOL_NAMES = new Set<ConsulTool>([
  "say",
  "offer_stamp",
  "deny_entry",
  "start_break_activity",
  "create_activity",
  "switch_activity",
  "end_activity",
]);

function toOpenAITools(emotionCodes: string[]) {
  const message = {
    type: "string",
    description: "What you say to the traveler, in your persona's voice. One or two sentences.",
  };
  const emotion = {
    type: "string",
    enum: emotionCodes,
    description: "Your current emotion; pick by its declared criteria.",
  };
  const internalReason = {
    type: "string",
    description: "Short internal gatekeeping note. Never shown to the traveler.",
  };

  const defs = [
    {
      name: "say",
      description:
        "Speak to the traveler without making any decision yet — interrogate, react, push back.",
      parameters: { type: "object" as const, properties: { message, emotion }, required: ["message", "emotion"] },
    },
    {
      name: "offer_stamp",
      description: "Propose granting passage to the destination for a limited time and tab count.",
      parameters: {
        type: "object" as const,
        properties: {
          message,
          emotion,
          internalReason,
          durationMinutes: { type: "number", description: "Visa length in minutes." },
          maxTabs: { type: "number", description: "Max simultaneous tabs for this domain." },
        },
        required: ["message", "emotion", "internalReason", "durationMinutes", "maxTabs"],
      },
    },
    {
      name: "deny_entry",
      description: "Propose refusing passage. The traveler may comply or argue.",
      parameters: {
        type: "object" as const,
        properties: { message, emotion, internalReason },
        required: ["message", "emotion", "internalReason"],
      },
    },
    {
      name: "start_break_activity",
      description: "Propose a timed break. Switches the active Activity to the break for `minutes`.",
      parameters: {
        type: "object" as const,
        properties: {
          message,
          emotion,
          internalReason,
          minutes: { type: "number", description: "Break length in minutes." },
        },
        required: ["message", "emotion", "internalReason", "minutes"],
      },
    },
    {
      name: "create_activity",
      description: "Propose opening a new Activity. Becomes the single active Activity.",
      parameters: {
        type: "object" as const,
        properties: {
          message,
          emotion,
          internalReason,
          title: { type: "string" },
          description: { type: "string" },
        },
        required: ["message", "emotion", "internalReason", "title"],
      },
    },
    {
      name: "switch_activity",
      description: "Propose switching the active Activity to an existing one.",
      parameters: {
        type: "object" as const,
        properties: {
          message,
          emotion,
          internalReason,
          activityId: { type: "string" },
        },
        required: ["message", "emotion", "internalReason", "activityId"],
      },
    },
    {
      name: "end_activity",
      description: "Propose marking an Activity done.",
      parameters: {
        type: "object" as const,
        properties: {
          message,
          emotion,
          internalReason,
          activityId: { type: "string" },
        },
        required: ["message", "emotion", "internalReason", "activityId"],
      },
    },
  ];

  return defs.map((d) => ({ type: "function" as const, function: d }));
}

function validEmotion(ctx: DeliberationContext, raw: unknown): string {
  const code = typeof raw === "string" ? raw : "";
  return ctx.persona.emotions.some((e) => e.code === code) ? code : neutralEmotion(ctx.persona);
}

function buildOpenAIMessages(ctx: DeliberationContext, transcript: { author: "consul" | "user"; message: string }[]) {
  const seed =
    ctx.mode === "expiry"
      ? `The visa for ${ctx.domain} just expired and the traveler is still here.`
      : ctx.mode === "tablimit"
        ? `The traveler exceeded the tab limit on ${ctx.domain}.`
        : `The traveler has just arrived at the border, requesting passage to ${ctx.domain}.`;

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: buildSystemPrompt(ctx) },
    { role: "user", content: seed },
  ];
  for (const t of transcript) {
    messages.push({ role: t.author === "consul" ? "assistant" : "user", content: t.message });
  }
  return messages;
}

export function makeOpenAIDeliberate(
  apiKey: string,
  baseUrl?: string,
  model?: string,
): Deliberate {
  return async (ctx, transcript): Promise<Turn> => {
    const tools = toOpenAITools(ctx.persona.emotions.map((e) => e.code));
    const body = {
      model: model || DEFAULT_MODEL,
      max_tokens: 600,
      messages: buildOpenAIMessages(ctx, transcript),
      tools,
      tool_choice: "auto" as const,
    };

    const res = await fetch(baseUrl || DEFAULT_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{
            function?: { name?: string; arguments?: string };
          }>;
        };
      }>;
    };

    const choice = data.choices?.[0]?.message;
    const toolCall = choice?.tool_calls?.[0]?.function;

    if (!toolCall || !toolCall.name || !TOOL_NAMES.has(toolCall.name as ConsulTool)) {
      // Some compatible endpoints return plain text instead of tools — fall back to say
      const fallbackMsg =
        typeof choice?.content === "string" && choice.content
          ? choice.content
          : "I seem to have lost my train of thought. Let's continue.";
      return {
        tool: "say",
        message: fallbackMsg,
        emotion: validEmotion(ctx, ""),
        author: "consul",
        at: Date.now(),
      };
    }

    const args = JSON.parse(toolCall.arguments ?? "{}") as Record<string, unknown>;
    const { message, emotion, internalReason, ...params } = args;

    return {
      tool: toolCall.name as ConsulTool,
      message: typeof message === "string" ? message : "",
      emotion: validEmotion(ctx, emotion),
      internalReason: typeof internalReason === "string" ? internalReason : undefined,
      params: params as Record<string, unknown>,
      author: "consul",
      at: Date.now(),
    };
  };
}
