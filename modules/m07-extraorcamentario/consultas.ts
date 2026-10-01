import { Decimal, toMoney, type Money } from "../../packages/contracts/index.js";
import { vigenciaDoTipoDeConsignacao } from "./dominio.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { totaisPorConsignatario, SINAL_MOVIMENTO_EXTRA } from "./dominio.js";
import { janelaCivilDoAno } from "../../packages/datas/index.js";

/** O client OU uma transação dele — ver a nota do M04 (`consultas.ts`). */
type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/**
 * O EXTRAORÇAMENTÁRIO DE CADA FONTE — leitura pura, aritmética do próprio M07.
 *
 * ═══ A FONTE VEM DA CONTA BANCÁRIA, E SÓ DE LÁ ═══
 * `MovimentoExtraorcamentario` não tem fonte própria — tem `contaBancariaId`
 * (NOT NULL), e a conta bancária tem fonte (NOT NULL). É a fonte do CAIXA em que
 * o dinheiro de terceiro está parado, e é essa que importa: quando o repasse
 * sair, sai daquele caixa. A "fonte do terceiro" não existe (o INSS não tem fonte
 * de recurso).
 *
 * ═══ A RETENÇÃO NÃO TRANSITA — E É POR ISSO QUE ELA NÃO ENTRA NO CAIXA ═══
 * Uma retenção nasce DENTRO de um pagamento (`pagamentoId` preenchido): o dinheiro
 * nunca chegou a sair do caixa, ele só mudou de dono lá dentro. O caixa do
 * pagamento já foi contado LÍQUIDO pelo M05. Somar a retenção aqui como entrada de
 * caixa contaria o mesmo real duas vezes — foi exatamente a lição do M09.
 * Já o INGRESSO AVULSO (caução, depósito) é dinheiro que ENTRA de fato: esse conta.
 *
 * ⚠️ Mas no SALDO A REPASSAR a retenção ENTRA: a obrigação com o consignatário
 * existe, tenha o dinheiro transitado ou não. Caixa e passivo contam histórias
 * diferentes sobre o mesmo fato, e as duas são verdadeiras.
 */
export interface ExtraDaFonte {
  /** Ingressos AVULSOS (caução, depósito), líquidos de estorno: ENTRAM no caixa. */
  readonly caixaIngressoAvulso: Money;
  /** Repasses/devoluções, líquidos de estorno: SAEM do caixa. */
  readonly caixaDispendio: Money;
  /** O passivo com terceiros — retenções INCLUÍDAS. */
  readonly saldoARepassar: Money;
}

export async function extraorcamentarioPorFonte(
  prisma: Tx,
  p: { readonly ate: Date }
): Promise<ReadonlyMap<string, ExtraDaFonte>> {
  const movimentos = await prisma.movimentoExtraorcamentario.findMany({
    where: { data: { lte: p.ate } },
    select: {
      tipo: true,
      valor: true,
      pagamentoId: true,
      fonteId: true,
      contaBancaria: { select: { fonteId: true } },
    },
  });

  // ⚠️ A FONTE É A DO MOVIMENTO, e cai na da conta SÓ para os movimentos gravados antes
  // de `MovimentoExtraorcamentario.fonteId` existir. Numa conta MULTIFONTE — que é o que
  // a TR 5.10.2.6 exige e o ADR de 2026-09-10 implantou — a fonte padrão da conta não
  // descreve o movimento; ela é um palpite, e o palpite mora justamente no número que
  // prova que recurso vinculado não custeou outra coisa.
  const fonteDo = (m: {
    readonly fonteId: string | null;
    readonly contaBancaria: { readonly fonteId: string };
  }): string => m.fonteId ?? m.contaBancaria.fonteId;

  const por = new Map<string, ExtraDaFonte>();
  const fontes = new Set(movimentos.map(fonteDo));

  for (const fonteId of fontes) {
    const daFonte = movimentos
      .filter((m) => fonteDo(m) === fonteId)
      .map((m) => ({
        tipo: m.tipo,
        valor: toMoney(m.valor.toFixed(2)),
        naoTransitou: m.pagamentoId !== null,
      }));

    // O CAIXA: só o que de fato entrou/saiu do banco (os avulsos).
    const doCaixa = totaisPorConsignatario(
      daFonte.filter((m) => !m.naoTransitou)
    );
    // O PASSIVO: tudo — a retenção também é obrigação.
    const doPassivo = totaisPorConsignatario(daFonte);

    por.set(fonteId, {
      caixaIngressoAvulso: doCaixa.ingressoLiquido,
      caixaDispendio: doCaixa.dispendioLiquido,
      saldoARepassar: doPassivo.saldo,
    });
  }

  return por;
}

