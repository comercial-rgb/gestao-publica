import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import { montarNatureza } from "../../prisma/seed/dados/naturezas-despesa.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { criarM02Deps } from "./adapter-prisma.js";
import { cadastrarNaturezaReceita } from "../m04-receita/ementario.js";
import { detalharReceitaPrevista } from "./detalhe-da-receita-prevista.js";
import { criarFicha, criarReceitaPrevista } from "./servico.js";

/**
 * ═══ A CARGA DO QUADRO DE DETALHAMENTO DA DESPESA DA LOA (V35, onda A2) ═══
 *
 * Numa instalação real, o orçamento aprovado já existe — é a lei. Até aqui o sistema só sabia CRIAR ficha a ficha, e
 * nenhum serviço cadastrava órgão, unidade, programa ou ação: só seed e fixture. A carga lê o QDD extraído da própria
 * lei (CSV derivado e conferido contra os totais dela, com o documento de conferência ao lado) e:
 *
 *   1. confere TUDO antes de gravar: componentes coerentes (a unidade é do órgão), programa com nome, função e
 *      subfunção oficiais já carregadas, fonte no cadastro, ficha sem número repetido, valor não negativo;
 *   2. cadastra o que falta da estrutura (órgão, unidade, programa, ação, natureza) — nada que já exista é regravado;
 *   3. cria cada ficha pelo serviço de sempre (`criarFicha`), que lança a dotação inicial no razão.
 *
 * ⚠️ IDEMPOTENTE e sem sobrescrever: a ficha que já existe com a mesma classificação e o mesmo valor é contada como
 * existente; com qualquer diferença, é DIVERGÊNCIA nomeada e nada nela muda (correção de orçamento aprovado é crédito
 * adicional ou realocação, nunca carga).
 *
 * ⚠️ O TIPO DA AÇÃO pelo primeiro dígito do código, a convenção do Manual Técnico de Orçamento que a lei segue:
 * 0 operação especial; ímpar projeto; par atividade; 9 reserva (operação especial).
 */

export interface LinhaDoQdd {
  readonly orgao: string;
  readonly unidade: string;
  readonly descricaoUnidade: string;
  readonly funcao: string;
  readonly subfuncao: string;
  readonly programa: string;
  readonly acao: string;
  readonly descricaoAcao: string;
  readonly natureza: string;
  readonly fonte: string;
  readonly valor: string;
  readonly ficha: number;
}

/** Lê o CSV derivado (`;`, cabeçalho com os nomes das colunas). Recusa coluna ausente e linha malformada. */
export function lerQdd(csv: string): readonly LinhaDoQdd[] {
  const linhas = csv.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  const cab = linhas[0]?.split(";") ?? [];
  const col = (nome: string): number => {
    const i = cab.indexOf(nome);
    if (i < 0) throw new Error(`O QDD não tem a coluna "${nome}".`);
    return i;
  };
  const c = {
    orgao: col("orgao"), unidade: col("unidade_orcamentaria"), du: col("descricao_unidade"), funcao: col("funcao"),
    subfuncao: col("subfuncao"), programa: col("programa"), acao: col("acao"), da: col("descricao_acao"),
    natureza: col("natureza_despesa"), fonte: col("fonte"), valor: col("valor"), ficha: col("ficha"),
  };
  return linhas.slice(1).map((l, i) => {
    const x = l.split(";");
    const v = (k: number): string => (x[k] ?? "").trim();
    const linha: LinhaDoQdd = {
      orgao: v(c.orgao), unidade: v(c.unidade), descricaoUnidade: v(c.du), funcao: v(c.funcao), subfuncao: v(c.subfuncao),
      programa: v(c.programa), acao: v(c.acao), descricaoAcao: v(c.da), natureza: v(c.natureza), fonte: v(c.fonte),
      valor: v(c.valor), ficha: Number(v(c.ficha)),
    };
    const forma =
      /^\d{2}$/.test(linha.orgao) && /^\d{5}$/.test(linha.unidade) && /^\d{2}$/.test(linha.funcao) && /^\d{3}$/.test(linha.subfuncao) &&
      /^\d{4}$/.test(linha.programa) && /^\d{4}$/.test(linha.acao) && /^\d{6}$/.test(linha.natureza) && /^\d{3}$/.test(linha.fonte) &&
      /^\d+\.\d{2}$/.test(linha.valor) && Number.isInteger(linha.ficha) && linha.ficha > 0;
    if (!forma) throw new Error(`Linha ${String(i + 2)} do QDD malformada: "${l}".`);
    return linha;
  });
}

