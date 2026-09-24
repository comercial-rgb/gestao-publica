# M33 — Folha de pagamento (RH bloco 2)

**V6 P2.3. Regime de rigor: PROFUNDIDADE.** TR 5.12.50–5.12.54, 5.12.61–5.12.63, 5.12.65,
5.12.66, 5.12.79 (parcial: ver o catálogo). Decisão fundadora em
`docs/adr/ADR-folha-tabelas-do-ente.md`.

## O que é

A folha MENSAL de uma competência: todos os vínculos vivos do M32, cada um com o seu
contracheque — linhas por rubrica, totais, a MEMÓRIA de cálculo canônica e o sha256 dela — e o
cálculo como fato numerado. O motor (`dominio.ts`) é puro: tabelas do ente + rubricas +
lançamentos + vida funcional → contracheque. O serviço lê, escolhe a vigente e grava.

## Nenhum código no código

`TabelaDeContribuicao` (por regime RGPS/RPPS, faixas, teto), `TabelaIrrf` (faixas, dedução por
dependente, desconto simplificado, parcela isenta 65+, redutor) e `TabelaSalarioFamilia` são
cadastradas pelo ente, vigentes por competência (AAAA-MM), com `fundamentacaoLegal` obrigatória.
Sem tabela vigente: `TABELA-AUSENTE` nomeando tipo e competência. Duas com o mesmo início:
`TABELA-AMBIGUA`. A aplicabilidade dos cenários do IRRF vem dos campos da tabela — não há data
embutida.

**As tabelas dos testes são FIXTURES sintéticas**, com valores redondos para conferir à mão. Não
afirmam alíquota oficial. O repositório não semeia tabela federal: quem cadastra é o ente, pela
tela `/folha/tabelas`, a partir da portaria vigente.

## Invariantes (NUNCA violar)

1. Dinheiro é `Decimal` (`toMoney`, half-even, por faixa e por linha).
2. Cálculo é fato numerado por folha; cancelamento e fechamento são fatos; nenhum UPDATE.
3. Folha fechada não se recalcula; cálculo fechado não se cancela.
4. Vínculo sem regime previdenciário não entra: recusa nomeando a matrícula.
5. O vencimento é o VIGENTE NO ÚLTIMO DIA da competência (M32 `salarioBaseVigenteEm`): a promoção
   de junho não muda maio.
6. Mês fiscal de 30 dias; admissão, desligamento e afastamento reduzem; dias sobrepostos contam
   uma vez; o retorno é o primeiro dia trabalhado.
7. A mesma pessoa com mais de uma matrícula: contribuição RGPS agregada (bases somadas, teto uma
   vez, rateio proporcional, centavo no último) e IRRF de uma fonte pagadora, rateado pela renda.
8. As naturezas sistêmicas (vencimento, gratificações, contribuição, IRRF, salário-família)
   existem UMA vez cada.

## Arquivos

- `prisma/schema/m33-folha.prisma` (+ `Vinculo.regimePrevidenciario` no M32)
- `prisma/migrations/20260913200000_v6_acoes_folha/`, `20260913200100_v6_folha/` (CHECKs
  próprios: competência AAAA-MM, alíquotas em [0,1], redutor inteiro ou nenhum, líquido =
  proventos − descontos, dias em [0,30])
- `modules/m33-folha/dominio.ts` — faixas, contribuição, IRRF, salário-família, dias,
  contracheque, agregação por pessoa, canônico + sha256, Zod
- `modules/m33-folha/servico.ts` — 9 serviços, 7 ações + `CONSULTAR_FOLHA`; permissões **v10**
- `modules/m33-folha/apropriacao.ts` — o grupo de empenho e o ato de apropriar (2 ações,
  permissões **v12**); `prisma/migrations/20260913230000_*` e `20260913230100_*`
- `modules/m33-folha/m33-folha.test.ts`
- `lib/portas/recursos/folha.ts` + `folha-dados.ts`; `app/(areas)/folha/**`
- `lib/portas/portal-do-servidor.ts` + `app/(areas)/portal-do-servidor/**` — o contracheque na mão
  do próprio servidor (V6 P2.4): só folhas FECHADAS, recorte pela pessoa da sessão
- `scripts/smoke-folha.ts`, `scripts/smoke-portal-do-servidor.ts`

## A RUBRICA VERSIONADA E A FÓRMULA DO ENTE (V11 V1.1)

O cadastro anterior tinha sete naturezas fechadas e **nenhuma vigência**. Duas consequências:

1. **Mudar o percentual de uma gratificação reescrevia o passado.** A folha lia a linha atual da
   `Rubrica`; recalcular março em setembro usava o percentual de setembro, e a memória congelada
   do contracheque discordava do cadastro sem que nada explicasse a diferença.
2. **Tudo que não fosse "percentual do vencimento" virava lançamento digitado à mão**, porque não
   havia como o ente escrever a conta dele.

`VersaoDaRubrica` é agora **a autoridade do cálculo**: percentual, incidências,
proporcionalidade, arredondamento, regime aplicável, fundamentação e fórmula pertencem a ela,
com vigência por competência. `Rubrica` ficou sendo a identidade (código, descrição, tipo,
natureza, ordem). As colunas antigas continuam na tabela — migration é aditiva, zero `DROP` — e
**não são mais lidas pelo motor**; elas registram como a rubrica nasceu. A migration de dados
`20260927090100_v11_v1_rubrica_versionada` criou a versão 1 de cada rubrica existente copiando
exatamente aquelas colunas, com vigência desde `1900-01`, para que toda folha já fechada
continue reproduzível.

### A fórmula

A natureza `FORMULA` avalia a expressão da versão por `packages/formula` — **universo fechado**,
nunca `eval`, nunca `new Function`, nunca lista negra (`this.constructor.constructor("…")()`
atravessa qualquer lista de palavras). Ela enxerga apenas:

- `vencimento_base`, `gratificacoes`, `dias`, `fator_dias`, `dependentes_ir`;
- as outras rubricas, por `rubrica.CODIGO`.

Não existe `salario_minimo` nem `teto_do_rgps` nessa lista, e a ausência é deliberada: são
valores normativos que mudam por portaria, e entram por tabela do ente ou por rubrica própria —
nunca como constante nacional embutida no motor.

### O grafo

`ordemDeCalculo` é topológica, com desempate pela ordem do contracheque e depois pelo código —
determinística, para que a mesma folha produza a mesma memória e o mesmo sha256. Ela recusa três
coisas **com mensagens diferentes**, porque são problemas diferentes:

| Recusa | Quando | Por quê |
|---|---|---|
| `CICLO-DE-RUBRICAS` | A cita B cita A (ou A cita A) | Não existe ordem de cálculo possível. A mensagem traz o caminho. |
| `DEPENDENCIA-INEXISTENTE` | cita um código que não é rubrica vigente | Referência morta, provavelmente erro de digitação. |
| `DEPENDENCIA-POSTERIOR` | cita contribuição, IRRF ou salário-família | Elas são calculadas **depois** dos proventos, sobre a base que inclui esta linha. O valor não existe ainda. |

### Os três atos

`CADASTRAR_VERSAO_DE_RUBRICA`, `APROVAR_VERSAO_DE_RUBRICA` e `REVOGAR_VERSAO_DE_RUBRICA`.
**Quem escreve não aprova** — a mesma segregação da certificação da folha. A versão nasce
`RASCUNHO` e não calcula nada; aprovar a sucessora **fecha a vigência** da antecessora sem
apagá-la (ela continua `APROVADA`, porque as folhas que calculou precisam dela para serem
explicadas); revogar é fato com motivo e autor.

**Uma rubrica de natureza `FORMULA` nasce sem versão.** Isto foi um defeito real, achado pelo
caso d3: criar a versão 1 automaticamente também para ela produzia uma versão `APROVADA` com
`formula` nula, e o motor recusava a folha **inteira** nomeando a rubrica.

O papel de runtime só concede `UPDATE` de `situacao`, autoria da aprovação/revogação e
`competenciaFim`. O conteúdo é congelado: versão errada se revoga e se substitui, não se edita.

### Onde isso se opera

`/folha/rubricas/<id>` — o painel de versões fica **fora do molde**, como a política de
divulgação do M10: escrever uma versão não é editar um campo do cadastro.

### Provado em

`m33-rubrica-versionada.test.ts` (17, domínio puro) e `m33-versao-da-rubrica.test.ts` (11, com
banco). Três mutações, três acusações: ciclo não detectado, vigência que não filtra por
competência, e autor aprovando a própria versão.

## A APROPRIAÇÃO CONTÁBIL (V6 P2.3b — TR 5.12.71)

A folha FECHADA vira despesa: `apropriarFolha` chama o `empenhar` do M05 — mesmo roteiro
contábil, mesma trava de ficha, mesmo exercício conferido, mesma fila do art. 141. Nada aqui
reimplementa despesa.

**O grupo de empenho** (`GrupoDeEmpenhoDaFolha`) diz QUAIS rubricas de provento, em QUAL ficha,
com qual categoria do art. 141, e se o empenho é POR SERVIDOR (credor = o CPF de cada um) ou UM
SÓ para o grupo (credor declarado). As duas práticas existem nos entes; escolher uma por dentro
seria inventar norma que o TR não fixa. Uma rubrica pertence a UM grupo só.

**Três decisões que o arquivo `apropriacao.ts` documenta linha a linha:**

1. **Só o BRUTO é empenhado.** Contribuição e imposto retidos do servidor não são despesa
   orçamentária — são retenções que viajam no pagamento. Empenhar o líquido esconderia da despesa
   a parte retida; empenhar bruto + descontos a contaria duas vezes.
