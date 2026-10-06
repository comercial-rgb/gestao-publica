"use server";

import { revalidatePath } from "next/cache";
import { registrarLiquidacao } from "../../../../lib/portas/liquidacao";
import { meioDiaCivil } from "../../../../packages/datas/index";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { formatarMoeda } from "../../../../lib/format/moeda";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
export interface EstadoLiquidacao {
  readonly erro?: string;
  readonly sucesso?: string;
}

/**
 * Server Action — liquida e revalida a lista.
 *
 * ⚠️ O ERRO DO DOMÍNIO SOBE INTEIRO. Se o empenho é de um elemento sem regra de roteiro
 * (fora de {30, 39, 71}), a mensagem que aparece é a do M01 — nomeando o elemento e a
 * pendência MAPA-ELEMENTO-CONTA. A tela NÃO esconde nem contorna: "não foi possível
 * liquidar" mandaria o usuário abrir um chamado para descobrir o que o sistema já sabe.
 *
 * ⚠️ A DATA VEM DO FORM: é a data do FATO (o recebimento atestado), e é ela que ordena
 * a fila do art. 141. Um `now()` implícito reordenaria a fila.
 */
type EntradaLida = {
  readonly classeDeMaterialId: string;
  readonly valor: string;
  readonly fisica?: {
    readonly materialId: string;
    readonly depositoId: string;
    readonly quantidade: string;
    readonly valorUnitario: string;
    readonly loteIdentificacao?: string | undefined;
    readonly loteValidade?: Date | undefined;
    readonly recebimentoDeItemId?: string | undefined;
  };
};

/** As linhas `entradas.N.*` do formulário, na ordem dos índices. (Não exportada: arquivo "use server" só exporta ações.) */
function lerEntradas(formData: FormData): EntradaLida[] {
  const indices = new Set<number>();
  for (const k of formData.keys()) {
    const m = /^entradas\.(\d+)\./.exec(k);
    if (m !== null) indices.add(Number(m[1]));
  }
  const saida: EntradaLida[] = [];
  for (const i of [...indices].sort((a, b) => a - b)) {
    const campo = (nome: string): string => texto(formData, `entradas.${i}.${nome}`);
    const classeDeMaterialId = campo("classeDeMaterialId");
    const valor = campo("valor");
    if (classeDeMaterialId === "" && valor === "") continue;
    const materialId = campo("materialId");
    const depositoId = campo("depositoId");
    const lote = campo("loteIdentificacao");
    const validade = campo("loteValidade");
    const recebimento = campo("recebimentoDeItemId");
    saida.push({
      classeDeMaterialId,
      valor,
      ...(materialId !== "" || depositoId !== ""
        ? {
            fisica: {
              materialId,
              depositoId,
              quantidade: campo("quantidade"),
              valorUnitario: campo("valorUnitario"),
              ...(lote !== "" ? { loteIdentificacao: lote } : {}),
              ...(validade !== "" ? { loteValidade: meioDiaCivil(validade) } : {}),
              ...(recebimento !== "" ? { recebimentoDeItemId: recebimento } : {}),
            },
          }
        : {}),
    });
  }
  return saida;
}

const texto = (f: FormData, campo: string): string => String(f.get(campo) ?? "").trim();

export async function liquidarAction(
  _prev: EstadoLiquidacao,
  formData: FormData
): Promise<EstadoLiquidacao> {
  return comComandoDoFormulario(formData, async () => {
    const empenhoId = String(formData.get("empenhoId") ?? "").trim();
    const numero = String(formData.get("numero") ?? "").trim();
    const valor = String(formData.get("valor") ?? "").trim();
    const responsavelAtesto = String(formData.get("atesto") ?? "").trim();
    const historico = String(formData.get("historico") ?? "").trim();
    const dataBruta = String(formData.get("data") ?? "").trim();
    const documentoFiscalId = String(formData.get("documentoFiscalId") ?? "").trim();

    if (empenhoId === "") return { erro: "Escolha o empenho a liquidar." };
    if (dataBruta === "") return { erro: "A data da liquidação é obrigatória." };

    // ⚠️ V4 (§6) — AS ENTRADAS DE MATERIAL, uma linha por classe: `entradas.N.campo`. Linha sem
    // classe e sem valor é ignorada (a tela oferece linhas vazias); a perna física só vai quando
    // material e depósito foram informados. Quem exige e confere é o domínio, dentro da transação.
    const entradasDeMaterial = lerEntradas(formData);

    try {
      await registrarLiquidacao({
        empenhoId,
        numero,
        valor,
        data: meioDiaCivil(dataBruta),
        responsavelAtesto,
        historico,
        ...(documentoFiscalId !== "" ? { documentoFiscalId } : {}),
        ...(entradasDeMaterial.length > 0 ? { entradasDeMaterial } : {}),
      });
      revalidatePath("/despesa/liquidacoes");
      // A fila do art. 141 nasce da liquidação — a tela dela também muda.
      revalidatePath("/despesa/pagamentos");
      revalidatePath("/despesa/empenhos");
      if (documentoFiscalId !== "") revalidatePath("/licitacoes/documentos-fiscais");
      return { sucesso: `Liquidação ${numero} registrada no valor de R$ ${formatarMoeda(valor).texto}.` };
    } catch (e) {
      return { erro: e instanceof Error ? mensagemDoErro(e, "") : "Não foi possível liquidar." };
    }
  });
}