// ── LISTAGENS PARA A TELA/PDF (TRAVA-2) — leitura pura, dinheiro em string na borda ──────────────

export interface TipoConsignacaoNaLista {
  readonly id: string;
  readonly codigo: string;
  readonly descricao: string;
  readonly ativo: boolean;
  /**
   * A conta do PCASP onde o passivo desta consignação nasce. `null` = NÃO PARAMETRIZADA.
   *
   * ⚠️ SEM ELA A RETENÇÃO É IMPOSSÍVEL, e é melhor que seja. Reter na fonte é fazer
   * nascer uma dívida com o consignatário; sem saber em que conta ela nasce, o
   * lançamento não tem perna de passivo e não fecharia. Quem oferece retenção na tela
   * TEM de filtrar por este campo e dizer o motivo de um tipo estar de fora — esconder
   * o tipo em silêncio faria o operador procurar um cadastro que ele não sabe que
   * existe.
   */
  readonly contaPassivoCodigo: string | null;
}

/** Os EVENTOS (tipos de consignação) — o cadastro extensível (INSS/ISS/consignações). */
export async function listarTiposConsignacao(prisma: Pick<PrismaClient, "tipoConsignacao">): Promise<TipoConsignacaoNaLista[]> {
  const tipos = await prisma.tipoConsignacao.findMany({
    orderBy: [{ codigo: "asc" }],
    include: {
      contaPassivo: { select: { codigo: true } },
      // ⚠️ A DECISÃO VIGENTE DO ENTE (V11 V8.16) — e ela FALTAVA AQUI.
      //
      // Esta é a listagem que a TELA DE PAGAMENTO consulta para compor a perna do passivo da
      // retenção. Sem a decisão, o ente trocava a conta pela tela de consignações, a tela de
      // consignações mostrava a conta nova, e o pagamento continuava compondo na VELHA — o
      // percurso da cadeia da despesa morria com "Conta sintética não recebe partida", acusando
      // a tela de pagamento por um defeito que estava aqui.
      decisoes: {
        orderBy: { criadoEm: "desc" },
        take: 1,
        select: { ativo: true, contaPassivo: { select: { codigo: true } } },
      },
    },
  });
  return tipos.map((t) => {
    const v = vigenciaDoTipoDeConsignacao(
      { ativo: t.ativo, contaPassivoCodigo: t.contaPassivo?.codigo ?? null },
      t.decisoes[0] === undefined
        ? undefined
        : { ativo: t.decisoes[0].ativo, contaPassivoCodigo: t.decisoes[0].contaPassivo?.codigo ?? null }
    );
    return {
      id: t.id,
      codigo: t.codigo,
      descricao: t.descricao,
      ativo: v.ativo,
      contaPassivoCodigo: v.contaPassivoCodigo,
    };
  });
}

export interface SaldoConsignatarioNaLista {
  readonly tipoCodigo: string;
  readonly tipoDescricao: string;
  readonly consignatario: string;
  readonly ingressado: string;
  readonly dispendido: string;
  /** ingressado − dispendido — o que o ente ainda deve ao consignatário (TR 5.41). Strings. */
  readonly saldo: string;
}

/** Os SALDOS por (tipo, consignatário) — a receita extra com o seu saldo próprio. */
export async function listarSaldosExtra(prisma: PrismaClient): Promise<SaldoConsignatarioNaLista[]> {
  const movs = await prisma.movimentoExtraorcamentario.findMany({
    include: { tipoConsignacao: { select: { codigo: true, descricao: true } } },
  });
  const acc = new Map<string, { tipoCodigo: string; tipoDescricao: string; consignatario: string; ingressado: Decimal; dispendido: Decimal }>();
  for (const m of movs) {
    const k = `${m.tipoConsignacao.codigo}||${m.credorConsignatario}`;
    const cur = acc.get(k) ?? { tipoCodigo: m.tipoConsignacao.codigo, tipoDescricao: m.tipoConsignacao.descricao, consignatario: m.credorConsignatario, ingressado: new Decimal(0), dispendido: new Decimal(0) };
    const sinal = SINAL_MOVIMENTO_EXTRA[m.tipo];
    // Ingressado = o que ENTROU (INGRESSO/estorno de ingresso); dispendido = o que SAIU.
    if (m.tipo === "INGRESSO" || m.tipo === "ESTORNO_INGRESSO") cur.ingressado = cur.ingressado.plus(new Decimal(m.valor).times(sinal));
    else cur.dispendido = cur.dispendido.plus(new Decimal(m.valor).times(-sinal));
    acc.set(k, cur);
  }
  return [...acc.values()]
    .map((v) => ({ tipoCodigo: v.tipoCodigo, tipoDescricao: v.tipoDescricao, consignatario: v.consignatario, ingressado: v.ingressado.toFixed(2), dispendido: v.dispendido.toFixed(2), saldo: v.ingressado.minus(v.dispendido).toFixed(2) }))
    .sort((a, b) => (a.tipoCodigo < b.tipoCodigo ? -1 : a.tipoCodigo > b.tipoCodigo ? 1 : a.consignatario.localeCompare(b.consignatario)));
}

