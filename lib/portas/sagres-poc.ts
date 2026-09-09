/**
 * PARÂMETROS POC DO SAGRES — UG e competência FICTÍCIAS, claramente identificadas como POC
 * (DIRETIVA §5: "UG sintética; nenhum dado corresponde a pessoa, empresa ou conta real").
 *
 * São só a UG selecionada e a competência de referência da demonstração — não são dado de negócio.
 * A massa encadeada (a sessão S-massa) povoa o banco; aqui só se diz QUAL UG/dia a tela exporta.
 * `codUnidadeGestora` é parâmetro de exportação (não há UG de 6 dígitos no modelo — ver M15/MODULO).
 */
export const POC_SAGRES = {
  /** UG fictícia POC (6 dígitos). */
  codUnidadeGestora: "999001",
  /** CNPJ fictício do ente gerenciador (14 dígitos, sem máscara) — não é CNPJ real. */
  cnpjGerenciadora: "12345678000199",
  /** Dia de referência: compõe o pacote diário; seu mês/ano, o mensal. */
  dia: new Date(Date.UTC(2026, 6, 15)),
  /** Conta arrecadadora designada da UG (parâmetro de exportação da ReceitaOrcamentaria — S7). */
  codContaArrecadadora: "CC-POC-A",
  /**
   * Fonte STN da DespesaExtra §4.20 (parâmetro de exportação — S-fechamento). O layout admite
   * 860/861/862/869 para movimentação extraorçamentária e não detalha, no arquivo local, qual usar
   * por natureza de consignação: a POC adota 869 e a ESCOLHA vai nomeada no bloco verde e na matriz,
   * a confirmar no aceite/validador oficial. Não é dado de negócio.
   */
  codFonteRecursoExtra: "869",
} as const;
