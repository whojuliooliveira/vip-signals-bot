# Deploy na VPS

Como sao **dois projetos/experts diferentes**, use **dois bots diferentes**.

O painel pode ser um so, rodando na mesma VPS, mas cada projeto tem:

- bot token proprio;
- canal/grupo proprio;
- nome/titulo proprio;
- link proprio;
- idioma/template proprio.

## Variaveis

```env
ADMIN_PASSWORD=senha-forte
CRON_SECRET=segredo-para-cron

PROJECT_1_ID=expert_a
PROJECT_1_NAME=💎 José Álvarez | Señales VIP 💎
PROJECT_1_LANGUAGE=es
PROJECT_1_BOT_TOKEN=token_do_bot_espanhol
PROJECT_1_CHAT_ID=-100...
PROJECT_1_LINK=https://link-projeto-1
PROJECT_1_BROKER_LABEL=Haz clic aquí

PROJECT_2_ID=expert_b
PROJECT_2_NAME=💎 Tom Reed | VIP Signals 💎
PROJECT_2_LANGUAGE=en
PROJECT_2_BOT_TOKEN=token_do_bot_ingles
PROJECT_2_CHAT_ID=-100...
PROJECT_2_LINK=https://link-projeto-2
PROJECT_2_BROKER_LABEL=Click here
```

## Rodar

```bash
npm install
npm run build
npm run start
```

Para PM2:

```bash
pm2 start npm --name vip-signals-bot -- start
pm2 save
```

## Agenda automatica

Se o painel estiver na Vercel Free, rode o worker na VPS:

```bash
PUBLIC_APP_URL=https://seu-app.vercel.app CRON_SECRET=segredo-para-cron npm run worker
```

Para PM2:

```bash
pm2 start npm --name vip-signals-worker -- run worker
pm2 save
```

Em producao, use Supabase para mensagens fixas, horarios e historico. O arquivo local `data/store.json` fica apenas para teste local.

Cada bot precisa ser admin no canal/grupo correspondente com permissao para postar.
