import { exigirFonteNoRolDaConta } from "../m05-despesa/guard-fonte.js";
import { diaCivil } from "../../packages/datas/index.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { randomUUID } from "node:crypto";
import { travar } from "../../packages/locks/index.js";
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
  exigirMotivoDoEstornoExtra,
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
      // ⚠️ A DECISÃO VIGENTE DO ENTE (V11 V8.3), e ela MANDA sobre as colunas.
      //
      // A conta e a situação deixaram de ser editáveis: elas são um FATO append-only
      // (`DecisaoDoTipoDeConsignacao`), porque escolher em que passivo o INSS retido vira dívida é
      // classificação contábil, e a pergunta "desde quando ia para esta conta?" tem de ter
      // resposta — um razão de cinco anos atrás foi escriturado contra a decisão daquela época.
      decisoes: {
        orderBy: { criadoEm: "desc" },
        take: 1,
        select: { ativo: true, contaPassivo: { select: { codigo: true } } },
      },
    },
  });
  if (t === null) {
    throw new Error(`Tipo de consignação ${tipoConsignacaoId} não existe.`);
  }

  // ⚠️ SEM DECISÃO NÃO É "SEM CONTA": é um tipo ANTERIOR ao cadastro do ente (as linhas que o seed
  // criou antes da V8.3). Cair para as colunas antigas nesse caso é o que impede que a novidade
  // apague todo tipo já semeado — e é por isso que os dois casos não se confundem.
  const vigente = t.decisoes[0];
  const ativo = vigente?.ativo ?? t.ativo;
  const conta = vigente === undefined ? (t.contaPassivo?.codigo ?? null) : (vigente.contaPassivo?.codigo ?? null);

  if (!ativo) {
    throw new Error(
      `Tipo de consignação ${t.codigo} está INATIVO — não recebe movimento novo.`
    );
  }
  return { id: t.id, codigo: t.codigo, contaPassivo: conta };
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

    // ⚠️ MESMA REGRA DO DISPÊNDIO, e ela faltava aqui: a fonte tem de estar NO ROL da
    // conta. Receber caução numa conta que não comporta aquela fonte é a mesma mistura de
    // dinheiro vinculado que o dispêndio já barrava na saída.
    await exigirFonteNoRolDaConta(
      tx,
      { id: conta.id },
      dados.fonteId,
      "ingresso extraorçamentário"
    );

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
        fonteId: dados.fonteId,
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
    // ⚠️ "NO ROL", e não "igual à da conta" — a conta admite várias fontes desde o
    // ADR de 2026-09-10. A regra mora em `m05-despesa/guard-fonte.ts`, uma vez.
    await exigirFonteNoRolDaConta(tx, { id: conta.id }, dados.fonteId, "dispêndio extraorçamentário");

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
        // ⚠️ A FONTE JÁ ERA CONFERIDA contra o rol da conta e NÃO ERA GRAVADA. Conferir e
        // esquecer é o pior dos dois mundos: o guard roda, o dado se perde, e a consulta
        // volta a atribuir tudo à fonte padrão da conta.
        fonteId: dados.fonteId,
        tipo: "DISPENDIO",
        valor: dados.valor.toFixed(2),
        data: dados.data,
        lancamentoId,
        historico: dados.historico,
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });

    // ═══ A COMPOSIÇÃO POR ORIGEM (C34) ═══
    if (dados.alocacoes !== undefined && dados.alocacoes.length > 0) {
      await alocarRecolhimento(tx, {
        recolhimentoId: mov.id,
        valorDoRecolhimento: dados.valor,
        tipoConsignacaoId: tipo.id,
        credorConsignatario: dados.credorConsignatario,
        parcelas: dados.alocacoes,
        criadoPor: dados.criadoPor,
      });
    }

    return { movimentoId: mov.id, lancamentoId };
  });
}

/**
 * ═══ QUANTO DE UM INGRESSO AINDA FALTA RECOLHER ═══
 *
 * ⚠️ AS DUAS EXCLUSÕES SÃO A REGRA, NÃO DETALHE. Uma alocação deixa de valer quando o
 * RECOLHIMENTO dela foi estornado — e nesse instante a retenção volta a ter aquela parcela a
 * recolher, exatamente aquela, não uma fatia proporcional de um agregado. As linhas não são
 * apagadas: quem as ignora é esta leitura, porque apagá-las destruiria a resposta a "o que aquela
 * guia quitou, antes de ser desfeita?".
 *
 * E um ingresso ESTORNADO não tem nada a recolher: a retenção não devia ter acontecido.
 */
export async function aRecolherDoIngresso(
  tx: Tx,
  ingressoId: string
): Promise<Money> {
  const ing = await tx.movimentoExtraorcamentario.findUnique({
    where: { id: ingressoId },
    select: {
      tipo: true,
      valor: true,
      estornos: { select: { id: true } },
      alocacoesRecebidas: {
        select: {
          valor: true,
          recolhimento: { select: { estornos: { select: { id: true } } } },
        },
      },
    },
  });
  if (ing === null) throw new Error(`Movimento ${ingressoId} não encontrado.`);
  if (ing.tipo !== "INGRESSO") {
    throw new Error(
      `O movimento ${ingressoId} é ${ing.tipo}, e só um INGRESSO (retenção, caução, depósito) tem ` +
        `o que recolher.`
    );
  }
  if (ing.estornos.length > 0) return toMoney("0.00");

  let alocado = toMoney("0.00");
  for (const a of ing.alocacoesRecebidas) {
    if (a.recolhimento.estornos.length > 0) continue;
    alocado = toMoney(alocado.plus(toMoney(a.valor.toFixed(2))));
  }
  const bruto = toMoney(ing.valor.toFixed(2));
  return toMoney(bruto.minus(alocado));
}

