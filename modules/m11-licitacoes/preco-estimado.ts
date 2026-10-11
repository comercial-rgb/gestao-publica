import { z } from "zod";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { Decimal } from "../../packages/contracts/index.js";
import { diaCivil, diaCivilBr } from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";

/**
 * V39-R3 (R3-020, V39-040) — O PREÇO ESTIMADO DO ITEM, FIXADO COM MÉTODO, FONTES E MEMÓRIA.
 *
 * Fonte: Instrução Normativa SEGES/ME nº 65/2021, arts. 5º e 6º (docs/oficial/compras/).
 *   · o método é declarado: média, mediana ou o menor dos valores (art. 6º);
 *   · cada preço usado tem a origem verificável: o parâmetro de onde veio (art. 5º, I a V), o dia do preço e o
 *     documento que o prova — a cotação sem isso não entra (não se reduz a pesquisa a uma média sem origem);
 *   · os descartes (inexequível, inconsistente, excessivamente elevado) vão com o motivo (art. 6º, § 3º);
 *   · com menos preços que o mínimo da regra (carregada do texto oficial), só com a justificativa do gestor. O art. 6º,
 *     § 5º pede também a aprovação da autoridade competente: o sistema NÃO a registra (pendência nomeada no MODULO.md);
 *   · a regra vale pela DATA DA PESQUISA, não pelo dia em que se fixa;
 *   · preço de dia futuro não é preço verificável. Os prazos de validade (6 meses, 1 ano) dependem da data do edital e
 *     não são conferidos aqui (pendência nomeada).
 * O cálculo é UM só (\`precoPeloMetodo\`), sobre Decimal. Gravado append-only, com a memória; vale o mais recente.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;
export type MetodoDoPreco = "MEDIA" | "MEDIANA" | "MENOR";

/** O preço pelo método, sobre os valores usados (já sem os descartes). Pura. */
export function precoPeloMetodo(valores: readonly Decimal[], metodo: MetodoDoPreco): Decimal {
  if (valores.length === 0) throw new Error("Sem preço nenhum não há preço estimado.");
  const ordenados = [...valores].sort((a, b) => a.comparedTo(b));
  if (metodo === "MENOR") return ordenados[0]!;
  if (metodo === "MEDIA") return ordenados.reduce((t, v) => t.plus(v), new Decimal(0)).dividedBy(ordenados.length).toDecimalPlaces(6);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 1 ? ordenados[meio]! : ordenados[meio - 1]!.plus(ordenados[meio]!).dividedBy(2).toDecimalPlaces(6);
}

/**
 * A ESTIMATIVA DA PESQUISA: Σ quantidade × preço fixado, com o preço nas 6 casas guardadas e UM arredondamento no fim
 * (2 casas, meio para cima). Arredondar o preço antes de multiplicar muda o total (10,333333 × 500 = 5.166,67, não
 * 5.165,00). Item sem preço fixado: null — a estimativa não se mostra pela metade. Pura.
 */
export function estimativaPeloFixado(itens: readonly { readonly quantidade: Decimal; readonly fixado: Decimal | null }[]): { readonly total: Decimal | null; readonly semFixar: number } {
  const semFixar = itens.filter((i) => i.fixado === null).length;
  if (itens.length === 0 || semFixar > 0) return { total: null, semFixar };
  const total = itens.reduce((s, i) => s.plus(i.quantidade.times(i.fixado!)), new Decimal(0));
  return { total: total.toDecimalPlaces(2, Decimal.ROUND_HALF_UP), semFixar: 0 };
}

export const zFixarPrecoEstimado = z.object({
  itemId: z.string().min(1),
  metodo: z.enum(["MEDIA", "MEDIANA", "MENOR"]),
  descartes: z.array(z.object({ cotacaoId: z.string().min(1), motivo: z.string().trim().min(10, "O descarte de um preço precisa do motivo (inexequível, inconsistente ou excessivamente elevado, e por quê).") })).default([]),
  justificativaMenosPrecos: z.string().trim().optional(),
  /** O dia de referência para "preço de dia futuro". Injetável no teste; na tela, agora. */
  agora: z.date().optional(),
  criadoPor: z.string().min(1),
});

