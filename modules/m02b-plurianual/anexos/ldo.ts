import { toMoney, type Money } from "../../../packages/contracts/index.js";
import {
  dividaLiquida,
  margemDeExpansao,
  resultadoPrimario,
} from "../dominio.js";
import {
  NOTA_LIMITE_DE_FONTE,
  notaDeAnexoVazio,
  totaisDe,
  type AnexoLdo,
  type LinhaAnexo,
} from "./tipos.js";

/**
 * OS ANEXOS TABELARES DA LDO — oito geradores, funções PURAS.
 *
 * ⚠️ ZERO PRISMA AQUI. Cada gerador recebe o DTO já lido e devolve a estrutura. É o padrão
 * dos `rreo-anexo*.ts` do M12 — e a razão é que a mesma função gera o anexo do teste e o do
 * TCE, sem banco no meio. (O `livros.ts` daquele módulo recebe `PrismaClient`; é a exceção,
 * não o padrão a copiar.)
 *
 * ⚠️ NENHUM VALOR DERIVADO É LIDO DE COLUNA. Resultado primário, dívida líquida e margem
 * saem das funções do `dominio.ts` — as MESMAS que a porta e o exportador SIGA chamarão.
 * Uma segunda subtração aqui seria a segunda verdade sobre um anexo assinado pelo Prefeito.
 *
 * ⚠️ LIMITE DE FONTE: o layout oficial está no MDF da STN, NÃO transcrito neste repositório.
 * Todo anexo carrega `NOTA_LIMITE_DE_FONTE`. Ver `tipos.ts`.
 */

// ═══════════════════════════════════════════════════════════════════════════
// OS DTOs — o que a porta entrega
// ═══════════════════════════════════════════════════════════════════════════

export interface MetaAnualDto {
  readonly ano: number;
  readonly receitaTotal: Money;
  readonly receitaPrimaria: Money;
  readonly despesaTotal: Money;
  readonly despesaPrimaria: Money;
  readonly resultadoNominal: Money;
  readonly dividaPublicaConsolidada: Money;
  readonly dividaConsolidadaLiquida: Money;
}

export interface RiscoDto {
  readonly codigoPassivo: string;
  readonly descricaoPassivo: string;
  readonly valorPassivo: Money;
  readonly descricaoProvidencia: string;
  readonly valorProvidencia: Money;
}

export interface RenunciaDto {
  readonly descricao: string;
  readonly valor: Money;
  readonly descricaoCompensacao: string;
  readonly valorCompensacao: Money;
}

export interface AplicacaoDto {
  readonly tipoAplicacao: string;
  readonly anoAplicacao: number;
  readonly descricao: string;
  readonly valor: Money;
}

export interface AlienacaoDto {
  readonly descricaoBem: string;
  readonly valorAlienacao: Money;
  readonly numeroLaudo: string | null;
  readonly aplicacoes: readonly AplicacaoDto[];
}

export interface RppsDto {
  readonly ano: number;
  readonly receitasPrevidenciarias: Money;
  readonly despesasPrevidenciarias: Money;
  readonly resultadoPrevidenciario: Money;
  readonly saldoFinanceiro: Money;
}

export interface DividaDto {
  readonly ano: number;
  readonly dividaConsolidada: Money;
  readonly deducoes: Money;
  readonly receitaCorrenteLiquida: Money;
  readonly percentualRcl: Money;
}

export interface MargemDto {
  readonly ano: number;
  readonly aumentoPermanenteReceita: Money;
  readonly reducaoPermanenteDespesa: Money;
  readonly novasDespesasObrigatorias: Money;
}

