import { Prisma } from "../../prisma/generated/client/client.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";

/**
 * ═══ O ESTADO DERIVADO DA DESPESA, RESOLVIDO NO BANCO (V10 T3 · N2) ═══
 *
 * ═══ ⚠️ AS DUAS PENDÊNCIAS QUE ISTO FECHA, E POR QUE ELAS ERAM A MESMA ═══
 *   · `DESPESAS-FASE-FILTRADA-NA-PAGINA` — a fase (empenhada/liquidada/paga/anulada) é
 *     DERIVADA da cadeia, e filtrar por ela sobre a página já carregada dá uma lista em que a
 *     contagem, o número de páginas e o CSV falam de conjuntos diferentes;
 *   · `DESPESAS-TOTAIS-ACIMA-DE-2000` — somar exigia carregar a cadeia de cada empenho em
 *     memória, e acima de dois mil o rodapé desistia e dizia por quê.
 *
 * As duas são a mesma coisa: **o predicado e a soma precisavam do estado derivado, e ele só
 * existia em TypeScript.** Este arquivo o põe no banco, e aí filtrar, contar, paginar, somar e
 * exportar passam a falar do MESMO conjunto — que é o que a ordem V10 cobra.
 *
 * ═══ ⚠️ ISTO É UMA SEGUNDA IMPLEMENTAÇÃO DA MESMA ARITMÉTICA, E ISSO É DELIBERADO ═══
 * `packages/estornaveis` continua sendo a régua do domínio. O SQL abaixo repete a regra dela
 * em outra linguagem — e a regra deste repositório sobre isso é clara: *"parser se testa
 * contra implementação independente"*. `test/despesas-derivadas.test.ts` roda as duas sobre as
 * MESMAS linhas e exige o mesmo número. Se divergirem, o teste acusa qual.
 *
 * ⚠️ E A SEGUNDA IMPLEMENTAÇÃO JÁ CORRIGIU UM DEFEITO DA PRIMEIRA. A projeção em TypeScript
 * carregava, de cada empenho, os seus estornos e as suas parciais — mas NÃO os estornos DAS
 * PARCIAIS (eles apontam para a parcial, não para o empenho). Uma anulação parcial que fosse
 * ela própria estornada continuava subtraindo. Aqui o conjunto de estornados é global, e o
 * caso fica certo; o teste `D7` o exercita nas duas direções.
 *
 * ═══ ⚠️ NENHUM JOIN QUE MULTIPLIQUE ═══
 * Liquidações e pagamentos são agregados em CTEs próprias, com `GROUP BY`, e só então
 * juntados ao empenho. Somar num join direto multiplicaria o empenho pelo número de
 * liquidações — e "uma fase não é despesa nova para somar à outra", como diz a ordem.
 */

export type FaseDaDespesa = "Empenhada" | "Liquidada" | "Paga" | "Anulada";

export const FASES: readonly FaseDaDespesa[] = ["Empenhada", "Liquidada", "Paga", "Anulada"];

export function ehFase(v: string): v is FaseDaDespesa {
  return (FASES as readonly string[]).includes(v);
}

export interface FiltrosDerivados {
  readonly q?: string | undefined;
  readonly exercicio?: number | undefined;
  readonly unidadeOrcId?: string | undefined;
  readonly de?: Date | undefined;
  readonly ate?: Date | undefined;
  readonly fase?: FaseDaDespesa | undefined;
  /**
   * ⚠️ O RECORTE POR ID, para `derivadasDe`. Sem ele, projetar as 25 linhas de uma página
   * obrigaria as CTEs a agregar a tabela inteira de liquidações e pagamentos — a cada
   * requisição. Com ele, o conjunto de empenhos é fechado primeiro e as agregações só olham o
   * que pertence a ele.
   */
  readonly ids?: readonly string[] | undefined;
}

export type OrdemDaDespesa = "data" | "numero" | "valor";