export interface RetencaoNaLista {
  readonly id: string;
  readonly data: Date;
  readonly valor: string;
  readonly tipoCodigo: string;
  readonly consignatario: string;
  /** Drill ao documento: o pagamento e o empenho de origem (TR 5.25). */
  readonly pagamentoNumero: string | null;
  readonly empenhoNumero: string | null;
}

/** As RETENÇÕES do exercício (ingressos nascidos DENTRO de um pagamento — vínculo 5.25), com drill. */
export async function listarRetencoes(prisma: PrismaClient, params: { readonly exercicio: number }): Promise<RetencaoNaLista[]> {
  // ⚠️ EXERCÍCIO CIVIL. Em `Date.UTC` a janela começava em 31/12 às 21:00 do ano
  // anterior: a retenção da virada aparecia no exercício errado, e a do dia 31 à noite
  // sumia dos dois.
  const { inicio: gte, fim: lte } = janelaCivilDoAno(params.exercicio);
  const movs = await prisma.movimentoExtraorcamentario.findMany({
    where: { tipo: "INGRESSO", pagamentoId: { not: null }, data: { gte, lte } },
    include: {
      tipoConsignacao: { select: { codigo: true } },
      pagamento: { select: { numero: true, liquidacao: { select: { empenho: { select: { numero: true } } } } } },
    },
    orderBy: [{ data: "asc" }],
  });
  return movs.map((m) => ({
    id: m.id,
    data: m.data,
    valor: new Decimal(m.valor).toFixed(2),
    tipoCodigo: m.tipoConsignacao.codigo,
    consignatario: m.credorConsignatario,
    pagamentoNumero: m.pagamento?.numero ?? null,
    empenhoNumero: m.pagamento?.liquidacao.empenho.numero ?? null,
  }));
}

export interface DispendioNaLista {
  readonly id: string;
  readonly data: Date;
  readonly valor: string;
  readonly tipoCodigo: string;
  readonly consignatario: string;
  readonly historico: string;
}

/** As DESPESAS EXTRA (recolhimentos/repasses ao consignatário) do exercício. */
export async function listarDispendios(prisma: PrismaClient, params: { readonly exercicio: number }): Promise<DispendioNaLista[]> {
  // ⚠️ EXERCÍCIO CIVIL. Em `Date.UTC` a janela começava em 31/12 às 21:00 do ano
  // anterior: a retenção da virada aparecia no exercício errado, e a do dia 31 à noite
  // sumia dos dois.
  const { inicio: gte, fim: lte } = janelaCivilDoAno(params.exercicio);
  const movs = await prisma.movimentoExtraorcamentario.findMany({
    where: { tipo: "DISPENDIO", data: { gte, lte } },
    include: { tipoConsignacao: { select: { codigo: true } } },
    orderBy: [{ data: "asc" }],
  });
  return movs.map((m) => ({ id: m.id, data: m.data, valor: new Decimal(m.valor).toFixed(2), tipoCodigo: m.tipoConsignacao.codigo, consignatario: m.credorConsignatario, historico: m.historico }));
}

// ═══════════════════════════════════════════════════════════════════════════
// C37 — RETIDO, RECOLHIDO, ESTORNADO E A RECOLHER, SEPARADOS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ POR QUE ESTA CONSULTA EXISTE AO LADO DE `listarSaldosExtra`, E NÃO NO LUGAR DELA.
 *
 * `listarSaldosExtra` entrega `ingressado` e `dispendido` JÁ LÍQUIDOS — o estorno está somado
 * dentro deles. Para o saldo isso é correto e suficiente. Para a composição não é: "recolhido
 * 400,00" esconde um recolhimento de 500,00 e um estorno de 100,00, e quem confere a guia precisa
 * ver os dois. É a mesma lição que os restos a pagar já carregam na tela: **o estorno aparece como
 * linha, não embutido.**
 *
 * Os quatro números do termo de referência saem daqui BRUTOS, e o que falta recolher é derivado —
 * nunca digitado, nunca guardado.
 */
