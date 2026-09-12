import { definirRecurso, type DefinicaoDeRecurso } from "../../molde/tipos.js";
import { TIPOS_BASE } from "../../../modules/m10-patrimonial/dominio.js";
import type { TipoMovimentoPatrimonial } from "../../../modules/m10-patrimonial/dominio.js";

/**
 * ═══ OS DESCRITORES DO ROTEIRO CONTÁBIL DO PATRIMÔNIO — M10, TR 5.10.1.71 ═══
 *
 * ⚠️ O QUE ESTA TELA DESTRAVA, COM NÚMERO. `RoteiroPatrimonial` tinha **zero linhas**, e
 * `roteiroDoTipo` é fail-closed: sem roteiro, o movimento NÃO é registrado. O eixo
 * financeiro inteiro do patrimônio — avaliação inicial, reavaliação, depreciação,
 * amortização, exaustão, impairment, doação, baixa por alienação — estava inalcançável por
 * falta de UMA tabela de parâmetro que nenhum serviço sabia escrever.
 *
 * ═══ ⚠️ ESTE DESCRITOR IMPORTA O DOMÍNIO, E PODE ═══
 *
 * Ele vive em `lib/portas/`, que é a zona 2 da fronteira (`test/ui/fronteira-ui.test.ts`):
 * a porta importa `modules/mNN`. Os descritores vizinhos não importam por não precisarem —
 * este precisa, e a razão é que a alternativa seria pior: treze strings copiadas à mão
 * derivariam em silêncio no dia em que o MCASP acrescentasse um tipo. `TIPOS_BASE` é
 * derivado do `Record` exaustivo do sinal, e é a única fonte.
 *
 * ═══ ⚠️ A LISTA MOSTRA OS TREZE TIPOS, PARAMETRIZADOS OU NÃO ═══
 *
 * É deliberado, e é o ponto da tela. Uma listagem só das linhas gravadas mostraria, hoje,
 * uma tela vazia — verdadeira e inútil: o que o contador precisa saber é **o que falta**.
 * A porta compõe as treze linhas a partir de `TIPOS_BASE` e junta o roteiro quando existe;
 * o `id` de cada linha é o PRÓPRIO TIPO, que é `@unique` no modelo e estável.
 *
 * ⚠️ E O ESTORNO NÃO APARECE, de propósito. O rol tem 26 valores — treze base e treze
 * `ESTORNO_*` —, e o estorno não tem roteiro: o lançamento contrário é gerado invertendo as
 * pernas do original. Oferecê-lo criaria uma segunda fonte para o mesmo par.
 */

/**
 * O rótulo de cada tipo, em português de quem usa.
 *
 * ⚠️ `Record` EXAUSTIVO SOBRE OS 26, e não um mapa dos treze que a tela mostra. É a rede do
 * compilador: quem acrescentar um tipo ao enum não compila até dizer como ele se chama na
 * tela. Um mapa parcial deixaria o tipo novo aparecer como `REAVALIACAO_AUMENTO` cru — e o
 * operador escolheria pelo palpite.
 */
const ROTULO_DO_TIPO: Readonly<Record<TipoMovimentoPatrimonial, string>> = {
  AQUISICAO: "Aquisição",
  AVALIACAO_INICIAL: "Avaliação inicial",
  CUSTO_SUBSEQUENTE: "Custo subsequente",
  DOACAO_RECEBIDA: "Doação recebida",
  REAVALIACAO_AUMENTO: "Reavaliação — aumento",
  DEPRECIACAO: "Depreciação",
  AMORTIZACAO: "Amortização",
  EXAUSTAO: "Exaustão",
  IMPAIRMENT: "Redução ao valor recuperável",
  REAVALIACAO_REDUCAO: "Reavaliação — redução",
  DOACAO_REALIZADA: "Doação realizada",
  BAIXA_ALIENACAO: "Baixa por alienação",
  BAIXA_DE_ATUALIZACAO_ACUMULADA: "Baixa da depreciação acumulada",

  ESTORNO_AQUISICAO: "Estorno de aquisição",
  ESTORNO_AVALIACAO_INICIAL: "Estorno de avaliação inicial",
  ESTORNO_CUSTO_SUBSEQUENTE: "Estorno de custo subsequente",
  ESTORNO_DOACAO_RECEBIDA: "Estorno de doação recebida",
  ESTORNO_REAVALIACAO_AUMENTO: "Estorno de reavaliação — aumento",
  ESTORNO_DEPRECIACAO: "Estorno de depreciação",
  ESTORNO_AMORTIZACAO: "Estorno de amortização",
  ESTORNO_EXAUSTAO: "Estorno de exaustão",
  ESTORNO_IMPAIRMENT: "Estorno de redução ao valor recuperável",
  ESTORNO_REAVALIACAO_REDUCAO: "Estorno de reavaliação — redução",
  ESTORNO_DOACAO_REALIZADA: "Estorno de doação realizada",
  ESTORNO_BAIXA_ALIENACAO: "Estorno de baixa por alienação",
  ESTORNO_BAIXA_DE_ATUALIZACAO_ACUMULADA:
    "Estorno de baixa da depreciação acumulada",
};

