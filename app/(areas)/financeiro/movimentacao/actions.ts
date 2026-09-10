"use server";

import { revalidatePath } from "next/cache";
import {
  estornarMovimento,
  registrarMovimento,
} from "../../../../lib/portas/tesouraria";

export interface EstadoMovimento {
  readonly erro?: string;
  readonly sucesso?: string;
}

const TIPOS = [
  "DEPOSITO",
  "SAQUE",
  "APLICACAO",
  "RESGATE",
  "RENDIMENTO",
  "TARIFA",
] as const;
type Tipo = (typeof TIPOS)[number];
const ehTipo = (v: string): v is Tipo => (TIPOS as readonly string[]).includes(v);

/**
 * Server Action — registra o movimento bancário e revalida a lista.
 *
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI. Saldo no momento da operação, rol de fontes da conta,
 * contrapartida diferente da própria conta, exercício aberto — tudo é decidido pelo
 * domínio, dentro da transação, e a mensagem de lá volta COMO VEIO. Parafrasear aqui
 * criaria uma segunda explicação para a mesma recusa, e as duas divergiriam.
 *
 * ⚠️ E A DATA É UM DIA CIVIL (`YYYY-MM-DD`), repassado como texto. A porta é quem o
 * ancora num instante — ver `docs/adr/ADR-data-civil-do-ente.md`.
 */
export async function registrarMovimentoAction(
  _prev: EstadoMovimento,
  formData: FormData
): Promise<EstadoMovimento> {
  const contaBancariaId = String(formData.get("conta") ?? "").trim();
  const fonteId = String(formData.get("fonte") ?? "").trim();
  const tipoBruto = String(formData.get("tipo") ?? "");
  const valor = String(formData.get("valor") ?? "").trim();
  const dia = String(formData.get("dia") ?? "").trim();
  const historico = String(formData.get("historico") ?? "").trim();
  const contaContrapartidaId = String(formData.get("contrapartida") ?? "").trim();

  if (!ehTipo(tipoBruto)) return { erro: "Escolha o tipo do movimento." };
  if (contaBancariaId === "") return { erro: "Escolha a conta bancária." };
  // ⚠️ SEM DEFAULT PARA A FONTE. Desde que a conta admite várias, escolher uma por conta
  // do operador seria acertar às vezes e carimbar recurso errado no resto.
  if (fonteId === "") return { erro: "Escolha a fonte de recurso do movimento." };
  if (contaContrapartidaId === "") {
    return { erro: "Escolha a conta contábil de contrapartida." };
  }
  if (dia === "") return { erro: "A data do movimento é obrigatória." };

  try {
    await registrarMovimento({
      contaBancariaId,
      fonteId,
      tipo: tipoBruto,
      valor,
      dia,
      historico,
      contaContrapartidaId,
    });
    revalidatePath("/financeiro/movimentacao");
    return { sucesso: `${tipoBruto} de ${valor} registrado.` };
  } catch (e) {
    return {
      erro: e instanceof Error ? e.message : "Não foi possível registrar o movimento.",
    };
  }
}

export async function estornarMovimentoAction(
  _prev: EstadoMovimento,
  formData: FormData
): Promise<EstadoMovimento> {
  const movimentoId = String(formData.get("movimentoId") ?? "").trim();
  const motivo = String(formData.get("motivo") ?? "").trim();
  const dia = String(formData.get("dia") ?? "").trim();

  if (movimentoId === "") return { erro: "Movimento não informado." };
  if (dia === "") return { erro: "A data do estorno é obrigatória." };

  try {
    await estornarMovimento(movimentoId, motivo, dia);
    revalidatePath("/financeiro/movimentacao");
    return { sucesso: "Movimento estornado." };
  } catch (e) {
    return {
      erro: e instanceof Error ? e.message : "Não foi possível estornar o movimento.",
    };
  }
}
