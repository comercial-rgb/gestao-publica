import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
// A apuração de caixa é do M01: uma aritmética, muitos recortes.
import { saldoDasContas } from "../m01-core-contabil/adapter-prisma.js";
import {
  montarBalancoFinanceiro,
  type BalancoFinanceiro,
  type FatoPorFonte,
} from "./dominio-financeiro.js";

/**
 * BALANÇO FINANCEIRO (Anexo 13) — LEITURA PURA.
 *
 * Mesmas regras do eixo: ZERO escrita, ZERO tabela, e NENHUMA coluna cache. Todo
 * número sai de SUM sobre os movimentos append-only e sobre as PARTIDAS do razão.
 *
 * ═══ AS CONTAS DE CAIXA VÊM POR PARÂMETRO ═══
 * O relatório precisa saber QUAIS contas do PCASP são "caixa e equivalentes" para
 * apurar o saldo em espécie. Não existe flag `ehDisponibilidade` no plano de
 * contas, e o projeto inteiro é construído sobre "nenhuma conta mágica no código"
 * — os roteiros contábeis sempre receberam os códigos por parâmetro. Aqui é igual:
 * quem chama declara o rol. Fail-closed: rol vazio ou conta inexistente = erro.
 */

/** Janela `(inicio, fim]`. Limites nulos = sem limite. */
function naJanela(quando: Date, inicio: Date | null, fim: Date | null): boolean {
  if (inicio !== null && quando <= inicio) return false;
  if (fim !== null && quando > fim) return false;
  return true;
}