2. **A numeração é determinística** (`série/competência/matrícula`) e é ela que dá IDEMPOTÊNCIA:
   o `@@unique([fichaId, numero])` do M05 faz a segunda tentativa reconhecer o que já existe.
3. **A apropriação NÃO é atômica entre empenhos**, e a razão é medida: `deps.despesa.empenhar`
   abre a própria transação no adapter do M05 (é lá que a ficha é travada), e uma transação única
   para mil empenhos manteria as fichas do ente travadas por minutos. Ela é RETOMÁVEL: diz onde
   parou, e os empenhos gravados continuam valendo.

### ⚠️ O NÚMERO DO EMPENHO CARREGA O TIPO DA FOLHA — V11 V9.3, e era colisão REAL

`numeroDoEmpenhoDaFolha` era `série/competência/sufixo`, **sem o tipo**. Duas folhas de tipos
diferentes na **mesma competência** produziam o **mesmo número** quando compartilhavam grupo e
matrícula — e não era hipótese futura: basta o ente pôr o vencimento e a rubrica do adiantamento do
13º no mesmo grupo (mesma ficha, mesmas contas) para que a MENSAL de 2026-06 e o ADIANTAMENTO de
2026-06 colidam. `apropriarFolha` achava o empenho da primeira, contava `jaExistiam` e **pulava em
silêncio**: a segunda folha ficava apropriada com **zero** empenhos, os totais fechavam, o atesto
descrevia a distribuição certa e **nenhuma etapa adiante acusava**.

**A mensal ficou byte a byte igual**, e é isso que torna a mudança segura: todo empenho mensal já
gravado continua sendo encontrado pela mesma chave. Ganha segmento só quem não o tinha por que ter.

**A retomada do número LEGADO** (`numeroLegadoDoEmpenhoDaFolha`) existe para ser **reconhecida,
nunca gravada**: uma folha de 13º apropriada antes da mudança seria empenhada **de novo** sem ela —
e *idempotência que quebra para trás é pior que a colisão*. ⚠️ **E o reconhecimento é pelo ELO**
(`EmpenhoDaFolha → apropriação → folhaId`), **nunca pela coincidência do número**: numa colisão, o
que está no número legado é o empenho da MENSAL. Sem essa conferência, a retomada do legado seria a
própria colisão com outro nome.

**O segmento é o nome do enum, e foi decisão apurada, não preferência.** Primeiro se verificou se
algo externo consome o número: o SAGRES lê `numEmpenho` NUMÉRICO de 7 posições — e a numeração da
folha já estava fora dele antes disto (`NUMERACAO-DA-FOLHA-FORA-DO-CAMPO-DO-SAGRES`). Sem restrição
externa, o nome do enum vence um código curto: um `Record<TipoDeFolha, string>` seria uma segunda
tabela a manter em dia com a primeira — a cópia que diverge —, e o número é chave de negócio.

**Provado em** `m33-criterio-do-abatimento.test.ts` (c5): as duas folhas empenham, cada uma com o
**seu** valor (N=2, valores diferentes), os quatro empenhos são quatro objetos distintos, a
reexecução das duas reconhece tudo sem empenhar de novo, e o número legado é reconhecido. As
asserções são de **efeito**, não de formato — uma guarda que casa com o texto do número acha só o
formato que ela conhece.

## ⚠️ ANTES DE ALGUÉM CONSTRUIR O FILTRO DE FUNCIONÁRIOS (5.12.50) — leia isto

A cláusula exige filtrar por matrícula, nome, cargo, regime, local de trabalho, **centro de custo**,
**função** e data de admissão. Levantado em V11 V9.3, com arquivo e linha:

**Dois dos oito eixos não têm DADO NENHUM, e isso é falta de MODELO no M32, não falta de tela:**
- **centro de custo** — não existe nenhuma FK de `Vinculo`, `Servidor`, `Cargo` ou `Lotacao` para
  `Setor` (M21) nem para qualquer tabela de centro de custo. O único vizinho é
  `Lotacao.unidadeOrcId`, opcional, e o próprio schema declara que a correspondência é incompleta.
- **função** — não é entidade. É um valor de `TipoCargo` (`FUNCAO_GRATIFICADA`) ou texto livre em
  `HistoricoVinculo.gratificacaoDescricao`. Dois candidatos concorrentes, nenhum filtrável.

Os outros seis existem com qualidade desigual: matrícula e data de admissão são colunas; **nome** tem
dois campos concorrentes (versão de `Pessoa` e `Servidor.nomeSocial`); **cargo** e **lotação** são
**derivados** de `HistoricoVinculo`, não colunas; **regime** são **dois eixos distintos**
(previdenciário derivado por evento, e `regimeJuridico` como `String` livre).

⚠️ **E O PERIGO NÃO É O DADO — É O QUE UM FILTRO NO CÁLCULO QUEBRARIA.** `calcularFolha` promete
"todos os vínculos vivos na competência", e essa propriedade é mantida **por construção**: o
`tx.vinculo.findMany` não tem `where` nenhum, e o único recorte é temporal. Um filtro do operador a
quebra **em silêncio**: nada compara o número de contracheques ao de vínculos ativos, o manifesto da
certificação lista só quem entrou no cálculo, a apropriação empenha só esses — e **a folha fecha, o
total bate, o empenho bate, a liquidação bate**. É a forma exata de defeito que este módulo já pagou
três vezes. Quem for construir tem de decidir ANTES se o filtro recorta **quem é calculado** (folha
parcial — perigoso, e precisa de guarda de completude) ou apenas **quem é listado/reprocessado**.

## A certificação (atesto) e a liquidação — V6.1 (`certificacao.ts`)

A apropriação empenha. **Liquidar é ato próprio**, e o art. 63 da Lei 4.320 manda verificar o
direito adquirido pelo credor "tendo por base os títulos e documentos comprobatórios". Na compra,
o título é a nota fiscal conferida. **Na folha não há nota fiscal**, e fabricar uma para satisfazer
o validador seria mentir no documento: o título é a folha FECHADA mais a CERTIFICAÇÃO de quem o
ente designou.

**Quem atesta é quem o ente designou, e o sistema não sabe quem é.** Nenhuma norma nacional nomeia
"o diretor de RH" como atestador da folha — isso é ato administrativo do município. Não há cargo
embutido no código: há `DesignacaoNaFolha`, com a `Pessoa`, o `Usuario` ativo (conferido pelo
`VinculoUsuarioPessoa`, explícito), o ato que a fundamenta, a vigência e o substituto. A
**revogação é fato próprio**, nunca UPDATE — o atesto de março foi praticado sob a designação que
valia em março, e revogar em maio não pode apagar isso. A vigência é DERIVADA, por dia civil.

**A segregação é o padrão**, conferida dentro da transação: quem calculou ou fechou não certifica
(`AUTOCERTIFICACAO-DA-FOLHA`); quem certificou não liquida (`AUTOLIQUIDACAO-DA-FOLHA`). A
atualização de permissões v13 concede **só** `DESIGNAR_NA_FOLHA` a quem administra — espalhar
`CERTIFICAR_FOLHA` e `LIQUIDAR_FOLHA` pelo perfil administrador faria a instalação nascer com quem
prepara podendo certificar. E o crachá sozinho não certifica: falta a designação.

**O atesto se prende ao CÁLCULO**, não à folha, e leva um manifesto canônico com o sha256 do
OBJETO (entidade, competência, cálculo, totais, os vínculos e as alocações). O autor, a designação
e o instante ficam FORA do hash: assim duas certificações do mesmo conjunto têm a mesma impressão
digital, e qualquer mudança de valor, pessoa ou alocação a muda. Sem CPF e sem dado bancário — o
manifesto circula entre contabilidade e controle interno.

**As duas contas patrimoniais vêm do ente, e essa foi a parede real.**
`contrapartidaDaLiquidacao` (M01) mapeia ELEMENTO → conta e cobre 30, 39 e 71; o elemento 11
(vencimentos) não está lá, e o `CONTA_VPD` do rol é `3.3.2.1.1.01.00` — VPD de **serviços de
terceiros**. Liquidar a folha por ele lançaria a remuneração dos servidores como serviço
contratado, e o lançamento FECHARIA (ΣD = ΣC em cada subsistema): ninguém veria. Um mapa por
elemento também não resolveria — vencimento, 13º e férias dividem o elemento e creditam contas de
"pessoal a pagar" diferentes. Quem declara as duas é o **grupo de empenho**, que já é "quais
rubricas, em qual ficha"; a liquidação recusa nomeando o grupo quando faltam, **antes de gravar a
primeira**. `roteiroLiquidacaoDaFolha` mantém canônicas as pernas de ORÇAMENTÁRIO e CONTROLE (a
DDR tem de sair de "comprometida por empenho" para "comprometida por liquidação").

**O gancho de estoque não dispara em folha**, e a recusa mudou de lugar: um grupo apontado para
ficha de material é recusado no CADASTRO — não na liquidação, com metade dos empenhos já feitos.

**Retomável sem duplicar:** o `@@unique` de `LiquidacaoDaFolha` sobre o empenho e o
`@@unique([empenhoId, numero])` do M05 são a idempotência real; a numeração determinística só
ajuda a reconhecer. A janela entre o `liquidar` do M05 (transação própria) e a gravação do elo é
recuperada procurando a liquidação pelo par (empenho, número) e só amarrando o elo.

**O único UPDATE do módulo** é `definirContasDaLiquidacaoDoGrupo`, e o grant é por coluna: as duas
colunas nasceram nullable (migration aditiva), e sem este caminho os grupos cadastrados antes do
V6.1 nunca liquidariam. Ficha, série, credor e `porServidor` continuam fora do grant — trocar a
ficha de um grupo já empenhado moveria a despesa de dotação sem tocar num lançamento.

## Os encargos do empregador — V6.2 (`encargos.ts`, `encargos-servico.ts`)

