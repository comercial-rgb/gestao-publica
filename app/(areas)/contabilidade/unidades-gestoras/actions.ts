"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { cadastrarUgPelaTela, encerrarUgPelaTela } from "../../../../lib/portas/unidades-gestoras";
import { meioDiaCivil } from "../../../../packages/datas/index";

export interface EstadoDaUg {
  readonly erro?: string;
  readonly sucesso?: string;
}

const t = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();
const NATUREZAS = ["CAMARA_MUNICIPAL", "PREFEITURA_OU_SECRETARIA", "AUTARQUIA", "FUNDACAO", "SOCIEDADE_DE_ECONOMIA_MISTA", "FUNDO", "EMPRESA_PUBLICA", "AUTARQUIA_PREVIDENCIARIA", "FUNDO_PREVIDENCIARIO"] as const;

async function ato(corpo: () => Promise<string>, padrao: string): Promise<EstadoDaUg> {
  try {
    const sucesso = await corpo();
    revalidatePath("/contabilidade/unidades-gestoras");
    return { sucesso };
  } catch (e) {
    return { erro: mensagemDoErro(e, padrao) };
  }
}

export async function cadastrarUgAction(_p: EstadoDaUg, f: FormData): Promise<EstadoDaUg> {
  return comComandoDoFormulario(f, async () => {
    const natureza = NATUREZAS.find((n) => n === t(f, "naturezaJuridica"));
    if (natureza === undefined) return { erro: "Escolha a natureza jurídica." };
    if (t(f, "vigenteDesde") === "") return { erro: "Informe desde quando a unidade gestora vale." };
    return ato(
      () =>
        cadastrarUgPelaTela({
          codigoTce: t(f, "codigoTce"),
          nome: t(f, "nome"),
          cnpj: t(f, "cnpj") || null,
          naturezaJuridica: natureza,
          entidadeContabilId: t(f, "entidadeContabilId") || null,
          vigenteDesde: meioDiaCivil(t(f, "vigenteDesde")),
          fundamento: t(f, "fundamento"),
        }),
      "Não foi possível cadastrar a unidade gestora. Nada foi gravado."
    );
  });
}

export async function encerrarUgAction(_p: EstadoDaUg, f: FormData): Promise<EstadoDaUg> {
  return comComandoDoFormulario(f, async () => {
    if (t(f, "vigenteAte") === "") return { erro: "Informe o último dia da unidade gestora." };
    return ato(() => encerrarUgPelaTela({ ugId: t(f, "ugId"), vigenteAte: meioDiaCivil(t(f, "vigenteAte")), ato: t(f, "ato") }), "Não foi possível encerrar. Nada foi gravado.");
  });
}
