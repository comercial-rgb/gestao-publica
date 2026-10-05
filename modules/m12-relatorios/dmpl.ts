import { Decimal } from "../../packages/contracts/index.js";
import { fimDoDiaCivil, inicioDoDiaCivil } from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";

/**
 * V35 — DEMONSTRAÇÃO DAS MUTAÇÕES NO PATRIMÔNIO LÍQUIDO (MCASP 11ª ed., Parte V, item 7). LEITURA PURA.
 *
 * "A DMPL será elaborada utilizando-se o grupo 3 (patrimônio líquido) da classe 2 (passivo) do PCASP. [...] Nas colunas,
 * são apresentadas as contas contábeis das quais os dados devem ser extraídos, enquanto as linhas delimitam o par de
 * lançamento de tais contas" (7.2). O manual deixa ao ente a FORMA de identificar o par; aqui ela é o próprio razão, por
 * regras escritas e na ordem abaixo — e o movimento que nenhuma regra alcança vai a uma linha de PENDÊNCIA, com o número
 * do lançamento, em vez de ser posto numa linha qualquer.
 *
 * ═══ COLUNAS (7.4 e 7.5) ═══  2.3.1 Patrimônio/Capital Social · 2.3.2 AFAC · 2.3.3 Reservas de Capital · 2.3.4 Ajustes
 * de Avaliação Patrimonial · 2.3.5 Reservas de Lucros · 2.3.6 Demais Reservas · 2.3.7 Resultados Acumulados · 2.3.9
 * Ações/Cotas em Tesouraria (redutora) · Total.
 *
 * ═══ O PAR DO LANÇAMENTO → LINHA, por ordem ═══
 *   0. todas as partidas do lançamento na MESMA coluna do PL (ex.: o superávit do exercício passando a "exercícios
 *      anteriores"): a coluna não muda; não aparece;
 *   1. conta 2.3.7.x.x.03 (Ajustes de Exercícios Anteriores, que "integra a conta Resultados Acumulados", 7.5) → ajustes
 *      de exercícios anteriores;
 *   2. contrapartida nas classes 3 ou 4 (o encerramento das VPA/VPD) → resultado do exercício;
 *   3. coluna 2.3.4 → ajustes de avaliação patrimonial;
 *   4. coluna 2.3.9 → resgate/reemissão de ações e cotas;
 *   5. todas as partidas no PL, com uma reserva (2.3.3, 2.3.5 ou 2.3.6) de um lado → constituição/reversão de reservas;
 *   6. coluna 2.3.1 ou 2.3.2 contra conta fora do PL → aumento de capital (o exemplo do manual: caixa × 2.3.1);
 *   senão → pendência nomeada.
 *
 * ═══ O RESULTADO AINDA NÃO ENCERRADO ═══ Enquanto o exercício não é encerrado, o resultado vive nas classes 3 e 4 — o
 * Balanço Patrimonial o soma ao PL pela mesma razão (A = P + VPA − VPD). Aqui ele entra na coluna Resultados Acumulados:
 * no saldo inicial, o que ficou de antes do exercício; na linha do resultado, o movimento de 3 e 4 dentro do exercício
 * (que, somado ao encerramento da regra 2, dá exatamente VPA − VPD do ano, encerrado ou não).
 *
 * ═══ AMARRAÇÃO ═══ Por coluna, saldo inicial + linhas = saldo final, com o final lido do SALDO das contas (e não da
 * soma das linhas). Se não fechar, a demonstração recusa com a coluna e a diferença.
 */

