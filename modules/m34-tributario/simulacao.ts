import { z } from "zod";
import { Decimal, toMoney } from "../../packages/contracts/index.js";
import { diaCivil, diaCivilBr, inicioDoDiaCivil } from "../../packages/datas/index.js";
import { calcular, FormulaInvalidaError, variaveisDaFormula } from "../../packages/formula/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { versaoDoImovelNoDia, vinculosDoImovelNoDia } from "./cadastro-imobiliario.js";

/**
 * ═══ M34 — OS PARÂMETROS DO TRIBUTO E A SIMULAÇÃO COM MEMÓRIA (V7 B1) ═══
 *
 * ⚠️ A CONTA É DO ENTE, NÃO DO CÓDIGO. A fórmula e os valores (valor do m², fatores, alíquota, limites) são a TABELA
 * publicada por quem tem a ação, com fundamento e vigência. O código interpreta (`packages/formula`, universo fechado)
 * e mostra a MEMÓRIA: versão do cadastro, tabela usada, cada variável com o seu valor e o resultado.
 *
 * ⚠️ SIMULAR NÃO LANÇA. Nenhuma linha é gravada, nenhuma dívida é constituída, nada entra no ledger, e a simulação não
 * altera o cadastro. É leitura — e é isso que permite responder "quanto daria" sem criar fato tributário.
 *
 * ⚠️ NENHUM VALOR PADRÃO NACIONAL. Sem tabela publicada para o tributo e o exercício, a resposta é recusa nomeada:
 * inventar alíquota de IPTU seria inventar norma municipal.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

const zDia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A data é um DIA civil AAAA-MM-DD.");
const zChave = z.string().trim().regex(/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9_.]*$/, "A chave começa por letra e usa letras, números, ponto e sublinhado.");
const TRIBUTOS = ["IPTU", "ITBI", "ISS", "TAXA"] as const;
export type TributoMunicipal = (typeof TRIBUTOS)[number];

export const zPublicarTabelaDeParametros = z
  .object({
    tributo: z.enum(TRIBUTOS),
    exercicio: z.number().int().min(2000).max(2100),
    vigenciaInicio: zDia,
    fundamento: z.string().trim().min(5, "Diga a lei, o decreto ou o artigo que sustenta estes valores."),
    motivo: z.string().trim().min(5),
    formula: z.string().trim().min(1),
    parametros: z.array(z.object({ chave: zChave, valor: z.string().trim().regex(/^-?\d+(\.\d{1,6})?$/), descricao: z.string().trim().min(1) }).strict()).max(60).default([]),
    criadoPor: z.string().min(1),
  })
  .strict();
export type PublicarTabelaDeParametrosInput = z.input<typeof zPublicarTabelaDeParametros>;

/** As variáveis que o CADASTRO fornece à fórmula (as demais têm de vir dos parâmetros da tabela). */
export const VARIAVEIS_DO_CADASTRO: readonly string[] = ["areaDoTerreno", "areaConstruida", "fracaoIdeal", "usoResidencial", "usoComercial", "usoIndustrial", "usoTerritorial"];

/**
 * PUBLICAR A TABELA — versão nova do tributo no exercício. A fórmula é analisada ANTES de gravar: se ela usa um nome
 * que nem o cadastro nem os parâmetros fornecem, a publicação é recusada nomeando o nome (uma tabela que só falha na
 * hora de simular é uma norma quebrada guardada como se estivesse boa).
 */
