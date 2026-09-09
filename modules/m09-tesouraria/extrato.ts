import { createHash } from "node:crypto";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { parseOfx, type ExtratoOfx, type TransacaoOfx } from "../../packages/ofx/index.js";
import {
  ConflitoDeFitidError,
  hashDaLinha,
  hashDoArquivo,
  periodoDoExtrato,
  zImportarExtratoInput,
  type ConflitoDeLinha,
  type ImportarExtratoInput,
  type ResultadoImport,
} from "./dominio.js";

/**
 * IMPORT DE EXTRATO (M09, bloco 1) — OFX (arquivo) e API do Banco do Brasil (M17-a).
 *
 * ═══ TRÊS CAMINHOS, E SÓ UM É ERRO ═══
 *  1. JÁ IMPORTADO (mesmo hash de origem) → NO-OP idempotente.
 *  2. LINHA JÁ EXISTE, mesmo conteúdo → PULA (períodos sobrepostos repetem transações).
 *  3. LINHA JÁ EXISTE, conteúdo DIFERENTE → ABORTA TUDO (o banco reemitiu o FITID; decisão humana).
 *
 * ═══ UM NÚCLEO, DUAS ORIGENS (M17-a) ═══
 * O que a conciliação ingere é `TransacaoOfx[]` — venha de um arquivo OFX (`parseOfx`) ou da API do
 * BB (o adapter M17, que normaliza para o MESMO tipo). O núcleo `ingerir` é um só; cada porta de
 * entrada (`importarExtrato`, `importarExtratoBb`) AUTORIZA a sua ação e chama o núcleo. A `origem`
 * fica gravada no `ExtratoBancario` — a conciliação é idêntica, a procedência aparece na trilha.
 *
 * ⚠️ CROSS-ORIGEM NÃO DEDUPLICA (Passo 0.c): o FITID do OFX (do banco) ≠ o fitid sintetizado da API
 * para a mesma transação — importar OFX E API do mesmo período duplicaria. A dedup por-origem
 * funciona (o hash de origem e o (conta,fitid) são estáveis dentro de uma origem). O mapeamento
 * cross-origem é decisão do Winner — ver `modules/m17-banco-bb/normalizar.ts`.
 */

type Origem = "OFX" | "API_BB";

interface NucleoInput {
  readonly contaBancariaId: string;
  readonly transacoes: readonly TransacaoOfx[];
  readonly periodoInicio: Date;
  readonly periodoFim: Date;
  /** sha256 da ORIGEM (arquivo OFX inteiro, ou as linhas canônicas da resposta da API). */
  readonly hashOrigem: string;
  readonly origem: Origem;
  readonly importadoPor: string;
}

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/** O NÚCLEO — dedup + gravação. NÃO autoriza (quem chama já autorizou a sua ação). Privado. */
async function ingerir(tx: Tx, input: NucleoInput): Promise<ResultadoImport> {
  const conta = await tx.contaBancaria.findUnique({ where: { id: input.contaBancariaId }, select: { id: true } });
  if (conta === null) throw new Error(`Conta bancária ${input.contaBancariaId} não cadastrada.`);

  // (1) IDEMPOTÊNCIA DA ORIGEM.
  const jaImportado = await tx.extratoBancario.findUnique({ where: { arquivoHash: input.hashOrigem }, select: { id: true } });
  if (jaImportado !== null) {
    return { extratoId: jaImportado.id, jaImportado: true, inseridas: 0, puladas: 0, conflitos: [] };
  }

  const fitids = input.transacoes.map((t) => t.fitid);
  const existentes = await tx.lancamentoExtrato.findMany({
    where: { contaBancariaId: conta.id, fitid: { in: fitids } },
    select: { fitid: true, linhaHash: true },
  });
  const hashPorFitid = new Map(existentes.map((l) => [l.fitid, l.linhaHash]));

  const conflitos: ConflitoDeLinha[] = [];
  const novas: { transacao: TransacaoOfx; hash: string }[] = [];
  let puladas = 0;

  for (const t of input.transacoes) {
    const hash = hashDaLinha(t);
    const noBanco = hashPorFitid.get(t.fitid);
    if (noBanco === undefined) novas.push({ transacao: t, hash });
    else if (noBanco === hash) puladas += 1;
    else conflitos.push({ fitid: t.fitid, hashNoBanco: noBanco, hashNoArquivo: hash, memoNoArquivo: t.memo });
  }
  if (conflitos.length > 0) throw new ConflitoDeFitidError(conflitos);

  const extrato = await tx.extratoBancario.create({
    data: {
      contaBancariaId: conta.id,
      arquivoHash: input.hashOrigem,
      periodoInicio: input.periodoInicio,
      periodoFim: input.periodoFim,
      origem: input.origem,
      importadoPor: input.importadoPor,
    },
    select: { id: true },
  });

  for (const { transacao, hash } of novas) {
    await tx.lancamentoExtrato.create({
      data: {
        extratoId: extrato.id,
        contaBancariaId: conta.id,
        fitid: transacao.fitid,
        dataPostagem: transacao.dataPostagem,
        valor: transacao.valor.toFixed(2),
        natureza: transacao.natureza,
        documento: transacao.documento ?? null,
        memo: transacao.memo,
        linhaHash: hash,
      },
    });
  }

  return { extratoId: extrato.id, jaImportado: false, inseridas: novas.length, puladas, conflitos: [] };
}

