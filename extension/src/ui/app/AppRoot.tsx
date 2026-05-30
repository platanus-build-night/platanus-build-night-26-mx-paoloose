// The full-page app: onboarding landing when signed out, dashboard when signed in.
// Opened automatically on install; also reachable from the popup.

import { useEffect, useState } from "react";
import type { Persona } from "../../types.ts";
import { loadPersona } from "../../shared/persona.ts";
import { applyTheme } from "../shared/theme.ts";
import { sendToBrain } from "../shared/messaging.ts";
import { isSignedIn, setSignedIn } from "./auth.ts";
import { Landing } from "./Landing.tsx";
import { Dashboard } from "./Dashboard.tsx";

export function AppRoot() {
  const [persona, setPersona] = useState<Persona | null>(null);
  const [signedIn, setSignedInState] = useState<boolean | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await sendToBrain({ type: "settings:get" });
      const personaId = res.type === "settings" ? res.settings.personaId : "consul";
      const p = await loadPersona(personaId);
      applyTheme(p);
      setPersona(p);
      setSignedInState(await isSignedIn());
    })();
  }, []);

  if (!persona || signedIn === null) {
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

  if (!signedIn) {
    return (
      <Landing
        persona={persona}
        onSignIn={async () => {
          await setSignedIn(true); // PLACEHOLDER — real Clerk sign-in lands in M4
          setSignedInState(true);
        }}
      />
    );
  }

  return <Dashboard persona={persona} />;
}
