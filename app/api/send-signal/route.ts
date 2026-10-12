import { NextRequest, NextResponse } from "next/server";
import { getProjectConfig } from "../../../lib/projects";
import { appendLog, uid } from "../../../lib/store";
import { renderCustom, renderSignal, type Direction } from "../../../lib/templates";
import { sendTelegramMessage } from "../../../lib/telegram";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const password = request.headers.get("x-admin-password") || body.password;
    if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const projectIds = Array.isArray(body.projects) ? body.projects : [body.projectId].filter(Boolean);
    if (!projectIds.length) throw new Error("Select at least one project");

    const results = [];
    for (const projectId of projectIds) {
      const project = await getProjectConfig(String(projectId));
      if (!project) throw new Error(`Unknown project: ${projectId}`);
      if (!project.botToken) throw new Error(`Missing bot token for ${project.name}`);
      if (!project.chatId) throw new Error(`Missing chat id for ${project.name}`);

      const text = body.kind === "custom"
        ? renderCustom(project.language, project.name, String(body.customText || ""), project.link, project.brokerLabel)
        : renderSignal({
            locale: project.language,
            title: project.name,
            pair: String(body.pair || ""),
            market: String(body.market || "OTC"),
            direction: String(body.direction || "DOWN") as Direction,
            time: String(body.time || ""),
            expiryMinutes: Number(body.expiryMinutes || 5),
            reentries: Number(body.reentries || 2),
            brokerLink: project.link,
            brokerLabel: project.brokerLabel,
            includeInlineButton: Boolean(body.includeInlineButton),
            template: project.signalTemplates?.[String(body.direction || "DOWN") as Direction],
          });

      const result = await sendTelegramMessage(project.botToken, {
        chatId: project.chatId,
        chatTitle: project.name,
        text,
        media: body.kind === "custom" ? undefined : project.signalTemplates?.[String(body.direction || "DOWN") as Direction]?.media,
        buttons: body.kind === "custom" ? undefined : project.signalTemplates?.[String(body.direction || "DOWN") as Direction]?.buttons,
        buttonText: body.includeInlineButton ? project.brokerLabel : undefined,
        buttonUrl: body.includeInlineButton ? project.link : undefined,
      });
      await appendLog({
        id: uid("log"),
        at: new Date().toISOString(),
        source: "manual",
        projectId: project.id,
        projectName: project.name,
        messageId: result?.message_id,
        kind: body.kind === "custom" ? "custom" : "signal",
        label: body.kind === "custom" ? "Manual custom" : `${String(body.pair || "").toUpperCase()} ${String(body.direction || "DOWN")}`,
        text,
        status: "sent",
      });
      results.push({ projectId: project.id, language: project.language, messageId: result?.message_id });
    }

    return NextResponse.json({ ok: true, results });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
