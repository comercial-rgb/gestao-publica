import { diaCivilBr, meioDiaCivil } from "../../../packages/datas/index.js";
import { toMoney } from "../../../packages/contracts/index.js";
import { formatarDocumento } from "../../../packages/documento/index.js";
import type { Prisma } from "../../../prisma/generated/client/client.js";
import {
  cancelarDocumentoFiscal,
  conferirDocumentoFiscal,
  importarDocumentoFiscalDeXml,
  registrarDocumentoFiscal,
  saldoDoDocumentoFiscal,
  situacaoDoDocumentoFiscal,
} from "../../../modules/m11-licitacoes/documento-fiscal.js";
import type { ConsultaDoMolde } from "../../molde/consulta.js";
import { TAMANHO_DE_PAGINA } from "../../molde/consulta.js";
import type { DisponibilidadeDoRegistro, LinhaDoHistorico } from "../../molde/tipos.js";
import { elegibilidadeParaCancelarDocumento, elegibilidadeParaConferirDocumento, type EstadoDoDocumentoParaAtos } from "../../../modules/m11-licitacoes/elegibilidade.js";
import { apresentar, RegistroMudouError, versaoDoEstado } from "../disponibilidade";
import { comEscritaAutenticada } from "../sessao";
import { cliente, PortaSemBancoError } from "../cliente";
import type { DetalheLido, OpcoesDoCadastro, PaginaDoMolde } from "./dados";

/**
 * OS DADOS DO DOCUMENTO FISCAL RECEBIDO — M11, V5 Fila A.
 *
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI. Duplicidade, emitente incompatível, diferença de
 * linha, conferência repetida, cancelamento com uso — tudo é do domínio, e a recusa
 * sobe COMO VEIO. Situação e saldo a liquidar vêm de `situacaoDoDocumentoFiscal` e
 * `saldoDoDocumentoFiscal`.
 */

export { PortaSemBancoError };

type Campos = Readonly<Record<string, string>>;
const t = (c: Campos, k: string): string => (c[k] ?? "").trim();
const dia = (c: Campos, k: string): Date => meioDiaCivil(t(c, k));

function paginacao(c: ConsultaDoMolde): { readonly skip: number; readonly take: number } {
  return { skip: (c.pagina - 1) * TAMANHO_DE_PAGINA, take: TAMANHO_DE_PAGINA };
}

function nomeDaPessoa(p: {
  readonly documento: string;
  readonly versoes: readonly { readonly nome: string }[];
}): string {
  return `${p.versoes[0]?.nome ?? p.documento} (${formatarDocumento(p.documento)})`;
}

const ROTULO_DO_MODELO: Readonly<Record<string, string>> = {
  NFE: "NF-e",
  NFCE: "NFC-e",
  NF_AVULSA: "Nota avulsa",
  CTE: "CT-e",
  RPS: "RPS",
  RECIBO: "Recibo",
  OUTRO: "Outro",
};

const ROTULO_DA_SITUACAO: Readonly<Record<string, string>> = {
  REGISTRADO: "Registrado",
  CONFERIDO: "Conferido",
  CANCELADO: "Cancelado",
  SUBSTITUIDO: "Substituído",
};

export interface OpcaoDaIlha {
  readonly id: string;
  readonly rotulo: string;
}

