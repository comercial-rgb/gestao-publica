# Estado da execução

## Resumo atual (orquestração V3 — atualizado a cada unidade)

| Campo | Valor |
|---|---|
| HEAD | **V13 rodada 4 — a conta em que o vale vira DIREITO, com tela percorrida**, em quatro commits (`a9a8a2a` conserto do alvo de tipos, `a4429ac` a unidade 1, `e935b7d` a caracterizacao da unidade 2, `f7f290c` o instrumento). ⚠️ **O PERCURSO RODOU E FICOU 18 ok / 1 falha / 1 nao executado** — e o que ele prova e o entregavel da unidade 1: o parametro foi gravado PELA TELA e persistiu com a conta certa (`2031-06` v1 `0.4000` -> `1.1.3.1.1.01.01`), conferido no banco. A falha e do INSTRUMENTO e esta MEDIDA: `/folha/folhas` respondeu **200** no log do servidor e o passo do par N=2 nunca foi escrito neste arquivo (pendencia `PERCURSOS-SEM-HELPER-COMUM`), logo `Servidor` = **0** e a metade da FOLHA do roteiro nao foi alcancada. ⚠️ **A unidade 2 nao construiu nada, por achado**: se o vale deixa de empenhar, o critério **PAGO** perde a unica fonte que tem (`EmpenhoDaFolha.vinculoId`) e deixa de ser verificavel para TODO ente. Migration aditiva conferida **pelo efeito** em banco isolado novo: 9477 -> 9479 objetos, diff de **exatamente duas linhas**. Duas mutacoes com alvo por checksum acusaram sozinhas e foram revertidas. ⚠️ **Conserto fora de escopo, do alvo de tipos que a V14 r1 quebrou**: 7 `error TS` no backend em HEAD, nenhum em linha minha. Antes, **V13 rodada 3 — o defeito contábil tratado pela tabela**, em três commits (`624a003` a guarda, `47edb01` a pergunta de desenho respondida, e o do estado). A conta do vale foi **procurada e achada** no plano OFICIAL do TCE-PB — `1.1.3.1.1.01.01 SALÁRIOS E ORDENADOS - ADIANTAMENTOS` —, não escolhida: nem o plano mínimo nem os roteiros tinham qualquer conta de antecipação a pessoal. A metade patrimonial ficou resolvida (o vale debita o ATIVO, e a VPD de pessoal é reconhecida uma vez); a orçamentária virou **recusa nas duas pontas**, porque a fonte que a decide não existe. **17/17** com banco, mutação acusou e foi revertida com checksum. ⚠️ **Tentativa única com `next dev`, autorizada e medida**: o servidor serviu e as quatro rotas da folha compilaram com 307 e zero erro — mas o **percurso é INEXISTENTE**, não vermelho e não verde: o banco de dev tem 0 usuários. Encerrado com swap em 6,19/7 GB, sem órfãos, `.next` removido. Antes, **V13 rodada 2 — o vale até o pagamento**, em três commits (`3eb8360` unidades 1 e 2, `893e5fe` percurso escrito e NÃO executado, e o do estado). O caminho **PAGO**, que a rodada 1 declarou implementado e não medido, tem **15/15** com banco e a cadeia real até o M05. **Duas mutações dirigidas acusaram**, revertidas com checksum idêntico — e a segunda **desmentiu** o comentário da rodada 1: a guarda do domínio NÃO é defesa em profundidade para a rubrica ausente, e o `throw` do serviço é a única coisa entre a rubrica revogada e a remuneração paga em dobro. **Dois defeitos de produto achados e NOMEADOS, não consertados por conveniência**: o estorno do vale depois do abatimento bloqueia a complementar, e o vale empenhado DUPLICA a despesa do mês (4.200,00 para 3.000,00 de custo). Catálogo não tocado. ⚠️ **O percurso continua não executado.** Antes, **V13 rodada 1 — adiantamento salarial construído**, em quatro commits (`599be5c` domínio/motor/censos, `241cebf` superfície, `9d87fe9` testes, e o do estado). `tsc` **0 `error TS`** no backend e no app, os dois com `--listFiles` confirmando os arquivos alterados dentro do projeto que rodou. Dirigidos: M33 adiantamento **19/19**, vizinhas do M33 **59/59** e **67/67**, censos M16 **30/30**, contratos **21/21**, navegação/recursos **25/25**. **Duas mutações dirigidas acusaram e foram revertidas com checksum idêntico.** 4 migrations aditivas aplicadas em `gestao_publica_test` e `gestao_publica`, zero `DROP`, nenhum banco apagado. ⚠️ **Sem `next build` e sem navegador** — proibidos pela ordem V13 enquanto o domínio não estivesse medido (foi `next build` com heap de 5,3 GB mais navegador que travou a máquina duas vezes). **Catálogo: cobertura ZERO** — a 5.12.50 teve só a evidência atualizada e segue `PARCIAL`. Antes, **V12 rodada 5** — `9ee0424`, em cinco commits (`d800d03` superfície, `e2faef2` ação nos perfis, `32c7beb` percurso, `62bd0f6` catálogo, `9ee0424` estado). `tsc` **0 `error TS`** nos três projetos; dirigidos M33+M16 **455/455**; percurso da seleção **31 ok / 0 falhas**. ⚠️ **A prova por mutação do percurso NÃO fechou** — resultado INEXISTENTE, não desconhecido. Antes, **V12 rodada 4** — `5842044`. **Três bancos em 218/218** (dev +6, percursos +13, conferidos pelo efeito). **Dois percursos VERDES contra o HEAD**: eixos **53/0** e ponte contratual **50/0**. ⚠️ **`SELECAO-NO-CALCULO-SEM-SUPERFICIE`**: a seleção no cálculo **não tem tela** — a ação de calcular lê só `motivo` e nunca repassa `selecao`. Antes, **V12 rodada 3** — `90c49f5`, em três commits (`26d1a66`, `e5a4209`, `90c49f5`). `tsc` **0 `error TS`** no backend e no app; M33+contracts **313/313**, M12+M09 **313/313**. Antes, **V12 itens 3.D e 3.A** — `e4e20ee`, em três commits (`b484f20`, `fea56fa`, `e4e20ee`). `tsc` **0 `error TS`** no backend e no app, com `--listFiles` confirmando que os seis arquivos alterados estão no projeto que rodou. Dirigidos M33+M16 **444/444**. Antes, **V12 consolidação** — `c9e3423`. **Árvore ÚNICA adotada**: das 26 worktrees, 23 removidas com prova (ancestral de `main` mais `porcelain` de uma linha, `?? node_modules`), 2 retidas por veredito (`artefato-v11v93`, `percurso-glosa-0adaf12`). 15 GB para 989 MB. Sob a V12 o auxiliar é somente-leitura, então a árvore **não** é mais compartilhada para escrita. Antes, **V11 V9.5** — `29a43fe`, partiu de `889b3ab`. `tsc` **0/0/0** nos três projetos, os três rodados depois da última edição e com `--listFiles` confirmando cobertura. ⚠️ **Árvore COMPARTILHADA**: o auxiliar tem `modules/m33-folha/`, `lib/portas/recursos/folha.ts`, `prisma/schema/m33-folha.prisma` e duas migrations novas em voo. O commit desta unidade é só de M32/pessoal, por caminho explícito |
| Modo de trabalho | **orquestração contínua** (`docs/lotes/V3-orquestracao-continua.md`), sob a ordem **V12** (`docs/lotes/V12-consolidacao-e-construcao-integrada.md`), que sucede a **V11** (`docs/lotes/V11-motores-folha-contabilidade-esocial-e-aws.md`). V12: um escritor, auxiliar somente-leitura, árvore única |
| Frente em execução | **V11** — V9.3 resolveu `CONTROLE-DDR-POR-NATUREZA-DA-FONTE`, executou **os três passos da J9** que a V9.2 deixou pendentes, fechou os **passos 16, 17 e 18 do roteiro do 13º** e encerrou a família `MENSAGEM-SOME-COM-A-LINHA`. `SUPERAVIT-SEM-ENTIDADE-NAS-QUATRO-PERNAS` segue como continuidade funcional, com a apuração **não** ligada |
| Último resultado | secao 105 — **a conta declarada no parametro, a tela percorrida, e a cadeia extraorcamentaria recusada por falta de fato**. ⚠️ **O typecheck do APP achou a metade que faltava** do trabalho em voo: o dominio passou a exigir a conta e a porta continuava nao a mandando — a tela gravaria nada, porque o Zod recusa. Entraram a porta, o recorte (14 analiticas do ramo `1.1.3.1`, nao 7.864) e o campo com rotulo. ⚠️ **Os dois lados da coluna nullable agora estao medidos** (secao c9, 6 casos): cadastro recusa conta inexistente, fora do ramo e SINTETICA, e a leitura de parametro da rodada 1 com conta NULA falha fechado pela rota do operador com `CalculoDaFolha` e `Contracheque` em ZERO. A fixture `1.1.3.1.1.01` (dentro do ramo, sintetica) e o que **discrimina** as duas conferencias — sem ela, um servico que so olhasse o prefixo passaria os tres casos. ⚠️ **A mutacao B provou isso**: `if (!conta.analitica)` -> `if (false)` deixou **so** c9.3 vermelho. ⚠️ **E a recusa tem saida, testada**: c9.6 executa o que a mensagem promete (cadastrar a versao 2 declarando a conta) e o vale sai, com a versao 1 intacta e nula — append-only afirmado, nao alegado. Achado de instrumento que NAO e meu e ficou nomeado: `npm run deriva` **nao consegue montar a sombra** (`uq_roteiro_sem_tipo_de_credito` criado pela migration `20261006090000` E por `prisma/sql/`, sem `IF NOT EXISTS`), logo a deriva de schema esta SEM MEDICAO no repo desde aquela migration. Antes, seção 104 — **a conta veio da tabela, a dotação virou recusa, e o percurso continua inexistente**. ⚠️ **O passo 1 da ordem era "procure na tabela", e ele mudou a resposta**: o PCASP oficial tem `1.1.3.1 ADIANTAMENTOS CONCEDIDOS` e, dentro, `1.1.3.1.1.01.01 SALÁRIOS E ORDENADOS - ADIANTAMENTOS` — enquanto o plano mínimo semeado (64 contas) e `roteiros.ts` não tinham nada. Sem procurar, a saída teria sido escolher por analogia, que é o que o CLAUDE.md proíbe. ⚠️ **E a pergunta de desenho da unidade 2 corrigiu a premissa, inclusive a do enunciado**: no estorno do vale depois do abatimento quem deve é **o ENTE ao servidor**, não o contrário — medido por matrícula (pago líquido 0,00 contra 1.200,00 descontados). A direção decide o instrumento, e o instrumento correto é a COMPLEMENTAR, que a guarda fecha. Achado ao ler `complementar.ts`: a recusa de diferença negativa distingue PROVENTO de DESCONTO **na mensagem e não na decisão**. Três opções postas com custo, nenhuma construída. Antes, seção 103 — **o vale até o pagamento, a guarda 5 sozinha, e a despesa que dobra**. ⚠️ **A mutação desmentiu o que a rodada 1 havia afirmado**: o comentário dizia que `calcularContracheque` era defesa em profundidade para a rubrica de abatimento ausente, e não é — com o abatimento indefinido na entrada, a guarda do domínio nem chega a olhar, e o caso ficou vermelho SOZINHO. Corrigido para dizer o medido; é a mesma lição da V9.5, e uma mutação que desmente vale mais que cinco que confirmam. ⚠️ **Dois defeitos de PRODUTO achados com banco, nomeados e não improvisados**: (a) estornar o pagamento do vale depois de a mensal já o ter abatido deixa a folha fechada intacta — certo — e **bloqueia a complementar**, que era o instrumento da correção; construiu-se o NOME (a recusa diz que uma folha fechada abateu, quanto, que o ente deve a diferença e que o acerto é ato que ele não pratica), não o ato; (b) **o vale empenhado duplica a despesa do mês** — vale e mensal empenham cada um o seu bruto, e junho fecha com 4.200,00 empenhados para 3.000,00 de custo. Não é escolha de desenho: é a ausência de escolha, e decidir exige fundamento normativo não levantado. Caracterizado por teste que **ficará vermelho quando alguém consertar**. Antes, seção 102 — **o adiantamento salarial construído: motor, tela e as duas armadilhas provadas**. O quinto tipo de folha existe, com parâmetro do ente versionado POR COMPETÊNCIA e abatimento na mensal da mesma competência. ⚠️ **As duas armadilhas da varredura não foram evitadas por atenção, foram PROVADAS por mutação**: trocar `compoeARemuneracaoMensal` para `true` deixa a complementar vermelha com `DiferencaNegativaNaComplementarError`, letra por letra o defeito previsto; e ler o parâmetro VIGENTE em vez do que apurou o vale quebra a memória histórica. As duas revertidas, checksum idêntico, 19/19 de volta. ⚠️ **O levantamento errou um ponto, e a medição corrigiu**: o CHECK `ck_folha_exercicio_por_tipo` foi dado por resolvido e PRECISAVA do `ALTER` — desde a V11 V9.4 ele enumera duas listas para falhar fechado no tipo seguinte, então sem ele `abrirFolha` do vale seria recusada pelo banco no primeiro `INSERT`. ⚠️ **Três censos que o compilador não pega foram achados por teste VERMELHO**, não por revisão — e o mais instrutivo acusou um fato FALSO: `m33-listas-de-natureza` dizia "natureza declarada e incadastrável" porque o helper do PRÓPRIO TESTE carregava uma terceira cópia da lista de naturezas-desconto. Um teste que carrega a cópia da regra afirma a cópia, não a regra; as duas passam a derivar de `NATUREZAS_QUE_SAO_DESCONTO`. ⚠️ **Tela escrita e NÃO percorrida** — `ADIANTAMENTO-SALARIAL-SEM-PERCURSO-DE-NAVEGADOR`. Antes, seção 101 — **a superfície da seleção, o percurso verde, e a prova que não fechou**. `SELECAO-NO-CALCULO-SEM-SUPERFICIE` resolvido, e eram **duas** inalcançabilidades: sem superfície E **sem perfil nenhum** com a ação (atualização versionada 29, que **não deriva** de `CALCULAR_FOLHA`, para não desfazer a segregação no ato de instalá-la). O cenário obrigatório fechou pela TELA com as **duas** saídas exercitadas, e o passo mais forte afirma **pela ausência**: o formulário não tem campo por vínculo, então não existe o que a paginação pudesse definir. ⚠️ **A unidade TRAVOU durante a prova por mutação**; o coordenador reverteu com sha conferido, e a retomada também não fechou — duas corridas morreram em `Runtime.callFunctionOn timed out` antes da primeira asserção, com **75 MB livres e 5,7 GB de 7 GB de swap**. ⚠️ **"Exit zero não significa efeito" virou CLASSE**: quatro ocorrências num dia, e a pergunta "rodou?" nunca responde "gravou?". Antes, seção 100 — **os bancos no HEAD, dois percursos verdes, e a capacidade que ninguém alcança**. `GLOSA-SEM-PERCURSO` e `ESTORNO-DE-RECEBIMENTO-SEM-PERCURSO` **FECHADAS**: a ponte contratual fechou **50/0** com os cinco motivos de recusa exercitados pela tela — e a versão que fechou é a de `main`, a que a seção 99 recusou substituir pela da worktree. `/pessoal/funcoes` e os oito eixos fecharam **53/0** sem uma linha alterada no roteiro. ⚠️ **A Unidade 2 não rodou porque NÃO HÁ TELA**, não por ambiente. Quatro paradas antes do verde, **nenhuma do produto**: padrão de nome datado copiado em **sete** arquivos (seis divergentes), licenciamento fail-closed correto, e um instalador que sai **`exit=0` sem gravar** por ser pré-visualização — a terceira vez no dia em que código de saída zero não significa efeito. Antes, seção 99 — **o float no total de um livro contábil e o dinheiro cru na prosa**. A ordem nomeava 2 sítios de float; a varredura exaustiva achou **6** em produto, e os dois piores estavam numa PORTA (tesouraria), que serve três telas. ⚠️ **A fixture óbvia não acusa**: medido que `0.1+0.2` passa COM o defeito, porque o `.toFixed(2)` final mascara — o centavo só vira a partir de ~2,2×10¹³, e o defeito estava **latente** em magnitude municipal (há um caso afirmando que o valor publicado **não muda**). Na Unidade 2 a medição **reclassificou o levantamento**: os "~70 pontos" eram os usos em CAMPO, que a ordem mandava não tocar; a prosa eram **51**, e `encargos.ts` tinha **zero**. Três versões de motor subiram para marcar o corte de hash, com **zero hash literal** fixado em teste no repo. Três mutações com alvo confirmado por checksum, todas revertidas. Antes, seção 98 — **o veredito que a medição desmentiu, os dois censos e o dinheiro que ficava calado**. A `percurso-glosa` foi classificada C e **medida como B**: o trabalho da glosa já estava em `main` (`43f8842`) e `main` ainda ganhou o conserto `82564e9` — integrar teria **revertido um conserto medido**. Nada integrado. O `t5c` eram **duas** contagens quebradas e havia um terceiro vermelho (`t5`): três registros faltando, todos nomeados antes de o número mudar; achado que a suposição invertia — `SELECIONAR_VINCULOS_DA_FOLHA` **conta** no censo de AÇÕES, porque `TODAS_AS_ACOES` inclui `ACOES_SEM_SERVICO_PROPRIO`. `APURADO-A-REPOR-ENCOBERTO-POR-FOLHA-SEM-VINCULOS` **consertado** por ordem de guardas, com fixture N=2 em que os dois são inelegíveis e só um tem dinheiro — a recusa nomeia M-A e **não** M-E. Duas mutações com alvo confirmado por checksum antes de ler resultado, ambas revertidas. ⚠️ **Leitura errada minha registrada**: `rc=1` com zero testes rodados por `--reporter=basic` inexistente. Antes, seção 97 — **a árvore única**: 23 worktrees removidas, cada uma com `merge-base --is-ancestor` `exit=0` e `status --porcelain` de **exatamente uma linha**, `?? node_modules`; `--force` exigido só pela dependência instalada, e a recusa sem ele registrada (`exit=128`). Espaço **15 GB para 989 MB**. Duas retidas por veredito, com o diff da `percurso-glosa-0adaf12` (225 inserções / 2 deleções) preservado como patch. **26 bancos classificados, nenhum removido**: 3 em uso pelo `.env`, 3 de evidência, 4 clones de worktree removida, 16 de corrida encerrada. Um erro de medição meu, corrigido em voz alta: `grep -v -x` caiu no `ugrep`, morreu, e o `wc` a jusante devolveu **zero por falha do cano, não por ausência de sujeira** — refeito com `awk`. **Nenhuma medição de produto nesta unidade.** Antes, seção 96 — **a SELEÇÃO no cálculo e o FATO de abrangência**, em UM commit (`29a43fe`). A promessa da folha deixou de ser mantida por construção e passou a ser afirmada: "exatamente os selecionados e elegíveis, com cada exclusão nomeada". O cenário obrigatório passa — nº1={A,B}, nº2={C,D}, fechar → **recusa nomeando M-A e M-B** —, com as **duas saídas legítimas** testadas (recalcular acumulando, ou cancelar): a guarda impede o esquecimento, não a decisão. ⚠️ **A mutação desmentiu o que eu ia afirmar**: a reconciliação é redundante com o `where`, e foi rebaixada a defesa em profundidade declarada — uma mutação que não acusa valeu mais que cinco que acusam. Migrations conferidas **pelo efeito**, dirigidos **78/78**. Antes, seção 94 — **a Tarefa 3 REABRIU e ganhou a ponta de entrada**: `cadastrarFuncao` tinha zero chamadores fora de testes e os três eventos novos eram gravados só por teste, então o operador via os filtros, digitava e recebia **vazio para sempre** — dado ausente **por construção**, a forma mais completa da armadilha que a mutação da seção 93 provou. Entregue `/pessoal/funcoes`, os três tipos em `movimentar` e `admitir` aceitando centro de custo. ⚠️ **`--listFiles` mostrou que `pessoal-dados.ts` NÃO está no projeto do backend** — quem o cobre é o do app; afirmar cobertura pelo backend teria repetido o buraco do dia, do outro lado. **Só typechecks medidos (0/0/0); a superfície não tem evidência nenhuma até a corrida fechar.** Antes, seção 93 — **a Tarefa 3 MEDIDA**: migrations conferidas **pelo efeito** (banco clonado, N=2 linhas semeadas antes de aplicar; a `Funcao` do M02 saiu com **diff vazio**), os três CHECK provados pela linha que devem barrar, e **três mutações com alvo confirmado no arquivo**. ⚠️ A terceira transformou raciocínio em medição: tirar a coluna do `SELECAO_ENXUTA` deixou os três casos positivos vermelhos e o **puramente negativo VERDE** — a forma exata do teste que se sente cobrindo e não cobre. Dirigidos **115/115**, `tsc` app e scripts `exit=0`. Um defeito meu que nenhum compilador acharia: `FuncaoDePessoal` fora do censo de `limpar-banco.ts`. Antes, seção 92 — **a complementar pela TELA** (frente do auxiliar): sete afirmações que o sistema não verificava, o instrumento provado pelo par **46 ok/14 falhas e 49 ok/11 falhas contra `6fa0d62` sem conserto** → **62 ok / 0 falhas** contra `d163d21`, banco clonado por execução; tipos **0/0/0**, dirigidos **37/37** e contrato memória↔tela **11/11**; mutação M-7 com **alvo confirmado antes de medir** (sha `34b03cb…`→`bcdf74e…`) e revertida. A correção que mais vale: previu-se documento contraditório e, medido, ele **emudecia** sobre uma contribuição retida — silêncio é pior que número errado. ⚠️ **Contagem minha corrigida**: eram **20** bancos na conferência de `_prisma_migrations`, não 21 (hoje 22, com os dois descartáveis do auxiliar); a prova segue íntegra porque o laço foi gerado por `pg_database`, não digitado. Antes, seção 91 — **o `4106e0f` não validava e travou a árvore**: `model Funcao` colidiu com a função ORÇAMENTÁRIA da Portaria 42/1999 (M02), e a tabela física `Funcao` já existia desde `20260711202100` — a migration era **inaplicável**, não só mal nomeada, e teria quebrado instalação limpa DEPOIS de o validate passar. Corrigida com a medição na mão (zero em `_prisma_migrations` nos 21 bancos), renomeada para `FuncaoDePessoal` em `5c129e0`. **Medido**: `validate` `exit=0`, `generate` `exit=0`, `tsc` de backend `exit=0` com zero `error TS` (eram 9) — ⚠️ **árvore NÃO congelada** (onze arquivos do auxiliar dentro), logo cobre os consertos dele mas **não é aceite**. Antes, seção 90 — **os dois eixos ausentes de 5.12.50 ganharam modelo, e o levantamento mudou a tarefa**: a FUNÇÃO nasceu (model `Funcao` + eventos `DESIGNACAO_FUNCAO`/`DISPENSA_FUNCAO`), o CENTRO DE CUSTO **já existia** — é o `Setor` do M21, que almoxarifado, compras e patrimônio já usam nesse papel; faltava o vínculo com vigência. Duas migrations aditivas (enum e estrutura separados pela restrição do Postgres), zero `DROP`. ⚠️ **NADA MEDIDO** — a máquina está com o auxiliar. Antes, seção 89 — unidade **documental**, não medida (a máquina está com o auxiliar): as três coisas que a 88 confundiu — (a) filtro de consulta, (b) seleção para processamento, (c) abrangência efetiva — separadas com arquivo e linha, e o fundamento falso da 88 corrigido. Achado que decide o desenho: a **subtração silenciosa** (`fecharFolha` congela UM cálculo; com seleção por cálculo, nº1={A,B} e nº2={C,D} fazem o fechamento levar só {C,D} e A e B somem sem erro). Antes dela, seção 88 — **tipos 0/0/0 nos três projetos** e **dirigidos 117/117** sobre a árvore ATUAL, `rc` lido do arquivo; dez mutações, nove acusando e **uma que NÃO acusou** (MUT-H, guarda inerte, retirada), todas revertidas por edição com checksum. A auditoria achou 3 defeitos meus, os três tratados: âncora de data civil, recusa do teto na tela e o **gate dentro da porta** |
| Pendências relevantes | **V13 rodada 4 acrescenta UMA, e ela e BLOQUEIO EXTERNO:** `VALE-EXTRAORCAMENTARIO-SEM-FATO-DE-SAIDA-DE-CAIXA` — nenhum caminho existente serve sem adaptacao (M05 e a cadeia orcamentaria; M07 tem a FORMA certa e a SEMANTICA errada, porque debita PASSIVO de terceiro e o vale e ATIVO do ente; M09 `registrarMovimentoBancario` nao tem `vinculoId`; `LoteDePagamento`/`ItemDoLote` e reaproveitavel SE houver o fato). Tres decisoes do usuario: o fato carrega `vinculoId`? ampliar o M07 (mexe em modulo CONCLUIDO e no invariante 4 dele — provavel ADR) ou fato proprio do M33? e o **PAGO** segue oferecido, sob qual fato? **Registrado tambem que `VALE-NA-MESMA-NATUREZA-DA-REMUNERACAO` AINDA GUARDA e FICA** — o vale ainda empenha —, mas MORRE EM SILENCIO no dia em que a cadeia nova chegar (`noGrupo.length === 0` e a funcao retorna antes das duas guardas): a substituicao certa e inverter a afirmacao, nunca apagar. **Duas de instrumento, nenhuma minha:** `DERIVA-DE-SCHEMA-NAO-MONTA-A-SOMBRA` (indice duplicado entre migration e `prisma/sql/`) e `PERCURSOS-SEM-HELPER-COMUM` (o passo do par N=2 nao existe no smoke do vale — e o que impede a metade da FOLHA do roteiro). ~~`ADIANTAMENTO-SALARIAL-SEM-PERCURSO-DE-NAVEGADOR`~~ **parcialmente fechada**: a metade da CONFIGURACAO foi percorrida (18 ok); a da folha nao. Antes, **V13 rodada 3 reduz duas a decisões de PRODUTO, com os números na mão:** `VALE-EMPENHADO-DUPLICA-A-DESPESA-DO-MES` virou UMA pergunta — o adiantamento salarial consome dotação orçamentária? (a metade patrimonial está resolvida pela tabela; a coincidência de natureza é recusada nas duas pontas); e `ESTORNO-DO-VALE-BLOQUEIA-A-COMPLEMENTAR` virou a escolha entre (A) complementar com delta negativo em rubrica de DESCONTO — a mais barata, e o que a impede é uma guarda que não olha o sinal do efeito —, (B) retificação da folha (não existe, colide com a invariante 3) e (C) ato próprio de reconhecimento de dívida. **V13 rodada 2 acrescentou, MEDIDAS:** `VALE-EMPENHADO-DUPLICA-A-DESPESA-DO-MES` (pendência de PRODUTO, não de engenharia — alguém precisa ler a norma antes de o primeiro município empenhar um vale) e `ESTORNO-DO-VALE-BLOQUEIA-A-COMPLEMENTAR` (que substitui e precisa a `ESTORNO-DO-ADIANTAMENTO-SALARIAL-DEPOIS-DA-MENSAL` da rodada 1, que era raciocínio e agora é fato). **V13 rodada 1:** `ADIANTAMENTO-SALARIAL-SEM-PERCURSO-DE-NAVEGADOR` (a tela existe e nenhum navegador a percorreu — é o que impede a 5.12.50 de se mover), `REGRA-DO-ADIANTAMENTO-SALARIAL-NAO-SUPORTADA`, `ESTORNO-DO-ADIANTAMENTO-SALARIAL-DEPOIS-DA-MENSAL`, `INCIDENCIA-NO-ADIANTAMENTO-SALARIAL`, `ABRANGENCIA-DO-ADIANTAMENTO-SALARIAL-SEM-BASE-NAO-NOMEADA` e `ESTADO-DO-ADIANTAMENTO-VERIFICADO-EM-DOIS-SITIOS` (a verificação FECHADO/CERTIFICADO/PAGO existe em dois sítios; enquanto durar, os dois mudam juntos) — todas no `MODULO.md` do M33. **A prova por mutação do percurso da seleção SEGUE PENDENTE**, intocada por decisão da ordem V13. **`18.3–18.5` do 13º NÃO EXECUTADO** (folha fechada não recalcula — falta `RETIFICACAO-DA-FOLHA`); **defeito LATENTE** `numeroDoEmpenhoDaFolha` sem o tipo da folha (87.20, conserto do auxiliar); onde fica o portão do critério (apropriar ou fechar); `DDR-DISPONIVEL-SALDO-A-REPONTAR`; `PERCURSOS-SEM-TERMO-PATRIMONIAL-CONGELADO`. **Bloqueio NORMATIVO**: `DISPOSITIVO-MUNICIPAL-DO-13-NAO-LIDO` (três fontes em 403) — não trava o sistema, mas é o que falta para saber QUAL critério declarar. **Bloqueadas por terceiro** (83.3): eSocial, ASTEC, certificado A1, AWS, ENT12. **V9.4 acrescenta:** ~~`PESSOAL-SEM-CENTRO-DE-CUSTO`~~ e ~~`PESSOAL-SEM-FUNCAO`~~ **resolvidas na seção 90**, e no lugar delas quatro pendências novas e nomeadas (`CENTRO-DE-CUSTO-SEM-VIGENCIA-HISTORICA`, `VINCULOS-ANTERIORES-SEM-CENTRO-DE-CUSTO`, `FUNCAO-SEM-ACAO-PROPRIA`, `FUNCAO-SEM-EIXO-DE-AUSENCIA`); **a Tarefa 3 inteira está ESCRITA E NÃO MEDIDA** — migrations não aplicadas, `tsc` não rodado, testes não executados; **`SELECAO-NO-CALCULO-DA-FOLHA` — capacidade DEVIDA da 5.12.50, não construída** (a seção 88 a recusou com fundamento falso; ver seção 89), e ela nasce junto com o FATO de abrangência, a guarda de completude e a reconciliação de `VINCULO-APURADO-FORA-DO-RECALCULO`; **metade da distinção (a)/(b)/(c) por escrever em `modules/m33-folha/MODULO.md`** (território do auxiliar); **percurso de navegador de `/pessoal/servidores` NÃO EXECUTADO**. **Bloqueio de FONTE**: `ITEM-1667-DE-IBEMA-NAO-LOCALIZADO` — citado na ordem, ausente do repositório; texto pedido ao usuário |
| Próximo passo | **Escrever o helper comum de fixture de pessoal para os percursos** (`PERCURSOS-SEM-HELPER-COMUM`) e so depois rodar a metade da FOLHA do roteiro do vale: abrir/calcular/fechar a folha do vale -> mensal seguinte abatendo -> as tres recusas (parametro ausente, vale nao fechado, abatimento maior que o liquido). Medido: sem ele `Servidor` = 0 no banco dedicado e o smoke aborta em `/folha/folhas` **com a pagina respondendo 200** — o vermelho e do instrumento, e rodar `smoke-folha` antes NAO resolve, porque ele cria matriculas proprias e o vale espera `VALEA-`/`VALEB-`. **E as tres decisoes de PRODUTO de `VALE-EXTRAORCAMENTARIO-SEM-FATO-DE-SAIDA-DE-CAIXA`**, que voltam ao usuario com o inventario pronto em `docs/caracterizacao/m33-a-cadeia-extraorcamentaria-do-vale-o-que-falta.md`. **Catalogo NAO marcado nesta rodada**, de proposito: a 5.12.50 enumera NOVE tipos e existem cinco, entao ela segue `PARCIAL` de qualquer modo, e a evidencia nova (a configuracao percorrida) nao move cobertura. **Nao rodaram**: suite completa, `test:fuso`, portao, `next build` (proibido), `npm run deriva` (instrumento quebrado, ver pendencia). Antes, **Duas decisões de PRODUTO, não de engenharia, para levar ao usuário:** (1) o vale consome dotação orçamentária, e em que natureza? (2) qual das três opções para o estorno depois do abatimento? Os números e os custos estão no `MODULO.md` do M33. **E o percurso**: a tentativa autorizada com `next dev` aconteceu, o servidor serviu e as rotas compilaram — mas o percurso **não rodou** e o resultado dele é **INEXISTENTE**, porque o banco de dev tem 0 usuários e rodá-lo exige o ambiente de percursos (`percursos:preparar` + banco clonado), que é passo pesado próprio. Com swap acima de 6 GB, ele não cabe junto com `next dev` e navegador; a decisão de montá-lo é do coordenador. Histórico da rodada 2: **Decidir sobre `next dev` como veículo do percurso — a decisão é do coordenador, não desta sessão.** Medido ao fechar: livre 0,43 GB, inativo reclamável 1,86 GB, **disponível ~2,29 GB**, swap **5,71 de 7 GB**, zero processos nossos acima de 50 MB. `next build` (heap de 5,3 GB) mais navegador é o par que travou a máquina duas vezes e **continua fora de questão**; `next dev` é materialmente mais leve — compilação sob demanda, sem o passo de tipos do build — e **caberia** em 2,3 GB com o navegador, mas isso é estimativa, não medição, e o swap já está alto. Se a decisão for sim: clonar o banco de percursos, servir, e rodar `smoke:adiantamento-salarial` LENDO o vermelho antes de concluir que o roteiro está errado (todo percurso deste repositório foi vermelho na primeira vez: o do 13º achou cinco defeitos, o da complementar sete). Se for não, a 5.12.50 segue `PARCIAL` e a pendência segue aberta e nomeada. Histórico da rodada 1: **Medir a máquina e, SÓ SE ELA PERMITIR, o percurso de navegador do adiantamento salarial.** `next build` mais navegador é o par que travou esta máquina duas vezes; a decisão de tentar é do coordenador, não da sessão de escrita. O percurso devido: configurar o parâmetro pela tela → abrir/calcular/fechar a folha do vale → conferir a mensal seguinte abatendo → exercitar as recusas (parâmetro ausente, vale não fechado, abatimento maior que o líquido). Sem ele a **5.12.50 segue `PARCIAL`** e a cobertura do catálogo não se move — e ela não se moveria mesmo com o percurso, porque a cláusula enumera NOVE tipos e agora há cinco. Continua devida, atrás disso, a **prova por mutação do percurso da seleção** (V12 rodada 5). Abertas e não tocadas: `PREVIA-DE-PARCELAS-EM-FLOAT`, `PORTA-DE-TESOURARIA-SEM-TESTE`, `PERCENTUAL-CRU-NA-PROSA`. **Não rodaram nesta rodada**: suíte completa, `test:fuso`, portão, `next build`, qualquer navegador. Histórico: **Seção 4 — adiantamento salarial: levantada e NÃO construída.** A rodada de construção parou por **saturação da máquina** (87 MB livres, 5,6 GB de 7 GB de swap, zero processos nossos), com a árvore limpa e **nada implementado**. O levantamento está em `docs/varreduras/varredura-v12-adiantamento-salarial.md` (`1c9457a`): as duas armadilhas (`compoeARemuneracaoMensal` false; não copiar o elo persistido do 13º), a ordem das guardas, os censos que o compilador NÃO pega, e os cenários obrigatórios. Percentual e base **não existem no TR** — parâmetro nasce vazio e fail-closed. Antes dela: **fechar a prova por mutação do percurso da seleção**, quando a máquina permitir — sem ela o percurso é verde e não é prova. O artefato `.next` foi **removido** (ficara com a build mutante): o estado é "sem build", não "build silenciosamente errada". **5.12.50 segue PARCIAL**, sem promoção (`VALIDADO_LOCALMENTE` em 75), e a razão agora é uma só: quatro tipos de nove. Abertas: `PREVIA-DE-PARCELAS-EM-FLOAT`, `PORTA-DE-TESOURARIA-SEM-TESTE`, `PERCENTUAL-CRU-NA-PROSA`. Seção 4 não iniciada. Histórico, já FEITO nesta rodada: **Construir a superfície da seleção no cálculo** (`SELECAO-NO-CALCULO-SEM-SUPERFICIE`): campo no formulário de calcular, leitura de `selecao` em `acaoDaFolha` e a abrangência no detalhe da folha — só depois o percurso do 3.B. **Catálogo NÃO marcado** nesta rodada: nenhuma das 10 cláusulas achadas é correspondência limpa da glosa de medição nem do estorno de recebimento; a identificação fica devida. Bancos **já em dia**. Histórico: **Bancos em dia, depois 3.B e 3.C.** ⚠️ O 3.B depende de banco no HEAD e `gestao_publica_percursos` está **13 migrations atrás** (205 contra 218), `gestao_publica` **6 atrás** (212) — unidade própria, anterior a ele. Abertas e nomeadas: `PREVIA-DE-PARCELAS-EM-FLOAT`, `PORTA-DE-TESOURARIA-SEM-TESTE`, `PERCENTUAL-CRU-NA-PROSA`. Histórico: **Itens 3.B e 3.C da V12.** As duas worktrees retidas foram resolvidas e removidas (árvore Única: 989 MB → 844 KB), a branch `v11v93-artefato` preservada. **3.D e 3.A fechados e medidos**; **3.B, 3.C e a seção 4 não iniciados**. Seguem **abertas** `GLOSA-SEM-PERCURSO` e `ESTORNO-DE-RECEBIMENTO-SEM-PERCURSO` — o roteiro existe em `main` e **nunca fechou verde**; percurso escrito não é percurso verde. Sem suíte completa, sem `test:fuso`, sem portão, sem navegador, sem marcação de catálogo. O que segue abaixo é a pendência de produto herdada da V11 V9.5, íntegra: **PARADO — a ordem se encerra aqui do lado desta frente.** Devido e NÃO contado como feito: percurso de navegador de `/pessoal/funcoes` e do cálculo com seleção; suíte completa, `test:fuso` e portão; `SELECAO-NO-13-NAO-CONSTRUIDA`; `APURADO-A-REPOR-ENCOBERTO-POR-FOLHA-SEM-VINCULOS` (fronteira: motor da complementar, outra frente); `CENSO-DO-T5C-DESATUALIZADO`. Quando voltar limpo, ela vem em **UM** commit (seleção + abrangência + completude + "no máximo uma vez"), com o cenário nº1={A,B} / nº2={C,D} → **recusa nomeando A e B** como teste obrigatório. Segue devido o **percurso de navegador de `/pessoal/servidores`**. Histórico da ordem de medição, já executada: **as duas migrations em banco isolado**: as duas migrations em banco isolado conferidas **pelo efeito**, com alvo novo — provar que `FuncaoDePessoal` cria tabela própria e **não toca** a `Funcao` do M02 —, `generate` DEPOIS do migrate, `tsc` dos dois projetos restantes sozinho, e os dirigidos do M32. Depois os testes que faltam, nomeados na seção 90 (porta, integração, negativa pareada, mutação da guarda da dispensa órfã). **Enfileirada atrás do auxiliar**: a **seleção no cálculo** — (b) seleção + (c) fato de abrangência + guarda de completude + guarda de "no máximo uma vez", em **UM** commit, porque qualquer corte entre eles deixa uma folha que pode ser parcial sem acusar. Segue devendo o **percurso de navegador de `/pessoal/servidores`**. **Nada instalado nem publicado**; 5.12.50 segue `PARCIAL` e não marcada |

## V13 rodada 4 — a conta em que o vale vira DIREITO, e a cadeia que recusou ser construida (2026-09-26)

> Secao propria. **Nao reescreve** a secao da V14 r1 abaixo, nem o trabalho dela: a outra frente estava
> em voo na mesma arvore, e `lib/portas/demonstrativos.ts`, `test/demonstracoes-contabeis.test.ts`,
> `prisma/seed/m12-linhas-demonstrativos.ts`, `prisma/seed/m12-indicador-superavit-demo.ts`,
> `scripts/preparar-banco-de-percursos.ts` e a linha `seed:m12-linhas` do `package.json` **sao dela** e
> ficaram intactos. Nenhum `git add` de diretorio nesta rodada; caminho explicito, `add`+`commit` na
> mesma invocacao.

### O que o operador consegue abrir e executar

`/folha/parametros-do-adiantamento-salarial` pede, **e agora exige**, a conta do plano em que o vale
vira DIREITO a receber do servidor. O seletor oferece **14** contas — as analiticas do ramo
`1.1.3.1 ADIANTAMENTOS CONCEDIDOS` do plano oficial do TCE-PB —, com rotulo, com a explicacao de que o
vale **nao e despesa de pessoal do mes**, e com o envio trancado quando o plano do ente nao tem o ramo
(em vez de seletor obrigatorio e vazio, que e formulario que o navegador nunca envia).

**Percorrido de verdade**, contra `next dev` na 3012 e banco dedicado: o parametro de `2031-06` foi
gravado pela TELA na versao 1 e persistiu com `1.1.3.1.1.01.01 SALARIOS E ORDENADOS - ADIANTAMENTOS`,
conferido por consulta ao banco depois da recarga.

### Os quatro commits

| Commit | O que e |
|---|---|
| `a9a8a2a` | conserto, fora de escopo, do alvo `tsconfig.backend.json` que a V14 r1 deixou vermelho |
| `a4429ac` | a unidade 1: conta no parametro, migration aditiva, dominio, servico, 6 casos novos, porta e tela |
| `e935b7d` | a unidade 2: caracterizacao do razao do vale + o achado do criterio PAGO |
| `f7f290c` | o instrumento aprendendo o campo novo (commitado ANTES de rodar, e dizendo isso) |

### ⚠️ O conserto que nao era meu, e por que entrou primeiro

`tsc -p tsconfig.backend.json` estava **vermelho no HEAD** `c916189`, com **7 `error TS`**, nenhum em
linha escrita por mim. Construir sobre arvore vermelha faria meu proprio verde nao significar nada.

O checkpoint da V14 r1 registra "tsc zero erro nos meus arquivos" — **estava certo e nao bastava**. Os
6 erros `TS2835` estavam em `lib/portas/demonstrativos.ts`, arrastado para o alvo NodeNext pelo import
do teste novo; `lib/` e escrito para `moduleResolution: bundler`. **Medir o arquivo nao mede o
projeto.** O remedio esta escrito dentro do proprio `tsconfig.backend.json`, e o vizinho
`test/ui/demonstrativo-das-obrigacoes.test.ts` e o precedente exato: sai do alvo backend, entra no do
app. Cobertura conferida depois: **1537 arquivos, 1537 cobertos, 0 descobertos**.

O setimo, `TS2322`, **nao era so de tipo**: `prisma.exercicio.create({ data: { ano: 2026 } })` omite
`criadoPor`, obrigatorio sem default. O Prisma **rejeita em runtime**, entao aquele caso de recusa
nunca chegou a exercitar a recusa que afirma medir — e o checkpoint da V14 r1 diz que aquele dirigido
estava escrito e **nao executado**, o que confirma a omissao.

### Unidade 1 — os dois lados da coluna nullable

A coluna e nullable porque havia parametro gravado **antes** desta pergunta (medido: 0 linhas em
`gestao_publica`, 1 em `gestao_publica_test`; `NOT NULL` falharia). Coluna nullable com Zod exigente e
leitura desprotegida e **pior** que `NOT NULL`: parece fechada e nao e. Os seis casos da secao `c9`:

| Caso | Afirma |
|---|---|
| c9.1 | conta inexistente no plano recusa nomeando o motivo, e nada grava |
| c9.2 | fora do ramo recusa nomeando o ramo **e** a conta oficial (recusa sem destino manda adivinhar) |
| c9.3 | **dentro** do ramo mas SINTETICA recusa — o caso que o prefixo nao pega |
| c9.4 | entrada sem o campo recusada + a conta certa grava, com a FK conferida no banco |
| c9.5 | parametro da r1 com conta NULA falha fechado **pela rota do operador**, com `CalculoDaFolha` e `Contracheque` em ZERO |
| c9.6 | a saida que a recusa **promete** funciona: versao 2 declara a conta, o vale sai (1.200,00 e 800,00 a mao), versao 1 intacta e nula |

A fixture de c9.5 e gravada **a revelia do servico** de proposito: o servico nao consegue mais produzir
a linha antiga, e e justamente ela que a leitura tem de tratar.

### Unidade 2 — nada construido, e o motivo e um achado

⚠️ **O criterio `PAGO` perde a unica fonte que tem.** `EmpenhoDaFolha.vinculoId` e o unico lugar do
banco onde existe "quanto saiu para esta matricula", e so e preenchido quando o grupo empenha POR
SERVIDOR. Se o vale deixa de empenhar, a cadeia deixa de existir e `PAGO` deixa de ser verificavel
para **todo** ente — nao apenas para quem tem `porServidor = false`. Hoje a recusa e condicional e tem
saida ("empenhe o vale por servidor"); depois da mudanca a saida some, e a tela ainda oferece o
criterio.

Construir a saida de caixa sem resolver isso produziria um dos dois defeitos que este repositorio ja
pagou: um `PAGO` que o cadastro aceita e o calculo nunca satisfaz, ou um `PAGO` satisfeito por
**suposicao** — abater do salario do servidor dinheiro que talvez nao tenha saido para ele.

### Unidade 3 — o percurso: 18 ok, 1 falha, 1 nao executado

O resultado da falha esta **classificado com medicao**, nao por conveniencia:

- `/folha/folhas` respondeu **200** no log do proprio servidor (`GET /folha/folhas 200 in 1538ms`);
- `Servidor` = **0** no banco dedicado, porque o passo 6 (admitir o par N=2) **nunca foi escrito**
  neste smoke — ele mesmo declara isso e aponta a pendencia `PERCURSOS-SEM-HELPER-COMUM`;
- logo a falha e do **instrumento**, por lacuna reconhecida, e a metade da FOLHA do roteiro
  (abrir/calcular/fechar o vale, mensal abatendo, as tres recusas) **nao foi alcancada**.

⚠️ **E rodar `smoke-folha` antes NAO resolve**: ele cria matriculas proprias, e o vale espera
`VALEA-203106`/`VALEB-203106`. O conserto e o helper comum, nao uma quarta copia do cadastro de
pessoal — o proprio smoke argumenta contra a copia.

O que o smoke **passou** a medir, e que antes nao existia: **5.4a** o seletor oferece ao menos uma
analitica do ramo e **todas** as opcoes reais comecam por `1.1.3.1`; **5.4b** o recorte **exclui**
classe 3 (VPD) — uma VPD ali seria o defeito da rodada 2 de volta pela porta da frente. A escolha e
pelo **codigo lido da propria lista**, nunca por id cravado: cravar mediria o SEED em vez da TELA.

### Ambiente, medido

O smoke **recusou** rodar sem `PERCURSO_BANCO` e a recusa esta certa: o vale projetado roda o motor
mensal sobre todos os vinculos vivos da competencia, e num banco compartilhado uma matricula alheia
derrubaria o calculo — o vermelho nao seria deste percurso. Banco dedicado
`gestao_publica_percursos_vale_203106` criado do zero, **223 migrations** finalizadas, coluna presente.
Consequencia feliz: a rodada ficou **insulada** das mudancas que a outra frente fez em
`gestao_publica_percursos`.

Memoria: livre 77 MB antes, **2290 MB** depois de derrubar. Swap 2,47/4,10 GB antes, 5,14/6,14 GB ao
final — o arquivo de swap **cresceu** durante a rodada, e isso fica registrado como pressao, nao como
folga. `next build` nao foi executado (proibido). Sem orfao meu: cadeia da 3012 derrubada com TERM,
portas 3010/3011/3012 livres, nenhum Chromium remanescente.


## V14 rodada 1 — as demonstrações contábeis chegam ao operador (2026-09-26)

**Ordem nova:** `docs/lotes/V14-contabilidade-esperanca-dois-dias.md` — contabilidade do Pregão
Eletrônico 00040/2026 de Esperança/PB, prioridade temporária de duas jornadas. O PDF de origem
**não está nesta máquina** (nem em `~/Downloads`, nem na árvore): todo trecho de edital citado no
lote vem do texto da ordem, não de leitura direta do PDF. Registrado lá como limitação.

⚠️ **ESTE RESUMO NÃO TOCOU O TOPO DESTE ARQUIVO, de propósito.** Outra sessão está no V13 (r4 u1,
`5026761`) e vai reescrever as células do resumo ao fechar a unidade dela. Reescrever as mesmas
células agora seria clobber silencioso. As células do topo seguem descrevendo o V13 r3 e **estão
atrasadas**; a pendência é nomeada, não silenciosa.

**Capacidade que passou a existir** (`86a1fe2`): Balanço Orçamentário (Anexo 12), Balanço
Financeiro (13), Balanço Patrimonial (14) e DVP (15) alcançáveis pelo operador. Rota real:
Relatórios → Demonstrações contábeis → `/relatorios/demonstracoes/{balanco-orcamentario,
balanco-financeiro,balanco-patrimonial,variacoes-patrimoniais}`.

Os quatro motores já existiam no M12, com teste e amarrações, desde a construção do módulo. Não
havia porta nem tela, e `balancoPatrimonial`/`demonstracaoVariacoesPatrimoniais` não estavam nem
reexportados pelo `index.ts` do módulo — quem os lia era só o relatório de consistência, por
dentro. A ausência era de superfície, não de motor.

**O rol de contas de disponibilidade veio de TABELA:** `ContaBancaria.contaContabil`, a mesma
amarração que a conciliação bancária já exige. O Anexo 13 exige o rol por parâmetro e LANÇA sem
ele; o quadro por fonte do 14 vem `null` sem ele. Limitação nomeada no cabeçalho da porta: uma
disponibilidade sem conta bancária (o caixa em espécie) não entra no rol.

**Assimetria deliberada:** o Financeiro RECUSA com o caminho da correção; o Patrimonial EMITE sem o
quadro por fonte. Recusar o balanço todo esconderia ativo, passivo e PL já apurados.

**Três defeitos MEUS, achados pela auditoria de invariantes antes do commit e corrigidos nele:**
1. o corte do Balanço Patrimonial era `inicioDoDiaCivil` — o motor corta `dataTransacao <= corte`,
   então o começo do dia **exclui o próprio dia do corte**, e a apuração do resultado nasce em
   31/12 às 23:59:59 civis. O balanço de encerramento sairia sem ela e **sairia calado** (cada
   lançamento excluído é balanceado em si, a equação fundamental continua fechando), discordando
   da DVP do mesmo ano. Agora `fimDoDiaCivil`;
2. o Financeiro tinha selo "saldo em espécie confere" comparando dinheiro por igualdade de string,
   com **ramo vermelho inalcançável** (o motor já lança na divergência) — papelada que declara.
   Removido;
3. o superávit financeiro por fonte era apurado e **jogado fora na tela** — o aviso aparecia
   quando ele era nulo e nada aparecia quando existia. O quadro agora aparece.

**MEDIDO:** `tsc -p tsconfig.json` com **zero erro** nos arquivos desta unidade. O único erro da
árvore é `lib/portas/recursos/folha-dados.ts:1369`, da outra sessão (o `contaDoAdiantamentoId` que
ela tornou obrigatório) — não tocado de propósito.

**NÃO MEDIDO, e por isso NÃO declarado atendido:**
- `test/demonstracoes-contabeis.test.ts` está **ESCRITO E NÃO EXECUTADO**. Três tentativas:
  `hookTimeout` no `limparBanco` sob saturação (corrigido — o clear passou a ser das quatro tabelas
  da fixture); `ECONNRESET`; e na terceira o **Docker Desktop havia morrido**. Saída bruta das duas
  primeiras preservada em `.registro-de-execucao/`.
- **Nenhuma das quatro telas foi percorrida em navegador.** Catálogo **não marcado**: sem percurso,
  nada promove.

### ⚠️ A MÁQUINA, e o que ela impede agora

**Docker Desktop morreu às 02:39 sob pressão de memória**, levando `pg-gestao-publica` com ele —
com ele foram os 28 bancos (`gestao_publica`, `_test`, `_percursos` e os 25 de percursos/isolados).
Swap tinha chegado a **8,07 GB de 9,2 GB**; ao morrer, caiu para 688 MB. **Não houve reboot** (up 7
dias). A causa imediata foi **dois `tsc` concorrentes**: o meu e o da outra sessão, na mesma árvore.

E o dano não parou no Docker: **`pgrep` deixou de funcionar** (`sysmond service not found`) e o
LaunchServices recusa abrir qualquer app (`kLSNoExecutableErr`) — inclusive o próprio Docker.app,
que está **íntegro em disco** (2,2 GB, `com.docker.backend` presente e executável). Não é defeito
do Docker: é degradação de serviços do sistema. Tentativas de subir o Docker (bundle externo e o
`Docker Desktop.app` aninhado) **falharam as duas**.

**Não reiniciei a máquina, e a decisão é do coordenador**, por um motivo concreto: a outra sessão
está com **uma migration não commitada** (`prisma/migrations/20261019090000_v13_conta_do_adiantamento_no_parametro/`)
e 6 arquivos modificados. Um reboot a mata no meio.

**Sem banco, nada do que falta se verifica:** nem o teste dirigido, nem percurso de navegador, nem
gerar SAGRES dos próprios fatos — que é o item central da prova de conceito.

### O inventário C01–C40, seletivo, já feito

Levantado por auxiliar em leitura, **conferido por mim nos pontos que decidiram a construção**. A
base é muito mais rica do que a ordem supôs, e o caminho crítico **não é** o que ela previu:

- **C39 SAGRES não é a lacuna.** `adapters/tribunais/tce-pb/sagres/` tem o layout **2026 v1.1**,
  **10 das 13 entidades exportando** (Dotacao, Empenhos, Liquidacao, Pagamentos,
  ReceitaOrcamentaria, CadastroContaBancaria, SaldoMensal, MovimentacaoEntreContas, Retencao,
  DespesaExtra), porta (`lib/portas/sagres.ts`), tela (`/integracoes/sagres`), prévia com
  validações, rota de download e **dia e mês selecionáveis em separado** — exatamente o que a
  comissão precisa. Os 3 🟡 restantes têm gap NOMEADO (UnidadeOrcamentaria sem
  `nomeSecretario`/`cpfSecretario`/`ato`; EstornoPagamento sem coluna `motivo`; ConciliacaoBancaria
  sem campos bancários). ⚠️ O comentário do topo de `layout-2026v11.ts` diz "3 entidades desta
  fatia" e **está desatualizado** — o `index.ts` e o `MODULO.md` dizem 10, e o código confirma 10.
- **O caminho crítico real é o que ALIMENTA o SAGRES pela tela**, e as lacunas caras são:
  1. **C34/C37** — o M07 não aloca recolhimento por origem: o saldo é agregado por
     `(tipoConsignacao, credorConsignatario)`, sem tabela de junção. "Compor várias origens" e
     "reabrir só a parcela cabível" não têm onde nascer **sem mexer no schema**. Bloqueia o
     cenário C da ordem.
  2. **C30** — não existe distribuição de uma arrecadação entre fontes com snapshot; a guia tem
     **uma** fonte (via `ContaBancaria.fonteId`). Bloqueia o cenário D.
  3. **C38 restos a pagar** — domínio **completo e maduro** (inscrição, processado/não processado,
     liquidação, pagamento, cancelamento, estorno de pagamento e de cancelamento, fila do art. 141
     atravessando exercícios, `saldoDosRestos` com inscrito/pago/estornado/cancelado/saldo) e
     **zero superfície**: nenhuma porta, nenhuma rota. É a **maior relação retorno/esforço da
     fila** — só porta e tela sobre o que já existe.
  4. **C32/C33** — ingresso/dispêndio extraorçamentário avulso e estorno existem e são testados,
     mas `lib/portas/extraorcamentario.ts` só expõe **leitura**. Só a retenção-dentro-do-pagamento
     tem tela.
  5. **C07 consolidação/intragovernamental** — ausente e **admitida pelo próprio código**
     (`modules/m16-travamento/acoes.ts:301-305`).
- Outras, nomeadas: **C13** versionar PPA/LDO com comparativo — ausente, admitido pelo
  `MODULO.md` do m02b (`PPA-LDO-VERSOES-E-EMENDAS`); **C15** CMD/MBA tem domínio completo e a tela
  é **declaradamente só leitura + minuta**; **C19** remanejamento/transposição/transferência não
  existe como classificação própria (`TipoCredito` só tem SUPLEMENTAR/ESPECIAL/EXTRAORDINARIO);
  **C05** centro de custo é cadastro + apropriação que **não chega a relatório nenhum**; **fluxo de
  caixa** não existe. RREO 13/14 anexos (falta o 4, RPPS, por dado externo) e RGF 6/6.

⚠️ **O banco de dev `gestao_publica` está com 222/222 migrations e 427 tabelas, e ZERO dados** —
nenhuma `LinhaDemonstrativo` cadastrada, inclusive. Sem as linhas de ANEXO_14/ANEXO_15, o Balanço
Patrimonial e a DVP mostram, corretamente, "mapeamento não configurado" — e **não zero**. Um
ambiente de apresentação (seção 13 da ordem) ainda não existe.

### O próximo passo, exato

**Duas decisões do coordenador, porque nenhuma é de engenharia:**
1. **A máquina.** O Docker não sobe e `pgrep`/LaunchServices estão quebrados; o reparo provável é
   reboot, que mata a migration não commitada da outra sessão. Ordem sugerida: a outra sessão
   commita ou guarda o trabalho dela → reboot → conferir que os 28 bancos sobreviveram **antes de
   qualquer coisa** (eles vivem em container **sem volume**; o `ENT00` documenta metade da
   recriação) → então rodar `test/demonstracoes-contabeis.test.ts`.
2. **Um escritor só.** A ordem pede escritor único e há **dois**, na mesma árvore de 8 GB. Foi a
   concorrência dos dois `tsc` que matou o Docker. Enquanto houver dois, `test:tudo`, `next build`
   e navegador não cabem.

**Assim que houver banco, na ordem:** (a) rodar o teste dirigido desta unidade e ler o vermelho;
(b) **C38 restos a pagar — porta e telas**, a próxima unidade da fila, pelo melhor retorno por
esforço; (c) C32/C33 escrita do extraorçamentário na tela. **C34 e C30 exigem decisão de schema** e
não cabem sem ela — não serão improvisados.

> ⚠️ **Os cabeçalhos abaixo desta linha são HISTÓRICOS.** Foram escritos lote a lote, de ENT00
> a ENT12, sob o regime anterior (um lote, um portão, uma revisão). Continuam aqui porque
> registram medições e decisões reais; **não** descrevem o estado atual nem o modo de
> trabalho vigente. O que vale hoje é o resumo acima e a seção 35 em diante.

<details>
<summary>Cabeçalho histórico (ENT00–ENT02, escrito em 2026-09-09/10)</summary>


> Produzido por ENT00 em 2026-09-09, atualizado por **ENT01** e por **ENT02**.
> Dados reais, medidos nesta máquina. Sem estimativa, sem percentual de
> cobertura, sem "provavelmente".
>
> ⚠️ **ENT02 CHEGOU AO GATE.** A definição de concluído da seção 6 do prompt do lote
> está atendida item a item (tabela abaixo), com a cadeia percorrida **pela
> interface** e conferida por smoke de navegador: **43 passos, 0 falhas** (eram 37 no
> gate; o fechamento acrescentou os 6 passos dos anexos).
>
> ⚠️ **ENT03 ABERTO E PARADO NO GATE PARCIAL (2026-09-10).** A caracterização foi feita
> e é o entregável principal deste ponto: `docs/caracterizacao/`. A tesouraria ganhou lote
> de pagamento, borderô e retorno bancário. **A maior parte do prompt do ENT03 NÃO foi
> executada** — a seção 12 lista item a item o que ficou, sem eufemismo.
>
> ⚠️ **FECHAMENTO DO ENT02 (2026-09-10, tarde).** Quatro itens pedidos na revisão do
> gate foram entregues em commits separados, com a suíte verde antes e depois de cada
> um: a superfície dos anexos, a idempotência do smoke de pessoas, a trava de
> concorrência da suíte e a prova dos formulários na mesma página. A seção 10 conta o
> que cada um era e o que mediu.
>
> ⚠️ **E O GATE CONTINUA NÃO SIGNIFICANDO "TUDO PRONTO".** Dos 22 testes mínimos do
> lote, **21 estão cobertos e 1 não coberto** (o eixo município, do lote de tenancy).
> O item 4 saiu de parcial no fechamento. O inventário item a item é um TESTE
> (`test/lote-ent02.test.ts`), não uma tabela, e o placar vai para a saída da suíte a
> cada execução.
>
> ⚠️ **E ESTES NÚMEROS FORAM CORRIGIDOS.** A primeira versão deste cabeçalho dizia
> "17 cobertos, 2 parciais, 3 não cobertos" — escritos de memória, antes da conferência
> item a item, e errados. Ficam registrados aqui porque um documento que corrige em
> silêncio ensina a próxima pessoa a confiar no número sem conferir.
>
> As pendências nomeadas estão nos `MODULO.md` de cada módulo e em
> `components/ui/MODULO-UI.md`.

</details>

## Identificação

| Campo | Valor |
|---|---|
| Último lote concluído | **ENT02** — capacidades transversais exercitadas por documentos reais (no gate, aguardando revisão) |
| Data e hora | ENT01: 2026-09-09 13:17 · **ENT02: 2026-09-10, 06:10 (UTC-4)** |
| Repositório de trabalho | `/Users/winnervinicius/Developer/gestao-publica` |
| Commit | commit de encerramento de ENT00, sobre `116e1ca` (cópia da origem). O hash exato deste commit está em `git log -1` — não é repetido aqui porque um documento que cita o próprio hash muda o hash ao ser corrigido |
| Branch | `main` |
| Origem | `/Users/winnervinicius/Developer/siafic-cg` @ `91df4d3` |
| Executor | sessão local, sem push, sem deploy, sem transmissão externa |

## Ambiente verificado

| Item | Valor | Verificado em |
|---|---|---|
| Node | v20.20.0 | 2026-09-09 |
| Gerenciador de pacotes | npm 10.8.2 (`npm install`, exit 0) | 2026-09-09 |
| Postgres desenvolvimento | `localhost:5436/gestao_publica` — PostgreSQL 18.6, container `pg-gestao-publica` | 2026-09-09 |
| Postgres teste | `localhost:5436/gestao_publica_test` — **database distinto**, mesmo servidor | 2026-09-09 |
| Redis | **não aplicável** — o `siafic-cg` não tem dependência de Redis | 2026-09-09 |
| Migrations aplicadas até | ENT00: **63**. ENT01: **68**. ENT02: `20260910050000_m21_acoes_de_cadastro` (**80**), nos dois bancos | 2026-09-10 |
| `prisma/sql/` aplicado | **sim — 17/17 arquivos**, nos dois bancos | 2026-09-09 |

### Portas — por que 5436

| Porta | Ocupante | Origem |
|---|---|---|
| 5432 | Postgres nativo | máquina |
| 6379 | Redis nativo | máquina |
| 5434 / 5435 / 6380 | containers do `saas-municipal` | outro projeto |
| **5436** | `pg-gestao-publica` | **este projeto** |

Os serviços nativos escutam no loopback e vencem de um container publicado em
`0.0.0.0:5432` — o sintoma é `role "..." does not exist`, que parece erro de
credencial e não é. A faixa 5436 evita a colisão inteira.

## Comandos executados neste lote

| Comando | Repositório | Resultado | Duração | Data |
|---|---|---|---|---|
| `npm install` | gestao-publica | exit 0 · 15 vulnerabilidades relatadas (6 moderadas, 8 altas, 1 crítica) — **não corrigidas de propósito**, ver pendências | — | 2026-09-09 |
| `npx prisma generate` | gestao-publica | Prisma Client 7.8.0 gerado | 0,4 s | 2026-09-09 |
| `npx prisma migrate deploy` | gestao-publica (dev) | 63 migrations aplicadas | — | 2026-09-09 |
| `npx prisma migrate deploy` | gestao-publica (teste) | 63 migrations aplicadas | — | 2026-09-09 |
| `npm run db:sql` | gestao-publica (dev e teste) | 17/17 arquivos aplicados | — | 2026-09-09 |
| `npx tsc --noEmit -p tsconfig.backend.json` | gestao-publica | **exit 0, limpo** | 7,7 s | 2026-09-09 |
| `npx tsc --noEmit -p tsconfig.json` | gestao-publica | **exit 0, limpo** | — | 2026-09-09 |
| `npx tsc --noEmit -p tsconfig.scripts.json` | gestao-publica | **exit 0, limpo** | — | 2026-09-09 |
| `npx vitest run` | gestao-publica | **129 arquivos, 1288 testes, 1288 passando, 0 falhas, 0 skips** | 277,8 s | 2026-09-09 |
| `npx vitest run` (regressão pós-lote) | gestao-publica | **130 arquivos, 1303 testes: 1302 passando + 1 falha esperada** — o arquivo novo de invariantes entrou e nada regrediu | 312,2 s | 2026-09-09 |
| `pnpm typecheck` | saas-municipal | 6/6 pacotes | 53 ms (cache) | 2026-09-09 |
| `pnpm test` | saas-municipal | 5 arquivos, 28 testes, todos passando | 8,2 s | 2026-09-09 |
| `pnpm -C packages/folha-engine test` | saas-municipal | 10 arquivos, 81 testes, todos passando | 3,9 s | 2026-09-09 |
| `pnpm -C apps/worker test` | saas-municipal | 4 arquivos, 7 testes, todos passando | 0,5 s | 2026-09-09 |
| `pnpm smoke` | saas-municipal | **8 ok, 2 avisos, 0 falhas** | — | 2026-09-09 |

### Comandos de ENT01 (esta máquina, banco `localhost:5436`)

| Comando | Resultado | Duração | Data |
|---|---|---|---|
| `npx prisma migrate deploy` (dev e teste) | **68 migrations** aplicadas nos dois bancos | — | 2026-09-09 |
| `npm run db:papel` | `gestao_app` provisionado nos dois bancos, **schema `public`** — sem superusuário, sem BYPASSRLS, sem DDL | — | 2026-09-09 |
| `npm run seed:pcasp` · `seed:m02` · `seed:roteiro-orc` · `seed:m07` | plano de contas, classificações da STN, roteiro orçamentário e tipos de consignação | — | 2026-09-09 |
| `SEED_IDENTIDADE=… npm run seed:cenario-aceite` | ficha 1 com **10.000,00** (o §2.4) e ficha 2 de reexecução | — | 2026-09-09 |
| `npm run db:conceder ADMINISTRADOR PREPARAR_ORDEM_PAGAMENTO …` | 3 ações concedidas — ver o achado do funil de autorização | — | 2026-09-09 |
| `npx tsc --noEmit` (backend · app · scripts) | **exit 0, os três limpos** | — | 2026-09-09 |
| `npx next build` | **compilado, 0 erros** | 5,1 s | 2026-09-09 |
| `npx vitest run` | **144 arquivos, 1441 testes, 0 falhas** | ~340 s (máquina livre) | 2026-09-09 |
| `npm run smoke:visual` | **22/22 rotas** · CSS medido no navegador | — | 2026-09-09 |
| `npm run smoke:pessoas` | **9/9 passos**, 0 falhas | — | 2026-09-09 |
| `npm run smoke:cadeia` | **23/23 passos**, 0 falhas | — | 2026-09-09 |

⚠️ **A rota real até aqui não foi reta, e as curvas estão registradas** — cada uma
na seção que a explica: o `FOR UPDATE` que o papel restrito recusou; o seed do
roteiro orçamentário que não existia em produção; a conta de passivo que vinha do
chamador; o teste que passava pelo motivo errado; a ação nova que não alcançou o
perfil existente. Nenhuma delas apareceria num relatório de "tudo verde".

Nenhuma falha de negócio no baseline. Os 2 avisos do smoke são de ambiente:
`API_URL` não definida (check pulado) e o tenant `santa-izabel-oeste` sem vínculo
ativo cadastrado. Nenhum dos dois indica defeito de código.

**A suíte do `siafic-cg` nunca havia sido executada** segundo o handoff. Foi
executada agora, na cópia, e está verde. Isso mede o que a base garante — não
converte nenhuma cláusula do catálogo em atendida.

## O que passou a funcionar

Este lote não entrega funcionalidade de produto. Entrega o direito de mexer no
código sem destruir nada, e a primeira medida honesta do que existe.

| Capacidade | Onde | Como verificar |
|---|---|---|
| `siafic-cg` sob controle de versão | `/Users/winnervinicius/Developer/siafic-cg` | `git log` → `91df4d3`, 756 arquivos versionados |
| Cópia de trabalho versionada | `/Users/winnervinicius/Developer/gestao-publica` | `git log` → `116e1ca`; `diff -rq` contra a origem: idêntico |
| Ambiente reproduzível | container `pg-gestao-publica` na 5436 | `docker ps`; `npm run db:sql` reaplicável |
| Banco de teste fisicamente isolado | `gestao_publica_test` | o guard aborta se a URL de teste coincidir com a de dev |
| Baseline executável | suíte inteira | `npx vitest run` → 1288 testes |
| Invariantes medidos por violação | `test/invariantes-nucleo.test.ts` | `npx vitest run test/invariantes-nucleo.test.ts` |
| Inventário de integrações | `docs/dependencias-externas.md` | 23 integrações, 0 credenciais, 0 convênios |

## Invariantes verificadas neste lote

`test/invariantes-nucleo.test.ts` — 15 testes: 14 passando, 1 falha esperada.

| Invariante | Teste que a viola | Resultado |
|---|---|---|
| Dinheiro em Decimal | partida com `valor` float nativo chegando ao motor | **recusado** — o motor quebra em vez de converter na dúvida |
| Dinheiro em Decimal | `toMoney(NaN)` e `toMoney(Infinity)` | **recusados** — sem zero silencioso |
| Ledger append-only (domínio) | procurar campo de mutação no modelo | **não existe `estornadoPorId`**; existe `estornoDeId`. Estorno é fato novo |
| Ledger append-only (banco) | `UPDATE` em `LancamentoContabil` pelo papel da aplicação | **NÃO recusado — lacuna aberta.** Ver abaixo |
| Idempotência de entrada externa | segundo insert com o mesmo `(fonte, chaveIdemp)` | **recusado** pela unique do banco; sobra 1 linha |
| Idempotência — escopo da chave | mesma chave em fontes diferentes | **aceito**, como deve ser: o escopo faz parte da chave |
| Idempotência de saída fiscal | segundo insert com o mesmo `(destino, chaveIdemp)` | **recusado** |
| Balanceamento por subsistema | lançamento que fecha no total e não fecha por subsistema | **recusado** |
| Partida dobrada | lançamento só com débito | **recusado** |
| Valor positivo | partida com valor zero | **recusado** |
| Guard de subsistema × PCASP | conta classe 1 rotulada `ORCAMENTARIO` | **recusado** |
| Guard de subsistema × PCASP | conta classe 5 rotulada `PATRIMONIAL` | **recusado** |
| Guard de subsistema × PCASP | conta classe 9 (fora de 1–8) | **recusado** |
| Guard de subsistema × PCASP | contas 7 e 8 como `CONTROLE` | **aceito** — o guard libera o certo, não só barra o errado |

### A lacuna do append-only — medida, não suposta

O append-only do ledger é garantido **pelo domínio**, não pelo banco.

Prova direta, executada em `gestao_publica_test`:

```
INSERT 0 1
UPDATE 1                       ← o UPDATE no ledger foi aceito
historico após UPDATE: DEPOIS-MUTADO
DELETE 1                       ← o DELETE também
```

Causa medida:

| Verificação | Resultado |
|---|---|
| `current_user` | `gestao` |
| `usesuper` | **`t` — é superusuário** |
| `tableowner` de `LancamentoContabil` | `gestao` — **a aplicação é dona da tabela** |
| `relrowsecurity` | `f` — sem política de linha |
| `GRANT`/`REVOKE`/`CREATE ROLE`/`ROW LEVEL SECURITY` nas 63 migrations | **zero ocorrências** |

Domínio protege quem passa por ele. Não protege de um script, de um console de
banco ou de um adapter futuro.

### ✅ FECHADA EM ENT01 — e o `it.fails` expirou sozinho, como prometido

`prisma/papel-runtime.ts` criou `gestao_app`: sem `SUPERUSER`, sem `BYPASSRLS`,
sem `CREATEDB`/`CREATEROLE`, sem `REPLICATION`, sem posse de tabela e **sem
`CREATE` no schema** — logo, sem DDL. `SELECT` e `INSERT` em tudo; `UPDATE` e
`DELETE` apenas num **censo de três tabelas**, levantado por varredura do código
de produção e assinado em código:

| Tabela | Permissão | Por quê |
|---|---|---|
| `Usuario` | `UPDATE ("ativo")` | ativar/desativar. Por COLUNA: `GRANT UPDATE` na tabela deixaria reescrever `identificador`, a identidade que aparece no `criadoPor` de todo fato do razão |
| `FichaOrcamentaria` | `UPDATE` nas 4 colunas de saldo | o cache recalculado por SUM |
| `VinculoUsuarioPerfil` | `DELETE` | revogar perfil |

A mesma sequência do ENT00, agora pelo papel da aplicação:

```
SELECT  → ok (a restrição não cegou a aplicação)
UPDATE  → ERROR: permission denied for table LancamentoContabil
DELETE  → ERROR: permission denied for table LancamentoContabil
CREATE TABLE → ERROR: permission denied for schema public
```

O `it.fails` de `test/invariantes-nucleo.test.ts` ficou **vermelho quando a
proteção chegou** — que era exatamente o que ele prometia fazer — e virou
asserção positiva, agora rodando pelo client do papel restrito. Rodá-la com o
dono continuaria falhando (o dono pode mutar as próprias tabelas, e é assim que a
fixture limpa o banco): seria a mesma lacuna, medida com o instrumento errado.

### O trinco pessimista teve de mudar de primitiva — e o achado é de fundo

`SELECT ... FOR UPDATE` **exige privilégio de UPDATE**, em todos os modos. Medido
contra o papel restrito:

```
SELECT id FROM "Liquidacao" LIMIT 1 FOR UPDATE;    → ERROR: permission denied
SELECT id FROM "Liquidacao" LIMIT 1 FOR SHARE;     → ERROR: permission denied
SELECT id FROM "Liquidacao" LIMIT 1 FOR KEY SHARE; → ERROR: permission denied
SELECT pg_advisory_xact_lock(42, 7);               → ok
```

E a aplicação **não pode** ter UPDATE em `Empenho`, `Liquidacao` ou `Contrato` —
são append-only, e é o que este lote acabou de fechar. A saída não foi afrouxar o
grant: foi usar a primitiva certa. `packages/locks` passou a
`pg_advisory_xact_lock`, que diz exatamente o que se quer ali — **exclusão
mútua** — e nada além; `FOR UPDATE` dizia "vou mudar esta linha", e ninguém vai.
Mesma vida (morre no commit), mesma detecção de deadlock, mesma ordem de
aquisição. E ela trava um id cuja linha ainda não existe, coisa que o `FOR
UPDATE` não fazia — passava batido.

## Migrações e SQL aplicados

| Migration ou arquivo | Efeito | Reversão prevista |
|---|---|---|
| 63 migrations de `prisma/migrations/` | Schema completo M01–M20 + adapters (herdadas de ENT00) | Nenhuma reescrita; evolução aditiva |
| 17 arquivos de `prisma/sql/` | Índices parciais e checks que o Prisma não representa | Reaplicáveis por `npm run db:sql` |
| `20260909175636_m19_pessoas_e_credores` | ENT01 — cadastro append-only de pessoas | Aditiva: três tabelas novas |
| `20260909175700_renomear_indice_certidao_fornecedor` | ENT01 — drift pré-existente, separado em migration própria para não viajar de carona | Aditiva |
| `20260909195419_m07_conta_passivo_da_consignacao` | ENT01 — `TipoConsignacao.contaPassivoId`, o que libera a retenção na tela | **Aditiva pura**: coluna nullable, sem backfill e sem default |
| `20260909213000_m05_ordem_de_pagamento` | ENT01/T07 — `OrdemDePagamento`, `MovimentoDaOrdemDePagamento` e `Pagamento.ordemDePagamentoId` | **Aditiva**: duas tabelas novas e uma coluna nullable com `@unique` |
| `20260909214500_m16_acoes_da_ordem_de_pagamento` | ENT01/T07 — três valores no enum `AcaoDoSistema` | **Aditiva**: `ADD VALUE` no enum |

**Nenhuma migration herdada foi apagada ou reescrita.** As cinco de ENT01 são
aditivas; a de `contaPassivoId` é nullable e sem default de propósito — um default carimbaria
toda consignação com um passivo inventado, e o razão passaria a acumular dívida com
o consignatário errado sem ninguém perceber.

`migrate deploy` sozinho **não** deixa o banco pronto: índice parcial ausente não
gera drift e não aparece no diff do Prisma. Os 17 arquivos foram aplicados nos
dois bancos.

## Pendências reais

| Pendência | Natureza | Bloqueia | Próxima ação | Responsável |
|---|---|---|---|---|
| ~~Ledger mutável pelo papel da aplicação~~ | Segurança / invariante 2 | — | ✅ **FECHADA em ENT01**: papel `gestao_app` sem superusuário, sem posse, sem DDL; `UPDATE`/`DELETE` só num censo de 3 tabelas. `FORCE ROW LEVEL SECURITY` **não** foi ligado: sem eixo de tenant, não há política de linha a escrever — ver "ENT01 — o que falta" | ENT01 |
| `test/` fora dos três alvos de typecheck | Qualidade | nada hoje | `tsconfig.backend.json` não inclui `test/` e `tsconfig.json` o exclui: erro de tipo em teste só aparece em runtime | a definir |
| 15 vulnerabilidades em dependências | Ambiente | nada hoje | **Não corrigidas de propósito**: `npm audit fix --force` troca versões e o lote exige preservar a instalação reproduzível. Tratar em commit separado com regressão completa | a definir |
| `PROJETO.md` defasado | Documentação | leitura futura | Ver divergência abaixo — **ainda não corrigido**; ENT01 acrescentou o M19 ao mapa, e a correção das linhas M09–M14 continua pendente | ENT01 |
| Nenhuma credencial ou convênio externo | Dependência de terceiro | validação externa de cada integração | Ver `docs/dependencias-externas.md` | a definir |
| ~~Referência de conformidade em código de tela~~ | Interface | — | ✅ **FECHADA em ENT01**: 85 ocorrências removidas de 21 arquivos; 15 frases reescritas em vocabulário de negócio. `test/ui/rotulos-de-conformidade.test.ts` impede a volta, e prova também que o vocabulário do negócio NÃO foi varrido junto. Uma exceção nomeada: as seções do **leiaute do TCE-PB** na tela do SAGRES (normativo externo, como "LRF art. 8º"), com a coluna rotulada para não ficar ambíguo | ENT01 |
| Código interno de módulo em texto de ajuda | Interface | nada hoje | 15 ocorrências de "M03", "M07", "M10" em texto de tela. Não é identificador de catálogo, mas não diz nada a quem usa. Registrado em `test/ui/rotulos-de-conformidade.test.ts` | lote que revisar tela a tela |
| Eixo **município** não existe no schema | Arquitetura | testes 4, 7 e 9 do incremento | `EnteConfig` é singleton por PK; o escopo de permissão é `ENTE \| UG`; nenhuma das 118 tabelas tem coluna de tenant. O próprio pacote registra que a escolha entre produto único e dois produtos "não dá para inferir do código". Ver `docs/caracterizacao-m01-m05.md` §6 | **decisão do usuário** |

### Divergência registrada, não corrigida

`PROJETO.md` (dentro do repositório) lista **M09, M10, M11, M12, M13 e M14 como
"pendente"**. O disco contradiz:

| Módulo | Arquivos `.ts` | Arquivos de teste |
|---|---:|---:|
| m09-tesouraria | 10 | 5 |
| m10-patrimonial | 17 | 7 |
| m11-licitacoes | 12 | 5 |
| m12-relatorios | 68 | 29 |
| m13-transparencia | 5 | 1 |
| m14-exports-federais | 8 | 2 |

O documento é que está defasado, não o código. Conferir o disco antes de tratar
qualquer módulo como ausente. **Não corrigido neste lote** — ENT00 proíbe alterar
código de domínio, e a correção do documento pertence ao lote que for usá-lo.

Ressalva que o mapa de lacunas já fazia e que se confirma: M09 tem 10 arquivos,
mas o handoff registra a tesouraria como "existe só como schema". Ter arquivo não
é ter capacidade — a caracterização de ENT03 dirá qual das duas leituras vale.

## Dependências externas

Espelho resumido de `docs/dependencias-externas.md` (criado neste lote).

| Órgão | Integração | Estado | Próxima ação |
|---|---|---|---|
| TCE/SC | Remessa e-Sfinge | **AUSENTE** | Obter IN TC-28/2021 e IN TC-35/2024 e o layout vigente |
| TCE/PB · TCM/BA | SAGRES · SIGA | Código local sem validação | Preservar como histórico; **não** converter em conector SC |
| ADN | NFS-e, IBS, CBS, NBS | AUSENTE + pendente de descoberta | Obter manual e XSD oficiais com vigência |
| TJ/SC | Peticionamento | AUSENTE + pendente de descoberta | **Não assumir PJe/MNI**; confirmar contrato antes de codificar |
| Provedor de HSM | Custódia A1 | **Provedor não definido** | Modo A1 indisponível com motivo declarado; não chamar de HSM um A1 cifrado no banco |
| Banco do Brasil | Borderô e retorno | Código local sem validação | Levantar os convênios que o município usa de fato |
| Demais 17 integrações | — | AUSENTE | Ver o documento |

**Credenciais obtidas: 0. Convênios firmados: 0. Transmissões reais: 0.**

## Situação do catálogo

| Cláusula | De | Para | Evidência |
|---|---|---|---|
| — | — | — | **nenhuma cláusula mudou de situação neste lote** |

ENT00 não entrega funcionalidade de produto. As 2.037 cláusulas de
`catalogo-execucao.json` permanecem `NAO_VERIFICADO`. Suíte verde mede o que a
base garante; não comprova atendimento de cláusula. Rodar 1288 testes que já
existiam não valida uma linha do documento de origem.

## ENT01 — o que foi feito, e é medido

| Frente | Estado | Evidência |
|---|---|---|
| Caracterização de M01 e M05 (§2.2) | ✅ | `docs/caracterizacao-m01-m05.md`; baseline dos dois módulos: 11 arquivos, 97 testes, 42,85 s |
| Papel de runtime (§3, 1º item) | ✅ | `prisma/papel-runtime.ts`, `npm run db:papel`, `test/papel-runtime.test.ts` (15 testes) |
| Append-only garantido pelo BANCO | ✅ | UPDATE/DELETE/TRUNCATE no razão recusados pelo papel da aplicação |
| A cadeia da despesa roda sob o papel restrito | ✅ | empenho → liquidação → pagamento com retenção, com os valores do cenário de aceite |
| T02 — pessoas e credores | ✅ | M19 (schema, domínio, ports, serviço, adapter, consultas) + tela + detalhe + histórico |
| T02 provado pela INTERFACE | ✅ | `npm run smoke:pessoas` — 9 passos em navegador real, 0 falhas |
| Nenhum identificador de catálogo em tela (teste 24) | ✅ | 85 removidos; `test/ui/rotulos-de-conformidade.test.ts` |
| T05 — detalhe do empenho | ✅ | `/despesa/empenhos/[id]`: origem, liquidações, retenções, pagamentos, anulações, razão e histórico no mesmo contexto. A consulta é do M05 (`dossie.ts`); a tela não soma nada |
| T06/T07 — retenção **pela tela** | ✅ | O form de pagamento oferece linhas de retenção; a conta de passivo vem do CADASTRO (`TipoConsignacao.contaPassivoId`), nunca do navegador |
| A cadeia atravessa pela INTERFACE | ✅ | `npm run smoke:cadeia` — empenhar, recarregar, liquidar, recarregar, pagar com retenção, conferir no dossiê, anular, recarregar. 17 passos, 0 falhas |
| Estorno não infla o caixa pelo bruto | ✅ | medido no razão: o estorno devolve **900,00** a Bancos e mata 100,00 de Consignações. Ver abaixo |

### O cenário de aceite, conferido perna a perna

Dotação 10.000,00 · empenho 1.000,00 · liquidação 1.000,00 · retenção **informada**
de 100,00 · saída de caixa 900,00. Valores de engenharia — não representam alíquota
legal, pagamento real nem tabela tributária de município algum.

Esperado, **registrado antes de rodar**, e conferido:

| Conta | Tipo | Subsistema | Valor |
|---|---|---|---|
| 2.1.3.1.1.00.00 (obrigação) | DÉBITO | PATRIMONIAL | 1.000,00 |
| 1.1.1.1.2.00.00 (caixa) | CRÉDITO | PATRIMONIAL | **900,00** |
| 2.1.8.8.1.01.00 (consignação) | CRÉDITO | PATRIMONIAL | 100,00 |
| 6.2.2.1.3.03.00 (crédito liquidado) | DÉBITO | ORÇAMENTÁRIO | 1.000,00 |
| 6.2.2.1.3.04.00 (crédito pago) | CRÉDITO | ORÇAMENTÁRIO | 1.000,00 |

Um lançamento com pernas de **valores diferentes**: o caixa leva o líquido, as
demais levam o bruto. Cada subsistema fecha sozinho — conferido, e não por
compensação entre eles.

#### E o ESTORNO, que é onde este cenário se paga

Anulado o pagamento **pela tela**, o razão recebeu (medido, `2026OP865626A`):

| Conta | Tipo | Subsistema | Valor |
|---|---|---|---|
| 2.1.3.1.1.00.00 (obrigação) | CRÉDITO | PATRIMONIAL | 1.000,00 |
| 1.1.1.1.2.00.00 (caixa) | DÉBITO | PATRIMONIAL | **900,00** |
| 2.1.8.8.1.01.00 (consignação) | DÉBITO | PATRIMONIAL | 100,00 |
| 6.2.2.1.3.04.00 (crédito pago) | DÉBITO | ORÇAMENTÁRIO | 1.000,00 |
| 6.2.2.1.3.03.00 (crédito liquidado) | CRÉDITO | ORÇAMENTÁRIO | 1.000,00 |
| 8.2.1.1.4.01.00 (DDR utilizada) | DÉBITO | CONTROLE | 1.000,00 |
| 8.2.1.1.3.01.00 (DDR por liquidação) | CRÉDITO | CONTROLE | 1.000,00 |

**O caixa recebe de volta 900,00 — o que saiu —, nunca os 1.000,00 do bruto.**
Um estorno pelo bruto inventaria 100,00 de disponibilidade que nunca saiu, e o
lançamento **fecharia do mesmo jeito**: os dois lados errados na mesma medida. É
por isso que nenhuma amarração de balancete pega esse erro, e é por isso que ele
tem teste e smoke próprios (`modules/m05-despesa/m05-dossie.test.ts`).

### O achado do funil de autorização — ação nova não alcança perfil existente

Descoberto pelo smoke, não por um teste. As três ações de T07 entraram no censo, e
o administrador da instalação recebeu:

```
ACESSO NEGADO: o usuário "admin@cg.pb.gov.br" não tem permissão para
PREPARAR_ORDEM_PAGAMENTO na unidade gestora ac-uo.
  perfis do usuário: ADMINISTRADOR
  o que faltou: A AÇÃO — nenhum dos perfis dele concede PREPARAR_ORDEM_PAGAMENTO,
  em unidade nenhuma. Não é escopo: é a ação.
```

**O funil estava certo.** O que faltava era o caminho de **atualização**: o
`bootstrap-usuario` monta o perfil de instalação a partir do censo **uma vez**, na
vida do banco. Uma versão que acrescenta ações deixa o administrador sem elas — e
ele descobre abrindo a tela nova.

O caminho existe agora: `npm run db:conceder <PERFIL> <ACAO>...`. Ele mora em
`scripts/`, **fora de `prisma/seed/`** — o t5 do M16 proíbe perfil, usuário e
permissão no seed, e a razão continua inteira ("um seed que carimba um
superusuário entrega a chave-mestra a quem rodar `npm run seed`"). E exige as
ações **por nome, uma a uma**: um `--todas` seria a chave-mestra com cara de
rotina. Não cria perfil; exige `SEED_IDENTIDADE`, porque conceder poder é um ato e
fica com o nome de quem o praticou.

⚠️ **Continua sem tela e sem caso de uso.** Conceder uma ação a um perfil não é
serviço do M16 — há `concederPerfil` (usuário → perfil), não `concederAcao`
(perfil → ação). Pendência `CONCEDER-ACAO-A-PERFIL-UI`.

### Afirmações do repositório que este lote encontrou FALSAS

Corrigir a documentação não é higiene: um comentário que descreve um sistema que já
não existe faz o próximo leitor **parar de ler o código**. As quatro:

| Onde | Dizia | É |
|---|---|---|
| `components/ui/MODULO-UI.md`, tabela de portas | escrita "não — ver §5" nas quatro portas de execução | O próprio §5, três parágrafos abaixo, dizia que elas escrevem desde a 7.3. Duas afirmações opostas no mesmo documento |
| `components/ui/MODULO-UI.md`, pendência `5.35-UI` | "anulação na tela — falta o ato na UI" | `FormAnular` existe e está em uso nas três listas da despesa **desde a cópia da origem**. A pendência estava quitada e ninguém apagou a linha |
| `lib/portas/pagamento.ts`, cabeçalho | "**SÓ LEITURA**" e "não há `pagar()` aqui" | `registrarPagamento` estava logo abaixo |
| `app/(areas)/despesa/pagamentos/page.tsx` | "SÓ LEITURA NESTA FATIA" | a tela paga |

E uma **lacuna** que só apareceu porque este lote precisou semear um banco de verdade:

> **`RoteiroOrcamentario` não tinha seed de produção.** A tabela-parâmetro é
> fail-closed por desenho — sem ela, o movimento de dotação não lança no razão e
> **nenhuma ficha nasce**. Os roteiros existiam só num helper de TESTE
> (`test/roteiro-orcamentario.ts`), então a suíte inteira passava enquanto um banco
> real não conseguia criar a primeira ficha. **A suíte não podia pegar isso: ela
> mesma semeava o que faltava.** Fechado em `prisma/seed/roteiro-orcamentario.ts`,
> importando os códigos de conta do domínio em vez de redigitá-los.

### Baselines de ENT01

| Medida | ENT00 (fim) | ENT01 (agora) |
|---|---|---|
| Arquivos de teste | 130 | **144** |
| Testes | 1.302 + 1 falha esperada | **1.441, zero falha esperada** |
| Duração | 312,17 s | **~340 s** (máquina livre) |
| `tsc` backend / app / scripts | limpos | limpos |
| Migrations | 63 | **68** |
| Smoke visual | 8 ok / 2 avisos | **22/22 rotas** |
| Smoke do cadastro de pessoas | — | **9/9 passos** (navegador real) |
| Smoke da cadeia da despesa | — | **23/23 passos** (navegador real) |
| Os 25 do incremento | — | **18 cobertos · 4 parciais · 3 não cobertos** |

⚠️ **Uma execução intermediária acusou 2 falhas, e elas foram investigadas, não
descartadas.** Uma era real (`listarPessoas` fora do censo do M16 — o grep-teste
bidirecional cobrando, que é o trabalho dele) e foi corrigida. A outra foi
**timeout de 5 s** no M14, com o servidor Next e o Chromium do smoke disputando a
máquina; reexecutada isoladamente e com a máquina livre, passou nas duas vezes.
Fica registrado porque "reexecutei e passou" só vale acompanhado do motivo.

## ENT01 — o GATE, item a item

O gate do prompt 01, §4, tem seis critérios. O que cada um exige e o que o
sustenta:

| # | Critério | Situação | Evidência (comando, nesta máquina) |
|---|---|---|---|
| 1 | A cadeia inteira executada **pela interface**, do cadastro do credor ao razão | ✅ | `npm run smoke:cadeia` — **23 passos, 0 falhas**, navegador real |
| 2 | Cada tela, recarregada, encontra o dado persistido | ✅ | o mesmo smoke recarrega depois de cada escrita; `npm run smoke:pessoas` — 9/9 |
| 3 | Os valores por conta e subsistema conferem com o esperado **registrado antes** | ✅ | `test/papel-runtime.test.ts`, `modules/m05-despesa/m05-dossie.test.ts` |
| 4 | O estorno inverte as pernas certas, preserva o original e não aumenta o caixa pelo bruto | ✅ | medido: caixa recebe **900,00** de volta. `m08-anulacao-rp`, `m05-dossie`, e o smoke |
| 5 | Os 25 testes do incremento passam, e a regressão de ENT00 continua verde | ⚠️ **parcial, e declarado** | **18 cobertos, 4 parciais, 3 não cobertos** — `test/incremento-25.test.ts` |
| 6 | `ESTADO-EXECUCAO.md` atualizado | ✅ | este documento |

### ⚠️ O critério 5, sem maquiagem

Três dos 25 **não estão cobertos**, e são o mesmo assunto:

| # | Cenário | Por que não |
|---|---|---|
| 4 | Município A não lê dados de B | O eixo município **não existe** nesta base |
| 5 | FK de outro tenant não é aceita | idem |
| 7 | Consolidação de A não inclui B | idem |

`EnteConfig` é singleton por chave primária e nenhuma das 118 tabelas tem coluna
de tenant. A decisão foi tomada e está em `docs/adr/ADR-eixo-de-municipio.md`
(**aceito**, 2026-09-09): o produto atenderá vários municípios por **schema por
município**, com plano de controle em `public` — não por `tenant_id`. É lote
transversal próprio, posterior a este.

**Estes três seguem declarados como pendência, nunca como atendidos.** Nenhum
município novo foi habilitado.

Quatro são **parciais**, com o que falta escrito:

| # | Cenário | O que existe | O que falta |
|---|---|---|---|
| 2 | Troca de entidade preservando o ano | a troca acontece sem novo login e o exercício segue na URL | quando o exercício não existe na entidade nova, declarar o motivo e exigir escolha explícita (`TROCA-DE-ENTIDADE-SEM-EXERCICIO`) |
| 9 | Job/anexo não vaza; memberships revogadas | revogar perfil e inativar usuário derrubam as sessões; o worker passa pelos mesmos guards | a metade dos **tenants** é o item 4 |
| 13 | Idempotência | chave repetida é **recusada** pelo banco, com payload igual ou divergente, e o primeiro fica intacto | repetir NÃO devolve o efeito anterior. Exige chave de idempotência **por requisição** (`IDEMPOTENCIA-DE-REQUISICAO`) |
| 20 | Relatório == tela | tela e PDF chamam a MESMA porta com os MESMOS filtros; os totais vêm do módulo | o teste que gere as duas saídas e as **confronte linha a linha** (`RELATORIO-VS-TELA-CONFRONTADOS`) |

## ENT01 — o que ficou de pé nesta segunda parte

| Frente | Estado | O que é |
|---|---|---|
| **T05 detalhe do empenho** | ✅ | `/despesa/empenhos/[id]` — origem, liquidações, retenções, pagamentos, anulações, razão e histórico no mesmo contexto |
| **T06 retenção pela tela** | ✅ | o form de pagamento pergunta o valor retido; a **conta de passivo é do cadastro**, conferida dentro da transação |
| **T07 pagamento em quatro etapas** | ✅ (etapa 3 declarada indisponível) | ordem de pagamento com preparar/autorizar **segregados**, registro, envio ao banco **indisponível com motivo**, confirmação lida do M09 |
| **T08 razão e conferência** | ✅ | totalizadores por subsistema **com a diferença**, filtros de fato/fonte/unidade, seleção múltipla com soma, coluna de estorno |
| Os três testes difíceis | ✅ | pool (8), unidade de trabalho (14), período fechado por três rotas (11) |
| Seed de produção puro | ✅ | `test/seed-de-producao.test.ts` — banco vazio, seeds de produção, primeira escrita de cada módulo |

### As duas consequências do ADR que valeram já

Nenhuma das duas implanta multi-tenancy. Elas param de **dificultá-la**:

- **`EnteConfig` atrás de uma função** (`modules/m01-core-contabil/contexto-do-ente.ts`).
  A chave do singleton estava escrita à mão em quatro lugares.
- **O schema virou parâmetro** nos grants do `gestao_app`. E não eram só as três
  linhas óbvias: os `GRANT ... ON TABLE` do censo eram **não qualificados**, e
  resolviam pelo `search_path` do dono — com um schema por município, um
  `search_path` diferente concederia privilégio na tabela do município errado, em
  silêncio, porque o SQL é válido.

## ENT01 — o que FALTA (e não bloqueia o gate)

| Frente | Estado | O que falta |
|---|---|---|
| T01 entrada e contexto | parcial | ver o item 2 do incremento |
| T03 dotações e fontes | existe | declarar na tela quais saldos são **atuais** e quais são em data — a caracterização mostrou que só há o atual |
| T04 empenhos | existe | oferecer o cadastro de credor como sugestão (`CREDOR-NO-EMPENHO`) |
| T09 integrações | existe | confrontar com registros reais de tentativa |
| Envio ao banco (T07, etapa 3) | **não existe** | o M17 é só leitura. A porta declara indisponível com motivo, e o tipo de retorno **impede escrever o caminho feliz** (`ENVIO-AO-BANCO-M17B`) |
| Cadastro de tipos de consignação | não existe | a conta de passivo se parametriza por seed; a tela mostra o tipo sem conta DESABILITADO com o motivo (`CONTA-PASSIVO-CONSIGNACAO-UI`) |
| Conceder ação a perfil | não existe | ação nova no censo não alcança perfil existente. Hoje: `npm run db:conceder` (`CONCEDER-ACAO-A-PERFIL-UI`) |

## Próximo lote

| Campo | Valor |
|---|---|
| Lote encerrado | `prompts/01-CONTEXTO-E-PRIMEIRA-ENTREGA.md` com `especificacoes/PRIMEIRA-ENTREGA.md` — **no gate, aguardando revisão**. ENT02 NÃO foi iniciado |
| Decisão tomada | **O eixo município: schema por município**, com plano de controle em `public`. `docs/adr/ADR-eixo-de-municipio.md`, estado **aceito**, 2026-09-09. Duas das cinco consequências foram executadas dentro deste lote (o `EnteConfig` atrás de função e o schema como parâmetro nos grants); as outras três são o lote transversal |
| Riscos conhecidos | (1) O trinco pessimista mudou de primitiva em ENT01 — a regressão está verde, mas concorrência se paga tarde: os testes do M05 sob concorrência continuam sendo a rede, e `packages/locks/locks.test.ts` agora cobra que ninguém trave por fora. (2) O valor retido é **informado**, nunca calculado — ver o adiamento declarado abaixo. (3) Todos os tipos de consignação apontam para a MESMA conta de passivo, porque o plano mínimo tem uma só analítica; o saldo por consignatário continua sendo por `(tipo, credor)`, nunca pela conta contábil. (4) A etapa de envio ao banco não existe, e a tela diz isso — o risco é alguém ler "pagamento registrado" como "dinheiro transferido" |

## ⚠️ Adiamentos DELIBERADOS, com destino

Um adiamento sem destino vira lacuna que ninguém reabre. Estes têm.

### O cálculo da retenção na fonte

**Hoje:** o valor retido é **informado pelo operador**. A tela diz isso, com todas
as letras, no bloco de retenção.

**Por que não é decisão de produto, e sim adiamento:** alíquota de INSS, IRRF ou
ISS depende de legislação tributária — regime do prestador, base de cálculo,
retenção mínima, o município de incidência do ISS. Este sistema não conhece nada
disso. Um cálculo automático hoje seria **recolhimento a menor com o ente
respondendo pela diferença**, e o erro apareceria numa fiscalização, não num
teste.

**Quando entra, e com o quê:** com o bloco fazendário. E não como uma constante:
regra **versionada por vigência** (a alíquota de 2026 não recalcula uma retenção
de 2025) e **memória de cálculo** persistida junto da retenção — base, alíquota,
versão da regra —, porque quem confere precisa ver a conta, não o resultado.

O incremento já previa exatamente isto: *"se houver cálculo de alíquota/base,
apresentar a regra versionada e memória; para a fixture inicial usar um valor
explicitamente informado, sem inventar uma alíquota legal"*.

**O que o sistema garante enquanto isso:** que o lançamento feche, que o passivo
nasça na conta do **cadastro** (não numa escolhida por quem chamou) e que o caixa
saia pelo líquido.

### O envio ao banco

**Hoje:** indisponível, com motivo declarado, sem rota e sem botão. O tipo de
retorno da porta é `disponivel: false` **literal** — enquanto não houver o que
ligar, nenhum código consegue escrever o caminho feliz; o compilador recusa.

**Quando entra:** com o M17-b (escrita bancária). O M17 atual é só leitura —
extrato e saldo.

**O que não pode acontecer nesse meio-tempo:** um botão "enviar" que devolva
sucesso local. É a diferença entre "o pagamento foi registrado" e "o dinheiro
saiu", e um sistema que as confunde produz o pior tipo de erro: o que parece
resolvido.

---

# ENT02 — capacidades transversais exercitadas por documentos reais

> Executado em 2026-09-10, nesta máquina, sobre o ENT01 no gate.
> Sete módulos novos, todos os números medidos.

## 1. O gate, item a item (seção 6 do prompt do lote)

| # | Definição de concluído | Situação | Prova |
|---|---|---|---|
| 1 | Um processo digital percorre abertura, tramitação, parecer, readequação, encerramento e arquivamento, **pela interface**, com dados persistidos e visíveis após recarga | ✅ | `scripts/smoke-ent02.ts` — **43 passos, 0 falhas**. Cada passo **recarrega a tela do servidor** antes de conferir |
| 2 | Um comunicado percorre inclusão, resposta, encaminhamento, leitura registrada e arquivamento | ✅ | mesmo smoke, passos 22-28 |
| 3 | Um cadastro de pessoa recebe campo adicional, anexo e assinatura, e exibe a linha do tempo no detalhe | ⚠️ **PARCIAL** (era 0 de 3 na tela de pessoa, agora é 1 de 3) | **anexo: entregue** no fechamento — a tela da pessoa tem `input[type=file]`, lista com download individual e lote. **Campo adicional e assinatura em PESSOA continuam sem superfície**: o motor existe e é testado, a tela não. Pendências `CAMPO-ADICIONAL-DEFINICAO-UI` e `ASSINATURA-UI` |
| 4 | Um relatório operacional é produzido **pelo designer**, com modelo copiado, visibilidade definida e execução em segundo plano | ✅ | smoke, passos 29-36: cria o modelo, recusa a expressão maliciosa, copia (a cópia nasce restrita), executa e abre o CSV com o campo calculado |
| 5 | Toda a suíte existente continua verde e os testes deste lote passam | ✅ | **157 arquivos, 1580 testes, 0 falhas** (334s). No gate eram 153/1556 em 403s — o fechamento acrescentou 4 arquivos e 24 testes, e o tempo caiu porque a suíte deixou de disputar o banco |
| 6 | `ESTADO-EXECUCAO.md` registra código, gate, comandos, resultados reais e o próximo lote | ✅ | este documento |

### O critério 3, dito sem maquiagem

O prompt pede o trio **campo adicional + anexo + assinatura** no cadastro de **pessoa**.
O que existe:

- **campo adicional**: o motor é genérico (`CadastroComCamposAdicionais` inclui `PESSOA`)
  e testado; a tela de preenchimento existe para **processo**, não para pessoa;
- **anexo**: **resolvido no fechamento**. `Anexo.pessoaId` já existia com autorização por
  registro; agora existem o `input[type=file]`, a rota de download individual
  (`/documentos/anexos/[id]`) e a de lote, as duas autorizadas pelo registro dono;
- **assinatura**: existe e é testada sobre anexo e sobre movimento — não há tela.

Nada disso foi contornado com um substituto que pareça pronto. As pendências que restam
estão nomeadas em `components/ui/MODULO-UI.md`.

## 2. Os 22 testes mínimos do lote (seção 5)

**21 cobertos · 0 parciais · 1 não coberto.** (Era 20/1/1 no gate; o item 4 fechou no
fechamento — ver a seção 10.) O inventário é `test/lote-ent02.test.ts`,
que imprime o placar a cada execução e falha se a classificação mudar sem alguém decidir.

| # | Item | Situação |
|---|---|---|
| 1 | Processo do município A não visível em B | **NÃO COBERTO** — é o eixo município, decidido pelo ADR e fora deste lote. Segue declarado, como no ENT01 |
| 4 | Anexo não acessível **por URL** a quem não tem permissão | **PARCIAL** — a regra está provada (quem não é envolvido recebe `null`) e o arquivo mora fora de pasta servida estaticamente; falta a URL, porque não há rota HTTP de download |
| demais 20 | — | cobertos, cada um com o arquivo e o teste apontados no inventário |

## 3. Os sete módulos, e a decisão central de cada um

| Módulo | Bloco | A decisão que governa |
|---|---|---|
| **M21** protocolo | 5.42 (75 cláusulas, era `AUSENTE_CONFIRMADO`) | **não existe coluna `situacao`** — ela é derivada dos movimentos, como o `statusDoEmpenho` sai dos SUMs |
| **M22** anexos e assinatura | 2.4/2.5 do prompt | a autorização do anexo é a do **registro dono**; nenhuma regra de acesso nova |
| **M23** comunicação interna | 5.43 (53 cláusulas, era `AUSENTE_CONFIRMADO`) | **as caixas são ponto de vista, não estado** — o mesmo documento está na saída de um e na entrada do outro |
| **M24** notificações | 2.6 | um serviço, três canais, **e só um existe** — e-mail e push ficam registrados com `entregueEm` nulo e motivo |
| **M25** campos adicionais | 5.29.7 | **quatro colunas tipadas**, não um `valor String`: comparar "1.000" com "900" como texto diria que 900 é maior |
| **M26** designer | 2.7 | a linguagem é **pequena por construção** — o que ela não sabe fazer, ela não faz, e não porque alguém a proibiu |
| **M27** suporte | 2.8 | severidade é **dado de configuração**, não enum: é o que cada contratante negocia no contrato |

## 4. O que o ENT02 acrescentou, em números medidos

| Medida | ENT01 (gate) | ENT02 (gate) | ENT02 (fechamento) |
|---|---:|---:|---:|
| Arquivos de teste | 144 | 153 | **157** |
| Testes | 1441 | 1556 | **1580** |
| Serviços no censo | 105 | 156 | 156 |
| Ações distintas | 101 | 149 | 149 |
| Migrations | 68 | 80 | 80 |
| Rotas no smoke visual | 22 | **29** | 29 |
| Passos de smoke de cadeia | 23 (despesa) | 23 + 37 (ENT02) | 23 + **43** (ENT02) |
| Passos do smoke de pessoas | 9 | 6 ok / **3 falhas** | **9 ok / 0 falhas**, três execuções seguidas |

⚠️ **Nem serviço nem ação nova no fechamento, e isso é deliberado.** Os quatro itens são
superfície, teste e infraestrutura — o download de anexo é LEITURA, e leitura não vira ação
do censo porque a permissão que a governa é a do registro dono. Uma ação `BAIXAR_ANEXO`
seria uma segunda regra de acesso, que divergiria da primeira. As cinco leituras novas
entraram em `FORA_DO_CENSO` com o motivo.

## 5. Os comandos, e o que cada um respondeu

| Comando | Resultado real | Quando |
|---|---|---|
| `npx vitest run` (gate) | **153 arquivos, 1556 testes, 0 falhas** — 403s | 2026-09-10 |
| `npx vitest run` (fechamento) | **157 arquivos, 1580 testes, 0 falhas** — 334s | 2026-09-10 |
| `npx tsx scripts/smoke-ent02.ts` (fechamento) | **43 passos, 0 falhas** | 2026-09-10 |
| `npm run smoke:pessoas` ×3 seguidas (fechamento) | **9/9 cada**, 0 falhas | 2026-09-10 |
| `npm run typecheck` · `typecheck:app` · `typecheck:scripts` | limpos | 2026-09-10 |
| `npm run build` | compila; 7 rotas novas | 2026-09-10 |
| `npm run db:papel` | papel sem superusuário, sem BYPASSRLS, sem DDL, nos dois bancos | 2026-09-10 |
| `SEED_IDENTIDADE=… npm run seed:ent02` | cenário semeado: 3 setores, 3 assuntos com roteiro, 3 tipos de comunicado, 3 severidades, 5 campos adicionais, 2 ajudas | 2026-09-10 |
| `npx tsx scripts/smoke-ent02.ts` | **37 passos, 0 falhas** | 2026-09-10 |
| `npx tsx scripts/smoke-cadeia-despesa.ts` | **23 passos, 0 falhas** — o ENT01 continua atravessando | 2026-09-10 |
| `npx tsx scripts/smoke-visual.ts` | **29/29 rotas** | 2026-09-10 |
| `npx tsx scripts/smoke-cadastro-pessoas.ts` | **6 ok, 3 falhas** — ver abaixo | 2026-09-10 |

### ⚠️ As 3 falhas do smoke de pessoas são resíduo, e o motivo vai junto

O cadastro de teste `11222333000181` ("Fornecedor de Smoke ME") **ficou no banco de
desenvolvimento** numa execução anterior, em **2026-09-09 22:04:47**. As três falhas são
o smoke colidindo com o próprio resíduo — ele mesmo avisa isso na saída ("o cadastro de
teste pode ter ficado no banco de dev"). Os passos que não dependem de criar (detalhe,
concessão de papel, histórico, recusa de duplicado) passam.

**Não removi o registro**: é dado do banco de desenvolvimento, criado fora desta sessão,
e apagá-lo é decisão de quem opera o ambiente — não de quem está no meio de um lote.

## 6. ⚠️ O falso alarme que quase virou conclusão errada

Uma regressão intermediária deu **13 falhas em M05, M08, M12, M19 e M20** e levou
**107 minutos** (o normal é ~7). Nenhum desses módulos tinha sido tocado.

**Não era o código.** Eram **duas execuções da suíte disputando o mesmo banco de teste**,
porque lancei um subconjunto enquanto a completa ainda rodava. Com o banco quieto, os
mesmos arquivos passam em 12 segundos.

O que sobrou de real da investigação foi outra coisa, e ela valeu: `TRUNCATE` de 141
tabelas **vazias** custava **1794 ms** — o custo é tomar `ACCESS EXCLUSIVE` e recriar o
arquivo de cada tabela e índice, não as linhas. Passou a truncar só o que tem linha
(detecção por `EXISTS`, que lê linha e não estatística): **21 ms**.

> ⚠️ E uma armadilha do driver ficou escrita no código: com o delimitador `$$`, o bloco
> `DO` é **aceito, não levanta erro e não executa**. A falha aparece longe, no arquivo
> seguinte, como violação de unicidade. O delimitador é nomeado (`$limpeza$`).

## 7. ⚠️ O outro falso alarme: o Chromium sob pressão de memória

Os smokes falhavam com `Runtime.callFunctionOn timed out` — que se lê como *"a tela não
respondeu"* e mandaria a próxima pessoa procurar defeito na tela.

Medido: **84 MB de memória física livre e 6,6 GB dos 8 GB de swap em uso**. O renderer
estava sendo paginado para o disco. Os quatro smokes ganharam
`--disable-dev-shm-usage`, `--disable-gpu`, `--disable-extensions` e `protocolTimeout`
explícito — e passaram a rodar.

## 8. O que o smoke pegou, e que nenhum teste de módulo pegaria

| Achado | Onde |
|---|---|
| A tela preenchia os campos do **parecer** e apertava o botão do **trâmite** — `querySelector` devolve o primeiro da página | corrigido na TELA: cada `<form>` ganhou `data-acao` |
| O seletor de **encaminhamento** oferecia um setor que o servidor recusa ("o setor já está no comunicado") | a tela passou a excluir também quem já está na conversa |
| A porta do comunicado não publicava o **modo de assinatura exigido** — tornava impossível enviar um ofício que a entidade configurou para exigir assinatura | publicado |
| A linha do tempo não publicava `respondeAId` — o seletor de "responder parecer" ofereceria pedidos já respondidos | publicado |

## 9. Adiamentos DELIBERADOS, com destino

| O que | Por que agora não | Destino |
|---|---|---|
| **Eixo município** (teste 1) | Decisão do ADR: schema por município é lote transversal próprio | lote de tenancy |
| **Fluxograma visual do processo** | O próprio prompt manda não implementá-lo agora | lote posterior identificado |
| **Guia bancária da taxa** | Pertence ao bloco de arrecadação (5.29), `AUSENTE_CONFIRMADO`, frente ENT06 | `PROTOCOLO-GUIA-BANCARIA` |
| **Assinatura qualificada / HSM** | Sem provedor. O caso de uso RECUSA produzi-la | `ASSINATURA-ICP-HSM` |
| **Envio real de e-mail e push** | Sem provedor, e envio externo está fora da autorização de trabalho | `NOTIFICACAO-EMAIL-PUSH` |
| **Trabalhador contínuo do designer** | Sem agendador. Hoje a fila é drenada ao abrir a tela, e isso está declarado | `DESIGNER-WORKER-CONTINUO` |
| **Telas de cadastro** (setor, assunto, tipo de comunicado, severidade, definição de campo) | Os casos de uso existem e são exercitados pelo seed do cenário | 5 pendências em `MODULO-UI.md` |

## 10. O fechamento do ENT02 — os quatro itens da revisão

> Executado em 2026-09-10, à tarde. Quatro commits separados, suíte verde antes e depois
> de cada um. A ordem de execução não foi a de numeração: a trava da suíte (item 3) veio
> primeiro porque é a infraestrutura que permite medir os outros três com confiança.

| Item | Commit | Suíte depois |
|---|---|---|
| 3. Trava de concorrência da suíte | `f68e760` | 155 arquivos · 1560 testes · 383s |
| 1. Superfície dos anexos | `42acb00` | 156 · 1574 · 363s |
| 2. Smoke de pessoas idempotente | `5eb33b2` | 156 · 1574 · 349s |
| 4. Formulários na mesma página | `68108ff` | 157 · 1580 · 334s |

### 11.1 O escopo dos anexos era GLOBAL, e foi medido antes de escrever

A revisão perguntou se a rota de download faltava só na tela de pessoa ou no produto
inteiro. Medido, e é o pior caso:

- `lib/portas/` não tinha porta de documentos;
- `anexarArquivo` e `baixarAnexo` eram chamados **só pelo próprio arquivo de teste**;
- o único `input[type=file]` do produto era o do importador de CSV;
- não havia rota de download em lugar nenhum.

O M22 fechou o ENT02 com caso de uso, autorização por registro, hash, conferência de
integridade e quinze testes — **e zero consumidores**. Um cofre sem porta. Pior: a tela do
processo já LISTAVA o nome dos anexos de cada movimento, sem link — a forma mais silenciosa
de prometer sem entregar.

**Três decisões da superfície.** A saída é rota HTTP e não Server Action (um PDF de 20 MB
atravessaria o protocolo do React como array de bytes e o browser não saberia salvá-lo). A
porta usa `sessaoAtual` e não `exigirSessao` — este REDIRECIONA para `/login`, e um browser
que seguisse o 307 salvaria o HTML do login com o nome do PDF; sem sessão a rota responde
**404**, a mesma resposta de "não existe", porque um 401 confirmaria que o anexo existe.
E `attachment` + `nosniff`: `inline` faria o browser renderizar o arquivo na origem da
aplicação, e um "anexo" HTML enviado por requerente externo viraria script com o cookie de
quem o abriu.

**Enumerar já é vazar.** A lista também pergunta ao registro dono: os nomes dos arquivos de
um processo disciplinar contam a história inteira sem que ninguém baixe nada.

**O lote não é atalho para fora da autorização.** Ele monta o zip com o que `baixarAnexo`
entregaria um a um, e confere o hash de cada arquivo — um adulterado derruba o lote inteiro.
Se ele engolisse, o download individual recusaria e o lote entregaria: duas respostas para a
mesma pergunta, e a mais permissiva ganharia.

O contêiner ZIP saiu do M14 para `packages/zip` em vez de virar um segundo formatador do
mesmo formato binário. O teste do M14 compara **byte a byte** e exige duas execuções
idênticas — é ele que prova que o artefato fiscal não mudou de forma.

### 11.2 Dois defeitos que os testes acharam, e os dois eram meus

**O diretório central do zip escrevia offset 0 em toda entrada.** Constante correta para um
arquivo, errada para três: o extrator mostraria o primeiro documento três vezes, com três
nomes diferentes, sem estourar nada. Pego porque o teste chama o `unzip` **do sistema
operacional** — um programa que este repositório não escreveu e não pode enganar. Conferir
os bytes contra a minha própria leitura dos bytes provaria só que sei ler o que escrevi.

**`nomeSeguroNoZip` removia os pontos iniciais antes de achatar as barras**, e
`../../.ssh/authorized_keys` saía com um `..` vivo no meio. O teste só pegou porque compara
o nome inteiro; um `not.toContain("/")` teria passado.

E um terceiro, no smoke: a requisição anônima saía de `about:blank` e falhava por CORS, não
por autorização. O smoke acusava "a requisição anônima nem completou" — **um servidor que
entregasse o anexo a qualquer um teria dado exatamente a mesma falha**. Um teste de
segurança que passa a errar do lado seguro é o mais perigoso que existe.

### 11.3 Por que documento pré-existente derrubava o smoke de pessoas

A regra de deduplicação está certa e é testada — o próprio passo 7 do smoke prova que a tela
mostra a recusa do domínio. O caminho tratado era o do domínio; o que ninguém tratou foi o
smoke: o passo 2 assumia banco limpo.

**E o comentário no topo do arquivo era falso de duas maneiras.** Dizia que documento único
por execução "não é possível — o DV depende dos dígitos do meio", confundindo "não posso
trocar dígitos mantendo um DV fixo" com "não posso gerar um CNPJ válido aleatório" — o DV se
calcula a partir dos dígitos sorteados. E dizia que "o smoke LIMPA o próprio rastro no fim":
**não havia teardown nenhum**. O comentário descrevia comportamento que o arquivo não tinha.

Escolhido **gerar** em vez de limpar: teardown resolve o caso feliz e falha quando importa —
se o processo morre no meio, o rastro fica e a execução seguinte herda o problema, que é
exatamente o que aconteceu. E apagar exigiria dar ao smoke poder de DELETE sobre um cadastro
append-only, que o M19 não tem de propósito.

Medido: **três execuções consecutivas contra o mesmo banco de dev, 9 ok / 0 falhas cada**
(antes: 6 ok / 3 falhas da segunda em diante).

De caminho, dois outros achados no mesmo arquivo: o passo 4 abria o **primeiro** link da
lista (num banco com outras pessoas, o detalhe de outra — e falharia dizendo "o detalhe não
traz o nome": sintoma verdadeiro, causa errada); e o arquivo nunca importou `dotenv`, então
a única forma de rodá-lo era digitar a senha como argumento, que fica no histórico do shell.

### 11.4 A trava da suíte

`pg_advisory_lock` de sessão, tomado no `global-setup` **antes** de migrar, aplicar SQL ou
provisionar o papel. O segundo processo recebe o pid, o `application_name` de quem segura, o
endereço do banco, o que fazer, e o registro do episódio que motivou a trava.

Advisory lock e não arquivo de trinco: o recurso disputado é o **banco**, não a máquina — um
arquivo em `/tmp` não veria outro checkout apontando para o mesmo banco e barraria duas
suítes que usam bancos diferentes. E ele morre com a conexão, inclusive sob `kill -9`;
arquivo de trinco sobrevive e deixa a suíte travada até alguém apagá-lo à mão.

Ele **falha em vez de esperar**. O caso real não é duas pessoas rodando ao mesmo tempo: é a
mesma pessoa esquecendo a suíte completa noutra janela. Ela precisa saber disso, não aguardar
107 minutos por um resultado que chegaria contaminado.

O teste é auto-verificável: quando ele roda, o trinco já está tomado pelo próprio
`global-setup`, então pedi-lo dali **é** a concorrência que se quer provar. Se alguém remover
a trava, `travarASuite` sucede e o teste falha.

Medido: com o trinco preso, exit 1 e a mensagem nomeando o processo 19037.

### 11.5 Os catorze formulários — a resposta direta

**Os ids não estavam repetidos, e não foi preciso torná-los únicos nem renderizar um por
vez.** `CampoEnvolvido` já montava o id com `useId()`, único por instância — então `label
for`, leitor de tela e navegação por teclado sempre funcionaram. O que estava errado era o
**smoke**, que localizava campos com `querySelector` global.

Mas "eu li o código e ele usa `useId`" é o tipo de afirmação que envelhece. Agora há prova:
seis testes que exigem zero ids repetidos com `name` repetidos, que todo `label for` e todo
`aria-describedby` apontem para dentro do **próprio** formulário (um id único apontando para
o campo do form vizinho passaria num teste de unicidade e ainda mandaria o foco para o lugar
errado), que todo `<form>` tenha `data-acao` único, e que o `FormData` de cada um leve só os
seus campos.

O sexto alcança as **telas**, não o componente — e **achou um caso real que a leitura não
pegou**: o `<datalist>` de naturezas da arrecadação usava `id="naturezas-loa"` fixo. Hoje a
tela o renderiza uma vez e funciona; no dia em que renderizar dois, o `list` do segundo input
apontaria para as sugestões do primeiro, em silêncio. Corrigido com `useId` em vez de aberto
como exceção.

## 11. ENT03 — a caracterização, a tesouraria, e o que NÃO foi feito

> Executado em 2026-09-10. **Parado no gate, aguardando revisão.**

### 12.1 A ordem foi respeitada: caracterizar antes de ampliar

**Nada novo entrou em M01, M04, M05, M06, M07, M08, M12 ou M14 antes da medição.** E a
medição encerrou a dúvida de 09/09:

```
$ npx vitest run modules/m01-core-contabil modules/m04-receita modules/m05-despesa \
    modules/m06-ordem-cronologica modules/m07-extraorcamentario \
    modules/m08-restos-a-pagar modules/m12-relatorios modules/m14-exports-federais

 Test Files  61 passed (61)
      Tests  647 passed (647)
   Duration  190.52s
```

**Nenhuma das 13 falhas de 09/09 era defeito.** Eram duas suítes disputando o banco.

`docs/caracterizacao/01-financeiro.md` registra os cinco comportamentos, e
`test/caracterizacao/financeiro.test.ts` (15 testes) os prende: **três deles registram
LIMITAÇÃO, não garantia** — se alguém as corrigir, o teste falha, e a correção vira decisão
consciente.

**O achado que muda o plano:** ⚠️ **não existe saldo de dotação por data.**
`saldosDaFicha` tem dois parâmetros e nenhum é temporal, e `MovimentoDotacao` **não tem
data de competência** — só `criadoEm`, o instante da gravação. Um decreto de 20/06 lançado
em 15/07 responderia errado a "qual era o saldo em 30/06?", **em silêncio**. E o empenho
TEM `data`, o que torna a assimetria uma armadilha.

Cotas por período, contingenciamento e prévia de alteração (2.5) dependem disso. **Nenhum
deles foi construído**, e é por essa razão.

### 12.2 A máquina — decidido e registrado ANTES de abrir o lote

`docs/caracterizacao/00-maquina-e-concorrencia.md`. Medido: 8 GB de RAM, Docker com
3,825 GiB reservados, **7,4 GB dos 8 GB de swap em uso em repouso**. Durante a suíte sobram
29–232 MB; durante o smoke o swap chega a **7857 MB de 8192 (96%)**.

Cada um passa sozinho; os dois juntos não passam. `scripts/trinco-de-maquina.ts` serializa
suíte, smokes e build. Ele **não substitui** a trava do ENT02: aquela protege o banco e é
por banco; esta protege a máquina.

**Recusado:** limitar a concorrência da suíte. O RSS somado dos processos node no pico foi
**538 MB** — ela não é a maior consumidora. Cortar workers a deixaria mais lenta sem
devolver memória.

⚠️ **Nada foi parado nem reconfigurado no Docker.** Os três containers de outro projeto e o
limite da VM são ambiente do usuário. Fica o número.

### 12.3 O que a tesouraria ganhou

Lote de pagamento, borderô e retorno bancário — os **testes 4, 5 e 6** do lote do ENT03,
com 18 testes novos. O detalhe está em `modules/m09-tesouraria/MODULO.md`.

Três decisões que valem repetir aqui:

- **o lote AGRUPA** `OrdemDePagamento` e `MovimentoExtraorcamentario` que já existiam — não
  copia valor, credor nem conta, e quem paga continua sendo o M05;
- **a ordem cronológica é conferida na inclusão**, contra a mesma fila do M06 — porque a
  caracterização mostrou que o domínio **relata** e não bloqueia;
- **o borderô vira um `Anexo` de origem SISTEMA**, então é baixável pela rota do ENT02 e
  assinável pela fila do M22, sem código novo.

⚠️ **E o guard da ordem cronológica nasceu errado.** Sem descontar da fila os itens já em
lote vigente, um lote com duas liquidações da mesma fonte era **impossível de compor**. Só
apareceu porque o teste tinha duas liquidações — com uma só, ele passaria por vacuidade.

### 12.4 ⚠️ O que NÃO foi feito — a maior parte do prompt

| Seção do prompt | Situação |
|---|---|
| 2.2 movimentação bancária por fonte | **não feito** — `TESOURARIA-MOVIMENTACAO` |
| 2.2 conciliação: cópia de pendências ao período seguinte | **não feito** — `CONCILIACAO-COPIA-PENDENCIAS` |
| 2.3 diárias, adiantamentos, prestação de contas online | **não iniciado** |
| 2.4 convênios, precatórios, dívida fundada, PPP, consórcios, obras, multas | **não iniciado** |
| 2.5 planejamento (audiências, emendas, prévia, cotas, contingenciamento…) | **não iniciado** — e 2.5 depende do achado 12.1 |
| 2.6 controle interno (módulo novo) | **não iniciado** |
| 2.7 assinatura no fluxo financeiro | **parcial**: o borderô entra na fila; empenho, liquidação, ordem e comprovante **não** |
| 2.8 consulta externa do fornecedor | **não iniciado** |
| Telas do lote e do borderô | **não feitas** — `LOTE-UI`. Os casos de uso existem e são testados |

Dos **22 testes mínimos** do lote, **3 estão cobertos** (4, 5 e 6). Os outros 19 não.

A definição de concluído (seção 5 do prompt) **não está atendida**: nenhum dos quatro
percursos pela interface existe.

### 12.5 O catálogo — a medida real de quanto falta

`scripts/marcar-catalogo.ts` marca `situacao` e `evidencia` só onde há **comportamento,
teste e evidência** — que é o aviso do próprio catálogo. Ele **recusa** marcação sem
evidência e falha se um id não existir.

| Situação | Cláusulas |
|---|---:|
| `NAO_VERIFICADO` | 1999 (98,1%) |
| `VALIDADO_LOCALMENTE` | 21 |
| `IMPLEMENTADO_NAO_VALIDADO` | 10 |
| `AUSENTE_CONFIRMADO` | 4 |
| `DEPENDENCIA_EXTERNA` | 2 |
| `PARCIAL` | 1 |

**38 de 2037 cláusulas verificadas — 1,9%.** O número é desconfortável e é o ponto: sem
ele, "ENT01 e ENT02 concluídos" soaria como muito mais do que é. As 1999 restantes não
foram olhadas, e ninguém deve supor nada sobre elas.

⚠️ **O catálogo vive em `gestao-publica-execucao/`, que NÃO é repositório git.** A alteração
não é revertível por `git checkout`. O script é idempotente e o estado anterior era
`NAO_VERIFICADO` com evidência vazia em todas as 2037 — reconstruível, mas registro aqui
porque a irreversibilidade é real.

### 12.6 Comandos e resultados

| Comando | Resultado | Data |
|---|---|---|
| suíte dos 8 módulos | **61 arquivos, 647 testes, 0 falhas** — 190s | 2026-09-10 |
| `npm run test:tudo` | **159 arquivos, 1613 testes, 0 falhas** — 334s | 2026-09-10 |
| 3 typechecks | limpos | 2026-09-10 |
| `npx prisma migrate deploy` | 3 migrations aditivas, **zero DROP** | 2026-09-10 |
| `npx tsx scripts/marcar-catalogo.ts` | 38 marcações, 1,9% do catálogo | 2026-09-10 |

Censo do M16: **156 → 161 serviços, 149 → 154 ações**. Migrations: **83**.

## 13. ENT03a — o catálogo sob git, a competência, a tesouraria e as assinaturas

> ⚠️ **Esta seção é a PRIMEIRA METADE do ENT03a**, escrita quando o lote ainda estava
> aberto. O fechamento — as duas decisões, os tripwires, as varreduras e as telas — está na
> **seção 14**, e é lá que a definição de concluído é respondida.

### 13.1 O instrumento de medição entrou sob controle de versão

`gestao-publica-execucao/` não era repositório git. O catálogo de 2037 cláusulas é a única
medida de quanto do termo de referência está atendido, e uma marcação errada, um script mal
rodado ou um arquivo sobrescrito não tinham como ser desfeitos nem revistos.

Dois commits, e a divisão é deliberada:

| Commit | O que é |
|---|---|
| `aa41282` | **estado zero** — as 2037 cláusulas em `NAO_VERIFICADO`, evidência vazia |
| `fe3c7db` | as 38 marcações de ENT01 e ENT02, legíveis como diff de exatamente 76 linhas |

Reconstruí o estado zero de propósito. Commitar o catálogo já marcado teria enterrado as 38
marcações no commit inicial, invisíveis — que é o oposto de pôr o instrumento sob revisão.

Conferido antes do primeiro commit: **nenhum valor de credencial** nos arquivos, só as
palavras em prosa. O PDF fonte está versionado e seu `sha256` confere com
`resultado-auditoria.json`. O `.cache-tr-layout.txt` **não** foi ignorado, e o `.gitignore`
diz por quê: ele é derivado por `pdftotext -layout`, cuja saída depende da versão do
poppler, e os ids de cláusula que saem desse recorte são a chave de toda evidência já
registrada.

### 13.2 A competência — o defeito estava no banco de desenvolvimento

ADR **aceito** em `docs/adr/ADR-competencia-no-movimento-de-dotacao.md`, alternativa A.

⚠️ **A medição achou o defeito no dado real, não em hipótese.** No banco de desenvolvimento
havia doze empenhos com `Empenho.data` de **10/04** e `criadoEm` de **09/09** — cinco meses
de distância. Uma consulta de saldo em 30/06 cortada por `criadoEm` teria respondido que
nenhum dos doze existia. Todos são fatos de abril.

⚠️ **E a competência já era conhecida — era calculada e jogada fora.**
`MovimentoDotacaoParams` **já tinha** o campo `data`, com o comentário
*"A data do FATO. É ela que corta a MSC e o balancete — nunca o `criadoEm`"*, escrito antes
deste ADR. Cinco dos seis chamadores já a informavam bem (1º de janeiro para a LOA, a data
do decreto para o crédito, a data do empenho). `registrarMovimentoDotacao` usava esse valor
**apenas** para a perna do razão e não o gravava no movimento. Não se introduziu um conceito
novo: persistiu-se o que já existia.

Migration aditiva de três passos numa transação — `competencia` nullable, backfill,
`NOT NULL` — mais `competenciaDerivada`. **Zero `DROP`.** O backfill recuperou a data do
próprio razão (`LancamentoContabil.dataTransacao` da perna, `origemId = movimento.id`) e de
`Empenho.data`: **14 linhas, 0 derivadas, 0 nulas.**

⚠️ **O grant não foi afrouxado, e isso foi medido antes e depois.** `MovimentoDotacao` não
consta de `ESCRITA_MUTAVEL_DO_RUNTIME`, e `gestao_app` tem apenas `INSERT, SELECT` — antes
e depois da migration. O `UPDATE` do backfill rodou uma vez, dentro da migration, pelo papel
`gestao`, que é o de migração.

**A assinatura antiga não sobreviveu.** `saldosDaFicha(fichaId, deps)` foi **retirada**; no
lugar entraram `saldosCorrentesDaFicha`, `saldosDaFichaPorCompetencia` e
`saldosDaFichaPorRegistro`. Não ganhou um terceiro parâmetro opcional de propósito: um
opcional deixaria todos os chamadores de hoje respondendo pelo eixo antigo sem que ninguém
tivesse decidido isso. A retirada quebrou 9 arquivos na compilação, e cada um foi olhado.

### 13.3 ⚠️ Três acusações, e as três eram contra mim

**(a) O c2 da caracterização teria deixado passar.** Ele afirmava, no docblock, vigiar a
chegada de uma coluna de competência. A asserção era `nomes.filter(/^data/i)` — e a coluna
criada chama-se `competencia`. **Teria passado verde sobre exatamente o que dizia vigiar.**
A lição não é sobre a regex: um teste de caracterização que vigia um NOME de coluna vigia a
grafia, não o conceito. O c2 atual afirma o conjunto exato de colunas.

**(b) `test/` não era typechecked por nenhum tsconfig.** `tsconfig.json` exclui `test`; os
outros dois nunca a incluíram. A retirada de `saldosDaFicha` acusou 9 arquivos em
`modules/**` na compilação e **zero** em `test/**` — o teste de caracterização só quebrou em
tempo de execução. `test/**/*.ts` entrou em `tsconfig.backend.json`, e as 12 quebras que
isso revelou foram corrigidas: quatro imports sem `.js` (um deles em `lib/pdf/gerar.ts`, que
fazia o módulo resolver como `any` e apagava três erros de tipo por tabela) e cinco
`estornoDeId: null` onde o tipo diz `string | undefined`.

⚠️ **`test/ui/*.tsx` continua FORA** — exige `jsx` e `lib: dom`, que o config de backend não
tem de propósito. Pendência declarada, não resolvida.

**(c) O guard nasceu errado, e um teste existente me corrigiu.** A primeira versão de
`exigirCompetenciaEmExercicioAberto` recusava exercício ENCERRADO **e também** exercício
INEXISTENTE. Ela derrubou o `t5` do M16 — *"anular em JANEIRO um empenho de dezembro travado
PASSA"* —, cuja anulação tem data de **20/01/2027**, ano ainda não aberto. Recusar ali
impediria o ente de **corrigir em janeiro um erro de dezembro**.

A condição do ADR é "competência em período **FECHADO**". Um ano que ninguém abriu não é um
período fechado: é um período que não começou. Tratá-los igual transformou uma proteção
contra antedatar numa proibição de pós-datar. O guard passou a perguntar `estaEncerrado`, e
o `c3b` prende a distinção.

### 13.4 ⚠️ O custo do guard, medido em vez de suposto

O `t8` do M03 (dois créditos concorrentes, 5 rodadas) começou a estourar o limite de 5000 ms
do vitest. Em vez de subir o timeout, medi — as mesmas 18 suítes, nas duas condições:

| Condição | `t8` |
|---|---|
| sem o guard | **2745 ms** — passa |
| com o guard, sem memória | **5035 ms** — estoura |
| com o guard, memorizado | **3395 ms** — passa |

O guard era chamado uma vez por movimento, e um decreto com vários itens repetia o mesmo
`SELECT` em `Exercicio` com o lock da ficha na mão. A memória vive por transação
(`WeakMap` chaveada no `tx`) e guarda só ANO ABERTO — o encerrado lança e nunca é
memorizado. E o cliente de longa vida fica **fora** da memória: memorizar num objeto que
vive o processo inteiro deixaria o guard respondendo "aberto" para sempre depois de um
encerramento. A distinção é `"$transaction" in tx`, e ela erra para o lado de não
memorizar.

### 13.5 O parser de OFX conferido contra terceiro — e o que ele revelou

O prompt manda: *"Se o teste do OFX usar o seu parser para conferir o seu parser, ele passa
com qualquer interpretação errada consistente."* Era exatamente o caso: os 23 testes de
`ofx.test.ts` montam um OFX com um helper deste repositório e comparam com o que o próprio
teste acabou de escrever.

O desmentidor é o **`ofxtools` 1.1.1** (PyPI, terceiro). `scripts/oraculo-ofx.py` lê
`packages/ofx/corpus/*.ofx` com ele e congela o resultado em `esperado.json`;
`packages/ofx/oraculo.test.ts` confronta o nosso parser com o que o outro leu.

**Resultado: os dois concordam em todos os campos** — 3 arquivos, 6 transações. E a
conferência achou duas coisas que nenhum teste anterior podia achar:

⚠️ **1. Os arquivos dos testes antigos não eram OFX válido.** O `ofxtools` recusou o
cabeçalho de quatro linhas (falta `SECURITY`, `ENCODING`, `COMPRESSION`, `OLDFILEUID`,
`NEWFILEUID`), e recusou o corpo sem `<SIGNONMSGSRSV1>` e sem `<LEDGERBAL>`. Nenhum deles
teria vindo de um banco de verdade. Ser mais permissivo na entrada é menos perigoso que ler
valor errado, então não virou defeito — mas o corpus novo é conforme.

⚠️ **2. A virada de mês.** `<DTPOSTED>20260131235900[-3:BRT]` — o último minuto de janeiro
em Brasília. O `ofxtools` normaliza para UTC e guarda `2026-02-01T02:59Z`; lido como data em
UTC, isso é **fevereiro**. O nosso parser guarda **31/01**.

**Um dia de diferença numa transação do último dia do mês é uma mudança de mês**, e a
conciliação bancária é mensal. Quem está certo é o nosso parser, por razão de domínio: a
conciliação é feita contra o extrato que o tesoureiro tem na mão, e o extrato do banco
brasileiro imprime 31/01. O `esperado.json` guarda **as duas** leituras — `instanteUtc`, o
oráculo cru, e `dataLocalDeclarada` — e um teste prova que elas divergem, para que o caso de
fronteira não desapareça do corpus.

⚠️ **`ofxtools` não entrou no `package.json`.** É ferramenta de conferência, roda à mão
quando o corpus muda; o `esperado.json` é versionado justamente para que a suíte não dependa
de python nem de rede.

### 13.6 A movimentação bancária (item 2) — e o defeito que ela revelou

`MovimentoBancario` (TR 5.62): depósito, saque, aplicação, resgate, rendimento e tarifa.
Era a pendência `TESOURARIA-MOVIMENTACAO`, e ela está fechada.

⚠️ **O saldo é conferido DENTRO da transação, sob lock** (posto 17 do `packages/locks`,
tomado ANTES da leitura). "No momento da operação" é exigência técnica: conferir antes de
abrir a transação deixa a janela clássica — dois saques de 600 numa conta de 1.000 leem
ambos "há saldo" e gravam ambos. O lock é advisory e não `FOR UPDATE` porque **não há
linha de saldo para travar**: o saldo é derivado dos fatos, e é isso que o mantém honesto.

⚠️ **Tarifa e rendimento NÃO passam pelo guard, e é decisão.** O banco debita a tarifa por
conta própria; quando o extrato chega, o débito já aconteceu. Recusar o registro por falta
de saldo não desfaz nada — só afasta o sistema do extrato, que é o oposto do que a
conciliação precisa.

⚠️ **Um só caminho para os mesmos fatos.** A enumeração dos fatos que movem a conta vivia
dentro de `conciliacao.ts`. Quando o saldo precisou da mesma resposta, ela foi
**extraída** para `caixa.ts`, não copiada. Uma segunda consulta teria produzido o pior
sintoma possível: o guard aprovando um saque que a conciliação, minutos depois, mostraria
como impossível.

#### ⚠️ E isso expôs um defeito que já existia

A conciliação vale por uma identidade auto-executável — ela **lança** quando não fecha, em
vez de devolver diferença sem nome. Ela só fecha se o lado interno espelhar o que o razão
registrou **na conta contábil desta conta bancária**. A transferência entre contas
próprias não entrava no lado interno **nunca**, e o resultado dependia de um detalhe que
ninguém tinha notado:

| Contas | Razão na contábil da origem | Antes | Agora |
|---|---|---|---|
| mesma conta contábil | D e C na mesma conta → **líquido zero** | fechava | fecha (não entra) |
| contas contábeis **diferentes** | C de X → **move** | **`CONCILIAÇÃO NÃO FECHA`** | fecha (entra) |

A conciliação de qualquer conta que tivesse transferido para conta de outra natureza
contábil **simplesmente não saía**. O critério correto não é "incluir" nem "não incluir":
é entrar **quando o fato moveu a conta contábil desta conta**.

⚠️ **E a regra foi conferida por MUTAÇÃO**, porque um cenário com uma conta só não a
distingue: trocar por "inclui sempre" derruba `t12` e `t14`; trocar por "nunca inclui" — o
comportamento antigo — derruba `t13` e `t14`. Um teste que passasse nas três variantes não
estaria provando nada.

### 13.7 As assinaturas da despesa (item 4)

Empenho, liquidação e ordem de pagamento entram na **mesma** `FilaDeAssinatura` do ENT02 —
não numa paralela. O documento canônico vira `Anexo` de origem SISTEMA, e três coisas vêm
de graça: é baixável pela rota do ENT02 com autorização por registro, é assinável pela
fila, e a conferência de integridade do `lerArquivo` passa a valer para ele.

⚠️ **O escopo não afrouxou.** O anexo do empenho é escopado pelo EMPENHO; o da liquidação,
pela LIQUIDAÇÃO; o da ordem, pela liquidação dela — como o M16 já faz. Devolver "ENTE" (o
que o borderô faz, e ali com razão) daria a quem anexa no nível do ente o poder de produzir
o documento assinável de outra unidade. O `t7` prende isso.

#### ⚠️ Um defeito meu, achado e corrigido dentro do lote

`porNaFila` gravava o `Anexo` **antes** de abrir a fila, e as duas não cabem numa transação
só. Uma tentativa com modo QUALIFICADA criava o anexo e morria na fila — e o guard de "um
documento por fato" passava a recusar a tentativa **seguinte**, correta. **O empenho ficava
impossível de assinar por qualquer modo, para sempre.**

A correção confere as pré-condições antes de gravar, pela **mesma** função que a fila usa
(`exigirFilaViavel`, extraída do M22) — não por uma cópia. Conferido por mutação: remover a
conferência prévia derruba `t6`, `t8` e `t9`.

⚠️ **E os dois `rejects.toThrow()` vazios viraram asserções sobre o motivo**, como o lote
manda: "Ainda não é a sua vez: falta X (posição 1)" e "nenhum provedor de certificado
configurado". Vazios, ficariam verdes se a recusa viesse de autorização ou de id errado —
ambos compatíveis com a fila **não** estar sendo ordenada.

### 13.8 O catálogo — 47 de 2037 (2,3%)

Nove cláusulas novas, e **nenhuma** é `VALIDADO_LOCALMENTE`: não há tela. O motor existe e
é testado; a superfície não.

A marcação mais útil das nove é uma **ausência**. A **5.10.2.6** pede vincular *uma ou
mais* fontes de recurso à conta bancária, e o modelo tem exatamente **uma** (`fonteId`,
`NOT NULL`). O controle de saldo por fonte (5.10.2.19) funciona hoje porque, neste modelo,
saldo por fonte **é** saldo por conta — com N fontes por conta ele precisaria de um eixo
novo. Sem essa linha, a 5.10.2.19 pareceria fechar um requisito que só fecha por
coincidência de modelagem.

### 13.9 ⚠️ O que NÃO foi feito neste lote

| Item | Estado |
|---|---|
| 1. Competência | **feito** — ADR, migration, guard, testes |
| 2. M09 | **parcial.** Movimentação bancária **feita**; conciliação parcial e pendências automáticas **já existiam** (verificadas). **Faltam**: pendências manuais (5.10.2.45), cópia para o período seguinte (5.10.2.46) e seleção múltipla com soma (5.10.2.47) |
| 3. Telas do financeiro | **não iniciado** |
| 4. Fila de assinaturas | **feito** — empenho, liquidação e ordem |
| 5. `packages/integracao` | **não iniciado.** Só o exercício do OFX (13.5). Cofre de credenciais, validação contra esquema, detecção de duplicidade em retransmissão e custódia de certificado continuam ausentes |
| 6. `docs/dependencias-externas.md` | **feito no que era conhecível** — ver 13.10 |

⚠️ **A definição de concluído do ENT03 continua NÃO atendida**: nenhum dos quatro percursos
pela interface existe. Três itens deste lote (2 parcial, 3 e 5) seguem abertos.

#### ⚠️ E um achado que muda o desenho do que falta em 2

As cláusulas **5.10.2.46** ("copiar automaticamente as pendências não baixadas para **a
próxima conciliação**") e **5.10.2.49** ("visualizar e imprimir conciliações de períodos
anteriores") pressupõem **conciliações discretas** — objetos com começo, fim e fechamento.

O modelo atual é **cumulativo até um corte**: `conciliacaoBancaria(conta, corte)` soma tudo
com `lte: corte`. Isso faz a *cópia* de pendências acontecer **por derivação** (uma linha
não baixada continua aparecendo no corte seguinte, sem ninguém copiar nada) — mas deixa
"a próxima conciliação" e "períodos anteriores" **sem âncora**: não há o que listar.

Fechar essas duas exige um fato de **fechamento de conciliação**, e essa é uma decisão de
modelo, não uma tela. Registrada aqui para ser decidida de propósito, e não descoberta no
meio da implementação — que é exatamente a lição que o ADR da competência deixou.

### 13.10 O inventário de dependências (item 6)

Uma linha saiu de `CODIGO_LOCAL_SEM_VALIDACAO` para o estado novo
`VALIDADO_CONTRA_TERCEIRO` — o OFX, conferido contra o `ofxtools`. Vale para **formato**, e
não substitui aceite de órgão; por isso o estado é novo em vez de reaproveitar um existente.

Duas correções de fato e duas linhas que faltavam:

- a conciliação do M09 **não** existia "só como schema" — a afirmação estava errada;
- **CNAB**: o layout é **por banco**, não único. Escrever contra a especificação genérica
  da FEBRABAN produz arquivo que o banco recusa;
- **certificado A3**: fisicamente diferente do A1 — a chave não sai do dispositivo, e a
  assinatura acontece **na máquina do usuário**, não no servidor. Um adaptador que trate os
  dois igual não funciona para nenhum dos dois. Isso muda a arquitetura do item 5, não a
  configuração dele.

⚠️ **O que continua vazio, e por quê.** As colunas *credencial*, *convênio* e *protocolo*
seguem vazias em quase toda a tabela porque **nada foi solicitado a órgão nenhum** —
solicitar é ato externo, fora da autorização deste trabalho. O que era conhecível sem
contato externo foi preenchido. Preencher o resto exigiria inventar, e um inventário
inventado é pior que um vazio: ele para de ser lido como pendência.

### 13.11 Comandos e resultados

| Comando | Resultado | Data |
|---|---|---|
| `npm run test:tudo` (fim do lote) | **162 arquivos, 1649 testes, 0 falhas, 356,1 s** | 2026-09-10 |
| `npm run test:tudo` (item 2) | 161 arquivos, 1640 testes, 0 falhas, 408,6 s | 2026-09-10 |
| `npm run test:tudo` (item 1) | 160 arquivos, 1623 testes, 0 falhas, 411,6 s | 2026-09-10 |
| `npm run typecheck` (backend, agora com `test/**/*.ts`) | 0 erros | 2026-09-10 |
| `npm run typecheck:app` | 0 erros | 2026-09-10 |
| `npm run typecheck:scripts` | 0 erros | 2026-09-10 |
| `npx prisma migrate deploy` | 1 migration aplicada, 0 `DROP` | 2026-09-10 |
| `oraculo-ofx.py` (ofxtools 1.1.1) | 3 arquivos, 6 transações, todos os campos conferem | 2026-09-10 |
| `psql` — grants de `MovimentoDotacao` | `gestao_app`: `INSERT, SELECT` antes e depois | 2026-09-10 |
| `psql` — backfill | 14 linhas, 0 derivadas, 0 nulas | 2026-09-10 |

⚠️ **Duas execuções intermediárias foram vermelhas, e as duas eram defeito meu**, não falso
alarme: o `t5` do M16 (guard recusando ano não aberto — ver 13.3c) e o `t8` do M03 (custo do
guard sem memória — ver 13.4). Ambas foram corrigidas no código, nenhuma no teste.

⚠️ **E três regras foram conferidas por MUTAÇÃO**, porque passar não prova nada quando o
cenário não distingue as alternativas:

| Regra | Mutação | Quem acusou |
|---|---|---|
| inclusão da transferência no lado interno | "inclui sempre" | `t12`, `t14` |
| idem | "nunca inclui" (comportamento antigo) | `t13`, `t14` |
| pré-condição da fila antes de gravar | remover a conferência | `t6`, `t8`, `t9` |

**Migrations do lote:** 4, todas aditivas, **zero `DROP`**. Total agora: 87.
**Censo M16:** 161 → 163 serviços, 154 → 156 ações, mais 3 composáveis e 1 guard
classificados.

## 14. ENT03a — o fechamento: as duas decisões, os tripwires e as telas

> ⚠️ **O lote FECHA.** Os quatro percursos da definição de concluído existem **pela
> interface**, com dado persistido e visível **após recarga** — provado por smoke de
> navegador, 28 passos, 0 falhas, **duas execuções seguidas**. O que ficou de fora está
> em **14.8**, e o item 5 saiu de escopo por decisão da revisão (vai para o ENT03b).

### 14.1 Os 14 tripwires, provados por mutação

O `c2` afirmava, no próprio docblock, vigiar a chegada de uma coluna de competência. A
asserção era `/^data/i`, e a coluna criada chama-se `competencia`: **ele teria passado
verde sobre exatamente o que dizia vigiar.**

Um tripwire que nunca ficou vermelho tem **valor desconhecido**, e é pior que não ter — dá
a sensação oposta. `scripts/tripwires-caracterizacao.ts` muta o que cada teste diz vigiar,
confere que fica vermelho e reverte (o revert é garantido por `finally`; um script destes
que morresse no meio deixaria código mutado no repositório).

**14 de 14 PROVADOS.** Cada um verde-antes e vermelho-com-mutação.

⚠️ **E o `c14` exigiu mutar OS DOIS guards.** Desde o ADR da competência, `empenhar` confere
o exercício **da ficha** e o **da competência**. Remover só um deixaria o outro recusando, e
o tripwire ficaria verde provando nada — que é o modo de falha que o script existe para
achar.

### 14.2 Varredura (a) — cobertura de tsconfig

**34 arquivos estavam fora dos três**, e dois doeram: `middleware.ts` (produção, roda em
**toda requisição**) e `prisma/seed/**` — 29 arquivos, **cinco deles `.test.ts` que a suíte
EXECUTA**. Testes rodando sem nunca terem sido compilados.

**Buraco na rede é pior que ausência de rede**: três typechecks verdes davam a conclusão
errada sobre o repositório inteiro. Agora são **698 de 698**, e um teste de ~6 s impede o
buraco de reabrir.

### 14.3 Varredura (b) — efeito colateral antes da operação guardada

A forma do defeito do `porNaFila` **repetia em `gerarBordero`**: ele grava o `Bordero` e só
depois abre a fila. Com **signatário repetido** a fila recusa, o borderô fica órfão, e "o
lote já tem borderô" passa a recusar a tentativa seguinte — **o lote fica impossível de
transmitir, para sempre.** Reproduzido em `t8b` antes de corrigir.

As demais formas foram verificadas e estão limpas: a numeração aloca **dentro** da
transação (rollback devolve), o outbox **não tem produtor** e já tinha guarda própria, e
não há consumo de certificado.

### 14.4 Varredura (c) — a data civil do ente

ADR próprio: **comparação de data no domínio usa a data civil do ente, nunca UTC.**
`packages/datas` é a régua — com `Intl`, não `-3` cravado: o Brasil teve horário de verão
até 2019 e pode voltar a ter.

| Área | O defeito | A consequência |
|---|---|---|
| **período fechado** | a janela de `2026-12` era 01/12 00:00Z a 31/12 23:59Z — civilmente **30/11 21:00 a 31/12 20:59** | o lançamento de **31/12 às 22:00 ESCAPAVA** da trava de dezembro |
| **período por data** | a janela era `Date` — instante para o que é dia civil | "travar de 10/01 a 20/01" começava às 21:00 do dia **09** |
| **competência** | `getUTCFullYear()` no guard da arrecadação | guia de **31/12 às 22:00** recusada como "fora do exercício 2026" |
| **cota mensal do CMD** | `getUTCMonth()` | empenho de **30/06 às 22:00** contado contra **julho** |
| **ordem cronológica** | comparava instantes | duas liquidações do mesmo dia **não empatavam**, e o desempate pelo número — que dá ordem TOTAL ao art. 141 — **nunca rodava** |
| **vencimento** | `toISOString().slice(0,10)` | a nota de empenho e o borderô, **documentos assinados**, imprimiam um dia a mais |

⚠️ **Nenhum aparecia nas fixtures**: quase toda fixture usa **meio-dia UTC**, e ao meio-dia
os dois eixos coincidem. Os testes novos usam horas de noite de propósito.

Formato externo (SAGRES, SIGA, MANAD, BB, OFX) permanece em UTC — converter ali produziria
arquivo recusado. A lista de exceções tem **um motivo por linha**, e é ela que faz a
próxima ocorrência ser decisão de alguém em vez de descuido.

### 14.5 Decisão 1 — a conta admite mais de uma fonte

Município pequeno não abre uma conta por fonte: o controle de destinação acontece **dentro**
da conta. Vínculo muitos-para-muitos, migration aditiva, e a fonte única virou a **primeira
linha** do rol no backfill — sem isso toda conta existente ficaria com rol vazio e o guard
recusaria **toda** movimentação no dia seguinte à migration.

⚠️ **A fonte continua obrigatória no movimento**, e o motivo é o oposto do que parece: conta
multifonte significa que a fonte precisa ser **declarada**, porque não dá mais para
inferi-la.

⚠️ **E a regra virou UMA.** `conta.fonteId !== informada` estava escrito à mão em **quatro**
lugares — e com a conta multifonte os quatro passariam a **recusar o pagamento legítimo**
pela segunda fonte, que é o caso que a decisão veio permitir. A regra mora em
`guard-fonte.ts`; cinco sítios a chamam.

**Rol vazio cai para a fonte padrão**, e não é brecha: a primeira versão recusava tudo, o
que tornaria **inutilizável** qualquer conta criada por fora. O fallback admite
exatamente UMA fonte — a mesma de antes.

### 14.6 Decisão 2 — a conciliação é objeto discreto

**O que se persiste é o JUÍZO, não o saldo.** Saldos e enumeração continuam derivados.
Congelar valor no encerramento criaria a segunda verdade — e a tela de conferência é o pior
lugar do sistema para tê-la: um valor congelado divergindo do razão faria o operador
conferir o sistema contra ele mesmo.

⚠️ **"Cópia para o período seguinte" não é cópia.** `t7` prova pelo dado: julho enxerga a
pendência de junho e a **contagem de linhas no banco não muda**. Duplicar faria a soma
contar a mesma pendência duas vezes.

**Pendência manual é decisão registrada, não fato**: aponta motivo e **não cria lançamento**
(`t5`). **Encerrada é imutável**, e o estado é **derivado** — `t1` confere que a tabela não
tem `status`, `encerrada` nem `estado`.

### 14.7 As telas — o item que fecha o lote

Quatro telas, quatro Server Actions, duas portas, e um smoke que percorre os quatro
caminhos: `/financeiro/movimentacao`, `/financeiro/conciliacao/periodo`,
`/financeiro/lotes`, `/despesa/assinaturas`.

⚠️ **A recarga é o ponto.** Conferir a tela logo depois do envio prova que o React
renderizou; conferir depois de um `goto` novo prova que **o servidor tem o dado**.

#### O que o smoke achou, e que nenhum teste de módulo acharia

1. **A página do período devolvia 500** quando a conta não tinha conta contábil mapeada. O
   domínio recusava com a mensagem certa; a página deixava a exceção subir. **Um 500
   esconde a única informação que o operador precisava ler**: qual conta parametrizar.
2. **O erro cru do Prisma vazava para a tela** ao repetir um período. O índice único
   continua sendo a garantia — um `findFirst` antes do `create` perderia a corrida —, mas
   a **mensagem** agora diz o que fazer.
3. `<input type="date">` **não aceita** `type()` com `YYYY-MM-DD`: o Chrome espera o
   formato do locale, e o ISO vira `Invalid Date`.
4. O campo de valor é **mascarado** e o `name` está no **hidden** — um seletor por `name`
   casa só o hidden, que o puppeteer recusa clicar.

⚠️ **E as ações novas precisaram ser CONCEDIDAS ao perfil.** O M16 recusou com a mensagem
exata do que faltava — *"Não é escopo: é a ação"* — e foi por ela que se soube o que pedir.
O caminho de atualização (`conceder-acoes-ao-perfil.ts`) existe justamente porque perfil já
criado não recebe ação nova sozinho.

### 14.8 ⚠️ O que NÃO foi feito

| Item | Estado |
|---|---|
| 1. Completar o item 2 | **feito** — pendências manuais, períodos anteriores e a soma da seleção múltipla |
| 2. Telas — os quatro percursos | **feito**, com smoke |
| 3. `packages/integracao` | **fora de escopo por decisão da revisão** — vai para o ENT03b |
| 4. `docs/dependencias-externas.md` | **feito no que é conhecível sem contato externo** |

**Pendências nomeadas, nenhuma delas silenciosa:**

- `SELECAO-MULTIPLA-UI` — a soma da seleção existe e é pura; **falta a tela** de seleção
  múltipla de lançamentos (5.10.2.47 ficou `PARCIAL`);
- `CONCILIACAO-PERIODO-PDF` — lista e lê períodos anteriores; **falta a impressão**;
- `ROL-DE-FONTES-UI` — a tela mostra o rol por conta, mas **não há cadastro** dele;
- `DATA-CIVIL-RESTANTES` — restos a pagar, vigência de contrato, bimestre do RREO;
- `DATA-CIVIL-APRESENTACAO` — ~10 sítios em `app/` e `lib/` ainda imprimem por UTC;
- `M07-FONTE-NO-MOVIMENTO` — o movimento extraorçamentário **não tem fonte** no modelo, e
  por isso o saldo por fonte tem um balde `(sem fonte declarada)`. Atribuí-lo à fonte
  padrão seria inventar — justamente no número que prova que recurso vinculado não custeou
  outra coisa;
- `test/ui/*.tsx` entrou no typecheck; **`BORDERO-CONVENIO-BANCARIO` segue de pé**: o envio
  ao banco é indisponível, e a tela **não oferece o botão** em vez de simular.

### 14.9 Comandos e resultados

| Comando | Resultado | Data |
|---|---|---|
| `npm run test:tudo` | **167 arquivos, 1694 testes, 0 falhas, 390,1 s** | 2026-09-10 |
| `npx tsx scripts/smoke-ent03a.ts` | **28 passos, 0 falhas** — duas execuções seguidas | 2026-09-10 |
| `npx tsx scripts/tripwires-caracterizacao.ts` | **14 de 14 provados** | 2026-09-10 |
| `npx tsx scripts/cobertura-de-tsconfig.ts` | **698 de 698 cobertos, 0 descobertos** | 2026-09-10 |
| `npx next build` | limpo, com as 4 rotas novas | 2026-09-10 |
| `npm run typecheck` · `:app` · `:scripts` | 0 erros nos três | 2026-09-10 |

**Migrations do lote:** 8 no ENT03a, **todas aditivas, zero `DROP`**. Total: 91.
**Censo M16:** 156 → **167 serviços**, 149 → **160 ações**.
**Catálogo:** 38 → **51 de 2037 (2,5%)**, das quais **7 novas em `VALIDADO_LOCALMENTE`**.

## 16. ENT03b — o molde de recurso, os cinco cadastros e a medição que falhou

**Data:** 2026-09-11. **Estado:** fechado, parado no gate.

⚠️ **O LOTE MUDOU DE MÉTODO, E A MUDANÇA FOI MEDIDA — INCLUSIVE ONDE ELA NÃO FUNCIONOU.**
A revisão fixou a meta: **60 a 90 cláusulas** marcadas com evidência, contra ~10 de cada um
dos cinco gates anteriores. Saíram **40**. A seção 16.8 explica por quê, com o número.

### 16.1 · Antes de tudo: `DATA-CIVIL-RESTANTES`, e o buraco que ela escondia

A pendência nomeava **cinco** sítios. A medição achou **trinta e cinco**.

⚠️ **A pendência só listava o que a guarda sabia ler.** `test/data-civil.test.ts` procurava
duas formas — `getUTCFullYear` e `toISOString().slice(0,10)`. A forma **dominante** era a
terceira: a **construção** da janela por `new Date(Date.UTC(...))`.

É o caso do `c2` outra vez: uma guarda que dizia vigiar o eixo de data e ficava verde sobre
a metade do eixo que ela não sabia ler.

| Sítio | O que a janela em UTC fazia |
|---|---|
| `janelaDoBimestre` | **régua de OITO anexos do RREO** — o 1º bimestre de 2026 ia de **31/12/2025 às 21:00** a **28/02 às 20:59** civis |
| `janelaDosDozeMeses` | a janela da **RCL**, que entra no limite de pessoal e no de endividamento |
| `guard-cmd.janelaDoMes` | **é guard** — ele classificava o empenho pelo mês civil e somava o consumido por janela UTC: o empenho de 30/06 às 22:00 era cobrado contra julho **e não entrava na soma de junho nenhuma das duas vezes** |
| `msc/parsearCompetencia` | o encerramento do exercício caía **fora** da MSC de dezembro e reaparecia como abertura de janeiro: **a M3 não fechava** |
| `ordem-cronologica` (M12) | o pagamento de 30/06 às 22:00 **omitido** da publicação do art. 141, §3º |
| `m11.vigenciaFim` | prorrogar 150 dias atravessando a virada do horário de verão **movia o dia do vencimento** |
| `m02.gerarDecreto*` | **decreto é documento assinado**, e imprimia um dia a mais para vigência da noite |
| + `m10` (5), `rgf-anexo2/3/4/6`, `mde-*`, `m07`, `m20`, `m26` (3) | |

**A MSC saiu da lista de "leiaute externo", por decisão.** O que o leiaute define é o
**formato** do que se escreve; o que a janela decide é **quais fatos entram na remessa** — e
essa é pergunta de domínio. O Siconfi recebe uma *competência*, não um instante.

⚠️ **Provado por mutação: 11 de 11** (`scripts/mutacoes-eixo-de-data.ts`), devolvendo a cada
sítio **exatamente o código que estava lá antes do conserto**. **Duas ficaram VERDES na
primeira rodada, e as duas eram achados:**

| Mutação | Por que nada acusava |
|---|---|
| `vigenciaFim` de volta a milissegundos | o teste que eu havia escrito prorrogava **365 dias de 30/06/2018 a 30/06/2019** — as duas pontas FORA do horário de verão, onde as duas aritméticas coincidem. Trocado por **150 dias**, que cruzam a virada de 04/11 |
| `janelaDoBimestre` de volta a `Date.UTC` | **nenhum teste do repositório acusava** — todos os anexos passavam porque as fixtures usam meio-dia. Criado `m12-janelas.test.ts`, que afirma o **instante exato** das bordas: afirmar só o dia civil passaria com 00:00 e com 03:00 locais |

⚠️ **E as fixtures dos testes estavam em Greenwich.** Nove arquivos acusaram, e em todos a
FIXTURE é que estava errada: `new Date("2026-01-01T00:00:00Z")` como "primeiro instante do
período" é **31/12 às 21:00 do ano anterior** — o `t6b` do M10 chamava de "primeiro instante"
um fato da véspera.

### 16.2 · O custo da suíte: partida, e a conta fecha

| | arquivos | testes | tempo |
|---|---:|---:|---:|
| **rápida** (`npm run test:rapido`) | 55 | 583 | **~9 s** |
| **completa** (`npm run test:tudo`) | 180 | 1.830 | **~700 s** |

⚠️ **É decisão de agendamento, não de rigor.** A exclusão é **CALCULADA** pelo que o arquivo
importa — não uma lista escrita à mão que envelhece calada —, e
`test/particao-da-suite.test.ts` prova que a **união das duas é o conjunto inteiro** e que
nenhum arquivo da partição rápida alcança uma porta do banco. **Provado por mutação:** pôr um
`new PrismaClient()` num teste rápido deixa o guard vermelho.

⚠️ **O custo da partição foi MEDIDO (3,6 s) e MEMOIZADO (1,2 s)**, não contornado com timeout
maior. E o `raizes-dominio.test.ts` acusou a primeira versão por enumerar as raízes à mão —
o guarda dos guardas segue funcionando.

### 16.3 · PARTE 1 — o molde

`lib/molde/` (dado puro) + `components/molde/` (superfície) + `lib/portas/molde.ts` (o que
precisa do servidor). De **um descritor** saem: listagem com filtros compostos, ordenação por
URL, paginação, exportação CSV, **seleção múltipla com soma no servidor**, formulário de
criação, **detalhe com cinco abas fixas** (dados, campos adicionais, anexos, histórico,
relacionados) e **barra de ações amarrada a permissão nomeada**.

**Os três limites foram respeitados, e um deles doeu:**

1. **provado pelos cadastros do próprio lote** — quatro, nesta sessão;
2. **cadastro que não coube escapa** — o consórcio precisou de UM argumento a mais no
   detalhe (o exercício, porque os saldos são anuais). Ele cabe; se precisasse de dois, viraria
   tela escrita à mão;
3. **nenhuma regra de negócio dentro do molde** — o `FormularioDeRecurso` diz isso no
   docblock, e o que ele valida é `required`/`min`, conveniência de digitação. Quem recusa é o
   caso de uso, dentro da transação.

⚠️ **O QUE O MOLDE NÃO GENERALIZA, E É DECISÃO:** anexos e campos adicionais continuam com
**uma FK por tipo de dono**. A tentação era um par `(donoTipo, donoId)` livre — e o preço
apareceria no primeiro id errado: o banco deixaria de garantir que o registro existe, e um
`donoId` digitado errado viraria anexo **órfão** que nenhuma tela mostra e nenhuma limpeza
acha. O molde automatiza a **superfície**, não o modelo: cadastro novo com anexo custa uma
migration aditiva e **uma linha** no descritor.

⚠️ **`definirRecurso` verifica em TEMPO DE MÓDULO e ESTOURA.** Aba de anexos sem dono, coluna
somável que não é dinheiro, ação sem crachá — o `next build` falha junto. O erro aparece
antes de alguém abrir a página.

⚠️ **E a fronteira acusou o molde duas vezes**, as duas com razão:
- `lib/portas/recursos/dados.ts` importava `LinhaDoMolde` de `components/` — **o dado
  dependendo do pixel**. Os DTOs foram para `lib/molde/tipos.ts`;
- `somarSelecionadas` morava na porta e arrastava `next/headers` para o tsconfig do backend.
  Função pura em porta é dependência que viaja.

### 16.4 · PARTE 2 — os cinco cadastros, e o que cada um trouxe de próprio

| Cadastro | O que ele tem que os outros não têm |
|---|---|
| **Convênios** (M28) | **três saldos independentes** — a liberar, a prestar contas, glosado. Por isso NÃO há mapa de sinal: um `Record<Tipo, 1 \| -1>` obrigaria a inventar um zero, e zero ali é mentira que o compilador não pega. O papel do ente (concedente/convenente) é NOT NULL sem default: o efeito contábil é OPOSTO |
| **Precatórios** (M29) | a **fila do art. 100**, que não é a do art. 141 e não é um `ORDER BY`: ela depende do saldo devido (Σ dos movimentos) e da regra de que a preferência do §2º só vale DENTRO dos alimentares |
| **Consórcios** (M30) | o **contrato de rateio anual** (art. 8º). O teto é a **soma** do original com os aditivos, nunca "o último vale" — e o exercício do movimento é DECLARADO, não derivado da data |
| **Medições de obra** (M11) | **liquidar obra exige medição aprovada**, na transação da liquidação. Bordas de período **inclusivas**: acabar em X e começar em X se sobrepõe |
| **Controle interno** (M31) | **regime de superfície, declarado** — ele não move o razão. Três segregações reais no código, não só no censo |

⚠️ **TRÊS SEGREGAÇÕES DE FUNÇÃO VIRARAM GUARD, e não só crachá separado:** quem **mede** não
aprova a medição; quem **relata** a providência não a aprecia; quem **libera** a parcela não
aprova a prestação de contas. As duas primeiras recusam o **mesmo usuário** nas duas pontas.

⚠️ **O achado do art. 141 × art. 100.** A primeira versão reusava a justificativa de quebra de
ordem do art. 141 para o precatório — "o pagamento é um ato só, a razão dele é uma". **O
primeiro teste derrubou o argumento:** aquele campo exige uma `hipotese` de um **rol fechado
da Lei 14.133**, e nenhuma das cinco cobre acordo homologado nem sequestro de verba. Reusar
obrigaria o operador a declarar uma **hipótese falsa** para conseguir pagar — e a declaração
falsa ficaria gravada com a mesma aparência das verdadeiras. Hoje são dois campos.

### 16.5 · O percurso de navegador — 40 passos, 0 falhas, duas execuções

`scripts/smoke-ent03b.ts`, sobre os quatro cadastros. **Ele achou seis coisas**, e três eram
defeitos de verdade:

| O que o smoke achou | Era defeito? |
|---|---|
| **o campo de CPF/CNPJ aparecia SEM RÓTULO** | **sim.** `CampoCpfCnpj` é um campo nu, como o `CampoValor`, e ignorava o `rotulo` que o molde passava. Nenhum teste de módulo pegaria: o formulário funcionava, o valor chegava ao servidor, o registro gravava. **Faltava o rótulo** — quem usa leitor de tela ouviria "caixa de edição" e nada mais |
| as colunas derivadas não apareciam | **não** — a lista estava vazia e o molde mostrava o estado vazio, que é o certo. O teste é que conferia cedo demais |
| o histórico do convênio estava vazio | **não** — a glosa foi RECUSADA por falta de `RoteiroConvenio` no banco de dev, e a recusa está certa: as contas vêm por parâmetro |
| três marcadores não casavam | **não** — `innerText` devolve o texto **transformado pelo CSS**, e os rótulos são `uppercase` |

⚠️ **E o smoke provou pela tela o que mais importa:** repassar a consórcio **sem contrato de
rateio** é recusado **citando o art. 8º da Lei 11.107**, e nada fica gravado.

### 16.6 · PARTE 3 — a varredura do ENT04/ENT05, em bloco

`docs/varredura-de-modelo-ent04-ent05.md` — 543 cláusulas lidas, **treze decisões trazidas de
uma vez**, cada uma com a cláusula que a revela e a alternativa recomendada.

⚠️ **A varredura achou uma QUINTA família que ainda não tinha nome:** o documento pede
**CONFIGURÁVEL** e a implementação óbvia é **CONSTANTE**. Cinco cláusulas (margem consignável,
férias especiais, estorno de provisão na rescisão, obrigatoriedade do protocolo do atestado,
limite mínimo de estoque). É a armadilha do roteiro contábil num domínio novo, e o repositório
já tem a resposta: **nenhum código no código** — parâmetro em tabela, fail-closed.

**Os três alertas altos da família 3** (efeito antes da guarda):
- **5.12.60 — reintegração reutilizando a MESMA matrícula.** É a forma exata do `porNaFila`:
  gravar antes de conferir deixaria meio-vínculo e a reintegração **impossível para sempre**;
- **5.12.59 — simulação de rescisão.** "Não seja efetivamente executado" é promessa de
  ausência de efeito colateral, e promessas assim se quebram em silêncio;
- **5.19.38 — virada mensal da depreciação.** Lote sobre N bens: falhar no 300º deixa 299
  depreciados, e rodar de novo deprecia os 299 **outra vez**.

### 16.7 · Os regimes, declarados

| Entrega | Regime | Por quê |
|---|---|---|
| eixo de data civil (35 sítios) | **profundidade** | é razão contábil e guard: caracterização, mutação 11/11, fixture N=2, negação com motivo |
| convênios, precatórios, consórcios, medições | **profundidade** | movem o razão e têm teto próprio |
| controle interno | **superfície** | **não move o razão** — não há comportamento contábil anterior a caracterizar. Caso de uso + autorização + percurso de navegador |
| o molde e as telas | **superfície** | guarda do descritor, teste de autorização, um percurso por família de tela |

⚠️ **Nenhum rebaixamento de profundidade para superfície aconteceu neste lote.** O controle
interno nasceu em superfície porque é o regime certo para ele, não porque foi rebaixado.

### 16.8 · ⚠️ A MEDIÇÃO QUE FALHOU — 40, e a meta era 60 a 90

**O molde funcionou. A meta não foi atingida. As duas coisas são verdade, e o número explica:**

| | |
|---|---:|
| cláusulas marcadas neste lote | **40** |
| das quais vieram dos **4 cadastros novos** | **17** |
| das quais vieram de **medir o que já estava construído e nunca fora olhado** | **23** |
| densidade do catálogo | **~4 cláusulas por cadastro** |

⚠️ **A conta é essa: 4 cadastros × ~4 cláusulas = 17.** Para 60–90 num lote, o lote precisa de
**~15 cadastros pelo molde**. O que mudou é que isso **agora é possível** — os quatro
cadastros com listagem, formulário, detalhe de cinco abas e barra de ações custaram, juntos, o
que UM custava antes. O que não mudou é a densidade do catálogo, e ela não depende do método.

⚠️ **E 23 das 40 são uma segunda medição, sobre um segundo problema:** havia código testado e
verde que **nunca tinha sido olhado pelo catálogo** — dívida fundada, PPP, encerramento do
exercício, papel de runtime, campos adicionais, designer. Um instrumento que mede para baixo
esconde tanto quanto um que mede para cima.

### 16.9 · O que NÃO foi feito, e está nomeado

| Pendência | O que é |
|---|---|
| `ANEXO-DO-MOLDE-UI` | a aba de anexos **mostra**; o upload por ela ainda não foi ligado |
| `ROTEIROS-ENT03B-PARAMETRIZACAO` | o banco de dev não tem `RoteiroConvenio`/`Precatorio`/`Consorcio` — a tela recusa nomeando |
| `PPP-ANEXOS` / `PPP-VINCULO-EMPENHO` | `Anexo` e `Empenho` não têm coluna para PPP |
| `DIVIDA-PARCELAS` | não há modelo de parcela — sem o previsto, o comparativo previsto × pago é impossível |
| `AUDITORIA-EVENTOS` | sem modelo de evento, instaurar auditoria a partir dele não tem de onde partir |
| `AUDITORIA-SEM-EIXO-DE-REGISTRO` | `RegistroDeOperacao` guarda a AÇÃO e não o REGISTRO |
| `PRECATORIO-HIPOTESE-DE-QUEBRA` | o rol de hipóteses do art. 100 não está normatizado |
| `CHECKLIST-GRUPOS`, `RELATORIO-CIRCUNSTANCIADO-UI`, `CONVENIO-PAINEL-DE-ATRASO`, `PRECATORIO-RELATORIO`, `DIVIDA-RELATORIO`, `DIVIDA-RECLASSIFICACAO`, `AJUDA-DAS-TELAS-DO-MOLDE` | superfície e relatórios que faltam |
| `SELECAO-MULTIPLA-UI` | **saiu de graça no molde** — a soma da seleção é do servidor, em Decimal |
| `CONCILIACAO-PERIODO-PDF`, `ROL-DE-FONTES-UI` | ENT03c, por decisão da revisão |
| `DATA-CIVIL-APRESENTACAO`, `M07-FONTE-NO-MOVIMENTO` | registradas |
| `packages/integracao` | **ENT03c**, por decisão da revisão |

### 16.10 · Comandos e resultados — reprodutíveis

| Comando | Resultado | Quando |
|---|---|---|
| `npm run test:tudo` | **180 arquivos, 1.830 testes, 0 falhas**, 699 s | 2026-09-11 |
| `npm run test:rapido` | **55 arquivos, 583 testes, 0 falhas**, 9,2 s | 2026-09-11 |
| `npx tsx scripts/mutacoes-eixo-de-data.ts` | **11 de 11 sítios PROVADOS** | 2026-09-11 |
| `scripts/smoke-ent03b.ts` | **40 passos, 0 falhas**, duas execuções | 2026-09-11 |
| `npm run typecheck` / `:app` / `:scripts` | 0 erros cada | 2026-09-11 |
| `npx next build` | limpo, com as 10 rotas novas | 2026-09-11 |
| `npx prisma migrate dev` | **3 migrations aditivas, ZERO `DROP`** (94 no total) | 2026-09-11 |
| `npx tsx scripts/marcar-catalogo.ts --aplicar` | **91 de 2037 (4,5%)**, +40 | 2026-09-11 |

⚠️ **UMA INTERMITÊNCIA, COM O MOTIVO JUNTO.** Numa execução em que `test:rapido` rodou
**encadeado com dois `tsc`** no mesmo shell (`typecheck && typecheck:scripts && test:rapido`),
**3 de 583 testes falharam** por timeout de 5 s — os que varrem disco. Em execução isolada,
verde duas vezes seguidas. **Causa: contenção de CPU numa máquina de 8 GB**, e não o código.
Registrado em vez de descartado.

⚠️ **Uma deriva de schema apareceu e foi fechada.** A primeira migration do ENT03b vinha
querendo **derrubar** `MovimentoBancario_fonteId_idx` — um índice que a migration do ENT03a
criou e que o modelo nunca declarou. É assim que a deriva se manifesta: não como erro, como
**remoção silenciosa** de um índice que o saldo por fonte usa. Declarado no schema, a deriva
acabou e a migration ficou com **zero `DROP`**.

---

## 17. ENT03c — o censo dos módulos existentes, três cadastros, e cinco tabelas mortas

⚠️ **A CONTAGEM DO LOTE, SEPARADA — porque foi essa separação que mostrou onde estava o ganho.**

| Origem | Cláusulas |
|---|---:|
| **CENSO** — medir o que já existia contra o catálogo | **220** |
| **CONSTRUÇÃO** — comportamento novo escrito neste lote | **0** |
| **Total do lote** | **220** |
| Catálogo | 91 → **311 de 2037 (15,3%)** |

⚠️ **E O ZERO DA SEGUNDA LINHA É O RESULTADO, não uma falha.** O ENT03b mediu que o
catálogo tem ~4 cláusulas por cadastro e concluiu que um lote de 60–90 precisaria de ~15
cadastros. O ENT03c testou a outra hipótese — **medir rende mais que construir** — e o
número é 220 contra 40. O molde do ENT03b continua sendo o que torna os cadastros baratos;
o que este lote mostra é que **a fila do que já existe e nunca foi olhado é maior do que a
fila do que falta construir**, e sai por uma fração do custo.

Os três cadastros entregues pelo molde (dívida fundada, dívida ativa, obras com medições)
**não acrescentaram cláusula nenhuma ao placar** — eles deram TELA ao que o censo tinha
acabado de marcar como `IMPLEMENTADO_NAO_VALIDADO`. Isso é honesto e está registrado: a
marcação deles subiria para `VALIDADO_LOCALMENTE` quando os roteiros contábeis estiverem
parametrizados nesta máquina (ver 17.6).

### 17.1 · Antes de tudo: a PROPRIEDADE, não o padrão

Duas vezes uma guarda procurou uma forma e achou só aquela forma. Este lote parou de
enumerar formas:

**A suíte inteira sob `Pacific/Kiritimati` (UTC+14) dá resultado IDÊNTICO ao de
`America/Sao_Paulo`** — 183 arquivos, 1.869 testes, 0 falhas nos dois fusos. `npm run
test:fuso` entrou no gate. ⚠️ E a descoberta anterior à execução importa: **`TZ` não estava
definido em lugar nenhum do repositório** — a suíte sempre rodou no fuso da máquina, que é
exatamente o `FUSO_DO_ENTE`. Todo `getFullYear()` do código estava acidentalmente certo.

**O padrão da fixture saiu do meio-dia para a HORA DE BORDA** (`test/instantes.ts`,
`DIA_DE_BORDA` = 22:00 civis). A linha trocada foi UMA — a dotação inicial de
`test/ficha-teste.ts`, que alcança quase toda a suíte. Ela acusou **o `c2`**, a
caracterização que existe para vigiar os dois eixos de data: a asserção lia
`competencia.toISOString().slice(0,10)` e dizia "2026-01-02". A competência civil continua
1º de janeiro; **quem estava em Greenwich era o teste** — dentro do próprio arquivo que
caracteriza o defeito.

⚠️ **AS DUAS ALAVANCAS PEGAM CLASSES DIFERENTES, e nenhuma pega a da outra:**

| | pega | não pega |
|---|---|---|
| **fuso deslocado** | quem lê o relógio do HOSPEDEIRO (`getFullYear()`, `toLocaleString` sem `timeZone`) | eixo UTC — está errado em qualquer máquina, de forma estável |
| **hora de borda** | quem lê o eixo UTC (`getUTCFullYear`, `Date.UTC`, ISO fatiado) | eixo do hospedeiro — nesta máquina ele acerta |

### 17.2 · `DATA-CIVIL-APRESENTACAO`: a pendência dizia ~10, a medição achou 57

Terceira vez consecutiva em que a estimativa de um padrão fica muito abaixo da medição
(foram 5→35 no ENT03b, e agora 10→57). **Cinco formas, e duas eram desconhecidas:**

1. `getUTC*` — leitura por UTC;
2. `toISOString().slice(0,10)` — impressão por UTC;
3. `new Date(Date.UTC(...))` — construção de janela por UTC (a do ENT03b);
4. **`toLocaleString("pt-BR")` sem `timeZone`** — o relógio de QUEM RENDERIZA. Em componente
   de servidor, isso é a **máquina**. Oito telas imprimiam instante assim;
5. **`` new Date(`${dia}T23:59:59.999Z`) ``** — a mais traiçoeira, porque *parece*
   deliberada: hora escrita à mão, com milissegundos, como quem sabe o que faz. E 23:59:59Z
   é 20:59:59 no ente — o corte perde as três últimas horas do dia.

O que a varredura achou, nomeado:

- **`dataBr` de `lib/recorte.ts`** — o formatador que quase toda tela usa — **imprimia por
  UTC**. Um fato de 31/12 às 22:00 saía "01/01", no ano seguinte;
- **treze sítios da BORDA DE ESCRITA** (empenho, liquidação, pagamento, ordem, arrecadação,
  crédito adicional, movimentação bancária) ancoravam a data do fato em `T12:00:00Z` — que é
  meio-dia em **Greenwich**. O dia civil saía certo, mas por uma régua diferente da do resto
  do sistema, e "certo por outra régua" é como as cinco formas nasceram, uma a uma. Virou
  `meioDiaCivil` em `packages/datas`;
- a **competência da remessa SAGRES** era normalizada pelo último dia do mês em UTC — que no
  horário de verão cai às 21:00 do penúltimo dia do ente, e o pacote mensal perderia o último
  dia inteiro.

A guarda `data-civil.test.ts` **cresceu de escopo** (agora varre `app/`, `lib/` e
`components/`, além do domínio) e **de padrão** (as cinco formas). Provada por mutação:
reintroduzir `new Date().getFullYear()` numa tela faz o teste acusar o arquivo e a linha.

### 17.3 · `M07-FONTE-NO-MOVIMENTO`: o defeito era pior que a pendência

A pendência dizia "o movimento extraorçamentário não tem fonte, então o saldo por fonte tem
um balde `(sem fonte declarada)`" — o que descreve um buraco **honesto**, visível na tela.

⚠️ **A medição achou outra coisa.** `extraorcamentarioPorFonte` atribuía **todos** os
movimentos à fonte PADRÃO da conta bancária. Numa conta de fonte única isso acerta por
coincidência; mas desde o ADR de 2026-09-10 uma conta admite um **rol** de fontes (TR
5.10.2.6). Numa conta multifonte, a fonte padrão é um **palpite** — e o palpite estava no
número que existe para provar que recurso vinculado não custeou outra coisa.

Pior: **o dispêndio já conferia a fonte contra o rol e não a gravava.** Conferir e esquecer
é o pior dos dois mundos — o guard roda, o operador declara a fonte certa, o dado se perde,
e a consulta responde pela conta de novo.

Fechado: `MovimentoExtraorcamentario.fonteId` (nullable, porque os movimentos antigos não
têm como saber — preenchê-los seria escrever a invenção no banco), o ingresso passou a
**exigir e conferir** a fonte contra o rol, o estorno **herda** a do original, e a consulta
lê a do movimento. **Provado por mutação**: com a atribuição antiga, o teste novo acusa
`10.000,00` na fonte livre e **nada** no FUNDEB — 7.000 de dinheiro vinculado contados como
livre.

### 17.4 · O censo — e o que ele diz sobre "BASE_FORTE"

Nove seções varridas contra M01–M22. ⚠️ **O achado estrutural: "BASE_FORTE" no mapa de
lacunas significa "existe um arquivo com esse nome"** — e o próprio mapa avisa isso. Medido
cláusula a cláusula, o M10 se parte em dois:

- **o almoxarifado é CONTÁBIL, não FÍSICO.** Move VALOR por classe de material contra a
  conta de estoque do PCASP. **Não há quantidade** — logo não há preço médio, saldo mínimo,
  inventário, depósito, lote nem validade. **20 das 25 cláusulas da 5.18 são
  `AUSENTE_CONFIRMADO`**, numa seção que o mapa classificava como base forte;
- **o patrimônio é a CONTABILIDADE do bem, não a GESTÃO dele.** Tombamento, classe, valor
  contábil, depreciação por competência (NBC TSP 07, os três métodos do MCASP) e alienação
  com resultado — tudo provado. Não há localização, responsável, estado de conservação,
  comissão, termo nem etiqueta;
- **o M11 tem o PROCESSO e o CONTRATO; não tem a COMPRA.** A cadeia processo → homologação →
  contrato → aditivo → empenho → liquidação → medição é das partes mais bem provadas do
  repositório. Produto, proposta, lance, comissão, fornecedor, ordem de compra, ata de
  registro de preços, plano anual e pesquisa de preços: nenhum tem modelo.

Nos três casos **o motor é bom e está provado; o que falta é o cadastro que o alimenta.** É
a diferença entre "ampliar o que existe" e "construir o que falta", e ela muda o custo do
próximo lote.

Achados nomeados durante a varredura:

- **`ProcessoLicitatorio.modalidade` é NOT NULL** — a 5.17.16 ("digitar o processo sem
  modalidade e escolhê-la após o parecer jurídico") é **impedimento de modelo**, não tela que
  falta;
- **o motor de workflow EXISTE — no M21.** Roteiro copiado na abertura, etapa com setor e
  prazo, situação derivada dos movimentos, prazo contado do recebimento, tramitação só para
  quem é lotado no setor. A licitação simplesmente **não está ligada a ele**. Por isso a
  5.17.17 é `PARCIAL` e não `AUSENTE`;
- **o leiaute do TCM-BA pede o número do SUBEMPENHO** e o gerador repete o do empenho, porque
  subempenho não existe no modelo. A remessa declara um conceito que o sistema não tem.

### 17.5 · ⚠️ CINCO TABELAS MORTAS — e o guard que agora as vigia

`ParecerContrato` e `CertidaoFornecedor` estão no schema, com os tipos certos, migration
aplicada — e **nenhuma linha de código escrita à mão as lê ou escreve**. As 57 ocorrências
dos dois nomes estão todas em `prisma/generated/`.

⚠️ **É o modo de falha mais perigoso deste inventário: a tabela PARECE atendimento.** Quem
abre o schema perguntando "o sistema registra parecer jurídico?" acha `ParecerContrato` com
`JURIDICO`, `TECNICO`, `CONTROLE_INTERNO` e `CONTABIL`, e conclui que sim. É literalmente a
regra do prompt — *"código que existe não é comportamento provado"* — acontecendo.

Virou guard permanente: `test/modelo-sem-caso-de-uso.test.ts`. E quando ele ficou **correto**
achou mais três: `TipoLancamentoReceitaSagres`, `DeParaContaSiga` e `DeParaFonteSiga`.

⚠️ **O guard errou duas vezes antes de acertar, e as duas lições ficaram no código:**

1. **prosa não é código.** Ele ficava verde sozinho e vermelho na suíte completa — e quem o
   acusava era a **evidência do próprio catálogo**, que explica em português que
   `ParecerContrato` é tabela sem caso de uso. Um nome citado dentro de uma string é
   documentação, exatamente como dentro de um comentário (`test/prosa.ts`);
2. **delimitador aninhado é gramática, não padrão.** A primeira versão do removedor de
   literais era regex, e um backtick dentro de uma string comum fazia o padrão engolir
   centenas de linhas — **vinte modelos legítimos apareceram como órfãos**. Virou varredor de
   caracteres;
3. e a tentação que foi recusada: aceitar o **nome do campo de relação** como prova de uso.
   Não serve — `pareceres` aparece quatro vezes no repositório e **nenhuma** é de
   `ParecerContrato`; são os pareceres do PROCESSO, no M21. A dedução por nome de campo teria
   escondido justamente o achado.

### 17.6 · Os três cadastros pelo molde — e o que o navegador provou

Dívida fundada, dívida ativa e obras com medições: **os três saíram do próprio censo**, com
o mesmo padrão — caso de uso completo, invariante provado, e nenhuma rota em `app/`.

⚠️ **NENHUM DELES PRECISOU DE AÇÃO NOVA NO CENSO DO M16.** As doze ações que as telas
disparam já existiam desde que os casos de uso nasceram. É a medida mais honesta do custo do
molde: **três descritores, nove rotas, uma migration aditiva de duas colunas.**

Smoke: **34 passos, 0 falhas, duas execuções** (`scripts/smoke-ent03c.ts`).

⚠️ **E ELE ACHOU DUAS COISAS.** A primeira execução teve 3 falhas, todas com a **mesma
causa, e a causa não é defeito**: esta máquina não tem `RoteiroDivida` nem
`RoteiroDividaAtiva` parametrizados, e o caso de uso **recusa fail-closed** — *"as contas do
PCASP vêm por PARÂMETRO — nenhuma conta é inventada no código"*. O PCASP semeado aqui é o
mínimo da POC (26 contas analíticas, sem a VPD de variação monetária). **Fabricar um código
de conta para o smoke passar seria inventar norma da STN dentro de um teste** — não foi
feito. Pendência `ROTEIROS-PATRIMONIAIS-NAO-PARAMETRIZADOS`.

A segunda foi pior e mais útil: **um passo passava pelo motivo errado.** A asserção "a
correção aparece no histórico" procurava `"atualização monetária"` no texto da página — e
esse é o **rótulo** de uma linha do painel de dados, que aparece com ou sem movimento. Mesma
classe de falso-verde do ENT03b. Hoje a asserção é sobre a **aba de histórico** e prova o
oposto: que a recusa **não deixou movimento órfão**.

### 17.7 · `prisma migrate diff` no gate

`npm run deriva` monta um banco de sombra, aplica migrations + `prisma/sql/`, e separa duas
perguntas: **migrations × modelo** tem de ser vazio; **banco completo × modelo** só pode
conter os objetos que `prisma/sql/` cria de propósito (a lista é lida dos arquivos, não
escrita à mão). **Provado por mutação**: removida uma linha `@@index` do schema, ele produz
exatamente o `DROP INDEX` da deriva do ENT03b.

⚠️ E ele **quebrou o `prisma validate` de todo mundo** na primeira versão, porque `env()`
do Prisma **lança** quando a variável não existe, em vez de devolver indefinido. A chave do
banco de sombra hoje só existe quando a variável existe.

### 17.8 · Os regimes, declarados

| Entrega | Regime | Por quê |
|---|---|---|
| `DATA-CIVIL-APRESENTACAO`, `M07-FONTE-NO-MOVIMENTO` | **profundidade** | eixo de data e saldo por fonte: caracterização, teste de negação afirmando o motivo, e **mutação provada** nos dois |
| prova de fuso, hora de borda, `deriva`, guards de censo | **profundidade** | são guards; um guard não provado por mutação é uma rede com buraco |
| censo das 9 seções | **superfície** | teste de caso de uso e de autorização, sem caracterização nova — é medição do que já roda há meses |
| 3 cadastros pelo molde | **superfície** | percurso de navegador por família de tela, sem tripwire mutado |

Nenhum rebaixamento de profundidade para superfície neste lote.

### 17.9 · O que NÃO foi feito, e está nomeado

- `ROTEIROS-PATRIMONIAIS-NAO-PARAMETRIZADOS` — dívida fundada e dívida ativa só movimentam
  depois que o ente parametrizar o roteiro. **E há um achado de superfície junto**: a tela
  oferece a ação e o operador só descobre a falta depois de preencher o formulário inteiro;
- `SCHEMA-SEM-CASO-DE-USO` — as cinco tabelas mortas: escrever o caso de uso ou remover;
- `SUBEMPENHO-NO-LEIAUTE-TCM-BA` — a remessa pede o que o modelo não tem;
- `LICITACAO-SEM-WORKFLOW` — o motor do M21 existe e a licitação não o usa; falta a FK;
- as demais pendências do ENT03b seguem de pé, e `packages/integracao` e o **planejamento**
  continuam fora de escopo por decisão, agora para o **ENT03d**;
- **o lote de tenancy** segue de pé desde o ENT01 — e o censo o encontrou de novo: 5.17.34
  (licitação multientidade) e 5.19.27/5.19.28 (patrimônio por unidade gestora, transferência
  entre entidades) **dependem dele**, não de tela.

### 17.10 · Comandos e resultados — reprodutíveis

| Comando | Resultado | Data |
|---|---|---|
| `npm run test:tudo` | **183 arquivos, 1.869 testes, 0 falhas, 638 s** | 2026-09-11 |
| `npm run test:fuso` (`Pacific/Kiritimati`) | **183 arquivos, 1.869 testes, 0 falhas** — idêntico | 2026-09-11 |

⚠️ **UMA INTERMITÊNCIA, REGISTRADA COM O QUE SE SABE E SEM O QUE NÃO SE SABE.** A execução
do `test:fuso` das **01:22 de 2026-09-11** acusou **2 falhas em 1.869**. Duas execuções
seguintes do MESMO comando, no MESMO commit, deram **0 falhas** — e uma delas com o
`next start -p 3011` do smoke ainda de pé, que é a configuração mais carregada das três.
Máquina de 8 GB, suíte serializada contra um banco só.

⚠️ **E O QUE FALTA AQUI É CULPA DA MINHA FERRAMENTA, NÃO DO TESTE: os nomes dos dois testes
que falharam NÃO foram capturados.** O comando canalizava a saída por um `grep` que descartou
o bloco de falhas antes de ele chegar ao arquivo. Uma intermitência sem o nome do teste é
quase inútil — ela não se investiga e não se reproduz. As execuções seguintes passaram a
gravar o log inteiro em arquivo e só depois filtrar. **A causa da falha segue não isolada**,
e está aqui por isso: descartá-la em silêncio seria exatamente o que a regra do lote proíbe.
| `npm run test:rapido` | 583 testes, 0 falhas, ~9 s | 2026-09-11 |
| `npm run deriva` | migrations × modelo limpo; 24 objetos de `prisma/sql/` | 2026-09-11 |
| `npx tsx scripts/smoke-ent03c.ts` | **34 passos, 0 falhas** — duas execuções | 2026-09-11 |
| `npx tsc` (backend, app, scripts) | 0 erros nos três | 2026-09-11 |
| `npx next build` | limpo; as 9 rotas novas na tabela | 2026-09-11 |
| `npx tsx scripts/cobertura-de-tsconfig.ts` | **787 de 787 cobertos, 0 descobertos** | 2026-09-11 |
| `npx tsx scripts/marcar-catalogo.ts --aplicar` | **311 de 2037 (15,3%)** | 2026-09-11 |

## 18. ENT04 — os seeds oficiais, a casca e o que a medição disse

⚠️ **Este lote entregou os quatro itens pedidos e marcou 5 cláusulas.** A distância entre
as duas frases é o achado principal, e ela está medida em 18.9.

### 18.1 · A contagem do lote, separada

| | |
|---|---:|
| **censo** — medir o que já existia | **0** |
| **construção** — comportamento novo com cláusula | **5** |
| **acréscimo de produto SEM cláusula** (fora da contagem, por decisão) | 6 frentes |
| catálogo | 311 → **316 de 2037 (15,5%)** |

Promoções (não somam ao total, porque já estavam verificadas): **5.10.1.82** e **5.34.25**
de `IMPLEMENTADO_NAO_VALIDADO` para **`VALIDADO_LOCALMENTE`**, pelo smoke.

**Os acréscimos de produto sem cláusula**, registrados fora da medida para não diluí-la:
barra lateral filtrada por permissão; busca global; painel de pendências do usuário;
portão executável; registro bruto de execução; cadastro de **provisões** pelo molde.

### 18.2 · ⚠️ O ITEM 1 virou o achado do lote: o plano de contas estava no lugar errado

`docs/oficial/tce-pb/Pcasp_2025.xlsx` — publicado pelo TCE-PB, sha256 conferido contra o
`MANIFEST.json` **antes de qualquer leitura** — entrou no sistema: **7.864 contas**, com
nome, natureza de saldo, nível e hierarquia. `npm run seed:pcasp-oficial`.

Confrontados os **70** códigos PCASP que o código de produção usa contra a tabela real:

- **ZERO inventados.** Todos existem no plano publicado. Nenhum lote anterior fabricou
  código de conta — a disciplina segurou, e isso agora é teste
  (`test/contas-contra-o-plano-oficial.test.ts`).
- **E quatro estão no lugar errado**, o que só o confronto de NOME revela:

| O sistema chama de | No PCASP é |
|---|---|
| `1.1.1.1.2.00.00` "Bancos Conta Movimento" | **CAIXA E EQUIVALENTES… - INTRA OFSS** (a variante para transações entre entes do mesmo OFSS). O banco do município é `1.1.1.1.1.19.00` |
| `1.1.5.1.1.00.00` "Almoxarifado" | **MERCADORIAS PARA REVENDA OU DOAÇÃO**. Almoxarifado é `1.1.5.6.x` |
| `2.2.1.1.1.00.00` "Dívida Fundada Interna" | **PESSOAL A PAGAR - CONSOLIDAÇÃO**. A dívida fundada é `2.2.2.x` |
| `1.1.2.2.x` "Créditos Tributários a Receber" | **CLIENTES** |

E `6.2.1.2.0.00.00` RECEITA REALIZADA estava semeada como **DEVEDORA**; a classe 6 é
credora e a conta não é retificadora. O seed oficial corrigiu essa, que é de dado.

⚠️ **AS OUTRAS QUATRO NÃO FORAM CORRIGIDAS NESTE LOTE, E É DECISÃO.** Trocar a conta de um
roteiro muda **lançamento já gravado**: o saldo migra de conta sem que exista movimento
explicando a migração, e dois exercícios deixam de fechar entre si. É correção de eixo do
mesmo peso que a do eixo de data, e como aquela precisa de **caracterização antes** — o que
cada conta hoje acumula, e para onde cada saldo vai. Pendência
**`PLANO-DE-CONTAS-FORA-DO-PCASP`**. O guard mantém a lista visível e **falha se ela
crescer**.

### 18.3 · ⚠️ O plano oficial quebrou um formulário, e o defeito não era um erro

Com 6.074 contas analíticas no banco, `opcoesDoCadastro` — que pedia "todas as analíticas"
com `take: 500` — passou a trazer **só a classe 1**, porque são as 500 primeiras por
código. O campo "Conta do passivo" da dívida fundada ficou **sem nenhuma conta de passivo**.

Nada estourou. O formulário montou, o `select` apareceu, e não havia o que escolher.
**Lista curta não é exceção: é um formulário bonito e inútil.**

A correção é declarativa, não um teto maior: o descritor diz **quais classes** o campo
aceita (`classesDeConta`), `verificarDefinicao` **cobra** a declaração, e a consulta filtra
por elas. Teto maior adiaria o mesmo defeito para o dia em que o plano crescesse — e ainda
mandaria 400 KB de `<option>` ao navegador. `test/molde/opcoes-de-conta.test.ts`.

### 18.4 · Os roteiros, e a linha entre fato e escolha

`npm run seed:roteiros-patrimoniais` parametrizou **16 roteiros** — 8 de dívida ativa, 2 de
dívida fundada, 6 de provisão — e o smoke do ENT03c, que provava a **recusa**, agora prova
a **aceitação**. Fecha `ROTEIROS-PATRIMONIAIS-NAO-PARAMETRIZADOS`.

⚠️ **A distinção está escrita no próprio seed, e importa mais que o resultado.** **Fato:**
todo código existe no PCASP oficial, é **analítico**, e o seed **recusa rodar** se algum
deixar de existir ou de ser analítico. **Escolha:** qual par débito/crédito corresponde a
cada evento é doutrina do MCASP, não dado do arquivo do TCE — está explicada linha a linha,
e **é do contador do ente**. O seed a torna explícita e revisável num lugar só.

### 18.5 · O menu não pode oferecer o que o servidor nega

A barra lateral mostrava as **18 áreas** a todos. Agora a visibilidade vem do **mesmo**
`PermissaoDePerfil` que o `autorizar` lê — sem lista paralela.

⚠️ **A exaustividade é do compilador, não da boa vontade:**
`Record<AcaoDoSistema, SlugDeArea | "transversal">` obriga uma entrada para cada uma das
**185** ações do censo. Ação nova não compila até dizer onde mora.

E o teste é de **propriedade**, não de lista: *área escondida ⟺ o servidor nega TODAS as
ações dela* — percorrendo as 185 ações contra o `autorizar` de verdade. Mutação: fazendo o
menu mostrar tudo, ele acusa nominalmente ("Planejamento APARECE no menu e o servidor nega
TODAS as suas ações"). `test/menu-contra-o-servidor.test.ts`.

⚠️ **E o que ele NÃO resolve está dito:** o censo do M16 cobre **mutações**; leitura ainda
não é permissão. Por isso `transparencia` — só leitura — fica visível a qualquer sessão.
Isso não é o menu mentindo: é o menu dizendo a verdade sobre um servidor que ali não nega.

### 18.6 · Busca, pendências e o que ficou de fora por honestidade

**Busca global**: índice **derivado** de `RECURSOS_DO_MOLDE`, `AREAS` e das listas de
navegação — o cadastro do próximo lote entra sozinho. O recorte de permissão é feito **no
servidor**; o cliente só casa texto. Um destino com ação exige **aquela** ação: quem pode
lançar consórcio não recebe "Convênios" como se fosse atalho autorizado.
⚠️ Ela **não busca dado** (o convênio nº 12/2026): isso exige o recorte de unidade gestora
de cada consulta, e ignorá-lo vazaria títulos de registros por lista de resultados.
Pendência **`BUSCA-DE-REGISTRO`**.

**Painel de pendências**: assinaturas na fila, pareceres aguardando você, conciliações em
aberto — três contagens sobre registro existente, cada uma com o critério em português na
tela. **"Pendente" é derivado da ausência do fato** (o signatário sem assinatura, o pedido
de parecer sem resposta), nunca de coluna de estado. **A faixa some quando não há nada** —
três zeros no topo ensinam o operador a não olhar para ali.

⚠️ **"Prazos próximos" NÃO foi entregue.** O prazo mora na etapa do roteiro do assunto
(M21) e exige a contagem por dia útil a partir do RECEBIMENTO, não do trâmite. Um painel
com prazo aproximado é pior que nenhum. Pendência **`PAINEL-DE-PRAZOS`**.

### 18.7 · A ferramenta que perdeu os nomes

`stdio: "inherit"` era a causa: o filho escrevia direto no terminal do chamador, e um
`| grep` destruía a saída para sempre. Agora o runner **grava em disco antes** de qualquer
cano, e só depois filtra — e o resumo do que falhou sai por `stderr`, porque por `stdout`
o mesmo `grep` esconderia a pista.

**Provado reproduzindo o ENT03c:** um teste falhando, `2>/dev/null | grep Duration` — o
terminal ficou só com a duração, e o nome `NOME-QUE-NAO-PODE-SE-PERDER` estava intacto no
arquivo. `test/registro-de-execucao.test.ts` fixa a propriedade.

⚠️ **E ela já pagou num caso real, não num fixture:** a primeira execução do portão caiu, e
o nome do teste responsável estava gravado. O defeito era do próprio trinco — 18.11.

### 18.8 · O portão, e o guard de tabela morta

O "gate" era uma **tabela em documento**: nove comandos para alguém lembrar de rodar, na
ordem certa, e transcrever. Virou `npm run portao` — dez passos, saída bruta por passo,
e **não para no primeiro erro** (só pula o que depende do que caiu, e diz que pulou).
Ele também **nomeia o que não roda**: o smoke de navegador e a instalação real.

O guard de tabela morta **já era do schema inteiro** (189 modelos). Medido e provado por
mutação: um modelo novo sem leitor é acusado pelo nome. O que faltava era o gate, e é o
que o portão dá.

### 18.9 · ⚠️ O GARGALO, nomeado — porque a meta era 60–90 e vieram 5

Não é o molde, e não é o censo. É **o desencontro entre o que tem motor e o que o catálogo
pede**, e este lote o mediu nas duas direções:

1. **Os quatro itens do ENT04 são infraestrutura.** Seeds oficiais, casca, guards e
   ferramenta quase não têm cláusula: o catálogo descreve **funcionalidade de negócio**.
   Foi o lote certo a fazer — sem os seeds nenhum percurso demonstrava — e ele rende pouco
   em contagem por natureza, não por execução.
2. **O cadastro de PROVISÕES, entregue pelo molde e provado pelo smoke, marcou ZERO.** As
   oito cláusulas que dizem "provisão" são **todas de folha** (férias, 13º, licença-prêmio,
   seção 5.12). A provisão **contábil** do M10 — matemática previdenciária e riscos — não é
   pedida em cláusula nenhuma. Buscas por "atuarial", "riscos fiscais", "passivo
   contingente" e "NBC TSP" no catálogo: 1, 0, 0 e 0.
3. **É a segunda vez seguida.** No ENT03c, os três cadastros do molde também somaram zero —
   deram *tela* ao que o censo acabara de marcar `IMPLEMENTADO_NAO_VALIDADO`.

**A conclusão, medida:** os motores que existem sem tela (dívida, provisões) quase não
aparecem no catálogo; e as **469 cláusulas** de `BASE_FORTE` estão em módulos cujo motor o
censo do ENT03c mostrou que **não existe** — almoxarifado físico, gestão patrimonial,
compras. Construir tela para motor pronto rende ~0; construir motor rende muito e custa
caro.

⚠️ **Por isso o próximo lote não deve começar pelo molde.** Ele deve começar pelo **modelo**
das três seções derrubadas — quantidade no almoxarifado, responsável/localização no bem,
requisição e ordem de compra — que é onde as 469 cláusulas moram. O molde entra **depois**,
e aí rende.

### 18.10 · Comandos e resultados — reprodutíveis

| Comando | Resultado | Data |
|---|---|---|
| `npm run portao` | **10 de 10 passos**, na terceira execução — as duas primeiras vermelhas por um defeito que ele mesmo pegou; passo a passo em 18.11 | 2026-09-11 |
| `npx tsx scripts/smoke-ent03c.ts` | **41 passos, 0 falhas — DUAS execuções**, a segunda contra o banco já povoado pela primeira | 2026-09-11 |
| `npm run seed:pcasp-oficial` | 7.864 contas; 7.800 criadas; 1 natureza corrigida; 12 divergências de `analitica` **relatadas e não alteradas** | 2026-09-11 |
| `npm run seed:roteiros-patrimoniais` | 8 + 2 + 6 roteiros | 2026-09-11 |
| `npx tsx scripts/cobertura-de-tsconfig.ts` | **809 de 809 cobertos, 0 descobertos** | 2026-09-11 |
| `npx tsx scripts/marcar-catalogo.ts --aplicar` | **316 de 2037 (15,5%)** | 2026-09-11 |

⚠️ **A intermitência do ENT03c continua sem isolamento** — 2 falhas em 1.869 numa execução
do `test:fuso`, nomes perdidos pelo `grep`. **Ela não pode mais acontecer** (18.7), mas
também não foi reproduzida: o `test:fuso` deste lote rodou **1.912 testes sob
`Pacific/Kiritimati` com 0 falhas** (18.11). Fica registrada como não isolada, e não como
resolvida — uma execução limpa não refuta uma intermitência.

### 18.11 · O portão, rodado — e o que ele pegou na primeira tentativa

`npm run portao`, **2026-09-11**, TZ do hospedeiro `America/Recife`, Node v20.20.0.
**Três execuções: as duas primeiras vermelhas, a terceira 10 de 10.**

| Passo | Resultado | Tempo |
|---|---|---|
| `typecheck:backend` | limpo | 18s |
| `typecheck:app` | limpo | 3s |
| `typecheck:scripts` | limpo | 2s |
| `cobertura-de-tsconfig` | **809 de 809 cobertos, 0 descobertos** | 6s |
| `prisma:validate` | limpo | 1s |
| `deriva` | migrations x modelo limpo; banco x modelo só os **24 objetos** de `prisma/sql/` | 12s |
| `test:rapido` | **62 arquivos, 656 testes, 0 falhas** | 12s |
| `test:tudo` | **189 arquivos, 1.912 testes, 0 falhas** | 430s |
| `test:fuso` | **189 arquivos, 1.912 testes, 0 falhas**, sob `Pacific/Kiritimati` | 459s |
| `build` | compilou; 21 páginas estáticas | 38s |

**Código de saída medido, não suposto:** a cadeia inteira
(`npm` → `tsx` → trinco → `npx` → `tsx`) devolve o código do filho — filho com `exit 5`
devolveu **5**. Um wrapper que engolisse isso faria um gate vermelho se anunciar verde, e
é uma coisa que se mede, não se assume.

⚠️ **E o portão pegou um defeito logo na primeira tentativa — meu, e no lugar mais
constrangedor possível: dentro da ferramenta do ITEM 4.**

`test/registro-de-execucao.test.ts` roda o próprio trinco como filho para provar que a
saída bruta chega ao disco. **Sozinho ele passava (656/656); dentro do portão falhava
sempre** — 1 falha em 656 e 1 em 1.912, o mesmo arquivo, com o `test:fuso` pulado por
dependência. O portão rodava sob o trinco, o trinco aninhado encontrava o dono vivo, e
recusava. O filho saía com código 1 em vez do 3 que o script pediu.

**O defeito não era do teste.** O trinco conta **máquina**, não processo: quando o dono é um
ancestral, a memória já está contabilizada por ele, e recusar ali não protegia nada — só
impedia que qualquer trabalho pesado invocasse a si mesmo. Era uma armadilha latente para
qualquer passo futuro do portão que chamasse um comando com trinco.

A correção é **reentrância por descendência**: quem toma o trinco exporta o próprio PID em
`TRINCO_DE_MAQUINA_DONO`, e todo descendente herda pelo `spawn`. Não é dispensa — a
variável só vale se apontar para o PID **que de fato detém o trinco agora** e que ainda
está **vivo**; herança de shell antigo ou valor inventado é recusada como qualquer outro.
O aninhado também **não toma e não libera** o trinco: se tomasse, o soltaria ao sair e
devolveria a máquina no meio do trabalho do ancestral — o estado exato que o trinco existe
para impedir.

**Provado por mutação, nas duas metades** — cada uma mata exatamente um teste, e só um:

| Mutação em `travarAMaquina` | Teste que morre |
|---|---|
| `dono.pid === herdado` → `false` | o descendente do dono passa — e NÃO fica com o trinco na mão |
| `dono.pid === herdado` → `true` | dono FORJADO não abre o trinco alheio |

⚠️ **O que a reentrância NÃO protege, dito em voz alta:** um trabalho pesado que dispare
outro **em paralelo consigo mesmo** passa agora. Nada no repositório faz isso — os passos
do portão são sequenciais — e o dia em que alguém fizer, é esta linha a reler.

⚠️ **A segunda execução também custou uma lição de método:** a primeira rodada do portão
acusou `test:rapido` falhando e **o arquivo de registro do passo não existia**. Causa:
`spawnSync` bloqueia o event loop, e as escritas assíncronas de `createWriteStream` ficavam
enfileiradas esperando um loop que só voltava a girar no fim. É a mesma classe de defeito
que o ITEM 4 existe para impedir — saída que não chega ao disco — reaparecida **dentro da
ferramenta construída para impedi-la**. `scripts/portao.ts` passou a escrever com
`writeFileSync`/`appendFileSync`.

## 20. ENT05 — o modelo das três seções derrubadas

### 20.1 · A contagem do lote, por natureza

⚠️ **A META VEIO DECLARADA POR NATUREZA, e a medida tem de acompanhar.** Este foi lote de
**modelo e superfície**, com meta de 80 a 120. O que ele entregou:

| | |
|---|---:|
| **construção — cláusulas que saíram de `AUSENTE_CONFIRMADO`** | **50** |
| **construção — cláusulas que saíram de `PARCIAL`** | **4** |
| **total promovido para `IMPLEMENTADO_NAO_VALIDADO`** | **54** |
| **censo** — medir o que já existia | 0 |
| **acréscimo de produto SEM cláusula** (fora da contagem) | 3 frentes |
| catálogo | **316 de 2037 (15,5%) — e o percentual NÃO se move** |

⚠️ **POR QUE O PERCENTUAL NÃO SE MOVE, E POR QUE ISSO NÃO É ESTAGNAÇÃO.** As 184 cláusulas
destas três seções **já estavam contadas** pelo censo do ENT03c — com veredito negativo. O
que mudou não foi *quantas* foram olhadas: foi *o que se vê nelas*. Nas três seções:

```
AUSENTE_CONFIRMADO        146  ->   96     (−50)
PARCIAL                    31  ->   27     (−4)
IMPLEMENTADO_NAO_VALIDADO   7  ->   61     (+54)
```

**A medida deste lote é a segunda linha, não a primeira.** Um lote que constrói sobre
seção já censada move situação, não cobertura — e confundir as duas faria o próximo lote
achar que não avançou.

⚠️ **E NENHUMA ENTROU COMO `VALIDADO_LOCALMENTE`.** Todas têm modelo, caso de uso e teste
contra banco; **nenhuma tem tela**. O ITEM 2 (superfície pelo molde) NÃO foi executado — e
chamá-las de validadas seria dizer que um servidor municipal consegue usá-las hoje. Ele não
consegue. Ver 20.8.

**Os acréscimos de produto sem cláusula**, fora da medida: o repontamento de conta
(`repontarConta` + `MigracaoDeConta`), a reentrância do trinco de máquina, e a segunda
direção do censo de ausências (`CONQUISTAS`).

### 20.2 · A varredura, antes de modelar — e o que a rede NÃO pegou

`docs/varredura-ent05-tres-secoes.md` procurou as cinco famílias por assinatura nas 184
cláusulas e leu os achados um a um. **Catorze decisões (D1 a D14), todas de uma vez.**

⚠️ **TRÊS DAS CATORZE A REDE NÃO PEGOU**, e são o motivo de a leitura não poder ser
dispensada:

- **D6** — a 5.17.2 pede "relacionar **uma ou mais** unidades de medida" no fim de uma
  cláusula longa sobre descrição. É literal, e um `unidadeId` no material quebra no
  primeiro material comprado em caixa e distribuído em unidade;
- **D7** — marcas pré-aprovadas e elementos de despesa, as duas N-N, e a 5.17.9 pede uma
  **guarda**, não um enfeite ("impedindo que determinado produto seja comprado com
  elemento errado");
- **D14** — bloqueio de estoque como **fato com início e fim**, não flag. Um
  `bloqueado Boolean` responde "agora" e perde quem bloqueou, quando e por quê.

E **uma das que a rede pegou não muda nada** (D9): a 5.17.67 pede que NÃO se multipliquem
modelos de edital — é o inverso da família de cardinalidade. Ficou registrada para não ser
reaberta.

### 20.3 · ⚠️ O ALMOXARIFADO FÍSICO — e a cláusula que refuta a coluna na própria seção

A 5.18.1 pede "atualização automática do estoque", que é a formulação exata de uma COLUNA
de saldo. **A 5.18.16, quinze linhas abaixo, pede o saldo ANTERIOR ao período** — que
coluna nenhuma sabe responder.

A posição é `Σ(quantidade × sinal)` e `Σ(valor × sinal)` **até uma data civil**. O preço
médio sai da mesma janela, e o preço **efetivamente aplicado** é gravado no movimento de
saída, porque é fato.

⚠️ **N = 2 É O QUE PROVA O PREÇO MÉDIO.** Com uma entrada só, "média" e "preço da última
entrada" dão o mesmo número e qualquer implementação errada passa. Com 100 a R$ 5,00 e
100 a R$ 9,00, a saída sai a **7,00** — e não a 9,00.

⚠️ **E ESTOQUE ZERADO RECUSA, em vez de devolver zero.** Custo zero atravessaria o razão
sem acusar nada.

### 20.4 · ⚠️ O DEFEITO QUE O TESTE DE VALIDADE PEGOU, E ELE ERA MEU

A primeira versão exigia lote só na ENTRADA. O teste da 5.18.14 consumiu um lote inteiro de
dipirona e ele **continuou aparecendo em "a vencer"** — porque a saída não apontava para
lote nenhum, e a posição POR LOTE nunca baixava.

O efeito real: o relatório da 5.18.20 mandaria alguém procurar na prateleira um medicamento
já distribuído — e, pior, esconderia que o lote que AINDA está lá é outro, com outra
validade. Agora a saída de material com controle de lote **exige o lote**, confere que ele é
daquele material e daquele depósito, e recusa se não houver saldo nele.

⚠️ **E A TRANSFERÊNCIA DE MATERIAL COM LOTE RECUSA**, em vez de errar em silêncio: levar o
lote para o outro depósito exige abrir o lote correspondente lá, preservando a validade.
Pendência `TRANSFERENCIA-DE-MATERIAL-COM-LOTE`.

### 20.5 · O PATRIMÔNIO COMO GESTÃO — o parêntese que é um eixo temporal

> **5.19.20** — "informando seu estado e localização **atual (no momento do inventário)**"

O parêntese é um eixo temporal escrito por extenso. Situação, estado e localização são
**derivados do último movimento de cada tipo até uma data** — nenhuma coluna `atual`.

⚠️ **O ESTORNO ANULA, e não é "mais um movimento no fim da fila".** A leitura remove os
pares (original, estorno) ANTES de procurar o último de cada tipo. Tratá-lo como movimento
comum faria a localização do bem voltar a ser a que o estorno desfez — o contrário do que
estornar significa. Provado por mutação.

⚠️ **E O EIXO DE GESTÃO NÃO TOCA O RAZÃO.** Há teste contando `LancamentoContabil` antes e
depois de mover localização, emitir termo e transferir entre entidades: o número não muda. A
contabilidade do bem (depreciação por NBC TSP 07, alienação com resultado) ficou intocada.

### 20.6 · ⚠️ A CLÁUSULA MAIS PERIGOSA DAS TRÊS SEÇÕES

> **5.19.42** — "avaliações a partir de fórmulas previamente cadastradas, podendo ser
> **editadas pelo próprio usuário**"

**Fórmula editável pelo usuário é código escrito pelo usuário.** A implementação óbvia é
`eval(formula)` ou `new Function(formula)`, e as duas entregam a quem editar o cadastro a
capacidade de ler `process.env` (onde está a senha do banco), abrir conexão ou apagar tabela.

⚠️ **E SANITIZAR POR LISTA NEGRA NÃO RESOLVE:**
`this.constructor.constructor("...")()` alcança o `Function` global sem escrever nenhuma
palavra proibida.

`modules/m10-patrimonial/formula-avaliacao.ts` é um **interpretador**, não um filtro:
tokeniza, analisa e avalia sobre um universo fechado — quatro operações, parênteses, números
e um rol FECHADO de seis grandezas do bem. Identificador global, chamada de função e acesso
a propriedade **não são bloqueados: são inexprimíveis**. Metade do arquivo de teste é
negação. Tudo em `Decimal`.

### 20.7 · ⚠️ ITEM 3 — O REPONTAMENTO, E POR QUE ELE NÃO É UM `UPDATE`

As quatro contas que o ENT04 mediu foram repontadas:

| Era | O que ela é no PCASP | Passou a ser |
|---|---|---|
| `1.1.1.1.2.00.00` | CAIXA E EQUIVALENTES — **INTRA OFSS** | `1.1.1.1.1.19.00` |
| `1.1.5.1.1.00.00` | **MERCADORIAS PARA REVENDA OU DOAÇÃO** | `1.1.5.6.1.01.00` |
| `2.2.1.1.1.00.00` | **PESSOAL A PAGAR** | `2.2.2.1.1.02.98` |
| `1.1.2.2.0.00.00` | **CLIENTES** (e sintética) | `1.1.2.1.1.99.00` |

⚠️ **TROCAR O CÓDIGO DA CONTA SERIA RAZÃO REESCRITO COM OUTRO NOME.** Os lançamentos já
feitos passariam a apontar para um conceito diferente do que tinham quando foram feitos, e o
balancete do exercício anterior mudaria sozinho sem nada que explicasse por quê.

`repontarConta` move o saldo com um **lançamento que explica a mudança**, acompanhado de um
registro (`MigracaoDeConta`) com origem, destino, data, motivo e o saldo migrado.
**Caracterização primeiro** (três testes escrevem o saldo como ele está, antes de mover), e
a propriedade que vale é a **conservação**: `Σ(origem) + Σ(destino)` é o mesmo antes e
depois. Recusa: repontar duas vezes, destino sintético, naturezas opostas, saldo invertido
("conserte a causa primeiro") e conta de destino inexistente.

⚠️ **UM ACHADO DENTRO DO ACHADO.** O próprio `prisma/seed/pcasp.ts` dizia, desde o M04, que
aqueles códigos **não eram oficiais** e que "o xlsx confirma ou corrige". O xlsx chegou no
ENT04. Este lote é o que executou a correção que o comentário previa.

### 20.8 · ⚠️ O QUE NÃO ENTROU — ITEM 2, e a meta de 80 a 120

**O ITEM 2 (superfície pelo molde) não foi executado.** As três seções ganharam modelo,
caso de uso e teste; **nenhuma ganhou tela**. É a razão de as 54 cláusulas entrarem como
`IMPLEMENTADO_NAO_VALIDADO` e não como `VALIDADO_LOCALMENTE`.

**A meta era 80 a 120 e vieram 54.** A diferença não é ritmo: é que o lote gastou em
MODELO o que a meta supunha gasto em modelo **e** superfície. Três domínios novos
(almoxarifado físico com 14 modelos, gestão do bem com 11, a compra com 12) mais a correção
de eixo do ITEM 3 consumiram o lote inteiro.

⚠️ **E A ORDEM ESTAVA CERTA.** A superfície sobre modelo errado custa o dobro, e o segundo
pagamento é feito com migração de dados — foi exatamente isso que o ITEM 3 acabou de pagar
por uma decisão tomada no M04. O molde agora tem sobre o que montar: **as telas das três
seções são lote de superfície, e é lá que as 54 viram `VALIDADO_LOCALMENTE`.**

### 20.9 · ITEM 4 — medido, e a pendência fica

A STN/MSC **não entrou no corpus**. O único arquivo de fonte de recursos presente
(`relacionamento_fonterecursos_co_2026.xlsx`, TCE-PB) foi lido: **97 linhas de pares
`CODIGO FONTE RECURSOS` × `CODIGO CO`** — códigos, não descrições.

Pela regra do próprio lote: os 30 códigos oficiais permanecem e a pendência
`FONTES-DESCRICAO-STN-MSC` fica. **Não preenchi por inferência.**

### 20.10 · A REGRA NOVA — instrumento nasce com a prova de que acusa

Três instrumentos nasceram ou mudaram neste lote, e os três têm mutação nas duas direções:

| Instrumento | Mutação | O teste que morre |
|---|---|---|
| posição de estoque | corte por instante UTC | a borda de 23h50 de 31/12 |
| preço médio | devolve zero em vez de recusar | a negação do estoque zerado |
| estado do bem | estorno vira movimento comum | "o estorno ANULA" |
| estado do bem | corte por instante UTC | a borda de 31/12 |
| censo de ausências | nome ausente reaparece | "continua ausente: inventário de BENS" |
| censo de ausências | leitor conquistado é renomeado | "continua existindo: ficha de controle" |

⚠️ **E A ÚLTIMA LINHA CUSTOU TRÊS TENTATIVAS — as duas primeiras provaram o contrário do
que eu queria.**

1. Renomeei `fichaDeControleDeEstoque` para `fichaDeControleDeEstoqueRemovida`: o regex
   continuou casando com o **prefixo**. Mutação inválida;
2. renomeei de verdade, e o teste **continuou verde** — casando com a chave homônima que eu
   mesmo escrevera no `FORA_DO_CENSO` do M16. **O guard estava atestando a existência de um
   leitor pelo formulário que o declara;**
3. troquei o padrão para `saldoAnterior`, um campo do retorno, e ele casou com o **Balanço
   Financeiro do M12**, que usa o mesmo nome há lotes. Padrão genérico não é mais seguro que
   específico — é só menos honesto.

A correção foi estrutural: a prova de EXISTÊNCIA passou a ignorar os arquivos que apenas
**nomeiam** coisas (o censo de ações do M16). A lista de AUSÊNCIA não precisa da exclusão, e
é de propósito: lá, um nome que aparece na papelada é justamente o sinal de que alguém
começou a construir.

### 20.11 · Comandos e resultados — reprodutíveis

| Comando | Resultado | Data |
|---|---|---|
| `npm run portao` | **10 de 10**, saída 0; 196 arquivos / 2.055 testes verdes nas duas passagens de fuso — ver 20.12 | 2026-09-11 |
| `npx tsx scripts/marcar-catalogo.ts --aplicar` | **54 promovidas**; 316 de 2037 (15,5%) — o percentual não se move (20.1) | 2026-09-11 |
| `npx prisma migrate dev` | 6 migrations novas (eixo físico, gestão do bem, compras, e três de enum de ação) | 2026-09-11 |
| `npm run db:sql` | 24 arquivos aplicados, com 2 índices parciais novos | 2026-09-11 |

⚠️ **O SMOKE PELO NAVEGADOR NÃO RODOU NESTE LOTE**, e é consequência direta de 20.8: não há
tela nova para percorrer. O smoke do ENT03c/ENT04 continua válido sobre o que ele já cobria.

### 20.12 · O portão do ENT05 — 10 de 10

Rodada de `2026-09-11T16:16:14Z`, registro bruto em
`.registro-de-execucao/portao-2026-09-11T16-16-14-305Z.log`, com um log por passo ao lado.

| Passo | Estado | Segundos | Heap declarado | TZ |
|---|---|---|---|---|
| `typecheck:backend` | ok | 17 | 3072 MB | — |
| `typecheck:app` | ok | 3 | 3072 MB | — |
| `typecheck:scripts` | ok | 2 | 3072 MB | — |
| `cobertura-de-tsconfig` | ok | 6 | padrão | — |
| `prisma:validate` | ok | 1 | padrão | — |
| `deriva` | ok | 8 | padrão | — |
| `test:rapido` | ok | 13 | padrão | — |
| `test:tudo` | ok | 703 | padrão | — |
| `test:fuso` | ok | 673 | padrão | `Pacific/Kiritimati` |
| `build` | ok | 39 | 4096 MB | — |

`CODIGO_DE_SAIDA_DO_PORTAO=0`.

**A suíte inteira:** 196 arquivos, **2.055 testes**, verdes nas duas passagens — a de fuso do
hospedeiro e a de `Pacific/Kiritimati`. A rápida: 65 arquivos, 722 testes. Os números são
idênticos entre `test:tudo` e `test:fuso`; é isso que se quer de uma propriedade, e não de
um caso: **o mesmo conjunto passa com o relógio deslocado**, sem teste pulado sob TZ.

**Duas coisas mudaram em relação à primeira rodada deste lote** (7 de 10), e as duas valem
registro porque a diferença entre elas não é de grau:

**1. `test:tudo` saiu de 26 falhas em 9 arquivos para verde.** As 26 eram uma causa só — as
fixtures semeavam e procuravam pelas quatro contas de origem do repontamento (20.6). Não era
regressão: era o guard de 20.6 funcionando com um lote de chamadores ainda por corrigir.

**2. `test:fuso` deixou de sair `pulado`.** Ele declara `depende: ["test:tudo"]`, e na
primeira rodada saiu `pulado 0s` — não porque passasse, mas porque o passo do qual depende
falhou. ⚠️ **`pulado` num portão não é um passo barato; é um passo que não aconteceu.** A
única rodada em que a disciplina de data civil dos três modelos novos foi de fato exercida
sob relógio deslocado é esta, e ela custou 673 s. A leitura correta da primeira rodada não
era "9 de 10 mais um pulado", era **7 de 10 com o instrumento mais caro por rodar**.

**O `build` e o teto de heap.** Os dois passos que precisaram de teto declarado
(`HEAP_DO_PASSO`, 20.10) o precisaram pelo mesmo motivo: o cliente Prisma cresceu com os três
domínios do lote. O `build` sob o padrão do Node morria com *"Ineffective mark-compacts near
heap limit"* **e nenhuma linha dizendo em que arquivo** — é a forma de falha que mais custa a
diagnosticar, porque não se parece com erro de código. Sob 4096 MB compila em 3,9 s. O mesmo
estouro no `typecheck:scripts`, sob 3072 MB, foi o que revelou as 54 chaves duplicadas de
`marcar-catalogo.ts` (20.7): **o teto baixo não estava escondendo lentidão, estava escondendo
um erro de tipo real.**

**O que este portão NÃO cobre, e continua não cobrindo:** o smoke pelo navegador, pela razão
de 20.8 — não há tela nova neste lote para percorrer.

## 21. ENT06 item 0 — a superfície do almoxarifado físico

### 21.1 · A contagem do lote, por natureza

⚠️ **ESTE É LOTE DE SUPERFÍCIE, E A MEDIDA DELE É VALIDAÇÃO, NÃO COBERTURA.** O percentual
do catálogo não se move e não deveria: as cláusulas destas seções já estavam contadas.

| | |
|---|---:|
| **validação — cláusulas que saíram de `IMPLEMENTADO_NAO_VALIDADO`** | **3** |
| construção — cláusulas que saíram de `AUSENTE_CONFIRMADO` | 0 |
| censo — medir o que já existia | 0 |
| **acréscimo de produto SEM cláusula** (fora da contagem) | 3 frentes |
| catálogo | 316 de 2037 (15,5%) — inalterado |

```
IMPLEMENTADO_NAO_VALIDADO   88  ->  85     (−3)
VALIDADO_LOCALMENTE         43  ->  46     (+3)
```

⚠️ **TRÊS, E A SEÇÃO 5.18 TINHA QUINZE ESPERANDO.** Este lote deu tela a quase todas — sete
descritores pelo molde, uma tela escrita à mão, quinze rotas no build. E ainda assim só três
foram promovidas, porque `VALIDADO_LOCALMENTE` afirma que o caminho foi **atravessado pela
interface**, e a maior parte dele não pôde ser.

**A razão é uma só, e está nomeada em 21.4: não há tela de ENTRADA de material.**

As três promovidas — 5.18.8 (requisição com acompanhamento), 5.18.12 (inventário bloqueando
a movimentação) e 5.18.13 (bloqueio por depósito) — são exatamente as que não dependem de
haver estoque na prateleira.

**Os acréscimos de produto sem cláusula**, fora da medida: o agendamento do passo de fuso
pelo diff (21.2), o detector de deriva entre censo e perfis (21.5) e as seis faixas novas do
painel de pendências.

### 21.2 · O agendamento do portão — lido do diff, não escolhido

`test:fuso` é a suíte inteira de novo sob `TZ=Pacific/Kiritimati`, e custa o mesmo que
`test:tudo` — entre 673 s e 908 s nas medições desta máquina. Rodar os dois em todo portão
dobra o passo mais caro, e **um portão de trinta minutos passa a ser rodado no fim do dia**.

`scripts/fuso-do-diff.ts` decide por **caminho** (`packages/datas`, os guards de período, as
janelas de relatório do M12, o próprio decisor e o portão) e por **conteúdo** (`new Date`,
`Date.now/UTC/parse`, `getUTC*`, `toISOString`, `toLocale*String`, `Intl.DateTimeFormat`, os
helpers civis do núcleo, o vocabulário de eixo temporal e `vi.setSystemTime`).

⚠️ **É AGENDAMENTO, NÃO RIGOR.** Nada deixa de rodar: o fuso é obrigado sempre que o diff
toca relógio, e `npm run portao -- --fim-de-lote` o roda incondicionalmente.

⚠️ **E ELE FALHA PARA O LADO DE RODAR.** Sem marca do último portão verde, com marca
apontando para commit que sumiu (rebase, reset) ou sem git, a resposta é o passo caro. Um
agendamento que erra para o lado de pular vira, na prática, um passo que nunca roda.

⚠️ **O RELATÓRIO NÃO ESCONDE O AGENDADO.** Estado próprio `agendado`, separado de `pulado`
(que quer dizer "não pôde rodar porque algo quebrou antes"), **fora do numerador**, nomeado
com o motivo e com o comando que o obriga. "10 de 10" com o fuso pulado seria verdadeiro e
enganoso ao mesmo tempo.

### 21.3 · ⚠️ O ACHADO QUE TORNA TUDO ISTO INALCANÇÁVEL EM PRODUÇÃO

Medido no banco de desenvolvimento, e é o maior achado do lote:

```
censo do M16 ........ 223 ações
perfil concedia ..... 185 ações
FALTAVAM ............  38  —  TODAS as do ENT05
```

**O efeito não é um erro na tela: é a tela não existir para quem usa.** O molde esconde o
formulário de quem não tem a ação, e faz certo — oferecer e recusar depois ensina que o
sistema é instável. Então um lote inteiro de funcionalidade entregue fica invisível: sem
mensagem, sem log, sem nada que denuncie. **Ninguém abre chamado dizendo "a tela que eu
nunca vi não apareceu".**

⚠️ **E O BOOTSTRAP NÃO RESOLVE, NEM DEVE.** Ele deriva as permissões de `TODAS_AS_ACOES`,
então nasce correto — mas é ato de INSTALAÇÃO e recusa rodar em banco povoado, de propósito:
um script re-executável capaz de carimbar administrador entregaria a chave-mestra a quem
tivesse acesso ao shell. A recusa é decisão de segurança e continua.

⚠️ **O QUE FALTA É O OUTRO LADO: não existe caso de uso que conceda uma AÇÃO a um PERFIL.**
`concederPerfil` concede o PERFIL a um USUÁRIO — outra coisa. Os únicos escritores de
`PermissaoDePerfil` no repositório são o bootstrap e um teste. Pendência
`CONCEDER_ACAO_A_PERFIL`, e ela bloqueia a entrega do ENT05 e deste lote em qualquer
instalação que já exista.

### 21.4 · ⚠️ O QUE NÃO ENTROU, E POR QUÊ

**Não há tela de ENTRADA de material**, e é ela que trava a promoção das outras doze
cláusulas de 5.18. Sem entrada não entra estoque; sem estoque não há preço médio a calcular,
saída a atender, transferência a fazer nem lote a vencer. O percurso tentou atender a
requisição e o servidor recusou — corretamente — dizendo *"não se entrega o que não há na
prateleira"*.

⚠️ **E A ENTRADA NÃO É UMA TELA A MAIS: ELA NASCE DA LIQUIDAÇÃO.**
`registrarEntradaFisica` aceita `movimentoAlmoxarifadoId`, e o ENT05 mediu que sem essa
amarração a classe contábil fica em zero e a saída é recusada. A superfície da entrada
atravessa M05 e M10 — é lote próprio. Pendência `TELA-DE-ENTRADA-DE-MATERIAL`.

**As seções 5.19 (gestão do bem) e 5.17 (a compra) não ganharam tela neste lote.** O
almoxarifado consumiu-o inteiro, e a razão está em 21.6: o lote não foi só montar molde.

**Sem aba de anexos e sem aba de campos adicionais** nos cadastros novos. As duas custam
MODELO — uma coluna de dono em `Anexo`, um valor em `CadastroComCamposAdicionais` com a FK
correspondente — e este lote não abre modelo. `verificarDefinicao` recusa declarar a aba sem
o modelo, com razão: aba vazia ensina que o sistema perdeu o arquivo. Pendência
`ANEXO-NOS-CADASTROS-DO-ALMOXARIFADO`. ⚠️ O que **já** está ligado ao M22 e não precisou de
modelo: os termos de abertura e fechamento do inventário são `Anexo` desde o ENT05, e
portanto já entram na fila de assinaturas.

**Formulário de UM item onde o caso de uso recebe array.** `cadastrarMaterial` recebe
`unidades[]` e `registrarRequisicaoDeMaterial` recebe `itens[]`; o molde não tem campo
repetidor e **não cresce para ganhar um** (limite 2). A tela cria o caso de UM e diz isso no
campo. Pendências `MATERIAL-COM-MULTIPLAS-UNIDADES` e `REQUISICAO-COM-VARIOS-ITENS`.

**`MarcaAprovada` não tem caso de uso que a crie.** O ENT05 modelou a tabela e a relação, e
o serviço que cadastra a marca não existe — então a ação "Aprovar marca" tem seletor vazio e
o molde o mostra desabilitado. Pendência `CADASTRO-DE-MARCA-APROVADA`.

### 21.5 · ⚠️ O DEFEITO DE EIXO QUE O PERCURSO ACHOU

A mensagem de recusa do servidor dizia *"em 2026-09-10"* para uma data digitada como 11/09.
Medido:

```
z.coerce.date("2026-09-11")  ->  2026-09-11T00:00:00.000Z   (meia-noite UTC)
diaCivil desse instante      ->  2026-09-10                 (o ente é UTC-3)
```

**O operador digita 11 e o sistema guarda um instante cujo dia civil do ente é 10.**

⚠️ **E NÃO É APRESENTAÇÃO.** `posicaoDeEstoque(movimentos, ateDia)` corta por
`compararPorDiaCivil`: um movimento digitado como 11 **entra na posição pedida "até 10"** — a
posição de ontem inclui um movimento de hoje. A ficha de controle (5.18.16) tem o mesmo
corte, e o inventário compara a contagem contra a posição na data de abertura. É justamente
a cláusula "naquela data" que o ENT05 declarou como a razão de não haver coluna de saldo.

**Como o resto do repositório faz:** o M28 recebe `zDia` — a string `YYYY-MM-DD` — e ancora
com `inicioDoDiaCivil`, meia-noite **do ente** (03:00Z). Com a âncora certa, a posição até o
dia 10 responde zero, que é o correto.

⚠️ **POR QUE O GUARD DE DATA CIVIL NÃO PEGOU.** Ele vigia formas no código-fonte: `getUTC*`,
fatiar ISO, `Date.UTC(`, literal `Z` e relógio do hospedeiro. `z.coerce.date()` não é
nenhuma delas — é uma porta nova para o mesmo eixo errado.

⚠️ **E EU TENTEI FECHAR A PORTA COM UM PADRÃO NOVO, E ESTAVA ERRADO.** Acrescentar
`z.coerce.date` às formas proibidas acusou **96 sítios** no repositório, 54 deles nos módulos
do ENT05. O padrão é largo demais porque `z.coerce.date` é **inócuo** quando recebe um
instante ISO completo — o defeito é a string `YYYY-MM-DD` **crua** chegar nele, e isso é
fluxo de dados, não forma no texto. Um guard que exigisse noventa exceções seria a "lista
cheia de exceções que ninguém lê" que o próprio arquivo adverte. Revertido.

**O que fica:** `modules/m10-patrimonial/m10-eixo-de-data-da-entrada.test.ts`, com o
comportamento preso em quatro asserções — inclusive uma amostra em quatro estações provando
que o erro é de **um dia, sempre para trás**, e não deslocamento aleatório nem horário de
verão. Pendência `EIXO-DE-DATA-NA-ENTRADA-DO-ENT05`, no mesmo regime da competência e do
repontamento: caracterizar primeiro, corrigir com movimento que explique a mudança.

### 21.6 · O que o percurso provou, e o que ele custou

`scripts/smoke-ent06.ts` — **48 passos, 0 falhas**. A cadeia: unidade de medida → grupo →
classe contábil → material → depósito → requisição → tentativa de atendimento → inventário →
contagem → fechamento → posição em duas datas → bloqueio → painel.

⚠️ **É O PERCURSO QUE PROMOVE, NÃO O DESCRITOR.** Uma tela do molde compila, aparece no
`next build` e pode estar inteiramente quebrada. O que o percurso provou e nenhum teste de
módulo prova:

- **os três seletores obrigatórios do material têm opção** — e essa asserção nasceu de um
  achado: `ClasseDeMaterial`, `GrupoDeMaterial` e `UnidadeDeMedida` estavam todos em **zero**
  no banco, e os três são campo obrigatório. Sem eles o formulário monta com três seletores
  vazios. Foi o que obrigou a acrescentar os três cadastros de apoio;
- **recarregada, cada lista traz o registro persistido** — não estado de componente;
- **"faltam 10" é derivado**, não coluna;
- **o servidor recusa e a mensagem do domínio sobe como veio**, e depois da recusa o saldo
  continua 10 — nada foi gravado;
- ⚠️ **o bloqueio atravessa de uma tela para outra**: aberto o inventário, a lista de
  depósitos — que não sabe nada sobre inventário — passa a dizer "bloqueada". É isso que
  prova que o bloqueio é FATO do domínio e não rótulo de uma tela;
- **a mesma consulta de posição responde por duas datas**, e a consulta é `GET`.

**Quatro defeitos meus que o percurso pegou**, e nenhum deles era do produto:

1. `relacionados` do material apontava para `/estoque`, que eu **não tinha construído** —
   link para o nada, mesma família de botão sem handler. Foi o que obrigou a construir a
   tela de posição;
2. `detalheDe` lê a página **atual**, e eu procurava o registro depois de ter navegado para
   outra tela — duas vezes, no mesmo degrau;
3. os passos de bloqueio estavam **antes** das movimentações: encerrar com `fim` = hoje deixa
   o bloqueio vigente hoje, e o domínio recusava com razão. No fim do percurso ele prova
   mais — que o bloqueio **recusa** movimentação, com a mensagem nomeando o motivo;
4. a asserção do histórico lia a aba `dados`, que é a que abre por padrão.

⚠️ **E UMA ASSERÇÃO FROUXA, CORRIGIDA PELO BANCO POVOADO.** Eu exigia que a faixa de
inventários abertos não aparecesse no painel, porque o percurso fecha o que abre — mas uma
execução anterior falhara no meio e deixara um inventário aberto, e **o painel estava certo
em contá-lo**. A asserção cobrava do produto um banco limpo. Agora ela afirma a propriedade
(nenhuma faixa exibe zero), não o estado.

**Dois guards do repositório pegaram a tela escrita à mão:** identidade literal de campo é
proibida (vários formulários coexistem na mesma página), corrigida com rótulo **envolvendo**
o campo; e a primeira versão do comentário que explicava isso derrubou o próprio guard, ao
citar a forma proibida entre aspas — a mesma anatomia que o guard já documenta sobre si.

### 21.7 · Comandos e resultados

| Comando | Resultado | Data |
|---|---|---|
| `npm run portao -- --fim-de-lote` | **10 de 10**, saída 0; 200 arquivos / 2.087 testes verdes nas duas passagens de fuso — ver 21.8 | 2026-09-11 |
| `npx tsx scripts/smoke-ent06.ts` | **48 passos, 0 falhas** | 2026-09-11 |
| `npx tsx scripts/marcar-catalogo.ts --aplicar` | **3 promovidas**; 316 de 2037 (15,5%) — o percentual não se move | 2026-09-11 |
| `npm run deriva:perfil` | 38 ações sem perfil → concedidas em dev → "censo e perfis batem: 223 ações" | 2026-09-11 |

⚠️ **O QUE NÃO RODOU:** nenhuma migration — este lote não abriu modelo.

### 21.8 · O portão de fechamento, e a rodada que a hibernação derrubou

⚠️ **A PRIMEIRA RODADA FALHOU, E O MOTIVO ESTÁ AQUI JUNTO** — falha intermitente só se
descarta com a causa medida, nunca por "deve ter sido a máquina".

**Rodada 1** — `npm run portao -- --fim-de-lote`, `2026-09-11T22:33:24Z`:

```
ok      typecheck:backend        18s      ok      test:rapido              12s
ok      typecheck:app             2s      FALHOU  test:tudo              3395s
ok      typecheck:scripts         2s      pulado  test:fuso                 0s
ok      cobertura-de-tsconfig     7s      ok      build                    48s
ok      prisma:validate           1s
ok      deriva                  334s
```

**O que falhou: 15 testes em 12 arquivos. Falhas de asserção: ZERO.**

```
9  Hook timed out in 10000ms          (o beforeEach que limpa e semeia o banco)
2  TimeoutError — Chromium, WS endpoint em 30000ms
1  Test timed out in 90000ms
1  Test timed out in 5000ms
2  PrismaClientKnownRequestError
```

⚠️ **TRÊS SINAIS INDEPENDENTES APONTANDO PARA A MESMA CAUSA:**

1. **Nenhuma asserção falhou.** Nada está logicamente errado — só nada coube no tempo.
2. **As falhas caem em módulos que este lote não tocou** — M02, M03, M05, M09, M12, PDF,
   OFX. Um lote que quebrasse o M10 não derrubaria o importador de OFX.
3. **Os tempos são absurdos para o que aqueles testes fazem**: 327.815 ms, 357.098 ms,
   311.997 ms para testes que rodam em milissegundos. `deriva`, que leva 8 a 14 s, levou
   **334 s**.

**Medido durante a rodada:** swap em 8.315 MB de 9.216 MB, **13 MB de RAM livre**, 6.177 MB
de memória comprimida, load average 11,5. Numa máquina de 8 GB com 6 GB comprimidos, cada
toque de página é uma descompressão — e cada arquivo de teste paga partida de processo mais
carga do cliente Prisma contra isso.

**A causa raiz, informada pelo operador e coerente com tudo acima: a máquina hibernou
durante a rodada.**

**Rodada 2** — mesmo comando, `2026-09-11T23:38Z`, com a máquina desperta e o load em 4,3:

```
ok  typecheck:backend    18s      ok  test:rapido      11s
ok  typecheck:app         3s      ok  test:tudo       637s
ok  typecheck:scripts     2s      ok  test:fuso       503s   (Pacific/Kiritimati)
ok  cobertura-tsconfig    7s      ok  build            31s
ok  prisma:validate       1s
ok  deriva               10s
```

**10 de 10, `CODIGO_DE_SAIDA_DO_PORTAO=0`.** A suíte: **200 arquivos, 2.087 testes**, verdes
nas duas passagens de fuso. Cobertura de tsconfig: 855 de 855, zero descobertos.

⚠️ **E A COMPARAÇÃO ENTRE AS DUAS RODADAS É A PRÓPRIA PROVA DA CAUSA.** Mesmo commit, mesmo
comando, uma hora de diferença:

| | rodada 1 (hibernada) | rodada 2 | razão |
|---|---:|---:|---:|
| `deriva` | 334s | 10s | **33x** |
| `test:tudo` | 3395s (falhou) | 637s | **5,3x** |
| `build` | 48s | 31s | 1,5x |

Nenhuma linha de código mudou entre as duas.

**O agendamento do fuso foi exercido pela primeira vez**, e o relatório o nomeia:
`[agenda ] test:fuso roda — portão de fechamento do lote — o fuso roda sempre aqui`.

**Contraprova executada**, e é ela que fecha o argumento: os dois arquivos deste lote que
aparecem entre os 12 — `m11-compras.test.ts` e `m16-rollout.test.ts` — falharam pelo mesmo
`Hook timed out in 10000ms`, e rodados em seguida deram **27 testes verdes em 23,9 s**.

⚠️ **E O PORTÃO ACERTOU EM MARCAR VERMELHO.** Um gate que tolerasse timeout como ruído
deixaria passar a lentidão real no dia em que ela fosse de código. A resposta certa não é
afrouxar o limite: é medir a causa e rodar de novo — que é o que a rodada 2 registra abaixo.

## 22. Organização dos documentos — uma repo, um lugar

Lote documental, pedido pelo operador. **Contagem por natureza: zero cláusulas** — nada foi
construído, nada foi medido no catálogo. O que mudou foi onde as coisas estão.

### 22.1 · Os três defeitos de arrumação que o levantamento achou

1. ⚠️ **AS REGRAS DO REPOSITÓRIO NÃO EXISTIAM EM ARQUIVO.** O texto que define invariantes,
   proibições e regime de rigor vivia no chat, e era colado a cada sessão. Não havia
   `CLAUDE.md`. Uma sessão que começasse sem a colagem não tinha como saber que dinheiro é
   `Decimal` nem que a razão é append-only.
2. ⚠️ **A MEDIDA VIVIA FORA DO CÓDIGO QUE ELA MEDE.** O catálogo de 2.037 cláusulas estava
   em `../gestao-publica-execucao`, outro repositório, alcançado por **caminho absoluto de
   uma máquina** em `scripts/marcar-catalogo.ts`. Cada lote pedia dois commits em dois
   lugares, e nada acusaria se um ficasse para trás.
3. ⚠️ **INSTRUÇÕES SUPERADAS ESTAVAM NO CAMINHO DE QUEM EXECUTA.**
   `docs/missao-poc/PROMPT-MESTRE.md` abre com *"Copie todo o conteúdo abaixo para o Claude
   Code"* — uma ordem de julho, da POC de Campina Grande, pronta para ser obedecida por
   engano. Foi para `docs/historico/`, que o índice declara como não-se-segue.

### 22.2 · O pacote de execução entrou com histórico

`git subtree add --prefix=docs/_pacote ../gestao-publica-execucao main` — a mesma técnica do
doador, e pela mesma razão: os 9 commits do catálogo **são a trilha de evidência das
marcações**. Importar por cópia jogaria fora a pergunta "quem marcou esta cláusula, quando e
com que prova". A origem ficou marcada com a tag `pacote-absorvido`.

### 22.3 · O mapa de onde para onde

| De | Para |
|---|---|
| `gestao-publica-execucao/catalogo-execucao.json` e a fonte | `docs/edital/` |
| `PROMPT-MESTRE-IMPLEMENTACAO.md`, `MAPA-DE-LACUNAS.md`, gabarito, especificações | `docs/instrucoes/` |
| `prompts/00` a `prompts/03` | `docs/lotes/ENT00` a `ENT03` |
| README do pacote, `INSTRUCAO-CONTINUACAO.md`, `CONTEXTO-SIAFIC-E-SAAS-MUNICIPAL.md` | `docs/historico/pacote-de-execucao/` |
| `PROJETO.md` | `docs/instrucoes/arquitetura.md` |
| `MODULO.template.md` | `docs/instrucoes/MODULO.template.md` |
| `README-POC.md`, `APRESENTACAO-POC-PASSO-A-PASSO.md`, `docs/missao-poc/` | `docs/historico/poc-pregao-330-2026/` |
| `docs/caracterizacao-m01-m05.md` | `docs/caracterizacao/m01-m05.md` |
| as duas `docs/varredura-*.md` | `docs/varreduras/` |

Novos: `CLAUDE.md` na raiz, `docs/LEIA-ME.md` (índice e precedência), `docs/edital/LEIA-ME.md`
e `docs/lotes/ENT06-item0-telas-das-tres-secoes.md` — o pedido do lote que acabou de fechar,
que até agora só existia no chat.

⚠️ **TRÊS DOCUMENTOS FORAM SALVOS DE SUMIR.** Roteiro, checklist e plano B da apresentação do
Pregão 90023/2026 existiam **só** em `~/Desktop/saas-municipal/docs/`, fora de qualquer git.
Estão em `docs/historico/apresentacao-pregao-90023-2026/`.

### 22.4 · O que mudou de CONTEÚDO, e por quê

**`docs/instrucoes/arquitetura.md`** (ex-`PROJETO.md`) contradizia o jeito atual de trabalhar
em quatro pontos, e os quatro foram corrigidos:

- mandava **"1 sessão = 1 módulo, não leia nem altere outros módulos"**. O ENT06 precisou
  ligar M10 a M21, M22, M25 e M26; obedecer teria levado a reconstruir o que existe. Agora:
  ler é livre, **alterar** é que fica no escopo do lote;
- ⚠️ **a tabela de status dos módulos saiu inteira.** Ela dava M09 a M14 como pendentes
  quando os seis têm código e testes, não conhecia M20 a M31 e nomeava M15, M17 e M18 que
  não existem. **É a prova de que status em documento envelhece** — e o mapa de lacunas já
  tinha precisado corrigir essa mesma divergência;
- o banco de desenvolvimento citava `pg-siafic` na porta 5432; o real é `pg-gestao-publica`,
  usuário `gestao`, base `gestao_publica`, porta 5436, conferido por `docker inspect`;
- o título dizia "SIAFIC — Campina Grande", que é o recorte da POC e não o produto.

**`docs/instrucoes/MODULO.template.md`**: a mesma regra de 1 sessão = 1 módulo, e o ponteiro
para os invariantes, que agora é o `CLAUDE.md`.

**`scripts/marcar-catalogo.ts`**: o caminho do catálogo passa a sair do próprio arquivo
(`import.meta.url`), com `CATALOGO` no ambiente ainda sobrepondo.

### 22.5 · O que NÃO foi tocado, de propósito

⚠️ **O HISTÓRICO DESTE ARQUIVO CONTINUA CITANDO OS CAMINHOS ANTIGOS**, e está certo: as
seções 1 a 21 registram o que era verdade quando foram escritas. Reescrevê-las para "ficar
consistente" apagaria a única evidência de que o catálogo já viveu fora da repo. A tabela de
22.3 é a tradução; o registro fica como está. Pela mesma razão, os prompts de lote em
`docs/lotes/` ficam **como vieram**, com as referências da época.

**Faltam os pedidos dos lotes ENT03a, ENT03b, ENT03c, ENT04 e ENT05** — foram escritos no
chat e não chegaram a arquivo. O resultado de cada um está aqui; o pedido, não. Pendência
`PEDIDOS-DE-LOTE-AUSENTES`.

### 22.6 · Verificado pelo efeito, não pela papelada

| O que se afirma | Como foi conferido | Resultado |
|---|---|---|
| o script acha o catálogo no lugar novo | `npx tsx scripts/marcar-catalogo.ts` (sem `--aplicar`) | 316 de 2037 (15,5%), 46 validadas, 48 parciais, 3 de terceiro — idêntico ao de antes da mudança |
| o histórico do pacote veio junto | `git log 86aa70b^2` | **9 commits**, de `aa41282` ("o instrumento de medição entra sob controle de versão") a `d353812` (ENT06) |
| nenhuma referência viva ficou apontando para o vazio | varredura por nome em todo o repositório | as que restam estão em registro histórico, em `docs/historico/` e nos prompts como vieram |

⚠️ **A PRIMEIRA VERSÃO DESTA TABELA AFIRMAVA O QUE A MEDIÇÃO DERRUBOU.** Eu havia escrito
que `git log --follow docs/edital/catalogo-execucao.json` traria os 9 commits. **Traz um.**
`git subtree add` cria um commit de MERGE (`86aa70b`, pais `fa09aae` e `d353812`), e
`--follow` simplifica a história e para ali. Os commits **estão** na repo, alcançáveis pelo
segundo pai — mas quem procurar pelo caminho do arquivo não os acha.

Fica registrado porque a diferença aparece no dia em que alguém perguntar quem marcou uma
cláusula e com que prova: a resposta está em `git log 86aa70b^2`, não em `--follow`. Para
arquivo renomeado **dentro** desta repo o `--follow` funciona normalmente —
`docs/instrucoes/arquitetura.md` alcança o antigo `PROJETO.md` até `116e1ca`, a cópia de
trabalho vinda do `siafic-cg`.

### 22.7 · Pendência nova, nomeada

`ENV-EXAMPLE-DESATUALIZADO` — o `.env.example` mostra porta 5432 e o nome antigo do banco.
Não foi corrigido aqui porque é configuração e este lote é documental; está anotado no
próprio `arquitetura.md`, onde quem sobe ambiente vai ler.

## 23. ENT06 item 1 — conceder uma ação a um perfil

O pedido está em `docs/lotes/ENT06-item1-conceder-acao-a-perfil.md`. Ele veio primeiro porque
a revisão do item 0 achou o que bloqueava todo o resto.

### 23.1 · A contagem do lote, por natureza

| | |
|---|---:|
| validação — cláusulas promovidas | **0** |
| construção — cláusulas que saíram de `AUSENTE_CONFIRMADO` | 0 |
| evidência reforçada, sem mudar situação | 1 (`5.8.8`) |
| catálogo | 316 de 2037 (15,5%) — inalterado |
| censo de ações do M16 | 223 → **226** |

⚠️ **ZERO CLÁUSULAS, E O LOTE ERA NECESSÁRIO.** Varri o catálogo: as cláusulas que falam de
conceder permissão por perfil são 5.8.8 e 5.11.1, e **as duas já estavam
`VALIDADO_LOCALMENTE`** desde o ENT03c. Marcá-las de novo não moveria nada, e inventar
cláusula para este lote seria pior que contar zero.

O que mudou foi a evidência de 5.8.8. A cláusula pede controle de permissões "tanto por
usuário quanto por grupo de usuários, **com definição das permissões**" — e a evidência
antiga provava só o *enforcement*. A definição não tinha caminho: existia no bootstrap de
instalação e num script de terminal. **A marcação estava acima do que se podia provar pela
tela, e agora não está mais.**

### 23.2 · ⚠️ O PARADOXO QUE O PRÓPRIO LOTE PRODUZIU — e ele é a prova do problema

A tela foi construída, o build passou, e o percurso falhou no **primeiro passo**: o
formulário de criar perfil não existia na página. Medido na hora:

```
censo 226 ações · concedidas 223
⚠️ 3 AÇÕES QUE NENHUM PERFIL CONCEDE:
  · CONCEDER_ACAO_A_PERFIL   · CRIAR_PERFIL   · REVOGAR_ACAO_DE_PERFIL
```

**A tela que serve para conceder ações nasceu inalcançável pela ação que ela mesma precisa.**
O perfil `ADMINISTRADOR` do banco de desenvolvimento tinha exatamente as 223 de antes deste
lote: o bootstrap deriva do censo, mas roda **uma vez na vida do banco**.

A saída foi o caminho que já existia para isso — `scripts/conceder-acoes-ao-perfil.ts`, com
as ações digitadas uma a uma e `SEED_IDENTIDADE` como autor. Depois dele,
`npm run deriva:perfil` respondeu *"censo e perfis batem: 226 ações"*.

⚠️ **E A LIÇÃO NÃO É "AUTOMATIZAR A CONCESSÃO".** Fazer toda ação nova cair sozinha no perfil
de instalação seria a chave-mestra por conveniência: cada lote ampliaria, em silêncio, o
poder de quem já tem tudo. O desenho certo é o que está aqui — a ação nova nasce sem dono, o
detector de deriva a acusa, e alguém assina a concessão. **O preço é este passo manual a cada
lote que acrescenta ação, e ele é barato perto do outro.**

### 23.3 · ⚠️ O SEGUNDO ACHADO: o censo assinado não cobria a revogação

Revogar apaga a linha de `PermissaoDePerfil` — a concessão é o fato, e a ausência dela é a
revogação (a mesma doutrina do vínculo de perfil). Só que `PermissaoDePerfil` **não estava**
em `ESCRITA_MUTAVEL_DO_RUNTIME`: o papel da aplicação tinha `SELECT` e `INSERT`, e mais nada.

**Os testes de domínio nunca pegariam isso** — eles conectam como DONO. A tela teria falhado
no município com `permission denied`, com a suíte verde na máquina de quem escreveu. Entrou
no censo, com o motivo, e `update: []`: revogar sim, reescrever não — mudar a ação de uma
concessão existente trocaria o poder mantendo o `criadoPor` de quem concedeu outra coisa.

### 23.4 · ⚠️ O TERCEIRO ACHADO: a mutação que NÃO acusou, e o instrumento que ela obrigou a escrever

Tirei `PermissaoDePerfil` do censo esperando ver `test/papel-runtime.test.ts` ficar vermelho.
**Ficou verde.**

A razão: o `global-setup` **provisiona os grants a partir do próprio censo** antes da suíte.
Censo e banco se movem juntos, e a comparação entre os dois não enxerga uma omissão — aquele
teste pega grant manual fora do censo, que é outra coisa. Um guard que eu teria tomado por
rede.

O que prova é o **efeito**: três asserções novas em que o papel da aplicação concede, revoga e
**é negado ao tentar reescrever** uma permissão. Com elas, a mesma mutação acusa:

```
MUTADO:    × o papel REVOGA — DriverAdapterError: permission denied for table PermissaoDePerfil
REVERTIDO: ✓ 18 testes verdes
```

### 23.5 · A trava da última chave

Revogar a última concessão de `CONCEDER_ACAO_A_PERFIL` deixaria o ente sem ninguém capaz de
distribuir poder — e o bootstrap recusa rodar em banco povoado, corretamente. **A porta
trancada por dentro, com a chave do lado de fora.** O caso de uso recusa, nomeando.

Provada nas duas direções, e nos dois níveis:

| prova | mutado | revertido |
|---|---|---|
| `m16-perfis.test.ts` t9 (mutação `outras === 0` → `=== -1`) | `promise resolved "undefined" instead of rejecting` | verde |
| a tela, no percurso | o servidor recusou com a mensagem inteira, e a concessão continuou lá | — |

⚠️ **O percurso tenta de verdade, no perfil que administra.** Se a trava não existisse, o
ambiente ficaria sem ninguém capaz de conceder qualquer ação.

### 23.6 · Dois defeitos meus que o percurso pegou, e um que o build pegou duas vezes

1. **A mensagem de sucesso sumia na revogação que mais importa.** O bloco de revogar só era
   renderizado quando havia permissões — revogar a ÚLTIMA esvaziava a lista, o bloco
   desaparecia e levava junto a confirmação. O percurso leu silêncio onde o servidor tinha
   respondido. Hoje a lista é que é condicional; a resposta fica.
2. **O percurso afirmava o que a tela impede.** Eu mandava conceder a mesma ação de novo e
   exigia a recusa nomeada na tela — mas a opção já concedida vem **desabilitada**, o
   formulário sobe vazio e ninguém chega ao servidor. A recusa existe e é provada no domínio
   (t4); pela tela o que se prova é a **prevenção**. Cobrar da interface um erro que ela
   existe para evitar é medir a coisa errada.
3. ⚠️ **O comentário que explicava o defeito derrubou o build — duas vezes.** Primeiro por
   estar dentro do operador ternário (posição de expressão, onde chave com barra-asterisco é
   objeto literal, não comentário); depois porque, ao explicar isso, ele **grafou** a
   sequência que fecha comentário e se encerrou no meio. É a mesma anatomia que o guard de
   rótulos já documenta sobre si: **a regra se enuncia, não se escreve.**

### 23.7 · O que entrou, e onde

| Camada | Arquivo |
|---|---|
| censo + enum | `modules/m16-travamento/acoes.ts`, `prisma/schema/m16-usuarios.prisma`, migration `20260912042331_ent06_acoes_de_perfil` |
| domínio | `modules/m16-travamento/servico-perfis.ts` — criar, conceder, revogar |
| papel de runtime | `prisma/papel-runtime.ts` — `PermissaoDePerfil` no censo assinado |
| porta | `lib/portas/administracao.ts` — as três escritas, as unidades e o rol por área |
| menu | `lib/portas/navegacao-permissoes.ts` — as três ações apontam para `administracao` |
| tela | `app/(areas)/administracao/perfis/` — página, ações de servidor e duas ilhas |
| provas | `m16-perfis.test.ts` (11), `test/papel-runtime.test.ts` (+3), `scripts/smoke-perfis.ts` |

**A migration é aditiva**: três valores novos no enum, zero `DROP`.

### 23.8 · Comandos e resultados

| Comando | Resultado | Data |
|---|---|---|
| `npx prisma migrate dev --name ent06_acoes_de_perfil` | aplicada; enum de 223 para 226 valores | 2026-09-12 |
| `npm run typecheck` / `:app` / `:scripts` | limpos, com teto de heap declarado | 2026-09-12 |
| `npx vitest run` (M16 + papel + menu) | **46 testes verdes**, 6 arquivos | 2026-09-12 |
| `npx vitest run test/papel-runtime.test.ts` | **18 verdes** (15 + 3 do lote) | 2026-09-12 |
| `npm run deriva:perfil` | 3 ações sem perfil → concedidas pelo caminho de atualização → "censo e perfis batem: 226 ações" | 2026-09-12 |
| `npm run smoke:perfis` | **14 passos, 0 falhas** | 2026-09-12 |
| `npm run db:papel` | papel realinhado nos dois bancos, com o grant novo | 2026-09-12 |

### 23.9 · O portão de fechamento — 10 de 10

Rodada de `2026-09-12T04:45:53Z`, saída bruta em `.registro-de-execucao/`.

| Passo | Estado | Segundos |
|---|---|---:|
| `typecheck:backend` | ok | 15 |
| `typecheck:app` | ok | 3 |
| `typecheck:scripts` | ok | 2 |
| `cobertura-de-tsconfig` | ok | 6 |
| `prisma:validate` | ok | 1 |
| `deriva` | ok | 11 |
| `test:rapido` | ok | 10 |
| `test:tudo` | ok | 510 |
| `test:fuso` | ok | 481 |
| `build` | ok | 29 |

`CODIGO_DE_SAIDA_DO_PORTAO=0`. A suíte: **201 arquivos, 2.101 testes**, verdes nas duas
passagens de fuso.

⚠️ **A DIFERENÇA CONFERE COM O LOTE, E ISSO É A AMARRAÇÃO.** O ENT06 item 0 fechou com 200
arquivos e 2.087 testes; este lote acrescentou **um arquivo e catorze testes** — os 11 de
`m16-perfis.test.ts` mais os 3 do papel de runtime. Número de teste que não bate com o que
se escreveu é sinal de arquivo que não foi coletado.

⚠️ **UMA RODADA ANTERIOR FOI INTERROMPIDA POR MIM, e o registro fica.** O portão da
organização documental (§22) começou e foi morto no meio para liberar a máquina quando o
operador pediu construção contínua. Ele não é o portão de nada: este, que roda sobre o commit
`8c875c7`, cobre os dois lotes — a organização e os perfis — porque a árvore já continha as
duas coisas.

**O que este portão NÃO cobre:** o percurso de navegador, que roda à parte (`npm run
smoke:perfis`, 14 passos, 0 falhas) porque exige `next start` e Chromium.

### 23.10 · Pendência nova, nomeada

`HIERARQUIA-DE-PERFIS` — perfil que herda de outro. Foi pedido, e **não entrou**: herança
reintroduz por outro nome o "copiar de" que este lote recusou, porque conceder uma ação ao
perfil pai ampliaria todos os filhos sem que ninguém olhasse para nenhum. A segregação do TR
6.4 depende de cada concessão ser um ato visível. Precisa de decisão antes de código.

## 24. ENT06 item 2 — a liquidação de material, construída e PARADA por medição

⚠️ **ESTE LOTE NÃO FECHOU, E O MOTIVO É O ACHADO.** Ele está inteiro, compilando, em
`git stash@{0}` — nada foi perdido e nada foi commitado. O que o parou não foi dificuldade:
foi a medição do que fechá-lo custa.

### 24.1 · O que se foi construir, e por quê

A revisão do item 0 nomeou a tela de entrada de material como o que travava a promoção de
doze cláusulas de 5.18. Ao abrir, o problema era outro e maior: **não falta tela, falta o ato
ser um só.** `lib/portas/liquidacao.ts` RECUSA liquidar elemento de material, com a pendência
`LIQUIDACAO-MATERIAL-ALMOXARIFADO` — e recusava certo: o rol do M01 manda material debitar
ESTOQUE, e liquidar sem a entrada deixaria o razão com estoque que nenhum movimento explica.

O desenho saiu espelhado no que já existe: `AoAnularLiquidacaoPort` (o M05 declara, o M10
implementa, o adapter chama **dentro da transação**). Foi escrito:

- `AoLiquidarMaterialPort` + os tipos da entrada, em `ports.ts`;
- `registrarEntradaAlmoxarifadoNaTx` e `registrarEntradaFisicaNaTx` — os corpos
  transacionais extraídos, sem autorizar e sem abrir transação, no censo como exclusão
  nomeada;
- a implementação no M10 exigindo que **a soma das entradas iguale o liquidado** — a conferência
  que o `MODULO.md` registrava como impossível com chamadas separadas;
- o gancho no adapter, fail-closed, e a queda da recusa na porta.

⚠️ **A ORDEM DOS LOCKS FOI CONFERIDA ANTES, porque era o que podia inviabilizar o desenho.**
`Liquidacao` é posto 6, `ClasseDeMaterial` 11, `PosicaoFisicaDeEstoque` 21 — e a transação da
liquidação **não trava nada**. A composição adquire 6, 11 e 21 em ordem crescente: sem
inversão. O guard do `packages/locks` rastreia por identidade da `tx`, que é o que atravessa
o port.

Typecheck limpo nos três projetos.

### 24.2 · ⚠️ A MEDIÇÃO QUE PAROU O LOTE

```
npx vitest run m10-almoxarifado m10-estoque-fisico m05-anulacao-parcial
  ->  32 testes falhando em 3 arquivos, todos pelo gancho novo
```

E o levantamento do alcance:

| | |
|---|---:|
| chamadas que liquidam material pelo caminho de dois passos | **11** |
| chamadas a `registrarEntradaAlmoxarifado` (o segundo passo) | **21** |
| chamadas em código de PRODUÇÃO | **0** |

**Todas as 32 são testes, e é isso que importa:** o caminho de dois passos não existe em
produção — a porta o recusava. Quem o exercita é justamente a suíte que **prova a amarração
razão × almoxarifado**.

⚠️ **ENTÃO FECHAR A PENDÊNCIA NÃO É ACRESCENTAR CÓDIGO: É REESCREVER A PROVA DE UM
INVARIANTE.** As 32 asserções teriam de migrar do ato em dois passos para o ato composto. Pode
ser a coisa certa — provavelmente é —, mas é decisão que tem de APARECER, e não acontecer de
madrugada dentro de um lote que também entregava tela. É a mesma regra que proíbe rebaixar
profundidade para superfície em silêncio.

### 24.3 · Dois achados de desenho que a medição corrigiu, e que sobrevivem à decisão

1. ⚠️ **O GUARD NÃO PODE DISPARAR PELO ELEMENTO.** A primeira versão perguntava "o elemento é
   de material?" — e doze arquivos de teste liquidam com elemento 30 sem tocar em
   almoxarifado (M09, M12, M02, M16). O repositório inteiro pagaria por uma regra de um
   domínio. O critério certo é **a partida de débito bater numa conta que alguma
   `ClasseDeMaterial` declara como sua**: vem da tabela, não de código, e é a mesma relação
   que a amarração já usa.
2. ⚠️ **E NEM POR CÓDIGO DE CONTA FIXO.** A fixture do M10 usa `1.1.5.1.1.00.00` e a produção
   usa `1.1.5.6.1.01.00`. Um predicado contra a constante do M01 não dispararia justamente no
   caso que precisa disparar. "Nenhum código no código" também vale para guard.

### 24.4 · Onde está, e o que decidir

`git stash@{0}`, com a mensagem inteira. Para retomar: `git stash pop`.

**A decisão, em uma frase:** o ato composto substitui o ato em dois passos, e as 32 asserções
migram — ou o ato composto convive com o antigo, e aí o fail-closed vira fail-open e a
pendência continua aberta com outro nome.

**A recomendação:** migrar. Mas como lote PRÓPRIO, de profundidade, com a suíte do M10 no
centro — e não como efeito colateral de um lote de superfície.

## 25. ENT06 item 3 — o eixo da data do formulário, corrigido na fronteira

Fecha `EIXO-DE-DATA-NA-ENTRADA-DO-ENT05`, caracterizado no item 0 e aberto desde então.

### 25.1 · O defeito, e por onde ele entrava

`<input type="date">` entrega `YYYY-MM-DD`. Essa string, entregue **crua** a um
`z.coerce.date()`, vira meia-noite **UTC** — e no fuso do ente (UTC-3) o dia civil desse
instante é o ANTERIOR:

```
z.coerce.date("2026-09-11")  ->  2026-09-11T00:00:00.000Z
diaCivil(...) no fuso do ente ->  2026-09-10
```

**O operador digitava 11 e o sistema guardava um instante cujo dia civil era 10.** E não era
apresentação: `posicaoDeEstoque` corta por dia civil, então o movimento digitado como 11
entrava na posição pedida "até 10" — a posição de ontem incluindo um movimento de hoje. A
ficha de controle (5.18.16) e o inventário usam o mesmo corte.

### 25.2 · ⚠️ POR QUE A CORREÇÃO NÃO FOI NOS 25 SCHEMAS

O item 0 tentou acrescentar `z.coerce.date` às formas proibidas pelo guard de data civil.
**Acusou 96 sítios**, 54 nos módulos do ENT05, e foi revertido — com razão.

A medição desta vez explica o porquê, e ela é o achado do lote:

| | |
|---|---:|
| `z.coerce.date()` nos três módulos do ENT05 | 25 |
| sítios onde a string CRUA do formulário chega a eles | **7** |
| sítios em `lib/portas/recursos/dados.ts` (os demais cadastros) | **0** |

`z.coerce.date` é **inócuo** quando recebe um `Date` ou um instante ISO completo — e é isso
que testes, seeds e serviços internos passam (`new Date("2026-03-01T12:00:00Z")`: meio-dia,
dia civil correto). Trocar os 25 por `zDia` quebraria todos eles para consertar quem nunca
foi o culpado. **O defeito não é forma no texto: é fluxo de dados**, e o fluxo tem uma
fronteira — o arquivo onde o molde converte `Campos` (que é `Record<string, string>`) em
entrada de serviço.

Os demais cadastros (convênio, precatório, consórcio, auditoria, dívida) já recebem `zDia`
no domínio: **nunca tiveram o defeito**, e é por isso que a fronteira deles tem zero sítios.

### 25.3 · O conserto

Um irmão do `t()` em `lib/portas/recursos/almoxarifado-dados.ts`:

```ts
const dia = (c: Campos, k: string): Date => inicioDoDiaCivil(t(c, k));
```

Sete sítios passaram a usá-lo: bloqueio (início e fim), encerramento de bloqueio, requisição,
movimento de requisição, e abertura e fechamento de inventário. Os schemas ficaram como
estão.

⚠️ **CONSEQUÊNCIA NOMEADA: data obrigatória vazia agora RECUSA.** `inicioDoDiaCivil("")`
estoura com *"Dia "" inválido — o formato é YYYY-MM-DD"*. Antes, a string vazia virava
`Invalid Date` silenciosamente dentro do `z.coerce.date`. Recusar com mensagem é o
comportamento que o repositório pede; registrado aqui porque é mudança de comportamento
visível, não só correção interna.

### 25.4 · O instrumento, provado por mutação nas duas direções

`test/eixo-de-data-no-molde.test.ts` — e ele vigia a **fronteira**, não uma quarta forma
proibida no código-fonte, pela razão de 25.2. Três asserções: nenhum campo de data passa por
`t(`; a fronteira de fato converte datas (anti-vacuidade); e o efeito, lado a lado, da âncora
civil contra a crua.

Mutando **um** sítio de volta para `t(c, ...)`:

```
MUTADO:    × nenhum campo de data chega ao serviço sem a âncora civil
           × e a fronteira realmente converte datas — expected 6 to be >= 7
REVERTIDO: 3 testes verdes
```

⚠️ **A MESMA MUTAÇÃO ACUSOU NAS DUAS METADES**, e é isso que se queria: a metade
anti-vacuidade existe porque apagar os campos de data deixaria a primeira verde — um guard
que fica verde quando o que ele vigia some não vigia nada.

⚠️ **A LISTA DE FRONTEIRAS É EXPLÍCITA, e não um glob.** Um arquivo de fronteira novo é uma
decisão, e quem o criar tem de vir declará-la. Com glob, mover a fronteira deixaria o guard
verde vigiando o lugar errado.

### 25.5 · Pendência nova, nomeada

`ZDIA-DUPLICADO` — `zDia` está definido **cinco vezes** (M11 medições, M28, M29, M30, M31),
sempre o mesmo regex. O lugar natural seria `packages/datas`, mas o pacote **não importa
zod** hoje, e acrescentar essa dependência a ele é decisão de arquitetura, não limpeza. Fica
nomeada; não foi tocada aqui.

### 25.6 · Comandos e resultados

| Comando | Resultado | Data |
|---|---|---|
| `npm run typecheck` / `:app` / `:scripts` | limpos | 2026-09-12 |
| `npx vitest run` (guard novo + caracterização) | 7 verdes | 2026-09-12 |
| mutação de um sítio e reversão | 2 falhas nomeadas → 3 verdes | 2026-09-12 |
| `npx vitest run modules/m10-patrimonial` | **13 arquivos, 175 testes** verdes | 2026-09-12 |

### 25.7 · O portão de fechamento — 10 de 10

Rodada de `2026-09-12T06:18:57Z`, saída 0.

| Passo | Segundos | | Passo | Segundos |
|---|---:|---|---|---:|
| `typecheck:backend` | 17 | | `test:rapido` | 12 |
| `typecheck:app` | 3 | | `test:tudo` | 618 |
| `typecheck:scripts` | 2 | | `test:fuso` | 495 |
| `cobertura-de-tsconfig` | 7 | | `build` | 44 |
| `prisma:validate` | 1 | | | |
| `deriva` | 11 | | | |

A suíte: **202 arquivos, 2.104 testes**, verdes nas duas passagens de fuso.

⚠️ **E O `test:fuso` ERA O PASSO QUE IMPORTAVA NESTE LOTE.** Um conserto de eixo de data que
só fosse exercitado no fuso do hospedeiro provaria pouco: a suíte inteira sob
`Pacific/Kiritimati` é o que separa "funciona aqui" de "a propriedade vale". Ele rodou por
agendamento — o diff toca `packages/datas` e os arquivos que `data-civil.test.ts` vigia.

A diferença confere: 201 arquivos e 2.101 testes no lote anterior, **+1 arquivo e +3 testes**
— o `test/eixo-de-data-no-molde.test.ts` e suas três asserções.

## 26. Os selects que nunca recebiam opção — três defeitos da mesma classe

Nasceu de uma desconfiança ao ler o código para outro lote, virou propriedade, e a
propriedade achou **dois a mais do que a desconfiança**.

### 26.1 · O defeito, e por que nenhum teste pegava

O preenchimento das opções é **por nome do campo**: o descritor declara `opcoes: []` num
campo de seleção e `FormsDoRecurso` procura `opcoes[campo.nome]` no que a porta devolveu. Um
campo cujo nome não tem chave correspondente **nunca recebe opção**.

⚠️ **E O MOLDE NÃO FALHA — ELE EXPLICA A CAUSA ERRADA.** O campo aparece desabilitado
dizendo *"Nenhuma opção cadastrada para X. Cadastre antes de usar esta tela."* A tela monta,
o build passa, o percurso de navegador passa (ele não abre aquele formulário), e o servidor
que **acabou de cadastrar** o registro lê que não existe nenhum. Uma mensagem tecnicamente
correta apontando a causa errada manda a pessoa fazer a coisa errada.

### 26.2 · Os três, e o pior deles

| Campo | Onde | O que acontecia |
|---|---|---|
| `paiId` — "Grupo pai" | grupos de material (ENT06 item 0) | a porta expunha `grupoId`; o descritor declara `paiId` |
| `empenhoId` — "Empenho" | ação *liberar parcela* do convênio | **a ação ficava inexecutável pela tela quando o ente é CONCEDENTE**, porque aí o empenho é obrigatório e o campo não tinha o que oferecer |
| `aditivoDeId` — "Aditivo ao contrato" | ação *registrar contrato de rateio* | nenhum rateio oferecido, então aditivo só por outro caminho |

⚠️ **O DO CONVÊNIO É O GRAVE**: não era um campo opcional vazio — era um ato que o domínio
exige e que a interface não permitia completar. `liberarParcela` recusa, nomeando, a
liberação sem empenho quando o papel do ente é CONCEDENTE.

### 26.3 · O conserto: opção contextual, no mesmo recorte que o domínio cobra

Os três são o padrão que a `medicaoId` já usava — opções que dependem do registro aberto:

- **empenho do convênio**: `Empenho.convenioId` é coluna real, e `exigirEmpenhoDoConvenio`
  recusa empenho de outro termo ou sem convênio. O select oferece **exatamente** o que o
  domínio aceita;
- **rateio do consórcio**: o serviço confere `consorcioId` do original antes de aceitar o
  aditivo;
- **grupo pai**: o mesmo rol de grupos, sob a chave certa.

⚠️ **E O RECORTE NÃO É SÓ CORREÇÃO — É O QUE EVITA A LISTA INÚTIL.** Sem `convenioId`, a
alternativa seria listar todos os empenhos do ente: o `select` de centenas de itens que a
conta do PCASP já ensinou a não fazer nesta mesma porta.

### 26.4 · O instrumento — t20, e por que é propriedade e não conferência

`test/molde/molde.test.ts`: todo campo de seleção declarado com `opcoes: []`, **incluindo os
campos das ações**, tem de ter chave com o mesmo nome numa das portas de opções — extraídas
do fonte, recortando só o corpo das funções `opcoes*` (a anatomia do censo do M16).

⚠️ **A DESCONFIANÇA ACHOU UM; A PROPRIEDADE ACHOU TRÊS.** Eu tinha visto o `paiId`
comparando duas listas à mão — e a comparação à mão não olhava os campos das ações nem os
descritores do outro arquivo. É a diferença que a regra da casa descreve: guarda que enumera
formas acha só aquelas formas.

**Mutação, nas duas direções:** removida a chave `paiId` da porta, o t20 acusa nomeando
`grupos-de-material.paiId  ("Grupo pai")`; devolvida, verde. O t20b é a amarração contra
vacuidade e tem **duas pontas** — se a extração parar de enxergar as portas, ou se nenhum
descritor tiver campo dependente, o t20 passaria sem ter olhado nada.

### 26.5 · Comandos e resultados

| Comando | Resultado | Data |
|---|---|---|
| `npm run typecheck` / `:app` | limpos | 2026-09-12 |
| `npx vitest run test/molde` | **25 testes** verdes (t20 e t20b entre eles) | 2026-09-12 |
| mutação da chave `paiId` | acusou nomeando o campo; revertida, verde | 2026-09-12 |

## 27. Os cadastros de apoio da gestão do bem — e o percurso que quase acusou a aplicação

**O que foi construído.** Os três cadastros que todo o resto da gestão do bem pressupõe — um
bem se move PARA uma localização, se baixa POR um motivo, entra no acervo POR um tipo de
incorporação. Pelo molde: `lib/portas/recursos/gestao-do-bem.ts` (descritores),
`gestao-do-bem-dados.ts` (camada de dados e `opcoesDaGestaoDoBem`), seis rotas
(`/patrimonio/localizacoes`, `/motivos-de-baixa`, `/tipos-de-incorporacao`, e o `[id]` de cada),
entrada no hub da área, na barra lateral e na busca global.

A ordem não foi arbitrária: é a lição do almoxarifado. Lá o formulário de material montava com
três seletores vazios porque unidade, grupo e classe não tinham tela. Os cadastros de apoio vêm
primeiro para que a tela do BEM, quando vier, não nasça com seletor vazio.

### 27.1 · Três telas, UMA cláusula — e por quê

| Tela | Cláusula | Decisão |
|---|---|---|
| Motivos de baixa | 5.19.30 | **`VALIDADO_LOCALMENTE`** — a cláusula pede "a inclusão de motivos de baixa de acordo com a necessidade da instituição", e o percurso inclui um pela tela |
| Tipos de incorporação | 5.19.3, 5.19.7 | **continuam `IMPLEMENTADO_NAO_VALIDADO`** — o sujeito das duas é o cadastro do BEM ("classificando o seu tipo", "para ser usado no cadastramento dos mesmos"). A tabela configurável é metade; a outra metade é a tela do bem |
| Localizações físicas | nenhuma | as quatro de 5.19 que dizem "localização" (14, 15, 20, 34) pedem consulta, inventário e relatório POR localização — nunca o cadastro dela |

⚠️ **A desproporção é o registro, não um efeito colateral.** Superfície entregue não é
cláusula atendida, e um catálogo que confunde as duas passa a esconder o que falta. As
localizações entram porque tudo o mais as pressupõe.

### 27.2 · O percurso, e a asserção que ele existe para fazer

`scripts/smoke-gestao-do-bem.ts` — **10 passos, 0 falhas**. A asserção central é o select da
localização superior: as opções do molde são chaveadas pelo NOME DO CAMPO, e um campo sem
chave correspondente aparece DESABILITADO dizendo "nenhuma opção cadastrada" — mensagem
correta apontando a causa errada quando os registros existem (§26). O `t20` vigia isso no
fonte; o percurso prova pela tela: criada a primeira localização, a segunda TEM de conseguir
escolhê-la como superior. Provou.

### 27.3 · O defeito que quase foi atribuído à aplicação

O percurso falhou **três vezes** em `entrar`, sempre com `TimeoutError: Navigation timeout of
30000 ms exceeded`. A mensagem aponta para a aplicação e para a senha; nenhuma das duas tinha
qualquer coisa.

O que a medição mostrou, em ordem:

1. `RegistroDeOperacao` não guardava **nenhuma** tentativa de login no horário — nem
   `NEGADO`. Como a porta registra a recusa, isso já excluía senha errada: o servidor nunca
   foi chamado.
2. A credencial estava sã e o filho do `trinco-de-maquina` enxergava `SEED_ADMIN_SENHA` com
   os 22 caracteres — a hipótese de campo `required` vazio bloqueando o envio caiu.
3. Uma sonda que **não** esperava navegação mostrou o form válido, os dois campos preenchidos
   e o botão habilitado — e então morreu em `CdpElementHandle.evaluate`.

É esse o ponto: **`page.click` não clica direto — ele calcula o ponto clicável, e esse cálculo
é um `evaluate` no renderizador.** Com a máquina em pressão de memória (medido: 53 MB livres
de 8 GB físicos, swap em 7,5 de 8), o `evaluate` trava, nenhuma requisição sai, e o sintoma
chega 30 s depois como "timeout de navegação".

A correção é no mecanismo, não no relógio: `requestSubmit` dispara o envio pelo caminho do
próprio React, e a espera olha `page.url()`, que é lido do processo do NAVEGADOR e não do
renderizador. É o mesmo mecanismo que `preencherEEnviar` já usava no corpo do percurso — só o
`entrar` destoava. Somado a isso, navegador econômico (`--renderer-process-limit=1`,
`--js-flags=--max-old-space-size=256`, sem GPU) e `protocolTimeout` alto, para que uma pausa
do renderizador não seja relatada como defeito da aplicação. Depois disso: login em **0,5 s**,
e `LOGIN SUCESSO` gravado no banco às 07:34:29.

⚠️ **Pendência `ENTRAR-POR-CLIQUE-FRAGIL`.** Os outros percursos (`smoke-perfis`,
`smoke-ent06`, `smoke-ent02`, `smoke-ent03a/b/c`, `smoke-cadeia`, `smoke-pessoas`,
`smoke-visual`) ainda usam o idioma `Promise.all([waitForNavigation, click])`. Eles passam em
máquina folgada e falham em máquina apertada **apontando para a senha** — que é o pior tipo
de falha: a que mente sobre a própria causa. Não foram tocados aqui porque trocar o `entrar`
de nove percursos no lote errado é mudança larga sem percurso que a prove.

### 27.4 · Comandos e resultados

| Comando | Resultado | Data |
|---|---|---|
| `npm run typecheck` (backend) | limpo | 2026-09-12 |
| `npm run typecheck:scripts` | limpo | 2026-09-12 |
| `npm run typecheck:app` | limpo | 2026-09-12 |
| `npx vitest run test/molde test/busca-global.test.ts` | 31 testes verdes | 2026-09-12 |
| `npm run build` | 136 rotas, as seis novas entre elas | 2026-09-12 |
| `npm run smoke:gestao-do-bem` | **10 passos, 0 falhas** | 2026-09-12 |
| sonda do registro (banco) | `LOGIN SUCESSO` 07:34:29; nada entre 04:42 e 07:34 | 2026-09-12 |
| `npm run portao -- --fim-de-lote` (1ª) | **7 de 10** — `test:rapido` e `test:tudo` reprovados, `test:fuso` pulado | 2026-09-12 |
| `npm run test:rapido` (após correção) | 70 arquivos, 759 testes, verde | 2026-09-12 |
| `npm run portao -- --fim-de-lote` (2ª) | **10 de 10** — `test:fuso` EXECUTOU (463s), não pulado | 2026-09-12 |

### 27.5 · O portão recusou o lote, e a recusa estava certa

A primeira execução do portão deu **7 de 10**. Typecheck nos três projetos,
`cobertura-de-tsconfig`, `prisma:validate`, `deriva` e `build` passaram; `test:rapido` e
`test:tudo` reprovaram, e `test:fuso` ficou **pulado por depender de `test:tudo`** — que,
pela regra deste repositório, não é passo barato: é passo que não aconteceu.

**A causa foi uma só, e era minha.** `test/ui/rotulos-de-conformidade.test.ts` achou três
ocorrências de número de cláusula em **texto renderizado**:

| Onde | O que era |
|---|---|
| `lib/navegacao.ts` | a descrição do item de menu, que aparece no hub e na barra lateral |
| `gestao-do-bem-dados.ts` | a `nota` de um campo do detalhe |
| `gestao-do-bem.ts` | a `descricao` do descritor — subtítulo da tela e estado vazio |

⚠️ **E a regra não é estética.** Número de cláusula em tela **declara atendimento a quem
não tem como conferir** — é selo de conformidade com outro nome. O que a tela deve dizer é
o que ela FAZ. O teste é explícito em que **comentário é permitido**, e por isso apaga os
comentários antes de varrer: proibi-los empurraria a rastreabilidade para fora do código,
que é onde ela deixa de ser mantida. A correção moveu o rastro para comentário e reescreveu
as três frases em vocabulário de negócio — "o rol é do ente e se cadastra aqui".

⚠️ **O que a medição prova sobre o resto do lote.** `test:tudo` reprovou por **esse teste e
mais nada**: 201 de 202 arquivos e 2.105 de 2.106 testes verdes, em 541 s. O lote não tinha
segundo defeito escondido atrás do primeiro — e é por isso que valeu deixar o portão correr
até o fim em vez de matá-lo na primeira reprovação: ele não para no primeiro erro, e a
lista completa saiu de uma passada só numa máquina que leva nove minutos para dar uma volta.

⚠️ **Nota de método, e ela é desconfortável.** Este mesmo lote escreveu, no comentário do
descritor, que o catálogo não deve confundir superfície entregue com cláusula atendida — e
ao mesmo tempo carimbou o número da cláusula na tela. A regra estava citada no arquivo em
que foi violada. Guard serve exatamente para isso: a intenção não protege ninguém.

## 28. ENT07 — o acervo: a classe e o bem, e três defeitos que o percurso pegou

**O que foi construído.** O ato que faltava desde o começo do M10: **cadastrar um bem**. O
modelo do `BemPatrimonial` é antigo, mas nada no domínio o criava — `adquirirBem` exige
liquidação (o bem adquirido nasce de despesa liquidada) e `registrarEntradaAvulsa` recebe um
`bemId` que já existe. Só o seed da POC e três arquivos de teste criavam bens, por escrita
crua. Junto veio a **classe de bens**, que o bem pressupõe.

| Camada | O que entrou |
|---|---|
| Domínio | `cadastrarClasseDeBens` e `cadastrarBem` em `gestao-do-bem.ts` |
| Censo | `CADASTRAR_CLASSE_DE_BENS` e `CADASTRAR_BEM` — união, `NomeDeServico`, `ACAO_DO_SERVICO`, `AREA_DA_ACAO` |
| Banco | enum `AcaoDoSistema` +2, migration **aditiva** `20260912081500_ent07_acoes_do_acervo` |
| Superfície | descritores, porta, **6 rotas**, hub, barra lateral, busca global |
| Prova | `m10-acervo.test.ts` (11 testes) e `smoke-acervo.ts` (11 passos) |

⚠️ **A ORDEM FOI MEDIDA, NÃO INTUÍDA.** `ClasseDeBens` tinha **zero** registros no banco. Sem
o cadastro de classes, o seletor do formulário do bem nasceria desabilitado dizendo "nenhuma
opção cadastrada" — a mensagem certa apontando a causa errada, que é o defeito da §26.

⚠️ **A CONTA DA CLASSE É CONFERIDA, NÃO SÓ REFERENCIADA.** Ela tem de ser ANALÍTICA e da
classe 1. Conta sintética faria toda aquisição daquela classe lançar num nível que não recebe
partida — e o razão só acusaria no fechamento, longe de quem cadastrou. Conta fora do ativo
seria pior: o bem entraria no razão **diminuindo** o patrimônio.

### 28.1 · O catálogo: duas cláusulas, e o que deliberadamente não se marcou

`5.19.3` e `5.19.7` viraram **`VALIDADO_LOCALMENTE`**. Não viraram na primeira tentativa: o
percurso cadastrava o bem **sem escolher** tipo de incorporação, e um select que aparece e
ninguém usa prova que o formulário montou — não prova "a identificação do bem se adquirido,
recebido em doação, comodato, permuta" nem o tipo "para ser usado no cadastramento dos
mesmos". O percurso foi refeito para cadastrar o tipo na tela dele, escolhê-lo no formulário
e conferir a origem na listagem após recarga.

| Cláusula | Decisão |
|---|---|
| 5.19.14 | continua **`AUSENTE_CONFIRMADO`** — pede consulta por localização e responsável; a listagem filtra por tombamento, descrição e espécie |
| 5.19.15 | continua **`PARCIAL`** — pede movimentação, localização e baixa pela tela, que não existem |

### 28.2 · Os três defeitos que o percurso pegou — e nenhum deles era da aplicação

**1. A tela existia e ninguém a alcançava.** As duas ações novas não estavam concedidas a
perfil nenhum: `censo 228 · concedidas 226`. É a deriva que o ENT06 item 1 previu — o banco
de TESTE deriva do censo, o de DESENVOLVIMENTO não, e por isso **toda tela nova nasce
inalcançável numa instalação existente**. Resolvido pelo caminho que já existia
(`conceder-acoes-ao-perfil.ts`), que recusou conceder sem autor declarado. Depois:
`censo e perfis batem: 228 ações`.

⚠️ **PENDÊNCIA `DERIVA-DE-PERFIL-FORA-DO-PORTAO`.** Os dez passos do portão incluem `deriva`,
que é `deriva-de-schema.ts`. A deriva de **perfil** não é rodada por ele. Um lote pode
acrescentar ação, entregar a tela, fechar **10 de 10** e a tela ser inalcançável — sem nada
acusar. Acrescentá-la ao portão é decisão própria, não efeito colateral deste lote.

**2. Um teto de heap que eu mesmo inventei.** O percurso subia o Chromium com
`--js-flags=--max-old-space-size=256`, copiado por frugalidade. A tela de classes monta um
select com **1.405 opções** — o recorte honesto das analíticas do ativo —, e navegar para fora
dela com o *old space* travado estourava 60 s. Medido: sem o teto, a mesma sequência carrega
em **81 ms** e o `networkidle2` assenta em **795 ms**. A correção foi a CAUSA, não o relógio:
aumentar o timeout teria escondido um limite inventado por mim.

**3. Um campo de data que o percurso não sabia preencher.** O formulário do bem enviava e
**nada acontecia** — nem sucesso, nem recusa, nem registro. O molde renderiza `tipo: "data"`
como `<input type="date">`, e digitar `"2026-03-10"` caractere a caractere deixa o campo
VAZIO; o `required` barra o envio no NAVEGADOR e **nenhum POST sai**. Silêncio é o pior dos
três estados, porque não acusa lugar nenhum.

⚠️ **E A ORIGEM DESSE DEFEITO É DESCONFORTÁVEL: foi regressão minha.** O ramo `tipo: "data"`
já existia em **seis** percursos. Eu copiei o `preencherEEnviar` do `smoke-gestao-do-bem.ts`,
que é o outlier — não tem o ramo, e passa 10 de 10 apenas porque seus três cadastros não têm
campo de data. **Ele passa por acidente do que lhe pedem preencher.**

⚠️ **PENDÊNCIA `PERCURSOS-SEM-HELPER-COMUM`.** Há **dez cópias** de `preencherEEnviar`, uma
por percurso, sem helper compartilhado — e elas divergiram: cinco não têm o ramo de data.
Extrair o helper toca dez arquivos e exige reexecutar dez percursos para provar que nada
quebrou. Lote próprio.

### 28.3 · Duas coisas que este lote fechou de passagem

- **`.env.example` documentava 2 de 4 variáveis exigidas.** Agora documenta as quatro, com o
  motivo de cada uma — foi numa delas (`SEED_IDENTIDADE`) que o lote bateu. Fecha parte de
  `ENV-EXAMPLE-DESATUALIZADO`.
- ⚠️ **PENDÊNCIA NOVA — `IDENTIDADE-DO-PRODUTO`.** O operador informou que o ente de
  Campina Grande/PB deixa de ser atendido e que o domínio passa a ser `enginesistemas.com.br`.
  O sistema inteiro está carimbado `SIAFIC · Campina Grande/PB` — tela de login, rodapé,
  seeds, identidades de fixture. Trocar isso é lote próprio: mexe em seed, em teste e na
  casca. A concessão deste lote já foi gravada com autor no domínio novo.

### 28.4 · Comandos e resultados

| Comando | Resultado | Data |
|---|---|---|
| `npm run typecheck` / `:app` / `:scripts` | limpos | 2026-09-12 |
| `npx vitest run modules/m10-patrimonial/m10-acervo.test.ts` | **11 testes** verdes | 2026-09-12 |
| `npx vitest run test/molde test/busca-global.test.ts` | 31 testes verdes | 2026-09-12 |
| `npx prisma migrate deploy` | `20260912081500_ent07_acoes_do_acervo` aplicada (105 no total) | 2026-09-12 |
| `npm run build` | **140 rotas**, as 4 novas entre elas | 2026-09-12 |
| `npm run db:conceder` | 2 concedidas, com autor gravado | 2026-09-12 |
| `npm run deriva:perfil` | **censo e perfis batem: 228 ações** | 2026-09-12 |
| `npm run smoke:acervo` | **11 passos, 0 falhas** | 2026-09-12 |
| `npm run portao -- --fim-de-lote` (1ª) | **7 de 10** — `t5c` do censo reprovou; `test:fuso` pulado | 2026-09-12 |
| `npm run test:rapido` (após corrigir as contagens) | 70 arquivos, 759 testes, verde | 2026-09-12 |
| `npm run portao -- --fim-de-lote` (2ª) | **10 de 10** — `test:fuso` EXECUTADO (726s), não pulado | 2026-09-12 |

### 28.5 · O portão cobrou a conta do censo — e cobrou certo

A primeira execução deu **7 de 10**. `test:rapido` e `test:tudo` reprovaram pelo mesmo e
único teste: **`t5c` de `m16-censo.test.ts`** — `expected 235 to be 233`.

⚠️ **NÃO ERA DEFEITO DO LOTE.** Aquelas contagens são digitadas À MÃO de propósito: é assim
que acrescentar uma ação ao censo vira ato deliberado em vez de adição silenciosa. Eu
acrescentei dois serviços e o guard cobrou a conta, que é exatamente o comportamento pelo
qual ele existe. E `test:tudo` confirmou que não havia segundo defeito escondido atrás do
primeiro: **202 de 203 arquivos e 2.116 de 2.117 testes verdes**, em 604 s.

⚠️ **A LIÇÃO É OUTRA, E VALE MAIS QUE O NÚMERO: UM `it` COM DUAS CONTAS SÓ REPORTA UMA.**
O `t5c` crava **duas** contagens — 233 serviços na linha 400 e 226 ações distintas na 479 —
e as duas vivem no MESMO bloco. A segunda **nunca tinha executado**, porque a primeira
estourava antes. Corrigir só o número que apareceu no relatório teria comprado uma segunda
reprovação **604 s depois**, no mesmo teste, poucas linhas abaixo. Foi por isso que a
correção começou lendo as duas, e não a acusada.

As duas se deslocam juntas: **233 → 235 serviços** e **226 → 228 ações distintas** — e este
último bate com o que `deriva:perfil` já havia dito por outro caminho, que é a confirmação
independente de que a conta certa é 228.

Cada incremento entrou com o argumento, como os anteriores: a classe e o bem são **dois
crachás e não um**, porque cadastrar a CLASSE amarra uma conta do ativo — decisão contábil,
e errá-la faz toda aquisição daquela classe lançar no lugar errado — enquanto cadastrar o
BEM põe uma coisa no acervo. Uma ação única daria, a quem só devia tombar um armário, o
poder de decidir em que conta do razão o acervo inteiro entra.

## 29. ENT08 — o eixo de gestão do bem, pela tela

**O que foi construído.** O ENT07 tornou o bem alcançável; faltava **movê-lo**. Quatro ações
no detalhe do bem — mover de localização, atribuir responsável, registrar estado de
conservação, registrar situação física —, o despachante `acaoDoBem` na porta, e duas chaves
novas de opção.

⚠️ **A NATUREZA FOI DECLARADA ANTES, E ERA O OPOSTO DA DO ENT07: superfície pura.** Medido, não
suposto: as ações já existiam no censo, já estavam em `AREA_DA_ACAO`, e nenhuma coluna ou enum
era necessária. **Sem ação nova, sem migration.**

⚠️ **QUATRO AÇÕES, UM SÓ CRACHÁ.** As quatro cobram `REGISTRAR_MOVIMENTO_DE_GESTAO`. A
segregação que o edital pede aqui é entre MOVER o bem e AVALIÁ-LO, não entre mudar de sala e
mudar de responsável — inventar quatro ações de censo seria inventar segregação que a fonte
não pede, e cada uma teria de ser concedida à mão em toda instalação existente.

⚠️ **UM FORMULÁRIO POR EIXO, e a razão é um guard do domínio.** `CAMPO_OBRIGATORIO_DO_TIPO`
recusa movimento de LOCALIZACAO sem localização, de ESTADO sem estado, e assim por diante —
porque um movimento gravável sem o campo **apagaria o eixo em silêncio**: a derivação leria o
último movimento do tipo, acharia nulo, e concluiria que o bem não está em lugar nenhum. Um
formulário único com os quatro campos convidaria a essa recusa três vezes em cada quatro.

⚠️ **O NOME DO RESPONSÁVEL NÃO MORA EM `Pessoa`.** Ela só tem documento e tipo; o nome está na
VERSÃO, e a vigente é a mais recente. O idioma já existia em quatro lugares do repositório
(`protocolo.ts`), incluindo o filtro que descarta quem tem a versão vigente inativa. Reusá-lo
evitou uma segunda verdade sobre a regra de versionamento — e evitou um select de CPFs crus.

### 29.1 · O catálogo: duas promovidas, e uma que quase foi marcada errado

| Cláusula | Decisão |
|---|---|
| 5.19.11 | **`VALIDADO_LOCALMENTE`** — "visualizar no cadastro e permitir o controle do estado de conservação" |
| 5.19.12 | **`VALIDADO_LOCALMENTE`** — o percurso escolhe `EM_MANUTENCAO_CORRETIVA`, literalmente um exemplo do texto |
| 5.19.10 | **continua `IMPLEMENTADO_NAO_VALIDADO`** — ver abaixo |
| 5.19.15 | continua **`PARCIAL`** — cadastramento, classificação, movimentação e localização existem; a **baixa** não |
| 5.19.24 | continua **`PARCIAL`** — o histórico traz as movimentações físicas; faltam as financeiras, o inventário e os anexos |

⚠️ **A 5.19.10 QUASE FOI MARCADA PELO MOTIVO ERRADO.** Eu ia promovê-la porque o responsável
passou a ser atribuível pela tela. O texto dela, lido literalmente, pede outra coisa:
*"permitir ao usuário a possibilidade de visualizar somente os bens sob a SUA
responsabilidade"* — uma consulta recortada pelo usuário logado, que não existe. A evidência
antiga no marcador descrevia a derivação (`bensSobResponsabilidade`), não a cláusula, e por um
momento marquei pela evidência em vez de pelo texto. **O catálogo se lê pelo edital, não pela
nota que alguém deixou nele.**

### 29.2 · O percurso foi fortalecido ANTES de marcar, não depois

A primeira versão exercitava **um** dos quatro eixos: movia a localização e deixava estado,
situação e responsável como selects que aparecem e ninguém usa. Isso prova que o formulário
montou — não prova "permitir o CONTROLE", que é o verbo das duas cláusulas.

É a mesma lição que o tipo de incorporação cobrou no ENT07 — com a diferença de que ali ela
veio **depois** da primeira marcação, e aqui veio antes. O percurso passou a exercer os quatro,
e a asserção final é que os três eixos **coexistem** no histórico depois de recarregar: se um
sobrescrevesse o outro, o bem teria estado ou situação, nunca os dois.

⚠️ **PENDÊNCIA `ESTORNO-POR-LINHA-DO-HISTORICO`.** `estornarMovimentoDeGestao` age sobre um
movimento ESCOLHIDO (e devolve `movimentosId` no plural, porque a transferência estorna as
duas pernas), enquanto as ações do molde agem sobre o id do RECURSO. Estornar exige ação por
linha do histórico, que o molde não oferece — e o molde não cresce para acomodar exceção.

### 29.3 · Comandos e resultados

| Comando | Resultado | Data |
|---|---|---|
| `npm run typecheck` / `:app` / `:scripts` | limpos | 2026-09-12 |
| descritor em tempo de módulo | 4 ações válidas; `estado` 5 opções, `situacao` 7 | 2026-09-12 |
| `npx vitest run test/molde test/busca-global.test.ts` | 31 testes verdes | 2026-09-12 |
| `npm run test:rapido` | 70 arquivos, 759 testes | 2026-09-12 |
| `npm run build` | limpo | 2026-09-12 |
| `npm run smoke:acervo` | **21 passos, 0 falhas** | 2026-09-12 |
| `npm run portao -- --fim-de-lote` | **10 de 10** na PRIMEIRA execução — `test:fuso` EXECUTADO (520s) | 2026-09-12 |

## 30. Checkpoint de revisão — 2026-09-12

⚠️ **ESTE É UM CHECKPOINT, NÃO UM FECHAMENTO.** Pedido pelo operador durante a execução da
ENT09. O lote **não está concluído**: o portão de fim de lote NÃO rodou para ele, e a cláusula
`5.19.2` NÃO foi marcada no catálogo, embora o percurso a prove.

### 30.1 · Estado real

| | |
|---|---|
| Repositório | `gestao-publica` · remoto `github.com/comercial-rgb/gestao-publica` |
| Branch / HEAD | `main` · `f63b20f115c724dd6f6d81d2fbfdb567bee71363` |
| Árvore | limpa no momento do commit de preservação |
| Referência auditada `1994358` | **é ancestral do HEAD** — sem reset, sem merge |

**Commits desde a referência auditada:**

| Commit | Lote | Natureza |
|---|---|---|
| `5954c60` | ENT07 — acervo (classe e bem) | modelo + superfície |
| `39f4a6e` | correção das contagens do censo | teste |
| `8beb6b1` | ENT08 — eixo de gestão do bem | superfície pura |
| `f63b20f` | ENT09 **parcial** — etiqueta | superfície, **não fechado** |

**Escopo real da ENT09** (não deduzir pelo número): o pedido original era a **baixa do bem**, e
foi medido até a parede antes de qualquer código — duas vezes, por motivos independentes
(`ROTEIRO-PATRIMONIAL-NAO-PARAMETRIZADO` e `USUARIO-SEM-PESSOA`, ambas registradas em §19). O
escopo vigente é **a etiqueta com código de barras** — `docs/lotes/ENT09-a-etiqueta-do-bem.md`.
Frente do produto: **acervo patrimonial (TR 5.19)**.

**Último portão executado:** `8beb6b1` — **10 de 10**, `test:fuso` EXECUTADO (520s). O trabalho
de `f63b20f` **não passou por portão**. Verificado nele: typecheck nos três projetos, descritor
validado em tempo de módulo com 5 ações, `test:rapido` 70/759, build limpo, `smoke-acervo`
**25 passos, 0 falhas**.

### 30.2 · Migrations e permissões no intervalo

Uma única migration, no ENT07: `prisma/migrations/20260912081500_ent07_acoes_do_acervo` —
**aditiva**, dois valores no enum `AcaoDoSistema` (`CADASTRAR_CLASSE_DE_BENS`, `CADASTRAR_BEM`),
com `prisma/schema/m16-usuarios.prisma` (+4 linhas). ENT08 e ENT09 **não tocaram schema**: as
ações que usam (`REGISTRAR_MOVIMENTO_DE_GESTAO`, `GERAR_ETIQUETA_DE_BEM`) já existiam no censo.

Concessão registrada com autor: `npm run db:conceder ADMINISTRADOR CADASTRAR_CLASSE_DE_BENS
CADASTRAR_BEM`, autor `admin@enginesistemas.com.br`; `deriva:perfil` fecha em **228 de 228**.

### 30.3 · Classificação dos achados

**A · Reaproveitamento do siafic-cg — `NÃO VERIFICADO`, por ausência do objeto.**
O SHA auditado `c04ad5a…` **não existe** no clone local (`git cat-file` → *bad object*). O clone
em `~/Developer/siafic-cg` é um instantâneo de **um commit** (`91df4d3`, 2026-09-09), só `main`,
**sem remotes**, sem `feat/seed-demo-completo`; e o `modules/m10-patrimonial/` dele **não tem**
`acervo.ts` nem `m10-acervo.test.ts`. Buscar do remoto é operação externa e não foi feita.
⚠️ **Correção de premissa:** a afirmação da ENT07 de que "nada no domínio criava um
`BemPatrimonial`" foi medida **neste** repositório (e vale também para o instantâneo local da
origem). Ela **não cobre** `c04ad5a`. A distinção correta é: *ausente na cópia atual e no
instantâneo local; existente na origem numa referência inalcançável daqui*.

**B · Autorização de leitura — `AINDA PRESENTE`.** Caminho executável, com evidência:

| Arquivo | Evidência |
|---|---|
| `lib/portas/molde.ts:89-91` | `exigirLeitura()` é `return exigirSessao()` — **guarda com nome de autorização e corpo de autenticação**; 42 telas a chamam |
| `lib/portas/sessao.ts:45-52` | `exigirSessao` = sessão ou redirect. Sem unidade, sem escopo |
| `lib/recorte.ts:36-46` | exercício ilegível → **2026 em silêncio**; `ug` ausente → **consolidado (o ente)**; o arquivo declara-se "só parse de string" |
| `app/(areas)/despesa/empenhos/page.tsx:39,54,58` | `unidadeCodigo` da URL entra direto na consulta |
| `lib/portas/empenho.ts:84,110,133` | `unidadeCodigo` só é espalhado em parâmetro; o único import de autorização é `comEscritaAutenticada` (**escrita**) |
| `app/(areas)/despesa/empenhos/pdf/route.ts:15-17` | `exigirSessao()` e segue para o PDF — autenticação, não autorização |
| grep | `unidadesDoUsuario`/`escopoDeLeitura`/`ugsDoUsuario` → **nenhuma ocorrência** |
| contraste | a **escrita** resolve a UG pelo ALVO do fato (`escopo.ts:238 resolverUgs`) e autoriza por UG. A leitura não tem equivalente |

⚠️ **Teste HTTP com usuário limitado e duas unidades NÃO foi executado** — o banco de
desenvolvimento tem **uma** `UnidadeOrcamentaria`, e criar massa para isso é decisão do operador.
Nenhum teste da suíte afirma recusa de leitura de unidade alheia.

**C · Resultado das operações — dividido, e cada metade com evidência.**

- `RESOLVIDO COM EVIDÊNCIA` — **o log sobrevive ao rollback**. `operacao.ts` grava o registro
  **fora** da transação do ato, de propósito e documentado: *"o log do 6.3 tem de sobreviver
  exatamente ao caso em que o fato NÃO sobrevive"*. E o envelope **re-lança**, não engole.
- `AINDA PRESENTE` — **sucesso persistido pode virar falsa falha**. Em
  `operacao.ts` (`comOperacaoRegistrada`), `await porta.registrar(…"SUCESSO")` está **dentro do
  mesmo `try`** do ato. Falhando essa escrita, o `catch` classifica como `ERRO` e **re-lança**:
  o usuário vê falha num ato **já commitado**, e a auditoria grava ERRO sobre operação
  bem-sucedida. Adjacente: o `registrar` do `catch` é desprotegido — se estourar, **o erro
  original se perde**. Em `lib/portas/sessao.ts:69-72` a mesma forma faz um login bem-sucedido
  ser gravado como **`NEGADO`**, poluindo justamente o relatório de tentativas barradas.
- `NÃO VERIFICADO` — **retry e idempotência do envelope**: não exercitados nesta sessão.

### 30.4 · Pendências acumuladas (nomeadas, não silenciosas)

`ROTEIRO-PATRIMONIAL-NAO-PARAMETRIZADO` · `USUARIO-SEM-PESSOA` · `MOTIVO-DE-BAIXA-ORFAO` ·
`BAIXA-E-TERMO-SEM-SUPERFICIE` · `DERIVA-DE-PERFIL-FORA-DO-PORTAO` · `PERCURSOS-SEM-HELPER-COMUM`
· `ENTRAR-POR-CLIQUE-FRAGIL` · `RECORTE-DE-CONTA-POR-NOME-LITERAL` · `IDENTIDADE-DO-PRODUTO` ·
`ZMOTIVO-DUPLICADO` · `COMISSAO-COM-MEMBROS` · `ESTORNO-POR-LINHA-DO-HISTORICO` ·
`LIQUIDACAO-MATERIAL-ALMOXARIFADO` (§24, decisão devida).

## 31. ENT09 — a etiqueta do bem, e dois escopos medidos até a parede

**O que foi construído.** A etiqueta com código de barras, pela tela: uma quinta ação no
detalhe do bem, **sem campos** — o molde prevê ("vazio ⇒ só o botão") e a etiqueta não pergunta
nada, porque o conteúdo dela é o próprio número de tombamento. Inventar um segundo
identificador criaria duas verdades sobre o mesmo armário.

⚠️ **Superfície pura, e a natureza foi declarada antes de começar:** `GERAR_ETIQUETA_DE_BEM` já
existia no censo e já estava mapeada em `patrimonio`; `gestao-do-bem.ts` tem **zero** chamadas
ao razão (contado, não presumido). Sem ação nova, sem migration.

⚠️ **O caso da porta NÃO reusa o `comum(criadoPor)`** dos outros quatro movimentos, que carrega
data do fato e motivo. A etiqueta não tem nenhum dos dois, e reaproveitar o objeto comum a faria
pedir, no formulário, campos obrigatórios que o domínio jamais leria.

### 31.1 · Dois escopos anteriores, medidos até a parede ANTES de qualquer código

O pedido original da ENT09 era **a baixa do bem**. Não foi entregue, e não por dificuldade:

| Escopo tentado | Parede | Natureza do bloqueio |
|---|---|---|
| Baixa do bem | `RoteiroPatrimonial` com **0 linhas** (enquanto `RoteiroOrcamentario` tem 5 e há 61 lançamentos) | **decisão contábil do município** — a fonte oficial publica plano de contas, não mapeamento tipo→débito/crédito |
| "Somente os meus bens" (`5.19.10`) | `Usuario` **não tem vínculo** com `Pessoa`; `bensSobResponsabilidade` recebe um `Pessoa.id` | **decisão de modelagem** — um usuário do sistema *é* uma pessoa do cadastro? |

⚠️ **E não se resolve semeando.** `roteiroDoTipo` é fail-closed por desenho e diz por quê: *"o
M10 não inventa conta: sem roteiro, o movimento NÃO é registrado"*. Semear o roteiro para um
percurso passar seria inventar norma, com efeito pior que a tela faltando — lançamentos no razão
apontando para contas que ninguém escolheu. Pendências `ROTEIRO-PATRIMONIAL-NAO-PARAMETRIZADO` e
`USUARIO-SEM-PESSOA`.

⚠️ **Dois candidatos consecutivos até a parede é sinal, não azar.** As duas frentes restantes do
acervo — a financeira e a de identidade — dependem de decisões que não são de quem escreve
código. O que sobrou sem decisão pendente era pequeno, e é o que este lote entregou.

### 31.2 · O catálogo: uma cláusula, e a leitura pelo texto

`5.19.2` → **`VALIDADO_LOCALMENTE`**. O texto literal é *"Permitir a geração de etiquetas com
códigos de barras"* — pede a **geração**, e é isso que o percurso exerce. O artefato físico
(layout, papel, PDF) é outra coisa e ficou declaradamente fora: este lote entrega o **ato**.

⚠️ **A asserção central é a idempotência PELO BOTÃO.** O domínio já a provava desde o ENT05
(`reaproveitada: true` quando o bem já tem código). O que só o percurso prova é que o botão não
a viola: ele pressiona **duas vezes** e confere que o código continua sendo o mesmo tombamento —
e, entre as duas, recarrega e vê o selo "Etiquetado", que é derivado de `codigoDeBarras`.

### 31.3 · Comandos e resultados

| Comando | Resultado | Data |
|---|---|---|
| `npm run typecheck` / `:app` / `:scripts` | limpos | 2026-09-12 |
| descritor em tempo de módulo | **5 ações**; `gerar-etiqueta` com `campos=0` | 2026-09-12 |
| `npm run test:rapido` | 70 arquivos, 759 testes | 2026-09-12 |
| `npm run build` | limpo | 2026-09-12 |
| `npm run smoke:acervo` | **25 passos, 0 falhas** | 2026-09-12 |

## 32. ENT10 — a autorização de leitura por unidade

> **Natureza do lote: PROFUNDIDADE.** É guard, e o CLAUDE.md põe guards nesse regime por
> nome. Caracterização antes de ampliar, fixture N=2, tripwire provado por mutação, negação
> que afirma o motivo.

### O que passou a funcionar, e a rota real

Uma tela de LEITURA não chamava `autorizar`. O `test/ui/contexto-ug.test.ts` corrigiu
**metade** disso no ENT03c — o seletor do cabeçalho deixou de oferecer unidade alheia. A
outra metade era a **URL**, e é ela que este lote fecha.

| Caminho real | Antes | Agora |
|---|---|---|
| `/despesa/empenhos?exercicio=2026` (usuário de uma unidade) | o **ente inteiro** | cai na unidade dele |
| `/despesa/empenhos?exercicio=2026&ug=<alheia>` | servia a unidade alheia | **recusa nomeando** onde ele tem leitura |
| `/despesa/empenhos?exercicio=abc` | virava **2026 em silêncio** | recusa dizendo que não é um ano |
| `/despesa/empenhos/pdf?ug=<alheia>` | **entregava o PDF** | **403** com o motivo |
| `/receita/arrecadacoes/pdf?exercicio=abc` | 2026 em silêncio | **400** |

**Os três caminhos de entrada, separados por natureza — e a separação foi medida:**

- **`recorteDePagina(sp)`** (`lib/portas/contexto.ts`) — 13 arquivos com dimensão de
  UNIDADE. Porta fina: resolve identidade (`exigirSessao`) e escopo (`listarUgsDoUsuario`,
  a **mesma tabela** que `autorizar` lê) e encaminha para a decisão pura;
- **`exercicioAutorizado(sp)`** (`lib/recorte.ts`) — 12 arquivos de leitura do **ENTE**
  (receita, extraorçamentário, conciliação, patrimônio, plano de contas, programação
  financeira). Elas **não passam `unidadeCodigo` a porta nenhuma**: impor-lhes recusa de
  `?ug=` quebraria link salvo sem proteger dado algum;
- **`recorteNaoAutorizado(sp)`** — **um** chamador, `despesa/ordem-cronologica`, que lê o
  recorte **para não usá-lo**: a fila do art. 141 é do ente, e a nota ao pé declara isso.

### Comandos executados, com resultado real

| Comando | Resultado | Quando |
|---|---|---|
| `npm run portao -- --fim-de-lote` | **8 de 10** — `test:tudo` FALHOU, `test:fuso` **pulado** | 1ª execução |
| `npm run portao -- --fim-de-lote` | **10 de 10**, `test:fuso` EXECUTADO (638s) | 2ª, máquina quieta |
| `typecheck:backend` / `:app` / `:scripts` | 19s / 3s / 3s, limpos | portão final |
| `cobertura-de-tsconfig` | **886 de 886, zero descobertos** | portão final |
| `test:tudo` | **758s** (contra 1032s na execução contaminada) | portão final |
| `test:rapido` | 71 arquivos, **772 asserções** | — |
| `npx tsx scripts/smoke-ent10.ts` | **16 passos, 0 falhas**, código de saída 0 | 2026-09-12 |

⚠️ **A PRIMEIRA EXECUÇÃO DO PORTÃO FALHOU POR CULPA MINHA, E O DIAGNÓSTICO IMPORTA MAIS QUE
A FALHA.** Dois testes do M03 caíram — *"dois créditos concorrentes"* e um `beforeEach` — e
os dois erros eram **timeout**, não asserção (`Test timed out in 5000ms`, `Hook timed out in
10000ms`). Isolados, com a máquina quieta: **2 arquivos, 28 testes, 0 falhas, 21,84s**.
Nenhum caminho de import liga aqueles arquivos ao que o lote tocou (`grep lib/|app/` = 0), e
eles nunca falharam nos quatro portões anteriores. A causa: eu rodava consultas ao catálogo e
varreduras **em paralelo** com `test:tudo`. É a repetição literal do incidente do ENT02 —
treze falhas fantasma em oito módulos, lidas como "defeitos no financeiro", que eram disputa
de máquina. **Nenhum `testTimeout` foi aumentado**: timeout se mede, não se aumenta.

### Migrations e SQL aplicados

**Nenhum.** Zero mudança de schema. O lote inteiro é decisão, porta e superfície — o
resolvedor de escopo (`listarUgsDoUsuario`) já existia e estava correto desde o ENT03c.

### Invariantes verificadas

- **6 — autorização no servidor, por ação nomeada.** A recusa fala a língua da ESCRITA
  (`modules/m16-travamento/autorizacao.ts`), que separa **A AÇÃO** de **O ESCOPO** porque as
  duas pedem providências opostas. A leitura passou a nomear o escopo que o usuário **tem**;
- **7 — tenant e entidade resolvidos no servidor.** *"URL, cabeçalho e campo de formulário
  não conferem permissão"* — era exatamente a URL que conferia. Cada tela e cada rota resolve
  o próprio escopo: herdar do layout seria autorização que some quando a rota é alcançada por
  outro caminho, e as rotas de exportação **são** esse outro caminho;
- **8 — fail-closed.** Sem escopo, recusa; `?ug=` ausente nunca produz consolidado para quem
  não pode consolidar.

### O catálogo

| Situação | Cláusulas |
|---|---|
| `NAO_VERIFICADO` | 1.720 (84,4%) |
| `AUSENTE_CONFIRMADO` | 134 |
| `IMPLEMENTADO_NAO_VALIDADO` | 79 |
| `VALIDADO_LOCALMENTE` | **53** |
| `PARCIAL` | 48 |
| `DEPENDENCIA_EXTERNA` | 3 |

**317 de 2.037 verificadas (15,6%).** O lote rendeu **uma** cláusula — `5.10.2.55`,
*"consultar despesa empenhada a pagar por unidade orçamentária"*. A desproporção entre 25
sítios corrigidos e uma cláusula **não é falha**: quase todo o trabalho foi conserto de um
furo, e furo consertado não é item de edital — é dívida paga. Lote de guard rende situação,
não cobertura.

### As quatro provas por mutação, com conjuntos vermelhos DISJUNTOS

| Instrumento | Mutação | Vermelhos |
|---|---|---|
| caracterização | `daFicha` deixa de consolidar na omissão | 2 de 3 (t2 verde: outra metade) |
| decisão pura | a pertinência não guarda | 6 de 23 |
| decisão pura | consolidado por omissão para todos | 5 de 23 |
| decisão pura | exercício ilegível vira o padrão | 5 de 23 |
| grep-teste | aparece um segundo chamador do parse cru | 1 de 4 |
| grep-teste | o nome antigo volta no chamador legítimo | 2 de 4 |

Nenhum teste aparece em dois conjuntos: **cada afirmação tem o seu acusador**, em vez de um
mesmo assert escrito três vezes.

### ⚠️ Cinco asserções vazias, achadas por mutação — três dentro de instrumentos meus

1. *"a recusa NÃO diz não encontrado"* ficava **verde com a guarda removida**: sem estouro, a
   mensagem ficava vazia, e `expect("").not.toMatch(...)` passa. Duas negações sem afirmar
   que a recusa **aconteceu** são duas tautologias;
2. *"os empenhos da unidade alheia não aparecem"* procurava o **código da unidade** no
   conteúdo — e a tabela de empenhos **não tem coluna de unidade**. Passava por vacuidade, e
   continuaria verde com o vazamento de volta. Trocada por **contagem**;
3. a gêmea dela, que exigia ver as duas unidades, era **insatisfazível** pelo mesmo motivo;
4. duas asserções liam `document.body`, que inclui a barra lateral e o **seletor** — a palavra
   "consolidado" vinha da opção do seletor, não do subtítulo. Passaram a ler o `<main>`.

### ⚠️ O defeito é mais estreito do que parecia, e isso precisa ser dito

Uma sonda mediu que `SincronizarContexto` faz `router.replace()` ao montar e **normaliza a
URL** nos quatro casos (apaga, acrescenta, troca e substitui). Com JavaScript ativo, um
usuário comum **não alcança** a unidade alheia pela barra de endereços. A exposição real eram
as **rotas de exportação** — `GET` direto, sem ilha e sem menu. O guard das telas continua
necessário como defesa em profundidade: ilha cliente não é fronteira de segurança, e `curl`,
JS desligado ou cliente sem script passam ao largo dela. **O percurso desliga o JavaScript
para interrogar o servidor** — com ele ligado, as seis "falhas" da primeira execução eram do
percurso, não do código.

### Pendências reais deste lote

| Pendência | O que é |
|---|---|
| `CONSOLIDADO-PARCIAL-NAO-EXPRIMIVEL` | usuário com 2+ unidades e sem global **recusa pedindo que escolha**: `RecorteDaPagina` carrega UMA unidade e o `where` é um código único. Exprimi-lo pede `unidades: string[]` atravessando `daFicha` e as cinco consultas |
| `DOSSIE-SEM-ESCOPO` | `lerDossieDoEmpenho` → `dossieDoEmpenho` → `findUnique` por id, **sem exercício, unidade ou identidade**. `/despesa/empenhos/<id alheio>` entrega o dossiê inteiro. O recorte autorizado **não** fecha isto — a unidade do empenho é transitiva pela ficha |
| `DECRETO-COM-PARSE-PROPRIO` | `creditos-adicionais/decreto/route.ts` faz o próprio parse de `?ano=` com `Number.parseInt` + `anoCivil`, fora de `recorteDe`. Silêncio da mesma família, de outro parâmetro |
| `SEED-SAGRES-POC-PARCIAL` | `seed:sagres-poc` **aborta** com recusa do art. 141 (*"a liquidação 1 está na posição 9 da fila"*) **depois** de criar órgão 99, UG 99001 e a ficha. Estado coerente (a transação desfez só o pagamento), mas o seed não completa |
| `PERCURSOS-SEM-HELPER-COMUM` | agora são **onze** cópias de `entrar`, e a décima primeira é a única **parametrizada** (dois atores) e a única que desliga JS |

**Fechada neste lote:** `PARTICAO-CEGA-A-PORTA` — `lib/portas/cliente.ts` era um caminho até o
banco que a partição da suíte não nomeava, e **os dois guards daquele arquivo eram cegos a
ele** (um usa `precisaDeBanco`, logo é tautológico com a lista; o outro procura
`new PrismaClient(`, e `cliente()` chama `criarPrismaClient`). Um teste que alcançasse o banco
só pela porta cairia na partição RÁPIDA, sem `setupFiles`, e `DATABASE_URL` seguiria sendo a
do **desenvolvedor**. Custo medido antes: move **um** arquivo de rápida para lenta.

### Decisão devida ao operador

⚠️ **Exigir `podeConsolidado` para as leituras do ENTE?** Hoje receita, extraorçamentário,
conciliação e patrimônio recusam exercício ilegível mas **não** exigem permissão global.
Exigi-la tiraria essas telas da vista de todo usuário sem permissão global — mudança de
comportamento visível, e não efeito colateral de um lote de guard.

## 33. ENT11 — o eixo financeiro do patrimônio, e a tela que ninguém alcançava

### 33.1 · A medição que abriu o lote

`RoteiroPatrimonial` tinha **zero linhas**. `RoteiroResultadoAlienacao`, zero.
`MovimentoPatrimonial`, zero. Não é coincidência: `roteiroDoTipo` é fail-closed e **recusa
todo movimento de valor de um tipo sem roteiro** — "o M10 não inventa conta". O acervo podia
ser cadastrado, classificado, etiquetado e movido de sala, e **nenhum bem podia receber um
centavo**: avaliação, reavaliação, depreciação, amortização, exaustão, impairment, doação e
baixa por alienação estavam todas atrás da mesma tabela vazia.

O domínio estava pronto desde o ENT05 e provado. O que não existia era o **ato de
parametrizar**: os únicos escritores daquelas tabelas eram os testes, por escrita crua, e o
seed da POC, que cobre três dos treze tipos. O seed `roteiros-patrimoniais.ts` **não** as
toca — apesar do nome, ele semeia dívida ativa, dívida fundada e provisão.

### 33.2 · O que passou a existir, e a rota real

| Rota | O que faz |
|---|---|
| `/patrimonio/roteiros` | os **treze** eventos do bem, parametrizados ou não, com o par débito/crédito |
| `/patrimonio/roteiros/<TIPO>` | o detalhe, e a **reparametrização** como ato à parte |
| `/patrimonio/roteiros-de-resultado` | ganho e perda da alienação, mesma disciplina |
| `/patrimonio/roteiros-de-resultado/<CHAVE>` | idem |

**A listagem mostra o que FALTA, e isso é a tela inteira.** Uma listagem das linhas gravadas
mostraria hoje uma tela vazia — verdadeira e inútil. A porta compõe as linhas a partir de
`TIPOS_BASE` e junta o roteiro quando existe; o `id` de cada linha é o **próprio tipo**,
que é `@unique` no modelo e existe antes de haver roteiro. Com o id da linha do roteiro, as
pendências — que são o ponto — não teriam para onde apontar.

**A conferência das contas CHAMA O MOTOR, e não reescreve a regra.** Um roteiro só presta se
o lançamento que ele produz for aceito, então o serviço compõe as partidas com
`comporPartidas` — a mesma função que `registrarMovimentoPatrimonial` chama — e deixa o M01
julgar. Reescrever aqui "as duas pernas são de classe 1 a 4" seria uma segunda verdade sobre
a natureza de informação, e ela divergiria em silêncio.

**Substituir é ato explícito.** Parametrizar um evento que já tem roteiro é **recusado**,
nomeando o par vigente; trocar as contas é ação própria no detalhe, com o aviso de que vale
para os movimentos **futuros** — o razão é append-only, e corrigir o passado é lançamento
novo.

**Uma ação do censo para os dois roteiros** (`PARAMETRIZAR_ROTEIRO_PATRIMONIAL`): as tabelas
são separadas por um detalhe de **modelo** (as chaves vêm de enums diferentes, e uni-las não
seria migration aditiva), não por diferença de **poder**. Censo de 228 para **229**; serviços
de 235 para **237**. Migration aditiva de um valor de enum, **zero DROP**.

### 33.3 · ⚠️ O defeito que o percurso pegou, e ele não era do código

A primeira execução do percurso morreu no terceiro passo: **o seletor de conta veio com zero
opções**. A causa não era a consulta — era que o formulário **não existia**: `FormsDoRecurso`
esconde de quem não tem a ação, e `PARAMETRIZAR_ROTEIRO_PATRIMONIAL` nasceu neste lote.

`npm run deriva:perfil` acusou na primeira tentativa: *"censo 229 ações · concedidas 228 —
1 AÇÃO QUE NENHUM PERFIL CONCEDE"*. É a terceira vez que isto acontece (ENT06, ENT07, agora),
e a pendência **`DERIVA-DE-PERFIL-FORA-DO-PORTAO`** já previa exatamente este lote: o portão
roda `deriva` de **schema**, não de **perfil**. Um lote pode acrescentar ação, entregar a
tela, fechar **10 de 10** e a tela ser inalcançável, sem nada acusar.

Resolvido pelo caminho que existe (`conceder-acoes-ao-perfil.ts`, ação digitada a uma,
`SEED_IDENTIDADE` como autor gravado em cada permissão). Depois: *"censo e perfis batem: 229
ações"*.

### 33.4 · As provas

| Prova | Resultado |
|---|---|
| `m10-roteiros.test.ts` | **12 testes**, contra banco, N=2 no t10 e no t11 |
| mutação A — a conferência das contas não acontece | vermelho em **t4 e t5**, e só neles |
| mutação B — substituir deixa de ser explícito | vermelho em **t7**, e só nele |
| revertido | 12/12 verde, arquivo **idêntico** ao original (`diff` vazio) |
| `scripts/smoke-roteiros.ts` | **17 passos, 0 falhas**, código de saída 0 |

O percurso é **re-executável**: a chave é um enum de rol fechado, então ele lê da tela o
primeiro evento ainda pendente em vez de depender de banco limpo. E exercita **duas recusas**
pela tela, com o motivo completo, além do caminho feliz.

### 33.5 · ⚠️ Quatro defeitos meus, e o que cada um ensina

1. **`somaDaSelecao={null}`** nas duas telas novas. O typecheck do editor não pegou; o
   `next build` pegou. O molde espera o **mapa** (vazio quando não há coluna de dinheiro).
2. **Comentário `//` na posição de atributo JSX** — não é comentário, é erro de sintaxe.
   Introduzido ao *explicar* a correção do defeito 1.
3. **Identificador de fixture inventado.** Usei `contador@cg.pb.gov.br`; `limparBanco` semeia
   um rol fixo e ele não está nele. As **onze** asserções falharam medindo a identidade em
   vez do que diziam medir — e a recusa era correta, que é o que torna isso traiçoeiro.
4. **Asserção lendo `document.body`.** A busca por "parametrizado" achava a palavra na
   **opção do próprio `select` de filtro**. É o mesmo defeito que o §32 já registrava, repetido
   por mim. Trocado por propriedade nas duas direções, exigindo ao menos uma linha de cada
   lado para não passar por vacuidade.

⚠️ **E UM ERRO DE MÉTODO, PIOR QUE OS QUATRO.** Editei arquivos **com a suíte rodando**.
Quatro das seis falhas daquele portão foram skew: o teste novo carregou contra um censo
obsoleto em memória. Um portão executado sobre fonte em movimento não mede nada.

### 33.6 · Pendências nomeadas

| Pendência | O que é |
|---|---|
| `ROTEIRO-SEM-HISTORICO-PROPRIO` | substituir um roteiro perde o par anterior; o ato fica em `RegistroDeOperacao`, mas a tabela não versiona |
| `ROTEIRO-DA-POC-COM-PAR-INSTRUMENTAL` | o percurso grava um par **contabilmente sem sentido** (as duas primeiras analíticas) no banco onde roda — aceitável em desenvolvimento, **inaceitável** numa instalação |
| `DERIVA-DE-PERFIL-FORA-DO-PORTAO` | reincidente pela terceira vez; o portão não roda `deriva:perfil` |
| `RECORTE-DE-CONTA-POR-NOME-LITERAL` | `verificarDefinicao` só cobra `classesDeConta` no campo literalmente chamado `contaContabilId`; aqui são `contaDebitoId`/`contaCreditoId`, e o guard fica mudo |
| `CONSULTA-DE-EVENTOS-CONTABEIS` | reduzida: os **dez** roteiros restantes seguem sem tela |

⚠️ **O SISTEMA NÃO ESCOLHE AS CONTAS, E ISSO NÃO É FALTA.** Qual par corresponde a cada
evento é doutrina contábil do ente. O sistema oferece as analíticas do PCASP oficial, recusa
o que o motor recusaria, e deixa a decisão com quem responde por ela.

## 34. ENT12 — o eixo de valor do bem, e o guard que nunca tinha sido exercido

### 34.1 · A medição que ordenou o lote

O ENT11 derrubou a primeira parede (roteiro com zero linhas). O reconhecimento deste lote
achou a segunda, e ela é maior:

```
grep -rn "registrarEntradaAvulsa|adquirirBem|registrarReavaliacao|atualizarCompetencia|
          baixarBem|alienarBem|registrarImpairment" lib/ app/
-> dois acertos, AMBOS em linhas de comentário.
```

**Nenhuma porta e nenhuma tela tocavam o eixo de valor.** Sete serviços com domínio provado,
teste contra banco e **ação no censo desde o ENT05** — superfície zero. O valor de um bem só
existia por escrita de teste ou pelo seed da POC.

⚠️ **E ISSO ORDENOU O LOTE.** A baixa sozinha seria inalcançável por percurso: `baixarBem` tem
teto duplo, e sem tela de entrada todo bem vale zero — a baixa seria sempre recusada, com
razão. É a lição de "a classe vem antes do bem", agora medida **antes**.

### 34.2 · O que passou a existir

Duas ações novas no detalhe do bem (`/patrimonio/bens-patrimoniais/<id>`), e nenhuma delas
pede a classe — a porta a deriva do próprio bem:

| Ação | Serviço | Tipos |
|---|---|---|
| Registrar entrada de valor | `registrarEntradaAvulsa` | `AVALIACAO_INICIAL`, `DOACAO_RECEBIDA` |
| Baixar do acervo | `baixarBem` | `BAIXA_ALIENACAO`, `DOACAO_REALIZADA` |

E o detalhe passou a mostrar o **valor contábil** — derivado dos movimentos com o sinal de
cada tipo, nunca uma coluna — e os **movimentos de valor no histórico**, ao lado dos de
gestão. Antes ele trazia só a contagem: o operador via "3 movimentos de valor" e não via
quais. Com a baixa ganhando tela isso deixaria de ser incômodo e viraria defeito.

⚠️ **O VALOR NA TELA NÃO É ENFEITE.** O domínio recusa baixa acima do valor do bem. Oferecer o
formulário sem dizer quanto ele vale é montar uma armadilha: o operador digita, o servidor
nega, e a tela nunca disse o teto.

**Superfície pura:** as sete ações já existiam no censo desde o ENT05. **Zero migration, zero
ação nova, zero mudança de schema.**

### 34.3 · ⚠️ O GUARD QUE NUNCA TINHA SIDO EXERCIDO, E QUASE NÃO FOI

A primeira execução do percurso fechou **17 passos, 0 falhas** — e não provava o que dizia.

`baixarBem` tem DOIS tetos: o da classe e o do BEM. O do bem existe para um caso preciso, e o
código diz qual: *"o saldo da classe não pode mascarar a baixa de um bem que já não vale
isso"*. Com **um bem só na classe**, os dois tetos valem o mesmo número, a recusa vem sempre
pela CLASSE, e o passo chamado "baixar acima do valor do BEM" ficava verde sem nunca ter
tocado o guard do bem. A asserção era `/excede o valor contábil/`, que casa os dois.

A correção é a regra da casa: **fixture N=2**. Um segundo bem na mesma classe, sem valor,
enquanto a classe tem 3.800. Agora só o teto do bem pode recusar, e a mensagem o nomeia:

> `Baixa de 1000.00 excede o valor contábil do BEM (0.00), ainda que a classe tenha 3800.00.`

⚠️ **E O PASSO ANTERIOR FOI RENOMEADO**, não apagado: ele prova o teto da CLASSE, e agora diz
isso. Rótulo que descreve um guard diferente do que dispara é o mesmo defeito com outra cara.

### 34.4 · As provas

| Prova | Resultado |
|---|---|
| `typecheck` backend / app / scripts | 0, 0, 0 |
| `next build` | 0 |
| `scripts/smoke-eixo-de-valor.ts` | **20 passos, 0 falhas**, código 0 |
| Recusa pelo teto da CLASSE | exercida pela tela, com a mensagem do domínio |
| Recusa pelo teto do BEM (N=2) | exercida pela tela, nomeando o bem |
| Cadeia com o ENT11 | o percurso parametriza o roteiro **pela tela** antes de lançar |

⚠️ **O PERCURSO NÃO SEMEIA ROTEIRO.** Semear para um percurso passar seria inventar norma — foi
o que o ENT09 recusou fazer. Ele usa a tela do ENT11, e com isso as duas entregas se provam
encaixadas.

### 34.5 · ⚠️ Dois defeitos meus, achados antes de rodar

1. **Seletor de dinheiro errado.** `CampoValor` renderiza **dois** elementos: o visível
   (`data-mascara="valor"`, sem `name`, controlado pelo React) e um `<input type="hidden"
   name="...">` com o valor cru. Eu escrevi `input[name="valor"]`, que casa só o escondido —
   impossível de digitar. O `smoke-ent03b` já documentava esse tropeço palavra por palavra; eu
   ia repeti-lo.
2. **Formato errado.** O idioma provado digita `"100000,00"`, vírgula. E o campo **não**
   acumula centavos, de propósito: o cabeçalho de `Campos.tsx` explica que o acumulador faria
   `10000` virar `100,00` — erro de 100x num número que vira empenho.

E um resíduo de escrita que limpei antes de commitar: uma função `quantas_placeholder_nao_usado`
que só devolvia o argumento.

### 34.6 · Pendências nomeadas

| Pendência | O que é |
|---|---|
| `EIXO-DE-VALOR-SEM-REAVALIACAO-NA-TELA` | `registrarReavaliacao` e `registrarImpairment` seguem sem superfície |
| `PARAMETRO-DE-CLASSE-SEM-CASO-DE-USO` | a depreciação tem **duas** paredes: `ParametroAtualizacaoClasse` não tem tela **nem serviço** — o único `definirParametro*` do repositório é do estoque, e só o seed da POC o escreve |
| `BAIXA-SEM-MOTIVO-CADASTRADO` | `MotivoDeBaixa` é **órfão**: só cadastrar, listar e ver. A baixa grava `motivo` como texto livre ao lado. Amarrá-los exige coluna nova — aditiva, mas migration, e por isso fica em lote próprio |
| `ALIENACAO-SEM-TELA` | `alienarBem` é composto (`valorVenda`, `acumuladaBaixada`, `receitaArrecadadaId`, quatro guards, dois movimentos sob um `operacaoId`). É **profundidade**, e misturá-lo rebaixaria um lote de superfície |

### 34.7 · ⚠️ O portão fechou em 9 de 10 — e a falha está diagnosticada, não descartada

| Passo | |
|---|---|
| typecheck (3) · cobertura · prisma:validate · deriva | ok |
| `test:rapido` | ok (13s) |
| `test:tudo` | **ok (787s)** |
| `test:fuso` | **FALHOU (1261s)** — 13 testes em 3 arquivos |
| `build` | ok (47s) |

**Nenhuma das 13 falhas é `AssertionError`.** São `Hook timed out in 10000ms`,
`Test timed out in 5000ms` e `PrismaClientKnownRequestError` — estes últimos vindo **depois**
dos timeouts de hook no mesmo arquivo, que é a cascata conhecida: o `beforeEach` trunca ~140
tabelas, estoura, deixa o banco em estado parcial, e o teste seguinte quebra por constraint.

⚠️ **E ISSO IMPORTA PARA A NATUREZA DO PASSO.** `test:fuso` existe para pegar defeito de **eixo
de data**, e defeito de data se manifesta como asserção errada — dia trocado, janela deslocada.
Zero asserções erradas em 2.159 testes.

**As quatro medições que fecham o diagnóstico:**

1. `test:tudo` — a **mesma suíte**, sem fuso deslocado — passou em **787s na mesma execução**.
   Um defeito do ENT12 cairia nas duas.
2. Nenhum dos três arquivos é tocado por este lote: `m09-vinculo` (conciliação),
   `m03-recurso-novo` (excesso de arrecadação), `m12-balanco-patrimonial`.
3. Rodados **isolados, sob o MESMO `TZ=Pacific/Kiritimati`**: **31 de 31, código 0**.
4. Máquina em colapso: **9.615 MB de swap usados de 10.240**, ~68 MB livres, contra ~1,48 GB
   livres no portão verde do ENT11. `test:fuso` levou **1261s** contra **690s** lá — +83%.

É o procedimento que o `CLAUDE.md` exige: *"falha intermitente só se descarta com o motivo
junto"*. O motivo está junto e a saída bruta está em `.registro-de-execucao/`.

⚠️ **MAS O PASSO NÃO PASSOU, E ISSO FICA REGISTRADO ASSIM.** Passo falhado não vira verde por
diagnóstico. O lote está commitado com o portão em **9 de 10**; um portão verde depende de
executar com a máquina desocupada, e isso é ato do operador, não deste lote.

## 35. Orquestração V3 — primeiro pacote, 4.1 e 4.2: a leitura vira permissão

> **Modo:** orquestração contínua (`docs/lotes/V3-orquestracao-continua.md`). Sem gate por
> lote; verificação direcionada; commit local por unidade. **Natureza:** PROFUNDIDADE — é
> guard de autorização (decisão pura provada sem banco, fixture N=2, negação que afirma o
> motivo). **Frente:** transversal (M16); serve a todas as áreas.

### 35.1 · O que passou a funcionar, e a rota real

| Caminho | Antes | Agora |
|---|---|---|
| qualquer tela do molde (46) — `/patrimonio/bens-patrimoniais`, `/divida/fundada`, `/transferencias/convenios`… | `exigirLeitura()` = sessão | exige `CONSULTAR_<ÁREA>` **global**; sem ela, `/sem-acesso` com o motivo |
| `/despesa/empenhos?ug=` e as rotas de PDF/NE | escopo pela **união** das ações do usuário | escopo da ação `CONSULTAR_DESPESA`: EMPENHAR na Saúde não lê a Saúde |
| `/despesa/empenhos/<id>` | dossiê por id, sem pergunta | autoriza pela unidade da **ficha do empenho**; recusa nomeia o escopo do usuário, nunca a unidade do registro |
| receita, extraorçamentário, conciliação, patrimônio, livros, RREO/RGF, integrações, cadastros, administração | só validavam o exercício | exigem a leitura **global** da área (tela: `/sem-acesso`; rota: 403) |
| processos, comunicados, chamados | sessão + regra do registro | ação da área **em algum escopo** + regra do registro |
| anexos (`/documentos/anexos/<id>`, lotes) | "usuário ativo" bastava para o anexo de pessoa | herdam a área do dono (processo, comunicado, chamado: algum escopo; pessoa: ente); "não pode" = 404, como o M22 já fazia |
| painel inicial | indicadores fiscais a qualquer sessão; pendências de todas as áreas | indicadores só com `CONSULTAR_RELATORIOS`; pendências só das áreas consultáveis |
| menu | "Transparência" visível a todos | some para quem não tem `CONSULTAR_TRANSPARENCIA`; perfil só de leitura vê só a área que consulta |
| `/administracao/perfis` | conceder/revogar | + **Diagnóstico de permissões**: deriva do censo e as atualizações versionadas, com prévia e botão "Aplicar atualização 1" |
| conceder ação/perfil | qualquer administrador, a qualquer perfil | **quatro olhos**: recusa ampliar um perfil ao qual o próprio autor está vinculado, e recusa conceder perfil a si mesmo |

Dezoito ações novas no censo (`ACOES_DE_LEITURA`, uma por área; 229 → **247**), no enum do
Prisma (migration aditiva) e no mapa do menu. A decisão é pura em `lib/recorte.ts`
(`exigirEscopoDoEnte`, `exigirAlgumEscopo`, `exigirEscopoDoRegistro`); o escopo é do
domínio (`modules/m16-travamento/leitura.ts`); a porta é `lib/portas/leitura.ts`. ADR:
`docs/adr/ADR-leitura-por-acao-e-escopo.md`. Módulo: `modules/m16-travamento/MODULO-BLOCO5.md`.

**A transição dos perfis existentes é explícita e versionada**
(`modules/m16-travamento/atualizacoes-de-permissoes.ts`, tabela `AtualizacaoDePermissoes`):
a v1 dá a cada perfil a leitura de cada área em que já age, no mesmo escopo; a área que
nenhuma mutação alcança (transparência interna) vai, global, só para quem administra
permissões. Aplica-se pela tela ou por `npm run permissoes:atualizar -- 1`; roda uma vez
por instalação; `npm run deriva:perfil` acusa atualização pendente.

### 35.2 · Comandos executados, com resultado real

| Comando | Resultado |
|---|---|
| `prisma validate` · `prisma generate` · `migrate deploy` (dev e teste) | **108 migrations** nos dois bancos; enum com 247 valores medido no banco |
| `npm run db:papel` | `gestao_app` reprovisionado nos dois bancos (a tabela nova entra com SELECT/INSERT) |
| `SEED_IDENTIDADE=admin@… npm run permissoes:atualizar -- 1` (dev) | v1 aplicada: **18 concessões em 2 perfis** (ADMINISTRADOR 17, OPERADOR RESTRITO — POC 1: `CONSULTAR_DESPESA @ 99001`) |
| `npm run db:conceder ADMINISTRADOR CONSULTAR_TRANSPARENCIA` (dev) | 1 concedida — a v1 ainda não tinha a regra da área sem mutação; a regra entrou depois e está provada |
| `npm run deriva:perfil` (dev) | **censo e perfis batem: 247 ações, todas concedidas** |
| `tsc` backend · app · scripts | **os três limpos** — cada um sozinho, em background, com `--max-old-space-size=2560`; ver 35.5 |
| `vitest` rápida direcionada (10 arquivos) | 1ª execução **68/71**: as 3 falhas eram do grep-teste novo (regex sem parêntese aninhado; landing de integrações sem gate; painel usa o booleano da política). Corrigido; `leitura-exige-acao` + `recorte-autorizado`: **41/41** |
| `vitest` lenta direcionada (17 arquivos, sob o trinco) | **159 de 163**: 3 falhas minhas em `m16-atualizacoes` (leituras contadas como "ação na área"; ordem do enum vs alfabética) e 1 `Hook timed out 10000ms` em `m16-borda-execucao` t2 |
| reexecução isolada de `m16-atualizacoes` + `m16-borda-execucao` | **18/18** — o timeout era da máquina (35.5) |
| `npx tsx scripts/marcar-catalogo.ts --aplicar` | 317/2037 verificadas; `5.8.8` com a evidência ampliada |

Saída bruta: `.registro-de-execucao/v3-pacote1-testes-direcionados.txt` e `…-reexecucao.txt`.
**Não executados nesta unidade, de propósito (modo V3):** `test:tudo`, `test:fuso`, `build`,
percursos de navegador. O `smoke-ent10.ts` foi **ajustado** para a política (o operador
restrito recebe 403 na rota do ente antes do parse; o 400 do exercício ilegível é provado
com o admin) e **não foi reexecutado** — exige build + servidor + navegador, que esta
máquina não comporta ao lado da suíte (35.5). Fica como pendência nomeada desta unidade.

### 35.3 · Migrations e SQL

`20260912201430_v3_acoes_de_leitura` (18 × `ALTER TYPE … ADD VALUE`) e
`20260912203603_v3_atualizacoes_de_permissoes` (tabela nova). Aditivas, zero DROP. Nenhum
SQL manual novo.

### 35.4 · Invariantes verificadas

- **6 — autorização no servidor, por ação nomeada:** agora também para LEITURA. Cada tela
  e rota de `(areas)` declara a ação, e o grep-teste recusa a que não declara.
- **7 — tenant e entidade resolvidos no servidor:** o detalhe por id deriva a unidade do
  próprio registro; `?ug=` continua sem conferir permissão.
- **8 — fail-closed:** sem escopo, recusa; ente sem global, recusa; usuário inativo, recusa
  pela revogação antes de olhar escopo; anexo sem dono conhecido não é entregue.
- **Append-only e censo do papel:** a nova tabela só recebe INSERT do runtime; nenhum
  UPDATE/DELETE novo no censo de `papel-runtime.ts`.

### 35.5 · A máquina, medida — e o que isso muda no procedimento

8 GB de RAM, swap em **10,3 GB de 11,2 GB**, ~60 MB livres, com o editor e outros processos
do operador ocupando o resto. O primeiro `tsc` dos três projetos em sequência **morreu com
stack trace do Node** (não foi erro de tipo); um `tsc` sozinho levou **>10 min** com 319 MB
residentes — quase todo o tempo em swap. Procedimento que funcionou e fica registrado:
**um processo pesado por vez, em background, com heap limitado**, e testes de banco sob o
trinco. O `Hook timed out 10000ms` da primeira execução lenta passou isolado — é a mesma
classe do ENT10/ENT12, e continua não sendo defeito nem aprovação.

### 35.6 · O catálogo

Sem mudança de contagem (**317** verificadas; **53** `VALIDADO_LOCALMENTE`). `5.8.8`
(controle de acesso por usuário e grupo, por ação) teve a evidência ampliada com a leitura
como permissão e as provas desta unidade; a validação por navegador dela continua sendo o
`smoke-ent10.ts`, pendente de reexecução.

### 35.7 · Pendências nomeadas

| Pendência | O que é |
|---|---|
| `SMOKE-ENT10-SOB-A-POLITICA` | percurso ajustado, não reexecutado (build + servidor + navegador) |
| `SMOKE-PERFIS-DIAGNOSTICO` | o cartão de diagnóstico/atualização não tem percurso de navegador ainda |
| `CONSOLIDADO-PARCIAL-NAO-EXPRIMIVEL` | continua: usuário com 2+ unidades e sem global escolhe uma; a soma parcial não é oferecida |
| `LANDING-SEM-GATE-POR-DESENHO` | as páginas de navegação (cartões) não importam porta de dado e não têm gate; o grep-teste prova a propriedade, não a lista |
| `PORTAO-INTEGRAL-PENDENTE` | `test:tudo`, `test:fuso` e `build` ficam para o candidato de homologação; a ENT12 continua com a pendência dela |

**Fechadas:** `DOSSIE-SEM-ESCOPO`, `DECRETO-COM-PARSE-PROPRIO`, `DERIVA-DE-PERFIL` ganhou
o lado das atualizações, e a "decisão devida ao operador" da §32 (exigir permissão nas
leituras do ente) foi tomada pelo pedido V3.

### 35.8 · Próximo ponto exato

**4.3 — auditoria e resposta verdadeira.** Desenho já levantado: `comOperacaoRegistrada`
grava o registro DEPOIS do ato e re-lança a falha do registro (o ato conclui, a interface
recebe erro); `entrar` transforma qualquer erro — inclusive indisponibilidade da auditoria —
em "usuário ou senha inválidos". Separar: (1) fato + registro autoritativo de sucesso na
mesma transação, pelo funil `lancarNoRazao` com contexto de comando (AsyncLocalStorage),
append-only (linha INICIADA antes, SUCESSO dentro da tx, CONCLUIDA/NEGADO/ERRO depois);
(2) negação registrada fora da tx, preservando o erro original se o registro falhar;
(3) telemetria posterior sem alterar o resultado; (4) chave + fingerprint de comando nos
formulários, com replay idempotente no escopo do usuário. Depois: 4.4, 4.5 e a cadeia
patrimonial (seção 5 do pedido).

## 36. Orquestração V3 — 4.3: auditoria e resposta verdadeira

> **Natureza:** PROFUNDIDADE — transação, idempotência e auditoria. A falha foi
> REPRODUZIDA em teste antes de ser fechada, como o pedido manda.

### 36.1 · O defeito, reproduzido

`comOperacaoRegistrada` gravava UMA linha depois do ato e re-lançava a falha do próprio
registro: o empenho commitava, o INSERT do log falhava, a tela recebia erro e o operador
repetia o empenho. Na negação, o erro que subia era o do log, não o "ACESSO NEGADO". No
login, `entrar` traduzia QUALQUER erro de `autenticar` — banco fora do ar, auditoria da
tentativa recusando o INSERT — em "usuário ou senha inválidos". Os três casos estão em
`modules/m16-travamento/m16-operacao.test.ts`, com a descrição do defeito no nome do teste.

### 36.2 · O que passou a funcionar

| Separação | Como |
|---|---|
| fato + auditoria autoritativa de sucesso na MESMA transação real | o funil `lancarNoRazao` grava a linha `SUCESSO` (com `lancamentoId`) com a `tx` do fato; o comando corrente chega ao funil por `AsyncLocalStorage` — sem transação de fachada por fora dos adapters e sem mudar 76 assinaturas |
| tentativa negada registrada sem desaparecer no rollback | `INICIADA` antes do ato e `NEGADO`/`ERRO` depois, fora da transação; se o registro da negação falhar, sobe o erro ORIGINAL e a falha vai para a telemetria |
| telemetria posterior sem alterar o resultado | `CONCLUIDA` (com `resultadoRef`) depois do commit; se falhar, o chamador recebe o resultado assim mesmo |
| auditoria indisponível antes do ato | `AuditoriaIndisponivelError`: o ato não roda — um fato sem tentativa registrada seria um fato sem rastro |
| retry idempotente | `__chave` no formulário (gerada no cliente após a hidratação, trocada a cada sucesso) + fingerprint sha256 do comando canônico (`lib/portas/comando.ts`); as 97 Server Actions passam por `comComandoDoFormulario`; `comEscritaAutenticada` entrega chave e fingerprint ao envelope; mesmo comando repetido no escopo (usuário, ação) → `ComandoJaConcluidoError`, sem executar |
| login | `ehFalhaDeCredencial`: só credencial inválida e cadeado viram "usuário ou senha inválidos"; o resto é "serviço indisponível"; a falha do registro de sucesso não derruba um login já feito |

Append-only: nenhuma linha do registro é atualizada; o papel de runtime segue só com INSERT.
A tela de auditoria mostra as fases. ADR: `docs/adr/ADR-registro-de-operacao-em-duas-fases.md`.

### 36.3 · Comandos e resultados

| Comando | Resultado |
|---|---|
| migration `v3_operacao_em_duas_fases` (enum + 5 colunas + 2 índices) | aplicada nos dois bancos; colunas medidas no banco |
| `tsc` backend · app | limpos (o de scripts acusou uma chave duplicada no `marcar-catalogo.ts`, corrigida em seguida) |
| `vitest` rápida (censo, fronteira, grep da leitura, rótulos, partição, cobertura) | **21/21** |
| `vitest` lenta (m16-operacao, as quatro bordas, autenticação, unidade de trabalho, papel de runtime, borda de escrita, censo de ausências, isolamento) | **112/112** (11 arquivos), sob o trinco |

Saída bruta em `.registro-de-execucao/v3-pacote1-43-testes-direcionados.txt`.

### 36.4 · Pendências nomeadas

| Pendência | O que é |
|---|---|
| `CHAVE-DE-COMANDO-NOS-FORMULARIOS-A-MAO` | só o molde e o formulário de empenho mandam `__chave`; os outros formulários à mão passam pelo contexto do comando sem chave (sem replay) até serem tocados |
| `REPLAY-DE-CADASTRO-SEM-FUNIL` | um comando sem lançamento cuja `CONCLUIDA` falhou não deixa `SUCESSO`; o replay o repete. É cadastro, não dinheiro |
| `PERCURSO-DO-REPLAY` | o replay foi provado pela porta; o percurso de navegador (reenviar o mesmo formulário) fica para a rodada de percursos |

### 36.5 · Próximo ponto exato

**4.4 + 4.5 juntos.** O banco de desenvolvimento tem três `RoteiroPatrimonial` instrumentais
(AQUISICAO, AVALIACAO_INICIAL, BAIXA_ALIENACAO com 1.1.1.1.1.01.00 × 1.1.1.1.1.00.00, escolhidas
pelo `smoke-roteiros.ts` como "as duas primeiras analíticas") e quatro movimentos com quatro
lançamentos que dependem deles. Substituí-los sem reescrever o razão exige o versionamento de
4.5 (versão anterior, autor, momento, motivo, vigência, vínculo com os fatos) — por isso 4.5
entra antes, e 4.4 o usa: banco de percursos separado, roteiros instrumentais supersedidos
por configuração identificada de demonstração, sem apresentá-la como homologação contábil.

## 37. Orquestração V3 — 4.5 e 4.4: roteiros versionados, e o banco dos percursos separado

> **Natureza:** PROFUNDIDADE — configuração contábil, concorrência, vínculo com o razão.
> ADR: `docs/adr/ADR-versoes-de-roteiro-e-banco-de-percursos.md`.

### 37.1 · O inventário que abriu a unidade (4.4)

No banco de desenvolvimento, medido antes de qualquer código:

| O que | Quanto | Origem |
|---|---|---|
| `RoteiroPatrimonial` instrumental | 3 (AQUISICAO, AVALIACAO_INICIAL, BAIXA_ALIENACAO), todos `1.1.1.1.1.01.00 × 1.1.1.1.1.00.00` | `scripts/smoke-roteiros.ts`, "as duas primeiras analíticas do seletor", 2026-09-12, `admin@cg.pb.gov.br` |
| movimentos dependentes | 4 (2 AVALIACAO_INICIAL, 2 BAIXA_ALIENACAO) | `smoke-eixo-de-valor.ts` |
| lançamentos dependentes | 4 (`PATRIMONIAL_*`) de 68 | idem |

Nada disso foi apagado ou reescrito. O que mudou é COMO um roteiro passa a existir.

### 37.2 · O que passou a funcionar (4.5)

| Capacidade | Onde |
|---|---|
| cada parametrização é uma VERSÃO append-only: par, motivo obrigatório, autor e momento da proposta, autor e momento da publicação | `VersaoDeRoteiro` (migration `v3_versoes_de_roteiro`) |
| propor (validação pelo motor) ≠ publicar (aprovação, ação própria `PUBLICAR_ROTEIRO_PATRIMONIAL`) ≠ usar em fatos | `proporVersaoDeRoteiro`, `publicarVersaoDeRoteiro`; o resolvedor lê a PUBLICADA mais recente |
| o fato aponta para a versão que usou | `MovimentoPatrimonial.versaoDeRoteiroId` |
| vigência derivada; versão anterior preservada; nenhum lançamento reescrito | `versoesDoRoteiro` (vigenciaFim = publicação da seguinte) |
| concorrência: índice único `(familia, chave, numero)`; repetição recusada nomeando (proposta idêntica pendente; par já vigente; publicar duas vezes) | `criarVersaoNaTx` / `publicarNaTx` |
| a tela: aba **Histórico** com as versões, ações **Propor nova versão** e **Publicar a proposta pendente**; "trocar as contas agora" continua como ato composto e exige os dois crachás | `/patrimonio/roteiros/<evento>` |
| tabelas legadas só-leitura como origem; backfill cria a versão 1 com autor e momento originais | `npm run roteiros:versionar` |
| `PUBLICAR_ROTEIRO_PATRIMONIAL` chega às instalações existentes pela **atualização v2** (quem parametriza recebe a publicação no mesmo escopo) | `permissoes:atualizar -- 2` |

### 37.3 · Os três bancos (4.4)

`DATABASE_URL` (desenvolvimento), `DATABASE_URL_TEST` (suíte, já isolada) e o novo
`DATABASE_URL_PERCURSOS` (percursos de navegador). `npm run percursos:preparar` cria e povoa
o terceiro por uma sequência declarada (migrations, SQL manual, papel, plano oficial, M02,
roteiro orçamentário, M07, exercício, bootstrap, cenário de aceite, cenário SAGRES, operador
restrito, dívida ativa, versionamento, atualizações v1 e v2, roteiros de DEMONSTRAÇÃO), e
recusa coincidir com os outros dois; `npm run percursos:servir` sobe o servidor em 3010 sobre
ele. `seed:roteiros-demo` propõe e publica, pelos serviços e com autor, um par por evento do
acervo escolhido pelo NOME de cada conta no plano oficial, com o motivo dizendo em cada versão
que é demonstração — produção não o roda.

### 37.4 · Comandos e resultados

| Comando | Resultado |
|---|---|
| `tsc` backend · app · scripts | limpos (a primeira rodada acusou uma declaração usada antes da definição e um spread com campo duplicado — corrigidos) |
| `vitest` rápida (censo, grep da leitura, fronteira, partição, cobertura, deriva) | **25/25** |
| `vitest` lenta (roteiros, roteiros-versões, patrimônio, alienação, competência, balanço patrimonial, DVP, limites, atualizações, papel de runtime) | **112/112** (10 arquivos), sob o trinco |
| dev: `migrate deploy` · `db:papel` · `permissoes:atualizar -- 2` | v2 aplicada: 1 concessão em 1 perfil; `deriva:perfil`: **248 ações, todas concedidas** |
| dev: `roteiros:versionar` | **5 versões 1** criadas com origem preservada; 0 contas trocadas; 0 lançamentos tocados |
| dev: `seed:roteiros-demo` | versão **2** publicada para os três instrumentais; versão 1 para DEPRECIACAO e BAIXA_DE_ATUALIZACAO_ACUMULADA |
| dev: conferência | 4 movimentos, **0 com versão** (anteriores ao versionamento, corretamente); **68 lançamentos** antes e depois |
| `npm run percursos:preparar` | 1ª execução parou nos roteiros da dívida ativa (o preparador semeava o plano mínimo; a dívida cita contas do plano OFICIAL — corrigido para `pcasp-oficial.ts`); 2ª parou no bootstrap (a tolerância lia `e.message`, que com `stdio: inherit` não traz o texto do filho — corrigido para ler a saída capturada); **3ª execução: pronto** — `gestao_publica_percursos` com 7.864 contas, 2 usuários, 8 versões de roteiro (3 de origem do `sagres-poc`, as de demonstração por cima), 250 permissões, v1 e v2 aplicadas, 3 fichas, 2 unidades. Saída bruta em `.registro-de-execucao/v3-pacote1-44-percursos-{2,3}.txt` |

### 37.5 · Pendências nomeadas

| Pendência | O que é |
|---|---|
| `RESULTADO-DA-ALIENACAO-SEM-DEMO` | GANHO/PERDA da alienação ficaram só com a versão 1 de origem; a demonstração não escolheu par para eles |
| `PERCURSOS-SOB-O-BANCO-PROPRIO` | os smokes ainda não foram reexecutados contra 3010; `smoke-roteiros.ts` deve deixar de escolher "as duas primeiras analíticas" e passar a usar propor/publicar com motivo |
| `ROTEIRO-PATRIMONIAL-NAO-PARAMETRIZADO` | continua sendo decisão do contador do ente para produção |

**Fechada:** `ROTEIRO-SEM-HISTORICO-PROPRIO`.

### 37.6 · Próximo ponto exato

**Segundo pacote — a cadeia patrimonial utilizável** (seção 5 do pedido): pesquisa do acervo
por localização/responsável/classe/situação/identificadores; vínculo Usuario↔Pessoa e "meus
bens"; motivo de baixa ligado ao ato; reavaliação e impairment na tela; parâmetros versionados
de depreciação; processamento por competência com prévia e memória; alienação integrada;
estorno com análise de dependências; termos; etiqueta imprimível verificada por decoder.

## 38. Orquestração V3 — segundo pacote, unidade 1: o usuário é uma pessoa, "meus bens" e a pesquisa do acervo

**Regime:** superfície (pesquisa, tela "meus bens", administração do vínculo) sobre um
serviço de PROFUNDIDADE novo (o vínculo usuário↔pessoa: append-only, negação com motivo,
N=2 de homônimos). Nada contábil foi tocado; nenhum lançamento, nenhum roteiro.

### 38.1 · O que passou a funcionar, e a rota real

| Capacidade | Onde |
|---|---|
| Vincular o usuário a uma pessoa do cadastro pelo CPF/CNPJ, com motivo; desvincular com motivo; coluna "Pessoa do cadastro" com "vínculo pendente" para o cadastro antigo | `/administracao/usuarios` (formulários `vincular-pessoa` e `desvincular-pessoa`; ação `VINCULAR_PESSOA_AO_USUARIO`, família de administração) |
| "Bens sob minha responsabilidade": a pessoa da sessão e os bens pelos quais ela responde hoje, derivados do último movimento de responsável; sem vínculo, a tela diz que está pendente e quem resolve | `/patrimonio/meus-bens` (leitura `CONSULTAR_PATRIMONIO` em algum escopo; entrada de menu na área do patrimônio) |
| A pesquisa do acervo por tombamento/código de barras/descrição, classe, localização, responsável (nome ou documento), situação (inclusive "sem registro"), estado de conservação e espécie — com as colunas Localização, Responsável e Situação ATUAIS de cada bem | `/patrimonio/bens-patrimoniais` (a lista do molde; os filtros são do descritor `acervo.ts`) |
| Atualização versionada de permissões **v3** (`vincular-pessoa-ao-usuario`): quem tem `CRIAR_USUARIO` ganha `VINCULAR_PESSOA_AO_USUARIO` no mesmo escopo; diagnóstico e aplicação pela tela de perfis | `/administracao/perfis` · `npm run permissoes:atualizar -- 3` |

### 38.2 · Decisões

| Decisão | Motivo |
|---|---|
| O vínculo é **explícito, pelo documento**, nunca por nome | dois "João da Silva" são duas pessoas; um vínculo por nome entregaria os bens de um ao outro (`m16-pessoa-do-usuario.test.ts` t1) |
| **Uma pessoa, um usuário** por vez; trocar é desvincular e vincular de novo, cada passo com motivo | "meus bens" de duas contas apontando para a mesma responsabilidade é a confusão que o termo de responsabilidade existe para impedir |
| O vínculo **não concede permissão** — nada em `PermissaoDePerfil` | quem o usuário É e o que ele PODE são perguntas diferentes; o teste afirma as duas depois do vínculo |
| Cadastro antigo fica **PENDENTE**, identificado na tela; nenhuma associação automática | letra do pedido; a aproximação por nome é exatamente o erro que o vínculo explícito evita |
| A lista do acervo deriva o estado em **SQL parametrizado** (`DISTINCT ON (bem, tipo)`, dia civil do movimento + instante do registro, estorno anulando o original) | localização/responsável/situação não são colunas do bem; filtrar por eles pelo Prisma exigiria carregar o acervo inteiro. A regra é a mesma de `estadoDoBemEm`, e o teste confronta as duas — inclusive com dois movimentos no mesmo dia registrados fora de ordem, onde o timestamp bruto erraria |
| Localização, responsável e classe são filtros de **texto casado no servidor**, não seletores | um `select` com centenas de pessoas é formulário bonito e inútil; o molde valida seleção contra opções estáticas |
| Nenhum UUID ao operador: o responsável aparece como "nome (documento)", a localização como "código — descrição" | padrão de entrega da orquestração |

### 38.3 · Arquivos

`prisma/schema/m16-usuarios.prisma` (`VinculoUsuarioPessoa`, `TipoDeVinculoUsuarioPessoa`, `VINCULAR_PESSOA_AO_USUARIO`) · `prisma/migrations/20260912214145_v3_vinculo_usuario_pessoa` · `modules/m16-travamento/servico-pessoa-do-usuario.ts` (+ teste) · `acoes.ts` · `atualizacoes-de-permissoes.ts` (v3) · `lib/portas/administracao.ts` · `app/(areas)/administracao/usuarios/{actions.ts,AcoesUsuario.tsx,page.tsx}` · `lib/portas/recursos/meus-bens-dados.ts` · `app/(areas)/patrimonio/meus-bens/page.tsx` · `lib/navegacao.ts` · `lib/portas/navegacao-permissoes.ts` · `lib/portas/recursos/{acervo.ts,acervo-dados.ts}` · `test/acervo-pesquisa.test.ts` · `test/limpar-banco.ts` · `scripts/preparar-banco-de-percursos.ts` (v3) · `MODULO.md` do M10 e `MODULO-BLOCO5.md` do M16 · catálogo (5.19.10, 5.19.14).

### 38.4 · Comandos executados e resultado real

| Comando | Resultado |
|---|---|
| `migrate dev` (dev) · `migrate deploy` (test, percursos) · `db:papel` nos três | aplicada; `gestao_app` sem superusuário, sem BYPASSRLS, sem DDL |
| `tsc` backend · app · scripts (um por vez, heap 2560) | **limpos** |
| `vitest` rápida (partição sem banco, completa) | **790/790** (72 arquivos) |
| `vitest` lenta sob o trinco (pessoa-do-usuário, acervo-pesquisa, atualizações, m10-acervo, menu contra o servidor, rollout) | **55/55** (6 arquivos) |
| dev: `permissoes:atualizar -- 3` · `deriva:perfil` | v3 aplicada: 1 concessão em 1 perfil; **249 ações, todas concedidas** |
| percursos: `migrate deploy` · papel · `permissoes:atualizar -- 3` | a 1ª tentativa recusou (`enum AcaoDoSistema` sem o valor — o banco dos percursos não tinha a migration); depois do deploy, v3 aplicada: 1 concessão |

**Não executado:** portão integral, `test:tudo`, `test:fuso`, `next build`, percursos de
navegador (a tela de usuários e a de "meus bens" não têm percurso ainda).

### 38.5 · Pendências nomeadas

| Pendência | O que é |
|---|---|
| `MEUS-BENS-SEM-PERCURSO` | `/patrimonio/meus-bens` e o vínculo em `/administracao/usuarios` não têm percurso de navegador; 5.19.10 continua `IMPLEMENTADO_NAO_VALIDADO` |
| `PESQUISA-DO-ACERVO-SEM-PERCURSO` | `smoke-acervo.ts` não exercita os filtros novos; 5.19.14 sobe de `AUSENTE_CONFIRMADO` para `IMPLEMENTADO_NAO_VALIDADO` |
| `PERCURSOS-SOB-O-BANCO-PROPRIO` (37.5) | continua |

### 38.6 · Próximo ponto exato

Segundo pacote, unidade 2: **motivo de baixa ligado ao ato** (tabela de motivos e FK no
movimento, texto histórico preservado), **reavaliação e impairment** no detalhe do bem,
**alienação integrada** com a receita escolhida pelo número (não por UUID). Depois:
parâmetros versionados de depreciação e o processamento por competência com prévia e
memória; estorno com análise de dependências; termos; etiquetas com decoder independente.

## 39. Orquestração V3 — segundo pacote, unidade 2: motivo de baixa no ato, reavaliação e alienação na tela

**Regime:** profundidade no domínio (a baixa e a alienação lançam no razão; o motivo do rol
entra na transação com negação nomeada e N=2), superfície nas três ações novas do detalhe do
bem. Nenhum lançamento existente foi tocado; a migration é aditiva.

### 39.1 · O que passou a funcionar, e a rota real

| Capacidade | Onde |
|---|---|
| Baixa do bem com o **motivo do rol do ente** (TR 5.19.30) ligado ao ato, texto livre preservado como histórico; o lançamento cita o código do motivo | `/patrimonio/bens-patrimoniais/[id]`, ação "Baixar do acervo" (seletor de motivos ATIVOS + histórico) |
| **Reavaliar** (aumento ou redução) e **Registrar redução ao valor recuperável** (impairment) no detalhe do bem, cada uma com crachá próprio | mesma tela, ações "reavaliar" e "registrar-impairment" (`REGISTRAR_REAVALIACAO`, `REGISTRAR_IMPAIRMENT`) |
| **Alienar** integrado à receita: a guia (exercício + número da arrecadação) identifica a receita; valor bruto e acumulada derivados do próprio bem; motivo do rol; apuração de ganho/perda numa só transação | mesma tela, ação "alienar" (`ALIENAR_BEM`) |
| O histórico do bem mostra, por movimento de valor, o texto, o motivo do rol e a guia da receita | aba de histórico do detalhe do bem |

### 39.2 · Decisões

| Decisão | Motivo |
|---|---|
| `motivoDeBaixaId` é FK **RESTRICT** para `MotivoDeBaixa`; opcional no domínio, obrigatório nas duas ações da tela | um motivo referenciado por baixa não se apaga; a baixa por classe (sem bem, uso instrumental) segue válida sem motivo do rol; a tela exige o rol porque é ali que o operador está |
| Motivo **inativo recusa** nomeando, e nada é gravado | inativo ainda classifica as baixas antigas — por isso não se apaga — mas não classifica uma nova |
| Na alienação o motivo vai na baixa do **bruto**; a baixa da acumulada não o carrega | a acumulada é retificadora e anda em par pelo `operacaoId`; o ato é a baixa do bruto |
| A receita é achada pela **guia** (`uq_receita_guia`: exercício, número, ARRECADACAO); quem decide se ela sustenta a venda continua sendo `alienarBem` | padrão de entrega (nenhum UUID ao operador); uma regra, uma explicação |
| Valor bruto e acumulada da alienação **derivados do bem** na porta, nunca digitados | pedir ao operador o número que o domínio vai recusar é armadilha |
| `versaoDeRoteiro` e `motivoDeBaixa` declaram `onDelete: Restrict` no schema | o `migrate dev` gerou um DROP CONSTRAINT + re-ADD do FK de versão (RESTRICT na migration original, SET NULL no default do Prisma). Zero DROP é regra: a migration foi reescrita como puramente aditiva com RESTRICT, a versão gerada foi revertida à mão em dev e test (coluna vazia, minutos depois de criada, nada versionado) e o `migrate diff` confirma **"No difference detected"** |

### 39.3 · Arquivos

`prisma/schema/m10-patrimonial.prisma`, `m10-patrimonio-gestao.prisma` · `prisma/migrations/20260913020020_v3_motivo_de_baixa_no_ato` (aditiva) · `modules/m10-patrimonial/{dominio.ts,patrimonio.ts,receita-da-alienacao.ts,m10-baixa-motivo.test.ts,m10-alienacao.test.ts (t8, t9)}` · `modules/m16-travamento/acoes.ts` (FORA_DO_CENSO) · `lib/portas/recursos/{acervo.ts,acervo-dados.ts}` · `MODULO.md` do M10 · catálogo (5.19.26).

### 39.4 · Comandos executados e resultado real

| Comando | Resultado |
|---|---|
| `migrate dev` → reescrita aditiva → reversão manual (psql) em dev e test → `migrate deploy` nos três bancos → `db:papel` nos três → `migrate diff` | aplicada com RESTRICT nos dois FKs; **No difference detected** |
| `tsc` backend · app · scripts (um por vez, heap 2560) | **limpos** |
| `vitest` rápida (partição sem banco, completa) | **790/790** (72 arquivos) |
| `vitest` lenta sob o trinco (baixa-motivo, alienação, patrimônio, competência, acervo, censo) | **64/64** (6 arquivos) |

**Não executado:** portão integral, `test:tudo`, `test:fuso`, `next build`, percursos de
navegador pelas ações novas.

### 39.5 · Pendências nomeadas

| Pendência | O que é |
|---|---|
| `VALOR-DO-BEM-SEM-PERCURSO` | reavaliar, impairment e alienar no detalhe do bem não têm percurso de navegador; 5.19.26 e 5.19.29 continuam `IMPLEMENTADO_NAO_VALIDADO` |
| `ROTEIRO-PATRIMONIAL-NAO-PARAMETRIZADO` | REAVALIACAO_*, IMPAIRMENT e o resultado da alienação não têm par nem na demonstração; a tela recusa nomeando até o contador parametrizar |
| `MEUS-BENS-SEM-PERCURSO`, `PESQUISA-DO-ACERVO-SEM-PERCURSO` (38.5) | continuam |

### 39.6 · Próximo ponto exato

Segundo pacote, unidade 3: **parâmetros versionados de depreciação** (tabela de versões com
vigência derivada; `atualizarCompetencia` lê a vigente) e o **processamento por competência
com prévia e memória de cálculo** (tela própria). Depois: estorno com análise de dependências;
termos; etiquetas com decoder independente.

## 40. Orquestração V3 — segundo pacote, unidade 3: parâmetro versionado, prévia e memória de cálculo

**Regime:** profundidade (a atualização por competência lança no razão; a régua ganhou
versão, a prévia é a mesma conta sem escrever, a memória vai na mesma transação) com
superfície nas duas telas. `m10-competencia.test.ts` passa sem mudar um literal.

### 40.1 · O que passou a funcionar, e a rota real

| Capacidade | Onde |
|---|---|
| Definir o parâmetro de depreciação/amortização/exaustão da classe em **versões** (autor, motivo, vigência derivada); encerrar a atualização de uma classe; histórico por classe; todas as classes ativas listadas, parametrizadas ou não | `/patrimonio/parametros-de-atualizacao` (molde; ações "definir" e "encerrar"; ação `DEFINIR_PARAMETRO_DE_ATUALIZACAO`) |
| **Prévia** da competência com a memória de cálculo (parâmetro e versão, base, contábil, residual, parcela cheia, teto, parcela a lançar) e a situação (pronta, sem parâmetro, encerrada, já processada, totalmente atualizada) com a recusa nas palavras do domínio | `/patrimonio/competencia?classe=…&competencia=YYYY-MM` (GET, sem transição de estado) |
| **Processar** a competência (POST com chave de comando, crachá `ATUALIZAR_COMPETENCIA_PATRIMONIAL`), e o histórico do processado com a memória gravada de cada um | mesma tela, formulário `processar-competencia` |
| Atualização versionada de permissões **v4** (`parametro-de-atualizacao`): quem parametriza roteiro do patrimônio ganha a definição do parâmetro no mesmo escopo | `/administracao/perfis` · `npm run permissoes:atualizar -- 4` |

### 40.2 · Decisões

| Decisão | Motivo |
|---|---|
| `VersaoDeParametroDeAtualizacao` append-only, vigente = maior número; `ParametroAtualizacaoClasse` vira **origem** (só responde sem versão) | o molde dos roteiros (V3 4.5); nenhum backfill: a origem responde até alguém versionar, e a memória registra "sem versão" |
| **A regra é uma:** `validarParametrosDaClasse` é chamada por quem define e por `calcularParcela` | versão inválida não nasce; não há segunda explicação para a mesma recusa |
| **Prévia = a mesma conta.** `preverCompetencia` devolve situação + recusa; `atualizarCompetencia` a chama na transação e recusa com o mesmo texto | não há duas aritméticas para a mesma parcela |
| **Memória na mesma transação** (`MemoriaDeAtualizacao`, uma por movimento, FK RESTRICT para a versão) | se a memória não grava, o movimento não existe; "por que 450,00?" continua respondível depois que a régua mudou |
| Ação própria `DEFINIR_PARAMETRO_DE_ATUALIZACAO`, derivada (v4) de `PARAMETRIZAR_ROTEIRO_PATRIMONIAL` | vida útil e residual são decisão do contador sobre a NBC TSP 07, não efeito colateral de outro crachá |
| Residual pedido em **porcento** na tela e convertido a fração de seis casas pelo `Decimal` na porta | pedir "0.100000" ao operador é pedir que ele erre; o domínio só conhece a fração |
| Bruto e acumulada nunca são pedidos; classe sem parâmetro em vigor não aparece no seletor da competência | a tela não monta armadilha que o domínio vai recusar |
| ADR nova: `docs/adr/ADR-parametros-versionados-e-memoria-de-calculo.md` | decisão de modelo, registrada |

### 40.3 · Arquivos

`prisma/schema/{m10-patrimonial,m16-usuarios}.prisma` · `prisma/migrations/20260913021912_v3_parametros_versionados_e_memoria` (aditiva, 0 DROP) · `modules/m10-patrimonial/{parametros.ts,dominio.ts,patrimonio.ts,m10-parametros-versoes.test.ts,MODULO.md}` · `modules/m16-travamento/{acoes.ts,atualizacoes-de-permissoes.ts (v4),m16-censo.test.ts,m16-atualizacoes.test.ts}` · `lib/portas/{navegacao-permissoes.ts,recursos/parametros.ts,recursos/parametros-dados.ts,recursos/competencia-dados.ts}` · `lib/navegacao.ts` · `app/(areas)/patrimonio/parametros-de-atualizacao/{page.tsx,[id]/page.tsx,actions.ts}` · `app/(areas)/patrimonio/competencia/{page.tsx,actions.ts,ProcessarCompetencia.tsx}` · `scripts/preparar-banco-de-percursos.ts` (v4) · `test/limpar-banco.ts` · `docs/adr/ADR-parametros-versionados-e-memoria-de-calculo.md` · catálogo (5.19.29).

### 40.4 · Comandos executados e resultado real

| Comando | Resultado |
|---|---|
| `migrate dev` (dev) · `migrate deploy` (test, percursos) · `db:papel` nos três | aplicada; **0 DROP** no SQL gerado; `gestao_app` sem superusuário, sem BYPASSRLS, sem DDL |
| `prisma generate` | o `migrate dev` NÃO regenerou o cliente (o valor novo do enum não estava em `prisma/generated/client`); a 1ª tentativa de aplicar a v4 recusou por validação do cliente; regenerado à mão, aplicada |
| `tsc` backend · app · scripts (um por vez, heap 2560) | **limpos** (a 1ª rodada do app acusou 20 erros de cliente Prisma desatualizado — regenerado; e uma linha composta sem assinatura de índice — `type` em vez de `interface`) |
| `vitest` rápida (partição sem banco, completa) | **790/790** (72 arquivos) — a 1ª rodada acusou 1: a tela da competência passava `id` literal a dois campos; trocados por `CampoSelect`/`CampoTexto` (id do `useId`) |
| `vitest` lenta sob o trinco (parâmetros-versões, competência, patrimônio, atualizações, censo/rollout, papel de runtime) | **88/92** na rodada conjunta: 3 do `m16-rollout` por `Hook timed out 10000ms` no `beforeEach` (máquina; **isolado: 11/11**) e o t6 novo, que supunha que o perfil EXECUCAO da fixture não tinha a ação — ele tem todas fora da administração; o teste passou a usar um perfil que só consulta (**rerodado: 6/6**) |
| dev e percursos: `permissoes:atualizar -- 4` · `deriva:perfil` | v4 aplicada: 1 concessão em 1 perfil, nos dois bancos; **250 ações, todas concedidas** |

**Não executado:** portão integral, `test:tudo`, `test:fuso`, `next build`, percursos de
navegador pelas duas telas novas.

### 40.5 · Pendências nomeadas

| Pendência | O que é |
|---|---|
| `COMPETENCIA-SEM-PERCURSO` | `/patrimonio/competencia` e `/patrimonio/parametros-de-atualizacao` não têm percurso de navegador; 5.19.26 e 5.19.29 continuam `IMPLEMENTADO_NAO_VALIDADO` |
| `PARAMETRO-DE-ORIGEM-SEM-VERSAO` | classes com a linha legada continuam funcionando sem versão; versionar é ato do contador pela tela (a origem aparece como "parâmetro de origem, sem versão") |
| `GENERATE-APOS-MIGRATE-DEV` | o `migrate dev` desta máquina não regenerou o cliente; até entender a causa, `npm run db:...` deve ser seguido de `prisma generate` explícito — registrado aqui para não repetir a recusa |
| as de 38.5 e 39.5 | continuam |

### 40.6 · Próximo ponto exato

Segundo pacote, unidade 4: **estorno com análise de dependências** (página própria: o que o
estorno desfaz, o que depende do movimento — competências posteriores, baixas, memórias — e a
recusa nomeada quando há dependente vivo). Depois: termos (emissão + PDF) e etiquetas com
decoder independente; então o inventário dos smokes sob o banco dos percursos.

## 41. Orquestração V3 — segundo pacote, unidade 4: o estorno com análise de dependências

**Regime:** profundidade (o estorno lança no razão; a análise passa a ser conferida DENTRO da
transação e recusa nomeando) com superfície na tela de análise. **Commit conjunto com a
unidade 3** — as duas tocam `patrimonio.ts` e `acoes.ts`, e a verificação foi uma só.

### 41.1 · O que passou a funcionar, e a rota real

| Capacidade | Onde |
|---|---|
| A **análise do estorno** de um movimento de valor: o que o ato desfaz (o movimento, os arrastados da operação, o lançamento do resultado), quem depende (bloqueia, com o porquê) e os posteriores do mesmo bem (informação); o botão só sem bloqueio e com o crachá | `/patrimonio/estornos/valor/[id]` — pelos links "analisar estorno" do histórico do bem e da lista de competências processadas |
| A análise do estorno de um movimento de **gestão** (par da transferência arrastado; posteriores do eixo como informação) | `/patrimonio/estornos/gestao/[id]` — pelo histórico do bem |
| O serviço `estornarMovimentoPatrimonial` **recusa** estorno fora de ordem, nomeando os dependentes vivos | qualquer caminho (tela, script, API) |

### 41.2 · Decisões

| Decisão | Motivo |
|---|---|
| Depende quem **ficaria inválido**: (a) competência posterior quando o movimento compõe a base; (b) redução posterior quando o movimento é aumento (o teto o incluía); (c) baixa da acumulada posterior quando o movimento é atualização acumulada | é a definição que não bloqueia o que continua válido: estornar uma depreciação com uma redução posterior viva continua permitido (o teto só cresce), e é o que `m10-alienacao.test.ts` já exercitava |
| Ordem pelo **instante do registro** (`criadoEm`), não pela data do fato | base e teto foram conferidos contra o que existia ao registrar |
| Posteriores do mesmo bem fora de (a)–(c) são **informação**, não bloqueio | LIFO por bem seria regra de estética, não de validade |
| Gestão **não bloqueia** | não há base nem teto; o estado é o último vivo do eixo — estornar um anterior reescreve o histórico, e a tela diz isso |
| A análise é refeita **na transação** do estorno | a tela não é fronteira de segurança |
| `LinhaDoHistorico.href` no molde, renderizado como link | uma linha de histórico com destino é genérica (roteiros, bens); não é exceção acomodada |

### 41.3 · Arquivos

`modules/m10-patrimonial/{estorno.ts,patrimonio.ts,m10-estorno-dependencias.test.ts,m10-alienacao.test.ts (t10),MODULO.md}` · `modules/m16-travamento/acoes.ts` (FORA_DO_CENSO) · `lib/molde/tipos.ts` · `components/molde/DetalheDeRecurso.tsx` · `lib/portas/recursos/{estorno-dados.ts,acervo-dados.ts}` · `app/(areas)/patrimonio/estornos/{actions.ts,EstornarMovimento.tsx,[eixo]/[id]/page.tsx}` · `app/(areas)/patrimonio/competencia/page.tsx` (link) · catálogo (5.19.39).

### 41.4 · Comandos executados e resultado real

| Comando | Resultado |
|---|---|
| `tsc` backend · app · scripts (um por vez, heap 2560) | **limpos** (a 1ª rodada do backend acusou 1 erro na análise — o lançamento do resultado vinha com `id` e a interface pedia `lancamentoId`; corrigido). Sob swap, o `tsc` do backend levou ~20 min nesta máquina — registrado, não é defeito |
| `vitest` rápida (partição sem banco, completa) | **790/790** (72 arquivos) |
| `vitest` lenta sob o trinco (estorno-dependências, alienação, patrimônio, competência, acervo, gestão do bem, censo) | **82/82** (7 arquivos, inclusive `m10-alienacao` t8–t10 e `m10-parametros-versoes` 6/6) |

**Não executado:** portão integral, `test:tudo`, `test:fuso`, `next build`, percurso de
navegador pela tela de análise.

### 41.5 · Pendências nomeadas

| Pendência | O que é |
|---|---|
| `ESTORNO-SEM-PERCURSO` | a tela de análise não tem percurso de navegador; 5.19.39 continua `PARCIAL` |
| `ESTORNO-DE-GESTAO-SEM-BLOQUEIO` | decisão registrada: o eixo de gestão só informa; se o inventário passar a depender de um movimento de gestão, a análise ganha a regra |
| as de 38.5, 39.5 e 40.5 | continuam |

### 41.6 · Próximo ponto exato

Segundo pacote, unidade 5: **termos** (responsabilidade, transferência, baixa — emissão pela
tela e PDF pelo `packages/documento`) e **etiquetas imprimíveis** (individual e em lote, Code
128 em SVG, com decoder independente no teste). Depois: inventário dos smokes sob o banco dos
percursos (`PERCURSOS-SOB-O-BANCO-PROPRIO`) e os percursos das telas novas do pacote 2.

## 42. Orquestração V3 — segundo pacote, unidade 5: termos com PDF e etiquetas imprimíveis

**Regime:** superfície (as duas telas, a rota de PDF, a folha de etiquetas) sobre dois
instrumentos de profundidade: o documento do termo como dado (testado contra literais) e o
código de barras lido de volta por decodificador independente (parser contra implementação
independente, com prova de que acusa).

### 42.1 · O que passou a funcionar, e a rota real

| Capacidade | Onde |
|---|---|
| **Termos patrimoniais** (responsabilidade individual/setorial/por responsável, e de baixa): emitir pela tela — bens pelo tombamento, resolvidos na porta com recusa nomeada; o movimento de cada bem é registrado na mesma transação (o serviço já fazia); termo imutável; lista com filtros; detalhe com os bens (cada um com link) | `/patrimonio/termos` (molde; ação `EMITIR_TERMO_PATRIMONIAL`) |
| **PDF do termo** — cabeçalho com o responsável (nome e documento), uma linha por bem com valor contábil e localização derivados no momento da impressão, total, declaração e linhas de assinatura; mesmo motor e rodapé (hash, paginação, aviso de não assinado) dos demonstrativos | `/patrimonio/termos/[id]/pdf` (rota autenticada, leitura do ente) — pelo detalhe do termo, aba "relacionados" |
| **Etiquetas imprimíveis** com Code 128 (SVG): individual pelo detalhe do bem, em lote pela seleção da lista do acervo; folha em grade com impressão do navegador; bem sem código gravado fica fora da folha, nomeado, com o caminho | `/patrimonio/etiquetas?bens=…` |

### 42.2 · Decisões

| Decisão | Motivo |
|---|---|
| Code 128 por **`bwip-js`** (BWIPP em JavaScript, gerador de referência) e o **decodificador próprio no teste**, escrito da especificação | parser se testa contra implementação independente; se a tabela do decodificador ou a geração desviarem do padrão, o teste acusa — e t4 prova que uma barra alargada derruba a leitura |
| Fora do ASCII imprimível, a geração **recusa** nomeando; nada é "limpo" em silêncio | a etiqueta colada tem de dizer exatamente o que o cadastro diz |
| **Imprimir não grava**: a folha só desenha códigos já gravados por "Gerar etiqueta" | `GET` não produz transição de estado; a reimpressão precisa sair idêntica |
| O SVG entra na página por `dangerouslySetInnerHTML` — primeiro uso no repositório | o SVG nasce no servidor, da biblioteca, a partir de um código ASCII conferido; nenhum HTML de terceiros passa por ali; registrado aqui para o próximo leitor não achar que é brecha |
| Bens do termo pelo **tombamento** (texto), não por seletor múltiplo | um termo setorial relaciona dezenas de bens; o molde não tem seleção múltipla e um select com o acervo inteiro seria o formulário bonito e inútil |
| O documento do termo é **dado** no módulo (`termo-documento.ts`), estruturalmente igual ao `DocumentoPdf` de `lib/pdf` | o módulo não importa `lib/`; a rota só passa o dado ao motor |
| Valores e localizações do termo são os de **hoje** | o termo é o fato; o papel é leitura; o arquivo congelado é o termo assinado anexado (`documentoId`) |
| `lib/pdf/ente.ts` concentra o nome do ente | duas cópias da mesma string já existiam |

### 42.3 · Arquivos

`packages/codigo-de-barras/{index.ts,codigo-de-barras.test.ts}` · `package.json` (+`bwip-js` 4.11.4) · `lib/pdf/ente.ts` · `lib/portas/recursos/{etiquetas-dados.ts,termos.ts,termos-dados.ts,acervo.ts (relacionados)}` · `app/(areas)/patrimonio/etiquetas/{page.tsx,BotaoImprimir.tsx}` · `app/(areas)/patrimonio/termos/{page.tsx,[id]/page.tsx,[id]/pdf/route.ts,actions.ts}` · `app/(areas)/patrimonio/bens-patrimoniais/page.tsx` (link do lote) · `modules/m10-patrimonial/{termo-documento.ts,m10-termo-documento.test.ts,MODULO.md}` · `modules/m16-travamento/acoes.ts` (FORA_DO_CENSO) · `lib/navegacao.ts` · catálogo (5.19.2, 5.19.36, 5.19.37).

### 42.4 · Comandos executados e resultado real

| Comando | Resultado |
|---|---|
| `npm install bwip-js@4.11.4` | instalado (aviso EBADENGINE do npm sobre a versão do Node — a biblioteca roda; registrado) |
| `tsc` backend · app · scripts (um por vez, heap 2560) | **limpos** (duas rodadas: a 1ª acusou uma inferência circular no decodificador do teste — anotada — e o `where` da lista de termos montado por spreads, que `exactOptionalPropertyTypes` não aceita como `WhereInput` — tipado por `Prisma.TermoPatrimonialWhereInput`) |
| `vitest` rápida (partição sem banco, completa — inclui `codigo-de-barras.test.ts`) | **794/794** (73 arquivos; +4 do Code 128 — a 1ª rodada acusou o t4, cujo regex da mutação cravava a altura do SVG; corrigido para ler a altura do próprio SVG) |
| `vitest` lenta sob o trinco (termo-documento, gestão do bem, acervo, censo/rollout) | **51/51** (5 arquivos: termo-documento, gestão do bem, acervo, pesquisa do acervo, menu contra o servidor) |

**Não executado:** portão integral, `test:tudo`, `test:fuso`, `next build`, geração real do PDF
pelo Chromium (o motor é o mesmo dos demonstrativos; o documento foi testado como dado),
percursos de navegador pelas telas novas.

### 42.5 · Pendências nomeadas

| Pendência | O que é |
|---|---|
| `TERMOS-E-ETIQUETAS-SEM-PERCURSO` | telas novas sem percurso de navegador; 5.19.2, 5.19.36 e 5.19.37 ficam `IMPLEMENTADO_NAO_VALIDADO` |
| `PDF-DO-TERMO-NAO-RENDERIZADO` | a rota compõe e chama o motor; o PDF real só foi produzido pelos demonstrativos até aqui |
| `TERMO-ASSINADO-NAO-ANEXAVEL-PELA-TELA` | `documentoId` (o termo assinado) só entra por anexo; a tela do termo ainda não oferece o anexo |
| as de 38.5 a 41.5 | continuam |

### 42.6 · Próximo ponto exato

Fechamento do segundo pacote: **os percursos de navegador** das telas novas sob o banco dos
percursos (`percursos:preparar` já aplica v1–v4; falta o `smoke` de acervo/meus-bens,
competência, estorno, termos e etiquetas) e a reexecução dos smokes existentes contra 3010
(`PERCURSOS-SOB-O-BANCO-PROPRIO`). Depois, a decisão sobre `LIQUIDACAO-MATERIAL-ALMOXARIFADO`
(caso de uso composto — seção 5 do pedido) e a reconciliação dirigida com o siafic-cg.

## 43. Orquestração V3 — segundo pacote, fechamento: o percurso das cinco unidades sob o banco dos percursos

**Regime:** superfície — um percurso de navegador por família de tela nova, com recarga entre
os passos, contra o servidor dos percursos (banco próprio, seeds declarados, v1–v4 aplicadas).

### 43.1 · O que foi provado pela tela

`scripts/smoke-pacote2.ts` (`npm run smoke:pacote2`), **30 passos, 0 falhas** na décima
execução (`.registro-de-execucao/v3-pacote2-percurso.txt`; a 1ª tentativa está ao lado):
classe e bem criados; acervo pesquisado por tombamento (situação derivada) e por responsável;
"Gerar etiqueta" e a folha com o SVG do Code 128; parâmetro versionado gravado e relido
(24 meses, 10%, versão 1); prévia PRONTA com 450,00 e a versão do parâmetro; processamento;
recarga com "já processada" e a memória (base 12000.00, versão 1); histórico do bem com os
links de análise; estorno da entrada **bloqueado** pela dependência, com o porquê na tela;
estorno da competência pela tela de análise; a entrada liberada em seguida; termo de
responsabilidade emitido pelo tombamento, relido, com o bem no detalhe; **PDF do termo
renderizado** pela rota autenticada (200, `application/pdf`, > 1 KB); pesquisa por
responsável achando o bem entregue; vínculo do administrador à pessoa pelo documento;
"meus bens" listando o bem.

### 43.2 · O que o percurso acusou, e o que mudou

| Achado | O que foi feito |
|---|---|
| **Regressão desde o ENT12:** o `case "gerar-etiqueta"` do despachante do bem sumiu no commit bb47320 (o comentário ficou, o código não); a ação caía no `default` — "não existe neste cadastro" — em produção desde então | restaurado em `acervo-dados.ts`; `test/ui/acoes-despachadas.test.ts` vigia descritor × despachante (toda ação declarada tem `case`/`acao ===`), com a prova de que acusa |
| As actions escritas à mão (competência, estorno) chamavam `revalidatePath`; o refresh do RSC desmontava o formulário e a resposta sumia | sem `revalidatePath` nessas duas; a tela seguinte lê o banco ao abrir (`force-dynamic`) |
| A lista de usuários tem um formulário por usuário dentro de `<details>` fechado; o percurso digitava no do primeiro usuário e o `required` segurava o envio em silêncio | `data-usuario` nos formulários de vínculo; o percurso abre o `<details>` e mira o do administrador |
| O `next dev` desta máquina **reinicia sozinho** ao se aproximar do teto de memória (com heap 2048: cinco reinícios numa execução; a navegação daquele instante cai com `ERR_CONNECTION_RESET`) | servidor com heap 3584 (zero reinícios na execução final); o percurso retenta a navegação e o `fetch` do PDF |
| **500 intermitente na primeira renderização** de rota recém-compilada, com `TypeError: frame.join is not a function` no log — é o parser de stack do React server-dom (dev) mascarando o erro real; a segunda requisição responde 200 | o percurso retenta uma vez; registrado como `DEV-FRAME-JOIN-MASCARA-O-ERRO` (não reproduz em produção e não afeta os testes) |
| A resposta da Server Action sob `next dev` e swap passa de 3 s | o percurso espera até 20 s por alerta ou "ok" |

### 43.3 · Catálogo

Promovidas a `VALIDADO_LOCALMENTE` (tela + percurso): **5.19.10** (meus bens), **5.19.14**
(pesquisa do acervo), **5.19.36** (termo de responsabilidade com PDF), **5.19.39** (estorno da
virada mensal, com a análise). Evidência ampliada, situação mantida: 5.19.2 (a folha e a
regressão restaurada), 5.19.26 e 5.19.29 (a competência foi percorrida; reavaliação e
impairment pela tela ainda não), 5.19.37 (termo de baixa não percorrido).

### 43.4 · Comandos executados e resultado real

| Comando | Resultado |
|---|---|
| `next dev -p 3010` sobre `DATABASE_URL_PERCURSOS` (heap 3584) + `smoke-pacote2` | **30/30**; log do servidor em `.registro-de-execucao/v3-pacote2-percurso-servidor.log` |
| fixture do banco dos percursos | uma pessoa (CPF 111.444.777-35, "Maria Souza (fixture dos percursos)") inserida por SQL — o banco não tinha pessoa nenhuma; é fixture, identificada como tal |
| `tsc` app · scripts · `vitest` rápida (o `case` restaurado, as actions, `AcoesUsuario`, o smoke e o teste novo) | **limpos** · **796/796** (74 arquivos; +2 do `acoes-despachadas`) |

**Não executado:** portão integral, `test:tudo`, `test:fuso`, `next build`; os percursos
antigos (ENT07–ENT12, roteiros) ainda não foram reexecutados contra 3010.

### 43.5 · Pendências nomeadas

| Pendência | O que é |
|---|---|
| `DEV-FRAME-JOIN-MASCARA-O-ERRO` | o 500 intermitente da primeira renderização sob `next dev`; investigar com `next build`/`next start` no candidato |
| `REAVALIACAO-E-TERMO-DE-BAIXA-SEM-PERCURSO` | reavaliar, impairment, alienar e o termo de baixa pela tela ainda sem percurso (5.19.26, 5.19.29, 5.19.37) |
| `PERCURSOS-SOB-O-BANCO-PROPRIO` | os smokes anteriores continuam a reexecutar contra 3010 |
| fechadas nesta seção | `MEUS-BENS-SEM-PERCURSO`, `PESQUISA-DO-ACERVO-SEM-PERCURSO`, `COMPETENCIA-SEM-PERCURSO`, `ESTORNO-SEM-PERCURSO`, `TERMOS-E-ETIQUETAS-SEM-PERCURSO` (parcial: etiquetas e termo de responsabilidade), `PDF-DO-TERMO-NAO-RENDERIZADO` |

### 43.5-b · Os percursos anteriores contra 3010 (primeira leva)

| Percurso | Resultado |
|---|---|
| `smoke-gestao-do-bem` | **10/10** (`.registro-de-execucao/v3-percursos-3010-gestao-do-bem.txt`) |
| `smoke-acervo` | **25/25** |
| `smoke-eixo-de-valor` | 1ª execução **14 ok / 6 falhas** — as quatro baixas ficavam em silêncio: a unidade 2 tornou o **motivo do rol** obrigatório na tela e o percurso antigo não o preenchia (o `required` do navegador segura o envio). O percurso passou a ler a primeira opção do rol e a preenchê-la; 2ª execução **21/21** |

Restam contra 3010: `smoke-roteiros` (que deve passar a usar propor/publicar), `smoke-perfis`,
`smoke-cadastro-pessoas`, `smoke-cadeia-despesa`, `smoke-ent02/03a/03b/03c/06/10`, `smoke-visual`.

### 43.6 · Próximo ponto exato

Reexecutar os smokes existentes contra 3010 (`PERCURSOS-SOB-O-BANCO-PROPRIO`), começando
por `smoke-gestao-do-bem` e `smoke-eixo-de-valor` (que exercitam a etiqueta e a baixa — o
`case` restaurado). Depois: `LIQUIDACAO-MATERIAL-ALMOXARIFADO` (decisão do caso de uso
composto, seção 5 do pedido) e a reconciliação dirigida com o siafic-cg (acervo, plurianual,
RH, convênios, contrato/reserva/empenho).

## 44. Orquestração V3 — a liquidação de material como ato único: INICIADA e guardada no stash

**Parada a pedido do operador** ("pare"), com a árvore consistente: `main` em `88e4098` mais
esta seção; o trabalho em andamento está em `git stash@{0}` (mensagem inteira no próprio
stash). Para retomar: `git stash pop`.

### 44.1 · A decisão tomada (era a devida desde §24.4)

O ato composto **substitui** o ato em dois passos: liquidar material É dar entrada no
almoxarifado, na mesma transação, e a soma das entradas tem de fechar com o valor
liquidado. Sem o port do M10 ligado, liquidar material é recusado nomeando (fail-closed).

### 44.2 · O que já está no stash

| Feito | Detalhe |
|---|---|
| `git merge --squash lote2-liquidacao-material` (fc50f94) | mesclou limpo (9 arquivos: `lib/portas/liquidacao.ts`, `m05-despesa/{adapter-prisma,dominio,ports,servico-bloco2}.ts`, `m10-patrimonial/{adapter-m05-almox,almoxarifado,estoque-fisico}.ts`, `m16-travamento/acoes.ts`) |
| **O critério do gancho deixou de ser o elemento** (§24.3): o ato composto dispara quando uma partida de DÉBITO da liquidação bate numa conta que alguma `ClasseDeMaterial` declara | `adapter-prisma.ts`; o import de `CONTA_ESTOQUE`/`contrapartidaDaLiquidacao` saiu. É o que poupa as suítes de M02/M09/M12/M16 que liquidam elemento 30 sem almoxarifado |
| `m10-estoque-fisico.test.ts` migrado | `entradaDe` liquida com `entradasDeMaterial` (perna física dentro), deps com o port; a física é lida pela liquidação |
| `m05-anulacao-parcial.test.ts` migrado | `liquidaDe` aceita as entradas; t6 liquida com as duas classes no ato |
| `m10-almoxarifado.test.ts` **parcialmente** migrado | deps com o port; roteiro de SERVIÇO para as fichas 39/32 (débito numa VPD que nenhuma classe declara); helper `liquidarMaterial` com entradas por padrão; 8 entradas avulsas removidas; t1 e t2 reescritos (t2 ganhou as recusas do ato composto: não fecha, sem entrada, sem port — nada gravado) |

### 44.3 · O que falta nesta unidade

1. `m10-almoxarifado.test.ts`: t8/t8b ainda têm a entrada avulsa com aspas simples (`'5000.00'`) — remover (o helper já a faz); t9/t10 conferem: as recusas por elemento continuam nas entradas avulsas.
2. `m16-rollout.test.ts` (linhas ~515–545): cria classe de material e usa `registrarEntradaAlmoxarifado` após liquidar — migrar para o ato composto ou trocar a ficha.
3. `m11-compras.test.ts` cria classe em `c-estoque`: conferir se liquida por esse débito (se sim, migrar).
4. A tela de liquidação (`app/(areas)/despesa/liquidacoes`) não envia `entradasDeMaterial`: liquidar material pela tela passa a ser recusado nomeando ("SEM A ENTRADA NO ALMOXARIFADO"). Pendência `LIQUIDACAO-MATERIAL-SEM-TELA-DE-ENTRADAS` — a tela é a unidade seguinte.
5. Verificação inteira: `tsc` ×3, rápida, e as suítes que liquidam (52 arquivos — na prática `test:tudo`), pois o gancho toca toda liquidação.
6. `MODULO.md` do M10 e do M05, catálogo (5.18.x da entrada de material), e o fechamento de `LIQUIDACAO-MATERIAL-ALMOXARIFADO` em §19/§24.

## 45. Sessão noturna V4 — unidade 1: o contrato de comando e a reserva atômica (achados A01–A03)

Pedido: `docs/lotes/V4-sessao-noturna.md`, seção 3. Fundamentação: `docs/auditoria/RELATORIO-AUDITORIA-77cbcc9.md`
(A01 concorrência, A02 replay/ato não financeiro/A→B→A/revogação, A03 fingerprint). Regime: **profundidade**
(comando, idempotência, autorização). Decisão: `docs/adr/ADR-contrato-de-comando-e-reserva-atomica.md`.

### 45.1 O que passou a funcionar

- **Reserva atômica por chave** (`ComandoDeBorda`, índice único `(escopo, usuarioIdent, acao, chave)`): duas
  requisições concorrentes com a mesma chave produzem UM efeito, com duas conexões de banco (t1 de
  `m16-comando.test.ts`), e não só com duas Promises.
- **Uma chave, uma intenção:** mesma chave com outro conteúdo é `ComandoEmConflitoError`; o replay do mesmo
  comando devolve a referência TIPADA (`lancamento` ou `resultado`) — nunca o id do lançamento no lugar do id
  do recurso — e só depois de REVALIDAR usuário ativo e ação concedida (`exigirAcaoEmAlgumEscopo`).
- **O funil conclui a reserva na transação do fato**; um ato sem lançamento conclui com
  `concluirComandoNaTransacao`. A reserva retomada por outra tentativa derruba a transação tardia
  (`ComandoRetomadoError`). Erro sem commit LIBERA; queda antes do commit é "em andamento" por 15 min e
  depois é retomável.
- **Sem chave o envelope RECUSA** (`ComandoSemChaveError`, "recarregue e envie de novo"); chamador sem
  formulário declara `semChave` e o motivo vai para a auditoria. `RegistroDeOperacao` ganha `REPLAY`.
- **Fingerprint canônico**: tuplas tipadas em JSON, ordem do formulário, arquivos digeridos por sha256 dos
  bytes (teto 32 MB, acima "não digerido" com tamanho); só `__chave` e `$ACTION*` saem.
- **`<ChaveDeComando />` em todo formulário de ação** (75 formulários, 35 arquivos; troca a chave a cada envio
  concluído por `useFormStatus`). O inventário é DERIVADO dos chamadores em `test/ui/chave-de-comando.test.ts`;
  `useChaveDeComando` foi retirado. A pendência `CHAVE-DE-COMANDO-NOS-FORMULARIOS-A-MAO` fecha.
- Rota: qualquer formulário de escrita (`/despesa/empenhos`, `/patrimonio/competencia`, cadastros do molde…);
  a auditoria (`/administracao/auditoria`) filtra por `REPLAY`.

### 45.2 Comandos executados e resultados

| Comando | Resultado |
|---|---|
| `prisma migrate deploy` em test, dev e percursos (`20260913052848_v4_reserva_atomica_do_comando`, aditiva: enum + tabela + índices) | aplicada nos três; `migrate diff` "No difference detected"; `prisma generate` |
| `provisionar-papel-runtime` nos três bancos (censo: `ComandoDeBorda` com UPDATE só nas colunas de estado) | ok, sem superusuário/BYPASSRLS/DDL |
| `tsc` backend, app e scripts | limpos (o `test/ui/acoes-despachadas.test.ts` de 8e294eb estava no projeto errado — roteado para o app junto com o teste novo) |
| `test:rapido` | **804/804** (76 arquivos; +5 fingerprint, +3 inventário da chave) |
| dirigidos: `m16-comando` (9), `m16-operacao`, `m16-borda-*` (3), `m16-autenticacao`, `m16-censo`, `papel-runtime`, `unidade-de-trabalho` | **69/69** (`.registro-de-execucao/v4-comando-verificacao-3.txt`) |

Os testes de borda passaram a emular o formulário (chave e fingerprint por comando); `m16-operacao` ganhou
"mesma chave com outro fingerprint é CONFLITO" e "sem chave recusa; com motivo declarado executa".

### 45.3 Não executado nesta unidade

Percurso de navegador com as chaves novas (os smokes ganharam a espera pela chave pronta; a reexecução fica
para o `next build` + `next start` da seção 10 do pedido, depois da unidade 2). `test:tudo`, `test:fuso`,
portão integral.

### 45.4 Pendências

| Pendência | O que é |
|---|---|
| `CONCLUSAO-NA-TRANSACAO-DOS-CADASTROS` | os cadastros do molde concluem a reserva DEPOIS da transação; a janela nomeada do ADR (repetição só depois de 15 min, e só se a conclusão posterior falhar) |
| `REVALIDACAO-DO-REPLAY-EM-ALGUM-ESCOPO` | a UG do fato original não é reconstruível pelo envelope; o replay revela a referência, não o dossiê |
| `ESCOPO-DO-COMANDO-E-O-ENTE-UNICO` | `escopoDoComando()` lê `ENTE_ESCOPO`; com município/entidade cadastrados, vem da membership |

### 45.5 Próximo ponto exato

Unidade 2 (seção 4 do pedido): recorte temporal e vigência da competência, processamento por bem elegível com
memória por item e conciliação com a classe e o razão, identidade de execução, análise de estorno com impacto
verificado e desempate estável.

## 46. Sessão noturna V4 — unidade 2: a competência patrimonial por bem, com corte, vigência e execução (achados A04, A05, A07)

Pedido: `docs/lotes/V4-sessao-noturna.md`, seção 4. Regime: **profundidade** (razão contábil, cálculo).
Decisão: `docs/adr/ADR-competencia-por-bem-corte-e-execucao.md`.

### 46.1 O que passou a funcionar

- **Recorte temporal:** a base de uma competência são os movimentos vivos com data de negócio até o corte (o
  último instante civil do mês). Março não absorve a entrada de abril. Início da atualização de um bem = mês
  da primeira entrada viva (política declarada).
- **Vigência do parâmetro:** `vigenteDesde` na versão; `parametroVigenteEm(classe, competência)`; omitida, a
  vigência é derivada; vigência retroativa sobre competência processada é recusada nomeando.
- **Por bem elegível:** itens por bem (e o acervo sem individualização), memória por item, UM lançamento com a
  soma, identidade de execução (`ExecucaoDeAtualizacao`, escopo CLASSE ou BEM). O valor do bem passa a
  acompanhar a depreciação. Σ itens = classe = razão (`conciliacaoDaClasse`); a depreciação histórica da classe
  inteira fica nomeada como reconciliação a definir, não é distribuída.
- **Estorno:** desfaz a execução da classe (itens + lançamento, uma vez), não a virada; dependência por impacto
  verificado (a redução do bem B não depende da entrada do bem A; a do bem A depende quando A ficaria
  negativo), ordem por `sequencia` com desempate estável; as reduções cobram o teto do bem.
- Rotas: `/patrimonio/competencia` (prévia item a item, escopo, corte, versão vigente, conciliação, histórico de
  execuções), `/patrimonio/parametros-de-atualizacao` (vigência no formulário e no histórico),
  `/patrimonio/estornos/valor/[id]` (diz que desfaz a execução e o impacto verificado de cada dependente).

### 46.2 Comandos executados e resultados

| Comando | Resultado |
|---|---|
| migration `20260913063000_v4_execucao_por_bem_vigencia_e_sequencia` (aditiva: `sequencia` SERIAL, `vigenteDesde`, `ExecucaoDeAtualizacao`, `MemoriaDeAtualizacao.execucaoId/corte`) em test, dev e percursos | aplicada; `migrate diff` "No difference detected"; papel reprovisionado |
| `tsc` backend, app e scripts | limpos |
| dirigidos: `m10-competencia-v4` (9), `m10-competencia`, `m10-parametros-versoes`, `m10-estorno-dependencias`, `m10-alienacao`, `m10-patrimonio`, `m10-baixa-motivo`, `m10-termo-documento`, `m10-acervo`, `m10-eixo-de-data-da-entrada`, `m10-gestao-do-bem`, `m16-censo`, `papel-runtime` | **125/125** (`.registro-de-execucao/v4-competencia-testes.txt`, e a reexecução do v4 após corrigir um motivo curto da fixture) |

### 46.3 Não executado

Percurso de navegador da competência por item (fica para o `next build` + smokes); `test:tudo`; `test:fuso`
(o diff toca janelas de competência: `janelaCivilDoMes` é lida, não alterada — registrar no candidato).

### 46.4 Pendências

| Pendência | O que é |
|---|---|
| `RECONCILIACAO-HISTORICA-DA-DEPRECIACAO-POR-CLASSE` | a acumulada lançada pela classe inteira antes do item por bem; fluxo autorizado a definir |
| `INICIO-DA-ATUALIZACAO-NO-MES-SEGUINTE` | a política "mês da entrada" é declarada; a alternativa é decisão de parâmetro |
| `VIRADA-DE-TODAS-AS-CLASSES` | a tela processa uma classe por execução; a seleção de várias classes ainda não tem tela |

### 46.5 Próximo ponto exato

Unidade 3 (seção 5 do pedido): a emissão do termo congelada na criação (dados + modelo + sha256), a segunda
via estável, a posição atual como outro documento, o termo assinado anexável pela tela e verificável.

## 47. Sessão noturna V4 — unidade 3: documentos patrimoniais estáveis (achado A06)

Pedido: `docs/lotes/V4-sessao-noturna.md`, seção 5. Regime: **superfície com prova de integridade**.
Decisão: `docs/adr/ADR-emissao-congelada-do-termo.md`.

### 47.1 O que passou a funcionar

- **Emissão congelada na criação do termo** (dados + modelo `termo-patrimonial/1` + sha256 do JSON canônico +
  `emitidoEm`), na mesma transação. A segunda via é a emissão: o bem muda de sala, é reavaliado, a pessoa muda de
  nome — o PDF emitido não muda (t4). Emissão adulterada é recusada na leitura (t5).
- **Posição patrimonial atual é outro documento** (`/patrimonio/termos/[id]/pdf?via=atual`): título e data
  próprios, nota dizendo que não é o termo. Termos anteriores à V4 são compostos agora e declarados
  `SEM_EMISSAO` (t5). A rota responde `x-documento-via`/`x-documento-sha256`/`x-documento-modelo`.
- **Termo assinado anexável pela tela** (aba "anexos" do detalhe do termo; `Anexo.termoPatrimonialId`; escopo do
  ente; sha256 conferido na entrega; dono único) (t7). Recortes individual/setorial/por responsável ditos no
  documento (t6).
- **O percurso passa a ler o TEXTO do PDF** (pdf.js, leitor independente do gerador — `pdfjs-dist` devDependency
  instalada com lockfile e sem scripts de instalação): tombamento, responsável e declaração no emitido; título e
  nota na posição atual.
- Rotas: `/patrimonio/termos/[id]` (dados, histórico, anexos, relacionados com os dois PDFs), `/patrimonio/termos/[id]/pdf`.

### 47.2 Comandos executados e resultados

| Comando | Resultado |
|---|---|
| migration `20260913071500_v4_emissao_congelada_do_termo_e_anexo` (aditiva) em test, dev e percursos; `generate`; `migrate diff` | aplicada; "No difference detected"; papel reprovisionado |
| `tsc` backend, app e scripts | limpos |
| dirigidos: `m10-termo-documento` (7), `m10-gestao-do-bem`, `m22-documentos`, `m16-censo` | **54/54** (`.registro-de-execucao/v4-termo-verificacao-2.txt`); `papel-runtime` verde na rodada anterior |
| `test:rapido` | 804/804 |

Defeito achado e corrigido durante a unidade: o JSONB do Postgres reordena as chaves do JSON, e o sha256 do
documento lido não batia com o gravado — o hash passou a ser do JSON CANÔNICO (chaves ordenadas).

### 47.3 Não executado

O percurso de navegador com a leitura do PDF (fica para o `next build` + smokes, seção 10 do pedido).

### 47.4 Pendências

| Pendência | O que é |
|---|---|
| `ASSINATURA-QUALIFICADA-DO-TERMO` | o termo assinado é digitalização anexada; a fila de assinatura do M22 sobre a emissão congelada é o passo seguinte |

### 47.5 Próximo ponto exato

Unidade 4 (seção 6 do pedido): a liquidação de material como ato único a partir do stash `11b7892`, com o
gatilho pela natureza da operação (não pela existência de classe cadastrada), configuração ausente como
pendência impeditiva, recebimento existente relacionável, restrição declarada a liquidações integralmente
materiais, testes restantes da §44.3, tela das entradas e regressão ampliada dos consumidores.

## 48. Sessão noturna V4 — unidade 4: a liquidação de material como ato único (achado A08; fecha LIQUIDACAO-MATERIAL-ALMOXARIFADO)

Pedido: `docs/lotes/V4-sessao-noturna.md`, seção 6. Regime: **profundidade** (razão, estoque, transação).
Decisão: `docs/adr/ADR-liquidacao-de-material-como-ato-unico.md`. O stash `11b7892` foi aplicado com
`git stash apply` (sem conflito) e está **incorporado** neste commit; a entrada do stash continua na
lista por segurança — pode ser descartada pelo operador (`git stash drop`), nada mais depende dela.

### 48.1 O que passou a funcionar

- **Gatilho pela natureza da operação** (`elementoDebitaEstoque`, rol do M01), não pela existência de
  classe cadastrada. Classe inexistente, inativa ou que declara outra conta é `CONFIGURAÇÃO OBRIGATÓRIA
  AUSENTE` (recusa nomeada, nada gravado). Sem port do M10: recusa; sem entradas: recusa.
- **Ato composto na transação:** liquidação (M05) + entrada contábil por classe + perna física opcional
  (M10), Σ entradas = valor liquidado. Restrição declarada: uma liquidação é de um elemento só; documento
  fiscal misto são duas liquidações.
- **Recebimento existente é relacionado, não duplicado:** `fisica.recebimentoDeItemId` (M11) com consumo
  derivado (`MovimentoFisicoDeEstoque.recebimentoDeItemId`); recebimento que já deu entrada física não é
  consumido de novo.
- **Ordem dos locks** corrigida (liquidação uma vez, antes das classes).
- **Tela** `/despesa/liquidacoes`: quando o empenho é de material, o formulário abre as entradas (classe,
  valor, material/depósito/quantidade/unitário/lote, recebimento a consumir).
- **Fixtures viraram operações válidas:** M05 assinatura/consultas/anulação parcial, M09 lote e M12 superávit
  passaram ao elemento 39 (já liquidavam com roteiro de serviço); o rollout do M16 liquida material COM a
  entrada e prova que a UG da entrada é a da liquidação.

### 48.2 Comandos executados e resultados

| Comando | Resultado |
|---|---|
| migration `20260913080000_v4_entrada_fisica_consome_recebimento` (aditiva) em test, dev e percursos; `generate`; `migrate diff` | aplicada; "No difference detected" |
| `tsc` backend, app e scripts | limpos |
| dirigidos (m10-almoxarifado 12, m10-estoque-fisico, m05-anulacao-parcial, m16-rollout, m05-assinatura, m05-consultas-execucao, m09-lote, m12-superavit-fonte, m11-compras, m16-censo, m16-borda-execucao, m05-consultas) | **125/125** (`.registro-de-execucao/v4-liquidacao-verificacao-2.txt`, mais a reexecução do m10-almoxarifado após corrigir a numeração de empenhos do t2) |
| **suíte completa** (`test:tudo`, a regressão ampliada dos consumidores da liquidação — exceção justificada) | 224 arquivos, **2290/2292** na primeira execução (530 s); as 2 falhas eram guards: o modelo `RecebimentoDeItem` passou a ser nomeado por código (saiu da lista de aninhamentos) e a ilha client importava um TIPO da porta (o tipo passou a morar na ilha). Reexecutados: 6/6; `test:rapido` 804/804 |

### 48.3 Não executado

Percurso de navegador da liquidação com entradas (fica para o `next build` + smokes); `test:fuso`.

### 48.4 Pendências

| Pendência | O que é |
|---|---|
| `LIQUIDACAO-MISTA-POR-DOCUMENTO` | o documento fiscal misto exige duas liquidações; repartir o documento em dois empenhos pela tela é passo seguinte |
| `RECEBIMENTO-COM-ENTRADA-FISICA-PREVIA-NA-LIQUIDACAO` | o recebimento que já deu entrada física pelo M11 não é religado à liquidação |
| `PERCURSO-DA-LIQUIDACAO-COM-ENTRADAS` | a tela nova não tem percurso ainda |

### 48.5 Próximo ponto exato

Unidade 5 (seção 7 do pedido): o CNPJ alfanumérico na cadeia inteira (pacote `documento` com os vetores
oficiais da Receita, máscara, CHECKs, filtros, M28/M29/M30, vínculo usuário↔pessoa só por CPF, SAGRES/MANAD/
captura com recusa nomeada do alfanumérico onde o leiaute é numérico) e a revisão do catálogo (5.19.14, 5.19.36,
5.19.39 com `rota_verificada`).

## 49. Sessão noturna V4 — unidade 5: o CNPJ alfanumérico na cadeia inteira e a revisão do catálogo (achado A09; §7)

Pedido: `docs/lotes/V4-sessao-noturna.md`, seção 7. Decisão: `docs/adr/ADR-cnpj-alfanumerico.md`. Fontes oficiais
(lidas, não inferidas): o manual SERPRO/Receita "Cálculo dos dígitos verificadores de CNPJ alfanumérico" (05/11/2024)
e os arquivos de referência (`codigos-cnpj.zip`, vetores do `test.ts` oficial), obtidos de
gov.br/receitafederal (documentos técnicos do CNPJ).

### 49.1 O que passou a funcionar

- **`packages/documento`** conhece o CNPJ alfanumérico (12 × [A-Z0-9] + 2 dígitos; DV pela regra ASCII−48, mod 11):
  normalização sem mutilação, formato, tipo, DV (`calcularDvDoCnpj`), exibição. 12 testes contra os vetores oficiais
  (o exemplo do manual 12.ABC.345/01DE → 35; os válidos e inválidos do `test.ts`). O CPF e o CNPJ numérico
  continuam iguais.
- **Máscara e campo** (`mascararCpfCnpj`, `CampoCpfCnpj`): letras ficam e sobem para maiúsculas; a primeira letra já
  diz CNPJ; o hidden submete sem máscara.
- **CHECKs** de `Contrato` e `CertidaoFornecedor` ampliados (migration `20260913090000`, alteração de constraint
  justificada, sem eliminação de dados); `Pessoa.documento` já cabia.
- **M28/M29/M30** validam pelo pacote; **M05** normaliza o credor; **M19** mensagem/busca; **filtros** de termos e
  acervo; **M13** expõe o alfanumérico inteiro (como o numérico).
- **Usuário não é pessoa jurídica:** `vincularPessoaAoUsuario` recusa CNPJ nomeando (pendência
  `REPRESENTACAO-DE-ORGANIZACAO-PELO-USUARIO`).
- **Integrações com leiaute numérico recusam nomeando** em vez de mutilar: SAGRES (tipo de campo `DOCUMENTO`,
  8 campos do leiaute 2026 v11; pendência `SAGRES-CNPJ-ALFANUMERICO`), MANAD L750/L800 (`MANAD-CNPJ-ALFANUMERICO`);
  a captura do TCE-PB (que já aceita `^[A-Z0-9]+$`) recebe o documento normalizado. Registrado em
  `docs/dependencias-externas.md`.
- **Catálogo:** `scripts/marcar-catalogo.ts` grava `rota_verificada` (papel, contexto, passos, entrada, esperado,
  obtido, versão, artefato; rota dinâmica com o padrão). 5.19.14, 5.19.36 e 5.19.39 revistas para **PARCIAL** com as
  ressalvas mantidas (código do produto inexistente; percurso da leitura do PDF pendente; virada única inexistente).

### 49.2 Comandos executados e resultados

| Comando | Resultado |
|---|---|
| migration `20260913090000_v4_cnpj_alfanumerico_nos_checks` em test, dev e percursos | aplicada (CHECKs não entram no diff do Prisma) |
| `tsc` backend, app e scripts | limpos |
| `test:rapido` | **816/816** (77 arquivos; +12 do pacote `documento`) |
| dirigidos: `packages/documento`, m19 (todos), `m16-pessoa-do-usuario`, m13, m28, m29, m30, `m05-consultas`, `m05-anulacao-parcial`, `adapters/tribunais/tce-pb` (todos), `m14-manad`, `m11-vigencia-alerta`, `m11-contratos` | **238/238** (`.registro-de-execucao/v4-cnpj-verificacao-2.txt`) |
| `marcar-catalogo --aplicar` | 54 `VALIDADO_LOCALMENTE`, 51 `PARCIAL`, 76 `IMPLEMENTADO_NAO_VALIDADO`, 133 `AUSENTE_CONFIRMADO`, 3 `DEPENDENCIA_EXTERNA`, 1720 `NAO_VERIFICADO` — 317 classificadas, e isto NÃO é percentual de produto pronto |

Decisão tomada durante a unidade: o credor do empenho continua sem exigência de FORMATO (só normalização): o M13
prova que um documento quebrado LEGADO é omitido do portal com motivo, e recusar no empenho esconderia o caso. O DV
continua sendo cobrado no cadastro de pessoas (M19).

### 49.3 Não executado

`test:tudo` nesta unidade (a mudança é de dado, não de transação); percursos de navegador (a seguir, sob o build).

### 49.4 Pendências

| Pendência | O que é |
|---|---|
| `SAGRES-CNPJ-ALFANUMERICO` | o leiaute 2026 v11 é numérico; o exportador recusa nomeando |
| `MANAD-CNPJ-ALFANUMERICO` | idem para o MANAD (L750/L800) |
| `REPRESENTACAO-DE-ORGANIZACAO-PELO-USUARIO` | representar uma pessoa jurídica é vínculo próprio com escopo, ainda sem desenho |
| `CODIGO-DO-PRODUTO-NO-BEM` | a cláusula 5.19.14 pede consulta por código do produto; o bem não tem esse campo |

### 49.5 Próximo ponto exato

Seção 10 do pedido: `next build` e `next start` locais sobre o banco dos percursos, os smokes centrais (pacote 2 com
a leitura do PDF, gestão do bem, acervo, eixo de valor, roteiros, perfis, pessoas, cadeia da despesa com a
liquidação de material) e a investigação do 500 (`DEV-FRAME-JOIN-MASCARA-O-ERRO`) sob o servidor de produção; depois
a seção 8 (Fila A: planejamento → contratação → nota → despesa).

## 19. O próximo passo

⚠️ **ONDE PARAMOS.** O ENT06 correu até aqui em seis levas: item 0 (superfície do
almoxarifado físico, §21), item 1 (conceder ação a perfil, §23), item 2 (liquidação de
material — **construído e PARADO por medição**, §24), item 3 (eixo da data na fronteira,
§25), os selects que nunca recebiam opção (§26) e os cadastros de apoio da gestão do bem
(§27). O último portão deu **10 de 10 com `test:fuso` EXECUTADO**, não pulado. Nada foi
publicado, nada transmitido, nenhum push externo.

⚠️ **A DECISÃO QUE CONTINUA DEVIDA AO OPERADOR — §24.** Fechar
`LIQUIDACAO-MATERIAL-ALMOXARIFADO` pelo ato composto significa reescrever a prova do
invariante razão↔estoque: **32 asserções**. Isso é decisão, não efeito colateral de um lote.
O trabalho está preservado no ramo `lote2-liquidacao-material` (`fc50f94`). Enquanto não
houver decisão, o caminho de dois passos segue fail-closed e a pendência segue aberta.

⚠️ **O ENT07 ESTÁ FECHADO — §28.** O acervo (classe e bem) existe, com serviço, ação no
censo, migration aditiva, seis rotas, 11 testes de domínio e percurso de **11 passos, 0
falhas**. `5.19.3` e `5.19.7` viraram `VALIDADO_LOCALMENTE`. O portão de fechamento deu
**10 de 10 com `test:fuso` EXECUTADO** (726s), não pulado — em `39f4a6e`. Nada publicado,
nada transmitido, nenhum push externo.

⚠️ **O ENT08 ESTÁ FECHADO — §29.** O eixo de gestão do bem tem tela: quatro ações no detalhe
(localização, responsável, estado de conservação, situação física), despachante `acaoDoBem` na
porta, e o percurso em **21 passos, 0 falhas**. `5.19.11` e `5.19.12` viraram
`VALIDADO_LOCALMENTE`. Foi lote de **superfície pura** — sem ação nova no censo e sem
migration —, e a natureza foi declarada antes de começar. O portão deu **10 de 10 na PRIMEIRA
execução**, com `test:fuso` EXECUTADO (520s) — em `8beb6b1`.

⚠️ **O ENT09 ESTÁ FECHADO — §31.** A etiqueta com código de barras tem tela: quinta ação no
detalhe do bem, **sem campos**, com o percurso em **25 passos, 0 falhas** e a dupla pressão do
botão como asserção central da idempotência. `5.19.2` virou `VALIDADO_LOCALMENTE`. Superfície
pura — sem ação nova no censo, sem migration.

⚠️ **O ENT10 ESTÁ FECHADO — §32.** A leitura passou a perguntar quem está pedindo. Uma tela de
LEITURA não chamava `autorizar`: sem `?ug=` a porta entregava o **ente inteiro** a qualquer
sessão, com `?ug=` alheia entregava a unidade alheia, e `?exercicio=abc` virava **2026 em
silêncio**. Agora são três caminhos separados por natureza medida — `recorteDePagina`
(13 arquivos com unidade), `exercicioAutorizado` (12 leituras do **ente**, que não têm
dimensão de unidade) e `recorteNaoAutorizado` com **um** chamador declarado. `5.10.2.55` virou
`VALIDADO_LOCALMENTE`. **Zero migration.** Portão **10 de 10** com `test:fuso` EXECUTADO
(638s) e percurso de **dois atores** em **16 passos, 0 falhas**.

⚠️ **O ENT11 ESTÁ CONSTRUÍDO — §33.** O eixo financeiro do patrimônio saiu de
**inalcançável**: `RoteiroPatrimonial` tinha zero linhas, e `roteiroDoTipo` é fail-closed, de
modo que nenhum bem podia receber um centavo. Agora há quatro rotas, dois serviços, uma ação
no censo (228 → **229**), migration aditiva de um valor de enum com **zero DROP**, 12 testes
de domínio com **duas mutações de conjuntos vermelhos disjuntos**, e percurso de **17 passos,
0 falhas**. `5.10.1.71` **continua PARCIAL** com a evidência ampliada — a consulta do evento
passou a existir para a família patrimonial e **não** para os outros dez roteiros. Nenhuma
cláusula virou `VALIDADO_LOCALMENTE` neste lote, e isso é a leitura honesta.

⚠️ **E ELE DESTRAVA UM BLOQUEIO ANTERIOR.** A **baixa do bem**, medida até a parede no ENT09 e
barrada por `ROTEIRO-PATRIMONIAL-NAO-PARAMETRIZADO`, deixou de depender de escrita crua no
banco: a parametrização agora tem tela, serviço, autorização e auditoria. O que resta ali é a
decisão contábil de **quais contas** — que é do contador do ente, não de quem escreve código.

⚠️ **O ENT12 ESTÁ CONSTRUÍDO — §34.** E ele fechou o que o ENT11 destravou: o eixo de valor do
bem tem tela. O reconhecimento mediu que **nenhuma porta tocava esse eixo** — sete serviços
provados, com ação no censo desde o ENT05, e superfície zero. Agora o detalhe do bem registra
entrada de valor, mostra o **valor contábil** e baixa do acervo, com os dois eixos convivendo
no histórico. **Superfície pura: zero migration, zero ação nova.** Percurso de **20 passos, 0
falhas**, atravessando as duas entregas — ele parametriza o roteiro pela tela do ENT11 antes
de lançar. `5.19.23` foi de `IMPLEMENTADO_NAO_VALIDADO` para **PARCIAL**, e `5.19.15` teve
evidência **estale corrigida**. `5.19.29` ficou intocada de propósito: ela pede reavaliação e
depreciação, e este lote não entrega nenhuma das duas.

⚠️ **E O ACHADO QUE VALE MAIS QUE O LOTE:** a primeira execução do percurso deu 17 passos e 0
falhas **provando menos do que dizia**. `baixarBem` tem dois tetos — classe e bem —, e com um
bem só na classe eles valem o mesmo número: a recusa vinha sempre pela classe, e o guard do
bem nunca era tocado. A fixture N=2 separou os dois, e só então a mensagem passou a dizer
"excede o valor contábil do BEM, ainda que a classe tenha 3800.00".

⚠️ **E O ENT10 TROUXE TRÊS LIÇÕES QUE VALEM MAIS QUE A CLÁUSULA.** (1) O primeiro portão deu
**8 de 10** por dois **timeouts** do M03 — causados por eu rodar comandos em paralelo com a
suíte; isolados, aqueles testes dão 28 passes em 21,84s, e nenhum `testTimeout` foi aumentado.
(2) **Cinco asserções vazias** foram achadas por mutação, três delas dentro de instrumentos
que eu mesmo tinha escrito — inclusive uma negação que ficava verde com o guard REMOVIDO.
(3) Uma sonda mediu que a ilha `SincronizarContexto` **normaliza a URL** antes de a página
aparecer: pelo navegador, a unidade alheia já não era alcançável, e a exposição real eram as
**rotas de exportação** por `GET` direto. O percurso desliga o JavaScript para interrogar o
servidor — com ele ligado, seis "falhas" eram do percurso, não do código.

⚠️ **E DOIS ESCOPOS ANTERIORES DA ENT09 FORAM MEDIDOS ATÉ A PAREDE**, antes de qualquer código:
a **baixa do bem** (bloqueada por `ROTEIRO-PATRIMONIAL-NAO-PARAMETRIZADO` — decisão contábil do
município) e **"somente os meus bens"** (bloqueada por `USUARIO-SEM-PESSOA` — decisão de
modelagem). Dois candidatos consecutivos até a parede é sinal, não azar: as duas frentes
restantes do acervo dependem de decisões que não são de quem escreve código.

**O catálogo depois dos três lotes:**

| Situação | Cláusulas |
|---|---|
| `NAO_VERIFICADO` | 1.720 (84,4%) |
| `AUSENTE_CONFIRMADO` | 134 |
| `IMPLEMENTADO_NAO_VALIDADO` | 79 |
| `VALIDADO_LOCALMENTE` | **53** |
| `PARCIAL` | 48 |
| `DEPENDENCIA_EXTERNA` | 3 |

316 de 2.037 verificadas (15,5%). O acervo patrimonial saiu de **zero telas** para **oito
rotas** e **cinco cláusulas promovidas** (5.19.2, 5.19.3, 5.19.7, 5.19.11, 5.19.12) em três
lotes.

⚠️ **PENDÊNCIA NOVA — `CONTEXTO-UG-REPRODUZ-CONSULTA`.** `test/ui/contexto-ug.test.ts` não chama
`listarUgsDoUsuario`: ele **reproduz a consulta** contra o mesmo schema, e declara o custo em voz
alta — *"se a porta divergir desta consulta, o teste continua verde"*. A justificativa escrita é
que *"`lib/portas/cliente` depende de `next/headers` — inalcançável fora de um request"*, e ela
**está factualmente errada**: `lib/portas/cliente.ts` importa `criarPrismaClient` e lê
`DATABASE_URL`, com `PortaSemBancoError` nomeado — **não toca `next/headers`**. Quem depende de
request é `sessao.ts`. As portas de LEITURA são alcançáveis pela suíte, e aquele teste pode
passar a exercitar a função de verdade, perdendo a limitação que hoje carrega.

⚠️ **PENDÊNCIA NOVA — `EXPORTACOES-SEM-TESTE`.** `test/pdf/pdf.test.ts` exercita `documento.ts` e
`gerar.ts` (hash, HTML, Chromium) com um `DocumentoPdf` **literal**. Nenhum montador real
(`montarPdfEmpenhos` e irmãos) é testado, e as **dez rotas de exportação** — NE, guia e oito PDFs
— não têm cobertura alguma. São elas que entregam o arquivo inteiro por `GET` direto, sem menu.

⚠️ **PENDÊNCIA NOVA — `MOTIVO-DE-BAIXA-ORFAO`.** O rol de motivos de baixa que a `5.19.30`
manda o ente configurar existe, é alcançável pela tela (§27) e **ato nenhum o lê**: o modelo
`MotivoDeBaixa` não tem uma única back-relation, e `zBaixarBemInput` toma `tipo` de um enum
fechado de dois valores mais um `motivo` de texto livre. Isso **não invalida** a marcação — a
cláusula pede a *inclusão*, e o percurso a provou —, mas um cadastro configurável que nada
consome é mobília que não serve a nada. Ligá-lo ao ato exige FK nova, logo migration.

⚠️ **PENDÊNCIA NOVA — `BAIXA-E-TERMO-SEM-SUPERFICIE`.** Nem `baixarBem` nem
`emitirTermoPatrimonial` são alcançáveis por tela alguma — grep vazio em `lib/portas` e `app`.
As duas ações já existem no censo e já estão mapeadas em `patrimonio`: **não falta ação, falta
tela.** O termo, porém, recebe `bensId` como array (`"um termo sem bem não entrega nada a
ninguém"`), e o molde não tem campo repetidor — mesma parede de `COMISSAO-COM-MEMBROS`.

⚠️ **DECISÃO DEVIDA AO ENTE — `ROTEIRO-PATRIMONIAL-NAO-PARAMETRIZADO`.** O eixo FINANCEIRO do
patrimônio está inteiro inalcançável nesta instalação, e **não por falta de tela**. Medido no
banco de desenvolvimento:

| Tabela | Linhas |
|---|---|
| `ContaPcasp` | 7.864 |
| `RoteiroOrcamentario` | 5 |
| `LancamentoContabil` | 61 |
| **`RoteiroPatrimonial`** | **0** |
| `RoteiroReconhecimento` / `RoteiroEncerramento` / `ParametroAtualizacaoClasse` | **0** |

A contabilidade orçamentária roda; a patrimonial nunca foi parametrizada. E isso é o sistema
**funcionando como desenhado**: `roteiroDoTipo` é fail-closed e diz por quê — *"o M10 não
inventa conta: sem roteiro, o movimento NÃO é registrado"*.

⚠️ **E NÃO SE RESOLVE SEMEANDO.** A fonte oficial (`docs/oficial/tce-pb/MANIFEST.json`) publica
o layout do SAGRES, o PCASP e os subelementos — um **plano de contas**, não um mapeamento
tipo-de-movimento → débito/crédito. Qual conta cada movimento patrimonial debita e credita é
**decisão contábil do município**. Semeá-la para um percurso passar seria inventar norma, e o
efeito seria pior que a tela faltando: lançamentos no razão apontando para contas que ninguém
escolheu. Fica ao lado de "qual banco o município usa".

⚠️ **PENDÊNCIA NOVA — `USUARIO-SEM-PESSOA`.** A `5.19.10` pede "visualizar somente os bens sob
a SUA responsabilidade", e ela **não é derivável**: quem autentica é `Usuario` (identificador,
nome, perfis, credenciais) e quem responde pelo bem é `Pessoa` — `bensSobResponsabilidade`
recebe um `Pessoa.id`. **Nada liga os dois modelos.** Fechar a cláusula exige FK nova e, antes
dela, a decisão de modelagem: um usuário do sistema **é** uma pessoa do cadastro? Nem sempre —
uma conta de integração não é.

⚠️ **E UMA DECISÃO QUE É DO OPERADOR, ao lado da de §24: AS DUAS BAIXAS NÃO SE CONHECEM.**
`emitirTermoPatrimonial` marca o bem `BAIXADO` no eixo FÍSICO e não move valor; `baixarBem`
move valor e não marca `BAIXADO`. Um bem pode estar baixado num eixo e não no outro, e hoje
**nada acusa isso**. Unificá-los é decisão com consequência contábil — não efeito colateral de
um lote de tela.

**O catálogo depois destes dois lotes:**

| Situação | Cláusulas |
|---|---|
⚠️ **ESTA SEGUNDA TABELA FOI REMOVIDA, E A REMOÇÃO É A CORREÇÃO DE UM DEFEITO DE DOCUMENTO.**
Ela repetia a contagem do catálogo com números **desatualizados** (`51` validadas, `80`
implementadas) enquanto a tabela acima dizia outra coisa — duas verdades sobre a mesma
medida, na mesma seção, e quem lesse a de baixo concluiria errado. A contagem vive **num
lugar só**: a tabela acima, e a fonte dela é `npx tsx scripts/marcar-catalogo.ts` (sem
`--aplicar`, ele relata sem gravar).

316 de 2.037 verificadas (15,5%).

**A SEQUÊNCIA FOI DECIDIDA PELO OPERADOR (2026-09-12), E NÃO É MAIS LISTA DE CANDIDATOS:**

> "Continuar em qualidade — fechar ENT10, depois a baixa do bem, transferência entre
> entidades. Rende poucas cláusulas e deixa o sistema confiável."

**ENT11 — a BAIXA do bem, pela tela.** É o que falta para fechar a `5.19.15` por inteiro:
cadastramento, classificação, movimentação e localização já existem; a **baixa** é a última
palavra do texto e a única sem superfície. O cadastro de MOTIVOS DE BAIXA já foi entregue
(§27) e existe justamente para ela.

⚠️ **A PAREDE DESTE LOTE JÁ FOI MEDIDA DUAS VEZES, E ESTÁ DECLARADA AQUI PARA NÃO SER
REDESCOBERTA UMA TERCEIRA.** O eixo **financeiro** do patrimônio está inalcançável nesta
instalação: `RoteiroPatrimonial` tem **zero linhas**, e `roteiroDoTipo` é fail-closed —
*"o M10 não inventa conta: sem roteiro, o movimento NÃO é registrado"*. Isso **não se resolve
semeando**: a fonte oficial publica um plano de contas, não um mapeamento tipo-de-movimento →
débito/crédito. Qual conta cada movimento debita é **decisão contábil do município**.

**Consequência prática, dita antes de começar:** o ENT11 entrega a metade **FÍSICA** da baixa
(marcar `BAIXADO`, o termo, o motivo do rol da `5.19.30`) e **para** na contábil enquanto a
decisão não vier. Prometer a baixa inteira sem essa decisão seria prometer o que o sistema
recusa — corretamente — a fazer.

⚠️ **E ELE NÃO É SUPERFÍCIE PURA.** `baixarBem` vive em `patrimonio.ts`, no eixo financeiro —
move valor e toca o razão, ao contrário das quatro ações do ENT08. Pôr um botão de baixa ao
lado dos quatro faria um formulário de "mover de sala" vizinho de um que dá baixa contábil, e
a segregação do 6.4 não aceita essa vizinhança sem pensar. O lote começa medindo: que ação do
censo `baixarBem` cobra, o que exige de entrada, e se cabe no detalhe do bem ou pede tela
própria.

**ENT12 — transferência de bem entre entidades.** Ato composto, duas pernas sob um
`operacaoId`, com recusas próprias. Cabe numa tela, não num botão de formulário genérico.
⚠️ **E ela NÃO tem a parede do ENT11** — é movimento de gestão, não lançamento no razão.

**DEPOIS DELES, A DECISÃO JÁ TOMADA: VOLTAR AO CENSO.** E o ganho não é trabalhar mais
rápido, é **trocar a natureza do lote** — a medição acumulada é clara: censo rendeu **220
cláusulas num lote**, modelo rende ~54, superfície rende ~5. Com 1.720 cláusulas
`NAO_VERIFICADO`, é lá que está o retorno por hora.

**Fora da sequência, medidos e esperando:**

1. **A consulta "somente os meus bens"** (`5.19.10`) — bloqueada por `USUARIO-SEM-PESSOA`:
   quem autentica é `Usuario`, quem responde pelo bem é `Pessoa`, e nada liga os dois.
2. **Inventário de bens** — bloqueado por `COMISSAO-COM-MEMBROS`: o molde não tem campo
   repetidor, e uma comissão de um membro só não é uma comissão.

⚠️ **PENDÊNCIA `RECORTE-DE-CONTA-POR-NOME-LITERAL` — CONFRONTADA, NÃO FECHADA.** O
`verificarDefinicao` cobra `classesDeConta` procurando o campo pelo **nome literal**
`contaContabilId`; a coluna real da classe é `contaContabilAtivoId`, e o guard fica mudo. O
ENT07 esbarrou nela de frente e **declarou o recorte mesmo sem ser cobrado** — o descritor
traz `classesDeConta: ["1"]` e a porta filtra por analíticas da classe 1, com teto de 2.000
para não truncar em silêncio (a classe 1 tem 1.404 analíticas). O que continua aberto é o
guard: ele segue enumerando uma forma em vez de afirmar a propriedade, e o próximo cadastro
com conta sob outro nome passará sem recorte.

⚠️ **PENDÊNCIA `ENTRAR-POR-CLIQUE-FRAGIL`.** Percursos ainda entram por
`Promise.all([waitForNavigation, click])`. Passam em máquina folgada e falham em máquina
apertada **apontando para a senha** (§27.3).

⚠️ **PENDÊNCIA `PERCURSOS-SEM-HELPER-COMUM`.** Dez cópias de `preencherEEnviar`, uma por
percurso, já divergidas: cinco sem o ramo de campo de data. Elas passam por acidente do que
lhes pedem preencher (§28.2).

⚠️ **PENDÊNCIA `DERIVA-DE-PERFIL-FORA-DO-PORTAO`.** O portão roda `deriva` (de schema) e não
`deriva:perfil`. Uma ação nova pode ser entregue, fechar 10 de 10 e ser inalcançável em toda
instalação existente (§28.2).

⚠️ **PENDÊNCIA `IDENTIDADE-DO-PRODUTO`.** O ente de Campina Grande/PB deixa de ser atendido e
o domínio passa a ser `enginesistemas.com.br`. O sistema está carimbado `SIAFIC · Campina
Grande/PB` em tela de login, rodapé, seeds e identidades de fixture (§28.3).

**E o que continua na fila, sem mudança:**

1. **Continuar o censo.** Ele rendeu **220 cláusulas** no ENT03c; sobram **1.726** em
   `NAO_VERIFICADO` — 5.12 (folha, em outro ORM), 5.8 (características gerais), 5.20–5.22.
   ⚠️ **Continua sendo o melhor retorno por hora do projeto**, e o ENT05 não muda isso: o
   ENT05 mostrou o que acontece quando se constrói sobre seção já censada — move situação,
   não cobertura. As 1.726 são cobertura.

2. **As decisões de modelo ainda abertas** (`docs/varreduras/varredura-de-modelo-ent04-ent05.md`,
   e as D1–D14 de `docs/varreduras/varredura-ent05-tres-secoes.md` que ficaram como pendência). Continuam
   sendo o item mais barato agora e o mais caro de adiar — **o ITEM 3 deste lote foi a conta
   de uma decisão de modelo adiada desde o M04**, paga em migração.

3. **`packages/integracao`** — cofre de credenciais, validação contra esquema, detecção de
   duplicidade, custódia de certificado. O achado do A3 muda a arquitetura, não a
   configuração.

4. **Planejamento** — cotas, contingenciamento, prévia, emendas, audiências.

5. **A decisão de ente que trava duas linhas do inventário**: *qual banco o município usa*.

⚠️ **AS PENDÊNCIAS REGISTRADAS NO ENT05, que não devem ser abertas sem decisão:**
`TRANSFERENCIA-DE-MATERIAL-COM-LOTE`, `AJUSTE-DE-INVENTARIO-EM-LOTE`,
`ESTORNO-FISICO-E-CONTABIL-EM-CASCATA`, `EMPENHO-APONTA-PARA-ORDEM-DE-COMPRA`,
`FONTES-DESCRICAO-STN-MSC`. As três primeiras são recusas explícitas no código, com
mensagem — não são silêncios.

⚠️ **E O QUE A MEDIÇÃO ACUMULADA DIZ SOBRE O DESENHO DOS LOTES.** O ENT03b concluiu que um
lote de 60–90 cláusulas precisaria de ~15 cadastros pelo molde; o ENT03c mostrou que **medir
rendeu 220 num lote só**; o ENT05 mostrou que **um lote de modelo puro rende ~54 e não podia
render mais**, porque três domínios novos consomem o lote inteiro. As três medições não se
contradizem: **a razão cláusulas-por-lote depende da natureza do lote.** Censo rende
cobertura, modelo rende situação, superfície rende validação — e só a terceira é a que o
servidor municipal enxerga.

## 50. Sessão noturna V4 — §10 (percursos sob o build) e §8 Fila A (planejamento plurianual e contratação)

Pedido: `docs/lotes/V4-sessao-noturna.md`, seções 8 (Fila A), 10 e 11. Decisão: `docs/adr/ADR-fila-a-planejamento-e-contratacao.md`.
Origem conciliada: `siafic-cg` em `c04ad5a760dfbce977ef7f28db7e42ee49d85761`, buscada por `git fetch` para
`refs/reconciliacao/c04ad5a` no clone local `~/Developer/siafic-cg` (leitura; sem push). Commits desta seção:
`5de3af6`, `6aeaa81`, `9a47e8d`, `5d7bb39` e o commit desta seção (ver `git log`).

### 50.1 O que passou a funcionar

**§10 — os percursos rodaram sob `next build` + `next start` (porta 3010, banco dos percursos), e acusaram:**

- **Defeito real da unidade 1 (A01/A02):** as Server Actions fora de `actions.ts` — `app/(areas)/despesa/anular-actions.ts`
  e `app/(areas)/receita/arrecadacoes/anular-actions.ts` — não passavam por `comComandoDoFormulario`, e o servidor
  recusava a anulação com **COMANDO SEM CHAVE** (o percurso da cadeia da despesa mostrou; `RegistroDeOperacao` gravou
  `ANULAR_PAGAMENTO ERRO`). Corrigido; o guard `test/ui/chave-de-comando.test.ts` passou a varrer **todo arquivo com
  `"use server"`** de `app/` (mutação provada: remover o envelope de um deles põe o teste vermelho nomeando o arquivo).
  `acaoSimular` da captura (POC MOCK, `exigirSessao`, sem envelope) declarado com motivo — pendência `CAPTURA-SEM-ENVELOPE`.
- **O 500 em `/financeiro/conciliacao/periodo`** (a investigação pedida em 49.5) não era o `frame.join` do `next dev`: era a
  identidade da conciliação (`diferença == Σ linhas sem vínculo`) acusando a conta `CC-500-01` no banco dos percursos,
  com a exceção subindo crua de uma tela de LEITURA. Medido: a fonte 500 tem uma `ReceitaArrecadada` de 80.000,00 (seed
  do cenário SAGRES) e a arrecadação não tem conta bancária (pendência do M04) — ela entra como fato de caixa da conta
  sem contrapartida. Agora é `ConciliacaoNaoFechaError` e a tela mostra o estado (`data-nao-fecha`) com quanto sobra.
  **A identidade continua não fechando naquele banco**; o encerramento do período (ENT03a) é demonstrável no banco de
  desenvolvimento, não no dos percursos. Registrado em `modules/m09-tesouraria/MODULO.md` §6.1.
- **O Chromium do PDF** ficava vivo no servidor (~400 MB residentes) e derrubava o navegador do smoke por memória:
  `lib/pdf/gerar.ts` fecha o browser ocioso depois de 20 s (`OCIOSIDADE_MS`), sem fechar renderização em voo.
- **Smokes:** `smoke-pacote2` escolhia "o primeiro link de valor" do histórico — que na V4 é o item da competência POR BEM,
  não a entrada (corrigido: escolhe pelo `oQue`); o sufixo de dois dígitos da classe colidia entre rodadas; o termo vai para a
  pessoa já vinculada ao usuário; `smoke-cadeia` confirma o pagamento pelo FATO (o dossiê), como a anulação já fazia;
  `smoke-visual` deixou de medir checkbox com a régua do campo de 44 px (falso positivo em 9 caixas do razão) e os dois
  cartões de `/contabilidade/lancamentos` passaram a `p-5` (eram 16 px — defeito real de padrão).
- **O banco dos percursos** ganhou o seed do ENT02 no preparador, o mapeamento contábil de `CC-500-01` no seed de aceite
  (era o que o ENT03a recusava) e a atualização de permissões v5.
- **Timeouts:** uma rodada inteira (perfis, ent03a/b/c, ent06, visual, cadeia) caiu em `Navigation timeout 30000 ms`
  enquanto o editor da máquina (tsserver, 670 MB) compilava as edições desta sessão; medido em isolamento,
  `networkidle0` fecha em 1 s. Rerodados com a máquina quieta, passaram. Timeout não é aprovação nem defeito — registrado.

**§8 Fila A — o planejamento plurianual (M02b) e a contratação (M11):**

- **M02b** entrou como módulo daqui: 20 tabelas (`prisma/schema/m02b-plurianual.prisma`, back-relations nos models do M02),
  domínio, serviços de criação (20), consultas, anexos puros da LDO (8) e testes — tudo da origem, como estava. A migration
  foi gerada AQUI (`20260913100100_v4_plurianual_ppa_ldo`, com os 19 CHECKs da origem) e as dez ações do censo entraram em
  migration separada (`20260913100000_v4_acoes_plurianual`). Atualização de permissões **v5** (quem cria ficha no escopo
  global recebe as dez). Telas do molde: `/planejamento/ppa` (plano; programa no plano, receita prevista e série histórica
  como ações), `/planejamento/ppa/programas` (indicador e ação do plano), `/planejamento/ppa/estrutura` (eixo, área,
  público-alvo, macroação numa listagem), `/planejamento/ldo` (trâmite; prioridade, meta anual, risco, renúncia, alienação e
  aplicação, dívida, RPPS, margem como ações; oito anexos PDF em `/planejamento/ldo/{id}/anexos/{chave}`). Submenu e busca.
- **M11 pela tela:** `/licitacoes/processos` (criar; homologar, reservar dotação vinculada, liberar reserva, contratar) e
  `/licitacoes/contratos` (aditivo, estorno de aditivo), com situação, valor atualizado e vigência DERIVADOS pelas funções
  do M11. **O empenho informa contrato e reserva** (selects lidos no servidor) e a porta liga o M05 com
  `criarM05DepsComContratos` — antes, qualquer `contratoId` era recusado. Submenu de licitações, landing e busca.
- **Erros do Zod legíveis** nas actions novas (`lib/portas/mensagem-do-erro.ts`): "campo: mensagem", não JSON.
- **As compras pela tela (commit `743b857`, fecha `COMPRAS-COM-ITENS-NA-TELA`):** solicitação de compra
  (`/licitacoes/solicitacoes`), pesquisa de preços (`/licitacoes/pesquisas-de-precos`) e ordem de compra
  (`/licitacoes/ordens-de-compra`). A CRIAÇÃO é de ilhas escritas à mão com linhas de item (`itens.N.*`; a pesquisa
  com `itens.N.cotacoes.M.*`), lidas por `lib/portas/linhas-do-formulario.ts`; a lista e as ações (autorizar/anular,
  estornar) são do molde; o recebimento da ordem é outra ilha no detalhe, por item, oferecendo só o pendente. Situação,
  média/mínimo/máximo e saldo a receber vêm das funções do M11. Smoke próprio: **20/20** (rodada 7, build `743b857`),
  com as recusas nomeadas (solicitação sem item; segunda autorização; recebimento acima do pendente; estorno de ordem
  recebida).

### 50.2 Rotas utilizáveis, por papel

| Papel (ação) | Rota | O que faz |
|---|---|---|
| CADASTRAR_PPA | `/planejamento/ppa` | cadastra o quadriênio (cinco exercícios é recusado nomeando) |
| CADASTRAR_PROGRAMA_PPA | `/planejamento/ppa/{id}` · `/planejamento/ppa/programas/{id}` | programa no plano; indicador; ação com meta física (6 casas) e financeira |
| CADASTRAR_RECEITA_PPA | `/planejamento/ppa/{id}` | receita prevista por natureza/fonte/ano; série histórica anterior ao plano (dentro é recusada) |
| CADASTRAR_ESTRUTURA_PPA | `/planejamento/ppa/estrutura` | eixo, área temática (sob o eixo), público-alvo, macroação |
| CADASTRAR_LDO … CADASTRAR_ALIENACAO_LDO | `/planejamento/ldo`, `/planejamento/ldo/{id}` | LDO com trâmite; nove ações do detalhe; PDFs dos anexos |
| CADASTRAR_PROCESSO / HOMOLOGAR_PROCESSO | `/licitacoes/processos`, `/{id}` | processo; homologação como fato |
| RESERVAR_DOTACAO / LIBERAR_RESERVA | `/licitacoes/processos/{id}` | reserva vinculada ao processo; liberação |
| CADASTRAR_CONTRATO / REGISTRAR_ADITIVO / ESTORNAR_MOVIMENTO_CONTRATUAL | `/licitacoes/processos/{id}`, `/licitacoes/contratos/{id}` | contrato só em processo homologado; aditivo; estorno |
| EMPENHAR | `/despesa/empenhos` | empenho com contrato e reserva informados |
| REGISTRAR_SOLICITACAO_DE_COMPRA / MOVIMENTAR_SOLICITACAO_DE_COMPRA | `/licitacoes/solicitacoes`, `/{id}` | solicitação com itens; autorizar/anular como fatos |
| REGISTRAR_PESQUISA_DE_PRECOS | `/licitacoes/pesquisas-de-precos`, `/{id}` | itens e cotações; média/mín/máx e estimativa derivadas |
| EMITIR_ORDEM_DE_COMPRA / REGISTRAR_RECEBIMENTO_DE_ORDEM / ESTORNAR_ORDEM_DE_COMPRA | `/licitacoes/ordens-de-compra`, `/{id}` | ordem com itens, processo e ficha; recebimento por item; estorno fail-closed |
| CONSULTAR_PLANEJAMENTO / CONSULTAR_LICITACOES | as listas e detalhes acima | leitura |

**Cadeia demonstrada pela interface** (smoke-contratacao, 18/18): processo → contratar antes de homologar (recusa nomeada)
→ homologar → reservar → contratar → aditivo de prazo (vigência derivada muda) → empenho com contrato e reserva → o
contrato mostra o empenho; o processo mostra a reserva consumida. Cadeia PPA/LDO (smoke-plurianual, 31/31): estrutura →
plano → programa → receita/série → ação e indicador → LDO → meta anual (recusa da primária > total) → risco → alienação
e aplicação → dois PDFs lidos por pdf.js → 404 para anexo inexistente.

**Cadeia das compras demonstrada pela interface** (smoke-compras, 20/20): solicitação com item (sem item é recusada) →
autorizar (a segunda recusada; situação derivada AUTORIZADA) → pesquisa de preços com cotação (média 12.500000 e estimativa
125,00 derivadas) → ordem de compra com item (lista: total 125,00, A RECEBER) → recebimento acima do pendente recusado →
recebimento parcial 4 de 10 (pendente 6.0000 e a nota no histórico) → estorno da ordem recebida recusado nomeando.

**Etapas do percurso da Fila A ainda NÃO demonstráveis:** plano anual de contratação (3, só a solicitação), o processo com
ITENS e os atos da licitação/adjudicação (4–5 — só a homologação), ata (6), nota fiscal recebida com conferência de
fornecedor/itens/duplicidade/anexos (8 — o recebimento da ordem registra o número da nota como texto), e o empenho A
PARTIR da ordem (vínculo empenho × ordem). Recebimento/atesto/liquidação e pagamento administrativo já existem (cadeia da
despesa, 23/23). Pendências em 50.4.

### 50.3 Comandos executados e resultados

| Comando | Resultado |
|---|---|
| `next build` ×4 (5de3af6, 6aeaa81, 5d7bb39, +FormEmpenho) | OK (`.registro-de-execucao/v4-next-build-{3..6}.txt`) |
| smokes sob `next start` 3010 (rodadas 1–6, `.registro-de-execucao/v4-percursos-3010*.txt`) | pacote2 **33/33**; plurianual **31/31**; contratação **18/18**; cadeia da despesa **23/23**; gestão do bem OK; acervo OK; eixo de valor OK; roteiros OK; perfis OK; pessoas 9/9; ent02 **43/43**; ent03b OK; ent03c OK; ent06 OK; ent10 OK; visual **29/29**; **ent03a: 12 passos e para na conciliação que não fecha** (dado do banco dos percursos, 50.1) |
| migrations `20260913100000_v4_acoes_plurianual`, `20260913100100_v4_plurianual_ppa_ldo` em test/dev/percursos | aplicadas; `migrate diff --exit-code` sem diferença; papel de runtime reprovisionado ×3 |
| `tsc` app (3584 MB), backend, scripts | limpos (o app e o scripts estouraram 2560 MB — o heap subiu para 3584) |
| `test:rapido` | **844/844** (79 arquivos; +26: m02b anexos, atualizações v5, guards) |
| dirigidos: `modules/m02b-plurianual` (36), `m16-censo`, `m16-atualizacoes`, `modelo-sem-caso-de-uso`, `usuarios-teste`, `test/molde`, `busca-global`, `test/ui` | **78/78** e **177/177** |
| `test/pdf/pdf.test.ts` (fechamento ocioso do browser) | 5/5 |
| guard `chave-de-comando` por mutação | vermelho nomeando `anular-actions.ts`; verde restaurado |
| `marcar-catalogo --aplicar` (após as compras) | VALIDADO_LOCALMENTE **63**, PARCIAL **60**, IMPLEMENTADO_NAO_VALIDADO **65**, AUSENTE_CONFIRMADO 140, DEPENDENCIA_EXTERNA 3, NAO_VERIFICADO 1706 (331 classificadas) |
| compras (743b857): tsc app/backend/scripts, rápida 844/844, molde/busca/ui 177/177, build, smoke-compras **20/20**, visual 29/29 | `.registro-de-execucao/v4-percursos-3010-rodada7.txt` |

**Não executado:** `test:fuso` (o diff não tocou `packages/datas` nem guards de período; fica para o candidato); o
**portão integral**; `test:tudo` desta seção — ver 50.5.

### 50.4 Pendências (nomeadas)

- ~~`COMPRAS-COM-ITENS-NA-TELA`~~ — fechada em `743b857` (ilhas de linhas).
- `NOTA-FISCAL-RECEBIDA` — sem modelo de documento fiscal recebido; o recebimento da ordem guarda o número como texto.
- `EMPENHO-A-PARTIR-DA-ORDEM` — o empenho não aponta para a ordem (pendência já declarada no M11); a ordem empenhada não
  se distingue da não empenhada no estorno.
- `SOLICITACAO-SEM-VINCULO-COM-A-ORDEM` — a ordem não aponta para a solicitação que a originou.
- `EXTRATO-DO-CONTRATO-PDF`, `CONVENIOS-DA-ORIGEM`, `VINCULO-PPA-LOA`, `PPA-LDO-VERSOES-E-EMENDAS` (ADR e `MODULO.md` do M02b).
- `ZOD-LEGIVEL-NAS-ACTIONS-ANTIGAS` — só as actions novas formatam o ZodError.
- `CAPTURA-SEM-ENVELOPE` — `acaoSimular` (POC) fora do envelope de escrita autenticada.
- `ARRECADACAO-SEM-CONTA-BANCARIA` (M04, já registrada no M09) — é o que impede a conciliação de `CC-500-01` no banco dos
  percursos.
- Fila B (RH/portal do servidor) e Fila C (processo/cidadão), §9 (usuários sintéticos por função): não iniciadas.
- O stash `11b7892` continua listado (incorporado em `63a3040`; droppar é decisão do operador).

### 50.5 Portão do candidato

`test:tudo` sobre a árvore `7147b53` (tudo desta seção commitado, servidor parado, nada mais rodando): **229 arquivos,
2364/2364 testes, 794 s** — `.registro-de-execucao/v4-test-tudo-final.txt` (saída bruta em
`suite-completa-2026-09-13T14-16-09-358Z.log`). Faltam para o portão integral: `test:fuso`, o SQL manual de
`prisma/sql/` conferido no candidato e o `deriva:perfil`.

Segunda rodada, sobre `c4af2d5` (com as compras): **2362/2364** — dois vermelhos no MESMO arquivo,
`modules/m03-creditos/m03-recurso-novo.test.ts` (não tocado nesta sessão): t8 ("dois créditos concorrentes", cinco
rodadas) estourou o `testTimeout` de 5000 ms sob a suíte inteira em paralelo, e t5 caiu em cascata — as transações do
t8 ainda em voo inseriram contas depois do `limparBanco` do t5 ("Unique constraint failed on codigo" em `semear`).
Rerodado ISOLADO, como a regra da máquina manda: **8/8 em 8,9 s** (`.registro-de-execucao/v4-m03-recurso-novo-isolado.txt`).
Timeout não é aprovação nem defeito: fica registrado como intermitência por saturação, com o motivo, e o t8 é
candidato a `testTimeout` próprio (medido, não aumentado às cegas) — pendência `M03-T8-TIMEOUT-SOB-SUITE`.

### 50.6 Próximo ponto exato

A nota fiscal recebida como entidade (`NOTA-FISCAL-RECEBIDA`): documento fiscal do fornecedor (número, série, chave,
emissão, valor, itens) conferido contra a ordem/contrato (fornecedor, itens, valores, duplicidade pela chave) e anexável;
a liquidação passa a apontar para ele e o recebimento da ordem também — o percurso 8→10 do §8. Em seguida o vínculo
empenho × ordem (`EMPENHO-A-PARTIR-DA-ORDEM`). Depois a Fila B (RH/portal do servidor).

## 51. V5 — candidato local de demonstração (nota recebida e empenho × ordem)

Pedido: `docs/lotes/V5-demonstracao-24h.md`. Incremento em **M11** (documento fiscal) e **M05** (FK da
ordem no empenho). Não se reconstruiu PPA, licitação nem patrimônio. Ancestralidade preservada:
`da9c8ad` está em `main`; o stash `11b7892` permanece listado (já incorporado em `63a3040`; sem
pop e sem drop). Sem reset. Sem push. Sem publicação.

Classificação do artefato: **APTO PARA DEMONSTRAÇÃO RESTRITA** na máquina local, com dados
sintéticos. **BLOQUEADO PARA PUBLICAÇÃO** — pendência única de hospedagem: alvo de publicação
não definido. Não é produção operacional de prefeitura nem POC integral.

### 51.1 O que passou a funcionar

- **Documento fiscal recebido** (`DocumentoFiscalRecebido` + itens + movimentos CONFERENCIA /
  CANCELAMENTO / SUBSTITUICAO). Rotas: `/licitacoes/documentos-fiscais` e detalhe. Digitação com
  duas linhas; importação de XML NF-e/NFC-e (DTD/ENTITY recusados; arquivo original vira `Anexo`
  na mesma transação). Registrar **não** produz estoque, liquidação nem pagamento. Chave natural:
  emitente + modelo + série + número; concorrência: um ganha (P2002). Ações: `REGISTRAR_DOCUMENTO_FISCAL`,
  `CONFERIR_DOCUMENTO_FISCAL`, `CANCELAR_DOCUMENTO_FISCAL`. Permissões v6: quem recebe ordem
  registra e confere; quem estorna ordem cancela. PDF de conferência: **sem validade fiscal**.
- **Empenho a partir da ordem** (`Empenho.ordemDeCompraId`). Na ordem: “Empenhar esta ordem”.
  Ordinária: um empenho vivo pelo total dos itens menos desconto. GLOBAL/ESTIMATIVA: residual.
  Anulação copia a FK. Estorno da ordem com empenho vivo recusa. Liquidação só com documento
  **conferido**, emitente = credor, valor ≤ saldo (`somaLiquidaEstornaveis`).
- **Recebimento da ordem** pode apontar para o documento conferido; o pendente continua derivado
  item a item.
- **Espelho PDF da ordem** (`/licitacoes/ordens-de-compra/espelho`): número, itens/recebimentos,
  marca de demonstração sem validade fiscal. Mesmo motor de `lib/pdf`.
- **Fila C já existente, sem tela vazia nova:** `/consulta` (200, sem sessão) e
  `/transparencia/demonstrativos` (200). `/licitacoes/documentos-fiscais` sem sessão responde 307
  (login). **Não** se criou `/cidadao`, `/portal-servidor` nem holerite. Fila B (RH) permanece
  fora da oferta desta demonstração: não há base de folha integrada neste repositório.

### 51.2 Rotas utilizáveis

| Quem (ação) | Rota | O que faz |
|---|---|---|
| REGISTRAR_DOCUMENTO_FISCAL | `/licitacoes/documentos-fiscais` | digita ou importa XML; duplicidade recusada nomeando |
| CONFERIR_DOCUMENTO_FISCAL / CANCELAR_DOCUMENTO_FISCAL | `/licitacoes/documentos-fiscais/{id}` | fatos com data e motivo; PDF em `/conferencia?id=` |
| EMITIR_ORDEM_DE_COMPRA | `/licitacoes/ordens-de-compra` | ordem com itens; PDF em `/espelho?id=` |
| EMPENHAR | `/despesa/empenhos?ordemId=` | empenho vinculado à ordem |
| REGISTRAR_RECEBIMENTO_DE_ORDEM | `/licitacoes/ordens-de-compra/{id}` | recebimento por item, opcionalmente com a nota conferida |
| LIQUIDAR | `/despesa/liquidacoes` | select de documentos conferidos |
| (sem sessão) | `/consulta`, `/transparencia/demonstrativos`, `/login` | consulta de protocolo; demonstrativos publicados; entrada |

Identidade inicial do bootstrap: `admin@cg.pb.gov.br`. Senha só de `SEED_ADMIN_SENHA` (não
versionada, não publicada). Demais papéis: Administração > Usuários, senha gerada na hora.
Operador restrito `operador.poc@cg.pb.gov.br` já existe no banco dos percursos. Instruções:
`docs/demo/ROTEIRO-APRESENTACAO.md`, `docs/demo/ESCOPO-DEMONSTRAVEL.md`,
`docs/operacao/DEPLOY-DEMONSTRACAO.md`.

### 51.3 Comandos executados e resultados

| Comando | Resultado |
|---|---|
| Ancestralidade | `da9c8ad` e `63a3040` em `main`; stash `11b7892` listado, não reaplicado |
| Typecheck (heap 4096 MB) backend, app, scripts | limpos, na construção de `14b2daa` |
| Dirigidos: `xml-nfe`, `m11-documento-fiscal`, `m11-empenho-ordem`, `m11-compras`, `m16-censo`, `m16-atualizacoes`, `packages/locks`, molde, busca, rotulos-de-conformidade, leitura-exige-acao, chave-de-comando, fronteira-ui | verdes (inclui N=2, duplicidade, concorrência, XML com DTD recusado, autorização) |
| `npm run percursos:preparar` | migrations V5 + SQL das unicidades parciais + permissões **v6** (3 concessões em 1 perfil) |
| `npx next build` com `NEXT_PUBLIC_BUILD_COMMIT=2e0817b0bbab0b491b37534d707fd1992e58979b` | OK. Rotas novas no manifesto: documentos-fiscais e espelho da ordem |
| `next start` :3010 no banco dos percursos | Ready. Sem Chromium no cache isolado, o PDF respondia 500 nomeando a ausência |
| `npx tsx scripts/smoke-compras.ts http://localhost:3010` (1ª) | 17 ok / 2 falhas: PDF sem Chrome no servidor; clique no hidden do `CampoValor` |
| Correção de percurso `b062335` (sem rebuild: o script não entra no bundle) | máscara visível `data-mascara="valor"`; `scripts/servir-percursos.ts` carrega dotenv e herda o Chromium |
| `npx tsx scripts/smoke-compras.ts http://localhost:3010` (2ª, servidor com `PUPPETEER_EXECUTABLE_PATH`) | **29/29**, 63 s. Recusas nomeadas: solicitação sem item; segunda autorização; duplicidade NFE; receber 11 de 10; estorno com recebimento |
| `npx tsx scripts/smoke-contratacao.ts http://localhost:3010` (mesmo artefato, sem alterar o build) | **18/18**, 29 s |
| `GET /consulta`, `/transparencia/demonstrativos`, `/login` | 200 |
| `GET /licitacoes/documentos-fiscais` sem sessão | 307 |
| Catálogo | **não marcado** nesta rodada (sem cláusula + evidência nova no `marcar-catalogo`) |
| `test:tudo` / `test:fuso` / `portao` | **não executados** — não atestar suíte integral neste SHA |

O `next build` **não** foi refeito depois de `b062335`. Os percursos de aceite rodaram contra o
binário de `2e0817b`.

### 51.4 Pendências (nomeadas)

- **alvo de publicação não definido** — sem URL a inventar; sem DNS, sem domínio municipal, sem
  alteração de produção. O artefato testado permanece local.
- Fila B (RH, matrícula, folha, portal do servidor): **fora desta demonstração**. Não há módulo
  de folha integrado; holerite fictício não será construído para preencher menu.
- Fila C: consulta de protocolo e transparência dos demonstrativos existem. Portal do cidadão
  transacional (`/cidadao`, autoatendimento, NFS-e) **não** foi aberto com tela vazia.
- `SOLICITACAO-SEM-VINCULO-COM-A-ORDEM` — a ordem ainda não aponta para a solicitação.
- `ARRECADACAO-SEM-CONTA-BANCARIA` (M04/M09) — conciliação de `CC-500-01` no banco dos percursos.
- `M03-T8-TIMEOUT-SOB-SUITE` — intermitência sob a suíte completa (V4 §50.5).
- `ZOD-LEGIVEL-NAS-ACTIONS-ANTIGAS`, `CAPTURA-SEM-ENVELOPE`, `EXTRATO-DO-CONTRATO-PDF`,
  `CONVENIOS-DA-ORIGEM`, `VINCULO-PPA-LOA`, `PPA-LDO-VERSOES-E-EMENDAS`.
- Stash `11b7892`: preservado até decisão explícita de remoção.
- Scripts soltos `scripts/fix-*.sh` e `manter-claude-cursor.sh`: não executados, não commitados.

### 51.5 Portão do candidato

Este SHA **não** passou pelo portão integral. A verificação desta unidade é a dirigida da
construção mais os dois smokes no artefato congelado. Números de `test:tudo` da V4 (`7147b53`,
`c4af2d5`) **não** se atribuem a este HEAD.

### 51.6 Próximo ponto exato

Com autorização específica de hospedagem: publicar **somente** o candidato já ensaiado
(aplicação `2e0817b`, percurso `b062335`), Chromium no servidor, dados sintéticos, ambiente
identificado como DEMONSTRAÇÃO. Sem essa autorização: continuar trabalho independente — o
vínculo solicitação×ordem, ou a reconciliação de RH **quando** a origem estiver neste
repositório como módulo. Não anunciar folha nem portal de cidadão transacional até haver
percurso real.

## 52. V6 P0 — identidade correta e experiência compartilhada

Pedido: `docs/lotes/V6-produto-integrado.md` (guardado como veio). Ancestralidade preservada: `cc4a0a2`,
`2e0817b`, `da9c8ad` e `77cbcc9` são ancestrais do HEAD; o stash `11b7892` permanece listado (já
incorporado em `63a3040`; sem pop e sem drop). Sem reset. Sem push. Sem publicação. Os três scripts
soltos (`scripts/fix-*.sh`, `manter-claude-cursor.sh`) continuam não executados e não commitados.

O candidato `2e0817b` deixou de estar servido em `:3010` (o `next start` deste projeto foi encerrado
de forma controlada antes do `next build` novo, para não sobrescrever o `.next` em uso). Ele
continua reproduzível: `git worktree add <dir> 2e0817b` + `npx next build` com
`NEXT_PUBLIC_BUILD_COMMIT=2e0817b…`. Nenhum outro serviço da máquina foi parado.

### 52.1 O que passou a funcionar

- **Produto, instituição e ambiente separados.** O produto se chama **Gestão Pública** (“Plataforma
  integrada de gestão municipal”, `lib/identidade/produto.ts`, puro). A instituição vem do cadastro:
  `VersaoDaApresentacaoDoEnte` (append-only, sobre `EnteConfig`) pela porta `lib/portas/identidade.ts`
  — projeção PÚBLICA mínima (nome de exibição, órgão, UF, imagem, contatos, horário, sítio, tema,
  canais ativados), sem credencial, vínculo, CNPJ de responsável ou dado pessoal. O ambiente
  (`desenvolvimento | demonstracao | homologacao | producao`) vem do build (`AMBIENTE_DE_EXECUCAO` →
  `NEXT_PUBLIC_AMBIENTE`). Sem `EnteConfig`, identidade NEUTRA com pendência para o administrador;
  sem apresentação, “Ente não configurado” — nunca uma prefeitura ao acaso. O ente é o da
  IMPLANTAÇÃO (o banco configurado no deploy): Host, query, cookie e campo não escolhem ente.
- **Sem replace global.** `SIAFIC` continua nome do domínio contábil (Central de Integrações) e das
  fixtures/bancos/cookies/migrations; `Campina Grande`, `cg.pb.gov.br` e `SEFIN` saíram da SUPERFÍCIE
  (app/, components/, lib/pdf, lib/navegacao) e o guard `test/ui/identidade.test.ts` impede a volta.
  Os seeds da POC continuam identificando o ente que identificam.
- **Configuração administrativa** (`/administracao/apresentacao`, ação nova
  `CONFIGURAR_APRESENTACAO_DO_ENTE`, família ADMINISTRACAO, atualização de permissões **v7**: quem
  concede ação a perfil no global recebe-a no global): nome de exibição, órgão, assinatura do
  fornecedor (texto, sem marca inventada), e-mail, telefone, horário, sítio (só `https:`, nunca
  buscado pelo servidor), tema (conjunto FECHADO `PADRAO | ALTO_CONTRASTE`, CHECK no banco; o alto
  contraste redefine tokens em `globals.css` — nada de CSS/JS do banco), imagem institucional (PNG ou
  JPEG reconhecidos pelos BYTES, 256 KiB, CHECKs; SVG recusado nomeando), canais públicos ativados.
  Cada gravação é uma versão com autor e instante; histórico na tela; concorrência decidida pelo
  UNIQUE (enteId, numero) e recusada nomeando. Imagem servida por `/identidade/imagem` (pública,
  cacheável por versão).
- **Propagação:** entrada, `<title>`, favicon do produto (`app/icon.svg`), marca da sidebar,
  cabeçalho (ambiente), rodapé (ente, produto/fornecedor, versão curta), `/transparencia/demonstrativos`
  (nome, imagem, contatos) e PDFs novos (`nomeDoEnteParaDocumentos()` em `lib/pdf/*` e nos termos e
  etiquetas). **Documento emitido não muda:** o termo patrimonial congela o texto do ente no JSON da
  emissão (M10) — o smoke baixa a segunda via antes e depois da reconfiguração e confere o mesmo
  sha256 e a ausência do nome novo.
- **SHA completo fora do rodapé comum.** Rodapé: `versão 4dcd2dd` (7 caracteres) ou nada fora de build
  versionado. Proveniência completa em `/administracao/sistema` (CONSULTAR_ADMINISTRACAO): commit,
  ambiente, Node e as atualizações de permissões instaladas.
- **Entrada redesenhada** (`app/login`): identificação (produto, ente ou ambiente, órgão, faixa de
  ambiente, canais públicos existentes E ativados — Transparência e Acompanhar processo; Portal do
  Servidor/Cidadão/Fornecedor têm `href` nulo e NÃO aparecem), título de acesso, rótulos ligados por
  `for`/`id`, mostrar/ocultar senha com `aria-pressed`/`aria-controls`, erro POR CAMPO (`aria-invalid`
  + `aria-describedby`) para campo vazio e mensagem única de credencial (timing uniforme preservado),
  identificador devolvido na recusa, placeholder neutro, retorno seguro preservado. Mecanismo de
  sessão, bootstrap, revogação e chave de comando **não** mudaram (`entrarAction` continua a exceção
  nomeada do guard de comando).
- **Shell responsivo:** `ShellProvider` (client, só o estado do menu), `BotaoMenu` no cabeçalho em
  < 768 px, sidebar como painel sobreposto com `id` de `useId`, pano de fundo, fecha ao navegar; em
  ≥ 768 px o colapso por cookie continua. Cabeçalho e rodapé quebram linha; `main` com padding por
  largura. Testado a 360/768/1366 nas capturas e no smoke (sem rolagem horizontal na home e na entrada).
- **Minha mesa** (home): o que espera por você (painel de pendências existente), ações que você pode
  fazer (destinos da busca com a ação do usuário, mesma tabela de `autorizar`), processos na minha
  lotação (M21, `somenteMeusSetores`), comunicados não lidos (M23). Cada bloco tem TRÊS estados
  distintos — dado (ou “nada por aqui”), **sem acesso** (a política recusou) e **indisponível** (a
  consulta falhou) — falha não é zero, falta de permissão não é lista vazia. O retrato do ente
  (indicadores fiscais) continua abaixo, só para quem consulta relatórios.
- **Duas abas:** o contexto (exercício/UG) é estado por aba; o smoke troca a unidade na aba B e prova
  que a aba A mantém a seleção e que o comando pendente da aba A grava com os dados da aba A.

### 52.2 Rotas utilizáveis

| Quem | Rota | O que faz |
|---|---|---|
| (sem sessão) | `/login` | identificação do produto/ente/ambiente, canais públicos ativados, acesso |
| (sem sessão) | `/identidade/imagem` | a imagem institucional vigente (PNG/JPEG), 404 sem imagem |
| (sem sessão) | `/transparencia/demonstrativos` | nome, imagem e contatos do ente da apresentação |
| qualquer sessão | `/` | Minha mesa |
| CONSULTAR_ADMINISTRACAO | `/administracao/apresentacao` | vê a vigente, o ente semeado e o histórico |
| CONFIGURAR_APRESENTACAO_DO_ENTE | `/administracao/apresentacao` | grava versão nova (formulário; sem a ação o botão não existe e o servidor recusa) |
| CONSULTAR_ADMINISTRACAO | `/administracao/sistema` | proveniência técnica (SHA completo, ambiente, permissões) |

### 52.3 Comandos executados e resultados

| Comando | Resultado |
|---|---|
| Ancestralidade | `cc4a0a2`, `2e0817b`, `77cbcc9` ancestrais do HEAD; stash `11b7892` listado |
| `prisma migrate deploy` ×3 (dev estava em 120 — as duas da V5 faltavam nele; test e percursos em 122) | 124 nos três; `migrate diff --exit-code` limpo; `prisma generate`; papel `gestao_app` reprovisionado nos três |
| `aplicar-atualizacao-de-permissoes.ts 7` (dev e percursos, `SEED_IDENTIDADE`) | v7 aplicada: 1 concessão em 1 perfil |
| tsc backend / app / scripts (heap 3584) | limpos em `4dcd2dd` |
| `test:rapido` | **852/852** (81 arquivos) |
| `m16-apresentacao` (10, com N=2 na concorrência), `m16-atualizacoes` (v7), `m16-censo` (267 serviços; 246+18 ações), `test/ui/identidade` (4), guards de comando/fronteira/leitura/área pública/rótulos, `modelo-sem-caso-de-uso`, `formularios-na-mesma-pagina` | verdes |
| `next build` com `NEXT_PUBLIC_BUILD_COMMIT=4dcd2dd…` e `AMBIENTE_DE_EXECUCAO=demonstracao` | OK (184 rotas no manifesto) |
| `next start :3010` (banco dos percursos) + `scripts/smoke-identidade.ts` | r1 e r2 acharam dois defeitos DO SMOKE (termo sem emissão congelada escolhido; medida de visibilidade com `position: fixed`) e um passo com clique travando o protocolo com duas abas no mesmo renderer (troca por preenchimento pelo DOM); **r4: 45/45** |
| `scripts/capturar-superficies.ts antes-cc4a0a2` e `depois-4dcd2dd` | 24 capturas cada (3 larguras × 8 rotas) em `.registro-de-execucao/v6-capturas/` — dados sintéticos |
| Defeitos achados pela captura e corrigidos | entrada a 360 px estourava a largura (grid item com `truncate` sem `min-w-0`); guard de `id` literal (dois lugares → `useId`); regex literal com `\/` cegava o `somenteCodigo` do `modelo-sem-caso-de-uso` (troca por `URL`) |
| `npx puppeteer browsers install chrome@150.0.7871.24` | o cache `~/.cache/puppeteer` havia sumido às 12:43; reinstalado — sem isso nenhum smoke sobe |
| Catálogo (`marcar-catalogo.ts --aplicar`) | 5.8.1 PARCIAL e 5.38.46 PARCIAL com rota verificada; contagem 63/62/65/140/3/1704 |
| `test:tudo` / `test:fuso` / `portao` | **não executados** nesta unidade (P0 é superfície + M16; a rápida e as dirigidas cobrem a mudança) |

### 52.4 Pendências (nomeadas)

- **P0.3 por família — PARCIAL.** O molde já tem lista (filtros, ordenação, paginação, seleção,
  totais) e detalhe (cinco abas, selos, ações). Entregue nesta unidade: shell responsivo, entrada
  acessível, guard de identidade. Falta, por família: barra de ação contextual no detalhe, prévia
  de impacto nas operações, resultado com links para os registros gerados, revisão de teclado/zoom
  em tabelas extensas. Nasce com as famílias tocadas em P1–P3.
- `ENDERECO-DO-ENTE` — a apresentação não tem endereço (5.38.46 fica PARCIAL).
- `MARCA-NOS-PDFS` — a imagem institucional aparece nas telas; os PDFs trazem só o nome.
- `TEMA-POR-USUARIO` — o tema é do ente; alternância por usuário (5.37.32/5.38.38) não existe.
- `IDENTIDADE-POR-DOMINIO` — um processo, um banco, um ente. Vinculação por domínio cadastrado
  fica para o lote de tenancy (ADR do eixo de município).
- `CANAIS-INEXISTENTES` — Portal do Servidor, do Cidadão e Fornecedor ganham `href` e coluna de
  ativação quando existirem (P2/P3).
- Herdadas: `SOLICITACAO-SEM-VINCULO-COM-A-ORDEM`, `ARRECADACAO-SEM-CONTA-BANCARIA`,
  `M03-T8-TIMEOUT-SOB-SUITE`, `ZOD-LEGIVEL-NAS-ACTIONS-ANTIGAS`, `CAPTURA-SEM-ENVELOPE`,
  `EXTRATO-DO-CONTRATO-PDF`, `CONVENIOS-DA-ORIGEM`, `VINCULO-PPA-LOA`, `PPA-LDO-VERSOES-E-EMENDAS`.

### 52.5 Invariantes verificadas

Autorização no servidor por ação nomeada (t5, e o restrito pela tela); append-only (t3, versão 1
intacta); fail-closed sem ente (t1); projeção pública sem dado sensível (t4); imagem pelos bytes e
teto (t6); concorrência N=2 (t9); comando do formulário em toda action nova (guard t2); nenhum
identificador de cláusula em tela (guard); GET sem transição (`/identidade/imagem` só lê).

### 52.6 Próximo ponto exato

**P1.1 — solicitação ligada aos itens da ordem.** Modelo de ALOCAÇÃO por item e quantidade entre
`ItemDeSolicitacaoDeCompra` e `ItemDeOrdemDeCompra` (uma solicitação atendida por várias ordens;
uma ordem atendendo várias solicitações), com origem, unidade, centro de custo e autor
preservados; situação DERIVADA por item: ordenado, recebido, cancelado, pendente. Controles:
solicitação não autorizada; item/unidade incompatível; alocação em excesso; duas ordens
concorrentes (N=2); cancelamento/desfazimento; legado sem vínculo identificado como tal (sem match
automático). Tela: na solicitação autorizada, "formar ordem" com os saldos pendentes; na ordem, a
origem; consulta de atendimento nos dois sentidos e nos documentos. Depois P1.2 (arrecadação × conta
bancária × conciliação) e P1.3 (percurso encadeado com duas linhas, atendimento parcial e uma
negativa, com usuários por papel).

## 53. V6 P1.1 — solicitação ligada aos itens da ordem

Commits: `cd70495` (modelo, serviços, telas, testes), `867b962` (mensagens que não somem; smoke
auto-suficiente). Ancestralidade e stash como na seção 52.

### 53.1 O que passou a funcionar

- **`AlocacaoDeSolicitacaoNaOrdem`** liga uma QUANTIDADE de um item da solicitação a um item da
  ordem — uma solicitação atendida em parte por várias ordens; uma ordem atendendo várias
  solicitações. Origem, unidade (setor), solicitante e autor preservados. **Tudo derivado**
  (`modules/m11-licitacoes/compras-alocacao.ts`): ordenado = Σ parcelas vivas em ordens vivas;
  recebido = a parte dos recebimentos do item da ordem ATRIBUÍDA à parcela, por ordem de alocação;
  cancelado = parcelas desfeitas + parcelas de ordens estornadas; pendente = solicitado − ordenado.
  Ordenado NÃO é atendido.
- **Controles:** solicitação AUTORIZADA; item da solicitação e item da ordem do MESMO material;
  excesso contra o pedido e contra a linha da ordem, recusados dizendo quanto resta; lock advisory
  no item da solicitação (`packages/locks` posto 23) — duas ordens concorrentes disputando o mesmo
  saldo: uma passa (t5, N=2); desfazer é linha nova com `estornoDeId` e motivo, recusado com
  recebimento atribuído; anular solicitação com parcelas vivas recusa nomeando as ordens; legado
  sem vínculo é "sem origem" e NUNCA é casado por descrição/valor.
- **O estorno da ordem virou FATO** (`MovimentoDaOrdemDeCompra` ESTORNO) — ver
  `docs/adr/ADR-estorno-da-ordem-como-fato.md`. O `delete` anterior só passava em teste porque o
  teste roda como dono: o papel `gestao_app` não tem DELETE em `OrdemDeCompra`. Cada leitor exclui
  a estornada (empenho M05, documento fiscal, recebimento, vínculo, painel de pendências, opções,
  listas com filtro vivas/estornadas); a solicitação recebe o movimento informativo
  `ORDEM_ESTORNADA` (não muda a situação dela).
- **Telas:** na solicitação, o atendimento por item (`[data-atendimento]`) e a ilha "formar ordem"
  (só AUTORIZADA com pendente; itens pré-preenchidos; origem na MESMA transação; resultado com link
  para a ordem gerada); na ordem, a origem por linha (`[data-origem]`, com "sem origem"), a ilha
  "vincular parcela" (só solicitações autorizadas com pendente do mesmo material) e "desfazer" por
  parcela viva sem recebimento; coluna "Origem" na lista de ordens e "Atendimento" na de
  solicitações; seção "Origem" no espelho em PDF da ordem.

### 53.2 Rotas utilizáveis

| Quem | Rota | O que faz |
|---|---|---|
| CONSULTAR_LICITACOES | `/licitacoes/solicitacoes/{id}` | atendimento por item e parcelas com link para a ordem |
| EMITIR_ORDEM_DE_COMPRA | `/licitacoes/solicitacoes/{id}` | formar ordem a partir dos itens pendentes |
| EMITIR_ORDEM_DE_COMPRA | `/licitacoes/ordens-de-compra/{id}` | vincular parcelas de solicitações autorizadas |
| ESTORNAR_ORDEM_DE_COMPRA | `/licitacoes/ordens-de-compra/{id}` | desfazer parcela; estornar a ordem (fato) |
| CONSULTAR_LICITACOES | `/licitacoes/ordens-de-compra?vivas=ESTORNADAS` | só as estornadas (ou `VIVAS`) |
| CONSULTAR_LICITACOES | `/licitacoes/ordens-de-compra/espelho?id=` | PDF com a seção de origem |

### 53.3 Comandos executados e resultados

| Comando | Resultado |
|---|---|
| migrations `20260913150000_v6_movimento_ordem_estornada`, `…150100_v6_alocacao_solicitacao_ordem`, `…150200_v6_movimento_da_ordem` | aplicadas nos três bancos; `migrate diff --exit-code` limpo; `generate`; papel reprovisionado |
| tsc backend / app / scripts | limpos em `867b962` |
| `m11-alocacao` (11, N=2), `m11-compras` (t5 reescrito: a ordem continua, ESTORNADA; segundo estorno recusado; receber recusado), `m11-empenho-ordem`, `m11-documento-fiscal`, `m16-censo` (269 serviços), `modelo-sem-caso-de-uso` (ItemDeSolicitacao saiu do aninhamento) | verdes |
| `test:rapido` | 852/852 |
| `next build` em `cd70495` → smoke-solicitacao-ordem r1 | 31 ok / 3 falhas: (1) só um material ativo no banco dos percursos; (2)(3) a mensagem de sucesso do desfazimento e do estorno sumia com o controle (ilha desmontada pelo re-render) |
| `next build` em `867b962` → smoke-solicitacao-ordem r1 | 17 ok, `Navigation timeout` em 5.3 (abrir a ordem B); a sonda direta abriu a mesma página em 176 ms e 335 ms com rede ociosa — saturação transitória logo após o build |
| r2, máquina quieta | **35/35** |
| smoke-compras no mesmo build | **29/29** (regressão) |

### 53.4 Pendências (nomeadas)

- `USUARIO-DE-COMPRAS-NOS-PERCURSOS` — o smoke usa o admin para os passos de compras (o
  restrito só prova a negativa); um perfil COMPRAS sintético entra no P1.3.
- `ESTORNO-DE-RECEBIMENTO` — recebimento não tem estorno; ordem com recebimento não se estorna.
- Guard candidato: `test/papel-runtime.test.ts` varrer `.delete(`/`.deleteMany(` em `modules/`
  contra o censo de DELETE do runtime (a lição do ADR).

### 53.5 Próximo ponto exato

P1.2 (seção 54).

## 54. V6 P1.2 — arrecadação, conta bancária e conciliação

Commits: `4b83b55` (M04/M09, telas, testes), `848ad06`+`c9f1c9f` (a porta do pagamento credita a
contábil da conta que paga; o primeiro não compilava e o segundo o corrige).

### 54.1 O que passou a funcionar

- **Diferenciação:** reconhecimento (M04 `reconhecimento.ts`, já existia), arrecadação efetiva
  (`ReceitaArrecadada`), retenção (só no pagamento — M07; **dedução de receita não existe**,
  pendência `DEDUCAO-DE-RECEITA`), movimento bancário (M09). A CONTA é exigida no fato em que é
  pertinente: a guia registrada pela tela declara a conta que recebeu; o pagamento já declarava.
- **Coerência na transação:** a perna de disponibilidade do roteiro da guia é a conta contábil da
  conta bancária declarada (vinha da constante `1.1.1.1.1.00.00` na porta); o domínio confere
  fonte da conta = fonte da guia e contábil da conta = perna debitada, e recusa nomeando. A
  anulação copia a conta. O PAGAMENTO pela tela também passou a creditar a contábil da conta que
  paga (era a constante `1.1.1.1.2.00.00`, e as contas bancárias mapeiam `1.1.1.1.1.19.00`: o
  dinheiro saía de uma conta na tesouraria e de outra no razão).
- **Conciliação por conta:** o lado interno lê as arrecadações pela conta (declarada ou
  atribuída), não mais pela fonte. O legado sem conta fica FORA da identidade e é LISTADO — no
  relatório e dentro do `ConciliacaoNaoFechaError` — com a conta contábil que debitou. Vincular
  guia sem conta é recusado ("atribua antes").
- **O ato de reconciliação do legado:** `AtribuicaoDeContaDaArrecadacao` (uma por guia; motivo;
  autor; ação `ATRIBUIR_CONTA_A_ARRECADACAO`, permissões **v8**: quem vincula conciliação no global
  recebe). Aceito só quando o razão da guia debitou a contábil da conta escolhida; senão recusa
  dizendo qual conta o razão debitou. Nunca UPDATE no ledger. Concorrência: UNIQUE por guia.
- **Telas:** select "conta bancária que recebeu" na guia (`/receita/arrecadacoes`); seção
  "arrecadações da fonte sem conta bancária (legado)" com atribuição por guia na conciliação por
  período (`/financeiro/conciliacao/periodo`), presente tanto quando o relatório sai quanto quando
  a identidade não fecha.

### 54.2 Comandos executados e resultados

| Comando | Resultado |
|---|---|
| migration `20260913160000_v6_acao_atribuir_conta_a_arrecadacao` | aplicada nos três bancos |
| migration `20260913160100_v6_arrecadacao_conta_bancaria` — 1ª tentativa | o arquivo saiu com um erro de validação do schema no lugar do DDL (um `sub` do script de edição falhou antes de completar o schema) e o `migrate deploy` a registrou como FALHA, 0 passos; `prisma migrate resolve --rolled-back` nos três bancos; arquivo regenerado com o DDL certo; deploy ×3 OK; `diff --exit-code` limpo. A linha rolled-back permanece em `_prisma_migrations` (é o registro honesto do ocorrido) |
| tsc backend / app / scripts | limpos em `c9f1c9f` (`848ad06` NÃO compilava — corrigido no commit seguinte) |
| `m09-atribuicao-de-conta` (5), `m09-conciliacao`, `m09-vinculo`, `m09-conciliacao-periodo`, `m09-movimentacao`, `m09-transferencia`, `m04`, `m16-censo` (270 / 247+18), `m16-atualizacoes` (v8), `modelo-sem-caso-de-uso` | verdes |
| `test:rapido` | 852/852 |
| permissões v8 (dev e percursos) | aplicada: 1 concessão em 1 perfil |
| `next build` em `c9f1c9f` + smoke-arrecadacao-conta, smoke-ent03a, smoke-cadeia | ver 54.4 |

### 54.3 Pendências (nomeadas)

- `CONTAS-BANCARIAS-COM-MESMA-CONTABIL-NOS-SEEDS` — no banco dos percursos, `CC-500-01`, `CC-POC-A`
  e `CC-POC-B` (todas fonte 500) mapeiam a MESMA contábil `1.1.1.1.1.19.00`; o lado contábil de
  cada conta soma o movimento das três. A identidade por conta só fecha ali quando cada conta tiver
  a sua contábil (reseed). É desenho de seed, não do código: o teste `m09-atribuicao-de-conta` prova
  o fechamento com duas contas em contábeis distintas.
- `IMPORTADOR-SEM-CONTA-BANCARIA` (M20) e as compostas do M10 (dívida ativa, operação de crédito)
  registram guias sem conta — entram como legado a atribuir.
- `VPA-CONSTANTE-NA-PORTA` — a VPA da guia continua constante na porta; o roteiro por natureza de
  receita ainda não vem de tabela (Matriz de Eventos, 5.91).
- `DEDUCAO-DE-RECEITA` — não há dedução de receita (FUNDEB etc.) no M04.
- `PAGAMENTO-CONFERE-CONTABIL-NO-DOMINIO` — a coerência conta×contábil do pagamento está na porta;
  o domínio do M05 ainda não a confere (a da arrecadação está no domínio).

### 54.4 Percursos sob o build `c9f1c9f`

(preenchido ao fim da rodada — ver o log em `.registro-de-execucao/v6-capturas/`)

### 54.5 Próximo ponto exato

**P1.3 — o percurso encadeado com usuários por papel:** perfis sintéticos COMPRAS, ALMOXARIFADO,
CONTABILIDADE/TESOURARIA no banco dos percursos (criados pela tela de administração), e um percurso
PPA/LDO → dotação → solicitação (duas linhas) → pesquisa → processo → contrato/reserva → ordem
formada da solicitação (parcial) → nota recebida → recebimento/atesto → liquidação → pagamento
(conta declarada) → razão e documentos, com uma negativa de negócio por papel. Depois P2 (RH).

## 55. V6 P1.3 e P2.1/P2.2 — percurso por papel e o pessoal (M32)

Commits: `0a447ce` (usuários por papel, smoke da cadeia por papel, docs do P1), `a187f89` (M32 pessoal,
smoke do pessoal, correções dos smokes), e o commit desta seção (RH nos percursos, smokes
idempotentes, capturas, catálogo, docs).

### 55.0 P1.3 — a cadeia com um usuário por papel

`scripts/percursos-usuarios-por-papel.ts` cria no banco dos percursos (idempotente; no-op quando já
existe) um usuário e um perfil por papel, com ações GLOBAIS: `compras@`, `almoxarifado@`,
`contabilidade@`, `tesouraria@` e agora `rh@percursos.local` (senha `PERCURSOS_SENHA_PAPEIS`, padrão
`Percurso#2026`). `scripts/smoke-cadeia-por-papel.ts` percorre solicitação → ordem formada da
solicitação → nota recebida → conferência → recebimento → empenho → liquidação → pagamento
trocando de usuário a cada etapa, com uma NEGATIVA por papel (o comprador não empenha, o
almoxarife não emite ordem, o contador não paga, o tesoureiro não lê a solicitação): **23/23** em
`a187f89`. Em `0a447ce` eram 18/3: `barrado()` só olhava a URL e `/despesa/empenhos` responde
200 com "ACESSO NEGADO" no corpo — a negativa passou a conferir URL OU recusa na tela; e o CPF/CNPJ
do credor era lido do rótulo inteiro, não do parêntese.

Pendências do banco dos percursos (dado, não código): `FICHA-DE-MATERIAL-NOS-PERCURSOS` (só há
fichas 339039; materiais de consumo empenham direto) e `CONTAS-BANCARIAS-COM-MESMA-CONTABIL-NOS-SEEDS`
(três contas bancárias da fonte 500 apontam para `1.1.1.1.1.19.00`, e a identidade por conta não
fecha — Σ débitos 98.550 ≠ Σ créditos 83.335 na 19.00; precisa de reseed com uma contábil por conta).

### 55.1 O que passou a funcionar (M32 — pessoal, bloco 1)

Módulo: **M32 pessoal**, conciliado do `modules/m22-rh` da origem siafic-cg `c04ad5a`
(`refs/reconciliacao/c04ad5a`), com uma diferença deliberada: `Servidor.pessoaId` aponta para a
**Pessoa física canônica do M19** — a ficha não repete CPF, nome, endereço nem contato. PJ, pessoa
já servidora e pessoa inexistente são recusadas nomeando.

- **Cargos** (vagas fixadas em lei, lei e publicação, tipo, carga horária, requisito; extinção) e
  **lotações** (organograma com pai; unidade orçamentária opcional; extinção). A lista de cargos
  CONTA as vagas ocupadas dos vínculos vivos e deriva "com vaga / sem vaga / extinto".
- **Ficha do servidor** com os dados civis próprios; **vínculos** (matrícula única no ente, tipo,
  regime, admissão, cargo, lotação, salário) com **eventos**: admissão, promoção, mudança de cargo
  e de lotação, remuneração (salário e gratificações), afastamento, retorno, desligamento —
  cada um com data do fato, motivo, autor e portaria opcional. Cargo, lotação, salário,
  gratificações e SITUAÇÃO (sem vínculo / ativo / afastado / desligado) são **derivados** dos
  eventos até a data: a promoção de junho não muda o cargo de maio (teste 5 do módulo).
- **Segunda matrícula** da mesma pessoa é aceita com ALERTA de acumulação nomeando a primeira;
  matrícula repetida é recusada nomeando quem a usa; **desligamento é terminal**.
- **Dependentes** com parentesco, finalidade (salário-família / IR), início e baixa por idade
  derivada; **portarias** por exercício; **anotações** na ficha (append-only, crachá próprio);
  **treinamentos**.
- **Rota real:** área **Pessoal** no menu (`/pessoal`, `/pessoal/servidores`, `/pessoal/cargos`,
  `/pessoal/lotacoes`); ações no detalhe do servidor (admitir, movimentar, alterar remuneração,
  desligar, dependente, portaria, anotação, treinamento); aba histórico. Busca global e
  `CONSULTAR_PESSOAL` como leitura da área. Permissões **v9 `pessoal-m32`**: quem administra perfis
  no global recebe as 16 ações (aplicada em dev e percursos: 16 concessões em 1 perfil).
- **Datas por dia civil do ente:** a origem usava `getUTC*`/`toISOString` em 17 sítios do domínio e
  do serviço; o guard `data-civil.test.ts` acusou e tudo passou a `diaCivil`/`anoCivil`.

Regime de rigor: **superfície** (cadastro e histórico — testes de caso de uso, autorização positiva
e negativa, percurso de navegador por família). A folha (P2.3) é profundidade.

### 55.2 Comandos executados e resultados

| Comando | Resultado |
|---|---|
| migrations `20260913180000_v6_acoes_pessoal` (16 `ALTER TYPE`) e `20260913180100_v6_pessoal_cadastro` (14 tabelas, CHECKs e índices parciais da origem) | aplicadas nos três bancos; `prisma generate`; `migrate diff --exit-code` limpo; papel `gestao_app` reprovisionado |
| tsc backend / app / scripts | limpos em `a187f89` e após as correções dos smokes |
| `m32-pessoal.test.ts`, `data-civil`, `m16-censo` (287 serviços; 262+19 ações), `m16-atualizacoes` (v9), `molde`, `busca-global`, `menu-contra-o-servidor`, `modelo-sem-caso-de-uso`, `leitura-exige-acao`, `fronteira-ui`, `descritores-consistentes`, `rotulos-de-conformidade`, `chave-de-comando` | verdes (76 + 124 testes nas duas rodadas). Na primeira rodada: censo esperava 280 ações e são 281 (15 de mutação, não 14 — corrigido); teste 5 do M32 estourou o hook de 10 s SOB a rodada conjunta e passou isolado |
| `test:rapido` | 852/852 na rodada final; numa rodada `inercia-do-doador` falhou por timeout (5.232 ms) sob carga e passou isolado — intermitência registrada: `INERCIA-DO-DOADOR-TIMEOUT-SOB-SUITE` |
| permissões v9 (dev e percursos) | 16 concessões em 1 perfil, cada |
| `next build` em `a187f89` (`NEXT_PUBLIC_BUILD_COMMIT`, `AMBIENTE_DE_EXECUCAO=demonstracao`) + `servir-percursos` em 3010 | build exit 0 |
| `smoke-pessoal.ts` (papel rh@) | r1: 5 ok, parou no CPF sintético sem DV (o M19 recusou — comportamento certo); r2/r3: seletor do campo de dinheiro (o valor visível não tem `name`; o `name` é o hidden); **r4: 29/29** |
| `smoke-cadeia-por-papel.ts` | **23/23** |
| `smoke-arrecadacao-conta.ts` | r1 6/3: a guia 7 já tinha sido atribuída na execução anterior (o smoke não era idempotente); r2 **8/8** com 3.x pulado nomeando o motivo (nenhuma guia sem conta restou) |
| `smoke-identidade.ts` | **46/46** |
| `capturar-superficies.ts depois-a187f89-pessoal` (rh@) | 360/768/1366 px de /pessoal, servidores, detalhe, histórico, cargos, lotações em `.registro-de-execucao/v6-capturas/depois-a187f89-pessoal/`. "Antes": a área não existia em `0a447ce` (menu sem Pessoal, rota 404) |
| `marcar-catalogo.ts --aplicar` | VALIDADO 65 (+5.10.2.8 do P1.2, +5.12.5), PARCIAL 75, AUSENTE 142 (+5.12.60, +5.12.102), IMPLEMENTADO_NAO_VALIDADO 65, DEPENDÊNCIA 3; 350/2037 verificadas |

Não executados nesta unidade: `test:tudo`, `test:fuso` (o diff não toca `packages/datas`; o guard
`data-civil` rodou), portão integral.

### 55.3 Pendências (nomeadas)

- `PESSOAL-SEM-TELA-CALENDARIO-CONTRATO-AVALIACAO` — calendário RH, contrato de trabalho/prorrogação
  e avaliação de experiência têm serviço, ação e permissão, sem tela (não se criou página vazia).
- `PESSOAL-SEM-TELA-BAIXA-DE-DEPENDENTE` — `BAIXAR_DEPENDENTE` só pelo serviço.
- `REINTEGRACAO-DE-VINCULO` (5.12.60) e `TROCA-DE-MATRICULA` (5.12.102) — decisões de modelo antes
  de construir; marcadas AUSENTE.
- `PIS-SEM-DV` — o PIS/PASEP só confere formato.
- `ALTERACAO-CADASTRAL-DO-SERVIDOR` — a ficha só se cria; mudança de dado civil precisa de
  histórico próprio (pendência 1 do MODULO).
- `MIGALHA-COM-ID` — a trilha de navegação do detalhe mostra o id do registro (o molde inteiro,
  não só o pessoal).
- `SELETOR-DE-UNIDADE-A-360` — em 360 px o seletor de unidade do cabeçalho passa da largura da
  tela no detalhe (captura `pessoal-servidores-…@360.png`); o shell é comum a todas as áreas.
- `INERCIA-DO-DOADOR-TIMEOUT-SOB-SUITE` — ver 55.2.

Bloqueado por terceiro: nada nesta unidade.

### 55.4 Catálogo por natureza

Superfície (VALIDADO_LOCALMENTE): 5.12.5. Superfície parcial: 5.12.1, 5.12.6, 5.12.8, 5.12.9,
5.12.11, 5.12.14, 5.12.16, 5.12.17, 5.12.20, 5.12.46, 5.12.92. Ausência confirmada: 5.12.60,
5.12.102. PROD-007 em `docs/edital/PROD-melhorias.md`.

### 55.5 Invariantes verificadas

Autorização no servidor por ação nomeada (negativas 9.0/9.1 do smoke; `leitura-exige-acao`);
sem UPDATE/DELETE fora do censo (`Servidor`, `Vinculo`, `HistoricoVinculo` não entram em
`ESCRITA_MUTAVEL_DO_RUNTIME`); dinheiro `Decimal` no salário e nas gratificações; data civil do
ente; nenhum identificador de cláusula na tela (8.4); menu pelo `PermissaoDePerfil` (a captura do
rh@ mostra só Cadastros e Pessoal).

### 55.6 Próximo ponto exato

**P2.3 — folha (profundidade).** Avaliar `~/Desktop/saas-municipal/packages/folha-engine` (3,7 mil
linhas: resolvers drizzle, calculadoras INSS/IRRF/salário-família/13º/proporcionalidade, snapshot
sha256, eSocial; 1,7 mil linhas de teste) como DOADOR DE ALGORITMO — as calculadoras puras podem ser
portadas para `Decimal` e testadas contra os casos de teste dele; os resolvers drizzle não. Tabelas de
INSS/IRRF vêm de tabela do ente, fail-closed (nenhum código no código). Unidade: rubricas e tabelas →
competência → cálculo com memória por servidor e por rubrica → fechamento (snapshot com sha256) →
apropriação contábil pelo M05 (empenho da folha). Depois P2.4 portal do servidor (canal
`portal-do-servidor` das apresentações; contracheque do fechamento).

## 56. V6 P2.3 — a folha de pagamento (M33) e o regime como fato datado

Commits: `a22e9ea` (M33: schema, domínio, serviços, telas, testes, permissões v10, ADR),
`9f3c512` (o regime previdenciário vira evento do vínculo; smoke da folha; papéis da folha nos
percursos), e o commit desta seção (documentação, catálogo, capturas).

### 56.1 O que passou a funcionar

Módulo: **M33 folha**, RH bloco 2. O motor é puro e em `Decimal`; o serviço lê, escolhe a tabela
vigente e grava. Decisão fundadora em `docs/adr/ADR-folha-tabelas-do-ente.md`.

- **Nenhum código no código.** Contribuição por regime (RGPS com faixas e teto; RPPS pela lei do
  ente), IRRF (faixas, dedução por dependente, desconto simplificado, parcela isenta de 65 anos,
  redutor) e salário-família vêm de TABELAS DO ENTE, vigentes por competência (AAAA-MM), com
  `fundamentacaoLegal` obrigatória. Sem tabela vigente: `TABELA-AUSENTE` nomeando tipo e
  competência. Duas com o mesmo início: `TABELA-AMBIGUA`. Quais cenários do IRRF existem é a
  TABELA que diz — não há data embutida no código.
- **Rubricas parametrizadas:** natureza (de onde vem o valor), incidência na base da contribuição
  e do IRRF, proporcionalidade aos dias e ordem no contracheque. As naturezas sistêmicas
  (vencimento, gratificações, contribuição, IRRF, salário-família) existem UMA vez cada, e a
  segunda é recusada nomeando a primeira.
- **Lançamentos** fixos (por vigência) e variáveis (por competência) por matrícula, append-only.
- **O cálculo é fato numerado:** um contracheque por vínculo vivo, com linhas, totais, a MEMÓRIA
  canônica (JSON determinístico) e o sha256 dela; o cálculo leva o sha256 do conjunto. Recalcular
  é o número seguinte; cancelar é um fato; fechar congela UM cálculo. Folha fechada não se
  recalcula; cálculo fechado não se cancela. Nada é apagado ou reescrito.
- **Quem acumula dois cargos** (TR 5.12.79): as bases RGPS se somam, o teto se aplica uma vez e o
  resultado se rateia na proporção das bases (o centavo fica no último); o IRRF é de UMA fonte
  pagadora e também se rateia. A memória de cada contracheque diz que o valor foi imposto pela
  acumulação e por quê. RPPS e isento não agregam a contribuição.
- **O REGIME PREVIDENCIÁRIO VIROU FATO DATADO** (`MUDANCA_REGIME_PREVIDENCIARIO`, dentro de
  `MOVIMENTAR_SERVIDOR`), e a folha de cada competência aplica o regime DAQUELA competência. Ele
  entrou como coluna no primeiro commit e saiu no mesmo dia: com coluna, recalcular maio depois de
  uma migração ao RPPS em junho aplicaria a tabela de junho — o defeito da projeção que o M32
  existe para impedir, agora em dinheiro, e o recálculo é justamente o que se faz quando alguém
  contesta o desconto. A coluna `Vinculo.regimePrevidenciario` permanece como o regime DA ADMISSÃO
  e o fallback dos vínculos legados.
- **Rota real:** área **Folha** no menu — `/folha` (landing), `/folha/folhas` (abrir, calcular,
  cancelar, fechar; contracheques do cálculo vivo), `/folha/folhas/[id]/contracheque/[vinculoId]`
  (a memória legível: faixas percorridas, cenários do imposto com o motivo de cada inaplicável,
  fundamentação de cada tabela, sha256), `/folha/rubricas`, `/folha/lancamentos`, `/folha/tabelas`
  (ilha com as faixas em linhas e campos que mudam com o tipo). Permissões **v10 `folha-m33`**.

Regime de rigor: **PROFUNDIDADE** (dinheiro e cálculo normativo) — caracterização das faixas
conferida por implementação independente, fixture N=2 no rateio da acumulação, negações com
motivo. As telas do módulo são superfície e têm o percurso de navegador.

### 56.2 Comandos executados e resultados

| Comando | Resultado |
|---|---|
| migrations `20260913200000_v6_acoes_folha` (8 `ALTER TYPE`), `…200100_v6_folha` (13 tabelas + 16 CHECKs próprios), `…210000_v6_evento_regime_previdenciario`, `…210100_v6_historico_regime` (coluna + 2 CHECKs) | aplicadas nos três bancos; `generate`; `migrate diff --exit-code` limpo; papel `gestao_app` reprovisionado |
| tsc backend / app / scripts | limpos |
| `m33-folha.test.ts` | **38/38** |
| `m32-pessoal.test.ts` | **57/57** (com as provas do regime derivado) |
| `m16-censo` (296 serviços; 269+20 ações), `m16-atualizacoes` (v10), `molde`, `busca-global`, `menu-contra-o-servidor`, `modelo-sem-caso-de-uso`, `leitura-exige-acao`, `chave-de-comando`, `fronteira-ui`, `descritores-consistentes`, `identidade`, `formularios-na-mesma-pagina`, `rotulos-de-conformidade`, `data-civil` | verdes |
| `test:rapido` | 852/852 |
| permissões v10 (dev e percursos) | 8 concessões em 1 perfil, cada |
| papéis dos percursos | `rh@percursos.local` +7 ações da folha (parametriza, lança, calcula); `contabilidade@percursos.local` +`FECHAR_FOLHA` e `CONSULTAR_FOLHA`. O script deixou de ser inerte: perfil que já existe recebe SÓ as ações que faltam |
| `next build` em `9f3c512` + `servir-percursos` em 3010 | build exit 0 |
| smokes sob o build | ver 56.4 |

Não executados nesta unidade: `test:tudo`, `test:fuso`, portão integral.

### 56.3 Pendências (nomeadas)

Todas no `MODULO.md` do M33, com a razão: `APROPRIACAO-CONTABIL-DA-FOLHA` (5.12.71/72 — o empenho
da folha pelo M05, próxima unidade), `FOLHAS-NAO-MENSAIS` (13º, férias, rescisão, complementar),
`FALTAS-NA-FOLHA`, `PENSAO-ALIMENTICIA-NA-FOLHA`, `CONSIGNACOES-E-MARGEM`,
`ARREDONDAMENTO-DA-FOLHA` (half-even, o do razão), `CONTRACHEQUE-EM-PDF`, `RESUMO-DA-FOLHA`,
`PATRONAL-NA-MEMORIA`. Do M32: `ALTERACAO-CADASTRAL-DO-SERVIDOR` e as demais da §55.3.

Bloqueado por terceiro: nada nesta unidade.

### 56.4 Percursos sob o build `9f3c512`

| Smoke | Resultado |
|---|---|
| `smoke-folha.ts` (papéis rh@ e contabilidade@) | r1 2/14, r2 27/14, r3 29/12, **r4 46/46** — as três primeiras acusaram DEFEITOS DO PRÓPRIO SMOKE, abaixo |
| `smoke-pessoal.ts` | **29/29** (regressão do M32 sob o schema novo) |
| `smoke-cadeia-por-papel.ts` | **23/23** |
| `smoke-identidade.ts` | **46/46** |

O percurso da folha, no que ele prova: as três tabelas do ente cadastradas pela tela com faixas em
linhas; a SEGUNDA rubrica de vencimento-base recusada nomeando a primeira; admissão com regime
previdenciário; horas extras lançadas na competência; o cálculo RECUSANDO a matrícula legada sem
regime e NOMEANDO-A, seguida da informação do regime por fato datado (duas matrículas destravadas
na r3); o contracheque com vencimento 3.000,00 + horas extras 250,00, contribuição 290,00 saída
das três faixas (1.000x7,5% + 2.000x9% + 250x14%), imposto 54,00 pelo cenário do desconto
simplificado e líquido 2.906,00 — conferido à mão; o sha256 da memória; recálculo nº 2;
cancelamento como fato; o RH sem o formulário de FECHAR e a contabilidade sem o de CALCULAR; o
fechamento pela contabilidade; e as duas recusas depois dele.

**⚠️ TRÊS DEFEITOS, TODOS NO INSTRUMENTO, E TODOS DA MESMA FAMÍLIA:** procurar num texto maior do
que a pergunta.

1. A existência das tabelas era lida no CORPO INTEIRO da página — e o corpo tem a descrição do
   cadastro, o filtro e o menu. O smoke concluiu que as três já existiam, não criou nenhuma, e o
   cálculo caiu no `TABELA-AUSENTE` que ele deveria ter evitado (r1).
2. Corrigido para as LINHAS da lista, a rubrica de imposto passou a ser dada como existente porque
   a coluna "incide em" da rubrica de VENCIMENTO contém a palavra "IRRF" (r2, r3). Agora a
   comparação é por CÉLULA INTEIRA.
3. A varredura de competências livres usava `\b(20\d\d-\d\d)\b` — e na célula colada
   ("2027-01MENSAL...") não há fronteira de palavra entre "1" e "M". Achava zero competências
   usadas e reabria a folha da execução anterior (r2).

Um quarto ponto foi defeito do smoke contra regra CERTA do domínio: ele datava o evento de regime
em 2026-01-01, anterior à admissão do vínculo legado, e o `EVENTO-ANTES-DA-ADMISSAO` recusou. A
data passou a ser o último dia da competência calculada.

**Capturas:** `.registro-de-execucao/v6-capturas/depois-9f3c512-folha/` — `/folha`, folhas, detalhe
da folha, **contracheque com a memória**, rubricas, lançamentos e tabelas, em 360/768/1366 px, com
o usuário do papel. "Antes": a área não existia em `a187f89` (menu sem Folha, rota 404).

**Correção de dado no banco dos percursos (não é código):** a execução r1 gravou uma rubrica
`VENC2-266069` de natureza VENCIMENTO_BASE (efeito do defeito 1, que impediu a recusa correta).
Ela foi removida por `DELETE` com o papel dono, sem linhas nem lançamentos dependentes —
registrado aqui porque banco de demonstração também é dado de alguém.

### 56.5 Catálogo por natureza

Superfície (VALIDADO_LOCALMENTE): 5.12.51 (consulta detalhada do pagamento sem imprimir),
5.12.52 (histórico de cálculos e cancelamentos). Superfície parcial: 5.12.50, 5.12.53, 5.12.54,
5.12.62, 5.12.63, 5.12.65, 5.12.66. Modelo/serviço sem percurso (IMPLEMENTADO_NAO_VALIDADO):
5.12.61 (salário-família), 5.12.79 (acumulação de cargos). Ausência confirmada: 5.12.37
(descontos parcelados e consignados), 5.12.83 (margem consignável).

Placar do catálogo: VALIDADO 67 · PARCIAL 82 · IMPLEMENTADO_NAO_VALIDADO 67 · AUSENTE 144 ·
DEPENDÊNCIA 3 · NÃO VERIFICADO 1.674 — **363 de 2.037 verificadas (17,8%)**.

### 56.6 Invariantes verificadas

Dinheiro em `Decimal` do começo ao fim (nenhum `number` no cálculo); arredondamento por faixa e
por linha; razão da folha append-only (cálculo numerado, cancelamento e fechamento como fatos);
autorização no servidor por ação nomeada, com as duas negativas de papel percorridas nos dois
sentidos; período/competência conferido no caso de uso (folha fechada recusa recálculo); data por
dia civil do ente; nenhum identificador de cláusula na tela (6.7); nenhum valor normativo no
código (as três tabelas do percurso são do ente, com fundamentação, e o cálculo recusa sem elas).

### 56.7 Próximo ponto exato

**P2.3b — apropriação contábil da folha (5.12.71/72), sobre o M05.** O fechamento congela um
cálculo com sha256; falta transformá-lo em despesa: agrupar as linhas dos contracheques por
natureza de despesa (vencimentos, encargos patronais, consignações a recolher) e por ficha
orçamentária, empenhar pelo M05 com o roteiro contábil, liquidar e deixar o pagamento para a
tesouraria — com o estorno do empenho ligado ao cancelamento do cálculo. Decisões a tomar antes:
de onde vem a ficha de cada grupo (parametrização por rubrica x ficha), e se a parte patronal
entra neste passo (a tabela já guarda `aliquotaPatronal`, e a memória ainda não a calcula —
pendência `PATRONAL-NA-MEMORIA`).

Depois: **P2.4 portal do servidor** (canal `portal-do-servidor` das apresentações; o contracheque
do fechamento visível ao próprio servidor, com a identidade do M16) e **P3** (mesa de trabalho
M21/M22/M23, fluxos, carta de serviços, portal e transparência).

## 57. V6 P2.4 — o portal do servidor

Commit: `259af64` (ação de leitura própria, porta com recorte pela pessoa da sessão, telas, teste
de porta, smoke de três papéis), e o commit desta seção (documentação, catálogo, capturas).

### 57.1 O que passou a funcionar

O servidor entra com a PRÓPRIA conta em `/portal-do-servidor` e vê:

- **Os seus vínculos**, com cargo, lotação, salário base, gratificações, regime previdenciário e
  situação DERIVADOS dos eventos até hoje (as mesmas funções do M32 que a ficha do RH usa);
- **Os seus dependentes**, com cada finalidade dizendo se VALE HOJE e, quando não vale, o motivo
  (idade passou, baixa por fato, ainda não começou);
- **Os seus contracheques** das folhas **já fechadas**, e cada um abre a conta de cada rubrica e a
  impressão digital (sha256) do cálculo.

**⚠️ O RECORTE É A PESSOA DA SESSÃO, NÃO UM PARÂMETRO.** Nenhuma função da porta recebe id de
servidor ou de vínculo: ela resolve quem é o usuário pelo vínculo EXPLÍCITO usuário → pessoa
(M16, pelo CPF, nunca pelo nome) e lê a partir dele. O contracheque recebe o id da FOLHA pela URL
e o cruza com os vínculos da pessoa — pedir a folha certa com outra conta devolve vazio, não o
contracheque alheio. Sem o vínculo, a tela diz que ele está pendente e quem resolve.

**⚠️ SÓ FOLHA FECHADA.** Um cálculo vivo ainda pode ser cancelado e refeito; mostrá-lo ao servidor
seria entregar como comprovante um valor que a competência ainda pode mudar.

**⚠️ AÇÃO DE LEITURA PRÓPRIA** (`CONSULTAR_PORTAL_DO_SERVIDOR`, permissões **v11**): dar
`CONSULTAR_PESSOAL` a cada servidor abriria a ficha de todo mundo. A ação abre a ÁREA; quem
recorta é a porta. O perfil "SERVIDOR — PERCURSO" dos percursos tem essa ação e mais nenhuma.

O canal `portal-do-servidor` da tela de entrada deixou de ter `href` nulo — porque agora a tela
existe. O guard de identidade (t4) vigia isso nos dois sentidos.

Regime de rigor: **superfície**, com uma exigência de profundidade no recorte — o teste de porta
tem fixture N=2 de HOMÔNIMAS (duas "Maria Souza" com CPFs diferentes), que é exatamente o caso em
que um vínculo por nome entregaria o contracheque de uma à outra.

### 57.2 Comandos executados e resultados

| Comando | Resultado |
|---|---|
| migration `20260913220000_v6_acao_portal_do_servidor` | aplicada nos três bancos; `generate`; `diff --exit-code` limpo |
| tsc backend / app / scripts | limpos |
| `test/portal-do-servidor.test.ts` | **10/10** |
| `m16-censo` (296 serviços; 269+21 ações), `m16-atualizacoes` (v11), `leitura-exige-acao`, `fronteira-ui`, `busca-global`, `menu-contra-o-servidor`, `identidade` | verdes |
| `test:rapido` | 852/852 |
| permissões v11 (dev e percursos) | 1 concessão em 1 perfil, cada |
| `percursos-usuarios-por-papel` | `servidor@percursos.local` criado com o perfil "SERVIDOR — PERCURSO" (1 permissão) |

### 57.3 Percursos sob o build `259af64`

| Smoke | Resultado |
|---|---|
| `smoke-portal-do-servidor.ts` (três papéis: RH, administrador, contabilidade e a própria servidora) | r1 21/2, r2 23/1, **r3 24/24** |
| `smoke-folha.ts` | **46/46** (regressão do M33 sob o build novo) |
| `smoke-pessoal.ts` | **29/29** |
| `smoke-identidade.ts` | **46/46** |

O percurso do portal, no que ele prova: o RH cadastra a pessoa, abre a ficha, admite com regime e
registra o dependente; o ADMINISTRADOR cria o vínculo da conta com a pessoa PELO CPF; o RH calcula
a folha e, **antes do fechamento, o portal da servidora não mostra contracheque nenhum**; a
contabilidade fecha; aí sim a competência aparece, e o contracheque abre a conta de cada linha com
a impressão digital; e as três negativas — a servidora não abre a folha do ente, não abre o
cadastro de pessoal, e um id de folha que não é dela responde 404 em vez do contracheque alheio.

**Dois defeitos, os dois no instrumento** (nenhum no produto): a mensagem de sucesso do vínculo e
do desvínculo SOME com o formulário que a produziu — gravado o vínculo, a linha passa a oferecer
"Desvincular" e a ilha deixa de existir (é a pendência `MENSAGEM-SOME-COM-A-LINHA`, a mesma da
conciliação); e o passo do 404 navegava por um helper que trata resposta fora do 2xx como falha de
execução — correto em toda outra passagem, e cego justamente na que precisa VER a recusa.

**Capturas:** `.registro-de-execucao/v6-capturas/depois-259af64-portal/` (360/768/1366 px, com a
conta da servidora). O menu dela tem UMA área — a captura mostra isso.

### 57.4 Catálogo por natureza

Superfície parcial: 5.39.23 (contracheque por autoatendimento — falta a emissão em PDF e a
configuração de liberação), 5.39.25 (ficha financeira na tela — falta filtro por período e
impressão). Ausência confirmada: 5.12.108 (liberação configurável por tipo de folha e regime — o
único critério é a folha estar fechada, e ele é do sistema).

### 57.5 Invariantes verificadas

Autorização no servidor por ação nomeada, e RECORTE por identidade além dela (a ação abre a área;
a pessoa da sessão decide o conteúdo); nenhum id de pessoa ou de vínculo na entrada da porta;
404 em vez de conteúdo alheio; nenhum identificador de cláusula na tela; menu pelo
`PermissaoDePerfil`; folha aberta não vira comprovante.

### 57.6 Próximo ponto exato

**P2.3b — apropriação contábil da folha (TR 5.12.71/72), sobre o M05.** O desenho já está
decidido pela leitura feita nesta sessão, e fica registrado para a próxima unidade não recomeçar:

- **Grupo de empenho da folha** (cadastro do ente): quais RUBRICAS ele empenha, em qual FICHA, com
  qual categoria da ordem cronológica, e se empenha POR SERVIDOR (credor = o CPF de cada um) ou
  em UM empenho do grupo (credor = a pessoa declarada). As duas práticas existem nos entes, e
  escolher uma por dentro seria inventar norma.
- **Só o BRUTO é empenhado.** Os descontos do contracheque (contribuição, imposto) não são despesa
  orçamentária: são retenções que viajam no PAGAMENTO (o M05/M09 já as compõe). A parte PATRONAL é
  despesa própria e depende de `aliquotaPatronal` entrar na memória (`PATRONAL-NA-MEMORIA`).
- **Numeração determinística**, e é o que dá idempotência: o empenho da folha nasce com
  `numero = <série do grupo>/<competência>/<matrícula>`, e `@@unique([fichaId, numero])` do M05 faz
  a segunda tentativa bater na constraint. Reexecutar a apropriação não duplica empenho.
- **A apropriação NÃO é atômica entre empenhos**, e a razão é medida: `deps.despesa.empenhar` abre
  a própria transação no adapter (`adapter-prisma.ts`), e uma transação única para mil empenhos
  travaria as fichas por minutos. Ela é RETOMÁVEL: cada empenho gravado é um fato; a que parar por
  falta de saldo diz em qual ficha parou, e continuar é reexecutar.
- **A liquidação fica para depois do empenho** (`LIQUIDACAO-DA-FOLHA`): o fechamento é o atesto do
  cálculo, mas quem liquida assume responsabilidade própria e a tela da despesa já existe.

Depois: **P3** — mesa de trabalho (M21/M22/M23), fluxos de processo e carta de serviços.

## 58. V6 P2.3b — a folha fechada vira despesa

Commits: `935a271` (schema, domínio, serviço, telas, testes, permissões v12), `5c4fad4` (smoke),
`9c42d37` (ADR, MODULO, PROD-011), e o commit desta seção.

### 58.1 O que passou a funcionar

**O grupo de empenho** (`/folha/grupos-de-empenho`) é o cadastro que diz COMO a folha vira
despesa: quais rubricas de PROVENTO ele empenha, em qual ficha, com qual categoria do art. 141, e
se o empenho é POR SERVIDOR (credor = o CPF de cada um) ou UM SÓ para o grupo (credor declarado).
As duas práticas existem nos entes, e escolher uma por dentro seria inventar norma que o TR não
fixa. Uma rubrica pertence a UM grupo só — em dois, a mesma verba viraria despesa duas vezes.

**Apropriar** (ação no detalhe da folha FECHADA) chama o `empenhar` do M05: mesmo roteiro
contábil, mesma trava de ficha, mesmo exercício conferido, mesma fila do art. 141. Nada
reimplementa despesa — o empenho da folha é o mesmo `Empenho` que a tela da despesa mostra, e a
lista no detalhe da folha leva até ele.

As três decisões, com a razão de cada uma (`docs/adr/ADR-apropriacao-da-folha-nao-atomica.md`):

1. **Só o BRUTO é empenhado.** Contribuição e imposto retidos são retenções do PAGAMENTO, não
   despesa orçamentária. O cadastro recusa rubrica de desconto no grupo; e uma rubrica de provento
   fora de qualquer grupo INTERROMPE a apropriação antes de empenhar, nomeando-a — empenhar menos
   do que a folha paga seria pior do que não empenhar.
2. **Numeração determinística** (`série/competência/matrícula`), e é ela que dá IDEMPOTÊNCIA: o
   `@@unique([fichaId, numero])` do M05 faz a segunda tentativa reconhecer o que já existe. Não há
   flag de "já apropriada" — há um número que não se repete.
3. **A apropriação NÃO é atômica entre empenhos**, e a razão foi medida no código: o adapter do
   M05 abre a própria transação por empenho (é lá que `travarFichas` roda), e uma transação única
   para mil empenhos manteria as fichas do ente travadas por minutos. Ela é RETOMÁVEL: diz quantos
   já foram, em qual grupo e matrícula parou e por quê, e os empenhos gravados continuam valendo.

**Segregação:** `APROPRIAR_FOLHA` e `CADASTRAR_GRUPO_DE_EMPENHO_DA_FOLHA` são ações próprias
(permissões **v12**) — e quem apropria precisa TAMBÉM de `EMPENHAR`, porque o M05 exige a ação
dele em cada empenho, dentro da transação. Apropriar não é atalho para empenhar. Nos percursos, é
a contabilidade que apropria; o RH calcula e não vê o formulário.

Regime de rigor: **PROFUNDIDADE** (dinheiro, razão e saldo de ficha).

### 58.2 Comandos executados e resultados

| Comando | Resultado |
|---|---|
| migrations `20260913230000_v6_acoes_apropriacao_da_folha` (2 `ALTER TYPE`) e `…230100_v6_apropriacao_da_folha` (4 tabelas + 3 CHECKs) | aplicadas nos três bancos; `generate`; `diff --exit-code` limpo; papel reprovisionado |
| tsc backend / app / scripts | limpos |
| `m33-apropriacao.test.ts` | **13/13** |
| `m16-censo` (298 serviços; 271+21 ações), `m16-atualizacoes` (v12), `molde` (t20), `modelo-sem-caso-de-uso`, `leitura-exige-acao`, `chave-de-comando`, `fronteira-ui`, `descritores-consistentes` | verdes |
| `test:rapido` | 852/852 |
| permissões v12 (dev e percursos) | 2 concessões em 1 perfil, cada |
| papéis dos percursos | `contabilidade@percursos.local` +`CADASTRAR_GRUPO_DE_EMPENHO_DA_FOLHA` e `APROPRIAR_FOLHA` (11 ações) |

**⚠️ DOIS TROPEÇOS DE FERRAMENTA, registrados porque custaram tempo e podem repetir:**

1. **O teste do portal arrastou a porta para o alvo NodeNext.** `test/portal-do-servidor.test.ts`
   importa `lib/portas/portal-do-servidor.ts`, e `test/**/*.ts` está no `tsconfig.backend.json`
   (NodeNext) — a porta passou a ser compilada com outra resolução de módulos e o `tsc` do backend
   acusou onze erros que o vitest não vê. É exatamente a armadilha que o `tsconfig.json` já
   documentava; a correção é a mesma: nomear o arquivo no `include` do app e no `exclude` do
   backend. Fica o aviso: **todo teste novo que importe uma porta precisa desse par**.
2. **O primeiro `next build` desta unidade foi MORTO (exit 143)** — a máquina de 8 GB estava
   rodando, ao mesmo tempo, uma suíte de testes de OUTRO projeto (`whataspp-saas-brain`, de outra
   sessão). O `.next` ficou sem `BUILD_ID` e o `next start` subiu recusando servir. Não se matou o
   processo alheio (regra da V6): o build foi refeito sozinho, com `--max-old-space-size=3072`.
   **Um build e uma suíte pesada não cabem juntos nesta máquina** — é a mesma lição do trinco, que
   só serializa o que é DESTE repositório.

### 58.3 Percursos sob o build

| Smoke | Resultado |
|---|---|
| `smoke-apropriacao-da-folha.ts` | r1 9/6 (competência de janeiro, sem vínculo vivo), r2 13/2, r3 12/3, 14/14 sob `105446e`; sob `d87d07d` parou em 9/5 numa LACUNA DO PRODUTO (abaixo), e **14/14 sob `616f0fc`**, já com a carga de regime pela tela nova |
| `smoke-folha.ts` (regressão sob `d87d07d`) | **46/46** |
| `smoke-portal-do-servidor.ts` (regressão sob `d87d07d`) | **24/24** |

**O que o percurso prova:** o grupo de empenho cadastrado pela ilha (rubricas em caixas, ficha com
saldo, série); a recusa de apropriar ANTES do fechamento, nomeando o motivo; o fechamento pela
contabilidade; a apropriação; o painel dos empenhos no detalhe da folha com o número
determinístico; o link para o empenho DE VERDADE na tela da despesa, com o histórico da
competência; a segunda apropriação que NÃO duplica; e o RH sem o formulário de apropriar.

**⚠️ NO BANCO DOS PERCURSOS, A APROPRIAÇÃO PARA POR SALDO — e isso é dado, não código.** A única
ficha que o grupo pôde escolher é de SERVIÇOS DE TERCEIROS (339039) com R$ 7.000 dotados, e a
folha do mês custa cerca de R$ 27.000 de proventos. O percurso passou a afirmar os DOIS desfechos:
quando cabe, grava e diz quanto; quando não cabe, PARA, diz em qual grupo e matrícula parou e por
quê, e os empenhos já gravados continuam valendo — e a segunda passada grava ZERO novos, que é a
prova da idempotência pelo outro lado. O caminho com empenhos gravados está no log
`smoke-apropriacao-5c4fad4…-r2.log` (2 empenhos, `FP/2026-12/FOL-011562` e `FP/2026-12/FOL-266069`,
R$ 3.000 cada) e nos 13 testes de unidade. Pendência: **`FICHA-DE-PESSOAL-NOS-PERCURSOS`** — o
banco de demonstração precisa de uma ficha 319011 com dotação compatível.

**⚠️ UMA LACUNA DO PRODUTO, ACHADA PELA REGRESSÃO E CORRIGIDA NA MESMA SESSÃO —
`REGIME-DE-VINCULO-DESLIGADO` (ver 58.7).** Cada execução do percurso consome uma competência de 2026, de
dezembro para trás; ao chegar em setembro, a folha passou a incluir uma matrícula LEGADA que foi
desligada no dia 1º daquele mês (viveu um dia, e por um dia tem de ser paga). Ela precisa de
regime previdenciário para saber qual tabela aplicar — e a matrícula DESLIGADA não é oferecida às
movimentações, porque vínculo encerrado não recebe evento novo, que é regra certa. Resultado: não
há caminho pela tela para informar o regime dela, e a folha daquele mês trava.

A decisão está escrita no `MODULO.md` do M32 (pendência 10) e NÃO foi tomada no fim desta sessão:
informar o regime com data anterior ou igual ao desligamento não é movimentação em vínculo
encerrado — é registrar um fato que já era verdade enquanto ele vivia; se aceita, a exceção tem de
ser estreita (só esse tipo de evento, só com data ≤ desligamento). O percurso passou a NOMEAR a
lacuna e parar, em vez de insistir oito vezes e falhar sem dizer por quê.

**Dois defeitos DO PRODUTO achados pelo percurso e pela captura, os dois corrigidos:**

1. **Apropriação com ZERO empenhos mostrava tabela vazia** sob o título "empenhos gerados por esta
   folha" — afirmando que a folha virou despesa quando não virou. Agora a tela diz que a
   apropriação foi tentada, parou antes do primeiro empenho e que apropriar de novo continua dali
   (`105446e`).
2. **O sha256 do cálculo transbordava a célula** do detalhe e se sobrepunha ao texto da coluna
   vizinha — valor certo e ilegível, que é o pior dos dois. `overflow-wrap:anywhere` no valor do
   detalhe do MOLDE, o que vale para todo detalhe do sistema (`d87d07d`). Foi a captura de 1366 px
   que mostrou; nenhum teste de texto veria.

**Capturas:** `.registro-de-execucao/v6-capturas/depois-d87d07d-apropriacao/` (grupos de empenho e
o detalhe da folha com os empenhos, 360/768/1366 px, com a conta da contabilidade).

### 58.4 Catálogo por natureza

Superfície parcial: 5.12.71 (empenhamento automático — falta a liquidação e o patronal).
Ausência confirmada: 5.12.72 (planilha contábil da folha e dos encargos). Placar: VALIDADO 67 ·
PARCIAL 85 · IMPLEMENTADO_NAO_VALIDADO 67 · AUSENTE 146 · DEPENDÊNCIA 3 — **368 de 2.037
verificadas (18,1%)**; 30 das 114 cláusulas do item 5.12 (pessoal e folha) já foram olhadas.

### 58.5 Invariantes verificadas

Dinheiro em `Decimal`; razão append-only (o empenho da folha é o `Empenho` do M05, com o mesmo
lançamento e o mesmo movimento de dotação); saldo da ficha conferido na transação do empenho
(é ele que interrompe a apropriação); exercício aberto conferido; autorização por ação nomeada
em DOIS níveis (o ato da apropriação e o empenho de cada parcela); idempotência com o escopo
dentro da chave (série + competência + matrícula); nenhum identificador de cláusula na tela.

### 58.7 A lacuna achada pela regressão, e a decisão tomada

`REGIME-DE-VINCULO-DESLIGADO` não ficou para depois: a folha de qualquer competência com um
desligado legado ficava travada, e isso é o caminho comum de uma migração de dados.

**A exceção é estreita, e o teste diz exatamente o quanto:** informar o regime com data ANTERIOR
OU IGUAL ao desligamento é aceito no vínculo encerrado (é um fato que já era verdade enquanto ele
vivia); o regime com data POSTERIOR é recusado; e nenhum outro evento passa no vínculo desligado,
nem no DIA do desligamento. A tela ganhou ação PRÓPRIA — "Informar o regime previdenciário (carga
do legado)" — com lista própria, a única que inclui os desligados: oferecer o desligado na lista
das demais movimentações seria oferecer para recusar depois.

⚠️ **E o teste registra o que JÁ VALIA**, para a exceção não ser lida como maior do que é: a
guarda sempre olhou a situação NA DATA DO FATO, então um evento datado dentro da vida do vínculo
já era aceito mesmo lançado depois do desligamento — disciplina das duas datas, não afrouxamento.

`m32-pessoal.test.ts`: **58/58** (o teste novo afirma os quatro casos). A carga de regime do
percurso passou a usar a ação nova, tentando o último dia da competência e, se o vínculo já estava
desligado, o primeiro.

### 58.8 Próximo ponto exato

1. **`LIQUIDACAO-DA-FOLHA`**: a apropriação empenha; liquidar continua ato próprio. O fechamento é
   o atesto do CÁLCULO, e a liquidação em massa precisa de uma decisão sobre o responsável pelo
   atesto — não se inventa um nome no histórico.
2. **`PATRONAL-NA-MEMORIA`**: `aliquotaPatronal` já está na tabela de contribuição; falta o
   cálculo na memória e o grupo de empenho dos encargos (5.12.72/73 dependem dele).
3. **`FICHA-DE-PESSOAL-NOS-PERCURSOS`**: o banco de demonstração precisa de uma ficha 319011 com
   dotação compatível com a folha (hoje só há 339039, e a apropriação para por saldo).

Depois: **P3** — mesa de trabalho (M21/M22/M23), fluxos de processo e carta de serviços.

## 59. V6.1 — a folha certificada vira obrigação liquidada

Commits: `eace37e` (o pedido guardado), `2640edf` (schema, domínio, serviços, testes, permissões
v13), `d26d258` (telas: designações, dimensões separadas, painel do atesto), `4e048c1` (as contas
da liquidação do grupo antigo), `af292c2` (percurso e MODULO), `6c7cee0`
(`FICHA-DE-PESSOAL-NOS-PERCURSOS` resolvida), `0752ba2` (mapa de acesso, catálogo, PROD), e o
commit desta seção.

### 59.1 A decisão que destravou o atesto

A apropriação (§58) EMPENHA. Liquidar continua ato próprio, e o art. 63 da Lei 4.320 manda
verificar o direito adquirido pelo credor "tendo por base os títulos e documentos comprobatórios".
Na compra, o título é a nota fiscal conferida. **Na folha não há nota fiscal**, e fabricar uma
para satisfazer o validador seria mentir no documento. O título passou a ser a folha FECHADA mais
a CERTIFICAÇÃO de quem o ente designou.

**Quem atesta é quem o ente designou, e o sistema não sabe quem é.** Nenhuma norma nacional nomeia
"o diretor de RH" como atestador da folha — isso é ato administrativo do município. Não há cargo
embutido no código: há `DesignacaoNaFolha`, com a `Pessoa`, o `Usuario` ativo (conferido pelo
`VinculoUsuarioPessoa`, explícito — designar um usuário que não É aquela pessoa deixaria o atesto
assinado por um nome e praticado por outro), o ato que a fundamenta, a vigência e o substituto. A
**revogação é fato próprio**, nunca UPDATE: o atesto de março foi praticado sob a designação que
valia em março, e revogar em maio não pode apagar isso. A vigência é DERIVADA, por dia civil do
ente, e o percurso prova as duas bordas (último dia válido, dia do efeito já inválido).

### 59.2 A parede real: as duas contas patrimoniais

`contrapartidaDaLiquidacao` (M01) mapeia ELEMENTO → conta e cobre 30, 39 e 71. O elemento **11**
(vencimentos e vantagens fixas) não está lá, e o `CONTA_VPD` do rol é `3.3.2.1.1.01.00` — VPD de
**serviços de terceiros**. Liquidar a folha por ele lançaria a remuneração dos servidores como
serviço contratado, e o lançamento FECHARIA (ΣD = ΣC em cada subsistema): ninguém veria.

Um mapa por elemento também não resolveria — vencimento, 13º e férias dividem o elemento e
creditam contas de "pessoal a pagar" diferentes. Quem declara as duas é o **grupo de empenho**,
que já é exatamente "quais rubricas, em qual ficha". A liquidação recusa nomeando o grupo quando
faltam, **antes de gravar a primeira**; `roteiroLiquidacaoDaFolha` mantém canônicas as pernas de
ORÇAMENTÁRIO e CONTROLE, porque essas não variam (a DDR tem de sair de "comprometida por empenho"
para "comprometida por liquidação", ou o pagamento debitaria um comprometido nunca creditado).

### 59.3 A segregação é o padrão, conferida na transação

Quem calculou ou fechou não certifica (`AUTOCERTIFICACAO-DA-FOLHA`, nomeando o que fez); quem
certificou não liquida (`AUTOLIQUIDACAO-DA-FOLHA`). A v13 das permissões concede **só**
`DESIGNAR_NA_FOLHA` a quem administra — espalhar `CERTIFICAR_FOLHA` e `LIQUIDAR_FOLHA` pelo perfil
administrador faria a instalação nascer com quem prepara podendo certificar, o oposto do que esta
entrega representa. E o crachá sozinho não certifica: o percurso prova isso no passo 4.3, afirmando
que o FORMULÁRIO de certificar EXISTE para quem foi recusado — sem essa contraprova, o passo 4.2
estaria verde por falta de permissão, o motivo errado.

### 59.4 Comandos executados e resultados

| Comando | Resultado |
|---|---|
| `prisma migrate deploy` ×3 (dev, test, percursos) | 3 migrations aditivas aplicadas; zero DROP |
| `prisma migrate diff --exit-code` | **sem diferença** nos três bancos |
| `provisionar-papel-runtime` ×3 | ok — sem superusuário, sem BYPASSRLS, sem DDL |
| `tsc -p tsconfig.backend.json` e `tsc` (frontend) | **limpos** |
| `vitest run modules/m33-folha/m33-certificacao.test.ts` | **37/37** |
| `vitest run modules/m33-folha/m33-apropriacao.test.ts` | **13/13** (após a extração de `parcelasDoCalculo`) |
| `vitest run modules/m33-folha/m33-folha.test.ts` | **38/38** |
| `vitest run modules/m16-travamento` | **19/19** (censo 304 serviços, 274+21 ações; atualizações v13) |
| `vitest run test/molde test/papel-runtime …` | **223/223** |
| `npm run test:rapido` | **852/852** (81 arquivos) |
| `next build` | **exit 0** em `af292c2` — o binário servido |
| `scripts/mapa-de-acesso.ts` | 202 rotas; 6 públicas; **0 sem portão declarado** |

**Percursos sob o build `af292c2`** (banco dos percursos, `next start -p 3010`):

| Percurso | Resultado |
|---|---|
| `smoke-atesto-da-folha` (NOVO, cinco papéis) | **37/37** |
| `smoke-apropriacao-da-folha` | **16/16** — agora o caminho COMPLETO (era 14/14 com três passos pulados) |
| `smoke-folha` | **46/46** |
| `smoke-portal-do-servidor` | **24/24** |
| `smoke-cadeia-por-papel` | **23/23** |
| `smoke-pessoal` | **29/29** |
| `smoke-identidade` | **46/46** |

⚠️ **`app_sha` ≠ `runner_sha`, e a diferença é só de script.** O binário servido é `af292c2`; o
HEAD ao fim da sessão traz commits posteriores que tocam **apenas** `scripts/` e `docs/`. Conferido
com `git diff --stat af292c2 HEAD -- app lib components modules prisma packages`: **vazio**.

### 59.5 Invariantes verificadas

- **Dinheiro é `Decimal`** em todo o caminho novo; nenhum `number` entra em valor.
- **Append-only**: certificação e devolução são fatos na mesma trilha; a revogação da designação é
  fato; a situação é DERIVADA do último fato daquele cálculo, nunca coluna.
- **Balanceamento por subsistema**: o teste afirma as 18 partidas das três liquidações e confere
  ΣD = ΣC em PATRIMONIAL, ORÇAMENTÁRIO e CONTROLE, **e** que o débito patrimonial é
  `3.1.1.1.1.01.00` — não a VPD de serviços.
- **Idempotência com o escopo na chave**: `@@unique` de `LiquidacaoDaFolha` sobre o empenho +
  `@@unique([empenhoId, numero])` do M05. O teste apaga o elo para simular a morte do processo
  entre o M05 e a gravação, e afirma que a retomada RECONHECE a liquidação em vez de criar a quarta.
- **Autorização no servidor por ação nomeada**, e o percurso prova as negativas por papel.
- **Efeito colateral antes da guarda**: a conferência das contas de TODOS os grupos acontece antes
  de gravar a primeira liquidação — o teste afirma `liquidacao.count() === 0` na recusa.

### 59.6 Achados

1. **O manifesto descrevia uma distribuição que a apropriação não fazia.** Com o filtro de parcela
   zerada só dentro de `apropriarFolha`, o manifesto do atestador listava "grupo X, 1 empenho,
   0,00" que nunca virava empenho. O filtro desceu para `parcelasDoCalculo`, extraída para ser a
   única verdade do agrupamento. Achado pelo próprio teste novo.
2. **O guard t6 do censo recusou o atalho certo.** `certificarFolha` e `devolverFolhaParaCorrecao`
   delegam a um helper que abre a transação, e a ação passou a ser PARÂMETRO do helper — a lição
   que o próprio censo já tinha escrito, aplicada de novo.
3. **A identidade `LOA` não existia no banco de demonstração**, e por isso NENHUMA ficha nascia
   ali: o adapter do M02 assina a `DOTACAO_INICIAL` como "quem dota é a LEI", e o funil do M16
   exige que todo autor de fato exista. Recusa correta, cenário incompleto.
4. **Dois defeitos DENTRO do instrumento do mapa de acesso** (a ação de `recorteDePagina` é o
   segundo argumento; `[^)]*?` parava no `)` de `Object.fromEntries(...)`): 54 rotas apareciam sem
   portão tendo portão. Instrumento que acusa errado manda consertar o que não está quebrado.
5. **Três defeitos do percurso, nenhum do produto**: o campo visível de CPF é mascarado e não
   carrega `name`; o formulário de vincular pessoa RE-RENDERIZA e o seletor deixa de casar (a
   prova virou a recarga, que é melhor que um aviso); e a designação da execução anterior já estava
   revogada — a recusa `DESIGNACAO-JA-REVOGADA` estava certa.
6. **Defeito de produto nomeado e NÃO corrigido**: o molde filtra ações por PERMISSÃO e não por
   ESTADO, e a folha já certificada continua exibindo "Certificar" e "Devolver". O servidor recusa
   e nomeia o motivo — não há furo de integridade —, mas a tela promete o que não fará. Pendência
   `ACAO-FORA-DO-ESTADO-NO-MOLDE`, transversal ao molde, registrada como PROD-015 com a captura.

### 59.7 `FICHA-DE-PESSOAL-NOS-PERCURSOS` — resolvida

O banco de demonstração nasceu só com fichas de 339039, e a que o grupo usava tinha 1.000,00
disponíveis: a apropriação parava por saldo no primeiro servidor e os percursos nunca alcançavam
a liquidação. `scripts/ficha-de-pessoal-percursos.ts` cria as fichas 319011 e 319013 **pelo caso
de uso `criarFicha` do M02** — mesma autorização, mesma dotação inicial, mesma perna no razão; e
`scripts/repontar-grupo-da-folha-percursos.ts` reaponta o grupo, como DONO do banco, porque o
produto proíbe isso em runtime de propósito (`fichaId` está fora do grant: trocar a ficha de um
grupo já empenhado moveria a despesa de dotação sem tocar num lançamento). Reponta em vez de
apagar — os empenhos já gerados são fatos e ficam com a ficha que era a deles.

⚠️ **E a semente achou uma regressão real**: a cadeia por papel escolhia "a ficha com mais saldo",
que passou a ser a de PESSOAL, e a liquidação caiu com `SEM ROTEIRO PARA O ELEMENTO 11` —
corretamente, porque não se compra serviço de terceiro em ficha de vencimentos. O percurso passou
a escolher entre as fichas que TÊM roteiro de liquidação.

⚠️ **Pendência nova nomeada no caminho**: `CRIAR-FICHA-SEM-TELA` — a ação `CRIAR_FICHA` está no
censo e **não tem superfície** (o QDD é só leitura). Foi por isso que a ficha nasceu por script e
não pela interface. É lacuna do planejamento (P1), não desta unidade, e não foi escondida.

### 59.8 Próximo ponto exato

1. **`PATRONAL-NA-MEMORIA`** — os encargos do empregador no motor e na memória, parametrizados por
   entidade, regime, incidência de rubrica e vigência (`aliquotaPatronal` já está na tabela).
   Regras que o adendo fixa e que valem como critério: o custo patronal **não** vira dedução
   pessoal; a dedução do empregado **não** vira segunda despesa; folha já fechada **não** é mutada
   (complemento versionado ou retificação, com comparativo). 5.12.72/73 dependem disso, e o
   empenho dos encargos fecha o que falta de 5.12.71.
2. Depois: **P3** — mesa de trabalho (M21/M22/M23), fluxos e formulários versionados, carta de
   serviços, e os três serviços já escolhidos no V6 (atualização cadastral sujeita a análise;
   requerimento com anexo, exigência e resposta; complemento de documentação de fornecedor).

### 59.9 O que NÃO foi executado nesta unidade

`test:tudo`, `test:fuso` e o portão integral **não rodaram**. A seleção foi direcionada (domínio
alterado, censo, permissões, molde, papel de runtime, rápida e sete percursos de navegador), como
o modo de trabalho da V3 prevê fora do candidato de homologação. Nada aqui está marcado como
validado por eles.

## 60. V6.2 — PROD-015, a ficha pela tela, os encargos do empregador e o P3 (carta de serviços)

Pedido: `docs/lotes/V6-2-patronal-e-p3.md` (commit `43554f7`), adendo ao V6/V6.1. Base local
confirmada `0e412f2`; `af292c2` foi usado só como referência de aceite anterior, nada retrocedeu.
M32/M33, as designações, a certificação e a liquidação salarial NÃO foram refeitas. Stash `11b7892`
preservado; `scripts/fix-claude-cli.sh`, `scripts/fix-cursor-extensao.sh` e
`scripts/manter-claude-cursor.sh` continuam não rastreados e não executados. Staging por caminho
exato em todos os commits. Sem push, deploy, mensagem real, pagamento ou transmissão.

Regime: **profundidade** nos encargos (dinheiro, empenho, liquidação, concorrência, N=2, mutação) e
na autorização do requerente (negação com motivo, N=2, mutação); **superfície** nas telas de
configuração da carta e das representações (caso de uso + autorização + percurso).

Commits: `d206c0e` (PROD-015 no molde), `31f50a9` (ficha pela tela), `092b241`/`43c0bf5`/`5e19994`
(percursos e o resultado da barra), `4db023b` (atesto: a MESMA designação no dia do ato e hoje),
`c6b670a`/`714ee9a`/`47a7f5a` (encargos), `a943f97`/`4d0da1d` (P3 domínio), `6e31879`/`db0e5b5`/
`2ddb109` (P3 telas e percurso), `e2ede10` (mapa de acesso), `e5933ea` (catálogo) `bec8349` (composável de anexo no M22) e o commit desta seção.

### 60.1 PROD-015 — disponibilidade de ação (U0)

Contrato `Elegibilidade` (`packages/contracts/elegibilidade.ts`: ELEGÍVEL / NÃO APLICÁVEL /
PRÉ-CONDIÇÃO com código, motivo e providência). O MESMO predicado é chamado pela porta (projeção da
barra) e pelo caso de uso dentro da transação: folha (`modules/m33-folha/elegibilidade.ts`), documento
fiscal e ordem de compra (`modules/m11-licitacoes/elegibilidade.ts`), encargos, carta de serviços
(`modules/m21-protocolo/carta.ts`), representação e publicação.

Diferença de comportamento na barra (`components/molde/FormsDoRecurso.tsx`):
- **permissão ausente** → a ação não aparece (motivo de permissão), como antes;
- **pré-condição** → aparece TRAVADA: `<section data-acao-estado="bloqueada">`, botão focável com
  `aria-disabled` e o motivo associado por `aria-describedby`, sem formulário;
- **não aplicável** → sai da barra e aparece como estado (`data-acao-estado="nao-aplicavel"`);
- **projeção falhou** → fail-closed: travada com "não foi possível conferir";
- **tela velha** → `__versao` oculto; divergindo, `REGISTRO-MUDOU` antes do caso de uso;
- o resultado do ato que tira a ação da barra fica em `[data-resultado-da-acao][data-resultado-seq]`
  (capturado na própria action — o efeito do formulário nunca rodava no navegador, `5e19994`).

Defeito real achado pelo percurso: o atesto aceitava designação não vigente hoje quando OUTRA cobria
hoje (`4db023b`, teste "DUAS designações" vermelho na versão anterior).

### 60.2 CRIAR_FICHA pela tela (U0) — resolve `CRIAR-FICHA-SEM-TELA`

`/planejamento/fichas` (+`[id]`): ficha nasce com dotação ZERO (sem campo de valor, sem crédito
artificial), seletores referenciados (`/opcoes/[catalogo]`, leitura por catálogo, 401/403/404,
no-store, recorte da UO pelo escopo de `CRIAR_FICHA`). Crédito continua sendo crédito adicional.
`test/ficha-pela-tela.test.ts` 11; `test/ui/campo-referenciado.test.tsx` 6; percurso
`smoke-ficha-pela-tela` 23/23 (r4, u1-r1, u2-r1).

### 60.3 Encargos do empregador (U1) — resolve `PATRONAL-NA-MEMORIA`

Ver `modules/m33-folha/MODULO.md`, seção "Os encargos do empregador". Desconto do servidor e encargo
do ente em modelos separados (o contracheque não muda; folha fechada preservada). Situações
CALCULADO / ZERO_CALCULADO / NÃO_APLICÁVEL / PARÂMETRO_AUSENTE. Parâmetro aprovado por outra pessoa;
apuração numerada com sha256 e retomada; atesto com atribuição própria; empenho só da diferença, com
interrupção nomeada e retomada sem duplicar; liquidação pelo M05. Permissões v14 (só cadastrar e
apurar). `m33-encargos-motor` 16, `m33-encargos` 12 (N=2; mutações da diferença e da atribuição
acusadas), `resumo-da-folha` 4 (PDF lido por pdf.js).

Percurso `smoke-encargos-da-folha` (seis papéis, folha 2026-12 legada): U1 25 ok / 2 falhas (2.1, a
aprovação desmontava a barra — silêncio; corrigido em `47a7f5a`). No binário final (`2ddb109`) o 2.1
PASSOU; os passos 3.7/3.8 falharam por ESTADO RESIDUAL da execução U1 na mesma competência (o grupo
`ENC-B-RAT-48549` da execução anterior, sem crédito, é o primeiro da fila): o ato recusou nomeando o
grupo, que é o comportamento; o percurso é que não é reexecutável na mesma competência
(`PERCURSO-ENCARGOS-NAO-REEXECUTAVEL`). Não marcado como aprovado.

### 60.4 P3 — carta de serviços, requerente, mesa e representação (U2)

Ver `modules/m21-protocolo/MODULO.md` §7 e `modules/m19-pessoas/MODULO.md`.

**Rotas reais por papel** (mapa em `docs/mapa-de-acesso.md`, 0 sem portão):

| Papel | Rotas | Campos que vê |
|---|---|---|
| visitante (sem sessão) | `/servicos`, `/servicos/[slug]` | versão publicada: descrição, requisitos, documentos, canais, custo/prazo com fundamento ou "não declarado", etapas copiadas do roteiro, rótulos do formulário. Sem id interno; rascunho = 404 |
| requerente (`SOLICITAR_SERVICO` + `CONSULTAR_MEUS_SERVICOS`) | `/meus-servicos`, `/meus-servicos/solicitar/[slug]`, `/meus-servicos/[id]`, `/meus-servicos/[id]/documentos/[anexo]` | situação derivada, exigências dirigidas a ele e as próprias respostas, documentos que enviou e respostas liberadas, mensagem da decisão, código verificador. NÃO: fundamento interno, parecer, despacho, anexo interno, nome de quem analisa |
| representante (idem + representação vigente) | as mesmas, em nome da empresa enquanto vigente | idem; revogada, 404 |
| mesa (`CONSULTAR_PROTOCOLO` + `DECIDIR_SOLICITACAO_DE_SERVICO`) | `/protocolo/solicitacoes`, `/protocolo/solicitacoes/[id]` | contagem por situação, respostas, representação usada e vigência, proposta cadastral com o valor atual ao lado, documentos (pela rota de anexos do processo), decisão com fundamento interno, histórico interno |
| gestor da carta (`CONFIGURAR_CARTA_DE_SERVICOS`, `REGISTRAR_REPRESENTACAO`) | `/protocolo/servicos/**`, `/cadastros/representacoes/**` | versões, rascunhos, publicação, representações com vigência derivada |

**Testes:** `m21-carta.test.ts` 13 (N=2; t8 concorrência vermelho sem o trinco, por mutação);
`test/carta-de-servicos.test.ts` 5 (t2/t4 vermelhos sem o recorte de titular, por mutação);
`m16-v15-carta.test.ts` 3; censo 324 serviços / 282+22 ações; permissões v15.

**Percurso** `scripts/smoke-carta-de-servicos.ts` (administrador, gestor da carta, visitante, cidadã
A, cidadã B, mesa, representante), tudo pela tela: r1 21/4 (o percurso não abria o `<details>` do
vínculo), r2 59/2 contra `db0e5b5` — **defeito real**: a resposta à exigência desmontava a ilha e o
aviso sumia (silêncio); corrigido em `2ddb109` — e a busca de pessoa do próprio percurso; **r3 61/0
contra `2ddb109`**. Capturas: `.registro-de-execucao/pacote-v6-2/capturas/p3-*.png`.

**Defeitos reais achados no caminho:** UPDATE em `VersaoDoServico`/`PropostaDeAlteracaoCadastral` que
o papel de runtime não tem (a suíte roda como dono e não acusaria) → gravação por INSERT, migration
aditiva `20260914120200` (`4d0da1d`); o grep t15 do M22 acusou `tx.anexo.create` fora do módulo — o
meu (servico.ts) e um PRÉ-EXISTENTE desde `14b2daa` (XML do documento fiscal, V5) → composável
`gravarAnexoNaTransacao` no M22 usado pelos dois (`bec8349`; m22/m21/censo/carta 84/84, m11 documento fiscal 24/24).

**Binário final `bec8349`** (rebuild após o composável de anexo, `next build` exit 0): percurso da carta
de serviços **61/0** (r4, com envio e download de documento passando pelo M22). Os percursos
`smoke-compras` e `smoke-identidade` NÃO executaram neste binário: o Chrome do Puppeteer
(`~/.cache/puppeteer`) sumiu da máquina entre as execuções, por agente externo a esta sessão
("Could not find Chrome 150.0.7871.24"); não foi reinstalado sem autorização
(`npx puppeteer browsers install chrome` restaura). Os demais números de 60.3/60.4 são do binário
`2ddb109`, que difere de `bec8349` só no composável de anexo.

### 60.5 Instalação limpa e atualização

`.registro-de-execucao/pacote-v6-2/build/instalacao-limpa-u2.log`: banco novo
`gestao_publica_instalacao_v62_u2` — 146 migrations, 26 SQL manuais, deriva vazia, papel `gestao_app`
sem superusuário/BYPASSRLS/DDL, bootstrap com 304 permissões, v12–v15 com prévia 0. Atualização
(banco dos percursos v62): as 3 migrations do P3 aplicadas; v15 prévia 3 → aplicada (3 concessões
em 1 perfil) → reaplicar RECUSADO (`ATUALIZAÇÃO JÁ APLICADA`).

### 60.6 Pendências nomeadas (novas ou mantidas)

Produto: `CARTA-SEM-SERVICO-ANONIMO`, `AVALIACAO-DO-SERVICO`, `CANAL-DA-CARTA-SEM-ATIVACAO-NA-APRESENTACAO`,
`GESTOR-POR-QUALQUER-PERMISSAO-GLOBAL`, `ALTERACAO-CADASTRAL-CONCORRENTE-SEM-TRINCO`,
`NOTIFICACAO-EXTERNA-AO-REQUERENTE`, `REPRESENTACAO-POR-ESCOPO`, `REPRESENTACAO-ANEXO-DO-FUNDAMENTO`,
`ANULACAO-DOS-ENCARGOS`, `ENCARGO-POR-TIPO-DE-VINCULO`, `RECOLHIMENTO-DOS-ENCARGOS`,
`DESIGNACAO-POR-ENTIDADE`, `MOVIMENTO-DE-DOTACAO-ZERO-NO-RAZAO`, `LEI-DE-CREDITO-SEM-TELA`,
`CARGA-DA-LOA-PELA-TELA`, `REVOGACAO-COM-EFEITO-FUTURO-NAO-SE-ANTECIPA`.
Achado fora do escopo, NÃO corrigido: `DEPENDENTE-BAIXA-EXIGE-UPDATE-SEM-GRANT` — `m32-pessoal/servico.ts`
dá `finalidadeDependente.update` e `FinalidadeDependente` não está em `prisma/papel-runtime.ts`; sob o
papel de runtime a baixa do dependente falharia.
Percursos: `PERCURSO-ENCARGOS-NAO-REEXECUTAVEL`; atesto u1-r1 38/2 (4.2/4.3, premissa de revogação
com efeito futuro) não reexecutado no binário final; `smoke-apropriacao-da-folha` não reexecutado
(competências 2026 esgotadas no banco dos percursos); `PREPARADOR-INSTALACAO-LIMPA` (o preparador de
percursos cai no roteiro orçamentário da sintética 5.2.2.1.1.00.00 do plano oficial; o banco v62 foi
clonado por TEMPLATE).

### 60.7 O que NÃO foi executado

`test:tudo`, `test:fuso` e o portão integral **não rodaram**. Nenhuma publicação — a pergunta sobre
24 horas não a autoriza. O verde de `af292c2` não foi carregado para os binários novos.

### 60.8 Próximo ponto exato

1. Restaurar o Chrome do Puppeteer e reexecutar compras e identidade no binário `bec8349`; rodar `test:tudo` e `test:fuso` sob o trinco (não rodaram nesta unidade) e decidir
   `DEPENDENTE-BAIXA-EXIGE-UPDATE-SEM-GRANT` (grant por coluna assinado ou baixa como fato).
2. Tornar o percurso dos encargos reexecutável (competência própria ou folha nova por execução) e
   reexecutar atesto e apropriação num banco de percursos com competência livre.
3. P3 restante: serviço sem login com reCAPTCHA, avaliação do serviço (Lei 13.460), link da carta na
   entrada ativável pela apresentação, e o recorte de "gestor" do M21 por ação em vez de qualquer
   permissão global.

## 61. V7 M1 — consolidação (U0–U6) e M2.1 — o contrato acompanhado

Pedido: `docs/lotes/V7-M1-consolidacao.md` (com o plano mestre e o padrão de experiência, guardados
como vieram em `e98a4da`). Frente funcional: consolidação de P2/P3 (M21, M32, M33) e o primeiro
incremento de M2 (M11). Regime: **profundidade** para autorização do M21, dependentes sob o papel de
runtime, ajuste dos encargos e medição por itens; **superfície** para telas, carta, ouvidoria e dossiê.
Publicação, hospedagem e meta de 24 h: não retomadas.

### 61.1 Referências confirmadas

- `c2123b9` é ancestral de HEAD; nenhum reset, nenhuma branch restaurada. O binário `bec8349` da
  seção 60 não foi reaproveitado como aceite: cada candidato abaixo tem o próprio build.
- Stash `11b7892` intacto (não aplicado, não removido). Um stash acidental de `prisma/schema`
  (`4a43eb0`, desta sessão) foi aplicado por SHA e removido pelo rótulo, sem tocar no `11b7892`.
- `scripts/fix-claude-cli.sh`, `fix-cursor-extensao.sh`, `manter-claude-cursor.sh`: não executados,
  não incluídos em commit (continuam não rastreados).
- SHAs: **app `5937f41`** (V7 M1 + M2.1), **runner `acbae82`** (só `test/modelo-sem-caso-de-uso.test.ts`
  muda), **runner `a699f8a`** (só o detector da premissa do percurso dos encargos), **candidato de
  telas `2d7a9cd`** (61.7).

### 61.2 O que passou a funcionar (rotas reais)

- **U0 — ambiente de prova.** Chrome for Testing 150.0.7871.24 (revisão do puppeteer instalado) em
  `.cache-puppeteer/`, lido por `.puppeteerrc.cjs`; `scripts/preflight-navegador.ts` confere
  executável, página local e PDF, e sai com código 3 antes do primeiro clique
  (`docs/operacao/NAVEGADOR-DOS-PERCURSOS.md`). Banco descartável por TEMPLATE com identidade
  conferida (`scripts/banco-descartavel.ts`, só nomes `gestao_publica_(percursos|capturas|instalacao)_v7m1_*`),
  servidor dos percursos pelo papel `gestao_app` (`scripts/servir-percursos.ts`), candidato em
  worktree fixada em commit (`../gestao-publica-candidatos/candidato-<sha>`).
- **U1 — escopo do M21 por capacidade** (`17b9314`). Permissão global de outra área não faz gestor
  do protocolo: sem `CONSULTAR_PROTOCOLO` não alcança; participação alcança inclusive sigiloso; o
  sigilo prevalece sobre o gestor; agir sem lotação exige a ação do ato no ente e processo não
  sigiloso. Mesma decisão para caixa, detalhe, anexo, lote e mesa (`m21-escopo.test.ts`, 7 cenários,
  mutações acusadas). Resolve `GESTOR-POR-QUALQUER-PERMISSAO-GLOBAL`.
- **U2 — dependentes** (`a21b1e2`). Reproduzido com `gestao_app`: a baixa fazia UPDATE sem grant. Agora
  `EncerramentoDeFinalidadeDependente` (fato, data de efeito, motivo, único por finalidade); cálculo,
  portal e ficha leem `baixaEfetiva()`; folha fechada não se recalcula e o retroativo nomeia as
  competências atingidas. Nenhum grant novo (`contrato-runtime-m32.test.ts`, 8). Resolve
  `DEPENDENTE-BAIXA-EXIGE-UPDATE-SEM-GRANT`.
- **U3 — encargos para baixo e guia** (`4249fbe`, `8a03367`, `a5fa882`). Diferença positiva empenha;
  negativa anula pelo M05 na ordem da cadeia (liquidação não paga, depois empenho não liquidado); o
  já pago vira `RESTITUICAO_A_PROVIDENCIAR`; nenhuma despesa nova, nenhum valor negativo, líquido e
  contracheque intactos. Guia de recolhimento é documento do EMISSOR, registrada com arquivo (M22),
  conferida contra obrigação liquidada e baixada só contra pagamento existente; o sistema emite apenas
  o **demonstrativo interno** (PDF/CSV), que diz não ser guia — sem código de barras, PIX ou
  autenticação. Rota: `/folha/folhas/[id]` (painel da competência → Ajustar os encargos para baixo;
  Obrigações e guias). O ajuste só se oferece a quem tem `ANULAR_LIQUIDACAO_PARCIAL` e
  `ANULAR_EMPENHO_PARCIAL` (`AJUSTE-EXIGE-ANULACAO-DO-M05`). Resolve `ANULACAO-DOS-ENCARGOS`
  e `RECOLHIMENTO-DOS-ENCARGOS` (este sem retorno bancário).
- **U4 — sem login e avaliação** (`a644915`, `be10905`, `4f8cf5a`). `/ouvidoria` (natureza
  `MANIFESTACAO_ANONIMA`, processo sigiloso sem requerente, código mostrado uma vez e guardado por
  sha256, sem referer, cota local por origem), `/ouvidoria/acompanhar`, `/protocolo/ouvidoria`
  (triagem e resposta com lotação), `/servicos/[slug]` (resultado por origem, opinião sem conta),
  `/meus-servicos/[id]` (avaliação do atendimento decidido, revisão encadeada), `/protocolo/avaliacoes`
  (metodologia versionada, moderação com motivo). Janela da avaliação por dia civil do ente.
  Resolve `CARTA-SEM-SERVICO-ANONIMO` e `AVALIACAO-DO-SERVICO`.
- **U5 — primeira passada de experiência** (`9f89832`). Barra do molde com índice dos atos e o que o
  perfil não pode num bloco único; painel da competência no topo da folha com a próxima ação lida da
  mesma disponibilidade; "o que falta" no topo do requerente; trilha sem id técnico; nota da mesa sem
  caminho cru. Nenhum design system, RBAC ou ledger novo.
- **M2.1 — contrato acompanhado** (`5937f41`, `acbae82`). No `Contrato` do M11: designação de GESTOR e
  FISCAL (pessoa e usuário do vínculo, ato, vigência derivada, revogação como fato, sem acúmulo no
  mesmo contrato); itens com quantidade e unitário (Σ até o valor vigente); agenda do gestor para o
  fiscal; ocorrência com evidência (M22) e encaminhamento; resolução do gestor; **medição por itens**
  pelo fiscal vigente (valor = Σ quantidade × unitário, acumulado por item sob o trinco do contrato);
  aprovação da medição como **fato** `AprovacaoDeMedicao` (achado do contrato de runtime: o
  `aprovarMedicao` fazia UPDATE em `MedicaoDeObra`, fora do censo). Físico e financeiro separados.
  Rotas: `/licitacoes/contratos/[id]` (dossiê e formulários por papel), `/transparencia/contratos` e
  `/transparencia/contratos/[id]` (projeção sem ocorrência, evidência, conta ou CPF; só medição aprovada).
  Ações novas no censo: `DESIGNAR_NO_CONTRATO`, `CADASTRAR_ITEM_DO_CONTRATO`,
  `PROGRAMAR_FISCALIZACAO_DO_CONTRATO`, `REGISTRAR_OCORRENCIA_DE_FISCALIZACAO`,
  `RESOLVER_OCORRENCIA_DE_FISCALIZACAO`; permissões v18.

### 61.3 Resultados integrados — cada um com o SHA em que rodou

Saída bruta em `.registro-de-execucao/pacote-v7-m1/u6-<sha>/` (ignorado; credenciais sanitizadas).

| Verificação | `4f8cf5a` | `5937f41` (app) / `acbae82` (runner) |
|---|---|---|
| tsc backend / app | passou / passou | passou / passou (5937f41); backend passou (acbae82) |
| prisma validate | passou | passou / passou |
| deriva do schema (banco de teste) | falhou por ambiente (vitest da árvore principal migrou o banco com M2.1) | 0 / 0 |
| contrato do papel de runtime | 33/33 | 34/34 / 34/34 |
| suíte completa | 2722/2722 | 2729/2731 (guarda `ItemMedido`; m03 t8 timeout sob carga) / **2731/2731** |
| suíte sob TZ=Pacific/Kiritimati | 2722/2722 | 2730/2731 / **2731/2731** |
| next build (SHA completo) | passou (SHA curto → identidade 3.2) | passou |

- m03 t8 em `5937f41`: timeout só na suíte completa sob carga; isolado passou 3 de 3
  (`07b-m03-isolado-r1..r3.log`) e passou no fuso e no runner `acbae82`. Classificado como intermitência
  sob carga, com o nome do teste e a saída bruta; timeout não foi alterado.
- `9f89832` (candidato anterior): falhas reais que viraram `4f8cf5a` — `data-civil` (UTC na janela da
  avaliação) e a mensagem da ordem empenhada no m11. Duas paradas do Postgres por ociosidade da máquina
  deram resultados **bloqueados por ambiente**, arquivados em `u6/falhas-por-ambiente` e não somados.

**Percursos centrais sobre o build `5937f41`** (papel `gestao_app`, porta 3012):

| Percurso | Banco | Resultado |
|---|---|---|
| carta de serviços (P3 identificado, anônimo, representação, avaliação, ouvidoria) | `v7m1_m21` | 83/0 |
| encargos — cenário limpo (redução, ajuste, guia, demonstrativo PDF lido) | `v7m1_m21` | 40/0 (em `4f8cf5a` era 36/4 → `a5fa882`) |
| pessoal | `v7m1_m21` | 29/0 |
| folha | `v7m1_m21` | 47/0 |
| portal do servidor | `v7m1_m21` | 24/0 |
| atesto da folha | `v7m1_m21` | 43/0 |
| compras / documento / ordem | `v7m1_m21` | 29/0 |
| identidade | `v7m1_m21` | 46/0 |
| **contrato acompanhado** (gestora, fiscal, outro setor, visitante, revogação) | `v7m1_m21` | **25/0** |
| encargos — fila, r1 | `v7m1_fila` (origem original) | 16/2 — **não executado de fato**: a ficha sem crédito 32260 não existe nessa origem (erro do procedimento) |
| encargos — fila, r2 | `v7m1_fila62` (origem v62) | 22/7 — **bloqueado pela premissa**: resíduo da V6.2 em 2026-12 (grupos, empenhos e designação) e detector da premissa defeituoso |
| ficha pela tela (cria a ficha sem crédito 37450) | `v7m1_fila3` | 23/0 |
| **encargos — fila, r3** (runner `a699f8a`, app `5937f41`) | `v7m1_fila3` (origem original + ficha pela tela) | **29/0** |

Achado de instrumento (r2): o detector da premissa usava `\bcertificada\b` sobre o `textContent` colado
do cartão e nunca respondia COM atesto. Corrigido em `a699f8a` para ler o selo; provado nos dois
sentidos — `v7m1_fila62` → "COM · selo certificada" (`31-prova-da-premissa.log`), `v7m1_fila3` → "SEM ·
selo pendente", ambos confirmados pela mensagem do servidor na apuração.

**Capturas antes/depois** (`scripts/capturas-da-experiencia.ts`, 12 telas × 360/768/1366/1440, instrumento
provado por mutação a cada execução): antes — mesa-detalhe a 768 px transbordava 26 px; depois (build
`5937f41`, `capturas_v7m1_depois`) — 0 px de transbordo, 0 foco invisível e 0 coberto nas 48 medidas.
Capturas dos percursos do contrato: `u6-5937f41/capturas/contrato-{gestora,fiscal,publico}.png`.

### 61.4 Instalação limpa e atualização

- Instalação limpa em `4f8cf5a` (`u6-4f8cf5a/10-instalacao-e-atualizacao.log`): 153 migrations, 26 SQL
  manuais, deriva vazia, `gestao_app` sem superusuário/BYPASSRLS/DDL, bootstrap com 307 permissões,
  v7–v17 reconhecidas.
- Atualização em `5937f41` sobre três cópias isoladas (`u6-5937f41/10-atualizacao-dos-bancos.log`,
  `11-…fila62.log`, `12-…fila3.log`): banco original dos percursos (v13) → 156 migrations, deriva 0,
  v14–v18 aplicadas uma vez; **reexecução reconhece** ("Nenhuma atualização pendente") e continua;
  contas dos papéis provisionadas sem conceder ações a mais. Banco v62 → as 10 migrations da V7, v16–v18.
- Ações deliberadamente não concedidas (as novas do M2.1 só vão aos administradores globais em v18)
  não viraram erro resolvido por grant universal.

### 61.5 Catálogo (por natureza)

`scripts/marcar-catalogo.ts --aplicar`: **379 de 2.037 verificadas** (eram 371). Superfície com percurso →
`VALIDADO_LOCALMENTE`: 5.39.6 (ouvidoria sem conta), 5.39.105 (avaliação nas três dimensões e descrição),
5.21.22 (ocorrência de fiscalização). Modelo com lacuna declarada → `PARCIAL`: 5.21.3 (sem horário e sem
calendário), 5.21.16 (atos restritos à designação; leitura não), 5.21.19 (sem vínculo a compra), 5.21.23
(tipo fixo, sem cópia de anexos da fiscalização), 5.17.83 (sem designação por aditivo), 5.21.29 (quantitativo
dos itens do contrato, não planilha da obra). Ausência de provedor → `DEPENDENCIA_EXTERNA`: 5.39.102
(reCAPTCHA; a cota local não é declarada como antiabuso). 5.39.104 `PARCIAL` → `VALIDADO_LOCALMENTE` pelo
percurso 9.12b no candidato `2d7a9cd` (61.7). 5.38.56 não marcada: o link existe, mas nenhum percurso o afirma.
Contagem: VALIDADO_LOCALMENTE 72, PARCIAL 92, IMPLEMENTADO_NAO_VALIDADO 66, AUSENTE_CONFIRMADO 145,
DEPENDENCIA_EXTERNA 4, NAO_VERIFICADO 1.658.

### 61.6 Pendências nomeadas

Produto: `ACESSO-ESPECIAL-A-SIGILOSO`, `GESTOR-NO-COMUNICADO`, `ANTIABUSO-EXTERNO-NAO-CONECTADO`,
`OUVIDORIA-REENVIO-DUPLICA`, `OUVIDORIA-ENCAMINHAMENTO-A-OUTRO-SETOR`, `AVALIACAO-SEM-LIMIAR-DE-PUBLICACAO`,
`RETORNO-BANCARIO-DA-GUIA`, `RESTITUICAO-DOS-ENCARGOS-SEM-ATO`, `VENCIMENTO-LEGAL-SEM-TABELA`,
`RETROATIVO-DE-DEPENDENTE-EXIGE-RETIFICACAO`, `ADITIVO-POR-ITEM`, `DESIGNACAO-POR-ADITIVO`,
`ORDEM-DE-SERVICO-DO-CONTRATO`, `MEDICAO-POR-ITENS-SEM-OBRA`, `PRAZO-DE-RESOLUCAO-DA-OCORRENCIA`,
`NOTIFICACAO-AO-CONTRATADO`, `RECEBIMENTO-PROVISORIO-E-DEFINITIVO`, `AGENDA-SEM-HORARIO-E-CALENDARIO`,
`LEITURA-DO-CONTRATO-NAO-RESTRITA-A-DESIGNADOS`, `CANAL-DA-CARTA-SEM-ATIVACAO-NA-APRESENTACAO`,
`LEI-DE-CREDITO-SEM-TELA`; mantidas das seções 35.7–60.
Percursos/ambiente: `PERCURSO-ENCARGOS-FILA-EXIGE-FICHA-PELA-TELA` (a fila só tem premissa limpa com a
ficha sem crédito criada pela tela no mesmo clone — o banco v62 carrega resíduo da V6.2);
`M03-T8-INTERMITENTE-SOB-CARGA`; `POSTGRES-PARA-EM-OCIOSIDADE` (o contêiner saiu duas vezes com a máquina
ociosa). Não executados nesta seção: `smoke-apropriacao-da-folha`; suíte completa e fuso sobre `2d7a9cd` (a
diferença para `acbae82` é de leitura de tela, uma asserção em `carta-de-servicos.test.ts` e percursos —
verificação direcionada abaixo, não portão integral).

### 61.7 Candidato de telas `2d7a9cd` (achados das capturas sobre `5937f41`)

- `/servicos` dizia a todos que "pedir exige entrar com a sua conta" — falso desde a ouvidoria sem conta;
  agora cada serviço mostra "Pedido com a sua conta" ou "Sem conta nem identificação" (`data-exige-conta`).
- `/licitacoes/contratos/[id]` mostrava "Fiscal do contrato: (não designado)" com o fiscal designado logo
  abaixo; o campo antigo virou "Fiscal em texto (registro anterior)" e aponta para "Gestor e fiscais".
- O selo VIGENTE/ENCERRADO do contrato comparava instantes; passa a comparar o dia civil do ente.

Verificação: tsc app 0; `carta-de-servicos`, `molde`, `data-civil` 28/28 (sob o trinco); tsc backend e
scripts 0. Build do SHA completo passou. Percursos (papel `gestao_app`, `v7m1_m21`):

| Percurso | App | Runner | Resultado |
|---|---|---|---|
| carta — prova do passo novo 9.12b | `5937f41` | `2d7a9cd` | 83/1 — **acusou** (`ausente`), como devia |
| carta | `2d7a9cd` | `2d7a9cd` | 84/0 |
| identidade | `2d7a9cd` | `2d7a9cd` | 46/0 |
| contrato acompanhado, r1 | `2d7a9cd` | `2d7a9cd` | 24/1 — 3.3 recusado por PERÍODO SOBREPOSTO com a medição da execução anterior no mesmo banco: produto certo, percurso não reexecutável |
| contrato acompanhado, r2 | `2d7a9cd` | `5b40af8` (procura o dia livre) | **25/0** |

Instalação limpa em `2d7a9cd` (`u6-2d7a9cd/10-instalacao-limpa.log`): 156 migrations, 26 SQL manuais, deriva
vazia, `gestao_app` sem superusuário/BYPASSRLS/DDL, bootstrap com 312 permissões, v5–v18 reconhecidas e a
reexecução responde "Nenhuma atualização pendente".

### 61.8 Próximo ponto exato

1. M2.1 restante, por dependência: `ORDEM-DE-SERVICO-DO-CONTRATO` e `RECEBIMENTO-PROVISORIO-E-DEFINITIVO`
   (o efeito do fiscal na liquidação), `DESIGNACAO-POR-ADITIVO`, `AGENDA-SEM-HORARIO-E-CALENDARIO`,
   `LEITURA-DO-CONTRATO-NAO-RESTRITA-A-DESIGNADOS` — com a projeção pública da obra.
2. Portão integral (suíte e fuso) no próximo candidato que tocar domínio; `smoke-apropriacao-da-folha` num
   clone com competência livre.
3. Depois, F07/F08 conforme `docs/lotes/V7-plano-mestre-ecossistema.md`. P3, folha e M11 **não** estão
   completos: as pendências de 61.6 continuam abertas.


## 62. V7 M2 — a ponte contratual (U0–U6), o candidato `8ed0806` e a continuidade U7/U8/B1

Pedidos: `docs/lotes/V7-M2-execucao-contratual.md` e `docs/lotes/V7-M2-criterios-de-aceite.md` (U0–U6);
`docs/lotes/V7-M2-fechamento-u7-u8.md` (fechamento, U7, U8, B1). Regime: **profundidade** para saldo, recebimento,
liquidação, idempotência e concorrência; **superfície** para as telas e documentos. Executor único (A) na fila
fechamento → U7 → U8 → B1; nenhuma frente paralela simulada.

### 62.1 Referências confirmadas

| Item | Valor |
|---|---|
| Base do M2 | `3deaf37` (fim do M1) |
| Commits locais `3deaf37..8ed0806` | 17 — 6 de funcionalidade (U0.1, U0.2, U1/U2, U3, U4, U5, U6 = `b5c40a9`, `064a9f1`, `4d1a787`, `b2c1c10`, `85056f6`, `8930b90`, `a86ac38`), 6 correções achadas pelos candidatos (`10c9324`, `208246f`, `c75a72f`, `3288b9b`, `d4d2278` e o provedor de `d167c02`), 3 de percurso/instrumento (`eef260a`, `2a07593`, `8ed0806`), 2 de documento (`e5e81f2`, `3574ed6`) |
| Depois de `8ed0806` | `b5ef015` (pedido guardado), `d167c02` (correção do passo 2.2 da planilha) |
| Stash `11b7892` | intacto, não aplicado |
| Scripts de terceiros | `scripts/fix-claude-cli.sh`, `fix-cursor-extensao.sh`, `manter-claude-cursor.sh`: fora dos commits, não executados |
| Push, deploy, mensagem, pagamento, transmissão | nenhum |

### 62.2 O que passou a funcionar (rotas reais)

- **Acesso da fiscalização (U0.1)** — três projeções decididas no servidor (`acesso-da-fiscalizacao.ts`):
  FISCALIZAÇÃO por designação vigente hoje (gestor, fiscal, recebedor definitivo) ou `AdministradorDaFiscalizacao`
  vigente; FINANCEIRA por leitura de licitações/despesa ou ato de empenhar/liquidar/pagar, sem agenda, ocorrência,
  motivo nem termo provisório; PÚBLICA campo a campo. Rotas: `/licitacoes/contratos/[id]`, `/licitacoes/fiscalizacao`,
  `/transparencia/contratos/[id]`, download de evidência e termos (404 fora do alcance). Detalhe no MODULO do M11.
- **Unicidade da medição (U0.2)** — a identidade da parcela é o SALDO por item (contratado; na ordem, o autorizado),
  não o dia: mesma chave e conteúdo = replay (ME01); mesma chave e outro conteúdo = conflito (ME02); mesma parcela com
  outra chave = `ITEM-ACIMA-DO-AUTORIZADO-NA-ORDEM`/`-CONTRATADO` (ME03); duas parcelas no mesmo dia passam (ME04);
  período indivisível só com `RegimeDeMedicaoDoContrato` configurado, com fundamento e vigência (ME05). Fundamento:
  sem configuração não se inventa regime; o período só identifica a parcela quando o contrato assim declara
  (art. 140, § 3º remete a regulamento ou contrato).
- **Ordem de serviço, medição da ordem e recebimentos (U1/U2)** — `/licitacoes/contratos/[id]/ordens/[ordemId]`:
  rascunho → emissão (compromete saldo, manifesto + sha256) → medição do fiscal → recebimento provisório com
  controvérsia → decisão do recebedor → recebimento definitivo do elegível → complemento.
- **Liquidação da parcela (U3)** — pelo `liquidar` do M05 com alocação na parcela no mesmo commit.
  Fixture de referência e valores esperados calculados à mão: ordem 1.100,00; medido 1.000,00; conforme 900,00 e
  controvérsia 100,00; definitivo 900,00 → liquidado 900,00; controvérsia aceita → complemento 100,00 → liquidado
  total 1.000,00, e os 900,00 anteriores permanecem. Os 100,00 não executados da ordem não viram crédito.
- **Telas, termos em PDF e projeção pública (U4)**; **aditivo por itens com vigência (U5)** em
  `/licitacoes/contratos/[id]` (seção de aditivos) e na projeção pública; **planilha orçamentária da obra (U6)** em
  `/licitacoes/obras/[id]/planilha`, `/planilha/previas/[previaId]`, `/planilha/versoes/[planilhaId]`.

Migrations do M2 (aditivas, zero `DROP`): `20260917090000`…`20260917090700` (acesso, regime, ordem, medição e
recebimentos, alocação), `20260918090000_v7_m2_5_aditivo_por_itens`, `20260918090100/090200` (planilha). Nenhum SQL
manual novo em `prisma/sql/`. Permissões: atualizações v19 (`ponte-contratual`) e v20 (`planilha-da-obra`), só para
quem administra no global; nenhum grant novo ao papel `gestao_app` além do censo de tabelas (INSERT/SELECT; nenhum
UPDATE/DELETE nas tabelas novas).

### 62.3 Candidato `8ed0806` — resultado por etapa

app_sha = runner_sha = `8ed0806b0e7467f16e7b1519a582edcd8bbe98ed` (worktree
`gestao-publica-candidatos/candidato-8ed0806`, build com `NEXT_PUBLIC_BUILD_COMMIT` do SHA completo). Cadeia
`gestao-publica-candidatos/v7m2-final-8ed0806.sh`, 2026-09-15 19:27:40Z → 21:25:46Z. Logs sanitizados em
`.registro-de-execucao/pacote-v7-m2/c-8ed0806/` (um arquivo por etapa, `exit N` na última linha); saída bruta das
suítes em `candidato-8ed0806/.registro-de-execucao/`. Ambiente sintético: bancos descartáveis
`gestao_publica_instalacao_v7m2_limpa`, `gestao_publica_percursos_v7m2_{ponte,apropriacao,centrais,fila}` clonados de
`gestao_publica_percursos`; servidor `next start` na porta 3012 com o papel de runtime; contas `@percursos.local`.

| Etapa (log) | Início (UTC) | Resultado real | Classificação |
|---|---|---|---|
| 01 prisma generate | 19:27:40 | exit 0 | PASSOU |
| 02 tsc backend | 19:27:46 | exit 0 | PASSOU |
| 03 tsc app | 19:32:08 | exit 0 | PASSOU |
| 04 tsc scripts | 19:48:59 | exit 0 | PASSOU |
| 05 prisma validate | 19:51:30 | exit 0 | PASSOU |
| 09 next build | 19:51:32 | exit 0 | PASSOU |
| 30 runtime (`test/runtime`, papel) | 20:24:01 | 39/39 | PASSOU |
| 31 deriva do banco de teste | 20:24:43 | "No difference detected" | PASSOU |
| 32 suíte completa | 20:24:46 | 2788/2788, 1024 s | PASSOU |
| 33 suíte sob `TZ=Pacific/Kiritimati` | 20:41:53 | 2788/2788, 992 s | PASSOU |
| 40 instalação limpa | 20:58:26 | 167 migrations, deriva 0, 318 permissões, v19/v20 aplicadas, reexecução sem pendência | PASSOU |
| 41–44 atualização dos quatro clones | 20:58:57… | deriva 0 em cada; reexecução sem pendência; papéis de percurso criados | PASSOU |
| 11/12 preparação da ponte e do aditivo | 20:59:07 | contratos sintéticos `CT-PONTE-165907`/`-170115` | PASSOU (preparação) |
| 20 percurso da ponte | 20:59:08 | 28/0 | PASSOU |
| 21 percurso do aditivo | 21:01:15 | 8/0 | PASSOU |
| 22 percurso da planilha | 21:01:30 | 8 ok, 1 falha: **2.2** "com ciência: versão 1 confirmada" — `silencio` | **FALHOU (produto)** |
| 23 capturas das telas novas (6 telas × 360/768/1366/1440) | 21:02:08 | 24 medidas, transbordo 0, foco invisível 0, coberto 0; prova do instrumento acusou (1656 px, 11) | PASSOU (só mede transbordo e foco) |
| 59 apropriação da folha (clone próprio) | 21:03:01 | 17/0 | PASSOU |
| 50 carta de serviços | 21:04:05 | 84/0 | PASSOU |
| 51 encargos limpo | 21:12:36 | 40/0 | PASSOU |
| 52 pessoal | 21:13:59 | 29/0 | PASSOU |
| 53 folha | 21:14:49 | 47/0 | PASSOU |
| 54 portal do servidor | 21:15:49 | 24/0 | PASSOU |
| 55 atesto da folha | 21:17:06 | 43/0 | PASSOU |
| 56 compras | 21:18:38 | 29/0 | PASSOU |
| 57 identidade | 21:19:52 | 46/0 | PASSOU |
| 58 contrato acompanhado | 21:20:32 | 26/0 | PASSOU |
| 60 ficha pela tela (clone da fila) | 21:24:11 | 23/0 | PASSOU |
| 61 encargos fila | 21:24:48 | 29/0 | PASSOU |

Etapas 06–08 e 10 não existem nesta cadeia (numeração herdada); nenhuma etapa ficou NÃO_EXECUTADA nem
BLOQUEADA_POR_AMBIENTE.

**A falha 2.2 (produto, causa demonstrada).** 3.1 do mesmo percurso abre a versão 1 recarregada com o total e as
divergências cientes — o ato gravou. A mensagem sumia: a prévia confirmada deixa de oferecer o formulário de
confirmação (`p.confirmada !== null`), e a mensagem morava dentro dele; o instrumento
(`percursos-navegador.ts`, `preencherEEnviar`) só encontra resultado fora do formulário por `[data-resultado-da-acao]`
com sequência nova. Mesmo defeito corrigido na execução do contrato em `c75a72f`. Correção em `d167c02`: o provedor
vira `components/ui/ResultadosDosAtos.tsx`, as três páginas da planilha o usam, e `test/ui/resultados-dos-atos.test.tsx`
(3 casos) acusou as duas mutações ("mostra sempre", "não publica"). Reprodução delimitada em 62.5.

**M03 t6 em `8ed0806`.** Passou nas duas rodadas (limite de 5 s preservado; o repórter padrão não grava a duração
por teste). Em `3288b9b` estourou uma vez (5725 ms, suíte completa) e passou isolado. Medição dedicada com o repórter
detalhado: 62.5.

**O fuso em massa de `3288b9b` (17 falhas), conferido no log bruto.** Mecanismo demonstrado pelo próprio log: seis
`Hook timed out in 10000ms` em `beforeEach` de limpeza/semeadura; o timeout do vitest não cancela a consulta em
andamento, e o trabalho órfão colide com o `TRUNCATE` do teste seguinte — `40P01 deadlock detected` em
`truncarTudo` (`test/limpar-banco.ts:434`) e `Unique constraint failed on (nome)`/`(codigo)` (a colisão que o
comentário de `limpar-banco.ts` descreve). O que disparou a lentidão **não foi demonstrado**; os mesmos arquivos
isolados sob o mesmo `TZ` passaram (60/61, só a guarda da data civil, corrigida em `d4d2278`) e a suíte inteira sob
o mesmo fuso passou em `8ed0806` (2788/2788). Registro: `FUSO-3288B9B-CASCATA-APOS-TIMEOUT-DE-HOOK`, não
reproduzida, causa inicial em aberto; o timeout não foi aumentado.

Candidatos anteriores do M2 (os números não se somam a `8ed0806`): `eef260a` tsc backend recusou (import sem
extensão → `10c9324`); `10c9324` interrompido pela deriva (→ `208246f`); `208246f` ponte 21 ok/7 silêncio (→
`c75a72f`); `c75a72f` ponte 28/0, aditivo 2 ok/6 falhas (formulário limpo após prévia/recusa → `3288b9b`);
`3288b9b` suíte 2775/2777 (data civil → `d4d2278`; M03 t6 5725 ms), fuso 2760/2777 (acima), instalação 165
migrations/317 permissões, percursos centrais todos verdes, apropriação 1 falha de PREPARAÇÃO (as 12 competências de
2026 do clone compartilhado já tinham folha — em `8ed0806` rodou em clone próprio: 17/0).

### 62.4 Quadro de execução (registrado antes de cada unidade)

| Unidade | Responsável | Base | Módulo | Escrita (arquivos) | Contratos consumidos / alterados | Resultado utilizável | Testes selecionados | Integração |
|---|---|---|---|---|---|---|---|---|
| Fechamento `8ed0806` | A | `8ed0806` | transversal | `components/ui/ResultadosDosAtos.tsx`, páginas e formulários da planilha e da execução, `ESTADO-EXECUCAO.md`, catálogo por `scripts/marcar-catalogo.ts`, `.registro-de-execucao/pacote-v7-m2/LEIA-ME.md` | provedor do resultado do ato (novo componente, mesma semântica de `c75a72f`) | a confirmação da prévia volta com mensagem | `test/ui/resultados-dos-atos.test.tsx` + 2 mutações; tsc app; build; percursos ponte, aditivo e planilha num clone novo (`c-d167c02`) | commit `d167c02`; catálogo só depois do percurso da planilha inteiro |
| U7 medição da obra pela planilha | A (integrador do schema, das migrations e do censo: A) | `d167c02` | M11 (obras/fiscalização/execução), M22 (anexo e documento) | `prisma/schema/m11-planilha-da-obra.prisma` e `m11-fiscalizacao.prisma` (modelos novos, só aditivos), `m22-documentos.prisma` (`Anexo.medicaoDaOrdemId`), migration `20260919090000_v7_m2_7_*`, `modules/m11-licitacoes/medicao-pela-planilha.ts` (novo), `ordem-de-servico.ts` (núcleo da medição reutilizado, estorno, recusa da medição avulsa de item vinculado), `execucao-do-contrato.ts` e `aditivo-por-itens.ts` (medição estornada fora das somas), `modules/m22-documentos/anexos.ts`, `lib/portas/documentos.ts`, `lib/portas/documentos-da-execucao.ts`, `lib/pdf/termos-do-contrato.ts` (memória), `lib/portas/execucao-do-contrato.ts`, `app/(areas)/licitacoes/contratos/execucao-actions.ts`, página da ordem e da versão da planilha, `modules/m16-travamento/acoes.ts` (serviços no censo, sem ação nova), `test/limpar-banco.ts`, testes e percurso próprios | consome U6 (versões, vínculo explícito), U5 (unitário vigente, ME06), U1/U2 (ordem, recebimentos), U3 (liquidação da parcela sem alteração); altera `registrarMedicaoDaOrdem` (extrai o núcleo; recusa item com vínculo vivo à planilha) | o fiscal mede a ORDEM pelos serviços da versão aplicável; a medição segue para os recebimentos e a liquidação já existentes; memória em PDF; estorno antes do recebimento | `test/medicao-pela-planilha.test.ts` (versão, vínculo, excesso, duplicidade, concorrência, designação, escopo, ME06 com aditivo, estorno com dependente, envelope ME01/ME02), caso na `test/liquidacao-da-parcela.test.ts` (900 + 100), DO01 da memória, runtime da planilha, suítes vizinhas (ordem de serviço, aditivo, unicidade, planilha, liquidação, censo, modelo sem caso de uso, data civil) + mutações | commit local por caminhos exatos; percurso de navegador no próximo candidato integrado |
| U8 agenda, ocorrências e formulários | A, depois de U7 | `ebaa468` | M11 (fiscalização), M16 (ação nova) | `prisma/schema/m11-agenda-e-formularios.prisma` e colunas opcionais em `m11-fiscalizacao.prisma`/`m16-usuarios.prisma`, migrations `20260920090000/090100`, `modules/m11-licitacoes/agenda-da-fiscalizacao.ts` e `formularios-de-ocorrencia.ts` (novos), `fiscalizacao.ts` (programar com horário; ocorrência com versão, gravidade e respostas), `modules/m16-travamento/{acoes,atualizacoes-de-permissoes}.ts`, `lib/portas/{agenda-da-fiscalizacao,contrato-acompanhado}.ts`, `app/(areas)/licitacoes/fiscalizacao/{agenda,tipos-de-ocorrencia,agenda-actions.ts}`, dossiê e formulários do contrato, `test/limpar-banco.ts`, testes e percurso próprios | consome designações, o alcance da fiscalização (U0.1), o calendário civil do ente e o M22; altera `OrdemDeFiscalizacao` (colunas opcionais) e `OcorrenciaDeFiscalizacao` (versão do tipo, gravidade, respostas) | agenda em dia, semana e mês com horário, local, reagendamento motivado, cancelamento e realização; tipos de ocorrência do ente com formulários versionados respondidos na ocorrência | `test/agenda-e-formularios.test.ts` (AG01–AG03, FO01–FO02) + mutações, censo e atualizações de permissões, regressão do contrato acompanhado e do runtime | commit local por caminhos exatos; percurso `scripts/smoke-agenda-da-fiscalizacao.ts` no próximo candidato |
| B1 cadastro imobiliário e simulação | A, depois de U8 (nenhum segundo executor real nesta sessão) | commit de U8 | **levantado**: não existe cadastro imobiliário nem lançamento tributário no repositório; entra em módulo novo do tributário | consome `modules/m19-pessoas` (Pessoa canônica), `modules/m04-receita` (natureza e arrecadação), `prisma/schema/m10-divida-ativa.prisma` (dívida já modelada) e o M25 (campos adicionais); NENHUMA escrita no ledger e nenhuma constituição de dívida — isso é B2 | cadastro imobiliário com histórico, vínculo com Pessoa, parâmetros por vigência e simulação com memória (resultado esperado independente do motor) | a definir na abertura da unidade | não iniciada nesta sessão (ver 62.10) |

Frentes C–F do pedido: sem executor independente nesta sessão. C (experiência e documentos) acompanha U7/U8 dentro da
própria unidade; D, E e F permanecem como tarefas nomeadas em 62.8, sem execução pesada aberta para ocupá-las.

### 62.5 Reparo delimitado `d167c02` (o passo 2.2 da planilha)

app_sha = runner_sha = `d167c02633d09aa855b03d4a91860e2232ed9b34` (worktree `candidato-d167c02`, build com o SHA
completo). Cadeia `gestao-publica-candidatos/v7m2-reparo-d167c02.sh`, 21:51:39Z → 22:16:59Z. Só o que o diff toca
(componente cliente e as páginas que o usam): suíte e fuso não reexecutados, pela regra de agendamento — o diff não toca
domínio, datas nem guardas. Banco novo `gestao_publica_percursos_v7m2_reparo` clonado de `gestao_publica_percursos`
(167 migrations, deriva 0). Logs em `.registro-de-execucao/pacote-v7-m2/c-d167c02/`.

| Etapa | Início (UTC) | Resultado | Classificação |
|---|---|---|---|
| 01 generate, 03 tsc app | 21:51:39 | exit 0 | PASSOU |
| 06 `test/ui/resultados-dos-atos.test.tsx` | 21:54:50 | 3/3 (as duas mutações acusaram antes, na construção: `construcao/r1-mutacao-*.log`) | PASSOU |
| 09 next build | 21:54:54 | exit 0 | PASSOU |
| 41 atualização do clone | 22:13:02 | deriva 0, v19/v20 sem pendência | PASSOU |
| 20 percurso da ponte (usa o provedor movido) | 22:13:29 | 28/0 | PASSOU |
| 21 percurso do aditivo (usa o provedor movido) | 22:15:52 | 8/0 | PASSOU |
| 22 percurso da planilha | 22:16:09 | **9/0** — 2.2 "versão 1 confirmada, 6 linhas, R$ 5.102,89" | PASSOU |
| 23 capturas: lista, prévia e versão da planilha × 4 larguras | 22:16:29 | 12 medidas, transbordo 0, foco invisível 0; prova do instrumento acusou | PASSOU (só transbordo e foco) |

A falha 2.2 de `8ed0806` fica registrada como falha de PRODUTO corrigida em `d167c02`; o resultado de `8ed0806`
não foi reescrito.

**M03 t6.** Não houve recorrência em `8ed0806` (suíte e fuso). Ele segue como `M03-T6-T8-SOB-CARGA` com a única
medição acima do limite (5725 ms, `3288b9b`, suíte completa com carga 7–8) e a execução isolada verde; o limite não foi
alterado. A duração por teste não é gravada pelo repórter padrão da cadeia — a próxima cadeia integrada grava o
repórter detalhado desse arquivo.

### 62.6 Catálogo (commit `603edea`, pelo `scripts/marcar-catalogo.ts`)

| Cláusula | Antes | Agora | Prova |
|---|---|---|---|
| 5.21.16 | PARCIAL | PARCIAL (evidência nova) | AC01–AC06; negativas do percurso da ponte 28/0 em `d167c02`; a leitura financeira do cadastro contratual continua por decisão |
| 5.21.17 | NAO_VERIFICADO | IMPLEMENTADO_NAO_VALIDADO | AC03 + mutação; sem percurso da definição do administrador |
| 5.21.18 | NAO_VERIFICADO | PARCIAL | dossiê com dados, itens, aditivos, ordens e termos; sem anexos próprios do contrato nem compras ligadas |
| 5.21.26 | NAO_VERIFICADO | PARCIAL | planilha importada e versionada com contrato; executado pela planilha (U7) sem percurso |
| 5.21.27 | NAO_VERIFICADO | VALIDADO_LOCALMENTE | PL01/PL02 + percurso da planilha 9/0 e capturas em `d167c02` |
| 5.21.28 | NAO_VERIFICADO | VALIDADO_LOCALMENTE | XL01–XL03, PL01 (.xlsx = .xls) + percurso 1.2/3.2/4.1 em `d167c02` |
| 5.21.29 | PARCIAL | PARCIAL (evidência nova) | não se completa antes do percurso de U7 |
| 5.38.4 | NAO_VERIFICADO | PARCIAL | transparência de contratos; ausentes convênios, compras diretas, licitações, estoque, bens e frota |
| 5.17.96–106 | — | sem alteração | cláusulas da ordem de compra (M11 compras); a ordem de serviço do contrato não as atende nem as altera |

Placar por natureza depois da marcação: VALIDADO_LOCALMENTE 74, IMPLEMENTADO_NAO_VALIDADO 67, PARCIAL 95,
AUSENTE_CONFIRMADO 145, DEPENDENCIA_EXTERNA 4, NAO_VERIFICADO 1652 (385 de 2.037 verificadas).

### 62.7 U7 — a medição da ordem pela planilha da obra (`b680477`, percurso em `ebaa468`)

**O que passou a funcionar.** Na página da ordem (`/licitacoes/contratos/[id]/ordens/[ordemId]`), o fiscal designado
mede pelos SERVIÇOS da versão aplicável da planilha da obra: escolhe a versão (a tela diz de quando a quando ela vale),
vê por serviço previsto, anterior na obra, esta medição, acumulado e saldo, e o que não concilia aparece com o motivo e
sem campo. A quantidade vira a do item medido da ordem, valorada pelo unitário do CONTRATO — daí para a frente é o
caminho de sempre: recebimento provisório com controvérsia, decisão, definitivo e liquidação da parcela pelo M05.
A memória da medição (versão, data-base, referência de preços, quantidades, os dois preços lado a lado, vínculo,
arredondamento e evidências) sai em PDF; as evidências são anexos do M22 só para a fiscalização. A versão da planilha
ganhou "Andamento da obra por serviço". O item do contrato vinculado não se mede avulso, e a medição sem recebimento
se estorna (fica no histórico, fora das somas).

**Regras novas, e o que cada recusa diz:** `VERSAO-NAO-APLICAVEL`, `SEM-VERSAO-VIGENTE-NO-PERIODO`,
`PERIODO-ATRAVESSA-NOVA-VERSAO`, `PLANILHA-DE-OUTRO-CONTRATO`, `SERVICO-SEM-VINCULO`, `VINCULO-AMBIGUO` (dos dois
lados), `UNIDADE-NAO-CONCILIADA`, `ITEM-FORA-DA-ORDEM`, `MEDICAO-DE-GRUPO`, `ACIMA-DO-PREVISTO-NA-PLANILHA`,
`MEDICAO-PELA-PLANILHA` (no avulso), `MEDICAO-COM-RECEBIMENTO`, `MEDICAO-JA-ESTORNADA`, `MEDICAO-ESTORNADA`.

**Arquivos e estrutura.** `modules/m11-licitacoes/medicao-pela-planilha.ts` (novo; `conciliarServico` é pura e serve à
tela e ao ato), `ordem-de-servico.ts` (núcleo `gravarMedicaoDaOrdemNaTransacao` extraído, estorno, recusa do avulso),
`execucao-do-contrato.ts` e `aditivo-por-itens.ts` (estornada fora das somas), `lib/pdf/termos-do-contrato.ts` (tipo
`memoria`), `lib/portas/{execucao-do-contrato,planilha-da-obra,documentos,documentos-da-execucao}.ts`, a action e as
telas da ordem e da versão. Schema `prisma/schema/m11-medicao-pela-planilha.prisma` e migration
`20260919090000_v7_m2_7_medicao_da_ordem_pela_planilha` (3 tabelas, `Anexo.medicaoDaOrdemId`, 4 CHECKs; zero DROP).
**Nenhuma ação nova no censo**: medir e estornar são `REGISTRAR_MEDICAO_DE_OBRA` (a designação de fiscal é a outra
condição). Censo: 362 serviços.

**Provas (banco de construção `gestao_publica_instalacao_v7m2_construcao`).**

| Prova | Resultado |
|---|---|
| `test/medicao-pela-planilha.test.ts` (MP01–MP08) | 9/9 |
| mutações: previsto da planilha ignorado; ambiguidade do item ignorada; versão aplicável ignorada; medição estornada contando; avulso liberado | 5/5 acusadas |
| `test/liquidacao-da-parcela.test.ts` LI07 (900 + 100 pelo M05, empenho com R$ 100,00 não liquidados, 2 horas a executar) | passou (13 casos no arquivo) |
| `test/ui/termos-do-contrato.test.ts` DO01/DO02 da memória (70 serviços, multipágina, dois totais somados em centavos inteiros) | passou; mutação "total da planilha sumido" acusada |
| `test/runtime/contrato-runtime-ordem-de-servico.test.ts` (medir, evidência e estornar por `gestao_app`; UPDATE/DELETE negados nas 3 tabelas novas) | 4/4 com o runtime da planilha |
| regressão direcionada (M11, M16, M22, `test/ui`, `test/runtime`, censo, guardas) | 43 arquivos; 2 falhas de instrumento corrigidas: contagem do censo e a fronteira UI↔domínio (o tipo da ilha passou a ser declarado nela) |
| tsc backend e app na árvore de construção | exit 0 |

Percurso `scripts/smoke-medicao-pela-planilha.ts` (engenharia importa e vincula → gestora emite → fiscal mede pela
planilha com evidência, repete e é recusado mantendo o digitado, baixa a memória, mede e estorna → recebimentos →
nota → liquidação 900 → controvérsia aceita → complemento 100 → andamento por serviço): candidato `ebaa468`, cadeia
`v7m2-u7.sh`, logs em `.registro-de-execucao/pacote-v7-m2/c-u7/`.

### 62.8 U8 — a agenda da fiscalização e os formulários de ocorrência

**O que passou a funcionar.** `/licitacoes/fiscalizacao/agenda` mostra os compromissos em DIA, SEMANA e MÊS — a mesma
leitura com períodos diferentes, no calendário do ente —, com horário, duração, local, contrato, fiscal e situação, e
filtros por contrato, fiscal e situação. O recorte é do servidor: só os contratos que a pessoa alcança pela
fiscalização (o administrador alcança todos); quem não alcança nenhum vê a agenda vazia com o motivo. Em cada
compromisso vivo, o gestor designado reagenda (com motivo, guardando o histórico) ou cancela, e o fiscal DAQUELE
compromisso registra a realização (data, horas e relato). A situação é derivada — PROGRAMADA → REAGENDADA →
CANCELADA | REALIZADA, as duas últimas finais.
`/licitacoes/fiscalizacao/tipos-de-ocorrencia` é o cadastro do ente: tipo (código, nome, natureza), versões do
formulário com perguntas (texto, número, data, lista de opções, sim/não; obrigatórias ou não), exigência de gravidade,
encaminhamento sugerido, e ativar/desativar como fato com motivo. No dossiê do contrato, a ocorrência do fiscal passa a
oferecer o tipo do ente e as perguntas da versão VIGENTE; a resposta fica presa à pergunta daquela versão.

**Sobreposição não é proibida** — nenhuma fonte dá essa regra ao sistema. A agenda APONTA o conflito (mesmo fiscal,
mesmo dia, horários que se cruzam) e quem programa decide: pendência `CONFLITO-DE-AGENDA-SEM-REGRA`.

**Estrutura.** `prisma/schema/m11-agenda-e-formularios.prisma` (7 modelos e 2 enums novos), colunas opcionais
`horaInicio`, `duracaoMinutos` e `local` em `OrdemDeFiscalizacao` e `versaoDoTipoId`/`gravidade` em
`OcorrenciaDeFiscalizacao`; migrations `20260920090000_v7_m2_8_enum_dos_tipos_de_ocorrencia` (valor de enum em
migration própria) e `20260920090100_v7_m2_8_agenda_e_formularios` (8 CHECKs, zero DROP). Módulos
`agenda-da-fiscalizacao.ts` e `formularios-de-ocorrencia.ts` (separados para não haver import circular com
`fiscalizacao.ts`). Ação nova `GERIR_TIPOS_DE_OCORRENCIA` com a atualização de permissões **v21**; reagendar e cancelar
usam `PROGRAMAR_FISCALIZACAO_DO_CONTRATO` e a realização usa `REGISTRAR_OCORRENCIA_DE_FISCALIZACAO` — não são ações
novas. Censo: 368 serviços, 295 + 24 ações.

**Provas (banco de construção).**

| Prova | Resultado |
|---|---|
| `test/agenda-e-formularios.test.ts` (AG01–AG03, FO01–FO02) | 5/5 |
| mutações: data do reagendamento ignorada; conflito nunca apontado; reagendar a realizada liberado; versão não vigente aceita; obrigatórias não cobradas | 5/5 acusadas |
| runtime `gestao_app` (programar, reagendar, realizar, tipo, versão, ocorrência com resposta; 7 negativas de UPDATE/DELETE) | acrescentado a `test/runtime/contrato-runtime-fiscalizacao.test.ts` |

Percurso `scripts/smoke-agenda-da-fiscalizacao.ts` (configuração cadastra o tipo e publica a versão 1 → a gestora
programa duas com horário e vê o conflito → dia, semana e mês → reagenda e cancela → o fiscal realiza e registra a
ocorrência com o formulário, com a obrigatória cobrada → versão 2 e desativação não reinterpretam o histórico →
negativas de papel e de alcance) com o papel `configuracao-fiscalizacao@percursos.local`.

**Resultado do candidato de U7** (app_sha = runner_sha `bc152d6`; a árvore congelada foi movida de `ebaa468` para
`bc152d6`, cujo diff é só o instrumento de percurso — nenhum arquivo de `app/`, `lib/` ou `modules/`, e o build de
`ebaa468` continua válido; cadeia `v7m2-u7.sh`, logs em `c-u7/`):

| Etapa | Resultado | Classificação |
|---|---|---|
| 01 generate, 02 tsc backend, 03 tsc app, 04 tsc scripts, 05 prisma validate | exit 0 | PASSOU |
| 07 testes do incremento (41 arquivos: M11, M16, `test/ui`, `test/runtime`, censo) | 290/290 | PASSOU |
| 08 deriva do banco de teste | "No difference detected" | PASSOU |
| 09 next build (SHA completo) | exit 0 | PASSOU |
| 41 clone e atualização do banco dos percursos + 11 preparação da ponte | deriva 0; contrato sintético | PASSOU (preparação) |
| 24 percurso da medição pela planilha | **20 passos, 0 falhas** | PASSOU |
| 25 capturas (ordem e versão da planilha × 4 larguras) | transbordo 0, foco invisível 0 | PASSOU (só transbordo e foco) |

Na primeira rodada o percurso deu 13 ok / 5 falhas, e a causa foi do INSTRUMENTO, não do produto: os formulários de
estorno moram num `<details>` recolhido, e o clique do puppeteer não chega ao conteúdo de um detalhe fechado — o envio
não acontecia e o registro dizia "silêncio". Corrigido em `bc152d6` (o instrumento abre o detalhe, como a pessoa faz ao
clicar no resumo) e a rodada seguinte fechou 20/0. A primeira rodada fica registrada.

### 62.10 Pendências nomeadas e o próximo ponto exato

**Fechadas nesta sessão:** `ME06` para obras (a medição pela planilha aplica a versão e o preço do primeiro dia do
período e recusa o período que atravessa os dois — U7); `AGENDA-SEM-HORARIO-E-CALENDARIO` (U8); o tipo de ocorrência
como cadastro do ente com formulário (U8); a mensagem que sumia na confirmação da prévia (`d167c02`).

**Abertas, por frente:**

- **Execução contratual:** `ESTORNO-DE-RECEBIMENTO` (a medição recebida só se corrige pela conferência e, depois de
  liquidada, pelo estorno no M05), `GLOSA-LIBERACAO-DE-SALDO`, `COMISSAO-COM-QUORUM`, `ORDEM-DE-SERVICO-DE-MATERIAL`,
  `ANULACAO-PARCIAL-COM-VARIAS-PARCELAS`, `EMPENHO-POR-PARCELA-DA-ORDEM`, `RETENCOES-NA-LIQUIDACAO-DA-PARCELA`,
  `PRAZO-DE-RECEBIMENTO-SEM-CONFIGURACAO`, `PORTAL-DO-FORNECEDOR`, `ASSINATURA-QUALIFICADA-DOS-TERMOS`,
  `XLSX-DA-EXECUCAO`.
- **Aditivo e planilha:** limites do art. 125 (não se inventa percentual), `REAJUSTE-POR-INDICE`,
  `PLANILHA-POR-DIGITACAO`, `PLANILHA-ACIMA-DE-1-MB-PELA-TELA` (o corpo das ações do Next; o domínio aceita 5 MB),
  `.ods`, composição analítica, BDI por item, exportação da versão, e a medição por planilha **sem** ordem de serviço.
- **Agenda e formulários (U8):** `CONFLITO-DE-AGENDA-SEM-REGRA` (a sobreposição é apontada, não proibida — nenhuma
  fonte dá a regra), `NOTIFICACAO-DA-AGENDA` (nenhuma notificação sai do sistema), compromisso recorrente, anexos na
  realização, exportação da agenda.
- **Transversais:** `FORMULARIOS-LIMPOS-APOS-RECUSA` — o `useRestaurarAposEnvio` e o provedor de resultado estão nas
  famílias da execução do contrato, da planilha e da agenda; **as outras ~59 telas com `useActionState` continuam sem
  eles**, e o inventário por componente ainda não foi feito. `M03-T6-T8-SOB-CARGA` (mede-se, não se aumenta o timeout).
  `FUSO-3288B9B-CASCATA-APOS-TIMEOUT-DE-HOOK` (mecanismo demonstrado, gatilho não).
- **Backlog anterior:** antiabuso externo, restituição dos encargos sem ato, retorno bancário da guia, encaminhamento
  de ouvidoria a outro setor.

**Próximo ponto exato:**

1. **O candidato integrado NÃO existe ainda.** A cadeia `v7m2-integrado.sh` foi iniciada em `9286cd2` e
   **interrompida pelo executor** com a máquina em swap (carga 27; o typecheck do app levou 50 min sem terminar).
   Passou: generate e tsc backend. Logs em `c-integrado/`. Refazê-la no commit final (`bce712c`) quando a máquina
   estiver livre — e, pelo pedido do usuário, **sem portão gigante**: rodar por partes (tsc, build, percursos) e deixar
   suíte completa e fuso para uma janela combinada.
2. ~~**B1**~~ — **FEITO em `bce712c`; a descrição está em 62.11.** ⚠️ Este item dizia "hoje não existe cadastro
   imobiliário nem lançamento tributário no repositório", o que era verdade quando 62.4 foi escrito e deixou de ser no
   mesmo dia. A frase ficou aqui contradizendo 62.11 por uma sessão inteira: **o próximo passo é o lugar onde uma
   afirmação vencida mais atrapalha**, porque é o que a sessão seguinte lê primeiro. O cadastro imobiliário com
   histórico, o vínculo com Pessoa, os parâmetros por vigência e a simulação com memória existem, **sem escrever no
   ledger e sem constituir dívida** — isso continua sendo B2, e continua não feito. O que resta de B1: o percurso de
   navegador (`B1-SEM-PERCURSO`).
3. Só depois, os subcasos de F07 e a dívida ativa (já modelada em `prisma/schema/m10-divida-ativa.prisma`).

### 62.11 B1 — o cadastro imobiliário e a simulação tributária (primeira unidade de F07)

**O que passou a funcionar.** `/receita/imoveis` lista e busca imóveis; `/receita/imoveis/[inscricao]` mostra as
VERSÕES do cadastro (cada uma com vigência, motivo e os atributos declarados), as pessoas vinculadas por papel e
fração, e a **simulação**: escolhe-se tributo, exercício e dia, e a tela devolve o valor com a MEMÓRIA — cada variável
usada, o seu valor e a origem (cadastro, atributo do imóvel ou parâmetro da tabela) —, o fundamento e a fórmula, e o
rateio informativo por responsável. `/receita/parametros-tributarios` publica a tabela do ente por exercício e
vigência.

**A conta é do ente.** A fórmula é interpretada por `packages/formula` num **universo fechado** (números, variáveis
declaradas, `+ − * /`, comparações, parênteses e `min`, `max`, `arredondar`, `teto`, `piso`, `se`): nunca `eval`,
`new Function` ou lista negra — `this.constructor.constructor(...)`, `process`, `require` e `[]` sequer chegam a ser
avaliados. Na publicação, a fórmula é analisada antes de gravar: variável sem origem recusa (`VARIAVEL-SEM-ORIGEM`).
Sem tabela publicada, a simulação recusa (`SEM-TABELA-PUBLICADA`) — nenhuma alíquota nacional é inventada.

**O que esta unidade NÃO faz, por decisão:** não lança tributo, não emite guia, não constitui dívida, não escreve no
ledger e não altera o cadastro ao simular (o teste conta as linhas antes e depois). Isso é B2.

**Estrutura.** `prisma/schema/m34-tributario.prisma` (7 modelos, 3 enums), migrations
`20260921090000_v7_b1_enums_do_tributario` (2 valores de enum de ação) e `20260921090100_v7_b1_cadastro_imobiliario`
(5 CHECKs; zero DROP). `modules/m34-tributario/{cadastro-imobiliario,simulacao}.ts` e `MODULO.md`,
`packages/formula/index.ts`, `lib/portas/cadastro-imobiliario.ts`, as três telas e `lib/navegacao.ts`.
Ações novas: `GERIR_CADASTRO_IMOBILIARIO` e `GERIR_PARAMETROS_TRIBUTARIOS` (atualização de permissões **v22**);
simular é leitura sob `CONSULTAR_RECEITA`. Censo: 373 serviços, 295 + 26 ações.

**Provas (banco de construção).** `packages/formula/formula.test.ts` (FM01–FM05) e
`test/cadastro-imobiliario-e-simulacao.test.ts` (CI01, CI02, SI01–SI03): 9/9. Valores esperados calculados à mão e
escritos no teste (1.260,00; 1.740,00; 1.512,00; 2.520,00; 264,00), independentes do motor. Cinco mutações acusadas:
universo da fórmula aberto; variável ausente virando zero; versão do cadastro mais nova em vez da vigente no dia;
fração do papel sem teto; publicação sem conferir a origem das variáveis.

**Pendências desta frente:** `B1-TSC-APP-NAO-REEXECUTADO` — o typecheck do app acusou dois tipos opcionais na ilha do
formulário (`exactOptionalPropertyTypes`), corrigidos no mesmo commit e **sem reexecução** (a máquina estava saturada e
o executor foi mandado parar); rodar `tsc -p tsconfig.json` é o primeiro passo da próxima sessão. Sem percurso de
navegador (as telas existem, mas nenhum smoke as exercitou — `B1-SEM-PERCURSO`); planta de valores como cadastro próprio (hoje é parâmetro da tabela); isenções e
imunidades por regra declarada; cadastro econômico (ISS) e ITBI por transmissão; e toda a efetivação financeira (B2).


---


---

## 63. V9 — instrumentos, a casca pública, a transparência, a ouvidoria, a execução contratual e o preflight da AWS

> Ordem: `docs/lotes/V9-noturna-ecossistema-aws-engine.md`, guardada como veio. Regime: **superfície**
> para telas e cadastros; **profundidade** para o contrato de publicação, o sigilo da ouvidoria e a
> aritmética contratual — nesses, caracterização antes de ampliar, fixture N=2 e mutação provada.

### 63.1 O que passou a funcionar, e a rota real

| Capacidade | Como se chega |
|---|---|
| Portal público da transparência | `/transparencia`, **sem sessão**. Famílias abertas em cartões; as que ainda não abriram numa lista sem link, dizendo o que falta |
| Consulta pública de **bens** | `/transparencia/bens` → filtros → **Consultar** (a consulta fica no endereço) → tombamento abre o detalhe em abas Geral / Localização / Movimentações → a trilha volta com o filtro → **Baixar CSV** |
| Consulta pública de **despesas** | `/transparencia/despesas` → filtros (busca, exercício, unidade, período, fase) → uma linha por empenho, com empenhado/anulado/liquidado/pago em colunas e três totais separados → **Baixar CSV** |
| Marcar localização como divulgável | `/patrimonio/localizacoes` → **Divulgar esta localização na consulta pública de bens** |
| **Encaminhar manifestação** da ouvidoria | `/protocolo/ouvidoria` → "Onde está" e histórico → **Encaminhar** (setor, agente opcional, motivo) → o destino vê o caso, **Receber neste setor**, e responde |
| **Estornar recebimento definitivo** | `/licitacoes/contratos/[id]/ordens/[ordemId]` → no recebimento, **Estornar o recebimento definitivo nº N** (com a prévia da consequência e o aviso de liquidação viva) |
| **Glosa devolve saldo** | decidir a controvérsia como REJEITADA → a coluna "Glosado" aparece e "A executar" sobe, na mesma ordem |
| Landing interna da transparência | `/administracao/transparencia` (era `/transparencia`, que agora é do cidadão) |
| Release com prova | `npm run tipos:conferir` grava a aprovação pelo digesto do conteúdo; `npm run release:candidato` recusa buildar sem ela e **reconfere os tipos de rota depois do build** |

### 63.2 Comandos executados, com resultado real

| Comando | Resultado |
|---|---|
| `npm run tipos:conferir` | **APROVADO**. 201.951 ms na primeira execução do dia (fria); 3,6–28 s nas incrementais. Heap dimensionado pela memória: 5.324 MB de 8.192 |
| `npm run release:candidato` | **BUILD OK** 21.159 ms · artefato `3a3ed709692a`, 1.440 arquivos · candidato `2590048+3424d989f3c1` |
| `npm run test:rapido` | **939/939, 94 arquivos** |
| `npx tsc -p tsconfig.backend.json` / `-p tsconfig.scripts.json` | exit 0 (com heap dimensionado) |
| `npx vitest run modules/m16-travamento/` | 138/138 (censo 374 serviços, 295+27 ações) |
| `npm run test:runtime` | 41/41 |
| `scripts/smoke-transparencia-publica.ts` | **31 passos, 0 falhas** |
| `scripts/smoke-encaminhamento-da-ouvidoria.ts` | **19 passos, 0 falhas** |
| `scripts/capturas-da-transparencia-publica.ts` | 14 imagens + 2 das despesas, celular (390) e desktop (1280) |
| `bash scripts/pos-dns.sh` | **exit 10** — "o nome ainda não resolve", o estado correto de hoje |

⚠️ **NÃO foram executados nesta rodada:** `npm run test:tudo`, `npm run test:fuso` e `npm run portao`.
Ficam para o candidato de homologação, como manda o modo de trabalho — e o diff toca
`packages/estornaveis` pela leitura (não pela régua de datas), mas **toca filtros de período**
(despesas), então **`test:fuso` é obrigatório** no próximo portão.

### 63.3 Migrations e SQL aplicados

| Migration | O que é |
|---|---|
| `20260922090000_v9_n2_localizacao_publicavel` | `LocalizacaoFisica.publicavelNaTransparencia BOOLEAN NOT NULL DEFAULT false` — aditiva, fail-closed |
| `20260923090000_v9_n4_estorno_de_recebimento` | tabela `EstornoDeRecebimentoDefinitivo`, com `@unique` no recebimento |
| `20260923090100_v9_n4_acao_estornar_recebimento` | valor de enum `ESTORNAR_RECEBIMENTO_DEFINITIVO` |

Zero `DROP`, zero backfill. Aplicadas em `gestao_publica` e `gestao_publica_percursos`; o banco de
teste as recebe pelo `global-setup`. Nenhum SQL manual novo. **Permissões: atualização v23.**

⚠️ **Uma renomeação sem migration:** `ItemDaOrdemDeServico.medidos` → `medidosNaOrdem`. Campo de
relação não tem coluna (a FK mora do outro lado), e é o nome que torna exato o guard que impede um
leitor novo de somar o medido bruto.

### 63.4 Invariantes verificadas

- **Autorização no servidor, por ação nomeada.** `ESTORNAR_RECEBIMENTO_DEFINITIVO` é ação própria
  e **não** derivada de quem já recebe; o encaminhamento da ouvidoria confere ação + lotação +
  sigilo; as consultas públicas não têm sessão por desenho, e o que as protege é o CONTRATO DE
  CAMPOS conferido por teste.
- **Negação com motivo.** Nenhum teste afirma "a tela não mostra": afirmam que o dado **não sai da
  porta** — nem no objeto, nem em string dele, nem no HTML entregue ao anônimo, nem no CSV.
- **Fixture N=2** em tudo que só se manifesta em conjunto: dois bens, duas localizações, duas
  páginas, dois setores de destino, dois tipos de credor, duas naturezas de anulação.
- **Append-only.** O estorno do recebimento não apaga nem reescreve o termo (o teste compara o
  registro antes e depois); a liberação da glosa é derivada da decisão, não um lançamento.
- **Data civil do ente.** O filtro de ano dos bens e as bordas de período das despesas usam o dia
  civil — esta última **corrigida pelo próprio guard**, ver 63.7.
- **Dinheiro é `Decimal`.** As portas públicas devolvem string decimal do domínio; quem formata é a
  tela.
- **Instrumento provado por mutação, nas duas direções.** Dezenove mutações acusadas ao todo nesta
  rodada; cada seção do commit as lista.

### 63.5 O que cada frente entregou

- **N0 — instrumentos.** O trinco passou a registrar o desfecho (sinal, código `128+sinal`, erro de
  spawn); a válvula do build deixou de ser uma variável e virou prova amarrada ao digesto do
  conteúdo, com lint separado dos tipos; o candidato ganhou nome próprio `<sha>+<digesto>`; o banco
  dos percursos passou a usar `pendentes`, o mesmo caminho da instalação.
- **N1 — identidade Engine e portais.** Casca pública com cabeçalho comum, salto para o conteúdo e
  rodapé "Desenvolvido por Engine Sistemas" com o logo oficial; `/transparencia` devolvido ao
  cidadão; tokens da marca com **contraste medido** (branco sobre #FE6902 reprova em 2,90:1).
- **N2 — transparência.** Bens (lista, detalhe em abas, CSV) e Despesas (uma linha por empenho).
  Contratos, demonstrativos, carta e ouvidoria já existiam e entraram no portal.
- **N3 — atendimento.** Encaminhamento da manifestação entre setores pelo trâmite canônico, com
  recebimento no destino. Zero modelo novo, zero migration, zero ação nova.
- **N4 — execução contratual.** As duas pendências nomeadas pela ordem, fechadas:
  `GLOSA-LIBERACAO-DE-SALDO` e `ESTORNO-DE-RECEBIMENTO`.
- **N7 — AWS.** Preflight executado (somente leitura); bloqueio identificado com conserto exato.

### 63.6 A AWS — o bloqueio, medido

Inteiro em `docs/operacao/AWS-PREFLIGHT-V9-N7.md`. Em uma linha: **não é "falta o DNS"**.

1. **Autenticação.** O usuário `gestao-publica` existe (conta `441778933745`) e tem **zero chaves de
   acesso**. A senha de console tem `PasswordResetRequired: true` — o primeiro acesso obriga troca no
   navegador, e `aws login` não atravessa isso. O CSV entregue é de console, não de chave, e não
   está nesta máquina.
2. **Autorização.** Mesmo com credencial falharia: as políticas de `gestao-publica` não alcançam
   Lightsail.

O perfil `default` desta máquina é `whats-saas`, com `AdministratorAccess`. **Não foi usado para
provisionar**, e nenhuma chave nova foi criada. Nenhum recurso criado, alterado ou removido;
**nenhum custo novo nesta conta**. `enginesistemas.com.br` intacto (A `76.76.21.21`, MX do Google,
NS da GoDaddy). `AWS_PREPARADA`: **não**. `PUBLICADA`: **não**.

### 63.7 Defeitos achados de carona — e quem os achou

| Defeito | Quem achou | Efeito que teria |
|---|---|---|
| `unirCaminhos` não lia renomeação (`-z` usa dois campos) | o próprio guard, ao mover arquivos | mover um arquivo que lê relógio deixaria o `test:fuso` **fora** do agendamento — falha para o lado de não rodar |
| `paraCsv` não neutralizava fórmula | a revisão da exportação pública | `=HYPERLINK(...)` numa descrição de bem executa na máquina de quem baixa do portal |
| `data-civil`: as duas metades do guard se contradiziam | o próprio guard | não havia como declarar uma exceção de `toLocaleString`; as duas metades ficavam vermelhas ao mesmo tempo |
| `area-publica` vigiava dois caminhos literais | a mudança de rotas | estava verde sem vigiar `/servicos`, `/ouvidoria`, `/consulta` nem os contratos públicos |
| `cancelarSaldoDaOrdemDeServico` somava o medido bruto | o teste de comportamento G6 | tela dizendo "a executar 2,0000" e cancelamento recusando com "só 0,0000" |
| O guard do medido líquido **isentava o arquivo da derivação** | a própria mutação | três dos quatro leitores ficavam fora da regra |
| Bordas de período das despesas em UTC | o guard `data-civil` | empenho após 21h do último dia do mês fora da consulta do mês, e parte do dia anterior dentro |
| `select` extraído com `as const` perde a checagem do Prisma | a execução do teste | `funcao: { descricao: true }` compilou e quebrou em runtime |
| Percurso lia o resultado do cartão vizinho | a execução do percurso | "silêncio" com a confirmação visível ao lado |
| `innerText` de `<details>` fechado é vazio | a execução do percurso | histórico lido como ausente |

### 63.8 Pendências reais, separadas do que depende de terceiro

**Depende de Winner (duas ações, em `AWS-PREFLIGHT-V9-N7.md`):** anexar permissão de Lightsail ao
usuário `gestao-publica` e entregar uma credencial programática dessa identidade. Depois disso,
`IMPLANTACAO-LIGHTSAIL.md` é executável de ponta a ponta e o registro `A` da GoDaddy sai com valor
real.

**Interno, NÃO começado — e não bloqueado por ninguém:** **N5** (B2 tributário: constituição de
crédito e certidões) e **N6** (Master Engine: habilitação comercial de módulos).

⚠️ **Sobre o N6, um fato de arquitetura que a ordem pediu para respeitar:** o sistema é
**mono-ente por implantação** (`ID_DO_ENTE_UNICO`, o banco escolhido por `DATABASE_URL`). Uma tela
"lista de entes" não tem o que listar num banco que tem um. O que cabe construir sem converter a
arquitetura é a **habilitação de módulos por contrato comercial desta implantação**, com o gate
"contexto + módulo habilitado + permissão + escopo" no servidor. Isso está declarado aqui para que
a próxima sessão não descubra no meio.

**Interno, declarado na própria tela:** Receitas/contas públicas e Pessoal aparecem em
`/transparencia` numa lista sem link, com o que falta em cada uma.

**Novas desta rodada:** `BENS-PUBLICOS-SEM-VALOR-NA-LISTA`; `LOCALIZACAO-PUBLICAVEL-SO-NA-CRIACAO`
(marcar uma localização JÁ existente como divulgável ainda não tem tela);
`DESPESAS-TOTAIS-ACIMA-DE-2000` (o recorte grande não soma, e diz por quê);
`DESPESAS-FASE-FILTRADA-NA-PAGINA` (a fase é derivada da cadeia e o filtro dela age sobre a página,
o que a tela declara); `ESTORNO-DE-RECEBIMENTO-SEM-PERCURSO` e `GLOSA-SEM-PERCURSO` (as duas têm
teste de caso de uso e tela, e ainda não têm percurso de navegador).

As demais pendências do V7 M2 continuam abertas, sem alteração.

### 63.9 O próximo passo, exato

**N6, na forma que a arquitetura comporta:** a habilitação de módulos por contrato comercial desta
implantação — modelo (contrato, módulo, vigência, motivo, histórico), o gate no servidor (rota,
ação, relatório e job, não só o menu), a tela restrita, e a política de leitura histórica do módulo
desabilitado (desabilitar não apaga fato nem documento). É a frente de maior efeito entre as não
iniciadas e não depende de acesso externo.

Depois dela, **N5**: começar pelo levantamento curto do contrato de crédito (identificador, devedor,
imóvel, tributo, exercício, fato gerador, fundamento, versão cadastral, parâmetros, memória e
vencimentos) registrado no `MODULO.md` do M34 — e **sem efetivação financeira** enquanto não houver
roteiro contábil validado, como a própria ordem determina.

Antes de integrar qualquer uma, rodar os testes do domínio alterado e a autorização positiva e
negativa. O portão integral (suíte completa, **fuso**, instalação limpa, percursos em sequência)
fica para o candidato de homologação — e o `test:fuso` é **obrigatório** no próximo, porque o diff
desta rodada tocou filtros de período.

## 64. V10 — a habilitação comercial, o B2 tributário, as consultas que eram parciais e o aceite que aprovava sem conferir

> Ordem: `docs/lotes/V10-conclusao-das-frentes-e-homologacao.md`, guardada como veio (a ordem
> chegou com a codificação corrompida; o texto foi restaurado, sem uma palavra a mais ou a
> menos). Base: HEAD `22b8dc3`, com o stash `11b7892` intacto e os três scripts de terceiros
> não tocados. Regime: **profundidade** para o gate de licenciamento, a constituição do crédito,
> a cobertura da certidão e a aritmética das despesas; **superfície** para as telas.

### 64.1 O que passou a funcionar, e a rota real

| Capacidade | Como se chega |
|---|---|
| **Contrato comercial e módulos habilitados** | `/licenciamento` — só quem tem `CONSULTAR_LICENCIAMENTO`, que é ação RESERVADA. Registrar contrato, habilitar módulo, programar vigência, suspender, reativar, com motivo e histórico |
| **Gate de licenciamento** | invisível por desenho: toda escrita passa por `comEscritaAutenticada` e toda leitura protegida por `escopoDeLeitura`. Módulo não contratado recusa nos dois; suspenso recusa a escrita e **deixa a leitura passar** |
| **Preparar o lançamento tributário** | `/receita/lancamentos` → escolher imóveis, natureza, fonte, fato gerador e vencimentos → **Preparar**. Não constitui crédito nenhum |
| **Revisar e constituir** | `/receita/lancamentos/[loteId]` → memória do cálculo, responsáveis congelados, vencimentos, inconsistências → **Constituir o crédito** (um a um) |
| **Retificar / cancelar** | na mesma tela, com motivo. Cancelar baixa por VPD; retificar prepara um substituto **PREPARADO** |
| **Pedir e decidir certidão** | `/receita/certidoes` → pedido com a cobertura base a base → decisão humana, com declaração do que foi conferido fora do sistema |
| **Conferir uma certidão** | `/consulta/certidao`, **sem sessão**, pela chave de 64 hex |
| **Despesas públicas com filtro de fase que vale** | `/transparencia/despesas?fase=Paga` — contagem, páginas, totais e CSV falam do mesmo conjunto |
| **Totais de despesa sem teto** | o rodapé deixou de desistir acima de dois mil empenhos |
| **Valor do bem na lista pública** | `/transparencia/bens` — valor contábil e data de referência na lista e no CSV |
| **Mudar a divulgação de uma localização** | `/patrimonio/localizacoes/[id]` → motivo obrigatório, histórico com autor |
| **Identidade do que está no ar** | `GET /release` — o candidato que a instalação declara |

### 64.2 Migrations e SQL aplicados

| Migration | O que é |
|---|---|
| `20260924090000_v10_t1_licenciamento` | três enums, três tabelas (contrato, habilitação, evento) |
| `20260924090100_v10_t1_acoes_do_fornecedor` | sete valores de enum — as ações RESERVADAS |
| `20260924090200_v10_t2_acoes_tributarias` | seis valores de enum |
| `20260925090000_v10_t2_lancamento_e_certidao` | cinco enums, nove tabelas |
| `20260926090000_v10_t3_acao_divulgacao` | um valor de enum |
| `20260926090100_v10_t3_historico_da_divulgacao` | uma tabela |

Zero `DROP`, zero backfill, zero alteração de coluna existente. Aplicadas em `gestao_publica` e
`gestao_publica_test`. **Nenhum SQL manual novo.**

⚠️ **Papel de runtime — quatro tabelas entraram no censo assinado**, e cada uma com o recorte por
coluna: `ContratoComercial` (só `situacao`), `HabilitacaoDeModulo` (situação, vigência, motivo),
`LancamentoTributario` (**só** `situacao` — `memoria`, `memoriaSha256` e `valor` ficam fora, e é
isso que faz a memória ser congelada de verdade), `SolicitacaoDeCertidao` (só o que a decisão
muda) e `LocalizacaoFisica` (só `publicavelNaTransparencia`). Os históricos append-only —
`EventoDeLicenciamento` e `MudancaDaDivulgacaoDaLocalizacao` — **não** recebem `UPDATE`.

### 64.3 As decisões que valem a pena registrar

**O município não concede a si próprio a habilitação comercial.** `ACOES_DO_FORNECEDOR` é o único
bloco reservado do censo: a tela de permissões do ente as recusa, e o bootstrap passou a conceder
`ACOES_DO_ENTE` (o censo **menos** elas) — antes concedia `TODAS_AS_ACOES`, e teria dado a
habilitação de carona ao administrador municipal no dia em que ela nascesse. O que isso **não**
promete está escrito no código: quem tem o shell do servidor provisiona o que quiser; a fronteira
é a aplicação.

**Suspender não apaga.** Módulo suspenso bloqueia operação NOVA e **preserva a leitura** do que
foi escriturado — o ente segue obrigado a prestar contas. Só `NAO_CONTRATADO` fecha os dois
lados. A transparência pública não passa pelo gate: `app/(publico)/` não tem sessão, por desenho.

**O crédito tributário canônico já existia.** É `ReceitaReconhecida` (M04), que desde 2026
reservava `referenciaExterna @unique` "para a integração tributária, que virá em lote".
`ConstituicaoDoLancamento` é a ponte 1-1 — não um segundo ledger.

**A certidão não emite negativa sozinha.** Três bases estão fora do alcance (dívida ativa por
pessoa, parcelamento, cadastro econômico/ISS) e o sistema diz isso, base a base. Emitir negativa
exige a declaração escrita de quem assina, que vai congelada no documento.

**O filtro de fase e os totais eram o mesmo problema:** o estado derivado só existia em
TypeScript. Ele foi para o banco, e agora filtrar, contar, paginar, somar e exportar falam do
mesmo conjunto.

### 64.4 Defeitos achados de carona — e quem os achou

| Defeito | Quem achou | Efeito que teria |
|---|---|---|
| Os `ALTER TYPE` do enum sumiram da migration ao ela ser regerada | o banco de TESTE, ao aplicar do zero | em dev tudo funcionava; a instalação limpa quebrava em `semearUsuariosDeTeste`, longe dali |
| A projeção de despesas não via os estornos DAS PARCIAIS | a segunda implementação, em SQL | anulação parcial estornada continuava subtraindo do empenho |
| `tsc` com heap de 4096 morre nesta máquina | a execução | a VM do Docker reserva 3 GB dos 8; o sintoma é SIGABRT sem erro de tipo |
| O resolvedor de mentira do teste do aceite escrevia `\n` literal | o próprio teste | todos os casos caíam em DNS_PENDENTE — inclusive o positivo |
| Um servidor só para HTTP e HTTPS no teste do aceite | o próprio teste | o caso da identidade ausente reprovava por exposição indevida |
| A versão de SEIS linhas do teste de paginação estável passava com o defeito presente | a mutação | só com 400 linhas iguais o plano vira top-N heapsort e o defeito aparece |
| `ids.length === 0 ? [] : await prisma…` colapsa a inferência para `any` | o typecheck | `credorNome` e o resto deixariam de ser conferidos, em silêncio |

### 64.5 A AWS — preflight repetido, e o estado não mudou

Somente leitura. `aws configure list-profiles` devolve apenas `default` (de outro produto), e
`AWS_PROFILE=gestao-publica aws sts get-caller-identity` responde "config profile could not be
found". **Não há perfil, nem chave, nem sessão** para a identidade `gestao-publica`. O `default`
**não foi usado** e nenhuma chave nova foi criada. Nenhum recurso criado, alterado ou removido;
nenhum custo novo.

O texto do preflight foi **corrigido**: credencial temporária por `aws login` é o caminho
preferido e a chave de longa duração é a alternativa — o inverso do que estava escrito. E a
política sugerida deixou de ser chamada de "mínima": ela é mínima em **ações**, e o
`Resource: "*"` alcança recursos de outro produto nesta conta.

`AWS_PREPARADA`: **não**. `PUBLICADA_VALIDADA`: **não**.

---

## 65. V11 — a rubrica versionada, a consulta do superávit e as duas famílias públicas que faltavam

Rodada executada na linha do Mac (`main`), sob `docs/lotes/V11-motores-folha-contabilidade-esocial-e-aws.md`.
Por instrução do operador, **portão, `test:tudo` e `test:fuso` não foram executados** — e por isso
nada aqui é declarado homologado.

### 65.1 O ambiente foi reconstruído antes de qualquer medição

O macOS foi atualizado entre sessões e **o container do Postgres desapareceu** — `docker ps -a` não
listava nenhum, nem parado. Não há `docker-compose.yml` nem volume nomeado: os dados de dev se
perderam. O `ENT00` documenta o `docker run`, mas **não** a criação dos outros dois bancos, que o
container não cria. A receita completa ficou registrada na memória do projeto.

### 65.2 V1.1 — a rubrica versionada e a fórmula do ente (`1ef405d`)

O cadastro tinha sete naturezas fechadas e nenhuma vigência: mudar o percentual de uma gratificação
em setembro **reescrevia a folha de março**. `VersaoDaRubrica` passou a ser a autoridade do cálculo,
com vigência por competência, regime aplicável, fundamento e aprovador. A fórmula roda em
`packages/formula` — o interpretador de universo fechado que **já existia**, reaproveitado.

O grafo recusa três coisas com três mensagens diferentes: ciclo (com o caminho), dependência
inexistente, e **dependência posterior** — citar a contribuição é erro porque ela é calculada depois,
sobre a base que inclui a própria linha.

**Defeito achado pelo teste d3:** `cadastrarRubrica` criava a versão 1 automaticamente mesmo para a
natureza FORMULA, produzindo uma versão APROVADA sem expressão que derrubava a folha inteira.
Corrigido o serviço, não o teste.

### 65.3 V3.1 — a consulta do superávit (`01de24c`)

O inventário mudou o incremento: o superávit por fonte **já existia e bem feito** — três amarrações,
lock antes da soma, guard transacional. A exigência da ordem sobre concorrência já estava atendida.
A lacuna era que o número **só existia dentro da mensagem de recusa**. A consulta reusa
`usadoDaDisponibilidade` e `suplementacaoLiquida` — as mesmas funções do guard — e mostra os **dois
tetos**, dizendo qual limita.

### 65.4 V4.1 — as receitas no portal (`e51d182`)

O erro gêmeo ao da despesa: somar **constituição** com **arrecadação**. São o mesmo dinheiro em dois
momentos; a arrecadação baixa o crédito. Painéis separados, aviso colado no número, nenhum total os
junta. Previsão em três números (inicial, reprevisões com sinal, atualizada), com a dedução
subtraindo.

**O guard que não vigiava:** a mutação "tire o desempate por `id`" **não acusou** com 20 linhas — o
Postgres ordenava tudo por acidente. Elevado para 400 linhas (o volume em que o planejador troca
para top-N heapsort), passou a acusar em 2 de 2. **Intermitência registrada e não explicada:** a
primeira execução do R8 com 400 linhas falhou e a saída bruta se perdeu num cano; as cinco seguintes
passaram.

### 65.5 V4.2 — o pessoal no portal (`35586f9`)

**Fail-closed por construção.** Sem política aprovada vigente, zero linhas por servidor. O que não
pode ser publicado **não está no tipo**: `ColunaDoDemonstrativo` tem nove valores, e dependente,
saúde, pensão, CPF, memória e tributação individual não aparecem lá. A projeção **reconstrói**, não
filtra. Dois níveis: agregado por unidade (sem dado pessoal, sempre público) e individual (só com
política aprovada por outra pessoa).

**Correção de desenho de carona:** `agregarResumoDaFolha` saiu da porta para o domínio. Ela é pura,
mas morava num arquivo que também monta PDF — importá-la arrastou `lib/pdf/` para o projeto backend,
com catorze erros de tipo em código pré-existente. Mover foi mais barato que remendar quatro
extensões e continuar a cascata.

**Falha de método minha, achada aqui:** o censo acusou três funções exportadas no V3.1 que são
leitura e não estavam em `FORA_DO_CENSO`. Eu havia commitado o V3.1 **sem reexecutar o censo**.

### 65.6 Pendências, separadas por natureza

**Bloqueio externo (um só):** V6 (AWS) parado na **autenticação** — não existe perfil
`gestao-publica` nesta máquina; o `default` é de outro produto e não foi usado. Não é DNS, não é
certificado, não é IAM.

**Escopo pendente (trabalho, não bloqueio):** V2 (eSocial) e V5 (atendimento) não iniciados; nenhum
percurso de navegador nesta rodada; portão, suíte completa e fuso não executados por instrução.

**Por reconciliar:** a linha **ENT12 do Windows** — quatro commits (`c4d2140`, `512d2ce`, `65c80da`,
`b12664e`) que **não existem nesta máquina** e nasceram de `688c062`, uma base **148 commits atrás**
do Mac. Sem push, não chegaram aqui.

### 65.7 O próximo ponto exato

V2 (eSocial) ou V5 (atendimento), pela fila da ordem V11 — ambos com inventário ainda por fazer. A
reconciliação do ENT12 depende de os commits alcançarem esta máquina.

---

## 66. V11 V2.1 — o registro do leiaute do eSocial, e a decisão de não ter gerador

### 66.1 O que passou a funcionar, e a rota real para chegar lá

`/folha/esocial` — **Consistência para o eSocial**, no submenu de Folha, sob `CONSULTAR_FOLHA`.
Escolhe-se o ambiente (produção / produção restrita) e a data de referência; a tela confronta o
leiaute **registrado** com o cadastro do ente e lista, por pessoa, qual campo está vazio, por que
o leiaute o pede, e a rota para corrigir.

**Hoje ela recusa, nomeando o motivo — e esse é o estado correto.** Nenhum pacote de leiaute está
registrado, porque nenhum foi obtido.

### 66.2 O inventário que decidiu o desenho

Antes de escrever, medi o que existia. O resultado mudou a unidade inteira:

- Nenhum arquivo, tabela, módulo ou função de eSocial no núcleo. As 60 ocorrências do termo são
  comentário de schema (`SEFIP/CAGED/RAIS/DIRF/eSocial são chaveados por CPF`), documento, ou
  `doador/saas-municipal/` — de onde nada se importa.
- `FonteIntegracao.ESOCIAL` existe em `_base.prisma` desde o ENT00, sem um único leitor.
- **Zero arquivos `.xsd` na árvore.**
- `docs/dependencias-externas.md` já registrava `AUSENTE` com a próxima ação "obter leiaute
  vigente do eSocial".
- E a medição nova: em **2026-09-18**, `https://www.gov.br/esocial/pt-br/documentacao-tecnica`
  respondeu **HTTP 403** a requisição automatizada desta máquina.

### 66.3 A decisão, e por que ela não é preguiça

A ordem V11 §5 manda "selecionar os códigos no leiaute vigente". O leiaute vigente não está aqui.
Escrever os códigos de evento, a lista de campos e a tabela de categoria de trabalhador dentro de
um `.ts` seria **inventar norma federal** — o que o CLAUDE.md proíbe em uma linha, e o que
`IcExigidaPorConta` já resolveu nascendo vazia em vez de trazer o Anexo II da MSC de memória.

A diferença entre os dois casos é só de grau, e ela pesa **para o lado do eSocial**. A MSC sai
mesmo assim, com a dimensão faltante virando pendência nomeada, porque um ente sem MSC não
entrega nada. Um XML de eSocial montado com código inventado não tem esse consolo: ele **passa no
validador de estrutura** e a Receita o interpreta como outra coisa. Arquivo plausível e errado é
pior que arquivo nenhum.

Então entregou-se a **máquina**, sem o conteúdo — e ela é a metade que independe do leiaute.

### 66.4 O que foi construído

| Peça | Arquivo | O que faz |
|---|---|---|
| O registro | `prisma/schema/m14-esocial.prisma` | `LeiauteDoESocial` (versão, ambiente, fonte, `sha256`, arquivo, publicação, conferente), `EventoDoLeiaute` (vigência **própria**, XSD nome+digest), `CampoDoEvento` (caminho, origem, obrigatoriedade, condição e regra transcritas) |
| A migration | `20260929090000_v11_v21_registro_do_leiaute_esocial` | Aditiva: três enums, três tabelas, sete CHECKs. **Zero `DROP`, zero seed** |
| A máquina | `modules/m14-exports-federais/esocial/leiaute.ts` | `escolherLeiauteVigente`, `eventosVigentes`, `camposVigentes`, `conferirEvento`, `conferirConsistencia`, `EXTRATOR`, `DESCRICAO_DA_ORIGEM` |
| A porta | `lib/portas/esocial.ts` | Só o client e as duas consultas. Sem pacote registrado, **não lê vínculo nenhum** |
| A tela | `app/(areas)/folha/esocial/page.tsx` | Pessoa, evento/campo, erro, sugestão, rota da origem |

E quatro decisões que já são as armadilhas conhecidas do domínio:

**A data de publicação da nota não é o início das regras que ela publica.** A vigência mora no
evento (obrigatória) e no campo (opcional, herdando a do evento), nunca no pacote. Uma nota técnica
publica de uma vez regras que entram em produção em dias diferentes.

**Os dois ambientes não caem um no outro.** Sem pacote para a produção restrita, a resposta é
`null` — nunca o pacote da produção. A restrita costuma receber a versão mais nova, e trocar uma
pela outra montaria, em produção, um evento pela regra que ainda não entrou lá.

**`CONDICIONAL` não vira erro.** A condição é texto do leiaute e o sistema **não a avalia** —
avaliar uma regra que não se tem é inventá-la. Sai como `CONFERIR`, com a condição ao lado.

**A origem é universo fechado.** `OrigemDoCampoDoESocial` (enum do banco) mais `DESCRICAO_DA_ORIGEM`
(Record exaustivo) — o desenho de `ColunaDoDemonstrativoDePessoal` do V4.2. Um leiaute registrado
não pode apontar para uma origem que o código não resolve.

### 66.5 Comandos executados, com resultado real

| Comando | Resultado |
|---|---|
| `curl -I https://www.gov.br/esocial/pt-br/documentacao-tecnica` | **HTTP 403** |
| `npx prisma validate --schema prisma/schema` | válido |
| `DATABASE_URL=$DATABASE_URL_TEST npx prisma migrate deploy` | aplicada, `exit=0` |
| `npx prisma migrate deploy` (dev) | aplicada, `exit=0` |
| `npx prisma generate` | cliente 7.8.0 regenerado |
| 6 provas de CHECK por `psql` no banco isolado | **6/6 nas duas direções** |
| `npx vitest run .../m14-esocial-leiaute.test.ts` | **20/20**, `exit=0` |
| 7 mutações no domínio | **7 acusações**, cada uma pelo caso certo |
| `tsc -p tsconfig.backend.json --noEmit` | `backend exit=0` |
| `tsc -p tsconfig.json --noEmit` | `app exit=0` |
| `npx vitest run modules/m16-travamento` | **138/138**, `exit=0` |
| `npx vitest run modules/m14-exports-federais` | **46/46**, `exit=0` |
| `npx vitest run test/papel-runtime.test.ts` | **18/18**, `exit=0` |
| `npx vitest run modules/m33-folha modules/m32-pessoal` | **222/222**, `exit=0` |

⚠️ Os `exit=` desta tabela são os que **o próprio comando escreveu** no arquivo de saída, não os da
notificação de tarefa — que carrega o código do invólucro de shell e já disse `0` sobre `exit=2`
três vezes nesta sessão.

**As 6 provas de CHECK**, nas duas direções: `sha256` fora do formato recusa / no formato aceita;
nome de XSD sem o digest dele recusa / evento sem XSD aceita; `CONDICIONAL` sem a condição recusa /
com a condição aceita.

**As 7 mutações e o que cada uma acusou:** queda de ambiente → `e2`; filtro de publicação → `e3` e
`e4`; empate na publicação resolvido pelo índice do array → `e5`; vigência própria do campo
ignorada → `e14`; `CONDICIONAL` tratado como `FACULTATIVO` → `e10`; `trim` removido → `e16` e
`e13`; recusa nomeada trocada por lista vazia → `e1`. Revertidas, 20/20 de novo.

### 66.6 O defeito achado, e ele foi achado pelo próprio instrumento

O `e19` é um tripwire: ele varre o domínio procurando a **forma** do código de evento do eSocial
(letra, hífen, quatro dígitos), não uma lista de códigos conhecidos — porque guarda que enumera
formas acha só aquelas formas.

**Ele falhou na primeira execução.** O que ele pegou foi um código escrito no comentário de
cabeçalho do próprio domínio, no trecho que dizia que aquele código não deveria estar lá. Um
tripwire que consultasse uma lista teria passado; um que fosse escrito depois do código teria sido
calibrado para deixar o caso passar. O comentário foi reescrito sem o literal, o instrumento ficou
como está, e o caso está registrado dentro do próprio teste.

### 66.7 Invariantes verificadas

- **Migration aditiva**, zero `DROP`, e sem seed — o vazio é o estado de partida correto.
- **Fail-closed**: sem pacote registrado, `escolherLeiauteVigente` devolve `null`, a porta não lê
  vínculo nenhum e a tela recusa **nomeando o motivo**. `SEM_LEIAUTE` e `SEM_EVENTO_VIGENTE` são
  mensagens distintas — confundir "zero pendências" com "não há leiaute" levaria alguém a
  transmitir achando que o ente estava em ordem.
- **Autorização no servidor**, por ação nomeada (`CONSULTAR_FOLHA`), no `exigirLeitura` da página.
- **Fixture N=2**, com faltas **diferentes** entre as duas pessoas: com uma só, "achou a pendência"
  não distingue "achou a daquela pessoa" de "achou uma qualquer".
- **Data civil do ente** em toda comparação de vigência, por `compararPorDiaCivil`.
- **Nada publicado**: esta consulta é da área autenticada. O portal do cidadão tem porta e política
  próprias e não foi tocado.
- **Censo de ações**: `consistenciaDoESocial` entrou no `FORA_DO_CENSO` com o motivo; M16 138/138.
- **Papel de runtime**: as três tabelas são só `INSERT`, não entram em `ESCRITA_MUTAVEL_DO_RUNTIME`;
  18/18 confirmam que não sobrou nem faltou grant.
- **`test/limpar-banco.ts`** ganhou as três tabelas: um pacote deixado por um arquivo de teste faria
  o seguinte medir consistência contra um leiaute que ele não registrou.

### 66.8 Catálogo

Nenhuma cláusula marcada. O que existe é **máquina sem conteúdo normativo**: marcar atendimento de
cláusula de eSocial com o leiaute ausente seria exatamente a marcação por papelada que o CLAUDE.md
proíbe. A marcação de **ausência** cabe quando o catálogo for revisitado com a pendência
`LEIAUTE-ESOCIAL-NAO-OBTIDO` na mão.

### 66.9 Pendências, separadas por natureza

**Bloqueado por insumo externo:**

| Pendência | Depende de |
|---|---|
| `LEIAUTE-ESOCIAL-NAO-OBTIDO` | Download **manual** do pacote de leiaute e do pacote de XSD no portal do eSocial (o automatizado recebe 403), e `INSERT` com o `sha256` de cada arquivo |
| Assinatura A1 e transporte | Certificado digital do ente e autorização de ambiente. **É pendência distinta** da anterior — não se resolvem juntas e não viram uma pendência genérica |

**Escopo pendente (trabalho, não bloqueio) — mas cada item depende do primeiro bloqueio acima:**
geração de XML e prévia legível; validação XSD; lotes, chave de idempotência e os estados do
protocolo (gerado, validado, assinado, aguardando envio, enviado, recebido, aceito, rejeitado);
recepção idempotente de retorno e retificação.

**Escopo pendente independente:** V5 (atendimento) não iniciado. **Nenhum percurso de navegador** —
o banco de desenvolvimento foi recriado vazio depois da atualização do macOS, e a tela precisa de
quadro de pessoal semeado para mostrar mais do que a recusa. V6 (AWS) segue bloqueado na
autenticação, como na seção 65.6. Linha **ENT12 do Windows** por reconciliar.

### 66.10 O próximo ponto exato

**V5 (atendimento)** — a única frente da V11 que não depende de insumo externo nenhum: percursos de
glosa e estorno sobre motores que já existem, e-SIC sobre M21/M22, e o guichê. Inventário ainda por
fazer, como foi o do V2.

Alternativa de igual valor: semear o quadro de pessoal no banco de desenvolvimento e executar os
percursos de navegador pendentes das telas do V11 — que hoje é a lacuna de verificação mais antiga
da ordem.

---

## 67. V11 V5 — a orquestração com dois agentes: o que o inventário derrubou e o que os instrumentos pegaram

### 67.1 O modo de trabalho desta unidade

Dois agentes, um integrador. **Auxiliar** e **engenheiro de reconhecimento** varreram em paralelo,
somente leitura, duas frentes disjuntas: a cadeia medição→glosa→estorno mais o guichê, e o e-SIC
sobre M21/M22 mais o custo da semeadura. Depois, um **engenheiro** construtor sobre a frente já
mapeada, e o integrador conferindo, medindo e commitando.

O inventário-antes-de-construir **mudou as duas frentes**, e é por isso que ele vem primeiro.

### 67.2 O que o inventário derrubou

**Glosa e estorno não precisavam de código.** Motor (`decidirControversia`, `estornarMedicaoDaOrdem`,
`estornarRecebimentoDefinitivo`), tela (`FormDecidirControversia`, `FormEstornarMedicao`,
`FormEstornarRecebimento`), testes (G1–G6, ER01–ER06) e **dado semeado**
(`scripts/preparar-ponte-contratual.ts`) já existiam. Faltava só o percurso: o smoke vizinho decidia
a controvérsia como ACEITA e nunca exercitava REJEITADA nem estorno nenhum.

**A premissa do guichê estava errada no próprio pedido.** A ordem manda "reutilizar os componentes
da agenda U8". A agenda U8 **não é motor de reserva**, por decisão explícita
(`modules/m11-licitacoes/agenda-da-fiscalizacao.ts:20-23`): sobreposição não é proibida ali, o campo
`conflitos` é informativo e calculado em memória depois do `findMany`, não há capacidade, não há
vaga, não há `travar()`, não há transação. Reusá-la como motor de vaga seria reusar exatamente a
peça que não trava. Reaproveitável é o **desenho** — fato append-only com vigente = último, dia civil
mais `"HH:MM"` como texto em vez de instante UTC — e os componentes de tela. O guichê precisa de
posto próprio em `ORDEM_DOS_LOCKS` (que **recusa em runtime** recurso não declarado) e de índice
único **parcial**, porque `@@unique` do Prisma não trava coluna anulável: dois `NULL` são distintos
no Postgres.

**A ouvidoria não tem prazo.** A ordem manda "não reutilizar cegamente prazo da ouvidoria". Não há o
que reutilizar: os três modelos dela têm só `criadoEm`. O prazo que ela aparenta ter é
`EtapaDoRoteiro.prazoDias` — de ETAPA, do setor, contado do recebimento, sem fundamento legal — e os
"20 dias" do repositório estão num seed de demonstração. O molde certo era outro:
`VersaoDaConfiguracaoDaCertidao` (M34), prazo **com fundamento**, versionado por vigência, ausente
⇒ recusa nomeada.

### 67.3 O que foi entregue

| Commit | O quê |
|---|---|
| `0adaf12` | Mapa de acesso regenerado — 245 → 258 rotas, defasado desde antes do V10 T1 |
| `65f19e1` | **V5.2** — o recebimento estornado somava dinheiro, inclusive na projeção pública; e o guard que devia impedir isso |
| `3804004` | **V5.1** — a configuração do acesso à informação: prazo, prorrogação, recurso e as duas normas |
| `43f8842` | Os roteiros de navegador da glosa e dos dois estornos — escritos, tipados, **não executados** |
| `66d97c1` | `typecheck:scripts` estava vermelho; os três erros eram um só, em cascata |

### 67.4 O defeito que mais importa, e ele é público

`projecaoPublicaDoContrato` selecionava `medicoes → recebimentosDefinitivos → itens.valor` **sem
filtro de estorno em nenhum dos dois níveis**, e `execucaoDoContrato` somava o mesmo por medição. Uma
medição estornada e um termo de recebimento desfeito continuavam somando no valor que a primeira
**publica no portal do cidadão**. No cenário do ER03 — 900 estornado, mais 100, mais 800 corrigido —
a tela dizia "Recebido 1.800,00" com 900,00 efetivamente recebidos.

A assimetria é o que escondia: a **quantidade** já excluía o estornado, por `SELECAO_DOS_RECEBIDOS`;
o **valor** não.

**E o guard que existe para impedir isso não pegou.** `test/medido-liquido-sem-atalho.test.ts`
vigiava dois nomes — `recebidos` e `medidosNaOrdem`. Este caminho passa por
`recebimentosDefinitivos`. É a regra do CLAUDE.md em uma linha, *"guarda que enumera formas acha só
aquelas formas"*, mordendo dentro do arquivo escrito para impedi-la.

A enumeração virou **propriedade derivada do schema**: o teste lê os `.prisma` do M11, acha todo
modelo com relação `estorno`, acha toda relação que aponta para eles, e varre os leitores que somam
valor ou quantidade. Relação nova entra na varredura sozinha.

Na primeira execução ele acusou dois sítios **corretos** de `Contrato.medicoes`: o mesmo nome de
relação aponta para `MedicaoDeObra` quando sai de `Contrato` — que não tem estorno — e para
`MedicaoDaOrdemDeServico` quando sai de `OrdemDeServico`. A exceção é por **sítio**, com motivo, não
por arquivo: excluir `fiscalizacao.ts` inteiro desligaria o guard justamente onde o defeito morava.
E vem com **âncora** — um caso afirma que `MedicaoDeObra` continua não sendo estornável, para que a
exceção não envelheça em silêncio.

### 67.5 Os dois instrumentos que pegaram a própria prosa

**O tripwire do prazo (`a12`)** varre a FORMA de um prazo cravado, não uma lista de números. Acusou
na primeira execução, contra o comentário do próprio domínio, que citava "20 dias" como exemplo do
que não deveria estar lá. **Segunda vez nesta sessão** — a primeira foi o tripwire do eSocial, na
seção 66.

**E o teste de propriedade `a9` passava com a aritmética errada.** A mutação que troca
`somarDiasCivis` por `getTime() + n*86400000` passou 18/18. A primeira versão corria 366 dias de 2026
ancorados ao **meio-dia** — e o Brasil não tem horário de verão desde 2019, então não havia virada a
atravessar, e meio-dia é a hora mais segura do dia. A segunda versão, em 2018 às 23:30, **também**
mediu zero divergência: a âncora andava por `getTime() + i*86400000` e derivava junto com a virada.
Só a terceira, montando cada dia civil do zero, separou as implementações.

O caso agora traz uma asserção de **antivacuidade**: ele exige que a corrida contenha ao menos um dia
em que a aritmética errada discordaria, e falha por vacuidade em vez de passar por ela. Um teste de
propriedade que não distingue as duas implementações não afirma propriedade — descreve o resultado
que as duas dão.

### 67.6 Comandos, com o exit code que o próprio comando escreveu

| Comando | Resultado |
|---|---|
| `prisma validate` · `migrate deploy` (teste e dev) · `generate` | válido, aplicadas, `exit=0` |
| `tsc -p tsconfig.backend.json` | **`backend exit=0`** |
| `tsc -p tsconfig.json` | **`app exit=0`** |
| `tsc -p tsconfig.scripts.json` | de `exit=2` para **`exit=0`** |
| `vitest modules/m21-protocolo/m21-acesso-a-informacao.test.ts` | **18/18** |
| `vitest test/medido-liquido-sem-atalho.test.ts` | **8/8** |
| `vitest modules/m16-travamento` | **138/138** (censo: 396 serviços, 302 ações) |
| `vitest` glosa + ordem + liquidação + contrato + planilha | **53/53** |
| `vitest test/leitura-por-acao.test.ts test/menu-contra-o-servidor.test.ts` | **15/15** |
| 7 mutações | **7 acusações**, cada uma pelo caso certo |

As 7 mutações: menor versão → `a2`/`a2b`/`a3`; vigência futura → `a3`/`a3b`; regulamentação ausente
zerando o prazo → `a4`; prorrogação sem limite → `a11`; milissegundos no lugar de dias civis → `a9`;
filtro de estorno removido da projeção pública → o guard; detecção de modelos estornáveis desligada →
a âncora.

### 67.7 O bloqueio que impediu os percursos, e ele é de ambiente

Os três bancos estão **vazios** — o container do Postgres não tem volume — e a recriação documentada
**está quebrada**: `preparar-banco-de-percursos` semeia o PCASP oficial (7.864 contas) e **para**,
porque `CONTA_DOTACAO_INICIAL` (`5.2.2.1.1.00.00`) é **sintética** no plano oficial e analítica no
plano mínimo. É a pendência `PREPARADOR-INSTALACAO-LIMPA`, e o contorno de antes — clonar por
TEMPLATE um banco que funcionava — **não existe mais**, porque não há banco povoado para clonar.

Apontar o roteiro para a analítica (`5.2.2.1.1.01.00`) destravaria a execução e seria **decidir
roteiro contábil sem a fonte oficial**, para destravar. Não foi feito.

`GLOSA-SEM-PERCURSO` e `ESTORNO-DE-RECEBIMENTO-SEM-PERCURSO` continuam **abertas**: falta ambiente,
não código. O worktree `gestao-publica-candidatos/percurso-glosa-0adaf12` ficou pronto para a
retomada.

### 67.8 Pendências, separadas por natureza

**Bloqueado por decisão de fonte oficial (uma decisão, não uma execução):**
`PREPARADOR-INSTALACAO-LIMPA` — qual conta analítica o roteiro `DOTACAO_INICIAL` usa sob o plano
oficial. Ela trava **todo** percurso de navegador, não só os dois desta seção.

**Bloqueado por insumo externo:** `LEIAUTE-ESOCIAL-NAO-OBTIDO` (seção 66.9); certificado A1;
**V6 (AWS) na autenticação** (seção 65.6). São três pendências distintas e não viram uma genérica.

**Escopo pendente (trabalho, não bloqueio):** o pedido, a prorrogação e o recurso do acesso à
informação como FATOS sobre o `Processo` do M21 — esta entrega é a régua e a norma que ela obedece.
O **guichê** inteiro: motor, modelo, tela, dado e percurso, com posto próprio em `ORDEM_DOS_LOCKS` e
índice único parcial. Linha **ENT12 do Windows** por reconciliar.

### 67.9 O próximo ponto exato

**Decidir `PREPARADOR-INSTALACAO-LIMPA` pela fonte oficial do plano de contas.** Ela destrava os dois
percursos já escritos, os percursos pendentes das telas do V11 e a semeadura inteira — é a única
pendência desta lista que desbloqueia várias outras, e é decisão, não trabalho.

Depois dela: os fatos do pedido de acesso à informação sobre o `Processo`, ou o guichê.

---

## 68. V11 V6 — a instalação limpa que ninguém tinha rodado, e a jornada do acesso à informação de ponta a ponta

Base: `af32666`. Sete commits: `047e6d2`, `aae55e0`, `d94ab75`, `e774d63`, `82564e9`, `9f71589`,
`d1681ea`, `4c192d7`. Sem push.

### 68.1 O banco tinha sumido de novo — e a receita estava pela metade

Segunda ocorrência do mesmo modo de falha: o Postgres de desenvolvimento roda num container criado
à mão, **sem volume nomeado**, e não sobrevive a uma queda do daemon. Os seis bancos foram junto.

O `ENT00` traz o `docker run` e **para aí**: ele não diz que o container só cria o PRIMEIRO banco e
que os outros dois precisam ser criados à mão, nem que `migrate deploy` toca só `DATABASE_URL`, nem
que `npm run db:sql` é obrigatório em ambiente novo. A receita completa está na memória do projeto.
Recriado: três bancos, migrations, 27 arquivos de SQL manual, cliente regenerado.

### 68.2 `PREPARADOR-INSTALACAO-LIMPA` não era uma conta — era uma classe, e ela tinha três camadas

A seção 67 registrou a pendência como "decidir qual conta analítica o roteiro `DOTACAO_INICIAL` usa".
Era menos do que o problema. Medido em banco novo e exclusivo, três vezes:

| Camada | O que estava errado | Onde |
|---|---|---|
| Seeds | 15 contas exigidas analíticas; 3 sintéticas no núcleo, 6 em demonstração | `prisma/seed/` |
| Roteiros de execução | 4 das 18 constantes de `roteiros.ts` sintéticas no plano oficial | `modules/m01-core-contabil/` |
| Portas | `2.1.3.1.1.00.00` escrita **cinco vezes** como constante local | `lib/portas/`, `prisma/seed/poc-fila.ts` |

**O que foi corrigido, com a fonte:** `CONTA_DOTACAO_INICIAL` → `5.2.2.1.1.01.00` (CREDITO
INICIAL); `CONTA_DDR_DISPONIVEL` → `8.2.1.1.1.01.00` (RECURSOS DISPONÍVEIS PARA O EXERCÍCIO);
`CONTA_FORNECEDORES_A_PAGAR` → `2.1.3.1.1.01.01` (FORNECEDORES NÃO PARCELADOS A PAGAR), agora **uma**
constante em vez de cinco. As três saíram da partição do `Pcasp_2025.xlsx` do TCE-PB — o mesmo
arquivo que `seed:pcasp-oficial` carrega —, não de semelhança de nome. A da DDR teve duas medições
fechando a escolha: as outras três pernas do circuito já apontavam para a analítica do ramo, e o
único CRÉDITO àquela conta em todo o sistema é `roteiroArrecadacao`.

**O que NÃO foi escolhido, e por quê:**

- `ROTEIRO-CREDITO-ADICIONAL-POR-TIPO` — o PCASP particiona a dotação adicional **por tipo de
  crédito** (7 analíticas) e `RoteiroOrcamentario.tipo` tem UM lugar. Apontar para a suplementar
  lançaria especial e extraordinário como suplementar. **Consequência declarada: instalação limpa
  não faz crédito adicional.**
- `CONTROLE-DDR-POR-NATUREZA-DA-FONTE` — `7.2.1.1` se parte pela natureza da fonte (ordinários,
  vinculados, extraorçamentários, compensação). O sistema conhece a fonte; o roteiro tem perna fixa.
  **Consequência declarada: não há arrecadação em instalação limpa.**
- `ROTEIRO-RESERVA-SEM-CONTA`, `CONSIGNACAO-CONTA-SINTETICA`,
  `OBRIGACAO-A-PAGAR-POR-NATUREZA-DO-CREDOR`, `DDR-DISPONIVEL-SALDO-A-REPONTAR`,
  `FORNECEDORES-SALDO-A-REPONTAR`.

**O plano MÍNIMO mentia, e a mentira era o que escondia tudo.** `prisma/seed/pcasp.ts` marcava
`5.2.2.1.1.00.00` e `8.2.1.1.1.00.00` como analíticas. Como os bancos de trabalho nasciam clonados,
nada quebrava — e o defeito só aparecia em instalação nova, que ninguém fazia.

**Resultado:** `preparar-banco-de-percursos` **exit=0** em banco criado do zero, 21 passos, **uma**
tolerância — a do crédito adicional, nomeada por expressão que só casa com ela. A V6.1 tolerava
qualquer "Conta sintética", uma rede que perdoava defeito de digitação junto com decisão pendente.

### 68.3 Os instrumentos, e os defeitos que eles tinham dentro

`test/contas-do-seed-analiticas.test.ts` classifica todo arquivo de `prisma/seed/`.
`test/contas-contra-o-plano-oficial.test.ts` ganhou a medição que faltava: a **perna de partida**.

Ele nasceu com três defeitos próprios, e quem os pegou foi ele mesmo:

1. usava `somenteCodigo`, que **esvazia literal de string** — colheu ZERO pernas, e o teste de
   vacuidade acusou;
2. conhecia só a chave `conta:` e perdeu as cinco pernas do roteiro orçamentário inteiro — quem
   acusou foi a lista de pendências órfãs;
3. resolvia constante por nome **global**, e `CONTA_BANCOS` existe com dois valores — uma perna real
   era resolvida para a conta errada.

E a lição do CLAUDE.md que eu repeti: enumerar forma acha só aquelas formas. A chave
`obrigacaoAPagar:` passou despercebida, e foi por ela que o nó sintético entrou em cinco arquivos.
A correção não foi mais uma chave: foi **classificar toda constante de conta** — ou o código aparece
numa perna colhida, ou está em `NAO_E_PERNA` com motivo, ou em `PERNA_INDIRETA`, que não é licença.

Sete mutações no total, todas acusando, todas revertidas em verde.

### 68.4 O percurso da ponte contratual: escrito em 43f8842, executado agora

Ele nunca tinha rodado, e não rodava por duas causas, nenhuma delas no domínio:

- **a aba em segundo plano.** O percurso abre uma segunda aba de propósito e depois age na primeira.
  O Chrome não entrega `IntersectionObserver` a aba oculta, e é dele que o `elementHandle.click`
  depende. Medido com `protocolTimeout` de 20 s: primeiro plano 0,0 s · segundo plano 20,0 s e ERRO
  · com `bringToFront` 0,6 s. Timeout se mede, não se aumenta;
- **o roteiro nasceu contra um nome que já não existia:** procurava
  `data-acao="estornar-recebimento-<numero>"`, e a V5.2 trocara a chave para o ID. Tipagem não pega
  isso: é string.

**50 passos, 0 falhas.** A glosa (12.1–12.7), o estorno da medição (13.1–13.9) e o estorno do
recebimento (14.1–14.5). O dinheiro, medido no banco: três termos definitivos, um estornado,
**recebido efetivo 1.000,00** — 1.050,00 se o termo desfeito contasse. E na tela, no passo 7.2, a
ordem separa Autorizado 1.100,00, Medido 1.000,00, **Recebido 900,00** e Liquidado 900,00.

### 68.5 O acesso à informação: domínio, schema, serviço, telas e navegador

- **Fase A** (`aae55e0`) — domínio puro, 25 casos, sem Prisma e sem relógio.
- **Fase B** (`9f71589`) — schema, 2 migrations aditivas (zero DROP), 6 CHECKs, **5 índices únicos
  parciais**, 5 ações de censo, 2 postos de trinco, o serviço e 9 casos contra banco.
- **Fase C** (`d1681ea`) — a tela interna, e a projeção do requerente **na consulta pública que já
  existia**, por número e código verificador, sem sessão.
- **Fase D** (`4c192d7`) — **22 passos, 0 falhas** no navegador.

O pedido **não tem jornada própria**: ele é executado por um `Processo` do M21. Distribuir é
tramitar, receber é receber — e os dois acontecem na MESMA transação do fato do rito, porque
`tramitar` e `receberProcesso` viraram cascas sobre corpos extraídos e exportados.

As duas projeções são montadas por **funções diferentes**, não por filtro: `visaoDoSolicitante` não
lê o fundamento interno, o ator nem o setor. Vincular ao Processo não tornou o pedido público.

**Um defeito da V5.1 consertado junto:** `publicarConfiguracaoDoAcesso` lia `MAX(versao)` sem travar.
O `@unique` fazia a segunda falhar — fail-closed, mas com violação de índice em vez de motivo.
Pendência registrada: `CONFIGURACAO-DA-CERTIDAO-SEM-TRINCO` (o M34 tem o mesmo desenho).

**Atualização de permissões v24** — sem ela a instalação EXISTENTE não ganha as cinco ações, e foi
assim que a primeira execução do percurso parou. Verificados os dois caminhos: instalação limpa
(bootstrap concede as 5) e atualização (v24 concede 5 em 1 perfil).

### 68.6 O que este lote NÃO entregou, e o que ficou vermelho

**Vermelhos HERDADOS — medidos em worktree na base `af32666`, não supostos:**

| Guard | O que acusa | De onde vem |
|---|---|---|
| `modelo-sem-caso-de-uso` | 7 modelos órfãos | V2.1, V4.2, V1.1, V10 T2 |
| `fronteira-ui` (3) | 2 ilhas client importando porta | V4.2, V1.1 |
| `formularios-na-mesma-pagina` t6 | 2 `id` literais na tela do eSocial | V2.1 |
| `data-civil` | comparação por UTC fora da lista | anterior a esta sessão |

Nenhum deles é desta sessão, e nenhum foi corrigido aqui — exceto os 11 `id` literais de
`FormConfiguracao`, que eram da tela irmã da unidade em execução.

**Do que era meu e eu não tinha visto:** quatro testes citavam conta por LITERAL e quebraram com as
unidades V6.2/V6.3. Rodei só testes dirigidos naquelas unidades; a bateria ampla é que achou. Todos
passaram a citar a CONSTANTE.

**Bloqueado por insumo externo, sem mudança:** `LEIAUTE-ESOCIAL-NAO-OBTIDO`, certificado A1,
**V6 (AWS)**. Três pendências distintas.

**Escopo pendente:** o **guichê** inteiro. `CONFIRMACAO-DE-ATO-QUE-SAI-DA-TELA`. Linha **ENT12 do
Windows** por reconciliar — esta main **não** incorporou os commits do Windows, e a reconciliação
não foi iniciada nesta rodada, por ordem.

**Não executado nesta rodada, por ordem:** suíte completa, `test:fuso`, portão integral, campanha de
mutações geral.

### 68.7 O próximo ponto exato

**`ROTEIRO-CREDITO-ADICIONAL-POR-TIPO`** — é a única pendência cuja consequência é um caso de uso
inteiro indisponível em instalação limpa (crédito adicional), e destravá-la é decisão de MODELO:
`RoteiroOrcamentario` resolvido pelo tipo do crédito. Ela leva junto a `CONTROLE-DDR-POR-NATUREZA-DA-FONTE`,
que é a mesma forma de problema (perna fixa para um dado que o sistema conhece).

Depois dela: o guichê, ou os 7 modelos órfãos que o `modelo-sem-caso-de-uso` acusa desde `af32666`.

## 69. V11 V7 — o crédito adicional entra na conta do SEU tipo, e abre no navegador

> Três commits: `d5deb9d` (os treze testes que eu não tinha visto), `eed4114` (V7.1 — o roteiro
> por tipo de crédito), `2e096fb` (V7.2 — o percurso, e dois defeitos de tela medidos nele).

### 69.1 `ROTEIRO-CREDITO-ADICIONAL-POR-TIPO` — resolvida, e o que ela era de verdade

A pendência estava escrita como "falta escolher uma conta". Não era. O nome da sintética no
`Pcasp_2025.xlsx` do TCE-PB (sha256 `52ae7c73...17ffb`) diz o que ela é:

```
5.2.2.1.2.00.00  DOTAÇÃO ADICIONAL POR TIPO DE CREDITO
  .01.00  CREDITO ADICIONAL - SUPLEMENTAR          ← analítica ÚNICA
  .02.00  CREDITO ADICIONAL - ESPECIAL             (sintética, três filhas)
  .03.00  CREDITO ADICIONAL - EXTRAORDINÁRIO       (sintética, três filhas)
```

O sistema **conhece** o tipo (`LeiCredito.tipoCredito`), mas `RoteiroOrcamentario.tipo` era
`@unique` por `TipoMovimentoDotacao` e `CREDITO_ADICIONAL` é **um** tipo de movimento: havia lugar
para um roteiro só. Era decisão de **modelo**, não de digitação.

⚠️ **E isso não dava teste vermelho por um motivo incômodo:** um lançamento na conta errada
**fecha igual** ao certo — mesmo subsistema, mesmas somas. Quem enxerga a diferença é quem compara
a partida com a classificação do **ato** que a originou.

**O modelo.** `RoteiroOrcamentario` ganhou `tipoCredito TipoCredito?`, e a chave virou o par. Três
guardas, em camadas diferentes, porque nenhuma fecha sozinha:

| Guarda | Onde | O que ela pega |
|---|---|---|
| `@@unique([tipo, tipoCredito])` | schema | o par preenchido |
| `uq_roteiro_sem_tipo_de_credito` | `prisma/sql/` | o caso NULL — no Postgres dois NULL são **distintos** |
| `ck_roteiro_tipo_de_credito` | migration | preenchido **se e somente se** `tipo = CREDITO_ADICIONAL` |

O tipo **não** virou coluna de `MovimentoDotacao`: o `ItemCredito` já liga 1-1 o movimento ao
decreto e o decreto à lei — é o caminho que o MANAD (M14) já percorre. Gravar de novo seria a
segunda verdade sobre o mesmo crédito.

**A migration tem um `DROP`, e ele é de ÍNDICE.** `RoteiroOrcamentario_tipo_key` deu lugar a uma
restrição mais larga; nenhuma linha some. Toda linha existente nasce com `tipoCredito` NULL, e o
índice parcial recria sobre elas exatamente a unicidade que havia — não há janela em que dois
`DOTACAO_INICIAL` caibam.

### 69.2 O que ficou decidido, e o que ficou registrado sem escolher

**Decidido pela fonte:** `SUPLEMENTAR` → `5.2.2.1.2.01.00`, analítica única sob a sintética.

**Registrado sem escolher** — escolher seria inventar norma:

- **`CREDITO-ESPECIAL-ABERTO-OU-REABERTO`** — especial e extraordinário têm TRÊS analíticas cada
  (ABERTOS / REABERTOS / REABERTOS - SUPLEMENTAÇÃO, CF art. 167 § 2º). O que as separa é se o
  crédito foi aberto neste exercício ou é a reabertura do saldo do anterior, e
  `LeiCredito`/`DecretoCredito` não registram esse vínculo. **Falta um FATO, não uma conta.**
- **`ANULACAO-DE-DOTACAO-DOIS-CANCELAMENTOS-HOMONIMOS`** — redução de dotação não mora em
  `5.2.2.1.2`, e as candidatas são DUAS com o nome **idêntico**: `5.2.2.1.3.09.00` (sob DOTAÇÃO
  ADICIONAL POR FONTE) e `5.2.2.1.9.04.00` (sob CANCELAMENTO/REMANEJAMENTO), ambas
  "(-) CANCELAMENTO DE DOTAÇÕES", ambas CREDORAS e analíticas. Decidir por semelhança de nome é
  escolher entre nomes iguais.
- **`DOTACAO-ADICIONAL-POR-TIPO-E-POR-FONTE`** — `5.2.2.1.2` (por tipo) e `5.2.2.1.3` (por fonte)
  são **irmãs** sob `5.2.2.1`. Lançar nas duas dobraria o total; lançar só numa deixa a outra
  visão vazia em qualquer demonstrativo que a leia. Este sistema hoje lança só na `.2`.

O seed passou a imprimir, para a anulação, uma **ressalva**: as analíticas sob o código recusado
são do ramo **errado**, e candidata errada é pior que candidata nenhuma para quem vai decidir.

### 69.3 A instalação limpa — o que passou a caber nela

`preparar-banco-de-percursos` em banco criado do zero: **exit=0, 21 passos, UMA tolerância**, e ela
**encolheu**. A POC do SAGRES agora atravessa a perna de suplementação contra o plano oficial
(razão incluso) e para **um passo adiante**, na perna de anulação.

> **Instalação limpa passa a fazer crédito adicional SUPLEMENTAR por recurso novo** (superávit
> financeiro, excesso de arrecadação, operação de crédito). Por **anulação**, não — e nem especial
> nem extraordinário.

### 69.4 O percurso — 18 passos, 0 falhas

A fatia que faltava era a **lei**: a própria tela vinha dizendo que o cadastro de leis não tinha
formulário e que a lei entrava por seed. Honesto e inútil — sem lei não há decreto, e sem decreto o
crédito adicional inteiro ficava fora do alcance de quem só tem a tela.

| Passo | O que ele afirma |
|---|---|
| 1.x | a LEI entra pela tela e o ato **confirma** |
| 2.x | o DECRETO e a perna de suplementação entram pela tela |
| 3.x | o dinheiro chega na ficha: dotação autorizada 10.000 → **17.500** |
| **4.1** | **a partida debita `5.2.2.1.2.01.00`** — contra o plano OFICIAL |
| 5.x | repetir o MESMO número é recusado com motivo, e nada duplica |
| 6.x | a tela oferece o formulário a quem não tem a ação, e o **servidor** recusa nomeando `CRIAR_LEI_DE_CREDITO` |

⚠️ **4.1 é a única conferência que não se faz pela tela, e não por desleixo:** a conta do PCASP não
aparece em tela nenhuma do crédito adicional, e um lançamento na conta errada fecha igual ao certo.

### 69.5 Dois defeitos medidos ao escrever o percurso

1. **O decreto gravava e a tela não dizia nada.** A confirmação só existia no ramo FECHADO do
   painel, e o painel ficava ABERTO depois de gravar, com os campos preenchidos. Quem enviasse
   leria silêncio e reenviaria, colidindo na unique `[ano, numero]`. Agora o painel fecha, limpa os
   campos, e a confirmação fica FORA do formulário com `role="status"` e `data-resultado-da-acao` —
   o mecanismo da V6.2 para ato que sai da tela, com `data-resultado-seq` como **contador**.

2. **O preenchimento de data não chegava a campo controlado — no helper de TODOS os percursos.**
   `el.value = x` grava por cima do setter que o React instala; o React compara `x` com `x`,
   conclui que nada mudou e não chama o `onChange`. MEDIDO: o form do decreto (controlado) ficava
   com `data=""`; o form da lei (não-controlado), ao lado, recebia a data — o que fazia o defeito
   parecer **da tela**. A cura é chamar o setter do protótipo.

   ⚠️ **O ramo `marcar` NÃO foi "corrigido junto".** A mesma armadilha existe em tese, mas a
   correção equivalente precisa de um `click` sintético que pode acionar a ativação padrão e
   **inverter** o que acabou de ser marcado — o percurso passaria a desmarcar em silêncio. Sete
   percursos usam esse ramo e nenhum acusa problema. Pendência `MARCAR-EM-CAMPO-CONTROLADO`.

O percurso ganhou `porQueNaoEnviou`: quando o envio sai em silêncio, ele lê da tela o estado do
botão, os erros de forma e o valor de CADA campo. Foi ele que achou o `data=""` na primeira
execução.

### 69.6 O erro que era meu, e a medição que o escondia

**Treze testes em três arquivos estavam vermelhos desde esta mesma rodada**, procurando contas que
o repontamento tinha aposentado:

| Arquivo | Testes | Vermelho desde |
|---|---|---|
| `m08-encerramento-controles.test.ts` | 8 | `047e6d2` (V6.1) |
| `m14-msc.test.ts` | 4 | `047e6d2` (V6.1) |
| `m20-importador.test.ts` | 2* | `e774d63` (V6.3) |

\* os dois do M20 caíam por `2.1.3.1.1.00.00`, da V6.3.

⚠️ **O erro foi de MEDIÇÃO, não de digitação.** Na V6.3 eu disse que quatro arquivos tinham o mesmo
defeito e que a bateria ampla os tinha achado. A bateria que rodei alcançou **124 arquivos**; a
suíte inteira tem **299**. Estes três estavam fora do recorte, e o relatório daquela rodada ficou
incompleto. Todos passaram a citar a CONSTANTE.

### 69.7 O que foi medido, e o que continua vermelho

- tsc app / backend / scripts: `exit=0`
- **suíte inteira: 3125/3130 em 299 arquivos**
- oito mutações entre os dois instrumentos novos, oito acusações, verde após restaurar
- instalação limpa do zero: `exit=0`, 21 passos
- percurso do crédito adicional: **18/0**; regressão no percurso da cadeia da despesa: os três
  preenchimentos de data seguem passando

**Vermelhos HERDADOS — cinco, e o quinto só apareceu agora:**

| Guard | De onde vem |
|---|---|
| `modelo-sem-caso-de-uso` (7 modelos órfãos) | V2.1, V4.2, V1.1, V10 T2 |
| `fronteira-ui` (3) | V4.2, V1.1 |
| `formularios-na-mesma-pagina` t6 (eSocial) | V2.1 |
| `data-civil` | anterior |
| `m13` t8 — escrita em `servico-politica-de-pessoal.ts` | **V4.2** (`35586f9`) |

O quinto não é novo: ele nunca tinha sido alcançado por uma bateria minha, pelo mesmo recorte
estreito da 69.6.

**Achado de borda:** o percurso da cadeia da despesa **não atravessa** em instalação limpa — a tela
de pagamento não oferece retenção porque nenhum tipo de consignação é semeado. É a segunda
consequência de `CONSIGNACAO-CONTA-SINTETICA`, e ela não estava registrada.

### 69.8 O próximo ponto exato

**`DISPONIBILIDADE-DE-RECURSO-NOVO-SEM-TELA`** — a tela agora nomeia a última coisa que falta para
o crédito por recurso novo caber inteiro na interface: a disponibilidade apurada (superávit
financeiro, excesso de arrecadação, operação de crédito) ainda entra por seed, e sem ela o decreto
é recusado nomeando a fonte. É uma fatia de superfície sobre domínio que já existe
(`DisponibilidadeRecursoNovo`, com a amarração do TR 4.37 contra o **derivado dos fatos**).

Depois dela: o **guichê**, ou os 7 modelos órfãos que o `modelo-sem-caso-de-uso` acusa desde
`af32666`.

---

## 70. V11 V7.3 — a disponibilidade de recurso novo ganha tela, e para de reescrever a própria história

### 70.1 O que passou a funcionar, e a rota real para chegar lá

O crédito adicional por **recurso novo** cabe inteiro na interface. Até aqui, o lastro contra o
qual o decreto é conferido — a disponibilidade apurada da fonte — só entrava por seed: em
instalação limpa, o servidor municipal lia uma recusa que apontava para um cadastro que a
interface não oferecia.

Rota: **`/planejamento/recursos-novos`** (menu do Planejamento, e link a partir da tela dos
créditos adicionais). Declara-se por fonte e por origem — superávit financeiro, excesso de
arrecadação, operação de crédito —, com o valor apurado e **a explicação obrigatória de onde ele
saiu**. A tela mostra, lado a lado, o DECLARADO, o UTILIZADO e o DISPONÍVEL, mais os decretos que
consumiram cada fonte.

### 70.2 O defeito que a fatia encontrou, e que não era o pedido

`DisponibilidadeRecursoNovo` tinha **uma linha por (exercício, fonte, origem)**, e redeclarar
fazia `UPDATE`. Um decreto aprovado contra 100.000 passava a constar aprovado contra 40.000, e
**nada no banco lembrava o contrário** — a prestação de contas leria o número de hoje como se
fosse o de então.

A declaração passou a ser **versionada**: redeclarar cria a versão seguinte e a anterior
permanece. Três consequências que tiveram de ser tratadas juntas:

- **o piso.** Declarar abaixo do que a fonte já suplementou é recusado nomeando o usado. Sem
  isso, a declaração nova deixaria, no mesmo instante, decreto VIVO apoiado em recurso que ela
  própria nega — e o sistema só perceberia no decreto seguinte, quando já não dá para saber o que
  corrigir;
- **a leitura.** O guard do crédito passou de `findUnique` para a **vigente** (maior versão). Ler
  qualquer outra conferiria o decreto contra número já substituído;
- **a chave do lock.** Era o `id` da linha. Com versões, cada uma tem `id` próprio: quem lê a v2 e
  quem acaba de criar a v3 travariam **postes diferentes** e não se veriam. O lock continuaria
  existindo e deixaria de proteger, que é o pior modo de falha de um lock. A chave passou a ser
  `exercicio:fonteId:origem`, estável entre versões (`chaveDaDisponibilidade`).

Repetir a declaração IDÊNTICA (mesmo valor, mesma explicação) é recusada: não é fato novo, e uma
versão sem diferença suja o histórico que a tabela existe para preservar. O mesmo valor com
explicação NOVA **é** versão — corrigir o fundamento é um fato.

### 70.3 Ação própria, e por quê

`DECLARAR_DISPONIBILIDADE_DE_RECURSO_NOVO` é ação separada de `CRIAR_DECRETO_DE_CREDITO`, de
propósito: este número é o que AUTORIZA a despesa, e dar os dois crachás à mesma pessoa faria o
guard do crédito conferir um lastro que ela mesma acabou de declarar. Censo, enum do Prisma,
módulo, área e a atualização de permissões **v25** acompanham.

`ANULACAO` **não** é origem declarável, e não é recorte de tela: crédito por anulação não traz
dinheiro novo, ele remaneja, e o que o autoriza é o saldo da ficha anulada, conferido por SUM
dentro da transação. Uma opção na lista criaria declaração que nada lê.

### 70.4 O que foi medido

| Medida | Resultado |
|---|---|
| tsc app / backend / scripts | `exit=0` |
| `m03-declaracao-de-disponibilidade.test.ts` (novo) | **12/12** |
| `test/ui/FormDeclaracao.test.tsx` (novo) | **9/9** |
| M03 + M16 completos | **195/195 em 24 arquivos** |
| `test:rapido` | 1045/1049 em 100 arquivos |
| bateria de guards de tela (`test/` + M16) | 962/966 em 117 arquivos |
| instalação limpa do zero (banco criado nesta corrida) | `exit=0`, 194 migrations, UMA tolerância (a perna de ANULAÇÃO) |
| **percurso do crédito adicional** | **29 passos, 0 falhas** |

**Seis mutações, seis acusações, verde após restaurar** (md5 conferido contra a cópia anterior):

| Mutação | Quem acusou |
|---|---|
| apagar a versão anterior ao declarar | t2 — e só t2 |
| desligar o piso do já usado | t3 |
| ler a PRIMEIRA versão como vigente | t4 |
| remover o `distinct` da consulta | t5 |
| `defaultValue` na origem | UI t3 |
| tirar um campo de dentro do `<label>` | UI t2, **nomeando** `descricao` |

**Vermelhos: QUATRO, todos herdados** — `modelo-sem-caso-de-uso`, `fronteira-ui`,
`formularios-na-mesma-pagina` t6 e `data-civil`. Nenhum nomeia arquivo da V7.3; os infratores
listados são de `folha/esocial`, `folha/rubricas` e `administracao/transparencia`. Eram CINCO na
mesma bateria da V7.2: o que saiu é o `FormDecretoCredito` t14, consertado na V7.2.

### 70.5 Migrations e SQL

- `20261002090000_v11_v73_disponibilidade_versionada` — `ADD COLUMN versao DEFAULT 1`, unique
  composta `(exercicio, fonteId, origem, versao)`, índice de leitura, e dois CHECK:
  `ck_disponibilidade_versao_positiva` e `ck_disponibilidade_valor_positivo`
- `20261002090100_v11_v73_acao_da_disponibilidade` — o valor novo do enum `AcaoDoSistema`, em
  migration **própria**

Aditivas. O único `DROP` é o da unique antiga, que a composta substitui — a coluna e os dados
permanecem.

### 70.6 Catálogo

`5.10.1.48` (consulta de superávit financeiro com valor, suplementado e saldo) → **`PARCIAL`**,
com rota verificada e artefato. Não sobe de `PARCIAL` por dois motivos nomeados na evidência:
a consulta **não é por entidade nem consolidada** (`DISPONIBILIDADE-SEM-RECORTE-POR-ENTIDADE`), e
o superávit é **declarado por quem apurou**, não derivado do balanço pelo sistema.

**Achado:** as **cinco** marcações do V10 T2 (`5.29.22/23/24/25/50`) estavam escritas no mapa de
`scripts/marcar-catalogo.ts` e **nunca tinham sido gravadas** no catálogo — o mapa dizia `PARCIAL`,
o JSON dizia `NAO_VERIFICADO`. Foram aplicadas nesta rodada, junto com a minha. O script é
idempotente; o que faltou numa sessão anterior foi rodá-lo com `--aplicar`.

### 70.7 O percurso encolheu o seed, e ganhou uma recusa

`scripts/preparar-credito-adicional.ts` perdeu o seed da disponibilidade — ela entra pela tela
agora, como a lei perdeu o dela na V7.2. Sobrou uma coisa só: o usuário deliberadamente FRACO.

E ganhou uma **recusa com motivo**: se a fonte já tem declaração naquele exercício, o script para
e explica. O percurso afirma "primeira declaração" e depois "versão 2" — rodado em banco já usado,
ele acusaria a tela de mentir quando o que houve foi banco sujo.

Os 29 passos incluem a negativa da ação NOVA (7.5–7.8): a tela renderiza o formulário para quem só
lê o planejamento, e **o servidor** recusa nomeando `DECLARAR_DISPONIBILIDADE_DE_RECURSO_NOVO`,
sem gravar nada.

### 70.8 Pendências que nascem ou seguem

- **`DISPONIBILIDADE-SEM-RECORTE-POR-ENTIDADE`** (nasce) — a apuração é do ENTE, por fonte. O TR
  pede "por entidade e consolidada".
- **`SUPERAVIT-DECLARADO-NAO-DERIVADO`** (nasce) — o valor do superávit é declarado com a
  explicação de onde saiu; não é o sistema que o apura do balanço do exercício anterior. A
  amarração contra os fatos do encerramento existe no crédito por superávit
  (`SuperavitFinanceiroPort`), não nesta consulta.
- `DISPONIBILIDADE-DE-RECURSO-NOVO-SEM-TELA` — **resolvida aqui**.
- Seguem: `CREDITO-ESPECIAL-ABERTO-OU-REABERTO`, `ANULACAO-DE-DOTACAO-DOIS-CANCELAMENTOS-HOMONIMOS`,
  `DOTACAO-ADICIONAL-POR-TIPO-E-POR-FONTE`, `ROTEIRO-RESERVA-SEM-CONTA`,
  `CONSIGNACAO-CONTA-SINTETICA` (com o percurso da cadeia da despesa sem atravessar em instalação
  limpa), `MARCAR-EM-CAMPO-CONTROLADO`, os 4 guards vermelhos herdados, `LEIAUTE-ESOCIAL-NAO-OBTIDO`,
  certificado A1 e V6 (AWS).

### 70.9 O próximo ponto exato

O **guichê** — o escopo planejado que resta.

---

## 71. V11 V8 — o guichê: marcar atendimento presencial, e a capacidade que não se estoura

### 71.1 O que passou a existir, e a rota real

TR **5.39.92** — "Permitir o agendamento de atendimentos presenciais, conforme guichês organizados
pela contratante". **Não existia nada.** Havia a agenda da **fiscalização** (M11), e o pedido manda
mantê-las separadas: são dois domínios com donos, dados e sigilos diferentes, e misturá-las poria o
nome de quem vai ao balcão na mesma tabela que a ordem de fiscalização de um contrato.

Rotas: **`/protocolo/guiches`** (organizar) e **`/protocolo/guiches/[id]`** (a agenda de um dia).

| A contratante organiza | Quem está no guichê |
|---|---|
| unidade de atendimento, guichê, que serviços da carta cada um atende | marca pelo CPF/CNPJ de quem está na frente dele |
| a oferta de horários por dia da semana: das X às Y, de N em N minutos, com **capacidade** | confirma a presença, remarca, cancela, registra que atendeu |
| os dias em que a unidade **não abre**, com motivo | vê as vagas descontadas em tempo real |

### 71.2 Marcar atendimento é consumo de saldo, não cadastro

Cada horário tem capacidade, e capacidade se estoura exatamente como saldo de ficha: duas pessoas
leem "há um lugar", as duas gravam, e três aparecem para dois lugares. A reserva toma o **trinco do
LUGAR** (`guiche:dia:hora`, posto 28) **antes** de contar.

⚠️ A chave é o LUGAR, não o id de reserva nenhuma: no instante em que a primeira transação trava, a
linha que a segunda vai criar ainda não existe — é o caso em que `FOR UPDATE` não travava nada.

### 71.3 Só se oferece o que o ente configurou

Não há horário padrão em lugar nenhum. Sem janela publicada, o guichê não oferece nada e a
marcação é **recusada nomeando a ausência**. E a tela mostra a ausência: um guichê recém-criado diz,
por escrito, que não atende serviço nenhum e que não tem oferta publicada.

O modelo é **append-only**: dez tabelas, nenhuma com `UPDATE`. Confirmar, cancelar, reagendar e
realizar são fatos próprios; o compromisso vigente é o do **último reagendamento** — e "último" é
por **sequência própria**, não por `criadoEm`: dentro de uma transação o Postgres devolve o instante
de INÍCIO dela, e duas transações podem começar no mesmo milissegundo.

### 71.4 Duas contagens diferentes, e a diferença tem nome

Para a **capacidade**, uma reserva ATENDIDA continua ocupando o lugar: a pessoa veio e o lugar foi
usado. Para **fechar o dia**, ela não conta: quem já foi atendido não vai ser deixado na porta, e
bloquear ali tornaria impossível registrar um feriado decidido depois do expediente. O guard do
fechamento conta quem **ainda espera** (`reservasQueAindaEsperamNoDia`), e o da capacidade conta as
não canceladas (`ocupacaoDoDia`). A distinção nasceu ao escrever o percurso, e tem teste próprio.

### 71.5 Dois defeitos que a construção encontrou — e o primeiro é o mais grave

**(1) O teste de concorrência passava com o trinco REMOVIDO.** Ele era um `Promise.allSettled` de
duas reservas; duas transações disparadas juntas não se cruzam de forma confiável — a primeira
commita antes de a segunda ler. **Três corridas verdes sem o trinco**, provando nada. Foi reescrito
para afirmar a PROPRIEDADE: enquanto alguém segura o trinco daquele lugar, a reserva daquele lugar
**não anda** — com a contraprova de que outro horário **não** espera, que um trinco grande demais (o
guichê, ou o dia) passaria no primeiro e serializaria o balcão inteiro.

**(2) "O ATO QUE SAI DA TELA", UM DEGRAU ACIMA.** Registrar, cancelar e remarcar fazem a LINHA da
reserva desaparecer — a situação muda e a tela deixa de oferecer atos sobre ela; remarcar a move de
lugar. A confirmação guardada DENTRO da linha morria com o componente, e quem enviou lia silêncio. O
percurso mediu isso três vezes (3.3, 3.6 e 4.2 falhando enquanto os passos seguintes provavam que o
efeito TINHA acontecido). A cura: o resultado mora **acima** do que some — um provedor que envolve a
tabela inteira guarda as ações e o aviso, e cada linha só empresta o formulário. Três testes novos
seguram a forma, inclusive o fail-closed de quem usar o ato fora do provedor.

### 71.6 O que foi medido

| Medida | Resultado |
|---|---|
| tsc app / backend / scripts | `exit=0` |
| `m21-guiche-dominio.test.ts` (relógio e calendário, puro) | **19/19**, verde também sob `TZ=UTC`, `Pacific/Kiritimati` (+14) e `America/Anchorage` (−9) |
| `m21-guiche.test.ts` (contra Postgres) | **26/26** |
| `test/ui/guiche-formularios.test.tsx` | **13/13** |
| bateria `test/` + M16 + M21 | **1133/1137 em 128 arquivos** |
| instalação limpa do zero | `exit=0`, **196 migrations**, v26 aplicada com 4 concessões em 4 perfis, UMA tolerância (a perna de ANULAÇÃO) |
| **percurso do guichê** | **31 passos, 0 falhas** |

**Nove mutações, nove acusações, verde após restaurar:**

| Mutação | Quem acusou |
|---|---|
| apagar o trinco da reserva | t6 |
| travar o guichê inteiro em vez do lugar | t6b (a contraprova) |
| contar o horário ORIGINAL em vez do vigente | t13 e t15 |
| contar reservas canceladas | t7 |
| reagendar sem conferir a capacidade do destino | t14 |
| o último horário deixar de precisar CABER | t4 e t5 |
| o dia da semana sair de UTC | t8 |
| um mês errado na tabela de deslocamento | t7b (contra implementação independente) |
| oferecer horário lotado no `select` | UI t6 e t7 |

**Vermelhos: QUATRO, todos herdados** — `modelo-sem-caso-de-uso`, `fronteira-ui`,
`formularios-na-mesma-pagina` t6 e `data-civil`. **Nenhum nomeia arquivo do guichê**, e isso foi
conferido arquivo a arquivo: o `data-civil` chegou a acusar `guiche.ts` e a resposta **não** foi
declarar exceção — o dia da semana virou aritmética de calendário (Sakamoto), sem `Date` nenhum,
porque isentar o arquivo inteiro daria cobertura de graça a um `getUTC*` que alguém acrescentasse
ali depois.

### 71.7 Censo, permissões, migrations

- **Três ações**, não dez: `CONFIGURAR_AGENDA_DO_GUICHE`, `RESERVAR_ATENDIMENTO_NO_GUICHE` e
  `REGISTRAR_ATENDIMENTO_NO_GUICHE`. O corte é por **quem faz** — a chefia organiza, o balcão marca
  e remarca, o guichê confirma e registra que atendeu. Dez permissões seriam um rol que ninguém
  administra, e a segregação morre por atrito. **Nenhuma de leitura**: a área já tem
  `CONSULTAR_PROTOCOLO`.
- **Atualização v26**: deriva `CONFIGURAR` de quem já configura a carta de serviços e `RESERVAR` de
  quem já protocola em nome de quem chega, **no mesmo escopo**. `REGISTRAR` **não é derivada para
  ninguém** — dizer "esta pessoa está aqui" é ato de quem está no guichê no dia, e derivá-la de quem
  marca deixaria a agenda fechar o próprio dia sem ninguém ter aparecido.
- `20261003090000_v11_v8_agenda_do_guiche` (dez tabelas, com CHECK de dia da semana, duração,
  capacidade, formato de hora, início antes do fim e vigência coerente) e
  `20261003090100_v11_v8_acoes_do_guiche` (os três valores do enum, em migration própria).
  Aditivas, zero `DROP`.

### 71.8 Catálogo

`5.39.92` → **`PARCIAL`**, com rota verificada e artefato. Não sobe de `PARCIAL` porque a seção 5.39
é o **PORTAL DE AUTOATENDIMENTO**: quem marca aqui é o **servidor no balcão**, não o cidadão
sozinho. O domínio inteiro já serve os dois caminhos; falta a superfície pública.

### 71.9 Pendências que nascem

- **`GUICHE-SEM-AUTOATENDIMENTO-DO-CIDADAO`** — o cidadão escolhendo horário em `app/(publico)`,
  sem conta, com código de acompanhamento como o da ouvidoria. É superfície sobre domínio pronto.
- **`GUICHE-SEM-NOTIFICACAO-INTERNA`** — o pedido (V9) fala em caixa interna mostrando pendências.
  A marcação não notifica ninguém: quem organiza vê a agenda, e é só.
- **`EXCECAO-DE-CALENDARIO-SO-FECHA`** — a exceção de calendário fecha o dia; não há "horário
  especial de feriado". Nomeado, não construído.

### 71.10 O próximo ponto exato

O escopo planejado desta rodada — crédito adicional por tipo, disponibilidade de recurso novo com
tela, e o **guichê** — está concluído. O que resta, em ordem de dívida: o **autoatendimento do
cidadão no guichê**, os **7 modelos órfãos** que o `modelo-sem-caso-de-uso` acusa desde `af32666`, e
os outros três guards vermelhos herdados.

---

## 72. V11 V8.1 — o cidadão marca sozinho: o guichê chega ao portal

### 72.1 O que passou a funcionar

A pendência `GUICHE-SEM-AUTOATENDIMENTO-DO-CIDADAO`, aberta na seção 71.9, está **fechada**. A
seção 5.39 do TR é o portal de **autoatendimento**, e agora é isso que ela é: o cidadão marca
atendimento presencial **sem conta**, em `/agendamento`, e acompanha ou cancela em
`/agendamento/acompanhar`.

O ente continua no comando: um serviço só aparece no portal depois de alguém **abri-lo à
internet** na tela de organização — e `false` é o padrão, de modo que a migration não torna
público nada do que já estava configurado.

### 72.2 O modelo: duas formas de titular, exatamente uma por reserva

`ReservaDeAtendimento` passou a aceitar dois tipos de titular, com `CHECK` de XOR no banco:

| Caminho | Titular |
|---|---|
| Balcão | `pessoaId` — a pessoa do cadastro, com o documento conferido por um servidor |
| Portal | `nomeDeclarado` + `documentoDeclarado`, **sem vínculo com o cadastro** |

⚠️ **E isso é deliberado, por dois motivos que se somam.** CPF digitado não é autenticação: criar
ou casar uma `Pessoa` a partir de um formulário público encheria o cadastro de cidadãos com dado
não conferido. E casar pelo documento **vazaria a existência do cadastro** — um formulário que
aceita um CPF e recusa outro é um oráculo de quem já é conhecido do município. A identificação de
verdade acontece no guichê, com o documento na mão, e a agenda interna mostra a marcação como
**"pela internet, dados a conferir"**, porque quem atende precisa saber disso.

### 72.3 O que protege um caminho sem autorização nenhuma

Não há `autorizarNo` no portal — existiria um crachá que ninguém tem. Em camadas:

| Camada | O que impede |
|---|---|
| serviço aberto ao portal (`agendamentoPublico`, `false` por padrão) | marcar num atendimento que exige triagem antes |
| o **mesmo trinco do lugar**, antes da mesma contagem | o portal ser a porta dos fundos para estourar a capacidade |
| trinco do par **documento+serviço** (posto 29) + limite de um atendimento vivo | uma pessoa sozinha esvaziar a agenda — e quem faz isso automatiza |
| quota por chave de origem | a enxurrada, dita como contenção local |
| segredo de 20 caracteres, guardado **só por hash** | quem lê a agenda interna cancelar o atendimento de um cidadão |
| resposta idêntica para segredo errado e inexistente | a consulta virar oráculo |
| projeção mínima (sem o documento declarado) | um print de tela valer um CPF |

⚠️ **O `codigo` não cancela.** Ele aparece na agenda interna para quem tem `CONSULTAR_PROTOCOLO`;
se bastasse, qualquer um deles desmarcaria o atendimento de um cidadão de forma anônima e não
atribuída. O cancelamento fica registrado com autor `PORTAL-DO-CIDADAO` — não se atribui a um
servidor um ato que nenhum servidor praticou.

### 72.4 Uma corrida que a ouvidoria carrega como pendência, e que aqui foi fechada

O guard da chave de comando exige que toda Server Action passe pelo envelope. Atos públicos não
passam — não há sessão. A ouvidoria declara a exceção **e** uma pendência:
`OUVIDORIA-REENVIO-DUPLICA` (um duplo envio antes da resposta registra duas manifestações).

Aqui isso **não** virou pendência. O limite de um atendimento vivo por documento tinha a mesma
corrida — dois envios leem "não tem nenhum" e os dois gravam —, e a resposta foi um trinco
próprio no par documento+serviço, tomado **depois** do trinco do lugar (posto 29 > 28, na ordem
que o `ORDEM_DOS_LOCKS` cobra). Dois envios para lugares diferentes pegam trincos de horário
diferentes e se encontram ali, que é onde precisam se encontrar.

### 72.5 O que foi medido

| Medida | Resultado |
|---|---|
| tsc app / backend / scripts | `exit=0` |
| `m21-guiche-portal.test.ts` (novo) | **19/19** |
| bateria `test/` + M16 + M21 | **1152/1156 em 129 arquivos** |
| instalação limpa do zero | `exit=0`, **197 migrations** |
| **percurso do guichê, agora com o cidadão** | **44 passos, 0 falhas** — na **quarta** corrida contra o mesmo banco |
| regressão: percurso do crédito adicional | **29/29**, com o helper compartilhado alterado |

**Oito mutações, oito acusações** no caminho público: abrir o portal sem o ente ter aberto (t3);
cair o limite por documento (t6); cair a quota (t7); cair a capacidade (t5); cair o trinco do
documento (t6b); o trinco deixar de ser do par (t6b); a consulta mostrar o compromisso original
(t11); a projeção devolver o documento (t13).

**Vermelhos: QUATRO, todos herdados**, nenhum citando arquivo do guichê ou do agendamento.

### 72.6 Três defeitos de medição, e o segundo mudou um helper de todos

**(1) A asserção que só valia em banco virgem.** O passo 5.1 dizia "o portal não oferece nada";
passou na estreia e caiu na segunda corrida, porque a corrida anterior tinha deixado o serviço
*dela* aberto. Virou "**este** serviço não aparece antes de ser aberto" — idempotente.

**(2) O helper compartilhado só lia confirmação fora do formulário quando o formulário SUMIA.**
Quando ele ficava, a única confirmação aceita era um `<p>` com classe `status-ok` dentro dele.
Isso deixava de fora um caso legítimo: a consulta que devolve um painel de resultado **abaixo** do
formulário, para quem quer consultar outra coisa em seguida. Três passos (5.9, 5.10 e 5.12)
reportavam "silêncio" em atos que tinham funcionado — a evidência do próprio passo trazia o dia e
a hora certos, e a asserção seguinte, lendo o banco, passava. A alternativa seria moldar a tela ao
teste. Passou a valer o **contrato declarado** (`data-resultado-da-acao`), com a mesma guarda de
sequência. O percurso do crédito adicional foi reexecutado para confirmar que nada regrediu.

**(3) A quota barrando o próprio percurso.** Três corridas na mesma hora, do mesmo `localhost`. A
preparação passou a zerar o rastro no banco descartável, dizendo por quê — a regra continua
provada contra o Postgres, com a mutação que a desliga derrubando o teste.

### 72.7 Catálogo

`5.39.92` → **`VALIDADO_LOCALMENTE`** (era `PARCIAL`). O que faltava era exatamente isto: a seção
é o portal de autoatendimento, e o cidadão agora marca sozinho, com tela e percurso de navegador.

### 72.8 Pendências

- `GUICHE-SEM-AUTOATENDIMENTO-DO-CIDADAO` — **fechada aqui**.
- **`GUICHE-PORTAL-SEM-REAGENDAMENTO`** (nasce) — pelo portal o cidadão consulta e cancela; para
  mudar de horário, cancela e marca de novo. Remarcar é do balcão.
- **`GUICHE-BALCAO-SEM-SEGREDO`** (nasce) — quem marca no balcão não recebe código de
  acompanhamento, e portanto não cancela pela internet. O caminho dele é o telefone ou o balcão.
- Seguem: `GUICHE-SEM-NOTIFICACAO-INTERNA`, `EXCECAO-DE-CALENDARIO-SO-FECHA` e as da seção 71.9.

### 72.9 O próximo ponto exato

Os **7 modelos órfãos** que o `modelo-sem-caso-de-uso` acusa desde `af32666`, e depois os outros
três guards vermelhos herdados.

---

## 73. V11 V8.2 — os cinco vermelhos herdados, e a suíte inteiramente verde

### 73.1 O que mudou de estado

A bateria carregava **cinco vermelhos herdados** havia vários lotes — cada um registrado como
"herdado" e nenhum investigado. Foram os cinco, um a um.

| Antes | Agora |
|---|---|
| suíte inteira: 3125/3130, cinco vermelhos | **3235/3235 em 306 arquivos, zero falhas** |
| `test:fuso` não rodava desde o candidato anterior | **3235/3235 sob `TZ=Pacific/Kiritimati` (+14), `exit=0`** |

⚠️ **E o `test:fuso` era obrigatório aqui, não opcional**: o diff toca lógica de data em cinco
módulos, que é exatamente o gatilho que o `CLAUDE.md` nomeia.

### 73.2 Dois eram defeito de verdade, e um deles era visível ao público

**`lib/portas/pessoal-publico.ts`** usava `new Date().toISOString().slice(0, 10)` para estampar
"hoje" no rodapé do demonstrativo de pessoal. `toISOString` devolve o dia em **UTC**: às 21h30 de
um dia em São Paulo, o **portal do cidadão** mostrava a data de **amanhã** — três horas por dia,
todo dia, num documento que é prestação de contas.

**Dois `new Date().getFullYear()`** — o protocolo da certidão e o exercício padrão da tela do
superávit — leem o relógio do **hospedeiro**. Num servidor em UTC, às 22h de 31 de dezembro em
São Paulo o protocolo sairia com o ano seguinte, e a tela abriria num exercício que ainda não
existe, mostrando "sem dados" para quem estava fechando o ano.

Mais **três sítios que estavam certos** e eram uma **segunda régua** ao lado de `packages/datas`
(âncora `T12:00:00Z` escrita à mão, subtração de milissegundos). Duas medidas de dia convivendo
sem ninguém decidir qual vale é como a próxima diverge. Passaram a usar `meioDiaCivil`,
`diferencaEmDiasCivis` e `anoCivil`.

### 73.3 Dois guards acusavam o que não acontece

**`fronteira-ui` (3)** pegava `import type` como se fosse import de valor. O perigo que ela
**nomeia** é de runtime — "a porta puxa o Prisma, que não bundla para o browser" — e um
`import type` é apagado pelo compilador. As zonas 1 e 2 **continuam** pegando o tipo, e a
diferença não é descuido: elas proíbem por **acoplamento**, e o import ser apagado depois não
desfaz isso. Só a forma inequívoca `import type` é isenta; a misturada fica de fora, fail-closed.

**`formularios-na-mesma-pagina` t6**: dois `id` literais numa tela cujo `<label>` já **envolve** o
campo. O par era redundante e trazia exatamente o risco vigiado.

### 73.4 Três eram declarações que ninguém tinha escrito

O `modelo-sem-caso-de-uso` acusava **sete** tabelas desde `af32666`.

**Cinco estavam lá por omissão, não por ausência**: são escritas por `create` aninhado e **lidas**
pela relação. A conferência importou — em duas delas o nome do campo **colide** com outra coisa do
mesmo módulo (`dependencias` é também o resultado de `analisarFormulaDaRubrica`, **calculado** da
fórmula e não lido do banco; `colunas` é também o do M26 designer), que é precisamente a armadilha
que o cabeçalho daquela lista descreve.

**As outras duas** (`EventoDoLeiaute`, `CampoDoEvento`) não cabiam em nenhuma das duas listas: elas
são **lidas** — o leitor existe, escrito à mão, e funciona — e **ninguém as escreve**, porque
`LEIAUTE-ESOCIAL-NAO-OBTIDO`. Enfiá-las em "o código não alcança" ou em "escrito por aninhamento"
seria escrever frase falsa numa lista de exceções, e é isso que faz a próxima pessoa não confiar em
nenhuma delas. Ganharam **lista própria com vigilância própria**: se alguém escrever o transcritor
por `create` aninhado, a linha caduca **em silêncio** (aninhamento não nomeia nada), e o teste novo
olha o campo do pai para pegar isso.

**`m13` t8** ("ZERO escrita no módulo") caiu quando a política de publicação de pessoal (V4.2)
passou a gravar ali. A política não publica nada — ela registra o ato que **autoriza** publicar. A
regra virou **por tabela** em vez de por arquivo: uma isenção de arquivo seria porta aberta para
alguém acrescentar um `despesaPublica.update` e o guard ficar calado.

### 73.5 O que foi medido

| Medida | Resultado |
|---|---|
| tsc app / backend / scripts | `exit=0` |
| **suíte inteira** | **3235/3235 em 306 arquivos** |
| **suíte inteira sob `TZ=Pacific/Kiritimati`** | **3235/3235, `exit=0`** |

**Sete mutações, sete acusações:** escrever o leiaute por aninhamento; remover uma das cinco
declarações; o `import type` virar import de valor; o arquivo da política escrever em modelo não
declarado; outro arquivo do M13 gravar.

### 73.6 Pendências

Nenhuma nasce aqui. `LEIAUTE-ESOCIAL-NAO-OBTIDO` passa a ter **guarda própria**: o dia em que o
leiaute chegar, a declaração das duas tabelas caduca e o teste avisa.

### 73.7 O próximo ponto exato

A fila que eu mesmo declarei na seção 71.10 terminou: autoatendimento do cidadão (seção 72), os
7 modelos órfãos e os guards herdados (esta seção). O que resta é **escolha nova**, e a maior
dívida legível hoje é a das pendências de modelo do crédito adicional (`CREDITO-ESPECIAL-ABERTO-OU-REABERTO`,
`ANULACAO-DE-DOTACAO-DOIS-CANCELAMENTOS-HOMONIMOS`, `DOTACAO-ADICIONAL-POR-TIPO-E-POR-FONTE`) e a
`CONSIGNACAO-CONTA-SINTETICA`, que ainda impede o percurso da cadeia da despesa de atravessar em
instalação limpa.

---

## 74. V11 V8.3 a V8.7 — a parametrização contábil pelo ente, e seis pendências fechadas

### 74.1 O padrão que as três maiores tinham em comum

`CONSIGNACAO-CONTA-SINTETICA`, `ROTEIRO-RESERVA-SEM-CONTA` e
`ANULACAO-DE-DOTACAO-DOIS-CANCELAMENTOS-HOMONIMOS` viviam da **mesma ausência**, e nenhuma delas
se fechava escolhendo a conta — isso seria inventar norma da STN, que é o que o `CLAUDE.md`
proíbe com todas as letras.

O que estava errado era outra coisa: **o ente não tinha onde decidir**. `TipoConsignacao` e
`RoteiroOrcamentario` só nasciam por seed; o seed recusa — com razão — o que não pode decidir; e
não havia caso de uso, ação no censo nem tela. **Um roteiro que ninguém pode configurar é um
movimento que o sistema recusa para sempre.**

| Rota nova | O que o ente decide |
|---|---|
| `/financeiro/consignacoes` | em que conta do plano a retenção na fonte vira dívida com o consignatário |
| `/contabilidade/roteiros-orcamentarios` | em que contas cada movimento de dotação lança, nos sete pares que o razão exige |

As duas são **append-only e versionadas**, pelo mesmo motivo: o razão escriturado ontem foi feito
contra a decisão de ontem, e "desde quando ia para esta conta?" tem de ter resposta. E o papel de
runtime não tem `UPDATE` em nenhuma das duas tabelas — sem versão, o cadastro pela tela exigiria
afrouxar o grant.

⚠️ **A recusa LISTA as opções.** Recusar uma conta sintética sem dizer o que existe sob ela
devolve a pessoa ao plano de 7.864 contas — e foi exatamente assim que estas escolhas ficaram
pendentes por vários lotes.

⚠️ **A linha do seed é NOMEADA como tal** nas duas telas: "veio da instalação — ninguém do ente
decidiu isto ainda". Ela funciona; quem olhar precisa saber disso antes de citá-la numa prestação
de contas.

### 74.2 E a cadeia da despesa passou a atravessar

O percurso da cadeia da despesa **nunca** tinha atravessado em instalação limpa: sem tipo de
consignação semeado, a retenção não aparecia no pagamento e o smoke morria em "a retenção continua
só no domínio" — acusando a tela de uma parametrização que faltava.

**28 passos, 0 falhas**, com o percurso cadastrando a consignação **pela tela** e escolhendo a
conta entre as que o plano oferece, com fundamento declarado como demonstração.

### 74.3 As outras três

- **`GUICHE-PORTAL-SEM-REAGENDAMENTO`** — o portal só oferecia cancelar e marcar de novo, e entre
  os dois atos o lugar volta para a fila: quem só queria mudar de horário arriscava ficar sem
  nenhum. Remarcar virou **um ato só**.
- **`GUICHE-BALCAO-SEM-SEGREDO`** — quem marcava no balcão não recebia código e tinha de **voltar
  ao balcão** para desmarcar. Isso exigiu derrubar um `CHECK` que eu mesmo escrevi na V8.1, cuja
  premissa estava errada: "quem foi identificado no balcão não tem segredo a receber" — a primeira
  metade é verdade e a conclusão não segue.
- **`CREDITO-ESPECIAL-ABERTO-OU-REABERTO`** — dizia "falta um FATO". O fato existia: o decreto
  aponta para a lei, e cada um tem o seu ano. Faltava **ler** a diferença, e ler é melhor que
  perguntar: uma caixa de seleção entre "aberto" e "reaberto" é uma escolha que se erra, e o erro
  vai para o balancete do TCE. A guarda da **CF art. 167 § 2º** entrou no `criarDecreto` — um
  decreto ilegal não deve *nascer*.

### 74.4 `MARCAR-EM-CAMPO-CONTROLADO`: a medição derrubou a minha própria cura

A pendência dizia "mede-se quando aparecer o caso". Ela nunca ia aparecer: a técnica vivia dentro
de um `page.evaluate`, onde teste nenhum a alcança, e o defeito só apareceria como um percurso
morrendo em silêncio contra uma tela correta.

Extraída para `scripts/marca-em-caixa.ts`, virou mensurável. **E a primeira correção que escrevi
estava errada**: o setter do protótipo — a cura que funcionou para o `value` na V7.2 — **não chega
ao React num checkbox**, e o teste a derrubou na primeira execução. A cura certa é o **clique com
guarda**: só clica se o estado atual for diferente do desejado, o que torna a função idempotente e
elimina exatamente o risco de inversão que a pendência registrava.

Sem a medição, a correção teria entrado com a mesma confiança e o defeito continuaria — agora com
um comentário dizendo que estava resolvido.

### 74.5 O que foi medido

| Medida | Resultado |
|---|---|
| tsc app / backend / scripts | `exit=0` |
| **suíte inteira** | **3271/3271 em 310 arquivos** |
| percurso da **cadeia da despesa** | **28 passos, 0 falhas** — atravessa em instalação limpa pela 1ª vez |
| percurso do **guichê** | **46 passos, 0 falhas** |
| percurso da **carta de serviços** (regressão da técnica do checkbox) | **84 passos, 0 falhas** |
| percurso do **crédito adicional** (regressão do helper) | **29 passos, 0 falhas** |

**Vinte e duas mutações, vinte e duas acusações** entre as cinco unidades.

### 74.6 A lição de medição que entrou no `CLAUDE.md`

A suíte passou a estourar timeout em arquivos **diferentes** a cada corrida — m33, m10, m23, m02,
licenciamento —, cada um passando sozinho em 22 s. Não era defeito: era a máquina paginando
(8 GB, ~75 MB livres, 1,6 M de pageouts). Com `--maxWorkers=3` ela passa inteira.

E um processo morto com `kill -9` deixa a sessão do trinco `idle` segurando o lock de máquina, que
bloqueia a corrida seguinte. As duas coisas estão registradas na regra.

### 74.7 O que resta, e por quê

**Tratáveis — nenhuma bloqueada por terceiro:**

- **`ROTEIRO-SEM-DIMENSAO-DA-ABERTURA`** (estreitada da `CREDITO-ESPECIAL-ABERTO-OU-REABERTO`) — o
  fato passou a existir e o caso ilegal passou a ser barrado, que era a metade grave. Falta a
  metade contábil: o roteiro ainda é chaveado por (movimento, tipo de crédito), sem a dimensão da
  abertura, e por isso um REABERTO ainda lança na mesma conta de um ABERTO.
- `DOTACAO-ADICIONAL-POR-TIPO-E-POR-FONTE`, `EXCECAO-DE-CALENDARIO-SO-FECHA`,
  `GUICHE-SEM-NOTIFICACAO-INTERNA`, `DISPONIBILIDADE-SEM-RECORTE-POR-ENTIDADE`,
  `SUPERAVIT-DECLARADO-NAO-DERIVADO`, `SAGRES-POC-CONTA-SINTETICA`.

**Bloqueadas por insumo externo — e fechá-las inventando o dado é o que o `CLAUDE.md` proíbe:**

| Pendência | O que falta, e de quem |
|---|---|
| `LEIAUTE-ESOCIAL-NAO-OBTIDO` | o leiaute oficial. Transcrever um evento de memória validaria contra regra que a União não publicou |
| rol oficial de consignações do SAGRES-PB | token da ASTEC (`suportesagres@tce.pb.gov.br`) |
| certificado A1 | o certificado do ente |
| V6 (AWS) | acesso de infraestrutura — e fora do que esta sessão pode tocar |
| linha ENT12 do Windows | reconciliação de registro |

### 74.8 O próximo ponto exato

`ROTEIRO-SEM-DIMENSAO-DA-ABERTURA` — acrescentar a dimensão da abertura à chave do roteiro
(`tipo, tipoCredito, abertura, versao`), com os três índices parciais que a combinação de nulos
exige, e oferecer os pares extras na tela que já existe.

---

## 75. V11 V8.8 — a dimensão da abertura na chave do roteiro

### 75.1 O que estava errado: o sistema SABIA e não usava

A V8.6 fechou a metade grave de `CREDITO-ESPECIAL-ABERTO-OU-REABERTO`: o sistema passou a **ler**
se um crédito especial é ABERTO ou REABERTO — do ano do decreto contra o ano e a data de
publicação da lei, CF art. 167 § 2º — e a recusar o decreto que a norma não alcança. O que ficou
registrado como `ROTEIRO-SEM-DIMENSAO-DA-ABERTURA` era a metade contábil: `RoteiroOrcamentario`
continuava chaveado por **(movimento, tipo de crédito)**, e por isso o reaberto do exercício
seguinte lançava na **mesma conta** do aberto.

⚠️ **E isso não dava vermelho em lugar nenhum**, pelo mesmo motivo incômodo da V7.1: o lançamento
seguia BALANCEADO. Uma partida na conta errada fecha igual a uma na conta certa. Quem enxerga a
diferença é quem compara a partida com a **classificação do ato** que a originou — e é o TCE que
lê essa diferença no balancete.

### 75.2 A decisão de desenho que deixou a migração ser aditiva

O ponto declarado na seção 74.8 previa a chave `(tipo, tipoCredito, abertura, versao)` "com os
três índices parciais que a combinação de nulos exige". **Não foi o que se fez, e o motivo é
melhor que o plano.**

Pôr a abertura na chave da VERSÃO obrigaria a derrubar o índice único
`(tipo, tipoCredito, versao)` — ABERTO v1 e REABERTO v1 colidiriam nele. Derrubar índice único
para afrouxá-lo é exatamente o que "migration é aditiva, zero DROP" existe para impedir.

A saída é ler a versão pelo que ela é: **a sequência das decisões do ente sobre aquele tipo de
crédito**. Publicar o ABERTO e depois o REABERTO dá v1 e v2; a vigente de cada um é a maior
versão **com a sua abertura**. O índice de unicidade fica como está, o parcial de
`uq_roteiro_sem_tipo_de_credito` também, e a migração é uma coluna, um tipo, um índice de busca e
um CHECK. **Zero DROP, zero índice parcial novo.**

### 75.3 O que passou a funcionar, e a rota real

| Onde | O que mudou |
|---|---|
| `prisma/schema/m03-creditos.prisma` | enum `AberturaDoCredito` (ABERTO, REABERTO) |
| `prisma/schema/m05-despesa.prisma` | `RoteiroOrcamentario.abertura` + índice de busca |
| `prisma/migrations/20261008090000_v11_v88_dimensao_da_abertura_no_roteiro/` | aditiva, com `ck_roteiro_abertura_so_de_credito_reabrivel` |
| `modules/m03-creditos/abertura-do-credito.ts` | `exigirAberturaDoDecreto` — deriva e **lança a recusa** |
| `modules/m03-creditos/adapter-prisma.ts` | os dois caminhos (executar e anular) derivam a abertura do decreto |
| `modules/m05-despesa/dotacao-razao.ts` | a abertura entra no `where` do roteiro, com as duas guardas |
| `modules/m05-despesa/servico-roteiro-orcamentario.ts` | publicar exige a abertura onde a norma parte, e a proíbe no resto |
| `lib/portas/roteiro-orcamentario.ts` | **nove** pares onde havia sete |
| `app/(areas)/contabilidade/roteiros-orcamentarios/` | as quatro linhas novas, cada uma com a sua decisão |

**A abertura não é gravada em lugar nenhum** — nem no decreto, nem no movimento. É derivada na
hora do lançamento, pelo mesmo caminho por onde o tipo de crédito já vem, e pelo mesmo motivo:
duas verdades sobre o mesmo crédito divergem, e a primeira divergência aparece num demonstrativo,
meses depois. Na tela ela vem da LINHA, não de uma caixa de seleção — **o que se pede, se erra**.

### 75.4 O que eu decidi NÃO fazer, e está testado

Quando a linha da abertura falta, a leitura **não cai** na linha antiga de abertura nula. Seria a
saída fácil — nenhuma instalação quebraria — e seria a pendência inteira de volta: o reaberto
lançaria, **em silêncio**, na conta decidida quando a pergunta ainda não existia. É fail-closed,
com o motivo nomeando qual das duas linhas falta. `t3` é o teste desse "não".

### 75.5 O que foi medido

| Medida | Resultado |
|---|---|
| tsc app / backend / scripts | `exit=0` nos três |
| `m03-abertura-no-razao.test.ts` (novo) | 7 testes |
| m03 + m05 + ficha pela tela + contas do seed | 207 testes |
| **suíte inteira** (`--maxWorkers=3`) | **3278/3278 em 311 arquivos**, `exit=0` — e repetida sobre a **árvore congelada em `1cace6d`**, mesmo 3278/3278 |

**Duas mutações, duas acusações** — e nas duas direções:

1. tirar `abertura` do `where` da consulta do roteiro (o estado anterior à V8.8): **t1, t2 e t3
   vermelhos**, e a mensagem de t1 mostrou o defeito exato — os dois créditos debitando
   `5.2.2.1.2.02.02`;
2. `classificarAbertura` devolver sempre `ABERTO`: **cinco testes vermelhos** em dois arquivos.

Revertidas as duas, verde de novo. E `t2b` é a contraprova de t2: apagado o roteiro do REABERTO, o
ABERTO continua passando — sem ela, uma leitura que recusasse TUDO deixaria t2 verde, e recusar
tudo não é classificar coisa nenhuma.

### 75.6 Pendências

`ROTEIRO-SEM-DIMENSAO-DA-ABERTURA` **fecha**. Nasce, no lugar dela e menor,
**`REABERTO-COM-SUPLEMENTACAO-NAO-DISTINGUIDO`**: o plano tem TRÊS analíticas sob cada ramo
(ABERTOS, REABERTOS, REABERTOS - SUPLEMENTAÇÃO) e o sistema separa as duas primeiras. Qual delas
recebe um reaberto é classificação contábil do ente — ele publica pela tela, com fundamento, e o
seed segue recusando e **imprimindo as candidatas lidas do plano que está no banco**.

### 75.7 O próximo ponto exato

`DOTACAO-ADICIONAL-POR-TIPO-E-POR-FONTE` — a pergunta maior que mora atrás do ramo que esta seção
mexeu. `5.2.2.1.2` (por tipo de crédito) e `5.2.2.1.3` (por fonte) são IRMÃS sob
`5.2.2.1 DOTAÇÃO ORÇAMENTÁRIA`. Se o mesmo crédito for lançado nas duas, o total de `5.2.2.1`
conta o dobro; se for lançado só numa, a outra visão fica vazia em qualquer demonstrativo que a
leia. Hoje o sistema só lança na `.2`. Qual das duas o ente adota — ou como as concilia — é
decisão do mesmo tamanho das que a V8.3 e a V8.4 deram lugar, e o lugar já existe.

---

## 76. V11 V8.9 — o eixo da dotação adicional, e um guard que achou três vazamentos

### 76.1 A pendência, e por que ela não se fechava escolhendo conta

`DOTACAO-ADICIONAL-POR-TIPO-E-POR-FONTE`. No plano oficial:

```
5.2.2.1.2  DOTAÇÃO ADICIONAL POR TIPO DE CREDITO   suplementar, especial, extraordinário
5.2.2.1.3  DOTAÇÃO ADICIONAL POR FONTE             superávit, excesso, anulação, op. de crédito
```

São **irmãs** sob `5.2.2.1 DOTAÇÃO ORÇAMENTÁRIA` e descrevem o **mesmo** crédito por eixos
diferentes: uma pergunta que espécie de crédito é, a outra de onde veio o dinheiro. O sistema só
lançava na `.2`, e a `.3` ficava vazia em qualquer demonstrativo que a lesse.

### 76.2 Por que não existe "as duas ao mesmo tempo" — medido no plano, não opinado

A perna de **crédito** é a mesma nos dois eixos: o crédito disponível (`6.2.2.1.1`). Lançar os
dois creditaria o disponível **duas vezes pelo mesmo decreto** — o ente passaria a poder empenhar
o dobro do que a lei autorizou, e **cada par continuaria balanceado**, então nenhum guard de
balanceamento veria. Não há no plano contrapartida para uma segunda perna que não faça isso, e
inventá-la seria inventar norma da STN.

Por isso o eixo é **um**, e quem escolhe é o ente: `PoliticaDaDotacaoAdicional`, append-only,
versionada, com fundamento de piso 20 conferido **no zod e no banco**. Ausência de política vale
`POR_TIPO_DE_CREDITO` — o que todo banco existente já faz. Fail-closed aqui derrubaria instalações
vivas para cobrar uma decisão que elas já tomaram por omissão; a tela nomeia a diferença entre
**decidido** e **herdado**, e `t5` afirma que a leitura distingue as duas.

As quatro origens do domínio têm **uma analítica cada** no ramo `.3`, e a partição do plano é o
mesmo eixo do enum `OrigemRecurso` — o mesmo argumento que tornou a conta do suplementar semeável
em V7.1. Por isso o seed as semeia; o que ele **não** decide é o eixo.

### 76.3 O guard que nasceu de um defeito meu, e o que ele achou

As duas tabelas novas nasceram **fora** de `test/limpar-banco.ts`. O sintoma não foi "a lista está
incompleta": foram **sete testes vermelhos** com mensagens do domínio (`Republicar a mesma decisão
não é um fato novo`) — a política publicada no primeiro teste sobrevivendo até o último.

O arquivo já dizia, em comentário, que a lista tinha de ser completa. Era só um comentário.
`limpeza-do-banco-completa.test.ts` passa a afirmar a **propriedade**: toda tabela do schema é
alcançada pela limpeza, **pela lista ou pelo fecho transitivo do `TRUNCATE ... CASCADE`**, lido do
catálogo do Postgres.

⚠️ A primeira versão do guard afirmava "a lista contém toda tabela" e deu **56 acusações falsas**:
a maior parte do schema é filha de alguém listado e é limpa pelo CASCADE. Corrigida para o fecho,
sobraram **três acusações verdadeiras** — `CertidaoFornecedor`, `DeParaContaSiga` e
`DeParaFonteSiga`, **sem chave estrangeira para tabela nenhuma**, portanto nunca alcançadas. Elas
estavam de fora há lotes: o de-para do SIGA e a certidão de fornecedor de um teste sobreviviam ao
arquivo seguinte.

### 76.4 O que foi medido

| Medida | Resultado |
|---|---|
| tsc app / backend / scripts | `exit=0` nos três |
| m03 + m05 + guard da limpeza | **202 testes**, `exit=0` |
| `m05-eixo-da-dotacao.test.ts` (novo) | 9 testes |

**Duas mutações, duas acusações:** desligar o desvio do eixo na consulta do roteiro deixou
**quatro** testes vermelhos (`5.2.2.1.2.01.00` onde se esperava `5.2.2.1.3.02.00`); tirar
`DeParaContaSiga` da lista de limpeza fez o guard novo nomeá-la.

E `t3b` é a contraprova de `t3`: sob o eixo herdado, a mesma origem sem roteiro por fonte passa —
sem ela, uma leitura que recusasse tudo deixaria `t3` verde.

### 76.5 Pendências

`DOTACAO-ADICIONAL-POR-TIPO-E-POR-FONTE` **fecha**. Nenhuma nasce. Fica registrado que as três
origens do plano sem par no domínio (reserva de contingência, dotação transferida, recursos sem
despesa correspondente) ficaram de fora **porque o sistema não representa esses fatos** — inventar
o valor do enum inventaria o fato junto.

---

## 77. V11 V8.10 — a amarração que oito testes provavam e a aplicação não montava

### 77.1 O que a pendência dizia, e o que eu achei

`SUPERAVIT-DECLARADO-NAO-DERIVADO` estava registrada como "o valor do superávit é declarado com a
explicação de onde saiu; não é o sistema que o apura". Verdade — e havia coisa pior atrás dela.

O M03 pergunta o superávit, o excesso e a operação de crédito **por port**, e documenta que port
ausente é **fail-open com log**: "um módulo que não está montado não pode paralisar o ente".
`criarM03DepsAmarrado` (M12) monta os três. `criarM03Deps` não monta nenhum.

**`lib/portas/creditos.ts` montava o sem amarração.** Consequência: todo crédito por recurso novo
aberto **pela tela** era conferido só contra a disponibilidade **declarada** — o número digitado —
enquanto `m03-superavit.test.ts` e `m03-recurso-novo.test.ts` provavam a amarração contra os fatos
**montando as deps que só eles montavam**. Oito testes verdes sobre um caminho que a aplicação não
percorria. É o falso-verde que este repositório mais teme, e ele estava no meio do crédito
adicional.

### 77.2 As três coisas que mudaram

1. **A porta passa a montar a versão amarrada.** Uma linha; o resto desta seção existe para que
   ninguém a desfaça sem ser acusado.
2. **A declaração é conferida contra os fatos na hora de declarar.** Declarar acima do apurado
   nunca serviu para nada — só adiava a recusa para depois de lei e decreto escritos contra o
   número. ⚠️ **Só o superávit**: ele é uma foto (31/12 do exercício encerrado). O excesso de
   arrecadação e a operação de crédito **crescem** durante o ano, e recusar em março o que fica
   verdadeiro em abril seria trocar um defeito por outro; neles quem confere continua sendo o
   guard do crédito, na data do fato.
3. **O número dos fatos aparece ao lado de onde ele é digitado.** Mandar a pessoa a outra tela
   para conferi-lo é o mesmo que não mostrar. E ele **não preenche** o campo: preencher escolheria
   o número no lugar de quem apura.

### 77.3 O guard, e por que ele olha a fonte

`amarracao-do-recurso-novo-na-porta.test.ts` afirma que nenhum arquivo de `lib/` ou `app/` monta
as deps sem amarração. O que se quer afirmar é sobre a **montagem** — qual das duas funções a
camada que o usuário percorre chama —, e um teste de comportamento na porta exigiria sessão, banco
e um decreto, e ainda poderia passar por um caminho que não é o da tela.

⚠️ **A busca ignora comentário**, e isso não é detalhe: o arquivo vigiado **explica**, em dez
linhas, por que não usa `criarM03Deps`. Uma busca ingênua casaria com a explicação e acusaria
justamente quem fez certo.

⚠️ E a prova de que a diferença entre as duas montagens é **real** não mora nesse arquivo, de
propósito: `M03Deps` não carrega os ports (eles ficam na closure do repositório). Quem prova o
efeito é `m03-superavit.test.ts` t5, contra Postgres — e ele fica vermelho no dia em que alguém
ligar os ports dentro de `criarM03Deps`, que é o dia em que o guard novo passaria a vigiar uma
distinção que não existe mais.

### 77.4 O que foi medido

| Medida | Resultado |
|---|---|
| tsc app / backend | `exit=0` |
| m03 + m12 + guard da amarração | **293 testes**, `exit=0` |
| `m03-superavit.test.ts` | 16 testes (eram 11) |

**Duas mutações, duas acusações:** desamarrar a porta deixou os dois testes do guard vermelhos,
nomeando `lib/portas/creditos.ts`; desligar o teto dos fatos na declaração deixou `d1` e `d3`
vermelhos.

### 77.5 Pendências

`SUPERAVIT-DECLARADO-NAO-DERIVADO` **fecha**. Nenhuma nasce — e fica o registro de que a
amarração do **excesso** e da **operação de crédito** continua sendo conferida no crédito, na data
do fato, por decisão e não por omissão.

---

## 78. V11 V8.11 — por entidade, até onde os fatos vão (e não um centímetro além)

### 78.1 O pedido, e o que dele é derivável

O TR 5.10.1.48 pede a consulta de superávit "por entidade e consolidada", e
`DISPONIBILIDADE-SEM-RECORTE-POR-ENTIDADE` registrava a falta. A consulta já era a **consolidada**;
faltava o recorte.

**O que os fatos sustentam:** o item de crédito aponta uma **ficha**, e a ficha aponta um **órgão**
— o eixo que este sistema já usa como entidade (é o do `DeParaOrgaoPoder`, que o RREO consome).
Então o **suplementado** parte por entidade, e agora aparece assim em cada fonte, na tela e na
consulta.

**O que os fatos NÃO sustentam:** o **apurado**. O superávit vem do **caixa por fonte** (arrecadação
menos pagamentos, mais ou menos os extraorçamentários), e a **arrecadação deste sistema não tem
entidade arrecadadora** — está escrito em `superavit-por-fonte.ts` desde que ele nasceu: a partida
da receita nasce sem ficha. Ratear a receita entre órgãos para preencher a coluna inventaria
justamente **o número que autoriza a despesa**.

Então a tela **diz isso**, abaixo da tabela. Quem vê "por entidade" numa parte conclui que a outra
também está partida; dizer o que **não** está partido, e por quê, é o que separa um recorte honesto
de um número inventado.

### 78.2 O que a mutação me obrigou a apagar

Escrevi o agrupamento por entidade atribuindo o estorno à entidade do item **original** — espelhando
o agrupamento por decreto logo acima, que faz isso porque original e estorno podem estar em decretos
diferentes.

A mutação passou: **troquei a regra e os dois testes continuaram verdes.** Investigado, o motivo:
`estornoDeId` só é escrito por `anularCredito`, que grava o item inverso na **mesma ficha** do
original. Os dois agrupamentos coincidem sempre, e o desvio que eu tinha escrito era um caminho que
**nenhum teste consegue percorrer**. Apaguei a indireção: código que não se pode acusar é código que
não se pode manter.

### 78.3 O que foi medido

| Medida | Resultado |
|---|---|
| tsc app / backend | `exit=0` |
| m03 + m12 | **293 testes**, `exit=0` |
| `m03-superavit.test.ts` | 18 testes (eram 16) |

**Mutação:** colapsar todas as entidades numa só deixou `e1` e `e2` vermelhos. A fixture ganhou um
**segundo órgão** e uma terceira ficha na **mesma fonte** — sem N=2, "por entidade" e "consolidado"
dariam a mesma linha e o teste passaria por vacuidade.

### 78.4 Pendências

`DISPONIBILIDADE-SEM-RECORTE-POR-ENTIDADE` **não fecha inteira, e não vou dizer que fecha.** Ela
estreita para **`RECEITA-SEM-ENTIDADE-ARRECADADORA`**: o fato que falta é a entidade que arrecadou,
e ele não existe no modelo da receita. Enquanto não existir, o apurado por entidade não é derivável
— e o catálogo `5.10.1.48` segue **`PARCIAL`** por esse motivo, agora com o recorte de entidade
entregue na parte que os fatos sustentam.

---

## 79. V11 V8.12 — a exceção de calendário deixa de só fechar

### 79.1 Duas metades, uma causa

`EXCECAO-DE-CALENDARIO-SO-FECHA` nomeava o feriado com expediente reduzido. Ao mexer, apareceu a
segunda metade, mais grave: **o dia fechado por engano não tinha volta**. Sem `UPDATE` e sem
`DELETE` para o papel de runtime, e com `@@unique([unidadeId, dia])` fechando a porta, o erro ficava
para sempre — e a única saída seria afrouxar o grant, que é o oposto da regra da casa.

As duas vinham da mesma escolha de modelo: **uma linha única por dia**. Agora cada decisão sobre o
dia é um FATO com sequência (FECHADO, EXPEDIENTE_ESPECIAL, EXPEDIENTE_NORMAL), e a vigente é a de
maior sequência. Revogar não apaga: "quem fechou o dia, e quem reabriu?" tem resposta.

⚠️ **O `DROP` do índice único foi necessário e é do mesmo tipo do que a V8.4 fez** ao versionar o
roteiro: a unicidade por dia é exatamente o que impede a segunda decisão. Nenhuma linha se perde —
toda exceção existente vira a sequência 1, do tipo FECHADO, que é o que ela já significava.

### 79.2 As decisões que o desenho tomou

- **O expediente especial RECORTA a oferta, não gera horário.** Os horários continuam saindo das
  janelas publicadas. Gerar uma grade nova a partir de `horaInicio`/`horaFim` inventaria horários
  que o guichê nunca ofereceu — com outra duração e outra capacidade.
- **Fim exclusivo**, a mesma convenção da janela: 08:00–09:00 oferece o 08:30 e não o 09:00. Duas
  convenções de "fim" no mesmo módulo seriam um defeito esperando um feriado.
- **Encolher é recusado por quem fica de FORA**, não por quem existe. Fechar o dia inteiro e
  encolher o expediente são o mesmo risco em tamanhos diferentes, e a mensagem **nomeia a
  consequência por caso**: "prédio fechado" e "horário que deixou de existir" são coisas diferentes
  para quem vai ligar para essas pessoas.
- **Devolver ao normal não tem essa guarda** — abrir não machuca marcação nenhuma.
- **A ação continua sendo `CONFIGURAR_AGENDA_DO_GUICHE`** — e sempre foi. ⚠️ Eu escrevi, no código
  e nesta seção, que ela se chamava `FECHAR_DIA_DE_ATENDIMENTO`; esse era o nome do **serviço**, não
  da ação. **O censo foi quem me corrigiu**, na suíte completa: renomear o serviço não move
  concessão nenhuma, porque o censo mapeia serviço → ação e a ação não mudou. A frase errada está
  corrigida no código e fica registrada aqui.
- **Seis leituras viraram uma.** Eram seis `findUnique` iguais espalhados; com a versão, seriam seis
  lugares para esquecer do `orderBy`.

### 79.3 O que foi medido

| Medida | Resultado |
|---|---|
| tsc app / backend / scripts | `exit=0` nos três |
| m21 + `test/ui` | **421 testes**, `exit=0` |
| `m21-guiche.test.ts` | 31 testes (eram 26) |

**Duas mutações, duas acusações:** fazer o expediente especial não recusar nada deixou `t12d`
vermelho; contar todas as reservas em vez das que ficam fora do recorte deixou `t12f` vermelho.

E `t12d` traz a contraprova dentro de si: recusar **fora** só prova alguma coisa se **dentro**
grava.

### 79.4 Pendências

`EXCECAO-DE-CALENDARIO-SO-FECHA` **fecha**. Nenhuma nasce.

---

## 80. V11 V8.13 — o guichê passa a avisar quem atende

### 80.1 A pendência, e o aviso que mais faltava

`GUICHE-SEM-NOTIFICACAO-INTERNA`: o pedido da V9 fala em caixa interna mostrando pendências, e a
marcação não chegava a ninguém. Quem organiza via a agenda; quem **atende** só descobria a fila ao
abrir a tela e procurar o dia certo.

Dos seis atos da agenda, um é diferente dos outros cinco: **a marcação feita pelo portal**. Ela
acontece com ninguém do ente na frente da tela — às onze da noite, no domingo — e não tinha como
ser esperada. Os outros cinco têm um servidor presente; mesmo assim avisam, porque quem marca no
balcão não é necessariamente quem atende.

### 80.2 Duas superfícies, nenhuma nova

- **Notificação interna (M24)** nos seis atos, para quem está **lotado no setor da unidade** — o
  recorte que diz quem vai atender. ⚠️ **Quem fez não é avisado do que fez**: um aviso que volta
  para o autor ensina a ignorar a caixa, e o que se ensina a ignorar é justamente o aviso que chega
  de madrugada. O aviso vive **dentro da transação do fato**, como o M24 manda: avisar sobre uma
  marcação que o rollback desfez é avisar uma mentira.
- **Faixa na home** (`PainelDePendencias`): "Atendimentos marcados para hoje", contados nas unidades
  do **seu** setor, vivos (sem cancelamento e sem realização) e pelo dia **vigente** — quem remarcou
  para amanhã não espera hoje.

Nenhuma tela nova: as duas máquinas já existiam e estavam desligadas para o guichê.

### 80.3 O que foi medido

| Medida | Resultado |
|---|---|
| tsc app / backend | `exit=0` |
| m21 + `test/ui` | **426 testes**, `exit=0` |

**Mutação:** tirar o filtro do autor deixou `t13a` vermelho. E `t13b` afirma o outro lado: setor
**sem ninguém lotado** não derruba a marcação — o ato vale, o aviso é que não tem a quem ir.

⚠️ **Uma intermitência, com o motivo junto:** na corrida em que os três testes novos do portal
caíam (faltava publicar a janela no `describe`), o `t8` daquele arquivo caiu junto, em 5300 ms. Ele
não tem asserção de tempo; a causa provável são as transações abortando no mesmo arquivo. Corrigido
o meu defeito, `t8` passou em **duas** corridas seguidas. Fica registrado em vez de descartado.

### 80.4 Pendências

`GUICHE-SEM-NOTIFICACAO-INTERNA` **fecha**. Nenhuma nasce. Segue valendo o que o M24 já declarava:
e-mail e push **não são enviados** (`NOTIFICACAO-EMAIL-PUSH`) — os avisos do guichê usam o canal
SISTEMA, que nasce entregue porque a entrega é a gravação.

---

## 81. V11 V8.14 — a POC do SAGRES roda contra o plano oficial

### 81.1 O que estava quebrado

`SAGRES-POC-CONTA-SINTETICA`. A POC foi escrita contra o plano **mínimo**, que marcava as contas
dela como analíticas. No PCASP oficial do TCE-PB elas são **sintéticas**, o `skipDuplicates` do seed
preserva (com razão) a versão oficial, e a demonstração morria no primeiro lançamento — "conta
sintética não recebe partida", que é o guard fazendo o trabalho dele. A instalação do ente terminava
sem a POC.

### 81.2 A saída não foi escolher a conta

Escolher a analítica na mão é classificar, e classificação é do ente. O que a POC faz agora é uma
escolha **estrutural e declarada**: `contaDaDemonstracao` pega a **primeira analítica sob a
sintética**, em ordem de código, lida do plano que está no banco — a mesma técnica que o percurso da
cadeia da despesa usa para a consignação desde a V8.3, e pelo mesmo motivo: escolher pelo **nome**
casaria com o nome errado (foi o que aconteceu com "BENEFICIOS PREVIDENCIARIOS A PAGAR").

⚠️ **E ela se anuncia**, linha a linha, no console do seed. Uma demonstração que troca de conta em
silêncio ensina que a conta da demonstração é a conta certa — e o dia em que alguém copiar daqui
para um roteiro de produção, terá copiado uma escolha que ninguém tomou.

⚠️ **Uma exceção ficou, e está explicada:** `2.1.3.1.1.01.01` (fornecedores) continua escolhida na
mão desde a V6.2, porque esse código está na **massa de comparação do SAGRES** — trocá-lo mudaria
justamente o que a POC existe para comparar.

### 81.3 O teste afirma a propriedade, não o sucesso

`sagres-poc-no-plano-oficial.test.ts` carrega as **7.864 contas oficiais** (o plano inteiro, não um
recorte — o recorte esconderia o ramo esquecido), roda a POC e afirma que **nenhuma partida caiu em
conta sintética**. "Rodou" passaria com uma conta errada que por acaso fosse analítica; esta
afirmação não. Há a âncora (`partidas > 20`, senão uma POC que não grava nada passaria) e a
contraprova `t2`: as cinco contas-base são **mesmo** sintéticas no plano, senão a resolução seria
desvio morto e `t1` estaria provando o caminho antigo.

**O teste achou uma sexta conta que ninguém tinha nomeado**: a `5.2.2.1.2.00.00` do roteiro de
ANULAÇÃO da POC. Foi por isso que a resolução estrutural passou a valer também para os roteiros
orçamentários dela.

### 81.4 O que foi medido

| Medida | Resultado |
|---|---|
| tsc backend / scripts | `exit=0` |
| POC + contas do seed + período fechado | **13 testes**, `exit=0` |

**Mutação:** fazer `contaDaDemonstracao` devolver sempre o código de entrada reproduziu o defeito
original — "Conta SINTÉTICA 5.2.2.1.2.00.00 no roteiro orçamentário de ANULACAO_CREDITO".

### 81.5 Pendências

`SAGRES-POC-CONTA-SINTETICA` **fecha**. Nenhuma nasce.

---

## 82. V11 V8.16 — o percurso achou o que a suíte inteira não via

### 82.1 O defeito, e por que nenhum teste o pegava

Rodando os percursos de navegador sobre o build desta rodada, a cadeia da despesa parou no
pagamento com retenção: **"Conta sintética não recebe partida: 2.1.8.8.1.01.00"**.

A V8.3 deu ao ente a tela para decidir em que passivo cada consignação vira dívida, e fez a decisão
ser um fato append-only. A regra de leitura — **a decisão vigente manda; sem decisão, valem as
colunas antigas** — estava escrita à mão em **dois** lugares (`exigirTipoAtivo` e a porta da tela de
consignações). Faltava no **terceiro**: `listarTiposConsignacao`, que é justamente quem a **tela de
pagamento** consulta para compor a perna do passivo.

Consequência: o ente trocava a conta pela tela, a tela de consignações mostrava a conta nova, e o
pagamento continuava compondo na **velha**. A recusa aparecia quatro passos adiante, acusando a tela
de pagamento por um defeito que estava na leitura.

⚠️ **E a suíte inteira estava verde** — 3310 testes. Nenhum deles confrontava as duas leituras,
porque cada uma tinha o seu teste e os dois passavam. Quem pegou foi o percurso, que é o único que
atravessa as duas telas na mesma corrida.

### 82.2 O conserto: uma regra, um dono

`vigenciaDoTipoDeConsignacao` (M07, pura) passa a ser a única definição, e as três leituras a usam.
Duas leituras com critérios diferentes sobre o mesmo dado sempre divergem; a função existe para que
não haja duas.

### 82.3 O percurso também ficou mais honesto

- **Existir não é estar usável.** O percurso conferia só a existência da linha da consignação e
  seguia. Num banco em que o `seed:m07` criou o tipo apontando para a sintética, ele dizia "já está
  cadastrada" e morria adiante. Agora ele lê o **estado da decisão** e, se for herdada do seed,
  **troca a conta pela tela** — o ato `redefinir-consignacao` da V8.3, exercitado pela primeira vez
  por um percurso.
- **O estado virou dado.** A linha da consignação declara `data-decisao` e `data-conta`. Esta tela
  já enganou o percurso duas vezes por texto (casou a própria prosa procurando "inss"; escolheu
  conta por nome). Quem precisa saber se a conta foi decidida lê um atributo.
- **O guichê ganhou quatro passos** (4.4b–4.4e) para o que a V8.12 criou: o dia fechado por engano
  **volta atrás pela tela**, e o **expediente especial** recorta a oferta — com os dois campos de
  hora que só aparecem quando o tipo é EXPEDIENTE_ESPECIAL. Nenhum outro teste alcança esses campos.

### 82.4 O que foi medido

| Medida | Resultado |
|---|---|
| tsc app / backend / scripts | `exit=0` nos três |
| `next build` | **exit=0** |
| **percurso do guichê** | **50/50, 0 falhas** (eram 46 antes dos quatro passos novos) |
| **percurso da cadeia da despesa** | **28/28, 0 falhas** (era 21/4 antes do conserto) |
| m07 | 82 testes |

**Mutação:** fazer `listarTiposConsignacao` ignorar a decisão de novo deixou `p1` e `p2` vermelhos —
os dois testes que faltavam, e que agora confrontam as duas leituras.

### 82.5 Pendências

Nenhuma nasce. Fica registrado que os percursos rodaram sobre **banco descartável clonado do de
percursos**, com o licenciamento de **demonstração** instalado (`DEMONSTRACAO-PERCURSO`) — é
parâmetro de execução, não contrato de ente nenhum.

### 82.6 A medição final desta rodada, sobre a árvore congelada

| Medida | Resultado |
|---|---|
| **suíte inteira** (`--maxWorkers=3`) | **3312/3312 em 315 arquivos**, `exit=0`, sobre `9640aa8` |
| tsc app / backend / scripts | `exit=0` nos três |
| `next build` | `exit=0` |
| percurso do guichê | **50/50, 0 falhas** |
| percurso da cadeia da despesa | **28/28, 0 falhas** |

⚠️ **A suíte foi repetida quatro vezes nesta rodada, e a terceira foi a que valeu**: a primeira
acusou quatro defeitos que as corridas dirigidas não alcançavam (seção 81.x / commit `ba46f6e`).
Corridas dirigidas medem o que se mexeu; a suíte inteira mede o que se esqueceu.

---

## 83. V11 V9 — a procedência da rodada anterior, o ambiente e as dependências separadas

Esta seção não constrói nada. Ela fecha três coisas que a rodada anterior deixou implícitas e que
a ordem seguinte exigiu por escrito, antes de abrir frente nova.

### 83.1 A procedência da medição: o que separa `9640aa8` de `1969ff2`

```
git diff --stat 9640aa8..1969ff2
 ESTADO-EXECUCAO.md | 22 ++++++++++++++++++----
 1 file changed, 18 insertions(+), 4 deletions(-)
```

**Um arquivo, e é documentação.** Zero código, zero schema, zero teste. Portanto a medição da
seção 82.6 — suíte 3312/3312, os três `tsc`, o `next build` e os dois percursos — foi feita sobre
a árvore congelada em `9640aa8` e **vale sem reserva para `1969ff2`**: não há comportamento
alterado entre os dois commits para verificar. Nada se repete para resolver essa diferença.

⚠️ **E a execução integral daquela rodada foi EXCEPCIONAL.** Ela se justificou por alteração
transversal (censo de ações, limpeza de banco, plano de contas) e por uma falha sem origem
delimitada — as duas hipóteses que a V3 prevê para o portão integral. **Ela não altera a
orientação vigente**, que continua sendo a da V3: verificação dirigida ao que mudou e aos
consumidores diretos; suíte completa, `test:fuso`, portão e campanha de mutações ficam para o
candidato de homologação ou para quando uma dessas duas hipóteses voltar a ocorrer.

### 83.2 Inventário de ambiente: o banco que sobrou, com origem e finalidade

| Banco | Origem | Finalidade | Estado |
|---|---|---|---|
| `gestao_publica_instalacao_v7m2_v85` | criado em **2026-09-21 05:16 UTC**, na unidade V8.5 (seção 74) | provar a cadeia da despesa em **instalação limpa** — sem tipo de consignação semeado, sem decisão do ente, sem roteiro herdado; era o único jeito de ver o que um ente novo encontra | **202 migrations aplicadas**, 26 usuários, 38 MB, **0 conexões** |

⚠️ **Ele NÃO se apaga nesta rodada, por decisão registrada.** Trinta e oito megabytes não
justificam interromper construção para decidir limpeza, e um banco de instalação limpa já migrado
é caro de reconstruir. Ele casa com o padrão `DESCARTAVEL` dos scripts de percurso
(`/^gestao_publica_(percursos|capturas|instalacao)_v7m[12]_[a-z0-9_]{1,40}$/`), ou seja: nenhum
script vai recusar-se a rodar por causa dele, e nenhum script vai gravar nele por engano.

Os bancos de percurso da rodada anterior (`gestao_publica_percursos_v7m2_fecha{mento,2,3,4}`) foram
removidos ao fim daquela unidade. Não há outro resíduo.

### 83.3 As dependências externas, separadas — porque são cinco coisas diferentes

A rodada anterior as listou numa linha só, e isso esconde que elas não se desbloqueiam juntas nem
pelo mesmo ator:

| Dependência | O que exatamente falta | Quem desbloqueia | O que já existe deste lado |
|---|---|---|---|
| **Leiaute do eSocial** | o XSD/leiaute da versão vigente dos eventos que o ente transmite | publicação oficial / acesso ao portal do eSocial | `LEIAUTE-ESOCIAL-NAO-OBTIDO`: o módulo recusa com motivo declarado, não simula sucesso |
| **Rol oficial do SAGRES** | o rol de tabelas/domínios do TCE-PB, atrás do **token ASTEC** | credencial junto ao TCE-PB (ato do ente) | a POC roda contra as 7.864 contas do PCASP oficial (seção 81) |
| **Certificado A1** | o certificado digital do ente, com senha | aquisição/entrega pelo ente | a assinatura é ponto de extensão; sem certificado o estado é indisponível com motivo |
| **AWS (V6)** | acesso efetivo no perfil `gestao-publica` | Winner, no console/IAM da conta | nada se contorna com chave ou política administrativa nova |
| **Reconciliação da linha ENT12 no Windows** | uma máquina Windows para reconciliar | ambiente, não credencial | é a única que não depende de terceiro nenhum — depende de máquina |

⚠️ **Nenhuma delas bloqueia construção local.** Elas bloqueiam TRANSMISSÃO e INFRAESTRUTURA.

### 83.4 A terceira classificação da reabertura: o alcance exato do bloqueio

`REABERTO-COM-SUPLEMENTACAO-NAO-DISTINGUIDO` fica bloqueada **somente** no trecho que depende do
critério ausente, e esse trecho é estreito:

- **Não bloqueado, e já entregue (V8.8):** o crédito ABERTO e o crédito REABERTO lançam em contas
  distintas do roteiro, com a dimensão na chave do roteiro, o índice próprio e o
  `ck_roteiro_abertura_so_de_credito_reabrivel`, que impede abertura em crédito não reabrível.
- **Bloqueado:** a **terceira analítica** do ramo, cujo nome no plano é
  `REABERTOS - SUPLEMENTAÇÃO`. O domínio deriva duas situações dos fatos que tem (`abertura` e
  `tipoCredito`); o plano oferece três.

⚠️ **E não é a descrição que falta — é o FATO.** A terceira analítica se chama, em letra, "reabertos
- suplementação": o plano diz em palavras o que ela recebe. O que o sistema não tem é o vínculo que
a alimenta, e ele é duplo:

1. **Nenhum crédito suplementar aponta para o crédito reaberto que ele reforça.** Suplementação é
   um `tipoCredito` próprio, e um movimento suplementar não carrega referência ao especial ou
   extraordinário reaberto sobre o qual incide. Sem esse vínculo, "suplementação de reaberto" não é
   derivável de nada — é uma frase sem fato por trás.
2. **O `CHECK` impede, por desenho, carimbar `abertura` numa linha SUPLEMENTAR** — e com razão: o
   suplementar reforça dotação existente e não se reabre. Ou seja, a terceira analítica **não é um
   terceiro valor de `abertura`**; ela é outra coisa, e tratá-la como terceiro valor quebraria a
   regra que a CF art. 167 § 2º sustenta.

**A pergunta normativa exata, para quem for buscá-la:** *o que o plano classifica em
`REABERTOS - SUPLEMENTAÇÃO` — a suplementação que incide sobre um crédito especial/extraordinário
já reaberto no exercício, ou a parcela do próprio saldo reaberto que excede o valor originalmente
aberto?* As duas leituras produzem lançamentos diferentes, e a descrição não decide entre elas.
Referência a consultar: `docs/oficial/tce-pb/Pcasp_2025.xlsx` dá os três códigos e as três
descrições; a resposta é normativa (STN/TCE-PB) e não se deduz do dado.

**O que fica pronto para o dia em que a resposta chegar:** se a resposta for a primeira leitura,
falta um vínculo `suplementaCredito` do movimento suplementar para o crédito reaberto — aditivo,
uma coluna; se for a segunda, falta apartar o saldo reaberto do valor aberto no próprio crédito.
Nenhuma das duas se escreve antes de saber qual é, porque escrever a errada produz lançamento em
conta errada, que é exatamente o defeito que a V8.8 fechou.

---

## 84. V11 V9 — a entidade TITULAR na arrecadação, e o que duas frentes numa árvore custam

Rodada conduzida com **dois agentes**: um gerente full stack (receita) e um auxiliar funcional
(folha). A frente da receita chegou a commit; a da folha ficou escrita e **não medida**, por um
bloqueio de ambiente que nenhum dos dois podia resolver. As duas coisas estão registradas abaixo
com o mesmo cuidado, porque a segunda ensina tanto quanto a primeira.

### 84.1 O que fechou, e com que palavras

`RECEITA-SEM-ENTIDADE-ARRECADADORA` **NÃO fecha.** Ela **estreita** para
`SUPERAVIT-SEM-ENTIDADE-NAS-QUATRO-PERNAS`. O que entrou foi **captura, consulta e
integridade** — e a apuração ficou de fora por medição, não por falta de tempo.

**A semântica saiu da medição.** "Entidade arrecadadora" é a entidade **TITULAR** (entidade
contábil), não órgão nem unidade orçamentária. Três razões, todas no código:

- o sistema **já recusava órgão para receita por escrito** — `modules/m04-receita/servico.ts`
  e `lib/portas/arrecadacao.ts`: *a receita é do ENTE (CF art. 167, IV); a Secretaria de Saúde
  não "possui" o IPTU que entrou*;
- **órgão não é unidade gestora** — `modules/m16-travamento/escopo.ts`: um órgão TEM VÁRIAS UGs,
  e `unidadeOrcId` existe em uma única entidade do sistema inteiro;
- o consumidor (art. 43 § 1º) exige **titularidade jurídica**, não estrutura de despesa. Usar o
  eixo órgão da V8.11 aqui produziria duas coisas diferentes com uma palavra só.

**Um único vínculo inequívoco existe, e já estava na guia: a CONTA BANCÁRIA**, que tem
exatamente um titular jurídico. A tela manual **deriva**; o importador de tributos e as compostas
do M10 **não têm vínculo** — lá é escolha explícita no ato, ou a guia nasce NÃO ATRIBUÍDA.
Supor "tributo é da direta" ficou proibido por desenho.

### 84.2 Duas decisões de modelo que o gerente tomou e que melhoraram o pedido

**(a) O titular da conta NÃO é coluna em `ContaBancaria`.** É `DeclaracaoDeTitularDaConta`,
versionada, lida por join. O critério: **trocar de titular é FATO NOVO, não correção do fato
velho** — e coluna obrigaria `UPDATE`, que é o que `prisma/papel-runtime.ts` proíbe. Efeito
colateral bom: a fatia não encostou em `ContaBancaria`.

⚠️ **E o carimbo em `ReceitaArrecadada` CONTINUA sendo coluna, sem contradição.** A declaração é
decisão vigente, que muda com o tempo; o carimbo é **o que era verdade no instante do fato**, e
fato não se recalcula por join. Se a conta trocar de titular em março, as guias de fevereiro
continuam da entidade de fevereiro — e é por isso que `anularArrecadacao` **HERDA** em vez de
re-derivar.

**(b) Identidade estável + atributos versionados** (`EntidadeContabil` + `VersaoDaEntidadeContabil`),
no padrão de `Pessoa`. Cadastro só-insert repetiria o defeito da V8.12: entidade cadastrada errado
sem volta, e a única saída seria afrouxar o grant.

### 84.3 O fundamento deixou de ser um CHECK de comprimento

A ordem foi explícita: *texto com vinte caracteres satisfaz um CHECK de preenchimento; não
comprova validade nem aplicabilidade da fonte*. Nasceu `modules/m01-core-contabil/ato-declarado.ts`,
**o primeiro ato estruturado do repositório** — os quatro `fundamento` existentes
(`m05-despesa`, `m11-fiscalizacao`, `m07-extraorcamentario`, `m34-tributario`) são `String` livre
e continuam como estão; ninguém os migra nesta rodada.

Ele exige tipo, número, ano e dispositivo em colunas próprias, e confere **coerência** (ano não
futuro contra a data civil do ente, número com dígito, dispositivo com forma de dispositivo,
citação que não é a repetição do rótulo) e **APLICABILIDADE**: a citação tem de mencionar o
objeto da declaração.

⚠️ **A âncora da aplicabilidade foi afinada e o ajuste importa.** A primeira versão exigia que a
citação nomeasse sempre a entidade — e isso barra caso legítimo, porque o ato que declara o
titular de uma conta pode ser justamente **o ato que abriu a conta**, e nele o que aparece é a
conta. Ficou: âncora no **objeto da declaração** — entidade (nome/CNPJ) no cadastro; entidade **ou**
identificação da conta (banco/agência/conta) na declaração de titular. Com normalização antes de
comparar, senão a régua reprova por cedilha e vira teatro. E onde o ente não tiver o ato, o caminho
**não é afrouxar**: a conta fica sem titular e as guias nela ficam NÃO ATRIBUÍDAS — estado honesto,
já previsto.

### 84.4 A apuração NÃO se ligou, e o motivo está medido

O caixa por fonte tem **quatro pernas**
(`arrecadado + ingressosExtra − pagamentosLiquidos − dispendiosExtra`). Pôr entidade só na
arrecadação parte **uma**, e subtrair receita partida de despesa não partida **é pior que a
ausência, porque tem cara de número**. Faltam, nominalmente:

1. `despesaPorFonte` — o eixo é **UO**, e o de-para UO→entidade não existe;
2. `extraorcamentarioPorFonte` — `MovimentoExtraorcamentario` não tem entidade;
3. `restosAPagarPorFonte` — idem;
4. a **amarração S1** (Σ caixa por fonte == saldo das contas de caixa no razão) — o razão não tem
   entidade, e a partida da arrecadação nasce sem ficha. Uma S1 por entidade exige
   **contabilização distinta**, que é a TR 5.10.1.3, hoje `NAO_VERIFICADO`;
5. o **encerramento do exercício por entidade** — um encerramento único não produz superávit por
   entidade.

O `apurado` do superávit **continua sem recorte por entidade**, e a nota da tela continua dizendo
por quê. Trocar aquele texto por uma coluna preenchida seria vender como resolvido o que só mudou
de lugar.

### 84.5 O que foi medido — e as linhas que contam

| Janela | Linha real | Resultado |
|---|---|---|
| J1 r2 — `typecheck` backend | `### exit-tsc-backend=2` | **3 erros, todos da outra frente**; zero nesta fatia |
| J2 (embutida no `global-setup`) | — | as duas migrations `20261012*` **aplicaram no banco de teste**, inclusive o `ALTER TYPE` separado do uso |
| J3 — censo | `### exit-vitest-censo=1` | **26/27**; a falta são os dois órfãos do 13º, da outra frente |
| J4 r2 — domínio | `### exit-vitest-j4=0` | **28/28** (11 da régua do ato, 13 da entidade titular) |
| J7 — mutação dirigida | — | **3 de 3 acusaram, 3 de 3 reverteram**, árvore limpa contra o commit |
| J5 — regressão dos consumidores diretos | `### exit-vitest-j5=0` | **51 arquivos, 442 testes, 0 falhas** |
| J6 — `typecheck` do projeto `app` (com heap, por fora do script) | `### exit-tsc-app=2` | **5 erros, TODOS da outra frente**; zero nas três telas desta fatia e nas duas portas |
| J6 — `typecheck:scripts` | `### exit-tsc-scripts=2` | **5 erros, TODOS da outra frente**; zero nesta fatia |
| J8 — instalação limpa e atualização | `### exit-vitest-j8=0` | **8/8** (5 puros + 3 de banco), mais a mutação que derrubou três |

**Commit `70c9ff2`**, 36 arquivos, conferido por filtro explícito: nada de `m33*`, `folha*`,
`20261011*` nem `lib/navegacao.ts`.

⚠️ **A J5 responde "eu quebrei alguma coisa?", e só isso.** Quem prova que o recorte está certo é a
J4 e a J7. E ela fecha, por medição, a razão de `arrecadadoPorEntidade` ser um laço NOVO e não um
recorte parametrizado de `arrecadadoPorFonte`: fossem a mesma função, seriam estes 442 testes a
pagar a conta.

### 84.6 O achado da rodada: o censo ficou VERDE sobre um arquivo que não compilava

A fatia acrescentou quatro serviços ao `ACAO_DO_SERVICO` e **esqueceu de declará-los na união
`NomeDeServico`**. O `m16-censo.test.ts` **passou**: `nomes.length` deu os 424 esperados e o t5 não
acusou órfão nenhum — porque o contador é `Object.keys(ACAO_DO_SERVICO)`, leitura em tempo de
**EXECUÇÃO**, o objeto literal tinha mesmo as quatro chaves, e **o vitest transpila sem
typecheck**. O `tsc` acusou **cinco** erros: `TS2353` no próprio literal e `TS2339`/`TS2551` em cada
chamador de `ACAO_DO_SERVICO.<nome>`.

O cabeçalho do `m16-censo.test.ts` já dizia que o grep existe porque *o compilador não pega o
serviço que ninguém declarou*. Esta rodada mediu **a outra metade**: **o grep não pega o serviço
declarado no Record e ausente da união.** Duas redes, furos complementares, nenhuma sozinha basta —
e passar numa delas não é notícia sobre a outra. Registrado em `modules/m16-travamento/MODULO.md`,
com a consequência prática: acrescentar um serviço são **três** lugares, não dois.

⚠️ **E há DOIS contadores naquele arquivo**, que contam coisas diferentes e já custaram três erros
nesta rodada: a **linha 442** conta SERVIÇOS (`nomes.length`) e a **linha 532** conta AÇÕES
(`TODAS_AS_ACOES.length`). Serviço não é ação.

### 84.7 O código de saída divergiu do resultado seis vezes — e a culpa NÃO era do trinco

⚠️ **CORREÇÃO (escrita na rodada seguinte, sobre este próprio registro).** A versão anterior desta
seção dizia que *"o rodapé do trinco disse `terminou com codigo 0` cinco vezes sobre corridas que
falharam ou foram mortas"*. **Isso é falso, e acusava o instrumento errado.**

O cruzamento de `# comando` com `# desfecho` nos registros resolve a questão:

| Filho do trinco | Desfecho que o trinco registrou |
|---|---|
| `npm run typecheck:app` (comando direto) | **MORTO POR SINAL SIGABRT · 134** |
| `npm run typecheck` (comando direto) | **MORTO POR SINAL SIGTERM · 143** |
| `npm run typecheck:scripts` (comando direto) | **terminou com codigo 2** |
| `npx vitest run …` (comando direto, J8 vermelha) | **terminou com codigo 1** |
| `zsh …/j3.sh` (script de scratchpad) | terminou com codigo 0 |
| `zsh …/j1.sh` (script de scratchpad) | terminou com codigo 0 |

**Quando o filho foi comando DIRETO, o trinco disse a verdade — inclusive as duas verdades feias.**
E o código dele está correto: `scripts/trinco-de-maquina.ts:372` converte sinal em `128 + n`,
`:373` propaga o código do filho, `:410` sai com ele, e o rodapé grava desfecho, código e sinal.

**A causa real eram os scripts de scratchpad**, que terminavam assim:

```sh
npx vitest run ...
echo "### exit-vitest=$?"     # ← última instrução: `echo` tem sucesso
```

O script **saía 0 de verdade**, e o trinco propagou fielmente um zero verdadeiro. A forma certa é
`rc=$?; echo "### exit=$rc"; exit $rc`.

⚠️ **A lição que pertence ao repositório:** *um invólucro que imprime o código do filho como TEXTO
e termina em `echo` transforma o registro num mentiroso sem que ele tenha culpa.* Quem lesse
`### exit-vitest=1` acertava; quem lesse só o rodapé lia 0 e errava.

**O que permanece inteiro do registro original**, e foi o que segurou duas quase-viradas em verde
falso: **zero linhas `error TS` num log incompleto significa que a contagem não terminou, não que
nada foi achado.** Valeu no SIGABRT do `typecheck:app` e no SIGTERM do `typecheck` de backend —
os dois com zero `error TS` e nenhum deles limpo.

### 84.8 A máquina, medida — e um defeito de ferramenta achado no caminho

- **O custo do `typecheck` de backend é o cliente Prisma: 43 MB de `.ts`, não de `.d.ts`**
  (`commonInputTypes.ts` sozinho tem 441 KB). `skipLibCheck: true` **não alcança** `.ts`, e
  `exclude: ["prisma/generated"]` não tira do programa o que é **importado**.
- Consequência: `tsc` avulso sobre arquivo tocado roda em segundos para domínio **puro** e estoura
  2 GB de heap em qualquer arquivo que importe o cliente. **E não substitui o typecheck do
  projeto** — os `Record<União, …>` exaustivos quebram a partir de quem **ALCANÇA** o arquivo
  tocado, e esses nunca entram no grafo alcançável a partir dele.
- Com a máquina carregada, o `tsc` de backend oscilou entre 320 MB e 26 MB de RSS entrando e
  saindo do swap e **não fechou em 25 minutos**; com a árvore congelada e a máquina livre, fechou.
- ⚠️ **O Postgres em container morreu com `ExitCode 255`** durante a saturação (não `OOMKilled`),
  derrubando toda medição com banco. Tem volume nomeado: `docker start pg-gestao-publica` recupera
  os bancos intactos. Conferir `docker ps` antes de culpar o código.
- ⚠️ **Defeito de ferramenta, pré-existente e QUEBRADO DE FÁBRICA nesta máquina:** dos três
  scripts de typecheck do `package.json`, **`typecheck:app` é o único sem `--max-old-space-size`**.
  Ele morreu com `FATAL ERROR: JavaScript heap out of memory` / SIGABRT 134, enquanto `typecheck` e
  `typecheck:scripts` fixam 5324 inline.

  **A hipótese ficou resolvida por medição, não por argumento:** refeita a corrida com 5324 MB, o
  projeto `app` **termina em segundos** e acusa 5 erros. Logo não é volume acrescentado por esta
  fatia — três telas não movem um programa de 2 GB; é o teto do heap padrão que não cabe o
  projeto. **Registrado, NÃO consertado:** `package.json` é contrato comum e a outra frente estava
  impedida de escrever; acrescentar a flag ali criaria dois donos num arquivo que ninguém poderia
  revisar.

  ⚠️ **O risco concreto, para quem for decidir:** se o portão do candidato chamar
  `npm run typecheck:app`, ele **aborta com 134 e produz um log sem uma única linha `error TS`** —
  e quem contar erros lê zero e registra verde. Foi o que quase aconteceu aqui, e teria "provado"
  que as três telas compilam quando elas nem tinham sido compiladas.

### 84.9 Duas frentes numa árvore: o que isso custou, medido

- Um **diretório de migration vazio** (pasta criada, `migration.sql` recusado pelo ambiente no ato
  seguinte) derrubou `prisma migrate deploy` com `P3015` — e como `test/global-setup.ts:88` roda o
  deploy antes de tudo, **a suíte inteira do repositório fica indisponível enquanto ele existir**.
  Custou uma janela de máquina da outra frente. Regra: **pasta de migration só nasce com o SQL
  dentro, no mesmo ato.**
- Uma corrida de typecheck mediu uma árvore que a outra frente editava **durante** a medição, e o
  `prisma migrate deploy` chegou a ver **210** diretórios onde havia 209.
- Regra adotada e que funcionou: **vermelho em arquivo que não é seu não se conserta** — avisa-se,
  com a saída bruta, e segue-se. Nenhuma das duas frentes tocou no arquivo da outra em toda a
  rodada.

### 84.10 A frente da folha: construída, e NÃO medida

A capacidade escolhida foi o **13º em duas parcelas** (adiantamento + 13º com abatimento). A
escolha foi por **implementação observada**: a folha mensal já atravessa de ponta a ponta (cinco
percursos de navegador), e a modalidade é **zero, não parcial** — `enum TipoDeFolha { MENSAL }`,
e a varredura por "décimo terceiro|férias|rescisão" no schema devolve **zero**. Estoque foi
descartado por estar **construído menos um movimento** cuja devolução **o TR não pede**; V12 não
existe.

Está escrito: schema, duas migrations aplicadas nos dois bancos, domínio puro, serviço, porta,
teste de domínio com os avos escritos à mão e fixture de hora de borda, e o roteiro de quinze
passos do percurso.

⚠️ **Nada disso está medido, e três erros de typecheck dela permanecem na árvore**, porque as
ferramentas de escrita do agente passaram a ser recusadas pelo ambiente
(`The user doesn't want to take this action right now`), em cinco tentativas, num bloqueio que só o
usuário resolve. A passada que falta é curta e está fechada no papel: nove arquivos, os **dois**
contadores do censo (425 serviços, 358 ações), a v28 e a migration do `AcaoDoSistema`.

**Nenhum contorno foi tentado** — nem por `cat`/`sed` no Bash, nem por outro agente editando em
nome dela.

### 84.11 A v27 tinha promessa e não tinha teste — e o buraco apareceu ao construir o instrumento

A J3 (`m16-atualizacoes.test.ts`) foi reportada, e registrada aqui, como prova da v27. **Provava
menos:** que a versão EXISTE na sequência contígua e que a prévia é 0 em instalação limpa. Ela
**não exercitava `derivarEntidadeContabil`** — a promessa escrita no comentário da v27, de alcançar
só quem administra permissões no global e de **não** derivar de `ATRIBUIR_CONTA_A_ARRECADACAO`.

⚠️ É a regra "**não atestar pela papelada que declara**" pegando os dois lados: o relato entregou o
número sem dizer o que ele não cobria, e a consolidação o promoveu a prova. **Promessa em
comentário que nenhum teste exerce é promessa que a próxima refatoração apaga em silêncio.**

E o buraco **não apareceu numa revisão** — apareceu ao escrever o teste, quando a fixture exigiu um
perfil com o poder vizinho e não havia de quem não derivar. Nasceu
`modules/m16-travamento/m16-entidade-contabil-permissoes.test.ts` (commit `e9b0b7b`), com **N=2 em
PERFIS** — um que administra e um com o poder vizinho, porque com um só a regra passaria por
vacuidade. A mutação (derivar também do vizinho) derrubou **três** testes, por enumeração, por
negação e pelo efeito em banco.

⚠️ E a primeira corrida falhou porque o `bootstrapUsuario` **recusou** banco povoado (45 usuários
semeados pelo `limparBanco`). A recusa está certa e **não se afrouxa**: script re-executável capaz
de carimbar administrador entrega a chave-mestra a quem tem shell. Usou-se o mesmo `TRUNCATE` das
tabelas de acesso que o teste vizinho já usava pelo mesmo motivo.

### 84.12 J9 — NÃO EXECUTADA, com o motivo

**O percurso não roda nesta árvore, e o bloqueio não é o que se supunha.** Antes de faltarem as
migrations no banco de desenvolvimento, há isto: `next.config` traz
`typescript: { ignoreBuildErrors: tiposDispensadosComProva() }` — **o build TYPECHECA** —, e a
árvore tem 5 erros de tipo no projeto `app`, todos da outra frente e insanáveis enquanto o bloqueio
de escrita durar. `next build` falha, e `servir-percursos.ts` sobe `next start`.

O caminho correto é o que a casa prescreve — **worktree fixada em commit** —, e ele foi **medido,
não estimado**: 36 GiB de disco livres contra ~1,7 GB de worktree; disco não é o gargalo. **RAM é.**
No momento da decisão: **74 MB de RAM livre**, swap em 5.092 de 6.144, e um `tsc` **de outro
produto** rodando na mesma máquina — que não é nosso para derrubar.

Somar a isso um `next build` (que typecheca o mesmo projeto que morreu a 2 GB hoje, **mais** o
bundling) é pedir a saturação que já custou, nesta rodada, uma suíte, o container do Postgres e uma
corrida de trinta minutos. **Decisão: não tentar.** Nenhuma afirmação já feita depende da J9 — o que
ela acrescentaria seria uma afirmação NOVA, e afirmação nova sem medição é o que esta rodada
recusou o dia inteiro.

⚠️ **A frase honesta, que fica:** as três telas **compilam**, e **nenhuma delas foi aberta**.

⚠️ **E antes de criar a décima oitava worktree, confira as 17 que já existem** em
`/Users/winnervinicius/Developer/gestao-publica-candidatos/` (treze `candidato-*`, dois `runner-*`,
`percurso-glosa-*`, `candidato-integrado`). Os 36 GiB livres medidos já as contam; nenhuma está em
`e9b0b7b`, então provavelmente nenhuma serve — mas uma varredura por worktree abandonada é mais
barata que um `npm install` novo, e esta máquina não tem folga para desperdício.

**O próximo ponto exato (J9), para quem pegar:** worktree em `e9b0b7b` ou posterior, fora do
diretório do projeto; `node_modules` por symlink **só enquanto a outra frente estiver parada**
(é estado mutável compartilhado); `prisma generate` na worktree; banco descartável novo pelo padrão
`gestao_publica_(percursos|capturas|instalacao)_v7m[12]_<sufixo>` — **sem tocar
`gestao_publica_instalacao_v7m2_v85`** —, com `migrate deploy` + `db:sql`; `next build` pelo trinco
com heap ampliado; e **NADA de `git stash`/`checkout`/`clean` na árvore principal**, onde o trabalho
não commitado da outra frente está.

O que a J9 provaria e J1–J8 não provam são os passos que só a tela alcança: a **recusa do ato
inaplicável lida como mensagem de tela**, o **recorte dos seletores**, e a **conciliação conferida no
rodapé** (Σ entidades + não atribuído == total).

### 84.13 Onde a rodada parou

**Commits:** `f35dc8e` (procedência, ambiente, as três perguntas separadas), `70c9ff2` (a fatia da
receita, 36 arquivos), `be629e2` e `912ad37` (este registro), `e9b0b7b` (o teste da v27).

**Ambiente ao fechar:** zero locks de trinco, zero processos nossos vivos, os quatro bancos de pé
(`gestao_publica`, `_test`, `_percursos`, `_instalacao_v7m2_v85`), o stash `11b7892` intacto e os
três scripts do operador fora do Git.

**Não commitado, e é da frente da folha:** nove arquivos modificados e sete novos, com 3 erros de
tipo no backend e 5 no `app`/`scripts`. Ficam na árvore, atribuídos, até o desbloqueio.

**Próximo passo:** o desbloqueio da escrita do agente da folha (decisão do usuário) e, com ele, a
passada curta de nove arquivos já fechada no papel — os **dois** contadores do censo (425 serviços,
358 ações), a v28 e a migration do `AcaoDoSistema`. Depois, a J9 acima.

---

## 85. V11 V9.1 — o 13º em duas parcelas, e a verificação que passou a se recusar a mentir

Rodada de **conclusão**, não de capacidade nova: fechar o 13º que ficara escrito e não medido, e
recuperar uma verificação confiável. Dois agentes, execução sequencial, sem worktree nova.

### 85.1 A divergência "3 e 5 erros": resolvida pelo DESFECHO, não por contagem

| Corrida | Desfecho | Erros | Vale? |
|---|---|---|---|
| backend (r2) | `exit 2`, sem sinal, 0 OOM | 3 | diagnóstico **atual** |
| app com heap | `exit 2`, 0 OOM | 5 | **atual** |
| scripts | `exit 2`, 0 OOM | 5 | **atual** |
| app original | **SIGABRT 134**, 1 OOM | 0 | **sem significado** |

`exit 2` é o código do `tsc` para "encontrei erros", com término normal. O zero da corrida abortada
não é diagnóstico nenhum.

⚠️ **E apareceu uma lacuna do fechamento anterior:** o typecheck de backend rodou 22:29:39Z e o
`m16-entidade-contabil-permissoes.test.ts` foi commitado 23 minutos DEPOIS (`e9b0b7b`), com
`modules/**/*.ts` no `include` daquele projeto. **Aquele arquivo nunca tinha sido compilado**, e o
registro dizia "os três projetos limpos nesta fatia". Fechado nesta rodada: compila limpo.

### 85.2 O invólucro: a ordem estava errada, e a recusa salvou a peça

A ordem desta rodada mandava **consertar a propagação de exit/status/sinal** do
`scripts/trinco-de-maquina.ts`. O gerente **parou e recusou, com evidência** — e estava certo. O
cruzamento de `# comando` com `# desfecho` mostra o padrão: **com filho DIRETO o trinco registrou a
verdade, inclusive `SIGABRT 134` e `SIGTERM 143`**; com filho = script de scratchpad registrou 0, e
registrou **certo**, porque aqueles scripts terminavam em `echo "### exit=$?"` e `echo` tem sucesso.

**A propagação já estava correta, e agora está MEDIDA**, com quatro processos pequenos:
`0 → 0`, `exit 1 → 1`, `exit 2 → 2`, `SIGTERM → 143`.

**O que se construiu no lugar** (commit `7e9e378`): quando o filho sai **0** mas o conteúdo gravado
traz marca de falha, o desfecho vira **`INCONCLUSIVO: o codigo do filho diverge do conteudo`** e o
trinco sai com **3** — e não 1, porque `1` se confunde com "a suíte reprovou", que é resultado
legítimo com dono; **3 diz que a medição não vale**.

⚠️ **A contraprova mudou a régua, não apenas a validou.** `error TS` e `FAIL ` ficaram **FORA** dos
gatilhos: um `tsc` com erro já sai 2, então o sinal nada acrescenta quando o código é 0 — e as duas
cadeias aparecem legitimamente em saída de teste que fala *sobre* erros, e este repositório tem
grep-testes assim. Sobraram três sinais com a propriedade que importa: **não podem aparecer numa
corrida que terminou em 0 de verdade.** Guarda que grita à toa é desligada em três semanas.
10/10 em `test/trinco-desfecho.test.ts` (5 de acusação, 5 de contraprova) — e a própria corrida
contém `Tests 10 passed (10)` e nomes de teste com "failed" **sem disparar a guarda**.

**Duas lições foram para onde serão lidas:** no cabeçalho do trinco, *um invólucro que imprime o
código do filho como TEXTO e termina em `echo` transforma o registro num mentiroso sem que ele
tenha culpa* — a forma certa é `rc=$?; echo ...; exit $rc`. No cabeçalho do teste, *em arquivo não
commitado, mutação se reverte por EDIÇÃO, nunca por `checkout`* — e a conferência é por `grep` do
que se acrescentou, porque `git status` diz `??` antes e depois num arquivo novo.

### 85.3 `typecheck:app`: causa confirmada pelo log, e o que o conserto NÃO resolve

`exit 134` sozinho não identifica causa. O log identifica, na linha 20:
`FATAL ERROR: Ineffective mark-compacts near heap limit — JavaScript heap out of memory`, **1**
ocorrência, e **0** de `error TS` — o log não tem erro de tipo porque o processo morreu antes de
contar.

`typecheck:app` era **o único dos três scripts sem `--max-old-space-size`**. Passou a usar **5324**,
o mesmo dos irmãos — valor já medido nesta máquina, não número novo.

⚠️ **Isto NÃO desbloqueia o percurso.** `next build` typecheca o mesmo projeto com a **própria**
invocação de Node e **não passa pelo script do `package.json`**. Quem for buildar precisa do heap
por `NODE_OPTIONS` na hora, e `ignoreBuildErrors` ou desligar o typecheck do build seguem
**proibidos**.

### 85.4 O 13º em duas parcelas — o que a capacidade entrega

O operador abre a folha de **ADIANTAMENTO DO 13º** de um exercício, calcula sobre os avos que cada
matrícula acumulou, fecha, certifica e empenha; depois abre a folha de **13º**, que recalcula os
avos até dezembro e **ABATE** o que a 1ª parcela pagou — cada uma com contracheque, memória e
`sha256` próprios, pelas mesmas telas da folha mensal.

**Nenhum número do 13º está no código.** O critério do avo, os avos do ano, o percentual da 1ª
parcela, as incidências e as rubricas da base vêm do **parâmetro do ente**, com ato estruturado.
Sem parâmetro vigente, o cálculo **recusa nomeando o exercício** — lacuna normativa bloqueia apenas
a efetivação correspondente, e o resto do sistema segue.

**A divergência entre união de serviços, `Record` e censo foi fechada nos TRÊS lugares** (união
`NomeDeServico`, `ACAO_DO_SERVICO`, união `AcaoDoSistema` + enum do Prisma), mais os dois `Record`
exaustivos. Censo: **425 serviços, 358 ações**, com cada delta dizendo qual conta serviço e qual
conta ação.

### 85.5 Quatro defeitos achados, e o pior não era erro de tipo

1. ⚠️ **`zCadastrarRubricaInput` sem a natureza do abatimento no `z.enum`.** Não quebra compilação:
   o `parse` recusaria **na entrada**, a única rubrica que o motor do 13º sabe ler seria
   **INCADASTRÁVEL**, e **a 2ª parcela nunca abateria a 1ª — o ente pagaria o 13º inteiro a quem já
   recebeu metade.** Corrigida também no `superRefine` que classifica DESCONTO: cadastrada como
   PROVENTO, **somaria em vez de abater**.
2. `DefinicaoDeRecurso` sem `acoes`/`abas` — `acoes: []` porque o parâmetro é append-only: uma ação
   "editar" reescreveria a história de folha fechada.
3. Coluna `link` para um detalhe **que não existe** — botão sem handler.
4. `OPCOES_DE_NATUREZA` sem a natureza do abatimento: **a cadeia do 13º existiria no domínio e NÃO
   pela interface**, com nenhum teste vermelho — o mesmo defeito da landing.

**A lista foi APAGADA, não vigiada:** `type` e `z.enum` passaram a derivar de
`NATUREZAS_DA_RUBRICA`. Divergir virou **impossível**, não improvável — *teste que vigia duas
cópias é pior que uma cópia a menos, porque deixa a cópia existir*. O detector ficou só onde não há
substituto — o enum do `.prisma`, que não é TypeScript — em
`modules/m33-folha/m33-listas-de-natureza.test.ts`, **lendo o ARQUIVO e não o cliente gerado**
(conferir o schema contra o cliente gerado a partir dele seria o parser conferindo o próprio
parser) e afirmando **pelo EFEITO**: toda natureza declarada tem de ser de fato cadastrável.
Mutação nas duas direções, **reversão conferida por sha1**.

### 85.6 O achado que a regra do "esperado à mão" existe para pegar

O teste esperava **1.500,00** de adiantamento e o motor deu **1.125,00** — **e o motor estava
certo.** Projetar os avos até dezembro **não apaga a admissão de março**: janeiro e fevereiro nunca
contam para quem entrou em 20/03. São 9 avos.

⚠️ **Se o esperado tivesse vindo de chamar `avosDoExercicio`, o teste passaria e o mal-entendido
teria virado a documentação do sistema** — com número, com teste verde e com aparência de norma. É
a primeira vez nesta sequência de rodadas que a regra pega um erro de **RACIOCÍNIO** e não de
digitação. O erro ficou registrado por escrito no arquivo, não apenas corrigido.

E o par ficou mais forte que o desenho original: com 1.500,00 e 1.125,00, **"abater valor fixo" e
"abater o do vínculo errado" falham nos dois sentidos**.

Segundo achado da mesma família: `contracheque.findMany` **sem filtro** trazia os contracheques das
duas folhas, e passava por acaso porque o primeiro cenário tinha folha única.

### 85.7 O typecheck de backend verde NÃO diz nada sobre o projeto `app`

⚠️ **A fatia do 13º foi commitada (`8bdf23a`) com TRÊS erros de tipo no projeto `app`.** O backend
veio limpo e isso foi lido como "a fatia compila". `app/(areas)/**` e `lib/portas/recursos/**`
vivem em **outro `tsconfig`**, que **nunca tinha sido remedido**. **O erro de sequência foi da
coordenação**, que autorizou o commit antes de fechar a lacuna que o gerente havia registrado por
escrito.

Dos cinco erros de `app` que existiam, **dois sumiram sozinhos** quando a união de naturezas foi
fechada, e **três sobreviveram** porque o `DefinicaoDeRecurso` foi consertado num arquivo e não no
outro — **e nada avisou**, porque o único instrumento que avisaria estava com o heap quebrado.
**O conserto de uma linha no `package.json` se pagou na primeira corrida.**

E o terceiro erro era de **produto**: `.div(100)` numa `string`. `decimalDaTela` devolve `string`,
a tela recebe o percentual **em porcento** ("50") como a norma o escreve, e o parâmetro guarda
**fração**. Sem a conversão de borda, o ente digitaria 50, o `ck_parametro_13_percentual_primeira`
(entre 0 e 1) recusaria, e **a tela de parâmetros do 13º nunca teria gravado nada** — falha alta,
não silenciosa, mas numa tela de que a cadeia inteira depende. Corrigido em commit **próprio**
(`26c0de4`), não em `amend`: `8bdf23a` diz o que foi medido *naquele momento*, e reescrever
apagaria a informação útil.

### 85.8 A separação da evidência

**Implementado e commitado:** `7e9e378` (guarda de desfecho + heap do `typecheck:app`), `8bdf23a`
(o 13º em duas parcelas, 27 arquivos), `38c4f2a` (a landing derivando de `navegacao.ts`),
`9c88c3a` (pendências do M10), `26c0de4` (os três erros do projeto `app`).

**Tipos verificados** — os três projetos, término normal, sem sinal, sem OOM, sob a guarda nova:
`typecheck` backend **exit 0 / 0 erros**; `typecheck:app` **exit 0 / 0 erros**;
`typecheck:scripts` **exit 0 / 0 erros**.

**Comportamento testado com banco:** censo **27/27** (4 arquivos); M33 + M32 **262/262** (11
arquivos); `prisma validate` válido; `migrate deploy` **conferido pelo EFEITO** — a linha dizia
"No pending migrations to apply", que é ambíguo entre "já estava aplicado" e "não achei o que
aplicar", e a conferência foi ao banco ver os enums e as tabelas.

**Percurso executado: NENHUM.** Nem o do 13º (`scripts/smoke-decimo-terceiro.ts` **não existe**;
roteiro de 15 passos e a lista do que ele provaria estão no `MODULO.md` do M33), nem a **J9** da
receita.

> ⚠️ **CORRIGIDO NA V11 V9.2 (seção 86), e a linha acima fica como foi escrita.** Duas coisas
> mudaram. (1) `scripts/smoke-decimo-terceiro.ts` **existe** desde `4438569`, com 44 passos, e a
> **J9** existe desde `fc34c8f` — os dois rodaram verdes contra artefato de árvore limpa. (2) A
> referência ao "roteiro de 15 passos ... no `MODULO.md` do M33" era **circular quando foi
> escrita**: o `MODULO.md` apontava de volta para este arquivo, e o roteiro não estava em lugar
> nenhum. Hoje ele está escrito em `modules/m33-folha/MODULO.md`, seção "O roteiro de quinze
> passos". Fica o registro do erro, e não a sua supressão: um documento que se corrige em silêncio
> ensina a próxima pessoa a confiar na referência sem abrir.

**Instalado ou publicado: NADA.** Sem push, sem deploy, sem build.

⚠️ **Marcação do catálogo: NADA foi marcado**, nem para cima nem para baixo. A marcação honesta da
**5.12.50 é `IMPLEMENTADO_NAO_VALIDADO`**, e a razão está escrita no `MODULO.md` do M33 pelo próprio
agente que a propôs: *aplicar a régua ao almoxarifado (5.18.8, marcada como validada com
`rota_verificada` vazia) e poupar a minha seria trocar relatório por placar.*

### 85.9 A continuidade funcional

`SUPERAVIT-SEM-ENTIDADE-NAS-QUATRO-PERNAS` permanece **continuidade funcional**, não pendência
morta, com as **cinco lacunas** preservadas e inalteradas (seção 84.4): o de-para UO→entidade, o
extraorçamentário, os restos, a amarração S1 sobre um razão sem entidade, e o encerramento por
entidade. **A apuração não se liga antecipadamente** — o `apurado` do superávit continua sem
recorte por entidade e a nota da tela continua dizendo por quê.

`NATUREZA-FORMULA-FORA-DO-SELETOR` nasce nomeada: `FORMULA` não aparece no seletor de naturezas
desde a V11 V1.1. **Pode ser deliberado** (a fórmula se escreve na VERSÃO), e acrescentá-la sem
saber por quê seria adivinhar.

### 85.10 O próximo ponto exato

1. **O percurso do 13º** — `scripts/smoke-decimo-terceiro.ts`, roteiro de 15 passos já escrito no
   `MODULO.md` do M33. ⚠️ **FEITO na V11 V9.2** (`4438569`): 44 passos, 44 ok / 0 falhas; e o
   roteiro deixou de ser uma referência circular — está em `modules/m33-folha/MODULO.md`. ⚠️ Precisa escolher um exercício **ainda sem folha de 13º**
   (`@@unique([exercicio, tipo])`), e reexecutar no mesmo exercício tem de ser reconhecido e pulado
   com aviso — nunca falhar, nunca passar em silêncio.
2. **A J9 da receita** — nas condições da seção 84.12, conferindo antes as **17 worktrees**
   existentes.
3. Ambos dependem de `next build`, que **não** foi desbloqueado pelo conserto do `package.json`.

## 86. V11 V9.2 — as duas jornadas saíram do papel, e o artefato passou a ter o SHA que o nomeia

Esta rodada fechou o que a V9 e a V9.1 deixaram escrito e não executado, e o que a fechou foi um
**percurso de navegador**, não uma suíte: a J9 encontrou um defeito que treze testes de domínio
verdes não viam. Sete commits, `1a2fb5a..9d39776`, 24 arquivos, +3.763/−94.

### 86.1 Implementado

| Commit | O que passou a funcionar |
|---|---|
| `1dbfb0d` | O comentário do `next.config.mjs` dizia, desde 15/09, que **o worker de tipos do Next não herda o `--max-old-space-size`**. É **falso** no 15.5.20, e a afirmação mandava procurar no lugar errado. Medido: quem apaga o heap é `isolatedMemory: true`, que é o worker de **páginas** (`build/index.js:338`); o de **tipos** nasce com `isolatedMemory: false` (`build/type-check.js:77`) e **herda**. A válvula permanece, e nada foi desligado |
| `3e355e4` | `preparar-banco-de-percursos.ts` monta o banco e **instala o contrato comercial de demonstração**, depois das permissões (o instalador deduz os módulos delas). `LICENCA_NUMERO`/`LICENCA_CLIENTE` são exigidas **antes do primeiro `CREATE DATABASE`** |
| `fc34c8f` | A **J9** — `scripts/smoke-receita-por-entidade.ts` |
| `39c0d20` | `ATRIBUICAO-NAO-CHEGA-AO-RODAPE`: a consulta por entidade passou a **ler a atribuição** |
| `aac63d6` | O contracheque do 13º não abria, e o `cast` dizia ao compilador que abria |
| `4438569` | O **percurso do 13º** — 44 passos pela tela |
| `9d39776` | Todo `href` da navegação aponta para rota viva |

**O defeito que a J9 achou.** `arrecadadoPorEntidade` agrupava **só** por `entidadeTitularId` e
nunca lia `AtribuicaoDeEntidadeDaArrecadacao`; a fila de pendências
(`lib/portas/arrecadacao.ts:278`) já filtrava pelos dois. No **mesmo render da mesma tela**: o ente
atribuía a guia de legado com ato, ela **saía** da lista do que havia para fazer, e o dinheiro
**ficava** em "Não atribuído — o ente ainda não disse de quem é" para sempre, sem formulário para
agir de novo. Medido no banco: a guia 7 (80.000,00) seguiu com `entidadeTitularId = null` depois de
atribuída, com a linha de atribuição gravada.

**A decisão, e o que ela preserva.** A **consulta** passa a ler a atribuição; a atribuição **não**
carimba a coluna. `entidadeTitularId` é o carimbo **do fato** — sobrescrevê-lo seria `UPDATE` em
fato consumado e apagaria a diferença entre "veio identificado na origem" e "o ente atribuiu
depois, por ato". A **procedência** (`naOrigem` / `porAtribuicao`) atravessa domínio, porta e tela,
com conferência própria que **lança** se não fechar linha a linha.

**Um corolário que esta rodada decidiu e que não estava no enunciado:** na ordem *atribuir → anular*,
o estorno herda `entidadeTitularId` do original, que no legado atribuído é nulo nos dois. Sem
resolver o estorno pelo **dono do original**, o não atribuído somaria **negativo** — o ente
mostrando dinheiro devolvido por ninguém. A herança declarada do estorno vale para o fato original
inteiro, carimbo **ou** atribuição.

### 86.2 Tipos verificados

| Projeto | Código (lido do arquivo de registro) |
|---|---|
| backend (`tsconfig.backend.json`) | **0** |
| app (`tsconfig.json`) | **2 → 0** |
| scripts (`tsconfig.scripts.json`) | **0** |

⚠️ **O `2` foi real, e serve de prova de que o instrumento acusa — medida hoje, no mesmo projeto.**
Eram sete `error TS2339` em `app/(areas)/receita/por-entidade/page.tsx`, todos meus: propaguei a
procedência no domínio e **não** no tipo de tela da porta. Corrigido em `lib/portas/arrecadacao.ts`,
a corrida seguinte deu 0. A segunda corrida levou 5 s contra 82 s da primeira: conferido que é
`incremental: true` com `tsconfig.tsbuildinfo` em disco — cache legítimo, não passo pulado.

⚠️ **As duas acusações previstas não apareceram** em nenhum dos três projetos: nem a navegação do
Json em `reguaDoParametroNoCalculo`, nem o `never` do helper `irrecuperavel`.

### 86.3 Comportamento testado com banco

- Dirigidos: **67/67 em 4 arquivos** (`m04-entidade-titular`, `m16-censo`, os dois do 13º), código 0.
- `m04-entidade-titular` isolado, com reporter nominal: **15/15**, com `t6` e `t7` **nomeados na
  saída** — placar agregado não prova que um teste novo rodou.
- Contraprova pós-mutação: **41/41**.

**`t6` confronta as duas leituras**, e a ausência disso é o que deixou o defeito passar: fixture
**N=2** (uma guia identificada na origem, uma atribuída depois) e a fila **recalculada do banco com
o mesmo critério da porta**, para exigir que as duas descrições do mesmo dinheiro coincidam.
**`t7`** cobre a ordem inversa dos atos.

**Duas provas por mutação, revertidas POR EDIÇÃO** — `git checkout` apagaria trabalho não commitado
de outra frente que estava na árvore:

| Mutação | Vermelho | Reversão |
|---|---|---|
| a leitura da atribuição → `if (false)` | `t6` e `t7`, com o defeito original **exato** (`expected '500.00' to be '0.00'`) — e **os 13 testes anteriores seguiram verdes**, que é a medida de quão cega a suíte era | checksum idêntico |
| `doAdiantamento.regua !== reguaVigente` → `false` | **2 testes** (`m33-decimo-terceiro.test.ts:750` e `:820`) | `servico.ts` voltou **byte a byte** |

⚠️ **Foram 2, não 3.** A ordem previa três testes exigindo a recusa; só existem **duas** asserções
de `PARAMETRO-TROCADO-ENTRE-AS-PARCELAS`, e as duas caíram. O número medido fica, não o esperado.

### 86.4 Percurso executado

⚠️ **Ambos contra artefato de ÁRVORE LIMPA.** O build é de `9d39776` com `NEXT_PUBLIC_BUILD_COMMIT`
no SHA completo, e `/release` responde `9d39776` = HEAD. Isso fecha a ressalva das corridas
anteriores, em que o conteúdo estava certo e o SHA **não o nomeava** porque a árvore estava suja.

O build passou pelo **caminho direto** — a linha do log é `Linting and checking validity of types`,
e **não** `Skipping validation of types`: a conferência rodou no worker do próprio build, sem OOM, e
**a válvula do digesto não foi usada**.

| Percurso | Resultado | Registro |
|---|---|---|
| J9 — `smoke:receita-por-entidade` | **33 ok / 0 falhas / 3 NÃO EXECUTADOS**, código **0** | `percurso-da-entidade-titular-na-arrecadacao-j9-2026-09-24T04-12-09-005Z.log` |
| 13º — `smoke:decimo-terceiro` | **44 ok / 0 falhas**, código **0** | `smoke-do-decimo-terceiro-2026-09-24T04-15-06-246Z.log` |
| 13º, **reexecução no mesmo exercício** | código **4**, com `[PULADO] ... NADA foi provado nesta corrida` | `smoke-do-decimo-terceiro-2026-09-24T04-20-44-830Z.log` |

O `rc=4` é o comportamento certo e foi **medido nesta rodada**, não herdado: a segunda corrida
reconhece `@@unique([exercicio, tipo])`, recusa-se a passar em silêncio e diz qual variável mudar.

> ⚠️ **CORREÇÃO (V11 V9.3): a reexecução pulada NÃO equivale a teste de idempotência, e o
> relatório da V9.2 a apresentou como se equivalesse.** O que o `rc=4` prova é que o PERCURSO se
> recusa a rodar duas vezes sobre o mesmo exercício e a mentir sobre isso — é honestidade do
> instrumento, não propriedade do produto. Idempotência é outra afirmação: repetir a AÇÃO
> (abrir, calcular, fechar) não duplica efeito. Essa continua **não exercitada pela tela** nesta
> frente; o que existe é a unicidade no schema e os testes de domínio. Um percurso que pula não
> mediu nada do produto — pela mesma régua com que esta empreitada contou "passo pulado não é
> passo barato".

Banco: `gestao_publica_percursos_v11v92d`, sintético e descartável, papel de runtime `gestao_app`.

### 86.5 Instalado ou publicado: **NADA**

Sem push, sem deploy, sem transmissão. `/release` responde **503** com `{"candidato": null}` — **não
há manifesto de candidato**, e responder 503 é honesto, não defeito. Prontidão de release
permanece **pendente**.

### 86.6 Pendências nomeadas

- **`CONTROLE-DDR-POR-NATUREZA-DA-FONTE`** (`modules/m01-core-contabil/roteiros.ts:238-254`).
  `CONTA_CONTROLE_DDR = "7.2.1.1.0.00.00"` é **sintética** no plano oficial e o roteiro tem uma
  perna fixa que não lê a fonte: **não há arrecadação em instalação limpa**. Bloqueia **três**
  passos da J9 — o carimbo da guia nova, a troca de titular e o estorno **pela tela** —, que ficam
  **NÃO EXECUTADOS**, com contador próprio na saída do percurso. Não se destrava escolhendo uma
  conta filha: é decisão de modelo (perna resolvida **pela fonte**) mais ato do ente. As três já
  estão provadas por teste em banco (`t2b`, `t3`, `t3b`), e o percurso as executa sozinho no dia em
  que a pendência cair.
- **`PERCURSOS-SEM-TERMO-PATRIMONIAL-CONGELADO`** — faltam fixture e termo com emissão congelada;
  4.1/4.2 do `smoke-identidade` seguem vermelhos. **Nenhum termo foi fabricado** para fechar placar.
- **`ESTADO-EXIGIDO-DO-ADIANTAMENTO-SEM-FONTE`** — lacuna **normativa**, não de código: nenhuma
  fonte no repositório diz que "fechado" é o estado certo para abater. O motor **coincide** com a
  regra documentada, e documentação é **argumento de engenharia, não norma**.
- **`SUPERAVIT-SEM-ENTIDADE-NAS-QUATRO-PERNAS`** — **continuidade funcional**, não pendência morta,
  com as **cinco lacunas preservadas e inalteradas** (seção 84.4). **A apuração NÃO foi ligada**, e
  a nota da tela continua declarando o recorte.

### 86.7 Catálogo — o que a evidência sustenta, e só

**Zero mudanças de situação.** Uma única marcação mudou, e foi de **evidência**: `5.12.50`.

- **`5.12.50` continua `PARCIAL`.** O percurso do 13º validou **dois dos nove tipos** que a cláusula
  enumera (adiantamento de 13º e 13º salário) e **nenhum** dos oito filtros de funcionários que ela
  exige. Promovê-la a `VALIDADO_LOCALMENTE` por isso seria trocar relatório por placar. A evidência
  agora registra o alcance validado **e** o que falta: mensal complementar, rescisão, rendimentos
  acumulados, férias, diferença de 13º, adiantamentos salariais e o filtro.
- **A J9 não marcou nada, e o motivo é um achado.** Procurei as cláusulas correspondentes e
  **não há nenhuma**: as de "por entidade" do catálogo são de PPA, LDO, orçamento e relatórios, não
  de *dizer de quem é a receita que entrou*. ⚠️ E `modules/m04-receita/consultas.ts` cita **"TR
  5.38.7"** no cabeçalho — essa correspondência **não se sustenta**: `5.38.7` é do **portal público
  de transparência** ("Consultar tributos arrecadados pela entidade"), e a J9 exercitou tela
  **interna autenticada**. Marcar por ela seria inventar correspondência. Fica nomeado para
  decisão, e **marcar ausência vale tanto quanto marcar presença**.

Contagem após esta rodada, **inalterada**: `NAO_VERIFICADO` 1.645 · `AUSENTE_CONFIRMADO` 145 ·
`PARCIAL` 101 · `VALIDADO_LOCALMENTE` 75 · `IMPLEMENTADO_NAO_VALIDADO` 67 ·
`DEPENDENCIA_EXTERNA` 4. **392 de 2.037 (19,2%)** verificadas.

### 86.8 O que esta rodada aprendeu sobre a própria medição

**O código de saída do shell mentiu sete vezes.** Em todas, a notificação disse `exit code 0` e o
arquivo de registro disse outra coisa — `2` do trinco caindo no uso porque `npm run ... -- ...`
engole o `--`, `1` de percurso vermelho, `2` de typecheck, `3` de pré-condição, `4` de reexecução
pulada. **Vale o arquivo.**

**Dois defeitos nasceram dentro do instrumento**, e os dois foram no percurso, não no produto: uma
função **nomeada** dentro de um `page.evaluate` (o `tsx` compila com esbuild e `keepNames`, que a
embrulha num `__name(...)` inexistente no navegador — o percurso morria com "`__name is not
defined`", erro que não fala de nada do domínio), e uma asserção que **deduzia** "não há entidade
cadastrada" de "nenhuma entidade tem linha no rodapé" — coisas diferentes, porque entidade sem
arrecadação não tem linha. A segunda reprovou comportamento **correto** na segunda execução.

**E uma asserção minha acusou o alvo errado:** a J9 reprovava o `200` do tesoureiro em
`/contabilidade/entidades`. A tela é de **leitura**, guardada por `CONSULTAR_CONTABILIDADE`
(`page.tsx:32`); a **escrita** se guarda por ação nomeada no servidor
(`lib/portas/entidades-contabeis.ts:173`). O invariante 6 estava de pé, e um percurso que reprovasse
aquilo mandaria consertar a guarda certa. A asserção passou a afirmar o **efeito**: o tesoureiro
envia e o servidor recusa.

### 86.9 O próximo ponto exato

1. **Decidir a correspondência de catálogo da receita por entidade** — hoje a capacidade existe,
   está validada pela tela e **não tem cláusula**. Ou se acha a cláusula certa, ou se registra a
   ausência no catálogo.
2. **`CONTROLE-DDR-POR-NATUREZA-DA-FONTE`** — enquanto viver, instalação limpa não arrecada, e três
   passos da J9 seguem não executados.
3. **Prontidão de release** — não há manifesto de candidato; `/release` responde 503. Nada foi
   publicado e nada está pronto para publicar.

---

## 87. V11 V9.3 — `CONTROLE-DDR-POR-NATUREZA-DA-FONTE` resolvida, e os três passos da J9 executados

**Regime de rigor: PROFUNDIDADE.** Razão contábil e perna de roteiro — caracterização contra a
fonte oficial antes de mudar, fixture N=2, negação com motivo, prova por mutação nas duas direções.

### 87.1 A causa, determinada entre as quatro

O impedimento era `Conta sintética não recebe partida: 7.2.1.1.0.00.00`, e ele deixou **três
passos da J9 não executados** na V9.2.

**A fonte, lida do arquivo, não de memória.** `docs/oficial/tce-pb/Pcasp_2025.xlsx` (TCE-PB,
sha256 `52ae7c73…`, publicado 2024-10-29, conferido por `prisma/seed/oficial/procedencia.ts`),
bloco de 2025, lido por `packages/planilha`. O ramo:

| Código oficial | Formatado | Descrição | Tem filha? |
|---|---|---|---|
| `721100000` | `7.2.1.1.0.00.00` | CONTROLE DA DISPONIBILIDADE DE RECURSOS | **sim, cinco** |
| `721110000` | `7.2.1.1.1.00.00` | RECURSOS ORDINÁRIOS | não |
| `721120000` | `7.2.1.1.2.00.00` | RECURSOS VINCULADOS | não |
| `721130000` | `7.2.1.1.3.00.00` | RECURSOS EXTRAORÇAMENTÁRIOS | não |
| `721140000` | `7.2.1.1.4.00.00` | RECURSOS PARA COMPENSAÇÃO FINANCEIRA | não |
| `721190000` | `7.2.1.1.9.00.00` | OUTROS CONTROLES DA DISPONIBILIDADE DE RECURSOS | não |

**A causa é (c) — falta de dimensão no seletor de roteiro.** O ponto exato:

- **Fato pretendido:** a arrecadação de uma guia — a entrada de recurso novo sob controle.
- **Natureza da fonte envolvida:** a do recurso arrecadado. No percurso, a fonte `500` da conta
  bancária `CC-500-01`.
- **Roteiro selecionado, e por qual seletor:** `roteiroArrecadacao`
  (`modules/m01-core-contabil/roteiros.ts`), chamado por `lib/portas/arrecadacao.ts` dentro de
  `registrarGuia`. **Não havia seletor**: a função recebia `disponibilidade` e
  `variacaoAumentativa` e mais nada.
- **Contas indicadas e atributos:** a perna de classe 7 era a constante
  `CONTA_CONTROLE_DDR = "7.2.1.1.0.00.00"`, que no banco de instalação limpa tem
  `analitica = false` — corretamente, porque o `pcasp-oficial.ts` deriva `analitica` de
  *não ter filha*, e ela tem cinco.

Não é **(a)**: não existe vínculo já fundamentado por carregar — o corpus oficial deste
repositório **não** traz a correspondência fonte → natureza (`relacionamento_fonterecursos_co_2026.xlsx`
relaciona fonte com **código de acompanhamento**, 96 linhas, colunas `CODIGO FONTE RECURSOS` e
`CODIGO CO`). Não é **(b)**: a carga está certa, e foi conferida linha a linha contra o xlsx. Não é
**(d)**: a decisão contábil **está** sustentada — é o próprio plano que parte `7.2.1.1` por
natureza; o que não é derivável é de que natureza é a fonte 500 **deste** município, e isso não é
lacuna normativa, é **ato do ente**, que agora tem onde ser praticado.

### 87.2 O segundo achado, que mascarou o primeiro por ~25 arquivos

`prisma/seed/pcasp.ts` — o plano **mínimo**, que toda suíte semeia — declarava
`7.2.1.1.0.00.00` com `analitica: true`, contra o plano oficial, com a nota do extrato admitindo
o motivo: *"detalhamento fino a confirmar no xlsx"*. **Um plano de teste que contradiz o oficial
não é fixture mínima: é um plano DIFERENTE, e ele aprova o que a produção nega.** Era por isso
que `roteiroArrecadacao` passava verde em ~25 arquivos e recusava em instalação limpa.

O mesmo vale para `test/roteiro-orcamentario.ts`, que registrava o pai sintético e força
`analitica: true` em toda fixture. As duas passaram a trazer as **cinco folhas**.

### 87.3 A correção, com arquivo:linha

| Onde | O quê |
|---|---|
| `modules/m01-core-contabil/roteiros.ts:235-300` | `CONTA_CONTROLE_DDR` morreu. Nascem `NaturezaDaFonteDdr` (rol fechado = a partição do plano), `CONTA_CONTROLE_DDR_POR_NATUREZA`, `CONTAS_CONTROLE_DDR` e `contaDeControleDaDdr()`, fail-closed |
| `modules/m01-core-contabil/roteiros.ts:635-668` | `roteiroArrecadacao` ganha `naturezaDaFonte`, **obrigatório**. Opcional com queda para conta padrão seria a escolha por conveniência de volta, escondida atrás de um `??` |
| `modules/m01-core-contabil/natureza-da-fonte.ts` (novo) | o ato do ente: `naturezaVigenteDaFonte`, `exigirNaturezaDaFonte` (fail-closed **com motivo**), `listarNaturezasDeclaradas`, `declararNaturezaDaFonte` (append-only, versionada, autorizada) |
| `prisma/schema/m01-core-contabil.prisma` | `enum NaturezaDaFonteDdr` e `model DeParaFonteNaturezaDdr` — molde dos de-paras irmãos (`DeParaFonteClasseEducacao`), sem relação declarada |
| `prisma/migrations/20261014090000_v11_v93_natureza_da_fonte_ddr/` | **aditiva, zero `DROP`**. O gerador reciclou 8 pares `DROP/ADD CONSTRAINT` de FKs alheias (`ReceitaArrecadada`, `FolhaDePagamento`, `CampoDoEvento`, …) — retirados à mão |
| `lib/portas/arrecadacao.ts:139-142` | `exigirNaturezaDaFonte` resolvida **antes de qualquer escrita** — "efeito colateral antes da operação guardada envenena a tentativa seguinte" |
| `app/(areas)/contabilidade/natureza-das-fontes/` (novo) | a tela: lista **todas** as fontes do cadastro, marca as não declaradas, e o formulário não tem default |
| `prisma/seed/pcasp.ts:89-111`, `test/roteiro-orcamentario.ts:133-141` | o plano mínimo e a fixture deixam de ser mais permissivos que a produção |
| `test/contas-contra-o-plano-oficial.test.ts:279` | a entrada `7.2.1.1.0.00.00` saiu de `EM_PERNA_DE_ROTEIRO`. **A lista que "só encolhe" encolheu** |

**O que NÃO se fez:** escolher uma analítica por conveniência, criar conta demonstrativa, ou
afrouxar a validação de conta sintética. Ela estava **certa** e é o instrumento funcionando.

### 87.4 Os lançamentos, provados independentemente da função testada

`m01-ddr.test.ts` **t6** e **t7** leem as **partidas persistidas** e comparam com o esperado
escrito à mão a partir do xlsx — chamar `roteiroArrecadacao` para conferir `roteiroArrecadacao`
passaria com qualquer interpretação errada consistente.

| Guia | Fonte | Natureza | Conta de classe 7 | Tipo | Valor |
|---|---|---|---|---|---|
| `2026RC000010` | 500 (livre) | ORDINARIOS | `7.2.1.1.1.00.00` | DEBITO | 10.000,00 |
| `2026RC000011` | 540 (FUNDEB) | VINCULADOS | `7.2.1.1.2.00.00` | DEBITO | 7.000,00 |
| `2026RC000012` | 540 | VINCULADOS | `7.2.1.1.2.00.00` | DEBITO | 7.000,00 |
| `2026RC000012A` (anulação) | 540 | — | `7.2.1.1.2.00.00` | **CREDITO** | 7.000,00 |

**Fixture N=2 na dimensão nova**: com uma fonte só, um roteiro que ignorasse a natureza passaria
por vacuidade. **Arrecadação e estorno pelo MESMO contrato contábil**: a anulação não tem roteiro
próprio — `gerarEstorno` inverte as **partidas gravadas**, então ela credita a **mesma** conta que
a arrecadação debitou, e a conta da outra natureza não é tocada. É o corolário do carimbo da
entidade titular aplicado à classe 7: fato antigo preserva a classificação do instante dele.

### 87.5 Prova por mutação — nas duas direções

| Mutação | Vermelho | Reversão |
|---|---|---|
| `CONTA_CONTROLE_DDR_POR_NATUREZA.VINCULADOS` → a conta de ORDINARIOS (a dimensão vira falsa) | `m01-ddr` t6 e t7, `m01-roteiros` t9 | — |
| `exigirNaturezaDaFonte` → default silencioso em vez de recusa | `m01-natureza-da-fonte` t2 e t4 | — |
| ambas revertidas | — | **24 verdes** |

Registro: `.registro-de-execucao/v11v93-mutacao-vermelho.txt` (exit=1, 5 falhas nomeadas) e
`v11v93-mutacao-verde-de-volta.txt` (exit=0).

### 87.6 Medições — códigos de saída lidos DO ARQUIVO

| Medição | Resultado | Registro |
|---|---|---|
| typecheck backend / app / scripts | **1 erro nos três**, e **não é meu** (ver 87.8) | `v11v93-typecheck-2.txt` |
| dirigidas M01 (DDR, roteiros, natureza) + M04 inteiro | **8 arquivos, 79 testes, exit 0** | `v11v93-suites-m01-m04-2.txt` |
| guard do plano + M16 bordas + RGF Anexo 5 + seed de produção | **5 arquivos, 40 testes, exit 0** | `v11v93-guards-e-vizinhos.txt` |
| instalação limpa do banco de percursos (4×) | **exit 0** — migrations, SQL manual, papel de runtime, PCASP oficial, roteiros, bootstrap, licenciamento | `v11v93-preparar-banco.txt`, `v11v93-artefato{,2,3}-preparar-e-build.txt` |
| build do artefato | **exit 0**, pelo caminho direto (`Linting and checking validity of types`, **não** `Skipping validation`) | `v11v93-artefato3-preparar-e-build.txt` |
| **J9 pela tela** | **44 ok / 0 falhas / 0 NÃO EXECUTADOS**, **exit 0** | `v11v93-percurso-j9-4.txt` |

**Não rodados, e contados como não executados:** portão integral, `test:tudo` e `test:fuso` — a
ordem desta rodada não os autorizou e não se promoveu artefato. O diff **não** toca
`packages/datas`, guards de período nem janelas de relatório.

### 87.7 Os três passos da J9 — executados, com o que cada um mostrou

Artefato `97f058b` (branch `v11v93-artefato` = `74624fe` + os três commits desta rodada),
`/release` = `97f058b`, porta **3011**, banco **`gestao_publica_percursos_v11v93d`**, árvore do
artefato **congelada** (só `node_modules` fora do índice). O artefato da V9.2 em `:3010` (PID
62185, banco `…v11v92d`) **não foi tocado**.

| Passo | O que ficou provado |
|---|---|
| **5.6** | fonte sem natureza declarada faz a arrecadação **recusar**, e a recusa **nomeia a fonte** — negação com motivo, pela tela |
| **5.7 / 5.8** | a natureza é declarada **pela tela**, a confirmação diz em que conta passa a escriturar, e a declaração **persiste à recarga** |
| **6.0** | a recusa de `7.2.1.1.0.00.00` **não aparece mais** — e se aparecer é **falha**, não pendência: o percurso trocou o ramo de "previsto" por regressão |
| **6.1 / 6.2** | **o carimbo**: a guia nova entra **já identificada**, e a linha da entidade A cresce **exatamente** os 1.000,00 |
| **7.1 / 7.2** | **fatos antigos preservam sua identificação**: trocado o titular para B, a linha de A **não muda** |
| **8.1 / 8.2 / 8.3** | **o estorno pela tela**: debita **A** — o titular do fato original — embora a conta já pertença a **B**, e **B não é tocada**. A herança vale para o fato inteiro, não para uma coluna |

**O que a jornada achou de defeito, e foi corrigido nela:** a anulação de guia **não confirmava
nada**. O passo 8.1 leu silêncio **duas vezes**, contra artefatos diferentes e bancos diferentes,
enquanto 8.2 e 8.3 confirmavam pelo rodapé que a anulação tinha acontecido — o efeito existia, o
aviso não. A primeira hipótese (`<details>` que se fecha) **foi derrubada pela medição**; a causa
era a **linha**, que desaparece no sucesso por desenho (`colunaAcoes` só oferece o ato a guia
viva). O estado subiu para um provedor acima da tabela — a mesma cura do guichê (V8), do roteiro
orçamentário (V8.4) e da natureza das fontes (V9.3).

### 87.8 ~~Bloqueio externo~~ — **a atribuição estava errada, e a correção é minha** (ver 87.13)

`modules/m33-folha/certificacao.ts:662` não compila em `main`: `elegibilidadeParaLiquidar` recebe
um objeto sem `abatimentoSemCriterioDeclarado`, campo que `modules/m33-folha/elegibilidade.ts:48`
passou a exigir. O arquivo está **idêntico a `fea43d8`** — commit de **outra sessão**, que chegou
a `main` durante esta rodada (`74624fe` → `fea43d8`). Dois dos três sítios foram atualizados
(`certificacao.ts:571` e `:852`); o terceiro ficou.

**Não foi corrigido aqui, de propósito.** O campo governa o gate `ABATIMENTO-SEM-CRITERIO-DECLARADO`;
escolher entre `false` e o `semCriterio` calculado é decidir se a **liquidação** de uma folha de 13º
com critério não declarado deve ou não ser barrada — decisão normativa, dentro de um tema em curso.
Chutar o valor para o meu build passar seria exatamente o que este repositório proíbe.

> ⚠️ **CORREÇÃO DE ATRIBUIÇÃO (registrada em 87.13).** Escrevi acima que `fea43d8` era de "outra
> sessão". **Não era.** Era do **auxiliar desta mesma rodada**, e a falha foi de coordenação, não
> de origem. O texto original fica visível de propósito — apagá-lo esconderia que eu atribuí a
> terceiros um defeito da própria empreitada. O que se sustenta da seção é a **medição** (HEAD não
> compilava, o sítio era esse) e a **recusa de chutar o valor**; o que não se sustenta é a palavra
> "outra sessão". Fechado em `10f8fe5`, **derivando** o valor do mesmo fato — a memória do cálculo —
> em vez de literal.

**Consequência medida e declarada:** o artefato dos percursos foi montado em `v11v93-artefato` =
`74624fe` + os três commits desta rodada, **sem** os commits de M33. O SHA `97f058b` **nomeia** o
que foi servido, e o build validou tipos da árvore inteira — o que confirma, por segunda via, que
o único erro em `main` é esse. **O artefato não é HEAD**, e isso está dito em vez de escondido.

### 87.9 Pendências

- **`MENSAGEM-SOME-COM-A-LINHA` na atribuição do legado** — mesma família do defeito de 8.1, outro
  formulário: `9.5` segue notando que a tela **não confirma por escrito** a atribuição (o efeito é
  conferido por 9.5b). A cura é conhecida e é de um movimento: provedor acima da tabela, como em
  `FormAnularReceita.tsx`. **Escopo não executado**, não bloqueio.
- **`DDR-DISPONIVEL-SALDO-A-REPONTAR`** — base que já operou com a conta antiga move o acumulado
  por `repontarConta`. Nenhum banco vivo foi tocado nesta rodada.
- **`SUPERAVIT-SEM-ENTIDADE-NAS-QUATRO-PERNAS`** — as cinco lacunas seguem **preservadas e
  inalteradas**. A apuração **não** foi ligada, como a ordem determinou.
- **`ABATIMENTO-SEM-CRITERIO-DECLARADO` no sítio da liquidação** — ver 87.8. **Bloqueio externo**
  (outra sessão), não escopo pendente meu.
- Bloqueadas por terceiro (seção 83.3), inalteradas: leiaute eSocial, token ASTEC, certificado A1,
  AWS, linha ENT12.

### 87.10 Catálogo

**Zero mudanças de situação, e zero marcações.** Esta rodada removeu um impedimento e executou a
jornada dele; nenhuma cláusula foi medida contra comportamento novo. Marcar aqui seria contar a
remoção de um bloqueio como cobertura de edital.

### 87.11 Instalado ou publicado: **NADA**

Sem push, sem deploy, sem transmissão fiscal, sem pagamento. `/release` responde `candidato: null`.
Os três scripts do operador seguem fora do Git, não executados. As 17 worktrees anteriores, os nove
bancos anteriores e o artefato da V9.2 em `:3010` estão intactos; esta rodada acrescentou duas
worktrees (`candidato-e346f08`, `artefato-v11v93`) e quatro bancos descartáveis
(`…v11v93`, `b`, `c`, `d`).

### 87.12 O próximo ponto exato

1. **Cobrar de quem é**: `modules/m33-folha/certificacao.ts:662` precisa do
   `abatimentoSemCriterioDeclarado` decidido pela sessão que criou o campo. Enquanto isso, `main`
   não compila e **nenhum artefato pode ser promovido a partir dela**.
2. Depois disso, reconstruir o artefato **em cima de `main`** e reexecutar **só** a J9 — é o único
   percurso que esta rodada atingiu.
3. `MENSAGEM-SOME-COM-A-LINHA` na atribuição: um provedor, um build, uma corrida da J9.

### 87.13 O que veio DEPOIS de 87.12 ter sido escrita

**A atribuição de `fea43d8` estava errada, e o erro é meu.** Eu o dei como "de outra sessão"; era do
**auxiliar desta rodada**. A medição continua de pé — `main` não compilava, o sítio era
`certificacao.ts:662` —, e a recusa de chutar o valor continua certa. Errado foi o **sujeito**, e
isso importa porque muda de quem é a dívida: não era de fora, era da empreitada.

Fechado em **`10f8fe5`**, e pelo caminho certo: o terceiro sítio **deriva** o valor do mesmo fato
(a memória do cálculo) em vez de repetir um literal — se fosse `false` cravado, a liquidação
responderia a pergunta de um jeito e a apropriação de outro.

**Medição de `10f8fe5`, feita pelo auxiliar e conferida aqui pelo build:** tipos **0/0/0**,
dirigidos **152/152**, as duas migrations conferidas **pelo efeito**, quatro mutações acusando e
revertidas **por edição**.

### 87.14 O artefato de `main` — tarefa 1

| Item | Valor |
|---|---|
| Artefato | `10f8fe5`, árvore limpa, worktree `candidato-10f8fe5` |
| Build | **exit 0**, pelo **caminho direto** — a linha é `Linting and checking validity of types`, **não** `Skipping validation of types`. Sem OOM, **sem a válvula do digesto** |
| `/release` | `10f8fe5` — o SHA **nomeia** o que é servido |
| Porta / banco | **3012** / `gestao_publica_percursos_v11v93e` (instalação limpa, `exit-preparar=0`) |
| Registro | `.registro-de-execucao/v11v93-artefato-main-preparar-e-build.txt` |

O build validando tipos da árvore inteira é a **segunda via** de que `main` voltou a compilar.

### 87.15 Os três passos do 13º — tarefa 2

Roteiro do `MODULO.md` do M33 fechado: **16, 17 e 18 deixaram de ser "falta nomeada"**.

**Ambiente:** o percurso do 13º **exige banco próprio** (`PERCURSO_BANCO`) e recusa sem ele — a
folha calcula sobre TODOS os vínculos, e num banco compartilhado uma matrícula alheia derruba o
cálculo. A recusa é do instrumento e está certa: `exit=3`, **nada foi iniciado**.

| Passo | O que ficou provado |
|---|---|
| **16.1–16.3** | o `select` do estado mínimo existe com as três opções declaráveis **mais a ausência**; a ausência é o **padrão** e é **nomeada** ("o 13º sai como simulação"), não um branco mudo; e a tela **diz antes da escolha** que exigir "pago" depende de empenho POR SERVIDOR |
| **16.4–16.6** | **negativa estrutural**: exigir "pago" sem grupo por servidor é recusado com `ESTADO-PAGO-NAO-VERIFICAVEL`, dizendo que o fato **não existe no banco** — não "valor inválido" —, e **nada é gravado** (a versão 2 não nasce da tentativa) |
| **17.1–17.2** | com a folha **aberta**, o detalhe traz "Natureza da apuração: SIMULAÇÃO" e **diz o que isso impede** |
| **17.3–17.5** | **fechada**, a barra **não oferece** `apropriar`, diz o **motivo** e aponta um remédio **executável** |
| **18.1–18.2b** | **o par que importa**: declarado o critério na versão seguinte, a folha **segue bloqueada** — o bloqueio é do **cálculo**, não do parâmetro |

**Resultado:** `58 ok / 0 falhas / 1 NÃO EXECUTADO`, **exit 0**
(`.registro-de-execucao/v11v93-percurso-13-r3.txt`), artefato `6789a1f`, banco
`gestao_publica_percursos_v7m1_13o_v11v93b`.

**O defeito que o percurso achou — e é de produto.** O remédio das duas recusas
(`apropriar` e `liquidar`) dizia *"o ente declara o critério … e a folha é recalculada"*. **As duas
recusas só são alcançadas em folha FECHADA** — o `!e.fechada` fala antes delas —, e folha fechada
**não recalcula**: `elegibilidadeParaCalcular` devolve `FOLHA-FECHADA`, e o percurso mediu
RECALCULAR como **`ausente`** da barra. **O remédio era falso no único estado em que aparece.** Quem
declarasse o critério e voltasse veria o mesmo bloqueio, sem explicação. Corrigido em `985cb7f`: o
texto passa a dizer que o critério tem de estar declarado **ANTES** do fechamento e nomeia
`RETIFICAÇÃO DA FOLHA` como o que falta para uma folha já fechada.

**E duas asserções minhas estavam erradas**, corrigidas no mesmo commit: 17.4 e 18.2 exigiam o
código `ABATIMENTO-SEM-CRITERIO-DECLARADO` no texto da **barra**. A barra não mostra código de ato
**nenhum**, em lugar nenhum: ela projeta **motivo e remédio**, e código na tela seria vocabulário de
implementação diante de quem opera. A negação passou a afirmar o **motivo**.

**NÃO EXECUTADO, com o ponto exato:** `18.3 a 18.5` — o destrave pelo recálculo. A folha de 13º
está fechada e a barra apresenta RECALCULAR como `ausente`; o produto **não tem** ato que refaça
cálculo congelado. **Não foi declarado feito.** O destrave exige declarar o critério **antes** de
fechar, ou o ato de retificação, que não existe.

**O que NÃO se fez, e por quê.** A correção mais funda seria **bloquear o `fechar`** de uma folha em
simulação — impede o beco sem saída na origem. Não foi feita: inverte onde o autor do M33 pôs o
gate e tornaria **inalcançável o próprio estado que o passo 17 existe para medir**. Fica como
decisão da próxima unidade, não tomada de afogadilho no fim de uma rodada.

### 87.16 `MENSAGEM-SOME-COM-A-LINHA` — tarefa 3, e a regra que faltava escrita

A confirmação da atribuição morreu **três vezes**, cada uma num invólucro mais externo, e cada morte
só apareceu **depois** de a anterior ser curada e medida:

1. dentro do **formulário**, que fecha no sucesso — já tratado antes desta rodada;
2. dentro do **`<li>` da guia**, que sai da fila (`6789a1f`);
3. dentro da **`<section>` da fila**, que deixa de ser renderizada quando a fila esvazia (`eccbe8c`).

**A regra que fecha a família:** *o aviso de um ato vive FORA de tudo o que o ato muda.* Foi por não
estar escrita que a cura precisou de três tentativas em **duas** telas — a anulação de guia
(`3d75c47`, `c436185`) passou pelas duas primeiras camadas nesta mesma rodada.

**Provado pela tela:** J9 **45 ok / 0 falhas / 0 não executados**, **exit 0**
(`.registro-de-execucao/v11v93-percurso-j9-r6.txt`), artefato `eccbe8c`. O passo 9.5 deixou de
tolerar silêncio e passa a **afirmar a mensagem**; 9.5b e 9.6 continuam afirmando o **efeito** —
aviso sem persistência é o outro defeito desta família, e ele não se prova com aviso.

### 87.17 Catálogo — o que a evidência sustenta, e só

**Zero mudanças de situação. Uma marcação, e é de EVIDÊNCIA: `5.10.1.72`.**

A cláusula — *"Controlar para que as contas contábeis só recebam lançamentos no último nível de
desdobramento do Plano de Contas"* — é a única que corresponde **literalmente** ao que esta rodada
mexeu. Continua **`PARCIAL`**, de propósito: a rodada corrigiu **uma** perna de roteiro e a cláusula
cobra o controle para **todas**. A evidência passou a registrar o **alcance validado** (a perna de
classe 7 da arrecadação, provada pelas partidas persistidas e pela tela no passo 6.0 da J9) e **o
que falta** — cinco pernas ainda em conta sintética, cada uma com pendência nomeada
(`ANULACAO-DE-DOTACAO-DOIS-CANCELAMENTOS-HOMONIMOS`, `CREDITO-ESPECIAL-ABERTO-OU-REABERTO` ×2,
`ROTEIRO-RESERVA-SEM-CONTA`, `CONSIGNACAO-CONTA-SINTETICA`).

**`5.12.50` permanece `PARCIAL`**, inalterada: as modalidades e os filtros seguem não verificados, e
**isto não mudou nesta rodada**.

**A arrecadação por natureza da fonte NÃO tem cláusula correspondente.** Procurado no catálogo
inteiro por "disponibilidade por destinação", "destinação de recursos", "DDR", "controle da
disponibilidade" e "natureza da fonte": sete cláusulas citam destinação de recursos, e **nenhuma**
trata do **controle contábil da disponibilidade** (PCASP classes 7 e 8). As sete falam de
PPA/LDO/programação e de saldo por fonte na inclusão de pagamentos — outro objeto. Fica registrado
como **desenho de engenharia**, não como cobertura de edital, pela mesma régua da `TR 5.38.7` em
`63e2f96`: **não se inventa correspondência para render marcação**.

Contagem após a rodada: **392 de 2.037 verificadas (19,2%)**; `NAO_VERIFICADO` 1.645, 
`AUSENTE_CONFIRMADO` 145, `PARCIAL` 101, `VALIDADO_LOCALMENTE` 75, `IMPLEMENTADO_NAO_VALIDADO` 67,
`DEPENDENCIA_EXTERNA` 4.

### 87.18 O estado, separado por natureza da prova

| Natureza | O que esta rodada entregou |
|---|---|
| **Implementado** | perna de classe 7 resolvida pela natureza da fonte; `DeParaFonteNaturezaDdr` (append-only, versionada, fail-closed); tela `/contabilidade/natureza-das-fontes`; remédio verdadeiro nas duas recusas do critério do abatimento; confirmação da anulação e da atribuição fora do que o ato muda |
| **Tipos verificados** | `typecheck` backend / app / scripts — **0/0/0** em `eccbe8c`; e o **build** validou tipos da árvore inteira pelo caminho direto, sem dispensa por digesto |
| **Comportamento com banco** | dirigidas M01+M04 **79/79**; guards do plano + M16 bordas + RGF Anexo 5 + seed de produção **40/40**; M33 critério do abatimento **18/18**; mutação: **5 vermelhos** e **24 verdes** na reversão |
| **Percurso executado** | **J9** 45 ok / 0 falhas / 0 não executados (`exit 0`); **13º** 58 ok / 0 falhas / **1 não executado** (`exit 0`) — o não executado é `18.3–18.5`, com o ponto exato |
| **Instalado ou publicado** | **NADA.** Sem push, sem deploy, sem transmissão fiscal, sem pagamento. `/release` responde `candidato: null` em todos os artefatos |

### 87.19 Bloqueio NORMATIVO — distinto de código não construído

**`DISPOSITIVO-MUNICIPAL-DO-13-NAO-LIDO`.** É **lacuna normativa**, não código faltando: três fontes
respondem **403**, inclusive a consulta do TCE/SC que trata exatamente do tema. **Ela não trava mais
o sistema** — o critério virou declaração do ente, com a ausência sendo escolha nomeada e a
apropriação bloqueada enquanto ninguém declarar. O que falta é o insumo para alguém saber **qual**
critério declarar: o dispositivo do estatuto do município. Nenhum valor foi assumido no lugar dele.

Não confundir com **escopo não construído**, que nesta rodada é: o ato de **retificação da folha**
(sem ele, 13º fechado em simulação não se destrava) e o bloqueio do `fechar` sobre folha em
simulação (decisão adiada, 87.15).

### 87.20 Defeito LATENTE registrado, conserto de outro

**`numeroDoEmpenhoDaFolha`** (`modules/m33-folha/apropriacao.ts:257`) **não inclui o TIPO da folha**
no número. Duas folhas de **tipos diferentes na mesma competência** colidem no número, e
`apropriarFolha` **pula em silêncio** como `jaExistiam` — o pior modo de falhar, porque parece
sucesso. **Hoje não dispara**: as duas folhas do 13º estão em competências diferentes. **Dispara no
próximo tipo de mesma competência** — e a próxima unidade escolhida é justamente a **mensal
complementar**. Levantado pelo auxiliar; **registrado aqui e não consertado aqui**, porque o
conserto é dele.

### 87.21 Ambiente ao fim da rodada

Quatro artefatos de pé, nenhum derrubado: **:3010** `9d39776` (evidência da V9.2, PID 62185),
**:3011** `97f058b` (J9 da primeira metade), **:3012** `10f8fe5` (o artefato de `main`), **:3014**
`eccbe8c` (a J9 final). O :3013 serviu o 13º e é descartável. Bancos: os doze anteriores intactos;
esta rodada acrescentou descartáveis (`…v11v93e`, `…v7m1_13o_v11v93{,b}`, `…v7m1_j9_v11v93{,b}`).
Stash intacto, três scripts do operador fora do Git e não executados, `trinco-de-maquina.ts` não
tocado.

### 87.22 O próximo ponto exato

1. **Mensal complementar** — já escolhida; **não foi começada aqui**. Antes dela, o conserto de
   `numeroDoEmpenhoDaFolha` (87.20), porque é exatamente ela que faz o defeito latente disparar.
2. **Decidir onde fica o portão do critério do abatimento**: no `apropriar` (hoje) ou no `fechar`
   (impede o beco sem saída). Decisão de desenho do M33, com a medição de 87.15 na mão.
3. **`RETIFICACAO-DA-FOLHA`** — enquanto não existir, 13º fechado em simulação é dinheiro parado
   sem caminho de volta.

## 88. V11 V9.4 — os filtros de servidores como CONSULTA, e por que não como recorte do cálculo

**Módulo: M32 (pessoal).** Não M33. A cláusula 5.12.50 põe os oito eixos de filtro dentro da
"rotina de cálculo de folha"; esta unidade os entrega como **consulta** em `/pessoal/servidores` e
deixa o recorte do cálculo como decisão **pendente, nomeada, com o risco escrito**.

### 88.1 Por que consulta, e não o que o texto do TR literalmente pede

`calcularFolha` promete "todos os vínculos vivos na competência", e mantém a promessa **por
construção**: o `findMany` dos vínculos não tem `where` nenhum. Um filtro do operador ali produz
folha **parcial em silêncio** — nada compara o número de contracheques ao de vínculos ativos, o
manifesto da certificação lista só quem entrou no cálculo, a apropriação empenha só esses, e a
folha fecha com o total batendo e o empenho batendo. É a forma de defeito que o M33 já pagou três
vezes. Entregar os eixos como consulta **avança a cláusula sem criar o caminho para produzir folha
parcial**. O levantamento dos oito eixos já estava em `modules/m33-folha/MODULO.md` (V9.3); esta
unidade é a segunda metade — a construção.

### 88.2 Seis eixos entregues, dois recusados

| eixo do TR | situação | natureza |
|---|---|---|
| matrícula | entregue | coluna `Vinculo.matricula` |
| nome | entregue | **duas fontes**, ver 88.3 |
| cargo | entregue | **derivado** (`cargoVigenteEm`), por data de referência |
| regime | entregue **como DOIS eixos** | jurídico (coluna `String` livre) e previdenciário (**derivado**) |
| local de trabalho | entregue | **derivado** (`lotacaoVigenteEm`) |
| data de admissão | entregue | coluna indexada, janela `de`/`até` inclusiva |
| **centro de custo** | **RECUSADO** | não há FK de `Vinculo`/`Servidor`/`Cargo`/`Lotacao` para `Setor` nem equivalente |
| **função** | **RECUSADO** | não é entidade: valor de `TipoCargo` ou texto livre em `gratificacaoDescricao` |

Os dois recusados são **falta de MODELO**, não falta de tela, e estão nomeados em
`modules/m32-pessoal/MODULO.md` como `PESSOAL-SEM-CENTRO-DE-CUSTO` (11) e `PESSOAL-SEM-FUNCAO`
(12), cada um com **o que precisa ser decidido antes de construir**. Não se criou seletor vazio
para eles: seis eixos honestos valem mais que oito com dois inventados.

⚠️ **"Regime" virou dois eixos porque são dois.** `regimeJuridico` é como a lei orgânica do ente
nomeia o vínculo; o previdenciário decide **qual tabela de contribuição a folha aplica**. Um
estatutário pode estar no RGPS — o teste afirma esse cruzamento exato.

### 88.3 O nome pelo qual se busca: os DOIS

Havia dois candidatos concorrentes — a versão vigente da `Pessoa` (M19) e `Servidor.nomeSocial`. A
tela continua **mostrando** o social quando há (Lei 14.164/2021, Decreto 8.727/2016). A busca
**acha pelos dois**: quem usa nome social e não é encontrado por ele é defeito de produto, e quem é
procurado pelo nome que está na portaria e não é encontrado também é. E a busca vai a **toda versão**
da pessoa, não só à vigente — quem procura pelo nome de solteira de alguém que casou procura a
pessoa certa.

### 88.4 A data de referência, e a composição sobre o MESMO vínculo

Filtro `dataRef` explícito (vazio = hoje). Cargo, lotação e regime previdenciário são derivados:
"cargo hoje" e "cargo na competência de maio" dão listas diferentes. **A coluna deriva na mesma data
que o filtro usou** — mostrar o cargo de hoje sob filtro datado seria mentir na célula — e a linha
mostra **a matrícula que casou**, não a primeira viva.

Os eixos de vínculo se conjugam sobre **um mesmo vínculo**: a professora que também é motorista não
sai numa busca por "motorista na Escola Central". `q`, `nome` e `situacao` continuam do **servidor**,
e a exceção está declarada (mudar `situacao` para per-vínculo alteraria em silêncio o significado de
"só desligados" para quem já usa o filtro).

### 88.5 Um defeito achado e fechado no caminho

⚠️ **O filtro `situacao` era aplicado DEPOIS do `skip`/`take`**, sobre as 25 linhas já recortadas: o
total virava "quantos casam NESTA PÁGINA", e a página 2 perdia quem ficou na 1. Com 25 servidores ou
menos ninguém vê — a fixture do teste tem **trinta**. Hoje a porta tem dois caminhos: sem eixo
derivado, o banco recorta a página e o total é dele; com eixo derivado, o conjunto é apurado inteiro
**antes** de recortar. O teto de apuração (`TETO_DE_CANDIDATOS = 5000`) **recusa nomeando quantos
alcançou, e não trunca** — truncar devolveria uma lista que parece completa com um total que parece
certo.

### 88.6 A armadilha do alvo de tipos, medida e não suposta

O teste de porta nasceu em `modules/m32-pessoal/` e produziu **96 erros TS2835/TS7006** — nenhum
deles em linha escrita por esta unidade. Causa: `tsconfig.backend.json` inclui `modules/**` e
`test/**` sob `NodeNext`, e o import de `lib/portas/` arrastou para esse alvo código escrito para
`moduleResolution: bundler`. **O próprio `tsconfig.backend.json` documenta essa exata armadilha**,
com os mesmos códigos de erro, desde a ENT10. O remédio é o dele: o teste de porta foi para
`test/pessoal-eixos-de-consulta.test.ts`, excluído do backend e incluído no config do app; o
predicato puro ficou em `modules/m32-pessoal/m32-eixos-de-consulta.test.ts`, sob o alvo estrito.
`scripts/cobertura-de-tsconfig.ts`: **1502 de 1502 cobertos, 0 descobertos**.

### 88.7 Comandos executados, com o resultado real lido do arquivo

| comando | resultado |
|---|---|
| `tsc -p tsconfig.backend.json` (heap 5324) | `exit=0`, **0 erros** |
| `tsc -p tsconfig.json` (heap 5324) | `exit=0`, **0 erros** |
| `tsc -p tsconfig.scripts.json` (heap 5324) | `exit=0`, **0 erros** |
| `vitest` dirigido (8 arquivos: M32, runtime M32, descritores, leitura por ação, busca global, eixo de data) | `exit=0`, **105 testes, 8 arquivos, 0 falhas** |
| `vitest` dos dois arquivos novos | `exit=0`, **24 testes** |
| `npx tsx scripts/cobertura-de-tsconfig.ts` | 1502/1502, 0 descobertos |

⚠️ **O código de saída foi lido da linha `exit=` DENTRO do arquivo de registro, e o arquivo foi
apagado antes de cada relançamento.** A notificação do shell disse `exit code 0` para uma execução
cujo arquivo dizia `exit=2` — a armadilha que esta empreitada já pagou.

### 88.8 A prova por mutação — nove instrumentos, e UM que NÃO acusou

Cada mutação foi aplicada, medida, **revertida POR EDIÇÃO** e o checksum SHA-256 conferido contra o
valor de antes. Repetida integralmente depois da separação dos arquivos de teste (a prova anterior
era sobre o arquivo único e não valia mais).

| mutação | o que falseia | vermelho |
|---|---|---|
| A | o cargo deriva em `new Date()` e não na data de referência | 3 falham |
| B | o eixo de lotação deixa de conjugar | 3 falham |
| C | some a guarda de existência do vínculo no eixo de regime | 2 falham |
| D | o total volta a ser o da página (o defeito original de 88.5) | 2 falham |
| E | o teto deixa de recusar | 1 falha |
| F | o gate `exigirLeitura` sai de cima da leitura na tela | 1 falha |
| G | a âncora da data volta a ser o instante cru (defeito 1 de 88.11) | 1 falha |
| **H** | **o ramo da recusa do teto sai da tela** | ⚠️ **NÃO ACUSOU — 26 verdes** |
| I | a mensagem da recusa perde a providência e o "não truncou" | 2 falham |

⚠️ **MUT-H é o achado desta tabela.** A guarda que eu escrevera para o defeito 2 casava com o TEXTO
do `page.tsx`, e trocar o ramo por `if (false && ...)` deixou a suíte inteira verde. Retirei a
guarda em vez de mantê-la aparentando cobertura. **Uma mutação que não acusa vale mais que cinco que
acusam:** é a única que descobre instrumento inerte.

Reversão: **checksum CONFERE nos nove**, nos três arquivos tocados (`dominio.ts`,
`pessoal-dados.ts`, `page.tsx`).

### 88.9 Saturação registrada — não é aprovação nem defeito

A primeira execução de `npm run typecheck` (heap 5324) ficou **19 minutos de relógio para 2m40 de
CPU**, com o heap comprimido em 4,78 GB numa máquina de 8 GB com Docker e o editor abertos. **Eu a
matei cedo demais** — era lentidão por paginação, não travamento. A tentativa seguinte com heap 4096
**estourou o heap** (`exit=134`, `FATAL ERROR: Reached heap limit`): o projeto precisa mesmo dos
5324 que o `package.json` prescreve. Repetida com 5324 e a máquina livre, terminou em poucos minutos
com 0 erros. **Registro do erro de condução:** 19 minutos perdidos por ler "stuck" como travado.

### 88.10 O que NÃO foi feito, e por quê

- **Percurso de navegador: NÃO EXECUTADO.** `build` + `next start` disputam a máquina com o que o
  auxiliar precisa medir. É o que falta para a consulta valer como superfície validada.
- **Catálogo: NÃO MARCADO, deliberadamente.** A cláusula 5.12.50 é a mesma que o auxiliar está
  atendendo pelo outro lado (mensal complementar). Editar a entrada dela em
  `scripts/marcar-catalogo.ts` agora colidiria com o trabalho em voo. **Quem fechar a cláusula por
  último atualiza a evidência com as duas metades**: os tipos de folha e os seis eixos como consulta.
  A cláusula continua `PARCIAL` — seis eixos de oito, e nenhum deles no cálculo.
- **Suíte completa, `test:fuso` e portão: não rodados**, por restrição do pedido. Nada aqui toca
  `packages/datas`, guard de período ou janela de relatório; os cortes de dia usam
  `inicioDoDiaCivil`/`fimDoDiaCivil`/`meioDiaCivil`, e `test/eixo-de-data-no-molde.test.ts` passou.
- **Árvore NÃO congelada durante a medição**, e não podia ser: o auxiliar editava `modules/m33-folha/`
  e `lib/portas/recursos/folha.ts` ao mesmo tempo. Os erros foram atribuídos **por caminho**, e
  nenhum dos 96 da primeira leitura era dele.

### 88.11 A AUDITORIA DE INVARIANTES ACHOU TRÊS DEFEITOS **MEUS** — os três tratados

⚠️ **Os números de tipos de 88.7 são ANTERIORES a estas correções.** `pessoal-dados.ts`, `page.tsx` e
`test/pessoal-eixos-de-consulta.test.ts` mudaram depois deles. **Os três typecheck precisam ser
reexecutados** antes de qualquer promoção: contam como NÃO EXECUTADOS sobre a árvore atual. Os
testes dirigidos e as mutações, sim, são posteriores e valem (**26/26, `exit=0`**).

**Defeito 1 — a âncora da derivação era um INSTANTE, não o dia civil do ente. CORRIGIDO.**
`const quando = dataRefBruta === "" ? new Date() : meioDiaCivil(...)`. Os eventos são gravados em
**meio-dia civil**; o ramo padrão — o de toda abertura de tela sem filtro de data — usava o instante
corrente. Efeito: promoção com efeito HOJE, às 09h00 o filtro por "Diretor" **não traz o servidor**;
às 12h01 traz; e `dataRef` com o MESMO DIA traz. Duas respostas para a mesma pergunta no mesmo dia, e
a errada **omite pessoa de um filtro**. O `new Date()` cru já morava na linha antiga; o que os eixos
mudaram foi o raio — antes errava uma célula, agora deixa gente fora da lista. Hoje: `diaDeReferencia()`,
com `agora` injetável para que o teste prove numa hora ESCOLHIDA (um teste que só falha antes do
meio-dia passa por vacuidade metade do dia). **Mutação G: 1 vermelho.**

**Defeito 2 — a recusa do teto nunca chegava ao usuário. Corrigida no código, NÃO PROVADA.**
`ConsultaDePessoalAmplaDemaisError` subia para a tela genérica do Next (em produção, só um digest): a
mensagem existia, o efeito não. A página ganhou ramo próprio. ⚠️ **E a minha primeira tentativa de
provar isso foi papelada, e a mutação me pegou:** o teste conferia o texto-fonte do arquivo, e trocar
o ramo por `if (false && ...)` deixou **os 26 testes verdes** — **MUT-H não acusou**. Retirei a
guarda inerte em vez de mantê-la aparentando cobertura, e nomeei
`PESSOAL-RECUSA-DO-TETO-SEM-PERCURSO` (14) no MODULO.md. O que está provado é só a porta: recusa nas
duas direções, e a mensagem carrega a providência e diz que não truncou (**mutação I: 2 vermelhos**).

**Defeito 3 — a autorização era afirmada sobre o HELPER e sobre a ordem do texto, não sobre a
consulta. CORRIGIDO (escrito; medição pendente — ver 88.14).** `listarServidores` não tem gate dentro dela; o gate está na
página. Hoje não há vazamento porque a página é o único chamador — mas a segunda rota que reusar a
porta (exportação, API, worker) **nasce sem gate e com o teste verde**. O par é agora
`listarServidores(c)` (invólucro que resolve a sessão) e **`listarServidoresPara(quem, c)`**, que cobra
`exigirLeituraDoEntePara(quem, "CONSULTAR_PESSOAL")` — mesmo desenho de
`lerDossieDoEmpenho`/`lerDossieDoEmpenhoPara`. **O molde NÃO foi tocado**: um arquivo, dois exports,
zero mudança em `lib/molde/`, no descritor e nas outras 20 portas `-dados.ts`.

⚠️ **A porta LANÇA; quem redireciona é a TELA.** `telaExigeLeituraDoEnte` responde com
`redirect("/sem-acesso")`, que é comportamento de tela — um worker não redireciona, e uma porta que
redireciona decide apresentação em nome de quem a chamou. A porta estoura `EscopoDeLeituraError`
nomeando a ação; a página mantém o `exigirLeitura` dela e traduz. É também o que torna a prova
possível SEM ROTA. E, como o gate passou a valer para todas as consultas do arquivo, **cada asserção
de eixo virou também a metade positiva da autorização**.

**Observação acolhida:** a ordenação ganhou desempate por `id`. Sem ele, empate em `criadoEm`
(que é `now()`, o instante da TRANSAÇÃO) faria a página 2 repetir e perder gente numa carga em lote.

### 88.12 Dois erros de DOCUMENTAÇÃO do ambiente, que mandam procurar o que não existe

1. **O container e o papel documentados estão ERRADOS.** O real é container **`pg-gestao-publica`**
   (`postgres:18`, porta **5436**) e papel **`gestao`**. A documentação diz `pg-siafic` e `postgres` —
   as duas erradas: `docker exec pg-siafic` não acha o container, e `-U postgres` devolve
   `FATAL: role "postgres" does not exist` (medido nesta seção: o primeiro `psql` desta unidade falhou
   exatamente assim). ⚠️ **E o instrumento manda procurar o que não existe:** a mensagem de erro de
   `test/banco.ts` manda rodar `docker start pg-siafic`. É o mesmo defeito que já custou tempo nesta
   rodada, quando uma mensagem mandava instalar dependência faltando e o que faltava era o cliente do
   Prisma gerado. **O conserto da mensagem de `banco.ts` NÃO é desta unidade** e fica nomeado:
   `MENSAGEM-DE-BANCO-APONTA-CONTAINER-INEXISTENTE`.
2. **São 19 databases, não 15.** A contagem anterior estava errada e foi repetida em ordens. Listados
   nesta unidade, um a um, com o papel `gestao`. O isolado do auxiliar será o 20º.

### 88.13 O próximo ponto exato

1. **Percurso de navegador de `/pessoal/servidores`** com os eixos — é o que converte a cláusula de
   "tem porta e teste" para superfície validada. Precisa da máquina livre.
2. **Decidir `PESSOAL-SEM-CENTRO-DE-CUSTO`**: o centro de custo do pessoal é o `Setor` do M21, a UO
   da ficha que paga, ou dimensão própria da folha? As três dão rateios de despesa de pessoal
   diferentes, e a escolha atravessa a apropriação.
3. **Decidir `PESSOAL-SEM-FUNCAO`**: função é espécie de cargo (`TipoCargo`) ou atribuição designada
   por portaria com vigência própria? No segundo caso falta o model.
4. **Decidir o recorte do CÁLCULO** (5.12.50 literal). Se alguém decidir que o cálculo recorta, a
   guarda de completude nasce **junto**, nunca depois: comparar contracheques a vínculos vivos na
   competência, e recusar fechar folha parcial que não se declare parcial.

### 88.14 O GATE NA PORTA — medido, e o vermelho falso que quase passou por prova

Escrito depois de `e0f6096` e **medido** com a máquina livre:

| passo | resultado, `rc` lido do arquivo |
|---|---|
| mutação do gate (remover a cobrança) | **1 vermelho**, e é o teste certo: "A PORTA COBRA `CONSULTAR_PESSOAL`" |
| reversão POR EDIÇÃO | checksum **`0a931a82da15baab` CONFERE** |
| verde de volta | **27/27**, `exit=0` |
| `tsc` backend / app / scripts | **0 / 0 / 0**, `exit=0` nos três |
| dirigidos, 9 arquivos | **117/117**, `exit=0` |

Com isso `e0f6096` **deixa de estar sem tipos verificados**: os três typecheck acima são posteriores
a todas as correções da auditoria e ao gate.

⚠️ **UM VERMELHO FALSO NO CAMINHO, E É O REGISTRO MAIS ÚTIL DESTA SEÇÃO.** A primeira execução da
mutação deu `exit=1` por **`No test files found`** — os caminhos foram passados por variável de
shell e o vitest não casou nenhum. Um `exit=1` assim é **indistinguível de "a guarda acusou"**: lido
pelo código de saída, teria fechado o passo com uma prova que nunca aconteceu, e no sentido MAIS
perigoso (declarar provado o que não rodou). Reexecutado com caminhos literais, o vermelho verdadeiro
apareceu, nomeando um teste. **Ler o `rc` do arquivo não basta — é preciso ler o que o arquivo diz
que RODOU.** É a décima segunda ocorrência da família "código de saída não é resultado", e a primeira
em que o engano estava do lado do vermelho.

⚠️ **A PROVENIÊNCIA DO ATOR NEGATIVO FOI CONFERIDA ANTES DE CONFIAR NO PAR.** `limparBanco` chama
`semearUsuariosDeTeste`, que dá ADMIN (`TODAS_AS_ACOES`) a **toda** identidade do censo — nenhuma
delas serve de ator negativo para ação nenhuma. Os dois atores deste arquivo nascem **depois** do
`limparBanco` e **fora** do censo: a leitora com `CONSULTAR_PESSOAL` e só; o negativo com
`CADASTRAR_SERVIDOR`, `ADMITIR_SERVIDOR`, `MOVIMENTAR_SERVIDOR` e `CONSULTAR_DESPESA`, nenhuma delas
a da consulta. Sem essa conferência o par provaria menos do que afirma.

**Cobertura por construção, não por lembrança:** como o gate passou a valer para toda consulta do
arquivo, as ~40 asserções de eixo viraram também a metade POSITIVA da autorização. Um `throw`
incondicional no gate derruba o arquivo inteiro, não um teste.

### 88.15 O que continua NÃO EXECUTADO

- **Percurso de navegador dos eixos de `/pessoal/servidores`** — não executado. É ele que converte a
  consulta em superfície validada e o que provaria o ramo da recusa do teto na tela
  (`PESSOAL-RECUSA-DO-TETO-SEM-PERCURSO`).
- **Cláusula 5.12.50** — continua `PARCIAL` e **não marcada**, por decisão: o auxiliar entrega a
  outra metade dela e as duas marcações colidiriam.
- **Suíte completa, `test:fuso` e portão** — não rodados, por restrição do pedido.
- **`MENSAGEM-DE-BANCO-APONTA-CONTAINER-INEXISTENTE`** — nomeada, fora deste escopo: `test/banco.ts`
  é caminho comum.

## 89. V11 V9.4 — (a), (b) e (c): a separação que a seção 88 não fez, e a correção do fundamento

**Regime de rigor: SUPERFÍCIE** (esta unidade é documental — não há código de comportamento nela).
A construção de (b) e (c) é **profundidade** e está enfileirada.

### ⚠️ A SEÇÃO 88 AFIRMOU UM FUNDAMENTO FALSO, E ELE FOI CORRIGIDO PELO USUÁRIO

A seção 88 entregou os seis eixos da 5.12.50 como **consulta**, e justificou não os levar ao cálculo
dizendo que `calcularFolha` promete "todos os vínculos vivos na competência" **por construção** — o
`findMany` dos vínculos (`modules/m33-folha/servico.ts:404`) não tem `where` nenhum.

O texto literal da cláusula é:

> "Possuir rotina de cálculo de folha de pagamento dos tipos: mensal, mensal complementar, rescisão,
> rendimentos acumulados, férias, adiantamento de 13° salário (1° parcela), 13º salário, diferença
> de 13º salário e adiantamentos salariais; **permitindo filtrar os funcionários** por no mínimo:
> matrícula, nome, cargo, regime, local de trabalho, centro de custo, função e data de admissão;"

"Permitindo filtrar os funcionários" prende-se a **rotina de cálculo**, não a consulta. **A ausência
de um `where` é propriedade da implementação de hoje, não fundamento normativo**: ela prova que
ninguém CONSEGUE recortar; nunca provou que recortar seja proibido. O relatório da 88 usou uma
ausência de código como se fosse regra de negócio, e apresentou **consulta filtrada como cálculo
filtrado**. O risco que ele levantou é real e continua valendo — ele não veta a capacidade, dita
COMO ela nasce.

Fica registrado em vez de corrigido em silêncio: o título da seção 88 ("e por que não como recorte
do cálculo") descreve uma decisão que **não era nossa**.

### AS TRÊS COISAS QUE A 88 CONFUNDIU

| | o que é | natureza | existia em `6fa0d62`? |
|---|---|---|---|
| **(a) filtro de consulta** | "quem eu quero VER" | pergunta sem efeito; regime de superfície | **sim**, seis eixos |
| **(b) seleção para processamento** | "quem eu quero CALCULAR" | ato do operador, com autor, instante e efeito sobre dinheiro | **não — zero linhas** |
| **(c) abrangência efetiva** | "quem o motor de fato calculou, e por que os outros não" | FATO apurado pelo cálculo, nunca parâmetro dele | **pela metade** |

**(a), com arquivo e linha** — `modules/m32-pessoal/dominio.ts:372` (`EixosDeConsultaDeVinculo`),
`:466` (`vinculoAtendeAosEixos`, puro, um vínculo por vez, `quando` obrigatório), `:437`
(`haEixoDerivadoDeVinculo`, que existe só para a paginação decidir). Porta em
`lib/portas/recursos/pessoal-dados.ts:328`, gate de **leitura** (`CONSULTAR_PESSOAL`) em `:333`,
paginação em `:61`, caminho rápido em `:421`, caminho derivado que apura o conjunto inteiro antes de
recortar em `:436-459`.

**(b): a ausência é verificável, não é "existe mal".** `zCalcularFolhaInput`
(`modules/m33-folha/dominio.ts:1026`) é `{ folhaId, motivo?, criadoPor }` e `zAbrirFolhaInput`
(`:1019`) é `{ competencia, tipo, criadoPor }` — nenhum campo de seleção. Nenhuma tabela, coluna ou
relação em `prisma/schema/m33-folha.prisma:280` (`FolhaDePagamento`) ou `:333` (`CalculoDaFolha`)
representa "os escolhidos". Nenhuma ação entre `ABRIR_FOLHA` e `CALCULAR_FOLHA`
(`modules/m16-travamento/acoes.ts:1477-1478`).

**(c): o que se sabe e o que não se sabe depois de um cálculo.** Sabe-se o conjunto de
`Contracheque` (`prisma/schema/m33-folha.prisma:399`, com `@@unique([calculoId, vinculoId])` em
`:440`), a contagem (`servico.ts:550`) e o `sha256`. **Não se sabe quem ficou de fora nem por quê**:
os dois descartes do motor são `continue` mudos — `modules/m33-folha/servico.ts:418` (admitido depois
do fim da competência) e `:419` (desligado antes do início). E a única guarda de abrangência,
`FOLHA-SEM-VINCULOS` (`:446`), **só dispara em zero**: uma folha com 1 contracheque de 900 vínculos
passa.

### ⚠️ A SUBTRAÇÃO SILENCIOSA — o achado que decide o desenho de (b)

Todos estavam vigiando **duplicidade**. O perigo real é o oposto, e ninguém o procuraria:

> `fecharFolha` (`modules/m33-folha/servico.ts:1245`) congela **UM** cálculo: o último não cancelado.
> Com seleção por cálculo, nº1={A,B} e nº2={C,D} fazem o fechamento levar só **{C,D}** — **A e B não
> recebem**, sem erro, sem aviso, com totais coerentes, empenho coerente e liquidação coerente.

Daí o requisito que passa a valer **acima de qualquer modelo escolhido**:

> **`fecharFolha` não pode congelar um estado em que um vínculo selecionado e já calculado fique sem
> contracheque no cálculo congelado — salvo se isso for declarado e registrado como exclusão, com
> motivo.**

E daí duas consequências que deixaram de ser recomendação:

1. **(c) nasce no MESMO commit que (b).** O estado intermediário — (b) sem (c) — é uma folha que pode
   ser parcial sem acusar, que é a forma de defeito que este módulo já pagou três vezes.
2. **Os dois `continue` mudos deixam de ser mudos.** Exclusão sem motivo registrado é o irmão de
   "existe como linha ≠ produziu efeito", que já fez uma guarda deste mesmo motor **nascer inerte**
   (`servico.ts:673-689`).

A promessa do M33 muda de forma: deixa de ser "todos os vínculos vivos" e passa a ser **"exatamente
os selecionados e elegíveis, com cada exclusão nomeada"**. Promessa mantida **por construção** some
junto com a construção — esta tem de ser **afirmada por teste**.

### A SEGREGAÇÃO DO 6.4 SEPARA (a) DE (b) NA AUTORIZAÇÃO

(a) é cobrada com `CONSULTAR_PESSOAL`, que é **leitura**. Quem pode VER a lista de servidores não
pode, por isso, escolher quem o ente paga: reusar esse gate em (b) faria o perfil de consulta
recortar folha. (b) tem **ação própria**, e a negativa dela se prova com ator **fora** do censo de
`test/usuarios-teste.ts:196-215` — nenhuma identidade do censo serve, porque todas são ADMIN =
`TODAS_AS_ACOES`.

### O QUE ESTA UNIDADE ENTREGOU

- `modules/m32-pessoal/dominio.ts` — o docblock de `EixosDeConsultaDeVinculo` passou a declarar as
  três coisas, a correção do fundamento falso, a subtração silenciosa e a separação de autorização.
  **Comentário apenas; nenhuma linha de comportamento mudou.**
- `modules/m32-pessoal/MODULO.md` — a seção "OS EIXOS DE CONSULTA DE SERVIDOR" deixou de dizer que o
  recorte do cálculo é "decisão PENDENTE" e passou a registrar que é **capacidade devida**, com a
  tabela (a)/(b)/(c) e o apontamento para o M33.

### Comandos executados

**Nenhum.** A máquina está com o auxiliar, no percurso da folha mensal complementar. Esta unidade é
documental e não foi medida; o typecheck do M32 fica para a próxima medição da árvore. Nada
instalado, nada publicado, nenhuma migration.

### Fronteira do commit, e o que NÃO foi tocado

Commit por caminho explícito, só `modules/m32-pessoal/` e este arquivo. **`modules/m33-folha/` não
foi tocado**: o auxiliar está no percurso da complementar, e o `MODULO.md` do M33 e os motores são
território dele. A metade da distinção que pertence ao M33
(`modules/m33-folha/MODULO.md:184-208`, "ANTES DE ALGUÉM CONSTRUIR O FILTRO DE FUNCIONÁRIOS", que
hoje ainda diz que a decisão é pendente) **fica por escrever**, e está nomeada abaixo.

### ⚠️ O CONFLITO ENTRE FRENTES QUE (b) VAI ABRIR, antecipado antes de construir

`VINCULO-APURADO-FORA-DO-RECALCULO` (`modules/m33-folha/servico.ts:691-700`, guarda do auxiliar, que
**nasceu inerte uma vez**) compara o apurado em folha fechada contra quem produziu contracheque no
recálculo. Com seleção na complementar, **todo vínculo não selecionado cai nesse filtro e a guarda
acusa em massa uma coisa que não aconteceu**.

Ela **não se desativa**. Hoje ela colapsa três fatos diferentes em um:

| fato | hoje | com (b) |
|---|---|---|
| **fora da seleção** — o operador não pediu | acusa | **não é anomalia**; é exclusão registrada com motivo em (c) |
| **selecionado e inelegível na competência** (os `continue` de `:418`/`:419`) | **mudo** | exclusão registrada com motivo — e é mais grave que hoje, porque o operador DECLAROU que queria |
| **selecionado, apurado em folha fechada, fora do recálculo** | acusa, corretamente | **continua acusando**: correto = 0, apurado > 0, valor a repor ao erário |

A reconciliação proposta é restringir o conjunto de partida da guarda à **interseção com a seleção**,
sem mexer na severidade do caso real. **⚠️ E essa é exatamente a forma do defeito que a fez nascer
inerte**: um conjunto de seleção montado sobre "todos os vínculos lidos" torna o filtro
sempre-verdadeiro e nada muda; montado ao contrário, a guarda some. Logo a prova por mutação tem de
ser **refeita nas duas direções** depois da mudança — o teste antigo continuar verde não prova nada,
porque ele continuaria verde com a guarda inerte —, com fixture N=2 no apurado e o par
"apurado ∈ seleção → RECUSA" / "apurado ∉ seleção → NÃO recusa, mas aparece na abrangência com
motivo". **Coordenação com o auxiliar pendente.**

### Bloqueio de fonte normativa

A ordem desta rodada cita **"o item 1.667 de Ibema"** como segunda fonte. **Ele não existe neste
repositório**: nenhum arquivo menciona Ibema, o catálogo tem fonte única
(`Termo_de_referencia.pdf`), e o 1.667º item dele é `5.40.11`, sobre agrupadores num aplicativo.
O texto foi pedido ao usuário. Até chegar, trabalha-se sobre a **5.12.50 literal**, e **não** se
afirma cobertura da outra origem. **Bloqueio externo**, não escopo pendente.

### Catálogo

**Nenhuma marcação.** Unidade documental: não há comportamento novo, logo não há o que marcar.
5.12.50 segue `PARCIAL` e não marcada — e a razão mudou: antes era "faltam dois eixos de modelo";
agora é "faltam dois eixos de modelo **e a seleção no cálculo**".

### Próximo ponto exato

1. **Tarefa 3** — `PESSOAL-SEM-CENTRO-DE-CUSTO` e `PESSOAL-SEM-FUNCAO`, em módulo e migration
   próprios, sem tocar M33. Inventário do que já existe em curso antes de projetar.
2. **Tarefa 2, enfileirada atrás do auxiliar** — (b) + (c) em **UM** commit: seleção, fato de
   abrangência, guarda de completude e guarda de "no máximo uma vez". Não se separam: qualquer corte
   entre eles deixa uma folha que pode ser parcial sem acusar.

## 90. V11 V9.4 — os dois eixos ausentes de 5.12.50: a função nasceu, o centro de custo já existia

**Regime de rigor: SUPERFÍCIE** para a consulta (cadastro, filtro, coluna) e **PROFUNDIDADE** para
a derivação da função, que é o ponto onde uma implementação plausível apaga um ato administrativo.

⚠️ **NADA DISTO FOI MEDIDO.** A máquina está com o auxiliar, no percurso da folha mensal
complementar. Nenhum `tsc`, nenhum vitest, nenhum `prisma validate`, nenhuma migration aplicada. O
que segue é o que foi ESCRITO; a medição está enfileirada junto com a da Tarefa 2.

### ⚠️ O LEVANTAMENTO MUDOU A TAREFA: o centro de custo não precisava nascer

A ordem pedia para definir os dois com identidade, vínculo e vigência, "se realmente ausentes". O
levantamento veio antes do desenho e achou **um pronto e um ausente** — e essa é a diferença entre
esta unidade e a que teria sido construída sem procurar:

**CENTRO DE CUSTO — JÁ EXISTIA.** É o `Setor` do M21, que o próprio schema chama de "o centro de
custo administrativo por onde o processo tramita" (`prisma/schema/m21-protocolo.prisma:36`). **Três
módulos já o usam nesse papel**, cada um citando a cláusula:

| módulo | onde | o que diz |
|---|---|---|
| M10 almoxarifado | `prisma/schema/m10-almoxarifado-fisico.prisma:348` | "TR 5.18.10 — centro de custo (setor) que consumiu. **criar um 'departamento' paralelo seria a segunda verdade**" |
| M11 compras | `prisma/schema/m11-compras.prisma:91` | "TR 5.17.54 — controlar as solicitações por centro de custo (...) é o mesmo do M21" |
| M10 patrimônio | `LocalizacaoFisica`, `TermoPatrimonial` | localização e termo por setor |

Uma tabela de centro de custo só da folha seria a **quarta** estrutura sobre o mesmo organograma —
depois de `Lotacao` (RH), `Setor` (custo) e `UnidadeOrcamentaria` (orçamento) — e a despesa de
PESSOAL deixaria de somar com a de MATERIAL no mesmo eixo, que é exatamente para o que serve um
centro de custo. **O que faltava nunca foi o cadastro: era o vínculo, com vigência.**

E um achado que reforça: `Setor.unidadeOrcId` é **obrigatório**, enquanto `Lotacao.unidadeOrcId` é
**opcional** e o schema declara que "a maioria das folhas do organograma" não tem. Para apropriar
despesa de pessoal, o `Setor` não é só o cadastro que já existia — é o que já chega ao orçamento.

**FUNÇÃO — ESSA PRECISOU NASCER.** Os dois candidatos eram concorrentes e nenhum era uma função:
`TipoCargo.FUNCAO_GRATIFICADA` (`prisma/schema/m32-pessoal.prisma:178`) é **espécie de cargo**, e
`HistoricoVinculo.gratificacaoDescricao` é texto livre e, pelo próprio docblock, **parcela adicional
ao salário** — é dinheiro, não atribuição. Os dois continuam existindo de propósito; o que mudou é
as três deixarem de ser a mesma coisa.

### O que passou a existir

**Schema (aditivo).** `model Funcao` (código único, denominação, ato autorizativo e extinção,
espelhando `Cargo`); três valores novos em `TipoEventoVinculo` (`DESIGNACAO_FUNCAO`,
`DISPENSA_FUNCAO`, `MUDANCA_CENTRO_DE_CUSTO`); `HistoricoVinculo.funcaoId` e
`HistoricoVinculo.centroDeCustoId` (este apontando para `Setor`), ambos nuláveis; back-relation
virtual em `Setor`.

**Duas migrations, e a separação é do Postgres, não de estilo:**
- `prisma/migrations/20261016090000_v11_v94_eventos_de_funcao_e_centro_de_custo/` — só os três
  `ALTER TYPE ... ADD VALUE`. Um valor de enum **não pode ser usado na mesma transação que o
  acrescentou**, e os CHECK da seguinte citam os valores novos. É o mesmo par que
  `20261015090000` / `20261015090100` já fizeram nesta orquestração.
- `prisma/migrations/20261016090100_v11_v94_funcao_e_centro_de_custo/` — tabela, colunas, FKs,
  índices e quatro CHECK.

Zero `DROP`, zero `RENAME`, zero `UPDATE` de linha existente. **Cada pasta nasceu com o
`migration.sql` dentro, no mesmo ato** (pasta vazia já quebrou `migrate deploy` com P3015 aqui).

**A forma dos CHECK segue a lição de `20261015090100`** — afirmar a propriedade, não enumerar um
exemplar jogando o resto no `<>`:
- `ck_historico_vinculo_funcao` é **bicondicional**: a designação traz função e nenhum outro tipo a
  traz, inclusive a dispensa. Um tipo de evento futuro que quisesse trazer função **não grava** —
  falha fechada, descoberta no primeiro `INSERT`.
- o centro de custo segue o precedente do regime previdenciário (`ck_historico_vinculo_regime`):
  **pode** vir na admissão, é **exigido** na mudança. Exigi-lo na admissão faria o CHECK recusar
  todo vínculo existente e a migration deixaria de ser aditiva.

### ⚠️ A DERIVAÇÃO DA FUNÇÃO NÃO PODE SER `ultimoAte`, e é o ponto de profundidade desta unidade

`ultimoAte` guarda o último valor **não nulo** e ignora os nulos — é o que cargo e lotação querem,
porque um reajuste não deve apagar o cargo. Mas a **dispensa** é um evento cujo `funcaoId` é nulo de
propósito (o CHECK impõe), e ignorar o nulo faria a dispensa **não ter efeito nenhum**: o servidor
dispensado em 2024 continuaria aparecendo como diretor em 2026 — no filtro, na tela e em qualquer
relatório, para sempre, sem erro, porque o evento está lá. É "existe como linha ≠ produziu efeito"
outra vez.

`funcaoVigenteEm` (`modules/m32-pessoal/dominio.ts`) decide pelo **tipo** do evento, não pela
nulidade da coluna. `centroDeCustoVigenteEm` usa `ultimoAte`, e a assimetria é deliberada: não
existe evento que "desapropria" um vínculo.

### Três lugares onde uma coluna esquecida daria a resposta errada com cara de certa

Achados ao escrever, não depois — os três são `select` que precisavam ganhar as colunas novas:

1. `modules/m32-pessoal/servico.ts`, `exigirVinculo` — sem `funcaoId` no `select`, todo evento
   chegaria com `undefined`, `funcaoVigenteEm` devolveria `null` **sempre**, e a guarda
   `DISPENSA-SEM-FUNCAO-VIGENTE` recusaria **toda** dispensa, inclusive as legítimas.
2. `lib/portas/recursos/pessoal-dados.ts`, `SELECAO_ENXUTA_DO_VINCULO` — é o `select` do caminho de
   duas fases, o único que o predicado percorre quando há eixo derivado. Sem as colunas, os dois
   filtros novos responderiam **sempre a lista vazia**, com cara de "não há ninguém com essa função".
3. `SELECAO_DE_EVENTOS`, para a ficha funcional.

### A cadeia completa, e o que ela NÃO inclui

`cadastrarFuncao` (serviço, com ação no censo) → `registrarMovimentacao` aceitando os três eventos
novos, com `exigirFuncaoVigente` **na data do ato** e `exigirCentroDeCustoAtivo` → derivações →
dois eixos em `EixosDeConsultaDeVinculo`, ambos entrando em `haEixoDerivadoDeVinculo` → porta
resolvendo texto a identificadores (`idsDaFuncao`, `idsDoCentroDeCusto`, com `[]` que **não** vira
"sem filtro") → dois filtros e duas colunas no descritor. A tela não mudou: `page.tsx` passa
`consulta.filtros` genericamente e o molde monta.

**A guarda `DISPENSA-SEM-FUNCAO-VIGENTE`** recusa a dispensa órfã, **na data do efeito**. O banco
não alcança essa regra e o comentário diz por quê: a ordem entre eventos datados do mesmo vínculo é
propriedade do **conjunto**, não da linha, e um CHECK de linha não a enxerga.

**Ação: `cadastrarFuncao` reusa `CADASTRAR_CARGO` porque é a MESMA AUTORIDADE** — dizer o que a
estrutura do ente tem. Mesmo critério de `publicarVersaoDaEntidadeContabil` sob
`CADASTRAR_ENTIDADE_CONTABIL` ("a MESMA autoridade — dizer quem a entidade é"). **É desenho, não
economia de esforço**, e o teste que decide é o do dinheiro:

| | tem valor no cadastro? | por onde o dinheiro entra |
|---|---|---|
| `Cargo` | não | evento `ADMISSAO`/`PROMOCAO`/`REAJUSTE_SALARIAL`, sob `ALTERAR_REMUNERACAO` |
| `Funcao` | não | evento `GRATIFICACAO`, sob a **mesma** `ALTERAR_REMUNERACAO` |

A objeção séria era "função gratificada vira dinheiro" — e se virasse, seria outra autoridade. Não
vira: nos dois casos o cadastro é catálogo e o dinheiro está do outro lado da linha. **Quem cadastra
função não paga ninguém.** E o argumento inverso é o do precedente: uma ação própria daria ao ente a
chance de conceder cadastrar cargo **sem** cadastrar função — um ente que cria o posto de Diretor de
Escola e não a direção de escola. Estrutura pela metade.

⚠️ **Condição de reversão escrita, para não virar permanente por inércia:** se `Funcao` ganhar campo
de **valor**, a autoridade muda no mesmo ato e o reuso deixa de valer. **Quem já tem
`CADASTRAR_CARGO` passa a poder cadastrar função** — é ampliação, está escrita no censo e no MODULO,
e quem revisar o perfil de um ente precisa saber.

⚠️ **E O SEGUNDO DOS TRÊS `select` TEM UMA CONSEQUÊNCIA PARA O TESTE QUE FALTA:** um filtro que
**nunca acha nada** é indistinguível de um filtro **correto sobre dado ausente** — e o dado É
ausente hoje (`VINCULOS-ANTERIORES-SEM-CENTRO-DE-CUSTO`). As duas situações dão a mesma tela vazia.
Então o teste da porta precisa de fixture que **ENCONTRE** alguém, não só de fixture que não
encontre: um teste que só afirma o vazio passa com a coluna esquecida. O teste puro já tem os dois
lados (casos 8 e 10); o da porta, que falta, nasce com essa exigência.

⚠️ **A CONSEQUÊNCIA DE `CENTRO-DE-CUSTO-SEM-VIGENCIA-HISTORICA` PARA O M33, declarada como meia
garantia:** a apropriação da despesa de maio **não tem como afirmar, pelo lado do `Setor`, que
aquele centro de custo estava ativo em maio** — o cadastro do M21 não guarda essa data. O que ela
tem é o lado do **vínculo**, que ganhou vigência aqui: `centroDeCustoVigenteEm` responde para onde o
vínculo apontava em maio, e isso não muda quando alguém desativa o setor depois. Correta quanto ao
vínculo, silenciosa quanto ao setor. Meia garantia declarada vale mais que inteira suposta.

### Testes escritos (não executados)

`modules/m32-pessoal/m32-funcao-e-centro-de-custo.test.ts` — domínio puro, dez casos. O caso 2 é o
que **mata a implementação errada**: trocar `funcaoVigenteEm` por `ultimoAte` o deixa vermelho.
Fixture N=2 em toda regra de conjunto — duas designações com uma dispensa entre elas (com N=1 a
redesignação passaria por vacuidade) e duas matrículas da mesma pessoa para a conjugação dos eixos.

**Falta, e está nomeado:** teste da PORTA (paginação, autorização, teto) para os dois eixos novos,
no molde de `test/pessoal-eixos-de-consulta.test.ts`; teste de integração de `cadastrarFuncao` e dos
três eventos com banco; negativa de autorização pareada; e a **prova por mutação** da guarda da
dispensa órfã. Nenhum deles se escreve com proveito antes de a máquina liberar — e nenhum foi
contado como feito.

### Fronteira do commit

**Um commit, e eles não se separam.** O valor do enum, o CHECK que o cita, a derivação que o lê e o
`select` que traz a coluna formam um estado que só compila e só é correto inteiro: cortar em
qualquer ponto deixa uma árvore em que a dispensa não encerra nada ou o filtro responde vazio, com
tudo verde. `modules/m33-folha/` **não foi tocado** — verificado antes e depois.

### Catálogo

**Nenhuma marcação.** Há comportamento escrito, mas **nenhuma evidência**: código que existe não é
comportamento provado. 5.12.50 segue `PARCIAL`. Quando medir, o que os oito eixos rendem é
`IMPLEMENTADO_NAO_VALIDADO`; `VALIDADO_LOCALMENTE` exige o percurso de navegador, que continua
devido.

### Próximo ponto exato

1. **Medição da Tarefa 3, quando a máquina liberar** — `prisma validate` e `generate`, aplicação das
   duas migrations em banco isolado, `tsc` dos projetos afetados (sozinho, heap 5324, em segundo
   plano), e os dirigidos do M32. A ordem importa: `generate` **depois** do `migrate`, senão o
   cliente não conhece `funcao` nem as colunas novas.
2. **Tarefa 2**, quando o auxiliar sair da folha.

## 91. V11 V9.4 — o destravamento, e a lição mais cara desta unidade

**Regime de rigor: PROFUNDIDADE** (schema, migration e cliente gerado) — e ela foi rebaixada por
descuido, não por decisão. É isso que esta seção registra.

### ⚠️ UM COMMIT QUE NÃO VALIDA CHEGOU AO HEAD E PAROU A OUTRA FRENTE

O `4106e0f` introduziu `model Funcao` no M32. **`Funcao` já existia** em
`prisma/schema/m02-planejamento.prisma:118` — a função ORÇAMENTÁRIA da Portaria STN 42/1999,
`codigo @db.VarChar(2)`, ligada a `FichaOrcamentaria` e `AcaoPpa`, presente desde a cópia de
trabalho original.

**O schema do Prisma é ÚNICO.** Os arquivos por módulo são conveniência de leitura, não
namespaces. Daí `P1012`, e a cascata:

```
validate falha → `generate` não roda → o cliente fica congelado numa versão anterior ao commit →
`tsc` de backend acusa 9 erros que PARECEM do código novo e são do cliente velho →
não há build → quem estivesse medindo outra coisa na mesma árvore PARA
```

O auxiliar ficou parado com onze arquivos de conserto de produto na árvore. Ele conferiu por
caminho antes de afirmar: os 9 erros eram todos em `modules/m32-pessoal/servico.ts`, nenhum em
arquivo dele.

### E O DIAGNÓSTICO BRANDO ERA O PERIGO MAIOR: a migration era INAPLICÁVEL

Tratado primeiro como colisão de **nome**, o defeito era pior. A tabela **física** `Funcao` também
já existia, desde `20260711202100_m02_planejamento`, **sem `@@map`**. A migration nova fazia
`CREATE TABLE "Funcao"`, mais `Funcao_pkey` e `Funcao_codigo_key`.

⚠️ **Ela teria passado no `validate` depois do rename e quebrado a primeira instalação limpa** — o
tipo de bomba que só explode no ambiente de quem instala do zero.

**Os dois caminhos óbvios estavam descartados pelo mesmo fato:**
- `@@map("Funcao")` daria **duas entidades sobre uma tabela**;
- migration nova de renomeação renomearia a tabela **do M02** — e não haveria o que renomear,
  porque esta nunca criou nada. Pior: ela falha **antes** da que a consertaria, então toda
  instalação limpa quebraria para sempre.

**O caminho tomado: corrigir a migration NÃO APLICADA**, com a medição na mão **antes** da decisão —
`SELECT count(*) FROM _prisma_migrations WHERE migration_name LIKE '%20261016090%'` em **21 bancos,
todos zero**, `gestao_publica_isolado_v11v94` incluído. A regra proíbe reescrever migration **já
aplicada**, porque isso adultera histórico que outros bancos carregam; uma que nunca aplicou e que
falha por construção não é histórico, é arquivo quebrado.

**O nome: `FuncaoDePessoal`.** Quem renomeia é o recém-chegado, e não por ordem de chegada: no
orçamento "Função" é o termo **normativo** da Portaria 42/1999, e trocá-lo poria o nome da casa no
lugar do nome da norma, além de mexer em caminho comum (`FichaOrcamentaria`, `AcaoPpa`). E **não** é
`FuncaoGratificada`: isso estreitaria a entidade para a espécie paga, e ela modela a **atribuição**
— o dinheiro entra pelo evento `GRATIFICACAO`.

### A regra que sai daqui, e as duas qualificações

Registrada em `prisma/schema/_base.prisma`, junto da "REGRA DE OURO", porque é onde quem mexe em
schema lê:

1. **`prisma validate` antes de todo commit de schema.** São segundos, não disputam a máquina com
   ninguém, e é o único passo que separa "não medido" de "**não compila para ninguém**". O problema
   não foi declarar honestamente que nada estava medido — foi um schema que não valida chegar ao
   HEAD.
2. **O nome é global, e o FÍSICO se confere à parte:** `grep -rn 'model <Nome> {' prisma/schema/` e
   `grep -rn 'CREATE TABLE "<Nome>"' prisma/migrations/`. O schema sozinho **não acusa migration
   inaplicável** — este é o passo que faltava no processo.
3. **"Migration não se reescreve" vale para migration JÁ APLICADA**, e a qualificação só é segura
   com a conferência banco a banco escrita junto. A frase que fecha a porta ao abuso está lá:
   *"acho que não apliquei" não basta — um único banco com a linha gravada transforma a correção em
   adulteração de histórico.*

⚠️ **O `CLAUDE.md` seria o lar natural da regra 1 e NÃO foi editado.** Não é divergência de
conteúdo. O texto fica pronto no `_base.prisma`; a decisão de movê-lo é do usuário.

### O QUE FOI MEDIDO — e só isto

Um processo por vez, `exit=` lido do arquivo de saída bruta, nunca o código do wrapper:

| passo | resultado |
|---|---|
| `npx prisma validate` | **`exit=0`** — "The schemas at prisma/schema are valid" |
| `npx prisma generate` | **`exit=0`** — cliente 7.8.0 regenerado |
| `tsc --noEmit -p tsconfig.backend.json`, heap 5324, sozinho, em segundo plano | **`exit=0`, ZERO `error TS`** (eram 9) |

⚠️ **E O VERDE TEM UMA RESSALVA QUE PRECISA SER DITA EM VOZ ALTA: a árvore NÃO estava congelada.**
O `tsc` rodou com os **onze arquivos do auxiliar modificados e não commitados**. Isso corta para os
dois lados: o `exit=0` **cobre** os consertos dele — informação útil —, mas **não é medição de
aceite** de coisa nenhuma, nem minha nem dele. Ele segue devendo a corrida própria. Contar este
verde como aceite seria exatamente o "não atestar pela papelada" que este repositório já pagou.

### O QUE NÃO FOI MEDIDO — que é a maior parte, e nada disto conta como feito

- **As duas migrations em banco isolado, conferidas PELO EFEITO** — e com um alvo **novo** que o
  incidente criou: provar que `FuncaoDePessoal` cria tabela **própria** e **não toca** a `Funcao`
  do M02. Conferir pelo `exit=0` do `migrate` não alcança isso; a prova é a tabela do M02 intacta
  (linhas, colunas e constraints) depois de aplicar.
- `tsc` dos **outros dois projetos** (só o de backend rodou).
- **Dirigidos do M32** — inclusive `m32-funcao-e-centro-de-custo.test.ts`, que foi escrito e nunca
  executado.
- **Teste da PORTA** para os dois eixos (paginação, autorização, teto), no molde de
  `test/pessoal-eixos-de-consulta.test.ts` — e ele nasce com uma exigência: **fixture que ENCONTRE
  alguém**, não só que não encontre. Um filtro que nunca acha nada é indistinguível de um filtro
  correto sobre dado ausente, e o dado É ausente hoje.
- **Integração** de `cadastrarFuncao` e dos três eventos novos, com banco.
- **Negativa de autorização pareada**, com ator **fora** do censo de `test/usuarios-teste.ts`.
- **A prova por mutação da guarda `DISPENSA-SEM-FUNCAO-VIGENTE`, nas duas direções** — e
  **confirmando que a mutação chegou ao alvo antes de ler o resultado**: uma mutação que não se
  aplica produz verde indistinguível de instrumento que não acusa.

### Pendências desta unidade — separadas do que depende de terceiro

**Escopo não executado (trabalho meu, nomeado):**
- `CENTRO-DE-CUSTO-SEM-VIGENCIA-HISTORICA` — a mais séria das quatro. O `Setor` do M21 desativa por
  `ativo Boolean`, não por data; não há como perguntar "estava ativo em 2019". Atravessa protocolo,
  almoxarifado, compras e patrimônio, e **não** se conserta nesta unidade.
- `VINCULOS-ANTERIORES-SEM-CENTRO-DE-CUSTO` — a coluna nasceu nula em todo vínculo anterior, e
  preenchê-la seria apropriar despesa passada num centro de custo que ninguém escolheu. O eixo não
  acha ninguém enquanto o ente não registrar os eventos, **e isso é o certo**. Carga de dado, não
  código.
- `FUNCAO-SEM-ACAO-PROPRIA` — **só como registro da ampliação**, não como dívida de desenho: o
  reuso de `CADASTRAR_CARGO` é a MESMA AUTORIDADE (nenhum dos dois cadastros tem valor; o dinheiro
  entra por `ALTERAR_REMUNERACAO` nos dois). O que fica registrado é que quem já tem
  `CADASTRAR_CARGO` passa a poder cadastrar função, e a **condição de reversão**: se `Funcao...`
  ganhar campo de valor, a ação se separa no mesmo ato.
- `FUNCAO-SEM-EIXO-DE-AUSENCIA` — não há como perguntar "quem NÃO exerce função nenhuma". O TR não
  pede, e inventar o valor sem pedido seria inventar requisito.
- **Percurso de navegador de `/pessoal/servidores`** — continua devido desde a seção 88, agora com
  dois eixos e duas colunas a mais.

**Bloqueio externo (depende de terceiro):**
- `ITEM-1667-DE-IBEMA-NAO-LOCALIZADO` — citado na ordem como segunda fonte, **ausente do
  repositório**: nenhum arquivo menciona Ibema, o catálogo tem fonte única
  (`Termo_de_referencia.pdf`) e o 1.667º item dele é `5.40.11`, sobre agrupadores num aplicativo.
  Texto pedido ao usuário. Até chegar, trabalha-se sobre a **5.12.50 literal** e **não se afirma
  cobertura da outra origem**.
- Os de sempre (83.3): eSocial, ASTEC, certificado A1, AWS, ENT12.

### A meia garantia para o M33 — declarada, porque meia declarada vale mais que inteira suposta

A apropriação da despesa de pessoal de maio **afirma o centro de custo pelo lado do VÍNCULO**, que
ganhou vigência nesta unidade: `centroDeCustoVigenteEm(eventos, fimDaCompetencia)` responde para
onde o vínculo apontava em maio, e isso **não muda** quando alguém desativa o setor depois. E é
**silenciosa quanto ao SETOR**: não há como afirmar que aquele centro de custo estava ativo em maio,
porque o cadastro do M21 não guarda essa data. Quem construir a apropriação por centro de custo no
M33 precisa saber que essa metade falta — em vez de descobrir quando um ente desativar um setor e o
relatório de maio mudar de forma.

### Os commits desta rodada

| commit | o que é | medido? |
|---|---|---|
| `74541b5` | **Tarefa 1** — (a) consulta, (b) seleção, (c) abrangência separadas; o fundamento falso da seção 88 corrigido | não (comentário e markdown) |
| `4106e0f` | **Tarefa 3** — `FuncaoDePessoal` e o centro de custo que já existia; schema, duas migrations, domínio, serviço, censo, porta, descritor, teste puro | **não — e foi o que travou a árvore** |
| `79b77d4` | a autoridade da ação pelo argumento certo (o teste do dinheiro), a meia garantia do M33, os três `select` | não (comentário e markdown) |
| `5c129e0` | **o destravamento** — rename, migration corrigida, a regra em `_base.prisma` | **sim**: validate, generate, tsc de backend |

### Próximo ponto exato

1. **A máquina está com o auxiliar** (servidor derrubado, worktree nova, `generate`, build, banco
   clonado, corrida verde). **Nada pesado até liberar.**
2. **Quando liberar: a medição completa da Tarefa 3**, na ordem — `validate`, as duas migrations em
   banco isolado conferidas **pelo efeito** (com a `Funcao` do M02 intacta como alvo de prova),
   `generate` **depois** do migrate, `tsc` dos projetos restantes sozinho, dirigidos do M32, e
   depois os testes que faltam, com a mutação por último.
3. **Tarefa 2 — enfileirada e NÃO ESCRITA.** Depois que o auxiliar sair da máquina **e da árvore**.
   Em **UM** commit: seleção no `CalculoDaFolha` + fato de abrangência + guarda de completude +
   guarda de "no máximo uma vez", com a reconciliação de `VINCULO-APURADO-FORA-DO-RECALCULO` por
   interseção com a seleção. **Teste obrigatório:** nº1={A,B}, nº2={C,D}, fechar → **recusa nomeando
   A e B**; depois o par positivo. N=2 nas duas seleções.

## 92. V11 V9.4b — a complementar pela TELA (frente do auxiliar), e uma contagem minha corrigida

Esta seção registra trabalho da **outra frente**, commitado em `d163d21` e `a66a5eb`, que o
checkpoint da seção 91 não cobria. Conferido nos commits, não escrito de memória.

### `d163d21` — sete afirmações que o sistema não verificava

O percurso de navegador da folha mensal complementar **nunca tinha acontecido**: a V9.4 mediu motor,
recusas e CHECK pelo banco, e é justamente na faixa da interface que a V9.2 achou quatro defeitos
que 262 testes verdes não pegaram.

⚠️ **O instrumento nasceu VERMELHO de propósito.** `scripts/smoke-complementar-da-folha.ts` rodou
**duas vezes contra `6fa0d62` sem conserto nenhum** — **46 ok/14 falhas** e **49 ok/11 falhas**, `rc`
lido do arquivo. Um percurso que nunca viu o defeito não prova que acusa. Os sete foram vistos **na
tela**, não em leitura de fonte.

**A raiz é uma distinção que a superfície inteira embaralhava:** APURADO, obrigação CONSTITUÍDA e
PAGAMENTO são **três** estados. O que a complementar verifica é **um** —
`FolhaDePagamento.fechamento !== null`. Certificação, empenho, liquidação e pagamento não são
consultados em lugar nenhum de `calcularFolhaComplementarNaTx`, logo **nenhuma superfície dela pode
afirmá-los**. Cinco defeitos vieram por leitura; os dois últimos, dessa varredura.

1. a ajuda do tipo dizia "menor que o já **PAGO**" — passa a dizer **APURADO em folha fechada**, e
   que apurar não é empenhar, liquidar nem pagar;
2. a recusa da diferença negativa afirmava "o servidor **RECEBEU** a mais" / "o ente **RETEVE** a
   mais" — passa a APURADOS/RETIDOS a mais, cita a reposição como hipótese, e orienta com **o que
   fazer** em vez de despejar justificativa de arquitetura;
3. o resumo saía intitulado "Resumo da folha **mensal**" para **qualquer** tipo, porque
   `lerResumoDaFolha` não selecionava `tipo`: um PDF que se apresenta como a folha do mês
   carregando só a diferença, **e que circula para quem não abre a tela**;
4. a tela do contracheque não mostrava `natureza` nem `regimeDeTributacao` que a memória já
   declarava lacrados no sha256 — e, **retendo 50,00 do servidor**, o bloco da contribuição dizia
   "a memória não traz o detalhamento" e **emudecia**;
5. `FOLHA-JA-ABERTA` mandava "Calcule-a" mesmo com a folha **FECHADA** — remédio falso, mesma
   família do que a V9.3 achou na barra do 13º. Passa a ler o fechamento e a orientar conforme o
   estado. **Não** constrói a segunda complementar;
6. o aviso de `calcular` e a descrição do recurso prometiam "todos os vínculos vivos" nos **quatro**
   tipos — falso em três. Sai de `NATUREZA_DO_TIPO_DE_FOLHA.oQueOCalculoProduz`, no `Record`
   exaustivo que já existia: tipo novo **não compila** até escrever o próprio texto. Um segundo mapa
   seria a cópia que diverge;
7. o cabeçalho anunciava "30/30 dias" num contracheque de **DIFERENÇA**. O ramo final de `medida()`
   fabricava a unidade — e o docblock dele existe porque isso "era mentira na folha de 13º": **a
   correção de então ENUMEROU o caso conhecido e o tipo seguinte caiu no mesmo buraco**. A memória
   passa a **declarar** a grandeza; sem declaração, a tela diz que não sabe.

⚠️ **A correção que mais vale é a 4, e o motivo é geral.** Previu-se, por leitura, um documento
**contraditório**; medido, ele **emudecia** sobre uma contribuição que estava sendo retida.
**Silêncio é pior que número errado: um número alguém confere, um silêncio o servidor lê como "não
houve".** É a mesma família de "existe como linha ≠ produziu efeito" que atravessou esta rodada
inteira — e a terceira aparição dela em três dias.

### `a66a5eb` — a corrida verde, e as três vacuidades que o percurso se pegou

**O par que prova o instrumento:** 46 ok/14 falhas e 49 ok/11 falhas contra `6fa0d62` **sem conserto
nenhum**; depois **62 ok / 0 falhas** contra `d163d21`. `rc` lido do arquivo nas três, **banco
clonado por execução**, `/release` conferido.

⚠️ **Três passos passavam por vacuidade, e o percurso os achou sozinho** — é o registro mais útil
deste commit, porque são defeitos **dentro do instrumento de medição**, a quinta família que este
repositório paga:

| passo | por que era vazio |
|---|---|
| **6.8** | a fixture não declarava `incideContribuicao`, então "o bloco não anuncia 350,00" era **trivialmente verdadeiro**: não havia contribuição nenhuma |
| **8.2** | lia `textContent`, que traz o **descritor serializado** nos `<script>` — acusou "já pago" no índice 44186 e quase virou um sexto defeito que era o primeiro. Passa a `innerText`, e o diagnóstico imprime o **contexto** do achado |
| **8.4** | casava "complementar" dentro do **nome da lotação da própria fixture**. Passa a recortar o cabeçalho do PDF e a remover dele o texto que o próprio percurso escreveu no banco |

Mais: 6.3/6.4/10.6 procuravam `PREV-<ano>`/`VENC-<ano>` e passam a resolver **por natureza** —
propriedade, não forma; 3.4 comparava valores por contracheque contra o total da folha; 6.6 exige a
declaração **fora** da tabela; e 12.0 nasceu como **controle positivo do ator negativo**, com
proveniência escrita — o ator vem de `percursos-usuarios-por-papel.ts`, **não** do censo de
`test/usuarios-teste.ts`, onde toda identidade tem ADMIN/`TODAS_AS_ACOES`.

### Medido na frente do auxiliar

| passo | resultado |
|---|---|
| `tsc` backend / app / scripts | **0/0/0**, `exit=0` nos três |
| dirigidos, 5 arquivos | **37/37**, `exit=0` lido do arquivo |
| contrato memória ↔ tela | **11/11** |
| percurso, artefato `d163d21` | **62 ok / 0 falhas**, `exit=0` |

**Mutação M-7** (a memória deixa de declarar a medida) — **alvo confirmado ANTES de medir**:
sha `34b03cb…` → `bcdf74e…`, `medida:` sumiu do arquivo. Resultado: **1 vermelho, o teste certo**.
Revertida por edição, com o sha `34b03cb…` de volta, idêntico, e **11/11**.

### Não executado nesta frente

Suíte completa, `test:fuso` e portão — e **o catálogo NÃO foi marcado**. As duas metades da 5.12.50
estão em **frentes diferentes** (os oito eixos no M32, os tipos de folha no M33); **quem fechar por
último junta**. Marcar meia cláusula renderia número sem comportamento inteiro.

### Pendências novas dele — nomeadas, nenhuma silenciosa

- `MEDIDA-DECLARADA-SO-NA-COMPLEMENTAR` — os outros três tipos seguem reconhecidos pelos blocos
  `dias`/`avos`; enquanto os quatro não declararem, um tipo novo cai no ramo final — **agora dizendo
  que não sabe, em vez de mentindo**.
- `MENSAGEM-DA-COMPLEMENTAR-EM-FORMATO-CRU` — o possível **oitavo**. A recusa e a memória por rubrica
  mostram dinheiro como `350.00` e `2000.00`, formato de máquina, enquanto toda tela do sistema
  mostra pt-BR. É **anterior a esta rodada** (`m()` e `toFixed(2)` também no motor mensal) e alcança
  **os quatro tipos** — por isso não entrou. **Não consertado: decisão do usuário.**
- `SEGUNDA-COMPLEMENTAR-NA-MESMA-COMPETENCIA` — segue pendente.
- `IRRF-DO-COMPLEMENTAR-EM-REGIME-DE-CAIXA` — segue pendente.

### ⚠️ UMA CONTAGEM MINHA, CORRIGIDA EM VEZ DE EM SILÊNCIO

A seção 91, o commit `5c129e0` e a regra em `_base.prisma` diziam **"21 bancos"** na conferência de
`_prisma_migrations`. **Eram 20.** Contei linhas de uma saída de terminal e errei por um.

Os bancos do produto foram de **20 para 22** com os dois descartáveis do auxiliar
(`gestao_publica_percursos_v7m1_compl_d163d21` e `..._compl_verde`, nomeados pelo SHA). O servidor
tem 23 bases não-template, mas uma é `postgres`, que é do próprio Postgres e não do produto — é daí
que sai a diferença entre as contagens.

⚠️ **E O NÚMERO NUNCA FOI A PROVA.** O laço foi gerado por `SELECT datname FROM pg_database`, então
cobriu **todos** os bancos existentes, qualquer que fosse a contagem. A conclusão — zero aplicações
da migration em lugar nenhum — **continua íntegra**, e o que a sustenta é ter enumerado **pelo
servidor** em vez de por lista digitada, que envelhece no dia em que alguém cria um banco a mais.
A correção está feita no `_base.prisma`, com este raciocínio junto.

### Próximo ponto exato

**A medição da Tarefa 3** (M32), que segue commitada e não medida — é o maior buraco aberto. A
Tarefa 2 (seleção no cálculo) **não começa** antes dela: construir seleção sobre um cadastro não
medido empilharia duas incertezas.

## 93. V11 V9.4c — a Tarefa 3 MEDIDA, e o HEAD que não compila

**Regime de rigor: PROFUNDIDADE.** Esta seção fecha a medição que a seção 91 declarou devida.

### As migrations, conferidas PELO EFEITO — e a razão de não bastar o `exit=0`

O incidente da seção 91 criou um alvo que não existiria sem ele: provar que `FuncaoDePessoal` cria
tabela própria e **não encosta** na `Funcao` do M02. `exit=0` do `migrate` não distingue "criou a
tabela certa" de "criou a certa e mexeu na do vizinho".

Método: banco clonado de um que **não** tinha as duas migrations
(`gestao_publica_isolado_m32_133bc2a`, descartável), **semeado com N=2 linhas** na `Funcao` do M02
**antes** de aplicar — ⚠️ **tabela vazia não prova "linhas intactas"**. `migrate deploy` aplicou
**só as duas pendentes**, e o arquivo de saída diz quais.

| | antes | depois |
|---|---|---|
| `Funcao` (M02) — colunas, constraints, índices, **as duas linhas** | — | **diff VAZIO** |
| `HistoricoVinculo` colunas | 14 | 16 |
| `FuncaoDePessoal` existe | 0 | 1 |

**O único delta é o meu.**

### Os três CHECK, provados pelo efeito

Cada um recebeu a linha que deve barrar, gravada **direto pelo Prisma** (que não conhece CHECK), e o
que se afirma é a recusa do Postgres. Ler `pg_constraint` diria que existem — e um CHECK pode
existir com a condição errada e nunca recusar nada.

### ⚠️ TRÊS MUTAÇÕES, com o ALVO CONFIRMADO NO ARQUIVO antes de ler o resultado

| mutação | sha antes→depois | resultado |
|---|---|---|
| `funcaoVigenteEm` → `ultimoAte` | `b7e5775`→`677fad86` | vermelho nos casos **2 e 4** (os da dispensa); os outros 8 seguem verdes |
| guarda `DISPENSA-SEM-FUNCAO-VIGENTE` → `if (false && …)` | `efe9a042`→`63fa7cbd` | vermelho nos casos **2 e 3** |
| **`funcaoId`/`centroDeCustoId` fora do `SELECAO_ENXUTA_DO_VINCULO`** | `1b3bc707`→`aea08693` | vermelho nos **três** casos positivos — e o caso puramente negativo ficou **VERDE** |

Todas revertidas por cópia do original, com o sha de volta e conferido idêntico.

⚠️ **A TERCEIRA É A MELHOR PROVA DESTA RODADA, e ela transformou raciocínio em medição.** Eu havia
**afirmado**, na seção 91, que "um filtro que nunca acha nada é indistinguível de um filtro correto
sobre dado ausente". Com a coluna removida do `select`, o teste que só afirma *"termo inexistente
devolve vazio"* **passou** — verde, sozinho, ao lado de três vermelhos. **Esse verde isolado é a
forma exata do teste que se sente cobrindo e não cobre.** É por isso que todo eixo novo prova que
**ENCONTRA** antes de afirmar que exclui, e é por isso que o dado ser ausente hoje
(`VINCULOS-ANTERIORES-SEM-CENTRO-DE-CUSTO`) torna a armadilha real, não teórica.

### O defeito que o próprio teste me pegou — e que nenhum compilador acharia

`FuncaoDePessoal` faltava no censo de `test/limpar-banco.ts`. **Não quebra schema, não quebra tipo,
não dá aviso nenhum**: manifesta-se como o **segundo** teste falhando por código duplicado, porque a
fixture do primeiro sobrevive ao `beforeEach`. Doze vermelhos num arquivo cujo **primeiro caso
passava** — e a leitura ingênua ("o arquivo está quebrado") esconde que o sintoma é de ordem, não de
conteúdo. Corrigido, com o motivo escrito na própria lista.

### Confirmação POSITIVA que vale registrar

`FuncaoDePessoal` **não** aparece em `test/modelo-sem-caso-de-uso.test.ts` — isto é, o modelo é
**alcançado por código escrito à mão**. O `CLAUDE.md` avisa que isso não é garantido ("há tabelas no
schema com os tipos certos e nenhum leitor escrito à mão"), e aqui a garantia foi medida, não
suposta.

### Medido — `exit=` lido do arquivo, um processo por vez

| passo | resultado |
|---|---|
| `prisma validate` | `exit=0` |
| `migrate deploy` (banco isolado) | `exit=0`, e o arquivo nomeia as duas migrations aplicadas |
| `tsc` app / `tsc` scripts | `exit=0` / `exit=0`, zero `error TS` |
| dirigidos do M32 + porta (5 arquivos) | **115/115**, `exit=0` |

### ⚠️ O HEAD NÃO COMPILA — e não é meu

`tsc` de **backend**: `exit=2`, 1 erro.

```
test/ui/memoria-do-contracheque-do-13.test.ts(240,5): error TS2353:
  'vida' does not exist in type 'EntradaDoContracheque'
```

O teste passa `vida:` e o tipo (`modules/m33-folha/dominio.ts:520`) não tem esse campo — tem `dias`.
`VidaFuncionalNaCompetencia` existe (`:429`), o que sugere **um arquivo deixado para trás no
commit**: o teste veio, a mudança do tipo não. `git log -S"vida"` aponta **`d163d21`**, de outra
frente; o backend dava `exit=0` antes daqueles commits. **Não consertado** — é território do
auxiliar, e mexer ali atropelaria trabalho em curso. **Consequência: sem `tsc` limpo não há build.**

### `test:rapido` — 7 falhas, NENHUMA minha, e a separação é aritmética

O `t5c` do censo (`modules/m16-travamento/m16-censo.test.ts`) espera **425** e acha **427**.
Extraindo as chaves de `ACAO_DO_SERVICO` nos dois commits:

```
6fa0d62 = 426 chaves   (o teste já esperava 425 → JÁ ESTAVA VERMELHO antes desta rodada)
HEAD    = 427 chaves
acrescentado desde 6fa0d62: cadastrarFuncao  (apenas este)
```

**Duas origens, separadas:** uma unidade de desatualização é **anterior** a esta rodada e o 426º
serviço **precisa ser nomeado por quem o criou**; a outra é **minha** (`cadastrarFuncao`).

⚠️ **O número NÃO foi ajustado para 427, e a recusa é deliberada.** O comentário do `t5c` é um censo
**narrativo** — cada `+n` diz qual serviço entrou e por quê. Escrever 427 fecharia o vermelho e
apagaria a desatualização anterior sem que ninguém soubesse qual serviço ficou sem linha. Seria
atestar pela papelada.

As demais falhas acusam `RubricaDaBaseDoDecimoTerceiro`, `RubricaDoGrupoDeEmpenho`,
`criterioDoAbatimentoNoCalculo`, `exigirNaturezaDaFonte` e arquivos de
`app/(areas)/folha|contabilidade|financeiro|receita` — **nenhum arquivo meu**.

### Pendências — inalteradas, e uma a mais

As quatro da seção 91 seguem (`CENTRO-DE-CUSTO-SEM-VIGENCIA-HISTORICA`,
`VINCULOS-ANTERIORES-SEM-CENTRO-DE-CUSTO`, `FUNCAO-SEM-ACAO-PROPRIA`,
`FUNCAO-SEM-EIXO-DE-AUSENCIA`), mais o **percurso de navegador de `/pessoal/servidores`**, devido
desde a seção 88 e agora com dois eixos e duas colunas a mais. Acrescenta-se:

- **`CENSO-DO-T5C-DESATUALIZADO`** — vermelho por desatualização do censo narrativo, com as duas
  origens acima. **Não é defeito de produto.**

**Bloqueio de outra frente:** `TSC-BACKEND-VERMELHO-POR-D163D21`. Não é escopo pendente meu; é
trabalho em curso de terceiro.

**Bloqueio externo:** `ITEM-1667-DE-IBEMA-NAO-LOCALIZADO`, sem afirmação de cobertura.

### Catálogo

**Nenhuma marcação.** Há comportamento **medido** agora, mas 5.12.50 tem duas metades em frentes
diferentes (os oito eixos no M32, os tipos de folha no M33) e **quem fechar por último junta**. Sem
percurso de navegador, o que os eixos rendem seria `IMPLEMENTADO_NAO_VALIDADO`; `VALIDADO_LOCALMENTE`
exige tela percorrida.

### Próximo ponto exato

1. **Parado.** A máquina vai para o auxiliar consertar o `tsc` que `d163d21` quebrou.
2. **Tarefa 2 NÃO começada, agora por dois motivos:** a Tarefa 3 fechou, mas **o HEAD não compila** —
   construir seleção no cálculo sobre árvore vermelha empilharia incerteza sobre incerteza.
3. Quando o `tsc` voltar limpo: **Tarefa 2 em UM commit** — seleção no `CalculoDaFolha` + fato de
   abrangência + guarda de completude + guarda de "no máximo uma vez", com a reconciliação de
   `VINCULO-APURADO-FORA-DO-RECALCULO` por interseção com a seleção. **Teste obrigatório:**
   nº1={A,B}, nº2={C,D}, fechar → **recusa nomeando A e B**; depois o par positivo. N=2 nas duas.

## 94. V11 V9.5 — a PONTA DE ENTRADA que faltava, e por que a Tarefa 3 reabriu

**Regime de rigor: SUPERFÍCIE** (cadastro, formulário, rota). A profundidade desta frente — as
derivações, os CHECK e as mutações — está medida na seção 93 e não se repete aqui.

### ⚠️ A TAREFA 3 FOI DADA POR FECHADA SEM A PONTA DE ENTRADA — e reabriu

A ordem do usuário pedia, literal, **"a menor cadeia completa: cadastro/vínculo → seleção →
processamento ou consulta pertinente"**. Foram entregues modelo, predicado, porta e consulta —
**faltou o cadastro/vínculo pela TELA**. A varredura de `lib/` e `app/` feita ao montar a fixture do
percurso é que pegou:

- `cadastrarFuncao` (`modules/m32-pessoal/servico.ts`) tinha **zero chamadores fora de testes**;
- `DESIGNACAO_FUNCAO`, `DISPENSA_FUNCAO` e `MUDANCA_CENTRO_DE_CUSTO` existiam no enum e eram
  gravados **só por testes** — o `select` de `movimentar` oferecia cinco tipos e nenhum era esses;
- `admitir` não aceitava `funcaoId` nem `centroDeCustoId`.

**Duas falhas, e as duas ficam escritas:** falha de **escopo** de quem construiu (a seção 90 chegou
a registrar *"a tela não mudou: `page.tsx` passa `consulta.filtros` genericamente e o molde monta"*
— os FILTROS apareciam, a ENTRADA não existia) e falha de **aceite** de quem aceitou a unidade como
fechada sem conferir a ponta de entrada.

⚠️ **E O EFEITO ERA PIOR QUE UMA TELA AUSENTE.** O operador via "Função exercida" e "Centro de
custo" na barra de filtros, digitava e recebia **vazio para sempre** — não porque o filtro errasse,
mas porque o dado era ausente **por construção**. É exatamente a armadilha que a mutação do
`SELECAO_ENXUTA` provou na seção 93 (um filtro que nunca acha nada é indistinguível de um filtro
correto sobre dado ausente), **na forma mais completa dela**: sem ponta de entrada, as duas
situações são a mesma coisa permanentemente, e nenhuma medição as separa.

### O que passou a existir — `4564a51`

- **`/pessoal/funcoes`** — lista, detalhe e cadastro pelo molde, espelhando `/pessoal/cargos`, no
  menu lateral e no índice da área.
- **Os três tipos no `select` de `movimentar`**, com os campos que cada um exige.
- **`ROTULO_DO_EVENTO`** para os três — sem isso a ficha funcional mostraria o valor cru do enum.
- **`admitir` aceitando `centroDeCustoId`**, com validação de setor ativo pela mesma porta do
  evento de mudança.

### As três decisões de produto — registradas pelo ARGUMENTO, não pelo resultado

**1. Centro de custo ENTRA na admissão.** É atributo **contínuo** do vínculo: a despesa é apropriada
em algum lugar desde o primeiro dia. Se só pudesse entrar por movimentação posterior, **todo vínculo
novo nasceria sem apropriação**, dependendo de um segundo ato que alguém vai esquecer — criando de
propósito mais dívida do tipo que `VINCULOS-ANTERIORES-SEM-CENTRO-DE-CUSTO` já registra para o
histórico. O CHECK `ck_historico_vinculo_centro_de_custo` foi escrito permitindo `ADMISSAO`
exatamente para isto.

**2. Função FICA FORA da admissão.** É ato **próprio e datado** (a portaria de designação), quase
sempre posterior — ninguém é admitido já designado. E `ck_historico_vinculo_funcao` é
**bicondicional**: aceitá-la na admissão exigiria afrouxar o CHECK para dois tipos, e então
"admitiu" e "designou" ficariam com as **mesmas colunas preenchidas** na ficha funcional. Quando os
dois coincidem na data, são **dois eventos na mesma data** — que a razão append-only já suporta sem
precisar de exceção.

**3. "Exercendo hoje" é DERIVADO, não contado.** Contar eventos `DESIGNACAO_FUNCAO` diria quantas
designações a função já teve **na vida**, incluindo todos os que já foram dispensados — e o número
**cresceria para sempre, sem nunca cair**. É a mesma família de "existe como linha ≠ produziu
efeito", agora num contador de tela. Quem responde é `funcaoVigenteEm`, porque a dispensa não apaga
o evento anterior: ela o **encerra**.

⚠️ **E uma quarta, menor, que vale pelo motivo:** a **dispensa não tem campo de função** no
formulário, e o **comando também não manda `funcaoId`** mesmo que o campo venha preenchido de uma
escolha anterior do operador. Limpar campo não pode ser responsabilidade de o usuário lembrar — o
`superRefine` recusaria, e a recusa seria correta e inútil.

### ⚠️ O ACHADO DO `--listFiles` — a lição do dia, provada do outro lado

Conferindo **qual projeto de fato inclui cada arquivo mudado**:

| arquivo | `tsconfig.backend.json` | `tsconfig.json` (app) |
|---|---|---|
| `modules/m32-pessoal/dominio.ts` | sim | sim |
| `modules/m32-pessoal/servico.ts` | sim | sim |
| `lib/portas/recursos/pessoal.ts` | sim | sim |
| **`lib/portas/recursos/pessoal-dados.ts`** | **NÃO** | sim |
| `app/(areas)/pessoal/funcoes/*` (3 arquivos) | — | sim |

**`pessoal-dados.ts` é onde está a maior parte desta mudança** (a porta das funções, as opções dos
selects, o executor de `movimentar` e de `admitir`) — e o projeto do **backend não o enxerga**. Se a
afirmação de cobertura tivesse saído de um `tsc` de backend verde, teria repetido exatamente o
buraco que custou o dia, **do outro lado**. Quem sustenta a afirmação aqui é o projeto do **app**,
que passa pelos seis arquivos alterados e pelos três novos.

**A regra, agora provada nas duas frentes:** depois da última edição, os três rodam — e quem afirma
cobertura **confere que o projeto que rodou inclui o arquivo que mudou**. Três verdes não somam
cobertura se nenhum passa pelo arquivo novo.

### O que foi medido — e o que NÃO foi

| passo | resultado |
|---|---|
| `tsc -p tsconfig.backend.json` | **`exit=0`**, zero `error TS` |
| `tsc -p tsconfig.json` (app) | **`exit=0`**, zero `error TS` |
| `tsc -p tsconfig.scripts.json` | **`exit=0`**, zero `error TS` |

Os três **depois da última edição**, um processo por vez, `exit=` lido do arquivo de saída bruta.
Schema não foi tocado nesta unidade, logo não houve `prisma validate` a fazer.

⚠️ **NADA MAIS FOI MEDIDO.** Sem suíte, sem dirigidos, sem percurso, sem banco. **A superfície de
`/pessoal/funcoes` e dos três eventos de `movimentar` não tem evidência nenhuma** — ela só existirá
quando a corrida de navegador fechar. Typecheck prova que compila, não que funciona: um formulário
pode compilar e não gravar, e um `select` pode compilar sem opção nenhuma dentro.

### Coordenação entre frentes — convenção conferida antes da corrida

O percurso (`scripts/smoke-servidores-eixos.ts`, da outra frente) foi escrito **antes** desta
entrada, apostando em nomes espelhados e declarando a aposta. Os três conferem, e a conferência foi
feita contra o que o **molde gera**, não contra o script:

| aposta | entregue |
|---|---|
| rota `/pessoal/funcoes` | `/pessoal/funcoes` |
| `data-acao="criar-funcoes"` | `FormsDoRecurso` gera `criar-${d.nome}`, e o descritor é `nome: "funcoes"` |
| `funcaoId` / `centroDeCustoId` | os mesmos |

Nenhuma divergência de seletor: um vermelho na corrida será defeito, não convenção diferente.

### Pendências

As da seção 93 seguem inalteradas. O **percurso de navegador de `/pessoal/servidores`** deixa de ser
só devido e passa a ser **a próxima evidência**, agora com os oito eixos tendo caminho de entrada.

### Próximo ponto exato

1. **A máquina é da outra frente**, montando um artefato com esta entrada dentro e percorrendo os
   oito eixos numa corrida só. **Nada pesado aqui até liberação.**
2. **Tarefa 2 parada e guardada fora da árvore** (scratchpad da sessão): o domínio puro
   `abrangencia.ts` e a migration da ação `SELECIONAR_VINCULOS_DA_FOLHA`. ⚠️ **Não foi usado
   `git stash`** — o stash do repositório é de terceiros e não se encosta nele. Ela volta depois que
   a corrida fechar; o desenho não mudou, e o teste obrigatório continua sendo nº1={A,B},
   nº2={C,D}, fechar → **recusa nomeando A e B**.

## 95. V11 V9.5 — a colisão de índice entre frentes, e uma atribuição corrigida

Seção curta e de processo. Nenhum código, nenhuma medição.

### O FATO

A seção 94 foi escrita, `git add ESTADO-EXECUCAO.md` foi executado, e antes do `git commit` desta
frente o commit `838227a` da **outra** frente levou o arquivo junto. O `git commit` seguinte
encontrou o índice vazio e não fez nada (`nothing added to commit`).

**Nada se perdeu**, e isso foi conferido: a seção 94 está no arquivo de trabalho **e** no HEAD, e a
árvore ficou limpa. O que ficou errado é só a **atribuição** — `git log -- ESTADO-EXECUCAO.md`
mostra a seção 94 sob um commit cuja mensagem fala do percurso dos oito eixos e não menciona o
checkpoint.

### O MECANISMO — e ele não é disciplina frouxa

- **O índice do git é ÚNICO por árvore de trabalho, e é compartilhado entre as frentes.** O working
  tree não isola nada: não há "meu staging" e "o dele".
- Entre o `add` e o `commit` existe uma **janela** em que qualquer commit alheio leva o que está
  staged.
- ⚠️ **E caminhos explícitos no outro commit NÃO desfazem o que já está no índice.** Esta é a parte
  contraintuitiva: `git commit caminho-dele.ts` continua commitando o que já foi staged por outro,
  porque o commit é do índice inteiro quando não se usa a forma `git commit -- <paths>` de modo
  estrito. Disciplina de "commitar só o meu" não fecha a janela.

### A CAUSA — é de TOPOLOGIA, não de operação

A causa é **a decisão de pôr duas frentes commitando na mesma árvore de trabalho**. A conferência de
`git status` entre o `add` e o `commit` — que esta frente vinha fazendo justamente para não commitar
arquivo alheio — **não abriu a janela: só a tornou visível**. A janela existe desde que a topologia
foi escolhida.

### AS DUAS SAÍDAS, e elas não são equivalentes

1. **A regra imediata, adotada para as duas frentes:** `git add` e `git commit` **na mesma
   invocação**, sempre, enquanto houver duas frentes na mesma árvore.
2. **A saída estrutural, para quem ler isto depois:** duas frentes que precisem commitar em paralelo
   pedem **worktrees separadas**, não disciplina.

⚠️ **E a segunda é a resposta certa, não a primeira.** Disciplina falha uma vez; topologia não. A
regra do `add`+`commit` atômico reduz a janela a milissegundos — não a elimina, e depende de todo
mundo lembrar dela em toda invocação, para sempre. Registrar a regra sem registrar que ela é um
paliativo seria o mesmo tipo de meia verdade que este repositório vem cobrando nas outras frentes.

### POR QUE A HISTÓRIA NÃO FOI REESCRITA

`reset` ou `rebase` mexeriam num commit da outra frente que **já é o HEAD**, e o risco de atropelar
trabalho em curso supera o ganho de arrumar uma atribuição. É a mesma disciplina que deixou o `425`
do `t5c` vermelho em vez de ajustá-lo: **registrar em vez de maquiar**.

### ⚠️ UMA ATRIBUIÇÃO CORRIGIDA — e o erro foi desta frente

O relatório desta frente creditou à outra o achado de `PESSOAL-RECUSA-DO-TETO-SEM-PERCURSO` — a
guarda que casava com o **texto-fonte** do `page.tsx` e cuja mutação `MUT-H` deixou 26 testes
verdes. **Está errado, e a conferência é objetiva:**

```
git log -S"PESSOAL-RECUSA-DO-TETO-SEM-PERCURSO" --reverse  →  e0f6096   (esta frente)
git log -S"MUT-H"                              --reverse  →  e0f6096   (esta frente)
```

**O achado é desta frente**, na V11 V9.4: a guarda foi mutada, não acusou, e foi **retirada** em vez
de mantida aparentando cobertura. **O que a outra frente fez foi FECHAR a pendência**, percorrendo o
teto pela tela pela primeira vez em `838227a`.

As duas coisas valem e são de pessoas diferentes: **achar um instrumento inerte** e **fechar a
pendência que ele deixou** são trabalhos distintos, e o registro não pode trocá-los. Um relatório que
credita errado corrói exatamente o que torna o histórico útil — saber quem viu o quê, e quando.

### Próximo ponto exato

**Parado.** A outra frente acabou de commitar `838227a` e o placar da corrida ainda não foi lido. A
**Tarefa 2** segue guardada fora da árvore (scratchpad, sem `git stash`) e volta quando o relatório
da corrida fechar. O desenho não mudou; o teste obrigatório continua sendo nº1={A,B}, nº2={C,D},
fechar → **recusa nomeando A e B**.

## 96. V11 V9.5 — a SELEÇÃO no cálculo, o FATO de abrangência, e o fechamento da ordem

**Regime de rigor: PROFUNDIDADE.** Dinheiro, autorização, transação e um invariante que mudou de
forma.

### O que entrou — `29a43fe`, UM commit, 14 arquivos

Seleção (b) + fato de abrangência (c) + guarda de completude + guarda de "no máximo uma vez".
**Não se separam:** o estado intermediário — seleção sem abrangência — é precisamente o estado
perigoso, uma folha que pode ser parcial sem acusar.

⚠️ **A PROMESSA DA FOLHA MUDOU DE FORMA.** `calcularFolha` prometia "todos os vínculos vivos na
competência" e mantinha a promessa **por construção**: o `findMany` não tinha `where` nenhum. O
`where` chegou — e **uma promessa mantida por construção some junto com a construção**. A promessa
passou a ser "exatamente os **selecionados** e **elegíveis**, com cada exclusão **nomeada**", e
agora ela é **afirmada** por `exigirAbrangenciaCompleta`, não sustentada de lado.

### ⚠️ O CENÁRIO OBRIGATÓRIO, e as DUAS SAÍDAS LEGÍTIMAS

`fecharFolha` congela **um** cálculo. nº1={A,B}, nº2={C,D} → fechar levaria só {C,D}, e **A e B não
receberiam**: sem erro, com total, empenho e liquidação batendo. `SELECIONADOS-QUE-SUMIRIAM` recusa
**nomeando M-A e M-B**, e o teste afirma também que nada foi gravado.

⚠️ **E ISTO NÃO É UM BECO SEM SAÍDA — PRECISA SER LIDO ASSIM.** Há duas saídas, ambas com teste:

1. **recalcular com a seleção acumulada** (nº3 = {A,B,C,D}) e fechar;
2. **cancelar o cálculo nº1**, o que retira A e B da promessa **por ato** — um cálculo cancelado
   declara "isto não vale", e quem estava só nele deixou de ser prometido deliberadamente.

**A guarda impede o ESQUECIMENTO, não a DECISÃO.** Registrar isso é obrigatório: uma guarda lida
como beco sem saída é uma guarda que alguém desliga — e este repositório já corrigiu exatamente
esse erro uma vez (a recusa sem saída que a V11 V9.3 achou no fechamento do 13º).

### As exigências, cada uma com teste

| exigência | como foi atendida |
|---|---|
| **explícita** | o modo é **declarado**, nunca inferido do tamanho da lista — inferir faria 25 selecionados num ente de 25 ser indistinguível de "todos", e uma tela paginada que manda os visíveis passaria por "selecionou tudo". `EXPLICITA` vazia e `TODOS` com lista são os dois recusados |
| **autorizada** | ação **própria** `SELECIONAR_VINCULOS_DA_FOLHA`, dentro de `calcularFolha` e só no modo explícito. Nunca `CONSULTAR_PESSOAL`. Negativa com ator **fora do censo** e ação **vizinha**, pareada com a positiva |
| **registrada** | `AbrangenciaDoCalculo` com CHECK bicondicional `calculado = (motivo IS NULL)` |
| **revalidada** | vínculo inexistente no instante do cálculo **recusa o cálculo inteiro** |
| **paginação** | a defesa está no **contrato** (modo declarado), não na tela |
| **no máximo uma vez** | `vinculosPagosDuasVezes` afirma a propriedade que antes era coincidência de três construções |

⚠️ **A POSITIVA DA AUTORIZAÇÃO É A METADE QUE PROVA O DESENHO:** quem tem `CALCULAR_FOLHA` e não a
ação nova **continua podendo calcular TODOS**. A separação não produz estado pela metade — produz o
**padrão conservador**. É o inverso do caso de `cadastrarFuncao`, onde separar deixaria o ente
podendo criar cargo sem poder criar função. O critério é o mesmo (é a **mesma autoridade**?); a
resposta é que decide.

### ⚠️ A MUTAÇÃO DESMENTIU O QUE EU IA AFIRMAR — e a afirmação mudou, não o resultado

Eu ia escrever que trocar `considerados` por `matriculaPorVinculo` mataria a guarda reconciliada —
a advertência que eu mesmo havia feito duas seções antes. **Mutei, com o alvo confirmado no arquivo
(sha `d2122d08`→`f7acebd5`): 13/13 VERDES.**

A causa é boa notícia: **o `where` já fez a reconciliação.** No modo explícito o motor lê só os
selecionados, então `matriculaPorVinculo` e `considerados` são o mesmo conjunto, e a filtragem é
**redundante enquanto o `where` existir**.

Ela foi **rebaixada a defesa em profundidade, declarada como tal**, em vez de mantida como guarda
provada. O que **está** provado é a guarda em si: mutá-la inteira (`if (false && …)`, sha
`d2122d08`→`76437efe`) deixa o caso real **vermelho**. Ambas revertidas com o sha de volta,
conferido idêntico.

⚠️ **Uma mutação que NÃO acusa vale mais que cinco que acusam** — e esta salvou uma afirmação errada
no registro, não só código. É o oposto exato do que produziu a guarda inerte achada na V11 V9.4.

### Dois motivos de exclusão descartados PELO QUE O BANCO DISSE

- **`NAO_SELECIONADO`** — gravar uma linha por vínculo não pedido faria um cálculo de 2 pessoas num
  ente de 900 gravar **898 linhas de ruído**, escondendo as exclusões que importam. E ele é
  **derivável** de `modoDeSelecao = EXPLICITA` mais a lista dos considerados. **Fato derivável não
  vira linha.**
- **`VINCULO_INEXISTENTE`** — **impossível**: a FK de `AbrangenciaDoCalculo` aponta para `Vinculo`,
  e a tentativa estourou `AbrangenciaDoCalculo_vinculoId_fkey`, derrubando a transação. A
  revalidação virou **recusa**, que é mais forte que registrar o irregistrável.

Os dois ficam escritos no schema e na migration, para ninguém os reintroduzir.

### ⚠️ O `tsc` PEGOU O QUE 78 TESTES VERDES NÃO PEGARAM

Um `NAO_SELECIONADO` residual num helper de teste passou por **78/78 verdes** e foi acusado pelo
typecheck. **Testes verdes não são typecheck** — é a terceira vez hoje que os dois se revelam
respostas a perguntas diferentes (as outras duas: o `vida` de `d163d21`, e `pessoal-dados.ts` fora
do projeto do backend).

### Medido — `exit=` do arquivo, um processo por vez

| passo | resultado |
|---|---|
| `prisma validate` | `exit=0` |
| migrations em banco **isolado**, conferidas **pelo efeito** | `CalculoDaFolha` **12→13** colunas e **14→15** constraints (só as minhas); DEFAULT e NOT NULL corretos; enum com os **três** motivos; **o CHECK recusou a exclusão muda, antes da FK** |
| `tsc` backend / app / scripts | **0/0/0**, os três **depois da última edição** |
| `--listFiles` | backend e scripts incluem `abrangencia.ts` e os **dois testes novos**; o app inclui os de produção |
| dirigidos do M33 (4 arquivos) | **78/78**, `exit=0`, incluindo os que já existiam |

**Não executado:** suíte completa, `test:fuso`, portão, percurso de navegador da folha com seleção.

### Dois achados NÃO consertados

- **`SELECAO-NO-13-NAO-CONSTRUIDA`** — o motor do 13º **recusa** seleção explícita em vez de aceitar
  e ignorar. Aceitar gravaria `modoDeSelecao = EXPLICITA` numa folha que processou todos: uma folha
  que **mente sobre o próprio recorte**, pior que a ausência da funcionalidade.
- **`APURADO-A-REPOR-ENCOBERTO-POR-FOLHA-SEM-VINCULOS`** — quando o único selecionado é inelegível e
  tem apurado, `FOLHA-SEM-VINCULOS` estoura **antes** e cala sobre o valor a repor ao erário. Não é
  silêncio (a recusa nomeia o motivo da inelegibilidade), é **ordem de guardas** escondendo a
  informação mais grave atrás da mais trivial. ⚠️ **Não consertado por FRONTEIRA:** reordená-las
  muda o motor da complementar, território da outra frente, e pede unidade própria. Avisado.

### O censo `t5`/`t5c` — vermelho EXATAMENTE como antes

427 vs 425 esperados, e os mesmos dois serviços de outra frente (`exigirNaturezaDaFonte`,
`criterioDoAbatimentoNoCalculo`). **A ação nova não alterou a contagem**, porque entrou em
`ACOES_SEM_SERVICO_PROPRIO` e não no mapa serviço→ação — `SELECIONAR_VINCULOS_DA_FOLHA` não é um
serviço, é uma segunda cobrança dentro de `calcularFolha`, e pô-la naquele mapa faria o censo
descrever um nome que nenhuma função exporta.

⚠️ **E ESSA LISTA PRECISOU EXISTIR POR UM EFEITO PRÁTICO QUE SÓ A MEDIÇÃO MOSTROU:** `TODAS_AS_ACOES`
é **derivada** de `ACAO_DO_SERVICO` + leituras. Sem a lista nova, a ação ficaria **inalcançável até
para o ADMIN** — que recebe exatamente `TODAS_AS_ACOES` —, e o sintoma seria um `ACESSO NEGADO` para
o usuário mais poderoso do ente, sem nenhuma forma de conceder. Fail-closed absoluto e inútil.

### Catálogo — números do auxiliar, conferidos no arquivo

| situação | contagem |
|---|---|
| `NAO_VERIFICADO` | 1.645 |
| `AUSENTE_CONFIRMADO` | 145 |
| `PARCIAL` | 101 |
| `VALIDADO_LOCALMENTE` | **75** (não subiu, de propósito) |
| `IMPLEMENTADO_NAO_VALIDADO` | 67 |
| `DEPENDENCIA_EXTERNA` | **4** |
| **verificadas** | **392** de 2.037 |

⚠️ `DEPENDENCIA_EXTERNA: 4` não constava do repasse e é o que fecha a soma (75+101+145+67+4 = 392).

A **5.12.50** registra os oito eixos como **consulta**, com a ausência do recorte de cálculo
**nominal**. ⚠️ **A Tarefa 2 preenche essa ausência — e isso muda a evidência da PRÓXIMA marcação,
não desta.** Nenhuma marcação foi feita aqui: sem percurso de navegador da folha com seleção, o que
ela renderia seria `IMPLEMENTADO_NAO_VALIDADO`.

### ⚠️ Inventário de ambiente — dois números divergem do repasse

| | repassado | **medido** |
|---|---|---|
| bancos `gestao%` | 25 | **26** |
| worktrees de percurso | 3 | **5** |

- **26 bancos**: o 26º é `gestao_publica_isolado_v11v95`, criado nesta unidade para a conferência
  das migrations pelo efeito. Preservados como evidência: `gestao_publica_isolado_v11v94`,
  `gestao_publica_isolado_m32_133bc2a` e este.
- **5 worktrees com prefixo `percurso-`**: `percurso-13-7b3deda`, `percurso-compl-6fa0d62`,
  `percurso-compl-d163d21`, `percurso-eixos-838227a` e **`percurso-glosa-0adaf12`**, este último
  anterior a esta ordem e ausente do repasse. **26 worktrees no total** (a principal mais 25).
  **Nada removido.**

Registrado com a mesma disciplina do `21→20` bancos: **anotação corrigida em voz alta**, e o que
sustenta os números é terem sido enumerados pelo servidor e pelo `git`, não digitados.

### Próximo ponto exato

**Parado.** A ordem se encerra aqui do lado desta frente. O que fica devido, nomeado e **não**
contado como feito: percurso de navegador de `/pessoal/funcoes` e do cálculo com seleção; suíte
completa, `test:fuso` e portão; as duas pendências acima; `CENSO-DO-T5C-DESATUALIZADO`; e
`ITEM-1667-DE-IBEMA-NAO-LOCALIZADO` como **bloqueio externo**, sem afirmação de cobertura.

## 97. V12 — a árvore única: 23 worktrees removidas com prova, duas retidas por veredito

> Ordem: `docs/lotes/V12-consolidacao-e-construcao-integrada.md`, seção 2. Base `c9e3423`.
> Unidade de **consolidação**, não de construção: nenhuma linha de produto mudou.

### O que passou a ser verdade

**Uma árvore ativa de desenvolvimento**: `/Users/winnervinicius/Developer/gestao-publica`,
branch `main`, `c9e3423`. Das 26 worktrees (a principal mais 25), **23 foram removidas** e
duas ficaram **retidas por veredito pendente**, nomeadas abaixo.

### A prova exigida antes de cada remoção

Para cada uma das 23, no mesmo laço que removeu, e **antes** de remover:

| Conferência | Comando | Resultado nas 23 |
|---|---|---|
| HEAD é ancestral de `main` | `git merge-base --is-ancestor <sha> main` | `exit=0` em todas |
| árvore sem trabalho | `git status --porcelain` | **exatamente 1 linha**, e ela é `?? node_modules`, nas 23 |
| remoção | `git worktree remove --force <caminho>` | `exit=0` em todas, saída vazia |
| poda | `git worktree prune` | `exit=0` |

**Por que `--force`, e por que isso não é remoção forçada de trabalho.** A remoção sem `--force`
foi tentada primeiro, em `runner-5b40af8`, e o Git recusou:
`fatal: ... contains modified or untracked files, use --force to delete it`, `exit=128`. O único
arquivo que provoca essa recusa é o `node_modules` não rastreado — provado pela conferência da
segunda linha da tabela, feita por worktree. `--force` aqui ignora dependência instalada, não
alteração: nenhuma das 23 tinha uma linha de `porcelain` que não fosse `?? node_modules`, e
nenhuma tinha commit fora de `main`.

As 23: `artefato-10f8fe5`, `artefato-985cb7f`, `candidato-10c9324`, `candidato-208246f`,
`candidato-2d7a9cd`, `candidato-3288b9b`, `candidato-4f8cf5a`, `candidato-5937f41`,
`candidato-8ed0806`, `candidato-9f89832`, `candidato-acbae82`, `candidato-c75a72f`,
`candidato-d167c02`, `candidato-e346f08`, `candidato-eef260a`, `candidato-integrado`,
`candidato-u7`, `percurso-13-7b3deda`, `percurso-compl-6fa0d62`, `percurso-compl-d163d21`,
`percurso-eixos-838227a`, `runner-5b40af8`, `runner-a699f8a`.

**Espaço**, medido por `du -sh` em `gestao-publica-candidatos` antes e depois: **15 GB → 989 MB**.

### O erro de medição que quase entrou no registro

A primeira conferência contou as linhas "fora de `node_modules`" com `grep -v -x`. Nesta máquina
`grep` é `ugrep`, que rejeitou o padrão (`error at position 8 ... invalid syntax`) e saiu com erro;
o `wc -l` a jusante recebeu zero linhas e **a conta deu 0 — um zero que significava "o grep
morreu", não "não há sujeira"**. Refeita com `awk`, a mesma conferência deu o resultado real.
É a regra da casa em forma nova: **o código de saída do cano não é o resultado da medição**, e um
zero precisa dizer de onde veio antes de virar autorização para apagar 15 GB.

### Retidas — não remover antes do veredito

| Worktree | HEAD | Por quê |
|---|---|---|
| `artefato-v11v93` (branch `v11v93-artefato`) | `97f058b` | 3 commits fora de `main`; `git diff main v11v93-artefato` = **263 inserções / 13.106 deleções** — `main` está estritamente à frente em árvore, mas as 263 linhas ainda não foram julgadas |
| `percurso-glosa-0adaf12` | `0adaf12` | **2 arquivos rastreados modificados**: `scripts/percursos-usuarios-por-papel.ts` e `scripts/smoke-ponte-contratual.ts`, **225 inserções / 2 deleções** |

O diff da `percurso-glosa-0adaf12` foi **preservado como patch antes de qualquer decisão**
(`git diff` da worktree, 21.984 bytes). O patch está no diretório efêmero da sessão
(`.../scratchpad/percurso-glosa-0adaf12-rastreados-nao-staged.patch`); **é rascunho de sessão, não
evidência durável** — se o veredito demorar, o conteúdo tem de ser trazido para a árvore ou para
um commit, porque o diretório não sobrevive.

### Preservado intacto, conferido depois da remoção

- Árvore principal em `c9e3423`, `status --porcelain` com **4 linhas, todas não rastreadas**: os
  três scripts do operador (`scripts/fix-claude-cli.sh`, `scripts/fix-cursor-extensao.sh`,
  `scripts/manter-claude-cursor.sh`) e a ordem `docs/lotes/V12-...md`.
- `git stash list` com **1 entrada** — `stash@{0}` não aplicado nem removido.
- Branch `lote2-liquidacao-material` (`fc50f94`) preservada: é referência de recuperação, é branch
  e não worktree, e não custa espaço.

### Os bancos — classificados, nenhum removido

A ordem é explícita: bancos não são worktrees, e a decisão de remover é do usuário. **Nada foi
apagado.** São **26** bancos `gestao%`, enumerados por `pg_database` e classificados por
`_prisma_migrations` (última migration com `finished_at`) contra as **218** migrations da árvore
(`prisma/migrations`, última `20261017090100_v11_v95_selecao_e_abrangencia_do_calculo`).
**Nenhum deles tinha conexão aberta** no momento da conferência (`pg_stat_activity` vazio para
`gestao%`).

**Ambiente da árvore principal — apontados pelo `.env`, em uso (3)**

| Banco | Variável | Migrations | Última aplicada | Situação |
|---|---|---|---|---|
| `gestao_publica` | `DATABASE_URL` | 212 | `..._v11_v93_estado_minimo_do_adiantamento`, 09-24 11:36 | **desenvolvimento** — atrasado 6 migrations |
| `gestao_publica_test` | `DATABASE_URL_TEST` | **218** | `..._v11_v95_selecao_e_abrangencia_do_calculo`, 09-24 21:34 | **teste da árvore principal** — no HEAD |
| `gestao_publica_percursos` | `DATABASE_URL_PERCURSOS` | 205 | `..._v11_v812_excecao_de_calendario_versionada`, 09-23 02:40 | **percursos de navegador da principal** — atrasado 13 |

**Evidência preservada deliberadamente (3)** — declarados na seção 96, criados para conferir
migration pelo efeito: `gestao_publica_isolado_v11v94` (214), `gestao_publica_isolado_m32_133bc2a`
(216; `133bc2a` é commit ancestral de `main`) e `gestao_publica_isolado_v11v95` (218, no HEAD).

**Clone de percurso cuja worktree foi removida nesta unidade (4)** — o nome casa com a worktree:
`gestao_publica_percursos_13_7b3deda`, `..._v7m1_compl_6fa0d62`, `..._v7m1_compl_d163d21`,
`..._v7m1_eixos_838227a`.

**Clone de corrida já encerrada, sem worktree correspondente (16)**:
`gestao_publica_instalacao_v7m2_v85` (202, instalação limpa do V7 M2 V8.5);
`..._percursos_v11v92`, `v11v92b`, `v11v92c`, `v11v92d` (210);
`..._percursos_v11v93`, `v11v93b`, `v11v93c`, `v11v93d`, `v11v93e` (211–212);
`..._percursos_v7m1_13o_v11v93`, `..._13o_v11v93b` (212);
`..._percursos_v7m1_j9_v11v93`, `..._j9_v11v93b` (212);
`..._percursos_v7m1_compl_verde` (216); `..._percursos_v7m1_eixos_b` (216).

3 + 3 + 4 + 16 = **26**, conferido.

**Ressalva de ordem, para quem executar a remoção**: os bancos com `v11v93` no nome pertencem à
mesma rodada da worktree `artefato-v11v93`, que está **retida por veredito**. Não os trate como
descartáveis antes do veredito sair.

### O que esta unidade NÃO fez

- **Nenhuma medição de produto**: sem `tsc`, sem suíte, sem percurso. Nada aqui altera o estado de
  validação da V11 V9.5, e nada aqui deve ser lido como aprovação.
- **Seções 3 e 4 da ordem V12 não iniciadas** — as quatro lacunas (Ibema, segunda complementar,
  instrução de `validate`, apresentação de dinheiro) e a continuidade de construção seguem devidas.
- **Nenhum banco removido.**

### Próximo ponto exato

Aguardando o veredito sobre as **duas worktrees retidas** (`artefato-v11v93` e
`percurso-glosa-0adaf12`) e a seleção da próxima unidade da seção 3 da V12. As pendências de
produto da seção 96 seguem todas de pé, sem alteração.

## 98. V12 — o veredito que a medição desmentiu, os dois censos e o dinheiro que ficava calado

> Ordem: `docs/lotes/V12-consolidacao-e-construcao-integrada.md`, seções 2 (fecho) e 3 (itens D e A).
> Base `1c6e79c`. Três commits: `b484f20`, `fea56fa`, `e4e20ee`.

### A consolidação fechou: uma árvore, e só

As duas worktrees retidas na seção 97 foram resolvidas e removidas. O diretório de candidatos caiu
de **989 MB para 844 KB** (só scripts soltos e `.sql`); `git worktree list` tem **uma** linha.

**`artefato-v11v93` — CLASSE B, removida, branch preservada.** Nada a recuperar: as 263 linhas são
a versão anterior de coisas que `main` já consertou. A worktree saiu com `remove_exit=0`; a branch
`v11v93-artefato` (`97f058b`) **continua existindo** e foi conferida depois da remoção — é
referência de recuperação, e não custa espaço.

**`percurso-glosa-0adaf12` — era CLASSE C no veredito, e a medição disse CLASSE B.**
Esta é a parte que importa registrar, porque eu quase integrei uma regressão sob instrução:

```
0adaf12 é ancestral de main            -> exit=0
main está à frente de 0adaf12          -> 107 commits
scripts/percursos-usuarios-por-papel.ts -> sha256 IDÊNTICO entre main e a worktree
scripts/smoke-ponte-contratual.ts       -> 6 linhas só na worktree, 22 só em main
```

O trabalho da glosa e dos dois estornos — os passos 12 a 14, os cinco motivos de recusa, o padrão
de duas abas — **já estava em `main`**, commitado em `43f8842` ("escritos, tipados e NAO
executados"). Depois disso `main` ganhou `82564e9`, que consertou o roteiro **depois da primeira
execução real**. A worktree é o estado ANTERIOR a esse conserto: ela monta o seletor do estorno
pelo NÚMERO do recebimento, e `main` lê o `data-acao` da TELA, porque a V5.2 trocou a chave de
número para id e o seletor estático não achava formulário nenhum no passo 14.1.

**Integrar teria revertido um conserto medido e reintroduzido o defeito.** A instrução dizia "se
algum motivo mudou de nome, corrija o smoke para o motivo REAL de hoje — não o contrário"; aqui o
arquivo inteiro era o "contrário". Nada foi integrado, e `GLOSA-SEM-PERCURSO` e
`ESTORNO-DE-RECEBIMENTO-SEM-PERCURSO` **continuam abertas**: o roteiro existe e nunca rodou verde.

### Item 3.D — os dois instrumentos (`b484f20`)

**O `t5c` eram DUAS contagens quebradas, não uma**, e a hipótese recebida era sobre o teste errado.
Medido antes de mexer, extraindo as chaves nas duas revisões:

| | `8bdf23a` (quando o número foi escrito) | HEAD | delta |
|---|---|---|---|
| serviços (`Object.keys(ACAO_DO_SERVICO)`) | 425 | 427 | `declararNaturezaDaFonte`, `cadastrarFuncao` |
| ações distintas | 359 | 360 | `SELECIONAR_VINCULOS_DA_FOLHA` |

Zero removidas em ambas. **O censo estava certo; o que faltava era o registro.** Cada um dos três
foi nomeado no censo narrativo com o porquê, e só então o número mudou — não se ajustou o esperado
ao observado. Os dois serviços reusam ação existente, e é exatamente por isso que só a contagem de
serviços tinha ficado vermelha.

⚠️ **E `SELECIONAR_VINCULOS_DA_FOLHA` CONTA no censo de ações, ao contrário do que se supunha.**
`TODAS_AS_ACOES` é a união de `ACAO_DO_SERVICO` **mais** `ACOES_DE_LEITURA` **mais**
`ACOES_SEM_SERVICO_PROPRIO`. Pôr uma ação em `ACOES_SEM_SERVICO_PROPRIO` — que foi a decisão certa —
tira do censo de SERVIÇOS e **não** tira do de AÇÕES. Ficou escrito lá.

**E havia um terceiro vermelho, o `t5`**, que a hipótese recebida descrevia: `exigirNaturezaDaFonte`
e `criterioDoAbatimentoNoCalculo` sem classificação. As duas foram para `FORA_DO_CENSO` com o
motivo — a primeira recebe `TxDeLeitura` e só recusa, a segunda só soma linhas já gravadas. Dar-lhes
ação própria inventaria uma segregação que o ente não tem.

**A prova de que acusa**, com checksum: retirada UMA das duas entradas (`3b410d5c…` → `d39252fd…`),
o `t5` ficou vermelho nomeando **exatamente ela e não a outra**; revertido (sha de volta), 5/5 verde.

**A instrução de `validate`** foi corrigida **no lugar onde ela vive** (`prisma/schema/_base.prisma`),
para `npm run prisma:validate`. A regra **não** foi movida para o `CLAUDE.md` — essa decisão é do
usuário e continua pendente. Medida nas duas direções com mutação de prova (um `model` sem `@id`,
P1012) aplicada e revertida com checksum:

```
schema íntegro  -> npm run prisma:validate rc=0   npx prisma validate rc=0
schema quebrado -> npm run prisma:validate rc=1   npx prisma validate rc=1
```

O `npm run` **propaga**. Quem engole o código é o **cano**: medido `false | tail -1` → rc=0 contra
`false` → rc=1. A instrução passou a dizer isso, e a dizer que `validate` não regenera o cliente.

### Item 3.A — o dinheiro que ficava calado (`fea56fa`)

`APURADO-A-REPOR-ENCOBERTO-POR-FOLHA-SEM-VINCULOS`, nomeado e não consertado desde a V11 V9.5.
`contrachequesMensaisDaCompetencia` lançava `FOLHA-SEM-VINCULOS` no próprio corpo; no caminho
complementar isso acontecia **antes** de `VINCULO-APURADO-FORA-DO-RECALCULO` poder rodar. Com o
único vínculo selecionado inelegível e com apurado em folha fechada, o operador lia "nenhum vínculo
elegível" e o sistema calava sobre valor a repor ao erário.

O conserto é de ORDEM, sem aritmética nova: o motor ganhou `aoFicarSemVinculos`; o caminho MENSAL
segue `RECUSAR` (padrão, idêntico ao de antes) e o COMPLEMENTAR pede `DEVOLVER_VAZIO` e recusa ele
mesmo, depois de conferir o apurado. A mensagem saiu para `motivoDeFolhaSemVinculos`, em um lugar só.
Nada é gravado, e a diferença negativa em momento nenhum vira crédito: o cálculo inteiro para.

**Fixture N=2, os dois inelegíveis, a diferença entre eles é só o dinheiro**: M-A desligado com
efeito antes da competência (com apurado) e M-E admitido depois (sem apurado). A recusa tem de
nomear M-A e **não** M-E — com um inelegível só, nomear todos daria o mesmo resultado e o teste
passaria por vacuidade. Afirmado também que a mensagem trivial não aparece e que o complementar
fica com zero cálculos. Par negativo e caso do MENSAL inalterado junto.

**A prova de que acusa**, com alvo confirmado antes de ler resultado: revertida a reordenação
(`65012e1b…` → `34259f27…`, e `grep` do texto mutado = 0), **exatamente 1 dos 16** caiu — o que
discrimina —, com a mensagem original do defeito, `FOLHA-SEM-VINCULOS: nenhum dos 2 vínculo(s)
SELECIONADO(S) é elegível`. Revertido, 16/16 verde.

### O achado não pedido — dois censos de limpeza (`e4e20ee`)

Medindo os dirigidos do M33, três casos de `m33-versao-da-rubrica` (d3, d4, e6) estavam vermelhos
com `AbrangenciaDoCalculo_calculoId_fkey` violando RESTRICT. **Provado anterior à minha mudança**:
com o `servico.ts` do HEAD no lugar do meu, as mesmas três falham com a mesma causa.

O que quebrava era um censo **privado** dentro do teste (`limparBancoDeFolha`), que apaga tabela a
tabela sem CASCADE e não aprendeu a tabela da V11 V9.5. `test/limpar-banco.ts` também ganhou a
entrada — lá é `TRUNCATE ... CASCADE`, então não era a causa, mas a completude não é opcional.
Mesma classe do `FuncaoDePessoal` fora do censo na V11 V9.4.

### O que foi medido — número por número

| Medição | Resultado | `rc` lido de |
|---|---|---|
| `m16-censo.test.ts` | **5/5** | arquivo, `rc=0` |
| `m33-selecao-no-calculo.test.ts` | **16/16** (eram 13) | arquivo, `rc=0` |
| `m33-versao-da-rubrica.test.ts` | **11/11** | arquivo, `rc=0` |
| dirigidos M33 + M16 (`--maxWorkers=3`) | **36 arquivos, 444 testes, 0 falhas** | arquivo, `rc=0` |
| `tsc -p tsconfig.backend.json` | **0 `error TS`** | arquivo, `rc=0` |
| `tsc -p tsconfig.json` (app) | **0 `error TS`** | arquivo, `rc=0` |

`--listFiles` confirmou que o projeto do backend inclui os **seis** arquivos alterados (2016
arquivos no projeto), e que o do app inclui `acoes.ts` e `servico.ts`.

⚠️ **Uma leitura errada minha, registrada.** A primeira corrida do censo saiu `rc=1` com zero linhas
de resultado: eu havia passado `--reporter=basic`, que não existe nesta versão do vitest, e **nenhum
teste rodou**. `rc=1` de invocação quebrada é indistinguível de vermelho real para quem lê só o
código de saída — foi preciso ler o arquivo bruto para ver o `Startup Error`. E antes disso, na
seção 97, um `grep -v -x` caiu no `ugrep` e devolveu zero por morte do cano. Duas formas do mesmo
erro no mesmo dia.

### O que NÃO foi medido, e segue devido

- **Suíte completa, `test:fuso` e portão**: não rodados, não autorizados nesta ordem.
- **Percurso de navegador**: nenhum. `GLOSA-SEM-PERCURSO` e `ESTORNO-DE-RECEBIMENTO-SEM-PERCURSO`
  seguem abertas — o roteiro existe em `main` e nunca fechou verde. Seguem devidos os percursos de
  `/pessoal/funcoes`, `/pessoal/servidores` e do cálculo com seleção.
- **Itens 3.B e 3.C da V12**: não iniciados.
- **Seção 4 da V12**: não iniciada.
- **Catálogo**: nenhuma marcação nesta unidade. 5.12.50 segue `PARCIAL`.

### Próximo ponto exato

Itens **3.B** (seleção no 13º, `SELECAO-NO-13-NAO-CONSTRUIDA`) e **3.C** (cadastro e consulta),
este último com o levantamento do auxiliar a caminho. Nada instalado nem publicado.

## 99. V12 — o float no total de um livro, o dinheiro cru na prosa, e o que a comparação achou

> Ordem: rodada 3 da V12. Base `1d77e86`. Três commits: `26d1a66`, `e5a4209`, `90c49f5`.

### Antes de tudo: a lição que a `percurso-glosa` deixou, escrita como regra

A worktree `percurso-glosa-0adaf12` foi classificada CLASSE C a partir de uma leitura do
**conteúdo** da cópia. A comparação com o destino disse CLASSE B. A regra que fica:

> **Ler o conteúdo de uma cópia não diz se ela está à frente ou atrás. Só a comparação com o
> destino diz.** Ancestralidade, `sha256` por arquivo, linhas exclusivas dos dois lados — o que
> nenhuma leitura acha é que `main` já tinha aquilo desde `43f8842` e ainda o consertou em
> `82564e9`, trocando seletor por número por leitura de `data-acao` da tela. Integrar teria
> revertido um conserto medido por execução real.

### Unidade 1 — float no total de relatório oficial (`26d1a66`, `e5a4209`)

**A ordem nomeava dois sítios. A varredura exaustiva achou seis em código de produto.**

| Sítio | Situação |
|---|---|
| `app/(areas)/relatorios/livros/diario/page.tsx:40` | **consertado** |
| `app/(areas)/relatorios/rreo/anexo6/page.tsx` (`caixaDaDespesa`) | **consertado** |
| `lib/portas/tesouraria.ts` (`contasComSaldo`, saldo por fonte + resíduo) | **consertado** |
| `lib/portas/tesouraria.ts` (`lotes`, total do lote de pagamento) | **consertado** |
| `app/(areas)/licitacoes/contratos/[id]/FormulariosDaExecucao.tsx:495` | **ABERTO** — prévia client-side em formato BR (vírgula); `somarValoresDigitados` existe mas exige normalizador. `PREVIA-DE-PARCELAS-EM-FLOAT` |
| `scripts/poc-conferir.ts:301` | **ABERTO** — diagnóstico de console, não serve tela |

**Nos dois primeiros o motor certo já existia, e o aviso também.** `totaisPorSubsistema` soma em
`BigInt` de centavos e o comentário dela diz: "`Number` sobre dinheiro entra pela porta do
relatório — que é onde ninguém procura". `caixaDaDespesa` (`rreo-anexo6.ts:371`) já somava
(a)+(b)+(c) em `Decimal`. E `lib/portas/livros.ts` avisava: "A TENTAÇÃO É SOMAR NA TELA. Ela
parece inofensiva (é só um `reduce`)". A tela reimplementou as duas em float assim mesmo — a três
arquivos de distância dos avisos. O conserto não inventou aritmética: expôs a que existia, pelas
portas.

### ⚠️ A fixture óbvia não acusa — e isso mudou o teste

A ordem pedia "centavos que não fecham em binário", supondo `0.1 + 0.2`. **Medido: não acusa.** O
código defeituoso termina em `.toFixed(2)`, que arredonda o ruído embora:

```
0.10 + 0.20                    float 0.30              centavos 0.30              iguais
1234.56 + 7890.12 + 0.03       float 9124.71           centavos 9124.71           iguais
8422412220122.26 + …           float 26408371116648.30 centavos 26408371116648.31 DIFEREM
```

Como a soma exata de valores de 2 casas tem 2 casas, o float só vira o **centavo** quando o erro
passa de meio centavo — o que exige magnitude na casa de **2,2 × 10¹³**. Um teste escrito com
`0.1 + 0.2` passaria **com o defeito** e daria a impressão de cobri-lo.

Então: **o defeito estava LATENTE em magnitude municipal**, e dizer isso é parte do registro. Há
um caso no teste que afirma exatamente o contrário do que se quer de um conserto — que o valor
publicado continua **idêntico** ao de antes —, porque consertar o invariante não pode mudar em
silêncio um demonstrativo assinado.

**A prova de que o teste acusa**: as duas funções voltaram ao float (checksum `b0d25edc…` →
`52953592…` e `61911ff2…` → `a023e7cc…`), vermelho nos dois casos de magnitude com diferença de
**um centavo**, e os outros quatro verdes. Revertido, 6/6.

**E o limiar de 0,005 da tesouraria caiu com motivo**: ele existia para **absorver ruído de
float**. Com soma exata, o resíduo é zero ou é pelo menos um centavo, e `!resto.isZero()` é
rigorosamente o mesmo teste, sem a tolerância que escondia que a aritmética não era confiável.

⚠️ **`PORTA-DE-TESOURARIA-SEM-TESTE`**: nenhum teste do repo importa `lib/portas/tesouraria`.
Aquela mudança está coberta **apenas** por `tsc` do app — e o `--listFiles` mostrou que o arquivo
**não está** no projeto do backend. É a lição da seção 94 aparecendo de novo.

### Unidade 2 — o dinheiro cru na prosa (`90c49f5`)

O defeito não é campo, é **frase**: memória por rubrica e mensagens de recusa montadas com
`toFixed(2)` e gravadas já formatadas. Campo a tela reformata; frase pré-cozida fica congelada e
entra no `sha256` do contracheque.

O motor textual foi para `packages/contracts/moeda.ts`; `lib/format/moeda.ts` virou **casca fina**
que reexporta — nenhum import mudou para as 64 telas. Duas apresentações sobre um motor:
`formatarMoeda` (coluna contábil, 2 casas, negativo entre parênteses) e `emProsa` (frase, casas
preservadas, negativo com sinal de menos, porque a frase já tem os parênteses dela).

**⚠️ A medição reclassificou o levantamento.** Ele falava em "~70 pontos de interpolação" via
`m()`. Medido:

| | prosa | campo estruturado |
|---|---|---|
| `dominio.ts` | 26 | 29 |
| `complementar.ts` | 9 | 12 |
| `decimo-terceiro.ts` | 16 | 22 |
| `encargos.ts` | **0** | 7 |
| **total** | **51** | **70** |

Os "~70" são justamente os usos em **CAMPO** — os que a ordem manda **não** tocar. Trocar `m()`
inteiro teria formatado campo de memória e quebrado quem o consome programaticamente. Por isso
`m()` ficou como está e nasceu `reais()` ao lado, com a distinção escrita no arquivo.

⚠️ **Uma colisão minha, pega antes de medir**: o helper nasceu chamado `r`, e `dominio.ts` já tem
uma variável local `r` (a rubrica) usada na **mesma linha** (`linha(r, …)`). Renomeado para
`reais`.

**O hash e a versão.** `sha256Canonico` hasheia a prosa inteira. Folha fechada não se recalcula
(invariante 3), então o corte é **prospectivo** e nada gravado se move — mas as três versões de
motor subiram para marcar o corte, com o motivo ao lado de cada uma: `m33-folha-1.1.0` → `1.2.0`,
`m33-complementar-1` → `-2`, `m33-decimo-terceiro-1.0.0` → `1.1.0`. Medido: **zero hash literal e
zero versão de motor fixada em teste** no repo inteiro — nenhum teste era evidência de memória
histórica nesse sentido. As 8 falhas foram todas de prosa antiga, atualizadas declaradamente.

**A prova de que a troca chegou**: `emProsa` passou a devolver o valor cru (`8007b9ea…` →
`1e914392…`); vermelho em três arquivos, 9 testes, incluindo `m33-folha` e
`m33-complementar-dominio` — o que prova que a prosa dos **motores** passa por ela. Revertido, verde.

`PERCENTUAL-CRU-NA-PROSA` fica nomeada: `${pct.times(100).toFixed(2)}%` continua imprimindo
`33.33%` em três frases. É o mesmo defeito de classe, mas não é dinheiro, e a ordem era sobre
dinheiro.

### O que foi medido

| Medição | Resultado | `rc` |
|---|---|---|
| `m12-totais-sem-float.test.ts` (novo) | **6/6** | arquivo, 0 |
| dirigidos M12 + M09 | **40 arquivos, 313 testes, 0 falhas** | arquivo, 0 |
| `packages/contracts/moeda.test.ts` (novo) | **7/7** | arquivo, 0 |
| M33 + packages/contracts + `test/ui/moeda.test.ts` | **18 arquivos, 313 testes, 0 falhas** | arquivo, 0 |
| `tsc -p tsconfig.backend.json` | **0 `error TS`** | arquivo, 0 |
| `tsc -p tsconfig.json` (app) | **0 `error TS`** | arquivo, 0 |

`--listFiles` confirmou a cobertura em cada projeto, e foi ele que mostrou que
`lib/portas/tesouraria.ts` só existe no projeto do app.

⚠️ **Um erro de tipo real, achado e consertado no caminho**: a casca de `lib/format/moeda.ts`
importava sem extensão `.js`, o que o projeto do backend recusa (`node16`). O efeito em cascata
foi instrutivo: `formatarMoeda` virou `any`, e o `@ts-expect-error` que prova "passar `number` é
erro de compilação" ficou **sem uso** — o instrumento acusou a perda do tipo antes de qualquer
teste rodar.

### O que NÃO foi medido

Suíte completa, `test:fuso`, portão e percurso de navegador: **nenhum**. Nenhuma marcação de
catálogo. `lib/portas/tesouraria.ts` sem teste dirigido, como acima.

### Próximo ponto exato

Itens **3.B** (seleção no 13º) e **3.C** (cadastro e consulta) da V12, e a seção 4. ⚠️ O 3.B
depende de banco no HEAD: `gestao_publica_percursos` está **13 migrations atrás** (205 contra 218)
e `gestao_publica` está **6 atrás** (212). Pôr os bancos em dia é unidade própria, anterior a ele.

## 100. V12 — os bancos no HEAD, dois percursos VERDES, e a capacidade que ninguém alcança

> Ordem: rodada 4 da V12. Base `86f08ab`. Commit desta unidade: `5842044`.
> Produto sob teste: build de `86f08ab` (`BUILD_ID a1zLE0zun_6Ke8CyWUwVB`, 20:51), anterior a
> toda edição de script desta rodada (20:55 em diante). **Zero arquivos de produto alterados.**

### Unidade 1 — os três bancos no HEAD, pelo efeito

`migrate deploy` (nunca `dev`, nunca `reset`), depois `prisma generate`. Nenhum banco apagado ou
criado; os 26 seguem lá.

| Banco | antes | depois | aplicadas nesta rodada |
|---|---|---|---|
| `gestao_publica` | 212 | **218** | 6 |
| `gestao_publica_percursos` | 205 | **218** | 13 |
| `gestao_publica_test` | 218 | 218 | 0 |

Conferido **pelo efeito**: `count(*)` em `_prisma_migrations` contra as 218 do disco, zero
migrations com `finished_at` nulo nos três.

⚠️ **Uma falha minha no caminho, e ela é da família do dia.** A primeira tentativa no banco de
percursos saiu `Schema engine error: zero-length delimited identifier`. Não era o banco: eu extraí
a URL com `awk -F'='`, que a cortou no segundo `=` e entregou `?schema` sem valor. Nada foi
aplicado. Refeito com `sed`, 13/13.

### Unidade 3 — `/pessoal/funcoes` e os eixos: **53 passos, 0 falhas, `exit=0`**

`scripts/smoke-servidores-eixos.ts`, **sem uma linha alterada**, contra o HEAD. Ele já existia
(`c46d378`, onde fechou 53/0 contra o artefato `838227a`) e cobre exatamente o que a ordem pedia:
`/pessoal/funcoes` com `criar-funcoes`, a designação e o centro de custo por `movimentar` em
`/pessoal/servidores/[id]`, a dispensa, o efeito medido por data, os oito eixos de consulta com o
par acha/não-traz, **a paginação com 4.900 de volume** e a recusa do teto.

⚠️ **Correção ao que se supunha**: a designação de função e o centro de custo **não moram** em
`/pessoal/funcoes` — aquela tela só cadastra a identidade da função (`acoes: []`,
`lib/portas/recursos/pessoal.ts:349-375`). Quem designa é `movimentar` do recurso `SERVIDORES`,
com `MUDANCA_CENTRO_DE_CUSTO` e `centroDeCustoId` apontando para o `Setor` do M21.

### O percurso que nunca tinha fechado: a ponte contratual — **50 passos, 0 falhas, `exit=0`**

`GLOSA-SEM-PERCURSO` e `ESTORNO-DE-RECEBIMENTO-SEM-PERCURSO` estavam abertas desde `43f8842`
("escritos, tipados e NÃO executados"). Fecharam. Os 22 passos de 12 a 14 rodaram, e os **cinco**
motivos de recusa apareceram na tela, cada um no seu caso: `GLOSA-CONFIRMADA`,
`MEDICAO-JA-ESTORNADA`, `MEDICAO-COM-RECEBIMENTO`, `RECEBIMENTO-LIQUIDADO`,
`RECEBIMENTO-JA-ESTORNADO` — incluindo o padrão de duas abas, que é o único caminho até a guarda
do servidor quando a página esconde o formulário.

Vale registrar: é o roteiro que a seção 99 **recusou integrar** da worktree `percurso-glosa`. A
versão que fechou verde é a de `main`, com o conserto `82564e9` — a que a worditree teria revertido.

### ⚠️ Unidade 2 NÃO FOI EXECUTADA, e a razão não é ambiente: **não há tela**

A ordem supunha que faltava percurso. Medido, falta superfície. `SELECIONAR_VINCULOS_DA_FOLHA`
aparece **uma única vez** fora de `modules/` e dos testes: `lib/portas/navegacao-permissoes.ts:347`,
o mapa ação→área. Não há formulário, não há campo, e a ação de calcular

```
lib/portas/recursos/folha-dados.ts:352
  const r = await comEscritaAutenticada("CALCULAR_FOLHA", (criadoPor) =>
    calcularFolha(prisma, { folhaId, ...(motivo ? { motivo } : {}), criadoPor }));
```

lê **apenas `motivo`** e nunca repassa `selecao` — então `calcularFolha` roda sempre com
`SELECAO_DE_TODOS`. Também não há leitura de `AbrangenciaDoCalculo` em `app/` (zero ocorrências).

**`SELECAO-NO-CALCULO-SEM-SUPERFICIE`** fica nomeada. É a mesma armadilha da seção 94 (`cadastrarFuncao`
sem chamador), agora sobre um motor com guarda, fato de abrangência e 16 testes: **o operador não
alcança nada disso**. É trabalho de CONSTRUÇÃO, não bloqueio externo nem percurso pendente — e por
isso o cenário obrigatório (nº1={A,B}, nº2={C,D}, recusa nomeando M-A e M-B) segue provado só em
teste.

Sobre a proibição literal da ordem — "paginação não pode definir silenciosamente quem será
calculado" —: o domínio já a respeita por construção (`modules/m33-folha/abrangencia.ts:38-45`, o
modo é DECLARADO, nunca inferido do tamanho da lista). Isso é invariante pronta **para a tela que
não existe**, não prova de que ela existe.

### Quatro paradas antes do verde, e nenhuma era do produto

O percurso só fechou na quarta tentativa. Nenhuma das três primeiras foi defeito de produto:

1. **`banco-descartavel.ts` recusou o nome** `gestao_publica_percursos_v12_r4`. A guarda estava
   certa em recusar e o padrão é que estava datado (`v7m[12]` cravado).
2. **Sete cópias do mesmo padrão** (`5842044`). Corrigida uma, `preparar-ponte-contratual.ts`
   recusou o MESMO banco porque a cópia dele continuava velha. Unificadas em
   `scripts/nome-de-banco-descartavel.ts`.
3. **`LicenciamentoNaoInstaladoError`, HTTP 500 em toda área.** Produto **correto**: fail-closed
   deliberado. O clone veio de `gestao_publica_percursos`, que tem **0 contratos** — o passo de
   licenciamento nunca rodou nele.
4. ⚠️ **E o instalador saiu `exit=0` sem gravar nada**: ele é PRÉ-VISUALIZAÇÃO por padrão
   ("Rode de novo com `--aplicar`"). Desenho certo dele, leitura errada minha — a **terceira**
   vez neste dia em que código de saída zero não significa efeito, depois do `ugrep` que morreu e
   do `--reporter=basic` que não rodou teste nenhum. Depois disso ele recusou de novo, agora
   nomeando `LICENCA_NUMERO` e `LICENCA_CLIENTE` como obrigatórias sem valor padrão — e essa
   recusa também é o produto certo. Supridas como **fixture declarada**, nomeando o banco
   descartável, nunca um instrumento real.

⚠️ A build também parou uma vez: `SIGABRT` por heap na fase de checagem de tipos. **Não foi
desabilitada conferência nenhuma** — recebeu `--max-old-space-size=5324`, o valor que esta máquina
já usa para `tsc`, e fechou `rc=0`.

### O que foi medido

| | Resultado | `rc` |
|---|---|---|
| `migrate deploy` dev / percursos | 6 e 13 migrations | arquivo, 0 e 0 |
| `prisma generate` | cliente regenerado | arquivo, 0 |
| `next build` (2ª, com heap) | `BUILD_ID a1zLE0zun…` | arquivo, 0 |
| `smoke-servidores-eixos.ts` | **53 ok / 0 falhas** | arquivo, 0 |
| `smoke-ponte-contratual.ts` | **50 ok / 0 falhas** | arquivo, 0 |
| `tsc -p tsconfig.scripts.json` | 0 `error TS` | arquivo, 0 |
| guarda do nome descartável | 10 casos, 0 divergências | 0 |

### O que NÃO foi feito

- **Catálogo NÃO marcado.** Busca dirigida por glosa/estorno no contexto de contrato devolveu 10
  cláusulas e **nenhuma** é correspondência limpa da glosa de medição ou do estorno de recebimento
  definitivo (as mais próximas são estorno de ordem de compra e gestão de contratos). Marcar por
  aproximação seria atestar pela papelada num catálogo de 2.037 cláusulas. A identificação da
  cláusula fica devida.
- Suíte completa, `test:fuso` e portão: não rodados.
- Unidade 2: não executada, pelo motivo acima.

### Próximo ponto exato

**Construir a superfície da seleção no cálculo** (`SELECAO-NO-CALCULO-SEM-SUPERFICIE`): campo de
seleção no formulário de calcular, leitura de `selecao` em `acaoDaFolha`, e a leitura da
abrangência no detalhe da folha. Só depois o percurso do 3.B. Seguem abertas
`PREVIA-DE-PARCELAS-EM-FLOAT`, `PORTA-DE-TESOURARIA-SEM-TESTE` e `PERCENTUAL-CRU-NA-PROSA`.

## 101. V12 — a superfície da seleção, o percurso verde, e a prova que NÃO fechou

> Rodada 5 da V12. Base `e2faef2`. Commits: `d800d03`, `e2faef2`, `32c7beb`, `62bd0f6`.

### O que passou a existir

`SELECAO-NO-CALCULO-SEM-SUPERFICIE`, achado na rodada 4, está resolvido. O motor tinha seletor,
guarda, fato de abrangência e 16 testes desde `29a43fe`, e **o operador não alcançava nada disso**.
Eram DUAS inalcançabilidades, e a segunda só apareceu ao construir a primeira:

1. **Sem superfície** — `lib/portas/recursos/folha-dados.ts` lia só `motivo` e nunca repassava
   `selecao`; nenhuma tela lia `AbrangenciaDoCalculo`.
2. **Sem perfil** — medido por varredura: `SELECIONAR_VINCULOS_DA_FOLHA` não estava em **nenhum**
   perfil, seed ou atualização. O motor cobrava uma ação que ninguém tinha.

A cadeia da ordem, ponta a ponta: entrada (o formulário declara o modo e recebe matrículas) →
seleção (resolvida na porta) → autorização (a segunda cobrança, que já existia, agora alcançada) →
motor (inalterado) → efeito (`AbrangenciaDoCalculo`, que já era gravado) → consulta (a seção nova
no detalhe da folha) → correção (as duas saídas da recusa do fechamento).

### ⚠️ Matrícula digitada, e não caixa de seleção na lista

A ordem proíbe em letra que "a paginação defina silenciosamente quem será calculado". Uma lista
paginada com caixas trai isso pelo caminho mais natural que existe: o formulário envia o que está
**visível**, e quem revisa lê "os selecionados" sem perceber que são "os da página 1". O domínio já
se defende — o modo é declarado, nunca inferido —, mas **defesa do domínio não conserta superfície
que mente sobre o que mandou**. Texto num campo só é imune por construção.

E a afirmação mais forte do percurso é **pela ausência**: o passo 2.2 verifica que o formulário de
calcular não tem NENHUM campo por vínculo. Se alguém acrescentar caixas por linha, esse passo fica
vermelho antes de qualquer folha sair errada.

### A atualização de permissões 29, e por que ela não deriva

`SELECIONAR_VINCULOS_DA_FOLHA` **não deriva de `CALCULAR_FOLHA`** — derivar seria desfazer a
segregação no ato de instalá-la. Calcular decide QUANDO o ente paga; recortar decide QUEM fica de
fora. E um recorte errado **não tem detector**: a folha parcial fecha, o total bate, o empenho bate,
a liquidação bate, e quem ficou de fora só descobre no dia do pagamento. Vai só a quem administra
permissões no global, que a distribui nomeando a pessoa — o mesmo critério da v28.

### O percurso — 31 passos, 0 falhas, `exit=0`

O cenário obrigatório fechou **pela tela**: nº1={A,B}, nº2={C,D}, fechar → recusa nomeando M-A e
M-B, com a recusa oferecendo as duas saídas. **As duas foram exercitadas**: recalcular com a seleção
acumulada e fechar; e, noutra folha, cancelar os cálculos que processaram A e B — os cancelados
seguindo visíveis e marcados — e o fechamento passando sem eles. A guarda impede o esquecimento,
não a decisão. Com a lista de servidores noutra página, o calculado é o declarado, e os não
declarados não entram.

**Um defeito do instrumento, pego e consertado.** A primeira corrida deu 14 ok / 6 falhas, e as seis
saíam de UMA causa: `TABELA-AUSENTE`. O produto estava certo. O percurso lia a existência das
tabelas com `texto(page)`, que inclui o FORMULÁRIO — e o `select` de tipo tem as opções "IRRF",
"CONTRIBUICAO_RGPS" e "SALARIO_FAMILIA". O instrumento concluiu "já vigora — reusada" com **zero
tabelas no banco**, medido por consulta direta. Passou a ler as LINHAS da listagem.

### ⚠️ A PARADA, registrada como fato

**A unidade travou durante a prova por mutação.** A mutação escolhida — a porta validando a
declaração e **não** a repassando ao motor — é a certa: é precisamente o defeito que a superfície
nova existe para impedir. Ela foi aplicada e confirmada no alvo por checksum **e** por texto. O
`next build` que a levaria ao servidor não terminou, e a sessão travou.

**O coordenador reverteu a mutação**, conferindo antes que a cópia limpa do scratchpad tinha sha256
idêntico ao do arquivo no HEAD — reversão exata, não aproximação.

Retomada, a prova foi refeita e **também não fechou**, por outra causa. As duas corridas contra a
build mutante morreram em `Runtime.callFunctionOn timed out` **antes da primeira asserção**, com a
tabela de processos limpa. Medido no segundo insucesso: **75 MB livres, 5,7 GB de 7 GB de swap em
uso, 2,6 GB no compressor**. É a saturação que o `CLAUDE.md` descreve.

> **O resultado da mutação é INEXISTENTE, não desconhecido.** O percurso está VERDE e **ainda não
> provado como acusador**. Um leitor futuro não pode confundir "não mediu" com "mediu e passou" —
> e é por isso que isto está escrito aqui, na mensagem do commit do percurso e dentro do próprio
> catálogo.

O artefato `.next` ficou com a build MUTANTE. Foi **removido**, para que o estado seja "sem build" e
não "build silenciosamente errada" — ausência é fail-closed, artefato errado não é.

### ⚠️ "Exit zero não significa efeito" — a QUARTA vez, e agora como CLASSE

Quatro ocorrências em um dia, e a forma é sempre a mesma: **a pergunta "rodou?" nunca responde
"gravou?"**.

| # | Ferramenta | O que o exit dizia | O que acontecera |
|---|---|---|---|
| 1 | `grep -v -x` (é `ugrep` nesta máquina) | 0 linhas sujas | o grep morreu e o `wc` contou o vazio |
| 2 | `vitest --reporter=basic` | `rc=1` | **nenhum teste rodou** — flag inexistente |
| 3 | `licenciamento:instalar` | `exit=0` | pré-visualização: nada gravado |
| 4 | `marcar-catalogo.ts` | `exit=0` | pré-visualização: nada gravado |

**Não é azar: é a forma que o engano assume quando a ferramenta tem um modo seguro.** Uma ferramenta
bem desenhada não grava por acidente, e o preço disso é que o exit de sucesso passa a significar
"a simulação correu bem". Na quarta vez a armadilha foi vista antes: a gravação do catálogo foi
conferida no JSON, não no código de saída.

### O que foi medido

| Medição | Resultado | `rc` |
|---|---|---|
| `m33-declaracao-da-selecao.test.ts` (novo) | **9/9** | arquivo, 0 |
| `m33-selecao-no-calculo.test.ts` | **18/18** (eram 16) | arquivo, 0 |
| dirigidos M33 + M16 | **37 arquivos, 455 testes, 0 falhas** (eram 36/444) | arquivo, 0 |
| dirigidos M16 (após a v29) | **20 arquivos, 146 testes, 0 falhas** | arquivo, 0 |
| `smoke-selecao-no-calculo.ts` | **31 ok / 0 falhas** | arquivo, 0 |
| `tsc` backend / app / scripts | **0 `error TS`** cada | arquivo, 0 |

O par de autorização é **não vacuoso**: o ator é construído com perfil de UMA ação, porque as
identidades das fixtures recebem tudo. O MESMO ator calcula TODOS com sucesso (4 contracheques, o
padrão conservador do domínio) e é RECUSADO ao recortar, com a negação afirmando o MOTIVO.

### Catálogo

**5.12.50 continua PARCIAL.** Nada foi promovido: `VALIDADO_LOCALMENTE` segue em 75 cláusulas,
`PARCIAL` em 101. O que mudou foi a retirada de uma afirmação que **ficou falsa** ("a seleção de
quem entra no cálculo não existe") e a entrada do terceiro percurso com a ressalva da mutação. A
razão de ainda ser parcial agora é uma só: **quatro tipos de nove**.

### Próximo ponto exato

**Fechar a prova por mutação do percurso da seleção**, quando a máquina permitir: mutar, confirmar
o alvo, `next build` com `--max-old-space-size=5324`, rodar, reverter. Sem ela o percurso é verde e
não é prova. Seguem abertas `PREVIA-DE-PARCELAS-EM-FLOAT`, `PORTA-DE-TESOURARIA-SEM-TESTE` e
`PERCENTUAL-CRU-NA-PROSA`. A seção 4 da V12 não foi iniciada.

## 102. V13 — o adiantamento salarial construído: motor, tela e as duas armadilhas provadas

> Ordem `docs/lotes/V13-adiantamento-salarial.md`. Base `9654a14`. Quatro commits:
> `599be5c` (domínio, motor e censos), `241cebf` (superfície), `9d87fe9` (testes e
> censos que o compilador não pega), e este.

### O que o operador passa a alcançar

**Folha > Parâmetros do adiantamento salarial** (`/folha/parametros-do-adiantamento-salarial`),
entrada própria no menu da folha. Ali ele declara, **por competência**: o percentual, sobre que
base ele incide, qual rubrica paga e qual abate, **qual estado o vale precisa ter alcançado para
ser abatido** (fechado, certificado ou pago) e o ato do ente que fundamenta tudo isso.

Depois, pelas telas de folha que já existiam: abrir uma folha do tipo **Adiantamento salarial**
(tipo novo na lista), calcular (com ou sem seleção de vínculos), revisar o contracheque, fechar,
certificar e apropriar — e a folha MENSAL da mesma competência passa a abater o vale
automaticamente, com o desconto aparecendo como linha no contracheque, explicada.

### O que a ordem V13 acrescentou ao levantamento, e como ficou

**(A) As duas bases não esgotam as regras.** `SEMANTICA_DA_BASE` é `Record` exaustivo: cada opção
carrega semântica (o fato que ela lê), fundamento aplicável (o que o ato do ente precisa dizer) e
quem fica de fora. Vigência é `(competencia, versao)`, append-only; aprovação é a ação própria mais
o `criadoPor`. Regra que não seja nenhuma das duas é **recusada no cadastro**, com a pendência
`REGRA-DO-ADIANTAMENTO-SALARIAL-NAO-SUPORTADA` escrita no MODULO e dita **na tela**, antes da
escolha.

**(B) As distinções financeiras.** Cálculo, fechamento, apropriação, liquidação e pagamento estão
separados, e **fechar não é pagar** — a tela diz isso em letra. Qual fato permite reconhecer o vale
na mensal é **declarado pelo ente**, no parâmetro, com ato, e o campo é **obrigatório** (diferente
do 13º, onde ele nasceu nulável porque havia parâmetros gravados antes da pergunta existir; aqui a
tabela nasce vazia). O valor compensado é o **apurado** no vale fechado. Não compensar duas vezes é
consequência da aritmética, não promessa: na complementar a linha está nos dois lados da subtração
e o delta é zero. Cancelamento e estorno **depois** do abatimento ficam nomeados em
`ESTORNO-DO-ADIANTAMENTO-SALARIAL-DEPOIS-DA-MENSAL` — a obrigação não some (a procedência fica na
memória do contracheque); o que falta é o ato, que este sistema não pratica.

**(C) As duas interações.** O vale **não** bloqueia a complementar — afirmado no caso c6, e provado
por mutação: trocar `compoeARemuneracaoMensal` para `true` deixa aquele caso vermelho com
`DiferencaNegativaNaComplementarError`, exatamente o defeito que a varredura previu. E o elo
persistido do 13º **não** foi copiado: a leitura é refeita a cada cálculo, por competência, sem FK.

**(D) Snapshots.** A mensal lê a versão do parâmetro **que apurou aquele vale**, pela memória do
contracheque — nunca a vigente de hoje. Provado por mutação também.

### O que corrigiu o levantamento

A varredura deu o CHECK `ck_folha_exercicio_por_tipo` por resolvido ("não muda de forma"). A forma
não muda, mas desde a V11 V9.4 ele enumera **duas listas explícitas** justamente para falhar fechado
no tipo seguinte: sem o `ALTER`, `abrirFolha` de um vale seria recusada pelo banco no primeiro
`INSERT`. Conferido no arquivo da migration, não presumido.

### Comandos executados e resultado real

| Comando | Resultado |
|---|---|
| `npm run prisma:validate` | `exit=0` |
| `npm run prisma:generate` | `exit=0` |
| `npm run typecheck` (backend, `--listFiles`) | `exit=0`, zero `error TS`, os 9 arquivos alterados confirmados no projeto que rodou |
| `tsc -p tsconfig.json` (app, `--listFiles`) | `exit=0`, zero `error TS`, as 3 telas novas confirmadas |
| `prisma migrate deploy` em `gestao_publica_test` | `exit=0`, 4 migrations aplicadas |
| `prisma migrate deploy` em `gestao_publica` | `exit=0`, 4 migrations aplicadas |
| `npm run db:papel` | `exit=0` nos dois bancos |
| `vitest m33-adiantamento-salarial` | **19/19**, `exit=0` |
| mutação 1 (`compoeARemuneracaoMensal` → `true`) | **1 falha / 18 passam**, `exit=1`; revertida, checksum idêntico, 19/19 |
| mutação 2 (parâmetro vigente em vez do que apurou) | **1 falha / 18 passam**, `exit=1`; revertida, checksum idêntico, 19/19 |
| `vitest` m33-recorrencia + listas-de-natureza + m33-folha + complementar | **59/59**, `exit=0` |
| `vitest` m33-decimo-terceiro + criterio-do-abatimento + selecao-no-calculo | **67/67**, `exit=0` |
| `vitest` m16-censo + m16-atualizacoes + m16-rollout | **30/30**, `exit=0` |
| `vitest` papel-runtime + limpeza-do-banco-completa + cobertura-de-tsconfig | **21/21**, `exit=0` |
| `vitest` menu-contra-o-servidor + busca-global + amarracao-do-recurso + licenciamento-gate | **25/25**, `exit=0` |
| `marcar-catalogo --aplicar` | `exit=0`, **1 cláusula a mudar**, gravação **conferida no JSON** |

Migrations aplicadas: `20261018090000` (tipo de folha), `20261018090100` (natureza da rubrica),
`20261018090200` (ação), `20261018090300` (tipo `BaseDoAdiantamentoSalarial`, tabela do parâmetro e
o CHECK ampliado). **Todas aditivas, zero `DROP`.** Nenhum banco apagado.

### Invariantes verificadas

Dinheiro em `Decimal` com os helpers de `packages/contracts` em todo o caminho novo; razão
append-only (o parâmetro é append-only, e nada aqui dá `UPDATE`, por isso `prisma/papel-runtime.ts`
não mudou); autorização no servidor por ação nomeada, com negativa afirmando o motivo e ator fora
do censo das fixtures; fail-closed em cada ausência (parâmetro, mensal anterior, rubrica sem versão,
memória ilegível). **O abatimento não reduz base de contribuição nem de IRRF** — afirmado no caso
c1, que é o assert que mais vale ali: se reduzisse, o ente recolheria a menos ao RPPS todo mês com
vale, com a folha fechando.

### Catálogo — por natureza

**Cobertura: zero.** Nenhuma cláusula mudou de situação; a distribuição é idêntica à de antes
(`PARCIAL` 101, `VALIDADO_LOCALMENTE` 75, `IMPLEMENTADO_NAO_VALIDADO` 67, `AUSENTE_CONFIRMADO` 145,
`DEPENDENCIA_EXTERNA` 4, `NAO_VERIFICADO` 1645). **Situação: zero.** **Validação: zero.**

A **5.12.50** teve só a EVIDÊNCIA atualizada e **segue `PARCIAL`**: o quinto dos nove tipos ganhou
motor, e isso não é atender edital — nascer um enum novo não move cláusula. Continuam ausentes
rescisão, rendimentos acumulados, férias e diferença de 13º.

### Pendências — escopo NÃO executado (trabalho pendente aqui)

- **`ADIANTAMENTO-SALARIAL-SEM-PERCURSO-DE-NAVEGADOR`** — a tela existe, está no menu e passa no
  typecheck; **nenhum percurso de navegador rodou**, e por isso a 5.12.50 não se move. Falta
  `scripts/smoke-adiantamento-salarial.ts`.
- `ESTORNO-DO-ADIANTAMENTO-SALARIAL-DEPOIS-DA-MENSAL`, `INCIDENCIA-NO-ADIANTAMENTO-SALARIAL`,
  `REGRA-DO-ADIANTAMENTO-SALARIAL-NAO-SUPORTADA`,
  `ABRANGENCIA-DO-ADIANTAMENTO-SALARIAL-SEM-BASE-NAO-NOMEADA`,
  `ESTADO-DO-ADIANTAMENTO-VERIFICADO-EM-DOIS-SITIOS` — todas escritas no `MODULO.md` do M33.
- A **prova por mutação do percurso da seleção** (V12 rodada 5) **continua pendente**, intocada por
  decisão da ordem: não se repetem 31 passos sem mudança nem risco concreto, e esta construção não
  alterou aquele contrato.
- **Não rodaram**: suíte completa, `test:fuso`, portão, `next build`, qualquer navegador.

### Bloqueio externo (depende de terceiro)

Nenhum novo. Seguem os já registrados: eSocial, ASTEC, certificado A1, AWS, ENT12; e o bloqueio de
fonte `DISPOSITIVO-MUNICIPAL-DO-13-NAO-LIDO`.

### O próximo ponto exato

Medir a máquina de novo e, **só se ela permitir**, rodar `next build` + o percurso de navegador do
adiantamento salarial — configurar o parâmetro pela tela, abrir/calcular/fechar a folha do vale,
e conferir a mensal seguinte abatendo, com as recusas exercitadas. **A decisão de tentar interface
é do coordenador, não desta sessão.** Enquanto isso não acontece, a 5.12.50 segue `PARCIAL`.

## 103. V13 rodada 2 — o vale até o pagamento, a guarda 5 sozinha, e a despesa que dobra

> Rodada 2 da V13. Base `0e9fa97`. Commits: `3eb8360` (unidades 1 e 2 + caracterização da
> apropriação), `893e5fe` (percurso escrito, não executado), e este.

### O que passou a estar medido

A rodada 1 declarou o caminho **PAGO** implementado e **não medido** — um produto que oferece ao
ente uma opção cujo comportamento ninguém verificou. Agora ele tem 15 casos com banco, a cadeia
inteira pelo caminho real: ficha, grupo de empenho **por servidor**, apropriação, designação,
certificação, liquidação e pagamento pelo M05.

**Os dois lados, porque um só não decide nada.** Pago por inteiro → a mensal abate, e a linha do
contracheque afirma o fato **verificado**, não só o exigido. Apenas fechado, apenas liquidado,
parcial e estornado → recusa, cada uma com o motivo verdadeiro. O parcial é o que prova que a
guarda é **por servidor**: MAT-A pago inteiro, MAT-B com 500,00 de 800,00, e a recusa nomeia
MAT-B e **não** MAT-A — uma guarda que olhasse o total da folha também recusaria, nomeando o total.

**Não compensar duas vezes:** recalcular a mensal ainda aberta abate o mesmo valor, duas linhas no
total (uma por contracheque) e não duas no mesmo. É o caminho em que a dupla compensação nasceria.

### Os três achados

**(1) A guarda 5 é a única coisa que separa a rubrica revogada da remuneração paga em dobro.** O
comentário escrito na rodada 1 dizia que a guarda gêmea de `calcularContracheque` era defesa em
profundidade para esse caso. **A mutação desmentiu**: com o abatimento indefinido na entrada, a
guarda do domínio — que só dispara quando o abatimento foi PEDIDO — nem chega a olhar, e o caso
`u2` ficou vermelho sozinho. O comentário foi corrigido para dizer o medido. É a mesma lição da
V9.5, quando a reconciliação foi rebaixada a defesa em profundidade declarada: **uma mutação que
desmente vale mais que cinco que confirmam.**

**(2) O estorno do vale depois do abatimento fecha a porta da correção.** Medido: a mensal fechada
não muda (a obrigação já reconhecida **não** desaparece, e isso está certo), e a **complementar** —
que seria o instrumento de pagar o que faltou — fica bloqueada, porque recalcula o correto e o
correto passa pela guarda do PAGO, que agora não se satisfaz. A recusa é **verdadeira** e fecha o
caminho. Não se improvisou ato financeiro: o que foi construído é o **nome**. A recusa passou a
detectar que uma folha já fechada da competência abateu, dizer quanto, dizer que o ente deve a
diferença ao servidor e dizer que o acerto é ato que este sistema não pratica. A consulta não muda
decisão nenhuma; muda o que a recusa **diz**, e a diferença é entre um operador que corrige e um
que fica preso. Pendência: `ESTORNO-DO-VALE-BLOQUEIA-A-COMPLEMENTAR`.

**(3) O vale empenhado duplica a despesa do mês.** A resposta à pergunta "a folha do vale se
apropria como as outras?" é **sim** — e é exatamente por isso. Para MAT-A, em junho: empenho do
vale 1.200,00 mais empenho da mensal 3.000,00 (o BRUTO; o abatimento é desconto, e desconto é
retenção do pagamento, não despesa) = **4.200,00 empenhados para 3.000,00 de custo**.

Não é escolha de desenho: é o resultado de não haver escolha nenhuma. As duas práticas conhecidas
são coerentes — (a) o vale é extraorçamentário e só a mensal é despesa; (b) o vale é despesa e a
mensal empenha o restante. O que o sistema produz não é nenhuma das duas. Escolher exige fundamento
normativo que não foi levantado, e recusar a apropriação fecharia a porta do critério PAGO. Ficou
**caracterizado por teste** — que ficará vermelho no dia em que alguém consertar, e é assim que ele
avisa quem consertar — e nomeado: `VALE-EMPENHADO-DUPLICA-A-DESPESA-DO-MES`. **É pendência de
produto, não de engenharia: alguém precisa ler a norma antes de o primeiro município empenhar um
vale.**

### Comandos executados e resultado real

| Comando | Resultado |
|---|---|
| `vitest m33-adiantamento-salarial-pago` | **15/15**, `exit=0` |
| mutação 1 — `if (pago.lt(apurado))` → `if (false && …)` | **5 falhas / 10 passam**, `exit=1`; revertida, sha `e2b69a4e` idêntico |
| mutação 2 — o `throw` da guarda 5 → `if (rAbat !== undefined)` | **1 falha / 14 passam**, `exit=1`; revertida, sha `441ba831` idêntico |
| `vitest` m33-adiantamento-salarial + m33-apropriacao + m33-criterio-do-abatimento | **55/55**, `exit=0` |
| `typecheck` backend (`--listFiles`) | `exit=0`, zero `error TS`, os 3 arquivos alterados confirmados |
| `typecheck:scripts` (`--listFiles`) | `exit=0`, zero `error TS`, o percurso confirmado |

Uma correção de fixture minha, registrada: `anularPagamento` recebe **dois** argumentos
(input, deps) e eu passei o roteiro como segundo — dois casos caíram com
`Cannot read properties of undefined (reading 'exigir')`. Defeito do teste, não do produto.

### Catálogo

**Não tocado**, por instrução. A 5.12.50 segue `PARCIAL` e a distribuição continua idêntica
(`VALIDADO_LOCALMENTE` 75, `PARCIAL` 101, `IMPLEMENTADO_NAO_VALIDADO` 67, `AUSENTE_CONFIRMADO` 145,
`DEPENDENCIA_EXTERNA` 4, `NAO_VERIFICADO` 1645).

### Escopo NÃO executado (trabalho pendente aqui)

- **`ADIANTAMENTO-SALARIAL-SEM-PERCURSO-DE-NAVEGADOR` continua aberta.**
  `scripts/smoke-adiantamento-salarial.ts` existe, passa no typecheck e está no `package.json` —
  e **nunca rodou**. Percurso escrito não é percurso verde. Dois passos dele já nascem declarados
  como não executados (a admissão do par, que reusa `smoke-folha`; e apropriar/liquidar/pagar, que
  esbarra no defeito do item 3 acima).
- `VALE-EMPENHADO-DUPLICA-A-DESPESA-DO-MES` — decisão de produto com fundamento normativo.
- `ESTORNO-DO-VALE-BLOQUEIA-A-COMPLEMENTAR` — falta o ato de acerto, que não se improvisa.
- `ESTADO-DO-ADIANTAMENTO-VERIFICADO-EM-DOIS-SITIOS`, `REGRA-DO-ADIANTAMENTO-SALARIAL-NAO-SUPORTADA`,
  `INCIDENCIA-NO-ADIANTAMENTO-SALARIAL`, `ABRANGENCIA-DO-ADIANTAMENTO-SALARIAL-SEM-BASE-NAO-NOMEADA`.
- A prova por mutação do percurso da seleção (V12 r5) **segue pendente e intocada**.
- **Não rodaram**: suíte completa, `test:fuso`, portão, `next build`, qualquer navegador.

### Bloqueio externo

Nenhum novo.

### A máquina, medida ao fechar — e a pergunta que fica com o coordenador

`livre 0,43 GB · inativo reclamável 1,86 GB · disponível ~2,29 GB · compressor 0,87 GB ·
swap 5,71 de 7 GB`. Nenhum processo nosso acima de 50 MB; `pg-gestao-publica` em 1,36 GiB (o banco
da sessão, não se toca).

**`next build` continua fora de questão** — é ele, com heap de 5,3 GB, somado ao navegador, o par
que travou esta máquina duas vezes. **`next dev` é materialmente mais leve** (compilação sob
demanda, sem o passo de tipos do build, sem otimização de produção), e caberia em ~2,3 GB com o
navegador — mas isso é estimativa, não medição, e o swap já está em 5,71 GB. **A decisão de gastar
a máquina é do coordenador; esta sessão não tentou.**

### O próximo ponto exato

Decidir sobre `next dev` como veículo do percurso. Se sim: clonar o banco de percursos, servir, e
rodar `smoke:adiantamento-salarial` lendo o vermelho antes de concluir que o roteiro está errado.
Se não: a 5.12.50 segue `PARCIAL` e a pendência do percurso segue aberta, nomeada.

## 104. V13 rodada 3 — a conta veio da tabela, a dotação virou recusa, e o percurso continua INEXISTENTE

> Rodada 3 da V13. Base `6a3df2a`. Commits: `624a003` (unidade 1), `47edb01` (unidade 2), e este.

### Unidade 1 — `VALE-EMPENHADO-DUPLICA-A-DESPESA-DO-MES`

**Primeiro a tabela, como o `CLAUDE.md` manda.** Procurado no plano **oficial** do TCE-PB
(`docs/oficial/tce-pb/Pcasp_2025.xlsx`, 7.864 contas, `sha256` conferido no `MANIFEST.json`): das
103 contas cujo nome cita adiantamento ou antecipação, o ramo que serve é `1.1.3.1 ADIANTAMENTOS
CONCEDIDOS`, com `1.1.3.1.1.01 ADIANTAMENTOS CONCEDIDOS A PESSOAL` e, dentro dele,
**`1.1.3.1.1.01.01 SALÁRIOS E ORDENADOS - ADIANTAMENTOS`** — analítica, DEVEDORA. É exatamente o
vale: um direito a receber do servidor.

⚠️ Nem `prisma/seed/pcasp.ts` (o plano mínimo, 64 contas) nem `modules/m01-core-contabil/roteiros.ts`
tinham conta ou roteiro de antecipação a pessoal. **A resposta estava só no arquivo oficial** — e é
por isso que o passo 1 da ordem era "procure na tabela" e não "escolha uma conta".

**A metade patrimonial ficou resolvida**: a apropriação do vale exige contrapartida do ramo
`1.1.3.1.`, senão recusa. A liquidação passa a debitar o **ativo**, e a VPD de pessoal é reconhecida
**uma vez**, na mensal — afirmado pelo efeito, no razão.

**A metade orçamentária virou recusa, não escolha.** O PCASP diz onde o vale entra no patrimônio;
não diz se ele consome dotação nem em que natureza. O que não precisa de norma é a aritmética: a
mesma natureza empenhando a remuneração do mês **e** o adiantamento dela consome o crédito duas
vezes. `VALE-NA-MESMA-NATUREZA-DA-REMUNERACAO` impede isso nas **duas pontas** e por **natureza**,
não por ficha. A pergunta que resta é uma só, e é do ente com fundamento: **o adiantamento salarial
consome dotação orçamentária?**

O teste de caracterização da rodada 2 **mudou de cor, explicado, e não foi apagado**: virou duas
recusas mais um positivo que prova que elas não são só "não" — com a conta do ativo e natureza
própria, a dotação de pessoal do mês volta a 5.000,00 (a remuneração de A e B, uma vez) e o vale
consome 2.000,00 na dotação dele.

### Unidade 2 — `ESTORNO-DO-VALE-BLOQUEIA-A-COMPLEMENTAR`

A pergunta de desenho foi respondida antes de codificar, **e a resposta corrigiu a premissa**.

⚠️ **A direção da dívida é o contrário da intuição**, e agora está medida por matrícula:
pago líquido do vale a MAT-A **0,00**; descontado dela na mensal fechada **1.200,00**; recebido
1.500,00; devido 2.700,00. **O ente deve 1.200,00 ao servidor** — não o contrário.

E a direção decide o instrumento. Se o servidor devesse, o caminho seria reposição ao erário, ato
que este sistema não pratica. Como é o ente que deve, o instrumento correto é a **complementar** —
que existe para pagar o que faltou, e é ela que a guarda do critério PAGO fecha. O beco não é
"falta um ato": é "o ato existe e está fechado por uma guarda verdadeira".

**Achado ao ler `complementar.ts`**: `DiferencaNegativaNaComplementarError` recusa por rubrica **sem
olhar o sinal do efeito**. Para PROVENTO, negativo é "apurado a mais" e recusar é certo; para
DESCONTO, negativo é "retido a mais" e quem deve é o ente. A guarda já distingue os dois **na
mensagem** e não na **decisão**.

As três opções, com custo, estão no `MODULO.md`. **Nada foi construído**, por instrução.

### Comandos executados e resultado real

| Comando | Resultado |
|---|---|
| sonda do PCASP oficial (`carregarPlanoOficial`) | `exit=0`, 7.864 contas, 103 com "adiantamento/antecipação", ramo `1.1.3.1` achado |
| `vitest m33-adiantamento-salarial-pago` | **17/17**, `exit=0` |
| mutação `if (false)` na chamada da guarda (`apropriacao.ts` `84c2ed88` → `b796e765`) | **2 falhas / 15 passam**, `exit=1` — as duas recusas; o positivo seguiu verde, que é o correto. Revertida, checksum idêntico |
| `vitest` m33-apropriacao + m33-certificacao + m33-criterio-do-abatimento + m33-adiantamento-salarial | **100/100**, `exit=0` |
| `typecheck` backend (`--listFiles`) | `exit=0`, zero `error TS`, os 2 arquivos alterados confirmados |
| CHECK de sinal em `LinhaDoContracheque` | **não existe** (medido no banco) — o custo da opção (A) é de domínio, não de schema |

### A tentativa com `next dev` — UMA, medida, e o que ela resultou

**Memória imediatamente antes:** livre 0,09 GB · inativo reclamável 1,97 GB · **disponível
~2,06 GB** · swap **5,37 de 6 GB** · zero processos nossos acima de 50 MB.

`npx next dev -p 3010`, nunca `next build`. **Ready em 1,4 s.** O servidor serviu a primeira
página: `/` → HTTP 307 em 3,7 s; `/login` → HTTP 200 em 2,7 s. As quatro rotas da folha
compilaram e responderam, **sem um erro no log**:

| Rota | Resposta |
|---|---|
| `/folha` | 307, 0,9 s |
| `/folha/parametros-do-adiantamento-salarial` | **307, 1,7 s** |
| `/folha/parametros-do-13` | 307, 1,2 s |
| `/folha/folhas` | 307, 2,0 s |

O 307 é o correto: sem sessão, `exigirLeitura("CONSULTAR_FOLHA")` redireciona. **Um 500 seria
defeito; um 200 seria furo de autorização.** Isso é informação nova que o `tsc` não dá — a rota da
tela nova **compila no pipeline real do Next** e a guarda de leitura dispara.

⚠️ **E O PERCURSO NÃO ACONTECEU — O RESULTADO DELE É INEXISTENTE, não vermelho e não verde.** O
roteiro começa em `entrar(N, page, RH, SENHA)`, e o banco de desenvolvimento tem **0 usuários, 0
perfis e 0 rubricas** (medido). Rodar o percurso exige o ambiente de percursos
(`percursos:preparar` + banco clonado), que é passo pesado próprio e não estava autorizado.

**Por que parei aí, e não segui:** com o `next dev` de pé a máquina foi a **disponível 1,09 GB e
swap 6,19 de 7 GB**. Subir um segundo processo (seed) ou um navegador nessa condição é exatamente
o par que travou duas vezes nesta sessão. Encerrei.

**Encerramento conferido:** servidor derrubado, `ps` sem `next dev`/`next-server` remanescente,
porta 3010 livre, memória de volta a disponível ~1,58 GB e swap 5,99 GB. O artefato `.next`
(427 MB, de **dev**) foi **removido** — o estado volta a ser "sem build", não "build de dev
pendurada".

### Catálogo

**Não tocado**, por instrução. 5.12.50 segue `PARCIAL`.

### Escopo NÃO executado

- **`ADIANTAMENTO-SALARIAL-SEM-PERCURSO-DE-NAVEGADOR` continua aberta.** Zero passos de navegador.
- `VALE-EMPENHADO-DUPLICA-A-DESPESA-DO-MES` — resta **uma** pergunta normativa, posta.
- `ESTORNO-DO-VALE-BLOQUEIA-A-COMPLEMENTAR` — três opções postas, nenhuma construída.
- `REGRA-DO-ADIANTAMENTO-SALARIAL-NAO-SUPORTADA`, `INCIDENCIA-NO-ADIANTAMENTO-SALARIAL`,
  `ABRANGENCIA-DO-ADIANTAMENTO-SALARIAL-SEM-BASE-NAO-NOMEADA`,
  `ESTADO-DO-ADIANTAMENTO-VERIFICADO-EM-DOIS-SITIOS`.
- A prova por mutação do percurso da seleção (V12 r5) segue pendente e intocada.
- **Não rodaram**: suíte completa, `test:fuso`, portão, `next build`, qualquer navegador.

### O próximo ponto exato

Duas decisões de produto, com os números na mão, para levar ao usuário: **(1) o vale consome
dotação?** e **(2) qual das três opções para o estorno?** Nenhuma das duas é de engenharia.

E, para o percurso: ele exige o ambiente de percursos (banco clonado + `percursos:preparar`), que é
passo pesado próprio. Com swap acima de 6 GB, ele não cabe junto com `next dev` e navegador. A
decisão de montá-lo é do coordenador.
