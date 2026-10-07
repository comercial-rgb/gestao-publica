import { Decimal } from "decimal.js";
import { z } from "zod";
import { toMoney, zMoney, type Money } from "../../packages/contracts/index.js";
import { serializarPercentual, toPercentual, zPercentualDeRateio, type Percentual } from "../../packages/contracts/percentual.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { travar } from "../../packages/locks/index.js";
import { normalizarCodigoNaturezaReceita } from "./ementario.js";

/**
 * M04 — AS FONTES DE CADA NATUREZA DA RECEITA, COM PERCENTUAL (TR 5.9.3.4), E O RATEIO DE UM VALOR POR ELAS (TR 5.9.3.7).
 *
 * O ente declara, no cadastro da natureza, em que fontes a receita se reparte e em que percentual. A soma não passa de
 * 100 — o cadastro aceita a composição incompleta, como a cláusula pede; quem RATEIA um valor (a previsão da LOA, em
 * `modules/m02-planejamento/previsao-por-rateio.ts`) só aceita a que fecha em 100, porque o que sobrasse ficaria em
 * fonte nenhuma.
 *
 * A composição é versionada e insert-only: publicar outra é a forma de corrigir, e a vigente é a mais recente. O
 * percentual é dado do ente; o sistema não sugere nenhum.
 *
 * O centavo que o percentual não fecha vai à fonte do resíduo, declarada na composição — o desenho do rateio de
 * custos (`modules/m12-relatorios/custos.ts`): cada parte é TRUNCADA a duas casas (arredondar poderia passar do total)
 * e o resto, sempre >= 0, vai inteiro a ela.
 */

type Leitor = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export const zDefinirFontesDaNaturezaInput = z
  .object({
    naturezaReceita: z.string().trim().min(1, "Informe a natureza da receita"),
    itens: z
      .array(
        z.object({
          fonte: z.string().trim().regex(/^\d{3}$/, "A fonte tem três dígitos"),
          exercicioFonte: z.union([z.literal(1), z.literal(2)]).default(1),
          percentual: zPercentualDeRateio,
        })
      )
      .min(1, "Informe ao menos uma fonte"),
    fonteDoResiduo: z.string().trim().regex(/^\d{3}$/, "Informe a fonte que recebe o centavo de sobra"),
    fundamento: z.string().trim().min(5, "Informe o ato ou o motivo da composição (ao menos 5 caracteres)"),
    criadoPor: z.string().min(1),
  })
  .superRefine((v, ctx) => {
    const soma = v.itens.reduce((t, i) => toPercentual(t.plus(i.percentual)), toPercentual("0"));
    if (soma.greaterThan(100)) {
      ctx.addIssue({ code: "custom", path: ["itens"], message: `A soma dos percentuais é ${formatarPercentual(soma)}% e não pode passar de 100%.` });
    }
    const fontes = v.itens.map((i) => i.fonte);
    const repetidas = fontes.filter((f, i) => fontes.indexOf(f) !== i);
    if (repetidas.length > 0) {
      ctx.addIssue({ code: "custom", path: ["itens"], message: `A fonte ${[...new Set(repetidas)].join(", ")} aparece mais de uma vez: some os percentuais numa linha só.` });
    }
    if (!fontes.includes(v.fonteDoResiduo)) {
      ctx.addIssue({ code: "custom", path: ["fonteDoResiduo"], message: `A fonte que recebe o centavo de sobra (${v.fonteDoResiduo}) tem de ser uma das fontes da composição.` });
    }
  });
export type DefinirFontesDaNaturezaInput = z.input<typeof zDefinirFontesDaNaturezaInput>;

/** "33,333334" — o percentual para a mensagem, sem os zeros de sobra. */
export function formatarPercentual(p: Percentual): string {
  return p.toDecimalPlaces(6).toFixed().replace(".", ",");
}

/** Publica uma composição de fontes para a natureza. Insert-only: a anterior continua na história. */
export async function definirFontesDaNatureza(prisma: PrismaClient, input: DefinirFontesDaNaturezaInput): Promise<{ readonly composicaoId: string; readonly soma: string }> {
  const lido = zDefinirFontesDaNaturezaInput.safeParse(input);
  if (!lido.success) throw new Error(`${lido.error.issues.map((i) => i.message).join(" ")} Nada foi gravado.`);
  const d = lido.data;
  const codigo = normalizarCodigoNaturezaReceita(d.naturezaReceita);

  return prisma.$transaction(async (tx) => {
    // Cadastrar as fontes de uma natureza é parte do cadastro da natureza: a mesma autoridade de quem a cria.
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.definirFontesDaNatureza, "ENTE");
    const natureza = await tx.naturezaReceita.findUnique({ where: { codigo }, select: { id: true } });
    if (natureza === null) throw new Error(`A natureza de receita ${codigo} não está no ementário. Cadastre a natureza antes. Nada foi gravado.`);
    // Duas publicações da mesma natureza em série: a hora gravada é carimbada DEPOIS da trava, e por isso a mais recente
    // é a que gravou por último. O cliente do Prisma já preenche o padrão na hora do INSERT; o valor explícito abaixo só
    // tira a dependência disso (o `now()` do banco seria a hora do início da transação). Quem garante é a trava (t7b).
    await travar(tx, "NaturezaDaReceita", [natureza.id]);
    const codigos = d.itens.map((i) => i.fonte);
    const fontes = await tx.fonteRecurso.findMany({ where: { codigo: { in: codigos } }, select: { id: true, codigo: true } });
    const ausentes = codigos.filter((c) => !fontes.some((f) => f.codigo === c));
    if (ausentes.length > 0) throw new Error(`Fonte fora do cadastro: ${ausentes.join(", ")}. Nada foi gravado.`);
    const idDa = (c: string): string => fontes.find((f) => f.codigo === c)!.id;

    const criada = await tx.composicaoDeFontesDaNatureza.create({
      data: {
        naturezaReceitaId: natureza.id,
        fonteDoResiduoId: idDa(d.fonteDoResiduo),
        fundamento: d.fundamento,
        criadoPor: d.criadoPor,
        criadoEm: new Date(),
        itens: { create: d.itens.map((i) => ({ fonteId: idDa(i.fonte), exercicioFonte: i.exercicioFonte, percentual: serializarPercentual(i.percentual) })) },
      },
      select: { id: true },
    });
    const soma = d.itens.reduce((t, i) => toPercentual(t.plus(i.percentual)), toPercentual("0"));
    return { composicaoId: criada.id, soma: serializarPercentual(soma) };
  });
}

