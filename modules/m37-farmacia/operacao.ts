import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { toMoney } from "../../packages/contracts/index.js";
import { diaCivil, diaCivilBr, fimDoDiaCivil, meioDiaCivil } from "../../packages/datas/index.js";
import { travar } from "../../packages/locks/index.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { randomUUID } from "node:crypto";
import { compararPorDiaCivil } from "../../packages/datas/index.js";
import { estornarMovimentoAlmoxarifadoNaTx } from "../m10-patrimonial/almoxarifado.js";
import { SINAL_MOVIMENTO_FISICO } from "../m10-patrimonial/estoque-fisico-dominio.js";
import { chaveDaPosicao, estornarSaidaFisicaNaTx, registrarAjusteFisicoNaTx, registrarSaidaFisicaNaTx, zRegistrarSaidaFisicaInput } from "../m10-patrimonial/estoque-fisico.js";

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
    select: { codigo: true, versoes: { orderBy: { versao: "asc" }, select: { vigenteDesde: true, ativa: true } }, deposito: { select: { depositoId: true } } },
  });
  if (f === null) throw new Error("Farmácia não encontrada. Nada foi gravado.");
  const vigente = f.versoes.filter((v) => diaCivil(v.vigenteDesde) <= dia).pop();
  if (vigente === undefined) throw new Error(`A farmácia ${f.codigo} ainda não existia em ${diaCivilBr(meioDiaCivil(dia))}. Nada foi gravado.`);
  if (!vigente.ativa) throw new Error(`A farmácia ${f.codigo} estava encerrada em ${diaCivilBr(meioDiaCivil(dia))}. Nada foi gravado.`);
  if (f.deposito === null) throw new Error(`A farmácia ${f.codigo} não tem depósito vinculado: vincule o depósito do almoxarifado que guarda o estoque dela. Nada foi gravado.`);
  const depositoId = await depositoDaFarmaciaNoDia(tx, farmaciaId, dia);
  const dep = await tx.deposito.findUnique({ where: { id: depositoId ?? "" }, select: { unidadeOrcId: true, ativo: true, codigo: true } });
  if (depositoId === null || dep === null) throw new Error(`A farmácia ${f.codigo} não tem depósito vinculado: vincule o depósito do almoxarifado que guarda o estoque dela. Nada foi gravado.`);
  if (!dep.ativo) throw new Error(`O depósito ${dep.codigo} da farmácia ${f.codigo} está inativo. Nada foi gravado.`);
  return { codigo: f.codigo, depositoId, unidadeOrcId: dep.unidadeOrcId };
}

/**
 * V39-R3 (R3-010) — O DEPÓSITO DA FARMÁCIA NUM DIA: o da última troca com vigência até o dia, ou o primeiro vínculo.
 * Puro de leitura; o fato passado não usa isto (o depósito dele é o do movimento físico).
 */
