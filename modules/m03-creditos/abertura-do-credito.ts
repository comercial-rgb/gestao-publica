import { anoCivil, diaCivil, mesCivil } from "../../packages/datas/index.js";

/**
 * M03 — ABERTO OU REABERTO: a partição que a CF art. 167 § 2º impõe (V11 V8.6).
 *
 * ═══ ⚠️ A PENDÊNCIA DIZIA "FALTA UM FATO". FALTAVA A LEITURA DELE ═══
 * `CREDITO-ESPECIAL-ABERTO-OU-REABERTO` registrava que o PCASP parte o ramo dos créditos
 * especiais e extraordinários em ABERTOS, REABERTOS e REABERTOS - SUPLEMENTAÇÃO, e que
 * `LeiCredito`/`DecretoCredito` não registravam "esse vínculo".
 *
 * O vínculo EXISTE: o decreto aponta para a lei, e cada um tem o seu ano. O que faltava era
 * alguém ler a diferença — e é melhor assim do que uma caixa de seleção: uma escolha manual entre
 * "aberto" e "reaberto" é uma escolha que se erra, e o erro vai para o balancete do TCE. O ano do
 * decreto contra o ano da lei não se erra.
 *
 * ═══ O QUE A CONSTITUIÇÃO DIZ ═══
 * "Os créditos especiais e extraordinários terão vigência no exercício financeiro em que forem
 * autorizados, salvo se o ato de autorização for promulgado nos últimos quatro meses daquele
 * exercício, caso em que, reabertos nos limites de seus saldos, serão incorporados ao orçamento do
 * exercício financeiro subsequente." (CF art. 167 § 2º)
 *
 * Três consequências, e as três estão aqui:
 *
 *   1. mesmo exercício da lei  → ABERTO;
 *   2. exercício SEGUINTE      → REABERTO, e só se a lei foi promulgada nos últimos quatro meses;
 *   3. dois exercícios depois  → NÃO EXISTE. A reabertura vale para o exercício subsequente, um
 *      só; um decreto de N+2 contra uma lei de N não é reabertura, é crédito sem autorização
 *      vigente — e é o tipo de coisa que passa despercebida por anos.
 *
 * ⚠️ E ISTO NÃO VALE PARA O SUPLEMENTAR. Crédito suplementar reforça dotação que já existe e
 * morre com o exercício; ele não se reabre, e o PCASP não o parte. Aplicar a regra a ele
 * inventaria uma classificação que a norma não tem.
 */

export type TipoDeCreditoAdicional = "SUPLEMENTAR" | "ESPECIAL" | "EXTRAORDINARIO";

export type AberturaDoCredito = "ABERTO" | "REABERTO";

/** O tipo se reabre? Só especial e extraordinário — é o que o § 2º alcança. */
export function ehReabrivel(tipo: TipoDeCreditoAdicional): boolean {
  return tipo === "ESPECIAL" || tipo === "EXTRAORDINARIO";
}

/**
 * ⚠️ "ÚLTIMOS QUATRO MESES" É SETEMBRO A DEZEMBRO, e o mês vem do DIA CIVIL DO ENTE.
 *
 * Uma lei promulgada em 31 de dezembro às 22h em São Paulo é de dezembro; lida em UTC ela seria
 * de 1º de janeiro do ano seguinte — e aí a lei passaria a ser do exercício errado, o que muda a
 * resposta inteira desta função.
 */
export function promulgadaNosUltimosQuatroMeses(dataPublicacao: Date): boolean {
  return mesCivil(dataPublicacao) >= 9;
}

export interface CreditoParaClassificar {
  readonly tipoCredito: TipoDeCreditoAdicional;
  readonly leiAno: number;
  readonly leiDataPublicacao: Date;
  readonly decretoAno: number;
}

export interface Classificacao {
  readonly abertura: AberturaDoCredito | null;
  /** Quando o decreto não pode existir, o motivo — pronto para subir à tela. */
  readonly recusa: string | null;
}

/**
 * CLASSIFICA o decreto contra a lei que o autoriza.
 *
 * ⚠️ `abertura: null` NÃO É ERRO: é o crédito SUPLEMENTAR, que não se parte. Confundir "não se
 * aplica" com "não decidido" faria o roteiro do suplementar exigir uma dimensão que a norma não
 * tem.
 */
export function classificarAbertura(c: CreditoParaClassificar): Classificacao {
  if (!ehReabrivel(c.tipoCredito)) {
    return { abertura: null, recusa: null };
  }

  if (c.decretoAno === c.leiAno) {
    return { abertura: "ABERTO", recusa: null };
  }

  if (c.decretoAno < c.leiAno) {
    return {
      abertura: null,
      recusa:
        `O decreto é de ${c.decretoAno} e a lei que o autoriza é de ${c.leiAno}. Um decreto não ` +
        `executa autorização que ainda não existia. Nada foi gravado.`,
    };
  }

  if (c.decretoAno > c.leiAno + 1) {
    return {
      abertura: null,
      recusa:
        `O decreto é de ${c.decretoAno} e a lei é de ${c.leiAno}. A reabertura do art. 167 § 2º ` +
        `vale para o exercício SUBSEQUENTE, um só — ${c.leiAno + 1}. Um crédito ${c.tipoCredito} ` +
        `de ${c.leiAno} não alcança ${c.decretoAno}: ele precisaria de autorização nova. Nada foi gravado.`,
    };
  }

  // Exercício seguinte: só é reabertura se a lei nasceu nos últimos quatro meses.
  if (!promulgadaNosUltimosQuatroMeses(c.leiDataPublicacao)) {
    return {
      abertura: null,
      recusa:
        `A lei foi promulgada em ${diaCivil(c.leiDataPublicacao)} — fora dos ÚLTIMOS QUATRO MESES ` +
        `de ${anoCivil(c.leiDataPublicacao)}. Pela CF art. 167 § 2º, um crédito ${c.tipoCredito} ` +
        `só se reabre no exercício seguinte quando a autorização é promulgada de setembro a ` +
        `dezembro; fora disso a vigência morre com o exercício em que foi autorizado. Nada foi gravado.`,
    };
  }

  return { abertura: "REABERTO", recusa: null };
}

/**
 * A ABERTURA DE UM DECRETO JÁ GRAVADO, para quem vai LANÇAR (V11 V8.8).
 *
 * ⚠️ DERIVADA NA HORA DO LANÇAMENTO, e não gravada no decreto. É o mesmo desenho do tipo de
 * crédito, que também não é coluna de `MovimentoDotacao`: o decreto aponta para a lei, e a lei
 * tem o seu ano e a sua data de publicação — duplicar a conclusão criaria a segunda verdade sobre
 * o mesmo crédito, e a primeira divergência apareceria num demonstrativo, meses depois.
 *
 * ⚠️ E ELA LANÇA A RECUSA. Um decreto ilegal não nasce desde a V8.6 (`criarDecreto`), mas os que
 * nasceram ANTES daquela guarda existir continuam no banco. Executá-los agora significaria
 * escriturar um crédito sem autorização vigente — este é o segundo portão, no caminho do razão.
 *
 * Devolve `null` para o SUPLEMENTAR: ele não se parte, e isso não é ausência de decisão.
 */
export function exigirAberturaDoDecreto(c: CreditoParaClassificar): AberturaDoCredito | null {
  const { abertura, recusa } = classificarAbertura(c);
  if (recusa !== null) throw new Error(recusa);
  return abertura;
}
