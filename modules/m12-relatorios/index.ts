export { balancoOrcamentario } from "./balanco-orcamentario.js";
export { anexo1, janelaDoBimestre } from "./rreo-anexo1.js";
export { anexo2 } from "./rreo-anexo2.js";
export type { Anexo2, LinhaFuncional } from "./rreo-anexo2.js";
export type { Anexo1, LinhaReceitaRreo, LinhaDespesaRreo, Bimestre } from "./rreo-anexo1.js";
export { balancoFinanceiro } from "./balanco-financeiro.js";
export { relatorioRestosAPagar } from "./relatorio-restos.js";
export { ordemCronologicaMensal } from "./ordem-cronologica.js";

export { montarRelatorioRestosAPagar } from "./dominio-restos.js";
export type {
  ColunasRestos,
  FatoInscricao,
  GrupoRestosAPagar,
  LinhaRestosAPagar,
  RelatorioRestosAPagar,
} from "./dominio-restos.js";

export type {
  FilaPublicada,
  ItemDaFila,
  OrdemCronologicaMensal,
  PreteridaNaQuebra,
  QuebraPublicada,
} from "./ordem-cronologica.js";

export { montarBalancoFinanceiro } from "./dominio-financeiro.js";
export type {
  BalancoFinanceiro,
  FatoPorFonte,
  FatosBalancoFinanceiro,
  LinhaFinanceira,
  NivelLinhaFinanceira,
  SaldoEmEspecie,
} from "./dominio-financeiro.js";

export {
  montarBalancoOrcamentario,
  categoriaDaReceita,
  origemDaReceita,
  serializar,
  sinalDaReceitaRealizada,
  CATEGORIAS_RECEITA,
  SINAL_PREVISAO,
  SINAL_RECEITA_REALIZADA,
  ZERO,
} from "./dominio.js";

export type {
  BalancoOrcamentario,
  Dinheiro,
  FatoDespesa,
  FatoReceita,
  FatoRestos,
  FatosBalanco,
  LinhaDespesa,
  LinhaReceita,
  LinhaRestosNaoProcessados,
  LinhaRestosProcessados,
  NivelLinha,
  TipoLancamentoReceita,
  TipoReceitaPrevista,
  TipoRestos,
} from "./dominio.js";

// ── LIVROS OBRIGATÓRIOS: Diário, Razão, Balancete (TR 1.3.2 · 5.92-5.94) ──
export { diario, razaoAnalitico, balancete, totalDeDebitoDoLancamento } from "./livros.js";
export type {
  LancamentoDoDiario,
  PartidaDoDiario,
  FiltrosDoDiario,
  RazaoAnalitico,
  LinhaDoRazao,
  Balancete,
  LinhaDoBalancete,
  EscolhaDeNatureza,
} from "./livros.js";

// ── DEMONSTRAÇÕES CONTÁBEIS: Balanço Patrimonial (Anexo 14) e DVP (Anexo 15) ──
//
// Os dois motores existiam desde a construção do M12 e NÃO estavam reexportados aqui — nenhuma
// porta e nenhuma tela os alcançava. O Balanço Orçamentário (Anexo 12) e o Financeiro (Anexo 13)
// já estavam no topo deste arquivo; estes dois faltavam, e a ausência era do índice, não do motor.
export { balancoPatrimonial, INDICADOR_SUPERAVIT, LINHA_RESULTADO } from "./balanco-patrimonial.js";
export type {
  BalancoPatrimonial,
  LinhaDoBalanco,
  GrupoBalanco,
  QuadroDoGrupo,
  QuadroFinanceiroPermanente,
  ContaDoQuadroFP,
  IndicadorSuperavit,
  OpcoesDoBalanco,
} from "./balanco-patrimonial.js";
export { demonstracaoVariacoesPatrimoniais, apuradoNoPeriodo } from "./dvp.js";
export type {
  DemonstracaoVariacoesPatrimoniais,
  QuadroDaDvp,
  LinhaDaDvp,
} from "./dvp.js";
