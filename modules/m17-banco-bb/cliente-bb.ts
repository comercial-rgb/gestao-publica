import type { CredenciaisBb } from "./config.js";
import { SPEC_BB } from "./config.js";
import { criarProvedorDeToken, type FetchLike, type ProvedorDeToken } from "./oauth.js";
import { criarLimitador, RateLimitHomologError, type LimitadorDeChamadas } from "./rate-limit.js";
import { normalizarExtratoBb, type ContextoConta } from "./normalizar.js";
import type { ExtratoOfx } from "../../packages/ofx/index.js";

/**
 * M17 — O CLIENTE HTTP DA API DO BB (LEITURA). Amarra token (cache) + rate-limit (fail-closed) +
 * retry (só 5xx, NUNCA 429) + LOG de toda chamada (TR 4.12.2) — sem NUNCA logar token/secret/appKey.
 *
 * ⚠️ TODA CHAMADA LEVA `gw-dev-app-key={appKey}` (query) + `Authorization: Bearer {token}` (header).
 * O appKey vai na URL só na hora do fetch; o que se LOGA é o ENDPOINT (path), nunca a URL com a key.
 *
 * ⚠️ `fetch`, `agora` e o `logger` são INJETADOS — a suíte testa contra fixtures, sem tocar a rede.
 * O smoke script (scripts/bb-smoke.ts) injeta o fetch real e é rodado pelo Winner.
 */

/** ⚠️ O EVENTO LOGADO — repare no que NÃO tem: token, secret, appKey. Por construção. */
export interface EventoChamadaBb {
  readonly acao: string;
  /** O PATH do recurso (sem a query com o appKey). */
  readonly endpoint: string;
  readonly periodo?: string | undefined;
  readonly httpStatus: number;
  readonly quantidade?: number | undefined;
  readonly resultado: "SUCESSO" | "ERRO";
  readonly detalhe?: string | undefined;
}

export interface LoggerBb {
  readonly registrar: (e: EventoChamadaBb) => Promise<void>;
}

export class ChamadaBbError extends Error {
  constructor(mensagem: string, readonly httpStatus: number) {
    super(mensagem);
    this.name = "ChamadaBbError";
  }
}

export interface ClienteBb {
  readonly extratoDoPeriodo: (p: ContextoConta, agora: number) => Promise<ExtratoOfx>;
  readonly saldoDaConta: (p: { agencia: string; conta: string }, agora: number) => Promise<string>;
}

export interface OpcoesCliente {
  readonly credenciais: CredenciaisBb;
  readonly appKey: string;
  readonly fetch: FetchLike;
  readonly logger: LoggerBb;
  /** Nº de retries em 5xx (default 2). Nunca retenta 429/4xx. */
  readonly maxRetries?: number | undefined;
  /** Injetável para o teste não dormir de verdade. */
  readonly dormir?: (ms: number) => Promise<void>;
  /** Injetável para testar sem lançar o próprio provedor/limitador. */
  readonly token?: ProvedorDeToken | undefined;
  readonly limitador?: LimitadorDeChamadas | undefined;
}

const ddmmaaaa = (d: Date): string => `${String(d.getUTCDate()).padStart(2, "0")}${String(d.getUTCMonth() + 1).padStart(2, "0")}${d.getUTCFullYear()}`;

