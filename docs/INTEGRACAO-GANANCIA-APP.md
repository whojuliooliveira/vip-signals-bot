# Integração com o Ganancia App

## Regra operacional

- `expert_a` (José / espanhol) é sincronizado com o Ganancia App.
- `expert_b` (Tom / inglês) continua somente no Disparador e no Telegram.
- Salvar ou substituir a lista do José espelha a data inteira no aplicativo.
- Apagar a lista do José apaga a mesma data no aplicativo.
- Repetir o salvamento é seguro: sinais iguais não são duplicados.
- Resultados já apurados são preservados quando o sinal continua na lista.

## Fluxo

1. O Disparador valida e persiste a lista normalmente.
2. Ele envia a lista estruturada para `/api/internal/signals/sync` do Ganancia App.
3. O Ganancia App insere os novos sinais, preserva os iguais e remove os retirados.
4. A interface só confirma sucesso completo depois que o aplicativo responde.
5. Há três tentativas automáticas. Se todas falharem, a lista permanece salva no
   Disparador e o modal pede para salvar novamente, evitando falha silenciosa.

## Segurança e ambiente

O endpoint exige `Authorization: Bearer` e nunca aceita sessão de usuário comum.

- Ganancia App: `SIGNALS_SYNC_SECRET`.
- Disparador: `GANANCIA_APP_SYNC_SECRET`; quando vazio, usa `CRON_SECRET`.
- URL opcional: `GANANCIA_APP_SYNC_URL`.

O segredo deve existir somente nos ambientes de servidor. Nunca use variável
`NEXT_PUBLIC_*` para essa integração.
