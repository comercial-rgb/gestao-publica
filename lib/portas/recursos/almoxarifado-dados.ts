import { toMoney } from "../../../packages/contracts/index.js";
import {
  diaCivil,
  diaCivilBr,
  diferencaEmDiasCivis,
  inicioDoDiaCivil,
  meioDiaCivil,
} from "../../../packages/datas/index.js";
import {
  abrirInventarioDeEstoque,
  bloquearEstoque,
  cadastrarGrupoDeMaterial,
  cadastrarUnidadeDeMedida,
  cadastrarDeposito,
  cadastrarMaterial,
  definirParametroDeEstoque,
  encerrarBloqueioDeEstoque,
  fecharInventarioDeEstoque,
  registrarContagemDeInventario,
  registrarRequisicaoDeMaterial,
  registrarSaidaFisica,
} from "../../../modules/m10-patrimonial/estoque-fisico.js";
import {
  posicaoDeEstoque,
  precoMedioDaPosicao,
  saldoNaoAtendido,
  type MovimentoParaPosicao,
  type TipoMovimentoFisicoEstoque,
} from "../../../modules/m10-patrimonial/estoque-fisico-dominio.js";
import { cadastrarClasseDeMaterial } from "../../../modules/m10-patrimonial/almoxarifado.js";
import {
  relacionarElementoAoMaterial,
  relacionarMarcaAoMaterial,
} from "../../../modules/m11-licitacoes/compras.js";
import type { ConsultaDoMolde } from "../../molde/consulta.js";
import { TAMANHO_DE_PAGINA } from "../../molde/consulta.js";
import type { DadoDoDetalhe, LinhaDoHistorico, LinhaDoMolde } from "../../molde/tipos.js";
import { comEscritaAutenticada } from "../sessao";
import { cliente, PortaSemBancoError } from "../cliente";
import type { DetalheLido, OpcoesDoCadastro, PaginaDoMolde } from "./dados";

export { PortaSemBancoError };

/**
 * ═══ OS DADOS DO ALMOXARIFADO FÍSICO — M10, TR 5.18 ═══
 *
 * ⚠️ NADA AQUI DERIVA SALDO POR CONTA PRÓPRIA. A posição de estoque, o preço médio e o
 * saldo não atendido de uma requisição vêm das funções puras de
 * `estoque-fisico-dominio.ts`, provadas por mutação no ENT05. Um `SUM` novo nesta porta
 * seria a segunda verdade sobre o mesmo fato — e ela divergiria no dia em que o domínio
 * aprendesse um tipo de movimento novo.
 *
 * ⚠️ E A POSIÇÃO ACEITA UMA DATA. É a cláusula que derrubou a ideia de coluna de saldo na
 * própria seção 5.18: "quanto havia naquela data" é pergunta legítima, e coluna só sabe
 * responder "agora".
 */

function paginacao(c: ConsultaDoMolde): { readonly skip: number; readonly take: number } {
  return { skip: (c.pagina - 1) * TAMANHO_DE_PAGINA, take: TAMANHO_DE_PAGINA };
}

function texto(v: string): { readonly contains: string; readonly mode: "insensitive" } {
  return { contains: v, mode: "insensitive" };
}

const ROTULO_DA_CLASSIFICACAO: Readonly<Record<string, string>> = {
  CONSUMO: "Consumo",
  PERMANENTE: "Permanente",
  SERVICO: "Serviço",
  OBRA: "Obra",
};

const ROTULO_DA_CATEGORIA: Readonly<Record<string, string>> = {
  PERECIVEL: "Perecível",
  NAO_PERECIVEL: "Não perecível",
  ESTOCAVEL: "Estocável",
  COMBUSTIVEL: "Combustível",
};

