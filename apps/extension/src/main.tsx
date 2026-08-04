import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { connectSidePanelHost } from "./lib/side-panel";
import { isOverlayHost } from "./lib/ui-host";
import "./styles.css";

// Only register the side-panel host port when running in the native side panel.
// The overlay iframe does not need (or support) the chrome.sidePanel port handshake.
if (!isOverlayHost()) {
  connectSidePanelHost();
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
