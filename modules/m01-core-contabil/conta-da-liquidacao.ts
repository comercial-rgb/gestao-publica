import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { CONTA_ESTOQUE, ELEMENTOS_COM_ROTEIRO, contrapartidaDaLiquidacao } from "./roteiros.js";

/**
 * V28 — A CONTA DA LIQUIDAÇÃO POR ELEMENTO, DECLARADA PELO ENTE.
 *
 * ⚠️ O QUE FALTAVA. A liquidação pergunta "a despesa incorrida virou o quê?", e o rol fixo do M01
 * (`CONTRAPARTIDA_DA_LIQUIDACAO`) só responde para 30, 39 e 71. Obras (51), equipamentos (52),
 * serviços de pessoa física (36) e todo o resto RECUSAVAM a liquidação — corretamente, porque um
 * `default: VPD` faria o equipamento virar despesa e o lançamento fecharia sem ninguém ver. Mas a
 * recusa não tinha saída: a decisão do contador não tinha onde ser escrita. Esta tabela é o lugar.
 *
 * ⚠️ NENHUMA CONTA NASCE AQUI. O ente declara, com fundamento, e a declaração é conferida contra o
 * plano carregado: a conta tem de existir, ser analítica e pertencer à classe que o EFEITO diz
 * (VPD é classe 3; imobilizado, 1.2.3; intangível, 1.2.4; baixa de passivo, classe 2). Um efeito
 * que não casa com a conta é o erro de digitação que faria o lançamento fechar na conta errada.
 *
 * ⚠️ O ROL FIXO CONTINUA VALENDO e não é sobreposto: 30 (estoque, que dispara a entrada no
 * almoxarifado), 39 e 71 têm regra provada, e uma segunda fonte para o mesmo elemento seria duas
 * verdades. Declarar um deles recusa nomeando a regra fixa.
 *
 * A autoridade é a de `declararNaturezaDaFonte`: dizer em que conta do plano o movimento entra.
 */

type TxDeLeitura = Pick<PrismaClient, "contaDaLiquidacaoPorElemento">;

export const EFEITOS_DA_LIQUIDACAO = ["VPD", "IMOBILIZADO", "INTANGIVEL", "BAIXA_DE_PASSIVO"] as const;
export type EfeitoDaLiquidacao = (typeof EFEITOS_DA_LIQUIDACAO)[number];

/** O prefixo de conta que cada efeito exige — a classe do plano, não uma lista de contas. */
const PREFIXO_DO_EFEITO: Readonly<Record<EfeitoDaLiquidacao, { readonly prefixo: string; readonly rotulo: string }>> = {
  VPD: { prefixo: "3.", rotulo: "despesa do período (variação patrimonial diminutiva, classe 3)" },
  IMOBILIZADO: { prefixo: "1.2.3.", rotulo: "bem do imobilizado (1.2.3)" },
  INTANGIVEL: { prefixo: "1.2.4.", rotulo: "ativo intangível (1.2.4)" },
  BAIXA_DE_PASSIVO: { prefixo: "2.", rotulo: "baixa de obrigação (passivo, classe 2)" },
};

export function rotuloDoEfeito(e: EfeitoDaLiquidacao): string {
  return PREFIXO_DO_EFEITO[e].rotulo;
}

export interface ContaDaLiquidacao {
  readonly elemento: string;
  readonly contaCodigo: string;
  /** `FIXA` é o rol do M01; `DECLARADA` é a tabela do ente. */
  readonly origem: "FIXA" | "DECLARADA";
  readonly efeito: EfeitoDaLiquidacao | "ESTOQUE" | null;
  readonly versao: number | null;
  readonly fundamento: string | null;
  readonly criadoPor: string | null;
  readonly criadoEm: Date | null;
}

/** A conta vigente do elemento — o rol fixo primeiro, a declaração do ente depois; nulo se nenhum. */
export async function contaDaLiquidacaoVigente(tx: TxDeLeitura, elemento: string): Promise<ContaDaLiquidacao | null> {
  if (ELEMENTOS_COM_ROTEIRO.includes(elemento)) {
    const conta = contrapartidaDaLiquidacao(elemento);
    return {
      elemento, contaCodigo: conta, origem: "FIXA", efeito: conta === CONTA_ESTOQUE ? "ESTOQUE" : null,
      versao: null, fundamento: null, criadoPor: null, criadoEm: null,
    };
  }
  const r = await tx.contaDaLiquidacaoPorElemento.findFirst({
    where: { elemento },
    orderBy: { versao: "desc" },
    select: { elemento: true, efeito: true, contaCodigo: true, versao: true, fundamento: true, criadoPor: true, criadoEm: true },
  });
  if (r === null) return null;
  return { ...r, origem: "DECLARADA" };
}

