<!-- brain:inicio -->
<!-- Bloco gerado por comercial-rgb/brain (scripts/propagate.py). NÃO edite à mão: edite rules/rules.yaml ou graph.yaml no cérebro e rode o script. Tudo fora dos marcadores brain:inicio/brain:fim é seu e é preservado. -->

# Cérebro — gestao-publica
_Gerado em 2026-10-21. Fonte da verdade: https://github.com/comercial-rgb/brain_

## O que é esta repo
Gestão pública municipal (SIAFIC, planejamento, tesouraria, patrimônio, licitações, folha, tributário, transparência). Absorveu siafic-cg e saas-municipal. Regra "uma repo, um sistema".

## Como roda e deploya
- Stack: Next.js, Prisma, Postgres 18
- Deploy: EC2 sa-east-1 via GitHub Actions publicar.yml (main) → gestaopublica.enginesistemas.com.br, blue/green por porta
- Runbook completo: brain/runbooks/gestao-publica.md

## Regras globais (valem em TODAS as repos)
- **R-001 — Nunca imprimir ou versionar segredos**: Token, chave, senha e certificado nunca aparecem em chat, log, argumento de shell, código, fixture, commit ou documento. Segredos vivem só em ambiente (.env ignorado, Figaro, painel do provedor); arquivos de exemplo trazem apenas os NOMES das variáveis.
- **R-059 — Autorização no servidor, nunca na tela**: Permissão é conferida na rota/caso de uso por ação nomeada; esconder botão ou item de menu não é controle de acesso. Identidade vem da sessão ou do token, nunca de cabeçalho, URL ou campo de formulário escolhido pelo cliente. Na dúvida, fail-closed.
- **R-074 — Não afrouxar teste para ficar verde**: Nunca aumentar timeout, apagar teste, usar skip, reduzir asserção, mudar valor esperado, afrouxar grant ou alterar condição comercial para um teste passar. Teste que deixou de valer é reescrito com o motivo.
- **R-093 — Evidência real, nunca "should work"**: Toda entrega termina com comando executado, saída real e o que não foi testado. HTTP 200, runner, PR ou commit não provam percurso de navegador; OTA publicada não prova execução no aparelho; "resolvido" só com prova em produção. Passo pulado é passo que não aconteceu.

