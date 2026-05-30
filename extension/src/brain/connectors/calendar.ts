// Calendar connector — fetches today's events from the server via Clerk token.
// Fail-open: returns null if not signed in, no token, or the server is unreachable.

import { SERVER_URL } from "../../shared/env.ts";

export interface CalendarEvent {
  title: string;
  start: string;
  end: string;
}

export async function fetchTodayCalendar(): Promise<CalendarEvent[] | null> {
  const stored = await chrome.storage.local.get("clerkToken");
  const token = stored.clerkToken as string | undefined;
  if (!token) return null;

  try {
    const res = await fetch(`${SERVER_URL}/api/calendar/today`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      console.warn("[web-passport] calendar fetch failed:", res.status, await res.text());
      return null;
    }
    const data = (await res.json()) as { events?: CalendarEvent[] };
    return data.events ?? null;
  } catch (err) {
    console.warn("[web-passport] calendar fetch error:", err);
    return null;
  }
}
