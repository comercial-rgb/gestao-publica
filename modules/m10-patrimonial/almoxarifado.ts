import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { toMoney, zMoney, type Money } from "../../packages/contracts/index.js";
import { travar } from "../../packages/locks/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
// O rol oficial de elementos é do M02 (dono da classificação). O M10 DECIDE sobre ele;
// não o reimplementa, e não fatia código nenhum.
import { exigirElementoOficial } from "../m02-planejamento/dominio.js";
// ⚠️ O FUNIL DO RAZÃO (M01). Todo lançamento passa por ele — e é lá que mora o
// travamento de competência (M16). Ver `m01-funil.test.ts`: o grep-teste proíbe o
// `lancamentoContabil.create` fora dele.
import { lancarNoRazao } from "../m01-core-contabil/razao.js";

/**
 * M10 — ALMOXARIFADO (TR 5.85/5.86).
 *
 * ═══ A ENTRADA NÃO TEM ROTEIRO, E É DE PROPÓSITO ═══
 * Comprar material é fato PERMUTATIVO: o dinheiro vira material. Quem contabiliza é o
 * M05 — o roteiro da LIQUIDAÇÃO já vem por PARÂMETRO, e para material de consumo a
 * perna de DÉBITO aponta para o ESTOQUE em vez de uma VPD (D estoque / C fornecedor).
 *
 * ⚠️ E ISSO É A COMPETÊNCIA DO MCASP, NÃO UMA ESPERTEZA: a despesa patrimonial NÃO
 * nasce na compra, nasce no CONSUMO. Um almoxarifado cheio não empobreceu o ente — ele
 * trocou dinheiro por material. Debitar VPD na aquisição reconheceria a despesa antes
 * de o material ser usado, e o resultado do exercício absorveria o estoque que ficou
 * na prateleira.
 *
 * Um roteiro de ENTRADA aqui debitaria o estoque DUAS VEZES.
 *
 * A SAÍDA e os AJUSTES têm roteiro próprio — é lá que a VPD (e a VPA da sobra) nasce.
 */

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

export type TipoMovimentoAlmoxarifado =
  | "ENTRADA"
  | "SAIDA_CONSUMO"
  | "AJUSTE_ENTRADA"
  | "AJUSTE_SAIDA"
  | "ESTORNO_ENTRADA"
  | "ESTORNO_SAIDA_CONSUMO"
  | "ESTORNO_AJUSTE_ENTRADA"
  | "ESTORNO_AJUSTE_SAIDA";

/**
 * O SINAL DE CADA MOVIMENTO SOBRE O SALDO DO ESTOQUE.
 *
 * O estoque CRESCE quando o material entra (compra) e quando o inventário acha sobra;
 * DIMINUI quando é consumido e quando o inventário acha falta. Os estornos desfazem.
 */
export const SINAL_MOVIMENTO_ALMOXARIFADO: Record<
  TipoMovimentoAlmoxarifado,
  1 | -1
> = {
  ENTRADA: 1,
  SAIDA_CONSUMO: -1,
  AJUSTE_ENTRADA: 1,
  AJUSTE_SAIDA: -1,
  ESTORNO_ENTRADA: -1,
  ESTORNO_SAIDA_CONSUMO: 1,
  ESTORNO_AJUSTE_ENTRADA: -1,
  ESTORNO_AJUSTE_SAIDA: 1,
};

/** Quem tem lançamento PRÓPRIO. A ENTRADA não tem — o M05 a lança (ver o cabeçalho). */
export const TEM_ROTEIRO_ALMOXARIFADO: Record<TipoMovimentoAlmoxarifado, boolean> = {
  ENTRADA: false,
  ESTORNO_ENTRADA: false,
  SAIDA_CONSUMO: true,
  AJUSTE_ENTRADA: true,
  AJUSTE_SAIDA: true,
  ESTORNO_SAIDA_CONSUMO: true,
  ESTORNO_AJUSTE_ENTRADA: true,
  ESTORNO_AJUSTE_SAIDA: true,
};

export const TIPO_DO_ESTORNO_ALMOXARIFADO: Record<
  TipoMovimentoAlmoxarifado,
  TipoMovimentoAlmoxarifado | null
> = {
  ENTRADA: "ESTORNO_ENTRADA",
  SAIDA_CONSUMO: "ESTORNO_SAIDA_CONSUMO",
  AJUSTE_ENTRADA: "ESTORNO_AJUSTE_ENTRADA",
  AJUSTE_SAIDA: "ESTORNO_AJUSTE_SAIDA",
  ESTORNO_ENTRADA: null,
  ESTORNO_SAIDA_CONSUMO: null,
  ESTORNO_AJUSTE_ENTRADA: null,
  ESTORNO_AJUSTE_SAIDA: null,
};

export interface MovimentoParaSaldoAlmox {
  readonly tipo: TipoMovimentoAlmoxarifado;
  readonly valor: Money;
}