export function tipoDaAcao(codigo: string): "PROJETO" | "ATIVIDADE" | "OPERACAO_ESPECIAL" {
  const d = Number(codigo[0]);
  if (d === 0 || d === 9) return "OPERACAO_ESPECIAL";
  return d % 2 === 1 ? "PROJETO" : "ATIVIDADE";
}

/** A natureza 6 dígitos montada pelo rol oficial; a reserva de contingência (categoria 9) pela Portaria 163, art. 8º. */
function naturezaParaCadastro(codigo: string) {
  const [categoria, grupo, modalidade, elemento] = [codigo.slice(0, 1), codigo.slice(1, 2), codigo.slice(2, 4), codigo.slice(4, 6)];
  if (categoria === "9") {
    return {
      codCategoria: categoria, codNatureza: grupo, codModalidade: modalidade, codElemento: elemento, codigoCompleto: codigo,
      descricao: "Reserva de Contingência", mapeamentoStn: codigo,
    };
  }
  return montarNatureza({ categoria, grupo, modalidade, elemento });
}

// ═══ A RECEITA PREVISTA DA LOA ═══

export interface LinhaDaReceita {
  readonly natureza: string;
  readonly fonte: string;
  readonly valor: string;
  readonly deducao: string;
  readonly tipoDeducao: string;
  readonly naturezaLei: string;
}

/** Lê o CSV derivado da receita (`;`, aspas duplas na descrição). */
export function lerReceitaDaLoa(csv: string): readonly LinhaDaReceita[] {
  const linhas = csv.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  const campos = (l: string): string[] => {
    const out: string[] = [];
    let atual = "";
    let aspas = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i]!;
      if (aspas) {
        if (ch === '"' && l[i + 1] === '"') { atual += '"'; i++; }
        else if (ch === '"') aspas = false;
        else atual += ch;
      } else if (ch === '"') aspas = true;
      else if (ch === ";") { out.push(atual); atual = ""; }
      else atual += ch;
    }
    out.push(atual);
    return out;
  };
  const cab = campos(linhas[0] ?? "");
  const col = (n: string): number => {
    const i = cab.indexOf(n);
    if (i < 0) throw new Error(`A receita não tem a coluna "${n}".`);
    return i;
  };
  const c = { natureza: col("natureza"), fonte: col("fonte"), valor: col("valor"), deducao: col("deducao"), tipo: col("tipo_deducao"), lei: col("natureza_lei") };
  return linhas.slice(1).map((l, i) => {
    const x = campos(l);
    const r: LinhaDaReceita = {
      natureza: (x[c.natureza] ?? "").trim(), fonte: (x[c.fonte] ?? "").trim(), valor: (x[c.valor] ?? "").trim(),
      deducao: (x[c.deducao] ?? "").trim(), tipoDeducao: (x[c.tipo] ?? "").trim(), naturezaLei: (x[c.lei] ?? "").trim(),
    };
    if (!/^\d{8}$/.test(r.natureza) || !/^\d{3}$/.test(r.fonte) || !/^\d+\.\d{2}$/.test(r.valor) || !/^\d+\.\d{2}$/.test(r.deducao)) {
      throw new Error(`Linha ${String(i + 2)} da receita malformada: "${l}".`);
    }
    return r;
  });
}

