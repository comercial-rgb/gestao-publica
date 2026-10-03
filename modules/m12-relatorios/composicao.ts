import { toMoney, type Money } from "../../packages/contracts/index.js";
import { somaLiquidaEstornaveis } from "../../packages/estornaveis/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { categoriaDaReceita, sinalDaReceitaRealizada } from "../m04-receita/dominio.js";
import { parcelasDaGuia } from "../m04-receita/parcelas-por-fonte.js";
import { classificarReceitaDfc } from "./dominio-dfc.js";

/**
 * V33 — A COMPOSIÇÃO DAS LINHAS DO BALANÇO FINANCEIRO, DO ORÇAMENTÁRIO E DA DFC. LEITURA PURA.
 *
 * ═══ POR QUE ESTE ARQUIVO É A BASE DOS TRÊS MOTORES, E NÃO UMA CONSULTA AO LADO DELES ═══
 * A pergunta do contador é "de que documentos é feito este número?". Uma tela que respondesse
 * com uma consulta própria seria a SEGUNDA aritmética da demonstração — e no dia em que um dos
 * dois mudasse o filtro (a janela do encerramento, o sinal da anulação, a parcial viva), a
 * composição mostraria documentos que somam outro número, com a mesma cara de certeza.
 *
 * Por isso as LINHAS DOCUMENTO A DOCUMENTO moram aqui e os motores SOMAM a partir delas:
 *   - `parcelasDaReceitaRealizada` — guia × fonte, com sinal. O Anexo 13 soma por fonte, o
 *     Anexo 12 por categoria e origem, a DFC pela origem da classificação dela.
 *   - `movimentosDeEmpenho` — cada movimento EMPENHO/EMPENHO_ANULADO da dotação, com o empenho
 *     a que pertence. O Anexo 13 soma por fonte.
 *   - `execucaoPorEmpenho` — liquidado e pago de cada empenho pela régua única dos estornáveis.
 *     O Anexo 12 soma por ficha.
 *   - `restosPagosNaJanela` — cada pagamento (e estorno) de restos a pagar de exercício
 *     anterior. A DFC soma por grupo.
 * A composição filtra as MESMAS linhas; o total dela é a linha da demonstração por construção, e
 * a porta ainda confere os dois (`confere`) — se um dia divergirem, a tela diz, em vez de calar.
 */

// ═══════════════════════════════════════════════════════════════════════════
// A JANELA — a mesma dos três motores: (encerramento anterior, encerramento deste]
// ═══════════════════════════════════════════════════════════════════════════

export interface JanelaDoExercicio {
  /** Encerramento do exercício anterior; `null` = não há exercício anterior encerrado. */
  readonly inicio: Date | null;
  /** Encerramento deste exercício; `null` = exercício aberto (posição parcial). */
  readonly corte: Date | null;
}

export async function janelaDoExercicio(prisma: PrismaClient, exercicio: number): Promise<JanelaDoExercicio> {
  const [ex, anterior] = await Promise.all([
    prisma.exercicio.findUnique({ where: { ano: exercicio }, select: { encerramento: { select: { criadoEm: true } } } }),
    prisma.exercicio.findUnique({ where: { ano: exercicio - 1 }, select: { encerramento: { select: { criadoEm: true } } } }),
  ]);
  if (ex === null) throw new Error(`Exercício ${exercicio} não existe — não há composição a mostrar.`);
  return { inicio: anterior?.encerramento?.criadoEm ?? null, corte: ex.encerramento?.criadoEm ?? null };
}

// ═══════════════════════════════════════════════════════════════════════════
// RECEITA REALIZADA — uma linha por guia × fonte
// ═══════════════════════════════════════════════════════════════════════════

