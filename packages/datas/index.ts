/**
 * A DATA CIVIL DO ENTE — a única régua de comparação de data no domínio.
 *
 * ═══ ⚠️ A DECISÃO, E O QUE A OBRIGOU ═══
 * **Comparação de data no domínio usa a DATA CIVIL DO ENTE, nunca UTC.**
 *
 * O que mostrou o problema foi o OFX. Uma tarifa em `20260131235900[-3:BRT]` — o último
 * minuto de janeiro em Brasília — é **31/01** no extrato que o tesoureiro tem na mão e
 * **01/02** se lida como instante em Greenwich. Um dia. Na virada do mês. Numa
 * conciliação mensal, é a diferença entre fechar e não fechar.
 *
 * ⚠️ E O MESMO ERRO ESTAVA NO TRAVAMENTO DE COMPETÊNCIA, que é o guard mais sensível do
 * repositório. A janela da competência `2026-12` era montada com `Date.UTC`:
 *
 *     de 2026-12-01T00:00:00Z  ate  2026-12-31T23:59:59.999Z
 *
 * Em horário civil de São Paulo isso é **30/11 às 21:00 até 31/12 às 20:59:59**. As
 * consequências, nas duas pontas:
 *
 *   · um fato de **31/12 às 22:00** (civil) cai fora da janela — **um lançamento de
 *     dezembro escapa da trava de dezembro**, que é exatamente o que ela existe para
 *     impedir;
 *   · um fato de **30/11 às 22:00** (civil) cai dentro — um lançamento de novembro é
 *     recusado por uma trava de dezembro.
 *
 * ⚠️ POR QUE NÃO "GUARDAR TUDO EM UTC E PRONTO". Porque a pergunta do domínio não é sobre
 * instantes: é sobre DIAS CIVIS. "O saldo em 30/06", "a competência 2026-12", "a ordem
 * cronológica por data de liquidação", "o vencimento" — todas são perguntas sobre o
 * calendário do ente, e o calendário do ente não é o de Greenwich. O instante continua
 * sendo o que se GRAVA; a data civil é o que se COMPARA.
 *
 * ═══ ⚠️ POR QUE `Intl`, E NÃO UM OFFSET FIXO DE −3 ═══
 * O Brasil teve horário de verão até 2019, e pode voltar a ter — é decisão de decreto,
 * não de física. Um `-3` cravado no código estaria certo hoje e errado em qualquer
 * exercício histórico que atravesse outubro–fevereiro de 2018, e errado de novo no dia
 * em que o horário de verão voltar. `Intl.DateTimeFormat` conhece a regra de cada data.
 */

/**
 * ⚠️ O FUSO DO ENTE, e ele é UM enquanto o produto atende UM município.
 *
 * O destino declarado é Anita Garibaldi/SC, que está em `America/Sao_Paulo`. Quando o
 * eixo de município existir (ver `docs/adr/ADR-eixo-de-municipio.md`), este valor sai do
 * cadastro do ente e passa a ser parâmetro — e é por isso que TODA função abaixo já
 * aceita o fuso como argumento, com este apenas como padrão. Trocar depois será mudar de
 * onde vem o valor, não reescrever as comparações.
 */
export const FUSO_DO_ENTE = "America/Sao_Paulo";

const CAMPOS = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
} as const;

const formatadores = new Map<string, Intl.DateTimeFormat>();

function formatador(fuso: string): Intl.DateTimeFormat {
  let f = formatadores.get(fuso);
  if (f === undefined) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: fuso, hour12: false, ...CAMPOS });
    formatadores.set(fuso, f);
  }
  return f;
}

interface PartesCivis {
  readonly ano: number;
  readonly mes: number;
  readonly dia: number;
  readonly hora: number;
  readonly minuto: number;
  readonly segundo: number;
}

function partes(instante: Date, fuso: string): PartesCivis {
  const p: Record<string, string> = {};
  for (const parte of formatador(fuso).formatToParts(instante)) {
    if (parte.type !== "literal") p[parte.type] = parte.value;
  }
  return {
    ano: Number(p["year"]),
    mes: Number(p["month"]),
    dia: Number(p["day"]),
    // ⚠️ `hour12: false` pode devolver "24" para a meia-noite em alguns motores. O `% 24`
    // normaliza — sem ele, `Date.UTC(..., 24, ...)` viraria o dia seguinte em silêncio.
    hora: Number(p["hour"]) % 24,
    minuto: Number(p["minute"]),
    segundo: Number(p["second"]),
  };
}

