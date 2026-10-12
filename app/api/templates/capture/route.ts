import { NextRequest, NextResponse } from "next/server";
import { getProjectConfig } from "../../../../lib/projects";
import { loadStore, saveStore, uid, type CapturedTemplate, type TemplateKind } from "../../../../lib/store";
import { getTelegramUpdates, telegramMessageToHtml, updateMessage, type TelegramCapturedMessage } from "../../../../lib/telegram";

const SESSION_TTL_MS = 5 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const projectId = String(body.projectId || "");
    const kind = String(body.kind || "") as TemplateKind;
    if (!isTemplateKind(kind)) throw new Error("Tipo de modelo inválido.");
    const project = await getProjectConfig(projectId);
    if (!project) throw new Error("Projeto não encontrado.");
    if (!project.botToken) throw new Error("Token do bot não configurado.");
    if (!project.chatId) throw new Error("Chat ID do canal não configurado.");

    const store = await loadStore();
    const session = {
      id: uid("cap"),
      projectId: project.id,
      kind,
      status: "waiting" as const,
      startedAt: new Date().toISOString(),
    };
    store.captureSessions = [session, ...(store.captureSessions || []).filter((item) => item.status === "waiting").slice(0, 20)];
    await saveStore(store);

    return NextResponse.json({
      ok: true,
      session,
      instruction: `Envie agora o modelo no canal ${project.name}. Vou capturar automaticamente.`,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Erro desconhecido" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get("sessionId") || "";
    const store = await loadStore();
    const session = store.captureSessions.find((item) => item.id === sessionId);
    if (!session) throw new Error("Sessão de captura não encontrada.");
    if (session.status !== "waiting") return NextResponse.json({ ok: true, session });

    const startedAtMs = new Date(session.startedAt).getTime();
    if (Date.now() - startedAtMs > SESSION_TTL_MS) {
      session.status = "expired";
      session.error = "Tempo de captura expirou. Clique em Capturar modelo novamente.";
      await saveStore(store);
      return NextResponse.json({ ok: true, session });
    }

    const project = await getProjectConfig(session.projectId);
    if (!project) throw new Error("Projeto não encontrado.");
    if (!project.botToken || !project.chatId) throw new Error("Bot ou Chat ID não configurado.");

    const updates = await getTelegramUpdates(project.botToken);
    const message = findMessageAfter(updates.map(updateMessage).filter(Boolean) as TelegramCapturedMessage[], project.chatId, startedAtMs);
    if (!message) return NextResponse.json({ ok: true, session });

    const captured = capturedTemplateFromMessage(session.kind, message, project.name, project.link);
    store.projects = store.projects.map((item) => {
      if (item.id !== project.id) return item;
      if (session.kind === "signal_up") return { ...item, signalTemplates: { ...(item.signalTemplates || {}), UP: captured } };
      if (session.kind === "signal_down") return { ...item, signalTemplates: { ...(item.signalTemplates || {}), DOWN: captured } };
      return { ...item, messageTemplates: { ...(item.messageTemplates || {}), [kindToMessageKind(session.kind)]: captured } };
    });
    session.status = "captured";
    session.capturedAt = captured.capturedAt;
    await saveStore(store);

    return NextResponse.json({ ok: true, session, template: captured });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Erro desconhecido" }, { status: 500 });
  }
}

function isTemplateKind(value: string): value is TemplateKind {
  return ["signal_up", "signal_down", "morning_emoji", "good_morning", "analysis_start", "good_night"].includes(value);
}

function kindToMessageKind(kind: TemplateKind) {
  if (kind === "signal_up" || kind === "signal_down") return "custom";
  return kind;
}

function findMessageAfter(messages: TelegramCapturedMessage[], chatId: string, startedAtMs: number) {
  const expectedChat = String(chatId);
  return messages
    .filter((message) => String(message.chat.id) === expectedChat)
    .filter((message) => Boolean(message.text || message.caption || message.photo || message.video || message.animation || message.document))
    .filter((message) => !message.date || message.date * 1000 >= startedAtMs - 3000)
    .sort((a, b) => (b.date || 0) - (a.date || 0) || b.message_id - a.message_id)[0];
}

function capturedTemplateFromMessage(kind: TemplateKind, message: TelegramCapturedMessage, projectName: string, brokerLink: string): CapturedTemplate {
  const limitations: string[] = [];
  const allEntities = [...(message.entities || []), ...(message.caption_entities || [])];
  if (allEntities.some((entity) => entity.type === "custom_emoji")) {
    limitations.push("O Telegram pode remover emojis personalizados quando o bot envia em canal. Se isso acontecer, use emoji comum ou um bot habilitado para custom emoji.");
  }
  const buttons = message.reply_markup?.inline_keyboard
    ?.map((row) => row.filter((button) => button.url).map((button) => ({ text: button.text, url: button.url! })))
    .filter((row) => row.length);
  if (!buttons?.length) limitations.push("Botões só são capturados quando o Telegram entrega reply_markup no update.");

  const media = message.photo?.length
    ? { type: "photo" as const, fileId: [...message.photo].sort((a, b) => (b.file_size || 0) - (a.file_size || 0))[0].file_id }
    : message.video?.file_id
      ? { type: "video" as const, fileId: message.video.file_id }
      : message.animation?.file_id
        ? { type: "animation" as const, fileId: message.animation.file_id }
        : message.document?.file_id
          ? { type: "document" as const, fileId: message.document.file_id }
          : undefined;

  const html = normalizeTemplate(telegramMessageToHtml(message), projectName, brokerLink);
  return {
    id: uid("tpl"),
    kind,
    html,
    media,
    buttons,
    limitations,
    sourceMessageId: message.message_id,
    capturedAt: new Date().toISOString(),
  };
}

function normalizeTemplate(html: string, projectName: string, brokerLink: string) {
  let template = html || "";
  template = replaceLiteral(template, projectName, "{{title}}");
  if (brokerLink) template = replaceLiteral(template, brokerLink, "{{brokerLink}}");
  template = template.replace(/href="[^"]*"/g, "href=\"{{brokerLink}}\"");
  template = template.replace(/\b[A-Z]{3}\/[A-Z]{3,}\b|\b[A-Z]{6,}(?=\s*(?:-?OTC|\())/g, "{{pair}}");
  template = template.replace(/\(\s*OTC\s*\)/gi, "({{market}})");
  template = template.replace(/\b([01]?\d|2[0-3]):[0-5]\d\b/, "{{time}}");
  template = template.replace(/\b(BUY|CALL|UP|ARRIBA)\b/gi, "{{direction}}");
  template = template.replace(/\b(SELL|PUT|DOWN|ABAJO)\b/gi, "{{direction}}");
  template = template.replace(/make\s+{{direction}}\s+to\s+2\s+Gale&apos;s/gi, "make up to {{reentries}} Gale&apos;s");
  template = template.replace(/make\s+{{direction}}\s+to\s+2\s+Gale's/gi, "make up to {{reentries}} Gale's");
  return template;
}

function replaceLiteral(value: string, needle: string, replacement: string) {
  if (!needle) return value;
  return value.split(needle).join(replacement);
}
