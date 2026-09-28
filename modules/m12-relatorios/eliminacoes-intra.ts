import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { movimentosPorConta, saldosPorConta } from "../m01-core-contabil/adapter-prisma.js";
import { planoDeConsolidacao } from "../m01-core-contabil/consultas.js";
import { entidadesContabeis } from "../m01-core-contabil/entidade-contabil.js";
import { comoLinha, liquidoDeUmFato } from "../m05-despesa/consultas.js";
import { MODALIDADE_INTRAORCAMENTARIA } from "./consistencia-loa.js";
import { anexo1, janelaDoBimestre, type Bimestre } from "./rreo-anexo1.js";
import { anexo2 } from "./rreo-anexo2.js";

/**
 * M12 — ELIMINAÇÕES INTRAGOVERNAMENTAIS NA CONSOLIDAÇÃO (C07).
 *
 * ═══ ⚠️ ELIMINAÇÃO É DEMONSTRATIVO, NÃO LANÇAMENTO — E É ASSIM QUE A VISÃO INDIVIDUAL SE PRESERVA ═══
 * O critério de C07 é *"visão individual preservada e ajuste consolidado explicável"*. A alternativa
 * — lançar a eliminação como partida de ajuste — foi considerada e RECUSADA: ela exigiria uma
 * entidade "consolidado" no razão, produziria um razão que não é de ninguém, e mexeria em saldo já
 * publicado. Aqui **nada se escreve**: a individual é exatamente o que já se vê, e o consolidado é
 * esta leitura. O MCASP pede a eliminação na consolidação, não na escrituração da entidade.
 *
 * ═══ A DOUTRINA DO M12: A IDENTIDADE TEM UM DONO; QUEM DIAGNOSTICA VISITA ═══
 * O lado orçamentário sai do **RREO Anexo 1**, que já separa intra (`intraReceitas`,
 * `intraDespesas`); o patrimonial sai de `movimentosPorConta`/`saldosPorConta` do M01, a mesma
 * aritmética da DVP e do Balanço. Zero aritmética nova — se este relatório recomputasse, ele
 * poderia divergir do oficial, e ninguém saberia em qual acreditar.
 *
 * ═══ OS TRÊS PARES, E O QUE CADA UM SIGNIFICA ═══
 *   · **E1 orçamentário** — receita intra ARRECADADA (categoria 7/8) x despesa intra LIQUIDADA
 *     (modalidade de aplicação 91). O que uma unidade pagou à outra é receita da outra: no
 *     consolidado as duas saem. O resíduo é a parte que uma reconheceu e a outra não.
 *   · **E2 variações** — VPD de transferência intragovernamental CONCEDIDA x VPA RECEBIDA, pelo
 *     movimento do período nas contas INTRA OFSS das classes 3 e 4.
 *   · **E3 recíproco** — ATIVO intra x PASSIVO intra no corte: o meu direito contra você é a sua
 *     obrigação comigo, e no consolidado os dois desaparecem.
 *
 * ⚠️ **INTER OFSS NÃO SE ELIMINA.** Transação com a União ou com o Estado não é intra do município:
 * o nível se classifica (ver `consolidacao.ts`), mas eliminar seria apagar do consolidado dinheiro
 * que veio de fora.
 *
 * ⚠️ **O ENCERRAMENTO FICA FORA DO E2**, pelo mesmo motivo da DVP: ele não é fato novo, e contá-lo
 * faria a mesma transferência aparecer duas vezes.
 *
 * ⚠️ **SEM_DADO NUNCA SE DISFARÇA DE "ELIMINA".** Um par com os dois lados zerados é interruptor
 * nomeado, não conciliação: zero contra zero fecha por vacuidade, e um verde que não verificou nada
 * manda seguir em frente.
 */

type Leitor = PrismaClient;

const zero = () => toMoney("0.00");
const soma = (a: Money, b: Money) => toMoney(a.plus(b));

/** O nível de consolidação que a consolidação municipal elimina. */
const ELIMINAVEL = "INTRA_OFSS";

export type SituacaoDoPar = "ELIMINA" | "RESIDUO" | "SEM_DADO";

export interface ContaNaEliminacao {
  readonly codigo: string;
  readonly nome: string;
  /** Movimento (E2) ou saldo (E3) da conta, já com o sinal da natureza da classe. */
  readonly valor: string;
}

export interface ParDeEliminacao {
  readonly chave: "INTRA_ORCAMENTARIO" | "INTRA_VARIACOES" | "INTRA_RECIPROCO";
  readonly titulo: string;
  readonly rotuloEsquerda: string;
  readonly rotuloDireita: string;
  readonly esquerda: string;
  readonly direita: string;
  /** esquerda − direita. Zero = a eliminação fecha; o resto É o ajuste a explicar. */
  readonly residuo: string;
  readonly situacao: SituacaoDoPar;
  /** Por que não há o que eliminar, quando `SEM_DADO`. */
  readonly motivo?: string;
  /** As contas que compõem os dois lados — a explicação do ajuste, conta por conta. */
  readonly contas: readonly ContaNaEliminacao[];
}

