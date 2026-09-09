import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { SINAL_PREVISAO } from "./dominio.js";

/** O client OU uma transação dele — ver a nota do M04 (`consultas.ts`). */
type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/**
 * A RECEITA PREVISTA DE CADA FONTE — leitura pura, e a aritmética é a DAQUI.
 *
 * ═══ POR QUE ESTA FUNÇÃO MORA NO M02 ═══
 * O excesso de arrecadação (TR 4.37) é `arrecadado − previsto`, por fonte. O
 * arrecadado é do M04 (`arrecadadoPorFonte`); o previsto é do M02, que é o dono da
 * `ReceitaPrevista`. Somar a previsão dentro do M03 criaria uma SEGUNDA verdade sobre
 * o orçamento da receita — e ela divergiria da do Anexo 10 no dia em que alguém
 * esquecesse o sinal da DEDUÇÃO. O total é do dono do dado; quem precisa, compõe.
 *
 * ⚠️ NENHUM SUM BRUTO. O `previsaoTotal` do M04 (por natureza) usa `aggregate/_sum` —
 * é código antigo, e ele funciona porque não há sinal a aplicar por lá. Aqui HÁ: a
 * DEDUÇÃO subtrai. Um `_sum(valorPrevisto)` somaria a dedução do FUNDEB como se fosse
 * receita a mais, inflaria o previsto da fonte e ESCONDERIA o excesso de arrecadação
 * — exatamente o número que autoriza crédito adicional.
 *
 * ═══ "PREVISÃO ATUALIZADA" É A INICIAL — E ISSO É UMA PENDÊNCIA DECLARADA ═══
 * O art. 43 § 3º compara o arrecadado com a previsão ATUALIZADA. O modelo não tem
 * reprevisão: a `ReceitaPrevista` guarda UM `valorPrevisto` por natureza/fonte, e o
 * Anexo 10 já emite as duas colunas (inicial e atualizada) com o MESMO número, dizendo
 * por quê. Esta função herda exatamente essa pendência — e é o lugar certo para ela
 * ser absorvida quando a reprevisão existir: quem chama não muda.
 */
export interface PrevisaoDetalhada {
  readonly naturezaCodigo: string;
  readonly fonteId: string;
  readonly previsto: Money;
}

/**
 * A PREVISÃO POR NATUREZA × FONTE — o grão do dataset aberto da receita (TR 7.4.1).
 *
 * ⚠️ OUTRO GRÃO, A MESMA ARITMÉTICA: o sinal continua vindo do `SINAL_PREVISAO` (a
 * DEDUÇÃO subtrai). O que muda é a CHAVE.
 *
 * ⚠️ E A PREVISÃO NÃO SE REPARTE POR CO. A `ReceitaPrevista` não tem
 * `CodigoAcompanhamento` — a LOA prevê por natureza e fonte, e ponto. É por isso que o
 * dataset da receita tem o grão natureza × fonte (ver `datasetReceita`): uma linha por
 * CO repetiria a mesma previsão em várias linhas, e a coluna passaria a MENTIR quando
 * alguém a somasse. Um dataset aberto não publica número que estoura ao ser somado.
 */
export async function previsaoPorNaturezaFonte(
  prisma: Tx,
  p: { readonly exercicio: number }
): Promise<readonly PrevisaoDetalhada[]> {
  const previstas = await prisma.receitaPrevista.findMany({
    where: { exercicio: p.exercicio },
    select: {
      fonteId: true,
      tipoReceita: true,
      valorPrevisto: true,
      naturezaReceita: { select: { codigo: true } },
    },
  });

  const por = new Map<string, PrevisaoDetalhada>();
  for (const r of previstas) {
    const codigo = r.naturezaReceita.codigo;
    const chave = `${codigo}|${r.fonteId}`;
    const acc = por.get(chave) ?? {
      naturezaCodigo: codigo,
      fonteId: r.fonteId,
      previsto: toMoney("0.00"),
    };
    const valor = toMoney(r.valorPrevisto.toFixed(2));
    por.set(chave, {
      ...acc,
      previsto:
        SINAL_PREVISAO[r.tipoReceita] === 1
          ? toMoney(acc.previsto.plus(valor))
          : toMoney(acc.previsto.minus(valor)),
    });
  }
  return [...por.values()];
}

/**
 * A DOTAÇÃO FIXADA PELA LOA, no grão da ficha — o lado DESPESA da consistência da LOA (TR 4.17).
 *
 * ⚠️ FIXADA, não atualizada. `valorDotado` é o que a LOA fixou (art. 4º) — a origem do movimento
 * `DOTACAO_INICIAL`. A consistência da LOA confere a SANÇÃO (o que foi fixado), não a execução; os
 * créditos adicionais (que mexem na dotação atualizada) são outra conta, do M03.
 *
 * ⚠️ O grão traz fonte, função, subfunção e a NATUREZA de despesa (código completo) — é o que os
 * classificadores de limite (MDE por subfunção, saúde por natureza) precisam para projetar sobre a
 * LOA. Um leitor, vários confrontos; nenhuma segunda classificação.
 */
