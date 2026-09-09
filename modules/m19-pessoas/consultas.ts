import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { normalizarDocumento } from "../../packages/documento/index.js";
import type { PapelDePessoa } from "./dominio.js";

/**
 * M19 — as CONSULTAS da listagem. Leitura, nunca escrita.
 *
 * ═══ ⚠️ POR QUE ESTA LISTAGEM É SQL CRU, E NÃO `prisma.pessoa.findMany` ═══
 * O cadastro é append-only: o nome e a situação vigentes são os da ÚLTIMA versão. Em
 * Prisma, `where: { versoes: { some: { nome: { contains: "alfa" } } } }` procura em
 * QUALQUER versão — inclusive nas antigas. Uma empresa que se chamava "Alfa" e hoje se
 * chama "Beta" apareceria na busca por "alfa", exibindo "Beta" na coluna. O usuário
 * pesquisou uma coisa e recebeu outra, sem erro nenhum.
 *
 * `DISTINCT ON` é a ferramenta que o Postgres tem para "a última linha de cada grupo", e
 * é o que faz o filtro cair sobre a versão VIGENTE. Não há como expressar isso no
 * `findMany` sem trazer todas as versões de todas as pessoas para a memória.
 *
 * ⚠️ E A DERIVAÇÃO PASSA A EXISTIR EM DOIS LUGARES — este SQL e o `papeisVigentesEm` do
 * domínio. É dívida conhecida, e a rede contra ela é `m19-consultas.test.ts`, que
 * confronta os papéis desta consulta com os do domínio sobre os MESMOS dados. Duas
 * leituras independentes do mesmo fato: é a única forma de pegar divergência entre elas,
 * e é o desenho da `conferirDotacaoContraRazao` (M05).
 */

export interface PessoaNaLista {
  readonly id: string;
  readonly documento: string;
  readonly tipo: "FISICA" | "JURIDICA";
  readonly nome: string;
  readonly ativa: boolean;
  readonly papeis: readonly PapelDePessoa[];
}

export interface FiltroDePessoas {
  /**
   * Texto livre: casa por NOME (parcial) **ou** por DOCUMENTO (prefixo).
   *
   * ⚠️ OU, NÃO E. Quem digita "11222" está procurando o CNPJ — exigir que o NOME também
   * contivesse "11222" não devolveria nada, e a tela diria "nenhum resultado" para uma
   * empresa que está lá.
   */
  readonly busca?: string | undefined;
  readonly papel?: PapelDePessoa | undefined;
  /** `undefined` = todas; `true` só ativas; `false` só inativas. */
  readonly ativa?: boolean | undefined;
  readonly limite?: number | undefined;
  readonly deslocamento?: number | undefined;
}

/** Teto duro: listagem sem limite é um `SELECT *` esperando a tabela crescer. */
const LIMITE_MAXIMO = 200;
const LIMITE_PADRAO = 50;

interface LinhaCrua {
  id: string;
  documento: string;
  tipo: "FISICA" | "JURIDICA";
  nome: string;
  ativa: boolean;
  /**
   * ⚠️ CHEGA COMO TEXTO, NÃO COMO ARRAY. O `$queryRaw` do Prisma não converte array do
   * Postgres para array de JavaScript quando o tipo do elemento é um ENUM: o que sobe é
   * o literal `{CREDOR,SERVIDOR}`. Tipar isto como `PapelDePessoa[]` compilava e mentia —
   * um `[...papeis]` espalhava a string em LETRAS, e a tela mostraria "C", "R", "E"...
   *
   * Foi o teste de confrontação SQL × domínio que pegou (`m19-consultas.test.ts`): os
   * filtros passavam, porque quem filtra é o Postgres; só a comparação com a derivação
   * pura mostrou o que de fato voltava.
   */
  papeis: string | PapelDePessoa[];
  total: bigint;
}

/**
 * O literal de array do Postgres -> array de verdade. `{}` é lista vazia; `{A,B}` são
 * dois itens. Não há aspas nem vírgula dentro de um valor de enum, então o `split` basta
 * — e um parser genérico de array do Postgres seria código que ninguém aqui precisa.
 */