export const COLUNAS_DA_DMPL = [
  { chave: "PATRIMONIO_SOCIAL", prefixo: "2.3.1.", rotulo: "Patrimônio Social / Capital Social" },
  { chave: "AFAC", prefixo: "2.3.2.", rotulo: "Adiantamento para Futuro Aumento de Capital (AFAC)" },
  { chave: "RESERVAS_DE_CAPITAL", prefixo: "2.3.3.", rotulo: "Reservas de Capital" },
  { chave: "AJUSTES_DE_AVALIACAO", prefixo: "2.3.4.", rotulo: "Ajustes de Avaliação Patrimonial" },
  { chave: "RESERVAS_DE_LUCROS", prefixo: "2.3.5.", rotulo: "Reservas de Lucros" },
  { chave: "DEMAIS_RESERVAS", prefixo: "2.3.6.", rotulo: "Demais Reservas" },
  { chave: "RESULTADOS_ACUMULADOS", prefixo: "2.3.7.", rotulo: "Resultados Acumulados" },
  { chave: "ACOES_EM_TESOURARIA", prefixo: "2.3.9.", rotulo: "Ações / Cotas em Tesouraria" },
] as const;
export type ColunaDaDmpl = (typeof COLUNAS_DA_DMPL)[number]["chave"];

export const LINHAS_DA_DMPL = [
  { chave: "AJUSTES_DE_EXERCICIOS_ANTERIORES", rotulo: "Ajustes de exercícios anteriores" },
  { chave: "AUMENTO_DE_CAPITAL", rotulo: "Aumento de capital" },
  { chave: "RESGATE_REEMISSAO", rotulo: "Resgate / Reemissão de ações e cotas" },
  { chave: "JUROS_SOBRE_CAPITAL_PROPRIO", rotulo: "Juros sobre capital próprio" },
  { chave: "RESULTADO_DO_EXERCICIO", rotulo: "Resultado do exercício" },
  { chave: "AJUSTES_DE_AVALIACAO_PATRIMONIAL", rotulo: "Ajustes de avaliação patrimonial" },
  { chave: "CONSTITUICAO_REVERSAO_DE_RESERVAS", rotulo: "Constituição / Reversão de reservas" },
  { chave: "DIVIDENDOS", rotulo: "Dividendos a distribuir" },
] as const;
export type LinhaDaDmplChave = (typeof LINHAS_DA_DMPL)[number]["chave"] | "SEM_LINHA";

const RESERVAS: readonly ColunaDaDmpl[] = ["RESERVAS_DE_CAPITAL", "RESERVAS_DE_LUCROS", "DEMAIS_RESERVAS"];
const AJUSTE_DE_EXERCICIOS_ANTERIORES = /^2\.3\.7\.\d\.\d\.03\./;

export interface LinhaDaDmpl {
  readonly chave: LinhaDaDmplChave | "SALDOS_INICIAIS" | "SALDOS_FINAIS";
  readonly rotulo: string;
  /** Um valor por coluna, na ordem de `COLUNAS_DA_DMPL`, e o total por último. Aumento do PL positivo. */
  readonly valores: readonly string[];
}

export interface Dmpl {
  readonly exercicio: number;
  readonly colunas: readonly string[];
  readonly linhas: readonly LinhaDaDmpl[];
  /** Os lançamentos que nenhuma regra classificou — a linha "sem linha definida" mostra a soma deles. */
  readonly semLinha: readonly { readonly numeroControle: string; readonly conta: string; readonly valor: string }[];
  readonly notas: readonly string[];
}

export function colunaDaConta(codigo: string): ColunaDaDmpl | null {
  return COLUNAS_DA_DMPL.find((c) => codigo.startsWith(c.prefixo))?.chave ?? null;
}

