import { cliente } from "./cliente";
import { comEscritaAutenticada } from "./sessao";
import { anularSaldoDoSubempenho, emitirSubempenho, lerSubempenhosDoEmpenho } from "../../modules/m05-despesa/subempenho";
import { rotuloDoSubempenho } from "../../modules/m05-despesa/subempenho-saldo";
import { diaCivil } from "../../packages/datas/index";

/**
 * V36 — O SUBEMPENHO na tela (TR 5.10.1.7). A regra é do M05 (`modules/m05-despesa/subempenho.ts`); aqui a sessão e o
 * formato. A leitura é chamada depois do dossiê do empenho, que já conferiu o acesso a ele.
 */

export interface SubempenhoDaTela {
  readonly id: string;
  readonly rotulo: string;
  readonly data: string;
  readonly historico: string;
  readonly valor: string;
  readonly anulado: string;
  readonly liquidado: string;
  readonly saldo: string;
}

export interface QuadroDosSubempenhos {
  readonly empenhado: string;
  readonly liquidadoDireto: string;
  readonly repartido: string;
  readonly livre: string;
  readonly subempenhos: readonly SubempenhoDaTela[];
}

export async function lerSubempenhosDaTela(empenhoId: string, numeroDoEmpenho: string): Promise<QuadroDosSubempenhos> {
  const q = await lerSubempenhosDoEmpenho(cliente(), empenhoId);
  return {
    empenhado: q.empenhado.toFixed(2),
    liquidadoDireto: q.liquidadoDireto.toFixed(2),
    repartido: q.repartido.toFixed(2),
    livre: q.livre.toFixed(2),
    subempenhos: q.subempenhos.map((s) => ({
      id: s.id,
      rotulo: rotuloDoSubempenho(numeroDoEmpenho, s.numero),
      data: diaCivil(s.data),
      historico: s.historico,
      valor: s.valor.toFixed(2),
      anulado: s.anulado.toFixed(2),
      liquidado: s.liquidado.toFixed(2),
      saldo: s.saldo.toFixed(2),
    })),
  };
}

/**
 * Os subempenhos com saldo dos empenhos da tela de liquidação, por empenho, e o livre de cada empenho repartido. Só os
 * empenhos que TÊM subempenho entram (os demais se liquidam como sempre). Só leitura; o domínio confere de novo.
 */
export async function subempenhosParaLiquidar(
  empenhos: readonly { readonly id: string; readonly numero: string }[]
): Promise<Readonly<Record<string, { readonly livre: string; readonly subempenhos: readonly { readonly id: string; readonly rotulo: string; readonly saldo: string }[] }>>> {
  const prisma = cliente();
  const comSub = await prisma.subempenho.findMany({ where: { empenhoId: { in: empenhos.map((e) => e.id) } }, distinct: ["empenhoId"], select: { empenhoId: true } });
  const saida: Record<string, { readonly livre: string; readonly subempenhos: readonly { readonly id: string; readonly rotulo: string; readonly saldo: string }[] }> = {};
  for (const { empenhoId } of comSub) {
    const numero = empenhos.find((e) => e.id === empenhoId)?.numero ?? "";
    const q = await lerSubempenhosDoEmpenho(prisma, empenhoId);
    saida[empenhoId] = {
      livre: q.livre.toFixed(2),
      subempenhos: q.subempenhos.filter((s) => s.saldo.greaterThan(0)).map((s) => ({ id: s.id, rotulo: rotuloDoSubempenho(numero, s.numero), saldo: s.saldo.toFixed(2) })),
    };
  }
  return saida;
}

export async function emitirSubempenhoPelaTela(input: { readonly empenhoId: string; readonly valor: string; readonly data: Date; readonly historico: string }): Promise<{ readonly rotulo: string }> {
  return comEscritaAutenticada("EMPENHAR", (criadoPor) => emitirSubempenho(cliente(), { ...input, criadoPor }));
}

export async function anularSaldoDoSubempenhoPelaTela(input: {
  readonly subempenhoId: string;
  readonly valor: string;
  readonly data: Date;
  readonly motivo: string;
}): Promise<{ readonly saldo: string }> {
  return comEscritaAutenticada("ANULAR_EMPENHO_PARCIAL", (criadoPor) => anularSaldoDoSubempenho(cliente(), { ...input, criadoPor }));
}