export async function opcoesDoDocumentoFiscal(): Promise<OpcoesDoCadastro> {
  const prisma = cliente();
  const [pessoas, ordens, contratos, empenhos] = await Promise.all([
    prisma.pessoa.findMany({
      select: {
        id: true,
        documento: true,
        versoes: { select: { nome: true }, orderBy: { criadoEm: "desc" }, take: 1 },
      },
      orderBy: { documento: "asc" },
      take: 500,
    }),
    prisma.ordemDeCompra.findMany({
      where: { movimentos: { none: { tipo: "ESTORNO" } } },
      select: {
        id: true,
        numero: true,
        fornecedor: {
          select: {
            documento: true,
            versoes: { select: { nome: true }, orderBy: { criadoEm: "desc" }, take: 1 },
          },
        },
      },
      orderBy: { numero: "desc" },
      take: 300,
    }),
    prisma.contrato.findMany({
      select: { id: true, numeroContrato: true, contratadoNome: true },
      orderBy: { numeroContrato: "desc" },
      take: 300,
    }),
    prisma.empenho.findMany({
      where: { estornoDeId: null, anulacaoParcialDeId: null },
      select: { id: true, numero: true, credorCpfCnpj: true },
      orderBy: { numero: "desc" },
      take: 300,
    }),
  ]);
  return {
    emitenteId: pessoas.map((p) => ({ valor: p.id, rotulo: nomeDaPessoa(p) })),
    ordemId: ordens.map((o) => ({
      valor: o.id,
      rotulo: `${o.numero} — ${nomeDaPessoa(o.fornecedor)}`,
    })),
    contratoId: contratos.map((c) => ({
      valor: c.id,
      rotulo: `${c.numeroContrato} — ${c.contratadoNome}`,
    })),
    empenhoId: empenhos.map((e) => ({
      valor: e.id,
      rotulo: `${e.numero} — ${formatarDocumento(e.credorCpfCnpj)}`,
    })),
  };
}

export async function listarDocumentosFiscais(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = (c.filtros["q"] ?? "").trim();
  const sitFiltro = c.filtros["situacao"] ?? "";
  const modelo = c.filtros["modelo"] ?? "";
  const where: Prisma.DocumentoFiscalRecebidoWhereInput = {};
  if (q !== "") {
    where.OR = [
      { numero: { contains: q, mode: "insensitive" } },
      { serie: { contains: q, mode: "insensitive" } },
      { emitente: { versoes: { some: { nome: { contains: q, mode: "insensitive" } } } } },
    ];
  }
  if (
    modelo === "NFE" ||
    modelo === "NFCE" ||
    modelo === "NF_AVULSA" ||
    modelo === "CTE" ||
    modelo === "RPS" ||
    modelo === "RECIBO" ||
    modelo === "OUTRO"
  ) {
    where.modelo = modelo;
  }
  const ordem: Prisma.DocumentoFiscalRecebidoOrderByWithRelationInput =
    c.ordem === "dataRecebimento" ? { dataRecebimento: c.direcao } : { numero: c.direcao };
  const [total, linhas] = await Promise.all([
    prisma.documentoFiscalRecebido.count({ where }),
    prisma.documentoFiscalRecebido.findMany({
      where,
      orderBy: ordem,
      ...paginacao(c),
      select: {
        id: true,
        numero: true,
        serie: true,
        modelo: true,
        dataRecebimento: true,
        valorTotal: true,
        emitente: {
          select: {
            documento: true,
            versoes: { select: { nome: true }, orderBy: { criadoEm: "desc" }, take: 1 },
          },
        },
      },
    }),
  ]);
  const comDerivados = await Promise.all(
    linhas.map(async (d) => {
      const sit = await situacaoDoDocumentoFiscal(prisma, d.id);
      const saldo = await saldoDoDocumentoFiscal(prisma, d.id);
      return { ...d, sit, aLiquidar: saldo.aLiquidar };
    })
  );
  const filtradas =
    sitFiltro === "" ? comDerivados : comDerivados.filter((d) => d.sit === sitFiltro);
  return {
    total: sitFiltro === "" ? total : filtradas.length,
    linhas: filtradas.map((d) => ({
      id: d.id,
      numero: `${d.numero}/${d.serie}`,
      modelo: ROTULO_DO_MODELO[d.modelo] ?? d.modelo,
      emitente: nomeDaPessoa(d.emitente),
      dataRecebimento: diaCivilBr(d.dataRecebimento),
      total: d.valorTotal.toFixed(2),
      aLiquidar: d.aLiquidar.toFixed(2),
      situacao: ROTULO_DA_SITUACAO[d.sit] ?? d.sit,
    })),
  };
}

