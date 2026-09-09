import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { z } from "zod";
import { toMoney, zMoney } from "../../packages/contracts/index.js";
import { gerarAnulacaoParcial, gerarEstorno } from "../../packages/ledger/index.js";
import type { PartidaParaPersistir } from "../m01-core-contabil/ports.js";
import type { M05Deps } from "./ports.js";

/**
 * TR 5.35 — ANULAÇÃO PARCIAL de empenho, liquidação e pagamento.
 *
 * ═══ A PARCIAL É UM FATO NOVO, NÃO UM ESTORNO — e a diferença é estrutural ═══
 * O ESTORNO nega o fato inteiro: o original SAI de toda soma líquida. A PARCIAL o
 * REDUZ: o original FICA, valendo menos.
 *
 * ⚠️ FOI POR ISSO QUE A PARCIAL GANHOU COLUNA PRÓPRIA (`anulacaoParcialDeId`), e não
 * reusou o `estornoDeId`. Toda leitura líquida do repositório trata `estornoDeId` como
 * "este fato deixou de existir" — e são muitas: a fila do art. 141 (M06), o saldo do
 * contrato (M11), o superávit por fonte (M12), o relatório de restos (M12), o
 * empenhado da ficha (M05). Uma anulação parcial de 1.000 sobre um pagamento de 2.500
 * gravada como estorno faria TODAS elas responderem ZERO — e não 1.500. O sistema
 * inteiro mentiria, cada parte do seu jeito.
 *
 * ═══ O GUARD É SEMPRE O SALDO DO NÍVEL DE BAIXO ═══
 *   empenho    → só se anula o que ainda NÃO foi liquidado;
 *   liquidação → só se anula o que ainda NÃO foi pago;
 *   pagamento  → só se anula o que foi pago.
 * A cadeia `pago <= liquidado <= empenhado` é a mesma do relatório 5.103 — e anular
 * fora de ordem a quebraria pelo elo do meio.
 */

const zValorPositivo = zMoney.refine((v) => v.greaterThan(0), {
  message: "Valor deve ser > 0",
});
const zMotivo = z
  .string()
  .trim()
  .min(10, "O motivo da anulação parcial precisa de ao menos 10 caracteres");

const zAnularParcialInput = z.object({
  /** O id do fato a reduzir. */
  originalId: z.string().min(1),
  /** O número do documento de anulação (a parcial é um documento, não um UPDATE). */
  numero: z.string().min(1),
  valor: zValorPositivo,
  data: z.coerce.date(),
  motivo: zMotivo,
  criadoPor: z.string().min(1),
});
export type AnularParcialInput = z.input<typeof zAnularParcialInput>;

export const zEstornarAnulacaoParcialInput = z.object({
  /** O id do REGISTRO DE ANULAÇÃO PARCIAL (não o do fato original). */
  anulacaoId: z.string().min(1),
  numero: z.string().min(1),
  data: z.coerce.date(),
  motivo: zMotivo,
  criadoPor: z.string().min(1),
});
export type EstornarAnulacaoParcialInput = z.input<
  typeof zEstornarAnulacaoParcialInput
>;

/** As partidas do domínio → o formato de persistência (contaId resolvido). */
async function resolverPartidas(
  partidas: readonly {
    readonly conta: string;
    readonly tipo: "DEBITO" | "CREDITO";
    readonly subsistema: "ORCAMENTARIO" | "PATRIMONIAL" | "CONTROLE";
    readonly valor: ReturnType<typeof toMoney>;
  }[],
  deps: M05Deps
): Promise<readonly PartidaParaPersistir[]> {
  const codigos = [...new Set(partidas.map((p) => p.conta))];
  const contas = await deps.contas.buscarPorCodigos(codigos);
  const porCodigo = new Map(contas.map((c) => [c.codigo, c]));

  const faltantes = codigos.filter((c) => !porCodigo.has(c));
  if (faltantes.length > 0) {
    throw new Error(
      `Conta(s) inexistente(s) no plano PCASP: ${faltantes.join(", ")}.`
    );
  }

  // ⚠️ CADA PERNA COM O SEU VALOR — nunca um valor único recarimbado. É a lição do
  // `resolverPartidas` do M08 (o bug que só apareceu no lançamento composto).
  return partidas.map((p) => ({
    contaId: porCodigo.get(p.conta)!.id,
    tipo: p.tipo,
    subsistema: p.subsistema,
    valor: p.valor,
  }));
}