export interface ParcelaDeReceita {
  readonly receitaId: string;
  readonly numero: string;
  readonly tipo: "ARRECADACAO" | "ANULACAO";
  readonly data: Date;
  readonly naturezaCodigo: string;
  readonly naturezaDescricao: string;
  readonly fonteCodigo: string;
  readonly fonteDescricao: string;
  /** COM SINAL: a anulação entra negativa. */
  readonly valor: Money;
}

/**
 * Filtro dos três motores: `exercicio` da guia e `criadoEm <= corte`. A guia repartida entre
 * fontes vira uma linha por parcela (`parcelasDaGuia`, fail-closed na soma); a soma das parcelas
 * é o valor da guia, então somar por natureza dá o mesmo que somar as guias inteiras.
 */
export async function parcelasDaReceitaRealizada(
  prisma: PrismaClient,
  exercicio: number,
  corte: Date | null
): Promise<readonly ParcelaDeReceita[]> {
  const guias = await prisma.receitaArrecadada.findMany({
    where: { exercicio, ...(corte !== null ? { criadoEm: { lte: corte } } : {}) },
    select: {
      id: true,
      tipo: true,
      numeroReceita: true,
      dataArrecadacao: true,
      fonteId: true,
      exercicioFonte: true,
      valor: true,
      naturezaReceita: { select: { codigo: true, descricao: true } },
      fonte: { select: { codigo: true, descricao: true } },
      distribuicao: {
        select: { fonteId: true, exercicioFonte: true, valor: true, fonte: { select: { codigo: true, descricao: true } } },
      },
    },
    orderBy: [{ dataArrecadacao: "asc" }, { numeroReceita: "asc" }],
  });

  const linhas: ParcelaDeReceita[] = [];
  for (const g of guias) {
    // RETIFICACAO não tem sinal definido e derruba — a mesma recusa dos três motores.
    const sinal = sinalDaReceitaRealizada(g.tipo);
    // O rótulo de cada fonte vem do cadastro dela, não da fonte padrão da guia.
    const fonteDe = new Map<string, { codigo: string; descricao: string }>([
      [g.fonteId, g.fonte],
      ...g.distribuicao.map((d) => [d.fonteId, d.fonte] as [string, { codigo: string; descricao: string }]),
    ]);
    for (const p of parcelasDaGuia({ ...g, numeroReceita: g.numeroReceita })) {
      const fonte = fonteDe.get(p.fonteId)!;
      linhas.push({
        receitaId: g.id,
        numero: g.numeroReceita,
        tipo: g.tipo === "ANULACAO" ? "ANULACAO" : "ARRECADACAO",
        data: g.dataArrecadacao,
        naturezaCodigo: g.naturezaReceita.codigo,
        naturezaDescricao: g.naturezaReceita.descricao,
        fonteCodigo: fonte.codigo,
        fonteDescricao: fonte.descricao,
        valor: sinal === 1 ? p.valor : toMoney(p.valor.negated()),
      });
    }
  }
  return linhas;
}

// ═══════════════════════════════════════════════════════════════════════════
// EMPENHADO — uma linha por movimento da dotação, com o empenho a que pertence
// ═══════════════════════════════════════════════════════════════════════════

export interface MovimentoDeEmpenho {
  readonly movimentoId: string;
  readonly fichaId: string;
  readonly fonteCodigo: string;
  readonly fonteDescricao: string;
  readonly codCategoria: string;
  readonly codGrupo: string;
  readonly tipo: "EMPENHO" | "EMPENHO_ANULADO";
  readonly criadoEm: Date;
  /** COM SINAL: EMPENHO_ANULADO entra negativo. */
  readonly valor: Money;
  /**
   * O empenho ORIGINAL a que o movimento pertence (a anulação, a parcial e o estorno da parcial
   * são linhas próprias que apontam para ele). `null` quando o movimento não aponta para um
   * empenho — ele continua somado, e a composição o mostra como tal, em vez de sumir com ele.
   */
  readonly empenhoId: string | null;
}

