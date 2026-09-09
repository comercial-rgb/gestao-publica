/** M19 — pessoas e credores: a superfície pública. */
export {
  documentoValido,
  formatarDocumento,
  normalizarDocumento,
  papeisVigentesEm,
  podeSerCredorEm,
  tipoPeloDocumento,
  versaoVigente,
  PAPEIS,
  type PapelDePessoa,
  type TipoDePessoa,
} from "./dominio.js";
export {
  alterarPessoa,
  cadastrarPessoa,
  moverPapelDePessoa,
} from "./servico.js";
export { criarM19Deps, criarPessoaRepositoryPrisma } from "./adapter-prisma.js";
export type {
  DadosCadastrais,
  M19Deps,
  MovimentoDoHistorico,
  PessoaResumo,
  VersaoDoHistorico,
} from "./ports.js";