function paraArrayDePapeis(bruto: string | PapelDePessoa[]): readonly PapelDePessoa[] {
  if (Array.isArray(bruto)) return bruto;
  const interno = bruto.trim().replace(/^\{/, "").replace(/\}$/, "");
  if (interno === "") return [];
  return interno.split(",") as PapelDePessoa[];
}

/**
 * ⚠️ TUDO PARAMETRIZADO. Não há interpolação de entrada do usuário neste SQL — o texto da
 * busca vai como `$2`, e é o Postgres que o trata como dado. O único texto montado em
 * JavaScript é o `%` do LIKE, que é literal nosso.
 */
const SQL_LISTAR = `
WITH vigente AS (
  SELECT DISTINCT ON (v."pessoaId")
         v."pessoaId", v.nome, v.ativa
    FROM "VersaoDePessoa" v
   ORDER BY v."pessoaId", v."criadoEm" DESC, v.id DESC
),
papel_vigente AS (
  SELECT DISTINCT ON (m."pessoaId", m.papel)
         m."pessoaId", m.papel, m.movimento
    FROM "MovimentoDePapelDaPessoa" m
   WHERE m.data <= $1
   ORDER BY m."pessoaId", m.papel, m.data DESC, m."criadoEm" DESC
),
base AS (
  SELECT p.id,
         p.documento,
         p.tipo,
         vg.nome,
         vg.ativa,
         COALESCE(
           ARRAY_AGG(pv.papel ORDER BY pv.papel)
             FILTER (WHERE pv.movimento = 'CONCEDIDO'),
           ARRAY[]::"PapelDePessoa"[]
         ) AS papeis
    FROM "Pessoa" p
    JOIN vigente vg ON vg."pessoaId" = p.id
    LEFT JOIN papel_vigente pv ON pv."pessoaId" = p.id
   GROUP BY p.id, p.documento, p.tipo, vg.nome, vg.ativa
),
filtrada AS (
  SELECT * FROM base
   WHERE (
           $2::text IS NULL
           OR nome ILIKE '%' || $2 || '%'
           OR ($3::text IS NOT NULL AND documento LIKE $3 || '%')
         )
     AND ($4::"PapelDePessoa" IS NULL OR $4 = ANY(papeis))
     AND ($5::boolean IS NULL OR ativa = $5)
)
SELECT f.*, (SELECT COUNT(*) FROM filtrada) AS total
  FROM filtrada f
 ORDER BY f.nome ASC, f.id ASC
 LIMIT $6 OFFSET $7
`;

export async function listarPessoas(
  prisma: PrismaClient,
  filtro: FiltroDePessoas = {},
  agora: Date = new Date()
): Promise<{
  readonly itens: readonly PessoaNaLista[];
  readonly total: number;
}> {
  const limite = Math.min(filtro.limite ?? LIMITE_PADRAO, LIMITE_MAXIMO);
  const deslocamento = Math.max(filtro.deslocamento ?? 0, 0);

  const busca = filtro.busca?.trim() ?? "";
  // Documento só casa sobre dígitos: quem digita "11.222" quer o CNPJ, e o banco o
  // guarda sem máscara. Texto sem dígito nenhum não vira busca de documento.
  const buscaDocumento = normalizarDocumento(busca);

  const linhas = await prisma.$queryRawUnsafe<LinhaCrua[]>(
    SQL_LISTAR,
    agora,
    busca === "" ? null : busca,
    buscaDocumento === "" ? null : buscaDocumento,
    filtro.papel ?? null,
    filtro.ativa ?? null,
    limite,
    deslocamento
  );

  return {
    itens: linhas.map((l) => ({
      id: l.id,
      documento: l.documento,
      tipo: l.tipo,
      nome: l.nome,
      ativa: l.ativa,
      papeis: paraArrayDePapeis(l.papeis),
    })),
    // `total` vem repetido em toda linha (é a contagem da CTE filtrada). Página vazia
    // devolve zero linhas — e aí a contagem também é zero, por construção.
    total: linhas.length === 0 ? 0 : Number(linhas[0]?.total ?? 0n),
  };
}
