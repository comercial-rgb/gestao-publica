import { randomUUID } from "node:crypto";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import { fimDoDiaCivil, inicioDoDiaCivil, janelaCivilDoMes } from "../../packages/datas/index.js";
import { travar } from "../../packages/locks/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
// ⚠️ O FUNIL DO RAZÃO (M01). Todo lançamento passa por ele — e é lá que mora o travamento de
// competência (M16). `m01-funil.test.ts` proíbe `lancamentoContabil.create` fora dele.
import { lancarNoRazao } from "../m01-core-contabil/razao.js";
import { exigirCompetenciaEmExercicioAberto } from "../m08-restos-a-pagar/guard-exercicio.js";
import { ACAO_DO_SERVICO, type AcaoDoSistema } from "../m16-travamento/acoes.js";
import { descreverJanela } from "../m16-travamento/dominio.js";
import { estaTravado } from "../m16-travamento/guard.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import {
  glosadoLiquido,
  pendenteDePrestacao,
  saldoALiberar,
  TIPO_DO_ESTORNO_CONVENIO,
  zCadastrarConvenioInput,
  zEstornarMovimentoConvenioInput,
  zMovimentoConvenioInput,
  type CadastrarConvenioInput,
  type EstornarMovimentoConvenioInput,
  type MovimentoConvenioInput,
  type MovimentoParaSaldo,
  type TipoMovimentoConvenio,
} from "./dominio.js";

/**
 * M28 — CONVÊNIOS: os casos de uso.
 *
 * ═══ ONDE CADA LANÇAMENTO É FEITO ═══
 * A LIBERAÇÃO com empenho é contabilizada pelo M05 (é despesa orçamentária) e a com receita
 * pelo M04 — aqui ela só REGISTRA o fato e o vínculo. A PRESTAÇÃO APROVADA e a GLOSA mexem
 * nas contas de CONTROLE (classe 8) e têm lançamento PRÓPRIO, por `RoteiroConvenio`. Um
 * roteiro de liberação aqui debitaria a despesa DUAS VEZES.
 *
 * ═══ ⚠️ O GUARD DE PERÍODO ABERTO É COBRADO NO CASO DE USO ═══
 * Não no funil, não na tela: aqui, dentro da transação, antes de gravar. É a regra que vale
 * desde o ENT01, e o `lancarNoRazao` a reforça para quem tem lançamento — mas o movimento sem
 * lançamento (a liberação com empenho) escaparia dela se o caso de uso não cobrasse.
 */

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

async function exigirConvenio(
  tx: Tx,
  convenioId: string
): Promise<{
  readonly id: string;
  readonly identificador: string;
  readonly papelDoEnte: "CONCEDENTE" | "CONVENENTE";
  readonly valorRepasse: Money;
  readonly movimentos: readonly MovimentoParaSaldo[];
}> {
  const c = await tx.convenio.findUnique({
    where: { id: convenioId },
    select: {
      id: true,
      identificador: true,
      papelDoEnte: true,
      valorRepasse: true,
      movimentos: { select: { tipo: true, valor: true } },
    },
  });
  if (c === null) {
    throw new Error(
      `Convênio ${convenioId} não encontrado. Nada foi gravado.`
    );
  }
  return {
    id: c.id,
    identificador: c.identificador,
    papelDoEnte: c.papelDoEnte,
    valorRepasse: toMoney(c.valorRepasse.toFixed(2)),
    movimentos: c.movimentos.map((m) => ({
      tipo: m.tipo as TipoMovimentoConvenio,
      valor: toMoney(m.valor.toFixed(2)),
    })),
  };
}

/**
 * ⚠️ O LOCK ANTES DA LEITURA DO SALDO, sempre.
 *
 * Duas liberações concorrentes da última parcela leem o mesmo saldo, as duas passam, e o
 * convênio libera mais do que o termo autoriza. O posto do convênio está em
 * `ORDEM_DOS_LOCKS` — travar fora da ordem é como nasce deadlock.
 */
async function travarConvenio(tx: Tx, convenioId: string): Promise<void> {
  await travar(tx, "Convenio", [convenioId]);
}

