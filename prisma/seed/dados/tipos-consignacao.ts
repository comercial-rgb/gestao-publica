/**
 * TIPOS DE CONSIGNAÇÃO — seed MÍNIMO.
 *
 * ⚠️ ESTE NÃO É O ROL OFICIAL. O rol do SAGRES-PB é PENDÊNCIA DE DADOS (requer
 * token da ASTEC — `suportesagres@tce.pb.gov.br`). **NÃO reconstruir de memória**:
 * a lista de subfunções que foi reconstruída assim tinha 10 erros (ver M02).
 *
 * Estes 7 são os que qualquer município usa, e servem para o sistema funcionar
 * enquanto o rol oficial não chega.
 *
 * NÃO HÁ GUARD DE CARDINALIDADE (diferente das subfunções e dos elementos): o rol
 * NÃO é fechado. O ente pode criar tipos próprios — consignação de plano de
 * saúde, de sindicato, de associação. É por isso que `TipoConsignacao` é TABELA e
 * não enum.
 */

export interface TipoConsignacaoSeed {
  readonly codigo: string;
  readonly descricao: string;
}

export const TIPOS_CONSIGNACAO: readonly TipoConsignacaoSeed[] = [
  { codigo: "INSS", descricao: "Retenção previdenciária - INSS" },
  { codigo: "IRRF", descricao: "Imposto de Renda Retido na Fonte" },
  { codigo: "ISS", descricao: "Imposto Sobre Serviços retido na fonte" },
  { codigo: "PENSAO_ALIMENTICIA", descricao: "Pensão alimentícia" },
  { codigo: "CONSIGNACAO_EMPRESTIMO", descricao: "Consignação de empréstimo" },
  { codigo: "CAUCAO", descricao: "Caução / garantia contratual (Lei 14.133, art. 96)" },
  { codigo: "RETENCAO_CONTRATUAL", descricao: "Retenção contratual" },
];
