"use client";

// Last-resort boundary: replaces the root layout, so it must render its own <html>/<body>
// and cannot rely on the app's providers or fonts.
export default function GlobalError({ reset }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#F7F5EF", color: "#17243A" }}>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
          <div style={{ maxWidth: 440 }}>
            <h1 style={{ fontSize: 28, margin: 0 }}>UniSphere hit a problem</h1>
            <p style={{ color: "#5B667B", lineHeight: 1.6 }}>Something went wrong while loading the page. Please try again.</p>
            <button
              onClick={() => reset()}
              style={{ background: "#3546A8", color: "#fff", border: 0, borderRadius: 8, padding: "10px 18px", fontWeight: 600, cursor: "pointer" }}
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