export async function cadastrarConvenio(
  prisma: PrismaClient,
  input: CadastrarConvenioInput
): Promise<{ readonly convenioId: string }> {
  const d = zCadastrarConvenioInput.parse(input);

  // ⚠️ AS DUAS PONTAS DA VIGÊNCIA SÃO DIAS CIVIS DO ENTE. O fim é o ÚLTIMO instante do dia:
  // um convênio que vence em 31/12 vale até 23:59:59 do ente, e não até 20:59:59 — que é o
  // que `new Date("...T23:59:59Z")` significaria aqui.
  const vigenciaInicio = inicioDoDiaCivil(d.diaVigenciaInicio);
  const vigenciaFim = fimDoDiaCivil(d.diaVigenciaFim);
  if (vigenciaFim < vigenciaInicio) {
    throw new Error(
      `VIGÊNCIA INVERTIDA: o convênio ${d.identificador} termina (${d.diaVigenciaFim}) ` +
        `antes de começar (${d.diaVigenciaInicio}). Nada foi gravado.`
    );
  }

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarConvenio, "ENTE");

    const criado = await tx.convenio.create({
      data: {
        identificador: d.identificador,
        objeto: d.objeto,
        papelDoEnte: d.papelDoEnte,
        partidaNome: d.partidaNome,
        partidaDocumento: d.partidaDocumento,
        leiAutorizativa: d.leiAutorizativa,
        valorRepasse: d.valorRepasse.toFixed(2),
        valorContrapartida: d.valorContrapartida.toFixed(2),
        vigenciaInicio,
        vigenciaFim,
        diasParaPrestacaoDeContas: d.diasParaPrestacaoDeContas,
        fonteRecursoId: d.fonteRecursoId,
        contaContabilId: d.contaContabilId,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { convenioId: criado.id };
  });
}

/**
 * LIBERAR UMA PARCELA — o dinheiro andou.
 *
 * ⚠️ O GUARD É O SALDO A LIBERAR, contra o termo. Liberar mais do que o convênio prevê é
 * repasse sem amparo, e ele não se corrige depois: o dinheiro já saiu.
 *
 * ⚠️ E A PARCELA É IDEMPOTENTE PELO NÚMERO. Liberar duas vezes a parcela 3 é a mesma
 * liberação duas vezes — e com valores iguais nem o saldo acusaria, porque a soma fecharia.
 */
export async function liberarParcela(
  prisma: PrismaClient,
  input: MovimentoConvenioInput
): Promise<{ readonly movimentoId: string }> {
  const d = zMovimentoConvenioInput.parse(input);
  const parcela = d.parcela;
  if (parcela === undefined) {
    throw new Error(
      `LIBERAÇÃO SEM NÚMERO DE PARCELA. O número é o que dá idempotência: sem ele, liberar ` +
        `duas vezes o mesmo valor produz duas linhas que somam certo e contam a história ` +
        `errada. Nada foi gravado.`
    );
  }

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.liberarParcela, "ENTE");

    await travarConvenio(tx, d.convenioId);
    const c = await exigirConvenio(tx, d.convenioId);
    await exigirCompetenciaAberta(tx, d.competencia, d.criadoPor, "liberação de parcela de convênio");

    const jaLiberada = await tx.movimentoConvenio.findFirst({
      where: {
        convenioId: d.convenioId,
        tipo: "LIBERACAO_DE_PARCELA",
        parcela: parcela,
        estornos: { none: {} },
      },
      select: { id: true },
    });
    if (jaLiberada !== null) {
      throw new Error(
        `PARCELA ${parcela} JÁ LIBERADA no convênio ${c.identificador}. Liberar de novo ` +
          `seria repassar o mesmo valor duas vezes com a mesma justificativa. Estorne a ` +
          `liberação anterior se ela estiver errada. Nada foi gravado.`
      );
    }

    const saldo = saldoALiberar(c.valorRepasse, c.movimentos);
    if (d.valor.gt(saldo)) {
      throw new Error(
        `SALDO A LIBERAR INSUFICIENTE no convênio ${c.identificador}: pedido ` +
          `${d.valor.toFixed(2)}, disponível ${saldo.toFixed(2)}. O termo prevê ` +
          `${c.valorRepasse.toFixed(2)} de repasse, e o que exceder isso é transferência ` +
          `sem amparo no instrumento. Nada foi gravado.`
      );
    }

    // ⚠️ COMO CONCEDENTE, A LIBERAÇÃO EXIGE EMPENHO. Repassar sem despesa empenhada é
    // dinheiro saindo sem dotação — e o vínculo é o que faz o convênio e a execução da
    // despesa contarem a MESMA história.
    if (c.papelDoEnte === "CONCEDENTE" && d.empenhoId === undefined) {
      throw new Error(
        `LIBERAÇÃO SEM EMPENHO no convênio ${c.identificador}, em que o ente é CONCEDENTE. ` +
          `Quem transfere, empenha: um repasse sem empenho é despesa sem dotação, e ` +
          `"quanto já repassamos" passaria a ter duas respostas — a do convênio e a da ` +
          `execução. Informe o empenho. Nada foi gravado.`
      );
    }
    if (d.empenhoId !== undefined) await exigirEmpenhoDoConvenio(tx, d.empenhoId, c.id);

    const criado = await tx.movimentoConvenio.create({
      data: {
        convenioId: d.convenioId,
        tipo: "LIBERACAO_DE_PARCELA",
        valor: d.valor.toFixed(2),
        parcela,
        dataMovimento: inicioDoDiaCivil(d.diaMovimento),
        competencia: janelaCivilDoMes(d.competencia).inicio,
        ...(d.empenhoId !== undefined ? { empenhoId: d.empenhoId } : {}),
        ...(d.receitaArrecadadaId !== undefined
          ? { receitaArrecadadaId: d.receitaArrecadadaId }
          : {}),
        motivo: d.motivo,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { movimentoId: criado.id };
  });
}