export async function depositoDaFarmaciaNoDia(tx: Tx, farmaciaId: string, dia: string): Promise<string | null> {
  const [primeiro, trocas] = await Promise.all([
    tx.depositoDaFarmacia.findUnique({ where: { farmaciaId }, select: { depositoId: true } }),
    tx.trocaDoDepositoDaFarmacia.findMany({ where: { farmaciaId }, orderBy: { vigenteDesde: "asc" }, select: { depositoNovoId: true, vigenteDesde: true } }),
  ]);
  if (primeiro === null) return null;
  const valendo = trocas.filter((t) => diaCivil(t.vigenteDesde) <= dia).pop();
  return valendo?.depositoNovoId ?? primeiro.depositoId;
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

/** Depois da trava da farmácia: o depósito do dia ainda é o lido antes dela (uma troca concorrente não desvia o fato). */
async function exigirMesmoDeposito(tx: Tx, farmaciaId: string, dia: string, lido: string): Promise<void> {
  if ((await depositoDaFarmaciaNoDia(tx, farmaciaId, dia)) !== lido) {
    throw new Error("O depósito da farmácia foi trocado enquanto o registro era feito. Abra a tela de novo e repita. Nada foi gravado.");
  }
}

/**
 * DADO DE SAÚDE NA TELA: o identificador do usuário e a receita só aparecem para quem pode dispensar NA UNIDADE do
 * depósito da farmácia — o mesmo critério do serviço que grava. Ter a ação em outra unidade não basta.
 */
export async function podeVerDadosDaDispensacao(
  tx: Tx,
  identificador: string,
  farmaciaId: string,
  /** V39-R3 — a mesma régua serve para mostrar o formulário de perda ou sobra (a ação de ajuste, na unidade). */
  acao: "DISPENSAR_MEDICAMENTO" | "REGISTRAR_AJUSTE_DA_FARMACIA" | "CORRIGIR_DISPENSACAO_DE_MEDICAMENTO" = "DISPENSAR_MEDICAMENTO",
): Promise<boolean> {
  // V39-R3 — o depósito de HOJE (depois de uma troca, é o novo).
  const depositoId = await depositoDaFarmaciaNoDia(tx, farmaciaId, diaCivil(new Date()));
  const dep = depositoId === null ? null : await tx.deposito.findUnique({ where: { id: depositoId }, select: { unidadeOrcId: true } });
  if (dep === null) return false;
  try {
    await autorizarNo(tx, identificador, acao, { ug: dep.unidadeOrcId });
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
      tx.deposito.findUnique({ where: { id: d.depositoId }, select: { codigo: true, ativo: true, farmacia: { select: { farmacia: { select: { codigo: true } } } }, trocasComoNovo: { select: { farmacia: { select: { codigo: true } } } } } }),
    ]);
    if (f === null) throw new Error("Farmácia não encontrada. Nada foi gravado.");
    if (dep === null) throw new Error("Depósito não encontrado. Nada foi gravado.");
    if (f.deposito !== null) throw new Error(`A farmácia ${f.codigo} já tem o depósito ${f.deposito.deposito.codigo}. Para mudar, use a troca do depósito, com o dia de início: o vínculo não se refaz, porque mudaria de onde saiu o que já foi dispensado. Nada foi gravado.`);
    if (dep.farmacia !== null) throw new Error(`O depósito ${dep.codigo} já é o estoque da farmácia ${dep.farmacia.farmacia.codigo}. Nada foi gravado.`);
    const pelaTroca = dep.trocasComoNovo[0];
    if (pelaTroca !== undefined) throw new Error(`O depósito ${dep.codigo} já é ou foi o estoque da farmácia ${pelaTroca.farmacia.codigo}, por troca. Nada foi gravado.`);
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
      await exigirMesmoDeposito(tx, d.farmaciaId, d.data, f.depositoId);
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
      await travar(tx, "FarmaciaPublica", [d.farmaciaId]);
      await exigirMesmoDeposito(tx, d.farmaciaId, d.data, f.depositoId);
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

// ── V39-R3 (R3-009) — a correção da dispensação ──

export const zCorrigirDispensacao = z
  .object({
    dispensacaoId: z.string().min(1),
    tipo: z.enum(["CANCELAMENTO_DO_REGISTRO", "DEVOLUCAO"]),
    /** Na devolução, os itens devolvidos com a conferência de cada um; no cancelamento, ignorado (vão todos). */
    itens: z.array(z.object({ itemId: z.string().min(1), condicao: z.enum(["APTO_AO_REUSO", "INAPTO"]) })).default([]),
    data: zDia,
    motivo: z.string().trim().min(10, "Diga o motivo da correção, com pelo menos 10 caracteres."),
    conferidoPor: z.string().trim().optional(),
    destino: z.string().trim().optional(),
    criadoPor: z.string().min(1),
  })
  .refine((x) => x.tipo === "CANCELAMENTO_DO_REGISTRO" || x.itens.length > 0, { message: "Na devolução, marque ao menos um item devolvido e a condição dele.", path: ["itens"] })
  .refine((x) => x.tipo === "CANCELAMENTO_DO_REGISTRO" || (x.conferidoPor ?? "").length >= 3, { message: "Na devolução, diga quem conferiu o produto devolvido.", path: ["conferidoPor"] })
  .refine((x) => x.tipo === "CANCELAMENTO_DO_REGISTRO" || x.itens.every((i) => i.condicao === "APTO_AO_REUSO") || (x.destino ?? "").length >= 5, { message: "O item devolvido inapto não volta ao estoque: diga o destino dado a ele (descarte, recolhimento).", path: ["destino"] });
export type CorrigirDispensacaoInput = z.input<typeof zCorrigirDispensacao>;

/**
 * CORRIGIR A DISPENSAÇÃO, sem tocar no original (append-only).
 *   CANCELAMENTO_DO_REGISTRO: a entrega não aconteceu. Todos os itens voltam ao estoque — a saída física é estornada no
 *     mesmo lote e ao custo dela, e o consumo é estornado invertendo o lançamento original. Quem cancela não é quem
 *     dispensou (o registro incorreto é conferido por outra pessoa).
 *   DEVOLUCAO: o usuário trouxe o medicamento de volta. NADA volta ao estoque sem conferência: o item APTO_AO_REUSO volta
 *     (e só se o lote estiver dentro da validade no dia da devolução); o INAPTO não volta — o consumo fica — e o destino
 *     dado ao produto fica escrito.
 * Cada item se corrige uma vez (o banco garante: `itemId` único); o cancelamento recusa se algum item já foi corrigido.
 * ESCOPO: a ação de corrigir na UG do depósito em que a dispensação aconteceu (o do movimento, não o de hoje).
 * ORDEM DAS TRAVAS: classes (13), posições (23), farmácia (36) — a mesma da dispensação.
 */
export async function corrigirDispensacao(prisma: PrismaClient, input: CorrigirDispensacaoInput): Promise<{ readonly corrigidos: number; readonly devolvidosAoEstoque: number }> {
  const d = zCorrigirDispensacao.parse(input);
  return prisma.$transaction(
    async (tx) => {
      const disp = await tx.dispensacaoDeMedicamento.findUnique({
        where: { id: d.dispensacaoId },
        select: {
          id: true, numero: true, data: true, farmaciaId: true, criadoPor: true, farmacia: { select: { codigo: true } },
          itens: { select: { id: true, materialId: true, loteId: true, material: { select: { codigo: true, classeDeMaterialId: true } }, lote: { select: { identificacao: true, validade: true } }, movimentoFisico: { select: { id: true, depositoId: true, movimentoAlmoxarifadoId: true, deposito: { select: { unidadeOrcId: true } } } } } },
        },
      });
      if (disp === null) throw new Error("Dispensação não encontrada. Nada foi gravado.");
      const ug = disp.itens[0]?.movimentoFisico.deposito.unidadeOrcId;
      if (ug === undefined) throw new Error("A dispensação não tem itens. Nada foi gravado.");
      await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.corrigirDispensacao, { ug });
      const hoje = diaCivil(new Date());
      if (d.data < diaCivil(disp.data)) throw new Error(`A correção não pode ser anterior à dispensação nº ${String(disp.numero)} (${diaCivilBr(disp.data)}). Nada foi gravado.`);
      if (d.data > hoje) throw new Error("A correção não pode ter data futura. Nada foi gravado.");

      type Alvo = { readonly item: (typeof disp.itens)[number]; readonly condicao: "APTO_AO_REUSO" | "INAPTO" | null };
      const alvos: Alvo[] = d.tipo === "CANCELAMENTO_DO_REGISTRO"
        ? disp.itens.map((i) => ({ item: i, condicao: null }))
        : d.itens.map((x) => {
            const item = disp.itens.find((i) => i.id === x.itemId);
            if (item === undefined) throw new Error("Um dos itens devolvidos não é desta dispensação. Nada foi gravado.");
            return { item, condicao: x.condicao };
          });
      if (new Set(alvos.map((a) => a.item.id)).size !== alvos.length) throw new Error("O mesmo item foi informado duas vezes. Nada foi gravado.");
      if (d.tipo === "CANCELAMENTO_DO_REGISTRO" && disp.criadoPor === d.criadoPor) {
        throw new Error(`Quem dispensou não cancela o próprio registro: o cancelamento da dispensação nº ${String(disp.numero)} é conferido por outra pessoa da farmácia. Nada foi gravado.`);
      }

      await travar(tx, "ClasseDeMaterial", alvos.map((a) => a.item.material.classeDeMaterialId));
      await travar(tx, "PosicaoFisicaDeEstoque", alvos.map((a) => chaveDaPosicao(a.item.materialId, a.item.movimentoFisico.depositoId)));
      await travar(tx, "FarmaciaPublica", [disp.farmaciaId]);
      // Lido DEPOIS das travas: duas correções concorrentes do mesmo item não passam as duas (e o banco ainda tem o único).
      const jaCorrigidos = await tx.correcaoDoItemDaDispensacao.findMany({ where: { itemId: { in: alvos.map((a) => a.item.id) } }, select: { itemId: true, tipo: true } });
      const primeiro = jaCorrigidos[0];
      if (primeiro !== undefined) {
        const r = alvos.find((a) => a.item.id === primeiro.itemId);
        throw new Error(`O item ${r?.item.material.codigo ?? ""} lote ${r?.item.lote.identificacao ?? ""} da dispensação nº ${String(disp.numero)} já foi corrigido (${primeiro.tipo === "DEVOLUCAO" ? "devolução" : "cancelamento"}). Cada item se corrige uma vez. Nada foi gravado.`);
      }
      for (const a of alvos) {
        if (a.condicao === "APTO_AO_REUSO" && a.item.lote.validade !== null && compararPorDiaCivil(a.item.lote.validade, meioDiaCivil(d.data)) < 0) {
          throw new Error(`O lote ${a.item.lote.identificacao} venceu em ${diaCivilBr(a.item.lote.validade)}: o medicamento devolvido não volta ao estoque disponível. Registre-o como inapto, com o destino. Nada foi gravado.`);
        }
      }

      const operacaoId = randomUUID();
      const dataMovimento = meioDiaCivil(d.data);
      const rotulo = d.tipo === "CANCELAMENTO_DO_REGISTRO" ? "Cancelamento do registro" : "Devolução";
      let devolvidos = 0;
      for (const a of alvos) {
        let movimentoFisicoId: string | null = null;
        if (a.condicao !== "INAPTO") {
          const almoxId = a.item.movimentoFisico.movimentoAlmoxarifadoId;
          if (almoxId === null) throw new Error(`A saída do item ${a.item.material.codigo} não tem o lançamento do consumo: não há o que estornar no razão. Nada foi gravado.`);
          const motivo = `${rotulo} da dispensação nº ${String(disp.numero)} da farmácia ${disp.farmacia.codigo}: ${d.motivo}`;
          const contabil = await estornarMovimentoAlmoxarifadoNaTx(tx, { movimentoId: almoxId, dataMovimento, motivo, criadoPor: d.criadoPor });
          movimentoFisicoId = (await estornarSaidaFisicaNaTx(tx, { movimentoId: a.item.movimentoFisico.id, dataMovimento, motivo, criadoPor: d.criadoPor, movimentoAlmoxarifadoId: contabil.movimentoId })).movimentoId;
          devolvidos += 1;
        }
        await tx.correcaoDoItemDaDispensacao.create({
          data: {
            itemId: a.item.id, tipo: d.tipo, condicao: a.condicao, data: dataMovimento, motivo: d.motivo,
            conferidoPor: d.tipo === "DEVOLUCAO" ? (d.conferidoPor ?? null) : null,
            destino: a.condicao === "INAPTO" ? (d.destino ?? null) : null,
            movimentoFisicoId, operacaoId, criadoPor: d.criadoPor,
          },
        });
      }
      return { corrigidos: alvos.length, devolvidosAoEstoque: devolvidos };
    },
    { timeout: 60_000 }
  );
}