export async function movimentosDeEmpenho(
  prisma: PrismaClient,
  exercicio: number,
  corte: Date | null
): Promise<readonly MovimentoDeEmpenho[]> {
  const movimentos = await prisma.movimentoDotacao.findMany({
    where: {
      tipo: { in: ["EMPENHO", "EMPENHO_ANULADO"] },
      ficha: { exercicio },
      ...(corte !== null ? { criadoEm: { lte: corte } } : {}),
    },
    select: {
      id: true,
      fichaId: true,
      tipo: true,
      valor: true,
      criadoEm: true,
      origemId: true,
      ficha: {
        select: {
          fonte: { select: { codigo: true, descricao: true } },
          naturezaDespesa: { select: { codCategoria: true, codNatureza: true } },
        },
      },
    },
    orderBy: { criadoEm: "asc" },
  });

  const original = await originaisDosEmpenhos(
    prisma,
    movimentos.map((m) => m.origemId).filter((x): x is string => x !== null)
  );

  return movimentos.map((m) => {
    const v = toMoney(m.valor.toFixed(2));
    return {
      movimentoId: m.id,
      fichaId: m.fichaId,
      fonteCodigo: m.ficha.fonte.codigo,
      fonteDescricao: m.ficha.fonte.descricao,
      codCategoria: m.ficha.naturezaDespesa.codCategoria,
      codGrupo: m.ficha.naturezaDespesa.codNatureza,
      tipo: m.tipo === "EMPENHO" ? "EMPENHO" : "EMPENHO_ANULADO",
      criadoEm: m.criadoEm,
      valor: m.tipo === "EMPENHO" ? v : toMoney(v.negated()),
      empenhoId: m.origemId === null ? null : (original.get(m.origemId) ?? null),
    };
  });
}

/**
 * De cada linha de empenho, o ORIGINAL: a anulação total e a parcial apontam para ele; o estorno
 * de uma parcial aponta para a parcial. Sobe até a linha que não aponta para ninguém. Um id que
 * não é empenho não entra no mapa.
 */
async function originaisDosEmpenhos(prisma: PrismaClient, ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
  const pai = new Map<string, string | null>();
  let pendentes = [...new Set(ids)];
  // Três níveis bastam (estorno → parcial → original); o limite impede laço em dado torto.
  for (let nivel = 0; nivel < 4 && pendentes.length > 0; nivel++) {
    const linhas = await prisma.empenho.findMany({
      where: { id: { in: pendentes } },
      select: { id: true, estornoDeId: true, anulacaoParcialDeId: true },
    });
    pendentes = [];
    for (const l of linhas) {
      const acima = l.estornoDeId ?? l.anulacaoParcialDeId ?? null;
      pai.set(l.id, acima);
      if (acima !== null && !pai.has(acima)) pendentes.push(acima);
    }
  }
  const raiz = (id: string): string | null => {
    let atual = id;
    for (let i = 0; i < 5; i++) {
      if (!pai.has(atual)) return null;
      const acima = pai.get(atual)!;
      if (acima === null) return atual;
      atual = acima;
    }
    return null;
  };
  const mapa = new Map<string, string>();
  for (const id of ids) {
    const r = raiz(id);
    if (r !== null) mapa.set(id, r);
  }
  return mapa;
}

// ═══════════════════════════════════════════════════════════════════════════
// LIQUIDADO E PAGO — por empenho, pela régua única dos estornáveis
// ═══════════════════════════════════════════════════════════════════════════

export interface ExecucaoDoEmpenho {
  readonly empenhoId: string;
  readonly fichaId: string;
  readonly liquidado: Money;
  /** PELO BRUTO: a despesa executada é o valor cheio; o líquido é assunto do Anexo 13. */
  readonly pago: Money;
}

/**
 * CORTE nas duas pontas: liquidação de RPNP e pagamento de RP acontecem DEPOIS do encerramento —
 * são execução de restos a pagar, não despesa deste exercício (sem o corte, o mesmo dinheiro
 * apareceria no pago do exercício E no quadro de restos).
 */