/** O deslocamento do fuso, em minutos, NAQUELE instante (respeita horário de verão). */
function offsetEmMinutos(instante: Date, fuso: string): number {
  const c = partes(instante, fuso);
  const comoSeFosseUtc = Date.UTC(c.ano, c.mes - 1, c.dia, c.hora, c.minuto, c.segundo);
  // Os milissegundos não aparecem nas partes; descontá-los evita erro de arredondamento.
  const semMs = instante.getTime() - instante.getUTCMilliseconds();
  return (comoSeFosseUtc - semMs) / 60_000;
}

/** O DIA CIVIL do ente, como `YYYY-MM-DD`. É a chave de comparação do domínio. */
export function diaCivil(instante: Date, fuso: string = FUSO_DO_ENTE): string {
  const c = partes(instante, fuso);
  return (
    `${String(c.ano).padStart(4, "0")}-` +
    `${String(c.mes).padStart(2, "0")}-` +
    `${String(c.dia).padStart(2, "0")}`
  );
}

/** O ano civil do ente. É por ele que se decide a que EXERCÍCIO um fato pertence. */
export function anoCivil(instante: Date, fuso: string = FUSO_DO_ENTE): number {
  return partes(instante, fuso).ano;
}

/** A competência civil, como `YYYY-MM`. */
/**
 * O MÊS civil do ente (1–12). O par de `anoCivil`, e faltava: sem ele, quem precisava do
 * mês caía em `getUTCMonth() + 1` — que às 22:00 do último dia do mês já responde o mês
 * seguinte. Foi o caso do bimestre do RREO em `lib/portas/programacao.ts`.
 */
export function mesCivil(instante: Date, fuso: string = FUSO_DO_ENTE): number {
  return partes(instante, fuso).mes;
}

export function competenciaCivil(instante: Date, fuso: string = FUSO_DO_ENTE): string {
  const c = partes(instante, fuso);
  return `${String(c.ano).padStart(4, "0")}-${String(c.mes).padStart(2, "0")}`;
}

/** A data civil em `DD/MM/YYYY` — como o documento operacional a imprime. */
export function diaCivilBr(instante: Date, fuso: string = FUSO_DO_ENTE): string {
  const [ano, mes, dia] = diaCivil(instante, fuso).split("-") as [string, string, string];
  return `${dia}/${mes}/${ano}`;
}

/**
 * O INSTANTE de uma hora de parede no fuso do ente.
 *
 * ⚠️ DUAS PASSADAS, e a segunda não é preciosismo: o offset depende do instante, e o
 * instante é o que se quer descobrir. A primeira passada usa o palpite ingênuo para
 * achar um offset aproximado; a segunda corrige na fronteira do horário de verão, onde o
 * palpite cai do lado errado da mudança.
 */
/**
 * Instante → "dd/mm/aaaa hh:mm" no fuso do ente. O par de `diaCivilBr`, para quando a HORA
 * importa: o instante do REGISTRO de um movimento, a abertura de uma sessão, o envio.
 *
 * ⚠️ POR QUE ELE MORA AQUI e não em cada tela. Três páginas imprimiam instante com
 * `toLocaleString("pt-BR")` sem `timeZone` — e sem `timeZone` o `Intl` usa o relógio de
 * QUEM RENDERIZA. Em componente de servidor, isso é o relógio da MÁQUINA: o mesmo fato
 * apareceria com horas diferentes conforme onde o processo subisse, e ninguém notaria até
 * alguém comparar um print com o banco. A régua é uma só, e é esta.
 */
export function instanteCivilBr(instante: Date, fuso: string = FUSO_DO_ENTE): string {
  const c = partes(instante, fuso);
  const dois = (n: number): string => String(n).padStart(2, "0");
  return (
    `${dois(c.dia)}/${dois(c.mes)}/${String(c.ano).padStart(4, "0")} ` +
    `${dois(c.hora)}:${dois(c.minuto)}`
  );
}

export function instanteCivil(
  ano: number,
  mes: number,
  dia: number,
  hora = 0,
  minuto = 0,
  segundo = 0,
  ms = 0,
  fuso: string = FUSO_DO_ENTE
): Date {
  const palpite = Date.UTC(ano, mes - 1, dia, hora, minuto, segundo, ms);
  const off1 = offsetEmMinutos(new Date(palpite), fuso);
  const off2 = offsetEmMinutos(new Date(palpite - off1 * 60_000), fuso);
  return new Date(palpite - off2 * 60_000);
}

