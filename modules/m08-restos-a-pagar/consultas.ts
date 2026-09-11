import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { saldoDaInscricao, SINAL_MOVIMENTO_RP, totaisDosMovimentos } from "./dominio.js";
// A chave (grupo, elemento) da ND é do M05 — quem executa a despesa. Recopiar o `${g}|${e}` aqui
// seria a segunda verdade sobre a mesma chave, e as duas parcelas do Anexo 6 cairiam em linhas
// diferentes no dia em que uma delas aprendesse um caso novo. `m08 → m05` já existe
// (`restos.ts` → `m05/guard-fonte.js`) e não fecha ciclo: `m05/consultas` importa `m08/dominio`.
import { chaveNd } from "../m05-despesa/consultas.js";
import { anoCivil, janelaCivilDoAno } from "../../packages/datas/index.js";

/** O client OU uma transação dele — ver a nota do M04 (`consultas.ts`). */
type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/**
 * RESTOS A PAGAR POR FONTE — leitura pura, aritmética do próprio M08.
 *
 * ═══ A FONTE SAI DA CADEIA, SEM COLUNA NOVA ═══
 * `InscricaoRestosAPagar` não tem fonte, e não precisa ter: inscrição → Empenho →
 * Ficha → FonteRecurso. O empenho já nasceu carimbado com a fonte que a dotação
 * tinha; duplicar isso numa coluna seria criar um lugar a mais para a verdade
 * divergir.
 *
 * ═══ QUAL DOS DOIS SALDOS É "A PAGAR" — a pergunta que o M08 já respondeu ═══
 * Uma inscrição NÃO PROCESSADA tem DUAS medidas, e o `dominio.ts` do M08 diz para
 * que serve cada uma:
 *   · `saldoParaLiquidar`  = quanto ainda PODE VIRAR DESPESA;
 *   · `saldoDaInscricao`   = "o razão contábil: quanto da obrigação ainda existe".
 * "A pagar" é a SEGUNDA. Um RPNP que foi liquidado e não pago tem
 * `saldoParaLiquidar = 0` — e ainda deve cada centavo. Usar aquele saldo aqui
 * faria a dívida SUMIR do relatório no exato momento em que ela virou exigível.
 * O próprio M08 escreve: "liquidar um RPNP não extingue a obrigação — só a
 * qualifica para pagamento".
 *
 * ⚠️ ESTE NÚMERO É INFORMATIVO NO ANEXO 14, NÃO É O PASSIVO FINANCEIRO.
 * O passivo financeiro da fonte é `obrigacoesAPagar` (M05: liquidado − pago), que
 * é o saldo de Fornecedores no razão em QUALQUER corte. O RP é um RÓTULO sobre
 * parte dessa obrigação — o rótulo que ela ganha em 31/12. E o RP NÃO PROCESSADO
 * não está no passivo financeiro coisa nenhuma: ele vive nas contas de CONTROLE
 * (a obrigação ainda não foi liquidada). Subtraí-lo do superávit seria uma
 * decisão de POLÍTICA (o ente descontar o empenhado não liquidado antes de abrir
 * crédito), não uma leitura do balanço — e essa decisão não é do relatório.
 */
export interface RestosDaFonte {
  readonly processado: Money;
  readonly naoProcessado: Money;
  /** processado + naoProcessado — o que ainda se deve dos exercícios fechados. */
  readonly aPagar: Money;
}

/**
 * O último instante do exercício: quando a inscrição PASSA A EXISTIR.
 *
 * ⚠️ É O ÚLTIMO INSTANTE CIVIL DO ENTE, e não `Date.UTC(ano, 11, 31, 23:59:59)`. Aquele
 * instante é 31/12 às **20:59:59** em São Paulo: uma inscrição feita na virada do ano, ou
 * um pagamento de 31/12 à noite, caía do lado errado do corte.
 */
function fimDoExercicio(ano: number): Date {
  return janelaCivilDoAno(ano).fim;
}

