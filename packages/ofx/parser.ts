import { toMoney, type Money } from "../contracts/index.js";

/**
 * PARSER OFX — DOMÍNIO PURO. Zero I/O, zero banco, zero dependência externa.
 *
 * ═══ POR QUE UM PARSER PRÓPRIO ═══
 * OFX 1.x é SGML, não XML: as tags folha NÃO fecham (`<FITID>123` e ponto). As
 * libs de XML engasgam nisso, e as libs de OFX do npm são abandonware que aceita
 * qualquer coisa. Aqui o arquivo é a FRONTEIRA do sistema com o banco — o lugar
 * onde um dado errado entra e vira verdade contábil. Então o parser é nosso, e é
 * PARANOICO.
 *
 * ═══ FAIL-CLOSED TOTAL ═══
 * Tag obrigatória ausente, valor não numérico, data inválida, FITID vazio, moeda
 * diferente de BRL: ERRO, com a LINHA e a posição. E o erro derruba o arquivo
 * INTEIRO — nada é importado de um arquivo parcialmente válido. Meio extrato é
 * pior que nenhum: ele parece completo.
 *
 * ═══ O SINAL É NORMALIZADO NA FRONTEIRA ═══
 * O OFX manda `TRNAMT` com sinal. Aqui ele vira `valor` (SEMPRE positivo) +
 * `natureza` (CREDITO/DEBITO) — a mesma disciplina do resto do projeto: nenhum
 * valor negativo escondendo um débito. `TRNAMT` zero é REJEITADO: o banco não
 * movimenta zero, e uma linha de zero só pode ser lixo.
 */

export type NaturezaExtrato = "CREDITO" | "DEBITO";

export interface TransacaoOfx {
  readonly fitid: string;
  /** Só a porção de DATA do DTPOSTED — hora e timezone são descartados. */
  readonly dataPostagem: Date;
  /** SEMPRE positivo. O sinal virou `natureza`. */
  readonly valor: Money;
  readonly natureza: NaturezaExtrato;
  readonly memo: string;
  /** CHECKNUM — nem todo banco manda. */
  readonly documento?: string | undefined;
  /**
   * O conteúdo canônico da linha, para o `linhaHash`. Fica AQUI (e não em quem
   * importa) para que a definição de "a linha mudou" seja uma só.
   */
  readonly linhaCanonica: string;
}

export interface ExtratoOfx {
  readonly moeda: string;
  readonly acctid: string;
  readonly bankid?: string | undefined;
  /** DTSTART/DTEND. Ausentes: quem importa deriva do min/max das transações. */
  readonly periodoInicio?: Date | undefined;
  readonly periodoFim?: Date | undefined;
  readonly transacoes: readonly TransacaoOfx[];
}

export class OfxInvalidoError extends Error {
  constructor(
    message: string,
    readonly linha: number,
    readonly posicao: number
  ) {
    super(`OFX inválido (linha ${linha}): ${message}`);
    this.name = "OfxInvalidoError";
  }
}

interface Tag {
  readonly nome: string;
  readonly valor: string;
  readonly linha: number;
  readonly posicao: number;
}

/** Toda tag SGML do arquivo, com a linha em que apareceu. */
function tokenizar(texto: string): readonly Tag[] {
  const re = /<(\/?[A-Za-z0-9._]+)>([^<]*)/g;
  const tags: Tag[] = [];
  let m: RegExpExecArray | null;

  while ((m = re.exec(texto)) !== null) {
    const posicao = m.index;
    // A linha sai da contagem de quebras até aqui — é o que torna o erro útil.
    const linha = (texto.slice(0, posicao).match(/\n/g)?.length ?? 0) + 1;
    tags.push({
      nome: m[1]!.toUpperCase(),
      valor: (m[2] ?? "").trim(),
      linha,
      posicao,
    });
  }
  return tags;
}

/**
 * DTPOSTED: `YYYYMMDD`, opcionalmente seguido de `HHMMSS` e de um timezone entre
 * colchetes (`[-3:BRT]`). Só a DATA importa — a hora do banco é o fuso do banco, e
 * o extrato é um documento de DIA. Guardar a hora convidaria a comparar
 * timestamps de fusos diferentes.
 */
