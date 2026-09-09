export { registrarLancamento, estornarLancamento } from "./servico.js";

export {
  comporLancamento,
  zPartidaInput,
  zRegistrarLancamentoInput,
  zEstornarLancamentoInput,
  zTipoPartida,
  zSubsistema,
} from "./dominio.js";
export type {
  RegistrarLancamentoInput,
  RegistrarLancamentoDados,
  EstornarLancamentoInput,
} from "./dominio.js";

export type {
  NaturezaSaldo,
  ContaResolvida,
  ContaRepositoryPort,
  LancamentoRepositoryPort,
  IdPort,
  M01Deps,
  PartidaParaPersistir,
  LancamentoParaPersistir,
} from "./ports.js";

export {
  criarPrismaClient,
  criarM01Deps,
  criarContaRepositoryPrisma,
  criarLancamentoRepositoryPrisma,
  idsUuid,
} from "./adapter-prisma.js";