/**
 * ⚠️ A CADEIA LÍQUIDA DE UMA TABELA APPEND-ONLY, EM SQL, RESTRITA AO CONJUNTO FILTRADO. A regra
 * é a de `packages/estornaveis`, dita em três partes:
 *   · ESTORNADOS — os ids que alguma linha nega por `estornoDeId`;
 *   · PARCIAIS VIVAS — as que reduzem, e que não foram elas próprias estornadas;
 *   · VIVOS — os originais que não são anulação e não foram anulados TOTALMENTE.
 *
 * ⚠️ E O `IN (SELECT id FROM e_filtrados)` NÃO É DETALHE DE DESEMPENHO SÓ: sem ele, cada
 * requisição de uma página de 25 linhas agregaria as tabelas inteiras de liquidações e
 * pagamentos do município. O conjunto de empenhos é fechado PRIMEIRO, e as agregações só olham
 * o que pertence a ele.
 */
function cadeiaDaLiquidacao(): Prisma.Sql {
  return Prisma.sql`
    SELECT x."empenhoId" AS pai, SUM(x.valor - COALESCE(p.reducao, 0)) AS liquido
    FROM "Liquidacao" x
    LEFT JOIN (
      SELECT y."anulacaoParcialDeId" AS alvo, SUM(y.valor) AS reducao
      FROM "Liquidacao" y
      WHERE y."anulacaoParcialDeId" IS NOT NULL
        AND y."estornoDeId" IS NULL
        AND NOT EXISTS (SELECT 1 FROM "Liquidacao" z WHERE z."estornoDeId" = y.id)
      GROUP BY 1
    ) p ON p.alvo = x.id
    WHERE x."empenhoId" IN (SELECT id FROM e_filtrados)
      AND x."estornoDeId" IS NULL
      AND x."anulacaoParcialDeId" IS NULL
      AND NOT EXISTS (SELECT 1 FROM "Liquidacao" w WHERE w."estornoDeId" = x.id)
    GROUP BY 1`;
}

/** O mesmo, para o pagamento — cujo pai é a LIQUIDAÇÃO, e o agrupamento é pelo EMPENHO dela. */
function cadeiaDoPagamento(): Prisma.Sql {
  return Prisma.sql`
    SELECT l."empenhoId" AS pai, SUM(x.valor - COALESCE(p.reducao, 0)) AS liquido
    FROM "Pagamento" x
    JOIN "Liquidacao" l ON l.id = x."liquidacaoId"
    LEFT JOIN (
      SELECT y."anulacaoParcialDeId" AS alvo, SUM(y.valor) AS reducao
      FROM "Pagamento" y
      WHERE y."anulacaoParcialDeId" IS NOT NULL
        AND y."estornoDeId" IS NULL
        AND NOT EXISTS (SELECT 1 FROM "Pagamento" z WHERE z."estornoDeId" = y.id)
      GROUP BY 1
    ) p ON p.alvo = x.id
    WHERE l."empenhoId" IN (SELECT id FROM e_filtrados)
      AND x."estornoDeId" IS NULL
      AND x."anulacaoParcialDeId" IS NULL
      AND NOT EXISTS (SELECT 1 FROM "Pagamento" w WHERE w."estornoDeId" = x.id)
    GROUP BY 1`;
}

