import { Prisma } from "../../prisma/generated/client/client.js";
import { Decimal, toMoney, serializar } from "../../packages/contracts/index.js";
import { diaCivilBr, fimDoDiaCivil, inicioDoDiaCivil } from "../../packages/datas/index.js";
import { cliente, PortaSemBancoError } from "./cliente.js";

export { PortaSemBancoError };

/**
 * ═══ A CONSULTA PÚBLICA DE RECEITAS (V11 V4 · família Receitas) ═══
 *
 * ⚠️ UMA LINHA POR GUIA, E OS VALORES SÃO LÍQUIDOS. A anulação de uma guia é fato novo
 * (append-only), e publicar o bruto mostraria dinheiro que foi desfeito. Vão os três números —
 * arrecadado, anulado e líquido — porque publicar só o líquido esconderia que houve anulação.
 *
 * ⚠️⚠️ CONSTITUIÇÃO E ARRECADAÇÃO NÃO SE SOMAM, E ESTE É O ERRO QUE ESTE ARQUIVO EXISTE PARA
 * NÃO COMETER. `ReceitaReconhecida` é o crédito que NASCEU (o IPTU lançado, o serviço prestado);
 * `ReceitaArrecadada` é o dinheiro que ENTROU, e ele BAIXA aquele crédito. São o mesmo dinheiro
 * em dois momentos. Somar os dois num "total de receitas" dobraria a arrecadação do município no
 * portal — e é exatamente o que a ordem V11 proíbe. Aqui eles aparecem em painéis separados, com
 * a explicação ao lado, e NENHUM total os junta.
 *
 * ⚠️ SIGILO FISCAL (CTN art. 198). `ReceitaReconhecida.contribuinteRef` é referência opaca do
 * cadastro tributário e NUNCA sai daqui — o crédito constituído é publicado AGREGADO por
 * natureza e fonte, jamais linha a linha. O M13 já tem grep-teste provando essa ausência nos
 * datasets, e esta porta segue a mesma regra.
 *
 * ⚠️ OS TOTAIS SÃO DO RECORTE INTEIRO, agregados no banco — a lição do V10 T3. Um rodapé que
 * desiste acima de N linhas esconde justamente o número que o cidadão veio buscar.
 */

/** O contrato público: o que esta consulta pode devolver. Ver o teste de negação. */
export const CAMPOS_PUBLICOS_DA_RECEITA = [
  "id", "numero", "data", "exercicio", "natureza", "fonte", "codigoAcompanhamento",
  "arrecadado", "anulado", "liquido", "situacao",
] as const;

/**
 * ⚠️ O QUE NUNCA PODE SAIR. `contribuinteRef` quebra sigilo fiscal; `criadoPor` é o servidor que
 * digitou, e expor o nome dele no portal é dado pessoal sem finalidade pública;
 * `contaBancariaId` é conta do ente.
 */
export const CAMPOS_NUNCA_PUBLICOS_DA_RECEITA = [
  "contribuinteRef", "criadoPor", "contaBancariaId", "lancamentoId", "historico",
] as const;

export type SituacaoDaGuia = "Arrecadada" | "Parcialmente anulada" | "Anulada";

export interface ReceitaPublicaNaLista {
  readonly id: string;
  readonly numero: string;
  readonly data: string;
  readonly exercicio: number;
  readonly natureza: string;
  readonly fonte: string;
  readonly codigoAcompanhamento: string | null;
  readonly arrecadado: string;
  readonly anulado: string;
  readonly liquido: string;
  readonly situacao: SituacaoDaGuia;
}

export interface FiltrosDasReceitasPublicas {
  readonly q?: string;
  readonly exercicio?: string;
  readonly fonte?: string;
  readonly natureza?: string;
  readonly situacao?: string;
  readonly de?: string;
  readonly ate?: string;
  readonly ordem?: "data" | "valor" | "numero";
  readonly direcao?: "asc" | "desc";
  readonly pagina?: number;
  readonly porPagina?: number;
}

export interface PrevisaoPublica {
  readonly exercicio: number;
  readonly inicial: string;
  readonly ajustes: string;
  readonly atualizada: string;
  readonly realizado: string;
  /** Realizado ÷ atualizada, em pontos percentuais com duas casas. `null` sem previsão. */
  readonly execucao: string | null;
}

