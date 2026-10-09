import { z } from "zod";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { Decimal, exigirElegivel, toMoney, type Money } from "../../packages/contracts/index.js";
import { elegibilidadeParaEstornarOrdem, elegibilidadeParaReceberOrdem } from "./elegibilidade.js";
import { diaCivil } from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { alocarDentroDaTransacao, zLinhaDeAlocacao } from "./compras-alocacao.js";

/**
 * M11 — A COMPRA (TR 5.17, o subconjunto de suprimentos).
 *
 * ═══ ⚠️ O QUE ESTE ARQUIVO ACRESCENTA ═══
 * O M11 tinha o PROCESSO e o CONTRATO. Faltava o que os alimenta e o que os executa: a
 * solicitação que abre o processo digital, a pesquisa de preços que estima o valor, e a
 * ordem de compra que termina em estoque ou em bem.
 *
 * ═══ ⚠️ A CASCATA VAI DO EMPENHO PARA A ORDEM, E NÃO O CONTRÁRIO — decisão D12 ═══
 * A TR 5.17.100 fixa a direção, e ela é o oposto do intuitivo:
 *
 *   > "Caso a ordem de compra esteja empenhada, permitir **através do estorno do
 *   > empenho** estornar os itens de uma ordem de compra automaticamente"
 *
 * Quem manda é o EMPENHO. Uma ordem empenhada não pode ser estornada por si — fazê-lo
 * deixaria o empenho vivo apontando para uma ordem que não existe mais, e a dotação
 * continuaria comprometida por uma compra cancelada.
 */

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

const zQuantidade = z
  .union([z.string(), z.number()])
  .transform((v) => toMoney(v))
  .refine((v) => v.greaterThan(0), { message: "quantidade tem de ser > 0" });

const zMotivo = z.string().trim().min(5);

// ═══════════════════════════════════════════════════════════════════════════
// LEITURAS DERIVADAS
// ═══════════════════════════════════════════════════════════════════════════

export interface EstatisticaDePreco {
  readonly materialId: string;
  readonly cotacoes: number;
  readonly minimo: Money;
  readonly maximo: Money;
  readonly medio: Money;
}

/**
 * MÉDIO, MÍNIMO E MÁXIMO DE UMA PESQUISA (TR 5.17.48).
 *
 * ⚠️ DERIVADOS DAS COTAÇÕES, nunca colunas. A cláusula pede o cálculo "automaticamente",
 * e é o EFEITO que ela descreve: três números que mudam a cada cotação nova. Uma coluna
 * os congelaria na primeira, e a estimativa da compra sairia do valor errado.
 *
 * ⚠️ E ITEM SEM COTAÇÃO NÃO VIRA ZERO. Zero passaria pela estimativa como se o material
 * fosse de graça; a ausência de cotação é um achado, e quem chama decide o que fazer com
 * ele.
 */
export async function estatisticasDaPesquisa(
  tx: Tx,
  pesquisaId: string
): Promise<readonly EstatisticaDePreco[]> {
  const itens = await tx.itemDePesquisaDePrecos.findMany({
    where: { pesquisaId },
    select: {
      materialId: true,
      cotacoes: { select: { valorUnitario: true } },
    },
  });

  return itens
    .filter((i) => i.cotacoes.length > 0)
    .map((i) => {
      const valores = i.cotacoes.map((c) => toMoney(c.valorUnitario.toFixed(6)));
      let minimo = valores[0] as Money;
      let maximo = valores[0] as Money;
      let soma = new Decimal(0);
      for (const v of valores) {
        if (v.lessThan(minimo)) minimo = v;
        if (v.greaterThan(maximo)) maximo = v;
        soma = soma.plus(v);
      }
      return {
        materialId: i.materialId,
        cotacoes: valores.length,
        minimo,
        maximo,
        medio: soma.dividedBy(valores.length).toDecimalPlaces(6),
      };
    });
}

export interface SaldoDoItemDaOrdem {
  readonly itemId: string;
  readonly materialId: string;
  readonly quantidade: Money;
  readonly recebida: Money;
  readonly pendente: Money;
  readonly valorPendente: Money;
}

/**
 * O SALDO PENDENTE DE ENTREGA DA ORDEM (TR 5.17.105).
 *
 * ⚠️ Σ DOS RECEBIMENTOS, não coluna — decisão D5. "Contendo as quantidades, os valores e
 * o saldo" é exatamente a leitura de três números que uma coluna reduziria a um.
 */
