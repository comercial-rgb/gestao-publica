import type { PrismaClient } from "../../prisma/generated/client/client.js";

/**
 * O GUARD DA FONTE DO PAGAMENTO — e ele fecha um buraco que MENTIA EM DOIS LUGARES.
 *
 * ═══ A CADEIA ═══
 *   pagamento -> liquidação -> empenho -> ficha -> FONTE
 * A fonte do pagamento TEM de ser a fonte da ficha que autorizou a despesa. Já existia
 * o guard da TR 5.23 (fonte do pagamento == fonte da CONTA BANCÁRIA); faltava o outro
 * elo — e sem ele a corrente não fechava: dava para pagar uma despesa da fonte 500
 * (impostos) com dinheiro da conta do FUNDEB, e os dois guards existentes aplaudiam.
 *
 * ═══ O QUE ISSO QUEBRAVA, EXATAMENTE ═══
 * O `despesaPorFonte` (M05) agrupa os PAGAMENTOS por `Pagamento.fonteId` e as
 * LIQUIDAÇÕES pela fonte da FICHA. Com as duas divergindo, uma liquidação de 1.000 na
 * fonte 500 paga com 100 da fonte 540 produz:
 *
 *   fonte 500:  liquidado 1.000 − pago     0  ->  obrigações  1.000,00  (nunca baixa)
 *   fonte 540:  liquidado     0 − pago   100  ->  obrigações   −100,00  (NEGATIVA)
 *
 * As DUAS fontes passam a mentir — uma carrega para sempre uma dívida já paga, a outra
 * declara uma obrigação negativa. E o superávit financeiro por fonte é justamente o
 * número que AUTORIZA CRÉDITO ADICIONAL (TR 4.37, amarrado em cf765b0). O total fecha
 * (os erros se cancelam), e é por isso que nenhuma amarração pegou: a S2 do Anexo 14
 * compara TOTAIS.
 *
 * ═══ POR QUE ESTE ARQUIVO É AVULSO ═══
 * O pagamento de RESTOS A PAGAR **não passa** pelo `pagar()` do M05 — o M08 cria o
 * `Pagamento` por conta própria (`restos.ts`), com o mesmo guard da TR 5.23 e o mesmo
 * buraco. Fechar só no M05 deixaria o furo inteiro do outro lado, e o RP é justamente
 * onde a troca de fonte é mais tentadora (o exercício virou, a conta mudou).
 *
 * Só que `m08 -> m05/adapter-prisma` puxaria o adapter inteiro, e o M05 já importa o
 * M08. Este arquivo não importa NADA além do tipo do client — exatamente como o
 * `m08/guard-exercicio.ts`, que o M05 importa há blocos. A aresta é fina e não fecha
 * ciclo. Um guard duplicado nos dois módulos seria a quarta cópia de uma regra, e a
 * esquecida mentiria em silêncio.
 */

/** O client OU uma transação dele — o guard roda DENTRO da tx do pagamento. */
export type TxDoPagamento = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

export async function exigirFonteDaFicha(
  tx: TxDoPagamento,
  liquidacaoId: string,
  fonteDoPagamento: string
): Promise<void> {
  const liq = await tx.liquidacao.findUnique({
    where: { id: liquidacaoId },
    select: {
      numero: true,
      empenho: {
        select: {
          numero: true,
          ficha: {
            select: {
              numero: true,
              fonte: { select: { id: true, codigo: true, descricao: true } },
            },
          },
        },
      },
    },
  });
  if (liq === null) {
    throw new Error(`Liquidação ${liquidacaoId} não existe.`);
  }

  const daFicha = liq.empenho.ficha.fonte;
  if (daFicha.id === fonteDoPagamento) return;

  const outra = await tx.fonteRecurso.findUnique({
    where: { id: fonteDoPagamento },
    select: { codigo: true, descricao: true },
  });

  throw new Error(
    `FONTE DO PAGAMENTO DIVERGE DA FONTE DA DESPESA. O pagamento sai da fonte ` +
      `${outra?.codigo ?? fonteDoPagamento} (${outra?.descricao ?? "desconhecida"}), ` +
      `mas a cadeia diz outra coisa: liquidação ${liq.numero} -> empenho ` +
      `${liq.empenho.numero} -> ficha ${liq.empenho.ficha.numero} -> fonte ` +
      `${daFicha.codigo} (${daFicha.descricao}). Quem autorizou a despesa foi a ficha, ` +
      `e é a fonte DELA que paga. Pagar com dinheiro de outra fonte é desvio de ` +
      `finalidade — e, no relatório, faz a fonte da ficha carregar para sempre uma ` +
      `obrigação já quitada enquanto a outra declara obrigação NEGATIVA. Não há ` +
      `exceção: se a despesa era de outra fonte, o erro está no EMPENHO.`
  );
}
