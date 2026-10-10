import { z } from "zod";
import { Decimal, sumMoney, toMoney } from "../../packages/contracts/index.js";
import { diaCivil, inicioDoDiaCivil } from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { nomeDoEnteNosDocumentos } from "../m16-travamento/apresentacao-do-ente.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { empenhadoLiquidoDoContrato, gravarAditivoNaTransacao, valorAtualizadoDoContrato } from "./contratos.js";
import { estornarControleDoContrato } from "./controle-contabil-do-contrato.js";
import { tipoDoEstorno, zRegistrarAditivoInput } from "./dominio.js";
import { contratoTravado, exigirContratoVigente, type ContratoLido } from "./fiscalizacao.js";
import { comprometidoPorItemDoContrato, manifestoCanonico } from "./ordem-de-servico.js";
import { historicosDosItens, ultimaVersao, versaoNoDia } from "./versoes-dos-itens.js";

/**
 * ═══ M11 — O ADITIVO POR ITENS DO CONTRATO (V7 M2 U5) ═══
 *
 * O termo aditivo que muda a QUANTIDADE e/ou o PREÇO UNITÁRIO de itens, ou inclui item, a partir de uma vigência. Não é
 * outro cadastro de aditivo: a variação de valor entra como `MovimentoContratual` pelo mesmo corpo do `registrarAditivo`
 * (supressão abaixo do empenhado e teto da dispensa valem igual), na mesma transação, e o valor atualizado do contrato,
 * os relatórios e as remessas continuam lendo só o movimento.
 *
 * ⚠️ A VARIAÇÃO É CONFERIDA. Por item: (nova quantidade − medido antes da vigência) × novo unitário − (quantidade anterior
 * − medido antes da vigência) × unitário anterior, arredondada UMA vez por item. O que foi medido em período anterior à
 * vigência continua ao preço anterior; o resto do item passa ao novo. O valor do termo informado tem de ser igual — a
 * divergência é recusada com a composição (ou o termo está errado, ou a digitação).
 * ⚠️ NADA SE REESCREVE. Versão nova só depois da última do item; preço novo não retroage sobre período já medido;
 * quantidade nova não fica abaixo do já comprometido (ordens emitidas e medições). Ordem emitida guarda o unitário da
 * emissão; medição guarda o unitário do primeiro dia do período.
 * ⚠️ FUNDAMENTO E EFEITO ANTECIPADO são do termo: o sistema registra o dispositivo informado e a vigência declarada; não
 * escolhe hipótese de alteração nem valida os limites do art. 125 (pendência já declarada no `registrarAditivo`).
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

const zDia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A data é um DIA civil AAAA-MM-DD.");
const zQuantidade = z.string().trim().regex(/^\d+(\.\d{1,4})?$/, "Quantidade com até 4 casas, ponto decimal.");
const hoje = (): string => diaCivil(new Date());
const br = (dia: string): string => dia.split("-").reverse().join("/");
const q4 = (d: Decimal.Value): string => new Decimal(d).toFixed(4);
const reais = (d: Decimal.Value): string => new Decimal(d).toFixed(2);

const zAlteracao = z.object({ itemDoContratoId: z.string().min(1), quantidade: zQuantidade, valorUnitario: zQuantidade }).strict();
const zInclusao = z.object({ descricao: z.string().trim().min(3), unidade: z.string().trim().min(1), quantidade: zQuantidade, valorUnitario: zQuantidade }).strict();

const zTermo = z.object({
  contratoId: z.string().min(1),
  numeroAditivo: z.string().trim().min(1).max(60),
  dataAssinatura: zDia,
  vigenciaInicio: zDia,
  fundamento: z.string().trim().min(5, "Informe o dispositivo invocado no termo."),
  motivo: z.string().trim().min(10, "Descreva o motivo com ao menos 10 caracteres."),
  alteracoes: z.array(zAlteracao).default([]),
  inclusoes: z.array(zInclusao).default([]),
  criadoPor: z.string().min(1),
});

export const zPreverAditivoPorItens = zTermo.strict();
export type PreverAditivoPorItensInput = z.input<typeof zPreverAditivoPorItens>;

export const zRegistrarAditivoPorItens = zTermo.extend({
  /** A variação de valor escrita no termo: positiva para acréscimo, negativa para supressão, zero se só redistribui. */
  variacaoDoTermo: z.string().trim().regex(/^-?\d+(\.\d{1,2})?$/, "Valor em reais com até 2 casas, ponto decimal; negativo para redução."),
}).strict();
export type RegistrarAditivoPorItensInput = z.input<typeof zRegistrarAditivoPorItens>;