export interface DocumentoFiscalParaPdf {
  readonly id: string;
  readonly numero: string;
  readonly serie: string;
  readonly modelo: string;
  readonly emitente: string;
  readonly dataEmissao: string;
  readonly dataRecebimento: string;
  readonly chaveAcesso: string | null;
  readonly origem: string;
  readonly validacaoEstrutural: string | null;
  readonly situacao: string;
  readonly valorBruto: string;
  readonly valorDescontos: string;
  readonly valorAcrescimos: string;
  readonly valorTributos: string;
  readonly valorTotal: string;
  readonly aLiquidar: string;
  readonly ordemNumero: string | null;
  readonly contratoNumero: string | null;
  readonly empenhoNumero: string | null;
  readonly itens: readonly {
    readonly descricao: string;
    readonly unidade: string;
    readonly quantidade: string;
    readonly valorUnitario: string;
    readonly desconto: string;
    readonly acrescimo: string;
    readonly valorTotal: string;
  }[];
  readonly movimentos: readonly {
    readonly tipo: string;
    readonly data: string;
    readonly motivo: string;
    readonly por: string;
  }[];
}

export async function verDocumentoFiscal(
  id: string
): Promise<
  | (DetalheLido & {
      readonly anexos: readonly {
        readonly id: string;
        readonly nome: string;
        readonly mimeType: string;
        readonly tamanhoBytes: number;
        readonly sha256: string;
        readonly criadoEm: Date;
        readonly criadoPor: string;
        readonly origem: "PROCESSO";
        readonly movimento: null;
      }[];
      readonly ordemId: string | null;
      readonly empenhoId: string | null;
      readonly ordemNumero: string | null;
      readonly empenhoNumero: string | null;
      readonly situacao: string;
    })
  | null
