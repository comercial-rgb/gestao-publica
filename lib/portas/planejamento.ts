import { cliente, PortaSemBancoError } from "./cliente";
import { comEscritaAutenticada } from "./sessao";
import { listarReprevisoes, type ReprevisaoRegistrada } from "../../modules/m02-planejamento/consultas";
import { criarM02Deps } from "../../modules/m02-planejamento/adapter-prisma";
import { reprevisarReceita } from "../../modules/m02-planejamento/servico";

/**
 * PORTA — PLANEJAMENTO (reprevisão de receita). Leitura do histórico append-only de reestimativas.
 *
 * ⚠️ SÓ LEITURA. O REGISTRO de uma reprevisão é ATO (M02 `reprevisarReceita`), e ato precisa de
 * usuário autenticado (autorização 6.4) — que só existe a partir da sessão 6.3. Enquanto o login
 * não nasce, o ato roda pelo serviço/seed, e a tela apenas EXIBE o histórico. É a mesma pendência
 * nomeada do resto da UI (TODO 6.3-sessao); o form de escrita entra com a sessão.
 */

export { PortaSemBancoError };

export async function gerarReprevisoes(p: { readonly exercicio: number }): Promise<readonly ReprevisaoRegistrada[]> {
  return listarReprevisoes(cliente(), { exercicio: p.exercicio });
}

/**
 * REGISTRAR uma reprevisão — ESCRITA AUTENTICADA. Exige sessão (fail-closed), injeta o `criadoPor`
 * real (o usuário logado) e registra a operação (RegistroDeOperacao). Só roda em request context.
 */
export async function registrarReprevisao(input: {
  readonly exercicio: number;
  readonly naturezaReceita: string;
  readonly fonte: string;
  readonly tipoReceita: "ORCAMENTARIA" | "INTRA_ORCAMENTARIA" | "DEDUCAO";
  readonly valorAjuste: string;
  readonly motivo: string;
  readonly data: Date;
}): Promise<string> {
  return comEscritaAutenticada("REPREVISAR_RECEITA", (criadoPor) =>
    reprevisarReceita({ ...input, criadoPor }, criarM02Deps(cliente()))
  );
}

export type { ReprevisaoRegistrada };