export interface PaginaDeReceitasPublicas {
  readonly linhas: readonly ReceitaPublicaNaLista[];
  readonly total: number;
  readonly pagina: number;
  readonly porPagina: number;
  readonly paginas: number;
  readonly exerciciosDisponiveis: readonly number[];
  readonly fontesDisponiveis: readonly { readonly valor: string; readonly rotulo: string }[];
  /** Do recorte INTEIRO, agregados no banco. Nunca da página. */
  readonly totais: { readonly arrecadado: string; readonly anulado: string; readonly liquido: string };
  /** `null` quando não há exercício escolhido ou não há previsão cadastrada. */
  readonly previsao: PrevisaoPublica | null;
  /**
   * O crédito CONSTITUÍDO no exercício, agregado. Fica FORA de qualquer total com a
   * arrecadação — ver o cabeçalho.
   */
  readonly constituido: string | null;
  readonly atualizadoEm: string;
}

export const PADRAO_POR_PAGINA_RECEITA = 25;

export function ehSituacaoDaGuia(v: string): v is SituacaoDaGuia {
  return v === "Arrecadada" || v === "Parcialmente anulada" || v === "Anulada";
}

/**
 * ⚠️ O FILTRO É O MESMO EM TODA PARTE — tela, contagem, rodapé e CSV. Montá-lo uma vez e passá-lo
 * às quatro consultas é o que impede o defeito do V10 T3, em que o CSV filtrava DEPOIS de trazer
 * as primeiras N linhas e falava de um conjunto diferente do que a tela mostrava.
 */
function condicoes(f: FiltrosDasReceitasPublicas): Prisma.Sql {
  const partes: Prisma.Sql[] = [Prisma.sql`r."estornoDeId" IS NULL`];

  const exercicio = Number(f.exercicio ?? "");
  if (Number.isInteger(exercicio) && exercicio > 0) partes.push(Prisma.sql`r.exercicio = ${exercicio}`);

  const fonte = (f.fonte ?? "").trim();
  if (fonte !== "") partes.push(Prisma.sql`r."fonteId" = ${fonte}`);

  const natureza = (f.natureza ?? "").trim();
  // Prefixo: a natureza é hierárquica (1112.05.01…), e filtrar por "1112" tem de trazer os filhos.
  if (natureza !== "") partes.push(Prisma.sql`nr.codigo LIKE ${`${natureza}%`}`);

  const de = (f.de ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(de)) partes.push(Prisma.sql`r."dataArrecadacao" >= ${inicioDoDiaCivil(de)}`);
  const ate = (f.ate ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(ate)) partes.push(Prisma.sql`r."dataArrecadacao" <= ${fimDoDiaCivil(ate)}`);

  const q = (f.q ?? "").trim();
  if (q !== "") {
    partes.push(Prisma.sql`(r."numeroReceita" ILIKE ${`%${q}%`} OR nr.descricao ILIKE ${`%${q}%`} OR nr.codigo LIKE ${`${q}%`})`);
  }

  const situacao = (f.situacao ?? "").trim();
  if (ehSituacaoDaGuia(situacao)) {
    // ⚠️ A SITUAÇÃO É DERIVADA, e por isso o predicado dela vive no MESMO SQL que conta e soma.
    // Filtrá-la sobre a página já carregada foi o defeito que o V10 T3 consertou na despesa.
    if (situacao === "Anulada") partes.push(Prisma.sql`COALESCE(a.anulado, 0) >= r.valor`);
    else if (situacao === "Arrecadada") partes.push(Prisma.sql`COALESCE(a.anulado, 0) = 0`);
    else partes.push(Prisma.sql`COALESCE(a.anulado, 0) > 0 AND COALESCE(a.anulado, 0) < r.valor`);
  }

  return Prisma.join(partes, " AND ");
}

/**
 * A base: cada guia ORIGINAL com o quanto dela foi anulado.
 *
 * ⚠️ O ESTORNO DO ESTORNO CONTA. Uma anulação pode ela própria ser anulada, e nesse caso a guia
 * volta a valer. `viva` exclui toda linha que tenha alguém apontando para ela — é a mesma regra
 * de `packages/estornaveis`, escrita em SQL.
 */
