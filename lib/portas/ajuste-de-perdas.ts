import {
  apuracoesDoAjusteDePerdas,
  apurarAjusteDePerdas,
  declararPercentualDePerda,
  type ApuracaoNaLista,
  type OrigemDaDividaAtiva,
} from "../../modules/m10-patrimonial/ajuste-de-perdas.js";
import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";

export type { ApuracaoNaLista, OrigemDaDividaAtiva };

const ROTULO: Record<OrigemDaDividaAtiva, string> = { TRIBUTARIA: "tributária", NAO_TRIBUTARIA: "não tributária" };

/** V35 — as apurações do ajuste para perdas da dívida ativa, com a metodologia de cada uma. */
export async function lerApuracoesDoAjusteDePerdas(): Promise<readonly ApuracaoNaLista[]> {
  await exigirLeituraDoEnte("CONSULTAR_DIVIDA");
  return apuracoesDoAjusteDePerdas(cliente());
}

export async function declararPercentual(input: { readonly exercicio: number; readonly origem: OrigemDaDividaAtiva; readonly percentual: string; readonly metodologia: string }): Promise<string> {
  const r = await comEscritaAutenticada("ATUALIZAR_DIVIDA_ATIVA", (criadoPor) => declararPercentualDePerda(cliente(), { ...input, criadoPor }));
  return `Percentual de perda da dívida ativa ${ROTULO[input.origem]} de ${String(input.exercicio)} declarado (versão ${String(r.versao)}).`;
}

export async function apurar(input: { readonly origem: OrigemDaDividaAtiva; readonly corte: string }): Promise<string> {
  const r = await comEscritaAutenticada("ATUALIZAR_DIVIDA_ATIVA", (criadoPor) => apurarAjusteDePerdas(cliente(), { ...input, criadoPor }));
  const quando = input.corte.split("-").reverse().join("/");
  if (r.lancamentoId === null) return `Apuração de ${quando} registrada: o ajuste esperado (${r.ajusteEsperado}) já é o saldo da conta; nada foi lançado.`;
  const sentido = r.diferenca.startsWith("-") ? "revertido" : "constituído";
  return `Apuração de ${quando}: ajuste esperado ${r.ajusteEsperado} sobre o saldo de ${r.saldoDaDividaAtiva}; ${sentido} ${r.diferenca.replace("-", "")} no razão.`;
}