export async function saldoDaOrdemDeCompra(
  tx: Tx,
  ordemId: string,
  ateDia?: string
): Promise<readonly SaldoDoItemDaOrdem[]> {
  const itens = await tx.itemDeOrdemDeCompra.findMany({
    where: { ordemId },
    select: {
      id: true,
      materialId: true,
      quantidade: true,
      valorUnitario: true,
      recebimentos: {
        select: {
          quantidade: true,
          recebimento: { select: { data: true } },
        },
      },
    },
  });

  return itens.map((i) => {
    let recebida = new Decimal(0);
    for (const r of i.recebimentos) {
      if (ateDia !== undefined && diaCivil(r.recebimento.data) > ateDia) continue;
      recebida = recebida.plus(toMoney(r.quantidade.toFixed(4)));
    }
    const quantidade = toMoney(i.quantidade.toFixed(4));
    const pendente = quantidade.minus(recebida);
    return {
      itemId: i.id,
      materialId: i.materialId,
      quantidade,
      recebida,
      pendente,
      valorPendente: pendente
        .times(toMoney(i.valorUnitario.toFixed(6)))
        .toDecimalPlaces(2),
    };
  });
}

/**
 * A SITUAÇÃO DA SOLICITAÇÃO (TR 5.17.52 — "autorizadas, pendentes e anuladas").
 *
 * ⚠️ DERIVADA DOS MOVIMENTOS, e é isso que preserva QUEM autorizou e QUANDO. Uma coluna
 * `situacao` responderia "autorizada" sem dizer por quem — e é justamente isso que o
 * controle interno cobra quando a compra é questionada.
 */
export async function situacaoDaSolicitacao(
  tx: Tx,
  solicitacaoId: string
): Promise<"PENDENTE" | "AUTORIZADA" | "ANULADA"> {
  // ⚠️ SÓ AUTORIZACAO e ANULACAO decidem; ORDEM_ESTORNADA (V6 P1.1) é informativo do histórico.
  const movimentos = await tx.movimentoDaSolicitacao.findMany({
    where: { solicitacaoId, tipo: { in: ["AUTORIZACAO", "ANULACAO"] } },
    select: { tipo: true, data: true, criadoEm: true },
    orderBy: [{ data: "asc" }, { criadoEm: "asc" }],
  });
  if (movimentos.length === 0) return "PENDENTE";
  const ultimo = movimentos[movimentos.length - 1];
  return ultimo?.tipo === "ANULACAO" ? "ANULADA" : "AUTORIZADA";
}

/**
 * A ORDEM ESTÁ ESTORNADA? (V6 P1.1) — DERIVADO da existência do movimento ESTORNO. O estorno
 * deixou de apagar a ordem: o papel de runtime não tem DELETE, e a ordem estornada continua
 * existindo para o histórico e para as solicitações que ela atendia.
 */
