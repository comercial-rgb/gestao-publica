import { z } from "zod";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import type { Tx } from "../m01-core-contabil/adapter-prisma.js";
import { listarTiposConsignacao } from "../m07-extraorcamentario/consultas.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { filtroDosContrachequesCobertos } from "./ir-da-folha.js";

/**
 * V28 — OS DESCONTOS DA FOLHA RETIDOS NO PAGAMENTO.
 *
 * ═══ O DEFEITO QUE ISTO FECHA ═══
 * A liquidação da folha reconhece a obrigação pelo BRUTO (D pessoal / C pessoal a pagar). O pagamento
 * debitava esse bruto e creditava o banco: só o IR saía do caixa como receita do município (V26). A
 * contribuição previdenciária do servidor, a pensão alimentícia e o empréstimo consignado — dinheiro do
 * servidor que o ente SEGURA e repassa — só viravam passivo se alguém os digitasse no pagamento. Sem isso
 * o banco pagava ao servidor o que era do INSS, e o razão nunca mostrava a dívida com o instituto.
 *
 * ═══ A REGRA ═══
 * Cada rubrica de DESCONTO tem, por declaração do ente, a consignação que a retém (tipo e credor). O
 * pagamento de uma liquidação de folha TEM de reter, por tipo de consignação, o desconto pendente dos
 * contracheques que ela cobre. Retido UMA vez por contracheque e rubrica, no primeiro pagamento que cobre o
 * servidor, como o IR. Anulado o pagamento, o desconto volta a ser devido no próximo, numa geração nova.
 *
 * Ficam fora, com motivo: o IR (cadeia própria, receita do município) e os abatimentos de adiantamento
 * (o servidor já recebeu esse valor; não é devido a terceiro — a cadeia do vale aguarda decisão própria).
 */

/** As naturezas de desconto que NÃO são consignação, e por quê. */
export const DESCONTOS_FORA_DA_CONSIGNACAO: Readonly<Record<string, string>> = {
  IMPOSTO_DE_RENDA: "o IR retido é receita do município e tem cadeia própria no pagamento",
  ABATIMENTO_DO_ADIANTAMENTO_DO_13: "o servidor já recebeu esse valor na 1ª parcela; não é devido a terceiro",
  ABATIMENTO_DO_ADIANTAMENTO_SALARIAL: "o servidor já recebeu esse valor no vale; não é devido a terceiro",
};
const NATUREZAS_FORA = Object.keys(DESCONTOS_FORA_DA_CONSIGNACAO) as (
  | "IMPOSTO_DE_RENDA"
  | "ABATIMENTO_DO_ADIANTAMENTO_DO_13"
  | "ABATIMENTO_DO_ADIANTAMENTO_SALARIAL"
)[];

type TxDeLeitura = Pick<PrismaClient, "consignacaoDaRubrica">;

export interface ConsignacaoDeclarada {
  readonly rubricaId: string;
  readonly tipoConsignacaoId: string;
  readonly credorConsignatario: string;
  readonly fundamento: string;
  readonly versao: number;
  readonly criadoPor: string;
}

export async function consignacaoVigenteDaRubrica(tx: TxDeLeitura, rubricaId: string): Promise<ConsignacaoDeclarada | null> {
  return tx.consignacaoDaRubrica.findFirst({
    where: { rubricaId },
    orderBy: { versao: "desc" },
    select: { rubricaId: true, tipoConsignacaoId: true, credorConsignatario: true, fundamento: true, versao: true, criadoPor: true },
  });
}

export const zDeclararConsignacaoDaRubrica = z.object({
  rubricaId: z.string().min(1),
  tipoConsignacaoId: z.string().min(1),
  credorConsignatario: z.string().trim().min(3, "Informe a quem o valor retido é devido.").max(120),
  fundamento: z.string().trim().min(20, "Diga POR QUE — a lei, o convênio ou a decisão judicial que obriga o desconto.").max(500),
  criadoPor: z.string().min(1),
});

/**
 * DECLARA que uma rubrica de desconto é retida como uma consignação. Quem decide é quem gere os tipos de
 * consignação (GERIR_TIPOS_DE_CONSIGNACAO): é a mesma autoridade de dizer em que passivo a retenção nasce.
 */
