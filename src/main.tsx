import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import DiagnosticsPage from "./diag/DiagnosticsPage";
import "./styles.css";

// ?diag=1 mounts the performance diagnostics INSTEAD of the app. It has to be
// reachable from the address bar alone: on a managed machine DevTools may be
// disabled by policy, and mounting it in place of App keeps its measurements
// clear of the app's own map layers.
const diag = new URLSearchParams(location.search).has("diag");

createRoot(document.getElementById("root")!).render(
  <StrictMode>{diag ? <DiagnosticsPage /> : <App />}</StrictMode>,
);
