import React, { useEffect, useState } from "react";
import {
  Play,
  Square,
  ChevronRight,
  Star,
  GripVertical,
  Pencil,
  X,
  Copy,
  Check,
  Volume2,
  VolumeX,
  Eye,
  EyeOff,
  ListStart,
  ListPlus,
  ArrowRight,
} from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { useScriptRunner } from "../hooks/useScriptRunner";
import { formatDuration, formatRunClock, formatTimeAgo } from "../lib/relative-time";
import { latestSessionStep, resolveDisplayStatus } from "../lib/script-status";
import { notePipeRename, omitPipeScript } from "../lib/pipe-layout";
import { useStore } from "../store/scripts";
import {
  queueScript,
  removePackageScript,
  unqueueScript,
  updatePackageScript,
} from "../lib/api";
import {
  ContextMenu,
  useContextMenu,
  type ContextMenuItem,
  type ContextMenuLeaf,
} from "./ui/ContextMenu";

interface ScriptRowProps {
  packageName: string;
  scriptName: string;
  command: string;
  indent?: boolean;
  /** When true, shows a drag handle for favourites reordering. */
  draggable?: boolean;
  /** Allow editing a custom hover description (favourites). */
  editableDescription?: boolean;
  /** Favourite-group mute: skip this script when running the group. */
  muted?: boolean;
  onToggleMute?: () => void;
  /** Favourite-group: run this group sequentially starting at this script. */
  onRunFromHere?: () => void;
  /** Row is inside a favourite group or a colon script group. */
  inGroup?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  /** Extra menu rows, inserted ahead of copy / remove. */
  extraContextItems?: ContextMenuItem[];
  /** Name on the first line; actions, last run, and duration on the next. */
  stacked?: boolean;
  /** Failure report shown on the second line. */
  errorReport?: { path: string; onShow: () => void } | null;
}

