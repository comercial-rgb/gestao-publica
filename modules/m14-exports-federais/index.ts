export { gerarMsc } from "./msc/gerador.js";
export type { Leitor } from "./msc/gerador.js";

export {
  COLUNAS_MSC,
  conferirM1,
  conferirM2,
  conferirM3,
  conferirM4,
  conferirM5,
  liquidoComSinal,
  naturezaDoValor,
  parsearCompetencia,
  serializarMscCsv,
  valorDoSaldo,
  zipar,
} from "./msc/dominio.js";
export type {
  Competencia,
  LinhaMsc,
  NaturezaValor,
  PendenciaMsc,
  ResultadoMsc,
  SomasBrutas,
  TipoMsc,
  TipoValor,
} from "./msc/dominio.js";

export { DIMENSAO_DA_NATUREZA, resolverDimensoes, SEM_DIMENSOES } from "./msc/resolver.js";
export type { Dimensoes, Resolucao } from "./msc/resolver.js";

// ═══ MANAD (TR 7.36) — IN MPS/SRP 12/2006, leiaute v1.0.0.2 ═══
export { gerarManad } from "./manad/gerador.js";
export type {
  CodigoFinalidade,
  EntradaManad,
  PendenciaManad,
  ResultadoManad,
} from "./manad/gerador.js";
export {
  alfa,
  conferirN2,
  conferirN2Rp,
  conferirN3,
  contarPorTipo,
  exigirLatin1,
  indDebCred,
  serializarLinha,
  serializarManad,
  sinalDoFato,
  TIP_CRED_ADICIONAL,
  TIP_ORIG_RECURSO,
} from "./manad/dominio.js";
export type { LinhaManad } from "./manad/dominio.js";
