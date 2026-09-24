import { z } from "zod";

/**
 * ═══ M33 — A LEITURA HONESTA DA MEMÓRIA DO CONTRACHEQUE (V11 V9.2) ═══
 *
 * ⚠️ ESTE ARQUIVO EXISTE PORQUE UM `as` MENTIU E O COMPILADOR ACREDITOU.
 *
 * A tela do contracheque fazia `const m = c.memoria as MemoriaDoContracheque` sobre um `Json` do
 * Prisma. O cast não confere nada: ele apenas manda o compilador parar de perguntar. A tela foi
 * escrita para a memória da folha MENSAL, o motor do 13º gravava outra forma, e o resultado foi
 * **500 em todo contracheque de 13º** — com os três typechecks verdes, os 262 testes verdes e o
 * build verde por cima. Nenhum instrumento podia pegar: o cast tinha desligado o único que veria.
 *
 * ⚠️ E O CONSERTO NÃO É `?.`. Encadeamento opcional faz o 500 sumir e a tela renderizar `undefined`
 * onde deveria haver dinheiro — troca um erro barulhento por um documento que MENTE EM SILÊNCIO.
 * Num contracheque isso é estritamente pior: o servidor lê "contribuição" em branco e não tem como
 * saber se não incidiu, se deu zero, ou se a tela quebrou.
 *
 * O que entra aqui é `unknown` e o que sai é uma UNIÃO DISCRIMINADA que o compilador obriga a
 * tratar em todos os ramos:
 *   · PRESENTE — a memória traz o bloco e ele é legível; os dados vêm tipados;
 *   · AUSENTE  — o bloco é `null` (não incidiu, e o motivo está declarado) ou não existe;
 *   · ILEGIVEL — o bloco existe e NÃO casa com a forma conhecida. Este é o ramo que o cast comia:
 *                ele não some, ele aparece na tela dizendo o que não foi entendido.
 *
 * ⚠️ `AUSENTE` NÃO É `ILEGIVEL`, e a diferença é de produto. Na 1ª parcela do 13º a contribuição é
 * `null` de propósito — ela não incide, e o motivo está gravado na memória
 * (`INCIDENCIA-NA-PRIMEIRA-PARCELA`). Ausência com motivo declarado é o comportamento certo; o que
 * não se faz é fabricar uma faixa vazia para uniformizar a renderização, porque aí o documento
 * afirmaria uma conta que ninguém fez.
 */

const zFaixa = z.object({
  ordem: z.number(),
  de: z.string(),
  ate: z.string(),
  baseNaFaixa: z.string(),
  aliquota: z.string(),
  valor: z.string(),
});

const zCenario = z.object({
  nome: z.string(),
  aplicavel: z.boolean(),
  motivo: z.string().optional(),
  base: z.string(),
  valor: z.string(),
  deducoes: z.array(z.object({ tipo: z.string(), valor: z.string() })),
});

/**
 * ⚠️ AS FAIXAS SÃO OBRIGATÓRIAS, e é a exigência que tem dente. O motor do 13º calculava a
 * contribuição percorrendo faixas e gravava só o total: "contribuição = 380,00" sem as faixas não
 * é memória, é um número — o servidor não confere e o controle interno recalcula. Exigir o array
 * aqui é o que impede a forma pobre de voltar em silêncio: ela passa a cair em `ILEGIVEL`, visível
 * na tela, em vez de derrubar a página ou renderizar vazio.
 */
const zContribuicao = z.object({
  regime: z.string(),
  base: z.string(),
  baseAntesDoTeto: z.string(),
  tetoAplicado: z.boolean(),
  calculada: z.string(),
  aplicada: z.string(),
  faixas: z.array(zFaixa),
  fundamentacao: z.string(),
  imposta: z.string().optional(),
});

const zIrrf = z.object({
  rendaTributavel: z.string(),
  base: z.string(),
  calculado: z.string(),
  aplicado: z.string(),
  cenario: z.string(),
  cenarios: z.array(zCenario),
  fundamentacao: z.string(),
  imposto: z.string().optional(),
});

const zSalarioFamilia = z.object({
  rendaBruta: z.string(),
  rendaMaxima: z.string(),
  valorPorDependente: z.string(),
  elegiveis: z.number(),
  valor: z.string(),
  considerados: z.array(z.object({ nome: z.string(), idade: z.number(), elegivel: z.boolean(), motivo: z.string().optional() })),
  fundamentacao: z.string(),
});

const zDias = z.object({ dias: z.number(), explicacao: z.string() });

const zAvos = z.object({
  computados: z.number(),
  de: z.number(),
  diasMinimos: z.number(),
  meses: z.array(z.object({ mes: z.string(), dias: z.number(), conta: z.boolean(), explicacao: z.string() })),
});

const zIncidencias = z.object({ contribuicao: z.boolean(), irrf: z.boolean(), motivo: z.string() });

const zProcedencia = z.object({
  folhaDeAdiantamento: z.string(),
  calculoNumero: z.number(),
  situacaoDaCertificacao: z.string(),
  versaoDoParametroDoAdiantamento: z.number(),
  fatoVerificado: z.string(),
  motivo: z.string(),
});

