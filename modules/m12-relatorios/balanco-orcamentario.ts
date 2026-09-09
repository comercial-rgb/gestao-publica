import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import {
  montarBalancoOrcamentario,
  SINAL_PREVISAO,
  sinalDaReceitaRealizada,
  type BalancoOrcamentario,
  type FatoDespesa,
  type FatoReceita,
  type FatoRestos,
  type TipoRestos,
} from "./dominio.js";

/**
 * BALANÇO ORÇAMENTÁRIO (Anexo 12) — LEITURA PURA.
 *
 * ═══ ZERO ESCRITA ═══
 * Nenhum INSERT, nenhum UPDATE, nenhuma tabela nova. Se alguma linha aqui
 * precisar gravar algo, o desenho está errado: relatório é função dos fatos.
 *
 * ═══ A VERDADE É O SUM ═══
 * NENHUMA coluna cache é lida — nem `saldoAutorizado`, nem `saldoDisponivel`, nem
 * `saldoEmpenhado`. Elas existem no M05 como CACHE derivado dos movimentos, e o
 * projeto inteiro é construído sobre "a coluna é derivada, o movimento é a
 * verdade". Ler o cache aqui inverteria o invariante — e este é o documento que
 * vai para o TCE.
 *
 * ═══ O CORTE TEMPORAL (o detalhe que mais engana) ═══
 * A despesa executada de um exercício é o que foi empenhado/liquidado/pago ATÉ o
 * ENCERRAMENTO dele. Um pagamento de RESTOS A PAGAR feito em 2027 quita um empenho
 * cuja ficha é de 2026 — sem o corte, ele entraria na despesa paga de 2026 E no
 * quadro de RP, e o mesmo dinheiro apareceria duas vezes.
 *
 * Exercício ABERTO: sem corte superior (tudo até agora), e `parcial: true`.
 */

/** Linhas append-only que podem ter um estorno apontando para elas. */
interface Estornavel {
  readonly id: string;
  readonly valor: { toFixed(n: number): string };
  readonly estornoDeId: string | null;
}

/** SUM líquido: originais vivos (menos os que foram estornados). */
function somaLiquida(linhas: readonly Estornavel[]): Money {
  const estornados = new Set(
    linhas.filter((l) => l.estornoDeId !== null).map((l) => l.estornoDeId!)
  );
  let total = toMoney("0.00");
  for (const l of linhas) {
    if (l.estornoDeId !== null) continue; // o estorno não soma; ele neutraliza
    if (estornados.has(l.id)) continue;
    total = toMoney(total.plus(toMoney(l.valor.toFixed(2))));
  }
  return total;
}

/** `criadoEm` dentro da janela `(inicio, fim]`. Limites nulos = sem limite. */
function naJanela(criadoEm: Date, inicio: Date | null, fim: Date | null): boolean {
  if (inicio !== null && criadoEm <= inicio) return false;
  if (fim !== null && criadoEm > fim) return false;
  return true;
}

