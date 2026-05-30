export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: 16,
        padding: 24,
      }}
    >
      <div style={{ fontSize: 72 }}>🛂</div>
      <h1 style={{ margin: 0, fontSize: 40 }}>Web Passport</h1>
      <p style={{ maxWidth: 560, opacity: 0.85, lineHeight: 1.5 }}>
        Now you need a passport for the web. Traveling to a different site? Ask your consul.
        An AI gatekeeper at the border of every website — part focus enforcer, part
        fourth-wall-breaking companion.
      </p>
      <p style={{ opacity: 0.4, fontSize: 13 }}>
        Landing page placeholder (M0). Marketplace &amp; install flow land later.
      </p>
    </main>
  );
}