export interface LinhaDaComposicao {
  readonly item: number;
  readonly descricao: string;
  readonly unidade: string;
  readonly incluido: boolean;
  readonly quantidadeAnterior: string;
  readonly quantidade: string;
  readonly valorUnitarioAnterior: string;
  readonly valorUnitario: string;
  readonly medidoAntes: string;
  readonly comprometido: string;
  readonly variacao: string;
}

export interface ComposicaoDoAditivo {
  readonly contrato: string;
  readonly vigenciaInicio: string;
  readonly linhas: readonly LinhaDaComposicao[];
  readonly variacao: string;
  readonly natureza: "ACRESCIMO" | "SUPRESSAO" | "SEM_VARIACAO";
}

type Termo = z.output<typeof zTermo>;

interface ComposicaoInterna extends ComposicaoDoAditivo {
  readonly alteracoesPorItemId: readonly { readonly itemDoContratoId: string; readonly linha: LinhaDaComposicao }[];
}

/** Medido por item do contrato: o de períodos inteiramente ANTERIORES ao dia, e as medições cujo período alcança o dia ou depois. */
async function medidoPorItem(tx: Tx, itemIds: readonly string[], dia: string): Promise<Map<string, { antes: Decimal; aPartir: string[] }>> {
  const limite = inicioDoDiaCivil(dia);
  const [naOrdem, porItens] = await Promise.all([
    tx.itemMedidoNaOrdem.findMany({ where: { itemDaOrdem: { itemDoContratoId: { in: [...itemIds] } }, medicao: { estorno: null } }, select: { quantidade: true, itemDaOrdem: { select: { itemDoContratoId: true, ordem: { select: { numero: true, ano: true } } } }, medicao: { select: { numero: true, periodoInicio: true, periodoFim: true } } } }),
    tx.itemMedido.findMany({ where: { itemId: { in: [...itemIds] } }, select: { quantidade: true, itemId: true, medicaoPorItens: { select: { medicao: { select: { numero: true, periodoInicio: true, periodoFim: true } } } } } }),
  ]);
  const m = new Map<string, { antes: Decimal; aPartir: string[] }>();
  const de = (id: string): { antes: Decimal; aPartir: string[] } => m.get(id) ?? (m.set(id, { antes: new Decimal(0), aPartir: [] }), m.get(id)!);
  for (const x of naOrdem) {
    const e = de(x.itemDaOrdem.itemDoContratoId);
    if (x.medicao.periodoFim < limite) e.antes = e.antes.plus(x.quantidade.toFixed(4));
    else e.aPartir.push(`medição nº ${x.medicao.numero} da ordem nº ${x.itemDaOrdem.ordem.numero}/${x.itemDaOrdem.ordem.ano} (período ${br(diaCivil(x.medicao.periodoInicio))} a ${br(diaCivil(x.medicao.periodoFim))})`);
  }
  for (const x of porItens) {
    const e = de(x.itemId);
    const med = x.medicaoPorItens.medicao;
    if (med.periodoFim < limite) e.antes = e.antes.plus(x.quantidade.toFixed(4));
    else e.aPartir.push(`medição nº ${med.numero} por itens (período ${br(diaCivil(med.periodoInicio))} a ${br(diaCivil(med.periodoFim))})`);
  }
  return m;
}

