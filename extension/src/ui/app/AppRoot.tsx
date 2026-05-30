// The full-page app: onboarding landing when signed out, dashboard when signed in.
// Uses Clerk auth (wrapped at app.tsx entrypoint).

import { useAuth } from "@clerk/chrome-extension";
import { useEffect, useState } from "react";
import type { Persona } from "../../types.ts";
import { loadPersona } from "../../shared/persona.ts";
import { sendToBrain } from "../shared/messaging.ts";
import { Landing } from "./Landing.tsx";
import { Dashboard } from "./Dashboard.tsx";

export function AppRoot() {
  const { isSignedIn, isLoaded } = useAuth();
  const [persona, setPersona] = useState<Persona | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await sendToBrain({ type: "settings:get" });
      const personaId = res.type === "settings" ? res.settings.personaId : "consul";
      setPersona(await loadPersona(personaId));
    })();
  }, []);

  if (!persona || !isLoaded) {
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

  if (!isSignedIn) {
    return <Landing persona={persona} />;
  }

  return <Dashboard persona={persona} />;
}
