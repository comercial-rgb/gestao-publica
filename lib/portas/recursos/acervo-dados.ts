import { diaCivil, diaCivilBr, FUSO_DO_ENTE, inicioDoDiaCivil } from "../../../packages/datas/index.js";
import { toMoney } from "../../../packages/contracts/index.js";
import {
  cadastrarBem,
  cadastrarClasseDeBens,
  gerarEtiquetaDeBem,
  registrarMovimentoDeGestao,
} from "../../../modules/m10-patrimonial/gestao-do-bem.js";
// ⚠️ ENT12 — O EIXO DE VALOR. Estes DOIS lançam no razão, ao contrário dos quatro de gestão:
// por isso vêm de `patrimonio.js` (o bloco 1 do M10) e cobram crachá próprio.
import {
  alienarBem,
  baixarBem,
  registrarEntradaAvulsa,
  registrarImpairment,
  registrarReavaliacao,
  valorBrutoDoBem,
  valorContabilDoBem,
} from "../../../modules/m10-patrimonial/patrimonio.js";
import { receitaArrecadadaPorNumero } from "../../../modules/m10-patrimonial/receita-da-alienacao.js";
import { rotaDoEstorno } from "./estorno-dados.js";
import { rotuloDoTipoPatrimonial } from "./roteiros.js";
import type { ConsultaDoMolde } from "../../molde/consulta.js";
import { TAMANHO_DE_PAGINA } from "../../molde/consulta.js";
import { comEscritaAutenticada } from "../sessao";
import { cliente, PortaSemBancoError } from "../cliente";
import type { DetalheLido, OpcoesDoCadastro, PaginaDoMolde } from "./dados";

/**
 * ═══ OS DADOS DO ACERVO — M10 ═══
 *
 * Leitura e escrita da classe de bens e do bem, pelo molde. Nenhuma regra de negócio mora
 * aqui: a conferência da conta (analítica e do ativo), a classe ativa e o tombamento repetido
 * são decididos dentro da transação do domínio, e a recusa sobe como veio. Parafrasear aqui
 * criaria uma segunda explicação para a mesma recusa, e as duas divergiriam no dia em que o
 * serviço aprendesse um caso novo.
 *
 * ⚠️ AS OPÇÕES SÃO CHAVEADAS PELO NOME DO CAMPO — `contaContabilAtivoId`, `classeDeBensId` e
 * `tipoDeIncorporacaoId` são os nomes que os descritores usam. Chave faltando faz o select
 * aparecer DESABILITADO dizendo "nenhuma opção cadastrada", que é a mensagem certa apontando
 * a causa errada quando os registros existem. O `t20` vigia isso no fonte.
 *
 * ⚠️ E A DATA SE NORMALIZA AQUI, NA FRONTEIRA. `"2026-03-10"` vindo do formulário vira
 * meia-noite UTC, que no fuso do ente é o dia 09 — o defeito de eixo que já custou um lote.
 * O `inicioDoDiaCivil` conserta no ponto de entrada, e não nos schemas do domínio, que são
 * inócuos quando recebem um `Date`.
 */

export { PortaSemBancoError };

function paginacao(c: ConsultaDoMolde): { readonly skip: number; readonly take: number } {
  return { skip: (c.pagina - 1) * TAMANHO_DE_PAGINA, take: TAMANHO_DE_PAGINA };
}

function texto(v: string): { readonly contains: string; readonly mode: "insensitive" } {
  return { contains: v, mode: "insensitive" };
}

type Campos = Readonly<Record<string, string>>;

const t = (c: Campos, k: string): string => (c[k] ?? "").trim();
const opcional = (c: Campos, k: string): string | undefined => {
  const v = t(c, k);
  return v === "" ? undefined : v;
};
const dia = (c: Campos, k: string): Date => inicioDoDiaCivil(t(c, k));

const ROTULO_DA_ESPECIE: Readonly<Record<string, string>> = {
  MOVEL: "Móvel",
  IMOVEL: "Imóvel",
};

// ═══════════════════════════════════════════════════════════════════════════
// CLASSES DE BENS
// ═══════════════════════════════════════════════════════════════════════════

