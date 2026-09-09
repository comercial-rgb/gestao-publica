import { toMoney } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { rgfAnexo1 } from "./rgf-anexo1.js";
import { rgfAnexo2 } from "./rgf-anexo2.js";
import { rgfAnexo3 } from "./rgf-anexo3.js";
import { rgfAnexo4 } from "./rgf-anexo4.js";
import { rgfAnexo5 } from "./rgf-anexo5.js";
import type { Quadrimestre } from "./rgf-anexo1.js";
import {
  situacaoDePessoal,
  situacaoDeTeto,
  type LinhaSimplificada,
} from "./simplificado.js";

/**
 * RGF — ANEXO 6: DEMONSTRATIVO SIMPLIFICADO DA GESTÃO FISCAL (Tabela 6.4). LRF art. 48 · art. 55, §2º.
 *
 * ═══ O QUE É ═══
 * A CAPA do RGF: numa tabela só, o resultado de cada limite (pessoal, dívida, garantias, operações
 * de crédito) — VALOR, % sobre a RCL ajustada e LIMITE. É o que a LRF manda publicar em jornal e
 * portal, e é a porta de entrada para os anexos analíticos, onde o detalhe mora.
 *
 * ═══ ⚠️ CONSOLIDAÇÃO, NÃO RECÁLCULO (ver `simplificado.ts`) ═══
 * Cada linha LÊ o campo do motor de origem. Nenhum número nasce aqui — se nascesse, o simplificado
 * poderia divergir do analítico. O `situacao` é derivado dos MESMOS booleanos de limite que o anexo
 * de origem calculou. O teste de identidade trava cada linha contra o seu dono.
 *
 * ═══ ⚠️ O BLOCO DO ANEXO 5 SÓ NO 3º QUADRIMESTRE (regra oficial) ═══
 * A disponibilidade de caixa e a inscrição de restos a pagar são apuradas no ÚLTIMO quadrimestre —
 * é quando o exercício fecha e a decisão de inscrever RP acontece. Nos quadrimestres 1 e 2 o bloco
 * NÃO aparece (não é zero — é ausência de fato), e `blocoDisponibilidade` sai `null`.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export interface BlocoDisponibilidade {
  /** Σ das fontes: disponibilidade líquida ANTES da inscrição de RPNP (f). */
  readonly disponibilidadeAntesRpnp: string;
  /** Σ das fontes: RP empenhados e não liquidados do exercício (g). */
  readonly rpnpDoExercicio: string;
  /** A disponibilidade consolidada APÓS a inscrição (i) — o `totalLiquidaDepois` do Anexo 5. */
  readonly disponibilidadeApos: string;
}

export interface Anexo6Rgf {
  readonly exercicio: number;
  readonly quadrimestre: Quadrimestre;
  /** As linhas de limite (pessoal por poder, dívida, garantias, operações de crédito, ARO). */
  readonly linhas: readonly LinhaSimplificada[];
  /** Só no 3º quadrimestre; `null` nos demais. */
  readonly blocoDisponibilidade: BlocoDisponibilidade | null;
  readonly notas: readonly string[];
}

