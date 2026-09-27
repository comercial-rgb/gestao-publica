import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import {
  origemDaNatureza,
  sinalDaReceitaRealizada,
  type OrigemReceita,
} from "./dominio.js";
import { parcelasDaGuia } from "./parcelas-por-fonte.js";

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
      // ⚠️ V16/C30 — A FONTE DA GUIA NÃO É MAIS A RESPOSTA SOZINHA. A guia pode repartir o
      // depósito entre fontes (`FonteDaArrecadacao`), e é `parcelasDaGuia` quem diz quanto foi de
      // cada uma — uma regra, sete leitores. Sem isto, o superávit financeiro por fonte do Anexo
      // 14 atribuiria o total inteiro à fonte padrão da guia — e o superávit AUTORIZA crédito
      // adicional.
      // V16/C30 — os cinco campos que `parcelasDaGuia` exige. Escritos, e não espalhados por um
      // fragmento compartilhado: um `select` montado por spread de `as const` faz os tipos
      // condicionais do Prisma explodirem, e o `tsc` deste projeto passou a estourar 5 GB de heap.
      // A rede de proteção contra esquecer a distribuição não era o fragmento — é o TIPO de
      // `parcelasDaGuia`, que não compila sem os cinco.
      numeroReceita: true,
      fonteId: true,
      exercicioFonte: true,
      valor: true,
      distribuicao: { select: { fonteId: true, exercicioFonte: true, valor: true } },
      tipo: true,
      naturezaReceita: { select: { codigo: true } },
    },
  });

  const por = new Map<string, Money>();
  for (const r of receitas) {
    // ⚠️ A ANULAÇÃO carrega a MESMA natureza e a MESMA fonte do original (o
    // `anularArrecadacao` as copia, inclusive as PARCELAS) — logo o recorte por origem
    // enxerga as DUAS pernas, e o líquido continua líquido dentro do recorte.
    if (
      p.origem !== undefined &&
      origemDaNatureza(r.naturezaReceita.codigo) !== p.origem
    ) {
      continue;
    }

    const sinal = sinalDaReceitaRealizada(r.tipo);
    for (const parcela of parcelasDaGuia(r)) {
      const acc = por.get(parcela.fonteId) ?? toMoney("0.00");
      por.set(
        parcela.fonteId,
        sinal === 1
          ? toMoney(acc.plus(parcela.valor))
          : toMoney(acc.minus(parcela.valor))
      );
    }
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
      // V16/C30 — a guia repartida entra por PARCELA: o grão do dataset aberto é natureza ×
      // fonte, e uma guia distribuída tem mais de uma linha aqui.
      // V16/C30 — os cinco campos que `parcelasDaGuia` exige. Escritos, e não espalhados por um
      // fragmento compartilhado: um `select` montado por spread de `as const` faz os tipos
      // condicionais do Prisma explodirem, e o `tsc` deste projeto passou a estourar 5 GB de heap.
      // A rede de proteção contra esquecer a distribuição não era o fragmento — é o TIPO de
      // `parcelasDaGuia`, que não compila sem os cinco.
      numeroReceita: true,
      fonteId: true,
      exercicioFonte: true,
      valor: true,
      distribuicao: { select: { fonteId: true, exercicioFonte: true, valor: true } },
      tipo: true,
      naturezaReceita: { select: { codigo: true, descricao: true } },
    },
  });

  const por = new Map<string, ArrecadadoDetalhado>();
  for (const r of receitas) {
    const sinal = sinalDaReceitaRealizada(r.tipo);
    for (const parcela of parcelasDaGuia(r)) {
      const chave = `${r.naturezaReceita.codigo}|${parcela.fonteId}`;
      const acc = por.get(chave) ?? {
        naturezaCodigo: r.naturezaReceita.codigo,
        naturezaDescricao: r.naturezaReceita.descricao,
        fonteId: parcela.fonteId,
        arrecadado: toMoney("0.00"),
      };
      por.set(chave, {
        ...acc,
        arrecadado:
          sinal === 1
            ? toMoney(acc.arrecadado.plus(parcela.valor))
            : toMoney(acc.arrecadado.minus(parcela.valor)),
      });
    }
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
  /** A fonte PADRÃO da guia. Numa guia repartida, `fontes` é quem diz de quem é o dinheiro. */
  readonly fonteCodigo: string;
  /**
   * V16/C30 — A REPARTIÇÃO, quando a guia tem mais de uma fonte. VAZIA na guia de fonte única.
   *
   * ⚠️ VAZIA E NÃO "com uma linha": é o que permite à tela dizer "distribuída entre 2 fontes" sem
   * transformar toda guia de fonte única numa lista de um item, que é ruído na leitura.
   */
  readonly fontes: readonly { readonly codigo: string; readonly valor: Money }[];
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
      // V16/C30 — a repartição, para a tela poder mostrar de quem é o dinheiro.
      distribuicao: {
        select: { valor: true, fonte: { select: { codigo: true } } },
        orderBy: { criadoEm: "asc" },
      },
    },
  });

  const linhas: ArrecadacaoNaLista[] = receitas.map((r) => ({
    id: r.id,
    dataArrecadacao: r.dataArrecadacao,
    numeroReceita: r.numeroReceita,
    naturezaCodigo: r.naturezaReceita.codigo,
    naturezaDescricao: r.naturezaReceita.descricao,
    fonteCodigo: r.fonte.codigo,
    fontes: r.distribuicao.map((d) => ({
      codigo: d.fonte.codigo,
      valor: toMoney(d.valor.toFixed(2)),
    })),
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

/** Quanto de uma linha veio por cada caminho — ver `LinhaDoArrecadadoPorEntidade`. */
export interface ParcelaDaProcedencia {
  readonly arrecadado: Money;
  readonly guias: number;
}

/** Uma linha do recorte por entidade. `entidadeId === null` é o NÃO ATRIBUÍDO. */
export interface LinhaDoArrecadadoPorEntidade {
  readonly entidadeId: string | null;
  /** `null` na linha do não atribuído — ela não tem código porque não tem entidade. */
  readonly codigo: string | null;
  readonly nome: string;
  readonly arrecadado: Money;
  /** Quantas guias vivas compõem a linha — é o que o servidor clica para ir resolver. */
  readonly guias: number;
  /**
   * ⚠️ A PROCEDÊNCIA NÃO SE FUNDE NA SOMA (V11 V9.2). `naOrigem + porAtribuicao == arrecadado`,
   * sempre — mas as duas parcelas continuam legíveis separadas, porque elas NÃO são a mesma
   * afirmação: `naOrigem` é o que já era verdade no instante da arrecadação (a conta tinha
   * titular declarado); `porAtribuicao` é o que o ente declarou DEPOIS, por ato, sobre uma guia
   * que entrou sem identificação. Uma soma muda apagaria a diferença entre "o sistema sabia" e
   * "alguém decidiu", que é exatamente o que um controle externo pergunta.
   *
   * Na linha do NÃO ATRIBUÍDO as duas parcelas são zero por construção: ela é o complemento —
   * o que não tem nenhum dos dois caminhos.
   */
  readonly naOrigem: ParcelaDaProcedencia;
  readonly porAtribuicao: ParcelaDaProcedencia;
}

export interface ArrecadadoPorEntidade {
  readonly linhas: readonly LinhaDoArrecadadoPorEntidade[];
  /** ⚠️ LINHA PRÓPRIA, TOTAL PRÓPRIO — nunca somada no zero nem escondida. Ver abaixo. */
  readonly naoAtribuido: LinhaDoArrecadadoPorEntidade;
  readonly total: Money;
}

/**
 * O ARRECADADO LIQUIDO DO EXERCICIO POR ENTIDADE TITULAR (V11 V9 · desenho de engenharia).
 *
 * ⚠️ ORIGEM DA CORRECAO (V11 V9.3): dizia `TR 5.38.7`. Nao se sustenta — a secao 5.38 e o
 * PORTAL DE TRANSPARENCIA, e a 5.38.7 pede consulta PUBLICA; esta consulta serve tela interna
 * autenticada. Sem clausula atribuida ate que se ache vinculo literal. Ver `acoes.ts`.
 *
 * ═══ ⚠️ O NÃO ATRIBUÍDO É UMA LINHA, E ISSO É O PONTO DA CONSULTA ═══
 * A guia que não diz de quem é **não some**, **não entra no zero de ninguém** e **não se
 * distribui**. Ela aparece com nome próprio e total próprio, exatamente como
 * `arrecadacoesSemContaDaFonte` faz com as guias sem conta na conciliação (M09) — o precedente é
 * literal e deliberado.
 *
 * Esconder essas guias faria a soma das entidades parecer o total do ente, e um servidor
 * concluiria que a Prefeitura arrecadou tudo o que ninguém atribuiu. Distribuí-las por rateio
 * inventaria o número. Mostrá-las separadas é a única forma que não mente — e é também a que
 * torna o trabalho visível: o total do não atribuído é a fila de retificação.
 *
 * ═══ ⚠️ O DONO DE UMA GUIA VEM POR DOIS CAMINHOS, E A CONSULTA LÊ OS DOIS (V11 V9.2) ═══
 *
 * `ATRIBUICAO-NAO-CHEGA-AO-RODAPE`, medido pelo percurso J9 em 24/09/2026. Esta consulta
 * agrupava SOMENTE por `entidadeTitularId` e nunca lia `AtribuicaoDeEntidadeDaArrecadacao`. A
 * fila de pendências (`lib/portas/arrecadacao.ts:278`) já filtrava pelos dois. Resultado: o ente
 * atribuía a guia de legado com ato, ela SAÍA da lista do que havia para fazer, e o dinheiro
 * FICAVA em "Não atribuído — o ente ainda não disse de quem é" para sempre, sem formulário para
 * agir de novo. As duas leituras da mesma tela discordavam sobre o mesmo dinheiro, no mesmo
 * render. O teste de domínio passava porque afirmava a linha gravada; nenhuma das duas leituras
 * estava confrontada com a outra.
 *
 * ⚠️ E A CORREÇÃO NÃO É CARIMBAR A COLUNA. `entidadeTitularId` é o carimbo DO FATO — o que era
 * verdade no instante da arrecadação. Sobrescrevê-lo depois seria `UPDATE` em fato consumado, e
 * apagaria a distinção entre "veio identificado na origem" e "o ente atribuiu depois, por ato".
 * `AtribuicaoDeEntidadeDaArrecadacao` é um fato NOVO, append-only, com ato, motivo e autor.
 * O dono de uma guia é, portanto, a UNIÃO dos dois caminhos, e "não atribuído" fica só com quem
 * não tem NENHUM deles — que é o que a linha sempre disse que era.
 *
 * ⚠️ E A PROCEDÊNCIA CONTINUA VISÍVEL, em `naOrigem` e `porAtribuicao`. Fundir as duas numa soma
 * muda resolveria o número e apagaria a pergunta.
 *
 * ═══ ⚠️ A CONFERÊNCIA DE VOLTA, ESCRITA AO CONTRÁRIO ═══
 * Repetir `Σ linhas + naoAtribuido` para "conferir" o total seria tautologia: o mesmo código
 * conferindo a si mesmo passa sempre. O total é somado numa varredura ÚNICA e independente, e a
 * identidade é conferida contra ele. Se o agrupamento perder uma guia, a diferença aparece — e
 * é exatamente a que ficou de fora.
 *
 * ⚠️ O SINAL CONTINUA VINDO DO `sinalDaReceitaRealizada` — um laço, uma aritmética. A ANULAÇÃO
 * HERDA a entidade da guia original, então ela cai na MESMA linha que somou o original e o
 * líquido continua líquido dentro do recorte. É a mesma propriedade que faz `arrecadadoPorFonte`
 * funcionar com a fonte copiada.
 */
export async function arrecadadoPorEntidade(
  prisma: Tx,
  p: { readonly exercicio: number }
): Promise<ArrecadadoPorEntidade> {
  const entidadeSelect = {
    codigo: true,
    versoes: { orderBy: { versao: "desc" as const }, take: 1, select: { nome: true } },
  };
  const receitas = await prisma.receitaArrecadada.findMany({
    where: { exercicio: p.exercicio },
    select: {
      id: true,
      tipo: true,
      valor: true,
      estornoDeId: true,
      entidadeTitularId: true,
      entidadeTitular: { select: entidadeSelect },
      // ⚠️ A ATRIBUIÇÃO ENTRA NA CONSULTA (V11 V9.2) — ver o bloco acima da função.
      atribuicaoDeEntidade: {
        select: { entidadeId: true, entidade: { select: entidadeSelect } },
      },
    },
  });

  /**
   * ⚠️ QUEM É O DONO DE CADA GUIA, E POR QUAL CAMINHO. Duas passadas, e a segunda existe por um
   * motivo que só aparece na ordem inversa dos atos: atribuir e DEPOIS anular.
   *
   * O estorno herda `entidadeTitularId` do original (`servico.ts:356-362`). Se o original era
   * legado e foi atribuído por ato, aquela coluna continua NULA nos dois — e sem esta segunda
   * passada o original iria para a entidade e o estorno dele ficaria no não atribuído, que
   * passaria a somar NEGATIVO. A herança declarada do estorno vale para o fato original inteiro,
   * carimbo ou atribuição; ela não é uma propriedade só da coluna.
   */
  interface Dono {
    readonly entidadeId: string;
    readonly codigo: string;
    readonly nome: string;
    readonly procedencia: "ORIGEM" | "ATRIBUICAO";
  }
  const donoDaGuia = new Map<string, Dono>();
  for (const r of receitas) {
    if (r.entidadeTitularId !== null && r.entidadeTitular !== null) {
      donoDaGuia.set(r.id, {
        entidadeId: r.entidadeTitularId,
        codigo: r.entidadeTitular.codigo,
        // ⚠️ O NOME É O DA VERSÃO VIGENTE, e não o do dia da guia: a consulta pergunta "quanto
        // arrecadou a entidade X", e X é quem ela é HOJE. O fato carimbado é o `entidadeTitularId`,
        // que não muda; o rótulo acompanha o cadastro, como acontece com qualquer nome corrigido.
        nome: r.entidadeTitular.versoes[0]?.nome ?? r.entidadeTitular.codigo,
        procedencia: "ORIGEM",
      });
      continue;
    }
    if (r.atribuicaoDeEntidade !== null && r.atribuicaoDeEntidade !== undefined) {
      donoDaGuia.set(r.id, {
        entidadeId: r.atribuicaoDeEntidade.entidadeId,
        codigo: r.atribuicaoDeEntidade.entidade.codigo,
        nome: r.atribuicaoDeEntidade.entidade.versoes[0]?.nome ?? r.atribuicaoDeEntidade.entidade.codigo,
        procedencia: "ATRIBUICAO",
      });
    }
  }
  for (const r of receitas) {
    if (donoDaGuia.has(r.id) || r.estornoDeId === null) continue;
    const doOriginal = donoDaGuia.get(r.estornoDeId);
    if (doOriginal !== undefined) donoDaGuia.set(r.id, doOriginal);
  }

  const por = new Map<
    string,
    {
      codigo: string;
      nome: string;
      valor: Money;
      guias: number;
      origemValor: Money;
      origemGuias: number;
      atribuidoValor: Money;
      atribuidoGuias: number;
    }
  >();
  let semEntidade = toMoney("0.00");
  let guiasSemEntidade = 0;
  let total = toMoney("0.00");

  for (const r of receitas) {
    const sinal = sinalDaReceitaRealizada(r.tipo);
    const valor = toMoney(r.valor.toFixed(2));
    total = sinal === 1 ? toMoney(total.plus(valor)) : toMoney(total.minus(valor));

    const dono = donoDaGuia.get(r.id);
    if (dono === undefined) {
      semEntidade = sinal === 1 ? toMoney(semEntidade.plus(valor)) : toMoney(semEntidade.minus(valor));
      guiasSemEntidade += 1;
      continue;
    }

    const atual = por.get(dono.entidadeId) ?? {
      codigo: dono.codigo,
      nome: dono.nome,
      valor: toMoney("0.00"),
      guias: 0,
      origemValor: toMoney("0.00"),
      origemGuias: 0,
      atribuidoValor: toMoney("0.00"),
      atribuidoGuias: 0,
    };
    atual.valor = sinal === 1 ? toMoney(atual.valor.plus(valor)) : toMoney(atual.valor.minus(valor));
    atual.guias += 1;
    if (dono.procedencia === "ORIGEM") {
      atual.origemValor = sinal === 1 ? toMoney(atual.origemValor.plus(valor)) : toMoney(atual.origemValor.minus(valor));
      atual.origemGuias += 1;
    } else {
      atual.atribuidoValor = sinal === 1 ? toMoney(atual.atribuidoValor.plus(valor)) : toMoney(atual.atribuidoValor.minus(valor));
      atual.atribuidoGuias += 1;
    }
    por.set(dono.entidadeId, atual);
  }

  const linhas: LinhaDoArrecadadoPorEntidade[] = [...por.entries()]
    .map(([entidadeId, v]) => ({
      entidadeId,
      codigo: v.codigo,
      nome: v.nome,
      arrecadado: v.valor,
      guias: v.guias,
      naOrigem: { arrecadado: v.origemValor, guias: v.origemGuias },
      porAtribuicao: { arrecadado: v.atribuidoValor, guias: v.atribuidoGuias },
    }))
    .sort((a, b) => (a.codigo ?? "").localeCompare(b.codigo ?? ""));

  const naoAtribuido: LinhaDoArrecadadoPorEntidade = {
    entidadeId: null,
    codigo: null,
    nome: "Não atribuído",
    arrecadado: semEntidade,
    guias: guiasSemEntidade,
    // Zero por construção: esta linha é o complemento — o que não tem nenhum dos dois caminhos.
    naOrigem: { arrecadado: toMoney("0.00"), guias: 0 },
    porAtribuicao: { arrecadado: toMoney("0.00"), guias: 0 },
  };

  /**
   * ⚠️ E A PROCEDÊNCIA TAMBÉM TEM DE FECHAR, LINHA A LINHA. Sem esta conferência, uma parcela
   * contada no balde errado somaria certo no total e mentiria sobre o caminho — que é o dado
   * pelo qual um controle externo pergunta.
   */
  for (const l of linhas) {
    const partes = toMoney(l.naOrigem.arrecadado.plus(l.porAtribuicao.arrecadado));
    if (!partes.equals(l.arrecadado) || l.naOrigem.guias + l.porAtribuicao.guias !== l.guias) {
      throw new Error(
        `A PROCEDÊNCIA DA ENTIDADE ${l.codigo ?? "(sem código)"} NÃO FECHA no exercício ` +
          `${String(p.exercicio)}: identificado na origem ${l.naOrigem.arrecadado.toFixed(2)} ` +
          `(${String(l.naOrigem.guias)} guia(s)) mais atribuído por ato ` +
          `${l.porAtribuicao.arrecadado.toFixed(2)} (${String(l.porAtribuicao.guias)}) dão ` +
          `${partes.toFixed(2)} (${String(l.naOrigem.guias + l.porAtribuicao.guias)}), mas a linha ` +
          `soma ${l.arrecadado.toFixed(2)} (${String(l.guias)}).`
      );
    }
  }

  let reconstruido = semEntidade;
  for (const l of linhas) reconstruido = toMoney(reconstruido.plus(l.arrecadado));
  if (!reconstruido.equals(total)) {
    throw new Error(
      `O RECORTE POR ENTIDADE NÃO FECHA no exercício ${String(p.exercicio)}: as entidades somam ` +
        `${reconstruido.minus(semEntidade).toFixed(2)}, o não atribuído soma ` +
        `${semEntidade.toFixed(2)}, e juntos dão ${reconstruido.toFixed(2)} — mas o arrecadado ` +
        `do exercício é ${total.toFixed(2)}. A diferença de ${total.minus(reconstruido).toFixed(2)} ` +
        `é receita que o recorte deixou de fora, e uma tela que a omitisse mostraria entidades ` +
        `somando menos do que o ente arrecadou sem dizer o que faltou.`
    );
  }

  return { linhas, naoAtribuido, total };
}
