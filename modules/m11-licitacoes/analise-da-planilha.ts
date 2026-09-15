import { Decimal, sumMoney, toMoney } from "../../packages/contracts/index.js";
import type { AbaLida, CelulaLida } from "../../packages/planilha/index.js";

/**
 * ═══ M11 — A ANÁLISE DA PLANILHA ORÇAMENTÁRIA DA OBRA (V7 M2 U6) — PURA ═══
 *
 * Recebe a grade lida do arquivo (`packages/planilha`: valores gravados, fórmula marcada e nunca executada) e devolve a
 * PRÉVIA: colunas reconhecidas, itens com grupo e nível, ERROS por linha (bloqueiam a confirmação) e DIVERGÊNCIAS de
 * conciliação (exigem ciência expressa para confirmar). Nenhum valor é "corrigido": o que diverge aparece com o valor do
 * arquivo e o calculado lado a lado.
 *
 * ⚠️ O VALOR DO SERVIÇO É CALCULADO AQUI: quantidade × preço unitário, arredondado uma vez por linha (meio para cima,
 * a regra do `toMoney`). O total do arquivo por linha é guardado como `valorNoArquivo` para a conciliação — um arquivo
 * que trunca em vez de arredondar aparece como divergência de centavos, não some.
 * ⚠️ HIERARQUIA PELO CÓDIGO: "1.2.3" pertence a "1.2", que precisa existir ANTES como grupo. Código repetido, pai
 * ausente, serviço com subitens: erro na linha.
 * ⚠️ A PLANILHA NÃO É O CONTRATO. Nada aqui cria, altera ou identifica item de contrato.
 */

export type CampoDaPlanilha = "codigo" | "referencia" | "descricao" | "unidade" | "quantidade" | "precoUnitario" | "total";
export type Mapeamento = Readonly<Partial<Record<CampoDaPlanilha, number>>>;

export interface ItemAnalisado {
  readonly linha: number;
  readonly codigo: string;
  readonly codigoDoPai: string | null;
  readonly nivel: number;
  readonly tipo: "GRUPO" | "SERVICO";
  readonly referencia: string | null;
  readonly descricao: string;
  readonly unidade: string | null;
  readonly quantidade: string | null;
  readonly precoUnitario: string | null;
  readonly valor: string;
  readonly valorNoArquivo: string | null;
  readonly comFormula: boolean;
}

export interface OcorrenciaDaLinha { readonly linha: number; readonly codigo: string | null; readonly mensagem: string }

export interface AnaliseDaPlanilha {
  readonly aba: string;
  readonly linhaDoCabecalho: number;
  readonly mapeamento: Mapeamento;
  readonly itens: readonly ItemAnalisado[];
  readonly erros: readonly OcorrenciaDaLinha[];
  readonly divergencias: readonly OcorrenciaDaLinha[];
  readonly ignoradas: readonly OcorrenciaDaLinha[];
  readonly totalCalculado: string;
  readonly totalDeclarado: string | null;
  readonly celulasComFormula: number;
  readonly macros: boolean;
}

const RE_CABECALHO: Readonly<Record<CampoDaPlanilha, RegExp>> = {
  codigo: /^(item|itens|c[óo]d(igo)?\.?|n[º°o]\.?)$/i,
  referencia: /refer[êe]ncia|fonte|banco|c[óo]d(igo)?\.?\s*(sinapi|sicro|orse|seinfra|composi)/i,
  descricao: /descri/i,
  unidade: /^(unid(ade)?|und|un)\.?$/i,
  quantidade: /^(quant(idade)?|qtd[e]?|qte)\.?$/i,
  precoUnitario: /(pre[çc]o|valor|custo)\s*unit/i,
  total: /(pre[çc]o|valor|custo)\s*total|^total$/i,
};

const texto = (c: CelulaLida | undefined): string => (c?.valor ?? "").replace(/\s+/g, " ").trim();
const letra = (col: number): string => { let s = ""; let n = col + 1; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };

