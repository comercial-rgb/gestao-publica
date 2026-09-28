"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import {
  cadastrarConsignacao,
  desativarConsignacao,
  redefinirConsignacao,
} from "../../../../lib/portas/consignacoes";

/**
 * AS AÇÕES DO CADASTRO DE CONSIGNAÇÕES (V11 V8.3).
 *
 * ⚠️ NENHUMA REGRA AQUI. Conta analítica, conta de passivo, fundamento mínimo, repetição e o
 * histórico append-only são conferidos DENTRO da transação — e a recusa do domínio sobe INTEIRA,
 * porque é ela que LISTA as analíticas sob uma conta sintética. Resumi-la tiraria da pessoa
 * exatamente a informação de que ela precisa para escolher.
 */

export interface EstadoDoAto {
  readonly erro?: string;
  readonly sucesso?: string;
}

const t = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();

async function ato(corpo: () => Promise<string>, padrao: string): Promise<EstadoDoAto> {
  try {
    const sucesso = await corpo();
    revalidatePath("/financeiro/consignacoes");
    return { sucesso };
  } catch (e) {
    return { erro: mensagemDoErro(e, padrao) };
  }
}

export async function cadastrarAction(_p: EstadoDoAto, f: FormData): Promise<EstadoDoAto> {
  return comComandoDoFormulario(f, async () => {
    if (t(f, "codigo") === "") return { erro: "Informe o código da consignação." };
    if (t(f, "descricao") === "") return { erro: "Informe a descrição." };
    if (t(f, "contaPassivoCodigo") === "") return { erro: "Escolha a conta de passivo." };
    if (t(f, "fundamento") === "") return { erro: "Informe a justificativa da conta." };
    return ato(
      () =>
        cadastrarConsignacao({
          codigo: t(f, "codigo").toUpperCase(),
          descricao: t(f, "descricao"),
          contaPassivoCodigo: t(f, "contaPassivoCodigo"),
          fundamento: t(f, "fundamento"),
        }),
      "Não foi possível cadastrar a consignação. Nada foi gravado."
    );
  });
}

export async function redefinirAction(_p: EstadoDoAto, f: FormData): Promise<EstadoDoAto> {
  return comComandoDoFormulario(f, async () => {
    if (t(f, "contaPassivoCodigo") === "") return { erro: "Escolha a nova conta de passivo." };
    if (t(f, "fundamento") === "") return { erro: "Informe a justificativa da troca de conta." };
    return ato(
      () =>
        redefinirConsignacao({
          tipoId: t(f, "tipoId"),
          contaPassivoCodigo: t(f, "contaPassivoCodigo"),
          fundamento: t(f, "fundamento"),
        }),
      "Não foi possível redefinir a conta. Nada foi gravado."
    );
  });
}

export async function desativarAction(_p: EstadoDoAto, f: FormData): Promise<EstadoDoAto> {
  return comComandoDoFormulario(f, async () => {
    if (t(f, "fundamento") === "") return { erro: "Informe a justificativa da desativação." };
    return ato(
      () => desativarConsignacao({ tipoId: t(f, "tipoId"), fundamento: t(f, "fundamento") }),
      "Não foi possível desativar. Nada foi gravado."
    );
  });
}
