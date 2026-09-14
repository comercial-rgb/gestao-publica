import { createHash } from "node:crypto";
import { z } from "zod";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { Decimal, exigirElegivel, toMoney, type Money } from "../../packages/contracts/index.js";
import { elegibilidadeParaCancelarDocumento, elegibilidadeParaConferirDocumento } from "./elegibilidade.js";
import { somaLiquidaEstornaveis } from "../../packages/estornaveis/index.js";
import { normalizarDocumento } from "../../packages/documento/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { gravarArquivo, sha256 } from "../m22-documentos/armazenamento.js";
import { extrairNfe } from "./xml-nfe.js";

/**
 * M11 — DOCUMENTO FISCAL RECEBIDO (V5 Fila A).
 *
 * Invariantes:
 * - uma nota pode lastrear recebimentos/atestes ou liquidações parciais;
 * - contrato, ordem e empenho são papéis distintos (FKs opcionais, conferidas);
 * - registrar a nota NÃO produz estoque, liquidação nem pagamento;
 * - parcela já usada (valor liquidado ou quantidade recebida apontando para a nota)
 *   não se usa de novo;
 * - cancelamento e substituição são FATOS novos; o original permanece;
 * - emitente incompatível com a ordem/contrato/empenho é recusado.
 *
 * Quantidade: 4 casas. Preço unitário: 6. Totais: 2. Diferença entre
 * qtd × unitário − desconto + acréscimo e o total da linha maior que 0,01 é recusada.
 */

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

const zQuantidade = z
  .union([z.string(), z.number()])
  .transform((v) => toMoney(v))
  .refine((v) => v.greaterThan(0), { message: "quantidade tem de ser > 0" });

const zDinheiro = z.union([z.string(), z.number()]).transform((v) => toMoney(v));
const zMotivo = z.string().trim().min(5);
const MODELOS = ["NFE", "NFCE", "NF_AVULSA", "CTE", "RPS", "RECIBO", "OUTRO"] as const;

function ehColisaoUnica(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002";
}

function totalDaLinha(qtd: Money, unit: Money, desconto: Money, acrescimo: Money): Money {
  return toMoney(qtd.times(unit).toDecimalPlaces(2).minus(desconto).plus(acrescimo).toFixed(2));
}

export interface ItemDoDocumentoFiscalInput {
  readonly materialId?: string;
  readonly itemDeOrdemId?: string;
  readonly codigo?: string;
  readonly descricao: string;
  readonly unidade: string;
  readonly quantidade: string;
  readonly valorUnitario: string;
  readonly desconto?: string;
  readonly acrescimo?: string;
  readonly valorTotal: string;
}

const zItem = z.object({
  materialId: z.string().min(1).optional(),
  itemDeOrdemId: z.string().min(1).optional(),
  codigo: z.string().optional(),
  descricao: z.string().trim().min(1),
  unidade: z.string().trim().min(1),
  quantidade: zQuantidade,
  valorUnitario: zDinheiro.refine((v) => v.greaterThan(0), { message: "preço unitário tem de ser > 0" }),
  desconto: zDinheiro.optional(),
  acrescimo: zDinheiro.optional(),
  valorTotal: zDinheiro.refine((v) => v.greaterThanOrEqualTo(0), { message: "total do item não pode ser negativo" }),
});

export const zRegistrarDocumentoFiscalInput = z.object({
  emitenteId: z.string().min(1),
  modelo: z.enum(MODELOS),
  serie: z.string().trim().min(1).max(12),
  numero: z.string().trim().min(1).max(20),
  dataEmissao: z.coerce.date(),
  dataRecebimento: z.coerce.date(),
  chaveAcesso: z.string().trim().optional(),
  protocoloExterno: z.string().trim().optional(),
  ordemId: z.string().min(1).optional(),
  contratoId: z.string().min(1).optional(),
  empenhoId: z.string().min(1).optional(),
  processoId: z.string().min(1).optional(),
  valorBruto: zDinheiro,
  valorDescontos: zDinheiro.optional(),
  valorAcrescimos: zDinheiro.optional(),
  valorTributos: zDinheiro.optional(),
  valorTotal: zDinheiro,
  origem: z.enum(["DIGITACAO", "XML"]).default("DIGITACAO"),
  arquivoHash: z.string().length(64).optional(),
  arquivoNome: z.string().optional(),
  validacaoEstrutural: z.string().optional(),
  substituiId: z.string().min(1).optional(),
  itens: z.array(zItem).min(1),
  criadoPor: z.string().min(1),
});
export type RegistrarDocumentoFiscalInput = z.input<typeof zRegistrarDocumentoFiscalInput>;

