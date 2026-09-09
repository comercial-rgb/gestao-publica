import {
  serializar,
  toMoney,
  type Dinheiro,
  type Money,
} from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { saldoDasContas } from "../m01-core-contabil/adapter-prisma.js";
// ═══ NENHUMA ARITMÉTICA AQUI: cada total vem do módulo DONO do dado. ═══
import { arrecadadoPorFonte } from "../m04-receita/consultas.js";
import { despesaPorFonte } from "../m05-despesa/consultas.js";
import { extraorcamentarioPorFonte } from "../m07-extraorcamentario/consultas.js";
import { restosAPagarPorFonte } from "../m08-restos-a-pagar/consultas.js";

/**
 * SUPERÁVIT FINANCEIRO POR FONTE — art. 43, § 1º, III da Lei 4.320/64; IPC 04.
 *
 * É o número que autoriza o ente a abrir crédito adicional: o que sobrou de cada
 * fonte depois de honrar tudo que ela deve e que se paga sem nova autorização
 * orçamentária. Errar para MAIS é abrir crédito sem lastro.
 *
 * ═══ POR QUE ELE SAI DOS FATOS, E NÃO DO RAZÃO ═══
 * O razão NÃO TEM FONTE: `PartidaContabil` só carrega `fichaId`, e a partida da
 * arrecadação nasce sem ficha nenhuma (auditoria P2). Não existe SELECT que
 * fatie o caixa contábil por fonte — a fonte só existe nas tabelas de FATO
 * (receita, pagamento, movimento extra, empenho→ficha).
 *
 * Isso é uma SEGUNDA aritmética sobre o mesmo dinheiro, e duas aritméticas que
 * ninguém obriga a concordar acabam discordando. Daí a S1: a soma dos caixas por
 * fonte TEM de bater com o caixa do razão. Se não bater, há dinheiro no caixa que
 * nenhum fato explica — e o relatório PARA, dizendo quanto.
 *
 * ═══ AS TRÊS AMARRAÇÕES ═══
 * S1. Σ caixa(fonte) == saldo das contas de caixa no razão (o detector do
 *     DINHEIRO ÓRFÃO — o que entrou sem fato com fonte).
 * S2. Σ superávit(fonte) == superávit do quadro financeiro/permanente. São duas
 *     leituras INDEPENDENTES: esta vem dos FATOS; aquela vem do RAZÃO + o
 *     indicador de cada conta. É a rede que faltava no bloco 3 (o mutante do
 *     indicador que passava por todas as amarrações agora é pego aqui).
 * S3. Por fonte: superávit == caixa − obrigações − consignações.
 *
 * ⚠️ O RP NÃO É SUBTRAÍDO. Ele é o mesmo dinheiro das `obrigacoesAPagar` — o RP
 * processado É a obrigação liquidada e não paga, só que rotulada em 31/12.
 * Subtrair os dois contaria a dívida duas vezes. O RP aparece na linha porque é
 * o que o art. 43 quer VER, não porque entre na conta. (E o RP NÃO PROCESSADO
 * nem obrigação é ainda: vive no controle. Ver `consultas.ts` do M08.)
 */

export interface LinhaDoSuperavit {
  readonly fonte: string;
  readonly descricao: string;
  // ── o caixa da fonte, perna a perna (auditável) ──
  readonly arrecadado: Dinheiro;
  readonly pagamentosLiquidos: Dinheiro;
  readonly ingressosExtra: Dinheiro;
  readonly dispendiosExtra: Dinheiro;
  readonly caixa: Dinheiro;
  // ── o que a fonte deve ──
  readonly obrigacoesAPagar: Dinheiro;
  readonly consignacoesARepassar: Dinheiro;
  /** INFORMATIVO — já está dentro de `obrigacoesAPagar`. Não é subtraído. */
  readonly restosAPagar: Dinheiro;
  /** caixa − obrigações − consignações. NEGATIVO = fonte deficitária (IPC 04). */
  readonly superavit: Dinheiro;
}

export interface SuperavitPorFonte {
  readonly linhas: readonly LinhaDoSuperavit[];
  readonly totalCaixa: Dinheiro;
  readonly totalSuperavit: Dinheiro;
}

const zero = () => toMoney("0.00");
const soma = (a: Money, b: Money) => toMoney(a.plus(b));
const sub = (a: Money, b: Money) => toMoney(a.minus(b));