export async function execucaoPorEmpenho(
  prisma: PrismaClient,
  fichaIds: readonly string[],
  corte: Date | null
): Promise<readonly ExecucaoDoEmpenho[]> {
  if (fichaIds.length === 0) return [];
  const empenhos = await prisma.empenho.findMany({
    where: { fichaId: { in: [...fichaIds] } },
    select: { id: true, fichaId: true },
  });
  const liquidacoes = await prisma.liquidacao.findMany({
    where: { empenhoId: { in: empenhos.map((e) => e.id) }, ...(corte !== null ? { criadoEm: { lte: corte } } : {}) },
    select: { id: true, empenhoId: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true },
  });
  const pagamentos = await prisma.pagamento.findMany({
    where: { liquidacaoId: { in: liquidacoes.map((l) => l.id) }, ...(corte !== null ? { criadoEm: { lte: corte } } : {}) },
    select: { id: true, liquidacaoId: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true },
  });

  type Linha = { id: string; valor: { toFixed(n: number): string }; estornoDeId: string | null; anulacaoParcialDeId: string | null };
  const somaLiquida = (linhas: readonly Linha[]): Money =>
    somaLiquidaEstornaveis(
      linhas.map((l) => ({ id: l.id, valor: toMoney(l.valor.toFixed(2)), estornoDeId: l.estornoDeId, anulacaoParcialDeId: l.anulacaoParcialDeId }))
    );
  const agrupar = <T extends Linha>(linhas: readonly T[], chave: (l: T) => string): Map<string, T[]> => {
    const m = new Map<string, T[]>();
    for (const l of linhas) m.set(chave(l), [...(m.get(chave(l)) ?? []), l]);
    return m;
  };

  const liquidacaoDoEmpenho = new Map(liquidacoes.map((l) => [l.id, l.empenhoId]));
  const liquidadoPor = new Map<string, Money>();
  for (const [empenhoId, lista] of agrupar(liquidacoes, (l) => l.empenhoId)) liquidadoPor.set(empenhoId, somaLiquida(lista));
  const pagoPor = new Map<string, Money>();
  for (const [liquidacaoId, lista] of agrupar(pagamentos, (p) => p.liquidacaoId)) {
    const empenhoId = liquidacaoDoEmpenho.get(liquidacaoId)!;
    pagoPor.set(empenhoId, toMoney((pagoPor.get(empenhoId) ?? toMoney("0.00")).plus(somaLiquida(lista))));
  }

  return empenhos
    .filter((e) => liquidadoPor.has(e.id) || pagoPor.has(e.id))
    .map((e) => ({
      empenhoId: e.id,
      fichaId: e.fichaId,
      liquidado: liquidadoPor.get(e.id) ?? toMoney("0.00"),
      pago: pagoPor.get(e.id) ?? toMoney("0.00"),
    }));
}

// ═══════════════════════════════════════════════════════════════════════════
// RESTOS A PAGAR PAGOS NA JANELA — uma linha por movimento
// ═══════════════════════════════════════════════════════════════════════════

export interface RestoPagoNaJanela {
  readonly movimentoId: string;
  readonly empenhoId: string;
  readonly tipoInscricao: "PROCESSADO" | "NAO_PROCESSADO";
  readonly codCategoria: string;
  readonly codGrupo: string;
  readonly criadoEm: Date;
  /** COM SINAL: o estorno do pagamento devolve. */
  readonly valor: Money;
}

/** `(inicio, fim]` — limites nulos são "sem limite". A régua do Anexo 13. */
export function naJanela(quando: Date, inicio: Date | null, fim: Date | null): boolean {
  if (inicio !== null && quando <= inicio) return false;
  if (fim !== null && quando > fim) return false;
  return true;
}