/** Fail-closed: sem conta para o elemento, a liquidação NÃO acontece, e a recusa diz onde declarar. */
export async function exigirContaDaLiquidacao(tx: TxDeLeitura, elemento: string): Promise<ContaDaLiquidacao> {
  const c = await contaDaLiquidacaoVigente(tx, elemento);
  if (c === null) {
    throw new Error(
      `O elemento de despesa ${elemento} ainda não tem conta de liquidação declarada. A liquidação precisa ` +
        `saber em que a despesa se transformou (despesa do período, bem do imobilizado, intangível ou baixa de ` +
        `uma obrigação), e essa decisão é da contabilidade do ente. Declare-a em Contabilidade > Contas da ` +
        `liquidação por elemento, com o fundamento. Nada foi gravado.`
    );
  }
  return c;
}

/** Todas as vigentes declaradas, uma por elemento (a maior versão), para a tela. */
export async function listarContasDaLiquidacao(tx: TxDeLeitura): Promise<readonly ContaDaLiquidacao[]> {
  const todas = await tx.contaDaLiquidacaoPorElemento.findMany({
    orderBy: [{ elemento: "asc" }, { versao: "desc" }],
    select: { elemento: true, efeito: true, contaCodigo: true, versao: true, fundamento: true, criadoPor: true, criadoEm: true },
  });
  const vistos = new Set<string>();
  const vigentes: ContaDaLiquidacao[] = [];
  for (const r of todas) {
    if (vistos.has(r.elemento)) continue;
    vistos.add(r.elemento);
    vigentes.push({ ...r, origem: "DECLARADA" });
  }
  return vigentes;
}

export const zDeclararContaDaLiquidacao = z.object({
  elemento: z.string().trim().regex(/^\d{2}$/, "O elemento de despesa tem 2 dígitos (ex.: 52)."),
  efeito: z.enum(EFEITOS_DA_LIQUIDACAO),
  contaCodigo: z.string().trim().min(1, "Informe a conta do plano."),
  // O mesmo piso de `declararNaturezaDaFonte`: a mesma autoridade, o mesmo "diga por quê".
  fundamento: z.string().trim().min(20, "Diga POR QUE — citando a norma, o ato do ente ou a orientação do tribunal.").max(500),
  criadoPor: z.string().min(1),
});

export async function declararContaDaLiquidacao(
  prisma: PrismaClient,
  input: z.input<typeof zDeclararContaDaLiquidacao>
): Promise<{ readonly versao: number; readonly anterior: { readonly contaCodigo: string; readonly versao: number } | null }> {
  const d = zDeclararContaDaLiquidacao.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.declararContaDaLiquidacao, "ENTE");

    if (ELEMENTOS_COM_ROTEIRO.includes(d.elemento)) {
      throw new Error(
        `O elemento ${d.elemento} tem regra fixa de liquidação (conta ${contrapartidaDaLiquidacao(d.elemento)}), ` +
          `e uma segunda declaração seriam duas verdades para o mesmo elemento. Nada foi gravado.`
      );
    }
    const conta = await tx.contaPcasp.findUnique({ where: { codigo: d.contaCodigo }, select: { codigo: true, nome: true, analitica: true } });
    if (conta === null) {
      throw new Error(`A conta ${d.contaCodigo} não está no plano de contas carregado. Nada foi gravado.`);
    }
    if (!conta.analitica) {
      throw new Error(`A conta ${conta.codigo} (${conta.nome}) é sintética; a liquidação lança só em conta analítica. Nada foi gravado.`);
    }
    const exigido = PREFIXO_DO_EFEITO[d.efeito];
    if (!conta.codigo.startsWith(exigido.prefixo)) {
      throw new Error(
        `A conta ${conta.codigo} (${conta.nome}) não é de ${exigido.rotulo}, que é o efeito declarado. ` +
          `Confira o efeito ou a conta. Nada foi gravado.`
      );
    }

    const vigente = await contaDaLiquidacaoVigente(tx, d.elemento);
    if (vigente !== null && vigente.contaCodigo === conta.codigo && vigente.efeito === d.efeito) {
      throw new Error(
        `O elemento ${d.elemento} já liquida em ${conta.codigo} (versão ${String(vigente.versao)}). ` +
          `Redeclarar a mesma conta não é um fato novo. Nada foi gravado.`
      );
    }
    const r = await tx.contaDaLiquidacaoPorElemento.create({
      data: {
        elemento: d.elemento,
        efeito: d.efeito,
        contaCodigo: conta.codigo,
        fundamento: d.fundamento,
        versao: (vigente?.versao ?? 0) + 1,
        criadoPor: d.criadoPor,
      },
      select: { versao: true },
    });
    return { versao: r.versao, anterior: vigente === null ? null : { contaCodigo: vigente.contaCodigo, versao: vigente.versao ?? 0 } };
  });
}
