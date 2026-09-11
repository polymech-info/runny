import React, { useMemo } from "react";
import { Clock } from "lucide-react";
import { ScriptRow } from "./ScriptRow";
import { fuzzyScoreScript } from "../lib/fuzzy-search";
import { useStore, type ScriptState } from "../store/scripts";
import type { PackageInfo, Session } from "../lib/api";

const MAX_RECENT = 12;

function resolveScript(
  packages: PackageInfo[],
  id: string
): { packageName: string; scriptName: string; command: string } | null {
  for (const pkg of packages) {
    const prefix = `${pkg.name}:`;
    if (!id.startsWith(prefix)) continue;
    const scriptName = id.slice(prefix.length);
    if (pkg.scripts[scriptName]) {
      return {
        packageName: pkg.name,
        scriptName,
        command: pkg.scripts[scriptName],
      };
    }
  }
  return null;
}

function activityAt(
  state: ScriptState | undefined,
  sessions: Map<string, Session>,
  packageName: string,
  scriptName: string
): number {
  let best = 0;
  if (state?.status === "running") best = Number.MAX_SAFE_INTEGER;
  else if (state?.endedAt) best = state.endedAt;

  for (const session of sessions.values()) {
    for (const step of session.steps) {
      const pkg = step.packageName ?? session.packageName;
      if (pkg !== packageName || step.scriptName !== scriptName) continue;
      if (step.status === "pending") continue;
      if (step.status === "running") return Number.MAX_SAFE_INTEGER;
      const at = step.endedAt ?? step.startedAt ?? session.startedAt;
      if (at > best) best = at;
    }
  }
  return best;
}

export function Recent() {
  const packages = useStore((s) => s.packages);
  const scriptStates = useStore((s) => s.scriptStates);
  const sessions = useStore((s) => s.sessions);
  const searchQuery = useStore((s) => s.searchQuery);
  const descriptions = useStore((s) => s.scriptDescriptions);

  const items = useMemo(() => {
    const seen = new Set<string>();
    const collected: {
      id: string;
      packageName: string;
      scriptName: string;
      command: string;
      at: number;
    }[] = [];

    const consider = (id: string) => {
      if (seen.has(id)) return;
      const item = resolveScript(packages, id);
      if (!item) return;
      const at = activityAt(
        scriptStates.get(id),
        sessions,
        item.packageName,
        item.scriptName
      );
      if (at <= 0) return;
      seen.add(id);
      collected.push({ id, ...item, at });
    };

    for (const id of scriptStates.keys()) consider(id);
    for (const session of sessions.values()) {
      for (const step of session.steps) {
        const pkg = step.packageName ?? session.packageName;
        consider(`${pkg}:${step.scriptName}`);
      }
    }

    collected.sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
    return collected.slice(0, MAX_RECENT);
  }, [packages, scriptStates, sessions]);

  const query = searchQuery.trim();
  const visible = query
    ? items.filter(
        (item) =>
          fuzzyScoreScript(
            query,
            item.scriptName,
            item.command,
            descriptions[item.id],
            item.id
          ) > 0
      )
    : items;

  if (visible.length === 0) return null;

  return (
    <div style={{ borderBottom: "1px solid var(--color-border)" }}>
      <div className="flex items-center gap-1.5 px-3 py-2">
        <Clock size={12} style={{ color: "var(--color-muted)" }} />
        <span
          className="flex-1 text-xs font-medium uppercase tracking-wider"
          style={{ color: "var(--color-muted)" }}
        >
          Recent
        </span>
        <span className="text-[11px] tabular-nums" style={{ color: "var(--color-muted)" }}>
          {visible.length}
        </span>
      </div>
      <div className="pb-1">
        {visible.map((item) => (
          <ScriptRow
            key={item.id}
            packageName={item.packageName}
            scriptName={item.scriptName}
            command={item.command}
          />
        ))}
      </div>
    </div>
  );
}
