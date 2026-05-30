// Popup. Two states:
//   - NOT signed in -> logo + sign-in with Clerk.
//   - signed in     -> consul, activity, View Passport / Configure buttons.

import { useAuth, useUser } from "@clerk/chrome-extension";
import { useEffect, useState } from "react";
import type { PassportActivity, Persona, Settings } from "../../types.ts";
import { listPersonas, loadPersona, restEmotion, spriteFor, type PersonaSummary } from "../../shared/persona.ts";
import { sendToBrain } from "../shared/messaging.ts";
import { IS_DEBUG } from "../../shared/env.ts";

function openApp(tab?: "dashboard" | "passport" | "configure") {
  const url = chrome.runtime.getURL(tab ? `app.html?tab=${tab}` : "app.html");
  void chrome.tabs.create({ url });
  window.close();
}

function fmtBreakLeft(expiresAt: number): string {
  const left = Math.max(0, expiresAt - Date.now());
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function App() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const { user } = useUser();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [persona, setPersona] = useState<Persona | null>(null);
  const [personaList, setPersonaList] = useState<PersonaSummary[]>([]);
  const [activities, setActivities] = useState<PassportActivity[]>([]);
  const [changing, setChanging] = useState(false);
  const [breakLeft, setBreakLeft] = useState<string | null>(null);

  useEffect(() => {
    if (!isSignedIn) return;
    void (async () => {
      // Sync Clerk token to storage so the Brain can call the server
      const token = await getToken();
      await chrome.storage.local.set({ clerkToken: token ?? null });

      const s = await sendToBrain({ type: "settings:get" });
      if (s.type === "settings") {
        setSettings(s.settings);
        setPersona(await loadPersona(s.settings.personaId));
      }
      setPersonaList(await listPersonas());
      const p = await sendToBrain({ type: "data:passport" });
      if (p.type === "passport") {
        const acts = p.activities.filter((a) => a.status !== "done");
        setActivities(acts);
        const active = acts.find((a) => a.status === "active");
        if (active?.id === "__break__" && active.expiresAt) {
          setBreakLeft(fmtBreakLeft(active.expiresAt));
        }
      }
    })();
  }, [isSignedIn]);

  useEffect(() => {
    if (!breakLeft) return;
    const active = activities.find((a) => a.status === "active");
    if (active?.id !== "__break__" || !active.expiresAt) {
      setBreakLeft(null);
      return;
    }
    const id = setInterval(() => {
      const left = fmtBreakLeft(active.expiresAt!);
      setBreakLeft(left);
      if (left === "00:00") {
        clearInterval(id);
        void (async () => {
          const p = await sendToBrain({ type: "data:passport" });
          if (p.type === "passport") {
            const acts = p.activities.filter((a) => a.status !== "done");
            setActivities(acts);
            const a = acts.find((x) => x.status === "active");
            if (a?.id !== "__break__") setBreakLeft(null);
          }
        })();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [breakLeft, activities]);

  async function patch(p: Partial<Settings>) {
    await sendToBrain({ type: "settings:set", patch: p });
    setSettings((prev) => (prev ? { ...prev, ...p } : prev));
  }

  async function switchPersona(id: string) {
    await patch({ personaId: id });
    setPersona(await loadPersona(id));
    setChanging(false);
  }

  async function switchActivity(id: string) {
    if (!id) return;
    await sendToBrain({ type: "activity:setActive", id });
    const p = await sendToBrain({ type: "data:passport" });
    if (p.type === "passport") {
      const acts = p.activities.filter((a) => a.status !== "done");
      setActivities(acts);
      const active = acts.find((a) => a.status === "active");
      if (active?.id === "__break__" && active.expiresAt) {
        setBreakLeft(fmtBreakLeft(active.expiresAt));
      } else {
        setBreakLeft(null);
      }
    }
  }

  if (!isLoaded) return <div className="wp-pop" />;

  // ---- Not signed in: invite to sign in ----
  if (!isSignedIn) {
    return (
      <div className="wp-pop wp-pop--setup">
        <img className="wp-pop__logo" src="assets/logo.png" alt="Web Passport" />
        <div className="wp-pop__welcome">Passport Inspection</div>
        <p className="wp-pop__sub">State your intent. Declare your mission. Begin.</p>
        <button className="wp-pop__setup-btn" onClick={() => openApp()}>
          Begin Inspection
        </button>
      </div>
    );
  }

  // ---- Signed in ----
  const activeId = activities.find((a) => a.status === "active")?.id ?? "";
  const onBreak = activeId === "__break__";

  return (
    <div className="wp-pop">
      <div className="wp-pop__head">
        <span className="wp-pop__title">🛂 Web Passport</span>
        <span className="wp-pop__user">{user?.primaryEmailAddress?.emailAddress ?? "Citizen"}</span>
      </div>

      {/* Persona */}
      <div className="wp-pop__section">
        <div className="wp-pop__persona">
          {persona && (
            <img className="wp-pop__sprite" src={spriteFor(persona, restEmotion(persona))} alt={persona.name} />
          )}
          <div>
            <div className="wp-pop__persona-name">{persona?.name ?? "…"}</div>
            <button className="wp-pop__textbtn" onClick={() => setChanging((v) => !v)}>
              Change consul
            </button>
          </div>
        </div>
        {changing && (
          <select value={persona?.id ?? ""} onChange={(e) => void switchPersona(e.target.value)}>
            {personaList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Activity */}
      <div className="wp-pop__section">
        <div className="wp-pop__label">Current activity</div>
        <div className="wp-pop__activity-now" data-none={String(activeId === "")}>
          {activities.find((a) => a.id === activeId)?.title ?? "No activity"}
        </div>
        {onBreak && breakLeft && (
          <div className="wp-pop__break">
            <span className="wp-pop__break-label">BREAK</span>
            <span className="wp-pop__break-digits">{breakLeft}</span>
          </div>
        )}
        {activities.length > 0 && !onBreak && (
          <select value={activeId} onChange={(e) => void switchActivity(e.target.value)}>
            <option value="" disabled>
              Switch activity…
            </option>
            {activities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Debug-only global toggle */}
      {IS_DEBUG && settings && (
        <div className="wp-pop__section">
          <div className="wp-pop__toggle">
            <span className="wp-pop__toggle-label">Consul active</span>
            <input
              type="checkbox"
              className="wp-pop__switch"
              checked={settings.enabled}
              onChange={(e) => void patch({ enabled: e.target.checked })}
            />
          </div>
          <div className="wp-pop__debug-note">Debug build — when off, no site is gated.</div>
        </div>
      )}

      {/* Navigation */}
      <div className="wp-pop__actions">
        <button className="wp-pop__action" onClick={() => openApp("passport")}>
          View passport
        </button>
        <button className="wp-pop__action wp-pop__action--ghost" onClick={() => openApp("configure")}>
          Configure
        </button>
      </div>
    </div>
  );
}
