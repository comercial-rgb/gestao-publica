"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
import { informarProtocoloPelaTela, registrarNormaPelaTela } from "../../../../../lib/portas/normas-no-tce";
import { meioDiaCivil } from "../../../../../packages/datas/index";

export interface EstadoDaNorma {
  readonly erro?: string;
  readonly sucesso?: string;
}

const t = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();
const TIPOS = ["LOA", "CREDITO_SUPLEMENTAR", "CREDITO_ESPECIAL", "TRANSPOSICAO"] as const;

export async function registrarNormaAction(_p: EstadoDaNorma, f: FormData): Promise<EstadoDaNorma> {
  return comComandoDoFormulario(f, async () => {
    const tipo = TIPOS.find((x) => x === t(f, "tipo"));
    if (tipo === undefined) return { erro: "Escolha o tipo da lei." };
    if (t(f, "dataPublicacao") === "") return { erro: "Informe a data de publicação da lei." };
    const ano = Number(t(f, "ano"));
    if (!Number.isInteger(ano)) return { erro: "Informe o ano da lei." };
    try {
      const sucesso = await registrarNormaPelaTela({
        tipo,
        numero: t(f, "numero"),
        ano,
        dataPublicacao: meioDiaCivil(t(f, "dataPublicacao")),
        protocoloTce: t(f, "protocoloTce"),
        autorizacaoPercentual: t(f, "autorizacao") === "PERCENTUAL",
        valor: t(f, "valor"),
        leiCreditoId: t(f, "leiCreditoId") || null,
        fundamento: t(f, "fundamento"),
      });
      revalidatePath("/planejamento/creditos-adicionais/normas-no-tribunal");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível registrar a lei. Nada foi gravado.") };
    }
  });
}

export async function informarProtocoloAction(_p: EstadoDaNorma, f: FormData): Promise<EstadoDaNorma> {
  return comComandoDoFormulario(f, async () => {
    try {
      const sucesso = await informarProtocoloPelaTela({ normaId: t(f, "normaId"), protocoloTce: t(f, "protocoloTce"), fundamento: t(f, "fundamento") });
      revalidatePath("/planejamento/creditos-adicionais/normas-no-tribunal");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível informar o protocolo. Nada foi gravado.") };
    }
  });
}
