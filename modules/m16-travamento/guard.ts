import type { PrismaClient } from "../../prisma/generated/client/client.js";
import {
  derivarTravamento,
  descreverJanela,
  type Travamento,
} from "./dominio.js";

/** O client OU uma transação dele. */
export type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/**
 * ESTÁ TRAVADO? — a leitura, sobre os eventos append-only.
 *
 * A aritmética é do domínio (`derivarTravamento`, puro e testado sem banco); aqui só se
 * BUSCA. O filtro por janela vai no SQL (índice em `janelaInicio`/`janelaFim`): a tabela
 * cresce um evento por fechamento de mês, mas ler a tabela inteira a cada lançamento seria
 * pagar o preço de uma década de fechamentos em cada empenho.
 */
export async function estaTravado(
  tx: Tx,
  dataTransacao: Date,
  autorDoLancamento: string
): Promise<Travamento | null> {
  const eventos = await tx.movimentoTravamento.findMany({
    where: {
      janelaInicio: { lte: dataTransacao },
      janelaFim: { gte: dataTransacao },
      // Só os que PODEM decidir: os globais e os DAQUELE autor. A trava da alice não
      // interessa ao lançamento do bob.
      OR: [{ usuarioAlvo: null }, { usuarioAlvo: autorDoLancamento }],
    },
    select: {
      id: true,
      tipo: true,
      janelaInicio: true,
      janelaFim: true,
      usuarioAlvo: true,
      criadoEm: true,
      criadoPor: true,
    },
  });

  return derivarTravamento(eventos, dataTransacao, autorDoLancamento);
}

/**
 * O GUARD — e ele roda DENTRO do funil `lancarNoRazao`, uma vez só.
 *
 * ═══ ⚠️ O CORTE É A `dataTransacao` — A DATA DO **FATO** ═══
 * Travar janeiro trava os FATOS de janeiro, não o que foi DIGITADO em janeiro. Um fato de
 * dezembro digitado em janeiro pertence a dezembro, e é a competência DELE que manda. É o
 * mesmo corte que a MSC, a DVP e o Balanço usam para ler — e o travamento tem de proteger
 * exatamente o número que esses relatórios publicam.
 *
 * ═══ ⚠️ E É POR ISSO QUE O ESTORNO TEM DUAS SEMÂNTICAS, E AS DUAS ESTÃO CERTAS ═══
 * Um estorno carrega a data do ATO de anular (o `dataEstorno` que o chamador informa), não
 * a do fato original. Então:
 *
 *   · anular em JANEIRO um empenho de DEZEMBRO, com dezembro travado -> **PASSA**.
 *     E está certo: o lançamento de estorno é um fato de JANEIRO. O saldo publicado de
 *     dezembro (cortado em 31/12) NÃO SE MOVE — o empenho original continua lá, intacto, e
 *     o balancete que o TCE recebeu continua verdadeiro. Barrar isso impediria o ente de
 *     corrigir em janeiro um erro de dezembro, que é justamente o que ele tem de fazer.
 *
 *   · o MESMO estorno RETROAGIDO para 20/12 -> **REJEITA**. Aí sim ele é um fato de
 *     dezembro, e mexeria no número já fechado.
 *
 * O guard não pergunta "o que este lançamento desfaz?" — pergunta "QUANDO ele acontece?".
 * Uma regra, e ela cobre os dois casos sem exceção nenhuma.
 *
 * ═══ ⚠️ `ENCERRAMENTO` É ISENTO — POR DESIGN, NÃO POR ESQUECIMENTO ═══
 * A VIRADA DO EXERCÍCIO (a apuração do resultado e o encerramento dos controles, cbb6d0f)
 * lança em **31/12** — dentro da competência que o ente acabou de travar. É a ordem natural
 * das coisas: fecha-se dezembro e SÓ ENTÃO se apura o resultado.
 *
 * Se o `ENCERRAMENTO` não fosse isento, o travamento de dezembro tornaria a virada
 * IMPOSSÍVEL — e o ente teria de destravar dezembro para encerrar o exercício, o que é o
 * oposto do que o TR quer.
 *
 * E a isenção é SEGURA porque o encerramento não é um fato novo: ele TRANSFERE (as classes
 * 3/4 para o PL, as 5/6 para o vazio). Ele não cria receita nem despesa — e é por isso que
 * a MSC agregada o exclui e a DVP também. O que o travamento protege é o MOVIMENTO do mês;
 * o encerramento não é movimento.
 *
 * ⚠️ E repare no encaixe: as DUAS únicas funções do repositório que datam o estorno com a
 * data do ORIGINAL (`estornarApuracao` e `estornarEncerramentoControles`) são exatamente as
 * duas que nascem `ENCERRAMENTO`. Elas retroagiriam para 31/12 — e são isentas. O desenho
 * fecha sozinho.
 */
export async function exigirCompetenciaDestravada(
  tx: Tx,
  l: {
    readonly numeroControle: string;
    readonly dataTransacao: Date;
    readonly criadoPor: string;
    readonly natureza?: "NORMAL" | "ENCERRAMENTO" | null | undefined;
  }
): Promise<void> {
  // ⚠️ NULO LÊ-SE NORMAL. A coluna `natureza` entrou aditiva, sem backfill — todo
  // lançamento anterior à apuração tem `null`, e ele É normal. A mesma armadilha dos três
  // valores que o `filtroDoLancamento` do M01 resolve no SQL.
  const natureza = l.natureza ?? "NORMAL";
  if (natureza === "ENCERRAMENTO") return; // ver o cabeçalho — isento por design

  const travado = await estaTravado(tx, l.dataTransacao, l.criadoPor);
  if (travado === null) return;

  const alvo =
    travado.escopo === "GLOBAL"
      ? "GLOBAL (vale para todos os usuários)"
      : `do USUÁRIO "${travado.usuarioAlvo}"`;

  throw new Error(
    `COMPETÊNCIA TRAVADA (TR 4.52/4.53/4.54): o lançamento ${l.numeroControle} tem data ` +
      `de fato ${descreverJanela(l.dataTransacao, l.dataTransacao).split(" a ")[0]}, que ` +
      `cai na janela TRAVADA de ${descreverJanela(travado.janelaInicio, travado.janelaFim)}.\n` +
      `  escopo da trava: ${alvo}\n` +
      `  travada por:     ${travado.travadoPor}\n` +
      `  autor do lançamento: ${l.criadoPor}\n` +
      `\n` +
      `O corte é pela DATA DO FATO, não pela da digitação: um fato de dezembro digitado ` +
      `hoje continua sendo de dezembro. Para lançar aqui, DESTRAVE a janela (com motivo — ` +
      `reabrir período fechado é ato que o controle interno vai querer explicado). Nada foi ` +
      `gravado.`
  );
}
