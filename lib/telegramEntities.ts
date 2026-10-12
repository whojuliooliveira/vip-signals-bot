import { Api } from "telegram";
import bigInt from "big-integer";
import type { TelegramEntity } from "./telegram";

export function toTelegramUserEntities(text: string, entities: TelegramEntity[]): Api.TypeMessageEntity[] {
  return entities.map((entity) => {
    const { offset, length } = entity;
    if (!Number.isInteger(offset) || !Number.isInteger(length) || offset < 0 || length <= 0 || offset + length > text.length) {
      throw new Error("Modelo com formatacao fora dos limites do texto.");
    }
    const range = { offset, length };
    switch (entity.type) {
      case "bold": return new Api.MessageEntityBold(range);
      case "italic": return new Api.MessageEntityItalic(range);
      case "underline": return new Api.MessageEntityUnderline(range);
      case "strikethrough": return new Api.MessageEntityStrike(range);
      case "spoiler": return new Api.MessageEntitySpoiler(range);
      case "code": return new Api.MessageEntityCode(range);
      case "pre": return new Api.MessageEntityPre({ ...range, language: entity.language || "" });
      case "blockquote": return new Api.MessageEntityBlockquote(range);
      case "expandable_blockquote": return new Api.MessageEntityBlockquote({ ...range, collapsed: true });
      case "text_link":
        if (!entity.url) throw new Error("Link do modelo sem destino.");
        return new Api.MessageEntityTextUrl({ ...range, url: entity.url });
      case "custom_emoji":
        if (!entity.custom_emoji_id) throw new Error("Emoji do modelo sem identificador.");
        return new Api.MessageEntityCustomEmoji({ ...range, documentId: bigInt(entity.custom_emoji_id) });
      case "url": return new Api.MessageEntityUrl(range);
      case "mention": return new Api.MessageEntityMention(range);
      case "hashtag": return new Api.MessageEntityHashtag(range);
      case "cashtag": return new Api.MessageEntityCashtag(range);
      case "bot_command": return new Api.MessageEntityBotCommand(range);
      case "email": return new Api.MessageEntityEmail(range);
      case "phone_number": return new Api.MessageEntityPhone(range);
      default: throw new Error(`Formatacao do modelo nao suportada: ${entity.type}`);
    }
  });
}
