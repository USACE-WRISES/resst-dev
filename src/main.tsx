import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// ?diag=1 mounts the performance diagnostics INSTEAD of the app. It has to be
// reachable from the address bar alone: on a managed machine DevTools may be
// disabled by policy, and mounting it in place of App keeps its measurements
// clear of the app's own map layers. See docs/DEPLOYMENT.md.
//
// Loaded lazily so it lands in its own chunk: the diagnostics are ~11 KB
// gzipped, and this is the one route that needs them. Everyone else pays
// nothing for a page they will never open.
const DiagnosticsPage = lazy(() => import("./diag/DiagnosticsPage"));

const diag = new URLSearchParams(location.search).has("diag");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {diag ? (
      <Suspense
        fallback={
          <p style={{ font: '14px system-ui, "Segoe UI", sans-serif', padding: 24 }}>
            Loading diagnostics…
          </p>
        }
      >
        <DiagnosticsPage />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
