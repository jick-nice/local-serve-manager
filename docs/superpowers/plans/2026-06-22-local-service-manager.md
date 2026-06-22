# Local Service Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows Electron desktop app that manages local frontend, backend, and custom development services with stack detection, port configuration, dependency prompts, one-click start/stop, and live logs.

**Architecture:** Electron Main owns local capabilities: SQLite, filesystem scanning, port checks, process control, logs, and app lifecycle. React Renderer owns the UI and talks to Main only through a typed preload API. SQLite persists project/service settings and stores logs only for the current app session.

**Tech Stack:** Electron, electron-vite, React, TypeScript, SQLite through better-sqlite3, Vitest, electron-builder, Windows-only process control.

---

## Scope Check

The approved spec describes one integrated desktop product. It includes several modules, but they are tightly connected through one local workflow: scan projects, configure services, start processes, stream logs, and package a Windows installer. Keep this as one implementation plan with small testable tasks.

All files must stay under `E:\Work\ServeManager`. Commits are local rollback points only; do not push or create a remote.

## Planned File Structure

```text
E:\Work\ServeManager
  package.json
  tsconfig.json
  tsconfig.node.json
  electron.vite.config.ts
  index.html
  vitest.config.ts
  .gitignore
  src/
    main/
      main.ts
      appPaths.ts
      lifecycle.ts
      db/
        database.ts
        schema.ts
        repositories.ts
      detection/
        commandParser.ts
        packageManager.ts
        stackDetector.ts
        projectScanner.ts
      ipc/
        channels.ts
        registerHandlers.ts
      services/
        dependencyService.ts
        portService.ts
        processManager.ts
    preload/
      index.ts
    renderer/
      src/
        App.tsx
        main.tsx
        styles.css
        components/
          ConfirmDialog.tsx
          LogsDrawer.tsx
          ProjectGroup.tsx
          ServiceEditor.tsx
          ServiceRow.tsx
          Toolbar.tsx
        hooks/
          useAppData.ts
        types/
          global.d.ts
    shared/
      types.ts
      serviceDefaults.ts
  tests/
    fixtures/
      node-react/
        package.json
        package-lock.json
      node-vue/
        package.json
        pnpm-lock.yaml
      flutter-app/
        pubspec.yaml
      fastapi-app/
        main.py
        requirements.txt
      flask-app/
        app.py
        requirements.txt
      maven-app/
        pom.xml
      gradle-app/
        build.gradle
        gradlew
    main/
      commandParser.test.ts
      database.test.ts
      dependencyService.test.ts
      packageManager.test.ts
      portService.test.ts
      projectScanner.test.ts
      stackDetector.test.ts
```

## Shared Domain Model

Use these names consistently across tasks:

```ts
export type ServiceStatus = "stopped" | "starting" | "running" | "failed" | "stopping";
export type ServiceStack =
  | "react"
  | "vue"
  | "flutter"
  | "flask"
  | "fastapi"
  | "spring-maven"
  | "spring-gradle"
  | "custom";
export type LogStream = "stdout" | "stderr" | "system";
```

---

### Task 1: Scaffold Electron, React, TypeScript, and Test Tooling

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `electron.vite.config.ts`
- Create: `index.html`
- Create: `vitest.config.ts`
- Create: `src/main/main.ts`
- Create: `src/preload/index.ts`
- Create: `src/renderer/src/main.tsx`
- Create: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/styles.css`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "serve-manager",
  "version": "0.1.0",
  "description": "Windows desktop manager for local development services.",
  "private": true,
  "main": "out/main/main.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "tsc --noEmit && electron-vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "dist": "npm run build && electron-builder --win nsis",
    "postinstall": "electron-builder install-app-deps"
  },
  "dependencies": {
    "@electron-toolkit/preload": "^3.0.1",
    "@electron-toolkit/utils": "^3.0.0",
    "better-sqlite3": "^11.9.1",
    "cross-spawn": "^7.0.6",
    "lucide-react": "^0.468.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "string-argv": "^0.3.2",
    "tree-kill": "^1.2.2"
  },
  "devDependencies": {
    "@electron-toolkit/tsconfig": "^1.0.1",
    "@types/better-sqlite3": "^7.6.12",
    "@types/node": "^22.10.2",
    "@types/react": "^18.3.18",
    "@types/react-dom": "^18.3.5",
    "@types/tree-kill": "^1.2.5",
    "@vitejs/plugin-react": "^4.3.4",
    "electron": "^33.2.1",
    "electron-builder": "^25.1.8",
    "electron-vite": "^2.3.0",
    "typescript": "^5.7.2",
    "vite": "^6.0.5",
    "vitest": "^2.1.8"
  },
  "build": {
    "appId": "local.serve.manager",
    "productName": "Serve Manager",
    "directories": {
      "output": "dist"
    },
    "files": [
      "out/**/*",
      "package.json"
    ],
    "win": {
      "target": "nsis"
    },
    "nsis": {
      "oneClick": false,
      "perMachine": false,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true,
      "shortcutName": "Serve Manager"
    }
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```gitignore
node_modules/
out/
dist/
coverage/
*.log
*.sqlite
*.sqlite-shm
*.sqlite-wal
.env
.vite/
```

- [ ] **Step 3: Create TypeScript and Vite config files**

`tsconfig.json`:

```json
{
  "extends": "@electron-toolkit/tsconfig/tsconfig.web.json",
  "include": ["src/renderer/src/**/*", "src/shared/**/*", "src/preload/**/*", "tests/**/*"],
  "compilerOptions": {
    "composite": true,
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["src/shared/*"]
    }
  }
}
```

`tsconfig.node.json`:

```json
{
  "extends": "@electron-toolkit/tsconfig/tsconfig.node.json",
  "include": ["electron.vite.config.ts", "src/main/**/*", "src/preload/**/*", "src/shared/**/*"],
  "compilerOptions": {
    "composite": true,
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["src/shared/*"]
    }
  }
}
```

`electron.vite.config.ts`:

```ts
import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@shared": resolve("src/shared")
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@shared": resolve("src/shared")
      }
    }
  },
  renderer: {
    root: ".",
    resolve: {
      alias: {
        "@shared": resolve("src/shared")
      }
    },
    plugins: [react()]
  }
});
```

`vitest.config.ts`:

```ts
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"]
  },
  resolve: {
    alias: {
      "@shared": resolve("src/shared")
    }
  }
});
```

- [ ] **Step 4: Create the minimum app shell**

`index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Serve Manager</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/renderer/src/main.tsx"></script>
  </body>
</html>
```

`src/main/main.ts`:

```ts
import { app, BrowserWindow } from "electron";
import { join } from "node:path";

const createWindow = (): void => {
  const window = new BrowserWindow({
    width: 1220,
    height: 780,
    minWidth: 980,
    minHeight: 640,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.once("ready-to-show", () => window.show());

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }
};

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  app.quit();
});
```

`src/preload/index.ts`:

```ts
import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("serveManager", {
  version: "0.1.0"
});
```

`src/renderer/src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

`src/renderer/src/App.tsx`:

```tsx
export default function App(): JSX.Element {
  return (
    <main className="app-shell">
      <header className="topbar">
        <h1>Serve Manager</h1>
      </header>
      <section className="empty-state">本地服务管理台已启动</section>
    </main>
  );
}
```

`src/renderer/src/styles.css`:

```css
:root {
  color: #17202a;
  background: #f5f7f9;
  font-family:
    "Segoe UI",
    "Microsoft YaHei",
    Arial,
    sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

.app-shell {
  min-height: 100vh;
}

.topbar {
  height: 56px;
  display: flex;
  align-items: center;
  padding: 0 18px;
  border-bottom: 1px solid #d8dee6;
  background: #ffffff;
}

.topbar h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 650;
}

.empty-state {
  padding: 24px;
}
```

- [ ] **Step 5: Install dependencies**

Run:

```powershell
npm install
```

Expected: dependencies install without missing package errors.

- [ ] **Step 6: Verify scaffold**

Run:

```powershell
npm run build
npm test
```

Expected: `npm run build` exits 0; `npm test` exits 0 with no tests found or a clean Vitest run.

- [ ] **Step 7: Commit local rollback point**

```powershell
git add package.json package-lock.json .gitignore tsconfig.json tsconfig.node.json electron.vite.config.ts index.html vitest.config.ts src
git commit -m "chore: scaffold electron app"
```

---

### Task 2: Add Shared Types and Preload API Contract

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/shared/serviceDefaults.ts`
- Create: `src/renderer/src/types/global.d.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Create shared types**

`src/shared/types.ts`:

```ts
export type ServiceStatus = "stopped" | "starting" | "running" | "failed" | "stopping";
export type ServiceStack =
  | "react"
  | "vue"
  | "flutter"
  | "flask"
  | "fastapi"
  | "spring-maven"
  | "spring-gradle"
  | "custom";
export type LogStream = "stdout" | "stderr" | "system";

export interface Project {
  id: number;
  name: string;
  rootPath: string;
  createdAt: string;
  updatedAt: string;
}

export interface Service {
  id: number;
  projectId: number;
  name: string;
  servicePath: string;
  stack: ServiceStack;
  command: string;
  port: number | null;
  note: string;
  sortOrder: number;
  lastStatus: ServiceStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceDraft {
  name: string;
  servicePath: string;
  stack: ServiceStack;
  command: string;
  port: number | null;
  note: string;
}

export interface ProjectWithServices extends Project {
  services: Service[];
}

export interface LogEntry {
  id: number;
  serviceId: number;
  timestamp: string;
  stream: LogStream;
  content: string;
}

export interface StackDetectionResult {
  stack: ServiceStack;
  command: string;
  port: number | null;
  confidence: "high" | "medium" | "low";
  evidence: string[];
}

export interface DependencyCheck {
  missing: boolean;
  message: string;
  installCommand: string | null;
}

export interface PortCheck {
  requestedPort: number;
  available: boolean;
  suggestedPort: number | null;
}

export interface AppSnapshot {
  projects: ProjectWithServices[];
}

export interface ServeManagerApi {
  getSnapshot(): Promise<AppSnapshot>;
  chooseProjectRoot(): Promise<{ canceled: boolean; path: string | null }>;
  scanProject(rootPath: string): Promise<ServiceDraft[]>;
  saveProject(input: { name: string; rootPath: string; services: ServiceDraft[] }): Promise<ProjectWithServices>;
  saveService(input: ServiceDraft & { projectId: number }): Promise<Service>;
  updateService(input: Service): Promise<Service>;
  deleteService(serviceId: number): Promise<void>;
  checkPort(port: number): Promise<PortCheck>;
  checkDependencies(serviceId: number): Promise<DependencyCheck>;
  installDependencies(serviceId: number): Promise<void>;
  startService(serviceId: number): Promise<PortCheck | null>;
  stopService(serviceId: number): Promise<void>;
  stopAllServices(): Promise<void>;
  getLogs(serviceId: number): Promise<LogEntry[]>;
  clearLogs(serviceId: number): Promise<void>;
  onLog(callback: (entry: LogEntry) => void): () => void;
  onServiceChanged(callback: (service: Service) => void): () => void;
}
```

