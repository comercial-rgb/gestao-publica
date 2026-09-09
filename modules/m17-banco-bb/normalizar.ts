import { createHash } from "node:crypto";
import { toMoney } from "../../packages/contracts/index.js";
import { montarTransacaoOfx, type ExtratoOfx, type NaturezaExtrato, type TransacaoOfx } from "../../packages/ofx/index.js";
import { SPEC_BB } from "./config.js";

/**
 * M17 — NORMALIZAÇÃO: resposta da API Extratos do BB → o MESMO tipo do OFX (`TransacaoOfx`).
 *
 * ⚠️ UM DONO DO SHAPE. O adapter da API NÃO cria um tipo paralelo: produz `TransacaoOfx` via
 * `montarTransacaoOfx` (o dono da `linhaCanonica`, em packages/ofx). Assim OFX e API alimentam o
 * mesmo motor de conciliação, com a mesma definição de "a linha mudou".
 *
 * ═══ ⚠️ DECISÃO DE MAPEAMENTO — O FITID (Passo 0.c, do Winner) ═══
 * O OFX traz um FITID (id estável por transação). A API Extratos v1 NÃO tem equivalente. Sintetizo
 * um fitid DETERMINÍSTICO a partir dos campos da linha — assim reimportar o MESMO período por API
 * dá o MESMO fitid e o `@@unique([conta, fitid])` deduplica (mesma origem).
 *
 * ⚠️ E O QUE ISSO **NÃO** RESOLVE: o fitid sintetizado da API ≠ o FITID do OFX para a MESMA
 * transação real. Importar OFX **e** API do mesmo período DUPLICARIA — a dedup cross-origem depende
 * de o Winner decidir o mapeamento (a API expõe o FITID do OFX? ou importa-se OU um OU outro?). Fica
 * NOMEADO; este arquivo resolve só a dedup por-origem.
 *
 * ⚠️ NÚMERO → STRING NA FRONTEIRA. `valorLancamento` chega como número (JSON). A regra de ouro é
 * dinheiro-string; a conversão acontece AQUI, na borda, via `.toFixed(2)` — o único ponto onde o
 * número do banco vira a string do razão.
 *
 * ⚠️ NOMES DE CAMPO = SPEC_BB.campos (suposição do Passo 0.b — confirmar no Swagger).
 */

/** Uma entrada crua da resposta (os nomes vêm de SPEC_BB.campos; tipos frouxos porque é JSON). */
export interface LancamentoBbCru {
  readonly [campo: string]: unknown;
}

export interface ContextoConta {
  readonly agencia: string;
  readonly conta: string;
  readonly desde: Date;
  readonly ate: Date;
}

function comoNumero(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
  if (!Number.isFinite(n)) throw new Error(`BB-CAMPO-NAO-NUMERICO: esperava número, veio "${String(v)}".`);
  return n;
}

/** ddmmaaaa (número ou string) → Date ancorada ao meio-dia UTC (a doutrina de data-do-fato). */
function parseDataBb(v: unknown): Date {
  const s = String(comoNumero(v)).padStart(8, "0");
  const dia = Number.parseInt(s.slice(0, 2), 10);
  const mes = Number.parseInt(s.slice(2, 4), 10);
  const ano = Number.parseInt(s.slice(4, 8), 10);
  const d = new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0));
  if (Number.isNaN(d.getTime()) || d.getUTCDate() !== dia) throw new Error(`BB-DATA-INVALIDA: "${String(v)}" não é ddmmaaaa.`);
  return d;
}

/** O fitid determinístico — ver o cabeçalho (decisão do Winner). */
export function sintetizarFitid(c: {
  readonly agencia: string;
  readonly conta: string;
  readonly data: unknown;
  readonly valor: unknown;
  readonly indicador: unknown;
  readonly documento: unknown;
  readonly sequencia: unknown;
}): string {
  const chave = [c.agencia, c.conta, String(c.data), String(c.valor), String(c.indicador), String(c.documento ?? ""), String(c.sequencia ?? "")].join("|");
  return `BB-${createHash("sha256").update(chave).digest("hex").slice(0, 24)}`;
}

/** Uma entrada crua da API → `TransacaoOfx`. Pura, testável contra a fixture do Swagger. */
export function lancamentoBbParaTransacao(bb: LancamentoBbCru, ctx: ContextoConta): TransacaoOfx {
  const campo = SPEC_BB.campos;
  const dataPostagem = parseDataBb(bb[campo.data]);
  const bruto = comoNumero(bb[campo.valor]);
  const natureza: NaturezaExtrato = bb[campo.indicador] === campo.indicadorCredito ? "CREDITO" : "DEBITO";
  const historico = String(bb[campo.historico] ?? "").trim();
  const complemento = String(bb[campo.complemento] ?? "").trim();
  const memo = complemento !== "" && complemento !== historico ? `${historico} — ${complemento}`.trim() : historico;
  const docNum = bb[campo.documento];
  const documento = docNum !== undefined && docNum !== null && String(docNum) !== "0" ? String(docNum) : undefined;

  const fitid = sintetizarFitid({
    agencia: ctx.agencia,
    conta: ctx.conta,
    data: bb[campo.data],
    valor: bb[campo.valor],
    indicador: bb[campo.indicador],
    documento: bb[campo.documento],
    sequencia: bb[campo.sequencia],
  });

  return montarTransacaoOfx({ fitid, dataPostagem, valor: toMoney(Math.abs(bruto).toFixed(2)), natureza, memo, documento });
}

/** A resposta inteira da API → `ExtratoOfx` (o container do OFX). */
export function normalizarExtratoBb(resposta: Record<string, unknown>, ctx: ContextoConta): ExtratoOfx {
  const lista = resposta[SPEC_BB.campos.lista];
  if (!Array.isArray(lista)) {
    throw new Error(`BB-RESPOSTA-SEM-LISTA: faltou "${SPEC_BB.campos.lista}" na resposta (array de lançamentos).`);
  }
  const transacoes = (lista as LancamentoBbCru[]).map((l) => lancamentoBbParaTransacao(l, ctx));
  return {
    moeda: "BRL",
    acctid: ctx.conta,
    bankid: "001", // Banco do Brasil
    periodoInicio: ctx.desde,
    periodoFim: ctx.ate,
    transacoes,
  };
}
