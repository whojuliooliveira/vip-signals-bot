const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText, filename);
const { dayMode, localWeekday, localDateKey, defaultMessages } = require("../lib/store.ts");
const { standardMessagePayload } = require("../lib/standardMessages.ts");
assert.equal(dayMode(new Date("2026-10-11T02:30:00Z")), "saturday");
assert.equal(dayMode(new Date("2026-10-11T03:00:00Z")), "sunday");
assert.equal(localWeekday(new Date("2026-10-12T02:30:00Z")), "sunday");
assert.equal(localDateKey(new Date("2026-10-12T02:30:00Z")), "2026-10-11");
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
