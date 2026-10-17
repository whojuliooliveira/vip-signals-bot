# Automacao operacional do Disparador De Sinais

Documento verificado em 13/10/2026. Todos os horarios abaixo usam `America/Sao_Paulo` (Brasilia, UTC-3).

## Resposta direta: o computador precisa ficar ligado?

Nao. Depois que a lista e salva, o navegador pode ser fechado e o computador pode ser desligado.

A automacao depende de quatro servicos remotos:

1. **Vercel**: hospeda o painel e executa as APIs.
2. **Supabase**: guarda canais, listas, sinais, modelos, configuracoes e historico.
3. **EasyPanel**: mantem o worker ativo e chama a agenda a cada 20 segundos.
4. **Telegram**: recebe os envios pelo Bot API ou pela conta Telegram conectada.

O computador so volta a ser necessario para manutencao ou alteracao de codigo. A troca da conta Telegram passa a ser feita no proprio painel.

Na verificacao que originou este documento, o painel publicado respondeu normalmente e o worker remoto estava atualizando o heartbeat. O estado atual deve ser conferido pelo indicador **Sistema online** na barra lateral.

## Arquitetura atual

```text
Usuario no navegador
        |
        v
Painel e APIs na Vercel
        |
        +---- Supabase (dados persistentes)
        |
        +---- Telegram (envios)
        ^
        |
Worker no EasyPanel, a cada 20 segundos
```

### Painel e APIs

Endereco oficial:

`https://vip-signals-bot-bice.vercel.app`

O painel e apenas a interface de operacao. Fechar essa pagina nao interrompe o automatico.

### Banco de dados

O Supabase e a fonte persistente dos dados. Ele armazena:

- projetos/canais;
- listas e sinais;
- mensagens automaticas;
- modelos capturados;
- registros de envio;
- chaves que impedem repeticao de mensagens padrao;
- heartbeat do worker;
- sessoes de captura de modelo.
- configuracao e sessao Telegram separadas por canal.

### Worker

O container `vip-signals-bot` no EasyPanel inicia:

- uma instancia interna do Next.js;
- o processo `scripts/schedule-worker.mjs`.

O worker chama a API publica da Vercel em `/api/run-schedule` a cada `WORKER_INTERVAL_MS`. O valor operacional atual e 20.000 ms, ou 20 segundos.

A chamada usa `CRON_SECRET`. O mesmo segredo precisa existir no EasyPanel e na Vercel.

O worker evita iniciar uma segunda verificacao enquanto a anterior ainda esta rodando. Deve existir apenas uma replica ativa desse worker para evitar concorrencia desnecessaria.

## Fluxo diario completo

### 1. Escolher canal e data

Na area **Listas** do painel:

1. selecione `Tom` ou `Jose`;
2. selecione a data literal dos sinais;
3. clique em **Importar lista**.

A data e literal. Um sinal de `14/10/2026 00:00` pertence ao dia 14 e tem envio previsto para `13/10/2026 23:55`.

### 2. Importar a lista

O formato principal aceito e:

```text
M5;AUDCAD-OTC;14:30;PUT
M5;AUDNZD-OTC;14:45;CALL
```

O importador tambem reconhece linhas com:

- par no formato `AUD/CAD`;
- horario `HH:mm`;
- direcoes `UP`, `CALL`, `BUY`, `DOWN`, `PUT` ou `SELL`;
- equivalentes em espanhol e portugues previstos pelo parser.

Linhas repetidas da mesma importacao sao ignoradas. Linhas que parecem sinais, mas nao possuem ativo, horario ou direcao reconhecivel, geram erro e impedem o salvamento ate serem corrigidas.

### 3. Classificacao automatica ou manual

Um sinal entra no automatico quando atende simultaneamente a estas regras:

- horario entre `07:25` e `03:30` de segunda a sexta, entre `08:25` e `03:30` no sabado e entre `09:05` e `03:30` no domingo;
- minuto terminado em `:55`, `:00`, `:05`, `:25`, `:30` ou `:35`;
- ainda nao foi enviado;
- a janela de envio ainda nao expirou.

