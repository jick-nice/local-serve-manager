import Database from "better-sqlite3";
import { app } from "electron";
import { join } from "node:path";
import type {
  CommandLogEntry,
  CommandStatus,
  LogEntry,
  LogStream,
  Project,
  ProjectWithServices,
  Service,
  ServiceCommand,
  ServiceCommandDraft,
  ServiceDraft,
  ServiceStatus
} from "@shared/types";
import { discoverCommands } from "./detector";

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

const mapCommand = (row: any): ServiceCommand => ({
  id: row.id,
  serviceId: row.service_id,
  name: row.name,
  command: row.command,
  kind: row.kind,
  sortOrder: row.sort_order,
  lastStatus: row.last_status,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const mapCommandLog = (row: any): CommandLogEntry => ({
  id: row.id,
  commandId: row.command_id,
  timestamp: row.timestamp,
  stream: row.stream,
  content: row.content
});

export class AppDatabase {
  private readonly db: Database.Database;

  constructor(databasePath = join(app.getPath("userData"), "serve-manager.sqlite")) {
    this.db = new Database(databasePath);
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
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

      CREATE TABLE IF NOT EXISTS service_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        service_id INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        stream TEXT NOT NULL,
        content TEXT NOT NULL,
        FOREIGN KEY(service_id) REFERENCES services(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS service_commands (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        service_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        command TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'task',
        sort_order INTEGER NOT NULL DEFAULT 0,
        last_status TEXT NOT NULL DEFAULT 'idle',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(service_id) REFERENCES services(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS command_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        command_id INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        stream TEXT NOT NULL,
        content TEXT NOT NULL,
        FOREIGN KEY(command_id) REFERENCES service_commands(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS command_discovery (
        service_id INTEGER PRIMARY KEY,
        created_at TEXT NOT NULL,
        FOREIGN KEY(service_id) REFERENCES services(id) ON DELETE CASCADE
      );
    `);
  }

  listProjects(): ProjectWithServices[] {
    const projects = this.db.prepare("SELECT * FROM projects ORDER BY updated_at DESC, id DESC").all().map(mapProject);
    const services = this.db.prepare("SELECT * FROM services ORDER BY sort_order ASC, id ASC").all().map(mapService);
    return projects.map((project) => ({
      ...project,
      services: services.filter((service) => service.projectId === project.id)
    }));
  }

  createProject(name: string, rootPath: string, drafts: ServiceDraft[]): ProjectWithServices {
    const timestamp = now();
    const createProject = this.db.transaction(() => {
      const result = this.db
        .prepare("INSERT INTO projects (name, root_path, created_at, updated_at) VALUES (?, ?, ?, ?)")
        .run(name, rootPath, timestamp, timestamp);
      const projectId = Number(result.lastInsertRowid);
      drafts.forEach((draft, index) => this.insertService(projectId, draft, index));
      return projectId;
    });
    const projectId = createProject();
    const project = this.listProjects().find((item) => item.id === projectId);
    if (!project) throw new Error("Project was not created");
    return project;
  }

  createService(projectId: number, draft: ServiceDraft): Service {
    return this.insertService(projectId, draft, this.nextSortOrder(projectId));
  }

  updateService(service: Service): Service {
    const timestamp = now();
    this.db
      .prepare(
        `UPDATE services
         SET project_id = ?, name = ?, service_path = ?, stack = ?, command = ?, port = ?, note = ?, sort_order = ?, last_status = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        service.projectId,
        service.name,
        service.servicePath,
        service.stack,
        service.command,
        service.port,
        service.note,
        service.sortOrder,
        service.lastStatus,
        timestamp,
        service.id
      );
    return this.getService(service.id);
  }

  getService(id: number): Service {
    const row = this.db.prepare("SELECT * FROM services WHERE id = ?").get(id);
    if (!row) throw new Error(`Service not found: ${id}`);
    return mapService(row);
  }

  deleteService(id: number): void {
    this.db.prepare("DELETE FROM services WHERE id = ?").run(id);
  }

  listCommands(serviceId: number): ServiceCommand[] {
    const commands = this.db.prepare("SELECT * FROM service_commands WHERE service_id = ? ORDER BY sort_order ASC, id ASC").all(serviceId).map(mapCommand);
    if (commands.length > 0) {
      this.markCommandDiscovery(serviceId);
      return commands;
    }
    if (this.hasCommandDiscovery(serviceId)) return commands;
    const service = this.getService(serviceId);
    this.addDiscoveredCommands(service);
    return this.db.prepare("SELECT * FROM service_commands WHERE service_id = ? ORDER BY sort_order ASC, id ASC").all(serviceId).map(mapCommand);
  }

  createCommand(serviceId: number, draft: ServiceCommandDraft): ServiceCommand {
    const command = this.insertCommand(serviceId, draft, this.nextCommandSortOrder(serviceId));
    this.markCommandDiscovery(serviceId);
    return command;
  }

  updateCommand(command: ServiceCommand): ServiceCommand {
    this.db
      .prepare(
        `UPDATE service_commands
         SET name = ?, command = ?, kind = ?, sort_order = ?, last_status = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(command.name, command.command, command.kind, command.sortOrder, command.lastStatus, now(), command.id);
    return this.getCommand(command.id);
  }

  getCommand(id: number): ServiceCommand {
    const row = this.db.prepare("SELECT * FROM service_commands WHERE id = ?").get(id);
    if (!row) throw new Error(`Command not found: ${id}`);
    return mapCommand(row);
  }

  deleteCommand(id: number): void {
    this.db.prepare("DELETE FROM service_commands WHERE id = ?").run(id);
  }

  setCommandStatus(id: number, status: CommandStatus): ServiceCommand {
    this.db.prepare("UPDATE service_commands SET last_status = ?, updated_at = ? WHERE id = ?").run(status, now(), id);
    return this.getCommand(id);
  }

  setStatus(id: number, status: ServiceStatus): Service {
    this.db.prepare("UPDATE services SET last_status = ?, updated_at = ? WHERE id = ?").run(status, now(), id);
    return this.getService(id);
  }

  appendLog(serviceId: number, stream: LogStream, content: string): LogEntry {
    const result = this.db
      .prepare("INSERT INTO service_logs (service_id, timestamp, stream, content) VALUES (?, ?, ?, ?)")
      .run(serviceId, now(), stream, content);
    return mapLog(this.db.prepare("SELECT * FROM service_logs WHERE id = ?").get(result.lastInsertRowid));
  }

  listLogs(serviceId: number): LogEntry[] {
    return this.db.prepare("SELECT * FROM service_logs WHERE service_id = ? ORDER BY id ASC").all(serviceId).map(mapLog);
  }

  clearLogs(serviceId: number): void {
    this.db.prepare("DELETE FROM service_logs WHERE service_id = ?").run(serviceId);
  }

  clearAllLogs(): void {
    this.db.prepare("DELETE FROM service_logs").run();
    this.db.prepare("DELETE FROM command_logs").run();
  }

  appendCommandLog(commandId: number, stream: LogStream, content: string): CommandLogEntry {
    const result = this.db
      .prepare("INSERT INTO command_logs (command_id, timestamp, stream, content) VALUES (?, ?, ?, ?)")
      .run(commandId, now(), stream, content);
    return mapCommandLog(this.db.prepare("SELECT * FROM command_logs WHERE id = ?").get(result.lastInsertRowid));
  }

  listCommandLogs(commandId: number): CommandLogEntry[] {
    return this.db.prepare("SELECT * FROM command_logs WHERE command_id = ? ORDER BY id ASC").all(commandId).map(mapCommandLog);
  }

  clearCommandLogs(commandId: number): void {
    this.db.prepare("DELETE FROM command_logs WHERE command_id = ?").run(commandId);
  }

  private insertService(projectId: number, draft: ServiceDraft, sortOrder: number): Service {
    const timestamp = now();
    const result = this.db
      .prepare(
        `INSERT INTO services
         (project_id, name, service_path, stack, command, port, note, sort_order, last_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'stopped', ?, ?)`
      )
      .run(projectId, draft.name, draft.servicePath, draft.stack, draft.command, draft.port, draft.note, sortOrder, timestamp, timestamp);
    const service = this.getService(Number(result.lastInsertRowid));
    this.addDiscoveredCommands(service);
    return service;
  }

  private nextSortOrder(projectId: number): number {
    const row = this.db.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM services WHERE project_id = ?").get(projectId) as {
      next_order: number;
    };
    return row.next_order;
  }

  private addDiscoveredCommands(service: Service): void {
    if (this.hasCommandDiscovery(service.id)) return;
    const commands = discoverCommands(service.servicePath, service.stack);
    commands.forEach((command, index) => this.insertCommand(service.id, command, index));
    this.markCommandDiscovery(service.id);
  }

  private insertCommand(serviceId: number, draft: ServiceCommandDraft, sortOrder: number): ServiceCommand {
    const timestamp = now();
    const result = this.db
      .prepare(
        `INSERT INTO service_commands
         (service_id, name, command, kind, sort_order, last_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'idle', ?, ?)`
      )
      .run(serviceId, draft.name, draft.command, draft.kind, sortOrder, timestamp, timestamp);
    return this.getCommand(Number(result.lastInsertRowid));
  }

  private nextCommandSortOrder(serviceId: number): number {
    const row = this.db.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM service_commands WHERE service_id = ?").get(serviceId) as {
      next_order: number;
    };
    return row.next_order;
  }

  private hasCommandDiscovery(serviceId: number): boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM command_discovery WHERE service_id = ?").get(serviceId));
  }

  private markCommandDiscovery(serviceId: number): void {
    this.db.prepare("INSERT OR IGNORE INTO command_discovery (service_id, created_at) VALUES (?, ?)").run(serviceId, now());
  }
}
