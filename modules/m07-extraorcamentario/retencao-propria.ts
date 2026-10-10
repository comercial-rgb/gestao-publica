import { z } from "zod";
import { diaCivil } from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { normalizarCodigoNaturezaReceita } from "../m04-receita/ementario.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import {
  FAMILIA_DA_VPA_DO_FATO,
  FAMILIA_DO_CREDITO_TRIBUTARIO,
  FATOS_DA_RETENCAO_PROPRIA,
  ROTULO_DO_FATO_PROPRIO,
  fatoProprioDoTributo,
  type FatoDaRetencaoPropria,
  type RetencaoPropriaParaCompor,
} from "./dominio.js";
import type { Tx } from "./extraorcamentario.js";
import { irDaFolhaPendente } from "../m33-folha/ir-da-folha.js";

/**
 * V26 — O IR E O ISS RETIDOS PELO PRÓPRIO TESOURO: a decisão do ente e as regras que todo pagamento atravessa.
 *
 * ═══ A ORDEM DA DECISÃO (ordem V26, 1.1) ═══
 * Antes de tratar uma retenção como receita, o servidor identifica: o tributo (o FATO), o titular da receita
 * (a entidade do Tesouro na classificação), a entidade pagadora (o titular da conta que paga), a destinação
 * (a fonte da classificação, não a da despesa) e se há crédito já reconhecido (num pagamento novo não há:
 * o fato gerador do IR e do ISS retidos é o próprio pagamento).
 *
 * - Mesmo perímetro (a conta que paga é do titular do Tesouro, ou o ente não declarou entidades): RECEITA.
 * - Perímetro diferente (um fundo ou autarquia com conta própria paga e retém IR do Tesouro): o dinheiro tem
 *   de ser REPASSADO de verdade — fica como consignação ao Tesouro, e o recolhimento dela não é bloqueado.
 * - Sem classificação vigente: RECUSA nomeando o cadastro. Não há conta, natureza ou fonte de reserva.
 */

export interface ClassificacaoVigente {
  readonly id: string;
  readonly fato: FatoDaRetencaoPropria;
  readonly tipoConsignacaoId: string;
  readonly tipoConsignacaoCodigo: string;
  readonly naturezaReceitaCodigo: string;
  readonly fonteCodigo: string;
  readonly contaCredito: string;
  readonly contaVpa: string;
  readonly entidadeTitularId: string | null;
  readonly vigenteDesde: Date;
  readonly fundamento: string;
}

const SELECAO = {
  id: true,
  fato: true,
  tipoConsignacaoId: true,
  tipoConsignacao: { select: { codigo: true } },
  naturezaReceita: { select: { codigo: true } },
  fonte: { select: { codigo: true } },
  contaCredito: { select: { codigo: true } },
  contaVpa: { select: { codigo: true } },
  entidadeTitularId: true,
  vigenteDesde: true,
  fundamento: true,
} as const;

type Linha = {
  id: string;
  fato: string;
  tipoConsignacaoId: string;
  tipoConsignacao: { codigo: string };
  naturezaReceita: { codigo: string };
  fonte: { codigo: string };
  contaCredito: { codigo: string };
  contaVpa: { codigo: string };
  entidadeTitularId: string | null;
  vigenteDesde: Date;
  fundamento: string;
};

function projetar(l: Linha): ClassificacaoVigente {
  return {
    id: l.id,
    fato: l.fato as FatoDaRetencaoPropria,
    tipoConsignacaoId: l.tipoConsignacaoId,
    tipoConsignacaoCodigo: l.tipoConsignacao.codigo,
    naturezaReceitaCodigo: l.naturezaReceita.codigo,
    fonteCodigo: l.fonte.codigo,
    contaCredito: l.contaCredito.codigo,
    contaVpa: l.contaVpa.codigo,
    entidadeTitularId: l.entidadeTitularId,
    vigenteDesde: l.vigenteDesde,
    fundamento: l.fundamento,
  };
}

/**
 * A classificação vigente do fato na data: a de maior `vigenteDesde` até ela; empate, a gravada por último.
 *
 * ⚠️ PELO DIA CIVIL DO ENTE. `vigenteDesde` é uma data (meia-noite UTC no banco) e o pagamento é um instante: às
 * 21h30 de 28/02 em Esperança já é 01/03 em UTC, e a comparação crua aplicaria uma decisão que só vale de 01/03.
 */