O que o ENTE deve sobre a folha (previdência patronal, RAT, outras entidades, suplementar, FGTS) é
outra natureza que o desconto do servidor, e mora em modelo próprio: **o contracheque não muda**.

- **Parâmetro versionado e aprovado por outra pessoa.** `ComponenteDeEncargo` (regime) com
  `VersaoDoEncargo` (alíquota em fração, teto, rubricas da base, vigência por competência,
  fundamento, flag `sintetica` para perfil de teste). Só versão APROVADA entra; quem cadastrou não
  aprova (`AUTOAPROVACAO`).
- **Apuração numerada sobre o cálculo fechado.** `ApuracaoDeEncargos` por cálculo, com `sha256`,
  `completa` e a situação por linha: `CALCULADO`, `ZERO_CALCULADO`, `NAO_APLICAVEL` (regime de
  outro contracheque) e `PARAMETRO_AUSENTE` (sem versão aprovada — nunca zero silencioso). Apurar de
  novo sem mudança recusa (`APURACAO-SEM-MUDANCA`); duas apurações concorrentes, uma passa.
- **Folha fechada é preservada.** A apuração lê o cálculo congelado; nada reescreve contracheque.
- **Atesto próprio.** `CERTIFICAR_ENCARGOS_DA_FOLHA`, com designação de atribuição própria — a
  designação para certificar a folha salarial não a supre.
- **Empenho só da diferença; liquidação pelo M05.** `apropriarEncargosDaFolha` empenha por grupo o
  que a apuração vigente tem acima do já empenhado (`${serie}/${competencia}/${grupo}-E${n}`),
  recusa redução sobre empenhado (`REDUCAO-DE-ENCARGO-EMPENHADO`) e, interrompido, diz onde parou
  (`EmpenhoDosEncargosInterrompidoError`) e retoma sem duplicar. `liquidarEncargosDaFolha` chama o
  `liquidar` do M05 com as contas do grupo.
- **Resumo da folha** (CSV/PDF) por regime × lotação: vínculos, bruto, descontos, líquido e patronal.

Testes: `m33-encargos-motor.test.ts` (16), `m33-encargos.test.ts` (12, N=2, mutações da diferença e da
atribuição acusadas), `test/ui/resumo-da-folha.test.ts` (4, PDF lido por pdf.js). Permissões v14.

### O ajuste para baixo e a guia de recolhimento — V7 M1 U3 (`encargos-servico.ts`, `recolhimento.ts`)

- **O alvo é o LÍQUIDO.** `posicaoDosGrupos` lê, por grupo, empenhado, liquidado e pago líquidos das
  anulações parciais e estornos; `planoDoGrupo` decide `EMPENHAR` (só a diferença positiva), `NADA` ou
  `REDUZIR` (anular liquidação não paga, anular empenho não liquidado, registrar RESTITUIÇÃO do que já
  foi pago — nada se "desanula" em dinheiro).
- **`ajustarEncargosDaFolha`** (`APROPRIAR_FOLHA`, ação "Ajustar os encargos para baixo" na barra):
  anula pelo M05 (`anularLiquidacaoParcial`, `anularEmpenhoParcial`), grava o fato
  `AjusteDosEncargos` com chave única por ato (retomar não anula duas vezes; resposta perdida é
  reconhecida por `reconhecerAnulacoesSemRastro`), exercício encerrado recusa sem abrir período.
  Aumento depois de redução empenha só o que falta sobre o líquido. Apuração anterior e contracheque
  intactos.
- **Quatro objetos separados:** apuração → obrigação (liquidação do grupo) → GUIA (documento real do
  emissor, `GuiaDeRecolhimento`, com arquivo pelo M22, principal + componentes = total, vencimento só
  com fundamento, destinatário = credor do grupo; `GUIA-DUPLICADA`) → PAGAMENTO do M05 (`BaixaDaGuia`
  liga a guia a um pagamento da mesma obrigação e informa a divergência). Cancelar só guia não baixada.
  `GERIR_GUIA_DE_RECOLHIMENTO`, permissões v16.
- **Demonstrativo interno** (`/folha/folhas/[id]/obrigacoes?formato=pdf|csv`): titulado "DEMONSTRATIVO
  INTERNO — NÃO É GUIA DE RECOLHIMENTO", sem código de barras, PIX ou autenticação; o teste lê o PDF e
  confere que não há sequência de 44–48 dígitos.
- **Painel da competência** (V7 M1 U5) no detalhe da folha: cálculo, atesto, empenho/liquidação,
  encargos e obrigações/guias separados, com a próxima ação lida da disponibilidade da barra.

Testes: `m33-encargos.test.ts` (6) ajuste 7 e (7) guia 3, (8) ajuste e guia pelo papel de runtime 2;
`test/ui/demonstrativo-das-obrigacoes.test.ts`. Percurso `smoke-encargos-da-folha.ts` com
`ENCARGOS_CENARIO=fila|limpo`. Pendências: `RETORNO-BANCARIO-DA-GUIA` (nenhum transporte externo;
a baixa é por pagamento já registrado), `RESTITUICAO-DOS-ENCARGOS-SEM-ATO` (a restituição fica
registrada como providência; o ato de restituir/compensar não existe), `VENCIMENTO-LEGAL-SEM-TABELA`.

## O 13º SALÁRIO EM DUAS PARCELAS — V11 V9.1 (TR 5.12.50)

`TipoDeFolha` ganhou `ADIANTAMENTO_DECIMO_TERCEIRO` e `DECIMO_TERCEIRO`. O ciclo é o MESMO da
mensal — abrir, calcular (fato numerado), cancelar cálculo, fechar, certificar, apropriar,
liquidar, apurar encargos —, porque tudo isso opera sobre `CalculoDaFolha` e `Contracheque`, que
não mudaram. O que muda é a CONTA.

### A medida é o avo, não o dia

A folha mensal proporcionaliza por `dias/30` (mês fiscal). O 13º proporcionaliza por
`avos/avosNoExercicio`, e o avo é decisão **binária por mês**: `avosDoExercicio` roda o mesmo
`diasComputados` da mensal doze vezes e o mês conta inteiro quando alcança o mínimo declarado.

**Somar os dias do ano e dividir por 30 daria outro número, e seria outra regra.** Um servidor com
14 dias em março e 14 em abril tem 28 dias e **zero** avos; na folha mensal ele teria quase um mês
de vencimento. As duas contas estão certas, e são contas diferentes.

### Nenhum número do 13º está no repositório

`ParametroDoDecimoTerceiro`, por exercício, versionado e **append-only** (a vigente é a de maior
`versao`; corrigir é cadastrar a próxima — zero `UPDATE`, e por isso o censo de tabelas do papel
de runtime não mudou):

| O que o ente declara | Por que não está no código |
|---|---|
| `diasMinimosDoAvo` | o "15 dias" é da Lei 4.090/1962, que governa o contrato **celetista**; o estatutário recebe pelo estatuto do município |
| `avosNoExercicio` | "1/12" é a regra da lei do 13º celetista, não um fato do calendário |
| `percentualDaPrimeiraParcela` | os "50%" são da Lei 4.749/1965, mesma limitação |
| `decimoTerceiroSofreContribuicao` / `...SofreIrrf` | incidência é norma, e muda por regime e por ente |
| `baseDosAvosDoAdiantamento` | **as duas práticas existem**: metade do já ganho até a competência, ou metade do ano projetado. O TR não fixa uma |
| as rubricas da base | em um município a gratificação de função entra; em outro não |

Sem parâmetro vigente: `PARAMETRO-DO-13-AUSENTE`, nomeando o exercício. O seed e a demonstração
**não preenchem** esses valores — eles recusam e dizem o que falta.

### O ato é estruturado, e a conferência é de coerência

Fundamentação em texto livre não prova nada: **"conforme a legislação vigente" tem 29 caracteres**
e passa por qualquer piso de comprimento. O ato vive em colunas próprias — esfera, tipo, número,
ano, dispositivo, ementa — e `conferirReferenciaNormativa` pergunta quatro coisas: o número tem
dígito; o ano não é do futuro **pela data civil do ente** (às 23h30 de 31/12 o UTC já virou o ano,
e por meia hora por ano um ato do ano seguinte passaria); o dispositivo identifica onde no ato a
regra está; a ementa tem mais de uma palavra. Os mesmos pisos estão em CHECK no banco, para que
nenhum outro caminho escape.

### A 2ª parcela abate a 1ª, e quatro recusas guardam isso

O abatimento é natureza própria (`ABATIMENTO_DO_ADIANTAMENTO_DO_13`) porque o valor vem de **outra
folha** — o provento do adiantamento já fechado. A fórmula do ente não alcança isso: `packages/formula`
é universo fechado sobre o contracheque corrente, e abri-lo para "o valor daquela outra folha" o
transformaria num leitor de banco.

| Recusa | Quando | O dano que ela evita |
|---|---|---|
| `ADIANTAMENTO-NAO-FECHADO` | há adiantamento no exercício e ele não fechou | abater valores de um cálculo que ainda pode mudar |
| `ADIANTAMENTO-APARECEU-DEPOIS` | a folha de 13º foi aberta sem adiantamento e ele surgiu antes do cálculo | o elo ficaria nulo e o ente pagaria o 13º **inteiro** a quem já recebeu metade |
| `RUBRICA-DO-ABATIMENTO-AUSENTE` | quem recebeu adiantamento e não há rubrica que o abata | o mesmo pagamento em dobro, com os totais fechando |
| `ABATIMENTO-MAIOR-QUE-O-13` | adiantado sobre o ano projetado e desligado no meio | o líquido ficaria **negativo**; isso é reposição ao erário, ato que não existe aqui |

