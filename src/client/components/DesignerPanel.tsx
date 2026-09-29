import React, { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Play,
  Plus,
  Square,
  Volume2,
  VolumeX,
  Workflow,
  X,
} from "lucide-react";
import {
  favouriteSessionPath,
  queueScript,
  sessionStepScriptId,
  startFavouriteSession,
  stopSession,
  unqueueScript,
  type PackageInfo,
  type Session,
} from "../lib/api";
import {
  activeFavouriteDrag,
  setActiveFavouriteDrag,
} from "../lib/favourite-dnd";
import { useScriptRunner } from "../hooks/useScriptRunner";
import {
  latestSessionStep,
  resolveDisplayStatus,
  type DisplayStatus,
} from "../lib/script-status";
import { useStore } from "../store/scripts";
import { ScriptInsertMenu } from "./ScriptInsertMenu";
import { StatusBadge } from "./StatusBadge";
import {
  ContextMenu,
  useContextMenu,
  type ContextMenuItem,
} from "./ui/ContextMenu";

const OPEN_KEY = "runny-designer-open";

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

function findFlowSession(
  sessions: Map<string, Session>,
  groupId: string
): Session | undefined {
  const path = favouriteSessionPath(groupId);
  let best: Session | undefined;
  for (const session of sessions.values()) {
    if (session.groupPath !== path) continue;
    if (!best || session.startedAt > best.startedAt) best = session;
  }
  return best;
}

function nodeChrome(
  status: DisplayStatus,
  selected: boolean
): React.CSSProperties {
  if (status === "running") {
    return {
      border: "1px solid #22c55e",
      background: "rgba(34,197,94,0.10)",
      boxShadow: selected ? "0 0 0 3px rgba(34,197,94,0.2)" : undefined,
    };
  }
  if (status === "failed") {
    return {
      border: "1px solid #ef4444",
      background: "rgba(239,68,68,0.10)",
      boxShadow: selected ? "0 0 0 3px rgba(239,68,68,0.2)" : undefined,
    };
  }
  if (selected) {
    return {
      border: "1px solid #6366f1",
      background: "rgba(99,102,241,0.08)",
      boxShadow: "0 0 0 3px rgba(99,102,241,0.15)",
    };
  }
  return {
    border: "1px solid var(--color-border)",
    background: "var(--color-bg)",
  };
}

function InsertPlus({
  index,
  hot,
  open,
  label,
  onOpen,
}: {
  index: number;
  hot?: boolean;
  open?: boolean;
  label: string;
  onOpen: (index: number, anchor: HTMLButtonElement) => void;
}) {
  return (
    <button
      type="button"
      data-insert={index}
      className="inline-flex items-center justify-center rounded-full shrink-0"
      style={{
        width: 22,
        height: 22,
        border: hot || open ? "1px solid #6366f1" : "1px solid rgba(99,102,241,0.45)",
        background: hot || open ? "rgba(99,102,241,0.22)" : "rgba(99,102,241,0.12)",
        color: "#6366f1",
      }}
      title={label}
      aria-label={label}
      aria-haspopup="dialog"
      aria-expanded={open || undefined}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onOpen(index, event.currentTarget);
      }}
    >
      <Plus size={13} aria-hidden />
    </button>
  );
}

function typingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable
  );
}