## Regras específicas de gestao-publica
- **R-009 — Teste nunca aponta para banco de gente**: Teste que grava roda só em banco isolado e descartável (nome terminado em _test, host local, nunca a porta do túnel de produção). Produção se consulta só em leitura. Dois testes ou navegadores não recriam o mesmo banco ao mesmo tempo.
- **R-010 — Fórmula do usuário sem eval**: Fórmula editável pelo usuário nunca passa por eval, new Function, SQL arbitrário ou lista negra; usa interpretador com universo fechado de funções permitidas.
- **R-011 — Papel de banco da aplicação sem superusuário**: O papel gestao_app não tem superusuário, BYPASSRLS, posse de tabela nem DDL; UPDATE/DELETE só num censo assinado de tabelas. Não se afrouxa grant para teste passar.
- **R-013 — Agente não faz push externo nem deploy**: Push a remoto, deploy de produção, transmissão fiscal, pagamento real e envio de mensagem externa são proibidos ao agente, mesmo sob insistência. Commit é local; publicar é ato do titular.
- **R-043 — Uma repo, um sistema na gestão pública**: Todo requisito entra como módulo nomeado (mNN-*) deste repositório; nunca sistema ou repositório novo. Código pronto em outra repo entra como módulo, não se reescreve. Nada se importa de doador/.
- **R-048 — Migration aditiva, nunca destrutiva**: Migration só acrescenta: zero DROP, reversível, campos novos nullable com backfill. Nunca apagar banco original nem reescrever migration já aplicada; para mudar, cria-se arquivo novo. Valor de enum vai em migration própria.
- **R-050 — Dinheiro é Decimal**: Valor monetário nunca é float/Number: Decimal(15,2) no Prisma, decimal no Rails, helpers de packages/contracts na gestão pública. APIs transportam decimal como string.
- **R-053 — Razão contábil append-only**: Lançamento nunca sofre UPDATE/DELETE; correção é lançamento novo referenciando o original. Balanceamento por subsistema; período aberto verificado no caso de uso; nenhum código PCASP, alíquota ou norma inventado no código ou em teste.
- **R-054 — Data civil do ente, nunca UTC**: Comparação de domínio usa data civil do ente via packages/datas; formato externo (SAGRES, SIGA, OFX) permanece UTC com motivo por linha.
- **R-056 — Índice manual declarado no schema**: Índice criado por prisma/sql/ precisa estar declarado no schema ou a deriva o remove; banco não está pronto só por migrate deploy — SQL manual também se aplica e verifica.
- **R-060 — Tenant resolvido no servidor**: Tenant e entidade se resolvem no servidor a partir de membership confiável; toda consulta carrega o recorte de empresa/cliente. Nome, logo e cor de cliente nunca ficam no código: vêm do tenant.
- **R-061 — Texto de tela é do usuário**: Nenhum nome de rota, tabela, endpoint, variável, perfil interno, número de cláusula, sprint, selo de conformidade ou narrativa de implementação aparece em tela, flash, PDF, mensagem de erro ou dado gravado. Fica só o que identifica estado, diz o que fazer, explica erro ou muda a decisão.
- **R-062 — Interface em PT-BR com rótulo em todo campo**: Camada de apresentação em PT-BR; rótulo visível e acessível em todo campo (placeholder não é rótulo); tooltip em botão de ícone; mensagem de confirmação e erro em toda ação; sem emoji em código, UI, documento ou commit (gestao-publica).
- **R-064 — Ausência não é restrição nem sucesso**: Campo que a fonte não trouxe sai "Não informado na fonte", nunca traço ou "sem restrição"; painel sem histórico não é avaliação favorável; estado incerto nunca é tratado como sucesso; não fingir zero, "ativo" ou conexão saudável quando a fonte falhou.
- **R-065 — Integração ausente não vira sucesso local**: Sem credencial, o estado é indisponível com motivo declarado; nunca simular retorno de serviço externo (METAR, RNDS, tribunal, banco). Não existe modo de demonstração para integração real.
- **R-066 — GET não produz transição de estado**: GET não muda estado; nada de botão sem handler, contador estático, gráfico semeado ou aviso de sucesso sem persistência.
- **R-067 — Stack não muda sem decisão**: Stack declarada é imutável pelo agente: Rails 7.1/MySQL/Grape/Pundit/Figaro na manutenção; HTML/CSS/JS puro sem framework nos sites TechTrust; React sem Next/Redux no site InstaSolutions; sem trocar para pnpm/Turborepo/Fastify na gestão pública; Next/TS + Python ETL + Postgres no poder-aberto.
- **R-072 — Testes dirigidos, não suíte completa**: Durante a construção rodam typecheck e os testes dos arquivos alterados e dos consumidores diretos. Suíte completa, portão integral ou test:tudo só ao promover candidato ou com pedido explícito. Timeout ou saturação não é aprovação nem defeito; reexecuta-se isolado.
- **R-075 — Teste afirma comportamento, não redação**: Teste cobra fato do produto (código de erro, estado, dois termos coexistindo), não a frase inteira; teste de negação afirma o motivo; toda recusa tem o par que permite; parser se testa contra implementação independente; fixture não depende de dado ambiente.
- **R-076 — Instrumento nasce provado por mutação**: Guard, gate, tripwire, detector ou trava só vale depois de mutar o que vigia, confirmar vermelho e reverter (nas duas direções); detector novo se mede antes de virar portão, com controle positivo por marca. Trava que nunca reprovou nada é um echo ok.
- **R-077 — Fixture mínima N=2**: Regra que só se manifesta em conjunto (fila, lote, rateio, parcelamento, consolidação, estorno parcial, preço médio) se testa com N=2; com N=1 passa por vacuidade.
- **R-078 — Idempotência em toda entrada e saída externa**: Entrada e saída externa têm chave de idempotência com o escopo dentro da chave; reprocessamento não duplica fato nem envio. executarMutacao sempre declara comando: com input validado. Efeito colateral não precede a guarda de unicidade.
- **R-082 — Sem abstração sem necessidade demonstrada**: Não criar abstração, camada, dependência, plataforma, app adicional ou fluxo paralelo sem necessidade demonstrada; não misturar refatoração ampla com funcionalidade nova; o molde não cresce para exceção.
- **R-088 — Reconhecer árvore antes de agir**: Antes de alterar: git status, git worktree list, branch, HEAD e bancos. Não trocar de branch com alteração pendente, não usar reset destrutivo, não mexer em stash de outra sessão. Trabalho novo começa na pasta principal; worktree é para branch longa.
- **R-089 — Inventariar antes de construir**: Antes de projetar, levantar o que já existe e quem consome; rota que "não existe" quase sempre existe na origem. Nunca propor módulo ou endpoint novo sem confirmar o nome real na árvore.
- **R-090 — Uma sessão e um servidor por árvore**: Paralelo só por git worktree em diretório separado; um next dev por árvore (porta diferente não isola); um processo pesado por máquina; nunca vitest + tsc + build juntos; nenhum teste de aceite contra arquivos em edição.
- **R-092 — Árvore limpa ao fim da sessão**: git status --short sai vazio ao fim; nunca commitar deixando trabalho não versionado; nunca deixar a árvore mutada; checkpoint exato se a sessão terminar.
- **R-094 — Ler exit= do arquivo, não do shell**: Saída de teste vai para arquivo e o resultado se lê pela linha exit= que o próprio comando escreveu; o código do wrapper do shell e | tail mascaram o resultado.
- **R-095 — Atualizar ESTADO-EXECUCAO ao fechar unidade**: Ao fechar unidade: atualizar ESTADO-EXECUCAO.md (resumo no início + seção da unidade), guardar o pedido em docs/lotes/ como veio, commit local e próximo ponto exato; pendência nomeada, nunca silenciosa; separar escopo não executado de bloqueio externo.
- **R-096 — Ordem de leitura por repositório**: gestao-publica: CLAUDE.md -> ESTADO-EXECUCAO "próximo passo" -> docs/lotes/ -> MODULO.md; docs/historico não se segue. whataspp-saas: arquitetura -> relatório -> plano -> docs/brain. poder-aberto: escopo-v2, stack, fontes/INVENTARIO, decisoes antes de qualquer tarefa. engine-saude: AGENTS.md é fonte única. instafrota: AGENTS.md antes de CLAUDE.md.
- **R-097 — Regra nova só na fonte única**: Não escrever regra nova fora do arquivo canônico; não duplicar conteúdo entre documentos; se uma tarefa contradiz o que está escrito, parar e apontar a contradição em vez de seguir.
- **R-098 — Construção contínua sem parar para revisão**: Não parar para revisão a cada cadastro ou lote pequeno: unidade coerente -> commit local -> próxima dependência. Decisão técnica local, reversível e delimitada não espera humano; invariantes, segurança e dados continuam não negociáveis. Publicar não é tarefa.
- **R-103 — Scripts do operador não se executam**: Não executar fix-claude-cli.sh, fix-cursor-extensao.sh ou manter-claude-cursor.sh nem alterar stash de terceiros; esses scripts não entram no git.
- **R-107 — Catálogo marca só com evidência**: catalogo-execucao.json se marca só com comportamento, teste e evidência via marcar-catalogo.ts; comentário @req rastreia e nunca declara atendimento; sem tela, não é VALIDADO_LOCALMENTE; marcar ausência vale tanto quanto presença.
- **R-108 — Dois regimes de rigor declarados**: Profundidade (razão, tesouraria, tributário, folha, remessa, guards) exige caracterização, tripwire por mutação, N=2 e negação com motivo; superfície exige caso de uso, autorização e um percurso de navegador por família. Rebaixar profundidade é decisão declarada no checkpoint.