⚠️ **E desde a V11 V9.3 há mais três recusas, pelo critério que o ENTE declara** —
`ADIANTAMENTO-NAO-CERTIFICADO`, `ADIANTAMENTO-NAO-PAGO` (pagamento parcial incluído) e
`ADIANTAMENTO-PAGO-NAO-VERIFICAVEL` —, mais `ABATIMENTO-SEM-CRITERIO-DECLARADO` na apropriação.
Ver "O ESTADO EXIGIDO DO ADIANTAMENTO" adiante.

`@@unique([exercicio, tipo])` garante **um** adiantamento e **um** 13º por exercício, e é o que
permite ao serviço resolver o elo em vez de o operador digitá-lo — digitar permitiria abater o
adiantamento do ano passado.

### ⚠️ O que o abatimento verificava era o FECHAMENTO — e a memória passou a dizer isso (V11 V9.2)

> **Superado em V11 V9.3, e a seção fica porque explica de onde se veio.** O critério deixou de ser
> cravado no motor e passou a ser declarado pelo ente. Leia esta seção como história, e a seção
> "O ESTADO EXIGIDO DO ADIANTAMENTO" adiante como o que vale.

**O fato que arma o abatimento é um só: `FolhaDePagamento.fechamento !== null`.** Certificação,
empenho, liquidação e pagamento **não são consultados**. Até a V11 V9.2 a memória do contracheque
— o documento com que o servidor confere o próprio pagamento, lacrado em `sha256` — dizia
**"1ª parcela já paga"**, afirmando o que o cálculo nunca verificou. Agora ela diz o fato:
*"1ª parcela APURADA na folha de adiantamento FECHADA de \<competência\>"*, com o número do cálculo
e a situação da certificação, e o campo de entrada chama-se `adiantamentoApuradoEmFolhaFechada`.
**Nenhum centavo mudou; mudou o que o sistema afirma.**

O caso que isto torna visível: uma folha de adiantamento **FECHADA** e depois **DEVOLVIDA para
correção** nunca será liquidada nem paga (`RETIFICACAO-DA-FOLHA`), e **é abatida assim mesmo** —
e o fechamento é irreversível nas duas pontas (não há reabertura, e `cancelarCalculoDaFolha`
recusa o cálculo que fechou). O desconto acontece; o contracheque, pelo menos, deixou de mentir
sobre o que o sustenta.

### O ESTADO EXIGIDO DO ADIANTAMENTO — a fonte, e por que ela tirou o critério do motor (V11 V9.3)

**A pergunta:** a fonte exige que o adiantamento tenha sido **PAGO** para ser abatido, exige
**outro fato**, ou exige uma **composição de condições**?

#### 1. Ente, regime e exercício do cenário — o que está fixado e o que não está

| | valor | onde se lê |
|---|---|---|
| Ente | **Município de Anita Garibaldi/SC**, mais a Câmara de Vereadores e o Fundo Municipal de Saúde | `docs/edital/.cache-tr-layout.txt:10`, `:143`, `:5951`; controle externo = TCE/SC (`:91`, `:225`) |
| Regime | **PLURAL, e isso é requisito** — o TR exige celetista, estatutário, temporário, emprego público, comissionado e estagiário na mesma folha (`:1270`), e RGPS **e** RPPS (`:1464`). `TipoVinculoRh` tem sete valores | `prisma/schema/m32-pessoal.prisma:92` |
| Regime das fixtures | a suíte usa `EFETIVO` / `regimeJuridico: "Estatutario"` / **RPPS**; o percurso de navegador usa **RGPS** | `m33-decimo-terceiro.test.ts:107`; `scripts/smoke-decimo-terceiro.ts:387` |
| Exercício | **INDETERMINADO, e por desenho**: o parâmetro é por exercício, cadastrado pelo ente; o percurso usa um exercício sintético (`DECIMO_TERCEIRO_EXERCICIO`, padrão 2031) | `scripts/smoke-decimo-terceiro.ts:78` |

⚠️ **Não há um regime a que responder.** Qualquer regra escrita aqui atende a uma folha que tem
celetista e estatutário lado a lado — e é exatamente por isso que a fonte de um não pode virar o
padrão do outro.

#### 2. A fonte primária encontrada — e ela governa o CELETISTA

| Dispositivo | O que diz, literal | Onde foi lido |
|---|---|---|
| **Lei 4.749/1965, art. 1º** | "…será paga pelo empregador até o dia 20 de dezembro de cada ano, **compensada a importância que, a título de adiantamento, o empregado houver recebido** na forma do artigo seguinte." | normaslegais.com.br e camara.leg.br (LEGIN), texto coincidente |
| **Decreto 57.155/1965, art. 3º, § 3º** | "A importância que o empregado **houver recebido** a título de adiantamento **será deduzida** do valor da gratificação devida." | guiatrabalhista.com.br |
| **Lei 4.749/1965, art. 3º** | na extinção do contrato antes do pagamento, "o empregador **poderá** compensar o adiantamento…" — **faculdade**, e sobre outro fato | normaslegais.com.br |

**O verbo é `houver recebido`, nos dois.** Não é "apurado", não é "calculado", não é "fechado".
A fonte, onde ela alcança, condiciona a dedução ao **recebimento** — e isso é mais estrito do que
o que este motor faz.

⚠️ **E ela alcança o EMPREGADO, não o servidor estatutário.** As duas falam em "empregador" e
"empregado", e são a mesma família da Lei 4.090/1962 de onde saíram os "15 dias" e os "50%" que
este módulo **expulsou do código** por governarem o contrato celetista. Transformar `recebido` em
regra universal do motor repetiria exatamente o erro que o resto desta seção existe para não
cometer. **Isto é achado, não fundamento.**

#### 3. Para o estatutário — o que se procurou e o que NÃO se achou

- **CF art. 39, § 3º** estende ao ocupante de cargo público o art. 7º, **VIII** (décimo terceiro
  salário com base na remuneração integral). Ele **dá o direito ao 13º** e **não dispõe** sobre
  adiantamento, sobre parcelas nem sobre compensação. Não responde à pergunta.
- **O adiantamento do estatutário nasce de lei do ente** — é o que o próprio parâmetro do 13º já
  pressupõe ao exigir ato estruturado (esfera, tipo, número, ano, dispositivo, ementa), e o que a
  fixture da suíte escreve como `ESTATUTO_DOS_SERVIDORES`.
- **A lei municipal de Anita Garibaldi NÃO FOI LOCALIZADA.** Tentado: `leismunicipais.com.br`
  (acervo do município existe; a busca responde **HTTP 403**), `camaraanita.sc.gov.br` (sem texto
  de lei alcançável pela busca), e a consulta **TCE/SC CON 09/00004983** — que é diretamente sobre
  a antecipação da 1ª parcela do 13º a servidores municipais e responde **HTTP 403**.
  **Ausência de acesso não é ausência de fonte**, e é assim que fica registrado: a fonte
  provavelmente existe e não foi lida. Citá-la de ouvido seria inventar norma do município.

#### 4. O que o motor fazia ANTES desta rodada — medido, não suposto

> O levantamento abaixo é o diagnóstico que fundamentou a decisão da seção 5. Ele descreve o motor
> **até a V11 V9.2**; o que vale hoje está na seção 5.

**O fato que arma o abatimento** é `FolhaDePagamento.fechamento !== null`
(`servico.ts:629`, recusa `ADIANTAMENTO-NAO-FECHADO`). **O valor abatido** é a
`LinhaDoContracheque.valor` da rubrica do adiantamento, no cálculo que FECHOU aquela folha
(`servico.ts:682-686` → `servico.ts:781` → `decimo-terceiro.ts:477-493`). É o valor **apurado**,
integral, por vínculo.

Os seis estados, e se o motor os consulta:

| Estado | Onde é representado | Consultado pelo abatimento? |
|---|---|---|
| CALCULADO | `CalculoDaFolha` (fato numerado, `cancelamento` é outro fato) | **não** — só o cálculo do fechamento é lido, e o cancelado nunca é ele (`servico.ts:828`) |
| FECHADO | `FechamentoDaFolha` (`@@unique` por folha e por cálculo) | **era o único** — hoje é um dos três que o ente pode declarar |
| CERTIFICADO | `CertificacaoDaFolha` (fato, `CERTIFICACAO`/`DEVOLUCAO`; situação derivada) | era lido **só para escrever** na memória; hoje decide quando o ente declara `CERTIFICADO` |
| EMPENHADO | `ApropriacaoDaFolha` → `EmpenhoDaFolha` → `Empenho` (M05) | **não** |
| LIQUIDADO | `LiquidacaoDaFolha` → `Liquidacao` (M05) | **não** |
| PAGO | `Pagamento` (M05), alcançável só por Liquidação → Empenho → `EmpenhoDaFolha` | **não era** — e **pagar continua não sendo ato do M33** (`ORDENAR-E-PAGAR-A-FOLHA`; `ACOES_DA_FOLHA` não tem "pagar"). Hoje o cálculo LÊ esse fato quando o ente declara `PAGO`, e só onde ele existe |

Nenhum dos três arquivos do caminho do 13º importa `packages/estornaveis`, `Pagamento` ou
`Liquidacao`. **Não há um `status` em lugar nenhum**: o M05 deriva por SOMA (`statusDoEmpenho`),
líquida de estorno e de anulação parcial — o que existe para ser lido, e não é.

Os cinco cenários:

