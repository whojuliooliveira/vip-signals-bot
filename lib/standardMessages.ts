import type { ProjectConfig } from "./projects";
import { localWeekday, type SavedMessage } from "./store";
import type { SendTelegramMessage } from "./telegram";
import { escapeHtml } from "./templates";

export function standardMessagePayload(project: ProjectConfig, message: SavedMessage, now = new Date()): SendTelegramMessage {
  const template = project.messageTemplates?.[message.kind];
  const body = message.textByLanguage[project.language] || message.textByLanguage.en || message.textByLanguage.es || "";
  if (template && template.text === undefined) {
    throw new Error("Este modelo precisa ser atualizado pela captura original antes do envio.");
  }
  const sourceText = template ? template.text! : escapeHtml(body);
  return {
    chatId: project.chatId,
    chatTitle: project.name,
    text: message.kind === "good_night" ? applyGoodNightReturnHour(sourceText, now) : sourceText,
    entities: template?.entities,
    media: template?.media,
    buttons: template?.buttons,
    buttonText: !template && message.includeInlineButton ? project.brokerLabel : undefined,
    buttonUrl: !template && message.includeInlineButton ? project.link : undefined,
  };
}

export function goodNightReturnHour(now = new Date()) {
  const weekday = localWeekday(now);
  if (weekday === "saturday") return 8;
  if (weekday === "sunday") return 9;
  return 7;
}

function applyGoodNightReturnHour(text: string, now: Date) {
  const hour = String(goodNightReturnHour(now));
  return text.replace(/\b\d(?=\s*(?:a\.?\s*m\.?|am)\s*\.?\s*UTC\s*-?\s*3\b)/gi, hour);
}
