import React, { useEffect, useState } from "react";
import { Boxes, Play, Square, X } from "lucide-react";
import {
  fetchPackages,
  fetchPipeReport,
  sessionStepScriptId,
  startFavouriteSession,
  stopSession,
  type PackageInfo,
  type Session,
  type SessionStep,
} from "../lib/api";
import {
  activeFavouriteDrag,
  activePipeDrag,
  beginScriptDrag,
  endScriptDrag,
} from "../lib/favourite-dnd";
import {
  applyPipeRename,
  loadPipeLayout,
  savePipeLayout,
  subscribePipeLayout,
  type PipeLayout,
} from "../lib/pipe-layout";
import { resolveDisplayStatus } from "../lib/script-status";
import { useStore } from "../store/scripts";
import { ScriptRow } from "./ScriptRow";

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

function reportPath(packages: PackageInfo[], scriptName: string): string | null {
  const command = packages
    .map((pkg) => pkg.scripts[scriptName])
    .find((cmd) => typeof cmd === "string" && cmd.includes("--config"));
  if (!command) return null;
  const config = command.match(/--config\s+(\S+)/)?.[1];
  if (!config) return null;
  const suite = command.match(/--suite\s+(\S+)/)?.[1] ?? "test-core.mjs";
  const stem = suite.replace(/\.mjs$/, "").replace(/[^\w.-]/g, "");
  const safeConfig = config.replace(/[^\w.-]/g, "");
  if (!stem || !safeConfig) return null;
  return `reports/${safeConfig}/${stem}-errors.md`;
}

function latestPipeStep(
  sessions: Map<string, Session>,
  releaseId: string,
  scriptName: string
): SessionStep | undefined {
  let best: SessionStep | undefined;
  let bestAt = -1;
  for (const session of sessions.values()) {
    if (!session.groupPath.startsWith(`pipe:${releaseId}`)) continue;
    for (const step of session.steps) {
      if (step.scriptName !== scriptName || step.status === "pending") continue;
      const at = step.endedAt ?? step.startedAt ?? session.startedAt;
      if (at >= bestAt) {
        bestAt = at;
        best = step;
      }
    }
  }
  return best;
}

function scriptId(packages: PackageInfo[], scriptName: string): string {
  const pkg =
    packages.find((p) => p.scripts[scriptName]) ??
    packages.find((p) => p.name === "tanit");
  return `${pkg?.name ?? "tanit"}:${scriptName}`;
}

