import { toMoney } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
// ═══ ZERO ARITMÉTICA NOVA: os dois lados vêm do bloco 1. ═══
import { anexo8 } from "./rreo-anexo8.js";
import { rgfAnexo5 } from "./rgf-anexo5.js";
import { despesaPorFonte } from "../m05-despesa/consultas.js";
import { janelaCivilDoAno, janelaCivilDoMes } from "../../packages/datas/index.js";

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

/**
 * MDE — O DIFERIMENTO DO ART. 25, §3º da Lei 14.113/2020.
 *
 * ═══ A REGRA ═══
 * Os recursos do FUNDEB são para o exercício em que foram creditados (art. 25, caput).
 * O §3º abre UMA exceção estreita: **até 10%** dos valores recebidos à conta dos Fundos
 * (inclusive a complementação) podem ser usados no **1º quadrimestre** do exercício
 * imediatamente subsequente, **mediante abertura de crédito adicional**. Ao fim do
 * exercício, as disponibilidades — inclusive as destinadas a cobrir restos a pagar —
 * **permanecem em conta vinculada**.
 *
 * ═══ ⚠️ ESTE MOTOR NÃO TRUNCA ═══
 * Se o não aplicado passa dos 10%, o número sai como é e a linha ACUSA. Limitá-lo ao
 * teto ("o ente diferiu 10%") esconderia a irregularidade de quem a fiscaliza: o excesso
 * não vira diferimento legal por ser reescrito — ele vira glosa.
 *
 * ═══ ZERO ARITMÉTICA NOVA ═══
 * `recebido` é a linha 6 do bloco 1 (`totalRecebidoFundeb`) e `aplicado` é a linha 10
 * (`despesaFundebTotal.acompanhamento`), que já carrega a regra bimestral — liquidada
 * nos bimestres 1-5, empenhada no 6º. Recalcular aqui seria a segunda verdade sobre o
 * mesmo FUNDEB.
 */

/** Os 10% do §3º. Percentual, não fração — a divisão por 100 fica na conta. */
const PERC_DIFERIMENTO = toMoney("10");

export interface DiferimentoFundeb {
  readonly exercicio: number;
  /** (6) do Anexo 8 — recebido à conta dos Fundos, inclusive complementação. */
  readonly recebido: string;
  /** (10) do Anexo 8 — o acompanhamento (no 6º bimestre: a EMPENHADA). */
  readonly aplicado: string;
  /** recebido − aplicado. É ele que se compara ao teto. */
  readonly naoAplicado: string;
  /** 10% × recebido. */
  readonly limite: string;
  /** ⚠️ `naoAplicado > limite`. Não é erro do relatório: é achado sobre o ente. */
  readonly estourou: boolean;
  /** O tamanho da glosa: naoAplicado − limite quando estoura; 0,00 quando não. */
  readonly excesso: string;

  /** As fontes classificadas FUNDEB no de-para — o recorte desta apuração. */
  readonly fontesFundeb: readonly string[];
  /** A disponibilidade líquida (i) dessas fontes no Anexo 5, em 31/12. */
  readonly disponibilidadeLiquida: string;
  /** ⚠️ R-DIF — informativo, não guard. Ver `SOBRE_R_DIF`. */
  readonly lastreado: boolean;

  /**
   * O aplicado na JANELA do §3º (01/01 a 30/04 do exercício seguinte). `null` = a
   * janela ainda não teve movimento — melhor dizer "não houve" do que exibir 0,00 e
   * deixar o leitor achar que o ente diferiu e não aplicou.
   */
  readonly aplicadoNaJanela: string | null;
}

/**
 * ⚠️ R-DIF É IDENTIDADE DE FIXTURE + NOTA, **NÃO GUARD** — e a razão é dos CORTES.
 *
 * São dois caminhos até o mesmo dinheiro: o motor MDE (o que o FUNDEB recebeu menos o
 * que aplicou) e o Anexo 5 (o que sobrou na conta daquela fonte). No fim do exercício
 * eles têm de bater — é o que o §3º pressupõe ao mandar o saldo "permanecer em conta
 * vinculada". E a álgebra explica por quê: quando o empenhado é todo liquidado e não há
 * RP, `(arrecadado − pago) − (liquidado − pago) = arrecadado − liquidado`, que é
 * exatamente o não aplicado.
 *
 * Mas os dois leem cortes DIFERENTES por construção: o Anexo 8 é BIMESTRAL e o Anexo 5,
 * QUADRIMESTRAL. Só no 6º bimestre / 3º quadrimestre ambos olham para 31/12. Fora disso,
 * divergir é o comportamento CERTO — e um guard transformaria o normal em erro,
 * derrubando o relatório de abril por uma diferença que a norma prevê.
 *
 * ⚠️ E A RELAÇÃO É `≤`, NÃO `==`: a conta da fonte pode ter MAIS do que o não aplicado
 * do exercício (um superávit de exercícios anteriores, por exemplo). O que a norma
 * proíbe é o contrário — diferir dinheiro que não está lá.
 *
 * Por isso `lastreado` é campo informativo, e quem prova a identidade é o teste.
 */
