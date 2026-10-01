import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { somaLiquidaEstornaveis } from "../../packages/estornaveis/index.js";
import {
  serializarPercentual,
  toMoney,
  toPercentual,
  type Money,
  type Percentual,
} from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { diaCivilBr } from "../../packages/datas/index.js";
import {
  ratearPorPercentual,
  somaDasPartes,
  zApropriarCustoInput,
  zPublicarCriterioDeRateioInput,
  type ApropriarCustoInput,
  type PublicarCriterioDeRateioInput,
} from "./custos.js";

/**
 * M12 — OS SERVIÇOS DO CUSTO POR CENTRO (V19/C05).
 *
 * Dois atos: publicar uma versão do critério de rateio, e apropriar o custo de uma liquidação.
 *
 * ═══ ⚠️ O QUE ESTES SERVIÇOS NÃO FAZEM, E É O PONTO DE C05 ═══
 * Eles NÃO criam lançamento contábil e NÃO tocam dotação. A despesa foi reconhecida na liquidação,
 * com as partidas dela; apropriar custo é dizer A QUE CENTROS aquele custo pertence. Lançar de novo
 * duplicaria a variação patrimonial diminutiva, e o resultado do exercício contaria o mesmo custo
 * duas vezes. O teste dirigido afirma isso contando `LancamentoContabil` e `MovimentoDotacao` antes
 * e depois — não pela papelada, pelo efeito.
 */

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/**
 * O CRITÉRIO VIGENTE de uma chave numa data — a versão de maior `vigenteDesde` já decorrida.
 *
 * ⚠️ MESMO CRITÉRIO DE VIGÊNCIA DO CRONOGRAMA E DO ROTEIRO ORÇAMENTÁRIO, e a repetição é
 * deliberada: um parâmetro que decide dinheiro se lê sempre do mesmo jeito. Versão publicada com
 * vigência futura NÃO vale hoje, e é isso que permite publicar em dezembro o critério de janeiro.
 */
export async function criterioVigenteDeRateio(
  tx: Tx,
  p: { readonly chave: string; readonly em: Date }
): Promise<{
  readonly id: string;
  readonly versao: number;
  readonly atoRef: string;
  readonly centroDoResiduoId: string;
  readonly itens: readonly { readonly centroId: string; readonly percentual: Percentual }[];
} | null> {
  const c = await tx.criterioDeRateioDeCusto.findFirst({
    where: { chave: p.chave, vigenteDesde: { lte: p.em } },
    orderBy: [{ vigenteDesde: "desc" }, { versao: "desc" }],
    select: {
      id: true,
      versao: true,
      atoRef: true,
      centroDoResiduoId: true,
      itens: { select: { centroId: true, percentual: true } },
    },
  });
  if (c === null) return null;
  return {
    id: c.id,
    versao: c.versao,
    atoRef: c.atoRef,
    centroDoResiduoId: c.centroDoResiduoId,
    // ⚠️ `toPercentual`, e não `toMoney`: seis casas. Ver `packages/contracts/percentual.ts`.
    itens: c.itens.map((i) => ({ centroId: i.centroId, percentual: toPercentual(i.percentual.toFixed(6)) })),
  };
}

/**
 * PUBLICA uma versão do critério de rateio — append-only, como todo parâmetro que decide dinheiro.
 *
 * ⚠️ A VERSÃO É DERIVADA (a próxima da chave), não informada: informar o número deixaria alguém
 * publicar "versão 2" duas vezes, e a unicidade recusaria com uma mensagem de banco em vez de
 * dizer o que houve.
 */
export async function publicarCriterioDeRateio(
  prisma: PrismaClient,
  input: PublicarCriterioDeRateioInput
): Promise<{ readonly criterioId: string; readonly versao: number; readonly centros: number }> {
  const d = zPublicarCriterioDeRateioInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.publicarCriterioDeRateio, "ENTE");

    const centros = [...new Set([...d.itens.map((i) => i.centroId), d.centroDoResiduoId])];
    const existentes = await tx.setor.findMany({
      where: { id: { in: centros } },
      select: { id: true, ativo: true, codigo: true },
    });
    if (existentes.length !== centros.length) {
      throw new Error(
        "CENTRO DE CUSTO INEXISTENTE: um dos setores informados não está cadastrado. O centro de " +
          "custo deste sistema é o SETOR — não há um segundo cadastro a criar."
      );
    }
    const inativo = existentes.find((s) => !s.ativo);
    if (inativo !== undefined) {
      throw new Error(
        `CENTRO DE CUSTO DESATIVADO: o setor ${inativo.codigo} não está ativo. Ratear custo para um ` +
          `centro desativado acumularia despesa num lugar que o ente já fechou.`
      );
    }

    const ultima = await tx.criterioDeRateioDeCusto.findFirst({
      where: { chave: d.chave },
      orderBy: { versao: "desc" },
      select: { versao: true },
    });
    const versao = (ultima?.versao ?? 0) + 1;

    const criado = await tx.criterioDeRateioDeCusto.create({
      data: {
        chave: d.chave,
        versao,
        atoRef: d.atoRef,
        vigenteDesde: d.vigenteDesde,
        centroDoResiduoId: d.centroDoResiduoId,
        criadoPor: d.criadoPor,
        itens: {
          create: d.itens.map((i) => ({ centroId: i.centroId, percentual: serializarPercentual(i.percentual) })),
        },
      },
      select: { id: true },
    });
    return { criterioId: criado.id, versao, centros: d.itens.length };
  });
}

