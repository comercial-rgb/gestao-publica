import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { diaCivil, diaCivilBr, meioDiaCivil } from "../../packages/datas/index.js";
import { toMoney, zMoney } from "../../packages/contracts/index.js";
import { travar } from "../../packages/locks/index.js";
import { gerarEstorno, type LancamentoContabil } from "../../packages/ledger/index.js";
import { lancarNoRazao, type Tx } from "../m01-core-contabil/razao.js";
import { titularVigenteDaConta } from "../m01-core-contabil/entidade-contabil.js";
import { ugVigenteNoDia } from "../m01-core-contabil/unidade-gestora.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";

/**
 * V26 (ordem, item 2.9) — A TRANSFERÊNCIA FINANCEIRA ENTRE UNIDADES GESTORAS DO MESMO ENTE (duodécimo, aportes,
 * devolução), com origem, destino, contas, data, vínculo, estorno e conciliação.
 *
 * ⚠️ NÃO É RECEITA E NÃO É DESPESA ORÇAMENTÁRIA. Quem concede: D VPD intra (3.5.1...) / C banco. Quem recebe:
 * D banco / C VPA intra (4.5.1...). As duas contas vêm de `ContabilizacaoDaTransferenciaEntreUgs`, decidida pelo ente
 * por tipo e vigência — nenhuma conta no código. Na consolidação, o par é o E2 das eliminações do M12.
 *
 * ⚠️ SÓ SE ESCRITURA O LADO QUE É DAQUI. A UG sem entidade contábil é de fora: o lado dela não tem lançamento nem
 * conta, e a conciliação o mostra como "sem confirmação do outro lado" — o sistema não a fabrica.
 */

/** A família da conta de cada lado, e o 5º nível 2 (intra OFSS: as UGs são do mesmo ente). */
const FAMILIA_CONCEDIDA = "3.5.1.";
const FAMILIA_RECEBIDA = "4.5.1.";
const intraOfss = (codigo: string): boolean => codigo.split(".")[4] === "2";

export const TIPOS_DE_TRANSFERENCIA_ENTRE_UGS = [
  "DUODECIMO",
  "APORTE_DESPESAS_ADMINISTRATIVAS",
  "APORTE_INSUFICIENCIA_FINANCEIRA",
  "APORTE_BENEFICIOS_PREVIDENCIARIOS",
  "OUTROS_APORTES",
  "INVESTIMENTOS_OU_RESGATES",
  "DEVOLUCAO_DE_RECURSOS",
  "TRANSFERENCIA_INDIRETA",
] as const;
export type TipoDeTransferenciaEntreUgs = (typeof TIPOS_DE_TRANSFERENCIA_ENTRE_UGS)[number];

export const ROTULO_DA_TRANSFERENCIA_ENTRE_UGS: Readonly<Record<TipoDeTransferenciaEntreUgs, string>> = {
  DUODECIMO: "Duodécimo",
  APORTE_DESPESAS_ADMINISTRATIVAS: "Aporte para despesas administrativas",
  APORTE_INSUFICIENCIA_FINANCEIRA: "Aporte para cobertura de insuficiência financeira",
  APORTE_BENEFICIOS_PREVIDENCIARIOS: "Aporte para benefícios previdenciários do ente",
  OUTROS_APORTES: "Outros aportes",
  INVESTIMENTOS_OU_RESGATES: "Investimentos ou resgates de aplicações",
  DEVOLUCAO_DE_RECURSOS: "Devolução de recursos",
  TRANSFERENCIA_INDIRETA: "Transferência indireta",
};

// ── A contabilização por tipo ────────────────────────────────────────────────────────────────

export const zDefinirContabilizacao = z.object({
  tipo: z.enum(TIPOS_DE_TRANSFERENCIA_ENTRE_UGS),
  contaConcedidaCodigo: z.string().trim().min(1),
  contaRecebidaCodigo: z.string().trim().min(1),
  vigenteDesde: z.coerce.date(),
  fundamento: z.string().trim().min(10, "Diga de onde vem a decisão das contas (PCASP do Tribunal, nota técnica, roteiro)."),
  criadoPor: z.string().min(1),
});