## Cadeia de dependências — leia ANTES de mudar contratos
Esta repo CONSOME:
- `finsystem` via **copia-codigo** — parser OFX validado contra services/extrato_parser.rb (evidência: ESTADO-EXECUCAO.md:1722)
- `whataspp-saas` via **compartilha-infra** — mesma conta AWS; ordem explícita de não mexer nas instâncias WhatsApp/Evolution/Redis, MSFrotas e InstaSolutions (evidência: docs/lotes/V9-...md:166)
DEPENDEM desta repo (quebram se o contrato mudar):
- `whataspp-saas` via **indexa-codigo** — suporte indexa o código (GitHub App, somente leitura) para responder "como faço X" (evidência: src/app/api/cron/brain-knowledge/route.ts:34-36)

Se a mudança tocar um contrato listado acima (rota, payload, tabela, evento, variável de ambiente compartilhada): (1) rode `python3 scripts/chain.py gestao-publica` no cérebro, (2) abra a mudança também na(s) repo(s) afetada(s), (3) registre a decisão em brain/journal/.

## Ao terminar qualquer tarefa
- Se criou ou mudou uma regra, ela vai para brain/rules/rules.yaml (não só aqui).
- Se criou ou mudou uma dependência entre repos, ela vai para brain/graph.yaml.
- Registre o que foi feito em brain/journal/<ano-mês>.md (1-3 linhas: repo, o quê, PR/commit).

