import { diaCivilBr, FUSO_DO_ENTE } from "../../packages/datas/index.js";
import { Decimal, serializar, toMoney } from "../../packages/contracts/index.js";
import { SINAL_MOVIMENTO_PATRIMONIAL, valorContabil } from "../../modules/m10-patrimonial/dominio.js";
import { cliente, PortaSemBancoError } from "./cliente";

export { PortaSemBancoError };

/**
 * ═══ A CONSULTA PÚBLICA DE BENS (V9 N2, família Patrimônio) ═══
 *
 * O acervo do município é público, e a lista pública é diferente da interna — não por
 * capricho, mas porque a interna carrega **pessoas**: quem é o responsável por cada bem, com
 * nome e documento. Isso é dado pessoal de servidor, e não vira linha de tabela aberta porque
 * o sistema do concorrente mostra a coluna.
 *
 * ═══ ⚠️ O CONTRATO PÚBLICO É UMA LISTA ESCRITA, E ELE É O ASSUNTO DESTE ARQUIVO ═══
 *
 * `CAMPOS_PUBLICOS` abaixo é a lista dos campos que podem sair daqui. Não é documentação: é o
 * que o teste de negação confere, campo a campo, contra o objeto devolvido. A alternativa
 * comum — "pego a projeção interna e apago o que não pode" — falha da pior maneira possível:
 * um campo NOVO no modelo interno entra na projeção pública **em silêncio**, e ninguém escreve
 * um teste para um campo que ainda não existe. Aqui, campo novo que não esteja na lista não
 * chega ao público, e campo que entre na lista sem estar no teste derruba o teste.
 *
 * ═══ ⚠️ E A LOCALIZAÇÃO É FAIL-CLOSED ═══
 *
 * "Onde o bem está" é a informação mais útil da consulta e a mais perigosa: o mesmo campo que
 * diz "Escola Municipal X" diz "sala do cofre da tesouraria" e "depósito de provas". Só sai ao
 * público a localização que o ente marcou como publicável
 * (`LocalizacaoFisica.publicavelNaTransparencia`, padrão `false`). O bem continua na lista — o
 * patrimônio é público —, e o lugar aparece como não divulgado.
 *
 * ═══ ⚠️ O VALOR CONTÁBIL VEM COM DATA DE REFERÊNCIA ═══
 *
 * Um valor sem data não é conferível: depreciação e reavaliação mudam o número, e quem baixa o
 * CSV hoje e confere amanhã acha divergência onde há passagem do tempo. O valor é o dos
 * movimentos **até a data de referência**, com estorno anulando o original (o par sai da conta,
 * como em todo o M10), e a data vai junto em cada resposta.
 */

/**
 * OS CAMPOS QUE PODEM SER PUBLICADOS. Ver o cabeçalho: é contrato conferido por teste, e o
 * comentário de cada bloco diz por que o vizinho ficou de fora.
 */
export const CAMPOS_PUBLICOS = [
  "id",
  "numeroTombamento",
  "descricao",
  "classeCodigo",
  "classeDescricao",
  "especie",
  "dataAquisicao",
  "tipoDeIncorporacao",
  "situacao",
  "estado",
  "localizacao",
  "localizacaoDivulgada",
  // ⚠️ V10 T3 — O VALOR ENTROU NA LISTA. Ele existia só no detalhe, e um acervo público sem
  // valor não responde a pergunta que o cidadão faz ("quanto vale o patrimônio do município?"):
  // obrigá-lo a abrir bem por bem é a mesma coisa que não publicar. Vem com a DATA DE
  // REFERÊNCIA ao lado — um valor sem data não é conferível, porque depreciação e reavaliação o
  // mudam com o tempo.
  "valorContabil",
  "dataDeReferencia",
] as const;

/**
 * ⚠️ O QUE FICOU DE FORA, NOMEADO — para que a exclusão seja uma decisão legível e não um
 * esquecimento. O teste de negação usa ESTA lista.
 */
export const CAMPOS_NUNCA_PUBLICOS = [
  // Pessoa: nome e documento do servidor responsável pelo bem. É dado pessoal, e a utilidade
  // pública da consulta não depende dele.
  "responsavel",
  "responsavelNome",
  "responsavelDocumento",
  "resp_nome",
  "resp_documento",
  // Identificadores internos que só servem para navegar no sistema de dentro.
  "classeDeBensId",
  "localizacaoId",
  "responsavelId",
  "criadoPor",
  // O código de barras é o conteúdo da etiqueta física; publicá-lo facilita forjar etiqueta.
  "codigoDeBarras",
] as const;

