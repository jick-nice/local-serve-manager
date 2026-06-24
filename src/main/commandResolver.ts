import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Service } from "@shared/types";
import { cleanElectronEnv, mergeServiceEnvironment } from "./environment";

export interface LaunchCommand {
  command: string;
  env: NodeJS.ProcessEnv;
}

const frontendStacks = new Set(["react", "vue"]);
const springBootStacks = new Set(["spring-maven", "spring-gradle"]);
const pythonWebStacks = new Set(["fastapi", "flask"]);

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

const appendScriptArgs = (command: string, args: string): string => {
  if (/^\s*npm\s+run\s+/i.test(command)) return `${command} -- ${args}`;
  return `${command} ${args}`;
};

const replacePortArgument = (command: string, port: number): string | null => {
  const withLongFlag = command.replace(/(^|\s)--port(?:=|\s+)\d+/i, `$1--port ${port}`);
  if (withLongFlag !== command) return withLongFlag;
  const withShortFlag = command.replace(/(^|\s)-p(?:=|\s+)\d+/i, `$1-p ${port}`);
  return withShortFlag !== command ? withShortFlag : null;
};

const replaceSpringPortArgument = (command: string, port: number): string | null => {
  const withServerFlag = command.replace(/--server\.port(?:=|\s+)\d+/i, `--server.port=${port}`);
  if (withServerFlag !== command) return withServerFlag;
  const withSystemProperty = command.replace(/-Dserver\.port=\d+/i, `-Dserver.port=${port}`);
  return withSystemProperty !== command ? withSystemProperty : null;
};

const withFrontendPort = (service: Service): string => {
  if (!service.port || !frontendStacks.has(service.stack)) {
    return service.command;
  }

  const script = readPackageScript(service).toLowerCase();
  if (script.includes("react-scripts")) return service.command;
  const replaced = replacePortArgument(service.command, service.port);
  if (replaced) return replaced;
  if (script.includes("next")) return appendScriptArgs(service.command, `--port ${service.port}`);
  if (script.includes("vite") || script.includes("vue-cli-service")) {
    return appendScriptArgs(service.command, `--host 127.0.0.1 --port ${service.port}`);
  }
  return appendScriptArgs(service.command, `--port ${service.port}`);
};

const withBackendPort = (service: Service): string => {
  if (!service.port) return service.command;
  if (springBootStacks.has(service.stack)) {
    const replaced = replaceSpringPortArgument(service.command, service.port);
    if (replaced) return replaced;
    if (service.stack === "spring-maven") return `${service.command} -Dspring-boot.run.arguments=--server.port=${service.port}`;
    if (service.stack === "spring-gradle") return `${service.command} --args="--server.port=${service.port}"`;
    return `${service.command} --server.port=${service.port}`;
  }
  if (pythonWebStacks.has(service.stack)) {
    return replacePortArgument(service.command, service.port) ?? `${service.command} --port ${service.port}`;
  }
  return service.command;
};

const withConfiguredPort = (service: Service): string => withBackendPort({ ...service, command: withFrontendPort(service) });

const cleanChildEnv = (service: Service, baseEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv => {
  const env = mergeServiceEnvironment(cleanElectronEnv(baseEnv), service.environment);

  if (service.port) env.PORT = String(service.port);
  if (service.port && springBootStacks.has(service.stack)) env.SERVER_PORT = String(service.port);
  if (frontendStacks.has(service.stack)) {
    env.NODE_ENV = "development";
    env.BROWSER = "none";
    env.HOST = "127.0.0.1";
  }

  return env;
};

export const resolveLaunchCommand = (service: Service, baseEnv: NodeJS.ProcessEnv = process.env): LaunchCommand => ({
  command: withConfiguredPort(service),
  env: cleanChildEnv(service, baseEnv)
});