export async function balancoOrcamentario(
  prisma: PrismaClient,
  exercicio: number
): Promise<BalancoOrcamentario> {
  // FAIL-CLOSED: exercício inexistente não gera relatório vazio — gera erro. Um
  // Anexo 12 zerado de um ano que não existe é pior que nenhum: parece execução.
  const ex = await prisma.exercicio.findUnique({
    where: { ano: exercicio },
    select: { ano: true, encerramento: { select: { criadoEm: true } } },
  });
  if (ex === null) {
    throw new Error(
      `Exercício ${exercicio} não existe — não há balanço orçamentário a emitir.`
    );
  }

  /** Fim da janela do exercício. `null` = exercício ABERTO (balanço parcial). */
  const corte: Date | null = ex.encerramento?.criadoEm ?? null;
  const parcial = corte === null;

  /** Início da janela = encerramento do exercício ANTERIOR. */
  const anterior = await prisma.exercicio.findUnique({
    where: { ano: exercicio - 1 },
    select: { encerramento: { select: { criadoEm: true } } },
  });
  const inicio: Date | null = anterior?.encerramento?.criadoEm ?? null;

  const [receitas, despesas, restos, saldosExerciciosAnteriores] =
    await Promise.all([
      lerReceitas(prisma, exercicio, corte),
      lerDespesas(prisma, exercicio, corte),
      lerRestos(prisma, exercicio, inicio, corte),
      lerSaldosExerciciosAnteriores(prisma, exercicio),
    ]);

  return montarBalancoOrcamentario({
    exercicio,
    parcial,
    receitas,
    despesas,
    restos,
    saldosExerciciosAnteriores,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// QUADRO 1 — receita
// ═══════════════════════════════════════════════════════════════════════════

async function lerReceitas(
  prisma: PrismaClient,
  exercicio: number,
  corte: Date | null
): Promise<readonly FatoReceita[]> {
  const previstas = await prisma.receitaPrevista.findMany({
    where: { exercicio },
    select: {
      valorPrevisto: true,
      tipoReceita: true,
      naturezaReceita: { select: { codigo: true } },
    },
  });

  const arrecadadas = await prisma.receitaArrecadada.findMany({
    where: {
      exercicio,
      ...(corte !== null ? { criadoEm: { lte: corte } } : {}),
    },
    select: {
      tipo: true,
      valor: true,
      naturezaReceita: { select: { codigo: true } },
    },
  });

  const por = new Map<string, { previsto: Money; realizado: Money }>();
  const zerado = () => ({ previsto: toMoney("0.00"), realizado: toMoney("0.00") });

  for (const p of previstas) {
    const codigo = p.naturezaReceita.codigo;
    const acc = por.get(codigo) ?? zerado();
    // DEDUÇÃO SUBTRAI (SINAL_PREVISAO). Nenhum SUM bruto.
    const valor = toMoney(p.valorPrevisto.toFixed(2));
    acc.previsto =
      SINAL_PREVISAO[p.tipoReceita] === 1
        ? toMoney(acc.previsto.plus(valor))
        : toMoney(acc.previsto.minus(valor));
    por.set(codigo, acc);
  }

  for (const a of arrecadadas) {
    const codigo = a.naturezaReceita.codigo;
    const acc = por.get(codigo) ?? zerado();
    // ANULAÇÃO SUBTRAI; RETIFICAÇÃO derruba o relatório (sinal indefinido).
    const valor = toMoney(a.valor.toFixed(2));
    acc.realizado =
      sinalDaReceitaRealizada(a.tipo) === 1
        ? toMoney(acc.realizado.plus(valor))
        : toMoney(acc.realizado.minus(valor));
    por.set(codigo, acc);
  }

  return [...por.entries()].map(([codigoNatureza, v]) => ({
    codigoNatureza,
    previsto: v.previsto,
    realizado: v.realizado,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// QUADRO 2 — despesa
// ═══════════════════════════════════════════════════════════════════════════

async function lerDespesas(
  prisma: PrismaClient,
  exercicio: number,
  corte: Date | null
): Promise<readonly FatoDespesa[]> {
  const fichas = await prisma.fichaOrcamentaria.findMany({
    where: { exercicio },
    select: {
      id: true,
      naturezaDespesa: { select: { codCategoria: true, codNatureza: true } },
    },
  });
  if (fichas.length === 0) return [];

  const fichaIds = fichas.map((f) => f.id);

  // A VERDADE: MovimentoDotacao. Nunca as colunas de saldo da ficha.
  const movimentos = await prisma.movimentoDotacao.findMany({
    where: {
      fichaId: { in: fichaIds },
      ...(corte !== null ? { criadoEm: { lte: corte } } : {}),
    },
    select: { fichaId: true, tipo: true, valor: true },
  });

  const empenhos = await prisma.empenho.findMany({
    where: { fichaId: { in: fichaIds } },
    select: { id: true, fichaId: true },
  });
  const fichaDoEmpenho = new Map(empenhos.map((e) => [e.id, e.fichaId]));

  const liquidacoes = await prisma.liquidacao.findMany({
    where: {
      empenhoId: { in: empenhos.map((e) => e.id) },
      // CORTE: liquidação de RPNP acontece DEPOIS do encerramento — ela é
      // execução de restos a pagar, não despesa liquidada deste exercício.
      ...(corte !== null ? { criadoEm: { lte: corte } } : {}),
    },
    select: { id: true, empenhoId: true, valor: true, estornoDeId: true },
  });

  const pagamentos = await prisma.pagamento.findMany({
    where: {
      liquidacaoId: { in: liquidacoes.map((l) => l.id) },
      // CORTE: pagamento de RP é de exercício seguinte. Sem isto, o mesmo
      // dinheiro apareceria na despesa paga E no quadro de restos a pagar.
      ...(corte !== null ? { criadoEm: { lte: corte } } : {}),
    },
    select: {
      id: true,
      liquidacaoId: true,
      // ⚠️ O BRUTO. Um pagamento com retenção (M07) sai do caixa pelo líquido,
      // mas a DESPESA EXECUTADA é o valor cheio. O líquido é assunto do Anexo 13.
      valor: true,
      estornoDeId: true,
    },
  });

  const liquidacaoDoEmpenho = new Map(liquidacoes.map((l) => [l.id, l.empenhoId]));

  // Agrupa por ficha, sempre com SUM líquido (o estorno neutraliza o original).
  const porFicha = new Map<
    string,
    { dotacaoInicial: Money; creditos: Money; empenhadas: Money }
  >();
  const zero = () => toMoney("0.00");

  for (const f of fichas) {
    porFicha.set(f.id, {
      dotacaoInicial: zero(),
      creditos: zero(),
      empenhadas: zero(),
    });
  }

  for (const m of movimentos) {
    const acc = porFicha.get(m.fichaId)!;
    const v = toMoney(m.valor.toFixed(2));
    switch (m.tipo) {
      case "DOTACAO_INICIAL":
        acc.dotacaoInicial = toMoney(acc.dotacaoInicial.plus(v));
        break;
      case "CREDITO_ADICIONAL":
        acc.creditos = toMoney(acc.creditos.plus(v));
        break;
      case "ANULACAO_CREDITO":
        acc.creditos = toMoney(acc.creditos.minus(v));
        break;
      case "EMPENHO":
        acc.empenhadas = toMoney(acc.empenhadas.plus(v));
        break;
      case "EMPENHO_ANULADO":
        acc.empenhadas = toMoney(acc.empenhadas.minus(v));
        break;
      // RESERVA e RESERVA_LIBERADA não são execução: a reserva é pré-empenho,
      // não compromete crédito no Anexo 12.
      case "RESERVA":
      case "RESERVA_LIBERADA":
        break;
    }
  }

  const liquidadasPorFicha = new Map<string, Money>();
  const pagasPorFicha = new Map<string, Money>();
  for (const id of fichaIds) {
    liquidadasPorFicha.set(id, zero());
    pagasPorFicha.set(id, zero());
  }

  // Liquidado por empenho (líquido de anulações), somado na ficha do empenho.
  const porEmpenho = new Map<string, Estornavel[]>();
  for (const l of liquidacoes) {
    const lista = porEmpenho.get(l.empenhoId) ?? [];
    lista.push(l);
    porEmpenho.set(l.empenhoId, lista);
  }
  for (const [empenhoId, lista] of porEmpenho) {
    const fichaId = fichaDoEmpenho.get(empenhoId)!;
    liquidadasPorFicha.set(
      fichaId,
      toMoney(liquidadasPorFicha.get(fichaId)!.plus(somaLiquida(lista)))
    );
  }

  // Pago por liquidação (líquido de anulações), somado na ficha do empenho dela.
  const porLiquidacao = new Map<string, Estornavel[]>();
  for (const p of pagamentos) {
    const lista = porLiquidacao.get(p.liquidacaoId) ?? [];
    lista.push(p);
    porLiquidacao.set(p.liquidacaoId, lista);
  }
  for (const [liquidacaoId, lista] of porLiquidacao) {
    const empenhoId = liquidacaoDoEmpenho.get(liquidacaoId)!;
    const fichaId = fichaDoEmpenho.get(empenhoId)!;
    pagasPorFicha.set(
      fichaId,
      toMoney(pagasPorFicha.get(fichaId)!.plus(somaLiquida(lista)))
    );
  }

  return fichas.map((f) => {
    const d = porFicha.get(f.id)!;
    return {
      codCategoria: f.naturezaDespesa.codCategoria,
      codGrupo: f.naturezaDespesa.codNatureza,
      dotacaoInicial: d.dotacaoInicial,
      creditosAdicionais: d.creditos,
      empenhadas: d.empenhadas,
      liquidadas: liquidadasPorFicha.get(f.id)!,
      pagas: pagasPorFicha.get(f.id)!,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// QUADROS 3 e 4 — restos a pagar
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Os RP que ESTE exercício executa são os inscritos no encerramento do exercício
 * ANTERIOR (ou antes dele). Os inscritos no encerramento DESTE exercício entram
 * no balanço do exercício SEGUINTE — é o que a coluna "inscritos em 31/12 do
 * exercício anterior" quer dizer.
 */
async function lerRestos(
  prisma: PrismaClient,
  exercicio: number,
  inicio: Date | null,
  corte: Date | null
): Promise<readonly FatoRestos[]> {
  const inscricoes = await prisma.inscricaoRestosAPagar.findMany({
    where: { exercicioOrigem: { lt: exercicio } },
    select: {
      id: true,
      tipo: true,
      exercicioOrigem: true,
      valorInscrito: true,
      empenhoId: true,
      empenho: {
        select: {
          ficha: {
            select: { naturezaDespesa: { select: { codCategoria: true } } },
          },
        },
      },
      movimentos: { select: { tipo: true, valor: true, criadoEm: true } },
    },
  });
  if (inscricoes.length === 0) return [];

  // Liquidações de RPNP: nascem DEPOIS do encerramento de origem. As que caem
  // dentro da janela deste exercício são a coluna "liquidados" do quadro 3.
  const liquidacoes = await prisma.liquidacao.findMany({
    where: { empenhoId: { in: inscricoes.map((i) => i.empenhoId) } },
    select: {
      id: true,
      empenhoId: true,
      valor: true,
      estornoDeId: true,
      criadoEm: true,
    },
  });

  const zero = () => toMoney("0.00");
  const fatos: FatoRestos[] = [];

  for (const i of inscricoes) {
    const codCategoria = i.empenho.ficha.naturezaDespesa.codCategoria;
    const inscrito = toMoney(i.valorInscrito.toFixed(2));

    // Baixa líquida (com os sinais do M08) num intervalo de tempo.
    const baixaAte = (fim: Date | null): Money => {
      let total = zero();
      for (const m of i.movimentos) {
        if (fim !== null && m.criadoEm > fim) continue;
        const v = toMoney(m.valor.toFixed(2));
        // PAGAMENTO e CANCELAMENTO baixam; os ESTORNO_* devolvem.
        if (m.tipo === "PAGAMENTO" || m.tipo === "CANCELAMENTO") {
          total = toMoney(total.plus(v));
        } else {
          total = toMoney(total.minus(v));
        }
      }
      return total;
    };

    const doAnoAnterior = i.exercicioOrigem === exercicio - 1;

    // "Inscritos em exercícios anteriores": o que SOBROU deles no início desta
    // janela — não o valor original, que já foi executado em parte lá atrás.
    const inscritosExerciciosAnteriores = doAnoAnterior
      ? zero()
      : toMoney(inscrito.minus(baixaAte(inicio)));
    const inscritos31Dez = doAnoAnterior ? inscrito : zero();

    // Movimentos DENTRO da janela deste exercício, com os sinais do M08.
    let pagos = zero();
    let cancelados = zero();
    for (const m of i.movimentos) {
      if (!naJanela(m.criadoEm, inicio, corte)) continue;
      const v = toMoney(m.valor.toFixed(2));
      switch (m.tipo) {
        case "PAGAMENTO":
          pagos = toMoney(pagos.plus(v));
          break;
        case "ESTORNO_PAGAMENTO":
          pagos = toMoney(pagos.minus(v));
          break;
        case "CANCELAMENTO":
          cancelados = toMoney(cancelados.plus(v));
          break;
        case "ESTORNO_CANCELAMENTO":
          cancelados = toMoney(cancelados.minus(v));
          break;
      }
    }

    // Liquidados: só o não processado tem essa coluna (o processado já nasce
    // liquidado — foi por isso que ele é "processado").
    let liquidados = zero();
    if (i.tipo === "NAO_PROCESSADO") {
      const doEmpenho = liquidacoes.filter(
        (l) => l.empenhoId === i.empenhoId && naJanela(l.criadoEm, inicio, corte)
      );
      liquidados = somaLiquida(doEmpenho);
    }

    fatos.push({
      codCategoria,
      tipo: i.tipo as TipoRestos,
      inscritosExerciciosAnteriores,
      inscritos31Dez,
      liquidados,
      pagos,
      cancelados,
    });
  }

  return fatos;
}

// ═══════════════════════════════════════════════════════════════════════════
// Saldos de exercícios anteriores (superávit financeiro usado em crédito)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Superávit financeiro de exercícios anteriores que virou FONTE de crédito
 * adicional neste exercício (M03). Linha informativa: fica FORA dos subtotais e
 * do cálculo do déficit/superávit — é recurso de outro ano, não receita deste.
 */
async function lerSaldosExerciciosAnteriores(
  prisma: PrismaClient,
  exercicio: number
): Promise<Money> {
  const itens = await prisma.itemCredito.findMany({
    where: {
      tipo: "SUPLEMENTACAO",
      ficha: { exercicio },
      decreto: { origemRecurso: "SUPERAVIT_FINANCEIRO" },
    },
    select: { valor: true },
  });

  let total = toMoney("0.00");
  for (const i of itens) {
    total = toMoney(total.plus(toMoney(i.valor.toFixed(2))));
  }
  return total;
}
