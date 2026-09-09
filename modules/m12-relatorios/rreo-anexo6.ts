import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import {
  categoriaDaReceita,
  origemDaNatureza,
  parsearNaturezaReceita,
  type OrigemReceita,
} from "../m04-receita/natureza.js";
import { arrecadadoPorNaturezaFonte } from "../m04-receita/consultas.js";
import {
  previsaoPorNaturezaFonte,
  reprevisaoAcumuladaPorNatureza,
} from "../m02-planejamento/consultas.js";
import {
  execucaoPorGrupoNd,
  elementoDaChaveNd,
  grupoDaChaveNd,
} from "../m05-despesa/consultas.js";
import { rpPagosPorGrupoNd } from "../m08-restos-a-pagar/consultas.js";
import { janelaDoBimestre, type Bimestre } from "./rreo-anexo1.js";

/**
 * RREO — ANEXO 6 · DEMONSTRATIVO DO RESULTADO PRIMÁRIO E NOMINAL (LRF, art. 53, III)
 * ACIMA DA LINHA. Bimestral, acumulado até o bimestre.
 *
 * ═══ O QUE ESTE ANEXO MEDE, E POR QUE ELE É DE CAIXA ═══
 * O resultado primário é o que sobra das contas do ente ANTES de contar a dívida: receitas sem
 * as financeiras, despesas sem juros e amortização. Ele responde "o ente se paga?" — se é
 * negativo, o município está fechando o mês com dívida nova, e nenhum superávit contábil desmente
 * isso. Por isso o XXIV é medido em CAIXA (o cheque que saiu), não em competência: uma despesa
 * empenhada e não paga não pressiona a dívida; uma paga, sim.
 *
 * ═══ ⚠️ A ARMADILHA DA DUPLA CONTAGEM DO RP (o teste com alma desta sessão, t3) ═══
 * XXIV = XII(a) − [XXIII(a) + XXIII(b) + XXIII(c)] — pagas MAIS RP processados pagos MAIS RPNP
 * pagos. Ora: o M08 grava o pagamento de um resto a pagar como um `Pagamento` DE VERDADE
 * (`restos.ts`), e `despesaPorFonte` (M05) avisa que toda linha de `Pagamento` cai na varredura
 * dela. Se a coluna (a) varresse `Pagamento` sem recorte, o MESMO cheque entraria em (a) e em
 * (b)/(c), e o resultado primário sairia deficitário pelo valor de cada RP pago — duas vezes.
 *
 * A separação é ESTRUTURAL: `Pagamento → Liquidacao → Empenho → Ficha.exercicio`. O pagamento de
 * RP pendura na liquidação do empenho ANTIGO, cuja ficha é de exercício anterior. `execucaoPorGrupoNd`
 * filtra `ficha.exercicio === exercicio` e por isso NÃO vê RP; `rpPagosPorGrupoNd` lê os movimentos
 * de RP e por isso não vê despesa do exercício. Cada cheque, uma gaveta. O t3 trava isso.
 *
 * ═══ NOTA OFICIAL ═══
 * As receitas entram JÁ LÍQUIDAS das deduções (FUNDEB, restituições) — quem faz isso é o
 * `arrecadadoPorNaturezaFonte`, que aplica o `sinalDaReceitaRealizada`. Não há dedução a fazer
 * aqui, e refazê-la seria deduzir duas vezes.
 *
 * ═══ O QUE ESTE ARQUIVO NÃO FAZ ═══
 * O ABAIXO DA LINHA (a variação da dívida consolidada líquida entre dois cortes) é a 7.8-b. Ver
 * MODULO-RREO-ANEXO6.md: ele consumirá a DCL da 7.7 e terá de HARMONIZAR com o XXVII daqui.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

const zero = () => toMoney("0.00");
const soma = (a: Money, b: Money) => toMoney(a.plus(b));
const sub = (a: Money, b: Money) => toMoney(a.minus(b));

// ═══════════════════════════════════════════════════════════════════════════
// F1 — A CLASSIFICAÇÃO DA RECEITA: PRIMÁRIA × FINANCEIRA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ O ROL FECHADO DAS RECEITAS FINANCEIRAS — só o que EXISTE no censo.
 *
 * Rendimento de aplicação financeira é o único item da dedução que este repositório consegue
 * identificar por natureza, e estes são os dois códigos que existem (`13210051`, seed real em
 * `mde-deparas.ts`; `13210001`, fixture do Anexo 11). Não há terceiro, e inventar um seria
 * reconstruir o ementário de memória — o erro que a 7.8-a passou o Passo 0 inteiro documentando.
 *
 * ⚠️ NÃO consumimos o `PAPEL_RENDIMENTOS` do de-para do FUNDEB: aquele mapa identifica os
 * rendimentos **do FUNDEB**, um recorte próprio e menor. Ele não é dono de "quais naturezas são
 * rendimento" em geral — usá-lo aqui deixaria de fora todo rendimento fora do FUNDEB e amarraria
 * o Anexo 6 a uma decisão de educação.
 */
