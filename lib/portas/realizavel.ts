import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";
import { acoesPermitidas } from "./molde";
import { diaCivil, diaCivilBr } from "../../packages/datas/index";
import { formatarDocumento } from "../../packages/documento/index";
import {
  anularMovimentoDeRealizavel,
  baixarRealizavel,
  cadastrarCategoriaDeRealizavel,
  constituirRealizavel,
  decidirContaDoRealizavel,
  GRUPOS_DO_REALIZAVEL,
  saldoDoRealizavel,
} from "../../modules/m07-extraorcamentario/realizavel";

/**
 * V39-R3 (R3-016) — A TELA DOS REALIZÁVEIS DE NATUREZA ATIVA: categorias com a conta decidida pelo ente, saldos por
 * devedor e os movimentos. Leitura sob CONSULTAR_FINANCEIRO; os atos cobram PARAMETRIZAR_REALIZAVEL e
 * MOVIMENTAR_REALIZAVEL no serviço.
 */

export interface TelaDosRealizaveis {
  readonly categorias: readonly {
    readonly id: string;
    readonly codigo: string;
    readonly descricao: string;
    /** A decisão que vale: conta e situação, ou null se o ente ainda não decidiu. */
    readonly decisao: { readonly conta: string | null; readonly ativa: boolean; readonly fundamento: string; readonly por: string; readonly em: string } | null;
  }[];
  readonly saldos: readonly { readonly categoria: string; readonly devedor: string; readonly conta: string; readonly fonte: string; readonly saldo: string }[];
  readonly movimentos: readonly {
    readonly id: string;
    readonly categoria: string;
    readonly tipo: "CONSTITUICAO" | "BAIXA";
    readonly anulacao: boolean;
    readonly anulado: boolean;
    readonly devedor: string;
    readonly valor: string;
    readonly data: string;
    readonly documento: string;
    readonly historico: string;
    readonly contaBancaria: string;
    readonly por: string;
  }[];
  /** As contas que podem ser decididas: analíticas dos grupos de crédito realizável do ativo, para a busca. */
  readonly contasElegiveis: readonly { readonly codigo: string; readonly nome: string }[];
  /** Cada conta bancária com cada fonte do rol dela: o movimento declara a fonte (numa conta com várias, ela não se adivinha). */
  readonly contasEFontes: readonly { readonly valor: string; readonly rotulo: string }[];
  readonly podeParametrizar: boolean;
  readonly podeMovimentar: boolean;
  readonly hoje: string;
}