export interface BemPublicoNaLista {
  readonly id: string;
  readonly numeroTombamento: string;
  readonly descricao: string;
  readonly classeCodigo: string;
  readonly classeDescricao: string;
  readonly especie: string | null;
  /** Dia civil do ente, "dd/mm/aaaa". Nunca ISO com fuso: a régua é a data civil. */
  readonly dataAquisicao: string;
  readonly tipoDeIncorporacao: string | null;
  readonly situacao: string | null;
  readonly estado: string | null;
  /** `null` quando a localização não é publicável — e `localizacaoDivulgada` diz por quê. */
  readonly localizacao: string | null;
  readonly localizacaoDivulgada: boolean;
  /**
   * ⚠️ O VALOR CONTÁBIL, COM A DATA AO LADO (V10 T3). String decimal do domínio — quem formata
   * é a tela. `null` quando o bem não tem movimento patrimonial nenhum: um bem cadastrado e
   * ainda não incorporado não vale zero, ele não tem valor registrado, e as duas coisas se leem
   * diferente.
   */
  readonly valorContabil: string | null;
  /** O dia civil do ente a que o valor se refere. Um valor sem data não é conferível. */
  readonly dataDeReferencia: string;
}

export interface FiltrosDosBensPublicos {
  readonly q?: string;
  readonly classe?: string;
  readonly especie?: string;
  readonly situacao?: string;
  readonly anoAquisicao?: string;
  readonly ordem?: "tombamento" | "aquisicao" | "descricao";
  readonly direcao?: "asc" | "desc";
  readonly pagina?: number;
  readonly porPagina?: number;
}

export interface PaginaDeBensPublicos {
  readonly linhas: readonly BemPublicoNaLista[];
  readonly total: number;
  readonly pagina: number;
  readonly porPagina: number;
  readonly paginas: number;
  /** Os anos com bem adquirido — para o filtro não oferecer ano vazio. */
  readonly anosDisponiveis: readonly number[];
  readonly especiesDisponiveis: readonly { readonly valor: string; readonly rotulo: string }[];
  readonly situacoesDisponiveis: readonly { readonly valor: string; readonly rotulo: string }[];
}

const ROTULO_SITUACAO: Readonly<Record<string, string>> = {
  EM_USO: "Em uso",
  EM_EMPRESTIMO: "Em empréstimo",
  EM_LOCACAO: "Em locação",
  EM_MANUTENCAO_PREVENTIVA: "Em manutenção preventiva",
  EM_MANUTENCAO_CORRETIVA: "Em manutenção corretiva",
  EM_DESUSO: "Em desuso",
  BAIXADO: "Baixado",
};
const ROTULO_ESTADO: Readonly<Record<string, string>> = {
  NOVO: "Novo",
  BOM: "Bom",
  REGULAR: "Regular",
  RUIM: "Ruim",
  INSERVIVEL: "Inservível",
};
const ROTULO_ESPECIE: Readonly<Record<string, string>> = { MOVEL: "Móvel", IMOVEL: "Imóvel", INTANGIVEL: "Intangível" };

export const PADRAO_POR_PAGINA = 20;
const TETO_POR_PAGINA = 100;

/**
 * O estado vivo de cada eixo (localização, situação, estado): o último movimento NÃO estornado
 * e não estornado por outro. É a mesma regra de `estadoDoBemEm`, escrita onde o banco pagina —
 * derivar em memória exigiria carregar o acervo inteiro, que é o oposto de paginar.
 */
const ESTADO_VIVO = `
  WITH estado AS (
    SELECT DISTINCT ON (m."bemId", m."tipo")
      m."bemId", m."tipo", m."localizacaoId", m."situacao", m."estado"
    FROM "MovimentoDeGestaoDoBem" m
    WHERE m."estornoDeId" IS NULL
      AND NOT EXISTS (SELECT 1 FROM "MovimentoDeGestaoDoBem" e WHERE e."estornoDeId" = m."id")
      AND m."tipo" IN ('LOCALIZACAO', 'SITUACAO', 'ESTADO')
    ORDER BY m."bemId", m."tipo", ((m."dataMovimento" AT TIME ZONE 'UTC') AT TIME ZONE $1)::date DESC, m."criadoEm" DESC
  )`;

