// Checkpoint ritual orchestration: run the consul turn-by-turn and commit
// accepted proposals to state.

import type { Stamp } from "../types.ts";
import type { BrainResponse, OverlayMode } from "../ui/shared/messaging.ts";
import { deliberatorFor, type DeliberationContext } from "./agent/index.ts";
import { isProposal } from "./agent/tools.ts";
import { getSettings } from "./settings.ts";
import { loadPersona } from "../shared/persona.ts";
import { fetchTodayCalendar } from "./connectors/calendar.ts";
import {
  appendTurn,
  createSession,
  firstIntent,
  getSession,
  putSession,
  type CheckpointSession,
} from "./session.ts";
import {
  createActivity,
  endActivity,
  ensureActiveActivity,
  getActiveActivity,
  getOrCreateBreakActivity,
  newId,
  now,
  recentVisits,
  recordVisit,
  setActiveActivity,
  writeStamp,
} from "./state.ts";

async function buildContext(session: CheckpointSession): Promise<DeliberationContext> {
  const settings = await getSettings();
  const persona = await loadPersona(session.personaId || settings.personaId);
  return {
    destUrl: session.destUrl,
    domain: session.domain,
    mode: session.mode,
    persona,
    activeActivity: await getActiveActivity(),
    recentVisits: await recentVisits(8),
    calendarEvents: await fetchTodayCalendar(),
  };
}

async function nextConsulTurn(session: CheckpointSession): Promise<CheckpointSession> {
  const settings = await getSettings();
  const ctx = await buildContext(session);
  const deliberate = deliberatorFor(settings);
  let turn;
  try {
    turn = await deliberate(ctx, session.transcript);
  } catch (err) {
    // Fail-open (spec §10): a backend hiccup must never trap the traveler.
    console.error("[web-passport] deliberation failed, failing open:", err);
    turn = {
      tool: "offer_stamp" as const,
      message:
        "My ledger is smudged and I can't think clearly right now — take ten minutes, and we'll talk properly when I've recovered.",
      emotion: ctx.persona.emotions[0]?.code ?? "",
      internalReason: "fail-open: deliberation error",
      params: { durationMinutes: 10, maxTabs: 3 },
      author: "consul" as const,
      at: now(),
    };
  }
  return appendTurn(session, turn);
}

export async function startCheckpoint(
  dest: string,
  domain: string,
  tabId: number | null,
  mode: OverlayMode = "entry",
) {
  const settings = await getSettings();
  const session = await createSession({
    destUrl: dest,
    domain,
    tabId,
    personaId: settings.personaId,
    mode,
  });
  const withTurn = await nextConsulTurn(session);
  const turn = withTurn.transcript[withTurn.transcript.length - 1]!;
  return { type: "checkpoint:started" as const, sessionId: session.id, personaId: session.personaId, turn };
}

export async function answerCheckpoint(sessionId: string, text: string): Promise<BrainResponse> {
  const session = await getSession(sessionId);
  if (!session) return { type: "error", error: "no such session" };
  const withUser = await appendTurn(session, {
    tool: "say",
    message: text,
    emotion: "",
    author: "user",
    at: now(),
  });
  const withConsul = await nextConsulTurn(withUser);
  return { type: "checkpoint:turn", turn: withConsul.transcript[withConsul.transcript.length - 1]! };
}

function deriveTitle(intent: string): string {
  const t = intent.trim().replace(/\s+/g, " ");
  if (!t) return "Browsing";
  return t.length > 60 ? t.slice(0, 57) + "…" : t;
}

function scheduleVisaAlarm(stamp: Stamp): void {
  chrome.alarms.create(`visa:${stamp.id}`, { when: stamp.expiresAt });
}