/** Σ(valor × SINAL). Puro, e a fonte única. O estorno SOMA, com o sinal dele. */
export function saldoDoAlmoxarifado(
  movimentos: readonly MovimentoParaSaldoAlmox[]
): Money {
  let saldo = toMoney("0.00");
  for (const m of movimentos) {
    const sinal = SINAL_MOVIMENTO_ALMOXARIFADO[m.tipo];
    saldo = toMoney(sinal === 1 ? saldo.plus(m.valor) : saldo.minus(m.valor));
  }
  return saldo;
}

// ═══════════════════════════════════════════════════════════════════════════
// ENTRADA (Zod)
// ═══════════════════════════════════════════════════════════════════════════

const zValorPositivo = zMoney.refine((v) => v.greaterThan(0), {
  message: "Valor deve ser > 0",
});
const zMotivo = z
  .string()
  .trim()
  .min(10, "O motivo precisa de ao menos 10 caracteres");

export const zCadastrarClasseDeMaterialInput = z.object({
  codigo: z.string().trim().min(1),
  descricao: z.string().trim().min(3),
  contaContabilId: z.string().min(1),
  criadoPor: z.string().min(1),
});
export type CadastrarClasseDeMaterialInput = z.input<
  typeof zCadastrarClasseDeMaterialInput
>;

export const zEntradaAlmoxarifadoInput = z.object({
  classeDeMaterialId: z.string().min(1),
  /** TR 5.85 — a entrada nasce da LIQUIDAÇÃO (material recebido e atestado). */
  liquidacaoId: z.string().min(1),
  valor: zValorPositivo,
  dataMovimento: z.coerce.date(),
  criadoPor: z.string().min(1),
});
export type EntradaAlmoxarifadoInput = z.input<typeof zEntradaAlmoxarifadoInput>;

export const zSaidaConsumoInput = z.object({
  classeDeMaterialId: z.string().min(1),
  valor: zValorPositivo,
  dataMovimento: z.coerce.date(),
  motivo: z.string().trim().min(1),
  criadoPor: z.string().min(1),
});
export type SaidaConsumoInput = z.input<typeof zSaidaConsumoInput>;

export const zAjusteAlmoxarifadoInput = z.object({
  classeDeMaterialId: z.string().min(1),
  /** SOBRA = o inventário achou mais; FALTA = achou menos. */
  sentido: z.enum(["SOBRA", "FALTA"]),
  valor: zValorPositivo,
  dataMovimento: z.coerce.date(),
  motivo: zMotivo,
  criadoPor: z.string().min(1),
});
export type AjusteAlmoxarifadoInput = z.input<typeof zAjusteAlmoxarifadoInput>;

export const zEstornarMovimentoAlmoxarifadoInput = z.object({
  movimentoId: z.string().min(1),
  dataMovimento: z.coerce.date(),
  motivo: zMotivo,
  criadoPor: z.string().min(1),
});
export type EstornarMovimentoAlmoxarifadoInput = z.input<
  typeof zEstornarMovimentoAlmoxarifadoInput
>;

// ═══════════════════════════════════════════════════════════════════════════
// LEITURAS DERIVADAS
// ═══════════════════════════════════════════════════════════════════════════

export async function saldoDaClasseDeMaterial(
  tx: Tx,
  classeDeMaterialId: string,
  corte?: Date
): Promise<Money> {
  const movimentos = await tx.movimentoAlmoxarifado.findMany({
    where: {
      classeDeMaterialId,
      ...(corte !== undefined ? { dataMovimento: { lte: corte } } : {}),
    },
    select: { tipo: true, valor: true },
  });
  return saldoDoAlmoxarifado(
    movimentos.map((m) => ({ tipo: m.tipo, valor: toMoney(m.valor.toFixed(2)) }))
  );
}

/** 7º posto da ordem de locks (ver packages/locks). */
async function travarClasse(tx: Tx, id: string): Promise<void> {
  await travar(tx, "ClasseDeMaterial", [id]);
}

async function exigirClasse(
  tx: Tx,
  id: string
): Promise<{
  readonly id: string;
  readonly codigo: string;
  readonly ativa: boolean;
}> {
  const c = await tx.classeDeMaterial.findUnique({
    where: { id },
    select: { id: true, codigo: true, ativa: true },
  });
  if (c === null) throw new Error(`Classe de material ${id} não existe.`);
  if (!c.ativa) {
    throw new Error(
      `Classe de material ${c.codigo} está INATIVA — não se movimenta estoque de uma ` +
        `classe que o ente desativou.`
    );
  }
  return c;
}

