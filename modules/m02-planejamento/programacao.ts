import { z } from "zod";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
// M02 → M04 (a seta que NÃO fecha ciclo: m04/consultas.ts não importa m02). O confronto do
// art. 9º é meta (M02) × arrecadado (M04) — e o arrecadado vem do dono, nunca recopiado.
import { arrecadadoPorFonte } from "../m04-receita/consultas.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { previsaoPorFonte } from "./consultas.js";
import {
  bimestreDoMes,
  gerarTextoDecreto,
  proporCotasDaLoa,
  proporMetasDaLoa,
  TEMPLATE_CMD_DEFAULT,
  TEMPLATE_MBA_DEFAULT,
} from "./programacao-dominio.js";

/**
 * M02 — SERVIÇOS da programação financeira (CMD/MBA). TR 4.18/4.19/4.43/4.44.
 *
 * A aritmética PURA vive em `programacao-dominio.ts` (a distribuição que fecha ao centavo, o
 * gerador de texto). Aqui é a orquestração: ler a LOA, gravar a versão, o evento, a liberação.
 * O guard do 4.43 mora no M05 (`guard-cmd.ts`) — é ele que guarda o empenho.
 */

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

const zValorNaoNegativo = z
  .union([z.string(), z.number(), z.instanceof(Object)])
  .transform((v) => toMoney(v as never))
  .refine((v) => v.greaterThanOrEqualTo(0), { message: "Valor deve ser >= 0" });

const zValorPositivo = z
  .union([z.string(), z.number(), z.instanceof(Object)])
  .transform((v) => toMoney(v as never))
  .refine((v) => v.greaterThan(0), { message: "Valor deve ser > 0" });

const zMotivo = z.string().trim().min(10, "O motivo precisa de ao menos 10 caracteres");

// ═══════════════════════════════════════════════════════════════════════════
// proporCmdDaLoa / proporMbaDaLoa — a versão 1, distribuída da LOA (TR 4.18)
// ═══════════════════════════════════════════════════════════════════════════

const zPropor = z.object({
  exercicio: z.number().int().min(1900).max(2999),
  atoRef: z.string().trim().min(1),
  vigenteDesde: z.coerce.date(),
  criadoPor: z.string().min(1),
});
export type ProporInput = z.input<typeof zPropor>;

/**
 * PROPÕE o CMD versão 1, distribuindo a previsão da LOA em 12 cotas por fonte (TR 4.18 "com
 * base nos valores da LOA"). A distribuição FECHA ao centavo — ver `distribuirEmParcelas`.
 *
 * ⚠️ SEM UG: a programação financeira é do ENTE (o caixa é um só). Só permissão GLOBAL.
 */
export async function proporCmdDaLoa(
  prisma: PrismaClient,
  input: ProporInput
): Promise<{ readonly versaoId: string; readonly cotas: number }> {
  const d = zPropor.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.proporCmdDaLoa, "ENTE");

    const previsao = await previsaoPorFonte(tx, { exercicio: d.exercicio });
    const distribuicao = proporCotasDaLoa(previsao);
    return gravarVersaoCmd(tx, d, 1, distribuicao);
  });
}

export async function proporMbaDaLoa(
  prisma: PrismaClient,
  input: ProporInput
): Promise<{ readonly versaoId: string; readonly metas: number }> {
  const d = zPropor.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.proporMbaDaLoa, "ENTE");

    const previsao = await previsaoPorFonte(tx, { exercicio: d.exercicio });
    const distribuicao = proporMetasDaLoa(previsao);
    return gravarVersaoMba(tx, d, 1, distribuicao);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// registrarVersaoCmd / registrarVersaoMba — a retificação (versão N)
// ═══════════════════════════════════════════════════════════════════════════

const zCotaManual = z.object({
  fonteId: z.string().min(1),
  mes: z.number().int().min(1).max(12),
  valor: zValorNaoNegativo,
});
const zRegistrarCmd = z.object({
  exercicio: z.number().int().min(1900).max(2999),
  atoRef: z.string().trim().min(1),
  vigenteDesde: z.coerce.date(),
  cotas: z.array(zCotaManual).min(1, "Uma versão de CMD precisa de ao menos uma cota"),
  criadoPor: z.string().min(1),
});
export type RegistrarVersaoCmdInput = z.input<typeof zRegistrarCmd>;

