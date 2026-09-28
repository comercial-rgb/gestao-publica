import { diaCivilBr, meioDiaCivil } from "../../../packages/datas/index.js";
import { toMoney } from "../../../packages/contracts/index.js";
import type { Prisma } from "../../../prisma/generated/client/client.js";
import { resultadoPrimario } from "../../../modules/m02b-plurianual/dominio.js";
import {
  criarAcaoPpa,
  criarAlienacaoBemLdo,
  criarAplicacaoAlienacaoLdo,
  criarAreaTematica,
  criarDividaConsolidadaLdo,
  criarEixoEstruturante,
  criarIndicadorPrograma,
  criarLdo,
  criarMacroacao,
  criarMargemExpansaoLdo,
  criarMetaAnualLdo,
  criarPlanoPlurianual,
  criarPrevisaoReceitaPpa,
  criarPrioridadeLdo,
  criarProgramaPpa,
  criarProjecaoAtuarialRpps,
  criarPublicoAlvo,
  criarReceitaAnteriorPpa,
  criarRenunciaReceitaLdo,
  criarRiscoFiscal,
} from "../../../modules/m02b-plurianual/servico.js";
import type { ConsultaDoMolde } from "../../molde/consulta.js";
import { TAMANHO_DE_PAGINA } from "../../molde/consulta.js";
import type { LinhaDoHistorico } from "../../molde/tipos.js";
import { comEscritaAutenticada } from "../sessao";
import { cliente, PortaSemBancoError } from "../cliente";
import type { DetalheLido, OpcoesDoCadastro, PaginaDoMolde } from "./dados";

/**
 * ═══ OS DADOS DO PLANEJAMENTO PLURIANUAL — M02b, V4 §8 (Fila A) ═══
 *
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI. O quadriênio, o ano dentro do plano, a série histórica
 * anterior ao plano, a primária que não excede a total, o trâmite em ordem — tudo é decidido no
 * domínio (`modules/m02b-plurianual/servico.ts`) e a recusa sobe COMO VEIO. Esta porta converte
 * campos do formulário em entrada do serviço, e `Decimal` do Prisma em texto para a tela.
 *
 * ⚠️ E NADA AQUI DERIVA NÚMERO POR CONTA PRÓPRIA: o resultado primário sai de
 * `resultadoPrimario()` — a mesma função que o anexo e o RREO 6 usam.
 */

export { PortaSemBancoError };

type Campos = Readonly<Record<string, string>>;
const t = (c: Campos, k: string): string => (c[k] ?? "").trim();
const opcional = (c: Campos, k: string): string | undefined => (t(c, k) === "" ? undefined : t(c, k));
const inteiro = (c: Campos, k: string): number => Number.parseInt(t(c, k), 10);
/** "3,5" → "3.5": a tela brasileira digita vírgula; o domínio lê a string decimal. */
const decimal = (c: Campos, k: string): string => normalizarDecimal(t(c, k));
function normalizarDecimal(v: string): string {
  // Com vírgula: "1.234,56" → "1234.56". Sem vírgula: como veio (o campo de dinheiro já entrega "1234.56").
  return v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v;
}
const dia = (c: Campos, k: string): Date => meioDiaCivil(t(c, k));
const diaOpcional = (c: Campos, k: string): Date | undefined => (t(c, k) === "" ? undefined : meioDiaCivil(t(c, k)));

function paginacao(c: ConsultaDoMolde): { readonly skip: number; readonly take: number } {
  return { skip: (c.pagina - 1) * TAMANHO_DE_PAGINA, take: TAMANHO_DE_PAGINA };
}

const ROTULO_DA_ESTRUTURA: Readonly<Record<string, string>> = {
  EIXO: "Eixo estruturante",
  AREA: "Área temática",
  PUBLICO: "Público-alvo",
  MACROACAO: "Macroação",
};

// ═══════════════════════════════════════════════════════════════════════════
// O PLANO PLURIANUAL
// ═══════════════════════════════════════════════════════════════════════════

export async function listarPlanos(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const ano = c.filtros["ano"] ?? "";
  const where: Prisma.PlanoPlurianualWhereInput = ano === "" ? {} : { anoInicio: { lte: Number(ano) }, anoFim: { gte: Number(ano) } };
  const [total, linhas] = await Promise.all([
    prisma.planoPlurianual.count({ where }),
    prisma.planoPlurianual.findMany({
      where,
      orderBy: { anoInicio: c.direcao },
      ...paginacao(c),
      select: { id: true, anoInicio: true, anoFim: true, leiRef: true, dataPublicacao: true, _count: { select: { programas: true, previsoes: true } } },
    }),
  ]);
  return {
    total,
    linhas: linhas.map((p) => ({
      id: p.id,
      quadrienio: `${p.anoInicio}–${p.anoFim}`,
      leiRef: p.leiRef,
      dataPublicacao: diaCivilBr(p.dataPublicacao),
      programas: String(p._count.programas),
      previsoes: String(p._count.previsoes),
    })),
  };
}