/** Número de célula: o gravado pelo arquivo ("1234.5"), ou texto brasileiro ("1.234,50", "R$ 12,00"). `null` se não for número. */
export function numeroDaCelula(bruto: string): Decimal | null {
  const s = bruto.replace(/R\$/gi, "").replace(/\s/g, "");
  if (s === "") return null;
  if (/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(s) || /^-?\d+,\d+$/.test(s)) return new Decimal(s.replace(/\./g, "").replace(",", "."));
  if (/^-?\d+(\.\d+)?([eE]-?\d+)?$/.test(s)) return new Decimal(s);
  return null;
}

function detectarMapeamento(aba: AbaLida): { readonly linha: number; readonly mapeamento: Mapeamento } | null {
  const indices = [...aba.linhas.keys()].sort((a, b) => a - b).slice(0, 40);
  for (const l of indices) {
    const linha = aba.linhas.get(l)!;
    const m: Partial<Record<CampoDaPlanilha, number>> = {};
    const candidatosUnit: number[] = [];
    const candidatosTotal: number[] = [];
    for (const [col, cel] of [...linha.entries()].sort((a, b) => a[0] - b[0])) {
      const t = texto(cel);
      if (t === "") continue;
      if (RE_CABECALHO.precoUnitario.test(t)) { candidatosUnit.push(col); continue; }
      if (RE_CABECALHO.total.test(t)) { candidatosTotal.push(col); continue; }
      // "Item" e "Código" lado a lado: o primeiro é a numeração da planilha; o segundo, a referência (composição, tabela).
      if (m.codigo !== undefined && m.referencia === undefined && RE_CABECALHO.codigo.test(t) && !/^item/i.test(t)) { m.referencia = col; continue; }
      for (const campo of ["codigo", "referencia", "descricao", "unidade", "quantidade"] as const) {
        if (m[campo] === undefined && RE_CABECALHO[campo].test(t)) { m[campo] = col; break; }
      }
    }
    // Havendo "sem BDI" e "com BDI", vale o COM BDI (o preço que o contrato paga); sem essa marca, a primeira coluna.
    const preferirComBdi = (cols: readonly number[]): number => cols.find((c) => /com\s*bdi/i.test(texto(linha.get(c)))) ?? cols.find((c) => !/sem\s*bdi/i.test(texto(linha.get(c)))) ?? cols[0]!;
    if (candidatosUnit.length > 0) m.precoUnitario = preferirComBdi(candidatosUnit);
    if (candidatosTotal.length > 0) m.total = preferirComBdi(candidatosTotal);
    if (m.codigo !== undefined && m.descricao !== undefined && m.unidade !== undefined && m.quantidade !== undefined && m.precoUnitario !== undefined) {
      return { linha: l, mapeamento: m };
    }
  }
  return null;
}

/**
 * Analisa a aba. `informado` (colunas 0-based e a linha do cabeçalho como a pessoa vê, 1 = primeira) substitui a detecção — é o caminho quando o
 * cabeçalho do arquivo não usa os nomes reconhecidos.
 */