/**
 * REGISTRA uma versão NOVA do CMD (a retificação). Append-only: a anterior FICA, e a vigente
 * passa a ser esta na sua `vigenteDesde`. É o padrão do `LimiteContratacao` — decreto novo,
 * linha nova, nunca UPDATE.
 */
export async function registrarVersaoCmd(
  prisma: PrismaClient,
  input: RegistrarVersaoCmdInput
): Promise<{ readonly versaoId: string; readonly cotas: number }> {
  const d = zRegistrarCmd.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarVersaoCmd, "ENTE");

    const proximo = await proximoNumeroCmd(tx, d.exercicio);
    const dist = new Map<string, Money[]>();
    for (const c of d.cotas) {
      const arr = dist.get(c.fonteId) ?? new Array(12).fill(toMoney("0.00"));
      arr[c.mes - 1] = c.valor;
      dist.set(c.fonteId, arr);
    }
    return gravarVersaoCmd(tx, d, proximo, dist);
  });
}

const zMetaManual = z.object({
  fonteId: z.string().min(1),
  bimestre: z.number().int().min(1).max(6),
  valor: zValorNaoNegativo,
});
const zRegistrarMba = z.object({
  exercicio: z.number().int().min(1900).max(2999),
  atoRef: z.string().trim().min(1),
  vigenteDesde: z.coerce.date(),
  metas: z.array(zMetaManual).min(1),
  criadoPor: z.string().min(1),
});
export type RegistrarVersaoMbaInput = z.input<typeof zRegistrarMba>;

export async function registrarVersaoMba(
  prisma: PrismaClient,
  input: RegistrarVersaoMbaInput
): Promise<{ readonly versaoId: string; readonly metas: number }> {
  const d = zRegistrarMba.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarVersaoMba, "ENTE");

    const proximo = await proximoNumeroMba(tx, d.exercicio);
    const dist = new Map<string, Money[]>();
    for (const m of d.metas) {
      const arr = dist.get(m.fonteId) ?? new Array(6).fill(toMoney("0.00"));
      arr[m.bimestre - 1] = m.valor;
      dist.set(m.fonteId, arr);
    }
    return gravarVersaoMba(tx, d, proximo, dist);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// liberarProgramacao — a liberação de saldos (TR 4.44)
// ═══════════════════════════════════════════════════════════════════════════

const zLiberar = z.object({
  exercicio: z.number().int().min(1900).max(2999),
  fonteId: z.string().min(1),
  mes: z.number().int().min(1).max(12),
  valor: zValorPositivo, // ⚠️ SÓ POSITIVA — ver o schema. Retirar cota = versão nova.
  atoRef: z.string().trim().min(1),
  motivo: zMotivo,
  criadoPor: z.string().min(1),
});
export type LiberarProgramacaoInput = z.input<typeof zLiberar>;

/**
 * LIBERA saldo contingenciado (TR 4.44) — um EVENTO append-only que aumenta o teto do mês.
 * A liberação NEGATIVA não existe (o Zod recusa): retirar cota é uma versão nova do CMD.
 */
