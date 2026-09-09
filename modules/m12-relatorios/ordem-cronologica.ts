import type { PrismaClient } from "../../prisma/generated/client/client.js";
// A FILA É DO M06 — ordem, saldo e derivação. O M12 apenas a EXPÕE, tipada, com o
// recorte do mês. Reimplementar a fila aqui seria criar uma segunda verdade sobre
// quem tem de ser pago primeiro.
import { criarOrdemCronologicaPrisma } from "../m06-ordem-cronologica/adapter-prisma.js";
import { avaliarOrdem } from "../m06-ordem-cronologica/dominio.js";
import type {
  CategoriaOrdemCronologica,
  HipoteseQuebraOrdem,
  LiquidacaoNaFila,
} from "../m06-ordem-cronologica/dominio.js";
import { serializar, type Dinheiro } from "./dominio.js";

/**
 * ORDEM CRONOLÓGICA — DATASET MENSAL DO §3º (M12, bloco 3b). LEITURA PURA.
 *
 * Lei 14.133/2021, art. 141, §3º: o ente publica MENSALMENTE a ordem cronológica
 * de pagamentos e as justificativas das quebras. Este é o dataset — a UI/portal é
 * o M13.
 *
 * ═══ A FILA DO MÊS É A FILA DAQUELE MÊS ═══
 * Publicar em julho a fila de março não é publicar "a fila de hoje": é
 * reconstituir a fila COMO ELA ERA em 31/03 — com as liquidações que existiam até
 * lá e os pagamentos feitos até lá. Quem faz essa reconstituição é o M06
 * (`filasEm`); o M12 só pede o corte certo.
 *
 * ═══ E A POSIÇÃO QUE A LIQUIDAÇÃO OCUPAVA QUANDO FUROU ═══
 * Uma quebra sem contexto é um texto solto. O §2º manda apurar responsabilidade por
 * PRETERIÇÃO — e para isso é preciso saber QUEM foi preterido. Por isso cada quebra
 * sai com a posição que a liquidação paga ocupava NO INSTANTE do pagamento, e com a
 * liquidação que estava na cabeça da fila naquele momento.
 */

export interface ItemDaFila {
  /** 1-based. A cabeça da fila é a posição 1. */
  readonly posicao: number;
  readonly liquidacaoId: string;
  readonly numeroLiquidacao: string;
  readonly numeroEmpenho: string;
  readonly credorCpfCnpj: string;
  /** Marco de exigibilidade (art. 141, caput): a data da liquidação. */
  readonly dataExigibilidade: Date;
  /** Saldo a pagar, do SUM real (liquidado − pagamentos líquidos). */
  readonly valorAPagar: Dinheiro;
  readonly diasNaFila: number;
}

export interface FilaPublicada {
  readonly fonteId: string;
  readonly fonteCodigo: string;
  readonly categoria: CategoriaOrdemCronologica;
  readonly itens: readonly ItemDaFila[];
}

export interface PreteridaNaQuebra {
  readonly liquidacaoId: string;
  readonly numeroLiquidacao: string;
  readonly dataExigibilidade: Date;
  readonly valorAPagar: Dinheiro;
}

export interface QuebraPublicada {
  readonly liquidacaoId: string;
  readonly numeroLiquidacao: string;
  readonly credorCpfCnpj: string;
  /** §1º — hipótese do rol TAXATIVO. */
  readonly hipotese: HipoteseQuebraOrdem;
  readonly justificativa: string;
  readonly autorizadoPor: string;
  readonly registradaEm: Date;
  /** A posição na fila NO INSTANTE em que furou. `null` = não estava na fila. */
  readonly posicaoNaEpoca: number | null;
  /** Quem estava na cabeça da fila naquele instante — o preterido (§2º). */
  readonly preterida: PreteridaNaQuebra | null;
}

export interface OrdemCronologicaMensal {
  readonly relatorio: "ORDEM CRONOLÓGICA DE PAGAMENTOS (art. 141, §3º)";
  readonly ano: number;
  readonly mes: number;
  readonly competencia: { readonly inicio: Date; readonly fim: Date };
  /**
   * MÊS CORRENTE: a fila publicada é a de AGORA (o mês ainda não fechou), não a
   * de um 31 que não chegou.
   */
  readonly mesCorrente: boolean;
  readonly filas: readonly FilaPublicada[];
  readonly quebras: readonly QuebraPublicada[];
}

const DIA_MS = 24 * 60 * 60 * 1000;

/** Dias inteiros entre a exigibilidade e a data de corte. Nunca negativo. */
function diasEntre(exigibilidade: Date, corte: Date): number {
  const dias = Math.floor((corte.getTime() - exigibilidade.getTime()) / DIA_MS);
  return dias > 0 ? dias : 0;
}