export async function classificacaoPropriaVigente(
  db: Tx,
  fato: FatoDaRetencaoPropria,
  data: Date
): Promise<ClassificacaoVigente | null> {
  const ate = new Date(`${diaCivil(data)}T00:00:00.000Z`);
  const l = await db.classificacaoDaRetencaoPropria.findFirst({
    where: { fato, vigenteDesde: { lte: ate } },
    orderBy: [{ vigenteDesde: "desc" }, { criadoEm: "desc" }],
    select: SELECAO,
  });
  return l === null ? null : projetar(l);
}

/** Todas as vigentes hoje e o histórico, para a tela. */
export async function listarClassificacoesDaRetencaoPropria(db: Tx): Promise<readonly (ClassificacaoVigente & { readonly criadoEm: Date; readonly criadoPor: string })[]> {
  const ls = await db.classificacaoDaRetencaoPropria.findMany({
    orderBy: [{ fato: "asc" }, { vigenteDesde: "desc" }, { criadoEm: "desc" }],
    select: { ...SELECAO, criadoEm: true, criadoPor: true },
  });
  return ls.map((l) => ({ ...projetar(l), criadoEm: l.criadoEm, criadoPor: l.criadoPor }));
}

/** O titular vigente da conta bancária (a declaração de maior versão), ou nulo. */
async function titularDaConta(db: Tx, contaBancariaId: string): Promise<string | null> {
  const d = await db.declaracaoDeTitularDaConta.findFirst({
    where: { contaBancariaId },
    orderBy: { versao: "desc" },
    select: { entidadeId: true },
  });
  return d?.entidadeId ?? null;
}

/**
 * O MESMO PERÍMETRO: a conta que paga é do titular do Tesouro da classificação. Nulo dos dois lados (o ente
 * não declarou entidades nem titular de conta) é o ente único — mesmo perímetro.
 */
export async function mesmoPerimetro(db: Tx, contaBancariaId: string, c: ClassificacaoVigente): Promise<boolean> {
  return (await titularDaConta(db, contaBancariaId)) === c.entidadeTitularId;
}

/** A classificação vigente, ou a recusa que nomeia o fato e o cadastro. */
export async function exigirClassificacaoPropria(
  db: Tx,
  fato: FatoDaRetencaoPropria,
  data: Date
): Promise<ClassificacaoVigente> {
  const c = await classificacaoPropriaVigente(db, fato, data);
  if (c === null) {
    throw new Error(
      `${ROTULO_DO_FATO_PROPRIO[fato]}: é imposto do próprio município, que entra como receita, e o município ainda ` +
        `não disse com que natureza de receita, destinação e contas. Cadastre em Financeiro › Retenções do ` +
        `próprio município. Nada foi gravado.`
    );
  }
  return c;
}

// ── O cadastro ────────────────────────────────────────────────────────────────────────────────────

export const zClassificarRetencaoPropria = z.object({
  fato: z.enum(FATOS_DA_RETENCAO_PROPRIA),
  tipoConsignacaoCodigo: z.string().trim().min(1),
  naturezaReceitaCodigo: z.string().trim().min(1),
  fonteCodigo: z.string().trim().min(1),
  contaCreditoCodigo: z.string().trim().min(1),
  contaVpaCodigo: z.string().trim().min(1),
  entidadeTitularId: z.string().trim().min(1).nullable(),
  vigenteDesde: z.date(),
  fundamento: z.string().transform((s) => s.trim().replace(/\s+/g, " ")).pipe(z.string().min(10, "Diga de onde vem a decisão (ato, orientação do contador, ementário), com pelo menos 10 caracteres.")),
  criadoPor: z.string().min(1),
});
export type ClassificarRetencaoPropriaInput = z.input<typeof zClassificarRetencaoPropria>;

async function exigirContaAnalitica(db: Tx, codigo: string, familia: string, papel: string): Promise<string> {
  const c = await db.contaPcasp.findUnique({ where: { codigo }, select: { id: true, analitica: true } });
  if (c === null) throw new Error(`A conta ${codigo} não existe no plano de contas. Nada foi gravado.`);
  if (!c.analitica) throw new Error(`A conta ${codigo} é sintética: ${papel} só se lança em conta analítica. Nada foi gravado.`);
  if (!codigo.startsWith(familia)) throw new Error(`A conta ${codigo} não é da família ${familia}.. — ${papel}. Nada foi gravado.`);
  return c.id;
}

