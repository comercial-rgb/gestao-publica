/** Os rótulos da situação DERIVADA do empenho — um lugar só para a tela, o modal e o Excel. */
export const ROTULO_STATUS_DO_EMPENHO: Readonly<Record<string, string>> = {
  EMPENHADO: "Empenhado",
  PARCIAL_LIQUIDADO: "Liq. parcial",
  LIQUIDADO: "Liquidado",
  PARCIAL_PAGO: "Pago parcial",
  PAGO: "Pago",
  ANULADO: "Anulado",
};

export const ROTULO_CATEGORIA_DO_EMPENHO: Readonly<Record<string, string>> = {
  FORNECIMENTO_BENS: "Fornecimento de bens",
  LOCACAO: "Locação",
  PRESTACAO_SERVICOS: "Prestação de serviços",
  REALIZACAO_OBRAS: "Realização de obras",
};