- [ ] **Step 2: Create stack labels and default ports**

`src/shared/serviceDefaults.ts`:

```ts
import type { ServiceStack } from "./types";

export const STACK_LABELS: Record<ServiceStack, string> = {
  react: "React",
  vue: "Vue",
  flutter: "Flutter",
  flask: "Flask",
  fastapi: "FastAPI",
  "spring-maven": "Spring Boot Maven",
  "spring-gradle": "Spring Boot Gradle",
  custom: "Custom"
};

export const DEFAULT_PORTS: Record<ServiceStack, number | null> = {
  react: 5173,
  vue: 5173,
  flutter: null,
  flask: 5000,
  fastapi: 8000,
  "spring-maven": 8080,
  "spring-gradle": 8080,
  custom: null
};
```

- [ ] **Step 3: Define renderer global API type**

`src/renderer/src/types/global.d.ts`:

```ts
import type { ServeManagerApi } from "@shared/types";

declare global {
  interface Window {
    serveManager: ServeManagerApi;
  }
}

export {};
```

- [ ] **Step 4: Expose a typed preload skeleton**

`src/preload/index.ts`:

```ts
import { contextBridge, ipcRenderer } from "electron";
import type { LogEntry, Service } from "@shared/types";
import type { ServeManagerApi } from "@shared/types";

const api: ServeManagerApi = {
  getSnapshot: () => ipcRenderer.invoke("app:get-snapshot"),
  chooseProjectRoot: () => ipcRenderer.invoke("dialog:choose-project-root"),
  scanProject: (rootPath) => ipcRenderer.invoke("project:scan", rootPath),
  saveProject: (input) => ipcRenderer.invoke("project:save", input),
  saveService: (input) => ipcRenderer.invoke("service:save", input),
  updateService: (input) => ipcRenderer.invoke("service:update", input),
  deleteService: (serviceId) => ipcRenderer.invoke("service:delete", serviceId),
  checkPort: (port) => ipcRenderer.invoke("port:check", port),
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
```

- [ ] **Step 5: Verify types compile**

Run:

```powershell
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit local rollback point**

```powershell
git add src/shared src/preload src/renderer/src/types
git commit -m "feat: add shared service contracts"
```

---

### Task 3: Implement SQLite Schema and Repositories

**Files:**
- Create: `src/main/appPaths.ts`
- Create: `src/main/db/schema.ts`
- Create: `src/main/db/database.ts`
- Create: `src/main/db/repositories.ts`
- Create: `tests/main/database.test.ts`

- [ ] **Step 1: Write database tests first**

`tests/main/database.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "../../src/main/db/database";
import { createRepositories } from "../../src/main/db/repositories";

let dir = "";

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "serve-manager-db-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("database repositories", () => {
  it("persists projects and services", () => {
    const db = createDatabase(join(dir, "app.sqlite"));
    const repos = createRepositories(db);

    const project = repos.projects.create("Demo", "E:/demo");
    const service = repos.services.create(project.id, {
      name: "web",
      servicePath: "E:/demo/web",
      stack: "react",
      command: "npm run dev",
      port: 5173,
      note: "front",
      sortOrder: 0,
      lastStatus: "stopped"
    });

    const snapshot = repos.projects.listWithServices();

    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].services[0].id).toBe(service.id);
    expect(snapshot[0].services[0].command).toBe("npm run dev");
    db.close();
  });

  it("clears logs without deleting service configuration", () => {
    const db = createDatabase(join(dir, "app.sqlite"));
    const repos = createRepositories(db);
    const project = repos.projects.create("Demo", "E:/demo");
    const service = repos.services.create(project.id, {
      name: "api",
      servicePath: "E:/demo/api",
      stack: "fastapi",
      command: "uvicorn main:app --reload --port 8000",
      port: 8000,
      note: "",
      sortOrder: 0,
      lastStatus: "stopped"
    });

    repos.logs.append(service.id, "stdout", "ready");
    repos.logs.clearAll();

    expect(repos.logs.list(service.id)).toEqual([]);
    expect(repos.projects.listWithServices()[0].services).toHaveLength(1);
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```powershell
npm test -- tests/main/database.test.ts
```

Expected: FAIL because `createDatabase` and repositories do not exist.

- [ ] **Step 3: Implement app path helper**

`src/main/appPaths.ts`:

```ts
import { app } from "electron";
import { join } from "node:path";

export const getDatabasePath = (): string => {
  return join(app.getPath("userData"), "serve-manager.sqlite");
};
```

- [ ] **Step 4: Implement schema initialization**

`src/main/db/schema.ts`:

```ts
import type Database from "better-sqlite3";

export const initializeSchema = (db: Database.Database): void => {
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      root_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      service_path TEXT NOT NULL,
      stack TEXT NOT NULL,
      command TEXT NOT NULL,
      port INTEGER,
      note TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      last_status TEXT NOT NULL DEFAULT 'stopped',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS service_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_id INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      stream TEXT NOT NULL,
      content TEXT NOT NULL,
      FOREIGN KEY(service_id) REFERENCES services(id) ON DELETE CASCADE
    );
  `);
};
```

- [ ] **Step 5: Implement database factory**

`src/main/db/database.ts`:

```ts
import Database from "better-sqlite3";
import { initializeSchema } from "./schema";

export const createDatabase = (databasePath: string): Database.Database => {
  const db = new Database(databasePath);
  db.pragma("foreign_keys = ON");
  initializeSchema(db);
  return db;
};
```

- [ ] **Step 6: Implement repositories**

`src/main/db/repositories.ts`:

```ts
import type Database from "better-sqlite3";
import type { LogEntry, LogStream, Project, ProjectWithServices, Service, ServiceStack, ServiceStatus } from "@shared/types";

interface ServiceCreateInput {
  name: string;
  servicePath: string;
  stack: ServiceStack;
  command: string;
  port: number | null;
  note: string;
  sortOrder: number;
  lastStatus: ServiceStatus;
}

const now = (): string => new Date().toISOString();

