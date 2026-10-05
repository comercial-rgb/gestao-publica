import { z } from "zod";
import { Decimal, toMoney } from "../../packages/contracts/index.js";
import { diaCivil, inicioDoDiaCivil } from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";

/**
 * V35 — RREO, ANEXO 10: DEMONSTRATIVO DA PROJEÇÃO ATUARIAL DO REGIME PRÓPRIO DE PREVIDÊNCIA (LRF, art. 53, § 1º, II).
 * Ver `prisma/schema/m12-projecao-atuarial-do-rreo.prisma` para as quatro regras do Siconfi que este arquivo aplica.
 *
 * O ente registra a projeção da avaliação atuarial (o documento do atuário) por plano; o demonstrativo deriva
 * (c) = (a) − (b) e (d) = (d anterior) + (c), com o primeiro "d anterior" dos controles do ente. Nada é gravado de
 * derivado. Ação: CADASTRAR_LINHA_DEMONSTRATIVO (a mesma que configura os demonstrativos e redige as notas).
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export const PLANOS_DO_REGIME_PROPRIO = ["CAPITALIZACAO", "REPARTICAO"] as const;
export type PlanoDoRegimeProprio = (typeof PLANOS_DO_REGIME_PROPRIO)[number];
/** Os nomes das tabelas do Siconfi. */
export const ROTULO_DO_PLANO: Readonly<Record<PlanoDoRegimeProprio, string>> = {
  CAPITALIZACAO: "Fundo em Capitalização (Plano Previdenciário)",
  REPARTICAO: "Fundo em Repartição (Plano Financeiro)",
};
/** Siconfi, Anexo 10, regra 2: "pelo menos 75 (setenta e cinco) anos". */
export const ANOS_MINIMOS_DA_PROJECAO = 75;

const zValor = z.string().trim().regex(/^-?\d+(\.\d{1,2})?$/, "Valor em reais com até duas casas.");
const zValorNaoNegativo = zValor.refine((v) => !v.startsWith("-"), "Receitas e despesas previdenciárias não são negativas.");

export const zRegistrarProjecaoAtuarialDoRreo = z.object({
  exercicio: z.number().int().min(2000).max(2100),
  plano: z.enum(PLANOS_DO_REGIME_PROPRIO),
  /** "AAAA-MM-DD", dia civil do ente. */
  dataDaAvaliacao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data da avaliação no formato AAAA-MM-DD."),
  documento: z.string().trim().min(10, "Identifique a avaliação atuarial: relatório, atuário e envio à Secretaria de Previdência."),
  saldoFinanceiroAnterior: zValor,
  linhas: z.array(z.object({ ano: z.number().int(), receitas: zValorNaoNegativo, despesas: zValorNaoNegativo })),
  criadoPor: z.string().min(1),
});

/**
 * LÊ A TABELA COLADA DA AVALIAÇÃO ATUARIAL: uma linha por ano, "ano; receitas; despesas" (ponto e vírgula ou
 * tabulação). Os valores aceitam o formato brasileiro (1.234.567,89) ou o ponto decimal sem milhar (1234567.89).
 * "1.234" sem vírgula é AMBÍGUO (mil e duzentos ou um vírgula dois?) e é recusado, nunca adivinhado.
 */
export function lerTabelaDaProjecao(texto: string): { readonly ano: number; readonly receitas: string; readonly despesas: string }[] {
  const linhas: { ano: number; receitas: string; despesas: string }[] = [];
  texto.split(/\r?\n/).forEach((bruta, i) => {
    const l = bruta.trim();
    if (l === "") return;
    const campos = l.split(/[;\t]/).map((c) => c.trim());
    if (campos.length !== 3) throw new Error(`Linha ${String(i + 1)} ("${l}"): use três colunas — ano; receitas; despesas. Nada foi gravado.`);
    const [ano, receitas, despesas] = campos as [string, string, string];
    if (!/^\d{4}$/.test(ano)) throw new Error(`Linha ${String(i + 1)}: o ano "${ano}" não tem quatro dígitos. Nada foi gravado.`);
    linhas.push({ ano: Number(ano), receitas: valorDaTabela(receitas, i + 1), despesas: valorDaTabela(despesas, i + 1) });
  });
  return linhas;
}