> {
  const prisma = cliente();
  const d = await prisma.documentoFiscalRecebido.findUnique({
    where: { id },
    select: {
      numero: true,
      serie: true,
      modelo: true,
      dataEmissao: true,
      dataRecebimento: true,
      chaveAcesso: true,
      protocoloExterno: true,
      origem: true,
      validacaoEstrutural: true,
      valorBruto: true,
      valorDescontos: true,
      valorAcrescimos: true,
      valorTributos: true,
      valorTotal: true,
      criadoEm: true,
      criadoPor: true,
      ordemId: true,
      empenhoId: true,
      emitente: {
        select: {
          documento: true,
          versoes: { select: { nome: true }, orderBy: { criadoEm: "desc" }, take: 1 },
        },
      },
      ordem: { select: { id: true, numero: true } },
      contrato: { select: { numeroContrato: true } },
      empenho: { select: { id: true, numero: true } },
      processo: { select: { numeroProcesso: true } },
      itens: {
        orderBy: { criadoEm: "asc" },
        select: {
          id: true,
          codigo: true,
          descricao: true,
          unidade: true,
          quantidade: true,
          valorUnitario: true,
          desconto: true,
          acrescimo: true,
          valorTotal: true,
          criadoEm: true,
          criadoPor: true,
        },
      },
      movimentos: {
        orderBy: [{ data: "asc" }, { criadoEm: "asc" }],
        select: { id: true, tipo: true, data: true, motivo: true, criadoEm: true, criadoPor: true },
      },
      anexos: {
        orderBy: { criadoEm: "asc" },
        select: {
          id: true,
          nomeOriginal: true,
          mimeType: true,
          tamanhoBytes: true,
          sha256: true,
          criadoEm: true,
          criadoPor: true,
        },
      },
    },
  });
  if (d === null) return null;
  const sit = await situacaoDoDocumentoFiscal(prisma, id);
  const saldo = await saldoDoDocumentoFiscal(prisma, id);
  const tom =
    sit === "CANCELADO" || sit === "SUBSTITUIDO" ? "erro" : sit === "CONFERIDO" ? "ok" : "alerta";
  const historico: LinhaDoHistorico[] = [
    ...d.itens.map((i) => ({
      id: i.id,
      oQue: `Item: ${i.codigo === null ? "" : `${i.codigo} — `}${i.descricao}`,
      quando: diaCivilBr(d.dataEmissao),
      registradoEm: diaCivilBr(i.criadoEm),
      por: i.criadoPor,
      motivo: `${i.quantidade.toFixed(4)} ${i.unidade} × ${i.valorUnitario.toFixed(6)} − ${i.desconto.toFixed(2)} + ${i.acrescimo.toFixed(2)}`,
      valor: i.valorTotal.toFixed(2),
    })),
    ...d.movimentos.map((m) => ({
      id: m.id,
      oQue: m.tipo === "CONFERENCIA" ? "Conferência" : m.tipo === "CANCELAMENTO" ? "Cancelamento" : "Substituição",
      quando: diaCivilBr(m.data),
      registradoEm: diaCivilBr(m.criadoEm),
      por: m.criadoPor,
      motivo: m.motivo,
    })),
  ];
  return {
    titulo: `Documento ${d.numero}/${d.serie}`,
    subtitulo: `${ROTULO_DO_MODELO[d.modelo] ?? d.modelo} · ${nomeDaPessoa(d.emitente)}`,
    selos: [
      { texto: ROTULO_DA_SITUACAO[sit] ?? sit, tom },
      { texto: `${d.itens.length} item(ns)`, tom: "neutro" },
      { texto: d.origem === "XML" ? "Importado de XML" : "Digitado", tom: "neutro" },
    ],
    dados: [
      { rotulo: "Emitente", valor: nomeDaPessoa(d.emitente) },
      { rotulo: "Modelo", valor: ROTULO_DO_MODELO[d.modelo] ?? d.modelo },
      { rotulo: "Série / número", valor: `${d.serie} / ${d.numero}` },
      { rotulo: "Emissão", valor: diaCivilBr(d.dataEmissao), tipo: "data" },
      { rotulo: "Recebimento", valor: diaCivilBr(d.dataRecebimento), tipo: "data" },
      { rotulo: "Chave de acesso", valor: d.chaveAcesso ?? "— (este modelo não exige chave)" },
      { rotulo: "Protocolo externo", valor: d.protocoloExterno ?? "—" },
      { rotulo: "Ordem de compra", valor: d.ordem === null ? "—" : d.ordem.numero },
      { rotulo: "Contrato", valor: d.contrato === null ? "—" : d.contrato.numeroContrato },
      { rotulo: "Empenho", valor: d.empenho === null ? "—" : d.empenho.numero },
      { rotulo: "Processo licitatório", valor: d.processo === null ? "—" : d.processo.numeroProcesso },
      { rotulo: "Bruto", valor: d.valorBruto.toFixed(2), tipo: "dinheiro" },
      { rotulo: "Descontos", valor: d.valorDescontos.toFixed(2), tipo: "dinheiro" },
      { rotulo: "Acréscimos", valor: d.valorAcrescimos.toFixed(2), tipo: "dinheiro" },
      { rotulo: "Tributos destacados", valor: d.valorTributos.toFixed(2), tipo: "dinheiro" },
      { rotulo: "Total", valor: d.valorTotal.toFixed(2), tipo: "dinheiro" },
      {
        rotulo: "A liquidar",
        valor: saldo.aLiquidar.toFixed(2),
        tipo: "dinheiro",
        nota: "Valor total menos as liquidações registradas, descontadas as anulações.",
      },
      {
        rotulo: "Validação estrutural",
        valor: d.validacaoEstrutural ?? "— (documento digitado, sem validação de autorização fiscal)",
        tipo: "longo",
      },
      { rotulo: "Registrado em", valor: diaCivilBr(d.criadoEm), tipo: "data" },
      { rotulo: "Registrado por", valor: d.criadoPor },
    ],
    historico,
    anexos: d.anexos.map((a) => ({
      id: a.id,
      nome: a.nomeOriginal,
      mimeType: a.mimeType,
      tamanhoBytes: a.tamanhoBytes,
      sha256: a.sha256,
      criadoEm: a.criadoEm,
      criadoPor: a.criadoPor,
      origem: "PROCESSO" as const,
      movimento: null,
    })),
    ordemId: d.ordemId,
    empenhoId: d.empenhoId,
    ordemNumero: d.ordem?.numero ?? null,
    empenhoNumero: d.empenho?.numero ?? null,
    situacao: sit,
  };
}

