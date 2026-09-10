import { diaCivil } from "../../packages/datas/index.js";
import { somaLiquidaEstornaveis } from "../../packages/estornaveis/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import {
  avaliarOrdem,
  ordenarFila,
  zJustificativaQuebraOrdemInput,
  type CategoriaOrdemCronologica,
  type JustificativaQuebraOrdemInput,
  type LiquidacaoNaFila,
} from "./dominio.js";
import type {
  ConsultaOrdemCronologica,
  CorteDaFila,
  FilaPorFonteCategoria,
  OrdemCronologicaPort,
  TransacaoOpaca,
} from "./ports.js";

/**
 * ADAPTER do M06 — a única camada que conhece Prisma.
 *
 * A FILA É UMA CONSULTA, não uma tabela. `saldoAPagar` sai do SUM REAL
 * (valor liquidado − pagamentos líquidos), nunca de cache.
 *
 * O M06 NÃO importa o M05: ele lê as tabelas `Liquidacao`/`Pagamento`/`Empenho`
 * direto pelo Prisma. Quem chama é o `pagar()` do M05.
 */

/** Qualquer coisa que fale Prisma — o client ou uma transação dele. */
type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/**
 * ⚠️ A CÓPIA MORREU. O "pago líquido" era calculado AQUI e TAMBÉM no M08
 * (`somaLiquidaEstornaveis`) — duas implementações da mesma soma, porque `m06 → m08`
 * seria um ciclo. A anulação PARCIAL (TR 5.35) obrigaria a ensinar o caso novo às duas,
 * e a que esquecesse mentiria em silêncio: a FILA DO ART. 141 diria que a liquidação
 * está quitada quando ela não está. A soma agora vive em `packages/estornaveis`.
 */

/**
 * As liquidações VIVAS com saldo a pagar > 0, opcionalmente recortadas por
 * (fonte, categoria). É daqui que a fila sai.
 *
 * A fonte vem da FICHA do empenho; a categoria, do próprio empenho.
 */
