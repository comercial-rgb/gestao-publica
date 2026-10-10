import type { SituacaoDaOrdem } from "../../../modules/m11-licitacoes/execucao-do-contrato";

/**
 * V39-012 — O RÓTULO DA SITUAÇÃO DA ORDEM DE SERVIÇO, um só para as três telas (lista de ordens, execução do contrato,
 * detalhe da ordem). Até a V38 cada tela tinha a sua cópia como `Record<string, …>` e, faltando a chave, mostrava o
 * código cru ("SUSPENSA"). Aqui o mapa é `Record<SituacaoDaOrdem, …>`: uma situação nova sem rótulo não compila. E o
 * valor que escapar do tipo em tempo de execução (dado antigo, régua mudada) vira uma frase de negócio, com registro
 * no servidor — nunca o código.
 */

export type TomDaSituacao = "ok" | "alerta" | "neutro" | "erro";

export const ROTULO_DA_SITUACAO_DA_ORDEM: Readonly<Record<SituacaoDaOrdem, { readonly texto: string; readonly tom: TomDaSituacao }>> = {
  RASCUNHO: { texto: "rascunho", tom: "neutro" },
  DESCARTADA: { texto: "descartada", tom: "neutro" },
  EMITIDA: { texto: "emitida", tom: "ok" },
  SUSPENSA: { texto: "suspensa", tom: "alerta" },
};

export const SITUACAO_NAO_RECONHECIDA = { texto: "situação não reconhecida: confira a ordem", tom: "erro" } as const;

export function rotuloDaSituacaoDaOrdem(situacao: string): { readonly texto: string; readonly tom: TomDaSituacao } {
  const r = (ROTULO_DA_SITUACAO_DA_ORDEM as Readonly<Record<string, { readonly texto: string; readonly tom: TomDaSituacao } | undefined>>)[situacao];
  if (r !== undefined) return r;
  console.error(`[ordem de serviço] situação sem rótulo: ${JSON.stringify(situacao)}`);
  return SITUACAO_NAO_RECONHECIDA;
}
