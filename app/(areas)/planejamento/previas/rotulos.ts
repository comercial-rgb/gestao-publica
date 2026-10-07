/** Os rótulos de tela da prévia de alteração orçamentária (lista, detalhe e minuta). */
export const TIPO: Record<"SUPLEMENTAR" | "ESPECIAL" | "EXTRAORDINARIO", string> = {
  SUPLEMENTAR: "Suplementar",
  ESPECIAL: "Especial",
  EXTRAORDINARIO: "Extraordinário",
};

export const ORIGEM: Record<"ANULACAO" | "SUPERAVIT_FINANCEIRO" | "EXCESSO_ARRECADACAO" | "OPERACAO_CREDITO", string> = {
  ANULACAO: "Anulação de dotações",
  SUPERAVIT_FINANCEIRO: "Superávit financeiro",
  EXCESSO_ARRECADACAO: "Excesso de arrecadação",
  OPERACAO_CREDITO: "Operação de crédito",
};

export const SITUACAO: Record<"EM_ELABORACAO" | "APROVADA" | "EFETIVADA" | "DESCARTADA", string> = {
  EM_ELABORACAO: "Em elaboração",
  APROVADA: "Aprovada",
  EFETIVADA: "Efetivada",
  DESCARTADA: "Descartada",
};
