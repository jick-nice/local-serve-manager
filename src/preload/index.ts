import { contextBridge, ipcRenderer } from "electron";
import type { CommandLogEntry, LogEntry, ServeManagerApi, Service, ServiceCommand } from "@shared/types";

const api: ServeManagerApi = {
  getSnapshot: () => ipcRenderer.invoke("app:get-snapshot"),
  chooseDirectory: () => ipcRenderer.invoke("dialog:choose-directory"),
  scanProject: (rootPath) => ipcRenderer.invoke("project:scan", rootPath),
  detectService: (servicePath) => ipcRenderer.invoke("service:detect", servicePath),
  saveProject: (input) => ipcRenderer.invoke("project:save", input),
  saveService: (input) => ipcRenderer.invoke("service:save", input),
  updateService: (input) => ipcRenderer.invoke("service:update", input),
  deleteService: (serviceId) => ipcRenderer.invoke("service:delete", serviceId),
  listCommands: (serviceId) => ipcRenderer.invoke("command:list", serviceId),
  saveCommand: (input) => ipcRenderer.invoke("command:save", input),
  updateCommand: (input) => ipcRenderer.invoke("command:update", input),
  deleteCommand: (commandId) => ipcRenderer.invoke("command:delete", commandId),
  runCommand: (commandId) => ipcRenderer.invoke("command:run", commandId),
  stopCommand: (commandId) => ipcRenderer.invoke("command:stop", commandId),
  getCommandLogs: (commandId) => ipcRenderer.invoke("command-logs:get", commandId),
  clearCommandLogs: (commandId) => ipcRenderer.invoke("command-logs:clear", commandId),
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
  },
  onCommandLog: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, entry: CommandLogEntry): void => callback(entry);
    ipcRenderer.on("command-logs:entry", listener);
    return () => ipcRenderer.removeListener("command-logs:entry", listener);
  },
  onCommandChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, command: ServiceCommand): void => callback(command);
    ipcRenderer.on("command:changed", listener);
    return () => ipcRenderer.removeListener("command:changed", listener);
  }
};

contextBridge.exposeInMainWorld("serveManager", api);
