import { contextBridge, ipcRenderer } from "electron";
import type { LogEntry, ServeManagerApi, Service } from "@shared/types";

const api: ServeManagerApi = {
  getSnapshot: () => ipcRenderer.invoke("app:get-snapshot"),
  chooseDirectory: () => ipcRenderer.invoke("dialog:choose-directory"),
  scanProject: (rootPath) => ipcRenderer.invoke("project:scan", rootPath),
  detectService: (servicePath) => ipcRenderer.invoke("service:detect", servicePath),
  saveProject: (input) => ipcRenderer.invoke("project:save", input),
  saveService: (input) => ipcRenderer.invoke("service:save", input),
  updateService: (input) => ipcRenderer.invoke("service:update", input),
  deleteService: (serviceId) => ipcRenderer.invoke("service:delete", serviceId),
  checkDependencies: (serviceId) => ipcRenderer.invoke("dependency:check", serviceId),
  installDependencies: (serviceId) => ipcRenderer.invoke("dependency:install", serviceId),
  startService: (serviceId) => ipcRenderer.invoke("service:start", serviceId),
  stopService: (serviceId) => ipcRenderer.invoke("service:stop", serviceId),
  stopAllServices: () => ipcRenderer.invoke("service:stop-all"),
  getLogs: (serviceId) => ipcRenderer.invoke("logs:get", serviceId),
  clearLogs: (serviceId) => ipcRenderer.invoke("logs:clear", serviceId),
  onLog: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, entry: LogEntry): void => callback(entry);
    ipcRenderer.on("logs:entry", listener);
    return () => ipcRenderer.removeListener("logs:entry", listener);
  },
  onServiceChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, service: Service): void => callback(service);
    ipcRenderer.on("service:changed", listener);
    return () => ipcRenderer.removeListener("service:changed", listener);
  }
};

contextBridge.exposeInMainWorld("serveManager", api);
