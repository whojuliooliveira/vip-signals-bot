import type { CapturedTemplate } from "./store";
import type { TelegramEntity } from "./telegram";

export type Locale = "es" | "en";
export type Direction = "UP" | "DOWN";

export type SignalPayload = {
  locale: Locale;
  title: string;
  pair: string;
  market: string;
  direction: Direction;
  time: string;
  expiryMinutes: number;
  reentries: number;
  brokerLink: string;
  brokerLabel: string;
  includeInlineButton: boolean;
  template?: CapturedTemplate;
};

export type RenderedTelegramMessage = {
  text: string;
  entities?: TelegramEntity[];
};

const BROKER_REGISTRATION_LINK = /https?:\/\/(?:www\.)?(?:quotex\.com|broker-qx\.pro)\/sign-up\/?\?[^\s\"'<>]*/gi;

export function withCurrentBrokerLink(template: CapturedTemplate | undefined, brokerLink: string): CapturedTemplate | undefined {
  if (!template || !brokerLink) return template;
  const replaceLink = (value: string) => value.replace(BROKER_REGISTRATION_LINK, brokerLink);
  return {
    ...template,
    html: replaceLink(template.html),
    text: template.text === undefined ? undefined : replaceLink(template.text),
    entities: template.entities?.map((entity) => entity.type === "text_link" && entity.url
      ? { ...entity, url: replaceLink(entity.url) }
      : { ...entity }),
    buttons: template.buttons?.map((row) => row.map((button) => ({
      ...button,
      url: replaceLink(button.url),
    }))),
  };
}

export function directionLabel(locale: Locale, direction: Direction) {
  if (locale === "es") return direction === "UP" ? "ARRIBA 🟢" : "ABAJO 🔴";
  return direction === "UP" ? "BUY 🟢" : "SELL 🔴";
}

export function directionText(locale: Locale, direction: Direction) {
  if (locale === "es") return direction === "UP" ? "ARRIBA" : "ABAJO";
  return direction === "UP" ? "BUY" : "SELL";
}

export function signalBadge(locale: Locale) {
  return locale === "es" ? "▌◎ SEÑAL VIP ◎  ❞" : "▌◎ VIP SIGNAL ◎  ❞";
}

function signalBadgeLine(locale: Locale) {
  const label = locale === "es" ? "SEÑAL VIP" : "VIP SIGNAL";
  return `<blockquote>◎ <b><i>${label}</i></b> ◎</blockquote>`;
}

export function renderSignal(payload: SignalPayload): RenderedTelegramMessage {
  if (payload.template) return renderSavedSignalTemplate(payload.template, payload);

  const isEs = payload.locale === "es";
  const pair = payload.pair.trim().toUpperCase();
  const market = payload.market.trim().toUpperCase() || "OTC";

  const lines = isEs
    ? [
        `<b>${escapeHtml(payload.title)}</b>`,
        signalBadgeLine("es"),
        "",
        "• Huso Horario: UTC-3",
        "",
        `• <b>${escapeHtml(pair)}</b> (${escapeHtml(market)}) • <b>${directionLabel("es", payload.direction)}</b> • <b>${escapeHtml(payload.time)}</b>`,
        `• Caducidad en ${payload.expiryMinutes} minutos (M${payload.expiryMinutes})`,
        `• Hacer ${payload.reentries} reentradas si se pierde`,
        "",
        `›› <a href="${escapeHtml(payload.brokerLink)}"><b>${escapeHtml(payload.brokerLabel)}</b></a> y abre el broker`,
      ]
    : [
        `<b>${escapeHtml(payload.title)}</b>`,
        signalBadgeLine("en"),
        "",
        "• Timezone: UTC-3",
        "",
        `• <b>${escapeHtml(pair)}</b> (${escapeHtml(market)}) • <b>${directionLabel("en", payload.direction)}</b> • <b>${escapeHtml(payload.time)}</b>`,
        `• Expiration in ${payload.expiryMinutes} minutes (M${payload.expiryMinutes})`,
        `• Make ${payload.reentries} re-entries if it loses`,
        "",
        `›› <a href="${escapeHtml(payload.brokerLink)}"><b>${escapeHtml(payload.brokerLabel)}</b></a> to open the broker`,
      ];

  return { text: lines.join("\n") };
}

export function renderSavedSignalTemplate(template: CapturedTemplate, payload: SignalPayload): RenderedTelegramMessage {
  const replacements: Record<string, string> = {
    title: payload.title,
    pair: payload.pair.trim().toUpperCase(),
    market: payload.market.trim().toUpperCase() || "OTC",
    direction: directionText(payload.locale, payload.direction),
    time: payload.time,
    expiry: String(payload.expiryMinutes),
    reentries: String(payload.reentries),
    brokerLink: payload.brokerLink,
    brokerLabel: payload.brokerLabel,
  };

  if (template.text && template.entities) {
    return renderNativeTemplate(template.text, template.entities, replacements);
  }

  const rendered = template.html
    .replace(/\bHH:MM\b/gi, "{{time}}")
    .replace(/\{\{(title|pair|market|direction|time|expiry|reentries|brokerLink|brokerLabel)\}\}/g, (_, key: string) => escapeHtml(replacements[key] || ""));
  return { text: polishRenderedSignal(rendered) };
}

export function renderCustom(locale: Locale, title: string, body: string, link: string, label: string): RenderedTelegramMessage {
  const safeBody = escapeHtml(body).replace(/\n/g, "\n");
  const cta = locale === "es" ? "para abrir el Broker" : "to open the Broker";
  return { text: [`<b>${escapeHtml(title)}</b>`, safeBody, "", `›› <a href="${escapeHtml(link)}"><b>${escapeHtml(label)}</b></a> ${cta}`].join("\n") };
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function polishRenderedSignal(html: string) {
  return html
    .replace(/\bSELL(?:\s*(?:🔴|<tg-emoji\b[^>]*>🔴<\/tg-emoji>)){2,}/gi, "SELL 🔴")
    .replace(/\bBUY(?:\s*(?:🟢|<tg-emoji\b[^>]*>🟢<\/tg-emoji>)){2,}/gi, "BUY 🟢")
    .replace(/\bABAJO(?:\s*(?:🔴|<tg-emoji\b[^>]*>🔴<\/tg-emoji>)){2,}/gi, "ABAJO 🔴")
    .replace(/\bARRIBA(?:\s*(?:🟢|<tg-emoji\b[^>]*>🟢<\/tg-emoji>)){2,}/gi, "ARRIBA 🟢");
}

function renderNativeTemplate(templateText: string, templateEntities: TelegramEntity[], replacements: Record<string, string>): RenderedTelegramMessage {
  let text = templateText;
  let entities = cloneEntities(templateEntities);
  ({ text, entities } = replaceToken(text, entities, "HH:MM", replacements.time));
  for (const [key, value] of Object.entries(replacements)) {
    const rendered = replaceToken(text, entities, `{{${key}}}`, value);
    text = rendered.text;
    entities = rendered.entities;
  }
  return { text, entities };
}

function replaceToken(text: string, entities: TelegramEntity[], token: string, value: string) {
  let nextText = text;
  let nextEntities = entities;
  let index = nextText.indexOf(token);
  while (index !== -1) {
    nextText = `${nextText.slice(0, index)}${value}${nextText.slice(index + token.length)}`;
    nextEntities = shiftEntities(nextEntities, index, token.length, value.length);
    index = nextText.indexOf(token, index + value.length);
  }
  return { text: nextText, entities: nextEntities };
}

function shiftEntities(entities: TelegramEntity[], start: number, oldLength: number, newLength: number) {
  const delta = newLength - oldLength;
  const end = start + oldLength;
  return entities.map((entity) => {
    const entityEnd = entity.offset + entity.length;
    if (entity.offset >= end) return { ...entity, offset: entity.offset + delta };
    if (entity.offset <= start && entityEnd >= end) return { ...entity, length: entity.length + delta };
    if (entity.offset < end && entityEnd > start) return { ...entity, length: Math.max(0, entity.length + delta) };
    return entity;
  });
}

function cloneEntities(entities: TelegramEntity[]) {
  return entities.map((entity) => ({ ...entity }));
}