export interface PrioridadeDto {
  readonly descricaoAcao: string;
  readonly produto: string;
  readonly unidadeMedida: string;
  readonly meta: Money;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1 — METAS ANUAIS (Anexo de Metas Fiscais · LRF art. 4º §1º · TR LDO 3)
// ═══════════════════════════════════════════════════════════════════════════

const BASE_METAS = "LRF art. 4º §1º — Anexo de Metas Fiscais";

/**
 * ⚠️ SEM TOTAIS, E A AUSÊNCIA É A DECISÃO. A série é por EXERCÍCIO: somar 2026 com 2027
 * não produz um total de coisa alguma. Um `totais` obrigatório forçaria a inventar essa
 * soma, e quem lesse o anexo veria um número que não existe na LRF.
 *
 * O fechamento deste anexo é a DERIVAÇÃO: `resultadoPrimario = receitaPrimária −
 * despesaPrimária`, linha a linha, pela função do domínio.
 */
export function anexoMetasAnuais(
  exercicio: number,
  metas: readonly MetaAnualDto[]
): AnexoLdo {
  const linhas: LinhaAnexo[] = metas.map((m) => ({
    ano: m.ano,
    receitaTotal: m.receitaTotal,
    receitaPrimaria: m.receitaPrimaria,
    despesaTotal: m.despesaTotal,
    despesaPrimaria: m.despesaPrimaria,
    // ⚠️ DERIVADO pela função do domínio — não existe coluna `resultadoPrimario`.
    resultadoPrimario: resultadoPrimario(m.receitaPrimaria, m.despesaPrimaria),
    resultadoNominal: m.resultadoNominal,
    dividaPublicaConsolidada: m.dividaPublicaConsolidada,
    dividaConsolidadaLiquida: m.dividaConsolidadaLiquida,
  }));

  return {
    chave: "metas-anuais",
    titulo: "Demonstrativo de Metas Anuais",
    baseLegal: BASE_METAS,
    exercicio,
    colunas: [
      { chave: "ano", rotulo: "Exercício" },
      { chave: "receitaTotal", rotulo: "Receita total", numerica: true },
      { chave: "receitaPrimaria", rotulo: "Receita primária", numerica: true },
      { chave: "despesaTotal", rotulo: "Despesa total", numerica: true },
      { chave: "despesaPrimaria", rotulo: "Despesa primária", numerica: true },
      { chave: "resultadoPrimario", rotulo: "Resultado primário", numerica: true },
      { chave: "resultadoNominal", rotulo: "Resultado nominal", numerica: true },
      { chave: "dividaPublicaConsolidada", rotulo: "Dívida consolidada", numerica: true },
      { chave: "dividaConsolidadaLiquida", rotulo: "Dívida cons. líquida", numerica: true },
    ],
    linhas,
    totais: {},
    notas: [
      "O resultado primário é DERIVADO (receita primária − despesa primária) e não consta de coluna alguma do banco — guardá-lo seria cache de dinheiro.",
      "Não há totais: a série é por exercício, e somar anos não produz um total de nada.",
      ...(linhas.length === 0 ? [notaDeAnexoVazio("metas anuais", BASE_METAS)] : []),
      NOTA_LIMITE_DE_FONTE,
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2 — RISCOS FISCAIS (LRF art. 4º §3º · TR LDO 4)
// ═══════════════════════════════════════════════════════════════════════════

const BASE_RISCOS = "LRF art. 4º §3º — Anexo de Riscos Fiscais";

/**
 * ⚠️ AS DUAS COLUNAS SOMAM, e o confronto entre elas é o ponto do anexo: passivo total
 * versus providência total. Um passivo de 5 milhões com providência de 200 mil é
 * exatamente o que a LRF quer que apareça — e só aparece se as duas somarem.
 */
export function anexoRiscosFiscais(
  exercicio: number,
  riscos: readonly RiscoDto[]
): AnexoLdo {
  const linhas: LinhaAnexo[] = riscos.map((r) => ({
    codigoPassivo: r.codigoPassivo,
    descricaoPassivo: r.descricaoPassivo,
    valorPassivo: r.valorPassivo,
    descricaoProvidencia: r.descricaoProvidencia,
    valorProvidencia: r.valorProvidencia,
  }));

  return {
    chave: "riscos-fiscais",
    titulo: "Demonstrativo de Riscos Fiscais e Providências",
    baseLegal: BASE_RISCOS,
    exercicio,
    colunas: [
      { chave: "codigoPassivo", rotulo: "Cód." },
      { chave: "descricaoPassivo", rotulo: "Passivo contingente" },
      { chave: "valorPassivo", rotulo: "Valor", numerica: true },
      { chave: "descricaoProvidencia", rotulo: "Providência" },
      { chave: "valorProvidencia", rotulo: "Valor", numerica: true },
    ],
    linhas,
    totais: totaisDe(linhas, ["valorPassivo", "valorProvidencia"]),
    notas: [
      "A LRF exige o risco COM a medida de contenção: um passivo sem providência é metade do anexo.",
      "Código 99 = outros — existe para não forçar classificação errada no que não se encaixa nos oito.",
      ...(linhas.length === 0 ? [notaDeAnexoVazio("riscos fiscais", BASE_RISCOS)] : []),
      NOTA_LIMITE_DE_FONTE,
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3 — RENÚNCIA DE RECEITA (LRF art. 4º §2º, V · TR LDO 5)
// ═══════════════════════════════════════════════════════════════════════════

const BASE_RENUNCIA = "LRF art. 4º §2º, V — Estimativa e Compensação da Renúncia de Receita";

export function anexoRenunciaReceita(
  exercicio: number,
  renuncias: readonly RenunciaDto[]
): AnexoLdo {
  const linhas: LinhaAnexo[] = renuncias.map((r) => ({
    descricao: r.descricao,
    valor: r.valor,
    descricaoCompensacao: r.descricaoCompensacao,
    valorCompensacao: r.valorCompensacao,
  }));

  return {
    chave: "renuncia-receita",
    titulo: "Demonstrativo da Estimativa e Compensação da Renúncia de Receita",
    baseLegal: BASE_RENUNCIA,
    exercicio,
    colunas: [
      { chave: "descricao", rotulo: "Renúncia" },
      { chave: "valor", rotulo: "Valor renunciado", numerica: true },
      { chave: "descricaoCompensacao", rotulo: "Medida de compensação" },
      { chave: "valorCompensacao", rotulo: "Valor compensado", numerica: true },
    ],
    linhas,
    totais: totaisDe(linhas, ["valor", "valorCompensacao"]),
    notas: [
      "Compensação de valor ZERO é declaração legítima (renúncia compensada pelo crescimento da base) — diferente de compensação ausente.",
      ...(linhas.length === 0 ? [notaDeAnexoVazio("renúncias de receita", BASE_RENUNCIA)] : []),
      NOTA_LIMITE_DE_FONTE,
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 4 — ALIENAÇÃO DE BENS E APLICAÇÃO DO PRODUTO (LRF arts. 4º §2º III e 44)
// ═══════════════════════════════════════════════════════════════════════════

const BASE_ALIENACAO =
  "LRF art. 4º §2º, III e art. 44 — Alienação de Ativos e Aplicação dos Recursos";

/**
 * ⚠️ ELE TEM DUAS SEÇÕES NUMA SÓ TABELA, e por isso a linha da aplicação repete o bem.
 * O art. 44 proíbe aplicar receita de capital derivada de alienação em despesa CORRENTE —
 * e a auditoria desse artigo é linha a linha, não por total.
 *
 * ⚠️ O FECHAMENTO AQUI É UMA DESIGUALDADE, não uma igualdade: `Σ aplicações ≤ alienação`.
 * Igualdade seria mais bonita e estaria errada — o ente pode declarar a alienação e ainda
 * não ter destinado todo o produto, e essa diferença é informação, não erro.
 */
export function anexoAlienacaoBens(
  exercicio: number,
  alienacoes: readonly AlienacaoDto[]
): AnexoLdo {
  const linhas: LinhaAnexo[] = [];

  for (const a of alienacoes) {
    linhas.push({
      bem: a.descricaoBem,
      laudo: a.numeroLaudo,
      valorAlienacao: a.valorAlienacao,
      tipoAplicacao: null,
      anoAplicacao: null,
      descricaoAplicacao: null,
      valorAplicacao: null,
    });
    for (const ap of a.aplicacoes) {
      linhas.push({
        bem: a.descricaoBem,
        laudo: null,
        // ⚠️ NULO, não zero: repetir o valor da alienação em cada aplicação faria o total
        // da coluna contar o mesmo bem N vezes.
        valorAlienacao: null,
        tipoAplicacao: ap.tipoAplicacao,
        anoAplicacao: ap.anoAplicacao,
        descricaoAplicacao: ap.descricao,
        valorAplicacao: ap.valor,
      });
    }
  }

  return {
    chave: "alienacao-bens",
    titulo: "Demonstrativo da Alienação de Ativos e Aplicação dos Recursos",
    baseLegal: BASE_ALIENACAO,
    exercicio,
    colunas: [
      { chave: "bem", rotulo: "Bem" },
      { chave: "laudo", rotulo: "Laudo" },
      { chave: "valorAlienacao", rotulo: "Valor da alienação", numerica: true },
      { chave: "tipoAplicacao", rotulo: "Tipo" },
      { chave: "anoAplicacao", rotulo: "Ano" },
      { chave: "descricaoAplicacao", rotulo: "Aplicação" },
      { chave: "valorAplicacao", rotulo: "Valor aplicado", numerica: true },
    ],
    linhas,
    totais: totaisDe(linhas, ["valorAlienacao", "valorAplicacao"]),
    notas: [
      "Art. 44: é VEDADA a aplicação de receita de capital derivada de alienação em despesa corrente.",
      "O total aplicado pode ser MENOR que o alienado — produto ainda não destinado é informação, não erro.",
      ...(linhas.length === 0 ? [notaDeAnexoVazio("alienações previstas", BASE_ALIENACAO)] : []),
      NOTA_LIMITE_DE_FONTE,
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 5 — PROJEÇÃO ATUARIAL DO RPPS (LRF art. 4º §2º, IV, "a" · TR LDO 12)
// ═══════════════════════════════════════════════════════════════════════════

const BASE_RPPS = 'LRF art. 4º §2º, IV, "a" — Avaliação da Situação do RPPS';

/**
 * ⚠️ SEM TOTAIS (série por exercício) e SEM GUARD DE SINAL. Um RPPS deficitário é
 * exatamente o que a projeção atuarial existe para revelar — um anexo que só aceitasse
 * resultado positivo esconderia o rombo que a LRF manda mostrar.
 */
export function anexoProjecaoRpps(
  exercicio: number,
  projecoes: readonly RppsDto[]
): AnexoLdo {
  const linhas: LinhaAnexo[] = projecoes.map((p) => ({
    ano: p.ano,
    receitasPrevidenciarias: p.receitasPrevidenciarias,
    despesasPrevidenciarias: p.despesasPrevidenciarias,
    resultadoPrevidenciario: p.resultadoPrevidenciario,
    saldoFinanceiro: p.saldoFinanceiro,
  }));

  return {
    chave: "projecao-rpps",
    titulo: "Demonstrativo da Projeção Atuarial do RPPS",
    baseLegal: BASE_RPPS,
    exercicio,
    colunas: [
      { chave: "ano", rotulo: "Exercício" },
      { chave: "receitasPrevidenciarias", rotulo: "Receitas previdenciárias", numerica: true },
      { chave: "despesasPrevidenciarias", rotulo: "Despesas previdenciárias", numerica: true },
      { chave: "resultadoPrevidenciario", rotulo: "Resultado", numerica: true },
      { chave: "saldoFinanceiro", rotulo: "Saldo do fundo", numerica: true },
    ],
    linhas,
    totais: {},
    notas: [
      "Resultado e saldo PODEM ser negativos — um RPPS deficitário é o que esta projeção existe para revelar.",
      "Não há totais: a série é por exercício.",
      ...(linhas.length === 0
        ? [
            notaDeAnexoVazio("projeção atuarial", BASE_RPPS) +
              " Se o ente NÃO tem regime próprio, o anexo é inaplicável — e isso precisa ser dito na LDO, não omitido.",
          ]
        : []),
      NOTA_LIMITE_DE_FONTE,
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 6 — DÍVIDA CONSOLIDADA (TR LDO 10)
// ═══════════════════════════════════════════════════════════════════════════

const BASE_DIVIDA = "LRF art. 4º §2º — Demonstrativo da Dívida Consolidada";

export function anexoDividaConsolidada(
  exercicio: number,
  dividas: readonly DividaDto[]
): AnexoLdo {
  const linhas: LinhaAnexo[] = dividas.map((d) => ({
    ano: d.ano,
    dividaConsolidada: d.dividaConsolidada,
    deducoes: d.deducoes,
    // ⚠️ DERIVADA pela função do domínio — não existe coluna `dividaLiquida`.
    dividaLiquida: dividaLiquida(d.dividaConsolidada, d.deducoes),
    receitaCorrenteLiquida: d.receitaCorrenteLiquida,
    percentualRcl: d.percentualRcl,
  }));

  return {
    chave: "divida-consolidada",
    titulo: "Demonstrativo da Dívida Consolidada",
    baseLegal: BASE_DIVIDA,
    exercicio,
    colunas: [
      { chave: "ano", rotulo: "Exercício" },
      { chave: "dividaConsolidada", rotulo: "Dívida consolidada", numerica: true },
      { chave: "deducoes", rotulo: "Deduções", numerica: true },
      { chave: "dividaLiquida", rotulo: "Dívida cons. líquida", numerica: true },
      { chave: "receitaCorrenteLiquida", rotulo: "RCL", numerica: true },
      { chave: "percentualRcl", rotulo: "% da RCL", numerica: true },
    ],
    linhas,
    totais: {},
    notas: [
      "A dívida líquida é DERIVADA (consolidada − deduções) e não consta de coluna.",
      "O limite do Senado (Resolução 40) para municípios é 1,2 da RCL — o percentual tem 6 casas porque a segunda casa separa cumprir de descumprir.",
      ...(linhas.length === 0 ? [notaDeAnexoVazio("dívida consolidada", BASE_DIVIDA)] : []),
      NOTA_LIMITE_DE_FONTE,
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 7 — MARGEM DE EXPANSÃO (LRF art. 4º §2º, V · TR LDO 13)
// ═══════════════════════════════════════════════════════════════════════════

const BASE_MARGEM =
  "LRF art. 4º §2º, V — Margem de Expansão das Despesas Obrigatórias de Caráter Continuado";

export function anexoMargemExpansao(
  exercicio: number,
  margens: readonly MargemDto[]
): AnexoLdo {
  const linhas: LinhaAnexo[] = margens.map((m) => ({
    ano: m.ano,
    aumentoPermanenteReceita: m.aumentoPermanenteReceita,
    reducaoPermanenteDespesa: m.reducaoPermanenteDespesa,
    novasDespesasObrigatorias: m.novasDespesasObrigatorias,
    // ⚠️ DERIVADA pela função do domínio. PODE SER NEGATIVA — e é aí que ela informa:
    // o ente assumiu mais gasto continuado do que a receita permanente comporta.
    margem: margemDeExpansao(
      m.aumentoPermanenteReceita,
      m.reducaoPermanenteDespesa,
      m.novasDespesasObrigatorias
    ),
  }));

  return {
    chave: "margem-expansao",
    titulo: "Demonstrativo da Margem de Expansão das Despesas Obrigatórias",
    baseLegal: BASE_MARGEM,
    exercicio,
    colunas: [
      { chave: "ano", rotulo: "Exercício" },
      { chave: "aumentoPermanenteReceita", rotulo: "Aumento perm. de receita", numerica: true },
      { chave: "reducaoPermanenteDespesa", rotulo: "Redução perm. de despesa", numerica: true },
      { chave: "novasDespesasObrigatorias", rotulo: "Novas obrigatórias", numerica: true },
      { chave: "margem", rotulo: "Margem", numerica: true },
    ],
    linhas,
    totais: {},
    notas: [
      "A margem é DERIVADA (aumento + redução − novas despesas) e não consta de coluna.",
      "Margem NEGATIVA é declaração legítima: o ente assumiu mais gasto continuado do que a receita permanente comporta.",
      ...(linhas.length === 0 ? [notaDeAnexoVazio("margem de expansão", BASE_MARGEM)] : []),
      NOTA_LIMITE_DE_FONTE,
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 8 — PRIORIDADES E METAS FÍSICAS (TR LDO 2)
// ═══════════════════════════════════════════════════════════════════════════

const BASE_PRIORIDADES = "LDO — Anexo de Metas e Prioridades da Administração";

/**
 * ⚠️ SEM TOTAIS, e aqui o motivo é outro: a meta é FÍSICA, e físicas de unidades
 * diferentes não somam. "12 escolas + 3,5 km" não é 15,5 de coisa nenhuma. Um total nesta
 * coluna seria o erro mais fácil de cometer e o mais difícil de perceber.
 */
export function anexoPrioridades(
  exercicio: number,
  prioridades: readonly PrioridadeDto[]
): AnexoLdo {
  const linhas: LinhaAnexo[] = prioridades.map((p) => ({
    descricaoAcao: p.descricaoAcao,
    produto: p.produto,
    unidadeMedida: p.unidadeMedida,
    meta: p.meta,
  }));

  return {
    chave: "prioridades",
    titulo: "Anexo de Metas e Prioridades da Administração Municipal",
    baseLegal: BASE_PRIORIDADES,
    exercicio,
    colunas: [
      { chave: "descricaoAcao", rotulo: "Ação" },
      { chave: "produto", rotulo: "Produto" },
      { chave: "unidadeMedida", rotulo: "Unidade" },
      { chave: "meta", rotulo: "Meta física", numerica: true },
    ],
    linhas,
    totais: {},
    notas: [
      "⚠️ SEM TOTAL de meta física: unidades diferentes não somam. '12 escolas + 3,5 km' não é 15,5 de nada.",
      ...(linhas.length === 0 ? [notaDeAnexoVazio("prioridades e metas", BASE_PRIORIDADES)] : []),
      NOTA_LIMITE_DE_FONTE,
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// O ROL — para a rota parametrizada saber o que existe
// ═══════════════════════════════════════════════════════════════════════════

export const ANEXOS_DA_LDO = [
  "metas-anuais",
  "riscos-fiscais",
  "renuncia-receita",
  "alienacao-bens",
  "projecao-rpps",
  "divida-consolidada",
  "margem-expansao",
  "prioridades",
] as const;

export type ChaveAnexoLdo = (typeof ANEXOS_DA_LDO)[number];

export function ehChaveDeAnexo(v: string): v is ChaveAnexoLdo {
  return (ANEXOS_DA_LDO as readonly string[]).includes(v);
}

/** Conveniência para o teste de determinismo: soma de uma coluna como string. */
export function totalComoTexto(anexo: AnexoLdo, chave: string): string {
  const t: Money | undefined = anexo.totais[chave];
  return t === undefined ? "—" : t.toFixed(2);
}

/** Zero em `Money` — usado onde um total precisa existir e não há linha. */
export const ZERO: Money = toMoney("0.00");
