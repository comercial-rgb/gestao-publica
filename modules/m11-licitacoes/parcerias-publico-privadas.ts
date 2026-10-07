import { z } from "zod";
import { emProsa, toMoney, zMoney, type Money } from "../../packages/contracts/index.js";
import { anoCivil, diaCivil } from "../../packages/datas/index.js";
import { liquidoDoFato } from "../../packages/estornaveis/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";

/**
 * V36 — AS PARCERIAS PÚBLICO-PRIVADAS (TR 5.10.1.87). O `ContratoPPP` existia só para o RREO Anexo 13, sem cadastro
 * nem tela. Aqui ele ganha o cadastro (tipo da Lei 11.079, art. 2º: concessão patrocinada ou administrativa), a
 * SITUAÇÃO append-only e as PARCELAS por exercício. Tudo sob CADASTRAR_CONTRATO no ente: a PPP é contrato
 * administrativo, e quem cadastra contrato a cadastra (uma ação própria daria um crachá a mais para o mesmo setor).
 *
 * As parcelas são INFORMADAS (o contrato as fixa; o sistema não as calcula) e append-only por ano: informar de novo um
 * ano substitui o valor vigente dele e deixa o anterior no histórico.
 */

export const TIPOS_DE_PPP = ["PATROCINADA", "ADMINISTRATIVA"] as const;
export const SITUACOES_DA_PPP = ["EM_EXECUCAO", "SUSPENSA", "ENCERRADA", "RESCINDIDA"] as const;
export type SituacaoDaPpp = (typeof SITUACOES_DA_PPP)[number];
export const ROTULO_DO_TIPO_DE_PPP: Readonly<Record<string, string>> = { PATROCINADA: "Concessão patrocinada", ADMINISTRATIVA: "Concessão administrativa" };
export const ROTULO_DA_SITUACAO_DA_PPP: Readonly<Record<SituacaoDaPpp, string>> = {
  EM_EXECUCAO: "Em execução",
  SUSPENSA: "Suspensa",
  ENCERRADA: "Encerrada",
  RESCINDIDA: "Rescindida",
};

type Linha = { readonly id: string; readonly criadoEm: Date };

/**
 * A situação vigente: a do DIA CIVIL mais recente (empate no dia: a gravada por último). Por dia, e não por instante — a
 * mesma régua da validação de `registrarSituacaoDaParceria`; comparar instantes deixaria uma mudança do mesmo dia ser
 * aceita e não valer (achado da auditoria da V36).
 */
export function situacaoVigenteDaPpp(linhas: readonly (Linha & { readonly situacao: string; readonly data: Date })[]): SituacaoDaPpp | null {
  let ultima: (typeof linhas)[number] | undefined;
  for (const l of linhas) {
    const [dl, du] = [diaCivil(l.data), ultima === undefined ? "" : diaCivil(ultima.data)];
    if (ultima === undefined || dl > du || (dl === du && (l.criadoEm > ultima.criadoEm || (l.criadoEm.getTime() === ultima.criadoEm.getTime() && l.id > ultima.id)))) {
      ultima = l;
    }
  }
  return (ultima?.situacao as SituacaoDaPpp | undefined) ?? null;
}

/** As parcelas vigentes: por ano, a gravada por último. Ordenadas por ano. */
export function parcelasVigentesDaPpp(linhas: readonly (Linha & { readonly ano: number; readonly valor: Money })[]): readonly { readonly ano: number; readonly valor: Money }[] {
  const porAno = new Map<number, (typeof linhas)[number]>();
  for (const l of linhas) {
    const a = porAno.get(l.ano);
    if (a === undefined || l.criadoEm > a.criadoEm || (l.criadoEm.getTime() === a.criadoEm.getTime() && l.id > a.id)) porAno.set(l.ano, l);
  }
  return [...porAno.values()].sort((x, y) => x.ano - y.ano).map((l) => ({ ano: l.ano, valor: l.valor }));
}

const zValor = zMoney.refine((v) => v.greaterThanOrEqualTo(0), { message: "Valor não pode ser negativo." });

const zCadastro = z
  .object({
    numero: z.string().trim().min(1, "Informe o número do contrato."),
    objeto: z.string().trim().min(5, "Descreva o objeto da parceria."),
    parceiroPrivado: z.string().trim().min(3, "Informe a empresa parceira."),
    tipo: z.enum(TIPOS_DE_PPP, { message: "Tipo da parceria: concessão patrocinada ou administrativa." }),
    vigenciaInicio: z.date(),
    vigenciaFim: z.date(),
    valorGlobal: zValor,
    contraprestacaoAnual: zValor,
    criadoPor: z.string().min(1),
  })
  .superRefine((v, ctx) => {
    if (diaCivil(v.vigenciaFim) < diaCivil(v.vigenciaInicio)) ctx.addIssue({ code: "custom", path: ["vigenciaFim"], message: "O fim da vigência é anterior ao início." });
  });

