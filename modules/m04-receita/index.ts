export { registrarArrecadacao, anularArrecadacao } from "./servico.js";
export type { ResultadoArrecadacao } from "./servico.js";

export {
  comporArrecadacao,
  comporPartidas,
  roteiroArrecadacao,
  zRegistrarArrecadacaoInput,
  zAnularArrecadacaoInput,
  zTipoLancamentoReceita,
} from "./dominio.js";
export type {
  ContasArrecadacao,
  PernaRoteiro,
  RoteiroContabil,
  RegistrarArrecadacaoInput,
  RegistrarArrecadacaoDados,
  AnularArrecadacaoInput,
} from "./dominio.js";

/** Os classificadores da natureza da receita — origem (2º dígito) e tipo (8º). */
export {
  CATEGORIAS_RECEITA,
  ORIGEM_RECEITA,
  TIPO_RECEITA,
  TIPOS_QUE_QUITAM_DIVIDA_ATIVA,
  categoriaDaReceita,
  ehIntraorcamentaria,
  origemDaNatureza,
  parsearNaturezaReceita,
  tipoDaNatureza,
} from "./natureza.js";
export type {
  CategoriaBase,
  CategoriaReceita,
  ChaveOrigem,
  DigitoTipo,
  NaturezaReceitaDecomposta,
  OrigemReceita,
  TipoNaturezaReceita,
} from "./natureza.js";

export type {
  ArrecadacaoParaPersistir,
  ArrecadacaoPersistida,
  ConfrontoPrevisao,
  LancamentoDaReceita,
  M04Deps,
  ReceitaClassificacaoPort,
  ReceitaRepositoryPort,
  ResolucaoReceitaArrecadada,
} from "./ports.js";

export {
  criarM04Deps,
  criarReceitaClassificacaoPrisma,
  criarReceitaRepositoryPrisma,
} from "./adapter-prisma.js";

// ── RECONHECIMENTO pelo fato gerador (TR 5.87/5.88) ──
export {
  reconhecerReceita,
  estornarReconhecimento,
  cancelarReconhecimento,
  saldoAArrecadar,
  saldoReconhecidoDe,
  vincularReconhecimentoNaTx,
  zReconhecerReceitaInput,
  zEstornarReconhecimentoInput,
  zCancelarReconhecimentoInput,
} from "./reconhecimento.js";
export type {
  ReconhecerReceitaInput,
  EstornarReconhecimentoInput,
  CancelarReconhecimentoInput,
  SaldoAArrecadar,
  VinculoDeReconhecimento,
} from "./reconhecimento.js";
export { arrecadarComVinculo } from "./arrecadacao-vinculada.js";
export type { ArrecadarComVinculoInput } from "./arrecadacao-vinculada.js";