export async function rgfAnexo6(
  prisma: Tx,
  p: { readonly exercicio: number; readonly quadrimestre: Quadrimestre }
): Promise<Anexo6Rgf> {
  const [a1, a2, a3, a4] = await Promise.all([
    rgfAnexo1(prisma, p),
    rgfAnexo2(prisma, p),
    rgfAnexo3(prisma, p),
    rgfAnexo4(prisma, p),
  ]);

  const linhas: LinhaSimplificada[] = [];

  // ── DESPESA COM PESSOAL, por Poder (← Anexo 1) — cada poder com seu limite (54/6). ──
  for (const poder of a1.poderes) {
    linhas.push({
      chave: `PESSOAL_${poder.poder}`,
      rotulo: `Despesa Total com Pessoal — ${poder.rotulo}`,
      fonte: "RGF Anexo 1",
      fonteHref: "/relatorios/rgf/anexo1",
      valor: poder.dtp,
      percentual: poder.percentDtp,
      limite: poder.limiteMaximo,
      situacao: situacaoDePessoal(poder.situacao),
      interruptor: false,
    });
  }

  // ── DÍVIDA CONSOLIDADA LÍQUIDA (← Anexo 2, coluna de referência) ──
  const dv = a2.colunas[a2.colunas.length - 1]!.valores;
  linhas.push({
    chave: "DIVIDA_CONSOLIDADA",
    rotulo: "Dívida Consolidada Líquida",
    fonte: "RGF Anexo 2",
    fonteHref: "/relatorios/rgf/anexo2",
    valor: dv.dividaConsolidadaLiquida,
    percentual: dv.percentDclSobreRcl,
    limite: a2.limiteSenado,
    situacao: situacaoDeTeto(dv.excedeuLimite, dv.emAlerta),
    interruptor: false,
  });

  // ── GARANTIAS DE VALORES (← Anexo 3, coluna de referência) ──
  const gv = a3.colunas[a3.colunas.length - 1]!.valores;
  linhas.push({
    chave: "GARANTIAS",
    rotulo: "Garantias de Valores",
    fonte: "RGF Anexo 3",
    fonteHref: "/relatorios/rgf/anexo3",
    valor: gv.totalGarantias,
    percentual: gv.percentGarantias,
    limite: a3.limiteSenado,
    situacao: situacaoDeTeto(gv.excedeuLimite, gv.emAlerta),
    interruptor: gv.totalGarantias === "0.00",
  });

  // ── OPERAÇÕES DE CRÉDITO (← Anexo 4, acumulado no ano) ──
  linhas.push({
    chave: "OPERACOES_CREDITO",
    rotulo: "Operações de Crédito (internas e externas)",
    fonte: "RGF Anexo 4",
    fonteHref: "/relatorios/rgf/anexo4",
    valor: a4.totalSujeitoAoLimite.ateQuadrimestre,
    percentual: a4.percentSobreRcl,
    limite: a4.limiteSenado,
    situacao: situacaoDeTeto(a4.excedeuLimite, a4.emAlerta),
    interruptor: false,
  });

  // ── ARO (← Anexo 4) — limite próprio de 7%; sem cadastro, é interruptor. ──
  linhas.push({
    chave: "ARO",
    rotulo: "Operações de Crédito por Antecipação de Receita — ARO",
    fonte: "RGF Anexo 4",
    fonteHref: "/relatorios/rgf/anexo4",
    valor: a4.aro.valores.ateQuadrimestre,
    // O Anexo 4 não computa o % da ARO (o valor é sempre zero, sem cadastro) — não inventamos aqui.
    percentual: null,
    limite: a4.aro.limitePercent,
    situacao: situacaoDeTeto(a4.aro.excedeuLimite, null),
    interruptor: a4.aro.valores.ateQuadrimestre === "0.00",
  });

  const notas: string[] = [
    "Demonstrativo SIMPLIFICADO: cada linha repete o número do anexo analítico que é o dono dele " +
      "(o percentual e o limite não são recalculados aqui). O detalhe — e a memória de cálculo — " +
      "mora no anexo de origem indicado em cada linha.",
  ];

  // ── O BLOCO DO ANEXO 5 — SÓ NO 3º QUADRIMESTRE ──
  let blocoDisponibilidade: BlocoDisponibilidade | null = null;
  if (p.quadrimestre === 3) {
    // O Anexo 5 é por CORTE (31/12 do exercício). Ele não tem total consolidado de "antes" nem de
    // "g" — só por fonte (a nota¹ é por vinculação); consolidar é SOMAR as fontes, não recalcular.
    const corte = new Date(Date.UTC(p.exercicio, 12, 0, 23, 59, 59));
    const a5 = await rgfAnexo5(prisma, { exercicio: p.exercicio, corte });
    let antes = toMoney("0.00");
    let rpnp = toMoney("0.00");
    for (const l of a5.linhas) {
      antes = toMoney(antes.plus(toMoney(l.disponibilidadeLiquidaAntes)));
      rpnp = toMoney(rpnp.plus(toMoney(l.rpnpInscritosNoExercicio)));
    }
    blocoDisponibilidade = {
      disponibilidadeAntesRpnp: antes.toFixed(2),
      rpnpDoExercicio: rpnp.toFixed(2),
      disponibilidadeApos: a5.totalLiquidaDepois, // o dono consolidado do (i)
    };
  } else {
    notas.push(
      "DISPONIBILIDADE-SO-NO-3O-QUADRIMESTRE: o bloco de disponibilidade de caixa e inscrição de " +
        "restos a pagar (Anexo 5) só é apurado no último quadrimestre — quando o exercício fecha. " +
        "Nos 1º e 2º ele não aparece: é ausência de fato, não zero."
    );
  }

  return { exercicio: p.exercicio, quadrimestre: p.quadrimestre, linhas, blocoDisponibilidade, notas };
}
