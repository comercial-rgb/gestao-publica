import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import {
  origemDaNatureza,
  sinalDaReceitaRealizada,
  type OrigemReceita,
} from "./dominio.js";

/**
 * O client OU uma transação dele — mesmo alias do M05.
 *
 * ⚠️ NÃO É COSMÉTICO. O guard do superávit financeiro (M03) tem de LER esta soma
 * DENTRO da transação que decide o crédito: somar fora dela é somar um número que
 * já está velho quando a gravação acontece. Enquanto a assinatura exigia
 * `PrismaClient`, essa leitura era impossível — o client transacional não é um
 * `PrismaClient` (não tem `$transaction`).
 */
type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/**
 * RECEITA ARRECADADA POR FONTE — leitura pura, e a aritmética é a DAQUI.
 *
 * ═══ POR QUE ESTA FUNÇÃO MORA NO M04 ═══
 * O superávit financeiro por fonte (Anexo 14) precisa saber quanto cada fonte
 * arrecadou. Somar isso dentro do relatório criaria uma SEGUNDA verdade sobre a
 * receita realizada — e ela divergiria da do Anexo 12 no dia em que alguém
 * esquecesse o sinal da anulação. O total é do dono do dado; o relatório compõe.
 *
 * ⚠️ O SINAL VEM DO `SINAL_RECEITA_REALIZADA`, e ele é fail-closed: uma
 * RETIFICACAO derruba a soma em vez de chutar um sinal.
 *
 * ⚠️ O CORTE É PELA `dataArrecadacao` — a data do FATO, não a da digitação (a
 * lição do `campoData` do M09). Uma guia de janeiro lançada em março pertence a
 * janeiro.
 */
export async function arrecadadoPorFonte(
  prisma: Tx,
  p: {
    readonly ate: Date;
    /**
     * RECORTE OPCIONAL pela ORIGEM da natureza (2º dígito — `origemDaNatureza`, do
     * classificador de ef6f559).
     *
     * ⚠️ É UM RECORTE DA MESMA ARITMÉTICA, NÃO UMA SEGUNDA SOMA. O guard da operação
     * de crédito (TR 4.37) precisa de "quanto a fonte arrecadou DE EMPRÉSTIMO" — e a
     * tentação seria escrever uma função nova, com o seu próprio laço de sinais.
     * Duas somas do mesmo dinheiro divergem no dia em que só uma aprender o caso novo
     * (foi a lição das três cópias do líquido, em 50783ae). Um parâmetro; um laço.
     *
     * ⚠️ E O FILTRO É EM JS, NÃO EM SQL, de propósito: a origem NÃO é um prefixo do
     * código. O dígito "1" é IMPOSTOS numa receita corrente e OPERAÇÕES DE CRÉDITO
     * numa de capital — um `startsWith("2.1")` erraria a intra (8.1), e um
     * `startsWith` mais esperto seria uma segunda cópia do classificador.
     */
    readonly origem?: OrigemReceita | undefined;
  }
): Promise<ReadonlyMap<string, Money>> {
  const receitas = await prisma.receitaArrecadada.findMany({
    where: { dataArrecadacao: { lte: p.ate } },
    select: {
      fonteId: true,
      tipo: true,
      valor: true,
      naturezaReceita: { select: { codigo: true } },
    },
  });

  const por = new Map<string, Money>();
  for (const r of receitas) {
    // ⚠️ A ANULAÇÃO carrega a MESMA natureza e a MESMA fonte do original (o
    // `anularArrecadacao` as copia) — logo o recorte por origem enxerga as DUAS
    // pernas, e o líquido continua líquido dentro do recorte.
    if (
      p.origem !== undefined &&
      origemDaNatureza(r.naturezaReceita.codigo) !== p.origem
    ) {
      continue;
    }

    const sinal = sinalDaReceitaRealizada(r.tipo);
    const valor = toMoney(r.valor.toFixed(2));
    const acc = por.get(r.fonteId) ?? toMoney("0.00");
    por.set(
      r.fonteId,
      sinal === 1 ? toMoney(acc.plus(valor)) : toMoney(acc.minus(valor))
    );
  }
  return por;
}