export async function definirContabilizacaoDaTransferenciaEntreUgs(prisma: PrismaClient, input: z.input<typeof zDefinirContabilizacao>): Promise<{ readonly id: string }> {
  const d = zDefinirContabilizacao.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.definirContabilizacaoDaTransferenciaEntreUgs, "ENTE");
    const [vpd, vpa] = await Promise.all([
      tx.contaPcasp.findUnique({ where: { codigo: d.contaConcedidaCodigo }, select: { id: true, codigo: true, analitica: true } }),
      tx.contaPcasp.findUnique({ where: { codigo: d.contaRecebidaCodigo }, select: { id: true, codigo: true, analitica: true } }),
    ]);
    for (const [c, cod, familia, lado] of [
      [vpd, d.contaConcedidaCodigo, FAMILIA_CONCEDIDA, "de quem concede"],
      [vpa, d.contaRecebidaCodigo, FAMILIA_RECEBIDA, "de quem recebe"],
    ] as const) {
      if (c === null) throw new Error(`A conta ${cod} (${lado}) não está no plano de contas. Nada foi gravado.`);
      if (!c.analitica) throw new Error(`A conta ${cod} (${lado}) é sintética; a transferência bate em conta analítica. Nada foi gravado.`);
      if (!c.codigo.startsWith(familia) || !intraOfss(c.codigo)) {
        throw new Error(`A conta ${cod} (${lado}) não é de transferência intragovernamental (${familia}x.2...): as unidades gestoras são do mesmo ente. Nada foi gravado.`);
      }
    }
    const ja = await tx.contabilizacaoDaTransferenciaEntreUgs.findUnique({ where: { tipo_vigenteDesde: { tipo: d.tipo, vigenteDesde: d.vigenteDesde } }, select: { id: true } });
    if (ja !== null) throw new Error("Já há contabilização deste tipo com esta vigência. Nada foi gravado.");
    const c = await tx.contabilizacaoDaTransferenciaEntreUgs.create({
      data: { tipo: d.tipo, contaConcedidaId: vpd!.id, contaRecebidaId: vpa!.id, vigenteDesde: d.vigenteDesde, fundamento: d.fundamento, criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { id: c.id };
  });
}

/** A contabilização vigente do tipo no dia civil (a de maior vigência até ele), ou null. */
export async function contabilizacaoVigenteDaTransferencia(tx: Tx, tipo: TipoDeTransferenciaEntreUgs, dia: Date) {
  const todas = await tx.contabilizacaoDaTransferenciaEntreUgs.findMany({
    where: { tipo },
    orderBy: [{ vigenteDesde: "desc" }, { criadoEm: "desc" }],
    select: { id: true, vigenteDesde: true, contaConcedidaId: true, contaRecebidaId: true },
  });
  return todas.find((c) => diaCivil(c.vigenteDesde) <= diaCivil(dia)) ?? null;
}

// ── A transferência ──────────────────────────────────────────────────────────────────────────

export const zRegistrarTransferenciaEntreUgs = z.object({
  tipo: z.enum(TIPOS_DE_TRANSFERENCIA_ENTRE_UGS),
  ugOrigemId: z.string().min(1),
  ugDestinoId: z.string().min(1),
  valor: zMoney,
  data: z.coerce.date(),
  contaOrigemId: z.string().min(1).nullable(),
  contaDestinoId: z.string().min(1).nullable(),
  vinculo: z.string().trim().min(5, "Informe o ato ou documento que sustenta a transferência."),
  criadoPor: z.string().min(1),
});
export type RegistrarTransferenciaEntreUgsInput = z.input<typeof zRegistrarTransferenciaEntreUgs>;

async function contaDoLado(
  tx: Tx,
  lado: "origem" | "destino",
  ug: { readonly codigoTce: string; readonly entidadeContabilId: string | null },
  contaId: string | null
): Promise<{ readonly id: string; readonly contaContabilId: string } | null> {
  if (ug.entidadeContabilId === null) {
    if (contaId !== null) throw new Error(`A unidade gestora ${ug.codigoTce} (${lado}) é de fora: a conta dela não é escriturada aqui. Nada foi gravado.`);
    return null;
  }
  if (contaId === null) throw new Error(`Informe a conta bancária da unidade gestora ${ug.codigoTce} (${lado}). Nada foi gravado.`);
  const conta = await tx.contaBancaria.findUnique({ where: { id: contaId }, select: { id: true, codigo: true, contaContabilId: true } });
  if (conta === null) throw new Error(`Conta bancária ${contaId} não encontrada. Nada foi gravado.`);
  if (conta.contaContabilId === null) throw new Error(`A conta ${conta.codigo} não tem a conta contábil mapeada. Nada foi gravado.`);
  const titular = await titularVigenteDaConta(tx, conta.id);
  if (titular === null || titular.entidadeId !== ug.entidadeContabilId) {
    throw new Error(
      `A conta ${conta.codigo} não está declarada como da entidade da unidade gestora ${ug.codigoTce}` +
        `${titular === null ? " (a conta não tem titular declarado)" : ` (o titular declarado é ${titular.codigo})`}. Nada foi gravado.`
    );
  }
  return { id: conta.id, contaContabilId: conta.contaContabilId };
}

