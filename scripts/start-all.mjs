import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

loadEnvFile(".env");
loadEnvFile(".env.local");

const port = process.env.PORT || "3000";
// Keep scheduling and MTProto sends inside this container. Calling the public
// Vercel URL can execute from a second IP and permanently invalidate the shared
// Telegram auth key with AUTH_KEY_DUPLICATED.
const appUrl = `http://127.0.0.1:${port}`;

process.env.PORT = port;
process.env.SCHEDULER_APP_URL = appUrl;

function start(name, command, args, options = {}) {
  const child = spawn(command, args, {
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  child.on("exit", (code, signal) => {
    console.error(`${name} finalizou`, { code, signal });
    if (options.fatal) {
      process.exit(code || 1);
      return;
    }
    const delayMs = Number(process.env.WORKER_RESTART_DELAY_MS || 15000);
    console.error(`${name} reinicia em ${Math.round(delayMs / 1000)}s`);
    setTimeout(() => start(name, command, args, options), delayMs);
  });

  return child;
}

console.log(`Painel ligado na porta ${port}`);
console.log(`Worker chamando ${appUrl}/api/run-schedule`);

const app = start("painel", "npm", ["run", "start"], { fatal: true });

setTimeout(() => {
  start("worker", "npm", ["run", "worker"], { fatal: false });
}, Number(process.env.WORKER_START_DELAY_MS || 8000));

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    app.kill(signal);
    process.exit(0);
  });
}

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, raw] = match;
    if (process.env[key]) continue;
    process.env[key] = raw.replace(/^"|"$/g, "");
  }
}
