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
  incluirFicha,
  incluirReceita,
  previaDoReajuste,
  reajustarLinhas,
  type RecorteDoReajuste,
  type ResultadoDoReajuste,
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
  /** V38 — a prévia do reajuste em lote, quando a pessoa pede antes de aplicar. */
  readonly previa?: ResultadoDoReajuste;
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

// ── V38 — incluir ficha, incluir receita e reajustar em lote (com prévia).

const ou = (f: FormData, nome: string): string | undefined => {
  const v = campo(f, nome);
  return v === "" ? undefined : v;
};

export async function incluirFichaAction(_prev: EstadoDaProposta, formData: FormData): Promise<EstadoDaProposta> {
  return comComandoDoFormulario(formData, async () => {
    const propostaOrcamentariaId = campo(formData, "propostaOrcamentariaId");
    const valor = valorDigitadoEmDecimal(campo(formData, "valor"));
    if (valor === "") return { erro: "Informe o valor em reais (ex.: 50.000,00). Nada foi gravado." };
    try {
      await incluirFicha({
        propostaOrcamentariaId,
        classificacao: {
          unidadeOrc: campo(formData, "unidadeOrc"), funcao: campo(formData, "funcao"), subfuncao: campo(formData, "subfuncao"), programa: campo(formData, "programa"),
          acao: campo(formData, "acao"), naturezaDespesa: campo(formData, "naturezaDespesa"), fonte: campo(formData, "fonte"), co: campo(formData, "co"),
        },
        valor,
        motivo: campo(formData, "motivo"),
      });
      revalidatePath(`${ROTA}/${propostaOrcamentariaId}`);
      return { sucesso: `Ficha nova incluída na proposta com ${formatarMoeda(valor).texto}. Ela recebe o número ao gerar o orçamento.` };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível incluir a ficha.") };
    }
  });
}

export async function incluirReceitaAction(_prev: EstadoDaProposta, formData: FormData): Promise<EstadoDaProposta> {
  return comComandoDoFormulario(formData, async () => {
    const propostaOrcamentariaId = campo(formData, "propostaOrcamentariaId");
    const valor = valorDigitadoEmDecimal(campo(formData, "valor"));
    if (valor === "") return { erro: "Informe o valor em reais (ex.: 70.000,00). Nada foi gravado." };
    const tipo = campo(formData, "tipoReceita");
    if (tipo !== "ORCAMENTARIA" && tipo !== "INTRA_ORCAMENTARIA" && tipo !== "DEDUCAO") return { erro: "Escolha o tipo da receita. Nada foi gravado." };
    try {
      await incluirReceita({ propostaOrcamentariaId, naturezaReceita: campo(formData, "naturezaReceita"), fonte: campo(formData, "fonte"), tipoReceita: tipo, valor, motivo: campo(formData, "motivo") });
      revalidatePath(`${ROTA}/${propostaOrcamentariaId}`);
      return { sucesso: `Receita nova incluída na proposta com ${formatarMoeda(valor).texto}.` };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível incluir a receita.") };
    }
  });
}

/** A leitura dos campos do reajuste, igual para a prévia e para a aplicação. */
function pedidoDoReajuste(formData: FormData): { readonly erro: string } | { readonly propostaOrcamentariaId: string; readonly lado: "RECEITA" | "DESPESA"; readonly percentual: string; readonly recorte: RecorteDoReajuste } {
  const propostaOrcamentariaId = campo(formData, "propostaOrcamentariaId");
  const ladoBruto = campo(formData, "lado");
  if (ladoBruto !== "RECEITA" && ladoBruto !== "DESPESA") return { erro: "Escolha receitas ou despesas. Nada foi gravado." };
  const lado: "RECEITA" | "DESPESA" = ladoBruto;
  const tipoDaAcao = ou(formData, "tipoDaAcao");
  const tipoReceita = ou(formData, "tipoReceita");
  const recorte: RecorteDoReajuste = {
    fonte: ou(formData, "fonte"),
    unidadeOrc: ou(formData, "unidadeOrc"),
    naturezaPrefixo: ou(formData, "naturezaPrefixo"),
    tipoDaAcao: tipoDaAcao === "ATIVIDADE" || tipoDaAcao === "PROJETO" || tipoDaAcao === "OPERACAO_ESPECIAL" ? tipoDaAcao : undefined,
    tipoReceita: tipoReceita === "ORCAMENTARIA" || tipoReceita === "INTRA_ORCAMENTARIA" || tipoReceita === "DEDUCAO" ? tipoReceita : undefined,
  };
  return { propostaOrcamentariaId, lado, percentual: campo(formData, "percentual"), recorte };
}

/**
 * A PRÉVIA só lê, e por isso NÃO passa pela chave de comando: o mesmo formulário envia a prévia e, em seguida, a
 * aplicação; com a chave, a segunda submissão seria tomada por repetição da primeira e nada seria gravado (medido
 * no percurso V38: "aplicado: null").
 */
export async function previaReajusteAction(_prev: EstadoDaProposta, formData: FormData): Promise<EstadoDaProposta> {
  const pedido = pedidoDoReajuste(formData);
  if ("erro" in pedido) return pedido;
  try {
    const previa = await previaDoReajuste(pedido);
    return { previa, sucesso: previa.linhas === 0 ? "Nenhuma linha no recorte: nada seria reajustado." : `Prévia: ${String(previa.linhas)} linha(s), de ${formatarMoeda(previa.totalAntes).texto} para ${formatarMoeda(previa.totalDepois).texto}. Nada foi gravado ainda.` };
  } catch (e) {
    return { erro: mensagemDoErro(e, "Não foi possível calcular a prévia.") };
  }
}

/** APLICAR o reajuste: grava um ajuste por linha do recorte, com o motivo. */
export async function reajustarAction(_prev: EstadoDaProposta, formData: FormData): Promise<EstadoDaProposta> {
  return comComandoDoFormulario(formData, async () => {
    const pedido = pedidoDoReajuste(formData);
    if ("erro" in pedido) return pedido;
    try {
      const r = await reajustarLinhas({ ...pedido, motivo: campo(formData, "motivo") });
      revalidatePath(`${ROTA}/${pedido.propostaOrcamentariaId}`);
      return { sucesso: `Reajuste aplicado em ${String(r.linhas)} linha(s): de ${formatarMoeda(r.totalAntes).texto} para ${formatarMoeda(r.totalDepois).texto}.` };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível reajustar.") };
    }
  });
}
