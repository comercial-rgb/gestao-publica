import { identificarNoTramita } from "../../modules/m11-licitacoes/identificacao-no-tramita.js";
import { MODALIDADES_DO_TRIBUNAL, MODALIDADES_PERMITIDAS } from "../../modules/m11-licitacoes/modalidades-do-tribunal.js";
import { diaCivilBr } from "../../packages/datas/index.js";
import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";

/** V26 — a licitação como está no Tramita do TCE-PB, na tela do processo. A regra é do domínio. */

export interface TramitaDoProcesso {
  readonly vigente: { readonly numero: string; readonly ug: string; readonly modalidade: string; readonly desde: string; readonly por: string; readonly fundamento: string } | null;
  readonly historico: number;
  readonly modalidadesPermitidas: readonly { readonly codigo: string; readonly descricao: string }[];
}

export async function lerTramitaDoProcesso(processoId: string): Promise<TramitaDoProcesso | null> {
  await exigirLeituraDoEnte("CONSULTAR_LICITACOES");
  const p = await cliente().processoLicitatorio.findUnique({
    where: { id: processoId },
    select: { modalidade: true, identificacoesNoTramita: { orderBy: { criadoEm: "desc" }, select: { numeroNoTramita: true, codUnidadeGestora: true, modalidadeSagres: true, criadoEm: true, criadoPor: true, fundamento: true } } },
  });
  if (p === null) return null;
  const v = p.identificacoesNoTramita[0];
  return {
    vigente: v === undefined ? null : { numero: v.numeroNoTramita, ug: v.codUnidadeGestora, modalidade: `${v.modalidadeSagres} — ${MODALIDADES_DO_TRIBUNAL[v.modalidadeSagres] ?? ""}`, desde: diaCivilBr(v.criadoEm), por: v.criadoPor, fundamento: v.fundamento },
    historico: p.identificacoesNoTramita.length,
    modalidadesPermitidas: MODALIDADES_PERMITIDAS[p.modalidade].map((codigo) => ({ codigo, descricao: MODALIDADES_DO_TRIBUNAL[codigo] ?? "" })),
  };
}

export async function informarTramita(input: { readonly processoId: string; readonly numeroNoTramita: string; readonly codUnidadeGestora: string; readonly modalidadeSagres: string; readonly fundamento: string }): Promise<string> {
  await comEscritaAutenticada("CADASTRAR_PROCESSO", (criadoPor) => identificarNoTramita(cliente(), { ...input, criadoPor }));
  return `Licitação ${input.numeroNoTramita} do Tramita registrada para o processo. Os empenhos dos contratos dele vão ao Tribunal com este número.`;
}