/** O roteiro do tipo — TABELA. Ausente = LANÇA, sem gravar nada. */
async function exigirRoteiro(
  tx: Tx,
  tipo: TipoMovimentoAlmoxarifado
): Promise<{ readonly contaDebitoId: string; readonly contaCreditoId: string }> {
  const r = await tx.roteiroAlmoxarifado.findUnique({
    where: { tipo },
    select: { contaDebitoId: true, contaCreditoId: true },
  });
  if (r === null) {
    throw new Error(
      `Não há RoteiroAlmoxarifado cadastrado para ${tipo}. As contas do PCASP vêm por ` +
        `PARÂMETRO — nenhuma conta é inventada no código. Cadastre o roteiro antes de ` +
        `movimentar o almoxarifado.`
    );
  }
  return r;
}

async function lancar(
  tx: Tx,
  p: {
    readonly tipoDoRoteiro: TipoMovimentoAlmoxarifado;
    readonly inverter: boolean;
    readonly codigo: string;
    readonly valor: Money;
    readonly data: Date;
    readonly classeDeMaterialId: string;
    readonly criadoPor: string;
    readonly historico: string;
  }
): Promise<string> {
  const r = await exigirRoteiro(tx, p.tipoDoRoteiro);
  const debito = p.inverter ? r.contaCreditoId : r.contaDebitoId;
  const credito = p.inverter ? r.contaDebitoId : r.contaCreditoId;

  const id = randomUUID();
  await lancarNoRazao(tx, {
      id,
      numeroControle: `ALM-${p.codigo}`,
      dataTransacao: p.data,
      historico: p.historico,
      origemTipo: "ALMOXARIFADO",
      origemId: p.classeDeMaterialId,
      criadoPor: p.criadoPor,
      partidas: [
          {
            contaId: debito,
            tipo: "DEBITO",
            subsistema: "PATRIMONIAL",
            valor: p.valor.toFixed(2),
          },
          {
            contaId: credito,
            tipo: "CREDITO",
            subsistema: "PATRIMONIAL",
            valor: p.valor.toFixed(2),
          },
        ]
    });
  return id;
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVIÇOS
// ═══════════════════════════════════════════════════════════════════════════

export async function cadastrarClasseDeMaterial(
  prisma: PrismaClient,
  input: CadastrarClasseDeMaterialInput
): Promise<{ readonly classeDeMaterialId: string }> {
  const d = zCadastrarClasseDeMaterialInput.parse(input);
  // SEM UG: a classe de material é CADASTRO do ente (o plano do estoque), não fato de unidade.
  await autorizarNo(prisma, d.criadoPor, ACAO_DO_SERVICO.cadastrarClasseDeMaterial, "ENTE");

  const criada = await prisma.classeDeMaterial.create({
    data: {
      codigo: d.codigo,
      descricao: d.descricao,
      contaContabilId: d.contaContabilId,
      criadoPor: d.criadoPor,
    },
    select: { id: true },
  });
  return { classeDeMaterialId: criada.id };
}

/**
 * ⚠️ OS ELEMENTOS QUE ENTRAM NO ALMOXARIFADO — ROL FECHADO, E ELE CRESCE POR DECISÃO.
 *
 * O almoxarifado guarda MATERIAL DE CONSUMO. Uma liquidação de serviço (elemento 39),
 * de obra (51) ou de equipamento permanente (52) não gera estoque nenhum — a de 52 gera
 * BEM PATRIMONIAL, que é outro livro, com outra conta e outra depreciação. Sem este
 * guard, uma consultoria de 5.000 virava "material" no estoque, o razão do estoque
 * inflava e o inventário nunca fechava.
 *
 * ⚠️ ESTE GUARD ERA CONSTRUÍVEL DESDE SEMPRE, E EU DISSE QUE NÃO ERA. O MODULO.md do
 * M10 afirmava que "não há rol de ELEMENTOS de despesa no repo" — o rol está em
 * `prisma/seed/dados/elementos.ts` desde c70e907, com 78 elementos e teste. O passo 0
 * do M13 (ca052dc) desmentiu a nota. O que faltava não era o dado; era procurar direito.
 *
 * ═══ POR QUE SÓ O 30, E POR QUE O 32 FICA DE FORA ═══
 * Os elementos com "Material" no nome, LITERAIS do rol oficial:
 *   30  "Material de Consumo"                              -> ENTRA. É o almoxarifado.
 *   32  "Material, Bem ou Serviço para Distribuição Gratuita" -> FORA, e é DECISÃO.
 *   52  "Equipamentos e Material Permanente"               -> FORA. É bem patrimonial.
 *
 * O 32 tem "Material" e tem "Serviço" no MESMO nome: parte dele é estoque (a cesta
 * básica que fica no depósito até ser distribuída), parte não é (o serviço prestado
 * direto ao beneficiário). Qual parte? O código não sabe, e o rol não diz. Incluí-lo
 * "porque tem Material no nome" seria INFERIR — e o precedente é fresco: em ca052dc os
 * benefícios assistenciais ficaram FORA da exceção do beneficiário pelo mesmo motivo
 * (a regra nomeava "folha ou previdência", não "assistência"). Quando o ente disser
 * como trata o 32, ele entra AQUI, numa linha. Enquanto ninguém disser, ele é recusado
 * com uma mensagem que aponta a DECISÃO — não um bug.
 */
export const ELEMENTOS_DE_ALMOXARIFADO: Record<string, true> = {
  "30": true, // Material de Consumo
};

/**
 * ENTRADA — o FATO e o VÍNCULO, sem lançamento próprio (o M05 já lançou).
 *
 * FAIL-CLOSED: a liquidação existe, NÃO está anulada (derivação do M05 — `estornos`),
 * o ELEMENTO do empenho é de material, o valor cabe nela, e a SOMA das entradas da
 * MESMA liquidação cabe nela.
 *
 * ⚠️ UMA LIQUIDAÇÃO PODE ABASTECER VÁRIAS CLASSES (uma nota com papel e com toner).
 * Sem o último guard, N classes seriam abastecidas com o mesmo dinheiro.
 *
 * ⚠️⚠️ E AQUI MORA UM FURO CONHECIDO, DECLARADO: a liquidação debita o estoque pelo
 * valor INTEIRO. Se só PARTE virar ENTRADA, o RAZÃO fica à frente dos MOVIMENTOS — o
 * mesmo furo da vinculação parcial da dívida ativa (a98f0a5), curado lá pela OPERAÇÃO
 * COMPOSTA (1ee2ba3). Aqui a cura é a mesma e ainda não foi feita: com chamadas
 * SEPARADAS, uma por classe, não há como exigir a soma EXATA (a primeira chamada de
 * 3.000 numa liquidação de 5.000 falharia). A amarração razão×movimentos DETECTA; o
 * serviço não impede. Ver MODULO.md.
 */
export async function registrarEntradaAlmoxarifado(
  prisma: PrismaClient,
  input: EntradaAlmoxarifadoInput
): Promise<{ readonly movimentoId: string }> {
  const d = zEntradaAlmoxarifadoInput.parse(input);

  return prisma.$transaction(async (tx) => {
    // ⚠️ A UG VEM DA LIQUIDAÇÃO (TR 5.85 — a entrada NASCE de material recebido e atestado) -> empenho
    // -> ficha. É o único serviço do M10 com unidade derivável, e ela é derivável porque o DADO existe:
    // a entrada aponta para a liquidação que a pagou.
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarEntradaAlmoxarifado, { liquidacao: d.liquidacaoId });

    // ORDEM DOS LOCKS: LIQUIDACAO (posto 3) antes da CLASSE (posto 7).
    await travar(tx, "Liquidacao", [d.liquidacaoId]);
    await travarClasse(tx, d.classeDeMaterialId);
    const classe = await exigirClasse(tx, d.classeDeMaterialId);

    const liq = await tx.liquidacao.findUnique({
      where: { id: d.liquidacaoId },
      select: {
        id: true,
        numero: true,
        valor: true,
        estornoDeId: true,
        estornos: { select: { id: true } },
        // A cadeia da classificação: liquidação -> empenho -> ficha -> natureza.
        // É a MESMA que o Anexo 12 e o portal (M13) percorrem — não há join novo.
        empenho: {
          select: {
            numero: true,
            ficha: {
              select: {
                naturezaDespesa: {
                  select: { codigoCompleto: true, codElemento: true },
                },
              },
            },
          },
        },
      },
    });
    if (liq === null) {
      throw new Error(
        `Liquidação ${d.liquidacaoId} não existe — e a TR 5.85 exige que a entrada no ` +
          `almoxarifado nasça do material RECEBIDO E ATESTADO.`
      );
    }
    if (liq.estornoDeId !== null) {
      throw new Error(
        `A liquidação ${liq.numero} É uma ANULAÇÃO — não se dá entrada de material com ` +
          `o estorno de uma liquidação.`
      );
    }
    if (liq.estornos.length > 0) {
      throw new Error(
        `A liquidação ${liq.numero} foi ANULADA. O material não foi aceito; ele não ` +
          `entra no almoxarifado.`
      );
    }

    // ═══ O ELEMENTO (TR 5.85) — antes de qualquer conta ═══
    // O rol oficial diz que o elemento EXISTE; o `ELEMENTOS_DE_ALMOXARIFADO` diz se ele
    // vira ESTOQUE. As duas perguntas são diferentes, e as duas são fail-closed.
    const natureza = liq.empenho.ficha.naturezaDespesa;
    const elemento = exigirElementoOficial(natureza.codElemento);
    if (ELEMENTOS_DE_ALMOXARIFADO[elemento.codigo] !== true) {
      throw new Error(
        `A liquidação ${liq.numero} nasceu do empenho ${liq.empenho.numero}, cuja ` +
          `natureza é ${natureza.codigoCompleto} — elemento ${elemento.codigo} ` +
          `("${elemento.nome}"). O almoxarifado guarda MATERIAL DE CONSUMO, e o rol ` +
          `vigente é {${Object.keys(ELEMENTOS_DE_ALMOXARIFADO).join(", ")}}. Dar ` +
          `entrada de estoque numa despesa que não comprou material infla o razão do ` +
          `estoque com um material que não existe, e o inventário nunca mais fecha. ` +
          `Se este elemento DEVE gerar estoque, isso é uma DECISÃO do ente — e ela ` +
          `entra no rol, não neste erro.`
      );
    }

    const liquidado = toMoney(liq.valor.toFixed(2));

    // A SOMA das entradas daquela liquidação (com o sinal — o estorno devolve espaço).
    const outras = await tx.movimentoAlmoxarifado.findMany({
      where: {
        liquidacaoId: d.liquidacaoId,
        tipo: { in: ["ENTRADA", "ESTORNO_ENTRADA"] },
      },
      select: { tipo: true, valor: true },
    });
    let jaEntrou = toMoney("0.00");
    for (const m of outras) {
      const v = toMoney(m.valor.toFixed(2));
      jaEntrou =
        m.tipo === "ENTRADA" ? toMoney(jaEntrou.plus(v)) : toMoney(jaEntrou.minus(v));
    }

    const depois = toMoney(jaEntrou.plus(d.valor));
    if (depois.greaterThan(liquidado)) {
      throw new Error(
        `ENTRADA MAIOR QUE A LIQUIDAÇÃO ${liq.numero}: ela liquidou ` +
          `${liquidado.toFixed(2)}, já deu entrada de ${jaEntrou.toFixed(2)} em ` +
          `almoxarifado, e agora daria mais ${d.valor.toFixed(2)} (total ` +
          `${depois.toFixed(2)}). Uma liquidação pode abastecer VÁRIAS classes — mas ` +
          `não mais material do que foi liquidado. Sem este limite, N classes seriam ` +
          `abastecidas com o mesmo dinheiro.`
      );
    }

    const criado = await tx.movimentoAlmoxarifado.create({
      data: {
        classeDeMaterialId: d.classeDeMaterialId,
        tipo: "ENTRADA",
        valor: d.valor.toFixed(2),
        dataMovimento: d.dataMovimento,
        liquidacaoId: d.liquidacaoId,
        // SEM lancamentoId: quem contabiliza é o M05 (ver o cabeçalho).
        motivo: `Entrada da liquidação ${liq.numero} na classe ${classe.codigo}`,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { movimentoId: criado.id };
  });
}

/** SAÍDA POR CONSUMO — D VPD (consumo) / C estoque. É AQUI que a despesa nasce. */
export async function registrarSaidaConsumo(
  prisma: PrismaClient,
  input: SaidaConsumoInput
): Promise<{ readonly movimentoId: string; readonly lancamentoId: string }> {
  const d = zSaidaConsumoInput.parse(input);

  return prisma.$transaction(async (tx) => {
    // SEM UG: a saída por consumo é da CLASSE (o estoque), e a classe não tem unidade. É aqui que a
    // despesa patrimonial nasce — mas ela nasce do ESTOQUE, não de uma ficha.
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarSaidaConsumo, "ENTE");

    await travarClasse(tx, d.classeDeMaterialId);
    const classe = await exigirClasse(tx, d.classeDeMaterialId);

    const saldo = await saldoDaClasseDeMaterial(tx, d.classeDeMaterialId);
    if (d.valor.greaterThan(saldo)) {
      throw new Error(
        `CONSUMO MAIOR QUE O ESTOQUE da classe ${classe.codigo}: consumir ` +
          `${d.valor.toFixed(2)} deixaria o estoque NEGATIVO — ele vale ` +
          `${saldo.toFixed(2)}. Não se consome o que não há.`
      );
    }

    const lancamentoId = await lancar(tx, {
      tipoDoRoteiro: "SAIDA_CONSUMO",
      inverter: false,
      codigo: classe.codigo,
      valor: d.valor,
      data: d.dataMovimento,
      classeDeMaterialId: d.classeDeMaterialId,
      criadoPor: d.criadoPor,
      historico: `Consumo de material da classe ${classe.codigo}`,
    });

    const criado = await tx.movimentoAlmoxarifado.create({
      data: {
        classeDeMaterialId: d.classeDeMaterialId,
        tipo: "SAIDA_CONSUMO",
        valor: d.valor.toFixed(2),
        dataMovimento: d.dataMovimento,
        lancamentoId,
        motivo: d.motivo,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { movimentoId: criado.id, lancamentoId };
  });
}

/** AJUSTE DE INVENTÁRIO — sobra (D estoque / C VPA) ou falta (D VPD / C estoque). */
export async function registrarAjusteAlmoxarifado(
  prisma: PrismaClient,
  input: AjusteAlmoxarifadoInput
): Promise<{ readonly movimentoId: string; readonly lancamentoId: string }> {
  const d = zAjusteAlmoxarifadoInput.parse(input);
  const tipo: TipoMovimentoAlmoxarifado =
    d.sentido === "SOBRA" ? "AJUSTE_ENTRADA" : "AJUSTE_SAIDA";

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarAjusteAlmoxarifado, "ENTE");

    await travarClasse(tx, d.classeDeMaterialId);
    const classe = await exigirClasse(tx, d.classeDeMaterialId);

    if (tipo === "AJUSTE_SAIDA") {
      const saldo = await saldoDaClasseDeMaterial(tx, d.classeDeMaterialId);
      if (d.valor.greaterThan(saldo)) {
        throw new Error(
          `AJUSTE DE FALTA MAIOR QUE O ESTOQUE da classe ${classe.codigo}: baixar ` +
            `${d.valor.toFixed(2)} deixaria o estoque NEGATIVO — ele vale ` +
            `${saldo.toFixed(2)}. O inventário não pode achar menos do que zero.`
        );
      }
    }

    const lancamentoId = await lancar(tx, {
      tipoDoRoteiro: tipo,
      inverter: false,
      codigo: classe.codigo,
      valor: d.valor,
      data: d.dataMovimento,
      classeDeMaterialId: d.classeDeMaterialId,
      criadoPor: d.criadoPor,
      historico: `Ajuste de inventário (${d.sentido}) na classe ${classe.codigo}`,
    });

    const criado = await tx.movimentoAlmoxarifado.create({
      data: {
        classeDeMaterialId: d.classeDeMaterialId,
        tipo,
        valor: d.valor.toFixed(2),
        dataMovimento: d.dataMovimento,
        lancamentoId,
        motivo: d.motivo,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { movimentoId: criado.id, lancamentoId };
  });
}

/**
 * ESTORNO — simétrico completo.
 *
 * ⚠️ A PORTA DA ENTRADA ESTÁ **FECHADA** — e ela foi ABERTA por um tempo, de propósito.
 *
 * Enquanto o M05 não tinha `AoAnularLiquidacaoPort` (furo declarado em e9cf648),
 * fechar esta porta deixaria a entrada de uma liquidação ANULADA sem NENHUM caminho de
 * correção: o material eterno na prateleira, e a amarração razão×movimentos acusando
 * sem que ninguém pudesse consertar. Uma porta fechada só é defensável quando existe a
 * porta certa — e ela não existia.
 *
 * Agora existe: anular a liquidação (total ou parcial) cascateia até aqui, na MESMA
 * transação. Então a porta fecha, e a mensagem aponta o caminho.
 */
export async function estornarMovimentoAlmoxarifado(
  prisma: PrismaClient,
  input: EstornarMovimentoAlmoxarifadoInput
): Promise<{ readonly movimentoId: string }> {
  const d = zEstornarMovimentoAlmoxarifadoInput.parse(input);

  return prisma.$transaction(async (tx) => {
    // ⚠️ O ESCOPO SEGUE O MOVIMENTO ESTORNADO: se era ENTRADA (tem liquidação), o estorno é ato da
    // unidade dela; se era AJUSTE de inventário, não é de unidade nenhuma. Ver `ugDoMovimentoAlmoxarifado`.
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.estornarMovimentoAlmoxarifado, { movimentoAlmoxarifado: d.movimentoId });

    const original = await tx.movimentoAlmoxarifado.findUnique({
      where: { id: d.movimentoId },
      select: {
        id: true,
        classeDeMaterialId: true,
        tipo: true,
        valor: true,
        liquidacaoId: true,
        estornos: { select: { id: true } },
      },
    });
    if (original === null) {
      throw new Error(`Movimento de almoxarifado ${d.movimentoId} não existe.`);
    }

    const tipo = TIPO_DO_ESTORNO_ALMOXARIFADO[original.tipo];
    if (tipo === null) {
      throw new Error(
        `${original.tipo} JÁ É um estorno — não se estorna um estorno. Para refazer o ` +
          `fato, registre-o de novo (append-only: o histórico não se reescreve).`
      );
    }

    // ═══ PORTA FECHADA: a ENTRADA nasceu de uma LIQUIDAÇÃO ═══
    if (original.liquidacaoId !== null && original.tipo === "ENTRADA") {
      throw new Error(
        `PORTA FECHADA: o movimento ${original.id} é uma ENTRADA que nasceu da ` +
          `liquidação ${original.liquidacaoId} (M05). Estorná-la aqui tiraria o material ` +
          `do almoxarifado e deixaria a despesa de pé — o razão diria que o ente comprou ` +
          `o que o estoque diz que não recebeu. ANULE A LIQUIDAÇÃO (total ou parcial): a ` +
          `entrada é estornada junto, na mesma transação.`
      );
    }

    await travarClasse(tx, original.classeDeMaterialId);
    const classe = await exigirClasse(tx, original.classeDeMaterialId);

    if (original.estornos.length > 0) {
      throw new Error(
        `Movimento de almoxarifado ${original.id} JÁ FOI ESTORNADO. Estornar duas vezes ` +
          `desfaria o valor em dobro.`
      );
    }

    const valor = toMoney(original.valor.toFixed(2));

    // ⚠️ ESTORNAR UMA SAÍDA DEVOLVE MATERIAL; ESTORNAR UMA ENTRADA O TIRA. Se o estorno
    // da entrada deixasse o estoque negativo (o material já foi consumido), é erro.
    const saldo = await saldoDaClasseDeMaterial(tx, original.classeDeMaterialId);
    if (SINAL_MOVIMENTO_ALMOXARIFADO[tipo] === -1 && valor.greaterThan(saldo)) {
      throw new Error(
        `ESTORNO DEIXARIA O ESTOQUE NEGATIVO na classe ${classe.codigo}: desfazer ` +
          `${valor.toFixed(2)} de um estoque de ${saldo.toFixed(2)}. O material já foi ` +
          `consumido — estorne primeiro a saída que o consumiu.`
      );
    }

    // A ENTRADA não tem lançamento próprio; seu estorno também não (o M05 é quem
    // desfaz o razão, ao anular a liquidação).
    const lancamentoId = TEM_ROTEIRO_ALMOXARIFADO[original.tipo]
      ? await lancar(tx, {
          tipoDoRoteiro: original.tipo,
          inverter: true,
          codigo: classe.codigo,
          valor,
          data: d.dataMovimento,
          classeDeMaterialId: original.classeDeMaterialId,
          criadoPor: d.criadoPor,
          historico: `Estorno de ${original.tipo} na classe ${classe.codigo}`,
        })
      : null;

    const criado = await tx.movimentoAlmoxarifado.create({
      data: {
        classeDeMaterialId: original.classeDeMaterialId,
        tipo,
        valor: valor.toFixed(2),
        dataMovimento: d.dataMovimento,
        liquidacaoId: original.liquidacaoId,
        lancamentoId,
        estornoDeId: original.id,
        motivo: d.motivo,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { movimentoId: criado.id };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// A AMARRAÇÃO — a segunda leitura (grão = CONTA, padrão do bloco 5)
// ═══════════════════════════════════════════════════════════════════════════

export async function conferirAlmoxarifadoContraRazao(
  prisma: Tx,
  contaContabilId: string
): Promise<{ readonly pelosMovimentos: Money; readonly peloRazao: Money }> {
  const classes = await prisma.classeDeMaterial.findMany({
    where: { contaContabilId },
    select: { id: true },
  });

  let pelosMovimentos = toMoney("0.00");
  for (const c of classes) {
    pelosMovimentos = toMoney(
      pelosMovimentos.plus(await saldoDaClasseDeMaterial(prisma, c.id))
    );
  }

  const partidas = await prisma.partidaContabil.findMany({
    where: { contaId: contaContabilId },
    select: { tipo: true, valor: true },
  });
  let peloRazao = toMoney("0.00");
  for (const p of partidas) {
    const v = toMoney(p.valor.toFixed(2));
    peloRazao =
      p.tipo === "DEBITO" ? toMoney(peloRazao.plus(v)) : toMoney(peloRazao.minus(v));
  }

  if (!pelosMovimentos.equals(peloRazao)) {
    const conta = await prisma.contaPcasp.findUnique({
      where: { id: contaContabilId },
      select: { codigo: true },
    });
    throw new Error(
      `ALMOXARIFADO NÃO FECHA COM O RAZÃO (conta ${conta?.codigo ?? contaContabilId}): ` +
        `os movimentos somam ${pelosMovimentos.toFixed(2)} e o razão tem ` +
        `${peloRazao.toFixed(2)}. Diferença: ` +
        `${peloRazao.minus(pelosMovimentos).toFixed(2)}. Duas leituras independentes do ` +
        `mesmo estoque discordaram: ou a liquidação debitou o estoque sem que o material ` +
        `desse ENTRADA (vinculação parcial — ver o MODULO.md), ou alguém movimentou a ` +
        `conta por fora dos serviços.`
    );
  }

  return { pelosMovimentos, peloRazao };
}

// ═══════════════════════════════════════════════════════════════════════════
// A CASCATA — o M10 implementando o `AoAnularLiquidacaoPort` que o M05 declarou
// ═══════════════════════════════════════════════════════════════════════════

/**
 * TOTAL: a liquidação inteira deixou de valer — TODAS as entradas dela caem.
 *
 * Cada uma com o SEU valor (a lição do `resolverPartidas` do M08: nunca um valor
 * único recarimbado). O estorno da ENTRADA não tem lançamento próprio — quem desfaz
 * o razão é o M05, invertendo as partidas da liquidação.
 *
 * ⚠️ FAIL-CLOSED: se o material já foi CONSUMIDO, o estorno deixaria o estoque
 * negativo — e a anulação INTEIRA é rejeitada. Não existe "anulou a liquidação mas o
 * material continua consumido": ou o estado fica coerente, ou nada acontece.
 */
export async function aoAnularLiquidacaoTotal(
  tx: Tx,
  liquidacaoId: string
): Promise<void> {
  const entradas = await tx.movimentoAlmoxarifado.findMany({
    where: { liquidacaoId, tipo: "ENTRADA" },
    select: {
      id: true,
      classeDeMaterialId: true,
      valor: true,
      dataMovimento: true,
      estornos: { select: { id: true } },
    },
  });

  for (const e of entradas) {
    if (e.estornos.length > 0) continue; // já estornada (idempotente)

    // ORDEM DOS LOCKS: a LIQUIDAÇÃO (posto 3) já está travada pelo M05; a CLASSE é o
    // posto 7. `packages/locks` recusaria a inversão.
    await travarClasse(tx, e.classeDeMaterialId);
    const classe = await exigirClasse(tx, e.classeDeMaterialId);

    const valor = toMoney(e.valor.toFixed(2));
    const saldo = await saldoDaClasseDeMaterial(tx, e.classeDeMaterialId);
    if (valor.greaterThan(saldo)) {
      throw new Error(
        `ANULAÇÃO DA LIQUIDAÇÃO DEIXARIA O ESTOQUE NEGATIVO (classe ${classe.codigo}): ` +
          `a entrada de ${valor.toFixed(2)} teria de ser desfeita, mas o estoque vale ` +
          `${saldo.toFixed(2)} — o material JÁ FOI CONSUMIDO. Estorne primeiro a saída ` +
          `que o consumiu. A anulação INTEIRA foi rejeitada: não existe "anulou a ` +
          `liquidação mas o material continua consumido".`
      );
    }

    await tx.movimentoAlmoxarifado.create({
      data: {
        classeDeMaterialId: e.classeDeMaterialId,
        tipo: "ESTORNO_ENTRADA",
        valor: valor.toFixed(2),
        dataMovimento: e.dataMovimento,
        liquidacaoId,
        estornoDeId: e.id,
        motivo: "Anulação da liquidação que trouxe o material.",
        criadoPor: "M05:anularLiquidacao",
      },
      select: { id: true },
    });
  }
}

/**
 * PARCIAL: a liquidação VALE MENOS agora — as entradas dela têm de CABER no novo
 * líquido.
 *
 * ⚠️ NÃO SE ESCOLHE QUAL ENTRADA CORTAR. Se as entradas somam mais do que a liquidação
 * passou a valer, a anulação parcial INTEIRA é rejeitada, nomeando os dois números.
 * Decidir sozinho qual classe perde material seria o sistema inventando um fato que
 * ninguém registrou — e é o operador quem sabe se o que voltou ao fornecedor foi o
 * papel ou o toner.
 */
export async function aoAnularLiquidacaoParcial(
  tx: Tx,
  liquidacaoId: string,
  liquidoPosAnulacao: Money
): Promise<void> {
  const entradas = await tx.movimentoAlmoxarifado.findMany({
    where: {
      liquidacaoId,
      tipo: { in: ["ENTRADA", "ESTORNO_ENTRADA"] },
    },
    select: { tipo: true, valor: true },
  });

  let vinculado = toMoney("0.00");
  for (const e of entradas) {
    const v = toMoney(e.valor.toFixed(2));
    vinculado =
      e.tipo === "ENTRADA" ? toMoney(vinculado.plus(v)) : toMoney(vinculado.minus(v));
  }

  if (vinculado.greaterThan(liquidoPosAnulacao)) {
    throw new Error(
      `ANULAÇÃO PARCIAL DEIXARIA A LIQUIDAÇÃO ABAIXO DO MATERIAL JÁ RECEBIDO: as ` +
        `entradas de almoxarifado desta liquidação somam ${vinculado.toFixed(2)}, e ela ` +
        `passaria a valer ${liquidoPosAnulacao.toFixed(2)}. O material está no ` +
        `almoxarifado — a despesa não pode reconhecer menos do que entrou. Estorne ` +
        `primeiro a entrada correspondente (o sistema não escolhe sozinho QUAL classe ` +
        `perde material: quem sabe o que voltou ao fornecedor é quem recebeu).`
    );
  }
}

/** O port do M05, implementado pelo dono do fato. */
export function criarAoAnularLiquidacaoPort(): {
  aoAnularTotal: (tx: Tx, id: string) => Promise<void>;
  aoAnularParcial: (tx: Tx, id: string, liquido: Money) => Promise<void>;
} {
  return {
    aoAnularTotal: aoAnularLiquidacaoTotal,
    aoAnularParcial: aoAnularLiquidacaoParcial,
  };
}
