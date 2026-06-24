import { app, BrowserWindow, dialog, ipcMain, session } from "electron";
import { basename, join } from "node:path";
import type { Service, ServiceCommand, ServiceCommandDraft, ServiceDraft } from "@shared/types";
import { syncConfigsForProject, syncConfigsForService } from "./configSync";
import { AppDatabase } from "./database";
import { checkDependencies, detectService, scanProject } from "./detector";
import { ProcessManager } from "./processManager";

let database: AppDatabase;
let processManager: ProcessManager;
let allowQuit = false;

const isTrustedDevUrl = (rawUrl: string | undefined): rawUrl is string => {
  if (app.isPackaged || !rawUrl) {
    return false;
  }

  try {
    const url = new URL(rawUrl);
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch {
    return false;
  }
};

const createContentSecurityPolicy = (allowDevServer: boolean): string => {
  return [
    "default-src 'self'",
    allowDevServer ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    allowDevServer
      ? "connect-src 'self' ws://localhost:* http://localhost:* ws://127.0.0.1:* http://127.0.0.1:*"
      : "connect-src 'self'"
  ].join("; ");
};

const registerContentSecurityPolicy = (allowDevServer: boolean): void => {
  const contentSecurityPolicy = createContentSecurityPolicy(allowDevServer);

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...(details.responseHeaders ?? {}),
        "Content-Security-Policy": [contentSecurityPolicy]
      }
    });
  });
};

const serviceToDraft = (service: Service): ServiceDraft => ({
  name: service.name,
  servicePath: service.servicePath,
  stack: service.stack,
  command: service.command,
  port: service.port,
  backendServiceId: service.backendServiceId,
  note: service.note
});

const syncServiceConfigs = (service: Service): void => {
  syncConfigsForService(service, database.listProjects());
};

const registerIpc = (): void => {
  ipcMain.handle("app:get-snapshot", () => ({ projects: database.listProjects() }));
  ipcMain.handle("dialog:choose-directory", async () => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"], title: "选择项目或服务目录" });
    return { canceled: result.canceled, path: result.filePaths[0] ?? null };
  });
  ipcMain.handle("project:scan", (_event, rootPath: string) => scanProject(rootPath));
  ipcMain.handle("service:detect", (_event, servicePath: string) => detectService(servicePath));
  ipcMain.handle("project:save", (_event, input: { name: string; rootPath: string; services: ServiceDraft[] }) =>
    {
      const project = database.createProject(input.name || basename(input.rootPath), input.rootPath, input.services);
      syncConfigsForProject(project, database.listProjects());
      return project;
    }
  );
  ipcMain.handle("service:save", (_event, input: ServiceDraft & { projectId: number }) => {
    const service = database.createService(input.projectId, input);
    syncServiceConfigs(service);
    return service;
  });
  ipcMain.handle("service:update", (_event, input: Service) => {
    const service = database.updateService(input);
    syncServiceConfigs(service);
    return service;
  });
  ipcMain.handle("service:delete", (_event, serviceId: number) => database.deleteService(serviceId));
  ipcMain.handle("command:list", (_event, serviceId: number) => database.listCommands(serviceId));
  ipcMain.handle("command:save", (_event, input: ServiceCommandDraft & { serviceId: number }) => database.createCommand(input.serviceId, input));
  ipcMain.handle("command:update", (_event, input: ServiceCommand) => database.updateCommand(input));
  ipcMain.handle("command:delete", (_event, commandId: number) => database.deleteCommand(commandId));
  ipcMain.handle("command:run", (_event, commandId: number) => {
    const command = database.getCommand(commandId);
    processManager.runCommand(command, database.getService(command.serviceId));
  });
  ipcMain.handle("command:stop", (_event, commandId: number) => processManager.stopCommand(commandId));
  ipcMain.handle("command-logs:get", (_event, commandId: number) => database.listCommandLogs(commandId));
  ipcMain.handle("command-logs:clear", (_event, commandId: number) => database.clearCommandLogs(commandId));
  ipcMain.handle("dependency:check", (_event, serviceId: number) => checkDependencies(serviceToDraft(database.getService(serviceId))));
  ipcMain.handle("dependency:install", (_event, serviceId: number) => {
    const service = database.getService(serviceId);
    const dependency = checkDependencies(serviceToDraft(service));
    if (dependency.installCommand) processManager.runInstall(service, dependency.installCommand);
  });
  ipcMain.handle("service:start", (_event, serviceId: number) => {
    const service = database.getService(serviceId);
    syncServiceConfigs(service);
    return processManager.start(service);
  });
  ipcMain.handle("service:stop", (_event, serviceId: number) => processManager.stop(serviceId));
  ipcMain.handle("service:stop-all", () => processManager.stopAll());
  ipcMain.handle("port:stop", (_event, port: number) => processManager.stopPort(port));
  ipcMain.handle("logs:get", (_event, serviceId: number) => database.listLogs(serviceId));
  ipcMain.handle("logs:clear", (_event, serviceId: number) => database.clearLogs(serviceId));
};

const createWindow = (trustedDevUrl?: string): BrowserWindow => {
  const window = new BrowserWindow({
    width: 1220,
    height: 780,
    minWidth: 980,
    minHeight: 640,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.once("ready-to-show", () => window.show());
  window.on("close", async (event) => {
    if (allowQuit || !processManager.hasRunning()) {
      database.clearAllLogs();
      return;
    }

    event.preventDefault();
    const result = await dialog.showMessageBox(window, {
      type: "question",
      buttons: ["停止服务后退出", "取消"],
      defaultId: 0,
      cancelId: 1,
      title: "还有服务在运行",
      message: "还有由本地服务管理器启动的服务在运行，要停止后退出吗？"
    });
    if (result.response === 0) {
      await processManager.stopAll();
      database.clearAllLogs();
      allowQuit = true;
      app.quit();
    }
  });

  if (trustedDevUrl) {
    void window.loadURL(trustedDevUrl);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return window;
};

app.whenReady().then(() => {
  const trustedDevUrl = isTrustedDevUrl(process.env.ELECTRON_RENDERER_URL)
    ? process.env.ELECTRON_RENDERER_URL
    : undefined;

  registerContentSecurityPolicy(Boolean(trustedDevUrl));
  database = new AppDatabase();
  database.clearAllLogs();
  processManager = new ProcessManager(database);
  registerIpc();
  createWindow(trustedDevUrl);
});

app.on("window-all-closed", () => {
  app.quit();
});
