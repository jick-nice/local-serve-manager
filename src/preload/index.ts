import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("serveManager", {
  version: "0.1.0"
});
