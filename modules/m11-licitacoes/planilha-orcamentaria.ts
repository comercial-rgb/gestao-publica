import { createHash } from "node:crypto";
import { z } from "zod";
import { diaCivil, inicioDoDiaCivil } from "../../packages/datas/index.js";
import { lerXls, lerXlsxDetalhado, type AbaLida, type PastaLida } from "../../packages/planilha/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { analisarPlanilha, colunaDaLetra, type AnaliseDaPlanilha, type CampoDaPlanilha, type Mapeamento } from "./analise-da-planilha.js";
import { manifestoCanonico } from "./ordem-de-servico.js";

/**
 * ═══ M11 — A PLANILHA ORÇAMENTÁRIA DA OBRA: PRÉVIA, VERSÃO E VÍNCULO (V7 M2 U6) ═══
 *
 * PRÉVIA: o arquivo (.xlsx ou .xls, reconhecido pela ASSINATURA, não pela extensão) é lido sem executar fórmula ou
 * macro, analisado (`analise-da-planilha.ts`) e guardado inteiro com o sha256 — nenhum item de planilha existe ainda.
 * CONFIRMAÇÃO: reanalisa os BYTES guardados (não confia no JSON da prévia); erro de linha bloqueia; divergência de
 * conciliação exige ciência expressa; cria a versão seguinte da obra, que aponta a anterior e vale desde a sua vigência.
 * VÍNCULO: um serviço da planilha corresponde a um item do contrato declarado na versão — ato com motivo, revogável.
 *
 * ⚠️ O QUE ISTO NÃO FAZ: não cria nem altera item de contrato, não mede, não empenha. Referência de preços e data-base
 * são as declaradas pelo ente.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

const zDia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A data é um DIA civil AAAA-MM-DD.");
export const TAMANHO_MAXIMO_DA_PLANILHA = 5 * 1024 * 1024;
const CAMPOS: readonly CampoDaPlanilha[] = ["codigo", "referencia", "descricao", "unidade", "quantidade", "precoUnitario", "total"];

export const zGerarPreviaDePlanilha = z.object({
  obraId: z.string().min(1),
  nomeDoArquivo: z.string().trim().min(1).max(255),
  conteudo: z.instanceof(Uint8Array),
  /** Nome da aba; sem ele, a primeira aba em que o cabeçalho é reconhecido. */
  aba: z.string().trim().min(1).optional(),
  /** Cabeçalho informado pela pessoa: a linha (1 = primeira) e as LETRAS das colunas. Substitui a detecção. */
  linhaDoCabecalho: z.number().int().min(1).optional(),
  colunas: z.object(Object.fromEntries(["codigo", "referencia", "descricao", "unidade", "quantidade", "precoUnitario", "total"].map((k) => [k, z.string().trim().regex(/^[A-Za-z]{1,3}$/, "A coluna é uma letra (A, B, … AA).").optional()])) as Record<CampoDaPlanilha, z.ZodOptional<z.ZodString>>).strict().optional(),
  criadoPor: z.string().min(1),
}).strict();
export type GerarPreviaDePlanilhaInput = z.input<typeof zGerarPreviaDePlanilha>;

function lerPasta(conteudo: Buffer): { readonly formato: "XLSX" | "XLS"; readonly pasta: PastaLida } {
  if (conteudo.length >= 4 && conteudo[0] === 0x50 && conteudo[1] === 0x4b) return { formato: "XLSX", pasta: lerXlsxDetalhado(conteudo) };
  if (conteudo.length >= 8 && conteudo.readUInt32BE(0) === 0xd0cf11e0) return { formato: "XLS", pasta: lerXls(conteudo) };
  throw new Error("ARQUIVO-NAO-E-PLANILHA: o arquivo não é .xlsx nem .xls (a assinatura do conteúdo não confere, seja qual for a extensão). Nada foi gravado.");
}