async function escopoDoDocumento(
  tx: Tx,
  d: { ordemId?: string | undefined; empenhoId?: string | undefined }
): Promise<"ENTE" | { readonly ug: string | undefined } | { readonly empenho: string }> {
  if (d.empenhoId !== undefined) return { empenho: d.empenhoId };
  if (d.ordemId !== undefined) {
    const o = await tx.ordemDeCompra.findUnique({
      where: { id: d.ordemId },
      select: { ficha: { select: { unidadeOrcId: true } } },
    });
    if (o?.ficha !== null && o?.ficha !== undefined) return { ug: o.ficha.unidadeOrcId };
  }
  return "ENTE";
}

async function conferirVinculos(
  tx: Tx,
  d: {
    emitenteId: string;
    ordemId?: string | undefined;
    contratoId?: string | undefined;
    empenhoId?: string | undefined;
    processoId?: string | undefined;
  }
): Promise<{ readonly documentoEmitente: string }> {
  const emitente = await tx.pessoa.findUnique({
    where: { id: d.emitenteId },
    select: { id: true, documento: true },
  });
  if (emitente === null) throw new Error(`Emitente ${d.emitenteId} não existe. Nada foi gravado.`);

  if (d.ordemId !== undefined) {
    const ordem = await tx.ordemDeCompra.findUnique({
      where: { id: d.ordemId },
      select: { id: true, numero: true, fornecedorId: true, processoId: true, movimentos: { where: { tipo: "ESTORNO" }, select: { id: true } } },
    });
    if (ordem === null) throw new Error(`Ordem de compra ${d.ordemId} não existe. Nada foi gravado.`);
    if (ordem.movimentos.length > 0) {
      throw new Error(`A ordem ${ordem.numero} está ESTORNADA: um documento fiscal não se liga a uma compra desfeita. Nada foi gravado.`);
    }
    if (ordem.fornecedorId !== d.emitenteId) {
      throw new Error(
        `O emitente do documento não é o fornecedor da ordem ${ordem.numero}. ` +
          `Documento de outro fornecedor é recusado.`
      );
    }
    if (d.processoId !== undefined && ordem.processoId !== null && ordem.processoId !== d.processoId) {
      throw new Error(
        `A ordem ${ordem.numero} pertence a outro processo licitatório. Nada foi gravado.`
      );
    }
  }

  if (d.contratoId !== undefined) {
    const contrato = await tx.contrato.findUnique({
      where: { id: d.contratoId },
      select: { id: true, numeroContrato: true, contratadoDocumento: true, processoId: true },
    });
    if (contrato === null) throw new Error(`Contrato ${d.contratoId} não existe. Nada foi gravado.`);
    if (contrato.contratadoDocumento !== emitente.documento) {
      throw new Error(
        `O emitente (${emitente.documento}) não é o contratado do contrato ${contrato.numeroContrato}.`
      );
    }
    if (d.processoId !== undefined && contrato.processoId !== d.processoId) {
      throw new Error(`O contrato ${contrato.numeroContrato} pertence a outro processo. Nada foi gravado.`);
    }
  }

  if (d.empenhoId !== undefined) {
    const empenho = await tx.empenho.findUnique({
      where: { id: d.empenhoId },
      select: { id: true, numero: true, credorCpfCnpj: true, estornoDeId: true, estornos: { select: { id: true } } },
    });
    if (empenho === null) throw new Error(`Empenho ${d.empenhoId} não existe. Nada foi gravado.`);
    if (empenho.estornoDeId !== null || empenho.estornos.length > 0) {
      throw new Error(`Empenho ${empenho.numero} está anulado — não lastreia documento fiscal.`);
    }
    if (empenho.credorCpfCnpj !== emitente.documento) {
      throw new Error(
        `O credor do empenho ${empenho.numero} (${empenho.credorCpfCnpj}) não é o emitente ` +
          `(${emitente.documento}).`
      );
    }
  }

  return { documentoEmitente: emitente.documento };
}