async function commitStamp(
  session: CheckpointSession,
  params: Record<string, unknown>,
  message: string,
  internalReason: string,
  opts: { isBreak: boolean; activityId: string },
): Promise<void> {
  const duration = Number(params.durationMinutes ?? params.minutes) || 10;
  const maxTabs = Number(params.maxTabs) || 2;
  const stamp: Stamp = {
    id: newId(),
    activityId: opts.activityId,
    domain: session.domain,
    grantedAt: now(),
    expiresAt: now() + duration * 60_000,
    maxTabs,
    isBreak: opts.isBreak,
    userIntent: firstIntent(session),
    internalReason,
    message,
    transcript: session.transcript,
  };
  await writeStamp(stamp);
  scheduleVisaAlarm(stamp);
  await recordVisit({
    domain: session.domain,
    url: session.destUrl,
    tabId: session.tabId ?? -1,
    activityId: opts.activityId,
  });
}

export async function acceptCheckpoint(sessionId: string): Promise<BrainResponse> {
  const session = await getSession(sessionId);
  if (!session) return { type: "error", error: "no such session" };

  const last = [...session.transcript].reverse().find((t) => t.author === "consul");
  if (!last || !isProposal(last.tool)) {
    return { type: "error", error: "nothing to accept" };
  }
  const params = last.params ?? {};
  const internalReason = last.internalReason ?? "";

  switch (last.tool) {
    case "offer_stamp": {
      const activity = await ensureActiveActivity(deriveTitle(firstIntent(session)));
      await commitStamp(session, params, last.message, internalReason, {
        isBreak: false,
        activityId: activity.id,
      });
      await putSession({ ...session, status: "granted" });
      return { type: "checkpoint:granted", redirectTo: session.destUrl };
    }
    case "start_break_activity": {
      const minutes = Number(params.minutes) || 10;
      const breakActivity = await getOrCreateBreakActivity();
      // Update the break's expiry and make it active
      const database = await (await import("./db.ts")).db();
      await database.put("activities", {
        ...breakActivity,
        status: "active",
        expiresAt: now() + minutes * 60_000,
      });
      // Pause any other active activity
      const allActivities = await database.getAll("activities");
      for (const a of allActivities) {
        if (a.id !== breakActivity.id && a.status === "active") {
          await database.put("activities", { ...a, status: "paused" });
        }
      }
      chrome.alarms.create(`break:${breakActivity.id}`, { when: now() + minutes * 60_000 });
      await commitStamp(session, { durationMinutes: minutes, maxTabs: 3 }, last.message, internalReason, {
        isBreak: true,
        activityId: breakActivity.id,
      });
      await putSession({ ...session, status: "granted" });
      return { type: "checkpoint:granted", redirectTo: session.destUrl };
    }
    case "deny_entry": {
      await putSession({ ...session, status: "denied" });
      return { type: "checkpoint:denied", message: last.message };
    }
    case "create_activity": {
      await createActivity({
        title: String(params.title ?? deriveTitle(firstIntent(session))),
        description: String(params.description ?? ""),
      });
      return continueAfterAccept(session, `[accepted: opened activity "${params.title ?? ""}"]`);
    }
    case "switch_activity": {
      if (typeof params.activityId === "string") await setActiveActivity(params.activityId);
      return continueAfterAccept(session, "[accepted: switched activity]");
    }
    case "end_activity": {
      if (typeof params.activityId === "string") await endActivity(params.activityId);
      return continueAfterAccept(session, "[accepted: ended activity]");
    }
    default:
      return { type: "error", error: `cannot accept ${last.tool}` };
  }
}

/** After a non-terminal proposal (create/switch/end), record acceptance and get the next turn. */
async function continueAfterAccept(
  session: CheckpointSession,
  note: string,
): Promise<BrainResponse> {
  const withNote = await appendTurn(session, {
    tool: "say",
    message: note,
    emotion: "",
    author: "user",
    at: now(),
  });
  const withConsul = await nextConsulTurn(withNote);
  return { type: "checkpoint:turn", turn: withConsul.transcript[withConsul.transcript.length - 1]! };
}
