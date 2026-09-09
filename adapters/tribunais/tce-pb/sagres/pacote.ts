import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import type { ArquivoGerado } from "./gerador.js";

/**
 * PACOTE SAGRES (F3) — o ZIP diário/mensal + o manifesto de procedência.
 *
 * ═══ DETERMINÍSTICO POR PRINCÍPIO ═══
 * A MESMA massa produz o MESMO byte — e o MESMO SHA-256. Um arquivo que vai ao TCE tem de ser
 * reproduzível: quem auditar amanhã gera o mesmo hash. Por isso: data fixa 1980 no ZIP (como o
 * `zipar` do M14), entradas ORDENADAS por nome, e o manifesto SEM timestamp (a competência entra
 * como dado, nunca "agora"). O hash do pacote é derivado dos hashes dos arquivos, não do relógio.
 *
 * ═══ O MANIFESTO PROVA, NÃO ACEITA (DIRETIVA §7 / PATCH §6) ═══
 * O manifesto atesta INTEGRIDADE LOCAL (o que foi gerado, e o seu hash) — nunca "o TCE recebeu".
 * Ele não carrega recibo nem protocolo: isso só existe com transmissão real.
 */

// ── CRC-32 (tabela padrão IEEE) — o que o formato ZIP exige por entrada. ─────────
const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABELA_CRC[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface EntradaZip {
  readonly nome: string;
  readonly conteudo: Buffer;
}

/**
 * ZIP determinístico multi-entrada (PKWARE, deflate, data fixa 1980). Entradas ORDENADAS por nome
 * para que a ordem de geração não mude os bytes. Sem dependência externa (mesma doutrina do M14).
 */
export function ziparDeterministico(entradas: readonly EntradaZip[]): Buffer {
  const ordenadas = [...entradas].sort((a, b) => (a.nome < b.nome ? -1 : a.nome > b.nome ? 1 : 0));
  const DATA_1980 = 0x0021;
  const locais: Buffer[] = [];
  const centrais: Buffer[] = [];
  let offset = 0;

  for (const e of ordenadas) {
    const nome = Buffer.from(e.nome, "utf8");
    const cru = e.conteudo;
    const comp = deflateRawSync(cru);
    const crc = crc32(cru);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10); // hora fixa
    local.writeUInt16LE(DATA_1980, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(cru.length, 22);
    local.writeUInt16LE(nome.length, 26);
    local.writeUInt16LE(0, 28);
    locais.push(local, nome, comp);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(DATA_1980, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(cru.length, 24);
    central.writeUInt16LE(nome.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrais.push(central, nome);

    offset += local.length + nome.length + comp.length;
  }

  const corpoLocal = Buffer.concat(locais);
  const corpoCentral = Buffer.concat(centrais);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(ordenadas.length, 8);
  eocd.writeUInt16LE(ordenadas.length, 10);
  eocd.writeUInt32LE(corpoCentral.length, 12);
  eocd.writeUInt32LE(corpoLocal.length, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([corpoLocal, corpoCentral, eocd]);
}

export function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export interface ArquivoNoManifesto {
  readonly nome: string;
  readonly registros: number;
  readonly bytes: number;
  readonly sha256: string;
}

export interface Manifesto {
  readonly layout: string;
  readonly periodicidade: string;
  readonly competencia: string;
  readonly codUnidadeGestora: string;
  readonly arquivos: readonly ArquivoNoManifesto[];
  /** SHA-256 sobre a lista ordenada "nome:sha256" — a impressão digital do pacote inteiro. */
  readonly hashPacote: string;
  /** DIRETIVA §7: o manifesto prova integridade LOCAL, nunca aceitação externa. */
  readonly natureza: "FORMATO_OFICIAL_GERADO_E_VALIDADO_LOCALMENTE";
}

export interface MetaPacote {
  readonly layout: string;
  readonly periodicidade: string;
  readonly competencia: string;
  readonly codUnidadeGestora: string;
}

export function montarManifesto(meta: MetaPacote, arquivos: readonly ArquivoGerado[]): Manifesto {
  const lista: ArquivoNoManifesto[] = arquivos
    .map((a) => ({ nome: a.nome, registros: a.registros, bytes: a.conteudo.length, sha256: sha256(a.conteudo) }))
    .sort((a, b) => (a.nome < b.nome ? -1 : 1));
  const hashPacote = sha256(Buffer.from(lista.map((a) => `${a.nome}:${a.sha256}`).join("\n"), "utf8"));
  return {
    layout: meta.layout,
    periodicidade: meta.periodicidade,
    competencia: meta.competencia,
    codUnidadeGestora: meta.codUnidadeGestora,
    arquivos: lista,
    hashPacote,
    natureza: "FORMATO_OFICIAL_GERADO_E_VALIDADO_LOCALMENTE",
  };
}

export interface PacoteGerado {
  readonly nome: string;
  readonly zip: Buffer;
  readonly manifesto: Manifesto;
}

/** Monta o pacote: manifesto (JSON determinístico) + ZIP com os .txt e o manifesto.json dentro. */
export function montarPacote(meta: MetaPacote, arquivos: readonly ArquivoGerado[]): PacoteGerado {
  const manifesto = montarManifesto(meta, arquivos);
  const manifestoBuf = Buffer.from(JSON.stringify(manifesto, null, 2), "utf8");
  const entradas: EntradaZip[] = [
    ...arquivos.map((a) => ({ nome: a.nome, conteudo: a.conteudo })),
    { nome: "manifesto.json", conteudo: manifestoBuf },
  ];
  const sufixo = meta.periodicidade === "MENSAL" ? "mensal" : meta.periodicidade === "ANUAL" ? "anual" : "diario";
  return {
    nome: `sagres_${meta.codUnidadeGestora}_${meta.competencia}_${sufixo}.zip`,
    zip: ziparDeterministico(entradas),
    manifesto,
  };
}