| Cenário | O que o motor abate hoje | Por quê |
|---|---|---|
| **Cancelamento** do cálculo | o cálculo do FECHAMENTO, nunca a soma dos cálculos | o cancelado não pode ser o que fechou; **já tem teste** (`m33-decimo-terceiro.test.ts` t4, "cancelar o cálculo do adiantamento") |
| **Devolução** para correção (folha fechada, atesto devolvido) | **abate integral** | a certificação é fato na memória, não condição; a folha nunca será liquidada nem paga. **Já tem teste** (domínio puro) |
| **Estorno / anulação** do empenho ou da liquidação do adiantamento (M05) | **abate integral** | nada do M05 é lido. Não há caminho de anulação da folha SALARIAL dentro do M33 — só os ENCARGOS têm (`ajustarEncargosDaFolha`); a anulação do salarial se pratica direto no M05, e o 13º não a enxerga |
| **Pagamento parcial** | **abate integral** | idem. E **pior: no caso geral ele nem seria atribuível** — se o grupo de empenho tem `porServidor = false`, existe **um** empenho para o grupo inteiro com credor declarado, e "quanto foi pago a este servidor" **não existe como fato no banco**. Só com `porServidor = true` a cadeia empenho → liquidação → pagamento é por matrícula |
| **Repetição** | recalcular a folha de 13º refaz a leitura e chega ao mesmo valor; o adiantamento não se reabre (não há reabertura, e `cancelarCalculoDaFolha` recusa o cálculo que fechou) | o fechamento é irreversível nas duas pontas |

⚠️ **E o motor PURO não tem onde receber "quanto foi pago".**
`EntradaDoDecimoTerceiro.adiantamentoApuradoEmFolhaFechada` é um `Money` só
(`decimo-terceiro.ts:364`). Implementar "o elegível é o pago" **não é trocar um `if`**: é decidir
quem estreita o valor — o serviço, antes de entregar ao domínio — e a partir de qual soma líquida
de estornos e anulações parciais.

#### 5. A DECISÃO — o critério saiu do motor e passou a ser declarado pelo ente (V11 V9.3)

**Nem `FECHADO` cravado, nem `PAGO` importado do celetista.** O fundamento da decisão é o
levantamento acima: (a) para o empregado a fonte diz RECEBIDO; (b) para o estatutário a regra é
municipal e está inacessível; (c) o ente tem regime PLURAL por requisito do TR. Nessas condições
**qualquer valor único no motor é norma inventada — inclusive o `FECHADO` que estava lá**. A saída
que não inventa é a mesma que este módulo já usa para o critério do avo e para o percentual da 1ª
parcela: o ente declara, com ato estruturado, versionado. É "nenhum código no código" aplicado ao
caso que faltava.

##### O campo, e por que a lista é de TRÊS

`ParametroDoDecimoTerceiro.estadoMinimoDoAdiantamentoParaAbater`, enum
`EstadoMinimoDoAdiantamento`, **nullable** (migration `20261013090000_v11_v93_…`, aditiva, zero
`DROP`, zero linha tocada, a pasta criada já com o `migration.sql` dentro).

| Valor | O fato que o sistema verifica | Onde |
|---|---|---|
| `FECHADO` | `FolhaDePagamento.fechamento !== null` | o que o motor fazia, agora dito pelo ente |
| `CERTIFICADO` | `situacaoDaCertificacao(...) === "CERTIFICADA"` do cálculo que fechou | pega o caso da folha **DEVOLVIDA**, que nunca será paga e era abatida em silêncio |
| `PAGO` | `Pagamento` (M05) do empenho **daquele vínculo**, líquido de estorno e anulação parcial, ≥ o apurado | `packages/estornaveis`, não uma soma nova |

⚠️ **`EMPENHADO` e `LIQUIDADO` NÃO são oferecidos, e a ausência é decisão.** Existem no schema e
são legíveis; ficam de fora por serem atos da DESPESA do ente, que nada dizem sobre o servidor ter
recebido. Um ente que os declarasse condicionaria o abatimento a um fato que não responde à
pergunta da norma. Está escrito aqui para ser ausência visível, não esquecimento.

##### "PAGO" só se oferece onde o fato existe — e a recusa é no CADASTRO

O achado estrutural da pesquisa virou guarda: com `GrupoDeEmpenhoDaFolha.porServidor = false` há
**um** empenho para o grupo inteiro, com credor declarado, e `EmpenhoDaFolha.vinculoId` é nulo —
"quanto saiu para esta matrícula" **não é representável**. `cadastrarParametroDoDecimoTerceiro`
recusa `PAGO` com `ESTADO-PAGO-NAO-VERIFICAVEL`, **antes de gravar**, nomeando o grupo e o motivo
estrutural, e dizendo a saída. A rubrica do adiantamento **fora de qualquer grupo** tem recusa
própria, com outro motivo. O cálculo confere de novo, fail-closed — entre cadastrar e calcular
passa um exercício.

##### Pagamento parcial NÃO satisfaz — o caso que ninguém olhava

O gate é "o apurado foi pago", não "houve pagamento". Meia parcela paga recusa com
`ADIANTAMENTO-NAO-PAGO`, **nomeando a matrícula, o apurado e o pago**. Até aqui o motor abatia o
apurado inteiro, descontando de dezembro o que não saiu em junho — com os totais fechando, o
empenho fechando e nenhuma etapa adiante acusando. **E não satisfeito é RECUSA, nunca "abate
zero"**: seguir sem abater pagaria o 13º inteiro a quem já recebeu metade.

##### Sem declaração: simulação identificada, efetivação bloqueada

| Onde | O que passa a acontecer |
|---|---|
| **cálculo** | sai normalmente — lacuna normativa bloqueia a efetivação, **não a construção** |
| **memória do contracheque** | `procedenciaDoAbatimento.natureza = "SIMULACAO"`, `criterioDeclaradoPeloEnte = false`, e o `motivo` por escrito |
| **linha do abatimento** | "⚠️ SIMULAÇÃO — NÃO É APURAÇÃO APROVADA", com o código do bloqueio |
| **tela do detalhe da folha** | selo "SIMULAÇÃO — não é apuração aprovada" + linha "Natureza da apuração" |
| **tela do contracheque** | a frase da simulação e os dois estados (exigido × verificado) |
| **barra de ações** | `apropriar` **e** `liquidar` viram pré-condição `ABATIMENTO-SEM-CRITERIO-DECLARADO`, com providência |
| **`apropriarFolha`** | **RECUSA**, fail-closed, antes de gravar a `ApropriacaoDaFolha` |
| **`liquidarFolha`** | **RECUSA** — é o ato em que o valor se torna EXIGÍVEL |

⚠️ **A LIQUIDAÇÃO ENTROU DEPOIS, E POR UM ERRO MEU QUE VALE REGISTRAR.** `EstadoDaFolhaParaAtos`
é construído em **três** sítios (`certificacao.ts`: o atesto, a liquidação e o retrato da tela) e
eu atualizei dois — `main` ficou sem compilar. O conserto óbvio seria `false` cravado no terceiro;
seria o pior conserto possível, um valor escolhido para o compilador parar de reclamar. Derivando
do mesmo fato, o comportamento certo caiu sozinho: uma folha que chega à liquidação com
`apropriacao !== null` ou foi apropriada antes desta mudança, ou tinha critério — e recusar ali é
barrar um **ato novo sobre fato antigo**, não desfazer nada. Os empenhos gravados continuam
valendo; desfazê-los é anulação pela despesa.

⚠️ **O atesto continua sendo OFERECIDO sobre uma folha em simulação**, e é decisão: a certificação
é o controle interno, e é justamente quem deveria enxergar a lacuna. Bloqueá-lo tiraria de cena o
único olhar que falta. Mas o valor **também é derivado ali** — um `false` de conveniência viraria
armadilha no dia em que alguém fizesse o predicado consultá-lo.

⚠️ **O recorte é estreito de propósito:** o que fica bloqueado é a **apropriação da folha de 13º
que aplicou abatimento**. A mensal segue, o adiantamento segue, um 13º sem abatimento segue, e o
**cálculo desta mesma folha segue** — ele é a simulação, e é ela que mostra ao ente o que está em
jogo. Bloquear a construção transformaria uma pergunta normativa em paralisação.

⚠️ **NENHUMA CAIXA DE ACEITE, em lugar nenhum.** Não existe "confirmo sob minha responsabilidade"
que destrave: ela transferiria a culpa para quem clicou e deixaria o desconto no contracheque do
servidor do mesmo jeito. O que destrava é o ENTE declarar o critério com o ato — e recalcular.

⚠️ **NADA ANTERIOR É DESFEITO.** Contracheques gravados ficam como estão; folha já apropriada
continua apropriada. Quem responde `null` para um cálculo antigo (a chave não existia) é a
verdade: ele rodou quando ninguém perguntava. O que se impede é o ato que ainda não aconteceu.

##### De onde o bloqueio lê — e por que não é do parâmetro vigente

`criterioDoAbatimentoNoCalculo` lê a **memória do contracheque** do cálculo, não o parâmetro
vigente agora. A diferença é o ponto: o parâmetro é append-only, e nada impede o ente declarar o
critério **depois** de a folha de dezembro ter sido calculada sem ele. Ler o vigente diria
"declarado" de um cálculo que não conferiu nada, e a efetivação passaria. É o mesmo raciocínio de
`reguaDoParametroNoCalculo`, e a mesma falha fechada: memória ilegível num cálculo que abateu vira
`CRITERIO-DO-ABATIMENTO-IRRECUPERAVEL`, nunca "segue sem conferir".

##### Provado em

