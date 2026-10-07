"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import {
  acrescentarLotePelaTela,
  aprovarPreviaPelaTela,
  criarPreviaPelaTela,
  descartarPreviaPelaTela,
  efetivarPreviaPelaTela,
  type ItemDaTela,
  type OrigemDoRecurso,
  type TipoDeCredito,
} from "../../../../lib/portas/previas";
import { LINHAS_DO_LOTE } from "./linhas";

export interface EstadoDaPrevia {
  readonly erro?: string;
  readonly sucesso?: string;
}

const t = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();

/** As linhas preenchidas do lote. Linha pela metade é recusada nomeando a linha (nada é descartado em silêncio). */
function itensDoLote(f: FormData): readonly ItemDaTela[] | string {
  const itens: ItemDaTela[] = [];
  for (let i = 0; i < LINHAS_DO_LOTE; i++) {
    const ficha = t(f, `ficha${String(i)}`);
    const valor = t(f, `valor${String(i)}`);
    const tipo = t(f, `tipo${String(i)}`);
    if (ficha === "" && valor === "") continue;
    if (ficha === "" || valor === "") return `Na linha ${String(i + 1)}, informe a ficha e o valor.`;
    itens.push({ fichaNumero: ficha, tipo: tipo === "ANULACAO" ? "ANULACAO" : "SUPLEMENTACAO", valor });
  }
  return itens.length === 0 ? "Informe ao menos um movimento." : itens;
}

const TIPOS: readonly TipoDeCredito[] = ["SUPLEMENTAR", "ESPECIAL", "EXTRAORDINARIO"];
const ORIGENS: readonly OrigemDoRecurso[] = ["ANULACAO", "SUPERAVIT_FINANCEIRO", "EXCESSO_ARRECADACAO", "OPERACAO_CREDITO"];

export async function criarPreviaAction(_p: EstadoDaPrevia, f: FormData): Promise<EstadoDaPrevia> {
  return comComandoDoFormulario(f, async () => {
    const exercicio = Number(t(f, "exercicio"));
    const tipo = TIPOS.find((x) => x === t(f, "tipoCredito"));
    const origem = ORIGENS.find((x) => x === t(f, "origemRecurso"));
    if (!Number.isInteger(exercicio)) return { erro: "Exercício inválido." };
    if (tipo === undefined) return { erro: "Escolha o tipo de crédito." };
    if (origem === undefined) return { erro: "Escolha a origem do recurso." };
    const itens = itensDoLote(f);
    if (typeof itens === "string") return { erro: itens };
    try {
      const r = await criarPreviaPelaTela({ exercicio, tipoCredito: tipo, origemRecurso: origem, descricao: t(f, "descricao"), itens });
      revalidatePath("/planejamento/previas");
      return { sucesso: `Prévia nº ${String(r.numero)}/${String(exercicio)} registrada com ${String(itens.length)} movimento(s).` };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível registrar a prévia. Nada foi gravado.") };
    }
  });
}

export async function acrescentarLoteAction(_p: EstadoDaPrevia, f: FormData): Promise<EstadoDaPrevia> {
  return comComandoDoFormulario(f, async () => {
    const itens = itensDoLote(f);
    if (typeof itens === "string") return { erro: itens };
    try {
      const r = await acrescentarLotePelaTela({ previaId: t(f, "previaId"), itens });
      revalidatePath(`/planejamento/previas/${t(f, "previaId")}`);
      return { sucesso: `Lote ${String(r.lote)} acrescentado com ${String(itens.length)} movimento(s).` };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível acrescentar o lote. Nada foi gravado.") };
    }
  });
}

export async function aprovarPreviaAction(_p: EstadoDaPrevia, f: FormData): Promise<EstadoDaPrevia> {
  return comComandoDoFormulario(f, async () => {
    if (t(f, "dia") === "") return { erro: "Informe a data da aprovação." };
    try {
      await aprovarPreviaPelaTela({ previaId: t(f, "previaId"), dia: t(f, "dia"), parecer: t(f, "parecer") });
      revalidatePath(`/planejamento/previas/${t(f, "previaId")}`);
      return { sucesso: "Prévia aprovada." };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível aprovar a prévia. Nada foi gravado.") };
    }
  });
}

export async function descartarPreviaAction(_p: EstadoDaPrevia, f: FormData): Promise<EstadoDaPrevia> {
  return comComandoDoFormulario(f, async () => {
    try {
      await descartarPreviaPelaTela({ previaId: t(f, "previaId"), motivo: t(f, "motivo") });
      revalidatePath(`/planejamento/previas/${t(f, "previaId")}`);
      return { sucesso: "Prévia descartada; os bloqueios foram desfeitos." };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível descartar a prévia. Nada foi gravado.") };
    }
  });
}

export async function efetivarPreviaAction(_p: EstadoDaPrevia, f: FormData): Promise<EstadoDaPrevia> {
  return comComandoDoFormulario(f, async () => {
    if (t(f, "leiId") === "") return { erro: "Escolha a lei que autoriza o crédito." };
    if (t(f, "numero") === "") return { erro: "Informe o número do decreto." };
    if (t(f, "dia") === "") return { erro: "Informe a data do decreto." };
    try {
      await efetivarPreviaPelaTela({ previaId: t(f, "previaId"), leiId: t(f, "leiId"), numeroDecreto: t(f, "numero"), dia: t(f, "dia") });
      revalidatePath(`/planejamento/previas/${t(f, "previaId")}`);
      revalidatePath("/planejamento/creditos-adicionais");
      return { sucesso: `Decreto ${t(f, "numero")} gerado pela prévia; a alteração e os lançamentos foram registrados.` };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível efetivar a prévia. Nada foi gravado.") };
    }
  });
}
