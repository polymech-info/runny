import React, { useCallback, useRef } from "react";
import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { SearchBar } from "./SearchBar";
import { Favourites } from "./Favourites";
import { PackageCard } from "./PackageCard";
import { useStore } from "../store/scripts";

const MIN_WIDTH = 220;
const MAX_WIDTH = 640;

export function Sidebar({ emptyHint }: { emptyHint?: string } = {}) {
  const packages = useStore((s) => s.packages);
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed);
  const setAllCollapsed = useStore((s) => s.setAllCollapsed);
  const groupingEnabled = useStore((s) => s.groupingEnabled);
  const toggleGrouping = useStore((s) => s.toggleGrouping);
  const width = useStore((s) => s.sidebarWidth);
  const setSidebarWidth = useStore((s) => s.setSidebarWidth);

  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(width);

  const allCollapsed =
    packages.length > 0 && packages.every((p) => sidebarCollapsed.get(p.name));

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = true;
      startX.current = e.clientX;
      startWidth.current = width;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [width]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      const next = Math.min(
        MAX_WIDTH,
        Math.max(MIN_WIDTH, startWidth.current + (e.clientX - startX.current))
      );
      setSidebarWidth(next);
    },
    [setSidebarWidth]
  );

  const endDrag = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  return (
    <aside
      className="relative flex flex-col shrink-0 overflow-hidden"
      style={{
        width,
        background: "var(--color-surface)",
        borderRight: "1px solid var(--color-border)",
      }}
    >
      <SearchBar />
      <div className="flex items-center justify-between px-3 pb-2 gap-2">
        <label className="flex items-center gap-1.5 cursor-pointer select-none min-w-0">
          <input
            type="checkbox"
            checked={groupingEnabled}
            onChange={toggleGrouping}
            className="rounded accent-runny-accent w-3.5 h-3.5 cursor-pointer"
          />
          <span className="text-xs truncate" style={{ color: "var(--color-muted)" }}>
            Group related scripts
          </span>
        </label>
        {packages.length > 1 && (
          <button
            onClick={() => setAllCollapsed(!allCollapsed)}
            className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded transition-colors hover:bg-runny-accent/10 shrink-0"
            style={{ color: "var(--color-muted)" }}
            title={allCollapsed ? "Expand all" : "Collapse all"}
          >
            {allCollapsed ? (
              <>
                <ChevronsUpDown size={12} />
                Expand all
              </>
            ) : (
              <>
                <ChevronsDownUp size={12} />
                Collapse all
              </>
            )}
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        <Favourites />
        {packages.length === 0 ? (
          <div
            className="px-3 py-8 text-center text-sm"
            style={{ color: "var(--color-muted)" }}
          >
            {emptyHint ?? "No packages found"}
          </div>
        ) : (
          packages.map((pkg) => <PackageCard key={pkg.name} pkg={pkg} />)
        )}
      </div>
      <div
        className="px-3 py-2 text-xs"
        style={{
          borderTop: "1px solid var(--color-border)",
          color: "var(--color-muted)",
        }}
      >
        {packages.length} package{packages.length !== 1 ? "s" : ""}
      </div>

      {/* Resize handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize z-10 group"
        style={{ touchAction: "none" }}
      >
        <div
          className="absolute inset-y-0 right-0 w-px transition-colors group-hover:w-0.5 group-active:w-0.5"
          style={{ background: "var(--color-border)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#6366f1";
          }}
          onMouseLeave={(e) => {
            if (!dragging.current) {
              e.currentTarget.style.background = "var(--color-border)";
            }
          }}
        />
      </div>
    </aside>
  );
}