<!-- brain:fim -->

# gestao-publica

Sistema integrado de gestão pública municipal. **Uma repo, um sistema.**

Todo requisito que chegar é funcionalidade nova dentro deste repositório, em
módulo nomeado. Nunca sistema novo, nunca repositório novo. Os requisitos vêm
de termos de referência de licitação municipal, que pedem o mesmo conjunto com
recortes diferentes — a repetição é o ativo do produto.

SIAFIC não é produto separado: M01 a M14 são módulos daqui. RH e saúde entram
pelo mesmo caminho quando chegarem — e quando já houver código pronto em outra
repo, ele entra como módulo daqui, não se reescreve do zero.

Antes de escrever código num lote novo, diga **em que módulo** o requisito entra.

---

## Por onde começar

1. Este arquivo — carregado sozinho em toda sessão.
2. `ESTADO-EXECUCAO.md`, a seção "O próximo passo" — onde paramos.
3. `docs/lotes/` — o pedido em execução (hoje: `V7-M1-consolidacao.md` e `V7-plano-mestre-ecossistema.md`, sobre o modo de
   trabalho de `V3-orquestracao-continua.md`).
4. O `MODULO.md` de cada módulo que o lote toca.
5. `docs/LEIA-ME.md` — índice de todo o resto, e a precedência entre documentos.

**Frente não é lote.** No prompt mestre, ENT04 a ENT11 são **frentes** (pessoal,
suprimentos, arrecadação...). No `ESTADO-EXECUCAO.md` e em `docs/lotes/`, "ENTnn" é o
**número do lote**. Os dois se separaram no ENT04: o lote ENT06 não é a frente ENT06.
A tabela de correspondência está em `docs/LEIA-ME.md`.

---

## Onde as coisas estão

| Caminho | O que é |
|---|---|
| `ESTADO-EXECUCAO.md` | checkpoint entre lotes |
| `docs/LEIA-ME.md` | índice de todos os documentos, ordem de leitura e precedência |
| `docs/lotes/` | o pedido de cada lote, como veio |
| `docs/instrucoes/` | prompt mestre, mapa de lacunas, gabarito de lote, especificações, arquitetura técnica |
| `docs/edital/` | termo de referência, catálogo de cláusulas e a auditoria do catálogo |
| `modules/mNN-*/` | domínio puro por módulo, com `MODULO.md` próprio |
| `lib/portas/` | portas — o que precisa do servidor |
| `lib/molde/` | descritor declarativo de recurso (dado puro) |
| `components/molde/` | a superfície que o molde monta |
| `components/ui/MODULO-UI.md` | o padrão de tela |
| `adapters/tribunais/` | leiautes de tribunal, com `MODULO.md` por adaptador |
| `packages/` | contracts, datas, documento, estornaveis, ledger, locks, ofx, planilha, tribunais-core, zip |
| `prisma/sql/` | índices parciais e checks que o Prisma não representa |
| `docs/adr/` | decisões de arquitetura aceitas |
| `docs/caracterizacao/` | comportamento medido antes de ampliar |
| `docs/varreduras/` | decisões de modelo levantadas antes de construir |
| `docs/dependencias-externas.md` | inventário de integrações |
| `docs/historico/` | documentos superados — **não se seguem** |
| `doador/saas-municipal/` | código antigo, **inerte** — nada importa dele |