function filtros(f: FiltrosDerivados): Prisma.Sql {
  const partes: Prisma.Sql[] = [
    // ⚠️ SÓ OS EMPENHOS ORIGINAIS ENTRAM NA LISTA. Anulação total e parcial são LINHAS de
    // empenho; listá-las mostraria "empenhos" que são correções de outros.
    Prisma.sql`e."estornoDeId" IS NULL AND e."anulacaoParcialDeId" IS NULL`,
  ];
  const q = (f.q ?? "").trim();
  if (q !== "") {
    const like = `%${q}%`;
    const soDigitos = `%${q.replace(/[^0-9A-Za-z]/g, "")}%`;
    partes.push(
      Prisma.sql`(e.numero ILIKE ${like} OR e.historico ILIKE ${like} OR e."credorCpfCnpj" LIKE ${soDigitos})`
    );
  }
  if (f.exercicio !== undefined) partes.push(Prisma.sql`fo.exercicio = ${f.exercicio}`);
  if (f.unidadeOrcId !== undefined && f.unidadeOrcId !== "") {
    partes.push(Prisma.sql`fo."unidadeOrcId" = ${f.unidadeOrcId}`);
  }
  // ⚠️ AS BORDAS JÁ CHEGAM COMO INSTANTES DO DIA CIVIL DO ENTE (`inicioDoDiaCivil` /
  // `fimDoDiaCivil`, resolvidos pelo chamador). Aqui não se converte data nenhuma.
  if (f.de !== undefined) partes.push(Prisma.sql`e.data >= ${f.de}`);
  if (f.ate !== undefined) partes.push(Prisma.sql`e.data <= ${f.ate}`);
  if (f.ids !== undefined) {
    partes.push(f.ids.length === 0 ? Prisma.sql`FALSE` : Prisma.sql`e.id IN (${Prisma.join([...f.ids])})`);
  }
  return Prisma.join(partes, " AND ");
}

/**
 * ⚠️ A FASE, EM SQL, COM A MESMA ÁRVORE DE DECISÃO DA PROJEÇÃO — e a ordem importa:
 * anulada primeiro (empenhado ≤ 0), depois paga, depois liquidada, depois empenhada.
 * "Paga" é o ESTÁGIO alcançado, não "pagou tudo": pagamento parcial existe.
 */
function predicadoDaFase(fase: FaseDaDespesa | undefined): Prisma.Sql {
  if (fase === undefined) return Prisma.sql`TRUE`;
  if (fase === "Anulada") return Prisma.sql`b.empenhado <= 0`;
  if (fase === "Paga") return Prisma.sql`b.empenhado > 0 AND b.pago > 0`;
  if (fase === "Liquidada") return Prisma.sql`b.empenhado > 0 AND b.pago <= 0 AND b.liquidado > 0`;
  return Prisma.sql`b.empenhado > 0 AND b.pago <= 0 AND b.liquidado <= 0`;
}

function base(f: FiltrosDerivados): Prisma.Sql {
  return Prisma.sql`
    WITH e_filtrados AS (
      SELECT e.id, e.data, e.numero, e.valor
      FROM "Empenho" e
      JOIN "FichaOrcamentaria" fo ON fo.id = e."fichaId"
      WHERE ${filtros(f)}
    ),
         liq AS (${cadeiaDaLiquidacao()}),
         pag AS (${cadeiaDoPagamento()}),
         emp_parcial AS (
           SELECT y."anulacaoParcialDeId" AS alvo, SUM(y.valor) AS reducao
           FROM "Empenho" y
           WHERE y."anulacaoParcialDeId" IN (SELECT id FROM e_filtrados)
             AND y."estornoDeId" IS NULL
             AND NOT EXISTS (SELECT 1 FROM "Empenho" z WHERE z."estornoDeId" = y.id)
           GROUP BY 1
         ),
         b AS (
           SELECT
             e.id,
             e.data,
             e.numero,
             e.valor AS valor_original,
             -- ⚠️ O EMPENHO ANULADO TOTALMENTE CONTINUA NA LISTA, com líquido ZERO: é assim
             -- que ele aparece como "Anulada" em vez de sumir. Sumir esconderia do cidadão
             -- que a despesa existiu e foi desfeita.
             CASE WHEN EXISTS (SELECT 1 FROM "Empenho" w WHERE w."estornoDeId" = e.id)
                  THEN 0::numeric
                  ELSE e.valor - COALESCE(ep.reducao, 0)
             END AS empenhado,
             COALESCE(liq.liquido, 0)::numeric AS liquidado,
             COALESCE(pag.liquido, 0)::numeric AS pago
           FROM e_filtrados e
           LEFT JOIN emp_parcial ep ON ep.alvo = e.id
           LEFT JOIN liq ON liq.pai = e.id
           LEFT JOIN pag ON pag.pai = e.id
         )`;
}

