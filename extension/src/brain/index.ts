// The Consul Brain — runs in the MV3 background service worker.
// Single source of truth: settings, state (IndexedDB), the agent loop, sessions,
// the navigation interceptor, and alarms.

import type { BrainRequest, BrainResponse } from "../ui/shared/messaging.ts";
import { getSettings, setSettings } from "./settings.ts";
import { domainOf, checkpointUrlFor } from "./url.ts";
import { decideForUrl } from "./interceptor.ts";
import { acceptCheckpoint, answerCheckpoint, startCheckpoint } from "./checkpoint.ts";
import {
  endActivity,
  findValidStamp,
  getActiveActivity,
  getPassport,
  getStamp,
  setActiveActivity,
  startBreak,
} from "./state.ts";
import type { ContentMessage } from "../ui/shared/messaging.ts";

/** Push an overlay summon to every loaded tab currently on `domain`. */
async function summonOnDomain(domain: string, mode: ContentMessage["mode"]): Promise<void> {
  const tabs = await chrome.tabs.query({});
  for (const t of tabs) {
    if (t.id == null || !t.url || domainOf(t.url) !== domain) continue;
    chrome.tabs.sendMessage(t.id, { type: "overlay:summon", mode } satisfies ContentMessage).catch(() => {});
  }
}

async function handleAlarm(name: string): Promise<void> {
  if (name.startsWith("visa:")) {
    const stamp = await getStamp(name.slice("visa:".length));
    if (stamp) await summonOnDomain(stamp.domain, "expiry");
  } else if (name.startsWith("break:")) {
    const breakId = name.slice("break:".length);
    // Break over: mark it done, restore the most recent non-break paused activity
    const { db: getDb } = await import("./db.ts");
    const database = await getDb();
    const breakAct = await database.get("activities", breakId);
    if (breakAct && breakAct.status === "active") {
      await database.put("activities", { ...breakAct, status: "done", expiresAt: null });
    }
    const all = await database.getAll("activities");
    const prev = all
      .filter((a) => a.id !== breakId && a.status === "paused")
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    if (prev) await setActiveActivity(prev.id);
  }
}

/** Tab-limit watch: when a domain exceeds its granted maxTabs, summon the consul. */
async function checkTabLimit(tabId: number, url: string): Promise<void> {
  const domain = domainOf(url);
  if (!domain) return;
  const settings = await getSettings();
  if (!settings.enabled) return;
  const active = await getActiveActivity();
  if (!active) return;
  const stamp = await findValidStamp(domain, active.id);
  if (!stamp) return; // no visa → entry overlay handles it
  const tabs = await chrome.tabs.query({});
  const count = tabs.filter((t) => t.url && domainOf(t.url) === domain).length;
  if (count > stamp.maxTabs) {
    chrome.tabs.sendMessage(tabId, { type: "overlay:summon", mode: "tablimit" } satisfies ContentMessage).catch(() => {});
  }
}

async function handle(
  req: BrainRequest,
  sender: chrome.runtime.MessageSender,
): Promise<BrainResponse> {
  switch (req.type) {
    case "ping":
      return { type: "pong" };

    case "settings:get":
      return { type: "settings", settings: await getSettings() };

    case "settings:set":
      await setSettings(req.patch);
      return { type: "ok" };

    case "checkpoint:start": {
      const domain = domainOf(req.dest);
      if (!domain) return { type: "error", error: "ungated destination" };
      return startCheckpoint(req.dest, domain, req.tabId ?? null, req.mode ?? "entry");
    }

    case "checkpoint:answer":
      return answerCheckpoint(req.sessionId, req.text);

    case "checkpoint:accept":
      return acceptCheckpoint(req.sessionId);

    case "data:passport":
      return { type: "passport", activities: await getPassport() };

    case "activity:setActive":
      await setActiveActivity(req.id);
      return { type: "ok" };

    case "activity:startBreak": {
      const breakAct = await startBreak(req.minutes);
      chrome.alarms.create(`break:${breakAct.id}`, { when: breakAct.expiresAt! });
      return { type: "ok" };
    }

    case "overlay:check": {
      const decision = await decideForUrl(req.url, sender.tab?.id ?? null);
      return { type: "overlay:decision", ...decision };
    }

    case "overlay:fallback": {
      // EMERGENCY ONLY: the in-page overlay failed to render → fall back to the
      // standalone checkpoint page by redirecting the sender's tab.
      const tabId = sender.tab?.id;
      if (tabId != null) await chrome.tabs.update(tabId, { url: checkpointUrlFor(req.url) });
      return { type: "ok" };
    }

    default:
      return { type: "error", error: `unknown request: ${(req as { type: string }).type}` };
  }
}

export function initBrain(): void {
  chrome.runtime.onMessage.addListener((req: BrainRequest, sender, sendResponse) => {
    handle(req, sender)
      .then(sendResponse)
      .catch((err) => sendResponse({ type: "error", error: String(err) }));
    return true; // keep the message channel open for the async response
  });

  chrome.runtime.onInstalled.addListener((details) => {
    console.log("[web-passport] consul brain installed");
    // Open the onboarding / dashboard page on first install.
    if (details.reason === "install") {
      chrome.tabs.create({ url: chrome.runtime.getURL("app.html") });
    }
  });

  // Visa expiry → summon the consul over the live page; break expiry → end it.
  chrome.alarms.onAlarm.addListener((alarm) => {
    void handleAlarm(alarm.name);
  });

  // Tab-limit watch.
  chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
    if (info.status === "complete" && tab.url) void checkTabLimit(tabId, tab.url);
  });

  // Overlay-first: the in-page content script self-checks on load; no proactive
  // navigation redirect (redirect is emergency-only, via overlay:fallback).
  console.log("[web-passport] consul brain ready");
}