**Leia o `MODULO.md` antes do código.** Ele frequentemente explica por que o
código não é o que se espera.

---

## Invariantes — não negociáveis

1. **Dinheiro é `Decimal`**, sempre, com os helpers de `packages/contracts`.
   Nunca `number`, nunca `float`.
2. **Razão append-only.** Correção é lançamento novo referenciando o original.
   Se um requisito parece exigir `UPDATE` em lançamento, o requisito foi lido
   errado ou o desenho está errado.
3. **Período aberto verificado no caso de uso**, não na tela. Bloqueio vale por
   API, por worker e por rota alternativa.
4. **Balanceamento por subsistema**, não só no total. O guard confere o
   subsistema contra o primeiro dígito do PCASP.
5. **Idempotência de entrada e saída externa**, com o escopo dentro da chave.
6. **Autorização no servidor**, por ação nomeada. Botão oculto não é proteção.
7. **Tenant e entidade resolvidos no servidor** a partir de membership
   confiável. URL, cabeçalho e campo de formulário não conferem permissão.
8. **Na dúvida, fail-closed.**

O papel `gestao_app` não tem superusuário, `BYPASSRLS`, posse de tabela nem
DDL. `UPDATE`/`DELETE` só num censo assinado de tabelas. Não afrouxe o grant
para fazer um teste passar — use a primitiva certa.

---

## Regras aprendidas — cada uma custou um defeito real

**Nenhum código no código.** Conta do PCASP, alíquota, roteiro contábil e
parâmetro normativo vêm de tabela, fail-closed. Fabricar um código de conta
para um teste passar é inventar norma da STN dentro de um teste.

**Fixture mínima N=2** em toda regra que só se manifesta em conjunto: fila,
lote, rateio, parcelamento, consolidação, estorno parcial, preço médio. Com
N=1 a regra passa por vacuidade e vai para produção.

**Parser se testa contra implementação independente.** Se o teste usa o seu
parser para conferir o seu parser, ele passa com qualquer interpretação errada
consistente.

**Teste de negação afirma o motivo**, não só o resultado. "Não completou" é
compatível com o servidor entregando o dado a qualquer um.

**Instrumento nasce com a prova de que acusa.** Guard, tripwire, gate: mute o
que ele diz vigiar, confirme vermelho, reverta — nas duas direções. Já houve
quatro defeitos dentro de instrumentos de medição neste repositório.

**Propriedade, não padrão.** Guarda que enumera formas acha só aquelas formas.
Duas vezes uma estimativa de cinco sítios virou trinta e cinco, e de dez virou
cinquenta e sete. Afirme a propriedade: suíte sob `TZ` deslocado, fixture em
hora de borda.

**Não atestar pela papelada que declara.** Três guards já ficaram verdes porque
casavam com o comentário que explicava a exclusão, ou com o censo que nomeia o
serviço. Afirme o efeito.

**Efeito colateral antes da operação guardada envenena a tentativa seguinte.**
Gravar o artefato antes da guarda de unicidade deixa o registro impossível de
processar para sempre. Confira pré-condições antes de gravar.

**Data civil do ente, nunca UTC**, em toda comparação de domínio. `packages/datas`
é a régua, com `Intl`, não com `-3` cravado. Formato externo (SAGRES, SIGA,
MANAD, BB, OFX) permanece em UTC, e cada exceção tem um motivo por linha.

**Timeout se mede e se memoiza, não se aumenta.**

**Falha intermitente só se descarta com o motivo junto.** E grave a saída bruta
em disco antes de qualquer cano — uma intermitência sem o nome do teste não se
investiga.

**Migration é aditiva.** Zero `DROP`. Índice criado por `prisma/sql/` precisa
estar declarado no schema, ou a deriva o remove em silêncio.

---

## Interface