/** Pagamentos, DENTRO da janela, de restos a pagar inscritos em exercícios ANTERIORES. */
export async function restosPagosNaJanela(
  prisma: PrismaClient,
  exercicio: number,
  inicio: Date | null,
  corte: Date | null
): Promise<readonly RestoPagoNaJanela[]> {
  const movimentos = await prisma.movimentoRestosAPagar.findMany({
    where: { tipo: { in: ["PAGAMENTO", "ESTORNO_PAGAMENTO"] }, inscricao: { exercicioOrigem: { lt: exercicio } } },
    select: {
      id: true,
      tipo: true,
      valor: true,
      criadoEm: true,
      inscricao: {
        select: {
          tipo: true,
          empenhoId: true,
          empenho: { select: { ficha: { select: { naturezaDespesa: { select: { codCategoria: true, codNatureza: true } } } } } },
        },
      },
    },
    orderBy: { criadoEm: "asc" },
  });
  return movimentos
    .filter((m) => naJanela(m.criadoEm, inicio, corte))
    .map((m) => {
      const v = toMoney(m.valor.toFixed(2));
      const nd = m.inscricao.empenho.ficha.naturezaDespesa;
      return {
        movimentoId: m.id,
        empenhoId: m.inscricao.empenhoId,
        tipoInscricao: m.inscricao.tipo === "NAO_PROCESSADO" ? "NAO_PROCESSADO" : "PROCESSADO",
        codCategoria: nd.codCategoria,
        codGrupo: nd.codNatureza,
        criadoEm: m.criadoEm,
        valor: m.tipo === "PAGAMENTO" ? v : toMoney(v.negated()),
      };
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// A COMPOSIÇÃO — o que a tela pede
// ═══════════════════════════════════════════════════════════════════════════

/** Que linha se quer abrir. Os códigos são os da própria demonstração. */
export type LinhaPedida =
  /** Anexo 13, ingressos orçamentários, linha da fonte. */
  | { readonly tipo: "BF_RECEITA"; readonly fonte: string }
  /** Anexo 13, dispêndios orçamentários (empenhado), linha da fonte. */
  | { readonly tipo: "BF_DESPESA"; readonly fonte: string }
  /** Anexo 12, receita: categoria ("1") ou origem ("1.1"). */
  | { readonly tipo: "BO_RECEITA"; readonly codigo: string }
  /** Anexo 12, despesa: categoria ("3") ou grupo ("3.3"). */
  | { readonly tipo: "BO_DESPESA"; readonly codigo: string }
  /** DFC, ingresso de receita: a origem da classificação da DFC (`OrigemReceita`). */
  | { readonly tipo: "DFC_RECEITA"; readonly origem: string }
  /** DFC, desembolso: o grupo de natureza (pago do exercício + restos a pagar pagos). */
  | { readonly tipo: "DFC_DESPESA"; readonly grupo: string };

export interface DocumentoDaComposicao {
  readonly chave: string;
  /** Para onde o número leva. `null` quando o movimento não aponta para um documento. */
  readonly destino: { readonly tipo: "ARRECADACAO" | "EMPENHO"; readonly id: string } | null;
  readonly documento: string;
  readonly data: Date | null;
  readonly descricao: string;
  readonly classificacao: string;
  /** Uma coluna por número da linha: receita tem uma; a despesa do Anexo 12 tem três. */
  readonly valores: readonly Money[];
}

export interface Composicao {
  readonly colunas: readonly string[];
  readonly documentos: readonly DocumentoDaComposicao[];
  readonly totais: readonly Money[];
}

const zero = (): Money => toMoney("0.00");
const mais = (a: Money, b: Money): Money => toMoney(a.plus(b));

function casaCodigoDaReceita(codigoNatureza: string, codigo: string): boolean {
  return codigo.includes(".")
    ? `${codigoNatureza.charAt(0)}.${codigoNatureza.charAt(1)}` === codigo
    : categoriaDaReceita(codigoNatureza) === codigo;
}

function casaCodigoDaDespesa(codCategoria: string, codGrupo: string, codigo: string): boolean {
  return codigo.includes(".") ? `${codCategoria}.${codGrupo}` === codigo : codCategoria === codigo;
}

function origemDfc(codigoNatureza: string): string | null {
  const c = classificarReceitaDfc(codigoNatureza);
  return c.atividade === null ? null : c.origem;
}

export async function composicaoDaLinha(prisma: PrismaClient, exercicio: number, pedida: LinhaPedida): Promise<Composicao> {
  const { inicio, corte } = await janelaDoExercicio(prisma, exercicio);

  if (pedida.tipo === "BF_RECEITA" || pedida.tipo === "BO_RECEITA" || pedida.tipo === "DFC_RECEITA") {
    const parcelas = (await parcelasDaReceitaRealizada(prisma, exercicio, corte)).filter((p) =>
      pedida.tipo === "BF_RECEITA"
        ? p.fonteCodigo === pedida.fonte
        : pedida.tipo === "BO_RECEITA"
          ? casaCodigoDaReceita(p.naturezaCodigo, pedida.codigo)
          : origemDfc(p.naturezaCodigo) === pedida.origem
    );
    // Na linha por fonte, a parcela é o documento; nas por natureza, a guia inteira — somam-se
    // as parcelas da mesma guia (a guia repartida aparece uma vez, com o valor dela).
    const porGuia = new Map<string, DocumentoDaComposicao>();
    for (const p of parcelas) {
      const chave = pedida.tipo === "BF_RECEITA" ? `${p.receitaId}|${p.fonteCodigo}` : p.receitaId;
      const atual = porGuia.get(chave);
      porGuia.set(chave, {
        chave,
        destino: { tipo: "ARRECADACAO", id: p.receitaId },
        documento: p.numero,
        data: p.data,
        descricao: p.tipo === "ANULACAO" ? "Anulação de receita" : "Arrecadação",
        classificacao: pedida.tipo === "BF_RECEITA" ? `${p.naturezaCodigo} ${p.naturezaDescricao}` : `${p.naturezaCodigo} ${p.naturezaDescricao} · fonte ${p.fonteCodigo}`,
        valores: [mais(atual?.valores[0] ?? zero(), p.valor)],
      });
    }
    const documentos = [...porGuia.values()];
    return { colunas: ["Realizada"], documentos, totais: [documentos.reduce((a, d) => mais(a, d.valores[0]!), zero())] };
  }

  if (pedida.tipo === "BF_DESPESA") {
    const movimentos = (await movimentosDeEmpenho(prisma, exercicio, corte)).filter((m) => m.fonteCodigo === pedida.fonte);
    const documentos = await documentosPorEmpenho(
      prisma,
      movimentos.map((m) => ({ empenhoId: m.empenhoId, valores: [m.valor] })),
      1
    );
    return { colunas: ["Empenhada"], documentos, totais: totaisDe(documentos, 1) };
  }

  if (pedida.tipo === "BO_DESPESA") {
    const fichas = await prisma.fichaOrcamentaria.findMany({
      where: { exercicio },
      select: { id: true, naturezaDespesa: { select: { codCategoria: true, codNatureza: true } } },
    });
    const daLinha = new Set(
      fichas.filter((f) => casaCodigoDaDespesa(f.naturezaDespesa.codCategoria, f.naturezaDespesa.codNatureza, pedida.codigo)).map((f) => f.id)
    );
    const [movimentos, execucao] = await Promise.all([
      movimentosDeEmpenho(prisma, exercicio, corte),
      execucaoPorEmpenho(prisma, [...daLinha], corte),
    ]);
    const documentos = await documentosPorEmpenho(
      prisma,
      [
        ...movimentos.filter((m) => daLinha.has(m.fichaId)).map((m) => ({ empenhoId: m.empenhoId, valores: [m.valor, zero(), zero()] })),
        ...execucao.map((e) => ({ empenhoId: e.empenhoId, valores: [zero(), e.liquidado, e.pago] })),
      ],
      3
    );
    return { colunas: ["Empenhada", "Liquidada", "Paga"], documentos, totais: totaisDe(documentos, 3) };
  }

  // DFC_DESPESA: o pago do exercício (a coluna "pagas" do Anexo 12) + os restos a pagar pagos.
  const fichas = await prisma.fichaOrcamentaria.findMany({
    where: { exercicio, naturezaDespesa: { codNatureza: pedida.grupo } },
    select: { id: true },
  });
  const [execucao, restos] = await Promise.all([
    execucaoPorEmpenho(prisma, fichas.map((f) => f.id), corte),
    restosPagosNaJanela(prisma, exercicio, inicio, corte),
  ]);
  const doExercicio = await documentosPorEmpenho(
    prisma,
    execucao.filter((e) => !e.pago.isZero()).map((e) => ({ empenhoId: e.empenhoId, valores: [e.pago] })),
    1
  );
  const deRestos = (
    await documentosPorEmpenho(
      prisma,
      restos.filter((r) => r.codGrupo === pedida.grupo).map((r) => ({ empenhoId: r.empenhoId, valores: [r.valor] })),
      1
    )
  ).map((d) => ({ ...d, chave: `rp-${d.chave}`, descricao: `Restos a pagar pagos · ${d.descricao}` }));
  const documentos = [...doExercicio, ...deRestos];
  return { colunas: ["Pago"], documentos, totais: totaisDe(documentos, 1) };
}

function totaisDe(documentos: readonly DocumentoDaComposicao[], n: number): readonly Money[] {
  return Array.from({ length: n }, (_, i) => documentos.reduce((a, d) => mais(a, d.valores[i]!), zero()));
}

/** Agrupa por empenho original e põe número, data, credor e natureza de cada um. */
async function documentosPorEmpenho(
  prisma: PrismaClient,
  parcelas: readonly { readonly empenhoId: string | null; readonly valores: readonly Money[] }[],
  n: number
): Promise<readonly DocumentoDaComposicao[]> {
  const soma = new Map<string, Money[]>();
  for (const p of parcelas) {
    const chave = p.empenhoId ?? "";
    const atual = soma.get(chave) ?? Array.from({ length: n }, zero);
    soma.set(chave, atual.map((v, i) => mais(v, p.valores[i]!)));
  }
  const ids = [...soma.keys()].filter((k) => k !== "");
  const empenhos = await prisma.empenho.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      numero: true,
      data: true,
      credorCpfCnpj: true,
      ficha: { select: { numero: true, naturezaDespesa: { select: { codigoCompleto: true, descricao: true } }, fonte: { select: { codigo: true } } } },
    },
  });
  const porId = new Map(empenhos.map((e) => [e.id, e]));
  const documentos: DocumentoDaComposicao[] = [];
  for (const [chave, valores] of soma) {
    const e = chave === "" ? undefined : porId.get(chave);
    documentos.push(
      e === undefined
        ? {
            chave: chave === "" ? "sem-empenho" : chave,
            destino: null,
            documento: "—",
            data: null,
            descricao: "Movimento da dotação sem empenho identificado",
            classificacao: "",
            valores,
          }
        : {
            chave,
            destino: { tipo: "EMPENHO", id: e.id },
            documento: e.numero,
            data: e.data,
            descricao: `Empenho · credor ${e.credorCpfCnpj}`,
            classificacao: `ficha ${e.ficha.numero} · ${e.ficha.naturezaDespesa.codigoCompleto} ${e.ficha.naturezaDespesa.descricao} · fonte ${e.ficha.fonte.codigo}`,
            valores,
          }
    );
  }
  return documentos.sort((a, b) => (a.data?.getTime() ?? 0) - (b.data?.getTime() ?? 0) || a.documento.localeCompare(b.documento));
}