function parseDataOfx(bruto: string, tag: Tag): Date {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(bruto);
  if (m === null) {
    throw new OfxInvalidoError(
      `DTPOSTED "${bruto}" não começa com uma data YYYYMMDD.`,
      tag.linha,
      tag.posicao
    );
  }
  // O que sobra tem de ser hora (6 dígitos) e/ou timezone — nada mais.
  const resto = bruto.slice(8);
  if (!/^(\d{6})?(\.\d+)?(\[[^\]]*\])?$/.test(resto)) {
    throw new OfxInvalidoError(
      `DTPOSTED "${bruto}" tem sobra ilegível após a data ("${resto}").`,
      tag.linha,
      tag.posicao
    );
  }

  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);

  const data = new Date(Date.UTC(ano, mes - 1, dia));
  // Rejeita 2026-02-31 e amigos: o Date "corrigiria" em silêncio para 03/03.
  if (
    data.getUTCFullYear() !== ano ||
    data.getUTCMonth() !== mes - 1 ||
    data.getUTCDate() !== dia
  ) {
    throw new OfxInvalidoError(
      `DTPOSTED "${bruto}" não é uma data real.`,
      tag.linha,
      tag.posicao
    );
  }
  return data;
}

/** TRNAMT: decimal com sinal. Nada de `1.0e3`, nada de vírgula, nada de vazio. */
function parseValorOfx(bruto: string, tag: Tag): Money {
  if (!/^[+-]?\d+(\.\d+)?$/.test(bruto)) {
    throw new OfxInvalidoError(
      `TRNAMT "${bruto}" não é um número decimal válido.`,
      tag.linha,
      tag.posicao
    );
  }
  return toMoney(bruto);
}

function exigir(
  valor: string | undefined,
  nome: string,
  tag: Tag
): string {
  if (valor === undefined || valor === "") {
    throw new OfxInvalidoError(
      `${nome} ausente ou vazio na transação.`,
      tag.linha,
      tag.posicao
    );
  }
  return valor;
}

/**
 * Lê um OFX inteiro. Lança `OfxInvalidoError` ao primeiro problema — de propósito:
 * um arquivo com uma linha podre não é "um arquivo com uma linha a menos", é um
 * arquivo em que não se pode confiar.
 */
export function parseOfx(conteudo: string): ExtratoOfx {
  const tags = tokenizar(conteudo);
  if (tags.length === 0) {
    throw new OfxInvalidoError("arquivo não contém nenhuma tag OFX.", 1, 0);
  }

  const cabecalho = new Map<string, Tag>();
  const transacoes: TransacaoOfx[] = [];

  let atual: Map<string, Tag> | null = null;
  let abertura: Tag | null = null;

  for (const tag of tags) {
    if (tag.nome === "STMTTRN") {
      atual = new Map();
      abertura = tag;
      continue;
    }
    if (tag.nome === "/STMTTRN") {
      if (atual === null || abertura === null) {
        throw new OfxInvalidoError(
          "</STMTTRN> sem <STMTTRN> correspondente.",
          tag.linha,
          tag.posicao
        );
      }
      transacoes.push(montarTransacao(atual, abertura));
      atual = null;
      abertura = null;
      continue;
    }
    // Tag de fechamento qualquer: ignorada (o SGML fecha os containers).
    if (tag.nome.startsWith("/")) continue;
    // Container sem valor: ignorado. Só as FOLHAS interessam.
    if (tag.valor === "") continue;

    if (atual !== null) {
      atual.set(tag.nome, tag);
    } else {
      cabecalho.set(tag.nome, tag);
    }
  }

  if (atual !== null) {
    throw new OfxInvalidoError(
      "<STMTTRN> aberto e não fechado — arquivo truncado.",
      abertura?.linha ?? 1,
      abertura?.posicao ?? 0
    );
  }

  // ── Cabeçalho ──────────────────────────────────────────────────────────
  const primeira = tags[0]!;

  const curdef = cabecalho.get("CURDEF");
  if (curdef === undefined) {
    throw new OfxInvalidoError(
      "CURDEF (moeda) ausente — não se importa extrato sem saber a moeda.",
      primeira.linha,
      primeira.posicao
    );
  }
  if (curdef.valor.toUpperCase() !== "BRL") {
    // FAIL-CLOSED: um extrato em outra moeda casaria valores que não existem no
    // razão. Converter aqui seria inventar taxa de câmbio.
    throw new OfxInvalidoError(
      `moeda "${curdef.valor}" não é BRL. O SIAFIC é em reais — ` +
        `importar outra moeda casaria valores convertidos por uma taxa que ` +
        `ninguém informou.`,
      curdef.linha,
      curdef.posicao
    );
  }

  const acctid = cabecalho.get("ACCTID");
  if (acctid === undefined || acctid.valor === "") {
    throw new OfxInvalidoError(
      "ACCTID (número da conta) ausente.",
      primeira.linha,
      primeira.posicao
    );
  }

  const bankid = cabecalho.get("BANKID");
  const dtstart = cabecalho.get("DTSTART");
  const dtend = cabecalho.get("DTEND");

  return {
    moeda: "BRL",
    acctid: acctid.valor,
    ...(bankid !== undefined ? { bankid: bankid.valor } : {}),
    ...(dtstart !== undefined
      ? { periodoInicio: parseDataOfx(dtstart.valor, dtstart) }
      : {}),
    ...(dtend !== undefined
      ? { periodoFim: parseDataOfx(dtend.valor, dtend) }
      : {}),
    transacoes,
  };
}

