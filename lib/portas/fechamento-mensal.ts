import { executarVerificacoes, type Verificacao } from "../../modules/m12-relatorios/consistencia.js";
import { fecharCompetenciaConferida, situacaoDoFechamento, type SituacaoDoMes } from "../../modules/m12-relatorios/fechamento-mensal.js";
import { destravar } from "../../modules/m16-travamento/servico.js";
import { janelaCivilDoMes } from "../../packages/datas/index";
import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";

/**
 * ═══ O FECHAMENTO MENSAL NA TELA (V32) ═══
 *
 * Fechar o mês passa pela conferência (`fecharCompetenciaConferida`, M12 × M16) e reabrir exige motivo
 * (`destravar`, M16). As duas recusas sobem com a mensagem do domínio. A prévia da conferência é a
 * mesma função que o fechamento chama — a tela não tem segunda régua.
 */

export type { SituacaoDoMes, Verificacao };

export async function lerFechamentoDoExercicio(exercicio: number): Promise<readonly SituacaoDoMes[]> {
  await exigirLeituraDoEnte("CONSULTAR_CONTABILIDADE");
  return situacaoDoFechamento(cliente(), exercicio);
}

/** A conferência do mês, até o último instante dele — o que o fechamento vai exigir. */
export async function lerConferenciaDoMes(competencia: string): Promise<readonly Verificacao[]> {
  await exigirLeituraDoEnte("CONSULTAR_CONTABILIDADE");
  const exercicio = Number.parseInt(competencia.slice(0, 4), 10);
  return executarVerificacoes(cliente(), { exercicio, corte: janelaCivilDoMes(competencia).fim, escopo: "MENSAL" });
}

export async function fecharMesNaTela(competencia: string): Promise<string> {
  return comEscritaAutenticada("TRAVAR_COMPETENCIA", async (criadoPor) => {
    const r = await fecharCompetenciaConferida(cliente(), { competencia, criadoPor });
    const semDado = r.verificacoes.filter((v) => v.resultado === "SEM_DADO").length;
    return `Mês ${competencia} fechado. Nenhum lançamento com data neste mês é aceito até a reabertura.${semDado > 0 ? ` ${String(semDado)} conferência(s) sem dado para verificar.` : ""}`;
  });
}

export async function reabrirMesNaTela(competencia: string, motivo: string): Promise<string> {
  return comEscritaAutenticada("DESTRAVAR_COMPETENCIA", async (criadoPor) => {
    await destravar(cliente(), { competencia, motivo, criadoPor });
    return `Mês ${competencia} reaberto. O motivo fica registrado com o seu nome.`;
  });
}
