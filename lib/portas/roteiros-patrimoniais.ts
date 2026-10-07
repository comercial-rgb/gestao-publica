import {
  FAMILIAS_DE_ROTEIRO,
  declararRoteiroPatrimonial,
  listarRoteirosPatrimoniais,
  type FamiliaDoRoteiro,
  type RoteiroNaLista,
} from "../../modules/m01-core-contabil/roteiro-patrimonial-declarado.js";
import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";

/**
 * ═══ OS ROTEIROS DE PRECATÓRIOS E CONVÊNIOS NA TELA (V32) ═══
 *
 * A lista parte dos MOVIMENTOS que precisam de roteiro, não das declarações: o que está pendente é o que
 * vai ser recusado, e esconder isso esconderia justamente a causa da recusa.
 */

export type { RoteiroNaLista };

export interface MovimentoEscolhivel {
  readonly valor: string;
  readonly rotulo: string;
}

export const MOVIMENTOS_ESCOLHIVEIS: readonly MovimentoEscolhivel[] = (Object.keys(FAMILIAS_DE_ROTEIRO) as FamiliaDoRoteiro[]).flatMap((f) =>
  FAMILIAS_DE_ROTEIRO[f].chaves.map((c) => ({ valor: `${f}|${c.chave}`, rotulo: `${FAMILIAS_DE_ROTEIRO[f].rotulo} — ${c.rotulo}` }))
);

export async function lerRoteirosPatrimoniais(): Promise<readonly RoteiroNaLista[]> {
  await exigirLeituraDoEnte("CONSULTAR_CONTABILIDADE");
  return listarRoteirosPatrimoniais(cliente());
}

export async function declararRoteiroPatrimonialNaTela(input: {
  readonly movimento: string;
  readonly contaDebitoCodigo: string;
  readonly contaCreditoCodigo: string;
  readonly historicoPadrao: string;
  readonly fundamento: string;
}): Promise<string> {
  const [familia, chave] = input.movimento.split("|");
  // A propriedade, não a lista: toda família declarável no domínio é escolhível na tela (o domínio confere as classes).
  if (familia === undefined || !Object.prototype.hasOwnProperty.call(FAMILIAS_DE_ROTEIRO, familia) || chave === undefined || chave === "") {
    throw new Error("Escolha o movimento na lista. Nada foi gravado.");
  }
  return comEscritaAutenticada("PARAMETRIZAR_ROTEIRO_ORCAMENTARIO", async (criadoPor) => {
    const r = await declararRoteiroPatrimonial(cliente(), {
      familia: familia as FamiliaDoRoteiro, chave,
      contaDebitoCodigo: input.contaDebitoCodigo, contaCreditoCodigo: input.contaCreditoCodigo,
      historicoPadrao: input.historicoPadrao, fundamento: input.fundamento, criadoPor,
    });
    return `Roteiro declarado (versão ${String(r.versao)}). Os próximos movimentos lançam com estas contas; os já lançados não mudam.`;
  });
}