export interface ComposicaoDaObrigacao {
  readonly tipoCodigo: string;
  readonly tipoDescricao: string;
  readonly consignatario: string;
  /** Σ dos INGRESSOS, bruto. */
  readonly retido: string;
  /** Σ dos ESTORNO_INGRESSO, bruto. */
  readonly estornoDeRetencao: string;
  /** Σ dos DISPENDIOS, bruto. */
  readonly recolhido: string;
  /** Σ dos ESTORNO_DISPENDIO, bruto. */
  readonly estornoDeRecolhimento: string;
  /** (retido − estorno de retenção) − (recolhido − estorno de recolhimento). Derivado. */
  readonly aRecolher: string;
  /**
   * ⚠️ O QUE FOI RECOLHIDO SEM DIZER DE ONDE. Recolhimentos vivos sem nenhuma parcela de
   * composição. Não é erro: há movimentos anteriores à composição existir. É pendência VISÍVEL,
   * porque um agregado que os esconde parece conciliado.
   */
  readonly recolhidoSemComposicao: string;
}

export interface ConferenciaDaComposicao {
  readonly obrigacoes: readonly ComposicaoDaObrigacao[];
  /** A soma das linhas acima. */
  readonly somaDasObrigacoes: string;
  /**
   * ⚠️ MEDIDO POR CAMINHO INDEPENDENTE, e é isso que faz disto conferência e não selo: o total
   * global vem de UMA passada sobre todos os movimentos, sem agrupar por obrigação. Se as duas
   * medidas divergirem, `confere` é falso e a tela DIZ — em vez de mostrar um visto.
   */
  readonly totalGlobal: string;
  readonly confere: boolean;
}

export async function conferirComposicaoExtra(
  prisma: PrismaClient
): Promise<ConferenciaDaComposicao> {
  const movs = await prisma.movimentoExtraorcamentario.findMany({
    select: {
      id: true,
      tipo: true,
      valor: true,
      credorConsignatario: true,
      tipoConsignacao: { select: { codigo: true, descricao: true } },
      estornos: { select: { id: true } },
      alocacoesFeitas: { select: { id: true } },
    },
  });

  interface Acc {
    tipoCodigo: string;
    tipoDescricao: string;
    consignatario: string;
    retido: Decimal;
    estornoDeRetencao: Decimal;
    recolhido: Decimal;
    estornoDeRecolhimento: Decimal;
    recolhidoSemComposicao: Decimal;
  }
  const acc = new Map<string, Acc>();
  const zero = (): Decimal => new Decimal(0);

  for (const m of movs) {
    const k = `${m.tipoConsignacao.codigo}||${m.credorConsignatario}`;
    const cur =
      acc.get(k) ??
      {
        tipoCodigo: m.tipoConsignacao.codigo,
        tipoDescricao: m.tipoConsignacao.descricao,
        consignatario: m.credorConsignatario,
        retido: zero(),
        estornoDeRetencao: zero(),
        recolhido: zero(),
        estornoDeRecolhimento: zero(),
        recolhidoSemComposicao: zero(),
      };
    const v = new Decimal(m.valor);
    if (m.tipo === "INGRESSO") cur.retido = cur.retido.plus(v);
    else if (m.tipo === "ESTORNO_INGRESSO") cur.estornoDeRetencao = cur.estornoDeRetencao.plus(v);
    else if (m.tipo === "DISPENDIO") {
      cur.recolhido = cur.recolhido.plus(v);
      // Vivo (sem estorno) e sem nenhuma parcela: recolheu sem dizer de onde.
      if (m.estornos.length === 0 && m.alocacoesFeitas.length === 0) {
        cur.recolhidoSemComposicao = cur.recolhidoSemComposicao.plus(v);
      }
    } else cur.estornoDeRecolhimento = cur.estornoDeRecolhimento.plus(v);
    acc.set(k, cur);
  }

  const obrigacoes = [...acc.values()]
    .map((a) => ({
      tipoCodigo: a.tipoCodigo,
      tipoDescricao: a.tipoDescricao,
      consignatario: a.consignatario,
      retido: a.retido.toFixed(2),
      estornoDeRetencao: a.estornoDeRetencao.toFixed(2),
      recolhido: a.recolhido.toFixed(2),
      estornoDeRecolhimento: a.estornoDeRecolhimento.toFixed(2),
      aRecolher: a.retido
        .minus(a.estornoDeRetencao)
        .minus(a.recolhido.minus(a.estornoDeRecolhimento))
        .toFixed(2),
      recolhidoSemComposicao: a.recolhidoSemComposicao.toFixed(2),
    }))
    .sort((x, y) =>
      x.tipoCodigo < y.tipoCodigo
        ? -1
        : x.tipoCodigo > y.tipoCodigo
          ? 1
          : x.consignatario.localeCompare(y.consignatario)
    );

  let soma = new Decimal(0);
  for (const o of obrigacoes) soma = soma.plus(new Decimal(o.aRecolher));

  // O caminho independente: uma passada, sem agrupar.
  let global = new Decimal(0);
  for (const m of movs) {
    const v = new Decimal(m.valor);
    if (m.tipo === "INGRESSO") global = global.plus(v);
    else if (m.tipo === "ESTORNO_INGRESSO") global = global.minus(v);
    else if (m.tipo === "DISPENDIO") global = global.minus(v);
    else global = global.plus(v);
  }

  return {
    obrigacoes,
    somaDasObrigacoes: soma.toFixed(2),
    totalGlobal: global.toFixed(2),
    confere: soma.equals(global),
  };
}

