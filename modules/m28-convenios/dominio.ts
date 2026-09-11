import { z } from "zod";
import { toMoney, zMoney, type Money } from "../../packages/contracts/index.js";
import { competenciaCivil, diaCivilBr, diferencaEmDiasCivis, somarDiasCivis } from "../../packages/datas/index.js";

/**
 * M28 — CONVÊNIOS E TRANSFERÊNCIAS VOLUNTÁRIAS: a aritmética PURA.
 *
 * Nada aqui toca banco. É o que permite provar as regras sem fixture de Prisma — e é onde
 * elas ficam legíveis.
 */

export type PapelNoConvenio = "CONCEDENTE" | "CONVENENTE";

export type TipoMovimentoConvenio =
  | "LIBERACAO_DE_PARCELA"
  | "PRESTACAO_APROVADA"
  | "GLOSA"
  | "DEVOLUCAO"
  | "ESTORNO_LIBERACAO_DE_PARCELA"
  | "ESTORNO_PRESTACAO_APROVADA"
  | "ESTORNO_GLOSA"
  | "ESTORNO_DEVOLUCAO";

/** O tipo do estorno de cada movimento. Um estorno NÃO se estorna. */
export const TIPO_DO_ESTORNO_CONVENIO: Record<
  TipoMovimentoConvenio,
  TipoMovimentoConvenio | null
> = {
  LIBERACAO_DE_PARCELA: "ESTORNO_LIBERACAO_DE_PARCELA",
  PRESTACAO_APROVADA: "ESTORNO_PRESTACAO_APROVADA",
  GLOSA: "ESTORNO_GLOSA",
  DEVOLUCAO: "ESTORNO_DEVOLUCAO",
  ESTORNO_LIBERACAO_DE_PARCELA: null,
  ESTORNO_PRESTACAO_APROVADA: null,
  ESTORNO_GLOSA: null,
  ESTORNO_DEVOLUCAO: null,
};

export interface MovimentoParaSaldo {
  readonly tipo: TipoMovimentoConvenio;
  readonly valor: Money;
}

/**
 * QUANTO AINDA HÁ A LIBERAR — `valorRepasse` menos o que já andou, mais o devolvido.
 *
 * ⚠️ NÃO HÁ MAPA DE SINAL AQUI, e a ausência é deliberada. A dívida (M10) e os restos a
 * pagar (M08) têm um `SINAL_MOVIMENTO_*` porque nos dois TODO tipo mexe no mesmo saldo. No
 * convênio há TRÊS saldos independentes — a liberar, a prestar contas e glosado — e cada tipo
 * entra em alguns e não em outros. Um mapa único de sinal obrigaria a inventar um zero para
 * "não mexe neste saldo", e um zero num `Record<Tipo, 1 | -1>` é uma mentira que o compilador
 * não pega.
 *
 * ⚠️ E O SINAL NÃO DEPENDE DO PAPEL DO ENTE — a parte contraintuitiva. O que muda com o papel
 * é o LANÇAMENTO (quem debita e quem credita, pelo `RoteiroConvenio`), não a aritmética do
 * termo: liberar parcela consome o que há a liberar tanto para quem transfere quanto para quem
 * recebe. Fazer o sinal depender do papel faria a mesma soma dar respostas OPOSTAS nas duas
 * pontas de um convênio entre dois entes deste mesmo sistema.
 *
 * ⚠️ PRESTAÇÃO E GLOSA NÃO ENTRAM NESTA CONTA, e isso é o desenho. Aprovar a prestação de
 * contas de uma parcela não devolve saldo a liberar: o dinheiro já saiu. Glosar também não —
 * a glosa DECLARA que um valor é devido de volta, e quem devolve saldo é a DEVOLUÇÃO, que é
 * outro fato com outra data. Somá-las aqui faria o termo parecer ter dinheiro que o caixa
 * não tem.
 */