/** CADASTRA a parceria e grava a primeira situação (em execução, desde o início da vigência). */
export async function cadastrarParceriaPublicoPrivada(prisma: PrismaClient, input: z.input<typeof zCadastro>): Promise<{ readonly contratoPppId: string }> {
  const d = zCadastro.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarParceriaPublicoPrivada, "ENTE");
    if ((await tx.contratoPPP.findFirst({ where: { numero: d.numero }, select: { id: true } })) !== null) {
      throw new Error(`Já existe parceria com o contrato ${d.numero}. Nada foi gravado.`);
    }
    const c = await tx.contratoPPP.create({
      data: {
        numero: d.numero,
        objeto: d.objeto,
        parceiroPrivado: d.parceiroPrivado,
        tipo: d.tipo,
        vigenciaInicio: d.vigenciaInicio,
        vigenciaFim: d.vigenciaFim,
        valorGlobal: d.valorGlobal.toFixed(2),
        contraprestacaoAnual: d.contraprestacaoAnual.toFixed(2),
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    await tx.situacaoDaPpp.create({ data: { contratoPppId: c.id, situacao: "EM_EXECUCAO", data: d.vigenciaInicio, criadoPor: d.criadoPor } });
    return { contratoPppId: c.id };
  });
}

const zSituacao = z
  .object({
    contratoPppId: z.string().min(1),
    situacao: z.enum(SITUACOES_DA_PPP, { message: "Situação inválida." }),
    data: z.date(),
    motivo: z.string().trim().optional(),
    criadoPor: z.string().min(1),
  })
  .superRefine((v, ctx) => {
    if ((v.motivo ?? "").length < 10) ctx.addIssue({ code: "custom", path: ["motivo"], message: "Diga o motivo da mudança de situação (ao menos 10 caracteres)." });
  });

/** MUDA a situação da parceria, com data e motivo. Recusa a que não muda nada e a anterior à vigente. */
export async function registrarSituacaoDaParceria(prisma: PrismaClient, input: z.input<typeof zSituacao>): Promise<{ readonly situacaoId: string }> {
  const d = zSituacao.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarSituacaoDaParceria, "ENTE");
    const c = await tx.contratoPPP.findUnique({ where: { id: d.contratoPppId }, select: { numero: true, situacoes: { select: { id: true, situacao: true, data: true, criadoEm: true } } } });
    if (c === null) throw new Error("A parceria não existe. Nada foi gravado.");
    const atual = situacaoVigenteDaPpp(c.situacoes);
    if (atual === d.situacao) throw new Error(`A parceria ${c.numero} já está ${ROTULO_DA_SITUACAO_DA_PPP[d.situacao].toLowerCase()}. Nada foi gravado.`);
    // ⚠️ SEM DATA FUTURA: a vigente é a de data mais recente, e uma data adiante (2030 digitado no lugar de 2026) valeria
    // já e travaria toda correção com data anterior (achado da auditoria da V36).
    if (diaCivil(d.data) > diaCivil(new Date())) {
      throw new Error(`A data da mudança (${diaCivil(d.data).split("-").reverse().join("/")}) é futura. Registre a situação quando ela acontecer. Nada foi gravado.`);
    }
    const ultimaData = c.situacoes.reduce<string>((m, s) => (diaCivil(s.data) > m ? diaCivil(s.data) : m), "");
    if (ultimaData !== "" && diaCivil(d.data) < ultimaData) {
      throw new Error(`A data da mudança (${diaCivil(d.data).split("-").reverse().join("/")}) é anterior à da situação vigente (${ultimaData.split("-").reverse().join("/")}). Nada foi gravado.`);
    }
    const s = await tx.situacaoDaPpp.create({ data: { contratoPppId: d.contratoPppId, situacao: d.situacao, data: d.data, ...(d.motivo !== undefined ? { motivo: d.motivo } : {}), criadoPor: d.criadoPor } });
    return { situacaoId: s.id };
  });
}

const zParcelas = z.object({
  contratoPppId: z.string().min(1),
  parcelas: z.array(z.object({ ano: z.number().int().min(1900).max(2200), valor: zValor })).min(1, "Informe ao menos uma parcela."),
  criadoPor: z.string().min(1),
});

/**
 * INFORMA as parcelas por exercício, todas ou nenhuma. Cada ano tem de cair na vigência do contrato e aparecer uma vez
 * no lote. Informar de novo um ano substitui o valor vigente (o anterior fica no histórico).
 */
