/**
 * COMPONENTES DA NATUREZA DA DESPESA — Portaria Interministerial STN/SOF
 * 163/2001. Padrão nacional.
 *
 * ⚠️ ESTES VALORES NÃO SÃO SEMEADOS EM TABELA — E ISSO É DE PROPÓSITO.
 *
 * O schema do M02 NÃO tem models `CategoriaEconomica`, `GrupoNaturezaDespesa`
 * nem `ModalidadeAplicacao`: a `NaturezaDespesa` guarda os 4 componentes como
 * CAMPOS (`codCategoria`, `codNatureza`, `codModalidade`, `codElemento`), com o
 * `codigoCompleto` derivado. Criar tabelas para eles agora seria mudar schema —
 * fora do escopo desta sessão.
 *
 * Então eles ficam aqui, como const arrays tipados, prontos para a PRÓXIMA
 * sessão de seed COMBINÁ-LOS com os elementos de despesa e gerar as linhas de
 * `NaturezaDespesa` (categoria × grupo × modalidade × elemento).
 *
 * Servem também como fonte da verdade para validar códigos: uma modalidade que
 * não esteja em `MODALIDADES_APLICACAO` não deveria virar NaturezaDespesa.
 */

export interface ComponenteNatureza {
  readonly codigo: string;
  readonly descricao: string;
}

/** 1º dígito da natureza da despesa. */
export const CATEGORIAS_ECONOMICAS: readonly ComponenteNatureza[] = [
  { codigo: "3", descricao: "Despesas Correntes" },
  { codigo: "4", descricao: "Despesas de Capital" },
];

/** 2º dígito — Grupo de Natureza da Despesa (GND). */
export const GRUPOS_NATUREZA_DESPESA: readonly ComponenteNatureza[] = [
  { codigo: "1", descricao: "Pessoal e Encargos Sociais" },
  { codigo: "2", descricao: "Juros e Encargos da Dívida" },
  { codigo: "3", descricao: "Outras Despesas Correntes" },
  { codigo: "4", descricao: "Investimentos" },
  { codigo: "5", descricao: "Inversões Financeiras" },
  { codigo: "6", descricao: "Amortização da Dívida" },
];

/**
 * 3º e 4º dígitos — Modalidade de Aplicação. 22 modalidades.
 *
 * Corrigido na sessão 2d contra o Anexo II: REMOVIDAS 35 e 45 (substituídas por
 * 31 e 41 na renumeração fundo-a-fundo); ACRESCENTADAS 32, 42, 93 e 94.
 *
 * ⚠️ NÃO CONFUNDIR COM ELEMENTO. Os códigos 32, 46, 67, 73, 93 e 94 também
 * existem como ELEMENTO de despesa, com significado totalmente diferente
 * (elemento 46 = Auxílio-Alimentação; modalidade 46 = fundo a fundo SUAS). São
 * posições distintas da natureza (`codModalidade` vs `codElemento`).
 */
export const MODALIDADES_APLICACAO: readonly ComponenteNatureza[] = [
  { codigo: "20", descricao: "Transferências à União" },
  { codigo: "22", descricao: "Execução Orçamentária Delegada à União" },
  { codigo: "30", descricao: "Transferências a Estados e ao Distrito Federal" },
  // 31/41 assumiram o lugar de 35/45 na renumeração fundo-a-fundo.
  {
    codigo: "31",
    descricao:
      "Transferências a Estados e ao Distrito Federal - Fundo a Fundo",
  },
  {
    codigo: "32",
    descricao: "Execução Orçamentária Delegada a Estados e ao Distrito Federal",
  },
  { codigo: "40", descricao: "Transferências a Municípios" },
  { codigo: "41", descricao: "Transferências a Municípios - Fundo a Fundo" },
  { codigo: "42", descricao: "Execução Orçamentária Delegada a Municípios" },
  // modalidade de portaria posterior à 163/2001 base — confirmar no MCASP vigente
  {
    codigo: "46",
    descricao:
      "Transferência Fundo a Fundo aos Municípios à conta de recursos do SUAS",
  },
  {
    codigo: "50",
    descricao: "Transferências a Instituições Privadas sem Fins Lucrativos",
  },
  {
    codigo: "60",
    descricao: "Transferências a Instituições Privadas com Fins Lucrativos",
  },
  // modalidade de portaria posterior à 163/2001 base — confirmar no MCASP vigente
  {
    codigo: "67",
    descricao: "Execução de Contrato de Parceria Público-Privada - PPP",
  },
  {
    codigo: "70",
    descricao: "Transferências a Instituições Multigovernamentais",
  },
  {
    codigo: "71",
    descricao:
      "Transferências a Consórcios Públicos mediante contrato de rateio à conta de recursos de que tratam os §§ 1º e 2º do art. 24 da Lei Complementar nº 141/2012",
  },
  {
    codigo: "72",
    descricao: "Execução Orçamentária Delegada a Consórcios Públicos",
  },
  // modalidade de portaria posterior à 163/2001 base — confirmar no MCASP vigente
  {
    codigo: "73",
    descricao:
      "Transferências a Consórcios Públicos mediante contrato de rateio",
  },
  { codigo: "80", descricao: "Transferências ao Exterior" },
  { codigo: "90", descricao: "Aplicações Diretas" },
  {
    codigo: "91",
    descricao:
      "Aplicação Direta Decorrente de Operação entre Órgãos, Fundos e Entidades Integrantes dos Orçamentos Fiscal e da Seguridade Social",
  },
  {
    codigo: "93",
    descricao:
      "Aplicação Direta Decorrente de Operação de Órgãos, Fundos e Entidades Integrantes dos Orçamentos Fiscal e da Seguridade Social com Consórcio Público do qual o Ente Participe",
  },
  {
    codigo: "94",
    descricao:
      "Aplicação Direta Decorrente de Operação de Órgãos, Fundos e Entidades Integrantes dos Orçamentos Fiscal e da Seguridade Social com Consórcio Público do qual o Ente Não Participe",
  },
  { codigo: "99", descricao: "A Definir" },
];