/** O client OU uma transação dele — ver `linhasDoSuperavitPorFonte`. */
export type Leitor = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/**
 * ⚠️ A CAMADA QUE O GUARD DO M03 USA — e por que ela foi EXTRAÍDA daqui.
 *
 * O relatório completo (`superavitFinanceiroPorFonte`) exige duas coisas que o M03
 * NÃO TEM na hora de decidir um decreto: as `contasCaixa` (o plano de contas — e a
 * regra deste módulo é que o relatório não adivinha o plano) e o `superavitDoQuadro`
 * (que sai do balanço patrimonial, outro relatório inteiro). Exigir os dois do M03
 * seria empurrar o PCASP para dentro do módulo de créditos.
 *
 * Então o que foi extraído é a ARITMÉTICA — as linhas por fonte e a identidade S3 —,
 * que é EXATAMENTE a que o relatório publica: o guard e o Anexo 14 leem o MESMO
 * número, produzido pelo MESMO código. Zero segunda verdade.
 *
 * As amarrações S1 (dinheiro órfão) e S2 (fatos × razão) ficam no RELATÓRIO, porque é
 * lá que existe com que amarrá-las. Se elas quebrarem, o Anexo 14 grita — e é o
 * relatório, não o decreto, o lugar onde essa denúncia aparece.
 *
 * ⚠️ RECEBE `Leitor`, e não `PrismaClient`: o guard do M03 lê isto DENTRO da
 * transação que grava o crédito. Somar fora dela é somar um número velho.
 */
export async function linhasDoSuperavitPorFonte(
  prisma: Leitor,
  p: { readonly corte: Date }
): Promise<{
  readonly linhas: readonly LinhaDoSuperavit[];
  readonly porFonteId: ReadonlyMap<string, Money>;
  readonly totalCaixa: Money;
  readonly totalSuperavit: Money;
}> {
  const [arrecadado, despesa, extra, restos] = await Promise.all([
    arrecadadoPorFonte(prisma, { ate: p.corte }),
    despesaPorFonte(prisma, { ate: p.corte }),
    extraorcamentarioPorFonte(prisma, { ate: p.corte }),
    restosAPagarPorFonte(prisma, { ate: p.corte }),
  ]);

  // TODA fonte que apareceu em QUALQUER perna entra na listagem — inclusive a que
  // só tem dívida e nenhum caixa. Uma fonte deficitária não pode sumir do
  // relatório: ela é justamente a que não pode lastrear crédito nenhum.
  const ids = new Set<string>([
    ...arrecadado.keys(),
    ...despesa.keys(),
    ...extra.keys(),
    ...restos.keys(),
  ]);

  const fontes = await prisma.fonteRecurso.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, codigo: true, descricao: true },
    orderBy: { codigo: "asc" },
  });

  const linhas: LinhaDoSuperavit[] = [];
  const porFonteId = new Map<string, Money>();
  let totalCaixa = zero();
  let totalSuperavit = zero();

  for (const f of fontes) {
    const arr = arrecadado.get(f.id) ?? zero();
    const d = despesa.get(f.id);
    const e = extra.get(f.id);
    const r = restos.get(f.id);

    const pagamentosLiquidos = d?.pagoLiquido ?? zero();
    const ingressosExtra = e?.caixaIngressoAvulso ?? zero();
    const dispendiosExtra = e?.caixaDispendio ?? zero();
    const obrigacoesAPagar = d?.obrigacoesAPagar ?? zero();
    const consignacoes = e?.saldoARepassar ?? zero();
    const restosAPagar = r?.aPagar ?? zero();

    // O CAIXA DA FONTE, com os sinais explícitos: entra a arrecadação e o ingresso
    // avulso; sai o pagamento (LÍQUIDO — só isso saiu do banco) e o repasse.
    const caixa = sub(
      soma(arr, ingressosExtra),
      soma(pagamentosLiquidos, dispendiosExtra)
    );

    const superavit = sub(caixa, soma(obrigacoesAPagar, consignacoes));

    // ═══ S3 — A IDENTIDADE, ESCRITA AO CONTRÁRIO ═══
    // Repetir `caixa − obrigações − consignações` aqui seria uma tautologia: o
    // mesmo código conferindo a si mesmo passa sempre. A conferência é a SOMA DE
    // VOLTA — se o superávit foi montado esquecendo uma parcela, devolver as
    // parcelas a ele NÃO reconstrói o caixa, e a diferença é exatamente o que
    // ficou de fora.
    const reconstruido = soma(superavit, soma(obrigacoesAPagar, consignacoes));
    if (!reconstruido.equals(caixa)) {
      throw new Error(
        `SUPERÁVIT DA FONTE ${f.codigo} NÃO FECHA: superávit ` +
          `${serializar(superavit)} + obrigações ${serializar(obrigacoesAPagar)} + ` +
          `consignações ${serializar(consignacoes)} = ${serializar(reconstruido)}, ` +
          `mas o caixa da fonte é ${serializar(caixa)}. Diferença: ` +
          `${serializar(sub(caixa, reconstruido))} — é o que o superávit deixou de ` +
          `descontar.`
      );
    }

    linhas.push({
      fonte: f.codigo,
      descricao: f.descricao,
      arrecadado: serializar(arr),
      pagamentosLiquidos: serializar(pagamentosLiquidos),
      ingressosExtra: serializar(ingressosExtra),
      dispendiosExtra: serializar(dispendiosExtra),
      caixa: serializar(caixa),
      obrigacoesAPagar: serializar(obrigacoesAPagar),
      consignacoesARepassar: serializar(consignacoes),
      restosAPagar: serializar(restosAPagar),
      superavit: serializar(superavit),
    });

    porFonteId.set(f.id, superavit);
    totalCaixa = soma(totalCaixa, caixa);
    totalSuperavit = soma(totalSuperavit, superavit);
  }

  return { linhas, porFonteId, totalCaixa, totalSuperavit };
}