export async function restosAPagarPorFonte(
  prisma: Tx,
  p: {
    readonly ate: Date;
    /**
     * ⚠️ SÓ as inscrições de exercícios ATÉ este ano (inclusive). Opcional: ausente =
     * todas, o comportamento de sempre (Anexo 14, superávit).
     *
     * Existe para o RGF Anexo 5, que separa "RP de exercícios ANTERIORES" (colunas b/d)
     * do "RPNP que estou inscrevendo AGORA" (coluna g). Sem o recorte, a inscrição do
     * exercício corrente cai nas duas — e o mesmo RPNP é descontado DUAS VEZES da
     * disponibilidade. O corte por data não resolve: a inscrição de 2026 nasce em
     * 31/12/2026, dentro do corte do próprio exercício.
     */
    readonly exercicioOrigemAte?: number | undefined;
  }
): Promise<ReadonlyMap<string, RestosDaFonte>> {
  const inscricoes = await prisma.inscricaoRestosAPagar.findMany({
    ...(p.exercicioOrigemAte !== undefined
      ? { where: { exercicioOrigem: { lte: p.exercicioOrigemAte } } }
      : {}),
    select: {
      id: true,
      tipo: true,
      exercicioOrigem: true,
      valorInscrito: true,
      empenho: {
        select: { numero: true, ficha: { select: { fonteId: true } } },
      },
      movimentos: {
        select: {
          tipo: true,
          valor: true,
          // O corte é pela data do FATO, e o fato de um movimento de RP é o
          // lançamento dele. `criadoEm` é a data da digitação.
          lancamento: { select: { dataTransacao: true } },
        },
      },
    },
  });

  const zero = toMoney("0.00");
  const por = new Map<string, { processado: Money; naoProcessado: Money }>();

  for (const i of inscricoes) {
    // A inscrição só EXISTE a partir do fim do exercício de origem. Num corte
    // anterior a isso ela ainda não tinha acontecido — e o `criadoEm` (quando
    // alguém clicou em "encerrar") não é a data do fato.
    if (fimDoExercicio(i.exercicioOrigem) > p.ate) continue;

    const movimentos = i.movimentos.map((m) => {
      if (m.lancamento === null) {
        throw new Error(
          `Movimento de RP sem lançamento contábil na inscrição ${i.id} (empenho ` +
            `${i.empenho.numero}): não há data de fato para recortá-lo, e somá-lo ` +
            `pelo \`criadoEm\` misturaria a data da digitação com a do fato.`
        );
      }
      return {
        tipo: m.tipo,
        valor: toMoney(m.valor.toFixed(2)),
        dataTransacao: m.lancamento.dataTransacao,
      };
    });

    // A ARITMÉTICA É DO M08 (`saldoDaInscricao`, com os sinais do
    // SINAL_MOVIMENTO_RP). O relatório só escolhe o RECORTE.
    const saldo = saldoDaInscricao(
      toMoney(i.valorInscrito.toFixed(2)),
      movimentos.filter((m) => m.dataTransacao <= p.ate)
    );

    const fonteId = i.empenho.ficha.fonteId;
    const acc = por.get(fonteId) ?? { processado: zero, naoProcessado: zero };
    if (i.tipo === "PROCESSADO") {
      acc.processado = toMoney(acc.processado.plus(saldo));
    } else {
      acc.naoProcessado = toMoney(acc.naoProcessado.plus(saldo));
    }
    por.set(fonteId, acc);
  }

  return new Map(
    [...por.entries()].map(([fonteId, t]) => [
      fonteId,
      {
        processado: t.processado,
        naoProcessado: t.naoProcessado,
        aPagar: toMoney(t.processado.plus(t.naoProcessado)),
      },
    ])
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// RP PAGOS POR GRUPO DE ND — as colunas (b) e (c) do RREO Anexo 6
// ═══════════════════════════════════════════════════════════════════════════

/**
 * O que SAIU DO CAIXA por restos a pagar num período, separado pelo tipo da inscrição.
 *
 * ⚠️ NÃO CONFUNDIR COM `RestosDaFonte`. Aquele é o SALDO A PAGAR (o que ainda se deve); este é o
 * PAGO (o que já se pagou). São medidas opostas do mesmo objeto, e o Anexo 6 quer esta: o
 * resultado primário é de CAIXA, e mede o cheque que saiu, não a dívida que ficou.
 */
export interface RpPagoDoGrupo {
  /** (b) do Anexo 6 — RP PROCESSADOS pagos (já eram despesa liquidada quando o ano virou). */
  readonly processado: Money;
  /** (c) do Anexo 6 — RP NÃO PROCESSADOS pagos (liquidados e pagos depois da virada). */
  readonly naoProcessado: Money;
  /** processado + naoProcessado — todo o caixa que saiu por RP. */
  readonly total: Money;
}

/**
 * RP PAGOS no período, por (GRUPO, ELEMENTO) de ND, separados em PROCESSADO × NÃO PROCESSADO.
 *
 * ⚠️ A CHAVE É A DO M05 (`chaveNd`), e tem de ser: o Anexo 6 soma `paga + rpProcessadosPagos +
 * rpNaoProcessadosPagos` na MESMA linha. Duas chaves diferentes para o mesmo par (grupo, elemento)
 * fariam as parcelas caírem em linhas distintas e o total continuaria fechando — o pior tipo de
 * erro, o que soma certo e classifica errado.
 *
 * ═══ A ARITMÉTICA É DO M08; O RECORTE É DE QUEM LÊ ═══
 * `totaisDosMovimentos` já responde exatamente esta pergunta: o `pagoLiquido` dele é
 * "pago − estornoPagamento", o que DE FATO saiu do caixa. Esta função só escolhe QUAIS movimentos
 * entram (a janela, pela data do fato) e por que chave agrupá-los. O docstring daquela função já
 * previa este chamador: "o M12 lê os movimentos ATÉ UMA DATA DE CORTE e chama a MESMA função".
 *
 * ⚠️ O TIPO VEM DA INSCRIÇÃO, NÃO DO MOVIMENTO. Um pagamento não sabe se está quitando um RPP ou
 * um RPNP — quem sabe é a inscrição de onde ele baixa (`InscricaoRestosAPagar.tipo`). É isso que
 * separa (b) de (c) sem coluna nova e sem heurística sobre o pagamento.
 *
 * ⚠️ O GRUPO VEM DA CADEIA, NÃO DE COLUNA: inscrição → Empenho → Ficha → NaturezaDespesa. Mesma
 * disciplina da fonte em `restosAPagarPorFonte` — o empenho já nasceu carimbado, e duplicar isso
 * numa coluna seria criar um lugar a mais para a verdade divergir.
 */
export async function rpPagosPorGrupoNd(
  prisma: Tx,
  p: { readonly desde?: Date | undefined; readonly ate: Date }
): Promise<ReadonlyMap<string, RpPagoDoGrupo>> {
  const inscricoes = await prisma.inscricaoRestosAPagar.findMany({
    select: {
      id: true,
      tipo: true,
      empenho: {
        select: {
          numero: true,
          ficha: {
            select: { naturezaDespesa: { select: { codNatureza: true, codElemento: true } } },
          },
        },
      },
      movimentos: {
        select: {
          tipo: true,
          valor: true,
          // O corte é pela data do FATO. `criadoEm` é a data da digitação — a mesma
          // escolha de `restosAPagarPorFonte`, pelo mesmo motivo.
          lancamento: { select: { dataTransacao: true } },
        },
      },
    },
  });

  const zero = toMoney("0.00");
  const acc = new Map<string, { processado: Money; naoProcessado: Money }>();

  for (const i of inscricoes) {
    const movimentos = i.movimentos.map((m) => {
      if (m.lancamento === null) {
        // ⚠️ NÃO PULA EM SILÊNCIO. Um movimento sem lançamento não tem data de fato para ser
        // recortado, e ignorá-lo faria o RP pago sair PARA MENOS — inflando o resultado primário
        // com um cheque que existiu. (O `rreo-anexo11` pula; ver ANEXO11-MOVIMENTO-SEM-LANCAMENTO.)
        throw new Error(
          `Movimento de RP sem lançamento contábil na inscrição ${i.id} (empenho ` +
            `${i.empenho.numero}): não há data de fato para recortá-lo, e somá-lo pelo ` +
            `\`criadoEm\` misturaria a data da digitação com a do fato.`
        );
      }
      return { tipo: m.tipo, valor: toMoney(m.valor.toFixed(2)), quando: m.lancamento.dataTransacao };
    });

    const naJanela = movimentos.filter(
      (m) => m.quando <= p.ate && (p.desde === undefined || m.quando >= p.desde)
    );
    if (naJanela.length === 0) continue;

    // A ARITMÉTICA DO M08 — `pagoLiquido` = pago − estornoPagamento.
    const pago = totaisDosMovimentos(naJanela).pagoLiquido;
    if (pago.isZero()) continue;

    const grupo = chaveNd(
      i.empenho.ficha.naturezaDespesa.codNatureza,
      i.empenho.ficha.naturezaDespesa.codElemento
    );
    const a = acc.get(grupo) ?? { processado: zero, naoProcessado: zero };
    if (i.tipo === "PROCESSADO") a.processado = toMoney(a.processado.plus(pago));
    else a.naoProcessado = toMoney(a.naoProcessado.plus(pago));
    acc.set(grupo, a);
  }

  return new Map(
    [...acc.entries()].map(([g, a]) => [
      g,
      { processado: a.processado, naoProcessado: a.naoProcessado, total: toMoney(a.processado.plus(a.naoProcessado)) },
    ])
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// RESTOS PARA O RREO ANEXO 7 — o grão por inscrição, recortado por ANO DO FATO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Uma inscrição de RP, com os movimentos já SOMADOS por janela de ano (a aritmética de RP é do
 * M08; o relatório só compõe). Os campos `orgaoCodigo`/`ehIntra`/`fonteId` são passagem da ficha
 * — o Anexo 7 os usa para Poder/Órgão e para o desdobramento intra (modalidade 91).
 */
export interface InscricaoParaAnexo7 {
  readonly inscricaoId: string;
  readonly tipo: "PROCESSADO" | "NAO_PROCESSADO";
  /** Ano de inscrição = `exercicioOrigem` (a MESMA fonte da IC "AI" do MANAD). */
  readonly exercicioOrigem: number;
  readonly orgaoCodigo: string;
  /** Modalidade de aplicação 91 — o MESMO teste do Anexo 2. */
  readonly ehIntra: boolean;
  readonly fonteId: string;
  readonly inscrito: Money;
  /** Pago LÍQUIDO (PAGAMENTO − ESTORNO_PAGAMENTO) com data do fato em ano < ref. */
  readonly pagoAntes: Money;
  /** Pago LÍQUIDO no ano de referência. */
  readonly pagoNo: Money;
  /** Cancelado LÍQUIDO (CANCELAMENTO − ESTORNO_CANCELAMENTO) em ano < ref. */
  readonly canceladoAntes: Money;
  /** Cancelado LÍQUIDO no ano de referência. */
  readonly canceladoNo: Money;
  /** Liquidado (LIQUIDACAO_RP) em ano < ref — só RPNP. Decide o BLOCO (migração). */
  readonly liquidadoAntes: Money;
  /** Liquidado (LIQUIDACAO_RP) no ano de referência — a coluna (h), informativa. */
  readonly liquidadoNo: Money;
}

const zero = () => toMoney("0.00");

/** Pago/cancelado líquido: PAGAMENTO/CANCELAMENTO somam, os ESTORNO_* devolvem (SINAL_MOVIMENTO_RP). */
function acumularMovimento(
  acc: { pago: Money; cancelado: Money },
  tipo: keyof typeof SINAL_MOVIMENTO_RP,
  valor: Money
): void {
  const sinal = SINAL_MOVIMENTO_RP[tipo]; // -1 baixa, +1 devolução
  const delta = sinal === -1 ? valor : toMoney(valor.negated());
  if (tipo === "PAGAMENTO" || tipo === "ESTORNO_PAGAMENTO") {
    acc.pago = toMoney(acc.pago.plus(delta));
  } else {
    acc.cancelado = toMoney(acc.cancelado.plus(delta));
  }
}

/**
 * AS INSCRIÇÕES DE RP QUE O ANEXO 7 DE `exercicioReferencia` ENXERGA (RP de exercícios ANTERIORES,
 * `exercicioOrigem < ref`), com os movimentos particionados por ano do FATO:
 *   · < ref  → "Antes" (compõe o saldo de abertura e o já-executado dos anos anteriores);
 *   · == ref → "No"    (pagos/cancelados/liquidados DO exercício de referência);
 *   · > ref  → EXCLUÍDO (o Anexo 7 de um ano passado não enxerga o futuro — R5 depende disto).
 *
 * ⚠️ DATA DO FATO, NÃO `criadoEm`. Movimentos por `lancamento.dataTransacao`; liquidações de RP
 * (`LIQUIDACAO_RP`) por `liquidacao.data`. O `MovimentoRestosAPagar` não tem data própria.
 */
export async function restosParaAnexo7(
  prisma: Tx,
  p: { readonly exercicioReferencia: number }
): Promise<readonly InscricaoParaAnexo7[]> {
  const ref = p.exercicioReferencia;

  const inscricoes = await prisma.inscricaoRestosAPagar.findMany({
    where: { exercicioOrigem: { lt: ref } },
    select: {
      id: true,
      tipo: true,
      exercicioOrigem: true,
      valorInscrito: true,
      empenho: {
        select: {
          ficha: {
            select: {
              fonteId: true,
              orgao: { select: { codigo: true } },
              naturezaDespesa: { select: { codModalidade: true } },
            },
          },
          // As liquidações de RP do empenho (LIQUIDACAO_RP), para decidir o bloco.
          liquidacoes: {
            select: {
              valor: true,
              data: true,
              lancamento: { select: { origemTipo: true } },
            },
          },
        },
      },
      movimentos: {
        select: {
          tipo: true,
          valor: true,
          lancamento: { select: { dataTransacao: true } },
        },
      },
    },
  });

  const saida: InscricaoParaAnexo7[] = [];
  for (const i of inscricoes) {
    const antes = { pago: zero(), cancelado: zero() };
    const noAno = { pago: zero(), cancelado: zero() };

    for (const m of i.movimentos) {
      if (m.lancamento === null) {
        throw new Error(
          `Movimento de RP sem lançamento na inscrição ${i.id}: não há data de fato para ` +
            `recortá-lo por ano (somá-lo pelo \`criadoEm\` misturaria digitação e fato).`
        );
      }
      const ano = anoCivil(m.lancamento.dataTransacao);
      if (ano > ref) continue; // futuro: fora do Anexo 7 de `ref`
      acumularMovimento(ano < ref ? antes : noAno, m.tipo, toMoney(m.valor.toFixed(2)));
    }

    let liquidadoAntes = zero();
    let liquidadoNo = zero();
    for (const l of i.empenho.liquidacoes) {
      if (l.lancamento?.origemTipo !== "LIQUIDACAO_RP") continue; // só liquidação DE RP
      const ano = anoCivil(l.data);
      if (ano > ref) continue;
      const v = toMoney(l.valor.toFixed(2));
      if (ano < ref) liquidadoAntes = toMoney(liquidadoAntes.plus(v));
      else liquidadoNo = toMoney(liquidadoNo.plus(v));
    }

    saida.push({
      inscricaoId: i.id,
      tipo: i.tipo,
      exercicioOrigem: i.exercicioOrigem,
      orgaoCodigo: i.empenho.ficha.orgao.codigo,
      ehIntra: i.empenho.ficha.naturezaDespesa.codModalidade === "91",
      fonteId: i.empenho.ficha.fonteId,
      inscrito: toMoney(i.valorInscrito.toFixed(2)),
      pagoAntes: antes.pago,
      pagoNo: noAno.pago,
      canceladoAntes: antes.cancelado,
      canceladoNo: noAno.cancelado,
      liquidadoAntes,
      liquidadoNo,
    });
  }

  return saida;
}