export interface ResultadoDaCargaDaReceita {
  readonly naturezasCadastradas: number;
  readonly previsoesCriadas: number;
  readonly previsoesJaExistentes: number;
  readonly divergentes: readonly string[];
  readonly semValor: readonly string[];
  readonly totalBruto: string;
  readonly totalDeducoes: string;
}

/**
 * Carrega a receita prevista da LOA: a receita bruta por natureza e fonte (ORCAMENTARIA, ou INTRA_ORCAMENTARIA nas
 * categorias 7 e 8) e a dedução como linha própria (DEDUCAO, com o tipo da dedução do Tribunal). Linhas da lei com o
 * mesmo código de 8 dígitos e a mesma fonte (desdobramentos que a lei imprime em separado) são somadas numa previsão,
 * e o documento cita cada código da lei. Natureza fora do cadastro entra pelo ementário oficial. Tudo conferido
 * antes de gravar; nada que já exista é regravado.
 */
export async function carregarReceitaDaLoa(
  prisma: PrismaClient,
  input: {
    readonly exercicio: number;
    readonly linhas: readonly LinhaDaReceita[];
    readonly descricaoOficial: (codigo: string) => string | null;
    readonly documento: string;
    readonly criadoPor: string;
  }
): Promise<ResultadoDaCargaDaReceita> {
  const { exercicio, criadoPor } = input;
  await autorizarNo(prisma, criadoPor, ACAO_DO_SERVICO.carregarReceitaDaLoa, "ENTE");

  type Previsao = { natureza: string; fonte: string; tipo: "ORCAMENTARIA" | "INTRA_ORCAMENTARIA" | "DEDUCAO"; valor: Money; tipoDeducao: string | null; codigosDaLei: string[] };
  const porChave = new Map<string, Previsao>();
  const semValor: string[] = [];
  let totalBruto = toMoney("0.00");
  let totalDeducoes = toMoney("0.00");
  const somar = (natureza: string, fonte: string, tipo: Previsao["tipo"], valor: Money, tipoDeducao: string | null, lei: string): void => {
    const k = `${natureza}|${fonte}|${tipo}`;
    const p = porChave.get(k) ?? { natureza, fonte, tipo, valor: toMoney("0.00"), tipoDeducao, codigosDaLei: [] };
    if (p.tipoDeducao !== tipoDeducao) throw new Error(`A dedução ${natureza}/${fonte} aparece com dois tipos na lei. Nada foi gravado.`);
    p.valor = toMoney(p.valor.plus(valor));
    if (!p.codigosDaLei.includes(lei)) p.codigosDaLei.push(lei);
    porChave.set(k, p);
  };
  for (const l of input.linhas) {
    const bruto = toMoney(l.valor);
    const deducao = toMoney(l.deducao);
    totalBruto = toMoney(totalBruto.plus(bruto));
    totalDeducoes = toMoney(totalDeducoes.plus(deducao));
    if (bruto.isZero() && deducao.isZero()) {
      semValor.push(`${l.naturezaLei}/${l.fonte}`);
      continue;
    }
    const intra = l.natureza[0] === "7" || l.natureza[0] === "8";
    if (!bruto.isZero()) somar(l.natureza, l.fonte, intra ? "INTRA_ORCAMENTARIA" : "ORCAMENTARIA", bruto, null, l.naturezaLei);
    if (!deducao.isZero()) {
      if (!/^[345]$/.test(l.tipoDeducao)) throw new Error(`A dedução ${l.naturezaLei}/${l.fonte} não tem o tipo do Tribunal (3, 4 ou 5). Nada foi gravado.`);
      somar(l.natureza, l.fonte, "DEDUCAO", deducao, l.tipoDeducao, l.naturezaLei);
    }
  }

  // ── tudo conferido antes de gravar ──
  const previsoes = [...porChave.values()];
  const naturezas = [...new Set(previsoes.map((p) => p.natureza))];
  const fontes = [...new Set(previsoes.map((p) => p.fonte))];
  const [natCad, fonCad] = await Promise.all([
    prisma.naturezaReceita.findMany({ where: { codigo: { in: naturezas } }, select: { codigo: true } }),
    prisma.fonteRecurso.findMany({ where: { codigo: { in: fontes } }, select: { codigo: true } }),
  ]);
  const temNat = new Set(natCad.map((n) => n.codigo));
  const temFonte = new Set(fonCad.map((f) => f.codigo));
  const erros: string[] = [];
  const novas = naturezas.filter((n) => !temNat.has(n));
  for (const n of novas) if (input.descricaoOficial(n) === null) erros.push(`natureza ${n} fora do ementário oficial`);
  const fontesAusentes = fontes.filter((f) => !temFonte.has(f));
  if (fontesAusentes.length > 0) erros.push(`fonte fora do cadastro (carregue a tabela oficial de fontes antes): ${fontesAusentes.join(", ")}`);
  if (erros.length > 0) throw new Error(`A receita da LOA não foi carregada; nada foi gravado. ${erros.join("; ")}.`);

  for (const n of novas) await cadastrarNaturezaReceita(prisma, { codigo: n, descricao: input.descricaoOficial(n)!, criadoPor });

  const existentes = await prisma.receitaPrevista.findMany({
    where: { exercicio, exercicioFonte: 1, naturezaReceita: { codigo: { in: naturezas } } },
    select: { valorPrevisto: true, tipoReceita: true, naturezaReceita: { select: { codigo: true } }, fonte: { select: { codigo: true } } },
  });
  const deps = criarM02Deps(prisma);
  let previsoesCriadas = 0;
  let previsoesJaExistentes = 0;
  const divergentes: string[] = [];
  for (const p of previsoes) {
    const ja = existentes.find((e) => e.naturezaReceita.codigo === p.natureza && e.fonte.codigo === p.fonte && e.tipoReceita === p.tipo);
    if (ja !== undefined) {
      if (toMoney(ja.valorPrevisto.toFixed(2)).equals(p.valor)) previsoesJaExistentes++;
      else divergentes.push(`${p.tipo} ${p.natureza}/${p.fonte}: no cadastro ${ja.valorPrevisto.toFixed(2)}, na lei ${p.valor.toFixed(2)}`);
      continue;
    }
    const id = await criarReceitaPrevista(
      { exercicio, naturezaReceita: p.natureza, fonte: p.fonte, exercicioFonte: 1, tipoReceita: p.tipo, valorPrevisto: p.valor.toFixed(2), criadoPor },
      deps
    );
    await detalharReceitaPrevista(prisma, {
      receitaPrevistaId: id,
      tipoDeducaoSagres: p.tipoDeducao as "3" | "4" | "5" | null,
      codigoNoDocumento: p.codigosDaLei[0] ?? null,
      documento: p.codigosDaLei.length > 1 ? `${input.documento} (soma dos códigos ${p.codigosDaLei.join(", ")})` : input.documento,
      criadoPor,
    });
    previsoesCriadas++;
  }
  return {
    naturezasCadastradas: novas.length, previsoesCriadas, previsoesJaExistentes, divergentes, semValor,
    totalBruto: totalBruto.toFixed(2), totalDeducoes: totalDeducoes.toFixed(2),
  };
}

