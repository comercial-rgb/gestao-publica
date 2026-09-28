import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { sinalDaReceitaRealizada } from "../m04-receita/dominio.js";
// OS MESMOS FATOS DO ANEXO 13 — importados, não recopiados: a janela, o caixa (a apuração do
// M01 pelas partidas) e o dinheiro de terceiros (M07). Duas cópias de cada um seriam duas
// verdades sobre o mesmo saldo.
import { apurarCaixa, lerDepositos, naJanela } from "./balanco-financeiro.js";
// E A MESMA DESPESA PAGA DO ANEXO 12: a coluna "pagas", por ficha, pelo bruto, com o corte que
// separa o pago do exercício do pago de restos a pagar.
import { lerDespesas } from "./balanco-orcamentario.js";
import {
  montarDfc,
  type DemonstracaoFluxosDeCaixa,
  type FatoDespesaDfc,
  type FatoReceitaDfc,
} from "./dominio-dfc.js";

/**
 * DEMONSTRAÇÃO DOS FLUXOS DE CAIXA — LEITURA PURA. ZERO escrita, ZERO coluna cache.
 *
 * ═══ DE ONDE VEM CADA NÚMERO ═══
 * | Linha                                   | Fato                                  | Reuso          |
 * |-----------------------------------------|---------------------------------------|----------------|
 * | receitas por origem                     | `ReceitaArrecadada` (arrecadação − anulação) | sinal do M04 |
 * | despesa paga do exercício, por grupo    | coluna "pagas" do Anexo 12            | `lerDespesas`  |
 * | restos a pagar pagos, por grupo         | `MovimentoRestosAPagar` na janela     | janela do Anexo 13 |
 * | depósitos restituíveis                  | `MovimentoExtraorcamentario`          | `lerDepositos` |
 * | caixa inicial / caixa apurado           | partidas das contas de disponibilidade| `apurarCaixa`  |
 *
 * A receita e os restos são lidos aqui porque o Anexo 13 os agrupa por FONTE e por TIPO de RP,
 * e a DFC precisa deles por NATUREZA — mesmo filtro, mesma janela, mesmos sinais, outro
 * agrupamento. O que prova que os dois contam o mesmo dinheiro é a conferência contra o caixa
 * das partidas, que é feita nos dois.
 *
 * ═══ AS CONTAS DE CAIXA VÊM POR PARÂMETRO ═══
 * Como no Anexo 13: rol vazio ou conta inexistente = erro. Nenhuma conta mágica no código.
 */
export async function demonstracaoFluxosDeCaixa(
  prisma: PrismaClient,
  exercicio: number,
  /** Códigos PCASP de CAIXA E EQUIVALENTES. */
  contasDisponibilidade: readonly string[]
): Promise<DemonstracaoFluxosDeCaixa> {
  if (contasDisponibilidade.length === 0) {
    throw new Error(
      "Demonstração dos Fluxos de Caixa sem contas de disponibilidade: é impossível apurar o " +
        "caixa inicial e o final sem saber quais contas são caixa. Informe o rol."
    );
  }

  const ex = await prisma.exercicio.findUnique({
    where: { ano: exercicio },
    select: { ano: true, encerramento: { select: { criadoEm: true } } },
  });
  if (ex === null) {
    throw new Error(
      `Exercício ${exercicio} não existe — não há demonstração dos fluxos de caixa a emitir.`
    );
  }

  const contas = await prisma.contaPcasp.findMany({
    where: { codigo: { in: [...contasDisponibilidade] } },
    select: { codigo: true },
  });
  const faltantes = contasDisponibilidade.filter((c) => !contas.some((x) => x.codigo === c));
  if (faltantes.length > 0) {
    throw new Error(
      `Conta(s) de disponibilidade inexistente(s) no PCASP: ${faltantes.join(", ")}.`
    );
  }

  // A JANELA É A DO ANEXO 13: `(encerramento anterior, encerramento deste]`; `null` no fim =
  // exercício aberto (parcial); `null` no início = não há exercício anterior encerrado, e o
  // caixa inicial é ZERO (não "sem limite") — o mesmo ramo explícito do Balanço Financeiro.
  const corte: Date | null = ex.encerramento?.criadoEm ?? null;
  const anterior = await prisma.exercicio.findUnique({
    where: { ano: exercicio - 1 },
    select: { encerramento: { select: { criadoEm: true } } },
  });
  const inicio: Date | null = anterior?.encerramento?.criadoEm ?? null;

  const [receitas, despesasDoExercicio, restosPagos, depositos, caixaInicial, caixaApurado] =
    await Promise.all([
      lerReceitasPorNatureza(prisma, exercicio, corte),
      lerDespesas(prisma, exercicio, corte),
      lerRestosPagosPorNatureza(prisma, exercicio, inicio, corte),
      lerDepositos(prisma, inicio, corte),
      inicio === null
        ? Promise.resolve(toMoney("0.00"))
        : apurarCaixa(prisma, contasDisponibilidade, inicio),
      apurarCaixa(prisma, contasDisponibilidade, corte),
    ]);

  return montarDfc({
    exercicio,
    parcial: corte === null,
    receitas,
    despesasPagas: despesasDoExercicio.map((d) => ({
      codCategoria: d.codCategoria,
      codGrupo: d.codGrupo,
      valor: d.pagas,
    })),
    restosPagos,
    depositosRecebidos: depositos.recebidos,
    depositosPagos: depositos.pagos,
    caixaInicial,
    caixaApurado,
  });
}