export async function lerTelaDosRealizaveis(): Promise<TelaDosRealizaveis> {
  await exigirLeituraDoEnte("CONSULTAR_FINANCEIRO");
  const db = cliente();
  const [categorias, movimentos, contasElegiveis, contasBancarias, permitidas] = await Promise.all([
    db.categoriaDeRealizavel.findMany({
      orderBy: { codigo: "asc" },
      select: { id: true, codigo: true, descricao: true, decisoes: { orderBy: [{ criadoEm: "desc" }, { id: "desc" }], take: 1, select: { ativa: true, fundamento: true, criadoPor: true, criadoEm: true, contaAtivo: { select: { codigo: true, nome: true } } } } },
    }),
    db.movimentoDeRealizavel.findMany({
      orderBy: [{ data: "desc" }, { criadoEm: "desc" }],
      take: 200,
      select: {
        id: true, tipo: true, devedor: true, valor: true, data: true, documento: true, historico: true, estornoDeId: true, criadoPor: true, categoriaId: true,
        categoria: { select: { codigo: true } }, contaBancaria: { select: { codigo: true } }, estorno: { select: { id: true } }, decisao: { select: { contaAtivoId: true, contaAtivo: { select: { codigo: true } } } },
      },
    }),
    db.contaPcasp.findMany({
      // A MESMA regra do serviço (uma lista só): grupos de crédito e saldo devedor.
      where: { analitica: true, naturezaSaldo: "DEVEDORA", OR: GRUPOS_DO_REALIZAVEL.map((g) => ({ codigo: { startsWith: g } })) },
      orderBy: { codigo: "asc" },
      select: { codigo: true, nome: true },
    }),
    db.contaBancaria.findMany({
      where: { contaContabilId: { not: null } },
      orderBy: { codigo: "asc" },
      select: { id: true, codigo: true, descricao: true, fonte: { select: { id: true, codigo: true } }, fontesPermitidas: { select: { fonte: { select: { id: true, codigo: true } } } } },
    }),
    acoesPermitidas(["PARAMETRIZAR_REALIZAVEL", "MOVIMENTAR_REALIZAVEL"]),
  ]);
  // Os saldos por categoria, devedor e conta — a mesma soma do serviço, uma vez por combinação. As combinações vêm de
  // TODOS os movimentos (agrupados), não da lista recortada acima: devedor antigo não some do quadro.
  const grupos = await db.movimentoDeRealizavel.groupBy({ by: ["categoriaId", "devedor", "decisaoId", "fonteId"] });
  const decisoes = await db.decisaoDaCategoriaDeRealizavel.findMany({
    where: { id: { in: [...new Set(grupos.map((g) => g.decisaoId))] } },
    select: { id: true, contaAtivoId: true, contaAtivo: { select: { codigo: true } }, categoria: { select: { codigo: true } } },
  });
  const porDecisao = new Map(decisoes.map((d) => [d.id, d]));
  const codigosDasFontes = new Map((await db.fonteRecurso.findMany({ where: { id: { in: [...new Set(grupos.map((g) => g.fonteId))] } }, select: { id: true, codigo: true } })).map((f) => [f.id, f.codigo]));
  const chaves = new Map<string, { categoriaId: string; categoria: string; devedor: string; contaAtivoId: string; conta: string; fonteId: string }>();
  for (const g of grupos) {
    const d = porDecisao.get(g.decisaoId);
    if (d === undefined || d.contaAtivoId === null || d.contaAtivo === null) continue;
    chaves.set(`${g.categoriaId}|${g.devedor}|${d.contaAtivoId}|${g.fonteId}`, { categoriaId: g.categoriaId, categoria: d.categoria.codigo, devedor: g.devedor, contaAtivoId: d.contaAtivoId, conta: d.contaAtivo.codigo, fonteId: g.fonteId });
  }
  const saldos = [];
  for (const k of chaves.values()) {
    const saldo = await saldoDoRealizavel(db, { categoriaId: k.categoriaId, devedor: k.devedor, contaAtivoId: k.contaAtivoId, fonteId: k.fonteId });
    saldos.push({ categoria: k.categoria, devedor: formatarDocumento(k.devedor), conta: k.conta, fonte: codigosDasFontes.get(k.fonteId) ?? "", saldo: saldo.toFixed(2) });
  }
  return {
    categorias: categorias.map((c) => {
      const d = c.decisoes[0];
      return {
        id: c.id, codigo: c.codigo, descricao: c.descricao,
        decisao: d === undefined ? null : { conta: d.contaAtivo === null ? null : `${d.contaAtivo.codigo} — ${d.contaAtivo.nome}`, ativa: d.ativa, fundamento: d.fundamento, por: d.criadoPor, em: diaCivilBr(d.criadoEm) },
      };
    }),
    saldos,
    movimentos: movimentos.map((m) => ({
      id: m.id, categoria: m.categoria.codigo, tipo: m.tipo, anulacao: m.estornoDeId !== null, anulado: m.estorno !== null, devedor: formatarDocumento(m.devedor), valor: m.valor.toFixed(2),
      data: diaCivilBr(m.data), documento: m.documento, historico: m.historico, contaBancaria: m.contaBancaria.codigo, por: m.criadoPor,
    })),
    contasElegiveis,
    contasEFontes: contasBancarias.flatMap((c) => {
      const fontes = new Map<string, string>([[c.fonte.id, c.fonte.codigo], ...c.fontesPermitidas.map((f) => [f.fonte.id, f.fonte.codigo] as [string, string])]);
      return [...fontes].map(([id, codigo]) => ({ valor: `${c.id}|${id}`, rotulo: `${c.codigo} — ${c.descricao}, fonte ${codigo}` }));
    }),
    podeParametrizar: permitidas.has("PARAMETRIZAR_REALIZAVEL"),
    podeMovimentar: permitidas.has("MOVIMENTAR_REALIZAVEL"),
    hoje: diaCivil(new Date()),
  };
}

export async function cadastrarCategoriaPelaTela(input: { readonly codigo: string; readonly descricao: string }): Promise<string> {
  await comEscritaAutenticada("PARAMETRIZAR_REALIZAVEL", (criadoPor) => cadastrarCategoriaDeRealizavel(cliente(), { ...input, criadoPor }));
  return `Categoria ${input.codigo.toUpperCase()} cadastrada. Ela só movimenta depois que o ente decidir a conta do ativo.`;
}

export async function decidirContaPelaTela(input: { readonly categoriaId: string; readonly contaAtivoCodigo: string | null; readonly ativa: boolean; readonly fundamento: string }): Promise<string> {
  await comEscritaAutenticada("PARAMETRIZAR_REALIZAVEL", (criadoPor) => decidirContaDoRealizavel(cliente(), { ...input, criadoPor }));
  return input.ativa ? `Decisão registrada: a categoria movimenta a conta ${input.contaAtivoCodigo ?? ""}.` : "Decisão registrada: a categoria está suspensa e não movimenta.";
}

export async function movimentarPelaTela(input: {
  readonly tipo: "CONSTITUICAO" | "BAIXA";
  readonly categoriaId: string;
  readonly devedor: string;
  readonly valor: string;
  readonly data: string;
  readonly historico: string;
  readonly documento: string;
  readonly contaBancariaId: string;
  readonly fonteId: string;
}): Promise<string> {
  const { tipo, ...dados } = input;
  await comEscritaAutenticada("MOVIMENTAR_REALIZAVEL", (criadoPor) => (tipo === "CONSTITUICAO" ? constituirRealizavel(cliente(), { ...dados, criadoPor }) : baixarRealizavel(cliente(), { ...dados, criadoPor })));
  return tipo === "CONSTITUICAO" ? "Valor constituído: o dinheiro saiu da conta e o direito de recebê-lo de volta está no ativo." : "Baixa registrada: o dinheiro voltou à conta e o saldo do devedor diminuiu.";
}

export async function anularPelaTela(input: { readonly movimentoId: string; readonly motivo: string; readonly data: string }): Promise<string> {
  await comEscritaAutenticada("MOVIMENTAR_REALIZAVEL", (criadoPor) => anularMovimentoDeRealizavel(cliente(), { ...input, criadoPor }));
  return "Movimento anulado: o lançamento foi invertido e o saldo voltou ao que era antes dele.";
}
