import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { toMoney } from "../../packages/contracts/index.js";
import { diaCivil, diaCivilBr, fimDoDiaCivil, meioDiaCivil } from "../../packages/datas/index.js";
import { travar } from "../../packages/locks/index.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { chaveDaPosicao, registrarAjusteFisicoNaTx, registrarSaidaFisicaNaTx, zRegistrarSaidaFisicaInput } from "../m10-patrimonial/estoque-fisico.js";

/**
 * V39-R2 (R2-030, R2-031) — A OPERAÇÃO DA FARMÁCIA PÚBLICA SOBRE O ESTOQUE DO ALMOXARIFADO.
 *
 * A farmácia aponta UM depósito (`DepositoDaFarmacia`), e o estoque dela é o desse depósito: a dispensação é a saída
 * física (com o lançamento do consumo, pelo mesmo corpo da saída do almoxarifado), a perda e a sobra são o ajuste
 * físico com o contábil. As regras do almoxarifado valem todas: lote obrigatório para material que controla lote,
 * saldo do lote e da posição, bloqueio de estoque, e LOTE VENCIDO NÃO SE ENTREGA (R2-029). O vencido sai só pela
 * PERDA, com o destino dado ao produto.
 *
 * DADO DE SAÚDE: a dispensação guarda o identificador do usuário na unidade, a receita e o prescritor — nenhum nome.
 *
 * ORDEM DAS TRAVAS: as classes dos materiais (posto 12), depois as posições (22), depois a farmácia (36, a numeração).
 *
 * ESCOPO: dispensar e ajustar cobram a ação na UG do depósito da farmácia, como a saída física do almoxarifado cobra a
 * dela. O lançamento do ajuste (VPD na perda, VPA na sobra) sai daqui sem a ação de ajuste de inventário do ente
 * (REGISTRAR_AJUSTE_ALMOXARIFADO): a perda ou sobra da farmácia é ato da unidade, como o consumo da saída.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;
const zDia = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data.");
// O formato da tela é o brasileiro: vírgula separa os decimais e o ponto só agrupa milhares ("1.000" é mil, "2,5" é dois
// e meio). Ponto fora do agrupamento ("2.5") é recusado: lê-lo como decimal entregaria mil vezes menos a quem quis "1.500".
const zQuantidade = z
  .string()
  .trim()
  .refine((s) => /^\d{1,3}(\.\d{3})*(,\d{1,4})?$|^\d+(,\d{1,4})?$/.test(s), "Informe a quantidade com vírgula nos decimais (ex.: 2,5 ou 1.000), até quatro casas.")
  .transform((s) => s.replace(/\./g, "").replace(",", "."))
  .refine((s) => Number(s) > 0, "A quantidade tem de ser maior que zero.");

/** A farmácia existe, estava ativa no dia e tem depósito. Devolve o depósito e a UG dele (o escopo da autorização). */
async function farmaciaComDeposito(tx: Tx, farmaciaId: string, dia: string): Promise<{ readonly codigo: string; readonly depositoId: string; readonly unidadeOrcId: string }> {
  const f = await tx.farmaciaPublica.findUnique({
    where: { id: farmaciaId },
    select: { codigo: true, versoes: { orderBy: { versao: "asc" }, select: { vigenteDesde: true, ativa: true } }, deposito: { select: { depositoId: true, deposito: { select: { unidadeOrcId: true, ativo: true, codigo: true } } } } },
  });
  if (f === null) throw new Error("Farmácia não encontrada. Nada foi gravado.");
  const vigente = f.versoes.filter((v) => diaCivil(v.vigenteDesde) <= dia).pop();
  if (vigente === undefined) throw new Error(`A farmácia ${f.codigo} ainda não existia em ${diaCivilBr(meioDiaCivil(dia))}. Nada foi gravado.`);
  if (!vigente.ativa) throw new Error(`A farmácia ${f.codigo} estava encerrada em ${diaCivilBr(meioDiaCivil(dia))}. Nada foi gravado.`);
  if (f.deposito === null) throw new Error(`A farmácia ${f.codigo} não tem depósito vinculado: vincule o depósito do almoxarifado que guarda o estoque dela. Nada foi gravado.`);
  if (!f.deposito.deposito.ativo) throw new Error(`O depósito ${f.deposito.deposito.codigo} da farmácia ${f.codigo} está inativo. Nada foi gravado.`);
  return { codigo: f.codigo, depositoId: f.deposito.depositoId, unidadeOrcId: f.deposito.deposito.unidadeOrcId };
}

