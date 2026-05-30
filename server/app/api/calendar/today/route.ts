import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get the user's Google OAuth access token from Clerk
    const client = await clerkClient();
    const tokenResponse = await client.users.getUserOauthAccessToken(userId, "oauth_google");
    const accessToken = tokenResponse.data[0]?.token;

    if (!accessToken) {
      return NextResponse.json(
        { error: "Google Calendar not connected. Connect in your Clerk profile." },
        { status: 400 },
      );
    }

    // Call Google Calendar API for today's events
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const timeMin = today.toISOString();
    const timeMax = tomorrow.toISOString();

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Google Calendar API error: ${err}` }, { status: 502 });
    }

    const data = (await res.json()) as {
      items: Array<{
        summary: string;
        start: { dateTime?: string; date?: string };
        end: { dateTime?: string; date?: string };
      }>;
    };

    const events = data.items.map((e) => ({
      title: e.summary,
      start: e.start.dateTime ?? e.start.date,
      end: e.end.dateTime ?? e.end.date,
    }));

    return NextResponse.json({ events });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to fetch calendar: ${String(err)}` },
      { status: 500 },
    );
  }
}
