import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import {
  gerarEstorno,
  validarLancamento,
  type LancamentoContabil,
  type Partida,
} from "../../packages/ledger/index.js";
import { travar } from "../../packages/locks/index.js";
// A soma do razão é do M01 — o dono dele. Zero aritmética nova.
import { saldosDeControle } from "../m01-core-contabil/adapter-prisma.js";
// ⚠️ O FUNIL DO RAZÃO (M01). Todo lançamento passa por ele — e é lá que mora o
// travamento de competência (M16). Ver `m01-funil.test.ts`: o grep-teste proíbe o
// `lancamentoContabil.create` fora dele.
import { lancarNoRazao } from "../m01-core-contabil/razao.js";
import { janelaCivilDoAno } from "../../packages/datas/index.js";

/**
 * O ENCERRAMENTO DAS CONTAS DE CONTROLE ORÇAMENTÁRIO (classes 5 e 6).
 *
 * ═══ A PENDÊNCIA DE eada7b5, E O QUE ELA CUSTAVA ═══
 * `apurarResultadoDoExercicio` zera as classes 3 e 4 (as variações patrimoniais) contra
 * o patrimônio líquido. Ele NUNCA tocou as classes 5 e 6 — e elas são igualmente do
 * EXERCÍCIO: a dotação que a LOA fixou, o crédito que sobrou disponível, a receita que
 * se previu arrecadar. Sem encerrá-las, o saldo do ano que acabou ATRAVESSA para o novo:
 * o `beginning_balance` da MSC de janeiro de E+1 traz a dotação de E, o exercício novo
 * nasce com 100.000 de crédito que ninguém votou, e o segundo ano do sistema publica à
 * União um orçamento que é a soma de dois.
 *
 * ═══ A DOUTRINA (MCASP; Lei 4.320/64; CF art. 165 e 167, II) ═══
 * O orçamento é ANUAL. Em 31/12 a AUTORIZAÇÃO DE GASTAR morre — o crédito não empenhado
 * CADUCA (art. 167, II), a dotação não vira patrimônio de ninguém, a previsão de receita
 * do ano que acabou não prevê mais nada. O que sobrevive à virada é a OBRIGAÇÃO já
 * assumida — e ela vive no patrimonial (o passivo com o fornecedor) e no razão próprio
 * do RP (`MovimentoRestosAPagar`), não aqui.
 *
 * ═══ ESTE LANÇAMENTO FECHA SOZINHO — E É POR ISSO QUE NÃO HÁ CONTA DE PLUG ═══
 * A apuração precisa de uma contrapartida ÚNICA (o Resultados Acumulados) porque as
 * classes 3 e 4 NÃO se espelham: o VPA e o VPD sobram um sobre o outro, e a sobra é o
 * resultado do exercício, que tem de ir para algum lugar.
 *
 * As classes 5 e 6 se ESPELHAM por construção. A 5 diz "de onde vem" (a dotação
 * autorizada) e a 6 diz "em que estado está" (disponível, reservado, empenhado,
 * liquidado, pago) — e TODO roteiro deste repositório move o dinheiro de um estado a
 * outro sem criar nem destruir nada. Logo Σ(saldos das 5) == Σ(saldos das 6), sempre, e
 * o lançamento que zera as duas pontas FECHA SOZINHO. A CONTRAPARTIDA DE CADA CONTA 6 É
 * A CONTA 5 QUE A LASTREIA — e vice-versa. Não há par a hardcodar porque não há par a
 * escolher: o par é o subsistema inteiro.
 *
 * ⚠️ E DAÍ SAI UMA REDE DE GRAÇA. Se alguém classificar UMA perna de um espelho como
 * TRANSFERE e a outra como ENCERRA, a soma deixa de fechar e o motor puro do M01
 * (`validarLancamento`, ΣD == ΣC por subsistema) RECUSA o lançamento inteiro. Uma conta
 * de controle só transfere EM PAR com o seu espelho — e quem errar isso descobre na
 * primeira virada, não no primeiro TCE.
 *
 * ═══ NATUREZA `ENCERRAMENTO` — a mesma da apuração, e pelo mesmo motivo ═══
 * Não é fato novo: é transferência. A MSC agregada o EXCLUI do movimento do mês (senão
 * dezembro pareceria ter "desempenhado" o ano inteiro) e a MSC de encerramento é feita
 * EXATAMENTE dele. O resolver do M14 (`DIMENSAO_DA_NATUREZA`) já sabe que um lançamento
 * de ENCERRAMENTO não tem fonte de recurso, e por isso ele NÃO vira pendência falsa.
 */

