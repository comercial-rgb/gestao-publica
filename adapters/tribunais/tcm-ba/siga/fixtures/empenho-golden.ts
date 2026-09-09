import { Decimal } from "decimal.js";
import { camposHierarquiaSiga } from "../hierarquia.js";

/**
 * O REGISTRO DE EMPENHO DO GOLDEN TEST.
 *
 * ⚠️ SINTÉTICO. Nenhum dado aqui corresponde a pessoa, empresa, contrato ou conta real — o CNPJ e
 * o nome do credor são fictícios e claramente identificados como modelo.
 *
 * Mora num módulo PRÓPRIO (não dentro do `.test.ts`) porque duas coisas o consomem: o teste, que
 * compara byte a byte, e o script que REGERA a fixture quando uma spec muda conscientemente. Se
 * cada um tivesse a sua cópia, o dia em que divergissem produziria um golden que passa contra si
 * mesmo — provando nada.
 */
export const EMPENHO_GOLDEN: Readonly<Record<string, unknown>> = {
  cd_Unidade: "1",
  cd_UnidadeOrcamentaria: "101",
  nu_Empenho: "45",
  nu_ProcessoLicitatorio: "PL-2026-000123",
  dt_Ano: "2026",
  tp_ProjetoAtividade: "2",
  nu_ProjetoAtividade: "2001",
  cd_FonteRecurso: "500",
  cd_Elemento: "33903900",
  vl_Empenho: new Decimal("12345.67"),
  de_Historico: "MANUTENCAO DE VEICULOS DA FROTA MUNICIPAL",
  tp_Empenho: "1",
  dt_Empenho: new Date(Date.UTC(2026, 0, 15)),
  nu_Contrato: "CT-2026-0007",
  nm_Credor: "FORNECEDOR MODELO LTDA",
  dt_AnoMes: "202601",
  nu_CGC_Credor: "12345678000199",
  tp_Pessoa: "2",
  cd_Orgao: "99",
  cd_Dispensa: "",
  // ⚠️ A HIERARQUIA VEM DAQUI, NUNCA POR ATRIBUIÇÃO DIRETA.
  //
  // Esta fixture JÁ CAIU na armadilha uma vez: ela trazia `cd_Programa: "1"` e
  // `cd_SubPrograma: "122"` — o programa no campo "Programa" e a subfunção no "SubPrograma",
  // que é o que os nomes sugerem e o INVERSO do que o SIGA espera. O golden de 500 bytes foi
  // gerado assim e commitado assim; quem o lesse como referência propagaria a troca.
  //
  // Quem pegou foi o grep do `hierarquia.test.ts`, não uma revisão — e é por isso que a
  // tradução mora numa função em vez de num comentário.
  ...camposHierarquiaSiga({ funcao: "04", subfuncao: "122", programa: "0001" }),
  st_contrato_aplicavel: "S",
  st_licitacao_sujeito: "S",
};

/** O sequencial do golden: primeiro detalhe do arquivo (header = 1). */
export const SEQUENCIAL_GOLDEN = 2;