export function DesignerPanel() {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(OPEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [flowId, setFlowId] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [insert, setInsert] = useState<{ index: number; nonce: number } | null>(null);
  const insertAnchorRef = useRef<HTMLElement | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();
  const { run } = useScriptRunner();

  const groups = useStore((s) => s.favouriteGroups);
  const packages = useStore((s) => s.packages);
  const sessions = useStore((s) => s.sessions);
  const scriptStates = useStore((s) => s.scriptStates);
  const continueOnError = useStore((s) => s.continueOnError);
  const runQueue = useStore((s) => s.runQueue);
  const addFavouriteGroup = useStore((s) => s.addFavouriteGroup);
  const renameFavouriteGroup = useStore((s) => s.renameFavouriteGroup);
  const insertFavouriteScript = useStore((s) => s.insertFavouriteScript);
  const moveFavouriteScript = useStore((s) => s.moveFavouriteScript);
  const copyFavouriteScript = useStore((s) => s.copyFavouriteScript);
  const removeFavouriteScript = useStore((s) => s.removeFavouriteScript);
  const toggleFavouriteMute = useStore((s) => s.toggleFavouriteMute);
  const toggleContinueOnError = useStore((s) => s.toggleContinueOnError);
  const setRunQueue = useStore((s) => s.setRunQueue);
  const upsertSession = useStore((s) => s.upsertSession);
  const selectScript = useStore((s) => s.selectScript);

  const flow =
    groups.find((g) => g.id === flowId) ?? groups[0] ?? null;
  const scriptIds = flow?.scriptIds ?? [];
  const muted = new Set(flow?.mutedScriptIds ?? []);
  const session = flow ? findFlowSession(sessions, flow.id) : undefined;
  const flowRunning =
    session?.status === "running" || session?.status === "queued";

  useEffect(() => {
    if (flow && flow.id !== flowId) setFlowId(flow.id);
  }, [flow, flowId]);

  useEffect(() => {
    setSelectedIndex((index) =>
      scriptIds.length === 0 ? 0 : Math.min(index, scriptIds.length - 1)
    );
  }, [scriptIds.length, flow?.id]);

  const setOpenPersisted = (next: boolean) => {
    setOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, next ? "1" : "0");
    } catch {
      // ignore
    }
  };

  const openInsert = (index: number, anchor: HTMLElement) => {
    insertAnchorRef.current = anchor;
    setInsert({ index, nonce: Date.now() });
  };

  const closeInsert = () => {
    setInsert(null);
    panelRef.current?.focus();
  };

  const pickInsert = (scriptId: string) => {
    if (!flow || !insert) return;
    const index = insert.index;
    if (flow.scriptIds.includes(scriptId)) {
      placeScript(scriptId, flow.id, index);
    } else {
      insertFavouriteScript(scriptId, flow.id, index);
    }
    const next = useStore
      .getState()
      .favouriteGroups.find((g) => g.id === flow.id);
    const at = next?.scriptIds.indexOf(scriptId) ?? index;
    setSelectedIndex(at < 0 ? index : at);
    setInsert(null);
    panelRef.current?.focus();
  };

  const placeScript = (scriptId: string, fromGroupId: string, index: number) => {
    if (!flow) return;
    const fromKnown = groups.some((g) => g.id === fromGroupId);
    if (!fromGroupId || !fromKnown) {
      insertFavouriteScript(scriptId, flow.id, index);
      return;
    }
    if (fromGroupId !== flow.id) {
      copyFavouriteScript(scriptId, fromGroupId, flow.id, index);
      return;
    }
    let nextIndex = index;
    const fromIndex = flow.scriptIds.indexOf(scriptId);
    if (fromIndex !== -1 && fromIndex < index) nextIndex -= 1;
    moveFavouriteScript(scriptId, flow.id, flow.id, nextIndex);
  };

  const onCanvasDragOver = (e: React.DragEvent) => {
    if (activeFavouriteDrag?.kind !== "script") return;
    e.preventDefault();
    e.dataTransfer.dropEffect =
      activeFavouriteDrag.fromGroupId === flow?.id ? "move" : "copy";
    const cards = canvasRef.current?.querySelectorAll<HTMLElement>("[data-step]");
    if (!cards || cards.length === 0) {
      setDropAt(scriptIds.length);
      return;
    }
    let index = scriptIds.length;
    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) {
        index = Number(card.dataset.step);
        break;
      }
    }
    setDropAt(index);
  };

  const onCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const drag = activeFavouriteDrag;
    const index = dropAt ?? scriptIds.length;
    setDropAt(null);
    if (!drag || drag.kind !== "script" || !flow) return;
    placeScript(drag.scriptId, drag.fromGroupId, index);
    setSelectedIndex(index);
    setActiveFavouriteDrag(null);
  };

  const createFlow = () => {
    addFavouriteGroup("New flow");
    const created = useStore.getState().favouriteGroups.at(-1);
    if (created) {
      setFlowId(created.id);
      setSelectedIndex(0);
      setRenaming(true);
      setNameDraft(created.name);
    }
  };

  const runFlow = async (fromIndex = 0) => {
    if (!flow) return;
    setBusy(true);
    setError(null);
    try {
      if (flowRunning && session && fromIndex === 0) {
        const stopped = await stopSession(session.id);
        upsertSession(stopped);
        return;
      }
      const ids = flow.scriptIds.slice(fromIndex).filter((id) => {
        return resolveScript(packages, id) !== null && !muted.has(id);
      });
      if (ids.length === 0) return;
      const started = await startFavouriteSession(
        favouriteSessionPath(flow.id),
        ids,
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

  const stepMenu = (index: number): ContextMenuItem[] => {
    const id = scriptIds[index];
    const resolved = id ? resolveScript(packages, id) : null;
    if (!id || !resolved || !flow) return [];
    const continues = continueOnError.includes(id);
    const queued = runQueue.includes(id);
    return [
      {
        id: "run",
        label: "Run",
        icon: <Play size={12} />,
        onSelect: () => {
          void run(resolved.packageName, resolved.scriptName);
        },
      },
      {
        id: "queue",
        label: queued ? "Remove from queue" : "Queue",
        icon: <ArrowRight size={12} />,
        onSelect: () => {
          const op = queued
            ? unqueueScript(id)
            : queueScript(resolved.packageName, resolved.scriptName);
          void op.then((ids) => setRunQueue(ids));
        },
      },
      {
        id: "run-from",
        label: "Run from here",
        icon: <Play size={12} />,
        disabled: flowRunning || busy,
        onSelect: () => void runFlow(index),
      },
      { type: "separator", id: "sep-flags" },
      {
        id: "continue",
        label: continues ? "Stop group on error" : "Continue",
        icon: <ArrowRight size={12} />,
        onSelect: () => toggleContinueOnError(id),
      },
      {
        id: "mute",
        label: muted.has(id) ? "Unmute" : "Mute",
        icon: muted.has(id) ? <VolumeX size={12} /> : <Volume2 size={12} />,
        onSelect: () => toggleFavouriteMute(flow.id, id),
      },
      { type: "separator", id: "sep-move" },
      {
        id: "up",
        label: "Move up",
        disabled: index === 0,
        onSelect: () => moveFavouriteScript(id, flow.id, flow.id, index - 1),
      },
      {
        id: "down",
        label: "Move down",
        disabled: index >= scriptIds.length - 1,
        onSelect: () => moveFavouriteScript(id, flow.id, flow.id, index + 1),
      },
      {
        id: "remove",
        label: "Remove from flow",
        icon: <X size={12} />,
        danger: true,
        onSelect: () => removeFavouriteScript(flow.id, id),
      },
    ];
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || typingTarget(e.target) || !flow) return;
    if ((e.target as HTMLElement | null)?.closest?.("button")) return;
    const id = scriptIds[selectedIndex];
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(scriptIds.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if ((e.key === "Delete" || e.key === "Backspace") && id) {
      e.preventDefault();
      removeFavouriteScript(flow.id, id);
    } else if (e.key === "Enter" && id) {
      e.preventDefault();
      const resolved = resolveScript(packages, id);
      if (resolved) void run(resolved.packageName, resolved.scriptName);
    } else if ((e.key === "c" || e.key === "C") && id && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      toggleContinueOnError(id);
    } else if ((e.key === "m" || e.key === "M") && id && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      toggleFavouriteMute(flow.id, id);
    } else if ((e.key === "q" || e.key === "Q") && id && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      const resolved = resolveScript(packages, id);
      if (!resolved) return;
      const op = runQueue.includes(id)
        ? unqueueScript(id)
        : queueScript(resolved.packageName, resolved.scriptName);
      void op.then((ids) => setRunQueue(ids));
    } else if (e.altKey && e.key === "ArrowUp" && id && selectedIndex > 0) {
      e.preventDefault();
      moveFavouriteScript(id, flow.id, flow.id, selectedIndex - 1);
      setSelectedIndex((i) => i - 1);
    } else if (
      e.altKey &&
      e.key === "ArrowDown" &&
      id &&
      selectedIndex < scriptIds.length - 1
    ) {
      e.preventDefault();
      moveFavouriteScript(id, flow.id, flow.id, selectedIndex + 1);
      setSelectedIndex((i) => i + 1);
    } else if (
      (e.key === "+" || e.key === "=") &&
      !e.altKey &&
      !e.metaKey &&
      !e.ctrlKey
    ) {
      e.preventDefault();
      const index =
        scriptIds.length === 0
          ? 0
          : Math.min(scriptIds.length, selectedIndex + 1);
      const btn = canvasRef.current?.querySelector<HTMLButtonElement>(
        `[data-insert="${index}"]`
      );
      if (btn) openInsert(index, btn);
    } else if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
      e.preventDefault();
      const card = canvasRef.current?.querySelector<HTMLElement>(
        `[data-step="${selectedIndex}"]`
      );
      const rect = card?.getBoundingClientRect();
      if (!rect) return;
      openMenu(
        {
          preventDefault() {},
          stopPropagation() {},
          clientX: rect.left + 12,
          clientY: rect.bottom,
        } as React.MouseEvent,
        stepMenu(selectedIndex)
      );
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        className="shrink-0 flex flex-col items-center gap-2 py-3"
        style={{
          width: 28,
          borderRight: "1px solid var(--color-border)",
          background: "var(--color-surface)",
          color: "var(--color-muted)",
        }}
        title="Open designer"
        aria-label="Open designer"
        onClick={() => setOpenPersisted(true)}
      >
        <Workflow size={14} />
        <span
          className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ writingMode: "vertical-rl" }}
        >
          Designer
        </span>
        <ChevronRight size={12} />
      </button>
    );
  }

  return (
    <div
      ref={panelRef}
      className="shrink-0 flex flex-col overflow-hidden outline-none"
      style={{
        width: 320,
        borderRight: "1px solid var(--color-border)",
        background: "var(--color-surface)",
      }}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <ContextMenu menu={menu} onClose={closeMenu} />
      <div
        className="h-10 flex items-center gap-1 px-2 shrink-0"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <Workflow size={14} style={{ color: "var(--color-muted)" }} />
        {renaming && flow ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => {
              const name = nameDraft.trim();
              if (name) renameFavouriteGroup(flow.id, name);
              setRenaming(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setRenaming(false);
            }}
            className="flex-1 min-w-0 text-xs rounded px-1 py-0.5 outline-none"
            style={{
              background: "var(--color-bg)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
            }}
          />
        ) : (
          <select
            className="flex-1 min-w-0 text-xs bg-transparent outline-none truncate"
            style={{ color: "var(--color-text)" }}
            value={flow?.id ?? ""}
            onChange={(e) => {
              setFlowId(e.target.value);
              setSelectedIndex(0);
            }}
            aria-label="Flow"
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          className="p-1 rounded hover:opacity-80"
          style={{ color: "var(--color-muted)" }}
          title="New flow"
          aria-label="New flow"
          onClick={createFlow}
        >
          <Plus size={13} />
        </button>
        <button
          type="button"
          className="p-1 rounded hover:opacity-80 disabled:opacity-30"
          style={{ color: flowRunning ? "#ef4444" : "var(--color-muted)" }}
          title={flowRunning ? "Stop flow" : "Run flow"}
          aria-label={flowRunning ? "Stop flow" : "Run flow"}
          disabled={busy || (!flowRunning && scriptIds.length === 0)}
          onClick={() => void runFlow(0)}
        >
          {flowRunning ? <Square size={13} /> : <Play size={13} />}
        </button>
        <button
          type="button"
          className="p-1 rounded hover:opacity-80"
          style={{ color: "var(--color-muted)" }}
          title="Collapse designer"
          aria-label="Collapse designer"
          onClick={() => setOpenPersisted(false)}
        >
          <ChevronLeft size={14} />
        </button>
      </div>

      <div
        ref={canvasRef}
        className="flex-1 overflow-y-auto px-3 py-3"
        role="listbox"
        aria-label="Flow steps"
        onDragOver={onCanvasDragOver}
        onDragLeave={() => setDropAt(null)}
        onDrop={onCanvasDrop}
        onContextMenu={(e) => {
          if ((e.target as HTMLElement).closest("[data-step]")) return;
          if (!flow) return;
          openMenu(e, [
            {
              id: "rename",
              label: "Rename flow",
              onSelect: () => {
                setNameDraft(flow.name);
                setRenaming(true);
              },
            },
            {
              id: "new",
              label: "New flow",
              icon: <Plus size={12} />,
              onSelect: createFlow,
            },
          ]);
        }}
      >
        <div className="flex flex-col items-center gap-1">
          {scriptIds.length === 0 && (
            <p
              className="text-[11px] mb-1"
              style={{ color: "var(--color-muted)" }}
            >
              Add the first step
            </p>
          )}
          <InsertPlus
            index={0}
            hot={dropAt === 0}
            open={insert?.index === 0}
            label={scriptIds.length === 0 ? "Add the first step" : "Insert step"}
            onOpen={openInsert}
          />
          {scriptIds.map((id, index) => {
            const resolved = resolveScript(packages, id);
            const selected = index === selectedIndex;
            const continues = continueOnError.includes(id);
            const isMuted = muted.has(id);
            const display = resolved
              ? resolveDisplayStatus(
                  scriptStates.get(id),
                  latestSessionStep(
                    sessions,
                    resolved.packageName,
                    resolved.scriptName
                  )
                )
              : { status: "idle" as const, exitCode: null };
            return (
              <div key={`${id}-${index}`} className="flex flex-col items-center gap-1 w-full">
                <div
                  data-step={index}
                  role="option"
                  aria-selected={selected}
                  draggable={Boolean(resolved)}
                  onDragStart={(e) => {
                    setActiveFavouriteDrag({
                      kind: "script",
                      scriptId: id,
                      fromGroupId: flow?.id ?? "",
                    });
                    e.dataTransfer.setData("text/plain", id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => setActiveFavouriteDrag(null)}
                  onClick={() => {
                    setSelectedIndex(index);
                    if (resolved) selectScript(id);
                  }}
                  onContextMenu={(e) => {
                    e.stopPropagation();
                    setSelectedIndex(index);
                    openMenu(e, stepMenu(index));
                  }}
                  className="rounded-md px-2.5 py-2 cursor-grab w-full"
                  style={{
                    maxWidth: 240,
                    opacity: isMuted ? 0.55 : undefined,
                    ...nodeChrome(display.status, selected),
                  }}
                  title={resolved?.command ?? id}
                >
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={display.status} exitCode={display.exitCode} />
                    <span
                      className="text-[10px] tabular-nums w-4 shrink-0"
                      style={{ color: "var(--color-muted)" }}
                    >
                      {index + 1}
                    </span>
                    <span
                      className="flex-1 truncate text-xs"
                      style={{
                        color: "var(--color-text)",
                        textDecoration: isMuted ? "line-through" : undefined,
                      }}
                    >
                      {resolved?.scriptName ?? id}
                    </span>
                    <button
                      type="button"
                      className="shrink-0 inline-flex items-center justify-center rounded"
                      style={{
                        width: 16,
                        height: 16,
                        background: continues
                          ? "rgba(245,158,11,0.16)"
                          : "transparent",
                        color: continues ? "#d97706" : "var(--color-muted)",
                        opacity: continues ? 1 : 0.45,
                      }}
                      title="Continue"
                      aria-label="Continue"
                      aria-pressed={continues}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleContinueOnError(id);
                      }}
                    >
                      <ArrowRight size={11} />
                    </button>
                  </div>
                </div>
                <InsertPlus
                  index={index + 1}
                  hot={dropAt === index + 1}
                  open={insert?.index === index + 1}
                  label="Insert step"
                  onOpen={openInsert}
                />
              </div>
            );
          })}
        </div>
        {error && (
          <p className="mt-2 text-[11px]" style={{ color: "#ef4444" }}>
            {error}
          </p>
        )}
      </div>
      <div
        className="px-2 py-1 text-[10px] shrink-0"
        style={{
          color: "var(--color-muted)",
          borderTop: "1px solid var(--color-border)",
        }}
      >
        + insert · ↑↓ select · Enter run · C continue · M mute · Q queue · Alt+↑↓ move · Del remove
      </div>
      {insert && (
        <ScriptInsertMenu
          key={insert.nonce}
          anchorRef={insertAnchorRef}
          onPick={pickInsert}
          onClose={closeInsert}
        />
      )}
    </div>
  );
}
