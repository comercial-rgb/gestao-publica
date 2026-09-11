import { instanteCivil } from "../packages/datas/index.js";

/**
 * ═══ O INSTANTE PADRÃO DAS FIXTURES É HORA DE BORDA, NUNCA MEIO-DIA ═══
 *
 * ⚠️ POR QUE ESTE ARQUIVO EXISTE. Quase toda fixture deste repositório nasceu em
 * `T12:00:00Z` — 882 ocorrências quando o ENT03c mediu. Ao meio-dia UTC, a data civil do
 * ente e a data em UTC COINCIDEM, e coincidem em todo lugar: no dia, no mês, no ano, na
 * competência. Uma suíte inteira de fixtures ao meio-dia é uma suíte que **não consegue
 * distinguir** os dois eixos — e foi exatamente isso que deixou trinta e cinco sítios
 * comparando data por UTC passarem verdes por meses.
 *
 * Entre 21:00 e a meia-noite, os dois eixos DIVERGEM por um dia. É onde moram o fechamento
 * do mês, o último dia do exercício e o vencimento — e é o único horário em que um teste
 * consegue provar que o código escolheu o eixo certo. Um fato de 31/12 às 22:00 é dezembro
 * para o ente e janeiro para Greenwich.
 *
 * ⚠️ E ELE NÃO SUBSTITUI A PROVA DE FUSO, ELE A COMPLEMENTA — as duas pegam classes
 * DIFERENTES de defeito, e nenhuma das duas pega a outra:
 *
 *   · `npm run test:fuso` roda a suíte inteira sob `Pacific/Kiritimati` (UTC+14) e exige
 *     resultado idêntico. Pega quem lê o relógio do HOSPEDEIRO (`getFullYear()`,
 *     `new Date(a, m, d)`, `toLocaleDateString()` sem `timeZone`) — código que nesta
 *     máquina, que roda em America/Sao_Paulo, está acidentalmente certo;
 *   · a hora de borda daqui pega quem lê o eixo UTC (`getUTCFullYear()`,
 *     `Date.UTC(...)`, `toISOString().slice(0,10)`) — código que está errado em QUALQUER
 *     fuso, de forma estável, e que por isso atravessa a prova de fuso sem um arranhão.
 *
 * Use `DIA_DE_BORDA` para qualquer fixture cuja data importe. Use `MEIO_DIA` só quando o
 * teste precisar explicitamente de um instante em que os dois eixos concordam — e, quando
 * usar, diga por quê na linha de cima.
 */

/** O fuso do ente, repetido aqui só para o leitor: a régua é `packages/datas`. */
const HORA_DE_BORDA = 22;

/**
 * O instante padrão de uma fixture: 22:00 CIVIS do dia pedido.
 *
 * Em `America/Sao_Paulo` isso é 01:00 UTC do dia SEGUINTE — durante o horário de verão,
 * que o Brasil teve até 2019, era 00:00 UTC. Qualquer código que leia o dia por UTC
 * responde a data errada; qualquer código que use `packages/datas` responde a certa.
 */
export function DIA_DE_BORDA(ano: number, mes: number, dia: number): Date {
  return instanteCivil(ano, mes, dia, HORA_DE_BORDA, 0, 0, 0);
}

/**
 * Meio-dia CIVIL — o instante em que os dois eixos coincidem.
 *
 * ⚠️ NÃO É O PADRÃO, e usar sem motivo é desligar metade da capacidade de detecção do
 * teste. Existe para os casos em que a coincidência é o ponto: comparar o comportamento
 * no miolo do dia com o comportamento na borda, por exemplo.
 */
export function MEIO_DIA(ano: number, mes: number, dia: number): Date {
  return instanteCivil(ano, mes, dia, 12, 0, 0, 0);
}
