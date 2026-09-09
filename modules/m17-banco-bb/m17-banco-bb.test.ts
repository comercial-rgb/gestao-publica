import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { criarLimitador, RateLimitHomologError } from "./rate-limit.js";
import { criarProvedorDeToken, type FetchLike } from "./oauth.js";
import { lancamentoBbParaTransacao, normalizarExtratoBb, sintetizarFitid } from "./normalizar.js";
import { criarClienteBb, type EventoChamadaBb } from "./cliente-bb.js";

/**
 * M17-a — o adapter do BB, testado SEM tocar a rede real (fetch injetado). A suíte nunca chama o BB;
 * o smoke script (scripts/bb-smoke.ts) é que faz a chamada real, e é do Winner.
 */

/** Um fetch de mentira que devolve respostas da FILA, em ordem, e registra as URLs chamadas. */
function fetchDeFila(respostas: readonly { status: number; body: unknown }[]): { fetch: FetchLike; urls: string[] } {
  const urls: string[] = [];
  let i = 0;
  const fetch: FetchLike = async (url) => {
    urls.push(url);
    const r = respostas[Math.min(i, respostas.length - 1)]!;
    i += 1;
    return { status: r.status, ok: r.status >= 200 && r.status < 300, json: async () => r.body, text: async () => JSON.stringify(r.body) };
  };
  return { fetch, urls };
}

const TOKEN_OK = { status: 200, body: { access_token: "tok-abc", token_type: "Bearer", expires_in: 300 } };
const CRED = { appKey: "APPKEY-XYZ", clientId: "cid", clientSecret: "SECRET-123" };

describe("F1 — rate-limit (10/10min, fail-closed)", () => {
  it("deixa passar 10 na janela e RECUSA a 11ª localmente, antes da rede", () => {
    const lim = criarLimitador({ chamadas: 10, janelaMs: 600_000 });
    for (let n = 0; n < 10; n++) lim.registrar(1000 + n); // 10 chamadas na janela
    expect(() => lim.registrar(2000)).toThrow(RateLimitHomologError);
    expect(() => lim.registrar(2000)).toThrow(/RATE-LIMIT-HOMOLOG/);
  });

  it("a janela DESLIZA: passados 10min, a cota renova", () => {
    const lim = criarLimitador({ chamadas: 10, janelaMs: 600_000 });
    for (let n = 0; n < 10; n++) lim.registrar(1000);
    expect(lim.restantes(1000)).toBe(0);
    expect(lim.restantes(1000 + 600_001)).toBe(10); // a janela renovou
  });
});

describe("F1 — OAuth com cache de token", () => {
  it("cacheia o token até a margem de expiry e só então repede", async () => {
    const { fetch, urls } = fetchDeFila([TOKEN_OK]);
    const prov = criarProvedorDeToken({ url: "https://oauth.hm.bb.com.br/oauth/token", credenciais: CRED, scope: "extrato-info", margemMs: 60_000, fetch });

    expect(await prov.obter(0)).toBe("tok-abc");
    expect(await prov.obter(100_000)).toBe("tok-abc"); // < 300000−60000 = 240000 → cache
    expect(urls.length).toBe(1); // uma só ida ao endpoint de token

    // Novo token disponível para a 2ª ida; passado o ponto de renovação, repede.
    const { fetch: f2, urls: u2 } = fetchDeFila([{ status: 200, body: { access_token: "tok-def", expires_in: 300 } }]);
    const prov2 = criarProvedorDeToken({ url: "x", credenciais: CRED, scope: "s", margemMs: 60_000, fetch: f2 });
    await prov2.obter(0);
    await prov2.obter(250_000); // > 240000 → renova
    expect(u2.length).toBe(2);
  });
});

describe("F2 — normalização: resposta da API → o MESMO tipo do OFX", () => {
  const ctx = { agencia: "1234", conta: "56789", desde: new Date(Date.UTC(2026, 6, 1)), ate: new Date(Date.UTC(2026, 6, 31)) };
  const respostaBb = {
    numeroPaginaAtual: 1,
    listaLancamento: [
      { dataLancamento: 15072026, valorLancamento: 1234.56, indicadorTipoLancamento: "C", textoDescricaoHistorico: "Deposito", numeroDocumento: 777, numeroLancamento: 1 },
      { dataLancamento: 16072026, valorLancamento: 50.0, indicadorTipoLancamento: "D", textoDescricaoHistorico: "Tarifa", numeroDocumento: 0, numeroLancamento: 2 },
    ],
  };

  it("mapeia data (ddmmaaaa), valor (número→string), natureza (C/D), memo e documento", () => {
    const ext = normalizarExtratoBb(respostaBb, ctx);
    expect(ext.transacoes).toHaveLength(2);
    const [c, d] = ext.transacoes;
    expect(c!.natureza).toBe("CREDITO");
    expect(c!.valor.toFixed(2)).toBe("1234.56"); // número virou string na fronteira
    expect(c!.dataPostagem.toISOString().slice(0, 10)).toBe("2026-07-15");
    expect(c!.memo).toBe("Deposito");
    expect(c!.documento).toBe("777");
    expect(d!.natureza).toBe("DEBITO");
    expect(d!.documento).toBeUndefined(); // numeroDocumento 0 → sem documento
  });

  it("o fitid sintetizado é DETERMINÍSTICO (reimportar o mesmo período dá o mesmo id)", () => {
    const t1 = lancamentoBbParaTransacao(respostaBb.listaLancamento[0]!, ctx);
    const t2 = lancamentoBbParaTransacao(respostaBb.listaLancamento[0]!, ctx);
    expect(t1.fitid).toBe(t2.fitid);
    expect(t1.fitid).toMatch(/^BB-[0-9a-f]{24}$/);
    // Muda um campo → muda o fitid.
    const outro = sintetizarFitid({ agencia: "1234", conta: "56789", data: 15072026, valor: 9999, indicador: "C", documento: 777, sequencia: 1 });
    expect(outro).not.toBe(t1.fitid);
  });
});

