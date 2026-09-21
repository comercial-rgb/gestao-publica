import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { diaCivil } from "../../packages/datas/index.js";
import {
  agendarPeloPortal,
  cancelarPeloPortal,
  consultarReservaPeloSegredo,
  reagendarPeloPortal,
  guichesAbertosAoPortal,
  ofertaDoGuiche,
  type GuicheParaOCidadao,
  type ReservaParaOCidadao,
} from "../../modules/m21-protocolo/servico-guiche.js";
import { cliente } from "./cliente";

/**
 * ═══ O AGENDAMENTO PELO CIDADÃO — A PORTA PÚBLICA (V11 V8.1, TR 5.39.92) ═══
 *
 * ⚠️ SEM SESSÃO, e é o ponto: a seção 5.39 do TR é o portal de AUTOATENDIMENTO. Não há
 * `comEscritaAutenticada` aqui — não há usuário a autorizar. O que protege está no domínio
 * (`agendarPeloPortal`), em camadas: serviço aberto ao portal, capacidade sob o mesmo trinco,
 * quota por origem, um atendimento vivo por documento e o segredo guardado só por hash.
 *
 * ⚠️ ESTA PORTA NÃO DECIDE NADA. Ela resolve o que exige servidor — a chave de quota, que sai do
 * cabeçalho da requisição — e encaminha. Uma regra escrita aqui ficaria fora da transação, e
 * portanto fora do que o banco garante.
 */

export type { GuicheParaOCidadao, ReservaParaOCidadao };

/**
 * A CHAVE DE QUOTA — dia civil + origem declarada + finalidade, em sha256.
 *
 * ⚠️ É CONTENÇÃO LOCAL, E ESTÁ DITO COMO TAL. Atrás de proxy, `x-forwarded-for` é o que há; ele
 * se falsifica. O antifraude de verdade é o reCAPTCHA da cláusula 5.39.102, que depende de
 * provedor externo e está marcado `DEPENDENCIA_EXTERNA` no catálogo — não se substitui uma
 * integração ausente por um retorno de sucesso local.
 */
async function chaveDeQuota(finalidade: string): Promise<string> {
  const h = await headers();
  const origem = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "sem-origem-declarada";
  return createHash("sha256").update(`${diaCivil(new Date())}|${origem}|${finalidade}`).digest("hex");
}

/** Onde o cidadão pode marcar — guichês com ao menos um serviço aberto ao portal. */
export async function lerGuichesAbertos(): Promise<readonly GuicheParaOCidadao[]> {
  return guichesAbertosAoPortal(cliente());
}

export interface HorarioPublico {
  readonly hora: string;
  readonly livres: number;
}

export interface OfertaPublica {
  readonly fechado: { readonly motivo: string } | null;
  readonly horarios: readonly HorarioPublico[];
}

/**
 * OS HORÁRIOS DE UM DIA, como o cidadão os vê.
 *
 * ⚠️ SÓ O QUE TEM VAGA, E SEM A CAPACIDADE. Quantos lugares o guichê tem por horário é
 * organização interna; ao cidadão interessa se cabe ele. Publicar a capacidade e a ocupação
 * deixaria qualquer um medir o movimento do atendimento do município — e não ajuda ninguém a
 * marcar.
 */
export async function lerHorariosPublicos(p: {
  readonly guicheId: string;
  readonly dia: string;
}): Promise<OfertaPublica> {
  const o = await ofertaDoGuiche(cliente(), p);
  return {
    fechado: o.fechado,
    horarios: o.horarios.filter((h) => h.livres > 0).map((h) => ({ hora: h.hora, livres: h.livres })),
  };
}

/**
 * MARCA — e devolve o código e o segredo. O segredo sai daqui UMA vez e não é relido de lugar
 * nenhum: o banco tem só o hash dele.
 */
export async function agendarPublico(input: {
  readonly guicheId: string;
  readonly servicoId: string;
  readonly nome: string;
  readonly documento: string;
  readonly dia: string;
  readonly horaInicio: string;
}): Promise<{ readonly codigo: string; readonly segredo: string }> {
  return agendarPeloPortal(cliente(), { ...input, chaveDeQuota: await chaveDeQuota("AGENDAMENTO") });
}

/** O que o segredo abre — `null` para segredo errado E para segredo inexistente, igualmente. */
export async function consultarPorSegredo(segredo: string): Promise<ReservaParaOCidadao | null> {
  return consultarReservaPeloSegredo(cliente(), segredo);
}

/**
 * O CIDADÃO REMARCA a própria marcação, no mesmo guichê (V11 V8.5).
 *
 * ⚠️ É UM ATO SÓ, e é o ponto: com "cancele e marque de novo", entre os dois atos o lugar volta
 * para a fila e outra pessoa pode tomá-lo — quem só queria mudar de horário ficava sem nenhum.
 */
export async function remarcarPublico(input: {
  readonly segredo: string;
  readonly dia: string;
  readonly horaInicio: string;
}): Promise<string> {
  const r = await reagendarPeloPortal(cliente(), input);
  const br = (d: string): string => d.split("-").reverse().join("/");
  return (
    `Remarcado de ${br(r.de.dia)} às ${r.de.hora} para ${br(input.dia)} às ${input.horaInicio}. ` +
    `O seu número de atendimento continua ${r.codigo}.`
  );
}

/** O cidadão cancela a própria marcação, com o motivo dele. */
export async function cancelarPublico(input: {
  readonly segredo: string;
  readonly motivo: string;
}): Promise<string> {
  const r = await cancelarPeloPortal(cliente(), input);
  return `Marcação ${r.codigo} cancelada. O horário voltou a ficar livre para outra pessoa.`;
}
