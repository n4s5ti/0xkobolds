/**
 * 0xKobold Desktop - Renderer Entry Point
 *
 * Initializes the web UI and mounts the main application.
 * Uses Lit for web components (consistent with pi-web-ui).
 */

import { html, render } from "lit";
import "./styles/app.css";

// Import the main app component
import { KoboldApp } from "./app";

// Register custom elements (guard against hot-reload)
if (!customElements.get("kobold-app")) {
  customElements.define("kobold-app", KoboldApp);
}

// Mount the app
declare global {
  interface HTMLElementTagNameMap {
    "kobold-app": KoboldApp;
  }
}

const root = document.getElementById("app");
if (root) {
  render(html`<kobold-app></kobold-app>`, root);
} else {
  console.error("Could not find #app element");
}

// Log initialization
console.log("🐉 0xKobold Desktop initialized");
console.log("Electron:", window.versions?.electron);
console.log("Chrome:", window.versions?.chrome);
