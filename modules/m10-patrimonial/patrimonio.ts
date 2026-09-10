import { diaCivil } from "../../packages/datas/index.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { randomUUID } from "node:crypto";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import {
  gerarEstorno,
  type LancamentoContabil,
} from "../../packages/ledger/index.js";
import { origemDaNatureza } from "../m04-receita/dominio.js";
// ⚠️ O FUNIL DO RAZÃO (M01). Todo lançamento passa por ele — e é lá que mora o
// travamento de competência (M16). Ver `m01-funil.test.ts`: o grep-teste proíbe o
// `lancamentoContabil.create` fora dele.
import { lancarNoRazao } from "../m01-core-contabil/razao.js";
import {
  aplicadoNaCompetencia,
  atualizacaoAcumulada,
  calcularParcela,
  calcularResultadoDaAlienacao,
  competenciaParaData,
  comporPartidas,
  descricaoDoGrupo,
  ehGrupoDeCapital,
  TIPO_DO_METODO,
  tipoDoEstorno,
  valorBruto,
  valorContabil,
  zAdquirirBemInput,
  zAlienarBemInput,
  zAtualizarCompetenciaInput,
  zBaixarBemInput,
  zCustoSubsequenteInput,
  zEntradaAvulsaInput,
  zEstornarMovimentoPatrimonialInput,
  zImpairmentInput,
  zReavaliacaoInput,
  type AdquirirBemInput,
  type AlienarBemInput,
  type AtualizarCompetenciaInput,
  type BaixarBemInput,
  type ChaveResultadoAlienacao,
  type CustoSubsequenteInput,
  type EntradaAvulsaInput,
  type EstornarMovimentoPatrimonialInput,
  type ImpairmentInput,
  type MetodoAtualizacao,
  type ReavaliacaoInput,
  type RoteiroDoTipo,
  type TipoMovimentoPatrimonial,
} from "./dominio.js";

/**
 * PATRIMÔNIO (M10, bloco 1) — classes, bens e movimentos.
 *
 * ═══ AS TRÊS REGRAS QUE ATRAVESSAM TUDO ═══
 * 1. O LANÇAMENTO É DA CLASSE (TR 5.84). O `bemId` é amarração opcional (TR 3.1):
 *    ele responde "quanto vale ESTE bem?" sem quebrar o sintético.
 * 2. TODA SOMA PASSA POR `valorContabil` (Record de sinal). Nenhum `SUM` bruto.
 * 3. O ROTEIRO VEM DA TABELA. Tipo sem roteiro parametrizado = LANÇA. Melhor não
 *    contabilizar do que contabilizar na conta errada.
 */

/** Qualquer coisa que fale Prisma: o client ou uma transação dele. */
type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

