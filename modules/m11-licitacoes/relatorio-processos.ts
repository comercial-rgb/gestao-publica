import {
  serializar,
  toMoney,
  type Dinheiro,
  type Money,
} from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
// Os EXECUTADOS vêm do dono do dado (M05). O relatório não soma empenho nem
// pagamento — ele compõe.
import {
  empenhadoLiquidoPorContrato,
  execucaoPorContrato,
} from "../m05-despesa/consultas.js";
import {
  SINAL_VALOR_CONTRATUAL,
  valorAtualizado,
  type MovimentoDoContrato,
} from "./dominio.js";

/**
 * RELATÓRIO DE PROCESSOS LICITATÓRIOS (TR 5.103) — LEITURA PURA.
 *
 * Zero escrita, zero cache, Decimal como string. O que ele existe para mostrar é o
 * confronto que ninguém faz na planilha: **o que foi licitado × o que foi
 * contratado × o que foi executado**.
 *
 * ═══ AS TRÊS AMARRAÇÕES ═══
 * L1. valorAtualizado == valorInicial + aditivos. Os dois lados vêm de CAMINHOS
 *     DIFERENTES: a esquerda da função de domínio (`valorAtualizado`, que varre os
 *     movimentos com o SINAL_VALOR); a direita da COLUNA que este relatório publica.
 *     Se a coluna esquecer uma parcela (uma supressão, por exemplo), a igualdade
 *     quebra — e o t9 prova, nomeando os 5.000,00 exatos.
 * L2. saldoDoContrato == valorAtualizado − empenhado (idem: função × colunas).
 * L3. A CADEIA: pago <= liquidado <= empenhado <= valorAtualizado. Cada elo é uma
 *     etapa da despesa, e nenhuma pode ultrapassar a anterior. Violação NOMEIA o elo
 *     — é a diferença entre "o relatório não fecha" e "o pago excede o liquidado no
 *     contrato CT-001".
 *
 * ⚠️ O SALDO DA LICITAÇÃO PODE SER NEGATIVO, e não há clamp. Contratar acima do
 * licitado ACONTECE (aditivos, ou um segundo contrato sobre a mesma ata) — e é
 * exatamente o que o TCE quer ver. Zerar o negativo esconderia o achado.
 */

export interface ContratoDoRelatorio {
  readonly numeroContrato: string;
  readonly contratadoNome: string;
  readonly valorInicial: Dinheiro;
  /** Σ(valor × SINAL_VALOR) — acréscimos POSITIVOS, supressões NEGATIVAS. */
  readonly aditivos: Dinheiro;
  readonly valorAtualizado: Dinheiro;
  readonly empenhado: Dinheiro;
  readonly liquidado: Dinheiro;
  readonly pago: Dinheiro;
  readonly saldoDoContrato: Dinheiro;
}

export interface ProcessoDoRelatorio {
  readonly numeroProcesso: string;
  readonly modalidade: string;
  readonly hipoteseDispensa: string | null;
  readonly objeto: string;
  readonly valorLicitado: Dinheiro;
  readonly contratos: readonly ContratoDoRelatorio[];
  /** Σ dos valores ATUALIZADOS dos contratos. */
  readonly totalContratado: Dinheiro;
  /** valorLicitado − totalContratado. NEGATIVO = contratou acima do licitado. */
  readonly saldoDaLicitacao: Dinheiro;
}

export interface RelatorioProcessos {
  readonly relatorio: "TR 5.103 — PROCESSOS LICITATÓRIOS";
  readonly corte: Date;
  readonly processos: readonly ProcessoDoRelatorio[];
}

const zero = () => toMoney("0.00");
const soma = (a: Money, b: Money) => toMoney(a.plus(b));
const sub = (a: Money, b: Money) => toMoney(a.minus(b));

/**
 * Σ dos aditivos, com o SINAL de cada tipo. É a MESMA tabela que o domínio usa para
 * derivar o valor atualizado — o que muda é que aqui a soma sai SOZINHA, como
 * coluna. É por elas virem do mesmo Record e por caminhos diferentes que a L1 tem
 * o que conferir.
 */
function somaDosAditivos(movimentos: readonly MovimentoDoContrato[]): Money {
  let total = zero();
  for (const m of movimentos) {
    const sinal = SINAL_VALOR_CONTRATUAL[m.tipo];
    if (sinal === 0) continue; // movimento de PRAZO não é aditivo de valor
    const valor = m.valor!;
    total = sinal === 1 ? soma(total, valor) : sub(total, valor);
  }
  return total;
}

