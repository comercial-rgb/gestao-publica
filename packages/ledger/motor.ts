import { assertBalanced, sumMoney } from "../contracts/index.js";
import type { Partida, Subsistema } from "./lancamento.js";

/**
 * DOMAIN PURO — valida as partidas de um lançamento e aplica os invariantes de
 * partidas dobradas. NÃO persiste nada, NÃO conhece Prisma, NÃO consulta o
 * plano de contas.
 *
 * FAIL-CLOSED (INVARIANTE 5): qualquer violação lança erro descritivo; o
 * lançamento nunca é persistido.
 *
 * Invariantes aplicados (INVARIANTE 4 — perna única):
 * (a) ao menos uma partida;
 * (b) todo valor > 0;
 * (c) ao menos 1 DEBITO e ao menos 1 CREDITO;
 * (d) ΣDEBITO == ΣCREDITO (assertBalanced);
 * (e) (c) e (d) valem também DENTRO de cada subsistema em que há partidas —
 *     no MCASP cada subsistema fecha sozinho, e sem isso um orçamentário
 *     desbalanceado poderia ser "compensado" por um patrimonial no mesmo
 *     lançamento, fazendo o total fechar mentindo.
 * (f) o SUBSISTEMA declarado na perna bate com a NATUREZA DE INFORMAÇÃO da
 *     conta (o 1º dígito do código PCASP) — ver `NATUREZA_DA_CLASSE`.
 *
 * Fora daqui (precisa de banco, vive no adapter do M01):
 * - conta existe e é ANALÍTICA;
 * - lançamento já estornado.
 */

/**
 * A NATUREZA DE INFORMAÇÃO DE CADA CLASSE PCASP — o 1º dígito do código.
 *
 * ═══ POR QUE ESTE RECORD EXISTE (o furo que ele fecha) ═══
 * `subsistema` era um RÓTULO que o chamador punha na perna, e NADA o amarrava à
 * conta. Uma perna podia dizer `subsistema: "ORCAMENTARIO"` sobre a conta
 * `1.1.1.1.2.00.00` (Bancos) e passar — o invariante (e) só conferia que cada
 * subsistema fechava sozinho, e um rótulo torto fecha tão bem quanto um certo.
 *
 * O estrago de um rótulo torto é silencioso e tardio: o razão do subsistema
 * orçamentário passaria a conter o caixa, o balanço orçamentário somaria
 * disponibilidade como se fosse crédito, e a divergência só apareceria no
 * fechamento — quando ninguém mais lembra de qual lançamento veio.
 *
 * A regra do MCASP é dura: um lançamento só movimenta contas da MESMA natureza de
 * informação. Patrimonial (1-4), orçamentária (5-6), controle (7-8). O rótulo não
 * é opinião do chamador: é consequência do código da conta.
 *
 * ⚠️ EXAUSTIVO E FAIL-CLOSED. Um código que comece por outra coisa (0, 9, letra)
 * não tem natureza definida e DERRUBA o lançamento, em vez de escolher um
 * subsistema no chute.
 */
const NATUREZA_DA_CLASSE: Readonly<Record<string, Subsistema>> = {
  "1": "PATRIMONIAL", // ATIVO
  "2": "PATRIMONIAL", // PASSIVO E PATRIMÔNIO LÍQUIDO
  "3": "PATRIMONIAL", // VARIAÇÃO PATRIMONIAL DIMINUTIVA
  "4": "PATRIMONIAL", // VARIAÇÃO PATRIMONIAL AUMENTATIVA
  "5": "ORCAMENTARIO", // CONTROLES DA APROVAÇÃO DO PLANEJAMENTO E ORÇAMENTO
  "6": "ORCAMENTARIO", // CONTROLES DA EXECUÇÃO DO PLANEJAMENTO E ORÇAMENTO
  "7": "CONTROLE", // CONTROLES DEVEDORES
  "8": "CONTROLE", // CONTROLES CREDORES
};