export async function declararConsignacaoDaRubrica(
  prisma: PrismaClient,
  input: z.input<typeof zDeclararConsignacaoDaRubrica>
): Promise<{ readonly versao: number }> {
  const d = zDeclararConsignacaoDaRubrica.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.declararConsignacaoDaRubrica, "ENTE");
    const rubrica = await tx.rubrica.findUnique({ where: { id: d.rubricaId }, select: { codigo: true, descricao: true, tipo: true, natureza: true } });
    if (rubrica === null) throw new Error("A rubrica informada não existe. Nada foi gravado.");
    if (rubrica.tipo !== "DESCONTO") {
      throw new Error(`A rubrica ${rubrica.codigo} (${rubrica.descricao}) é de provento; só desconto é retido como consignação. Nada foi gravado.`);
    }
    const fora = DESCONTOS_FORA_DA_CONSIGNACAO[rubrica.natureza];
    if (fora !== undefined) {
      throw new Error(`A rubrica ${rubrica.codigo} (${rubrica.descricao}) não é retida como consignação: ${fora}. Nada foi gravado.`);
    }
    const tipo = (await listarTiposConsignacao(tx)).find((t) => t.id === d.tipoConsignacaoId);
    if (tipo === undefined) throw new Error("O tipo de consignação informado não existe. Nada foi gravado.");
    if (!tipo.ativo || tipo.contaPassivoCodigo === null) {
      throw new Error(`O tipo de consignação ${tipo.codigo} (${tipo.descricao}) está inativo ou sem conta de passivo; a retenção não teria onde nascer. Nada foi gravado.`);
    }
    const vigente = await consignacaoVigenteDaRubrica(tx, d.rubricaId);
    if (vigente !== null && vigente.tipoConsignacaoId === d.tipoConsignacaoId && vigente.credorConsignatario === d.credorConsignatario) {
      throw new Error(`A rubrica ${rubrica.codigo} já é retida como ${tipo.codigo} para ${d.credorConsignatario} (versão ${String(vigente.versao)}). Nada foi gravado.`);
    }
    const r = await tx.consignacaoDaRubrica.create({
      data: {
        rubricaId: d.rubricaId,
        tipoConsignacaoId: d.tipoConsignacaoId,
        credorConsignatario: d.credorConsignatario,
        fundamento: d.fundamento,
        versao: (vigente?.versao ?? 0) + 1,
        criadoPor: d.criadoPor,
      },
      select: { versao: true },
    });
    return { versao: r.versao };
  });
}

export interface DescontoPendente {
  readonly contrachequeId: string;
  readonly rubricaId: string;
  readonly valor: Money;
  /** A geração em que este desconto será retido: 1 + as retenções anteriores (todas mortas). */
  readonly geracao: number;
}

export interface RetencaoDevidaDaFolha {
  readonly tipoConsignacaoId: string;
  readonly credorConsignatario: string;
  readonly valor: Money;
}

export interface DescontosDaFolhaPendentes {
  /** O que o pagamento tem de reter, somado por (tipo, credor). */
  readonly porConsignacao: readonly RetencaoDevidaDaFolha[];
  /** Cada desconto que o pagamento retém — o elo que se grava na mesma transação. */
  readonly itens: readonly DescontoPendente[];
  readonly total: Money;
}

/**
 * OS DESCONTOS QUE O PAGAMENTO DESTA LIQUIDAÇÃO TEM DE RETER. Nulo quando a liquidação não é de folha.
 * Recusa, nomeando, quando um desconto pendente é de rubrica sem consignação declarada: pagar assim
 * entregaria ao servidor o que é de terceiro.
 */