/**
 * Grava a composição de um recolhimento, conferindo tudo DENTRO da transação.
 *
 * ⚠️ AS QUATRO RECUSAS, e cada uma existe porque a ausência dela produziria um número que
 * fecha e está errado:
 *
 *   1. a soma das parcelas tem de ser EXATAMENTE o valor do recolhimento. Sobrando, parte do
 *      dinheiro sai sem origem; faltando, a composição parece completa e não é;
 *   2. cada parcela recai sobre um INGRESSO da MESMA obrigação (tipo + consignatário). Compor
 *      uma guia do INSS com uma retenção de pensão alimentícia é misturar dois credores;
 *   3. nenhum ingresso recebe mais do que ainda tem a recolher — o limite sai do SUM real, com
 *      as duas exclusões de `aRecolherDoIngresso`;
 *   4. a mesma retenção não aparece duas vezes na mesma composição (o banco também recusa, por
 *      `@@unique`; aqui a recusa chega como motivo em vez de violação de índice).
 *
 * ⚠️ E O LOCK É DOS INGRESSOS, não do recolhimento: duas guias concorrentes leriam o mesmo
 * "ainda falta recolher" e as duas passariam, alocando o dobro sobre a mesma retenção.
 */
async function alocarRecolhimento(
  tx: Tx,
  p: {
    readonly recolhimentoId: string;
    readonly valorDoRecolhimento: Money;
    readonly tipoConsignacaoId: string;
    readonly credorConsignatario: string;
    readonly parcelas: readonly { readonly ingressoId: string; readonly valor: Money }[];
    readonly criadoPor: string;
  }
): Promise<void> {
  const vistos = new Set<string>();
  for (const parcela of p.parcelas) {
    if (vistos.has(parcela.ingressoId)) {
      throw new Error(
        `A mesma retenção aparece duas vezes na composição deste recolhimento. Some as duas ` +
          `parcelas numa só — duas linhas para a mesma origem esconderiam a duplicidade.`
      );
    }
    vistos.add(parcela.ingressoId);
  }

  let soma = toMoney("0.00");
  for (const parcela of p.parcelas) soma = toMoney(soma.plus(parcela.valor));
  if (!soma.equals(p.valorDoRecolhimento)) {
    throw new Error(
      `A composição não fecha com o recolhimento: as parcelas somam ${soma.toFixed(2)} e o ` +
        `recolhimento é de ${p.valorDoRecolhimento.toFixed(2)}. Informe de quais retenções sai ` +
        `cada centavo — um recolhimento meio composto parece conciliado e não está. Nada foi gravado.`
    );
  }

  // O 4º lock da ordem, aqui sobre as RETENÇÕES: é nelas que se decide quanto ainda cabe.
  await travar(tx, "MovimentoExtraorcamentario", [...vistos].sort());

  for (const parcela of p.parcelas) {
    const ing = await tx.movimentoExtraorcamentario.findUnique({
      where: { id: parcela.ingressoId },
      select: { id: true, tipo: true, tipoConsignacaoId: true, credorConsignatario: true, data: true },
    });
    if (ing === null) {
      throw new Error(`A retenção ${parcela.ingressoId} não existe. Nada foi gravado.`);
    }
    if (ing.tipoConsignacaoId !== p.tipoConsignacaoId || ing.credorConsignatario !== p.credorConsignatario) {
      throw new Error(
        `A retenção ${parcela.ingressoId} é de outra obrigação (outro tipo de consignação ou outro ` +
          `consignatário). Um recolhimento quita retenções do MESMO credor. Nada foi gravado.`
      );
    }
    const disponivel = await aRecolherDoIngresso(tx, parcela.ingressoId);
    if (parcela.valor.greaterThan(disponivel)) {
      throw new Error(
        `A parcela de ${parcela.valor.toFixed(2)} excede o que a retenção de ` +
          `${ing.data.toISOString().slice(0, 10)} ainda tem a recolher (${disponivel.toFixed(2)}). ` +
          `Nada foi gravado.`
      );
    }
    await tx.alocacaoDoRecolhimento.create({
      data: {
        recolhimentoId: p.recolhimentoId,
        ingressoId: parcela.ingressoId,
        valor: parcela.valor.toFixed(2),
        criadoPor: p.criadoPor,
      },
      select: { id: true },
    });
  }
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
  // V23 — o motivo vai ao Tribunal de Contas (SAGRES EstornoReceitaExtra §4.21 e EstornoDespesaExtra
  // §4.22: obrigatório, 255, sem aspas). Conferido antes de tudo; descobrir no dia da remessa deixaria
  // um estorno que não se exporta.
  exigirMotivoDoEstornoExtra(dados.motivo);

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
        fonteId: true,
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
        // ⚠️ O ESTORNO HERDA A FONTE DO ORIGINAL, sem reconferir o rol: se a fonte saiu
        // do rol da conta depois do fato, desfazer aquele fato continua tendo de ser
        // possível — o estorno é a correção, não uma escrita nova.
        fonteId: original.fonteId,
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