async function liquidacoesComSaldo(
  tx: Tx,
  filtro?: {
    readonly fonteId?: string;
    readonly categoria?: CategoriaOrdemCronologica;
  },
  /** `null`/omitido = AGORA. Com corte, a fila é reconstituída naquele instante. */
  corte?: CorteDaFila | null
): Promise<readonly LiquidacaoNaFila[]> {
  // O recorte temporal, aplicado IGUAL às três coisas que definem a fila: quais
  // liquidações existiam, quais delas já tinham sido anuladas, e o que já tinha
  // sido pago. Recortar só uma delas produziria uma fila que nunca existiu.
  const ate =
    corte == null
      ? undefined
      : corte.exclusivo === true
        ? { lt: corte.instante }
        : { lte: corte.instante };

  const linhas = await tx.liquidacao.findMany({
    where: {
      // a anulação de liquidação não entra na fila; a anulada, também não
      estornoDeId: null,
      ...(ate !== undefined ? { criadoEm: ate } : {}),
      // ANULADA ATÉ O CORTE não entra. Anulada DEPOIS dele ainda estava viva
      // naquele instante — e a fila daquele instante tinha de contá-la.
      estornos: { none: ate !== undefined ? { criadoEm: ate } : {} },
      empenho: {
        ...(filtro?.categoria !== undefined
          ? { categoriaOrdemCronologica: filtro.categoria }
          : {}),
        ...(filtro?.fonteId !== undefined
          ? { ficha: { fonteId: filtro.fonteId } }
          : {}),
      },
    },
    select: {
      id: true,
      numero: true,
      valor: true,
      data: true,
      empenho: {
        select: {
          categoriaOrdemCronologica: true,
          ficha: { select: { fonteId: true } },
        },
      },
      // ⚠️ TR 5.35 — as ANULAÇÕES PARCIAIS DA PRÓPRIA LIQUIDAÇÃO. Sem elas, a fila
      // leria o valor BRUTO da liquidação e manteria na fila um saldo a pagar que a
      // despesa já não reconhece — o art. 141 mandaria pagar o que foi glosado.
      anulacoesParciais: {
        select: { id: true, valor: true, estornoDeId: true },
      },
      pagamentos: {
        ...(ate !== undefined ? { where: { criadoEm: ate } } : {}),
        // TR 5.35: a ANULAÇÃO PARCIAL reduz o pagamento — ela não o zera.
        select: {
          id: true,
          valor: true,
          estornoDeId: true,
          anulacaoParcialDeId: true,
        },
      },
    },
  });

  const naFila: LiquidacaoNaFila[] = [];
  for (const l of linhas) {
    // O liquidado LÍQUIDO: o valor da liquidação, menos as anulações parciais VIVAS.
    const liquidado = somaLiquidaEstornaveis([
      { id: l.id, valor: toMoney(l.valor.toFixed(2)), estornoDeId: null },
      ...l.anulacoesParciais.map((a) => ({
        id: a.id,
        valor: toMoney(a.valor.toFixed(2)),
        estornoDeId: a.estornoDeId,
        anulacaoParcialDeId: l.id,
      })),
    ]);
    const pago = somaLiquidaEstornaveis(
      l.pagamentos.map((p) => ({
        id: p.id,
        valor: toMoney(p.valor.toFixed(2)),
        estornoDeId: p.estornoDeId,
        anulacaoParcialDeId: p.anulacaoParcialDeId,
      }))
    );
    const saldo = toMoney(liquidado.minus(pago));

    // Quitada sai da fila. PARCIALMENTE paga CONTINUA — na data original.
    if (saldo.lessThanOrEqualTo(0)) continue;

    naFila.push({
      liquidacaoId: l.id,
      numero: l.numero,
      dataLiquidacao: l.data,
      fonteId: l.empenho.ficha.fonteId,
      categoria: l.empenho.categoriaOrdemCronologica,
      saldoAPagar: saldo,
    });
  }

  return ordenarFila(naFila);
}

/** Agrupa as liquidações em filas (fonte × categoria), cada uma já ordenada. */
async function agruparFilas(
  prisma: PrismaClient,
  liquidacoes: readonly LiquidacaoNaFila[]
): Promise<readonly FilaPorFonteCategoria[]> {
  const porFila = new Map<string, LiquidacaoNaFila[]>();
  for (const l of liquidacoes) {
    const chave = `${l.fonteId}|${l.categoria}`;
    porFila.set(chave, [...(porFila.get(chave) ?? []), l]);
  }

  const fontes = await prisma.fonteRecurso.findMany({
    select: { id: true, codigo: true },
  });
  const codigoPorFonte = new Map(fontes.map((f) => [f.id, f.codigo]));

  return [...porFila.entries()].map(([chave, doGrupo]) => {
    const [fonteId, categoria] = chave.split("|") as [
      string,
      CategoriaOrdemCronologica,
    ];
    return {
      fonteId,
      fonteCodigo: codigoPorFonte.get(fonteId) ?? fonteId,
      categoria,
      liquidacoes: ordenarFila(doGrupo),
    };
  });
}

