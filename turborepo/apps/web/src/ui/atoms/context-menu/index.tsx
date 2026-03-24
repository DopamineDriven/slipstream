"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, frame, motion } from "motion/react";

/**
 * ==============   Config   ================
 */
const MENU = {
  spring: { type: "spring" as const, stiffness: 500, damping: 30 },
  initial: { opacity: 0, scale: 0.88 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.1 } },
  width: 220,
  height: 400
};

const SUBMENU = {
  spring: { type: "spring" as const, stiffness: 500, damping: 30 },
  offsetX: -4
};

const ITEM = {
  highlightSpring: { type: "spring" as const, stiffness: 500, damping: 35 }
};

/**
 * ==============   Data   ================
 */
interface MenuItem {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  children?: MenuItem[];
  toggle?: boolean;
}

const hasChildren = (item: MenuItem) => !!item.children?.length;

const MENU_ITEMS: MenuItem[] = [
  { label: "Undo", shortcut: "⌘Z" },
  { label: "Redo", shortcut: "⇧⌘Z", disabled: true },
  { separator: true, label: "" },
  { label: "Cut", shortcut: "⌘X" },
  { label: "Copy", shortcut: "⌘C" },
  { label: "Paste", shortcut: "⌘V" },
  { label: "Duplicate", shortcut: "⌘D" },
  { separator: true, label: "" },
  {
    label: "Arrange",
    children: [
      { label: "Bring to Front", shortcut: "⌘]" },
      { label: "Bring Forward", shortcut: "⌘⇧]" },
      { separator: true, label: "" },
      { label: "Send to Back", shortcut: "⌘[" },
      { label: "Send Backward", shortcut: "⌘⇧[" }
    ]
  },
  {
    label: "Transform",
    children: [
      { label: "Flip Horizontal" },
      { label: "Flip Vertical" },
      { separator: true, label: "" },
      { label: "Rotate 90°" },
      { label: "Rotate 180°" }
    ]
  },
  { separator: true, label: "" },
  { label: "Visualise Safe Cone", toggle: true },
  { separator: true, label: "" },
  { label: "Delete", shortcut: "⌫", danger: true }
];

/**
 * ==============   Safe Zone   ================
 *
 * When a submenu is open the user often moves diagonally toward it,
 * crossing other menu items on the way. A triangular "safe cone"
 * from the pointer to the submenu edges protects this path — any
 * pointer position inside the cone blocks submenu switching entirely.
 */
const isPointInTriangle = (
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number
): boolean => {
  const d1 = (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);
  const d2 = (px - x3) * (y2 - y3) - (x2 - x3) * (py - y3);
  const d3 = (px - x1) * (y3 - y1) - (x3 - x1) * (py - y1);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
};

/**
 * ==============   Component   ================
 */