export async function fixarPrecoEstimado(prisma: PrismaClient, input: z.input<typeof zFixarPrecoEstimado>): Promise<{ readonly precoId: string; readonly valorEstimado: string; readonly precosUsados: number }> {
  const d = zFixarPrecoEstimado.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.fixarPrecoEstimado, "ENTE");
    const item = await tx.itemDePesquisaDePrecos.findUnique({
      where: { id: d.itemId },
      select: {
        id: true, pesquisa: { select: { numero: true, data: true } }, material: { select: { codigo: true } },
        cotacoes: { select: { id: true, valorUnitario: true, parametro: true, dataDoPreco: true, documento: true, fornecedor: { select: { documento: true, versoes: { select: { nome: true }, orderBy: { criadoEm: "desc" }, take: 1 } } } } },
      },
    });
    if (item === null) throw new Error("Item da pesquisa de preços não encontrado. Nada foi gravado.");
    const regra = await regraVigente(tx, item.pesquisa.data);
    const descartados = new Map(d.descartes.map((x) => [x.cotacaoId, x.motivo]));
    for (const id of descartados.keys()) if (!item.cotacoes.some((c) => c.id === id)) throw new Error("O descarte aponta uma cotação que não é deste item. Nada foi gravado.");
    const usadas = item.cotacoes.filter((c) => !descartados.has(c.id));
    if (usadas.length === 0) throw new Error(`O item ${item.material.codigo} ficou sem preço depois dos descartes. Nada foi gravado.`);
    // Origem verificável: cada preço usado diz de onde veio, de que dia é e que documento o prova.
    const semOrigem = usadas.filter((c) => c.parametro === null || c.dataDoPreco === null || (c.documento ?? "").trim() === "");
    const hoje = diaCivil(d.agora ?? new Date());
    const futuros = usadas.filter((c) => c.dataDoPreco !== null && diaCivil(c.dataDoPreco) > hoje);
    if (futuros.length > 0) {
      throw new Error(
        `${String(futuros.length)} preço(s) do item ${item.material.codigo} com o dia do preço depois de hoje (${futuros.map((c) => diaCivilBr(c.dataDoPreco!)).join(", ")}): ` +
          `preço de dia futuro não se confere. Corrija o dia ou descarte-o com o motivo. Nada foi gravado.`
      );
    }
    if (semOrigem.length > 0) {
      throw new Error(
        `${String(semOrigem.length)} preço(s) do item ${item.material.codigo} sem a origem verificável (parâmetro, dia do preço e documento): ` +
          `${semOrigem.map((c) => c.fornecedor.versoes[0]?.nome ?? "fornecedor sem nome cadastrado").join(", ")}. Complete-os ou descarte-os com o motivo. Nada foi gravado.`
      );
    }
    const justificativa = (d.justificativaMenosPrecos ?? "").trim();
    if (usadas.length < regra.minimoDePrecos && justificativa.length < 20) {
      throw new Error(
        `O preço estimado do item ${item.material.codigo} usaria ${String(usadas.length)} preço(s), e a regra pede ${String(regra.minimoDePrecos)} ou mais. ` +
          (justificativa === ""
            ? "Com menos, só com a justificativa do gestor (ao menos 20 caracteres)."
            : `A justificativa tem ${String(justificativa.length)} caractere(s); precisa de ao menos 20.`) +
          " Nada foi gravado."
      );
    }
    // Duas fixações do mesmo item ao mesmo tempo gravam as duas (append-only); vale a mais recente. Não há saldo em jogo.
    const valores = usadas.map((c) => new Decimal(c.valorUnitario.toString()));
    const valor = precoPeloMetodo(valores, d.metodo);
    const p = await tx.precoEstimadoDoItem.create({
      data: {
        itemId: item.id, metodo: d.metodo, valorEstimado: valor.toFixed(6), precosUsados: usadas.length,
        memoria: usadas.map((c) => ({ cotacaoId: c.id, fornecedor: c.fornecedor.documento, valor: c.valorUnitario.toString(), parametro: c.parametro, dataDoPreco: c.dataDoPreco === null ? null : diaCivil(c.dataDoPreco), documento: c.documento })),
        descartes: item.cotacoes.filter((c) => descartados.has(c.id)).map((c) => ({ cotacaoId: c.id, fornecedor: c.fornecedor.documento, valor: c.valorUnitario.toString(), motivo: descartados.get(c.id) })),
        justificativaMenosPrecos: usadas.length < regra.minimoDePrecos ? justificativa : null,
        regraId: regra.id, criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { precoId: p.id, valorEstimado: valor.toFixed(6), precosUsados: usadas.length };
  });
}

/** A regra vigente do número mínimo de preços; sem ela, não se fixa (fail-closed). Leitura. */
export async function regraVigente(tx: Tx, em: Date): Promise<{ readonly id: string; readonly minimoDePrecos: number; readonly fonte: string }> {
  const r = await tx.regraDaPesquisaDePrecos.findFirst({ where: { vigenteDesde: { lte: em } }, orderBy: { vigenteDesde: "desc" }, select: { id: true, minimoDePrecos: true, fonte: true } });
  if (r === null) throw new Error("Não há regra do número mínimo de preços vigente na data desta pesquisa; o preço estimado não se fixa sem ela. Peça ao suporte a carga da regra. Nada foi gravado.");
  return r;
}
