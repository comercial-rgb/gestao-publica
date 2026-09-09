export {
  registrarIngressoExtra,
  registrarDispendioExtra,
  estornarMovimentoExtra,
  saldoExtraorcamentario,
  totaisDoConsignatario,
  criarLancamentoExtra,
  exigirTipoAtivo,
} from "./extraorcamentario.js";
export type { SaldoExtra, Tx } from "./extraorcamentario.js";

/**
 * A retenção na fonte é consumida pelos módulos que PAGAM (M05, M08), dentro da
 * transação deles. A seta é sempre M05/M08 → M07, nunca o inverso.
 */
export {
  registrarRetencoesDoPagamento,
  estornarRetencoesDoPagamento,
} from "./retencao.js";
export type {
  RegistrarRetencoesParams,
  EstornarRetencoesParams,
} from "./retencao.js";

export {
  SINAL_MOVIMENTO_EXTRA,
  comporPagamentoComRetencoes,
  comporPartidas,
  roteiroDispendioExtra,
  roteiroIngressoExtra,
  tipoDoEstorno,
  totaisPorConsignatario,
  zEstornarMovimentoExtraInput,
  zRegistrarDispendioExtraInput,
  zRegistrarIngressoExtraInput,
  zRetencaoDoPagamentoInput,
  zRetencaoInput,
} from "./dominio.js";
export type {
  ContasDispendioExtra,
  ContasIngressoExtra,
  EstornarMovimentoExtraInput,
  MovimentoExtra,
  PagamentoComposto,
  PernaRoteiro,
  RegistrarDispendioExtraInput,
  RegistrarIngressoExtraInput,
  RetencaoDados,
  RetencaoDoPagamento,
  RetencaoDoPagamentoInput,
  RetencaoInput,
  RetencaoParaPersistir,
  RetencoesDoPagamento,
  RoteiroContabil,
  TipoMovimentoExtra,
  TotaisExtra,
} from "./dominio.js";
