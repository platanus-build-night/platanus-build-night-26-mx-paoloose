// Post-login dashboard. Two-column: content left, big persona right.
// Tabs: Dashboard (stats) / Your Passport (activities + stamps) / Configure.
// Always uses the default dark style — persona theme.css is for interrogation only.

import { useEffect, useMemo, useState } from "react";
import type { PassportActivity, Persona, Settings } from "../../types.ts";
import { restEmotion, spriteFor } from "../../shared/persona.ts";
import { sendToBrain } from "../shared/messaging.ts";
import { setSignedIn } from "./auth.ts";

type Tab = "dashboard" | "passport" | "configure";
const TABS: Tab[] = ["dashboard", "passport", "configure"];

function initialTab(): Tab {
  const t = new URLSearchParams(location.search).get("tab") as Tab | null;
  return t && TABS.includes(t) ? t : "dashboard";
}

function fmtMinutes(totalMs: number): string {
  const m = Math.round(totalMs / 60000);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function fmtClock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function Dashboard({ persona }: { persona: Persona }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [activities, setActivities] = useState<PassportActivity[] | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await sendToBrain({ type: "data:passport" });
      if (res.type === "passport") setActivities(res.activities);
    })();
  }, []);

  const stats = useMemo(() => {
    const acts = activities ?? [];
    const stamps = acts.flatMap((a) => a.stamps);
    const territories = new Set(stamps.map((s) => s.domain));
    const grantedMs = stamps.reduce((sum, s) => sum + (s.expiresAt - s.grantedAt), 0);
    const active = acts.find((a) => a.status === "active");
    return {
      activeTitle: active?.title ?? "Nothing yet",
      activities: acts.filter((a) => a.status !== "done").length,
      stamps: stamps.length,
      territories: territories.size,
      grantedMs,
    };
  }, [activities]);

  const sprite = spriteFor(persona, restEmotion(persona));

  return (
    <div className="wp-root wp-dash" data-emotion={restEmotion(persona)}>
      <header className="wp-dash__header">
        <div className="wp-dash__brand">
          <img className="wp-dash__logo" src="assets/title-logo.png" alt="Web Passport" />
          <span className="wp-dash__brand-text">{persona.name}</span>
        </div>
        <nav className="wp-dash__tabs">
          {(["dashboard", "passport", "configure"] as Tab[]).map((t) => (
            <button
              key={t}
              className={`wp-dash__tab ${tab === t ? "is-active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t === "dashboard" ? "Dashboard" : t === "passport" ? "Your passport" : "Configure"}
            </button>
          ))}
        </nav>
      </header>

      <div className="wp-dash__body">
        <div className="wp-dash__content">
          {tab === "dashboard" && (
            <>
              <div className="wp-stat-grid">
                <StatCard value={stats.activeTitle} label="Current activity" />
                <StatCard value={String(stats.activities)} label="Open activities" />
                <StatCard value={String(stats.stamps)} label="Stamps issued" />
                <StatCard value={String(stats.territories)} label="Territories visited" />
                <StatCard value={fmtMinutes(stats.grantedMs)} label="Time granted" />
              </div>
              {activities === null && <p className="wp-empty">Reading your passport…</p>}
            </>
          )}
          {tab === "passport" && <Passport activities={activities} />}
          {tab === "configure" && <Configure />}
        </div>

        {/* Big persona portrait, always visible on the right */}
        {sprite && (
          <div className="wp-dash__persona">
            <img src={sprite} alt={persona.name} />
            <div className="wp-dash__persona-name">{persona.name}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="wp-stat-card">
      <div className="wp-stat-card__value">{value}</div>
      <div className="wp-stat-card__label">{label}</div>
    </div>
  );
}

function Passport({ activities }: { activities: PassportActivity[] | null }) {
  if (activities === null) return <p className="wp-empty">Reading your passport…</p>;
  if (activities.length === 0)
    return <p className="wp-empty">No stamps yet. Cross a border and the consul will start your record.</p>;

  return (
    <div className="wp-passport">
      {activities.map((a) => (
        <div className="wp-passport__activity" key={a.id}>
          <div className="wp-passport__act-head">
            <span className="wp-passport__title">{a.title}</span>
            <span className="wp-passport__status" data-status={a.status}>
              {a.status}
            </span>
          </div>
          {a.description && <p className="wp-passport__desc">{a.description}</p>}
          {a.stamps.map((s) => (
            <div className="wp-stamp-row" key={s.id}>
              <span className="wp-stamp-row__domain">{s.domain}</span>
              <span className="wp-stamp-row__msg">"{s.message}"</span>
              <span className="wp-stamp-row__meta">
                {fmtClock(s.grantedAt)} · {fmtMinutes(s.expiresAt - s.grantedAt)} · ≤{s.maxTabs} tabs
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Configure() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await sendToBrain({ type: "settings:get" });
      if (res.type === "settings") {
        setSettings(res.settings);
        setApiKey(res.settings.apiKey ?? "");
      }
    })();
  }, []);

  async function patch(p: Partial<Settings>) {
    await sendToBrain({ type: "settings:set", patch: p });
    setSettings((prev) => (prev ? { ...prev, ...p } : prev));
  }

  async function resetAll() {
    await sendToBrain({ type: "settings:set", patch: { apiKey: null, enabled: true } });
    await setSignedIn(false);
    location.reload();
  }

  if (!settings) return <p className="wp-empty">Loading settings…</p>;

  return (
    <div className="wp-configure">
      <section className="wp-configure__section">
        <h3>Anthropic API key</h3>
        <p className="wp-configure__hint">Your key stays local. Blank = the demo consul (mock).</p>
        <div className="wp-configure__row">
          <input
            type="password"
            value={apiKey}
            placeholder="sk-ant-…"
            onChange={(e) => {
              setApiKey(e.target.value);
              setSaved(false);
            }}
          />
          <button
            className="wp-configure__btn"
            onClick={async () => {
              await patch({ apiKey: apiKey || null });
              setSaved(true);
            }}
          >
            {saved ? "✓" : "Save"}
          </button>
        </div>
      </section>

      <section className="wp-configure__section">
        <h3>Reset</h3>
        <p className="wp-configure__hint">Clear all local data and start over.</p>
        <button className="wp-configure__btn wp-configure__btn--danger" onClick={resetAll}>
          Reset Web Passport
        </button>
      </section>
    </div>
  );
}
