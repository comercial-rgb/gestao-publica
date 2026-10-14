import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { Decimal } from "../../packages/contracts/index.js";
import { diaCivil, diaCivilBr, fimDoDiaCivil, janelaCivilDoMes, meioDiaCivil } from "../../packages/datas/index.js";
import { travar } from "../../packages/locks/index.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { posicaoDoMaterial } from "../m10-patrimonial/estoque-fisico.js";
import { depositoDaFarmaciaNoDia } from "./operacao.js";
import { motivoDoItemInvalido } from "./dominio.js";
import { exigirFarmaciaAtivaNoMes } from "./servico.js";

/**
 * V39-R3 (R3-022, V39-072) — A POSIÇÃO MENSAL DA FARMÁCIA CALCULADA DOS MOVIMENTOS.
 *
 * ═══ AS DUAS FONTES, NUNCA SOMADAS ═══
 * A posição do mês vem do informe digitado ou importado (o que já era) OU dos movimentos do depósito da farmácia neste
 * sistema — conforme o MODO ADOTADO pela farmácia a partir de um mês (`ModoDoInformeAdotado`, append-only). A remessa lê
 * uma fonte por mês, a do modo daquele mês. O informe importado de um mês anterior à adoção continua valendo (a
 * importação histórica); no modo calculado, o informe digitado é recusado (seria ignorado calado).
 *
 * ═══ O CÁLCULO É O DO ALMOXARIFADO ═══
 * A quantidade de cada material é `posicaoDoMaterial` no depósito da farmácia vigente no último dia do mês
 * (`depositoDaFarmaciaNoDia`), sem aritmética própria. Essa posição soma as quantidades com 2 casas; um movimento do
 * depósito com mais casas recusa o cálculo (fail-closed), em vez de confiar num arredondamento.
 *
 * ═══ O CÓDIGO DO PRODUTO É DO ENTE ═══
 * O informe pede o código do produto (de preferência o GTIN) e a descrição de até 60 caracteres. O material não tem
 * GTIN: o ente declara o código e a descrição de cada material (`CodigoDoMaterialNoInforme`). Material sem código
 * declarado recusa o cálculo, nomeado — o sistema não infere GTIN do código interno nem do CATMAT.
 *
 * Gravado como um `InformeDeEstoqueDaFarmacia` de origem CALCULADO: os anteriores ficam. Recalcular o mesmo mês com o
 * mesmo resultado devolve o informe existente; com resultado diferente (movimento registrado depois), grava outro e
 * vale o mais recente.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;
export type ModoDoInforme = "IMPORTADO" | "CALCULADO";

const mm = (ano: number, mes: number): string => `${String(mes).padStart(2, "0")}/${String(ano)}`;
const chave = (ano: number, mes: number): number => ano * 100 + mes;

/** AS ORIGENS QUE VALEM NUM MÊS, pelo modo dele: a remessa e a tela leem por aqui (uma regra, um lugar). Pura. */
export function origensDoModo(modo: ModoDoInforme): readonly ("DIGITADO" | "ARQUIVO" | "CALCULADO")[] {
  return modo === "CALCULADO" ? ["CALCULADO"] : ["DIGITADO", "ARQUIVO"];
}

/** O modo da farmácia num mês: a adoção mais recente com início até ele; sem adoção, IMPORTADO. Leitura. */
export async function modoDoInformeNoMes(tx: Tx, farmaciaId: string, ano: number, mes: number): Promise<{ readonly modo: ModoDoInforme; readonly desde: string | null }> {
  const adocoes = await tx.modoDoInformeAdotado.findMany({ where: { farmaciaId }, select: { modo: true, desdeAno: true, desdeMes: true } });
  const vigente = adocoes.filter((a) => chave(a.desdeAno, a.desdeMes) <= chave(ano, mes)).sort((a, b) => chave(a.desdeAno, a.desdeMes) - chave(b.desdeAno, b.desdeMes)).pop();
  return vigente === undefined ? { modo: "IMPORTADO", desde: null } : { modo: vigente.modo, desde: mm(vigente.desdeAno, vigente.desdeMes) };
}

const zAdotar = z.object({
  farmaciaId: z.string().min(1),
  modo: z.enum(["IMPORTADO", "CALCULADO"]),
  desdeAno: z.number().int().min(2000),
  desdeMes: z.number().int().min(1).max(12),
  fundamento: z.string().trim().min(10, "Diga por que a farmácia muda a fonte da posição do mês (a decisão, o ato)."),
  criadoPor: z.string().min(1),
});

