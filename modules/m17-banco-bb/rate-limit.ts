/**
 * M17 — O LIMITADOR DE CHAMADAS (homologação BB: 10 chamadas / 10 minutos).
 *
 * ═══ ⚠️ FAIL-CLOSED: RECUSA LOCAL ANTES DE QUEIMAR A 11ª ═══
 * A janela de homologação é dura — da 11ª chamada em diante, o BB devolve erro até a janela
 * renovar. Se deixássemos a 11ª SAIR, gastaríamos a cota e ainda levaríamos um 429; e 429 NÃO se
 * repete (esperar a janela é a única saída). Então o limitador conta LOCALMENTE e RECUSA a chamada
 * que estouraria a cota, com um erro nomeado — antes de tocar a rede. É a mesma doutrina do resto do
 * sistema: negar por omissão, nunca autorizar por esquecimento.
 *
 * ⚠️ O relógio é INJETADO (`agora`) — a suíte controla a janela sem esperar 10 minutos reais.
 * ⚠️ O contador é da API de recurso (api.hm.bb.com.br). O token (oauth.hm.bb.com.br) é outro host e
 * não entra nesta cota; o cache de token já o torna raro de qualquer forma.
 */

export class RateLimitHomologError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "RateLimitHomologError";
  }
}

export interface LimitadorDeChamadas {
  /** Registra uma chamada que VAI acontecer; ESTOURA (fail-closed) se ela excederia a cota. */
  readonly registrar: (agora: number) => void;
  /** Quantas chamadas ainda cabem na janela que termina em `agora` (para diagnóstico/tela). */
  readonly restantes: (agora: number) => number;
}

export function criarLimitador(p: { readonly chamadas: number; readonly janelaMs: number }): LimitadorDeChamadas {
  const carimbos: number[] = [];

  const podar = (agora: number): void => {
    const limite = agora - p.janelaMs;
    while (carimbos.length > 0 && carimbos[0]! <= limite) carimbos.shift();
  };

  return {
    registrar(agora: number): void {
      podar(agora);
      if (carimbos.length >= p.chamadas) {
        const maisAntigo = carimbos[0]!;
        const esperaMs = p.janelaMs - (agora - maisAntigo);
        const esperaS = Math.ceil(esperaMs / 1000);
        throw new RateLimitHomologError(
          `RATE-LIMIT-HOMOLOG: a cota de homologação (${p.chamadas} chamadas / ${p.janelaMs / 60000} min) está ` +
            `cheia — esta chamada foi RECUSADA localmente para não queimar a cota e levar um 429 do BB. ` +
            `Aguarde ~${esperaS}s até a janela renovar. Nada foi enviado à rede.`
        );
      }
      carimbos.push(agora);
    },
    restantes(agora: number): number {
      podar(agora);
      return Math.max(0, p.chamadas - carimbos.length);
    },
  };
}