export interface ContraparteDaDespesaIntra {
  readonly credorCpfCnpj: string;
  /** A entidade contábil cujo CNPJ vigente casa com o credor, ou `null`. */
  readonly entidadeCodigo: string | null;
  readonly entidadeNome: string | null;
  readonly empenhos: number;
  readonly empenhado: string;
}

export interface EliminacoesIntragovernamentais {
  readonly exercicio: number;
  readonly bimestre: Bimestre;
  readonly pares: readonly ParDeEliminacao[];
  /** Quem está do outro lado da despesa intra — identificado pelo CNPJ, ou nomeado como ausente. */
  readonly contrapartes: readonly ContraparteDaDespesaIntra[];
  /** Âncoras de nível de consolidação no plano INSTALADO. Zero = nada se classifica, e o diz. */
  readonly ancorasDoPlano: number;
  /** Códigos de conta fora da forma do PCASP, se houver. Nomeados. */
  readonly malformados: readonly string[];
}

/**
 * Σ das linhas de nível "categoria" — o total de um quadro do Anexo 1, sem recomputar nada.
 *
 * ⚠️ SÓ AS CATEGORIAS. As linhas do Anexo 1 são hierárquicas (categoria → origem → espécie, e
 * categoria → grupo na despesa): somar todas contaria o mesmo dinheiro três vezes.
 */
function totalDasCategorias<T extends { readonly nivel: string }>(
  linhas: readonly T[],
  campo: (l: T) => string
): Money {
  return linhas
    .filter((l) => l.nivel === "categoria")
    .reduce((acc, l) => soma(acc, toMoney(campo(l))), zero());
}

function fechar(
  base: Omit<ParDeEliminacao, "residuo" | "situacao" | "contas">,
  esq: Money,
  dir: Money,
  contas: readonly ContaNaEliminacao[],
  motivoSemDado: string
): ParDeEliminacao {
  if (esq.isZero() && dir.isZero()) {
    return {
      ...base,
      esquerda: esq.toFixed(2),
      direita: dir.toFixed(2),
      residuo: "0.00",
      situacao: "SEM_DADO",
      motivo: motivoSemDado,
      contas,
    };
  }
  const residuo = toMoney(esq.minus(dir));
  return {
    ...base,
    esquerda: esq.toFixed(2),
    direita: dir.toFixed(2),
    residuo: residuo.toFixed(2),
    situacao: residuo.isZero() ? "ELIMINA" : "RESIDUO",
    contas,
  };
}