export async function informarParcelasDaParceria(prisma: PrismaClient, input: z.input<typeof zParcelas>): Promise<{ readonly gravadas: number; readonly total: string }> {
  const d = zParcelas.parse(input);
  const anos = d.parcelas.map((p) => p.ano);
  const repetido = anos.find((a, i) => anos.indexOf(a) !== i);
  if (repetido !== undefined) throw new Error(`O ano ${String(repetido)} aparece mais de uma vez no lote. Nada foi gravado.`);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.informarParcelasDaParceria, "ENTE");
    const c = await tx.contratoPPP.findUnique({ where: { id: d.contratoPppId }, select: { numero: true, vigenciaInicio: true, vigenciaFim: true } });
    if (c === null) throw new Error("A parceria não existe. Nada foi gravado.");
    const [de, ate] = [anoCivil(c.vigenciaInicio), anoCivil(c.vigenciaFim)];
    const fora = d.parcelas.find((p) => p.ano < de || p.ano > ate);
    if (fora !== undefined) throw new Error(`A parcela de ${String(fora.ano)} está fora da vigência do contrato ${c.numero} (${String(de)} a ${String(ate)}). Nada foi gravado.`);
    await tx.parcelaDaPpp.createMany({ data: d.parcelas.map((p) => ({ contratoPppId: d.contratoPppId, ano: p.ano, valor: p.valor.toFixed(2), criadoPor: d.criadoPor })) });
    const total = d.parcelas.reduce((a, p) => toMoney(a.plus(p.valor)), toMoney("0.00"));
    return { gravadas: d.parcelas.length, total: emProsa(total.toFixed(2)) };
  });
}

/**
 * As linhas de parcela coladas na tela: "ano; valor" por linha (ponto e vírgula, tabulação ou espaço), valor com ou sem
 * separador de milhar e vírgula decimal. Devolve as parcelas ou TODAS as linhas ruins, com o número delas.
 */
export function lerLinhasDeParcelas(texto: string): { readonly parcelas: readonly { readonly ano: number; readonly valor: string }[]; readonly erros: readonly string[] } {
  const parcelas: { ano: number; valor: string }[] = [];
  const erros: string[] = [];
  texto.split(/\r?\n/).forEach((bruta, i) => {
    const linha = bruta.trim();
    if (linha === "") return;
    // Formatos aceitos, e só eles (achado da auditoria: "1.250.00" virava 125.000,00): milhar com ponto em grupos de três
    // e vírgula decimal ("1.250.000,00"), sem milhar com vírgula ("1250000,00"), ponto decimal com até duas casas
    // ("1250000.5") ou inteiro ("1250000"). Qualquer outra forma é recusada nomeando a linha.
    const m = /^(\d{4})\s*[;\t ]\s*(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?|\d+\.\d{1,2})$/.exec(linha);
    if (m === null) {
      erros.push(`linha ${String(i + 1)} ("${linha}"): use "ano; valor", por exemplo "2027; 1.250.000,00"`);
      return;
    }
    const v = m[2] ?? "";
    const valor = v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : /^\d+\.\d{1,2}$/.test(v) ? v : v.replace(/\./g, "");
    parcelas.push({ ano: Number(m[1]), valor });
  });
  return { parcelas, erros };
}

export interface EmpenhoDaParceria {
  readonly id: string;
  readonly numero: string;
  readonly data: Date;
  readonly credorCpfCnpj: string;
  readonly valor: Money;
  /** O valor menos as anulações (total e parciais), pelo mesmo motor do resto do M05. */
  readonly liquido: Money;
}

/**
 * Os empenhos de uma parceria (TR 5.10.1.89): os originais, com o líquido de cada um. As anulações levam o vínculo
 * (DIMENSOES_DO_EMPENHO), então o universo da soma é o conjunto de todos os empenhos com a parceria.
 */
export async function empenhosDaParceria(
  tx: Pick<PrismaClient, "empenho">,
  contratoPppId: string
): Promise<readonly EmpenhoDaParceria[]> {
  const todos = await tx.empenho.findMany({
    where: { contratoPppId },
    orderBy: [{ data: "asc" }, { numero: "asc" }],
    select: { id: true, numero: true, data: true, credorCpfCnpj: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true },
  });
  const universo = todos.map((e) => ({ id: e.id, valor: toMoney(e.valor.toFixed(2)), estornoDeId: e.estornoDeId, anulacaoParcialDeId: e.anulacaoParcialDeId }));
  return todos
    .filter((e) => e.estornoDeId === null && e.anulacaoParcialDeId === null)
    .map((e) => ({ id: e.id, numero: e.numero, data: e.data, credorCpfCnpj: e.credorCpfCnpj, valor: toMoney(e.valor.toFixed(2)), liquido: liquidoDoFato(e.id, universo) }));
}
