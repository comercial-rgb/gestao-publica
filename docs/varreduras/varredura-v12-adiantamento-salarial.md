# Varredura — adiantamento salarial (M33), antes de construir

> Levantada na ordem V12 (`docs/lotes/V12-consolidacao-e-construcao-integrada.md`),
> em 2026-09-24. **Nada implementado.** Este documento existe porque a rodada de
> construção parou por saturação da máquina, e o levantamento vale por si.
>
> Regra do repositório que este documento cumpre: decisão de modelo se levanta
> ANTES de construir, não durante.

## Por que esta modalidade, e não outra

Dos nove tipos exigidos pela cláusula `5.12.50`, quatro têm motor (`MENSAL`,
`MENSAL_COMPLEMENTAR`, `ADIANTAMENTO_DECIMO_TERCEIRO`, `DECIMO_TERCEIRO`).
Das cinco ausentes, quatro têm bloqueio real e nomeado:

| Ausente | Bloqueio |
|---|---|
| Férias | modelo de domínio inteiro (período aquisitivo, perdas, prorrogação) |
| Rescisão | depende de férias **e** de motivo de desligamento tipado (hoje texto livre) |
| Diferença de 13º | depende de `RETIFICACAO-DA-FOLHA`, que não existe |
| Rendimentos acumulados | norma de regime de caixa **não pesquisada** — inventar é proibido |
| **Adiantamentos salariais** | **nenhum** |

## A conferência de ausência

Zero ocorrências de adiantamento salarial em `modules/`, `prisma/`, `lib/`,
`app/`, `scripts/`, `packages/` — e também em `doador/`, consultado só para
saber se havia precedente de desenho (nada se importa de lá). Confirmado de
forma independente por `modules/m33-folha/MODULO.md:885` e pela evidência da
cláusula no catálogo, que nomeia os cinco ausentes.

⚠️ O `MODULO.md` do M33 lista **quatro** ausências e omite adiantamentos
salariais, embora o catálogo, na mesma cláusula, a cite. O documento do módulo
está desatualizado em relação ao próprio catálogo dele.

## Decisão: tipo de folha próprio

A razão é estrutural, não estética: **o adiantamento se paga antes de a folha
mensal da competência existir**. Não cabe como rubrica dentro de uma folha que
ainda não abriu. O TR também o lista como rotina de cálculo separada, ao lado
de "adiantamento de 13º salário (1ª parcela)" — são dois itens distintos no
próprio enunciado.

## As duas armadilhas — o valor desta varredura

### 1. `compoeARemuneracaoMensal` tem de ser `false`

Se fosse `true`, `fechadasQueCompoem` (`modules/m33-folha/servico.ts:838-843`)
somaria o provento do adiantamento no "já apurado" da complementar — mas o
recálculo do mensal **nunca reproduz aquela rubrica**, porque ela só existe na
folha de adiantamento. O delta ficaria negativo e
`DiferencaNegativaNaComplementarError` recusaria **toda competência que teve
vale, sempre**, dizendo ao servidor que ele deve ao erário justamente o
adiantamento que a mensal já abateu.

O adiantamento do 13º já caiu nessa (`MODULO.md:404-408`).

### 2. Não copiar o elo persistido do 13º

`folhaDoAdiantamentoId` (`prisma/schema/m33-folha.prisma:300-301`) é resolvido
na abertura, e **só** quando `d.tipo === "DECIMO_TERCEIRO"`
(`servico.ts:313-320`). Funciona porque, quando o 13º abre, o adiantamento já
existe.

A MENSAL não tem essa garantia: ela abre no início do mês e o vale sai no meio.
Elo resolvido na abertura nasceria nulo, e a guarda "adiantamento apareceu
depois" bloquearia o cálculo **pelo resto da competência** — beco sem saída, a
mesma classe de defeito que a seção 5b do `MODULO.md` (`:773-821`) já
documentou e consertou para o 13º.

A leitura tem de ser **refeita a cada `calcularFolha`**, por competência, sem
FK — como a complementar já refaz o apurado (`servico.ts:804-812`).

### Onde a leitura mora