export interface ArrecadadoDetalhado {
  readonly naturezaCodigo: string;
  readonly naturezaDescricao: string;
  readonly fonteId: string;
  readonly arrecadado: Money;
}

/**
 * O ARRECADADO LÍQUIDO POR NATUREZA × FONTE — o grão do dataset aberto da receita
 * (TR 7.4.3).
 *
 * ⚠️ OUTRO GRÃO, A MESMA ARITMÉTICA. O sinal continua vindo do
 * `SINAL_RECEITA_REALIZADA` (fonte única, fail-closed na RETIFICACAO), e o corte
 * continua sendo a `dataArrecadacao` — a data do FATO. O que muda é a CHAVE do
 * agrupamento. Escrever esta soma DENTRO do M13 seria a segunda verdade sobre a receita
 * pública: o portal publicaria um número e o Anexo 12 publicaria outro.
 *
 * ⚠️ AGREGADO, E SÓ AGREGADO (TR 7.4.2 — sigilo fiscal, CTN art. 198). A linha
 * individual de arrecadação identifica o CONTRIBUINTE pelo cruzamento (valor + data +
 * natureza), e o sigilo fiscal não é dispensável por transparência. Por isso esta
 * função devolve TOTAIS, e o tipo de saída NÃO TEM campo de contribuinte — não há o que
 * vazar, nem por engano.
 */
export async function arrecadadoPorNaturezaFonte(
  prisma: Tx,
  p: {
    readonly ate: Date;
    /** Início da janela, INCLUSIVO. Omitido = desde sempre (o acumulado, como sempre foi). É
     *  o que separa "No Bimestre (b)" de "Até o Bimestre (c)" no RREO Anexo 1 — uma
     *  aritmética, um recorte novo (o padrão do `somasPorConta`). */
    readonly desde?: Date;
  }
): Promise<readonly ArrecadadoDetalhado[]> {
  const receitas = await prisma.receitaArrecadada.findMany({
    where: {
      dataArrecadacao: {
        lte: p.ate,
        ...(p.desde !== undefined ? { gte: p.desde } : {}),
      },
    },
    select: {
      fonteId: true,
      tipo: true,
      valor: true,
      naturezaReceita: { select: { codigo: true, descricao: true } },
    },
  });

  const por = new Map<string, ArrecadadoDetalhado>();
  for (const r of receitas) {
    const chave = `${r.naturezaReceita.codigo}|${r.fonteId}`;
    const acc = por.get(chave) ?? {
      naturezaCodigo: r.naturezaReceita.codigo,
      naturezaDescricao: r.naturezaReceita.descricao,
      fonteId: r.fonteId,
      arrecadado: toMoney("0.00"),
    };

    const sinal = sinalDaReceitaRealizada(r.tipo);
    const valor = toMoney(r.valor.toFixed(2));
    por.set(chave, {
      ...acc,
      arrecadado:
        sinal === 1
          ? toMoney(acc.arrecadado.plus(valor))
          : toMoney(acc.arrecadado.minus(valor)),
    });
  }
  return [...por.values()];
}

/** O arrecadado líquido agrupado pelo CÓDIGO DE ACOMPANHAMENTO (Portaria STN 710/2021). */
export interface ArrecadadoPorCo {
  /** O `codigo` de 4 dígitos do `CodigoAcompanhamento` (ex.: "3110"). */
  readonly co: string;
  readonly arrecadado: Money;
}

