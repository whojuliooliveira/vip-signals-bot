const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText, filename);
const { dayMode, localWeekday, localDateKey, defaultMessages, scheduleSignalSlots } = require("../lib/store.ts");
const { goodNightReturnHour, standardMessagePayload } = require("../lib/standardMessages.ts");
const { directionText, renderSavedSignalTemplate, renderSignal } = require("../lib/templates.ts");
const { limitAutomaticSignals, signalOperationEnd, signalOperationStart, validateSignalTime } = require("../lib/signals.ts");
assert.equal(dayMode(new Date("2026-10-11T02:30:00Z")), "saturday");
assert.equal(dayMode(new Date("2026-10-11T03:00:00Z")), "sunday");
assert.equal(localWeekday(new Date("2026-10-12T02:30:00Z")), "sunday");
assert.equal(localDateKey(new Date("2026-10-12T02:30:00Z")), "2026-10-11");
assert.deepEqual(scheduleSignalSlots(new Date("2026-10-18T02:58:30Z"), 5), [
  { dateKey: "2026-10-17", times: ["23:58", "23:59"] },
  { dateKey: "2026-10-18", times: ["00:00", "00:01", "00:02", "00:03"] },
]);
assert.equal(directionText("es", "UP"), "ARRIBA");
assert.equal(directionText("es", "DOWN"), "ABAJO");
assert.equal(defaultMessages.find((message) => message.kind === "morning_emoji").timeByDay.saturday, "07:54");
assert.equal(defaultMessages.find((message) => message.kind === "good_morning").timeByDay.saturday, "08:01");
assert.equal(defaultMessages.find((message) => message.kind === "analysis_start").timeByDay.saturday, "08:15");
assert.equal(defaultMessages.find((message) => message.kind === "analysis_start").timeByDay.sunday, "09:30");
assert.equal(signalOperationStart("2026-10-16"), "07:25");
assert.equal(signalOperationStart("2026-10-17"), "08:25");
assert.equal(signalOperationStart("2026-10-18"), "10:00");
assert.equal(signalOperationEnd("2026-10-16"), "03:30");
assert.equal(signalOperationEnd("2026-10-17"), "23:30");
assert.equal(signalOperationEnd("2026-10-18"), "23:30");
assert.equal(validateSignalTime("07:25", "2026-10-16"), "");
assert.match(validateSignalTime("08:00", "2026-10-17"), /08:25/);
assert.equal(validateSignalTime("08:25", "2026-10-17"), "");
assert.equal(validateSignalTime("23:30", "2026-10-17"), "");
assert.match(validateSignalTime("23:35", "2026-10-17"), /23:30/);
assert.match(validateSignalTime("09:55", "2026-10-18"), /10:00/);
assert.equal(validateSignalTime("10:00", "2026-10-18"), "");
assert.match(validateSignalTime("10:05", "2026-10-18"), /um sinal por hora/);
assert.equal(validateSignalTime("15:00", "2026-10-18"), "");
assert.match(validateSignalTime("15:25", "2026-10-18"), /um sinal por hora/);
assert.equal(validateSignalTime("16:05", "2026-10-18"), "");
assert.equal(validateSignalTime("23:30", "2026-10-18"), "");
assert.match(validateSignalTime("00:00", "2026-10-18"), /10:00/);
const sundaySignals = [
  { id: "first", createdAt: "2026-10-17T20:00:00.000Z", projectId: "es", dateKey: "2026-10-18", time: "10:00" },
  { id: "duplicate", createdAt: "2026-10-17T20:01:00.000Z", projectId: "es", dateKey: "2026-10-18", time: "10:00" },
  { id: "next-hour", createdAt: "2026-10-17T20:02:00.000Z", projectId: "es", dateKey: "2026-10-18", time: "11:00" },
  { id: "other-channel", createdAt: "2026-10-17T20:03:00.000Z", projectId: "en", dateKey: "2026-10-18", time: "10:00" },
];
assert.deepEqual(limitAutomaticSignals(sundaySignals).map((signal) => signal.id), ["first", "next-hour", "other-channel"]);
assert.match(renderSignal({ locale: "es", title: "Test", pair: "AUD/CAD", market: "OTC", direction: "UP", time: "14:30", expiryMinutes: 5, reentries: 2, brokerLink: "https://example.com", brokerLabel: "Abrir", includeInlineButton: true }).text, /ARRIBA/);
assert.match(renderSignal({ locale: "es", title: "Test", pair: "AUD/CAD", market: "OTC", direction: "DOWN", time: "14:30", expiryMinutes: 5, reentries: 2, brokerLink: "https://example.com", brokerLabel: "Abrir", includeInlineButton: true }).text, /ABAJO/);
const legacySpanish = renderSavedSignalTemplate({ id: "legacy", kind: "signal_up", html: "", text: "{{pair}} ({{market}}) · {{direction}} · HH:MM", entities: [], capturedAt: new Date().toISOString() }, { locale: "es", title: "Test", pair: "USD/ARS", market: "OTC", direction: "UP", time: "16:30", expiryMinutes: 5, reentries: 2, brokerLink: "https://example.com", brokerLabel: "Abrir", includeInlineButton: true });
assert.equal(legacySpanish.text, "USD/ARS (OTC) · ARRIBA · 16:30");
assert.equal(goodNightReturnHour(new Date("2026-10-17T07:01:00Z")), 8);
assert.equal(goodNightReturnHour(new Date("2026-10-18T03:02:00Z")), 9);
assert.equal(goodNightReturnHour(new Date("2026-10-19T03:01:00Z")), 7);
const goodNight = defaultMessages.find((message) => message.kind === "good_night");
const spanishGoodNightProject = { id: "es", chatId: "-100456", name: "Jose", language: "es", link: "https://example.com", brokerLabel: "Abrir", messageTemplates: { good_night: { text: "Retomamos a las 7 a.m UTC-3.", entities: [], buttons: [] } } };
assert.match(standardMessagePayload(spanishGoodNightProject, goodNight, new Date("2026-10-17T07:01:00Z")).text, /8 a\.m UTC-3/);
assert.match(standardMessagePayload(spanishGoodNightProject, goodNight, new Date("2026-10-18T03:02:00Z")).text, /9 a\.m UTC-3/);
assert.match(standardMessagePayload(spanishGoodNightProject, goodNight, new Date("2026-10-19T03:01:00Z")).text, /7 a\.m UTC-3/);
const project = { id: "test", chatId: "-100123", name: "Test", language: "en", link: "https://example.com", brokerLabel: "Link", messageTemplates: {} };
for (const message of defaultMessages) {
  const template = { text: "Good morning!", entities: [{ type: "bold", offset: 0, length: 4 }], buttons: [[{ text: "Original", url: "https://example.org" }]] };
  project.messageTemplates[message.kind] = template;
  const payload = standardMessagePayload(project, message);
  assert.equal(payload.text, template.text);
  assert.deepEqual(payload.entities, template.entities);
  assert.deepEqual(payload.buttons, template.buttons);
  assert.equal(payload.buttonUrl, undefined);
}
console.log("PASS: Sao Paulo date boundaries and all four standard message payloads");
