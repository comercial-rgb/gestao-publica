import {
  acertarDecimoTerceiro,
  apropriacoesDoExercicio,
  apropriarEncargosPorCompetencia,
  apropriarPorCompetencia,
  declararParametroDeFerias,
  type ApropriacaoNaLista,
} from "../../modules/m33-folha/apropriacao-por-competencia.js";
import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";

export type { ApropriacaoNaLista };

/** V35 — as apropriações do 13º e das férias do exercício. */
export async function lerApropriacoes(exercicio: number): Promise<readonly ApropriacaoNaLista[]> {
  await exigirLeituraDoEnte("CONSULTAR_FOLHA");
  return apropriacoesDoExercicio(cliente(), exercicio);
}

export async function declararFerias(input: {
  readonly exercicio: number;
  readonly mesesDoPeriodoAquisitivo: number;
  readonly abonoNumerador: number;
  readonly abonoDenominador: number;
  readonly incluiRemuneracaoDoPeriodo: boolean;
  readonly fundamento: string;
}): Promise<string> {
  const r = await comEscritaAutenticada("CONFIGURAR_PARAMETRO_DO_DECIMO_TERCEIRO", (criadoPor) => declararParametroDeFerias(cliente(), { ...input, criadoPor }));
  return `Parâmetro das férias de ${String(input.exercicio)} declarado (versão ${String(r.versao)}).`;
}

export async function apropriar(competencia: string): Promise<string> {
  const r = await comEscritaAutenticada("APROPRIAR_FOLHA", (criadoPor) => apropriarPorCompetencia(cliente(), { competencia, criadoPor }));
  return `Competência ${competencia.split("-").reverse().join("/")} apropriada: 13º ${r.decimoTerceiro}, férias ${r.ferias}, ${String(r.vinculos)} vínculos.`;
}

export async function apropriarEncargos(competencia: string): Promise<string> {
  const r = await comEscritaAutenticada("APROPRIAR_FOLHA", (criadoPor) => apropriarEncargosPorCompetencia(cliente(), { competencia, criadoPor }));
  return `Encargos patronais de ${competencia.split("-").reverse().join("/")} apropriados: sobre o 13º ${r.decimoTerceiro}, sobre as férias ${r.ferias}, ${String(r.vinculos)} vínculos.`;
}

export async function acertar13(exercicio: number): Promise<string> {
  const r = await comEscritaAutenticada("APROPRIAR_FOLHA", (criadoPor) => acertarDecimoTerceiro(cliente(), { exercicio, criadoPor }));
  return r.lancamentoId === null
    ? `13º de ${String(exercicio)} acertado: o passivo apropriado já estava zerado.`
    : `13º de ${String(exercicio)} acertado: ${r.saldoAntes.startsWith("-") ? "apropriado a menos" : "apropriado a mais"} ${r.saldoAntes.replace("-", "")}, lançado; o passivo fecha o ano em zero.`;
}
