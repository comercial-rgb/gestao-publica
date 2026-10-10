import { cliente, PortaSemBancoError } from "./cliente";
import { comEscritaAutenticada } from "./sessao";
import { exigirLeituraDoEnte } from "./leitura";
import { abrirExercicio } from "../../modules/m08-restos-a-pagar/exercicio";
import {
  incluirFichaNaProposta,
  incluirReceitaNaProposta,
  previaDaImportacaoDaProposta,
  previaDoReajusteDaProposta,
  reajustarLinhasDaProposta,
  realocarNaProposta,
  type PreviaDaImportacao,
  type PreviaDaImportacaoInput,
  type RealocarNaPropostaInput,
  type ResultadoDaRealocacao,
  type IncluirFichaNaPropostaInput,
  type IncluirReceitaNaPropostaInput,
  type PreviaDoReajusteInput,
  type ReajustarLinhasDaPropostaInput,
  type RecorteDoReajuste,
  type ResultadoDoReajuste,
} from "../../modules/m02-planejamento/proposta-orcamentaria";
import {
  ajustarLinhaDaProposta,
  detalharPropostaOrcamentaria,
  efetivarPropostaOrcamentaria,
  type FundamentoDaEfetivacao,
  elaborarPropostaOrcamentaria,
  listarPropostasOrcamentarias,
  type ElaborarPropostaOrcamentariaInput,
  type PropostaDetalhada,
  type PropostaNaLista,
} from "../../modules/m02-planejamento/proposta-orcamentaria";
import {
  conferirProposta,
  levantarFatosDoPlanejamento,
  type ConferenciaDaProposta,
} from "../../modules/m02-planejamento/conferencia-da-proposta";
import { baseAdmiteEnsaio, naturezaDaBase } from "../../modules/m16-travamento/natureza-da-base.js";

/**
 * A PORTA DA PROPOSTA ORÇAMENTÁRIA (V29) — importar um exercício, alterar linha a linha, efetivar.
 *
 * A LEITURA cobra CONSULTAR_PLANEJAMENTO no ENTE: a proposta traz as fichas de todas as unidades, e a
 * leitura de uma unidade só não alcança o orçamento inteiro. A ESCRITA passa por `comEscritaAutenticada` (sessão, autor
 * real, registro da operação); a AUTORIZAÇÃO por ação e por unidade é do caso de uso, no servidor.
 */

export { PortaSemBancoError };
export type { PropostaDetalhada, PropostaNaLista, ConferenciaDaProposta };
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

/**
 * A PROPOSTA E A CONFERÊNCIA DELA ANTES DA VOTAÇÃO (V31) — a mesma leitura do ente, e os fatos do PPA e
 * da LDO do exercício de destino. A conferência é calculada a cada leitura: nada fica gravado.
 */
export async function lerPropostaComConferencia(
  id: string
): Promise<{ readonly proposta: PropostaDetalhada; readonly conferencia: ConferenciaDaProposta } | null> {
  await exigirLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
  const db = cliente();
  const proposta = await detalharPropostaOrcamentaria(db, id);
  if (proposta === null) return null;
  return { proposta, conferencia: conferirProposta(proposta, await levantarFatosDoPlanejamento(db, proposta.exercicio)) };
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

export async function efetivarProposta(propostaOrcamentariaId: string, fundamento: FundamentoDaEfetivacao): Promise<{
  readonly exercicio: number;
  readonly fichasCriadas: number;
  readonly receitasCriadas: number;
}> {
  return comEscritaAutenticada("CRIAR_FICHA", (criadoPor) =>
    efetivarPropostaOrcamentaria(cliente(), { propostaOrcamentariaId, fundamento, criadoPor })
  );
}

/** V39-021 — a base admite gerar orçamento em ENSAIO? Só o que o banco declara (a tela oferece a opção por isto). */
export async function baseAdmiteEnsaioNaTela(): Promise<boolean> {
  return baseAdmiteEnsaio((await naturezaDaBase(cliente())).natureza);
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

// ── V38 — as linhas novas e o reajuste em lote (o que a contadora pediu para "só fazer as alterações").
export async function incluirFicha(input: Omit<IncluirFichaNaPropostaInput, "criadoPor">): Promise<{ readonly id: string }> {
  return comEscritaAutenticada("CADASTRAR_LOA", (criadoPor) => incluirFichaNaProposta(cliente(), { ...input, criadoPor }));
}
export async function incluirReceita(input: Omit<IncluirReceitaNaPropostaInput, "criadoPor">): Promise<{ readonly id: string }> {
  return comEscritaAutenticada("CADASTRAR_LOA", (criadoPor) => incluirReceitaNaProposta(cliente(), { ...input, criadoPor }));
}
export async function previaDoReajuste(input: PreviaDoReajusteInput): Promise<ResultadoDoReajuste> {
  await exigirLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
  return previaDoReajusteDaProposta(cliente(), input);
}
export async function reajustarLinhas(input: Omit<ReajustarLinhasDaPropostaInput, "criadoPor">): Promise<ResultadoDoReajuste> {
  return comEscritaAutenticada("CADASTRAR_LOA", (criadoPor) => reajustarLinhasDaProposta(cliente(), { ...input, criadoPor }));
}
export type { RecorteDoReajuste, ResultadoDoReajuste };

// ── V38 — a prévia da importação (AUD-103) e a realocação com o total preservado (AUD-113).
export async function previaDaImportacao(input: PreviaDaImportacaoInput): Promise<PreviaDaImportacao> {
  await exigirLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
  return previaDaImportacaoDaProposta(cliente(), input);
}
export async function realocar(input: Omit<RealocarNaPropostaInput, "criadoPor">): Promise<ResultadoDaRealocacao> {
  return comEscritaAutenticada("CADASTRAR_LOA", (criadoPor) => realocarNaProposta(cliente(), { ...input, criadoPor }));
}
export type { PreviaDaImportacao, ResultadoDaRealocacao };
