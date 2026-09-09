import type { ArquivoSpec } from "../tipos.js";

/**
 * Unidade Orçamentária — arquivo 66, ORCAMENTO, ordem 2. 83 bytes.
 *
 * ═══ ⚠️ O MANUAL DECLARA "Total 82". ESTÁ ERRADO. ═══
 * O último campo (`nu_SequencialRegistro`) ocupa 73–82, e as posições são 0-BASED e INCLUSIVAS —
 * logo a contagem é `fim + 1 = 83`. O manual escreveu a POSIÇÃO FINAL no lugar da CONTAGEM.
 *
 * É o mesmo erro do MovConta (32), e o padrão é esse: onde o total do manual bate exatamente com a
 * posição final do último campo, é o off-by-one do 0-based. `validarArquivoSpec` confronta a soma
 * das larguras com o `totalBytes` justamente para que este tipo de erro não entre em silêncio.
 *
 * ⚠️ NÃO "CORRIJA" O 83 DE VOLTA PARA 82. Gerar com 82 truncaria o último byte do sequencial de
 * todo registro do arquivo.
 */
export const SPEC_UNID_ORCA: ArquivoSpec = {
  identificacao: "UnidOrca",
  numeroManual: 66,
  modulo: "ORCAMENTO",
  ordem: 2,
  // O manual diz 82. A soma das larguras diz 83, e a soma é o fato.
  totalBytes: 83,
  origemSpec: "manual-v44-2014",
  campos: [
    { nome: "tp_registro", tipo: "N", inicio: 0, fim: 0, literal: "1" },
    { nome: "dt_Ano", tipo: "N", inicio: 1, fim: 4, obrigatorio: true },
    { nome: "cd_Unidade", tipo: "N", inicio: 5, fim: 8, obrigatorio: true },
    { nome: "cd_UnidadeOrcamentaria", tipo: "N", inicio: 9, fim: 12, obrigatorio: true },
    { nome: "de_UnidadeOrcamentaria", tipo: "AN", inicio: 13, fim: 62 },
    { nome: "reservado_tcm_1", tipo: "N", inicio: 63, fim: 68, literal: "000000" },
    { nome: "cd_Orgao", tipo: "N", inicio: 69, fim: 72, obrigatorio: true },
    { nome: "nu_SequencialRegistro", tipo: "N", inicio: 73, fim: 82 },
  ],
};
