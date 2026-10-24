import type { SendTelegramMessage } from "./telegram";
import type { TelegramAccountSettings } from "./store";
import { toTelegramUserEntities } from "./telegramEntities";
import { createHash } from "node:crypto";

type TelegramClientType = import("telegram").TelegramClient;

const clientPromises = new Map<string, Promise<TelegramClientType>>();

export function telegramUserCredentials(account?: TelegramAccountSettings) {
  if (account) {
    return {
      apiId: account.apiId || "",
      apiHash: account.apiHash || "",
      stringSession: account.stringSession || "",
      targetPeer: account.targetPeer || "",
    };
  }
  return {
    apiId: process.env.TELEGRAM_API_ID || "",
    apiHash: process.env.TELEGRAM_API_HASH || "",
    stringSession: process.env.TELEGRAM_STRING_SESSION || process.env.TELEGRAM_SESSION || "",
    targetPeer: process.env.TELEGRAM_TARGET_PEER || "",
  };
}

export function isTelegramUserSenderConfigured(account?: TelegramAccountSettings) {
  const credentials = telegramUserCredentials(account);
  return Boolean(credentials.apiId && credentials.apiHash && credentials.stringSession);
}

export function canUseTelegramUserSender(payload: SendTelegramMessage, account?: TelegramAccountSettings) {
  if (!isTelegramUserSenderConfigured(account)) return false;
  if (payload.media) return false;
  return true;
}

export async function sendTelegramUserMessage(payload: SendTelegramMessage, account?: TelegramAccountSettings) {
  // A Telegram MTProto auth key must never be used from more than one public IP.
  // Vercel only serves the UI/proxies APIs; the operational EasyPanel instance is
  // the single owner of account sessions.
  if (process.env.VERCEL) {
    throw new Error("Envio pela conta Telegram bloqueado fora do servidor operacional.");
  }

  if (!canUseTelegramUserSender(payload, account)) {
    throw new Error("Sender Telegram por conta nao configurado ou payload incompativel.");
  }

  const credentials = telegramUserCredentials(account);
  const client = await getTelegramUserClient(account);
  const entity = await resolveTargetEntity(client, payload.chatId, payload.chatTitle, credentials.targetPeer);
  const prepared = withFallbackTextLink(payload.text, payload, payload.entities);

  const sent = await client.sendMessage(entity, {
    message: prepared.text,
    ...(prepared.entities !== undefined
      ? { formattingEntities: toTelegramUserEntities(prepared.text, prepared.entities) }
      : { parseMode: "html" }),
    linkPreview: false,
  });

  const expected = payload.entities?.filter((item) => item.type === "custom_emoji") || [];
  const actual = (sent.entities || []).filter((item) => item.className === "MessageEntityCustomEmoji");
  if (expected.some((item) => !actual.some((received) =>
    received.offset === item.offset && received.length === item.length
      && "documentId" in received && String(received.documentId) === item.custom_emoji_id))) {
    throw new Error(`Mensagem ${sent.id} publicada, mas o Telegram removeu emojis personalizados. Verifique o Premium e as permissoes da conta conectada antes de reenviar.`);
  }

  return { message_id: Number(sent.id), transport: "telegram_user" };
}

async function getTelegramUserClient(account?: TelegramAccountSettings) {
  const credentials = telegramUserCredentials(account);
  const key = createHash("sha256").update(`${credentials.apiId}:${credentials.stringSession}`).digest("hex");
  const existing = clientPromises.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const { TelegramClient } = await import("telegram");
    const { StringSession } = await import("telegram/sessions/index.js");
    const session = new StringSession(credentials.stringSession);
    const apiId = Number(credentials.apiId);
    const apiHash = credentials.apiHash;
    if (!Number.isFinite(apiId) || !apiHash) throw new Error("TELEGRAM_API_ID/TELEGRAM_API_HASH invalidos.");

    const client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 5, useWSS: true });
    await client.connect();
    if (!(await client.isUserAuthorized())) {
      throw new Error("Sessão Telegram não autorizada. Abra Configurações, selecione este canal e use Trocar conta.");
    }
    return client;
  })();
  clientPromises.set(key, promise);
  promise.catch(() => clientPromises.delete(key));

  return promise;
}

async function resolveTargetEntity(client: TelegramClientType, chatId: string, chatTitle?: string, override = "") {
  if (override) return client.getEntity(override);

  const expectedId = normalizeBotChatId(chatId);
  const dialogs = await client.getDialogs({ limit: 100 });
  const match = dialogs.find((dialog: any) => {
    const entity = dialog.entity || dialog.inputEntity;
    const entityId = entity?.id?.toString?.() || "";
    const title = entity?.title || entity?.username || entity?.firstName || "";
    return (expectedId && entityId === expectedId) || (chatTitle && title === chatTitle);
  });

  if (match?.entity) return match.entity;
  return client.getEntity(chatId);
}

function normalizeBotChatId(chatId: string) {
  const value = String(chatId || "").trim();
  if (value.startsWith("-100")) return value.slice(4);
  if (value.startsWith("-")) return value.slice(1);
  return value;
}

function withFallbackTextLink(text: string, payload: SendTelegramMessage, entities?: SendTelegramMessage["entities"]) {
  const button = payload.buttons?.flat()?.find((item) => item.url)
    || (payload.buttonText && payload.buttonUrl ? { text: payload.buttonText, url: payload.buttonUrl } : undefined);
  if (!button || text.includes(button.url) || entities?.some((item) => item.type === "text_link" && item.url === button.url)) {
    return { text, entities };
  }
  if (entities !== undefined) {
    const prefix = "\n\n› ";
    return {
      text: `${text}${prefix}${button.text}`,
      entities: [...entities, { type: "text_link", offset: text.length + prefix.length, length: button.text.length, url: button.url }],
    };
  }
  if (/<a\s/i.test(text)) return { text, entities };
  return { text: `${text}\n\n<a href="${escapeHtml(button.url)}">${escapeHtml(button.text)}</a>`, entities };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
