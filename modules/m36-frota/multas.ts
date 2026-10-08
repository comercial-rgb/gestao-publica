import { randomUUID } from "node:crypto";
import { z } from "zod";
import { toMoney, zMoney, type Money } from "../../packages/contracts/index.js";
import { formatarMoeda } from "../../packages/contracts/moeda.js";
import { diaCivil, inicioDoDiaCivil, meioDiaCivil } from "../../packages/datas/index.js";
import { normalizarDocumento } from "../../packages/documento/index.js";
import { travar } from "../../packages/locks/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { lancarNoRazao } from "../m01-core-contabil/razao.js";
import { roteiroPatrimonialVigente } from "../m01-core-contabil/roteiro-patrimonial-declarado.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { situacaoNoDia } from "./dominio.js";

/**
 * V36 (TR 5.10.1.45) — AS MULTAS DE TRÂNSITO DOS VEÍCULOS DA FROTA. Ver `prisma/schema/m36-multas.prisma`.
 *
 * ═══ O QUE SE REGISTRA ═══
 * O auto de infração (órgão autuador e número, único entre si), o veículo, a data e o local da infração, a infração como
 * consta do auto, o valor e o INFRATOR — a pessoa física do cadastro único (o condutor identificado no auto ou indicado
 * pelo ente). A data da notificação é a do lançamento de controle.
 *
 * ═══ OS LANÇAMENTOS DE CONTROLE ═══
 * No registro e na baixa, um lançamento no subsistema de CONTROLE pelas contas que a contabilidade DECLARA (roteiro da
 * família MULTA_DE_TRANSITO, chaves REGISTRO e BAIXA). Nenhuma conta está no código: sem a declaração, a multa é recusada
 * dizendo onde declará-la. O lançamento e o registro vão na mesma transação, depois de todas as conferências.
 *
 * ═══ A BAIXA ═══
 * Uma por multa: paga pelo ente, ressarcida pelo infrator, cancelada em recurso, ou registro indevido. O pagamento (o
 * empenho da multa) e a cobrança do infrator seguem os fluxos próprios; aqui fica o controle de que a multa existiu e
 * terminou.
 *
 * ═══ A TRAVA ═══
 * A do veículo (BemDaFrota), a mesma do abastecimento e da situação: a multa confere a situação do veículo no dia.
 */

export const TIPOS_DE_BAIXA_DA_MULTA = ["PAGA_PELO_ENTE", "RESSARCIDA_PELO_INFRATOR", "CANCELADA_EM_RECURSO", "REGISTRO_INDEVIDO"] as const;
export type TipoDeBaixaDaMulta = (typeof TIPOS_DE_BAIXA_DA_MULTA)[number];
export const ROTULO_DA_BAIXA: Readonly<Record<TipoDeBaixaDaMulta, string>> = {
  PAGA_PELO_ENTE: "Paga pelo ente",
  RESSARCIDA_PELO_INFRATOR: "Ressarcida pelo infrator",
  CANCELADA_EM_RECURSO: "Cancelada em recurso",
  REGISTRO_INDEVIDO: "Registro indevido",
};

/** O dia civil AAAA-MM-DD que EXISTE (31/02 não passa: as comparações são do texto e a gravação seria de outro dia). */
const zDia = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data.")
  .refine((s) => {
    try {
      return diaCivil(meioDiaCivil(s)) === s;
    } catch {
      return false;
    }
  }, "Data inexistente.");

/**
 * A forma canônica do órgão autuador e do número do auto: é a chave contra o mesmo auto registrado duas vezes ("Detran/PB"
 * e "DETRAN-PB" são o mesmo órgão). Sem acento, maiúsculas, e no órgão qualquer separador vira hífen.
 */
