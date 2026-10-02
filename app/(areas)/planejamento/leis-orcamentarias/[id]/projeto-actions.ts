"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
import { capturarVersaoPelaTela } from "../../../../../lib/portas/projeto-da-loa";
import { meioDiaCivil } from "../../../../../packages/datas/index";

export interface EstadoDoProjeto {
  readonly erro?: string;
  readonly sucesso?: string;
}

const t = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();
const TIPOS = ["ENCAMINHADO", "MENSAGEM_MODIFICATIVA", "EMENDADO_NA_CAMARA"] as const;

export async function capturarVersaoAction(_p: EstadoDoProjeto, f: FormData): Promise<EstadoDoProjeto> {
  return comComandoDoFormulario(f, async () => {
    const tipo = TIPOS.find((x) => x === t(f, "tipo"));
    if (tipo === undefined) return { erro: "Escolha o tipo da versão." };
    if (t(f, "dataDoEncaminhamento") === "") return { erro: "Informe o dia em que a versão chegou à Câmara." };
    const leiId = t(f, "leiId");
    try {
      const sucesso = await capturarVersaoPelaTela({
        leiId,
        tipo,
        dataDoEncaminhamento: meioDiaCivil(t(f, "dataDoEncaminhamento")),
        competenciaDaRemessa: t(f, "competenciaDaRemessa"),
        documento: t(f, "documento"),
        fundamento: t(f, "fundamento"),
      });
      revalidatePath(`/planejamento/leis-orcamentarias/${leiId}`);
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível guardar a versão do projeto. Nada foi gravado.") };
    }
  });
}