export function analisarPlanilha(aba: AbaLida, macros: boolean, informado?: { readonly linhaDoCabecalho: number; readonly mapeamento: Mapeamento }): AnaliseDaPlanilha | { readonly semCabecalho: string } {
  const achado = informado ?? detectarMapeamento(aba);
  if (achado === null) {
    return { semCabecalho: `Não encontrei, nas primeiras 40 linhas da aba "${aba.nome}", um cabeçalho com item, descrição, unidade, quantidade e preço unitário. Informe as colunas.` };
  }
  // O cabeçalho informado vem como a pessoa vê (linha 1 = primeira); a grade é 0-based.
  const { linha: linhaDoCabecalho, mapeamento } = "linhaDoCabecalho" in achado ? { linha: achado.linhaDoCabecalho - 1, mapeamento: achado.mapeamento } : achado;
  const col = (campo: CampoDaPlanilha): number | undefined => mapeamento[campo];
  const cel = (l: ReadonlyMap<number, CelulaLida>, campo: CampoDaPlanilha): CelulaLida | undefined => { const c = col(campo); return c === undefined ? undefined : l.get(c); };

  const erros: OcorrenciaDaLinha[] = [];
  const divergencias: OcorrenciaDaLinha[] = [];
  const ignoradas: OcorrenciaDaLinha[] = [];
  const brutos: (Omit<ItemAnalisado, "valor" | "tipo"> & { tipoLido: "GRUPO" | "SERVICO"; valorServico: Decimal | null })[] = [];
  let totalDeclarado: Decimal | null = null;
  let celulasComFormula = 0;

  for (const l of [...aba.linhas.keys()].filter((x) => x > linhaDoCabecalho).sort((a, b) => a - b)) {
    const linha = aba.linhas.get(l)!;
    const n = l + 1; // a linha como a pessoa vê no programa de planilha
    for (const c of linha.values()) if (c.formula) celulasComFormula += 1;
    const codigoBruto = texto(cel(linha, "codigo")).replace(/\.$/, "");
    const descricao = texto(cel(linha, "descricao"));
    const unidade = texto(cel(linha, "unidade"));
    const qtdCel = cel(linha, "quantidade");
    const precoCel = cel(linha, "precoUnitario");
    const totalCel = cel(linha, "total");
    const formulaSemValor = [qtdCel, precoCel, totalCel].some((c) => c !== undefined && c.formula && c.valor === "");

    if (!/^\d+(\.\d+)*$/.test(codigoBruto)) {
      const todas = [...linha.values()].map(texto).filter((t) => t !== "");
      if (todas.length === 0) continue;
      const totalNum = totalCel === undefined ? null : numeroDaCelula(texto(totalCel));
      if (todas.some((t) => /total/i.test(t)) && totalNum !== null) { totalDeclarado = totalNum; continue; }
      ignoradas.push({ linha: n, codigo: codigoBruto === "" ? null : codigoBruto, mensagem: `linha sem código de item, não importada: "${todas.join(" | ").slice(0, 120)}"` });
      continue;
    }
    if (formulaSemValor) erros.push({ linha: n, codigo: codigoBruto, mensagem: "fórmula sem valor gravado no arquivo (abra no programa de planilha, recalcule e salve)" });
    if (descricao === "") erros.push({ linha: n, codigo: codigoBruto, mensagem: "item sem descrição" });

    const partes = codigoBruto.split(".");
    const codigoDoPai = partes.length > 1 ? partes.slice(0, -1).join(".") : null;
    const temQuantidadeOuUnidade = unidade !== "" || texto(qtdCel) !== "" || texto(precoCel) !== "";
    const valorNoArquivo = totalCel === undefined || texto(totalCel) === "" ? null : numeroDaCelula(texto(totalCel));
    if (!temQuantidadeOuUnidade) {
      brutos.push({ linha: n, codigo: codigoBruto, codigoDoPai, nivel: partes.length, tipoLido: "GRUPO", referencia: texto(cel(linha, "referencia")) || null, descricao, unidade: null, quantidade: null, precoUnitario: null, valorNoArquivo: valorNoArquivo?.toFixed(2) ?? null, comFormula: [...linha.values()].some((c) => c.formula), valorServico: null });
      continue;
    }
    const q = numeroDaCelula(texto(qtdCel));
    const p = numeroDaCelula(texto(precoCel));
    if (unidade === "") erros.push({ linha: n, codigo: codigoBruto, mensagem: "serviço sem unidade" });
    if (q === null || q.lt(0)) erros.push({ linha: n, codigo: codigoBruto, mensagem: `quantidade inválida ("${texto(qtdCel)}")` });
    if (p === null || p.lt(0)) erros.push({ linha: n, codigo: codigoBruto, mensagem: `preço unitário inválido ("${texto(precoCel)}")` });
    if (q !== null && q.decimalPlaces() > 4) erros.push({ linha: n, codigo: codigoBruto, mensagem: `quantidade com mais de 4 casas decimais (${q.toString()})` });
    if (p !== null && p.decimalPlaces() > 4) erros.push({ linha: n, codigo: codigoBruto, mensagem: `preço unitário com mais de 4 casas decimais (${p.toString()})` });
    const valorServico = q !== null && p !== null && q.gte(0) && p.gte(0) ? toMoney(q.times(p)) : null;
    if (valorServico !== null && valorNoArquivo !== null && !valorServico.eq(valorNoArquivo.toFixed(2))) {
      divergencias.push({ linha: n, codigo: codigoBruto, mensagem: `total da linha no arquivo ${valorNoArquivo.toFixed(2)}, quantidade × preço unitário = ${valorServico.toFixed(2)}` });
    }
    brutos.push({ linha: n, codigo: codigoBruto, codigoDoPai, nivel: partes.length, tipoLido: "SERVICO", referencia: texto(cel(linha, "referencia")) || null, descricao, unidade: unidade || null, quantidade: q?.toFixed(4) ?? null, precoUnitario: p?.toFixed(4) ?? null, valorNoArquivo: valorNoArquivo?.toFixed(2) ?? null, comFormula: [...linha.values()].some((c) => c.formula), valorServico });
  }

  const porCodigo = new Map<string, (typeof brutos)[number]>();
  for (const b of brutos) {
    if (porCodigo.has(b.codigo)) { erros.push({ linha: b.linha, codigo: b.codigo, mensagem: `código repetido (já usado na linha ${porCodigo.get(b.codigo)!.linha})` }); continue; }
    if (b.codigoDoPai !== null) {
      const pai = porCodigo.get(b.codigoDoPai);
      if (pai === undefined) erros.push({ linha: b.linha, codigo: b.codigo, mensagem: `o grupo ${b.codigoDoPai} não aparece antes deste item` });
      else if (pai.tipoLido === "SERVICO") erros.push({ linha: b.linha, codigo: b.codigo, mensagem: `o item ${b.codigoDoPai} é serviço (tem unidade e quantidade) e não pode ter subitens` });
    }
    porCodigo.set(b.codigo, b);
  }

  // Valor do grupo = soma dos serviços abaixo dele (em qualquer nível). Grupo sem serviço: erro.
  const servicos = brutos.filter((b) => b.tipoLido === "SERVICO");
  const itens: ItemAnalisado[] = brutos.map((b) => {
    const { tipoLido, valorServico, ...resto } = b;
    if (tipoLido === "SERVICO") return { ...resto, tipo: "SERVICO", valor: (valorServico ?? toMoney(0)).toFixed(2) };
    const filhos = servicos.filter((s) => s.codigo.startsWith(`${b.codigo}.`));
    if (filhos.length === 0) erros.push({ linha: b.linha, codigo: b.codigo, mensagem: "grupo sem nenhum serviço abaixo dele" });
    const valor = sumMoney(filhos.map((s) => s.valorServico ?? toMoney(0)));
    if (b.valorNoArquivo !== null && !valor.eq(b.valorNoArquivo)) divergencias.push({ linha: b.linha, codigo: b.codigo, mensagem: `total do grupo no arquivo ${b.valorNoArquivo}, soma dos serviços = ${valor.toFixed(2)}` });
    return { ...resto, tipo: "GRUPO", valor: valor.toFixed(2) };
  });
  if (servicos.length === 0) erros.push({ linha: linhaDoCabecalho + 1, codigo: null, mensagem: "nenhum serviço com código, unidade, quantidade e preço abaixo do cabeçalho" });
  const totalCalculado = sumMoney(servicos.map((s) => s.valorServico ?? toMoney(0)));
  if (totalDeclarado !== null && !totalCalculado.eq(totalDeclarado.toFixed(2))) {
    divergencias.push({ linha: 0, codigo: null, mensagem: `total geral no arquivo ${totalDeclarado.toFixed(2)}, soma dos serviços = ${totalCalculado.toFixed(2)}` });
  }
  erros.sort((a, b) => a.linha - b.linha);
  return {
    aba: aba.nome, linhaDoCabecalho: linhaDoCabecalho + 1, mapeamento, itens, erros, divergencias, ignoradas,
    totalCalculado: totalCalculado.toFixed(2), totalDeclarado: totalDeclarado?.toFixed(2) ?? null, celulasComFormula, macros,
  };
}

/** O mapeamento em letras de coluna, para mostrar ("descrição: C"). */
export function mapeamentoEmLetras(m: Mapeamento): Readonly<Partial<Record<CampoDaPlanilha, string>>> {
  return Object.fromEntries(Object.entries(m).filter(([, v]) => v !== undefined).map(([k, v]) => [k, letra(v as number)]));
}

/** "C" → 2. */
export function colunaDaLetra(l: string): number | null {
  const s = l.trim().toUpperCase();
  if (!/^[A-Z]{1,3}$/.test(s)) return null;
  let n = 0;
  for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
