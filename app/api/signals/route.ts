import { NextRequest, NextResponse } from "next/server";
import { parseSignalInput, scheduledSendAtMsForOperation, sortSignalsByOperationDate } from "../../../lib/signals";
import { deleteSignalsByIds, loadStore, localDateKey, saveStore, uid, type ScheduledSignal } from "../../../lib/store";

export async function POST(request: NextRequest) {
  const body = await request.json();

  const selectedProjectId = String(body.projectId || "");
  if (!selectedProjectId || selectedProjectId === "auto") return NextResponse.json({ ok: false, error: "Selecione inglês ou espanhol" }, { status: 400 });

  const dateKey = String(body.dateKey || localDateKey());
  const parsedResult = parseSignalInput(String(body.rawText || ""));
  if (parsedResult.errors.length) {
    return NextResponse.json({ ok: false, error: "Corrija as linhas inválidas antes de subir.", parsed: parsedResult.signals, errors: parsedResult.errors }, { status: 400 });
  }
  const parsed = parsedResult.signals;
  const store = await loadStore();
  const pending = store.signals.filter((signal) => signal.projectId === selectedProjectId && signal.dateKey === dateKey && !signal.sentAt);
  const incomingKeys = new Set(parsed.map((signal) => `${dateKey}:${selectedProjectId}:${signal.pair}:${signal.market}:${signal.direction}:${signal.time}`));
  const wouldRemove = pending.filter((signal) => !incomingKeys.has(`${signal.dateKey}:${signal.projectId}:${signal.pair}:${signal.market}:${signal.direction}:${signal.time}`));

  if (wouldRemove.length && !body.confirmReplace) {
    return NextResponse.json({
      ok: false,
      requiresConfirmation: true,
      error: `Essa importação remove ${wouldRemove.length} sinal(is) pendente(s) da fila atual.`,
      impact: { remove: wouldRemove.length, keep: pending.length - wouldRemove.length },
      parsed,
      errors: [],
    }, { status: 409 });
  }

  if (body.confirmReplace) {
    store.signals = store.signals.filter((signal) => signal.projectId !== selectedProjectId || signal.dateKey !== dateKey || Boolean(signal.sentAt));
    await deleteSignalsByIds(wouldRemove.map((signal) => signal.id));
  }

  const existing = new Set(store.signals.map((signal) => `${signal.dateKey}:${signal.projectId}:${signal.pair}:${signal.market}:${signal.direction}:${signal.time}`));
  const created: ScheduledSignal[] = [];
  const skippedPast = [];
  const nowMs = Date.now();

  for (const signal of parsed) {
    const projectId = selectedProjectId;
    if (scheduledSendAtMsForOperation(dateKey, signal.time) <= nowMs) {
      skippedPast.push(signal);
      continue;
    }
    const key = `${dateKey}:${projectId}:${signal.pair}:${signal.market}:${signal.direction}:${signal.time}`;
    if (existing.has(key)) continue;
    created.push({
      id: uid("sig"),
      dateKey,
      projectId,
      pair: signal.pair,
      market: signal.market,
      direction: signal.direction,
      time: signal.time,
      expiryMinutes: Number(signal.expiryMinutes || body.expiryMinutes || 5),
      reentries: Number(body.reentries || 2),
      sourceText: signal.sourceText,
      createdAt: new Date().toISOString(),
    });
  }

  store.signals = sortSignalsByOperationDate([...store.signals, ...created]);
  await saveStore(store);
  return NextResponse.json({ ok: true, parsed, errors: [], created, skippedPast, signals: store.signals });
}