export type Faixa = z.infer<typeof zFaixa>;
export type Cenario = z.infer<typeof zCenario>;
export type Contribuicao = z.infer<typeof zContribuicao>;
export type Irrf = z.infer<typeof zIrrf>;
export type SalarioFamilia = z.infer<typeof zSalarioFamilia>;
export type Avos = z.infer<typeof zAvos>;
export type Procedencia = z.infer<typeof zProcedencia>;

/** O bloco lido: presente e tipado, ausente com motivo, ou ilegível com o que não se entendeu. */
export type Bloco<T> =
  | { readonly situacao: "PRESENTE"; readonly dados: T }
  | { readonly situacao: "AUSENTE"; readonly motivo: string }
  | { readonly situacao: "ILEGIVEL"; readonly motivo: string };

export interface MemoriaLida {
  readonly contribuicao: Bloco<Contribuicao>;
  readonly irrf: Bloco<Irrf>;
  readonly salarioFamilia: Bloco<SalarioFamilia>;
  /** A medida da folha MENSAL: dias do mês fiscal. Ausente nas folhas de 13º. */
  readonly dias: Bloco<z.infer<typeof zDias>>;
  /** A medida das folhas de 13º: avos do exercício, mês a mês. Ausente na mensal. */
  readonly avos: Bloco<Avos>;
  /** Só nas folhas de 13º: o que o sistema declara sobre as incidências daquela parcela. */
  readonly incidencias: Bloco<z.infer<typeof zIncidencias>>;
  /** Só na 2ª parcela do 13º: de onde veio o abatimento. */
  readonly procedenciaDoAbatimento: Bloco<Procedencia>;
}

/** O resumo de um erro do Zod, legível por quem não escreveu o schema. */
function porQueNaoCasou(e: z.ZodError): string {
  return e.issues
    .slice(0, 4)
    .map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`)
    .join("; ");
}

/**
 * Lê UM bloco. `null` e ausente viram `AUSENTE` (com o motivo que o chamador souber dar); presente
 * e malformado vira `ILEGIVEL` nomeando o que não casou — nunca `undefined` silencioso.
 */
function bloco<T>(schema: z.ZodType<T>, bruto: unknown, motivoDaAusencia: string): Bloco<T> {
  if (bruto === null || bruto === undefined) return { situacao: "AUSENTE", motivo: motivoDaAusencia };
  const r = schema.safeParse(bruto);
  if (r.success) return { situacao: "PRESENTE", dados: r.data };
  return { situacao: "ILEGIVEL", motivo: porQueNaoCasou(r.error) };
}

/**
 * LÊ A MEMÓRIA GRAVADA DE UM CONTRACHEQUE — mensal ou de 13º, sem cast e sem `any`.
 *
 * ⚠️ NÃO EXISTE RAMO "NÃO SEI O QUE É ISSO E SIGO EM FRENTE". Uma memória que não é objeto devolve
 * todos os blocos `ILEGIVEL` com o motivo, e a tela mostra isso. O documento diz o que não
 * conseguiu ler, que é a única coisa honesta a dizer quando não conseguiu ler.
 */
export function lerMemoriaDoContracheque(bruta: unknown): MemoriaLida {
  if (typeof bruta !== "object" || bruta === null || Array.isArray(bruta)) {
    const ilegivel = { situacao: "ILEGIVEL", motivo: "a memória gravada não é um objeto" } as const;
    return {
      contribuicao: ilegivel, irrf: ilegivel, salarioFamilia: ilegivel,
      dias: ilegivel, avos: ilegivel, incidencias: ilegivel, procedenciaDoAbatimento: ilegivel,
    };
  }
  const o = bruta as Record<string, unknown>;

  /**
   * ⚠️ O MOTIVO DA AUSÊNCIA VEM DA PRÓPRIA MEMÓRIA QUANDO ELA O DECLARA. Na 1ª parcela do 13º, a
   * memória diz por escrito por que não há contribuição nem imposto — e repetir esse motivo na
   * tela é o que separa "não incide, e aqui está o porquê" de "a tela não achou nada".
   */
  const inc = zIncidencias.safeParse(o["incidencias"]);
  const motivoDeclarado = inc.success ? inc.data.motivo : null;
  const semIncidencia = (quall: "contribuição" | "imposto de renda"): string =>
    motivoDeclarado !== null
      ? `Não incide ${quall} nesta parcela — ${motivoDeclarado}`
      : `A memória deste cálculo não traz o detalhamento ${quall === "contribuição" ? "da contribuição" : "do imposto"}.`;

  return {
    contribuicao: bloco(zContribuicao, o["contribuicao"], semIncidencia("contribuição")),
    irrf: bloco(zIrrf, o["irrf"], semIncidencia("imposto de renda")),
    salarioFamilia: bloco(zSalarioFamilia, o["salarioFamilia"], "Sem salário-família neste contracheque."),
    dias: bloco(zDias, o["dias"], "Esta folha não mede por dias."),
    avos: bloco(zAvos, o["avos"], "Esta folha não mede por avos."),
    incidencias: bloco(zIncidencias, o["incidencias"], "Esta folha não declara incidências por parcela."),
    procedenciaDoAbatimento: bloco(zProcedencia, o["procedenciaDoAbatimento"], "Não há abatimento de adiantamento neste contracheque."),
  };
}
