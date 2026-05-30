# Web Passport — Design Spec

**Date:** 2026-05-29
**Author:** Paolo Luis Flores Cóngora (@paoloose)
**Status:** Approved design — ready for implementation planning
**Context:** Platanus Build Night (Ciudad de México). v1 = the build-night demo.

---

## 1. Summary

Web Passport is a Chrome extension that puts an **AI "consul" at the border of every
website you visit**. Crossing into new territory (a new domain) triggers a passport
checkpoint: the consul interrogates you about your intent, weighs it against what you're
*supposed* to be doing, and either stamps your passport (a time- and tab-bounded visa),
sends you on a deliberately-rationed break, or denies entry. It's part focus enforcer,
part fourth-wall-breaking character (Bonzi Buddy / Sans / Duo / Monika energy), and the
payoff is **self-awareness**: you can only have **one active Activity at a time**, so you
are forced to confront what you're actually doing.

### Three pillars (in priority order)
1. **Enforcer** — reclaim time and attention; the consul is a real gatekeeper.
2. **Experience** — a funny/uncanny persona makes the enforcement delightful, not nagging.
3. **Self-awareness** — the single-active-Activity model makes you narrate and confront
   your own context-switching.

### What success looks like (v1 demo)
On stage: navigate to a new domain → the page is **hard-blocked** → the consul appears,
references your real calendar/history, negotiates a visa → you accept → **passport stamp
animation** → countdown → on expiry the consul **materializes over the live page** to
collect its due.

---

## 2. Scope

### In scope for v1 ("Core + Calendar")
- Chrome extension (MV3), built on the existing Bun + TypeScript scaffold.
- **Consul Brain** in the background service worker (page-independent single source of truth).
- **BYOK** Claude API key, used client-side from the brain.
- **Local-first** persistence (IndexedDB via an offscreen document + `chrome.storage.local`).
- Hybrid interception (interstitial redirect on entry + content-script overlay mid-session).
- Full ritual: entry interrogation, Activities, Stamps, time-visas, tab caps, appeals,
  breaks, expiry re-prompts.
- One fully-built consul **persona** (persona format is plugin-ready).
- **Google Calendar** connector via a thin **deployed** OAuth proxy server.

### Designed-for but NOT built in v1 (cut list)
- Persona/plugin **marketplace** (server is architected to host it; not built).
- **Cloud backup/sync** of sessions.
- Connectors beyond Calendar (Trello, etc.) — the `Connector` interface exists; only
  Calendar is implemented.
- Multiple shipped personas / skins.
- **Hard-enforcement mode** — v1 is **negotiable-only** (the agent *can* be configured to
  hard-block later via plugins, but not by default).
- Landing page (served by the same central server later).

### Explicitly out of scope
- Direct read of Chrome's native browsing history (we keep our **own** VisitRecord log instead).
- Mobile / non-Chromium browsers.

---

## 3. Architecture

A **page-independent Consul Brain** with thin UI surfaces that all message it.

### Components

- **Consul Brain** — MV3 **background service worker**. The single source of truth:
  owns the state machine, the one-active-Activity invariant, all Claude (BYOK) calls, and
  the deliberation loop. Because MV3 service workers are ephemeral:
  - durable state lives in **IndexedDB** (rich queries) + **`chrome.storage.local`**
    (small/hot state like the active Activity id, settings);
  - IndexedDB is accessed via an **offscreen document** so DB access survives worker restarts;
  - all time-visas and break timers run on **`chrome.alarms`** (survive restarts).

- **Navigation Interceptor** — uses `chrome.webNavigation` + `declarativeNetRequest`
  (and `chrome.tabs` events) to detect **border crossings** (entering a new domain) and to
  **count open tabs per domain**.

- **Checkpoint page** (`checkpoint.html`) — a real **extension page** shown via **redirect**
  on entry. Hard block: the target domain never loads until a stamp is granted. Thin UI;
  talks to the brain over `chrome.runtime` messaging.

