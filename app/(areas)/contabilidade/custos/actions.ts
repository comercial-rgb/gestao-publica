"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { apropriarCusto, publicarCriterio } from "../../../../lib/portas/custos";

/**
 * SERVER ACTIONS DO CUSTO POR CENTRO (V19/C05).
 *
 * ⚠️ AS LINHAS DO CRITÉRIO SÃO LIDAS DO FORM COMO CONJUNTO, e as vazias são descartadas AQUI. O
 * formulário oferece seis linhas porque um rateio de município cabe em seis; quem usa três deixa
 * três em branco. Descartar no servidor (e não esconder na tela) significa que a soma conferida é a
 * soma do que foi de fato enviado.
 *
 * ⚠️ E A SOMA NÃO É CONFERIDA AQUI. Ela é conferida no domínio (`zPublicarCriterioDeRateioInput`),
 * porque campo de formulário não confere nada — quem chamar a ação direto encontra a mesma régua.
 */

export interface EstadoDoCusto {
  readonly erro?: string;
  readonly sucesso?: string;
}

const LINHAS_DO_CRITERIO = 6;

export async function publicarCriterioAction(
  _prev: EstadoDoCusto,
  formData: FormData
): Promise<EstadoDoCusto> {
  return comComandoDoFormulario(formData, async () => {
    const chave = String(formData.get("chave") ?? "").trim();
    const atoRef = String(formData.get("atoRef") ?? "").trim();
    const vigenteDesdeBruto = String(formData.get("vigenteDesde") ?? "").trim();
    const centroDoResiduoId = String(formData.get("centroDoResiduoId") ?? "").trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(vigenteDesdeBruto)) {
      return { erro: "Informe a data de início da vigência no formato dia/mês/ano." };
    }
    // ⚠️ MEIO-DIA no fuso do ente, e não meia-noite UTC: `new Date("2026-01-01")` é 31/12 aqui, e a
    // vigência começaria um dia antes do que o ato diz.
    const vigenteDesde = new Date(`${vigenteDesdeBruto}T12:00:00.000-03:00`);

    const itens: { centroId: string; percentual: string }[] = [];
    for (let i = 0; i < LINHAS_DO_CRITERIO; i += 1) {
      const centroId = String(formData.get(`centro-${String(i)}`) ?? "").trim();
      const percentual = String(formData.get(`percentual-${String(i)}`) ?? "")
        .trim()
        .replace(",", ".");
      if (centroId === "" && percentual === "") continue;
      if (centroId === "" || percentual === "") {
        return {
          erro:
            `A linha ${String(i + 1)} do rateio está incompleta: informe o centro e o percentual, ` +
            `ou deixe a linha inteira em branco. Nada foi gravado.`,
        };
      }
      if (!/^\d+(\.\d+)?$/.test(percentual)) {
        return {
          erro: `O percentual da linha ${String(i + 1)} não é um número. Use ponto ou vírgula para a casa decimal.`,
        };
      }
      itens.push({ centroId, percentual });
    }
    if (itens.length === 0) {
      return { erro: "Informe ao menos uma linha de rateio: um centro de custo e o percentual dele." };
    }

    try {
      const r = await publicarCriterio({
        chave,
        atoRef,
        vigenteDesde,
        centroDoResiduoId,
        itens,
      });
      revalidatePath("/contabilidade/custos");
      return {
        sucesso:
          `Critério "${chave}" publicado na versão ${String(r.versao)}, com ${String(r.centros)} ` +
          `centro(s) de custo. As versões anteriores continuam gravadas.`,
      };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível publicar o critério de rateio.") };
    }
  });
}

export async function apropriarCustoAction(
  _prev: EstadoDoCusto,
  formData: FormData
): Promise<EstadoDoCusto> {
  return comComandoDoFormulario(formData, async () => {
    const liquidacaoId = String(formData.get("liquidacaoId") ?? "").trim();
    const criterioChave = String(formData.get("criterioChave") ?? "").trim();
    const competenciaBruta = String(formData.get("competencia") ?? "").trim();
    const valorBruto = String(formData.get("valor") ?? "").trim().replace(",", ".");
    const motivo = String(formData.get("motivo") ?? "").trim();

    if (liquidacaoId === "") return { erro: "Escolha a liquidação cujo custo será apropriado." };
    if (criterioChave === "") return { erro: "Escolha o critério de rateio." };
    // A competência é um MÊS: o campo é `month`, e o dia é o primeiro do mês, ao meio-dia do ente.
    if (!/^\d{4}-\d{2}$/.test(competenciaBruta)) {
      return { erro: "Informe a competência do custo (mês e ano)." };
    }
    const competencia = new Date(`${competenciaBruta}-01T12:00:00.000-03:00`);
    if (valorBruto !== "" && !/^\d+(\.\d+)?$/.test(valorBruto)) {
      return { erro: "O valor a apropriar não é um número. Deixe em branco para apropriar tudo o que resta." };
    }

    try {
      // ⚠️ O CAMPO OPCIONAL SE OMITE, e não se passa como `undefined`: com
      // `exactOptionalPropertyTypes` os dois não são a mesma coisa, e "valor ausente" (aproprie o
      // que resta) tem de chegar ao domínio como ausência, nunca como um valor vazio.
      const r = await apropriarCusto(
        valorBruto === ""
          ? { liquidacaoId, criterioChave, competencia, motivo }
          : { liquidacaoId, criterioChave, competencia, motivo, valor: valorBruto }
      );
      revalidatePath("/contabilidade/custos");
      return {
        sucesso:
          `Custo de ${r.valor} apropriado a ${String(r.centros)} centro(s) de custo na competência ` +
          `informada. A despesa não foi lançada novamente, pois já estava reconhecida na liquidação.`,
      };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível apropriar o custo.") };
    }
  });
}
