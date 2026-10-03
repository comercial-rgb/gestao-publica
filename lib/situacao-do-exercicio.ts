/**
 * A SITUAÇÃO DO EXERCÍCIO, como o contador a nomeia — decisão PURA (sem banco), lida pelo cabeçalho.
 *
 * ⚠️ PROPOSTA, ORÇAMENTO APROVADO E EXECUÇÃO SÃO COISAS DIFERENTES, e a tela precisa dizer qual delas
 * está diante do usuário. Um exercício seguinte com fichas geradas pela proposta ainda NÃO tem lei: as
 * fichas são o projeto, não a autorização. O que separa as fases são FATOS gravados, nunca uma flag:
 *   · a proposta orçamentária do exercício (elaborada / efetivada em fichas);
 *   · o projeto de lei enviado e a aprovação da lei (`LeiOrcamentariaAnual` / `AprovacaoDaLeiOrcamentaria`);
 *   · o encerramento do exercício (`EncerramentoExercicio`, append-only).
 *
 * ⚠️ E O CALENDÁRIO SÓ DECIDE ENTRE "APROVADO" E "EM EXECUÇÃO". Um exercício cujo ano civil já começou
 * é execução, com ou sem a lei registrada no sistema — a ausência da lei aparece como pendência, não
 * como uma fase que não existe. O ano civil é o do ente (packages/datas), passado por parâmetro.
 *
 * ⚠️ O PERÍODO TEM SITUAÇÃO PRÓPRIA: a COMPETÊNCIA TRAVADA (M16, `MovimentoTravamento`). O guard
 * `exigirCompetenciaDestravada` roda dentro de todo lançamento no razão e recusa fato datado numa janela
 * travada — global ou só para aquele usuário. O cabeçalho mostra a mesma resposta que o guard daria,
 * pela MESMA derivação (`derivarTravamento`), em `lib/portas/competencia.ts` — a interface não importa domínio.
 */

export type FaseDoExercicio =
  | "SEM_ORCAMENTO"
  | "PROPOSTA_EM_ELABORACAO"
  | "PROPOSTA_GERADA"
  | "PROJETO_ENVIADO"
  | "ORCAMENTO_APROVADO"
  | "EM_EXECUCAO"
  | "ENCERRADO";

export interface FatosDoExercicio {
  readonly ano: number;
  readonly encerrado: boolean;
  /** Há proposta orçamentária elaborada PARA este exercício. */
  readonly temProposta: boolean;
  /** A proposta já virou fichas e receitas previstas deste exercício. */
  readonly propostaEfetivada: boolean;
  /** O projeto de lei da LOA deste exercício foi registrado como enviado. */
  readonly projetoEnviado: boolean;
  /** A lei da LOA deste exercício foi registrada como aprovada. */
  readonly leiAprovada: boolean;
}

export interface SituacaoDoExercicio {
  readonly fase: FaseDoExercicio;
  /** O que o cabeçalho escreve. */
  readonly rotulo: string;
  /** O tom do selo: execução e aprovado são estáveis; proposta é trabalho em andamento. */
  readonly tom: "neutro" | "andamento" | "vigente" | "encerrado";
  /** Escrita de execução (empenho, arrecadação, pagamento) cabe nesta fase? */
  readonly aceitaExecucao: boolean;
}

export function situacaoDoExercicio(f: FatosDoExercicio, anoCivilDoEnte: number): SituacaoDoExercicio {
  if (f.encerrado) return { fase: "ENCERRADO", rotulo: "Encerrado", tom: "encerrado", aceitaExecucao: false };
  if (f.ano <= anoCivilDoEnte) return { fase: "EM_EXECUCAO", rotulo: "Em execução", tom: "vigente", aceitaExecucao: true };
  if (f.leiAprovada) return { fase: "ORCAMENTO_APROVADO", rotulo: "Orçamento aprovado", tom: "vigente", aceitaExecucao: false };
  if (f.projetoEnviado) return { fase: "PROJETO_ENVIADO", rotulo: "Projeto de lei enviado", tom: "andamento", aceitaExecucao: false };
  if (f.propostaEfetivada) return { fase: "PROPOSTA_GERADA", rotulo: "Proposta gerada, sem lei", tom: "andamento", aceitaExecucao: false };
  if (f.temProposta) return { fase: "PROPOSTA_EM_ELABORACAO", rotulo: "Proposta em elaboração", tom: "andamento", aceitaExecucao: false };
  return { fase: "SEM_ORCAMENTO", rotulo: "Sem orçamento", tom: "neutro", aceitaExecucao: false };
}

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
] as const;

/**
 * O PERÍODO que o cabeçalho mostra para o exercício escolhido: o mês corrente quando o exercício é o
 * ano civil do ente; o exercício inteiro quando é anterior (consulta) ou seguinte (planejamento).
 * `mesCivil` é 1..12, na data civil do ente.
 */
export function periodoDoExercicio(ano: number, anoCivilDoEnte: number, mesCivil: number): string {
  if (ano === anoCivilDoEnte) return `${MESES[mesCivil - 1] ?? ""} de ${ano}`;
  if (ano < anoCivilDoEnte) return `exercício de ${ano} (anterior)`;
  return `exercício de ${ano} (seguinte)`;
}

/**
 * O EXERCÍCIO QUE ABRE A SESSÃO, quando a URL e o cookie não dizem outro: o do ano civil do ente, se
 * existir — nunca "o mais recente". Abrir a proposta de 2027 como contexto padrão faria o contador
 * empenhar, consultar e conciliar no exercício errado sem ter escolhido nada.
 */
export function exercicioPadrao(anos: readonly number[], anoCivilDoEnte: number, preferido: number | null): number | null {
  if (preferido !== null && anos.includes(preferido)) return preferido;
  if (anos.includes(anoCivilDoEnte)) return anoCivilDoEnte;
  const anteriores = anos.filter((a) => a < anoCivilDoEnte);
  if (anteriores.length > 0) return Math.max(...anteriores);
  return anos.length > 0 ? Math.min(...anos) : null;
}

