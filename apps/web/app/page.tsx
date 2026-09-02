export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui", maxWidth: 960, margin: "0 auto", padding: 48 }}>
      <p style={{ color: "#64748b", letterSpacing: ".08em", textTransform: "uppercase" }}>DeployPilot</p>
      <h1 style={{ fontSize: 48, marginBottom: 16 }}>From GitHub push to healthy container.</h1>
      <p style={{ fontSize: 20, color: "#475569", maxWidth: 700 }}>
        A controlled deployment platform for connecting GitHub repositories, managing Docker workers,
        and operating live services with durable logs and evidence-based diagnosis.
      </p>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 40 }}>
        {["GitHub push deployments", "Remote Docker workers", "Live observability"].map((title) => (
          <article key={title} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 20 }}>
            <h2 style={{ fontSize: 18 }}>{title}</h2>
            <p style={{ color: "#64748b" }}>Foundation ready for the next implementation milestone.</p>
          </article>
        ))}
      </section>
    </main>
  );
}
