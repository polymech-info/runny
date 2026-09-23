import React, { useRef, useState } from "react";
import {
  Star,
  Plus,
  Pencil,
  Trash2,
  GripVertical,
  ChevronDown,
  Play,
  Square,
} from "lucide-react";
import { ScriptRow } from "./ScriptRow";
import { fuzzyScoreScript } from "../lib/fuzzy-search";
import { useStore, type FavouriteGroup } from "../store/scripts";
import {
  favouriteSessionPath,
  sessionStepScriptId,
  startFavouriteSession,
  stopSession,
  type PackageInfo,
  type Session,
} from "../lib/api";
import {
  ContextMenu,
  useContextMenu,
  type ContextMenuItem,
} from "./ui/ContextMenu";
import {
  activeFavouriteDrag,
  setActiveFavouriteDrag,
} from "../lib/favourite-dnd";

function scriptMatchesSearch(
  packages: PackageInfo[],
  scriptId: string,
  query: string,
  descriptions: Record<string, string>
): boolean {
  if (!query.trim()) return true;
  const item = resolveScript(packages, scriptId);
  if (!item) return false;
  return (
    fuzzyScoreScript(
      query,
      item.scriptName,
      item.command,
      descriptions[scriptId],
      scriptId
    ) > 0
  );
}

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

function FavouriteScriptRow({
  groupId,
  scriptId,
  index,
  muted,
  onDropAt,
  onRunFromHere,
}: {
  groupId: string;
  scriptId: string;
  index: number;
  muted: boolean;
  onDropAt: (
    scriptId: string,
    fromGroupId: string,
    groupId: string,
    index: number,
    copy: boolean
  ) => void;
  onRunFromHere?: () => void;
}) {
  const packages = useStore((s) => s.packages);
  const toggleFavouriteMute = useStore((s) => s.toggleFavouriteMute);
  const [dropEdge, setDropEdge] = useState<"before" | "after" | null>(null);
  const item = resolveScript(packages, scriptId);

  if (!item) return null;

  return (
    <div
      onDragOver={(e) => {
        if (!activeFavouriteDrag || activeFavouriteDrag.kind !== "script") return;
        e.preventDefault();
        e.stopPropagation();
        // Cross-group = duplicate into target; same-group = reorder.
        e.dataTransfer.dropEffect =
          activeFavouriteDrag.fromGroupId !== groupId ? "copy" : "move";
        const rect = e.currentTarget.getBoundingClientRect();
        setDropEdge(e.clientY < rect.top + rect.height / 2 ? "before" : "after");
      }}
      onDragLeave={() => setDropEdge(null)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const edge = dropEdge;
        setDropEdge(null);
        if (!activeFavouriteDrag || activeFavouriteDrag.kind !== "script") return;
        const insertAt = edge === "after" ? index + 1 : index;
        onDropAt(
          activeFavouriteDrag.scriptId,
          activeFavouriteDrag.fromGroupId,
          groupId,
          insertAt,
          activeFavouriteDrag.fromGroupId !== groupId
        );
        setActiveFavouriteDrag(null);
      }}
      style={{
        opacity: muted ? 0.55 : undefined,
        boxShadow:
          dropEdge === "before"
            ? "inset 0 2px 0 0 #6366f1"
            : dropEdge === "after"
              ? "inset 0 -2px 0 0 #6366f1"
              : undefined,
      }}
    >
      <ScriptRow
        packageName={item.packageName}
        scriptName={item.scriptName}
        command={item.command}
        draggable
        editableDescription
        muted={muted}
        onToggleMute={() => toggleFavouriteMute(groupId, scriptId)}
        onRunFromHere={onRunFromHere}
        onDragStart={(e) => {
          setActiveFavouriteDrag({
            kind: "script",
            scriptId,
            fromGroupId: groupId,
          });
          e.dataTransfer.setData("text/plain", scriptId);
          e.dataTransfer.effectAllowed = "copyMove";
        }}
        onDragEnd={() => {
          setActiveFavouriteDrag(null);
        }}
      />
    </div>
  );
}

function findFavouriteSession(
  sessions: Map<string, Session>,
  groupId: string
): Session | undefined {
  const path = favouriteSessionPath(groupId);
  let best: Session | undefined;
  for (const s of sessions.values()) {
    if (s.groupPath !== path) continue;
    if (!best || s.startedAt > best.startedAt) best = s;
  }
  return best;
}