async function comporNaTransacao(tx: Tx, d: Termo, c: ContratoLido): Promise<ComposicaoInterna> {
  if (d.alteracoes.length === 0 && d.inclusoes.length === 0) throw new Error("ADITIVO-SEM-ITENS: informe ao menos um item alterado ou incluído. Nada foi gravado.");
  const ids = d.alteracoes.map((a) => a.itemDoContratoId);
  if (new Set(ids).size !== ids.length) throw new Error("ITEM-REPETIDO: cada item entra uma vez no aditivo. Nada foi gravado.");
  if (d.dataAssinatura > hoje()) throw new Error(`ASSINATURA-FUTURA: o termo não pode ter sido assinado em ${br(d.dataAssinatura)}, depois de hoje. Nada foi gravado.`);
  exigirContratoVigente(c, d.vigenciaInicio, "a vigência do aditivo começaria");

  const itens = await tx.itemDoContrato.findMany({ where: { contratoId: c.id }, select: { id: true, numero: true, descricao: true, unidade: true } });
  const historicos = await historicosDosItens(tx, { contratoId: c.id });
  const comprometido = await comprometidoPorItemDoContrato(tx, c.id, null);
  const medidos = await medidoPorItem(tx, ids, d.vigenciaInicio);

  const alteracoesPorItemId = d.alteracoes.map((a) => {
    const item = itens.find((i) => i.id === a.itemDoContratoId);
    if (item === undefined) throw new Error(`ITEM-DE-OUTRO-CONTRATO: o item ${a.itemDoContratoId} não é do contrato ${c.numeroContrato}. Nada foi gravado.`);
    const h = historicos.get(item.id)!;
    const ultima = ultimaVersao(h);
    if (ultima.desde !== null && ultima.desde > d.vigenciaInicio) {
      throw new Error(
        `VERSAO-POSTERIOR-JA-REGISTRADA: o item ${item.numero} (${item.descricao}) já tem versão do aditivo ${ultima.numeroAditivo} valendo desde ${br(ultima.desde)}, depois de ${br(d.vigenciaInicio)}. ` +
          `Um aditivo não se intercala antes de outro já registrado. Nada foi gravado.`
      );
    }
    const anterior = versaoNoDia(h, d.vigenciaInicio);
    const Q = anterior.quantidade, P = anterior.valorUnitario, Q2 = new Decimal(a.quantidade), P2 = new Decimal(a.valorUnitario);
    if (Q.eq(Q2) && P.eq(P2)) throw new Error(`ALTERACAO-SEM-EFEITO: o item ${item.numero} (${item.descricao}) já vale ${q4(Q)} ${item.unidade} a R$ ${q4(P)} em ${br(d.vigenciaInicio)}. Nada foi gravado.`);
    const med = medidos.get(item.id) ?? { antes: new Decimal(0), aPartir: [] };
    if (!P.eq(P2) && med.aPartir.length > 0) {
      throw new Error(
        `ADITIVO-RETROAGE-SOBRE-MEDICAO: o novo unitário do item ${item.numero} (${item.descricao}) valeria desde ${br(d.vigenciaInicio)}, mas já há ${med.aPartir.join("; ")} ao unitário anterior. ` +
          `O preço de período já medido não se reescreve: ajuste a vigência ou trate a diferença por ato próprio. Nada foi gravado.`
      );
    }
    const ja = comprometido.get(item.id) ?? new Decimal(0);
    if (Q2.lt(ja)) {
      throw new Error(
        `SUPRESSAO-ABAIXO-DO-COMPROMETIDO: o item ${item.numero} (${item.descricao}) passaria a ${q4(Q2)} ${item.unidade}, mas ${q4(ja)} já estão comprometidos em ordens emitidas ou medições. ` +
          `Cancele o saldo não executado das ordens antes de suprimir. Nada foi gravado.`
      );
    }
    const variacao = toMoney(Q2.minus(med.antes).times(P2).minus(Q.minus(med.antes).times(P)));
    const linha: LinhaDaComposicao = {
      item: item.numero, descricao: item.descricao, unidade: item.unidade, incluido: false,
      quantidadeAnterior: q4(Q), quantidade: q4(Q2), valorUnitarioAnterior: q4(P), valorUnitario: q4(P2), medidoAntes: q4(med.antes), comprometido: q4(ja), variacao: reais(variacao),
    };
    return { itemDoContratoId: item.id, linha };
  });

  let proximo = Math.max(0, ...itens.map((i) => i.numero));
  const inclusoes = d.inclusoes.map((n): LinhaDaComposicao => {
    const Q2 = new Decimal(n.quantidade), P2 = new Decimal(n.valorUnitario);
    if (Q2.lte(0) || P2.lte(0)) throw new Error(`INCLUSAO-SEM-QUANTIDADE-OU-PRECO: o item incluído "${n.descricao}" precisa de quantidade e unitário maiores que zero. Nada foi gravado.`);
    proximo += 1;
    return { item: proximo, descricao: n.descricao, unidade: n.unidade, incluido: true, quantidadeAnterior: q4(0), quantidade: q4(Q2), valorUnitarioAnterior: q4(P2), valorUnitario: q4(P2), medidoAntes: q4(0), comprometido: q4(0), variacao: reais(toMoney(Q2.times(P2))) };
  });

  const linhas = [...alteracoesPorItemId.map((a) => a.linha), ...inclusoes];
  const variacao = sumMoney(linhas.map((l) => toMoney(l.variacao)));
  return { contrato: c.numeroContrato, vigenciaInicio: d.vigenciaInicio, linhas, variacao: reais(variacao), natureza: variacao.gt(0) ? "ACRESCIMO" : variacao.lt(0) ? "SUPRESSAO" : "SEM_VARIACAO", alteracoesPorItemId };
}