export const zEncerrarControlesInput = z.object({
  exercicioId: z.string().min(1),
  criadoPor: z.string().min(1),
});
export type EncerrarControlesInput = z.input<typeof zEncerrarControlesInput>;

export const zEstornarEncerramentoControlesInput = z.object({
  operacaoId: z.string().min(1),
  motivo: z
    .string()
    .trim()
    .min(
      10,
      "O motivo do estorno do encerramento dos controles precisa de ao menos 10 caracteres"
    ),
  criadoPor: z.string().min(1),
});
export type EstornarEncerramentoControlesInput = z.input<
  typeof zEstornarEncerramentoControlesInput
>;

export const ORIGEM_ENCERRAMENTO_CONTROLES = "ENCERRAMENTO_CONTROLES";

export interface ContaEncerrada {
  readonly codigo: string;
  /** O saldo que MORREU — com a natureza da conta (positivo). */
  readonly saldo: Money;
  readonly perna: "DEBITO" | "CREDITO";
}

export interface ResultadoEncerramentoControles {
  readonly operacaoId: string;
  readonly lancamentoId: string;
  readonly encerradas: readonly ContaEncerrada[];
  /** As que ATRAVESSARAM a virada — nada foi lançado nelas, por design. */
  readonly transferidas: readonly { readonly codigo: string; readonly saldo: Money }[];
}

/**
 * A data do fato "encerramento": o ÚLTIMO instante do exercício.
 *
 * A MESMA da apuração — e é de propósito: os dois encerramentos são o MESMO evento
 * contábil (a virada), e o corte dos relatórios é pela data do FATO, não pelo dia em que
 * alguém clicou. Ver `ultimoInstanteDoExercicio` na apuração.
 */
function ultimoInstanteDoExercicio(ano: number): Date {
  // ⚠️ CIVIL, não UTC: `Date.UTC(ano, 11, 31, 23:59:59)` é 31/12 às 20:59:59 em São Paulo,
  // e as três horas que sobram são exatamente onde mora o lançamento de véspera de virada.
  return janelaCivilDoAno(ano).fim;
}

/**
 * ENCERRA as contas de controle orçamentário do exercício. Tudo ou nada.
 *
 * ═══ ORDEM EM RELAÇÃO À APURAÇÃO: NENHUMA, E ISSO É UM ACHADO, NÃO UM DESCUIDO ═══
 * A apuração lê e escreve as classes 3 e 4 (mais o PL, classe 2). Este encerramento lê e
 * escreve as classes 5 e 6. Os conjuntos são DISJUNTOS, e cada conferência pós-evento só
 * olha o seu próprio conjunto. Os dois COMUTAM — rodar um antes do outro dá exatamente o
 * mesmo razão (e há teste que prova).
 *
 * Exigir "apure primeiro" seria inventar um acoplamento que a álgebra não tem, e o preço
 * dele apareceria no dia em que alguém precisasse estornar SÓ a apuração: teria de
 * desfazer este encerramento junto, sem razão nenhuma.
 *
 * O que se EXIGE é o mesmo que a apuração exige: o exercício ENCERRADO — o FATO
 * (`EncerramentoExercicio`), nunca uma flag. Não se enterra o orçamento de um ano que
 * ainda corre.
 *
 * ═══ IDEMPOTÊNCIA DERIVADA — o mesmo desenho da apuração ═══
 * Não há flag de "já encerrado". A segunda chamada simplesmente não acha saldo nas contas
 * ENCERRA e morre em "nada a encerrar". O SALDO governa. E, depois de ESTORNADO, o
 * encerramento pode ser refeito: o saldo voltou, e com ele a permissão.
 */