Sinais fora desses criterios continuam salvos e visiveis, mas ficam como **Manual**. Eles podem ser enviados pelo botao **Enviar agora**.

### 4. Tela principal

A tela abre na aba **Proximos**.

**Proximos** mostra somente sinais que:

- sao elegiveis para o automatico;
- ainda nao foram enviados;
- ainda nao expiraram;
- nao possuem erro registrado.

**Todos** mostra a lista completa da data, incluindo manuais, expirados e enviados.

### 5. Listas salvas

O botao **Listas salvas** mostra todas as combinacoes de canal e data existentes no banco.

Cada lista informa:

- data;
- canal;
- quantidade total de sinais;
- quantidade enviada.

Comandos:

- **Ver**: abre o canal e a data daquela lista na visao completa.
- **Apagar**: pede confirmacao e remove todos os sinais daquela lista.

Apagar uma lista nao apaga o historico de envios. O historico continua servindo como registro operacional.

## Regra exata de envio dos sinais

Para cada sinal, o sistema calcula:

```text
horario de envio = data do sinal + horario do sinal - 5 minutos
```

Exemplos:

| Sinal | Envio automatico |
|---|---|
| 13/10 14:30 | 13/10 14:25 |
| 13/10 00:00 | 12/10 23:55 |
| 14/10 00:00 | 13/10 23:55 |

### Janela de tolerancia

O sinal fica elegivel desde cinco minutos antes ate o horario do proprio sinal.

Exemplo para um sinal das `14:30`:

- inicio da janela: `14:25:00`;
- fim da janela: aproximadamente `14:30:00`;
- o worker verifica a cada 20 segundos;
- no primeiro ciclo dentro da janela, o sinal e enviado;
- depois do fim da janela, ele fica **Expirado** e nao existe envio atrasado automatico.

Essa tolerancia protege contra pequenos atrasos do worker. Ela nao serve como recuperacao de uma queda longa.

### O que acontece no envio

Quando encontra um sinal devido, a API:

1. confirma que o canal esta ativo;
2. carrega as credenciais e o modelo do canal;
3. substitui os campos variaveis do modelo, como ativo, direcao e horario;
4. envia ao Telegram;
5. salva `sentAt` e o ID da mensagem;
6. grava um registro de sucesso;
7. o sinal deixa de aparecer em **Proximos**.

Se o Telegram retornar erro, o erro e registrado. Enquanto a janela ainda estiver aberta, o worker pode tentar novamente nos ciclos seguintes. Depois que a janela expira, nao ha nova tentativa automatica.

## Status dos sinais

| Status | Significado |
|---|---|
| Aguardando | Elegivel e com horario futuro |
| Enviado | Envio automatico concluido e persistido |
| Manual | Fora dos criterios do automatico |
| Expirado | A janela automatica terminou sem envio |
| Erro | O ultimo envio encontrou uma falha |

O botao **Enviar agora** permanece disponivel para qualquer linha, inclusive manual ou expirada.

### Atencao ao envio manual de um sinal

Atualmente, **Enviar agora** publica a mensagem e grava o envio no historico, mas nao cancela automaticamente a programacao original daquela linha. Se um sinal futuro elegivel for enviado manualmente antes do horario, ele ainda pode ser enviado novamente pelo automatico quando chegar sua janela.

Para impedir a segunda publicacao, remova ou substitua a lista antes da janela automatica. Esse comportamento nao se aplica aos botoes **Testar** das mensagens padrao: eles sempre enviam uma copia de teste sem alterar a agenda.

## Mensagens padrao

Existem quatro tipos:

1. Emoji de abertura;
2. Bom dia;
3. Inicio das analises;
4. Boa noite.

Cada mensagem pode ser ativada/desativada e ter horario proprio. Os valores iniciais do codigo sao:

