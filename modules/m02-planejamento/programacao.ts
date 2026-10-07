import { Decimal } from "decimal.js";
import { z } from "zod";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
// M02 → M04 (a seta que NÃO fecha ciclo: m04/consultas.ts não importa m02). O confronto do
// art. 9º é meta (M02) × arrecadado (M04) — e o arrecadado vem do dono, nunca recopiado.
import { arrecadadoPorFonte } from "../m04-receita/consultas.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { previsaoPorFonte } from "./consultas.js";
import { diaCivil, inicioDoDiaCivil, janelaCivilDeMeses } from "../../packages/datas/index.js";
import { somaLiquidaEstornaveis } from "../../packages/estornaveis/index.js";
import { mesesDoPeriodo, PERIODICIDADES_DAS_COTAS, periodicidadeVigente, ROTULO_DO_PERIODO, type PeriodicidadeDasCotas } from "../m05-despesa/guard-cmd.js";
import {
  bimestreDoMes,
  distribuirPorPercentuais,
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

/**
 * V36 (TR 5.9.3.37) — UMA VERSÃO DO CMD COM O PERCENTUAL DE CADA MÊS: o usuário diz quanto do ano vai em cada mês, e
 * a previsão de cada fonte (a mesma base de `proporCmdDaLoa`) é dividida por esses percentuais, fechando ao centavo
 * (`distribuirPorPercentuais`). É uma versão NOVA, append-only: a 1 se ainda não há cronograma, a seguinte se já há.
 */
const zProporPorPercentual = zPropor.extend({
  percentuais: z.array(z.string().trim().regex(/^\d{1,3}(\.\d{1,2})?$/,"Percentual com até duas casas, ponto decimal.")).length(12, "Informe os 12 meses."),
});
export async function proporCmdPorPercentual(
  prisma: PrismaClient,
  input: z.input<typeof zProporPorPercentual>
): Promise<{ readonly versaoId: string; readonly cotas: number; readonly numero: number }> {
  const d = zProporPorPercentual.parse(input);
  const percentuais = d.percentuais.map((p) => new Decimal(p));
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.proporCmdPorPercentual, "ENTE");
    const previsao = await previsaoPorFonte(tx, { exercicio: d.exercicio });
    const dist = new Map<string, readonly Money[]>();
    for (const [fonteId, total] of previsao) {
      if (total.lessThanOrEqualTo(0)) continue;
      dist.set(fonteId, distribuirPorPercentuais(total, percentuais));
    }
    if (dist.size === 0) throw new Error(`O exercício ${String(d.exercicio)} não tem previsão positiva em fonte nenhuma: não há o que distribuir. Nada foi gravado.`);
    const numero = await proximoNumeroCmd(tx, d.exercicio);
    const r = await gravarVersaoCmd(tx, d, numero, dist);
    return { ...r, numero };
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
// V36 (TR 5.9.3.33) — a PERIODICIDADE do controle das cotas
// ═══════════════════════════════════════════════════════════════════════════

const zPeriodicidade = z.object({
  exercicio: z.number().int().min(1900).max(2200),
  periodicidade: z.enum(PERIODICIDADES_DAS_COTAS, { message: "Periodicidade inválida: mensal, bimestral, trimestral ou semestral." }),
  vigenteDesde: z.date(),
  atoRef: z.string().trim().min(1, "Informe o ato que fixa a periodicidade."),
  criadoPor: z.string().min(1),
});

/**
 * DECLARA a periodicidade em que o guard do empenho confere as cotas (mensal, bimestral, trimestral ou semestral),
 * desde uma data, por ato. Append-only: a anterior continua valendo até a data da nova. Sob CRIAR_VERSAO_CMD — quem
 * fixa o cronograma fixa o período em que ele é cobrado. Recusa a declaração que não muda nada naquela data e a que
 * cai fora do exercício.
 */
export async function declararPeriodicidadeDasCotas(
  prisma: PrismaClient,
  input: z.input<typeof zPeriodicidade>
): Promise<{ readonly periodicidadeId: string }> {
  const d = zPeriodicidade.parse(input);
  if (Number(diaCivil(d.vigenteDesde).slice(0, 4)) !== d.exercicio) {
    throw new Error(`A data de vigência (${diaCivil(d.vigenteDesde).split("-").reverse().join("/")}) não é do exercício ${String(d.exercicio)}. Nada foi gravado.`);
  }
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.declararPeriodicidadeDasCotas, "ENTE");
    const atual = await periodicidadeVigente(tx, d.exercicio, d.vigenteDesde);
    if (atual === d.periodicidade) {
      throw new Error(`O controle das cotas de ${String(d.exercicio)} já é ${d.periodicidade.toLowerCase()} nessa data. Nada foi gravado.`);
    }
    // ⚠️ SÓ NA VIRADA DE PERÍODO, das duas réguas (achado da auditoria da V36). Mudar no meio de um período juntaria
    // ao período novo um mês já julgado pela régua anterior: declarar bimestral em 15/02 devolveria a fevereiro a sobra
    // de janeiro, a rolagem que o controle mensal proíbe; e trocar bimestral por trimestral em 01/04 deixaria a cota de
    // abril ser usada em março (bimestre mar–abr) e de novo em abril (trimestre abr–jun). A data tem de ser o dia 1 de
    // um mês que abre período na periodicidade nova, na vigente nessa data e na vigente na véspera.
    const dia = diaCivil(d.vigenteDesde);
    const mes = Number(dia.slice(5, 7));
    const vespera = await periodicidadeVigente(tx, d.exercicio, new Date(inicioDoDiaCivil(dia).getTime() - 1));
    const desalinhada = [d.periodicidade, atual, vespera].find((per) => mesesDoPeriodo(per, mes).primeiro !== mes);
    if (!dia.endsWith("-01") || desalinhada !== undefined) {
      throw new Error(
        `A periodicidade só muda na virada de um período: o dia 1 de um mês que abra período no controle ` +
          `${(desalinhada ?? d.periodicidade).toLowerCase()} (${dia.split("-").reverse().join("/")} não é). Mudar no meio do período ` +
          `deixaria a cota de um mês já encerrado ser usada de novo. Nada foi gravado.`
      );
    }
    const p = await tx.periodicidadeDasCotasCmd.create({
      data: { exercicio: d.exercicio, periodicidade: d.periodicidade, vigenteDesde: d.vigenteDesde, atoRef: d.atoRef, criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { periodicidadeId: p.id };
  });
}

export { periodicidadeVigente, ROTULO_DO_PERIODO, type PeriodicidadeDasCotas };

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
      const fim = janelaCivilDeMeses(p.exercicio, 2 * b - 1, 2).fim;
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
    // ⚠️ O DECRETO É DOCUMENTO ASSINADO, e a data impressa nele é a data CIVIL do ente:
    // um decreto com vigência em 31/12 às 22:00 saía datado de 1º de janeiro.
    data: diaCivil(p.dataVigencia),
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
    data: diaCivil(p.dataVigencia),
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

// ═══════════════════════════════════════════════════════════════════════════
// acompanhamentoDasCotasCmd — previsto × realizado das cotas de despesa (TR 5.9.3.35)
// ═══════════════════════════════════════════════════════════════════════════

export interface LinhaAcompanhamentoCmd {
  readonly fonteId: string;
  readonly mes: number;
  /** A cota do mês na versão do cronograma vigente no último dia do mês. "0.00" quando a versão não a tem. */
  readonly cota: string;
  /** Σ das liberações da fonte no mês. */
  readonly liberado: string;
  /** cota + liberado — o teto do mês. */
  readonly previsto: string;
  /** Σ dos empenhos LÍQUIDOS da fonte no mês civil — a mesma conta do guard do cronograma. */
  readonly realizado: string;
  /** previsto − realizado. NEGATIVO = empenhou-se além do previsto (possível com a limitação desligada). */
  readonly saldo: string;
  /** V36 (TR 5.9.3.33) — o período do controle que contém o mês ("1 a 2" no bimestral; "3" no mensal). */
  readonly periodo: string;
  readonly periodicidade: PeriodicidadeDasCotas;
  /**
   * V36 — o saldo do PERÍODO: Σ (cotas + liberações) dos meses do período, todas pela versão do cronograma vigente no
   * fim do período, menos o empenhado líquido no período. É o que o guard deixa empenhar NO FIM do período. O guard usa
   * a versão e a periodicidade vigentes na DATA de cada empenho; com uma versão nova no meio do período, um empenho
   * anterior a ela foi julgado pela versão anterior, e este saldo não o reproduz (diz o estado de agora, não o de então).
   * No mensal, igual ao saldo do mês.
   */
  readonly saldoDoPeriodo: string;
}

/**
 * O ACOMPANHAMENTO DAS COTAS DE DESPESA: por fonte × mês, a cota programada, as liberações, o previsto e o
 * realizado (empenhado líquido).
 *
 * ⚠️ O REALIZADO É O CONSUMIDO DO GUARD (`exigirCotaCmd`, M05), e não outra soma: empenhos da fonte cuja data
 * cai no mês CIVIL do ente, líquidos pelo `somaLiquidaEstornaveis` dentro da mesma janela. Uma anulação lançada
 * em outro mês não devolve a cota do mês do empenho — é a régua que o guard aplica, e o relatório mostra a régua
 * que de fato limitou o empenho.
 *
 * ⚠️ A VERSÃO DE CADA MÊS é a vigente no último dia dele (a maior `vigenteDesde` até lá). Um mês anterior à
 * primeira versão não tem cota (0.00) — e o relatório diz isso, não inventa.
 *
 * Fontes listadas: as que têm cota em alguma versão do exercício ou empenho no exercício. Leitura pura.
 */
export async function acompanhamentoDasCotasCmd(
  leitor: Tx,
  p: { readonly exercicio: number }
): Promise<readonly LinhaAcompanhamentoCmd[]> {
  const versoes = await leitor.versaoCmd.findMany({
    where: { exercicio: p.exercicio },
    orderBy: { vigenteDesde: "asc" },
    select: { id: true, vigenteDesde: true, cotas: { select: { fonteId: true, mes: true, valor: true } } },
  });
  const liberacoes = await leitor.liberacaoProgramacao.findMany({
    where: { exercicio: p.exercicio },
    select: { fonteId: true, mes: true, valor: true },
  });
  const ano = janelaCivilDeMeses(p.exercicio, 1, 12);
  const empenhos = await leitor.empenho.findMany({
    where: { data: { gte: ano.inicio, lte: ano.fim } },
    select: { id: true, valor: true, data: true, estornoDeId: true, anulacaoParcialDeId: true, ficha: { select: { fonteId: true } } },
  });

  const fontes = new Set<string>();
  for (const v of versoes) for (const c of v.cotas) fontes.add(c.fonteId);
  for (const e of empenhos) fontes.add(e.ficha.fonteId);

  const zero = toMoney("0.00");
  // V36 — a periodicidade de cada mês: a vigente no fim dele (a régua do guard para um empenho no fim do mês).
  const periodicidades = new Map<number, PeriodicidadeDasCotas>();
  for (let mes = 1; mes <= 12; mes++) periodicidades.set(mes, await periodicidadeVigente(leitor, p.exercicio, janelaCivilDeMeses(p.exercicio, mes, 1).fim));
  const linhas: LinhaAcompanhamentoCmd[] = [];
  for (const fonteId of [...fontes].sort()) {
    for (let mes = 1; mes <= 12; mes++) {
      const periodicidade = periodicidades.get(mes) ?? "MENSAL";
      const per = mesesDoPeriodo(periodicidade, mes);
      const mesesDoPer = Array.from({ length: per.quantidade }, (_, i) => per.primeiro + i);
      const janelaDoPeriodo = janelaCivilDeMeses(p.exercicio, per.primeiro, per.quantidade);
      const versaoDoPeriodo = [...versoes].reverse().find((v) => v.vigenteDesde.getTime() <= janelaDoPeriodo.fim.getTime());
      const previstoDoPeriodo = mesesDoPer.reduce((acc, m) => {
        const c = versaoDoPeriodo?.cotas.find((x) => x.fonteId === fonteId && x.mes === m);
        const lib = liberacoes.filter((l) => l.fonteId === fonteId && l.mes === m).reduce((a, l) => toMoney(a.plus(toMoney(l.valor.toFixed(2)))), zero);
        return toMoney(acc.plus(c === undefined ? zero : toMoney(c.valor.toFixed(2))).plus(lib));
      }, zero);
      const realizadoDoPeriodo = somaLiquidaEstornaveis(
        empenhos
          .filter((e) => e.ficha.fonteId === fonteId && e.data.getTime() >= janelaDoPeriodo.inicio.getTime() && e.data.getTime() <= janelaDoPeriodo.fim.getTime())
          .map((e) => ({ id: e.id, valor: toMoney(e.valor.toFixed(2)), estornoDeId: e.estornoDeId, anulacaoParcialDeId: e.anulacaoParcialDeId }))
      );
      const { inicio, fim } = janelaCivilDeMeses(p.exercicio, mes, 1);
      const vigente = [...versoes].reverse().find((v) => v.vigenteDesde.getTime() <= fim.getTime());
      const c = vigente?.cotas.find((x) => x.fonteId === fonteId && x.mes === mes);
      const cota = c === undefined ? zero : toMoney(c.valor.toFixed(2));
      const liberado = liberacoes
        .filter((l) => l.fonteId === fonteId && l.mes === mes)
        .reduce((acc, l) => toMoney(acc.plus(toMoney(l.valor.toFixed(2)))), zero);
      const previsto = toMoney(cota.plus(liberado));
      const realizado = somaLiquidaEstornaveis(
        empenhos
          .filter((e) => e.ficha.fonteId === fonteId && e.data.getTime() >= inicio.getTime() && e.data.getTime() <= fim.getTime())
          .map((e) => ({ id: e.id, valor: toMoney(e.valor.toFixed(2)), estornoDeId: e.estornoDeId, anulacaoParcialDeId: e.anulacaoParcialDeId }))
      );
      linhas.push({
        fonteId,
        mes,
        cota: cota.toFixed(2),
        liberado: liberado.toFixed(2),
        previsto: previsto.toFixed(2),
        realizado: realizado.toFixed(2),
        saldo: toMoney(previsto.minus(realizado)).toFixed(2),
        periodo: per.quantidade === 1 ? String(mes) : `${String(per.primeiro)} a ${String(per.primeiro + per.quantidade - 1)}`,
        periodicidade,
        saldoDoPeriodo: toMoney(previstoDoPeriodo.minus(realizadoDoPeriodo)).toFixed(2),
      });
    }
  }
  return linhas;
}
