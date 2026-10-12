import type { Direction } from "./templates";

export type ParsedSignal = {
  pair: string;
  market: string;
  direction: Direction;
  time: string;
  expiryMinutes?: number;
  projectId?: string;
  platform?: "quotex" | "pocket";
  sourceText: string;
  validationError?: string;
};

export type SignalParseError = {
  lineNumber: number;
  line: string;
  error: string;
};

export type SignalParseResult = {
  signals: ParsedSignal[];
  errors: SignalParseError[];
};

type ParseSignalOptions = {
  includeOutOfCriteria?: boolean;
};

const directionMap: Record<string, Direction> = {
  UP: "UP",
  CALL: "UP",
  BUY: "UP",
  ARRIBA: "UP",
  ALTO: "UP",
  COMPRA: "UP",
  DOWN: "DOWN",
  PUT: "DOWN",
  SELL: "DOWN",
  ABAJO: "DOWN",
  BAIXO: "DOWN",
  VENDA: "DOWN",
};

const allowedSignalMinutes = new Set(["00", "05", "25", "30", "35", "55"]);
const operationStart = "07:20";
const operationEnd = "03:30";
const signalLeadMinutes = 5;
const signalGraceMinutes = 5;

export function parseSignalInput(input: string, options: ParseSignalOptions = {}): SignalParseResult {
  const signals: ParsedSignal[] = [];
  const errors: SignalParseError[] = [];
  const seen = new Set<string>();
  let platform: ParsedSignal["platform"];

  for (const [index, rawLine] of input.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || /^[-_=]{3,}$/.test(line)) continue;

    const title = line.match(/^\*+\s*(.+?)\s*\*+$/)?.[1]?.toUpperCase();
    if (title) {
      if (title.includes("QUOTEX")) platform = "quotex";
      if (title.includes("POCKET")) platform = "pocket";
      continue;
    }

    const semicolon = line.match(/^M(\d+)\s*;\s*([A-Z]{6,})-?OTC\s*;\s*((?:[01]?\d|2[0-3]):[0-5]\d)\s*;\s*(PUT|CALL|BUY|SELL)$/i);
    if (semicolon) {
      const expiryMinutes = Number(semicolon[1]);
      const pair = formatPair(semicolon[2]);
      const time = normalizeTime(semicolon[3]);
      const direction = directionMap[semicolon[4].toUpperCase()];
      const timeError = validateSignalTime(time);
      if (timeError && !options.includeOutOfCriteria) {
        errors.push({ lineNumber: index + 1, line, error: timeError });
        continue;
      }
      const projectId = platform === "quotex" ? "expert_a" : platform === "pocket" ? "expert_b" : undefined;
      const key = `${projectId || "manual"}:${pair}:OTC:${direction}:${time}`;
      if (seen.has(key)) continue;
      seen.add(key);
      signals.push({ pair, market: "OTC", direction, time, expiryMinutes, projectId, platform, sourceText: line, validationError: timeError || undefined });
      continue;
    }

    const pair = line.match(/\b[A-Z]{3}\s*\/\s*[A-Z]{3}\b/i)?.[0].replace(/\s+/g, "").toUpperCase();
    const time = normalizeTime(line.match(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/)?.[0] || "");
    const directionWord = line.match(/\b(UP|DOWN|CALL|PUT|BUY|SELL|ARRIBA|ABAJO|ALTO|BAIXO|COMPRA|VENDA)\b/i)?.[1]?.toUpperCase();
    if (!pair || !time || !directionWord) {
      if (looksLikeSignal(line)) {
        errors.push({ lineNumber: index + 1, line, error: "Linha parece sinal, mas faltou ativo, horário ou direção reconhecida." });
      }
      continue;
    }

    const timeError = validateSignalTime(time);
    if (timeError && !options.includeOutOfCriteria) {
      errors.push({ lineNumber: index + 1, line, error: timeError });
      continue;
    }
    const direction = directionMap[directionWord];
    const market = line.match(/\bOTC\b/i)?.[0]?.toUpperCase() || "OTC";
    const key = `${pair}:${market}:${direction}:${time}`;
    if (seen.has(key)) continue;
    seen.add(key);
    signals.push({ pair, market, direction, time, sourceText: line, validationError: timeError || undefined });
  }

  return { signals: signals.sort((a, b) => signalSortValue(a.time) - signalSortValue(b.time)), errors };
}

