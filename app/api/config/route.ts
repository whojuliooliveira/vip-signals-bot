import { NextRequest, NextResponse } from "next/server";
import { getProjectsConfig } from "../../../lib/projects";
import { loadStore, saveStore } from "../../../lib/store";
import { hasSupabase, supabaseSelect } from "../../../lib/supabase";

export async function GET() {
  try {
    const store = await loadStore();
    const runtimeProjects = await getProjectsConfig();
    const projects = store.projects.map((project) => {
      const runtime = runtimeProjects.find((item) => item.id === project.id);
      return {
        ...project,
        botToken: "",
        botTokenConfigured: Boolean(runtime?.botToken || project.botToken),
        chatId: runtime?.chatId || project.chatId || "",
      };
    });
    const heartbeat = hasSupabase() ? await supabaseSelect<{ created_at: string }>("schedule_keys", "select=created_at&id=eq.worker-heartbeat") : [];
    return NextResponse.json({ ok: true, workerLastSeen: heartbeat[0]?.created_at || null, messages: store.messages, projects, signals: store.signals, logs: store.logs.slice(0, 100), sentScheduleKeys: store.sentScheduleKeys });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Erro ao carregar configuração.",
      hint: "Verifique se as migrations do Supabase foram aplicadas.",
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const store = await loadStore();
  if (Array.isArray(body.messages)) store.messages = body.messages;
  if (Array.isArray(body.projects)) {
    const byId = new Map(store.projects.map((project) => [project.id, project]));
    for (const project of body.projects) {
      const current = byId.get(project.id);
      if (!current) continue;
      byId.set(project.id, {
        ...current,
        ...project,
        botToken: project.botToken ? project.botToken : current.botToken,
        signalTemplates: current.signalTemplates,
        messageTemplates: current.messageTemplates,
      });
    }
    store.projects = Array.from(byId.values());
  }
  await saveStore(store);
  return NextResponse.json({ ok: true, messages: store.messages, projects: store.projects.map((project) => ({ ...project, botToken: "", botTokenConfigured: Boolean(project.botToken) })) });
}
