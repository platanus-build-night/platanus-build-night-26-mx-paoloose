// Post-login dashboard. Two-column: content left, big persona right.
// Tabs: Dashboard (stats) / Your Passport (activities + stamps) / Configure.
// Always uses the default dark style — persona theme.css is for interrogation only.

import { useEffect, useMemo, useState, useCallback } from "react";
import type { Activity, PassportActivity, Persona, Settings } from "../../types.ts";
import { restEmotion, spriteFor, installPersonaById, listMarketplacePersonas, type PersonaMarketplaceItem } from "../../shared/persona.ts";
import { sendToBrain } from "../shared/messaging.ts";


type Tab = "dashboard" | "passport" | "marketplace" | "configure";
const TABS: Tab[] = ["dashboard", "passport", "marketplace", "configure"];

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

const BREAK_MINUTES = [10, 15, 20, 30];

export function Dashboard({ persona }: { persona: Persona }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [activities, setActivities] = useState<PassportActivity[] | null>(null);
  const [showBreakPicker, setShowBreakPicker] = useState(false);

  const refresh = useCallback(async () => {
    const res = await sendToBrain({ type: "data:passport" });
    if (res.type === "passport") setActivities(res.activities);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const { activeTitle, activeActivity, onBreak, activities: activityCount, stamps, territories, grantedMs } = useMemo(() => {
    const acts = activities ?? [];
    const allStamps = acts.flatMap((a) => a.stamps);
    const terrs = new Set(allStamps.map((s) => s.domain));
    const granted = allStamps.reduce((sum, s) => sum + (s.expiresAt - s.grantedAt), 0);
    const active = acts.find((a) => a.status === "active");
    const breakNow = active?.id === "__break__" && active.expiresAt != null;
    return {
      activeTitle: active?.title ?? "Nothing yet",
      activeActivity: active ?? null,
      onBreak: breakNow,
      activities: acts.filter((a) => a.status !== "done").length,
      stamps: allStamps.length,
      territories: terrs.size,
      grantedMs: granted,
    };
  }, [activities]);

  async function startBreak(minutes: number) {
    await sendToBrain({ type: "activity:startBreak", minutes });
    setShowBreakPicker(false);
    await refresh();
  }

  const sprite = spriteFor(persona, restEmotion(persona));

  return (
    <div className="wp-root wp-dash" data-emotion={restEmotion(persona)}>
      <header className="wp-dash__header">
        <div className="wp-dash__brand">
          <img className="wp-dash__logo" src="assets/title-logo.png" alt="Web Passport" />
          <span className="wp-dash__brand-text">{persona.name}</span>
        </div>
        <nav className="wp-dash__tabs">
          {(["dashboard", "passport", "marketplace", "configure"] as Tab[]).map((t) => (
            <button
              key={t}
              className={`wp-dash__tab ${tab === t ? "is-active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t === "dashboard" ? "Dashboard" : t === "passport" ? "Your passport" : t === "marketplace" ? "Consulate" : "Configure"}
            </button>
          ))}
        </nav>
      </header>

      <div className="wp-dash__body">
        <div className="wp-dash__content">
          {tab === "dashboard" && (
            <>
              <div className="wp-stat-grid">
                <StatCard value={activeTitle} label="Current activity" />
                <StatCard value={String(activityCount)} label="Open activities" />
                <StatCard value={String(stamps)} label="Stamps issued" />
                <StatCard value={String(territories)} label="Territories visited" />
                <StatCard value={fmtMinutes(grantedMs)} label="Time granted" />
              </div>

              {onBreak && activeActivity?.expiresAt ? (
                <BreakTimer expiresAt={activeActivity.expiresAt} />
              ) : (
                <div className="wp-break-action">
                  {!showBreakPicker ? (
                    <button className="wp-break-action__btn" onClick={() => setShowBreakPicker(true)}>
                      Take a Break
                    </button>
                  ) : (
                    <div className="wp-break-action__picker">
                      <span className="wp-break-action__label">How long?</span>
                      <div className="wp-break-action__opts">
                        {BREAK_MINUTES.map((m) => (
                          <button key={m} className="wp-break-action__opt" onClick={() => void startBreak(m)}>
                            {m}m
                          </button>
                        ))}
                      </div>
                      <button className="wp-break-action__cancel" onClick={() => setShowBreakPicker(false)}>
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}

              {activities === null && <p className="wp-empty">Reading your passport…</p>}
            </>
          )}
          {tab === "passport" && <Passport activities={activities} />}
          {tab === "marketplace" && <Marketplace />}
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

function BreakTimer({ expiresAt }: { expiresAt: number }) {
  const [left, setLeft] = useState(Math.max(0, expiresAt - Date.now()));
  useEffect(() => {
    const id = setInterval(() => setLeft(Math.max(0, expiresAt - Date.now())), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return (
    <div className="wp-break-timer">
      <div className="wp-break-timer__label">BREAK IN PROGRESS</div>
      <div className="wp-break-timer__digits">
        {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
      </div>
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
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [saved, setSaved] = useState(false);
  const [installId, setInstallId] = useState("");
  const [installing, setInstalling] = useState(false);
  const [installMsg, setInstallMsg] = useState("");

  useEffect(() => {
    void (async () => {
      const res = await sendToBrain({ type: "settings:get" });
      if (res.type === "settings") {
        setSettings(res.settings);
        setApiKey(res.settings.apiKey ?? "");
        setBaseUrl(res.settings.apiBaseUrl ?? "");
        setModel(res.settings.model ?? "");
      }
    })();
  }, []);

  async function patch(p: Partial<Settings>) {
    await sendToBrain({ type: "settings:set", patch: p });
    setSettings((prev) => (prev ? { ...prev, ...p } : prev));
  }

  async function saveProvider() {
    await patch({
      apiKey: apiKey || null,
      apiBaseUrl: baseUrl || null,
      model: model || null,
    });
    setSaved(true);
  }

  async function resetAll() {
    await sendToBrain({ type: "settings:set", patch: { apiKey: null, apiBaseUrl: null, model: null, enabled: true } });
    location.reload();
  }

  async function handleInstall() {
    if (!installId.trim()) return;
    setInstalling(true);
    setInstallMsg("");
    try {
      await installPersonaById(installId.trim());
      setInstallMsg(`Installed "${installId.trim()}" successfully.`);
      setInstallId("");
    } catch (err) {
      setInstallMsg(`Install failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setInstalling(false);
    }
  }

  if (!settings) return <p className="wp-empty">Loading settings…</p>;

  const provider = settings.provider;

  return (
    <div className="wp-configure">
      <section className="wp-configure__section">
        <h3>AI Provider</h3>
        <div className="wp-configure__row" style={{ flexWrap: "wrap" }}>
          {(["anthropic", "anthropic-compatible", "openai-compatible"] as const).map((p) => (
            <label key={p} className="wp-configure__radio">
              <input
                type="radio"
                name="provider"
                checked={provider === p}
                onChange={() => {
                  setSaved(false);
                  void patch({ provider: p });
                }}
              />
              <span>{p === "anthropic" ? "Anthropic" : p === "anthropic-compatible" ? "Anthropic-compatible" : "OpenAI-compatible"}</span>
            </label>
          ))}
        </div>
        <p className="wp-configure__hint">All calls are local from your browser.</p>
      </section>

      <section className="wp-configure__section">
        <h3>API key</h3>
        <div className="wp-configure__row">
          <input
            type="password"
            value={apiKey}
            placeholder="sk-…"
            onChange={(e) => {
              setApiKey(e.target.value);
              setSaved(false);
            }}
          />
        </div>
      </section>

      {provider !== "anthropic" && (
        <section className="wp-configure__section">
          <h3>Base URL</h3>
          <div className="wp-configure__row">
            <input
              type="text"
              value={baseUrl}
              placeholder={provider === "openai-compatible" ? "https://api.openai.com/v1" : "https://api.anthropic.com"}
              onChange={(e) => {
                setBaseUrl(e.target.value);
                setSaved(false);
              }}
            />
          </div>
        </section>
      )}

      {provider !== "anthropic" && (
        <section className="wp-configure__section">
          <h3>Model</h3>
          <div className="wp-configure__row">
            <input
              type="text"
              value={model}
              placeholder={provider === "openai-compatible" ? "gpt-4o" : "claude-3-haiku-…"}
              onChange={(e) => {
                setModel(e.target.value);
                setSaved(false);
              }}
            />
          </div>
        </section>
      )}

      <section className="wp-configure__section">
        <button className="wp-configure__btn" onClick={() => void saveProvider()}>
          {saved ? "✓ Saved" : "Save"}
        </button>
      </section>

      <section className="wp-configure__section">
        <h3>Install persona</h3>
        <p className="wp-configure__hint">Fetch a persona package from the marketplace server by ID.</p>
        <div className="wp-configure__row">
          <input
            type="text"
            value={installId}
            placeholder="e.g. monika"
            onChange={(e) => setInstallId(e.target.value)}
            disabled={installing}
          />
          <button className="wp-configure__btn" onClick={() => void handleInstall()} disabled={installing}>
            {installing ? "…" : "Install"}
          </button>
        </div>
        {installMsg && <p className="wp-configure__hint">{installMsg}</p>}
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

function Marketplace() {
  const [personas, setPersonas] = useState<PersonaMarketplaceItem[]>([]);

  useEffect(() => {
    void (async () => {
      const list = await listMarketplacePersonas();
      setPersonas(list);
    })();
  }, []);

  return (
    <div className="wp-marketplace">
      <h2 className="wp-marketplace__title">The Consulate</h2>
      <p className="wp-marketplace__subtitle">Browse available consuls. All are pre-installed and ready to guard your borders.</p>
      <div className="wp-marketplace__grid">
        {personas.map((p) => (
          <div className="wp-marketplace__card" key={p.id}>
            <div className="wp-marketplace__card-header">
              <h3 className="wp-marketplace__card-name">{p.name}</h3>
              <span className="wp-marketplace__card-id">{p.id}</span>
            </div>
            {p.description && <p className="wp-marketplace__card-desc">{p.description}</p>}
            {p.author && <p className="wp-marketplace__card-author">by {p.author}</p>}
          </div>
        ))}
      </div>
      {personas.length === 0 && <p className="wp-empty">The consulate is empty.</p>}
    </div>
  );
}