describe("F1/F2/F4 — o cliente completo (token → extrato → normaliza → loga sem segredo)", () => {
  function clienteComEventos(respostas: readonly { status: number; body: unknown }[]) {
    const eventos: EventoChamadaBb[] = [];
    const { fetch, urls } = fetchDeFila(respostas);
    const cli = criarClienteBb({
      credenciais: CRED,
      appKey: CRED.appKey,
      fetch,
      logger: { registrar: async (e) => { eventos.push(e); } },
      dormir: async () => {}, // não dorme no teste
    });
    return { cli, eventos, urls };
  }

  const EXTRATO_OK = { status: 200, body: { listaLancamento: [{ dataLancamento: 15072026, valorLancamento: 10, indicadorTipoLancamento: "C", textoDescricaoHistorico: "x", numeroDocumento: 0, numeroLancamento: 1 }] } };

  it("chama o token, depois o extrato, normaliza, e loga endpoint/status/qtd", async () => {
    const { cli, eventos, urls } = clienteComEventos([TOKEN_OK, EXTRATO_OK]);
    const ext = await cli.extratoDoPeriodo({ agencia: "1234", conta: "56789", desde: new Date(Date.UTC(2026, 6, 1)), ate: new Date(Date.UTC(2026, 6, 31)) }, 0);
    expect(ext.transacoes).toHaveLength(1);
    // O log tem o METADADO da chamada…
    const ev = eventos.find((e) => e.acao === "CONSULTAR_EXTRATO_API_BB")!;
    expect(ev.httpStatus).toBe(200);
    expect(ev.quantidade).toBe(1);
    // …e a URL do recurso levou o appKey, mas o ENDPOINT logado é o PATH, sem ele.
    expect(urls[1]).toContain("gw-dev-app-key=APPKEY-XYZ");
    expect(ev.endpoint).not.toContain("APPKEY-XYZ");
  });

  it("F4 — o logger NUNCA recebe token, secret ou appKey em campo nenhum", async () => {
    const { cli, eventos } = clienteComEventos([TOKEN_OK, EXTRATO_OK]);
    await cli.extratoDoPeriodo({ agencia: "1234", conta: "56789", desde: new Date(Date.UTC(2026, 6, 1)), ate: new Date(Date.UTC(2026, 6, 31)) }, 0);
    const tudo = JSON.stringify(eventos);
    expect(tudo).not.toContain("tok-abc"); // token
    expect(tudo).not.toContain("SECRET-123"); // client secret
    expect(tudo).not.toContain("APPKEY-XYZ"); // app key
  });

  it("F4 (grep de fonte) — o EventoChamadaBb não DECLARA campo de credencial algum", () => {
    // A garantia mais forte que um runtime: o TIPO que o logger recebe não tem onde carregar segredo.
    const fonte = readFileSync(fileURLToPath(new URL("./cliente-bb.ts", import.meta.url)), "utf8");
    const corpo = fonte.slice(fonte.indexOf("interface EventoChamadaBb"), fonte.indexOf("interface LoggerBb"));
    // Só os NOMES de campo declarados (`readonly xxx`), ignorando comentários — é o que o logger recebe.
    const campos = [...corpo.matchAll(/readonly\s+(\w+)/g)].map((m) => m[1]!.toLowerCase());
    expect(campos).toEqual(["acao", "endpoint", "periodo", "httpstatus", "quantidade", "resultado", "detalhe"]);
    for (const proibido of ["token", "secret", "appkey", "app_key", "clientsecret", "authorization", "bearer"]) {
      expect(campos).not.toContain(proibido);
    }
  });

  it("retry SÓ em 5xx: 503 depois 200 → sucesso; 429 → estoura NA HORA, sem retry", async () => {
    const ok = await clienteComEventos([TOKEN_OK, { status: 503, body: {} }, EXTRATO_OK]);
    const ext = await ok.cli.extratoDoPeriodo({ agencia: "1", conta: "2", desde: new Date(0), ate: new Date(0) }, 0);
    expect(ext.transacoes).toHaveLength(1); // recuperou no retry

    const quatroVinteNove = await clienteComEventos([TOKEN_OK, { status: 429, body: {} }, EXTRATO_OK]);
    await expect(quatroVinteNove.cli.extratoDoPeriodo({ agencia: "1", conta: "2", desde: new Date(0), ate: new Date(0) }, 0)).rejects.toThrow(/RATE-LIMIT-HOMOLOG/);
    // NÃO consumiu a 3ª resposta (não houve retry no 429).
    expect(quatroVinteNove.urls.length).toBe(2); // token + a 1ª (e única) do recurso
  });
});
