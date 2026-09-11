import React from "react";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { TerminalPanel } from "./components/TerminalPanel";
import { useInitialize } from "./hooks/usePackages";
import { useTheme } from "./hooks/useTheme";
import { useStore } from "./store/scripts";

export default function App() {
  const { error } = useInitialize();
  useTheme();
  const config = useStore((s) => s.config);
  const loading = !config && !error;

  return (
    <div className="h-screen flex flex-col">
      <Header />
      {error && (
        <div
          className="px-4 py-2 text-sm shrink-0"
          style={{
            background: "rgba(239,68,68,0.12)",
            color: "#ef4444",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          Cannot reach API ({error}). Use http://127.0.0.1:3717 for{" "}
          <code>runny</code>, or keep <code>npm run dev</code> server up on
          :3717 if you are on :5173.
        </div>
      )}
      {loading && (
        <div
          className="px-4 py-2 text-sm shrink-0"
          style={{
            color: "var(--color-muted)",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          Connecting to API…
        </div>
      )}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          emptyHint={loading ? "Loading…" : error ? "API offline" : undefined}
        />
        <TerminalPanel />
      </div>
    </div>
  );
}