export function ScriptRow({
  packageName,
  scriptName,
  command,
  indent,
  draggable,
  editableDescription,
  muted,
  onToggleMute,
  onRunFromHere,
  inGroup,
  onDragStart,
  onDragEnd,
  extraContextItems,
  stacked,
  errorReport,
}: ScriptRowProps) {
  const [showCommand, setShowCommand] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [editingScript, setEditingScript] = useState(false);
  const [nameDraft, setNameDraft] = useState(scriptName);
  const [commandDraft, setCommandDraft] = useState(command);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();

  const { run, stop } = useScriptRunner();
  const id = `${packageName}:${scriptName}`;
  const scriptState = useStore((s) => s.scriptStates.get(id));
  const sessionStep = useStore((s) =>
    latestSessionStep(s.sessions, packageName, scriptName)
  );
  const selectedScriptId = useStore((s) => s.selectedScriptId);
  const selectScript = useStore((s) => s.selectScript);
  const refreshPackages = useStore((s) => s.refreshPackages);
  const packageManager = useStore((s) => s.config?.packageManager ?? "npm");
  const favouriteGroups = useStore((s) => s.favouriteGroups);
  const isFavourite = useStore((s) =>
    s.favouriteGroups.some((g) => g.scriptIds.includes(id))
  );
  const toggleFavourite = useStore((s) => s.toggleFavourite);
  const insertFavouriteScript = useStore((s) => s.insertFavouriteScript);
  const addFavouriteGroup = useStore((s) => s.addFavouriteGroup);
  const forgetScriptId = useStore((s) => s.forgetScriptId);
  const renameScriptId = useStore((s) => s.renameScriptId);
  const description = useStore((s) => s.scriptDescriptions[id]);
  const setScriptDescription = useStore((s) => s.setScriptDescription);
  const continuesOnError = useStore((s) => s.continueOnError.includes(id));
  const toggleContinueOnError = useStore((s) => s.toggleContinueOnError);
  const setRunQueue = useStore((s) => s.setRunQueue);
  const queuePos = useStore((s) => s.runQueue.indexOf(id));
  const [descDraft, setDescDraft] = useState(description ?? "");

  const { status, exitCode, endedAt } = resolveDisplayStatus(
    scriptState,
    sessionStep
  );
  const isRunning = status === "running";
  const isFinished =
    status === "passed" || status === "failed" || status === "skipped";
  const isSelected = selectedScriptId === id;
  const hoverText = description?.trim() || command;
  const editing = editingDesc || editingScript;
  // Tick so "Xm ago" stays fresh without a global clock store.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const live = Boolean(stacked && isRunning && sessionStep?.startedAt != null);
    if (!live && (!isFinished || endedAt == null)) return;
    const timer = window.setInterval(() => setNow(Date.now()), live ? 1000 : 30_000);
    return () => window.clearInterval(timer);
  }, [isFinished, endedAt, stacked, isRunning, sessionStep?.startedAt]);

  const startedAt = sessionStep?.startedAt ?? null;
  const durationMs =
    startedAt != null && endedAt != null
      ? endedAt - startedAt
      : isRunning && startedAt != null
        ? now - startedAt
        : null;
  const durationLabel = formatDuration(durationMs);
  const runClock = isFinished ? formatRunClock(endedAt, now) : "";

  const runCommand = `${packageManager} run ${scriptName}`;
  const ago = isFinished ? formatTimeAgo(endedAt, now) : "";
  const stampLabel =
    status === "passed" ? "done" : status === "failed" ? "fail" : status === "skipped" ? "skip" : "";
  const quietBtn = stacked ? "opacity-80 hover:opacity-100" : "opacity-0 group-hover:opacity-100";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(runCommand);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setError("Clipboard unavailable");
    }
  };

  const handleRemove = async () => {
    if (
      !window.confirm(
        `Remove "${scriptName}" from package.json?\n\nThis edits the file on disk.`
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const packages = await removePackageScript(packageName, scriptName);
      forgetScriptId(id);
      omitPipeScript(scriptName);
      refreshPackages(packages);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSaveScript = async () => {
    const nextName = nameDraft.trim();
    const nextCommand = commandDraft;
    if (!nextName) {
      setError("Name required");
      return;
    }
    if (nextName === scriptName && nextCommand === command) {
      setEditingScript(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const packages = await updatePackageScript(packageName, scriptName, {
        name: nextName,
        command: nextCommand,
      });
      if (nextName !== scriptName) {
        renameScriptId(id, `${packageName}:${nextName}`);
        notePipeRename(scriptName, nextName);
      }
      refreshPackages(packages);
      setEditingScript(false);
      setShowCommand(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const startEditDescription = () => {
    setDescDraft(description ?? "");
    setEditingDesc(true);
    setEditingScript(false);
    setShowCommand(true);
  };

  const startEditScript = () => {
    setNameDraft(scriptName);
    setCommandDraft(command);
    setEditingScript(true);
    setEditingDesc(false);
    setShowCommand(true);
    setError(null);
  };

  const handleQueue = () => {
    const op =
      queuePos >= 0
        ? unqueueScript(id)
        : queueScript(packageName, scriptName);
    void op
      .then((ids) => setRunQueue(ids))
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  };

  const handleRunOrStop = () => {
    if (isRunning) {
      void stop(packageName, scriptName).catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      });
    } else {
      void run(packageName, scriptName).catch((err) => {
        setShowCommand(true);
        setError(err instanceof Error ? err.message : String(err));
      });
    }
  };

  const buildContextItems = (): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [
      {
        id: "run",
        label: isRunning ? "Stop" : "Run",
        icon: isRunning ? <Square size={12} /> : <Play size={12} />,
        onSelect: handleRunOrStop,
      },
      {
        id: "queue",
        label:
          queuePos >= 0
            ? "Remove from queue"
            : "Queue — run when current tasks finish",
        icon: <ListPlus size={12} />,
        onSelect: handleQueue,
      },
    ];

    if (inGroup) {
      items.push({
        id: "continue-on-error",
        label: continuesOnError
          ? "Stop group on error"
          : "Continue on error",
        icon: <ArrowRight size={12} />,
        onSelect: () => toggleContinueOnError(id),
      });
    }

    if (onRunFromHere) {
      items.push({
        id: "run-from-here",
        label: "Run from here",
        icon: <ListStart size={12} />,
        onSelect: onRunFromHere,
      });
    }

    if (onToggleMute) {
      items.push({
        id: "mute",
        label: muted
          ? "Unmute — include in group run"
          : "Mute — skip in group run",
        icon: muted ? <VolumeX size={12} /> : <Volume2 size={12} />,
        onSelect: onToggleMute,
      });
    }

    const groupChildren: ContextMenuLeaf[] = favouriteGroups.map((g) => {
      const already = g.scriptIds.includes(id);
      return {
        id: `group-${g.id}`,
        label: already ? `${g.name} (already added)` : g.name,
        icon: (
          <Star
            size={12}
            className={already ? "fill-runny-yellow text-runny-yellow" : ""}
          />
        ),
        disabled: already,
        onSelect: () => insertFavouriteScript(id, g.id, g.scriptIds.length),
      };
    });
    groupChildren.push(
      { type: "separator", id: "sep-new-group" },
      {
        id: "new-group",
        label: "New group…",
        icon: <Star size={12} />,
        onSelect: () => {
          addFavouriteGroup("New group");
          queueMicrotask(() => {
            const groups = useStore.getState().favouriteGroups;
            const created = groups[groups.length - 1];
            if (created) insertFavouriteScript(id, created.id, 0);
          });
        },
      }
    );

    items.push(
      { type: "separator", id: "sep-edit" },
      {
        id: "edit",
        label: editableDescription
          ? "Edit description"
          : "Edit script in package.json",
        icon: <Pencil size={12} />,
        disabled: busy,
        onSelect: editableDescription ? startEditDescription : startEditScript,
      },
      {
        id: "toggle-command",
        label: showCommand ? "Hide command" : "Show command",
        icon: showCommand ? <EyeOff size={12} /> : <Eye size={12} />,
        onSelect: () => setShowCommand((v) => !v),
      },
      { type: "separator", id: "sep-meta" },
      {
        type: "submenu",
        id: "add-to-group",
        label: "Add to group",
        icon: <Star size={12} />,
        children: groupChildren,
      }
    );

    if (isFavourite) {
      items.push({
        id: "favourite-remove",
        label: "Remove from all favourites",
        icon: (
          <Star
            size={12}
            className="fill-runny-yellow text-runny-yellow"
          />
        ),
        onSelect: () => toggleFavourite(id),
      });
    }

    if (extraContextItems && extraContextItems.length > 0) {
      items.push(...extraContextItems);
    }

    items.push(
      {
        id: "copy",
        label: copied ? "Copied" : `Copy \`${runCommand}\``,
        icon: copied ? <Check size={12} /> : <Copy size={12} />,
        onSelect: () => void handleCopy(),
      },
      {
        id: "remove",
        label: "Remove from package.json",
        icon: <X size={12} />,
        danger: true,
        disabled: busy,
        onSelect: () => void handleRemove(),
      }
    );

    return items;
  };

  return (
    <div
      style={{
        borderLeft: isSelected
          ? "2px solid var(--color-text, #6366f1)"
          : "2px solid transparent",
        background: isSelected ? "rgba(99,102,241,0.05)" : undefined,
      }}
      className="group relative"
      draggable={draggable && !editing}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onContextMenu={(e) => {
        if (editing) return;
        openMenu(e, buildContextItems());
      }}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.background = "var(--color-hover)";
      }}
      onMouseLeave={(e) => {
        if (!isSelected) e.currentTarget.style.background = "transparent";
      }}
      title={editing ? undefined : hoverText}
    >
      <ContextMenu menu={menu} onClose={closeMenu} />
      <div
        className={
          stacked
            ? "flex flex-col min-w-0 px-1 py-0.5"
            : `flex items-center gap-2 cursor-pointer ${
                isFinished ? "py-1" : "py-1.5"
              } ${indent ? "pl-6 pr-3" : "px-3"}`
        }
        onClick={() => selectScript(id)}
      >
        <div className={stacked ? "flex items-start gap-1.5 min-w-0" : "contents"}>
        {draggable && (
          <span
            className={
              stacked
                ? "opacity-50 cursor-grab active:cursor-grabbing shrink-0 mt-0.5"
                : "opacity-0 group-hover:opacity-60 cursor-grab active:cursor-grabbing shrink-0 mt-0.5"
            }
            style={{ color: "var(--color-muted)" }}
            title="Drag to reorder"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical size={12} />
          </span>
        )}
        <StatusBadge status={status} exitCode={exitCode} />
        <span
          className={
            stacked
              ? "flex-1 min-w-0 break-words text-xs leading-snug"
              : `flex-1 truncate ${indent ? "text-xs" : "text-sm"}`
          }
          style={{
            color:
              status === "passed"
                ? "#16a34a"
                : status === "failed"
                  ? "#dc2626"
                  : indent
                    ? "var(--color-muted)"
                    : "var(--color-text-secondary)",
            textDecoration: muted ? "line-through" : undefined,
            opacity: status === "skipped" ? 0.65 : undefined,
          }}
        >
          {scriptName}
        </span>
        </div>
        <div
          className={
            stacked
              ? "flex flex-wrap items-center gap-x-0.5 gap-y-0.5 pl-5 pt-0.5"
              : "contents"
          }
        >
        {continuesOnError && (
          <span
            className="shrink-0 inline-flex items-center justify-center rounded"
            style={{
              width: 16,
              height: 16,
              background: "rgba(245,158,11,0.16)",
              color: "#d97706",
            }}
            title="Continue"
            aria-label="Continue"
          >
            <ArrowRight size={11} />
          </span>
        )}
        {queuePos >= 0 && (
          <span
            className="shrink-0 rounded px-1 py-px text-[9px] font-semibold uppercase tracking-wide tabular-nums"
            style={{
              background: "rgba(99,102,241,0.14)",
              color: "#6366f1",
            }}
            title="Runs when the current task or group finishes"
          >
            {queuePos === 0 ? "queued" : `queued ${queuePos + 1}`}
          </span>
        )}
        {isFinished && stampLabel && (
          <span
            className="shrink-0 inline-flex items-center gap-1 rounded px-1 py-px text-[9px] font-semibold uppercase tracking-wide tabular-nums"
            style={{
              background:
                status === "passed"
                  ? "rgba(34,197,94,0.14)"
                  : status === "failed"
                    ? "rgba(239,68,68,0.14)"
                    : "var(--color-border)",
              color:
                status === "passed"
                  ? "#16a34a"
                  : status === "failed"
                    ? "#dc2626"
                    : "var(--color-muted)",
            }}
            title={
              endedAt
                ? `${status}${exitCode != null ? ` (exit ${exitCode})` : ""} · ${new Date(endedAt).toLocaleString()}${durationLabel ? ` · ${durationLabel}` : ""}`
                : status
            }
          >
            {stampLabel}
            {stacked && runClock ? (
              <span className="font-normal normal-case tracking-normal">{runClock}</span>
            ) : null}
            {stacked && durationLabel ? (
              <span className="font-normal normal-case tracking-normal">{durationLabel}</span>
            ) : null}
            {!stacked && ago ? (
              <span className="font-normal normal-case tracking-normal opacity-80">{ago}</span>
            ) : null}
          </span>
        )}
        {stacked && isRunning && durationLabel && (
          <span
            className="shrink-0 text-[10px] tabular-nums"
            style={{ color: "#22c55e" }}
            title="Elapsed"
          >
            {durationLabel}
          </span>
        )}
        {onToggleMute && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleMute();
            }}
            className={`p-0.5 transition-opacity ${
              muted ? "opacity-100" : quietBtn
            }`}
            style={{ color: muted ? "#f59e0b" : "var(--color-muted)" }}
            title={
              muted
                ? "Unmute — include when running this group"
                : "Mute — skip when running this group"
            }
          >
            {muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
          </button>
        )}
        {editableDescription && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              startEditDescription();
            }}
            className={`${quietBtn} p-0.5 transition-opacity`}
            style={{ color: "var(--color-muted)" }}
            title="Edit description"
          >
            <Pencil size={11} />
          </button>
        )}
        {!editableDescription && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              startEditScript();
            }}
            className={`${quietBtn} p-0.5 transition-opacity`}
            style={{ color: "var(--color-muted)" }}
            title="Edit script in package.json"
            disabled={busy}
          >
            <Pencil size={11} />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleFavourite(id);
          }}
          className={`p-0.5 transition-opacity ${isFavourite ? "opacity-100" : quietBtn}`}
          title={isFavourite ? "Remove from favourites" : "Add to favourites"}
        >
          <Star
            size={12}
            className={isFavourite ? "fill-runny-yellow text-runny-yellow" : ""}
            style={isFavourite ? undefined : { color: "var(--color-muted)" }}
          />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            void handleCopy();
          }}
          className={`p-0.5 transition-opacity ${copied ? "opacity-100 text-runny-green" : quietBtn}`}
          style={copied ? undefined : { color: "var(--color-muted)" }}
          title={copied ? "Copied" : `Copy \`${runCommand}\``}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            void handleRemove();
          }}
          className={`${quietBtn} p-0.5 transition-opacity hover:text-runny-red`}
          style={{ color: "var(--color-muted)" }}
          title="Remove from package.json"
          disabled={busy}
        >
          <X size={12} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowCommand(!showCommand);
          }}
          className={`${quietBtn} p-0.5 transition-opacity`}
          style={{ color: "var(--color-muted)" }}
          title="Show command"
        >
          <ChevronRight
            size={12}
            className={`transition-transform ${showCommand ? "rotate-90" : ""}`}
          />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleRunOrStop();
          }}
          className={`p-1 rounded transition-colors ${
            isRunning
              ? "text-runny-red hover:bg-runny-red/10"
              : "text-runny-green hover:bg-runny-green/10"
          }`}
          title={isRunning ? "Stop" : "Run"}
        >
          {isRunning ? <Square size={12} /> : <Play size={12} />}
        </button>
        {errorReport && (
          <span className="basis-full flex items-center gap-2 min-w-0">
            <button
              type="button"
              className="text-[10px] underline truncate text-left flex-1 min-w-0"
              style={{ color: "#dc2626" }}
              title={errorReport.path}
              onClick={(e) => {
                e.stopPropagation();
                errorReport.onShow();
              }}
            >
              {errorReport.path}
            </button>
            <button
              type="button"
              className="text-[10px] uppercase tracking-wide shrink-0"
              style={{ color: "#dc2626" }}
              onClick={(e) => {
                e.stopPropagation();
                errorReport.onShow();
              }}
            >
              show
            </button>
          </span>
        )}
        </div>
      </div>
      {showCommand && (
        <div className="px-3 pb-1.5 pl-7 space-y-1">
          {editableDescription && editingDesc ? (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") {
                    setScriptDescription(id, descDraft);
                    setEditingDesc(false);
                  }
                  if (e.key === "Escape") setEditingDesc(false);
                }}
                placeholder="Description shown on hover…"
                className="flex-1 text-xs px-1.5 py-0.5 rounded outline-none"
                style={{
                  background: "var(--color-bg)",
                  color: "var(--color-text)",
                  border: "1px solid var(--color-border)",
                }}
              />
              <button
                className="text-xs px-1.5 py-0.5 rounded hover:bg-runny-accent/10"
                style={{ color: "var(--color-text-secondary)" }}
                onClick={(e) => {
                  e.stopPropagation();
                  setScriptDescription(id, descDraft);
                  setEditingDesc(false);
                }}
              >
                Save
              </button>
            </div>
          ) : null}

          {editingScript ? (
            <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="Script name"
                className="w-full text-xs px-1.5 py-0.5 rounded outline-none font-mono"
                style={{
                  background: "var(--color-bg)",
                  color: "var(--color-text)",
                  border: "1px solid var(--color-border)",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSaveScript();
                  if (e.key === "Escape") setEditingScript(false);
                }}
              />
              <input
                value={commandDraft}
                onChange={(e) => setCommandDraft(e.target.value)}
                placeholder="Command"
                className="w-full text-xs px-1.5 py-0.5 rounded outline-none font-mono"
                style={{
                  background: "var(--color-bg)",
                  color: "var(--color-text)",
                  border: "1px solid var(--color-border)",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSaveScript();
                  if (e.key === "Escape") setEditingScript(false);
                }}
              />
              <div className="flex items-center gap-1">
                <button
                  className="text-xs px-1.5 py-0.5 rounded hover:bg-runny-accent/10"
                  style={{ color: "var(--color-text-secondary)" }}
                  disabled={busy}
                  onClick={() => void handleSaveScript()}
                >
                  Save to package.json
                </button>
                <button
                  className="text-xs px-1.5 py-0.5 rounded"
                  style={{ color: "var(--color-muted)" }}
                  disabled={busy}
                  onClick={() => setEditingScript(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              {description && !editingDesc && (
                <p
                  className="text-xs"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {description}
                </p>
              )}
              <code
                className="text-xs break-all"
                style={{ color: "var(--color-muted)" }}
              >
                {command}
              </code>
            </>
          )}
          {error && (
            <p className="text-xs text-runny-red">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
