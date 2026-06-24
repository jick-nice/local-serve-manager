import crossSpawn from "cross-spawn";
import { BrowserWindow } from "electron";
import type { ChildProcess } from "node:child_process";
import { execFile } from "node:child_process";
import { createServer } from "node:net";
import { promisify } from "node:util";
import kill from "tree-kill";
import type { CommandLogEntry, LogEntry, PortCheck, Service, ServiceCommand, StopPortResult } from "@shared/types";
import { resolveLaunchCommand } from "./commandResolver";
import type { AppDatabase } from "./database";
import { cleanElectronEnv, mergeServiceEnvironment } from "./environment";
import { decodeProcessOutput } from "./outputDecoder";

interface RunningService {
  child: ChildProcess;
  serviceId: number;
}

const execFileAsync = promisify(execFile);

const serviceCommandEnv = (service: Service): NodeJS.ProcessEnv => mergeServiceEnvironment(cleanElectronEnv(), service.environment);

const canListen = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "127.0.0.1");
  });

export const checkPort = async (requestedPort: number): Promise<PortCheck> => {
  const available = await canListen(requestedPort);
  if (available) return { requestedPort, available: true, suggestedPort: null };
  for (let port = requestedPort + 1; port < requestedPort + 101; port += 1) {
    if (await canListen(port)) return { requestedPort, available: false, suggestedPort: port };
  }
  return { requestedPort, available: false, suggestedPort: null };
};

const extractPort = (address: string): number | null => {
  const match = address.match(/:(\d+)$/);
  return match ? Number(match[1]) : null;
};

const findListeningPidsByPort = async (port: number): Promise<number[]> => {
  const { stdout } = await execFileAsync("netstat", ["-ano", "-p", "tcp"], {
    windowsHide: true,
    maxBuffer: 1024 * 1024
  });

  return Array.from(
    new Set(
      stdout
        .split(/\r?\n/)
        .map((line) => line.trim().split(/\s+/))
        .filter((columns) => columns.length >= 5 && columns[0].toUpperCase() === "TCP")
        .filter((columns) => columns[3].toUpperCase() === "LISTENING")
        .filter((columns) => extractPort(columns[1]) === port)
        .map((columns) => Number(columns[4]))
        .filter((pid) => Number.isInteger(pid) && pid > 0)
    )
  );
};

const killProcessTree = (pid: number): Promise<string | null> =>
  new Promise((resolve) => {
    kill(pid, "SIGTERM", (error) => resolve(error ? error.message : null));
  });

export class ProcessManager {
  private readonly running = new Map<number, RunningService>();
  private readonly runningCommands = new Map<number, RunningService>();

  constructor(private readonly database: AppDatabase) {}

  hasRunning(): boolean {
    return this.running.size > 0 || this.runningCommands.size > 0;
  }

  async start(service: Service): Promise<PortCheck | null> {
    if (this.running.has(service.id)) return null;
    if (!service.command.trim()) throw new Error("启动命令为空");
    if (service.port) {
      const port = await checkPort(service.port);
      if (!port.available) return port;
    }

    const launch = resolveLaunchCommand(service);
    this.emitService(this.database.setStatus(service.id, "starting"));
    this.log(service.id, "system", `工作目录：${service.servicePath}\n启动命令：${launch.command}\n`);
    const child = crossSpawn(launch.command, {
      cwd: service.servicePath,
      env: launch.env,
      shell: true,
      windowsHide: true
    });

    this.running.set(service.id, { child, serviceId: service.id });
    child.stdout?.on("data", (chunk) => this.log(service.id, "stdout", decodeProcessOutput(chunk)));
    child.stderr?.on("data", (chunk) => this.log(service.id, "stderr", decodeProcessOutput(chunk)));
    child.once("spawn", () => this.emitService(this.database.setStatus(service.id, "running")));
    child.once("error", (error) => {
      this.running.delete(service.id);
      this.log(service.id, "system", error.message);
      this.emitService(this.database.setStatus(service.id, "failed"));
    });
    child.once("exit", (code) => {
      this.running.delete(service.id);
      this.log(service.id, "system", `进程已退出，退出码：${code ?? "unknown"}\n`);
      this.emitService(this.database.setStatus(service.id, code === 0 ? "stopped" : "failed"));
    });
    return null;
  }

  stop(serviceId: number): Promise<void> {
    const running = this.running.get(serviceId);
    if (!running) {
      this.emitService(this.database.setStatus(serviceId, "stopped"));
      return Promise.resolve();
    }

    this.emitService(this.database.setStatus(serviceId, "stopping"));
    return new Promise((resolve) => {
      kill(running.child.pid ?? 0, "SIGTERM", (error) => {
        this.running.delete(serviceId);
        if (error) {
          this.log(serviceId, "system", `${error.message}\n`);
          this.emitService(this.database.setStatus(serviceId, "failed"));
        } else {
          this.log(serviceId, "system", "服务已停止\n");
          this.emitService(this.database.setStatus(serviceId, "stopped"));
        }
        resolve();
      });
    });
  }