function facetScriptNames(
  release: Release,
  facetId: string,
  extras: string[],
  layout: PipeLayout
): string[] {
  const facet = release.facets.find((item) => item.id === facetId);
  const custom = layout.facets[release.id]?.[facetId];
  const base = custom
    ? custom
    : facet
      ? facet.id === "test"
        ? [...facet.scripts, ...extras.filter((script) => !facet.scripts.includes(script))]
        : [...facet.scripts]
      : [];
  const seen = new Set<string>();
  const names: string[] = [];
  for (const raw of base) {
    const name = applyPipeRename(raw, layout.renames);
    if (!name || layout.omitted.includes(name) || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

function scriptNameFromDrag(packages: PackageInfo[], token: string): string | null {
  const trimmed = token.trim();
  if (!trimmed) return null;
  for (const pkg of packages) {
    const prefix = `${pkg.name}:`;
    if (!trimmed.startsWith(prefix)) continue;
    const scriptName = trimmed.slice(prefix.length);
    if (pkg.scripts[scriptName]) return scriptName;
  }
  if (packages.some((pkg) => pkg.scripts[trimmed])) return trimmed;
  return null;
}

function dragScriptNames(packages: PackageInfo[]): string[] {
  const ids =
    activePipeDrag?.scriptIds ??
    (activeFavouriteDrag?.kind === "script" ? [activeFavouriteDrag.scriptId] : []);
  const names: string[] = [];
  for (const id of ids) {
    const name = scriptNameFromDrag(packages, id);
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

function pipeDragActive(): boolean {
  return Boolean(activePipeDrag?.scriptIds.length) || activeFavouriteDrag?.kind === "script";
}

function placeScripts(current: string[], incoming: string[], index: number): string[] {
  const rest = current.filter((name) => !incoming.includes(name));
  const removedBefore = current
    .slice(0, index)
    .filter((name) => incoming.includes(name)).length;
  const at = Math.max(0, Math.min(index - removedBefore, rest.length));
  rest.splice(at, 0, ...incoming);
  return rest;
}

export function PipePanel() {
  const packages = useStore((s) => s.packages);
  const sessions = useStore((s) => s.sessions);
  const scriptStates = useStore((s) => s.scriptStates);
  const refreshPackages = useStore((s) => s.refreshPackages);
  const upsertSession = useStore((s) => s.upsertSession);
  const selectScript = useStore((s) => s.selectScript);
  const showReport = useStore((s) => s.showReport);
  const setPipeOpen = useStore((s) => s.setPipeOpen);
  const [releaseId, setReleaseId] = useState(RELEASES[0].id);
  const [extrasByRelease] = useState<Record<string, string[]>>(loadExtras);
  const [layout, setLayout] = useState<PipeLayout>(loadPipeLayout);
  const [dropAt, setDropAt] = useState<{ facetId: string; index: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const release = RELEASES.find((r) => r.id === releaseId) ?? RELEASES[0];
  const extras = extrasByRelease[release.id] ?? [];
  const namesOf = (facetId: string) => facetScriptNames(release, facetId, extras, layout);
  const allNames = release.facets.flatMap((facet) => namesOf(facet.id));

  const writeFacet = (facetId: string, names: string[], sourceFacetId?: string, sourceNames?: string[]) => {
    const next = loadPipeLayout();
    const releaseFacets = { ...(next.facets[release.id] ?? {}) };
    for (const facet of release.facets) {
      if (!releaseFacets[facet.id]) {
        releaseFacets[facet.id] = facetScriptNames(release, facet.id, extras, next);
      }
    }
    releaseFacets[facetId] = names;
    if (sourceFacetId && sourceFacetId !== facetId && sourceNames) {
      releaseFacets[sourceFacetId] = sourceNames;
    }
    next.facets[release.id] = releaseFacets;
    next.omitted = next.omitted.filter((name) => !names.includes(name));
    savePipeLayout(next);
  };

  useEffect(() => subscribePipeLayout(() => setLayout(loadPipeLayout())), []);

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
        true,
        useStore.getState().continueOnError
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

  const showErrors = async (rel: string) => {
    setError(null);
    try {
      const text = await fetchPipeReport(rel);
      showReport(`__report:${rel}`, text);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
          disabled={busy || Boolean(active) || allNames.length === 0}
          onClick={() => void runScripts(`pipe:${release.id}`, allNames)}
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
              const placed = namesOf("test").includes(item.script);
              return (
                <span
                  key={item.script}
                  draggable={!placed}
                  onDragStart={(event) => {
                    beginScriptDrag(event.dataTransfer, [item.script], undefined, false);
                    event.dataTransfer.effectAllowed = "copy";
                  }}
                  onDragEnd={() => endScriptDrag()}
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
          const names = namesOf(facet.id);
          const empty = names.length === 0;
          const running =
            session?.status === "running" || session?.status === "queued";
          const rows = names.map((name) => {
            const id = scriptId(packages, name);
            const pkg = packages.find((item) => item.scripts[name]);
            const display = resolveDisplayStatus(
              scriptStates.get(id),
              latestPipeStep(sessions, release.id, name)
            );
            return {
              name,
              id,
              pkg,
              display,
              report: display.status === "failed" ? reportPath(packages, name) : null,
            };
          });
          const runningName = rows.find((row) => row.display.status === "running")?.name;
          const done = rows.filter(
            (row) =>
              row.display.status === "passed" ||
              row.display.status === "failed" ||
              row.display.status === "skipped"
          ).length;
          const failed = rows.some((row) => row.display.status === "failed");
          const dropHere = (event: React.DragEvent, index: number) => {
            if (!pipeDragActive()) return;
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = activePipeDrag?.fromFacet ? "move" : "copy";
            setDropAt({ facetId: facet.id, index });
          };
          const commitDrop = (event: React.DragEvent) => {
            event.preventDefault();
            event.stopPropagation();
            const index = dropAt?.facetId === facet.id ? dropAt.index : names.length;
            setDropAt(null);
            const incoming = dragScriptNames(packages);
            if (incoming.length === 0) {
              for (const token of event.dataTransfer.getData("text/plain").split(/\r?\n/)) {
                const name = scriptNameFromDrag(packages, token);
                if (name && !incoming.includes(name)) incoming.push(name);
              }
            }
            if (incoming.length === 0) return;
            const from = activePipeDrag?.fromFacet;
            const fromId = from?.startsWith(`${release.id}:`)
              ? from.slice(`${release.id}:`.length)
              : undefined;
            const sourceNames =
              fromId && fromId !== facet.id
                ? namesOf(fromId).filter((name) => !incoming.includes(name))
                : undefined;
            writeFacet(facet.id, placeScripts(names, incoming, index), fromId, sourceNames);
            endScriptDrag();
          };
          return (
            <section
              key={facet.id}
              className="rounded-md px-2 py-2"
              style={{
                border:
                  dropAt?.facetId === facet.id
                    ? "1px solid #6366f1"
                    : "1px solid var(--color-border)",
              }}
              onDragOver={(event) => {
                if (!pipeDragActive()) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = activePipeDrag?.fromFacet ? "move" : "copy";
                setDropAt({ facetId: facet.id, index: names.length });
              }}
              onDragLeave={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node)) return;
                setDropAt((current) => (current?.facetId === facet.id ? null : current));
              }}
              onDrop={commitDrop}
            >
              <div className="flex items-center gap-2">
                <span
                  className="text-xs font-semibold truncate"
                  style={{ color: "var(--color-text)" }}
                >
                  {facet.label}
                </span>
                {runningName && (
                  <span
                    className="text-[10px] truncate flex-1"
                    style={{ color: "#22c55e" }}
                    title="Current step"
                  >
                    {runningName}
                  </span>
                )}
                {!runningName && <span className="flex-1" />}
                {(done > 0 || Boolean(runningName)) && (
                  <span
                    className="text-[11px] tabular-nums shrink-0"
                    style={{
                      color: failed
                        ? "#ef4444"
                        : done === names.length
                          ? "#22c55e"
                          : "var(--color-muted)",
                    }}
                    title={failed ? "A step failed" : "Finished steps"}
                  >
                    {done}/{names.length}
                  </span>
                )}
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
                <p
                  className="text-[10px] mt-1 rounded px-1 py-1"
                  style={{
                    color: "var(--color-muted)",
                    boxShadow:
                      dropAt?.facetId === facet.id
                        ? "inset 0 0 0 1px #6366f1"
                        : undefined,
                  }}
                  onDragOver={(event) => dropHere(event, 0)}
                >
                  Nothing on this track
                </p>
              ) : (
                <ul className="mt-1 flex flex-col">
                  {rows.map((row, index) => {
                    const { name, id, pkg, display, report } = row;
                    return (
                      <li key={name} className="flex flex-col">
                        {dropAt?.facetId === facet.id && dropAt.index === index && (
                          <div className="h-0.5 rounded my-0.5" style={{ background: "#6366f1" }} />
                        )}
                        <div
                          onDragOver={(event) => {
                            if (!pipeDragActive()) return;
                            const rect = event.currentTarget.getBoundingClientRect();
                            const next =
                              event.clientY < rect.top + rect.height / 2 ? index : index + 1;
                            dropHere(event, next);
                          }}
                          style={{
                            background:
                              display.status === "running"
                                ? "rgba(34,197,94,0.12)"
                                : display.status === "failed"
                                  ? "rgba(239,68,68,0.08)"
                                  : undefined,
                          }}
                        >
                          {pkg ? (
                            <ScriptRow
                              packageName={pkg.name}
                              scriptName={name}
                              command={pkg.scripts[name]}
                              draggable
                              stacked
                              inGroup
                              onRunFromHere={() =>
                                void runScripts(
                                  `pipe:${release.id}:${facet.id}`,
                                  names.slice(index)
                                )
                              }
                              extraContextItems={[
                                {
                                  id: "remove-segment",
                                  label: "Remove from segment",
                                  icon: <X size={12} />,
                                  onSelect: () =>
                                    writeFacet(
                                      facet.id,
                                      names.filter((script) => script !== name)
                                    ),
                                },
                              ]}
                              onDragStart={(event) => {
                                beginScriptDrag(
                                  event.dataTransfer,
                                  [id],
                                  `${release.id}:${facet.id}`
                                );
                              }}
                              onDragEnd={() => endScriptDrag()}
                              errorReport={
                                report
                                  ? { path: report, onShow: () => void showErrors(report) }
                                  : null
                              }
                            />
                          ) : (
                            <button
                              type="button"
                              className="text-left text-[11px] px-2 py-1"
                              style={{ color: "var(--color-muted)" }}
                              onClick={() =>
                                writeFacet(
                                  facet.id,
                                  names.filter((script) => script !== name)
                                )
                              }
                            >
                              {name} — missing, click to remove
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                  {dropAt?.facetId === facet.id && dropAt.index === names.length && (
                    <div className="h-0.5 rounded my-0.5" style={{ background: "#6366f1" }} />
                  )}
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
