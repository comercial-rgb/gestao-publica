import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";

/**
 * M05 — O CADASTRO DO ROTEIRO ORÇAMENTÁRIO PELO ENTE (V11 V8.4).
 *
 * ═══ ⚠️ O QUE ESTE ARQUIVO FECHA, E O QUE ELE NÃO DECIDE ═══
 * Duas pendências viviam da mesma ausência:
 *
 *   · `ROTEIRO-RESERVA-SEM-CONTA` — o sistema chama a conta de "crédito reservado"; no PCASP ela
 *     é CRÉDITO INDISPONÍVEL, com BLOQUEIO, PRÉ-EMPENHADO e OUTRAS sob ela. Qual corresponde à
 *     reserva de dotação é decisão do ente;
 *   · `ANULACAO-DE-DOTACAO-DOIS-CANCELAMENTOS-HOMONIMOS` — a redução de dotação tem DUAS
 *     candidatas com o nome IDÊNTICO, "(-) CANCELAMENTO DE DOTAÇÕES", em ramos diferentes do
 *     plano. Escolher por semelhança de nome é escolher entre nomes iguais.
 *
 * Nenhuma das duas se fecha escolhendo a conta — isso seria inventar norma da STN. O que faltava
 * era o ente ter ONDE escolher: `RoteiroOrcamentario` só nascia por seed, e o seed recusa (com
 * razão) o que não pode decidir. Um roteiro que ninguém pode configurar é um movimento que o
 * sistema recusa para sempre.
 *
 * ⚠️ VERSIONADO, e não editável. O razão escriturado ontem foi feito contra o roteiro de ontem; a
 * pergunta "contra que roteiro este lançamento foi feito?" tem de ter resposta. E o papel de
 * runtime não tem `UPDATE` nesta tabela — sem versão, o cadastro pela tela exigiria afrouxar o
 * grant, que é o oposto da regra da casa.
 */

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

const TIPOS_DE_CREDITO = ["SUPLEMENTAR", "ESPECIAL", "EXTRAORDINARIO"] as const;

export const zPublicarRoteiro = z.object({
  tipo: z.string().trim().min(1),
  /** Ausente = o movimento não é crédito adicional. O par (tipo, tipoCredito) é a chave. */
  tipoCredito: z.enum(TIPOS_DE_CREDITO).nullable().optional(),
  contaDebitoCodigo: z.string().trim().min(1),
  contaCreditoCodigo: z.string().trim().min(1),
  fundamento: z
    .string()
    .trim()
    .min(20, "Diga POR QUE estas contas — citando o plano do ente, a norma ou a orientação do tribunal.")
    .max(500),
  criadoPor: z.string().min(1),
});
export type PublicarRoteiroInput = z.input<typeof zPublicarRoteiro>;

/**
 * A conta TEM de existir e ser ANALÍTICA — e a recusa lista as filhas.
 *
 * ⚠️ RECUSAR SEM MOSTRAR AS OPÇÕES foi o que manteve estas pendências abertas por vários lotes: o
 * seed dizia "escolha uma analítica" e devolvia a pessoa ao plano de nove mil contas.
 */
async function exigirAnalitica(tx: Tx, codigo: string, papel: string): Promise<{ id: string; codigo: string }> {
  const c = await tx.contaPcasp.findUnique({
    where: { codigo },
    select: { id: true, codigo: true, nome: true, analitica: true },
  });
  if (c === null) {
    throw new Error(`A conta ${codigo} (${papel}) não existe no plano carregado. Nada foi gravado.`);
  }
  if (!c.analitica) {
    const filhas = await tx.contaPcasp.findMany({
      where: { codigo: { startsWith: codigo.slice(0, 9) }, analitica: true },
      orderBy: { codigo: "asc" },
      take: 40,
      select: { codigo: true, nome: true },
    });
    throw new Error(
      `A conta ${codigo} ("${c.nome}", ${papel}) é SINTÉTICA e não recebe partida. Analíticas sob ` +
        `ela: ${filhas.map((f) => `${f.codigo} ${f.nome}`).join("; ") || "(nenhuma)"}. Nada foi gravado.`
    );
  }
  return { id: c.id, codigo: c.codigo };
}

export interface RoteiroPublicado {
  readonly roteiroId: string;
  readonly versao: number;
  /** O par de contas da versão anterior, quando havia uma. */
  readonly anterior: { readonly debito: string; readonly credito: string } | null;
}

/**
 * PUBLICA a decisão do ente para um par (movimento, tipo de crédito) — versão nova, nunca UPDATE.
 *
 * ⚠️ DÉBITO E CRÉDITO NÃO PODEM SER A MESMA CONTA. Um lançamento que debita e credita a mesma
 * conta move zero e ainda assim balanceia: passaria por todo guard de balanceamento e não
 * escrituraria nada. É o erro de digitação mais fácil de cometer aqui.
 */
export async function publicarRoteiroOrcamentario(
  prisma: PrismaClient,
  input: PublicarRoteiroInput
): Promise<RoteiroPublicado> {
  const d = zPublicarRoteiro.parse(input);
  const tipoCredito = d.tipoCredito ?? null;

  if (d.contaDebitoCodigo === d.contaCreditoCodigo) {
    throw new Error(
      `O débito e o crédito não podem ser a mesma conta (${d.contaDebitoCodigo}). Um lançamento ` +
        `assim move zero e mesmo assim balanceia — ele passaria por todo guard e não escrituraria ` +
        `nada. Nada foi gravado.`
    );
  }

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.publicarRoteiroOrcamentario, "ENTE");

    const debito = await exigirAnalitica(tx, d.contaDebitoCodigo, "débito");
    const credito = await exigirAnalitica(tx, d.contaCreditoCodigo, "crédito");

    const vigente = await roteiroVigente(tx, d.tipo, tipoCredito);
    if (vigente !== null && vigente.debito === debito.codigo && vigente.credito === credito.codigo) {
      throw new Error(
        `O roteiro de ${rotulo(d.tipo, tipoCredito)} já é ${debito.codigo} / ${credito.codigo}. ` +
          `Republicar o mesmo par não é um fato novo. Nada foi gravado.`
      );
    }

    const r = await tx.roteiroOrcamentario.create({
      data: {
        tipo: d.tipo as never,
        tipoCredito: tipoCredito as never,
        contaDebitoId: debito.id,
        contaCreditoId: credito.id,
        fundamento: d.fundamento,
        versao: (vigente?.versao ?? 0) + 1,
        criadoPor: d.criadoPor,
      },
      select: { id: true, versao: true },
    });

    return {
      roteiroId: r.id,
      versao: r.versao,
      anterior: vigente === null ? null : { debito: vigente.debito, credito: vigente.credito },
    };
  });
}

const rotulo = (tipo: string, tipoCredito: string | null): string =>
  tipoCredito === null ? tipo : `${tipo} do tipo ${tipoCredito}`;

export interface RoteiroVigente {
  readonly versao: number;
  readonly debito: string;
  readonly credito: string;
  readonly fundamento: string | null;
  readonly criadoPor: string;
  readonly criadoEm: Date;
}

/** A versão VIGENTE de um par — a de maior versão. `null` quando o ente nunca decidiu. */
export async function roteiroVigente(
  tx: Tx,
  tipo: string,
  tipoCredito: string | null
): Promise<RoteiroVigente | null> {
  const r = await tx.roteiroOrcamentario.findFirst({
    where: { tipo: tipo as never, tipoCredito: tipoCredito as never },
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
