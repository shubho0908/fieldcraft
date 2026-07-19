import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { connectSidePanelHost } from "./lib/side-panel";
import "./styles.css";

// Register with the service worker so Alt+F / ⌥F can close this panel.
connectSidePanelHost();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
