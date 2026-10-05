import {
  anexo16,
  anexo17,
  termoDeConferenciaDeCaixa,
  type Anexo16,
  type Anexo17,
  type TermoDeConferenciaDeCaixa,
} from "../../modules/m12-relatorios/demonstrativos-da-pca.js";
import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";

export type { Anexo16, Anexo17, TermoDeConferenciaDeCaixa };

/** V35 — Anexo 16 da Lei 4.320 (dívida fundada interna e externa) do exercício. */
export async function gerarAnexo16(p: { readonly exercicio: number }): Promise<Anexo16> {
  await exigirLeituraDoEnte("CONSULTAR_RELATORIOS");
  return anexo16(cliente(), p);
}

/** V35 — Anexo 17 da Lei 4.320 (dívida flutuante) do exercício. */
export async function gerarAnexo17(p: { readonly exercicio: number }): Promise<Anexo17> {
  await exigirLeituraDoEnte("CONSULTAR_RELATORIOS");
  return anexo17(cliente(), p);
}

/** V35 — Termo de conferência de caixa e bancos em 31/12 do exercício. */
export async function gerarTermoDeCaixa(p: { readonly exercicio: number }): Promise<TermoDeConferenciaDeCaixa> {
  await exigirLeituraDoEnte("CONSULTAR_RELATORIOS");
  return termoDeConferenciaDeCaixa(cliente(), p);
}
