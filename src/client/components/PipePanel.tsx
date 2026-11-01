import React, { useEffect, useState } from "react";
import { Boxes, Play, Square } from "lucide-react";
import {
  fetchPackages,
  sessionStepScriptId,
  startFavouriteSession,
  stopSession,
  type PackageInfo,
  type Session,
} from "../lib/api";
import { useStore } from "../store/scripts";

type Facet = {
  id: string;
  label: string;
  scripts: string[];
};

type PaletteItem = {
  label: string;
  script: string;
};

type Release = {
  id: string;
  label: string;
  preset: string;
  facets: Facet[];
  palette?: PaletteItem[];
};

const EXTRA_KEY = "runny-pipe-extra";

const ZIP_PALETTE: PaletteItem[] = [
  { label: "xblox-next", script: "pipe:zip:test:xblox-next" },
  { label: "xblox-language", script: "pipe:zip:test:xblox-language" },
  { label: "xblox-network", script: "pipe:zip:test:xblox-network" },
  { label: "ipc-next", script: "pipe:zip:test:ipc-next" },
  { label: "editor", script: "pipe:zip:test:editor" },
  { label: "llama", script: "pipe:zip:test:llama" },
];

const RELEASES: Release[] = [
  {
    id: "release-debug",
    label: "release-debug",
    preset: "release-debug",
    facets: [
      { id: "build", label: "Build", scripts: ["build:cpp"] },
      { id: "stage", label: "Stage", scripts: ["release:stage-tanit"] },
      { id: "test", label: "Test", scripts: ["pipe:debug:test"] },
      { id: "pack", label: "Pack", scripts: [] },
      { id: "deploy", label: "Deploy", scripts: [] },
    ],
  },
  {
    id: "release-viewer",
    label: "release-viewer",
    preset: "release-viewer",
    facets: [
      {
        id: "build",
        label: "Build",
        scripts: ["update:viewer", "update:settings", "build:cpp:viewer-release"],
      },
      { id: "stage", label: "Stage", scripts: ["release:stage-tanit-viewer"] },
      { id: "test", label: "Test", scripts: ["pipe:viewer:test"] },
      {
        id: "pack",
        label: "Pack",
        scripts: ["package:viewer:zip", "build:installer:viewer"],
      },
      {
        id: "deploy",
        label: "Deploy",
        scripts: [
          "release:docs-viewer",
          "release:gh-viewer",
          "release:deploy-tanit-viewer-ftp",
        ],
      },
    ],
  },
  {
    id: "tanit-zip",
    label: "tanit chat zip",
    preset: "release",
    facets: [
      {
        id: "build",
        label: "Build",
        scripts: ["update:chat", "update:settings", "update:xblox", "build:cpp:release"],
      },
      { id: "stage", label: "Stage", scripts: ["release:stage-tanit-zip"] },
      {
        id: "test",
        label: "Test",
        scripts: ["pipe:zip:test:core", "pipe:zip:test:xblox"],
      },
      {
        id: "pack",
        label: "Pack",
        scripts: ["package:tanit:zip", "build:installer:tanit-zip"],
      },
      {
        id: "deploy",
        label: "Deploy",
        scripts: ["release:docs-tanit-zip", "release:gh-tanit-zip"],
      },
    ],
    palette: ZIP_PALETTE,
  },
];

