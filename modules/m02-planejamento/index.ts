export { criarFicha, criarReceitaPrevista } from "./servico.js";

export {
  comporFicha,
  comporReceitaPrevista,
  conferirCodigoNaturezaDespesa,
  zComponentesClassificacao,
  zCriarFichaInput,
  zCriarReceitaPrevistaInput,
  zTipoAcao,
  zTipoReceita,
} from "./dominio.js";
export type {
  CriarFichaInput,
  CriarFichaDados,
  CriarReceitaPrevistaInput,
  CriarReceitaPrevistaDados,
} from "./dominio.js";

export type {
  ItemResolvido,
  UnidadeResolvida,
  ResolucaoClassificacao,
  ResolucaoReceita,
  ClassificacaoRepositoryPort,
  FichaParaPersistir,
  FichaRepositoryPort,
  ReceitaPrevistaParaPersistir,
  ReceitaPrevistaRepositoryPort,
  M02Deps,
} from "./ports.js";

export {
  criarM02Deps,
  criarClassificacaoRepositoryPrisma,
  criarFichaRepositoryPrisma,
  criarReceitaPrevistaRepositoryPrisma,
} from "./adapter-prisma.js";

// ── PROGRAMAÇÃO FINANCEIRA: CMD, MBA, limitação (TR 4.18/4.19/4.43/4.44) ──
export {
  proporCmdDaLoa,
  proporMbaDaLoa,
  registrarVersaoCmd,
  registrarVersaoMba,
  liberarProgramacao,
  registrarEventoLimitacao,
  confrontoMba,
  gerarDecretoCmd,
  gerarDecretoMba,
} from "./programacao.js";
export type {
  ProporInput,
  RegistrarVersaoCmdInput,
  RegistrarVersaoMbaInput,
  LiberarProgramacaoInput,
  RegistrarEventoLimitacaoInput,
  LinhaConfrontoMba,
} from "./programacao.js";
export {
  distribuirEmParcelas,
  proporCotasDaLoa,
  proporMetasDaLoa,
  bimestreDoMes,
  gerarTextoDecreto,
  TEMPLATE_CMD_DEFAULT,
  TEMPLATE_MBA_DEFAULT,
} from "./programacao-dominio.js";