/** TR 5.35 — anula PARTE de um empenho. Guard: o saldo a liquidar. */
export async function anularEmpenhoParcial(
  input: AnularParcialInput,
  deps: M05Deps
): Promise<{ readonly anulacaoId: string; readonly lancamentoId: string }> {
  const d = zAnularParcialInput.parse(input);

  // A UG vem do EMPENHO reduzido -> ficha. A parcial é um FATO NOVO, mas ela acontece DENTRO
  // da unidade do fato que reduz — não há como reduzir "um pedaço" da despesa da Saúde sem
  // poder na Saúde.
  await deps.autz.exigir(d.criadoPor, ACAO_DO_SERVICO.anularEmpenhoParcial, {
    empenho: d.originalId,
  });

  const lancamentoOriginal = await deps.despesa.buscarLancamentoDoEmpenho(
    d.originalId
  );
  const anulacaoId = deps.ids.novo();
  const lancamentoId = deps.ids.novo();

  // As pernas do roteiro do EMPENHO, invertidas, com o valor PARCIAL. O motor recusa
  // lançamento composto (ver `gerarAnulacaoParcial`).
  const lanc = gerarAnulacaoParcial(lancamentoOriginal, d.valor, {
    idEstorno: lancamentoId,
    numeroControleEstorno: d.numero,
    dataEstorno: d.data,
  });

  await deps.despesa.anularEmpenhoParcial(
    {
      anulacaoId,
      originalId: d.originalId,
      numero: d.numero,
      valor: d.valor,
      data: d.data,
      motivo: d.motivo,
      criadoPor: d.criadoPor,
    },
    {
      id: lancamentoId,
      numeroControle: d.numero,
      dataTransacao: d.data,
      historico: lanc.historico,
      origemTipo: "ANULACAO_PARCIAL_EMPENHO",
      origemId: anulacaoId,
      criadoPor: d.criadoPor,
      partidas: await resolverPartidas(lanc.partidas, deps),
    }
  );

  return { anulacaoId, lancamentoId };
}

/** TR 5.35 — anula PARTE de uma liquidação. Guard: o saldo não pago. */
export async function anularLiquidacaoParcial(
  input: AnularParcialInput,
  deps: M05Deps
): Promise<{ readonly anulacaoId: string; readonly lancamentoId: string }> {
  const d = zAnularParcialInput.parse(input);

  // A UG vem da LIQUIDAÇÃO reduzida -> empenho -> ficha. (E a cascata parcial do almoxarifado
  // — o `aoAnularParcial` do M10 — roda com ESTA autorização: mesma regra do anular total.)
  await deps.autz.exigir(d.criadoPor, ACAO_DO_SERVICO.anularLiquidacaoParcial, {
    liquidacao: d.originalId,
  });

  const lancamentoOriginal = await deps.despesa.buscarLancamentoDaLiquidacao(
    d.originalId
  );
  const anulacaoId = deps.ids.novo();
  const lancamentoId = deps.ids.novo();

  const lanc = gerarAnulacaoParcial(lancamentoOriginal, d.valor, {
    idEstorno: lancamentoId,
    numeroControleEstorno: d.numero,
    dataEstorno: d.data,
  });

  await deps.despesa.anularLiquidacaoParcial(
    {
      anulacaoId,
      originalId: d.originalId,
      numero: d.numero,
      valor: d.valor,
      data: d.data,
      motivo: d.motivo,
      criadoPor: d.criadoPor,
    },
    {
      id: lancamentoId,
      numeroControle: d.numero,
      dataTransacao: d.data,
      historico: lanc.historico,
      origemTipo: "ANULACAO_PARCIAL_LIQUIDACAO",
      origemId: anulacaoId,
      criadoPor: d.criadoPor,
      partidas: await resolverPartidas(lanc.partidas, deps),
    }
  );

  return { anulacaoId, lancamentoId };
}

/**
 * TR 5.35 — anula PARTE de um pagamento.
 *
 * ⚠️ PROIBIDA quando o pagamento tem RETENÇÃO (M07) ou AMORTIZOU DÍVIDA (M10) — as duas
 * portas fechadas vivem no adapter, com a mensagem que aponta o caminho (anular o
 * pagamento inteiro). E o motor puro repete a checagem do lançamento composto: ele não
 * confia no chamador.
 */
