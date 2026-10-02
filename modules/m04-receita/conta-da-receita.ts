import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";

/**
 * V28 — A VPA DA ARRECADAÇÃO POR NATUREZA DE RECEITA, DECLARADA PELO ENTE.
 *
 * ⚠️ O DEFEITO QUE ISTO FECHA. A guia registrada pela tela creditava sempre `4.1.1.2.1.01.00`, uma constante
 * na porta (pendência `VPA-CONSTANTE-NA-PORTA`). No plano do TCE-PB carregado, essa conta é a VPA do ITR
 * (imposto territorial rural): IPTU, ITBI, ISS, taxas e transferências apareciam todos como ITR na DVP, e o
 * lançamento fechava, então ninguém via.
 *
 * ⚠️ A ESCOLHA É DO ENTE, POR PREFIXO DA NATUREZA, E VALE O PREFIXO MAIS LONGO. O contador pode declarar
 * "1118" para os impostos sobre o patrimônio e "11180111" só para o IPTU. A conta tem de existir, ser
 * analítica e ser VPA (classe 4). Sem declaração que cubra a natureza, a guia é recusada antes de gravar,
 * dizendo onde declarar — nunca cai numa conta padrão.
 *
 * A autoridade é a de `declararNaturezaDaFonte` e `declararContaDaLiquidacao`: dizer em que conta do plano o
 * movimento entra.
 */

type TxDeLeitura = Pick<PrismaClient, "contaDaReceitaPorNatureza">;

export interface ContaDaReceitaDeclarada {
  readonly naturezaPrefixo: string;
  readonly contaVpaCodigo: string;
  readonly fundamento: string;
  readonly versao: number;
  readonly criadoPor: string;
}

/** A declaração vigente que cobre a natureza: a de prefixo mais longo, na maior versão. Nula se nenhuma. */
export async function contaDaReceitaVigente(tx: TxDeLeitura, naturezaCodigo: string): Promise<ContaDaReceitaDeclarada | null> {
  const prefixos = Array.from({ length: Math.max(0, naturezaCodigo.length - 1) }, (_, i) => naturezaCodigo.slice(0, i + 2));
  const candidatas = await tx.contaDaReceitaPorNatureza.findMany({
    where: { naturezaPrefixo: { in: prefixos } },
    orderBy: [{ versao: "desc" }],
    select: { naturezaPrefixo: true, contaVpaCodigo: true, fundamento: true, versao: true, criadoPor: true },
  });
  let melhor: ContaDaReceitaDeclarada | null = null;
  for (const c of candidatas) {
    if (melhor === null || c.naturezaPrefixo.length > melhor.naturezaPrefixo.length) melhor = c;
  }
  return melhor;
}

export async function exigirContaDaReceita(tx: TxDeLeitura, naturezaCodigo: string): Promise<ContaDaReceitaDeclarada> {
  const c = await contaDaReceitaVigente(tx, naturezaCodigo);
  if (c === null) {
    throw new Error(
      `A natureza de receita ${naturezaCodigo} ainda não tem a conta de variação patrimonial aumentativa declarada: ` +
        `a arrecadação precisa saber em que conta da DVP esta receita entra. Declare-a em Contabilidade > Contas da ` +
        `receita por natureza, com o fundamento. Nada foi gravado.`
    );
  }
  return c;
}

/** As declarações vigentes, uma por prefixo (a maior versão), para a tela. */
export async function listarContasDaReceita(tx: TxDeLeitura): Promise<readonly ContaDaReceitaDeclarada[]> {
  const todas = await tx.contaDaReceitaPorNatureza.findMany({
    orderBy: [{ naturezaPrefixo: "asc" }, { versao: "desc" }],
    select: { naturezaPrefixo: true, contaVpaCodigo: true, fundamento: true, versao: true, criadoPor: true },
  });
  const vistos = new Set<string>();
  return todas.filter((t) => (vistos.has(t.naturezaPrefixo) ? false : (vistos.add(t.naturezaPrefixo), true)));
}

export const zDeclararContaDaReceita = z.object({
  naturezaPrefixo: z.string().trim().regex(/^\d{2,8}$/, "Informe o início da natureza de receita: de 2 a 8 dígitos (ex.: 1118 ou 11180111)."),
  contaVpaCodigo: z.string().trim().min(1, "Escolha a conta de variação patrimonial aumentativa."),
  fundamento: z.string().trim().min(20, "Diga POR QUE — citando a norma, o ato do ente ou a orientação do tribunal.").max(500),
  criadoPor: z.string().min(1),
});

export async function declararContaDaReceita(
  prisma: PrismaClient,
  input: z.input<typeof zDeclararContaDaReceita>
): Promise<{ readonly versao: number; readonly anterior: string | null }> {
  const d = zDeclararContaDaReceita.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.declararContaDaReceita, "ENTE");
    const conta = await tx.contaPcasp.findUnique({ where: { codigo: d.contaVpaCodigo }, select: { codigo: true, nome: true, analitica: true } });
    if (conta === null) throw new Error(`A conta ${d.contaVpaCodigo} não está no plano de contas carregado. Nada foi gravado.`);
    if (!conta.analitica) throw new Error(`A conta ${conta.codigo} (${conta.nome}) é sintética; a arrecadação lança só em conta analítica. Nada foi gravado.`);
    if (!conta.codigo.startsWith("4.")) {
      throw new Error(`A conta ${conta.codigo} (${conta.nome}) não é de variação patrimonial aumentativa (classe 4). Nada foi gravado.`);
    }
    const vigente = await tx.contaDaReceitaPorNatureza.findFirst({
      where: { naturezaPrefixo: d.naturezaPrefixo },
      orderBy: { versao: "desc" },
      select: { contaVpaCodigo: true, versao: true },
    });
    if (vigente !== null && vigente.contaVpaCodigo === conta.codigo) {
      throw new Error(`As naturezas iniciadas por ${d.naturezaPrefixo} já creditam ${conta.codigo} (versão ${String(vigente.versao)}). Nada foi gravado.`);
    }
    const r = await tx.contaDaReceitaPorNatureza.create({
      data: { naturezaPrefixo: d.naturezaPrefixo, contaVpaCodigo: conta.codigo, fundamento: d.fundamento, versao: (vigente?.versao ?? 0) + 1, criadoPor: d.criadoPor },
      select: { versao: true },
    });
    return { versao: r.versao, anterior: vigente?.contaVpaCodigo ?? null };
  });
}
