import React from "react";
import { Moon, Sun, Download } from "lucide-react";
import { useStore } from "../store/scripts";
import { runInstall, stopScript } from "../lib/api";
import logoSvg from "../assets/logo.svg";

const INSTALL_ID = "__runny:install";

export function Header() {
  const config = useStore((s) => s.config);
  const theme = useStore((s) => s.theme);
  const toggle = useStore((s) => s.toggleTheme);
  const selectScript = useStore((s) => s.selectScript);
  const setScriptStatus = useStore((s) => s.setScriptStatus);
  const installState = useStore((s) => s.scriptStates.get(INSTALL_ID));

  const isInstalling = installState?.status === "running";

  const handleInstall = async () => {
    if (isInstalling) {
      await stopScript(INSTALL_ID);
    } else {
      setScriptStatus(INSTALL_ID, "running");
      selectScript(INSTALL_ID);
      await runInstall();
    }
  };

  return (
    <header
      className="h-14 flex items-center justify-between px-5 shrink-0"
      style={{
        background: "var(--color-surface)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <div className="flex items-center gap-3">
        <a
          href="https://www.npmjs.com/package/@polymech/runny"
          title="@polymech/runny — fork of icydotdev/runny"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          <img src={logoSvg} alt="Runny" className="w-7 h-7" />
          <span className="text-lg font-bold tracking-tight text-runny-accent">
            runny
          </span>
        </a>
        {config && (
          <>
            <span style={{ color: "var(--color-muted)" }}>/</span>
            <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
              {config.repoName}
            </span>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        {config && (
          <button
            onClick={handleInstall}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors ${
              isInstalling
                ? "bg-runny-yellow/10 text-runny-yellow"
                : "hover:bg-runny-accent/10"
            }`}
            style={isInstalling ? undefined : { color: "var(--color-text-secondary)" }}
            title={`${config.packageManager} install`}
          >
            <Download size={13} className={isInstalling ? "animate-bounce" : ""} />
            {isInstalling ? "Installing..." : `${config.packageManager} install`}
          </button>
        )}
        {config && (
          <span
            className="text-xs px-2 py-1 rounded"
            style={{
              background: "var(--color-border)",
              color: "var(--color-muted)",
            }}
          >
            {config.packageManager}
          </span>
        )}
        <button
          onClick={toggle}
          className="p-1.5 rounded-md transition-colors hover:bg-runny-accent/10"
          style={{ color: "var(--color-muted)" }}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </header>
  );
}