/** Adota o modo a partir de um mês. Refazer a mesma adoção, ou adotar o modo que já vale naquele mês, recusa. */
export async function adotarModoDoInforme(prisma: PrismaClient, input: z.input<typeof zAdotar>): Promise<{ readonly id: string }> {
  const d = zAdotar.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.adotarModoDoInforme, "ENTE");
    await travar(tx, "FarmaciaPublica", [d.farmaciaId]);
    const f = await tx.farmaciaPublica.findUnique({ where: { id: d.farmaciaId }, select: { codigo: true } });
    if (f === null) throw new Error("Farmácia não encontrada. Nada foi gravado.");
    const ja = await tx.modoDoInformeAdotado.findUnique({ where: { farmaciaId_desdeAno_desdeMes: { farmaciaId: d.farmaciaId, desdeAno: d.desdeAno, desdeMes: d.desdeMes } }, select: { modo: true } });
    if (ja !== null) throw new Error(`A farmácia ${f.codigo} já tem modo adotado a partir de ${mm(d.desdeAno, d.desdeMes)}. Adote a partir de outro mês. Nada foi gravado.`);
    // A adoção não muda a fonte de mês que já tem posição (informada, importada ou calculada, talvez já remetida):
    // vale só daqui para frente, a partir de um mês ainda sem nenhum informe.
    const ultimoInforme = await tx.informeDeEstoqueDaFarmacia.findFirst({
      where: { farmaciaId: d.farmaciaId, OR: [{ ano: { gt: d.desdeAno } }, { ano: d.desdeAno, mes: { gte: d.desdeMes } }] },
      orderBy: [{ ano: "desc" }, { mes: "desc" }],
      select: { ano: true, mes: true },
    });
    if (ultimoInforme !== null) {
      throw new Error(`A farmácia ${f.codigo} já tem posição de ${mm(ultimoInforme.ano, ultimoInforme.mes)}: a mudança de fonte não alcança mês com posição. Adote a partir de ${mm(ultimoInforme.mes === 12 ? ultimoInforme.ano + 1 : ultimoInforme.ano, ultimoInforme.mes === 12 ? 1 : ultimoInforme.mes + 1)} ou depois. Nada foi gravado.`);
    }
    const atual = await modoDoInformeNoMes(tx, d.farmaciaId, d.desdeAno, d.desdeMes);
    if (atual.modo === d.modo) throw new Error(`Em ${mm(d.desdeAno, d.desdeMes)} a farmácia ${f.codigo} já está nesse modo. Nada foi gravado.`);
    const c = await tx.modoDoInformeAdotado.create({ data: { farmaciaId: d.farmaciaId, modo: d.modo, desdeAno: d.desdeAno, desdeMes: d.desdeMes, fundamento: d.fundamento, criadoPor: d.criadoPor }, select: { id: true } });
    return { id: c.id };
  });
}

const zCodigo = z.object({
  materialId: z.string().min(1),
  codigoProduto: z.string().trim(),
  descricao: z.string().trim(),
  fundamento: z.string().trim().min(5, "Diga de onde vem o código (a embalagem, o cadastro do fornecedor)."),
  criadoPor: z.string().min(1),
});

/** Declara o código e a descrição do material no informe. O mesmo código em dois materiais recusa (o informe os juntaria). */
export async function declararCodigoDoMaterialNoInforme(prisma: PrismaClient, input: z.input<typeof zCodigo>): Promise<{ readonly id: string }> {
  const d = zCodigo.parse(input);
  const motivo = motivoDoItemInvalido({ codigoProduto: d.codigoProduto, descricao: d.descricao, unidadeMedida: "UN", quantidade: "0" });
  if (motivo !== null) throw new Error(`${motivo.charAt(0).toUpperCase()}${motivo.slice(1)}. Nada foi gravado.`);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.declararCodigoDoMaterialNoInforme, "ENTE");
    const m = await tx.material.findUnique({ where: { id: d.materialId }, select: { codigo: true } });
    if (m === null) throw new Error("Material não encontrado. Nada foi gravado.");
    const vigentes = await codigosVigentes(tx);
    const outro = [...vigentes.entries()].find(([materialId, c]) => materialId !== d.materialId && c.codigoProduto === d.codigoProduto);
    if (outro !== undefined) throw new Error(`O código ${d.codigoProduto} já é do material ${outro[1].materialCodigo}. Nada foi gravado.`);
    const atual = vigentes.get(d.materialId);
    if (atual !== undefined && atual.codigoProduto === d.codigoProduto && atual.descricao === d.descricao) throw new Error(`O material ${m.codigo} já tem esse código e essa descrição. Nada foi gravado.`);
    const c = await tx.codigoDoMaterialNoInforme.create({ data: { materialId: d.materialId, codigoProduto: d.codigoProduto, descricao: d.descricao, fundamento: d.fundamento, criadoPor: d.criadoPor }, select: { id: true } });
    return { id: c.id };
  });
}

