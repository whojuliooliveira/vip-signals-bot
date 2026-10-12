import type { CapturedTemplate } from "./store";

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

export function renderSignal(payload: SignalPayload) {
  if (payload.template?.html) return renderSavedSignalTemplate(payload.template.html, payload);

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

  return lines.join("\n");
}

export function renderSavedSignalTemplate(templateHtml: string, payload: SignalPayload) {
  const replacements: Record<string, string> = {
    title: escapeHtml(payload.title),
    pair: escapeHtml(payload.pair.trim().toUpperCase()),
    market: escapeHtml(payload.market.trim().toUpperCase() || "OTC"),
    direction: escapeHtml(directionText(payload.locale, payload.direction)),
    time: escapeHtml(payload.time),
    expiry: String(payload.expiryMinutes),
    reentries: String(payload.reentries),
    brokerLink: escapeHtml(payload.brokerLink),
    brokerLabel: escapeHtml(payload.brokerLabel),
  };

  const rendered = templateHtml.replace(/\{\{(title|pair|market|direction|time|expiry|reentries|brokerLink|brokerLabel)\}\}/g, (_, key: string) => replacements[key] || "");
  return polishRenderedSignal(rendered);
}

export function renderCustom(locale: Locale, title: string, body: string, link: string, label: string) {
  const safeBody = escapeHtml(body).replace(/\n/g, "\n");
  const cta = locale === "es" ? "para abrir el Broker" : "to open the Broker";
  return [`<b>${escapeHtml(title)}</b>`, safeBody, "", `›› <a href="${escapeHtml(link)}"><b>${escapeHtml(label)}</b></a> ${cta}`].join("\n");
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

