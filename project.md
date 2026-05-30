---
name: web-passport-project
description: "What Web Passport is, its two-project layout, and the approved design spec location"
metadata:
  node_type: memory
  type: project
  originSessionId: ac5ee709-c64c-4efc-8cec-d9286c4ee24f
---

**Web Passport** — a Platanus Build Night (CDMX) Chrome extension: an AI "consul" gatekeeps every new domain you visit (passport/border-control metaphor). Part focus-enforcer, part fourth-wall-breaking character, payoff is self-awareness via a **one-active-Activity-at-a-time** model. Enforcement is **negotiable** by default (offer/accept, appeals), not hard-block.

**Two projects in the repo:**
- `./extension` — MV3 extension, Bun + TypeScript, React UI (see [[extension-ui-uses-react]]). Brain lives in the background service worker; local-first IndexedDB; BYOK Claude.
- `./server` — Next.js on Vercel; landing + persona marketplace + Calendar via **Clerk**. `server/inspiration-codex-pet-share/` is read-only reference for marketplace UX.

**Auth:** Clerk for identity + Google OAuth (Calendar scope). Extension uses `@clerk/chrome-extension`; server reads calendar via Clerk-held Google tokens (no hand-rolled OAuth proxy).


For the Web Passport Chrome extension (`./extension`), the UI surfaces (checkpoint page, overlay, popup/settings) must use **normal React**, not Preact. The server (`./server`, Next.js) is unaffected.

**Why:** User explicitly corrected a Preact suggestion, preferring standard React.

**How to apply:** When scaffolding or planning extension UI, reach for React + JSX bundled by Bun.build. See [[web-passport-project]].



**Key design decisions:** hybrid interception (interstitial redirect on entry + content-script overlay mid-session); consul is a Claude agent whose only state-mutations are offer/accept proposals; personas are declarative data packages (manifest + assets), never remote code (MV3 constraint). v1 = "Core + Calendar".

Approved design spec: `docs/superpowers/specs/2026-05-29-web-passport-design.md`. Implementation plan: `docs/superpowers/plans/2026-05-29-web-passport-plan.md` (no `writing-plans` skill installed — wrote the plan directly).

**Progress:** M0 done — both projects scaffolded, building, typechecking, committed. Extension entry files are `extension/src/*.{ts,tsx}` (unique basenames → predictable `dist/` outputs), ESM build via `build.ts`; overlay content script (IIFE) deferred to M2. Dev Clerk keys live in `server/.env.local` (gitignored).

**Persona format (finalized):** a persona is a folder `personas/<id>/` = `persona.json` (identity/personality/systemPrompt/examples/marketplace metadata) + `emotions/emotions_criteria.json` (per emotion: code, name, asset, criteria) + `emotions/<code>.<ext>` images + `theme.css` (UI override, NOT layout.css). **Monika** (DDLC) is the built default: emotions happy/curious/worried/upset. `sans` folder exists but empty.

**UI model:** ask-answer (NOT a chat — transcript hidden from user but stored internally), text streamed typewriter-style, persona portrait on the right, offer/accept prompt is a modal over a dim black backdrop. Personas theme via a stable CSS class contract (`.wp-root`, `.wp-dialogue`, `.wp-offer`, etc.; `data-emotion` on `.wp-root`); see spec §8.5.

**M1 done (commit e966b36):** entry-ritual vertical slice builds + typechecks clean (live in-browser E2E not yet run). Brain uses `idb` directly in the service worker (NO offscreen doc — IndexedDB persists across SW restarts anyway; deliberate deviation from spec). Layers: `brain/{db,state,url,session,checkpoint,interceptor,index}.ts`, `brain/agent/{tools,types,prompt,mock,claude,index}.ts`, `shared/persona.ts`, `ui/checkpoint/*`. Consul agent has an offline deterministic **mock** (used when no BYOK key) and a real **Anthropic** path (model `claude-haiku-4-5-20251001`, `tool_choice:any`, `anthropic-dangerous-direct-browser-access` header); fail-open on error. Default class-contract stylesheet is `extension/default.css` (linked by checkpoint.html); persona theme.css injected over it. `build.ts` copies `personas/` → `dist/personas/`.

To test in Chrome: `cd extension && bun run build`, load unpacked, navigate to a new domain → checkpoint. Mock works with no key; paste an Anthropic key in the popup for the real consul.

**Interception pivot (supersedes spec §8 "interstitial redirect on entry"):** the consul now appears as an **in-page overlay** for BOTH entry and interruptions — a content script (`src/overlay.tsx`, IIFE build) mounts the shared `ui/consul/ConsulSession` in a **Shadow DOM** at max z-index over a transparent-black backdrop (`.wp-root--overlay`), non-blocking (page loads underneath). CSS injected via constructable stylesheets to dodge page CSP. **Render detection** (full-viewport check at 1.5s) → on failure, EMERGENCY redirect to the checkpoint page (`overlay:fallback`). The standalone `checkpoint.html` is now only the fallback. Content script self-checks on load via `overlay:check`→`decideForUrl` (no proactive webNavigation redirect anymore). Mid-session summon (expiry/tab-limit) will push `overlay:summon` to the content script (M2).

Also built: **popup** (persona switcher over `dist/personas/index.json`, activity switcher, debug-only "Consul active" toggle gated by `WEBPASSPORT_ENV` build define / `shared/env.ts`; interceptor respects `settings.enabled`). **Onboarding/dashboard** app page (`app.html`, opened on install) with welcome_dialog landing + Dashboard/Passport tabs + corner consul; sign-in is a local placeholder (`ui/app/auth.ts`) pending real Clerk (M4). Persona now has `default_emotion`.

**M2 done (commit eba2dbb):** mid-session summon. `checkpoint:start` carries `mode` (entry|expiry|tablimit) → session/context/prompt/mock opening branch on it. Visa-expiry alarm → `summonOnDomain` pushes `overlay:summon` to loaded tabs on the stamp's domain; break alarm ends break Activity. `tabs.onUpdated` watch → exceed `maxTabs` → tablimit summon. All builds + typecheck clean; live browser E2E still not run from here.

Remaining milestones: M3 (activities/breaks first-class UI — partially there), M4 (real Clerk + Calendar), M5 (persona install/marketplace), M6 (server web). Real Anthropic path coded but untested live.

