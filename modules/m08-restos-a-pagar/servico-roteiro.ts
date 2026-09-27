import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { exigirAnalitica } from "../m05-despesa/servico-roteiro-orcamentario.js";
import type { Tx } from "./guard-exercicio.js";

/**
 * M08 — A CONFIGURAÇÃO CONTÁBIL DAS OPERAÇÕES DE RESTOS A PAGAR.
 *
 * ═══ O QUE ESTE ARQUIVO DESTRAVA ═══
 * O domínio de RP está maduro e as cinco operações de escrita recebem as contas POR PARÂMETRO.
 * Nenhuma tela as alcançava porque não havia de onde tirar o parâmetro. A leitura chegou na V14;
 * a escrita chega aqui, e a ordem é a mesma de sempre: o ente configura, o sistema recusa o que
 * não está configurado, e ninguém inventa conta para fazer uma tela funcionar.
 *
 * ⚠️ TRÊS EVENTOS PEDEM CONTAS, NÃO CINCO. `anularPagamento` e `anularCancelamento` não têm
 * parâmetro `roteiro`: leem o lançamento original e INVERTEM as pernas (`gerarEstorno` do M01).
 * Não há evento de estorno aqui, e isso não é esquecimento — configurar conta de estorno criaria
 * a possibilidade de um estorno que não fecha com o que estornou.
 */

export const EVENTOS_DE_RESTOS = [
  "LIQUIDACAO_NAO_PROCESSADO",
  "PAGAMENTO",
  "CANCELAMENTO_PROCESSADO",
  "CANCELAMENTO_NAO_PROCESSADO",
] as const;
export type EventoDeRestos = (typeof EVENTOS_DE_RESTOS)[number];

/** O rótulo de operação, para mensagem de recusa. Sem vocabulário de engenharia. */
export const ROTULO_DO_EVENTO: Record<EventoDeRestos, string> = {
  LIQUIDACAO_NAO_PROCESSADO: "liquidação de restos a pagar não processados",
  PAGAMENTO: "pagamento de restos a pagar",
  CANCELAMENTO_PROCESSADO: "cancelamento de restos a pagar processados",
  CANCELAMENTO_NAO_PROCESSADO: "cancelamento de restos a pagar não processados",
};

/**
 * A recusa por falta de configuração. Ela existe como CLASSE porque a tela precisa distinguir
 * "não configurado" (que o ente resolve, e a mensagem diz onde) de "erro".
 */
