"use client";

import { AlertTriangle, CheckCircle2, ListChecks, Radio, Send, Settings } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { parseSignalInput, validateSignalTime, type ParsedSignal, type SignalParseError } from "../lib/signals";
import type { CaptureSession, CapturedTemplate, MessageKind, TemplateKind } from "../lib/store";

type Tab = "lista" | "config";
type DayMode = "weekday" | "saturday" | "sunday";
type Direction = "UP" | "DOWN";

type ProjectSettings = {
  id: string;
  name: string;
  language: "es" | "en";
  botToken?: string;
  botTokenConfigured?: boolean;
  chatId?: string;
  link: string;
  brokerLabel: string;
  signalTemplates?: { UP?: CapturedTemplate; DOWN?: CapturedTemplate };
  messageTemplates?: Partial<Record<MessageKind, CapturedTemplate>>;
  enabled: boolean;
};

type SavedMessage = {
  id: string;
  label: string;
  kind: MessageKind;
  enabled: boolean;
  projects: string[];
  textByLanguage: { es?: string; en?: string };
  timeByDay: Partial<Record<DayMode, string>>;
  includeInlineButton: boolean;
};

type ScheduledSignal = {
  id: string;
  dateKey: string;
  projectId: string;
  pair: string;
  market: string;
  direction: Direction;
  time: string;
  sentAt?: string;
  error?: string;
  manualOnly?: boolean;
  validationError?: string;
};

const today = new Date().toISOString().slice(0, 10);
const dayLabels: Record<DayMode, string> = { weekday: "Seg-Sex", saturday: "Sábado", sunday: "Domingo" };
const captureLabels: Record<TemplateKind, string> = {
  signal_up: "Sinal CALL / BUY",
  signal_down: "Sinal PUT / SELL",
  morning_emoji: "Emoji ou mídia de abertura",
  good_morning: "Bom dia",
  analysis_start: "Início das análises",
  good_night: "Boa noite",
};
const messageKinds = ["morning_emoji", "good_morning", "analysis_start", "good_night"] as const;