export async function balancoFinanceiro(
  prisma: PrismaClient,
  exercicio: number,
  /** Códigos PCASP de CAIXA E EQUIVALENTES. Sem conta mágica: venha por parâmetro. */
  contasDisponibilidade: readonly string[]
): Promise<BalancoFinanceiro> {
  if (contasDisponibilidade.length === 0) {
    throw new Error(
      "Balanço financeiro sem contas de disponibilidade: é impossível apurar o " +
        "saldo em espécie sem saber quais contas são caixa. Informe o rol."
    );
  }

  const ex = await prisma.exercicio.findUnique({
    where: { ano: exercicio },
    select: { ano: true, encerramento: { select: { criadoEm: true } } },
  });
  if (ex === null) {
    throw new Error(
      `Exercício ${exercicio} não existe — não há balanço financeiro a emitir.`
    );
  }

  const contas = await prisma.contaPcasp.findMany({
    where: { codigo: { in: [...contasDisponibilidade] } },
    select: { codigo: true },
  });
  const faltantes = contasDisponibilidade.filter(
    (c) => !contas.some((x) => x.codigo === c)
  );
  if (faltantes.length > 0) {
    throw new Error(
      `Conta(s) de disponibilidade inexistente(s) no PCASP: ${faltantes.join(", ")}.`
    );
  }

  /** Fim da janela. `null` = exercício ABERTO (balanço parcial). */
  const corte: Date | null = ex.encerramento?.criadoEm ?? null;
  const parcial = corte === null;

  const anterior = await prisma.exercicio.findUnique({
    where: { ano: exercicio - 1 },
    select: { encerramento: { select: { criadoEm: true } } },
  });
  /** Início da janela = encerramento do exercício anterior. */
  const inicio: Date | null = anterior?.encerramento?.criadoEm ?? null;

  const [
    receitasPorFonte,
    despesasPorFonte,
    inscricoes,
    pagamentosRP,
    depositos,
    saldoAnterior,
    caixaApurado,
  ] = await Promise.all([
    lerReceitasPorFonte(prisma, exercicio, corte),
    lerDespesasPorFonte(prisma, exercicio, corte),
    lerInscricoesDoExercicio(prisma, exercicio),
    lerPagamentosDeRestos(prisma, exercicio, inicio, corte),
    lerDepositos(prisma, inicio, corte),
    // SALDO ANTERIOR: o caixa como estava NO ENCERRAMENTO do exercício passado.
    //
    // ⚠️ `inicio === null` aqui NÃO quer dizer "sem limite" — quer dizer que NÃO
    // HÁ exercício anterior encerrado, e portanto não há saldo carregado: ZERO.
    // (No `corte`, o mesmo `null` quer dizer o oposto: exercício aberto, tudo até
    // agora. Os dois nulos significam coisas diferentes — daí o ramo explícito.)
    inicio === null
      ? Promise.resolve(toMoney("0.00"))
      : apurarCaixa(prisma, contasDisponibilidade, inicio),
    // O CAIXA REAL no fim da janela — a prova dos nove do demonstrativo.
    apurarCaixa(prisma, contasDisponibilidade, corte),
  ]);

  return montarBalancoFinanceiro({
    exercicio,
    parcial,
    receitasPorFonte,
    despesasPorFonte,
    inscricaoRestosNaoProcessados: inscricoes.naoProcessados,
    inscricaoRestosProcessados: inscricoes.processados,
    depositosRecebidos: depositos.recebidos,
    pagamentoRestosNaoProcessados: pagamentosRP.naoProcessados,
    pagamentoRestosProcessados: pagamentosRP.processados,
    depositosPagos: depositos.pagos,
    saldoAnterior,
    caixaApurado,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// CAIXA — apurado pelas PARTIDAS do razão (nunca por coluna).
//
// A APURAÇÃO É DO M01 (`saldoDasContas`) — a MESMA função que a conciliação
// bancária (M09) usa, com outro recorte. Copiá-la aqui criaria duas verdades
// sobre o mesmo saldo, e a conciliação existe justamente para provar que o razão
// e o banco contam a mesma história.
//
// Recorte deste relatório: `criadoEm` — o corte do exercício é o ENCERRAMENTO,
// que é um `criadoEm`. (A conciliação usa `dataTransacao`; ver a nota lá.)
// ═══════════════════════════════════════════════════════════════════════════

async function apurarCaixa(
  prisma: PrismaClient,
  contas: readonly string[],
  ate: Date | null
): Promise<Money> {
  return saldoDasContas(prisma, contas, ate, "criadoEm");
}

// ═══════════════════════════════════════════════════════════════════════════
// INGRESSOS / DISPÊNDIOS ORÇAMENTÁRIOS, por fonte
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ SEM SEGREGAÇÃO "ORDINÁRIAS × VINCULADAS": `FonteRecurso` NÃO carrega essa
 * classificação (só `codigo`, `descricao`, `codigoTce`, `codigoStn`). Classificar
 * de memória qual fonte é vinculada seria inventar — a linha sai por fonte, com o
 * código e a descrição que estão no banco. Ver PENDÊNCIA no MODULO.md.
 */
async function lerReceitasPorFonte(
  prisma: PrismaClient,
  exercicio: number,
  corte: Date | null
): Promise<readonly FatoPorFonte[]> {
  const arrecadadas = await prisma.receitaArrecadada.findMany({
    where: {
      exercicio,
      ...(corte !== null ? { criadoEm: { lte: corte } } : {}),
    },
    select: {
      tipo: true,
      valor: true,
      fonte: { select: { codigo: true, descricao: true } },
    },
  });

  const por = new Map<string, { rotulo: string; valor: Money }>();
  for (const a of arrecadadas) {
    const acc = por.get(a.fonte.codigo) ?? {
      rotulo: a.fonte.descricao,
      valor: toMoney("0.00"),
    };
    const v = toMoney(a.valor.toFixed(2));
    // ARRECADAÇÃO entra, ANULAÇÃO sai. (RETIFICACAO não é emitida pelo M04 e tem
    // sinal indefinido — o Anexo 12 já derruba o relatório nela; aqui ela cairia
    // no mesmo problema, então também não é somada às cegas.)
    if (a.tipo === "ARRECADACAO") {
      acc.valor = toMoney(acc.valor.plus(v));
    } else if (a.tipo === "ANULACAO") {
      acc.valor = toMoney(acc.valor.minus(v));
    } else {
      throw new Error(
        `Receita do tipo ${a.tipo} não tem sinal definido — ver ` +
          `SINAL_RECEITA_REALIZADA (M12) e a PENDÊNCIA do M04.`
      );
    }
    por.set(a.fonte.codigo, acc);
  }

  return [...por.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([codigo, v]) => ({ codigo, rotulo: v.rotulo, valor: v.valor }));
}

/**
 * Despesa pela EMPENHADA (líquida de anulações), por fonte da ficha.
 *
 * PELA EMPENHADA, não pela paga — e é o que faz o balanço fechar: o que foi
 * empenhado e não saiu do caixa está do lado dos INGRESSOS, como inscrição de
 * restos a pagar. `empenhado = pago em caixa + retido + inscrito em RP`.
 */
async function lerDespesasPorFonte(
  prisma: PrismaClient,
  exercicio: number,
  corte: Date | null
): Promise<readonly FatoPorFonte[]> {
  const movimentos = await prisma.movimentoDotacao.findMany({
    where: {
      tipo: { in: ["EMPENHO", "EMPENHO_ANULADO"] },
      ficha: { exercicio },
      ...(corte !== null ? { criadoEm: { lte: corte } } : {}),
    },
    select: {
      tipo: true,
      valor: true,
      ficha: { select: { fonte: { select: { codigo: true, descricao: true } } } },
    },
  });

  const por = new Map<string, { rotulo: string; valor: Money }>();
  for (const m of movimentos) {
    const fonte = m.ficha.fonte;
    const acc = por.get(fonte.codigo) ?? {
      rotulo: fonte.descricao,
      valor: toMoney("0.00"),
    };
    const v = toMoney(m.valor.toFixed(2));
    acc.valor =
      m.tipo === "EMPENHO"
        ? toMoney(acc.valor.plus(v))
        : toMoney(acc.valor.minus(v)); // EMPENHO_ANULADO devolve
    por.set(fonte.codigo, acc);
  }

  return [...por.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([codigo, v]) => ({ codigo, rotulo: v.rotulo, valor: v.valor }));
}

// ═══════════════════════════════════════════════════════════════════════════
// EXTRAORÇAMENTÁRIOS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * INSCRIÇÃO de RP no encerramento DESTE exercício — ingresso extraorçamentário.
 *
 * Por que é INGRESSO: a despesa foi empenhada (e já entrou nos dispêndios pela
 * empenhada), mas o dinheiro NÃO saiu do caixa — ficou lá, comprometido com o
 * credor. Sem esta linha, o balanço acusaria uma saída de caixa que não houve.
 */
async function lerInscricoesDoExercicio(
  prisma: PrismaClient,
  exercicio: number
): Promise<{ naoProcessados: Money; processados: Money }> {
  const inscricoes = await prisma.inscricaoRestosAPagar.findMany({
    where: { exercicioOrigem: exercicio },
    select: { tipo: true, valorInscrito: true },
  });

  let naoProcessados = toMoney("0.00");
  let processados = toMoney("0.00");
  for (const i of inscricoes) {
    const v = toMoney(i.valorInscrito.toFixed(2));
    if (i.tipo === "NAO_PROCESSADO") {
      naoProcessados = toMoney(naoProcessados.plus(v));
    } else {
      processados = toMoney(processados.plus(v));
    }
  }
  return { naoProcessados, processados };
}

/** Pagamentos, DENTRO deste exercício, de RP inscritos em exercícios anteriores. */
async function lerPagamentosDeRestos(
  prisma: PrismaClient,
  exercicio: number,
  inicio: Date | null,
  corte: Date | null
): Promise<{ naoProcessados: Money; processados: Money }> {
  const movimentos = await prisma.movimentoRestosAPagar.findMany({
    where: {
      tipo: { in: ["PAGAMENTO", "ESTORNO_PAGAMENTO"] },
      inscricao: { exercicioOrigem: { lt: exercicio } },
    },
    select: {
      tipo: true,
      valor: true,
      criadoEm: true,
      inscricao: { select: { tipo: true } },
    },
  });

  let naoProcessados = toMoney("0.00");
  let processados = toMoney("0.00");

  for (const m of movimentos) {
    if (!naJanela(m.criadoEm, inicio, corte)) continue;
    const v = toMoney(m.valor.toFixed(2));
    // PAGAMENTO sai do caixa; ESTORNO_PAGAMENTO devolve. Nenhum SUM bruto.
    const delta = m.tipo === "PAGAMENTO" ? v : toMoney(v.negated());

    if (m.inscricao.tipo === "NAO_PROCESSADO") {
      naoProcessados = toMoney(naoProcessados.plus(delta));
    } else {
      processados = toMoney(processados.plus(delta));
    }
  }
  return { naoProcessados, processados };
}

/**
 * M07 — depósitos restituíveis e valores vinculados, nos DOIS sentidos.
 *
 * ═══ A SIMETRIA QUE FAZ O BALANÇO FECHAR ═══
 * Os 500 retidos de INSS num pagamento são INGRESSO aqui (o dinheiro ficou no
 * caixa do ente, mas não é dele). Quando forem repassados ao INSS, viram
 * DISPÊNDIO. Enquanto isso, eles explicam por que o caixa tem 500 a mais do que a
 * despesa paga sugeriria.
 *
 * Os quatro tipos NÃO têm o mesmo sinal (lição do M07/M08): os ESTORNO_* desfazem.
 */
async function lerDepositos(
  prisma: PrismaClient,
  inicio: Date | null,
  corte: Date | null
): Promise<{ recebidos: Money; pagos: Money }> {
  const movimentos = await prisma.movimentoExtraorcamentario.findMany({
    select: { tipo: true, valor: true, criadoEm: true },
  });

  let recebidos = toMoney("0.00");
  let pagos = toMoney("0.00");

  for (const m of movimentos) {
    if (!naJanela(m.criadoEm, inicio, corte)) continue;
    const v = toMoney(m.valor.toFixed(2));
    switch (m.tipo) {
      case "INGRESSO":
        recebidos = toMoney(recebidos.plus(v));
        break;
      case "ESTORNO_INGRESSO":
        recebidos = toMoney(recebidos.minus(v));
        break;
      case "DISPENDIO":
        pagos = toMoney(pagos.plus(v));
        break;
      case "ESTORNO_DISPENDIO":
        pagos = toMoney(pagos.minus(v));
        break;
    }
  }
  return { recebidos, pagos };
}