export async function ordemEstornada(tx: Tx, ordemId: string): Promise<boolean> {
  const n = await tx.movimentoDaOrdemDeCompra.count({ where: { ordemId, tipo: "ESTORNO" } });
  return n > 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// OS CASOS DE USO
// ═══════════════════════════════════════════════════════════════════════════

export const zRelacionarMarcaAoMaterialInput = z.object({
  materialId: z.string().min(1),
  marcaId: z.string().min(1),
  criadoPor: z.string().min(1),
});
export type RelacionarMarcaAoMaterialInput = z.input<
  typeof zRelacionarMarcaAoMaterialInput
>;

/** TR 5.17.5 — marcas pré-aprovadas do material (N-N, decisão D7). */
export async function relacionarMarcaAoMaterial(
  prisma: PrismaClient,
  input: RelacionarMarcaAoMaterialInput
): Promise<{ readonly vinculoId: string }> {
  const d = zRelacionarMarcaAoMaterialInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.relacionarMarcaAoMaterial, "ENTE");
    const v = await tx.materialMarca.create({
      data: { materialId: d.materialId, marcaId: d.marcaId, criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { vinculoId: v.id };
  });
}

export const zRelacionarElementoAoMaterialInput = z.object({
  materialId: z.string().min(1),
  naturezaDespesaId: z.string().min(1),
  criadoPor: z.string().min(1),
});
export type RelacionarElementoAoMaterialInput = z.input<
  typeof zRelacionarElementoAoMaterialInput
>;

/** TR 5.17.9 — o elemento de despesa que o material pode consumir. */
export async function relacionarElementoAoMaterial(
  prisma: PrismaClient,
  input: RelacionarElementoAoMaterialInput
): Promise<{ readonly vinculoId: string }> {
  const d = zRelacionarElementoAoMaterialInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(
      tx, d.criadoPor, ACAO_DO_SERVICO.relacionarElementoAoMaterial, "ENTE"
    );
    const v = await tx.materialElementoDespesa.create({
      data: {
        materialId: d.materialId,
        naturezaDespesaId: d.naturezaDespesaId,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { vinculoId: v.id };
  });
}

/**
 * ⚠️ O GUARD DA 5.17.9 — "IMPEDINDO que determinado produto seja comprado com elemento
 * errado ou NÃO RELACIONADO".
 *
 * ⚠️ E ELE TRATA "SEM RELAÇÃO NENHUMA" COMO PERMISSIVO, de propósito e com o motivo
 * junto: material que ninguém relacionou a elemento algum não está sendo comprado no
 * elemento ERRADO — está sendo comprado por quem ainda não parametrizou. Recusar aí
 * travaria o almoxarifado inteiro no dia em que a tabela nascesse vazia, que é a mesma
 * escolha da cota de consumo.
 */
async function exigirElementoRelacionado(
  tx: Tx,
  materialId: string,
  naturezaDespesaId: string
): Promise<void> {
  const relacoes = await tx.materialElementoDespesa.findMany({
    where: { materialId },
    select: { naturezaDespesaId: true, naturezaDespesa: { select: { codigoCompleto: true } } },
  });
  if (relacoes.length === 0) return;
  if (relacoes.some((r) => r.naturezaDespesaId === naturezaDespesaId)) return;

  const material = await tx.material.findUnique({
    where: { id: materialId },
    select: { codigo: true, descricaoSucinta: true },
  });
  const natureza = await tx.naturezaDespesa.findUnique({
    where: { id: naturezaDespesaId },
    select: { codigoCompleto: true },
  });
  throw new Error(
    `ELEMENTO NÃO RELACIONADO: o material ${material?.codigo} ` +
      `(${material?.descricaoSucinta}) está cadastrado para os elementos ` +
      `${relacoes.map((r) => r.naturezaDespesa.codigoCompleto).join(", ")}, e a compra ` +
      `veio pelo ${natureza?.codigoCompleto}. A regra manda IMPEDIR — comprar no ` +
      `elemento errado desclassifica a despesa no balanço e na prestação de contas.`
  );
}

export const zRegistrarSolicitacaoDeCompraInput = z.object({
  numero: z.string().trim().min(1).max(20),
  setorId: z.string().min(1),
  data: z.coerce.date(),
  justificativa: z.string().trim().min(10),
  solicitante: z.string().trim().min(3),
  processoDigitalId: z.string().min(1).optional(),
  itens: z
    .array(z.object({ materialId: z.string().min(1), quantidade: zQuantidade }))
    .min(1, "uma solicitação sem item não pede nada"),
  criadoPor: z.string().min(1),
});
export type RegistrarSolicitacaoDeCompraInput = z.input<
  typeof zRegistrarSolicitacaoDeCompraInput
>;

/** TR 5.17.51, 5.17.56 — a solicitação de compra. */
export async function registrarSolicitacaoDeCompra(
  prisma: PrismaClient,
  input: RegistrarSolicitacaoDeCompraInput
): Promise<{ readonly solicitacaoId: string }> {
  const d = zRegistrarSolicitacaoDeCompraInput.parse(input);
  return prisma.$transaction(async (tx) => {
    // A UG sai do SETOR — é o eixo de acesso da 5.17.54.
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarSolicitacaoDeCompra, {
      setor: d.setorId,
    });
    // V37 — o setor desativado não faz solicitação nova (a tela já não o oferece; quem recusa é aqui).
    const setor = await tx.setor.findUnique({ where: { id: d.setorId }, select: { codigo: true, ativo: true } });
    if (setor !== null && !setor.ativo) throw new Error(`O setor ${setor.codigo} está desativado e não faz solicitação de compra nova. Nada foi gravado.`);
    const s = await tx.solicitacaoDeCompra.create({
      data: {
        numero: d.numero, setorId: d.setorId, data: d.data,
        justificativa: d.justificativa, solicitante: d.solicitante,
        processoDigitalId: d.processoDigitalId ?? null, criadoPor: d.criadoPor,
        itens: {
          create: d.itens.map((i) => ({
            materialId: i.materialId,
            quantidade: i.quantidade.toFixed(4),
            criadoPor: d.criadoPor,
          })),
        },
      },
      select: { id: true },
    });
    return { solicitacaoId: s.id };
  });
}

export const zMovimentarSolicitacaoInput = z.object({
  solicitacaoId: z.string().min(1),
  tipo: z.enum(["AUTORIZACAO", "ANULACAO"]),
  data: z.coerce.date(),
  motivo: zMotivo,
  criadoPor: z.string().min(1),
});
export type MovimentarSolicitacaoInput = z.input<typeof zMovimentarSolicitacaoInput>;

/**
 * TR 5.17.53 — autorizar (ou anular) a solicitação.
 *
 * ⚠️ AUTORIZAR DUAS VEZES RECUSA, e anular o que não foi autorizado também. Sem isso, a
 * situação derivada oscilaria conforme a ordem de digitação, e "quem autorizou" teria
 * duas respostas.
 */
export async function movimentarSolicitacaoDeCompra(
  prisma: PrismaClient,
  input: MovimentarSolicitacaoInput
): Promise<{ readonly movimentoId: string }> {
  const d = zMovimentarSolicitacaoInput.parse(input);
  return prisma.$transaction(async (tx) => {
    const s = await tx.solicitacaoDeCompra.findUnique({
      where: { id: d.solicitacaoId },
      select: { id: true, numero: true, setorId: true },
    });
    if (s === null) throw new Error(`Solicitação ${d.solicitacaoId} não existe.`);
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.movimentarSolicitacaoDeCompra, {
      setor: s.setorId,
    });

    const atual = await situacaoDaSolicitacao(tx, d.solicitacaoId);
    if (d.tipo === "AUTORIZACAO" && atual === "AUTORIZADA") {
      throw new Error(
        `A solicitação ${s.numero} já está AUTORIZADA. Autorizar de novo faria "quem ` +
          `autorizou" ter duas respostas.`
      );
    }
    if (d.tipo === "ANULACAO" && atual === "ANULADA") {
      throw new Error(`A solicitação ${s.numero} já está ANULADA.`);
    }
    if (d.tipo === "ANULACAO" && atual === "PENDENTE") {
      throw new Error(
        `A solicitação ${s.numero} ainda está PENDENTE — não há autorização a anular. ` +
          `Uma solicitação pendente simplesmente não avança.`
      );
    }
    if (d.tipo === "ANULACAO") {
      // ⚠️ V6 P1.1 — com parcelas VIVAS em ordens VIVAS, anular deixaria ordens apontando para um
      // pedido que não existe mais. Desfaça os vínculos (ou estorne as ordens) antes.
      const vivas = await tx.alocacaoDeSolicitacaoNaOrdem.findMany({
        where: { itemDeSolicitacao: { solicitacaoId: d.solicitacaoId }, estornoDeId: null, estorno: null, itemDeOrdem: { ordem: { movimentos: { none: { tipo: "ESTORNO" } } } } },
        select: { quantidade: true, itemDeOrdem: { select: { ordem: { select: { numero: true } } } } },
      });
      if (vivas.length > 0) {
        const ordens = [...new Set(vivas.map((v) => v.itemDeOrdem.ordem.numero))].join(", ");
        throw new Error(
          `A solicitação ${s.numero} tem ${vivas.length} parcela(s) ligada(s) a ordem(ns) viva(s) (${ordens}). ` +
            `Desfaça os vínculos ou estorne as ordens antes de anular. Nada foi gravado.`
        );
      }
    }

    const m = await tx.movimentoDaSolicitacao.create({
      data: {
        solicitacaoId: d.solicitacaoId, tipo: d.tipo, data: d.data,
        motivo: d.motivo, criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { movimentoId: m.id };
  });
}

export const zRegistrarPesquisaDePrecosInput = z.object({
  numero: z.string().trim().min(1).max(20),
  objeto: z.string().trim().min(5),
  data: z.coerce.date(),
  itens: z
    .array(
      z.object({
        materialId: z.string().min(1),
        quantidade: zQuantidade,
        cotacoes: z
          .array(
            z.object({
              fornecedorId: z.string().min(1),
              valorUnitario: z.union([z.string(), z.number()]),
              origem: z.string().trim().min(3),
            })
          )
          .default([]),
      })
    )
    .min(1, "uma pesquisa sem item não estima nada"),
  criadoPor: z.string().min(1),
});
export type RegistrarPesquisaDePrecosInput = z.input<
  typeof zRegistrarPesquisaDePrecosInput
>;

/** TR 5.17.46, 5.17.48 — a pesquisa de preços com as cotações dos fornecedores. */
export async function registrarPesquisaDePrecos(
  prisma: PrismaClient,
  input: RegistrarPesquisaDePrecosInput
): Promise<{ readonly pesquisaId: string }> {
  const d = zRegistrarPesquisaDePrecosInput.parse(input);
  for (const i of d.itens) {
    for (const c of i.cotacoes) {
      if (toMoney(c.valorUnitario).lessThanOrEqualTo(0)) {
        throw new Error(
          `Cotação de ${toMoney(c.valorUnitario).toString()} é inválida: preço zero ou ` +
            `negativo puxaria o mínimo e a média para baixo e faria a estimativa da ` +
            `compra sair menor do que qualquer proposta real.`
        );
      }
    }
  }

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarPesquisaDePrecos, "ENTE");
    const p = await tx.pesquisaDePrecos.create({
      data: {
        numero: d.numero, objeto: d.objeto, data: d.data, criadoPor: d.criadoPor,
        itens: {
          create: d.itens.map((i) => ({
            materialId: i.materialId,
            quantidade: i.quantidade.toFixed(4),
            criadoPor: d.criadoPor,
            cotacoes: {
              create: i.cotacoes.map((c) => ({
                fornecedorId: c.fornecedorId,
                valorUnitario: toMoney(c.valorUnitario).toFixed(6),
                origem: c.origem,
                criadoPor: d.criadoPor,
              })),
            },
          })),
        },
      },
      select: { id: true },
    });
    return { pesquisaId: p.id };
  });
}

