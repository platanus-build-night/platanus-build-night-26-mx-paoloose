// The full-page app: no auth gate, straight to dashboard.
import { useEffect, useState } from "react";
import type { Persona } from "../../types.ts";
import { loadPersona } from "../../shared/persona.ts";
import { sendToBrain } from "../shared/messaging.ts";
import { Dashboard } from "./Dashboard.tsx";

export function AppRoot() {
  const [persona, setPersona] = useState<Persona | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await sendToBrain({ type: "settings:get" });
      const personaId = res.type === "settings" ? res.settings.personaId : "consul";
      setPersona(await loadPersona(personaId));
    })();
  }, []);

  if (!persona) {
    return (
      <div className="wp-root">
        <div className="wp-stage">
          <div className="wp-dialogue">
            <p className="wp-dialogue__text">Opening the consulate…</p>
          </div>
        </div>
      </div>
    );
  }

  return <Dashboard persona={persona} />;
}