export interface ComposicaoVigente {
  readonly composicaoId: string;
  readonly naturezaCodigo: string;
  readonly naturezaDescricao: string;
  readonly fonteDoResiduo: string;
  readonly fundamento: string;
  readonly criadoPor: string;
  readonly criadoEm: Date;
  readonly itens: readonly { readonly fonte: string; readonly fonteDescricao: string; readonly exercicioFonte: number; readonly percentual: Percentual }[];
  readonly soma: Percentual;
  /** A composição fecha em 100% e pode ratear um valor. */
  readonly completa: boolean;
}

/**
 * As composições VIGENTES (a mais recente de cada natureza). `naturezas` recorta por código; omitido = todas.
 * Desempate de duas composições no mesmo instante pelo id, para que a vigente não dependa da ordem do banco.
 */
export async function composicoesVigentes(leitor: Leitor, p: { readonly naturezas?: readonly string[] } = {}): Promise<readonly ComposicaoVigente[]> {
  const linhas = await leitor.composicaoDeFontesDaNatureza.findMany({
    where: p.naturezas !== undefined ? { naturezaReceita: { codigo: { in: [...p.naturezas] } } } : {},
    orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
    select: {
      id: true,
      fundamento: true,
      criadoPor: true,
      criadoEm: true,
      naturezaReceita: { select: { codigo: true, descricao: true } },
      fonteDoResiduo: { select: { codigo: true } },
      itens: { select: { exercicioFonte: true, percentual: true, fonte: { select: { codigo: true, descricao: true } } } },
    },
  });
  const vistas = new Set<string>();
  const vigentes: ComposicaoVigente[] = [];
  for (const c of linhas) {
    if (vistas.has(c.naturezaReceita.codigo)) continue;
    vistas.add(c.naturezaReceita.codigo);
    const itens = c.itens
      .map((i) => ({ fonte: i.fonte.codigo, fonteDescricao: i.fonte.descricao, exercicioFonte: i.exercicioFonte, percentual: toPercentual(i.percentual.toFixed(6)) }))
      .sort((a, b) => a.fonte.localeCompare(b.fonte) || a.exercicioFonte - b.exercicioFonte);
    const soma = itens.reduce((t, i) => toPercentual(t.plus(i.percentual)), toPercentual("0"));
    vigentes.push({
      composicaoId: c.id,
      naturezaCodigo: c.naturezaReceita.codigo,
      naturezaDescricao: c.naturezaReceita.descricao,
      fonteDoResiduo: c.fonteDoResiduo.codigo,
      fundamento: c.fundamento,
      criadoPor: c.criadoPor,
      criadoEm: c.criadoEm,
      itens,
      soma,
      completa: soma.equals(100),
    });
  }
  return vigentes.sort((a, b) => a.naturezaCodigo.localeCompare(b.naturezaCodigo));
}

export interface ParteDoRateio {
  readonly fonte: string;
  readonly exercicioFonte: number;
  readonly percentual: Percentual;
  readonly valor: Money;
}

/**
 * RATEIA um valor pela composição: cada parte truncada a duas casas, o resto à fonte do resíduo. A soma das partes é o
 * valor, exatamente. Recusa a composição que não fecha em 100%, nomeando o que faltaria.
 */
export function ratearPelaComposicao(valor: Money, c: Pick<ComposicaoVigente, "naturezaCodigo" | "itens" | "soma" | "fonteDoResiduo">): readonly ParteDoRateio[] {
  if (!c.soma.equals(100)) {
    throw new Error(
      `As fontes da natureza ${c.naturezaCodigo} somam ${formatarPercentual(c.soma)}%: ${formatarPercentual(toPercentual(new Decimal(100).minus(c.soma)))}% do valor ficaria sem fonte. ` +
        `Complete a composição no cadastro da natureza antes de ratear. Nada foi gravado.`
    );
  }
  const partes = c.itens.map((i) => ({
    fonte: i.fonte,
    exercicioFonte: i.exercicioFonte,
    percentual: i.percentual,
    valor: toMoney(valor.times(i.percentual).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_DOWN)),
  }));
  const somado = partes.reduce((t, p) => toMoney(t.plus(p.valor)), toMoney("0.00"));
  const residuo = toMoney(valor.minus(somado));
  return partes.map((p) => (p.fonte === c.fonteDoResiduo ? { ...p, valor: toMoney(p.valor.plus(residuo)) } : p));
}

export const zValorDoRateio = zMoney.refine((v) => v.greaterThan(0), { message: "O valor a ratear tem de ser maior que zero" });