`m33-criterio-do-abatimento.test.ts` (**18 casos**, com banco, N=2 em todos: MAT-A com 12 avos e
MAT-B com 9, para que "abater valor fixo" não passe) — a recusa do `PAGO` inverificável pelas duas
portas e a positiva; `CERTIFICADO` inelegível, devolvido, elegível e a repetição; `PAGO` com
pagamento parcial, sem pagamento, pago por inteiro e **anulado pelo caminho real do M05**; a
apropriação bloqueada, o recorte (o adiantamento segue apropriável), a **paridade com a barra da
tela**, o destrave por versão seguinte + recálculo — e **declarar sem recalcular, que continua
bloqueado**. Este último **nasceu de uma mutação**: ao preparar a prova de
`criterioDoAbatimentoNoCalculo` (trocar a leitura da MEMÓRIA pela do parâmetro VIGENTE) nenhum
caso ficava vermelho, porque todos ou nunca declaravam, ou declaravam **e** recalculavam. A
mutação não achou defeito; achou o teste que faltava — o único cenário em que as duas leituras
discordam. Mais dois casos no domínio puro
(`m33-decimo-terceiro-dominio.test.ts`): a simulação e a sua contrapartida declarada — sem a
segunda, um motor que gravasse "SIMULACAO" sempre passaria na primeira.

#### 5b. A GUARDA DO `fechar` — e o beco sem saída que nós mesmos criamos (V11 V9.3)

**O defeito era nosso, e foi medido antes de consertado.** Com a guarda só em `apropriar` e
`liquidar`, uma folha de 13º calculada em simulação e **fechada** ficava sem saída nenhuma:

| Caminho | Fato |
|---|---|
| recalcular | `servico.ts` recusa `FOLHA-FECHADA` |
| cancelar o cálculo | `servico.ts` recusa `CALCULO-FECHADO` — o que fechou |
| reabrir / desfechar / retificar | não existe em lugar nenhum (grep em `modules`, `lib`, `app`, `scripts`) |
| por SQL | `FechamentoDaFolha` e `CalculoDaFolha` **não constam** do censo assinado de UPDATE/DELETE do papel de runtime |
| devolver para correção | bloqueia a liquidação, **não reabre** |
| anulação pela despesa | inalcançável: em simulação não há empenho a anular |

O ente declarava o critério depois e **não adiantava**. Isso é exatamente o que a guarda
`PARAMETRO-TROCADO-ENTRE-AS-PARCELAS` derrubou quando comparava o `id` do parâmetro — *"recusa sem
saída não é fail-closed; é beco sem saída"* —, três seções acima, no mesmo arquivo. Aplicar a régua
num sítio e não no outro é o placar que este repositório proíbe.

**A guarda entrou no `fechar`, e o fundamento não é simetria.** É a regra aprendida: *"efeito
colateral antes da operação guardada envenena a tentativa seguinte — confira pré-condições antes de
gravar"*. O `fechar` **é** a gravação que envenena: é ele que CONGELA o número e arma todos os atos
seguintes. Guardar só a jusante era gravar o artefato antes da guarda.

⚠️ **ISTO NÃO MOVE O GATE, COMPLETA A CAMADA.** Cada guarda do M33 vive no ato de que ela é
pré-condição: `calcular` recusa folha fechada, `fechar` recusa sem cálculo vivo, `apropriar` recusa
não fechada, `liquidar` recusa não certificada. Faltava o critério no ato cuja semântica é
**congelar**.

⚠️ **OS TRÊS GATES FICAM, e não é redundância.** Folhas já fechadas em simulação **existem**, e sem
as guardas de jusante elas virariam despesa. Elas defendem o que já está congelado: `fechar` diz
"não se congela"; `apropriar`, "não vira despesa"; `liquidar`, "não se torna exigível".

⚠️ **RECUSAR NO `fechar` NÃO CRIA BECO NOVO:** a folha fica ABERTA, e folha aberta recalcula. O ente
declara o critério, recalcula e fecha — e o fechamento congela o cálculo NOVO, não o da simulação.
Quem nunca declarar fica com a folha aberta: nada congelado, nada devido, que é o estado honesto.

⚠️ **QUAL CÁLCULO A GUARDA OLHA:** o FECHADO quando a folha fechou (o que `apropriar` e `liquidar`
vão efetivar), o VIVO quando ainda não (o que `fechar` vai congelar). Um campo só, porque em cada
momento só existe um cálculo de que se possa falar — e o vivo é escolhido pela **mesma** regra de
`fecharFolha` (maior número entre os não cancelados), senão a barra anunciaria recusa sobre um
cálculo e o serviço decidiria sobre outro.

⚠️ **E O QUE JÁ ESTÁ CONGELADO CONTINUA SEM SAÍDA.** Nada é desfeito automaticamente. A saída
dessas folhas é `RETIFICACAO-DA-FOLHA`, que **não existe e não se inventa aqui**. Registro o que
achei ao levantar: **o modelo já a antecipou** — `situacaoDaCertificacao` (`certificacao.ts`) tem o
ramo `SUPERADA` escrito, com o comentário dizendo que ele existe porque "a retificação vai
produzi-lo, e descobrir isso depois significaria marcar o atesto antigo como se tivesse certificado
dados que ainda não existiam". Metade do desenho está feita; a construção é decisão de quem manda.

#### 6. O que NÃO foi determinado

- o dispositivo municipal aplicável (acesso negado nas três fontes tentadas) — segue nomeado como
  `DISPOSITIVO-MUNICIPAL-DO-13-NAO-LIDO`;
- o teor da consulta TCE/SC **CON 09/00004983** (HTTP 403);
- se Anita Garibaldi tem RPPS próprio ou se os estatutários estão no RGPS — não se achou a lei, e
  o repositório não fixa (a suíte usa RPPS, o percurso usa RGPS; as duas são fixtures);
- o exercício do cenário: não existe, por desenho.

### As duas parcelas saem da MESMA RÉGUA — `PARAMETRO-TROCADO-ENTRE-AS-PARCELAS` (V11 V9.2)

**O dano.** Nada impedia cadastrar a versão seguinte do parâmetro **entre** o fechamento do
adiantamento e o cálculo do 13º. Baixando `diasMinimosDoAvo` de 15 para 10, quem foi admitido em
março salta de 9 para 10 avos: a parcela final sai sobre **10** e abate o que foi apurado sobre
**9**. A folha fecha, o total bate, o empenho bate, a liquidação bate — **não há etapa adiante que
acuse**, que é o dano descrito na atualização de permissões **v28**. A única defesa era a
concessão restrita da ação.

**Por que esta guarda não inventa norma.** Ela não diz qual critério de avo é o certo — isso
continua sendo do ente, declarado no parâmetro. Ela exige **menos e mais duro**: que o minuendo e
o subtraendo da mesma conta venham da mesma régua. Abater um adiantamento medido por outro
critério é incoerência **aritmética interna**, e nenhuma fonte externa precisa ser consultada para
saber disso. É a mesma família do balanceamento por subsistema — uma identidade que o sistema deve
a si mesmo.

**A régua são TRÊS campos**, e a lista curta é decisão: `diasMinimosDoAvo`, `avosNoExercicio` e
`baseDosAvosDoAdiantamento` — o que decide **quantos** avos e **sobre que horizonte**. Incidências,
ato, percentual da 1ª parcela e rubricas **ficam de fora**: mudá-los depois não torna a subtração
incoerente, porque o abatimento é o valor **apurado**, já materializado. Incluí-los viraria
proibição de corrigir a ementa de um ato — zelo virado obstáculo.

⚠️ **A comparação é por VALOR, não pela identidade do registro — e isso foi uma correção durante a
própria rodada.** A primeira versão comparava o `id` do parâmetro. Era mais estrita e estava
**errada**: recadastrar exatamente o mesmo critério gera outro `id`, então a saída que a própria
mensagem oferece não funcionaria e o ente ficaria sem saída nenhuma dentro do exercício. Quem
derrubou o desenho foi o teste que percorre a saída prometida. **Recusa sem saída não é
fail-closed; é beco sem saída.**

**Sem mecanismo de dispensa**, deliberadamente: quem precisar divergir é recusado com as duas
réguas na mão, e isso volta como pergunta de produto em vez de virar uma caixa "ignorar" que
ninguém sabe quem marcou. A mensagem orienta — diz as duas versões, os dois critérios lado a lado,
e a saída (cadastrar a versão seguinte com o critério do adiantamento; a mudança de critério vale
a partir do próximo exercício).

O fato lido vem da **memória do contracheque** do cálculo que fechou o adiantamento, que já
gravava `parametro.versao` desde a V11 V9.1 — **nenhum fato novo, nenhuma DDL**. Lê-se **um**
contracheque, porque o parâmetro é lido uma vez por cálculo, antes do laço, e passado a todos; ler
todas as memórias custaria dezenas de MB numa folha de mil servidores. Memória ausente ou ilegível
**não** vira "segue sem conferir": vira `PARAMETRO-DO-ADIANTAMENTO-IRRECUPERAVEL`.

### O zero de dias é declarado, não suposto

Um contracheque de 13º grava `diasComputados = 0`. Sozinho isso seria uma mentira que some numa
soma ("gente com zero dia trabalhado no ano"). Quem impede é o CHECK
`ck_contracheque_avos_ou_dias`: ou `avosComputados` é nulo e `diasComputados` está em [0,30]
(mensal), ou `avosComputados` vem e `diasComputados` é zero (13º). Exatamente uma das duas medidas,
por contracheque, dita pelo banco.

### A marcação honesta no catálogo — e por que ela NÃO é `VALIDADO_LOCALMENTE`

A cláusula **5.12.50** deixa de ser atendida só pela folha MENSAL: o 13º e o adiantamento existem,
com tela, e o resto do item continua ausente (mensal complementar, rescisão, rendimentos
acumulados, férias, diferença de 13º, adiantamentos salariais).

**Mas a marcação correta hoje é `IMPLEMENTADO_NAO_VALIDADO`, não `VALIDADO_LOCALMENTE`** — e isso
é a mesma régua com que este lote acusou a 5.18.8 de estar marcada como validada com
`rota_verificada` vazia. `VALIDADO_LOCALMENTE` exige tela **e** percurso de navegador, e
`scripts/smoke-decimo-terceiro.ts` **não existe**. Aplicar a régua ao almoxarifado e não a si
mesmo é o que transforma um relatório em placar.

