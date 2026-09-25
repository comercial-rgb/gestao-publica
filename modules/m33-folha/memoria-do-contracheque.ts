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

/**
 * ⚠️ V11 V9.4b — OS TRÊS BLOCOS QUE A COMPLEMENTAR JÁ ESCREVIA E QUE NINGUÉM LIA.
 *
 * A memória do contracheque complementar declara, DENTRO do sha256, que ele não é a remuneração
 * da competência (`natureza`), sob que regime a retenção foi calculada (`regimeDeTributacao`) e
 * que grandeza ele mede (`medida`). Nada disso tinha leitor aqui — e uma declaração que não chega
 * a quem lê é papelada: existe e não produz efeito. O percurso de navegador mediu as três
 * ausências na tela.
 *
 * ⚠️ TODOS OPCIONAIS, e a opcionalidade é o ponto, não frouxidão: todo contracheque MENSAL e de
 * 13º já gravado não tem estas chaves, e exigi-las faria cada um deles virar `ILEGIVEL`. É
 * "migration aditiva" aplicada à leitura, o mesmo que a V11 V9.3 fez com `procedenciaDoAbatimento`.
 */
/**
 * ⚠️ V13 — `PERCENTUAL` ENTRA AQUI, E ESQUECÊ-LO TERIA DESLIGADO A TELA EM SILÊNCIO.
 *
 * O contracheque do ADIANTAMENTO SALARIAL grava `medida.unidade = "PERCENTUAL"` — a conta dele é
 * percentual sobre base monetária, não dias nem avos. Sem o valor neste `z.enum`, o `parse` da
 * memória FALHARIA e o bloco `medida` viraria `ILEGIVEL` na tela de TODO contracheque de vale.
 * O compilador não alcança isto: `NaturezaDoTipoDeFolha.medida` (`dominio.ts`) é outra lista, e
 * as duas só concordam porque alguém as mantém concordando. São os DOIS ÚNICOS sítios da
 * unidade, e este é o que nenhum tipo novo cobra.
 */
const zMedida = z.object({ unidade: z.enum(["DIAS", "AVOS", "DIFERENCA", "PERCENTUAL"]), explicacao: z.string() });

const zProcedencia = z.object({
  folhaDeAdiantamento: z.string(),
  calculoNumero: z.number(),
  situacaoDaCertificacao: z.string(),
  versaoDoParametroDoAdiantamento: z.number(),
  fatoVerificado: z.string(),
  motivo: z.string(),
  /**
   * ⚠️ V11 V9.3 — OPCIONAIS, E A OPCIONALIDADE É O PONTO, NÃO FROUXIDÃO.
   *
   * Todo contracheque de 13º gravado ANTES desta rodada tem `procedenciaDoAbatimento` sem estas
   * quatro chaves. Exigi-las faria cada um deles virar `ILEGIVEL` na tela — o sistema deixaria de
   * conseguir ler os próprios fatos passados por causa de um campo novo, que é exatamente o que
   * "migration aditiva" existe para impedir, aplicado à leitura.
   *
   * Ausentes, a tela mostra o que a memória de fato tinha. `natureza` ausente NÃO vira "APURACAO":
   * quem interpreta a ausência é quem lê, e a ausência significa "este cálculo é anterior à
   * pergunta" — que é a mesma coisa que `criterioDeclaradoPeloEnte: false` significa hoje.
   */
  criterioDeclaradoPeloEnte: z.boolean().optional(),
  estadoExigidoPeloEnte: z.string().nullable().optional(),
  estadoVerificado: z.string().optional(),
  natureza: z.enum(["APURACAO", "SIMULACAO"]).optional(),
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
  /**
   * A GRANDEZA que este contracheque mede, quando a memória a declara. Ausente nos cálculos
   * anteriores à V11 V9.4b — e a ausência NÃO significa "dias": significa que aquele cálculo é
   * anterior à pergunta. Quem interpreta a ausência é quem lê.
   */
  readonly medida: Bloco<z.infer<typeof zMedida>>;
  /** O que este documento DIZ que é. Na complementar: uma diferença, não a remuneração do mês. */
  readonly natureza: Bloco<string>;
  /** Sob que regra a retenção foi calculada. Na complementar: competência, não caixa. */
  readonly regimeDeTributacao: Bloco<string>;
  /**
   * ⚠️ A CONTA DE ONDE A DIFERENÇA SAIU — e ela existe porque o documento estava EMUDECENDO.
   *
   * Num contracheque COMPLEMENTAR o bloco `contribuicao` do topo não existe: o que a folha retém é
   * o DELTA (está na linha), e a conta que o produziu é a do recálculo INTEGRAL, guardada em
   * `recalculoIntegral`. Sem leitor para ela, a tela dizia *"A memória deste cálculo não traz o
   * detalhamento da contribuição"* enquanto descontava 50,00 do servidor — medido no percurso.
   *
   * ⚠️ E O SILÊNCIO É PIOR QUE O NÚMERO ERRADO. Um número errado alguém confere e questiona; um
   * silêncio o servidor lê como "não houve contribuição". Quem retém tem de explicar a retenção.
   */
  readonly contribuicaoDoRecalculoIntegral: Bloco<Contribuicao>;
  readonly irrfDoRecalculoIntegral: Bloco<Irrf>;
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
      medida: ilegivel, natureza: ilegivel, regimeDeTributacao: ilegivel,
      contribuicaoDoRecalculoIntegral: ilegivel, irrfDoRecalculoIntegral: ilegivel,
    };
  }
  const o = bruta as Record<string, unknown>;
  /**
   * O recálculo INTEGRAL, quando existe — é ele que explica de onde a diferença saiu. Nunca é
   * lido como se fosse a conta DESTA folha: quem o renderiza tem de dizer que é o integral.
   */
  const integral: Record<string, unknown> =
    typeof o["recalculoIntegral"] === "object" && o["recalculoIntegral"] !== null && !Array.isArray(o["recalculoIntegral"])
      ? (o["recalculoIntegral"] as Record<string, unknown>)
      : {};

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
    medida: bloco(zMedida, o["medida"], "A memória deste cálculo não declara a grandeza que ele mede."),
    natureza: bloco(z.string().min(1), o["natureza"], "A memória deste cálculo não declara a natureza do documento."),
    regimeDeTributacao: bloco(z.string().min(1), o["regimeDeTributacao"], "A memória deste cálculo não declara o regime de tributação aplicado."),
    contribuicaoDoRecalculoIntegral: bloco(zContribuicao, integral["contribuicao"], "Este cálculo não traz recálculo integral."),
    irrfDoRecalculoIntegral: bloco(zIrrf, integral["irrf"], "Este cálculo não traz recálculo integral."),
  };
}
