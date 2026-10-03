import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { janelaCivilDoMes } from "../../packages/datas/index.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizar } from "../m16-travamento/autorizacao.js";
import { estaTravado } from "../m16-travamento/guard.js";
import { travar } from "../m16-travamento/servico.js";
import { executarVerificacoes, type Verificacao } from "./consistencia.js";

/**
 * M12 × M16 — O FECHAMENTO MENSAL CONFERIDO (V32).
 *
 * ═══ O QUE FALTAVA ═══
 * O travamento existia (`travar`/`destravar`, M16, com teste de concorrência) e nada chegava a ele: o
 * contador não tinha como fechar o mês. E fechar sem conferir é só trancar a porta com o erro dentro —
 * o edital pede o encerramento mensal "que verifique divergências".
 *
 * ═══ A CONFERÊNCIA NÃO É NOVA ═══
 * `executarVerificacoes(MENSAL)` é o diagnóstico que já existe (balancete fecha, movimento dobrado),
 * visitando os donos de cada identidade. Este serviço só o chama no corte do fim do mês e RECUSA fechar
 * quando alguma verificação DIVERGE, nomeando cada uma e a diferença. SEM_DADO não impede: falta de
 * cadastro não é número errado (a mesma régua do diagnóstico pré-envio).
 *
 * ⚠️ AUTORIZAÇÃO PRIMEIRO. Quem não pode fechar o mês não chega a rodar a conferência (que lê o razão
 * inteiro do exercício até o corte).
 */

export interface SituacaoDoMes {
  readonly competencia: string;
  /** FECHADO: travado no primeiro e no último instante. PARCIAL: uma janela por período cobre parte. */
  readonly situacao: "ABERTO" | "FECHADO" | "PARCIAL";
  readonly fechadoPor: string | null;
}

// Um autor que nunca existe: assim só os eventos GLOBAIS decidem (a trava de um usuário não fecha o mês).
const NINGUEM = " situacao-global ";

/** As doze competências do exercício e se cada uma está fechada para todos. Leitura pura. */
export async function situacaoDoFechamento(prisma: PrismaClient, exercicio: number): Promise<readonly SituacaoDoMes[]> {
  const meses = Array.from({ length: 12 }, (_, i) => `${String(exercicio)}-${String(i + 1).padStart(2, "0")}`);
  return Promise.all(
    meses.map(async (competencia) => {
      const j = janelaCivilDoMes(competencia);
      const [ini, fim] = await Promise.all([estaTravado(prisma, j.inicio, NINGUEM), estaTravado(prisma, j.fim, NINGUEM)]);
      const situacao = ini !== null && fim !== null ? "FECHADO" : ini === null && fim === null ? "ABERTO" : "PARCIAL";
      return { competencia, situacao, fechadoPor: (fim ?? ini)?.travadoPor ?? null } as const;
    })
  );
}

export class FechamentoComDivergenciaError extends Error {
  constructor(
    readonly competencia: string,
    readonly divergencias: readonly Verificacao[]
  ) {
    super(
      `O mês ${competencia} não foi fechado: a conferência encontrou ${String(divergencias.length)} divergência(s).\n` +
        divergencias
          .map((v) => `  - ${v.titulo}: ${v.esquerda} contra ${v.direita}, diferença ${v.diferenca}${v.detalhe !== undefined && v.detalhe !== "" ? ` — ${v.detalhe}` : ""}`)
          .join("\n") +
        `\nCorrija os lançamentos (com lançamento novo, referenciando o original) e feche de novo. Nada foi gravado.`
    );
    this.name = "FechamentoComDivergenciaError";
  }
}

/**
 * FECHA o mês depois de conferir. Devolve o evento da trava e as verificações que passaram (para a
 * tela mostrar o que foi conferido, inclusive os SEM_DADO).
 */
export async function fecharCompetenciaConferida(
  prisma: PrismaClient,
  input: { readonly competencia: string; readonly criadoPor: string }
): Promise<{ readonly eventoId: string; readonly verificacoes: readonly Verificacao[] }> {
  await autorizar(prisma, input.criadoPor, ACAO_DO_SERVICO.fecharCompetenciaConferida);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.competencia)) {
    throw new Error(`Competência "${input.competencia}" inválida — informe o mês no formato AAAA-MM. Nada foi gravado.`);
  }
  const janela = janelaCivilDoMes(input.competencia);
  const exercicio = Number.parseInt(input.competencia.slice(0, 4), 10);
  const verificacoes = await executarVerificacoes(prisma, { exercicio, corte: janela.fim, escopo: "MENSAL" });
  const divergencias = verificacoes.filter((v) => v.resultado === "DIVERGE");
  if (divergencias.length > 0) throw new FechamentoComDivergenciaError(input.competencia, divergencias);
  const t = await travar(prisma, { competencia: input.competencia, criadoPor: input.criadoPor });
  return { eventoId: t.eventoId, verificacoes };
}