function analisar(conteudo: Buffer, pedido: { readonly aba?: string; readonly linhaDoCabecalho?: number; readonly mapeamento?: Mapeamento }): { readonly formato: "XLSX" | "XLS"; readonly analise: AnaliseDaPlanilha } {
  const { formato, pasta } = lerPasta(conteudo);
  const abas: readonly AbaLida[] = pedido.aba === undefined ? pasta.abas : pasta.abas.filter((a) => a.nome === pedido.aba);
  if (abas.length === 0) throw new Error(`ABA-INEXISTENTE: a planilha não tem a aba "${pedido.aba}". Abas: ${pasta.abas.map((a) => `"${a.nome}"`).join(", ")}. Nada foi gravado.`);
  const informado = pedido.linhaDoCabecalho !== undefined && pedido.mapeamento !== undefined ? { linhaDoCabecalho: pedido.linhaDoCabecalho, mapeamento: pedido.mapeamento } : undefined;
  const motivos: string[] = [];
  for (const aba of abas) {
    const r = analisarPlanilha(aba, pasta.macros, informado);
    if (!("semCabecalho" in r)) return { formato, analise: r };
    motivos.push(r.semCabecalho);
  }
  throw new Error(`CABECALHO-NAO-RECONHECIDO: ${motivos.join(" ")} Nada foi gravado.`);
}

/** A PRÉVIA — lê, analisa e guarda o arquivo com a análise. Recusa só o que não é planilha legível; erro de linha é prévia. */
export async function gerarPreviaDePlanilha(prisma: PrismaClient, input: GerarPreviaDePlanilhaInput): Promise<{ readonly previaId: string; readonly erros: number; readonly divergencias: number; readonly servicos: number; readonly totalCalculado: string }> {
  const d = zGerarPreviaDePlanilha.parse(input);
  if (d.conteudo.byteLength === 0) throw new Error("ARQUIVO-VAZIO: o arquivo enviado não tem conteúdo. Nada foi gravado.");
  if (d.conteudo.byteLength > TAMANHO_MAXIMO_DA_PLANILHA) throw new Error(`ARQUIVO-GRANDE-DEMAIS: a planilha tem ${(d.conteudo.byteLength / 1048576).toFixed(1)} MB; o limite é 5 MB. Nada foi gravado.`);
  const conteudo = Buffer.from(d.conteudo);
  const informadoParcial = (d.linhaDoCabecalho === undefined) !== (d.colunas === undefined);
  if (informadoParcial) throw new Error("CABECALHO-INCOMPLETO: informe a linha do cabeçalho E as colunas, ou nenhum dos dois. Nada foi gravado.");
  let mapeamento: Mapeamento | undefined;
  if (d.colunas !== undefined) {
    const m: Partial<Record<CampoDaPlanilha, number>> = {};
    for (const campo of CAMPOS) { const l = d.colunas[campo]; if (l !== undefined) m[campo] = colunaDaLetra(l)!; }
    for (const obrigatorio of ["codigo", "descricao", "unidade", "quantidade", "precoUnitario"] as const) {
      if (m[obrigatorio] === undefined) throw new Error(`CABECALHO-INCOMPLETO: falta a coluna de ${obrigatorio}. Nada foi gravado.`);
    }
    mapeamento = m;
  }
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.gerarPreviaDePlanilha, "ENTE");
    const obra = await tx.obra.findUnique({ where: { id: d.obraId }, select: { id: true } });
    if (obra === null) throw new Error(`Obra ${d.obraId} não existe. Nada foi gravado.`);
    const { formato, analise } = analisar(conteudo, { ...(d.aba === undefined ? {} : { aba: d.aba }), ...(d.linhaDoCabecalho === undefined ? {} : { linhaDoCabecalho: d.linhaDoCabecalho }), ...(mapeamento === undefined ? {} : { mapeamento }) });
    const r = await tx.previaDePlanilhaOrcamentaria.create({
      data: {
        obraId: obra.id, nomeDoArquivo: d.nomeDoArquivo, formato, conteudo, sha256: createHash("sha256").update(conteudo).digest("hex"), tamanhoBytes: conteudo.length,
        aba: analise.aba, linhaDoCabecalho: analise.linhaDoCabecalho, mapeamento: analise.mapeamento as object, analise: analise as unknown as object,
        erros: analise.erros.length, divergencias: analise.divergencias.length, totalCalculado: analise.totalCalculado, criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { previaId: r.id, erros: analise.erros.length, divergencias: analise.divergencias.length, servicos: analise.itens.filter((i) => i.tipo === "SERVICO").length, totalCalculado: analise.totalCalculado };
  });
}

