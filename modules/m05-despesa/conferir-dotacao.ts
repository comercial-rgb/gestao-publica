import { toMoney, type Money } from "../../packages/contracts/index.js";
import { somasPorConta, type Tx } from "../m01-core-contabil/adapter-prisma.js";
import { calcularSaldos } from "./dominio.js";
import type { TipoMovimentoDotacao } from "./dominio.js";

/**
 * A1-orc — A AMARRAÇÃO DO SUBSISTEMA ORÇAMENTÁRIO: o RAZÃO contra os MOVIMENTOS.
 *
 * ═══ POR QUE ELA NÃO EXISTIA, E POR QUE ELA É O CORAÇÃO DESTE BLOCO ═══
 * O furo de 46dfd5d (dotação sem perna no razão) sobreviveu a TODAS as amarrações do
 * repositório — e o motivo é simples: **o balancete fechava**. Todo lançamento é
 * balanceado um a um (o motor do M01 recusa o que não fecha), então ΣD == ΣC continuava
 * verdadeiro mesmo com metade do orçamento faltando no razão.
 *
 * A única leitura que enxerga um buraco desses é a que compara DUAS FONTES INDEPENDENTES
 * sobre o mesmo número: o saldo da conta no RAZÃO e a soma dos MOVIMENTOS DE DOTAÇÃO. É a
 * mesma ideia da `conferirDividaAtivaContraRazao` (M10) e da S1/S2 do Anexo 14 — e é
 * sempre ela que pega o que o balanceamento não pega.
 *
 * ═══ ZERO SEGUNDA ARITMÉTICA ═══
 * O lado dos MOVIMENTOS sai do `calcularSaldos` — a MESMA função que a ficha usa (com o
 * `SINAIS`, o Record que dá o sinal de cada tipo). O lado do RAZÃO sai do `somasPorConta`
 * (M01, dono do razão). Nenhuma soma nova: só a confrontação.
 */

export interface ContasDoOrcamento {
  /** 6.2.2.1.1 — crédito DISPONÍVEL (credora). */
  readonly disponivel: string;
  /** 6.2.2.1.2 — crédito RESERVADO (credora). */
  readonly reservado: string;
  /** 6.2.2.1.3 — crédito EMPENHADO (credora). */
  readonly empenhado: string;
}

export interface ConfrontoOrcamentario {
  readonly conta: string;
  readonly peloRazao: Money;
  readonly pelosMovimentos: Money;
}

/** Saldo CREDOR de uma conta no razão (ΣC − ΣD). As contas 6.2.2.x são credoras. */
function saldoCredor(s: { debito: Money; credito: Money } | undefined): Money {
  if (s === undefined) return toMoney("0.00");
  return toMoney(s.credito.minus(s.debito));
}

/**
 * Confere as TRÊS contas de controle do orçamento contra os movimentos de dotação.
 *
 * ⚠️ A IDENTIDADE, escrita: o crédito DISPONÍVEL no razão é
 *   `dotação + crédito adicional − anulação − reserva + liberação − empenho + anulação de empenho`
 * que é EXATAMENTE `autorizado − reservado − empenhado` — o `disponivel` da ficha. As
 * três contas juntas cobrem os SETE tipos de movimento: se uma perna faltar no razão (ou
 * sobrar), uma das três acusa.
 *
 * FAIL-CLOSED: nomeia a conta, os dois números e a diferença.
 */
export async function conferirDotacaoContraRazao(
  tx: Tx,
  contas: ContasDoOrcamento
): Promise<readonly ConfrontoOrcamentario[]> {
  const [somas, movimentos] = await Promise.all([
    somasPorConta(tx, {
      codigos: [contas.disponivel, contas.reservado, contas.empenhado],
      ate: null,
    }),
    tx.movimentoDotacao.findMany({ select: { tipo: true, valor: true } }),
  ]);

  const porCodigo = new Map(somas.map((s) => [s.codigo, s]));

  // ⚠️ O MESMO `calcularSaldos` DA FICHA — o Record de sinais é fonte única. Somar aqui
  // com um laço próprio seria a segunda verdade sobre o saldo da dotação, e ela
  // divergiria no dia em que um tipo novo entrasse no enum.
  const totais: Partial<Record<TipoMovimentoDotacao, Money>> = {};
  for (const m of movimentos) {
    const v = toMoney(m.valor.toFixed(2));
    totais[m.tipo] = toMoney((totais[m.tipo] ?? toMoney("0.00")).plus(v));
  }
  const saldos = calcularSaldos(totais);

  const confrontos: ConfrontoOrcamentario[] = [
    {
      conta: contas.disponivel,
      peloRazao: saldoCredor(porCodigo.get(contas.disponivel)),
      pelosMovimentos: saldos.disponivel,
    },
    {
      conta: contas.reservado,
      peloRazao: saldoCredor(porCodigo.get(contas.reservado)),
      pelosMovimentos: saldos.reservado,
    },
    {
      conta: contas.empenhado,
      peloRazao: saldoCredor(porCodigo.get(contas.empenhado)),
      pelosMovimentos: saldos.empenhado,
    },
  ];

  for (const c of confrontos) {
    if (c.peloRazao.equals(c.pelosMovimentos)) continue;
    throw new Error(
      `A1-orc NÃO FECHA na conta ${c.conta}: o RAZÃO diz ${c.peloRazao.toFixed(2)} e os ` +
        `MOVIMENTOS DE DOTAÇÃO dizem ${c.pelosMovimentos.toFixed(2)}. Diferença: ` +
        `${toMoney(c.pelosMovimentos.minus(c.peloRazao)).toFixed(2)}. São duas leituras ` +
        `INDEPENDENTES do mesmo orçamento — e o balancete NÃO pega isto (todo lançamento ` +
        `fecha um a um). Foi assim que a dotação passou blocos inteiros sem perna no ` +
        `razão: falta (ou sobra) um lançamento de dotação.`
    );
  }

  return confrontos;
}