export async function lerDocumentoFiscalParaPdf(id: string): Promise<DocumentoFiscalParaPdf | null> {
  const prisma = cliente();
  const d = await prisma.documentoFiscalRecebido.findUnique({
    where: { id },
    select: {
      id: true,
      numero: true,
      serie: true,
      modelo: true,
      dataEmissao: true,
      dataRecebimento: true,
      chaveAcesso: true,
      origem: true,
      validacaoEstrutural: true,
      valorBruto: true,
      valorDescontos: true,
      valorAcrescimos: true,
      valorTributos: true,
      valorTotal: true,
      emitente: {
        select: {
          documento: true,
          versoes: { select: { nome: true }, orderBy: { criadoEm: "desc" }, take: 1 },
        },
      },
      ordem: { select: { numero: true } },
      contrato: { select: { numeroContrato: true } },
      empenho: { select: { numero: true } },
      itens: {
        orderBy: { criadoEm: "asc" },
        select: {
          descricao: true,
          unidade: true,
          quantidade: true,
          valorUnitario: true,
          desconto: true,
          acrescimo: true,
          valorTotal: true,
        },
      },
      movimentos: {
        orderBy: [{ data: "asc" }, { criadoEm: "asc" }],
        select: { tipo: true, data: true, motivo: true, criadoPor: true },
      },
    },
  });
  if (d === null) return null;
  const sit = await situacaoDoDocumentoFiscal(prisma, id);
  const saldo = await saldoDoDocumentoFiscal(prisma, id);
  return {
    id: d.id,
    numero: d.numero,
    serie: d.serie,
    modelo: ROTULO_DO_MODELO[d.modelo] ?? d.modelo,
    emitente: nomeDaPessoa(d.emitente),
    dataEmissao: diaCivilBr(d.dataEmissao),
    dataRecebimento: diaCivilBr(d.dataRecebimento),
    chaveAcesso: d.chaveAcesso,
    origem: d.origem === "XML" ? "XML (validação estrutural local)" : "Digitação",
    validacaoEstrutural: d.validacaoEstrutural,
    situacao: ROTULO_DA_SITUACAO[sit] ?? sit,
    valorBruto: d.valorBruto.toFixed(2),
    valorDescontos: d.valorDescontos.toFixed(2),
    valorAcrescimos: d.valorAcrescimos.toFixed(2),
    valorTributos: d.valorTributos.toFixed(2),
    valorTotal: d.valorTotal.toFixed(2),
    aLiquidar: saldo.aLiquidar.toFixed(2),
    ordemNumero: d.ordem?.numero ?? null,
    contratoNumero: d.contrato?.numeroContrato ?? null,
    empenhoNumero: d.empenho?.numero ?? null,
    itens: d.itens.map((i) => ({
      descricao: i.descricao,
      unidade: i.unidade,
      quantidade: i.quantidade.toFixed(4),
      valorUnitario: i.valorUnitario.toFixed(6),
      desconto: i.desconto.toFixed(2),
      acrescimo: i.acrescimo.toFixed(2),
      valorTotal: i.valorTotal.toFixed(2),
    })),
    movimentos: d.movimentos.map((m) => ({
      tipo: m.tipo,
      data: diaCivilBr(m.data),
      motivo: m.motivo,
      por: m.criadoPor,
    })),
  };
}

export interface ItemDoDocumentoLido {
  readonly descricao: string;
  readonly unidade: string;
  readonly quantidade: string;
  readonly valorUnitario: string;
  readonly valorTotal: string;
  readonly desconto?: string;
  readonly acrescimo?: string;
}

function decimalDaTela(v: string): string {
  const s = v.trim();
  return s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
}

