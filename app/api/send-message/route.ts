import { NextRequest, NextResponse } from "next/server";
import { getProjectConfig } from "../../../lib/projects";
import { loadStore, appendLog, uid } from "../../../lib/store";
import { standardMessagePayload } from "../../../lib/standardMessages";
import { sendTelegramMessage } from "../../../lib/telegram";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const store = await loadStore();
    const project = await getProjectConfig(String(body.projectId || ""));
    const message = store.messages.find((item) => item.kind === body.kind);
    if (!project?.chatId || !message) throw new Error("Canal ou mensagem nao encontrado.");
    const payload = standardMessagePayload(project, message);
    try {
      const sent = await sendTelegramMessage(project.botToken, payload);
      await appendLog({ id: uid("log"), at: new Date().toISOString(), source: "manual",
        projectId: project.id, projectName: project.name, kind: message.kind, label: message.label,
        text: payload.text, messageId: sent?.message_id, status: "sent" });
      return NextResponse.json({ ok: true, messageId: sent?.message_id });
    } catch (error) {
      await appendLog({ id: uid("log"), at: new Date().toISOString(), source: "manual",
        projectId: project.id, projectName: project.name, kind: message.kind, label: message.label,
        text: payload.text, status: "failed", error: error instanceof Error ? error.message : "Falha no envio" });
      throw error;
    }
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Falha no envio" }, { status: 500 });
  }
}