| Mensagem | Segunda a sexta | Sabado | Domingo |
|---|---:|---:|---:|
| Emoji de abertura | 06:54 | 07:50 | 08:55 |
| Bom dia | 07:01 | 08:00 | 09:00 |
| Inicio das analises | 07:15 | 08:15 | 09:00 |

O primeiro sinal automatico respeita a abertura de cada dia e sai cinco minutos antes do horario da operacao:

| Dia | Primeiro sinal | Envio |
|---|---:|---:|
| Segunda a sexta | 07:25 | 07:20 |
| Sabado | 08:25 | 08:20 |
| Domingo | 09:05 | 09:00 |

Sinais anteriores a essas aberturas ficam manuais. A faixa da madrugada ate `03:30` continua valida para o encerramento da operacao do respectivo dia.

Boa noite usa configuracao individual por dia da semana. As configuracoes salvas no painel/Supabase prevalecem sobre os valores iniciais do codigo.

O horario de retorno escrito dentro do modelo de boa noite e dinamico pelo dia do disparo em Brasilia: segunda a sexta informa `7 a.m UTC-3`, sabado informa `8 a.m UTC-3` e domingo informa `9 a.m UTC-3`. A troca acontece no envio e preserva o restante do modelo capturado.

### Como a agenda das mensagens funciona

Em cada ciclo, o sistema:

1. identifica o dia da semana em Brasilia;
2. encontra as mensagens ativas para aquele horario;
3. envia para cada canal ativo associado;
4. cria uma chave unica com data, horario, mensagem e canal;
5. nao envia novamente se essa chave ja existir.

A janela das mensagens padrao vai do horario programado ate quatro minutos depois. Depois disso nao existe recuperacao automatica.

### Botao Testar

O botao **Testar** envia uma copia imediata da mensagem ao canal. Ele nao marca a mensagem agendada como concluida e nao cancela o proximo envio automatico.

Os testes ficam na area **Mensagens**, junto do historico de sucessos e erros. Eles foram removidos da tela de listas para manter a operacao diaria enxuta.

## Modelos e formatacao

Os modelos sao salvos por canal para:

- CALL/BUY;
- PUT/SELL;
- emoji de abertura;
- bom dia;
- inicio das analises;
- boa noite.

Ao capturar um modelo:

1. o painel cria uma sessao de captura de cinco minutos;
2. voce publica o exemplo original no canal;
3. o painel consulta as atualizacoes do bot;
4. texto, entidades, midia e botoes sao capturados quando disponiveis;
5. campos variaveis do sinal viram marcadores reutilizaveis;
6. o modelo e salvo no Supabase.

Durante a captura, a pagina precisa permanecer aberta para continuar consultando o resultado. Depois de capturado e salvo, o computador nao e mais necessario.

## Canais e contas Telegram independentes

Cada canal possui sua propria configuracao:

- nome e idioma;
- canal ativo ou inativo;
- token do bot;
- Chat ID;
- link e texto do botao;
- modelos de sinais e mensagens;
- modo de envio;
- conta Telegram conectada;
- destino alternativo, quando necessario.

Alterar o espanhol nao altera o ingles. A sessao antiga configurada por variavel de ambiente continua sendo usada apenas como compatibilidade do canal ingles ate que uma conta seja conectada diretamente nele.

### Conectar ou trocar uma conta

1. Abra **Configuracoes**.
2. Escolha o canal no topo.
3. Abra **Conta Telegram deste canal**.
4. Clique em **Conectar conta** ou **Trocar conta**.
5. Informe o telefone com codigo do pais. API ID e API Hash aparecem somente quando ainda nao existem credenciais tecnicas no servidor.
6. Digite o codigo recebido no aplicativo Telegram.
7. Se a conta tiver verificacao em duas etapas, informe a senha 2FA.
8. Confira o nome da conta exibido no painel.

API ID e API Hash sao obtidos em `my.telegram.org`. O codigo e a senha 2FA sao exigencias do Telegram; nao existe senha adicional do painel.

### Formas de envio