/** O código vigente (o mais recente) de cada material que tem um. Leitura. */
async function codigosVigentes(tx: Tx, materialIds?: readonly string[]): Promise<Map<string, { readonly codigoProduto: string; readonly descricao: string; readonly materialCodigo: string }>> {
  const linhas = await tx.codigoDoMaterialNoInforme.findMany({
    where: materialIds === undefined ? {} : { materialId: { in: [...materialIds] } },
    orderBy: [{ criadoEm: "asc" }, { id: "asc" }],
    select: { materialId: true, codigoProduto: true, descricao: true, material: { select: { codigo: true } } },
  });
  const m = new Map<string, { codigoProduto: string; descricao: string; materialCodigo: string }>();
  for (const l of linhas) m.set(l.materialId, { codigoProduto: l.codigoProduto, descricao: l.descricao, materialCodigo: l.material.codigo });
  return m;
}

const zCalcular = z.object({
  farmaciaId: z.string().min(1),
  ano: z.number().int().min(2000),
  mes: z.number().int().min(1).max(12),
  criadoPor: z.string().min(1),
  /** O dia de referência para "o mês já terminou". Injetável no teste; na tela, agora. */
  agora: z.date().optional(),
});

export interface ItemCalculado {
  readonly codigoProduto: string;
  readonly descricao: string;
  readonly unidadeMedida: string;
  readonly quantidade: string;
  readonly materialCodigo: string;
}

