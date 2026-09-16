"use server";

import { revalidatePath } from "next/cache";
import { cadastrarImovelNaTela, encerrarVinculoNaTela, novaVersaoNaTela, publicarTabelaNaTela, vincularNaTela } from "../../../../lib/portas/cadastro-imobiliario";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";

/**
 * AS AÇÕES DO CADASTRO IMOBILIÁRIO E DOS PARÂMETROS (V7 B1). Nenhuma regra aqui: ação, vigência, fração, fórmula e
 * origem das variáveis são recusas do domínio, e sobem como vieram. SIMULAR não está aqui: é leitura, pela URL.
 */
export interface EstadoDoImovel {
  readonly erro?: string;
  readonly sucesso?: string;
  readonly acao?: string;
}

const ATOS: Readonly<Record<string, (c: Record<string, string>) => Promise<string>>> = {
  cadastrar: cadastrarImovelNaTela,
  novaVersao: novaVersaoNaTela,
  vincular: vincularNaTela,
  encerrarVinculo: encerrarVinculoNaTela,
  publicarTabela: publicarTabelaNaTela,
};

export async function imovelAction(_prev: EstadoDoImovel, formData: FormData): Promise<EstadoDoImovel> {
  return comComandoDoFormulario(formData, async () => {
    const campos: Record<string, string> = {};
    for (const [k, v] of formData.entries()) if (typeof v === "string") campos[k] = v;
    const acao = campos["__acao"] ?? "";
    const ato = ATOS[acao];
    if (ato === undefined) return { erro: `Ação desconhecida: ${acao}. Nada foi gravado.`, acao };
    try {
      const sucesso = await ato(campos);
      revalidatePath("/receita/imoveis", "layout");
      revalidatePath("/receita/parametros-tributarios", "layout");
      return { sucesso, acao };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Falha ao gravar. Nada foi gravado."), acao };
    }
  });
}
