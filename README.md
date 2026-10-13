# VIP Signals Bot

Projeto 100% separado para enviar sinais VIP em dois canais: espanhol e ingles.

## Documentacao operacional

Consulte [docs/AUTOMACAO-OPERACIONAL.md](docs/AUTOMACAO-OPERACIONAL.md) para o fluxo completo da automacao, regra dos cinco minutos, arquitetura remota, operacao diaria e solucao de falhas.

## O que tem

- Painel web publicado na Vercel.
- Dados persistentes no Supabase.
- Worker remoto no EasyPanel verificando a agenda a cada 20 segundos.
- Envio automatico de sinais cinco minutos antes do horario.
- Canais, contas Telegram, modelos e links separados por idioma.
- Conexao e troca de conta Telegram diretamente no painel.
- Modelos capturados diretamente do Telegram.
- Mensagens padrao com agenda configuravel.
- Historico de envios e heartbeat operacional.
- Gerenciamento de listas por canal e data.

## Rodar local

```powershell
npm install
copy .env.example .env.local
npm run dev
```

Abra `http://127.0.0.1:5180`.

## Vercel

Configure as variaveis da `.env.example` no projeto da Vercel.

O bot precisa estar como admin nos dois canais/grupos com permissao de postar.

O worker do EasyPanel chama `/api/run-schedule` com o `CRON_SECRET`. O Supabase guarda listas, configuracoes, modelos e historico.