/**
 * O ARRECADADO LÍQUIDO POR CÓDIGO DE ACOMPANHAMENTO — o grão que o RREO Anexo 3 precisa
 * para as DEDUÇÕES DE EMENDAS (IV e VI da RCL: individuais e de bancada, LRF art. 166-A).
 *
 * ⚠️ A MESMA ARITMÉTICA, OUTRA CHAVE. Sinal do `SINAL_RECEITA_REALIZADA` (fail-closed na
 * RETIFICACAO), corte pela `dataArrecadacao` (o FATO), janela `desde?` inclusiva — idêntico
 * ao `arrecadadoPorNaturezaFonte`. O que muda é a chave: aqui é o `co.codigo`. As linhas
 * SEM CO não entram (a emenda é uma marca explícita da arrecadação; ausência de CO não é
 * emenda nenhuma). Escrever esta soma dentro do M12 duplicaria o sinal da receita — a
 * primeira coisa que divergiria no dia em que alguém esquecesse a anulação.
 */
export async function arrecadadoPorCodigoAcompanhamento(
  prisma: Tx,
  p: {
    readonly ate: Date;
    /** Início da janela, INCLUSIVO. Omitido = desde sempre. Mesmo recorte do irmão. */
    readonly desde?: Date;
  }
): Promise<readonly ArrecadadoPorCo[]> {
  const receitas = await prisma.receitaArrecadada.findMany({
    where: {
      // `coId` presente: só a arrecadação MARCADA com um código entra.
      coId: { not: null },
      dataArrecadacao: {
        lte: p.ate,
        ...(p.desde !== undefined ? { gte: p.desde } : {}),
      },
    },
    select: {
      tipo: true,
      valor: true,
      co: { select: { codigo: true } },
    },
  });

  const por = new Map<string, Money>();
  for (const r of receitas) {
    // `coId: { not: null }` garante a relação; o guard mantém o tipo honesto.
    if (r.co === null) continue;
    const sinal = sinalDaReceitaRealizada(r.tipo);
    const valor = toMoney(r.valor.toFixed(2));
    const acc = por.get(r.co.codigo) ?? toMoney("0.00");
    por.set(
      r.co.codigo,
      sinal === 1 ? toMoney(acc.plus(valor)) : toMoney(acc.minus(valor))
    );
  }
  return [...por.entries()].map(([co, arrecadado]) => ({ co, arrecadado }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// A ARRECADAÇÃO, LISTADA — a leitura que a UI da 7.1 consome.
//
// ⚠️ NÃO HÁ RECORTE POR UG, E ISSO NÃO É LACUNA. A receita é do ENTE (art. 167, IV
// da CF): a `ReceitaArrecadada` tem natureza e fonte, e NÃO tem unidade
// orçamentária — a Secretaria de Saúde não "possui" o IPTU que entrou. A vinculação
// por FONTE é outra coisa, e já existe. Uma tela que filtrasse receita por UG
// estaria ensinando ao usuário um conceito que a Constituição não tem.
// ═══════════════════════════════════════════════════════════════════════════════

export interface ArrecadacaoNaLista {
  readonly id: string;
  readonly dataArrecadacao: Date;
  readonly numeroReceita: string;
  readonly naturezaCodigo: string;
  readonly naturezaDescricao: string;
  readonly fonteCodigo: string;
  readonly coCodigo: string | null;
  readonly tipo: string;
  /** Sempre POSITIVO — é o valor da guia. O que a linha faz com o total é o `sinal`. */
  readonly valor: Money;
  /** +1 arrecada, −1 anula. Vem do mesmo `sinalDaReceitaRealizada` dos relatórios. */
  readonly sinal: 1 | -1;
  /** A guia que esta linha anula (`null` quando ela é a guia original). */
  readonly anulacaoDeId: string | null;
  readonly criadoPor: string;
}

export interface ArrecadacoesDoPeriodo {
  readonly linhas: readonly ArrecadacaoNaLista[];
  /** Σ (sinal × valor) — a receita realizada LÍQUIDA do período. */
  readonly total: Money;
}

/**
 * AS GUIAS DE UM PERÍODO, e o total LÍQUIDO delas.
 *
 * ⚠️ A ANULAÇÃO É LINHA, NÃO SUMIÇO. Ela aparece na lista com sinal −1 (o registro é
 * append-only: a guia anulada CONTINUA lá, e a anulação é um fato novo ao lado
 * dela). Esconder a anulada e a anulação faria a tela mostrar um total que nenhuma
 * das linhas visíveis explica — o usuário veria 100 de guias e um total de 60.
 *
 * ⚠️ O CORTE É PELA `dataArrecadacao` — a data do FATO, nunca a da digitação. Uma
 * guia de janeiro lançada em março pertence a janeiro.
 */
export async function listarArrecadacoes(
  prisma: Tx,
  p: {
    readonly exercicio: number;
    readonly inicio?: Date | undefined;
    readonly fim?: Date | undefined;
  }
): Promise<ArrecadacoesDoPeriodo> {
  const receitas = await prisma.receitaArrecadada.findMany({
    where: {
      exercicio: p.exercicio,
      ...(p.inicio !== undefined || p.fim !== undefined
        ? {
            dataArrecadacao: {
              ...(p.inicio !== undefined ? { gte: p.inicio } : {}),
              ...(p.fim !== undefined ? { lte: p.fim } : {}),
            },
          }
        : {}),
    },
    orderBy: [{ dataArrecadacao: "desc" }, { criadoEm: "desc" }],
    select: {
      id: true,
      dataArrecadacao: true,
      numeroReceita: true,
      tipo: true,
      valor: true,
      estornoDeId: true,
      criadoPor: true,
      naturezaReceita: { select: { codigo: true, descricao: true } },
      fonte: { select: { codigo: true } },
      co: { select: { codigo: true } },
    },
  });

  const linhas: ArrecadacaoNaLista[] = receitas.map((r) => ({
    id: r.id,
    dataArrecadacao: r.dataArrecadacao,
    numeroReceita: r.numeroReceita,
    naturezaCodigo: r.naturezaReceita.codigo,
    naturezaDescricao: r.naturezaReceita.descricao,
    fonteCodigo: r.fonte.codigo,
    coCodigo: r.co?.codigo ?? null,
    tipo: r.tipo,
    valor: toMoney(r.valor.toFixed(2)),
    // Fail-closed: uma RETIFICACAO derruba a leitura aqui, como derruba os
    // relatórios — em vez de chutar um sinal e mentir no total.
    sinal: sinalDaReceitaRealizada(r.tipo),
    anulacaoDeId: r.estornoDeId,
    criadoPor: r.criadoPor,
  }));

  let total = toMoney("0.00");
  for (const l of linhas) {
    total = l.sinal === 1 ? toMoney(total.plus(l.valor)) : toMoney(total.minus(l.valor));
  }

  return { linhas, total };
}

/**
 * O ROL DA LOA — as naturezas que o exercício previu, com a fonte de cada uma.
 *
 * É o vocabulário da arrecadação: arrecadar numa natureza que a LOA não previu é
 * possível no domínio (receita não prevista existe), mas a TELA oferece o rol —
 * digitar 8 dígitos de cabeça é como se erra a classificação de uma guia.
 */
export interface NaturezaPrevista {
  readonly naturezaCodigo: string;
  readonly naturezaDescricao: string;
  readonly fonteCodigo: string;
  readonly tipoReceita: string;
  readonly valorPrevisto: Money;
}

export async function listarNaturezasPrevistas(
  prisma: Tx,
  p: { readonly exercicio: number }
): Promise<readonly NaturezaPrevista[]> {
  const previstas = await prisma.receitaPrevista.findMany({
    where: { exercicio: p.exercicio },
    select: {
      tipoReceita: true,
      valorPrevisto: true,
      naturezaReceita: { select: { codigo: true, descricao: true } },
      fonte: { select: { codigo: true } },
    },
  });

  return previstas
    .map((r) => ({
      naturezaCodigo: r.naturezaReceita.codigo,
      naturezaDescricao: r.naturezaReceita.descricao,
      fonteCodigo: r.fonte.codigo,
      tipoReceita: r.tipoReceita,
      valorPrevisto: toMoney(r.valorPrevisto.toFixed(2)),
    }))
    .sort((a, b) => a.naturezaCodigo.localeCompare(b.naturezaCodigo));
}
