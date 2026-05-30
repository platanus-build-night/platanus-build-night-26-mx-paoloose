// Typed message protocol between UI surfaces and the Consul Brain (service worker).

import type { PassportActivity, Settings, Turn } from "../../types.ts";

/** Why the consul is appearing. */
export type OverlayMode = "entry" | "expiry" | "tablimit";

export type BrainRequest =
  | { type: "ping" }
  | { type: "settings:get" }
  | { type: "settings:set"; patch: Partial<Settings> }
  // Checkpoint ritual
  | { type: "checkpoint:start"; dest: string; tabId?: number; mode?: OverlayMode }
  | { type: "checkpoint:answer"; sessionId: string; text: string }
  | { type: "checkpoint:accept"; sessionId: string }
  // Dashboard data
  | { type: "data:passport" }
  // Activity control
  | { type: "activity:setActive"; id: string }
  | { type: "activity:startBreak"; minutes: number }
  // Overlay (in-page consul)
  | { type: "overlay:check"; url: string }
  | { type: "overlay:fallback"; url: string };

export type BrainResponse =
  | { type: "pong" }
  | { type: "settings"; settings: Settings }
  | { type: "ok" }
  | { type: "error"; error: string }
  // Checkpoint ritual
  | { type: "checkpoint:started"; sessionId: string; personaId: string; turn: Turn }
  | { type: "checkpoint:turn"; turn: Turn }
  | { type: "checkpoint:granted"; redirectTo: string }
  | { type: "checkpoint:denied"; message: string }
  // Dashboard data
  | { type: "passport"; activities: PassportActivity[] }
  // Overlay
  | { type: "overlay:decision"; summon: boolean; mode: OverlayMode };

/** Send a typed request to the brain and await its typed response. */
export async function sendToBrain(req: BrainRequest): Promise<BrainResponse> {
  return chrome.runtime.sendMessage(req) as Promise<BrainResponse>;
}

/** Brain → content-script push (mid-session interruptions). */
export type ContentMessage = { type: "overlay:summon"; mode: OverlayMode };
