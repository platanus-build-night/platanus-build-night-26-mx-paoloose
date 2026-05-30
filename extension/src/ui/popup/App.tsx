// Minimal popup — zero fetches, zero auth. Just navigation links.

function openApp(tab?: "dashboard" | "passport" | "configure") {
  const url = chrome.runtime.getURL(tab ? `app.html?tab=${tab}` : "app.html");
  void chrome.tabs.create({ url });
  window.close();
}

export function App() {
  return (
    <div className="wp-pop wp-pop--setup">
      <div className="wp-pop__welcome">Web Passport</div>
      <p className="wp-pop__sub">Your consul is standing by.</p>

      <button className="wp-pop__setup-btn" onClick={() => openApp("dashboard")}>
        Open Dashboard
      </button>
      <button
        className="wp-pop__setup-btn"
        style={{ marginTop: 8, background: "transparent", color: "var(--pop-fg)" }}
        onClick={() => openApp("configure")}
      >
        Configure
      </button>
      <button
        className="wp-pop__setup-btn"
        style={{ marginTop: 8, background: "transparent", color: "var(--pop-muted)", borderColor: "var(--pop-border)" }}
        onClick={() => {
          void chrome.tabs.create({ url: "https://web-passport.vercel.app/marketplace" });
          window.close();
        }}
      >
        Browse Consulate
      </button>
    </div>
  );
}
