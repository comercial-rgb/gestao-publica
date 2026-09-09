import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import {
  somasPorConta,
  somasPorContaELancamento,
  type CampoDeCorte,
  type FiltroDeNatureza,
  type NaturezaLancamento,
} from "../m01-core-contabil/adapter-prisma.js";

/**
 * M12 — OS LIVROS OBRIGATÓRIOS: Diário, Razão analítico e Balancete de verificação.
 * TR 1.3.2 · 5.92 (Diário) · 5.93 (Razão) · 5.94 (Balancete) · art. 50 da LRF.
 *
 * ═══ ⚠️ ZERO ARITMÉTICA NOVA — É UM COMPOSITOR, NÃO UM CALCULADOR ═══
 * Toda soma do razão mora em UM lugar: `somasPorConta` (M01, o dono do razão). Estes três
 * livros COMPÕEM essa soma em três formatos — o cronológico (Diário), o por-conta com saldo
 * corrente (Razão) e o de saldos+somas (Balancete). Nenhum deles soma por conta própria.
 *
 * É a mesma disciplina do M13/M14: um livro que somasse sozinho seria uma SEGUNDA VERDADE sobre
 * o razão, e o dia em que ela divergisse, o balancete fecharia e o balanço não — ou vice-versa,
 * e ninguém saberia qual mentiu. Aqui os três livros e os balanços leem o MESMO número, do
 * MESMO código. O grep-teste (`m12-livros.test.ts` t7) proíbe `.create`/`.aggregate`/`_sum`
 * neste arquivo — a rede que mantém a promessa.
 *
 * ═══ AS QUATRO IDENTIDADES AUTO-EXECUTÁVEIS ═══
 * Cada livro carrega a prova de que fechou, e o teste as exercita contra literais à mão:
 *   L1 (Razão)     — a última linha do saldo corrente == `saldoDaConta` no corte.
 *   L2 (Balancete) — cada sintética == Σ das analíticas sob o prefixo dela.
 *   L3 (Balancete) — Σ dos saldos devedores == Σ dos saldos credores (o balancete FECHA).
 * (A ordem determinística do Diário — 0(a) — é a "identidade" do Diário: reproduzível.)
 *
 * ═══ CONSOLIDADO NASCE; POR-UG É PENDÊNCIA CRUZADA ═══
 * Os três livros são CONSOLIDADOS (o ente inteiro). Não há parâmetro de unidade gestora nas
 * assinaturas — e a AUSÊNCIA é deliberada, não um esquecimento: o `LancamentoContabil` NÃO
 * carrega UG (o censo de `8dd0c3c` documenta por quê — a dimensão vive na ficha, não na
 * partida). Um "livro por UG" exigiria derivar a UG de cada lançamento pela ficha das partidas,
 * e nem todo lançamento tem ficha (o manual puro, o patrimonial em lote). Criar um parâmetro
 * `unidadeGestora?` que hoje não filtra nada seria um PARÂMETRO MORTO — pior do que a ausência,
 * porque promete um recorte que não existe. PENDÊNCIA NOMEADA (livros-por-ug), cruzada com o
 * censo de UG de `8dd0c3c` — os dois documentos apontam um para o outro.
 */

/** O client OU uma transação dele — os livros são leitura, servem aos dois. */
export type Leitor = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/**
 * ⚠️ O CORTE DOS LIVROS É POR `dataTransacao` — a data do FATO.
 *
 * Não é `criadoEm` (o instante da digitação). Um Diário que ordenasse pela digitação mostraria
 * o lançamento de 2 de março ANTES do de 1º de março se este tivesse sido digitado depois — e
 * um livro contábil conta a história dos FATOS, na ordem em que aconteceram. É a mesma escolha
 * do travamento (M16) e dos balanços. O `criadoEm` entra só como DESEMPATE de dois fatos do
 * mesmo dia (ver `diario`).
 */
const CAMPO_DATA: CampoDeCorte = "dataTransacao";

