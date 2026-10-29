import type { ScheduledSignal } from "./store";

const GANANCIA_PROJECT_ID = "expert_a";
const DEFAULT_SYNC_URL = "https://www.gananciaapp.com/api/internal/signals/sync";

function getSyncConfig() {
  const url = process.env.GANANCIA_APP_SYNC_URL || DEFAULT_SYNC_URL;
  const secret = process.env.GANANCIA_APP_SYNC_SECRET;
  if (!secret) throw new Error("Integração com Ganancia App não configurada.");
  return { url, secret };
}

function normalizePair(pair: string, market: string) {
  const clean = pair.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  return market.toUpperCase() === "OTC" ? `${clean}-OTC` : clean;
}

function normalizedRawText(signals: ScheduledSignal[]) {
  const otc = signals.filter((signal) => signal.market.toUpperCase() === "OTC");
  const open = signals.filter((signal) => signal.market.toUpperCase() !== "OTC");
  const lines = (items: ScheduledSignal[]) => items.map((signal) =>
    `M${signal.expiryMinutes || 5};${normalizePair(signal.pair, signal.market)};${signal.time};${signal.direction === "UP" ? "CALL" : "PUT"}`
  );
  return [
    ...(otc.length ? ["*OTC*", ...lines(otc)] : []),
    ...(open.length ? ["", "*MERCADO ABERTO*", ...lines(open)] : []),
  ].join("\n");
}

async function requestWithRetry(method: "POST" | "DELETE", body: unknown) {
  const { url, secret } = getSyncConfig();
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || `Ganancia App respondeu HTTP ${response.status}.`);
      }
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Falha desconhecida na sincronização.");
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 700));
    }
  }

  throw lastError || new Error("Não foi possível sincronizar com o Ganancia App.");
}

export function shouldSyncWithGanancia(projectId: string) {
  return projectId === GANANCIA_PROJECT_ID;
}

export async function syncGananciaSignalList(dateKey: string, signals: ScheduledSignal[]) {
  const ordered = [...signals].sort((a, b) => a.time.localeCompare(b.time) || a.pair.localeCompare(b.pair));
  return requestWithRetry("POST", {
    day: dateKey,
    rawText: normalizedRawText(ordered),
    signals: ordered.map((signal) => ({
      pair: normalizePair(signal.pair, signal.market),
      timeframe: `M${signal.expiryMinutes || 5}`,
      time_hhmm: signal.time,
      minutes_since_midnight: Number(signal.time.slice(0, 2)) * 60 + Number(signal.time.slice(3, 5)),
      direction: signal.direction === "UP" ? "CALL" : "PUT",
      category: signal.market.toUpperCase() === "OTC" ? "OTC" : "MERCADO_ABERTO",
    })),
  });
}

export async function deleteGananciaSignalList(dateKey: string) {
  return requestWithRetry("DELETE", { day: dateKey });
}