Dentro de `contrachequesMensaisDaCompetencia` (`servico.ts:471-605`), não num
motor separado — porque a complementar chama essa mesma função para calcular o
"correto". Fora dali, a mensal direta e o recálculo da complementar
divergiriam: a segunda aritmética que este repositório existe para evitar.

## O parâmetro do ente

`ParametroDoAdiantamentoSalarial`, versionado **por competência** (o
adiantamento é mensal; o 13º é que é por exercício), modelado na FORMA de
`ParametroDoDecimoTerceiro` (`prisma/schema/m33-decimo-terceiro.prisma:101-193`):

- `percentualDoAdiantamento Decimal @db.Decimal(7, 4)`, com CHECK entre 0 e 1;
- `baseDoAdiantamento` enum `BaseDoAdiantamentoSalarial`:
  `REMUNERACAO_DO_MES_ANTERIOR` | `REMUNERACAO_PROJETADA_DO_MES`;
- as duas rubricas (provento do adiantamento, desconto do abatimento);
- o ato normativo estruturado (esfera, tipo, número, ano, dispositivo, ementa);
- `@@unique([competencia, versao])`, append-only.

**O TR não fixa percentual nem base** — procurado em `docs/edital/`, não
localizado. A cláusula apenas nomeia o tipo. O parâmetro nasce **sem seed e sem
default**, e o cálculo é fail-closed com
`PARAMETRO-DO-ADIANTAMENTO-SALARIAL-AUSENTE`, nomeando a competência.

As duas bases viram enum em vez de uma escolha interna porque as duas práticas
existem nos entes, e escolher por dentro seria **inventar norma municipal**.

## As guardas, em ordem

A grave antes da trivial — a lição de `APURADO-A-REPOR-ENCOBERTO-POR-FOLHA-SEM-VINCULOS`,
aplicada antes de o defeito nascer em vez de depois.

1. Parâmetro vigente ausente → `PARAMETRO-DO-ADIANTAMENTO-SALARIAL-AUSENTE`.
2. Na MENSAL: folha de adiantamento da competência existe e **não fechou** →
   `ADIANTAMENTO-SALARIAL-NAO-FECHADO` (abater valor que ainda pode mudar).
3. Na MENSAL, após ler as linhas do adiantamento fechado: vínculo com
   adiantamento apurado que **não aparece** entre os finais →
   `VINCULO-DO-ADIANTAMENTO-SALARIAL-FORA-DA-MENSAL`. **Roda antes de qualquer
   guarda trivial de "sem vínculos"**: a informação grave é "há adiantamento
   pago que ninguém vai abater".
4. Por vínculo: abatimento maior que o líquido →
   `ABATIMENTO-DO-ADIANTAMENTO-SALARIAL-MAIOR-QUE-A-REMUNERACAO`, nomeando
   matrícula, apurado e adiantado. Nunca líquido negativo; a folha inteira para;
   a reposição ao erário fica **nomeada**, não inventada.
5. Rubrica do abatimento não resolvida →
   `RUBRICA-DO-ABATIMENTO-SALARIAL-AUSENTE`.

## A medida

`zMedida` precisa de `"PERCENTUAL"`. Reusar `"DIAS"` diria "30/30 dias" onde a
conta é percentual sobre base monetária — a mesma mentira que o `MODULO.md` já
registrou duas vezes. Dois sítios, e são os únicos:
`modules/m33-folha/dominio.ts:1027` e
`modules/m33-folha/memoria-do-contracheque.ts:115`.

## Migrations, aditivas, zero DROP

1. `ALTER TYPE "TipoDeFolha" ADD VALUE 'ADIANTAMENTO_SALARIAL'` — **sozinha**.
2. `ALTER TYPE "NaturezaDaRubrica" ADD VALUE 'ABATIMENTO_DO_ADIANTAMENTO_SALARIAL'`
   — **sozinha** (restrição do Postgres: valor de enum não se usa na mesma
   transação que o cria).
3. `CREATE TYPE "BaseDoAdiantamentoSalarial"` + `CREATE TABLE
   "ParametroDoAdiantamentoSalarial"` podem dividir arquivo.