/**
 * AS RETENÇÕES DE UMA OBRIGAÇÃO, com o que cada uma ainda tem a recolher (C34).
 *
 * ⚠️ É ESTA LISTA QUE COMPÕE UMA GUIA, e é por ela que "retenções anteriores" deixa de ser uma
 * frase: a de dezembro aparece ao lado da de janeiro, com o exercício de cada uma, e o operador
 * escolhe de quais sai cada centavo. Retenção estornada aparece com `aRecolher` zero e o aviso —
 * não desaparece, porque ela existiu.
 */
export interface RetencaoComSaldo {
  readonly movimentoId: string;
  readonly data: Date;
  readonly exercicio: number;
  readonly valor: string;
  /** Somatório das parcelas VIVAS (de recolhimentos não estornados). */
  readonly alocado: string;
  readonly aRecolher: string;
  readonly estornada: boolean;
  /** Preenchido quando a retenção nasceu dentro de um pagamento. */
  readonly pagamentoId: string | null;
}

export async function retencoesComSaldo(
  prisma: PrismaClient,
  params: { readonly tipoConsignacaoId: string; readonly credorConsignatario: string }
): Promise<readonly RetencaoComSaldo[]> {
  const ingressos = await prisma.movimentoExtraorcamentario.findMany({
    where: {
      tipo: "INGRESSO",
      tipoConsignacaoId: params.tipoConsignacaoId,
      credorConsignatario: params.credorConsignatario,
    },
    orderBy: { data: "asc" },
    select: {
      id: true,
      data: true,
      valor: true,
      pagamentoId: true,
      estornos: { select: { id: true } },
      alocacoesRecebidas: {
        select: { valor: true, recolhimento: { select: { estornos: { select: { id: true } } } } },
      },
    },
  });
  return ingressos.map((i) => {
    let alocado = new Decimal(0);
    for (const a of i.alocacoesRecebidas) {
      if (a.recolhimento.estornos.length > 0) continue;
      alocado = alocado.plus(new Decimal(a.valor));
    }
    const estornada = i.estornos.length > 0;
    const bruto = new Decimal(i.valor);
    return {
      movimentoId: i.id,
      data: i.data,
      exercicio: i.data.getUTCFullYear(),
      valor: bruto.toFixed(2),
      alocado: alocado.toFixed(2),
      aRecolher: estornada ? "0.00" : bruto.minus(alocado).toFixed(2),
      estornada,
      pagamentoId: i.pagamentoId,
    };
  });
}

/** A composição de UM recolhimento: de quais retenções ele saiu. */
export interface ParcelaDaComposicao {
  readonly ingressoId: string;
  readonly dataDaRetencao: Date;
  readonly valor: string;
}

export async function composicaoDoRecolhimento(
  prisma: PrismaClient,
  recolhimentoId: string
): Promise<readonly ParcelaDaComposicao[]> {
  const linhas = await prisma.alocacaoDoRecolhimento.findMany({
    where: { recolhimentoId },
    orderBy: { ingresso: { data: "asc" } },
    select: { ingressoId: true, valor: true, ingresso: { select: { data: true } } },
  });
  return linhas.map((l) => ({
    ingressoId: l.ingressoId,
    dataDaRetencao: l.ingresso.data,
    valor: new Decimal(l.valor).toFixed(2),
  }));
}
