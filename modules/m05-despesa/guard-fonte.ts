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

/**
 * ═══ ⚠️ A FONTE TEM DE ESTAR NO ROL DA CONTA — E A REGRA MUDOU EM 2026-09-10 ═══
 *
 * Até o ENT03a a conta tinha UMA fonte, e os quatro sítios que cobravam a TR 5.23
 * comparavam `conta.fonteId !== informada`. Com a conta admitindo VÁRIAS fontes
 * (`docs/adr/ADR-conta-bancaria-com-varias-fontes.md`), essa comparação passou a
 * **recusar o pagamento legítimo** feito pela segunda fonte de uma conta multifonte —
 * que é justamente o caso que a decisão veio permitir.
 *
 * ⚠️ E A REGRA MORA AQUI, UMA VEZ. Ela era escrita à mão em QUATRO lugares (ordem de
 * pagamento, `pagar()`, restos a pagar e dispêndio extraorçamentário). Quatro cópias de
 * uma regra é a garantia de que a quinta mudança vai esquecer uma — e a esquecida mente
 * em silêncio, que é como o buraco da fonte da ficha nasceu.
 *
 * Este arquivo continua sem importar nada além do tipo do client, e é por isso que o
 * M07, o M08 e o M09 podem chamá-lo sem fechar ciclo.
 */
export function exigirFonteNoRol(
  fonteId: string,
  permitidas: readonly { readonly id: string; readonly codigo: string }[],
  codigoDaConta: string,
  operacao: string
): void {
  if (permitidas.length === 0) {
    throw new Error(
      `A conta bancária ${codigoDaConta} não tem fonte de recurso nenhuma — nem no rol, ` +
        `nem como padrão. Sem isso não há como provar que recurso vinculado não custeou ` +
        `outra coisa, e ${operacao} não pode ser gravado.`
    );
  }
  if (!permitidas.some((f) => f.id === fonteId)) {
    throw new Error(
      `FONTE FORA DO ROL (TR 5.23): a conta bancária ${codigoDaConta} não comporta a ` +
        `fonte informada. As fontes permitidas nesta conta são: ` +
        `${permitidas.map((f) => f.codigo).join(", ")}. Usar recurso de outra fonte aqui ` +
        `é dinheiro carimbado no lugar errado. Nada foi gravado.`
    );
  }
}

/** Carrega o rol da conta (por id OU por código) e cobra a regra acima. */
export async function exigirFonteNoRolDaConta(
  tx: TxDoPagamento,
  conta: { readonly id?: string; readonly codigo?: string },
  fonteId: string,
  operacao: string
): Promise<void> {
  const selecao = {
    codigo: true,
    // A fonte PADRÃO da conta — ver o bloco de fallback abaixo.
    fonteId: true,
    fonte: { select: { id: true, codigo: true } },
    fontesPermitidas: { select: { fonte: { select: { id: true, codigo: true } } } },
  } as const;

  const achada =
    conta.id !== undefined
      ? await tx.contaBancaria.findUnique({ where: { id: conta.id }, select: selecao })
      : await tx.contaBancaria.findUnique({
          where: { codigo: conta.codigo ?? "" },
          select: selecao,
        });

  if (achada === null) {
    throw new Error(
      `Conta bancária "${conta.codigo ?? conta.id ?? ""}" não cadastrada. Nada foi gravado.`
    );
  }

  // ⚠️ ROL VAZIO CAI PARA A FONTE PADRÃO DA CONTA — e isto NÃO é uma brecha.
  //
  // A migration do ADR transformou a fonte única de cada conta na PRIMEIRA linha do rol,
  // então em produção o rol nunca está vazio. Vazio acontece com conta criada por fora —
  // uma fixture, um seed, um `INSERT` de manutenção.
  //
  // A primeira versão recusava TODA movimentação nesse caso, com o argumento de que
  // "conta sem rol é conta mal parametrizada". O argumento é bom e a consequência é
  // ruim: uma conta inserida à mão passaria a ser **inutilizável**, em vez de continuar
  // se comportando como antes da decisão. Trocar "funciona com uma fonte" por "não
  // funciona" não é endurecer, é quebrar.
  //
  // O fallback é ESTRITAMENTE SEGURO: ele admite exatamente UMA fonte, a mesma que a
  // regra antiga admitia. Qualquer outra continua recusada — e o rol, quando existe,
  // manda.
  const permitidas =
    achada.fontesPermitidas.length > 0
      ? achada.fontesPermitidas.map((f) => f.fonte)
      : [achada.fonte];

  exigirFonteNoRol(fonteId, permitidas, achada.codigo, operacao);
}

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
