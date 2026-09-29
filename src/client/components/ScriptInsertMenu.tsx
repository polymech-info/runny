import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { fuzzyScoreScript } from "../lib/fuzzy-search";
import { useStore } from "../store/scripts";

const VIEW_PAD = 8;

type Entry = {
  id: string;
  scriptName: string;
  command: string;
  group: string;
};

export function ScriptInsertMenu({
  anchorRef,
  onPick,
  onClose,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  onPick: (scriptId: string) => void;
  onClose: () => void;
}) {
  const packages = useStore((s) => s.packages);
  const descriptions = useStore((s) => s.scriptDescriptions);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [];
    const sorted = [...packages].sort((a, b) => a.name.localeCompare(b.name));
    for (const pkg of sorted) {
      const names = Object.keys(pkg.scripts).sort((a, b) => a.localeCompare(b));
      for (const scriptName of names) {
        out.push({
          id: `${pkg.name}:${scriptName}`,
          scriptName,
          command: pkg.scripts[scriptName] ?? "",
          group: pkg.name,
        });
      }
    }
    return out;
  }, [packages]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return entries;
    return entries.filter(
      (entry) =>
        fuzzyScoreScript(
          q,
          entry.scriptName,
          entry.command,
          descriptions[entry.id],
          entry.id
        ) > 0
    );
  }, [descriptions, entries, query]);

  useEffect(() => {
    setActiveIndex((index) =>
      index >= filtered.length ? Math.max(0, filtered.length - 1) : index
    );
  }, [filtered.length]);

  useLayoutEffect(() => {
    const focusSearch = () => {
      searchRef.current?.focus({ preventScroll: true });
      searchRef.current?.select();
    };
    focusSearch();
    const id = window.requestAnimationFrame(focusSearch);
    return () => window.cancelAnimationFrame(id);
  }, []);

  useLayoutEffect(() => {
    let retryFrame = 0;
    const reposition = () => {
      const anchor = anchorRef.current;
      const popover = popoverRef.current;
      if (!anchor || !popover) {
        retryFrame = window.requestAnimationFrame(reposition);
        return;
      }
      const rect = anchor.getBoundingClientRect();
      if (
        rect.bottom < 0 ||
        rect.top > window.innerHeight ||
        rect.right < 0 ||
        rect.left > window.innerWidth
      ) {
        onClose();
        return;
      }
      const width = popover.offsetWidth || 280;
      const height = popover.offsetHeight || 360;
      let left = rect.left + rect.width / 2 - width / 2;
      left = Math.max(VIEW_PAD, Math.min(left, window.innerWidth - width - VIEW_PAD));
      const spaceBelow = window.innerHeight - rect.bottom - VIEW_PAD;
      const spaceAbove = rect.top - VIEW_PAD;
      let top = rect.bottom + VIEW_PAD;
      if (height > spaceBelow && spaceAbove > spaceBelow) {
        top = rect.top - height - VIEW_PAD;
      }
      top = Math.max(VIEW_PAD, Math.min(top, window.innerHeight - height - VIEW_PAD));
      setPos({ left, top });
    };
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.cancelAnimationFrame(retryFrame);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [anchorRef, filtered.length, onClose]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target) || anchorRef.current?.contains(target)) {
        return;
      }
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [anchorRef, onClose]);

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`
    );
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const commit = useCallback(
    (index: number) => {
      const entry = filtered[index];
      if (entry) onPick(entry.id);
    },
    [filtered, onPick]
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      event.stopPropagation();
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setActiveIndex((index) =>
            filtered.length ? (index + 1) % filtered.length : 0
          );
          break;
        case "ArrowUp":
          event.preventDefault();
          setActiveIndex((index) =>
            filtered.length ? (index - 1 + filtered.length) % filtered.length : 0
          );
          break;
        case "Home":
          event.preventDefault();
          setActiveIndex(0);
          break;
        case "End":
          event.preventDefault();
          setActiveIndex(Math.max(0, filtered.length - 1));
          break;
        case "Enter":
          event.preventDefault();
          commit(activeIndex);
          break;
        case "Escape":
          event.preventDefault();
          onClose();
          break;
        default:
          break;
      }
    },
    [activeIndex, commit, filtered.length, onClose]
  );

  const menu = (
    <div
      ref={popoverRef}
      className="fixed z-[1000] flex flex-col rounded-md shadow-lg text-xs"
      role="dialog"
      aria-label="Add script"
      onKeyDown={onKeyDown}
      style={{
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        width: "min(280px, 88vw)",
        maxHeight: "min(420px, 70vh)",
        overflow: "hidden",
        visibility: pos ? "visible" : "hidden",
        background: "var(--color-surface)",
        color: "var(--color-text)",
        border: "1px solid var(--color-border)",
        padding: 6,
      }}
    >
      <input
        ref={searchRef}
        type="search"
        autoFocus
        value={query}
        placeholder="Find a script"
        aria-label="Find a script"
        className="w-full rounded px-2 py-1 text-xs outline-none shrink-0"
        style={{
          background: "var(--color-bg)",
          color: "var(--color-text)",
          border: "1px solid var(--color-border)",
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
        }}
      />
      <div
        ref={listRef}
        className="mt-1 flex-1 overflow-y-auto min-h-0"
        role="listbox"
        aria-label="Scripts"
      >
        {filtered.map((entry, index) => {
          const previous = filtered[index - 1];
          const showGroup = entry.group !== previous?.group;
          const active = index === activeIndex;
          return (
            <div key={entry.id}>
              {showGroup && (
                <div
                  className="px-1.5 pt-2 pb-0.5 text-[10px] font-medium uppercase tracking-wider"
                  style={{
                    color: "var(--color-muted)",
                    borderTop:
                      index === 0 ? undefined : "1px solid var(--color-border)",
                  }}
                >
                  {entry.group}
                </div>
              )}
              <button
                type="button"
                role="option"
                aria-selected={active}
                data-index={index}
                className="w-full text-left rounded px-1.5 py-1"
                style={{
                  background: active ? "rgba(99,102,241,0.16)" : undefined,
                  border: active
                    ? "1px solid rgba(99,102,241,0.38)"
                    : "1px solid transparent",
                }}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => commit(index)}
              >
                <span className="block truncate text-xs">{entry.scriptName}</span>
                {entry.command && (
                  <small
                    className="block truncate text-[10px]"
                    style={{ color: "var(--color-muted)" }}
                  >
                    {entry.command}
                  </small>
                )}
              </button>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="px-2 py-3 text-[11px]" style={{ color: "var(--color-muted)" }}>
            No matching scripts
          </p>
        )}
      </div>
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(menu, document.body);
}