function valorDaTabela(v: string, linha: number): string {
  const s = v.replace(/^R\$\s*/, "");
  if (/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(s) && (s.includes(",") || !s.includes("."))) return toMoney(s.replace(/\./g, "").replace(",", ".")).toFixed(2);
  if (/^\d+,\d{1,2}$/.test(s)) return toMoney(s.replace(",", ".")).toFixed(2);
  if (/^\d+(\.\d{1,2})?$/.test(s)) return toMoney(s).toFixed(2);
  throw new Error(`Linha ${String(linha)}: o valor "${v}" não é um número em reais legível (use 1.234.567,89 ou 1234567.89). Nada foi gravado.`);
}

export async function registrarProjecaoAtuarialDoRreo(
  prisma: PrismaClient,
  input: z.input<typeof zRegistrarProjecaoAtuarialDoRreo>
): Promise<{ readonly versao: number; readonly anos: number }> {
  const d = zRegistrarProjecaoAtuarialDoRreo.parse(input);
  // As regras 2 do Siconfi conferidas ANTES de gravar: começa no ano anterior, sem buraco nem repetição, 75 anos ou mais.
  const anos = [...d.linhas].map((l) => l.ano).sort((a, b) => a - b);
  const primeiro = d.exercicio - 1;
  if (anos.length === 0 || anos[0] !== primeiro) {
    throw new Error(`A projeção do RREO de ${String(d.exercicio)} começa em ${String(primeiro)}, o ano anterior ao do demonstrativo (Siconfi, Anexo 10, regra 2); a informada começa em ${anos.length === 0 ? "nenhum ano" : String(anos[0])}. Nada foi gravado.`);
  }
  const fora = anos.find((a, i) => a !== primeiro + i);
  if (fora !== undefined) throw new Error(`A projeção tem de ter um ano por linha, sem repetir nem pular: o ${String(fora)} está fora da sequência que começa em ${String(primeiro)}. Nada foi gravado.`);
  if (anos.length < ANOS_MINIMOS_DA_PROJECAO) {
    throw new Error(`A projeção tem ${String(anos.length)} anos; o Anexo 10 pede pelo menos ${String(ANOS_MINIMOS_DA_PROJECAO)} (Siconfi, Anexo 10, regra 2). Nada foi gravado.`);
  }
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarProjecaoAtuarialDoRreo, "ENTE");
    await exigirExercicio(tx, d.exercicio);
    const versao = (await ultimaVersao(tx, d.exercicio, d.plano)) + 1;
    await tx.projecaoAtuarialDoRreo.create({
      data: {
        exercicio: d.exercicio, plano: d.plano, versao, dataDaAvaliacao: inicioDoDiaCivil(d.dataDaAvaliacao), documento: d.documento,
        saldoFinanceiroAnterior: d.saldoFinanceiroAnterior, criadoPor: d.criadoPor,
        linhas: { create: d.linhas.map((l) => ({ ano: l.ano, receitas: l.receitas, despesas: l.despesas })) },
      },
      select: { id: true },
    });
    return { versao, anos: anos.length };
  });
}

export const zRetirarProjecaoAtuarialDoRreo = z.object({ exercicio: z.number().int().min(2000).max(2100), plano: z.enum(PLANOS_DO_REGIME_PROPRIO), criadoPor: z.string().min(1) });

/** Tira o plano do demonstrativo (ex.: tabela de repartição registrada num ente sem segregação). O histórico fica. */
export async function retirarProjecaoAtuarialDoRreo(prisma: PrismaClient, input: z.input<typeof zRetirarProjecaoAtuarialDoRreo>): Promise<{ readonly versao: number }> {
  const d = zRetirarProjecaoAtuarialDoRreo.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.retirarProjecaoAtuarialDoRreo, "ENTE");
    const vigente = await tx.projecaoAtuarialDoRreo.findFirst({ where: { exercicio: d.exercicio, plano: d.plano }, orderBy: { versao: "desc" }, select: { versao: true, retirada: true, dataDaAvaliacao: true } });
    if (vigente === null || vigente.retirada) throw new Error(`Não há projeção do ${ROTULO_DO_PLANO[d.plano]} no RREO de ${String(d.exercicio)} para retirar. Nada foi gravado.`);
    const versao = vigente.versao + 1;
    await tx.projecaoAtuarialDoRreo.create({
      data: { exercicio: d.exercicio, plano: d.plano, versao, dataDaAvaliacao: vigente.dataDaAvaliacao, documento: "retirada", saldoFinanceiroAnterior: "0.00", retirada: true, criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { versao };
  });
}

