import { z } from "zod";
import { diaCivil, diaCivilBr, inicioDoDiaCivil } from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { designacaoVigenteEm } from "../m33-folha/certificacao.js";
import { contratoTravado, exigirContratoVigente, exigirDesignacao } from "./fiscalizacao.js";

/**
 * ═══ M11 — A AGENDA DA FISCALIZAÇÃO (V7 M2 U8) ═══
 *
 * ⚠️ NENHUMA AGENDA NOVA. O compromisso é a `OrdemDeFiscalizacao` de sempre (o gestor programa para um fiscal
 * designado); U8 acrescenta HORÁRIO, duração e local, e os fatos que mudam a sua vida — REAGENDAR (motivado),
 * CANCELAR e REALIZAR. O compromisso vigente é o ÚLTIMO reagendamento; nada é reescrito, e a situação é DERIVADA:
 *
 *   PROGRAMADA → REAGENDADA (há reagendamento) → CANCELADA (fato) | REALIZADA (fato) — cancelada e realizada são finais.
 *
 * ⚠️ DATA E HORA NO CALENDÁRIO DO ENTE. O dia é dia civil (`packages/datas`), a hora é "HH:MM" do relógio do ente,
 * guardada como texto: não existe instante UTC de um compromisso que ainda vai acontecer.
 *
 * ⚠️ SOBREPOSIÇÃO NÃO É PROIBIDA AQUI. Nenhuma norma dá ao sistema a regra de "um fiscal, um compromisso por vez" (o
 * mesmo fiscal pode acompanhar duas frentes no mesmo período, e o prazo de cada contrato é do contrato). A agenda
 * APONTA o conflito — mesmo fiscal, mesmo dia, horários que se cruzam — e quem programa decide. Pendência nomeada:
 * `CONFLITO-DE-AGENDA-SEM-REGRA`.
 */


type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

const zDia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A data é um DIA civil AAAA-MM-DD.");
const zHora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "A hora é HH:MM no relógio do ente.");
const hoje = (): string => diaCivil(new Date());


// ═══════════════════════════════════════════════════════════════════════════════
// A VIDA DO COMPROMISSO — reagendar, cancelar, realizar
// ═══════════════════════════════════════════════════════════════════════════════

async function compromissoTravado(tx: Tx, ordemId: string) {
  const o = await tx.ordemDeFiscalizacao.findUnique({
    where: { id: ordemId },
    select: {
      id: true, numero: true, contratoId: true, dataPrevista: true, objetivo: true,
      fiscalDesignacaoId: true, fiscalDesignacao: { select: { vigenciaInicio: true, vigenciaFim: true, revogacao: { select: { dataEfeito: true } }, usuario: { select: { identificador: true } } } },
      cancelamento: { select: { criadoEm: true } }, realizacao: { select: { data: true } },
      reagendamentos: { orderBy: { criadoEm: "desc" }, take: 1, select: { dataPrevista: true } },
    },
  });
  if (o === null) throw new Error(`Fiscalização programada ${ordemId} não existe. Nada foi gravado.`);
  return o;
}

export const zReagendarFiscalizacao = z
  .object({
    ordemId: z.string().min(1),
    dataPrevista: zDia,
    horaInicio: zHora.optional(),
    duracaoMinutos: z.number().int().min(1).max(1440).optional(),
    local: z.string().trim().min(1).optional(),
    motivo: z.string().trim().min(5, "Diga por que o compromisso mudou."),
    criadoPor: z.string().min(1),
  })
  .strict();
export type ReagendarFiscalizacaoInput = z.input<typeof zReagendarFiscalizacao>;

