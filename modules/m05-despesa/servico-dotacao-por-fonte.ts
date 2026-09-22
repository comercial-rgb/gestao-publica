import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { exigirAnalitica } from "./servico-roteiro-orcamentario.js";

/**
 * ⚠️ O TIPO DA LEITURA É ESTRUTURAL, E ISSO NÃO É PREGUIÇA DE TIPAGEM. Quem lê o eixo é o
 * `registrarMovimentoDotacao`, cujo `Tx` é DELIBERADAMENTE mais estreito (sem `$transaction`, para
 * que ninguém abra transação aninhada dentro de uma perna do razão). Pedir aqui o `Tx` largo
 * obrigaria aquele arquivo a alargar o dele — e a restrição dele é que vale.
 */
type TxDeLeitura = Pick<
  PrismaClient,
  "politicaDaDotacaoAdicional" | "roteiroDaDotacaoPorFonte"
>;

/**
 * M05 — O EIXO DA DOTAÇÃO ADICIONAL, E O ROTEIRO POR FONTE (V11 V8.9).
 *
 * ═══ ⚠️ A PENDÊNCIA, E POR QUE ELA NÃO SE FECHAVA ESCOLHENDO CONTA ═══
 * `DOTACAO-ADICIONAL-POR-TIPO-E-POR-FONTE`. No plano oficial,
 *
 *     5.2.2.1.2  DOTAÇÃO ADICIONAL POR TIPO DE CREDITO   (suplementar, especial, extraordinário)
 *     5.2.2.1.3  DOTAÇÃO ADICIONAL POR FONTE             (superávit, excesso, anulação, op. crédito)
 *
 * são IRMÃS sob `5.2.2.1 DOTAÇÃO ORÇAMENTÁRIA` e descrevem o MESMO crédito por eixos diferentes:
 * uma pergunta que ESPÉCIE de crédito é, a outra DE ONDE veio o dinheiro. O sistema só lançava na
 * `.2`, e a `.3` ficava vazia em qualquer demonstrativo que a lesse.
 *
 * ═══ ⚠️ POR QUE NÃO EXISTE "AS DUAS AO MESMO TEMPO" — MEDIDO NO PLANO, NÃO OPINADO ═══
 * A perna de CRÉDITO é a mesma nos dois eixos: o crédito disponível (`6.2.2.1.1`). Lançar os dois
 * creditaria o disponível DUAS VEZES pelo mesmo decreto — o ente passaria a poder empenhar o
 * dobro do que a lei autorizou, e o balancete fecharia do mesmo jeito (cada par é balanceado).
 * Não há no plano contrapartida para uma segunda perna que não faça isso, e inventá-la seria
 * inventar norma da STN. O eixo é UM, e quem o escolhe é o ente.
 *
 * ⚠️ E A ESCOLHA TEM DEFAULT HERDADO, NÃO FAIL-CLOSED. Ausência de política vale
 * `POR_TIPO_DE_CREDITO`: é o que todo banco existente já faz. Recusar o crédito adicional até
 * alguém decidir derrubaria instalações vivas para cobrar uma decisão que elas já tomaram por
 * omissão — e a tela nomeia a diferença entre decidido e herdado.
 */

const EIXOS = ["POR_TIPO_DE_CREDITO", "POR_FONTE"] as const;
export type EixoDaDotacao = (typeof EIXOS)[number];

/** O eixo que vale quando ninguém decidiu — o comportamento da instalação. */
export const EIXO_HERDADO: EixoDaDotacao = "POR_TIPO_DE_CREDITO";

const ORIGENS = ["ANULACAO", "SUPERAVIT_FINANCEIRO", "EXCESSO_ARRECADACAO", "OPERACAO_CREDITO"] as const;

const zFundamento = z
  .string()
  .trim()
  .min(20, "Diga POR QUE — citando o plano do ente, a norma ou a orientação do tribunal.")
  .max(500);

export const zPublicarPolitica = z.object({
  eixo: z.enum(EIXOS),
  fundamento: zFundamento,
  criadoPor: z.string().min(1),
});

export interface PoliticaVigente {
  readonly eixo: EixoDaDotacao;
  readonly versao: number;
  readonly fundamento: string;
  readonly criadoPor: string;
  readonly criadoEm: Date;
}

/**
 * A política VIGENTE — a de maior versão. `null` quando ninguém do ente decidiu.
 *
 * ⚠️ `null` NÃO É O MESMO QUE `POR_TIPO_DE_CREDITO` DECIDIDO, e por isso esta função devolve
 * `null` em vez de já aplicar o default. Quem lança usa `eixoVigente`; quem MOSTRA precisa
 * distinguir "o ente decidiu assim" de "ninguém decidiu e ficou assim" — a prestação de contas
 * lê as duas coisas de formas diferentes.
 */
export async function politicaVigente(tx: TxDeLeitura): Promise<PoliticaVigente | null> {
  const p = await tx.politicaDaDotacaoAdicional.findFirst({
    orderBy: { versao: "desc" },
    select: { eixo: true, versao: true, fundamento: true, criadoPor: true, criadoEm: true },
  });
  return p === null ? null : { ...p, eixo: p.eixo as EixoDaDotacao };
}