/**
 * APROVAR A PRESTAÇÃO DE CONTAS de um valor já liberado — e este movimento TEM lançamento
 * próprio, porque baixa o controle (classe 8).
 */
export async function aprovarPrestacaoDeContas(
  prisma: PrismaClient,
  input: MovimentoConvenioInput
): Promise<{ readonly movimentoId: string; readonly lancamentoId: string }> {
  return movimentoComLancamento(prisma, input, "PRESTACAO_APROVADA", ACAO_DO_SERVICO.aprovarPrestacaoDeContas, (c, d) => {
    const pendente = pendenteDePrestacao(c.movimentos);
    if (d.valor.gt(pendente)) {
      throw new Error(
        `PRESTAÇÃO ACIMA DO PENDENTE no convênio ${c.identificador}: pedido ` +
          `${d.valor.toFixed(2)}, pendente de prestação ${pendente.toFixed(2)}. Aprovar ` +
          `mais do que foi liberado é dar quitação de dinheiro que não saiu. Nada foi gravado.`
      );
    }
  });
}

/**
 * GLOSAR — declarar que parte do prestado não foi aceita.
 *
 * ⚠️ A GLOSA NÃO DEVOLVE DINHEIRO. Ela declara que um valor é DEVIDO de volta; quem devolve
 * é a `registrarDevolucao`, que é outro fato com outra data. Tratá-las como uma coisa só
 * faria a devolução parecer automática — e o ente deixaria de cobrar o que glosou.
 */
export async function glosar(
  prisma: PrismaClient,
  input: MovimentoConvenioInput
): Promise<{ readonly movimentoId: string; readonly lancamentoId: string }> {
  return movimentoComLancamento(prisma, input, "GLOSA", ACAO_DO_SERVICO.glosar, () => {
    /* a glosa não tem teto próprio: ela recai sobre o que já foi prestado, e o auditor a
       apura fora do sistema. O que o sistema garante é que ela fique registrada com motivo. */
  });
}

/** DEVOLVER — o valor glosado (ou o saldo não aplicado) volta. */
export async function registrarDevolucao(
  prisma: PrismaClient,
  input: MovimentoConvenioInput
): Promise<{ readonly movimentoId: string; readonly lancamentoId: string }> {
  return movimentoComLancamento(prisma, input, "DEVOLUCAO", ACAO_DO_SERVICO.registrarDevolucao, (c, d) => {
    const glosado = glosadoLiquido(c.movimentos);
    const pendente = pendenteDePrestacao(c.movimentos);
    const teto = toMoney(glosado.gt(pendente) ? glosado : pendente);
    if (d.valor.gt(teto)) {
      throw new Error(
        `DEVOLUÇÃO ACIMA DO DEVIDO no convênio ${c.identificador}: pedido ` +
          `${d.valor.toFixed(2)}, devido ${teto.toFixed(2)} (glosado ` +
          `${glosado.toFixed(2)}, pendente de prestação ${pendente.toFixed(2)}). Nada foi gravado.`
      );
    }
  });
}

