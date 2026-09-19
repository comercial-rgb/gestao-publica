export {
  criarLei,
  criarDecreto,
  declararDisponibilidade,
  executarCredito,
  anularCredito,
  encerrarDecreto,
  saldoDaLei,
} from "./servico.js";

export {
  comporCredito,
  ehRecursoNovo,
  somarItens,
  validarBalanceamento,
  ORIGENS_RECURSO_NOVO,
  zCriarLeiInput,
  zCriarDecretoInput,
  zExecutarCreditoInput,
  zDeclararDisponibilidadeInput,
  zOrigemDeRecursoNovo,
  zOrigemRecurso,
  zTipoCredito,
} from "./dominio.js";
export type {
  AnularCreditoInput,
  CriarDecretoInput,
  DeclararDisponibilidadeInput,
  CriarLeiInput,
  EncerrarDecretoInput,
  ExecutarCreditoInput,
  ItemCreditoInput,
  OrigemRecurso,
  TipoItemCredito,
  TotaisDoCredito,
} from "./dominio.js";

export type {
  CreditoRepositoryPort,
  DecretoResumo,
  M03Deps,
  SuperavitFinanceiroPort,
  TxDoCredito,
} from "./ports.js";

export {
  criarM03Deps,
  criarCreditoRepositoryPrisma,
} from "./adapter-prisma.js";