interface LinhaCrua {
  readonly id: string;
  readonly numeroTombamento: string;
  readonly descricao: string;
  readonly dataAquisicao: Date;
  readonly classe_codigo: string;
  readonly classe_descricao: string;
  readonly especie: string | null;
  readonly inc_descricao: string | null;
  readonly loc_descricao: string | null;
  readonly loc_publicavel: boolean | null;
  readonly situacao: string | null;
  readonly estado: string | null;
  /** V10 T3 — a soma dos movimentos vivos, agregada no banco. `null` sem movimento. */
  readonly valor_contabil: string | null;
}

/**
 * ⚠️ O VALOR AGREGADO NO BANCO, COM O SINAL VINDO DO DOMÍNIO (V10 T3).
 *
 * A lista pagina; carregar os movimentos de cada bem para somar em memória é o oposto de
 * paginar. Mas a REGRA de qual movimento soma e qual subtrai é do M10
 * (`SINAL_MOVIMENTO_PATRIMONIAL`) — e escrevê-la à mão aqui criaria a segunda tabela de sinais
 * que diverge no dia em que um tipo novo nascer.
 *
 * Então o SQL é GERADO a partir da constante do domínio: os tipos positivos viajam como
 * parâmetro, e tudo o que não está entre eles subtrai. Um tipo novo entra pelo domínio e chega
 * aqui sozinho.
 *
 * ⚠️ E O PAR ESTORNO/ORIGINAL SAI DA CONTA — os dois, como no detalhe e como no resto do M10.
 */
const TIPOS_QUE_SOMAM: readonly string[] = Object.entries(SINAL_MOVIMENTO_PATRIMONIAL)
  .filter(([, sinal]) => sinal === 1)
  .map(([tipo]) => tipo);

const VALOR_DOS_MOVIMENTOS = `
  valor AS (
    SELECT m."bemId",
           SUM(CASE WHEN m."tipo"::text = ANY($2) THEN m."valor" ELSE -m."valor" END) AS total
    FROM "MovimentoPatrimonial" m
    WHERE m."estornoDeId" IS NULL
      AND NOT EXISTS (SELECT 1 FROM "MovimentoPatrimonial" e WHERE e."estornoDeId" = m."id")
    GROUP BY m."bemId"
  )`;

function linhaPublica(x: LinhaCrua, hoje: string): BemPublicoNaLista {
  const podeDivulgar = x.loc_publicavel === true && x.loc_descricao !== null;
  return {
    id: x.id,
    numeroTombamento: x.numeroTombamento,
    descricao: x.descricao,
    classeCodigo: x.classe_codigo,
    classeDescricao: x.classe_descricao,
    especie: x.especie === null ? null : (ROTULO_ESPECIE[x.especie] ?? x.especie),
    dataAquisicao: diaCivilBr(x.dataAquisicao),
    tipoDeIncorporacao: x.inc_descricao,
    situacao: x.situacao === null ? null : (ROTULO_SITUACAO[x.situacao] ?? x.situacao),
    estado: x.estado === null ? null : (ROTULO_ESTADO[x.estado] ?? x.estado),
    localizacao: podeDivulgar ? x.loc_descricao : null,
    localizacaoDivulgada: podeDivulgar,
    valorContabil: x.valor_contabil === null ? null : serializar(toMoney(new Decimal(x.valor_contabil))),
    dataDeReferencia: hoje,
  };
}