export function criarClienteBb(opts: OpcoesCliente): ClienteBb {
  const token =
    opts.token ??
    criarProvedorDeToken({ url: SPEC_BB.oauthTokenUrl, credenciais: opts.credenciais, scope: SPEC_BB.scopeExtratos, margemMs: SPEC_BB.margemTokenMs, fetch: opts.fetch });
  const limitador = opts.limitador ?? criarLimitador(SPEC_BB.rateLimite);
  const maxRetries = opts.maxRetries ?? 2;
  const dormir = opts.dormir ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  /** Uma chamada de recurso: rate-limit → token → fetch (retry 5xx) → LOG (sem segredo). */
  async function chamar(acao: string, path: string, query: Record<string, string>, periodo: string | undefined, agora: number): Promise<Record<string, unknown>> {
    // ⚠️ FAIL-CLOSED antes da rede: se a cota estouraria, recusa aqui (nunca queima a 11ª).
    limitador.registrar(agora);

    const bearer = await token.obter(agora);
    const qs = new URLSearchParams({ ...query, "gw-dev-app-key": opts.appKey }).toString();
    const url = `${SPEC_BB.apiBaseUrl}${path}?${qs}`;

    let ultimoStatus = 0;
    for (let tentativa = 0; tentativa <= maxRetries; tentativa++) {
      const resp = await opts.fetch(url, { method: "GET", headers: { Authorization: `Bearer ${bearer}`, Accept: "application/json" } });
      ultimoStatus = resp.status;

      if (resp.ok) {
        const corpo = (await resp.json()) as Record<string, unknown>;
        const lista = corpo[SPEC_BB.campos.lista];
        await opts.logger.registrar({ acao, endpoint: path, periodo, httpStatus: resp.status, quantidade: Array.isArray(lista) ? lista.length : undefined, resultado: "SUCESSO" });
        return corpo;
      }

      // ⚠️ 429 NÃO SE RETENTA — significa cota estourada; esperar a janela é a única saída.
      if (resp.status === 429) {
        await opts.logger.registrar({ acao, endpoint: path, periodo, httpStatus: 429, resultado: "ERRO", detalhe: "429 do BB — cota estourada" });
        throw new RateLimitHomologError("RATE-LIMIT-HOMOLOG: o BB devolveu 429 (cota estourada). Aguarde a janela renovar; NÃO se retenta.");
      }
      // Só 5xx retenta; 4xx (fora 429) é erro do pedido — não adianta repetir.
      if (resp.status < 500 || tentativa === maxRetries) {
        await opts.logger.registrar({ acao, endpoint: path, periodo, httpStatus: resp.status, resultado: "ERRO", detalhe: `HTTP ${resp.status}` });
        throw new ChamadaBbError(`BB-CHAMADA-FALHOU: ${path} respondeu HTTP ${resp.status}.`, resp.status);
      }
      await dormir(200 * (tentativa + 1));
    }
    throw new ChamadaBbError(`BB-CHAMADA-FALHOU: ${path} esgotou os retries (último HTTP ${ultimoStatus}).`, ultimoStatus);
  }

  return {
    async extratoDoPeriodo(p, agora) {
      const path = SPEC_BB.pathExtrato.replace("{agencia}", p.agencia).replace("{conta}", p.conta);
      const query = { [SPEC_BB.campos.data === "dataLancamento" ? "dataInicioSolicitacao" : "dataInicio"]: ddmmaaaa(p.desde), dataFimSolicitacao: ddmmaaaa(p.ate) };
      const periodo = `${ddmmaaaa(p.desde)}-${ddmmaaaa(p.ate)}`;
      const corpo = await chamar("CONSULTAR_EXTRATO_API_BB", path, query, periodo, agora);
      return normalizarExtratoBb(corpo, p);
    },
    async saldoDaConta(p, agora) {
      // ⚠️ SUPOSIÇÃO (Passo 0.b): a Extratos v1 não tem endpoint de saldo separado — o saldo vem no
      // corpo do extrato. Confirmar no Swagger; se houver endpoint próprio, é aqui que ele entra.
      const path = SPEC_BB.pathExtrato.replace("{agencia}", p.agencia).replace("{conta}", p.conta);
      const corpo = await chamar("CONSULTAR_SALDO_API_BB", path, {}, undefined, agora);
      const saldo = corpo["valorSaldoUltimo"] ?? corpo["saldoAtual"] ?? corpo["valorSaldo"];
      if (saldo === undefined) throw new ChamadaBbError("BB-SALDO-AUSENTE: a resposta não trouxe o saldo (confirmar o campo no Swagger).", 200);
      return Number(saldo).toFixed(2);
    },
  };
}