/** A linha de um movimento no PL, pelas regras 1 a 6 do cabeçalho; `null` quando a regra 0 o tira do quadro. */
export function linhaDoMovimento(conta: string, contasDoLancamento: readonly string[]): LinhaDaDmplChave | null {
  const coluna = colunaDaConta(conta);
  const colunasNoPl = contasDoLancamento.map(colunaDaConta);
  if (colunasNoPl.every((c) => c === coluna)) return null;
  if (AJUSTE_DE_EXERCICIOS_ANTERIORES.test(conta)) return "AJUSTES_DE_EXERCICIOS_ANTERIORES";
  if (contasDoLancamento.some((c) => c.startsWith("3") || c.startsWith("4"))) return "RESULTADO_DO_EXERCICIO";
  if (coluna === "AJUSTES_DE_AVALIACAO") return "AJUSTES_DE_AVALIACAO_PATRIMONIAL";
  if (coluna === "ACOES_EM_TESOURARIA") return "RESGATE_REEMISSAO";
  if (colunasNoPl.every((c) => c !== null) && colunasNoPl.some((c) => c !== null && RESERVAS.includes(c))) return "CONSTITUICAO_REVERSAO_DE_RESERVAS";
  if ((coluna === "PATRIMONIO_SOCIAL" || coluna === "AFAC") && colunasNoPl.some((c) => c === null)) return "AUMENTO_DE_CAPITAL";
  return "SEM_LINHA";
}

type Leitor = Pick<PrismaClient, "partidaContabil">;

/** Saldo credor (crédito − débito) das partidas, por coluna do PL, e o das classes 3 e 4 juntas (VPA − VPD). */
async function saldos(prisma: Leitor, ate: Date, desde?: Date): Promise<{ readonly pl: Map<ColunaDaDmpl, Decimal>; readonly resultado: Decimal }> {
  const data = desde === undefined ? { lte: ate } : { gte: desde, lte: ate };
  const ps = await prisma.partidaContabil.findMany({
    where: { lancamento: { dataTransacao: data }, OR: [{ conta: { codigo: { startsWith: "2.3." } } }, { conta: { codigo: { startsWith: "3" } } }, { conta: { codigo: { startsWith: "4" } } }] },
    select: { tipo: true, valor: true, conta: { select: { codigo: true } } },
  });
  const pl = new Map<ColunaDaDmpl, Decimal>();
  let resultado = new Decimal(0);
  for (const p of ps) {
    const v = p.tipo === "CREDITO" ? new Decimal(p.valor) : new Decimal(p.valor).negated();
    const coluna = colunaDaConta(p.conta.codigo);
    if (coluna !== null) pl.set(coluna, (pl.get(coluna) ?? new Decimal(0)).plus(v));
    else if (!p.conta.codigo.startsWith("2.")) resultado = resultado.plus(v);
  }
  return { pl, resultado };
}

