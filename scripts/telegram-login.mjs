import { existsSync, readFileSync, writeFileSync } from "node:fs";
import input from "input";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

loadEnvFile(".env");
loadEnvFile(".env.local");

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH || "";
const fresh = process.argv.includes("--fresh");

if (!Number.isFinite(apiId) || !apiHash) {
  console.error("Configure TELEGRAM_API_ID e TELEGRAM_API_HASH no .env.local antes de rodar.");
  process.exit(1);
}

const client = new TelegramClient(
  new StringSession(fresh ? "" : process.env.TELEGRAM_STRING_SESSION || process.env.TELEGRAM_SESSION || ""),
  apiId,
  apiHash,
  { connectionRetries: 5 },
);

await client.start({
  phoneNumber: async () => process.env.TELEGRAM_PHONE || await input.text("Telefone com DDI: "),
  password: async () => await input.text("Senha 2FA, se pedir: "),
  phoneCode: async () => await input.text("Codigo recebido no Telegram: "),
  onError: (error) => console.error(error),
});

const session = client.session.save();
saveEnvValue(".env.local", "TELEGRAM_STRING_SESSION", String(session));
console.log("\nSessao gerada. Salve isso como TELEGRAM_STRING_SESSION no Vercel/VPS:\n");
console.log(session);
await client.disconnect();

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

function saveEnvValue(path, key, value) {
  const current = existsSync(path) ? readFileSync(path, "utf8") : "";
  const line = `${key}=${value}`;
  const next = current.match(new RegExp(`^${key}=`, "m"))
    ? current.replace(new RegExp(`^${key}=.*$`, "m"), line)
    : `${current.replace(/\s*$/, "")}\n${line}\n`;
  writeFileSync(path, next, "utf8");
}
