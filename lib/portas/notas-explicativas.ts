import {
  notasExplicativas,
  redigirNotaExplicativa,
  retirarNotaExplicativa,
  type DemonstracaoDaNota,
  type NotasExplicativas,
  type SecaoDaNota,
} from "../../modules/m12-relatorios/notas-explicativas.js";
import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";

export { DEMONSTRACOES_DA_NOTA, ROTULO_DA_DEMONSTRACAO, ROTULO_DA_SECAO, SECOES_DAS_NOTAS, TEMAS_OBRIGATORIOS } from "../../modules/m12-relatorios/notas-explicativas.js";
export type { DemonstracaoDaNota, NotasExplicativas, SecaoDaNota };

/** V35 C2 — as notas explicativas do exercício: as redigidas (versão vigente) e as que o sistema escreve do cadastro. */
export async function lerNotasExplicativas(exercicio: number): Promise<NotasExplicativas> {
  await exigirLeituraDoEnte("CONSULTAR_RELATORIOS");
  return notasExplicativas(cliente(), { exercicio });
}

export async function redigirNota(input: {
  readonly exercicio: number;
  readonly chave?: string;
  readonly secao: SecaoDaNota;
  readonly demonstracao: DemonstracaoDaNota;
  readonly ordem: number;
  readonly titulo: string;
  readonly texto: string;
}): Promise<string> {
  const r = await comEscritaAutenticada("CADASTRAR_LINHA_DEMONSTRATIVO", (criadoPor) => redigirNotaExplicativa(cliente(), { ...input, criadoPor }));
  return r.versao === 1 ? `Nota ${r.chave} gravada.` : `Nota ${r.chave} revista (versão ${String(r.versao)}).`;
}

export async function retirarNota(input: { readonly exercicio: number; readonly chave: string }): Promise<string> {
  await comEscritaAutenticada("CADASTRAR_LINHA_DEMONSTRATIVO", (criadoPor) => retirarNotaExplicativa(cliente(), { ...input, criadoPor }));
  return `Nota ${input.chave} retirada do documento; o histórico permanece.`;
}