export default function Home() {
  const [tab, setTab] = useState<Tab>("lista");
  const [projects, setProjects] = useState<ProjectSettings[]>([]);
  const [messages, setMessages] = useState<SavedMessage[]>([]);
  const [signals, setSignals] = useState<ScheduledSignal[]>([]);
  const [projectId, setProjectId] = useState("expert_b");
  const [dateKey, setDateKey] = useState(today);
  const [rawText, setRawText] = useState("");
  const [status, setStatus] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [busy, setBusy] = useState(false);
  const [workerLastSeen, setWorkerLastSeen] = useState<string | null>(null);
  const [captureSession, setCaptureSession] = useState<CaptureSession | null>(null);
  const [captureProject, setCaptureProject] = useState("expert_b");
  const [captureKind, setCaptureKind] = useState<TemplateKind>("signal_down");
  const didLoad = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const configDirty = useRef(false);

  const selectedProject = projects.find((project) => project.id === projectId);
  const parsed = useMemo(() => parseSignalInput(rawText), [rawText]);
  const fullParsed = useMemo(() => parseSignalInput(rawText, { includeOutOfCriteria: true }), [rawText]);
  const savedSignalsForDate = useMemo(() => signals.filter((signal) => signal.projectId === projectId && signal.dateKey === dateKey), [signals, projectId, dateKey]);
  const visibleSignals = fullParsed.signals.length
    ? fullParsed.signals
    : savedSignalsForDate.map((signal) => ({
      pair: signal.pair,
      market: signal.market,
      direction: signal.direction,
      time: signal.time,
      sourceText: "",
      validationError: signal.validationError || validateSignalTime(signal.time) || undefined,
    }));

  async function loadConfig(silent = false) {
    if (silent && configDirty.current) return;
    try {
      const response = await fetch("/api/config", { cache: "no-store" });
      const result = await response.json();
      if (!result.ok) throw new Error(result.error || "Falha ao carregar");
      setProjects(result.projects || []);
      setMessages(result.messages || []);
      setSignals(result.signals || []);
      setWorkerLastSeen(result.workerLastSeen || null);
      if (!projectId && result.projects?.[0]?.id) setProjectId(result.projects[0].id);
      if (!silent) setStatus("");
      didLoad.current = true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Erro ao carregar");
    }
  }

  useEffect(() => {
    loadConfig();
    const timer = setInterval(() => loadConfig(true), 12000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!didLoad.current || !configDirty.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveState !== "saving" && setSaveState("idle");
    saveTimer.current = setTimeout(() => saveConfig(), 900);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [projects, messages]);

  useEffect(() => {
    if (!captureSession || captureSession.status !== "waiting") return;
    const timer = setInterval(async () => {
      const response = await fetch(`/api/templates/capture?sessionId=${encodeURIComponent(captureSession.id)}`, { cache: "no-store" });
      const result = await response.json();
      if (!result.ok) {
        setStatus(result.error || "Erro na captura");
        clearInterval(timer);
        return;
      }
      setCaptureSession(result.session);
      if (result.session.status === "captured") {
        setStatus("Modelo capturado e salvo.");
        await loadConfig(true);
        clearInterval(timer);
      }
      if (result.session.status === "expired" || result.session.status === "failed") {
        setStatus(result.session.error || "Captura encerrada.");
        clearInterval(timer);
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [captureSession?.id, captureSession?.status]);

  async function saveConfig() {
    const invalid = projects.some((project) => project.enabled && (!project.chatId || !(project.botToken || project.botTokenConfigured)));
    if (invalid) {
      setSaveState("error");
      setStatus("Projeto ativo precisa de bot e destino configurados.");
      return;
    }
    setSaveState("saving");
    try {
      const response = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projects, messages }),
      });
      const result = await response.json();
      if (!result.ok) throw new Error(result.error || "Falha ao salvar");
      configDirty.current = false;
      setSaveState("saved");
    } catch (error) {
      setSaveState("error");
      setStatus(error instanceof Error ? error.message : "Erro ao salvar");
    }
  }

  async function uploadList(confirmReplace = false) {
    if (fullParsed.errors.length) {
      setStatus("Corrija as linhas inválidas antes de subir.");
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch("/api/signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, dateKey, rawText, confirmReplace }),
      });
      const result = await response.json();
      if (result.requiresConfirmation) {
        const ok = window.confirm(`${result.error}\n\nConfirmar substituição da fila pendente?`);
        if (ok) return uploadList(true);
        setStatus("Importação cancelada.");
        return;
      }
      if (!result.ok) throw new Error(result.error || "Falha ao subir lista");
      setSignals(result.signals || []);
      const skipped = result.skippedPast?.length ? ` ${result.skippedPast.length} horário(s) vencido(s) ignorado(s).` : "";
      setStatus(`${result.created.length} sinal(is) agendado(s).${skipped}`);
      await loadConfig(true);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Erro desconhecido");
    } finally {
      setBusy(false);
    }
  }

  async function sendSignalNow(signal: ParsedSignal) {
    setBusy(true);
    setStatus(`Enviando ${signal.pair} ${signal.time} agora...`);
    try {
      const response = await fetch("/api/send-signal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          kind: "signal",
          projectId,
          pair: signal.pair,
          market: signal.market,
          direction: signal.direction,
          time: signal.time,
          expiryMinutes: signal.expiryMinutes || 5,
          reentries: 2,
          includeInlineButton: true,
        }),
      });
      const result = await response.json();
      if (!result.ok) throw new Error(result.error || "Falha ao enviar");
      setStatus(`${signal.pair} ${signal.time} enviado agora.`);
      await loadConfig(true);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Erro ao enviar");
    } finally {
      setBusy(false);
    }
  }

  async function startCapture() {
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch("/api/templates/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: captureProject, kind: captureKind }),
      });
      const result = await response.json();
      if (!result.ok) throw new Error(result.error || "Falha ao iniciar captura");
      setCaptureSession(result.session);
      setStatus(result.instruction);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Erro desconhecido");
    } finally {
      setBusy(false);
    }
  }

  async function sendStandardNow(targetProjectId: string, kind: MessageKind) {
    setBusy(true);
    setStatus("Enviando mensagem...");
    try {
      const response = await fetch("/api/send-message", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: targetProjectId, kind }),
      });
      const result = await response.json();
      if (!result.ok) throw new Error(result.error || "Falha no envio");
      setStatus("Mensagem enviada ao canal.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha no envio");
    } finally {
      setBusy(false);
    }
  }

  function patchProject(id: string, patch: Partial<ProjectSettings>) {
    configDirty.current = true;
    setProjects((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function patchMessage(id: string, patch: Partial<SavedMessage>) {
    configDirty.current = true;
    setMessages((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function patchMessageTime(id: string, day: DayMode, value: string) {
    configDirty.current = true;
    setMessages((items) => items.map((item) => item.id === id ? { ...item, timeByDay: { ...item.timeByDay, [day]: value } } : item));
  }

  return (
    <div className="side-app">
      <aside className="lean-sidebar">
        <div className="brand compact-brand">
          <img className="brand-logo" src="/logo-dms-transparent.png" alt="DMS" />
          <div className="brand-title">Sinais</div>
        </div>
        <nav className="side-nav lean-nav">
          <button className={tab === "lista" ? "active" : ""} onClick={() => setTab("lista")}><ListChecks size={16} /> Lista do dia</button>
          <button className={tab === "config" ? "active" : ""} onClick={() => setTab("config")}><Settings size={16} /> Configurações</button>
        </nav>
        <div className="sidebar-save">
          <span className="dot" />
          <span className={`save-state ${saveState}`}>{saveState === "saving" ? "Salvando" : saveState === "saved" ? "Salvo" : saveState === "error" ? "Erro ao salvar" : "Operação"}</span>
        </div>
      </aside>

      <main className="lean-app">
        <header className="content-title">
          <div>
            <h1>{tab === "lista" ? "Lista do dia" : "Configurações"}</h1>
            <p>{tab === "lista" ? "Cole a lista, confira os sinais e envie quando quiser." : "Bots, modelos e horários automáticos por projeto."}</p>
          </div>
        </header>

      {tab === "lista" && (
        <section className="daily-grid">
          <div className="panel list-panel">
            <div className="list-controls">
              <div className="field"><label>Projeto</label><select value={projectId} onChange={(event) => setProjectId(event.target.value)}>{projects.map((project) => <option key={project.id} value={project.id}>{project.language === "en" ? "Inglês" : "Espanhol"} · {project.name}</option>)}</select></div>
              <div className="field"><label>Data</label><input type="date" value={dateKey} onChange={(event) => setDateKey(event.target.value)} /></div>
            </div>
            <textarea className="bulk-textarea clean-textarea" value={rawText} onChange={(event) => setRawText(event.target.value)} placeholder="Cole a lista completa aqui..." />
            <button className="primary-button submit-list" disabled={busy || fullParsed.signals.length === 0 || fullParsed.errors.length > 0} onClick={() => uploadList(false)}><Send size={16} /> Salvar lista da data</button>
          </div>

          <aside className="side-stack">
            <div className="panel">
              <div className="preview-head"><CheckCircle2 size={18} /> Lista completa lida</div>
              <div className="validation-summary"><strong>{visibleSignals.length}</strong><span>{fullParsed.signals.length ? "sinais reconhecidos" : "sinais salvos na data"}</span></div>
              {fullParsed.errors.length > 0 && <ErrorList errors={fullParsed.errors} />}
              <div className="detected-list full-detected">
                {visibleSignals.length === 0 && <p className="muted">Cole uma lista ou escolha uma data com sinais salvos.</p>}
                {visibleSignals.slice(0, 200).map((signal, index) => <div className={`signal-row ${signal.validationError ? "outside" : "inside"}`} key={`${signal.time}-${signal.pair}-${index}`}>
                  <b>{signal.time}</b>
                  <span>{signal.pair} · {signal.market} · {signal.direction === "UP" ? selectedProject?.language === "en" ? "BUY" : "ARRIBA" : selectedProject?.language === "en" ? "SELL" : "ABAJO"}</span>
                  <em>{signal.validationError ? "fora da regra" : "entra na fila"}</em>
                  <button disabled={busy} onClick={() => sendSignalNow(signal)}>Enviar agora</button>
                </div>)}
              </div>
            </div>
          </aside>
        </section>
      )}

      {tab === "config" && (
        <section className="config-stack">
          <div className="panel capture-panel">
            <div className="config-card-head"><strong><Radio size={16} /> Captura de modelos</strong><span className="muted">{captureSession?.status === "waiting" ? "Aguardando mensagem no Telegram" : "Modelos ficam salvos por projeto"}</span></div>
            <div className="capture-row">
              <div className="field"><label>Projeto</label><select value={captureProject} onChange={(event) => setCaptureProject(event.target.value)}>{projects.map((project) => <option key={project.id} value={project.id}>{project.language === "en" ? "Inglês" : "Espanhol"} · {project.name}</option>)}</select></div>
              <div className="field"><label>Modelo</label><select value={captureKind} onChange={(event) => setCaptureKind(event.target.value as TemplateKind)}>{Object.entries(captureLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
              <button className="primary-button" disabled={busy || captureSession?.status === "waiting"} onClick={startCapture}>Capturar modelo</button>
            </div>
            <p className="muted capture-help">Clique uma vez, envie o exemplo no canal do projeto e aguarde a confirmação automática.</p>
          </div>

          {projects.map((project) => <details className="panel project-config" key={project.id} open><summary>{project.language === "en" ? "Inglês" : "Espanhol"} · {project.name}</summary>
            <div className="form-grid">
              <div className="field wide"><label>Nome do canal</label><input value={project.name} onChange={(event) => patchProject(project.id, { name: event.target.value })} /></div>
              <div className="field"><label>Ativo</label><select value={project.enabled ? "yes" : "no"} onChange={(event) => patchProject(project.id, { enabled: event.target.value === "yes" })}><option value="yes">Sim</option><option value="no">Não</option></select></div>
              <div className="field"><label>Chat ID</label><input value={project.chatId || ""} onChange={(event) => patchProject(project.id, { chatId: event.target.value })} placeholder="-100..." /></div>
              <div className="field"><label>Token do bot</label><input value={project.botToken || ""} onChange={(event) => patchProject(project.id, { botToken: event.target.value })} placeholder={project.botTokenConfigured ? "Já configurado" : "Token"} /></div>
              <div className="field wide"><label>Link do broker</label><input value={project.link} onChange={(event) => patchProject(project.id, { link: event.target.value })} /></div>
              <div className="field"><label>Texto do botão</label><input value={project.brokerLabel} onChange={(event) => patchProject(project.id, { brokerLabel: event.target.value })} /></div>
            </div>
            <TemplateStatus project={project} />
            <div className="standard-tests">
              {messageKinds.map((kind) => <div className="standard-test" key={kind}>
                <span>{captureLabels[kind]}</span>
                <button disabled={busy || !project.chatId} onClick={() => sendStandardNow(project.id, kind)}><Send size={14} /> Enviar agora</button>
              </div>)}
            </div>
          </details>)}

          <details className="panel project-config" open><summary>Horários automáticos</summary>
            <p className="muted">{workerLastSeen && Date.now() - Date.parse(workerLastSeen) < 120000 ? "Automático conectado" : "Automático sem confirmação recente"} · Horários de Brasília</p>
            <div className="schedule-list">
              {messages.map((message) => <div className="schedule-line" key={message.id}><strong>{message.label}</strong>{(["weekday", "saturday", "sunday"] as DayMode[]).map((day) => <div className="field" key={day}><label>{dayLabels[day]}</label><input value={message.timeByDay[day] || ""} onChange={(event) => patchMessageTime(message.id, day, event.target.value)} /></div>)}<label className="check"><input type="checkbox" checked={message.enabled} onChange={(event) => patchMessage(message.id, { enabled: event.target.checked })} /> Ativa</label></div>)}
            </div>
            <p className="muted">Boa noite usa a regra fixa por dia real de envio: terça a sábado 04:01, domingo 00:02, segunda 00:01.</p>
          </details>
        </section>
      )}

        {status && <p className="floating-status"><AlertTriangle size={16} /> {status}</p>}
      </main>
    </div>
  );
}

function ErrorList({ errors }: { errors: SignalParseError[] }) {
  return <div className="error-list">{errors.slice(0, 8).map((error) => <p key={`${error.lineNumber}-${error.line}`}><b>Linha {error.lineNumber}</b> {error.error}</p>)}</div>;
}

function TemplateStatus({ project }: { project: ProjectSettings }) {
  return (
    <div className="template-grid">
      <span>Sinal CALL/BUY: {project.signalTemplates?.UP ? "salvo" : "faltando"}</span>
      <span>Sinal PUT/SELL: {project.signalTemplates?.DOWN ? "salvo" : "faltando"}</span>
      {messageKinds.map((kind) => <span key={kind}>{captureLabels[kind]}: {project.messageTemplates?.[kind] ? "salvo" : "faltando"}</span>)}
    </div>
  );
}