function conferirTotaisDosItens(
  itens: readonly {
    quantidade: Money;
    valorUnitario: Money;
    desconto?: Money | undefined;
    acrescimo?: Money | undefined;
    valorTotal: Money;
    descricao: string;
  }[],
  valorBruto: Money,
  valorDescontos: Money,
  valorAcrescimos: Money,
  valorTotal: Money
): void {
  let somaItens = new Decimal(0);
  for (const i of itens) {
    const desc = i.desconto ?? toMoney("0");
    const acre = i.acrescimo ?? toMoney("0");
    const esperado = totalDaLinha(i.quantidade, i.valorUnitario, desc, acre);
    const diff = esperado.minus(i.valorTotal).abs();
    if (diff.greaterThan(toMoney("0.01"))) {
      throw new Error(
        `Diferença de ${diff.toFixed(2)} no item "${i.descricao}": ` +
          `${i.quantidade.toFixed(4)} × ${i.valorUnitario.toFixed(6)} − ${desc.toFixed(2)} + ${acre.toFixed(2)} ` +
          `= ${esperado.toFixed(2)}, informado ${i.valorTotal.toFixed(2)}. Nada foi gravado.`
      );
    }
    somaItens = somaItens.plus(i.valorTotal);
  }
  const esperadoDoc = toMoney(valorBruto.minus(valorDescontos).plus(valorAcrescimos).toFixed(2));
  const diffDoc = esperadoDoc.minus(valorTotal).abs();
  if (diffDoc.greaterThan(toMoney("0.01"))) {
    throw new Error(
      `Diferença de ${diffDoc.toFixed(2)} no documento: bruto ${valorBruto.toFixed(2)} ` +
        `− descontos ${valorDescontos.toFixed(2)} + acréscimos ${valorAcrescimos.toFixed(2)} ` +
        `= ${esperadoDoc.toFixed(2)}, informado ${valorTotal.toFixed(2)}. Nada foi gravado.`
    );
  }
  const diffSoma = toMoney(somaItens.toFixed(2)).minus(valorBruto).abs();
  if (diffSoma.greaterThan(toMoney("0.05"))) {
    throw new Error(
      `A soma dos itens (${somaItens.toFixed(2)}) não fecha com o bruto ${valorBruto.toFixed(2)}. Nada foi gravado.`
    );
  }
}

async function gravarDocumento(
  tx: Tx,
  d: z.output<typeof zRegistrarDocumentoFiscalInput>
): Promise<{ readonly documentoId: string }> {
  if (d.chaveAcesso !== undefined && d.chaveAcesso !== "") {
    const chave = d.chaveAcesso.replace(/\D/g, "");
    if (chave.length !== 44) {
      throw new Error("Chave de acesso, quando informada, tem 44 dígitos. Nada foi gravado.");
    }
  }
  await conferirVinculos(tx, d);
  const descontos = d.valorDescontos ?? toMoney("0");
  const acrescimos = d.valorAcrescimos ?? toMoney("0");
  conferirTotaisDosItens(d.itens, d.valorBruto, descontos, acrescimos, d.valorTotal);

  if (d.substituiId !== undefined) {
    const orig = await tx.documentoFiscalRecebido.findUnique({
      where: { id: d.substituiId },
      select: {
        id: true, emitenteId: true, numero: true, serie: true,
        movimentos: { select: { tipo: true } },
      },
    });
    if (orig === null) throw new Error(`Documento ${d.substituiId} a substituir não existe.`);
    if (orig.emitenteId !== d.emitenteId) {
      throw new Error("A substituição tem de ser do mesmo emitente. Nada foi gravado.");
    }
    if (orig.movimentos.some((m) => m.tipo === "CANCELAMENTO" || m.tipo === "SUBSTITUICAO")) {
      throw new Error(
        `O documento ${orig.numero}/${orig.serie} já foi cancelado ou substituído. Nada foi gravado.`
      );
    }
    await tx.movimentoDoDocumentoFiscal.create({
      data: {
        documentoId: orig.id,
        tipo: "SUBSTITUICAO",
        data: d.dataRecebimento,
        motivo: `Substituído pelo documento ${d.numero}/${d.serie}`,
        criadoPor: d.criadoPor,
      },
    });
  }

  const chave = d.chaveAcesso !== undefined && d.chaveAcesso !== "" ? d.chaveAcesso.replace(/\D/g, "") : null;
  try {
    const doc = await tx.documentoFiscalRecebido.create({
      data: {
        emitenteId: d.emitenteId,
        modelo: d.modelo,
        serie: d.serie,
        numero: d.numero,
        dataEmissao: d.dataEmissao,
        dataRecebimento: d.dataRecebimento,
        chaveAcesso: chave,
        protocoloExterno: d.protocoloExterno ?? null,
        ordemId: d.ordemId ?? null,
        contratoId: d.contratoId ?? null,
        empenhoId: d.empenhoId ?? null,
        processoId: d.processoId ?? null,
        valorBruto: d.valorBruto.toFixed(2),
        valorDescontos: descontos.toFixed(2),
        valorAcrescimos: acrescimos.toFixed(2),
        valorTributos: (d.valorTributos ?? toMoney("0")).toFixed(2),
        valorTotal: d.valorTotal.toFixed(2),
        origem: d.origem,
        arquivoHash: d.arquivoHash ?? null,
        arquivoNome: d.arquivoNome ?? null,
        validacaoEstrutural: d.validacaoEstrutural ?? null,
        substituiId: d.substituiId ?? null,
        criadoPor: d.criadoPor,
        itens: {
          create: d.itens.map((i) => ({
            materialId: i.materialId ?? null,
            itemDeOrdemId: i.itemDeOrdemId ?? null,
            codigo: i.codigo ?? null,
            descricao: i.descricao,
            unidade: i.unidade,
            quantidade: i.quantidade.toFixed(4),
            valorUnitario: i.valorUnitario.toFixed(6),
            desconto: (i.desconto ?? toMoney("0")).toFixed(2),
            acrescimo: (i.acrescimo ?? toMoney("0")).toFixed(2),
            valorTotal: i.valorTotal.toFixed(2),
            criadoPor: d.criadoPor,
          })),
        },
      },
      select: { id: true },
    });
    return { documentoId: doc.id };
  } catch (e) {
    if (ehColisaoUnica(e)) {
      throw new Error(
        `Já existe o documento ${d.modelo} ${d.numero}/${d.serie} deste emitente ` +
          `(ou a mesma chave/arquivo). Reimportar o mesmo documento é recusado.`
      );
    }
    throw e;
  }
}

