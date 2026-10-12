import { existsSync, readFileSync } from "node:fs";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

loadEnvFile(".env");
loadEnvFile(".env.local");

const mode = process.argv[2] || "check";
const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH || "";
const session = process.env.TELEGRAM_STRING_SESSION || "";

if (!Number.isFinite(apiId) || !apiHash || !session) {
  console.error("Sessao Telegram incompleta.");
  process.exit(1);
}

const client = new TelegramClient(new StringSession(session), apiId, apiHash, { connectionRetries: 3, useWSS: true });

try {
  await client.connect();
  if (!(await client.isUserAuthorized())) throw new Error("Sessao nao autorizada.");
  const target = await resolveTargetEntity();
  console.log(`Conta conectada. Canal encontrado: ${entityTitle(target)}`);

  if (mode === "send") {
    const sent = await client.sendMessage(target, {
      message: testHtml("AAA/XXX", "00:00"),
      parseMode: "html",
      linkPreview: false,
    });
    console.log(`Mensagem de teste enviada: ${sent.id}`);
  }
  if (mode === "send-batch") {
    const tests = [
      ["USD/BDT", "13:27"],
      ["USD/BRL", "13:30"],
      ["USD/PKR", "13:33"],
    ];
    for (const [pair, time] of tests) {
      const sent = await client.sendMessage(target, {
        message: testHtml(pair, time),
        parseMode: "html",
        linkPreview: false,
      });
      console.log(`Mensagem de teste enviada: ${pair} ${time} -> ${sent.id}`);
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }
} finally {
  await client.disconnect();
}

async function resolveTargetEntity() {
  if (process.env.TELEGRAM_TARGET_PEER) return client.getEntity(process.env.TELEGRAM_TARGET_PEER);

  const expectedId = normalizeBotChatId(process.env.PROJECT_2_CHAT_ID || "");
  const expectedTitle = process.env.PROJECT_2_NAME || "";
  const dialogs = await withTimeout(client.getDialogs({ limit: 100 }), 25_000, "Tempo esgotado ao listar canais.");
  const match = dialogs.find((dialog) => {
    const entity = dialog.entity || dialog.inputEntity;
    const id = entity?.id?.toString?.() || "";
    const title = entityTitle(entity);
    return (expectedId && id === expectedId) || (expectedTitle && title === expectedTitle);
  });
  if (!match?.entity) throw new Error("Canal nao encontrado na conta Telegram.");
  return match.entity;
}

function entityTitle(entity) {
  return entity?.title || entity?.username || entity?.firstName || String(entity?.id || "");
}

function normalizeBotChatId(chatId) {
  const value = String(chatId || "").trim();
  if (value.startsWith("-100")) return value.slice(4);
  if (value.startsWith("-")) return value.slice(1);
  return value;
}

function testHtml(pair, time) {
  const link = process.env.PROJECT_2_LINK || "https://u3.shortink.io/smart/HLsHbhHwDmx6gu";
  return [
    "<blockquote><tg-emoji emoji-id=\"5215522595922779944\">🟢</tg-emoji> <b><i>VIP SIGNAL</i></b> <tg-emoji emoji-id=\"5215522595922779944\">🟢</tg-emoji></blockquote>",
    "",
    "• Time Zone: UTC-3",
    "",
    `• ${escapeHtml(pair)} (OTC) • SELL 🔴 • ${escapeHtml(time)}`,
    "• Expiration: 5 minutes (M5)",
    "• If you lose, make up to 2 Gale's.",
    "",
    `<tg-emoji emoji-id=\"5215480011322042129\">➡️</tg-emoji> <a href=\"${escapeHtml(link)}\"><b><u>Click here</u></b></a> to open the broker`,
  ].join("\n");
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label)), ms)),
  ]);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
