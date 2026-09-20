import { diaCivil, FUSO_DO_ENTE } from "../../packages/datas/index.js";

/**
 * M21 — O DOMÍNIO PURO DA AGENDA DO GUICHÊ (V11 V8, TR 5.39.92).
 *
 * ═══ ⚠️ POR QUE ESTE ARQUIVO NÃO TOCA NO BANCO ═══
 * Tudo aqui é aritmética de RELÓGIO e de CALENDÁRIO — a parte da agenda que erra em
 * silêncio e que nenhum teste de integração pega de forma legível. Separada, ela se testa
 * com fixture em hora de borda e sob `TZ` deslocado, que é o que a regra da casa manda
 * ("propriedade, não padrão").
 *
 * ═══ ⚠️ HORA NÃO É INSTANTE ═══
 * "14:30" no guichê é uma POSIÇÃO NO DIA, não um ponto na linha do tempo. Guardá-la como
 * `Date` obrigaria a escolher um fuso para gravar e outro para ler, e o horário de verão
 * moveria compromissos antigos. Ela é texto "HH:MM", e a aritmética é em MINUTOS DESDE A
 * MEIA-NOITE — inteiros, onde não há arredondamento nem fuso.
 *
 * ⚠️ O DIA DA SEMANA SAI DO DIA CIVIL DO ENTE, e é calculado a partir do texto "AAAA-MM-DD"
 * por `Date.UTC` — o que é deliberadamente imune a fuso. `new Date(dia).getDay()` num
 * processo rodando em UTC devolveria o dia ANTERIOR para qualquer compromisso da manhã, e
 * a agenda inteira andaria um dia para trás sem ninguém perceber.
 */

/** "HH:MM" -> minutos desde a meia-noite. Recusa o que não for hora. */
export function minutosDaHora(hora: string): number {
  const m = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(hora);
  if (m === null) {
    throw new Error(`"${hora}" não é uma hora no formato HH:MM (00:00 a 23:59).`);
  }
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Minutos desde a meia-noite -> "HH:MM". Recusa o que passa do dia. */
export function horaDosMinutos(minutos: number): string {
  if (!Number.isInteger(minutos) || minutos < 0 || minutos > 1439) {
    throw new Error(`${minutos} não é um minuto válido do dia (0 a 1439).`);
  }
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * O dia da semana (0 = domingo … 6 = sábado) do DIA CIVIL DO ENTE.
 *
 * ⚠️ SEM `Date` NENHUM, e a razão é dupla. `diaCivil` já resolveu o fuso e devolveu
 * "AAAA-MM-DD"; daí para a frente é CALENDÁRIO, não linha do tempo, e construir um `Date` de
 * volta — local ou UTC — reintroduz a pergunta "em que fuso?" que acabou de ser respondida.
 *
 * A conta é a de Sakamoto: aritmética inteira sobre ano, mês e dia, exata no calendário
 * gregoriano. Ela não tem fuso porque não tem instante — e por isso este arquivo não precisa
 * entrar na lista de exceções do guard de data civil, que é onde uma isenção de arquivo
 * inteiro daria cobertura de graça a um `getUTC*` que alguém acrescentasse aqui depois.
 */
const DESLOCAMENTO_DO_MES = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4] as const;

export function diaDaSemanaCivil(instante: Date, fuso: string = FUSO_DO_ENTE): number {
  const [ano, mes, dia] = diaCivil(instante, fuso).split("-").map(Number);
  // Janeiro e fevereiro contam no ano anterior — é o que faz o bissexto cair no lugar certo.
  const y = mes! < 3 ? ano! - 1 : ano!;
  const bissextos = Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400);
  return (y + bissextos + DESLOCAMENTO_DO_MES[mes! - 1]! + dia!) % 7;
}

export interface JanelaOfertante {
  readonly horaInicio: string;
  readonly horaFim: string;
  readonly duracaoMinutos: number;
}

/**
 * OS HORÁRIOS QUE UMA JANELA OFERECE.
 *
 * ⚠️ O ÚLTIMO HORÁRIO TEM DE CABER INTEIRO. Uma janela 08:00–12:00 de 30 min oferece até
 * 11:30, nunca 11:45 nem 12:00: um atendimento que começa às 11:45 termina depois do
 * fechamento, e marcar alguém para ele é marcar para uma porta que fecha na cara.
 *
 * ⚠️ NADA DE PADRÃO. Se a janela não cabe nem um atendimento, a resposta é lista VAZIA —
 * e quem chamou tem de dizer isso a quem procurou horário, em vez de oferecer um.
 */
