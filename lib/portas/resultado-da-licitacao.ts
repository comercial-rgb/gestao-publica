import { consolidarSolicitacoesNoProcesso, origemDosItensDoProcesso, solicitacoesConsolidaveis } from "../../modules/m11-licitacoes/consolidacao";
import {
  adjudicar,
  cadastrarContratoDaAta,
  cadastrarContratoDoResultado,
  cadastrarItemDoProcesso,
  homologarPorAto,
  quadroDoResultado,
  registrarAta,
  registrarProposta,
  registrarResultado,
  vincularParticipante,
  CRITERIOS_DE_JULGAMENTO,
  ROTULO_DO_CRITERIO,
} from "../../modules/m11-licitacoes/resultado-da-licitacao.js";
import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { acoesPermitidas } from "./molde";
import { comEscritaAutenticada } from "./sessao";

/**
 * V39-R2 (R2-014 a 020) — A PORTA DO RESULTADO DA LICITAÇÃO. Leitura: quem consulta licitações no ente. Cada ato
 * passa pela ação do censo no servidor (`comEscritaAutenticada`), e o serviço confere de novo (`autorizarNo`): o
 * formulário oculto não é proteção. Nenhuma regra aqui; a recusa do domínio sobe como veio.
 */

export type QuadroNaTela = Awaited<ReturnType<typeof quadroDoResultado>> & {
  readonly pode: { readonly cadastrar: boolean; readonly julgar: boolean; readonly adjudicar: boolean; readonly homologar: boolean; readonly contratar: boolean };
  readonly criterios: readonly { readonly valor: string; readonly rotulo: string }[];
  /** V39-R3 (R3-019) — de que solicitação (e setor) veio cada parcela de cada item; vazio no item digitado. */
  readonly origem: Readonly<Record<string, readonly { readonly solicitacao: string; readonly setor: string; readonly quantidade: string }[]>>;
  /** As solicitações autorizadas que ainda podem formar os itens (só antes de o processo ter itens). */
  readonly consolidaveis: readonly { readonly id: string; readonly numero: string; readonly setor: string; readonly itens: number; readonly resumo: string }[];
};

export async function lerQuadroDoResultado(processoId: string): Promise<QuadroNaTela> {
  await exigirLeituraDoEnte("CONSULTAR_LICITACOES");
  const [quadro, permitidas, origem] = await Promise.all([
    quadroDoResultado(cliente(), processoId),
    acoesPermitidas(["CADASTRAR_PROCESSO", "REGISTRAR_RESULTADO_DA_LICITACAO", "ADJUDICAR_LICITACAO", "HOMOLOGAR_PROCESSO", "CADASTRAR_CONTRATO"]),
    origemDosItensDoProcesso(cliente(), processoId),
  ]);
  const consolidaveis = quadro.itens.length === 0 && permitidas.has("CADASTRAR_PROCESSO") ? await solicitacoesConsolidaveis(cliente()) : [];
  return {
    ...quadro,
    pode: {
      cadastrar: permitidas.has("CADASTRAR_PROCESSO"),
      julgar: permitidas.has("REGISTRAR_RESULTADO_DA_LICITACAO"),
      adjudicar: permitidas.has("ADJUDICAR_LICITACAO"),
      homologar: permitidas.has("HOMOLOGAR_PROCESSO"),
      contratar: permitidas.has("CADASTRAR_CONTRATO"),
    },
    criterios: CRITERIOS_DE_JULGAMENTO.map((c) => ({ valor: c, rotulo: ROTULO_DO_CRITERIO[c] })),
    origem: Object.fromEntries(origem),
    consolidaveis,
  };
}

/** V39-R3 (R3-019) — formar os itens do processo a partir das solicitações autorizadas escolhidas. */
export async function consolidarSolicitacoesPelaTela(input: { readonly processoId: string; readonly solicitacaoIds: readonly string[] }): Promise<string> {
  const r = await comEscritaAutenticada("CADASTRAR_PROCESSO", (criadoPor) => consolidarSolicitacoesNoProcesso(cliente(), { processoId: input.processoId, solicitacaoIds: [...input.solicitacaoIds], criadoPor }));
  return `${String(r.itens)} item(ns) formado(s) a partir de ${String(r.parcelas)} parcela(s) das solicitações; cada item mostra de que solicitação e setor veio.`;
}

type Sem<T> = Omit<T, "criadoPor">;
type Entrada<F extends (p: never, i: never) => unknown> = Sem<Parameters<F>[1]>;

export const cadastrarItemPelaTela = (i: Entrada<typeof cadastrarItemDoProcesso>) =>
  comEscritaAutenticada("CADASTRAR_PROCESSO", (criadoPor) => cadastrarItemDoProcesso(cliente(), { ...i, criadoPor }));
export const vincularParticipantePelaTela = (i: Entrada<typeof vincularParticipante>) =>
  comEscritaAutenticada("CADASTRAR_PROCESSO", (criadoPor) => vincularParticipante(cliente(), { ...i, criadoPor }));
export const registrarPropostaPelaTela = (i: Entrada<typeof registrarProposta>) =>
  comEscritaAutenticada("CADASTRAR_PROCESSO", (criadoPor) => registrarProposta(cliente(), { ...i, criadoPor }));
export const registrarResultadoPelaTela = (i: Entrada<typeof registrarResultado>) =>
  comEscritaAutenticada("REGISTRAR_RESULTADO_DA_LICITACAO", (criadoPor) => registrarResultado(cliente(), { ...i, criadoPor }));
export const adjudicarPelaTela = (i: Entrada<typeof adjudicar>) =>
  comEscritaAutenticada("ADJUDICAR_LICITACAO", (criadoPor) => adjudicar(cliente(), { ...i, criadoPor }));
export const homologarPorAtoPelaTela = (i: Entrada<typeof homologarPorAto>) =>
  comEscritaAutenticada("HOMOLOGAR_PROCESSO", (criadoPor) => homologarPorAto(cliente(), { ...i, criadoPor }));
export const contratoDoResultadoPelaTela = (i: Entrada<typeof cadastrarContratoDoResultado>) =>
  comEscritaAutenticada("CADASTRAR_CONTRATO", (criadoPor) => cadastrarContratoDoResultado(cliente(), { ...i, criadoPor }));
export const registrarAtaPelaTela = (i: Entrada<typeof registrarAta>) =>
  comEscritaAutenticada("CADASTRAR_CONTRATO", (criadoPor) => registrarAta(cliente(), { ...i, criadoPor }));
export const contratoDaAtaPelaTela = (i: Entrada<typeof cadastrarContratoDaAta>) =>
  comEscritaAutenticada("CADASTRAR_CONTRATO", (criadoPor) => cadastrarContratoDaAta(cliente(), { ...i, criadoPor }));