  async stopAll(): Promise<void> {
    await Promise.all([
      ...Array.from(this.running.keys()).map((serviceId) => this.stop(serviceId)),
      ...Array.from(this.runningCommands.keys()).map((commandId) => this.stopCommand(commandId))
    ]);
  }

  async stopPort(port: number): Promise<StopPortResult> {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("请输入 1-65535 之间的端口号");
    }

    const pids = await findListeningPidsByPort(port);
    if (pids.length === 0) {
      return {
        port,
        success: false,
        pids: [],
        message: `端口 ${port} 没有找到监听中的服务`
      };
    }

    const errors = await Promise.all(pids.map((pid) => killProcessTree(pid)));
    const failed = errors
      .map((message, index) => ({ message, pid: pids[index] }))
      .filter((result): result is { message: string; pid: number } => Boolean(result.message));

    if (failed.length > 0) {
      return {
        port,
        success: false,
        pids,
        message: `端口 ${port} 停止失败：${failed.map((result) => `${result.pid} ${result.message}`).join("；")}`
      };
    }

    return {
      port,
      success: true,
      pids,
      message: `已停止端口 ${port} 对应进程：${pids.join(", ")}`
    };
  }

  runInstall(service: Service, command: string): void {
    this.log(service.id, "system", `执行依赖安装：${command}\n`);
    const child = crossSpawn(command, { cwd: service.servicePath, env: serviceCommandEnv(service), shell: true, windowsHide: true });
    child.stdout?.on("data", (chunk) => this.log(service.id, "stdout", decodeProcessOutput(chunk)));
    child.stderr?.on("data", (chunk) => this.log(service.id, "stderr", decodeProcessOutput(chunk)));
    child.once("exit", (code) => this.log(service.id, "system", `依赖安装结束，退出码：${code ?? "unknown"}\n`));
  }

  runCommand(command: ServiceCommand, service: Service): void {
    if (this.runningCommands.has(command.id)) return;
    if (!command.command.trim()) throw new Error("命令为空");

    this.emitCommand(this.database.setCommandStatus(command.id, "running"));
    this.commandLog(command.id, "system", `工作目录：${service.servicePath}\n执行命令：${command.command}\n`);
    const child = crossSpawn(command.command, {
      cwd: service.servicePath,
      env: serviceCommandEnv(service),
      shell: true,
      windowsHide: true
    });

    this.runningCommands.set(command.id, { child, serviceId: service.id });
    child.stdout?.on("data", (chunk) => this.commandLog(command.id, "stdout", decodeProcessOutput(chunk)));
    child.stderr?.on("data", (chunk) => this.commandLog(command.id, "stderr", decodeProcessOutput(chunk)));
    child.once("error", (error) => {
      this.runningCommands.delete(command.id);
      this.commandLog(command.id, "system", `${error.message}\n`);
      this.emitCommand(this.database.setCommandStatus(command.id, "failed"));
    });
    child.once("exit", (code) => {
      this.runningCommands.delete(command.id);
      this.commandLog(command.id, "system", `命令已结束，退出码：${code ?? "unknown"}\n`);
      this.emitCommand(this.database.setCommandStatus(command.id, code === 0 ? "finished" : "failed"));
    });
  }

  stopCommand(commandId: number): Promise<void> {
    const running = this.runningCommands.get(commandId);
    if (!running) {
      this.emitCommand(this.database.setCommandStatus(commandId, "idle"));
      return Promise.resolve();
    }

    this.emitCommand(this.database.setCommandStatus(commandId, "stopping"));
    return new Promise((resolve) => {
      kill(running.child.pid ?? 0, "SIGTERM", (error) => {
        this.runningCommands.delete(commandId);
        if (error) {
          this.commandLog(commandId, "system", `${error.message}\n`);
          this.emitCommand(this.database.setCommandStatus(commandId, "failed"));
        } else {
          this.commandLog(commandId, "system", "命令已停止\n");
          this.emitCommand(this.database.setCommandStatus(commandId, "idle"));
        }
        resolve();
      });
    });
  }

  private log(serviceId: number, stream: LogEntry["stream"], content: string): void {
    const entry = this.database.appendLog(serviceId, stream, content);
    BrowserWindow.getAllWindows().forEach((window) => window.webContents.send("logs:entry", entry));
  }

  private emitService(service: Service): void {
    BrowserWindow.getAllWindows().forEach((window) => window.webContents.send("service:changed", service));
  }

  private commandLog(commandId: number, stream: CommandLogEntry["stream"], content: string): void {
    const entry = this.database.appendCommandLog(commandId, stream, content);
    BrowserWindow.getAllWindows().forEach((window) => window.webContents.send("command-logs:entry", entry));
  }

  private emitCommand(command: ServiceCommand): void {
    BrowserWindow.getAllWindows().forEach((window) => window.webContents.send("command:changed", command));
  }
}