export const SOBRE_R_DIF =
  "R-DIF: naoAplicado ≤ disponibilidade líquida (i) da fonte no Anexo 5, em 31/12. " +
  "Informativo, não guard: o Anexo 8 é bimestral e o Anexo 5 é quadrimestral — só no " +
  "fim do exercício ambos olham o mesmo instante. E é ≤, não ==: a fonte pode ter " +
  "superávit anterior.";

/**
 * A janela do §3º: 01/01 a 30/04 do exercício SEGUINTE.
 *
 * ⚠️ POR DATA DO FATO, não por um campo "exercício": o exercício é CONSEQUÊNCIA da data
 * (a doutrina do `campoData`, a mesma do Anexo 3). Um pagamento de 30/04 lançado em maio
 * pertence a abril, e é abril que a lei nomeia.
 */
export function janelaDoDiferimento(exercicio: number): {
  readonly inicio: Date;
  readonly fim: Date;
} {
  return {
    inicio: janelaCivilDoAno(exercicio + 1).inicio,
    fim: janelaCivilDoMes(`${exercicio + 1}-04`).fim,
  };
}

export async function diferimentoFundeb(
  prisma: Tx,
  p: { readonly exercicio: number }
): Promise<DiferimentoFundeb> {
  // O bloco 1 no 6º bimestre: o retrato de 31/12, que é o que o §3º pergunta.
  const a8 = await anexo8(prisma, { exercicio: p.exercicio, bimestre: 6 });
  const recebido = toMoney(a8.totalRecebidoFundeb);
  const aplicado = toMoney(a8.despesaFundebTotal.acompanhamento);
  const naoAplicado = toMoney(recebido.minus(aplicado));

  const limite = toMoney(recebido.times(PERC_DIFERIMENTO).div(100));
  const estourou = naoAplicado.greaterThan(limite);
  const excesso = estourou ? toMoney(naoAplicado.minus(limite)) : toMoney("0.00");

  // As fontes do FUNDEB — do de-para que o bloco 1 já usa (o fail-closed é dele).
  const deParas = await prisma.deParaFonteClasseEducacao.findMany({
    where: { classe: "FUNDEB" },
    select: { fonteCodigo: true },
  });
  const fontesFundeb = deParas.map((d) => d.fonteCodigo).sort();

  // O OUTRO caminho até o mesmo saldo — ver `SOBRE_R_DIF`.
  const a5 = await rgfAnexo5(prisma, {
    exercicio: p.exercicio,
    corte: janelaCivilDoAno(p.exercicio).fim,
  });
  let disponibilidadeLiquida = toMoney("0.00");
  for (const linha of a5.linhas) {
    if (!fontesFundeb.includes(linha.fonte)) continue;
    disponibilidadeLiquida = toMoney(
      disponibilidadeLiquida.plus(toMoney(linha.disponibilidadeLiquidaDepois))
    );
  }

  return {
    exercicio: p.exercicio,
    recebido: recebido.toFixed(2),
    aplicado: aplicado.toFixed(2),
    naoAplicado: naoAplicado.toFixed(2),
    limite: limite.toFixed(2),
    estourou,
    excesso: excesso.toFixed(2),
    fontesFundeb,
    disponibilidadeLiquida: disponibilidadeLiquida.toFixed(2),
    lastreado: naoAplicado.lessThanOrEqualTo(disponibilidadeLiquida),
    aplicadoNaJanela: await aplicadoNaJanela(prisma, p.exercicio, fontesFundeb),
  };
}

/**
 * O QUE SE APLICOU NA JANELA (01/01 a 30/04 do seguinte), nas fontes do FUNDEB.
 *
 * ⚠️ DOIS CORTES DO MESMO LEITOR, sem leitor novo: `despesaPorFonte` corta pela data do
 * FATO e devolve o pago da fonte ATÉ um instante. A diferença entre 30/04 do seguinte e
 * 31/12 é, por definição, o que aconteceu no meio — a janela.
 *
 * ⚠️ MEDIDO PELO PAGO BRUTO: é o que de fato saiu da conta vinculada, e é o saldo dela
 * que o §3º governa.
 */
async function aplicadoNaJanela(
  prisma: Tx,
  exercicio: number,
  fontesFundeb: readonly string[]
): Promise<string | null> {
  if (fontesFundeb.length === 0) return null;

  const { fim } = janelaDoDiferimento(exercicio);
  const fechamento = janelaCivilDoAno(exercicio).fim;

  const ate30Abril = await despesaPorFonte(prisma, { ate: fim });
  const ate31Dez = await despesaPorFonte(prisma, { ate: fechamento });

  // `despesaPorFonte` é indexada por `fonteId`; o de-para fala em CÓDIGO.
  const fontes = await prisma.fonteRecurso.findMany({
    select: { id: true, codigo: true },
  });

  const zero = toMoney("0.00");
  let total = zero;
  let houve = false;
  for (const f of fontes) {
    if (!fontesFundeb.includes(f.codigo)) continue;
    const depois = ate30Abril.get(f.id)?.pagoBruto ?? zero;
    const antes = ate31Dez.get(f.id)?.pagoBruto ?? zero;
    const naJanela = toMoney(depois.minus(antes));
    if (naJanela.greaterThan(0)) houve = true;
    total = toMoney(total.plus(naJanela));
  }

  return houve ? total.toFixed(2) : null;
}