export const zConfirmarPreviaDePlanilha = z.object({
  previaId: z.string().min(1),
  descricao: z.string().trim().min(5),
  dataBaseDosPrecos: zDia,
  referenciaDePrecos: z.string().trim().min(3, "Informe a referência de preços declarada (tabela, mês, desoneração)."),
  vigenciaInicio: zDia,
  motivo: z.string().trim().min(10),
  numeroDoContrato: z.string().trim().min(1).optional(),
  cienteDasDivergencias: z.boolean(),
  criadoPor: z.string().min(1),
}).strict();
export type ConfirmarPreviaDePlanilhaInput = z.input<typeof zConfirmarPreviaDePlanilha>;

/** A CONFIRMAÇÃO — a versão seguinte da obra, dos bytes guardados na prévia. */
export async function confirmarPreviaDePlanilha(prisma: PrismaClient, input: ConfirmarPreviaDePlanilhaInput): Promise<{ readonly planilhaId: string; readonly versao: number; readonly valorTotal: string; readonly itens: number; readonly sha256: string }> {
  const d = zConfirmarPreviaDePlanilha.parse(input);
  try {
    return await prisma.$transaction(async (tx) => {
      await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.confirmarPreviaDePlanilha, "ENTE");
      const p = await tx.previaDePlanilhaOrcamentaria.findUnique({ where: { id: d.previaId }, select: { id: true, obraId: true, conteudo: true, aba: true, linhaDoCabecalho: true, mapeamento: true, analise: true, planilha: { select: { versao: true } } } });
      if (p === null) throw new Error(`Prévia ${d.previaId} não existe. Nada foi gravado.`);
      if (p.planilha !== null) throw new Error(`PREVIA-JA-CONFIRMADA: esta prévia já virou a versão ${p.planilha.versao} da planilha. Nada foi gravado.`);
      const { analise } = analisar(Buffer.from(p.conteudo), { aba: p.aba, linhaDoCabecalho: p.linhaDoCabecalho, mapeamento: p.mapeamento as Mapeamento });
      if (manifestoCanonico(analise).sha256 !== manifestoCanonico(p.analise).sha256) {
        throw new Error("PREVIA-DESATUALIZADA: a análise de hoje do mesmo arquivo difere da prévia mostrada. Gere uma prévia nova e confira. Nada foi gravado.");
      }
      if (analise.erros.length > 0) throw new Error(`PREVIA-COM-ERROS: ${analise.erros.length} linha(s) com erro, a primeira na linha ${analise.erros[0]!.linha}: ${analise.erros[0]!.mensagem}. Corrija o arquivo e gere outra prévia. Nada foi gravado.`);
      if (analise.divergencias.length > 0 && !d.cienteDasDivergencias) {
        throw new Error(`DIVERGENCIAS-SEM-CIENCIA: a prévia tem ${analise.divergencias.length} divergência(s) de conciliação (a primeira: ${analise.divergencias[0]!.mensagem}). Confirme que está ciente ou corrija o arquivo. Nada foi gravado.`);
      }
      let contratoId: string | null = null;
      if (d.numeroDoContrato !== undefined) {
        const c = await tx.contrato.findFirst({ where: { numeroContrato: d.numeroDoContrato }, select: { id: true } });
        if (c === null) throw new Error(`CONTRATO-INEXISTENTE: não há contrato nº ${d.numeroDoContrato}. Nada foi gravado.`);
        contratoId = c.id;
      }
      const anterior = await tx.planilhaOrcamentariaDaObra.findFirst({ where: { obraId: p.obraId }, orderBy: { versao: "desc" }, select: { id: true, versao: true, vigenciaInicio: true } });
      if (anterior !== null && d.vigenciaInicio < diaCivil(anterior.vigenciaInicio)) {
        throw new Error(`VIGENCIA-ANTERIOR-A-VERSAO-VIGENTE: a versão ${anterior.versao} vale desde ${diaCivil(anterior.vigenciaInicio).split("-").reverse().join("/")}; a nova versão não pode valer antes dela. Nada foi gravado.`);
      }
      const versao = (anterior?.versao ?? 0) + 1;
      const itens = analise.itens.map((i, k) => ({ ordem: k + 1, codigo: i.codigo, codigoDoPai: i.codigoDoPai, nivel: i.nivel, tipo: i.tipo, referencia: i.referencia, descricao: i.descricao, unidade: i.unidade, quantidade: i.quantidade, precoUnitario: i.precoUnitario, valor: i.valor, valorNoArquivo: i.valorNoArquivo, linhaDoArquivo: i.linha }));
      const { sha256 } = manifestoCanonico({ obraId: p.obraId, versao, itens, valorTotal: analise.totalCalculado });
      const planilha = await tx.planilhaOrcamentariaDaObra.create({
        data: {
          obraId: p.obraId, versao, contratoId, previaId: p.id, versaoAnteriorId: anterior?.id ?? null, descricao: d.descricao, dataBaseDosPrecos: inicioDoDiaCivil(d.dataBaseDosPrecos),
          referenciaDePrecos: d.referenciaDePrecos, vigenciaInicio: inicioDoDiaCivil(d.vigenciaInicio), motivo: d.motivo, valorTotal: analise.totalCalculado,
          divergenciasCientes: analise.divergencias.length, sha256, criadoPor: d.criadoPor,
        },
        select: { id: true },
      });
      await tx.itemDaPlanilhaOrcamentaria.createMany({ data: itens.map((i) => ({ ...i, planilhaId: planilha.id })) });
      return { planilhaId: planilha.id, versao, valorTotal: analise.totalCalculado, itens: itens.length, sha256 };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new Error("VERSAO-CONCORRENTE: outra versão desta planilha (ou desta prévia) foi confirmada no mesmo instante. Recarregue e confira. Nada foi gravado.");
    throw e;
  }
}

export const zVincularItemDaPlanilha = z.object({ itemDaPlanilhaId: z.string().min(1), itemDoContratoId: z.string().min(1), motivo: z.string().trim().min(10), criadoPor: z.string().min(1) }).strict();
export type VincularItemDaPlanilhaInput = z.input<typeof zVincularItemDaPlanilha>;

/** O VÍNCULO — serviço da planilha ↔ item do contrato declarado na versão. Nada é somado, copiado ou identificado. */
export async function vincularItemDaPlanilhaAoContrato(prisma: PrismaClient, input: VincularItemDaPlanilhaInput): Promise<{ readonly vinculoId: string }> {
  const d = zVincularItemDaPlanilha.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.vincularItemDaPlanilhaAoContrato, "ENTE");
    const item = await tx.itemDaPlanilhaOrcamentaria.findUnique({ where: { id: d.itemDaPlanilhaId }, select: { codigo: true, tipo: true, planilha: { select: { versao: true, contratoId: true, contrato: { select: { numeroContrato: true } } } } } });
    if (item === null) throw new Error(`Item de planilha ${d.itemDaPlanilhaId} não existe. Nada foi gravado.`);
    if (item.tipo !== "SERVICO") throw new Error(`VINCULO-DE-GRUPO: o item ${item.codigo} é grupo; só serviço se vincula a item do contrato. Nada foi gravado.`);
    if (item.planilha.contratoId === null) throw new Error(`PLANILHA-SEM-CONTRATO: a versão ${item.planilha.versao} não declarou contrato; sem ele não há item de contrato a vincular. Nada foi gravado.`);
    const doContrato = await tx.itemDoContrato.findUnique({ where: { id: d.itemDoContratoId }, select: { contratoId: true, numero: true } });
    if (doContrato === null || doContrato.contratoId !== item.planilha.contratoId) throw new Error(`ITEM-DE-OUTRO-CONTRATO: o item indicado não é do contrato ${item.planilha.contrato?.numeroContrato}. Nada foi gravado.`);
    const vivo = await tx.vinculoDeItemDaPlanilhaAoContrato.findFirst({ where: { itemDaPlanilhaId: d.itemDaPlanilhaId, itemDoContratoId: d.itemDoContratoId, revogacao: { is: null } }, select: { id: true } });
    if (vivo !== null) throw new Error(`VINCULO-JA-EXISTE: o serviço ${item.codigo} já está vinculado ao item ${doContrato.numero} do contrato. Nada foi gravado.`);
    const r = await tx.vinculoDeItemDaPlanilhaAoContrato.create({ data: { itemDaPlanilhaId: d.itemDaPlanilhaId, itemDoContratoId: d.itemDoContratoId, motivo: d.motivo, criadoPor: d.criadoPor }, select: { id: true } });
    return { vinculoId: r.id };
  });
}

