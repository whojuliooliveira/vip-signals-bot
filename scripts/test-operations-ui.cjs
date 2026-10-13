const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "C:/Users/julio_r7nro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const baseUrl = process.env.UI_TEST_URL || "http://127.0.0.1:5187";
const dateKey = "2026-10-13";
const project = { id: "expert_b", name: "Tom Reed | VIP Signals", enabled: true, language: "en", chatId: "-100123", botTokenConfigured: true, link: "https://example.com", brokerLabel: "Click here", telegramAccount: { sendMode: "auto", status: "disconnected", sessionConfigured: false, sharedCredentialsConfigured: true } };
const spanishProject = { id: "expert_a", name: "José Álvarez | Señales VIP", enabled: true, language: "es", chatId: "", botTokenConfigured: false, link: "https://example.es", brokerLabel: "Haz clic aquí", telegramAccount: { sendMode: "user", targetPeer: "@senalesvip", status: "connected", sessionConfigured: true, sharedCredentialsConfigured: true, accountLabel: "Cuenta Test" } };
const messages = ["morning_emoji", "good_morning", "analysis_start", "good_night"].map((kind) => ({ id: kind, kind, label: kind, enabled: true, projects: [project.id], textByLanguage: { en: kind }, timeByDay: { weekday: "07:00", saturday: "08:00", sunday: "09:00" } }));
const signals = [
  { id: "expired", time: "00:00", pair: "CHF/JPY", direction: "DOWN" },
  { id: "one", time: "14:30", pair: "AUD/CAD", direction: "DOWN" },
  { id: "two", time: "14:45", pair: "AUD/NZD", direction: "UP" },
  { id: "three", time: "15:00", pair: "EUR/USD", direction: "DOWN", sentAt: "2026-10-13T17:55:00Z" },
].map((s) => ({ projectId: project.id, dateKey, market: "OTC", expiryMinutes: 5, reentries: 2, sourceText: "", ...s }));
signals.push(
  { id: "future-midnight", projectId: project.id, dateKey: "2026-10-14", time: "00:00", pair: "GBP/USD", market: "OTC", direction: "UP", expiryMinutes: 5, reentries: 2, sourceText: "" },
  { id: "past-date", projectId: project.id, dateKey: "2026-10-12", time: "23:55", pair: "USD/JPY", market: "OTC", direction: "DOWN", expiryMinutes: 5, reentries: 2, sourceText: "" },
);
const config = { ok: true, projects: [project, spanishProject], messages, signals, workerLastSeen: new Date().toISOString(), logs: [{ id: "log1", projectId: project.id, kind: "signal", label: "EUR/USD DOWN", at: "2026-10-13T17:55:00Z", source: "schedule", status: "sent" }] };
async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.clock.install({ time: new Date("2026-10-13T11:49:00Z") });
    page.setDefaultNavigationTimeout(120000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let imported = 0;
    let lastSend;
    let failSend = false;
    let currentSignals = [...signals];
    let deletedList;
    let telegramConnected = false;
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/config") return route.fulfill({ json: { ...config, projects: [{ ...project, telegramAccount: telegramConnected ? { sendMode: "auto", status: "connected", sessionConfigured: true, accountLabel: "Tom Test (@tomtest)" } : project.telegramAccount }, spanishProject], signals: currentSignals } });
      if (path === "/api/telegram/connect") {
        const payload = route.request().postDataJSON();
        if (payload.action === "start") return route.fulfill({ json: { ok: true, status: "code_sent", viaApp: true } });
        if (payload.action === "verify") { telegramConnected = true; return route.fulfill({ json: { ok: true, status: "connected", accountLabel: "Tom Test (@tomtest)" } }); }
      }
      if (path === "/api/send-signal" || path === "/api/send-message") {
        lastSend = route.request().postDataJSON();
        if (failSend) return route.fulfill({ status: 500, json: { ok: false, error: "Falha simulada no Telegram" } });
        return route.fulfill({ json: { ok: true, results: [], messageId: 123 } });
      }
      if (path === "/api/signals") {
        if (route.request().method() === "DELETE") {
          deletedList = route.request().postDataJSON();
          const before = currentSignals.length;
          currentSignals = currentSignals.filter((signal) => signal.projectId !== deletedList.projectId || signal.dateKey !== deletedList.dateKey);
          return route.fulfill({ json: { ok: true, deleted: before - currentSignals.length, signals: currentSignals } });
        }
        imported++;
        const payload = route.request().postDataJSON();
        if (!payload.confirmReplace) return route.fulfill({ json: { ok: false, requiresConfirmation: true, error: "Lista existente. Substituir?" } });
        return route.fulfill({ json: { ok: true, created: [{ id: "new" }], signals } });
      }
      return route.abort();
    });
    await page.goto(baseUrl);
    await page.getByLabel("Data da lista").fill(dateKey);
    await page.locator(".signals-table tbody tr").first().waitFor();
    assert.equal(await page.getByRole("button", { name: "Próximos", exact: true }).getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator(".signals-table tbody tr").count(), 1);
    assert.match(await page.locator(".signals-table tbody tr").innerText(), /AUD\/CAD/);
    await page.getByRole("button", { name: "Todos", exact: true }).click();
    assert.equal(await page.locator(".signals-table tbody tr").count(), 4);
    assert.match(await page.locator(".signals-table tbody tr").first().innerText(), /Expirado/);
    await page.getByLabel("Data da lista").fill("2026-10-14");
    assert.match(await page.locator(".signals-table tbody tr").innerText(), /Aguardando/);
    await page.getByLabel("Data da lista").fill("2026-10-12");
    assert.match(await page.locator(".signals-table tbody tr").innerText(), /Expirado/);
    await page.getByLabel("Data da lista").fill(dateKey);
    await page.getByRole("button", { name: "Listas salvas", exact: true }).click();
    assert.equal(await page.locator(".saved-list-row").count(), 3);
    await page.getByRole("button", { name: "Ver lista 13/10/2026 Tom Reed | VIP Signals", exact: true }).click();
    await page.locator(".saved-lists-dialog").waitFor({ state: "hidden" });
    assert.equal(await page.getByLabel("Data da lista").inputValue(), dateKey);
    await page.getByRole("button", { name: "Listas salvas", exact: true }).click();
    await page.getByRole("button", { name: "Apagar lista 12/10/2026 Tom Reed | VIP Signals", exact: true }).click();
    await page.getByRole("button", { name: "Confirmar exclusão da lista 12/10/2026 Tom Reed | VIP Signals", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Lista apagada" }).waitFor();
    assert.equal(await page.locator(".saved-list-row").count(), 2);
    assert.deepEqual(deletedList, { projectId: project.id, dateKey: "2026-10-12" });
    await page.getByRole("button", { name: "Fechar listas salvas", exact: true }).click();
    assert.equal(await page.locator("textarea:visible").count(), 0);
    assert.equal(await page.getByRole("button", { name: "Automáticos", exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Manuais", exact: true }).count(), 0);
    await page.getByRole("button", { name: "Enviar agora AUD/CAD 14:30", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "enviado" }).waitFor();
    assert.equal(lastSend.projectId, "expert_b");
    assert.equal(lastSend.time, "14:30");
    assert.equal(lastSend.kind, "signal");
    assert.match(await page.locator(".signals-table tbody tr").filter({ hasText: "AUD/CAD" }).innerText(), /Enviado/);
    for (const [label, kind] of [["Emoji de abertura", "morning_emoji"], ["Bom dia", "good_morning"], ["Início das análises", "analysis_start"], ["Boa noite", "good_night"]]) {
      await page.getByRole("button", { name: `Testar ${label}`, exact: true }).click();
      await page.getByRole("status").filter({ hasText: `${label} enviada ao canal` }).waitFor();
      assert.equal(lastSend.kind, kind);
    }
    await page.getByRole("button", { name: "Importar lista", exact: true }).click();
    await page.getByLabel("Lista de sinais").fill("texto invalido");
    assert.equal(await page.getByRole("button", { name: "Salvar lista", exact: true }).isDisabled(), true);
    await page.getByLabel("Lista de sinais").fill("M5;AUDCAD-OTC;14:30;PUT");
    await page.getByRole("button", { name: "Salvar lista", exact: true }).click();
    await page.getByRole("button", { name: "Substituir lista", exact: true }).click();
    await page.locator(".import-dialog").waitFor({ state: "hidden" });
    failSend = true;
    await page.getByRole("button", { name: "Testar Bom dia", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Falha simulada" }).waitFor();
    failSend = false;
    assert.equal(imported, 2);
    await page.getByRole("button", { name: "Importar lista", exact: true }).click();
    await page.keyboard.press("Escape");
    await page.locator(".import-dialog").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Configurações", exact: true }).click();
    assert.equal(await page.locator(".settings-sections > details[open]").count(), 2);
    await page.getByRole("button", { name: "Conectar conta", exact: true }).click();
    assert.equal(await page.getByLabel("API ID").count(), 0);
    assert.equal(await page.getByLabel("API Hash").count(), 0);
    await page.getByLabel("Telefone").fill("+5511999999999");
    await page.getByRole("button", { name: "Enviar código", exact: true }).click();
    await page.getByLabel("Código recebido").fill("12345");
    await page.getByRole("button", { name: "Confirmar código", exact: true }).click();
    await page.locator(".telegram-dialog").waitFor({ state: "hidden" });
    await page.getByText("Tom Test (@tomtest)", { exact: true }).waitFor();
    await page.getByRole("combobox", { name: "Canal", exact: true }).selectOption("expert_a");
    assert.equal(await page.getByLabel("Token do bot").count(), 0);
    assert.equal(await page.getByLabel("Canal de destino").getAttribute("placeholder"), "@canal ou -100...");
    assert.equal(await page.getByLabel("Forma de envio").inputValue(), "user");
    assert.equal(await page.getByLabel("Forma de envio").isDisabled(), true);
    await page.getByRole("combobox", { name: "Canal", exact: true }).selectOption("expert_b");
    await page.getByRole("button", { name: "Lista do dia", exact: true }).click();
    await page.getByRole("button", { name: "Fechar aviso" }).click();
    for (const [name, width, height] of [["desktop", 1440, 1000], ["tablet", 768, 1024], ["mobile", 390, 844]]) {
      await page.setViewportSize({ width, height });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Overflow ${name}`);
      await page.screenshot({ path: `data/operations-${name}.png`, fullPage: true });
    }
    assert.deepEqual(errors, []);
    console.log("PASS: lists, sends, import, Spanish account-only mode, independent Telegram connection, desktop/tablet/mobile");
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exit(1); });
