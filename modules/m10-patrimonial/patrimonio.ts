import { competenciaCivil, diaCivil, janelaCivilDoMes } from "../../packages/datas/index.js";
import { versaoVigente } from "./roteiros.js";
import { parametroVigenteEm, type ParametroVigente } from "./parametros.js";
import { analisarEstornoPatrimonial } from "./estorno.js";
import type { CalculoDaParcela } from "./dominio.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { randomUUID } from "node:crypto";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import { somaLiquidaEstornaveis } from "../../packages/estornaveis/index.js";
import { travar } from "../../packages/locks/index.js";
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
  EH_ATUALIZACAO_ACUMULADA,
  SINAL_MOVIMENTO_PATRIMONIAL,
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

/** O roteiro resolvido, com a VERSÃO que o serviu (nula quando veio da linha legada). */
type RoteiroResolvido = RoteiroDoTipo & { readonly versaoId: string | null };

/**
 * O roteiro do tipo — a VERSÃO PUBLICADA em vigor (V3 4.5), ou a linha legada de
 * `RoteiroPatrimonial` quando o evento ainda não foi versionado. Fail-closed sem nenhuma.
 *
 * ⚠️ A VERSÃO VEM PRIMEIRO. Depois que um evento ganha versão, a linha legada deixa de ser
 * lida: ela é a origem (a versão 1 do backfill a cita), não a configuração. E o movimento
 * grava QUAL versão o serviu — trocar o roteiro depois não muda o que já foi lançado.
 */
