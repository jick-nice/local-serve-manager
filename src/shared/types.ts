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
export type CommandKind = "task" | "long-running";
export type CommandStatus = "idle" | "running" | "finished" | "failed" | "stopping";

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
  backendServiceId: number | null;
  note: string;
  environment: string;
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
  backendServiceId?: number | null;
  note: string;
  environment: string;
}

export interface ServiceCommand {
  id: number;
  serviceId: number;
  name: string;
  command: string;
  kind: CommandKind;
  sortOrder: number;
  lastStatus: CommandStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceCommandDraft {
  name: string;
  command: string;
  kind: CommandKind;
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

export interface CommandLogEntry {
  id: number;
  commandId: number;
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

export interface StopPortResult {
  port: number;
  success: boolean;
  pids: number[];
  message: string;
}

export interface AppSnapshot {
  projects: ProjectWithServices[];
}

export interface ServeManagerApi {
  getSnapshot(): Promise<AppSnapshot>;
  chooseDirectory(): Promise<{ canceled: boolean; path: string | null }>;
  scanProject(rootPath: string): Promise<ServiceDraft[]>;
  detectService(servicePath: string): Promise<ServiceDraft>;
  saveProject(input: { name: string; rootPath: string; services: ServiceDraft[] }): Promise<ProjectWithServices>;
  saveService(input: ServiceDraft & { projectId: number }): Promise<Service>;
  updateService(input: Service): Promise<Service>;
  deleteService(serviceId: number): Promise<void>;
  listCommands(serviceId: number): Promise<ServiceCommand[]>;
  saveCommand(input: ServiceCommandDraft & { serviceId: number }): Promise<ServiceCommand>;
  updateCommand(input: ServiceCommand): Promise<ServiceCommand>;
  deleteCommand(commandId: number): Promise<void>;
  runCommand(commandId: number): Promise<void>;
  stopCommand(commandId: number): Promise<void>;
  getCommandLogs(commandId: number): Promise<CommandLogEntry[]>;
  clearCommandLogs(commandId: number): Promise<void>;
  checkDependencies(serviceId: number): Promise<DependencyCheck>;
  installDependencies(serviceId: number): Promise<void>;
  startService(serviceId: number): Promise<PortCheck | null>;
  stopService(serviceId: number): Promise<void>;
  stopAllServices(): Promise<void>;
  stopPort(port: number): Promise<StopPortResult>;
  getLogs(serviceId: number): Promise<LogEntry[]>;
  clearLogs(serviceId: number): Promise<void>;
  onLog(callback: (entry: LogEntry) => void): () => void;
  onServiceChanged(callback: (service: Service) => void): () => void;
  onCommandLog(callback: (entry: CommandLogEntry) => void): () => void;
  onCommandChanged(callback: (command: ServiceCommand) => void): () => void;
}