export function orgaoAutuadorCanonico(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
export function numeroDoAutoCanonico(s: string): string {
  return s.toUpperCase().replace(/\s+/g, "");
}

const zRegistrarMulta = z.object({
  veiculoId: z.string().min(1, "Escolha o veículo."),
  orgaoAutuador: z.string().trim().max(120).transform(orgaoAutuadorCanonico).pipe(z.string().min(2, "Informe o órgão autuador.")),
  numeroDoAuto: z.string().trim().max(30).transform(numeroDoAutoCanonico).pipe(z.string().min(1, "Informe o número do auto de infração.")),
  diaDaInfracao: zDia,
  diaDaNotificacao: zDia,
  local: z.string().trim().min(2, "Informe o local da infração."),
  infracao: z.string().trim().min(5, "Descreva a infração como consta do auto."),
  valor: zMoney.refine((v) => v.greaterThan(0), { message: "O valor da multa tem de ser maior que zero." }),
  diaDoVencimento: zDia.optional(),
  infratorDocumento: z.string().trim().min(1, "Informe o CPF do infrator."),
  criadoPor: z.string().min(1),
});
export type RegistrarMultaInput = z.input<typeof zRegistrarMulta>;

const zBaixarMulta = z.object({
  multaId: z.string().min(1),
  tipo: z.enum(TIPOS_DE_BAIXA_DA_MULTA),
  dia: zDia,
  observacao: z.string().trim().min(5, "Diga o que encerrou a multa (guia paga, decisão do recurso, motivo do registro indevido)."),
  criadoPor: z.string().min(1),
});
export type BaixarMultaInput = z.input<typeof zBaixarMulta>;

const br = (dia: string): string => dia.split("-").reverse().join("/");
const reais = (v: Money): string => `R$ ${formatarMoeda(v.toFixed(2)).texto}`;
const ONDE_DECLARAR = "Declare-as em Contabilidade > Roteiros de precatórios, convênios e adiantamentos (movimentos de multas de trânsito).";

export async function registrarMultaDeTransito(prisma: PrismaClient, input: RegistrarMultaInput): Promise<{ readonly multaId: string; readonly lancamentoId: string }> {
  const d = zRegistrarMulta.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarMultaDeTransito, "ENTE");
    await travar(tx, "BemDaFrota", [d.veiculoId]);
    const v = await tx.veiculoDaFrota.findUnique({ where: { id: d.veiculoId }, select: { placa: true } });
    if (v === null) throw new Error("Veículo não encontrado. Nada foi gravado.");

    if (d.diaDaNotificacao < d.diaDaInfracao) throw new Error(`A notificação (${br(d.diaDaNotificacao)}) não pode ser anterior à infração (${br(d.diaDaInfracao)}). Nada foi gravado.`);
    if (d.diaDaInfracao > diaCivil(new Date())) throw new Error(`A data da infração (${br(d.diaDaInfracao)}) está no futuro. Nada foi gravado.`);
    // A notificação é a data do lançamento: no futuro, ele cairia num período que ainda não existe e a multa não teria
    // baixa possível (a baixa não antecede a notificação nem está no futuro).
    if (d.diaDaNotificacao > diaCivil(new Date())) throw new Error(`A data da notificação (${br(d.diaDaNotificacao)}) está no futuro. Nada foi gravado.`);
    if (d.diaDoVencimento !== undefined && d.diaDoVencimento < d.diaDaNotificacao) throw new Error(`O vencimento (${br(d.diaDoVencimento)}) não pode ser anterior à notificação (${br(d.diaDaNotificacao)}). Nada foi gravado.`);

    // O veículo estava na frota no dia da infração (e não baixado): multa de veículo fora da frota não é do ente.
    const mudancas = await tx.mudancaDeSituacaoDaFrota.findMany({ where: { veiculoId: d.veiculoId, anulacao: null }, orderBy: { desde: "asc" }, select: { desde: true, situacao: true } });
    const situacao = situacaoNoDia(mudancas.map((m) => ({ dia: diaCivil(m.desde), situacao: m.situacao })), d.diaDaInfracao);
    if (situacao === null) throw new Error(`O veículo ${v.placa} não estava na frota em ${br(d.diaDaInfracao)}. Nada foi gravado.`);
    if (situacao === "BAIXADA") throw new Error(`O veículo ${v.placa} estava baixado em ${br(d.diaDaInfracao)}. Nada foi gravado.`);

    const doc = normalizarDocumento(d.infratorDocumento);
    const p = await tx.pessoa.findUnique({ where: { documento: doc }, select: { id: true, tipo: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } });
    const infrator = p === null ? null : { id: p.id, tipo: p.tipo, nome: p.versoes[0]?.nome ?? doc };
    if (infrator === null) throw new Error(`O infrator ${d.infratorDocumento} não está no cadastro de pessoas. Cadastre-o em Cadastros › Pessoas e tente de novo. Nada foi gravado.`);
    if (infrator.tipo !== "FISICA") throw new Error(`O infrator tem de ser pessoa física (o condutor); ${infrator.nome} é pessoa jurídica. Nada foi gravado.`);

    const repetida = await tx.multaDeTransito.findUnique({ where: { orgaoAutuador_numeroDoAuto: { orgaoAutuador: d.orgaoAutuador, numeroDoAuto: d.numeroDoAuto } }, select: { veiculo: { select: { placa: true } } } });
    if (repetida !== null) throw new Error(`O auto ${d.numeroDoAuto} de ${d.orgaoAutuador} já está registrado (veículo ${repetida.veiculo.placa}). Nada foi gravado.`);

    const roteiro = await roteiroPatrimonialVigente(tx, "MULTA_DE_TRANSITO", "REGISTRO");
    if (roteiro === null) {
      throw new Error(`Não há roteiro para o registro da multa de trânsito: as contas de controle vêm da contabilidade do ente. ${ONDE_DECLARAR} Nada foi gravado.`);
    }

    const multaId = randomUUID();
    const lancamentoId = randomUUID();
    await lancarNoRazao(tx, {
      id: lancamentoId,
      numeroControle: `MULTA-${d.orgaoAutuador}-${d.numeroDoAuto}`,
      dataTransacao: inicioDoDiaCivil(d.diaDaNotificacao),
      historico: `${roteiro.historicoPadrao} — auto ${d.numeroDoAuto} (${d.orgaoAutuador}), veículo ${v.placa}, infrator ${infrator.nome}`,
      origemTipo: "MULTA_DE_TRANSITO_REGISTRO",
      origemId: multaId,
      criadoPor: d.criadoPor,
      partidas: [
        { contaId: roteiro.contaDebito.id, tipo: "DEBITO", subsistema: "CONTROLE", valor: d.valor.toFixed(2) },
        { contaId: roteiro.contaCredito.id, tipo: "CREDITO", subsistema: "CONTROLE", valor: d.valor.toFixed(2) },
      ],
    });
    // O índice único (órgão, auto) é a garantia contra o mesmo auto em DOIS veículos ao mesmo tempo (a trava é por veículo).
    await tx.multaDeTransito.create({
      data: {
        id: multaId,
        veiculoId: d.veiculoId,
        orgaoAutuador: d.orgaoAutuador,
        numeroDoAuto: d.numeroDoAuto,
        dataDaInfracao: meioDiaCivil(d.diaDaInfracao),
        dataDaNotificacao: meioDiaCivil(d.diaDaNotificacao),
        local: d.local,
        infracao: d.infracao,
        valor: d.valor.toFixed(2),
        vencimento: d.diaDoVencimento !== undefined ? meioDiaCivil(d.diaDoVencimento) : null,
        infratorId: infrator.id,
        lancamentoId,
        criadoPor: d.criadoPor,
      },
    }).catch((e: unknown) => {
      if ((e as { code?: string }).code === "P2002") throw new Error(`O auto ${d.numeroDoAuto} de ${d.orgaoAutuador} foi registrado ao mesmo tempo em outra operação. Nada foi gravado.`);
      throw e;
    });
    return { multaId, lancamentoId };
  });
}

