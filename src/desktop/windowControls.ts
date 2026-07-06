import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export type ResizeDirection = "East" | "North" | "NorthEast" | "NorthWest" | "South" | "SouthEast" | "SouthWest" | "West";

export function getAppWindow() {
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
}

export function runWindowAction(action: (window: NonNullable<ReturnType<typeof getAppWindow>>) => Promise<unknown>) {
  const appWindow = getAppWindow();
  if (!appWindow) return;
  void action(appWindow).catch(() => undefined);
}

export function minimizeWindow() {
  void invoke("minimize_current_window").catch(() => undefined);
}

export function toggleMaximizeWindow() {
  void invoke("toggle_maximize_current_window").catch(() => undefined);
}

export function closeWindow() {
  void invoke("close_current_window").catch(() => undefined);
}

export function startWindowDrag() {
  runWindowAction((window) => window.startDragging());
}

export function startWindowResize(direction: ResizeDirection) {
  runWindowAction((window) => window.startResizeDragging(direction));
}

export function showAndFocusWindow() {
  runWindowAction(async (window) => {
    await window.show();
    await window.unminimize();
    await window.setFocus();
  });
}