export async function reagendarFiscalizacao(prisma: PrismaClient, input: ReagendarFiscalizacaoInput): Promise<{ readonly reagendamentoId: string; readonly numero: number; readonly data: string }> {
  const d = zReagendarFiscalizacao.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.reagendarFiscalizacao, "ENTE");
    const alvo = await compromissoTravado(tx, d.ordemId);
    const c = await contratoTravado(tx, alvo.contratoId);
    const gestor = await exigirDesignacao(tx, c, d.criadoPor, "GESTOR", hoje());
    if (alvo.cancelamento !== null) throw new Error(`FISCALIZACAO-CANCELADA: a fiscalização nº ${alvo.numero} foi cancelada; programe outra. Nada foi gravado.`);
    if (alvo.realizacao !== null) throw new Error(`FISCALIZACAO-JA-REALIZADA: a fiscalização nº ${alvo.numero} foi realizada em ${diaCivilBr(alvo.realizacao.data)} e não se reagenda. Nada foi gravado.`);
    exigirContratoVigente(c, d.dataPrevista, "a fiscalização reagendada");
    if (!designacaoVigenteEm(alvo.fiscalDesignacao, inicioDoDiaCivil(d.dataPrevista))) {
      throw new Error("FISCAL-SEM-VIGENCIA-NA-DATA: a designação do fiscal deste compromisso não estará vigente na nova data. Programe outra fiscalização para o fiscal designado. Nada foi gravado.");
    }
    const r = await tx.reagendamentoDeFiscalizacao.create({
      data: { ordemId: d.ordemId, dataPrevista: inicioDoDiaCivil(d.dataPrevista), horaInicio: d.horaInicio ?? null, duracaoMinutos: d.duracaoMinutos ?? null, local: d.local ?? null, motivo: d.motivo, designacaoId: gestor.id, criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { reagendamentoId: r.id, numero: alvo.numero, data: d.dataPrevista };
  });
}

export const zCancelarFiscalizacao = z.object({ ordemId: z.string().min(1), motivo: z.string().trim().min(5), criadoPor: z.string().min(1) }).strict();
export type CancelarFiscalizacaoInput = z.input<typeof zCancelarFiscalizacao>;

