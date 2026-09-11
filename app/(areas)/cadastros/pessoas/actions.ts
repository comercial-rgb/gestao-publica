"use server";

import { revalidatePath } from "next/cache";
import {
  registrarAlteracaoDePessoa,
  registrarMovimentoDePapel,
  registrarPessoa,
  type PapelDePessoa,
} from "../../../../lib/portas/pessoas";
import { meioDiaCivil } from "../../../../packages/datas/index";

/**
 * Server Actions do cadastro de pessoas.
 *
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI. A action traduz `FormData` (tudo string) nos tipos da
 * porta e devolve o erro do domínio COMO ELE VEIO — dígito verificador, documento
 * duplicado, papel já vigente. Paráfrase na borda vira uma segunda mensagem que diverge
 * da primeira no dia em que a regra mudar.
 *
 * ⚠️ O `criadoPor` NÃO VEM DO FORMULÁRIO. Ele é injetado por `comEscritaAutenticada`, a
 * partir da sessão. Um campo escondido com o autor seria autorização por campo de
 * formulário — exatamente o que o ENT01 §2.1 proíbe.
 */

export interface EstadoPessoa {
  readonly erro?: string;
  readonly sucesso?: string;
}

const PAPEIS = ["CREDOR", "CONSIGNATARIO", "SERVIDOR", "REPRESENTANTE"] as const;
const ehPapel = (v: string): v is PapelDePessoa =>
  (PAPEIS as readonly string[]).includes(v);

/** Campo de texto opcional: vazio vira `undefined`, nunca `""`. */
function opcional(formData: FormData, campo: string): string | undefined {
  const v = String(formData.get(campo) ?? "").trim();
  return v === "" ? undefined : v;
}

function camposCadastrais(formData: FormData) {
  return {
    nome: String(formData.get("nome") ?? "").trim(),
    nomeFantasia: opcional(formData, "nomeFantasia"),
    email: opcional(formData, "email"),
    telefone: opcional(formData, "telefone"),
    logradouro: opcional(formData, "logradouro"),
    numero: opcional(formData, "numero"),
    complemento: opcional(formData, "complemento"),
    bairro: opcional(formData, "bairro"),
    municipio: opcional(formData, "municipio"),
    uf: opcional(formData, "uf"),
    cep: opcional(formData, "cep"),
  };
}

function mensagem(erro: unknown): string {
  return erro instanceof Error ? erro.message : "Falha ao gravar.";
}

export async function cadastrarPessoaAction(
  _prev: EstadoPessoa,
  formData: FormData
): Promise<EstadoPessoa> {
  const documento = String(formData.get("documento") ?? "").trim();

  try {
    const id = await registrarPessoa({ documento, ...camposCadastrais(formData) });
    revalidatePath("/cadastros/pessoas");
    return { sucesso: `Pessoa cadastrada (${id}).` };
  } catch (erro) {
    return { erro: mensagem(erro) };
  }
}

export async function alterarPessoaAction(
  _prev: EstadoPessoa,
  formData: FormData
): Promise<EstadoPessoa> {
  const pessoaId = String(formData.get("pessoaId") ?? "").trim();
  const motivo = String(formData.get("motivo") ?? "").trim();
  // A caixa desmarcada não vem no FormData — ausência é `false`, e não "não mexeu".
  const ativa = formData.get("ativa") !== null;

  try {
    await registrarAlteracaoDePessoa({
      pessoaId,
      ativa,
      motivo,
      ...camposCadastrais(formData),
    });
    revalidatePath("/cadastros/pessoas");
    revalidatePath(`/cadastros/pessoas/${pessoaId}`);
    return { sucesso: "Alteração registrada — a versão anterior continua no histórico." };
  } catch (erro) {
    return { erro: mensagem(erro) };
  }
}

export async function moverPapelAction(
  _prev: EstadoPessoa,
  formData: FormData
): Promise<EstadoPessoa> {
  const pessoaId = String(formData.get("pessoaId") ?? "").trim();
  const papelBruto = String(formData.get("papel") ?? "");
  const movimentoBruto = String(formData.get("movimento") ?? "");
  const dataBruta = String(formData.get("data") ?? "").trim();

  if (!ehPapel(papelBruto)) {
    return { erro: `Papel inválido: "${papelBruto}".` };
  }
  if (movimentoBruto !== "CONCEDIDO" && movimentoBruto !== "ENCERRADO") {
    return { erro: `Movimento inválido: "${movimentoBruto}".` };
  }
  if (dataBruta === "") {
    // ⚠️ A DATA VEM DO FORMULÁRIO, nunca de `new Date()`. É a data do ATO — conceder hoje
    // um papel que vigora desde janeiro é uma coisa; carimbar janeiro como hoje é outra.
    return { erro: "Informe a data do ato." };
  }
  const data = meioDiaCivil(dataBruta);
  if (Number.isNaN(data.getTime())) {
    return { erro: `Data inválida: "${dataBruta}".` };
  }

  try {
    await registrarMovimentoDePapel({
      pessoaId,
      papel: papelBruto,
      movimento: movimentoBruto,
      data,
      motivo: opcional(formData, "motivo"),
    });
    revalidatePath(`/cadastros/pessoas/${pessoaId}`);
    revalidatePath("/cadastros/pessoas");
    return {
      sucesso:
        movimentoBruto === "CONCEDIDO" ? "Papel concedido." : "Papel encerrado.",
    };
  } catch (erro) {
    return { erro: mensagem(erro) };
  }
}