export function criarOrdemCronologicaPrisma(
  prisma: PrismaClient
): OrdemCronologicaPort {
  return {
    async filaDePagamentos(fonteId, categoria) {
      return liquidacoesComSaldo(prisma, { fonteId, categoria });
    },

    async filasEm(corte) {
      return agruparFilas(prisma, await liquidacoesComSaldo(prisma, {}, corte));
    },

    async posicaoNaFila(liquidacaoId) {
      const alvo = await prisma.liquidacao.findUnique({
        where: { id: liquidacaoId },
        select: {
          empenho: {
            select: {
              categoriaOrdemCronologica: true,
              ficha: { select: { fonteId: true } },
            },
          },
        },
      });
      if (alvo === null) return null;

      const fila = await liquidacoesComSaldo(prisma, {
        fonteId: alvo.empenho.ficha.fonteId,
        categoria: alvo.empenho.categoriaOrdemCronologica,
      });
      return avaliarOrdem(fila, liquidacaoId).posicao;
    },

    async validarOrdemCronologica(
      txOpaca: TransacaoOpaca,
      liquidacaoId: string,
      justificativa?: JustificativaQuebraOrdemInput | undefined
    ): Promise<void> {
      const tx = txOpaca as Tx;

      const alvo = await tx.liquidacao.findUnique({
        where: { id: liquidacaoId },
        select: {
          id: true,
          numero: true,
          empenho: {
            select: {
              categoriaOrdemCronologica: true,
              ficha: { select: { fonteId: true, fonte: { select: { codigo: true } } } },
            },
          },
        },
      });
      if (alvo === null) {
        throw new Error(`Liquidação ${liquidacaoId} não encontrada.`);
      }

      const fonteId = alvo.empenho.ficha.fonteId;
      const categoria = alvo.empenho.categoriaOrdemCronologica;

      // A fila é lida DENTRO da transação — duas requisições concorrentes não
      // podem ambas achar que são a cabeça.
      const fila = await liquidacoesComSaldo(tx, { fonteId, categoria });
      const ordem = avaliarOrdem(fila, liquidacaoId);

      if (ordem.ehCabecaDaFila) return; // caminho normal: nada a justificar

      // Não está na fila = não tem saldo a pagar. Quem barra isso é o M05
      // (pagar > liquidado); aqui não há ordem a violar.
      if (ordem.posicao === null) return;

      const preterida = ordem.preterida!;

      // FAIL-CLOSED (§2º): preterição imotivada é apuração de responsabilidade.
      if (justificativa === undefined) {
        throw new Error(
          `Art. 141 — QUEBRA DA ORDEM CRONOLÓGICA sem justificativa. ` +
            `A liquidação ${alvo.numero} está na posição ${ordem.posicao} da fila ` +
            `(fonte ${alvo.empenho.ficha.fonte.codigo}, categoria ${categoria}); ` +
            `a cabeça é a liquidação ${preterida.numero}, liquidada em ` +
            `${diaCivil(preterida.dataLiquidacao)}. ` +
            `O §1º só admite pagar fora de ordem mediante justificativa prévia ` +
            `numa das hipóteses taxativas.`
        );
      }

      // Zod: hipótese ∈ enum, texto >= 30 chars, autorizadoPor presente.
      const dados = zJustificativaQuebraOrdemInput.parse(justificativa);

      // Mesma transação do pagamento: se um falhar, o outro não existe.
      await tx.justificativaQuebraOrdem.create({
        data: {
          liquidacaoId,
          hipotese: dados.hipotese,
          justificativa: dados.justificativa,
          autorizadoPor: dados.autorizadoPor,
        },
      });
    },

    async consultaOrdemCronologica(competencia): Promise<ConsultaOrdemCronologica> {
      // §3º: divulgação mensal da ordem + justificativas. Só a query — a UI é do
      // M13 (transparência), e a camada tipada do dataset é do M12.
      const filas = await agruparFilas(prisma, await liquidacoesComSaldo(prisma));

      const quebras = await prisma.justificativaQuebraOrdem.findMany({
        where: {
          criadoEm: { gte: competencia.inicio, lte: competencia.fim },
        },
        orderBy: { criadoEm: "asc" },
      });

      return {
        competencia,
        filas,
        quebras: quebras.map((q) => ({
          id: q.id,
          liquidacaoId: q.liquidacaoId,
          hipotese: q.hipotese,
          justificativa: q.justificativa,
          autorizadoPor: q.autorizadoPor,
          criadoEm: q.criadoEm,
        })),
      };
    },
  };
}