export async function verPlano(id: string): Promise<DetalheLido | null> {
  const p = await cliente().planoPlurianual.findUnique({
    where: { id },
    select: {
      anoInicio: true, anoFim: true, leiRef: true, dataPublicacao: true, criadoEm: true, criadoPor: true,
      programas: {
        orderBy: { criadoEm: "asc" },
        select: { id: true, criadoEm: true, criadoPor: true, valorPrevisto: true, estrategia: true, programa: { select: { codigo: true, descricao: true } }, areaTematica: { select: { codigo: true, descricao: true } } },
      },
      previsoes: {
        orderBy: [{ ano: "asc" }, { criadoEm: "asc" }],
        select: { id: true, ano: true, valor: true, criadoEm: true, criadoPor: true, naturezaReceita: { select: { codigo: true, descricao: true } }, fonte: { select: { codigo: true, descricao: true } } },
      },
      receitasAnteriores: {
        orderBy: [{ ano: "asc" }, { criadoEm: "asc" }],
        select: { id: true, ano: true, valor: true, criadoEm: true, criadoPor: true, naturezaReceita: { select: { codigo: true, descricao: true } } },
      },
    },
  });
  if (p === null) return null;
  const totalPrevisto = p.programas.reduce((s, x) => s.plus(x.valorPrevisto.toFixed(2)), toMoney("0"));
  const historico: LinhaDoHistorico[] = [
    ...p.programas.map((x) => ({
      id: x.id,
      oQue: `Programa ${x.programa.codigo} — ${x.programa.descricao}`,
      quando: diaCivilBr(x.criadoEm),
      registradoEm: diaCivilBr(x.criadoEm),
      por: x.criadoPor,
      motivo: `${x.areaTematica.codigo} — ${x.areaTematica.descricao}${x.estrategia === null ? "" : ` · ${x.estrategia}`}`,
      valor: x.valorPrevisto.toFixed(2),
      href: `/planejamento/ppa/programas/${x.id}`,
      hrefRotulo: "abrir o programa no plano",
    })),
    ...p.previsoes.map((x) => ({
      id: x.id,
      oQue: `Receita prevista ${x.ano}: ${x.naturezaReceita.codigo} — ${x.naturezaReceita.descricao}`,
      quando: diaCivilBr(x.criadoEm),
      registradoEm: diaCivilBr(x.criadoEm),
      por: x.criadoPor,
      motivo: `Fonte ${x.fonte.codigo} — ${x.fonte.descricao}`,
      valor: x.valor.toFixed(2),
    })),
    ...p.receitasAnteriores.map((x) => ({
      id: x.id,
      oQue: `Receita realizada em ${x.ano}: ${x.naturezaReceita.codigo} — ${x.naturezaReceita.descricao}`,
      quando: diaCivilBr(x.criadoEm),
      registradoEm: diaCivilBr(x.criadoEm),
      por: x.criadoPor,
      motivo: "Série histórica que instrui a projeção (anterior ao quadriênio).",
      valor: x.valor.toFixed(2),
    })),
  ];
  return {
    titulo: `PPA ${p.anoInicio}–${p.anoFim}`,
    subtitulo: p.leiRef,
    selos: [
      { texto: `${p.programas.length} programa(s)`, tom: "neutro" },
      { texto: `${p.previsoes.length} previsão(ões) de receita`, tom: "neutro" },
    ],
    dados: [
      { rotulo: "Quadriênio", valor: `${p.anoInicio} a ${p.anoFim}`, nota: "Quatro exercícios, as duas pontas inclusas (CF art. 165 §1º)." },
      { rotulo: "Lei", valor: p.leiRef },
      { rotulo: "Publicação", valor: diaCivilBr(p.dataPublicacao), tipo: "data" },
      { rotulo: "Valor previsto dos programas", valor: totalPrevisto.toFixed(2), tipo: "dinheiro", nota: "Soma dos tetos por programa — não é a soma das ações." },
      { rotulo: "Cadastrado em", valor: diaCivilBr(p.criadoEm), tipo: "data" },
      { rotulo: "Cadastrado por", valor: p.criadoPor },
    ],
    historico,
  };
}

export async function opcoesDoPlano(): Promise<OpcoesDoCadastro> {
  const prisma = cliente();
  const [programas, areas, publicos, naturezas, fontes] = await Promise.all([
    prisma.programa.findMany({ select: { id: true, codigo: true, descricao: true }, orderBy: { codigo: "asc" } }),
    prisma.areaTematica.findMany({ select: { id: true, codigo: true, descricao: true }, orderBy: { codigo: "asc" } }),
    prisma.publicoAlvo.findMany({ select: { id: true, codigo: true, descricao: true }, orderBy: { codigo: "asc" } }),
    prisma.naturezaReceita.findMany({ select: { id: true, codigo: true, descricao: true }, orderBy: { codigo: "asc" }, take: 500 }),
    prisma.fonteRecurso.findMany({ select: { id: true, codigo: true, descricao: true }, orderBy: { codigo: "asc" } }),
  ]);
  const rotular = (xs: readonly { readonly id: string; readonly codigo: string; readonly descricao: string }[]) =>
    xs.map((x) => ({ valor: x.id, rotulo: `${x.codigo} — ${x.descricao}` }));
  return {
    programaId: rotular(programas),
    areaTematicaId: rotular(areas),
    publicoAlvoId: rotular(publicos),
    naturezaReceitaId: rotular(naturezas),
    fonteId: rotular(fontes),
  };
}

export async function criarPlano(c: Campos): Promise<void> {
  await comEscritaAutenticada("CADASTRAR_PPA", (criadoPor) =>
    criarPlanoPlurianual(cliente(), {
      anoInicio: inteiro(c, "anoInicio"),
      anoFim: inteiro(c, "anoFim"),
      leiRef: t(c, "leiRef"),
      dataPublicacao: dia(c, "dataPublicacao"),
      criadoPor,
    })
  );
}

