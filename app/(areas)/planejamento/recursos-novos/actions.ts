"use server";

import { revalidatePath } from "next/cache";
import { declararDisponibilidadeDeRecursoNovo } from "../../../../lib/portas/creditos";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";

export interface EstadoDeclaracao {
  readonly erro?: string;
  readonly sucesso?: string;
}

const ORIGENS = ["SUPERAVIT_FINANCEIRO", "EXCESSO_ARRECADACAO", "OPERACAO_CREDITO"] as const;
type Origem = (typeof ORIGENS)[number];
const ehOrigem = (v: string): v is Origem => (ORIGENS as readonly string[]).includes(v);

/**
 * Server Action — DECLARA a disponibilidade apurada de uma fonte (TR 4.37).
 *
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI. A action confere FORMA (campo em branco, origem fora da
 * lista, exercício que não é inteiro) e traduz o `FormData` nos tipos da porta. O piso do que já
 * foi usado, a repetição sem diferença e o versionamento são do domínio, lidos por SUM dentro da
 * transação — e a mensagem dele sobe inteira.
 */
export async function declararAction(
  _prev: EstadoDeclaracao,
  formData: FormData
): Promise<EstadoDeclaracao> {
  return comComandoDoFormulario(formData, async () => {
    const fonteId = String(formData.get("fonteId") ?? "").trim();
    const origemBruta = String(formData.get("origem") ?? "").trim();
    const valor = String(formData.get("valor") ?? "").trim();
    const descricao = String(formData.get("descricao") ?? "").trim();
    const exercicio = Number.parseInt(String(formData.get("exercicio") ?? ""), 10);

    if (fonteId === "") return { erro: "Escolha a fonte de recurso." };
    if (!ehOrigem(origemBruta)) return { erro: "Escolha a origem do recurso." };
    if (valor === "") return { erro: "Informe o valor apurado." };
    if (!Number.isInteger(exercicio)) return { erro: "Exercício inválido." };

    let r: { readonly versao: number; readonly anterior: string | null; readonly utilizado: string };
    try {
      r = await declararDisponibilidadeDeRecursoNovo({
        exercicio,
        fonteId,
        origem: origemBruta,
        valor,
        descricao,
      });
    } catch (e) {
      return { erro: e instanceof Error ? e.message : "Não foi possível declarar a disponibilidade." };
    }

    revalidatePath("/planejamento/recursos-novos");
    revalidatePath("/planejamento/creditos-adicionais");

    // ⚠️ A CONFIRMAÇÃO DIZ O QUE MUDOU, e não só "pronto". Quando há versão anterior, quem
    // declarou precisa ver que substituiu um número — é a diferença entre corrigir e sobrescrever
    // sem perceber.
    const qual =
      r.anterior === null
        ? `primeira declaração`
        : `versão ${r.versao}, substituindo ${r.anterior}`;
    return { sucesso: `Disponibilidade declarada (${qual}). Valor já utilizado: ${r.utilizado}.` };
  });
}
