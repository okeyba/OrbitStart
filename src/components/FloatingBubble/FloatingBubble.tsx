import React, { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { emit, listen } from "@tauri-apps/api/event";
import { availableMonitors, currentMonitor, cursorPosition, getCurrentWindow } from "@tauri-apps/api/window";
import { Clock, FolderKanban, Plus, Search, Settings } from "lucide-react";
import type { AppSettings } from "../../types";
import { exitFloatingModeAndShowMain } from "../../lib/native";
import "./FloatingBubble.css";

async function animateWindowPosition(
  appWin: any,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  durationMs: number
) {
  const startTime = performance.now();

  return new Promise<void>((resolve) => {
    const tick = async (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      const ease = progress * (2 - progress);

      const currentX = startX + (endX - startX) * ease;
      const currentY = startY + (endY - startY) * ease;

      try {
        await appWin.setPosition(new PhysicalPosition(Math.round(currentX), Math.round(currentY)));
      } catch {
        resolve();
        return;
      }

      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        resolve();
      }
    };
    requestAnimationFrame(tick);
  });
}

interface FloatingBubbleProps {
  settings: AppSettings | null;
}

function clearTimer(timerRef: React.MutableRefObject<number | null>) {
  if (timerRef.current !== null) {
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }
}

async function logBubbleError(message: string) {
  try {
    await invoke("log_frontend_error", { message });
  } catch {
    console.error(message);
  }
}

type BubbleAlign = "left" | "right";