export interface ResultadoMovimento {
  readonly movimentoId: string;
  readonly lancamentoId: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// OS TOTAIS — leem o Record de sinal, sempre.
// ═══════════════════════════════════════════════════════════════════════════

/** Valor contábil da CLASSE (TR 5.15). `corte` opcional (data do movimento). */
export async function valorContabilDaClasse(
  tx: Tx,
  classeDeBensId: string,
  corte?: Date
): Promise<Money> {
  const movimentos = await tx.movimentoPatrimonial.findMany({
    where: {
      classeDeBensId,
      ...(corte !== undefined ? { dataMovimento: { lte: corte } } : {}),
    },
    select: { tipo: true, valor: true },
  });
  return valorContabil(
    movimentos.map((m) => ({ tipo: m.tipo, valor: toMoney(m.valor.toFixed(2)) }))
  );
}

/**
 * O VALOR BRUTO da classe — a BASE da depreciação (NBC TSP 07).
 *
 * `valorContábil = valorBruto − atualização acumulada`. Ver a nota extensa em
 * `valorBruto` (domínio): a base tem de acompanhar reavaliações NOS DOIS SENTIDOS,
 * impairment e baixas — mas NÃO a depreciação, sob pena de virar exponencial.
 */
export async function valorBrutoDaClasse(
  tx: Tx,
  classeDeBensId: string,
  corte?: Date
): Promise<Money> {
  const movimentos = await tx.movimentoPatrimonial.findMany({
    where: {
      classeDeBensId,
      ...(corte !== undefined ? { dataMovimento: { lte: corte } } : {}),
    },
    select: { tipo: true, valor: true },
  });
  return valorBruto(
    movimentos.map((m) => ({ tipo: m.tipo, valor: toMoney(m.valor.toFixed(2)) }))
  );
}

/** Valor contábil de UM BEM (TR 3.1) — só os movimentos amarrados a ele. */
export async function valorContabilDoBem(
  tx: Tx,
  bemId: string,
  corte?: Date
): Promise<Money> {
  const movimentos = await tx.movimentoPatrimonial.findMany({
    where: {
      bemId,
      ...(corte !== undefined ? { dataMovimento: { lte: corte } } : {}),
    },
    select: { tipo: true, valor: true },
  });
  return valorContabil(
    movimentos.map((m) => ({ tipo: m.tipo, valor: toMoney(m.valor.toFixed(2)) }))
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// O NÚCLEO — registrarMovimentoPatrimonial (interno)
// ═══════════════════════════════════════════════════════════════════════════

/** O roteiro do tipo, da TABELA. Fail-closed se não estiver parametrizado. */
async function roteiroDoTipo(
  tx: Tx,
  tipo: TipoMovimentoPatrimonial
): Promise<RoteiroDoTipo> {
  const r = await tx.roteiroPatrimonial.findUnique({
    where: { tipo },
    select: {
      contaDebito: { select: { codigo: true } },
      contaCredito: { select: { codigo: true } },
    },
  });
  if (r === null) {
    throw new Error(
      `ROTEIRO CONTÁBIL NÃO PARAMETRIZADO para o tipo ${tipo}. O M10 não inventa ` +
        `conta: sem roteiro, o movimento NÃO é registrado. Parametrize o roteiro ` +
        `(débito/crédito no PCASP) antes de usar este tipo.`
    );
  }
  return { contaDebito: r.contaDebito.codigo, contaCredito: r.contaCredito.codigo };
}

/** Resolve os códigos do roteiro em contas analíticas (fail-closed). */
async function partidasParaPersistir(
  tx: Tx,
  valor: Money,
  roteiro: RoteiroDoTipo
): Promise<
  readonly { contaId: string; tipo: string; subsistema: string; valor: Money }[]
> {
  // Motor puro do M01: ΣD == ΣC no subsistema PATRIMONIAL, antes de qualquer I/O.
  const partidas = comporPartidas(valor, roteiro);

  const codigos = [...new Set(partidas.map((p) => p.conta))];
  const contas = await tx.contaPcasp.findMany({
    where: { codigo: { in: codigos } },
    select: { id: true, codigo: true, analitica: true },
  });
  const porCodigo = new Map(contas.map((c) => [c.codigo, c]));

  const inexistentes = codigos.filter((c) => !porCodigo.has(c));
  if (inexistentes.length > 0) {
    throw new Error(
      `Conta(s) inexistente(s) no plano PCASP: ${inexistentes.join(", ")}.`
    );
  }
  const sinteticas = contas.filter((c) => !c.analitica);
  if (sinteticas.length > 0) {
    throw new Error(
      `Conta sintética não recebe partida: ` +
        `${sinteticas.map((c) => c.codigo).join(", ")}.`
    );
  }

  return partidas.map((p) => ({
    contaId: porCodigo.get(p.conta)!.id,
    tipo: p.tipo,
    subsistema: p.subsistema,
    valor: p.valor,
  }));
}

interface DadosDoMovimento {
  readonly classeDeBensId: string;
  readonly bemId?: string | undefined;
  readonly tipo: TipoMovimentoPatrimonial;
  readonly valor: Money;
  readonly dataMovimento: Date;
  /** Só nas atualizações por competência (bloco 2). */
  readonly competencia?: Date | undefined;
  readonly liquidacaoId?: string | undefined;
  /** TR 4.65 — a receita da alienação. */
  readonly receitaArrecadadaId?: string | undefined;
  /** Agrupa os movimentos de uma operação composta (alienação). */
  readonly operacaoId?: string | undefined;
  readonly motivo?: string | undefined;
  readonly criadoPor: string;
  readonly historico: string;
}

/**
 * O NÚCLEO: valida classe/bem, grava o movimento e o lançamento contábil, na
 * MESMA transação. Se qualquer perna falhar, nada existe.
 */
async function registrarMovimentoPatrimonial(
  tx: Tx,
  d: DadosDoMovimento
): Promise<ResultadoMovimento> {
  // A CLASSE existe e está ATIVA. Fail-closed.
  const classe = await tx.classeDeBens.findUnique({
    where: { id: d.classeDeBensId },
    select: { id: true, codigo: true, ativa: true },
  });
  if (classe === null) {
    throw new Error(`Classe de bens ${d.classeDeBensId} não existe.`);
  }
  if (!classe.ativa) {
    throw new Error(
      `Classe de bens ${classe.codigo} está INATIVA — não recebe movimento novo.`
    );
  }

  // O BEM (se houver) existe e é DA MESMA CLASSE.
  if (d.bemId !== undefined) {
    const bem = await tx.bemPatrimonial.findUnique({
      where: { id: d.bemId },
      select: { id: true, numeroTombamento: true, classeDeBensId: true },
    });
    if (bem === null) {
      throw new Error(`Bem patrimonial ${d.bemId} não existe.`);
    }
    if (bem.classeDeBensId !== classe.id) {
      throw new Error(
        `O bem ${bem.numeroTombamento} NÃO é da classe ${classe.codigo}. ` +
          `Amarrar um movimento da classe A a um bem da classe B faria o ` +
          `levantamento por classe (TR 5.15) e o valor do bem (TR 3.1) contarem ` +
          `histórias diferentes.`
      );
    }
  }

  const roteiro = await roteiroDoTipo(tx, d.tipo);
  const partidas = await partidasParaPersistir(tx, d.valor, roteiro);

  const lancamentoId = await lancarNoRazao(tx, {
      numeroControle: `PATR-${d.tipo}-${diaCivil(d.dataMovimento)}`,
      dataTransacao: d.dataMovimento,
      historico: d.historico,
      origemTipo: `PATRIMONIAL_${d.tipo}`,
      criadoPor: d.criadoPor,
      partidas: partidas.map((p) => ({
          contaId: p.contaId,
          tipo: p.tipo as "DEBITO" | "CREDITO",
          subsistema: p.subsistema as "ORCAMENTARIO" | "PATRIMONIAL" | "CONTROLE",
          valor: p.valor.toFixed(2),
          // fichaId NULO: o movimento patrimonial não executa orçamento — quem
          // executou foi o empenho/liquidação (M05).
        }))
    });

  const movimento = await tx.movimentoPatrimonial.create({
    data: {
      classeDeBensId: classe.id,
      bemId: d.bemId ?? null,
      tipo: d.tipo,
      valor: d.valor.toFixed(2),
      dataMovimento: d.dataMovimento,
      competencia: d.competencia ?? null,
      liquidacaoId: d.liquidacaoId ?? null,
      receitaArrecadadaId: d.receitaArrecadadaId ?? null,
      operacaoId: d.operacaoId ?? null,
      motivo: d.motivo ?? null,
      lancamentoId,
      criadoPor: d.criadoPor,
    },
    select: { id: true },
  });

  return { movimentoId: movimento.id, lancamentoId };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1) AQUISIÇÃO — o bem que nasce de uma liquidação de CAPITAL
// ═══════════════════════════════════════════════════════════════════════════

export async function adquirirBem(
  prisma: PrismaClient,
  input: AdquirirBemInput
): Promise<ResultadoMovimento> {
  const dados = zAdquirirBemInput.parse(input);

  return prisma.$transaction(async (tx) => {
    // ⚠️ A UG VEM DA LIQUIDAÇÃO — e ela é OBRIGATÓRIA aqui (`zAdquirirBemInput`): o bem adquirido nasce
    // de despesa liquidada. Quem recebe bem SEM liquidação (doação, comodato) usa a
    // `registrarEntradaAvulsa` — e essa não tem unidade nenhuma.
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.adquirirBem, { liquidacao: dados.liquidacaoId });

    const liq = await tx.liquidacao.findUnique({
      where: { id: dados.liquidacaoId },
      select: {
        id: true,
        numero: true,
        valor: true,
        estornoDeId: true,
        estornos: { select: { id: true } },
        empenho: {
          select: {
            numero: true,
            // TR 4.49 — o que o empenho PROMETEU adquirir (vínculo sintético).
            classeDeBensId: true,
            classeDeBens: { select: { codigo: true } },
            ficha: {
              select: {
                naturezaDespesa: {
                  select: { codNatureza: true, codigoCompleto: true },
                },
              },
            },
          },
        },
      },
    });
    if (liq === null) {
      throw new Error(`Liquidação ${dados.liquidacaoId} não encontrada.`);
    }

    // ANULADA — DERIVADO da relação `estornos` (o M05 não tem flag, e não vai
    // ter: "está anulada?" é `estornos.length > 0`, o invariante 2 do projeto).
    if (liq.estornos.length > 0) {
      throw new Error(
        `Liquidação ${liq.numero} está ANULADA — não incorpora bem. A despesa ` +
          `foi desfeita; incorporar o bem deixaria o ativo apoiado num fato que ` +
          `não existe mais.`
      );
    }
    if (liq.estornoDeId !== null) {
      throw new Error(
        `Liquidação ${liq.numero} É uma anulação de liquidação — não incorpora bem.`
      );
    }

    // ═══ SÓ DESPESA DE CAPITAL COMPRA BEM ═══
    // O grupo (2º dígito da natureza) tem de ser 4 (Investimentos) ou 5
    // (Inversões). Custeio (grupo 3) não vira ativo: incorporar material de
    // consumo ao imobilizado inflaria o patrimônio com o que já foi consumido.
    const natureza = liq.empenho.ficha.naturezaDespesa;
    if (!ehGrupoDeCapital(natureza.codNatureza)) {
      throw new Error(
        `A liquidação ${liq.numero} é de natureza ${natureza.codigoCompleto} — ` +
          `grupo ${natureza.codNatureza} (${descricaoDoGrupo(natureza.codNatureza)}), ` +
          `que NÃO é despesa de capital. Só os grupos 4 (Investimentos) e 5 ` +
          `(Inversões Financeiras) incorporam bem ao patrimônio.`
      );
    }

    // ═══ TR 4.49/5.15 — O BEM TEM DE SER O QUE O EMPENHO PROMETEU ═══
    // O `classeDeBensId` do empenho é o vínculo SINTÉTICO (a promessa); este
    // movimento é o FATO. Se divergirem, a licitação comprou uma coisa e o
    // patrimônio recebeu outra — e o levantamento por classe (5.15) fecharia com o
    // número certo na classe errada, que é pior do que não fechar.
    //
    // Empenho SEM classe (custeio, ou aquisição fora de contrato) não restringe
    // nada: não há promessa contra a qual conferir.
    if (
      liq.empenho.classeDeBensId !== null &&
      liq.empenho.classeDeBensId !== dados.classeDeBensId
    ) {
      throw new Error(
        `CLASSE DE BENS DIVERGENTE DO EMPENHO (TR 4.49/5.15): o empenho ` +
          `${liq.empenho.numero} foi emitido para adquirir a classe ` +
          `${liq.empenho.classeDeBens?.codigo ?? liq.empenho.classeDeBensId}, mas a ` +
          `incorporação está sendo feita na classe ${dados.classeDeBensId}. O que ` +
          `foi contratado e o que entrou no patrimônio têm de ser a mesma coisa — ` +
          `corrija a classe (do empenho, ou desta aquisição).`
      );
    }

    // O valor incorporado não pode exceder o que foi liquidado.
    const liquidado = toMoney(liq.valor.toFixed(2));
    if (dados.valor.greaterThan(liquidado)) {
      throw new Error(
        `Aquisição de ${dados.valor.toFixed(2)} excede a liquidação ` +
          `${liq.numero} (${liquidado.toFixed(2)}). Não se incorpora ao ` +
          `patrimônio mais do que a despesa reconhecida.`
      );
    }

    return registrarMovimentoPatrimonial(tx, {
      classeDeBensId: dados.classeDeBensId,
      ...(dados.bemId !== undefined ? { bemId: dados.bemId } : {}),
      tipo: "AQUISICAO",
      valor: dados.valor,
      dataMovimento: dados.dataMovimento,
      liquidacaoId: liq.id,
      criadoPor: dados.criadoPor,
      historico: `Aquisição de bem — liquidação ${liq.numero}`,
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 2) ENTRADA AVULSA — avaliação inicial, doação recebida
// ═══════════════════════════════════════════════════════════════════════════

export async function registrarEntradaAvulsa(
  prisma: PrismaClient,
  input: EntradaAvulsaInput
): Promise<ResultadoMovimento> {
  const dados = zEntradaAvulsaInput.parse(input);

  return prisma.$transaction(async (tx) => {
    // SEM UG: a entrada avulsa é justamente a que NÃO vem de liquidação (doação, comodato, achado
    // de inventário). Sem ficha, não há unidade — só a permissão global autoriza.
    await autorizarNo(
      tx,
      dados.criadoPor,
      ACAO_DO_SERVICO.registrarEntradaAvulsa,
      "ENTE"
    );

    return registrarMovimentoPatrimonial(tx, {
      classeDeBensId: dados.classeDeBensId,
      ...(dados.bemId !== undefined ? { bemId: dados.bemId } : {}),
      tipo: dados.tipo,
      valor: dados.valor,
      dataMovimento: dados.dataMovimento,
      motivo: dados.motivo,
      criadoPor: dados.criadoPor,
      historico: `${dados.tipo}: ${dados.motivo}`,
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 3) BAIXA — alienação, doação realizada
// ═══════════════════════════════════════════════════════════════════════════

export async function baixarBem(
  prisma: PrismaClient,
  input: BaixarBemInput
): Promise<ResultadoMovimento> {
  const dados = zBaixarBemInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.baixarBem, "ENTE");

    // ═══ NÃO SE BAIXA O QUE NÃO SE TEM ═══
    // O limite sai do SUM REAL (com os sinais), DENTRO da transação.
    const daClasse = await valorContabilDaClasse(tx, dados.classeDeBensId);
    if (dados.valor.greaterThan(daClasse)) {
      throw new Error(
        `Baixa de ${dados.valor.toFixed(2)} excede o valor contábil da classe ` +
          `(${daClasse.toFixed(2)}). Baixar mais do que a classe vale deixaria o ` +
          `ativo NEGATIVO — o ente estaria dando baixa em bem que não tem.`
      );
    }

    // E o limite do BEM é próprio: uma classe positiva NÃO pode mascarar a baixa
    // de um bem que já não vale nada. Sem isto, bastaria a classe ter saldo para
    // baixar duas vezes o mesmo bem.
    if (dados.bemId !== undefined) {
      const doBem = await valorContabilDoBem(tx, dados.bemId);
      if (dados.valor.greaterThan(doBem)) {
        throw new Error(
          `Baixa de ${dados.valor.toFixed(2)} excede o valor contábil do BEM ` +
            `(${doBem.toFixed(2)}), ainda que a classe tenha ` +
            `${daClasse.toFixed(2)}. O saldo da classe não pode mascarar a baixa ` +
            `de um bem que já não vale isso.`
        );
      }
    }

    return registrarMovimentoPatrimonial(tx, {
      classeDeBensId: dados.classeDeBensId,
      ...(dados.bemId !== undefined ? { bemId: dados.bemId } : {}),
      tipo: dados.tipo,
      valor: dados.valor,
      dataMovimento: dados.dataMovimento,
      motivo: dados.motivo,
      criadoPor: dados.criadoPor,
      historico: `${dados.tipo}: ${dados.motivo}`,
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 4) ATUALIZAÇÃO POR COMPETÊNCIA — depreciação / amortização / exaustão
// ═══════════════════════════════════════════════════════════════════════════

export interface ResultadoAtualizacao extends ResultadoMovimento {
  readonly tipo: TipoMovimentoPatrimonial;
  readonly base: Money;
  readonly valorResidual: Money;
  readonly parcelaCheia: Money;
  readonly valorDaParcela: Money;
}

/**
 * A ATUALIZAÇÃO MENSAL da classe (TR 5.84; MCASP 1.1.5).
 *
 * ═══ POR QUE A IDEMPOTÊNCIA NÃO É UM ÍNDICE ═══
 * A tentação é um índice único parcial `(classe, competencia) WHERE tipo=X AND
 * estornoDeId IS NULL`. Ele ESTARIA ERRADO: o estorno é uma linha NOVA apontando
 * para trás, e o ORIGINAL continua com `estornoDeId` NULL (append-only — o
 * original nunca é tocado). O índice, portanto, continuaria enxergando o original
 * e BLOQUEARIA a re-execução da competência depois de estornada — que é
 * exatamente o caso de uso ("errei a parcela, estorno e refaço").
 *
 * Quem governa a permissão é o SALDO DERIVADO, não uma trava: se o líquido
 * aplicado naquela competência é > 0, ela já está atualizada; se o estorno o
 * zerou, ela está livre de novo. É o mesmo padrão do vínculo do M09 (t7).
 */
export async function atualizarCompetencia(
  prisma: PrismaClient,
  input: AtualizarCompetenciaInput
): Promise<ResultadoAtualizacao> {
  const dados = zAtualizarCompetenciaInput.parse(input);
  const competencia = competenciaParaData(dados.competencia);

  return prisma.$transaction(async (tx) => {
    // SEM UG: a depreciação mensal é da CLASSE, em lote — não pertence a unidade nenhuma.
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.atualizarCompetencia, "ENTE");

    // (a) O PARÂMETRO — sem ele não há vida útil, e o sistema NÃO inventa uma.
    const parametro = await tx.parametroAtualizacaoClasse.findUnique({
      where: { classeDeBensId: dados.classeDeBensId },
      select: {
        metodo: true,
        vidaUtilMeses: true,
        percentualResidual: true,
        ativo: true,
      },
    });
    if (parametro === null) {
      throw new Error(
        `Classe ${dados.classeDeBensId} NÃO TEM PARÂMETRO de atualização ` +
          `(método, vida útil, residual). O MCASP sugere, mas quem decide é o ENTE: ` +
          `parametrize a classe antes de atualizar. Nada foi gravado.`
      );
    }
    if (!parametro.ativo) {
      throw new Error(
        `O parâmetro de atualização da classe ${dados.classeDeBensId} está ` +
          `INATIVO — a classe não é mais atualizada.`
      );
    }

    const metodo = parametro.metodo as MetodoAtualizacao;
    const tipo = TIPO_DO_METODO[metodo];

    // Todos os movimentos da classe, UMA leitura. Toda soma abaixo passa pelo
    // Record de sinal — nenhum SUM bruto.
    const movimentos = await tx.movimentoPatrimonial.findMany({
      where: { classeDeBensId: dados.classeDeBensId },
      select: { tipo: true, valor: true, competencia: true },
    });
    const comSinal = movimentos.map((m) => ({
      tipo: m.tipo,
      valor: toMoney(m.valor.toFixed(2)),
      competencia: m.competencia,
    }));

    // (b) IDEMPOTÊNCIA DERIVADA — ver a nota acima.
    const daCompetencia = comSinal.filter(
      (m) =>
        m.competencia !== null &&
        m.competencia.getTime() === competencia.getTime()
    );
    const jaAplicado = aplicadoNaCompetencia(daCompetencia, metodo);
    if (jaAplicado.greaterThan(0)) {
      throw new Error(
        `Competência ${dados.competencia} JÁ FOI ATUALIZADA para esta classe ` +
          `(${metodo} líquida de ${jaAplicado.toFixed(2)}). Para refazer, ESTORNE ` +
          `o movimento da competência primeiro — o saldo é que governa, não uma ` +
          `trava.`
      );
    }

    // (c) A BASE É O VALOR BRUTO (NBC TSP 07): tudo o que mexe no ativo entra —
    // reavaliação nos DOIS sentidos, impairment, baixas —, MENOS a própria
    // atualização acumulada (senão o método viraria exponencial).
    const base = valorBruto(comSinal);
    const atual = valorContabil(comSinal);

    // (d)(e)(f)(g) — aritmética PURA, conferida no teste contra literal.
    const calculo = calcularParcela(base, atual, {
      vidaUtilMeses: parametro.vidaUtilMeses,
      percentualResidual: toMoney(parametro.percentualResidual.toFixed(6)),
    });

    if (!calculo.teto.greaterThan(0)) {
      throw new Error(
        `Classe TOTALMENTE ATUALIZADA: o valor contábil (${atual.toFixed(2)}) já ` +
          `alcançou o valor residual (${calculo.valorResidual.toFixed(2)}). Não há ` +
          `mais o que ${metodo.toLowerCase()}. Nada foi gravado.`
      );
    }

    const r = await registrarMovimentoPatrimonial(tx, {
      classeDeBensId: dados.classeDeBensId,
      tipo,
      valor: calculo.valorDaParcela,
      dataMovimento: competencia,
      competencia,
      criadoPor: dados.criadoPor,
      historico:
        `${metodo} da competência ${dados.competencia} — base ` +
        `${base.toFixed(2)}, residual ${calculo.valorResidual.toFixed(2)}, ` +
        `${parametro.vidaUtilMeses} meses`,
    });

    return {
      ...r,
      tipo,
      base: calculo.base,
      valorResidual: calculo.valorResidual,
      parcelaCheia: calculo.parcelaCheia,
      valorDaParcela: calculo.valorDaParcela,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 5) CUSTO SUBSEQUENTE, REAVALIAÇÃO e IMPAIRMENT
// ═══════════════════════════════════════════════════════════════════════════

/** Custo subsequente: ENTRA no ativo — e AUMENTA a base depreciável. */
export async function registrarCustoSubsequente(
  prisma: PrismaClient,
  input: CustoSubsequenteInput
): Promise<ResultadoMovimento> {
  const dados = zCustoSubsequenteInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(
      tx,
      dados.criadoPor,
      ACAO_DO_SERVICO.registrarCustoSubsequente,
      "ENTE"
    );

    return registrarMovimentoPatrimonial(tx, {
      classeDeBensId: dados.classeDeBensId,
      ...(dados.bemId !== undefined ? { bemId: dados.bemId } : {}),
      tipo: "CUSTO_SUBSEQUENTE",
      valor: dados.valor,
      dataMovimento: dados.dataMovimento,
      motivo: dados.motivo,
      criadoPor: dados.criadoPor,
      historico: `CUSTO_SUBSEQUENTE: ${dados.motivo}`,
    });
  });
}

/**
 * Reavaliação — para cima ou para baixo.
 *
 * A REDUÇÃO tem teto (o mesmo padrão da baixa): não se reduz mais do que a classe
 * vale. Sem isso o ativo ficaria NEGATIVO, e um ativo negativo não é conservador:
 * é errado.
 */
export async function registrarReavaliacao(
  prisma: PrismaClient,
  input: ReavaliacaoInput
): Promise<ResultadoMovimento> {
  const dados = zReavaliacaoInput.parse(input);
  const tipo: TipoMovimentoPatrimonial =
    dados.sentido === "AUMENTO" ? "REAVALIACAO_AUMENTO" : "REAVALIACAO_REDUCAO";

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.registrarReavaliacao, "ENTE");

    if (dados.sentido === "REDUCAO") {
      await exigirTetoDeReducao(tx, dados.classeDeBensId, dados.valor, "reavaliação");
    }
    return registrarMovimentoPatrimonial(tx, {
      classeDeBensId: dados.classeDeBensId,
      ...(dados.bemId !== undefined ? { bemId: dados.bemId } : {}),
      tipo,
      valor: dados.valor,
      dataMovimento: dados.dataMovimento,
      motivo: dados.motivo,
      criadoPor: dados.criadoPor,
      historico: `${tipo}: ${dados.motivo}`,
    });
  });
}

/** Impairment (redução ao valor recuperável). Mesmo teto da reavaliação. */
export async function registrarImpairment(
  prisma: PrismaClient,
  input: ImpairmentInput
): Promise<ResultadoMovimento> {
  const dados = zImpairmentInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.registrarImpairment, "ENTE");

    await exigirTetoDeReducao(tx, dados.classeDeBensId, dados.valor, "impairment");

    return registrarMovimentoPatrimonial(tx, {
      classeDeBensId: dados.classeDeBensId,
      ...(dados.bemId !== undefined ? { bemId: dados.bemId } : {}),
      tipo: "IMPAIRMENT",
      valor: dados.valor,
      dataMovimento: dados.dataMovimento,
      motivo: dados.motivo,
      criadoPor: dados.criadoPor,
      historico: `IMPAIRMENT: ${dados.motivo}`,
    });
  });
}

/** Nenhuma redução leva o ativo abaixo de zero. O limite sai do SUM, na tx. */
async function exigirTetoDeReducao(
  tx: Tx,
  classeDeBensId: string,
  valor: Money,
  operacao: string
): Promise<void> {
  const atual = await valorContabilDaClasse(tx, classeDeBensId);
  if (valor.greaterThan(atual)) {
    throw new Error(
      `A ${operacao} de ${valor.toFixed(2)} excede o valor contábil da classe ` +
        `(${atual.toFixed(2)}). Reduzir mais do que a classe vale deixaria o ativo ` +
        `NEGATIVO.`
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 6) ALIENAÇÃO com GANHO/PERDA (TR 4.65) — operação COMPOSTA
// ═══════════════════════════════════════════════════════════════════════════

/** A atualização acumulada da classe, como número POSITIVO (retificadora). */
export async function atualizacaoAcumuladaDaClasse(
  tx: Tx,
  classeDeBensId: string,
  corte?: Date
): Promise<Money> {
  const movimentos = await tx.movimentoPatrimonial.findMany({
    where: {
      classeDeBensId,
      ...(corte !== undefined ? { dataMovimento: { lte: corte } } : {}),
    },
    select: { tipo: true, valor: true },
  });
  return atualizacaoAcumulada(
    movimentos.map((m) => ({ tipo: m.tipo, valor: toMoney(m.valor.toFixed(2)) }))
  );
}

/** O valor BRUTO de UM BEM — espelha o da classe (duplo teto do bloco 1). */
export async function valorBrutoDoBem(
  tx: Tx,
  bemId: string,
  corte?: Date
): Promise<Money> {
  const movimentos = await tx.movimentoPatrimonial.findMany({
    where: {
      bemId,
      ...(corte !== undefined ? { dataMovimento: { lte: corte } } : {}),
    },
    select: { tipo: true, valor: true },
  });
  return valorBruto(
    movimentos.map((m) => ({ tipo: m.tipo, valor: toMoney(m.valor.toFixed(2)) }))
  );
}

export interface ResultadoAlienacao {
  readonly operacaoId: string;
  readonly movimentoBaixaBruto: string;
  /** `null` quando o bem não tinha depreciação acumulada. */
  readonly movimentoBaixaAcumulada: string | null;
  readonly lancamentoResultadoId: string | null;
  readonly valorLiquidoContabil: Money;
  readonly ganhoPerda: Money;
  readonly chave: ChaveResultadoAlienacao | null;
}

/**
 * ALIENAÇÃO (TR 4.65) — UMA operação, DOIS movimentos e ATÉ TRÊS lançamentos.
 *
 * O bem sai do ativo pelo BRUTO e leva junto a DEPRECIAÇÃO ACUMULADA dele. O que
 * resta (o valor líquido contábil) é comparado com o que o comprador pagou:
 *
 *   ganho/perda = valorVenda − (brutoBaixado − acumuladaBaixada)
 *
 * TUDO NUMA TRANSAÇÃO. Meia alienação — o bruto baixado e a acumulada não, ou o
 * resultado sem a baixa — deixaria o ativo com um número que não corresponde a
 * bem nenhum. Se o roteiro do resultado faltar, NADA é gravado (nem os dois
 * movimentos): é o t5.
 */
export async function alienarBem(
  prisma: PrismaClient,
  input: AlienarBemInput
): Promise<ResultadoAlienacao> {
  const dados = zAlienarBemInput.parse(input);

  return prisma.$transaction(async (tx) => {
    // SEM UG: o bem é do ENTE (nem `ClasseDeBens` nem `BemPatrimonial` têm unidade), e vendê-lo gera
    // receita — que também é do ente.
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.alienarBem, "ENTE");

    // (a) A ACUMULADA NÃO ZERA O BRUTO.
    // Um bem 100% depreciado ainda tem o valor RESIDUAL — se a acumulada baixada
    // igualasse o bruto, o valor líquido contábil seria zero e a venda inteira
    // viraria "ganho", escondendo que o bem ainda valia alguma coisa nos livros.
    if (dados.acumuladaBaixada.greaterThanOrEqualTo(dados.valorBrutoBaixado)) {
      throw new Error(
        `A acumulada baixada (${dados.acumuladaBaixada.toFixed(2)}) não pode ` +
          `alcançar o valor bruto (${dados.valorBrutoBaixado.toFixed(2)}): nem um ` +
          `bem totalmente depreciado zera o bruto — sobra o valor residual. ` +
          `Confira a depreciação acumulada DESTE bem.`
      );
    }

    // (b) DUPLO TETO no BRUTO — classe e bem (o padrão do bloco 1).
    const brutoDaClasse = await valorBrutoDaClasse(tx, dados.classeDeBensId);
    if (dados.valorBrutoBaixado.greaterThan(brutoDaClasse)) {
      throw new Error(
        `A baixa de ${dados.valorBrutoBaixado.toFixed(2)} excede o valor BRUTO da ` +
          `classe (${brutoDaClasse.toFixed(2)}).`
      );
    }
    if (dados.bemId !== undefined) {
      const brutoDoBem = await valorBrutoDoBem(tx, dados.bemId);
      if (dados.valorBrutoBaixado.greaterThan(brutoDoBem)) {
        throw new Error(
          `A baixa de ${dados.valorBrutoBaixado.toFixed(2)} excede o valor BRUTO ` +
            `do BEM (${brutoDoBem.toFixed(2)}), ainda que a classe tenha ` +
            `${brutoDaClasse.toFixed(2)}. O saldo da classe não mascara o bem.`
        );
      }
    }

    // (c) A ACUMULADA BAIXADA cabe na acumulada da classe.
    const acumuladaDaClasse = await atualizacaoAcumuladaDaClasse(
      tx,
      dados.classeDeBensId
    );
    if (dados.acumuladaBaixada.greaterThan(acumuladaDaClasse)) {
      throw new Error(
        `A acumulada baixada (${dados.acumuladaBaixada.toFixed(2)}) excede a ` +
          `atualização acumulada da classe (${acumuladaDaClasse.toFixed(2)}). ` +
          `Não se baixa depreciação que nunca foi lançada.`
      );
    }

    // (d) A RECEITA (TR 4.65), quando informada.
    //
    // ⚠️ O GUARD ERA DEGRADADO ATÉ 50783ae, E O TEXTO DELE FICA AQUI:
    //     "GUARD DEGRADADO: o M04 não classifica receita 'de alienação' — dá para
    //      conferir que ela EXISTE e não foi anulada, e nada além disso. Pendência
    //      do M04 (natureza dedicada); quando chegar, o guard aperta aqui."
    //
    // A pendência chegou: a ORIGEM (2º dígito) é derivada do código, e alienação de
    // bens é a origem 2 da categoria de capital. Sem isso, dava para "sustentar" a
    // venda de um caminhão com a guia do IPTU — o bem sumia do ativo e o ganho de
    // alienação era calculado contra um dinheiro que entrou por outro motivo.
    if (dados.receitaArrecadadaId !== undefined) {
      const receita = await tx.receitaArrecadada.findUnique({
        where: { id: dados.receitaArrecadadaId },
        select: {
          id: true,
          numeroReceita: true,
          tipo: true,
          estornoDeId: true,
          estornos: { select: { id: true } },
          naturezaReceita: { select: { codigo: true, descricao: true } },
        },
      });
      if (receita === null) {
        throw new Error(
          `Receita arrecadada ${dados.receitaArrecadadaId} não encontrada.`
        );
      }
      if (receita.estornos.length > 0) {
        throw new Error(
          `A receita ${receita.numeroReceita} está ANULADA — não sustenta a ` +
            `alienação. Sem receita viva, o dinheiro da venda não entrou.`
        );
      }
      if (receita.estornoDeId !== null || receita.tipo === "ANULACAO") {
        throw new Error(
          `A receita ${receita.numeroReceita} É uma ANULAÇÃO de receita.`
        );
      }
      const origem = origemDaNatureza(receita.naturezaReceita.codigo);
      if (origem !== "ALIENACAO_DE_BENS") {
        throw new Error(
          `A receita ${receita.numeroReceita} é da natureza ` +
            `${receita.naturezaReceita.codigo} ` +
            `(${receita.naturezaReceita.descricao}), cuja ORIGEM é ${origem} — e NÃO ` +
            `ALIENACAO_DE_BENS (2º dígito 2 na categoria de capital, Portaria ` +
            `163/2001). O dinheiro da venda de um bem entra como alienação; ` +
            `sustentar a baixa com outra receita é dar baixa no patrimônio contra ` +
            `um dinheiro que entrou por outro motivo.`
        );
      }
    }

    const resultado = calcularResultadoDaAlienacao(
      dados.valorBrutoBaixado,
      dados.acumuladaBaixada,
      dados.valorVenda
    );

    // ═══ O ROTEIRO DO RESULTADO É EXIGIDO ANTES DE QUALQUER ESCRITA ═══
    // Se ele faltar, a transação nem começa a gravar — nada de meia alienação.
    let roteiroResultado: RoteiroDoTipo | null = null;
    if (resultado.chave !== null) {
      const r = await tx.roteiroResultadoAlienacao.findUnique({
        where: { chave: resultado.chave },
        select: {
          contaDebito: { select: { codigo: true } },
          contaCredito: { select: { codigo: true } },
        },
      });
      if (r === null) {
        throw new Error(
          `ROTEIRO CONTÁBIL NÃO PARAMETRIZADO para ${resultado.chave}. O M10 não ` +
            `inventa conta: sem roteiro do resultado, a alienação INTEIRA não é ` +
            `registrada. Parametrize o roteiro antes de alienar com ganho/perda.`
        );
      }
      roteiroResultado = {
        contaDebito: r.contaDebito.codigo,
        contaCredito: r.contaCredito.codigo,
      };
    }

    // (e) OS DOIS MOVIMENTOS — mesma `operacaoId`: estornar um estorna os dois.
    const operacaoId = randomUUID();

    const baixaBruto = await registrarMovimentoPatrimonial(tx, {
      classeDeBensId: dados.classeDeBensId,
      ...(dados.bemId !== undefined ? { bemId: dados.bemId } : {}),
      tipo: "BAIXA_ALIENACAO",
      valor: dados.valorBrutoBaixado,
      dataMovimento: dados.dataMovimento,
      operacaoId,
      ...(dados.receitaArrecadadaId !== undefined
        ? { receitaArrecadadaId: dados.receitaArrecadadaId }
        : {}),
      motivo: dados.motivo,
      criadoPor: dados.criadoPor,
      historico: `Alienação (baixa do valor bruto): ${dados.motivo}`,
    });

    // Zero NÃO vira movimento: o motor do ledger exige valor > 0, e um bem sem
    // depreciação nenhuma simplesmente não tem esta perna.
    let baixaAcumuladaId: string | null = null;
    if (dados.acumuladaBaixada.greaterThan(0)) {
      const r = await registrarMovimentoPatrimonial(tx, {
        classeDeBensId: dados.classeDeBensId,
        ...(dados.bemId !== undefined ? { bemId: dados.bemId } : {}),
        tipo: "BAIXA_DE_ATUALIZACAO_ACUMULADA",
        valor: dados.acumuladaBaixada,
        dataMovimento: dados.dataMovimento,
        operacaoId,
        motivo: dados.motivo,
        criadoPor: dados.criadoPor,
        historico: `Alienação (baixa da depreciação acumulada): ${dados.motivo}`,
      });
      baixaAcumuladaId = r.movimentoId;
    }

    // (f) O RESULTADO — lançamento SEM movimento: o ativo já saiu pela baixa.
    let lancamentoResultadoId: string | null = null;
    if (resultado.chave !== null && roteiroResultado !== null) {
      const partidas = await partidasParaPersistir(
        tx,
        resultado.valorDoResultado,
        roteiroResultado
      );
      const lanc = await lancarNoRazao(tx, {
          numeroControle: `PATR-${resultado.chave}-${dados.dataMovimento
            .toISOString()
            .slice(0, 10)}`,
          dataTransacao: dados.dataMovimento,
          historico:
            `${resultado.chave} na alienação — venda ` +
            `${dados.valorVenda.toFixed(2)}, líquido contábil ` +
            `${resultado.valorLiquidoContabil.toFixed(2)}: ${dados.motivo}`,
          origemTipo: `PATRIMONIAL_${resultado.chave}`,
          origemId: operacaoId,
          criadoPor: dados.criadoPor,
          partidas: partidas.map((p) => ({
              contaId: p.contaId,
              tipo: p.tipo as "DEBITO" | "CREDITO",
              subsistema: p.subsistema as
                | "ORCAMENTARIO"
                | "PATRIMONIAL"
                | "CONTROLE",
              valor: p.valor.toFixed(2),
            }))
        });
      lancamentoResultadoId = lanc;
    }

    return {
      operacaoId,
      movimentoBaixaBruto: baixaBruto.movimentoId,
      movimentoBaixaAcumulada: baixaAcumuladaId,
      lancamentoResultadoId,
      valorLiquidoContabil: resultado.valorLiquidoContabil,
      ganhoPerda: resultado.ganhoPerda,
      chave: resultado.chave,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 7) ESTORNO — simétrico, e nascido junto (a lição do M08)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Cria o lançamento de estorno de UM lançamento — pernas INVERTIDAS pelo motor
 * puro do M01 (`gerarEstorno`), nunca recompostas por roteiro: o estorno espelha o
 * ORIGINAL, mesmo que o roteiro do tipo mude depois. O `uq_estorno_unico` (M01)
 * protege a dupla anulação.
 */
async function estornarLancamento(
  tx: Tx,
  lancamentoOriginalId: string,
  p: {
    readonly data: Date;
    readonly motivo: string;
    readonly criadoPor: string;
    readonly origemTipo: string;
    readonly origemId: string;
  }
): Promise<string> {
  const lancOriginal = await tx.lancamentoContabil.findUniqueOrThrow({
    where: { id: lancamentoOriginalId },
    select: {
      id: true,
      numeroControle: true,
      dataTransacao: true,
      historico: true,
      estornoDeId: true,
      estornos: { select: { id: true } },
      partidas: {
        select: {
          tipo: true,
          subsistema: true,
          valor: true,
          conta: { select: { codigo: true } },
        },
      },
    },
  });

  const dominio: LancamentoContabil = {
    id: lancOriginal.id,
    numeroControle: lancOriginal.numeroControle,
    partidas: lancOriginal.partidas.map((x) => ({
      conta: x.conta.codigo,
      tipo: x.tipo,
      subsistema: x.subsistema,
      valor: toMoney(x.valor.toFixed(2)),
    })),
    dataTransacao: lancOriginal.dataTransacao,
    historico: lancOriginal.historico,
    ...(lancOriginal.estornoDeId !== null
      ? { estornoDeId: lancOriginal.estornoDeId }
      : {}),
    estornos: lancOriginal.estornos.map((e) => e.id),
  };

  const estorno = gerarEstorno(dominio, {
    idEstorno: randomUUID(),
    numeroControleEstorno: `${lancOriginal.numeroControle}-EST`,
    dataEstorno: p.data,
  });

  const codigos = [...new Set(estorno.partidas.map((x) => x.conta))];
  const contas = await tx.contaPcasp.findMany({
    where: { codigo: { in: codigos } },
    select: { id: true, codigo: true },
  });
  const porCodigo = new Map(contas.map((c) => [c.codigo, c.id]));

  const criadoId = await lancarNoRazao(tx, {
      id: estorno.id,
      numeroControle: estorno.numeroControle,
      dataTransacao: p.data,
      historico: `${estorno.historico} — ${p.motivo}`,
      origemTipo: p.origemTipo,
      origemId: p.origemId,
      estornoDeId: lancOriginal.id,
      criadoPor: p.criadoPor,
      partidas: estorno.partidas.map((x) => ({
          contaId: porCodigo.get(x.conta)!,
          tipo: x.tipo,
          subsistema: x.subsistema,
          // MESMO VALOR do original — nunca recarimbar, perna por perna.
          valor: x.valor.toFixed(2),
        }))
    });
  return criadoId;
}

/** Estorna UM movimento (movimento novo + lançamento invertido). */
async function estornarUmMovimento(
  tx: Tx,
  movimentoId: string,
  dados: { dataMovimento: Date; motivo: string; criadoPor: string }
): Promise<ResultadoMovimento> {
  const original = await tx.movimentoPatrimonial.findUniqueOrThrow({
    where: { id: movimentoId },
    select: {
      id: true,
      classeDeBensId: true,
      bemId: true,
      tipo: true,
      valor: true,
      competencia: true,
      liquidacaoId: true,
      receitaArrecadadaId: true,
      operacaoId: true,
      lancamentoId: true,
    },
  });

  const tipoEstorno = tipoDoEstorno(original.tipo);

  const lancEstornoId = await estornarLancamento(tx, original.lancamentoId, {
    data: dados.dataMovimento,
    motivo: dados.motivo,
    criadoPor: dados.criadoPor,
    origemTipo: `PATRIMONIAL_${tipoEstorno}`,
    origemId: original.id,
  });

  // uq_estorno_patrimonial_unico protege a devolução dupla do valor.
  const movEstorno = await tx.movimentoPatrimonial.create({
    data: {
      classeDeBensId: original.classeDeBensId,
      bemId: original.bemId,
      tipo: tipoEstorno,
      // MESMO VALOR — recarimbar devolveria à classe (e ao bem) um valor
      // diferente do que foi tomado.
      valor: original.valor,
      dataMovimento: dados.dataMovimento,
      // ⚠️ O ESTORNO HERDA A COMPETÊNCIA DO ORIGINAL.
      // Não é cosmético: o guard de idempotência da atualização soma os
      // movimentos DAQUELA competência (o método e os estornos dele). Se o estorno
      // nascesse sem competência, ele não entraria na soma — a competência
      // continuaria "já atualizada" para sempre, e a classe ficaria com a
      // depreciação desfeita no valor E travada para refazer.
      competencia: original.competencia,
      liquidacaoId: original.liquidacaoId,
      receitaArrecadadaId: original.receitaArrecadadaId,
      // e herda a OPERAÇÃO: o estorno pertence à mesma alienação.
      operacaoId: original.operacaoId,
      estornoDeId: original.id,
      lancamentoId: lancEstornoId,
      motivo: dados.motivo,
      criadoPor: dados.criadoPor,
    },
    select: { id: true },
  });

  return { movimentoId: movEstorno.id, lancamentoId: lancEstornoId };
}

export interface ResultadoEstorno extends ResultadoMovimento {
  /** Todos os movimentos de estorno criados (mais de um numa operação composta). */
  readonly movimentos: readonly string[];
  readonly lancamentos: readonly string[];
}

/**
 * ESTORNO — e, se o movimento pertence a uma OPERAÇÃO, ela é desfeita INTEIRA.
 *
 * ═══ POR QUE A OPERAÇÃO, E NÃO O MOVIMENTO ═══
 * A alienação (TR 4.65) grava DOIS movimentos (a baixa do bruto e a baixa da
 * acumulada) e um lançamento de resultado. Estornar só um deles deixaria o ativo
 * num estado que não corresponde a bem nenhum: o bruto de volta e a depreciação
 * não (ou o contrário), com um ganho lançado sobre uma venda que foi desfeita.
 *
 * `operacaoId` agrupa; estornar qualquer perna estorna todas — inclusive o
 * lançamento de ganho/perda, que não tem movimento próprio.
 */
export async function estornarMovimentoPatrimonial(
  prisma: PrismaClient,
  input: EstornarMovimentoPatrimonialInput
): Promise<ResultadoEstorno> {
  const dados = zEstornarMovimentoPatrimonialInput.parse(input);

  return prisma.$transaction(async (tx) => {
    // ⚠️ O ESCOPO SEGUE O MOVIMENTO: a AQUISIÇÃO tem liquidação (e unidade); a depreciação em lote,
    // não. Ver `ugDoMovimentoPatrimonial`.
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.estornarMovimentoPatrimonial, { movimentoPatrimonial: dados.movimentoId });

    const original = await tx.movimentoPatrimonial.findUnique({
      where: { id: dados.movimentoId },
      select: {
        id: true,
        operacaoId: true,
        estornoDeId: true,
        estornos: { select: { id: true } },
      },
    });
    if (original === null) {
      throw new Error(`Movimento patrimonial ${dados.movimentoId} não encontrado.`);
    }
    if (original.estornoDeId !== null) {
      throw new Error(
        `Movimento ${dados.movimentoId} JÁ É um estorno — um estorno não se estorna.`
      );
    }
    // "Já estornado?" é DERIVADO da back-relation. Nunca flag.
    // (A garantia DURA é o índice parcial `uq_estorno_patrimonial_unico`; este
    // recheck existe para dar mensagem limpa antes de o banco falar.)
    if (original.estornos.length > 0) {
      throw new Error(`Movimento ${dados.movimentoId} já foi estornado.`);
    }

    // Os movimentos VIVOS da operação (ou só este, se não houver operação).
    const alvos =
      original.operacaoId === null
        ? [original.id]
        : (
            await tx.movimentoPatrimonial.findMany({
              where: {
                operacaoId: original.operacaoId,
                estornoDeId: null,
                estornos: { none: {} },
              },
              select: { id: true },
              orderBy: { criadoEm: "asc" },
            })
          ).map((m) => m.id);

    const movimentos: string[] = [];
    const lancamentos: string[] = [];
    for (const alvo of alvos) {
      const r = await estornarUmMovimento(tx, alvo, dados);
      movimentos.push(r.movimentoId);
      lancamentos.push(r.lancamentoId);
    }

    // O LANÇAMENTO DE RESULTADO da alienação não tem movimento próprio — ele é
    // achado pela `origemId` (a operação) e estornado junto.
    if (original.operacaoId !== null) {
      const resultados = await tx.lancamentoContabil.findMany({
        where: {
          origemId: original.operacaoId,
          origemTipo: { in: ["PATRIMONIAL_GANHO_ALIENACAO", "PATRIMONIAL_PERDA_ALIENACAO"] },
          estornos: { none: {} },
        },
        select: { id: true, origemTipo: true },
      });
      for (const res of resultados) {
        lancamentos.push(
          await estornarLancamento(tx, res.id, {
            data: dados.dataMovimento,
            motivo: dados.motivo,
            criadoPor: dados.criadoPor,
            origemTipo: `${res.origemTipo}_ESTORNADO`,
            origemId: original.operacaoId,
          })
        );
      }
    }

    return {
      movimentoId: movimentos[0]!,
      lancamentoId: lancamentos[0]!,
      movimentos,
      lancamentos,
    };
  });
}