export const RENDIMENTOS_DE_APLICACAO: readonly string[] = ["13210051", "13210001"];

export type ClasseReceitaAnexo6 = "PRIMARIA" | "FINANCEIRA" | "NAO_CLASSIFICADA";

export interface ClassificacaoReceita {
  readonly classe: ClasseReceitaAnexo6;
  /** A chave da sub-linha do demonstrativo. `null` quando não classificada. */
  readonly linha: string | null;
  /** Nomeado e visível quando `NAO_CLASSIFICADA`. Nunca silencioso. */
  readonly motivo?: string;
}

/**
 * A CLASSIFICAÇÃO DE UMA NATUREZA DE RECEITA para o Anexo 6.
 *
 * ═══ A ESTRUTURA CLASSIFICA; O ROL SÓ ENTRA ONDE ELA NÃO ALCANÇA ═══
 * O dono de "o que é esta natureza" já existe e é fail-closed: `parsearNaturezaReceita` (M04).
 * Categoria e origem saem DELE, e por isso uma natureza nova nasce classificada — operação de
 * crédito é financeira por ser origem 21, não por estar numa lista que alguém lembrou de
 * atualizar. Só a origem 13 precisa de rol: ela mistura rendimento de aplicação (financeiro) com
 * aluguel e concessão (primários), e a origem sozinha não decide.
 *
 * ═══ DECISÃO 0.5 (A) — OS TIPOS 2 E 4 SÃO PRIMÁRIOS, POR DIREITO ═══
 * Multas e juros de mora tributários (8º dígito 2 e 4) são ACESSÓRIOS DO TRIBUTO: seguem o
 * principal, e o principal é primário. A dedução de financeiras nas receitas correntes é, no MDF,
 * essencialmente rendimento de aplicação. Não é viés tolerado — é a leitura da norma.
 *
 * E ainda que se discordasse dela, não haveria como fazer diferente: o 8º dígito não separa o
 * juro da multa. `11121102` é "IPTU — multas E juros de mora", um código só. Ratear o juro por
 * proporção seria inventar dado. Ver JUROS-ATIVOS-XXV no MODULO.
 */