/** A data da transferência é um dia civil do ente: guarda-se o meio-dia dele, e o arquivo do Tribunal a escreve certa. */
const noDiaCivil = (data: Date): Date => meioDiaCivil(diaCivil(data));

export async function registrarTransferenciaEntreUgs(prisma: PrismaClient, input: RegistrarTransferenciaEntreUgsInput): Promise<{ readonly id: string }> {
  const bruto = zRegistrarTransferenciaEntreUgs.parse(input);
  const d = { ...bruto, data: noDiaCivil(bruto.data) };
  if (d.ugOrigemId === d.ugDestinoId) throw new Error("A unidade gestora de origem e a de destino são a mesma. Nada foi gravado.");
  if (!d.valor.greaterThan(0)) throw new Error("O valor da transferência tem de ser maior que zero. Nada foi gravado.");
  const valor = d.valor.toFixed(2);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarTransferenciaEntreUgs, "ENTE");
    const sel = { id: true, codigoTce: true, nome: true, entidadeContabilId: true, vigenteDesde: true, encerramento: { select: { vigenteAte: true } } } as const;
    const [origem, destino] = await Promise.all([tx.unidadeGestora.findUnique({ where: { id: d.ugOrigemId }, select: sel }), tx.unidadeGestora.findUnique({ where: { id: d.ugDestinoId }, select: sel })]);
    if (origem === null || destino === null) throw new Error("Unidade gestora não encontrada. Nada foi gravado.");
    for (const ug of [origem, destino]) {
      if (!ugVigenteNoDia(ug, d.data)) throw new Error(`A unidade gestora ${ug.codigoTce} não está vigente em ${diaCivilBr(d.data)}. Nada foi gravado.`);
    }
    if (origem.entidadeContabilId === null && destino.entidadeContabilId === null) {
      throw new Error("Nenhuma das duas unidades gestoras é escriturada neste sistema: não há lado a registrar aqui. Nada foi gravado.");
    }
    // Pré-condições antes de qualquer gravação: contas, titulares e a contabilização do tipo.
    const contaOrigem = await contaDoLado(tx, "origem", origem, d.contaOrigemId);
    const contaDestino = await contaDoLado(tx, "destino", destino, d.contaDestinoId);
    const contab = await contabilizacaoVigenteDaTransferencia(tx, d.tipo, d.data);
    if (contab === null) {
      throw new Error(`Não há contabilização decidida para ${ROTULO_DA_TRANSFERENCIA_ENTRE_UGS[d.tipo].toLowerCase()} em ${diaCivilBr(d.data)}. Defina as contas em Tesouraria › Transferências entre unidades gestoras. Nada foi gravado.`);
    }
    const contas = [contaOrigem?.id, contaDestino?.id].filter((x): x is string => x !== undefined).sort();
    await travar(tx, "ContaBancaria", contas);

    const id = randomUUID();
    const controle = `TUG-${id.slice(0, 8)}`;
    const historico = `${ROTULO_DA_TRANSFERENCIA_ENTRE_UGS[d.tipo]} de ${origem.codigoTce} para ${destino.codigoTce} — ${d.vinculo}`;
    const lancamentoConcedidaId =
      contaOrigem === null
        ? null
        : await lancarNoRazao(tx, {
            numeroControle: `${controle}-C`,
            dataTransacao: d.data,
            historico,
            origemTipo: "TRANSFERENCIA_ENTRE_UGS_CONCEDIDA",
            origemId: id,
            criadoPor: d.criadoPor,
            partidas: [
              { contaId: contab.contaConcedidaId, tipo: "DEBITO", subsistema: "PATRIMONIAL", valor },
              { contaId: contaOrigem.contaContabilId, tipo: "CREDITO", subsistema: "PATRIMONIAL", valor },
            ],
          });
    const lancamentoRecebidaId =
      contaDestino === null
        ? null
        : await lancarNoRazao(tx, {
            numeroControle: `${controle}-R`,
            dataTransacao: d.data,
            historico,
            origemTipo: "TRANSFERENCIA_ENTRE_UGS_RECEBIDA",
            origemId: id,
            criadoPor: d.criadoPor,
            partidas: [
              { contaId: contaDestino.contaContabilId, tipo: "DEBITO", subsistema: "PATRIMONIAL", valor },
              { contaId: contab.contaRecebidaId, tipo: "CREDITO", subsistema: "PATRIMONIAL", valor },
            ],
          });
    await tx.transferenciaEntreUgs.create({
      data: {
        id,
        tipo: d.tipo,
        ugOrigemId: origem.id,
        ugDestinoId: destino.id,
        valor,
        data: d.data,
        contaOrigemId: contaOrigem?.id ?? null,
        contaDestinoId: contaDestino?.id ?? null,
        vinculo: d.vinculo,
        contabilizacaoId: contab.id,
        lancamentoConcedidaId,
        lancamentoRecebidaId,
        criadoPor: d.criadoPor,
      },
    });
    return { id };
  });
}