/**
 * A DATA NÃO VOLTA ATRÁS DO ÚLTIMO MOVIMENTO DA POSIÇÃO. O saldo se confere até o dia do fato; um fato com data anterior
 * a movimentos já gravados deixaria a posição dos dias seguintes negativa (o que saiu no dia 12 contava com o que havia
 * no dia 11). Fail-closed: a farmácia registra com data igual ou posterior ao último movimento do medicamento.
 */
async function exigirSemMovimentoPosterior(tx: Tx, materialId: string, depositoId: string, dia: string): Promise<void> {
  const ultimo = await tx.movimentoFisicoDeEstoque.findFirst({ where: { materialId, depositoId, dataMovimento: { gt: fimDoDiaCivil(dia) } }, orderBy: { dataMovimento: "desc" }, select: { dataMovimento: true, material: { select: { codigo: true } } } });
  if (ultimo !== null) {
    throw new Error(`O medicamento ${ultimo.material.codigo} já tem movimento em ${diaCivilBr(ultimo.dataMovimento)}, depois de ${diaCivilBr(meioDiaCivil(dia))}: registrar antes dele deixaria o estoque dos dias seguintes negativo. Use uma data igual ou posterior ao último movimento. Nada foi gravado.`);
  }
}

/**
 * DADO DE SAÚDE NA TELA: o identificador do usuário e a receita só aparecem para quem pode dispensar NA UNIDADE do
 * depósito da farmácia — o mesmo critério do serviço que grava. Ter a ação em outra unidade não basta.
 */
export async function podeVerDadosDaDispensacao(tx: Tx, identificador: string, farmaciaId: string): Promise<boolean> {
  const f = await tx.farmaciaPublica.findUnique({ where: { id: farmaciaId }, select: { deposito: { select: { deposito: { select: { unidadeOrcId: true } } } } } });
  if (f === null || f.deposito === null) return false;
  try {
    await autorizarNo(tx, identificador, "DISPENSAR_MEDICAMENTO", { ug: f.deposito.deposito.unidadeOrcId });
    return true;
  } catch {
    return false;
  }
}

// ── o depósito da farmácia ──

export const zVincularDepositoAFarmacia = z.object({
  farmaciaId: z.string().min(1),
  depositoId: z.string().min(1, "Escolha o depósito."),
  fundamento: z.string().trim().min(5, "Diga por que este depósito é o estoque da farmácia (ato, organização da unidade)."),
  criadoPor: z.string().min(1),
});

export async function vincularDepositoAFarmacia(prisma: PrismaClient, input: z.input<typeof zVincularDepositoAFarmacia>): Promise<{ readonly id: string }> {
  const d = zVincularDepositoAFarmacia.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.vincularDepositoAFarmacia, "ENTE");
    await travar(tx, "FarmaciaPublica", [d.farmaciaId]);
    const [f, dep] = await Promise.all([
      tx.farmaciaPublica.findUnique({ where: { id: d.farmaciaId }, select: { codigo: true, deposito: { select: { deposito: { select: { codigo: true } } } } } }),
      tx.deposito.findUnique({ where: { id: d.depositoId }, select: { codigo: true, ativo: true, farmacia: { select: { farmacia: { select: { codigo: true } } } } } }),
    ]);
    if (f === null) throw new Error("Farmácia não encontrada. Nada foi gravado.");
    if (dep === null) throw new Error("Depósito não encontrado. Nada foi gravado.");
    if (f.deposito !== null) throw new Error(`A farmácia ${f.codigo} já tem o depósito ${f.deposito.deposito.codigo}: trocar mudaria de onde saiu o que já foi dispensado. Nada foi gravado.`);
    if (dep.farmacia !== null) throw new Error(`O depósito ${dep.codigo} já é o estoque da farmácia ${dep.farmacia.farmacia.codigo}. Nada foi gravado.`);
    if (!dep.ativo) throw new Error(`O depósito ${dep.codigo} está inativo. Nada foi gravado.`);
    return tx.depositoDaFarmacia.create({ data: { farmaciaId: d.farmaciaId, depositoId: d.depositoId, fundamento: d.fundamento, criadoPor: d.criadoPor }, select: { id: true } });
  });
}

