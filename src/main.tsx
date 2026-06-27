import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import { invoke } from "@tauri-apps/api/core";

window.addEventListener("error", (event) => {
  const msg = `JS Error: ${event.message} at ${event.filename}:${event.lineno}:${event.colno}`;
  console.error(msg);
  invoke("log_frontend_error", { message: msg }).catch(() => undefined);
});
window.addEventListener("unhandledrejection", (event) => {
  const msg = `Unhandled Rejection: ${String(event.reason)}`;
  console.error(msg);
  invoke("log_frontend_error", { message: msg }).catch(() => undefined);
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

