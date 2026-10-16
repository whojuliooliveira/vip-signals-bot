import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { hasSupabase, supabaseDelete, supabaseSelect, supabaseUpsert } from "./supabase";
import type { TelegramEntity } from "./telegram";

export type DayMode = "weekday" | "saturday" | "sunday";
export type Weekday = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
export type MessageKind = "morning_emoji" | "good_morning" | "analysis_start" | "good_night" | "custom";
export type TemplateKind = "signal_up" | "signal_down" | "morning_emoji" | "good_morning" | "analysis_start" | "good_night";
export type CaptureStatus = "waiting" | "captured" | "failed" | "expired";

export type CapturedMedia = {
  type: "photo" | "video" | "animation" | "document";
  fileId: string;
};

export type CapturedButton = {
  text: string;
  url: string;
};

export type CapturedTemplate = {
  id: string;
  kind: TemplateKind;
  html: string;
  text?: string;
  entities?: TelegramEntity[];
  media?: CapturedMedia;
  buttons?: CapturedButton[][];
  limitations?: string[];
  capturedAt: string;
  sourceMessageId?: number;
};

export type CaptureSession = {
  id: string;
  projectId: string;
  sourceProjectId?: string;
  kind: TemplateKind;
  status: CaptureStatus;
  startedAt: string;
  capturedAt?: string;
  error?: string;
};

export type SavedMessage = {
  id: string;
  label: string;
  kind: MessageKind;
  enabled: boolean;
  projects: string[];
  textByLanguage: {
    es?: string;
    en?: string;
  };
  timeByDay: Partial<Record<DayMode, string>>;
  timeByWeekday?: Partial<Record<Weekday, string>>;
  includeInlineButton: boolean;
  updatedAt: string;
};

export type SendLog = {
  id: string;
  at: string;
  source: "manual" | "schedule";
  projectId: string;
  projectName?: string;
  messageId?: number;
  kind: string;
  label: string;
  text: string;
  status: "sent" | "failed";
  error?: string;
};

export type TelegramAccountSettings = {
  sendMode?: "auto" | "bot" | "user";
  apiId?: string;
  apiHash?: string;
  phone?: string;
  stringSession?: string;
  targetPeer?: string;
  accountLabel?: string;
  connectedAt?: string;
  pendingSession?: string;
  phoneCodeHash?: string;
  codeSentAt?: string;
  status?: "disconnected" | "code_sent" | "password_required" | "connected";
};

export type ProjectSettings = {
  id: string;
  name: string;
  language: "es" | "en";
  botToken?: string;
  chatId?: string;
  link: string;
  brokerLabel: string;
  signalTemplates?: {
    UP?: CapturedTemplate;
    DOWN?: CapturedTemplate;
  };
  messageTemplates?: Partial<Record<MessageKind, CapturedTemplate>>;
  telegramAccount?: TelegramAccountSettings;
  enabled: boolean;
};

export type ScheduledSignal = {
  id: string;
  dateKey: string;
  projectId: string;
  pair: string;
  market: string;
  direction: "UP" | "DOWN";
  time: string;
  expiryMinutes: number;
  reentries: number;
  sourceText: string;
  createdAt: string;
  sentAt?: string;
  messageId?: number;
  error?: string;
  manualOnly?: boolean;
  validationError?: string;
};

export type AppStore = {
  messages: SavedMessage[];
  projects: ProjectSettings[];
  signals: ScheduledSignal[];
  logs: SendLog[];
  sentScheduleKeys: string[];
  captureSessions: CaptureSession[];
};

const storePath = join(process.cwd(), "data", "store.json");

export function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function dayMode(date = new Date()): DayMode {
  const day = localWeekday(date);
  if (day === "sunday") return "sunday";
  if (day === "saturday") return "saturday";
  return "weekday";
}

export function localWeekday(date = new Date()): Weekday {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
  });
  return formatter.format(date).toLowerCase() as Weekday;
}