export class RoteiroDeRestosAusenteError extends Error {
  readonly evento: EventoDeRestos;
  constructor(evento: EventoDeRestos) {
    super(
      `A ${ROTULO_DO_EVENTO[evento]} ainda não tem contas informadas. Informe as contas desta ` +
        `operação em Contabilidade / Roteiros de restos a pagar antes de executá-la. Nada foi gravado.`
    );
    this.name = "RoteiroDeRestosAusenteError";
    this.evento = evento;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LEITURA DO VIGENTE
// ═══════════════════════════════════════════════════════════════════════════

export interface ParDeContas {
  readonly debito: string;
  readonly credito: string;
}
export interface RoteiroDeRestosVigente {
  readonly evento: EventoDeRestos;
  readonly versao: number;
  readonly patrimonial: ParDeContas | null;
  readonly controle: ParDeContas | null;
  readonly fundamento: string | null;
}

/** A VIGENTE é a de maior versão. Nula quando o ente nunca publicou. */
export async function roteiroVigenteDeRestos(
  tx: Tx,
  evento: EventoDeRestos
): Promise<RoteiroDeRestosVigente | null> {
  const r = await tx.roteiroRestosAPagar.findFirst({
    where: { evento: evento as never },
    orderBy: { versao: "desc" },
    select: {
      versao: true,
      fundamento: true,
      contaDebito: { select: { codigo: true } },
      contaCredito: { select: { codigo: true } },
      contaControleDebito: { select: { codigo: true } },
      contaControleCredito: { select: { codigo: true } },
    },
  });
  if (r === null) return null;
  return {
    evento,
    versao: r.versao,
    patrimonial:
      r.contaDebito !== null && r.contaCredito !== null
        ? { debito: r.contaDebito.codigo, credito: r.contaCredito.codigo }
        : null,
    controle:
      r.contaControleDebito !== null && r.contaControleCredito !== null
        ? { debito: r.contaControleDebito.codigo, credito: r.contaControleCredito.codigo }
        : null,
    fundamento: r.fundamento,
  };
}

/** O vigente, ou recusa nomeando a operação. Fail-closed: nunca conta padrão. */
export async function exigirRoteiroDeRestos(
  tx: Tx,
  evento: EventoDeRestos
): Promise<RoteiroDeRestosVigente> {
  const r = await roteiroVigenteDeRestos(tx, evento);
  if (r === null) throw new RoteiroDeRestosAusenteError(evento);
  return r;
}

// ═══════════════════════════════════════════════════════════════════════════
// O PASSIVO PELA ORIGEM — e por que ele NÃO é parâmetro
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ ACHADO QUE MUDOU O DESENHO: A INSCRIÇÃO NÃO GERA LANÇAMENTO.
 *
 * `encerrarExercicioComRestos` cria as linhas de `InscricaoRestosAPagar` e NÃO escritura nada —
 * não há reclassificação do passivo para contas de "Restos a Pagar". A consequência é contábil,
 * não de código: no pagamento de um resto PROCESSADO o passivo a debitar é o que a liquidação do
 * exercício de origem CREDITOU, e no de um resto que era NÃO PROCESSADO é o que a liquidação
 * feita no exercício seguinte creditou. São dois caminhos com passivos diferentes, e a diferença
 * está no DADO.
 *
 * Por isso o débito do pagamento não é configuração: ele se RASTREIA. Configurar uma conta aqui
 * permitiria pagar contra um passivo que não é o que a obrigação criou — o saldo ficaria eterno
 * numa conta e negativo na outra, e as duas fechariam o balanço.
 *
 * ⚠️ E NÃO SE ESCOLHE "A PRIMEIRA CONTA CREDORA". A liquidação pode ter mais de uma perna, e
 * escolher uma delas por ordem de leitura seria decidir por acidente de consulta. Quando há mais
 * de uma candidata, esta função RECUSA nomeando todas — é o caso que se bloqueia sozinho, sem
 * bloquear os demais fluxos.
 */
export interface PassivoDeOrigem {
  readonly conta: string;
  readonly nome: string;
  readonly liquidacaoId: string;
  readonly liquidacaoNumero: string;
}

export async function passivoDaLiquidacaoDeOrigem(
  tx: Tx,
  p: { readonly liquidacaoId: string; readonly empenhoIdEsperado: string }
): Promise<PassivoDeOrigem> {
  const liq = await tx.liquidacao.findUnique({
    where: { id: p.liquidacaoId },
    select: { id: true, numero: true, empenhoId: true, lancamentoId: true, estornoDeId: true },
  });
  if (liq === null) {
    throw new Error(`A liquidação informada não existe. Nada foi gravado.`);
  }
  if (liq.estornoDeId !== null) {
    throw new Error(
      `A liquidação ${liq.numero} é um ESTORNO — ela desfez uma liquidação, não criou obrigação. ` +
        `Nada foi gravado.`
    );
  }

  // ⚠️ A CONTRAPARTE SE PRESERVA AQUI, e é uma conferência, não um detalhe: a liquidação tem de
  // ser DO MESMO empenho que a inscrição. Pagar um resto com a liquidação de outro empenho
  // baixaria a obrigação de um credor contra o passivo de outro.
  if (liq.empenhoId !== p.empenhoIdEsperado) {
    throw new Error(
      `A liquidação ${liq.numero} não pertence ao empenho deste resto a pagar. A baixa tem de ` +
        `recair sobre a obrigação que o próprio empenho criou. Nada foi gravado.`
    );
  }

  const credoras = await tx.partidaContabil.findMany({
    where: { lancamentoId: liq.lancamentoId, tipo: "CREDITO", subsistema: "PATRIMONIAL" },
    select: { conta: { select: { codigo: true, nome: true, analitica: true } } },
  });

  // ⚠️ CLASSE 2 = PASSIVO, pelo PRIMEIRO DÍGITO do PCASP. É a mesma propriedade que o guard de
  // balanceamento do M01 usa; não é código de conta cravado, é a estrutura do plano.
  const passivos = credoras.filter((c) => c.conta.codigo.startsWith("2."));

  if (passivos.length === 0) {
    throw new Error(
      `A liquidação ${liq.numero} não tem nenhuma perna de PASSIVO no seu lançamento ` +
        `(creditadas: ${credoras.map((c) => c.conta.codigo).join(", ") || "nenhuma"}). Sem a ` +
        `obrigação de origem não há o que baixar. Nada foi gravado.`
    );
  }
  if (passivos.length > 1) {
    throw new Error(
      `A liquidação ${liq.numero} criou MAIS DE UMA obrigação no mesmo lançamento ` +
        `(${passivos.map((c) => `${c.conta.codigo} ${c.conta.nome}`).join("; ")}), e escolher uma ` +
        `delas por ordem de leitura seria decidir por acidente. Registre o pagamento por ` +
        `liquidação individual, ou corrija a liquidação de origem. Nada foi gravado.`
    );
  }

  const unica = passivos[0]!.conta;
  if (!unica.analitica) {
    throw new Error(
      `A obrigação de origem da liquidação ${liq.numero} está na conta SINTÉTICA ${unica.codigo} ` +
        `("${unica.nome}"), que não recebe partida. Nada foi gravado.`
    );
  }
  return {
    conta: unica.codigo,
    nome: unica.nome,
    liquidacaoId: liq.id,
    liquidacaoNumero: liq.numero,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLICAR — versão nova, nunca UPDATE
// ═══════════════════════════════════════════════════════════════════════════

export const zPublicarRoteiroDeRestos = z
  .object({
    evento: z.enum(EVENTOS_DE_RESTOS),
    /** O par patrimonial. Ausente no pagamento, onde a origem e a conta bancária o dão. */
    contaDebitoCodigo: z.string().trim().min(1).nullable().optional(),
    contaCreditoCodigo: z.string().trim().min(1).nullable().optional(),
    /** O par de controle da disponibilidade por destinação de recursos. */
    contaControleDebitoCodigo: z.string().trim().min(1).nullable().optional(),
    contaControleCreditoCodigo: z.string().trim().min(1).nullable().optional(),
    fundamento: z
      .string()
      .trim()
      .min(20, "Diga POR QUE estas contas — citando o plano do ente, a norma ou a orientação do tribunal.")
      .max(500),
    criadoPor: z.string().min(1),
  })
  .strict();
export type PublicarRoteiroDeRestosInput = z.input<typeof zPublicarRoteiroDeRestos>;

export interface RoteiroDeRestosPublicado {
  readonly roteiroId: string;
  readonly versao: number;
  readonly anterior: { readonly patrimonial: ParDeContas | null; readonly controle: ParDeContas | null } | null;
}

/**
 * PUBLICA a decisão do ente para um evento — versão nova, nunca UPDATE.
 *
 * As conferências desta camada existem para que a recusa chegue como MOTIVO e não como violação
 * de constraint. O CHECK do banco (`ck_roteiro_restos_pernas`) continua sendo a última linha:
 * ele pega o que entrar por seed, importação ou correção a mão.
 */
export async function publicarRoteiroRestosAPagar(
  prisma: PrismaClient,
  input: PublicarRoteiroDeRestosInput
): Promise<RoteiroDeRestosPublicado> {
  const d = zPublicarRoteiroDeRestos.parse(input);
  const evento = d.evento;

  const pd = d.contaDebitoCodigo ?? null;
  const pc = d.contaCreditoCodigo ?? null;
  const cd = d.contaControleDebitoCodigo ?? null;
  const cc = d.contaControleCreditoCodigo ?? null;

  // (1) PAR INTEIRO OU NENHUM — meio par não é roteiro incompleto, é roteiro que não fecha.
  if ((pd === null) !== (pc === null)) {
    throw new Error(
      `Informe as DUAS contas patrimoniais ou nenhuma: um roteiro com meio par não fecha, e o ` +
        `lançamento seria recusado no ato da operação. Nada foi gravado.`
    );
  }
  if ((cd === null) !== (cc === null)) {
    throw new Error(
      `Informe as DUAS contas de disponibilidade por destinação de recursos ou nenhuma. ` +
        `Nada foi gravado.`
    );
  }
  // (2) AO MENOS UM PAR.
  if (pd === null && cd === null) {
    throw new Error(
      `Informe ao menos um par de contas. Um roteiro sem conta nenhuma não configura a operação ` +
        `e a deixaria passar sem escriturar. Nada foi gravado.`
    );
  }
  // (3) NO PAGAMENTO O PAR PATRIMONIAL VEM DO DADO.
  if (evento === "PAGAMENTO" && pd !== null) {
    throw new Error(
      `No pagamento de restos a pagar as contas patrimoniais não se informam aqui: a obrigação a ` +
        `baixar é a que a liquidação de origem criou, e a saída de caixa é a conta contábil da ` +
        `conta bancária escolhida no ato. Informe apenas o par de disponibilidade por destinação ` +
        `de recursos. Nada foi gravado.`
    );
  }
  if (pd !== null && pd === pc) {
    throw new Error(
      `O débito e o crédito não podem ser a mesma conta (${pd}). Um lançamento assim move zero e ` +
        `mesmo assim balanceia — passaria por todo guard e não escrituraria nada. Nada foi gravado.`
    );
  }
  if (cd !== null && cd === cc) {
    throw new Error(`As duas contas de disponibilidade não podem ser a mesma (${cd}). Nada foi gravado.`);
  }

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.publicarRoteiroRestosAPagar, "ENTE");

    const debito = pd === null ? null : await exigirAnalitica(tx, pd, "débito");
    const credito = pc === null ? null : await exigirAnalitica(tx, pc, "crédito");
    const ctrlDebito = cd === null ? null : await exigirAnalitica(tx, cd, "débito de disponibilidade");
    const ctrlCredito = cc === null ? null : await exigirAnalitica(tx, cc, "crédito de disponibilidade");

    // ⚠️ AS CONTAS DE CONTROLE SÃO DA CLASSE 8, e a conferência é pela estrutura do plano, não
    // por código cravado: uma conta patrimonial no par de controle desequilibraria o subsistema,
    // e o guard do M01 recusaria o lançamento na hora da operação — longe daqui, e sem dizer que
    // a causa foi o cadastro.
    for (const c of [ctrlDebito, ctrlCredito]) {
      if (c !== null && !c.codigo.startsWith("8.")) {
        throw new Error(
          `A conta ${c.codigo} não é de controle (classe 8) e não pode entrar no par de ` +
            `disponibilidade por destinação de recursos. Nada foi gravado.`
        );
      }
    }
    for (const c of [debito, credito]) {
      if (c !== null && c.codigo.startsWith("8.")) {
        throw new Error(
          `A conta ${c.codigo} é de controle (classe 8) e não pode entrar no par patrimonial. ` +
            `Nada foi gravado.`
        );
      }
    }

    const vigente = await roteiroVigenteDeRestos(tx, evento);
    const igual =
      vigente !== null &&
      (vigente.patrimonial?.debito ?? null) === (debito?.codigo ?? null) &&
      (vigente.patrimonial?.credito ?? null) === (credito?.codigo ?? null) &&
      (vigente.controle?.debito ?? null) === (ctrlDebito?.codigo ?? null) &&
      (vigente.controle?.credito ?? null) === (ctrlCredito?.codigo ?? null);
    if (igual) {
      throw new Error(
        `O roteiro da ${ROTULO_DO_EVENTO[evento]} já é exatamente este. Republicar o mesmo ` +
          `conjunto não é um fato novo. Nada foi gravado.`
      );
    }

    const ultima = await tx.roteiroRestosAPagar.aggregate({
      where: { evento: evento as never },
      _max: { versao: true },
    });

    const r = await tx.roteiroRestosAPagar.create({
      data: {
        evento: evento as never,
        versao: (ultima._max.versao ?? 0) + 1,
        fundamento: d.fundamento,
        contaDebitoId: debito?.id ?? null,
        contaCreditoId: credito?.id ?? null,
        contaControleDebitoId: ctrlDebito?.id ?? null,
        contaControleCreditoId: ctrlCredito?.id ?? null,
        criadoPor: d.criadoPor,
      },
      select: { id: true, versao: true },
    });

    return {
      roteiroId: r.id,
      versao: r.versao,
      anterior:
        vigente === null ? null : { patrimonial: vigente.patrimonial, controle: vigente.controle },
    };
  });
}
