import { ELEGIVEL, naoAplicavel, preCondicao, type Elegibilidade } from "../../packages/contracts/index.js";
import type { SituacaoDaCertificacao } from "./certificacao.js";

/**
 * ═══ M33 — QUAIS ATOS CABEM NESTA FOLHA, AGORA, PARA ESTE ATOR (V6.2 U0) ═══
 *
 * Predicados PUROS sobre um retrato do estado. Dois leitores, e é por isso que moram no domínio:
 *
 *   · `certificacao.ts` monta o retrato DENTRO da transação e recusa pelo mesmo predicado;
 *   · `lib/portas/recursos/folha-dados.ts` monta o retrato para a tela e projeta a barra de ações.
 *
 * ⚠️ OS CÓDIGOS SÃO OS DAS RECUSAS DO CASO DE USO — `FOLHA-JA-CERTIFICADA`, `AUTOLIQUIDACAO-DA-FOLHA`.
 * `m33-elegibilidade.test.ts` confere a PARIDADE contra o caso de uso real, estado por estado: o
 * predicado dizer "não aplicável" com um código e o serviço recusar com outro seria a segunda
 * verdade que este arquivo existe para eliminar.
 *
 * ⚠️ A ORDEM IMPORTA, e é do mais geral para o do ator. Uma folha já certificada deve dizer
 * "já certificada" a quem não tem designação — e não "você não tem designação": a segunda frase
 * mandaria alguém pedir uma portaria para praticar um ato que não cabe mais.
 */

export type AcaoDaFolha = "calcular" | "cancelar-calculo" | "fechar" | "apropriar" | "certificar" | "devolver" | "liquidar";

export const ACOES_DA_FOLHA: readonly AcaoDaFolha[] = ["calcular", "cancelar-calculo", "fechar", "apropriar", "certificar", "devolver", "liquidar"];

export interface EstadoDaFolhaParaAtos {
  readonly competencia: string;
  readonly fechada: boolean;
  readonly temCalculoVivo: boolean;
  /** Só com a folha fechada; nula antes. */
  readonly certificacao: SituacaoDaCertificacao | null;
  /** Empenhos que a apropriação gravou (zero = não apropriada, ou tentada e parada antes do primeiro). */
  readonly empenhosGravados: number;
  /** Quantos empenhos a distribuição do cálculo fechado pede. Nulo quando não se leu (folha aberta). */
  readonly empenhosEsperados: number | null;
  readonly empenhosLiquidados: number;
}

export interface AtorNaFolha {
  readonly calculouOFechado: boolean;
  readonly fechou: boolean;
  /** Foi quem praticou a certificação vigente do cálculo fechado. */
  readonly certificou: boolean;
  /**
   * Tem designação para certificar vigente no DIA DO ATO e HOJE. Nulo quando não se consultou.
   * ⚠️ AS DUAS DATAS: a do ato sustenta o atesto; a de hoje impede que uma revogação já
   * registrada seja contornada datando o comando novo de antes dela.
   */
  readonly designado: boolean | null;
}

const PROVIDENCIA_DESIGNACAO =
  "O administrador cadastra a designação, com o ato que a fundamenta, em Folha > Designações.";

export function elegibilidadeParaCalcular(e: EstadoDaFolhaParaAtos): Elegibilidade {
  if (e.fechada) return naoAplicavel("FOLHA-FECHADA", `A folha de ${e.competencia} está fechada; não se recalcula.`);
  return ELEGIVEL;
}

export function elegibilidadeParaCancelarCalculo(e: EstadoDaFolhaParaAtos): Elegibilidade {
  if (e.fechada) return naoAplicavel("CALCULO-FECHADO", `O cálculo que fechou a folha de ${e.competencia} não se cancela.`);
  if (!e.temCalculoVivo) return naoAplicavel("FOLHA-SEM-CALCULO-VIVO", `A folha de ${e.competencia} não tem cálculo vivo para cancelar.`);
  return ELEGIVEL;
}

export function elegibilidadeParaFechar(e: EstadoDaFolhaParaAtos): Elegibilidade {
  if (e.fechada) return naoAplicavel("FOLHA-JA-FECHADA", `A folha de ${e.competencia} já está fechada.`);
  if (!e.temCalculoVivo) return preCondicao("FOLHA-SEM-CALCULO-VIVO", `A folha de ${e.competencia} não tem cálculo vivo.`, "Calcule antes de fechar.");
  return ELEGIVEL;
}