export async function liberarProgramacao(
  prisma: PrismaClient,
  input: LiberarProgramacaoInput
): Promise<{ readonly liberacaoId: string }> {
  const d = zLiberar.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.liberarProgramacao, "ENTE");

    const criada = await tx.liberacaoProgramacao.create({
      data: {
        exercicio: d.exercicio,
        fonteId: d.fonteId,
        mes: d.mes,
        valor: d.valor.toFixed(2),
        atoRef: d.atoRef,
        motivo: d.motivo,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { liberacaoId: criada.id };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// registrarEventoLimitacao — o interruptor do 4.43 (opt-in)
// ═══════════════════════════════════════════════════════════════════════════

const zEvento = z.object({
  exercicio: z.number().int().min(1900).max(2999),
  ativo: z.boolean(),
  atoRef: z.string().trim().min(1),
  motivo: zMotivo,
  criadoPor: z.string().min(1),
});
export type RegistrarEventoLimitacaoInput = z.input<typeof zEvento>;

/**
 * LIGA ou DESLIGA a limitação de empenho (TR 4.43) — um EVENTO, com data e autor. A vigente é a
 * última. Ligar é contingenciar; desligar é restabelecer o desembolso (art. 9º, § 1º da LRF).
 */
export async function registrarEventoLimitacao(
  prisma: PrismaClient,
  input: RegistrarEventoLimitacaoInput
): Promise<{ readonly eventoId: string; readonly ativo: boolean }> {
  const d = zEvento.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarEventoLimitacao, "ENTE");

    const criado = await tx.eventoLimitacaoEmpenho.create({
      data: {
        exercicio: d.exercicio,
        ativo: d.ativo,
        atoRef: d.atoRef,
        motivo: d.motivo,
        criadoPor: d.criadoPor,
      },
      select: { id: true, ativo: true },
    });
    return { eventoId: criado.id, ativo: criado.ativo };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// confrontoMba — o LEITOR do art. 9º (leitura pura)
// ═══════════════════════════════════════════════════════════════════════════

export interface LinhaConfrontoMba {
  readonly fonteId: string;
  readonly bimestre: number;
  /** Meta acumulada até o fim deste bimestre (Σ das metas dos bimestres 1..b). */
  readonly metaAcumulada: string;
  /** Arrecadado líquido acumulado até o fim deste bimestre. */
  readonly arrecadadoAcumulado: string;
  /** arrecadado − meta. NEGATIVO = frustração (o gatilho do art. 9º). */
  readonly diferenca: string;
}

/**
 * O CONFRONTO do art. 9º: meta × arrecadado, por fonte × bimestre, ACUMULADO.
 *
 * ⚠️ ACUMULADO de propósito: o art. 9º dispara "se ao final de um BIMESTRE a realização da
 * receita não comportar o cumprimento das metas" — e a meta é o desdobramento ATÉ ali, não a
 * fatia isolada. Por isso o corte é `arrecadadoPorFonte(ate = fim do bimestre)` (cumulativo) ×
 * Σ das metas até o bimestre.
 *
 * ⚠️ LEITURA PURA: zero escrita. O arrecadado vem do DONO (`arrecadadoPorFonte`, M04) — nunca
 * uma segunda soma. As metas vêm da versão vigente do MBA.
 */
export async function confrontoMba(
  leitor: Tx,
  p: { readonly exercicio: number; readonly ateBimestre: number }
): Promise<readonly LinhaConfrontoMba[]> {
  // A versão MBA vigente HOJE (a de maior vigenteDesde — para o confronto, a mais recente).
  const versao = await leitor.versaoMba.findFirst({
    where: { exercicio: p.exercicio },
    orderBy: { vigenteDesde: "desc" },
    select: { id: true },
  });
  if (versao === null) return [];

  const metas = await leitor.metaMba.findMany({
    where: { versaoId: versao.id, bimestre: { lte: p.ateBimestre } },
    select: { fonteId: true, bimestre: true, valor: true },
  });

  // Σ das metas por fonte, ACUMULANDO por bimestre.
  const fontes = [...new Set(metas.map((m) => m.fonteId))];
  const metaPorFonteBim = new Map<string, Money>(); // chave `${fonte}|${bim}`
  for (const m of metas) {
    metaPorFonteBim.set(`${m.fonteId}|${m.bimestre}`, toMoney(m.valor.toFixed(2)));
  }

  const linhas: LinhaConfrontoMba[] = [];
  for (const fonteId of fontes) {
    let metaAcum = toMoney("0.00");
    for (let b = 1; b <= p.ateBimestre; b++) {
      const meta = metaPorFonteBim.get(`${fonteId}|${b}`) ?? toMoney("0.00");
      metaAcum = toMoney(metaAcum.plus(meta));

      // o arrecadado acumulado até o FIM do bimestre b (mês 2·b, último dia).
      const fim = new Date(Date.UTC(p.exercicio, 2 * b, 1, 0, 0, 0, 0) - 1);
      const arrecadadoMap = await arrecadadoPorFonte(leitor, { ate: fim });
      const arrecadado = arrecadadoMap.get(fonteId) ?? toMoney("0.00");

      linhas.push({
        fonteId,
        bimestre: b,
        metaAcumulada: metaAcum.toFixed(2),
        arrecadadoAcumulado: arrecadado.toFixed(2),
        diferenca: toMoney(arrecadado.minus(metaAcum)).toFixed(2),
      });
    }
  }
  return linhas;
}

// ═══════════════════════════════════════════════════════════════════════════
// gerarDecretoCmd — carrega o template (ou o default) e compõe (TR 4.19/4.24)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GERA o texto do decreto do CMD. Carrega o `TemplateDecreto` do ente se houver; senão, o
 * default. Leitura pura — o texto é função dos dados. Ver `gerarTextoDecreto` (domínio).
 */
export async function gerarDecretoCmd(
  leitor: Tx,
  p: {
    readonly exercicio: number;
    readonly atoRef: string;
    readonly dataVigencia: Date;
    readonly corpo: string;
  }
): Promise<string> {
  const custom = await leitor.templateDecreto.findUnique({
    where: { tipo: "CMD" },
    select: { texto: true },
  });
  const template = custom?.texto ?? TEMPLATE_CMD_DEFAULT;
  return gerarTextoDecreto(template, {
    ato: p.atoRef,
    exercicio: String(p.exercicio),
    data: p.dataVigencia.toISOString().slice(0, 10),
    corpo: p.corpo,
  });
}

export async function gerarDecretoMba(
  leitor: Tx,
  p: {
    readonly exercicio: number;
    readonly atoRef: string;
    readonly dataVigencia: Date;
    readonly corpo: string;
  }
): Promise<string> {
  const custom = await leitor.templateDecreto.findUnique({
    where: { tipo: "MBA" },
    select: { texto: true },
  });
  const template = custom?.texto ?? TEMPLATE_MBA_DEFAULT;
  return gerarTextoDecreto(template, {
    ato: p.atoRef,
    exercicio: String(p.exercicio),
    data: p.dataVigencia.toISOString().slice(0, 10),
    corpo: p.corpo,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// helpers de persistência (privados)
// ═══════════════════════════════════════════════════════════════════════════

async function proximoNumeroCmd(tx: Tx, exercicio: number): Promise<number> {
  const ultima = await tx.versaoCmd.findFirst({
    where: { exercicio },
    orderBy: { numero: "desc" },
    select: { numero: true },
  });
  return (ultima?.numero ?? 0) + 1;
}

async function proximoNumeroMba(tx: Tx, exercicio: number): Promise<number> {
  const ultima = await tx.versaoMba.findFirst({
    where: { exercicio },
    orderBy: { numero: "desc" },
    select: { numero: true },
  });
  return (ultima?.numero ?? 0) + 1;
}

async function gravarVersaoCmd(
  tx: Tx,
  d: { exercicio: number; atoRef: string; vigenteDesde: Date; criadoPor: string },
  numero: number,
  distribuicao: ReadonlyMap<string, readonly Money[]>
): Promise<{ versaoId: string; cotas: number }> {
  const versao = await tx.versaoCmd.create({
    data: {
      exercicio: d.exercicio,
      numero,
      atoRef: d.atoRef,
      vigenteDesde: d.vigenteDesde,
      criadoPor: d.criadoPor,
    },
    select: { id: true },
  });

  const cotas: { versaoId: string; fonteId: string; mes: number; valor: string; criadoPor: string }[] = [];
  for (const [fonteId, parcelas] of distribuicao) {
    parcelas.forEach((valor, i) => {
      cotas.push({ versaoId: versao.id, fonteId, mes: i + 1, valor: valor.toFixed(2), criadoPor: d.criadoPor });
    });
  }
  if (cotas.length > 0) await tx.cotaCmd.createMany({ data: cotas });
  return { versaoId: versao.id, cotas: cotas.length };
}

async function gravarVersaoMba(
  tx: Tx,
  d: { exercicio: number; atoRef: string; vigenteDesde: Date; criadoPor: string },
  numero: number,
  distribuicao: ReadonlyMap<string, readonly Money[]>
): Promise<{ versaoId: string; metas: number }> {
  const versao = await tx.versaoMba.create({
    data: {
      exercicio: d.exercicio,
      numero,
      atoRef: d.atoRef,
      vigenteDesde: d.vigenteDesde,
      criadoPor: d.criadoPor,
    },
    select: { id: true },
  });

  const metas: { versaoId: string; fonteId: string; bimestre: number; valor: string; criadoPor: string }[] = [];
  for (const [fonteId, parcelas] of distribuicao) {
    parcelas.forEach((valor, i) => {
      metas.push({ versaoId: versao.id, fonteId, bimestre: i + 1, valor: valor.toFixed(2), criadoPor: d.criadoPor });
    });
  }
  if (metas.length > 0) await tx.metaMba.createMany({ data: metas });
  return { versaoId: versao.id, metas: metas.length };
}

export { bimestreDoMes };