export async function dmpl(prisma: Leitor, input: { readonly exercicio: number }): Promise<Dmpl> {
  const inicio = inicioDoDiaCivil(`${String(input.exercicio)}-01-01`);
  const fim = fimDoDiaCivil(`${String(input.exercicio)}-12-31`);
  const antes = new Date(inicio.getTime() - 1);
  const [inicial, final, movimentoDoResultado] = await Promise.all([saldos(prisma, antes), saldos(prisma, fim), saldos(prisma, fim, inicio)]);

  const zero = (): Decimal[] => COLUNAS_DA_DMPL.map(() => new Decimal(0));
  const porLinha = new Map<LinhaDaDmplChave, Decimal[]>();
  const somar = (linha: LinhaDaDmplChave, coluna: ColunaDaDmpl, v: Decimal): void => {
    const vs = porLinha.get(linha) ?? zero();
    const i = COLUNAS_DA_DMPL.findIndex((c) => c.chave === coluna);
    vs[i] = vs[i]!.plus(v);
    porLinha.set(linha, vs);
  };

  const movimentos = await prisma.partidaContabil.findMany({
    where: { conta: { codigo: { startsWith: "2.3." } }, lancamento: { dataTransacao: { gte: inicio, lte: fim } } },
    select: { tipo: true, valor: true, conta: { select: { codigo: true } }, lancamento: { select: { numeroControle: true, partidas: { select: { conta: { select: { codigo: true } } } } } } },
    orderBy: { lancamento: { dataTransacao: "asc" } },
  });
  const semLinha: { numeroControle: string; conta: string; valor: string }[] = [];
  for (const m of movimentos) {
    const v = m.tipo === "CREDITO" ? new Decimal(m.valor) : new Decimal(m.valor).negated();
    const linha = linhaDoMovimento(m.conta.codigo, m.lancamento.partidas.map((p) => p.conta.codigo));
    if (linha === null) continue;
    const coluna = colunaDaConta(m.conta.codigo)!;
    somar(linha, coluna, v);
    if (linha === "SEM_LINHA") semLinha.push({ numeroControle: m.lancamento.numeroControle, conta: m.conta.codigo, valor: v.toFixed(2) });
  }
  // o resultado ainda nas classes 3 e 4: o movimento delas no exercício vai à linha do resultado
  somar("RESULTADO_DO_EXERCICIO", "RESULTADOS_ACUMULADOS", movimentoDoResultado.resultado);

  const comResultado = (s: { readonly pl: Map<ColunaDaDmpl, Decimal>; readonly resultado: Decimal }): Decimal[] =>
    COLUNAS_DA_DMPL.map((c) => (s.pl.get(c.chave) ?? new Decimal(0)).plus(c.chave === "RESULTADOS_ACUMULADOS" ? s.resultado : 0));
  const valoresIniciais = comResultado(inicial);
  const valoresFinais = comResultado(final);

  // amarração: inicial + linhas = final, por coluna, com o final lido do saldo
  COLUNAS_DA_DMPL.forEach((c, i) => {
    let soma = valoresIniciais[i]!;
    for (const vs of porLinha.values()) soma = soma.plus(vs[i]!);
    if (!soma.equals(valoresFinais[i]!)) {
      throw new Error(`A DMPL de ${String(input.exercicio)} não fecha na coluna ${c.rotulo}: saldo inicial + mutações = ${soma.toFixed(2)}, saldo final = ${valoresFinais[i]!.toFixed(2)}.`);
    }
  });

  const comTotal = (vs: readonly Decimal[]): string[] => [...vs.map((v) => v.toFixed(2)), vs.reduce((a, v) => a.plus(v), new Decimal(0)).toFixed(2)];
  const linhas: LinhaDaDmpl[] = [
    { chave: "SALDOS_INICIAIS", rotulo: "Saldos iniciais", valores: comTotal(valoresIniciais) },
    ...LINHAS_DA_DMPL.map((l) => ({ chave: l.chave, rotulo: l.rotulo, valores: comTotal(porLinha.get(l.chave) ?? zero()) })),
    ...(porLinha.has("SEM_LINHA") ? [{ chave: "SEM_LINHA" as const, rotulo: "Movimentos sem linha definida (pendência)", valores: comTotal(porLinha.get("SEM_LINHA")!) }] : []),
    { chave: "SALDOS_FINAIS", rotulo: "Saldos finais", valores: comTotal(valoresFinais) },
  ];
  const notas = [
    "MCASP 11ª ed., Parte V, item 7: colunas pelo grupo 2.3 do PCASP; linhas pelo par do lançamento, identificado no razão pelas regras do sistema.",
    "Resultados Acumulados inclui o resultado ainda não encerrado nas variações patrimoniais (VPA − VPD), como no Balanço Patrimonial.",
    "A DMPL é facultativa para os órgãos e entidades dos entes da Federação e obrigatória para as estatais dependentes sob a forma de sociedade anônima (MCASP, 7.1). Alterações relevantes no patrimônio líquido vão às notas explicativas (7.3).",
  ];
  if (semLinha.length > 0) notas.unshift(`${String(semLinha.length)} movimento(s) no patrimônio líquido sem linha definida pelas regras: confira os lançamentos ${[...new Set(semLinha.map((s) => s.numeroControle))].join(", ")} e explique-os em nota.`);
  return { exercicio: input.exercicio, colunas: [...COLUNAS_DA_DMPL.map((c) => c.rotulo), "Total"], linhas, semLinha, notas };
}