export function localDateKey(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

export function localTime(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return formatter.format(date);
}

export const defaultMessages: SavedMessage[] = [
  {
    id: "morning-emoji",
    label: "Morning emoji",
    kind: "morning_emoji",
    enabled: true,
    projects: ["expert_a", "expert_b"],
    textByLanguage: { es: "☀️", en: "☀️" },
    timeByDay: { weekday: "06:54", saturday: "07:50", sunday: "08:55" },
    includeInlineButton: false,
    updatedAt: new Date().toISOString(),
  },
  {
    id: "good-morning",
    label: "Mensagem de bom dia",
    kind: "good_morning",
    enabled: true,
    projects: ["expert_a", "expert_b"],
    textByLanguage: {
      es: "💎 Buenos días, traders VIP! Vamos por otro día de señales.",
      en: "💎 Good morning, VIP traders! Another day of signals starts now.",
    },
    timeByDay: { weekday: "07:01", saturday: "08:00", sunday: "09:00" },
    includeInlineButton: false,
    updatedAt: new Date().toISOString(),
  },
  {
    id: "analysis-start",
    label: "Mensagem de análises",
    kind: "analysis_start",
    enabled: true,
    projects: ["expert_a", "expert_b"],
    textByLanguage: {
      es: "⚠️ Comenzamos la Sesión VIP ⚠️\n\n›› Haz clic aquí para abrir el Broker",
      en: "⚠️ VIP Session is starting now ⚠️\n\n›› Click here to open the Broker",
    },
    timeByDay: { weekday: "07:15", saturday: "08:15", sunday: "09:00" },
    includeInlineButton: true,
    updatedAt: new Date().toISOString(),
  },
  {
    id: "good-night",
    label: "Mensagem de boa noite",
    kind: "good_night",
    enabled: true,
    projects: ["expert_a", "expert_b"],
    textByLanguage: {
      es: "💎 Paramos por ahora. Retomamos con señales gratuitas a las 8 a.m. UTC-3. Vamos a ganar juntos?",
      en: "💎 We stop for now. Free signals return at 8 a.m. UTC-3. Ready to win together?",
    },
    timeByDay: { weekday: "04:01", saturday: "00:02", sunday: "00:01" },
    timeByWeekday: {
      monday: "00:01",
      tuesday: "04:01",
      wednesday: "04:01",
      thursday: "04:01",
      friday: "04:01",
      saturday: "04:01",
      sunday: "00:02",
    },
    includeInlineButton: true,
    updatedAt: new Date().toISOString(),
  },
];

export const defaultProjects: ProjectSettings[] = [
  {
    id: "expert_a",
    name: "💎 José Álvarez | Señales VIP 💎",
    language: "es",
    link: "https://link-projeto-espanhol",
    brokerLabel: "Haz clic aquí",
    enabled: false,
  },
  {
    id: "expert_b",
    name: "💎 Tom Reed | VIP Signals 💎",
    language: "en",
    link: "https://u3.shortink.io/smart/HLsHbhHwDmx6gu",
    brokerLabel: "Click here",
    enabled: true,
  },
];

function mergeProjects(projects: ProjectSettings[] = []) {
  const byId = new Map(projects.map((project) => [project.id, project]));
  return defaultProjects.map((defaults) => ({ ...defaults, ...(byId.get(defaults.id) || {}) }));
}

export async function loadStore(): Promise<AppStore> {
  if (hasSupabase()) return loadSupabaseStore();
  try {
    const parsed = JSON.parse(await readFile(storePath, "utf8")) as Partial<AppStore>;
    return {
      messages: normalizeMessages(parsed.messages || defaultMessages),
      projects: mergeProjects(parsed.projects || defaultProjects),
      signals: parsed.signals || [],
      logs: parsed.logs || [],
      sentScheduleKeys: parsed.sentScheduleKeys || [],
      captureSessions: parsed.captureSessions || [],
    };
  } catch {
    return { messages: defaultMessages, projects: defaultProjects, signals: [], logs: [], sentScheduleKeys: [], captureSessions: [] };
  }
}

async function loadSupabaseStore(): Promise<AppStore> {
  const [projectRows, messageRows, signalRows, logRows, keyRows, captureRows] = await Promise.all([
    supabaseSelect<any>("projects", "select=*"),
    supabaseSelect<any>("auto_messages", "select=*"),
    supabaseSelect<any>("signals", "select=*"),
    supabaseSelect<any>("send_logs", "select=*&order=at.desc&limit=1000"),
    supabaseSelect<any>("schedule_keys", "select=*"),
    supabaseSelect<any>("capture_sessions", "select=*"),
  ]);

  return {
    messages: messageRows.length ? normalizeMessages(messageRows.map((row) => row.payload)) : defaultMessages,
    projects: mergeProjects(projectRows.map((row) => ({
      id: row.id,
      name: row.name,
      language: row.language,
      botToken: row.bot_token,
      chatId: row.chat_id,
      link: row.link,
      brokerLabel: row.broker_label,
      signalTemplates: row.signal_templates || undefined,
      messageTemplates: row.message_templates || undefined,
      telegramAccount: row.telegram_account || undefined,
      enabled: row.enabled,
    }))),
    signals: signalRows.map((row) => ({
      id: row.id,
      dateKey: row.date_key,
      projectId: row.project_id,
      pair: row.pair,
      market: row.market,
      direction: row.direction,
      time: row.signal_time,
      expiryMinutes: row.expiry_minutes,
      reentries: row.reentries,
      sourceText: row.source_text,
      createdAt: row.created_at,
      sentAt: row.sent_at || undefined,
      messageId: row.message_id || undefined,
      error: row.error || undefined,
    })),
    logs: logRows.map((row) => row.payload),
    sentScheduleKeys: keyRows.filter((row) => row.id !== "worker-heartbeat").map((row) => row.id),
    captureSessions: captureRows.map((row) => row.payload),
  };
}

function normalizeMessages(messages: SavedMessage[]) {
  return messages.map((message) => {
    const defaults = defaultMessages.find((item) => item.id === message.id);
    if (!defaults) return message;
    return {
      ...message,
      label: message.label || defaults.label,
      projects: message.projects || defaults.projects,
      timeByDay: { ...defaults.timeByDay, ...message.timeByDay },
      timeByWeekday: message.timeByWeekday || defaults.timeByWeekday,
    };
  });
}

export async function saveStore(store: AppStore) {
  if (hasSupabase()) {
    await saveSupabaseStore(store);
    return;
  }
  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(store, null, 2), "utf8");
}