- **Overlay content script** — injected at `document_start`, used for **mid-session**
  interruptions (visa expiry, tab-limit). The consul **materializes on top of** the live
  page. Thin UI; summoned by the brain.

- **Connector layer** — pluggable `Connector` interface for external context. v1 ships
  one: Google **Calendar** (via the OAuth proxy).

- **Popup / Settings** — BYOK key entry, current Activity, stamp/passport history, persona
  selection.

- **Central Server** (deployed, shared by all users — see §7) — v1 uses only its OAuth-proxy
  surface.

### Data flow (entry)
```
nav to new domain D
  → Interceptor redirect → checkpoint.html?dest=D
  → checkpoint asks Brain to open a checkpoint session for D
  → Brain gathers context (active Activity, recent VisitRecords, today's Calendar,
    existing valid stamps for D, persona emotion set)
  → Brain runs the consul agent (Claude, BYOK)
  → agent turn (a tool call) streamed to checkpoint UI
  → user Accept / Argue loop
  → on Accept of a proposal: Brain commits state (Stamp / Activity change), schedules
    alarms, then redirects the tab to D
```

---

## 4. Data model (local IndexedDB)

> Invariant enforced by the Brain: **exactly one Activity has `status: "active"`** at any
> time (a break counts as the active Activity while it runs).

### Activity
```
Activity {
  id: string
  title: string
  description: string
  status: "active" | "paused" | "done"
  createdAt: number            // epoch ms
  expiresAt: number | null     // set for BREAK activities; null for normal activities
  consulNotes: string          // running internal notes the consul keeps about this activity
}
```
A **break is just an Activity** with the same struct/fields, distinguished only by a
non-null `expiresAt` and the fact that it was created via `start_break_activity`. It is
**ended only by the internal timer** (`chrome.alarms`), never by the agent.

### Stamp
A grant living inside an Activity's passport.
```
Stamp {
  id: string
  activityId: string
  domain: string               // eTLD+1, the "territory"
  grantedAt: number
  expiresAt: number            // time-visa
  maxTabs: number              // tab cap for this domain under this stamp
  isBreak: boolean             // granted as part of / via a break flow
  userIntent: string           // what the user stated at the border
  internalReason: string       // short internal gatekeeping summary (never shown)
  message: string              // persona-voiced, user-facing justification (the granting line)
  transcript: Turn[]           // the full negotiation that produced this stamp
}
```

### Turn (one consul utterance — see §6)
```
Turn {
  tool: "say" | "offer_stamp" | "deny_entry" | "start_break_activity"
      | "create_activity" | "switch_activity" | "end_activity"
  message: string              // persona-voiced text shown to the user
  emotion: string              // constrained to the active persona's declared emotion set
  internalReason?: string      // present on decision tools; never shown
  params?: object              // tool-specific args (domain, minutes, etc.)
  author: "consul" | "user"    // user turns store the user's argued text in `message`
  at: number
}
```

### VisitRecord (self-tracked browsing history — the context fuel)
```
VisitRecord {
  id: string
  domain: string
  url: string
  tabId: number
  enteredAt: number
  leftAt: number | null
  activityId: string | null    // which Activity was active during this visit
}
```

### Settings
```
Settings {
  apiKey: string | null        // BYOK Claude key (local only)
  personaId: string            // active persona
  calendarTokens: object | null// obtained via the OAuth proxy
  watchRules: object           // future: domain allow/deny config (sane defaults in v1)
}
```

---

## 5. Consul persona

A **persona is a self-contained, plugin-ready package**. Critically, **each persona
declares its own set of states/emotions** — there is no fixed global list.

```
Persona {
  id: string
  name: string
  avatar: AssetRef
  emotions: EmotionDef[]       // persona-defined; e.g. suspicious / pleased /
                               //   theatrical_rage / disappointed / smug
  systemPrompt: string         // voice, rules of conduct, gatekeeping philosophy
}
EmotionDef {
  state: string                // the enum value the agent may emit via `emotion`
  sprite: AssetRef             // expression rendered by the UI for this state
  toneGuidance?: string        // optional voice/tone hint surfaced to the model
}
```

