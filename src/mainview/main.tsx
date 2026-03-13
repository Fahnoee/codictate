import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { Electroview } from "electrobun/view";
import type { WebviewRPCType } from "../shared/types";
import { appEvents } from "./app-events";
import type { PermissionState } from "./app-events";
import type { AppStatus } from "../shared/types";

const rpc = Electroview.defineRPC<WebviewRPCType>({
  handlers: {
    messages: {
      updatePermissions: (data: PermissionState) =>
        appEvents.emit("permissions", data),
      updateStatus: ({ status }: { status: AppStatus }) =>
        appEvents.emit("status", status),
    },
  },
});

// Forward openSettings events from UI components to Bun via rpc
appEvents.on("openSettings", (pane) => {
  rpc.send.openSystemPreferences({ pane });
});

new Electroview({ rpc });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