async function saveSupabaseStore(store: AppStore) {
  await Promise.all([
    supabaseUpsert("projects", store.projects.map((project) => ({
      id: project.id,
      name: project.name,
      language: project.language,
      bot_token: project.botToken || null,
      chat_id: project.chatId || null,
      link: project.link,
      broker_label: project.brokerLabel,
      signal_templates: project.signalTemplates || null,
      message_templates: project.messageTemplates || null,
      telegram_account: project.telegramAccount || null,
      enabled: project.enabled,
      updated_at: new Date().toISOString(),
    }))),
    supabaseUpsert("auto_messages", store.messages.map((message) => ({ id: message.id, payload: message, updated_at: new Date().toISOString() }))),
    supabaseUpsert("send_logs", store.logs.map(logRow)),
    supabaseUpsert("schedule_keys", store.sentScheduleKeys.map((key) => ({ id: key, created_at: new Date().toISOString() }))),
    supabaseUpsert("capture_sessions", store.captureSessions.map((session) => ({ id: session.id, project_id: session.projectId, status: session.status, payload: session, updated_at: new Date().toISOString() }))),
  ]);
}

export async function saveSignalChanges(store: AppStore, changedSignals: ScheduledSignal[]) {
  if (hasSupabase()) {
    await supabaseUpsert("signals", changedSignals.map(signalRow));
    return;
  }
  await saveStore(store);
}

export async function saveScheduleChanges(
  store: AppStore,
  changedSignals: ScheduledSignal[],
  changedLogs: SendLog[],
  newScheduleKeys: string[],
) {
  if (hasSupabase()) {
    await Promise.all([
      supabaseUpsert("signals", changedSignals.map(signalRow)),
      supabaseUpsert("send_logs", changedLogs.map(logRow)),
      supabaseUpsert("schedule_keys", newScheduleKeys.map((key) => ({ id: key, created_at: new Date().toISOString() }))),
    ]);
    return;
  }
  await saveStore(store);
}

export async function appendLog(log: SendLog) {
  const store = await loadStore();
  store.logs = [log, ...store.logs].slice(0, 1000);
  if (hasSupabase()) {
    await supabaseUpsert("send_logs", [logRow(log)]);
    return;
  }
  await saveStore(store);
}

export async function deleteSignalsByIds(ids: string[]) {
  if (!ids.length || !hasSupabase()) return;
  const chunkSize = 100;
  for (let index = 0; index < ids.length; index += chunkSize) {
    const quoted = ids.slice(index, index + chunkSize).map((id) => `"${id.replace(/"/g, "")}"`).join(",");
    await supabaseDelete("signals", `id=in.(${quoted})`);
  }
}

function signalRow(signal: ScheduledSignal) {
  return {
    id: signal.id,
    date_key: signal.dateKey,
    project_id: signal.projectId,
    pair: signal.pair,
    market: signal.market,
    direction: signal.direction,
    signal_time: signal.time,
    expiry_minutes: signal.expiryMinutes,
    reentries: signal.reentries,
    source_text: signal.sourceText,
    created_at: signal.createdAt,
    sent_at: signal.sentAt || null,
    message_id: signal.messageId || null,
    error: signal.error || null,
  };
}

function logRow(log: SendLog) {
  return { id: log.id, at: log.at, project_id: log.projectId, status: log.status, payload: log };
}

export function scheduledKey(dateKey: string, time: string, messageId: string, projectId: string) {
  return `${dateKey}:${time}:${messageId}:${projectId}`;
}