/** Exportado para a porta e para o percurso — uma fonte só para o nome de cada tipo. */
export function rotuloDoTipoPatrimonial(tipo: string): string {
  return ROTULO_DO_TIPO[tipo as TipoMovimentoPatrimonial] ?? tipo;
}

export const OPCOES_DE_TIPO: readonly { readonly valor: string; readonly rotulo: string }[] =
  TIPOS_BASE.map((t) => ({ valor: t, rotulo: ROTULO_DO_TIPO[t] }));

/** As duas chaves do resultado da alienação — rol FECHADO do modelo, não cadastro do ente. */
export const OPCOES_DE_CHAVE: readonly { readonly valor: string; readonly rotulo: string }[] = [
  { valor: "GANHO_ALIENACAO", rotulo: "Ganho na alienação" },
  { valor: "PERDA_ALIENACAO", rotulo: "Perda na alienação" },
];

/**
 * ⚠️ AS CLASSES DECLARADAS SÃO AS QUATRO PATRIMONIAIS, e o motor é quem cobra de verdade.
 *
 * `validarLancamento` recusa perna cuja classe não case com o subsistema: patrimonial é
 * 1 a 4 (ativo, passivo, VPD, VPA), orçamentária 5-6, controle 7-8. Oferecer aqui uma conta
 * de controle seria montar um formulário que o serviço vai recusar — e a recusa chegaria
 * depois de o operador ter procurado a conta numa lista de seis mil.
 *
 * ⚠️ E O GUARD DO MOLDE NÃO COBRA ESTA DECLARAÇÃO. `verificarDefinicao` exige
 * `classesDeConta` quando existe campo chamado — literalmente — `contaContabilId`; aqui os
 * campos são `contaDebitoId` e `contaCreditoId`, e o guard fica MUDO. Declaro assim mesmo,
 * pela mesma razão que o descritor do acervo declarou: pendência
 * `RECORTE-DE-CONTA-POR-NOME-LITERAL`.
 */
const CLASSES_PATRIMONIAIS = ["1", "2", "3", "4"] as const;

const AVISO_DA_SUBSTITUICAO =
  "O roteiro novo vale para os movimentos FUTUROS deste evento. Os lançamentos já " +
  "gravados continuam apontando para as contas anteriores — o razão é append-only, e " +
  "corrigir o passado é lançamento novo, não alteração.";

export const ROTEIROS_PATRIMONIAIS: DefinicaoDeRecurso = definirRecurso({
  nome: "roteiros-patrimoniais",
  rotulo: "Roteiros contábeis do patrimônio",
  rotuloSingular: "Roteiro contábil",
  rota: "/patrimonio/roteiros",
  descricao:
    "Em que par de contas do PCASP cada evento do bem bate na contabilidade — aquisição, " +
    "reavaliação, depreciação, baixa. Evento sem roteiro NÃO é registrado: o sistema " +
    "recusa em vez de escolher uma conta.",
  campos: [
    {
      nome: "tipo",
      rotulo: "Evento patrimonial",
      tipo: "selecao",
      obrigatorio: true,
      largura: 2,
      opcoes: OPCOES_DE_TIPO,
      ajuda:
        "Os treze eventos que movem o valor do bem. Os estornos não aparecem: o lançamento " +
        "contrário é gerado invertendo as pernas do original.",
    },
    {
      nome: "contaDebitoId",
      rotulo: "Conta de débito",
      tipo: "selecao",
      obrigatorio: true,
      largura: 3,
      opcoes: [],
      ajuda: "Só contas analíticas das classes 1 a 4 — as que formam lançamento patrimonial.",
    },
    {
      nome: "contaCreditoId",
      rotulo: "Conta de crédito",
      tipo: "selecao",
      obrigatorio: true,
      largura: 3,
      opcoes: [],
      ajuda: "A contrapartida. Débito e crédito não podem ser a mesma conta.",
    },
  ],
  colunas: [
    { nome: "evento", cabecalho: "Evento", tipo: "link", ordenavel: true },
    { nome: "debito", cabecalho: "Débito", tipo: "texto" },
    { nome: "credito", cabecalho: "Crédito", tipo: "texto" },
    { nome: "situacao", cabecalho: "Situação", tipo: "situacao" },
  ],
  filtros: [
    { nome: "q", rotulo: "Evento ou conta", tipo: "texto", largura: 2 },
    {
      nome: "situacao",
      rotulo: "Situação",
      tipo: "selecao",
      largura: 1,
      opcoes: [
        { valor: "PARAMETRIZADO", rotulo: "Parametrizado" },
        { valor: "PENDENTE", rotulo: "Sem roteiro" },
      ],
    },
  ],
  acoes: [
    {
      // ⚠️ REPARAMETRIZAR É ATO À PARTE, e não o mesmo formulário com outro nome. Trocar as
      // contas de um evento já parametrizado muda a contabilidade dos movimentos seguintes;
      // o serviço RECUSA a substituição pelo caminho de criar, justamente para que ninguém
      // sobrescreva um roteiro por ter digitado o tipo errado.
      nome: "reparametrizar",
      rotulo: "Trocar as contas deste roteiro",
      acaoDoCenso: "PARAMETRIZAR_ROTEIRO_PATRIMONIAL",
      aviso: AVISO_DA_SUBSTITUICAO,
      campos: [
        { nome: "contaDebitoId", rotulo: "Nova conta de débito", tipo: "selecao", obrigatorio: true, largura: 3, opcoes: [] },
        { nome: "contaCreditoId", rotulo: "Nova conta de crédito", tipo: "selecao", obrigatorio: true, largura: 3, opcoes: [] },
      ],
    },
  ],
  permissoes: { criar: "PARAMETRIZAR_ROTEIRO_PATRIMONIAL" },
  classesDeConta: [...CLASSES_PATRIMONIAIS],

  // ⚠️ SEM A ABA DE HISTÓRICO: a tabela do roteiro não guarda o par anterior, e uma aba de
  // histórico vazia ensinaria que o sistema perdeu a alteração. Quem trocou e quando está
  // em `RegistroDeOperacao` (TR 6.3). Pendência `ROTEIRO-SEM-HISTORICO-PROPRIO`.
  abas: ["dados"],
});