/** O eixo em vigor para LANÇAR — com o herdado no lugar da ausência. */
export async function eixoVigente(tx: TxDeLeitura): Promise<EixoDaDotacao> {
  return (await politicaVigente(tx))?.eixo ?? EIXO_HERDADO;
}

export interface PoliticaPublicada {
  readonly versao: number;
  readonly anterior: EixoDaDotacao | null;
}

/** PUBLICA o eixo — versão nova, nunca UPDATE. */
export async function publicarPoliticaDaDotacaoAdicional(
  prisma: PrismaClient,
  input: z.input<typeof zPublicarPolitica>
): Promise<PoliticaPublicada> {
  const d = zPublicarPolitica.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.publicarPoliticaDaDotacaoAdicional, "ENTE");

    const vigente = await politicaVigente(tx);
    if (vigente !== null && vigente.eixo === d.eixo) {
      throw new Error(
        `A dotação adicional já é registrada ${rotuloDoEixo(d.eixo)}. Republicar a mesma decisão ` +
          `não é um fato novo. Nada foi gravado.`
      );
    }

    // ⚠️ TROCAR DE EIXO NÃO REESCREVE O PASSADO, e a mensagem diz isso. O que já foi escriturado
    // continua no ramo em que entrou — mexer nele exigiria UPDATE no razão, que é o oposto da
    // regra da casa. A troca vale para o que vier.
    const p = await tx.politicaDaDotacaoAdicional.create({
      data: {
        eixo: d.eixo,
        fundamento: d.fundamento,
        versao: (vigente?.versao ?? 0) + 1,
        criadoPor: d.criadoPor,
      },
      select: { versao: true },
    });

    return { versao: p.versao, anterior: vigente?.eixo ?? null };
  });
}

export const rotuloDoEixo = (e: EixoDaDotacao): string =>
  e === "POR_FONTE" ? "POR FONTE do recurso" : "POR TIPO de crédito";

export const zPublicarRoteiroPorFonte = z.object({
  origem: z.enum(ORIGENS),
  contaDebitoCodigo: z.string().trim().min(1),
  contaCreditoCodigo: z.string().trim().min(1),
  fundamento: zFundamento,
  criadoPor: z.string().min(1),
});

export interface RoteiroPorFonteVigente {
  readonly versao: number;
  readonly debito: string;
  readonly credito: string;
  readonly fundamento: string | null;
  readonly criadoPor: string;
  readonly criadoEm: Date;
}

export async function roteiroPorFonteVigente(
  tx: TxDeLeitura,
  origem: string
): Promise<RoteiroPorFonteVigente | null> {
  const r = await tx.roteiroDaDotacaoPorFonte.findFirst({
    where: { origem: origem as never },
    orderBy: { versao: "desc" },
    select: {
      versao: true,
      fundamento: true,
      criadoPor: true,
      criadoEm: true,
      contaDebito: { select: { codigo: true } },
      contaCredito: { select: { codigo: true } },
    },
  });
  if (r === null) return null;
  return {
    versao: r.versao,
    debito: r.contaDebito.codigo,
    credito: r.contaCredito.codigo,
    fundamento: r.fundamento,
    criadoPor: r.criadoPor,
    criadoEm: r.criadoEm,
  };
}

export interface RoteiroPorFontePublicado {
  readonly versao: number;
  readonly anterior: { readonly debito: string; readonly credito: string } | null;
}

/** PUBLICA o roteiro de uma ORIGEM — versão nova, nunca UPDATE. */
export async function publicarRoteiroDaDotacaoPorFonte(
  prisma: PrismaClient,
  input: z.input<typeof zPublicarRoteiroPorFonte>
): Promise<RoteiroPorFontePublicado> {
  const d = zPublicarRoteiroPorFonte.parse(input);

  if (d.contaDebitoCodigo === d.contaCreditoCodigo) {
    throw new Error(
      `O débito e o crédito não podem ser a mesma conta (${d.contaDebitoCodigo}). Um lançamento ` +
        `assim move zero e mesmo assim balanceia — ele passaria por todo guard e não escrituraria ` +
        `nada. Nada foi gravado.`
    );
  }

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.publicarRoteiroDaDotacaoPorFonte, "ENTE");

    const debito = await exigirAnalitica(tx, d.contaDebitoCodigo, "débito");
    const credito = await exigirAnalitica(tx, d.contaCreditoCodigo, "crédito");

    const vigente = await roteiroPorFonteVigente(tx, d.origem);
    if (vigente !== null && vigente.debito === debito.codigo && vigente.credito === credito.codigo) {
      throw new Error(
        `O roteiro de ${d.origem} já é ${debito.codigo} / ${credito.codigo}. Republicar o mesmo ` +
          `par não é um fato novo. Nada foi gravado.`
      );
    }

    const r = await tx.roteiroDaDotacaoPorFonte.create({
      data: {
        origem: d.origem,
        contaDebitoId: debito.id,
        contaCreditoId: credito.id,
        fundamento: d.fundamento,
        versao: (vigente?.versao ?? 0) + 1,
        criadoPor: d.criadoPor,
      },
      select: { versao: true },
    });

    return {
      versao: r.versao,
      anterior: vigente === null ? null : { debito: vigente.debito, credito: vigente.credito },
    };
  });
}