export function saldoALiberar(
  valorRepasse: Money,
  movimentos: readonly MovimentoParaSaldo[]
): Money {
  let saldo = valorRepasse;
  for (const m of movimentos) {
    if (m.tipo === "LIBERACAO_DE_PARCELA") saldo = toMoney(saldo.minus(m.valor));
    else if (m.tipo === "ESTORNO_LIBERACAO_DE_PARCELA") saldo = toMoney(saldo.plus(m.valor));
    else if (m.tipo === "DEVOLUCAO") saldo = toMoney(saldo.plus(m.valor));
    else if (m.tipo === "ESTORNO_DEVOLUCAO") saldo = toMoney(saldo.minus(m.valor));
  }
  return saldo;
}

/**
 * QUANTO FALTA PRESTAR CONTAS — liberado líquido menos prestado líquido menos devolvido.
 *
 * É a outra pergunta do convênio, e ela é INDEPENDENTE da primeira: um termo pode estar
 * inteiramente liberado (saldo a liberar zero) e com tudo pendente de prestação.
 */
export function pendenteDePrestacao(movimentos: readonly MovimentoParaSaldo[]): Money {
  let pendente = toMoney("0.00");
  for (const m of movimentos) {
    switch (m.tipo) {
      case "LIBERACAO_DE_PARCELA":
        pendente = toMoney(pendente.plus(m.valor));
        break;
      case "ESTORNO_LIBERACAO_DE_PARCELA":
        pendente = toMoney(pendente.minus(m.valor));
        break;
      case "PRESTACAO_APROVADA":
      case "DEVOLUCAO":
        pendente = toMoney(pendente.minus(m.valor));
        break;
      case "ESTORNO_PRESTACAO_APROVADA":
      case "ESTORNO_DEVOLUCAO":
        pendente = toMoney(pendente.plus(m.valor));
        break;
      default:
        break; // glosa não move a pendência: ela qualifica o que já foi prestado
    }
  }
  return pendente;
}

/** O total GLOSADO líquido — o que foi declarado devido de volta e ainda não voltou. */
export function glosadoLiquido(movimentos: readonly MovimentoParaSaldo[]): Money {
  let total = toMoney("0.00");
  for (const m of movimentos) {
    if (m.tipo === "GLOSA") total = toMoney(total.plus(m.valor));
    else if (m.tipo === "ESTORNO_GLOSA") total = toMoney(total.minus(m.valor));
    else if (m.tipo === "DEVOLUCAO") total = toMoney(total.minus(m.valor));
    else if (m.tipo === "ESTORNO_DEVOLUCAO") total = toMoney(total.plus(m.valor));
  }
  return total;
}

/**
 * O ESTADO DO CONVÊNIO — DERIVADO, nunca uma coluna.
 *
 * ⚠️ A ORDEM DAS PERGUNTAS IMPORTA, e ela vai do mais grave para o mais brando. Um convênio
 * com prazo de prestação vencido E saldo a liberar é, antes de tudo, INADIMPLENTE: mostrá-lo
 * como "em execução" porque ainda há parcela a liberar esconderia exatamente o que o gestor
 * precisa ver antes de liberar a próxima.
 */
export type EstadoDoConvenio =
  | "A_INICIAR"
  | "EM_EXECUCAO"
  | "PRESTACAO_PENDENTE"
  | "PRESTACAO_VENCIDA"
  | "CONCLUIDO";

