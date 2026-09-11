"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { AUDITORIAS } from "../../../../lib/portas/recursos/definicoes";
import { acaoDaAuditoria, criarAuditoria } from "../../../../lib/portas/recursos/dados";

/**
 * A SERVER ACTION DO CADASTRO DE AUDITORIAS — uma só, e ela despacha pelo `__acao`.
 *
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI, e a mensagem do domínio sobe COMO VEIO. Saldo do termo,
 * empenho obrigatório para o concedente, idempotência da parcela, período aberto — tudo é
 * decidido dentro da transação. Parafrasear aqui criaria uma segunda explicação para a mesma
 * recusa, e as duas divergiriam no dia em que o guard aprendesse um caso novo.
 *
 * ⚠️ E O DESPACHO É FAIL-CLOSED: `__acao` desconhecido ESTOURA, em vez de cair num caminho
 * feliz que diria "salvo" sem ter gravado nada.
 */
export async function acaoDeAuditoriaAction(
  _prev: EstadoDoMolde,
  formData: FormData
): Promise<EstadoDoMolde> {
  const campos: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string") campos[k] = v;
  }
  const acao = campos["__acao"] ?? "";
  const id = campos["__id"] ?? "";

  try {
    if (acao === "criar") {
      await criarAuditoria(campos);
    } else {
      if (id === "") return { erro: "Registro não identificado. Nada foi gravado." };
      await acaoDaAuditoria(acao, id, campos);
    }
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha ao gravar. Nada foi gravado." };
  }

  revalidatePath(AUDITORIAS.rota);
  if (id !== "") revalidatePath(`${AUDITORIAS.rota}/${id}`);
  return { sucesso: acao === "criar" ? "Auditoria aberta." : "Registro gravado." };
}
