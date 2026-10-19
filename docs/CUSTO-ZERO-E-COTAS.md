# Operacao dentro das cotas gratuitas

## Diagnostico de 19/10/2026

Foram recebidos dois alertas:

- Vercel Hobby com 100% das 4 horas de Fluid Active CPU;
- organizacao Supabase RuptoAI acima da cota gratuita de egress.

A causa principal estava no Disparador de Sinais. O worker chamava a Vercel a cada 20 segundos, cerca de 4.320 vezes por dia. Cada ciclo carregava todos os sinais historicos, ate 1.000 logs, todas as chaves de agenda, configuracoes e sessoes de captura. Quando havia envio, novas leituras completas eram feitas para cada canal.

O painel aberto tambem recarregava o mesmo conjunto completo a cada 12 segundos.

## Correcao aplicada

- A agenda roda dentro do container do EasyPanel em `http://127.0.0.1:3000`.
- A Vercel nao recebe mais os pulsos automaticos.
- O intervalo passou para 60 segundos, mantendo a janela operacional de cinco minutos.
- Cada ciclo consulta apenas configuracoes e sinais cujos horarios podem vencer nos proximos cinco minutos.
- Logs, capturas, listas antigas e chaves historicas nao entram no ciclo.
- Chaves de deduplicacao sao consultadas somente quando existe mensagem padrao potencialmente devida.
- O painel carrega os dados completos apenas na abertura ou apos uma acao. O monitoramento periodico consulta somente o heartbeat em `/api/status`, a cada 60 segundos.

Em uma validacao real, a consulta operacional retornou 2 projetos, 4 mensagens, 6 sinais candidatos e aproximadamente 3,7 KB. Nenhum log, historico de chaves ou sessao de captura foi carregado.

## DMS Operacao

O mesmo projeto Supabase tambem atende o DMS Operacao. Na auditoria de 19/10/2026:

- banco pequeno, com as maiores tabelas abaixo de 7 MB;
- Storage `midia-campanha` com 1.117 objetos e aproximadamente 503 MB;
- 4.442 mensagens registradas nos ultimos 30 dias;
- 663 mensagens registradas nos ultimos sete dias.

O DMS Operacao usa URLs publicas do Storage para algumas imagens, portanto ele ainda produz egress real. Entretanto, o padrao explosivo que explica a ultrapassagem era a releitura integral e continua feita pelo Disparador. Nao foi alterado o envio do DMS Operacao neste incidente para evitar risco desnecessario na operacao principal.

## Implantacao obrigatoria no EasyPanel

Depois de publicar o codigo no GitHub, reconstruir o servico `vip-signals-bot` no EasyPanel. O log correto deve mostrar:

```text
Worker chamando http://127.0.0.1:3000/api/run-schedule
Worker de sinais ligado: http://127.0.0.1:3000 a cada 60s
```

As variaveis recomendadas sao:

```text
SCHEDULER_APP_URL=http://127.0.0.1:3000
WORKER_INTERVAL_MS=60000
```

`PUBLIC_APP_URL` pode continuar existindo para referencia externa, mas nao controla mais o destino do worker quando `SCHEDULER_APP_URL` esta definido.

## Limites relevantes

- Vercel Hobby: 4 horas de Active CPU. Ao ultrapassar a cota, projetos Hobby podem ser pausados.
- Supabase Free: 5 GB de egress nao cacheado e 5 GB cacheado por organizacao e por ciclo.
- O consumo ja ocorrido nao diminui retroativamente. A correcao reduz o consumo futuro.

Referencias oficiais:

- https://vercel.com/docs/functions/usage-and-pricing
- https://vercel.com/docs/plans/hobby
- https://supabase.com/docs/guides/platform/manage-your-usage/egress
- https://supabase.com/docs/guides/platform/billing-faq

## Acompanhamento

1. Confirmar heartbeat no painel apos o redeploy do EasyPanel.
2. Conferir na Vercel que o projeto `vip-signals-bot` parou de receber invocacoes periodicas.
3. Conferir no Supabase a curva de Database Egress nas 24 a 48 horas seguintes.
4. Se o egress continuar acima da meta, a proxima etapa e armazenar e reutilizar `file_id` do Telegram para as imagens recorrentes do DMS Operacao, evitando que o Telegram baixe a mesma imagem do Storage em cada envio.