// ── O estorno ────────────────────────────────────────────────────────────────────────────────

export const zEstornarTransferenciaEntreUgs = z.object({
  transferenciaId: z.string().min(1),
  data: z.coerce.date(),
  motivo: z.string().trim().min(5, "Diga por que a transferência é estornada."),
  criadoPor: z.string().min(1),
});

async function estornarLancamento(tx: Tx, lancamentoId: string, data: Date, motivo: string, origemTipo: string, origemId: string, criadoPor: string): Promise<string> {
  const l = await tx.lancamentoContabil.findUniqueOrThrow({
    where: { id: lancamentoId },
    select: { id: true, numeroControle: true, dataTransacao: true, historico: true, estornoDeId: true, estornos: { select: { id: true } }, partidas: { select: { tipo: true, subsistema: true, valor: true, contaId: true, conta: { select: { codigo: true } } } } },
  });
  const dominio: LancamentoContabil = {
    id: l.id,
    numeroControle: l.numeroControle,
    partidas: l.partidas.map((p) => ({ conta: p.conta.codigo, tipo: p.tipo, subsistema: p.subsistema, valor: toMoney(p.valor.toFixed(2)) })),
    dataTransacao: l.dataTransacao,
    historico: l.historico,
    ...(l.estornoDeId !== null ? { estornoDeId: l.estornoDeId } : {}),
    estornos: l.estornos.map((e) => e.id),
  };
  const e = gerarEstorno(dominio, { idEstorno: randomUUID(), numeroControleEstorno: `${l.numeroControle}-EST`, dataEstorno: data });
  const idDaConta = new Map(l.partidas.map((p) => [p.conta.codigo, p.contaId]));
  return lancarNoRazao(tx, {
    id: e.id,
    numeroControle: e.numeroControle,
    dataTransacao: data,
    historico: `${e.historico} — ${motivo}`,
    origemTipo,
    origemId,
    estornoDeId: l.id,
    criadoPor,
    partidas: e.partidas.map((p) => ({ contaId: idDaConta.get(p.conta)!, tipo: p.tipo, subsistema: p.subsistema, valor: p.valor.toFixed(2) })),
  });
}

export async function estornarTransferenciaEntreUgs(prisma: PrismaClient, input: z.input<typeof zEstornarTransferenciaEntreUgs>): Promise<{ readonly id: string }> {
  const bruto = zEstornarTransferenciaEntreUgs.parse(input);
  const d = { ...bruto, data: noDiaCivil(bruto.data) };
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.estornarTransferenciaEntreUgs, "ENTE");
    const o = await tx.transferenciaEntreUgs.findUnique({ where: { id: d.transferenciaId }, include: { estorno: { select: { id: true } } } });
    if (o === null) throw new Error("Transferência não encontrada. Nada foi gravado.");
    if (o.estornoDeId !== null) throw new Error("Esta linha já é um estorno: um estorno não se estorna. Nada foi gravado.");
    if (o.estorno !== null) throw new Error("A transferência já foi estornada. Nada foi gravado.");
    if (diaCivil(d.data) < diaCivil(o.data)) throw new Error(`O estorno não pode ser anterior à transferência (${diaCivilBr(o.data)}). Nada foi gravado.`);
    await travar(tx, "ContaBancaria", [o.contaOrigemId, o.contaDestinoId].filter((x): x is string => x !== null).sort());
    const id = randomUUID();
    const lancamentoConcedidaId = o.lancamentoConcedidaId === null ? null : await estornarLancamento(tx, o.lancamentoConcedidaId, d.data, d.motivo, "TRANSFERENCIA_ENTRE_UGS_CONCEDIDA_ESTORNADA", id, d.criadoPor);
    const lancamentoRecebidaId = o.lancamentoRecebidaId === null ? null : await estornarLancamento(tx, o.lancamentoRecebidaId, d.data, d.motivo, "TRANSFERENCIA_ENTRE_UGS_RECEBIDA_ESTORNADA", id, d.criadoPor);
    await tx.transferenciaEntreUgs.create({
      data: {
        id,
        tipo: o.tipo,
        ugOrigemId: o.ugOrigemId,
        ugDestinoId: o.ugDestinoId,
        valor: o.valor,
        data: d.data,
        contaOrigemId: o.contaOrigemId,
        contaDestinoId: o.contaDestinoId,
        vinculo: o.vinculo,
        contabilizacaoId: o.contabilizacaoId,
        lancamentoConcedidaId,
        lancamentoRecebidaId,
        estornoDeId: o.id,
        motivo: d.motivo,
        criadoPor: d.criadoPor,
      },
    });
    return { id };
  });
}