export async function publicarTabelaDeParametros(prisma: PrismaClient, input: PublicarTabelaDeParametrosInput): Promise<{ readonly tabelaId: string; readonly versao: number; readonly variaveis: readonly string[] }> {
  const d = zPublicarTabelaDeParametros.parse(input);
  const chaves = d.parametros.map((p) => p.chave);
  if (new Set(chaves).size !== chaves.length) throw new Error("PARAMETRO-REPETIDO: cada parâmetro entra uma vez na tabela. Nada foi gravado.");
  let variaveis: readonly string[];
  try {
    variaveis = variaveisDaFormula(d.formula);
  } catch (e) {
    throw new Error(`FORMULA-INVALIDA: ${e instanceof FormulaInvalidaError ? e.message : String(e)} Nada foi gravado.`);
  }
  const disponiveis = new Set([...VARIAVEIS_DO_CADASTRO, ...chaves]);
  const faltando = variaveis.filter((v) => !disponiveis.has(v));
  if (faltando.length > 0) {
    throw new Error(
      `VARIAVEL-SEM-ORIGEM: a fórmula usa ${faltando.map((v) => `"${v}"`).join(", ")}, que não vem do cadastro nem dos parâmetros desta tabela. ` +
        `Do cadastro vêm: ${VARIAVEIS_DO_CADASTRO.join(", ")}; da tabela, os atributos do imóvel e os parâmetros declarados. Nada foi gravado.`
    );
  }
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.publicarTabelaDeParametros, "ENTE");
    const ultima = await tx.tabelaDeParametrosTributarios.findFirst({ where: { tributo: d.tributo, exercicio: d.exercicio }, orderBy: { versao: "desc" }, select: { versao: true, vigenciaInicio: true } });
    if (ultima !== undefined && ultima !== null && d.vigenciaInicio < diaCivil(ultima.vigenciaInicio)) {
      throw new Error(`VIGENCIA-ANTERIOR-A-VERSAO-VIGENTE: a versão ${ultima.versao} da tabela de ${d.tributo}/${d.exercicio} vale desde ${diaCivilBr(ultima.vigenciaInicio)}; a nova não pode valer antes. Nada foi gravado.`);
    }
    const versao = (ultima?.versao ?? 0) + 1;
    const r = await tx.tabelaDeParametrosTributarios.create({
      data: {
        tributo: d.tributo, exercicio: d.exercicio, versao, vigenciaInicio: inicioDoDiaCivil(d.vigenciaInicio), fundamento: d.fundamento, motivo: d.motivo, formula: d.formula, criadoPor: d.criadoPor,
        parametros: { create: d.parametros.map((p) => ({ chave: p.chave, valor: p.valor, descricao: p.descricao })) },
      },
      select: { id: true },
    });
    return { tabelaId: r.id, versao, variaveis };
  });
}

export interface TabelaVigente {
  readonly id: string;
  readonly tributo: string;
  readonly exercicio: number;
  readonly versao: number;
  readonly vigenciaInicio: string;
  readonly fundamento: string;
  readonly formula: string;
  readonly parametros: readonly { readonly chave: string; readonly valor: string; readonly descricao: string }[];
}

/** A tabela que VALE num dia para o tributo e o exercício — a última com vigência até ele. */
export async function tabelaVigente(prisma: Tx, tributo: TributoMunicipal, exercicio: number, dia: string): Promise<TabelaVigente | null> {
  const t = await prisma.tabelaDeParametrosTributarios.findFirst({
    where: { tributo, exercicio, vigenciaInicio: { lte: inicioDoDiaCivil(dia) } },
    orderBy: { versao: "desc" },
    select: { id: true, tributo: true, exercicio: true, versao: true, vigenciaInicio: true, fundamento: true, formula: true, parametros: { orderBy: { chave: "asc" }, select: { chave: true, valor: true, descricao: true } } },
  });
  if (t === null) return null;
  return { ...t, vigenciaInicio: diaCivil(t.vigenciaInicio), parametros: t.parametros.map((p) => ({ chave: p.chave, valor: p.valor.toFixed(6), descricao: p.descricao })) };
}

export const zSimularTributo = z
  .object({
    imovelId: z.string().min(1),
    tributo: z.enum(TRIBUTOS),
    exercicio: z.number().int().min(2000).max(2100),
    /** O dia que decide QUAIS versões valem — do cadastro e da tabela. Padrão: 1º de janeiro do exercício. */
    dia: zDia.optional(),
  })
  .strict();
export type SimularTributoInput = z.input<typeof zSimularTributo>;

export interface ResultadoDaSimulacao {
  readonly valor: string;
  readonly imovel: { readonly inscricao: string; readonly versao: number; readonly vigenciaInicio: string };
  readonly tabela: { readonly versao: number; readonly vigenciaInicio: string; readonly fundamento: string; readonly formula: string };
  readonly dia: string;
  readonly memoria: readonly { readonly nome: string; readonly valor: string; readonly origem: "cadastro" | "atributo do imóvel" | "parâmetro da tabela" }[];
  readonly responsaveis: readonly { readonly papel: string; readonly fracao: string; readonly nome: string; readonly documento: string; readonly valorProporcional: string }[];
  readonly avisos: readonly string[];
}

/**
 * SIMULAR — leitura pura: resolve a versão do cadastro e a tabela que valem no dia, monta as variáveis, calcula e
 * devolve a MEMÓRIA. Nada é gravado. O rateio por responsável é informativo (fração × valor), e não constitui dívida
 * de ninguém.
 */
