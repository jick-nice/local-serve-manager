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
  chooseDirectory(): Promise<{ canceled: boolean; path: string | null }>;
  scanProject(rootPath: string): Promise<ServiceDraft[]>;
  detectService(servicePath: string): Promise<ServiceDraft>;
  saveProject(input: { name: string; rootPath: string; services: ServiceDraft[] }): Promise<ProjectWithServices>;
  saveService(input: ServiceDraft & { projectId: number }): Promise<Service>;
  updateService(input: Service): Promise<Service>;
  deleteService(serviceId: number): Promise<void>;
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