export async function eliminacoesIntragovernamentais(
  leitor: Leitor,
  p: { readonly exercicio: number; readonly bimestre: Bimestre }
): Promise<EliminacoesIntragovernamentais> {
  const { fim } = janelaDoBimestre(p.exercicio, p.bimestre);
  // ⚠️ ACUMULADO DO EXERCÍCIO, não do bimestre: o Anexo 1 publica "até o bimestre", e um par cujos
  // dois lados fossem lidos em janelas diferentes divergiria por construção.
  const inicioDoExercicio = janelaDoBimestre(p.exercicio, 1).inicio;

  const plano = await planoDeConsolidacao(leitor);

  // ── E1: DOIS donos, e o motivo está medido ─────────────────────────────────
  //
  // A RECEITA intra é do **Anexo 1**, que a separa de verdade (`intraReceitas`, categorias 7 e 8).
  //
  // ⚠️ A DESPESA intra NÃO é do Anexo 1: o `intraDespesas` dele é um STUB — `montarDespesas`
  // devolve `intra: []` com o comentário "mantemos vazio ... tratada no bloco de consolidação
  // futuro" (`rreo-anexo1.ts`). Usá-lo daria receita intra contra ZERO, e o par acusaria resíduo
  // igual à receita inteira — um resíduo inventado pelo relatório, não pelo ente. O dono real é o
  // **Anexo 2**, que parte o quadro pela modalidade de aplicação 91 (`subtotalIntra`).
  //
  // O stub fica NOMEADO: pendência **ANEXO1-SEM-QUADRO-INTRA-DA-DESPESA** — e ela é maior que este
  // relatório, porque o Anexo 1 é publicado e hoje conta a despesa intra dentro do quadro
  // "EXCETO INTRAORÇAMENTÁRIAS". Consertá-la muda número de relatório fiscal, e isso pede
  // caracterização própria, não um efeito colateral desta unidade.
  const [a1, a2] = await Promise.all([anexo1(leitor, p), anexo2(leitor, p)]);
  const receitaIntra = totalDasCategorias(a1.intraReceitas, (l) => l.ateBimestre);
  const despesaIntra = toMoney(a2.subtotalIntra.liquidadasAte);

  const e1 = fechar(
    {
      chave: "INTRA_ORCAMENTARIO",
      titulo: "Execução orçamentária intragovernamental — o que uma unidade pagou à outra",
      rotuloEsquerda: "Receita intra arrecadada (categorias 7 e 8)",
      rotuloDireita: "Despesa intra liquidada (modalidade de aplicação 91)",
      esquerda: "0.00",
      direita: "0.00",
    },
    receitaIntra,
    despesaIntra,
    [],
    "Não há receita intra arrecadada nem despesa intra liquidada neste período — nada a eliminar. " +
      "Aparece quando o ente executar operações entre as suas unidades."
  );

  // ── E2: movimento das classes 3 e 4 no período, só nas contas INTRA OFSS ──
  const movimentos = await movimentosPorConta(leitor, {
    classes: ["3", "4"],
    inicio: inicioDoExercicio,
    fim,
    campoData: "dataTransacao",
    natureza: { excluir: ["ENCERRAMENTO"] },
  });
  const intraVariacoes = movimentos.filter(
    (m) => plano.nivelDaConta(m.codigo) === ELIMINAVEL && !m.saldo.isZero()
  );
  const nomes = await nomesDasContas(leitor, [...intraVariacoes.map((m) => m.codigo)]);
  const vpdIntra = intraVariacoes
    .filter((m) => m.codigo.startsWith("3"))
    .reduce((acc, m) => soma(acc, m.saldo), zero());
  const vpaIntra = intraVariacoes
    .filter((m) => m.codigo.startsWith("4"))
    .reduce((acc, m) => soma(acc, m.saldo), zero());

  const e2 = fechar(
    {
      chave: "INTRA_VARIACOES",
      titulo: "Variações patrimoniais intragovernamentais — a transferência concedida e a recebida",
      rotuloEsquerda: "Variação diminutiva intra (classe 3)",
      rotuloDireita: "Variação aumentativa intra (classe 4)",
      esquerda: "0.00",
      direita: "0.00",
    },
    vpdIntra,
    vpaIntra,
    intraVariacoes.map((m) => ({
      codigo: m.codigo,
      nome: nomes.get(m.codigo) ?? "(conta ausente do plano)",
      valor: m.saldo.toFixed(2),
    })),
    plano.ancoras === 0
      ? "O plano instalado não declara nível de consolidação em nenhuma conta — sem ele nenhuma " +
        "partida pode ser dita intragovernamental. Instale o plano de contas oficial."
      : "Nenhuma partida do período caiu em conta INTRA OFSS das classes 3 e 4 — nada a eliminar."
  );

  // ── E3: saldo recíproco das classes 1 e 2, só nas contas INTRA OFSS ──
  const saldos = await saldosPorConta(leitor, {
    classes: ["1", "2"],
    ate: fim,
    campoData: "dataTransacao",
  });
  const intraReciproco = saldos.filter(
    (s) => plano.nivelDaConta(s.codigo) === ELIMINAVEL && !s.saldo.isZero()
  );
  const nomesR = await nomesDasContas(leitor, [...intraReciproco.map((s) => s.codigo)]);
  const ativoIntra = intraReciproco
    .filter((s) => s.codigo.startsWith("1"))
    .reduce((acc, s) => soma(acc, s.saldo), zero());
  const passivoIntra = intraReciproco
    .filter((s) => s.codigo.startsWith("2"))
    .reduce((acc, s) => soma(acc, s.saldo), zero());

  const e3 = fechar(
    {
      chave: "INTRA_RECIPROCO",
      titulo: "Saldos recíprocos intragovernamentais — o direito de um é a obrigação do outro",
      rotuloEsquerda: "Ativo intra (classe 1)",
      rotuloDireita: "Passivo intra (classe 2)",
      esquerda: "0.00",
      direita: "0.00",
    },
    ativoIntra,
    passivoIntra,
    intraReciproco.map((s) => ({
      codigo: s.codigo,
      nome: nomesR.get(s.codigo) ?? "(conta ausente do plano)",
      valor: s.saldo.toFixed(2),
    })),
    "Nenhuma conta INTRA OFSS das classes 1 e 2 tem saldo no corte — nada a eliminar."
  );

  return {
    exercicio: p.exercicio,
    bimestre: p.bimestre,
    pares: [e1, e2, e3],
      contrapartes: await contrapartesDaDespesaIntra(leitor, p.exercicio, fim),
    ancorasDoPlano: plano.ancoras,
    malformados: plano.malformados,
  };
}

