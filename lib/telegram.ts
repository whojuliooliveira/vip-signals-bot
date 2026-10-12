import { canUseTelegramUserSender, sendTelegramUserMessage } from "./telegramUser";

export type SendTelegramMessage = {
  chatId: string;
  chatTitle?: string;
  text: string;
  buttonText?: string;
  buttonUrl?: string;
  media?: {
    type: "photo" | "video" | "animation" | "document";
    fileId: string;
  };
  buttons?: { text: string; url: string }[][];
};

export async function sendTelegramMessage(token: string, payload: SendTelegramMessage) {
  const sendMode = (process.env.TELEGRAM_SEND_MODE || "auto").toLowerCase();

  if (sendMode === "user") {
    return sendTelegramUserMessage(payload);
  }

  try {
    return await sendTelegramBotApiMessage(token, payload);
  } catch (error) {
    if (sendMode !== "auto" || !canUseTelegramUserSender(payload)) throw error;
    console.warn("Telegram Bot API falhou; usando sender por conta.", error);
    return sendTelegramUserMessage(payload);
  }
}

async function sendTelegramBotApiMessage(token: string, payload: SendTelegramMessage) {
  if (!token) {
    throw new Error("Bot token ausente.");
  }

  const replyMarkup = payload.buttons
    ? { inline_keyboard: payload.buttons }
    : payload.buttonText && payload.buttonUrl
      ? { inline_keyboard: [[{ text: payload.buttonText, url: payload.buttonUrl }]] }
      : undefined;

  if (payload.media) {
    const methodByType = {
      photo: "sendPhoto",
      video: "sendVideo",
      animation: "sendAnimation",
      document: "sendDocument",
    } as const;
    const mediaFieldByType = {
      photo: "photo",
      video: "video",
      animation: "animation",
      document: "document",
    } as const;
    const body: Record<string, unknown> = {
      chat_id: payload.chatId,
      [mediaFieldByType[payload.media.type]]: payload.media.fileId,
      caption: payload.text,
      parse_mode: "HTML",
    };
    if (replyMarkup) body.reply_markup = replyMarkup;
    const response = await fetch(`https://api.telegram.org/bot${token}/${methodByType[payload.media.type]}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json() as { ok: boolean; description?: string; result?: { message_id: number } };
    if (!data.ok) throw new Error(data.description || "Telegram media send failed");
    return data.result;
  }

  const body: Record<string, unknown> = {
    chat_id: payload.chatId,
    text: payload.text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };

  if (replyMarkup) body.reply_markup = replyMarkup;

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json() as { ok: boolean; description?: string; result?: { message_id: number } };
  if (!data.ok) throw new Error(data.description || "Telegram sendMessage failed");
  return data.result;
}

export type TelegramEntity = {
  type: string;
  offset: number;
  length: number;
  url?: string;
  language?: string;
  custom_emoji_id?: string;
};

export type TelegramPhotoSize = {
  file_id: string;
  file_unique_id?: string;
  width: number;
  height: number;
  file_size?: number;
};

export type TelegramCapturedMessage = {
  message_id: number;
  date?: number;
  chat: { id: number | string };
  text?: string;
  caption?: string;
  entities?: TelegramEntity[];
  caption_entities?: TelegramEntity[];
  photo?: TelegramPhotoSize[];
  video?: { file_id: string };
  animation?: { file_id: string };
  document?: { file_id: string };
  reply_markup?: { inline_keyboard?: { text: string; url?: string }[][] };
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramCapturedMessage;
  channel_post?: TelegramCapturedMessage;
  edited_message?: TelegramCapturedMessage;
  edited_channel_post?: TelegramCapturedMessage;
};

export async function getTelegramUpdates(token: string) {
  const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates?allowed_updates=${encodeURIComponent(JSON.stringify(["message", "channel_post", "edited_message", "edited_channel_post"]))}`, {
    cache: "no-store",
  });
  const data = await response.json() as { ok: boolean; description?: string; result?: TelegramUpdate[] };
  if (!data.ok) throw new Error(data.description || "Telegram getUpdates failed");
  return data.result || [];
}

export function updateMessage(update: TelegramUpdate) {
  return update.channel_post || update.edited_channel_post || update.message || update.edited_message;
}

export function telegramMessageToHtml(message: TelegramCapturedMessage) {
  const text = message.text || message.caption || "";
  const entities = message.text ? message.entities || [] : message.caption_entities || [];
  if (!entities.length) return escapeTelegramHtml(text);

  const starts = new Map<number, string[]>();
  const ends = new Map<number, string[]>();

  for (const entity of [...entities].sort((a, b) => b.length - a.length)) {
    const open = entityOpenTag(entity);
    const close = entityCloseTag(entity);
    if (!open || !close) continue;
    starts.set(entity.offset, [...(starts.get(entity.offset) || []), open]);
    ends.set(entity.offset + entity.length, [close, ...(ends.get(entity.offset + entity.length) || [])]);
  }

  let html = "";
  for (let index = 0; index <= text.length; index += 1) {
    if (ends.has(index)) html += ends.get(index)!.join("");
    if (starts.has(index)) html += starts.get(index)!.join("");
    if (index < text.length) html += escapeTelegramHtml(text[index]);
  }
  return html;
}

function entityOpenTag(entity: TelegramEntity) {
  if (entity.type === "bold") return "<b>";
  if (entity.type === "italic") return "<i>";
  if (entity.type === "underline") return "<u>";
  if (entity.type === "strikethrough") return "<s>";
  if (entity.type === "spoiler") return "<span class=\"tg-spoiler\">";
  if (entity.type === "code") return "<code>";
  if (entity.type === "pre") return "<pre>";
  if (entity.type === "blockquote") return "<blockquote>";
  if (entity.type === "expandable_blockquote") return "<blockquote expandable>";
  if (entity.type === "text_link" && entity.url) return `<a href="${escapeTelegramHtml(entity.url)}">`;
  if (entity.type === "custom_emoji" && entity.custom_emoji_id) return `<tg-emoji emoji-id="${escapeTelegramHtml(entity.custom_emoji_id)}">`;
  if (entity.type === "url") return "";
  return "";
}

function entityCloseTag(entity: TelegramEntity) {
  if (entity.type === "bold") return "</b>";
  if (entity.type === "italic") return "</i>";
  if (entity.type === "underline") return "</u>";
  if (entity.type === "strikethrough") return "</s>";
  if (entity.type === "spoiler") return "</span>";
  if (entity.type === "code") return "</code>";
  if (entity.type === "pre") return "</pre>";
  if (entity.type === "blockquote") return "</blockquote>";
  if (entity.type === "expandable_blockquote") return "</blockquote>";
  if (entity.type === "text_link" && entity.url) return "</a>";
  if (entity.type === "custom_emoji" && entity.custom_emoji_id) return "</tg-emoji>";
  if (entity.type === "url") return "";
  return "";
}

function escapeTelegramHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
