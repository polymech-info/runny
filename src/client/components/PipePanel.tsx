import React, { useEffect, useRef, useState } from "react";
import { ArrowRight, Boxes, GripVertical, ListStart, Play, Plus, Square, Volume2, VolumeX, X } from "lucide-react";
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
  activeSegmentDrag,
  beginScriptDrag,
  beginSegmentDrag,
  endScriptDrag,
  endSegmentDrag,
} from "../lib/favourite-dnd";
import {
  applyPipeRename,
  loadPipeLayout,
  savePipeLayout,
  subscribePipeLayout,
  type PipeLayout,
  type PipeSegmentFlag,
} from "../lib/pipe-layout";
import { resolveDisplayStatus } from "../lib/script-status";
import { useStore } from "../store/scripts";
import { ScriptInsertMenu } from "./ScriptInsertMenu";
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

function testPalette(prefix: string): PaletteItem[] {
  return [
    { label: "xblox-next", script: `${prefix}:xblox-next` },
    { label: "xblox-language", script: `${prefix}:xblox-language` },
    { label: "xblox-network", script: `${prefix}:xblox-network` },
    { label: "ipc-next", script: `${prefix}:ipc-next` },
    { label: "editor", script: `${prefix}:editor` },
    { label: "llama", script: `${prefix}:llama` },
    { label: "seed", script: "test:store-tanit:seed" },
  ];
}