export async function listarBensPublicos(f: FiltrosDosBensPublicos = {}): Promise<PaginaDeBensPublicos> {
  const prisma = cliente();
  const porPagina = Math.min(TETO_POR_PAGINA, Math.max(1, f.porPagina ?? PADRAO_POR_PAGINA));
  const pagina = Math.max(1, f.pagina ?? 1);

  // ⚠️ $1 é o fuso (a CTE de estado o usa) e $2 são os tipos que SOMAM. Os filtros começam em $3.
  const params: unknown[] = [FUSO_DO_ENTE, TIPOS_QUE_SOMAM];
  const cond: string[] = [];
  const texto = (v: string): string => {
    params.push(`%${v}%`);
    return `$${params.length}`;
  };
  const exato = (v: string): string => {
    params.push(v);
    return `$${params.length}`;
  };

  const q = (f.q ?? "").trim();
  if (q !== "") {
    // ⚠️ SEM `codigoDeBarras` NA BUSCA. Ele não é campo público; deixá-lo buscável permitiria
    // confirmar o código da etiqueta de um bem por tentativa, que é o mesmo vazamento por
    // outra porta.
    const p = texto(q);
    cond.push(`(b."numeroTombamento" ILIKE ${p} OR b."descricao" ILIKE ${p})`);
  }
  if ((f.classe ?? "").trim() !== "") {
    const p = texto((f.classe ?? "").trim());
    cond.push(`(c."codigo" ILIKE ${p} OR c."descricao" ILIKE ${p})`);
  }
  if ((f.especie ?? "").trim() !== "") cond.push(`c."especie"::text = ${exato((f.especie ?? "").trim())}`);
  if ((f.situacao ?? "").trim() !== "") {
    const s = (f.situacao ?? "").trim();
    if (s === "SEM_REGISTRO") cond.push(`es."situacao" IS NULL`);
    else cond.push(`es."situacao"::text = ${exato(s)}`);
  }
  const ano = Number.parseInt((f.anoAquisicao ?? "").trim(), 10);
  if (Number.isInteger(ano)) {
    // O ano é o do DIA CIVIL DO ENTE, não o do UTC: um bem adquirido em 31/12 às 22h local é
    // de 1º de janeiro em UTC, e cairia no ano errado do filtro.
    cond.push(`EXTRACT(YEAR FROM ((b."dataAquisicao" AT TIME ZONE 'UTC') AT TIME ZONE $1))::int = ${exato(String(ano))}::int`);
  }
  const where = cond.length === 0 ? "" : `WHERE ${cond.join(" AND ")}`;

  const dir = f.direcao === "desc" ? "DESC" : "ASC";
  const ordem =
    f.ordem === "aquisicao"
      ? `b."dataAquisicao" ${dir}, b."numeroTombamento" ASC`
      : f.ordem === "descricao"
        ? `b."descricao" ${dir}, b."numeroTombamento" ASC`
        : `b."numeroTombamento" ${dir}`;

  const de = `
    FROM "BemPatrimonial" b
    JOIN "ClasseDeBens" c ON c."id" = b."classeDeBensId"
    LEFT JOIN "TipoDeIncorporacao" ti ON ti."id" = b."tipoDeIncorporacaoId"
    LEFT JOIN estado el ON el."bemId" = b."id" AND el."tipo" = 'LOCALIZACAO'
    LEFT JOIN "LocalizacaoFisica" l ON l."id" = el."localizacaoId"
    LEFT JOIN estado es ON es."bemId" = b."id" AND es."tipo" = 'SITUACAO'
    LEFT JOIN estado ec ON ec."bemId" = b."id" AND ec."tipo" = 'ESTADO'
    LEFT JOIN valor v ON v."bemId" = b."id"
    ${where}`;

  const [contagem, linhas, anos] = await Promise.all([
    prisma.$queryRawUnsafe<{ total: number }[]>(`${ESTADO_VIVO}, ${VALOR_DOS_MOVIMENTOS} SELECT COUNT(*)::int AS total ${de}`, ...params),
    prisma.$queryRawUnsafe<LinhaCrua[]>(
      `${ESTADO_VIVO}, ${VALOR_DOS_MOVIMENTOS}
       SELECT b."id", b."numeroTombamento", b."descricao", b."dataAquisicao",
              c."codigo" AS classe_codigo, c."descricao" AS classe_descricao, c."especie"::text AS especie,
              ti."descricao" AS inc_descricao,
              l."descricao" AS loc_descricao, l."publicavelNaTransparencia" AS loc_publicavel,
              es."situacao"::text AS situacao, ec."estado"::text AS estado,
              v."total"::text AS valor_contabil
       ${de}
       ORDER BY ${ordem}
       LIMIT ${porPagina} OFFSET ${(pagina - 1) * porPagina}`,
      ...params
    ),
    prisma.$queryRawUnsafe<{ ano: number }[]>(
      `SELECT DISTINCT EXTRACT(YEAR FROM ((b."dataAquisicao" AT TIME ZONE 'UTC') AT TIME ZONE $1))::int AS ano
       FROM "BemPatrimonial" b ORDER BY ano DESC`,
      FUSO_DO_ENTE
    ),
  ]);

  const total = Number(contagem[0]?.total ?? 0);
  const hoje = diaCivilBr(new Date());
  return {
    linhas: linhas.map((x) => linhaPublica(x, hoje)),
    total,
    pagina,
    porPagina,
    paginas: Math.max(1, Math.ceil(total / porPagina)),
    anosDisponiveis: anos.map((a) => Number(a.ano)),
    especiesDisponiveis: Object.entries(ROTULO_ESPECIE).map(([valor, rotulo]) => ({ valor, rotulo })),
    situacoesDisponiveis: Object.entries(ROTULO_SITUACAO).map(([valor, rotulo]) => ({ valor, rotulo })),
  };
}