export interface DotacaoFixadaDetalhada {
  readonly fonteId: string;
  readonly funcaoCodigo: string;
  readonly subfuncaoCodigo: string;
  /** O `codigoCompleto` da natureza de despesa (6 dígitos) — o grão dos classificadores. */
  readonly naturezaCodigo: string;
  /** A modalidade (2 dígitos) — 91 = intra-orçamentária. */
  readonly modalidade: string;
  readonly valorDotado: Money;
}

export async function dotacaoFixadaDetalhada(
  prisma: Tx,
  p: { readonly exercicio: number }
): Promise<readonly DotacaoFixadaDetalhada[]> {
  const fichas = await prisma.fichaOrcamentaria.findMany({
    where: { exercicio: p.exercicio },
    select: {
      fonteId: true,
      valorDotado: true,
      funcao: { select: { codigo: true } },
      subfuncao: { select: { codigo: true } },
      naturezaDespesa: { select: { codigoCompleto: true, codModalidade: true } },
    },
  });
  return fichas.map((f) => ({
    fonteId: f.fonteId,
    funcaoCodigo: f.funcao.codigo,
    subfuncaoCodigo: f.subfuncao.codigo,
    naturezaCodigo: f.naturezaDespesa.codigoCompleto,
    modalidade: f.naturezaDespesa.codModalidade,
    valorDotado: toMoney(f.valorDotado.toFixed(2)),
  }));
}

export async function previsaoPorFonte(
  prisma: Tx,
  p: { readonly exercicio: number }
): Promise<ReadonlyMap<string, Money>> {
  const previstas = await prisma.receitaPrevista.findMany({
    where: { exercicio: p.exercicio },
    select: { fonteId: true, tipoReceita: true, valorPrevisto: true },
  });

  const por = new Map<string, Money>();
  for (const r of previstas) {
    const valor = toMoney(r.valorPrevisto.toFixed(2));
    const acc = por.get(r.fonteId) ?? toMoney("0.00");
    por.set(
      r.fonteId,
      SINAL_PREVISAO[r.tipoReceita] === 1
        ? toMoney(acc.plus(valor))
        : toMoney(acc.minus(valor))
    );
  }
  return por;
}

/** A soma dos AJUSTES de reprevisão por natureza, num exercício (append-only, com sinal). */
export interface ReprevisaoDaNatureza {
  readonly naturezaCodigo: string;
  readonly ajuste: Money;
}

/**
 * A REPREVISÃO ACUMULADA POR NATUREZA — o Σ dos ajustes (com sinal) de um exercício.
 *
 * É o que destrava a coluna "previsão atualizada": os relatórios (Anexos 1/3/8/12) somam a previsão
 * INICIAL da `ReceitaPrevista` com este acumulado. Append-only: cada reprevisão é uma linha; a
 * atualizada é a inicial mais a Σ. Leitura pura.
 */
export async function reprevisaoAcumuladaPorNatureza(
  prisma: Tx,
  p: { readonly exercicio: number }
): Promise<ReadonlyMap<string, Money>> {
  const linhas = await prisma.receitaReprevista.findMany({
    where: { exercicio: p.exercicio },
    select: { naturezaCodigo: true, valorAjuste: true },
  });
  const por = new Map<string, Money>();
  for (const l of linhas) {
    const acc = por.get(l.naturezaCodigo) ?? toMoney("0.00");
    por.set(l.naturezaCodigo, toMoney(acc.plus(toMoney(l.valorAjuste.toFixed(2)))));
  }
  return por;
}

/** Uma reprevisão registrada (para a tela de leitura). */
export interface ReprevisaoRegistrada {
  readonly id: string;
  readonly naturezaCodigo: string;
  readonly fonteCodigo: string;
  readonly tipoReceita: string;
  readonly valorAjuste: string;
  readonly motivo: string;
  readonly data: Date;
  readonly criadoPor: string;
}

/** As reprevisões de um exercício, mais recentes primeiro (append-only — a lista é o histórico). */
export async function listarReprevisoes(
  prisma: Tx,
  p: { readonly exercicio: number }
): Promise<readonly ReprevisaoRegistrada[]> {
  const linhas = await prisma.receitaReprevista.findMany({
    where: { exercicio: p.exercicio },
    orderBy: [{ data: "desc" }, { criadoEm: "desc" }],
    select: { id: true, naturezaCodigo: true, fonteCodigo: true, tipoReceita: true, valorAjuste: true, motivo: true, data: true, criadoPor: true },
  });
  return linhas.map((l) => ({
    id: l.id, naturezaCodigo: l.naturezaCodigo, fonteCodigo: l.fonteCodigo, tipoReceita: l.tipoReceita,
    valorAjuste: toMoney(l.valorAjuste.toFixed(2)).toFixed(2), motivo: l.motivo, data: l.data, criadoPor: l.criadoPor,
  }));
}