Quatro dos cinco defeitos desta unidade eram da mesma família — o domínio funcionando e a
interface não alcançando —, e **nenhum tinha teste vermelho**. É isso que o percurso pega e os
262 testes não pegam.

### O roteiro de quinze passos — `scripts/smoke-decimo-terceiro.ts`

⚠️ **Até a V11 V9.2 este roteiro NÃO EXISTIA, e dois documentos afirmavam que ele existia.** O
`ESTADO-EXECUCAO.md` dizia "roteiro de 15 passos já escrito no `MODULO.md` do M33"; este arquivo
dizia "listado no roteiro de quinze passos **da unidade**". Cada um apontava para o outro e a
referência não fechava em lugar nenhum — papelada declarando o que não havia. Quem fosse escrever
o percurso perderia a primeira hora procurando. Os passos abaixo são a lista, escrita.

**Ambiente:** banco dos percursos (`DATABASE_URL_PERCURSOS`), `npm run percursos:preparar` e
`npm run percursos:servir`. **Exercício ainda SEM folha de 13º** — `@@unique([exercicio, tipo])`
dá uma folha de cada tipo por ano, e reexecutar no mesmo exercício é reconhecido e **pulado com
aviso**: nunca falhar, nunca passar em silêncio.

**Papéis, e por que são estes:** `admin` cadastra o parâmetro, porque
`CONFIGURAR_PARAMETRO_DO_DECIMO_TERCEIRO` vai **só** a quem administra permissões no global
(derivação v28) — **nenhum papel de percurso a tem, e não se concede a ação ao `rh@` para o
percurso passar: a negativa é evidência, não obstáculo**. `rh@` parametriza a folha e CALCULA;
`contabilidade@` FECHA. A servidora do portal olha o próprio contracheque.

| # | ação pela tela (rota · papel) | o que se confere | valor esperado |
|---|---|---|---|
| 1 | `/folha` · `rh@` | a landing lista as **nove** telas da área, e as quatro que ficaram um ano escondidas estão lá | cards para encargos, grupos de empenho, designações e eSocial |
| 2 | `/folha/rubricas` · `rh@` | o `select` de **natureza** oferece `ABATIMENTO_DO_ADIANTAMENTO_DO_13` | a opção existe — sem ela a rubrica é incadastrável e a 2ª parcela nunca abate |
| 3 | `/folha/rubricas` · `rh@` | cadastrar a rubrica do abatimento como **PROVENTO** é RECUSADO, e a mensagem chega legível | texto com `ABATIMENTO_DO_ADIANTAMENTO_DO_13 é DESCONTO` |
| 4 | `/folha/rubricas` · `rh@` | cadastrar as três do 13º e as da base (vencimento, gratificações, percentual) | rubricas listadas, com versão aprovada |
| 5 | `/folha/parametros-do-13` · **`rh@`** | **NEGATIVA DE AUTORIZAÇÃO**: sem a ação, a lista abre e o formulário **não** | a tela diz `CONFIGURAR_PARAMETRO_DO_DECIMO_TERCEIRO` e que a concessão é por ação |
| 6 | `/folha/parametros-do-13` · `admin` | o **recorte dos seletores**: base só com as três naturezas admitidas; abatimento só com a natureza própria | horas extras **não** aparece na base; contribuição **não** aparece no abatimento |
| 7 | `/folha/parametros-do-13` · `admin` | **NEGATIVA DE COERÊNCIA**: ato com ementa de uma palavra é recusado, e a recusa chega à TELA | texto com `ATO-INCOERENTE` e o motivo |
| 8 | `/folha/parametros-do-13` · `admin` | gravar o parâmetro; o percentual é digitado **em porcento** e guardado em fração | digita `50`, a lista mostra 50% (o CHECK exige [0,1] — sem a conversão de borda nada gravaria) |
| 9 | `/folha/folhas` · `rh@` | abrir a folha de **ADIANTAMENTO DO 13º** e calcular | dois contracheques; 1ª parcela de **1.900,00** (12 avos) e **990,41** (9 avos) |
| 10 | `/folha/folhas/<id>` · `rh@` | a **memória dos doze meses** é renderizada, mês a mês, com o motivo de cada avo | janeiro e fevereiro "anteriores à admissão"; março "11/30 dias — abaixo do mínimo de 15" |
| 11 | `/folha/folhas/<id>` · `rh@` | a memória do adiantamento **declara** que não há incidência, em vez de calar | texto com `INCIDENCIA-NA-PRIMEIRA-PARCELA` — e nenhuma linha de contribuição ou IRRF |
| 12 | `/folha/folhas/<id>` · `rh@` → `contabilidade@` | **OS DOIS PAPÉIS SÃO SESSÕES DISTINTAS**: `rh@` não fecha; `contabilidade@` fecha | `rh@` é barrado no ato de fechar; a folha fecha na sessão seguinte |
| 13 | `/folha/folhas` · `rh@` | abrir a folha de **13º**, calcular, e conferir o abatimento **por vínculo** | 13º apurado **3.800,00**/**1.980,82**; abatimento **1.900,00**/**990,41** — os dois DIFERENTES, senão "abater valor fixo" passa |
| 14 | `/folha/folhas/<id>` · `rh@` | a memória do 13º diz **de onde** veio o abatimento e **não** afirma pagamento | `1ª parcela APURADA na folha de adiantamento FECHADA de <competência>`, com a situação da certificação — e **sem** "já paga" |
| 15 | `/portal-do-servidor` · a servidora | o contracheque do 13º **alcança o portal**, e só o dela | a competência do 13º aparece, com avos e líquido; a matrícula da outra, não |

⚠️ **O roteiro ainda NÃO exercita o critério do abatimento (V11 V9.3), e isso é falta nomeada, não
esquecimento.** Faltam três passos pela tela: (16) o `select` "o adiantamento precisa estar" existe
no formulário do parâmetro e a nota diz quais rubricas permitem exigir PAGO; (17) sem declarar, o
detalhe da folha de 13º mostra o selo **SIMULAÇÃO — não é apuração aprovada** e a barra recusa
~~`apropriar`~~ **`fechar`** com `ABATIMENTO-SEM-CRITERIO-DECLARADO`; (18) declarado na versão seguinte e
recalculado, o selo some e o ato passa a ser oferecido. Os três são cobertos pela suíte
(`m33-criterio-do-abatimento.test.ts`), e é exatamente por isso que faltam **pela tela**: foram
quatro defeitos de interface na V11 V9.2 que os 262 testes não pegaram.

⚠️ **O PASSO 17 MUDOU DE ALVO — e o texto anterior fica riscado acima de propósito, porque quem
reler precisa saber que a evidência MUDOU DE LUGAR e por quê.** Ele media a recusa em `apropriar`;
passa a medir a recusa em **`fechar`**. A razão é a seção "A GUARDA DO `fechar`" adiante: depois
dela o estado que o passo media — folha de 13º FECHADA em simulação — **não é mais alcançável pela
tela**, e isso é o objetivo, não uma perda. A prova das guardas de `apropriar` e `liquidar` migra
para a suíte, que constrói o estado direto no banco (`congelarComoAntesDaGuarda`, em
`m33-criterio-do-abatimento.test.ts`). **Uma guarda que só dado legado alcança continua valendo, e
quem a prova é o teste, não o percurso.**

**A repetição sem duplicar efeito** fecha o roteiro: reexecutado no mesmo exercício, o percurso
reconhece as folhas que já existem e PULA com aviso, em vez de falhar no `@@unique` — e o
`admin` ao cadastrar o parâmetro de novo produz a **versão seguinte**, nunca um `UPDATE`.

⚠️ **O passo 13 é o par N=2 de `m33-decimo-terceiro.test.ts`, e os números são os mesmos de
propósito**: o percurso confere pela TELA o que a suíte confere pelo banco. O `1.980,82` é um
empate exato (`2.641,10 × 9/12 = 1.980,825`) resolvido por **half-even** — half-up daria
`1.980,83`. Se a tela mostrar `1.980,83`, o arredondamento do sistema mudou e ninguém avisou.

⚠️ **O percurso NÃO afirma os líquidos** (1.520,00 e 792,33), e isso é decisão. A contribuição
depende da TABELA vigente no banco dos percursos, que tem faixas (7,5% / 9% / 14%) e não a
alíquota linear de 10% da fixture da suíte. Cravar o líquido no percurso afirmaria a tabela de um
banco dentro de um roteiro que roda contra outro: o passo ficaria vermelho sem defeito nenhum, e
alguém consertaria o 13º por causa disso. Os líquidos exatos são do teste, onde a tabela é
declarada pela fixture; o percurso fica com o que a tabela não move — base, avos e abatimento.

⚠️ **Nada foi marcado no catálogo nesta unidade**, nem para cima nem para baixo. Só
`scripts/marcar-catalogo.ts` escreve nele.

### Provado em

`m33-decimo-terceiro-dominio.test.ts` (domínio puro) e `m33-decimo-terceiro.test.ts` (com banco).
**Todo avo esperado está escrito à mão** no comentário de cada caso, mês a mês — conferir o avo
chamando `avosDoExercicio` para produzir o esperado faria a suíte concordar com qualquer regra
errada desde que consistente. **Todo caso é N=2**: a admissão no meio do ano (12 e 9 avos) e o par
afastamento/desligamento (9 e 7 avos), porque com um servidor só "9 avos" passa por vacuidade.

## Fora de escopo aqui — pendências nomeadas