function base(f: FiltrosDasReceitasPublicas): Prisma.Sql {
  return Prisma.sql`
    WITH viva AS (
      SELECT x.id FROM "ReceitaArrecadada" x
      WHERE NOT EXISTS (SELECT 1 FROM "ReceitaArrecadada" y WHERE y."estornoDeId" = x.id)
    ),
    a AS (
      SELECT e."estornoDeId" AS orig, SUM(e.valor) AS anulado
      FROM "ReceitaArrecadada" e
      WHERE e."estornoDeId" IS NOT NULL AND e.id IN (SELECT id FROM viva)
      GROUP BY e."estornoDeId"
    ),
    b AS (
      SELECT
        r.id,
        r."numeroReceita" AS numero,
        r."dataArrecadacao" AS data,
        r.exercicio,
        nr.codigo AS nat_codigo,
        nr.descricao AS nat_descricao,
        fr.codigo AS fonte_codigo,
        fr.descricao AS fonte_descricao,
        co.codigo AS co_codigo,
        r.valor AS arrecadado,
        COALESCE(a.anulado, 0) AS anulado,
        r.valor - COALESCE(a.anulado, 0) AS liquido
      FROM "ReceitaArrecadada" r
      JOIN "NaturezaReceita" nr ON nr.id = r."naturezaReceitaId"
      JOIN "FonteRecurso" fr ON fr.id = r."fonteId"
      LEFT JOIN "CodigoAcompanhamento" co ON co.id = r."coId"
      LEFT JOIN a ON a.orig = r.id
      WHERE ${condicoes(f)}
    )`;
}

function situacaoDe(arrecadado: Decimal, anulado: Decimal): SituacaoDaGuia {
  if (anulado.lte(0)) return "Arrecadada";
  return anulado.gte(arrecadado) ? "Anulada" : "Parcialmente anulada";
}

export async function listarReceitasPublicas(f: FiltrosDasReceitasPublicas = {}): Promise<PaginaDeReceitasPublicas> {
  const prisma = cliente();
  const porPagina = Math.min(100, Math.max(1, f.porPagina ?? PADRAO_POR_PAGINA_RECEITA));
  const pagina = Math.max(1, f.pagina ?? 1);
  const coluna = f.ordem === "valor" ? Prisma.raw("b.liquido") : f.ordem === "numero" ? Prisma.raw("b.numero") : Prisma.raw("b.data");
  const dir = Prisma.raw(f.direcao === "asc" ? "ASC" : "DESC");

  const [agregado, linhas, exercicios, fontes] = await Promise.all([
    prisma.$queryRaw<readonly { readonly total: bigint; readonly arrecadado: string | null; readonly anulado: string | null; readonly liquido: string | null }[]>(
      Prisma.sql`${base(f)} SELECT COUNT(*)::bigint AS total, SUM(b.arrecadado)::text AS arrecadado, SUM(b.anulado)::text AS anulado, SUM(b.liquido)::text AS liquido FROM b`,
    ),
    prisma.$queryRaw<readonly {
      readonly id: string; readonly numero: string; readonly data: Date; readonly exercicio: number;
      readonly nat_codigo: string; readonly nat_descricao: string; readonly fonte_codigo: string;
      readonly fonte_descricao: string; readonly co_codigo: string | null;
      readonly arrecadado: string; readonly anulado: string; readonly liquido: string;
    }[]>(
      // ⚠️ O DESEMPATE POR `id` É OBRIGATÓRIO. Sem ele, duas guias com a mesma data podem trocar
      // de página entre requisições e uma delas nunca ser vista. Medido no V10 T3.
      Prisma.sql`${base(f)} SELECT * FROM b ORDER BY ${coluna} ${dir}, b.id ASC LIMIT ${porPagina} OFFSET ${(pagina - 1) * porPagina}`,
    ),
    prisma.receitaArrecadada.findMany({ distinct: ["exercicio"], select: { exercicio: true }, orderBy: { exercicio: "desc" } }),
    prisma.fonteRecurso.findMany({ select: { id: true, codigo: true, descricao: true }, orderBy: { codigo: "asc" } }),
  ]);

  const ag = agregado[0] ?? { total: 0n, arrecadado: null, anulado: null, liquido: null };
  const total = Number(ag.total);

  const exercicioEscolhido = Number(f.exercicio ?? "");
  const previsao = Number.isInteger(exercicioEscolhido) && exercicioEscolhido > 0 ? await previsaoDoExercicio(prisma, exercicioEscolhido) : null;
  const constituido = Number.isInteger(exercicioEscolhido) && exercicioEscolhido > 0 ? await constituidoDoExercicio(prisma, exercicioEscolhido) : null;

  return {
    linhas: linhas.map((l) => {
      const arrecadado = toMoney(new Decimal(l.arrecadado));
      const anulado = toMoney(new Decimal(l.anulado));
      return {
        id: l.id,
        numero: l.numero,
        data: diaCivilBr(l.data),
        exercicio: l.exercicio,
        natureza: `${l.nat_codigo} — ${l.nat_descricao}`,
        fonte: `${l.fonte_codigo} — ${l.fonte_descricao}`,
        codigoAcompanhamento: l.co_codigo,
        arrecadado: serializar(arrecadado),
        anulado: serializar(anulado),
        liquido: serializar(toMoney(new Decimal(l.liquido))),
        situacao: situacaoDe(arrecadado, anulado),
      };
    }),
    total,
    pagina,
    porPagina,
    paginas: Math.max(1, Math.ceil(total / porPagina)),
    exerciciosDisponiveis: exercicios.map((e) => e.exercicio),
    fontesDisponiveis: fontes.map((x) => ({ valor: x.id, rotulo: `${x.codigo} — ${x.descricao}` })),
    totais: {
      arrecadado: serializar(toMoney(new Decimal(ag.arrecadado ?? "0"))),
      anulado: serializar(toMoney(new Decimal(ag.anulado ?? "0"))),
      liquido: serializar(toMoney(new Decimal(ag.liquido ?? "0"))),
    },
    previsao,
    constituido,
    atualizadoEm: diaCivilBr(new Date()),
  };
}