async function movimentoComLancamento(
  prisma: PrismaClient,
  input: MovimentoConvenioInput,
  tipo: Extract<TipoMovimentoConvenio, "PRESTACAO_APROVADA" | "GLOSA" | "DEVOLUCAO">,
  /**
   * ⚠️ A AÇÃO CHEGA DO SERVIÇO PÚBLICO, e não é escolhida aqui.
   *
   * A primeira versão a escolhia dentro deste helper, por um `switch` sobre o tipo — e o
   * censo do M16 acusou os TRÊS serviços por "não cobrar autorização". A acusação estava
   * certa: o grep do censo procura a chamada NO CORPO DO SERVIÇO, e um helper compartilhado
   * a esconde. O que o grep defende é real — quem lê `glosar` tem de ver, ali, qual crachá
   * ela exige.
   */
  acao: AcaoDoSistema,
  guardaDoTipo: (
    c: Awaited<ReturnType<typeof exigirConvenio>>,
    d: ReturnType<typeof zMovimentoConvenioInput.parse>
  ) => void
): Promise<{ readonly movimentoId: string; readonly lancamentoId: string }> {
  const d = zMovimentoConvenioInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, acao, "ENTE");
    await travarConvenio(tx, d.convenioId);
    const c = await exigirConvenio(tx, d.convenioId);
    await exigirCompetenciaAberta(tx, d.competencia, d.criadoPor, `movimento ${tipo} de convênio`);
    guardaDoTipo(c, d);

    // ROTEIRO POR TABELA, pela chave (tipo, papel do ente): ausente = RECUSA, sem gravar.
    const roteiro = await tx.roteiroConvenio.findUnique({
      where: { tipo_papelDoEnte: { tipo, papelDoEnte: c.papelDoEnte } },
      select: {
        contaDebito: { select: { id: true } },
        contaCredito: { select: { id: true } },
        historicoPadrao: true,
      },
    });
    if (roteiro === null) {
      throw new Error(
        `Não há RoteiroConvenio cadastrado para ${tipo} / ${c.papelDoEnte}. As contas do ` +
          `PCASP vêm por PARÂMETRO — nenhuma conta é inventada no código, porque uma conta ` +
          `plausível errada produz um balanço que fecha e mente. Cadastre o roteiro. Nada ` +
          `foi gravado.`
      );
    }

    const lancamentoId = randomUUID();
    await lancarNoRazao(tx, {
      id: lancamentoId,
      numeroControle: `CONV-${c.identificador}-${tipo}-${d.competencia}`,
      dataTransacao: inicioDoDiaCivil(d.diaMovimento),
      historico: `${roteiro.historicoPadrao} — convênio ${c.identificador}`,
      origemTipo: `CONVENIO_${tipo}`,
      origemId: c.id,
      criadoPor: d.criadoPor,
      partidas: [
        {
          contaId: roteiro.contaDebito.id,
          tipo: "DEBITO",
          subsistema: "CONTROLE",
          valor: d.valor.toFixed(2),
        },
        {
          contaId: roteiro.contaCredito.id,
          tipo: "CREDITO",
          subsistema: "CONTROLE",
          valor: d.valor.toFixed(2),
        },
      ],
    });

    const criado = await tx.movimentoConvenio.create({
      data: {
        convenioId: d.convenioId,
        tipo,
        valor: d.valor.toFixed(2),
        ...(d.parcela !== undefined ? { parcela: d.parcela } : {}),
        dataMovimento: inicioDoDiaCivil(d.diaMovimento),
        competencia: janelaCivilDoMes(d.competencia).inicio,
        lancamentoId,
        motivo: d.motivo,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { movimentoId: criado.id, lancamentoId };
  });
}

/**
 * ESTORNAR — o fato oposto, apontando o original. NUNCA um UPDATE nem um DELETE.
 *
 * ⚠️ UM MOVIMENTO SÓ SE ESTORNA UMA VEZ, e a trava é do banco
 * (`uq_estorno_convenio_unico.sql`): dois estornos da mesma liberação devolveriam o saldo em
 * dobro, e o ente repassaria de novo o que já repassou.
 */