/** O primeiro instante do dia civil `YYYY-MM-DD`. */
/**
 * "AAAA-MM-DD" → o MEIO-DIA CIVIL daquele dia. O ancoradouro do que é um DIA, não um
 * instante: a data do fato que o usuário digita num formulário.
 *
 * ⚠️ POR QUE MEIO-DIA E NÃO MEIA-NOITE. A meia-noite é a borda, e borda é onde tudo dá
 * errado: um deslize de uma hora em qualquer leitura joga o fato para o dia vizinho. Ao
 * meio-dia há doze horas de folga para cada lado, e o dia civil se mantém em qualquer
 * fuso do país.
 *
 * ⚠️ E POR QUE ELE EXISTE COMO FUNÇÃO. Treze sítios da borda de escrita — empenho,
 * liquidação, pagamento, arrecadação, crédito adicional, movimentação bancária — faziam
 * `new Date(`${dia}T12:00:00Z`)`, que é meio-dia em GREENWICH e nove da manhã no ente.
 * O dia civil saía certo, mas por uma régua diferente da que o resto do sistema usa, e
 * "certo por outra régua" é como as cinco formas do eixo de data nasceram, uma a uma.
 */
export function meioDiaCivil(dia: string, fuso: string = FUSO_DO_ENTE): Date {
  const [ano, mes, d] = exigirDia(dia);
  return instanteCivil(ano, mes, d, 12, 0, 0, 0, fuso);
}

export function inicioDoDiaCivil(dia: string, fuso: string = FUSO_DO_ENTE): Date {
  const [a, m, d] = exigirDia(dia);
  return instanteCivil(a, m, d, 0, 0, 0, 0, fuso);
}

/** O último instante do dia civil `YYYY-MM-DD` (23:59:59.999 locais). */
export function fimDoDiaCivil(dia: string, fuso: string = FUSO_DO_ENTE): Date {
  const [a, m, d] = exigirDia(dia);
  return instanteCivil(a, m, d, 23, 59, 59, 999, fuso);
}

/**
 * A janela de instantes do MÊS civil `YYYY-MM`.
 *
 * ⚠️ É ESTA que o travamento de competência usa. Com `Date.UTC` a janela de `2026-12`
 * começava em 30/11 às 21:00 e terminava em 31/12 às 20:59 — deixando escapar o
 * lançamento de 31/12 à noite, que é justamente o que alguém esconderia ali.
 */
export function janelaCivilDoMes(
  competencia: string,
  fuso: string = FUSO_DO_ENTE
): { readonly inicio: Date; readonly fim: Date } {
  const m = /^(\d{4})-(\d{2})$/.exec(competencia);
  if (m === null) {
    throw new Error(
      `Competência "${competencia}" inválida — o formato é YYYY-MM (ex.: 2026-01).`
    );
  }
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) {
    throw new Error(`Competência "${competencia}": o mês ${mes} não existe.`);
  }
  // Dia 0 do mês seguinte é o último dia deste — sem tabela de dias por mês, e correto
  // em ano bissexto.
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return {
    inicio: instanteCivil(ano, mes, 1, 0, 0, 0, 0, fuso),
    fim: instanteCivil(ano, mes, ultimoDia, 23, 59, 59, 999, fuso),
  };
}

/** A janela de instantes do ANO civil. */
export function janelaCivilDoAno(
  ano: number,
  fuso: string = FUSO_DO_ENTE
): { readonly inicio: Date; readonly fim: Date } {
  return {
    inicio: instanteCivil(ano, 1, 1, 0, 0, 0, 0, fuso),
    fim: instanteCivil(ano, 12, 31, 23, 59, 59, 999, fuso),
  };
}

/**
 * Compara dois instantes PELO DIA CIVIL. `-1`, `0` ou `1`.
 *
 * ⚠️ O `0` É O PONTO. Dois fatos do MESMO dia civil empatam, ainda que gravados em horas
 * diferentes — e é o empate que faz o critério de desempate do domínio (o número da
 * liquidação, no art. 141) chegar a ser aplicado. Comparar instantes ordenaria por hora
 * de digitação e o desempate nunca rodaria.
 */
export function compararPorDiaCivil(
  a: Date,
  b: Date,
  fuso: string = FUSO_DO_ENTE
): -1 | 0 | 1 {
  const da = diaCivil(a, fuso);
  const db = diaCivil(b, fuso);
  return da < db ? -1 : da > db ? 1 : 0;
}

/** `true` se os dois instantes caem no mesmo dia civil do ente. */
export function mesmoDiaCivil(a: Date, b: Date, fuso: string = FUSO_DO_ENTE): boolean {
  return diaCivil(a, fuso) === diaCivil(b, fuso);
}

