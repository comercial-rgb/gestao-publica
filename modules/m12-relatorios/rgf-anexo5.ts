import { serializar, toMoney, type Dinheiro, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
// ═══ NENHUMA ARITMÉTICA NOVA: cada total vem do módulo DONO do dado. ═══
import { linhasDoSuperavitPorFonte } from "./superavit-por-fonte.js";
import { obrigacoesDoExercicioPorFonte } from "../m05-despesa/consultas.js";
import { restosAPagarPorFonte } from "../m08-restos-a-pagar/consultas.js";

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

/**
 * RGF — ANEXO 5: DISPONIBILIDADE DE CAIXA E RESTOS A PAGAR. LRF art. 55, III, "a".
 *
 * ═══ O QUE ESTE ANEXO DECIDE ═══
 * É ele que autoriza (ou proíbe) inscrever restos a pagar não processados. A regra da
 * STN é dura e é **POR VINCULAÇÃO**: o RPNP só se inscreve se aquela fonte tiver
 * disponibilidade líquida. Um ente com caixa sobrando na fonte livre e furado no FUNDEB
 * não pode inscrever RPNP no FUNDEB — o dinheiro do FUNDEB é carimbado, e o superávit
 * da outra fonte não o socorre. Por isso cada linha calcula sozinha, e não existe
 * "total" que salve ninguém.
 *
 * ═══ ⚠️ AS LETRAS SÃO APRESENTAÇÃO; AS CHAVES SÃO O DADO ═══
 * As edições do MDF renumeram as colunas (a publicação de SP usa (g)/(h)/(i) onde o
 * Siconfi usa (f)/(g)/(i)). Renomear um campo a cada edição quebraria todo consumidor.
 * Aqui as chaves são SEMÂNTICAS e estáveis; a letra vive no cadastro de apresentação
 * (`COLUNAS_ANEXO5`), que é dado — a mesma doutrina do mapa-de-linhas.
 *
 * ═══ A INTERPRETAÇÃO DOS RESTITUÍVEIS (registrada, não inventada) ═══
 * O dinheiro retido de terceiros ESTÁ no banco — logo está na disponibilidade BRUTA
 * (a). A obrigação de repassá-lo é uma obrigação financeira, e sai em (e). É a ÚNICA
 * leitura em que a identidade fecha sem dupla contagem: tirá-lo de (a) E subtraí-lo em
 * (e) o descontaria duas vezes, e a linha sairia mais pobre do que o ente é.
 *
 * A frase corrente "restituíveis não são disponibilidade" descreve o RESULTADO líquido
 * — (i) —, não a coluna (a). Fonte: Tabela de Fatos RGF (Siconfi/STN). Está no
 * MODULO.md; se um dia divergir, é aqui que se corrige.
 *
 * ═══ AS COLUNAS ═══
 *   (a) disponibilidadeBruta ...... caixa + aplicações, COM os restituíveis
 *   (b) rpLiquidadosAnteriores .... RP processado de exercícios anteriores    [M08]
 *   (c) rpLiquidadosDoExercicio ... liquidado − pago do exercício corrente    [M05]
 *   (d) rpNaoLiquidadosAnteriores . RP não processado de exerc. anteriores    [M08]
 *   (e) demaisObrigacoes .......... consignações a repassar + restituíveis    [M07]
 *   (f) = a − (b + c + d + e) ..... disponibilidade líquida ANTES da inscrição
 *   (g) rpnpInscritosNoExercicio .. o que se pretende inscrever
 *   (i) = f − g ................... disponibilidade líquida DEPOIS
 *
 * ⚠️ (f) e (i) PODEM SER NEGATIVOS, e o relatório não os esconde: negativo é
 * INSUFICIÊNCIA DE CAIXA, e é a informação mais importante da página (Nota 1 oficial).
 * Um `Math.max(0, ...)` aqui apagaria exatamente o que a LRF manda publicar.
 */

/** Uma linha do anexo — uma fonte/destinação. */
export interface LinhaAnexo5 {
  readonly fonte: string;
  readonly descricao: string;
  /** Recursos não vinculados vão em bloco separado (a fonte 500 e afins). */
  readonly vinculado: boolean;

  readonly disponibilidadeBruta: Dinheiro;
  readonly rpLiquidadosAnteriores: Dinheiro;
  readonly rpLiquidadosDoExercicio: Dinheiro;
  readonly rpNaoLiquidadosAnteriores: Dinheiro;
  readonly demaisObrigacoes: Dinheiro;
  /** ⚠️ Interruptor nomeado — ver `CANCELADOS-POR-INSUFICIENCIA` no MODULO.md. */
  readonly empenhosCanceladosPorInsuficiencia: Dinheiro;
  /** (f) = a − (b+c+d+e). Negativo = insuficiência. */
  readonly disponibilidadeLiquidaAntes: Dinheiro;
  readonly rpnpInscritosNoExercicio: Dinheiro;
  /** (i) = f − g. Negativo = insuficiência. */
  readonly disponibilidadeLiquidaDepois: Dinheiro;
  /** Derivado: (i) < 0. É o que a página destaca. */
  readonly insuficiente: boolean;
}

export interface Anexo5 {
  readonly exercicio: number;
  readonly corte: Date;
  readonly linhas: readonly LinhaAnexo5[];
  readonly totalBruta: Dinheiro;
  readonly totalLiquidaDepois: Dinheiro;
  /** As fontes cuja inscrição de RPNP a regra da STN não autoriza. */
  readonly fontesInsuficientes: readonly string[];
}

/**
 * O CADASTRO DE APRESENTAÇÃO — a letra de cada coluna, por edição.
 *
 * ⚠️ É DADO, não código: as letras mudam entre edições do MDF e a semântica não. Quem
 * publica escolhe o rótulo; quem calcula usa a chave.
 */
export const COLUNAS_ANEXO5: readonly {
  readonly chave: keyof LinhaAnexo5;
  readonly letra: string;
  readonly rotulo: string;
  readonly grupo?: string;
}[] = [
  { chave: "disponibilidadeBruta", letra: "a", rotulo: "Disponibilidade de Caixa Bruta" },
  { chave: "rpLiquidadosAnteriores", letra: "b", rotulo: "De Exercícios Anteriores", grupo: "RP Liquidados e Não Pagos" },
  { chave: "rpLiquidadosDoExercicio", letra: "c", rotulo: "Do Exercício", grupo: "RP Liquidados e Não Pagos" },
  { chave: "rpNaoLiquidadosAnteriores", letra: "d", rotulo: "RP Empenhados e Não Liquidados de Exerc. Anteriores", grupo: "Obrigações Financeiras" },
  { chave: "demaisObrigacoes", letra: "e", rotulo: "Demais Obrigações Financeiras", grupo: "Obrigações Financeiras" },
  { chave: "disponibilidadeLiquidaAntes", letra: "f", rotulo: "Disponibilidade Líquida (antes da inscrição)" },
  { chave: "rpnpInscritosNoExercicio", letra: "g", rotulo: "RP Não Liquidados Inscritos no Exercício" },
  { chave: "disponibilidadeLiquidaDepois", letra: "i", rotulo: "Disponibilidade Líquida (depois)" },
  { chave: "empenhosCanceladosPorInsuficiencia", letra: "j", rotulo: "Empenhos Não Liquidados Cancelados" },
];

/**
 * ⚠️ INTERRUPTOR VAZIO NOMEADO — `CANCELADOS-POR-INSUFICIENCIA`.
 *
 * A coluna quer os empenhos não liquidados CANCELADOS **por insuficiência financeira** —
 * o espelho da regra "RPNP só se inscreve se houver disponibilidade". O M08 registra o
 * cancelamento (`TipoMovimentoRestosAPagar.CANCELAMENTO`) e um `motivo String?` de TEXTO
 * LIVRE — ele não distingue o MOTIVO como fato.
 *
 * Inferir "insuficiência" de um texto livre seria adivinhar retroativamente a intenção
 * de quem cancelou, e carimbar de ilegalidade um cancelamento que pode ter sido por
 * objeto não entregue. Fica ZERO, nomeado, até o M08 ter o motivo como dado.
 */
const CANCELADOS_POR_INSUFICIENCIA = toMoney("0.00");

/** Fonte não vinculada = recurso livre. Hoje: o código 500 (o padrão do TCE-PB). */
function ehNaoVinculada(codigo: string): boolean {
  return codigo === "500";
}

export async function rgfAnexo5(
  prisma: Tx,
  p: { readonly exercicio: number; readonly corte: Date }
): Promise<Anexo5> {
  // (a) e (e) vêm do superávit por fonte — o dono do caixa por fonte, com as
  // amarrações S1/S2/S3 dele já rodando (inclusive o detector de dinheiro órfão).
  const superavit = await linhasDoSuperavitPorFonte(prisma, { corte: p.corte });
  // (b) e (d) — o dono dos restos, recortados a exercícios ANTERIORES.
  //
  // ⚠️ `exercicioOrigemAte: exercicio − 1` NÃO É DETALHE. A inscrição de RPNP do
  // exercício corrente nasce em 31/12 dele — dentro do corte. Sem o recorte, ela cairia
  // em (d) E em (g), e o mesmo RPNP seria descontado DUAS VEZES da disponibilidade: a
  // linha do FUNDEB do t5 sairia −25.000 em vez de −20.000.
  const restos = await restosAPagarPorFonte(prisma, {
    ate: p.corte,
    exercicioOrigemAte: p.exercicio - 1,
  });
  // (c) — o recorte por exercício, do dono da despesa.
  const obrigacoesDoExercicio = await obrigacoesDoExercicioPorFonte(prisma, {
    exercicio: p.exercicio,
    ate: p.corte,
  });
  // (g) — o que se inscreveu NESTE exercício.
  const rpnpDoExercicio = await rpnpInscritosPorFonte(prisma, {
    exercicio: p.exercicio,
  });

  // ⚠️ O PAREAMENTO id↔código VEM DO CADASTRO, não da ordem de duas coleções. As
  // linhas do superávit trazem o CÓDIGO; os mapas de restos/obrigações são indexados
  // pelo `fonteId`. Casá-los por posição funcionaria hoje e quebraria em silêncio no dia
  // em que uma das duas mudasse de ordenação — trocando os números de fonte entre si.
  const fontes = await prisma.fonteRecurso.findMany({
    select: { id: true, codigo: true },
  });
  const idPorCodigo = new Map(fontes.map((f) => [f.codigo, f.id]));

  const zero = toMoney("0.00");
  const linhas: LinhaAnexo5[] = [];
  let totalBruta = zero;
  let totalLiquidaDepois = zero;
  const fontesInsuficientes: string[] = [];

  for (const l of superavit.linhas) {
    const id = idPorCodigo.get(l.fonte);
    if (id === undefined) {
      // ⚠️ DEFENSIVO, e hoje INALCANÇÁVEL: o superávit também tira o código do
      // `FonteRecurso` (pelos joins do fato), então os dois lados leem o mesmo
      // cadastro. Fica porque custa nada e porque o dia em que o superávit passar a
      // derivar o código de outro lugar, o silêncio seria pior: somar zero aqui daria
      // à fonte uma disponibilidade que ela pode não ter.
      throw new Error(
        `FONTE ${l.fonte} não está no cadastro (FonteRecurso), mas tem caixa no ` +
          `superávit por fonte. O Anexo 5 não sabe atribuir as obrigações dela — e ` +
          `publicar a linha sem elas diria que a fonte tem disponibilidade que ela ` +
          `pode não ter.`
      );
    }

    const a = toMoney(l.caixa);
    const b = restos.get(id)?.processado ?? zero;
    const c = obrigacoesDoExercicio.get(id) ?? zero;
    const d = restos.get(id)?.naoProcessado ?? zero;
    const e = toMoney(l.consignacoesARepassar);
    const f = toMoney(a.minus(b).minus(c).minus(d).minus(e));
    const g = rpnpDoExercicio.get(id) ?? zero;
    const i = toMoney(f.minus(g));

    totalBruta = toMoney(totalBruta.plus(a));
    totalLiquidaDepois = toMoney(totalLiquidaDepois.plus(i));
    if (i.lessThan(0)) fontesInsuficientes.push(l.fonte);

    linhas.push({
      fonte: l.fonte,
      descricao: l.descricao,
      vinculado: !ehNaoVinculada(l.fonte),
      disponibilidadeBruta: serializar(a),
      rpLiquidadosAnteriores: serializar(b),
      rpLiquidadosDoExercicio: serializar(c),
      rpNaoLiquidadosAnteriores: serializar(d),
      demaisObrigacoes: serializar(e),
      empenhosCanceladosPorInsuficiencia: serializar(CANCELADOS_POR_INSUFICIENCIA),
      disponibilidadeLiquidaAntes: serializar(f),
      rpnpInscritosNoExercicio: serializar(g),
      disponibilidadeLiquidaDepois: serializar(i),
      insuficiente: i.lessThan(0),
    });
  }

  return {
    exercicio: p.exercicio,
    corte: p.corte,
    linhas,
    totalBruta: serializar(totalBruta),
    totalLiquidaDepois: serializar(totalLiquidaDepois),
    fontesInsuficientes,
  };
}

/**
 * (g) — OS RPNP INSCRITOS **NESTE** EXERCÍCIO, por fonte.
 *
 * ⚠️ `exercicioOrigem` é o ano em que a despesa foi EMPENHADA, e é ele que separa "o
 * que estou inscrevendo agora" (g) de "o que já estava inscrito" (b)/(d). O corte é a
 * própria inscrição: ela nasce no encerramento do exercício de origem.
 */
async function rpnpInscritosPorFonte(
  prisma: Tx,
  p: { readonly exercicio: number }
): Promise<ReadonlyMap<string, Money>> {
  const inscricoes = await prisma.inscricaoRestosAPagar.findMany({
    where: { exercicioOrigem: p.exercicio, tipo: "NAO_PROCESSADO" },
    select: {
      valorInscrito: true,
      empenho: { select: { ficha: { select: { fonteId: true } } } },
    },
  });

  const por = new Map<string, Money>();
  for (const i of inscricoes) {
    const id = i.empenho.ficha.fonteId;
    const antes = por.get(id) ?? toMoney("0.00");
    por.set(id, toMoney(antes.plus(toMoney(i.valorInscrito.toFixed(2)))));
  }
  return por;
}