/** Calcula e grava a posição do mês. Só no modo CALCULADO daquele mês, e só com o mês terminado. */
export async function calcularInformeDaFarmacia(prisma: PrismaClient, input: z.input<typeof zCalcular>): Promise<{ readonly id: string; readonly novo: boolean; readonly itens: readonly ItemCalculado[]; readonly dia: string }> {
  const d = zCalcular.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.calcularInformeDaFarmacia, "ENTE");
    await travar(tx, "FarmaciaPublica", [d.farmaciaId]);
    const f = await tx.farmaciaPublica.findUnique({ where: { id: d.farmaciaId }, select: { codigo: true } });
    if (f === null) throw new Error("Farmácia não encontrada. Nada foi gravado.");
    const competencia = mm(d.ano, d.mes);
    await exigirFarmaciaAtivaNoMes(tx, d.farmaciaId, d.ano, d.mes);
    const modo = await modoDoInformeNoMes(tx, d.farmaciaId, d.ano, d.mes);
    if (modo.modo !== "CALCULADO") {
      throw new Error(`Em ${competencia} a farmácia ${f.codigo} informa a posição por digitação ou arquivo; o cálculo pelos movimentos vale a partir do mês em que for adotado. Nada foi gravado.`);
    }
    const fimDoMes = diaCivil(janelaCivilDoMes(`${String(d.ano)}-${String(d.mes).padStart(2, "0")}`).fim);
    if (diaCivil(d.agora ?? new Date()) <= fimDoMes) throw new Error(`O mês ${competencia} ainda não terminou: a posição do mês é a do dia ${diaCivilBr(meioDiaCivil(fimDoMes))}. Nada foi gravado.`);
    const depositoId = await depositoDaFarmaciaNoDia(tx, d.farmaciaId, fimDoMes);
    if (depositoId === null) throw new Error(`A farmácia ${f.codigo} não tem depósito vinculado: a posição calculada vem dos movimentos do depósito dela. Nada foi gravado.`);

    const movimentos = await tx.movimentoFisicoDeEstoque.findMany({
      where: { depositoId, dataMovimento: { lte: fimDoDiaCivil(fimDoMes) } },
      select: { materialId: true, quantidade: true, material: { select: { codigo: true } } },
    });
    const finos = [...new Set(movimentos.filter((m) => m.quantidade.decimalPlaces() > 2).map((m) => m.material.codigo))].sort();
    if (finos.length > 0) {
      throw new Error(`O depósito da farmácia tem movimento com mais de 2 casas na quantidade (${finos.join(", ")}); a posição do informe tem 2 casas e o cálculo não arredonda. Nada foi gravado.`);
    }
    const materialIds = [...new Set(movimentos.map((m) => m.materialId))];
    const [codigos, unidades] = await Promise.all([
      codigosVigentes(tx, materialIds),
      tx.materialUnidade.findMany({ where: { materialId: { in: materialIds }, ehDeEstoque: true }, select: { materialId: true, unidadeDeMedida: { select: { sigla: true } } } }),
    ]);
    const unidadeDe = new Map(unidades.map((u) => [u.materialId, u.unidadeDeMedida.sigla]));
    const codigoInterno = new Map(movimentos.map((m) => [m.materialId, m.material.codigo]));

    const itens: ItemCalculado[] = [];
    const semCodigo: string[] = [];
    const negativos: string[] = [];
    for (const materialId of materialIds) {
      const q = (await posicaoDoMaterial(tx, materialId, depositoId, fimDoMes)).quantidade;
      const interno = codigoInterno.get(materialId) ?? materialId;
      if (q.isNegative() && !q.isZero()) {
        negativos.push(`${interno} (${q.toFixed(2)})`);
        continue;
      }
      if (q.isZero()) continue;
      const c = codigos.get(materialId);
      if (c === undefined) {
        semCodigo.push(interno);
        continue;
      }
      const unidade = unidadeDe.get(materialId);
      if (unidade === undefined) throw new Error(`O material ${interno} não tem unidade de estoque cadastrada: o informe vai na unidade de estoque. Nada foi gravado.`);
      itens.push({ codigoProduto: c.codigoProduto, descricao: c.descricao, unidadeMedida: unidade, quantidade: new Decimal(q.toString()).toFixed(2), materialCodigo: interno });
    }
    if (negativos.length > 0) throw new Error(`A posição de ${negativos.sort().join(", ")} no fim de ${competencia} é negativa: os movimentos do depósito não fecham. Nada foi gravado.`);
    if (semCodigo.length > 0) {
      throw new Error(`Os materiais ${semCodigo.sort().join(", ")} têm estoque no fim de ${competencia} e não têm o código do produto no informe declarado. Declare o código (de preferência o GTIN) e a descrição de cada um. Nada foi gravado.`);
    }
    for (const i of itens) {
      const motivo = motivoDoItemInvalido(i);
      if (motivo !== null) throw new Error(`Material ${i.materialCodigo}: ${motivo}. Nada foi gravado.`);
    }
    if (itens.length === 0) {
      throw new Error(`Nenhum medicamento tem estoque no fim de ${competencia} no depósito da farmácia ${f.codigo}: a posição vazia não se grava calculada (confira o depósito vinculado e as entradas). Nada foi gravado.`);
    }
    itens.sort((a, b) => a.codigoProduto.localeCompare(b.codigoProduto));
    // Duas declarações simultâneas podem dar o mesmo código a dois materiais; o informe os juntaria. Recusa aqui.
    const repetido = itens.find((i, k) => k > 0 && itens[k - 1]!.codigoProduto === i.codigoProduto);
    if (repetido !== undefined) throw new Error(`O código ${repetido.codigoProduto} está declarado para mais de um material (${itens.filter((i) => i.codigoProduto === repetido.codigoProduto).map((i) => i.materialCodigo).join(", ")}). Corrija a declaração. Nada foi gravado.`);

    // O mesmo resultado do último cálculo do mês: devolve-o, sem gravar outro.
    const ultimo = await tx.informeDeEstoqueDaFarmacia.findFirst({
      where: { farmaciaId: d.farmaciaId, ano: d.ano, mes: d.mes, origem: "CALCULADO" },
      orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
      select: { id: true, itens: { orderBy: { codigoProduto: "asc" }, select: { codigoProduto: true, descricao: true, unidadeMedida: true, quantidade: true } } },
    });
    const assinatura = (xs: readonly { codigoProduto: string; descricao: string; unidadeMedida: string; quantidade: string }[]): string => xs.map((x) => `${x.codigoProduto}|${x.descricao}|${x.unidadeMedida}|${x.quantidade}`).join("\n");
    if (ultimo !== null && assinatura(ultimo.itens.map((x) => ({ ...x, quantidade: x.quantidade.toFixed(2) }))) === assinatura(itens)) {
      return { id: ultimo.id, novo: false, itens, dia: fimDoMes };
    }
    const deposito = await tx.deposito.findUnique({ where: { id: depositoId }, select: { codigo: true } });
    const c = await tx.informeDeEstoqueDaFarmacia.create({
      data: {
        farmaciaId: d.farmaciaId, ano: d.ano, mes: d.mes, origem: "CALCULADO", arquivoHash: null,
        fundamento: `Posição em ${diaCivilBr(meioDiaCivil(fimDoMes))} calculada dos movimentos do depósito ${deposito?.codigo ?? depositoId}.`,
        criadoPor: d.criadoPor,
        itens: { create: itens.map((i) => ({ codigoProduto: i.codigoProduto, descricao: i.descricao, unidadeMedida: i.unidadeMedida, quantidade: i.quantidade })) },
      },
      select: { id: true },
    });
    return { id: c.id, novo: true, itens, dia: fimDoMes };
  });
}