export async function ordemCronologicaMensal(
  prisma: PrismaClient,
  ano: number,
  mes: number,
  /** Injetável só para teste determinístico do "mês corrente". */
  agora: Date = new Date()
): Promise<OrdemCronologicaMensal> {
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    throw new Error(`Mês inválido: ${mes}. Use 1 a 12.`);
  }

  const inicio = new Date(Date.UTC(ano, mes - 1, 1, 0, 0, 0, 0));
  // Último instante do mês: dia 0 do mês SEGUINTE.
  const fim = new Date(Date.UTC(ano, mes, 0, 23, 59, 59, 999));

  // FAIL-CLOSED: mês futuro não tem fila nem quebras — tem chute. Publicar uma
  // estrutura vazia daria a impressão de "nada pendente", que é o oposto de
  // "ainda não aconteceu".
  if (inicio > agora) {
    throw new Error(
      `Competência ${String(mes).padStart(2, "0")}/${ano} está no FUTURO — não há ` +
        `ordem cronológica a publicar. O §3º é sobre o que já aconteceu.`
    );
  }

  const mesCorrente = fim > agora;
  /** A fila do fim do mês; ou a de agora, se o mês ainda corre. */
  const corte = mesCorrente ? null : { instante: fim };
  const dataDeCorte = mesCorrente ? agora : fim;

  const ordem = criarOrdemCronologicaPrisma(prisma);
  const filasBrutas = await ordem.filasEm(corte);

  // Enriquecimento: a fila do M06 sabe de saldo e ordem; quem publica precisa
  // também de CREDOR e do número do empenho — quem é que está esperando.
  const idsNaFila = filasBrutas.flatMap((f) =>
    f.liquidacoes.map((l) => l.liquidacaoId)
  );
  const dados = await carregarDadosDasLiquidacoes(prisma, idsNaFila);

  const filas: FilaPublicada[] = filasBrutas.map((f) => ({
    fonteId: f.fonteId,
    fonteCodigo: f.fonteCodigo,
    categoria: f.categoria,
    itens: f.liquidacoes.map((l, i) => {
      const d = dados.get(l.liquidacaoId);
      return {
        // A ordem vem do M06 (`ordenarFila`), já aplicada. A posição é o índice.
        posicao: i + 1,
        liquidacaoId: l.liquidacaoId,
        numeroLiquidacao: l.numero,
        numeroEmpenho: d?.numeroEmpenho ?? "",
        credorCpfCnpj: d?.credorCpfCnpj ?? "",
        dataExigibilidade: l.dataLiquidacao,
        valorAPagar: serializar(l.saldoAPagar),
        diasNaFila: diasEntre(l.dataLiquidacao, dataDeCorte),
      };
    }),
  }));

  // ── As quebras REGISTRADAS NO MÊS ────────────────────────────────────────
  const registradas = await prisma.justificativaQuebraOrdem.findMany({
    where: { criadoEm: { gte: inicio, lte: fim } },
    orderBy: { criadoEm: "asc" },
    select: {
      liquidacaoId: true,
      hipotese: true,
      justificativa: true,
      autorizadoPor: true,
      criadoEm: true,
    },
  });

  const quebras: QuebraPublicada[] = [];
  for (const q of registradas) {
    // A fila NO INSTANTE em que ela furou. `exclusivo`: o pagamento que furou
    // nasce na MESMA transação da justificativa (mesmo `now()` do Postgres) —
    // incluí-lo faria a liquidação sumir da fila que ela acabou de furar.
    const filasNaEpoca = await ordem.filasEm({
      instante: q.criadoEm,
      exclusivo: true,
    });
    const daLiquidacao = filasNaEpoca.find((f) =>
      f.liquidacoes.some((l) => l.liquidacaoId === q.liquidacaoId)
    );

    let posicaoNaEpoca: number | null = null;
    let preterida: PreteridaNaQuebra | null = null;

    if (daLiquidacao !== undefined) {
      // A REGRA é do M06, em forma pura: posição + quem está sendo preterido.
      const resultado = avaliarOrdem(daLiquidacao.liquidacoes, q.liquidacaoId);
      posicaoNaEpoca = resultado.posicao;
      preterida = paraPreterida(resultado.preterida);
    }

    const d = await dadosDaLiquidacao(prisma, q.liquidacaoId);
    quebras.push({
      liquidacaoId: q.liquidacaoId,
      numeroLiquidacao: d?.numeroLiquidacao ?? "",
      credorCpfCnpj: d?.credorCpfCnpj ?? "",
      hipotese: q.hipotese,
      justificativa: q.justificativa,
      autorizadoPor: q.autorizadoPor,
      registradaEm: q.criadoEm,
      posicaoNaEpoca,
      preterida,
    });
  }

  return {
    relatorio: "ORDEM CRONOLÓGICA DE PAGAMENTOS (art. 141, §3º)",
    ano,
    mes,
    competencia: { inicio, fim },
    mesCorrente,
    filas,
    quebras,
  };
}

function paraPreterida(l: LiquidacaoNaFila | null): PreteridaNaQuebra | null {
  if (l === null) return null;
  return {
    liquidacaoId: l.liquidacaoId,
    numeroLiquidacao: l.numero,
    dataExigibilidade: l.dataLiquidacao,
    valorAPagar: serializar(l.saldoAPagar),
  };
}

interface DadosDaLiquidacao {
  readonly numeroLiquidacao: string;
  readonly numeroEmpenho: string;
  readonly credorCpfCnpj: string;
}

async function carregarDadosDasLiquidacoes(
  prisma: PrismaClient,
  ids: readonly string[]
): Promise<Map<string, DadosDaLiquidacao>> {
  if (ids.length === 0) return new Map();

  const linhas = await prisma.liquidacao.findMany({
    where: { id: { in: [...ids] } },
    select: {
      id: true,
      numero: true,
      empenho: { select: { numero: true, credorCpfCnpj: true } },
    },
  });

  return new Map(
    linhas.map((l) => [
      l.id,
      {
        numeroLiquidacao: l.numero,
        numeroEmpenho: l.empenho.numero,
        credorCpfCnpj: l.empenho.credorCpfCnpj,
      },
    ])
  );
}

async function dadosDaLiquidacao(
  prisma: PrismaClient,
  id: string
): Promise<DadosDaLiquidacao | undefined> {
  return (await carregarDadosDasLiquidacoes(prisma, [id])).get(id);
}