export async function listarClassesDeBens(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = c.filtros["q"] ?? "";
  const especie = c.filtros["especie"] ?? "";

  const where = {
    ...(q === "" ? {} : { OR: [{ codigo: texto(q) }, { descricao: texto(q) }] }),
    ...(especie === "" ? {} : { especie: especie as "MOVEL" | "IMOVEL" }),
  };

  const [total, linhas] = await Promise.all([
    prisma.classeDeBens.count({ where }),
    prisma.classeDeBens.findMany({
      where,
      ...paginacao(c),
      orderBy: c.ordem === null ? { codigo: "asc" } : { [c.ordem]: c.direcao },
      select: {
        id: true,
        codigo: true,
        descricao: true,
        especie: true,
        ativa: true,
        contaContabilAtivo: { select: { codigo: true, nome: true } },
        _count: { select: { bens: true } },
      },
    }),
  ]);

  return {
    total,
    linhas: linhas.map((x) => ({
      id: x.id,
      codigo: x.codigo,
      descricao: x.descricao,
      especie: ROTULO_DA_ESPECIE[x.especie] ?? x.especie,
      conta: `${x.contaContabilAtivo.codigo} — ${x.contaContabilAtivo.nome}`,
      bens: String(x._count.bens),
      situacao: x.ativa ? "Ativa" : "Inativa",
    })),
  };
}

export async function verClasseDeBens(id: string): Promise<DetalheLido | null> {
  const prisma = cliente();
  const x = await prisma.classeDeBens.findUnique({
    where: { id },
    select: {
      codigo: true,
      descricao: true,
      especie: true,
      ativa: true,
      criadoEm: true,
      criadoPor: true,
      contaContabilAtivo: { select: { codigo: true, nome: true } },
      bens: {
        select: {
          id: true,
          numeroTombamento: true,
          descricao: true,
          dataAquisicao: true,
          criadoEm: true,
          criadoPor: true,
        },
        orderBy: { numeroTombamento: "asc" },
        take: 100,
      },
      _count: { select: { bens: true } },
    },
  });
  if (x === null) return null;

  return {
    titulo: `${x.codigo} — ${x.descricao}`,
    subtitulo: `Bens ${(ROTULO_DA_ESPECIE[x.especie] ?? x.especie).toLowerCase()}s`,
    selos: [{ texto: x.ativa ? "Ativa" : "Inativa", tom: x.ativa ? "ok" : "neutro" }],
    dados: [
      {
        rotulo: "Conta do ativo",
        valor: `${x.contaContabilAtivo.codigo} — ${x.contaContabilAtivo.nome}`,
        nota: "É por esta conta que os bens desta classe entram na contabilidade. Ela é sempre analítica: conta sintética não recebe lançamento.",
      },
      { rotulo: "Espécie", valor: ROTULO_DA_ESPECIE[x.especie] ?? x.especie },
      { rotulo: "Bens nesta classe", valor: String(x._count.bens), tipo: "inteiro" },
      { rotulo: "Criada em", valor: diaCivilBr(x.criadoEm), tipo: "data" },
      { rotulo: "Criada por", valor: x.criadoPor },
    ],
    // ⚠️ AS DUAS DATAS SÃO DIFERENTES, e por isso aparecem separadas: `quando` é a aquisição
    // do bem — o FATO —, e `registradoEm` é quando alguém o cadastrou. Um bem adquirido em
    // março e cadastrado em maio pareceria de maio se só uma delas fosse mostrada.
    historico: x.bens.map((b) => ({
      id: b.id,
      oQue: `${b.numeroTombamento} — ${b.descricao}`,
      quando: diaCivilBr(b.dataAquisicao),
      registradoEm: diaCivilBr(b.criadoEm),
      por: b.criadoPor,
      motivo: null,
      estornado: false,
    })),
  };
}

