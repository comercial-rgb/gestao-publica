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

`@@unique([exercicio, tipo])` garante **um** adiantamento e **um** 13º por exercício, e é o que
permite ao serviço resolver o elo em vez de o operador digitá-lo — digitar permitiria abater o
adiantamento do ano passado.

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

O que o percurso provaria e os 262 testes não provam está listado no roteiro de quinze passos da
unidade: a landing levar às telas, o `select` de natureza oferecer o abatimento, o recorte dos
seletores do parâmetro, a recusa do ato chegar legível à tela, a memória dos doze meses ser
renderizada, os dois papéis serem sessões distintas, e o contracheque do 13º alcançar o portal do
servidor. Quatro dos cinco defeitos desta unidade eram exatamente dessa família — o domínio
funcionando e a interface não alcançando —, e nenhum tinha teste vermelho.

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