function semInterno(c: ComposicaoInterna): ComposicaoDoAditivo {
  return { contrato: c.contrato, vigenciaInicio: c.vigenciaInicio, linhas: c.linhas, variacao: c.variacao, natureza: c.natureza };
}

/** A PRÉVIA — a mesma composição do registro, sem gravar nada. Exige a mesma ação de quem registra. */
export async function preverAditivoPorItens(prisma: PrismaClient, input: PreverAditivoPorItensInput): Promise<ComposicaoDoAditivo> {
  const d = zPreverAditivoPorItens.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.preverAditivoPorItens, "ENTE");
    const c = await contratoTravado(tx, d.contratoId);
    return semInterno(await comporNaTransacao(tx, d, c));
  });
}

export async function registrarAditivoPorItens(prisma: PrismaClient, input: RegistrarAditivoPorItensInput): Promise<{ readonly aditivoId: string; readonly movimentoId: string | null; readonly sha256: string; readonly composicao: ComposicaoDoAditivo }> {
  const d = zRegistrarAditivoPorItens.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarAditivoPorItens, "ENTE");
    const c = await contratoTravado(tx, d.contratoId);

    if ((await tx.aditivoPorItensDoContrato.findFirst({ where: { contratoId: c.id, numeroAditivo: d.numeroAditivo }, select: { id: true } })) !== null) {
      throw new Error(`NUMERO-DE-ADITIVO-JA-USADO: o contrato ${c.numeroContrato} já tem aditivo por itens nº ${d.numeroAditivo}. Nada foi gravado.`);
    }
    const valorAvulso = await tx.movimentoContratual.findFirst({
      where: { contratoId: c.id, numeroAditivo: d.numeroAditivo, tipo: { in: ["ACRESCIMO_VALOR", "SUPRESSAO_VALOR"] }, estornos: { none: {} } },
      select: { tipo: true, valor: true },
    });
    if (valorAvulso !== null) {
      throw new Error(
        `VALOR-DO-TERMO-JA-REGISTRADO: o aditivo nº ${d.numeroAditivo} do contrato ${c.numeroContrato} já tem ${valorAvulso.tipo === "ACRESCIMO_VALOR" ? "acréscimo" : "supressão"} de R$ ${valorAvulso.valor?.toFixed(2)} no cadastro de aditivos. ` +
          `Registrar os itens somaria o valor duas vezes: estorne o movimento avulso antes. Nada foi gravado.`
      );
    }

    const comp = await comporNaTransacao(tx, d, c);
    const informado = toMoney(d.variacaoDoTermo);
    if (!informado.eq(comp.variacao)) {
      const detalhe = comp.linhas.map((l) => `item ${l.item}: ${l.variacao}`).join("; ");
      throw new Error(
        `VARIACAO-DO-TERMO-DIVERGENTE: o termo informa ${informado.toFixed(2)}, e os itens compõem ${comp.variacao} (${detalhe}). ` +
          `Confira as quantidades, os unitários e a vigência com o termo assinado. Nada foi gravado.`
      );
    }

    let movimentoId: string | null = null;
    if (comp.natureza !== "SEM_VARIACAO") {
      const dados = zRegistrarAditivoInput.parse({
        contratoId: c.id, tipo: comp.natureza === "ACRESCIMO" ? "ACRESCIMO_VALOR" : "SUPRESSAO_VALOR", valor: new Decimal(comp.variacao).abs().toFixed(2),
        data: inicioDoDiaCivil(d.dataAssinatura), numeroAditivo: d.numeroAditivo, motivo: d.motivo, criadoPor: d.criadoPor,
      });
      movimentoId = (await gravarAditivoNaTransacao(tx, dados)).movimentoId;
    }

    const contrato = await tx.contrato.findUniqueOrThrow({ where: { id: c.id }, select: { contratadoNome: true, contratadoDocumento: true } });
    const { manifesto, sha256 } = manifestoCanonico({
      documento: "ADITIVO_POR_ITENS", ente: await nomeDoEnteNosDocumentos(tx),
      contrato: { numero: c.numeroContrato, contratado: contrato.contratadoNome, documentoDoContratado: contrato.contratadoDocumento },
      numeroAditivo: d.numeroAditivo, dataAssinatura: d.dataAssinatura, vigenciaInicio: d.vigenciaInicio, fundamento: d.fundamento, motivo: d.motivo,
      itens: comp.linhas, variacao: comp.variacao, natureza: comp.natureza, registradoPor: d.criadoPor,
    });
    const aditivo = await tx.aditivoPorItensDoContrato.create({
      data: {
        contratoId: c.id, numeroAditivo: d.numeroAditivo, dataAssinatura: inicioDoDiaCivil(d.dataAssinatura), vigenciaInicio: inicioDoDiaCivil(d.vigenciaInicio),
        fundamento: d.fundamento, motivo: d.motivo, variacao: comp.variacao, movimentoContratualId: movimentoId, manifesto: manifesto as object, sha256, criadoPor: d.criadoPor,
      },
      select: { id: true },
    });

    const novos = comp.linhas.filter((l) => l.incluido);
    const incluidos: { readonly itemDoContratoId: string; readonly linha: LinhaDaComposicao }[] = [];
    for (const l of novos) {
      const item = await tx.itemDoContrato.create({ data: { contratoId: c.id, numero: l.item, descricao: l.descricao, unidade: l.unidade, quantidade: l.quantidade, valorUnitario: l.valorUnitario, criadoPor: d.criadoPor }, select: { id: true } });
      incluidos.push({ itemDoContratoId: item.id, linha: l });
    }
    await tx.alteracaoDeItemPorAditivo.createMany({
      data: [...comp.alteracoesPorItemId, ...incluidos].map(({ itemDoContratoId, linha }) => ({
        aditivoId: aditivo.id, itemDoContratoId, quantidadeAnterior: linha.quantidadeAnterior, valorUnitarioAnterior: linha.valorUnitarioAnterior,
        quantidade: linha.quantidade, valorUnitario: linha.valorUnitario, medidoAntes: linha.medidoAntes, variacao: linha.variacao, inclusao: linha.incluido,
      })),
    });
    return { aditivoId: aditivo.id, movimentoId, sha256, composicao: semInterno(comp) };
  });
}