/**
 * Registra a decisão do ente (append-only). Uma nova decisão com vigência posterior substitui a anterior dali
 * em diante; o pagamento de ontem continua ligado à decisão de ontem.
 */
export async function classificarRetencaoPropria(
  prisma: PrismaClient,
  input: ClassificarRetencaoPropriaInput
): Promise<{ readonly id: string }> {
  const d = zClassificarRetencaoPropria.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.classificarRetencaoPropria, "ENTE");

    const tipo = await tx.tipoConsignacao.findUnique({ where: { codigo: d.tipoConsignacaoCodigo }, select: { id: true } });
    if (tipo === null) throw new Error(`O tipo de consignação ${d.tipoConsignacaoCodigo} não existe. Nada foi gravado.`);

    // A natureza do PRINCIPAL: o último dígito do código é o tipo (1 principal, 2 multas e juros, 3 dívida
    // ativa, 4 multas e juros da dívida ativa — ementário STN 2026, aba Tabelas, 7º nível). O agregador
    // (final 0) não é lançável, e multa ou dívida ativa não é o que a fonte retém.
    const codigo = normalizarCodigoNaturezaReceita(d.naturezaReceitaCodigo);
    if (!codigo.endsWith("1")) {
      throw new Error(`A natureza ${codigo} não é de principal (o último dígito do principal é 1): multa, juros, dívida ativa ou agregador não é o imposto retido na fonte. Nada foi gravado.`);
    }
    const natureza = await tx.naturezaReceita.findUnique({ where: { codigo }, select: { id: true } });
    if (natureza === null) throw new Error(`A natureza de receita ${codigo} não está no ementário do município. Cadastre-a em Receita › Naturezas de receita. Nada foi gravado.`);

    const fonte = await tx.fonteRecurso.findFirst({ where: { codigo: d.fonteCodigo }, select: { id: true } });
    if (fonte === null) throw new Error(`A fonte ${d.fonteCodigo} não existe. Nada foi gravado.`);

    const contaCreditoId = await exigirContaAnalitica(tx, d.contaCreditoCodigo, FAMILIA_DO_CREDITO_TRIBUTARIO, "o crédito tributário a receber");
    const contaVpaId = await exigirContaAnalitica(tx, d.contaVpaCodigo, FAMILIA_DA_VPA_DO_FATO[d.fato], "a variação patrimonial aumentativa do imposto");

    if (d.entidadeTitularId !== null) {
      const e = await tx.entidadeContabil.findUnique({ where: { id: d.entidadeTitularId }, select: { id: true } });
      if (e === null) throw new Error("A entidade do Tesouro informada não existe. Nada foi gravado.");
    }

    const c = await tx.classificacaoDaRetencaoPropria.create({
      data: {
        fato: d.fato,
        tipoConsignacaoId: tipo.id,
        naturezaReceitaId: natureza.id,
        fonteId: fonte.id,
        contaCreditoId,
        contaVpaId,
        entidadeTitularId: d.entidadeTitularId,
        vigenteDesde: d.vigenteDesde,
        fundamento: d.fundamento,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { id: c.id };
  });
}

// ── As recusas que toda entrada atravessa ─────────────────────────────────────────────────────────

/**
 * O saldo de consignação de um tipo/credor é imposto do PRÓPRIO Tesouro, retido no mesmo perímetro? Então não
 * é dívida com terceiro: não se "recolhe" a si mesmo com saída de banco, nem se retém de novo como consignação.
 *
 * É o próprio Tesouro quando: há classificação vigente para o tipo, o credor é o próprio ente (o nome
 * cadastrado) e a conta é do mesmo titular do Tesouro. ISS devido a OUTRO município tem outro credor; o INSS
 * não tem classificação; o IR retido por um fundo com conta própria tem outro titular — nenhum deles é barrado.
 */