// ── a dispensação ──

export const zDispensarMedicamentos = z.object({
  farmaciaId: z.string().min(1),
  data: zDia,
  identificacaoDoUsuario: z.string().trim().min(3, "Informe o identificador do usuário na unidade (cartão ou prontuário).").max(40, "O identificador tem até 40 caracteres."),
  receita: z.string().trim().min(3, "Informe a receita (número e data).").max(120, "A receita tem até 120 caracteres."),
  prescritor: z.string().trim().min(3, "Informe quem prescreveu, com o registro no conselho.").max(120, "O prescritor tem até 120 caracteres."),
  itens: z.array(z.object({ materialId: z.string().min(1, "Escolha o medicamento."), loteId: z.string().min(1, "Escolha o lote."), quantidade: zQuantidade })).min(1, "Informe ao menos um medicamento."),
  criadoPor: z.string().min(1),
});
export type DispensarMedicamentosInput = z.input<typeof zDispensarMedicamentos>;

export async function dispensarMedicamentos(prisma: PrismaClient, input: DispensarMedicamentosInput): Promise<{ readonly id: string; readonly numero: number; readonly itens: number }> {
  const d = zDispensarMedicamentos.parse(input);
  return prisma.$transaction(
    async (tx) => {
      const f = await farmaciaComDeposito(tx, d.farmaciaId, d.data);
      await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.dispensarMedicamentos, { ug: f.unidadeOrcId });
      const materiais = await tx.material.findMany({ where: { id: { in: [...new Set(d.itens.map((i) => i.materialId))] } }, select: { id: true, classeDeMaterialId: true } });
      if (materiais.length !== new Set(d.itens.map((i) => i.materialId)).size) throw new Error("Um dos medicamentos escolhidos não existe. Nada foi gravado.");
      await travar(tx, "ClasseDeMaterial", materiais.map((m) => m.classeDeMaterialId));
      await travar(tx, "PosicaoFisicaDeEstoque", materiais.map((m) => chaveDaPosicao(m.id, f.depositoId)));
      await travar(tx, "FarmaciaPublica", [d.farmaciaId]);
      for (const m of materiais) await exigirSemMovimentoPosterior(tx, m.id, f.depositoId, d.data);
      const ultimo = await tx.dispensacaoDeMedicamento.aggregate({ where: { farmaciaId: d.farmaciaId }, _max: { numero: true } });
      const numero = (ultimo._max.numero ?? 0) + 1;
      const dataMovimento = meioDiaCivil(d.data);
      const itens: { materialId: string; loteId: string; quantidade: string; movimentoFisicoId: string }[] = [];
      for (const i of d.itens) {
        const s = await registrarSaidaFisicaNaTx(tx, zRegistrarSaidaFisicaInput.parse({
          materialId: i.materialId, depositoId: f.depositoId, loteId: i.loteId, quantidade: i.quantidade, dataMovimento,
          motivo: `Dispensação nº ${String(numero)} da farmácia ${f.codigo}`, criadoPor: d.criadoPor,
        }));
        itens.push({ materialId: i.materialId, loteId: i.loteId, quantidade: toMoney(i.quantidade).toFixed(4), movimentoFisicoId: s.movimentoId });
      }
      const criada = await tx.dispensacaoDeMedicamento.create({
        data: { farmaciaId: d.farmaciaId, numero, data: dataMovimento, identificacaoDoUsuario: d.identificacaoDoUsuario, receita: d.receita, prescritor: d.prescritor, criadoPor: d.criadoPor, itens: { create: itens } },
        select: { id: true },
      });
      return { id: criada.id, numero, itens: itens.length };
    },
    { timeout: 60_000 }
  );
}