O CHECK `ck_folha_exercicio_por_tipo` **não muda de forma**: o tipo é
`POR_COMPETENCIA`, lado que `MENSAL` já ocupa. Mas
`m33-recorrencia-do-tipo-de-folha.test.ts` lê o `pg_enum` em runtime e **vai
achar** o valor novo, falhando até `NATUREZA_DO_TIPO_DE_FOLHA` classificá-lo.
Reexecutar de verdade, não presumir.

Nenhuma migration de dados: o parâmetro nasce vazio.

## Censos que quebram se esquecidos

Pegos pelo compilador:

- `NATUREZA_DO_TIPO_DE_FOLHA` (`dominio.ts:1030`) — `Record` exaustivo;
- o `switch` com `never` no default (`servico.ts:672-710`);
- `zMedida` (`memoria-do-contracheque.ts:115`).

**Não** pegos pelo compilador, e por isso os perigosos:

- `lib/portas/recursos/folha.ts:18-30` (`OPCOES_DE_NATUREZA`) e `:46-51`
  (`OPCOES_DE_TIPO_DE_FOLHA`) — arrays simples. Esquecê-los produz exatamente o
  `ROTULO-CRU-DO-TIPO-DE-FOLHA`, já registrado duas vezes. Checklist manual.
- `test/limpar-banco.ts:376-392` — a tabela do parâmetro entra **antes** de
  `Rubrica` (FK `RESTRICT`); a nota já escrita ali explica por quê.
- Nova ação `CONFIGURAR_PARAMETRO_DO_ADIANTAMENTO_SALARIAL` e o mapa
  serviço→ação. Ação **própria**, não ramo de `CONFIGURAR_TABELAS_DA_FOLHA`:
  quem transcreve portaria não recebe o poder de escrever critério do ente.

## Cenários obrigatórios, com o comportamento correto

| Cenário | Correto |
|---|---|
| **N=2**, duas bases diferentes, mesmo percentual | abatimentos **diferentes** na mensal; com N=1 um motor que abate valor fixo passaria |
| Adiantamento > remuneração (dias reduzidos no mês) | recusa nomeando matrícula, apurado e adiantado; nunca líquido negativo; a folha inteira para |
| Desligado com efeito **dentro** da competência | continua elegível com dias proporcionais; se o abatimento superar o líquido, cai no caso acima — nunca excluído em silêncio com o adiantamento perdido |
| Desligado com efeito **antes** da competência | guarda 3 recusa nomeando a matrícula; o valor não cai no chão |
| Segunda folha de adiantamento na mesma competência | `FOLHA-JA-ABERTA` enquanto a primeira está **aberta** (recalcular absorve o achado). **Fechada**, fica sem solução: nomear `SEGUNDA-ADIANTAMENTO-SALARIAL-NA-MESMA-COMPETENCIA`, espelhando `SEGUNDA-COMPLEMENTAR-NA-MESMA-COMPETENCIA`. **Não inventar solução** |
| Ordem das guardas | inverter as duas tem de deixar o caso **vermelho**, com alvo confirmado por checksum antes de ler resultado |

Autorização positiva **e** negativa, com o ator negativo **fora do censo** —
toda identidade das fixtures ganha ADMIN, então reusar uma passa por vacuidade.

## A menor cadeia completa

Enum e `NATUREZA_DO_TIPO_DE_FOLHA` → cadastro do parâmetro do ente → `abrirFolha`
/ `calcularFolha` / `fecharFolha` (já genéricos por tipo) → motor por vínculo
elegível, com memória própria e sha256 → a MENSAL da mesma competência resolve o
adiantamento fechado daquele vínculo e desconta → tela de contracheque (já
genérica) exibe os dois → correção pela complementar, que já resolve diferença
sem reabrir nada.

Nenhum cadastro ou saldo paralelo: `FolhaDePagamento`, `CalculoDaFolha`,
`Contracheque`, `LinhaDoContracheque`, `Rubrica` e `VersaoDaRubrica` já servem a
este tipo como servem aos outros quatro.

## Aviso ao próximo

Esta ordem encontrou **duas vezes** um motor que o operador não alcança: os
filtros de função e centro de custo sem ponta de entrada, e a seleção no cálculo
sem superfície. Se o motor for construído sem tela, a pendência se chama
`ADIANTAMENTO-SALARIAL-SEM-SUPERFICIE` e se escreve — não se deixa implícita.