export async function estornarMovimentoConvenio(
  prisma: PrismaClient,
  input: EstornarMovimentoConvenioInput
): Promise<{ readonly movimentoId: string }> {
  const d = zEstornarMovimentoConvenioInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.estornarMovimentoConvenio, "ENTE");

    const original = await tx.movimentoConvenio.findUnique({
      where: { id: d.movimentoId },
      select: {
        id: true,
        convenioId: true,
        tipo: true,
        valor: true,
        parcela: true,
        empenhoId: true,
        competencia: true,
        estornos: { select: { id: true } },
      },
    });
    if (original === null) {
      throw new Error(`Movimento de convênio ${d.movimentoId} não encontrado. Nada foi gravado.`);
    }
    await travarConvenio(tx, original.convenioId);

    const tipoDoEstorno = TIPO_DO_ESTORNO_CONVENIO[original.tipo as TipoMovimentoConvenio];
    if (tipoDoEstorno === null) {
      throw new Error(
        `O movimento ${d.movimentoId} JÁ É UM ESTORNO (${original.tipo}). Estornar um ` +
          `estorno reviveria o fato original por um caminho que ninguém consegue ler no ` +
          `extrato. Se o estorno foi indevido, registre o fato de novo. Nada foi gravado.`
      );
    }
    if (original.estornos.length > 0) {
      throw new Error(
        `O movimento ${d.movimentoId} JÁ FOI ESTORNADO. Um segundo estorno devolveria o ` +
          `valor em dobro. Nada foi gravado.`
      );
    }

    const criado = await tx.movimentoConvenio.create({
      data: {
        convenioId: original.convenioId,
        tipo: tipoDoEstorno,
        valor: original.valor,
        ...(original.parcela !== null ? { parcela: original.parcela } : {}),
        dataMovimento: inicioDoDiaCivil(d.diaMovimento),
        // ⚠️ A COMPETÊNCIA É A DO ORIGINAL. O estorno corrige um fato daquele mês, e
        // carimbá-lo no mês corrente moveria o efeito para um período que não o produziu.
        competencia: original.competencia,
        estornoDeId: original.id,
        motivo: d.motivo,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { movimentoId: criado.id };
  });
}

/**
 * O EMPENHO INFORMADO É DESTE CONVÊNIO? — e a pergunta não é retórica.
 *
 * Um empenho de outro convênio faria as duas execuções se misturarem: a soma "quanto já
 * repassamos neste termo" veria um empenho que pertence a outro, e o outro termo ficaria com
 * despesa a menos. O vínculo existe justamente para que essa pergunta tenha UMA resposta.
 */
async function exigirEmpenhoDoConvenio(
  tx: Tx,
  empenhoId: string,
  convenioId: string
): Promise<void> {
  const e = await tx.empenho.findUnique({
    where: { id: empenhoId },
    select: { id: true, numero: true, convenioId: true },
  });
  if (e === null) {
    throw new Error(`Empenho ${empenhoId} não encontrado. Nada foi gravado.`);
  }
  if (e.convenioId === null) {
    throw new Error(
      `O empenho ${e.numero} NÃO ESTÁ VINCULADO A CONVÊNIO NENHUM. Vincular no ato da ` +
        `liberação deixaria o empenho contar uma história e o termo, outra. Corrija o ` +
        `empenho. Nada foi gravado.`
    );
  }
  if (e.convenioId !== convenioId) {
    throw new Error(
      `O empenho ${e.numero} é de OUTRO CONVÊNIO. Aceitá-lo faria "quanto já repassamos ` +
        `neste termo" somar despesa que pertence a outro. Nada foi gravado.`
    );
  }
}

/**
 * O PERÍODO DA COMPETÊNCIA ESTÁ ABERTO? — cobrado AQUI, no caso de uso.
 *
 * ⚠️ ELE NÃO REIMPLEMENTA NADA. As duas perguntas do repositório são
 * `exigirCompetenciaEmExercicioAberto` (M08 — o exercício foi encerrado?) e `estaTravado`
 * (M16 — a janela está travada?), e as duas moram nos seus módulos. Escrever aqui uma
 * terceira consulta às mesmas tabelas seria a segunda verdade sobre "o período está aberto":
 * o dia em que o travamento aprendesse um caso novo (o escopo por usuário, que ele já tem),
 * esta cópia continuaria respondendo pela regra velha.
 *
 * ⚠️ E O GUARD PRECISA ESTAR AQUI, E NÃO SÓ NO FUNIL. O funil cobra quem tem LANÇAMENTO; a
 * liberação de parcela não tem (quem contabiliza é o M05) e escaparia da trava — um repasse
 * gravado num mês já fechado muda um extrato que já foi publicado.
 */
async function exigirCompetenciaAberta(
  tx: Tx,
  competencia: string,
  criadoPor: string,
  ondeUsado: string
): Promise<void> {
  const inicio = janelaCivilDoMes(competencia).inicio;
  await exigirCompetenciaEmExercicioAberto(tx, inicio, ondeUsado);

  const travado = await estaTravado(tx, inicio, criadoPor);
  if (travado !== null) {
    throw new Error(
      `COMPETÊNCIA ${competencia} TRAVADA (${ondeUsado}): a janela de ` +
        `${descreverJanela(travado.janelaInicio, travado.janelaFim)} está fechada, travada ` +
        `por ${travado.travadoPor}. O corte é pela DATA DO FATO — um fato de dezembro ` +
        `digitado hoje continua sendo de dezembro. Destrave a janela (com motivo) ou ` +
        `registre o fato no mês em que ele foi descoberto. Nada foi gravado.`
    );
  }
}
