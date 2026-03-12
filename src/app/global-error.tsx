"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: "1rem", fontFamily: "system-ui, sans-serif", color: "#4b5563" }}>
          <p style={{ fontSize: "1.125rem", fontWeight: 500 }}>Something went wrong</p>
          <p style={{ fontSize: "0.875rem", color: "#9ca3af" }}>{error.message}</p>
          <button
            onClick={reset}
            style={{ padding: "0.5rem 1rem", fontSize: "0.875rem", backgroundColor: "#4f46e5", color: "white", border: "none", borderRadius: "0.5rem", cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