export function estadoDoConvenio(p: {
  readonly valorRepasse: Money;
  readonly vigenciaFim: Date;
  readonly diasParaPrestacaoDeContas: number;
  readonly movimentos: readonly MovimentoParaSaldo[];
  readonly hoje: Date;
}): EstadoDoConvenio {
  const aLiberar = saldoALiberar(p.valorRepasse, p.movimentos);
  const pendente = pendenteDePrestacao(p.movimentos);
  const nada = p.movimentos.length === 0;

  if (nada) return "A_INICIAR";
  if (pendente.gt(0)) {
    // ⚠️ O PRAZO CONTA A PARTIR DO FIM DA VIGÊNCIA, EM DIAS CIVIS DO ENTE. Somar
    // milissegundos atravessaria a virada do horário de verão deslocando o vencimento em um
    // dia — e "prestação vencida" é rótulo que produz providência.
    const limite = somarDiasCivis(p.vigenciaFim, p.diasParaPrestacaoDeContas);
    if (diferencaEmDiasCivis(limite, p.hoje) < 0) return "PRESTACAO_VENCIDA";
    return aLiberar.gt(0) ? "EM_EXECUCAO" : "PRESTACAO_PENDENTE";
  }
  return aLiberar.gt(0) ? "EM_EXECUCAO" : "CONCLUIDO";
}

export const ROTULO_DO_ESTADO: Record<EstadoDoConvenio, string> = {
  A_INICIAR: "A iniciar",
  EM_EXECUCAO: "Em execução",
  PRESTACAO_PENDENTE: "Prestação pendente",
  PRESTACAO_VENCIDA: "Prestação VENCIDA",
  CONCLUIDO: "Concluído",
};

/** A data-limite da prestação de contas, em dia civil brasileiro, para a tela. */
export function limiteDaPrestacao(vigenciaFim: Date, dias: number): string {
  return diaCivilBr(somarDiasCivis(vigenciaFim, dias));
}

// ═══════════════════════════════════════════════════════════════════════════
// OS INPUTS — Zod na fronteira, e dinheiro como STRING decimal
// ═══════════════════════════════════════════════════════════════════════════

const zDia = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "A data é um DIA civil no formato YYYY-MM-DD.");

export const zCadastrarConvenioInput = z.object({
  identificador: z.string().trim().min(1).max(60),
  objeto: z.string().trim().min(10),
  papelDoEnte: z.enum(["CONCEDENTE", "CONVENENTE"]),
  partidaNome: z.string().trim().min(3),
  partidaDocumento: z.string().regex(/^\d{11}$|^\d{14}$/, "CPF (11) ou CNPJ (14) dígitos, sem máscara."),
  leiAutorizativa: z.string().trim().min(3),
  valorRepasse: zMoney,
  valorContrapartida: zMoney,
  diaVigenciaInicio: zDia,
  diaVigenciaFim: zDia,
  diasParaPrestacaoDeContas: z.number().int().min(1).max(365).default(60),
  fonteRecursoId: z.string().min(1),
  contaContabilId: z.string().min(1),
  criadoPor: z.string().min(1),
});
export type CadastrarConvenioInput = z.input<typeof zCadastrarConvenioInput>;

export const zMovimentoConvenioInput = z.object({
  convenioId: z.string().min(1),
  valor: zMoney,
  parcela: z.number().int().min(1).optional(),
  diaMovimento: zDia,
  /** `YYYY-MM` — a competência do fato, no calendário do ente. */
  competencia: z.string().regex(/^\d{4}-\d{2}$/),
  empenhoId: z.string().min(1).optional(),
  receitaArrecadadaId: z.string().min(1).optional(),
  motivo: z.string().trim().min(10, "O motivo explica o fato — dez caracteres é o mínimo."),
  criadoPor: z.string().min(1),
});
export type MovimentoConvenioInput = z.input<typeof zMovimentoConvenioInput>;

export const zEstornarMovimentoConvenioInput = z.object({
  movimentoId: z.string().min(1),
  diaMovimento: zDia,
  motivo: z.string().trim().min(10),
  criadoPor: z.string().min(1),
});
export type EstornarMovimentoConvenioInput = z.input<
  typeof zEstornarMovimentoConvenioInput
>;

/** A competência `YYYY-MM` de um instante, pelo calendário do ente. */
export function competenciaDoFato(instante: Date): string {
  return competenciaCivil(instante);
}