export function classificarReceitaAnexo6(codigo: string): ClassificacaoReceita {
  // ⚠️ FAIL-CLOSED NA FORMA: o parser rejeita código malformado, categoria fora do rol e tipo
  // reservado. Não engolimos a exceção — uma natureza inválida no Anexo 6 é erro de cadastro, e
  // classificá-la como "outras" fabricaria semântica para um código que a União não emitiu.
  parsearNaturezaReceita(codigo);

  const categoria = categoriaDaReceita(codigo);

  // INTRA (7 e 8): o layout não as menciona, e elas são o ente pagando a si mesmo — tipicamente a
  // contribuição patronal ao RPPS, exatamente o que o cabeçalho manda excluir ("exceto fontes
  // RPPS"). Incluí-las infla receita e despesa primárias no mesmo valor; excluí-las por conta
  // própria é decisão que o layout não autorizou. Interruptor.
  if (categoria === "7" || categoria === "8") {
    return { classe: "NAO_CLASSIFICADA", linha: null, motivo: "RECEITA-INTRA-NO-PRIMARIO" };
  }

  const origem: OrigemReceita = origemDaNatureza(codigo);

  if (categoria === "1") {
    if (origem === "RECEITA_PATRIMONIAL") {
      // A ÚNICA origem que o rol decide — ver RENDIMENTOS_DE_APLICACAO.
      if (RENDIMENTOS_DE_APLICACAO.includes(codigo)) {
        return { classe: "FINANCEIRA", linha: "REC_RENDIMENTOS" };
      }
      // ⚠️ NÃO cai em "demais correntes". A origem 13 é precisamente onde mora a ambiguidade:
      // um código 13 fora do rol tanto pode ser aluguel (primário) quanto um rendimento que
      // ninguém mapeou (financeiro). Chutar "primária" inflaria o resultado primário em silêncio.
      return { classe: "NAO_CLASSIFICADA", linha: null, motivo: "ORIGEM-13-SEM-CLASSIFICACAO" };
    }
    if (origem === "IMPOSTOS_TAXAS_CONTRIBUICOES_DE_MELHORIA" || origem === "CONTRIBUICOES") {
      return { classe: "PRIMARIA", linha: "REC_IMPOSTOS" };
    }
    if (origem === "TRANSFERENCIAS_CORRENTES") {
      return { classe: "PRIMARIA", linha: "REC_TRANSF_CORRENTES" };
    }
    // Agropecuária, industrial, serviços, outras correntes.
    return { classe: "PRIMARIA", linha: "REC_DEMAIS_CORRENTES" };
  }

  // ── CAPITAL (categoria 2) ──
  switch (origem) {
    case "OPERACOES_DE_CREDITO":
      // Dívida nova entrando. O layout é explícito: NÃO é primária.
      return { classe: "FINANCEIRA", linha: "REC_OPERACOES_CREDITO" };
    case "AMORTIZACAO_DE_EMPRESTIMOS":
      // O ente recebendo de volta o que emprestou: troca de ativo financeiro. NÃO é primária.
      // ⚠️ O censo não tem NENHUM código de origem 23. A regra existe e não é exercitada por
      // fixture nenhuma — está aqui porque a estrutura a decide, não porque alguém a viu.
      return { classe: "FINANCEIRA", linha: "REC_AMORT_EMPRESTIMOS" };
    case "ALIENACAO_DE_BENS":
      // ⚠️ SEM-ALIENACAO-DE-INVESTIMENTOS: o layout separa alienação de bens OPERACIONAIS
      // (primária) de alienação de INVESTIMENTOS (não primária). Esta distinção NÃO EXISTE no
      // repositório: o único eixo modelado é móveis/imóveis/intangíveis (`DeParaReceitaAlienacao`),
      // e os três são bens operacionais. Títulos e participações societárias não são modelados —
      // quando o M10 os modelar, a classificação desce até aqui e esta linha se parte em duas.
      return { classe: "PRIMARIA", linha: "REC_ALIENACAO" };
    case "TRANSFERENCIAS_DE_CAPITAL":
      return { classe: "PRIMARIA", linha: "REC_TRANSF_CAPITAL" };
    default:
      // OUTRAS_RECEITAS_DE_CAPITAL (29): o layout não a classifica, e ela é literalmente "o que
      // não coube". Pode conter primária e financeira misturadas. Interruptor.
      return { classe: "NAO_CLASSIFICADA", linha: null, motivo: "ORIGEM-29-SEM-CLASSIFICACAO" };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// F2 — A CLASSIFICAÇÃO DA DESPESA
// ═══════════════════════════════════════════════════════════════════════════

/** Grupo 2 — Juros e Encargos da Dívida. É o XXVI (juros passivos). */
export const GRUPO_JUROS_DIVIDA = "2";
/** Grupo 6 — Amortização da Dívida. */
export const GRUPO_AMORTIZACAO_DIVIDA = "6";

/**
 * ⚠️ ELEMENTO 66 — Concessão de Empréstimos e Financiamentos. Financeiro DENTRO de grupo primário.
 *
 * O layout tira da despesa primária a "concessão de empréstimos": o ente que empresta não gasta,
 * troca caixa por um crédito a receber. O elemento 66 existe no censo (`elementos.ts:80`) e o
 * nome bate exatamente com o do layout.
 *
 * ⚠️ E O 65 NÃO ENTRA — ELEMENTO-TITULO-JA-INTEGRALIZADO. O layout também tira a "aquisição de
 * títulos de capital JÁ INTEGRALIZADO". O elemento 65 do censo é "Constituição ou Aumento de
 * Capital de Empresas" — que NÃO é a mesma coisa: constituir capital novo é aporte, comprar título
 * já integralizado é permuta de ativo. Tratá-los como sinônimos seria inferência, e ela custaria
 * caro nos dois sentidos. O desdobramento correto vive no SUBELEMENTO, que não tem seed
 * (`Empenho.subelementoId` é nullable justamente por isso). Fica nomeado.
 */
export const ELEMENTO_CONCESSAO_EMPRESTIMOS = "66";

export type ClasseDespesaAnexo6 = "PRIMARIA_CORRENTE" | "PRIMARIA_CAPITAL" | "FINANCEIRA" | "NAO_CLASSIFICADA";

/** Classifica um par (grupo, elemento) de ND. `chave` é a do `chaveNd` do M05. */
export function classificarDespesaAnexo6(chave: string): {
  readonly classe: ClasseDespesaAnexo6;
  readonly motivo?: string;
} {
  const grupo = grupoDaChaveNd(chave);
  const elemento = elementoDaChaveNd(chave);

  if (grupo === GRUPO_JUROS_DIVIDA || grupo === GRUPO_AMORTIZACAO_DIVIDA) {
    return { classe: "FINANCEIRA" };
  }
  if (elemento === ELEMENTO_CONCESSAO_EMPRESTIMOS) return { classe: "FINANCEIRA" };

  if (grupo === "1" || grupo === "3") return { classe: "PRIMARIA_CORRENTE" };
  if (grupo === "4" || grupo === "5") return { classe: "PRIMARIA_CAPITAL" };

  // Grupo 9 (Reserva de Contingência) e qualquer grupo fora do rol da Portaria 163. A reserva tem
  // dotação e NUNCA execução — somá-la à despesa primária inflaria a dotação de uma linha que
  // jamais vira caixa. E um grupo fora do rol é erro de cadastro, não uma categoria nova.
  return { classe: "NAO_CLASSIFICADA", motivo: `GRUPO-ND-${grupo}-SEM-CLASSIFICACAO` };
}

// ═══════════════════════════════════════════════════════════════════════════
// AS LINHAS — mapa-de-linhas-é-dado: chaves estáveis, numeração romana é apresentação
// ═══════════════════════════════════════════════════════════════════════════

export interface DefinicaoLinha {
  readonly chave: string;
  readonly rotulo: string;
  readonly nivel: "grupo" | "item" | "deducao" | "total";
}

/**
 * ⚠️ A NUMERAÇÃO ROMANA NÃO É CHAVE. Ela é rótulo — e ela MUDA entre edições do MDF (o Anexo 6
 * já renumerou). Uma chave estável (`REC_IMPOSTOS`) sobrevive à renumeração; um `XII` no código
 * vira mentira silenciosa no dia em que a STN inserir uma linha antes dele.
 */
export const LINHAS_RECEITA_ANEXO6: readonly DefinicaoLinha[] = [
  { chave: "REC_CORRENTES", rotulo: "RECEITAS CORRENTES (I)", nivel: "grupo" },
  { chave: "REC_IMPOSTOS", rotulo: "Impostos, Taxas e Contribuições de Melhoria", nivel: "item" },
  { chave: "REC_TRANSF_CORRENTES", rotulo: "Transferências Correntes", nivel: "item" },
  { chave: "REC_DEMAIS_CORRENTES", rotulo: "Demais Receitas Correntes", nivel: "item" },
  { chave: "REC_FINANCEIRAS", rotulo: "(−) RECEITAS CORRENTES FINANCEIRAS", nivel: "deducao" },
  { chave: "REC_RENDIMENTOS", rotulo: "(−) Rendimentos de Aplicações Financeiras", nivel: "item" },
  { chave: "REC_JUROS_ATIVOS", rotulo: "(−) Juros e Encargos Ativos Recebidos", nivel: "item" },
  { chave: "REC_CAPITAL", rotulo: "RECEITAS DE CAPITAL PRIMÁRIAS", nivel: "grupo" },
  { chave: "REC_ALIENACAO", rotulo: "Alienação de Bens Operacionais", nivel: "item" },
  { chave: "REC_TRANSF_CAPITAL", rotulo: "Transferências de Capital", nivel: "item" },
  { chave: "REC_OPERACOES_CREDITO", rotulo: "(não primária) Operações de Crédito", nivel: "item" },
  { chave: "REC_AMORT_EMPRESTIMOS", rotulo: "(não primária) Amortização de Empréstimos", nivel: "item" },
  { chave: "REC_PRIMARIA_TOTAL", rotulo: "RECEITA PRIMÁRIA TOTAL (XII)", nivel: "total" },
];

export const LINHAS_DESPESA_ANEXO6: readonly DefinicaoLinha[] = [
  { chave: "DESP_CORRENTES", rotulo: "DESPESAS CORRENTES PRIMÁRIAS", nivel: "grupo" },
  { chave: "DESP_CAPITAL", rotulo: "DESPESAS DE CAPITAL PRIMÁRIAS", nivel: "grupo" },
  { chave: "DESP_PRIMARIA_TOTAL", rotulo: "DESPESA PRIMÁRIA TOTAL (XXIII)", nivel: "total" },
];

// ═══════════════════════════════════════════════════════════════════════════
// OS TIPOS DE SAÍDA
// ═══════════════════════════════════════════════════════════════════════════

export interface LinhaReceitaAnexo6 {
  readonly chave: string;
  readonly rotulo: string;
  readonly nivel: DefinicaoLinha["nivel"];
  readonly previsao: string;
  /** Realizada ATÉ o bimestre (acumulado). É o (a) do XII. */
  readonly realizada: string;
}

export interface LinhaDespesaAnexo6 {
  readonly chave: string;
  readonly rotulo: string;
  readonly nivel: DefinicaoLinha["nivel"];
  readonly dotacaoAtualizada: string;
  readonly empenhada: string;
  readonly liquidada: string;
  /** (a) — despesa DESTE exercício paga. Não contém RP; ver o cabeçalho. */
  readonly paga: string;
  /** (b) — RP processados pagos. */
  readonly rpProcessadosPagos: string;
  /** (c) — RP não processados pagos. */
  readonly rpNaoProcessadosPagos: string;
}

/** Uma natureza que o classificador não soube classificar — visível, com o motivo. */
export interface NaturezaNaoClassificada {
  readonly codigo: string;
  readonly motivo: string;
  readonly realizada: string;
}

export interface Anexo6 {
  readonly exercicio: number;
  readonly bimestre: Bimestre;
  readonly receitas: readonly LinhaReceitaAnexo6[];
  /** XII — a receita primária total. */
  readonly receitaPrimariaTotal: LinhaReceitaAnexo6;
  readonly despesas: readonly LinhaDespesaAnexo6[];
  /** XXIII — a despesa primária total. */
  readonly despesaPrimariaTotal: LinhaDespesaAnexo6;
  /** XXIV = XII(a) − [XXIII(a) + XXIII(b) + XXIII(c)]. Positivo = superávit primário. */
  readonly resultadoPrimario: string;
  /** XXV — `null` enquanto JUROS-ATIVOS-XXV durar. */
  readonly jurosAtivos: string | null;
  /** XXVI — juros passivos: o caixa do grupo ND 2. */
  readonly jurosPassivos: string;
  /** XXV − XXVI. `null` se o XXV for `null` — sem o minuendo não há subtração. */
  readonly jurosNominais: string | null;
  /** XXVII = XXIV + (XXV − XXVI). `null` pelo mesmo motivo. */
  readonly resultadoNominal: string | null;
  /** A meta da LDO, quando houver. Ver META-FISCAL-LDO. */
  readonly metaFiscal: MetaFiscalLdo | null;
  readonly naoClassificadas: readonly NaturezaNaoClassificada[];
  readonly pendencias: readonly string[];
}

/**
 * ⚠️ META-FISCAL-LDO — A TABELA-PARÂMETRO VAZIA.
 *
 * O Anexo 6 confronta o resultado apurado com a meta do Anexo de Metas Fiscais da LDO. Não existe
 * entidade de meta fiscal neste repositório: o M02 semeia estrutura orçamentária, e PPA/LDO/LOA
 * estão marcados como pendência no próprio `m02-planejamento/MODULO.md` ("PPA/LDO/LOA e anexos
 * ficam no M02b").
 *
 * ⚠️ NÃO CONFUNDIR COM `MetaMba`, que existe: aquela é meta BIMESTRAL DE ARRECADAÇÃO (programação
 * financeira, TR 4.18). Usá-la aqui compararia o resultado primário contra uma meta de receita —
 * dois números que não se falam, num quadro onde a comparação é o ponto.
 *
 * Sem meta, o anexo MOSTRA O RESULTADO E CALA (a doutrina do IEI, da 7.6-b): publicar "meta: 0,00"
 * faria qualquer resultado positivo parecer cumprimento.
 */
export interface MetaFiscalLdo {
  readonly resultadoPrimario: Money;
  readonly resultadoNominal: Money;
}
export const META_FISCAL_LDO: MetaFiscalLdo | null = null;

// ═══════════════════════════════════════════════════════════════════════════
// O MOTOR
// ═══════════════════════════════════════════════════════════════════════════

interface AccDespesa {
  dotacaoAtualizada: Money;
  empenhada: Money;
  liquidada: Money;
  paga: Money;
  rpProcessadosPagos: Money;
  rpNaoProcessadosPagos: Money;
}
const despesaZero = (): AccDespesa => ({
  dotacaoAtualizada: zero(), empenhada: zero(), liquidada: zero(),
  paga: zero(), rpProcessadosPagos: zero(), rpNaoProcessadosPagos: zero(),
});

function somarDespesa(a: AccDespesa, b: AccDespesa): AccDespesa {
  return {
    dotacaoAtualizada: soma(a.dotacaoAtualizada, b.dotacaoAtualizada),
    empenhada: soma(a.empenhada, b.empenhada),
    liquidada: soma(a.liquidada, b.liquidada),
    paga: soma(a.paga, b.paga),
    rpProcessadosPagos: soma(a.rpProcessadosPagos, b.rpProcessadosPagos),
    rpNaoProcessadosPagos: soma(a.rpNaoProcessadosPagos, b.rpNaoProcessadosPagos),
  };
}

/** O CAIXA de uma linha de despesa: (a) + (b) + (c). A medida do XXIII no XXIV. */
function caixaDaDespesa(d: AccDespesa): Money {
  return soma(soma(d.paga, d.rpProcessadosPagos), d.rpNaoProcessadosPagos);
}

function linhaDespesa(def: DefinicaoLinha, d: AccDespesa): LinhaDespesaAnexo6 {
  return {
    chave: def.chave,
    rotulo: def.rotulo,
    nivel: def.nivel,
    dotacaoAtualizada: d.dotacaoAtualizada.toFixed(2),
    empenhada: d.empenhada.toFixed(2),
    liquidada: d.liquidada.toFixed(2),
    paga: d.paga.toFixed(2),
    rpProcessadosPagos: d.rpProcessadosPagos.toFixed(2),
    rpNaoProcessadosPagos: d.rpNaoProcessadosPagos.toFixed(2),
  };
}

const defReceita = (chave: string): DefinicaoLinha =>
  LINHAS_RECEITA_ANEXO6.find((l) => l.chave === chave)!;
const defDespesa = (chave: string): DefinicaoLinha =>
  LINHAS_DESPESA_ANEXO6.find((l) => l.chave === chave)!;

export async function anexo6(
  leitor: Tx,
  p: { readonly exercicio: number; readonly bimestre: Bimestre }
): Promise<Anexo6> {
  const { fim } = janelaDoBimestre(p.exercicio, p.bimestre);
  const pendencias: string[] = [];

  // ── SEM-SEGREGACAO-RPPS: o cabeçalho pede "Correntes (exceto fontes RPPS)" ──
  // `FonteRecurso` não tem classe nem marcação de RPPS, e não há enum de classe de fonte. "É do
  // RPPS" só é DADO do lado da despesa (`UnidadeOrcamentaria.tipoManad`, `Acao.tipoProjAtivManad`,
  // os códigos MANAD 05/07). Do lado da RECEITA não há por onde — inferir do código da fonte seria
  // adivinhar. As correntes entram INTEIRAS, e isso está dito, não escondido.
  pendencias.push(
    "SEM-SEGREGACAO-RPPS: as receitas correntes entram sem excluir as fontes do RPPS — " +
      "`FonteRecurso` não tem classe de fonte. Se o ente tiver RPPS com receita própria, a " +
      "receita primária sai PARA MAIS."
  );

  // ═══ F1 — RECEITAS ═══
  const [previsoes, reprevisoes, arrecadado] = await Promise.all([
    previsaoPorNaturezaFonte(leitor, { exercicio: p.exercicio }),
    reprevisaoAcumuladaPorNatureza(leitor, { exercicio: p.exercicio }),
    // ⚠️ ACUMULADO até o fim do bimestre — o Anexo 6 não tem coluna "no bimestre". `desde` fica
    // de fora de propósito: a coluna é "REALIZADAS ATÉ O BIMESTRE".
    arrecadadoPorNaturezaFonte(leitor, { ate: fim }),
  ]);

  const previsaoPorNatureza = new Map<string, Money>();
  for (const pr of previsoes) {
    previsaoPorNatureza.set(
      pr.naturezaCodigo,
      soma(previsaoPorNatureza.get(pr.naturezaCodigo) ?? zero(), pr.previsto)
    );
  }
  // A previsão ATUALIZADA = inicial + reprevisões acumuladas (o leitor do M02 já soma os ajustes).
  for (const [codigo, ajuste] of reprevisoes) {
    previsaoPorNatureza.set(codigo, soma(previsaoPorNatureza.get(codigo) ?? zero(), ajuste));
  }

  const realizadoPorNatureza = new Map<string, Money>();
  for (const a of arrecadado) {
    realizadoPorNatureza.set(
      a.naturezaCodigo,
      soma(realizadoPorNatureza.get(a.naturezaCodigo) ?? zero(), a.arrecadado)
    );
  }

  const accReceita = new Map<string, { previsao: Money; realizada: Money }>();
  const naoClassificadas: NaturezaNaoClassificada[] = [];
  const motivosVistos = new Set<string>();

  const naturezas = new Set<string>([...previsaoPorNatureza.keys(), ...realizadoPorNatureza.keys()]);
  for (const codigo of naturezas) {
    const c = classificarReceitaAnexo6(codigo);
    const previsao = previsaoPorNatureza.get(codigo) ?? zero();
    const realizada = realizadoPorNatureza.get(codigo) ?? zero();

    if (c.linha === null) {
      naoClassificadas.push({ codigo, motivo: c.motivo!, realizada: realizada.toFixed(2) });
      motivosVistos.add(c.motivo!);
      continue;
    }
    const acc = accReceita.get(c.linha) ?? { previsao: zero(), realizada: zero() };
    accReceita.set(c.linha, {
      previsao: soma(acc.previsao, previsao),
      realizada: soma(acc.realizada, realizada),
    });
  }
  naoClassificadas.sort((a, b) => a.codigo.localeCompare(b.codigo));
  for (const motivo of [...motivosVistos].sort()) {
    pendencias.push(
      `${motivo}: há natureza(s) arrecadada(s) que este anexo NÃO classificou — elas ficaram ` +
        `FORA da receita primária e estão listadas em \`naoClassificadas\`.`
    );
  }

  const somaLinhas = (chaves: readonly string[]): { previsao: Money; realizada: Money } =>
    chaves.reduce(
      (acc, k) => {
        const l = accReceita.get(k) ?? { previsao: zero(), realizada: zero() };
        return { previsao: soma(acc.previsao, l.previsao), realizada: soma(acc.realizada, l.realizada) };
      },
      { previsao: zero(), realizada: zero() }
    );

  const correntes = somaLinhas(["REC_IMPOSTOS", "REC_TRANSF_CORRENTES", "REC_DEMAIS_CORRENTES"]);
  const financeiras = somaLinhas(["REC_RENDIMENTOS"]);
  const capital = somaLinhas(["REC_ALIENACAO", "REC_TRANSF_CAPITAL"]);

  // ⚠️ JUROS-ATIVOS-XXV: a linha existe no layout e sai SEMPRE zero. Ver o campo `jurosAtivos`.
  pendencias.push(
    "JUROS-ATIVOS-XXV: a linha de juros e encargos ativos sai 0,00 e o XXV sai `null`. Não há " +
      "natureza de juros ativos no censo, e o 8º dígito não separa o juro da multa (tipo 2 = " +
      "'multas E juros de mora', um código só). Ver o MODULO."
  );

  const linhaDe = (chave: string): LinhaReceitaAnexo6 => {
    const def = defReceita(chave);
    const l = accReceita.get(chave) ?? { previsao: zero(), realizada: zero() };
    return { chave, rotulo: def.rotulo, nivel: def.nivel, previsao: l.previsao.toFixed(2), realizada: l.realizada.toFixed(2) };
  };
  const linhaCalc = (chave: string, v: { previsao: Money; realizada: Money }): LinhaReceitaAnexo6 => {
    const def = defReceita(chave);
    return { chave, rotulo: def.rotulo, nivel: def.nivel, previsao: v.previsao.toFixed(2), realizada: v.realizada.toFixed(2) };
  };

  // XII = correntes − financeiras + capital primárias.
  const primariaTotal = {
    previsao: soma(sub(correntes.previsao, financeiras.previsao), capital.previsao),
    realizada: soma(sub(correntes.realizada, financeiras.realizada), capital.realizada),
  };

  const receitas: LinhaReceitaAnexo6[] = [
    linhaCalc("REC_CORRENTES", correntes),
    linhaDe("REC_IMPOSTOS"),
    linhaDe("REC_TRANSF_CORRENTES"),
    linhaDe("REC_DEMAIS_CORRENTES"),
    linhaCalc("REC_FINANCEIRAS", financeiras),
    linhaDe("REC_RENDIMENTOS"),
    linhaDe("REC_JUROS_ATIVOS"),
    linhaCalc("REC_CAPITAL", capital),
    linhaDe("REC_ALIENACAO"),
    linhaDe("REC_TRANSF_CAPITAL"),
    linhaDe("REC_OPERACOES_CREDITO"),
    linhaDe("REC_AMORT_EMPRESTIMOS"),
  ];
  const receitaPrimariaTotal = linhaCalc("REC_PRIMARIA_TOTAL", primariaTotal);

  // ═══ F2 — DESPESAS ═══
  // ⚠️ DOIS LEITORES, DUAS GAVETAS, ZERO INTERSEÇÃO. Ver o cabeçalho: a execução filtra
  // `ficha.exercicio` (e por isso não vê RP); o RP lê os movimentos (e por isso não vê o
  // exercício corrente). É esta separação que o t3 trava.
  const [execucao, rpPagos] = await Promise.all([
    execucaoPorGrupoNd(leitor, { exercicio: p.exercicio, ate: fim }),
    rpPagosPorGrupoNd(leitor, { ate: fim }),
  ]);

  const accDespesa = new Map<ClasseDespesaAnexo6, AccDespesa>();
  const getD = (c: ClasseDespesaAnexo6) => {
    const a = accDespesa.get(c) ?? despesaZero();
    accDespesa.set(c, a);
    return a;
  };
  const motivosDespesa = new Set<string>();

  const chaves = new Set<string>([...execucao.keys(), ...rpPagos.keys()]);
  for (const chave of chaves) {
    const { classe, motivo } = classificarDespesaAnexo6(chave);
    if (motivo !== undefined) motivosDespesa.add(motivo);

    const e = execucao.get(chave);
    const rp = rpPagos.get(chave);
    const linha: AccDespesa = {
      dotacaoAtualizada: e?.dotacaoAtualizada ?? zero(),
      empenhada: e?.empenhada ?? zero(),
      liquidada: e?.liquidada ?? zero(),
      paga: e?.paga ?? zero(),
      rpProcessadosPagos: rp?.processado ?? zero(),
      rpNaoProcessadosPagos: rp?.naoProcessado ?? zero(),
    };
    accDespesa.set(classe, somarDespesa(getD(classe), linha));
  }
  for (const motivo of [...motivosDespesa].sort()) {
    pendencias.push(`${motivo}: grupo de ND fora da despesa primária e da financeira — ver o MODULO.`);
  }

  const dCorrentes = accDespesa.get("PRIMARIA_CORRENTE") ?? despesaZero();
  const dCapital = accDespesa.get("PRIMARIA_CAPITAL") ?? despesaZero();
  const dPrimariaTotal = somarDespesa(dCorrentes, dCapital);

  const despesas: LinhaDespesaAnexo6[] = [
    linhaDespesa(defDespesa("DESP_CORRENTES"), dCorrentes),
    linhaDespesa(defDespesa("DESP_CAPITAL"), dCapital),
  ];
  const despesaPrimariaTotal = linhaDespesa(defDespesa("DESP_PRIMARIA_TOTAL"), dPrimariaTotal);

  // ═══ F3 — OS RESULTADOS ═══
  // XXIV = XII(a) − [XXIII(a) + XXIII(b) + XXIII(c)]. Aritmética LITERAL do layout.
  const resultadoPrimario = sub(primariaTotal.realizada, caixaDaDespesa(dPrimariaTotal));

  // XXVI — juros passivos: o CAIXA do grupo 2, pela mesma régua do XXIV (pagas + RP pagos). Usar
  // aqui a despesa liquidada, e lá a paga, misturaria competência com caixa dentro da mesma conta.
  const dFinanceira = accDespesa.get("FINANCEIRA") ?? despesaZero();
  const jurosDaDivida = despesaZero();
  for (const chave of chaves) {
    if (grupoDaChaveNd(chave) !== GRUPO_JUROS_DIVIDA) continue;
    const e = execucao.get(chave);
    const rp = rpPagos.get(chave);
    const l: AccDespesa = {
      dotacaoAtualizada: e?.dotacaoAtualizada ?? zero(),
      empenhada: e?.empenhada ?? zero(),
      liquidada: e?.liquidada ?? zero(),
      paga: e?.paga ?? zero(),
      rpProcessadosPagos: rp?.processado ?? zero(),
      rpNaoProcessadosPagos: rp?.naoProcessado ?? zero(),
    };
    Object.assign(jurosDaDivida, somarDespesa(jurosDaDivida, l));
  }
  void dFinanceira; // a financeira total não é linha do Anexo 6 — só o grupo 2 vira XXVI.
  const jurosPassivos = caixaDaDespesa(jurosDaDivida);

  // ⚠️ XXV `null`, E POR ISSO XXVII `null`. Não é "0,00": zero afirmaria que o ente não recebeu
  // juros nenhum, e o que sabemos é que não temos como saber. Um XXVII calculado com XXV=0 sairia
  // MENOR do que a verdade (faltaria uma parcela positiva) e ninguém veria a falta.
  const jurosAtivos: string | null = null;
  const jurosNominais: string | null = null;
  const resultadoNominal: string | null = null;

  return {
    exercicio: p.exercicio,
    bimestre: p.bimestre,
    receitas,
    receitaPrimariaTotal,
    despesas,
    despesaPrimariaTotal,
    resultadoPrimario: resultadoPrimario.toFixed(2),
    jurosAtivos,
    jurosPassivos: jurosPassivos.toFixed(2),
    jurosNominais,
    resultadoNominal,
    metaFiscal: META_FISCAL_LDO,
    naoClassificadas,
    pendencias,
  };
}
