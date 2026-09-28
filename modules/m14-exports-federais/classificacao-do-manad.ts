import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { TIPO_MANAD } from "../m01-core-contabil/tipo-manad.js";

/**
 * A CLASSIFICAÇÃO DO CADASTRO PARA O MANAD (V22) — as quatro perguntas que o arquivo da Receita
 * faz ao cadastro orçamentário e que só o ente responde:
 *
 * - UNIDADE ORÇAMENTÁRIA: o tipo da unidade (L400, campo 06 — TIP_UN_ORC), pelo rol oficial já
 *   transcrito em `m01-core-contabil/tipo-manad.ts` (o MESMO da entidade contábil);
 * - AÇÃO: é do RPPS ou não (L650, campo 05 — TIP_PROJ_ATIV_OE: 01 RPPS, 02 Demais);
 * - NATUREZA DA DESPESA (L700) e NATUREZA DA RECEITA (L200): sintética ou analítica
 *   (IND_TIPO_CONTA: S ou A) e o nível da conta na hierarquia (NM_NIVEL_CONTA).
 *
 * ⚠️ FORA DE `manad/` DE PROPÓSITO: aquela pasta é o gerador, que não grava nada (invariante t8 de
 * `m14-manad.test.ts`). Isto é cadastro, e grava.
 *
 * ⚠️ O GERADOR CONTINUA FAIL-CLOSED e continua sem escolher por ninguém: estes serviços são a
 * porta pela qual o ente escolhe. Até a V22 essas colunas existiam e nada as escrevia — o MANAD
 * recusava com a mensagem certa e não havia onde resolver.
 *
 * ⚠️ É CADASTRO, NÃO FATO. A classificação vale para o arquivo gerado depois dela, inclusive de
 * período passado — é a correção do cadastro, como corrigir o nome de uma unidade. Cada
 * classificação passa pelo funil de escrita (registro de operação) e devolve o valor anterior.
 *
 * Autorização: `CADASTRAR_ENTIDADE_CONTABIL` no ENTE, a mesma dos responsáveis pelo arquivo.
 */

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export class ClassificacaoDoManadInvalidaError extends Error {
  override readonly name = "ClassificacaoDoManadInvalidaError";
}

/** L650 campo 05 — o rol do leiaute, transcrito do schema (`Acao.tipoManad`). */
export const TIPO_MANAD_DA_ACAO: Readonly<Record<string, string>> = {
  "01": "RPPS",
  "02": "Demais",
};

/** IND_TIPO_CONTA (L200 e L700) — o rol do leiaute. */
export const TIPO_DE_CONTA_MANAD: Readonly<Record<string, string>> = {
  S: "Sintética",
  A: "Analítica",
};

const zAutor = z.string().trim().min(1);

function exigirNoRol(valor: string, rol: Readonly<Record<string, string>>, oQue: string): string {
  const v = valor.trim();
  if (!Object.hasOwn(rol, v)) {
    throw new ClassificacaoDoManadInvalidaError(
      `${oQue} inválido: "${valor}". Escolha um destes: ${Object.keys(rol).sort().map((c) => `${c} (${rol[c]!})`).join(", ")}. Nada foi gravado.`
    );
  }
  return v;
}

function exigirNivel(nivel: string | number): number {
  const n = typeof nivel === "number" ? nivel : Number(String(nivel).trim());
  if (!Number.isInteger(n) || n < 1 || n > 99) {
    throw new ClassificacaoDoManadInvalidaError(
      `Nível da conta inválido: "${String(nivel)}". Informe o nível da conta na hierarquia do ente, um número inteiro de 1 a 99. Nada foi gravado.`
    );
  }
  return n;
}

export interface ResultadoDaClassificacao {
  readonly anterior: string | null;
  readonly atual: string;
}