function loadExtras(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(EXTRA_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string[]>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function scriptId(packages: PackageInfo[], scriptName: string): string {
  const pkg =
    packages.find((p) => p.scripts[scriptName]) ??
    packages.find((p) => p.name === "tanit");
  return `${pkg?.name ?? "tanit"}:${scriptName}`;
}

function filledScripts(release: Release, extras: string[]): string[] {
  return release.facets.flatMap((facet) =>
    facet.id === "test" ? [...facet.scripts, ...extras] : facet.scripts
  );
}

export function PipePanel() {
  const packages = useStore((s) => s.packages);
  const sessions = useStore((s) => s.sessions);
  const refreshPackages = useStore((s) => s.refreshPackages);
  const upsertSession = useStore((s) => s.upsertSession);
  const selectScript = useStore((s) => s.selectScript);
  const setPipeOpen = useStore((s) => s.setPipeOpen);
  const [releaseId, setReleaseId] = useState(RELEASES[0].id);
  const [extrasByRelease, setExtrasByRelease] = useState<Record<string, string[]>>(loadExtras);
  const [dropHot, setDropHot] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const release = RELEASES.find((r) => r.id === releaseId) ?? RELEASES[0];
  const extras = extrasByRelease[release.id] ?? [];

  const saveExtras = (releaseKey: string, next: string[]) => {
    setExtrasByRelease((prev) => {
      const merged = { ...prev, [releaseKey]: next };
      try {
        localStorage.setItem(EXTRA_KEY, JSON.stringify(merged));
      } catch {
        // ignore
      }
      return merged;
    });
  };

  const addExtra = (script: string) => {
    if (!release.palette?.some((item) => item.script === script)) return;
    if (release.facets.some((facet) => facet.scripts.includes(script))) return;
    if (extras.includes(script)) return;
    saveExtras(release.id, [...extras, script]);
  };

  useEffect(() => {
    let cancelled = false;
    fetchPackages(true)
      .then((next) => {
        if (!cancelled && Array.isArray(next)) refreshPackages(next);
      })
      .catch(() => {
        // The facet run refreshes the server catalog if a script was just added.
      });
    return () => {
      cancelled = true;
    };
  }, [refreshPackages]);

  const active = [...sessions.values()]
    .filter(
      (session) =>
        session.groupPath.startsWith(`pipe:${release.id}`) &&
        (session.status === "running" || session.status === "queued")
    )
    .sort((a, b) => b.startedAt - a.startedAt)[0];

  const runScripts = async (groupPath: string, names: string[]) => {
    if (names.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const started = await startFavouriteSession(
        groupPath,
        names.map((name) => scriptId(packages, name)),
        true
      );
      upsertSession(started);
      const id = sessionStepScriptId(started);
      if (id) selectScript(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const stopActive = async () => {
    if (!active) return;
    setBusy(true);
    setError(null);
    try {
      const stopped = await stopSession(active.id);
      upsertSession(stopped);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const facetSession = (facetId: string): Session | undefined => {
    const path = `pipe:${release.id}:${facetId}`;
    let best: Session | undefined;
    for (const session of sessions.values()) {
      if (session.groupPath !== path) continue;
      if (!best || session.startedAt > best.startedAt) best = session;
    }
    return best;
  };

  return (
    <div
      className="shrink-0 flex flex-col overflow-hidden"
      style={{
        width: 360,
        borderRight: "1px solid var(--color-border)",
        background: "var(--color-surface)",
      }}
    >
      <div
        className="h-10 flex items-center gap-2 px-3 shrink-0"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <Boxes size={14} style={{ color: "var(--color-muted)" }} />
        <span className="text-xs font-semibold" style={{ color: "var(--color-text)" }}>
          Pipe
        </span>
        <select
          className="flex-1 min-w-0 text-xs rounded px-1 py-0.5"
          style={{
            background: "var(--color-bg)",
            color: "var(--color-text)",
            border: "1px solid var(--color-border)",
          }}
          value={release.id}
          aria-label="Release"
          onChange={(e) => setReleaseId(e.target.value)}
        >
          {RELEASES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="text-[10px] px-1.5 py-1 rounded hover:opacity-80"
          style={{ color: "var(--color-muted)" }}
          onClick={() => setPipeOpen(false)}
        >
          Close
        </button>
      </div>

      <div className="px-3 py-2 shrink-0 flex items-center gap-2">
        <button
          type="button"
          className="flex items-center gap-1 text-xs px-2 py-1 rounded"
          style={{
            background: "var(--color-border)",
            color: "var(--color-text)",
          }}
          disabled={busy || Boolean(active) || filledScripts(release, extras).length === 0}
          onClick={() => void runScripts(`pipe:${release.id}`, filledScripts(release, extras))}
        >
          <Play size={12} />
          Run
        </button>
        <button
          type="button"
          className="flex items-center gap-1 text-xs px-2 py-1 rounded disabled:opacity-30"
          style={{ color: active ? "#ef4444" : "var(--color-muted)" }}
          disabled={!active || busy}
          onClick={() => void stopActive()}
        >
          <Square size={12} />
          Stop
        </button>
        <span className="text-[10px] truncate" style={{ color: "var(--color-muted)" }}>
          {release.preset}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3 flex flex-col gap-2">
        {release.palette && release.palette.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <span className="w-full text-[10px]" style={{ color: "var(--color-muted)" }}>
              Drag a test onto Test
            </span>
            {release.palette.map((item) => {
              const placed =
                extras.includes(item.script) ||
                release.facets.some((facet) => facet.scripts.includes(item.script));
              return (
                <span
                  key={item.script}
                  draggable={!placed}
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/plain", item.script);
                    event.dataTransfer.effectAllowed = "copy";
                  }}
                  className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{
                    border: "1px dashed var(--color-border)",
                    color: placed ? "var(--color-muted)" : "var(--color-text)",
                    cursor: placed ? "default" : "grab",
                  }}
                  title={placed ? "Already on Test" : `Drag ${item.label} onto Test`}
                >
                  {item.label}
                </span>
              );
            })}
          </div>
        )}
        {release.facets.map((facet) => {
          const session = facetSession(facet.id);
          const names = facet.id === "test" ? [...facet.scripts, ...extras] : facet.scripts;
          const empty = names.length === 0;
          const running =
            session?.status === "running" || session?.status === "queued";
          return (
            <section
              key={facet.id}
              className="rounded-md px-2 py-2"
              style={{
                border: dropHot && facet.id === "test"
                  ? "1px solid var(--color-text)"
                  : "1px solid var(--color-border)",
              }}
              onDragOver={
                facet.id === "test"
                  ? (event) => {
                      event.preventDefault();
                      setDropHot(true);
                    }
                  : undefined
              }
              onDragLeave={facet.id === "test" ? () => setDropHot(false) : undefined}
              onDrop={
                facet.id === "test"
                  ? (event) => {
                      event.preventDefault();
                      setDropHot(false);
                      addExtra(event.dataTransfer.getData("text/plain"));
                    }
                  : undefined
              }
            >
              <div className="flex items-center gap-2">
                <span
                  className="text-xs font-semibold flex-1"
                  style={{ color: "var(--color-text)" }}
                >
                  {facet.label}
                </span>
                <button
                  type="button"
                  className="p-1 rounded hover:opacity-80 disabled:opacity-30"
                  style={{ color: running ? "#ef4444" : "var(--color-muted)" }}
                  title={empty ? "Nothing on this track" : `Run ${facet.label}`}
                  aria-label={empty ? `${facet.label} empty` : `Run ${facet.label}`}
                  disabled={empty || busy || (Boolean(active) && !running)}
                  onClick={() => {
                    if (running && session) void stopActive();
                    else void runScripts(`pipe:${release.id}:${facet.id}`, names);
                  }}
                >
                  {running ? <Square size={12} /> : <Play size={12} />}
                </button>
              </div>
              {empty ? (
                <p className="text-[10px] mt-1" style={{ color: "var(--color-muted)" }}>
                  Nothing on this track
                </p>
              ) : (
                <ul className="mt-1 flex flex-col gap-0.5">
                  {names.map((name) => {
                    const added = facet.id === "test" && extras.includes(name);
                    return (
                      <li key={name} className="flex items-center gap-1">
                        <button
                          type="button"
                          className="text-left text-[11px] flex-1 min-w-0 truncate rounded px-1 py-0.5 hover:opacity-80 disabled:opacity-40"
                          style={{ color: "var(--color-text-secondary)" }}
                          disabled={busy || Boolean(active)}
                          onClick={() =>
                            void runScripts(`pipe:${release.id}:${facet.id}:${name}`, [name])
                          }
                        >
                          {name}
                        </button>
                        {added && (
                          <button
                            type="button"
                            className="text-[10px] px-1 rounded hover:opacity-80"
                            style={{ color: "var(--color-muted)" }}
                            title="Remove from Test"
                            onClick={() => saveExtras(release.id, extras.filter((script) => script !== name))}
                          >
                            ×
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
        {error && (
          <p className="text-[11px]" style={{ color: "#ef4444" }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
