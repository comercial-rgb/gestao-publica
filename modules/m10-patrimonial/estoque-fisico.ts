import { z } from "zod";
import { randomUUID } from "node:crypto";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import { travar } from "../../packages/locks/index.js";
import {
  competenciaCivil,
  diaCivil,
  meioDiaCivil,
  somarDiasCivis,
} from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { registrarSaidaConsumoNaTx } from "./almoxarifado.js";
import {
  SINAL_MOVIMENTO_FISICO,
  TIPO_DO_ESTORNO_FISICO,
  bloqueiosAplicaveis,
  bloqueiosDoInventario,
  consumoNaCompetencia,
  converterParaEstoque,
  posicaoDeEstoque,
  precoMedioDaPosicao,
  saldoNaoAtendido,
  validadeDoEstoque,
  type TipoMovimentoFisicoEstoque,
} from "./estoque-fisico-dominio.js";

/**
 * M10 — ALMOXARIFADO, EIXO FÍSICO: OS CASOS DE USO (TR 5.18).
 *
 * ═══ ⚠️ O QUE ESTE ARQUIVO ACRESCENTA, E O QUE ELE NÃO TOCA ═══
 * O razão do almoxarifado continua **sintético por classe**, e a entrada continua sendo
 * contabilizada pelo M05 (pela liquidação). Nada disso mudou. O que faltava era a
 * QUANTIDADE — o censo do ENT03c mostrou que o M10 movia valor por classe, e a seção
 * 5.18 pergunta por material em depósito.
 *
 * ═══ ⚠️ A SAÍDA MOVE OS DOIS EIXOS NA MESMA TRANSAÇÃO ═══
 * `registrarSaidaFisica` grava o movimento físico E chama o composável contábil, que é o
 * MESMO código que `registrarSaidaConsumo` sempre usou. Se fossem duas transações, uma
 * falha entre elas deixaria os eixos divergentes — e o
 * `conferirAlmoxarifadoContraRazao` acusaria um defeito que ninguém cometeu.
 *
 * ═══ ⚠️ ORDEM DOS LOCKS ═══
 * `ClasseDeMaterial` (posto 11) SEMPRE antes de `PosicaoFisicaDeEstoque` (posto 21).
 * A inversão está documentada no cabeçalho de `registrarSaidaConsumoNaTx`.
 */

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

const zQuantidadePositiva = z
  .union([z.string(), z.number(), z.instanceof(Object)])
  .transform((v) => toMoney(v as never))
  .refine((v) => v.greaterThan(0), {
    message:
      "quantidade tem de ser > 0 — o sinal vem do TIPO do movimento, nunca de um " +
      "número negativo escondendo uma saída",
  });

const zMotivo = z
  .string()
  .trim()
  .min(5, "o motivo é o que explica o fato a quem auditar; cinco letras é o mínimo");

