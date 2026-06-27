import React, { useState, useEffect, useRef, useMemo } from "react";
import { 
  Search, 
  Plus, 
  FolderKanban, 
  Clock, 
  Settings, 
  Globe 
} from "lucide-react";
import { getCurrentWindow, currentMonitor } from "@tauri-apps/api/window";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { listen } from "@tauri-apps/api/event";
import { exit } from "@tauri-apps/plugin-process";
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
      // Ease out quad
      const ease = progress * (2 - progress);
      
      const currentX = startX + (endX - startX) * ease;
      const currentY = startY + (endY - startY) * ease;
      
      try {
        await appWin.setPosition(new LogicalPosition(currentX, currentY));
      } catch (err) {
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

export function FloatingBubble({ settings }: FloatingBubbleProps) {
  const sizeValue = settings?.bubbleSize ?? 64;
  const opacityValue = settings?.bubbleOpacity ?? 1.0;
  const alwaysOnTop = settings?.bubbleAlwaysOnTop ?? true;
  const expandOnHover = settings?.bubbleExpandOnHover ?? true;
  const expandDelay = settings?.bubbleExpandDelayMs ?? 200;

  const [isHovered, setIsHovered] = useState(false);
  const [isMainBubbleHovered, setIsMainBubbleHovered] = useState(false);
  const [align, setAlign] = useState<"left" | "right">("right");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const hoverTimeoutRef = useRef<number | null>(null);
  const dragRef = useRef<{
    isDragging: boolean;
    startScreenX: number;
    startScreenY: number;
    startWindowX: number;
    startWindowY: number;
    scaleFactor: number;
    hasMoved: boolean;
  } | null>(null);

  // Load alignment and snap coordinates from localStorage
  useEffect(() => {
    const savedAlign = localStorage.getItem("orbitstart_bubble_align");
    const savedPos = localStorage.getItem("orbitstart_bubble_position");
    
    if (savedAlign === "left" || savedAlign === "right") {
      setAlign(savedAlign);
    }

    const appWin = getCurrentWindow() as any;
    if (savedPos) {
      try {
        const pos = JSON.parse(savedPos);
        appWin.setPosition(new LogicalPosition(pos.x, pos.y)).catch(() => undefined);
      } catch (e) {
        console.error("Failed to parse saved bubble position", e);
      }
    } else {
      // Default to right edge of current monitor
      const runInit = async () => {
        try {
          const monitor = await currentMonitor();
          if (monitor) {
            const scaleFactor = monitor.scaleFactor;
            const monitorX = monitor.position.x / scaleFactor;
            const monitorWidth = monitor.size.width / scaleFactor;
            const monitorY = monitor.position.y / scaleFactor;
            const monitorHeight = monitor.size.height / scaleFactor;
            
            const defaultX = monitorX + monitorWidth - 380;
            const defaultY = monitorY + monitorHeight * 0.7 - 60;
            await appWin.setPosition(new LogicalPosition(defaultX, defaultY));
            setAlign("right");
            localStorage.setItem("orbitstart_bubble_align", "right");
            localStorage.setItem("orbitstart_bubble_position", JSON.stringify({ x: defaultX, y: defaultY }));
          }
        } catch (err) {
          console.error("Failed to initialize bubble window position:", err);
        }
      };
      void runInit();
    }

    // Force always on top if configured
    appWin.setAlwaysOnTop(alwaysOnTop).catch(() => undefined);
  }, [alwaysOnTop]);

  // Transparency refresh hack for Windows 11 DWM
  useEffect(() => {
    const appWin = getCurrentWindow() as any;
    const timer = setTimeout(async () => {
      try {
        await appWin.setSize(new LogicalSize(381, 120));
        await appWin.setSize(new LogicalSize(380, 120));
      } catch (e) {
        console.error("Failed DWM transparency hack", e);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  // Prevent default browser context menu globally for this window
  useEffect(() => {
    const preventDefault = (e: MouseEvent) => e.preventDefault();
    window.addEventListener("contextmenu", preventDefault);
    
    const closeMenu = () => setContextMenu(null);
    window.addEventListener("click", closeMenu);

    let unlistenReset: (() => void) | undefined;
    
    listen("orbit://bubble-reset-position", () => {
      setAlign("right");
      localStorage.setItem("orbitstart_bubble_align", "right");
    }).then((un) => {
      unlistenReset = un;
    });

    return () => {
      window.removeEventListener("contextmenu", preventDefault);
      window.removeEventListener("click", closeMenu);
      unlistenReset?.();
    };
  }, []);

  const styleVariables = useMemo(() => {
    const ballSize = sizeValue === 56 ? 36 : sizeValue === 72 ? 48 : 42;
    const gap = sizeValue === 56 ? 8 : sizeValue === 72 ? 12 : 10;
    return {
      "--main-size": `${sizeValue}px`,
      "--ball-size": `${ballSize}px`,
      "--gap": `${gap}px`,
      "opacity": opacityValue,
    } as React.CSSProperties;
  }, [sizeValue, opacityValue]);

  // Main bubble image mapping
  const isLarge = sizeValue >= 64;
  const normalImg = isLarge ? "/design/大悬浮球(无光晕).png" : "/design/小悬浮球(无光晕).png";
  const hoverImg = isLarge ? "/design/大悬浮球(有光晕).png" : "/design/小悬浮球(有光晕).png";

  // Hover timers
  const handlePointerEnter = () => {
    if (!expandOnHover) return;
    if (hoverTimeoutRef.current) {
      window.clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    hoverTimeoutRef.current = window.setTimeout(() => {
      setIsHovered(true);
    }, expandDelay);
  };

  const handlePointerLeave = () => {
    if (hoverTimeoutRef.current) {
      window.clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    hoverTimeoutRef.current = window.setTimeout(() => {
      setIsHovered(false);
    }, 400); // 400ms collapse delay
  };

  // Drag operations
  const handlePointerDown = async (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // Only drag with left click
    e.currentTarget.setPointerCapture(e.pointerId);

    const appWin = getCurrentWindow() as any;
    const pos = await appWin.outerPosition();
    const monitor = await currentMonitor();
    const sf = monitor?.scaleFactor ?? 1;

    dragRef.current = {
      isDragging: true,
      startScreenX: e.screenX,
      startScreenY: e.screenY,
      startWindowX: pos.x / sf,
      startWindowY: pos.y / sf,
      scaleFactor: sf,
      hasMoved: false,
    };
  };

  const handlePointerMove = async (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || !dragRef.current.isDragging) return;

    const deltaX = e.screenX - dragRef.current.startScreenX;
    const deltaY = e.screenY - dragRef.current.startScreenY;

    if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
      dragRef.current.hasMoved = true;
    }

    if (dragRef.current.hasMoved) {
      const newX = dragRef.current.startWindowX + deltaX;
      const newY = dragRef.current.startWindowY + deltaY;

      const appWin = getCurrentWindow() as any;
      await appWin.setPosition(new LogicalPosition(newX, newY));
    }
  };

  const handlePointerUp = async (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    e.currentTarget.releasePointerCapture(e.pointerId);

    const appWin = getCurrentWindow() as any;

    if (dragRef.current.hasMoved) {
      // Snapping logic
      const monitor = await currentMonitor();
      if (monitor) {
        const pos = await appWin.outerPosition();
        const sf = monitor.scaleFactor;
        const currentX = pos.x / sf;
        const currentY = pos.y / sf;

        const monitorX = monitor.position.x / sf;
        const monitorWidth = monitor.size.width / sf;
        const monitorY = monitor.position.y / sf;
        const monitorHeight = monitor.size.height / sf;

        // Snap closest edge
        const centerX = currentX + 380 / 2;
        const monitorCenterX = monitorX + monitorWidth / 2;
        const isLeft = centerX < monitorCenterX;

        const snapX = isLeft ? monitorX : (monitorX + monitorWidth - 380);
        const minY = monitorY + 10;
        const maxY = monitorY + monitorHeight - 120 - 10;
        const snapY = Math.max(minY, Math.min(maxY, currentY));

        await animateWindowPosition(appWin, currentX, currentY, snapX, snapY, 160);

        const newAlign = isLeft ? "left" : "right";
        setAlign(newAlign);
        localStorage.setItem("orbitstart_bubble_align", newAlign);
        localStorage.setItem("orbitstart_bubble_position", JSON.stringify({ x: snapX, y: snapY }));
      }
    } else {
      // Clicked! Hide bubble and restore main window
      await exitFloatingModeAndShowMain();
    }

    dragRef.current = null;
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleMenuAction = async (actionName: string) => {
    setContextMenu(null);
    if (actionName === "exit") {
      await exit(0);
    } else if (actionName === "hide") {
      const appWin = getCurrentWindow() as any;
      await appWin.hide();
    } else {
      await exitFloatingModeAndShowMain(actionName);
    }
  };

  const actions = [
    { id: "search", name: "search", label: "搜索", tooltip: "搜索资源", icon: Search },
    { id: "add", name: "add-resource", label: "添加", tooltip: "添加资源", icon: Plus },
    { id: "work", name: "workspace", label: "workspace", tooltip: "工作区", icon: FolderKanban },
    { id: "recent", name: "recent", label: "最近", tooltip: "最近使用", icon: Clock },
    { id: "settings", name: "settings", label: "设置", tooltip: "设置", icon: Settings },
  ];

  return (
    <div className="bubble-window-wrapper">
      <div 
        className={`bubble-active-area align-${align} ${isHovered ? "expanded" : "collapsed"}`}
        style={styleVariables}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onContextMenu={handleContextMenu}
      >
        {/* Main Ball */}
        <div 
          className={`main-bubble ${isMainBubbleHovered ? "hovered" : ""}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onMouseEnter={() => setIsMainBubbleHovered(true)}
          onMouseLeave={() => setIsMainBubbleHovered(false)}
        >
          <img 
            src={isMainBubbleHovered ? hoverImg : normalImg} 
            alt="OrbitStart" 
            className="bubble-img"
            draggable={false}
          />
        </div>

        {/* Action Balls */}
        <div className="shortcut-balls-container">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <div key={action.id} className="shortcut-ball-wrapper">
                <button 
                  className="shortcut-ball"
                  onClick={() => handleMenuAction(action.name)}
                  type="button"
                >
                  <Icon size={18} />
                </button>
                <div className="tooltip">{action.tooltip}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Context Menu Overlay */}
      {contextMenu && (
        <div 
          className="bubble-context-menu" 
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button onClick={() => handleMenuAction("open")}>打开 OrbitStart</button>
          <button onClick={() => handleMenuAction("search")}>聚焦搜索</button>
          <button onClick={() => handleMenuAction("add-resource")}>添加资源</button>
          <button onClick={() => handleMenuAction("settings")}>设置</button>
          <button onClick={() => handleMenuAction("hide")}>暂时隐藏悬浮球</button>
          <hr className="menu-divider" />
          <button onClick={() => handleMenuAction("exit")} className="menu-danger">退出 OrbitStart</button>
        </div>
      )}
    </div>
  );
}