export async function criarDocumentoFiscal(
  c: Campos,
  itens: readonly ItemDoDocumentoLido[]
): Promise<string> {
  return comEscritaAutenticada("REGISTRAR_DOCUMENTO_FISCAL", async (criadoPor) => {
    const r = await registrarDocumentoFiscal(cliente(), {
      emitenteId: t(c, "emitenteId"),
      modelo: t(c, "modelo") as
        | "NFE"
        | "NFCE"
        | "NF_AVULSA"
        | "CTE"
        | "RPS"
        | "RECIBO"
        | "OUTRO",
      serie: t(c, "serie"),
      numero: t(c, "numero"),
      dataEmissao: dia(c, "dataEmissao"),
      dataRecebimento: dia(c, "dataRecebimento"),
      ...(t(c, "chaveAcesso") !== "" ? { chaveAcesso: t(c, "chaveAcesso") } : {}),
      ...(t(c, "ordemId") !== "" ? { ordemId: t(c, "ordemId") } : {}),
      ...(t(c, "contratoId") !== "" ? { contratoId: t(c, "contratoId") } : {}),
      ...(t(c, "empenhoId") !== "" ? { empenhoId: t(c, "empenhoId") } : {}),
      valorBruto: decimalDaTela(t(c, "valorBruto")),
      ...(t(c, "valorDescontos") !== "" ? { valorDescontos: decimalDaTela(t(c, "valorDescontos")) } : {}),
      ...(t(c, "valorAcrescimos") !== "" ? { valorAcrescimos: decimalDaTela(t(c, "valorAcrescimos")) } : {}),
      valorTotal: decimalDaTela(t(c, "valorTotal")),
      itens: itens.map((i) => ({
        descricao: i.descricao,
        unidade: i.unidade,
        quantidade: decimalDaTela(i.quantidade),
        valorUnitario: decimalDaTela(i.valorUnitario),
        valorTotal: decimalDaTela(i.valorTotal),
        ...(i.desconto !== undefined && i.desconto !== ""
          ? { desconto: decimalDaTela(i.desconto) }
          : {}),
        ...(i.acrescimo !== undefined && i.acrescimo !== ""
          ? { acrescimo: decimalDaTela(i.acrescimo) }
          : {}),
      })),
      criadoPor,
    });
    return r.documentoId;
  });
}

export async function importarDocumentoFiscal(
  xml: string,
  nomeArquivo: string,
  c: Campos
): Promise<string> {
  return comEscritaAutenticada("REGISTRAR_DOCUMENTO_FISCAL", async (criadoPor) => {
    const r = await importarDocumentoFiscalDeXml(cliente(), {
      xml,
      nomeArquivo,
      dataRecebimento: dia(c, "dataRecebimento"),
      ...(t(c, "ordemId") !== "" ? { ordemId: t(c, "ordemId") } : {}),
      ...(t(c, "contratoId") !== "" ? { contratoId: t(c, "contratoId") } : {}),
      ...(t(c, "empenhoId") !== "" ? { empenhoId: t(c, "empenhoId") } : {}),
      criadoPor,
    });
    return r.documentoId;
  });
}

async function estadoDosAtosDoDocumento(documentoId: string): Promise<{ readonly estado: EstadoDoDocumentoParaAtos; readonly versao: string } | null> {
  const doc = await cliente().documentoFiscalRecebido.findUnique({
    where: { id: documentoId },
    select: {
      numero: true, serie: true, emitenteId: true,
      ordem: { select: { numero: true, fornecedorId: true } },
      movimentos: { select: { id: true, tipo: true } },
      recebimentos: { select: { id: true } },
      liquidacoes: { select: { id: true, estornoDeId: true, anulacaoParcialDeId: true, estornos: { select: { id: true } } } },
    },
  });
  if (doc === null) return null;
  const estado: EstadoDoDocumentoParaAtos = {
    rotulo: `${doc.numero}/${doc.serie}`,
    movimentos: doc.movimentos.map((m) => m.tipo),
    emitenteConfereComOrdem: doc.ordem === null || doc.ordem.fornecedorId === doc.emitenteId,
    ordemNumero: doc.ordem?.numero ?? null,
    recebimentos: doc.recebimentos.length,
    liquidacoesVivas: doc.liquidacoes.filter((l) => l.estornoDeId === null && l.anulacaoParcialDeId === null && l.estornos.length === 0).length,
  };
  return { estado, versao: versaoDoEstado([doc.movimentos.map((m) => m.id).sort(), doc.recebimentos.length, doc.liquidacoes.map((l) => [l.id, l.estornos.length]), doc.ordem?.fornecedorId ?? null, doc.emitenteId]) };
}