- The consul's current emotion is **agent-driven**: every message it emits carries an
  `emotion` field, **validated at runtime against the active persona's declared set**.
- The UI simply renders whatever expression the active persona maps that state to.
- v1 ships **one** fully-built persona — a theatrical, pompous-but-secretly-caring border
  consul who breaks the fourth wall and references your real day ("you told me you were
  shipping the parser — and yet, here we are at x.com"). The *shape* is plugin-ready so the
  future marketplace can add more.

---

## 6. The Consul Agent — turn & tool model

The consul is a **Claude agent** (BYOK). **Context is injected into the prompt** — active
Activity, recent VisitRecords, today's Calendar, existing valid stamps for the domain, and
the active persona's emotion set. Everything beyond committing a decision is **plain
conversation**.

### Turn model
- **Every consul turn is a single tool call**, and **every tool call carries `message` +
  `emotion`** (emotion is therefore set on *every* message, not via a separate tool).
- Tools are either **talk** or **proposals**.
- A **proposal renders an Accept / Argue prompt in the UI. Nothing mutates state until the
  user Accepts.** If the user argues, their text is appended as a `user` Turn and the agent
  takes another turn (re-deciding).

### Tools

| Tool | Kind | Params (besides `message`, `emotion`) | Effect on **Accept** |
|---|---|---|---|
| `say` | talk | — | nothing — interrogation / guilt-trips / questions |
| `offer_stamp` | proposal | `internalReason, domain, durationMinutes, maxTabs` | issue (or extend) the visa for the domain under the active Activity; schedule expiry alarm |
| `deny_entry` | proposal | `internalReason` | user complies (page stays blocked / they leave); arguing continues the conversation |
| `start_break_activity` | proposal | `internalReason, minutes` | create a **break Activity** (`expiresAt = now + minutes`) and auto-switch to it; schedule the break-end alarm |
| `create_activity` | proposal | `internalReason, title, description` | open a new Activity, make it `active` (previous → `paused`) |
| `switch_activity` | proposal | `internalReason, activityId` | make an existing Activity `active` |
| `end_activity` | proposal | `internalReason, activityId` | mark the Activity `done` |

### Two reasons on every decision
- **`internalReason`** — a short summary for internal gatekeeping/memory. **Never shown** to
  the user. Persisted on Stamps and Turns; feeds future deliberations.
- **`message`** — the persona-voiced, user-facing line. (This replaces the earlier
  `reasonForUser` concept; the message *is* the user-facing reason.)

### Notes
- **No `grant_stamp` that auto-commits** — only `offer_stamp`, which commits on Accept.
- **No `end_break` tool** — a break ends **only** when its timer (`chrome.alarms`) fires.
- `say` never proposes; it is pure conversation.

---

## 7. Central Server (deployed, shared)

The server is **not local**. It is a single **deployed, centralized service** for all users.
It is architected from day one as the central backend, hosting (eventually):
- the **persona + plugin marketplace**,
- the **project landing page**,
- the **OAuth proxy** for connectors (holds the OAuth client secret),
- **cloud backup/sync** of sessions.

**v1 uses only the OAuth-proxy surface** (for Google Calendar). Everything else on this list
is on the cut list but the server's shape anticipates it.

### Calendar connector (v1)
- OAuth handled through the proxy (secret stays server-side); the extension stores the
  resulting tokens locally (`Settings.calendarTokens`).
- The Brain pulls **today's events** to ground deliberation ("you have 'Deep work' blocked
  until 3pm — x.com doesn't fit that").
- Sits behind a `Connector` interface so Trello/etc. drop in later without touching the
  agent loop.

---

## 8. Interception (Hybrid)

- **Entry (border crossing) = interstitial redirect.** On navigating to a **new domain**
  for which there is no valid stamp under the active Activity, the Interceptor redirects the
  tab to `checkpoint.html?dest=<domain>`. The real page **never loads** until a stamp is
  granted (true hard block, no host-page CSP fights).
- **Mid-session = content-script overlay.** For **visa expiry** and **tab-limit** events the
  page is already open, so the consul materializes as a full-screen overlay **on top of the
  live page** ("consul takes over your tab").

### Trigger rules
- **Wave through, no LLM:** entering a domain that already has a **valid** stamp (not
  expired, under the tab cap) **under the active Activity**.
- **Checkpoint (entry):** entering a new domain with no valid stamp.
- **Overlay (expiry):** a stamp/break `expiresAt` alarm fires → summon consul in matching tabs.
- **Overlay (tab limit):** opening tab #(maxTabs + 1) for a domain → intercept that tab.
- **Activity fit:** entering a domain that doesn't fit the active Activity → the consul may
  propose `create_activity` / `switch_activity` / `start_break_activity`.

---

## 9. The rituals (flows)

### 9.1 Entry ritual
1. Interceptor catches navigation to new domain D → redirect to `checkpoint.html?dest=D`.
2. Brain opens a checkpoint session; gathers context (active Activity, recent VisitRecords,
   today's Calendar, valid stamps for D, persona emotion set).
3. **Valid stamp under active Activity exists** → wave through, no LLM call.
4. Else → consul agent deliberates; responds with tool calls — typically `say`
   (interrogate) then eventually a proposal (`offer_stamp` / `deny_entry` /
   `start_break_activity` / `create_activity`).
5. **Accept / Argue loop**: arguing appends a `user` Turn and the agent re-decides.
6. **Accept** commits the proposal → persist Stamp / Activity change → schedule alarms →
   **passport stamp animation** → redirect the tab to D.

### 9.2 Visa expiry
- `chrome.alarms` fires for a stamp → Brain messages the overlay content script in all tabs
  on that domain → consul appears: *"Your 10 minutes are up. Leave, or appeal."*
- User can Accept (comply — Brain may navigate the tab away / re-block) or Argue → agent may
  `offer_stamp` an extension.

### 9.3 Tab limit
- Opening a tab beyond `maxTabs` for a domain → Interceptor sends it to checkpoint/overlay →
  consul argues; user may appeal for a higher cap (agent re-issues `offer_stamp` with a
  larger `maxTabs`).

### 9.4 Break
- The consul *may* propose `start_break_activity({ minutes })` (hard to earn). On Accept, a
  break Activity is created (`expiresAt` set) and becomes active; the prior Activity is
  paused. When the alarm fires, the timer ends the break (no agent involvement) and the user
  is prompted to resume / pick the next Activity.

### 9.5 Activity switching
- Exactly one Activity is active. Entering a domain that doesn't fit triggers a proposal to
  `create_activity` / `switch_activity`. Switching is always an explicit, accepted ritual —
  this is the anti-multitasking / self-awareness mechanism.

---

## 10. Error handling (fail-open — never trap the user via a bug)

- **No API key** → the consul cannot deliberate; fall back to a manual short timer + warning
  (and prompt the user to add a key in Settings). Never a hard wall caused by missing config.
- **LLM error / timeout** → grant a short default visa (fail-open) so a backend hiccup never
  locks the user out.
- **Calendar unavailable** → deliberate without it (context is best-effort).
- **Service worker killed mid-flow** → state is in `chrome.storage` + IndexedDB and alarms
  persist; the checkpoint page re-queries the Brain on load and resumes the session.
- **Persona emits an undeclared emotion** → clamp to a neutral default; do not break the UI.

---

## 11. Testing strategy

- **Pure decision/validation logic** — stamp validity (expiry, tab cap, activity match),
  the one-active-Activity invariant, emotion-set validation, break expiry → unit tests with
  fixtures.
- **State machine** — entry/expiry/tab-limit/break/switch transitions over a mocked
  `chrome.*` surface.
- **Agent contract** — given a context fixture, assert the brain produces well-formed turns
  and that proposals only mutate state on accept.
- **Manual E2E** — redirect + overlay against 2–3 real domains; verify hard block, stamp
  animation, countdown, and the expiry overlay.

---

## 12. Technology stack & project layout

**Two projects** in this repo:

### `./extension` — the Chrome extension (MV3)
- Existing **Bun + TypeScript + MV3** scaffold.
- **React** (+ JSX) for the three UI surfaces: **checkpoint page**, **overlay**,
  **popup/settings**. Bundled by the existing `Bun.build`.
- The **service-worker brain stays vanilla TS** (no UI framework).
- **IndexedDB** via a thin `idb` wrapper, accessed through an **offscreen document**.
- **`chrome.alarms`** for all time-visas and break timers.
- Claude (BYOK) via `fetch` to the Anthropic API; key stored locally only.

### `./server` — the centralized backend + web (Next.js)
- **Next.js (App Router)**, deployed on **Vercel** (mirror to a personal repo per the
  root `README.md` deploy note).
- Hosts: **landing page**, **persona marketplace** (browse / creators / upload — UX
  modeled on `server/inspiration-codex-pet-share/src/gallery/*`), the **persona package
  API**, and the **Calendar OAuth proxy** (holds the OAuth client secret).
- **v1 implements only**: the Calendar OAuth-proxy route(s) and a route that serves
  persona packages. Marketplace UI, uploads, backup/sync are cut-list (§2).
- `server/inspiration-codex-pet-share/` is **read-only reference**, not part of the build.

---

## 13. Persona packaging & installation

**Hard platform constraint:** MV3 **forbids loading remote executable code**. Therefore a
persona — and any future "plugin" — is **declarative data, never downloadable JavaScript.**
This keeps the marketplace safe (no third-party code runs in the user's browser) and
Web-Store-compliant. The **Brain interprets** these packages.

### Persona Package format
A persona is a self-describing package = **manifest JSON + image assets** (no code):
```
PersonaPackage {
  manifest: Persona            // the §5 struct: id, name, systemPrompt, emotions[]
  assets: {                    // referenced by the manifest
    avatar: <image>
    sprites: { [emotionState]: <image> }   // one per declared emotion
  }
}
```
On install the Brain **validates** the manifest against the `Persona` schema (every
declared emotion has a sprite; required fields present), caches assets, and stores the
persona in IndexedDB. An undeclared `emotion` emitted at runtime clamps to neutral (§10).

### Installation paths
- **v1 (demo-safe):**
  - **Install-by-ID/URL** in extension Settings → extension `fetch`es the package from
    `./server`, validates, caches assets, stores it.
  - **Local-file import** of a package for authoring/testing.
- **Designed-for (marketplace UX):** an **"Install" button on the web marketplace** that
  messages the extension via **`externally_connectable`** (manifest lists the marketplace
  origin) → extension fetches + validates the same package. (Web→extension adaptation of
  the inspiration repo's `DownloadCommandRow` install affordance.)

### Future "behavior plugins" (cut-list, but constrained now)
Because remote code is forbidden, plugins that change consul behavior (strictness/
temperature, extra rules, allowed-tool subsets, prompt fragments) must also be
**declarative config the Brain interprets** — never executable code. v1 ships only the
**negotiable** default behavior; the plugin format is not built yet but must follow this
data-not-code rule.

---

## 14. Glossary

- **Territory** — a domain (eTLD+1). Crossing into a new one needs a passport.
- **Activity** — a unit of intent; exactly one is active at a time. Breaks are Activities too.
- **Stamp** — a time- and tab-bounded visa for a domain, recorded in an Activity's passport,
  carrying the negotiation transcript and the consul's deliberation.
- **Consul** — the AI gatekeeper agent; a persona with its own declared emotions.
- **Visa** — the time window granted by a stamp.
