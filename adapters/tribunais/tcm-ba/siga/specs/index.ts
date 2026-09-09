import type { ArquivoSpec } from "../tipos.js";
import { SPEC_CONCILIA } from "./concilia.js";
import { SPEC_CONTA_CONT } from "./conta-cont.js";
import { SPEC_DOTACAO } from "./dotacao.js";
import { SPEC_EMPENHO } from "./empenho.js";
import { SPEC_ESP_DESP } from "./esp-desp.js";
import { SPEC_ESP_REC } from "./esp-rec.js";
import { SPEC_ESTOR_REC } from "./estor-rec.js";
import { SPEC_FONTE } from "./fonte.js";
import { SPEC_LIQ_EMP } from "./liq-emp.js";
import { SPEC_MOV_CONTA } from "./mov-conta.js";
import { SPEC_ORGAO } from "./orgao.js";
import { SPEC_PAG_EMP2 } from "./pag-emp2.js";
import { SPEC_PROJ_ATV } from "./proj-atv.js";
import { SPEC_REC_ARREC } from "./rec-arrec.js";
import { SPEC_UNID_ORCA } from "./unid-orca.js";

export { SPEC_CONCILIA, CONCILIACAO_MOVIMENTACAO_SALDO, TP_PAGAMENTO_EXIGIDO_NO_TIPO_3, DETALHE_EXIGIDO_NO_TIPO_3 } from "./concilia.js";
export { SPEC_CONTA_CONT } from "./conta-cont.js";
export { SPEC_DOTACAO } from "./dotacao.js";
export { SPEC_EMPENHO, LIMITE_HISTORICO_EMPENHO } from "./empenho.js";
export { SPEC_ESP_DESP } from "./esp-desp.js";
export { SPEC_ESP_REC } from "./esp-rec.js";
export { SPEC_ESTOR_REC } from "./estor-rec.js";
export { SPEC_FONTE } from "./fonte.js";
export { SPEC_LIQ_EMP } from "./liq-emp.js";
export { SPEC_MOV_CONTA } from "./mov-conta.js";
export { SPEC_ORGAO, MINIMO_ORGAOS_SIGA, TP_PODER_LEGISLATIVO } from "./orgao.js";
export { SPEC_PAG_EMP2 } from "./pag-emp2.js";
export { SPEC_PROJ_ATV } from "./proj-atv.js";
export { SPEC_REC_ARREC } from "./rec-arrec.js";
export { SPEC_UNID_ORCA } from "./unid-orca.js";

/**
 * ⚠️ O SUFIXO QUE BLOQUEIA A GERAÇÃO.
 *
 * Uma spec cujo `origemSpec` termina em `-INCOMPLETO` tem GEOMETRIA conferida mas DOMÍNIO
 * faltante: existe campo obrigatório cujos valores válidos não constam do manual v44. Gerar assim
 * produziria um arquivo que o TCM ACEITA (qualquer dígito cabe no campo) e que classifica o dado
 * numa categoria inventada — o pior resultado possível, porque não há recusa que denuncie.
 *
 * A marca é lida em RUNTIME (`ehGeravel`), não é só documentação: o `montarPacoteSiga` recusa, e o
 * validador emite SIGA-E014.
 */
const SUFIXO_INCOMPLETO = "-INCOMPLETO";

export function ehGeravel(spec: ArquivoSpec): boolean {
  return !spec.origemSpec.endsWith(SUFIXO_INCOMPLETO);
}

/** A ordem de carga entre módulos. O TCM recusa o arquivo cujo pré-requisito não entrou. */
const ORDEM_MODULO: Record<string, number> = {
  BASICOS: 1,
  PROGRAMA: 2,
  ORCAMENTO: 3,
  CONSUMO: 4,
  INFORMES: 5,
  NAO_APLICAVEL: 9,
};

function ordenar(specs: readonly ArquivoSpec[]): readonly ArquivoSpec[] {
  return [...specs].sort((a, b) => {
    const modulo = (ORDEM_MODULO[a.modulo] ?? 99) - (ORDEM_MODULO[b.modulo] ?? 99);
    return modulo !== 0 ? modulo : a.ordem - b.ordem;
  });
}

/**
 * TODAS as specs transcritas — inclusive as incompletas. É a lista que os testes de geometria
 * varrem: uma spec bloqueada para geração continua tendo de FECHAR, senão a transcrição está
 * errada e ninguém saberia.
 */
export const SPECS_TRANSCRITAS: readonly ArquivoSpec[] = ordenar([
  // Lote 1 — o caminho crítico da despesa.
  SPEC_CONTA_CONT,
  SPEC_DOTACAO,
  SPEC_EMPENHO,
  SPEC_LIQ_EMP,
  SPEC_PAG_EMP2,
  // Lote 2 — o que fecha uma remessa mensal.
  SPEC_FONTE,
  SPEC_ORGAO,
  SPEC_UNID_ORCA,
  SPEC_PROJ_ATV,
  SPEC_ESP_REC,
  SPEC_ESP_DESP,
  SPEC_REC_ARREC,
  SPEC_ESTOR_REC,
  SPEC_MOV_CONTA,
  SPEC_CONCILIA,
]);

/** As que podem ser geradas hoje — `SPECS_TRANSCRITAS` menos as bloqueadas por domínio ausente. */
export const SPECS_GERAVEIS: readonly ArquivoSpec[] = SPECS_TRANSCRITAS.filter(ehGeravel);

/** As bloqueadas, para o validador nomeá-las. Hoje: MovConta (32) — `tp_MovContabil` sem domínio. */
export const SPECS_INCOMPLETAS: readonly ArquivoSpec[] = SPECS_TRANSCRITAS.filter(
  (s) => !ehGeravel(s)
);

/**
 * O caminho crítico da despesa (lote 1). Mantido como recorte nomeado porque é o subconjunto que
 * o golden test e a POC exercitam de ponta a ponta: conta → dotação → empenho → liquidação →
 * pagamento.
 */
export const SPECS_CAMINHO_CRITICO: readonly ArquivoSpec[] = ordenar([
  SPEC_CONTA_CONT,
  SPEC_DOTACAO,
  SPEC_EMPENHO,
  SPEC_LIQ_EMP,
  SPEC_PAG_EMP2,
]);