export function parseSignals(input: string): ParsedSignal[] {
  return parseSignalInput(input).signals;
}

function normalizeTime(value: string) {
  const match = value.match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return "";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function formatPair(value: string) {
  const clean = value.replace(/[^A-Z]/gi, "").toUpperCase();
  if (clean.length === 6) return `${clean.slice(0, 3)}/${clean.slice(3)}`;
  return clean;
}

function looksLikeSignal(line: string) {
  const hasSeparatorFormat = /^M\d+\s*;/i.test(line) || line.includes(";");
  const hasTime = /\b(?:[01]?\d|2[0-3]):[0-5]\d\b/.test(line);
  const hasAsset = /\b[A-Z]{6,}(?:-?OTC)?\b|\b[A-Z]{3}\s*\/\s*[A-Z]{3}\b/i.test(line);
  return hasSeparatorFormat || (hasTime && hasAsset);
}

export function validateSignalTime(time: string) {
  if (!time) return "Horário inválido.";
  const minute = time.slice(3, 5);
  if (!isSignalTimeInTradingWindow(time)) {
    return `Horário fora da operação. Use sinais entre ${operationStart} e ${operationEnd} UTC-3.`;
  }
  if (!allowedSignalMinutes.has(minute)) {
    return "Minuto não permitido. Use apenas horários terminados em :55, :00, :05, :25, :30 ou :35.";
  }
  return "";
}

export function isSignalTimeInTradingWindow(time: string) {
  const minutes = timeToMinutes(time);
  const start = timeToMinutes(operationStart);
  const end = timeToMinutes(operationEnd);
  return minutes >= start || minutes <= end;
}

export function isOvernightSignalTime(time: string) {
  const minutes = timeToMinutes(time);
  return minutes >= 0 && minutes <= timeToMinutes(operationEnd);
}

export function operationDateKeyForRuntime(dateKey: string, time: string) {
  return isOvernightSignalTime(time) ? addDays(dateKey, -1) : dateKey;
}

export function scheduledAtMsForOperation(dateKey: string, time: string) {
  const sendDateKey = isOvernightSignalTime(time) ? addDays(dateKey, 1) : dateKey;
  return new Date(`${sendDateKey}T${time}:00-03:00`).getTime();
}

export function scheduledSendAtMsForOperation(dateKey: string, time: string) {
  return scheduledAtMsForOperation(dateKey, time) - signalLeadMinutes * 60_000;
}

export function signalDueDateKeyForRuntime(dateKey: string, time: string) {
  return formatSaoPauloDateKey(new Date(scheduledSendAtMsForOperation(dateKey, time)));
}

export function signalDueTimeForRuntime(dateKey: string, time: string) {
  return formatSaoPauloTime(new Date(scheduledSendAtMsForOperation(dateKey, time)));
}

export function isSignalDueNow(dateKey: string, time: string, now = new Date()) {
  const dueAt = scheduledSendAtMsForOperation(dateKey, time);
  const elapsed = now.getTime() - dueAt;
  return elapsed >= 0 && elapsed <= signalGraceMinutes * 60_000;
}

export function signalSendWindowExpiresAtMs(dateKey: string, time: string) {
  return scheduledSendAtMsForOperation(dateKey, time) + signalGraceMinutes * 60_000;
}

export function sortSignalsByOperationDate<T extends { dateKey: string; time: string }>(signals: T[]) {
  return [...signals].sort((a, b) => scheduledSendAtMsForOperation(a.dateKey, a.time) - scheduledSendAtMsForOperation(b.dateKey, b.time));
}

function signalSortValue(time: string) {
  const minutes = timeToMinutes(time);
  return isOvernightSignalTime(time) ? minutes + 24 * 60 : minutes;
}

function timeToMinutes(time: string) {
  const match = time.match(/^(\d{2}):(\d{2})$/);
  if (!match) return Number.NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

function addDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatSaoPauloDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatSaoPauloTime(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