function clampNumber(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

function monitorPhysicalBounds(monitor: {
  position: { x: number; y: number };
  size: { width: number; height: number };
  scaleFactor: number;
}) {
  return {
    x: monitor.position.x,
    y: monitor.position.y,
    width: monitor.size.width,
    height: monitor.size.height,
  };
}

function clampBubbleToMonitor(
  x: number,
  y: number,
  windowWidth: number,
  windowHeight: number,
  monitor: {
    position: { x: number; y: number };
    size: { width: number; height: number };
    scaleFactor: number;
  }
): { x: number; y: number; align: BubbleAlign } {
  const bounds = monitorPhysicalBounds(monitor);
  const margin = Math.round(8 * (monitor.scaleFactor || 1));
  const minX = bounds.x + margin;
  const maxX = bounds.x + bounds.width - windowWidth - margin;
  const minY = bounds.y + margin;
  const maxY = bounds.y + bounds.height - windowHeight - margin;
  const fallbackX = bounds.x + Math.max(0, (bounds.width - windowWidth) / 2);
  const fallbackY = bounds.y + Math.max(0, (bounds.height - windowHeight) / 2);
  const nextX = maxX >= minX ? clampNumber(x, minX, maxX) : fallbackX;
  const nextY = maxY >= minY ? clampNumber(y, minY, maxY) : fallbackY;
  const align = nextX + windowWidth / 2 < bounds.x + bounds.width / 2 ? "left" : "right";
  return { x: nextX, y: nextY, align };
}

async function getBubbleOuterSize(appWin: any, sizeValue: number, monitor: { scaleFactor: number } | null) {
  try {
    const size = await appWin.outerSize();
    if (Number.isFinite(size?.width) && Number.isFinite(size?.height) && size.width > 0 && size.height > 0) {
      return { width: Number(size.width), height: Number(size.height) };
    }
  } catch {
    // Fall through to a conservative fallback.
  }
  const scaleFactor = monitor?.scaleFactor || 1;
  const fallbackSize = Math.round(sizeValue * scaleFactor);
  return { width: fallbackSize, height: fallbackSize };
}

async function pickMonitorForBubblePosition(x: number, y: number, windowWidth: number, windowHeight: number) {
  let monitors: Awaited<ReturnType<typeof availableMonitors>> = [];
  try {
    monitors = await availableMonitors();
  } catch {
    monitors = [];
  }

  const centerX = x + windowWidth / 2;
  const centerY = y + windowHeight / 2;
  const matchingMonitor = monitors.find((monitor) => {
    const bounds = monitorPhysicalBounds(monitor);
    return (
      centerX >= bounds.x &&
      centerX <= bounds.x + bounds.width &&
      centerY >= bounds.y &&
      centerY <= bounds.y + bounds.height
    );
  });
  if (matchingMonitor) return matchingMonitor;

  try {
    return (await currentMonitor()) ?? monitors[0] ?? null;
  } catch {
    return monitors[0] ?? null;
  }
}

function readSavedBubblePosition(): { x: number; y: number } | null {
  const savedPos = localStorage.getItem("orbitstart_bubble_position");
  if (!savedPos) return null;
  try {
    const pos = JSON.parse(savedPos);
    if (Number.isFinite(pos?.x) && Number.isFinite(pos?.y)) {
      return { x: Number(pos.x), y: Number(pos.y) };
    }
  } catch (e) {
    console.error("Failed to parse saved bubble position", e);
  }
  localStorage.removeItem("orbitstart_bubble_position");
  return null;
}

export function FloatingBubble({ settings }: FloatingBubbleProps) {
  const sizeValue = settings?.bubbleSize ?? 64;
  const configuredOpacity = settings?.bubbleOpacity ?? 1.0;
  const alwaysOnTop = settings?.bubbleAlwaysOnTop ?? true;
  const expandOnHover = settings?.bubbleExpandOnHover ?? true;
  const expandDelayMs = Math.max(80, settings?.bubbleExpandDelayMs ?? 180);
  const snapToEdge = settings?.bubbleSnapToEdge ?? true;

  const [isMainBubbleHovered, setIsMainBubbleHovered] = useState(false);
  const [align, setAlign] = useState<"left" | "right">("right");
  const [previewOpacity, setPreviewOpacity] = useState(configuredOpacity);

  const showMenuTimerRef = useRef<number | null>(null);
  const hideMenuTimerRef = useRef<number | null>(null);
  const bubbleHoveredRef = useRef(false);
  const menuHoveredRef = useRef(false);

  const dragRef = useRef<{
    isDragging: boolean;
    startScreenX: number;
    startScreenY: number;
    startWindowX: number;
    startWindowY: number;
    scaleFactor: number;
    hasMoved: boolean;
  } | null>(null);

  useEffect(() => {
    setPreviewOpacity(configuredOpacity);
  }, [configuredOpacity]);

  useEffect(() => {
    let unlistenOpacity: (() => void) | undefined;
    let unlistenMenuHover: (() => void) | undefined;
    let unlistenPosition: (() => void) | undefined;

    listen<number>("orbit://bubble-opacity-preview", (event) => {
      const value = Number(event.payload);
      if (Number.isFinite(value)) {
        setPreviewOpacity(Math.max(0.1, Math.min(1, value)));
      }
    }).then((unlisten) => {
      unlistenOpacity = unlisten;
    });

    listen<string>("orbit://bubble-menu-hover", (event) => {
      menuHoveredRef.current = event.payload === "enter";
      if (menuHoveredRef.current) {
        clearTimer(hideMenuTimerRef);
      } else {
        scheduleHideMenu();
      }
    }).then((unlisten) => {
      unlistenMenuHover = unlisten;
    });

    listen<{ x: number; y: number; align: "left" | "right" }>("orbit://bubble-position-changed", (event) => {
      const payload = event.payload;
      if (!payload || !Number.isFinite(payload.x) || !Number.isFinite(payload.y)) return;
      const nextAlign = payload.align === "left" ? "left" : "right";
      setAlign(nextAlign);
      localStorage.setItem("orbitstart_bubble_align", nextAlign);
      localStorage.setItem("orbitstart_bubble_position", JSON.stringify({ x: payload.x, y: payload.y }));
    }).then((unlisten) => {
      unlistenPosition = unlisten;
    });

    return () => {
      unlistenOpacity?.();
      unlistenMenuHover?.();
      unlistenPosition?.();
    };
  }, []);

  useEffect(() => {
    const savedAlign = localStorage.getItem("orbitstart_bubble_align");

    if (savedAlign === "left" || savedAlign === "right") {
      setAlign(savedAlign);
    }

    const appWin = getCurrentWindow() as any;
    const savedPosition = readSavedBubblePosition();
    const runInit = async () => {
      try {
        if (savedPosition) {
          const probeMonitor = await pickMonitorForBubblePosition(savedPosition.x, savedPosition.y, sizeValue, sizeValue);
          const outerSize = await getBubbleOuterSize(appWin, sizeValue, probeMonitor);
          const monitor = await pickMonitorForBubblePosition(savedPosition.x, savedPosition.y, outerSize.width, outerSize.height);
          if (monitor) {
            const next = clampBubbleToMonitor(savedPosition.x, savedPosition.y, outerSize.width, outerSize.height, monitor);
            await appWin.setPosition(new PhysicalPosition(Math.round(next.x), Math.round(next.y)));
            setAlign(next.align);
            localStorage.setItem("orbitstart_bubble_align", next.align);
            localStorage.setItem("orbitstart_bubble_position", JSON.stringify({ x: next.x, y: next.y }));
            return;
          }
          await appWin.setPosition(new PhysicalPosition(Math.round(savedPosition.x), Math.round(savedPosition.y)));
          return;
        }

        const monitor = await currentMonitor();
        if (monitor) {
          const bounds = monitorPhysicalBounds(monitor);
          const outerSize = await getBubbleOuterSize(appWin, sizeValue, monitor);
          const defaultX = bounds.x + bounds.width - outerSize.width - Math.round(18 * (monitor.scaleFactor || 1));
          const defaultY = bounds.y + bounds.height * 0.7 - outerSize.height / 2;
          const next = clampBubbleToMonitor(defaultX, defaultY, outerSize.width, outerSize.height, monitor);
          await appWin.setPosition(new PhysicalPosition(Math.round(next.x), Math.round(next.y)));
          setAlign(next.align);
          localStorage.setItem("orbitstart_bubble_align", next.align);
          localStorage.setItem("orbitstart_bubble_position", JSON.stringify({ x: next.x, y: next.y }));
        }
      } catch (err) {
        console.error("Failed to initialize bubble window position:", err);
      }
    };
    void runInit();

    appWin.setAlwaysOnTop(alwaysOnTop).catch(() => undefined);
  }, [alwaysOnTop, sizeValue]);

  useEffect(() => {
    const preventDefault = (e: MouseEvent) => e.preventDefault();
    window.addEventListener("contextmenu", preventDefault);
    void invoke("refresh_bubble_native_window").catch((error) => {
      void logBubbleError(`refresh_bubble_native_window failed: ${String(error)}`);
    });
    const refreshTimer = window.setTimeout(() => {
      void invoke("refresh_bubble_native_window").catch(() => undefined);
    }, 250);

    let unlistenReset: (() => void) | undefined;
    listen<{ x?: number; y?: number }>("orbit://bubble-reset-position", (event) => {
      setAlign("right");
      localStorage.setItem("orbitstart_bubble_align", "right");
      const payload = event.payload;
      if (payload && Number.isFinite(payload.x) && Number.isFinite(payload.y)) {
        localStorage.setItem("orbitstart_bubble_position", JSON.stringify({ x: payload.x, y: payload.y }));
      }
    }).then((un) => {
      unlistenReset = un;
    });

    return () => {
      clearTimer(showMenuTimerRef);
      clearTimer(hideMenuTimerRef);
      void invoke("hide_bubble_menu_window").catch(() => undefined);
      window.clearTimeout(refreshTimer);
      window.removeEventListener("contextmenu", preventDefault);
      unlistenReset?.();
    };
  }, []);

  const styleVariables = useMemo(() => {
    return {
      "--main-size": `${sizeValue}px`,
      opacity: previewOpacity,
    } as React.CSSProperties;
  }, [sizeValue, previewOpacity]);

  const isLarge = sizeValue >= 64;
  const normalImg = isLarge ? "/design/大悬浮球(无光晕).png" : "/design/小悬浮球(无光晕).png";
  const hoverImg = isLarge ? "/design/大悬浮球(有光晕).png" : "/design/小悬浮球(有光晕).png";

  function scheduleShowMenu() {
    if (!expandOnHover) return;
    clearTimer(hideMenuTimerRef);
    clearTimer(showMenuTimerRef);
    showMenuTimerRef.current = window.setTimeout(() => {
      if (!bubbleHoveredRef.current || dragRef.current?.isDragging) return;
      void invoke("show_bubble_menu_window").catch((error) => {
        void logBubbleError(`show_bubble_menu_window failed: ${String(error)}`);
      });
    }, expandDelayMs);
  }

  function scheduleHideMenu() {
    clearTimer(showMenuTimerRef);
    clearTimer(hideMenuTimerRef);
    hideMenuTimerRef.current = window.setTimeout(() => {
      if (bubbleHoveredRef.current || menuHoveredRef.current) return;
      void invoke("hide_bubble_menu_window").catch(() => undefined);
    }, 200);
  }

  function showMenuNow() {
    clearTimer(showMenuTimerRef);
    clearTimer(hideMenuTimerRef);
    void invoke("show_bubble_menu_window").catch((error) => {
      void logBubbleError(`show_bubble_menu_window failed: ${String(error)}`);
    });
  }

  function markBubbleHovered() {
    if (!bubbleHoveredRef.current) {
      bubbleHoveredRef.current = true;
      setIsMainBubbleHovered(true);
      scheduleShowMenu();
    }
  }

  const handlePointerDown = async (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.button === 2) {
      bubbleHoveredRef.current = true;
      setIsMainBubbleHovered(true);
      showMenuNow();
      return;
    }
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    clearTimer(showMenuTimerRef);
    bubbleHoveredRef.current = false;
    setIsMainBubbleHovered(false);
    void invoke("hide_bubble_menu_window").catch(() => undefined);

    const appWin = getCurrentWindow() as any;
    dragRef.current = {
      isDragging: true,
      startScreenX: e.screenX,
      startScreenY: e.screenY,
      startWindowX: Number.NaN,
      startWindowY: Number.NaN,
      scaleFactor: 1,
      hasMoved: false,
    };
    try {
      const startPos = await appWin.outerPosition();
      const startCursor = await cursorPosition();
      if (dragRef.current?.isDragging) {
        dragRef.current = {
          ...dragRef.current,
          startScreenX: startCursor.x,
          startScreenY: startCursor.y,
          startWindowX: startPos.x,
          startWindowY: startPos.y,
        };
      }
    } catch (error) {
      dragRef.current = null;
      await invoke("begin_bubble_drag").catch((fallbackError) => {
        void logBubbleError(`bubble drag failed: ${String(error)}; fallback failed: ${String(fallbackError)}`);
      });
    }
  };

  const handlePointerMove = async (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) {
      markBubbleHovered();
      return;
    }
    if (!dragRef.current || !dragRef.current.isDragging) return;

    const currentCursor = await cursorPosition();
    const deltaX = currentCursor.x - dragRef.current.startScreenX;
    const deltaY = currentCursor.y - dragRef.current.startScreenY;

    if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
      dragRef.current.hasMoved = true;
    }

    if (
      dragRef.current.hasMoved &&
      Number.isFinite(dragRef.current.startWindowX) &&
      Number.isFinite(dragRef.current.startWindowY)
    ) {
      const newX = dragRef.current.startWindowX + deltaX;
      const newY = dragRef.current.startWindowY + deltaY;

      const appWin = getCurrentWindow() as any;
      await appWin.setPosition(new PhysicalPosition(Math.round(newX), Math.round(newY)));
    }
  };

  const handlePointerUp = async (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) {
      if (e.button === 2) {
        e.preventDefault();
        bubbleHoveredRef.current = true;
        setIsMainBubbleHovered(true);
        showMenuNow();
      }
      return;
    }
    e.currentTarget.releasePointerCapture(e.pointerId);

    const appWin = getCurrentWindow() as any;

    if (dragRef.current.hasMoved) {
      const monitor = await currentMonitor();
      if (monitor) {
        const pos = await appWin.outerPosition();
        const outerSize = await getBubbleOuterSize(appWin, sizeValue, monitor);
        const bounds = monitorPhysicalBounds(monitor);
        const margin = Math.round(8 * (monitor.scaleFactor || 1));
        const centerX = pos.x + outerSize.width / 2;
        const monitorCenterX = bounds.x + bounds.width / 2;
        const isLeft = centerX < monitorCenterX;

        const rawX = isLeft ? bounds.x + margin : (bounds.x + bounds.width - outerSize.width - margin);
        const rawY = pos.y;
        const next = clampBubbleToMonitor(rawX, rawY, outerSize.width, outerSize.height, monitor);

        if (snapToEdge) {
          await animateWindowPosition(appWin, pos.x, pos.y, next.x, next.y, 160);
        }

        const savedX = snapToEdge ? next.x : pos.x;
        const savedY = snapToEdge ? next.y : pos.y;
        setAlign(next.align);
        localStorage.setItem("orbitstart_bubble_align", next.align);
        localStorage.setItem("orbitstart_bubble_position", JSON.stringify({ x: savedX, y: savedY }));
      }
    } else {
      await exitFloatingModeAndShowMain();
    }

    dragRef.current = null;
    if (bubbleHoveredRef.current) scheduleShowMenu();
  };

  const handlePointerEnter = () => {
    bubbleHoveredRef.current = true;
    setIsMainBubbleHovered(true);
    scheduleShowMenu();
  };

  const handlePointerLeave = () => {
    bubbleHoveredRef.current = false;
    setIsMainBubbleHovered(false);
    if (!dragRef.current?.isDragging) scheduleHideMenu();
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    showMenuNow();
  };

  const handleMouseMove = () => {
    markBubbleHovered();
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (e.button === 2) {
      e.preventDefault();
      bubbleHoveredRef.current = true;
      setIsMainBubbleHovered(true);
      showMenuNow();
    }
  };

  return (
    <div className="bubble-window-wrapper">
      <div
        className={`bubble-active-area align-${align}`}
        style={styleVariables}
        onContextMenu={handleContextMenu}
      >
        <div
          className={`main-bubble ${isMainBubbleHovered ? "hovered" : ""}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          title="点击打开 OrbitStart，右键展开快捷操作"
        >
          <img
            src={isMainBubbleHovered ? hoverImg : normalImg}
            alt="OrbitStart"
            className="bubble-img"
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}

const menuActions = [
  { id: "search", label: "搜索", icon: Search },
  { id: "add-resource", label: "添加", icon: Plus },
  { id: "workspace", label: "工作区", icon: FolderKanban },
  { id: "recent", label: "最近", icon: Clock },
  { id: "settings", label: "设置", icon: Settings },
] as const;

export function FloatingBubbleMenu({ settings }: FloatingBubbleProps) {
  const opacityValue = settings?.bubbleOpacity ?? 1.0;
  const [hoveredAction, setHoveredAction] = useState<string | null>(null);

  const normalActionImg = "/design/小悬浮球(无光晕).png";
  const hoverActionImg = "/design/小悬浮球(有光晕).png";

  useEffect(() => {
    return () => {
      void emit("orbit://bubble-menu-hover", "leave").catch(() => undefined);
    };
  }, []);

  const handleMouseEnter = () => {
    void emit("orbit://bubble-menu-hover", "enter").catch(() => undefined);
  };

  const handleMouseLeave = () => {
    setHoveredAction(null);
    void emit("orbit://bubble-menu-hover", "leave").catch(() => undefined);
  };

  const handleAction = async (action: string) => {
    await emit("orbit://bubble-menu-hover", "leave").catch(() => undefined);
    await exitFloatingModeAndShowMain(action);
  };

  return (
    <div
      className="bubble-menu-shell"
      style={{ opacity: opacityValue }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onContextMenu={(event) => event.preventDefault()}
    >
      {menuActions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.id}
            type="button"
            className="bubble-menu-action"
            title={action.label}
            onPointerEnter={() => setHoveredAction(action.id)}
            onPointerLeave={() => setHoveredAction((current) => current === action.id ? null : current)}
            onClick={() => void handleAction(action.id)}
          >
            <img
              src={hoveredAction === action.id ? hoverActionImg : normalActionImg}
              alt=""
              aria-hidden="true"
              className="bubble-menu-action-bg"
              draggable={false}
            />
            <Icon size={18} />
            <span>{action.label}</span>
          </button>
        );
      })}
    </div>
  );
}
