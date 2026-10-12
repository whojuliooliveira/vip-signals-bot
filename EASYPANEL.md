# EasyPanel

Use um unico servico para o ingles agora. O mesmo container sobe o painel e o worker.

## Build

- Build type: Dockerfile
- Dockerfile: `Dockerfile`
- Porta: `3000`
- Comando: deixe o padrao da imagem
- Em `Ambiente`, deixe `Create env file` ligado para o container receber as variaveis tambem em runtime.

## Variaveis obrigatorias

Copie os valores reais do `.env.local`/Supabase para o EasyPanel, sem expor no frontend:

```env
ADMIN_PASSWORD=
CRON_SECRET=
CAPTURE_SECRET=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

TELEGRAM_SEND_MODE=auto
TELEGRAM_API_ID=
TELEGRAM_API_HASH=
TELEGRAM_PHONE=
TELEGRAM_STRING_SESSION=
TELEGRAM_TARGET_PEER=

PROJECT_1_ID=expert_a
PROJECT_1_NAME=💎 José Álvarez | Señales VIP 💎
PROJECT_1_LANGUAGE=es
PROJECT_1_BOT_TOKEN=
PROJECT_1_CHAT_ID=
PROJECT_1_LINK=
PROJECT_1_BROKER_LABEL=Haz clic aquí

PROJECT_2_ID=expert_b
PROJECT_2_NAME=💎 Tom Reed | VIP Signals 💎
PROJECT_2_LANGUAGE=en
PROJECT_2_BOT_TOKEN=
PROJECT_2_CHAT_ID=
PROJECT_2_LINK=https://u3.shortink.io/smart/HLsHbhHwDmx6gu
PROJECT_2_BROKER_LABEL=Click here

WORKER_INTERVAL_MS=20000
```

Para usar um numero operacional novo, gere uma nova `TELEGRAM_STRING_SESSION` com esse numero.
Nao reutilize sessao de conta pessoal em producao.

`PUBLIC_APP_URL` pode ficar vazio nesse modo. O worker usa `http://127.0.0.1:3000` dentro do container.

## Operacao

1. Abra o painel pelo dominio/subdominio do EasyPanel.
2. Capture os modelos do ingles uma vez.
3. Cole a lista em `Lista do dia` e clique em `Subir lista`.
4. O worker continua enviando mesmo com o painel fechado.

Para ativar espanhol depois, preencha bot/canal/link do `PROJECT_1_*`, capture os modelos em espanhol e mantenha o mesmo fluxo.