export async function ehTributoDoProprioTesouro(
  db: Tx,
  p: {
    readonly tipoConsignacaoId: string;
    readonly credorConsignatario: string;
    readonly contaBancariaId: string;
    readonly data: Date;
    /**
     * Os fatos a considerar. O IR da folha e o IR de fornecedor podem apontar para o MESMO tipo de consignação: quem
     * precisa do fato certo (a regularização, que escolhe a natureza) restringe pela origem do pagamento.
     */
    readonly fatos?: readonly FatoDaRetencaoPropria[] | undefined;
  }
): Promise<ClassificacaoVigente | null> {
  const ente = await db.enteConfig.findFirst({ select: { nome: true } });
  if (ente === null || p.credorConsignatario.trim() !== ente.nome.trim()) return null;
  for (const fato of p.fatos ?? FATOS_DA_RETENCAO_PROPRIA) {
    const c = await classificacaoPropriaVigente(db, fato, p.data);
    if (c !== null && c.tipoConsignacaoId === p.tipoConsignacaoId && (await mesmoPerimetro(db, p.contaBancariaId, c))) return c;
  }
  return null;
}

// ── V26 — o IR da folha no pagamento ─────────────────────────────────────────────────────────────────

/**
 * O que o pagamento de uma liquidação de FOLHA retém do IR dos servidores: a retenção própria (mesmo caixa do
 * Tesouro) ou, se a conta que paga é de outra entidade, a consignação ao município para o repasse real. Nulo quando a
 * liquidação não é de folha ou não há IR pendente. Sem decisão vigente para o IR da folha, recusa nomeando o cadastro.
 */
export async function irDaFolhaNoPagamento(
  db: Tx,
  p: { readonly liquidacaoId: string; readonly data: Date; readonly contaBancariaId: string }
): Promise<
  | { readonly propria: RetencaoPropriaParaCompor; readonly consignacao: null }
  | { readonly propria: null; readonly consignacao: { readonly tipoConsignacaoId: string; readonly credorConsignatario: string; readonly valor: string } }
  | null
> {
  const ir = await irDaFolhaPendente(db, p.liquidacaoId);
  if (ir === null || !ir.total.greaterThan(0)) return null;
  const c = await exigirClassificacaoPropria(db, "IRRF_FOLHA", p.data);
  if (await mesmoPerimetro(db, p.contaBancariaId, c)) {
    return {
      propria: {
        fato: "IRRF_FOLHA",
        classificacaoId: c.id,
        valor: ir.total,
        contaCredito: c.contaCredito,
        contaVpa: c.contaVpa,
        naturezaReceitaCodigo: c.naturezaReceitaCodigo,
        fonteCodigo: c.fonteCodigo,
        entidadeTitularId: c.entidadeTitularId,
        grupoDaFolhaId: ir.grupoDaFolhaId,
        contrachequesDaFolha: ir.contracheques,
      },
      consignacao: null,
    };
  }
  const ente = await db.enteConfig.findFirst({ select: { nome: true } });
  return { propria: null, consignacao: { tipoConsignacaoId: c.tipoConsignacaoId, credorConsignatario: ente?.nome ?? "Município", valor: ir.total.toFixed(2) } };
}

/**
 * Os fatos possíveis de uma retenção feita num pagamento: o da FOLHA, se o pagamento é de uma liquidação de folha; o de
 * FORNECEDOR, senão. O ISS vale nos dois. É o que impede o IR antigo de um fornecedor de virar receita do IR do trabalho.
 *
 * ⚠️ V39-R2 (R2-005) — O IR DE FORNECEDOR É UM SÓ FATO, PELO CREDOR DO EMPENHO: o da PF (CPF) ou o da PJ (CNPJ). As
 * duas decisões apontam, em geral, para o MESMO tipo de consignação (IRRF); oferecer os dois faria a primeira da lista
 * vencer, e a receita de um credor PF iria para a natureza da PJ (ou o contrário). Documento fora do padrão: recusa.
 */
export async function fatosDaOrigemDoPagamento(db: Tx, pagamentoId: string): Promise<readonly FatoDaRetencaoPropria[]> {
  const pag = await db.pagamento.findUnique({ where: { id: pagamentoId }, select: { liquidacaoId: true, liquidacao: { select: { empenho: { select: { credorCpfCnpj: true } } } } } });
  const ehFolha = pag !== null && (await db.liquidacaoDaFolha.findUnique({ where: { liquidacaoId: pag.liquidacaoId }, select: { id: true } })) !== null;
  if (ehFolha || pag === null) return ["IRRF_FOLHA", "ISS"];
  return [fatoProprioDoTributo("IRRF", pag.liquidacao.empenho.credorCpfCnpj)!, "ISS"];
}