export async function classificarUnidadeParaOManad(
  prisma: PrismaClient,
  input: { readonly unidadeId: string; readonly tipo: string; readonly criadoPor: string }
): Promise<ResultadoDaClassificacao> {
  const criadoPor = zAutor.parse(input.criadoPor);
  const tipo = exigirNoRol(input.tipo, TIPO_MANAD, "Tipo de unidade");
  return prisma.$transaction(async (tx: Tx) => {
    await autorizarNo(tx, criadoPor, ACAO_DO_SERVICO.classificarUnidadeParaOManad, "ENTE");
    const u = await tx.unidadeOrcamentaria.findUnique({ where: { id: input.unidadeId }, select: { tipoManad: true } });
    if (u === null) throw new ClassificacaoDoManadInvalidaError("Unidade orçamentária não encontrada. Nada foi gravado.");
    await tx.unidadeOrcamentaria.update({ where: { id: input.unidadeId }, data: { tipoManad: tipo } });
    return { anterior: u.tipoManad, atual: tipo };
  });
}

export async function classificarAcaoParaOManad(
  prisma: PrismaClient,
  input: { readonly acaoId: string; readonly tipo: string; readonly criadoPor: string }
): Promise<ResultadoDaClassificacao> {
  const criadoPor = zAutor.parse(input.criadoPor);
  const tipo = exigirNoRol(input.tipo, TIPO_MANAD_DA_ACAO, "Tipo da ação");
  return prisma.$transaction(async (tx: Tx) => {
    await autorizarNo(tx, criadoPor, ACAO_DO_SERVICO.classificarAcaoParaOManad, "ENTE");
    const a = await tx.acao.findUnique({ where: { id: input.acaoId }, select: { tipoManad: true } });
    if (a === null) throw new ClassificacaoDoManadInvalidaError("Ação não encontrada. Nada foi gravado.");
    await tx.acao.update({ where: { id: input.acaoId }, data: { tipoManad: tipo } });
    return { anterior: a.tipoManad, atual: tipo };
  });
}

interface ClassificarNaturezaInput {
  readonly naturezaId: string;
  readonly tipoDeConta: string;
  readonly nivel: string | number;
  readonly criadoPor: string;
}

function rotuloDaConta(ind: string | null, nivel: number | null): string | null {
  return ind === null || nivel === null ? null : `${ind}/${nivel}`;
}

export async function classificarNaturezaDespesaParaOManad(
  prisma: PrismaClient,
  input: ClassificarNaturezaInput
): Promise<ResultadoDaClassificacao> {
  const criadoPor = zAutor.parse(input.criadoPor);
  const ind = exigirNoRol(input.tipoDeConta, TIPO_DE_CONTA_MANAD, "Tipo de conta");
  const nivel = exigirNivel(input.nivel);
  return prisma.$transaction(async (tx: Tx) => {
    await autorizarNo(tx, criadoPor, ACAO_DO_SERVICO.classificarNaturezaDespesaParaOManad, "ENTE");
    const n = await tx.naturezaDespesa.findUnique({
      where: { id: input.naturezaId },
      select: { indTipoContaManad: true, nivelContaManad: true },
    });
    if (n === null) throw new ClassificacaoDoManadInvalidaError("Natureza da despesa não encontrada. Nada foi gravado.");
    await tx.naturezaDespesa.update({ where: { id: input.naturezaId }, data: { indTipoContaManad: ind, nivelContaManad: nivel } });
    return { anterior: rotuloDaConta(n.indTipoContaManad, n.nivelContaManad), atual: `${ind}/${nivel}` };
  });
}

export async function classificarNaturezaReceitaParaOManad(
  prisma: PrismaClient,
  input: ClassificarNaturezaInput
): Promise<ResultadoDaClassificacao> {
  const criadoPor = zAutor.parse(input.criadoPor);
  const ind = exigirNoRol(input.tipoDeConta, TIPO_DE_CONTA_MANAD, "Tipo de conta");
  const nivel = exigirNivel(input.nivel);
  return prisma.$transaction(async (tx: Tx) => {
    await autorizarNo(tx, criadoPor, ACAO_DO_SERVICO.classificarNaturezaReceitaParaOManad, "ENTE");
    const n = await tx.naturezaReceita.findUnique({
      where: { id: input.naturezaId },
      select: { indTipoContaManad: true, nivelContaManad: true },
    });
    if (n === null) throw new ClassificacaoDoManadInvalidaError("Natureza da receita não encontrada. Nada foi gravado.");
    await tx.naturezaReceita.update({ where: { id: input.naturezaId }, data: { indTipoContaManad: ind, nivelContaManad: nivel } });
    return { anterior: rotuloDaConta(n.indTipoContaManad, n.nivelContaManad), atual: `${ind}/${nivel}` };
  });
}