// ── a perda e a sobra ──

export const zRegistrarAjusteDaFarmacia = z
  .object({
    farmaciaId: z.string().min(1),
    sentido: z.enum(["PERDA", "SOBRA"]),
    materialId: z.string().min(1, "Escolha o medicamento."),
    loteId: z.string().min(1).optional(),
    quantidade: zQuantidade,
    data: zDia,
    motivo: z.string().trim().min(5, "Diga o motivo (vencimento, avaria, extravio, contagem do inventário)."),
    destino: z.string().trim().optional(),
    inventarioId: z.string().min(1).optional(),
    criadoPor: z.string().min(1),
  })
  .refine((x) => x.sentido === "SOBRA" || (x.destino !== undefined && x.destino.length >= 5), { message: "Na perda, diga para onde foi o produto (descarte, devolução ao fornecedor, ocorrência).", path: ["destino"] });
export type RegistrarAjusteDaFarmaciaInput = z.input<typeof zRegistrarAjusteDaFarmacia>;

export async function registrarAjusteDaFarmacia(prisma: PrismaClient, input: RegistrarAjusteDaFarmaciaInput): Promise<{ readonly id: string; readonly valor: string }> {
  const d = zRegistrarAjusteDaFarmacia.parse(input);
  return prisma.$transaction(
    async (tx) => {
      const f = await farmaciaComDeposito(tx, d.farmaciaId, d.data);
      await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarAjusteDaFarmacia, { ug: f.unidadeOrcId });
      if (d.inventarioId !== undefined) {
        const inv = await tx.inventarioDeEstoque.findUnique({ where: { id: d.inventarioId }, select: { depositoId: true } });
        if (inv === null || inv.depositoId !== f.depositoId) throw new Error("O inventário citado não é do depósito desta farmácia. Nada foi gravado.");
      }
      const mat = await tx.material.findUnique({ where: { id: d.materialId }, select: { classeDeMaterialId: true } });
      if (mat === null) throw new Error("Medicamento não encontrado. Nada foi gravado.");
      await travar(tx, "ClasseDeMaterial", [mat.classeDeMaterialId]);
      await travar(tx, "PosicaoFisicaDeEstoque", [chaveDaPosicao(d.materialId, f.depositoId)]);
      await exigirSemMovimentoPosterior(tx, d.materialId, f.depositoId, d.data);
      const destino = d.sentido === "PERDA" ? (d.destino ?? "") : null;
      const motivo = d.sentido === "PERDA" ? `Perda na farmácia ${f.codigo}: ${d.motivo}. Destino: ${destino ?? ""}` : `Sobra na farmácia ${f.codigo}: ${d.motivo}`;
      const a = await registrarAjusteFisicoNaTx(tx, {
        materialId: d.materialId, depositoId: f.depositoId, loteId: d.loteId ?? null, sentido: d.sentido, quantidade: toMoney(d.quantidade), dataMovimento: meioDiaCivil(d.data), motivo, criadoPor: d.criadoPor,
      });
      const criado = await tx.ajusteDaFarmacia.create({
        data: {
          farmaciaId: d.farmaciaId, sentido: d.sentido, materialId: d.materialId, loteId: d.loteId ?? null, quantidade: toMoney(d.quantidade).toFixed(4), data: meioDiaCivil(d.data),
          motivo: d.motivo, destino, inventarioId: d.inventarioId ?? null, movimentoFisicoId: a.movimentoId, criadoPor: d.criadoPor,
        },
        select: { id: true },
      });
      return { id: criado.id, valor: a.valorTotal.toFixed(2) };
    },
    { timeout: 60_000 }
  );
}