export const zEstornarAditivoPorItens = z.object({ aditivoId: z.string().min(1), data: zDia, motivo: z.string().trim().min(10), criadoPor: z.string().min(1) }).strict();
export type EstornarAditivoPorItensInput = z.input<typeof zEstornarAditivoPorItens>;

/**
 * ESTORNAR o aditivo por itens — só o ÚLTIMO do item e só enquanto NADA o usou: nenhuma ordem criada ou emitida, nenhuma
 * medição registrada sobre os itens dele depois do registro. As versões deixam de valer e o movimento de valor é
 * estornado no mesmo commit; estornar um acréscimo não deixa o contrato abaixo do já empenhado.
 */
export async function estornarAditivoPorItens(prisma: PrismaClient, input: EstornarAditivoPorItensInput): Promise<{ readonly estornoId: string; readonly movimentoEstornoId: string | null }> {
  const d = zEstornarAditivoPorItens.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.estornarAditivoPorItens, "ENTE");
    const a0 = await tx.aditivoPorItensDoContrato.findUnique({ where: { id: d.aditivoId }, select: { contratoId: true } });
    if (a0 === null) throw new Error(`Aditivo por itens ${d.aditivoId} não existe. Nada foi gravado.`);
    const c = await contratoTravado(tx, a0.contratoId);
    const a = await tx.aditivoPorItensDoContrato.findUniqueOrThrow({
      where: { id: d.aditivoId },
      select: {
        id: true, numeroAditivo: true, vigenciaInicio: true, criadoEm: true, estorno: { select: { id: true } },
        movimentoContratual: { select: { id: true, tipo: true, valor: true, dias: true, numeroAditivo: true, contratoId: true, estornos: { select: { id: true } } } },
        alteracoes: { select: { itemDoContratoId: true, itemDoContrato: { select: { numero: true } } } },
      },
    });
    if (a.estorno !== null) throw new Error(`ADITIVO-JA-ESTORNADO: o aditivo por itens nº ${a.numeroAditivo} do contrato ${c.numeroContrato} já foi estornado. Nada foi gravado.`);
    const ids = a.alteracoes.map((x) => x.itemDoContratoId);

    const posterior = await tx.alteracaoDeItemPorAditivo.findFirst({
      where: { itemDoContratoId: { in: ids }, aditivoId: { not: a.id }, aditivo: { estorno: { is: null }, OR: [{ vigenciaInicio: { gt: a.vigenciaInicio } }, { vigenciaInicio: a.vigenciaInicio, criadoEm: { gt: a.criadoEm } }] } },
      select: { aditivo: { select: { numeroAditivo: true } }, itemDoContrato: { select: { numero: true } } },
    });
    if (posterior !== null) throw new Error(`ADITIVO-POSTERIOR-SOBRE-O-ITEM: o item ${posterior.itemDoContrato.numero} tem o aditivo nº ${posterior.aditivo.numeroAditivo} depois deste. Estorne o posterior antes. Nada foi gravado.`);

    const depois = { gt: a.criadoEm };
    const [ordem, emissao, medidaNaOrdem, medidaPorItens] = await Promise.all([
      tx.itemDaOrdemDeServico.findFirst({ where: { itemDoContratoId: { in: ids }, criadoEm: depois, ordem: { descarte: { is: null } } }, select: { ordem: { select: { numero: true, ano: true } } } }),
      tx.emissaoDaOrdemDeServico.findFirst({ where: { criadoEm: depois, ordem: { itens: { some: { itemDoContratoId: { in: ids } } } } }, select: { ordem: { select: { numero: true, ano: true } } } }),
      tx.itemMedidoNaOrdem.findFirst({ where: { itemDaOrdem: { itemDoContratoId: { in: ids } }, medicao: { criadoEm: depois } }, select: { medicao: { select: { numero: true } } } }),
      tx.itemMedido.findFirst({ where: { itemId: { in: ids }, medicaoPorItens: { criadoEm: depois } }, select: { medicaoPorItens: { select: { medicao: { select: { numero: true } } } } } }),
    ]);
    const uso = ordem !== null ? `a ordem nº ${ordem.ordem.numero}/${ordem.ordem.ano} foi criada com os itens dele`
      : emissao !== null ? `a ordem nº ${emissao.ordem.numero}/${emissao.ordem.ano} foi emitida depois dele`
        : medidaNaOrdem !== null ? `a medição nº ${medidaNaOrdem.medicao.numero} de ordem mediu os itens dele`
          : medidaPorItens !== null ? `a medição nº ${medidaPorItens.medicaoPorItens.medicao.numero} por itens mediu os itens dele` : null;
    if (uso !== null) throw new Error(`ADITIVO-JA-UTILIZADO: o aditivo por itens nº ${a.numeroAditivo} não se estorna — ${uso}. O que foi feito sob ele continua valendo; corrija por novo aditivo. Nada foi gravado.`);

    let movimentoEstornoId: string | null = null;
    const mov = a.movimentoContratual;
    if (mov !== null) {
      if (mov.estornos.length > 0) throw new Error(`MOVIMENTO-JA-ESTORNADO: o valor do aditivo nº ${a.numeroAditivo} já foi estornado. Nada foi gravado.`);
      if (mov.tipo === "ACRESCIMO_VALOR") {
        const [atual, empenhado] = await Promise.all([valorAtualizadoDoContrato(tx, c.id), empenhadoLiquidoDoContrato(tx, c.id)]);
        const ficaria = toMoney(atual.minus(mov.valor!.toFixed(2)));
        if (ficaria.lt(empenhado)) {
          throw new Error(`ESTORNO-ABAIXO-DO-EMPENHADO: estornar o acréscimo de R$ ${mov.valor!.toFixed(2)} deixaria o contrato ${c.numeroContrato} em ${ficaria.toFixed(2)}, abaixo do empenhado (${empenhado.toFixed(2)}). Anule os empenhos antes. Nada foi gravado.`);
        }
      }
      const e = await tx.movimentoContratual.create({
        data: { contratoId: c.id, tipo: tipoDoEstorno(mov.tipo), valor: mov.valor === null ? null : mov.valor.toFixed(2), dias: mov.dias, data: inicioDoDiaCivil(d.data), numeroAditivo: mov.numeroAditivo, estornoDeId: mov.id, motivo: d.motivo, criadoPor: d.criadoPor },
        select: { id: true },
      });
      movimentoEstornoId = e.id;
      // V39-R2 (R2-013) — o valor do aditivo por itens lançou o controle do contrato; o estorno o inverte (contas do original).
      if (mov.tipo === "ACRESCIMO_VALOR" || mov.tipo === "SUPRESSAO_VALOR") {
        await estornarControleDoContrato(tx, { eventoOriginal: mov.tipo === "ACRESCIMO_VALOR" ? "ACRESCIMO" : "SUPRESSAO", origemOriginalId: mov.id, origemDoEstornoId: e.id, dia: diaCivil(new Date()), criadoPor: d.criadoPor });
      }
    }
    const r = await tx.estornoDeAditivoPorItens.create({ data: { aditivoId: a.id, movimentoEstornoId, data: inicioDoDiaCivil(d.data), motivo: d.motivo, criadoPor: d.criadoPor }, select: { id: true } });
    return { estornoId: r.id, movimentoEstornoId };
  });
}