- **Automatico**: usa a conta Telegram quando o modelo possui emoji personalizado e usa o bot nos demais casos.
- **Somente bot**: todos os payloads compativeis sao enviados pelo Bot API; emojis personalizados podem perder a aparencia.
- **Somente conta Telegram**: mensagens de texto sao publicadas pela conta conectada.

Midias capturadas continuam usando o bot. A conta conectada precisa participar do canal e ter permissao para publicar. Para preservar emoji personalizado, ela tambem precisa ter o recurso disponivel na propria conta.

## Como o Telegram e escolhido

Com `TELEGRAM_SEND_MODE=auto`:

- mensagens com emoji personalizado usam a conta Telegram conectada;
- mensagens comuns tentam usar o Bot API;
- se o Bot API falhar e o payload for compativel, o sistema pode usar a conta conectada;
- mensagens com midia usam o Bot API.

A compatibilidade antiga do canal ingles depende de:

- `TELEGRAM_API_ID`;
- `TELEGRAM_API_HASH`;
- `TELEGRAM_STRING_SESSION`;
- conta autorizada e, para custom emoji, Premium/permissoes adequadas.

Depois que uma conta e conectada pelo painel, esses dados ficam persistidos por canal no Supabase e prevalecem sobre a compatibilidade antiga.

## Indicador Sistema online

O EasyPanel chama a agenda e a API grava um heartbeat no Supabase.

O painel mostra **Sistema online** quando o heartbeat tem menos de dois minutos. Isso confirma que o worker esta chamando a Vercel recentemente.

O indicador nao garante sozinho que o Telegram aceitou todas as mensagens. Para isso, abra **Mensagens** e confira **Ultimos envios** do canal.

## Pausa por canal

Em **Configuracoes**, selecione `Tom` ou `Jose` e use o controle destacado no topo:

- **Desativar** pausa sinais e mensagens automaticas somente daquele canal;
- o outro canal continua operando;
- envio manual continua disponivel;
- **Ativar** libera novamente os proximos horarios ainda validos;
- nao ha recuperacao dos horarios que expiraram durante a pausa.

Espere o painel mostrar **Alteracoes salvas** antes de fechar.

## O que precisa permanecer ativo

Para operar sem o computador:

- projeto da Vercel implantado e acessivel;
- Supabase ativo;
- servico `vip-signals-bot` verde no EasyPanel;
- `PUBLIC_APP_URL` apontando para a URL oficial;
- `CRON_SECRET` igual no EasyPanel e na Vercel;
- conta Telegram conectada no painel, quando o modelo usa emoji personalizado;
- bot/conta com permissao de publicar no canal;
- sessao Telegram autorizada;
- canal marcado como ativo no painel.

## Variaveis de ambiente

Nunca coloque os valores reais em documentacao, commit, print ou mensagem publica.

### Vercel

- `CRON_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TELEGRAM_SEND_MODE`
- `TELEGRAM_API_ID`
- `TELEGRAM_API_HASH`
- `TELEGRAM_STRING_SESSION`
- `TELEGRAM_TARGET_PEER` quando necessario
- variaveis `PROJECT_1_*`
- variaveis `PROJECT_2_*`

### EasyPanel

O worker precisa, no minimo, de:

- `PUBLIC_APP_URL=https://vip-signals-bot-bice.vercel.app`
- `CRON_SECRET` igual ao da Vercel
- `WORKER_INTERVAL_MS=20000`

O container atual recebe outras variaveis porque tambem inicia uma instancia interna do painel.

## Falhas e comportamento esperado

### EasyPanel parado

- o painel continua abrindo;
- importacao e envio manual continuam dependendo da Vercel;
- sinais e mensagens automaticas param;
- o indicador fica sem confirmacao apos aproximadamente dois minutos;
- horarios que expirarem durante a parada nao sao enviados depois.

### Vercel indisponivel

- painel e APIs param;
- o worker registra erro HTTP/conexao;
- nao ha envio ate a Vercel voltar;
- janelas vencidas nao sao recuperadas.

### Supabase indisponivel

