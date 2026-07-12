import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const isStandalone =
  window.matchMedia("(display-mode: standalone)").matches ||
  (window.navigator as any).standalone;

// Chrome's address-bar "Open in app" can launch the installed PWA with the
// current landing URL. In standalone mode, always enter the actual app shell.
if (isStandalone && !window.location.pathname.startsWith("/app")) {
  window.location.replace("/app/");
}

// Register Service Worker for PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(import.meta.env.BASE_URL + "sw.js", { scope: import.meta.env.BASE_URL })
      .then((registration) => {
        console.log("SW registered: ", registration);
      })
      .catch((registrationError) => {
        console.log("SW registration failed: ", registrationError);
      });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
