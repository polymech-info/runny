import React from "react";
import { Header } from "./components/Header";
import { DesignerPanel } from "./components/DesignerPanel";
import { PipePanel } from "./components/PipePanel";
import { Sidebar } from "./components/Sidebar";
import { TerminalPanel } from "./components/TerminalPanel";
import { useInitialize } from "./hooks/usePackages";
import { useTheme } from "./hooks/useTheme";
import { useStore } from "./store/scripts";

export default function App() {
  const { error } = useInitialize();
  useTheme();
  const config = useStore((s) => s.config);
  const pipeOpen = useStore((s) => s.pipeOpen);
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
          Cannot reach API ({error}).{" "}
          {__RUNNY_DEV_API_PORT__ ? (
            <>
              Dev UI is :{__RUNNY_DEV_UI_PORT__}; the API is :{__RUNNY_DEV_API_PORT__}.
            </>
          ) : (
            <>Open the URL this <code>runny</code> process printed.</>
          )}
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
        {pipeOpen ? <PipePanel /> : <DesignerPanel />}
        <TerminalPanel />
      </div>
    </div>
  );
}