export async function acaoDoPlano(acao: string, planoId: string, c: Campos): Promise<void> {
  switch (acao) {
    case "programa-no-plano":
      await comEscritaAutenticada("CADASTRAR_PROGRAMA_PPA", (criadoPor) =>
        criarProgramaPpa(cliente(), {
          planoId,
          programaId: t(c, "programaId"),
          areaTematicaId: t(c, "areaTematicaId"),
          ...(opcional(c, "publicoAlvoId") !== undefined ? { publicoAlvoId: t(c, "publicoAlvoId") } : {}),
          ...(opcional(c, "estrategia") !== undefined ? { estrategia: t(c, "estrategia") } : {}),
          valorPrevisto: decimal(c, "valorPrevisto"),
          criadoPor,
        })
      );
      return;
    case "previsao-de-receita":
      await comEscritaAutenticada("CADASTRAR_RECEITA_PPA", (criadoPor) =>
        criarPrevisaoReceitaPpa(cliente(), {
          planoId,
          naturezaReceitaId: t(c, "naturezaReceitaId"),
          fonteId: t(c, "fonteId"),
          ano: inteiro(c, "ano"),
          valor: decimal(c, "valor"),
          criadoPor,
        })
      );
      return;
    case "receita-anterior":
      await comEscritaAutenticada("CADASTRAR_RECEITA_PPA", (criadoPor) =>
        criarReceitaAnteriorPpa(cliente(), {
          planoId,
          naturezaReceitaId: t(c, "naturezaReceitaId"),
          ano: inteiro(c, "ano"),
          valor: decimal(c, "valor"),
          criadoPor,
        })
      );
      return;
    default:
      throw new Error(`Ação "${acao}" não existe neste cadastro. Nada foi gravado.`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// O PROGRAMA NO PLANO
// ═══════════════════════════════════════════════════════════════════════════

export async function listarProgramasDoPpa(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const plano = (c.filtros["plano"] ?? "").trim();
  const q = (c.filtros["q"] ?? "").trim();
  const where: Prisma.ProgramaPpaWhereInput = {};
  if (plano !== "") where.plano = /^\d{4}$/.test(plano) ? { anoInicio: Number(plano) } : { id: plano };
  if (q !== "") where.programa = { OR: [{ codigo: { contains: q } }, { descricao: { contains: q, mode: "insensitive" } }] };
  const ordem: Prisma.ProgramaPpaOrderByWithRelationInput = c.ordem === "valorPrevisto" ? { valorPrevisto: c.direcao } : { criadoEm: "desc" };
  const [total, linhas] = await Promise.all([
    prisma.programaPpa.count({ where }),
    prisma.programaPpa.findMany({
      where,
      orderBy: ordem,
      ...paginacao(c),
      select: {
        id: true, valorPrevisto: true,
        plano: { select: { anoInicio: true, anoFim: true } },
        programa: { select: { codigo: true, descricao: true } },
        areaTematica: { select: { codigo: true, descricao: true } },
        _count: { select: { indicadores: true, acoes: true } },
      },
    }),
  ]);
  return {
    total,
    linhas: linhas.map((p) => ({
      id: p.id,
      programa: `${p.programa.codigo} — ${p.programa.descricao}`,
      quadrienio: `${p.plano.anoInicio}–${p.plano.anoFim}`,
      areaTematica: `${p.areaTematica.codigo} — ${p.areaTematica.descricao}`,
      valorPrevisto: p.valorPrevisto.toFixed(2),
      indicadores: String(p._count.indicadores),
      acoes: String(p._count.acoes),
    })),
  };
}

export async function verProgramaDoPpa(id: string): Promise<DetalheLido | null> {
  const p = await cliente().programaPpa.findUnique({
    where: { id },
    select: {
      estrategia: true, valorPrevisto: true, criadoEm: true, criadoPor: true,
      plano: { select: { id: true, anoInicio: true, anoFim: true } },
      programa: { select: { codigo: true, descricao: true, objetivo: true } },
      areaTematica: { select: { codigo: true, descricao: true } },
      publicoAlvo: { select: { codigo: true, descricao: true } },
      indicadores: { orderBy: { criadoEm: "asc" }, select: { id: true, descricao: true, unidadeMedida: true, situacaoInicial: true, situacaoModificada: true, criadoEm: true, criadoPor: true } },
      acoes: {
        orderBy: { criadoEm: "asc" },
        select: { id: true, produto: true, unidadeMedida: true, regiaoAtendida: true, metaFisica: true, metaFinanceira: true, criadoEm: true, criadoPor: true, acao: { select: { codigo: true, descricao: true } }, funcao: { select: { codigo: true } }, subfuncao: { select: { codigo: true } }, unidadeExecutora: { select: { codigo: true, descricao: true } } },
      },
    },
  });
  if (p === null) return null;
  const somaDasAcoes = p.acoes.reduce((s, a) => s.plus(a.metaFinanceira.toFixed(2)), toMoney("0"));
  return {
    titulo: `${p.programa.codigo} — ${p.programa.descricao}`,
    subtitulo: `PPA ${p.plano.anoInicio}–${p.plano.anoFim}`,
    selos: [
      { texto: `${p.indicadores.length} indicador(es)`, tom: "neutro" },
      { texto: `${p.acoes.length} ação(ões)`, tom: "neutro" },
      ...(somaDasAcoes.greaterThan(p.valorPrevisto.toFixed(2)) ? [{ texto: "as ações excedem o valor previsto", tom: "alerta" as const }] : []),
    ],
    dados: [
      { rotulo: "Plano", valor: `${p.plano.anoInicio} a ${p.plano.anoFim}` },
      { rotulo: "Objetivo do programa", valor: p.programa.objetivo ?? "— (não informado no cadastro do programa)", nota: "O objetivo é do programa (planejamento) e não se repete por plano." },
      { rotulo: "Área temática", valor: `${p.areaTematica.codigo} — ${p.areaTematica.descricao}` },
      { rotulo: "Público-alvo", valor: p.publicoAlvo === null ? "—" : `${p.publicoAlvo.codigo} — ${p.publicoAlvo.descricao}` },
      { rotulo: "Estratégia neste plano", valor: p.estrategia ?? "—", tipo: "longo" },
      { rotulo: "Valor previsto do quadriênio", valor: p.valorPrevisto.toFixed(2), tipo: "dinheiro" },
      { rotulo: "Soma das metas financeiras das ações", valor: somaDasAcoes.toFixed(2), tipo: "dinheiro", nota: "A diferença entre o previsto e a soma das ações é o que o controle interno confere." },
      { rotulo: "Cadastrado em", valor: diaCivilBr(p.criadoEm), tipo: "data" },
      { rotulo: "Cadastrado por", valor: p.criadoPor },
    ],
    historico: [
      ...p.indicadores.map((i) => ({
        id: i.id,
        oQue: `Indicador: ${i.descricao}`,
        quando: diaCivilBr(i.criadoEm),
        registradoEm: diaCivilBr(i.criadoEm),
        por: i.criadoPor,
        motivo: `${i.unidadeMedida} · de ${i.situacaoInicial.toFixed(6)} para ${i.situacaoModificada.toFixed(6)}`,
      })),
      ...p.acoes.map((a) => ({
        id: a.id,
        oQue: `Ação ${a.acao.codigo} — ${a.acao.descricao}`,
        quando: diaCivilBr(a.criadoEm),
        registradoEm: diaCivilBr(a.criadoEm),
        por: a.criadoPor,
        motivo: `${a.produto} · meta física ${a.metaFisica.toFixed(6)} ${a.unidadeMedida}${a.regiaoAtendida === null ? "" : ` · ${a.regiaoAtendida}`} · ${a.unidadeExecutora?.codigo ?? "—"} ${a.unidadeExecutora?.descricao ?? ""} · função ${a.funcao?.codigo ?? "—"}.${a.subfuncao?.codigo ?? "—"}`,
        valor: a.metaFinanceira.toFixed(2),
      })),
    ],
  };
}

export async function opcoesDoProgramaDoPpa(): Promise<OpcoesDoCadastro> {
  const prisma = cliente();
  const [acoes, macroacoes, unidades, funcoes, subfuncoes] = await Promise.all([
    prisma.acao.findMany({ select: { id: true, codigo: true, descricao: true }, orderBy: { codigo: "asc" } }),
    prisma.macroacao.findMany({ select: { id: true, codigo: true, descricao: true }, orderBy: { codigo: "asc" } }),
    prisma.unidadeOrcamentaria.findMany({ select: { id: true, codigo: true, descricao: true }, orderBy: { codigo: "asc" } }),
    prisma.funcao.findMany({ select: { id: true, codigo: true, nome: true }, orderBy: { codigo: "asc" } }),
    prisma.subfuncao.findMany({ select: { id: true, codigo: true, nome: true }, orderBy: { codigo: "asc" } }),
  ]);
  return {
    acaoId: acoes.map((x) => ({ valor: x.id, rotulo: `${x.codigo} — ${x.descricao}` })),
    macroacaoId: macroacoes.map((x) => ({ valor: x.id, rotulo: `${x.codigo} — ${x.descricao}` })),
    unidadeExecutoraId: unidades.map((x) => ({ valor: x.id, rotulo: `${x.codigo} — ${x.descricao}` })),
    funcaoId: funcoes.map((x) => ({ valor: x.id, rotulo: `${x.codigo} — ${x.nome}` })),
    subfuncaoId: subfuncoes.map((x) => ({ valor: x.id, rotulo: `${x.codigo} — ${x.nome}` })),
  };
}

export async function acaoDoProgramaDoPpa(acao: string, programaPpaId: string, c: Campos): Promise<void> {
  switch (acao) {
    case "indicador":
      await comEscritaAutenticada("CADASTRAR_PROGRAMA_PPA", (criadoPor) =>
        criarIndicadorPrograma(cliente(), {
          programaPpaId,
          descricao: t(c, "descricao"),
          unidadeMedida: t(c, "unidadeMedida"),
          situacaoInicial: decimal(c, "situacaoInicial"),
          situacaoModificada: decimal(c, "situacaoModificada"),
          criadoPor,
        })
      );
      return;
    case "acao-do-plano":
      await comEscritaAutenticada("CADASTRAR_PROGRAMA_PPA", (criadoPor) =>
        criarAcaoPpa(cliente(), {
          programaPpaId,
          acaoId: t(c, "acaoId"),
          ...(opcional(c, "macroacaoId") !== undefined ? { macroacaoId: t(c, "macroacaoId") } : {}),
          unidadeExecutoraId: t(c, "unidadeExecutoraId"),
          funcaoId: t(c, "funcaoId"),
          subfuncaoId: t(c, "subfuncaoId"),
          produto: t(c, "produto"),
          unidadeMedida: t(c, "unidadeMedida"),
          ...(opcional(c, "regiaoAtendida") !== undefined ? { regiaoAtendida: t(c, "regiaoAtendida") } : {}),
          metaFisica: decimal(c, "metaFisica"),
          metaFinanceira: decimal(c, "metaFinanceira"),
          criadoPor,
        })
      );
      return;
    default:
      throw new Error(`Ação "${acao}" não existe neste cadastro. Nada foi gravado.`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// A ESTRUTURA TEMÁTICA — quatro tabelas numa listagem só
// ═══════════════════════════════════════════════════════════════════════════

export async function listarEstrutura(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const tipo = c.filtros["tipo"] ?? "";
  const q = (c.filtros["q"] ?? "").trim().toLowerCase();
  const [eixos, areas, publicos, macro] = await Promise.all([
    tipo === "" || tipo === "EIXO" ? prisma.eixoEstruturante.findMany({ select: { id: true, codigo: true, descricao: true } }) : [],
    tipo === "" || tipo === "AREA" ? prisma.areaTematica.findMany({ select: { id: true, codigo: true, descricao: true, eixo: { select: { codigo: true, descricao: true } } } }) : [],
    tipo === "" || tipo === "PUBLICO" ? prisma.publicoAlvo.findMany({ select: { id: true, codigo: true, descricao: true } }) : [],
    tipo === "" || tipo === "MACROACAO" ? prisma.macroacao.findMany({ select: { id: true, codigo: true, descricao: true } }) : [],
  ]);
  const todas = [
    ...eixos.map((x) => ({ id: `EIXO:${x.id}`, tipo: "EIXO", codigo: x.codigo, descricao: x.descricao, eixo: "—" })),
    ...areas.map((x) => ({ id: `AREA:${x.id}`, tipo: "AREA", codigo: x.codigo, descricao: x.descricao, eixo: `${x.eixo.codigo} — ${x.eixo.descricao}` })),
    ...publicos.map((x) => ({ id: `PUBLICO:${x.id}`, tipo: "PUBLICO", codigo: x.codigo, descricao: x.descricao, eixo: "—" })),
    ...macro.map((x) => ({ id: `MACROACAO:${x.id}`, tipo: "MACROACAO", codigo: x.codigo, descricao: x.descricao, eixo: "—" })),
  ].filter((x) => q === "" || x.codigo.toLowerCase().includes(q) || x.descricao.toLowerCase().includes(q));
  const chave = c.ordem === "codigo" ? "codigo" : "tipo";
  todas.sort((a, b) => {
    const r = a[chave].localeCompare(b[chave]) || a.codigo.localeCompare(b.codigo);
    return c.direcao === "desc" ? -r : r;
  });
  const { skip, take } = paginacao(c);
  return {
    total: todas.length,
    linhas: todas.slice(skip, skip + take).map((x) => ({ ...x, tipo: ROTULO_DA_ESTRUTURA[x.tipo] ?? x.tipo })),
  };
}

export async function opcoesDaEstrutura(): Promise<OpcoesDoCadastro> {
  const eixos = await cliente().eixoEstruturante.findMany({ select: { id: true, codigo: true, descricao: true }, orderBy: { codigo: "asc" } });
  return {
    eixoId: eixos.map((x) => ({ valor: x.id, rotulo: `${x.codigo} — ${x.descricao}` })),
  };
}

export async function criarEstrutura(c: Campos): Promise<void> {
  const tipo = t(c, "tipo");
  const base = { codigo: t(c, "codigo"), descricao: t(c, "descricao") };
  await comEscritaAutenticada("CADASTRAR_ESTRUTURA_PPA", async (criadoPor) => {
    switch (tipo) {
      case "EIXO":
        await criarEixoEstruturante(cliente(), { ...base, criadoPor });
        return;
      case "AREA":
        if (t(c, "eixoId") === "") throw new Error("A área temática desdobra um eixo: escolha o eixo. Nada foi gravado.");
        await criarAreaTematica(cliente(), { ...base, eixoId: t(c, "eixoId"), criadoPor });
        return;
      case "PUBLICO":
        await criarPublicoAlvo(cliente(), { ...base, criadoPor });
        return;
      case "MACROACAO":
        await criarMacroacao(cliente(), { ...base, criadoPor });
        return;
      default:
        throw new Error(`Tipo "${tipo}" não é um item da estrutura do PPA. Nada foi gravado.`);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// A LDO
// ═══════════════════════════════════════════════════════════════════════════

/** DERIVADO das quatro datas — não há coluna `situacao`. */
function situacaoDoTramite(l: { readonly dataSancao: Date | null; readonly dataDevolucaoExecutivo: Date | null; readonly dataEnvioLegislativo: Date | null }): string {
  if (l.dataSancao !== null) return "SANCIONADA";
  if (l.dataDevolucaoExecutivo !== null) return "DEVOLVIDA PELO LEGISLATIVO";
  if (l.dataEnvioLegislativo !== null) return "NO LEGISLATIVO";
  return "EM ELABORAÇÃO";
}

export async function listarLdos(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const exercicio = c.filtros["exercicio"] ?? "";
  const where: Prisma.LeiDiretrizesOrcamentariasWhereInput = exercicio === "" ? {} : { exercicio: Number(exercicio) };
  const [total, linhas] = await Promise.all([
    prisma.leiDiretrizesOrcamentarias.count({ where }),
    prisma.leiDiretrizesOrcamentarias.findMany({
      where,
      orderBy: { exercicio: c.direcao },
      ...paginacao(c),
      select: { id: true, exercicio: true, inicioVigencia: true, fimVigencia: true, dataEnvioLegislativo: true, dataDevolucaoExecutivo: true, dataSancao: true, _count: { select: { prioridades: true, metasAnuais: true } } },
    }),
  ]);
  return {
    total,
    linhas: linhas.map((l) => ({
      id: l.id,
      exercicio: String(l.exercicio),
      vigencia: `${diaCivilBr(l.inicioVigencia)} a ${diaCivilBr(l.fimVigencia)}`,
      situacao: situacaoDoTramite(l),
      prioridades: String(l._count.prioridades),
      metasAnuais: String(l._count.metasAnuais),
    })),
  };
}

export async function verLdo(id: string): Promise<DetalheLido | null> {
  const l = await cliente().leiDiretrizesOrcamentarias.findUnique({
    where: { id },
    select: {
      exercicio: true, inicioVigencia: true, fimVigencia: true, dataEnvioLegislativo: true, dataDevolucaoExecutivo: true, numeroProtocolo: true, dataSancao: true, criadoEm: true, criadoPor: true,
      prioridades: { orderBy: { criadoEm: "asc" }, select: { id: true, descricaoAcao: true, produto: true, unidadeMedida: true, meta: true, criadoEm: true, criadoPor: true, acao: { select: { codigo: true } } } },
      metasAnuais: { orderBy: { ano: "asc" }, select: { id: true, ano: true, receitaTotal: true, receitaPrimaria: true, despesaTotal: true, despesaPrimaria: true, resultadoNominal: true, criadoEm: true, criadoPor: true } },
      riscos: { orderBy: { criadoEm: "asc" }, select: { id: true, codigoPassivo: true, descricaoPassivo: true, valorPassivo: true, descricaoProvidencia: true, valorProvidencia: true, criadoEm: true, criadoPor: true } },
      renuncias: { orderBy: { criadoEm: "asc" }, select: { id: true, descricao: true, valor: true, descricaoCompensacao: true, valorCompensacao: true, criadoEm: true, criadoPor: true } },
      alienacoes: { orderBy: { criadoEm: "asc" }, select: { id: true, descricaoBem: true, valorAlienacao: true, numeroLaudo: true, criadoEm: true, criadoPor: true, aplicacoes: { select: { id: true, tipoAplicacao: true, anoAplicacao: true, descricao: true, valor: true, criadoEm: true, criadoPor: true } } } },
      dividas: { orderBy: { ano: "asc" }, select: { id: true, ano: true, dividaConsolidada: true, deducoes: true, receitaCorrenteLiquida: true, percentualRcl: true, criadoEm: true, criadoPor: true } },
      projecoesRpps: { orderBy: { ano: "asc" }, select: { id: true, ano: true, receitasPrevidenciarias: true, despesasPrevidenciarias: true, resultadoPrevidenciario: true, saldoFinanceiro: true, criadoEm: true, criadoPor: true } },
      margens: { orderBy: { ano: "asc" }, select: { id: true, ano: true, aumentoPermanenteReceita: true, reducaoPermanenteDespesa: true, novasDespesasObrigatorias: true, criadoEm: true, criadoPor: true } },
    },
  });
  if (l === null) return null;
  const situacao = situacaoDoTramite(l);
  const linha = (id: string, oQue: string, quando: Date, por: string, motivo: string, valor?: string): LinhaDoHistorico => ({
    id, oQue, quando: diaCivilBr(quando), registradoEm: diaCivilBr(quando), por, motivo, ...(valor !== undefined ? { valor } : {}),
  });
  const historico: LinhaDoHistorico[] = [
    ...l.prioridades.map((p) => linha(p.id, `Prioridade: ${p.descricaoAcao}`, p.criadoEm, p.criadoPor, `${p.produto} · meta ${p.meta.toFixed(6)} ${p.unidadeMedida}${p.acao === null ? "" : ` · ação ${p.acao.codigo}`}`)),
    ...l.metasAnuais.map((m) =>
      linha(
        m.id,
        `Meta anual ${m.ano}`,
        m.criadoEm,
        m.criadoPor,
        `Receita total ${m.receitaTotal.toFixed(2)} (primária ${m.receitaPrimaria.toFixed(2)}) · despesa total ${m.despesaTotal.toFixed(2)} (primária ${m.despesaPrimaria.toFixed(2)}) · resultado primário DERIVADO ${resultadoPrimario(toMoney(m.receitaPrimaria.toFixed(2)), toMoney(m.despesaPrimaria.toFixed(2))).toFixed(2)} · nominal ${m.resultadoNominal.toFixed(2)}`
      )
    ),
    ...l.riscos.map((r) => linha(r.id, `Risco fiscal (passivo ${r.codigoPassivo}): ${r.descricaoPassivo}`, r.criadoEm, r.criadoPor, `Providência: ${r.descricaoProvidencia} (${r.valorProvidencia.toFixed(2)})`, r.valorPassivo.toFixed(2))),
    ...l.renuncias.map((r) => linha(r.id, `Renúncia de receita: ${r.descricao}`, r.criadoEm, r.criadoPor, `Compensação: ${r.descricaoCompensacao} (${r.valorCompensacao.toFixed(2)})`, r.valor.toFixed(2))),
    ...l.alienacoes.flatMap((a) => [
      linha(a.id, `Alienação prevista: ${a.descricaoBem}`, a.criadoEm, a.criadoPor, a.numeroLaudo === null ? "Sem laudo de avaliação — o valor é estimativa." : `Laudo ${a.numeroLaudo}`, a.valorAlienacao.toFixed(2)),
      ...a.aplicacoes.map((ap) => linha(ap.id, `Aplicação do produto de "${a.descricaoBem}" em ${ap.anoAplicacao} (tipo ${ap.tipoAplicacao})`, ap.criadoEm, ap.criadoPor, ap.descricao, ap.valor.toFixed(2))),
    ]),
    ...l.dividas.map((d) => linha(d.id, `Dívida consolidada ${d.ano}`, d.criadoEm, d.criadoPor, `Deduções ${d.deducoes.toFixed(2)} · RCL ${d.receitaCorrenteLiquida.toFixed(2)} · ${d.percentualRcl.toFixed(6)} da RCL`, d.dividaConsolidada.toFixed(2))),
    ...l.projecoesRpps.map((p) => linha(p.id, `Projeção do RPPS ${p.ano}`, p.criadoEm, p.criadoPor, `Receitas ${p.receitasPrevidenciarias.toFixed(2)} · despesas ${p.despesasPrevidenciarias.toFixed(2)} · resultado ${p.resultadoPrevidenciario.toFixed(2)} · saldo ${p.saldoFinanceiro.toFixed(2)}`)),
    ...l.margens.map((m) => linha(m.id, `Margem de expansão ${m.ano}`, m.criadoEm, m.criadoPor, `Aumento de receita ${m.aumentoPermanenteReceita.toFixed(2)} · redução de despesa ${m.reducaoPermanenteDespesa.toFixed(2)} · novas obrigatórias ${m.novasDespesasObrigatorias.toFixed(2)}`)),
  ];
  return {
    titulo: `LDO ${l.exercicio}`,
    subtitulo: `Vigência ${diaCivilBr(l.inicioVigencia)} a ${diaCivilBr(l.fimVigencia)}`,
    selos: [
      { texto: situacao, tom: situacao === "SANCIONADA" ? "ok" : "neutro" },
      { texto: `${l.prioridades.length} prioridade(s)`, tom: "neutro" },
      { texto: `${l.metasAnuais.length} meta(s) anual(is)`, tom: l.metasAnuais.length === 0 ? "alerta" : "neutro" },
    ],
    dados: [
      { rotulo: "Exercício", valor: String(l.exercicio) },
      { rotulo: "Trâmite", valor: situacao, nota: "Derivado das datas — não há coluna de situação." },
      { rotulo: "Envio ao Legislativo", valor: l.dataEnvioLegislativo === null ? "—" : diaCivilBr(l.dataEnvioLegislativo), tipo: "data" },
      { rotulo: "Devolução ao Executivo", valor: l.dataDevolucaoExecutivo === null ? "—" : diaCivilBr(l.dataDevolucaoExecutivo), tipo: "data" },
      { rotulo: "Protocolo", valor: l.numeroProtocolo ?? "—" },
      { rotulo: "Sanção", valor: l.dataSancao === null ? "—" : diaCivilBr(l.dataSancao), tipo: "data" },
      { rotulo: "Cadastrada em", valor: diaCivilBr(l.criadoEm), tipo: "data" },
      { rotulo: "Cadastrada por", valor: l.criadoPor },
    ],
    historico,
  };
}

/** As opções da LDO: a ação (M02) para a prioridade e — CONTEXTUAL — as alienações DESTA LDO. */
export async function opcoesDaLdo(ldoId?: string): Promise<OpcoesDoCadastro> {
  const prisma = cliente();
  const [acoes, alienacoes] = await Promise.all([
    prisma.acao.findMany({ select: { id: true, codigo: true, descricao: true }, orderBy: { codigo: "asc" } }),
    ldoId === undefined ? [] : prisma.alienacaoBemLdo.findMany({ where: { ldoId }, select: { id: true, descricaoBem: true, valorAlienacao: true }, orderBy: { criadoEm: "asc" } }),
  ]);
  return {
    acaoId: acoes.map((x) => ({ valor: x.id, rotulo: `${x.codigo} — ${x.descricao}` })),
    alienacaoId: alienacoes.map((x) => ({ valor: x.id, rotulo: `${x.descricaoBem} (${x.valorAlienacao.toFixed(2)})` })),
  };
}

export async function criarLeiDeDiretrizes(c: Campos): Promise<void> {
  await comEscritaAutenticada("CADASTRAR_LDO", (criadoPor) =>
    criarLdo(cliente(), {
      exercicio: inteiro(c, "exercicio"),
      inicioVigencia: dia(c, "inicioVigencia"),
      fimVigencia: dia(c, "fimVigencia"),
      ...(diaOpcional(c, "dataEnvioLegislativo") !== undefined ? { dataEnvioLegislativo: dia(c, "dataEnvioLegislativo") } : {}),
      ...(diaOpcional(c, "dataDevolucaoExecutivo") !== undefined ? { dataDevolucaoExecutivo: dia(c, "dataDevolucaoExecutivo") } : {}),
      ...(opcional(c, "numeroProtocolo") !== undefined ? { numeroProtocolo: t(c, "numeroProtocolo") } : {}),
      ...(diaOpcional(c, "dataSancao") !== undefined ? { dataSancao: dia(c, "dataSancao") } : {}),
      criadoPor,
    })
  );
}

export async function acaoDaLdo(acao: string, ldoId: string, c: Campos): Promise<void> {
  switch (acao) {
    case "prioridade":
      await comEscritaAutenticada("CADASTRAR_PRIORIDADE_LDO", (criadoPor) =>
        criarPrioridadeLdo(cliente(), {
          ldoId,
          ...(opcional(c, "acaoId") !== undefined ? { acaoId: t(c, "acaoId") } : {}),
          descricaoAcao: t(c, "descricaoAcao"),
          produto: t(c, "produto"),
          unidadeMedida: t(c, "unidadeMedida"),
          meta: decimal(c, "meta"),
          criadoPor,
        })
      );
      return;
    case "meta-anual":
      await comEscritaAutenticada("CADASTRAR_METAS_FISCAIS_LDO", (criadoPor) =>
        criarMetaAnualLdo(cliente(), {
          ldoId,
          ano: inteiro(c, "ano"),
          receitaTotal: decimal(c, "receitaTotal"),
          receitaPrimaria: decimal(c, "receitaPrimaria"),
          despesaTotal: decimal(c, "despesaTotal"),
          despesaPrimaria: decimal(c, "despesaPrimaria"),
          resultadoNominal: decimal(c, "resultadoNominal"),
          dividaPublicaConsolidada: decimal(c, "dividaPublicaConsolidada"),
          dividaConsolidadaLiquida: decimal(c, "dividaConsolidadaLiquida"),
          receitaPrimariaPpp: decimal(c, "receitaPrimariaPpp"),
          despesaPrimariaPpp: decimal(c, "despesaPrimariaPpp"),
          impactoSaldoPpp: decimal(c, "impactoSaldoPpp"),
          criadoPor,
        })
      );
      return;
    case "risco-fiscal":
      await comEscritaAutenticada("CADASTRAR_RISCOS_FISCAIS_LDO", (criadoPor) =>
        criarRiscoFiscal(cliente(), {
          ldoId,
          codigoPassivo: t(c, "codigoPassivo"),
          descricaoPassivo: t(c, "descricaoPassivo"),
          valorPassivo: decimal(c, "valorPassivo"),
          descricaoProvidencia: t(c, "descricaoProvidencia"),
          valorProvidencia: decimal(c, "valorProvidencia"),
          criadoPor,
        })
      );
      return;
    case "renuncia":
      await comEscritaAutenticada("CADASTRAR_RENUNCIA_RECEITA_LDO", (criadoPor) =>
        criarRenunciaReceitaLdo(cliente(), {
          ldoId,
          descricao: t(c, "descricao"),
          valor: decimal(c, "valor"),
          descricaoCompensacao: t(c, "descricaoCompensacao"),
          valorCompensacao: decimal(c, "valorCompensacao"),
          criadoPor,
        })
      );
      return;
    case "alienacao":
      await comEscritaAutenticada("CADASTRAR_ALIENACAO_LDO", (criadoPor) =>
        criarAlienacaoBemLdo(cliente(), {
          ldoId,
          descricaoBem: t(c, "descricaoBem"),
          valorAlienacao: decimal(c, "valorAlienacao"),
          ...(opcional(c, "numeroLaudo") !== undefined ? { numeroLaudo: t(c, "numeroLaudo") } : {}),
          criadoPor,
        })
      );
      return;
    case "aplicacao-da-alienacao": {
      // ⚠️ A alienação tem de ser DESTA LDO: o select já é contextual, mas quem confere é o servidor.
      const alienacao = await cliente().alienacaoBemLdo.findUnique({ where: { id: t(c, "alienacaoId") }, select: { ldoId: true } });
      if (alienacao === null || alienacao.ldoId !== ldoId) throw new Error("A alienação escolhida não pertence a esta LDO. Nada foi gravado.");
      await comEscritaAutenticada("CADASTRAR_ALIENACAO_LDO", (criadoPor) =>
        criarAplicacaoAlienacaoLdo(cliente(), {
          alienacaoId: t(c, "alienacaoId"),
          tipoAplicacao: t(c, "tipoAplicacao"),
          anoAplicacao: inteiro(c, "anoAplicacao"),
          descricao: t(c, "descricao"),
          valor: decimal(c, "valor"),
          criadoPor,
        })
      );
      return;
    }
    case "divida-consolidada":
      await comEscritaAutenticada("CADASTRAR_METAS_FISCAIS_LDO", (criadoPor) =>
        criarDividaConsolidadaLdo(cliente(), {
          ldoId,
          ano: inteiro(c, "ano"),
          dividaConsolidada: decimal(c, "dividaConsolidada"),
          deducoes: decimal(c, "deducoes"),
          receitaCorrenteLiquida: decimal(c, "receitaCorrenteLiquida"),
          percentualRcl: decimal(c, "percentualRcl"),
          criadoPor,
        })
      );
      return;
    case "projecao-rpps":
      await comEscritaAutenticada("CADASTRAR_METAS_FISCAIS_LDO", (criadoPor) =>
        criarProjecaoAtuarialRpps(cliente(), {
          ldoId,
          ano: inteiro(c, "ano"),
          receitasPrevidenciarias: decimal(c, "receitasPrevidenciarias"),
          despesasPrevidenciarias: decimal(c, "despesasPrevidenciarias"),
          resultadoPrevidenciario: decimal(c, "resultadoPrevidenciario"),
          saldoFinanceiro: decimal(c, "saldoFinanceiro"),
          criadoPor,
        })
      );
      return;
    case "margem-de-expansao":
      await comEscritaAutenticada("CADASTRAR_METAS_FISCAIS_LDO", (criadoPor) =>
        criarMargemExpansaoLdo(cliente(), {
          ldoId,
          ano: inteiro(c, "ano"),
          aumentoPermanenteReceita: decimal(c, "aumentoPermanenteReceita"),
          reducaoPermanenteDespesa: decimal(c, "reducaoPermanenteDespesa"),
          novasDespesasObrigatorias: decimal(c, "novasDespesasObrigatorias"),
          criadoPor,
        })
      );
      return;
    default:
      throw new Error(`Ação "${acao}" não existe neste cadastro. Nada foi gravado.`);
  }
}
