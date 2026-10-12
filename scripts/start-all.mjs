import { spawn } from "node:child_process";

const port = process.env.PORT || "3000";
const appUrl = (process.env.PUBLIC_APP_URL || process.env.APP_URL || `http://127.0.0.1:${port}`).replace(/\/$/, "");

process.env.PORT = port;
process.env.PUBLIC_APP_URL = appUrl;

function start(name, command, args) {
  const child = spawn(command, args, {
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  child.on("exit", (code, signal) => {
    console.error(`${name} finalizou`, { code, signal });
    process.exit(code || 1);
  });

  return child;
}

console.log(`Painel ligado na porta ${port}`);
console.log(`Worker chamando ${appUrl}/api/run-schedule`);

const app = start("painel", "npm", ["run", "start"]);

setTimeout(() => {
  start("worker", "npm", ["run", "worker"]);
}, Number(process.env.WORKER_START_DELAY_MS || 8000));

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    app.kill(signal);
    process.exit(0);
  });
}
