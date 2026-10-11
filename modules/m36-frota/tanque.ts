import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import type { Tx } from "../m01-core-contabil/adapter-prisma.js";
import { toMoney } from "../../packages/contracts/index.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { SINAL_MOVIMENTO_FISICO } from "../m10-patrimonial/estoque-fisico-dominio.js";
import { chaveDaPosicao } from "../m10-patrimonial/estoque-fisico.js";
import { travar } from "../../packages/locks/index.js";
import { COMBUSTIVEIS, exigirQuantidade } from "./dominio.js";

/**
 * V39-R3 (R3-018, V39-068) — O TANQUE PRÓPRIO DE COMBUSTÍVEL.
 *
 * O tanque É um depósito do almoxarifado e o combustível é um material dele: recebimento pela liquidação (entrada
 * física, que confere a capacidade), saldo pela soma dos movimentos, inventário do almoxarifado. O abastecimento
 * interno é a SAÍDA do tanque, uma por abastecimento (`registrarAbastecimento` com `tanqueId`); o abastecimento em posto
 * externo continua sem tanque. Aqui só o cadastro, e a leitura do saldo.
 *
 * UNIDADES COERENTES: o tanque guarda combustível líquido, medido em litros. O material tem de ser da categoria
 * COMBUSTIVEL e ter o litro (sigla L) como unidade de estoque; gás natural (m³) e eletricidade não vão para tanque.
 */

export const zCadastrarTanqueDeCombustivel = z.object({
  codigo: z.string().trim().min(1, "Informe o código do tanque.").max(20, "O código tem até 20 caracteres."),
  descricao: z.string().trim().min(3, "Descreva o tanque (local, tipo)."),
  depositoId: z.string().min(1, "Escolha o depósito do almoxarifado que é o tanque."),
  materialId: z.string().min(1, "Escolha o combustível (material do almoxarifado)."),
  combustivel: z.enum(COMBUSTIVEIS),
  capacidade: z.string().trim().min(1, "Informe a capacidade em litros."),
  fundamento: z.string().trim().min(5, "Diga de onde vem a capacidade (placa do tanque, laudo, projeto)."),
  criadoPor: z.string().min(1),
});

export async function cadastrarTanqueDeCombustivel(prisma: PrismaClient, input: z.input<typeof zCadastrarTanqueDeCombustivel>): Promise<{ readonly id: string }> {
  const d = zCadastrarTanqueDeCombustivel.parse(input);
  const capacidade = exigirQuantidade(d.capacidade);
  if (d.combustivel === "GAS_NATURAL" || d.combustivel === "ELETRICIDADE") {
    throw new Error("O tanque guarda combustível líquido, medido em litros: gás natural e eletricidade não se estocam em tanque. Nada foi gravado.");
  }
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarTanqueDeCombustivel, "ENTE");
    // A posição travada antes de ler o saldo: uma entrada simultânea não passa sem conferir a capacidade.
    await travar(tx, "PosicaoFisicaDeEstoque", [chaveDaPosicao(d.materialId, d.depositoId)]);
    const [dep, mat, ja] = await Promise.all([
      tx.deposito.findUnique({ where: { id: d.depositoId }, select: { codigo: true, ativo: true, farmacia: { select: { id: true } }, tanque: { select: { codigo: true } } } }),
      tx.material.findUnique({ where: { id: d.materialId }, select: { codigo: true, categoria: true, controlaLote: true, unidades: { where: { ehDeEstoque: true }, select: { unidadeDeMedida: { select: { sigla: true } } } } } }),
      tx.tanqueDeCombustivel.findUnique({ where: { codigo: d.codigo }, select: { id: true } }),
    ]);
    if (dep === null) throw new Error("Depósito não encontrado. Nada foi gravado.");
    if (!dep.ativo) throw new Error(`O depósito ${dep.codigo} está inativo. Nada foi gravado.`);
    if (dep.tanque !== null) throw new Error(`O depósito ${dep.codigo} já é o tanque ${dep.tanque.codigo}. Nada foi gravado.`);
    if (dep.farmacia !== null) throw new Error(`O depósito ${dep.codigo} é o estoque de uma farmácia: não pode ser tanque. Nada foi gravado.`);
    if (ja !== null) throw new Error(`Já há tanque com o código ${d.codigo}. Nada foi gravado.`);
    if (mat === null) throw new Error("Material não encontrado. Nada foi gravado.");
    if (mat.categoria !== "COMBUSTIVEL") throw new Error(`O material ${mat.codigo} não é da categoria combustível. Nada foi gravado.`);
    if (mat.controlaLote) throw new Error(`O material ${mat.codigo} controla lote: o combustível do tanque se mistura e não sai por lote. Nada foi gravado.`);
    const outro = await tx.movimentoFisicoDeEstoque.findFirst({ where: { depositoId: d.depositoId, materialId: { not: d.materialId } }, select: { material: { select: { codigo: true } } } });
    if (outro !== null) throw new Error(`O depósito ${dep.codigo} já guarda ${outro.material.codigo}: o tanque guarda só o combustível dele. Nada foi gravado.`);
    const sigla = mat.unidades[0]?.unidadeDeMedida.sigla.toUpperCase();
    if (sigla !== "L") throw new Error(`O material ${mat.codigo} tem ${sigla ?? "nenhuma"} como unidade de estoque: o tanque se mede em litros (sigla L). Nada foi gravado.`);
    const atual = await saldoDoTanqueNaTx(tx, d.depositoId, d.materialId);
    if (atual.greaterThan(capacidade)) throw new Error(`O depósito ${dep.codigo} já tem ${atual.toFixed(2)} L de ${mat.codigo}, mais que a capacidade informada. Nada foi gravado.`);
    return tx.tanqueDeCombustivel.create({
      data: { codigo: d.codigo, descricao: d.descricao, depositoId: d.depositoId, materialId: d.materialId, combustivel: d.combustivel, capacidade, fundamento: d.fundamento, criadoPor: d.criadoPor },
      select: { id: true },
    });
  });
}

/** O saldo do combustível no tanque, pela soma dos movimentos físicos. Leitura; está no `FORA_DO_CENSO`. */
export async function saldoDoTanqueNaTx(tx: Tx, depositoId: string, materialId: string): Promise<ReturnType<typeof toMoney>> {
  const ms = await tx.movimentoFisicoDeEstoque.findMany({ where: { depositoId, materialId }, select: { tipo: true, quantidade: true } });
  return ms.reduce((t, m) => toMoney(t.plus(toMoney(m.quantidade.toFixed(4)).times(SINAL_MOVIMENTO_FISICO[m.tipo]))), toMoney(0));
}