export async function anularPagamentoParcial(
  input: AnularParcialInput,
  deps: M05Deps
): Promise<{ readonly anulacaoId: string; readonly lancamentoId: string }> {
  const d = zAnularParcialInput.parse(input);

  // A UG vem do PAGAMENTO reduzido -> liquidação -> empenho -> ficha.
  await deps.autz.exigir(d.criadoPor, ACAO_DO_SERVICO.anularPagamentoParcial, {
    pagamento: d.originalId,
  });

  const lancamentoOriginal = await deps.despesa.buscarLancamentoDoPagamento(
    d.originalId
  );

  // ═══ PORTA FECHADA 1: RETENÇÃO — reconhecida pelo LANÇAMENTO COMPOSTO ═══
  // O motor puro também a barraria (`gerarAnulacaoParcial`), mas com a mensagem dele.
  // Aqui a mensagem é a do DOMÍNIO da despesa, e ela aponta o caminho.
  const valores = new Set(
    lancamentoOriginal.partidas.map((p) => p.valor.toFixed(2))
  );
  if (valores.size > 1) {
    throw new Error(
      `ANULAÇÃO PARCIAL DE PAGAMENTO COM RETENÇÃO É PROIBIDA ` +
        `(${lancamentoOriginal.numeroControle}): o lançamento é COMPOSTO — o caixa ` +
        `levou o líquido, a obrigação morreu pelo bruto, e o retido virou passivo do ` +
        `consignatário. Reduzi-lo em parte exigiria decidir de QUEM sai o pedaço ` +
        `anulado (do fornecedor ou do consignatário), e essa resposta não está em ` +
        `lugar nenhum. Anule o pagamento INTEIRO e refaça-o pelo valor certo.`
    );
  }

  const anulacaoId = deps.ids.novo();
  const lancamentoId = deps.ids.novo();

  const lanc = gerarAnulacaoParcial(lancamentoOriginal, d.valor, {
    idEstorno: lancamentoId,
    numeroControleEstorno: d.numero,
    dataEstorno: d.data,
  });

  await deps.despesa.anularPagamentoParcial(
    {
      anulacaoId,
      originalId: d.originalId,
      numero: d.numero,
      valor: d.valor,
      data: d.data,
      motivo: d.motivo,
      criadoPor: d.criadoPor,
    },
    {
      id: lancamentoId,
      numeroControle: d.numero,
      dataTransacao: d.data,
      historico: lanc.historico,
      origemTipo: "ANULACAO_PARCIAL_PAGAMENTO",
      origemId: anulacaoId,
      criadoPor: d.criadoPor,
      partidas: await resolverPartidas(lanc.partidas, deps),
    }
  );

  return { anulacaoId, lancamentoId };
}

/**
 * O ESTORNO DE UMA ANULAÇÃO PARCIAL — ela era um FATO, e todo fato se estorna.
 *
 * Estornar a parcial RESTAURA o fato original ao valor de antes: a parcial deixa de
 * estar viva, e a soma líquida (packages/estornaveis) volta a não descontá-la.
 *
 * ⚠️ O ESTORNO USA `estornoDeId` — e agora sim está certo: ele NEGA a anulação parcial
 * inteira. É a parcial que reduz; o estorno dela nega. As duas colunas coexistem, cada
 * uma dizendo uma coisa diferente.
 */
export async function estornarAnulacaoParcial(
  input: EstornarAnulacaoParcialInput & {
    readonly nivel: "EMPENHO" | "LIQUIDACAO" | "PAGAMENTO";
  },
  deps: M05Deps
): Promise<{ readonly estornoId: string; readonly lancamentoId: string }> {
  const d = zEstornarAnulacaoParcialInput.parse(input);
  const nivel = input.nivel;

  // ⚠️ A UG SAI DO REGISTRO DA PRÓPRIA PARCIAL — e ela mora na mesma tabela do fato que
  // reduziu (a parcial de um empenho É uma linha de `Empenho`, com a `fichaId` dele). Por isso
  // o escopo depende do `nivel`: é ele que diz em qual das três tabelas o `anulacaoId` está.
  await deps.autz.exigir(
    d.criadoPor,
    ACAO_DO_SERVICO.estornarAnulacaoParcial,
    nivel === "EMPENHO"
      ? { empenho: d.anulacaoId }
      : nivel === "LIQUIDACAO"
        ? { liquidacao: d.anulacaoId }
        : { pagamento: d.anulacaoId }
  );

  // O lançamento DA PARCIAL (que já é uma inversão) — estorná-lo o desfaz.
  const lancamentoDaParcial =
    nivel === "EMPENHO"
      ? await deps.despesa.buscarLancamentoDoEmpenho(d.anulacaoId)
      : nivel === "LIQUIDACAO"
        ? await deps.despesa.buscarLancamentoDaLiquidacao(d.anulacaoId)
        : await deps.despesa.buscarLancamentoDoPagamento(d.anulacaoId);

  const estornoId = deps.ids.novo();
  const lancamentoId = deps.ids.novo();

  const estorno = gerarEstorno(lancamentoDaParcial, {
    idEstorno: lancamentoId,
    numeroControleEstorno: d.numero,
    dataEstorno: d.data,
  });

  await deps.despesa.estornarAnulacaoParcial(
    {
      estornoId,
      anulacaoId: d.anulacaoId,
      nivel,
      numero: d.numero,
      data: d.data,
      motivo: d.motivo,
      criadoPor: d.criadoPor,
    },
    {
      id: lancamentoId,
      numeroControle: d.numero,
      dataTransacao: d.data,
      historico: estorno.historico,
      origemTipo: `ESTORNO_ANULACAO_PARCIAL_${nivel}`,
      origemId: estornoId,
      estornoDeId: lancamentoDaParcial.id,
      criadoPor: d.criadoPor,
      partidas: await resolverPartidas(estorno.partidas, deps),
    }
  );

  return { estornoId, lancamentoId };
}
