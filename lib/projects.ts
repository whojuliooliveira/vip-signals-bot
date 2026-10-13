import type { Locale } from "./templates";
import { loadStore, type CapturedTemplate, type MessageKind, type TelegramAccountSettings } from "./store";

export type ProjectConfig = {
  id: string;
  name: string;
  language: Locale;
  botToken: string;
  chatId: string;
  link: string;
  brokerLabel: string;
  signalTemplates?: {
    UP?: CapturedTemplate;
    DOWN?: CapturedTemplate;
  };
  messageTemplates?: Partial<Record<MessageKind, CapturedTemplate>>;
  telegramAccount?: TelegramAccountSettings;
};

function project(prefix: "PROJECT_1" | "PROJECT_2"): ProjectConfig {
  const fallbackId = prefix === "PROJECT_1" ? "expert_a" : "expert_b";
  const fallbackName = prefix === "PROJECT_1" ? "💎 José Álvarez | Señales VIP 💎" : "💎 Tom Reed | VIP Signals 💎";
  const fallbackLanguage = prefix === "PROJECT_1" ? "es" : "en";
  const language = (process.env[`${prefix}_LANGUAGE`] || fallbackLanguage) as Locale;
  return {
    id: process.env[`${prefix}_ID`] || fallbackId,
    name: process.env[`${prefix}_NAME`] || fallbackName,
    language,
    botToken: process.env[`${prefix}_BOT_TOKEN`] || "",
    chatId: process.env[`${prefix}_CHAT_ID`] || "",
    link: process.env[`${prefix}_LINK`] || "",
    brokerLabel: process.env[`${prefix}_BROKER_LABEL`] || (language === "es" ? "Haz clic aquí" : "Click here"),
  };
}

export function getProjects(): ProjectConfig[] {
  return [project("PROJECT_1"), project("PROJECT_2")];
}

export function getProject(id: string): ProjectConfig | undefined {
  return getProjects().find((item) => item.id === id);
}

export async function getProjectsConfig(): Promise<ProjectConfig[]> {
  const envProjects = getProjects();
  const store = await loadStore();
  return envProjects.map((envProject) => {
    const saved = store.projects.find((item) => item.id === envProject.id);
    const telegramAccount = saved?.telegramAccount || (envProject.id === "expert_b" ? undefined : { sendMode: "auto" as const });
    return {
      ...envProject,
      name: saved?.name || envProject.name,
      language: saved?.language || envProject.language,
      botToken: saved?.botToken || envProject.botToken,
      chatId: saved?.chatId || envProject.chatId,
      link: saved?.link || envProject.link,
      brokerLabel: saved?.brokerLabel || envProject.brokerLabel,
      signalTemplates: saved?.signalTemplates,
      messageTemplates: saved?.messageTemplates,
      telegramAccount: envProject.language === "es"
        ? { ...telegramAccount, sendMode: "user" }
        : telegramAccount,
    };
  });
}

export async function getProjectConfig(id: string): Promise<ProjectConfig | undefined> {
  const fromConfig = (await getProjectsConfig()).find((item) => item.id === id);
  if (fromConfig) return fromConfig;
  const store = await loadStore();
  const saved = store.projects.find((item) => item.id === id);
  if (!saved) return undefined;
  return {
    id: saved.id,
    name: saved.name,
    language: saved.language,
    botToken: saved.botToken || "",
    chatId: saved.chatId || "",
    link: saved.link,
    brokerLabel: saved.brokerLabel,
    signalTemplates: saved.signalTemplates,
    messageTemplates: saved.messageTemplates,
    telegramAccount: saved.language === "es"
      ? { ...saved.telegramAccount, sendMode: "user" }
      : saved.telegramAccount,
  };
}
