import type { ArquivoSpec } from "../tipos.js";

/**
 * ContaCont — arquivo 14, módulo BASICOS, ordem 3. 185 bytes.
 *
 * O plano de contas contábil do ente, na visão do TCM-BA. É PRÉ-REQUISITO de quase tudo: sem a
 * conta carregada, o PagEmp2 (que referencia `cd_ContaContabil`) é recusado.
 *
 * ⚠️ `nu_SequencialTC` É O DE/PARA, e é ele que obriga a tabela `DeParaContaSiga`. O código PCASP
 * do ente NÃO é o código do TCM: o Tribunal identifica a conta pelo sequencial DELE. Sem o de/para
 * preenchido não há como gerar este arquivo — e é por isso que o validador BLOQUEIA em vez de
 * inventar um número.
 */
export const SPEC_CONTA_CONT: ArquivoSpec = {
  identificacao: "ContaCont",
  numeroManual: 14,
  modulo: "BASICOS",
  ordem: 3,
  totalBytes: 185,
  origemSpec: "manual-v44-2014",
  campos: [
    { nome: "tp_registro", tipo: "N", inicio: 0, fim: 0 },
    { nome: "dt_AnoCriacao", tipo: "N", inicio: 1, fim: 4, obrigatorio: true },
    { nome: "cd_Unidade", tipo: "N", inicio: 5, fim: 8, obrigatorio: true },
    { nome: "cd_ContaContabil", tipo: "AN", inicio: 9, fim: 42, obrigatorio: true },
    /** 1=Conta Bancária 2=Despesa 3=Receita 4=Tesouro 5=Ativo 6=Passivo 7=Var.Passiva 8=Var.Ativa 9=Antecip.Compensada */
    { nome: "tp_ContaContabil", tipo: "N", inicio: 43, fim: 43, obrigatorio: true },
    { nome: "dt_AnoMes", tipo: "N", inicio: 44, fim: 49, obrigatorio: true },
    { nome: "reservado_tcm_1", tipo: "AN", inicio: 50, fim: 83 },
    /** O identificador da conta NO TCM — vem de `DeParaContaSiga.sequencialTcm`. */
    { nome: "nu_SequencialTC", tipo: "N", inicio: 84, fim: 88, obrigatorio: true },
    { nome: "tcd_FonteGestor", tipo: "N", inicio: 89, fim: 92 },
    { nome: "nm_ContaContabil", tipo: "AN", inicio: 93, fim: 142, obrigatorio: true },
    /** "S"/"N" — obrigatório quando tp_ContaContabil = 1 (conta bancária). */
    { nome: "st_ContaAtiva", tipo: "AN", inicio: 143, fim: 146 },
    /** C=Crédito D=Débito M=Mista. */
    { nome: "tp_OrigemSaldo", tipo: "AN", inicio: 147, fim: 147, obrigatorio: true },
    /** 1=Sim 2=Não. */
    { nome: "cd_RecebeLanc", tipo: "N", inicio: 148, fim: 148, obrigatorio: true },
    // Os três seguintes são obrigatórios SE tp_ContaContabil = 1; senão, brancos. A condicional
    // vive no validador (que enxerga o registro inteiro), não aqui — uma spec descreve o layout,
    // não a regra de negócio que decide quando o campo se aplica.
    { nome: "cd_Banco", tipo: "N", inicio: 149, fim: 152 },
    { nome: "cd_AgenciaBancaria", tipo: "AN", inicio: 153, fim: 164 },
    { nome: "cd_ContaBancaria", tipo: "AN", inicio: 165, fim: 174 },
    { nome: "nu_SequencialRegistro", tipo: "N", inicio: 175, fim: 184 },
  ],
};
