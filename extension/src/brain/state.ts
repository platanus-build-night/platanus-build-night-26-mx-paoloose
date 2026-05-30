// Domain state operations over IndexedDB. Enforces the core invariants
// (exactly one active Activity; stamps belong to an Activity).

import { db } from "./db.ts";
import type { Activity, PassportActivity, Stamp, VisitRecord } from "../types.ts";

export const now = (): number => Date.now();
export const newId = (): string => crypto.randomUUID();

// ---- Activities ----

export async function getActiveActivity(): Promise<Activity | null> {
  const all = await (await db()).getAllFromIndex("activities", "by-status", "active");
  return all[0] ?? null;
}

export async function getActivity(id: string): Promise<Activity | undefined> {
  return (await db()).get("activities", id);
}

export async function listActivities(): Promise<Activity[]> {
  return (await db()).getAll("activities");
}

/**
 * Create an Activity and make it the single active one (demoting any current
 * active Activity to `paused`). Breaks pass an `expiresAt`.
 */
export async function createActivity(input: {
  title: string;
  description?: string;
  expiresAt?: number | null;
}): Promise<Activity> {
  const database = await db();
  const tx = database.transaction("activities", "readwrite");
  const store = tx.objectStore("activities");

  // Demote current active(s) to paused.
  const actives = await store.index("by-status").getAll("active");
  for (const a of actives) await store.put({ ...a, status: "paused" });

  const activity: Activity = {
    id: newId(),
    title: input.title,
    description: input.description ?? "",
    status: "active",
    createdAt: now(),
    expiresAt: input.expiresAt ?? null,
    consulNotes: "",
  };
  await store.put(activity);
  await tx.done;
  return activity;
}

/** Ensure there is an active Activity, creating one from the stated intent if needed. */
export async function ensureActiveActivity(intentTitle: string): Promise<Activity> {
  const existing = await getActiveActivity();
  if (existing) return existing;
  return createActivity({ title: intentTitle || "Browsing", description: "" });
}

export async function setActiveActivity(id: string): Promise<void> {
  const database = await db();
  const tx = database.transaction("activities", "readwrite");
  const store = tx.objectStore("activities");
  const actives = await store.index("by-status").getAll("active");
  for (const a of actives) if (a.id !== id) await store.put({ ...a, status: "paused" });
  const target = await store.get(id);
  if (target) await store.put({ ...target, status: "active" });
  await tx.done;
}

export async function endActivity(id: string): Promise<void> {
  const database = await db();
  const target = await database.get("activities", id);
  if (target) await database.put("activities", { ...target, status: "done" });
}

/** The predefined Break activity. Created on first use if absent. */
const BREAK_ID = "__break__";
export async function getOrCreateBreakActivity(): Promise<Activity> {
  const database = await db();
  const existing = await database.get("activities", BREAK_ID);
  if (existing) return existing;
  const breakActivity: Activity = {
    id: BREAK_ID,
    title: "Break",
    description: "Rest period granted by the consul.",
    status: "paused",
    createdAt: now(),
    expiresAt: null,
    consulNotes: "",
  };
  await database.put("activities", breakActivity);
  return breakActivity;
}

/**
 * Start a break: activate the break Activity, set its expiry, pause any other
 * active Activity, and schedule the auto-end alarm.
 */
export async function startBreak(minutes: number): Promise<Activity> {
  const database = await db();
  const tx = database.transaction("activities", "readwrite");
  const store = tx.objectStore("activities");

  // Pause current active(s)
  const actives = await store.index("by-status").getAll("active");
  for (const a of actives) {
    if (a.id !== BREAK_ID) await store.put({ ...a, status: "paused" });
  }

  // Reuse or create break activity
  let breakAct = await store.get(BREAK_ID);
  if (!breakAct) {
    breakAct = {
      id: BREAK_ID,
      title: "Break",
      description: "Rest period granted by the consul.",
      status: "active",
      createdAt: now(),
      expiresAt: now() + minutes * 60_000,
      consulNotes: "",
    };
  } else {
    breakAct = { ...breakAct, status: "active", expiresAt: now() + minutes * 60_000 };
  }
  await store.put(breakAct);
  await tx.done;
  return breakAct;
}

export async function isOnBreak(): Promise<boolean> {
  const active = await getActiveActivity();
  return active?.id === BREAK_ID && active.expiresAt != null && active.expiresAt > now();
}

// ---- Stamps ----

export async function writeStamp(stamp: Stamp): Promise<void> {
  await (await db()).put("stamps", stamp);
}

export async function getStamp(id: string): Promise<Stamp | undefined> {
  return (await db()).get("stamps", id);
}

/**
 * The valid stamp (if any) authorizing entry to `domain` under `activityId`:
 * not expired. Tab-cap enforcement lands in M2. Returns the latest-expiring match.
 */
export async function findValidStamp(
  domain: string,
  activityId: string,
): Promise<Stamp | null> {
  const stamps = await (await db()).getAllFromIndex("stamps", "by-domain", domain);
  const ts = now();
  const valid = stamps
    .filter((s) => s.activityId === activityId && s.expiresAt > ts)
    .sort((a, b) => b.expiresAt - a.expiresAt);
  return valid[0] ?? null;
}

export async function stampsForActivity(activityId: string): Promise<Stamp[]> {
  return (await db()).getAllFromIndex("stamps", "by-activity", activityId);
}

/** All activities (newest first) with their stamps, for the passport view. */
export async function getPassport(): Promise<PassportActivity[]> {
  const database = await db();
  const activities = (await database.getAll("activities")).sort((a, b) => b.createdAt - a.createdAt);
  const allStamps = await database.getAll("stamps");
  return activities.map((a) => ({
    ...a,
    stamps: allStamps
      .filter((s) => s.activityId === a.id)
      .sort((x, y) => y.grantedAt - x.grantedAt),
  }));
}

// ---- Visits ----

export async function recordVisit(
  v: Omit<VisitRecord, "id" | "enteredAt" | "leftAt"> & { activityId: string | null },
): Promise<VisitRecord> {
  const visit: VisitRecord = {
    id: newId(),
    enteredAt: now(),
    leftAt: null,
    ...v,
  };
  await (await db()).put("visits", visit);
  return visit;
}

export async function recentVisits(limit = 10): Promise<VisitRecord[]> {
  const all = await (await db()).getAll("visits");
  return all.sort((a, b) => b.enteredAt - a.enteredAt).slice(0, limit);
}