/**
 * O filtro de natureza PADRÃO dos livros: NORMAL + os nulos (que se leem NORMAL).
 *
 * ⚠️ O balancete PRÉ-encerramento e o PÓS-encerramento são livros DIFERENTES, e quem escolhe é
 * o LEITOR — não o código. O default exclui o ENCERRAMENTO (o balancete de verificação corrente,
 * antes da apuração); passar `naturezaLancamento: "TODAS"` inclui os lançamentos de encerramento
 * (o balancete final, com as classes 3/4 já zeradas). É a lição do M08: "excluir o encerramento"
 * é uma frase que só faz sentido para o ENCERRAMENTO DESTE exercício — e por isso é uma ESCOLHA,
 * não um default silencioso.
 */
export type EscolhaDeNatureza = "NORMAL" | "TODAS";

function filtroNatureza(escolha: EscolhaDeNatureza): FiltroDeNatureza | undefined {
  // "TODAS" = sem filtro (o encerramento entra). "NORMAL" = exclui ENCERRAMENTO (nulos ficam).
  return escolha === "TODAS"
    ? undefined
    : { excluir: ["ENCERRAMENTO"] satisfies readonly NaturezaLancamento[] };
}

/** Um instante ANTES de `desde` — para o "saldo anterior" (corte exclusivo no início). */
function umInstanteAntes(desde: Date): Date {
  return new Date(desde.getTime() - 1);
}

// ═══════════════════════════════════════════════════════════════════════════
// 1) O DIÁRIO — lançamentos em ordem cronológica ESTÁVEL (TR 5.92)
// ═══════════════════════════════════════════════════════════════════════════

export interface PartidaDoDiario {
  readonly conta: string;
  readonly tipo: "DEBITO" | "CREDITO";
  readonly subsistema: "ORCAMENTARIO" | "PATRIMONIAL" | "CONTROLE";
  readonly valor: string;
}

export interface LancamentoDoDiario {
  readonly id: string;
  readonly numeroControle: string;
  readonly data: Date;
  readonly historico: string;
  readonly origemTipo: string;
  /**
   * ⚠️ O `origemId` — a AMARRA do lançamento ao DOCUMENTO que o gerou (aditivo).
   *
   * `origemTipo` sozinho diz a ESPÉCIE do fato ("EMPENHO"), nunca QUAL empenho. Sem o id, o
   * Diário é um livro que afirma sem permitir conferir: quem audita lê "empenho" e não tem como
   * chegar à Nota de Empenho. A coluna já existe e é INDEXADA no `LancamentoContabil` — o que
   * faltava era expô-la. É `string` opaca de propósito: o tipo do documento varia com a espécie,
   * e resolver a rota é papel de quem apresenta, não do livro.
   *
   * ⚠️ É `| null` PORQUE A COLUNA É OPCIONAL no schema — há lançamento sem documento externo (o
   * manual, o de encerramento). Devolver `""` no lugar do nulo faria a tela oferecer um link
   * para lugar nenhum; o nulo obriga quem apresenta a decidir o que fazer com a ausência.
   */
  readonly origemId: string | null;
  readonly natureza: NaturezaLancamento;
  readonly criadoPor: string;
  readonly partidas: readonly PartidaDoDiario[];
}

export interface FiltrosDoDiario {
  /** Só lançamentos com partida NESTA conta (código exato). TR 5.94. */
  readonly conta?: string;
  readonly subsistema?: "ORCAMENTARIO" | "PATRIMONIAL" | "CONTROLE";
  readonly origemTipo?: string;
  readonly natureza?: EscolhaDeNatureza;
}

/**
 * O DIÁRIO — todo lançamento da janela, em ORDEM CRONOLÓGICA ESTÁVEL.
 *
 * ⚠️ A ORDEM É `(dataTransacao, criadoEm, id)`, E ELA É REPRODUZÍVEL (0(a) do passo 0). A data
 * do fato governa; dois fatos do MESMO dia desempatam pela ordem real de registro (`criadoEm`);
 * e o `id` (único) é o desempate final — de modo que a auditoria reproduz o livro byte a byte
 * amanhã. Um livro sem ordem estável não é um livro: é um relatório que muda de forma a cada
 * consulta.
 *
 * ⚠️ OS FILTROS COMPÕEM O `where` — zero pós-filtro em JS onde o SQL alcança (5.94). Filtrar por
 * conta em memória traria o razão inteiro do banco para descartar 99% dele.
 */