const mapProject = (row: any): Project => ({
  id: row.id,
  name: row.name,
  rootPath: row.root_path,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const mapService = (row: any): Service => ({
  id: row.id,
  projectId: row.project_id,
  name: row.name,
  servicePath: row.service_path,
  stack: row.stack,
  command: row.command,
  port: row.port,
  note: row.note,
  sortOrder: row.sort_order,
  lastStatus: row.last_status,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const mapLog = (row: any): LogEntry => ({
  id: row.id,
  serviceId: row.service_id,
  timestamp: row.timestamp,
  stream: row.stream,
  content: row.content
});

export const createRepositories = (db: Database.Database) => {
  const projects = {
    create(name: string, rootPath: string): Project {
      const timestamp = now();
      const result = db
        .prepare("INSERT INTO projects (name, root_path, created_at, updated_at) VALUES (?, ?, ?, ?)")
        .run(name, rootPath, timestamp, timestamp);
      return mapProject(
        db.prepare("SELECT * FROM projects WHERE id = ?").get(result.lastInsertRowid)
      );
    },
    listWithServices(): ProjectWithServices[] {
      const projectRows = db.prepare("SELECT * FROM projects ORDER BY updated_at DESC, id DESC").all();
      const serviceRows = db.prepare("SELECT * FROM services ORDER BY sort_order ASC, id ASC").all();
      return projectRows.map((projectRow: any) => {
        const project = mapProject(projectRow);
        return {
          ...project,
          services: serviceRows
            .filter((serviceRow: any) => serviceRow.project_id === project.id)
            .map(mapService)
        };
      });
    }
  };

  const services = {
    create(projectId: number, input: ServiceCreateInput): Service {
      const timestamp = now();
      const result = db
        .prepare(
          `INSERT INTO services
           (project_id, name, service_path, stack, command, port, note, sort_order, last_status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          projectId,
          input.name,
          input.servicePath,
          input.stack,
          input.command,
          input.port,
          input.note,
          input.sortOrder,
          input.lastStatus,
          timestamp,
          timestamp
        );
      return mapService(db.prepare("SELECT * FROM services WHERE id = ?").get(result.lastInsertRowid));
    },
    update(input: Service): Service {
      const timestamp = now();
      db.prepare(
        `UPDATE services
         SET name = ?, service_path = ?, stack = ?, command = ?, port = ?, note = ?, sort_order = ?, last_status = ?, updated_at = ?
         WHERE id = ?`
      ).run(
        input.name,
        input.servicePath,
        input.stack,
        input.command,
        input.port,
        input.note,
        input.sortOrder,
        input.lastStatus,
        timestamp,
        input.id
      );
      return this.get(input.id);
    },
    get(id: number): Service {
      const row = db.prepare("SELECT * FROM services WHERE id = ?").get(id);
      if (!row) throw new Error(`Service not found: ${id}`);
      return mapService(row);
    },
    delete(id: number): void {
      db.prepare("DELETE FROM services WHERE id = ?").run(id);
    }
  };

  const logs = {
    append(serviceId: number, stream: LogStream, content: string): LogEntry {
      const timestamp = now();
      const result = db
        .prepare("INSERT INTO service_logs (service_id, timestamp, stream, content) VALUES (?, ?, ?, ?)")
        .run(serviceId, timestamp, stream, content);
      return mapLog(db.prepare("SELECT * FROM service_logs WHERE id = ?").get(result.lastInsertRowid));
    },
    list(serviceId: number): LogEntry[] {
      return db
        .prepare("SELECT * FROM service_logs WHERE service_id = ? ORDER BY id ASC")
        .all(serviceId)
        .map(mapLog);
    },
    clear(serviceId: number): void {
      db.prepare("DELETE FROM service_logs WHERE service_id = ?").run(serviceId);
    },
    clearAll(): void {
      db.prepare("DELETE FROM service_logs").run();
    }
  };

  return { projects, services, logs };
};
```

- [ ] **Step 7: Run tests**

Run:

```powershell
npm test -- tests/main/database.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit local rollback point**

```powershell
git add src/main/appPaths.ts src/main/db tests/main/database.test.ts
git commit -m "feat: add sqlite persistence"
```

---

### Task 4: Implement Command Parsing and Package Manager Detection

**Files:**
- Create: `src/main/detection/commandParser.ts`
- Create: `src/main/detection/packageManager.ts`
- Create: `tests/main/commandParser.test.ts`
- Create: `tests/main/packageManager.test.ts`
- Create fixtures under `tests/fixtures/node-react` and `tests/fixtures/node-vue`

- [ ] **Step 1: Create fixture package files**

`tests/fixtures/node-react/package.json`:

```json
{
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "start": "vite --host 0.0.0.0"
  },
  "dependencies": {
    "react": "^18.3.1",
    "vite": "^6.0.5"
  }
}
```

`tests/fixtures/node-react/package-lock.json`:

```json
{
  "name": "node-react",
  "lockfileVersion": 3
}
```

`tests/fixtures/node-vue/package.json`:

```json
{
  "scripts": {
    "serve": "vite --host 0.0.0.0"
  },
  "dependencies": {
    "vue": "^3.5.13",
    "vite": "^6.0.5"
  }
}
```

`tests/fixtures/node-vue/pnpm-lock.yaml`:

```yaml
lockfileVersion: '9.0'
```

- [ ] **Step 2: Write failing tests**

`tests/main/commandParser.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseCommand } from "../../src/main/detection/commandParser";

describe("parseCommand", () => {
  it("splits a simple command into executable and args", () => {
    expect(parseCommand("npm run dev")).toEqual({ command: "npm", args: ["run", "dev"] });
  });

  it("keeps quoted arguments together", () => {
    expect(parseCommand('flask --app "my app" run --port 5000')).toEqual({
      command: "flask",
      args: ["--app", "my app", "run", "--port", "5000"]
    });
  });
});
```

`tests/main/packageManager.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { detectPackageManager, getRunScriptCommand, pickPreferredScript } from "../../src/main/detection/packageManager";

const fixture = (name: string): string => resolve("tests/fixtures", name);

describe("package manager detection", () => {
  it("prefers pnpm when pnpm-lock.yaml exists", () => {
    expect(detectPackageManager(fixture("node-vue"))).toBe("pnpm");
  });

  it("falls back to npm when package-lock.json exists", () => {
    expect(detectPackageManager(fixture("node-react"))).toBe("npm");
  });

  it("chooses dev before start and serve", () => {
    expect(pickPreferredScript({ start: "vite", dev: "vite", serve: "vite" })).toBe("dev");
  });

  it("builds package-manager-specific run commands", () => {
    expect(getRunScriptCommand("npm", "dev")).toBe("npm run dev");
    expect(getRunScriptCommand("pnpm", "serve")).toBe("pnpm serve");
  });
});
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```powershell
npm test -- tests/main/commandParser.test.ts tests/main/packageManager.test.ts
```

Expected: FAIL because detection modules do not exist.

- [ ] **Step 4: Implement command parser**

`src/main/detection/commandParser.ts`:

```ts
import stringArgv from "string-argv";

export interface ParsedCommand {
  command: string;
  args: string[];
}

export const parseCommand = (rawCommand: string): ParsedCommand => {
  const parts = stringArgv(rawCommand.trim());
  if (parts.length === 0) {
    throw new Error("Command is empty");
  }
  const [command, ...args] = parts;
  return { command, args };
};
```

- [ ] **Step 5: Implement package manager detection**

`src/main/detection/packageManager.ts`:

```ts
import { existsSync } from "node:fs";
import { join } from "node:path";

export type PackageManager = "pnpm" | "yarn" | "bun" | "npm";

export const detectPackageManager = (dir: string): PackageManager => {
  if (existsSync(join(dir, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(dir, "yarn.lock"))) return "yarn";
  if (existsSync(join(dir, "bun.lockb"))) return "bun";
  return "npm";
};

export const pickPreferredScript = (scripts: Record<string, string> = {}): string | null => {
  for (const name of ["dev", "start", "serve"]) {
    if (scripts[name]) return name;
  }
  return null;
};

export const getRunScriptCommand = (manager: PackageManager, script: string): string => {
  if (manager === "npm") return `npm run ${script}`;
  if (manager === "yarn") return `yarn ${script}`;
  if (manager === "pnpm") return `pnpm ${script}`;
  return `bun run ${script}`;
};
```

- [ ] **Step 6: Run tests**

Run:

```powershell
npm test -- tests/main/commandParser.test.ts tests/main/packageManager.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit local rollback point**

```powershell
git add src/main/detection/commandParser.ts src/main/detection/packageManager.ts tests
git commit -m "feat: detect package commands"
```

---

### Task 5: Implement Stack Detection

**Files:**
- Create: `src/main/detection/stackDetector.ts`
- Create fixtures under `tests/fixtures/flutter-app`, `tests/fixtures/fastapi-app`, `tests/fixtures/flask-app`, `tests/fixtures/maven-app`, `tests/fixtures/gradle-app`
- Create: `tests/main/stackDetector.test.ts`

- [ ] **Step 1: Create technology fixtures**

`tests/fixtures/flutter-app/pubspec.yaml`:

```yaml
name: flutter_app
environment:
  sdk: ">=3.0.0 <4.0.0"
```

`tests/fixtures/fastapi-app/main.py`:

```py
from fastapi import FastAPI

app = FastAPI()
```

`tests/fixtures/fastapi-app/requirements.txt`:

```text
fastapi
uvicorn
```

`tests/fixtures/flask-app/app.py`:

```py
from flask import Flask

app = Flask(__name__)
```

`tests/fixtures/flask-app/requirements.txt`:

```text
flask
```

`tests/fixtures/maven-app/pom.xml`:

```xml
<project>
  <modelVersion>4.0.0</modelVersion>
  <groupId>demo</groupId>
  <artifactId>demo</artifactId>
  <version>0.0.1</version>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
      <version>3.4.0</version>
    </dependency>
  </dependencies>
</project>
```

`tests/fixtures/gradle-app/build.gradle`:

```gradle
plugins {
  id 'org.springframework.boot' version '3.4.0'
}
```

`tests/fixtures/gradle-app/gradlew`:

```text
gradle wrapper marker
```

- [ ] **Step 2: Write stack detector tests**

`tests/main/stackDetector.test.ts`:

```ts
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { detectStack } from "../../src/main/detection/stackDetector";

const fixture = (name: string): string => resolve("tests/fixtures", name);

describe("detectStack", () => {
  it("detects React from package.json", () => {
    expect(detectStack(fixture("node-react"))).toMatchObject({
      stack: "react",
      command: "npm run dev",
      port: 5173
    });
  });

  it("detects Vue from package.json", () => {
    expect(detectStack(fixture("node-vue"))).toMatchObject({
      stack: "vue",
      command: "pnpm serve",
      port: 5173
    });
  });

  it("detects Flutter from pubspec.yaml", () => {
    expect(detectStack(fixture("flutter-app"))).toMatchObject({
      stack: "flutter",
      command: "flutter run -d windows",
      port: null
    });
  });

  it("detects FastAPI before Flask when uvicorn is present", () => {
    expect(detectStack(fixture("fastapi-app"))).toMatchObject({
      stack: "fastapi",
      command: "uvicorn main:app --reload --port 8000",
      port: 8000
    });
  });

  it("detects Flask", () => {
    expect(detectStack(fixture("flask-app"))).toMatchObject({
      stack: "flask",
      command: "flask --app app run --port 5000",
      port: 5000
    });
  });

  it("detects Maven Spring Boot", () => {
    expect(detectStack(fixture("maven-app"))).toMatchObject({
      stack: "spring-maven",
      command: "mvn spring-boot:run",
      port: 8080
    });
  });

  it("detects Gradle Spring Boot", () => {
    expect(detectStack(fixture("gradle-app"))).toMatchObject({
      stack: "spring-gradle",
      command: "gradlew bootRun",
      port: 8080
    });
  });
});
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```powershell
npm test -- tests/main/stackDetector.test.ts
```

Expected: FAIL because `stackDetector.ts` does not exist.

- [ ] **Step 4: Implement stack detector**

`src/main/detection/stackDetector.ts`:

```ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { StackDetectionResult } from "@shared/types";
import { detectPackageManager, getRunScriptCommand, pickPreferredScript } from "./packageManager";

const readText = (path: string): string => readFileSync(path, "utf8");

const hasFile = (dir: string, file: string): boolean => existsSync(join(dir, file));

const readIfExists = (dir: string, file: string): string => {
  const path = join(dir, file);
  return existsSync(path) ? readText(path) : "";
};

export const detectStack = (dir: string): StackDetectionResult => {
  if (hasFile(dir, "package.json")) {
    const packageJson = JSON.parse(readText(join(dir, "package.json")));
    const dependencies = {
      ...(packageJson.dependencies ?? {}),
      ...(packageJson.devDependencies ?? {})
    };
    const script = pickPreferredScript(packageJson.scripts ?? {});
    const manager = detectPackageManager(dir);
    const command = script ? getRunScriptCommand(manager, script) : "";

    if (dependencies.react || dependencies.next) {
      return { stack: "react", command, port: 5173, confidence: "high", evidence: ["package.json", "react"] };
    }
    if (dependencies.vue) {
      return { stack: "vue", command, port: 5173, confidence: "high", evidence: ["package.json", "vue"] };
    }
  }

  if (hasFile(dir, "pubspec.yaml")) {
    return {
      stack: "flutter",
      command: "flutter run -d windows",
      port: null,
      confidence: "high",
      evidence: ["pubspec.yaml"]
    };
  }

  const pythonHints = [
    readIfExists(dir, "requirements.txt"),
    readIfExists(dir, "pyproject.toml"),
    readIfExists(dir, "main.py"),
    readIfExists(dir, "app.py")
  ].join("\n").toLowerCase();

  if (pythonHints.includes("fastapi") || pythonHints.includes("uvicorn")) {
    return {
      stack: "fastapi",
      command: "uvicorn main:app --reload --port 8000",
      port: 8000,
      confidence: "medium",
      evidence: ["fastapi or uvicorn"]
    };
  }

  if (pythonHints.includes("flask")) {
    return {
      stack: "flask",
      command: "flask --app app run --port 5000",
      port: 5000,
      confidence: "medium",
      evidence: ["flask"]
    };
  }

  if (hasFile(dir, "pom.xml")) {
    return {
      stack: "spring-maven",
      command: "mvn spring-boot:run",
      port: 8080,
      confidence: "medium",
      evidence: ["pom.xml"]
    };
  }

  if (hasFile(dir, "build.gradle") || hasFile(dir, "build.gradle.kts")) {
    return {
      stack: "spring-gradle",
      command: hasFile(dir, "gradlew") ? "gradlew bootRun" : "gradle bootRun",
      port: 8080,
      confidence: "medium",
      evidence: ["gradle build file"]
    };
  }

  return {
    stack: "custom",
    command: "",
    port: null,
    confidence: "low",
    evidence: []
  };
};
```

- [ ] **Step 5: Run tests**

Run:

```powershell
npm test -- tests/main/stackDetector.test.ts tests/main/packageManager.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit local rollback point**

```powershell
git add src/main/detection/stackDetector.ts tests
git commit -m "feat: detect service stacks"
```

---

### Task 6: Implement Project Scanner

**Files:**
- Create: `src/main/detection/projectScanner.ts`
- Create: `tests/main/projectScanner.test.ts`

- [ ] **Step 1: Write scanner tests**

`tests/main/projectScanner.test.ts`:

```ts
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scanProject } from "../../src/main/detection/projectScanner";

let root = "";

beforeEach(() => {
  root = join(tmpdir(), `serve-manager-scan-${Date.now()}`);
  mkdirSync(join(root, "frontend"), { recursive: true });
  mkdirSync(join(root, "backend"), { recursive: true });
  writeFileSync(
    join(root, "frontend", "package.json"),
    JSON.stringify({ scripts: { dev: "vite" }, dependencies: { react: "^18.0.0" } })
  );
  writeFileSync(join(root, "frontend", "package-lock.json"), "{}");
  writeFileSync(join(root, "backend", "requirements.txt"), "fastapi\nuvicorn\n");
  writeFileSync(join(root, "backend", "main.py"), "from fastapi import FastAPI\napp = FastAPI()\n");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("scanProject", () => {
  it("creates service drafts from common child directories", () => {
    const drafts = scanProject(root);

    expect(drafts).toHaveLength(2);
    expect(drafts.map((draft) => draft.stack).sort()).toEqual(["fastapi", "react"]);
    expect(drafts.find((draft) => draft.name === "frontend")?.command).toBe("npm run dev");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```powershell
npm test -- tests/main/projectScanner.test.ts
```

Expected: FAIL because scanner module does not exist.

- [ ] **Step 3: Implement scanner**

`src/main/detection/projectScanner.ts`:

```ts
import { existsSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import type { ServiceDraft } from "@shared/types";
import { detectStack } from "./stackDetector";

const CANDIDATE_DIRS = ["", "frontend", "web", "client", "admin", "backend", "server", "api"];

const isDirectory = (path: string): boolean => existsSync(path) && statSync(path).isDirectory();

export const scanProject = (rootPath: string): ServiceDraft[] => {
  const seen = new Set<string>();
  const drafts: ServiceDraft[] = [];

  for (const candidate of CANDIDATE_DIRS) {
    const servicePath = candidate ? join(rootPath, candidate) : rootPath;
    if (!isDirectory(servicePath) || seen.has(servicePath)) continue;
    seen.add(servicePath);

    const detection = detectStack(servicePath);
    if (detection.stack === "custom" && detection.command === "") continue;

    drafts.push({
      name: candidate || basename(rootPath),
      servicePath,
      stack: detection.stack,
      command: detection.command,
      port: detection.port,
      note: detection.evidence.join(", ")
    });
  }

  return drafts;
};
```

- [ ] **Step 4: Run tests**

Run:

```powershell
npm test -- tests/main/projectScanner.test.ts tests/main/stackDetector.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit local rollback point**

```powershell
git add src/main/detection/projectScanner.ts tests/main/projectScanner.test.ts
git commit -m "feat: scan project services"
```

---

### Task 7: Implement Port Checking and Recommendation

**Files:**
- Create: `src/main/services/portService.ts`
- Create: `tests/main/portService.test.ts`

- [ ] **Step 1: Write port tests**

`tests/main/portService.test.ts`:

```ts
import { createServer } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { checkPort, findAvailablePort } from "../../src/main/services/portService";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        })
    )
  );
  servers.length = 0;
});

const occupy = (port: number): Promise<void> =>
  new Promise((resolve) => {
    const server = createServer();
    servers.push(server);
    server.listen(port, "127.0.0.1", () => resolve());
  });

describe("portService", () => {
  it("reports an available port", async () => {
    await expect(checkPort(0)).resolves.toMatchObject({ available: true });
  });

  it("suggests another port when requested port is occupied", async () => {
    await occupy(43123);
    const result = await checkPort(43123);
    expect(result.available).toBe(false);
    expect(result.suggestedPort).not.toBe(43123);
  });

  it("finds a usable port at or above the starting point", async () => {
    await occupy(43124);
    await expect(findAvailablePort(43124)).resolves.toBeGreaterThan(43124);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```powershell
npm test -- tests/main/portService.test.ts
```

Expected: FAIL because port service does not exist.

- [ ] **Step 3: Implement port service**

`src/main/services/portService.ts`:

```ts
import { createServer } from "node:net";
import type { PortCheck } from "@shared/types";

const canListen = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });

export const findAvailablePort = async (startPort: number): Promise<number> => {
  const first = Math.max(1, startPort);
  for (let port = first; port < first + 100; port += 1) {
    if (await canListen(port)) return port;
  }
  throw new Error(`No available port near ${startPort}`);
};

export const checkPort = async (requestedPort: number): Promise<PortCheck> => {
  const available = await canListen(requestedPort);
  return {
    requestedPort,
    available,
    suggestedPort: available ? null : await findAvailablePort(requestedPort + 1)
  };
};
```

- [ ] **Step 4: Run tests**

Run:

```powershell
npm test -- tests/main/portService.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit local rollback point**

```powershell
git add src/main/services/portService.ts tests/main/portService.test.ts
git commit -m "feat: add port checks"
```

---

### Task 8: Implement Dependency Checks

**Files:**
- Create: `src/main/services/dependencyService.ts`
- Create: `tests/main/dependencyService.test.ts`

- [ ] **Step 1: Write dependency tests**

`tests/main/dependencyService.test.ts`:

```ts
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkDependenciesForDraft } from "../../src/main/services/dependencyService";
import type { ServiceDraft } from "../../src/shared/types";

let root = "";

beforeEach(() => {
  root = join(tmpdir(), `serve-manager-deps-${Date.now()}`);
  mkdirSync(root, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const draft = (input: Partial<ServiceDraft>): ServiceDraft => ({
  name: "service",
  servicePath: root,
  stack: "custom",
  command: "",
  port: null,
  note: "",
  ...input
});

describe("dependencyService", () => {
  it("prompts npm install when node_modules is missing", () => {
    writeFileSync(join(root, "package.json"), JSON.stringify({}));
    expect(checkDependenciesForDraft(draft({ stack: "react", command: "npm run dev" }))).toEqual({
      missing: true,
      message: "未检测到 node_modules，启动前建议安装 Node 依赖。",
      installCommand: "npm install"
    });
  });

  it("uses pnpm install when pnpm lock exists", () => {
    writeFileSync(join(root, "package.json"), JSON.stringify({}));
    writeFileSync(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'");
    expect(checkDependenciesForDraft(draft({ stack: "vue", command: "pnpm dev" })).installCommand).toBe("pnpm install");
  });

  it("prompts for Python virtual environment when requirements exist", () => {
    writeFileSync(join(root, "requirements.txt"), "fastapi\n");
    expect(checkDependenciesForDraft(draft({ stack: "fastapi", command: "uvicorn main:app" }))).toMatchObject({
      missing: true,
      installCommand: "python -m venv .venv && .venv\\Scripts\\python -m pip install -r requirements.txt"
    });
  });

  it("does not block Java services", () => {
    expect(checkDependenciesForDraft(draft({ stack: "spring-maven", command: "mvn spring-boot:run" }))).toMatchObject({
      missing: false,
      installCommand: null
    });
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```powershell
npm test -- tests/main/dependencyService.test.ts
```

Expected: FAIL because dependency service does not exist.

- [ ] **Step 3: Implement dependency service**

`src/main/services/dependencyService.ts`:

```ts
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { DependencyCheck, ServiceDraft } from "@shared/types";
import { detectPackageManager } from "../detection/packageManager";

const nodeStacks = new Set(["react", "vue"]);
const pythonStacks = new Set(["flask", "fastapi"]);

const nodeInstallCommand = (servicePath: string): string => {
  const manager = detectPackageManager(servicePath);
  if (manager === "npm") return "npm install";
  if (manager === "yarn") return "yarn install";
  if (manager === "pnpm") return "pnpm install";
  return "bun install";
};

export const checkDependenciesForDraft = (service: ServiceDraft): DependencyCheck => {
  if (nodeStacks.has(service.stack) && !existsSync(join(service.servicePath, "node_modules"))) {
    return {
      missing: true,
      message: "未检测到 node_modules，启动前建议安装 Node 依赖。",
      installCommand: nodeInstallCommand(service.servicePath)
    };
  }

  if (pythonStacks.has(service.stack)) {
    const hasRequirements = existsSync(join(service.servicePath, "requirements.txt"));
    const hasPyProject = existsSync(join(service.servicePath, "pyproject.toml"));
    const hasVenv = existsSync(join(service.servicePath, ".venv"));
    if ((hasRequirements || hasPyProject) && !hasVenv) {
      return {
        missing: true,
        message: "未检测到 .venv，启动前建议创建虚拟环境并安装 Python 依赖。",
        installCommand: hasRequirements
          ? "python -m venv .venv && .venv\\Scripts\\python -m pip install -r requirements.txt"
          : "python -m venv .venv && .venv\\Scripts\\python -m pip install ."
      };
    }
  }

  return {
    missing: false,
    message: "依赖检查通过。",
    installCommand: null
  };
};
```

- [ ] **Step 4: Run tests**

Run:

```powershell
npm test -- tests/main/dependencyService.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit local rollback point**

```powershell
git add src/main/services/dependencyService.ts tests/main/dependencyService.test.ts
git commit -m "feat: add dependency prompts"
```

---

### Task 9: Implement Process Manager and Log Capture

**Files:**
- Create: `src/main/services/processManager.ts`
- Modify: `src/main/db/repositories.ts`

- [ ] **Step 1: Extend repository status update support**

Add this method inside the `services` repository in `src/main/db/repositories.ts`:

```ts
setStatus(id: number, status: ServiceStatus): Service {
  const timestamp = now();
  db.prepare("UPDATE services SET last_status = ?, updated_at = ? WHERE id = ?").run(status, timestamp, id);
  return this.get(id);
}
```

- [ ] **Step 2: Implement process manager**

`src/main/services/processManager.ts`:

```ts
import crossSpawn from "cross-spawn";
import kill from "tree-kill";
import type { BrowserWindow } from "electron";
import type { ChildProcess } from "node:child_process";
import type { LogEntry, Service } from "@shared/types";
import type { createRepositories } from "../db/repositories";
import { parseCommand } from "../detection/commandParser";

type Repositories = ReturnType<typeof createRepositories>;

interface RunningProcess {
  child: ChildProcess;
  serviceId: number;
}

export class ProcessManager {
  private readonly running = new Map<number, RunningProcess>();

  constructor(
    private readonly repos: Repositories,
    private readonly getWindows: () => BrowserWindow[]
  ) {}

  isRunning(serviceId: number): boolean {
    return this.running.has(serviceId);
  }

  start(service: Service): void {
    if (this.running.has(service.id)) return;
    if (!service.command.trim()) throw new Error("启动命令为空");

    const parsed = parseCommand(service.command);
    const updated = this.repos.services.setStatus(service.id, "starting");
    this.emitService(updated);

    const child = crossSpawn(parsed.command, parsed.args, {
      cwd: service.servicePath,
      env: process.env,
      windowsHide: true
    });

    this.running.set(service.id, { child, serviceId: service.id });

    child.stdout?.on("data", (chunk) => this.appendLog(service.id, "stdout", chunk.toString()));
    child.stderr?.on("data", (chunk) => this.appendLog(service.id, "stderr", chunk.toString()));
    child.once("spawn", () => this.emitService(this.repos.services.setStatus(service.id, "running")));
    child.once("error", (error) => {
      this.running.delete(service.id);
      this.appendLog(service.id, "system", error.message);
      this.emitService(this.repos.services.setStatus(service.id, "failed"));
    });
    child.once("exit", (code) => {
      this.running.delete(service.id);
      this.appendLog(service.id, "system", `进程已退出，退出码：${code ?? "unknown"}`);
      this.emitService(this.repos.services.setStatus(service.id, code === 0 ? "stopped" : "failed"));
    });
  }

  stop(serviceId: number): Promise<void> {
    const running = this.running.get(serviceId);
    if (!running) {
      this.emitService(this.repos.services.setStatus(serviceId, "stopped"));
      return Promise.resolve();
    }

    this.emitService(this.repos.services.setStatus(serviceId, "stopping"));

    return new Promise((resolve, reject) => {
      kill(running.child.pid ?? 0, "SIGTERM", (error) => {
        this.running.delete(serviceId);
        if (error) {
          this.appendLog(serviceId, "system", error.message);
          this.emitService(this.repos.services.setStatus(serviceId, "failed"));
          reject(error);
          return;
        }
        this.appendLog(serviceId, "system", "服务已停止");
        this.emitService(this.repos.services.setStatus(serviceId, "stopped"));
        resolve();
      });
    });
  }

  async stopAll(): Promise<void> {
    await Promise.all(Array.from(this.running.keys()).map((serviceId) => this.stop(serviceId)));
  }

  hasRunningServices(): boolean {
    return this.running.size > 0;
  }

  private appendLog(serviceId: number, stream: LogEntry["stream"], content: string): void {
    const entry = this.repos.logs.append(serviceId, stream, content);
    for (const window of this.getWindows()) {
      window.webContents.send("logs:entry", entry);
    }
  }

  private emitService(service: Service): void {
    for (const window of this.getWindows()) {
      window.webContents.send("service:changed", service);
    }
  }
}
```

- [ ] **Step 3: Build to catch TypeScript errors**

Run:

```powershell
npm run build
```

Expected: PASS.

- [ ] **Step 4: Commit local rollback point**

```powershell
git add src/main/services/processManager.ts src/main/db/repositories.ts
git commit -m "feat: manage service processes"
```

---

### Task 10: Wire IPC Handlers

**Files:**
- Create: `src/main/ipc/channels.ts`
- Create: `src/main/ipc/registerHandlers.ts`
- Modify: `src/main/main.ts`

- [ ] **Step 1: Add channel constants**

`src/main/ipc/channels.ts`:

```ts
export const channels = {
  getSnapshot: "app:get-snapshot",
  chooseProjectRoot: "dialog:choose-project-root",
  scanProject: "project:scan",
  saveProject: "project:save",
  saveService: "service:save",
  updateService: "service:update",
  deleteService: "service:delete",
  checkPort: "port:check",
  checkDependencies: "dependency:check",
  installDependencies: "dependency:install",
  startService: "service:start",
  stopService: "service:stop",
  stopAllServices: "service:stop-all",
  getLogs: "logs:get",
  clearLogs: "logs:clear"
} as const;
```

- [ ] **Step 2: Implement IPC registration**

`src/main/ipc/registerHandlers.ts`:

```ts
import { dialog, ipcMain } from "electron";
import { basename } from "node:path";
import crossSpawn from "cross-spawn";
import type { Service, ServiceDraft } from "@shared/types";
import type { createRepositories } from "../db/repositories";
import { scanProject } from "../detection/projectScanner";
import { parseCommand } from "../detection/commandParser";
import { checkDependenciesForDraft } from "../services/dependencyService";
import { checkPort } from "../services/portService";
import type { ProcessManager } from "../services/processManager";
import { channels } from "./channels";

type Repositories = ReturnType<typeof createRepositories>;

const toDraft = (service: Service): ServiceDraft => ({
  name: service.name,
  servicePath: service.servicePath,
  stack: service.stack,
  command: service.command,
  port: service.port,
  note: service.note
});

export const registerHandlers = (repos: Repositories, processManager: ProcessManager): void => {
  ipcMain.handle(channels.getSnapshot, () => ({ projects: repos.projects.listWithServices() }));

  ipcMain.handle(channels.chooseProjectRoot, async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
      title: "选择项目根目录"
    });
    return { canceled: result.canceled, path: result.filePaths[0] ?? null };
  });

  ipcMain.handle(channels.scanProject, (_event, rootPath: string) => scanProject(rootPath));

  ipcMain.handle(channels.saveProject, (_event, input: { name: string; rootPath: string; services: ServiceDraft[] }) => {
    const project = repos.projects.create(input.name || basename(input.rootPath), input.rootPath);
    input.services.forEach((service, index) => {
      repos.services.create(project.id, {
        ...service,
        sortOrder: index,
        lastStatus: "stopped"
      });
    });
    return repos.projects.listWithServices().find((item) => item.id === project.id);
  });

  ipcMain.handle(channels.saveService, (_event, input: ServiceDraft & { projectId: number }) =>
    repos.services.create(input.projectId, {
      ...input,
      sortOrder: 0,
      lastStatus: "stopped"
    })
  );

  ipcMain.handle(channels.updateService, (_event, input: Service) => repos.services.update(input));
  ipcMain.handle(channels.deleteService, (_event, serviceId: number) => repos.services.delete(serviceId));
  ipcMain.handle(channels.checkPort, (_event, port: number) => checkPort(port));

  ipcMain.handle(channels.checkDependencies, (_event, serviceId: number) => {
    const service = repos.services.get(serviceId);
    return checkDependenciesForDraft(toDraft(service));
  });

  ipcMain.handle(channels.installDependencies, (_event, serviceId: number) => {
    const service = repos.services.get(serviceId);
    const check = checkDependenciesForDraft(toDraft(service));
    if (!check.installCommand) return;
    const parsed = parseCommand(check.installCommand);
    const child = crossSpawn(parsed.command, parsed.args, {
      cwd: service.servicePath,
      env: process.env,
      windowsHide: true
    });
    child.stdout?.on("data", (chunk) => repos.logs.append(serviceId, "stdout", chunk.toString()));
    child.stderr?.on("data", (chunk) => repos.logs.append(serviceId, "stderr", chunk.toString()));
  });

  ipcMain.handle(channels.startService, async (_event, serviceId: number) => {
    const service = repos.services.get(serviceId);
    if (service.port) {
      const port = await checkPort(service.port);
      if (!port.available) return port;
    }
    processManager.start(service);
    return null;
  });

  ipcMain.handle(channels.stopService, (_event, serviceId: number) => processManager.stop(serviceId));
  ipcMain.handle(channels.stopAllServices, () => processManager.stopAll());
  ipcMain.handle(channels.getLogs, (_event, serviceId: number) => repos.logs.list(serviceId));
  ipcMain.handle(channels.clearLogs, (_event, serviceId: number) => repos.logs.clear(serviceId));
};
```

- [ ] **Step 3: Wire Main startup**

Replace `src/main/main.ts` with:

```ts
import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { createDatabase } from "./db/database";
import { createRepositories } from "./db/repositories";
import { getDatabasePath } from "./appPaths";
import { registerHandlers } from "./ipc/registerHandlers";
import { ProcessManager } from "./services/processManager";

let mainWindow: BrowserWindow | null = null;

const createWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: 1220,
    height: 780,
    minWidth: 980,
    minHeight: 640,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.once("ready-to-show", () => window.show());

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  mainWindow = window;
  return window;
};

app.whenReady().then(() => {
  const db = createDatabase(getDatabasePath());
  const repos = createRepositories(db);
  const processManager = new ProcessManager(repos, () => BrowserWindow.getAllWindows());
  repos.logs.clearAll();
  registerHandlers(repos, processManager);
  createWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});
```

- [ ] **Step 4: Build to catch IPC wiring errors**

Run:

```powershell
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit local rollback point**

```powershell
git add src/main/ipc src/main/main.ts
git commit -m "feat: wire main ipc handlers"
```

---

### Task 11: Build Renderer Data Hook and Toolbar

**Files:**
- Create: `src/renderer/src/hooks/useAppData.ts`
- Create: `src/renderer/src/components/Toolbar.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/styles.css`

- [ ] **Step 1: Add app data hook**

`src/renderer/src/hooks/useAppData.ts`:

```tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProjectWithServices, Service, ServiceStatus } from "@shared/types";

export const useAppData = () => {
  const [projects, setProjects] = useState<ProjectWithServices[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ServiceStatus | "all">("all");

  const refresh = useCallback(async () => {
    const snapshot = await window.serveManager.getSnapshot();
    setProjects(snapshot.projects);
  }, []);

  useEffect(() => {
    void refresh();
    return window.serveManager.onServiceChanged((changed: Service) => {
      setProjects((current) =>
        current.map((project) => ({
          ...project,
          services: project.services.map((service) => (service.id === changed.id ? changed : service))
        }))
      );
    });
  }, [refresh]);

  const filteredProjects = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    return projects
      .map((project) => ({
        ...project,
        services: project.services.filter((service) => {
          const matchesQuery =
            lowered.length === 0 ||
            service.name.toLowerCase().includes(lowered) ||
            service.note.toLowerCase().includes(lowered) ||
            service.servicePath.toLowerCase().includes(lowered);
          const matchesStatus = statusFilter === "all" || service.lastStatus === statusFilter;
          return matchesQuery && matchesStatus;
        })
      }))
      .filter((project) => project.services.length > 0 || lowered.length === 0);
  }, [projects, query, statusFilter]);

  return {
    projects,
    filteredProjects,
    query,
    setQuery,
    statusFilter,
    setStatusFilter,
    refresh
  };
};
```

- [ ] **Step 2: Add toolbar**

`src/renderer/src/components/Toolbar.tsx`:

```tsx
import { FolderPlus, Plus, Square } from "lucide-react";
import type { ServiceStatus } from "@shared/types";

interface ToolbarProps {
  query: string;
  statusFilter: ServiceStatus | "all";
  onQueryChange(value: string): void;
  onStatusFilterChange(value: ServiceStatus | "all"): void;
  onAddProject(): void;
  onAddService(): void;
  onStopAll(): void;
}

export function Toolbar(props: ToolbarProps): JSX.Element {
  return (
    <header className="toolbar">
      <button className="primary-button" onClick={props.onAddProject} title="添加项目">
        <FolderPlus size={16} />
        添加项目
      </button>
      <button className="tool-button" onClick={props.onAddService} title="手动添加服务">
        <Plus size={16} />
        手动添加服务
      </button>
      <input
        className="search-input"
        value={props.query}
        onChange={(event) => props.onQueryChange(event.target.value)}
        placeholder="搜索服务、备注或路径"
      />
      <select
        className="select-input"
        value={props.statusFilter}
        onChange={(event) => props.onStatusFilterChange(event.target.value as ServiceStatus | "all")}
      >
        <option value="all">全部状态</option>
        <option value="running">运行中</option>
        <option value="stopped">已停止</option>
        <option value="failed">失败</option>
      </select>
      <button className="tool-button danger" onClick={props.onStopAll} title="停止全部">
        <Square size={16} />
        停止全部
      </button>
    </header>
  );
}
```

- [ ] **Step 3: Wire toolbar into App**

`src/renderer/src/App.tsx`:

```tsx
import { Toolbar } from "./components/Toolbar";
import { useAppData } from "./hooks/useAppData";

export default function App(): JSX.Element {
  const appData = useAppData();

  return (
    <main className="app-shell">
      <Toolbar
        query={appData.query}
        statusFilter={appData.statusFilter}
        onQueryChange={appData.setQuery}
        onStatusFilterChange={appData.setStatusFilter}
        onAddProject={() => undefined}
        onAddService={() => undefined}
        onStopAll={() => void window.serveManager.stopAllServices().then(appData.refresh)}
      />
      <section className="content-shell">
        {appData.filteredProjects.length === 0 ? (
          <div className="empty-state">还没有服务，先添加一个项目。</div>
        ) : (
          <div className="project-list">
            {appData.filteredProjects.map((project) => (
              <section className="project-group" key={project.id}>
                <h2>{project.name}</h2>
                <p>{project.rootPath}</p>
              </section>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Extend CSS**

Append to `src/renderer/src/styles.css`:

```css
.toolbar {
  height: 58px;
  display: grid;
  grid-template-columns: auto auto minmax(220px, 1fr) 150px auto;
  gap: 10px;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid #d8dee6;
  background: #ffffff;
}

button,
input,
select {
  font: inherit;
}

.primary-button,
.tool-button {
  height: 36px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 1px solid #b9c3cf;
  border-radius: 6px;
  padding: 0 12px;
  background: #ffffff;
  color: #17202a;
  cursor: pointer;
}

.primary-button {
  border-color: #2563eb;
  background: #2563eb;
  color: #ffffff;
}

.tool-button.danger {
  color: #b42318;
  border-color: #f1b8b3;
}

.search-input,
.select-input {
  height: 36px;
  border: 1px solid #b9c3cf;
  border-radius: 6px;
  padding: 0 10px;
  background: #ffffff;
}

.content-shell {
  padding: 14px;
}

.project-list {
  display: grid;
  gap: 12px;
}

.project-group {
  border: 1px solid #d8dee6;
  border-radius: 8px;
  background: #ffffff;
  padding: 14px;
}

.project-group h2 {
  margin: 0 0 4px;
  font-size: 16px;
}

.project-group p {
  margin: 0;
  color: #596575;
  font-size: 13px;
}
```

- [ ] **Step 5: Verify renderer build**

Run:

```powershell
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit local rollback point**

```powershell
git add src/renderer/src
git commit -m "feat: add renderer data shell"
```

---

### Task 12: Build Service List, Editor, and Project Add Flow

**Files:**
- Create: `src/renderer/src/components/ProjectGroup.tsx`
- Create: `src/renderer/src/components/ServiceRow.tsx`
- Create: `src/renderer/src/components/ServiceEditor.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/styles.css`

- [ ] **Step 1: Add service row component**

`src/renderer/src/components/ServiceRow.tsx`:

```tsx
import { FileText, Pencil, Play, Square, Trash2 } from "lucide-react";
import { STACK_LABELS } from "@shared/serviceDefaults";
import type { Service } from "@shared/types";

interface ServiceRowProps {
  service: Service;
  onStart(service: Service): void;
  onStop(service: Service): void;
  onLogs(service: Service): void;
  onEdit(service: Service): void;
  onDelete(service: Service): void;
}

export function ServiceRow(props: ServiceRowProps): JSX.Element {
  const running = props.service.lastStatus === "running" || props.service.lastStatus === "starting";
  return (
    <div className="service-row">
      <div className={`status-dot ${props.service.lastStatus}`} />
      <div className="service-main">
        <strong>{props.service.name}</strong>
        <span>{props.service.servicePath}</span>
      </div>
      <span className="stack-label">{STACK_LABELS[props.service.stack]}</span>
      <span className="port-label">{props.service.port ?? "-"}</span>
      <code className="command-label">{props.service.command || "未配置命令"}</code>
      <span className="note-label">{props.service.note}</span>
      <div className="row-actions">
        <button title="启动" disabled={running} onClick={() => props.onStart(props.service)}>
          <Play size={15} />
        </button>
        <button title="停止" disabled={!running} onClick={() => props.onStop(props.service)}>
          <Square size={15} />
        </button>
        <button title="日志" onClick={() => props.onLogs(props.service)}>
          <FileText size={15} />
        </button>
        <button title="编辑" disabled={running} onClick={() => props.onEdit(props.service)}>
          <Pencil size={15} />
        </button>
        <button title="删除" disabled={running} onClick={() => props.onDelete(props.service)}>
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add project group component**

`src/renderer/src/components/ProjectGroup.tsx`:

```tsx
import type { ProjectWithServices, Service } from "@shared/types";
import { ServiceRow } from "./ServiceRow";

interface ProjectGroupProps {
  project: ProjectWithServices;
  onStart(service: Service): void;
  onStop(service: Service): void;
  onLogs(service: Service): void;
  onEdit(service: Service): void;
  onDelete(service: Service): void;
}

export function ProjectGroup(props: ProjectGroupProps): JSX.Element {
  const runningCount = props.project.services.filter((service) => service.lastStatus === "running").length;
  return (
    <section className="project-group">
      <header className="project-heading">
        <div>
          <h2>{props.project.name}</h2>
          <p>{props.project.rootPath}</p>
        </div>
        <span>{runningCount}/{props.project.services.length} 运行中</span>
      </header>
      <div className="service-table">
        {props.project.services.map((service) => (
          <ServiceRow
            key={service.id}
            service={service}
            onStart={props.onStart}
            onStop={props.onStop}
            onLogs={props.onLogs}
            onEdit={props.onEdit}
            onDelete={props.onDelete}
          />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Add service editor**

`src/renderer/src/components/ServiceEditor.tsx`:

```tsx
import { useState } from "react";
import { STACK_LABELS } from "@shared/serviceDefaults";
import type { ServiceDraft, ServiceStack } from "@shared/types";

interface ServiceEditorProps {
  title: string;
  initial: ServiceDraft;
  onCancel(): void;
  onSave(draft: ServiceDraft): void;
}

const stacks = Object.keys(STACK_LABELS) as ServiceStack[];

export function ServiceEditor(props: ServiceEditorProps): JSX.Element {
  const [draft, setDraft] = useState<ServiceDraft>(props.initial);

  return (
    <div className="modal-backdrop">
      <form
        className="service-editor"
        onSubmit={(event) => {
          event.preventDefault();
          props.onSave(draft);
        }}
      >
        <h2>{props.title}</h2>
        <label>
          服务名
          <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        </label>
        <label>
          技术栈
          <select value={draft.stack} onChange={(event) => setDraft({ ...draft, stack: event.target.value as ServiceStack })}>
            {stacks.map((stack) => (
              <option key={stack} value={stack}>
                {STACK_LABELS[stack]}
              </option>
            ))}
          </select>
        </label>
        <label>
          目录
          <input value={draft.servicePath} onChange={(event) => setDraft({ ...draft, servicePath: event.target.value })} />
        </label>
        <label>
          启动命令
          <input value={draft.command} onChange={(event) => setDraft({ ...draft, command: event.target.value })} />
        </label>
        <label>
          端口
          <input
            value={draft.port ?? ""}
            inputMode="numeric"
            onChange={(event) =>
              setDraft({ ...draft, port: event.target.value ? Number(event.target.value) : null })
            }
          />
        </label>
        <label>
          备注
          <textarea value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} />
        </label>
        <footer>
          <button type="button" onClick={props.onCancel}>
            取消
          </button>
          <button className="primary-button" type="submit">
            保存
          </button>
        </footer>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Wire project add and service actions in App**

Update `src/renderer/src/App.tsx` to:

```tsx
import { useState } from "react";
import type { Service, ServiceDraft } from "@shared/types";
import { ProjectGroup } from "./components/ProjectGroup";
import { ServiceEditor } from "./components/ServiceEditor";
import { Toolbar } from "./components/Toolbar";
import { useAppData } from "./hooks/useAppData";

const emptyDraft = (): ServiceDraft => ({
  name: "",
  servicePath: "",
  stack: "custom",
  command: "",
  port: null,
  note: ""
});

const getFolderName = (path: string): string => {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? "新项目";
};

export default function App(): JSX.Element {
  const appData = useAppData();
  const [editor, setEditor] = useState<{ title: string; draft: ServiceDraft } | null>(null);

  const addProject = async (): Promise<void> => {
    const chosen = await window.serveManager.chooseProjectRoot();
    if (chosen.canceled || !chosen.path) return;
    const drafts = await window.serveManager.scanProject(chosen.path);
    await window.serveManager.saveProject({
      name: getFolderName(chosen.path),
      rootPath: chosen.path,
      services: drafts
    });
    await appData.refresh();
  };

  const startService = async (service: Service): Promise<void> => {
    const dependency = await window.serveManager.checkDependencies(service.id);
    if (dependency.missing && dependency.installCommand) {
      const ok = window.confirm(`${dependency.message}\n\n执行：${dependency.installCommand}`);
      if (ok) await window.serveManager.installDependencies(service.id);
    }
    const result = await window.serveManager.startService(service.id);
    if (result?.available === false && result.suggestedPort) {
      window.alert(`端口 ${result.requestedPort} 被占用，建议改用 ${result.suggestedPort}。请编辑服务端口后再启动。`);
    }
  };

  return (
    <main className="app-shell">
      <Toolbar
        query={appData.query}
        statusFilter={appData.statusFilter}
        onQueryChange={appData.setQuery}
        onStatusFilterChange={appData.setStatusFilter}
        onAddProject={() => void addProject()}
        onAddService={() => setEditor({ title: "手动添加服务", draft: emptyDraft() })}
        onStopAll={() => void window.serveManager.stopAllServices().then(appData.refresh)}
      />
      <section className="content-shell">
        {appData.filteredProjects.length === 0 ? (
          <div className="empty-state">还没有服务，先添加一个项目。</div>
        ) : (
          <div className="project-list">
            {appData.filteredProjects.map((project) => (
              <ProjectGroup
                key={project.id}
                project={project}
                onStart={(service) => void startService(service)}
                onStop={(service) => void window.serveManager.stopService(service.id)}
                onLogs={() => undefined}
                onEdit={(service) =>
                  setEditor({
                    title: "编辑服务",
                    draft: {
                      name: service.name,
                      servicePath: service.servicePath,
                      stack: service.stack,
                      command: service.command,
                      port: service.port,
                      note: service.note
                    }
                  })
                }
                onDelete={(service) => void window.serveManager.deleteService(service.id).then(appData.refresh)}
              />
            ))}
          </div>
        )}
      </section>
      {editor ? (
        <ServiceEditor
          title={editor.title}
          initial={editor.draft}
          onCancel={() => setEditor(null)}
          onSave={() => {
            window.alert("手动服务保存会在下一任务接入项目选择。");
            setEditor(null);
          }}
        />
      ) : null}
    </main>
  );
}
```

- [ ] **Step 5: Add list and modal CSS**

Append to `src/renderer/src/styles.css`:

```css
.project-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.project-heading span {
  color: #596575;
  font-size: 13px;
}

.service-table {
  display: grid;
  gap: 6px;
}

.service-row {
  display: grid;
  grid-template-columns: 10px minmax(180px, 1.4fr) 130px 70px minmax(220px, 1fr) minmax(120px, 0.8fr) 190px;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  border-top: 1px solid #edf0f4;
  padding: 8px 0;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #98a2b3;
}

.status-dot.running {
  background: #039855;
}

.status-dot.failed {
  background: #d92d20;
}

.service-main {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.service-main span,
.note-label,
.command-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #596575;
  font-size: 12px;
}

.stack-label,
.port-label {
  font-size: 13px;
}

.row-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.row-actions button {
  width: 30px;
  height: 30px;
  display: inline-grid;
  place-items: center;
  border: 1px solid #d8dee6;
  border-radius: 6px;
  background: #ffffff;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(23, 32, 42, 0.28);
}

.service-editor {
  width: min(620px, calc(100vw - 32px));
  display: grid;
  gap: 12px;
  padding: 18px;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 18px 60px rgba(23, 32, 42, 0.2);
}

.service-editor h2 {
  margin: 0;
  font-size: 18px;
}

.service-editor label {
  display: grid;
  gap: 6px;
  color: #344054;
  font-size: 13px;
}

.service-editor input,
.service-editor select,
.service-editor textarea {
  min-height: 36px;
  border: 1px solid #b9c3cf;
  border-radius: 6px;
  padding: 8px 10px;
}

.service-editor textarea {
  min-height: 72px;
  resize: vertical;
}

.service-editor footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
```

- [ ] **Step 6: Build**

Run:

```powershell
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit local rollback point**

```powershell
git add src/renderer/src
git commit -m "feat: show and edit services"
```

---

### Task 13: Add Logs Drawer

**Files:**
- Create: `src/renderer/src/components/LogsDrawer.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/styles.css`

- [ ] **Step 1: Create logs drawer**

`src/renderer/src/components/LogsDrawer.tsx`:

```tsx
import { Copy, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LogEntry, Service } from "@shared/types";

interface LogsDrawerProps {
  service: Service;
  onClose(): void;
}

export function LogsDrawer(props: LogsDrawerProps): JSX.Element {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void window.serveManager.getLogs(props.service.id).then(setLogs);
    return window.serveManager.onLog((entry) => {
      if (entry.serviceId === props.service.id) {
        setLogs((current) => [...current, entry]);
      }
    });
  }, [props.service.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [logs]);

  const text = useMemo(() => logs.map((entry) => `[${entry.stream}] ${entry.content}`).join(""), [logs]);

  return (
    <aside className="logs-drawer">
      <header>
        <div>
          <h2>{props.service.name}</h2>
          <p>{props.service.command}</p>
        </div>
        <button title="关闭" onClick={props.onClose}>
          <X size={16} />
        </button>
      </header>
      <div className="logs-actions">
        <button onClick={() => void navigator.clipboard.writeText(text)}>
          <Copy size={15} />
          复制
        </button>
        <button
          onClick={() =>
            void window.serveManager.clearLogs(props.service.id).then(() => {
              setLogs([]);
            })
          }
        >
          <Trash2 size={15} />
          清空
        </button>
      </div>
      <pre className="logs-content">
        {logs.map((entry) => (
          <span className={`log-line ${entry.stream}`} key={entry.id}>
            [{entry.stream}] {entry.content}
          </span>
        ))}
        <div ref={endRef} />
      </pre>
    </aside>
  );
}
```

- [ ] **Step 2: Wire drawer in App**

In `src/renderer/src/App.tsx`, add state:

```tsx
const [logService, setLogService] = useState<Service | null>(null);
```

Replace `onLogs={() => undefined}` with:

```tsx
onLogs={(service) => setLogService(service)}
```

Render drawer near the end of `<main>`:

```tsx
{logService ? <LogsDrawer service={logService} onClose={() => setLogService(null)} /> : null}
```

Import the component:

```tsx
import { LogsDrawer } from "./components/LogsDrawer";
```

- [ ] **Step 3: Add drawer CSS**

Append to `src/renderer/src/styles.css`:

```css
.logs-drawer {
  position: fixed;
  right: 0;
  top: 0;
  bottom: 0;
  width: min(520px, 100vw);
  display: grid;
  grid-template-rows: auto auto 1fr;
  border-left: 1px solid #d8dee6;
  background: #111827;
  color: #f9fafb;
  box-shadow: -14px 0 40px rgba(17, 24, 39, 0.22);
}

.logs-drawer header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
  border-bottom: 1px solid #374151;
}

.logs-drawer h2 {
  margin: 0 0 4px;
  font-size: 16px;
}

.logs-drawer p {
  margin: 0;
  color: #cbd5e1;
  font-size: 12px;
}

.logs-drawer button,
.logs-actions button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid #4b5563;
  border-radius: 6px;
  background: #1f2937;
  color: #f9fafb;
  padding: 7px 10px;
}

.logs-actions {
  display: flex;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid #374151;
}

.logs-content {
  margin: 0;
  overflow: auto;
  padding: 14px;
  white-space: pre-wrap;
  font-family: Consolas, "Courier New", monospace;
  font-size: 12px;
  line-height: 1.5;
}

.log-line {
  display: block;
}

.log-line.stderr {
  color: #fecaca;
}

.log-line.system {
  color: #fde68a;
}
```

- [ ] **Step 4: Build**

Run:

```powershell
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit local rollback point**

```powershell
git add src/renderer/src
git commit -m "feat: add live logs drawer"
```

---

### Task 14: Add Exit Confirmation and Log Cleanup

**Files:**
- Create: `src/main/lifecycle.ts`
- Modify: `src/main/main.ts`

- [ ] **Step 1: Implement lifecycle guard**

`src/main/lifecycle.ts`:

```ts
import { app, dialog, type BrowserWindow } from "electron";
import type { createRepositories } from "./db/repositories";
import type { ProcessManager } from "./services/processManager";

type Repositories = ReturnType<typeof createRepositories>;

export const registerLifecycle = (
  mainWindow: BrowserWindow,
  repos: Repositories,
  processManager: ProcessManager
): void => {
  let quitting = false;

  mainWindow.on("close", async (event) => {
    if (quitting) return;

    if (!processManager.hasRunningServices()) {
      repos.logs.clearAll();
      return;
    }

    event.preventDefault();
    const result = await dialog.showMessageBox(mainWindow, {
      type: "question",
      buttons: ["停止服务后退出", "取消"],
      defaultId: 0,
      cancelId: 1,
      title: "还有服务在运行",
      message: "当前还有由 Serve Manager 启动的服务在运行，要停止后退出吗？"
    });

    if (result.response === 0) {
      await processManager.stopAll();
      repos.logs.clearAll();
      quitting = true;
      app.quit();
    }
  });
};
```

- [ ] **Step 2: Register lifecycle in main**

In `src/main/main.ts`, import:

```ts
import { registerLifecycle } from "./lifecycle";
```

After `const window = createWindow();`, call:

```ts
registerLifecycle(window, repos, processManager);
```

Remove direct `repos.logs.clearAll()` from app startup if you want logs only cleared on normal exit. Keep startup clearing if previous process crashed and left stale logs. The chosen first version keeps both startup and exit clearing:

```ts
repos.logs.clearAll();
```

- [ ] **Step 3: Build**

Run:

```powershell
npm run build
```

Expected: PASS.

- [ ] **Step 4: Commit local rollback point**

```powershell
git add src/main/lifecycle.ts src/main/main.ts
git commit -m "feat: confirm exit with running services"
```

---

### Task 15: Complete Project Import, Manual Save, Editing, and Port Replacement

**Files:**
- Modify: `src/main/ipc/registerHandlers.ts`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/components/ServiceEditor.tsx`
- Create: `src/renderer/src/components/ProjectImportDialog.tsx`

- [ ] **Step 1: Add project import review dialog**

`src/renderer/src/components/ProjectImportDialog.tsx`:

```tsx
import { useState } from "react";
import { STACK_LABELS } from "@shared/serviceDefaults";
import type { ServiceDraft, ServiceStack } from "@shared/types";

interface ProjectImportDialogProps {
  rootPath: string;
  initialDrafts: ServiceDraft[];
  onCancel(): void;
  onSave(input: { name: string; services: ServiceDraft[] }): void;
}

const stacks = Object.keys(STACK_LABELS) as ServiceStack[];

export function ProjectImportDialog(props: ProjectImportDialogProps): JSX.Element {
  const [name, setName] = useState(props.rootPath.split(/[\\/]/).filter(Boolean).at(-1) ?? "新项目");
  const [services, setServices] = useState<ServiceDraft[]>(props.initialDrafts);

  const update = (index: number, next: ServiceDraft): void => {
    setServices((current) => current.map((service, serviceIndex) => (serviceIndex === index ? next : service)));
  };

  const remove = (index: number): void => {
    setServices((current) => current.filter((_service, serviceIndex) => serviceIndex !== index));
  };

  return (
    <div className="modal-backdrop">
      <form
        className="import-dialog"
        onSubmit={(event) => {
          event.preventDefault();
          props.onSave({ name, services });
        }}
      >
        <header>
          <h2>确认扫描结果</h2>
          <p>{props.rootPath}</p>
        </header>
        <label>
          项目名
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <div className="import-service-list">
          {services.map((service, index) => (
            <section className="import-service" key={`${service.servicePath}-${index}`}>
              <input
                value={service.name}
                onChange={(event) => update(index, { ...service, name: event.target.value })}
              />
              <select
                value={service.stack}
                onChange={(event) => update(index, { ...service, stack: event.target.value as ServiceStack })}
              >
                {stacks.map((stack) => (
                  <option key={stack} value={stack}>
                    {STACK_LABELS[stack]}
                  </option>
                ))}
              </select>
              <input
                value={service.command}
                onChange={(event) => update(index, { ...service, command: event.target.value })}
              />
              <input
                value={service.port ?? ""}
                inputMode="numeric"
                onChange={(event) => update(index, { ...service, port: event.target.value ? Number(event.target.value) : null })}
              />
              <input
                value={service.note}
                onChange={(event) => update(index, { ...service, note: event.target.value })}
              />
              <button type="button" onClick={() => remove(index)}>
                删除
              </button>
            </section>
          ))}
        </div>
        <footer>
          <button type="button" onClick={props.onCancel}>
            取消
          </button>
          <button className="primary-button" type="submit" disabled={services.length === 0}>
            保存项目
          </button>
        </footer>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Add project selection for manual services**

In `ServiceEditorProps`, add:

```ts
serviceId?: number;
projectId?: number;
projects?: { id: number; name: string }[];
onProjectChange?(projectId: number): void;
```

Inside the form, render this block when projects exist:

```tsx
{props.projects && props.projects.length > 0 ? (
  <label>
    所属项目
    <select
      value={props.projectId}
      onChange={(event) => props.onProjectChange?.(Number(event.target.value))}
    >
      {props.projects.map((project) => (
        <option key={project.id} value={project.id}>
          {project.name}
        </option>
      ))}
    </select>
  </label>
) : null}
```

- [ ] **Step 3: Update App state for import review and editing**

In `App.tsx`, import:

```tsx
import { ProjectImportDialog } from "./components/ProjectImportDialog";
```

Add editor state types:

```tsx
const [importReview, setImportReview] = useState<{ rootPath: string; drafts: ServiceDraft[] } | null>(null);
const [editor, setEditor] = useState<{ title: string; draft: ServiceDraft; service?: Service } | null>(null);
const [editorProjectId, setEditorProjectId] = useState<number | null>(null);
```

Replace the existing `editor` state declaration with the block above.

- [ ] **Step 4: Replace immediate project save with import review**

Replace `addProject` in `App.tsx` with:

```tsx
const addProject = async (): Promise<void> => {
  const chosen = await window.serveManager.chooseProjectRoot();
  if (chosen.canceled || !chosen.path) return;
  const drafts = await window.serveManager.scanProject(chosen.path);
  setImportReview({ rootPath: chosen.path, drafts });
};
```

Render `ProjectImportDialog` near the end of `<main>`:

```tsx
{importReview ? (
  <ProjectImportDialog
    rootPath={importReview.rootPath}
    initialDrafts={importReview.drafts}
    onCancel={() => setImportReview(null)}
    onSave={async (input) => {
      await window.serveManager.saveProject({
        name: input.name,
        rootPath: importReview.rootPath,
        services: input.services
      });
      setImportReview(null);
      await appData.refresh();
    }}
  />
) : null}
```

- [ ] **Step 5: Save manual services and update edited services**

Update manual add button:

```tsx
onAddService={() => {
  const firstProject = appData.projects[0];
  if (!firstProject) {
    window.alert("请先添加一个项目分组，再手动添加服务。");
    return;
  }
  setEditorProjectId(firstProject.id);
  setEditor({ title: "手动添加服务", draft: emptyDraft() });
}}
```

Update edit action:

```tsx
onEdit={(service) => {
  setEditorProjectId(service.projectId);
  setEditor({
    title: "编辑服务",
    service,
    draft: {
      name: service.name,
      servicePath: service.servicePath,
      stack: service.stack,
      command: service.command,
      port: service.port,
      note: service.note
    }
  });
}}
```

Update `ServiceEditor` render:

```tsx
<ServiceEditor
  title={editor.title}
  initial={editor.draft}
  projectId={editorProjectId ?? undefined}
  projects={appData.projects.map((project) => ({ id: project.id, name: project.name }))}
  onProjectChange={setEditorProjectId}
  onCancel={() => setEditor(null)}
  onSave={async (draft) => {
    if (!editorProjectId) return;
    if (editor.service) {
      await window.serveManager.updateService({
        ...editor.service,
        ...draft,
        projectId: editorProjectId
      });
    } else {
      await window.serveManager.saveService({ ...draft, projectId: editorProjectId });
    }
    setEditor(null);
    await appData.refresh();
  }}
/>
```

- [ ] **Step 6: Update port replacement flow**

Replace the port conflict alert in `startService` with:

```tsx
if (result?.available === false && result.suggestedPort) {
  const ok = window.confirm(`端口 ${result.requestedPort} 被占用，要改用 ${result.suggestedPort} 并保存吗？`);
  if (ok) {
    await window.serveManager.updateService({ ...service, port: result.suggestedPort });
    await appData.refresh();
  }
}
```

- [ ] **Step 7: Add import dialog CSS**

Append to `src/renderer/src/styles.css`:

```css
.import-dialog {
  width: min(920px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  gap: 12px;
  padding: 18px;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 18px 60px rgba(23, 32, 42, 0.2);
}

.import-dialog header h2 {
  margin: 0 0 4px;
  font-size: 18px;
}

.import-dialog header p {
  margin: 0;
  color: #596575;
  font-size: 13px;
}

.import-service-list {
  display: grid;
  gap: 8px;
  overflow: auto;
}

.import-service {
  display: grid;
  grid-template-columns: 120px 150px minmax(220px, 1fr) 80px minmax(140px, 0.7fr) 64px;
  gap: 8px;
}

.import-dialog input,
.import-dialog select {
  min-height: 34px;
  min-width: 0;
  border: 1px solid #b9c3cf;
  border-radius: 6px;
  padding: 7px 9px;
}

.import-dialog footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
```

- [ ] **Step 8: Build**

Run:

```powershell
npm run build
```

Expected: PASS.

- [ ] **Step 9: Commit local rollback point**

```powershell
git add src/renderer/src src/main/ipc/registerHandlers.ts
git commit -m "feat: complete project and service editing"
```

---

### Task 16: Verify UI in Dev Mode

**Files:**
- No source changes expected unless verification finds a UI bug.

- [ ] **Step 1: Start the dev app**

Run:

```powershell
npm run dev
```

Expected: Electron window opens with the toolbar and empty state.

- [ ] **Step 2: Verify key desktop flow manually**

Perform these checks:

```text
1. Click 添加项目.
2. Select a fixture or sample project directory.
3. Confirm detected services appear in grouped list.
4. Search by service name.
5. Change status filter.
6. Open service editor.
7. Open logs drawer.
8. Close logs drawer.
```

Expected: controls do not overlap; text remains inside rows; logs drawer opens without covering toolbar controls incoherently.

- [ ] **Step 3: If renderer dev server is available, verify layout through Codex in-app Browser**

Use Browser `iab` only for web page verification. Open the Vite renderer URL shown by `npm run dev`, usually:

```text
http://localhost:5173
```

Check desktop viewport around `1280x800` and narrow viewport around `390x844`. Expected: no broken layout, toolbar remains usable, service rows truncate long paths and commands.

- [ ] **Step 4: Commit fixes if any**

If verification required source changes:

```powershell
git add src
git commit -m "fix: polish service manager ui"
```

If no changes were required, do not create an empty commit.

---

### Task 17: Add Final Build and Installer Verification

**Files:**
- Modify: `package.json` only if packaging settings need correction.

- [ ] **Step 1: Run full tests and build**

Run:

```powershell
npm test
npm run build
```

Expected: both commands exit 0.

- [ ] **Step 2: Build Windows installer**

Run:

```powershell
npm run dist
```

Expected: `dist` contains an NSIS installer for Serve Manager.

- [ ] **Step 3: Install and launch**

Run the generated installer from `dist`. Expected:

```text
1. Installer completes.
2. Desktop shortcut named Serve Manager appears.
3. App opens from the shortcut.
4. App data remains under Electron userData.
5. User project directories are not modified by install or uninstall.
```

- [ ] **Step 4: Final git status**

Run:

```powershell
git status --short
```

Expected: clean working tree, except generated `dist/` remains ignored.

- [ ] **Step 5: Commit packaging corrections if needed**

If packaging files changed:

```powershell
git add package.json package-lock.json
git commit -m "build: package windows installer"
```

---

## Final Verification Checklist

Run before delivery:

```powershell
npm test
npm run build
npm run dist
git status --short
```

Manual checks:

```text
1. Add project by root directory.
2. Confirm React, Vue, Flutter, Flask, FastAPI, Maven, and Gradle detection using fixtures or local sample projects.
3. Manually add a custom service.
4. Start a service and verify stdout/stderr logs appear in the drawer.
5. Stop the service and verify status changes.
6. Trigger a port conflict and confirm a replacement port is suggested.
7. Trigger a missing dependency prompt and confirm the command is shown before execution.
8. Exit with a running service and confirm the stop-before-exit dialog appears.
9. Restart the app and confirm service configuration remains while logs from previous session are gone.
10. Install with the generated Windows installer and launch from the desktop shortcut.
```

## Self-Review Notes

- Spec coverage: tasks cover scaffold, SQLite persistence, stack detection, scanning, port recommendation, dependency prompts, process start/stop, logs drawer, exit confirmation, and Windows installer.
- Isolation: detection, database, process control, IPC, and renderer UI are split into focused files.
- Risk: `better-sqlite3` is a native dependency. `electron-builder install-app-deps` is included so the native module is rebuilt for Electron.
- Windows focus: process stopping uses `tree-kill`; packaging targets NSIS; no macOS/Linux behavior is planned.
