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
  /**
   * A conta do PCASP onde o passivo desta consignação nasce.
   *
   * ⚠️ TODAS APONTAM PARA A MESMA CONTA, E ISSO NÃO É DESCUIDO. O plano MÍNIMO deste
   * repositório (`prisma/seed/pcasp.ts`) tem UMA conta analítica de consignações —
   * `2.1.8.8.1.01.00`. Um ente real segrega o INSS do IRRF em contas próprias; quando o
   * plano dele entrar, é o CADASTRO que muda, não o código.
   *
   * ⚠️ E ISTO NÃO SUBSTITUI A SEGREGAÇÃO DO SALDO. Quanto se deve a cada consignatário é
   * `Σ(valor × sinal)` por **(tipo, credor)** em `MovimentoExtraorcamentario` — não o
   * saldo da conta contábil. Duas consignações na mesma conta do razão continuam sendo
   * duas dívidas distintas, com dois credores distintos.
   */
  readonly contaPassivo: string;
}

/**
 * A ÚNICA conta analítica de consignações do plano mínimo. Ver o aviso acima antes de
 * tratá-la como recomendação de plano de contas: ela é o que EXISTE aqui, não o que um
 * ente deve ter.
 */
const CONSIGNACOES = "2.1.8.8.1.01.00";

export const TIPOS_CONSIGNACAO: readonly TipoConsignacaoSeed[] = [
  { codigo: "INSS", descricao: "Retenção previdenciária - INSS", contaPassivo: CONSIGNACOES },
  { codigo: "IRRF", descricao: "Imposto de Renda Retido na Fonte", contaPassivo: CONSIGNACOES },
  { codigo: "ISS", descricao: "Imposto Sobre Serviços retido na fonte", contaPassivo: CONSIGNACOES },
  { codigo: "PENSAO_ALIMENTICIA", descricao: "Pensão alimentícia", contaPassivo: CONSIGNACOES },
  { codigo: "CONSIGNACAO_EMPRESTIMO", descricao: "Consignação de empréstimo", contaPassivo: CONSIGNACOES },
  { codigo: "CAUCAO", descricao: "Caução / garantia contratual (Lei 14.133, art. 96)", contaPassivo: CONSIGNACOES },
  { codigo: "RETENCAO_CONTRATUAL", descricao: "Retenção contratual", contaPassivo: CONSIGNACOES },
];
