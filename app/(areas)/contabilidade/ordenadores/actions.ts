"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { declararResponsavelPelaTela, designarOrdenadorPelaTela, encerrarDesignacaoPelaTela } from "../../../../lib/portas/ordenadores";
import { meioDiaCivil } from "../../../../packages/datas/index";

export interface EstadoDoAto {
  readonly erro?: string;
  readonly sucesso?: string;
}

const t = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();
const ROTA = "/contabilidade/ordenadores";

async function ato(corpo: () => Promise<string>, padrao: string): Promise<EstadoDoAto> {
  try {
    const sucesso = await corpo();
    revalidatePath(ROTA);
    return { sucesso };
  } catch (e) {
    return { erro: mensagemDoErro(e, padrao) };
  }
}

export async function designarAction(_p: EstadoDoAto, f: FormData): Promise<EstadoDoAto> {
  return comComandoDoFormulario(f, async () => {
    const escopo = t(f, "escopo") === "UNIDADE_ORCAMENTARIA" ? "UNIDADE_ORCAMENTARIA" : "ENTE";
    const tipo = t(f, "tipoDoAto");
    if (!["NOMEACAO", "DELEGACAO", "SUBSTITUICAO"].includes(tipo)) return { erro: "Escolha o tipo do ato." };
    if (t(f, "vigenteDesde") === "") return { erro: "Informe desde quando a designação vale." };
    return ato(
      () =>
        designarOrdenadorPelaTela({
          cpf: t(f, "cpf"),
          nome: t(f, "nome"),
          escopo,
          unidadeOrcId: escopo === "ENTE" ? null : t(f, "unidadeOrcId") || null,
          tipoDoAto: tipo as "NOMEACAO" | "DELEGACAO" | "SUBSTITUICAO",
          ato: t(f, "ato"),
          vigenteDesde: meioDiaCivil(t(f, "vigenteDesde")),
        }),
      "Não foi possível designar o ordenador. Nada foi gravado."
    );
  });
}

export async function encerrarAction(_p: EstadoDoAto, f: FormData): Promise<EstadoDoAto> {
  return comComandoDoFormulario(f, async () => {
    if (t(f, "vigenteAte") === "") return { erro: "Informe o último dia da designação." };
    return ato(
      () => encerrarDesignacaoPelaTela({ designacaoId: t(f, "designacaoId"), vigenteAte: meioDiaCivil(t(f, "vigenteAte")), ato: t(f, "ato") }),
      "Não foi possível encerrar a designação. Nada foi gravado."
    );
  });
}

export async function responsavelAction(_p: EstadoDoAto, f: FormData): Promise<EstadoDoAto> {
  return comComandoDoFormulario(f, async () => {
    const modalidade = t(f, "modalidade") === "PROPRIA" ? "PROPRIA" : "TERCEIRIZADA";
    if (t(f, "vigenteDesde") === "") return { erro: "Informe desde quando vale." };
    return ato(
      () =>
        declararResponsavelPelaTela({
          modalidade,
          cnpjEmpresa: t(f, "cnpjEmpresa"),
          nomeEmpresa: t(f, "nomeEmpresa"),
          telefoneEmpresa: t(f, "telefoneEmpresa"),
          emailEmpresa: t(f, "emailEmpresa"),
          denominacaoSiafic: t(f, "denominacaoSiafic"),
          cpfResponsavelTecnico: t(f, "cpfResponsavelTecnico"),
          nomeResponsavelTecnico: t(f, "nomeResponsavelTecnico"),
          emailResponsavelTecnico: t(f, "emailResponsavelTecnico"),
          telefoneResponsavelTecnico: t(f, "telefoneResponsavelTecnico"),
          fundamento: t(f, "fundamento"),
          vigenteDesde: meioDiaCivil(t(f, "vigenteDesde")),
        }),
      "Não foi possível declarar o responsável. Nada foi gravado."
    );
  });
}
