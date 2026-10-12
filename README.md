# VIP Signals Bot

Projeto 100% separado para enviar sinais VIP em dois canais: espanhol e ingles.

## O que tem

- Painel web para Vercel.
- API protegida por `ADMIN_PASSWORD`.
- Envio para canal ES, EN ou ambos.
- Templates separados por idioma.
- Links separados por idioma.
- Preview antes de enviar.
- Botao inline opcional com o link do broker.
- Biblioteca editavel de mensagens fixas.
- Agenda por dia: segunda a sexta, sabado e domingo.
- Monitor de envios salvo em `data/store.json`.

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

Para agenda automatica, chame `/api/run-schedule` a cada minuto com o header `x-cron-secret` igual ao `CRON_SECRET`.

Na VPS, o arquivo `data/store.json` guarda mensagens, agenda e historico. Em Vercel puro, use um banco externo antes de depender desse arquivo.
