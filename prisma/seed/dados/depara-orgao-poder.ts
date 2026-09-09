/**
 * DE-PARA Órgão → Poder (RREO Anexo 7) — seed MÍNIMO.
 *
 * ⚠️ OS CÓDIGOS DE ÓRGÃO SÃO DADO DO ENTE. O repositório não semeia `Orgao` (cada ente cadastra
 * os seus), então este mapa é um PONTO DE PARTIDA que o ente AJUSTA ao seu cadastro real. O que
 * NÃO muda é a regra: todo órgão que tem Restos a Pagar precisa de um poder aqui, senão o gerador
 * do Anexo 7 PARA nomeando o órgão (fail-closed — é publicação por poder ao TCE).
 *
 * ═══ ROL FECHADO DE PODERES ═══
 * A esfera MUNICIPAL tem dois poderes: EXECUTIVO (Prefeitura e suas secretarias/fundos) e
 * LEGISLATIVO (Câmara). Não há Judiciário nem MP municipais. Um poder novo entra por DECISÃO.
 */

export const PODER_EXECUTIVO = "EXECUTIVO";
export const PODER_LEGISLATIVO = "LEGISLATIVO";

/** Os poderes válidos — o rol fechado. O gerador do Anexo 7 valida contra ele. */
export const PODERES: readonly string[] = [PODER_EXECUTIVO, PODER_LEGISLATIVO];

export interface DeParaOrgaoPoderSeed {
  readonly orgaoCodigo: string;
  readonly poder: string;
}

/**
 * Campina Grande/PB — mapa CONVENCIONAL de partida (ajuste ao cadastro real do ente).
 * "01" Câmara Municipal → LEGISLATIVO; "02" em diante, os órgãos da Prefeitura → EXECUTIVO.
 */
export const DEPARA_ORGAO_PODER: readonly DeParaOrgaoPoderSeed[] = [
  { orgaoCodigo: "01", poder: PODER_LEGISLATIVO },
  { orgaoCodigo: "02", poder: PODER_EXECUTIVO },
];