export async function baixarMultaDeTransito(prisma: PrismaClient, input: BaixarMultaInput): Promise<{ readonly baixaId: string; readonly lancamentoId: string }> {
  const d = zBaixarMulta.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.baixarMultaDeTransito, "ENTE");
    const m0 = await tx.multaDeTransito.findUnique({ where: { id: d.multaId }, select: { veiculoId: true } });
    if (m0 === null) throw new Error("Multa não encontrada. Nada foi gravado.");
    await travar(tx, "BemDaFrota", [m0.veiculoId]);
    const m = await tx.multaDeTransito.findUniqueOrThrow({
      where: { id: d.multaId },
      select: { numeroDoAuto: true, orgaoAutuador: true, valor: true, dataDaNotificacao: true, lancamentoId: true, baixa: { select: { tipo: true } }, veiculo: { select: { placa: true } } },
    });
    if (m.baixa !== null) throw new Error(`A multa do auto ${m.numeroDoAuto} já foi baixada (${ROTULO_DA_BAIXA[m.baixa.tipo as TipoDeBaixaDaMulta] ?? m.baixa.tipo}). Nada foi gravado.`);
    if (d.dia < diaCivil(m.dataDaNotificacao)) throw new Error(`A baixa (${br(d.dia)}) não pode ser anterior à notificação da multa (${br(diaCivil(m.dataDaNotificacao))}). Nada foi gravado.`);
    if (d.dia > diaCivil(new Date())) throw new Error(`A data da baixa (${br(d.dia)}) está no futuro. Nada foi gravado.`);

    // As contas que o REGISTRO desta multa usou (podem não ser as do roteiro vigente hoje: o roteiro é versionado).
    const doRegistro = await tx.partidaContabil.findMany({ where: { lancamentoId: m.lancamentoId }, select: { tipo: true, contaId: true, conta: { select: { codigo: true } } } });
    const debitoDoRegistro = doRegistro.find((x) => x.tipo === "DEBITO");
    const creditoDoRegistro = doRegistro.find((x) => x.tipo === "CREDITO");
    if (debitoDoRegistro === undefined || creditoDoRegistro === undefined) throw new Error(`O lançamento do registro da multa do auto ${m.numeroDoAuto} não foi encontrado. Nada foi gravado.`);

    const valor = toMoney(m.valor.toFixed(2));
    const baixaId = randomUUID();
    const lancamentoId = randomUUID();
    const numeroControle = `MULTA-BX-${m.orgaoAutuador}-${m.numeroDoAuto}`;
    const quem = `auto ${m.numeroDoAuto} (${m.orgaoAutuador}), veículo ${m.veiculo.placa}`;
    if (d.tipo === "REGISTRO_INDEVIDO") {
      // O registro estava errado: a baixa é o ESTORNO do lançamento dele (as mesmas contas, invertidas), apontando para ele.
      await lancarNoRazao(tx, {
        id: lancamentoId,
        numeroControle,
        dataTransacao: inicioDoDiaCivil(d.dia),
        historico: `Estorno do registro indevido da multa de trânsito — ${quem}`,
        origemTipo: "MULTA_DE_TRANSITO_BAIXA",
        origemId: baixaId,
        estornoDeId: m.lancamentoId,
        criadoPor: d.criadoPor,
        partidas: [
          { contaId: creditoDoRegistro.contaId, tipo: "DEBITO", subsistema: "CONTROLE", valor: valor.toFixed(2) },
          { contaId: debitoDoRegistro.contaId, tipo: "CREDITO", subsistema: "CONTROLE", valor: valor.toFixed(2) },
        ],
      });
    } else {
      const roteiro = await roteiroPatrimonialVigente(tx, "MULTA_DE_TRANSITO", "BAIXA");
      if (roteiro === null) {
        throw new Error(`Não há roteiro para a baixa da multa de trânsito: as contas de controle vêm da contabilidade do ente. ${ONDE_DECLARAR} Nada foi gravado.`);
      }
      // A baixa fecha o controle DESTA multa só se debitar a conta que o registro dela creditou.
      if (roteiro.contaDebito.id !== creditoDoRegistro.contaId) {
        const debitada = await tx.contaPcasp.findUnique({ where: { id: roteiro.contaDebito.id }, select: { codigo: true } });
        throw new Error(
          `O roteiro da baixa debita a conta ${debitada?.codigo ?? "?"}, mas a multa do auto ${m.numeroDoAuto} foi registrada creditando a ${creditoDoRegistro.conta.codigo}: ` +
            `a baixa não fecharia o controle dela. Ajuste o roteiro da baixa das multas. ${ONDE_DECLARAR.replace("Declare-as", "O roteiro fica")} Nada foi gravado.`
        );
      }
      await lancarNoRazao(tx, {
        id: lancamentoId,
        numeroControle,
        dataTransacao: inicioDoDiaCivil(d.dia),
        historico: `${roteiro.historicoPadrao} — ${quem}: ${ROTULO_DA_BAIXA[d.tipo].toLowerCase()}`,
        origemTipo: "MULTA_DE_TRANSITO_BAIXA",
        origemId: baixaId,
        criadoPor: d.criadoPor,
        partidas: [
          { contaId: roteiro.contaDebito.id, tipo: "DEBITO", subsistema: "CONTROLE", valor: valor.toFixed(2) },
          { contaId: roteiro.contaCredito.id, tipo: "CREDITO", subsistema: "CONTROLE", valor: valor.toFixed(2) },
        ],
      });
    }
    await tx.baixaDaMultaDeTransito.create({ data: { id: baixaId, multaId: d.multaId, tipo: d.tipo, data: meioDiaCivil(d.dia), observacao: d.observacao, lancamentoId, criadoPor: d.criadoPor } });
    return { baixaId, lancamentoId };
  });
}

