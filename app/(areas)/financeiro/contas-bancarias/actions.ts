"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import {
  acrescentarFonteAoRol,
  declararTitular,
  removerFonteDoRolDaConta,
} from "../../../../lib/portas/entidades-contabeis";
import type { TipoDeAtoDeclarado } from "../../../../lib/portas/entidades-contabeis";

export interface EstadoDoTitular {
  readonly erro?: string;
  readonly sucesso?: string;
}

export async function declararTitularAction(
  _prev: EstadoDoTitular,
  formData: FormData
): Promise<EstadoDoTitular> {
  return comComandoDoFormulario(formData, async () => {
    const contaBancariaId = String(formData.get("contaBancariaId") ?? "").trim();
    const entidadeId = String(formData.get("entidadeId") ?? "").trim();

    try {
      const versao = await declararTitular({
        contaBancariaId,
        entidadeId,
        ato: {
          atoTipo: String(formData.get("atoTipo") ?? "") as TipoDeAtoDeclarado,
          atoNumero: String(formData.get("atoNumero") ?? "").trim(),
          atoAno: Number.parseInt(String(formData.get("atoAno") ?? ""), 10),
          atoDispositivo: String(formData.get("atoDispositivo") ?? "").trim(),
          atoCitacao: String(formData.get("atoCitacao") ?? "").trim(),
        },
      });
      revalidatePath("/financeiro/contas-bancarias");
      return {
        sucesso:
          versao === 1
            ? "Titular declarado. As próximas guias recebidas nesta conta serão atribuídas a esta entidade; as já registradas permanecem inalteradas."
            : `Titular alterado (versão ${String(versao)}). As guias já arrecadadas mantêm o titular vigente na data da arrecadação.`,
      };
    } catch (e) {
      return { erro: e instanceof Error ? e.message : "Não foi possível declarar o titular." };
    }
  });
}

/**
 * O ROL DE FONTES DA CONTA (TR 5.10.2.6) — acrescentar e remover.
 *
 * ⚠️ UM FORMULÁRIO, DUAS OPERAÇÕES, e quem diz qual é o `value` do botão (`operacao`). Dois
 * formulários na mesma linha da conta duplicariam o `data-acao` e o percurso não saberia qual
 * respondeu; dois `data-acao` diferentes por conta multiplicariam a superfície por nada.
 *
 * ⚠️ E A RECUSA DO DOMÍNIO SOBE INTEIRA: é ela que explica por que a última fonte do rol não sai
 * (rol vazio faz o guard voltar à fonte padrão, o oposto de restringir) e por que a fonte padrão
 * não sai. Uma mensagem genérica aqui apagaria justamente o que o operador precisa entender.
 */
export interface EstadoDoRol {
  readonly erro?: string;
  readonly sucesso?: string;
}

export async function rolDeFontesAction(
  _p: EstadoDoRol,
  f: FormData
): Promise<EstadoDoRol> {
  return comComandoDoFormulario(f, async () => {
    const conta = String(f.get("conta") ?? "").trim();
    const operacao = String(f.get("operacao") ?? "").trim();
    if (conta === "") return { erro: "Conta bancária não identificada. Nada foi gravado." };

    try {
      if (operacao === "remover") {
        const fonte = String(f.get("fonteRemover") ?? "").trim();
        if (fonte === "") return { erro: "Escolha a fonte a remover do rol. Nada foi gravado." };
        const sucesso = await removerFonteDoRolDaConta({ contaCodigo: conta, fonteCodigo: fonte });
        revalidatePath("/financeiro/contas-bancarias");
        return { sucesso };
      }
      const fonte = String(f.get("fonte") ?? "").trim();
      if (fonte === "") return { erro: "Escolha a fonte a acrescentar ao rol. Nada foi gravado." };
      const sucesso = await acrescentarFonteAoRol({ contaCodigo: conta, fonteCodigo: fonte });
      revalidatePath("/financeiro/contas-bancarias");
      return { sucesso };
    } catch (e) {
      return {
        erro: mensagemDoErro(e, "Não foi possível alterar o rol de fontes desta conta. Nada foi gravado."),
      };
    }
  });
}