/**
 * Receita arrecadada, por NATUREZA. Mesmo filtro do Anexo 13 (`exercicio`, `criadoEm <= corte`)
 * e o mesmo sinal (`sinalDaReceitaRealizada`, que derruba a RETIFICACAO de sinal indefinido).
 */
async function lerReceitasPorNatureza(
  prisma: PrismaClient,
  exercicio: number,
  corte: Date | null
): Promise<readonly FatoReceitaDfc[]> {
  const arrecadadas = await prisma.receitaArrecadada.findMany({
    where: {
      exercicio,
      ...(corte !== null ? { criadoEm: { lte: corte } } : {}),
    },
    select: {
      tipo: true,
      valor: true,
      naturezaReceita: { select: { codigo: true, descricao: true } },
    },
  });

  const por = new Map<string, { descricao: string; valor: Money }>();
  for (const a of arrecadadas) {
    const { codigo, descricao } = a.naturezaReceita;
    const acc = por.get(codigo) ?? { descricao, valor: toMoney("0.00") };
    const v = toMoney(a.valor.toFixed(2));
    acc.valor =
      sinalDaReceitaRealizada(a.tipo) === 1
        ? toMoney(acc.valor.plus(v))
        : toMoney(acc.valor.minus(v));
    por.set(codigo, acc);
  }

  return [...por.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([codigoNatureza, v]) => ({ codigoNatureza, descricao: v.descricao, valor: v.valor }));
}

/**
 * Restos a pagar de exercícios ANTERIORES pagos DENTRO da janela, pela natureza da ficha do
 * empenho inscrito. Mesmo filtro e mesmos sinais do leitor do Anexo 13: PAGAMENTO sai do caixa,
 * ESTORNO_PAGAMENTO devolve; CANCELAMENTO não é fluxo de caixa e não é lido.
 */
async function lerRestosPagosPorNatureza(
  prisma: PrismaClient,
  exercicio: number,
  inicio: Date | null,
  corte: Date | null
): Promise<readonly FatoDespesaDfc[]> {
  const movimentos = await prisma.movimentoRestosAPagar.findMany({
    where: {
      tipo: { in: ["PAGAMENTO", "ESTORNO_PAGAMENTO"] },
      inscricao: { exercicioOrigem: { lt: exercicio } },
    },
    select: {
      tipo: true,
      valor: true,
      criadoEm: true,
      inscricao: {
        select: {
          empenho: {
            select: {
              ficha: {
                select: { naturezaDespesa: { select: { codCategoria: true, codNatureza: true } } },
              },
            },
          },
        },
      },
    },
  });

  const por = new Map<string, FatoDespesaDfc>();
  for (const m of movimentos) {
    if (!naJanela(m.criadoEm, inicio, corte)) continue;
    const nd = m.inscricao.empenho.ficha.naturezaDespesa;
    const chave = `${nd.codCategoria}|${nd.codNatureza}`;
    const v = toMoney(m.valor.toFixed(2));
    const delta = m.tipo === "PAGAMENTO" ? v : toMoney(v.negated());
    const acc = por.get(chave);
    por.set(chave, {
      codCategoria: nd.codCategoria,
      codGrupo: nd.codNatureza,
      valor: toMoney((acc?.valor ?? toMoney("0.00")).plus(delta)),
    });
  }
  return [...por.values()];
}
