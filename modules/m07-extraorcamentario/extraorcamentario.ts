import { diaCivil } from "../../packages/datas/index.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { randomUUID } from "node:crypto";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
// ⚠️ O FUNIL DO RAZÃO (M01). Todo lançamento passa por ele — e é lá que mora o
// travamento de competência (M16). Ver `m01-funil.test.ts`: o grep-teste proíbe o
// `lancamentoContabil.create` fora dele.
import { lancarNoRazao } from "../m01-core-contabil/razao.js";
import {
  gerarEstorno,
  type LancamentoContabil,
} from "../../packages/ledger/index.js";
import {
  comporPartidas,
  tipoDoEstorno,
  totaisPorConsignatario,
  zEstornarMovimentoExtraInput,
  zRegistrarDispendioExtraInput,
  zRegistrarIngressoExtraInput,
  type EstornarMovimentoExtraInput,
  type RegistrarDispendioExtraInput,
  type RegistrarIngressoExtraInput,
  type RoteiroContabil,
  type TotaisExtra,
} from "./dominio.js";

/**
 * OPERAÇÕES EXTRAORÇAMENTÁRIAS.
 *
 * ═══ A REGRA QUE ATRAVESSA TUDO ═══
 * NENHUMA operação daqui cria `MovimentoDotacao`, nem entra na fila do art. 141.
 * É dinheiro de terceiro: não é receita, não é despesa, não passa pelo orçamento.
 *
 * TODA soma passa por `totaisDoConsignatario()` — nenhum `SUM` bruto. Ver a
 * lição do M08 em `dominio.ts`.
 */

/** Qualquer coisa que fale Prisma: o client ou uma transação dele. */
export type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/**
 * Os totais de um (tipoConsignacao, credor), com o sinal de cada tipo.
 *
 * ⚠️ NUNCA some `MovimentoExtraorcamentario` sem passar por aqui: os quatro tipos
 * não têm o mesmo sinal, e um `SUM(*)` cru faria o estorno virar mais uma baixa.
 */
export async function totaisDoConsignatario(
  tx: Tx,
  tipoConsignacaoId: string,
  credorConsignatario: string
): Promise<TotaisExtra> {
  const movimentos = await tx.movimentoExtraorcamentario.findMany({
    where: { tipoConsignacaoId, credorConsignatario },
    select: { tipo: true, valor: true },
  });

  // A função PURA do domínio faz a aritmética — aqui só se lê o banco.
  return totaisPorConsignatario(
    movimentos.map((m) => ({
      tipo: m.tipo,
      valor: toMoney(m.valor.toFixed(2)),
    }))
  );
}

/** Resolve o roteiro em partidas persistíveis (contas analíticas, fail-closed). */
async function partidasParaPersistir(
  tx: Tx,
  valor: Money,
  roteiro: RoteiroContabil
): Promise<
  readonly { contaId: string; tipo: string; subsistema: string; valor: Money }[]