// ── A conciliação ────────────────────────────────────────────────────────────────────────────

export interface LinhaDaConciliacaoEntreUgs {
  readonly id: string;
  readonly data: Date;
  readonly tipo: TipoDeTransferenciaEntreUgs;
  readonly origem: string;
  readonly destino: string;
  readonly valor: string;
  readonly estorno: boolean;
  readonly estornada: boolean;
  /** V36 — os lançamentos de cada lado, para a tela abrir a escrituração (null: o lado é de fora). */
  readonly lancamentoConcedidaId: string | null;
  readonly lancamentoRecebidaId: string | null;
  /** Os dois lados escriturados aqui (conciliada por construção), ou qual lado falta e por quê. */
  readonly situacao: "DOIS_LADOS_AQUI" | "RECEBIMENTO_SEM_CONFIRMACAO" | "CONCESSAO_SEM_CONFIRMACAO";
}

/**
 * As transferências do período com a situação de cada uma: com as duas UGs escrituradas aqui, os dois lançamentos
 * nascem no mesmo fato; com uma UG de fora, o outro lado aparece como sem confirmação — nunca como confirmado.
 * O líquido por par de UGs desconta os estornos.
 */
export async function conciliacaoDasTransferenciasEntreUgs(
  prisma: PrismaClient,
  p: { readonly de: Date; readonly ate: Date }
): Promise<{ readonly linhas: readonly LinhaDaConciliacaoEntreUgs[]; readonly liquidoPorPar: readonly { readonly origem: string; readonly destino: string; readonly liquido: string }[] }> {
  const todas = await prisma.transferenciaEntreUgs.findMany({
    orderBy: [{ data: "asc" }, { criadoEm: "asc" }],
    select: {
      id: true,
      data: true,
      tipo: true,
      valor: true,
      estornoDeId: true,
      estorno: { select: { id: true } },
      lancamentoConcedidaId: true,
      lancamentoRecebidaId: true,
      ugOrigem: { select: { codigoTce: true, nome: true } },
      ugDestino: { select: { codigoTce: true, nome: true } },
    },
  });
  const de = diaCivil(p.de);
  const ate = diaCivil(p.ate);
  const doPeriodo = todas.filter((t) => diaCivil(t.data) >= de && diaCivil(t.data) <= ate);
  const linhas = doPeriodo.map((t) => ({
    id: t.id,
    data: t.data,
    tipo: t.tipo,
    origem: `${t.ugOrigem.codigoTce} ${t.ugOrigem.nome}`,
    destino: `${t.ugDestino.codigoTce} ${t.ugDestino.nome}`,
    valor: t.valor.toFixed(2),
    estorno: t.estornoDeId !== null,
    estornada: t.estorno !== null,
    lancamentoConcedidaId: t.lancamentoConcedidaId,
    lancamentoRecebidaId: t.lancamentoRecebidaId,
    situacao:
      t.lancamentoConcedidaId !== null && t.lancamentoRecebidaId !== null
        ? ("DOIS_LADOS_AQUI" as const)
        : t.lancamentoConcedidaId !== null
          ? ("RECEBIMENTO_SEM_CONFIRMACAO" as const)
          : ("CONCESSAO_SEM_CONFIRMACAO" as const),
  }));
  const pares = new Map<string, { origem: string; destino: string; liquido: ReturnType<typeof toMoney> }>();
  for (const l of linhas) {
    const k = `${l.origem}|${l.destino}`;
    const atual = pares.get(k) ?? { origem: l.origem, destino: l.destino, liquido: toMoney("0") };
    atual.liquido = l.estorno ? atual.liquido.minus(toMoney(l.valor)) : atual.liquido.plus(toMoney(l.valor));
    pares.set(k, atual);
  }
  return { linhas, liquidoPorPar: [...pares.values()].map((x) => ({ origem: x.origem, destino: x.destino, liquido: x.liquido.toFixed(2) })) };
}
