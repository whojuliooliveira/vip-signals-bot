import { NextRequest, NextResponse } from "next/server";
import { isSignalExpired, parseSignalInput, sortSignalsByOperationDate, validateSignalTime } from "../../../lib/signals";
import { deleteSignalList, deleteSignalsByIds, loadSignalList, loadStore, localDateKey, saveSignalChanges, uid, type ScheduledSignal } from "../../../lib/store";

export async function POST(request: NextRequest) {
  const body = await request.json();

  const selectedProjectId = String(body.projectId || "");
  if (!selectedProjectId || selectedProjectId === "auto") return NextResponse.json({ ok: false, error: "Selecione inglês ou espanhol" }, { status: 400 });

  const dateKey = String(body.dateKey || localDateKey());
  const parsedResult = parseSignalInput(String(body.rawText || ""), { includeOutOfCriteria: true });
  if (parsedResult.errors.length) {
    return NextResponse.json({ ok: false, error: "Corrija as linhas inválidas antes de subir.", parsed: parsedResult.signals, errors: parsedResult.errors }, { status: 400 });
  }
  const parsed = parsedResult.signals;
  const store = await loadStore();
  const currentList = await loadSignalList(selectedProjectId, dateKey, store);
  const pending = currentList.filter((signal) => !signal.sentAt);
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
    const removeIds = new Set(wouldRemove.map((signal) => signal.id));
    store.signals = store.signals.filter((signal) => !removeIds.has(signal.id));
  }

  const removedIds = new Set(wouldRemove.map((signal) => signal.id));
  const existing = new Set(currentList
    .filter((signal) => !removedIds.has(signal.id))
    .map((signal) => `${signal.dateKey}:${signal.projectId}:${signal.pair}:${signal.market}:${signal.direction}:${signal.time}`));
  const created: ScheduledSignal[] = [];

  for (const signal of parsed) {
    const projectId = selectedProjectId;
    const key = `${dateKey}:${projectId}:${signal.pair}:${signal.market}:${signal.direction}:${signal.time}`;
    if (existing.has(key)) continue;
    const validationError = validateSignalTime(signal.time, dateKey);
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
      manualOnly: Boolean(validationError),
      validationError: validationError || undefined,
    });
    existing.add(key);
  }

  store.signals = sortSignalsByOperationDate([...store.signals, ...created]);
  // Persist only this import. Re-saving the complete historical store makes large
  // lists exceed the serverless request window and can leave a partial import.
  await saveSignalChanges(store, created);
  // New rows go first: if removal fails, the previous list remains visible instead
  // of disappearing before the replacement has been safely stored.
  if (body.confirmReplace) await deleteSignalsByIds(wouldRemove.map((signal) => signal.id));
  const expired = created.filter((signal) => isSignalExpired(signal.dateKey, signal.time)).length;
  return NextResponse.json({ ok: true, createdCount: created.length, expired });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const projectId = String(body.projectId || "");
  const dateKey = String(body.dateKey || "");
  if (!projectId || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return NextResponse.json({ ok: false, error: "Canal ou data inválidos." }, { status: 400 });
  }

  const store = await loadStore();
  const removed = await loadSignalList(projectId, dateKey, store);
  store.signals = store.signals.filter((signal) => signal.projectId !== projectId || signal.dateKey !== dateKey);
  await deleteSignalList(projectId, dateKey);
  await saveSignalChanges(store, []);

  return NextResponse.json({ ok: true, deleted: removed.length });
}