/** V6.2 U0 — conferir/cancelar projetados do predicado do domínio. Leitura pura. */
export async function disponibilidadeDoDocumentoFiscal(documentoId: string): Promise<DisponibilidadeDoRegistro | null> {
  const lido = await estadoDosAtosDoDocumento(documentoId);
  if (lido === null) return null;
  return {
    versao: lido.versao,
    porAcao: {
      conferir: apresentar(elegibilidadeParaConferirDocumento(lido.estado)),
      cancelar: apresentar(elegibilidadeParaCancelarDocumento(lido.estado)),
    },
  };
}

export async function acaoDoDocumentoFiscal(
  acao: string,
  documentoId: string,
  c: Campos
): Promise<void> {
  const versaoDoFormulario = (c["__versao"] ?? "").trim();
  if (versaoDoFormulario !== "") {
    const atual = await estadoDosAtosDoDocumento(documentoId);
    if (atual !== null && atual.versao !== versaoDoFormulario) throw new RegistroMudouError("Este documento fiscal");
  }
  if (acao === "conferir") {
    await comEscritaAutenticada("CONFERIR_DOCUMENTO_FISCAL", (criadoPor) =>
      conferirDocumentoFiscal(cliente(), {
        documentoId,
        data: dia(c, "data"),
        motivo: t(c, "motivo"),
        criadoPor,
      })
    );
    return;
  }
  if (acao === "cancelar") {
    await comEscritaAutenticada("CANCELAR_DOCUMENTO_FISCAL", (criadoPor) =>
      cancelarDocumentoFiscal(cliente(), {
        documentoId,
        data: dia(c, "data"),
        motivo: t(c, "motivo"),
        criadoPor,
      })
    );
    return;
  }
  throw new Error(`Ação "${acao}" não existe neste cadastro. Nada foi gravado.`);
}

/** Documentos da ordem ainda utilizáveis no recebimento (não cancelados/substituídos). */
export async function documentosDaOrdemParaReceber(ordemId: string): Promise<readonly OpcaoDaIlha[]> {
  const prisma = cliente();
  const docs = await prisma.documentoFiscalRecebido.findMany({
    where: { ordemId },
    orderBy: { dataRecebimento: "desc" },
    select: {
      id: true,
      numero: true,
      serie: true,
      movimentos: { select: { tipo: true } },
    },
    take: 100,
  });
  return docs
    .filter((d) => !d.movimentos.some((m) => m.tipo === "CANCELAMENTO" || m.tipo === "SUBSTITUICAO"))
    .map((d) => ({ id: d.id, rotulo: `${d.numero}/${d.serie}` }));
}

/** Documentos conferidos, para lastrear a liquidação. Quem recusa incompatibilidade é o domínio. */
export async function documentosConferidosParaLiquidar(): Promise<readonly OpcaoDaIlha[]> {
  const prisma = cliente();
  const docs = await prisma.documentoFiscalRecebido.findMany({
    orderBy: { dataRecebimento: "desc" },
    select: {
      id: true,
      numero: true,
      serie: true,
      emitente: {
        select: {
          documento: true,
          versoes: { select: { nome: true }, orderBy: { criadoEm: "desc" }, take: 1 },
        },
      },
      movimentos: { select: { tipo: true } },
    },
    take: 300,
  });
  return docs
    .filter(
      (d) =>
        d.movimentos.some((m) => m.tipo === "CONFERENCIA") &&
        !d.movimentos.some((m) => m.tipo === "CANCELAMENTO" || m.tipo === "SUBSTITUICAO")
    )
    .map((d) => ({
      id: d.id,
      rotulo: `${d.numero}/${d.serie} — ${nomeDaPessoa(d.emitente)}`,
    }));
}
