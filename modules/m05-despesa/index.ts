export {
  reservarDotacao,
  liberarReserva,
  empenhar,
  anularEmpenho,
  reconciliarFicha,
  saldosDaFicha,
} from "./servico.js";

export {
  liquidar,
  pagar,
  anularLiquidacao,
  anularPagamento,
  statusDeEmpenho,
} from "./servico-bloco2.js";

export {
  calcularSaldos,
  comporEmpenho,
  comporPartidas,
  roteiroEmpenho,
  roteiroLiquidacao,
  roteiroPagamento,
  statusDoEmpenho,
  TIPOS_MOVIMENTO,
  zEmpenharInput,
  zCategoriaOrdemCronologica,
  zLiquidarInput,
  zPagarInput,
  zReservarDotacaoInput,
  zTipoEmpenho,
} from "./dominio.js";
export type {
  CategoriaOrdemCronologica,
  ContasEmpenho,
  ContasLiquidacao,
  ContasPagamento,
  EmpenharInput,
  LiquidarInput,
  PagarInput,
  AnularLiquidacaoInput,
  AnularPagamentoInput,
  PernaRoteiro,
  ReservarDotacaoInput,
  RoteiroContabil,
  SaldosFicha,
  StatusEmpenho,
  TipoEmpenho,
  TipoMovimentoDotacao,
  TotaisEmpenho,
  TotaisPorTipo,
} from "./dominio.js";

export type {
  DespesaRepositoryPort,
  Divergencia,
  EmpenhoResumo,
  M05Deps,
} from "./ports.js";

export {
  criarM05Deps,
  criarDespesaRepositoryPrisma,
} from "./adapter-prisma.js";