/** IMPORT VIA ARQUIVO OFX. Autoriza IMPORTAR_EXTRATO e chama o núcleo. */
export async function importarExtrato(prisma: PrismaClient, input: ImportarExtratoInput): Promise<ResultadoImport> {
  const dados = zImportarExtratoInput.parse(input);
  const ofx = parseOfx(dados.arquivoOfx); // PURO e fail-closed: arquivo podre nem chega ao banco.
  const periodo = periodoDoExtrato(ofx);
  const hashOrigem = hashDoArquivo(dados.arquivoOfx);

  return prisma.$transaction(async (tx) => {
    // ⚠️ SEM UG: o extrato é do BANCO, e o banco é do ente. `importadoPor` é a identidade (quem assina).
    await autorizarNo(tx, dados.importadoPor, ACAO_DO_SERVICO.importarExtrato, "ENTE");
    return ingerir(tx, {
      contaBancariaId: dados.contaBancariaId,
      transacoes: ofx.transacoes,
      periodoInicio: periodo.inicio,
      periodoFim: periodo.fim,
      hashOrigem,
      origem: "OFX",
      importadoPor: dados.importadoPor,
    });
  });
}

export interface ImportarExtratoBbInput {
  readonly contaBancariaId: string;
  /** O extrato JÁ normalizado pela API (o adapter M17 produz `ExtratoOfx`). */
  readonly extrato: ExtratoOfx;
  readonly importadoPor: string;
}

/** IMPORT VIA API DO BB. Autoriza IMPORTAR_EXTRATO e chama o mesmo núcleo — a origem é API_BB. */
export async function importarExtratoBb(prisma: PrismaClient, input: ImportarExtratoBbInput): Promise<ResultadoImport> {
  const { extrato } = input;
  // Hash da ORIGEM = sha256 das linhas canônicas ordenadas — determinístico por período, então
  // reimportar o mesmo período por API é no-op (idempotência de origem, como o hash do arquivo OFX).
  const hashOrigem = createHash("sha256").update([...extrato.transacoes.map((t) => t.linhaCanonica)].sort().join("\n")).digest("hex");
  const periodoInicio = extrato.periodoInicio ?? extrato.transacoes[0]?.dataPostagem ?? new Date(0);
  const periodoFim = extrato.periodoFim ?? extrato.transacoes[extrato.transacoes.length - 1]?.dataPostagem ?? periodoInicio;

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, input.importadoPor, ACAO_DO_SERVICO.importarExtratoBb, "ENTE");
    return ingerir(tx, {
      contaBancariaId: input.contaBancariaId,
      transacoes: extrato.transacoes,
      periodoInicio,
      periodoFim,
      hashOrigem,
      origem: "API_BB",
      importadoPor: input.importadoPor,
    });
  });
}
