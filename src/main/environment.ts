export const cleanElectronEnv = (baseEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = { ...baseEnv };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_RENDERER_URL;
  delete env.ELECTRON_ENABLE_LOGGING;
  delete env.ELECTRON_NO_ATTACH_CONSOLE;
  return env;
};

const isValidEnvName = (name: string): boolean => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);

const findEnvKey = (env: NodeJS.ProcessEnv, name: string): string | undefined => {
  const lowered = name.toLowerCase();
  return Object.keys(env).find((item) => item.toLowerCase() === lowered);
};

const findEnvValue = (env: NodeJS.ProcessEnv, name: string): string => {
  const exact = env[name];
  if (exact !== undefined) return exact;
  const key = findEnvKey(env, name);
  return key ? env[key] ?? "" : "";
};

const expandEnvValue = (value: string, env: NodeJS.ProcessEnv): string =>
  value
    .replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (_match, name: string) => findEnvValue(env, name))
    .replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name: string) => findEnvValue(env, name));

export const mergeServiceEnvironment = (baseEnv: NodeJS.ProcessEnv, environment: string | null | undefined): NodeJS.ProcessEnv => {
  if (!environment?.trim()) return baseEnv;
  const env: NodeJS.ProcessEnv = { ...baseEnv };
  for (const rawLine of environment.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const name = line.slice(0, separator).trim();
    if (!isValidEnvName(name)) continue;
    const value = line.slice(separator + 1).trim();
    const key = findEnvKey(env, name) ?? name;
    env[key] = expandEnvValue(value, env);
  }
  return env;
};