/** Os nomes oficiais, numa leitura — o demonstrativo mostra a conta com o nome dela. */
async function nomesDasContas(
  leitor: Leitor,
  codigos: readonly string[]
): Promise<ReadonlyMap<string, string>> {
  if (codigos.length === 0) return new Map();
  const linhas = await leitor.contaPcasp.findMany({
    where: { codigo: { in: [...codigos] } },
    select: { codigo: true, nome: true },
  });
  return new Map(linhas.map((l) => [l.codigo, l.nome]));
}

/**
 * QUEM ESTÁ DO OUTRO LADO — a contraparte da despesa intra, identificada por FATO JÁ GRAVADO.
 *
 * ⚠️ NADA SE ADIVINHA. O empenho tem `credorCpfCnpj`; a entidade contábil tem `cnpj` na versão
 * vigente. Casar os dois é derivar de dois cadastros existentes. Quando não casa, a linha sai com
 * `entidadeCodigo: null` e a tela diz **contraparte não identificada** — que é o estado honesto:
 * uma despesa modalidade 91 para um credor que não é entidade cadastrada é ou cadastro faltando ou
 * classificação errada, e as duas coisas quem resolve é o ente, não este relatório.
 *
 * ⚠️ E É POR CNPJ, NÃO POR NOME. Nome de entidade pública varia em acento, abreviação e "Fundo
 * Municipal de" — casar por nome produziria contraparte plausível e errada.
 */
async function contrapartesDaDespesaIntra(
  leitor: Leitor,
  exercicio: number,
  fim: Date
): Promise<readonly ContraparteDaDespesaIntra[]> {
  // ⚠️ ACUMULADO ATÉ O CORTE, como o `liquidadasAte` do Anexo 1 — e não a janela do bimestre.
  // Um empenho de março anulado em maio: recortar pela janela do 1º bimestre traria o empenho sem
  // a anulação dele, e a contraparte apareceria devendo dinheiro que já não existe.
  const empenhos = await leitor.empenho.findMany({
    where: {
      data: { lte: fim },
      ficha: { exercicio, naturezaDespesa: { codModalidade: MODALIDADE_INTRAORCAMENTARIA } },
    },
    select: {
      id: true,
      credorCpfCnpj: true,
      valor: true,
      estornoDeId: true,
      anulacaoParcialDeId: true,
    },
  });
  if (empenhos.length === 0) return [];

  const entidades = await entidadesContabeis(leitor);
  const porCnpj = new Map(
    entidades.filter((e) => e.cnpj !== null).map((e) => [e.cnpj as string, e])
  );

  // ⚠️ O LÍQUIDO É POR FATO, E NÃO POR GRUPO DE CREDOR — E ISSO FOI MEDIDO, NÃO SUPOSTO.
  //
  // A tentação é agrupar os empenhos por credor e passar o grupo inteiro pelo `somaLiquida`. Ela
  // dá o número ERRADO, sempre, porque **a anulação não herda o credor**: o adapter grava o
  // literal `"ANULACAO"` (e `"ANULACAO_PARCIAL"` na parcial) em `credorCpfCnpj`
  // (`m05-despesa/adapter-prisma.ts`). A anulação cairia num grupo próprio, chamado "ANULACAO", e
  // a contraparte apareceria devendo o valor BRUTO para sempre — com um credor fantasma ao lado.
  //
  // O líquido de cada fato é do dono dele: `liquidoDeUmFato` do M05, que já recorta o original,
  // as parciais e o estorno total. A soma por credor é só a última etapa.
  const universo = empenhos.map(comoLinha);
  const acc = new Map<string, { empenhos: number; empenhado: Money }>();
  for (const e of empenhos) {
    // Só os ORIGINAIS viram linha — anulação não é empenho novo (o mesmo corte do
    // `listarEmpenhos` do M05), e o líquido dela já está no original.
    if (e.estornoDeId !== null || e.anulacaoParcialDeId !== null) continue;
    const atual = acc.get(e.credorCpfCnpj) ?? { empenhos: 0, empenhado: zero() };
    acc.set(e.credorCpfCnpj, {
      empenhos: atual.empenhos + 1,
      empenhado: soma(atual.empenhado, liquidoDeUmFato(e.id, universo)),
    });
  }

  return [...acc.entries()]
    .map(([credorCpfCnpj, v]) => {
      const ent = porCnpj.get(credorCpfCnpj);
      return {
        credorCpfCnpj,
        entidadeCodigo: ent?.codigo ?? null,
        entidadeNome: ent?.nome ?? null,
        empenhos: v.empenhos,
        empenhado: v.empenhado.toFixed(2),
      };
    })
    .sort((a, b) => a.credorCpfCnpj.localeCompare(b.credorCpfCnpj));
}