export async function cancelarFiscalizacao(prisma: PrismaClient, input: CancelarFiscalizacaoInput): Promise<{ readonly cancelamentoId: string; readonly numero: number }> {
  const d = zCancelarFiscalizacao.parse(input);
  try {
    return await prisma.$transaction(async (tx) => {
      await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cancelarFiscalizacao, "ENTE");
      const alvo = await compromissoTravado(tx, d.ordemId);
      const c = await contratoTravado(tx, alvo.contratoId);
      const gestor = await exigirDesignacao(tx, c, d.criadoPor, "GESTOR", hoje());
      if (alvo.cancelamento !== null) throw new Error(`FISCALIZACAO-JA-CANCELADA: a fiscalização nº ${alvo.numero} já estava cancelada. Nada foi gravado.`);
      if (alvo.realizacao !== null) throw new Error(`FISCALIZACAO-JA-REALIZADA: a fiscalização nº ${alvo.numero} foi realizada em ${diaCivilBr(alvo.realizacao.data)}; o que aconteceu não se cancela. Nada foi gravado.`);
      const r = await tx.cancelamentoDeFiscalizacao.create({ data: { ordemId: d.ordemId, motivo: d.motivo, designacaoId: gestor.id, criadoPor: d.criadoPor }, select: { id: true } });
      return { cancelamentoId: r.id, numero: alvo.numero };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new Error("FISCALIZACAO-JA-CANCELADA: outro cancelamento foi gravado no mesmo instante. Nada foi gravado.");
    throw e;
  }
}

export const zRegistrarRealizacaoDaFiscalizacao = z
  .object({
    ordemId: z.string().min(1),
    data: zDia,
    horaInicio: zHora.optional(),
    horaFim: zHora.optional(),
    relato: z.string().trim().min(10, "Diga o que foi verificado na visita."),
    criadoPor: z.string().min(1),
  })
  .strict();
export type RegistrarRealizacaoDaFiscalizacaoInput = z.input<typeof zRegistrarRealizacaoDaFiscalizacao>;

/** REALIZAR — o fiscal DESTE compromisso, com a designação vigente no dia do fato e hoje; data não futura. */
export async function registrarRealizacaoDaFiscalizacao(prisma: PrismaClient, input: RegistrarRealizacaoDaFiscalizacaoInput): Promise<{ readonly realizacaoId: string; readonly numero: number }> {
  const d = zRegistrarRealizacaoDaFiscalizacao.parse(input);
  if (d.data > hoje()) throw new Error("REALIZACAO-NO-FUTURO: a realização registra o que já aconteceu. Nada foi gravado.");
  if (d.horaInicio !== undefined && d.horaFim !== undefined && d.horaFim < d.horaInicio) throw new Error("HORARIO-INVERTIDO: o fim é anterior ao início. Nada foi gravado.");
  try {
    return await prisma.$transaction(async (tx) => {
      await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarRealizacaoDaFiscalizacao, "ENTE");
      const alvo = await compromissoTravado(tx, d.ordemId);
      const c = await contratoTravado(tx, alvo.contratoId);
      const fiscal = await exigirDesignacao(tx, c, d.criadoPor, "FISCAL", d.data);
      if (alvo.fiscalDesignacao.usuario.identificador !== d.criadoPor) throw new Error(`FISCALIZACAO-DE-OUTRO-FISCAL: a fiscalização nº ${alvo.numero} foi programada para outro fiscal. Nada foi gravado.`);
      if (alvo.cancelamento !== null) throw new Error(`FISCALIZACAO-CANCELADA: a fiscalização nº ${alvo.numero} foi cancelada; não se registra realização dela. Nada foi gravado.`);
      if (alvo.realizacao !== null) throw new Error(`FISCALIZACAO-JA-REALIZADA: a fiscalização nº ${alvo.numero} já tem realização registrada. Nada foi gravado.`);
      exigirContratoVigente(c, d.data, "a fiscalização realizada");
      const r = await tx.realizacaoDeFiscalizacao.create({
        data: { ordemId: d.ordemId, data: inicioDoDiaCivil(d.data), horaInicio: d.horaInicio ?? null, horaFim: d.horaFim ?? null, relato: d.relato, designacaoId: fiscal.id, criadoPor: d.criadoPor },
        select: { id: true },
      });
      return { realizacaoId: r.id, numero: alvo.numero };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new Error("FISCALIZACAO-JA-REALIZADA: outra realização foi gravada no mesmo instante. Nada foi gravado.");
    throw e;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// A AGENDA — a mesma leitura serve ao dia, à semana e ao mês
// ═══════════════════════════════════════════════════════════════════════════════

export type SituacaoDoCompromisso = "PROGRAMADA" | "REAGENDADA" | "CANCELADA" | "REALIZADA";

export interface CompromissoNaAgenda {
  readonly id: string;
  readonly numero: number;
  readonly contratoId: string;
  readonly contrato: string;
  readonly objetivo: string;
  readonly data: string;
  readonly horaInicio: string | null;
  readonly duracaoMinutos: number | null;
  readonly horaFim: string | null;
  readonly local: string | null;
  readonly fiscal: string;
  readonly fiscalUsuario: string;
  readonly gestor: string;
  readonly situacao: SituacaoDoCompromisso;
  readonly historico: readonly { readonly data: string; readonly motivo: string; readonly por: string }[];
  readonly cancelamento: { readonly motivo: string; readonly por: string } | null;
  readonly realizacao: { readonly data: string; readonly horaInicio: string | null; readonly horaFim: string | null; readonly relato: string; readonly por: string } | null;
  readonly ocorrencias: readonly { readonly id: string; readonly numero: number; readonly tipo: string }[];
  /** Outro compromisso VIVO do mesmo fiscal, no mesmo dia, com horário que se cruza. Aponta; não proíbe. */
  readonly conflitos: readonly number[];
}

const PESSOA = { select: { atoDesignacao: true, usuario: { select: { identificador: true } }, pessoa: { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" as const }, take: 1, select: { nome: true } } } } } };
const nome = (d: { readonly atoDesignacao: string; readonly pessoa: { readonly documento: string; readonly versoes: readonly { readonly nome: string }[] } }): string => `${d.pessoa.versoes[0]?.nome ?? d.pessoa.documento} (${d.atoDesignacao})`;

const minutos = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const paraHora = (m: number): string => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * Os compromissos que caem no período (pela data VIGENTE: o último reagendamento, ou a programada), com a situação
 * derivada, o histórico e os conflitos de horário do mesmo fiscal. O recorte por contrato é de quem chama (a porta
 * entrega só os contratos que a pessoa alcança).
 */
export async function agendaDaFiscalizacao(
  prisma: Tx,
  filtro: { readonly de: string; readonly ate: string; readonly contratoIds?: readonly string[]; readonly fiscalUsuario?: string; readonly situacoes?: readonly SituacaoDoCompromisso[] }
): Promise<readonly CompromissoNaAgenda[]> {
  const ordens = await prisma.ordemDeFiscalizacao.findMany({
    where: {
      ...(filtro.contratoIds === undefined ? {} : { contratoId: { in: [...filtro.contratoIds] } }),
      ...(filtro.fiscalUsuario === undefined ? {} : { fiscalDesignacao: { usuario: { identificador: filtro.fiscalUsuario } } }),
    },
    orderBy: [{ dataPrevista: "asc" }, { numero: "asc" }],
    select: {
      id: true, numero: true, contratoId: true, objetivo: true, dataPrevista: true, horaInicio: true, duracaoMinutos: true, local: true,
      contrato: { select: { numeroContrato: true } },
      fiscalDesignacao: PESSOA, gestorDesignacao: PESSOA,
      reagendamentos: { orderBy: { criadoEm: "asc" }, select: { dataPrevista: true, horaInicio: true, duracaoMinutos: true, local: true, motivo: true, criadoEm: true, designacao: PESSOA } },
      cancelamento: { select: { motivo: true, designacao: PESSOA } },
      realizacao: { select: { data: true, horaInicio: true, horaFim: true, relato: true, designacao: PESSOA } },
      ocorrencias: { orderBy: { numero: "asc" }, select: { id: true, numero: true, tipo: true, versaoDoTipo: { select: { tipo: { select: { nome: true } } } } } },
    },
  });
  const projetados = ordens.map((o) => {
    const ultimo = o.reagendamentos[o.reagendamentos.length - 1];
    const data = diaCivil(ultimo?.dataPrevista ?? o.dataPrevista);
    const horaInicio = ultimo === undefined ? o.horaInicio : ultimo.horaInicio;
    const duracaoMinutos = ultimo === undefined ? o.duracaoMinutos : ultimo.duracaoMinutos;
    const situacao: SituacaoDoCompromisso = o.cancelamento !== null ? "CANCELADA" : o.realizacao !== null ? "REALIZADA" : o.reagendamentos.length > 0 ? "REAGENDADA" : "PROGRAMADA";
    return {
      id: o.id, numero: o.numero, contratoId: o.contratoId, contrato: o.contrato.numeroContrato, objetivo: o.objetivo,
      data, horaInicio, duracaoMinutos,
      horaFim: horaInicio === null || duracaoMinutos === null ? null : paraHora(minutos(horaInicio) + duracaoMinutos),
      local: ultimo === undefined ? o.local : ultimo.local,
      fiscal: nome(o.fiscalDesignacao), fiscalUsuario: o.fiscalDesignacao.usuario.identificador, gestor: nome(o.gestorDesignacao),
      situacao,
      historico: o.reagendamentos.map((r) => ({ data: diaCivil(r.dataPrevista), motivo: r.motivo, por: nome(r.designacao) })),
      cancelamento: o.cancelamento === null ? null : { motivo: o.cancelamento.motivo, por: nome(o.cancelamento.designacao) },
      realizacao: o.realizacao === null ? null : { data: diaCivil(o.realizacao.data), horaInicio: o.realizacao.horaInicio, horaFim: o.realizacao.horaFim, relato: o.realizacao.relato, por: nome(o.realizacao.designacao) },
      ocorrencias: o.ocorrencias.map((x) => ({ id: x.id, numero: x.numero, tipo: x.versaoDoTipo?.tipo.nome ?? x.tipo })),
    };
  });
  const noPeriodo = projetados.filter((c) => c.data >= filtro.de && c.data <= filtro.ate && (filtro.situacoes === undefined || filtro.situacoes.includes(c.situacao)));
  const vivos = projetados.filter((c) => c.situacao !== "CANCELADA");
  return noPeriodo
    .map((c) => ({
      ...c,
      conflitos: c.situacao === "CANCELADA" || c.horaInicio === null
        ? []
        : vivos
            .filter((o) => o.id !== c.id && o.fiscalUsuario === c.fiscalUsuario && o.data === c.data && o.horaInicio !== null)
            .filter((o) => {
              const [ai, af] = [minutos(c.horaInicio!), minutos(c.horaInicio!) + (c.duracaoMinutos ?? 60)];
              const [bi, bf] = [minutos(o.horaInicio!), minutos(o.horaInicio!) + (o.duracaoMinutos ?? 60)];
              return ai < bf && bi < af;
            })
            .map((o) => o.numero),
    }))
    .sort((a, b) => (a.data === b.data ? (a.horaInicio ?? "99:99").localeCompare(b.horaInicio ?? "99:99") || a.numero - b.numero : a.data.localeCompare(b.data)));
}
