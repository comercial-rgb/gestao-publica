import { cliente, PortaSemBancoError } from "./cliente";
import { comEscritaAutenticada } from "./sessao";
import { exigirLeituraDoEnte } from "./leitura";
import { abrirExercicio } from "../../modules/m08-restos-a-pagar/exercicio";
import {
  ajustarLinhaDaProposta,
  detalharPropostaOrcamentaria,
  efetivarPropostaOrcamentaria,
  elaborarPropostaOrcamentaria,
  listarPropostasOrcamentarias,
  type ElaborarPropostaOrcamentariaInput,
  type PropostaDetalhada,
  type PropostaNaLista,
} from "../../modules/m02-planejamento/proposta-orcamentaria";

/**
 * A PORTA DA PROPOSTA ORÇAMENTÁRIA (V29) — importar um exercício, alterar linha a linha, efetivar.
 *
 * A LEITURA cobra CONSULTAR_PLANEJAMENTO no ENTE: a proposta traz as fichas de todas as unidades, e a
 * leitura de uma unidade só não alcança o orçamento inteiro. A ESCRITA passa por `comEscritaAutenticada` (sessão, autor
 * real, registro da operação); a AUTORIZAÇÃO por ação e por unidade é do caso de uso, no servidor.
 */

export { PortaSemBancoError };
export type { PropostaDetalhada, PropostaNaLista };
export {
  ROTULO_BASE_DESPESA,
  ROTULO_BASE_RECEITA,
} from "../../modules/m02-planejamento/proposta-orcamentaria";

export async function lerPropostasOrcamentarias(): Promise<readonly PropostaNaLista[]> {
  await exigirLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
  return listarPropostasOrcamentarias(cliente());
}

export async function lerPropostaOrcamentaria(id: string): Promise<PropostaDetalhada | null> {
  await exigirLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
  return detalharPropostaOrcamentaria(cliente(), id);
}

/** Os exercícios cadastrados, do mais recente ao mais antigo — as origens possíveis da importação. */
export async function lerExerciciosCadastrados(): Promise<readonly { readonly ano: number; readonly encerrado: boolean }[]> {
  await exigirLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
  const xs = await cliente().exercicio.findMany({
    orderBy: { ano: "desc" },
    select: { ano: true, encerramento: { select: { id: true } } },
  });
  return xs.map((x) => ({ ano: x.ano, encerrado: x.encerramento !== null }));
}

export async function elaborarProposta(
  input: Omit<ElaborarPropostaOrcamentariaInput, "criadoPor">
): Promise<{
  readonly id: string;
  readonly linhasDeReceita: number;
  readonly linhasDeDespesa: number;
  readonly fichasAbertasPorCreditoDeixadas: number;
}> {
  return comEscritaAutenticada("CADASTRAR_LOA", (criadoPor) =>
    elaborarPropostaOrcamentaria(cliente(), { ...input, criadoPor })
  );
}

export async function ajustarLinha(input: {
  readonly propostaOrcamentariaId: string;
  readonly lado: "RECEITA" | "DESPESA";
  readonly linhaId: string;
  readonly valor: string;
  readonly motivo: string;
}): Promise<{ readonly id: string }> {
  return comEscritaAutenticada("CADASTRAR_LOA", (criadoPor) =>
    ajustarLinhaDaProposta(cliente(), { ...input, criadoPor })
  );
}

export async function efetivarProposta(propostaOrcamentariaId: string): Promise<{
  readonly exercicio: number;
  readonly fichasCriadas: number;
  readonly receitasCriadas: number;
}> {
  return comEscritaAutenticada("CRIAR_FICHA", (criadoPor) =>
    efetivarPropostaOrcamentaria(cliente(), { propostaOrcamentariaId, criadoPor })
  );
}

/**
 * ABRE O EXERCÍCIO (M08) — o serviço já existia e não tinha tela. Sem o exercício aberto, nenhuma
 * ficha nasce nele, e a efetivação da proposta recusa nomeando isso.
 */
export async function abrirExercicioPelaTela(ano: number): Promise<void> {
  await comEscritaAutenticada("ABRIR_EXERCICIO", async (criadoPor) => {
    // A autorização é a primeira coisa do serviço; a unicidade (`ano @unique`) é do banco, e a
    // mensagem legível é daqui — sem perguntar antes, para não responder a quem não pode abrir.
    try {
      await abrirExercicio(cliente(), { ano, criadoPor });
    } catch (e) {
      if (typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002") {
        throw new Error(`O exercício ${ano} já está aberto. Nada foi gravado.`, { cause: e });
      }
      throw e;
    }
  });
}
