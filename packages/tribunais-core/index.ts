/**
 * @siafic/tribunais-core — a PORTA DE TRIBUNAL e o seu registro.
 *
 * A superfície pública: os tipos do contrato (`porta.ts`), a resolução código → exportador
 * (`registro.ts`) e a execução (`executor.ts`). Quem exporta para um tribunal fala com ISTO;
 * o adapter de cada tribunal mora em `adapters/tribunais/<codigo>/`.
 */

export type {
  ArquivoRemessa,
  Competencia,
  DocumentoRetranca,
  ExportadorTribunal,
  Inconsistencia,
  ModuloRemessa,
  NaturezaPacote,
  PacoteExport,
  Severidade,
} from "./porta.js";

export { resolverTribunal, tribunaisSuportados } from "./registro.js";

export { exportarParaTribunal, type ResultadoExport } from "./executor.js";