export const zEmitirOrdemDeCompraInput = z.object({
  numero: z.string().trim().min(1).max(20),
  tipo: z.enum(["ORDINARIA", "GLOBAL", "ESTIMATIVA"]),
  processoId: z.string().min(1).optional(),
  fornecedorId: z.string().min(1),
  dataEmissao: z.coerce.date(),
  dataVencimento: z.coerce.date().optional(),
  finalidade: z.string().trim().min(5),
  fichaId: z.string().min(1).optional(),
  consumoImediato: z.boolean().default(false),
  desconto: z.union([z.string(), z.number()]).optional(),
  itens: z
    .array(
      z.object({
        materialId: z.string().min(1),
        quantidade: zQuantidade,
        valorUnitario: z.union([z.string(), z.number()]),
      })
    )
    .min(1, "uma ordem sem item não compra nada"),
  /**
   * V6 P1.1 — a ORIGEM: parcelas de itens de solicitações AUTORIZADAS que esta ordem atende,
   * por índice do item da ordem. Opcional: uma ordem sem origem é compra direta (ou legado).
   */
  origem: z
    .array(
      z.object({
        itemIndex: z.number().int().min(0),
        itemDeSolicitacaoId: z.string().min(1),
        quantidade: zQuantidade,
      })
    )
    .optional(),
  criadoPor: z.string().min(1),
});
export type EmitirOrdemDeCompraInput = z.input<typeof zEmitirOrdemDeCompraInput>;

