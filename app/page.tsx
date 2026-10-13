"use client";

import { AlertCircle, ArrowDownLeft, ArrowUpRight, Check, ChevronDown, Clock3, Import, ListChecks, Loader2, Moon, Radio, Send, Settings, Sun, Sunrise, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { isSignalExpired, parseSignalInput, validateSignalTime } from "../lib/signals";
import type { CaptureSession, DayMode, MessageKind, ProjectSettings, SavedMessage, ScheduledSignal, SendLog, TemplateKind, Weekday } from "../lib/store";

type Project = ProjectSettings & { botTokenConfigured?: boolean };
type Notice = { text: string; error?: boolean };
const dateInBrazil = (date = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const timeInBrazil = (date: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(date));
const labels: Record<TemplateKind, string> = { signal_up: "CALL / BUY", signal_down: "PUT / SELL", morning_emoji: "Emoji de abertura", good_morning: "Bom dia", analysis_start: "Início das análises", good_night: "Boa noite" };
const standardKinds = ["morning_emoji", "good_morning", "analysis_start", "good_night"] as const;
const messageIcons = { morning_emoji: Sunrise, good_morning: Sun, analysis_start: Radio, good_night: Moon };
const days: [DayMode, string][] = [["weekday", "Seg–Sex"], ["saturday", "Sábado"], ["sunday", "Domingo"]];
const weekdays: [Weekday, string][] = [["monday", "Seg"], ["tuesday", "Ter"], ["wednesday", "Qua"], ["thursday", "Qui"], ["friday", "Sex"], ["saturday", "Sáb"], ["sunday", "Dom"]];

async function requestJson(url: string, body?: unknown) {
  const response = await fetch(url, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || "Não foi possível concluir. Tente novamente.");
  return result;
}

export default function Home() {
  const [tab, setTab] = useState<"lista" | "config">("lista");
  const [projects, setProjects] = useState<Project[]>([]);
  const [messages, setMessages] = useState<SavedMessage[]>([]);
  const [signals, setSignals] = useState<ScheduledSignal[]>([]);
  const [logs, setLogs] = useState<SendLog[]>([]);
  const [projectId, setProjectId] = useState("expert_b");
  const [dateKey, setDateKey] = useState(() => dateInBrazil());
  const [filter, setFilter] = useState<"all" | "auto" | "manual">("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [workerLastSeen, setWorkerLastSeen] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [workerDetail, setWorkerDetail] = useState(false);
  const [rawText, setRawText] = useState("");
  const [replaceWarning, setReplaceWarning] = useState("");
  const [importError, setImportError] = useState("");
  const [manualResults, setManualResults] = useState<Record<string, { sent?: boolean; error?: string }>>({});
  const [captureKind, setCaptureKind] = useState<TemplateKind>("signal_down");
  const [captureSession, setCaptureSession] = useState<CaptureSession | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const importButtonRef = useRef<HTMLButtonElement>(null);
  const dirty = useRef(false);
  const revision = useRef(0);
  const actionPending = useRef(false);
  const selected = projects.find((project) => project.id === projectId);
  const parsed = useMemo(() => parseSignalInput(rawText, { includeOutOfCriteria: true }), [rawText]);
  const automatic = (signal: ScheduledSignal) => !signal.manualOnly && !signal.validationError && !validateSignalTime(signal.time);
  const dailySignals = useMemo(() => signals.filter((signal) => signal.projectId === projectId && signal.dateKey === dateKey).sort((a, b) => a.time.localeCompare(b.time) || a.pair.localeCompare(b.pair)), [signals, projectId, dateKey]);
  const visibleSignals = dailySignals.filter((signal) => filter === "all" || (filter === "auto" ? automatic(signal) : !automatic(signal)));
  const recentLogs = logs.filter((log) => log.projectId === projectId).slice(0, 5);
  const connected = Boolean(workerLastSeen && now - Date.parse(workerLastSeen) < 120000);

  async function loadConfig(initial = false) {
    try {
      const result = await requestJson("/api/config");
      if (!dirty.current) { setProjects(result.projects || []); setMessages(result.messages || []); }
      setSignals(result.signals || []);
      setLogs(result.logs || []);
      setWorkerLastSeen(result.workerLastSeen || null);
    } catch (error) {
      if (initial) setNotice({ text: error instanceof Error ? error.message : "Erro ao carregar", error: true });
    } finally { setLoading(false); }
  }

  useEffect(() => {
    loadConfig(true);
    const timer = setInterval(() => { setNow(Date.now()); loadConfig(); }, 12000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!dirty.current) return;
    const currentRevision = revision.current;
    const timer = setTimeout(async () => {
      setSaveState("saving");
      try {
        await requestJson("/api/config", { projects, messages });
        if (currentRevision === revision.current) { dirty.current = false; setSaveState("saved"); }
      } catch (error) {
        setSaveState("error");
        setNotice({ text: error instanceof Error ? error.message : "Erro ao salvar", error: true });
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [projects, messages]);

  useEffect(() => {
    if (!notice || notice.error) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (captureSession?.status !== "waiting") return;
    let polling = false;
    const timer = setInterval(async () => {
      if (polling) return;
      polling = true;
      try {
        const result = await requestJson(`/api/templates/capture?sessionId=${encodeURIComponent(captureSession.id)}`);
        setCaptureSession(result.session);
        if (result.session.status === "captured") { setNotice({ text: "Modelo capturado e salvo." }); await loadConfig(); }
        if (["expired", "failed"].includes(result.session.status)) setNotice({ text: result.session.error || "Captura encerrada.", error: true });
      } catch (error) { setNotice({ text: error instanceof Error ? error.message : "Erro na captura", error: true }); }
      finally { polling = false; }
    }, 2500);
    return () => clearInterval(timer);
  }, [captureSession?.id, captureSession?.status]);

  function markDirty() { dirty.current = true; revision.current += 1; setSaveState("saving"); }
  function patchProject(patch: Partial<Project>) { markDirty(); setProjects((items) => items.map((item) => item.id === projectId ? { ...item, ...patch } : item)); }
  function patchMessage(id: string, patch: Partial<SavedMessage>) { markDirty(); setMessages((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item)); }
  function closeImport() { if (busy === "import") return; dialogRef.current?.close(); importButtonRef.current?.focus(); }
  function openImport() { setReplaceWarning(""); setImportError(""); dialogRef.current?.showModal(); }

  async function uploadList(confirmReplace = false) {
    if (actionPending.current || !parsed.signals.length || parsed.errors.length) return;
    actionPending.current = true; setBusy("import"); setImportError("");
    try {
      const response = await fetch("/api/signals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, dateKey, rawText, confirmReplace }) });
      const result = await response.json();
      if (result.requiresConfirmation) { setReplaceWarning(result.error || "Já existe uma lista para esta data."); return; }
      if (!result.ok) throw new Error(result.error || "Erro ao importar");
      setRawText(""); setReplaceWarning(""); dialogRef.current?.close(); importButtonRef.current?.focus();
      setNotice({ text: `${result.created?.length || 0} sinais salvos.${result.expired ? ` ${result.expired} já estavam expirados e ficaram disponíveis apenas para envio manual.` : ""}` });
      await loadConfig();
    } catch (error) { setImportError(error instanceof Error ? error.message : "Erro ao importar"); }
    finally { setBusy(""); actionPending.current = false; }
  }

  async function sendSignalNow(signal: ScheduledSignal) {
    if (actionPending.current) return;
    actionPending.current = true; setBusy(signal.id);
    try {
      await requestJson("/api/send-signal", { kind: "signal", projectId: signal.projectId, pair: signal.pair, market: signal.market, direction: signal.direction, time: signal.time, expiryMinutes: signal.expiryMinutes || 5, reentries: signal.reentries ?? 2, includeInlineButton: true });
      setManualResults((items) => ({ ...items, [signal.id]: { sent: true } }));
      setNotice({ text: `${signal.pair} · ${signal.time} enviado.` }); await loadConfig();
    } catch (error) {
      const text = error instanceof Error ? error.message : "Erro ao enviar";
      setManualResults((items) => ({ ...items, [signal.id]: { error: text } })); setNotice({ text, error: true });
    } finally { setBusy(""); actionPending.current = false; }
  }

  async function sendStandardNow(kind: MessageKind) {
    if (actionPending.current) return;
    actionPending.current = true; setBusy(kind);
    try { await requestJson("/api/send-message", { projectId, kind }); setNotice({ text: `${labels[kind as TemplateKind] || "Mensagem"} enviada ao canal.` }); await loadConfig(); }
    catch (error) { setNotice({ text: error instanceof Error ? error.message : "Erro ao enviar", error: true }); }
    finally { setBusy(""); actionPending.current = false; }
  }

  async function startCapture() {
    if (actionPending.current) return;
    actionPending.current = true; setBusy("capture");
    try {
      const result = await requestJson("/api/templates/capture", { projectId, kind: captureKind });
      setCaptureSession(result.session); setNotice({ text: result.instruction });
    } catch (error) { setNotice({ text: error instanceof Error ? error.message : "Erro na captura", error: true }); }
    finally { setBusy(""); actionPending.current = false; }
  }

  return <div className="console">
    <header className="app-header">
      <a className="brand" href="/" aria-label="DMS Sinais"><img src="/logo-dms-transparent.png" alt="DMS" /><span>SINAIS</span></a>
      <nav aria-label="Navegação principal">
        <button className={tab === "lista" ? "selected" : ""} onClick={() => setTab("lista")}><ListChecks size={16} />Lista do dia</button>
        <button className={tab === "config" ? "selected" : ""} onClick={() => setTab("config")}><Settings size={16} />Configurações</button>
      </nav>
      <span className="header-timezone"><Clock3 size={14} /> Brasília · UTC−3</span>
    </header>
    <main>
      <div className="page-heading"><h1>{tab === "lista" ? "Lista do dia" : "Configurações"}</h1>
        <div className="connection-wrap"><button className={`connection ${connected ? "online" : "offline"}`} aria-expanded={workerDetail} onClick={() => setWorkerDetail(!workerDetail)}><span className="status-dot" />{loading ? "Verificando automático" : connected ? "Automático conectado" : "Automático sem confirmação"}<ChevronDown size={14} /></button>
          {workerDetail && <div className="connection-detail" role="status">{workerLastSeen ? `Última atividade: ${timeInBrazil(workerLastSeen)} · ${dateInBrazil(new Date(workerLastSeen))}` : "Nenhuma atividade recente registrada."}<br />Horário de Brasília</div>}
        </div>
      </div>
      <div className="toolbar">
        <label className="channel-field">Canal<select value={projectId} disabled={loading || !!busy} onChange={(event) => setProjectId(event.target.value)}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        {tab === "lista" ? <><label className="date-field">Data<input aria-label="Data da lista" type="date" value={dateKey} disabled={!!busy} onChange={(event) => setDateKey(event.target.value)} /></label><button ref={importButtonRef} className="primary import-button" disabled={loading || !!busy || !selected} onClick={openImport}><Import size={16} />Importar lista</button></> : <span className={`save-indicator ${saveState}`}>{saveState === "saving" ? "Salvando…" : saveState === "error" ? "Erro ao salvar" : "Alterações salvas"}</span>}
      </div>

      {tab === "lista" ? <div className="workspace">
        <section className="signals-section" aria-label="Sinais da data">
          <div className="list-heading"><div className="filters" role="group" aria-label="Filtrar sinais">{([["all", "Todos"], ["auto", "Automáticos"], ["manual", "Manuais"]] as const).map(([value, label]) => <button aria-pressed={filter === value} className={filter === value ? "active" : ""} key={value} onClick={() => setFilter(value)}>{label}</button>)}</div><span className="count">{visibleSignals.length} sinais</span></div>
          {loading ? <div className="empty"><Loader2 className="spin" size={22} /><p>Carregando sinais…</p></div> : visibleSignals.length === 0 ? <div className="empty"><ListChecks size={28} /><h2>{dailySignals.length ? "Nenhum sinal neste filtro" : "Nenhum sinal nesta data"}</h2>{!dailySignals.length && <button onClick={openImport}><Import size={16} />Importar lista</button>}</div> : <table className="signals-table"><thead><tr><th>Horário</th><th>Ativo</th><th>Direção</th><th>Automático</th><th>Status</th><th><span className="sr-only">Enviar</span></th></tr></thead><tbody>
            {visibleSignals.map((signal) => {
              const isAuto = automatic(signal);
              const result = manualResults[signal.id];
              const error = result?.error || (!result?.sent && signal.error);
              const sent = result?.sent || signal.sentAt;
              const expired = !sent && !error && isSignalExpired(signal.dateKey, signal.time, new Date(now));
              const state = sent ? "Enviado" : error ? "Erro" : expired ? "Expirado" : isAuto ? "Aguardando" : "Manual";
              return <tr key={signal.id}>
                <td data-label="Horário" className="signal-time">{signal.time}</td>
                <td data-label="Ativo" className="asset"><strong>{signal.pair}</strong><small>{signal.market}</small></td>
                <td data-label="Direção"><span className={`direction ${signal.direction === "UP" ? "buy" : "sell"}`}>{signal.direction === "UP" ? <ArrowUpRight size={15} /> : <ArrowDownLeft size={15} />}{signal.direction === "UP" ? "CALL / BUY" : "PUT / SELL"}</span></td>
                <td data-label="Automático" className="auto-cell">{isAuto ? "Sim" : "Não"}</td>
                <td data-label="Status">{error && !sent ? <button className="error-link" onClick={() => setNotice({ text: String(error), error: true })}><AlertCircle size={14} />Erro</button> : <span className={`signal-status ${sent ? "sent" : expired ? "expired" : ""}`}>{sent && <Check size={14} />}{state}</span>}</td>
                <td className="send-cell"><button disabled={!!busy || !selected?.chatId} onClick={() => sendSignalNow(signal)} aria-label={`Enviar agora ${signal.pair} ${signal.time}`}>{busy === signal.id ? <Loader2 size={14} className="spin" /> : <Send size={14} />}{busy === signal.id ? "Enviando…" : "Enviar agora"}</button></td>
              </tr>;
            })}
          </tbody></table>}
        </section>
        <aside className="activity-sidebar">
          <section><h2>Mensagens padrão</h2><div className="standard-list">{standardKinds.map((kind) => { const Icon = messageIcons[kind]; return <div className="standard-row" key={kind}><Icon size={17} /><span>{labels[kind]}</span><button disabled={!!busy || !selected?.chatId} onClick={() => sendStandardNow(kind)} aria-label={`Testar ${labels[kind]}`}>{busy === kind ? <Loader2 size={14} className="spin" /> : <Send size={14} />}Testar</button></div>; })}</div></section>
          <section className="recent-section"><h2>Últimos envios</h2>{!recentLogs.length ? <p className="subtle">Nenhum envio registrado.</p> : <ol className="recent-list">{recentLogs.map((log) => <li key={log.id}><div className={`log-icon ${log.status}`}>{log.status === "sent" ? <Check size={14} /> : <AlertCircle size={14} />}</div><div><strong>{log.kind === "signal" ? log.label : labels[log.kind as TemplateKind] || log.label}</strong><span>{log.source === "manual" ? "Manual" : "Automático"} · {log.status === "sent" ? "Enviado" : "Erro"}</span>{log.error && <button className="error-link" onClick={() => setNotice({ text: log.error!, error: true })}>Ver erro</button>}</div><time title={new Date(log.at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}>{timeInBrazil(log.at)}</time></li>)}</ol>}</section>
        </aside>
      </div> : selected && <div className="settings-sections" key={projectId}>
        <details><summary>Canal<ChevronDown size={16} /></summary><div className="settings-body fields-grid">
          <label className="wide">Nome<input value={selected.name} onChange={(event) => patchProject({ name: event.target.value })} /></label>
          <label className="wide">Link do broker<input value={selected.link} onChange={(event) => patchProject({ link: event.target.value })} /></label>
          <label>Texto do botão<input value={selected.brokerLabel} onChange={(event) => patchProject({ brokerLabel: event.target.value })} /></label>
          <label className="checkbox"><input type="checkbox" checked={selected.enabled} onChange={(event) => patchProject({ enabled: event.target.checked })} />Canal ativo</label>
        </div></details>
        <details><summary>Automação<ChevronDown size={16} /></summary><div className="settings-body"><div className="schedule-scroll"><table className="schedule-table"><thead><tr><th>Mensagem</th>{days.map(([day, label]) => <th key={day}>{label}</th>)}<th>Ativo</th></tr></thead><tbody>{messages.map((message) => <tr key={message.id}><td>{labels[message.kind as TemplateKind] || message.label}</td>{message.timeByWeekday ? <td colSpan={3} className="subtle">Horários por dia da semana ↓</td> : days.map(([day, label]) => <td key={day}><input type="time" aria-label={`${message.label} ${label}`} value={message.timeByDay[day] || ""} onChange={(event) => patchMessage(message.id, { timeByDay: { ...message.timeByDay, [day]: event.target.value } })} /></td>)}<td><input type="checkbox" aria-label={`Ativar ${message.label}`} checked={message.enabled} onChange={(event) => patchMessage(message.id, { enabled: event.target.checked })} /></td></tr>)}</tbody></table></div>
          {messages.filter((message) => message.timeByWeekday).map((message) => <div className="weekday-schedule" key={message.id}><h3>{labels[message.kind as TemplateKind] || message.label}</h3><div>{weekdays.map(([day, label]) => <label key={day}>{label}<input type="time" aria-label={`${message.label} ${label}`} value={message.timeByWeekday?.[day] || ""} onChange={(event) => patchMessage(message.id, { timeByWeekday: { ...message.timeByWeekday, [day]: event.target.value } })} /></label>)}</div></div>)}
        </div></details>
        <details><summary>Modelos<ChevronDown size={16} /></summary><div className="settings-body"><div className="model-list">{Object.entries(labels).map(([kind, label]) => { const template = kind === "signal_up" ? selected.signalTemplates?.UP : kind === "signal_down" ? selected.signalTemplates?.DOWN : selected.messageTemplates?.[kind as MessageKind]; return <div key={kind}><span>{label}</span><span className={template ? "saved-model" : "subtle"}>{template ? "Salvo" : "Não capturado"}</span></div>; })}</div><div className="capture-controls"><label>Modelo<select value={captureKind} onChange={(event) => setCaptureKind(event.target.value as TemplateKind)}>{Object.entries(labels).map(([kind, label]) => <option value={kind} key={kind}>{label}</option>)}</select></label><button disabled={!!busy || captureSession?.status === "waiting"} onClick={startCapture}><Radio size={16} />{captureSession?.status === "waiting" ? "Aguardando mensagem…" : "Capturar modelo"}</button></div></div></details>
        <details><summary>Avançado<ChevronDown size={16} /></summary><div className="settings-body fields-grid"><label>Chat ID<input value={selected.chatId || ""} onChange={(event) => patchProject({ chatId: event.target.value })} /></label><label>Token do bot<input type="password" autoComplete="new-password" value={selected.botToken || ""} placeholder={selected.botTokenConfigured ? "Configurado" : "Token"} onChange={(event) => patchProject({ botToken: event.target.value })} /></label></div></details>
      </div>}
    </main>

    <dialog ref={dialogRef} className="import-dialog" onCancel={(event) => { if (busy === "import") event.preventDefault(); }} onClick={(event) => { if (event.target === event.currentTarget) closeImport(); }}>
      <div className="dialog-heading"><h2>Importar lista</h2><button className="icon-button" aria-label="Fechar importação" title="Fechar" disabled={busy === "import"} onClick={closeImport}><X size={20} /></button></div>
      <p className="import-context">{selected?.name}<span>{dateKey.split("-").reverse().join("/")}</span></p>
      <textarea autoFocus aria-label="Lista de sinais" value={rawText} onChange={(event) => { setRawText(event.target.value); setReplaceWarning(""); setImportError(""); }} placeholder={"M5;AUDCAD-OTC;14:30;PUT\nM5;AUDNZD-OTC;14:45;CALL"} />
      <div className="import-count">{parsed.signals.length} sinais reconhecidos</div>
      {!!parsed.errors.length && <div className="inline-error" role="alert">{parsed.errors.slice(0, 5).map((error) => <p key={error.lineNumber}>Linha {error.lineNumber}: {error.error}</p>)}</div>}
      {(importError || replaceWarning) && <p className="inline-error" role="alert">{importError || replaceWarning}</p>}
      <footer><button disabled={busy === "import"} onClick={closeImport}>Cancelar</button><button className="primary" disabled={!!busy || !parsed.signals.length || !!parsed.errors.length} onClick={() => uploadList(!!replaceWarning)}>{busy === "import" ? <Loader2 size={16} className="spin" /> : <Import size={16} />}{replaceWarning ? "Substituir lista" : "Salvar lista"}</button></footer>
    </dialog>
    {notice && <div className={`toast ${notice.error ? "error" : "success"}`} role={notice.error ? "alert" : "status"}>{notice.error ? <AlertCircle size={18} /> : <Check size={18} />}<span>{notice.text}</span><button className="icon-button" aria-label="Fechar aviso" title="Fechar" onClick={() => setNotice(null)}><X size={16} /></button></div>}
  </div>;
}