function exigirDia(dia: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia);
  if (m === null) {
    throw new Error(`Dia "${dia}" inválido — o formato é YYYY-MM-DD.`);
  }
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/**
 * A JANELA CIVIL DE UMA CORRIDA DE MESES — bimestre, quadrimestre, semestre, doze meses.
 *
 * `mesInicio` é 1-indexado e PODE SAIR DO ANO nos dois sentidos: `mes 0` é dezembro do
 * ano anterior, `mes 13` é janeiro do seguinte. É o que a janela de doze meses da RCL
 * precisa — no 1º bimestre ela começa em março do exercício ANTERIOR.
 *
 * ⚠️ ELA EXISTE PARA SUBSTITUIR `new Date(Date.UTC(ano, mes, 1))`, que é a forma como o
 * defeito de eixo entrou em quase todo relatório: a janela do bimestre 1 de 2026 nascia
 * em **31/12/2025 às 21:00** civis e terminava em **28/02 às 20:59** — o que faz a
 * receita da noite do último dia do bimestre cair no bimestre seguinte, e a despesa da
 * noite de 31/12 entrar num exercício que já encerrou.
 */
export function janelaCivilDeMeses(
  ano: number,
  mesInicio: number,
  quantidadeDeMeses: number,
  fuso: string = FUSO_DO_ENTE
): { readonly inicio: Date; readonly fim: Date } {
  if (!Number.isInteger(quantidadeDeMeses) || quantidadeDeMeses < 1) {
    throw new Error(
      `A corrida de meses precisa de pelo menos 1 mês; recebeu ${quantidadeDeMeses}.`
    );
  }
  const primeiro = normalizarMes(ano, mesInicio);
  const ultimo = normalizarMes(ano, mesInicio + quantidadeDeMeses - 1);
  return {
    inicio: janelaCivilDoMes(primeiro, fuso).inicio,
    fim: janelaCivilDoMes(ultimo, fuso).fim,
  };
}

/**
 * A competência `YYYY-MM` de um mês que pode ter transbordado do ano — `mes 0` é o
 * dezembro anterior, `mes 13` o janeiro seguinte.
 */
export function normalizarMes(ano: number, mes: number): string {
  const absoluto = ano * 12 + (mes - 1);
  const a = Math.floor(absoluto / 12);
  const m = absoluto - a * 12 + 1;
  return `${String(a).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
}

/**
 * QUANTOS DIAS CIVIS SEPARAM DOIS INSTANTES — `ate` menos `de`, inteiro, com sinal.
 *
 * ⚠️ A CONTA É ENTRE DIAS DO CALENDÁRIO, e não entre instantes divididos por 86.400.000.
 * Um contrato cujo fim está gravado no ÚLTIMO instante do dia (23:59:59) dista do meio-dia
 * de hoje 0,99 dia — e um `Math.floor` transformaria "vence amanhã" em "vence hoje".
 * Fixar as duas pontas no MEIO-DIA CIVIL também é o que atravessa a virada do horário de
 * verão sem perder ou ganhar um dia: o dia de 23 horas ainda contém o meio-dia.
 */
export function diferencaEmDiasCivis(
  ate: Date,
  de: Date,
  fuso: string = FUSO_DO_ENTE
): number {
  const meioDia = (d: Date): number => {
    const [a, m, dd] = exigirDia(diaCivil(d, fuso));
    return instanteCivil(a, m, dd, 12, 0, 0, 0, fuso).getTime();
  };
  return Math.round((meioDia(ate) - meioDia(de)) / 86_400_000);
}

/**
 * SOMA DIAS AO CALENDÁRIO, preservando a hora civil — `dias` pode ser negativo.
 *
 * ⚠️ NÃO É `getTime() + dias * 86.400.000`. Essa soma é em instantes, e atravessar a
 * virada do horário de verão desloca a HORA civil em 60 minutos: um contrato que terminava
 * às 23:59:59 do dia X passa a terminar às 22:59:59 (ou às 00:59:59 do dia SEGUINTE) do
 * dia X+N. Como `vigenciaFim` guarda justamente o último instante do dia, uma prorrogação
 * de 365 dias mudava o DIA em que o contrato vence.
 */
export function somarDiasCivis(
  instante: Date,
  dias: number,
  fuso: string = FUSO_DO_ENTE
): Date {
  const p = partes(instante, fuso);
  // O dia + N é resolvido no calendário proléptico do próprio `Date`, em UTC, onde a
  // aritmética de dias é exata por não haver horário de verão nenhum — e só depois o
  // resultado volta a ser lido como dia CIVIL.
  const rolado = new Date(Date.UTC(p.ano, p.mes - 1, p.dia + dias));
  return instanteCivil(
    rolado.getUTCFullYear(),
    rolado.getUTCMonth() + 1,
    rolado.getUTCDate(),
    p.hora,
    p.minuto,
    p.segundo,
    instante.getUTCMilliseconds(),
    fuso
  );
}