/**
 * TR 5.17.96, 5.17.97 — a ordem de compra.
 *
 * ⚠️ O GUARD DO ELEMENTO (5.17.9) RODA AQUI, contra a ficha declarada. É o momento em que
 * o material encontra a dotação, e é o único lugar onde "comprado com elemento errado"
 * ainda pode ser impedido — depois do empenho, já é despesa classificada.
 */
export async function emitirOrdemDeCompra(
  prisma: PrismaClient,
  input: EmitirOrdemDeCompraInput
): Promise<{ readonly ordemId: string; readonly valorTotal: Money }> {
  const d = zEmitirOrdemDeCompraInput.parse(input);

  let total = new Decimal(0);
  for (const i of d.itens) {
    const unit = toMoney(i.valorUnitario);
    if (unit.lessThanOrEqualTo(0)) {
      throw new Error(
        `Item com valor unitário ${unit.toString()}: uma ordem de compra a preço zero ` +
          `não tem o que empenhar, e a dotação ficaria comprometida em nada.`
      );
    }
    total = total.plus(i.quantidade.times(unit));
  }
  total = total.toDecimalPlaces(2);
  const desconto = d.desconto === undefined ? null : toMoney(d.desconto);
  if (desconto !== null && desconto.greaterThan(total)) {
    throw new Error(
      `Desconto de ${desconto.toFixed(2)} maior que o total de ${total.toFixed(2)}: a ` +
        `ordem ficaria com valor negativo, e o fornecedor pagaria ao ente.`
    );
  }

  return prisma.$transaction(async (tx) => {
    const ficha =
      d.fichaId === undefined
        ? null
        : await tx.fichaOrcamentaria.findUnique({
            where: { id: d.fichaId },
            select: { id: true, unidadeOrcId: true, naturezaDespesaId: true },
          });
    if (d.fichaId !== undefined && ficha === null) {
      throw new Error(`Ficha ${d.fichaId} não existe.`);
    }
    await autorizarNo(
      tx,
      d.criadoPor,
      ACAO_DO_SERVICO.emitirOrdemDeCompra,
      ficha === null ? "ENTE" : { ug: ficha.unidadeOrcId }
    );

    if (ficha !== null) {
      for (const i of d.itens) {
        await exigirElementoRelacionado(tx, i.materialId, ficha.naturezaDespesaId);
      }
    }

    const ordem = await tx.ordemDeCompra.create({
      data: {
        numero: d.numero, tipo: d.tipo,
        processoId: d.processoId ?? null, fornecedorId: d.fornecedorId,
        dataEmissao: d.dataEmissao, dataVencimento: d.dataVencimento ?? null,
        finalidade: d.finalidade, fichaId: d.fichaId ?? null,
        consumoImediato: d.consumoImediato,
        desconto: desconto === null ? null : desconto.toFixed(2),
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    // ⚠️ Os itens são criados UM A UM para que o índice do item case com o id (a origem aponta por índice).
    const idsDosItens: string[] = [];
    for (const i of d.itens) {
      const item = await tx.itemDeOrdemDeCompra.create({
        data: {
          ordemId: ordem.id,
          materialId: i.materialId,
          quantidade: i.quantidade.toFixed(4),
          valorUnitario: toMoney(i.valorUnitario).toFixed(6),
          criadoPor: d.criadoPor,
        },
        select: { id: true },
      });
      idsDosItens.push(item.id);
    }
    if (d.origem !== undefined && d.origem.length > 0) {
      const linhas = d.origem.map((o) => {
        const itemDeOrdemId = idsDosItens[o.itemIndex];
        if (itemDeOrdemId === undefined) throw new Error(`Origem aponta para o item ${o.itemIndex}, que a ordem não tem. Nada foi gravado.`);
        return zLinhaDeAlocacao.parse({ itemDeSolicitacaoId: o.itemDeSolicitacaoId, itemDeOrdemId, quantidade: o.quantidade.toFixed(4) });
      });
      await alocarDentroDaTransacao(tx, ordem.id, linhas, d.criadoPor);
    }
    return { ordemId: ordem.id, valorTotal: total };
  });
}

export const zRegistrarRecebimentoDeOrdemInput = z.object({
  ordemId: z.string().min(1),
  data: z.coerce.date(),
  notaFiscal: z.string().trim().max(60).optional(),
  documentoFiscalId: z.string().min(1).optional(),
  responsavelRecebimento: z.string().trim().min(3),
  itens: z
    .array(
      z.object({
        itemDeOrdemId: z.string().min(1),
        quantidade: zQuantidade,
        /** O movimento físico de estoque que este recebimento gerou, quando gerou. */
        movimentoFisicoId: z.string().min(1).optional(),
      })
    )
    .min(1, "um recebimento sem item não recebe nada"),
  criadoPor: z.string().min(1),
});
export type RegistrarRecebimentoDeOrdemInput = z.input<
  typeof zRegistrarRecebimentoDeOrdemInput
>;

/**
 * TR 5.17.105 — o recebimento, que é o que baixa o saldo pendente.
 *
 * ⚠️ RECEBER ALÉM DO PEDIDO RECUSA. O saldo pendente é `quantidade − Σ(recebido)`, e um
 * saldo negativo significaria que o ente aceitou — e vai pagar — mais do que contratou.
 */
export async function registrarRecebimentoDeOrdem(
  prisma: PrismaClient,
  input: RegistrarRecebimentoDeOrdemInput
): Promise<{ readonly recebimentoId: string }> {
  const d = zRegistrarRecebimentoDeOrdemInput.parse(input);

  return prisma.$transaction(async (tx) => {
    const ordem = await tx.ordemDeCompra.findUnique({
      where: { id: d.ordemId },
      select: { id: true, numero: true, fornecedorId: true, ficha: { select: { unidadeOrcId: true } } },
    });
    if (ordem === null) throw new Error(`Ordem de compra ${d.ordemId} não existe.`);
    await autorizarNo(
      tx,
      d.criadoPor,
      ACAO_DO_SERVICO.registrarRecebimentoDeOrdem,
      ordem.ficha === null ? "ENTE" : { ug: ordem.ficha.unidadeOrcId }
    );
    exigirElegivel(elegibilidadeParaReceberOrdem({ numero: ordem.numero, estornada: await ordemEstornada(tx, ordem.id), recebimentos: 0, empenhosVivos: [], itensPendentes: null }));

    let notaFiscal = d.notaFiscal ?? null;
    if (d.documentoFiscalId !== undefined) {
      const doc = await tx.documentoFiscalRecebido.findUnique({
        where: { id: d.documentoFiscalId },
        select: {
          id: true, numero: true, serie: true, emitenteId: true, ordemId: true,
          movimentos: { select: { tipo: true } },
        },
      });
      if (doc === null) throw new Error(`Documento fiscal ${d.documentoFiscalId} não existe.`);
      if (doc.movimentos.some((m) => m.tipo === "CANCELAMENTO" || m.tipo === "SUBSTITUICAO")) {
        throw new Error(`Documento ${doc.numero}/${doc.serie} cancelado ou substituído não lastreia recebimento.`);
      }
      if (doc.ordemId !== null && doc.ordemId !== d.ordemId) {
        throw new Error(`O documento ${doc.numero}/${doc.serie} pertence a outra ordem.`);
      }
      if (doc.emitenteId !== ordem.fornecedorId) {
        throw new Error(
          `O emitente do documento ${doc.numero}/${doc.serie} não é o fornecedor da ordem ${ordem.numero}.`
        );
      }
      if (notaFiscal === null) notaFiscal = `${doc.numero}/${doc.serie}`;
    }

    const saldos = await saldoDaOrdemDeCompra(tx, d.ordemId);
    const porItem = new Map(saldos.map((s) => [s.itemId, s]));
    for (const i of d.itens) {
      const saldo = porItem.get(i.itemDeOrdemId);
      if (saldo === undefined) {
        throw new Error(
          `O item ${i.itemDeOrdemId} não pertence à ordem ${ordem.numero}.`
        );
      }
      if (i.quantidade.greaterThan(saldo.pendente)) {
        throw new Error(
          `RECEBIMENTO MAIOR QUE O PEDIDO no item ${i.itemDeOrdemId}: pendente ` +
            `${saldo.pendente.toFixed(4)}, recebendo ${i.quantidade.toFixed(4)}. O ente ` +
            `estaria aceitando — e pagando — mais do que contratou.`
        );
      }
    }

    const r = await tx.recebimentoDeOrdem.create({
      data: {
        ordemId: d.ordemId, data: d.data, notaFiscal,
        documentoFiscalId: d.documentoFiscalId ?? null,
        responsavelRecebimento: d.responsavelRecebimento, criadoPor: d.criadoPor,
        itens: {
          create: d.itens.map((i) => ({
            itemDeOrdemId: i.itemDeOrdemId,
            quantidade: i.quantidade.toFixed(4),
            movimentoFisicoId: i.movimentoFisicoId ?? null,
            criadoPor: d.criadoPor,
          })),
        },
      },
      select: { id: true },
    });
    return { recebimentoId: r.id };
  });
}

export const zEstornarOrdemDeCompraInput = z.object({
  ordemId: z.string().min(1),
  motivo: zMotivo,
  criadoPor: z.string().min(1),
});
export type EstornarOrdemDeCompraInput = z.input<typeof zEstornarOrdemDeCompraInput>;

/**
 * TR 5.17.99 e 5.17.100 — a decisão D12, e ela é FAIL-CLOSED NOS DOIS SENTIDOS.
 *
 * ⚠️ A CLÁUSULA FIXA A DIREÇÃO DA CASCATA, e ela é o oposto do intuitivo: quem manda é o
 * EMPENHO. Uma ordem empenhada NÃO pode ser estornada por si — fazê-lo deixaria o empenho
 * vivo apontando para uma compra que não existe mais, e a dotação continuaria
 * comprometida.
 *
 * ⚠️ E ORDEM COM RECEBIMENTO TAMBÉM RECUSA: o material já entrou. Desfazer a ordem
 * deixaria a prateleira com material que nenhum documento explica.
 */
export async function estornarOrdemDeCompra(
  prisma: PrismaClient,
  input: EstornarOrdemDeCompraInput
): Promise<{ readonly ordemId: string; readonly itensEstornados: number }> {
  const d = zEstornarOrdemDeCompraInput.parse(input);

  return prisma.$transaction(async (tx) => {
    const ordem = await tx.ordemDeCompra.findUnique({
      where: { id: d.ordemId },
      select: {
        id: true, numero: true, fichaId: true,
        ficha: { select: { unidadeOrcId: true } },
        itens: { select: { id: true } },
        recebimentos: { select: { id: true, data: true } },
        empenhos: {
          select: { id: true, numero: true, estornoDeId: true, anulacaoParcialDeId: true, estornos: { select: { id: true } } },
        },
      },
    });
    if (ordem === null) throw new Error(`Ordem de compra ${d.ordemId} não existe.`);
    await autorizarNo(
      tx,
      d.criadoPor,
      ACAO_DO_SERVICO.estornarOrdemDeCompra,
      ordem.ficha === null ? "ENTE" : { ug: ordem.ficha.unidadeOrcId }
    );

    // V6.2 U0 — o MESMO predicado que a barra de ações projeta. TR 5.17.100: o EMPENHO manda —
    // ordem empenhada só se estorna pelo estorno do empenho. E o estorno é FATO, não DELETE (V6 P1.1).
    exigirElegivel(elegibilidadeParaEstornarOrdem({
      numero: ordem.numero,
      estornada: await ordemEstornada(tx, ordem.id),
      recebimentos: ordem.recebimentos.length,
      empenhosVivos: ordem.empenhos.filter((e) => e.estornoDeId === null && e.anulacaoParcialDeId === null && e.estornos.length === 0).map((e) => e.numero),
      itensPendentes: null,
    }));
    const agora = new Date();
    await tx.movimentoDaOrdemDeCompra.create({
      data: { ordemId: ordem.id, tipo: "ESTORNO", data: agora, motivo: d.motivo, criadoPor: d.criadoPor },
    });
    // As solicitações que esta ordem atendia recebem o movimento INFORMATIVO: as parcelas voltam a pendente.
    const parcelas = await tx.alocacaoDeSolicitacaoNaOrdem.findMany({
      where: { itemDeOrdem: { ordemId: ordem.id }, estornoDeId: null, estorno: null },
      select: { quantidade: true, itemDeSolicitacao: { select: { solicitacaoId: true, material: { select: { codigo: true } } } } },
    });
    const porSolicitacao = new Map<string, string[]>();
    for (const p of parcelas) {
      const lista = porSolicitacao.get(p.itemDeSolicitacao.solicitacaoId) ?? [];
      lista.push(`${p.itemDeSolicitacao.material.codigo}: ${p.quantidade.toFixed(4)}`);
      porSolicitacao.set(p.itemDeSolicitacao.solicitacaoId, lista);
    }
    for (const [solicitacaoId, linhas] of porSolicitacao) {
      await tx.movimentoDaSolicitacao.create({
        data: {
          solicitacaoId, tipo: "ORDEM_ESTORNADA", data: agora,
          motivo: `Ordem ${ordem.numero} estornada (${d.motivo}); voltam a pendente: ${linhas.join(" · ")}`,
          criadoPor: d.criadoPor,
        },
      });
    }
    return { ordemId: ordem.id, itensEstornados: ordem.itens.length };
  });
}
