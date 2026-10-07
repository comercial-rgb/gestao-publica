import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";

/**
 * V36 — AS AUDIÊNCIAS PÚBLICAS DO PLANEJAMENTO (TR 5.9.1.1). LRF art. 48, § 1º, I: participação popular e audiências
 * durante a elaboração e a discussão do PPA, da LDO e da LOA. Ato do ENTE, como toda peça do M02b, sob CADASTRAR_PPA:
 * quem monta as peças do planejamento registra as audiências delas (uma ação por peça daria três crachás para o mesmo
 * setor).
 *
 * A situação da solicitação é APPEND-ONLY (`SituacaoDaSolicitacao`): cada mudança é uma linha com o parecer, e a
 * vigente é a mais recente. Sem linha, a solicitação está RECEBIDA. O rol (em análise, acolhida, não acolhida) é
 * vocabulário do sistema, não norma: diz se o pedido entrou na peça.
 */

export const PECAS_DA_AUDIENCIA = ["PPA", "LDO", "LOA"] as const;
export const SITUACOES_DA_SOLICITACAO = ["EM_ANALISE", "ACOLHIDA", "NAO_ACOLHIDA"] as const;
export type SituacaoDaSolicitacao = "RECEBIDA" | (typeof SITUACOES_DA_SOLICITACAO)[number];

export const ROTULO_DA_SITUACAO: Readonly<Record<SituacaoDaSolicitacao, string>> = {
  RECEBIDA: "Recebida",
  EM_ANALISE: "Em análise",
  ACOLHIDA: "Acolhida",
  NAO_ACOLHIDA: "Não acolhida",
};

/** A situação vigente: a da linha mais recente; sem linha, RECEBIDA. */
export function situacaoVigente(linhas: readonly { readonly situacao: string; readonly criadoEm: Date; readonly id: string }[]): SituacaoDaSolicitacao {
  let ultima: { readonly situacao: string; readonly criadoEm: Date; readonly id: string } | undefined;
  for (const l of linhas) {
    if (ultima === undefined || l.criadoEm > ultima.criadoEm || (l.criadoEm.getTime() === ultima.criadoEm.getTime() && l.id > ultima.id)) ultima = l;
  }
  return (ultima?.situacao as SituacaoDaSolicitacao | undefined) ?? "RECEBIDA";
}

const zTexto = (min: number, msg: string) => z.string().trim().min(min, msg);

const zAudiencia = z.object({
  exercicio: z.number().int().min(1900).max(2200),
  peca: z.enum(PECAS_DA_AUDIENCIA, { message: "Informe a peça discutida: PPA, LDO ou LOA." }),
  data: z.date(),
  local: zTexto(3, "Informe o local da audiência."),
  pauta: zTexto(3, "Informe a pauta da audiência."),
  criadoPor: z.string().min(1),
});

const zSolicitacao = z.object({
  audienciaId: z.string().min(1),
  descricao: zTexto(5, "Descreva a solicitação."),
  bairro: zTexto(2, "Informe o bairro a ser atendido."),
  solicitanteNome: zTexto(3, "Informe o nome do solicitante."),
  solicitanteContato: zTexto(5, "Informe um contato do solicitante (telefone, e-mail ou endereço)."),
  orgaoId: z.string().min(1, "Informe o órgão responsável pela análise."),
  criadoPor: z.string().min(1),
});

const zSituacao = z
  .object({
    solicitacaoId: z.string().min(1),
    situacao: z.enum(SITUACOES_DA_SOLICITACAO, { message: "Situação inválida." }),
    parecer: z.string().trim().optional(),
    criadoPor: z.string().min(1),
  })
  .superRefine((v, ctx) => {
    if (v.situacao !== "EM_ANALISE" && (v.parecer ?? "").length < 10) {
      ctx.addIssue({ code: "custom", path: ["parecer"], message: "Acolher ou não acolher uma solicitação exige o parecer (ao menos 10 caracteres)." });
    }
  });

/** REGISTRA a audiência pública realizada. */
export async function registrarAudienciaPublica(prisma: PrismaClient, input: z.input<typeof zAudiencia>): Promise<{ readonly audienciaId: string }> {
  const d = zAudiencia.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarAudienciaPublica, "ENTE");
    const a = await tx.audienciaPublica.create({
      data: { exercicio: d.exercicio, peca: d.peca, data: d.data, local: d.local, pauta: d.pauta, criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { audienciaId: a.id };
  });
}

/** REGISTRA uma solicitação da comunidade feita na audiência. */
export async function registrarSolicitacaoDaAudiencia(
  prisma: PrismaClient,
  input: z.input<typeof zSolicitacao>
): Promise<{ readonly solicitacaoId: string }> {
  const d = zSolicitacao.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarSolicitacaoDaAudiencia, "ENTE");
    const [audiencia, orgao] = await Promise.all([
      tx.audienciaPublica.findUnique({ where: { id: d.audienciaId }, select: { id: true } }),
      tx.orgao.findUnique({ where: { id: d.orgaoId }, select: { id: true } }),
    ]);
    if (audiencia === null) throw new Error("A audiência pública não existe. Nada foi gravado.");
    if (orgao === null) throw new Error("O órgão responsável pela análise não existe. Nada foi gravado.");
    const s = await tx.solicitacaoDaAudiencia.create({
      data: {
        audienciaId: d.audienciaId,
        descricao: d.descricao,
        bairro: d.bairro,
        solicitanteNome: d.solicitanteNome,
        solicitanteContato: d.solicitanteContato,
        orgaoId: d.orgaoId,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { solicitacaoId: s.id };
  });
}

/** MUDA a situação da solicitação, com o parecer. Recusa a mudança que não muda nada. */
export async function registrarSituacaoDaSolicitacao(
  prisma: PrismaClient,
  input: z.input<typeof zSituacao>
): Promise<{ readonly situacaoId: string }> {
  const d = zSituacao.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarSituacaoDaSolicitacao, "ENTE");
    const s = await tx.solicitacaoDaAudiencia.findUnique({
      where: { id: d.solicitacaoId },
      select: { descricao: true, situacoes: { select: { id: true, situacao: true, criadoEm: true } } },
    });
    if (s === null) throw new Error("A solicitação não existe. Nada foi gravado.");
    const atual = situacaoVigente(s.situacoes);
    if (atual === d.situacao) throw new Error(`A solicitação "${s.descricao}" já está ${ROTULO_DA_SITUACAO[atual].toLowerCase()}. Nada foi gravado.`);
    const n = await tx.situacaoDaSolicitacao.create({
      data: { solicitacaoId: d.solicitacaoId, situacao: d.situacao, ...(d.parecer !== undefined && d.parecer !== "" ? { parecer: d.parecer } : {}), criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { situacaoId: n.id };
  });
}
