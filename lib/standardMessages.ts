import type { ProjectConfig } from "./projects";
import type { SavedMessage } from "./store";
import type { SendTelegramMessage } from "./telegram";
import { escapeHtml } from "./templates";

export function standardMessagePayload(project: ProjectConfig, message: SavedMessage): SendTelegramMessage {
  const template = project.messageTemplates?.[message.kind];
  const body = message.textByLanguage[project.language] || message.textByLanguage.en || message.textByLanguage.es || "";
  if (template && template.text === undefined) {
    throw new Error("Este modelo precisa ser atualizado pela captura original antes do envio.");
  }
  return {
    chatId: project.chatId,
    chatTitle: project.name,
    text: template ? template.text! : escapeHtml(body),
    entities: template?.entities,
    media: template?.media,
    buttons: template?.buttons,
    buttonText: !template && message.includeInlineButton ? project.brokerLabel : undefined,
    buttonUrl: !template && message.includeInlineButton ? project.link : undefined,
  };
}
