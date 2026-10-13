import { NextRequest, NextResponse } from "next/server";
import { getProjectConfig, getProjectsConfig, type ProjectConfig } from "../../../../lib/projects";
import { loadStore, saveStore, uid, type CapturedTemplate, type TemplateKind } from "../../../../lib/store";
import { getTelegramUpdates, telegramMessageToHtml, updateMessage, type TelegramCapturedMessage, type TelegramEntity } from "../../../../lib/telegram";

const SESSION_TTL_MS = 5 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const projectId = String(body.projectId || "");
    const kind = String(body.kind || "") as TemplateKind;
    if (!isTemplateKind(kind)) throw new Error("Tipo de modelo inválido.");
    const project = await getProjectConfig(projectId);
    if (!project) throw new Error("Projeto não encontrado.");
    const sourceProject = await captureSourceFor(project);

    const store = await loadStore();
    const session = {
      id: uid("cap"),
      projectId: project.id,
      sourceProjectId: sourceProject.id,
      kind,
      status: "waiting" as const,
      startedAt: new Date().toISOString(),
    };
    store.captureSessions = [session, ...(store.captureSessions || []).filter((item) => item.status === "waiting").slice(0, 20)];
    await saveStore(store);

    return NextResponse.json({
      ok: true,
      session,
      instruction: sourceProject.id === project.id
        ? `Envie agora o modelo no canal ${project.name}. Vou capturar automaticamente.`
        : `Envie agora o modelo em ${sourceProject.name}. Ele será salvo somente para ${project.name}.`,
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
    const sourceProject = session.sourceProjectId
      ? await getProjectConfig(session.sourceProjectId)
      : await captureSourceFor(project);
    if (!sourceProject?.botToken || !sourceProject.chatId) throw new Error("Canal de captura não configurado.");

    const updates = await getTelegramUpdates(sourceProject.botToken);
    const message = findMessageAfter(updates.map(updateMessage).filter(Boolean) as TelegramCapturedMessage[], sourceProject.chatId, startedAtMs);
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

async function captureSourceFor(project: ProjectConfig) {
  if (project.language !== "es") {
    if (!project.botToken || !project.chatId) throw new Error("Bot ou Chat ID do canal não configurado.");
    return project;
  }

  const source = (await getProjectsConfig()).find((item) => item.language === "en" && item.botToken && item.chatId);
  if (!source) throw new Error("Configure o bot e o Chat ID do canal inglês para capturar os modelos do espanhol.");
  return source;
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

  const isSignal = kind === "signal_up" || kind === "signal_down";
  const html = isSignal ? normalizeTemplate(telegramMessageToHtml(message), projectName, brokerLink) : telegramMessageToHtml(message);
  const native = isSignal ? normalizeNativeTemplate(message, projectName, brokerLink) : {
    text: message.text || message.caption || "",
    entities: message.text ? message.entities || [] : message.caption_entities || [],
  };
  return {
    id: uid("tpl"),
    kind,
    html,
    text: native.text,
    entities: native.entities,
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
  template = template.replace(/\bHH:MM\b/gi, "{{time}}");
  template = template.replace(/\b(BUY|CALL|UP|ARRIBA)\b/gi, "{{direction}}");
  template = template.replace(/\b(SELL|PUT|DOWN|ABAJO)\b/gi, "{{direction}}");
  template = template.replace(/make\s+{{direction}}\s+to\s+2\s+Gale&apos;s/gi, "make up to {{reentries}} Gale&apos;s");
  template = template.replace(/make\s+{{direction}}\s+to\s+2\s+Gale's/gi, "make up to {{reentries}} Gale's");
  return template;
}

function normalizeNativeTemplate(message: TelegramCapturedMessage, projectName: string, brokerLink: string) {
  let text = message.text || message.caption || "";
  let entities = cloneEntities(message.text ? message.entities || [] : message.caption_entities || []);
  ({ text, entities } = replaceNativeLiteral(text, entities, projectName, "{{title}}"));
  if (brokerLink) ({ text, entities } = replaceNativeLiteral(text, entities, brokerLink, "{{brokerLink}}"));
  ({ text, entities } = replaceNativeRegex(text, entities, /\b[A-Z]{3}\/[A-Z]{3,}\b|\b[A-Z]{6,}(?=\s*(?:-?OTC|\())/g, "{{pair}}"));
  ({ text, entities } = replaceNativeRegex(text, entities, /\(\s*OTC\s*\)/gi, "({{market}})"));
  ({ text, entities } = replaceNativeRegex(text, entities, /\b([01]?\d|2[0-3]):[0-5]\d\b/, "{{time}}"));
  ({ text, entities } = replaceNativeRegex(text, entities, /\bHH:MM\b/gi, "{{time}}"));
  ({ text, entities } = replaceNativeRegex(text, entities, /\b(BUY|CALL|UP|ARRIBA|SELL|PUT|DOWN|ABAJO)\b/gi, "{{direction}}"));
  ({ text, entities } = replaceNativeRegex(text, entities, /make\s+\{\{direction\}\}\s+to\s+2\s+Gale's/gi, "make up to {{reentries}} Gale's"));
  return { text, entities };
}

function replaceNativeLiteral(text: string, entities: TelegramEntity[], needle: string, replacement: string) {
  if (!needle) return { text, entities };
  let nextText = text;
  let nextEntities = entities;
  let index = nextText.indexOf(needle);
  while (index !== -1) {
    nextText = `${nextText.slice(0, index)}${replacement}${nextText.slice(index + needle.length)}`;
    nextEntities = shiftEntities(nextEntities, index, needle.length, replacement.length);
    index = nextText.indexOf(needle, index + replacement.length);
  }
  return { text: nextText, entities: nextEntities };
}

function replaceNativeRegex(text: string, entities: TelegramEntity[], pattern: RegExp, replacement: string) {
  let nextText = text;
  let nextEntities = entities;
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const regex = new RegExp(pattern.source, flags);
  let match = regex.exec(nextText);
  while (match) {
    const index = match.index;
    const value = match[0];
    nextText = `${nextText.slice(0, index)}${replacement}${nextText.slice(index + value.length)}`;
    nextEntities = shiftEntities(nextEntities, index, value.length, replacement.length);
    regex.lastIndex = index + replacement.length;
    match = regex.exec(nextText);
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

function replaceLiteral(value: string, needle: string, replacement: string) {
  if (!needle) return value;
  return value.split(needle).join(replacement);
}
