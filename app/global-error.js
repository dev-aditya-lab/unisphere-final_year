"use client";

// Last-resort boundary: replaces the root layout, so it must render its own <html>/<body>
// and cannot rely on the app's providers or fonts.
export default function GlobalError({ reset }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#F8FAFC", color: "#111827" }}>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
          <div style={{ maxWidth: 440 }}>
            <h1 style={{ fontSize: 28, margin: 0 }}>UniSphere hit a problem</h1>
            <p style={{ color: "#675F52", lineHeight: 1.6 }}>Something went wrong while loading the page. Please try again.</p>
            <button
              onClick={() => reset()}
              style={{ background: "#FF5A36", color: "#1B1812", border: "1px solid #1B1812", boxShadow: "2px 2px 0 #1B1812", borderRadius: 10, padding: "11px 20px", fontWeight: 600, cursor: "pointer" }}
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