/** A chave do lock físico: travar o material inteiro serializaria depósitos alheios. */
function chaveDaPosicao(materialId: string, depositoId: string): string {
  return `${materialId}:${depositoId}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// LEITURAS DERIVADAS — nenhuma coluna de saldo (decisão D1)
// ═══════════════════════════════════════════════════════════════════════════

async function movimentosDa(
  tx: Tx,
  materialId: string,
  depositoId: string
): Promise<
  readonly {
    tipo: TipoMovimentoFisicoEstoque;
    quantidade: Money;
    valorTotal: Money;
    dataMovimento: Date;
  }[]
> {
  const ms = await tx.movimentoFisicoDeEstoque.findMany({
    where: { materialId, depositoId },
    select: {
      tipo: true,
      quantidade: true,
      valorTotal: true,
      dataMovimento: true,
    },
  });
  return ms.map((m) => ({
    tipo: m.tipo as TipoMovimentoFisicoEstoque,
    quantidade: toMoney(m.quantidade.toFixed(4)),
    valorTotal: toMoney(m.valorTotal.toFixed(2)),
    dataMovimento: m.dataMovimento,
  }));
}

/**
 * A POSIÇÃO DE UM MATERIAL NUM DEPÓSITO, numa data civil (TR 5.18.3, 5.18.16).
 *
 * `ateDia` ausente = hoje; presente = **naquela data**, que é a pergunta do inventário
 * e da ficha de controle de estoque.
 */
export async function posicaoDoMaterial(
  tx: Tx,
  materialId: string,
  depositoId: string,
  ateDia?: string
): Promise<{ readonly quantidade: Money; readonly valor: Money }> {
  return posicaoDeEstoque(await movimentosDa(tx, materialId, depositoId), ateDia);
}

/**
 * A FICHA DE CONTROLE DE ESTOQUE (TR 5.18.16) — movimentações do período **com o saldo
 * ANTERIOR a ele**.
 *
 * ⚠️ É esta cláusula que refuta a coluna de saldo dentro da própria seção: ela pede a
 * posição num ponto do passado, e uma coluna só sabe responder "agora".
 */
export async function fichaDeControleDeEstoque(
  tx: Tx,
  p: {
    readonly materialId: string;
    readonly depositoId: string;
    readonly de: string;
    readonly ate: string;
  }
): Promise<{
  readonly saldoAnterior: { readonly quantidade: Money; readonly valor: Money };
  readonly movimentos: readonly {
    readonly id: string;
    readonly tipo: TipoMovimentoFisicoEstoque;
    readonly quantidade: Money;
    readonly valorUnitario: Money;
    readonly valorTotal: Money;
    readonly dataMovimento: Date;
    readonly motivo: string;
  }[];
  readonly saldoFinal: { readonly quantidade: Money; readonly valor: Money };
}> {
  const todos = await movimentosDa(tx, p.materialId, p.depositoId);
  const anterior = posicaoDeEstoque(todos, diaAnterior(p.de));
  const final = posicaoDeEstoque(todos, p.ate);

  const doPeriodo = await tx.movimentoFisicoDeEstoque.findMany({
    where: { materialId: p.materialId, depositoId: p.depositoId },
    select: {
      id: true,
      tipo: true,
      quantidade: true,
      valorUnitario: true,
      valorTotal: true,
      dataMovimento: true,
      motivo: true,
    },
    orderBy: [{ dataMovimento: "asc" }, { criadoEm: "asc" }],
  });

  return {
    saldoAnterior: anterior,
    saldoFinal: final,
    movimentos: doPeriodo
      .filter((m) => {
        const d = diaCivil(m.dataMovimento);
        return d >= p.de && d <= p.ate;
      })
      .map((m) => ({
        id: m.id,
        tipo: m.tipo as TipoMovimentoFisicoEstoque,
        quantidade: toMoney(m.quantidade.toFixed(4)),
        valorUnitario: toMoney(m.valorUnitario.toFixed(6)),
        valorTotal: toMoney(m.valorTotal.toFixed(2)),
        dataMovimento: m.dataMovimento,
        motivo: m.motivo,
      })),
  };
}

/**
 * O dia civil ANTERIOR a `dia`, em `YYYY-MM-DD` — o corte do "saldo anterior ao período"
 * da TR 5.18.16.
 *
 * ⚠️ ELE USA OS HELPERS CIVIS DO NÚCLEO, e não `Date.UTC` com `dia - 1`. A primeira
 * versão fazia exatamente isso e o `test/data-civil.test.ts` a acusou — com razão: a
 * forma `Date.UTC(` é uma das três que o guard vigia, porque foi assim que o defeito de
 * eixo entrou em 35 arquivos. `somarDiasCivis` resolve a virada de mês e de ano no
 * calendário do ente.
 */
function diaAnterior(dia: string): string {
  return diaCivil(somarDiasCivis(meioDiaCivil(dia), -1));
}

/**
 * OS BLOQUEIOS QUE ALCANÇAM UM PAR MATERIAL×DEPÓSITO NUM DIA (TR 5.18.12 e 5.18.13).
 *
 * ⚠️ O INVENTÁRIO ABERTO ENTRA PELA MESMA PORTA. Converter o inventário num bloqueio faz
 * as duas cláusulas passarem pela MESMA leitura — e uma porta só se prova uma vez.
 */
export async function bloqueiosVigentes(
  tx: Tx,
  materialId: string,
  depositoId: string,
  dia: string
): Promise<readonly { readonly motivo: string }[]> {
  const [bloqueios, inventarios] = await Promise.all([
    tx.bloqueioDeEstoque.findMany({
      where: {
        OR: [{ materialId }, { materialId: null }],
        AND: [{ OR: [{ depositoId }, { depositoId: null }] }],
      },
      select: {
        materialId: true,
        depositoId: true,
        inicio: true,
        fim: true,
        motivo: true,
      },
    }),
    tx.inventarioDeEstoque.findMany({
      where: { depositoId },
      select: { depositoId: true, dataAbertura: true, dataFechamento: true },
    }),
  ]);

  return bloqueiosAplicaveis(
    [...bloqueios, ...bloqueiosDoInventario(inventarios)],
    { materialId, depositoId },
    dia
  );
}

/**
 * ⚠️ O GUARD, e ele é FAIL-CLOSED: bloqueado RECUSA, nomeando o motivo. A 5.18.12 diz
 * "bloqueando as movimentações ... liberando-os apenas após a conclusão" — é uma recusa,
 * não um aviso.
 */
async function exigirNaoBloqueado(
  tx: Tx,
  materialId: string,
  depositoId: string,
  data: Date
): Promise<void> {
  const dia = diaCivil(data);
  const vigentes = await bloqueiosVigentes(tx, materialId, depositoId, dia);
  if (vigentes.length > 0) {
    throw new Error(
      `MOVIMENTAÇÃO BLOQUEADA em ${dia}: ${vigentes.map((b) => b.motivo).join("; ")}. ` +
        `A TR 5.18.12 manda bloquear a movimentação enquanto o inventário corre, e ` +
        `liberá-la só após a conclusão.`
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CADASTROS
// ═══════════════════════════════════════════════════════════════════════════

export const zCadastrarDepositoInput = z.object({
  codigo: z.string().trim().min(1).max(10),
  nome: z.string().trim().min(3),
  unidadeOrcId: z.string().min(1),
  responsavelId: z.string().min(1).optional(),
  criadoPor: z.string().min(1),
});
export type CadastrarDepositoInput = z.input<typeof zCadastrarDepositoInput>;

/** TR 5.18.21 — "os inúmeros almoxarifados/depósitos de forma integrada". */
export async function cadastrarDeposito(
  prisma: PrismaClient,
  input: CadastrarDepositoInput
): Promise<{ readonly depositoId: string }> {
  const d = zCadastrarDepositoInput.parse(input);
  return prisma.$transaction(async (tx) => {
    // O depósito PERTENCE a uma unidade gestora — é ela que a permissão por UG protege.
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarDeposito, {
      ug: d.unidadeOrcId,
    });
    const criado = await tx.deposito.create({
      data: {
        codigo: d.codigo,
        nome: d.nome,
        unidadeOrcId: d.unidadeOrcId,
        responsavelId: d.responsavelId ?? null,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { depositoId: criado.id };
  });
}

export const zCadastrarUnidadeDeMedidaInput = z.object({
  sigla: z.string().trim().min(1).max(10),
  descricao: z.string().trim().min(2),
  criadoPor: z.string().min(1),
});
export type CadastrarUnidadeDeMedidaInput = z.input<
  typeof zCadastrarUnidadeDeMedidaInput
>;

export async function cadastrarUnidadeDeMedida(
  prisma: PrismaClient,
  input: CadastrarUnidadeDeMedidaInput
): Promise<{ readonly unidadeDeMedidaId: string }> {
  const d = zCadastrarUnidadeDeMedidaInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(
      tx,
      d.criadoPor,
      ACAO_DO_SERVICO.cadastrarUnidadeDeMedida,
      "ENTE"
    );
    const criada = await tx.unidadeDeMedida.create({
      data: { sigla: d.sigla, descricao: d.descricao, criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { unidadeDeMedidaId: criada.id };
  });
}

export const zCadastrarGrupoDeMaterialInput = z.object({
  codigo: z.string().trim().min(1).max(20),
  descricao: z.string().trim().min(3),
  paiId: z.string().min(1).optional(),
  criadoPor: z.string().min(1),
});
export type CadastrarGrupoDeMaterialInput = z.input<
  typeof zCadastrarGrupoDeMaterialInput
>;

/** TR 5.17.2 — grupo, classe ou subclasse: a MESMA entidade em três níveis. */
export async function cadastrarGrupoDeMaterial(
  prisma: PrismaClient,
  input: CadastrarGrupoDeMaterialInput
): Promise<{ readonly grupoId: string }> {
  const d = zCadastrarGrupoDeMaterialInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(
      tx,
      d.criadoPor,
      ACAO_DO_SERVICO.cadastrarGrupoDeMaterial,
      "ENTE"
    );
    if (d.paiId !== undefined) {
      const pai = await tx.grupoDeMaterial.findUnique({
        where: { id: d.paiId },
        select: { id: true },
      });
      if (pai === null) {
        throw new Error(
          `Grupo pai ${d.paiId} não existe — um grupo órfão desapareceria da árvore ` +
            `sem que ninguém notasse.`
        );
      }
    }
    const criado = await tx.grupoDeMaterial.create({
      data: {
        codigo: d.codigo,
        descricao: d.descricao,
        paiId: d.paiId ?? null,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { grupoId: criado.id };
  });
}

export const zCadastrarMaterialInput = z.object({
  codigo: z.string().trim().min(1).max(20),
  descricaoSucinta: z.string().trim().min(3),
  descricaoDetalhada: z.string().trim().min(3),
  grupoId: z.string().min(1),
  classificacao: z.enum(["CONSUMO", "PERMANENTE", "SERVICO", "OBRA"]),
  categoria: z.enum(["PERECIVEL", "NAO_PERECIVEL", "ESTOCAVEL", "COMBUSTIVEL"]),
  catmat: z.string().trim().max(20).optional(),
  classeDeMaterialId: z.string().min(1),
  controlaLote: z.boolean().default(false),
  /** ⚠️ N-N desde o dia 1 — decisão D6. Exatamente UMA com `ehDeEstoque`. */
  unidades: z
    .array(
      z.object({
        unidadeDeMedidaId: z.string().min(1),
        fatorParaEstoque: z.union([z.string(), z.number()]),
        ehDeEstoque: z.boolean(),
      })
    )
    .min(1, "um material sem unidade de medida não tem como ter saldo"),
  criadoPor: z.string().min(1),
});
export type CadastrarMaterialInput = z.input<typeof zCadastrarMaterialInput>;

/**
 * TR 5.17.2, 5.17.3, 5.17.6, 5.17.8 — o cadastro de material.
 *
 * ⚠️ A REGRA DA UNIDADE DE ESTOQUE É FAIL-CLOSED, e é o que torna a N-N aritmética em
 * vez de decorativa: sem exatamente uma unidade de estoque, "3 caixas" e "36 unidades"
 * voltariam a ser dois números somáveis e sem sentido.
 */
export async function cadastrarMaterial(
  prisma: PrismaClient,
  input: CadastrarMaterialInput
): Promise<{ readonly materialId: string }> {
  const d = zCadastrarMaterialInput.parse(input);

  const deEstoque = d.unidades.filter((u) => u.ehDeEstoque);
  if (deEstoque.length !== 1) {
    throw new Error(
      `O material ${d.codigo} declarou ${deEstoque.length} unidades de ESTOQUE, e tem ` +
        `de declarar exatamente 1. É ela que dá sentido ao saldo: sem uma unidade ` +
        `canônica, somar "3 caixas" com "36 unidades" produz um número sem significado.`
    );
  }
  const canonica = deEstoque[0];
  if (canonica !== undefined && toMoney(canonica.fatorParaEstoque).toFixed(6) !== "1.000000") {
    throw new Error(
      `A unidade de ESTOQUE do material ${d.codigo} tem fator ` +
        `${toMoney(canonica.fatorParaEstoque).toString()}, e tem de ter 1: ela é a ` +
        `própria unidade em que o saldo é contado. Um fator diferente de 1 aqui ` +
        `multiplicaria o saldo por si mesmo.`
    );
  }

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarMaterial, "ENTE");

    const classe = await tx.classeDeMaterial.findUnique({
      where: { id: d.classeDeMaterialId },
      select: { id: true, ativa: true, codigo: true },
    });
    if (classe === null || !classe.ativa) {
      throw new Error(
        `Classe de material ${d.classeDeMaterialId} não existe ou está inativa — é ela ` +
          `que liga a quantidade física à conta do PCASP, e sem ela o material não ` +
          `teria como chegar ao razão.`
      );
    }

    const criado = await tx.material.create({
      data: {
        codigo: d.codigo,
        descricaoSucinta: d.descricaoSucinta,
        descricaoDetalhada: d.descricaoDetalhada,
        grupoId: d.grupoId,
        classificacao: d.classificacao,
        categoria: d.categoria,
        catmat: d.catmat ?? null,
        classeDeMaterialId: d.classeDeMaterialId,
        controlaLote: d.controlaLote,
        criadoPor: d.criadoPor,
        unidades: {
          create: d.unidades.map((u) => ({
            unidadeDeMedidaId: u.unidadeDeMedidaId,
            fatorParaEstoque: toMoney(u.fatorParaEstoque).toFixed(6),
            ehDeEstoque: u.ehDeEstoque,
            criadoPor: d.criadoPor,
          })),
        },
      },
      select: { id: true },
    });
    return { materialId: criado.id };
  });
}

export const zDefinirParametroDeEstoqueInput = z.object({
  materialId: z.string().min(1),
  depositoId: z.string().min(1),
  quantidadeMinima: z.union([z.string(), z.number()]).optional(),
  quantidadeMaxima: z.union([z.string(), z.number()]).optional(),
  criadoPor: z.string().min(1),
});
export type DefinirParametroDeEstoqueInput = z.input<
  typeof zDefinirParametroDeEstoqueInput
>;

/** TR 5.18.3 — o mínimo é POR MATERIAL E POR DEPÓSITO. */
export async function definirParametroDeEstoque(
  prisma: PrismaClient,
  input: DefinirParametroDeEstoqueInput
): Promise<{ readonly parametroId: string }> {
  const d = zDefinirParametroDeEstoqueInput.parse(input);
  const minimo = d.quantidadeMinima === undefined ? null : toMoney(d.quantidadeMinima);
  const maximo = d.quantidadeMaxima === undefined ? null : toMoney(d.quantidadeMaxima);
  if (minimo !== null && maximo !== null && minimo.greaterThan(maximo)) {
    throw new Error(
      `Mínimo ${minimo.toFixed(4)} maior que o máximo ${maximo.toFixed(4)}: a faixa ` +
        `ficaria vazia, e todo saldo estaria simultaneamente abaixo e acima dela.`
    );
  }

  return prisma.$transaction(async (tx) => {
    const dep = await exigirDeposito(tx, d.depositoId);
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.definirParametroDeEstoque, {
      ug: dep.unidadeOrcId,
    });
    const salvo = await tx.parametroDeEstoque.upsert({
      where: {
        materialId_depositoId: { materialId: d.materialId, depositoId: d.depositoId },
      },
      create: {
        materialId: d.materialId,
        depositoId: d.depositoId,
        quantidadeMinima: minimo === null ? null : minimo.toFixed(4),
        quantidadeMaxima: maximo === null ? null : maximo.toFixed(4),
        criadoPor: d.criadoPor,
      },
      update: {
        quantidadeMinima: minimo === null ? null : minimo.toFixed(4),
        quantidadeMaxima: maximo === null ? null : maximo.toFixed(4),
      },
      select: { id: true },
    });
    return { parametroId: salvo.id };
  });
}

async function exigirDeposito(
  tx: Tx,
  id: string
): Promise<{ readonly id: string; readonly unidadeOrcId: string; readonly codigo: string }> {
  const dep = await tx.deposito.findUnique({
    where: { id },
    select: { id: true, unidadeOrcId: true, codigo: true, ativo: true },
  });
  if (dep === null || !dep.ativo) {
    throw new Error(
      `Depósito ${id} não existe ou está inativo — não se movimenta estoque num ` +
        `depósito que o ente desativou.`
    );
  }
  return { id: dep.id, unidadeOrcId: dep.unidadeOrcId, codigo: dep.codigo };
}

async function exigirMaterial(
  tx: Tx,
  id: string
): Promise<{
  readonly id: string;
  readonly codigo: string;
  readonly classeDeMaterialId: string;
  readonly controlaLote: boolean;
}> {
  const mat = await tx.material.findUnique({
    where: { id },
    select: {
      id: true,
      codigo: true,
      classeDeMaterialId: true,
      controlaLote: true,
      ativo: true,
    },
  });
  if (mat === null || !mat.ativo) {
    throw new Error(
      `Material ${id} não existe ou está desabilitado — a TR 5.17.8 manda manter o ` +
        `histórico do material obsoleto, e impedir o uso NOVO dele.`
    );
  }
  return {
    id: mat.id,
    codigo: mat.codigo,
    classeDeMaterialId: mat.classeDeMaterialId,
    controlaLote: mat.controlaLote,
  };
}

/** O fator de conversão declarado para aquela unidade, ou a recusa nomeada. */
async function fatorDaUnidade(
  tx: Tx,
  materialId: string,
  unidadeDeMedidaId: string | undefined
): Promise<Money> {
  if (unidadeDeMedidaId === undefined) {
    const canonica = await tx.materialUnidade.findFirst({
      where: { materialId, ehDeEstoque: true },
      select: { fatorParaEstoque: true },
    });
    if (canonica === null) {
      throw new Error(
        `Material ${materialId} não tem unidade de ESTOQUE declarada — sem ela o saldo ` +
          `não tem em que unidade ser contado.`
      );
    }
    return toMoney(canonica.fatorParaEstoque.toFixed(6));
  }
  const rel = await tx.materialUnidade.findUnique({
    where: { materialId_unidadeDeMedidaId: { materialId, unidadeDeMedidaId } },
    select: { fatorParaEstoque: true },
  });
  if (rel === null) {
    throw new Error(
      `A unidade ${unidadeDeMedidaId} não está relacionada ao material ${materialId}. ` +
        `A TR 5.17.2 manda relacionar as unidades no cadastro, e mover numa unidade ` +
        `não relacionada seria inventar o fator de conversão.`
    );
  }
  return toMoney(rel.fatorParaEstoque.toFixed(6));
}

// ═══════════════════════════════════════════════════════════════════════════
// OS MOVIMENTOS
// ═══════════════════════════════════════════════════════════════════════════

export const zRegistrarEntradaFisicaInput = z.object({
  materialId: z.string().min(1),
  depositoId: z.string().min(1),
  /** Quando ausente, a quantidade já vem na unidade de estoque. */
  unidadeDeMedidaId: z.string().min(1).optional(),
  quantidade: zQuantidadePositiva,
  valorUnitario: z.union([z.string(), z.number()]),
  dataMovimento: z.coerce.date(),
  loteIdentificacao: z.string().trim().max(60).optional(),
  loteValidade: z.coerce.date().optional(),
  /** O movimento CONTÁBIL que esta entrada acompanha (quando houver). */
  movimentoAlmoxarifadoId: z.string().min(1).optional(),
  motivo: zMotivo,
  criadoPor: z.string().min(1),
});
export type RegistrarEntradaFisicaInput = z.input<typeof zRegistrarEntradaFisicaInput>;

/**
 * ENTRADA FÍSICA (TR 5.18.1, 5.18.7).
 *
 * ⚠️ ELA NÃO CONTABILIZA NADA, e isso é o ponto. Quem contabiliza a entrada é o M05,
 * pela liquidação — debitar o estoque aqui o debitaria DUAS VEZES. O `movimentoAlmoxarifadoId`
 * é a AMARRAÇÃO com o lançamento que já existe, não um segundo lançamento.
 */
export async function registrarEntradaFisica(
  prisma: PrismaClient,
  input: RegistrarEntradaFisicaInput
): Promise<{ readonly movimentoId: string }> {
  const d = zRegistrarEntradaFisicaInput.parse(input);

  return prisma.$transaction(async (tx) => {
    const dep = await exigirDeposito(tx, d.depositoId);
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarEntradaFisica, {
      ug: dep.unidadeOrcId,
    });

    const mat = await exigirMaterial(tx, d.materialId);
    await travar(tx, "PosicaoFisicaDeEstoque", [
      chaveDaPosicao(d.materialId, d.depositoId),
    ]);
    await exigirNaoBloqueado(tx, d.materialId, d.depositoId, d.dataMovimento);

    if (mat.controlaLote && d.loteIdentificacao === undefined) {
      throw new Error(
        `O material ${mat.codigo} controla LOTE, e a entrada não informou nenhum. Sem ` +
          `lote não há como responder à 5.18.14 (o que vence em 30 dias) nem à 5.18.20 ` +
          `(o relatório de validade).`
      );
    }

    const loteId = await resolverLote(tx, {
      materialId: d.materialId,
      depositoId: d.depositoId,
      identificacao: d.loteIdentificacao,
      validade: d.loteValidade,
      criadoPor: d.criadoPor,
    });

    const fator = await fatorDaUnidade(tx, d.materialId, d.unidadeDeMedidaId);
    const quantidade = converterParaEstoque(d.quantidade, fator);
    // O preço unitário vem NA UNIDADE DECLARADA; convertido para a de estoque ele se
    // divide pelo mesmo fator, senão o valor total dobraria junto com a quantidade.
    const unitario = toMoney(d.valorUnitario).dividedBy(fator).toDecimalPlaces(6);
    const total = quantidade.times(unitario).toDecimalPlaces(2);

    if (d.movimentoAlmoxarifadoId !== undefined) {
      await exigirCoerenciaComOContabil(tx, {
        movimentoAlmoxarifadoId: d.movimentoAlmoxarifadoId,
        classeDeMaterialId: mat.classeDeMaterialId,
        valorNovo: total,
      });
    }

    const criado = await tx.movimentoFisicoDeEstoque.create({
      data: {
        materialId: d.materialId,
        depositoId: d.depositoId,
        loteId,
        tipo: "ENTRADA",
        quantidade: quantidade.toFixed(4),
        valorUnitario: unitario.toFixed(6),
        valorTotal: total.toFixed(2),
        dataMovimento: d.dataMovimento,
        movimentoAlmoxarifadoId: d.movimentoAlmoxarifadoId ?? null,
        motivo: d.motivo,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { movimentoId: criado.id };
  });
}

/**
 * ⚠️ A AMARRAÇÃO COM O EIXO CONTÁBIL, conferida na escrita.
 *
 * Σ dos movimentos físicos presos a um movimento contábil NÃO PODE PASSAR do valor dele.
 * É a mesma guarda da liquidação contra as entradas por classe — e é ela que impede o
 * eixo físico de inflar o estoque que o razão registrou.
 */
async function exigirCoerenciaComOContabil(
  tx: Tx,
  p: {
    readonly movimentoAlmoxarifadoId: string;
    readonly classeDeMaterialId: string;
    readonly valorNovo: Money;
  }
): Promise<void> {
  const contabil = await tx.movimentoAlmoxarifado.findUnique({
    where: { id: p.movimentoAlmoxarifadoId },
    select: { id: true, classeDeMaterialId: true, valor: true },
  });
  if (contabil === null) {
    throw new Error(
      `Movimento contábil ${p.movimentoAlmoxarifadoId} não existe — a amarração entre ` +
        `os dois eixos apontaria para o vazio.`
    );
  }
  if (contabil.classeDeMaterialId !== p.classeDeMaterialId) {
    throw new Error(
      `O movimento contábil é da classe ${contabil.classeDeMaterialId} e o material é ` +
        `da classe ${p.classeDeMaterialId}. Amarrar eixos de classes diferentes faria ` +
        `a quantidade de uma conta responder pelo saldo de outra.`
    );
  }

  const presos = await tx.movimentoFisicoDeEstoque.findMany({
    where: { movimentoAlmoxarifadoId: p.movimentoAlmoxarifadoId },
    select: { valorTotal: true, tipo: true },
  });
  let ja = toMoney("0");
  for (const m of presos) {
    ja = ja.plus(
      toMoney(m.valorTotal.toFixed(2)).times(
        SINAL_MOVIMENTO_FISICO[m.tipo as TipoMovimentoFisicoEstoque]
      )
    );
  }
  const total = ja.plus(p.valorNovo);
  const teto = toMoney(contabil.valor.toFixed(2));
  if (total.greaterThan(teto)) {
    throw new Error(
      `A soma dos movimentos físicos presos ao contábil ${contabil.id} chegaria a ` +
        `${total.toFixed(2)} e o contábil vale ${teto.toFixed(2)}. O eixo físico não ` +
        `pode inflar o estoque que o razão registrou — é a mesma guarda que a ` +
        `liquidação já impõe às entradas por classe.`
    );
  }
}

async function resolverLote(
  tx: Tx,
  p: {
    readonly materialId: string;
    readonly depositoId: string;
    readonly identificacao: string | undefined;
    readonly validade: Date | undefined;
    readonly criadoPor: string;
  }
): Promise<string | null> {
  if (p.identificacao === undefined) return null;
  const existente = await tx.loteDeMaterial.findUnique({
    where: {
      materialId_depositoId_identificacao: {
        materialId: p.materialId,
        depositoId: p.depositoId,
        identificacao: p.identificacao,
      },
    },
    select: { id: true },
  });
  if (existente !== null) return existente.id;
  const criado = await tx.loteDeMaterial.create({
    data: {
      materialId: p.materialId,
      depositoId: p.depositoId,
      identificacao: p.identificacao,
      validade: p.validade ?? null,
      criadoPor: p.criadoPor,
    },
    select: { id: true },
  });
  return criado.id;
}

/**
 * O LOTE EXISTE, É DESTE MATERIAL E DESTE DEPÓSITO, E TEM SALDO.
 *
 * ⚠️ As três conferências juntas, porque as três falham em silêncio de formas diferentes:
 * um lote de outro depósito faria o saldo de um sair pelo outro; um lote sem saldo faria
 * a posição por lote ficar negativa enquanto a do material fecha certo.
 */
async function exigirLoteComSaldo(
  tx: Tx,
  p: {
    readonly loteId: string;
    readonly materialId: string;
    readonly depositoId: string;
    readonly quantidade: Money;
    readonly dia: string;
  }
): Promise<void> {
  const lote = await tx.loteDeMaterial.findUnique({
    where: { id: p.loteId },
    select: { id: true, identificacao: true, materialId: true, depositoId: true },
  });
  if (lote === null) throw new Error(`Lote ${p.loteId} não existe.`);
  if (lote.materialId !== p.materialId || lote.depositoId !== p.depositoId) {
    throw new Error(
      `O lote ${lote.identificacao} é de outro material ou de outro depósito. Movimentar ` +
        `por ele faria o saldo de um depósito sair pelo outro.`
    );
  }

  const ms = await tx.movimentoFisicoDeEstoque.findMany({
    where: { loteId: p.loteId },
    select: { tipo: true, quantidade: true, valorTotal: true, dataMovimento: true },
  });
  const posicao = posicaoDeEstoque(
    ms.map((m) => ({
      tipo: m.tipo as TipoMovimentoFisicoEstoque,
      quantidade: toMoney(m.quantidade.toFixed(4)),
      valorTotal: toMoney(m.valorTotal.toFixed(2)),
      dataMovimento: m.dataMovimento,
    })),
    p.dia
  );
  if (p.quantidade.greaterThan(posicao.quantidade)) {
    throw new Error(
      `SAÍDA MAIOR QUE O SALDO DO LOTE ${lote.identificacao} em ${p.dia}: sair com ` +
        `${p.quantidade.toFixed(4)} deixaria o lote NEGATIVO — há ` +
        `${posicao.quantidade.toFixed(4)}.`
    );
  }
}

export const zRegistrarSaidaFisicaInput = z.object({
  materialId: z.string().min(1),
  depositoId: z.string().min(1),
  unidadeDeMedidaId: z.string().min(1).optional(),
  quantidade: zQuantidadePositiva,
  dataMovimento: z.coerce.date(),
  /** TR 5.18.10 — o centro de custo que consumiu. */
  setorId: z.string().min(1).optional(),
  /** TR 5.18.9 — o item de requisição que esta saída atende (atendimento parcial). */
  itemDeRequisicaoId: z.string().min(1).optional(),
  loteId: z.string().min(1).optional(),
  motivo: zMotivo,
  criadoPor: z.string().min(1),
});
export type RegistrarSaidaFisicaInput = z.input<typeof zRegistrarSaidaFisicaInput>;

/**
 * SAÍDA FÍSICA POR CONSUMO — os DOIS eixos, na MESMA transação (TR 5.18.1, 5.18.11).
 *
 * ⚠️ É AQUI QUE A DECISÃO D2 VIRA DINHEIRO. O preço médio é calculado sobre a janela até
 * a data do fato e **gravado no movimento**, porque é ele que foi lançado. O valor
 * contábil da saída é quantidade × esse preço — e é o MESMO número nos dois eixos, por
 * construção, não por conferência posterior.
 */
export async function registrarSaidaFisica(
  prisma: PrismaClient,
  input: RegistrarSaidaFisicaInput
): Promise<{
  readonly movimentoId: string;
  readonly movimentoContabilId: string;
  readonly lancamentoId: string;
  readonly valorUnitario: Money;
}> {
  const d = zRegistrarSaidaFisicaInput.parse(input);

  return prisma.$transaction(async (tx) => {
    const dep = await exigirDeposito(tx, d.depositoId);
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarSaidaFisica, {
      ug: dep.unidadeOrcId,
    });

    const mat = await exigirMaterial(tx, d.materialId);

    // ⚠️ ORDEM: classe (posto 11) ANTES da posição física (posto 21). O composável
    // contábil não trava — quem trava é este caso de uso. Ver almoxarifado.ts.
    await travar(tx, "ClasseDeMaterial", [mat.classeDeMaterialId]);
    await travar(tx, "PosicaoFisicaDeEstoque", [
      chaveDaPosicao(d.materialId, d.depositoId),
    ]);
    await exigirNaoBloqueado(tx, d.materialId, d.depositoId, d.dataMovimento);

    const fator = await fatorDaUnidade(tx, d.materialId, d.unidadeDeMedidaId);
    const quantidade = converterParaEstoque(d.quantidade, fator);

    // ⚠️ MATERIAL QUE CONTROLA LOTE EXIGE LOTE NA SAÍDA, E ISSO FOI UM DEFEITO REAL.
    //
    // A primeira versão só exigia lote na ENTRADA. O teste de validade pegou: consumi
    // um lote inteiro de dipirona e ele continuou aparecendo em "a vencer", porque a
    // saída não apontava para lote nenhum e a posição POR LOTE nunca baixava.
    //
    // O efeito real: o relatório da 5.18.20 mandaria alguém procurar na prateleira um
    // medicamento que já foi distribuído — e, pior, esconderia que o lote que AINDA está
    // lá é outro, com outra validade.
    if (mat.controlaLote && d.loteId === undefined) {
      throw new Error(
        `O material ${mat.codigo} controla LOTE, e a saída não informou de qual. Sem isso ` +
          `a posição por lote não baixa, e o controle de validade (TR 5.18.14 e 5.18.20) ` +
          `passa a apontar lote que já saiu da prateleira.`
      );
    }
    if (d.loteId !== undefined) {
      await exigirLoteComSaldo(tx, {
        loteId: d.loteId,
        materialId: d.materialId,
        depositoId: d.depositoId,
        quantidade,
        dia: diaCivil(d.dataMovimento),
      });
    }

    const dia = diaCivil(d.dataMovimento);
    const posicao = posicaoDeEstoque(
      await movimentosDa(tx, d.materialId, d.depositoId),
      dia
    );
    if (quantidade.greaterThan(posicao.quantidade)) {
      throw new Error(
        `SAÍDA MAIOR QUE O ESTOQUE FÍSICO do material ${mat.codigo} no depósito ` +
          `${dep.codigo} em ${dia}: sair com ${quantidade.toFixed(4)} deixaria a ` +
          `posição NEGATIVA — há ${posicao.quantidade.toFixed(4)}. Não se entrega o ` +
          `que não há na prateleira.`
      );
    }

    // Decisão D2: derivado da MESMA janela, e gravado porque é fato.
    const unitario = precoMedioDaPosicao(posicao);
    const total = quantidade.times(unitario).toDecimalPlaces(2);

    if (d.setorId !== undefined) {
      await exigirCotaDisponivel(tx, {
        setorId: d.setorId,
        materialId: d.materialId,
        competencia: competenciaCivil(d.dataMovimento),
        quantidade,
      });
    }
    if (d.itemDeRequisicaoId !== undefined) {
      await exigirSaldoDoItem(tx, d.itemDeRequisicaoId, quantidade);
    }

    // ⚠️ O EIXO CONTÁBIL, no MESMO `tx`. Uma falha aqui desfaz a física junto.
    const contabil = await registrarSaidaConsumoNaTx(tx, {
      classeDeMaterialId: mat.classeDeMaterialId,
      valor: total,
      dataMovimento: d.dataMovimento,
      motivo: d.motivo,
      criadoPor: d.criadoPor,
    });

    const criado = await tx.movimentoFisicoDeEstoque.create({
      data: {
        materialId: d.materialId,
        depositoId: d.depositoId,
        loteId: d.loteId ?? null,
        tipo: "SAIDA",
        quantidade: quantidade.toFixed(4),
        valorUnitario: unitario.toFixed(6),
        valorTotal: total.toFixed(2),
        dataMovimento: d.dataMovimento,
        setorId: d.setorId ?? null,
        itemDeRequisicaoId: d.itemDeRequisicaoId ?? null,
        movimentoAlmoxarifadoId: contabil.movimentoId,
        motivo: d.motivo,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });

    return {
      movimentoId: criado.id,
      movimentoContabilId: contabil.movimentoId,
      lancamentoId: contabil.lancamentoId,
      valorUnitario: unitario,
    };
  });
}

/** TR 5.18.4 — a cota é MENSAL, por setor e material, e recusa quando estoura. */
async function exigirCotaDisponivel(
  tx: Tx,
  p: {
    readonly setorId: string;
    readonly materialId: string;
    readonly competencia: string;
    readonly quantidade: Money;
  }
): Promise<void> {
  const cota = await tx.cotaDeConsumo.findUnique({
    where: {
      setorId_materialId_competencia: {
        setorId: p.setorId,
        materialId: p.materialId,
        competencia: p.competencia,
      },
    },
    select: { quantidadeLimite: true },
  });
  // Sem cota definida NÃO é cota zero: é ausência de limite. Tratar ausência como zero
  // travaria todo o almoxarifado no dia em que a tabela nascesse vazia.
  if (cota === null) return;

  const consumos = await tx.movimentoFisicoDeEstoque.findMany({
    where: { setorId: p.setorId, materialId: p.materialId },
    select: { tipo: true, quantidade: true, dataMovimento: true },
  });
  const ja = consumoNaCompetencia(
    consumos.map((c) => ({
      tipo: c.tipo as TipoMovimentoFisicoEstoque,
      quantidade: toMoney(c.quantidade.toFixed(4)),
      dataMovimento: c.dataMovimento,
    })),
    p.competencia
  );
  const limite = toMoney(cota.quantidadeLimite.toFixed(4));
  if (ja.plus(p.quantidade).greaterThan(limite)) {
    throw new Error(
      `COTA MENSAL ESTOURADA em ${p.competencia}: o setor já consumiu ` +
        `${ja.toFixed(4)} e pede mais ${p.quantidade.toFixed(4)}, contra um limite de ` +
        `${limite.toFixed(4)}. A TR 5.18.4 manda delimitar a quantidade que cada ` +
        `departamento pode requisitar por mês.`
    );
  }
}

/** TR 5.18.9 — atender além do solicitado seria entregar o que ninguém pediu. */
async function exigirSaldoDoItem(
  tx: Tx,
  itemDeRequisicaoId: string,
  quantidade: Money
): Promise<void> {
  const item = await tx.itemDeRequisicaoDeMaterial.findUnique({
    where: { id: itemDeRequisicaoId },
    select: {
      quantidadeSolicitada: true,
      atendimentos: { select: { tipo: true, quantidade: true } },
    },
  });
  if (item === null) {
    throw new Error(`Item de requisição ${itemDeRequisicaoId} não existe.`);
  }
  const saldo = saldoNaoAtendido(
    toMoney(item.quantidadeSolicitada.toFixed(4)),
    item.atendimentos.map((a) => ({
      tipo: a.tipo as TipoMovimentoFisicoEstoque,
      quantidade: toMoney(a.quantidade.toFixed(4)),
    }))
  );
  if (quantidade.greaterThan(saldo)) {
    throw new Error(
      `ATENDIMENTO MAIOR QUE O PEDIDO: o item tem saldo de ${saldo.toFixed(4)} e a ` +
        `saída é de ${quantidade.toFixed(4)}. A TR 5.18.9 pede atendimento parcial com ` +
        `controle do saldo NÃO ATENDIDO — e ele não pode ficar negativo.`
    );
  }
}

export const zEstornarMovimentoFisicoInput = z.object({
  movimentoId: z.string().min(1),
  dataMovimento: z.coerce.date(),
  motivo: zMotivo,
  criadoPor: z.string().min(1),
});
export type EstornarMovimentoFisicoInput = z.input<
  typeof zEstornarMovimentoFisicoInput
>;

/**
 * ESTORNO — APPEND-ONLY: fato novo referenciando o original, nunca UPDATE.
 *
 * ⚠️ ELE NÃO ESTORNA O EIXO CONTÁBIL JUNTO, e isso é uma DECISÃO com consequência
 * declarada: o estorno contábil tem roteiro próprio e passa pelo funil do M01, que cobra
 * o período aberto. Estorná-lo daqui atravessaria esse controle. Quem estorna o contábil
 * é `estornarMovimentoAlmoxarifado`, e a amarração entre os dois eixos fica visível — e
 * conferível — pelo `conferirAlmoxarifadoContraRazao`.
 *
 * PENDÊNCIA NOMEADA: `ESTORNO-FISICO-E-CONTABIL-EM-CASCATA`.
 */
export async function estornarMovimentoFisico(
  prisma: PrismaClient,
  input: EstornarMovimentoFisicoInput
): Promise<{ readonly movimentoId: string }> {
  const d = zEstornarMovimentoFisicoInput.parse(input);

  return prisma.$transaction(async (tx) => {
    const original = await tx.movimentoFisicoDeEstoque.findUnique({
      where: { id: d.movimentoId },
      select: {
        id: true,
        tipo: true,
        materialId: true,
        depositoId: true,
        loteId: true,
        quantidade: true,
        valorUnitario: true,
        valorTotal: true,
        setorId: true,
        itemDeRequisicaoId: true,
        operacaoId: true,
        deposito: { select: { unidadeOrcId: true } },
        estornos: { select: { id: true } },
      },
    });
    if (original === null) {
      throw new Error(`Movimento físico ${d.movimentoId} não existe.`);
    }
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.estornarMovimentoFisico, {
      ug: original.deposito.unidadeOrcId,
    });

    const tipoEstorno =
      TIPO_DO_ESTORNO_FISICO[original.tipo as TipoMovimentoFisicoEstoque];
    if (tipoEstorno === null) {
      throw new Error(
        `${original.tipo} JÁ É um estorno. A correção de um estorno é um fato NOVO, e ` +
          `não o estorno do estorno — a razão é append-only.`
      );
    }
    if (original.estornos.length > 0) {
      throw new Error(
        `O movimento ${original.id} já foi estornado. Estornar duas vezes devolveria a ` +
          `quantidade em dobro ao estoque.`
      );
    }

    await travar(tx, "PosicaoFisicaDeEstoque", [
      chaveDaPosicao(original.materialId, original.depositoId),
    ]);

    const criado = await tx.movimentoFisicoDeEstoque.create({
      data: {
        materialId: original.materialId,
        depositoId: original.depositoId,
        loteId: original.loteId,
        tipo: tipoEstorno,
        quantidade: original.quantidade.toFixed(4),
        valorUnitario: original.valorUnitario.toFixed(6),
        valorTotal: original.valorTotal.toFixed(2),
        dataMovimento: d.dataMovimento,
        setorId: original.setorId,
        itemDeRequisicaoId: original.itemDeRequisicaoId,
        operacaoId: original.operacaoId,
        estornoDeId: original.id,
        motivo: d.motivo,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { movimentoId: criado.id };
  });
}

export const zTransferirEntreDepositosInput = z.object({
  materialId: z.string().min(1),
  depositoOrigemId: z.string().min(1),
  depositoDestinoId: z.string().min(1),
  unidadeDeMedidaId: z.string().min(1).optional(),
  quantidade: zQuantidadePositiva,
  dataMovimento: z.coerce.date(),
  motivo: zMotivo,
  criadoPor: z.string().min(1),
});
export type TransferirEntreDepositosInput = z.input<
  typeof zTransferirEntreDepositosInput
>;

/**
 * TRANSFERÊNCIA ENTRE DEPÓSITOS (TR 5.18.1) — OPERAÇÃO COMPOSTA.
 *
 * ⚠️ DUAS PERNAS SOB UM `operacaoId`, e nunca um movimento só com dois depósitos: isso
 * tornaria o saldo de cada depósito uma leitura com caso especial. Estornar uma perna
 * sem a outra deixaria material em dois lugares ou em nenhum.
 *
 * ⚠️ E ELA NÃO GERA LANÇAMENTO CONTÁBIL, de propósito: transferir entre dois depósitos
 * da MESMA classe não muda saldo de conta nenhuma. Inventar um lançamento aqui poluiria
 * o razão com um par que se anula.
 */
export async function transferirEntreDepositos(
  prisma: PrismaClient,
  input: TransferirEntreDepositosInput
): Promise<{
  readonly operacaoId: string;
  readonly saidaId: string;
  readonly entradaId: string;
}> {
  const d = zTransferirEntreDepositosInput.parse(input);
  if (d.depositoOrigemId === d.depositoDestinoId) {
    throw new Error(
      `Origem e destino são o mesmo depósito. Uma transferência para si mesma gera um ` +
        `par que se anula e um histórico que engana quem audita.`
    );
  }

  return prisma.$transaction(async (tx) => {
    const origem = await exigirDeposito(tx, d.depositoOrigemId);
    const destino = await exigirDeposito(tx, d.depositoDestinoId);
    // ⚠️ AS DUAS UGs TÊM DE PASSAR: tirar do depósito da Saúde e pôr no da Educação é
    // um ato que toca as duas unidades.
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.transferirEntreDepositos, {
      ugs: [origem.unidadeOrcId, destino.unidadeOrcId],
    });

    const mat = await exigirMaterial(tx, d.materialId);
    // ⚠️ RECUSA EM VEZ DE ERRAR EM SILÊNCIO. O lote é POR MATERIAL E DEPÓSITO: transferir
    // um material com lote exigiria abrir o lote correspondente no destino, preservando a
    // validade — e transferir sem isso faria a validade sumir na travessia. Enquanto esse
    // percurso não existir, ele é recusado com o nome da pendência.
    // PENDÊNCIA NOMEADA: `TRANSFERENCIA-DE-MATERIAL-COM-LOTE`.
    if (mat.controlaLote) {
      throw new Error(
        `O material ${mat.codigo} controla LOTE, e a transferência entre depósitos ainda ` +
          `não sabe levar o lote junto (a validade se perderia na travessia). Pendência ` +
          `TRANSFERENCIA-DE-MATERIAL-COM-LOTE.`
      );
    }
    // Dentro do mesmo posto, a ordem é a do id — o `travar` cuida disso.
    await travar(tx, "PosicaoFisicaDeEstoque", [
      chaveDaPosicao(d.materialId, d.depositoOrigemId),
      chaveDaPosicao(d.materialId, d.depositoDestinoId),
    ]);
    await exigirNaoBloqueado(tx, d.materialId, d.depositoOrigemId, d.dataMovimento);
    await exigirNaoBloqueado(tx, d.materialId, d.depositoDestinoId, d.dataMovimento);

    const fator = await fatorDaUnidade(tx, d.materialId, d.unidadeDeMedidaId);
    const quantidade = converterParaEstoque(d.quantidade, fator);

    const dia = diaCivil(d.dataMovimento);
    const posicao = posicaoDeEstoque(
      await movimentosDa(tx, d.materialId, d.depositoOrigemId),
      dia
    );
    if (quantidade.greaterThan(posicao.quantidade)) {
      throw new Error(
        `TRANSFERÊNCIA MAIOR QUE O ESTOQUE do material ${mat.codigo} no depósito ` +
          `${origem.codigo} em ${dia}: há ${posicao.quantidade.toFixed(4)}.`
      );
    }

    // A transferência leva o CUSTO junto: o material não muda de valor ao mudar de
    // prateleira. Sem isto, o destino receberia quantidade sem valor e o preço médio
    // dele nasceria errado.
    const unitario = precoMedioDaPosicao(posicao);
    const total = quantidade.times(unitario).toDecimalPlaces(2);
    const operacaoId = randomUUID();

    const comum = {
      materialId: d.materialId,
      quantidade: quantidade.toFixed(4),
      valorUnitario: unitario.toFixed(6),
      valorTotal: total.toFixed(2),
      dataMovimento: d.dataMovimento,
      operacaoId,
      motivo: d.motivo,
      criadoPor: d.criadoPor,
    };

    const saida = await tx.movimentoFisicoDeEstoque.create({
      data: { ...comum, depositoId: d.depositoOrigemId, tipo: "TRANSFERENCIA_SAIDA" },
      select: { id: true },
    });
    const entrada = await tx.movimentoFisicoDeEstoque.create({
      data: {
        ...comum,
        depositoId: d.depositoDestinoId,
        tipo: "TRANSFERENCIA_ENTRADA",
      },
      select: { id: true },
    });

    return { operacaoId, saidaId: saida.id, entradaId: entrada.id };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// REQUISIÇÕES, COTAS, INVENTÁRIO E BLOQUEIOS
// ═══════════════════════════════════════════════════════════════════════════

export const zRegistrarRequisicaoDeMaterialInput = z.object({
  numero: z.string().trim().min(1).max(20),
  depositoId: z.string().min(1),
  setorId: z.string().min(1),
  dataRequisicao: z.coerce.date(),
  solicitante: z.string().trim().min(3),
  itens: z
    .array(
      z.object({
        materialId: z.string().min(1),
        quantidadeSolicitada: zQuantidadePositiva,
      })
    )
    .min(1, "uma requisição sem item não pede nada"),
  criadoPor: z.string().min(1),
});
export type RegistrarRequisicaoDeMaterialInput = z.input<
  typeof zRegistrarRequisicaoDeMaterialInput
>;

/** TR 5.18.6 e 5.18.8 — o pedido de material ao almoxarifado. */
export async function registrarRequisicaoDeMaterial(
  prisma: PrismaClient,
  input: RegistrarRequisicaoDeMaterialInput
): Promise<{ readonly requisicaoId: string }> {
  const d = zRegistrarRequisicaoDeMaterialInput.parse(input);
  return prisma.$transaction(async (tx) => {
    // A UG sai do SETOR que pede — é o mesmo eixo que a tramitação de processo do M21 usa.
    await autorizarNo(
      tx,
      d.criadoPor,
      ACAO_DO_SERVICO.registrarRequisicaoDeMaterial,
      { setor: d.setorId }
    );
    await exigirDeposito(tx, d.depositoId);

    const criada = await tx.requisicaoDeMaterial.create({
      data: {
        numero: d.numero,
        depositoId: d.depositoId,
        setorId: d.setorId,
        dataRequisicao: d.dataRequisicao,
        solicitante: d.solicitante,
        criadoPor: d.criadoPor,
        itens: {
          create: d.itens.map((i) => ({
            materialId: i.materialId,
            quantidadeSolicitada: i.quantidadeSolicitada.toFixed(4),
            criadoPor: d.criadoPor,
          })),
        },
      },
      select: { id: true },
    });
    return { requisicaoId: criada.id };
  });
}

export const zDefinirCotaDeConsumoInput = z.object({
  setorId: z.string().min(1),
  materialId: z.string().min(1),
  competencia: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "a competência é AAAA-MM — é um rótulo, não um instante"),
  quantidadeLimite: zQuantidadePositiva,
  criadoPor: z.string().min(1),
});
export type DefinirCotaDeConsumoInput = z.input<typeof zDefinirCotaDeConsumoInput>;

/** TR 5.18.4 — a cota mensal por departamento. */
export async function definirCotaDeConsumo(
  prisma: PrismaClient,
  input: DefinirCotaDeConsumoInput
): Promise<{ readonly cotaId: string }> {
  const d = zDefinirCotaDeConsumoInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.definirCotaDeConsumo, {
      setor: d.setorId,
    });
    const salva = await tx.cotaDeConsumo.upsert({
      where: {
        setorId_materialId_competencia: {
          setorId: d.setorId,
          materialId: d.materialId,
          competencia: d.competencia,
        },
      },
      create: {
        setorId: d.setorId,
        materialId: d.materialId,
        competencia: d.competencia,
        quantidadeLimite: d.quantidadeLimite.toFixed(4),
        criadoPor: d.criadoPor,
      },
      update: { quantidadeLimite: d.quantidadeLimite.toFixed(4) },
      select: { id: true },
    });
    return { cotaId: salva.id };
  });
}

export const zAbrirInventarioDeEstoqueInput = z.object({
  depositoId: z.string().min(1),
  dataAbertura: z.coerce.date(),
  termoAberturaId: z.string().min(1).optional(),
  criadoPor: z.string().min(1),
});
export type AbrirInventarioDeEstoqueInput = z.input<
  typeof zAbrirInventarioDeEstoqueInput
>;

/**
 * TR 5.18.12 — abre o inventário, e com ele o BLOQUEIO.
 *
 * ⚠️ DOIS INVENTÁRIOS ABERTOS NO MESMO DEPÓSITO SÃO RECUSADOS. Dois abertos ao mesmo
 * tempo tornariam ambíguo qual deles a contagem pertence — e a divergência, que é
 * derivada da data de fechamento, passaria a ter duas respostas.
 */
export async function abrirInventarioDeEstoque(
  prisma: PrismaClient,
  input: AbrirInventarioDeEstoqueInput
): Promise<{ readonly inventarioId: string }> {
  const d = zAbrirInventarioDeEstoqueInput.parse(input);
  return prisma.$transaction(async (tx) => {
    const dep = await exigirDeposito(tx, d.depositoId);
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.abrirInventarioDeEstoque, {
      ug: dep.unidadeOrcId,
    });

    const aberto = await tx.inventarioDeEstoque.findFirst({
      where: { depositoId: d.depositoId, dataFechamento: null },
      select: { id: true, dataAbertura: true },
    });
    if (aberto !== null) {
      throw new Error(
        `Já há inventário ABERTO no depósito ${dep.codigo} desde ` +
          `${diaCivil(aberto.dataAbertura)}. Dois inventários abertos tornariam ` +
          `ambíguo a qual deles cada contagem pertence.`
      );
    }

    const criado = await tx.inventarioDeEstoque.create({
      data: {
        depositoId: d.depositoId,
        dataAbertura: d.dataAbertura,
        termoAberturaId: d.termoAberturaId ?? null,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { inventarioId: criado.id };
  });
}

export const zRegistrarContagemDeInventarioInput = z.object({
  inventarioId: z.string().min(1),
  materialId: z.string().min(1),
  loteId: z.string().min(1).optional(),
  quantidadeContada: z.union([z.string(), z.number()]),
  criadoPor: z.string().min(1),
});
export type RegistrarContagemDeInventarioInput = z.input<
  typeof zRegistrarContagemDeInventarioInput
>;

/** TR 5.18.12 — a contagem é FATO OBSERVADO; a divergência é derivada (decisão D3). */
export async function registrarContagemDeInventario(
  prisma: PrismaClient,
  input: RegistrarContagemDeInventarioInput
): Promise<{ readonly contagemId: string }> {
  const d = zRegistrarContagemDeInventarioInput.parse(input);
  const contada = toMoney(d.quantidadeContada);
  if (contada.lessThan(0)) {
    throw new Error(
      `Contagem de ${contada.toFixed(4)}: não se conta quantidade negativa numa ` +
        `prateleira. Zero é um resultado legítimo; negativo é erro de digitação.`
    );
  }

  return prisma.$transaction(async (tx) => {
    const inv = await tx.inventarioDeEstoque.findUnique({
      where: { id: d.inventarioId },
      select: {
        id: true,
        dataFechamento: true,
        deposito: { select: { unidadeOrcId: true } },
      },
    });
    if (inv === null) throw new Error(`Inventário ${d.inventarioId} não existe.`);
    await autorizarNo(
      tx,
      d.criadoPor,
      ACAO_DO_SERVICO.registrarContagemDeInventario,
      { ug: inv.deposito.unidadeOrcId }
    );
    if (inv.dataFechamento !== null) {
      throw new Error(
        `O inventário ${inv.id} já foi FECHADO em ${diaCivil(inv.dataFechamento)}. ` +
          `Contar depois do fechamento mudaria um resultado que já foi apurado.`
      );
    }

    // ⚠️ NÃO DÁ PARA USAR `upsert` AQUI, e o motivo é do Postgres, não do Prisma: a
    // chave composta inclui `loteId`, que é NULO para todo material sem controle de
    // lote — e um índice único NÃO restringe linhas com NULL (dois NULL são DISTINTOS).
    // A unicidade do caso nulo é garantida por índice PARCIAL declarado em
    // `prisma/sql/uq_contagem_de_inventario_sem_lote.sql`; aqui a leitura é explícita.
    const existente = await tx.contagemDeInventario.findFirst({
      where: {
        inventarioId: d.inventarioId,
        materialId: d.materialId,
        loteId: d.loteId ?? null,
      },
      select: { id: true },
    });
    if (existente !== null) {
      await tx.contagemDeInventario.update({
        where: { id: existente.id },
        data: { quantidadeContada: contada.toFixed(4) },
      });
      return { contagemId: existente.id };
    }
    const salva = await tx.contagemDeInventario.create({
      data: {
        inventarioId: d.inventarioId,
        materialId: d.materialId,
        loteId: d.loteId ?? null,
        quantidadeContada: contada.toFixed(4),
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { contagemId: salva.id };
  });
}

export const zFecharInventarioDeEstoqueInput = z.object({
  inventarioId: z.string().min(1),
  dataFechamento: z.coerce.date(),
  termoFechamentoId: z.string().min(1).optional(),
  criadoPor: z.string().min(1),
});
export type FecharInventarioDeEstoqueInput = z.input<
  typeof zFecharInventarioDeEstoqueInput
>;

/**
 * TR 5.18.12 — fecha o inventário e LIBERA a movimentação.
 *
 * ⚠️ ELE NÃO LANÇA OS AJUSTES AUTOMATICAMENTE, e isso é uma decisão declarada: o ajuste
 * de inventário é lançamento CONTÁBIL (sobra é VPA, falta é VPD) e passa pelo funil do
 * M01, que cobra o período aberto. Fazê-lo em lote aqui atravessaria esse controle e
 * transformaria um fechamento numa cascata de lançamentos que ninguém pediu.
 *
 * A divergência fica VISÍVEL (derivada), e quem a lança é `registrarAjusteAlmoxarifado`.
 * PENDÊNCIA NOMEADA: `AJUSTE-DE-INVENTARIO-EM-LOTE`.
 */
export async function fecharInventarioDeEstoque(
  prisma: PrismaClient,
  input: FecharInventarioDeEstoqueInput
): Promise<{ readonly inventarioId: string; readonly contagens: number }> {
  const d = zFecharInventarioDeEstoqueInput.parse(input);
  return prisma.$transaction(async (tx) => {
    const inv = await tx.inventarioDeEstoque.findUnique({
      where: { id: d.inventarioId },
      select: {
        id: true,
        dataAbertura: true,
        dataFechamento: true,
        deposito: { select: { unidadeOrcId: true, codigo: true } },
        contagens: { select: { id: true } },
      },
    });
    if (inv === null) throw new Error(`Inventário ${d.inventarioId} não existe.`);
    await autorizarNo(
      tx,
      d.criadoPor,
      ACAO_DO_SERVICO.fecharInventarioDeEstoque,
      { ug: inv.deposito.unidadeOrcId }
    );
    if (inv.dataFechamento !== null) {
      throw new Error(
        `O inventário ${inv.id} já foi fechado em ${diaCivil(inv.dataFechamento)}.`
      );
    }
    if (d.dataFechamento < inv.dataAbertura) {
      throw new Error(
        `Fechamento em ${diaCivil(d.dataFechamento)} é ANTERIOR à abertura em ` +
          `${diaCivil(inv.dataAbertura)} — a janela do inventário ficaria invertida, e ` +
          `com ela o bloqueio que ela produz.`
      );
    }
    if (inv.contagens.length === 0) {
      throw new Error(
        `O inventário do depósito ${inv.deposito.codigo} não tem contagem nenhuma. ` +
          `Fechar sem contar registraria um inventário que ninguém fez.`
      );
    }

    await tx.inventarioDeEstoque.update({
      where: { id: d.inventarioId },
      data: {
        dataFechamento: d.dataFechamento,
        termoFechamentoId: d.termoFechamentoId ?? null,
      },
    });
    return { inventarioId: inv.id, contagens: inv.contagens.length };
  });
}

export const zBloquearEstoqueInput = z.object({
  materialId: z.string().min(1).optional(),
  depositoId: z.string().min(1).optional(),
  inicio: z.coerce.date(),
  fim: z.coerce.date().optional(),
  motivo: zMotivo,
  criadoPor: z.string().min(1),
});
export type BloquearEstoqueInput = z.input<typeof zBloquearEstoqueInput>;

/** TR 5.18.13 — bloqueio por produto, por depósito, ou pelo par (decisão D14). */
export async function bloquearEstoque(
  prisma: PrismaClient,
  input: BloquearEstoqueInput
): Promise<{ readonly bloqueioId: string }> {
  const d = zBloquearEstoqueInput.parse(input);
  if (d.materialId === undefined && d.depositoId === undefined) {
    throw new Error(
      `Um bloqueio sem material E sem depósito travaria o almoxarifado inteiro do ente ` +
        `sem dizer o quê. A TR 5.18.13 nomeia três alcances, e todos têm ao menos um lado.`
    );
  }
  if (d.fim !== undefined && d.fim < d.inicio) {
    throw new Error(`Fim antes do início: a janela do bloqueio ficaria invertida.`);
  }

  return prisma.$transaction(async (tx) => {
    const ug =
      d.depositoId === undefined
        ? undefined
        : (await exigirDeposito(tx, d.depositoId)).unidadeOrcId;
    // Bloqueio de material em TODA parte é ato do ENTE; de um depósito, da UG dele.
    await autorizarNo(
      tx,
      d.criadoPor,
      ACAO_DO_SERVICO.bloquearEstoque,
      ug === undefined ? "ENTE" : { ug }
    );

    const criado = await tx.bloqueioDeEstoque.create({
      data: {
        materialId: d.materialId ?? null,
        depositoId: d.depositoId ?? null,
        inicio: d.inicio,
        fim: d.fim ?? null,
        motivo: d.motivo,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { bloqueioId: criado.id };
  });
}

export const zEncerrarBloqueioDeEstoqueInput = z.object({
  bloqueioId: z.string().min(1),
  fim: z.coerce.date(),
  criadoPor: z.string().min(1),
});
export type EncerrarBloqueioDeEstoqueInput = z.input<
  typeof zEncerrarBloqueioDeEstoqueInput
>;

/**
 * ⚠️ ENCERRAR É PÔR O FIM, não apagar o bloqueio. O histórico de que aquele material
 * esteve bloqueado entre D1 e D2 é o que explica por que uma saída foi recusada naquele
 * dia — apagar a linha tornaria a recusa inexplicável depois.
 */
export async function encerrarBloqueioDeEstoque(
  prisma: PrismaClient,
  input: EncerrarBloqueioDeEstoqueInput
): Promise<{ readonly bloqueioId: string }> {
  const d = zEncerrarBloqueioDeEstoqueInput.parse(input);
  return prisma.$transaction(async (tx) => {
    const b = await tx.bloqueioDeEstoque.findUnique({
      where: { id: d.bloqueioId },
      select: {
        id: true,
        inicio: true,
        fim: true,
        deposito: { select: { unidadeOrcId: true } },
      },
    });
    if (b === null) throw new Error(`Bloqueio ${d.bloqueioId} não existe.`);
    await autorizarNo(
      tx,
      d.criadoPor,
      ACAO_DO_SERVICO.encerrarBloqueioDeEstoque,
      b.deposito === null ? "ENTE" : { ug: b.deposito.unidadeOrcId }
    );
    if (b.fim !== null) {
      throw new Error(
        `O bloqueio ${b.id} já foi encerrado em ${diaCivil(b.fim)}.`
      );
    }
    if (d.fim < b.inicio) {
      throw new Error(`Fim antes do início: a janela do bloqueio ficaria invertida.`);
    }
    await tx.bloqueioDeEstoque.update({
      where: { id: d.bloqueioId },
      data: { fim: d.fim },
    });
    return { bloqueioId: b.id };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// AS CONSULTAS QUE AS TELAS PEDEM — todas derivadas, nenhuma coluna de saldo
// ═══════════════════════════════════════════════════════════════════════════

/** O rol de unidades de medida — alimenta o formulário de material (TR 5.17.2). */
export async function listarUnidadesDeMedida(
  tx: Tx
): Promise<readonly { readonly id: string; readonly sigla: string; readonly descricao: string }[]> {
  return tx.unidadeDeMedida.findMany({
    select: { id: true, sigla: true, descricao: true },
    orderBy: { sigla: "asc" },
  });
}

/**
 * MATERIAIS ABAIXO DO MÍNIMO num depósito (TR 5.18.3).
 *
 * ⚠️ A COMPARAÇÃO É CONTRA A POSIÇÃO DERIVADA, não contra uma coluna de saldo. É por
 * isso que ela aceita `ateDia`: "o que estava abaixo do mínimo no fechamento do mês" é
 * uma pergunta legítima, e uma coluna não a responderia.
 */
export async function materiaisAbaixoDoMinimo(
  tx: Tx,
  depositoId: string,
  ateDia?: string
): Promise<
  readonly {
    readonly materialId: string;
    readonly codigo: string;
    readonly descricao: string;
    readonly quantidade: Money;
    readonly minima: Money;
  }[]
> {
  const parametros = await tx.parametroDeEstoque.findMany({
    where: { depositoId, quantidadeMinima: { not: null } },
    select: {
      materialId: true,
      quantidadeMinima: true,
      material: { select: { codigo: true, descricaoSucinta: true, ativo: true } },
    },
  });

  const linhas: {
    materialId: string;
    codigo: string;
    descricao: string;
    quantidade: Money;
    minima: Money;
  }[] = [];

  for (const p of parametros) {
    if (!p.material.ativo) continue;
    const posicao = await posicaoDoMaterial(tx, p.materialId, depositoId, ateDia);
    const minima = toMoney((p.quantidadeMinima as unknown as { toFixed: (n: number) => string }).toFixed(4));
    if (posicao.quantidade.lessThan(minima)) {
      linhas.push({
        materialId: p.materialId,
        codigo: p.material.codigo,
        descricao: p.material.descricaoSucinta,
        quantidade: posicao.quantidade,
        minima,
      });
    }
  }
  return linhas;
}

/**
 * AS REQUISIÇÕES COM SALDO NÃO ATENDIDO (TR 5.18.8, 5.18.9).
 *
 * ⚠️ SEM COLUNA DE SITUAÇÃO. "Pendente" é Σ(solicitado) − Σ(atendido) > 0, item a item —
 * e o estorno de uma saída devolve o item à pendência sozinho, o que uma coluna
 * `situacao` só faria se alguém lembrasse de atualizá-la.
 */
export async function requisicoesPendentes(
  tx: Tx,
  p: { readonly depositoId?: string; readonly setorId?: string }
): Promise<
  readonly {
    readonly requisicaoId: string;
    readonly numero: string;
    readonly dataRequisicao: Date;
    readonly solicitante: string;
    readonly itensPendentes: readonly {
      readonly itemId: string;
      readonly materialId: string;
      readonly codigo: string;
      readonly solicitada: Money;
      readonly naoAtendida: Money;
    }[];
  }[]
> {
  const requisicoes = await tx.requisicaoDeMaterial.findMany({
    where: {
      ...(p.depositoId === undefined ? {} : { depositoId: p.depositoId }),
      ...(p.setorId === undefined ? {} : { setorId: p.setorId }),
    },
    select: {
      id: true,
      numero: true,
      dataRequisicao: true,
      solicitante: true,
      itens: {
        select: {
          id: true,
          materialId: true,
          quantidadeSolicitada: true,
          material: { select: { codigo: true } },
          atendimentos: { select: { tipo: true, quantidade: true } },
        },
      },
    },
    orderBy: { dataRequisicao: "asc" },
  });

  return requisicoes
    .map((r) => ({
      requisicaoId: r.id,
      numero: r.numero,
      dataRequisicao: r.dataRequisicao,
      solicitante: r.solicitante,
      itensPendentes: r.itens
        .map((i) => ({
          itemId: i.id,
          materialId: i.materialId,
          codigo: i.material.codigo,
          solicitada: toMoney(i.quantidadeSolicitada.toFixed(4)),
          naoAtendida: saldoNaoAtendido(
            toMoney(i.quantidadeSolicitada.toFixed(4)),
            i.atendimentos.map((a) => ({
              tipo: a.tipo as TipoMovimentoFisicoEstoque,
              quantidade: toMoney(a.quantidade.toFixed(4)),
            }))
          ),
        }))
        .filter((i) => i.naoAtendida.greaterThan(0)),
    }))
    .filter((r) => r.itensPendentes.length > 0);
}

/**
 * VENCIDOS E A VENCER num depósito (TR 5.18.14 e 5.18.20).
 *
 * ⚠️ SÓ ENTRAM LOTES COM POSIÇÃO POSITIVA. Um lote que já saiu inteiro do estoque está
 * vencido no calendário e irrelevante na prateleira — listá-lo mandaria alguém procurar
 * um material que não está lá.
 */
export async function validadeDoEstoqueDoDeposito(
  tx: Tx,
  depositoId: string,
  hoje: string,
  dentroDeDias = 30
): Promise<{
  readonly vencidos: readonly { readonly id: string; readonly identificacao: string; readonly validade: Date | null }[];
  readonly aVencer: readonly { readonly id: string; readonly identificacao: string; readonly validade: Date | null }[];
}> {
  const lotes = await tx.loteDeMaterial.findMany({
    where: { depositoId, validade: { not: null } },
    select: { id: true, identificacao: true, validade: true, materialId: true },
  });

  const comSaldo: { id: string; identificacao: string; validade: Date | null }[] = [];
  for (const l of lotes) {
    const ms = await tx.movimentoFisicoDeEstoque.findMany({
      where: { loteId: l.id },
      select: { tipo: true, quantidade: true, valorTotal: true, dataMovimento: true },
    });
    const posicao = posicaoDeEstoque(
      ms.map((m) => ({
        tipo: m.tipo as TipoMovimentoFisicoEstoque,
        quantidade: toMoney(m.quantidade.toFixed(4)),
        valorTotal: toMoney(m.valorTotal.toFixed(2)),
        dataMovimento: m.dataMovimento,
      })),
      hoje
    );
    if (posicao.quantidade.greaterThan(0)) {
      comSaldo.push({ id: l.id, identificacao: l.identificacao, validade: l.validade });
    }
  }

  return validadeDoEstoque(comSaldo, hoje, dentroDeDias);
}
