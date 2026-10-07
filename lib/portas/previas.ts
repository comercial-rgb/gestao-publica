import { cliente } from "./cliente";
import { comEscritaAutenticada } from "./sessao";
import { meioDiaCivil } from "../../packages/datas/index.js";
import {
  acrescentarLoteAPrevia,
  aprovarPrevia,
  criarPrevia,
  descartarPrevia,
  detalharPrevia,
  efetivarPrevia,
  listarPrevias,
  type PreviaDetalhada,
  type PreviaNaLista,
} from "../../modules/m03-creditos/previa";
import { listarLeis, listarQdd } from "../../modules/m03-creditos/consultas";
import { criarM03DepsAmarrado } from "../../modules/m12-relatorios/adapter-m03";

/**
 * V36 — A PRÉVIA DA ALTERAÇÃO ORÇAMENTÁRIA na tela (TR 5.9.3.23 e 5.9.3.24). A regra é do M03
 * (`modules/m03-creditos/previa.ts`); aqui o número da ficha vira a ficha do exercício, o dia vira o meio-dia civil, e a
 * efetivação usa as deps AMARRADAS do M03 (o recurso novo conferido contra os fatos, como no decreto digitado).
 */

export type { PreviaDetalhada, PreviaNaLista };

export type TipoDeCredito = "SUPLEMENTAR" | "ESPECIAL" | "EXTRAORDINARIO";
export type OrigemDoRecurso = "ANULACAO" | "SUPERAVIT_FINANCEIRO" | "EXCESSO_ARRECADACAO" | "OPERACAO_CREDITO";

export interface ItemDaTela {
  readonly fichaNumero: string;
  readonly tipo: "SUPLEMENTACAO" | "ANULACAO";
  readonly valor: string;
}

export async function lerPrevias(exercicio: number): Promise<readonly PreviaNaLista[]> {
  return listarPrevias(cliente(), { exercicio });
}

export async function lerPrevia(id: string): Promise<PreviaDetalhada | null> {
  return detalharPrevia(cliente(), id);
}

/** As fichas do exercício como sugestão do campo (número — classificação — disponível). */
export async function fichasParaPrevia(exercicio: number): Promise<readonly { readonly numero: number; readonly rotulo: string }[]> {
  const qdd = await listarQdd(cliente(), { exercicio });
  return qdd.map((f) => ({ numero: f.numero, rotulo: `UG ${f.unidadeCodigo} · ação ${f.acaoCodigo} · ${f.naturezaCodigo} · fonte ${f.fonteCodigo}` }));
}

/**
 * As leis de crédito que podem servir à prévia: do mesmo tipo de crédito, do exercício e do anterior (a LOA aprovada no
 * ano anterior autoriza o suplementar; o especial de lei do fim do ano anterior se reabre). Se a lei alcança o decreto,
 * quem decide é o domínio, ao criar o decreto.
 */
export async function leisParaPrevia(exercicio: number, tipo: TipoDeCredito): Promise<readonly { readonly id: string; readonly rotulo: string }[]> {
  const [anterior, doExercicio] = await Promise.all([listarLeis(cliente(), { ano: exercicio - 1 }), listarLeis(cliente(), { ano: exercicio })]);
  return [...doExercicio, ...anterior].filter((l) => l.tipoCredito === tipo).map((l) => ({ id: l.id, rotulo: `Lei ${l.numero}/${String(l.ano)}` }));
}

/** O número da ficha (como o servidor o vê) para o id, no exercício. Número desconhecido recusa nomeando-o. */
async function fichasPorNumero(exercicio: number, itens: readonly ItemDaTela[]): Promise<{ fichaId: string; tipo: "SUPLEMENTACAO" | "ANULACAO"; valor: string }[]> {
  const numeros = itens.map((i) => Number(i.fichaNumero));
  const invalidos = itens.filter((i) => !/^\d+$/.test(i.fichaNumero.trim())).map((i) => i.fichaNumero);
  if (invalidos.length > 0) throw new Error(`Número de ficha inválido: ${invalidos.join(", ")}. Nada foi gravado.`);
  const fichas = await cliente().fichaOrcamentaria.findMany({ where: { exercicio, numero: { in: numeros } }, select: { id: true, numero: true } });
  const ausentes = [...new Set(numeros)].filter((n) => !fichas.some((f) => f.numero === n));
  if (ausentes.length > 0) throw new Error(`Não há ficha ${ausentes.join(", ")} no exercício ${String(exercicio)}. Nada foi gravado.`);
  return itens.map((i) => ({ fichaId: fichas.find((f) => f.numero === Number(i.fichaNumero))!.id, tipo: i.tipo, valor: i.valor }));
}

export async function criarPreviaPelaTela(input: {
  readonly exercicio: number;
  readonly tipoCredito: TipoDeCredito;
  readonly origemRecurso: OrigemDoRecurso;
  readonly descricao: string;
  readonly itens: readonly ItemDaTela[];
}): Promise<{ readonly previaId: string; readonly numero: number }> {
  return comEscritaAutenticada("CRIAR_DECRETO_DE_CREDITO", async (criadoPor) =>
    criarPrevia(cliente(), { ...input, itens: await fichasPorNumero(input.exercicio, input.itens), criadoPor })
  );
}

export async function acrescentarLotePelaTela(input: { readonly previaId: string; readonly itens: readonly ItemDaTela[] }): Promise<{ readonly lote: number }> {
  return comEscritaAutenticada("CRIAR_DECRETO_DE_CREDITO", async (criadoPor) => {
    const p = await cliente().previaDeAlteracao.findUnique({ where: { id: input.previaId }, select: { exercicio: true } });
    if (p === null) throw new Error("Prévia não encontrada. Nada foi gravado.");
    return acrescentarLoteAPrevia(cliente(), { previaId: input.previaId, itens: await fichasPorNumero(p.exercicio, input.itens), criadoPor });
  });
}

export async function aprovarPreviaPelaTela(input: { readonly previaId: string; readonly dia: string; readonly parecer: string }): Promise<void> {
  return comEscritaAutenticada("EXECUTAR_CREDITO", (criadoPor) =>
    aprovarPrevia(cliente(), { previaId: input.previaId, data: meioDiaCivil(input.dia), parecer: input.parecer, criadoPor })
  );
}

export async function descartarPreviaPelaTela(input: { readonly previaId: string; readonly motivo: string }): Promise<void> {
  return comEscritaAutenticada("CRIAR_DECRETO_DE_CREDITO", (criadoPor) => descartarPrevia(cliente(), { previaId: input.previaId, motivo: input.motivo, criadoPor }));
}

export async function efetivarPreviaPelaTela(input: { readonly previaId: string; readonly leiId: string; readonly numeroDecreto: string; readonly dia: string }): Promise<{ readonly decretoId: string }> {
  return comEscritaAutenticada("EXECUTAR_CREDITO", (criadoPor) =>
    efetivarPrevia(cliente(), criarM03DepsAmarrado(cliente()), { previaId: input.previaId, leiId: input.leiId, numeroDecreto: input.numeroDecreto, data: meioDiaCivil(input.dia), criadoPor })
  );
}