- listas e configuracoes nao carregam;
- agenda nao consegue consultar/salvar o estado;
- heartbeat para de atualizar;
- o automatico deve ser considerado indisponivel.

### Telegram rejeita o envio

Possiveis causas:

- bot sem permissao;
- Chat ID incorreto;
- token revogado;
- sessao Telegram expirada;
- conta sem acesso ao canal;
- custom emoji sem suporte/permissao;
- modelo de midia invalido.

O erro aparece no historico e/ou no status da linha.

## Checklist diario

1. Abra o painel.
2. Confirme **Sistema online**.
3. Selecione canal e data correta.
4. Importe a lista.
5. Abra **Proximos** e confira o que realmente sera disparado.
6. Abra **Todos** para conferir manuais e expirados.
7. Use **Listas salvas** para validar canal, data e quantidade.
8. Confirme no Telegram o primeiro envio do dia.
9. Abra **Mensagens** e acompanhe **Ultimos envios** quando necessario.

Depois disso, o navegador e o computador podem ser desligados.

## Checklist quando nada sair

1. Veja se o indicador esta verde.
2. Abra **Proximos** e confirme que o sinal ainda esta na janela futura.
3. Confira se a data da lista esta correta.
4. Em **Configuracoes**, confira se a automacao do canal esta **Ativa**.
5. Em **Mensagens**, veja **Ultimos envios** e o status da linha.
6. Confira o servico `vip-signals-bot` no EasyPanel.
7. Confira os logs do worker procurando resposta `401`, erro da Vercel ou erro do Telegram.
8. Se houver `401`, compare `CRON_SECRET` entre EasyPanel e Vercel.
9. Se houver erro de sessao, abra **Configuracoes**, selecione o canal e use **Trocar conta**.
10. Se o horario ja expirou, use **Enviar agora** ou importe uma lista corrigida; o automatico nao faz catch-up.

## Espanhol sem bot no canal

O projeto espanhol opera somente pela conta Telegram conectada. Nenhum bot precisa participar do canal espanhol.

1. Em **Configuracoes**, selecione o canal espanhol.
2. Informe o Chat ID do canal espanhol ou use **Destino alternativo** com `@usuario_do_canal`.
3. Conecte uma conta Telegram que seja administradora do canal espanhol e tenha permissao para publicar.
4. Abra **Modelos** e escolha o modelo espanhol que deseja capturar.
5. Clique em **Capturar modelo**.
6. Publique o modelo em espanhol no canal ingles. O bot do ingles faz somente a leitura dessa mensagem.
7. O painel salva o modelo no projeto espanhol, sem substituir os modelos ingleses.
8. Teste o modelo pelo painel com o canal espanhol selecionado.

Envios manuais e automaticos do espanhol usam sempre a conta conectada. Texto, formatacao, links e emojis personalizados sao preservados. Modelos com foto, video, animacao ou documento ainda exigem um transporte de midia compativel e nao fazem parte do modo espanhol sem bot.

## Seguranca operacional

Por decisao operacional expressamente confirmada, o painel esta publico e nao pede senha. Isso tambem deixa publicas as acoes de enviar, alterar configuracoes, apagar listas e iniciar a troca de conta para quem conhecer a URL. A conclusao da conexao ainda exige o codigo oficial do Telegram e a senha 2FA quando habilitada.

O endpoint da agenda continua protegido por `CRON_SECRET`, e os segredos nao sao exibidos pelo painel. Mesmo assim:

- nao compartilhe a URL desnecessariamente;
- nunca exponha tokens, service role key ou string session;
- rotacione qualquer credencial que tenha aparecido em logs, prints ou conversas compartilhadas;
- considere reativar uma protecao de acesso se o endereco circular fora da equipe.

## Resumo final

O fluxo automatico nao depende do computador. A lista fica no Supabase, o EasyPanel acorda a agenda a cada 20 segundos, a Vercel decide o que esta no horario e envia ao Telegram. O ponto de maior importancia operacional e manter o worker do EasyPanel verde e conferir o indicador de heartbeat no painel.