export async function descontosDaFolhaPendentes(db: Tx, liquidacaoId: string): Promise<DescontosDaFolhaPendentes | null> {
  const ld = await db.liquidacaoDaFolha.findUnique({
    where: { liquidacaoId },
    select: {
      empenhoDaFolha: {
        select: {
          vinculoId: true,
          grupo: { select: { porServidor: true, rubricas: { select: { rubricaId: true } } } },
          apropriacao: { select: { folha: { select: { fechamento: { select: { calculoId: true } } } } } },
        },
      },
    },
  });
  if (ld === null) return null;
  const e = ld.empenhoDaFolha;
  const calculoId = e.apropriacao.folha.fechamento?.calculoId;
  if (calculoId === undefined) {
    throw new Error("A folha desta liquidação não está fechada: os descontos saem do cálculo do fechamento. Nada foi gravado.");
  }
  const contracheques = await db.contracheque.findMany({
    where: filtroDosContrachequesCobertos(calculoId, e),
    select: {
      id: true,
      linhas: {
        where: { tipo: "DESCONTO", rubrica: { natureza: { notIn: NATUREZAS_FORA } } },
        select: { rubricaId: true, valor: true, rubrica: { select: { codigo: true, descricao: true } } },
      },
      descontosRetidos: { select: { rubricaId: true, pagamento: { select: { estornos: { select: { id: true } } } } } },
    },
    orderBy: { id: "asc" },
  });

  const itens: DescontoPendente[] = [];
  const rubricasSemDeclaracao = new Map<string, string>();
  const porRubrica = new Map<string, Money>();
  for (const c of contracheques) {
    // Soma por rubrica no contracheque (duas linhas da mesma rubrica são um desconto só).
    const somaPorRubrica = new Map<string, { valor: Money; rotulo: string }>();
    for (const l of c.linhas) {
      const atual = somaPorRubrica.get(l.rubricaId);
      somaPorRubrica.set(l.rubricaId, {
        valor: toMoney((atual?.valor ?? toMoney("0.00")).plus(l.valor.toString())),
        rotulo: `${l.rubrica.codigo} (${l.rubrica.descricao})`,
      });
    }
    for (const [rubricaId, { valor, rotulo }] of somaPorRubrica) {
      if (!valor.greaterThan(0)) continue;
      const anteriores = c.descontosRetidos.filter((r) => r.rubricaId === rubricaId);
      if (anteriores.some((r) => r.pagamento.estornos.length === 0)) continue; // já retido num pagamento vivo
      itens.push({ contrachequeId: c.id, rubricaId, valor, geracao: anteriores.length + 1 });
      porRubrica.set(rubricaId, toMoney((porRubrica.get(rubricaId) ?? toMoney("0.00")).plus(valor)));
      rubricasSemDeclaracao.set(rubricaId, rotulo);
    }
  }

  const porConsignacao = new Map<string, RetencaoDevidaDaFolha>();
  for (const [rubricaId, valor] of porRubrica) {
    const d = await consignacaoVigenteDaRubrica(db, rubricaId);
    if (d === null) continue;
    rubricasSemDeclaracao.delete(rubricaId);
    const chave = `${d.tipoConsignacaoId}|${d.credorConsignatario}`;
    const atual = porConsignacao.get(chave);
    porConsignacao.set(chave, {
      tipoConsignacaoId: d.tipoConsignacaoId,
      credorConsignatario: d.credorConsignatario,
      valor: toMoney((atual?.valor ?? toMoney("0.00")).plus(valor)),
    });
  }
  if (rubricasSemDeclaracao.size > 0) {
    throw new Error(
      `Os descontos ${[...rubricasSemDeclaracao.values()].join(", ")} desta folha não têm consignação declarada: o pagamento ` +
        `entregaria ao servidor um valor que é de terceiro. Declare a quem cada um é retido em Folha > Descontos retidos no ` +
        `pagamento. Nada foi gravado.`
    );
  }
  const total = itens.reduce((s, i) => toMoney(s.plus(i.valor)), toMoney("0.00"));
  return { porConsignacao: [...porConsignacao.values()], itens, total };
}

/**
 * A CONFERÊNCIA NA GRAVAÇÃO, dentro da transação do pagamento: o que ele retém por (tipo, credor) cobre o que é
 * devido, e os elos nascem com a geração calculada. Dois pagamentos simultâneos que retivessem o mesmo desconto
 * colidem na unicidade (contracheque, rubrica, geração), e o segundo é desfeito inteiro.
 */
export async function exigirERegistrarDescontosDaFolhaNaTx(
  tx: Tx,
  p: {
    readonly liquidacaoId: string;
    readonly pagamentoId: string;
    readonly retidas: readonly { readonly tipoConsignacaoId: string; readonly credorConsignatario: string; readonly valor: Money }[];
    readonly criadoPor: string;
  }
): Promise<void> {
  const devidos = await descontosDaFolhaPendentes(tx, p.liquidacaoId);
  if (devidos === null || devidos.itens.length === 0) return;
  for (const d of devidos.porConsignacao) {
    const retido = p.retidas
      .filter((r) => r.tipoConsignacaoId === d.tipoConsignacaoId && r.credorConsignatario.trim() === d.credorConsignatario.trim())
      .reduce((s, r) => toMoney(s.plus(r.valor)), toMoney("0.00"));
    if (retido.lessThan(d.valor)) {
      throw new Error(
        `Este pagamento de folha retém ${retido.toFixed(2)} para ${d.credorConsignatario}, e os descontos dos servidores devidos a ele ` +
          `somam ${d.valor.toFixed(2)}. Pague pela tela de pagamentos, que inclui as retenções da folha. Nada foi gravado.`
      );
    }
  }
  for (const i of devidos.itens) {
    await tx.descontoDoContrachequeRetido.create({
      data: {
        contrachequeId: i.contrachequeId,
        rubricaId: i.rubricaId,
        pagamentoId: p.pagamentoId,
        valor: i.valor.toFixed(2),
        geracao: i.geracao,
        criadoPor: p.criadoPor,
      },
    });
  }
}
