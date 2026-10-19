import { withCurrentBrokerLink, type Locale } from "./templates";
import { loadStore, type AppStore, type CapturedTemplate, type MessageKind, type ProjectSettings, type TelegramAccountSettings } from "./store";

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

export function resolveProjectConfig(id: string, savedProjects: ProjectSettings[]): ProjectConfig | undefined {
  const envProjects = getProjects();
  const envProject = envProjects.find((item) => item.id === id);
  const saved = savedProjects.find((item) => item.id === id);
  if (!envProject && !saved) return undefined;
  const base = envProject || {
    id: saved!.id,
    name: saved!.name,
    language: saved!.language,
    botToken: "",
    chatId: "",
    link: saved!.link,
    brokerLabel: saved!.brokerLabel,
  };
  const telegramAccount = saved?.telegramAccount || (base.id === "expert_b" ? undefined : { sendMode: "auto" as const });
  const language = saved?.language || base.language;
  const link = saved?.link || base.link;
  const signalTemplates = saved?.signalTemplates
    ? {
        UP: withCurrentBrokerLink(saved.signalTemplates.UP, link),
        DOWN: withCurrentBrokerLink(saved.signalTemplates.DOWN, link),
      }
    : undefined;
  return {
    ...base,
    name: saved?.name || base.name,
    language,
    botToken: saved?.botToken || base.botToken,
    chatId: saved?.chatId || base.chatId,
    link,
    brokerLabel: saved?.brokerLabel || base.brokerLabel,
    signalTemplates,
    messageTemplates: saved?.messageTemplates,
    telegramAccount: language === "es"
      ? { ...telegramAccount, sendMode: "user" }
      : telegramAccount,
  };
}

export async function getProjectsConfig(loadedStore?: AppStore): Promise<ProjectConfig[]> {
  const store = loadedStore || await loadStore();
  return getProjects()
    .map((envProject) => resolveProjectConfig(envProject.id, store.projects))
    .filter((item): item is ProjectConfig => Boolean(item));
}

export async function getProjectConfig(id: string): Promise<ProjectConfig | undefined> {
  const store = await loadStore();
  return resolveProjectConfig(id, store.projects);
}