export const ROTEIROS_DE_RESULTADO: DefinicaoDeRecurso = definirRecurso({
  nome: "roteiros-de-resultado",
  rotulo: "Roteiros do resultado da alienação",
  rotuloSingular: "Roteiro do resultado",
  rota: "/patrimonio/roteiros-de-resultado",
  descricao:
    "O ganho e a perda apurados quando o bem é vendido. Não mexem no ativo — ele já saiu " +
    "pela baixa —, e por isso têm roteiro próprio, separado dos eventos do bem.",
  campos: [
    {
      nome: "chave",
      rotulo: "Resultado",
      tipo: "selecao",
      obrigatorio: true,
      largura: 2,
      opcoes: OPCOES_DE_CHAVE,
      ajuda:
        "Ganho quando o preço de venda supera o valor contábil do bem; perda no caso " +
        "contrário. A apuração é do sistema — aqui se diz apenas onde ela é lançada.",
    },
    {
      nome: "contaDebitoId",
      rotulo: "Conta de débito",
      tipo: "selecao",
      obrigatorio: true,
      largura: 3,
      opcoes: [],
      ajuda: "Só contas analíticas das classes 1 a 4.",
    },
    {
      nome: "contaCreditoId",
      rotulo: "Conta de crédito",
      tipo: "selecao",
      obrigatorio: true,
      largura: 3,
      opcoes: [],
    },
  ],
  colunas: [
    { nome: "evento", cabecalho: "Resultado", tipo: "link", ordenavel: true },
    { nome: "debito", cabecalho: "Débito", tipo: "texto" },
    { nome: "credito", cabecalho: "Crédito", tipo: "texto" },
    { nome: "situacao", cabecalho: "Situação", tipo: "situacao" },
  ],
  filtros: [{ nome: "q", rotulo: "Resultado ou conta", tipo: "texto", largura: 2 }],
  acoes: [
    {
      nome: "reparametrizar",
      rotulo: "Trocar as contas deste roteiro",
      acaoDoCenso: "PARAMETRIZAR_ROTEIRO_PATRIMONIAL",
      aviso: AVISO_DA_SUBSTITUICAO,
      campos: [
        { nome: "contaDebitoId", rotulo: "Nova conta de débito", tipo: "selecao", obrigatorio: true, largura: 3, opcoes: [] },
        { nome: "contaCreditoId", rotulo: "Nova conta de crédito", tipo: "selecao", obrigatorio: true, largura: 3, opcoes: [] },
      ],
    },
  ],
  permissoes: { criar: "PARAMETRIZAR_ROTEIRO_PATRIMONIAL" },
  classesDeConta: [...CLASSES_PATRIMONIAIS],
  abas: ["dados"],
});

export const RECURSOS_DOS_ROTEIROS: readonly DefinicaoDeRecurso[] = [
  ROTEIROS_PATRIMONIAIS,
  ROTEIROS_DE_RESULTADO,
];