type Leitor = ReturnType<typeof cliente>;

/**
 * PREVISÃO INICIAL, AJUSTES E ATUALIZADA — os três, porque os três são notícia diferente.
 * A inicial é o que a LOA aprovou; os ajustes são as reprevisões (append-only, com sinal); a
 * atualizada é a soma. Publicar só a atualizada esconderia que a previsão mudou no meio do ano.
 */
async function previsaoDoExercicio(prisma: Leitor, exercicio: number): Promise<PrevisaoPublica | null> {
  const [previstas, ajustes, realizado] = await Promise.all([
    prisma.receitaPrevista.findMany({ where: { exercicio }, select: { valorPrevisto: true, tipoReceita: true } }),
    prisma.receitaReprevista.findMany({ where: { exercicio }, select: { valorAjuste: true } }),
    prisma.$queryRaw<readonly { readonly liquido: string | null }[]>(
      Prisma.sql`${base({ exercicio: String(exercicio) })} SELECT SUM(b.liquido)::text AS liquido FROM b`,
    ),
  ]);
  if (previstas.length === 0 && ajustes.length === 0) return null;

  // ⚠️ A DEDUÇÃO ENTRA COM SINAL NEGATIVO, como em `previsaoPorFonte` do M02: a previsão de
  // receita do município é a bruta MENOS as deduções (FUNDEB, renúncias). Somar tudo como
  // positivo publicaria uma previsão maior que a que a LOA aprovou.
  const inicial = previstas.reduce((acc, p) => {
    const v = toMoney(p.valorPrevisto.toFixed(2));
    return p.tipoReceita === "DEDUCAO" ? toMoney(acc.minus(v)) : toMoney(acc.plus(v));
  }, toMoney("0.00"));
  const somaAjustes = ajustes.reduce((acc, a) => toMoney(acc.plus(toMoney(a.valorAjuste.toFixed(2)))), toMoney("0.00"));
  const atualizada = toMoney(inicial.plus(somaAjustes));
  const real = toMoney(new Decimal(realizado[0]?.liquido ?? "0"));

  return {
    exercicio,
    inicial: serializar(inicial),
    ajustes: serializar(somaAjustes),
    atualizada: serializar(atualizada),
    realizado: serializar(real),
    execucao: atualizada.lte(0) ? null : real.dividedBy(atualizada).times(100).toDecimalPlaces(2).toFixed(2),
  };
}

/**
 * O CRÉDITO CONSTITUÍDO NO EXERCÍCIO — agregado, e só agregado.
 *
 * ⚠️ NUNCA LINHA A LINHA. `ReceitaReconhecida.contribuinteRef` amarra o crédito ao cadastro
 * tributário do contribuinte; publicar a linha seria publicar "IPTU, 1.240,00, inscrição X", que
 * é quebra de sigilo fiscal (CTN art. 198) em nome da transparência.
 *
 * ⚠️ E ELE NÃO SE SOMA À ARRECADAÇÃO. Ver o cabeçalho do arquivo.
 */
async function constituidoDoExercicio(prisma: Leitor, exercicio: number): Promise<string | null> {
  const borda = { gte: inicioDoDiaCivil(`${exercicio}-01-01`), lte: fimDoDiaCivil(`${exercicio}-12-31`) };
  const linhas = await prisma.receitaReconhecida.findMany({
    where: { dataFatoGerador: borda },
    select: { id: true, valor: true, cancelamentos: { select: { id: true } } },
  });
  if (linhas.length === 0) return null;
  // Crédito cancelado não é crédito: o cancelamento é fato próprio (VPD), e somá-lo publicaria
  // um crédito que o ente já reconheceu como inexistente.
  const vivo = linhas.filter((l) => l.cancelamentos.length === 0);
  return serializar(vivo.reduce((acc, l) => toMoney(acc.plus(toMoney(l.valor.toFixed(2)))), toMoney("0.00")));
}