function GroupSection({
  group,
  index,
}: {
  group: FavouriteGroup;
  index: number;
}) {
  const packages = useStore((s) => s.packages);
  const favouriteGroups = useStore((s) => s.favouriteGroups);
  const renameFavouriteGroup = useStore((s) => s.renameFavouriteGroup);
  const removeFavouriteGroup = useStore((s) => s.removeFavouriteGroup);
  const reorderFavouriteGroups = useStore((s) => s.reorderFavouriteGroups);
  const setFavouriteGroupCollapsed = useStore(
    (s) => s.setFavouriteGroupCollapsed
  );
  const moveFavouriteScript = useStore((s) => s.moveFavouriteScript);
  const copyFavouriteScript = useStore((s) => s.copyFavouriteScript);
  const insertFavouriteScript = useStore((s) => s.insertFavouriteScript);
  const upsertSession = useStore((s) => s.upsertSession);
  const selectScript = useStore((s) => s.selectScript);
  const searchQuery = useStore((s) => s.searchQuery);
  const scriptDescriptions = useStore((s) => s.scriptDescriptions);
  const session = useStore((s) => findFavouriteSession(s.sessions, group.id));

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(group.name);
  const [groupDropActive, setGroupDropActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();

  const collapsed = group.collapsed ?? false;
  const muted = new Set(group.mutedScriptIds ?? []);
  const searching = searchQuery.trim().length > 0;
  const resolvedIds = group.scriptIds.filter(
    (id) => resolveScript(packages, id) !== null
  );
  const visibleIds = searching
    ? resolvedIds.filter((id) =>
        scriptMatchesSearch(packages, id, searchQuery, scriptDescriptions)
      )
    : group.scriptIds;
  const runnableIds = resolvedIds.filter((id) => !muted.has(id));
  const resolvedCount = resolvedIds.length;
  const runnableCount = runnableIds.length;
  const mutedCount = resolvedCount - runnableCount;
  const isActive =
    session?.status === "running" || session?.status === "queued";
  const progress = session
    ? `${session.steps.filter((s) => s.status === "passed" || s.status === "failed" || s.status === "skipped").length}/${session.steps.length}`
    : null;

  // While searching, hide groups with no matches (still allow empty drop target when not searching).
  if (searching && visibleIds.length === 0) return null;

  const handleRun = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (runnableCount === 0 && !isActive) return;
    setBusy(true);
    setRunError(null);
    try {
      if (isActive && session) {
        const stopped = await stopSession(session.id);
        upsertSession(stopped);
      } else {
        const started = await startFavouriteSession(
          favouriteSessionPath(group.id),
          runnableIds
        );
        upsertSession(started);
        const id = sessionStepScriptId(started);
        if (id) selectScript(id);
      }
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleRunFrom = async (fromIndex: number) => {
    if (isActive || busy) return;
    const fromIds = group.scriptIds
      .slice(fromIndex)
      .filter(
        (id) => resolveScript(packages, id) !== null && !muted.has(id)
      );
    if (fromIds.length === 0) return;
    setBusy(true);
    setRunError(null);
    try {
      const started = await startFavouriteSession(
        favouriteSessionPath(group.id),
        fromIds
      );
      upsertSession(started);
      const id = sessionStepScriptId(started);
      if (id) selectScript(id);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const startRename = () => {
    setNameDraft(group.name);
    setEditingName(true);
    queueMicrotask(() => nameInputRef.current?.focus());
  };

  const buildGroupMenuItems = (): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [
      {
        id: "run",
        label: isActive
          ? "Stop group"
          : mutedCount > 0
            ? `Run unmuted (${runnableCount})`
            : `Run group (${runnableCount})`,
        icon: isActive ? <Square size={12} /> : <Play size={12} />,
        disabled: busy || (!isActive && runnableCount === 0),
        onSelect: () => void handleRun(),
      },
      {
        id: "rename",
        label: "Rename group",
        icon: <Pencil size={12} />,
        onSelect: startRename,
      },
    ];
    if (favouriteGroups.length > 1) {
      items.push(
        { type: "separator", id: "sep-del" },
        {
          id: "delete",
          label: "Delete group",
          icon: <Trash2 size={12} />,
          danger: true,
          onSelect: () => removeFavouriteGroup(group.id),
        }
      );
    }
    return items;
  };

  const handleScriptDrop = (
    scriptId: string,
    fromGroupId: string,
    toGroupId: string,
    toIndex: number,
    copy: boolean
  ) => {
    // From Recent / outside favourites — insert into the target group.
    const fromKnown = favouriteGroups.some((g) => g.id === fromGroupId);
    if (!fromGroupId || !fromKnown) {
      insertFavouriteScript(scriptId, toGroupId, toIndex);
      return;
    }
    // Different group → always duplicate (keep source; needed for new groups).
    if (copy || fromGroupId !== toGroupId) {
      copyFavouriteScript(scriptId, fromGroupId, toGroupId, toIndex);
      return;
    }
    let nextIndex = toIndex;
    const from = favouriteGroups.find((g) => g.id === fromGroupId);
    const fromIndex = from?.scriptIds.indexOf(scriptId) ?? -1;
    if (fromIndex !== -1 && fromIndex < toIndex) nextIndex -= 1;
    moveFavouriteScript(scriptId, fromGroupId, toGroupId, nextIndex);
  };

  return (
    <div
      className="mb-1"
      onDragOver={(e) => {
        if (!activeFavouriteDrag) return;
        e.preventDefault();
        const copy =
          activeFavouriteDrag.kind === "script" &&
          activeFavouriteDrag.fromGroupId !== group.id;
        e.dataTransfer.dropEffect = copy ? "copy" : "move";
        setGroupDropActive(true);
      }}
      onDragLeave={() => setGroupDropActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setGroupDropActive(false);
        if (!activeFavouriteDrag) return;
        if (activeFavouriteDrag.kind === "group") {
          const fromIndex = favouriteGroups.findIndex(
            (g) => g.id === activeFavouriteDrag!.groupId
          );
          if (fromIndex !== -1) reorderFavouriteGroups(fromIndex, index);
        } else if (activeFavouriteDrag.kind === "script") {
          handleScriptDrop(
            activeFavouriteDrag.scriptId,
            activeFavouriteDrag.fromGroupId,
            group.id,
            group.scriptIds.length,
            activeFavouriteDrag.fromGroupId !== group.id
          );
        }
        setActiveFavouriteDrag(null);
      }}
      style={{
        outline: groupDropActive ? "1px dashed #6366f1" : undefined,
        outlineOffset: -1,
        borderRadius: 4,
      }}
    >
      <div
        className="flex items-center gap-1 px-3 py-1.5 group/header"
        style={{ color: "var(--color-muted)" }}
        draggable={!editingName}
        onDragStart={(e) => {
          setActiveFavouriteDrag({ kind: "group", groupId: group.id });
          e.dataTransfer.setData("text/plain", group.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => {
          setActiveFavouriteDrag(null);
        }}
        onContextMenu={(e) => {
          if (editingName) return;
          openMenu(e, buildGroupMenuItems());
        }}
      >
        <ContextMenu menu={menu} onClose={closeMenu} />
        <span className="cursor-grab active:cursor-grabbing opacity-50">
          <GripVertical size={12} />
        </span>
        <button
          onClick={() => setFavouriteGroupCollapsed(group.id, !collapsed)}
          className="p-0.5"
          title={collapsed ? "Expand" : "Collapse"}
        >
          <ChevronDown
            size={12}
            className={`transition-transform ${collapsed ? "-rotate-90" : ""}`}
          />
        </button>
        {editingName ? (
          <input
            ref={nameInputRef}
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => {
              renameFavouriteGroup(group.id, nameDraft);
              setEditingName(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                renameFavouriteGroup(group.id, nameDraft);
                setEditingName(false);
              }
              if (e.key === "Escape") setEditingName(false);
            }}
            className="flex-1 text-xs font-medium uppercase tracking-wider px-1 rounded outline-none"
            style={{
              background: "var(--color-bg)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
            }}
          />
        ) : (
          <button
            className="flex-1 text-left text-xs font-medium uppercase tracking-wider truncate"
            onDoubleClick={startRename}
            title="Double-click to rename"
          >
            {group.name}
            <span className="ml-1.5 normal-case tracking-normal opacity-60">
              {mutedCount > 0
                ? `${runnableCount}/${resolvedCount}`
                : resolvedCount}
            </span>
          </button>
        )}
        {progress && (
          <span
            className="text-[11px] tabular-nums"
            style={{
              color:
                session?.status === "failed"
                  ? "#ef4444"
                  : session?.status === "passed"
                    ? "#22c55e"
                    : "var(--color-muted)",
            }}
            title={`Session ${session?.status}`}
          >
            {progress}
          </span>
        )}
        <button
          type="button"
          className="p-0.5 rounded opacity-70 hover:opacity-100 disabled:opacity-30"
          style={{ color: isActive ? "#ef4444" : "var(--color-muted)" }}
          title={
            isActive
              ? "Stop favourite group"
              : mutedCount > 0
                ? `Run unmuted scripts (${runnableCount}, ${mutedCount} muted)`
                : `Run favourite group sequentially (${runnableCount})`
          }
          disabled={busy || (!isActive && runnableCount === 0)}
          onClick={(e) => void handleRun(e)}
        >
          {isActive ? <Square size={12} /> : <Play size={12} />}
        </button>
        <button
          className="opacity-0 group-hover/header:opacity-100 p-0.5 hover:text-runny-accent"
          title="Rename group"
          onClick={startRename}
        >
          <Pencil size={11} />
        </button>
        {favouriteGroups.length > 1 && (
          <button
            className="opacity-0 group-hover/header:opacity-100 p-0.5 hover:text-runny-red"
            title="Delete group (scripts move to first group)"
            onClick={() => removeFavouriteGroup(group.id)}
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>
      {runError && (
        <div className="px-3 pb-1 text-[11px]" style={{ color: "#ef4444" }}>
          {runError}
        </div>
      )}
      {(!collapsed || searching) && (
        <div>
          {(searching ? visibleIds : group.scriptIds).map(
            (scriptId, scriptIndex) => (
              <FavouriteScriptRow
                key={scriptId}
                groupId={group.id}
                scriptId={scriptId}
                index={
                  searching ? group.scriptIds.indexOf(scriptId) : scriptIndex
                }
                muted={muted.has(scriptId)}
                onDropAt={handleScriptDrop}
                onRunFromHere={
                  isActive || busy
                    ? undefined
                    : () => {
                        const at = searching
                          ? group.scriptIds.indexOf(scriptId)
                          : scriptIndex;
                        if (at < 0) return;
                        void handleRunFrom(at);
                      }
                }
              />
            )
          )}
          {!searching && resolvedCount === 0 && (
            <div
              className="px-3 pb-2 text-[11px]"
              style={{ color: "var(--color-muted)" }}
            >
              Drop scripts here, or star scripts below
            </div>
          )}
          {!searching && resolvedCount > 0 && runnableCount === 0 && (
            <div
              className="px-3 pb-2 text-[11px]"
              style={{ color: "var(--color-muted)" }}
            >
              All scripts muted — unmute at least one to run this group
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Favourites() {
  const favouriteGroups = useStore((s) => s.favouriteGroups);
  const addFavouriteGroup = useStore((s) => s.addFavouriteGroup);
  const packages = useStore((s) => s.packages);

  const total = favouriteGroups.reduce((n, g) => {
    return (
      n +
      g.scriptIds.filter((id) => resolveScript(packages, id) !== null).length
    );
  }, 0);

  // Keep collapsed chrome out of the way until there's something to show,
  // but always surface once the user has favourites or extra groups.
  if (total === 0 && favouriteGroups.length <= 1) return null;

  return (
    <div style={{ borderBottom: "1px solid var(--color-border)" }}>
      <div className="flex items-center gap-1.5 px-3 py-2">
        <Star size={12} className="fill-runny-yellow text-runny-yellow" />
        <span
          className="flex-1 text-xs font-medium uppercase tracking-wider"
          style={{ color: "var(--color-muted)" }}
        >
          Favourites
        </span>
        <button
          onClick={() => addFavouriteGroup("New group")}
          className="flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded hover:bg-runny-accent/10"
          style={{ color: "var(--color-muted)" }}
          title="Add favourite group"
        >
          <Plus size={11} />
          Group
        </button>
      </div>
      <div className="pb-1">
        {favouriteGroups.map((group, index) => (
          <GroupSection key={group.id} group={group} index={index} />
        ))}
      </div>
    </div>
  );
}