export interface TotaisDerivados {
  readonly total: number;
  readonly empenhado: string;
  readonly liquidado: string;
  readonly pago: string;
}

/**
 * A CONTAGEM E OS TOTAIS DO RECORTE INTEIRO — uma consulta, sem teto.
 *
 * ⚠️ SEM TETO, E É O PONTO. O rodapé que desistia acima de dois mil empenhos dizia ao cidadão
 * "estreite a busca para ver o total" — e o total do exercício é exatamente o número que ele
 * foi buscar.
 */
export async function totaisDerivados(prisma: PrismaClient, f: FiltrosDerivados): Promise<TotaisDerivados> {
  const linhas = await prisma.$queryRaw<
    readonly { total: bigint; empenhado: string | null; liquidado: string | null; pago: string | null }[]
  >(Prisma.sql`
    ${base(f)}
    SELECT COUNT(*)::bigint AS total,
           COALESCE(SUM(b.empenhado), 0)::text AS empenhado,
           COALESCE(SUM(b.liquidado), 0)::text AS liquidado,
           COALESCE(SUM(b.pago), 0)::text AS pago
    FROM b
    WHERE ${predicadoDaFase(f.fase)}`);
  const r = linhas[0];
  return {
    total: Number(r?.total ?? 0n),
    empenhado: r?.empenhado ?? "0",
    liquidado: r?.liquidado ?? "0",
    pago: r?.pago ?? "0",
  };
}

/**
 * OS IDS DA PÁGINA, na ordem pedida.
 *
 * ⚠️ O DESEMPATE POR `id` NÃO É ENFEITE: sem ele, dois empenhos do mesmo dia (ou do mesmo
 * valor) podem trocar de lugar entre uma página e a seguinte, e uma linha aparece duas vezes
 * enquanto outra some. É a paginação estável que a ordem V10 pede.
 */
export async function idsDaPagina(
  prisma: PrismaClient,
  f: FiltrosDerivados,
  ordem: OrdemDaDespesa,
  direcao: "asc" | "desc",
  pular: number,
  levar: number
): Promise<readonly string[]> {
  const dir = Prisma.raw(direcao === "asc" ? "ASC" : "DESC");
  const coluna = Prisma.raw(ordem === "valor" ? "b.valor_original" : ordem === "numero" ? "b.numero" : "b.data");
  const linhas = await prisma.$queryRaw<readonly { id: string }[]>(Prisma.sql`
    ${base(f)}
    SELECT b.id
    FROM b
    WHERE ${predicadoDaFase(f.fase)}
    ORDER BY ${coluna} ${dir}, b.id ASC
    LIMIT ${levar} OFFSET ${pular}`);
  return linhas.map((l) => l.id);
}

/** O estado derivado de um conjunto de ids — para conferir a projeção contra o banco. */
export async function derivadasDe(
  prisma: PrismaClient,
  ids: readonly string[]
): Promise<ReadonlyMap<string, { readonly empenhado: string; readonly liquidado: string; readonly pago: string }>> {
  if (ids.length === 0) return new Map();
  const linhas = await prisma.$queryRaw<
    readonly { id: string; empenhado: string; liquidado: string; pago: string }[]
  >(Prisma.sql`
    ${base({ ids })}
    SELECT b.id, b.empenhado::text AS empenhado, b.liquidado::text AS liquidado, b.pago::text AS pago
    FROM b`);
  return new Map(linhas.map((l) => [l.id, { empenhado: l.empenhado, liquidado: l.liquidado, pago: l.pago }]));
}