- Nenhum identificador de cláusula, selo de conformidade ou percentual de
  cobertura em tela, mensagem, notificação, documento operacional, rota ou
  atributo acessível. Vocabulário de negócio permanece: edital, licitação,
  pregão, contrato, termo de referência de uma compra. Exceção nomeada: seções
  de leiaute de tribunal, que são normativo externo.
- **Sem emoji** em código, interface, documento ou mensagem de commit.
- Rótulo em todo campo de formulário. Campo sem rótulo é caixa muda para leitor
  de tela.
- O menu mostra só o que o servidor autoriza, pelo mesmo `PermissaoDePerfil`.
- Nada de botão sem handler, contador estático, gráfico com dado semeado ou
  aviso de sucesso sem persistência.
- Lista curta não é exceção: um `select` com 500 itens ordenados por código é
  um formulário bonito e inútil. O descritor declara o recorte.
- `GET` não produz transição de estado.

Use o molde (`lib/molde/`) para superfície. O que não couber, declare e escreva
à mão — o molde não cresce para acomodar exceção, e não carrega regra de
negócio.

---

## Modo de trabalho — construção contínua (vigente desde 2026-09-12)

A orquestração V3 (`docs/lotes/V3-orquestracao-continua.md`) substituiu o regime
"um lote, um portão, uma revisão". O regime anterior está registrado nas seções
históricas de `ESTADO-EXECUCAO.md` e não se segue mais.

**Precedência desde 2026-09-13 (V6):** `docs/lotes/V6-produto-integrado.md` substitui SOMENTE a
prioridade temporal e de publicação da V5 (candidato em 24 h, busca de hospedagem). Publicar não é
tarefa; procurar alvo de deploy não é próximo passo. Regras de negócio, ADRs aceitos, evidências e
o modo de trabalho da V3 permanecem. O produto se apresenta como **Gestão Pública**; a instituição
vem do cadastro (`lib/portas/identidade.ts`), nunca de literal no código; SIAFIC continua sendo o
nome do domínio contábil. Vale agora:

- **Não parar para revisão** a cada cadastro, botão ou lote pequeno. Concluída uma
  unidade coerente de mudança: commit local e seguir para a próxima dependência.
- **Verificação direcionada durante a construção:** typecheck dos projetos afetados,
  testes do domínio alterado, autorização positiva e negativa, prova de persistência e
  recarga. Mudança de dinheiro, estoque, autorização, período, idempotência ou transação
  exige os testes de integridade correspondentes. Mudança de schema exige validação e
  aplicação em banco isolado antes de depender da estrutura. Mudança de censo de ações,
  perfis ou bootstrap exige teste de instalação limpa e de atualização.
- **Portão integral** (suíte completa, fuso, schema, SQL manual, permissões, build e
  percursos de navegador) fica para o candidato de homologação/implantação, ou quando uma
  alteração transversal ou uma falha sem origem delimitada justificar. Não se rode
  `test:tudo` e `test:fuso` por alteração de texto, campo ou botão; registre a seleção.
- **Nenhum teste de aceite roda contra arquivos em edição.** Árvore congelada ou worktree
  fixada em commit, com o commit registrado antes e depois. Uma suíte pesada, um build e
  um navegador não disputam a mesma máquina: use o trinco.
- **Saturação se reconhece pelo padrão, não pelo teste que caiu.** Quando a suíte inteira
começa a estourar timeout em arquivos DIFERENTES a cada corrida, e cada um deles passa
sozinho, a máquina é a causa — não o código. Nesta máquina (8 GB) a suíte completa pede
`--maxWorkers=3`; com o padrão ela pagina e arquivos aleatórios morrem em 901 s. E um
processo morto com `kill -9` deixa a sessão do trinco `idle` segurando o lock de máquina:
derrube-a (`pg_terminate_backend`) antes da próxima corrida — **mas confira antes se o processo
dono ainda existe**. Sessão `idle` segurando advisory lock não prova trava órfã: prova só que
ninguém está executando uma consulta *neste instante*, o que é o estado normal de quem está
rodando teste. A prova de órfã é a **ausência do processo dono**. Derrubar sem conferir mata
corrida legítima no meio — já quase aconteceu.

**Timeout ou saturação não é aprovação nem defeito.** Registre, investigue, e não marque
  como validado o que não passou.