export async function criarClasseDeBens(c: Campos): Promise<void> {
  await comEscritaAutenticada("CADASTRAR_CLASSE_DE_BENS", (criadoPor) =>
    cadastrarClasseDeBens(cliente(), {
      codigo: t(c, "codigo"),
      descricao: t(c, "descricao"),
      especie: t(c, "especie") === "IMOVEL" ? "IMOVEL" : "MOVEL",
      contaContabilAtivoId: t(c, "contaContabilAtivoId"),
      criadoPor,
    })
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BENS PATRIMONIAIS
// ═══════════════════════════════════════════════════════════════════════════

interface LinhaCruaDoAcervo {
  readonly id: string;
  readonly numeroTombamento: string;
  readonly descricao: string;
  readonly dataAquisicao: Date;
  readonly classe_codigo: string;
  readonly classe_descricao: string;
  readonly inc_codigo: string | null;
  readonly inc_descricao: string | null;
  readonly loc_codigo: string | null;
  readonly loc_descricao: string | null;
  readonly resp_nome: string | null;
  readonly resp_documento: string | null;
  readonly situacao: string | null;
  readonly estado: string | null;
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

/**
 * A PESQUISA DO ACERVO (V3, pacote 2; TR 5.19.14) — com o estado ATUAL de cada bem.
 *
 * ═══ POR QUE SQL, E NÃO O PRISMA ═══
 * Localização, responsável, situação e estado NÃO são colunas do bem: são o último movimento
 * VIVO de cada eixo (D4 — o estorno anula o original, e os dois saem da conta). Filtrar a
 * lista por eles pelo Prisma exigiria carregar todos os bens e derivar em memória — o
 * oposto de paginar. O `DISTINCT ON (bem, tipo) … ORDER BY dataMovimento DESC, criadoEm DESC`
 * é a mesma regra de `estadoDoBemEm` (o dia CIVIL do movimento, e o desempate pelo instante
 * do registro), escrita onde o banco pagina. `test/acervo-pesquisa.test.ts` confronta as duas contra a mesma fixture.
 *
 * ⚠️ TUDO PARAMETRIZADO ($1, $2…): nenhum filtro entra na string. `$queryRawUnsafe` só é
 * "unsafe" no nome — é a forma do Prisma de aceitar SQL montado com placeholders, a mesma que
 * `modules/m19-pessoas/consultas.ts` usa.
 */
export async function listarBensPatrimoniais(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const f = (k: string): string => (c.filtros[k] ?? "").trim();

  // $1 é o fuso do ente: o desempate entre movimentos é pelo DIA CIVIL e depois pelo instante
  // do registro — exatamente `estadoDoBemEm`. Ordenar pelo timestamp bruto trocaria o vencedor
  // quando dois movimentos do mesmo dia foram registrados fora de ordem.
  const params: unknown[] = [FUSO_DO_ENTE];
  const condicoes: string[] = [];
  const like = (v: string): string => {
    params.push(`%${v}%`);
    return `$${params.length}`;
  };
  if (f("q") !== "") {
    const p = like(f("q"));
    condicoes.push(`(b."numeroTombamento" ILIKE ${p} OR b."codigoDeBarras" ILIKE ${p} OR b."descricao" ILIKE ${p})`);
  }
  if (f("classe") !== "") {
    const p = like(f("classe"));
    condicoes.push(`(c."codigo" ILIKE ${p} OR c."descricao" ILIKE ${p})`);
  }
  if (f("localizacao") !== "") {
    const p = like(f("localizacao"));
    condicoes.push(`(l."codigo" ILIKE ${p} OR l."descricao" ILIKE ${p})`);
  }
  if (f("responsavel") !== "") {
    const p = like(f("responsavel"));
    const digitos = f("responsavel").replace(/\D/g, "");
    if (digitos.length >= 3) {
      params.push(`%${digitos}%`);
      condicoes.push(`(vp."nome" ILIKE ${p} OR p."documento" LIKE $${params.length})`);
    } else {
      condicoes.push(`vp."nome" ILIKE ${p}`);
    }
  }
  if (f("situacao") === "SEM_REGISTRO") {
    condicoes.push(`es."situacao" IS NULL`);
  } else if (f("situacao") !== "") {
    params.push(f("situacao"));
    condicoes.push(`es."situacao"::text = $${params.length}`);
  }
  if (f("estado") !== "") {
    params.push(f("estado"));
    condicoes.push(`ec."estado"::text = $${params.length}`);
  }
  if (f("especie") !== "") {
    params.push(f("especie"));
    condicoes.push(`c."especie"::text = $${params.length}`);
  }
  const where = condicoes.length === 0 ? "" : `WHERE ${condicoes.join(" AND ")}`;

  const ordem =
    c.ordem === "dataAquisicao"
      ? `b."dataAquisicao" ${c.direcao === "desc" ? "DESC" : "ASC"}, b."numeroTombamento" ASC`
      : `b."numeroTombamento" ${c.direcao === "desc" ? "DESC" : "ASC"}`;

  // O estado vivo de cada eixo: o último movimento não estornado, por bem e por tipo.
  const estado = `
    WITH estado AS (
      SELECT DISTINCT ON (m."bemId", m."tipo")
        m."bemId", m."tipo", m."localizacaoId", m."responsavelId", m."situacao", m."estado"
      FROM "MovimentoDeGestaoDoBem" m
      WHERE m."estornoDeId" IS NULL
        AND NOT EXISTS (SELECT 1 FROM "MovimentoDeGestaoDoBem" e WHERE e."estornoDeId" = m."id")
        AND m."tipo" IN ('LOCALIZACAO', 'RESPONSAVEL', 'SITUACAO', 'ESTADO')
      ORDER BY m."bemId", m."tipo", ((m."dataMovimento" AT TIME ZONE 'UTC') AT TIME ZONE $1)::date DESC, m."criadoEm" DESC
    )`;
  const de = `
    FROM "BemPatrimonial" b
    JOIN "ClasseDeBens" c ON c."id" = b."classeDeBensId"
    LEFT JOIN "TipoDeIncorporacao" ti ON ti."id" = b."tipoDeIncorporacaoId"
    LEFT JOIN estado el ON el."bemId" = b."id" AND el."tipo" = 'LOCALIZACAO'
    LEFT JOIN "LocalizacaoFisica" l ON l."id" = el."localizacaoId"
    LEFT JOIN estado er ON er."bemId" = b."id" AND er."tipo" = 'RESPONSAVEL'
    LEFT JOIN "Pessoa" p ON p."id" = er."responsavelId"
    LEFT JOIN LATERAL (
      SELECT v."nome" FROM "VersaoDePessoa" v WHERE v."pessoaId" = p."id" ORDER BY v."criadoEm" DESC LIMIT 1
    ) vp ON TRUE
    LEFT JOIN estado es ON es."bemId" = b."id" AND es."tipo" = 'SITUACAO'
    LEFT JOIN estado ec ON ec."bemId" = b."id" AND ec."tipo" = 'ESTADO'
    ${where}`;

  const { skip, take } = paginacao(c);
  const [contagem, linhas] = await Promise.all([
    prisma.$queryRawUnsafe<{ total: bigint | number }[]>(`${estado} SELECT COUNT(*)::int AS total ${de}`, ...params),
    prisma.$queryRawUnsafe<LinhaCruaDoAcervo[]>(
      `${estado}
       SELECT b."id", b."numeroTombamento", b."descricao", b."dataAquisicao",
              c."codigo" AS classe_codigo, c."descricao" AS classe_descricao,
              ti."codigo" AS inc_codigo, ti."descricao" AS inc_descricao,
              l."codigo" AS loc_codigo, l."descricao" AS loc_descricao,
              vp."nome" AS resp_nome, p."documento" AS resp_documento,
              es."situacao"::text AS situacao, ec."estado"::text AS estado
       ${de}
       ORDER BY ${ordem}
       LIMIT ${take} OFFSET ${skip}`,
      ...params
    ),
  ]);

  return {
    total: Number(contagem[0]?.total ?? 0),
    linhas: linhas.map((x) => ({
      id: x.id,
      numeroTombamento: x.numeroTombamento,
      descricao: x.descricao,
      classe: `${x.classe_codigo} — ${x.classe_descricao}`,
      incorporacao: x.inc_codigo === null ? "—" : `${x.inc_codigo} — ${x.inc_descricao ?? ""}`,
      dataAquisicao: diaCivilBr(x.dataAquisicao),
      localizacao: x.loc_codigo === null ? "—" : `${x.loc_codigo} — ${x.loc_descricao ?? ""}`,
      responsavel: x.resp_nome === null ? (x.resp_documento ?? "—") : `${x.resp_nome} (${x.resp_documento ?? ""})`,
      situacao: x.situacao === null ? "Sem situação registrada" : (ROTULO_SITUACAO[x.situacao] ?? x.situacao),
    })),
  };
}

export async function verBemPatrimonial(id: string): Promise<DetalheLido | null> {
  const prisma = cliente();
  const x = await prisma.bemPatrimonial.findUnique({
    where: { id },
    select: {
      numeroTombamento: true,
      descricao: true,
      dataAquisicao: true,
      codigoDeBarras: true,
      criadoEm: true,
      criadoPor: true,
      classeDeBens: {
        select: { codigo: true, descricao: true, especie: true, contaContabilAtivo: { select: { codigo: true, nome: true } } },
      },
      tipoDeIncorporacao: { select: { codigo: true, descricao: true } },
      movimentosDeGestao: {
        select: {
          id: true,
          tipo: true,
          dataMovimento: true,
          motivo: true,
          criadoEm: true,
          criadoPor: true,
          estornoDeId: true,
          estornos: { select: { id: true } },
        },
        orderBy: { dataMovimento: "desc" },
        take: 200,
      },
      // ⚠️ ENT12 — OS MOVIMENTOS DE VALOR, ao lado dos de gestão. Até aqui o detalhe trazia
      // só a CONTAGEM deles: o operador via "3 movimentos de valor" e não via quais. Com a
      // baixa ganhando tela, isso deixou de ser incômodo e virou defeito — a baixa
      // aconteceria e a tela não a mostraria.
      movimentos: {
        select: {
          id: true,
          tipo: true,
          valor: true,
          dataMovimento: true,
          motivo: true,
          criadoEm: true,
          criadoPor: true,
          estornoDeId: true,
          estornos: { select: { id: true } },
          // V3 (pacote 2): o motivo do rol e a guia da venda, ao lado do texto livre.
          motivoDeBaixa: { select: { codigo: true, descricao: true } },
          receitaArrecadada: { select: { numeroReceita: true, exercicio: true } },
        },
        orderBy: { dataMovimento: "desc" },
        take: 200,
      },
      _count: { select: { movimentos: true } },
    },
  });
  if (x === null) return null;

  // ⚠️ O VALOR É DERIVADO, SEMPRE — `valorContabilDoBem` soma os movimentos COM O SINAL do
  // tipo. Nunca uma coluna: uma `valorAtual` precisaria de UPDATE a cada depreciação e
  // derraparia no primeiro estorno (é o que o cabeçalho do schema do M10 já diz).
  const valorContabil = await valorContabilDoBem(cliente(), id);

  return {
    titulo: `${x.numeroTombamento} — ${x.descricao}`,
    subtitulo: `${x.classeDeBens.codigo} — ${x.classeDeBens.descricao}`,
    selos: [
      {
        texto: ROTULO_DA_ESPECIE[x.classeDeBens.especie] ?? x.classeDeBens.especie,
        tom: "neutro",
      },
      ...(x.codigoDeBarras === null
        ? []
        : ([{ texto: "Etiquetado", tom: "ok" }] as const)),
    ],
    dados: [
      {
        rotulo: "Classe",
        valor: `${x.classeDeBens.codigo} — ${x.classeDeBens.descricao}`,
        nota: `Os bens desta classe entram pela conta ${x.classeDeBens.contaContabilAtivo.codigo} — ${x.classeDeBens.contaContabilAtivo.nome}.`,
      },
      {
        rotulo: "Como entrou",
        valor:
          x.tipoDeIncorporacao === null
            ? "—"
            : `${x.tipoDeIncorporacao.codigo} — ${x.tipoDeIncorporacao.descricao}`,
      },
      { rotulo: "Data de aquisição", valor: diaCivilBr(x.dataAquisicao), tipo: "data" },
      {
        // ⚠️ ESTE RÓTULO NÃO É ENFEITE, E O PERCURSO O LÊ PELO NOME. O domínio recusa baixa
        // acima do valor do bem; oferecer o formulário sem dizer quanto ele vale seria montar
        // uma armadilha — o operador digita, o servidor nega, e a tela nunca disse o teto.
        rotulo: "Valor contábil",
        valor: valorContabil.toFixed(2),
        tipo: "dinheiro",
        nota: "Soma dos movimentos de valor, com o sinal de cada tipo. É o teto de uma baixa: não se baixa mais do que o bem vale.",
      },
      {
        rotulo: "Movimentos de valor",
        valor: String(x._count.movimentos),
        tipo: "inteiro",
        nota: "Aquisição, reavaliação, depreciação e baixa. O cadastro do bem não cria nenhum deles: valor é outro ato.",
      },
      { rotulo: "Cadastrado em", valor: diaCivilBr(x.criadoEm), tipo: "data" },
      { rotulo: "Cadastrado por", valor: x.criadoPor },
    ],
    // ⚠️ O HISTÓRICO É O EIXO DE GESTÃO, e não o financeiro: onde o bem esteve, quem respondeu
    // por ele, em que estado e em que situação. O eixo de valor tem contagem própria acima.
    // ⚠️ OS DOIS EIXOS NO MESMO HISTÓRICO, e nenhum sobrescreve o outro — é o que o percurso
    // afirma no último passo. O de VALOR carrega o montante; o de GESTÃO não tem montante
    // nenhum, e forjar um zero ali faria o leitor achar que a mudança de sala não custou
    // nada, quando na verdade a pergunta não se aplica.
    historico: [
      ...x.movimentos.map((m) => {
        const partes = [
          m.motivo,
          m.motivoDeBaixa === null ? null : `Motivo de baixa: ${m.motivoDeBaixa.codigo} — ${m.motivoDeBaixa.descricao}`,
          m.receitaArrecadada === null ? null : `Receita ${m.receitaArrecadada.numeroReceita}/${m.receitaArrecadada.exercicio}`,
        ].filter((p): p is string => p !== null && p !== "");
        return {
          id: m.id,
          oQue: rotuloDoTipoPatrimonial(m.tipo),
          quando: diaCivilBr(m.dataMovimento),
          registradoEm: diaCivilBr(m.criadoEm),
          por: m.criadoPor,
          motivo: partes.length === 0 ? null : partes.join(" · "),
          valor: m.valor.toFixed(2),
          estornado: m.estornos.length > 0,
          // V3 (pacote 2, unidade 4): a análise do estorno — só para o movimento VIVO e original.
          ...(m.estornoDeId === null && m.estornos.length === 0
            ? { href: rotaDoEstorno("valor", m.id), hrefRotulo: "analisar estorno" }
            : {}),
        };
      }),
      ...x.movimentosDeGestao.map((m) => ({
        id: m.id,
        oQue: m.tipo.replace(/_/g, " ").toLowerCase(),
        quando: diaCivilBr(m.dataMovimento),
        registradoEm: diaCivilBr(m.criadoEm),
        por: m.criadoPor,
        motivo: m.motivo,
        estornado: m.estornos.length > 0,
        ...(m.estornoDeId === null && m.estornos.length === 0
          ? { href: rotaDoEstorno("gestao", m.id), hrefRotulo: "analisar estorno" }
          : {}),
      })),
    ],
  };
}

export async function criarBem(c: Campos): Promise<void> {
  await comEscritaAutenticada("CADASTRAR_BEM", (criadoPor) =>
    cadastrarBem(cliente(), {
      numeroTombamento: t(c, "numeroTombamento"),
      descricao: t(c, "descricao"),
      classeDeBensId: t(c, "classeDeBensId"),
      dataAquisicao: dia(c, "dataAquisicao"),
      ...(opcional(c, "tipoDeIncorporacaoId") !== undefined
        ? { tipoDeIncorporacaoId: t(c, "tipoDeIncorporacaoId") }
        : {}),
      criadoPor,
    })
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// O EIXO DE GESTÃO — mover o bem, sem tocar o razão
// ═══════════════════════════════════════════════════════════════════════════

/**
 * O DESPACHANTE DAS AÇÕES DO BEM.
 *
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI. O campo obrigatório de cada tipo, a existência do bem e a
 * recusa de movimento sobre bem baixado são decididos dentro da transação do domínio, e a
 * mensagem sobe COMO VEIO.
 *
 * ⚠️ FAIL-CLOSED: ação desconhecida ESTOURA. Um `default` silencioso aqui deixaria a tela
 * dizer "movimento registrado" sem ter gravado nada.
 */
/**
 * A CLASSE DO BEM — lida do próprio bem, nunca do formulário.
 *
 * ⚠️ ELA ESTOURA quando o bem não existe, e isso é deliberado: sem classe os dois serviços do
 * eixo de valor receberiam string vazia e recusariam falando de "classe de bens  não existe",
 * com o id em branco no meio da frase. A recusa pertence ao ponto onde se sabe o que faltou.
 */
async function classeDoBem(bemId: string): Promise<string> {
  const bem = await cliente().bemPatrimonial.findUnique({
    where: { id: bemId },
    select: { classeDeBensId: true },
  });
  if (bem === null) {
    throw new Error(
      `Bem ${bemId} não existe. Nada foi gravado — um movimento de valor sem bem não tem sujeito.`
    );
  }
  return bem.classeDeBensId;
}

export async function acaoDoBem(acao: string, bemId: string, c: Campos): Promise<void> {
  const comum = (criadoPor: string) => ({
    bemId,
    dataMovimento: dia(c, "dataMovimento"),
    motivo: t(c, "motivo"),
    criadoPor,
  });

  switch (acao) {
    case "mover-localizacao":
      await comEscritaAutenticada("REGISTRAR_MOVIMENTO_DE_GESTAO", (criadoPor) =>
        registrarMovimentoDeGestao(cliente(), {
          ...comum(criadoPor),
          tipo: "LOCALIZACAO",
          localizacaoId: t(c, "localizacaoId"),
        })
      );
      return;
    case "atribuir-responsavel":
      await comEscritaAutenticada("REGISTRAR_MOVIMENTO_DE_GESTAO", (criadoPor) =>
        registrarMovimentoDeGestao(cliente(), {
          ...comum(criadoPor),
          tipo: "RESPONSAVEL",
          responsavelId: t(c, "responsavelId"),
        })
      );
      return;
    case "registrar-estado":
      await comEscritaAutenticada("REGISTRAR_MOVIMENTO_DE_GESTAO", (criadoPor) =>
        registrarMovimentoDeGestao(cliente(), {
          ...comum(criadoPor),
          tipo: "ESTADO",
          estado: t(c, "estado") as "OTIMO" | "BOM" | "REGULAR" | "RUIM" | "INSERVIVEL",
        })
      );
      return;
    case "registrar-situacao":
      await comEscritaAutenticada("REGISTRAR_MOVIMENTO_DE_GESTAO", (criadoPor) =>
        registrarMovimentoDeGestao(cliente(), {
          ...comum(criadoPor),
          tipo: "SITUACAO",
          situacao: t(c, "situacao") as
            | "EM_USO"
            | "EM_EMPRESTIMO"
            | "EM_LOCACAO"
            | "EM_MANUTENCAO_PREVENTIVA"
            | "EM_MANUTENCAO_CORRETIVA"
            | "EM_DESUSO"
            | "BAIXADO",
        })
      );
      return;
    // ⚠️ ESTE CASO NÃO USA `comum(criadoPor)`, e a diferença é de propósito: o objeto comum
    // carrega data do fato e motivo, que os quatro movimentos de gestão exigem e a etiqueta
    // não tem. Reaproveitá-lo aqui faria a ação pedir campos que ela não usa — e o formulário
    // do molde os renderizaria, obrigatórios, sem que o domínio jamais os lesse.
    //
    // ⚠️ RESTAURADO (V3, pacote 2): o `case` sumiu no commit bb47320 (ENT12) e a ação passou a
    // cair no `default` — "não existe neste cadastro" — desde então. O percurso do pacote 2
    // acusou; `test/ui/acoes-despachadas.test.ts` passou a vigiar descritor × despachante.
    case "gerar-etiqueta":
      await comEscritaAutenticada("GERAR_ETIQUETA_DE_BEM", (criadoPor) =>
        gerarEtiquetaDeBem(cliente(), { bemId, criadoPor })
      );
      return;
    // ═══ ENT12 — O EIXO DE VALOR, e a classe vem DO BEM ═══
    //
    // ⚠️ A CLASSE NÃO É PERGUNTADA AO FORMULÁRIO, e é derivada aqui. Os dois serviços a
    // exigem, mas o bem já tem uma: um seletor deixaria escolher classe diferente da do bem,
    // e o núcleo recusaria com uma mensagem sobre levantamento por classe — correta, e
    // inútil para quem está baixando um armário. Bem inexistente estoura ANTES de qualquer
    // escrita, nomeando o que faltou.
    case "registrar-entrada-de-valor":
      await comEscritaAutenticada("REGISTRAR_ENTRADA_AVULSA", async (criadoPor) =>
        registrarEntradaAvulsa(cliente(), {
          classeDeBensId: await classeDoBem(bemId),
          bemId,
          tipo: t(c, "tipo") === "DOACAO_RECEBIDA" ? "DOACAO_RECEBIDA" : "AVALIACAO_INICIAL",
          // ⚠️ O VALOR VAI COMO STRING DECIMAL, e isso é o contrato: `zMoney` aceita
          // `Decimal` ou string no formato `-?\d+(\.\d+)?`, e transforma com `toMoney`.
          // Converter aqui para `number` seria justamente o que o repositório proíbe.
          valor: t(c, "valor"),
          dataMovimento: dia(c, "dataMovimento"),
          motivo: t(c, "motivo"),
          criadoPor,
        })
      );
      return;
    case "baixar-do-acervo":
      await comEscritaAutenticada("BAIXAR_BEM", async (criadoPor) =>
        baixarBem(cliente(), {
          classeDeBensId: await classeDoBem(bemId),
          bemId,
          tipo: t(c, "tipo") === "DOACAO_REALIZADA" ? "DOACAO_REALIZADA" : "BAIXA_ALIENACAO",
          motivoDeBaixaId: t(c, "motivoDeBaixaId"),
          valor: t(c, "valor"),
          dataMovimento: dia(c, "dataMovimento"),
          motivo: t(c, "motivo"),
          criadoPor,
        })
      );
      return;
    // ═══ V3 (pacote 2) — reavaliação, impairment e alienação, com crachá próprio ═══
    case "reavaliar":
      await comEscritaAutenticada("REGISTRAR_REAVALIACAO", async (criadoPor) =>
        registrarReavaliacao(cliente(), {
          classeDeBensId: await classeDoBem(bemId),
          bemId,
          sentido: t(c, "sentido") === "REDUCAO" ? "REDUCAO" : "AUMENTO",
          valor: t(c, "valor"),
          dataMovimento: dia(c, "dataMovimento"),
          motivo: t(c, "motivo"),
          criadoPor,
        })
      );
      return;
    case "registrar-impairment":
      await comEscritaAutenticada("REGISTRAR_IMPAIRMENT", async (criadoPor) =>
        registrarImpairment(cliente(), {
          classeDeBensId: await classeDoBem(bemId),
          bemId,
          valor: t(c, "valor"),
          dataMovimento: dia(c, "dataMovimento"),
          motivo: t(c, "motivo"),
          criadoPor,
        })
      );
      return;
    case "alienar":
      await comEscritaAutenticada("ALIENAR_BEM", async (criadoPor) => {
        const prisma = cliente();
        const classeDeBensId = await classeDoBem(bemId);
        // ⚠️ O BRUTO E A ACUMULADA SÃO DO BEM, derivados da soma dos movimentos — nunca
        // digitados. A acumulada é a diferença entre o bruto e o contábil; o domínio confere
        // que ela não alcança o bruto (sobra o residual) e que ambos cabem na classe.
        const [bruto, contabil] = await Promise.all([valorBrutoDoBem(prisma, bemId), valorContabilDoBem(prisma, bemId)]);
        const dataMovimento = dia(c, "dataMovimento");
        // A RECEITA PELA GUIA: exercício (em branco = o ano civil da data do fato) e número.
        // Achar é aqui; decidir se ela sustenta a venda é do domínio, dentro da transação.
        const numeroDaReceita = opcional(c, "numeroDaReceita");
        let receitaArrecadadaId: string | undefined;
        if (numeroDaReceita !== undefined) {
          const ex = opcional(c, "exercicioDaReceita");
          const exercicio = ex === undefined ? Number(diaCivil(dataMovimento).slice(0, 4)) : Number(ex);
          receitaArrecadadaId = (await receitaArrecadadaPorNumero(prisma, { exercicio, numeroReceita: numeroDaReceita })).id;
        }
        return alienarBem(prisma, {
          classeDeBensId,
          bemId,
          valorBrutoBaixado: bruto.toFixed(2),
          acumuladaBaixada: toMoney(bruto.minus(contabil)).toFixed(2),
          valorVenda: t(c, "valorVenda"),
          ...(receitaArrecadadaId !== undefined ? { receitaArrecadadaId } : {}),
          motivoDeBaixaId: t(c, "motivoDeBaixaId"),
          dataMovimento,
          motivo: t(c, "motivo"),
          criadoPor,
        });
      });
      return;
    default:
      throw new Error(`Ação "${acao}" não existe neste cadastro. Nada foi gravado.`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AS OPÇÕES — chaveadas pelo NOME DO CAMPO do descritor (ver o cabeçalho)
// ═══════════════════════════════════════════════════════════════════════════

export async function opcoesDoAcervo(): Promise<OpcoesDoCadastro> {
  const prisma = cliente();
  const [contas, classes, tipos, localizacoes, pessoas, motivos] = await Promise.all([
    // ⚠️ SÓ ANALÍTICAS DA CLASSE 1, e o teto cobre a classe INTEIRA. O plano oficial tem
    // 1.404 analíticas de ativo; um teto abaixo disso truncaria em silêncio, e a conta que o
    // operador procura simplesmente não estaria na lista — sem erro, sem aviso. O ponto em
    // `"1."` casa a classe, e não qualquer código que comece com o dígito 1.
    prisma.contaPcasp.findMany({
      where: { analitica: true, codigo: { startsWith: "1." } },
      select: { id: true, codigo: true, nome: true },
      orderBy: { codigo: "asc" },
      take: 2000,
    }),
    prisma.classeDeBens.findMany({
      where: { ativa: true },
      select: { id: true, codigo: true, descricao: true },
      orderBy: { codigo: "asc" },
      take: 500,
    }),
    prisma.tipoDeIncorporacao.findMany({
      where: { ativo: true },
      select: { id: true, codigo: true, descricao: true },
      orderBy: { codigo: "asc" },
      take: 300,
    }),
    prisma.localizacaoFisica.findMany({
      where: { ativa: true },
      select: { id: true, codigo: true, descricao: true },
      orderBy: { codigo: "asc" },
      take: 500,
    }),
    // ⚠️ O NOME DA PESSOA NÃO MORA EM `Pessoa` — ela só tem documento e tipo. O nome está na
    // VERSÃO, e a vigente é a mais recente. Este é o idioma que o repositório já usa em quatro
    // lugares (ver `protocolo.ts`): `take: 1` por `criadoEm` desc, e fora quem tem a versão
    // vigente INATIVA. Um select montado sobre `Pessoa` crua seria uma lista de CPFs.
    prisma.pessoa.findMany({
      select: {
        id: true,
        documento: true,
        versoes: {
          select: { nome: true, ativa: true },
          orderBy: { criadoEm: "desc" },
          take: 1,
        },
      },
      orderBy: { criadoEm: "desc" },
      take: 500,
    }),
    prisma.motivoDeBaixa.findMany({
      where: { ativo: true },
      select: { id: true, codigo: true, descricao: true },
      orderBy: { codigo: "asc" },
      take: 300,
    }),
  ]);

  return {
    contaContabilAtivoId: contas.map((c) => ({
      valor: c.id,
      rotulo: `${c.codigo} — ${c.nome}`,
    })),
    localizacaoId: localizacoes.map((l) => ({
      valor: l.id,
      rotulo: `${l.codigo} — ${l.descricao}`,
    })),
    responsavelId: pessoas
      .filter((p) => p.versoes[0]?.ativa !== false)
      .map((p) => ({
        valor: p.id,
        rotulo: `${p.versoes[0]?.nome ?? p.documento} (${p.documento})`,
      })),
    classeDeBensId: classes.map((c) => ({
      valor: c.id,
      rotulo: `${c.codigo} — ${c.descricao}`,
    })),
    tipoDeIncorporacaoId: tipos.map((x) => ({
      valor: x.id,
      rotulo: `${x.codigo} — ${x.descricao}`,
    })),
    // V3 (pacote 2) — só os ATIVOS: um inativo classifica as baixas antigas, não uma nova.
    motivoDeBaixaId: motivos.map((m) => ({
      valor: m.id,
      rotulo: `${m.codigo} — ${m.descricao}`,
    })),
  };
}