/** Registro manual. Não afirma autorização fiscal. */
export async function registrarDocumentoFiscal(
  prisma: PrismaClient,
  input: RegistrarDocumentoFiscalInput
): Promise<{ readonly documentoId: string }> {
  const d = zRegistrarDocumentoFiscalInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarDocumentoFiscal, await escopoDoDocumento(tx, d));
    return gravarDocumento(tx, d);
  });
}

export const zImportarDocumentoFiscalDeXmlInput = z.object({
  xml: z.string().min(1),
  nomeArquivo: z.string().min(1),
  dataRecebimento: z.coerce.date(),
  ordemId: z.string().min(1).optional(),
  contratoId: z.string().min(1).optional(),
  empenhoId: z.string().min(1).optional(),
  processoId: z.string().min(1).optional(),
  criadoPor: z.string().min(1),
});
export type ImportarDocumentoFiscalDeXmlInput = z.input<typeof zImportarDocumentoFiscalDeXmlInput>;

/** Importação de XML NF-e/NFC-e. Validação estrutural local — não é autorização da SEFAZ. */
export async function importarDocumentoFiscalDeXml(
  prisma: PrismaClient,
  input: ImportarDocumentoFiscalDeXmlInput
): Promise<{ readonly documentoId: string }> {
  const d = zImportarDocumentoFiscalDeXmlInput.parse(input);
  const extraida = extrairNfe(d.xml);
  const hash = createHash("sha256").update(d.xml).digest("hex");
  const emitenteDoc = normalizarDocumento(extraida.emitenteCnpj);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(
      tx,
      d.criadoPor,
      ACAO_DO_SERVICO.importarDocumentoFiscalDeXml,
      await escopoDoDocumento(tx, d)
    );
    const emitente = await tx.pessoa.findUnique({
      where: { documento: emitenteDoc },
      select: { id: true },
    });
    if (emitente === null) {
      throw new Error(
        `Não há pessoa cadastrada com o documento ${emitenteDoc} do emitente do XML. ` +
          `Cadastre o fornecedor antes de importar. Nada foi gravado.`
      );
    }
    const dataEmissao = new Date(extraida.dataEmissaoIso);
    if (Number.isNaN(dataEmissao.getTime())) {
      throw new Error(`Data de emissão do XML inválida: ${extraida.dataEmissaoIso}. Nada foi gravado.`);
    }
    const doc = await gravarDocumento(tx, {
      emitenteId: emitente.id,
      modelo: extraida.modelo,
      serie: extraida.serie,
      numero: extraida.numero,
      dataEmissao,
      dataRecebimento: d.dataRecebimento,
      ...(extraida.chaveAcesso !== null ? { chaveAcesso: extraida.chaveAcesso } : {}),
      ...(d.ordemId !== undefined ? { ordemId: d.ordemId } : {}),
      ...(d.contratoId !== undefined ? { contratoId: d.contratoId } : {}),
      ...(d.empenhoId !== undefined ? { empenhoId: d.empenhoId } : {}),
      ...(d.processoId !== undefined ? { processoId: d.processoId } : {}),
      valorBruto: toMoney(extraida.valorProdutos),
      valorDescontos: toMoney(extraida.valorDescontos),
      valorTotal: toMoney(extraida.valorTotal),
      origem: "XML",
      arquivoHash: hash,
      arquivoNome: d.nomeArquivo,
      validacaoEstrutural: "estrutura NF-e/NFC-e aceita localmente; não é autorização fiscal",
      itens: extraida.itens.map((i) => ({
        codigo: i.codigo,
        descricao: i.descricao,
        unidade: i.unidade,
        quantidade: toMoney(i.quantidade),
        valorUnitario: toMoney(i.valorUnitario),
        desconto: toMoney(i.desconto),
        valorTotal: toMoney(i.valorTotal),
      })),
      criadoPor: d.criadoPor,
    });
    // O XML original fica no cofre de anexos NA MESMA TRANSAÇÃO: linha primeiro,
    // arquivo depois. Se o disco falhar, o documento não fica sem o original nem
    // o original fica órfão. Não afirma autorização da SEFAZ.
    const conteudo = new TextEncoder().encode(d.xml);
    const anexo = await tx.anexo.create({
      data: {
        nomeOriginal: d.nomeArquivo,
        mimeType: "application/xml",
        tamanhoBytes: conteudo.byteLength,
        sha256: sha256(conteudo),
        origem: "SISTEMA",
        documentoFiscalId: doc.documentoId,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    await gravarArquivo(anexo.id, conteudo);
    return doc;
  });
}

export async function situacaoDoDocumentoFiscal(
  tx: Tx,
  documentoId: string
): Promise<"REGISTRADO" | "CONFERIDO" | "CANCELADO" | "SUBSTITUIDO"> {
  const movs = await tx.movimentoDoDocumentoFiscal.findMany({
    where: { documentoId },
    select: { tipo: true, data: true, criadoEm: true },
    orderBy: [{ data: "asc" }, { criadoEm: "asc" }],
  });
  if (movs.some((m) => m.tipo === "CANCELAMENTO")) return "CANCELADO";
  if (movs.some((m) => m.tipo === "SUBSTITUICAO")) return "SUBSTITUIDO";
  if (movs.some((m) => m.tipo === "CONFERENCIA")) return "CONFERIDO";
  return "REGISTRADO";
}

export async function saldoDoDocumentoFiscal(
  tx: Tx,
  documentoId: string
): Promise<{ readonly total: Money; readonly liquidado: Money; readonly aLiquidar: Money }> {
  const doc = await tx.documentoFiscalRecebido.findUnique({
    where: { id: documentoId },
    select: {
      valorTotal: true,
      liquidacoes: {
        select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true },
      },
    },
  });
  if (doc === null) throw new Error(`Documento fiscal ${documentoId} não existe.`);
  const liquidado = somaLiquidaEstornaveis(
    doc.liquidacoes.map((l) => ({
      id: l.id,
      valor: toMoney(l.valor.toFixed(2)),
      estornoDeId: l.estornoDeId,
      anulacaoParcialDeId: l.anulacaoParcialDeId,
    }))
  );
  const total = toMoney(doc.valorTotal.toFixed(2));
  return { total, liquidado, aLiquidar: toMoney(total.minus(liquidado).toFixed(2)) };
}