export async function relatorioProcessosLicitatorios(
  prisma: PrismaClient,
  corte: Date
): Promise<RelatorioProcessos> {
  const processos = await prisma.processoLicitatorio.findMany({
    orderBy: { numeroProcesso: "asc" },
    select: {
      numeroProcesso: true,
      modalidade: true,
      hipoteseDispensa: true,
      objeto: true,
      valorLicitado: true,
      contratos: {
        orderBy: { numeroContrato: "asc" },
        select: {
          id: true,
          numeroContrato: true,
          contratadoNome: true,
          valorInicial: true,
          movimentos: {
            // Corte pela data do FATO (a assinatura do aditivo).
            where: { data: { lte: corte } },
            select: { tipo: true, valor: true, dias: true },
          },
        },
      },
    },
  });

  const saida: ProcessoDoRelatorio[] = [];

  for (const p of processos) {
    const contratos: ContratoDoRelatorio[] = [];
    let totalContratado = zero();

    for (const c of p.contratos) {
      const movimentos: MovimentoDoContrato[] = c.movimentos.map((m) => ({
        tipo: m.tipo,
        valor: m.valor === null ? null : toMoney(m.valor.toFixed(2)),
        dias: m.dias,
      }));

      const inicial = toMoney(c.valorInicial.toFixed(2));
      const aditivos = somaDosAditivos(movimentos);
      // O OUTRO caminho: a função de domínio, varrendo os mesmos movimentos.
      const atualizado = valorAtualizado(inicial, movimentos);

      const empenhado = await empenhadoLiquidoPorContrato(prisma, c.id, corte);
      const { liquidado, pago } = await execucaoPorContrato(prisma, c.id, corte);
      const saldo = sub(atualizado, empenhado);

      // ═══ L1 — valorAtualizado == valorInicial + aditivos ═══
      const porColunas = soma(inicial, aditivos);
      if (!atualizado.equals(porColunas)) {
        throw new Error(
          `CONTRATO NÃO FECHA (${c.numeroContrato}, processo ${p.numeroProcesso}): ` +
            `o valor atualizado ${atualizado.toFixed(2)} (derivado dos movimentos) ` +
            `≠ valor inicial ${inicial.toFixed(2)} + aditivos ` +
            `${aditivos.toFixed(2)} = ${porColunas.toFixed(2)}. Diferença: ` +
            `${sub(atualizado, porColunas).toFixed(2)}. A coluna de aditivos deste ` +
            `relatório está deixando alguma parcela de fora — e o número publicado ` +
            `não é o do contrato.`
        );
      }

      // ═══ L2 — saldo == valorAtualizado − empenhado ═══
      const saldoPorColunas = sub(atualizado, empenhado);
      if (!saldo.equals(saldoPorColunas)) {
        throw new Error(
          `SALDO DO CONTRATO NÃO FECHA (${c.numeroContrato}): ${saldo.toFixed(2)} ≠ ` +
            `${atualizado.toFixed(2)} − ${empenhado.toFixed(2)} = ` +
            `${saldoPorColunas.toFixed(2)}.`
        );
      }

      // ═══ L3 — A CADEIA DA DESPESA, ELO A ELO ═══
      const elos: readonly { readonly de: string; readonly a: string; readonly menor: Money; readonly maior: Money }[] = [
        { de: "pago", a: "liquidado", menor: pago, maior: liquidado },
        { de: "liquidado", a: "empenhado", menor: liquidado, maior: empenhado },
        { de: "empenhado", a: "valor atualizado", menor: empenhado, maior: atualizado },
      ];
      for (const elo of elos) {
        if (elo.menor.greaterThan(elo.maior)) {
          throw new Error(
            `CADEIA DA DESPESA ROMPIDA no contrato ${c.numeroContrato} ` +
              `(processo ${p.numeroProcesso}): ${elo.de} ${elo.menor.toFixed(2)} ` +
              `EXCEDE ${elo.a} ${elo.maior.toFixed(2)} em ` +
              `${sub(elo.menor, elo.maior).toFixed(2)}. Cada etapa da despesa é ` +
              `limitada pela anterior — ${elo.de} maior que ${elo.a} é dinheiro que ` +
              `andou sem autorização.`
          );
        }
      }

      contratos.push({
        numeroContrato: c.numeroContrato,
        contratadoNome: c.contratadoNome,
        valorInicial: serializar(inicial),
        aditivos: serializar(aditivos),
        valorAtualizado: serializar(atualizado),
        empenhado: serializar(empenhado),
        liquidado: serializar(liquidado),
        pago: serializar(pago),
        saldoDoContrato: serializar(saldo),
      });
      totalContratado = soma(totalContratado, atualizado);
    }

    const licitado = toMoney(p.valorLicitado.toFixed(2));
    saida.push({
      numeroProcesso: p.numeroProcesso,
      modalidade: p.modalidade,
      hipoteseDispensa: p.hipoteseDispensa,
      objeto: p.objeto,
      valorLicitado: serializar(licitado),
      contratos,
      totalContratado: serializar(totalContratado),
      // SEM CLAMP: negativo = contratou acima do licitado, e é um achado.
      saldoDaLicitacao: serializar(sub(licitado, totalContratado)),
    });
  }

  return {
    relatorio: "TR 5.103 — PROCESSOS LICITATÓRIOS",
    corte,
    processos: saida,
  };
}
