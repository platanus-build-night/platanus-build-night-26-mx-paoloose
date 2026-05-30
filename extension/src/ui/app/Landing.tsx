// Onboarding landing: no-scroll. Title + description + Clerk sign-in, with the persona
// on the right playing their welcome dialog (each line carries its own emotion).

import { SignInButton } from "@clerk/chrome-extension";
import { useState } from "react";
import type { Persona } from "../../types.ts";
import { neutralEmotion } from "../../shared/persona.ts";
import { useTypewriter } from "../consul/useTypewriter.ts";

interface Props {
  persona: Persona;
}

export function Landing({ persona }: Props) {
  const lines =
    persona.welcomeDialog && persona.welcomeDialog.length
      ? persona.welcomeDialog
      : [{ emotion: neutralEmotion(persona), text: `Welcome. I'm ${persona.name}.` }];

  const [i, setI] = useState(0);
  const line = lines[Math.min(i, lines.length - 1)]!;
  const { shown, done } = useTypewriter(line.text);

  const sprite =
    persona.emotions.find((e) => e.code === line.emotion) ?? persona.emotions[0];
  const atLast = i >= lines.length - 1;

  function advance() {
    if (!done) return;
    if (!atLast) setI((n) => n + 1);
  }

  return (
    <div className="wp-root wp-landing" data-emotion={line.emotion}>
      <div className="wp-stage">
        <div className="wp-landing__intro">
          <img className="wp-landing__logo" src="assets/title-logo.png" alt="Web Passport" />
          <p className="wp-landing__desc">
            Now you need a passport for the web. A consul stands at every border — state
            your intent, get your stamp, stay honest about where you're going.
          </p>

          <div
            className="wp-dialogue"
            data-streaming={done ? "false" : "true"}
            onClick={advance}
            style={{ cursor: done && !atLast ? "pointer" : "default" }}
          >
            <p className="wp-dialogue__text">{shown}</p>
          </div>
          {done && !atLast && (
            <span className="wp-landing__hint" onClick={advance}>
              click to continue ▸
            </span>
          )}

          <SignInButton mode="modal">
            <button className="wp-landing__signin">Sign in to begin</button>
          </SignInButton>
        </div>

        <div className="wp-persona">
          {sprite && <img className="wp-persona__sprite" src={sprite.asset} alt={persona.name} />}
          <div className="wp-persona__name">{persona.name}</div>
        </div>
      </div>
    </div>
  );
}