export function elegibilidadeParaApropriar(e: EstadoDaFolhaParaAtos): Elegibilidade {
  if (!e.fechada) return preCondicao("FOLHA-NAO-FECHADA", `A folha de ${e.competencia} ainda não foi fechada; só o cálculo congelado vira despesa.`, "Feche a folha antes de apropriar.");
  // ⚠️ APROPRIAÇÃO PARCIAL CONTINUA OFERECIDA: parar no meio (saldo da ficha) é estado real, e a
  // retomada é o próprio ato — a numeração determinística não duplica.
  if (e.empenhosEsperados !== null && e.empenhosGravados >= e.empenhosEsperados && e.empenhosGravados > 0) {
    return naoAplicavel("FOLHA-JA-APROPRIADA", `Os ${e.empenhosGravados} empenho(s) da folha de ${e.competencia} já existem.`);
  }
  return ELEGIVEL;
}

export function elegibilidadeParaCertificar(e: EstadoDaFolhaParaAtos, a: AtorNaFolha): Elegibilidade {
  if (!e.fechada) return preCondicao("FOLHA-NAO-FECHADA", `A folha de ${e.competencia} ainda não foi fechada; certifica-se o cálculo congelado.`, "RH fecha a folha antes do atesto.");
  if (e.certificacao === "CERTIFICADA") return naoAplicavel("FOLHA-JA-CERTIFICADA", `A folha de ${e.competencia} já está certificada.`);
  if (a.fechou) return preCondicao("AUTOCERTIFICACAO-DA-FOLHA", "Você fechou esta folha e não pode certificá-la.", "Outra pessoa designada precisa praticar o atesto.");
  if (a.calculouOFechado) return preCondicao("AUTOCERTIFICACAO-DA-FOLHA", "Você calculou esta folha e não pode certificá-la.", "Outra pessoa designada precisa praticar o atesto.");
  if (a.designado === false) return preCondicao("SEM-DESIGNACAO-VIGENTE", "Você não tem designação vigente para certificar a folha.", PROVIDENCIA_DESIGNACAO);
  return ELEGIVEL;
}

export function elegibilidadeParaDevolver(e: EstadoDaFolhaParaAtos, a: AtorNaFolha): Elegibilidade {
  if (!e.fechada) return preCondicao("FOLHA-NAO-FECHADA", `A folha de ${e.competencia} ainda não foi fechada; não há o que devolver.`);
  if (e.certificacao === "DEVOLVIDA") return naoAplicavel("FOLHA-JA-DEVOLVIDA", `A folha de ${e.competencia} já foi devolvida para correção.`);
  if (e.empenhosLiquidados > 0) {
    return naoAplicavel("FOLHA-JA-LIQUIDADA", `${e.empenhosLiquidados} liquidação(ões) desta folha já existe(m); devolver o atesto não as desfaz — desfazer é anulação pela despesa.`);
  }
  if (a.designado === false) return preCondicao("SEM-DESIGNACAO-VIGENTE", "Você não tem designação vigente para certificar ou devolver a folha.", PROVIDENCIA_DESIGNACAO);
  return ELEGIVEL;
}

export function elegibilidadeParaLiquidar(e: EstadoDaFolhaParaAtos, a: AtorNaFolha): Elegibilidade {
  if (!e.fechada) return preCondicao("FOLHA-NAO-FECHADA", `A folha de ${e.competencia} ainda não foi fechada.`);
  if (e.certificacao !== "CERTIFICADA") {
    const porque = e.certificacao === "DEVOLVIDA" ? "foi devolvida para correção" : e.certificacao === "SUPERADA" ? "tem certificação de outro cálculo" : "ainda não foi certificada";
    return preCondicao("FOLHA-NAO-CERTIFICADA", `A folha de ${e.competencia} ${porque}.`, "A liquidação se apoia no atesto de quem o ente designou.");
  }
  if (e.empenhosGravados === 0) return preCondicao("FOLHA-NAO-APROPRIADA", `A folha de ${e.competencia} não tem empenho nenhum.`, "Aproprie a folha antes de liquidar.");
  if (e.empenhosLiquidados >= e.empenhosGravados) return naoAplicavel("FOLHA-JA-LIQUIDADA", `Os ${e.empenhosGravados} empenho(s) desta folha já estão liquidados.`);
  if (a.certificou) return preCondicao("AUTOLIQUIDACAO-DA-FOLHA", "Você certificou esta folha e não pode liquidá-la.", "Outra pessoa com a permissão de liquidar pratica o ato.");
  return ELEGIVEL;
}

/** Todas de uma vez — é o que a porta projeta. */
export function elegibilidadeDosAtosDaFolha(e: EstadoDaFolhaParaAtos, a: AtorNaFolha): Readonly<Record<AcaoDaFolha, Elegibilidade>> {
  return {
    calcular: elegibilidadeParaCalcular(e),
    "cancelar-calculo": elegibilidadeParaCancelarCalculo(e),
    fechar: elegibilidadeParaFechar(e),
    apropriar: elegibilidadeParaApropriar(e),
    certificar: elegibilidadeParaCertificar(e, a),
    devolver: elegibilidadeParaDevolver(e, a),
    liquidar: elegibilidadeParaLiquidar(e, a),
  };
}