function montarTransacao(
  campos: Map<string, Tag>,
  abertura: Tag
): TransacaoOfx {
  const fitid = exigir(campos.get("FITID")?.valor, "FITID", abertura);
  const memo = exigir(campos.get("MEMO")?.valor, "MEMO", abertura);

  const tagData = campos.get("DTPOSTED");
  if (tagData === undefined) {
    throw new OfxInvalidoError("DTPOSTED ausente.", abertura.linha, abertura.posicao);
  }
  const dataPostagem = parseDataOfx(tagData.valor, tagData);

  const tagValor = campos.get("TRNAMT");
  if (tagValor === undefined) {
    throw new OfxInvalidoError("TRNAMT ausente.", abertura.linha, abertura.posicao);
  }
  const bruto = parseValorOfx(tagValor.valor, tagValor);

  // ═══ A NORMALIZAÇÃO DO SINAL — a fronteira ═══
  if (bruto.isZero()) {
    throw new OfxInvalidoError(
      `TRNAMT zero no FITID "${fitid}": o banco não movimenta zero.`,
      tagValor.linha,
      tagValor.posicao
    );
  }
  const natureza: NaturezaExtrato = bruto.isNegative() ? "DEBITO" : "CREDITO";
  const valor = toMoney(bruto.abs());

  const documento = campos.get("CHECKNUM")?.valor;

  return montarTransacaoOfx({ fitid, dataPostagem, valor, natureza, memo, documento });
}

/**
 * ⚠️ O CONSTRUTOR DE UMA `TransacaoOfx` — E O DONO DA `linhaCanonica`.
 *
 * A "definição de que a linha mudou" mora AQUI, num lugar só. O parser OFX a usa; o adapter da API
 * do banco (M17) TAMBÉM — é a doutrina do um-dono-do-shape: a origem API não nasce com um tipo
 * paralelo nem uma canônica própria que divergiria da do OFX no dia em que alguém mudasse o join.
 * Quem tem `fitid`, data, valor, natureza e memo, tem uma transação — venha de OFX ou de JSON.
 */
export function montarTransacaoOfx(c: {
  readonly fitid: string;
  readonly dataPostagem: Date;
  readonly valor: Money;
  readonly natureza: NaturezaExtrato;
  readonly memo: string;
  readonly documento?: string | undefined;
}): TransacaoOfx {
  const iso = c.dataPostagem.toISOString().slice(0, 10);
  const doc = c.documento !== undefined && c.documento !== "" ? c.documento : undefined;
  return {
    fitid: c.fitid,
    dataPostagem: c.dataPostagem,
    valor: c.valor,
    natureza: c.natureza,
    memo: c.memo,
    ...(doc !== undefined ? { documento: doc } : {}),
    linhaCanonica: [c.fitid, iso, c.natureza, c.valor.toFixed(2), doc ?? "", c.memo].join("|"),
  };
}