function RightClickMenu() {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [showSafeCone, setShowSafeCone] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const safeConeRef = useRef<SVGPolygonElement>(null);
  const coneVerticesRef = useRef<{
    px: number;
    py: number;
    rx: number;
    ty: number;
    by: number;
  } | null>(null);
  const containerRectRef = useRef<DOMRect | null>(null);
  const pendingActivationRef = useRef<(() => void) | null>(null);

  const closeMenu = useCallback(() => {
    setMenu(null);
    setOpenSubmenu(null);
    setHighlightedIndex(-1);
    coneVerticesRef.current = null;
    containerRectRef.current = null;
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    containerRectRef.current = rect;

    let x = e.clientX - rect.left;
    let y = e.clientY - rect.top;

    if (x + MENU.width > rect.width) x = rect.width - MENU.width - 8;
    if (y + MENU.height > rect.height) y = rect.height - MENU.height - 8;

    setMenu({ x: Math.max(8, x), y: Math.max(8, y) });
    setOpenSubmenu(null);
    setHighlightedIndex(-1);
  }, []);

  const handleItemEnter = useCallback(
    (e: React.MouseEvent, index: number, item: MenuItem) => {
      if (item.disabled) return;

      const activate = () => {
        setHighlightedIndex(index);
        coneVerticesRef.current = null;
        if (safeConeRef.current) {
          safeConeRef.current.setAttribute("points", "0,0 0,0 0,0");
        }
        if (hasChildren(item)) setOpenSubmenu(item.label);
        else setOpenSubmenu(null);
      };

      if (openSubmenu && openSubmenu !== item.label) {
        const v = coneVerticesRef.current;
        if (v && containerRectRef.current) {
          const cr = containerRectRef.current;
          const px = e.clientX - cr.left;
          const py = e.clientY - cr.top;
          if (isPointInTriangle(px, py, v.px, v.py, v.rx, v.ty, v.rx, v.by)) {
            pendingActivationRef.current = activate;
            return;
          }
        }
      }

      pendingActivationRef.current = null;
      activate();
    },
    [openSubmenu]
  );

  const handleItemLeave = useCallback((item: MenuItem) => {
    if (!hasChildren(item)) setHighlightedIndex(-1);
  }, []);

  const handleItemClick = useCallback(
    (item: MenuItem) => {
      if (item.disabled) return;
      if (item.toggle) {
        setShowSafeCone(prev => !prev);
        return;
      }
      if (hasChildren(item)) return;
      closeMenu();
    },
    [closeMenu]
  );

  const handleMenuMouseMove = useCallback(
    (e: React.MouseEvent) => {
      pointerRef.current.x = e.clientX;
      pointerRef.current.y = e.clientY;

      if (!openSubmenu || !menuRef.current) return;
      if ((e.target as HTMLElement).closest?.(".submenu")) return;

      frame.read(() => {
        const cr = containerRectRef.current;
        if (!cr) return;
        const px = pointerRef.current.x - cr.left;
        const py = pointerRef.current.y - cr.top;

        // If pointer is inside the existing cone, don't update it
        const v = coneVerticesRef.current;
        if (v && isPointInTriangle(px, py, v.px, v.py, v.rx, v.ty, v.rx, v.by))
          return;

        // Pointer exited the cone — fire any pending activation
        if (pendingActivationRef.current) {
          const pending = pendingActivationRef.current;
          pendingActivationRef.current = null;
          pending();
          return;
        }

        // Read submenu rect fresh each frame
        const submenuEl =
          menuRef.current?.querySelector<HTMLElement>(".submenu");
        if (!submenuEl) return;
        const subRect = submenuEl.getBoundingClientRect();

        const rx = subRect.left - cr.left;
        const ty = subRect.top - cr.top;
        const by = subRect.bottom - cr.top;

        if (px >= rx) return;

        coneVerticesRef.current = { px, py, rx, ty, by };

        // Update visualization if enabled
        if (safeConeRef.current && showSafeCone) {
          frame.render(() => {
            safeConeRef.current?.setAttribute(
              "points",
              `${px},${py} ${rx},${ty} ${rx},${by}`
            );
          });
        }
      });
    },
    [showSafeCone, openSubmenu]
  );

  useEffect(() => {
    if (!menu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menu, closeMenu]);

  return (
    <div
      ref={containerRef}
      className="container"
      onContextMenu={handleContextMenu}>
      <div className="canvas">
        <div className="canvas-grid" />
        <span className="canvas-hint">Right-click anywhere</span>
      </div>

      {showSafeCone && openSubmenu && menu && (
        <svg className="safe-cone-svg">
          <polygon
            ref={safeConeRef}
            className="safe-cone"
            points="0,0 0,0 0,0"
          />
        </svg>
      )}

      <AnimatePresence>
        {menu && (
          <motion.div
            ref={menuRef}
            className="menu"
            initial={MENU.initial}
            animate={MENU.animate}
            exit={MENU.exit}
            transition={MENU.spring}
            onMouseMove={handleMenuMouseMove}
            style={{
              left: menu.x,
              top: menu.y,
              originX: 0,
              originY: 0,
              willChange: "transform, opacity"
            }}>
            {MENU_ITEMS.map((item, i) =>
              item.separator ? (
                <div key={`sep-${i}`} className="separator" />
              ) : (
                <MenuItemRow
                  key={item.label}
                  item={item}
                  highlighted={highlightedIndex === i}
                  isSubmenuOpen={openSubmenu === item.label}
                  isToggleActive={item.toggle ? showSafeCone : false}
                  onEnter={e => handleItemEnter(e, i, item)}
                  onLeave={() => handleItemLeave(item)}
                  onClick={() => handleItemClick(item)}
                  onSelect={closeMenu}
                />
              )
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <StyleSheet />
    </div>
  );
}

/**
 * ==============   Menu Item   ================
 */
const MenuItemRow = ({
  item,
  highlighted,
  isSubmenuOpen,
  isToggleActive,
  onEnter,
  onLeave,
  onClick,
  onSelect
}: {
  item: MenuItem;
  highlighted: boolean;
  isSubmenuOpen: boolean;
  isToggleActive: boolean;
  onEnter: (e: React.MouseEvent) => void;
  onLeave: () => void;
  onClick: () => void;
  onSelect: () => void;
}) => {
  const isActive = highlighted || isSubmenuOpen;

  return (
    <div
      className="item-wrapper"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={onClick}>
      <div
        className={`item${item.disabled ? "disabled" : ""}${
          item.danger ? "danger" : ""
        }`}>
        <motion.div
          className={`item-highlight${
            item.danger ? "item-highlight-danger" : ""
          }`}
          initial={false}
          animate={{ opacity: isActive ? 1 : 0 }}
          transition={ITEM.highlightSpring}
        />
        {item.toggle && (
          <span
            className={`toggle-check${isToggleActive ? "toggle-active" : ""}`}>
            ✓
          </span>
        )}
        <span className="item-label">{item.label}</span>
        {item.shortcut && (
          <span className={`shortcut${isActive ? "shortcut-active" : ""}`}>
            {item.shortcut}
          </span>
        )}
        {hasChildren(item) && (
          <span className={`chevron${isActive ? "chevron-active" : ""}`}>
            ›
          </span>
        )}
      </div>

      <AnimatePresence>
        {hasChildren(item) && isSubmenuOpen && (
          <motion.div
            className="submenu"
            initial={{
              opacity: 0,
              x: SUBMENU.offsetX
            }}
            animate={{ opacity: 1, x: 0 }}
            exit={{
              opacity: 0,
              x: SUBMENU.offsetX,
              transition: { duration: 0.1 }
            }}
            transition={SUBMENU.spring}
            style={{ willChange: "transform, opacity" }}>
            {item.children?.map((child, j) =>
              child.separator ? (
                <div key={`sub-sep-${j}`} className="separator" />
              ) : (
                <SubmenuItem
                  key={child.label}
                  item={child}
                  onSelect={onSelect}
                />
              )
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const SubmenuItem = ({
  item,
  onSelect
}: {
  item: MenuItem;
  onSelect: () => void;
}) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={`item${item.disabled ? "disabled" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => {
        if (!item.disabled) onSelect();
      }}>
      <motion.div
        className="item-highlight"
        initial={false}
        animate={{ opacity: hovered ? 1 : 0 }}
        transition={ITEM.highlightSpring}
      />
      <span className="item-label">{item.label}</span>
      {item.shortcut && (
        <span className={`shortcut${hovered ? "shortcut-active" : ""}`}>
          {item.shortcut}
        </span>
      )}
    </div>
  );
};

/**
 * ==============   Styles   ================
 */
function StyleSheet() {
  return (
    <style>{`
            .container {
                position: relative;
                width: calc(100% - 40px);
                margin: 0 auto;
                min-height: 380px;
                background-color: #0b1011;
                border: 1px solid #1d2628;
                border-radius: 10px;
                overflow: clip;
                user-select: none;
                box-sizing: border-box;
            }

            .canvas {
                width: 100%;
                height: 380px;
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .canvas-grid {
                position: absolute;
                inset: 0;
                background-image:
                    radial-gradient(circle, rgba(255, 255, 255, 0.08) 1px, transparent 1px);
                background-size: 24px 24px;
                mask-image: radial-gradient(ellipse at 50% 50%, black 30%, transparent 75%);
                -webkit-mask-image: radial-gradient(ellipse at 50% 50%, black 30%, transparent 75%);
            }

            .canvas-hint {
                color: var(--feint-text);
                font-size: 13px;
                letter-spacing: 0.03em;
                pointer-events: none;
                z-index: 1;
            }

            .safe-cone-svg {
                position: absolute;
                inset: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                z-index: 999;
            }

            .safe-cone {
                fill: rgba(0, 200, 255, 0.06);
                stroke: rgba(0, 200, 255, 0.25);
                stroke-width: 1;
                stroke-dasharray: 4 3;
            }

            .menu {
                position: absolute;
                background-color: #10141a;
                backdrop-filter: blur(24px) saturate(1.5);
                -webkit-backdrop-filter: blur(24px) saturate(1.5);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 8px;
                padding: 4px;
                min-width: 200px;
                z-index: 100;
                box-shadow:
                    0 16px 48px rgba(0, 0, 0, 0.6),
                    0 0 0 1px rgba(255, 255, 255, 0.04),
                    inset 0 0.5px 0 rgba(255, 255, 255, 0.06);
            }

            .item-wrapper {
                position: relative;
            }

            .item {
                position: relative;
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 6px 12px;
                border-radius: 5px;
                cursor: pointer;
                font-size: 13px;
                color: #f5f5f5;
                white-space: nowrap;
                gap: 24px;
            }

            .item-highlight {
                position: absolute;
                inset: 0;
                border-radius: 5px;
                background-color: rgba(255, 255, 255, 0.08);
                pointer-events: none;
            }

            .item-highlight-danger {
                background-color: rgba(255, 50, 50, 0.15);
            }

            .item-label {
                position: relative;
                z-index: 1;
            }

            .item.disabled {
                color: rgba(255, 255, 255, 0.2);
                cursor: default;
            }

            .item.disabled .item-highlight {
                display: none;
            }

            .item.danger .item-label {
                color: #ff4d4d;
            }

            .toggle-check {
                position: absolute;
                right: 12px;
                z-index: 1;
                font-size: 11px;
                opacity: 0;
                transition: opacity 0.15s ease;
            }

            .toggle-active {
                opacity: 1;
                color: #0cdcf7;
            }

            .shortcut {
                position: relative;
                z-index: 1;
                color: rgba(255, 255, 255, 0.25);
                font-size: 12px;
                font-family: inherit;
                transition: color 0.15s ease;
            }

            .shortcut-active {
                color: rgba(255, 255, 255, 0.5);
            }

            .chevron {
                position: relative;
                z-index: 1;
                color: rgba(255, 255, 255, 0.25);
                font-size: 16px;
                line-height: 1;
                margin-left: -12px;
                transition: color 0.15s ease;
            }

            .chevron-active {
                color: rgba(255, 255, 255, 0.5);
            }

            .separator {
                height: 1px;
                background-color: rgba(255, 255, 255, 0.06);
                margin: 4px 8px;
            }

            .submenu {
                position: absolute;
                top: -4px;
                left: calc(100% + 4px);
                background-color: #10141a;
                backdrop-filter: blur(24px) saturate(1.5);
                -webkit-backdrop-filter: blur(24px) saturate(1.5);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 8px;
                padding: 4px;
                min-width: 180px;
                z-index: 101;
                box-shadow:
                    0 16px 48px rgba(0, 0, 0, 0.6),
                    0 0 0 1px rgba(255, 255, 255, 0.04),
                    inset 0 0.5px 0 rgba(255, 255, 255, 0.06);
            }
        `}</style>
  );
}

export default RightClickMenu;
