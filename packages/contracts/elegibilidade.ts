/**
 * ═══ ELEGIBILIDADE DE UM ATO SOBRE UM REGISTRO — o predicado que o domínio e a tela compartilham ═══
 *
 * ⚠️ POR QUE ISTO EXISTE (V6.2 U0). A barra de ações do molde filtrava por PERMISSÃO e não por
 * ESTADO: a folha já certificada continuava oferecendo "Certificar". O servidor recusava nomeando
 * o motivo — não havia furo —, mas a tela prometia o que não faria. A correção NÃO é um `if` por
 * página: é o domínio expor a regra como predicado puro, e as duas pontas lerem a mesma função.
 *
 *   · o CASO DE USO chama o predicado DENTRO da transação, sobre o estado lido ali, e recusa;
 *   · a PORTA chama o mesmo predicado sobre o estado lido para a tela, e projeta a apresentação.
 *
 * ⚠️ ELEGÍVEL NÃO É AUTORIZAÇÃO, TRAVA NEM GARANTIA. Entre a leitura da tela e o clique, outra aba
 * pode mudar o registro. Quem decide é a transação; a projeção só para de oferecer o que já se
 * sabe que seria recusado.
 *
 * Três situações, e a diferença entre as duas negativas é o que a tela faz com elas:
 *
 *   · `NAO_APLICAVEL` — o ato já aconteceu ou não cabe mais neste registro (folha certificada não
 *     se certifica de novo). Sai da barra; aparece como estado, não como botão travado.
 *   · `PRE_CONDICAO` — falta algo que alguém pode providenciar (fechar antes de certificar, uma
 *     designação vigente). Aparece travado, com o motivo legível e a providência.
 */

export type Elegibilidade =
  | { readonly situacao: "ELEGIVEL" }
  | {
      readonly situacao: "NAO_APLICAVEL" | "PRE_CONDICAO";
      /** Código estável, em maiúsculas — é o prefixo da mensagem de recusa do caso de uso. */
      readonly codigo: string;
      /** Prosa de negócio, sem dado protegido: é mostrada a quem já pode ver o registro. */
      readonly motivo: string;
      /** O que fazer para destravar, quando houver alguém que possa fazê-lo. */
      readonly providencia?: string;
    };

export const ELEGIVEL: Elegibilidade = Object.freeze({ situacao: "ELEGIVEL" });

export function naoAplicavel(codigo: string, motivo: string): Elegibilidade {
  return { situacao: "NAO_APLICAVEL", codigo, motivo };
}

export function preCondicao(codigo: string, motivo: string, providencia?: string): Elegibilidade {
  return { situacao: "PRE_CONDICAO", codigo, motivo, ...(providencia !== undefined ? { providencia } : {}) };
}

/** A recusa do caso de uso quando o predicado diz não. A mensagem começa pelo código. */
export class AtoInelegivelError extends Error {
  readonly codigo: string;
  constructor(e: Exclude<Elegibilidade, { situacao: "ELEGIVEL" }>) {
    super(`${e.codigo}: ${e.motivo}${e.providencia !== undefined ? ` ${e.providencia}` : ""} Nada foi gravado.`);
    this.name = "AtoInelegivelError";
    this.codigo = e.codigo;
  }
}

/** Para o caso de uso: lança se não for elegível. */
export function exigirElegivel(e: Elegibilidade): void {
  if (e.situacao !== "ELEGIVEL") throw new AtoInelegivelError(e);
}