> {
  const partidas = comporPartidas(valor, roteiro); // motor puro: ΣD == ΣC

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

export async function criarLancamentoExtra(
  tx: Tx,
  l: {
    id?: string;
    numeroControle: string;
    data: Date;
    historico: string;
    origemTipo: string;
    origemId?: string;
    estornoDeId?: string;
    criadoPor: string;
    valor: Money;
    roteiro: RoteiroContabil;
  }
): Promise<string> {
  const partidas = await partidasParaPersistir(tx, l.valor, l.roteiro);

  return lancarNoRazao(tx, {
    ...(l.id !== undefined ? { id: l.id } : {}),
    numeroControle: l.numeroControle,
    dataTransacao: l.data,
    historico: l.historico,
    origemTipo: l.origemTipo,
    origemId: l.origemId ?? null,
    estornoDeId: l.estornoDeId ?? null,
    criadoPor: l.criadoPor,
    partidas: partidas.map((p) => ({
      contaId: p.contaId,
      tipo: p.tipo as "DEBITO" | "CREDITO",
      subsistema: p.subsistema as "ORCAMENTARIO" | "PATRIMONIAL" | "CONTROLE",
      valor: p.valor.toFixed(2),
      // fichaId NULO: dinheiro de terceiro não tem dimensão orçamentária.
    })),
  });
}

/** O tipo de consignação tem de existir E estar ATIVO. Fail-closed. */
export async function exigirTipoAtivo(
  tx: Tx,
  tipoConsignacaoId: string
): Promise<{
  id: string;
  codigo: string;
  /** Código PCASP do passivo, do CADASTRO. `null` = não parametrizado. */
  contaPassivo: string | null;
}> {
  const t = await tx.tipoConsignacao.findUnique({
    where: { id: tipoConsignacaoId },
    select: {
      id: true,
      codigo: true,
      ativo: true,
      contaPassivo: { select: { codigo: true } },
    },
  });
  if (t === null) {
    throw new Error(`Tipo de consignação ${tipoConsignacaoId} não existe.`);
  }
  if (!t.ativo) {
    throw new Error(
      `Tipo de consignação ${t.codigo} está INATIVO — não recebe movimento novo.`
    );
  }
  return { id: t.id, codigo: t.codigo, contaPassivo: t.contaPassivo?.codigo ?? null };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1) INGRESSO avulso (caução, depósito)
// ═══════════════════════════════════════════════════════════════════════════

export async function registrarIngressoExtra(
  prisma: PrismaClient,
  input: RegistrarIngressoExtraInput,
  roteiro: RoteiroContabil
): Promise<{ readonly movimentoId: string; readonly lancamentoId: string }> {
  const dados = zRegistrarIngressoExtraInput.parse(input);

  return prisma.$transaction(async (tx) => {
    // SEM UG: o extraorçamentário é dinheiro de TERCEIRO em trânsito pelo caixa do ente (consignação,
    // caução, depósito). Não é execução de ficha nenhuma — a `MovimentoExtraorcamentario` não tem
    // unidade, e nem poderia ter.
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.registrarIngressoExtra, "ENTE");

    const tipo = await exigirTipoAtivo(tx, dados.tipoConsignacaoId);

    const conta = await tx.contaBancaria.findUnique({
      where: { codigo: dados.contaBancaria },
      select: { id: true },
    });
    if (conta === null) {
      throw new Error(`Conta bancária "${dados.contaBancaria}" não cadastrada.`);
    }

    const lancamentoId = await criarLancamentoExtra(tx, {
      numeroControle: `EXTRA-IN-${tipo.codigo}-${diaCivil(dados.data)}`,
      data: dados.data,
      historico: dados.historico,
      origemTipo: "INGRESSO_EXTRA",
      criadoPor: dados.criadoPor,
      valor: dados.valor,
      roteiro,
    });

    const mov = await tx.movimentoExtraorcamentario.create({
      data: {
        tipoConsignacaoId: tipo.id,
        credorConsignatario: dados.credorConsignatario,
        contaBancariaId: conta.id,
        tipo: "INGRESSO",
        valor: dados.valor.toFixed(2),
        data: dados.data,
        lancamentoId,
        historico: dados.historico,
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });

    // NENHUM MovimentoDotacao.
    return { movimentoId: mov.id, lancamentoId };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 2) DISPÊNDIO (repasse ao consignatário, devolução da caução)
// ═══════════════════════════════════════════════════════════════════════════

export async function registrarDispendioExtra(
  prisma: PrismaClient,
  input: RegistrarDispendioExtraInput,
  roteiro: RoteiroContabil
): Promise<{ readonly movimentoId: string; readonly lancamentoId: string }> {
  const dados = zRegistrarDispendioExtraInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.registrarDispendioExtra, "ENTE");

    const tipo = await exigirTipoAtivo(tx, dados.tipoConsignacaoId);

    const conta = await tx.contaBancaria.findUnique({
      where: { codigo: dados.contaBancaria },
      select: { id: true, fonteId: true },
    });
    if (conta === null) {
      throw new Error(`Conta bancária "${dados.contaBancaria}" não cadastrada.`);
    }

    // TR 5.23 — a fonte tem de casar com a da conta bancária. Vale aqui também:
    // devolver caução com dinheiro de outra fonte é desvio igual.
    if (conta.fonteId !== dados.fonteId) {
      throw new Error(
        `TR 5.23 — fonte do dispêndio (${dados.fonteId}) diverge da fonte da ` +
          `conta bancária "${dados.contaBancaria}" (${conta.fonteId}).`
      );
    }

    // FAIL-CLOSED: não se repassa mais do que se reteve. O saldo sai do SUM real
    // (com os sinais), DENTRO da transação.
    const totais = await totaisDoConsignatario(
      tx,
      tipo.id,
      dados.credorConsignatario
    );
    if (dados.valor.greaterThan(totais.saldo)) {
      throw new Error(
        `Dispêndio excede o saldo extraorçamentário de ` +
          `${dados.credorConsignatario} (${tipo.codigo}): ingressou ` +
          `${totais.ingressoLiquido.toFixed(2)}, já saiu ` +
          `${totais.dispendioLiquido.toFixed(2)}, saldo ` +
          `${totais.saldo.toFixed(2)}, solicitado ${dados.valor.toFixed(2)}. ` +
          `Não se repassa dinheiro de terceiro que não se reteve.`
      );
    }

    const lancamentoId = await criarLancamentoExtra(tx, {
      numeroControle: `EXTRA-OUT-${tipo.codigo}-${diaCivil(dados.data)}`,
      data: dados.data,
      historico: dados.historico,
      origemTipo: "DISPENDIO_EXTRA",
      criadoPor: dados.criadoPor,
      valor: dados.valor,
      roteiro,
    });

    const mov = await tx.movimentoExtraorcamentario.create({
      data: {
        tipoConsignacaoId: tipo.id,
        credorConsignatario: dados.credorConsignatario,
        contaBancariaId: conta.id,
        tipo: "DISPENDIO",
        valor: dados.valor.toFixed(2),
        data: dados.data,
        lancamentoId,
        historico: dados.historico,
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });

    return { movimentoId: mov.id, lancamentoId };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 3) ESTORNO (simétrico: serve para INGRESSO e para DISPENDIO)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Estorna um movimento extraorçamentário. APPEND-ONLY: registro NOVO, o original
 * intocado. Um movimento é estornado no máximo uma vez
 * (`uq_estorno_extra_unico`).
 *
 * Estornar um INGRESSO reduz o saldo (a retenção não devia ter acontecido).
 * Estornar um DISPÊNDIO devolve o saldo (o repasse não devia ter acontecido — o
 * ente volta a dever ao consignatário).
 */
export async function estornarMovimentoExtra(
  prisma: PrismaClient,
  input: EstornarMovimentoExtraInput
): Promise<{ readonly movimentoId: string; readonly lancamentoId: string }> {
  const dados = zEstornarMovimentoExtraInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.estornarMovimentoExtra, "ENTE");

    const original = await tx.movimentoExtraorcamentario.findUnique({
      where: { id: dados.movimentoId },
      select: {
        id: true,
        tipo: true,
        valor: true,
        tipoConsignacaoId: true,
        credorConsignatario: true,
        contaBancariaId: true,
        pagamentoId: true,
        lancamentoId: true,
        estornoDeId: true,
        estornos: { select: { id: true } },
      },
    });
    if (original === null) {
      throw new Error(`Movimento ${dados.movimentoId} não encontrado.`);
    }
    if (original.estornoDeId !== null) {
      throw new Error(
        `Movimento ${dados.movimentoId} JÁ É um estorno — um estorno não se estorna.`
      );
    }
    if (original.estornos.length > 0) {
      throw new Error(`Movimento ${dados.movimentoId} já foi estornado.`);
    }

    // ═══ A RETENÇÃO NÃO SE ESTORNA SOZINHA ═══
    // Um movimento com `pagamentoId` nasceu DENTRO de um pagamento e divide com
    // ele o lançamento COMPOSTO. Estorná-lo por aqui chamaria `gerarEstorno`
    // sobre esse lançamento e inverteria o PAGAMENTO INTEIRO — caixa, obrigação
    // com o fornecedor e orçamentário —, e ainda queimaria o `uq_estorno_unico`
    // do lançamento, deixando a anulação de verdade sem como acontecer.
    // O fato é um só: quem o desfaz é a anulação do pagamento.
    if (original.pagamentoId !== null) {
      throw new Error(
        `Movimento ${dados.movimentoId} é uma RETENÇÃO NA FONTE do pagamento ` +
          `${original.pagamentoId}: ele compartilha o lançamento composto do ` +
          `pagamento e não se estorna sozinho — estorná-lo aqui inverteria o ` +
          `pagamento inteiro. Anule o PAGAMENTO (anularPagamento do M05, ou ` +
          `anularPagamentoRestosAPagar do M08): a anulação estorna a retenção ` +
          `junto, na mesma transação.`
      );
    }

    // O domínio decide o tipo do estorno (e barra estornar um estorno).
    const tipoEstorno = tipoDoEstorno(original.tipo);

    // Estornar um INGRESSO tira dinheiro do saldo. Se ele já foi repassado, o
    // saldo fica NEGATIVO — o ente teria repassado dinheiro que não reteve.
    if (tipoEstorno === "ESTORNO_INGRESSO") {
      const totais = await totaisDoConsignatario(
        tx,
        original.tipoConsignacaoId,
        original.credorConsignatario
      );
      const valor = toMoney(original.valor.toFixed(2));
      if (valor.greaterThan(totais.saldo)) {
        throw new Error(
          `Não dá para estornar o ingresso: o saldo de ` +
            `${original.credorConsignatario} é ${totais.saldo.toFixed(2)} e o ` +
            `ingresso foi de ${valor.toFixed(2)} — parte do dinheiro JÁ FOI ` +
            `REPASSADA. Estorne o dispêndio primeiro.`
        );
      }
    }

    // Lançamento original -> domínio -> gerarEstorno (motor puro do M01).
    const lancOriginal = await tx.lancamentoContabil.findUniqueOrThrow({
      where: { id: original.lancamentoId },
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
      partidas: lancOriginal.partidas.map((p) => ({
        conta: p.conta.codigo,
        tipo: p.tipo,
        subsistema: p.subsistema,
        valor: toMoney(p.valor.toFixed(2)),
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
      dataEstorno: dados.data,
    });

    const lancamentoId = await criarLancamentoExtra(tx, {
      id: estorno.id,
      numeroControle: estorno.numeroControle,
      data: dados.data,
      historico: `${estorno.historico} — ${dados.motivo}`,
      origemTipo: `${original.tipo}_ESTORNADO`,
      origemId: original.id,
      // uq_estorno_unico (M01) protege a dupla anulação do lançamento.
      estornoDeId: lancOriginal.id,
      criadoPor: dados.criadoPor,
      valor: toMoney(original.valor.toFixed(2)),
      roteiro: estorno.partidas.map((p) => ({
        conta: p.conta,
        tipo: p.tipo,
        subsistema: p.subsistema,
      })),
    });

    // uq_estorno_extra_unico protege a devolução dupla.
    const mov = await tx.movimentoExtraorcamentario.create({
      data: {
        tipoConsignacaoId: original.tipoConsignacaoId,
        credorConsignatario: original.credorConsignatario,
        contaBancariaId: original.contaBancariaId,
        tipo: tipoEstorno,
        valor: original.valor,
        data: dados.data,
        pagamentoId: original.pagamentoId,
        estornoDeId: original.id,
        lancamentoId,
        historico: `Estorno de ${original.tipo}`,
        motivo: dados.motivo,
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });

    // NENHUM MovimentoDotacao.
    return { movimentoId: mov.id, lancamentoId };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Consulta
// ═══════════════════════════════════════════════════════════════════════════

export interface SaldoExtra extends TotaisExtra {
  readonly tipoConsignacaoId: string;
  readonly tipoConsignacaoCodigo: string;
  readonly credorConsignatario: string;
}

export async function saldoExtraorcamentario(
  prisma: PrismaClient,
  tipoConsignacaoId: string,
  credorConsignatario: string
): Promise<SaldoExtra> {
  const tipo = await prisma.tipoConsignacao.findUniqueOrThrow({
    where: { id: tipoConsignacaoId },
    select: { id: true, codigo: true },
  });
  const totais = await totaisDoConsignatario(
    prisma,
    tipoConsignacaoId,
    credorConsignatario
  );
  return {
    ...totais,
    tipoConsignacaoId: tipo.id,
    tipoConsignacaoCodigo: tipo.codigo,
    credorConsignatario,
  };
}
