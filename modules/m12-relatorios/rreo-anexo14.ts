import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { anexo1 } from "./rreo-anexo1.js";
import { anexo3 } from "./rreo-anexo3.js";
import { anexo6 } from "./rreo-anexo6.js";
import { anexo6AbaixoDaLinha } from "./rreo-anexo6-abaixo.js";
import { anexo7 } from "./rreo-anexo7.js";
import { anexo8 } from "./rreo-anexo8.js";
import { anexo11 } from "./rreo-anexo11.js";
import { anexo12 } from "./rreo-anexo12.js";
import type { Bimestre } from "./rreo-anexo1.js";
import { situacaoDePiso, type LinhaSimplificada } from "./simplificado.js";

/**
 * RREO — ANEXO 14: DEMONSTRATIVO SIMPLIFICADO DO RREO (Tabela 14.0). LRF art. 48 · art. 52.
 *
 * ═══ O QUE É ═══
 * A CAPA do RREO: o balanço orçamentário, os resultados (primário e nominal), os restos a pagar, os
 * mínimos constitucionais (educação, saúde) e a RCL — cada um lido do seu anexo analítico. É o que
 * a LRF manda publicar de forma acessível, com o detalhe remetido a cada anexo.
 *
 * ═══ ⚠️ CONSOLIDAÇÃO, NÃO RECÁLCULO (ver `simplificado.ts`) ═══ — cada linha repete o campo do dono.
 *
 * ═══ ⚠️ OS DOIS FUROS QUE O SIMPLIFICADO DECLARA (não zera) ═══
 * · RESULTADO NOMINAL ACIMA (XXVII) é `null` (o XXV é interruptor desde a 7.8-a). O simplificado usa
 *   o nominal CONCRETO do abaixo-da-linha (variação da DCL) e nomeia que o de-cima não fecha.
 * · RPPS (o Anexo 4, previdenciário) não existe ainda — `ANEXO4-PENDENTE`. O simplificado DECLARA a
 *   ausência do bloco em vez de publicá-lo zerado, que afirmaria "não há RPPS" quando o que há é
 *   "ainda não medimos".
 * · MDE-25: o Anexo 8 expõe o indicador dos PROFISSIONAIS (FUNDEB, 70%), não o % aplicado no mínimo
 *   de 25% (CF 212) — este último não é campo do dono. Mostramos o que o Anexo 8 tem e nomeamos o furo.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export interface Anexo14Rreo {
  readonly exercicio: number;
  readonly bimestre: Bimestre;
  readonly linhas: readonly LinhaSimplificada[];
  readonly notas: readonly string[];
}

const valor = (
  chave: string,
  rotulo: string,
  fonte: string,
  fonteHref: string,
  v: string,
  interruptor = false
): LinhaSimplificada => ({
  chave, rotulo, fonte, fonteHref, valor: v, percentual: null, limite: null, situacao: null, interruptor,
});

export async function rreoAnexo14(
  leitor: Tx,
  p: { readonly exercicio: number; readonly bimestre: Bimestre }
): Promise<Anexo14Rreo> {
  const [a1, a6, a6b, a7, a8, a12, a3, a11] = await Promise.all([
    anexo1(leitor, p),
    anexo6(leitor, p),
    anexo6AbaixoDaLinha(leitor, p),
    anexo7(leitor, { exercicio: p.exercicio }),
    anexo8(leitor, p),
    anexo12(leitor, p),
    anexo3(leitor, p),
    anexo11(leitor, p),
  ]);

  const RREO1 = { fonte: "RREO Anexo 1", href: "/relatorios/rreo/anexo1" };
  const RREO6 = { fonte: "RREO Anexo 6", href: "/relatorios/rreo/anexo6" };
  const RREO7 = { fonte: "RREO Anexo 7", href: "/relatorios/rreo/anexo7" };
  const RREO8 = { fonte: "RREO Anexo 8", href: "/relatorios/rreo/anexo8" };
  const RREO12 = { fonte: "RREO Anexo 12", href: "/relatorios/rreo/anexo12" };
  const RREO3 = { fonte: "RREO Anexo 3", href: "/relatorios/rreo/anexo3" };
  const RREO11 = { fonte: "RREO Anexo 11", href: "/relatorios/rreo/anexo11" };

  const linhas: LinhaSimplificada[] = [
    // ── BALANÇO ORÇAMENTÁRIO (← Anexo 1) ──
    valor("REC_PREVISTA", "Receita prevista (atualizada)", RREO1.fonte, RREO1.href, a1.subtotalReceitas.previsaoAtualizada),
    valor("REC_REALIZADA", "Receita realizada (até o bimestre)", RREO1.fonte, RREO1.href, a1.subtotalReceitas.ateBimestre),
    valor("DESP_DOTACAO", "Despesa autorizada (dotação atualizada)", RREO1.fonte, RREO1.href, a1.subtotalDespesas.dotacaoAtualizada),
    valor("DESP_EMPENHADA", "Despesa empenhada (até o bimestre)", RREO1.fonte, RREO1.href, a1.subtotalDespesas.empenhadasAte),
    valor("DESP_LIQUIDADA", "Despesa liquidada (até o bimestre)", RREO1.fonte, RREO1.href, a1.subtotalDespesas.liquidadasAte),
    valor("DESP_PAGA", "Despesa paga (até o bimestre)", RREO1.fonte, RREO1.href, a1.subtotalDespesas.pagasAte),
    valor("RESULTADO_ORCAMENTARIO", a1.superavit !== "0.00" ? "Superávit orçamentário" : "Déficit orçamentário", RREO1.fonte, RREO1.href, a1.superavit !== "0.00" ? a1.superavit : a1.deficit),

    // ── RESULTADOS (← Anexo 6) ──
    valor("RESULTADO_PRIMARIO", "Resultado primário (acima da linha, XXIV)", RREO6.fonte, RREO6.href, a6.resultadoPrimario),
    valor("RESULTADO_NOMINAL", "Resultado nominal (abaixo da linha — variação da DCL)", RREO6.fonte, RREO6.href, a6b.resultadoNominal),

    // ── RESTOS A PAGAR por tipo (← Anexo 7) ──
    valor("RP_PROCESSADOS", "Restos a Pagar Processados (saldo)", RREO7.fonte, RREO7.href, a7.total.saldoB1),
    valor("RP_NAO_PROCESSADOS", "Restos a Pagar Não Processados (saldo)", RREO7.fonte, RREO7.href, a7.total.saldoB2),

    // ── EDUCAÇÃO (← Anexo 8): o indicador dos profissionais (FUNDEB, 70%) ──
    {
      chave: "EDUCACAO_PROFISSIONAIS",
      rotulo: "Educação — Profissionais da Educação Básica (FUNDEB, art. 212-A XI)",
      fonte: RREO8.fonte, fonteHref: RREO8.href,
      // O valor de ACOMPANHAMENTO é o que o indicador usa (liquidada nos bim 1-5, empenhada no 6º).
      valor: a8.despesaProfissionais.acompanhamento,
      percentual: a8.indicadorProfissionais,
      limite: a8.limiteProfissionais,
      situacao: situacaoDePiso(a8.atingiuProfissionais),
      interruptor: false,
    },

    // ── SAÚDE (← Anexo 12): ASPS, mínimo de 15% ──
    {
      chave: "SAUDE_ASPS",
      rotulo: "Saúde — Aplicação em ASPS (mínimo 15%, LC 141/2012)",
      fonte: RREO12.fonte, fonteHref: RREO12.href,
      valor: a12.totalAsps,
      percentual: a12.percentualAplicacao,
      limite: a12.limitePercentual,
      situacao: situacaoDePiso(a12.atingiuMinimo),
      interruptor: false,
    },

    // ── ALIENAÇÃO DE ATIVOS (← Anexo 11) ──
    valor("ALIENACAO_RECEITA", "Alienação de ativos — receita realizada", RREO11.fonte, RREO11.href, a11.totalReceitas.realizada),
    valor("ALIENACAO_APLICACAO", "Alienação de ativos — aplicação (paga)", RREO11.fonte, RREO11.href, a11.totalAplicacao.paga),

    // ── RCL (← Anexo 3) ──
    valor("RCL", "Receita Corrente Líquida (RCL)", RREO3.fonte, RREO3.href, a3.rcl.total12m),

    // ── RPPS — o Anexo 4 (previdenciário) ainda não existe: DECLARA a ausência ──
    valor("RPPS", "Regime Próprio de Previdência (RPPS) — Anexo 4", "— (pendente)", "", "—", true),
  ];

  const notas: string[] = [
    "Demonstrativo SIMPLIFICADO: cada linha repete o número do anexo analítico dono dele. O detalhe " +
      "e a memória de cálculo moram no anexo de origem indicado.",
    "RESULTADO-NOMINAL-XXVII-NULL: o resultado nominal ACIMA da linha (XXVII) é `null` — falta o XXV " +
      "(juros ativos, interruptor). O simplificado usa o nominal CONCRETO do abaixo-da-linha (a " +
      "variação da DCL), que mede o mesmo resultado pelo estoque sem depender do XXV.",
    "MDE-25-NAO-CONSOLIDADO: o Anexo 8 é dono do indicador dos PROFISSIONAIS da educação (FUNDEB, " +
      "70%), não do percentual aplicado no mínimo de 25% (CF 212) — este não é campo do Anexo 8. O " +
      "simplificado mostra o que o dono tem e não recalcula o 25% por conta própria.",
    "ANEXO4-PENDENTE: o demonstrativo previdenciário (RREO Anexo 4, RPPS/IPSEM) aguarda o universo " +
      "de dados do regime próprio. O bloco RPPS é DECLARADO ausente, não publicado zerado — zero " +
      "afirmaria que não há regime próprio, quando o que há é que ainda não o medimos.",
  ];

  return { exercicio: p.exercicio, bimestre: p.bimestre, linhas, notas };
}