export function horariosDaJanela(j: JanelaOfertante): readonly string[] {
  const inicio = minutosDaHora(j.horaInicio);
  const fim = minutosDaHora(j.horaFim);
  if (!Number.isInteger(j.duracaoMinutos) || j.duracaoMinutos <= 0) {
    throw new Error(`Duração de ${j.duracaoMinutos} minutos não gera horário nenhum.`);
  }
  if (fim <= inicio) {
    throw new Error(`A janela ${j.horaInicio}–${j.horaFim} termina antes de começar.`);
  }
  const horarios: string[] = [];
  for (let t = inicio; t + j.duracaoMinutos <= fim; t += j.duracaoMinutos) {
    horarios.push(horaDosMinutos(t));
  }
  return horarios;
}

/** Uma janela como ela vem do banco, para decidir se vale no dia pedido. */
export interface JanelaVigente extends JanelaOfertante {
  readonly id: string;
  readonly diaDaSemana: number;
  readonly capacidade: number;
  readonly vigenciaInicio: Date;
  readonly vigenciaFim: Date | null;
}

/**
 * A janela VALE no dia pedido? Dia da semana igual, e o dia dentro da vigência — tudo
 * comparado por DIA CIVIL, nunca por instante: uma vigência que termina "hoje" vale hoje
 * inteiro, e comparar `Date` cru a faria terminar ao meio-dia.
 */
export function janelaValeNoDia(j: JanelaVigente, dia: Date, fuso: string = FUSO_DO_ENTE): boolean {
  if (j.diaDaSemana !== diaDaSemanaCivil(dia, fuso)) return false;
  const d = diaCivil(dia, fuso);
  if (d < diaCivil(j.vigenciaInicio, fuso)) return false;
  if (j.vigenciaFim !== null && d > diaCivil(j.vigenciaFim, fuso)) return false;
  return true;
}

/**
 * ⚠️ DUAS JANELAS DO MESMO GUICHÊ NO MESMO DIA DA SEMANA NÃO PODEM SE SOBREPOR.
 *
 * Se elas se cruzassem, o MESMO minuto teria duas capacidades, e quanto cabe às 10:00
 * passaria a depender de qual linha a consulta leu primeiro — o tipo de defeito que só
 * aparece quando a agenda está cheia e ninguém consegue reproduzir.
 *
 * A sobreposição é de HORA **e** de VIGÊNCIA: a mesma faixa horária em períodos que não se
 * cruzam é a troca legítima de oferta (o guichê passou a abrir mais cedo em março).
 */
export function janelasSeSobrepoem(
  a: JanelaVigente,
  b: JanelaVigente,
  fuso: string = FUSO_DO_ENTE
): boolean {
  if (a.diaDaSemana !== b.diaDaSemana) return false;

  const horaCruza =
    minutosDaHora(a.horaInicio) < minutosDaHora(b.horaFim) &&
    minutosDaHora(b.horaInicio) < minutosDaHora(a.horaFim);
  if (!horaCruza) return false;

  // Vigência em dia civil, com fim aberto tratado como "sem prazo".
  const aIni = diaCivil(a.vigenciaInicio, fuso);
  const bIni = diaCivil(b.vigenciaInicio, fuso);
  const aFim = a.vigenciaFim === null ? null : diaCivil(a.vigenciaFim, fuso);
  const bFim = b.vigenciaFim === null ? null : diaCivil(b.vigenciaFim, fuso);

  const aComecaAntesDoFimDeB = bFim === null || aIni <= bFim;
  const bComecaAntesDoFimDeA = aFim === null || bIni <= aFim;
  return aComecaAntesDoFimDeB && bComecaAntesDoFimDeA;
}

export interface HorarioOfertado {
  readonly hora: string;
  readonly capacidade: number;
  readonly ocupadas: number;
  readonly livres: number;
}

/**
 * A OFERTA DE UM DIA num guichê: cada horário com quanto cabe, quanto já foi tomado e
 * quanto sobra.
 *
 * ⚠️ `ocupadas` ENTRA PRONTO, contado pelo mesmo lugar que o guard da reserva conta. Uma
 * segunda contagem aqui produziria uma tela que oferece horário que a gravação recusa —
 * exatamente o defeito que a disponibilidade de recurso novo teve de desfazer na V7.3.
 */
export function ofertaDoDia(
  janelas: readonly JanelaVigente[],
  dia: Date,
  ocupadasPorHora: ReadonlyMap<string, number>,
  fuso: string = FUSO_DO_ENTE
): readonly HorarioOfertado[] {
  const porHora = new Map<string, HorarioOfertado>();
  for (const j of janelas) {
    if (!janelaValeNoDia(j, dia, fuso)) continue;
    for (const hora of horariosDaJanela(j)) {
      const ocupadas = ocupadasPorHora.get(hora) ?? 0;
      porHora.set(hora, {
        hora,
        capacidade: j.capacidade,
        ocupadas,
        livres: Math.max(0, j.capacidade - ocupadas),
      });
    }
  }
  return [...porHora.values()].sort((x, y) => (x.hora < y.hora ? -1 : 1));
}