export const zConferirDocumentoFiscalInput = z.object({
  documentoId: z.string().min(1),
  data: z.coerce.date(),
  motivo: zMotivo,
  criadoPor: z.string().min(1),
});
export type ConferirDocumentoFiscalInput = z.input<typeof zConferirDocumentoFiscalInput>;

export async function conferirDocumentoFiscal(
  prisma: PrismaClient,
  input: ConferirDocumentoFiscalInput
): Promise<{ readonly documentoId: string }> {
  const d = zConferirDocumentoFiscalInput.parse(input);
  return prisma.$transaction(async (tx) => {
    const doc = await tx.documentoFiscalRecebido.findUnique({
      where: { id: d.documentoId },
      select: {
        id: true, numero: true, serie: true, emitenteId: true, ordemId: true, contratoId: true, empenhoId: true,
        valorTotal: true,
        ordem: { select: { ficha: { select: { unidadeOrcId: true } }, fornecedorId: true, numero: true } },
        itens: { select: { itemDeOrdemId: true, quantidade: true, valorTotal: true } },
        movimentos: { select: { tipo: true } },
      },
    });
    if (doc === null) throw new Error(`Documento fiscal ${d.documentoId} não existe.`);
    await autorizarNo(
      tx,
      d.criadoPor,
      ACAO_DO_SERVICO.conferirDocumentoFiscal,
      doc.ordem?.ficha !== null && doc.ordem?.ficha !== undefined
        ? { ug: doc.ordem.ficha.unidadeOrcId }
        : await escopoDoDocumento(tx, { ...(doc.empenhoId !== null ? { empenhoId: doc.empenhoId } : {}), ...(doc.ordemId !== null ? { ordemId: doc.ordemId } : {}) })
    );
    // V6.2 U0 — o MESMO predicado que a barra de ações projeta (`elegibilidade.ts`).
    exigirElegivel(elegibilidadeParaConferirDocumento({
      rotulo: `${doc.numero}/${doc.serie}`,
      movimentos: doc.movimentos.map((m) => m.tipo),
      emitenteConfereComOrdem: doc.ordem === null || doc.ordem.fornecedorId === doc.emitenteId,
      ordemNumero: doc.ordem?.numero ?? null,
      recebimentos: 0,
      liquidacoesVivas: 0,
    }));
    await tx.movimentoDoDocumentoFiscal.create({
      data: {
        documentoId: doc.id, tipo: "CONFERENCIA", data: d.data, motivo: d.motivo, criadoPor: d.criadoPor,
      },
    });
    return { documentoId: doc.id };
  });
}