export async function diario(
  leitor: Leitor,
  janela: { readonly desde: Date; readonly ate: Date },
  filtros: FiltrosDoDiario = {}
): Promise<readonly LancamentoDoDiario[]> {
  const escolha = filtros.natureza ?? "NORMAL";
  const fn = filtroNatureza(escolha);

  // O filtro de natureza sobre o LANÇAMENTO (mesma semântica de três valores do `somasPorConta`:
  // excluir ENCERRAMENTO NÃO exclui os nulos, que são NORMAL).
  const whereNatureza =
    fn === undefined
      ? {}
      : { OR: [{ natureza: null }, { natureza: { notIn: ["ENCERRAMENTO" as const] } }] };

  const lancamentos = await leitor.lancamentoContabil.findMany({
    where: {
      dataTransacao: { gte: janela.desde, lte: janela.ate },
      ...whereNatureza,
      ...(filtros.origemTipo !== undefined ? { origemTipo: filtros.origemTipo } : {}),
      // TR 5.94 — recorte por CONTA e por SUBSISTEMA: "tem ao menos uma partida que..."
      ...(filtros.conta !== undefined || filtros.subsistema !== undefined
        ? {
            partidas: {
              some: {
                ...(filtros.conta !== undefined ? { conta: { codigo: filtros.conta } } : {}),
                ...(filtros.subsistema !== undefined ? { subsistema: filtros.subsistema } : {}),
              },
            },
          }
        : {}),
    },
    // ⚠️ A ORDEM ESTÁVEL — os três critérios, nesta ordem.
    orderBy: [{ dataTransacao: "asc" }, { criadoEm: "asc" }, { id: "asc" }],
    select: {
      id: true,
      numeroControle: true,
      dataTransacao: true,
      historico: true,
      origemTipo: true,
      // Aditivo: o id do documento de origem, para o drill. Coluna já indexada — custo zero.
      origemId: true,
      natureza: true,
      criadoPor: true,
      partidas: {
        // dentro do lançamento, ordem estável também: débitos e créditos por conta.
        orderBy: [{ tipo: "asc" }, { id: "asc" }],
        select: {
          tipo: true,
          subsistema: true,
          valor: true,
          conta: { select: { codigo: true } },
        },
      },
    },
  });

  return lancamentos.map((l) => ({
    id: l.id,
    numeroControle: l.numeroControle,
    data: l.dataTransacao,
    historico: l.historico,
    origemTipo: l.origemTipo,
    origemId: l.origemId,
    natureza: l.natureza ?? "NORMAL", // nulo lê-se NORMAL
    criadoPor: l.criadoPor,
    partidas: l.partidas.map((p) => ({
      conta: p.conta.codigo,
      tipo: p.tipo,
      subsistema: p.subsistema,
      valor: p.valor.toFixed(2),
    })),
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// 2) O RAZÃO ANALÍTICO — uma conta, com SALDO CORRENTE por linha (TR 5.93)
// ═══════════════════════════════════════════════════════════════════════════

export interface LinhaDoRazao {
  readonly lancamentoId: string;
  readonly data: Date;
  readonly numeroControle: string;
  readonly historico: string;
  readonly debito: string;
  readonly credito: string;
  /** ⚠️ O SALDO CORRENTE — acumulado ATÉ esta linha (inclusive). L1 confere a última. */
  readonly saldoCorrente: string;
}

export interface RazaoAnalitico {
  readonly conta: string;
  /** O saldo ANTES da janela (corte exclusivo no início — padrão beginning da MSC). */
  readonly saldoAnterior: string;
  readonly linhas: readonly LinhaDoRazao[];
  readonly saldoFinal: string;
}

/**
 * O RAZÃO de UMA conta: saldo anterior, cada movimento com saldo corrente, saldo final.
 *
 * ═══ ⚠️ O SALDO CORRENTE É `ΣD − ΣC` ACUMULADO — o saldo BRUTO do razão, não o "com natureza" ═══
 * O Razão mostra o saldo como ele CORRE na conta: débitos somam, créditos subtraem, linha a
 * linha. Uma conta credora (uma VPA) terá saldo corrente NEGATIVO — e está certo: é o saldo
 * bruto, e quem quer o saldo "positivo na natureza" é o Balanço, não o Razão. O importante é a
 * CONTINUIDADE: cada linha é a anterior mais o movimento dela, e a última fecha com o corte.
 *
 * ═══ L1, AUTO-EXECUTÁVEL ═══
 * A última linha do saldo corrente TEM de ser igual a `saldoAnterior + Σmovimentos` — e este é o
 * `saldoDaConta` no corte final (ΣD−ΣC acumulado até `ate`). O teste t2 exercita L1 contra
 * células manuais, e prova que OMITIR uma linha a quebra.
 */
export async function razaoAnalitico(
  leitor: Leitor,
  contaCodigo: string,
  janela: { readonly desde: Date; readonly ate: Date },
  filtros: { readonly natureza?: EscolhaDeNatureza } = {}
): Promise<RazaoAnalitico> {
  const escolha = filtros.natureza ?? "NORMAL";
  const fn = filtroNatureza(escolha);
  const natArg = fn !== undefined ? { natureza: fn } : {};

  // ── SALDO ANTERIOR: ΣD − ΣC de TUDO antes de `desde` (corte exclusivo). ──
  const somasAntes = await somasPorConta(leitor, {
    codigos: [contaCodigo],
    ate: umInstanteAntes(janela.desde),
    campoData: CAMPO_DATA,
    ...natArg,
  });
  const saldoAnterior = somasAntes.reduce(
    (acc, s) => toMoney(acc.plus(s.debito).minus(s.credito)),
    toMoney("0.00")
  );

  // ── OS MOVIMENTOS DA JANELA, por lançamento (grão fino do M01). ──
  const somasJanela = await somasPorContaELancamento(leitor, {
    codigos: [contaCodigo],
    desde: janela.desde,
    ate: janela.ate,
    campoData: CAMPO_DATA,
    ...natArg,
  });

  // Preciso da data/histórico/número de cada lançamento — leitura pura, ordem estável.
  const ids = somasJanela.map((s) => s.lancamentoId);
  const cabecalhos =
    ids.length === 0
      ? []
      : await leitor.lancamentoContabil.findMany({
          where: { id: { in: ids } },
          orderBy: [{ dataTransacao: "asc" }, { criadoEm: "asc" }, { id: "asc" }],
          select: {
            id: true,
            dataTransacao: true,
            numeroControle: true,
            historico: true,
          },
        });

  const somaPorId = new Map(somasJanela.map((s) => [s.lancamentoId, s]));

  // ⚠️ O SALDO CORRENTE ACUMULA NA ORDEM DO LIVRO — os cabeçalhos já vêm ordenados.
  let corrente = saldoAnterior;
  const linhas: LinhaDoRazao[] = cabecalhos.map((c) => {
    const s = somaPorId.get(c.id)!;
    corrente = toMoney(corrente.plus(s.debito).minus(s.credito));
    return {
      lancamentoId: c.id,
      data: c.dataTransacao,
      numeroControle: c.numeroControle,
      historico: c.historico,
      debito: s.debito.toFixed(2),
      credito: s.credito.toFixed(2),
      saldoCorrente: corrente.toFixed(2),
    };
  });

  return {
    conta: contaCodigo,
    saldoAnterior: saldoAnterior.toFixed(2),
    linhas,
    saldoFinal: corrente.toFixed(2),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3) O BALANCETE DE VERIFICAÇÃO — saldos e somas por conta (TR 5.94)
// ═══════════════════════════════════════════════════════════════════════════

export interface LinhaDoBalancete {
  readonly conta: string;
  /** `true` = sintética (Σ das analíticas sob o prefixo). `false` = analítica. */
  readonly sintetica: boolean;
  readonly saldoAnteriorDevedor: string;
  readonly saldoAnteriorCredor: string;
  readonly movimentoDebito: string;
  readonly movimentoCredito: string;
  readonly saldoFinalDevedor: string;
  readonly saldoFinalCredor: string;
}

export interface Balancete {
  readonly linhas: readonly LinhaDoBalancete[];
  /** Os totais gerais — L3 exige que devedor == credor em cada coluna de saldo. */
  readonly totalSaldoAnteriorDevedor: string;
  readonly totalSaldoAnteriorCredor: string;
  readonly totalMovimentoDebito: string;
  readonly totalMovimentoCredito: string;
  readonly totalSaldoFinalDevedor: string;
  readonly totalSaldoFinalCredor: string;
  /** ⚠️ L3: o balancete FECHA (todas as colunas batem) — ou nomeia a diferença. */
  readonly fecha: boolean;
}

/** Parte um saldo ΣD−ΣC líquido nas colunas devedora/credora. */
function colunas(liquido: Money): { devedor: Money; credor: Money } {
  return liquido.greaterThanOrEqualTo(0)
    ? { devedor: toMoney(liquido), credor: toMoney("0.00") }
    : { devedor: toMoney("0.00"), credor: toMoney(liquido.negated()) };
}

/**
 * O BALANCETE — por conta: saldo anterior, ΣD e ΣC do período, saldo final. Forma clássica do
 * balancete de verificação (art. 50 da LRF).
 *
 * ═══ ⚠️ `modo` — ANALÍTICO ou SINTÉTICO, e a diferença é a L2 ═══
 *   · ANALÍTICO: uma linha por conta que TEM movimento (as folhas do plano).
 *   · SINTÉTICO: as sintéticas, cada uma == Σ das analíticas sob o prefixo dela (L2 — a A3 do
 *     Anexo 14 generalizada). O balancete sintético NUNCA lê partida em conta sintética: elas
 *     não recebem partida (guard do M01), e a soma é sempre das FOLHAS. Ver 0(c) do passo 0.
 *
 * ═══ L3 — O BALANCETE FECHA ═══
 * Σ dos saldos devedores == Σ dos saldos credores. É a equação fundamental (todo lançamento tem
 * ΣD == ΣC), e o balancete de verificação existe justamente para PROVÁ-la. Se não fechar, `fecha`
 * vem `false` — o balancete NÃO esconde a diferença, ele a NOMEIA.
 */
export async function balancete(
  leitor: Leitor,
  p: {
    readonly desde: Date;
    readonly ate: Date;
    readonly modo: "ANALITICO" | "SINTETICO";
    readonly natureza?: EscolhaDeNatureza;
  }
): Promise<Balancete> {
  const escolha = p.natureza ?? "NORMAL";
  const fn = filtroNatureza(escolha);
  const natArg = fn !== undefined ? { natureza: fn } : {};

  // As três fotos do razão, todas do MESMO `somasPorConta`:
  const [somasAntes, somasAcum, somasPeriodo] = await Promise.all([
    somasPorConta(leitor, { ate: umInstanteAntes(p.desde), campoData: CAMPO_DATA, ...natArg }),
    somasPorConta(leitor, { ate: p.ate, campoData: CAMPO_DATA, ...natArg }),
    somasPorConta(leitor, { desde: p.desde, ate: p.ate, campoData: CAMPO_DATA, ...natArg }),
  ]);

  const liquidoAntes = new Map(
    somasAntes.map((s) => [s.codigo, toMoney(s.debito.minus(s.credito))])
  );
  const liquidoAcum = new Map(
    somasAcum.map((s) => [s.codigo, toMoney(s.debito.minus(s.credito))])
  );
  const periodo = new Map(
    somasPeriodo.map((s) => [s.codigo, { debito: s.debito, credito: s.credito }])
  );

  // ── O universo de contas ANALÍTICAS: toda conta que aparece em qualquer foto. ──
  const codigosAnaliticos = new Set<string>([
    ...liquidoAntes.keys(),
    ...liquidoAcum.keys(),
    ...periodo.keys(),
  ]);

  const linhaDe = (
    conta: string,
    sintetica: boolean,
    antes: Money,
    acum: Money,
    movD: Money,
    movC: Money
  ): LinhaDoBalancete => {
    const ca = colunas(antes);
    const cf = colunas(acum);
    return {
      conta,
      sintetica,
      saldoAnteriorDevedor: ca.devedor.toFixed(2),
      saldoAnteriorCredor: ca.credor.toFixed(2),
      movimentoDebito: movD.toFixed(2),
      movimentoCredito: movC.toFixed(2),
      saldoFinalDevedor: cf.devedor.toFixed(2),
      saldoFinalCredor: cf.credor.toFixed(2),
    };
  };

  let linhas: LinhaDoBalancete[];

  if (p.modo === "ANALITICO") {
    linhas = [...codigosAnaliticos]
      .sort((a, b) => a.localeCompare(b))
      .map((c) =>
        linhaDe(
          c,
          false,
          liquidoAntes.get(c) ?? toMoney("0.00"),
          liquidoAcum.get(c) ?? toMoney("0.00"),
          periodo.get(c)?.debito ?? toMoney("0.00"),
          periodo.get(c)?.credito ?? toMoney("0.00")
        )
      );
  } else {
    // ── SINTÉTICO: as contas SINTÉTICAS do plano, cada uma = Σ das analíticas sob o prefixo. ──
    const sinteticas = await leitor.contaPcasp.findMany({
      where: { analitica: false },
      select: { codigo: true },
      orderBy: { codigo: "asc" },
    });

    // Uma analítica "c" cai sob a sintética "s" se c COMEÇA com o prefixo de s. O prefixo é o
    // código da sintética sem os grupos zerados à direita (ex.: "1.1.1.0.0.00.00" → "1.1.1.").
    const prefixoDe = (codigoSintetico: string): string => {
      // remove os segmentos ".0"/".00" finais e deixa o ponto separador
      const semZeros = codigoSintetico.replace(/(\.0+)+$/, "");
      return semZeros + ".";
    };

    linhas = sinteticas.map((s) => {
      const pref = prefixoDe(s.codigo);
      let antes = toMoney("0.00");
      let acum = toMoney("0.00");
      let movD = toMoney("0.00");
      let movC = toMoney("0.00");
      for (const c of codigosAnaliticos) {
        if (!c.startsWith(pref)) continue;
        antes = toMoney(antes.plus(liquidoAntes.get(c) ?? toMoney("0.00")));
        acum = toMoney(acum.plus(liquidoAcum.get(c) ?? toMoney("0.00")));
        movD = toMoney(movD.plus(periodo.get(c)?.debito ?? toMoney("0.00")));
        movC = toMoney(movC.plus(periodo.get(c)?.credito ?? toMoney("0.00")));
      }
      return linhaDe(s.codigo, true, antes, acum, movD, movC);
    });
  }

  // ── OS TOTAIS + L3 ──
  const soma = (sel: (l: LinhaDoBalancete) => string): Money =>
    linhas.reduce((acc, l) => toMoney(acc.plus(toMoney(sel(l)))), toMoney("0.00"));

  const totalSaldoAnteriorDevedor = soma((l) => l.saldoAnteriorDevedor);
  const totalSaldoAnteriorCredor = soma((l) => l.saldoAnteriorCredor);
  const totalMovimentoDebito = soma((l) => l.movimentoDebito);
  const totalMovimentoCredito = soma((l) => l.movimentoCredito);
  const totalSaldoFinalDevedor = soma((l) => l.saldoFinalDevedor);
  const totalSaldoFinalCredor = soma((l) => l.saldoFinalCredor);

  const fecha =
    totalSaldoAnteriorDevedor.equals(totalSaldoAnteriorCredor) &&
    totalMovimentoDebito.equals(totalMovimentoCredito) &&
    totalSaldoFinalDevedor.equals(totalSaldoFinalCredor);

  return {
    linhas,
    totalSaldoAnteriorDevedor: totalSaldoAnteriorDevedor.toFixed(2),
    totalSaldoAnteriorCredor: totalSaldoAnteriorCredor.toFixed(2),
    totalMovimentoDebito: totalMovimentoDebito.toFixed(2),
    totalMovimentoCredito: totalMovimentoCredito.toFixed(2),
    totalSaldoFinalDevedor: totalSaldoFinalDevedor.toFixed(2),
    totalSaldoFinalCredor: totalSaldoFinalCredor.toFixed(2),
    fecha,
  };
}
