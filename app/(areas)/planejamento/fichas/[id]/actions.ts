"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
import { formatarMoeda, valorDigitadoEmDecimal } from "../../../../../lib/format/moeda";
import { liberarReservaDaFicha, reservarNaFicha } from "../../../../../lib/portas/operacoes-da-ficha";

/**
 * AS AÇÕES DA DOTAÇÃO NA FICHA (V31): reservar e liberar reserva. A forma é lida aqui; saldo,
 * autorização por unidade e exercício aberto são do serviço do M05. A mensagem dele sobe como veio.
 */

export interface EstadoDaDotacao {
  readonly erro?: string;
  readonly sucesso?: string;
}

const campo = (f: FormData, nome: string): string => String(f.get(nome) ?? "").trim();

export async function reservarAction(_prev: EstadoDaDotacao, formData: FormData): Promise<EstadoDaDotacao> {
  return comComandoDoFormulario(formData, async () => {
    const fichaId = campo(formData, "fichaId");
    const valor = valorDigitadoEmDecimal(campo(formData, "valor"));
    if (valor === "") return { erro: "Informe o valor em reais (ex.: 15.000,00). Nada foi gravado." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(campo(formData, "data"))) return { erro: "Informe a data da reserva. Nada foi gravado." };
    try {
      await reservarNaFicha({ fichaId, valor, historico: campo(formData, "historico"), data: campo(formData, "data") });
      revalidatePath(`/planejamento/fichas/${fichaId}`);
      return { sucesso: `Reserva de ${formatarMoeda(valor).texto} registrada. O saldo disponível da ficha foi reduzido.` };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível reservar.") };
    }
  });
}

export async function liberarReservaAction(_prev: EstadoDaDotacao, formData: FormData): Promise<EstadoDaDotacao> {
  return comComandoDoFormulario(formData, async () => {
    const fichaId = campo(formData, "fichaId");
    try {
      await liberarReservaDaFicha({ fichaId, reservaId: campo(formData, "reservaId"), historico: campo(formData, "historico") });
      revalidatePath(`/planejamento/fichas/${fichaId}`);
      return { sucesso: "Reserva liberada. O saldo voltou a ficar disponível na ficha." };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível liberar a reserva.") };
    }
  });
}