export const zCancelarDocumentoFiscalInput = z.object({
  documentoId: z.string().min(1),
  data: z.coerce.date(),
  motivo: zMotivo,
  criadoPor: z.string().min(1),
});
export type CancelarDocumentoFiscalInput = z.input<typeof zCancelarDocumentoFiscalInput>;

export async function cancelarDocumentoFiscal(
  prisma: PrismaClient,
  input: CancelarDocumentoFiscalInput
): Promise<{ readonly documentoId: string }> {
  const d = zCancelarDocumentoFiscalInput.parse(input);
  return prisma.$transaction(async (tx) => {
    const doc = await tx.documentoFiscalRecebido.findUnique({
      where: { id: d.documentoId },
      select: {
        id: true, numero: true, serie: true, ordemId: true, empenhoId: true,
        ordem: { select: { ficha: { select: { unidadeOrcId: true } } } },
        movimentos: { select: { tipo: true } },
        recebimentos: { select: { id: true } },
        liquidacoes: { select: { id: true, estornoDeId: true, estornos: { select: { id: true } } } },
      },
    });
    if (doc === null) throw new Error(`Documento fiscal ${d.documentoId} não existe.`);
    await autorizarNo(
      tx,
      d.criadoPor,
      ACAO_DO_SERVICO.cancelarDocumentoFiscal,
      doc.ordem?.ficha !== null && doc.ordem?.ficha !== undefined
        ? { ug: doc.ordem.ficha.unidadeOrcId }
        : await escopoDoDocumento(tx, { ...(doc.empenhoId !== null ? { empenhoId: doc.empenhoId } : {}), ...(doc.ordemId !== null ? { ordemId: doc.ordemId } : {}) })
    );
    exigirElegivel(elegibilidadeParaCancelarDocumento({
      rotulo: `${doc.numero}/${doc.serie}`,
      movimentos: doc.movimentos.map((m) => m.tipo),
      emitenteConfereComOrdem: true,
      ordemNumero: null,
      recebimentos: doc.recebimentos.length,
      liquidacoesVivas: doc.liquidacoes.filter((l) => l.estornoDeId === null && l.estornos.length === 0).length,
    }));
    await tx.movimentoDoDocumentoFiscal.create({
      data: {
        documentoId: doc.id, tipo: "CANCELAMENTO", data: d.data, motivo: d.motivo, criadoPor: d.criadoPor,
      },
    });
    return { documentoId: doc.id };
  });
}