- **Decisão técnica local, reversível e já delimitada pelo pedido não espera humano.**
  Invariantes contábeis, segurança e dados continuam não negociáveis.
- **O número ENT é lote, não percentual do sistema.** Registre lote executado e frente
  funcional separadamente.

---

## Dois regimes de rigor — declare qual no checkpoint

**Profundidade** — razão contábil, tesouraria, cálculo tributário, folha,
remessa a órgão, guards: caracterização antes de ampliar, tripwire provado por
mutação, fixture N=2, negação com motivo.

**Superfície** — cadastros, listagens, consultas, relatórios operacionais:
teste de caso de uso, teste de autorização no servidor, um percurso de
navegador por família de tela.

Rebaixar profundidade para superfície é decisão que precisa aparecer, não
acontecer.

---

## O portão

`npm run portao` — dez passos, saída bruta por passo, não para no primeiro erro.

Passo `pulado` não é passo barato: é passo que não aconteceu. Leia o resultado
contando os pulados como não executados.

**Agendamento:** durante a construção, `npm run test:rapido` (~14 s) e os testes
direcionados do domínio alterado. O portão completo fica para o candidato de
homologação/implantação (ver "Modo de trabalho"). `test:fuso` roda quando o diff toca
`packages/datas`, guards de período, janelas de relatório ou arquivos que
`data-civil.test.ts` vigia — e sempre no portão do candidato. É agendamento, não rigor:
nada deixa de rodar antes de promover um artefato.

A suíte e os smokes disputam a máquina. `scripts/trinco-de-maquina.ts` serializa;
a trava de banco é outra coisa e vale por banco.

---

## O catálogo

`docs/edital/catalogo-execucao.json` — 2.037 cláusulas do termo de referência.
É a única medida de quanto do edital está atendido. `scripts/marcar-catalogo.ts`
é quem escreve nele.

- Marque só com **comportamento, teste e evidência**. Comentário `@req` serve
  para rastrear, nunca para declarar atendimento.
- **Código que existe não é comportamento provado.** Há tabelas no schema com
  os tipos certos e nenhum leitor escrito à mão.
- `IMPLEMENTADO_NAO_VALIDADO` vira `VALIDADO_LOCALMENTE` quando existe tela e
  percurso de navegador. Sem tela, um servidor municipal não alcança.
- **Marcar ausência vale tanto quanto marcar presença.** Foi uma marcação de
  ausência que trouxe a decisão da conta multifonte antes de alguém construir
  por cima.
- Censo rende cobertura, modelo rende situação, superfície rende validação. A
  meta de um lote vem declarada por natureza.

---

## Proibido

- Push externo, deploy, transmissão fiscal ou pagamento real.
- Apagar banco original ou reescrever migration já aplicada.
- `eval`, `new Function` ou lista negra para fórmula editável pelo usuário —
  `this.constructor.constructor(...)` passa por qualquer lista negra. Use
  interpretador com universo fechado.
- Importar qualquer coisa de `doador/`.
- Inventar descrição, código normativo ou alíquota que não esteja na fonte
  oficial. Pendência vazia é melhor que inventário inventado.
- Substituir integração externa ausente por retorno de sucesso local.
  Sem credencial, o estado é indisponível com motivo declarado.

---

## Ao fechar uma unidade de trabalho

Atualize `ESTADO-EXECUCAO.md` — o resumo atual no início (HEAD, frente, último
resultado, pendências, próximo passo) e a seção da unidade: o que passou a funcionar e a
rota real para chegar lá, comandos executados com resultado real, migrations e SQL
aplicados, invariantes verificadas, contagem do catálogo separada por natureza,
pendências reais separadas do que está bloqueado por terceiro, e o próximo ponto exato.

Guarde o pedido de cada orquestração em `docs/lotes/`, como veio, antes de começar.

Pendência nomeada, nunca silenciosa. Recusa com mensagem clara é comportamento
aceitável; silêncio não é.

Faça o commit local e siga para a próxima dependência. Se a sessão terminar, deixe
checkpoint exato e árvore consistente; não prometa execução fora da sessão.
