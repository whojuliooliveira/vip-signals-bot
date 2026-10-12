import { NextRequest, NextResponse } from "next/server";
import { getProjectConfig } from "../../../lib/projects";
import { isSignalDueNow, validateSignalTime } from "../../../lib/signals";
import { escapeHtml, renderSignal } from "../../../lib/templates";
import { sendTelegramMessage } from "../../../lib/telegram";
import { dayMode, loadStore, localDateKey, localTime, localWeekday, saveStore, scheduledKey, uid, type DayMode, type SavedMessage, type SendLog, type Weekday } from "../../../lib/store";

function authorized(request: NextRequest) {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const secret = request.headers.get("x-cron-secret") || bearer || request.nextUrl.searchParams.get("secret");
  const expected = process.env.CRON_SECRET || process.env.ADMIN_PASSWORD;
  return Boolean(expected && secret === expected);
}

function renderSavedMessage(projectName: string, text: string) {
  return [`<b>${escapeHtml(projectName)}</b>`, escapeHtml(text)].join("\n");
}

function scheduledMessageTime(message: SavedMessage, mode: DayMode, weekday: Weekday) {
  return message.timeByWeekday?.[weekday] || message.timeByDay[mode];
}

async function runSchedule(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const mode = dayMode(now);
  const weekday = localWeekday(now);
  const time = request.nextUrl.searchParams.get("time") || localTime(now);
  const dateKey = request.nextUrl.searchParams.get("date") || localDateKey(now);
  const store = await loadStore();
  const dueMessages = store.messages.filter((message) => message.enabled && scheduledMessageTime(message, mode, weekday) === time);
  const results = [];

  for (const message of dueMessages) {
    for (const projectId of message.projects) {
      const project = await getProjectConfig(projectId);
      if (!project) continue;

      const key = scheduledKey(dateKey, time, message.id, project.id);
      if (store.sentScheduleKeys.includes(key)) {
        results.push({ projectId: project.id, label: message.label, skipped: true });
        continue;
      }

      const body = message.textByLanguage[project.language] || message.textByLanguage.en || message.textByLanguage.es || "";
      const template = project.messageTemplates?.[message.kind];
      const renderedMessage = template?.text
        ? { text: template.text, entities: template.entities }
        : { text: template?.html || renderSavedMessage(project.name, body) };

      try {
        const sent = await sendTelegramMessage(project.botToken, {
          chatId: project.chatId,
          chatTitle: project.name,
          text: renderedMessage.text,
          entities: renderedMessage.entities,
          media: template?.media,
          buttons: template?.buttons,
          buttonText: message.includeInlineButton ? project.brokerLabel : undefined,
          buttonUrl: message.includeInlineButton ? project.link : undefined,
        });

        store.sentScheduleKeys.push(key);
        const log: SendLog = {
          id: uid("log"),
          at: now.toISOString(),
          source: "schedule",
          projectId: project.id,
          projectName: project.name,
          messageId: sent?.message_id,
          kind: message.kind,
          label: message.label,
          text: body,
          status: "sent",
        };
        store.logs = [log, ...store.logs].slice(0, 1000);
        results.push({ projectId: project.id, label: message.label, messageId: sent?.message_id });
      } catch (error) {
        const log: SendLog = {
          id: uid("log"),
          at: now.toISOString(),
          source: "schedule",
          projectId: project.id,
          projectName: project.name,
          kind: message.kind,
          label: message.label,
          text: body,
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error",
        };
        store.logs = [log, ...store.logs].slice(0, 1000);
        results.push({ projectId: project.id, label: message.label, error: error instanceof Error ? error.message : "Unknown error" });
      }
    }
  }

  const dueSignals = store.signals.filter((signal) => (
    !signal.sentAt
    && !signal.manualOnly
    && !validateSignalTime(signal.time)
    && isSignalDueNow(signal.dateKey, signal.time, now)
  ));
  for (const signal of dueSignals) {
    const project = await getProjectConfig(signal.projectId);
    if (!project) continue;

    try {
      const message = renderSignal({
        locale: project.language,
        title: project.name,
        pair: signal.pair,
        market: signal.market,
        direction: signal.direction,
        time: signal.time,
        expiryMinutes: signal.expiryMinutes,
        reentries: signal.reentries,
        brokerLink: project.link,
        brokerLabel: project.brokerLabel,
        includeInlineButton: true,
        template: project.signalTemplates?.[signal.direction],
      });
      const sent = await sendTelegramMessage(project.botToken, {
        chatId: project.chatId,
        chatTitle: project.name,
        text: message.text,
        entities: message.entities,
        media: project.signalTemplates?.[signal.direction]?.media,
        buttons: project.signalTemplates?.[signal.direction]?.buttons,
      });
      signal.sentAt = now.toISOString();
      signal.messageId = sent?.message_id;
      const log: SendLog = {
        id: uid("log"),
        at: now.toISOString(),
        source: "schedule",
        projectId: project.id,
        projectName: project.name,
        messageId: sent?.message_id,
        kind: "signal",
        label: `${signal.pair} ${signal.direction}`,
        text: message.text,
        status: "sent",
      };
      store.logs = [log, ...store.logs].slice(0, 1000);
      results.push({ projectId: project.id, label: `${signal.pair} ${signal.direction}`, messageId: sent?.message_id });
    } catch (error) {
      signal.error = error instanceof Error ? error.message : "Unknown error";
      const log: SendLog = {
        id: uid("log"),
        at: now.toISOString(),
        source: "schedule",
        projectId: signal.projectId,
        projectName: project.name,
        kind: "signal",
        label: `${signal.pair} ${signal.direction}`,
        text: signal.sourceText,
        status: "failed",
        error: signal.error,
      };
      store.logs = [log, ...store.logs].slice(0, 1000);
      results.push({ projectId: signal.projectId, label: `${signal.pair} ${signal.direction}`, error: signal.error });
    }
  }

  store.sentScheduleKeys = store.sentScheduleKeys.slice(-5000);
  await saveStore(store);
  return NextResponse.json({ ok: true, mode, time, dateKey, due: dueMessages.length + dueSignals.length, results });
}

export async function GET(request: NextRequest) {
  return runSchedule(request);
}

export async function POST(request: NextRequest) {
  return runSchedule(request);
}
