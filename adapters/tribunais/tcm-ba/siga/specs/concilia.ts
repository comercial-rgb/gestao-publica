import type { ArquivoSpec } from "../tipos.js";

/**
 * Conciliação Bancária — arquivo 12, INFORMES, ordem 13. 202 bytes. Total do manual CONFERE.
 *
 * ═══ ⚠️ TRÊS REGRAS ACOPLADAS — o campo sozinho é válido, a COMBINAÇÃO é que decide ═══
 * Quando `cd_Conciliacao` vale 3 (Movimentação/Saldo), os outros dois campos deixam de ser livres:
 *
 *   · `cd_Conciliacao == 3` → `tp_Pagamento` DEVE ser 1  (SIGA-E019)
 *   · `cd_Conciliacao == 3` → `de_DetalheTipoPagto` DEVE ser "11111111"  (SIGA-E020)
 *   · `cd_Conciliacao != 3` → `vl_MovConciliado` NÃO pode ser zero  (SIGA-E021)
 *
 * Nenhuma delas é expressável na geometria: cada campo isolado passa em qualquer validação de
 * largura e domínio. É por isso que vivem no validador, e não aqui — uma spec descreve o layout,
 * não a regra que amarra dois campos.
 *
 * ⚠️ DOMÍNIO PARCIAL. Da "Tabela Tipo Conciliação Bancária" só se conhece o valor 3. Os demais
 * códigos não constam do manual v44 — o que significa que `cd_Conciliacao != 3` é aceito sem que
 * se saiba o que ele representa. Confirmar a tabela com o TCM é pré-requisito de remessa real.
 */
export const SPEC_CONCILIA: ArquivoSpec = {
  identificacao: "Concilia",
  numeroManual: 12,
  modulo: "INFORMES",
  ordem: 13,
  totalBytes: 202,
  origemSpec: "manual-v44-2014",
  campos: [
    { nome: "tp_registro", tipo: "N", inicio: 0, fim: 0, literal: "1" },
    { nome: "dt_AnoCriacao", tipo: "N", inicio: 1, fim: 4, obrigatorio: true },
    { nome: "cd_Unidade", tipo: "N", inicio: 5, fim: 8, obrigatorio: true },
    { nome: "cd_ContaContabil", tipo: "AN", inicio: 9, fim: 42, obrigatorio: true },
    { nome: "dt_AnoMes", tipo: "N", inicio: 43, fim: 48, obrigatorio: true },
    { nome: "reservado_tcm_1", tipo: "N", inicio: 49, fim: 49, literal: "0" },
    /** ⚠️ Domínio PARCIAL: só o 3 (Movimentação/Saldo) é conhecido. Amarra os dois campos abaixo. */
    { nome: "cd_Conciliacao", tipo: "N", inicio: 50, fim: 50, obrigatorio: true },
    { nome: "de_Conciliacao", tipo: "AN", inicio: 51, fim: 150 },
    { nome: "dt_MovConciliado", tipo: "D", inicio: 151, fim: 158, obrigatorio: true },
    { nome: "vl_MovConciliado", tipo: "V", inicio: 159, fim: 174, decimais: 2 },
    { nome: "nu_SequencialConciliacao", tipo: "N", inicio: 175, fim: 182, obrigatorio: true },
    /** 1=Cheque 2=Ordem 3=TED 4=DOC 5=Débito. Forçado a 1 quando cd_Conciliacao = 3. */
    { nome: "tp_Pagamento", tipo: "N", inicio: 183, fim: 183, obrigatorio: true },
    { nome: "de_DetalheTipoPagto", tipo: "N", inicio: 184, fim: 191, obrigatorio: true },
    { nome: "nu_SequencialRegistro", tipo: "N", inicio: 192, fim: 201 },
  ],
};

/** O único valor conhecido da "Tabela Tipo Conciliação Bancária": Movimentação/Saldo. */
export const CONCILIACAO_MOVIMENTACAO_SALDO = 3;
/** `tp_Pagamento` obrigatório quando `cd_Conciliacao` = 3. */
export const TP_PAGAMENTO_EXIGIDO_NO_TIPO_3 = "1";
/** `de_DetalheTipoPagto` obrigatório quando `cd_Conciliacao` = 3. */
export const DETALHE_EXIGIDO_NO_TIPO_3 = "11111111";
