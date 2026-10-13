import { NextRequest, NextResponse } from "next/server";
import { getProjectsConfig } from "../../../lib/projects";
import { loadStore, saveStore, type TelegramAccountSettings } from "../../../lib/store";
import { hasSupabase, supabaseSelect } from "../../../lib/supabase";

function publicTelegramAccount(account: TelegramAccountSettings | undefined, allowLegacy: boolean) {
  const sharedCredentialsConfigured = Boolean(process.env.TELEGRAM_API_ID && process.env.TELEGRAM_API_HASH);
  const legacyConfigured = allowLegacy && Boolean(process.env.TELEGRAM_API_ID && process.env.TELEGRAM_API_HASH && (process.env.TELEGRAM_STRING_SESSION || process.env.TELEGRAM_SESSION));
  return {
    sendMode: account?.sendMode || process.env.TELEGRAM_SEND_MODE || "auto",
    apiId: account?.apiId || "",
    phone: account?.phone || "",
    targetPeer: account?.targetPeer || "",
    accountLabel: account?.accountLabel || (legacyConfigured ? "Conta atual do servidor" : ""),
    status: account?.stringSession ? "connected" : account?.status || (legacyConfigured ? "legacy" : "disconnected"),
    apiHashConfigured: Boolean(account?.apiHash),
    sharedCredentialsConfigured,
    sessionConfigured: Boolean(account?.stringSession || legacyConfigured),
    legacyFallback: !account?.stringSession && legacyConfigured,
  };
}

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
        telegramAccount: {
          ...publicTelegramAccount(project.telegramAccount, project.id === "expert_b"),
          ...(project.language === "es" ? { sendMode: "user" as const } : {}),
        },
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
      const telegramAccount = current.telegramAccount
        ? {
            ...current.telegramAccount,
            sendMode: project.telegramAccount?.sendMode || current.telegramAccount.sendMode || "auto",
            targetPeer: project.telegramAccount?.targetPeer ?? current.telegramAccount.targetPeer,
          }
        : project.telegramAccount?.legacyFallback
          ? undefined
          : {
              sendMode: project.telegramAccount?.sendMode || "auto",
              targetPeer: project.telegramAccount?.targetPeer,
            };
      byId.set(project.id, {
        ...current,
        ...project,
        botToken: project.botToken ? project.botToken : current.botToken,
        signalTemplates: current.signalTemplates,
        messageTemplates: current.messageTemplates,
        telegramAccount,
      });
    }
    store.projects = Array.from(byId.values());
  }
  await saveStore(store);
  return NextResponse.json({ ok: true, messages: store.messages, projects: store.projects.map((project) => ({ ...project, botToken: "", botTokenConfigured: Boolean(project.botToken), telegramAccount: { ...publicTelegramAccount(project.telegramAccount, project.id === "expert_b"), ...(project.language === "es" ? { sendMode: "user" as const } : {}) } })) });
}
