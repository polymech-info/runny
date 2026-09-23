import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight } from "lucide-react";

export type ContextMenuLeaf =
  | {
      type?: "item";
      id: string;
      label: string;
      icon?: React.ReactNode;
      danger?: boolean;
      disabled?: boolean;
      onSelect: () => void;
    }
  | { type: "separator"; id: string };

export type ContextMenuItem =
  | ContextMenuLeaf
  | {
      type: "submenu";
      id: string;
      label: string;
      icon?: React.ReactNode;
      disabled?: boolean;
      children: ContextMenuLeaf[];
    };

export type ContextMenuState = {
  x: number;
  y: number;
  items: ContextMenuItem[];
};

const VIEW_PAD = 8;

function clampToViewport(
  preferredX: number,
  preferredY: number,
  width: number,
  height: number
): { left: number; top: number; maxHeight: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxHeight = Math.max(120, vh - VIEW_PAD * 2);
  const usedHeight = Math.min(height, maxHeight);

  let left = preferredX;
  if (left + width > vw - VIEW_PAD) left = vw - VIEW_PAD - width;
  if (left < VIEW_PAD) left = VIEW_PAD;

  let top = preferredY;
  if (top + usedHeight > vh - VIEW_PAD) top = vh - VIEW_PAD - usedHeight;
  if (top < VIEW_PAD) top = VIEW_PAD;

  return { left, top, maxHeight };
}

export function useContextMenu() {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  const open = (e: React.MouseEvent, items: ContextMenuItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    if (items.length === 0) return;
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  const close = () => setMenu(null);

  return { menu, open, close };
}

function MenuPanel({
  items,
  onClose,
  className,
  style,
  panelRef,
  maxHeight,
}: {
  items: ContextMenuItem[];
  onClose: () => void;
  className?: string;
  style?: React.CSSProperties;
  panelRef?: React.Ref<HTMLDivElement>;
  maxHeight?: number;
}) {
  const [openSubId, setOpenSubId] = useState<string | null>(null);

  return (
    <div
      ref={panelRef}
      role="menu"
      className={
        className ??
        "fixed z-[1000] min-w-[180px] py-1 rounded-md shadow-lg text-xs"
      }
      style={{
        background: "var(--color-surface)",
        color: "var(--color-text)",
        border: "1px solid var(--color-border)",
        maxHeight,
        overflowY: maxHeight != null ? "auto" : undefined,
        ...style,
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) => {
        if (item.type === "separator") {
          return (
            <div
              key={item.id}
              className="my-1 h-px"
              style={{ background: "var(--color-border)" }}
              role="separator"
            />
          );
        }

        if (item.type === "submenu") {
          return (
            <SubmenuRow
              key={item.id}
              item={item}
              open={openSubId === item.id}
              onOpen={() => setOpenSubId(item.id)}
              onClose={onClose}
            />
          );
        }

        return (
          <MenuButton
            key={item.id}
            label={item.label}
            icon={item.icon}
            danger={item.danger}
            disabled={item.disabled}
            onMouseEnter={() => setOpenSubId(null)}
            onSelect={() => {
              onClose();
              item.onSelect();
            }}
          />
        );
      })}
    </div>
  );
}

function MenuButton({
  label,
  icon,
  danger,
  disabled,
  trailing,
  onSelect,
  onMouseEnter,
}: {
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  trailing?: React.ReactNode;
  onSelect?: () => void;
  onMouseEnter?: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left disabled:opacity-40 disabled:pointer-events-none"
      style={{ color: danger ? "#dc2626" : "var(--color-text)" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger
          ? "rgba(239,68,68,0.08)"
          : "var(--color-hover)";
        onMouseEnter?.();
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.();
      }}
    >
      <span
        className="w-3.5 shrink-0 inline-flex items-center justify-center"
        style={{ color: danger ? "#dc2626" : "var(--color-muted)" }}
      >
        {icon}
      </span>
      <span className="flex-1 truncate text-left">{label}</span>
      {trailing}
    </button>
  );
}

function SubmenuRow({
  item,
  open,
  onOpen,
  onClose,
}: {
  item: Extract<ContextMenuItem, { type: "submenu" }>;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{
    left: number;
    top: number;
    maxHeight: number;
    openLeft: boolean;
  } | null>(null);

  useLayoutEffect(() => {
    if (!open || !rowRef.current || !flyoutRef.current) {
      setPos(null);
      return;
    }
    const trigger = rowRef.current.getBoundingClientRect();
    const flyout = flyoutRef.current.getBoundingClientRect();
    const gap = 2;
    const spaceRight = window.innerWidth - VIEW_PAD - (trigger.right + gap);
    const openLeft = flyout.width > spaceRight;
    const preferredX = openLeft
      ? trigger.left - gap - flyout.width
      : trigger.right + gap;
    const clamped = clampToViewport(
      preferredX,
      trigger.top,
      flyout.width,
      flyout.height
    );
    setPos({ ...clamped, openLeft });
  }, [open, item.children.length]);

  return (
    <div
      ref={rowRef}
      className="relative"
      onMouseEnter={onOpen}
      role="none"
    >
      <MenuButton
        label={item.label}
        icon={item.icon}
        disabled={item.disabled || item.children.length === 0}
        trailing={
          <ChevronRight
            size={12}
            style={{
              color: "var(--color-muted)",
              transform: pos?.openLeft ? "scaleX(-1)" : undefined,
            }}
          />
        }
        onMouseEnter={onOpen}
      />
      {open && item.children.length > 0 && (
        <MenuPanel
          panelRef={flyoutRef}
          items={item.children}
          onClose={onClose}
          maxHeight={pos?.maxHeight}
          className="fixed z-[1001] min-w-[160px] py-1 rounded-md shadow-lg text-xs"
          style={{
            left: pos?.left ?? -9999,
            top: pos?.top ?? 0,
            visibility: pos ? "visible" : "hidden",
          }}
        />
      )}
    </div>
  );
}

export function ContextMenu({
  menu,
  onClose,
}: {
  menu: ContextMenuState | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{
    left: number;
    top: number;
    maxHeight: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!menu || !ref.current) {
      setPos(null);
      return;
    }
    const { width, height } = ref.current.getBoundingClientRect();
    setPos(clampToViewport(menu.x, menu.y, width, height));
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Element;
      if (ref.current?.contains(t)) return;
      if (t.closest?.('[role="menu"]')) return;
      onClose();
    };
    const onScroll = () => onClose();
    const onResize = () => onClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  return createPortal(
    <MenuPanel
      panelRef={ref}
      items={menu.items}
      onClose={onClose}
      maxHeight={pos?.maxHeight}
      style={{
        left: pos?.left ?? menu.x,
        top: pos?.top ?? menu.y,
        visibility: pos ? "visible" : "hidden",
      }}
    />,
    document.body
  );
}