async function roteiroDoTipo(
  tx: Tx,
  tipo: TipoMovimentoPatrimonial
): Promise<RoteiroResolvido> {
  const vigente = await versaoVigente(tx, "PATRIMONIAL", tipo);
  if (vigente !== null) {
    return { contaDebito: vigente.contaDebito, contaCredito: vigente.contaCredito, versaoId: vigente.id };
  }
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
  return { contaDebito: r.contaDebito.codigo, contaCredito: r.contaCredito.codigo, versaoId: null };
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

/**
 * O MOTIVO DE BAIXA DO ROL DO ENTE (TR 5.19.30; V3, pacote 2) — conferido DENTRO da
 * transação, antes de qualquer escrita. Inexistente ou INATIVO recusa nomeando: um motivo
 * desativado ainda classifica as baixas antigas (por isso não se apaga), mas não classifica
 * uma baixa nova. Devolve o par código/descrição para compor o histórico do lançamento.
 */
async function exigirMotivoDeBaixa(
  tx: Tx,
  motivoDeBaixaId: string
): Promise<{ readonly codigo: string; readonly descricao: string }> {
  const m = await tx.motivoDeBaixa.findUnique({
    where: { id: motivoDeBaixaId },
    select: { codigo: true, descricao: true, ativo: true },
  });
  if (m === null) {
    throw new Error(
      `MOTIVO DE BAIXA INEXISTENTE: não há motivo com id "${motivoDeBaixaId}" no rol do ente. ` +
        `Cadastre-o em Patrimônio > Motivos de Baixa. Nada foi gravado.`
    );
  }
  if (!m.ativo) {
    throw new Error(
      `MOTIVO DE BAIXA INATIVO: "${m.codigo} — ${m.descricao}" foi desativado e não classifica ` +
        `baixa nova (continua valendo para as antigas). Escolha um motivo ativo. Nada foi gravado.`
    );
  }
  return { codigo: m.codigo, descricao: m.descricao };
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
  /** TR 5.19.30 — o motivo de baixa do rol do ente (V3, pacote 2). Só nos tipos de baixa. */
  readonly motivoDeBaixaId?: string | undefined;
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
          `levantamento por classe e o valor do bem contarem ` +
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
      motivoDeBaixaId: d.motivoDeBaixaId ?? null,
      operacaoId: d.operacaoId ?? null,
      motivo: d.motivo ?? null,
      lancamentoId,
      // V3 (4.5): o vínculo entre o fato e a configuração que ele usou.
      versaoDeRoteiroId: roteiro.versaoId,
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
        `CLASSE DE BENS DIVERGENTE DO EMPENHO: o empenho ` +
          `${liq.empenho.numero} foi emitido para adquirir a classe ` +
          `${liq.empenho.classeDeBens?.codigo ?? liq.empenho.classeDeBensId}, mas a ` +
          `incorporação está sendo feita na classe ${dados.classeDeBensId}. O que ` +
          `foi contratado e o que entrou no patrimônio têm de ser a mesma coisa — ` +
          `corrija a classe (do empenho, ou desta aquisição).`
      );
    }

    // ⚠️ V28 — O TETO É CUMULATIVO, E É CONFERIDO DENTRO DA TRAVA DA LIQUIDAÇÃO. Antes, só o
    // valor DESTA chamada era comparado com o liquidado: duas incorporações de 150.000,00 sobre uma
    // liquidação de 150.000,00 passavam as duas, e o imobilizado nascia em dobro. Agora o que já
    // foi incorporado (aquisições vivas, descontados os estornos) mais o novo não passa do LÍQUIDO
    // da liquidação (descontadas as anulações parciais). A trava serializa duas telas ao mesmo
    // tempo sobre a mesma liquidação: a segunda lê a soma depois de a primeira gravar.
    await travar(tx, "Liquidacao", [liq.id]);
    const liquidado = await liquidoDaLiquidacaoNaTx(tx, liq.id);
    const jaIncorporado = await incorporadoDaLiquidacaoNaTx(tx, liq.id);
    const cabe = toMoney(liquidado.minus(jaIncorporado));
    if (dados.valor.greaterThan(cabe)) {
      throw new Error(
        `AQUISIÇÃO ACIMA DO LIQUIDADO: a liquidação ${liq.numero} vale ${liquidado.toFixed(2)} ` +
          `(descontadas as anulações), já incorporou ${jaIncorporado.toFixed(2)} ao patrimônio e ` +
          `só cabem mais ${cabe.toFixed(2)}; esta aquisição pede ${dados.valor.toFixed(2)}. Não se ` +
          `incorpora ao patrimônio mais do que a despesa reconhecida. Nada foi gravado.`
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

/** O líquido de UMA liquidação: o valor menos as anulações parciais vivas (zero se anulada). */
async function liquidoDaLiquidacaoNaTx(tx: Tx, id: string): Promise<Money> {
  const linhas = await tx.liquidacao.findMany({
    where: { OR: [{ id }, { anulacaoParcialDeId: id }, { estornoDeId: id }] },
    select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true },
  });
  return somaLiquidaEstornaveis(
    linhas.map((l) => ({ id: l.id, valor: toMoney(l.valor.toFixed(2)), estornoDeId: l.estornoDeId, anulacaoParcialDeId: l.anulacaoParcialDeId }))
  );
}

/** O que a liquidação JÁ incorporou ao patrimônio: as aquisições vivas, descontados os estornos. */
async function incorporadoDaLiquidacaoNaTx(tx: Tx, liquidacaoId: string): Promise<Money> {
  const aquisicoes = await tx.movimentoPatrimonial.findMany({
    where: { liquidacaoId, tipo: "AQUISICAO", estornoDeId: null },
    select: { id: true, valor: true },
  });
  if (aquisicoes.length === 0) return toMoney("0.00");
  const estornos = await tx.movimentoPatrimonial.findMany({
    where: { estornoDeId: { in: aquisicoes.map((a) => a.id) } },
    select: { id: true, valor: true, estornoDeId: true },
  });
  return somaLiquidaEstornaveis([
    ...aquisicoes.map((a) => ({ id: a.id, valor: toMoney(a.valor.toFixed(2)), estornoDeId: null })),
    ...estornos.map((e) => ({ id: e.id, valor: toMoney(e.valor.toFixed(2)), estornoDeId: e.estornoDeId })),
  ]);
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

    const motivoDoRol =
      dados.motivoDeBaixaId === undefined ? null : await exigirMotivoDeBaixa(tx, dados.motivoDeBaixaId);

    return registrarMovimentoPatrimonial(tx, {
      classeDeBensId: dados.classeDeBensId,
      ...(dados.bemId !== undefined ? { bemId: dados.bemId } : {}),
      tipo: dados.tipo,
      valor: dados.valor,
      dataMovimento: dados.dataMovimento,
      motivo: dados.motivo,
      criadoPor: dados.criadoPor,
      ...(dados.motivoDeBaixaId !== undefined ? { motivoDeBaixaId: dados.motivoDeBaixaId } : {}),
      historico:
        motivoDoRol === null
          ? `${dados.tipo}: ${dados.motivo}`
          : `${dados.tipo} [${motivoDoRol.codigo} — ${motivoDoRol.descricao}]: ${dados.motivo}`,
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 4) ATUALIZAÇÃO POR COMPETÊNCIA — depreciação / amortização / exaustão
//    (V4, §4: por bem elegível, com corte temporal, vigência e identidade de execução)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ═══ O QUE A V4 CORRIGE (achados A04 e A05 da auditoria de 77cbcc9) ═══
 *
 * A prévia somava TODOS os movimentos da classe, de qualquer data, e usava a ÚLTIMA versão do
 * parâmetro: a competência de março absorvia a entrada de abril e a régua de maio por serem os
 * dados mais recentes. E a atualização gerava UM movimento da classe (sem `bemId`), enquanto o
 * valor de cada bem lia só os movimentos amarrados a ele — a depreciação nunca chegava ao bem.
 *
 * ═══ AS DEFINIÇÕES, DITAS ═══
 *   · DATA DE NEGÓCIO (`dataMovimento`) × INSTANTE DE REGISTRO (`criadoEm`/`sequencia`): a base
 *     de uma competência é o que tem data de negócio ATÉ O CORTE (o último instante civil do mês),
 *     entre os movimentos VIVOS (estornado e estorno não existem — a anulação apaga o fato da
 *     base, em qualquer data em que tenha sido registrada);
 *   · INÍCIO DA ATUALIZAÇÃO DE UM BEM: a competência da sua primeira entrada viva. Um bem que
 *     entra em abril NÃO é elegível em março ("entrada após o corte"); é elegível no próprio mês
 *     da entrada (política declarada: MÊS DA ENTRADA — trocar para "mês seguinte" é decisão de
 *     parâmetro, pendência `INICIO-DA-ATUALIZACAO-NO-MES-SEGUINTE`);
 *   · VIGÊNCIA DO PARÂMETRO: `parametroVigenteEm(classe, competência)` — a versão cuja
 *     `vigenteDesde` alcança a competência, não a mais recente;
 *   · ALTERAÇÃO RETROATIVA: uma versão não alcança competência já processada
 *     (`definirParametroDeAtualizacao` recusa); corrigir o passado é estornar a execução e
 *     reprocessar, com a prévia mostrando o impacto;
 *   · RASTREABILIDADE: cada item grava a memória (parâmetro, base, contábil antes, residual,
 *     parcela, teto, corte, execução); a execução grava escopo, versão, totais e o lançamento.
 *
 * ═══ UMA ÚNICA ORIGEM DOS VALORES ═══
 * Os ITENS são a origem. Um item por bem elegível (`bemId` do movimento) e, quando a classe tem
 * movimentos sem bem (avaliação do acervo, dados anteriores à individualização), UM item do
 * "acervo sem individualização" (`bemId` nulo) — os dois conjuntos PARTICIONAM os movimentos da
 * classe, então Σ(itens) = classe, por construção. O LANÇAMENTO CONTÁBIL é UM por execução, com
 * a soma dos itens; os itens o compartilham (`lancamentoId`). Nada é contabilizado duas vezes.
 * ARREDONDAMENTO: cada item a duas casas (`calcularParcela`); o agregado é a SOMA dos itens
 * arredondados — não se recalcula o agregado e se distribui o resto.
 *
 * ⚠️ O QUE NÃO SE FAZ: a depreciação da classe inteira lançada ANTES desta versão (sem `bemId`)
 * não é distribuída por proporção aos bens. Ela fica visível em `conciliacaoDaClasse` como
 * "acumulada sem individualização" — pendência `RECONCILIACAO-HISTORICA-DA-DEPRECIACAO-POR-CLASSE`,
 * fluxo autorizado a definir; o razão não se reescreve.
 *
 * ═══ POR QUE A IDEMPOTÊNCIA NÃO É UM ÍNDICE ═══
 * O estorno é uma linha NOVA apontando para trás, e o ORIGINAL continua com `estornoDeId` NULL.
 * Quem governa é o SALDO DERIVADO por item: se o item tem atualização VIVA naquela competência,
 * já está atualizado; estornada a execução, os itens ficam livres de novo.
 */

export type SituacaoDaCompetencia =
  | "PRONTA"
  | "SEM_PARAMETRO"
  | "PARAMETRO_INATIVO"
  | "JA_ATUALIZADA"
  | "TOTALMENTE_ATUALIZADA"
  | "SEM_BASE";

export type SituacaoDoItem = "PRONTO" | "JA_ATUALIZADO" | "TOTALMENTE_ATUALIZADO" | "NAO_ELEGIVEL" | "SEM_VALOR";

export interface ItemDaPrevia {
  /** `null` = o acervo sem individualização (movimentos da classe sem bem). */
  readonly bemId: string | null;
  readonly numeroTombamento: string | null;
  readonly descricao: string | null;
  /** A data de negócio da primeira entrada viva do alvo — o início da atualização. */
  readonly entradaEm: Date | null;
  readonly base: Money;
  readonly valorContabil: Money;
  readonly jaAplicado: Money;
  readonly calculo: CalculoDaParcela | null;
  readonly situacao: SituacaoDoItem;
  readonly nota: string | null;
}

export interface PreviaDaCompetencia {
  readonly competencia: Date;
  /** O último instante civil do mês — a data de corte da base. */
  readonly corte: Date;
  readonly escopo: "CLASSE" | "BEM";
  readonly bemId: string | null;
  readonly parametro: ParametroVigente | null;
  readonly tipo: TipoMovimentoPatrimonial | null;
  /** TOTAIS dos itens PRONTOS — o que a execução lançará. */
  readonly base: Money;
  readonly valorContabil: Money;
  readonly jaAplicado: Money;
  readonly calculo: CalculoDaParcela | null;
  readonly itens: readonly ItemDaPrevia[];
  readonly situacao: SituacaoDaCompetencia;
  /** A recusa, nas MESMAS palavras que `atualizarCompetencia` usa — `null` quando PRONTA. */
  readonly recusa: string | null;
}

type MovimentoVivo = {
  readonly tipo: TipoMovimentoPatrimonial;
  readonly valor: Money;
  readonly dataMovimento: Date;
  readonly competencia: Date | null;
  readonly bemId: string | null;
};

const ZERO = toMoney("0.00");
const somar = (xs: readonly Money[]): Money => xs.reduce((a, b) => toMoney(a.plus(b)), ZERO);

function itemDe(
  alvo: { readonly bemId: string | null; readonly numeroTombamento: string | null; readonly descricao: string | null },
  vivosDoAlvo: readonly MovimentoVivo[],
  noCorte: readonly MovimentoVivo[],
  competencia: Date,
  parametro: ParametroVigente
): ItemDaPrevia {
  const entradas = vivosDoAlvo.filter((m) => !EH_ATUALIZACAO_ACUMULADA[m.tipo] && SINAL_MOVIMENTO_PATRIMONIAL[m.tipo] === 1);
  const entradaEm = entradas.length === 0 ? null : entradas.reduce((a, m) => (m.dataMovimento < a ? m.dataMovimento : a), entradas[0]!.dataMovimento);
  const base = valorBruto(noCorte);
  const atual = valorContabil(noCorte);
  const daCompetencia = noCorte.filter((m) => m.competencia !== null && m.competencia.getTime() === competencia.getTime());
  const jaAplicado = aplicadoNaCompetencia(daCompetencia, parametro.metodo);
  const comum = { ...alvo, entradaEm, base, valorContabil: atual, jaAplicado };
  if (noCorte.length === 0) {
    return { ...comum, calculo: null, situacao: "NAO_ELEGIVEL", nota: entradaEm === null ? "sem movimento de valor" : `entrada em ${diaCivil(entradaEm)}, depois do corte da competência` };
  }
  if (!base.greaterThan(0)) {
    return { ...comum, calculo: null, situacao: "SEM_VALOR", nota: "sem valor bruto no corte (baixado ou zerado)" };
  }
  if (jaAplicado.greaterThan(0)) {
    return { ...comum, calculo: null, situacao: "JA_ATUALIZADO", nota: `já atualizado nesta competência (${jaAplicado.toFixed(2)})` };
  }
  const calculo = calcularParcela(base, atual, { vidaUtilMeses: parametro.vidaUtilMeses, percentualResidual: parametro.percentualResidual });
  if (!calculo.teto.greaterThan(0)) {
    return { ...comum, calculo, situacao: "TOTALMENTE_ATUALIZADO", nota: `o valor contábil (${atual.toFixed(2)}) já alcançou o residual (${calculo.valorResidual.toFixed(2)})` };
  }
  return { ...comum, calculo, situacao: "PRONTO", nota: null };
}


/**
 * A PRÉVIA DA COMPETÊNCIA — a mesma leitura e a mesma aritmética da atualização, SEM escrever,
 * item a item. `atualizarCompetencia` a chama DENTRO da transação e recusa com a mesma mensagem:
 * não há duas contas, há uma conta e dois momentos de olhar para ela.
 */
export async function preverCompetencia(
  tx: Tx,
  pedido: { readonly classeDeBensId: string; readonly competencia: string; readonly bemId?: string | undefined }
): Promise<PreviaDaCompetencia> {
  const janela = janelaCivilDoMes(pedido.competencia);
  const competencia = competenciaParaData(pedido.competencia);
  const corte = janela.fim;
  const escopo: "CLASSE" | "BEM" = pedido.bemId === undefined ? "CLASSE" : "BEM";
  const bemId = pedido.bemId ?? null;
  const parametro = await parametroVigenteEm(tx, pedido.classeDeBensId, pedido.competencia);

  // Os movimentos VIVOS da classe, uma leitura; a base é o recorte pelo corte.
  const crus = await tx.movimentoPatrimonial.findMany({
    where: { classeDeBensId: pedido.classeDeBensId, estornoDeId: null, estornos: { none: {} } },
    select: { tipo: true, valor: true, dataMovimento: true, competencia: true, bemId: true },
    orderBy: { sequencia: "asc" },
  });
  const vivos: MovimentoVivo[] = crus.map((m) => ({ tipo: m.tipo, valor: toMoney(m.valor.toFixed(2)), dataMovimento: m.dataMovimento, competencia: m.competencia, bemId: m.bemId }));
  const noCorte = vivos.filter((m) => m.dataMovimento.getTime() <= corte.getTime());
  const valorContabilDaClasseNoCorte = valorContabil(noCorte);
  const vazio = (situacao: SituacaoDaCompetencia, recusa: string, tipo: TipoMovimentoPatrimonial | null): PreviaDaCompetencia => ({
    competencia, corte, escopo, bemId, parametro, tipo, base: valorBruto(noCorte), valorContabil: valorContabilDaClasseNoCorte, jaAplicado: ZERO, calculo: null, itens: [], situacao, recusa,
  });

  // (a) O PARÂMETRO VIGENTE NA COMPETÊNCIA — sem ele não há vida útil, e o sistema NÃO inventa uma.
  if (parametro === null) {
    return vazio(
      "SEM_PARAMETRO",
      `Classe ${pedido.classeDeBensId} NÃO TEM PARÂMETRO de atualização vigente em ${pedido.competencia} ` +
        `(método, vida útil, residual). O MCASP sugere, mas quem decide é o ENTE: parametrize a classe, ` +
        `com vigência que alcance esta competência, antes de atualizar. Nada foi gravado.`,
      null
    );
  }
  const metodo = parametro.metodo;
  const tipo = TIPO_DO_METODO[metodo];
  if (!parametro.ativo) {
    return vazio("PARAMETRO_INATIVO", `O parâmetro de atualização da classe ${pedido.classeDeBensId} está INATIVO em ${pedido.competencia} — a classe não é mais atualizada.`, tipo);
  }

  // (b) OS ALVOS: cada bem da classe com movimento vivo, e o acervo sem individualização.
  const bens = await tx.bemPatrimonial.findMany({
    where: { classeDeBensId: pedido.classeDeBensId, ...(bemId !== null ? { id: bemId } : {}) },
    select: { id: true, numeroTombamento: true, descricao: true },
    orderBy: { numeroTombamento: "asc" },
  });
  if (bemId !== null && bens.length === 0) {
    return vazio("SEM_BASE", `O bem ${bemId} não existe nesta classe. Nada foi gravado.`, tipo);
  }
  const itens: ItemDaPrevia[] = [];
  for (const b of bens) {
    const doBem = vivos.filter((m) => m.bemId === b.id);
    if (doBem.length === 0) continue; // sem movimento de valor: não entra na lista
    itens.push(itemDe({ bemId: b.id, numeroTombamento: b.numeroTombamento, descricao: b.descricao }, doBem, noCorte.filter((m) => m.bemId === b.id), competencia, parametro));
  }
  if (bemId === null) {
    const semBem = vivos.filter((m) => m.bemId === null);
    if (semBem.length > 0) {
      itens.push(itemDe({ bemId: null, numeroTombamento: null, descricao: "Acervo sem individualização (movimentos da classe sem bem)" }, semBem, noCorte.filter((m) => m.bemId === null), competencia, parametro));
    }
  }

  const prontos = itens.filter((i) => i.situacao === "PRONTO" && i.calculo !== null);
  const jaAtualizados = itens.filter((i) => i.situacao === "JA_ATUALIZADO");
  const totalmente = itens.filter((i) => i.situacao === "TOTALMENTE_ATUALIZADO");
  const jaAplicado = somar(itens.map((i) => i.jaAplicado));
  const base = somar(prontos.map((i) => i.base));
  const calculo: CalculoDaParcela | null =
    prontos.length === 0
      ? null
      : {
          base,
          valorResidual: somar(prontos.map((i) => i.calculo!.valorResidual)),
          parcelaCheia: somar(prontos.map((i) => i.calculo!.parcelaCheia)),
          teto: somar(prontos.map((i) => i.calculo!.teto)),
          valorDaParcela: somar(prontos.map((i) => i.calculo!.valorDaParcela)),
        };
  const comum = { competencia, corte, escopo, bemId, parametro, tipo, base, valorContabil: valorContabilDaClasseNoCorte, jaAplicado, calculo, itens };
  if (prontos.length > 0) return { ...comum, situacao: "PRONTA", recusa: null };
  if (jaAtualizados.length > 0) {
    return {
      ...comum,
      situacao: "JA_ATUALIZADA",
      recusa:
        `Competência ${pedido.competencia} JÁ FOI ATUALIZADA para ${escopo === "BEM" ? "este bem" : "esta classe"} ` +
        `(${metodo} líquida de ${jaAplicado.toFixed(2)} em ${jaAtualizados.length} item(ns)). Para refazer, ESTORNE ` +
        `a execução da competência primeiro — o saldo é que governa, não uma trava.`,
    };
  }
  if (totalmente.length > 0) {
    return {
      ...comum,
      situacao: "TOTALMENTE_ATUALIZADA",
      recusa:
        `${escopo === "BEM" ? "Bem" : "Classe"} TOTALMENTE ATUALIZAD${escopo === "BEM" ? "O" : "A"}: o valor contábil já alcançou o ` +
        `valor residual em todos os itens. Não há mais o que ${metodo.toLowerCase()}. Nada foi gravado.`,
    };
  }
  return {
    ...comum,
    situacao: "SEM_BASE",
    recusa:
      `Nenhum item elegível em ${pedido.competencia}: ` +
      (itens.length === 0 ? "a classe não tem movimento de valor" : itens.map((i) => `${i.numeroTombamento ?? "acervo"}: ${i.nota ?? i.situacao}`).join("; ")) +
      `. Nada foi gravado.`,
  };
}

export interface ItemAtualizado {
  readonly movimentoId: string;
  readonly memoriaId: string;
  readonly bemId: string | null;
  readonly numeroTombamento: string | null;
  readonly base: Money;
  readonly valorDaParcela: Money;
}

export interface ResultadoAtualizacao extends ResultadoMovimento {
  readonly tipo: TipoMovimentoPatrimonial;
  /** Totais da execução (a soma dos itens). */
  readonly base: Money;
  readonly valorResidual: Money;
  readonly parcelaCheia: Money;
  readonly valorDaParcela: Money;
  /** A memória do PRIMEIRO item (compatibilidade); cada item tem a sua em `itens`. */
  readonly memoriaId: string;
  readonly versaoDeParametroId: string | null;
  /** V4: a identidade da execução mensal e os itens que ela lançou. */
  readonly execucaoId: string;
  readonly escopo: "CLASSE" | "BEM";
  readonly itens: readonly ItemAtualizado[];
}

export async function atualizarCompetencia(
  prisma: PrismaClient,
  input: AtualizarCompetenciaInput
): Promise<ResultadoAtualizacao> {
  const dados = zAtualizarCompetenciaInput.parse(input);

  return prisma.$transaction(async (tx) => {
    // SEM UG: a depreciação mensal é da CLASSE, em lote — não pertence a unidade nenhuma.
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.atualizarCompetencia, "ENTE");

    const classe = await tx.classeDeBens.findUnique({ where: { id: dados.classeDeBensId }, select: { id: true, codigo: true, ativa: true } });
    if (classe === null) throw new Error(`Classe de bens ${dados.classeDeBensId} não existe.`);
    if (!classe.ativa) throw new Error(`Classe de bens ${classe.codigo} está INATIVA — não recebe movimento novo.`);

    // A MESMA conta da prévia, dentro da transação — e a mesma recusa.
    const previa = await preverCompetencia(tx, { classeDeBensId: dados.classeDeBensId, competencia: dados.competencia, bemId: dados.bemId });
    if (previa.situacao !== "PRONTA" || previa.calculo === null || previa.parametro === null || previa.tipo === null) {
      throw new Error(previa.recusa ?? `Competência ${dados.competencia} não está pronta para processar.`);
    }
    const { parametro, calculo, tipo, competencia, corte } = previa;
    const metodo = parametro.metodo;
    const prontos = previa.itens.filter((i) => i.situacao === "PRONTO" && i.calculo !== null);

    // ═══ UM LANÇAMENTO POR EXECUÇÃO: a soma dos itens, pelo roteiro do tipo ═══
    const roteiro = await roteiroDoTipo(tx, tipo);
    const partidas = await partidasParaPersistir(tx, calculo.valorDaParcela, roteiro);
    const execucaoId = randomUUID();
    const lancamentoId = await lancarNoRazao(tx, {
      numeroControle: `PATR-${tipo}-${diaCivil(competencia)}`,
      dataTransacao: competencia,
      historico:
        `${metodo} da competência ${dados.competencia} — ${prontos.length} item(ns), base ${calculo.base.toFixed(2)}, ` +
        `residual ${calculo.valorResidual.toFixed(2)}, ${parametro.vidaUtilMeses} meses` +
        (previa.escopo === "BEM" ? ` (escopo: um bem)` : ""),
      origemTipo: `PATRIMONIAL_${tipo}`,
      origemId: execucaoId,
      criadoPor: dados.criadoPor,
      partidas: partidas.map((p) => ({
        contaId: p.contaId,
        tipo: p.tipo as "DEBITO" | "CREDITO",
        subsistema: p.subsistema as "ORCAMENTARIO" | "PATRIMONIAL" | "CONTROLE",
        valor: p.valor.toFixed(2),
      })),
    });
    await tx.execucaoDeAtualizacao.create({
      data: {
        id: execucaoId,
        classeDeBensId: classe.id,
        competencia,
        corte,
        escopo: previa.escopo,
        bemId: previa.bemId,
        versaoDeParametroId: parametro.versaoId,
        metodo,
        quantidadeDeItens: prontos.length,
        base: calculo.base.toFixed(2),
        valorDaParcela: calculo.valorDaParcela.toFixed(2),
        lancamentoId,
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });

    // ═══ OS ITENS — um movimento e uma memória por alvo, na mesma transação ═══
    const itens: ItemAtualizado[] = [];
    for (const item of prontos) {
      const c = item.calculo!;
      const movimento = await tx.movimentoPatrimonial.create({
        data: {
          classeDeBensId: classe.id,
          bemId: item.bemId,
          tipo,
          valor: c.valorDaParcela.toFixed(2),
          dataMovimento: competencia,
          competencia,
          operacaoId: execucaoId,
          lancamentoId,
          versaoDeRoteiroId: roteiro.versaoId,
          criadoPor: dados.criadoPor,
        },
        select: { id: true },
      });
      const memoria = await tx.memoriaDeAtualizacao.create({
        data: {
          movimentoId: movimento.id,
          versaoDeParametroId: parametro.versaoId,
          execucaoId,
          corte,
          metodo,
          vidaUtilMeses: parametro.vidaUtilMeses,
          percentualResidual: parametro.percentualResidual.toFixed(6),
          base: item.base.toFixed(2),
          valorContabilAntes: item.valorContabil.toFixed(2),
          valorResidual: c.valorResidual.toFixed(2),
          parcelaCheia: c.parcelaCheia.toFixed(2),
          teto: c.teto.toFixed(2),
          valorDaParcela: c.valorDaParcela.toFixed(2),
        },
        select: { id: true },
      });
      itens.push({ movimentoId: movimento.id, memoriaId: memoria.id, bemId: item.bemId, numeroTombamento: item.numeroTombamento, base: item.base, valorDaParcela: c.valorDaParcela });
    }
    const primeiro = itens[0]!;
    return {
      movimentoId: primeiro.movimentoId,
      lancamentoId,
      tipo,
      base: calculo.base,
      valorResidual: calculo.valorResidual,
      parcelaCheia: calculo.parcelaCheia,
      valorDaParcela: calculo.valorDaParcela,
      memoriaId: primeiro.memoriaId,
      versaoDeParametroId: parametro.versaoId,
      execucaoId,
      escopo: previa.escopo,
      itens,
    };
  });
}

export interface ConciliacaoDaClasse {
  readonly classe: Money;
  /** Σ do valor contábil dos bens (movimentos com `bemId`). */
  readonly somaDosBens: Money;
  /** O valor contábil dos movimentos SEM bem (o acervo sem individualização). */
  readonly semIndividualizacao: Money;
  /** classe − (bens + sem individualização): zero por construção (os conjuntos particionam). */
  readonly diferenca: Money;
  /** A atualização acumulada lançada pela classe inteira ANTES da V4 (sem bem e sem execução) — a reconciliação histórica a definir. */
  readonly acumuladaHistoricaSemBem: Money;
  readonly bens: number;
}

/**
 * A CONCILIAÇÃO item → classe → razão (V4, §4.2). Só lê. A `diferenca` é zero por construção; o
 * número que importa é `acumuladaHistoricaSemBem`: a depreciação lançada pela classe inteira antes
 * de existir item por bem, que nenhum bem carrega e que só uma reconciliação autorizada resolve.
 */
export async function conciliacaoDaClasse(tx: Tx, classeDeBensId: string, corte?: Date): Promise<ConciliacaoDaClasse> {
  const crus = await tx.movimentoPatrimonial.findMany({
    where: { classeDeBensId, estornoDeId: null, estornos: { none: {} }, ...(corte !== undefined ? { dataMovimento: { lte: corte } } : {}) },
    select: { tipo: true, valor: true, bemId: true, operacaoId: true, competencia: true },
  });
  const todos = crus.map((m) => ({ tipo: m.tipo, valor: toMoney(m.valor.toFixed(2)) }));
  const comBem = crus.filter((m) => m.bemId !== null).map((m) => ({ tipo: m.tipo, valor: toMoney(m.valor.toFixed(2)) }));
  const semBem = crus.filter((m) => m.bemId === null).map((m) => ({ tipo: m.tipo, valor: toMoney(m.valor.toFixed(2)) }));
  const historicos = crus
    .filter((m) => m.bemId === null && m.competencia !== null && m.operacaoId === null && EH_ATUALIZACAO_ACUMULADA[m.tipo])
    .map((m) => ({ tipo: m.tipo, valor: toMoney(m.valor.toFixed(2)) }));
  const classe = valorContabil(todos);
  const somaDosBens = valorContabil(comBem);
  const semIndividualizacao = valorContabil(semBem);
  return {
    classe,
    somaDosBens,
    semIndividualizacao,
    diferenca: toMoney(classe.minus(somaDosBens).minus(semIndividualizacao)),
    acumuladaHistoricaSemBem: atualizacaoAcumulada(historicos),
    bens: new Set(crus.filter((m) => m.bemId !== null).map((m) => m.bemId)).size,
  };
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
      await exigirTetoDeReducao(tx, dados.classeDeBensId, dados.valor, "reavaliação", dados.bemId);
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

    await exigirTetoDeReducao(tx, dados.classeDeBensId, dados.valor, "impairment", dados.bemId);

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
  operacao: string,
  bemId?: string | undefined
): Promise<void> {
  const atual = await valorContabilDaClasse(tx, classeDeBensId);
  if (valor.greaterThan(atual)) {
    throw new Error(
      `A ${operacao} de ${valor.toFixed(2)} excede o valor contábil da classe ` +
        `(${atual.toFixed(2)}). Reduzir mais do que a classe vale deixaria o ativo ` +
        `NEGATIVO.`
    );
  }
  // V4 (§4.3): o teto do BEM é próprio — a classe positiva não mascara um bem que já não vale isso.
  if (bemId !== undefined) {
    const doBem = await valorContabilDoBem(tx, bemId);
    if (valor.greaterThan(doBem)) {
      throw new Error(
        `A ${operacao} de ${valor.toFixed(2)} excede o valor contábil do BEM (${doBem.toFixed(2)}), ` +
          `ainda que a classe tenha ${atual.toFixed(2)}. O saldo da classe não mascara o bem.`
      );
    }
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
      // V3 (4.5): a versão publicada primeiro; a linha legada só enquanto não houver versão.
      const v = await versaoVigente(tx, "RESULTADO_ALIENACAO", resultado.chave);
      const r =
        v !== null
          ? { contaDebito: { codigo: v.contaDebito }, contaCredito: { codigo: v.contaCredito } }
          : await tx.roteiroResultadoAlienacao.findUnique({
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
    // O motivo do rol (TR 5.19.30) classifica a baixa do valor BRUTO — o ato em si. A baixa da
    // acumulada é retificadora e anda em par com ela pelo `operacaoId`.
    const motivoDoRol =
      dados.motivoDeBaixaId === undefined ? null : await exigirMotivoDeBaixa(tx, dados.motivoDeBaixaId);

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
      ...(dados.motivoDeBaixaId !== undefined ? { motivoDeBaixaId: dados.motivoDeBaixaId } : {}),
      historico:
        motivoDoRol === null
          ? `Alienação (baixa do valor bruto): ${dados.motivo}`
          : `Alienação (baixa do valor bruto) [${motivoDoRol.codigo} — ${motivoDoRol.descricao}]: ${dados.motivo}`,
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
  dados: { dataMovimento: Date; motivo: string; criadoPor: string },
  /** V4: os itens de uma execução compartilham o lançamento — ele é estornado UMA vez, e os estornos o reusam. */
  estornosDeLancamento: Map<string, string> = new Map()
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

  let lancEstornoId = estornosDeLancamento.get(original.lancamentoId);
  if (lancEstornoId === undefined) {
    lancEstornoId = await estornarLancamento(tx, original.lancamentoId, {
      data: dados.dataMovimento,
      motivo: dados.motivo,
      criadoPor: dados.criadoPor,
      origemTipo: `PATRIMONIAL_${tipoEstorno}`,
      origemId: original.operacaoId ?? original.id,
    });
    estornosDeLancamento.set(original.lancamentoId, lancEstornoId);
  }

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
    // ═══ V3 (pacote 2, unidade 4) — A ANÁLISE DE DEPENDÊNCIAS, dentro da transação ═══
    // Quem ficaria inválido com este estorno (a competência calculada sobre a base que
    // incluía o movimento, a redução conferida contra um teto que o incluía) BLOQUEIA,
    // nomeando: estorne primeiro, do mais recente ao mais antigo. A tela mostra a mesma
    // análise antes; aqui ela é refeita porque a tela não é fronteira de segurança.
    const analise = await analisarEstornoPatrimonial(tx, original.id);
    if (analise.dependentes.length > 0) {
      throw new Error(analise.bloqueios.join("\n"));
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
              orderBy: { sequencia: "asc" },
            })
          ).map((m) => m.id);

    const movimentos: string[] = [];
    const lancamentos: string[] = [];
    const estornosDeLancamento = new Map<string, string>();
    for (const alvo of alvos) {
      const r = await estornarUmMovimento(tx, alvo, dados, estornosDeLancamento);
      movimentos.push(r.movimentoId);
      if (!lancamentos.includes(r.lancamentoId)) lancamentos.push(r.lancamentoId);
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