- `RETIFICACAO-DA-FOLHA` — devolver para correção é fato e BLOQUEIA a liquidação, mas não reabre o
  cálculo fechado. Corrigir exige retificação ou folha complementar, com a análise dos efeitos
  posteriores. A derivação `SUPERADA` de `situacaoDaCertificacao` já existe escrita para o dia em
  que houver mais de um cálculo fechado por folha.
- `CONCENTRACAO-DE-FUNCOES-NA-FOLHA` — num ente pequeno, a mesma pessoa pode acumular preparar e
  certificar. Hoje o serviço RECUSA, sempre. Permitir isso é decisão fundamentada do ente, com
  registro próprio — não um parâmetro solto.
- `DESIGNACAO-POR-ENTIDADE` — a designação é do ENTE. Uma autarquia com folha própria precisaria de
  escopo por entidade, e a folha em si ainda é única por competência.
- `ORDENAR-E-PAGAR-A-FOLHA` — depois de liquidada, a folha entra na fila do art. 141 como qualquer
  obrigação; ordenar o pagamento e pagar continuam nos atos do M05/M09, sem atalho pela folha.
- ~~`PATRONAL-NA-MEMORIA`~~ — resolvida em V6.2 pelos encargos do empregador (seção acima).
- ~~`ANULACAO-DOS-ENCARGOS`~~ — resolvida em V7 M1 U3 (ajuste para baixo, seção acima).
- `ENCARGO-POR-TIPO-DE-VINCULO` — o componente é por REGIME; alíquota distinta por tipo de vínculo
  (temporário, comissionado) exigiria recorte próprio.
- `RECOLHIMENTO-DOS-ENCARGOS` — guia, recolhimento e retido × patronal por contribuição (5.12.73).
- ~~`FOLHAS-NAO-MENSAIS`~~ — **parcialmente resolvida em V11 V9.1**: o 13º em duas parcelas existe
  (seção abaixo). Continuam ausentes, e declaradas: **férias** (depende de período aquisitivo,
  perdas, prorrogações e programação — 5.12.21–5.12.28, nada disso existe no M32), **rescisão**
  (depende de férias e de uma tipologia de motivo de desligamento; hoje o motivo é texto livre),
  **complementar** e **diferença de 13º** (dependem de `RETIFICACAO-DA-FOLHA`) e **rendimentos
  acumulados**.
- `INCIDENCIA-NA-PRIMEIRA-PARCELA` (V11 V9.1) — a 1ª parcela do 13º **não** sofre contribuição nem
  IRRF neste sistema. É limite declarado, não norma afirmada: se ela sofresse, a 2ª parcela teria
  de abater o que já foi retido, e esse critério é normativo e não foi levantado. A memória de cada
  contracheque do adiantamento **diz isso por escrito**, para que "sem contribuição" não se
  confunda com "a tabela não achou nada a descontar".
- `SALARIO-FAMILIA-NO-13` (V11 V9.1) — o salário-família não entra no contracheque do 13º. Se
  algum ente o pagar sobre a gratificação natalina, é parâmetro a criar, não linha a acrescentar.
- `ABATIMENTO-MAIOR-QUE-O-13` (V11 V9.1) — quem foi adiantado sobre o ano projetado e desligado no
  meio deve ao ente. A folha **recusa nomeando a matrícula**; repor ao erário é ato próprio, com
  rito próprio, e não existe aqui.
- ~~`ESTADO-EXIGIDO-DO-ADIANTAMENTO-SEM-FONTE`~~ — **resolvida em V11 V9.3, e não do jeito que
  parecia.** A fonte foi levantada e o resultado obrigou a TIRAR o critério do motor em vez de
  trocá-lo: o estado mínimo passa a ser **declarado pelo ente**, no parâmetro versionado, com ato.
  Sem declaração o 13º ainda calcula, mas como **simulação identificada**, e a **apropriação fica
  bloqueada**. Ver a seção "O ESTADO EXIGIDO DO ADIANTAMENTO" adiante. **Continua aberta a
  pergunta normativa concreta** (qual dispositivo municipal de Anita Garibaldi se aplica), agora
  como pendência de INFORMAÇÃO do ente e não de desenho: `DISPOSITIVO-MUNICIPAL-DO-13-NAO-LIDO`.
- `DISPOSITIVO-MUNICIPAL-DO-13-NAO-LIDO` (V11 V9.3) — a lei municipal que rege a gratificação
  natalina do estatutário de Anita Garibaldi **não foi localizada** (leismunicipais HTTP 403,
  câmara sem texto alcançável, consulta TCE/SC **CON 09/00004983** HTTP 403). Isso **não trava
  mais o sistema** — o ente declara o critério com o ato que tiver —, mas continua sendo o que
  falta para alguém saber QUAL critério declarar. Ausência de acesso não é ausência de fonte.
- ~~`MEMORIA-DIZ-PARCELA-PAGA`~~ — **corrigida em V11 V9.3**: a chave da memória canônica passou
  de `parcelaPaga` para `parcelaApurada`. Ela afirmava pagamento num contracheque de folha apenas
  CALCULADA, e era o mesmo defeito que a V11 V9.2 corrigiu em `adiantamentoPago`. Trocar é seguro
  e não desfaz fato nenhum: `sha256Canonico` só é chamado no ATO DA CRIAÇÃO (seis sítios de
  produção) e **nada relê uma `memoria` gravada para recomputar digesto** — a certificação compara
  `calculoId` e lê o sha da COLUNA. O digesto muda para contracheques NOVOS; nenhum gravado é
  invalidado.
- ~~`PARAMETRO-TROCADO-ENTRE-AS-PARCELAS`~~ — **resolvida na V11 V9.2** (seção abaixo).
- ⚠️ **`RETIFICACAO-DA-FOLHA` — agora com um caso sem saída dentro dela.** Além de "devolver não
  reabre", ela passou a ser **a única saída** das folhas de 13º congeladas em simulação antes da
  guarda do `fechar` (seção 5b). Enquanto não existir, essas folhas não se apropriam, não se
  liquidam e não se recalculam. **O modelo já a antecipou** no ramo `SUPERADA` de
  `situacaoDaCertificacao` (`certificacao.ts`), escrito de propósito para o dia em que houver mais
  de um cálculo fechado por folha. Construção nova, decisão de quem manda, **não inventada aqui**.
- `ELO-DO-EMPENHO-PERDIDO-NA-JANELA` (achado em V11 V9.3, **não consertado**) — em
  `apropriarFolha`, quando `empenhar` grava o `Empenho` e o processo morre antes de gravar o
  `EmpenhoDaFolha`, a reexecução encontra o número, conta `jaExistiam` e **nunca amarra o elo**: a
  folha fica para sempre com menos empenhos que o esperado, e a liquidação, que lê pelo elo, nunca
  alcança aqueles. ⚠️ **E metade do conserto já está escrita em outro lugar deste módulo**: a
  liquidação recupera exatamente essa janela "procurando a liquidação pelo par (empenho, número) e
  só amarrando o elo" (seção da V6.1). A apropriação não tem o equivalente. Fica nomeado e não
  consertado — é defeito distinto do da numeração, e não foi autorizado nesta rodada.
- `NUMERACAO-DA-FOLHA-FORA-DO-CAMPO-DO-SAGRES` (levantado em V11 V9.3, **anterior a ela**) — o
  SAGRES (TCE-PB) lê `empenho.numero` no campo `numEmpenho`, **NUMÉRICO de 7 posições**
  (`adapters/tribunais/tce-pb/sagres/layout-2026v11.ts`; `captura/dto-captura.ts` faz `cod(...,7)`),
  e a numeração da folha (`série/competência/matrícula`) **nunca coube ali** — o próprio
  `sagres/MODULO.md` já declara que "a numeração da UG precisa ser numérica". Isso **não** foi
  criado pelo segmento do tipo da V11 V9.3; é pendência anterior e independente, e quem a resolve é
  o cadastro da série do grupo, não o motor.
- `MEDIA-DAS-VARIAVEIS-NO-13` (5.12.82) — a base do 13º só admite vencimento-base, gratificações do
  vínculo e percentual do vencimento. Valor informado e fórmula exigiriam a média do ano; somar o
  lançamento de um mês pagaria 13º sobre a hora extra de dezembro como se fosse a do ano inteiro.
  O cadastro do parâmetro recusa, nomeando a rubrica.
- `NATUREZA-FORMULA-FORA-DO-SELETOR` (observado em V11 V9.1, **não** consertado) — o seletor de
  natureza do cadastro de rubricas (`OPCOES_DE_NATUREZA`, `lib/portas/recursos/folha.ts`) não
  oferece `FORMULA`, embora o motor a leia desde a V11 V1.1 e o `zCadastrarRubricaInput` a aceite.
  Pode ser deliberado (a fórmula se escreve na VERSÃO, e o painel de versões fica fora do molde),
  pode ser o mesmo esquecimento que deixou o abatimento do 13º de fora. Fica nomeado em vez de
  mudado: acrescentar a opção sem saber por que ela não está lá é adivinhar.
- `FALTAS-NA-FOLHA` — faltas e suspensões como redutor de dias (hoje só admissão, desligamento e
  afastamento do M32).
- `PENSAO-ALIMENTICIA-NA-FOLHA` (5.12.74–5.12.77) — a finalidade existe no M32; o desconto e a
  dedução no IRRF não.
- `CONSIGNACOES-E-MARGEM` (5.12.37–5.12.39, 5.12.83) — o consignado entra como desconto
  informado; não há margem.
- `ARREDONDAMENTO-DA-FOLHA` — half-even (o do razão); half-up é decisão a registrar se exigida.
- `CONTRACHEQUE-EM-PDF` (5.12.64) — P4. O `RESUMO-DA-FOLHA` ganhou CSV/PDF em V6.2 (por regime ×
  lotação); a quebra por natureza de despesa continua pendente.