export async function encerrarControlesOrcamentarios(
  prisma: PrismaClient,
  input: EncerrarControlesInput
): Promise<ResultadoEncerramentoControles> {
  const dados = zEncerrarControlesInput.parse(input);

  return prisma.$transaction(async (tx) => {
    // SEM UG: enterra a dotação NÃO EXECUTADA de todas as fichas do ano. Ato do ente, e do CONTROLE.
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.encerrarControlesOrcamentarios, "ENTE");

    // (a) O EXERCÍCIO EXISTE E ESTÁ ENCERRADO — derivado do FATO.
    const exercicio = await tx.exercicio.findUnique({
      where: { id: dados.exercicioId },
      select: { id: true, ano: true, encerramento: { select: { id: true } } },
    });
    if (exercicio === null) {
      throw new Error(`Exercício ${dados.exercicioId} não existe.`);
    }
    if (exercicio.encerramento === null) {
      throw new Error(
        `Exercício ${exercicio.ano} NÃO está encerrado — não se enterra o orçamento ` +
          `de um ano que ainda corre. Encerre o exercício primeiro. Nada foi gravado.`
      );
    }

    // ⚠️ O LOCK VEM ANTES DA SOMA — travar depois de somar é travar um número velho.
    // Sem ele, duas viradas concorrentes do MESMO exercício leem o mesmo saldo, as duas
    // decidem enterrá-lo e as DUAS gravam: a dotação zerada duas vezes não fica zerada,
    // fica INVERTIDA. A idempotência derivada do saldo não cobre isso (ela é sequencial;
    // a concorrente ainda enxerga o saldo velho). Ver `ORDEM_DOS_LOCKS`.
    //
    // ⚠️ PROVADO POR MUTAÇÃO: removendo esta linha, o t4d falha com as DUAS transações
    // `fulfilled` — as duas gravaram o encerramento do mesmo exercício.
    await travar(tx, "Exercicio", [exercicio.id]);

    const corte = ultimoInstanteDoExercicio(exercicio.ano);

    // (b) OS SALDOS DAS 5 E DAS 6, no corte. TUDO incluído (inclusive encerramentos
    // anteriores — é assim que a idempotência cai sozinha, como na apuração).
    const saldos = (
      await saldosDeControle(tx, {
        classes: ["5", "6"],
        ate: corte,
        campoData: "dataTransacao",
      })
    ).filter((s) => !s.saldo.isZero());

    // (c) A TABELA-PARÂMETRO. Fail-closed: sem destino, não se grava.
    const classificacoes = await tx.contaNaVirada.findMany({
      select: {
        destino: true,
        justificativa: true,
        conta: { select: { codigo: true, id: true, analitica: true } },
      },
    });
    const destinoPorConta = new Map(
      classificacoes.map((c) => [c.conta.codigo, c])
    );

    // ⚠️ A CONTA COM SALDO E SEM DESTINO DERRUBA A OPERAÇÃO INTEIRA — nomeando a conta E
    // o saldo. Deixá-la de fora "porque não sei o que fazer com ela" é exatamente o
    // silêncio que a pendência de eada7b5 era: o orçamento morto atravessando o ano sem
    // que ninguém tivesse decidido nada.
    const semDestino = saldos.filter((s) => !destinoPorConta.has(s.codigo));
    if (semDestino.length > 0) {
      throw new Error(
        `CONTA DE CONTROLE SEM DESTINO NA VIRADA: ` +
          semDestino
            .map((s) => `${s.codigo} (saldo ${s.saldo.toFixed(2)})`)
            .join(", ") +
          `. Toda conta das classes 5 e 6 COM SALDO em 31/12 tem de dizer se ela ` +
          `ENCERRA (o orçamento é anual — o crédito não empenhado caduca, art. 167, II ` +
          `da CF) ou se TRANSFERE (o saldo atravessa a virada — o controle de restos a ` +
          `pagar é o caso). O M08 não escolhe por ninguém: classifique em ` +
          `ContaNaVirada, com a justificativa. Nada foi gravado.`
      );
    }

    const aEncerrar = saldos.filter(
      (s) => destinoPorConta.get(s.codigo)!.destino === "ENCERRA"
    );
    const transferidas = saldos
      .filter((s) => destinoPorConta.get(s.codigo)!.destino === "TRANSFERE")
      .map((s) => ({ codigo: s.codigo, saldo: s.saldo }));

    if (aEncerrar.length === 0) {
      throw new Error(
        `NADA A ENCERRAR nos controles orçamentários do exercício ${exercicio.ano}: ` +
          `nenhuma conta das classes 5 e 6 classificada como ENCERRA tem saldo no ` +
          `corte. Ou o exercício não teve orçamento, ou os controles JÁ FORAM ` +
          `ENCERRADOS. (Não existe flag de "já encerrado": o SALDO é que governa. Se o ` +
          `encerramento foi estornado, o saldo volta e esta chamada passa de novo.) ` +
          `Nada foi gravado.`
      );
    }

    // (d) AS PERNAS QUE ZERAM CADA CONTA. A conta DEVEDORA (dotação inicial) morre com
    // um CRÉDITO; a CREDORA (crédito disponível), com um DÉBITO. E o saldo NEGATIVO —
    // uma conta credora que ficou devedora — morre com a perna OPOSTA. É o mesmo
    // desenho da apuração, e o mesmo motivo: a perna sai do SINAL do saldo, nunca de
    // uma tabela de "qual lado essa conta costuma ter".
    const partidas: Partida[] = [];
    const encerradas: ContaEncerrada[] = [];

    for (const s of aEncerrar) {
      const conta = destinoPorConta.get(s.codigo)!.conta;
      if (!conta.analitica) {
        throw new Error(
          `Conta SINTÉTICA ${s.codigo} classificada em ContaNaVirada — conta sintética ` +
            `não recebe partida. Nada foi gravado.`
        );
      }

      const positivo = s.saldo.greaterThan(0);
      const devedora = s.naturezaSaldo === "DEVEDORA";
      // devedora com saldo positivo -> CREDITO.  credora com saldo positivo -> DEBITO.
      // Os sinais invertidos trocam a perna.
      const perna: "DEBITO" | "CREDITO" =
        devedora === positivo ? "CREDITO" : "DEBITO";

      partidas.push({
        conta: s.codigo,
        tipo: perna,
        // ⚠️ ORÇAMENTÁRIO. É o subsistema em que TODA perna de 5/6 deste repositório
        // nasce (o empenho, a liquidação, a dotação) — e é por subsistema que o motor
        // do M01 exige ΣD == ΣC. Pôr isto em PATRIMONIAL faria o lançamento "fechar"
        // contra pernas de outro mundo.
        subsistema: "ORCAMENTARIO",
        valor: toMoney(s.saldo.abs()),
      });
      encerradas.push({ codigo: s.codigo, saldo: s.saldo, perna });
    }

    // ⚠️ O MOTOR DO M01. Aqui é onde o espelho 5↔6 é COBRADO: se as duas faces não
    // somam igual, o lançamento não existe. Ver o cabeçalho.
    const validadas = validarLancamento(partidas);

    const contas = await tx.contaPcasp.findMany({
      where: { codigo: { in: validadas.map((p) => p.conta) } },
      select: { id: true, codigo: true },
    });
    const idPorCodigo = new Map(contas.map((c) => [c.codigo, c.id]));

    const operacaoId = randomUUID();

    const lancamentoId = await lancarNoRazao(tx, {
      numeroControle: `ENC-CONTROLES-${exercicio.ano}`,
      dataTransacao: corte,
      historico:
        `Encerramento dos controles orçamentários do exercício ${exercicio.ano}: ` +
        `${encerradas.length} conta(s) zerada(s)` +
        (transferidas.length > 0
          ? `; ${transferidas.length} transferida(s) para ${exercicio.ano + 1}`
          : ""),
      origemTipo: ORIGEM_ENCERRAMENTO_CONTROLES,
      origemId: operacaoId,
      // ⚠️ A NATUREZA. Ver o cabeçalho: a MSC agregada o exclui, a de encerramento é
      // feita dele, e o resolver do M14 sabe que ele não tem fonte. E é ela que ISENTA
      // este lançamento do travamento de competência (M16): ele nasce em 31/12, dentro
      // do mês que o ente acabou de fechar.
      natureza: "ENCERRAMENTO",
      criadoPor: dados.criadoPor,
      partidas: validadas.map((p) => ({
        contaId: idPorCodigo.get(p.conta)!,
        tipo: p.tipo,
        subsistema: p.subsistema,
        valor: p.valor.toFixed(2),
        // ⚠️ SEM `fichaId`. O saldo que morre é o da CONTA, somado sobre todas as
        // fichas — e um encerramento não tem dimensão orçamentária (é o que o
        // `DIMENSAO_DA_NATUREZA` do M14 diz, e é o que ele É).
      })),
    });

    // ═══ A CONFERÊNCIA PÓS-EVENTO — E POR QUE ELA VIVE NO ESCRITOR ═══
    //
    // Depois de encerrar, TODA conta classificada ENCERRA tem de estar ZERADA no corte.
    //
    // ⚠️ "MAS O MOTOR NÃO PEGARIA UMA CONTA PULADA?" — PEGA UMA. NÃO PEGA O PAR.
    // Esta é a objeção óbvia e ela está ERRADA, e é por isso que esta rede existe.
    // Pular UMA conta desequilibra o lançamento (ΣD ≠ ΣC) e o `validarLancamento` acima
    // recusa. Mas pular um ESPELHO INTEIRO — as duas contas de receita, por exemplo, que
    // se lastreiam uma na outra (a realizar D 8.000 / realizada C 8.000) — deixa o
    // lançamento PERFEITAMENTE BALANCEADO. O motor passa. E é exatamente esse o erro que
    // alguém escreve: "aqui eu trato o controle da DESPESA; a receita é outro assunto".
    // O orçamento de receita do ano morto atravessa a virada, em silêncio.
    //
    // E NENHUMA IDENTIDADE DA MSC PEGA ISSO — o mesmo argumento da conferência da
    // apuração, que já foi provado por mutação:
    //   · a M1 (beginning + change == ending) CONTINUA FECHANDO: um encerramento PARCIAL
    //     é só uma transferência menor, e as três linhas seguem sendo a mesma verdade em
    //     três recortes.
    //   · a M2 (o balancete) CONTINUA FECHANDO: o que o motor aceitou já está balanceado.
    //   · a M4 (a dimensão não cria dinheiro) é sobre REPARTIÇÃO, não sobre COMPLETUDE.
    // Elas amarram o QUANTO foi transferido; NENHUMA amarra o SE TUDO foi. O sintoma
    // apareceria só no `beginning` de janeiro de E+1, como orçamento morto — que é
    // EXATAMENTE o bug que este arquivo existe para matar.
    //
    // ⚠️ PROVADO POR MUTAÇÃO, e o resultado está colado aqui porque ele é a razão de
    // esta rede existir. Rodando `aEncerrar` com um `&& !s.codigo.startsWith("6.2.1")`
    // (a mutação "a receita é outro assunto"), sobre o ciclo cheio do t1:
    //
    //   · o `validarLancamento` do M01 **ACEITOU** o lançamento mutilado — as 5 pernas
    //     que sobraram fecham (ΣD 100.000 == ΣC 100.000);
    //   · quem parou foi ESTA conferência:
    //       "ENCERRAMENTO INCOMPLETO dos controles do exercício 2026: as contas
    //        6.2.1.1.0.00.00 (8000.00), 6.2.1.2.0.00.00 (8000.00) estão classificadas
    //        como ENCERRA e CONTINUAM COM SALDO depois do encerramento."
    //   · e a transação inteira caiu — zero lançamento gravado.
    //
    // A rede de COMPLETUDE não tem onde morar senão AQUI, no escritor, dentro da
    // transação. Não remover.
    const sobrou = (
      await saldosDeControle(tx, {
        classes: ["5", "6"],
        ate: corte,
        campoData: "dataTransacao",
      })
    ).filter(
      (s) =>
        !s.saldo.isZero() &&
        destinoPorConta.get(s.codigo)?.destino === "ENCERRA"
    );

    if (sobrou.length > 0) {
      throw new Error(
        `ENCERRAMENTO INCOMPLETO dos controles do exercício ${exercicio.ano}: as contas ` +
          `${sobrou.map((s) => `${s.codigo} (${s.saldo.toFixed(2)})`).join(", ")} ` +
          `estão classificadas como ENCERRA e CONTINUAM COM SALDO depois do ` +
          `encerramento. O orçamento morto atravessaria a virada. Nada foi gravado.`
      );
    }

    return {
      operacaoId,
      lancamentoId,
      encerradas,
      transferidas,
    };
  });
}

