const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, filename);
};
const { renderSignal } = require("../lib/templates.ts");
const { toTelegramUserEntities } = require("../lib/telegramEntities.ts");

async function main() {
  const config = await fetch("https://vip-signals-bot-bice.vercel.app/api/config").then((r) => r.json());
  const project = config.projects.find((p) => p.id === "expert_b");
  const template = project.signalTemplates.DOWN;
  const payload = {
    locale: "en", title: project.name, pair: "AUD/CAD", market: "OTC", direction: "DOWN",
    time: "15:00", expiryMinutes: 5, reentries: 2, brokerLink: project.link,
    brokerLabel: project.brokerLabel, includeInlineButton: false, template,
  };
  const rendered = renderSignal(payload);
  const entities = toTelegramUserEntities(rendered.text, rendered.entities);
  const custom = entities.filter((e) => e.className === "MessageEntityCustomEmoji");
  assert.equal(custom.length, 3);
  assert.equal(rendered.text.includes("{{"), false);
  assert.equal(rendered.text.slice(custom[2].offset, custom[2].offset + custom[2].length), "\u27a1\ufe0f");
  assert.equal(custom[0].documentId.toString(), "5215522595922779944");
  assert.equal(custom[2].documentId.toString(), "5215480011322042129");
  for (const entity of entities) entity.getBytes();
  console.log("PASS: saved template, UTF-16 offsets, emoji IDs and MTProto serialization");
  if (!process.argv.includes("--live")) return;
  const { TelegramClient } = require("telegram");
  const { StringSession } = require("telegram/sessions");
  const client = new TelegramClient(new StringSession(process.env.TELEGRAM_STRING_SESSION),
    Number(process.env.TELEGRAM_API_ID), process.env.TELEGRAM_API_HASH,
    { connectionRetries: 1, useWSS: true });
  let sent;
  try {
    await client.connect();
    const me = await client.getMe();
    console.log(JSON.stringify({ premium: !!me.premium }));
    const channelId = String(project.chatId).replace(/^-100/, "");
    const dialogs = await client.getDialogs({ limit: 100 });
    const target = dialogs.find((d) => String(d.entity?.id) === channelId)?.entity;
    if (target) {
      const previous = await client.getMessages(target, { ids: [template.sourceMessageId, template.sourceMessageId + 1] });
      console.log(JSON.stringify(previous.map((m) => ({ id: m.id,
        customEmojis: (m.entities || []).filter((e) => e.className === "MessageEntityCustomEmoji").length }))));
    }
    sent = await client.sendMessage("me", { message: rendered.text, formattingEntities: entities, linkPreview: false });
    const [received] = await client.getMessages("me", { ids: [sent.id] });
    assert.equal(received.message, rendered.text);
    const signature = (list) => list.map((e) => [e.className, e.offset, e.length, e.documentId?.toString(), e.url]).sort();
    assert.deepEqual(signature(received.entities), signature(entities));
    console.log("PASS: Telegram readback preserves all entities, custom emoji IDs, text and links");
  } finally {
    if (sent) await client.deleteMessages("me", [sent.id], { revoke: true });
    await client.destroy();
  }
}
main().then(() => process.exit(0)).catch((error) => { console.error(error.message); process.exit(1); });