export interface MultaNaLista {
  readonly id: string;
  readonly placa: string;
  readonly orgaoAutuador: string;
  readonly numeroDoAuto: string;
  readonly diaDaInfracao: string;
  readonly diaDaNotificacao: string;
  readonly diaDoVencimento: string | null;
  readonly local: string;
  readonly infracao: string;
  readonly valor: Money;
  readonly infrator: { readonly nome: string; readonly documento: string };
  readonly baixa: { readonly tipo: TipoDeBaixaDaMulta; readonly dia: string; readonly observacao: string } | null;
}

export interface QuadroDasMultas {
  readonly multas: readonly MultaNaLista[];
  readonly emAberto: { readonly quantidade: number; readonly valor: Money };
  /** Em aberto por infrator, do maior valor para o menor. */
  readonly porInfrator: readonly { readonly nome: string; readonly documento: string; readonly quantidade: number; readonly valor: Money }[];
}

/** As multas (todas ou de um veículo, ou só as em aberto), com o total em aberto e o total por infrator. Leitura pura. */
export async function listarMultasDeTransito(
  prisma: PrismaClient,
  filtro: { readonly veiculoId?: string | undefined; readonly soEmAberto?: boolean | undefined } = {}
): Promise<QuadroDasMultas> {
  const ms = await prisma.multaDeTransito.findMany({
    where: { ...(filtro.veiculoId !== undefined ? { veiculoId: filtro.veiculoId } : {}), ...(filtro.soEmAberto === true ? { baixa: null } : {}) },
    orderBy: [{ dataDaInfracao: "desc" }, { numeroDoAuto: "asc" }],
    select: {
      id: true, orgaoAutuador: true, numeroDoAuto: true, dataDaInfracao: true, dataDaNotificacao: true, vencimento: true, local: true, infracao: true, valor: true,
      veiculo: { select: { placa: true } },
      infrator: { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } },
      baixa: { select: { tipo: true, data: true, observacao: true } },
    },
  });
  const multas = ms.map((m): MultaNaLista => ({
    id: m.id,
    placa: m.veiculo.placa,
    orgaoAutuador: m.orgaoAutuador,
    numeroDoAuto: m.numeroDoAuto,
    diaDaInfracao: diaCivil(m.dataDaInfracao),
    diaDaNotificacao: diaCivil(m.dataDaNotificacao),
    diaDoVencimento: m.vencimento === null ? null : diaCivil(m.vencimento),
    local: m.local,
    infracao: m.infracao,
    valor: toMoney(m.valor.toFixed(2)),
    infrator: { nome: m.infrator.versoes[0]?.nome ?? m.infrator.documento, documento: m.infrator.documento },
    baixa: m.baixa === null ? null : { tipo: m.baixa.tipo as TipoDeBaixaDaMulta, dia: diaCivil(m.baixa.data), observacao: m.baixa.observacao },
  }));
  const abertas = multas.filter((m) => m.baixa === null);
  const porDoc = new Map<string, { nome: string; documento: string; quantidade: number; valor: Money }>();
  for (const m of abertas) {
    const atual = porDoc.get(m.infrator.documento) ?? { nome: m.infrator.nome, documento: m.infrator.documento, quantidade: 0, valor: toMoney("0") };
    porDoc.set(m.infrator.documento, { ...atual, quantidade: atual.quantidade + 1, valor: toMoney(atual.valor.plus(m.valor)) });
  }
  return {
    multas,
    emAberto: { quantidade: abertas.length, valor: abertas.reduce((t, m) => toMoney(t.plus(m.valor)), toMoney("0")) },
    porInfrator: [...porDoc.values()].sort((a, b) => b.valor.comparedTo(a.valor) || a.nome.localeCompare(b.nome)),
  };
}

