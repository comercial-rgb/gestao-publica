import { identificarNoTramita, identificarPelaLicitacaoDoTribunal } from "../../modules/m11-licitacoes/identificacao-no-tramita.js";
import { importarLicitacoesDoTribunal, licitacoesCandidatas, type LicitacaoCandidata } from "../../modules/m11-licitacoes/licitacoes-do-tribunal.js";
import { MODALIDADES_DO_TRIBUNAL, MODALIDADES_PERMITIDAS } from "../../modules/m11-licitacoes/modalidades-do-tribunal.js";
import { diaCivilBr } from "../../packages/datas/index.js";
import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";

/** V26 — a licitação como está no Tramita do TCE-PB, na tela do processo. A regra é do domínio. */

export interface TramitaDoProcesso {
  readonly vigente: { readonly numero: string; readonly ug: string; readonly modalidade: string; readonly protocolo: string | null; readonly desde: string; readonly por: string; readonly fundamento: string } | null;
  /** V27 — as licitações da lista importada do Tribunal compatíveis com o processo, para escolher. */
  readonly candidatas: readonly LicitacaoCandidata[];
  readonly historico: number;
  readonly modalidadesPermitidas: readonly { readonly codigo: string; readonly descricao: string }[];
}

export async function lerTramitaDoProcesso(processoId: string): Promise<TramitaDoProcesso | null> {
  await exigirLeituraDoEnte("CONSULTAR_LICITACOES");
  const p = await cliente().processoLicitatorio.findUnique({
    where: { id: processoId },
    select: { modalidade: true, identificacoesNoTramita: { orderBy: { criadoEm: "desc" }, select: { numeroNoTramita: true, codUnidadeGestora: true, modalidadeSagres: true, protocoloNoTribunal: true, criadoEm: true, criadoPor: true, fundamento: true } } },
  });
  if (p === null) return null;
  const v = p.identificacoesNoTramita[0];
  return {
    vigente: v === undefined ? null : { numero: v.numeroNoTramita, ug: v.codUnidadeGestora, modalidade: `${v.modalidadeSagres} — ${MODALIDADES_DO_TRIBUNAL[v.modalidadeSagres] ?? ""}`, protocolo: v.protocoloNoTribunal, desde: diaCivilBr(v.criadoEm), por: v.criadoPor, fundamento: v.fundamento },
    candidatas: await licitacoesCandidatas(cliente(), processoId),
    historico: p.identificacoesNoTramita.length,
    modalidadesPermitidas: MODALIDADES_PERMITIDAS[p.modalidade].map((codigo) => ({ codigo, descricao: MODALIDADES_DO_TRIBUNAL[codigo] ?? "" })),
  };
}

export async function informarTramita(input: { readonly processoId: string; readonly numeroNoTramita: string; readonly codUnidadeGestora: string; readonly modalidadeSagres: string; readonly fundamento: string }): Promise<string> {
  await comEscritaAutenticada("CADASTRAR_PROCESSO", (criadoPor) => identificarNoTramita(cliente(), { ...input, criadoPor }));
  return `Licitação ${input.numeroNoTramita} do Tramita registrada para o processo. Os empenhos dos contratos dele vão ao Tribunal com este número.`;
}

/** V27 — a identificação a partir da licitação escolhida na lista importada do Tribunal. */
export async function informarTramitaPelaLista(input: { readonly processoId: string; readonly licitacaoNoTribunalId: string }): Promise<string> {
  const r = await comEscritaAutenticada("CADASTRAR_PROCESSO", (criadoPor) => identificarPelaLicitacaoDoTribunal(cliente(), { ...input, criadoPor }));
  return `Licitação ${r.numero} do Tribunal registrada para o processo, com o protocolo do Tramita. Os empenhos dos contratos dele vão ao Tribunal com este número.`;
}

/** V27 — importa o arquivo de licitações dos dados abertos do Tribunal (a lista para escolher). */
export async function importarLicitacoesPelaTela(conteudo: string): Promise<string> {
  const r = await comEscritaAutenticada("CADASTRAR_PROCESSO", (criadoPor) => importarLicitacoesDoTribunal(cliente(), { conteudo, criadoPor }));
  const aviso = r.semCodigo.length === 0 ? "" : ` Sem correspondência na tabela do leiaute (informe manualmente): ${r.semCodigo.join("; ")}.`;
  return `${String(r.licitacoes)} licitações do Tribunal importadas.${aviso}`;
}
