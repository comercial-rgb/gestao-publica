import type { CredenciaisBb } from "./config.js";

/**
 * M17 — OAUTH client_credentials do BB, com CACHE de token até o expiry (margem de 60s).
 *
 * ⚠️ O TOKEN É CACHEADO. Cada chamada de recurso reusa o access_token vigente; só quando ele está a
 * menos de `margemMs` de expirar é que se pede outro. Pedir token a cada chamada desperdiçaria
 * latência e — em homologação — arriscaria a própria cota.
 *
 * ⚠️ O SECRET NUNCA VAZA. Ele entra só no header Basic (base64) da chamada de token; não é logado, e
 * o erro desta função NUNCA embute o secret nem o token (o teste do F4 prova o logger cego).
 *
 * ⚠️ `fetch` e `agora` são INJETADOS — a suíte testa sem tocar a rede real nem esperar o expiry.
 */

export interface RespostaToken {
  readonly access_token: string;
  readonly token_type: string;
  readonly expires_in: number;
}

export type FetchLike = (url: string, init: {
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body?: string;
}) => Promise<{ readonly status: number; readonly ok: boolean; json: () => Promise<unknown>; text: () => Promise<string> }>;

export interface ProvedorDeToken {
  readonly obter: (agora: number) => Promise<string>;
}

function base64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

export function criarProvedorDeToken(p: {
  readonly url: string;
  readonly credenciais: CredenciaisBb;
  readonly scope: string;
  readonly margemMs: number;
  readonly fetch: FetchLike;
}): ProvedorDeToken {
  let cache: { readonly token: string; readonly expiraEm: number } | null = null;

  return {
    async obter(agora: number): Promise<string> {
      if (cache !== null && agora < cache.expiraEm - p.margemMs) return cache.token;

      const resp = await p.fetch(p.url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${base64(`${p.credenciais.clientId}:${p.credenciais.clientSecret}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `grant_type=client_credentials&scope=${encodeURIComponent(p.scope)}`,
      });

      if (!resp.ok) {
        // ⚠️ A mensagem NÃO inclui o secret nem o corpo com credenciais — só o status.
        throw new Error(`BB-OAUTH-FALHOU: o endpoint de token respondeu HTTP ${resp.status}. Confira as credenciais e o scope.`);
      }

      const corpo = (await resp.json()) as Partial<RespostaToken>;
      if (typeof corpo.access_token !== "string" || typeof corpo.expires_in !== "number") {
        throw new Error("BB-OAUTH-RESPOSTA-INVALIDA: faltou access_token/expires_in na resposta do token.");
      }

      cache = { token: corpo.access_token, expiraEm: agora + corpo.expires_in * 1000 };
      return corpo.access_token;
    },
  };
}