/**
 * ESTORNA o encerramento dos controles. Simétrico, e nascido no mesmo commit.
 *
 * A OPERAÇÃO INTEIRA, pelo `operacaoId` — e cada perna com o SEU valor. O motor puro
 * (`gerarEstorno`) inverte partida a partida; ele nunca recarimba um valor único sobre
 * todas as pernas, que é como um estorno "quase certo" corrompe o razão em silêncio.
 *
 * O estorno TAMBÉM nasce `ENCERRAMENTO`: se nascesse NORMAL, a MSC agregada passaria a
 * contar a reversão como movimento do mês, e dezembro ganharia uma dotação que ninguém
 * votou. Depois dele, os saldos das 5/6 VOLTAM — e o encerramento pode ser refeito.
 */
export async function estornarEncerramentoControles(
  prisma: PrismaClient,
  input: EstornarEncerramentoControlesInput
): Promise<{ readonly lancamentos: readonly string[] }> {
  const dados = zEstornarEncerramentoControlesInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.estornarEncerramentoControles, "ENTE");

    const originais = await tx.lancamentoContabil.findMany({
      where: {
        origemId: dados.operacaoId,
        origemTipo: ORIGEM_ENCERRAMENTO_CONTROLES,
      },
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

    if (originais.length === 0) {
      throw new Error(
        `Encerramento de controles ${dados.operacaoId} não encontrado.`
      );
    }
    const jaEstornado = originais.find((l) => l.estornos.length > 0);
    if (jaEstornado !== undefined) {
      throw new Error(
        `O encerramento de controles ${dados.operacaoId} já foi estornado ` +
          `(lançamento ${jaEstornado.numeroControle}).`
      );
    }

    const criados: string[] = [];

    for (const original of originais) {
      const dominio: LancamentoContabil = {
        id: original.id,
        numeroControle: original.numeroControle,
        partidas: original.partidas.map((p) => ({
          conta: p.conta.codigo,
          tipo: p.tipo,
          subsistema: p.subsistema,
          valor: toMoney(p.valor.toFixed(2)),
        })),
        dataTransacao: original.dataTransacao,
        historico: original.historico,
        ...(original.estornoDeId !== null
          ? { estornoDeId: original.estornoDeId }
          : {}),
        estornos: original.estornos.map((e) => e.id),
      };

      const estorno = gerarEstorno(dominio, {
        idEstorno: randomUUID(),
        numeroControleEstorno: `${original.numeroControle}-EST`,
        dataEstorno: original.dataTransacao,
      });

      const contas = await tx.contaPcasp.findMany({
        where: { codigo: { in: estorno.partidas.map((p) => p.conta) } },
        select: { id: true, codigo: true },
      });
      const idPorCodigo = new Map(contas.map((c) => [c.codigo, c.id]));

      const criado = await lancarNoRazao(tx, {
        id: estorno.id,
        numeroControle: estorno.numeroControle,
        // ⚠️ RETROAGE para 31/12 (a data do original) — e por isso a isenção de
        // ENCERRAMENTO no guard do M16 é o que torna este estorno possível.
        dataTransacao: estorno.dataTransacao,
        historico: `${estorno.historico} — ${dados.motivo}`,
        origemTipo: `${ORIGEM_ENCERRAMENTO_CONTROLES}_ESTORNADO`,
        origemId: dados.operacaoId,
        natureza: "ENCERRAMENTO",
        // uq_estorno_unico (M01) protege a dupla anulação do lançamento.
        estornoDeId: original.id,
        criadoPor: dados.criadoPor,
        partidas: estorno.partidas.map((p) => ({
          contaId: idPorCodigo.get(p.conta)!,
          tipo: p.tipo,
          subsistema: p.subsistema,
          valor: p.valor.toFixed(2),
        })),
      });
      criados.push(criado);
    }

    return { lancamentos: criados };
  });
}
