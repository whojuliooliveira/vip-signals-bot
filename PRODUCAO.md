# Produção

## Supabase

1. Crie um projeto Supabase.
2. Rode as migrations em `supabase/migrations`.
3. Configure no Vercel:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CRON_SECRET`
   - `CAPTURE_SECRET`
   - `ADMIN_PASSWORD`
   - `PUBLIC_APP_URL`

Use a service role key somente no servidor. Não coloque essa chave no frontend.

## Vercel

Use a Vercel Free apenas para hospedar o painel e os endpoints.

## Sender Telegram

O bot continua sendo usado para capturar modelos. Para publicar em canal preservando
custom emoji, configure tambem uma conta Telegram admin do canal:

```bash
npm run telegram:login
```

Depois salve a sessao gerada como `TELEGRAM_STRING_SESSION` no Vercel e na VPS, junto com:

- `TELEGRAM_SEND_MODE=auto`
- `TELEGRAM_API_ID`
- `TELEGRAM_API_HASH`
- `TELEGRAM_PHONE`

Se `TELEGRAM_STRING_SESSION` nao existir, o sistema usa Bot API como fallback. Nesse fallback
o Telegram pode trocar custom emoji por emoji comum em canais.

A Vercel Hobby nao aceita cron por minuto. Para manter tudo free, rode o worker na VPS:

```bash
npm run worker
```

Ele chama `/api/run-schedule` automaticamente usando `PUBLIC_APP_URL` e `CRON_SECRET`.

## Domínio

Configure o domínio próprio no painel da Vercel e ajuste `PUBLIC_APP_URL`.

## Operação

1. Configure bot, canal e modelos uma vez.
2. No dia a dia, escolha o projeto, cole a lista e clique em `Subir lista`.
3. O painel pode ficar fechado; o worker da VPS chama o endpoint de envio.