/** Movimentos do banco na forma que o domínio espera — quantidade e valor em Decimal. */
function paraPosicao(
  ms: readonly {
    readonly tipo: string;
    readonly quantidade: { toFixed: (n: number) => string };
    readonly valorTotal: { toFixed: (n: number) => string };
    readonly dataMovimento: Date;
  }[]
): readonly MovimentoParaPosicao[] {
  return ms.map((m) => ({
    tipo: m.tipo as TipoMovimentoFisicoEstoque,
    quantidade: toMoney(m.quantidade.toFixed(6)),
    valorTotal: toMoney(m.valorTotal.toFixed(2)),
    dataMovimento: m.dataMovimento,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// MATERIAIS
// ═══════════════════════════════════════════════════════════════════════════

export async function listarMateriais(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = c.filtros["q"] ?? "";
  const classificacao = c.filtros["classificacao"] ?? "";
  const categoria = c.filtros["categoria"] ?? "";

  const where = {
    ...(q !== ""
      ? { OR: [{ codigo: texto(q) }, { descricaoSucinta: texto(q) }, { catmat: texto(q) }] }
      : {}),
    ...(classificacao !== "" ? { classificacao: classificacao as "CONSUMO" } : {}),
    ...(categoria !== "" ? { categoria: categoria as "ESTOCAVEL" } : {}),
  };

  const [total, linhas] = await Promise.all([
    prisma.material.count({ where }),
    prisma.material.findMany({
      where,
      ...paginacao(c),
      orderBy: c.ordem === null ? { codigo: "asc" } : { [c.ordem]: c.direcao },
      select: {
        id: true, codigo: true, descricaoSucinta: true, classificacao: true,
        categoria: true, catmat: true, controlaLote: true,
        grupo: { select: { codigo: true, descricao: true } },
        unidades: {
          where: { ehDeEstoque: true },
          select: { unidadeDeMedida: { select: { sigla: true } } },
        },
      },
    }),
  ]);

  return {
    total,
    linhas: linhas.map((m) => ({
      id: m.id,
      codigo: m.codigo,
      descricaoSucinta: m.descricaoSucinta,
      grupo: `${m.grupo.codigo} — ${m.grupo.descricao}`,
      classificacao: ROTULO_DA_CLASSIFICACAO[m.classificacao] ?? m.classificacao,
      unidade: m.unidades[0]?.unidadeDeMedida.sigla ?? "—",
      catmat: m.catmat ?? "—",
      lote: m.controlaLote ? "Controla lote" : "Sem lote",
      loteTom: m.controlaLote ? "alerta" : "neutro",
    })),
  };
}

export async function verMaterial(id: string): Promise<DetalheLido | null> {
  const prisma = cliente();
  const m = await prisma.material.findUnique({
    where: { id },
    select: {
      codigo: true, descricaoSucinta: true, descricaoDetalhada: true,
      classificacao: true, categoria: true, catmat: true, controlaLote: true, ativo: true,
      grupo: { select: { codigo: true, descricao: true } },
      classeDeMaterial: { select: { codigo: true, descricao: true } },
      unidades: {
        select: {
          ehDeEstoque: true, fatorParaEstoque: true,
          unidadeDeMedida: { select: { sigla: true, descricao: true } },
        },
      },
      parametros: {
        select: {
          quantidadeMinima: true, quantidadeMaxima: true,
          deposito: { select: { codigo: true, nome: true } },
        },
      },
      marcas: { select: { marca: { select: { nome: true } } } },
      elementosDeDespesa: {
        select: { naturezaDespesa: { select: { codigoCompleto: true, descricao: true } } },
      },
      movimentos: {
        select: {
          id: true, tipo: true, quantidade: true, valorTotal: true,
          dataMovimento: true, motivo: true, criadoEm: true, criadoPor: true,
          deposito: { select: { codigo: true } },
        },
        orderBy: { dataMovimento: "desc" },
        take: 100,
      },
    },
  });
  if (m === null) return null;

  const unidadeDeEstoque = m.unidades.find((u) => u.ehDeEstoque);

  return {
    titulo: `${m.codigo} — ${m.descricaoSucinta}`,
    subtitulo: `${m.grupo.codigo} ${m.grupo.descricao} · ${ROTULO_DA_CLASSIFICACAO[m.classificacao] ?? m.classificacao}`,
    selos: [
      { texto: m.ativo ? "Ativo" : "Inativo", tom: m.ativo ? "ok" : "neutro" },
      ...(m.controlaLote
        ? [{ texto: "Controla lote e validade", tom: "alerta" as const }]
        : []),
      ...(m.catmat === null ? [] : [{ texto: `CATMAT ${m.catmat}`, tom: "neutro" as const }]),
    ],
    dados: [
      { rotulo: "Descrição detalhada", valor: m.descricaoDetalhada, tipo: "longo",
        nota: "É esta que vai para o termo de referência da compra." },
      { rotulo: "Grupo", valor: `${m.grupo.codigo} — ${m.grupo.descricao}` },
      { rotulo: "Classe contábil", valor: `${m.classeDeMaterial.codigo} — ${m.classeDeMaterial.descricao}`,
        nota: "É por ela que a entrada e a saída movem a conta de estoque no razão." },
      { rotulo: "Categoria", valor: ROTULO_DA_CATEGORIA[m.categoria] ?? m.categoria },
      { rotulo: "Unidade de estoque",
        valor: unidadeDeEstoque === undefined
          ? "não declarada"
          : `${unidadeDeEstoque.unidadeDeMedida.sigla} — ${unidadeDeEstoque.unidadeDeMedida.descricao}`,
        nota: "É a unidade em que o saldo é contado; o fator dela é 1 por definição." },
      { rotulo: "Outras unidades",
        valor: m.unidades.filter((u) => !u.ehDeEstoque).length === 0
          ? "nenhuma"
          : m.unidades
              .filter((u) => !u.ehDeEstoque)
              .map((u) => `${u.unidadeDeMedida.sigla} (fator ${u.fatorParaEstoque.toFixed(6)})`)
              .join(" · ") },
      { rotulo: "Marcas aprovadas",
        valor: m.marcas.length === 0 ? "nenhuma" : m.marcas.map((x) => x.marca.nome).join(" · ") },
      { rotulo: "Elementos de despesa",
        valor: m.elementosDeDespesa.length === 0
          ? "nenhum"
          : m.elementosDeDespesa.map((x) => `${x.naturezaDespesa.codigoCompleto} — ${x.naturezaDespesa.descricao}`).join(" · "),
        nota: "Sem elemento relacionado, a ordem de compra não sabe em que natureza empenhar." },
      { rotulo: "Mínimo e máximo por depósito",
        valor: m.parametros.length === 0
          ? "não definidos"
          : m.parametros
              .map((p) =>
                `${p.deposito.codigo}: ${p.quantidadeMinima === null ? "—" : p.quantidadeMinima.toFixed(3)}` +
                ` a ${p.quantidadeMaxima === null ? "—" : p.quantidadeMaxima.toFixed(3)}`
              )
              .join(" · ") },
    ],
    historico: m.movimentos.map((mv) => ({
      id: mv.id,
      oQue: `${rotuloDoMovimento(mv.tipo)} em ${mv.deposito.codigo} — ${mv.quantidade.toFixed(3)}`,
      quando: diaCivilBr(mv.dataMovimento),
      registradoEm: diaCivilBr(mv.criadoEm),
      por: mv.criadoPor,
      motivo: mv.motivo,
      valor: mv.valorTotal.toFixed(2),
      estornado: mv.tipo.startsWith("ESTORNO_"),
    })),
  };
}

function rotuloDoMovimento(tipo: string): string {
  return tipo
    .replace(/^ESTORNO_/, "Estorno de ")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
}

// ═══════════════════════════════════════════════════════════════════════════
// DEPÓSITOS
// ═══════════════════════════════════════════════════════════════════════════

export async function listarDepositos(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = c.filtros["q"] ?? "";
  const where = q === "" ? {} : { OR: [{ codigo: texto(q) }, { nome: texto(q) }] };

  const [total, linhas] = await Promise.all([
    prisma.deposito.count({ where }),
    prisma.deposito.findMany({
      where,
      ...paginacao(c),
      orderBy: c.ordem === null ? { codigo: "asc" } : { [c.ordem]: c.direcao },
      select: {
        id: true, codigo: true, nome: true,
        unidadeOrc: { select: { codigo: true, descricao: true } },
        // ⚠️ O NOME DA PESSOA MORA NA VERSÃO VIGENTE, não na Pessoa. O M19 é versionado:
        // a última versão por `criadoEm` é a que vale, e é o mesmo SELECT que o
        // `adapter-prisma.ts` do M19 usa — duas formas de ler o nome divergiriam.
        responsavel: {
          select: { versoes: { select: { nome: true }, orderBy: { criadoEm: "desc" }, take: 1 } },
        },
        bloqueios: { select: { inicio: true, fim: true } },
        inventarios: { where: { dataFechamento: null }, select: { id: true } },
      },
    }),
  ]);

  const hoje = new Date();
  return {
    total,
    linhas: linhas.map((d) => {
      const bloqueado =
        d.inventarios.length > 0 ||
        d.bloqueios.some((b) => b.inicio <= hoje && (b.fim === null || b.fim >= hoje));
      return {
        id: d.id,
        codigo: d.codigo,
        nome: d.nome,
        unidade: `${d.unidadeOrc.codigo} — ${d.unidadeOrc.descricao}`,
        responsavel: d.responsavel?.versoes[0]?.nome ?? "—",
        situacao: bloqueado ? "Bloqueada" : "Liberada",
        situacaoTom: bloqueado ? "alerta" : "ok",
      };
    }),
  };
}

export async function verDeposito(id: string): Promise<DetalheLido | null> {
  const prisma = cliente();
  const d = await prisma.deposito.findUnique({
    where: { id },
    select: {
      codigo: true, nome: true, criadoEm: true, criadoPor: true,
      unidadeOrc: { select: { codigo: true, descricao: true } },
      responsavel: {
        select: {
          documento: true,
          versoes: { select: { nome: true }, orderBy: { criadoEm: "desc" }, take: 1 },
        },
      },
      bloqueios: {
        select: {
          id: true, inicio: true, fim: true, motivo: true, criadoEm: true, criadoPor: true,
          material: { select: { codigo: true } },
        },
        orderBy: { inicio: "desc" },
      },
      inventarios: {
        select: { id: true, dataAbertura: true, dataFechamento: true, criadoPor: true, criadoEm: true },
        orderBy: { dataAbertura: "desc" },
      },
    },
  });
  if (d === null) return null;

  const hoje = new Date();
  const inventarioAberto = d.inventarios.some((i) => i.dataFechamento === null);
  const bloqueioVigente = d.bloqueios.some(
    (b) => b.inicio <= hoje && (b.fim === null || b.fim >= hoje)
  );

  return {
    titulo: `${d.codigo} — ${d.nome}`,
    subtitulo: `${d.unidadeOrc.codigo} ${d.unidadeOrc.descricao}`,
    selos: [
      bloqueioVigente || inventarioAberto
        ? { texto: "Movimentação bloqueada", tom: "alerta" }
        : { texto: "Movimentação liberada", tom: "ok" },
      ...(inventarioAberto
        ? [{ texto: "Inventário aberto", tom: "alerta" as const }]
        : []),
    ],
    dados: [
      { rotulo: "Unidade gestora", valor: `${d.unidadeOrc.codigo} — ${d.unidadeOrc.descricao}`,
        nota: "Quem pode movimentar este depósito é quem tem permissão nesta unidade." },
      { rotulo: "Responsável",
        valor: d.responsavel === null ? "não designado" : `${d.responsavel.versoes[0]?.nome ?? "sem nome na versão vigente"} · ${d.responsavel.documento}` },
      { rotulo: "Bloqueios vigentes",
        valor: bloqueioVigente || inventarioAberto
          ? [
              ...d.bloqueios
                .filter((b) => b.inicio <= hoje && (b.fim === null || b.fim >= hoje))
                .map((b) => `${b.material === null ? "depósito inteiro" : b.material.codigo}: ${b.motivo}`),
              ...(inventarioAberto ? ["inventário aberto"] : []),
            ].join(" · ")
          : "nenhum",
        nota: "Inventário aberto bloqueia por si — é o que torna a contagem comparável." },
      { rotulo: "Criado em", valor: diaCivilBr(d.criadoEm), tipo: "data" },
    ],
    historico: [
      ...d.bloqueios.map((b) => ({
        id: b.id,
        oQue:
          `Bloqueio de ${b.material === null ? "todo o depósito" : b.material.codigo}` +
          (b.fim === null ? " — sem prazo" : ` — até ${diaCivilBr(b.fim)}`),
        quando: diaCivilBr(b.inicio),
        registradoEm: diaCivilBr(b.criadoEm),
        por: b.criadoPor,
        motivo: b.motivo,
        estornado: b.fim !== null && b.fim < hoje,
      })),
      ...d.inventarios.map((i) => ({
        id: i.id,
        oQue: i.dataFechamento === null ? "Inventário aberto" : "Inventário fechado",
        quando: diaCivilBr(i.dataFechamento ?? i.dataAbertura),
        registradoEm: diaCivilBr(i.criadoEm),
        por: i.criadoPor,
        motivo: null,
        estornado: false,
      })),
    ].sort((a, b) => (a.quando < b.quando ? 1 : -1)) as readonly LinhaDoHistorico[],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// REQUISIÇÕES — e o ATENDIMENTO PARCIAL é derivado, nunca uma coluna
// ═══════════════════════════════════════════════════════════════════════════

const SELECT_ITENS_DA_REQUISICAO = {
  id: true,
  quantidadeSolicitada: true,
  material: { select: { id: true, codigo: true, descricaoSucinta: true, controlaLote: true } },
  // ⚠️ O `tipo` VEM JUNTO DA QUANTIDADE, e não é decoração: `saldoNaoAtendido` usa o SINAL
  // do movimento porque o estorno de uma saída DEVOLVE o item à requisição. Somar só as
  // quantidades contaria o estorno como um atendimento a mais, e a requisição apareceria
  // como atendida tendo devolvido tudo.
  atendimentos: { select: { tipo: true, quantidade: true } },
} as const;

/**
 * O que falta atender em cada item — pela função pura do domínio.
 *
 * ⚠️ NÃO HÁ COLUNA "quantidadeAtendida" NO MODELO, e é decisão do ENT05: o atendimento é a
 * soma das saídas vinculadas ao item, e uma coluna passaria a poder divergir delas no
 * primeiro estorno.
 */
function pendenciaDosItens(
  itens: readonly {
    readonly quantidadeSolicitada: { toFixed: (n: number) => string };
    readonly atendimentos: readonly {
      readonly tipo: string;
      readonly quantidade: { toFixed: (n: number) => string };
    }[];
  }[]
): { readonly solicitado: string; readonly naoAtendido: string; readonly completa: boolean } {
  let solicitado = toMoney("0");
  let naoAtendido = toMoney("0");
  for (const i of itens) {
    solicitado = solicitado.plus(toMoney(i.quantidadeSolicitada.toFixed(4)));
    naoAtendido = naoAtendido.plus(
      saldoNaoAtendido(
        toMoney(i.quantidadeSolicitada.toFixed(4)),
        i.atendimentos.map((a) => ({
          tipo: a.tipo as TipoMovimentoFisicoEstoque,
          quantidade: toMoney(a.quantidade.toFixed(4)),
        }))
      )
    );
  }
  return {
    solicitado: solicitado.toFixed(3),
    naoAtendido: naoAtendido.toFixed(3),
    completa: naoAtendido.lessThanOrEqualTo(toMoney("0")),
  };
}

export async function listarRequisicoes(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = c.filtros["q"] ?? "";
  const deposito = c.filtros["deposito"] ?? "";

  const where = {
    ...(q !== "" ? { OR: [{ numero: texto(q) }, { solicitante: texto(q) }] } : {}),
    ...(deposito !== "" ? { depositoId: deposito } : {}),
  };

  const [total, linhas] = await Promise.all([
    prisma.requisicaoDeMaterial.count({ where }),
    prisma.requisicaoDeMaterial.findMany({
      where,
      ...paginacao(c),
      orderBy: c.ordem === null ? { dataRequisicao: "desc" } : { [c.ordem]: c.direcao },
      select: {
        id: true, numero: true, dataRequisicao: true, solicitante: true,
        deposito: { select: { codigo: true, nome: true } },
        setor: { select: { codigo: true, nome: true } },
        itens: { select: SELECT_ITENS_DA_REQUISICAO },
      },
    }),
  ]);

  // ⚠️ O FILTRO DE SITUAÇÃO É APLICADO DEPOIS DA DERIVAÇÃO, e não no `where`. "Com saldo a
  // atender" não é coluna: é a diferença entre o solicitado e as saídas. Um `where` que o
  // fingisse teria de guardar a resposta numa coluna — a coisa que o ENT05 recusou.
  const pendentes = c.filtros["pendentes"] ?? "";
  const linhasDerivadas = linhas.map((r) => {
    const p = pendenciaDosItens(r.itens);
    return {
      id: r.id,
      numero: r.numero,
      dataRequisicao: diaCivilBr(r.dataRequisicao),
      deposito: `${r.deposito.codigo} — ${r.deposito.nome}`,
      setor: `${r.setor.codigo} — ${r.setor.nome}`,
      solicitante: r.solicitante,
      atendimento: p.completa ? "Atendida" : `Faltam ${p.naoAtendido}`,
      atendimentoTom: p.completa ? "ok" : "alerta",
      __completa: p.completa,
    };
  });

  const filtradas =
    pendentes === "PENDENTES"
      ? linhasDerivadas.filter((l) => !l.__completa)
      : pendentes === "ATENDIDAS"
        ? linhasDerivadas.filter((l) => l.__completa)
        : linhasDerivadas;

  return {
    // ⚠️ O TOTAL ACOMPANHA A FILTRAGEM DERIVADA, e quando ela existe o total é o da PÁGINA.
    // Dizer "142 requisições" e mostrar 7 seria pior que não dizer nada — e um `count` no
    // banco não sabe responder por um critério que o banco não guarda.
    total: pendentes === "" ? total : filtradas.length,
    linhas: filtradas.map(({ __completa: _ignorado, ...linha }) => linha) as readonly LinhaDoMolde[],
  };
}

export async function verRequisicao(id: string): Promise<DetalheLido | null> {
  const prisma = cliente();
  const r = await prisma.requisicaoDeMaterial.findUnique({
    where: { id },
    select: {
      numero: true, dataRequisicao: true, solicitante: true, criadoEm: true, criadoPor: true,
      deposito: { select: { codigo: true, nome: true } },
      setor: { select: { codigo: true, nome: true } },
      itens: {
        select: {
          ...SELECT_ITENS_DA_REQUISICAO,
          atendimentos: {
            select: {
              id: true, tipo: true, quantidade: true, valorTotal: true, valorUnitario: true,
              dataMovimento: true, motivo: true, criadoEm: true, criadoPor: true,
            },
            orderBy: { dataMovimento: "asc" },
          },
        },
      },
    },
  });
  if (r === null) return null;

  const p = pendenciaDosItens(r.itens);

  return {
    titulo: `Requisição ${r.numero}`,
    subtitulo: `${r.setor.codigo} ${r.setor.nome} · ${r.deposito.nome}`,
    selos: [
      p.completa
        ? { texto: "Atendida", tom: "ok" }
        : { texto: `Faltam ${p.naoAtendido}`, tom: "alerta" },
    ],
    dados: [
      { rotulo: "Depósito", valor: `${r.deposito.codigo} — ${r.deposito.nome}` },
      { rotulo: "Setor requisitante", valor: `${r.setor.codigo} — ${r.setor.nome}` },
      { rotulo: "Solicitante", valor: r.solicitante },
      { rotulo: "Data da requisição", valor: diaCivilBr(r.dataRequisicao), tipo: "data" },
      { rotulo: "Total solicitado", valor: p.solicitado,
        nota: "Somado dos itens, na unidade de estoque de cada material." },
      { rotulo: "Ainda não atendido", valor: p.naoAtendido,
        nota: "Derivado: solicitado menos as saídas vinculadas ao item. Não existe coluna de atendido." },
      ...r.itens.map((i) => ({
        rotulo: `Item ${i.material.codigo}`,
        valor:
          `${i.material.descricaoSucinta} — solicitado ${i.quantidadeSolicitada.toFixed(3)}, ` +
          `falta ${saldoNaoAtendido(
            toMoney(i.quantidadeSolicitada.toFixed(4)),
            i.atendimentos.map((a) => ({
              tipo: a.tipo as TipoMovimentoFisicoEstoque,
              quantidade: toMoney(a.quantidade.toFixed(4)),
            }))
          ).toFixed(3)}`,
        ...(i.material.controlaLote
          ? { nota: "Material com lote: a saída EXIGE de qual lote sai." }
          : {}),
      })),
    ],
    historico: r.itens.flatMap((i) =>
      i.atendimentos.map((a) => ({
        id: a.id,
        oQue:
          `${rotuloDoMovimento(a.tipo)} de ${i.material.codigo} — ${a.quantidade.toFixed(3)} ` +
          `ao preço médio de ${a.valorUnitario.toFixed(6)}`,
        quando: diaCivilBr(a.dataMovimento),
        registradoEm: diaCivilBr(a.criadoEm),
        por: a.criadoPor,
        motivo: a.motivo,
        valor: a.valorTotal.toFixed(2),
        estornado: a.tipo.startsWith("ESTORNO_"),
      }))
    ),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// INVENTÁRIOS DE ESTOQUE — a divergência é DERIVADA na leitura
// ═══════════════════════════════════════════════════════════════════════════

export async function listarInventariosDeEstoque(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const deposito = c.filtros["deposito"] ?? "";
  const situacao = c.filtros["situacao"] ?? "";

  const where = {
    ...(deposito !== "" ? { depositoId: deposito } : {}),
    ...(situacao === "ABERTO" ? { dataFechamento: null } : {}),
    ...(situacao === "FECHADO" ? { dataFechamento: { not: null } } : {}),
  };

  const [total, linhas] = await Promise.all([
    prisma.inventarioDeEstoque.count({ where }),
    prisma.inventarioDeEstoque.findMany({
      where,
      ...paginacao(c),
      orderBy: c.ordem === null ? { dataAbertura: "desc" } : { [c.ordem]: c.direcao },
      select: {
        id: true, dataAbertura: true, dataFechamento: true,
        deposito: { select: { codigo: true, nome: true } },
        _count: { select: { contagens: true } },
      },
    }),
  ]);

  return {
    total,
    linhas: linhas.map((i) => ({
      id: i.id,
      deposito: `${i.deposito.codigo} — ${i.deposito.nome}`,
      dataAbertura: diaCivilBr(i.dataAbertura),
      dataFechamento: i.dataFechamento === null ? "—" : diaCivilBr(i.dataFechamento),
      contagens: String(i._count.contagens),
      situacao: i.dataFechamento === null ? "Aberto — depósito bloqueado" : "Fechado",
      situacaoTom: i.dataFechamento === null ? "alerta" : "ok",
    })),
  };
}

export async function verInventarioDeEstoque(id: string): Promise<DetalheLido | null> {
  const prisma = cliente();
  const inv = await prisma.inventarioDeEstoque.findUnique({
    where: { id },
    select: {
      dataAbertura: true, dataFechamento: true, criadoEm: true, criadoPor: true,
      depositoId: true,
      deposito: { select: { codigo: true, nome: true } },
      termoAbertura: { select: { nomeOriginal: true } },
      termoFechamento: { select: { nomeOriginal: true } },
      contagens: {
        select: {
          id: true, quantidadeContada: true, criadoEm: true, criadoPor: true,
          material: { select: { id: true, codigo: true, descricaoSucinta: true } },
          lote: { select: { identificacao: true } },
        },
        orderBy: { criadoEm: "asc" },
      },
    },
  });
  if (inv === null) return null;

  // ⚠️ A DIVERGÊNCIA É CALCULADA AGORA, contra a posição NA DATA DE ABERTURA — e não contra
  // "hoje". Comparar a contagem de março com o saldo de maio produziria uma divergência que
  // é só a movimentação do intervalo.
  const diaDaAbertura = diaCivil(inv.dataAbertura);
  const divergencias: string[] = [];
  for (const c of inv.contagens) {
    const movimentos = await prisma.movimentoFisicoDeEstoque.findMany({
      where: { materialId: c.material.id, depositoId: inv.depositoId },
      select: { tipo: true, quantidade: true, valorTotal: true, dataMovimento: true },
    });
    const posicao = posicaoDeEstoque(paraPosicao(movimentos), diaDaAbertura);
    const diferenca = toMoney(c.quantidadeContada.toFixed(4)).minus(posicao.quantidade);
    if (!diferenca.isZero()) {
      divergencias.push(
        `${c.material.codigo}: contado ${c.quantidadeContada.toFixed(3)}, ` +
          `posição ${posicao.quantidade.toFixed(3)} (${diferenca.greaterThan(0) ? "sobra" : "falta"} ${diferenca.abs().toFixed(3)})`
      );
    }
  }

  const aberto = inv.dataFechamento === null;
  return {
    titulo: `Inventário de ${inv.deposito.codigo} — ${inv.deposito.nome}`,
    subtitulo: `Aberto em ${diaCivilBr(inv.dataAbertura)}${aberto ? "" : ` · fechado em ${diaCivilBr(inv.dataFechamento!)}`}`,
    selos: [
      aberto
        ? { texto: "Aberto — movimentação bloqueada", tom: "alerta" }
        : { texto: "Fechado", tom: "ok" },
      divergencias.length === 0
        ? { texto: "Sem divergência", tom: "ok" }
        : { texto: `${divergencias.length} com divergência`, tom: "erro" },
    ],
    dados: [
      { rotulo: "Depósito", valor: `${inv.deposito.codigo} — ${inv.deposito.nome}` },
      { rotulo: "Abertura", valor: diaCivilBr(inv.dataAbertura), tipo: "data" },
      { rotulo: "Fechamento",
        valor: aberto ? "em aberto" : diaCivilBr(inv.dataFechamento!), tipo: "data" },
      { rotulo: "Termo de abertura",
        valor: inv.termoAbertura?.nomeOriginal ?? "não anexado",
        nota: "O termo é documento do M22 — ele entra na fila de assinaturas." },
      { rotulo: "Termo de fechamento", valor: inv.termoFechamento?.nomeOriginal ?? "não anexado" },
      { rotulo: "Contagens registradas", valor: String(inv.contagens.length), tipo: "inteiro" },
      { rotulo: "Divergências",
        valor: divergencias.length === 0 ? "nenhuma" : divergencias.join(" · "),
        tipo: "longo",
        nota:
          "Comparado contra a posição NA DATA DE ABERTURA. Divergência não vira ajuste " +
          "automático: ajuste é movimento próprio, com motivo." },
    ],
    historico: inv.contagens.map((c) => ({
      id: c.id,
      oQue:
        `Contagem de ${c.material.codigo} — ${c.quantidadeContada.toFixed(3)}` +
        (c.lote === null ? "" : ` (lote ${c.lote.identificacao})`),
      quando: diaCivilBr(c.criadoEm),
      registradoEm: diaCivilBr(c.criadoEm),
      por: c.criadoPor,
      motivo: null,
      estornado: false,
    })),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// AS OPÇÕES DOS SELETORES
//
// ⚠️ ELAS NÃO ENTRARAM NO `opcoesDoCadastro` GERAL, e a razão é medida, não estética:
// aquele carrega fontes, contas do PCASP (teto de 2.000), órgãos e contratos em TODA tela
// do molde. Materiais e depósitos são de outra família e não servem a nenhum daqueles
// cadastros — juntá-los faria a tela de convênio pagar por uma lista de material que ela
// nunca mostra.
//
// ⚠️ E AS CONTEXTUAIS SÃO CONTEXTUAIS DE VERDADE. Lote só existe por (material, depósito);
// item de requisição só existe dentro da requisição aberta; bloqueio a encerrar só o que
// está vigente naquele depósito. Oferecer os de outro registro seria montar um formulário
// que o caso de uso recusa — o mesmo defeito que a medição de obra já corrigiu.
// ═══════════════════════════════════════════════════════════════════════════

export async function opcoesDoAlmoxarifado(
  p: {
    readonly depositoId?: string;
    readonly requisicaoId?: string;
    readonly materialId?: string;
  } = {}
): Promise<OpcoesDoCadastro> {
  const prisma = cliente();
  const [grupos, classes, unidades, depositos, materiais, setores, ugs, pessoas, marcas, naturezas, anexos] =
    await Promise.all([
      prisma.grupoDeMaterial.findMany({ select: { id: true, codigo: true, descricao: true }, orderBy: { codigo: "asc" }, take: 500 }),
      prisma.classeDeMaterial.findMany({ where: { ativa: true }, select: { id: true, codigo: true, descricao: true }, orderBy: { codigo: "asc" }, take: 500 }),
      prisma.unidadeDeMedida.findMany({ select: { id: true, sigla: true, descricao: true }, orderBy: { sigla: "asc" }, take: 200 }),
      prisma.deposito.findMany({ where: { ativo: true }, select: { id: true, codigo: true, nome: true }, orderBy: { codigo: "asc" }, take: 300 }),
      prisma.material.findMany({ where: { ativo: true }, select: { id: true, codigo: true, descricaoSucinta: true }, orderBy: { codigo: "asc" }, take: 1000 }),
      prisma.setor.findMany({ where: { ativo: true }, select: { id: true, codigo: true, nome: true }, orderBy: { codigo: "asc" }, take: 300 }),
      prisma.unidadeOrcamentaria.findMany({ select: { id: true, codigo: true, descricao: true }, orderBy: { codigo: "asc" }, take: 300 }),
      prisma.pessoa.findMany({
        select: { id: true, documento: true, versoes: { select: { nome: true }, orderBy: { criadoEm: "desc" }, take: 1 } },
        take: 500,
      }),
      prisma.marcaAprovada.findMany({ where: { ativa: true }, select: { id: true, nome: true }, orderBy: { nome: "asc" }, take: 500 }),
      prisma.naturezaDespesa.findMany({ select: { id: true, codigoCompleto: true, descricao: true }, orderBy: { codigoCompleto: "asc" }, take: 1000 }),
      prisma.anexo.findMany({ select: { id: true, nomeOriginal: true }, orderBy: { criadoEm: "desc" }, take: 200 }),
    ]);

  const [bloqueios, itensDeRequisicao, lotes] = await Promise.all([
    p.depositoId === undefined
      ? Promise.resolve([])
      : prisma.bloqueioDeEstoque.findMany({
          // ⚠️ SÓ OS NÃO ENCERRADOS: encerrar duas vezes reescreveria a data de fim do
          // primeiro encerramento, e o período em que o bloqueio valeu é o que explica as
          // recusas daquele intervalo.
          where: { depositoId: p.depositoId, fim: null },
          select: { id: true, motivo: true, inicio: true, material: { select: { codigo: true } } },
          orderBy: { inicio: "desc" },
        }),
    p.requisicaoId === undefined
      ? Promise.resolve([])
      : prisma.itemDeRequisicaoDeMaterial.findMany({
          where: { requisicaoId: p.requisicaoId },
          select: {
            id: true, quantidadeSolicitada: true,
            material: { select: { codigo: true, descricaoSucinta: true } },
            atendimentos: { select: { tipo: true, quantidade: true } },
          },
        }),
    p.materialId === undefined || p.depositoId === undefined
      ? Promise.resolve([])
      : prisma.loteDeMaterial.findMany({
          where: { materialId: p.materialId, depositoId: p.depositoId },
          select: { id: true, identificacao: true, validade: true },
          orderBy: { identificacao: "asc" },
        }),
  ]);

  return {
    grupoId: grupos.map((g) => ({ valor: g.id, rotulo: `${g.codigo} — ${g.descricao}` })),
    paiId: grupos.map((g) => ({ valor: g.id, rotulo: `${g.codigo} — ${g.descricao}` })),
    // ⚠️ `paiId` É O MESMO ROL DE GRUPOS, E A FALTA DESTA LINHA ERA UM DEFEITO REAL.
    //
    // O preenchimento das opções é POR NOME DO CAMPO (`FormsDoRecurso` procura
    // `opcoes[campo.nome]`). O descritor de grupos declara o campo `paiId` com `opcoes: []`,
    // e a porta só expunha `grupoId` — então o select "Grupo pai" nunca recebia opção.
    //
    // ⚠️ E O PIOR NÃO ERA O SELECT VAZIO: era a MENSAGEM. O molde desabilita o campo dizendo
    // "Nenhuma opção cadastrada para grupo pai. Cadastre antes de usar esta tela" — o
    // servidor que acabou de cadastrar um grupo lia que não havia nenhum. Uma mensagem
    // tecnicamente correta explicando a causa ERRADA manda a pessoa fazer a coisa errada.
    classeDeMaterialId: classes.map((c) => ({ valor: c.id, rotulo: `${c.codigo} — ${c.descricao}` })),
    unidadeDeMedidaId: unidades.map((u) => ({ valor: u.id, rotulo: `${u.sigla} — ${u.descricao}` })),
    depositoId: depositos.map((d) => ({ valor: d.id, rotulo: `${d.codigo} — ${d.nome}` })),
    deposito: depositos.map((d) => ({ valor: d.id, rotulo: `${d.codigo} — ${d.nome}` })),
    materialId: materiais.map((m) => ({ valor: m.id, rotulo: `${m.codigo} — ${m.descricaoSucinta}` })),
    setorId: setores.map((s) => ({ valor: s.id, rotulo: `${s.codigo} — ${s.nome}` })),
    unidadeOrcId: ugs.map((u) => ({ valor: u.id, rotulo: `${u.codigo} — ${u.descricao}` })),
    responsavelId: pessoas.map((x) => ({
      valor: x.id,
      rotulo: `${x.versoes[0]?.nome ?? "sem nome na versão vigente"} · ${x.documento}`,
    })),
    marcaId: marcas.map((m) => ({ valor: m.id, rotulo: m.nome })),
    naturezaDespesaId: naturezas.map((n) => ({ valor: n.id, rotulo: `${n.codigoCompleto} — ${n.descricao}` })),
    termoAberturaId: anexos.map((a) => ({ valor: a.id, rotulo: a.nomeOriginal })),
    termoFechamentoId: anexos.map((a) => ({ valor: a.id, rotulo: a.nomeOriginal })),
    bloqueioId: bloqueios.map((b) => ({
      valor: b.id,
      rotulo: `${b.material === null ? "depósito inteiro" : b.material.codigo} — ${b.motivo} (desde ${diaCivilBr(b.inicio)})`,
    })),
    itemDeRequisicaoId: itensDeRequisicao
      .map((i) => {
        const falta = saldoNaoAtendido(
          toMoney(i.quantidadeSolicitada.toFixed(4)),
          i.atendimentos.map((a) => ({
            tipo: a.tipo as TipoMovimentoFisicoEstoque,
            quantidade: toMoney(a.quantidade.toFixed(4)),
          }))
        );
        return { valor: i.id, rotulo: `${i.material.codigo} — falta ${falta.toFixed(3)}`, falta };
      })
      // ⚠️ SÓ OS QUE AINDA FALTAM. Um item já atendido na lista convidaria a uma saída que o
      // servidor recusa por exceder o solicitado.
      .filter((x) => x.falta.greaterThan(0))
      .map(({ valor, rotulo }) => ({ valor, rotulo })),
    loteId: lotes.map((l) => ({
      valor: l.id,
      rotulo: `${l.identificacao}${l.validade === null ? "" : ` — vence ${diaCivilBr(l.validade)}`}`,
    })),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// AS ESCRITAS — nenhuma regra de negócio aqui; tudo dentro da transação do domínio
// ═══════════════════════════════════════════════════════════════════════════

type Campos = Readonly<Record<string, string>>;

const t = (c: Campos, k: string): string => (c[k] ?? "").trim();

/**
 * ⚠️ A DATA DO FORMULÁRIO, ANCORADA NO DIA CIVIL DO ENTE — e é por aqui que o defeito
 * `EIXO-DE-DATA-NA-ENTRADA-DO-ENT05` entrava.
 *
 * `<input type="date">` entrega `YYYY-MM-DD`. Entregue crua a um `z.coerce.date()`, essa
 * string vira meia-noite **UTC** — e no fuso do ente (UTC-3) o dia civil desse instante é o
 * ANTERIOR. O operador digitava 11 e o sistema guardava um instante cujo dia civil era 10.
 *
 * ⚠️ E NÃO ERA SÓ APRESENTAÇÃO: `posicaoDeEstoque` corta por dia civil, então o movimento
 * digitado como 11 entrava na posição pedida "até 10" — a posição de ontem incluindo um
 * movimento de hoje. A ficha de controle e o inventário usam o mesmo corte.
 *
 * ⚠️ POR QUE A CORREÇÃO É AQUI E NÃO NOS SCHEMAS. Os 25 `z.coerce.date()` dos módulos do
 * ENT05 são INÓCUOS quando recebem um `Date` ou um instante ISO completo — e é isso que
 * testes, seeds e serviços internos passam. Trocá-los por `zDia` quebraria todos eles para
 * consertar quem nunca foi o culpado: o problema é a string crua do formulário, e a
 * fronteira do formulário é este arquivo.
 */
const dia = (c: Campos, k: string): Date => inicioDoDiaCivil(t(c, k));

const opcional = (c: Campos, k: string): string | undefined => {
  const v = t(c, k);
  return v === "" ? undefined : v;
};
const marcado = (c: Campos, k: string): boolean => {
  const v = t(c, k);
  return v === "on" || v === "true" || v === "1";
};

export async function criarMaterial(c: Campos): Promise<void> {
  await comEscritaAutenticada("CADASTRAR_MATERIAL", (criadoPor) =>
    cadastrarMaterial(cliente(), {
      codigo: t(c, "codigo"),
      descricaoSucinta: t(c, "descricaoSucinta"),
      descricaoDetalhada: t(c, "descricaoDetalhada"),
      grupoId: t(c, "grupoId"),
      classificacao: t(c, "classificacao") as "CONSUMO",
      categoria: t(c, "categoria") as "ESTOCAVEL",
      ...(opcional(c, "catmat") !== undefined ? { catmat: t(c, "catmat") } : {}),
      classeDeMaterialId: t(c, "classeDeMaterialId"),
      controlaLote: marcado(c, "controlaLote"),
      // ⚠️ UMA UNIDADE, A CANÔNICA, COM FATOR 1 — e a limitação está dita no formulário.
      // O caso de uso recebe `unidades[]` e exige exatamente UMA de estoque com fator 1; o
      // molde não tem campo repetidor e não cresce para ganhar um (limite 2). Material com
      // várias unidades é a pendência `MATERIAL-COM-MULTIPLAS-UNIDADES`.
      unidades: [
        { unidadeDeMedidaId: t(c, "unidadeDeMedidaId"), fatorParaEstoque: "1", ehDeEstoque: true },
      ],
      criadoPor,
    })
  );
}

export async function acaoDoMaterial(acao: string, materialId: string, c: Campos): Promise<void> {
  switch (acao) {
    case "definir-parametro":
      await comEscritaAutenticada("DEFINIR_PARAMETRO_DE_ESTOQUE", (criadoPor) =>
        definirParametroDeEstoque(cliente(), {
          materialId,
          depositoId: t(c, "depositoId"),
          ...(opcional(c, "quantidadeMinima") !== undefined ? { quantidadeMinima: t(c, "quantidadeMinima") } : {}),
          ...(opcional(c, "quantidadeMaxima") !== undefined ? { quantidadeMaxima: t(c, "quantidadeMaxima") } : {}),
          criadoPor,
        })
      );
      return;
    case "relacionar-marca":
      await comEscritaAutenticada("RELACIONAR_MARCA_AO_MATERIAL", (criadoPor) =>
        relacionarMarcaAoMaterial(cliente(), { materialId, marcaId: t(c, "marcaId"), criadoPor })
      );
      return;
    case "relacionar-elemento":
      await comEscritaAutenticada("RELACIONAR_ELEMENTO_AO_MATERIAL", (criadoPor) =>
        relacionarElementoAoMaterial(cliente(), {
          materialId,
          naturezaDespesaId: t(c, "naturezaDespesaId"),
          criadoPor,
        })
      );
      return;
    default:
      throw new Error(`Ação "${acao}" não existe neste cadastro. Nada foi gravado.`);
  }
}

export async function criarDeposito(c: Campos): Promise<void> {
  await comEscritaAutenticada("CADASTRAR_DEPOSITO", (criadoPor) =>
    cadastrarDeposito(cliente(), {
      codigo: t(c, "codigo"),
      nome: t(c, "nome"),
      unidadeOrcId: t(c, "unidadeOrcId"),
      ...(opcional(c, "responsavelId") !== undefined ? { responsavelId: t(c, "responsavelId") } : {}),
      criadoPor,
    })
  );
}

export async function acaoDoDeposito(acao: string, depositoId: string, c: Campos): Promise<void> {
  switch (acao) {
    case "bloquear":
      await comEscritaAutenticada("BLOQUEAR_ESTOQUE", (criadoPor) =>
        bloquearEstoque(cliente(), {
          depositoId,
          ...(opcional(c, "materialId") !== undefined ? { materialId: t(c, "materialId") } : {}),
          inicio: dia(c, "inicio"),
          ...(opcional(c, "fim") !== undefined ? { fim: dia(c, "fim") } : {}),
          motivo: t(c, "motivo"),
          criadoPor,
        })
      );
      return;
    case "encerrar-bloqueio":
      await comEscritaAutenticada("ENCERRAR_BLOQUEIO_DE_ESTOQUE", (criadoPor) =>
        encerrarBloqueioDeEstoque(cliente(), {
          bloqueioId: t(c, "bloqueioId"),
          fim: dia(c, "fim"),
          criadoPor,
        })
      );
      return;
    default:
      throw new Error(`Ação "${acao}" não existe neste cadastro. Nada foi gravado.`);
  }
}

export async function criarRequisicao(c: Campos): Promise<void> {
  await comEscritaAutenticada("REGISTRAR_REQUISICAO_DE_MATERIAL", (criadoPor) =>
    registrarRequisicaoDeMaterial(cliente(), {
      numero: t(c, "numero"),
      depositoId: t(c, "depositoId"),
      setorId: t(c, "setorId"),
      dataRequisicao: dia(c, "dataRequisicao"),
      solicitante: t(c, "solicitante"),
      // ⚠️ UM ITEM — pendência `REQUISICAO-COM-VARIOS-ITENS`, dita no próprio campo.
      itens: [{ materialId: t(c, "materialId"), quantidadeSolicitada: t(c, "quantidade") }],
      criadoPor,
    })
  );
}

export async function acaoDaRequisicao(acao: string, _requisicaoId: string, c: Campos): Promise<void> {
  if (acao !== "atender") {
    throw new Error(`Ação "${acao}" não existe neste cadastro. Nada foi gravado.`);
  }

  // ⚠️ A SAÍDA PRECISA DE MATERIAL E DEPÓSITO, e eles vêm DO ITEM — não de campos da tela.
  // Deixar o operador escolher material aqui permitiria atender a requisição de papel com
  // uma saída de café, e a vinculação diria que a requisição foi atendida.
  const itemId = t(c, "itemDeRequisicaoId");
  const item = await cliente().itemDeRequisicaoDeMaterial.findUnique({
    where: { id: itemId },
    select: { materialId: true, requisicao: { select: { depositoId: true } } },
  });
  if (item === null) {
    throw new Error("Item de requisição não encontrado. Nada foi gravado.");
  }

  await comEscritaAutenticada("REGISTRAR_SAIDA_FISICA", (criadoPor) =>
    registrarSaidaFisica(cliente(), {
      materialId: item.materialId,
      depositoId: item.requisicao.depositoId,
      quantidade: t(c, "quantidade"),
      dataMovimento: dia(c, "dataMovimento"),
      itemDeRequisicaoId: itemId,
      ...(opcional(c, "loteId") !== undefined ? { loteId: t(c, "loteId") } : {}),
      motivo: t(c, "motivo"),
      criadoPor,
    })
  );
}

export async function criarInventarioDeEstoque(c: Campos): Promise<void> {
  await comEscritaAutenticada("ABRIR_INVENTARIO_DE_ESTOQUE", (criadoPor) =>
    abrirInventarioDeEstoque(cliente(), {
      depositoId: t(c, "depositoId"),
      dataAbertura: dia(c, "dataAbertura"),
      ...(opcional(c, "termoAberturaId") !== undefined ? { termoAberturaId: t(c, "termoAberturaId") } : {}),
      criadoPor,
    })
  );
}

export async function acaoDoInventarioDeEstoque(
  acao: string,
  inventarioId: string,
  c: Campos
): Promise<void> {
  switch (acao) {
    case "contar":
      await comEscritaAutenticada("REGISTRAR_CONTAGEM_DE_INVENTARIO", (criadoPor) =>
        registrarContagemDeInventario(cliente(), {
          inventarioId,
          materialId: t(c, "materialId"),
          ...(opcional(c, "loteId") !== undefined ? { loteId: t(c, "loteId") } : {}),
          quantidadeContada: t(c, "quantidadeContada"),
          criadoPor,
        })
      );
      return;
    case "fechar":
      await comEscritaAutenticada("FECHAR_INVENTARIO_DE_ESTOQUE", (criadoPor) =>
        fecharInventarioDeEstoque(cliente(), {
          inventarioId,
          dataFechamento: dia(c, "dataFechamento"),
          ...(opcional(c, "termoFechamentoId") !== undefined ? { termoFechamentoId: t(c, "termoFechamentoId") } : {}),
          criadoPor,
        })
      );
      return;
    default:
      throw new Error(`Ação "${acao}" não existe neste cadastro. Nada foi gravado.`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// OS TRÊS CADASTROS DE APOIO — sem eles o material não se cadastra
// ═══════════════════════════════════════════════════════════════════════════

export async function listarClassesDeMaterial(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = c.filtros["q"] ?? "";
  const where = q === "" ? {} : { OR: [{ codigo: texto(q) }, { descricao: texto(q) }] };
  const [total, linhas] = await Promise.all([
    prisma.classeDeMaterial.count({ where }),
    prisma.classeDeMaterial.findMany({
      where,
      ...paginacao(c),
      orderBy: c.ordem === null ? { codigo: "asc" } : { [c.ordem]: c.direcao },
      select: {
        id: true, codigo: true, descricao: true,
        contaContabil: { select: { codigo: true, nome: true } },
        _count: { select: { materiais: true } },
      },
    }),
  ]);
  return {
    total,
    linhas: linhas.map((x) => ({
      id: x.id,
      codigo: x.codigo,
      descricao: x.descricao,
      conta: `${x.contaContabil.codigo} — ${x.contaContabil.nome}`,
      materiais: String(x._count.materiais),
    })),
  };
}

export async function verClasseDeMaterial(id: string): Promise<DetalheLido | null> {
  const prisma = cliente();
  const x = await prisma.classeDeMaterial.findUnique({
    where: { id },
    select: {
      codigo: true, descricao: true, ativa: true, criadoEm: true, criadoPor: true,
      contaContabil: { select: { codigo: true, nome: true } },
      materiais: { select: { id: true, codigo: true, descricaoSucinta: true, criadoEm: true, criadoPor: true }, orderBy: { codigo: "asc" }, take: 100 },
    },
  });
  if (x === null) return null;
  return {
    titulo: `${x.codigo} — ${x.descricao}`,
    subtitulo: `Conta de estoque ${x.contaContabil.codigo}`,
    selos: [{ texto: x.ativa ? "Ativa" : "Inativa", tom: x.ativa ? "ok" : "neutro" }],
    dados: [
      { rotulo: "Conta de estoque", valor: `${x.contaContabil.codigo} — ${x.contaContabil.nome}`,
        nota: "É nela que o valor do estoque desta classe fica, e é ela que a entrada e a saída movem." },
      { rotulo: "Materiais nesta classe", valor: String(x.materiais.length), tipo: "inteiro" },
      { rotulo: "Criada em", valor: diaCivilBr(x.criadoEm), tipo: "data" },
    ],
    historico: x.materiais.map((m) => ({
      id: m.id,
      oQue: `Material ${m.codigo} — ${m.descricaoSucinta}`,
      quando: diaCivilBr(m.criadoEm),
      registradoEm: diaCivilBr(m.criadoEm),
      por: m.criadoPor,
      motivo: null,
      estornado: false,
    })),
  };
}

export async function listarGruposDeMaterial(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = c.filtros["q"] ?? "";
  const where = q === "" ? {} : { OR: [{ codigo: texto(q) }, { descricao: texto(q) }] };
  const [total, linhas] = await Promise.all([
    prisma.grupoDeMaterial.count({ where }),
    prisma.grupoDeMaterial.findMany({
      where,
      ...paginacao(c),
      orderBy: c.ordem === null ? { codigo: "asc" } : { [c.ordem]: c.direcao },
      select: {
        id: true, codigo: true, descricao: true,
        pai: { select: { codigo: true, descricao: true } },
        _count: { select: { materiais: true } },
      },
    }),
  ]);
  return {
    total,
    linhas: linhas.map((x) => ({
      id: x.id,
      codigo: x.codigo,
      descricao: x.descricao,
      pai: x.pai === null ? "—" : `${x.pai.codigo} — ${x.pai.descricao}`,
      materiais: String(x._count.materiais),
    })),
  };
}

export async function verGrupoDeMaterial(id: string): Promise<DetalheLido | null> {
  const prisma = cliente();
  const x = await prisma.grupoDeMaterial.findUnique({
    where: { id },
    select: {
      codigo: true, descricao: true, criadoEm: true, criadoPor: true,
      pai: { select: { codigo: true, descricao: true } },
      filhos: { select: { codigo: true, descricao: true } },
      materiais: { select: { id: true, codigo: true, descricaoSucinta: true, criadoEm: true, criadoPor: true }, orderBy: { codigo: "asc" }, take: 100 },
    },
  });
  if (x === null) return null;
  return {
    titulo: `${x.codigo} — ${x.descricao}`,
    subtitulo: x.pai === null ? "Grupo de primeiro nível" : `Dentro de ${x.pai.codigo} ${x.pai.descricao}`,
    selos: [{ texto: `${x.materiais.length} materiais`, tom: "neutro" }],
    dados: [
      { rotulo: "Grupo pai", valor: x.pai === null ? "nenhum — é de primeiro nível" : `${x.pai.codigo} — ${x.pai.descricao}` },
      { rotulo: "Subgrupos",
        valor: x.filhos.length === 0 ? "nenhum" : x.filhos.map((f) => `${f.codigo} — ${f.descricao}`).join(" · ") },
      { rotulo: "Criado em", valor: diaCivilBr(x.criadoEm), tipo: "data" },
    ],
    historico: x.materiais.map((m) => ({
      id: m.id,
      oQue: `Material ${m.codigo} — ${m.descricaoSucinta}`,
      quando: diaCivilBr(m.criadoEm),
      registradoEm: diaCivilBr(m.criadoEm),
      por: m.criadoPor,
      motivo: null,
      estornado: false,
    })),
  };
}

export async function listarUnidadesDeMedidaDoMolde(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = c.filtros["q"] ?? "";
  const where = q === "" ? {} : { OR: [{ sigla: texto(q) }, { descricao: texto(q) }] };
  const [total, linhas] = await Promise.all([
    prisma.unidadeDeMedida.count({ where }),
    prisma.unidadeDeMedida.findMany({
      where,
      ...paginacao(c),
      orderBy: c.ordem === null ? { sigla: "asc" } : { [c.ordem]: c.direcao },
      select: { id: true, sigla: true, descricao: true, _count: { select: { materiais: true } } },
    }),
  ]);
  return {
    total,
    linhas: linhas.map((x) => ({
      id: x.id,
      sigla: x.sigla,
      descricao: x.descricao,
      materiais: String(x._count.materiais),
    })),
  };
}

export async function verUnidadeDeMedida(id: string): Promise<DetalheLido | null> {
  const prisma = cliente();
  const x = await prisma.unidadeDeMedida.findUnique({
    where: { id },
    select: {
      sigla: true, descricao: true, criadoEm: true, criadoPor: true,
      materiais: {
        select: {
          id: true, ehDeEstoque: true, fatorParaEstoque: true, criadoEm: true, criadoPor: true,
          material: { select: { codigo: true, descricaoSucinta: true } },
        },
        take: 100,
      },
    },
  });
  if (x === null) return null;
  return {
    titulo: `${x.sigla} — ${x.descricao}`,
    subtitulo: `${x.materiais.length} materiais usam esta unidade`,
    selos: [
      { texto: `${x.materiais.filter((m) => m.ehDeEstoque).length} como unidade de estoque`, tom: "neutro" },
    ],
    dados: [
      { rotulo: "Sigla", valor: x.sigla },
      { rotulo: "Descrição", valor: x.descricao },
      { rotulo: "Uso como unidade de estoque",
        valor: String(x.materiais.filter((m) => m.ehDeEstoque).length),
        tipo: "inteiro",
        nota: "A unidade de estoque tem fator 1 por definição — ela é a própria medida do saldo." },
      { rotulo: "Criada em", valor: diaCivilBr(x.criadoEm), tipo: "data" },
    ],
    historico: x.materiais.map((m) => ({
      id: m.id,
      oQue:
        `${m.material.codigo} — ${m.material.descricaoSucinta}` +
        (m.ehDeEstoque ? " (unidade de estoque)" : ` (fator ${m.fatorParaEstoque.toFixed(6)})`),
      quando: diaCivilBr(m.criadoEm),
      registradoEm: diaCivilBr(m.criadoEm),
      por: m.criadoPor,
      motivo: null,
      estornado: false,
    })),
  };
}

export async function criarClasseDeMaterial(c: Campos): Promise<void> {
  await comEscritaAutenticada("CADASTRAR_CLASSE_DE_MATERIAL", (criadoPor) =>
    cadastrarClasseDeMaterial(cliente(), {
      codigo: t(c, "codigo"),
      descricao: t(c, "descricao"),
      contaContabilId: t(c, "contaContabilId"),
      criadoPor,
    })
  );
}

export async function criarGrupoDeMaterial(c: Campos): Promise<void> {
  await comEscritaAutenticada("CADASTRAR_GRUPO_DE_MATERIAL", (criadoPor) =>
    cadastrarGrupoDeMaterial(cliente(), {
      codigo: t(c, "codigo"),
      descricao: t(c, "descricao"),
      ...(opcional(c, "paiId") !== undefined ? { paiId: t(c, "paiId") } : {}),
      criadoPor,
    })
  );
}

export async function criarUnidadeDeMedida(c: Campos): Promise<void> {
  await comEscritaAutenticada("CADASTRAR_UNIDADE_DE_MEDIDA", (criadoPor) =>
    cadastrarUnidadeDeMedida(cliente(), {
      sigla: t(c, "sigla"),
      descricao: t(c, "descricao"),
      criadoPor,
    })
  );
}

/**
 * ⚠️ OS TRÊS CADASTROS DE APOIO NÃO TÊM AÇÃO DE DETALHE, e o molde cobra coerência: um
 * recurso sem ação nenhuma e sem permissão de criar seria tela de leitura, e para isso a
 * listagem basta. Eles TÊM `criar` — então a função de ação existe só para o despacho
 * fail-closed do `__acao`, e recusa tudo o que não seja "criar".
 */
export async function semAcaoDeDetalhe(acao: string): Promise<void> {
  throw new Error(`Ação "${acao}" não existe neste cadastro. Nada foi gravado.`);
}

// ═══════════════════════════════════════════════════════════════════════════
// A POSIÇÃO DE ESTOQUE — a cláusula que derrubou a coluna de saldo
//
// ⚠️ ESTA SUPERFÍCIE NÃO É CADASTRO, E POR ISSO ESCAPA DO MOLDE. Ela não cria, não edita e
// não tem detalhe: é uma CONSULTA com quatro perguntas sobre o mesmo depósito. O molde
// monta listagem-com-formulário; forçá-lo a montar isto seria crescê-lo para acomodar
// exceção, que é o limite 2 do `lib/molde/tipos.ts`. Escreve-se à mão, como o consórcio.
//
// ⚠️ E A PERGUNTA CENTRAL É "NAQUELA DATA". É ela que refuta uma coluna de saldo dentro da
// própria seção 5.18: uma coluna só sabe responder "agora", e o almoxarife precisa saber o
// que havia no fechamento do mês passado.
// ═══════════════════════════════════════════════════════════════════════════

export interface LinhaDaPosicao {
  readonly materialId: string;
  readonly codigo: string;
  readonly descricao: string;
  readonly unidade: string;
  readonly quantidade: string;
  readonly valor: string;
  readonly precoMedio: string;
  readonly minimo: string | null;
  readonly maximo: string | null;
  readonly abaixoDoMinimo: boolean;
  readonly acimaDoMaximo: boolean;
}

export interface LoteNaValidade {
  readonly identificacao: string;
  readonly material: string;
  readonly validade: string;
  readonly quantidade: string;
}

export interface PosicaoDoDeposito {
  readonly deposito: { readonly id: string; readonly codigo: string; readonly nome: string };
  readonly dia: string;
  readonly bloqueado: boolean;
  readonly motivosDoBloqueio: readonly string[];
  readonly linhas: readonly LinhaDaPosicao[];
  readonly totalEmValor: string;
  readonly vencidos: readonly LoteNaValidade[];
  readonly aVencer: readonly LoteNaValidade[];
}

export async function depositosParaConsulta(): Promise<
  readonly { readonly id: string; readonly codigo: string; readonly nome: string }[]
> {
  return cliente().deposito.findMany({
    where: { ativo: true },
    select: { id: true, codigo: true, nome: true },
    orderBy: { codigo: "asc" },
    take: 300,
  });
}

export async function posicaoDoDeposito(
  depositoId: string,
  ateDia?: string
): Promise<PosicaoDoDeposito | null> {
  const prisma = cliente();
  const dep = await prisma.deposito.findUnique({
    where: { id: depositoId },
    select: { id: true, codigo: true, nome: true },
  });
  if (dep === null) return null;

  // ⚠️ O PADRÃO É HOJE PELO DIA CIVIL DO ENTE, e não `new Date().toISOString()`. O ISO é
  // UTC: às 22:00 do fuso do ente ele responderia pelo dia SEGUINTE, e a tela mostraria a
  // posição de amanhã sem ninguém perceber.
  const dia = ateDia === undefined || ateDia === "" ? diaCivil(new Date()) : ateDia;

  const [materiais, bloqueios, inventariosAbertos, lotes] = await Promise.all([
    prisma.material.findMany({
      where: { ativo: true, movimentos: { some: { depositoId } } },
      select: {
        id: true, codigo: true, descricaoSucinta: true,
        unidades: { where: { ehDeEstoque: true }, select: { unidadeDeMedida: { select: { sigla: true } } } },
        parametros: { where: { depositoId }, select: { quantidadeMinima: true, quantidadeMaxima: true } },
        movimentos: {
          where: { depositoId },
          select: { tipo: true, quantidade: true, valorTotal: true, dataMovimento: true },
        },
      },
      orderBy: { codigo: "asc" },
      take: 500,
    }),
    prisma.bloqueioDeEstoque.findMany({
      where: { OR: [{ depositoId }, { depositoId: null }] },
      select: { inicio: true, fim: true, motivo: true },
    }),
    prisma.inventarioDeEstoque.findMany({
      where: { depositoId, dataFechamento: null },
      select: { dataAbertura: true },
    }),
    prisma.loteDeMaterial.findMany({
      where: { depositoId, validade: { not: null } },
      select: {
        id: true, identificacao: true, validade: true,
        material: { select: { codigo: true, descricaoSucinta: true } },
        movimentos: { select: { tipo: true, quantidade: true, valorTotal: true, dataMovimento: true } },
      },
    }),
  ]);

  const corte = meioDiaCivil(dia);
  const motivos = [
    ...bloqueios
      .filter((b) => b.inicio <= corte && (b.fim === null || b.fim >= corte))
      .map((b) => b.motivo),
    ...inventariosAbertos.map(() => "inventário aberto"),
  ];

  let total = toMoney("0");
  const linhas: LinhaDaPosicao[] = [];
  for (const m of materiais) {
    const posicao = posicaoDeEstoque(paraPosicao(m.movimentos), dia);
    if (posicao.quantidade.isZero() && posicao.valor.isZero()) continue;
    total = total.plus(posicao.valor);
    const p = m.parametros[0];
    const minimo = p?.quantidadeMinima ?? null;
    const maximo = p?.quantidadeMaxima ?? null;
    linhas.push({
      materialId: m.id,
      codigo: m.codigo,
      descricao: m.descricaoSucinta,
      unidade: m.unidades[0]?.unidadeDeMedida.sigla ?? "—",
      quantidade: posicao.quantidade.toFixed(3),
      valor: posicao.valor.toFixed(2),
      // ⚠️ O PREÇO MÉDIO RECUSA POSIÇÃO ZERADA OU NEGATIVA — dividir por zero produziria
      // "Infinity" numa tela de dinheiro. Quem recusa é o domínio, não esta porta.
      precoMedio: posicao.quantidade.greaterThan(0)
        ? precoMedioDaPosicao(posicao).toFixed(6)
        : "—",
      minimo: minimo === null ? null : minimo.toFixed(3),
      maximo: maximo === null ? null : maximo.toFixed(3),
      abaixoDoMinimo: minimo !== null && posicao.quantidade.lessThan(toMoney(minimo.toFixed(4))),
      acimaDoMaximo: maximo !== null && posicao.quantidade.greaterThan(toMoney(maximo.toFixed(4))),
    });
  }

  // ⚠️ SÓ LOTE COM SALDO ENTRA NO RELATÓRIO DE VALIDADE. Um lote já consumido não vence
  // para ninguém — e foi exatamente este o defeito que o teste do ENT05 pegou.
  const vencidos: LoteNaValidade[] = [];
  const aVencer: LoteNaValidade[] = [];
  for (const l of lotes) {
    if (l.validade === null) continue;
    const posicao = posicaoDeEstoque(paraPosicao(l.movimentos), dia);
    if (!posicao.quantidade.greaterThan(0)) continue;
    const registro: LoteNaValidade = {
      identificacao: l.identificacao,
      material: `${l.material.codigo} — ${l.material.descricaoSucinta}`,
      validade: diaCivilBr(l.validade),
      quantidade: posicao.quantidade.toFixed(3),
    };
    const diasAteVencer = diferencaEmDiasCivis(l.validade, corte);
    if (diasAteVencer < 0) vencidos.push(registro);
    else if (diasAteVencer <= 30) aVencer.push(registro);
  }

  return {
    deposito: dep,
    dia,
    bloqueado: motivos.length > 0,
    motivosDoBloqueio: [...new Set(motivos)],
    linhas,
    totalEmValor: total.toFixed(2),
    vencidos,
    aVencer,
  };
}