export async function superavitFinanceiroPorFonte(
  prisma: PrismaClient,
  p: {
    readonly corte: Date;
    /** As contas de caixa do PCASP — PARÂMETRO (o relatório não adivinha o plano). */
    readonly contasCaixa: readonly string[];
    /** O superávit total do quadro financeiro/permanente, para a S2. */
    readonly superavitDoQuadro: Money;
  }
): Promise<SuperavitPorFonte> {
  const { linhas, totalCaixa, totalSuperavit } = await linhasDoSuperavitPorFonte(
    prisma,
    { corte: p.corte }
  );

  // ═══ S1 — O DINHEIRO ÓRFÃO ═══
  // A soma dos caixas por fonte contra o caixa do RAZÃO. É a única rede que existe
  // contra um real que entrou no caixa sem nascer de um fato com fonte.
  const noRazao = await saldoDasContas(
    prisma,
    p.contasCaixa,
    p.corte,
    "dataTransacao"
  );
  if (!totalCaixa.equals(noRazao)) {
    const diferenca = sub(noRazao, totalCaixa);
    throw new Error(
      `CAIXA POR FONTE NÃO FECHA COM O RAZÃO: as fontes somam ` +
        `${serializar(totalCaixa)} e o razão tem ${serializar(noRazao)} nas contas ` +
        `de caixa (${p.contasCaixa.join(", ")}). Diferença: ` +
        `${serializar(diferenca)}. ` +
        (diferenca.greaterThan(0)
          ? `Há ${serializar(diferenca)} no caixa que NENHUM fato com fonte ` +
            `explica — dinheiro órfão. Alguém movimentou o caixa por fora dos ` +
            `serviços (lançamento direto, operação de crédito sem módulo). Um ` +
            `superávit por fonte que ignora esse dinheiro autoriza crédito a menos ` +
            `— ou, se o sinal virar, a mais.`
          : `As fontes somam MAIS caixa do que o razão tem: algum fato está ` +
            `contado duas vezes, ou um lançamento não chegou ao razão.`)
    );
  }

  // ═══ S2 — FATOS × RAZÃO+INDICADOR ═══
  // Duas leituras independentes do mesmo superávit. Esta soma fatos (receita,
  // pagamento, retenção, empenho); a do quadro financeiro/permanente soma o RAZÃO
  // classificado pelo `indicadorSuperavit` de cada conta. Elas só concordam se as
  // duas estiverem certas — é aqui que um indicador trocado é finalmente pego.
  if (!totalSuperavit.equals(p.superavitDoQuadro)) {
    throw new Error(
      `SUPERÁVIT POR FONTE ≠ SUPERÁVIT DO QUADRO FINANCEIRO/PERMANENTE: as fontes ` +
        `somam ${serializar(totalSuperavit)} e o quadro do art. 105 apurou ` +
        `${serializar(p.superavitDoQuadro)}. Diferença: ` +
        `${serializar(sub(totalSuperavit, p.superavitDoQuadro))}. As duas leituras ` +
        `são independentes: esta soma os FATOS (receita, pagamento, retenção, ` +
        `empenho); aquela soma o RAZÃO classificado pelo indicador de cada conta. ` +
        `Divergiram: ou um indicador de superávit está errado no plano de contas, ` +
        `ou há passivo financeiro no razão que nenhum fato com fonte explica.`
    );
  }

  return {
    linhas,
    totalCaixa: serializar(totalCaixa),
    totalSuperavit: serializar(totalSuperavit),
  };
}
