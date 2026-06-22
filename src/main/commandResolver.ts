import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Service } from "@shared/types";

export interface LaunchCommand {
  command: string;
  env: NodeJS.ProcessEnv;
}

const frontendStacks = new Set(["react", "vue"]);

const readPackageScript = (service: Service): string => {
  const packagePath = join(service.servicePath, "package.json");
  if (!existsSync(packagePath)) return "";
  try {
    const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
    const parts = service.command.trim().split(/\s+/);
    let script: string | undefined;
    if (parts[0] === "npm" && parts[1] === "run") script = parts[2];
    else if (parts[0] === "bun" && parts[1] === "run") script = parts[2];
    else if ((parts[0] === "pnpm" || parts[0] === "yarn") && parts[1] === "run") script = parts[2];
    else if (parts[0] === "pnpm" || parts[0] === "yarn") script = parts[1];
    return script && pkg.scripts?.[script] ? String(pkg.scripts[script]) : "";
  } catch {
    return "";
  }
};

const hasPortArgument = (command: string): boolean => /\s(--port|-p)\b/.test(command);

const appendScriptArgs = (command: string, args: string): string => {
  if (/^\s*npm\s+run\s+/i.test(command)) return `${command} -- ${args}`;
  return `${command} ${args}`;
};

const withFrontendPort = (service: Service): string => {
  if (!service.port || !frontendStacks.has(service.stack) || hasPortArgument(service.command)) {
    return service.command;
  }

  const script = readPackageScript(service).toLowerCase();
  if (script.includes("react-scripts")) return service.command;
  if (script.includes("next")) return appendScriptArgs(service.command, `--port ${service.port}`);
  if (script.includes("vite") || script.includes("vue-cli-service")) {
    return appendScriptArgs(service.command, `--host 127.0.0.1 --port ${service.port}`);
  }
  return appendScriptArgs(service.command, `--port ${service.port}`);
};

const cleanChildEnv = (service: Service): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_RENDERER_URL;
  delete env.ELECTRON_ENABLE_LOGGING;
  delete env.ELECTRON_NO_ATTACH_CONSOLE;

  if (service.port) env.PORT = String(service.port);
  if (frontendStacks.has(service.stack)) {
    env.NODE_ENV = "development";
    env.BROWSER = "none";
    env.HOST = "127.0.0.1";
  }

  return env;
};

export const resolveLaunchCommand = (service: Service): LaunchCommand => ({
  command: withFrontendPort(service),
  env: cleanChildEnv(service)
});