export const zRevogarVinculoDaPlanilha = z.object({ vinculoId: z.string().min(1), motivo: z.string().trim().min(10), criadoPor: z.string().min(1) }).strict();
export type RevogarVinculoDaPlanilhaInput = z.input<typeof zRevogarVinculoDaPlanilha>;

export async function revogarVinculoDaPlanilha(prisma: PrismaClient, input: RevogarVinculoDaPlanilhaInput): Promise<{ readonly revogacaoId: string }> {
  const d = zRevogarVinculoDaPlanilha.parse(input);
  try {
    return await prisma.$transaction(async (tx) => {
      await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.revogarVinculoDaPlanilha, "ENTE");
      const v = await tx.vinculoDeItemDaPlanilhaAoContrato.findUnique({ where: { id: d.vinculoId }, select: { id: true, revogacao: { select: { id: true } } } });
      if (v === null) throw new Error(`Vínculo ${d.vinculoId} não existe. Nada foi gravado.`);
      if (v.revogacao !== null) throw new Error("VINCULO-JA-REVOGADO: este vínculo já foi revogado. Nada foi gravado.");
      const r = await tx.revogacaoDeVinculoDaPlanilha.create({ data: { vinculoId: v.id, motivo: d.motivo, criadoPor: d.criadoPor }, select: { id: true } });
      return { revogacaoId: r.id };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new Error("VINCULO-JA-REVOGADO: outra revogação deste vínculo foi gravada no mesmo instante. Nada foi gravado.");
    throw e;
  }
}

// ═══ LEITURAS ═══

export interface PrevisaoNaTela {
  readonly id: string; readonly obraId: string; readonly nomeDoArquivo: string; readonly formato: "XLSX" | "XLS"; readonly sha256: string; readonly tamanhoBytes: number;
  readonly criadoEm: Date; readonly criadoPor: string; readonly analise: AnaliseDaPlanilha; readonly confirmada: { readonly planilhaId: string; readonly versao: number } | null;
}

export async function previaDePlanilha(prisma: Tx, previaId: string): Promise<PrevisaoNaTela | null> {
  const p = await prisma.previaDePlanilhaOrcamentaria.findUnique({ where: { id: previaId }, select: { id: true, obraId: true, nomeDoArquivo: true, formato: true, sha256: true, tamanhoBytes: true, criadoEm: true, criadoPor: true, analise: true, planilha: { select: { id: true, versao: true } } } });
  if (p === null) return null;
  return { id: p.id, obraId: p.obraId, nomeDoArquivo: p.nomeDoArquivo, formato: p.formato, sha256: p.sha256, tamanhoBytes: p.tamanhoBytes, criadoEm: p.criadoEm, criadoPor: p.criadoPor, analise: p.analise as unknown as AnaliseDaPlanilha, confirmada: p.planilha === null ? null : { planilhaId: p.planilha.id, versao: p.planilha.versao } };
}

export async function planilhasDaObra(prisma: Tx, obraId: string) {
  const vs = await prisma.planilhaOrcamentariaDaObra.findMany({
    where: { obraId },
    orderBy: { versao: "desc" },
    select: { id: true, versao: true, descricao: true, vigenciaInicio: true, dataBaseDosPrecos: true, referenciaDePrecos: true, valorTotal: true, divergenciasCientes: true, sha256: true, criadoEm: true, contrato: { select: { numeroContrato: true } }, previa: { select: { nomeDoArquivo: true, formato: true, sha256: true } }, _count: { select: { itens: true } } },
  });
  return vs.map((v) => ({ id: v.id, versao: v.versao, descricao: v.descricao, vigenciaInicio: diaCivil(v.vigenciaInicio), dataBaseDosPrecos: diaCivil(v.dataBaseDosPrecos), referenciaDePrecos: v.referenciaDePrecos, valorTotal: v.valorTotal.toFixed(2), divergenciasCientes: v.divergenciasCientes, sha256: v.sha256, contrato: v.contrato?.numeroContrato ?? null, arquivo: v.previa, itens: v._count.itens }));
}

export async function planilhaOrcamentaria(prisma: Tx, planilhaId: string) {
  const v = await prisma.planilhaOrcamentariaDaObra.findUnique({
    where: { id: planilhaId },
    select: {
      id: true, obraId: true, versao: true, descricao: true, vigenciaInicio: true, dataBaseDosPrecos: true, referenciaDePrecos: true, motivo: true, valorTotal: true, divergenciasCientes: true, sha256: true, criadoEm: true, criadoPor: true,
      contrato: { select: { id: true, numeroContrato: true, itens: { orderBy: { numero: "asc" }, select: { id: true, numero: true, descricao: true, unidade: true } } } },
      versaoAnterior: { select: { id: true, versao: true } }, versaoSeguinte: { select: { id: true, versao: true } },
      previa: { select: { nomeDoArquivo: true, formato: true, sha256: true, analise: true } },
      itens: {
        orderBy: { ordem: "asc" },
        select: {
          id: true, codigo: true, nivel: true, tipo: true, referencia: true, descricao: true, unidade: true, quantidade: true, precoUnitario: true, valor: true, valorNoArquivo: true, linhaDoArquivo: true,
          vinculos: { orderBy: { criadoEm: "asc" }, select: { id: true, motivo: true, criadoEm: true, revogacao: { select: { motivo: true, criadoEm: true } }, itemDoContrato: { select: { numero: true, descricao: true, unidade: true } } } },
        },
      },
    },
  });
  if (v === null) return null;
  const analise = v.previa.analise as unknown as AnaliseDaPlanilha;
  return {
    id: v.id, obraId: v.obraId, versao: v.versao, descricao: v.descricao, vigenciaInicio: diaCivil(v.vigenciaInicio), dataBaseDosPrecos: diaCivil(v.dataBaseDosPrecos), referenciaDePrecos: v.referenciaDePrecos, motivo: v.motivo,
    valorTotal: v.valorTotal.toFixed(2), divergenciasCientes: v.divergenciasCientes, divergencias: analise.divergencias, sha256: v.sha256, criadoEm: v.criadoEm, criadoPor: v.criadoPor,
    contrato: v.contrato === null ? null : { id: v.contrato.id, numero: v.contrato.numeroContrato, itens: v.contrato.itens },
    versaoAnterior: v.versaoAnterior, versaoSeguinte: v.versaoSeguinte, arquivo: { nome: v.previa.nomeDoArquivo, formato: v.previa.formato, sha256: v.previa.sha256 },
    itens: v.itens.map((i) => ({
      id: i.id, codigo: i.codigo, nivel: i.nivel, tipo: i.tipo, referencia: i.referencia, descricao: i.descricao, unidade: i.unidade, quantidade: i.quantidade?.toFixed(4) ?? null, precoUnitario: i.precoUnitario?.toFixed(4) ?? null,
      valor: i.valor.toFixed(2), valorNoArquivo: i.valorNoArquivo?.toFixed(2) ?? null, linhaDoArquivo: i.linhaDoArquivo,
      vinculos: i.vinculos.map((x) => ({ id: x.id, motivo: x.motivo, criadoEm: x.criadoEm, revogado: x.revogacao !== null, motivoDaRevogacao: x.revogacao?.motivo ?? null, item: x.itemDoContrato })),
    })),
  };
}