export interface ResultadoDaCargaDaLoa {
  readonly cadastrados: { readonly orgaos: number; readonly unidades: number; readonly programas: number; readonly acoes: number; readonly naturezas: number };
  readonly fichasCriadas: number;
  readonly fichasJaExistentes: number;
  readonly divergentes: readonly string[];
  readonly totalCarregado: string;
}

export async function carregarQddDaLoa(
  prisma: PrismaClient,
  input: {
    readonly exercicio: number;
    readonly linhas: readonly LinhaDoQdd[];
    readonly orgaos: ReadonlyMap<string, string>;
    readonly programas: ReadonlyMap<string, string>;
    readonly criadoPor: string;
  }
): Promise<ResultadoDaCargaDaLoa> {
  const { linhas, exercicio, criadoPor } = input;
  await autorizarNo(prisma, criadoPor, ACAO_DO_SERVICO.carregarQddDaLoa, "ENTE");

  // ── 1. TUDO CONFERIDO ANTES DE GRAVAR ──
  const erros: string[] = [];
  const numeros = new Set<number>();
  for (const l of linhas) {
    if (numeros.has(l.ficha)) erros.push(`ficha ${String(l.ficha)} repetida no QDD`);
    numeros.add(l.ficha);
    if (!l.unidade.startsWith(l.orgao)) erros.push(`ficha ${String(l.ficha)}: a unidade ${l.unidade} não é do órgão ${l.orgao}`);
    if (!input.programas.has(l.programa)) erros.push(`programa ${l.programa} sem nome na lei`);
    if (!input.orgaos.has(l.orgao)) erros.push(`órgão ${l.orgao} sem nome na lei`);
  }
  const unico = <T,>(xs: readonly T[]): T[] => [...new Set(xs)];
  const [funcoes, subfuncoes, fontes] = await Promise.all([
    prisma.funcao.findMany({ where: { codigo: { in: unico(linhas.map((l) => l.funcao)) } }, select: { codigo: true } }),
    prisma.subfuncao.findMany({ where: { codigo: { in: unico(linhas.map((l) => l.subfuncao)) } }, select: { codigo: true } }),
    prisma.fonteRecurso.findMany({ where: { codigo: { in: unico(linhas.map((l) => l.fonte)) } }, select: { codigo: true } }),
  ]);
  const falta = (todos: readonly string[], achados: readonly { codigo: string }[], nome: string): void => {
    const tem = new Set(achados.map((a) => a.codigo));
    const ausentes = unico(todos).filter((c) => !tem.has(c));
    if (ausentes.length > 0) erros.push(`${nome} fora do cadastro oficial: ${ausentes.join(", ")}`);
  };
  falta(linhas.map((l) => l.funcao), funcoes, "função");
  falta(linhas.map((l) => l.subfuncao), subfuncoes, "subfunção");
  falta(linhas.map((l) => l.fonte), fontes, "fonte (carregue a tabela oficial de fontes antes)");
  const unidadesExistentes = await prisma.unidadeOrcamentaria.findMany({ where: { codigo: { in: unico(linhas.map((l) => l.unidade)) } }, select: { codigo: true, orgao: { select: { codigo: true } } } });
  for (const u of unidadesExistentes) {
    const l = linhas.find((x) => x.unidade === u.codigo)!;
    if (u.orgao.codigo !== l.orgao) erros.push(`a unidade ${u.codigo} já está cadastrada no órgão ${u.orgao.codigo}, e a lei a põe no ${l.orgao}`);
  }
  for (const n of unico(linhas.map((l) => l.natureza))) {
    try {
      naturezaParaCadastro(n);
    } catch (e) {
      erros.push(e instanceof Error ? e.message : String(e));
    }
  }
  if (erros.length > 0) throw new Error(`O QDD não foi carregado; nada foi gravado. ${erros.join("; ")}.`);

  // ── 2. A ESTRUTURA QUE FALTA ──
  const cad = { orgaos: 0, unidades: 0, programas: 0, acoes: 0, naturezas: 0 };
  const orgaoId = new Map<string, string>();
  for (const codigo of unico(linhas.map((l) => l.orgao))) {
    const o = await prisma.orgao.findUnique({ where: { codigo }, select: { id: true } });
    if (o !== null) orgaoId.set(codigo, o.id);
    else {
      orgaoId.set(codigo, (await prisma.orgao.create({ data: { codigo, nome: input.orgaos.get(codigo)! }, select: { id: true } })).id);
      cad.orgaos++;
    }
  }
  const existentesU = new Set(unidadesExistentes.map((u) => u.codigo));
  for (const codigo of unico(linhas.map((l) => l.unidade))) {
    if (existentesU.has(codigo)) continue;
    const l = linhas.find((x) => x.unidade === codigo)!;
    await prisma.unidadeOrcamentaria.create({ data: { codigo, descricao: l.descricaoUnidade, orgaoId: orgaoId.get(l.orgao)! } });
    cad.unidades++;
  }
  const programasExistentes = new Set((await prisma.programa.findMany({ select: { codigo: true } })).map((p) => p.codigo));
  for (const codigo of unico(linhas.map((l) => l.programa))) {
    if (programasExistentes.has(codigo)) continue;
    await prisma.programa.create({ data: { codigo, descricao: input.programas.get(codigo)! } });
    cad.programas++;
  }
  const acoesExistentes = new Set((await prisma.acao.findMany({ select: { codigo: true } })).map((a) => a.codigo));
  for (const codigo of unico(linhas.map((l) => l.acao))) {
    if (acoesExistentes.has(codigo)) continue;
    const l = linhas.find((x) => x.acao === codigo)!;
    await prisma.acao.create({ data: { codigo, descricao: l.descricaoAcao, tipo: tipoDaAcao(codigo) } });
    cad.acoes++;
  }
  const naturezasExistentes = new Set((await prisma.naturezaDespesa.findMany({ select: { codigoCompleto: true } })).map((n) => n.codigoCompleto));
  for (const codigo of unico(linhas.map((l) => l.natureza))) {
    if (naturezasExistentes.has(codigo)) continue;
    await prisma.naturezaDespesa.create({ data: naturezaParaCadastro(codigo) });
    cad.naturezas++;
  }

  // ── 3. AS FICHAS, PELO SERVIÇO DE SEMPRE ──
  const fichasExistentes = new Map(
    (
      await prisma.fichaOrcamentaria.findMany({
        where: { exercicio, numero: { in: [...numeros] } },
        select: {
          numero: true, valorDotado: true,
          unidadeOrc: { select: { codigo: true } }, funcao: { select: { codigo: true } }, subfuncao: { select: { codigo: true } },
          programa: { select: { codigo: true } }, acao: { select: { codigo: true } }, naturezaDespesa: { select: { codigoCompleto: true } },
          fonte: { select: { codigo: true } },
        },
      })
    ).map((f) => [f.numero, f])
  );
  const deps = criarM02Deps(prisma);
  let fichasCriadas = 0;
  let fichasJaExistentes = 0;
  const divergentes: string[] = [];
  let total = toMoney("0.00");
  for (const l of linhas) {
    const ja = fichasExistentes.get(l.ficha);
    if (ja !== undefined) {
      const igual =
        ja.unidadeOrc.codigo === l.unidade && ja.funcao.codigo === l.funcao && ja.subfuncao.codigo === l.subfuncao &&
        ja.programa.codigo === l.programa && ja.acao.codigo === l.acao && ja.naturezaDespesa.codigoCompleto === l.natureza &&
        ja.fonte.codigo === l.fonte && toMoney(ja.valorDotado.toFixed(2)).equals(toMoney(l.valor));
      if (igual) fichasJaExistentes++;
      else divergentes.push(`ficha ${String(l.ficha)} já existe com outra classificação ou valor`);
      continue;
    }
    await criarFicha(
      {
        exercicio,
        numero: l.ficha,
        classificacao: {
          orgao: l.orgao, unidadeOrc: l.unidade, funcao: l.funcao, subfuncao: l.subfuncao, programa: l.programa,
          acao: l.acao, naturezaDespesa: l.natureza, fonte: l.fonte,
        },
        exercicioFonte: 1,
        valorDotado: l.valor,
        criadoPor,
      },
      deps
    );
    fichasCriadas++;
    total = toMoney(total.plus(l.valor));
  }
  return { cadastrados: cad, fichasCriadas, fichasJaExistentes, divergentes, totalCarregado: total.toFixed(2) };
}