/**
 * APROPRIA o custo de uma liquidação aos centros, pelo critério vigente na competência.
 *
 * ⚠️ O TETO É O LÍQUIDO DA LIQUIDAÇÃO, e ele se apura pela MESMA função que o relatório de restos e
 * o caixa por fonte usam (`somaLiquidaEstornaveis`): a liquidação estornada não soma, a anulação
 * parcial reduz. Apropriar sobre o valor bruto de uma liquidação parcialmente anulada acumularia
 * custo que a despesa não tem mais.
 *
 * ⚠️ E O QUE JÁ FOI APROPRIADO CONTA. Duas apropriações de 600,00 sobre uma liquidação de 1.000,00
 * somariam 1.200,00 de custo — o dobro do que a despesa reconheceu em 200,00. O guard soma as
 * apropriações existentes antes de aceitar a nova.
 */
export async function apropriarCustoDaLiquidacao(
  prisma: PrismaClient,
  input: ApropriarCustoInput
): Promise<{
  readonly apropriacaoId: string;
  readonly valor: Money;
  readonly partes: readonly { readonly centroId: string; readonly valor: Money }[];
}> {
  const d = zApropriarCustoInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.apropriarCustoDaLiquidacao, "ENTE");

    const liq = await tx.liquidacao.findUnique({
      where: { id: d.liquidacaoId },
      select: { id: true, numero: true, empenhoId: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true },
    });
    if (liq === null) {
      throw new Error(`Liquidação ${d.liquidacaoId} não existe. Nada foi gravado.`);
    }
    if (liq.estornoDeId !== null || liq.anulacaoParcialDeId !== null) {
      throw new Error(
        "APROPRIAÇÃO SOBRE ANULAÇÃO: esta linha é o estorno (ou a anulação parcial) de outra " +
          "liquidação, não uma despesa reconhecida. Aproprie o custo sobre a liquidação ORIGINAL — " +
          "o líquido dela já desconta esta anulação."
      );
    }

    // ── O LÍQUIDO DA LIQUIDAÇÃO: a original e tudo o que a nega ou reduz ──
    const familia = await tx.liquidacao.findMany({
      where: {
        OR: [{ id: liq.id }, { estornoDeId: liq.id }, { anulacaoParcialDeId: liq.id }],
      },
      select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true },
    });
    const liquido = somaLiquidaEstornaveis(
      familia.map((l) => ({
        id: l.id,
        valor: toMoney(l.valor.toFixed(2)),
        estornoDeId: l.estornoDeId,
        anulacaoParcialDeId: l.anulacaoParcialDeId,
      }))
    );
    if (!liquido.greaterThan(0)) {
      throw new Error(
        `LIQUIDAÇÃO SEM SALDO LÍQUIDO: a liquidação ${liq.numero} está anulada (líquido ` +
          `${liquido.toFixed(2)}). Não há custo a apropriar.`
      );
    }

    const jaApropriado = await tx.apropriacaoDeCusto.findMany({
      where: { liquidacaoId: liq.id },
      select: { valor: true },
    });
    const somaAnterior = jaApropriado.reduce(
      (acc, a) => toMoney(acc.plus(toMoney(a.valor.toFixed(2)))),
      toMoney("0.00")
    );
    const disponivel = toMoney(liquido.minus(somaAnterior));

    const valor = d.valor === undefined ? disponivel : toMoney(d.valor as never);
    if (!valor.greaterThan(0)) {
      throw new Error(
        `NADA A APROPRIAR: a liquidação ${liq.numero} já tem ${somaAnterior.toFixed(2)} apropriado ` +
          `de um líquido de ${liquido.toFixed(2)}.`
      );
    }
    if (valor.greaterThan(disponivel)) {
      throw new Error(
        `APROPRIAÇÃO ACIMA DA DESPESA: pedido ${valor.toFixed(2)}, e a liquidação ${liq.numero} tem ` +
          `${disponivel.toFixed(2)} disponível (líquido ${liquido.toFixed(2)} menos ` +
          `${somaAnterior.toFixed(2)} já apropriado). Acumular custo acima da despesa reconhecida ` +
          `faria o relatório de custos somar mais do que o razão. Nada foi gravado.`
      );
    }

    const criterio = await criterioVigenteDeRateio(tx, { chave: d.criterioChave, em: d.competencia });
    if (criterio === null) {
      throw new Error(
        `CRITÉRIO DE RATEIO NÃO VIGENTE: nenhuma versão de "${d.criterioChave}" vigia em ` +
          `${diaCivilBr(d.competencia)}. Publique a versão antes de apropriar — o ` +
          `sistema não escolhe critério por conta própria.`
      );
    }

    const partes = ratearPorPercentual(valor, criterio.itens, criterio.centroDoResiduoId);
    const soma = somaDasPartes(partes);
    if (!soma.equals(valor)) {
      // ⚠️ INALCANÇÁVEL pela aritmética do rateio (o resíduo fecha por construção). O guard existe
      // porque a alternativa — confiar — é como uma diferença de centavos entra em produção.
      throw new Error(
        `RATEIO NÃO FECHA: as partes somam ${soma.toFixed(2)} e o valor apropriado é ` +
          `${valor.toFixed(2)}. Nada foi gravado.`
      );
    }

    const criada = await tx.apropriacaoDeCusto.create({
      data: {
        liquidacaoId: liq.id,
        criterioId: criterio.id,
        competencia: d.competencia,
        valor: valor.toFixed(2),
        motivo: d.motivo,
        criadoPor: d.criadoPor,
        itens: {
          create: partes.map((p) => ({ centroId: p.centroId, valor: p.valor.toFixed(2) })),
        },
      },
      select: { id: true },
    });

    return { apropriacaoId: criada.id, valor, partes };
  });
}
