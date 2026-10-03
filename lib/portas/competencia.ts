import { janelaCivilDoMes } from "../../packages/datas/index";
import { derivarTravamento, type EventoDeTravamento } from "../../modules/m16-travamento/dominio";

/**
 * A COMPETÊNCIA TRAVADA, PARA O CABEÇALHO (V31) — a porta fina sobre a derivação do M16.
 *
 * ⚠️ É A MESMA `derivarTravamento` DO GUARD `exigirCompetenciaDestravada`, que roda dentro de todo
 * lançamento no razão. O cabeçalho mostra a resposta que o guard daria; reescrever a regra aqui seria a
 * segunda verdade sobre o que está fechado. Puro: os eventos chegam lidos pela porta de contexto.
 */
export type { EventoDeTravamento };

/**
 * A SITUAÇÃO DA COMPETÊNCIA para quem está na tela: travada se o guard recusaria um lançamento deste
 * usuário no instante dado. É `derivarTravamento` — a mesma função do guard — e não uma releitura.
 */
export function competenciaTravadaEm(
  eventos: readonly EventoDeTravamento[],
  instante: Date,
  usuario: string
): { readonly escopo: "GLOBAL" | "USUARIO"; readonly travadoPor: string } | null {
  const t = derivarTravamento(eventos, instante, usuario);
  return t === null ? null : { escopo: t.escopo, travadoPor: t.travadoPor };
}

/**
 * OS MESES TRAVADOS de um exercício para o usuário: o mês conta como travado quando o primeiro E o
 * último instante civis dele estão travados (uma trava por data que cobre só parte do mês não fecha a
 * competência inteira, e dizer "travado" seria prometer mais do que o guard faz).
 */
export function mesesTravados(eventos: readonly EventoDeTravamento[], ano: number, usuario: string): readonly number[] {
  const meses: number[] = [];
  for (let mes = 1; mes <= 12; mes++) {
    const { inicio, fim } = janelaCivilDoMes(`${String(ano)}-${String(mes).padStart(2, "0")}`);
    if (derivarTravamento(eventos, inicio, usuario) !== null && derivarTravamento(eventos, fim, usuario) !== null) meses.push(mes);
  }
  return meses;
}