export async function simularTributo(prisma: Tx, input: SimularTributoInput): Promise<ResultadoDaSimulacao> {
  const d = zSimularTributo.parse(input);
  const dia = d.dia ?? `${d.exercicio}-01-01`;
  const imovel = await prisma.imovel.findUnique({ where: { id: d.imovelId }, select: { inscricao: true } });
  if (imovel === null) throw new Error("IMOVEL-INEXISTENTE: o imóvel indicado não existe.");
  const versao = await versaoDoImovelNoDia(prisma, d.imovelId, dia);
  if (versao === null) throw new Error(`CADASTRO-SEM-VERSAO-NO-DIA: o imóvel ${imovel.inscricao} não tem versão do cadastro valendo em ${dia.split("-").reverse().join("/")}.`);
  const tabela = await tabelaVigente(prisma, d.tributo, d.exercicio, dia);
  if (tabela === null) {
    throw new Error(`SEM-TABELA-PUBLICADA: não há tabela de ${d.tributo} do exercício ${d.exercicio} valendo em ${dia.split("-").reverse().join("/")}. Publique a tabela do ente (fórmula, fundamento e parâmetros) antes de simular.`);
  }
  const doCadastro: Record<string, string> = {
    areaDoTerreno: versao.areaDoTerreno,
    areaConstruida: versao.areaConstruida,
    fracaoIdeal: versao.fracaoIdeal ?? "1",
    usoResidencial: versao.uso === "RESIDENCIAL" ? "1" : "0",
    usoComercial: versao.uso === "COMERCIAL" ? "1" : "0",
    usoIndustrial: versao.uso === "INDUSTRIAL" ? "1" : "0",
    usoTerritorial: versao.uso === "TERRITORIAL" ? "1" : "0",
  };
  const dosAtributos = Object.fromEntries(versao.atributos.map((a) => [a.chave, a.valor]));
  const daTabela = Object.fromEntries(tabela.parametros.map((p) => [p.chave, p.valor]));
  const origem = (nome: string): "cadastro" | "atributo do imóvel" | "parâmetro da tabela" => (nome in doCadastro ? "cadastro" : nome in dosAtributos ? "atributo do imóvel" : "parâmetro da tabela");
  const avisos: string[] = [];
  for (const chave of Object.keys(dosAtributos)) if (chave in daTabela) avisos.push(`O atributo "${chave}" do imóvel foi usado no lugar do parâmetro de mesmo nome da tabela.`);
  const variaveis = { ...daTabela, ...dosAtributos, ...doCadastro };
  let calculo: ReturnType<typeof calcular>;
  try {
    calculo = calcular(tabela.formula, variaveis);
  } catch (e) {
    if (e instanceof FormulaInvalidaError) throw new Error(`FORMULA-DA-TABELA-RECUSADA: ${e.message} (tabela versão ${tabela.versao} de ${d.tributo}/${d.exercicio}).`);
    throw e;
  }
  const valor = toMoney(calculo.valor);
  if (valor.lt(0)) throw new Error(`SIMULACAO-NEGATIVA: a fórmula da versão ${tabela.versao} devolveu ${calculo.valor.toString()}. Tributo negativo não existe; corrija a tabela.`);
  const vinculos = await vinculosDoImovelNoDia(prisma, d.imovelId, dia);
  const responsaveis = vinculos.map((v) => ({ ...v, valorProporcional: toMoney(valor.times(v.fracao)).toFixed(2) }));
  if (responsaveis.length === 0) avisos.push("O imóvel não tem vínculo vigente de pessoa neste dia: a simulação não tem a quem atribuir.");
  return {
    valor: valor.toFixed(2),
    imovel: { inscricao: imovel.inscricao, versao: versao.versao, vigenciaInicio: versao.vigenciaInicio },
    tabela: { versao: tabela.versao, vigenciaInicio: tabela.vigenciaInicio, fundamento: tabela.fundamento, formula: tabela.formula },
    dia,
    memoria: calculo.memoria.map((m) => ({ nome: m.expressao, valor: new Decimal(m.valor).toString(), origem: origem(m.expressao) })),
    responsaveis: responsaveis.map((r) => ({ papel: r.papel, fracao: r.fracao, nome: r.nome, documento: r.documento, valorProporcional: r.valorProporcional })),
    avisos,
  };
}
