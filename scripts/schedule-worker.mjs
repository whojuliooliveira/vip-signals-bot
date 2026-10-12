const intervalMs = Number(process.env.WORKER_INTERVAL_MS || 20_000);
const appUrl = (process.env.PUBLIC_APP_URL || process.env.APP_URL || "").replace(/\/$/, "");
const secret = process.env.CRON_SECRET || process.env.ADMIN_PASSWORD || "";

if (!appUrl) {
  console.error("PUBLIC_APP_URL não configurado.");
  process.exit(1);
}

if (!secret) {
  console.error("CRON_SECRET não configurado.");
  process.exit(1);
}

let running = false;

async function tick() {
  if (running) return;
  running = true;
  const startedAt = new Date();

  try {
    const response = await fetch(`${appUrl}/api/run-schedule`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
      },
      signal: AbortSignal.timeout(55_000),
    });
    const body = await response.text();

    if (!response.ok) {
      console.error(`[${startedAt.toISOString()}] Falhou (${response.status}): ${body.slice(0, 500)}`);
      return;
    }

    const payload = JSON.parse(body);
    if (payload.due || payload.results?.some((item) => item.error)) {
      console.log(`[${startedAt.toISOString()}]`, JSON.stringify(payload));
    }
  } catch (error) {
    console.error(`[${startedAt.toISOString()}] Erro no worker:`, error instanceof Error ? error.message : error);
  } finally {
    running = false;
  }
}

console.log(`Worker de sinais ligado: ${appUrl} a cada ${Math.round(intervalMs / 1000)}s`);
await tick();
setInterval(tick, intervalMs);
