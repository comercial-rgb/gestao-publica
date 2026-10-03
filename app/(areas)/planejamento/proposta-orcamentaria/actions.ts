"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { formatarMoeda, valorDigitadoEmDecimal } from "../../../../lib/format/moeda";
import {
  abrirExercicioPelaTela,
  ajustarLinha,
  efetivarProposta,
  elaborarProposta,
} from "../../../../lib/portas/proposta-orcamentaria";

/**
 * SERVER ACTIONS DA PROPOSTA ORÇAMENTÁRIA (V29).
 *
 * A forma é lida aqui; as regras (exercício posterior, proposta não efetivada, destino aberto e vazio,
 * permissão por unidade) são do caso de uso, no servidor. A mensagem dele sobe como veio.
 */

export interface EstadoDaProposta {
  readonly erro?: string;
  readonly sucesso?: string;
  readonly propostaOrcamentariaId?: string;
}

const ROTA = "/planejamento/proposta-orcamentaria";

const campo = (f: FormData, nome: string): string => String(f.get(nome) ?? "").trim();

export async function elaborarPropostaAction(_prev: EstadoDaProposta, formData: FormData): Promise<EstadoDaProposta> {
  return comComandoDoFormulario(formData, async () => {
    try {
      const r = await elaborarProposta({
        exercicio: campo(formData, "exercicio"),
        exercicioDeOrigem: campo(formData, "exercicioDeOrigem"),
        descricao: campo(formData, "descricao"),
        baseDaReceita: campo(formData, "baseDaReceita") as "PREVISAO_INICIAL",
        percentualDaReceita: campo(formData, "percentualDaReceita") || "0",
        baseDaDespesa: campo(formData, "baseDaDespesa") as "DOTACAO_INICIAL",
        percentualDaDespesa: campo(formData, "percentualDaDespesa") || "0",
        // Caixa de seleção desmarcada não vai no formulário: ausência é "não".
        aproveitaReceitas: formData.get("aproveitaReceitas") === "on",
        aproveitaFichas: formData.get("aproveitaFichas") === "on",
        reajustaProjetos: formData.get("reajustaProjetos") === "on",
        incluiFichasAbertasPorCredito: formData.get("incluiFichasAbertasPorCredito") === "on",
      });
      revalidatePath(ROTA);
      return {
        sucesso:
          `Proposta criada: ${String(r.linhasDeReceita)} receita(s) e ${String(r.linhasDeDespesa)} ficha(s) importadas.` +
          (r.fichasAbertasPorCreditoDeixadas > 0
            ? ` ${String(r.fichasAbertasPorCreditoDeixadas)} ficha(s) criada(s) no exercício por crédito ou com recurso de exercício anterior ficaram de fora.`
            : ""),
        propostaOrcamentariaId: r.id,
      };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível criar a proposta.") };
    }
  });
}

export async function ajustarLinhaAction(_prev: EstadoDaProposta, formData: FormData): Promise<EstadoDaProposta> {
  return comComandoDoFormulario(formData, async () => {
    const propostaOrcamentariaId = campo(formData, "propostaOrcamentariaId");
    const lado = campo(formData, "lado");
    const linhaId = campo(formData, "linhaId");
    // O que a pessoa digita (1.250.000,00) vira string decimal aqui; o domínio só aceita a forma limpa.
    const valor = valorDigitadoEmDecimal(campo(formData, "valor"));
    if (lado !== "RECEITA" && lado !== "DESPESA") return { erro: "Linha não identificada. Nada foi gravado." };
    if (valor === "") return { erro: "Informe o valor em reais (ex.: 1.250.000,00). Nada foi gravado." };
    try {
      await ajustarLinha({ propostaOrcamentariaId, lado, linhaId, valor, motivo: campo(formData, "motivo") });
      revalidatePath(`${ROTA}/${propostaOrcamentariaId}`);
      return { sucesso: `Valor alterado para ${formatarMoeda(valor).texto}.` };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível alterar a linha.") };
    }
  });
}

export async function efetivarPropostaAction(_prev: EstadoDaProposta, formData: FormData): Promise<EstadoDaProposta> {
  return comComandoDoFormulario(formData, async () => {
    const propostaOrcamentariaId = campo(formData, "propostaOrcamentariaId");
    try {
      const r = await efetivarProposta(propostaOrcamentariaId);
      revalidatePath(`${ROTA}/${propostaOrcamentariaId}`);
      revalidatePath(ROTA);
      revalidatePath("/planejamento/fichas");
      revalidatePath("/planejamento/receita-prevista");
      revalidatePath("/planejamento/loa");
      return {
        sucesso:
          `Orçamento de ${String(r.exercicio)} gerado: ${String(r.fichasCriadas)} ficha(s) e ` +
          `${String(r.receitasCriadas)} receita(s) prevista(s). Daqui em diante, alterações são crédito adicional ou realocação.`,
      };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível gerar o orçamento.") };
    }
  });
}

export async function abrirExercicioAction(_prev: EstadoDaProposta, formData: FormData): Promise<EstadoDaProposta> {
  return comComandoDoFormulario(formData, async () => {
    const ano = Number(campo(formData, "ano"));
    const propostaOrcamentariaId = campo(formData, "propostaOrcamentariaId");
    if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) return { erro: "Exercício inválido. Nada foi gravado." };
    try {
      await abrirExercicioPelaTela(ano);
      if (propostaOrcamentariaId !== "") revalidatePath(`${ROTA}/${propostaOrcamentariaId}`);
      return { sucesso: `Exercício ${String(ano)} aberto.` };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível abrir o exercício.") };
    }
  });
}
