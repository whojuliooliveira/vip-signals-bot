import type { ProjectConfig } from "./projects";
import { localWeekday, type SavedMessage } from "./store";
import type { SendTelegramMessage } from "./telegram";
import { escapeHtml } from "./templates";

export function standardMessagePayload(project: ProjectConfig, message: SavedMessage, now = new Date()): SendTelegramMessage {
  const template = project.messageTemplates?.[message.kind];
  const body = message.textByLanguage[project.language] || message.textByLanguage.en || message.textByLanguage.es || "";
  const hasNativeTemplate = template?.text !== undefined;
  const sourceText = hasNativeTemplate
    ? template.text!
    : template
      ? renderLegacyTemplateHtml(template.html, project)
      : escapeHtml(body);
  return {
    chatId: project.chatId,
    chatTitle: project.name,
    text: message.kind === "good_night" ? applyGoodNightReturnHour(sourceText, now) : sourceText,
    entities: hasNativeTemplate ? template.entities : undefined,
    media: template?.media,
    buttons: template?.buttons,
    buttonText: !template && message.includeInlineButton ? project.brokerLabel : undefined,
    buttonUrl: !template && message.includeInlineButton ? project.link : undefined,
  };
}

function renderLegacyTemplateHtml(html: string, project: ProjectConfig) {
  return html
    .replace(/\{\{brokerLink\}\}/g, escapeHtml(project.link))
    .replace(/\{\{brokerLabel\}\}/g, escapeHtml(project.brokerLabel));
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