// ── V39-R3 (R3-010) — a troca do depósito da farmácia ──

export const zTrocarDepositoDaFarmacia = z.object({
  farmaciaId: z.string().min(1),
  depositoNovoId: z.string().min(1, "Escolha o depósito novo."),
  vigenteDesde: zDia,
  fundamento: z.string().trim().min(5, "Diga por que o estoque da farmácia muda de depósito (ato, reorganização)."),
  criadoPor: z.string().min(1),
});

/**
 * TROCAR O DEPÓSITO DA FARMÁCIA a partir de um dia. O estoque NÃO se transfere pela troca: o que estiver no depósito
 * anterior continua lá, e sai por transferência do almoxarifado (ato próprio, com a conferência dele). Os fatos já
 * registrados continuam no depósito em que aconteceram (o do movimento físico).
 * RECUSA: vigência anterior a hoje ou ao último fato da farmácia (um fato passado mudaria de depósito pela regra da
 * vigência); inventário aberto no depósito anterior (a contagem em andamento perderia o dono); depósito novo inativo,
 * igual ao atual, ou que já é ou foi estoque de outra farmácia.
 */
export async function trocarDepositoDaFarmacia(prisma: PrismaClient, input: z.input<typeof zTrocarDepositoDaFarmacia>): Promise<{ readonly id: string; readonly materiaisNoAnterior: number }> {
  const d = zTrocarDepositoDaFarmacia.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.trocarDepositoDaFarmacia, "ENTE");
    await travar(tx, "FarmaciaPublica", [d.farmaciaId]);
    const f = await tx.farmaciaPublica.findUnique({ where: { id: d.farmaciaId }, select: { codigo: true } });
    if (f === null) throw new Error("Farmácia não encontrada. Nada foi gravado.");
    const anterior = await depositoDaFarmaciaNoDia(tx, d.farmaciaId, d.vigenteDesde);
    if (anterior === null) throw new Error(`A farmácia ${f.codigo} ainda não tem depósito: use o vínculo, não a troca. Nada foi gravado.`);
    if (d.vigenteDesde < diaCivil(new Date())) throw new Error("A troca vale de hoje em diante: uma data passada mudaria o depósito de dias já operados. Nada foi gravado.");
    const futura = await tx.trocaDoDepositoDaFarmacia.findFirst({ where: { farmaciaId: d.farmaciaId, vigenteDesde: { gte: meioDiaCivil(d.vigenteDesde) } }, select: { vigenteDesde: true } });
    if (futura !== null) throw new Error(`Já há troca do depósito da farmácia ${f.codigo} vigente a partir de ${diaCivilBr(futura.vigenteDesde)}. Nada foi gravado.`);
    const [ultimaDisp, ultimoAjuste] = await Promise.all([
      tx.dispensacaoDeMedicamento.findFirst({ where: { farmaciaId: d.farmaciaId }, orderBy: { data: "desc" }, select: { data: true } }),
      tx.ajusteDaFarmacia.findFirst({ where: { farmaciaId: d.farmaciaId }, orderBy: { data: "desc" }, select: { data: true } }),
    ]);
    const ultimoFato = [ultimaDisp?.data, ultimoAjuste?.data].filter((x): x is Date => x !== undefined).map((x) => diaCivil(x)).sort().pop();
    if (ultimoFato !== undefined && d.vigenteDesde <= ultimoFato) {
      throw new Error(`A farmácia ${f.codigo} já registrou fato em ${diaCivilBr(meioDiaCivil(ultimoFato))}: a troca vale a partir do dia seguinte ao último fato, para nenhum fato mudar de depósito. Nada foi gravado.`);
    }
    if (anterior === d.depositoNovoId) throw new Error("O depósito escolhido já é o da farmácia nessa data. Nada foi gravado.");
    const novo = await tx.deposito.findUnique({ where: { id: d.depositoNovoId }, select: { codigo: true, ativo: true, farmacia: { select: { farmaciaId: true } }, trocasComoNovo: { select: { farmaciaId: true } } } });
    if (novo === null) throw new Error("Depósito não encontrado. Nada foi gravado.");
    if (!novo.ativo) throw new Error(`O depósito ${novo.codigo} está inativo. Nada foi gravado.`);
    const deOutra = [novo.farmacia?.farmaciaId, ...novo.trocasComoNovo.map((t) => t.farmaciaId)].some((x) => x !== undefined && x !== d.farmaciaId);
    if (deOutra) throw new Error(`O depósito ${novo.codigo} já é ou foi o estoque de outra farmácia: o histórico dela ficaria misturado com o desta. Nada foi gravado.`);
    const aberto = await tx.inventarioDeEstoque.findFirst({ where: { depositoId: anterior, dataFechamento: null }, select: { dataAbertura: true } });
    if (aberto !== null) throw new Error(`Há inventário aberto em ${diaCivilBr(aberto.dataAbertura)} no depósito atual da farmácia: feche-o antes de trocar, para a contagem não ficar sem dono. Nada foi gravado.`);
    const criada = await tx.trocaDoDepositoDaFarmacia.create({
      data: { farmaciaId: d.farmaciaId, depositoAnteriorId: anterior, depositoNovoId: d.depositoNovoId, vigenteDesde: meioDiaCivil(d.vigenteDesde), fundamento: d.fundamento, criadoPor: d.criadoPor },
      select: { id: true },
    });
    const movs = await tx.movimentoFisicoDeEstoque.findMany({ where: { depositoId: anterior }, select: { materialId: true, tipo: true, quantidade: true } });
    const saldo = new Map<string, ReturnType<typeof toMoney>>();
    for (const m of movs) saldo.set(m.materialId, toMoney((saldo.get(m.materialId) ?? toMoney(0)).plus(toMoney(m.quantidade.toFixed(4)).times(SINAL_MOVIMENTO_FISICO[m.tipo]))));
    return { id: criada.id, materiaisNoAnterior: [...saldo.values()].filter((v) => v.greaterThan(0)).length };
  });
}