export interface MovimentoPublicoDoBem {
  readonly data: string;
  readonly tipo: string;
  /**
   * ⚠️ STRING DECIMAL DO DOMÍNIO ("1234.50"), não texto formatado e nunca `number`. Quem
   * formata é a tela (`ValorMonetario`) — é a regra do repositório, e ela existe para que o
   * CSV e o PDF recebam o mesmo dado que a tabela, sem desformatar de volta.
   */
  readonly valor: string;
}

export interface BemPublicoEmDetalhe extends BemPublicoNaLista {
  readonly movimentos: readonly MovimentoPublicoDoBem[];
}

const ROTULO_MOVIMENTO: Readonly<Record<string, string>> = {
  AQUISICAO: "Aquisição",
  INCORPORACAO: "Incorporação",
  REAVALIACAO_AUMENTO: "Reavaliação (aumento)",
  REAVALIACAO_REDUCAO: "Reavaliação (redução)",
  DEPRECIACAO: "Depreciação",
  AMORTIZACAO: "Amortização",
  EXAUSTAO: "Exaustão",
  REDUCAO_AO_VALOR_RECUPERAVEL: "Redução ao valor recuperável",
  BAIXA: "Baixa",
  ALIENACAO: "Alienação",
  TRANSFERENCIA: "Transferência",
};

export async function bemPublico(id: string): Promise<BemPublicoEmDetalhe | null> {
  const prisma = cliente();
  const linhas = await prisma.$queryRawUnsafe<LinhaCrua[]>(
    `${ESTADO_VIVO}, ${VALOR_DOS_MOVIMENTOS}
     SELECT b."id", b."numeroTombamento", b."descricao", b."dataAquisicao",
            c."codigo" AS classe_codigo, c."descricao" AS classe_descricao, c."especie"::text AS especie,
            ti."descricao" AS inc_descricao,
            l."descricao" AS loc_descricao, l."publicavelNaTransparencia" AS loc_publicavel,
            es."situacao"::text AS situacao, ec."estado"::text AS estado,
            v."total"::text AS valor_contabil
     FROM "BemPatrimonial" b
     JOIN "ClasseDeBens" c ON c."id" = b."classeDeBensId"
     LEFT JOIN "TipoDeIncorporacao" ti ON ti."id" = b."tipoDeIncorporacaoId"
     LEFT JOIN estado el ON el."bemId" = b."id" AND el."tipo" = 'LOCALIZACAO'
     LEFT JOIN "LocalizacaoFisica" l ON l."id" = el."localizacaoId"
     LEFT JOIN estado es ON es."bemId" = b."id" AND es."tipo" = 'SITUACAO'
     LEFT JOIN estado ec ON ec."bemId" = b."id" AND ec."tipo" = 'ESTADO'
     LEFT JOIN valor v ON v."bemId" = b."id"
     WHERE b."id" = $3`,
    FUSO_DO_ENTE,
    TIPOS_QUE_SOMAM,
    id
  );
  const crua = linhas[0];
  if (crua === undefined) return null;

  // ⚠️ O PAR ESTORNO/ORIGINAL SAI DA CONTA — os dois. Somar o estorno sem remover o original
  // contaria a baixa duas vezes; remover o original sem tirar o estorno deixaria um crédito
  // solto. É a mesma regra do resto do M10.
  const movimentos = await prisma.movimentoPatrimonial.findMany({
    where: {
      bemId: id,
      estornoDeId: null,
      estornos: { none: {} },
    },
    select: { tipo: true, valor: true, dataMovimento: true },
    orderBy: [{ dataMovimento: "asc" }],
  });

  const agora = new Date();
  const valor =
    movimentos.length === 0
      ? null
      : serializar(valorContabil(movimentos.map((m) => ({ tipo: m.tipo, valor: toMoney(m.valor) }))));

  return {
    ...linhaPublica(crua, diaCivilBr(agora)),
    // ⚠️ O DETALHE CONTINUA SOMANDO PELO DOMÍNIO (`valorContabil`), e a lista soma no BANCO.
    // São duas implementações da mesma regra, de propósito: o teste `B7` confronta as duas no
    // mesmo bem, e é essa confrontação que impede uma delas de envelhecer sozinha.
    valorContabil: valor,
    dataDeReferencia: diaCivilBr(agora),
    movimentos: movimentos.map((m) => ({
      data: diaCivilBr(m.dataMovimento),
      tipo: ROTULO_MOVIMENTO[m.tipo] ?? m.tipo,
      valor: serializar(toMoney(m.valor)),
    })),
  };
}
