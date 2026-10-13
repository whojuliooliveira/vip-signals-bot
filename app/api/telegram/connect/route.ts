import { NextRequest, NextResponse } from "next/server";
import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { loadStore, saveStore, type TelegramAccountSettings } from "../../../../lib/store";

export const maxDuration = 60;

function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "errorMessage" in error) return String((error as { errorMessage: unknown }).errorMessage);
  return error instanceof Error ? error.message : "Falha ao conectar a conta Telegram.";
}

function accountLabel(user: any) {
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
  return user?.username ? `${name || "Conta Telegram"} (@${user.username})` : name || user?.phone || "Conta Telegram";
}

async function clientFor(account: TelegramAccountSettings) {
  const apiId = Number(account.apiId);
  const apiHash = account.apiHash || "";
  if (!Number.isFinite(apiId) || !apiHash) throw new Error("Informe um API ID e API Hash válidos.");
  const session = new StringSession(account.pendingSession || "");
  const client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 5, useWSS: true });
  await client.connect();
  return { client, session, credentials: { apiId, apiHash } };
}

export async function POST(request: NextRequest) {
  let client: TelegramClient | undefined;
  try {
    const body = await request.json();
    const projectId = String(body.projectId || "");
    const action = String(body.action || "");
    const store = await loadStore();
    const project = store.projects.find((item) => item.id === projectId);
    if (!project) throw new Error("Canal não encontrado.");

    if (action === "disconnect") {
      project.telegramAccount = {
        sendMode: project.telegramAccount?.sendMode || "auto",
        apiId: project.telegramAccount?.apiId,
        apiHash: project.telegramAccount?.apiHash,
        phone: project.telegramAccount?.phone,
        targetPeer: project.telegramAccount?.targetPeer,
        status: "disconnected",
      };
      await saveStore(store);
      return NextResponse.json({ ok: true, status: "disconnected" });
    }

    if (action === "start") {
      const account: TelegramAccountSettings = {
        ...project.telegramAccount,
        apiId: String(body.apiId || project.telegramAccount?.apiId || "").trim(),
        apiHash: String(body.apiHash || project.telegramAccount?.apiHash || "").trim(),
        phone: String(body.phone || project.telegramAccount?.phone || "").replace(/\s+/g, ""),
        sendMode: project.telegramAccount?.sendMode || "auto",
      };
      if (!account.phone?.startsWith("+")) throw new Error("Informe o telefone com código do país, por exemplo +5511999999999.");
      const created = await clientFor(account);
      client = created.client;
      const sent = await client.sendCode(created.credentials, account.phone);
      project.telegramAccount = {
        ...account,
        pendingSession: created.session.save() as unknown as string,
        phoneCodeHash: sent.phoneCodeHash,
        codeSentAt: new Date().toISOString(),
        status: "code_sent",
      };
      await saveStore(store);
      return NextResponse.json({ ok: true, status: "code_sent", viaApp: sent.isCodeViaApp });
    }

    const account = project.telegramAccount;
    if (!account?.pendingSession || !account.apiId || !account.apiHash) throw new Error("Solicite um novo código para continuar.");
    const created = await clientFor(account);
    client = created.client;

    if (action === "verify") {
      const code = String(body.code || "").replace(/\D/g, "");
      if (!code || !account.phone || !account.phoneCodeHash) throw new Error("Informe o código recebido no Telegram.");
      try {
        await client.invoke(new Api.auth.SignIn({ phoneNumber: account.phone, phoneCodeHash: account.phoneCodeHash, phoneCode: code }));
      } catch (error) {
        if (errorMessage(error) === "SESSION_PASSWORD_NEEDED") {
          project.telegramAccount = { ...account, pendingSession: created.session.save() as unknown as string, status: "password_required" };
          await saveStore(store);
          return NextResponse.json({ ok: true, status: "password_required" });
        }
        throw error;
      }
    } else if (action === "password") {
      const password = String(body.password || "");
      if (!password) throw new Error("Informe a senha de duas etapas.");
      await client.signInWithPassword(created.credentials, { password: async () => password, onError: async () => true });
    } else {
      throw new Error("Ação de conexão inválida.");
    }

    if (!(await client.isUserAuthorized())) throw new Error("O Telegram não autorizou esta sessão.");
    const me = await client.getMe();
    project.telegramAccount = {
      ...account,
      stringSession: created.session.save() as unknown as string,
      pendingSession: undefined,
      phoneCodeHash: undefined,
      codeSentAt: undefined,
      status: "connected",
      accountLabel: accountLabel(me),
      connectedAt: new Date().toISOString(),
    };
    await saveStore(store);
    return NextResponse.json({ ok: true, status: "connected", accountLabel: project.telegramAccount.accountLabel });
  } catch (error) {
    return NextResponse.json({ ok: false, error: errorMessage(error) }, { status: 400 });
  } finally {
    if (client) await client.disconnect().catch(() => undefined);
  }
}