async function exigirExercicio(tx: Tx, exercicio: number): Promise<void> {
  if ((await tx.exercicio.findUnique({ where: { ano: exercicio }, select: { ano: true } })) === null) throw new Error(`O exercício ${String(exercicio)} não está cadastrado. Nada foi gravado.`);
}

async function ultimaVersao(tx: Tx, exercicio: number, plano: PlanoDoRegimeProprio): Promise<number> {
  return (await tx.projecaoAtuarialDoRreo.findFirst({ where: { exercicio, plano }, orderBy: { versao: "desc" }, select: { versao: true } }))?.versao ?? 0;
}

// ═══ O DEMONSTRATIVO ═══

export interface LinhaDoAnexo10 {
  readonly ano: number;
  readonly receitas: string;
  readonly despesas: string;
  readonly resultado: string;
  readonly saldo: string;
}

export interface QuadroDoAnexo10 {
  readonly plano: PlanoDoRegimeProprio;
  readonly titulo: string;
  readonly versao: number;
  readonly dataDaAvaliacao: string;
  readonly documento: string;
  readonly saldoFinanceiroAnterior: string;
  readonly linhas: readonly LinhaDoAnexo10[];
}

export interface Anexo10 {
  readonly exercicio: number;
  readonly bimestre: number;
  /** Siconfi, regra 1: o anexo só existe no último bimestre. */
  readonly disponivel: boolean;
  readonly quadros: readonly QuadroDoAnexo10[];
  readonly notas: readonly string[];
}

export async function anexo10(leitor: Pick<PrismaClient, "projecaoAtuarialDoRreo">, input: { readonly exercicio: number; readonly bimestre: number }): Promise<Anexo10> {
  const notas = [
    "Fonte: avaliação atuarial do regime próprio, registrada pelo ente com o documento de origem (LRF, art. 53, § 1º, II).",
    "Resultado previdenciário (c) = receitas (a) − despesas (b); saldo financeiro do exercício (d) = (d do exercício anterior) + (c). Na primeira linha, o d anterior é o valor dos controles do ente.",
    "Com segregação da massa, há uma tabela para o fundo em capitalização e outra para o fundo em repartição; sem segregação, só a de capitalização.",
  ];
  if (input.bimestre !== 6) {
    return { exercicio: input.exercicio, bimestre: input.bimestre, disponivel: false, quadros: [], notas: ["O Anexo 10 integra só o RREO do último bimestre (6º).", ...notas] };
  }
  const quadros: QuadroDoAnexo10[] = [];
  for (const plano of PLANOS_DO_REGIME_PROPRIO) {
    const p = await leitor.projecaoAtuarialDoRreo.findFirst({
      where: { exercicio: input.exercicio, plano },
      orderBy: { versao: "desc" },
      select: { versao: true, retirada: true, dataDaAvaliacao: true, documento: true, saldoFinanceiroAnterior: true, linhas: { orderBy: { ano: "asc" }, select: { ano: true, receitas: true, despesas: true } } },
    });
    if (p === null || p.retirada) continue;
    let saldo = new Decimal(p.saldoFinanceiroAnterior);
    const linhas = p.linhas.map((l) => {
      const resultado = new Decimal(l.receitas).minus(l.despesas);
      saldo = saldo.plus(resultado);
      return { ano: l.ano, receitas: new Decimal(l.receitas).toFixed(2), despesas: new Decimal(l.despesas).toFixed(2), resultado: resultado.toFixed(2), saldo: saldo.toFixed(2) };
    });
    quadros.push({ plano, titulo: ROTULO_DO_PLANO[plano], versao: p.versao, dataDaAvaliacao: diaCivil(p.dataDaAvaliacao), documento: p.documento, saldoFinanceiroAnterior: new Decimal(p.saldoFinanceiroAnterior).toFixed(2), linhas });
  }
  if (quadros.length === 0) notas.unshift(`Não há projeção atuarial registrada para o RREO de ${String(input.exercicio)}: ela vem da avaliação atuarial do regime próprio, documento do atuário.`);
  return { exercicio: input.exercicio, bimestre: input.bimestre, disponivel: true, quadros, notas };
}
