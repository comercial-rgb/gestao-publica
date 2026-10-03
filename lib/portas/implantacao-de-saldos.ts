import { implantarSaldosIniciais, previaDaImplantacao, type PreviaDaImplantacao } from "../../modules/m01-core-contabil/implantacao-de-saldos.js";
import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";

/**
 * ═══ A IMPLANTAÇÃO DOS SALDOS INICIAIS NA TELA (V32) ═══
 *
 * A prévia é a MESMA função que a implantação chama antes de gravar: o que a tela mostra como "pode
 * implantar" é o que o serviço vai aceitar.
 */

export type { PreviaDaImplantacao };

export async function conferirBalancete(texto: string): Promise<PreviaDaImplantacao> {
  await exigirLeituraDoEnte("CONSULTAR_CONTABILIDADE");
  return previaDaImplantacao(cliente(), texto);
}

export async function implantarNaTela(texto: string, dia: string): Promise<string> {
  return comEscritaAutenticada("REGISTRAR_LANCAMENTO_MANUAL", async (criadoPor) => {
    const r = await implantarSaldosIniciais(cliente(), { texto, dia, criadoPor });
    return r.repetido
      ? `Este balancete já estava implantado (${String(r.contas)} contas); nada foi gravado de novo.`
      : `Saldos iniciais implantados: ${String(r.contas)} contas num lançamento de abertura.`;
  });
}