export function validarLancamento(
  partidas: readonly Partida[]
): readonly Partida[] {
  // (a) ao menos uma partida
  if (partidas.length === 0) {
    throw new Error("Lançamento vazio: é necessária ao menos uma partida.");
  }

  // (b) valor > 0
  for (const [i, partida] of partidas.entries()) {
    if (!partida.valor.isFinite() || partida.valor.lessThanOrEqualTo(0)) {
      throw new Error(
        `Partida ${i} (${partida.tipo} em ${partida.conta}): valor deve ser > 0, ` +
          `recebido ${partida.valor.toString()}.`
      );
    }
  }

  // (f) o rótulo bate com a conta — antes de qualquer soma. Um lançamento com
  // rótulo torto não é "quase certo": ele contamina o razão do subsistema errado.
  for (const [i, partida] of partidas.entries()) {
    const classe = partida.conta.charAt(0);
    const esperado = NATUREZA_DA_CLASSE[classe];

    if (esperado === undefined) {
      throw new Error(
        `Partida ${i} (${partida.tipo} em ${partida.conta}): classe PCASP ` +
          `"${classe}" desconhecida — o código de uma conta começa por 1 a 8. ` +
          `Sem classe não há natureza de informação, e sem natureza não dá para ` +
          `dizer em que razão esta perna entra.`
      );
    }

    if (esperado !== partida.subsistema) {
      throw new Error(
        `Partida ${i} (${partida.tipo} em ${partida.conta}): subsistema ` +
          `declarado ${partida.subsistema}, mas a classe ${classe} é ${esperado}. ` +
          `Um lançamento só movimenta contas da MESMA natureza de informação ` +
          `(patrimonial 1-4, orçamentária 5-6, controle 7-8) — o rótulo não é ` +
          `escolha do chamador, é consequência do código da conta. Corrija o ` +
          `ROTEIRO: ou a conta está errada, ou o subsistema está.`
      );
    }
  }

  // (c) + (d) no lançamento inteiro
  conferirPartidasDobradas(partidas, "lançamento");

  // (e) + o mesmo dentro de cada subsistema presente
  const subsistemas = new Set<Subsistema>(partidas.map((p) => p.subsistema));
  if (subsistemas.size > 1) {
    for (const subsistema of subsistemas) {
      conferirPartidasDobradas(
        partidas.filter((p) => p.subsistema === subsistema),
        `subsistema ${subsistema}`
      );
    }
  }

  return partidas;
}

/**
 * (c) ≥1 débito e ≥1 crédito, e (d) ΣDEBITO == ΣCREDITO — num conjunto de
 * partidas. `escopo` só descreve o conjunto na mensagem de erro.
 */
function conferirPartidasDobradas(
  partidas: readonly Partida[],
  escopo: string
): void {
  const debitos = partidas.filter((p) => p.tipo === "DEBITO");
  const creditos = partidas.filter((p) => p.tipo === "CREDITO");

  // (c) ao menos 1 débito e ao menos 1 crédito
  if (debitos.length === 0 || creditos.length === 0) {
    throw new Error(
      `Partida simples no ${escopo}: são necessários ao menos 1 débito e ` +
        `1 crédito (recebido ${debitos.length} débito(s) e ` +
        `${creditos.length} crédito(s)).`
    );
  }

  // (d) ΣDEBITO == ΣCREDITO
  try {
    assertBalanced(
      debitos.map((p) => p.valor),
      creditos.map((p) => p.valor)
    );
  } catch (causa) {
    throw new Error(
      `Desbalanceado no ${escopo}: ` +
        `débitos = ${sumMoney(debitos.map((p) => p.valor)).toFixed(2)}, ` +
        `créditos = ${sumMoney(creditos.map((p) => p.valor)).toFixed(2)}.`,
      { cause: causa }
    );
  }
}
