import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { suplementacaoLiquida, usadoDaDisponibilidade, type ItemBruto } from "./adapter-prisma.js";

/**
 * ═══ A CONSULTA DO RECURSO NOVO: DECLARADO, UTILIZADO E OS DECRETOS (V11 V3.1) ═══
 *
 * O número que autoriza um crédito adicional por superávit EXISTIA — o guard do M03 o
 * calcula dentro da transação que grava o decreto, com lock, e o cita na mensagem quando
 * recusa. Mas ele só existia ALI: não havia como um servidor perguntar "quanto desta fonte
 * ainda dá para suplementar?" antes de escrever o decreto. A resposta chegava como recusa,
 * depois do trabalho feito.
 *
 * ⚠️ ZERO SEGUNDA ARITMÉTICA. `utilizado` sai de `usadoDaDisponibilidade`, a MESMA função
 * que o guard subtrai, e o rateio por decreto sai de `suplementacaoLiquida`, a MESMA que
 * trata o estorno. Somar de novo aqui produziria uma tela que diz um número e um guard que
 * recusa por outro — e quem estivesse certo seria descoberto tarde.
 */

export type Leitor = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export interface DecretoQueConsumiu {
  readonly numero: string;
  readonly ano: number;
  readonly data: Date;
  /** LÍQUIDO: o que este decreto consumiu desta fonte, já descontado o que foi anulado. */
  readonly liquido: Money;
  readonly encerrado: boolean;
}

export interface UsoDoRecursoNovo {
  readonly fonteId: string;
  readonly fonteCodigo: string;
  readonly fonteDescricao: string;
  /** O que alguém DECLAROU ter apurado. Não é conferido por si só — ver a porta. */
  readonly declarado: Money;
  /** A versão VIGENTE da declaração. 1 = declarada uma vez só. */
  readonly versao: number;
  /** Quem declarou a versão vigente, e quando. */
  readonly declaradoPor: string;
  readonly declaradoEm: Date;
  /** De onde saiu o número — a frase que explica, depois, contra o que o crédito foi autorizado. */
  readonly descricao: string;
  readonly utilizado: Money;
  readonly decretos: readonly DecretoQueConsumiu[];
}

/**
 * As disponibilidades declaradas de uma origem num exercício, com o que já foi usado e
 * por quais decretos.
 */
export async function usosDoRecursoNovo(
  prisma: Leitor,
  p: { readonly exercicio: number; readonly origem: "SUPERAVIT_FINANCEIRO" | "EXCESSO_ARRECADACAO" | "OPERACAO_CREDITO" },
): Promise<readonly UsoDoRecursoNovo[]> {
  /**
   * ⚠️ A VIGENTE DE CADA FONTE, E NÃO TODAS AS VERSÕES (V11 V7.3). A declaração passou a ser
   * versionada, e um `findMany` sobre a tabela devolve agora a versão 1, a 2 e a 3 da MESMA
   * fonte — a tela listaria a mesma fonte três vezes, cada linha com um "declarado" diferente e
   * o MESMO "utilizado", e a soma não faria sentido nenhum.
   *
   * A leitura é `DISTINCT ON (fonteId)` com ordem por versão decrescente — a forma que o
   * Postgres tem de dizer "a última de cada". Em Prisma isso é `distinct` + `orderBy`.
   */
  const disponibilidades = await prisma.disponibilidadeRecursoNovo.findMany({
    where: { exercicio: p.exercicio, origem: p.origem },
    distinct: ["fonteId"],
    orderBy: [{ fonteId: "asc" }, { versao: "desc" }],
    select: {
      fonteId: true, valor: true, versao: true, descricao: true, criadoPor: true, criadoEm: true,
      fonte: { select: { codigo: true, descricao: true } },
    },
  });

  const saida: UsoDoRecursoNovo[] = [];
  for (const d of disponibilidades) {
    const utilizado = await usadoDaDisponibilidade(prisma as never, d.fonteId, p.origem, p.exercicio);

    /**
     * ⚠️ O LÍQUIDO POR DECRETO INCLUI O ESTORNO ONDE QUER QUE ELE MORE. O item de
     * anulação aponta para o original por `estornoDeId`, e nada obriga os dois a estarem
     * no mesmo decreto. Agrupar cegamente por decreto antes de somar deixaria o original
     * somando num decreto e o estorno cancelando noutro — a linha da tela mostraria um
     * consumo que já foi desfeito, e a soma das linhas não bateria com o `utilizado`.
     */
    const itens = await prisma.itemCredito.findMany({
      where: { fonteId: d.fonteId, decreto: { origemRecurso: p.origem, ano: p.exercicio } },
      select: {
        id: true, tipo: true, valor: true, estornoDeId: true,
        decreto: { select: { numero: true, ano: true, data: true, encerramento: { select: { id: true } } } },
      },
    });
    const porId = new Map(itens.map((i) => [i.id, i]));
    const decretos = new Map<string, { readonly numero: string; readonly ano: number; readonly data: Date; readonly encerrado: boolean; readonly itens: ItemBruto[] }>();
    for (const i of itens) {
      // O item pertence, para efeito de consumo, ao decreto do ORIGINAL — é ele que
      // consumiu a fonte; o estorno só devolve.
      const dono = i.estornoDeId === null ? i : (porId.get(i.estornoDeId) ?? i);
      const chave = `${dono.decreto.ano}/${dono.decreto.numero}`;
      const atual = decretos.get(chave) ?? { numero: dono.decreto.numero, ano: dono.decreto.ano, data: dono.decreto.data, encerrado: dono.decreto.encerramento !== null, itens: [] };
      atual.itens.push({ id: i.id, tipo: i.tipo as ItemBruto["tipo"], valor: i.valor, estornoDeId: i.estornoDeId });
      decretos.set(chave, atual);
    }

    saida.push({
      fonteId: d.fonteId,
      fonteCodigo: d.fonte.codigo,
      fonteDescricao: d.fonte.descricao,
      declarado: toMoney(d.valor.toFixed(2)),
      versao: d.versao,
      declaradoPor: d.criadoPor,
      declaradoEm: d.criadoEm,
      descricao: d.descricao,
      utilizado,
      decretos: [...decretos.values()]
        .map((x) => ({ numero: x.numero, ano: x.ano, data: x.data, encerrado: x.encerrado, liquido: suplementacaoLiquida(x.itens) }))
        .sort((a, b) => a.data.getTime() - b.data.getTime() || a.numero.localeCompare(b.numero)),
    });
  }
  return saida;
}
