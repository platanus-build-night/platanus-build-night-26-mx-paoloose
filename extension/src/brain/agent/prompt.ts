// Assembles the system prompt + message list for a deliberation.

import type { Turn } from "../../types.ts";
import type { DeliberationContext } from "./types.ts";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function buildSystemPrompt(ctx: DeliberationContext): string {
  const { persona } = ctx;

  const emotionLines = persona.emotions
    .map((e) => `  - ${e.code} (${e.name}): ${e.criteria}`)
    .join("\n");

  const examples = (persona.examples ?? [])
    .map((ex) => `  • Situation: ${ex.situation}\n    You say: "${ex.say}"`)
    .join("\n");

  const activity = ctx.activeActivity
    ? `"${ctx.activeActivity.title}"${
        ctx.activeActivity.description ? ` — ${ctx.activeActivity.description}` : ""
      }`
    : "(none yet — they have not declared what they're working on)";

  const visits = ctx.recentVisits.length
    ? ctx.recentVisits.map((v) => `  - ${v.domain}`).join("\n")
    : "  (no recent history on record)";

  const calendar =
    ctx.calendarEvents === null
      ? "  (calendar not connected)"
      : ctx.calendarEvents.length === 0
        ? "  (no events today)"
        : ctx.calendarEvents
            .map((e) => `  - ${e.title} (${e.start} → ${e.end})`)
            .join("\n");

  const situation =
    ctx.mode === "expiry"
      ? `The traveler's visa for ${ctx.domain} has just EXPIRED — they are still on the page. Confront them: time's up. They must leave, or make a real case for more.`
      : ctx.mode === "tablimit"
        ? `The traveler has opened too many tabs on ${ctx.domain}, past the limit you granted. Call it out; they may argue for a higher cap.`
        : `A traveler is at the border requesting passage to: ${ctx.domain} (${ctx.destUrl}).`;

  return `${persona.systemPrompt}

# Your situation right now
${situation}

Their current Activity (the one thing they're supposed to be doing): ${activity}
Recently visited territories:
${visits}

Today's calendar:
${calendar}

# How you must respond
You respond with EXACTLY ONE tool call per turn. This is an ask-answer checkpoint, not a chat:
- Use \`say\` to interrogate or react WITHOUT deciding. Prefer this first — find out why they're here, how long they need, and what they were doing before, before ruling.
- Use \`offer_stamp\` to propose granting passage (a time-bounded, tab-bounded visa).
- Use \`deny_entry\` to refuse.
- Use \`start_break_activity\` only for a genuinely earned break (never on the first ask).
- Use \`create_activity\` / \`switch_activity\` when the destination implies a different mission than the active one.
Keep \`message\` to one or two sentences, in voice. Always set \`emotion\`.

# Your emotions (choose by criteria)
${emotionLines}

# Voice examples
${examples || "  (none)"}`;
}

/**
 * Map the stored transcript to Anthropic messages. Each consul turn becomes an
 * assistant message (its spoken line); each user turn a user message. We seed an
 * opening user message so the first assistant turn is the greeting/interrogation.
 */
export function buildMessages(ctx: DeliberationContext, transcript: Turn[]): ChatMessage[] {
  const seed =
    ctx.mode === "expiry"
      ? `[The visa for ${ctx.domain} just expired and the traveler is still here. Open the confrontation.]`
      : ctx.mode === "tablimit"
        ? `[The traveler exceeded the tab limit on ${ctx.domain}. Open the confrontation.]`
        : `[The traveler has just arrived at the border, requesting passage to ${ctx.domain}. Greet them and begin.]`;
  const messages: ChatMessage[] = [{ role: "user", content: seed }];
  for (const t of transcript) {
    if (t.author === "consul") messages.push({ role: "assistant", content: t.message });
    else messages.push({ role: "user", content: t.message });
  }
  return messages;
}