const ZIP_PALETTE = testPalette("pipe:zip:test").filter((item) => item.label !== "seed");
const STORE_PALETTE = testPalette("pipe:store:test");

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
  {
    id: "tanit-store",
    label: "tanit store",
    preset: "store-tanit-msix-release",
    facets: [
      {
        id: "build",
        label: "Build",
        scripts: ["update:chat", "update:settings", "update:xblox", "build:cpp:store-tanit"],
      },
      { id: "stage", label: "Stage", scripts: ["release:stage-tanit-store"] },
      {
        id: "test",
        label: "Test",
        scripts: ["pipe:store:test:core", "pipe:store:test:xblox"],
      },
      {
        id: "pack",
        label: "Pack",
        scripts: ["package:store-tanit:msix", "audit:store-tanit:msix"],
      },
      {
        id: "deploy",
        label: "Deploy",
        scripts: ["msstore:status", "msstore:preview"],
      },
    ],
    palette: STORE_PALETTE,
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

type ShownFacet = Facet & { custom: boolean };

function shownFacets(release: Release, layout: PipeLayout): ShownFacet[] {
  const builtins = release.facets.map((facet) => ({ ...facet, custom: false }));
  const customs = (layout.custom[release.id] ?? []).map((facet) => ({
    id: facet.id,
    label: facet.label,
    scripts: [] as string[],
    custom: true,
  }));
  const known = new Map([...builtins, ...customs].map((facet) => [facet.id, facet]));
  const stored = (layout.order[release.id] ?? builtins.map((facet) => facet.id)).filter((id) =>
    known.has(id)
  );
  for (const facet of [...builtins, ...customs]) {
    if (!stored.includes(facet.id)) stored.push(facet.id);
  }
  return stored.map((id) => known.get(id)!);
}

function SegmentAdd({
  label,
  open,
  onOpen,
}: {
  label: string;
  open: boolean;
  onOpen: (anchor: HTMLButtonElement) => void;
}) {
  return (
    <button
      type="button"
      className="mt-1 inline-flex items-center justify-center rounded-full"
      style={{
        width: 18,
        height: 18,
        border: open ? "1px solid #6366f1" : "1px solid rgba(99,102,241,0.45)",
        background: open ? "rgba(99,102,241,0.22)" : "rgba(99,102,241,0.12)",
        color: "#6366f1",
      }}
      title={`Add to ${label}`}
      aria-label={`Add to ${label}`}
      onClick={(event) => onOpen(event.currentTarget)}
    >
      <Plus size={11} />
    </button>
  );
}

function moveFacet(ids: string[], facetId: string, index: number): string[] {
  const from = ids.indexOf(facetId);
  if (from < 0) return ids;
  const rest = ids.filter((id) => id !== facetId);
  const at = Math.max(0, Math.min(from < index ? index - 1 : index, rest.length));
  rest.splice(at, 0, facetId);
  return rest;
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
  const [segmentDrop, setSegmentDrop] = useState<number | null>(null);
  const [segmentName, setSegmentName] = useState("");
  const [insert, setInsert] = useState<{ facetId: string; nonce: number } | null>(null);
  const insertAnchorRef = useRef<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const release = RELEASES.find((r) => r.id === releaseId) ?? RELEASES[0];
  const extras = extrasByRelease[release.id] ?? [];
  const namesOf = (facetId: string) => facetScriptNames(release, facetId, extras, layout);
  const shown = shownFacets(release, layout);
  const segmentFlag = (facetId: string): PipeSegmentFlag =>
    layout.segments[release.id]?.[facetId] ?? {};
  const facetsFrom = (facetId: string, skipMuted: boolean) => {
    const start = shown.findIndex((facet) => facet.id === facetId);
    if (start < 0) return [];
    return shown
      .slice(start)
      .filter((facet) => !(skipMuted && segmentFlag(facet.id).muted));
  };
  const pipeFacets = facetsFrom(shown[0]?.id ?? "", true);
  const allNames = pipeFacets.flatMap((facet) => namesOf(facet.id));

  const writeFacet = (facetId: string, names: string[], sourceFacetId?: string, sourceNames?: string[]) => {
    const next = loadPipeLayout();
    const releaseFacets = { ...(next.facets[release.id] ?? {}) };
    for (const facet of shownFacets(release, next)) {
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

  const openPicker = (facetId: string, anchor: HTMLButtonElement) => {
    insertAnchorRef.current = anchor;
    setInsert({ facetId, nonce: Date.now() });
  };

  const pickScript = (scriptId: string) => {
    const facetId = insert?.facetId;
    setInsert(null);
    if (!facetId) return;
    const name = scriptNameFromDrag(packages, scriptId);
    if (!name) return;
    const names = namesOf(facetId);
    if (names.includes(name)) return;
    writeFacet(facetId, [...names, name]);
  };

  const reorderSegment = (facetId: string, index: number) => {
    const next = loadPipeLayout();
    next.order[release.id] = moveFacet(
      shownFacets(release, next).map((facet) => facet.id),
      facetId,
      index
    );
    savePipeLayout(next);
  };

  const addSegment = () => {
    const label = segmentName.trim();
    if (!label) return;
    const next = loadPipeLayout();
    const id = `c_${Date.now().toString(36)}`;
    const ids = shownFacets(release, next).map((facet) => facet.id);
    next.custom[release.id] = [...(next.custom[release.id] ?? []), { id, label }];
    next.order[release.id] = [...ids, id];
    const lists = { ...(next.facets[release.id] ?? {}) };
    lists[id] = [];
    next.facets[release.id] = lists;
    savePipeLayout(next);
    setSegmentName("");
  };

  const removeSegment = (facetId: string) => {
    const next = loadPipeLayout();
    next.custom[release.id] = (next.custom[release.id] ?? []).filter((facet) => facet.id !== facetId);
    if (next.order[release.id]) {
      next.order[release.id] = next.order[release.id].filter((id) => id !== facetId);
    }
    if (next.facets[release.id]) delete next.facets[release.id][facetId];
    if (next.segments[release.id]) delete next.segments[release.id][facetId];
    savePipeLayout(next);
  };

  const toggleSegment = (facetId: string, key: keyof PipeSegmentFlag) => {
    const next = loadPipeLayout();
    const releaseFlags = { ...(next.segments[release.id] ?? {}) };
    const current = releaseFlags[facetId] ?? {};
    releaseFlags[facetId] = { ...current, [key]: !current[key] };
    next.segments[release.id] = releaseFlags;
    savePipeLayout(next);
  };

  const continueIdsFor = (names: string[], facetIds: string[]) => {
    const global = new Set(useStore.getState().continueOnError);
    const covered = new Set<string>();
    for (const facetId of facetIds) {
      if (!segmentFlag(facetId).continueOnError) continue;
      for (const name of namesOf(facetId)) {
        if (names.includes(name)) covered.add(name);
      }
    }
    const ids: string[] = [];
    for (const name of names) {
      const id = scriptId(packages, name);
      if (covered.has(name) || global.has(id)) ids.push(id);
    }
    return ids;
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

  const runScripts = async (groupPath: string, names: string[], facetIds: string[]) => {
    if (names.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const started = await startFavouriteSession(
        groupPath,
        names.map((name) => scriptId(packages, name)),
        true,
        continueIdsFor(names, facetIds)
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
          title="Run unmuted segments"
          onClick={() =>
            void runScripts(
              `pipe:${release.id}`,
              allNames,
              pipeFacets.map((facet) => facet.id)
            )
          }
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
        {shown.map((facet, facetIndex) => {
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
          const muted = Boolean(segmentFlag(facet.id).muted);
          const continues = Boolean(segmentFlag(facet.id).continueOnError);
          const tail = facetsFrom(facet.id, true);
          const fromHere = tail.flatMap((item) => namesOf(item.id));
          const dropHere = (event: React.DragEvent, index: number) => {
            if (activeSegmentDrag) return;
            if (!pipeDragActive()) return;
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = activePipeDrag?.fromFacet ? "move" : "copy";
            setDropAt({ facetId: facet.id, index });
          };
          const commitDrop = (event: React.DragEvent) => {
            event.preventDefault();
            event.stopPropagation();
            if (activeSegmentDrag?.releaseId === release.id) {
              const index = segmentDrop ?? facetIndex;
              const dragged = activeSegmentDrag.facetId;
              setSegmentDrop(null);
              endSegmentDrag();
              reorderSegment(dragged, index);
              return;
            }
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
            <React.Fragment key={facet.id}>
            {segmentDrop === facetIndex && (
              <div className="h-0.5 rounded" style={{ background: "#6366f1" }} />
            )}
            <section
              className="rounded-md px-2 py-2"
              style={{
                border:
                  dropAt?.facetId === facet.id
                    ? "1px solid #6366f1"
                    : "1px solid var(--color-border)",
                opacity: muted ? 0.55 : undefined,
              }}
              onDragOver={(event) => {
                if (activeSegmentDrag?.releaseId === release.id) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  const rect = event.currentTarget.getBoundingClientRect();
                  const next =
                    event.clientY < rect.top + rect.height / 2 ? facetIndex : facetIndex + 1;
                  setSegmentDrop(next);
                  setDropAt(null);
                  return;
                }
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
                  draggable
                  className="cursor-grab active:cursor-grabbing shrink-0"
                  style={{ color: "var(--color-muted)" }}
                  title="Drag to reorder"
                  aria-label={`Reorder ${facet.label}`}
                  onDragStart={(event) => {
                    event.stopPropagation();
                    beginSegmentDrag(release.id, facet.id);
                    event.dataTransfer.setData("text/plain", facet.id);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => {
                    setSegmentDrop(null);
                    endSegmentDrag();
                  }}
                >
                  <GripVertical size={12} />
                </span>
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
                <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded disabled:opacity-30"
                  style={{ width: 16, height: 16, color: "var(--color-muted)" }}
                  title={`Run from ${facet.label}`}
                  aria-label={`Run from ${facet.label}`}
                  disabled={fromHere.length === 0 || busy || Boolean(active)}
                  onClick={() =>
                    void runScripts(
                      `pipe:${release.id}`,
                      fromHere,
                      tail.map((item) => item.id)
                    )
                  }
                >
                  <ListStart size={12} />
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded"
                  style={{
                    width: 16,
                    height: 16,
                    background: continues ? "rgba(245,158,11,0.16)" : "transparent",
                    color: continues ? "#d97706" : "var(--color-muted)",
                  }}
                  title={
                    continues
                      ? "Continuing on error for any script in this segment"
                      : "Continue on error — any script in this segment"
                  }
                  aria-label="Continue on error"
                  aria-pressed={continues}
                  onClick={() => toggleSegment(facet.id, "continueOnError")}
                >
                  <ArrowRight size={12} />
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded"
                  style={{
                    width: 16,
                    height: 16,
                    color: muted ? "#d97706" : "var(--color-muted)",
                  }}
                  title={muted ? "Unmute segment" : "Mute — skip this segment when the pipe runs"}
                  aria-label={muted ? "Unmute segment" : "Mute segment"}
                  aria-pressed={muted}
                  onClick={() => toggleSegment(facet.id, "muted")}
                >
                  {muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                </button>
                <button
                  type="button"
                  className="p-1 rounded hover:opacity-80 disabled:opacity-30"
                  style={{ color: running ? "#ef4444" : "var(--color-muted)" }}
                  title={empty ? "Nothing on this track" : `Run ${facet.label}`}
                  aria-label={empty ? `${facet.label} empty` : `Run ${facet.label}`}
                  disabled={empty || busy || (Boolean(active) && !running)}
                  onClick={() => {
                    if (running && session) void stopActive();
                    else void runScripts(`pipe:${release.id}:${facet.id}`, names, [facet.id]);
                  }}
                >
                  {running ? <Square size={12} /> : <Play size={12} />}
                </button>
                {facet.custom && (
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded"
                    style={{ width: 16, height: 16, color: "#dc2626" }}
                    title="Remove segment"
                    aria-label={`Remove ${facet.label}`}
                    onClick={() => removeSegment(facet.id)}
                  >
                    <X size={12} />
                  </button>
                )}
                </div>
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
                                  names.slice(index),
                                  [facet.id]
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
              <SegmentAdd
                label={facet.label}
                open={insert?.facetId === facet.id}
                onOpen={(anchor) => openPicker(facet.id, anchor)}
              />
            </section>
            </React.Fragment>
          );
        })}
        {segmentDrop === shown.length && (
          <div className="h-0.5 rounded" style={{ background: "#6366f1" }} />
        )}
        <form
          className="flex items-center gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            addSegment();
          }}
          onDragOver={(event) => {
            if (activeSegmentDrag?.releaseId !== release.id) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setSegmentDrop(shown.length);
          }}
          onDrop={(event) => {
            if (activeSegmentDrag?.releaseId !== release.id) return;
            event.preventDefault();
            const dragged = activeSegmentDrag.facetId;
            setSegmentDrop(null);
            endSegmentDrag();
            reorderSegment(dragged, shown.length);
          }}
        >
          <input
            value={segmentName}
            onChange={(event) => setSegmentName(event.target.value)}
            placeholder="New segment"
            aria-label="New segment"
            className="flex-1 min-w-0 text-xs rounded px-1.5 py-1 outline-none"
            style={{
              background: "var(--color-bg)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
            }}
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-1 rounded disabled:opacity-30"
            style={{ color: "var(--color-text)", background: "var(--color-border)" }}
            disabled={!segmentName.trim()}
            title="Add a segment"
          >
            <Plus size={12} />
            Add
          </button>
        </form>
        {error && (
          <p className="text-[11px]" style={{ color: "#ef4444" }}>
            {error}
          </p>
        )}
      </div>
      {insert && (
        <ScriptInsertMenu
          key={insert.nonce}
          anchorRef={insertAnchorRef}
          onPick={pickScript}
          onClose={() => setInsert(null)}
        />
      )}
    </div>
  );
}
