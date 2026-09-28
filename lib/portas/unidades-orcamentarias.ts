import { cliente, PortaSemBancoError } from "./cliente";
import { comEscritaAutenticada } from "./sessao";
import { exigirLeituraEmAlgumEscopo } from "./leitura";
import {
  declararDadosDaUnidade,
  unidadesComDeclaracao,
  type AtoDeNomeacao,
  type NaturezaJuridicaDaUnidade,
} from "../../modules/m02-planejamento/declaracao-da-unidade";

/**
 * A PORTA DAS UNIDADES ORÇAMENTÁRIAS (V21) — os dados que a prestação de contas pede da unidade:
 * natureza jurídica, secretário responsável e o ato que o nomeou, numa declaração versionada.
 *
 * Leitura sob CONSULTAR_PLANEJAMENTO; escrita autenticada, com a autorização por ação no caso de uso.
 */

export { PortaSemBancoError };
export type { AtoDeNomeacao, NaturezaJuridicaDaUnidade, UnidadeComDeclaracao } from "../../modules/m02-planejamento/declaracao-da-unidade";

export async function lerUnidadesOrcamentarias() {
  await exigirLeituraEmAlgumEscopo("CONSULTAR_PLANEJAMENTO");
  return unidadesComDeclaracao(cliente(), { corte: new Date() });
}

export async function declararDadosDaUnidadeOrcamentaria(input: {
  readonly unidadeOrcId: string;
  readonly naturezaJuridica: NaturezaJuridicaDaUnidade;
  readonly nomeSecretario: string;
  readonly cpfSecretario: string;
  readonly atoDeNomeacao: AtoDeNomeacao;
  readonly vigenteDesde: Date;
}): Promise<{ readonly unidadeCodigo: string; readonly vigenteDesde: string }> {
  return comEscritaAutenticada("DECLARAR_DADOS_DA_UNIDADE_ORCAMENTARIA", async (criadoPor) => {
    const r = await declararDadosDaUnidade(cliente(), { ...input, criadoPor });
    return { unidadeCodigo: r.unidadeCodigo, vigenteDesde: r.vigenteDesde };
  });
}
