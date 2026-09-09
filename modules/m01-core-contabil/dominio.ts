import { z } from "zod";
import { zMoney } from "../../packages/contracts/index.js";
import {
  validarLancamento,
  type Partida,
} from "../../packages/ledger/index.js";

/**
 * DOMAIN do M01 — SEM I/O. Schemas Zod de entrada + composição de partidas.
 *
 * Valida FORMA (Zod) e delega os invariantes contábeis ao motor puro de
 * packages/ledger. A regra "conta é analítica" NÃO mora aqui: ela precisa do
 * banco e vive no adapter (INVARIANTE 5).
 */

// ═══════════════════════════════════════════════════════════════════════════
// A ESTRUTURA DO PCASP — estável, e por isso PODE ser código.
//
// O PLANO de contas do ente é dado (vem por parâmetro/tabela, nunca inventado no
// código). Mas a NATUREZA DE SALDO de cada CLASSE não é escolha do ente: é a
// estrutura do PCASP (MCASP, Parte IV — "Plano de Contas Aplicado ao Setor
// Público"), e ela vale para todo ente do país.
//
//   1 ATIVO                          → DEVEDORA
//   2 PASSIVO E PATRIMÔNIO LÍQUIDO   → CREDORA
//   3 VARIAÇÃO PATRIMONIAL DIMINUTIVA→ DEVEDORA
//   4 VARIAÇÃO PATRIMONIAL AUMENTATIVA→ CREDORA
//
// As classes 5 a 8 (orçamentário e controle) NÃO entram no Balanço Patrimonial —
// elas não têm natureza patrimonial, e por isso não estão neste Record.
// ═══════════════════════════════════════════════════════════════════════════

export type NaturezaDeSaldo = "DEVEDORA" | "CREDORA";
export type ClassePcasp = "1" | "2" | "3" | "4";

export const CLASSE_PCASP: Record<
  ClassePcasp,
  { readonly natureza: NaturezaDeSaldo; readonly nome: string }
> = {
  "1": { natureza: "DEVEDORA", nome: "ATIVO" },
  "2": { natureza: "CREDORA", nome: "PASSIVO E PATRIMÔNIO LÍQUIDO" },
  "3": { natureza: "DEVEDORA", nome: "VARIAÇÃO PATRIMONIAL DIMINUTIVA" },
  "4": { natureza: "CREDORA", nome: "VARIAÇÃO PATRIMONIAL AUMENTATIVA" },
};

/** A classe de uma conta é o 1º dígito. `null` = fora do patrimonial (5 a 8). */
export function classeDaConta(codigo: string): ClassePcasp | null {
  const d = codigo.charAt(0);
  return d === "1" || d === "2" || d === "3" || d === "4" ? d : null;
}

/**
 * AS CLASSES DE CONTROLE (5 a 8) — e por que elas NÃO entram no `CLASSE_PCASP`.
 *
 * Aquele Record diz a NATUREZA DE SALDO da classe: todo ativo é devedor, todo passivo
 * é credor. Nas classes 5 a 8 isso NÃO é verdade — a 6 tem contas credoras (crédito
 * disponível) e devedoras (receita realizada, no roteiro do M04), e é o PLANO que
 * decide, conta a conta, na coluna `naturezaSaldo`. Um Record de classe aqui inventaria
 * uma regra que a norma não tem, e o saldo sairia com o sinal trocado em metade delas.
 *
 * Por isso o saldo de uma conta de controle sai de `saldosDeControle` (que lê o plano),
 * e nunca de `saldoComNatureza` (que lê o Record). São duas perguntas diferentes.
 */
export type ClasseDeControle = "5" | "6" | "7" | "8";

/** O 1º dígito, quando ele é de controle. `null` = é patrimonial (1 a 4). */
export function classeDeControle(codigo: string): ClasseDeControle | null {
  const d = codigo.charAt(0);
  return d === "5" || d === "6" || d === "7" || d === "8" ? d : null;
}

export const zTipoPartida = z.enum(["DEBITO", "CREDITO"]);
export const zSubsistema = z.enum([
  "ORCAMENTARIO",
  "PATRIMONIAL",
  "CONTROLE",
]);

export const zPartidaInput = z.object({
  /** Código hierárquico PCASP (não o id). */
  conta: z.string().min(1, "Código da conta é obrigatório"),
  tipo: zTipoPartida,
  subsistema: zSubsistema,
  /** INVARIANTE 1: string decimal ou Decimal. number é REJEITADO. */
  valor: zMoney,
});

export const zRegistrarLancamentoInput = z.object({
  /** Agrupa o fato contábil. Quem conhece o fato é o módulo de origem. */
  numeroControle: z.string().min(1),
  dataTransacao: z.coerce.date(),
  historico: z.string().min(1),
  /** "EMPENHO" | "LIQUIDACAO" | "ARRECADACAO" | ... — string livre por ora. */
  origemTipo: z.string().min(1),
  origemId: z.string().min(1).optional(),
  criadoPor: z.string().min(1),
  partidas: z
    .array(zPartidaInput)
    .min(1, "Lançamento precisa de ao menos 1 partida"),
});

export const zEstornarLancamentoInput = z.object({
  lancamentoId: z.string().min(1),
  numeroControleEstorno: z.string().min(1),
  dataEstorno: z.coerce.date(),
  criadoPor: z.string().min(1),
});

export type RegistrarLancamentoInput = z.input<
  typeof zRegistrarLancamentoInput
>;
export type EstornarLancamentoInput = z.input<typeof zEstornarLancamentoInput>;
export type RegistrarLancamentoDados = z.output<
  typeof zRegistrarLancamentoInput
>;

/**
 * Compõe as partidas de um lançamento a partir da entrada crua e as submete ao
 * motor puro. FAIL-CLOSED: lança se a forma for inválida (Zod) ou se os
 * invariantes de partida dobrada forem violados (validarLancamento).
 *
 * Sem I/O: dá para exercitar o lançamento inteiro sem banco.
 */
export function comporLancamento(input: RegistrarLancamentoInput): {
  readonly dados: RegistrarLancamentoDados;
  readonly partidas: readonly Partida[];
} {
  const dados = zRegistrarLancamentoInput.parse(input);
  return { dados, partidas: validarLancamento(dados.partidas) };
}
