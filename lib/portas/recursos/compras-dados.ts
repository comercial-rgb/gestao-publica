import { diaCivilBr, meioDiaCivil } from "../../../packages/datas/index.js";
import { toMoney } from "../../../packages/contracts/index.js";
import { formatarDocumento } from "../../../packages/documento/index.js";
import type { Prisma } from "../../../prisma/generated/client/client.js";
import {
  emitirOrdemDeCompra,
  estatisticasDaPesquisa,
  estornarOrdemDeCompra,
  movimentarSolicitacaoDeCompra,
  ordemEstornada,
  registrarPesquisaDePrecos,
  registrarRecebimentoDeOrdem,
  registrarSolicitacaoDeCompra,
  saldoDaOrdemDeCompra,
  situacaoDaSolicitacao,
} from "../../../modules/m11-licitacoes/compras.js";
import type { ConsultaDoMolde } from "../../molde/consulta.js";
import { TAMANHO_DE_PAGINA } from "../../molde/consulta.js";
import type { DisponibilidadeDoRegistro, LinhaDoHistorico } from "../../molde/tipos.js";
import { elegibilidadeParaEmpenharOrdem, elegibilidadeParaEstornarOrdem, elegibilidadeParaReceberOrdem, type EstadoDaOrdemParaAtos } from "../../../modules/m11-licitacoes/elegibilidade.js";
import { apresentar, RegistroMudouError, versaoDoEstado } from "../disponibilidade";
import {
  atendimentoDaSolicitacao,
  desfazerVinculoDaSolicitacao,
  origemDaOrdem,
  vincularSolicitacaoAOrdem,
} from "../../../modules/m11-licitacoes/compras-alocacao.js";
import { comEscritaAutenticada } from "../sessao";
import { cliente, PortaSemBancoError } from "../cliente";
import type { DetalheLido, OpcoesDoCadastro, PaginaDoMolde } from "./dados";

/**
 * ═══ OS DADOS DAS COMPRAS — M11, V4 §8 (Fila A) ═══
 *
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI. Autorizar duas vezes, anular o pendente, item sem material,
 * recebimento acima do pendente, estorno de ordem recebida ou empenhada — tudo é do domínio
 * (`modules/m11-licitacoes/compras.ts`), e a recusa sobe COMO VEIO.
 *
 * ⚠️ E NENHUM NÚMERO É DERIVADO POR CONTA PRÓPRIA: a situação vem de `situacaoDaSolicitacao`, as
 * estatísticas de `estatisticasDaPesquisa`, o saldo de `saldoDaOrdemDeCompra`. O total da ordem é a
 * única soma desta porta (Σ quantidade × unitário, exibição).
 */

export { PortaSemBancoError };

type Campos = Readonly<Record<string, string>>;
const t = (c: Campos, k: string): string => (c[k] ?? "").trim();
const dia = (c: Campos, k: string): Date => meioDiaCivil(t(c, k));
/** "3,5" → "3.5"; "1.234,56" → "1234.56"; sem vírgula, como veio. */
export function decimalDaTela(v: string): string {
  const s = v.trim();
  return s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
}

function paginacao(c: ConsultaDoMolde): { readonly skip: number; readonly take: number } {
  return { skip: (c.pagina - 1) * TAMANHO_DE_PAGINA, take: TAMANHO_DE_PAGINA };
}

function nomeDaPessoa(p: { readonly documento: string; readonly versoes: readonly { readonly nome: string }[] }): string {
  return `${p.versoes[0]?.nome ?? p.documento} (${formatarDocumento(p.documento)})`;
}

const ROTULO_DO_TIPO_DE_ORDEM: Readonly<Record<string, string>> = { ORDINARIA: "Ordinária", GLOBAL: "Global", ESTIMATIVA: "Estimativa" };

// ═══════════════════════════════════════════════════════════════════════════
// AS OPÇÕES DAS ILHAS — os setores (material, fornecedor, processo e ficha vêm pela busca: opcoes-referenciadas)
// ═══════════════════════════════════════════════════════════════════════════

export async function opcoesDaSolicitacao(): Promise<OpcoesDoCadastro> {
  const setores = await cliente().setor.findMany({ where: { ativo: true }, select: { id: true, codigo: true, nome: true }, orderBy: { codigo: "asc" } });
  return {
    setorId: setores.map((s) => ({ valor: s.id, rotulo: `${s.codigo} — ${s.nome}` })),
  };
}

export async function opcoesDaPesquisa(): Promise<OpcoesDoCadastro> {
  return {};
}

// ═══════════════════════════════════════════════════════════════════════════
// SOLICITAÇÃO DE COMPRA
// ═══════════════════════════════════════════════════════════════════════════

export async function listarSolicitacoes(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = (c.filtros["q"] ?? "").trim();
  const sit = c.filtros["situacao"] ?? "";
  const where: Prisma.SolicitacaoDeCompraWhereInput = q === "" ? {} : { OR: [{ numero: { contains: q, mode: "insensitive" } }, { solicitante: { contains: q, mode: "insensitive" } }] };
  const ordem: Prisma.SolicitacaoDeCompraOrderByWithRelationInput = c.ordem === "data" ? { data: c.direcao } : { numero: c.direcao };
  const [total, linhas] = await Promise.all([
    prisma.solicitacaoDeCompra.count({ where }),
    prisma.solicitacaoDeCompra.findMany({ where, orderBy: ordem, ...paginacao(c), select: { id: true, numero: true, data: true, solicitante: true, setor: { select: { codigo: true, nome: true } }, _count: { select: { itens: true } } } }),
  ]);
  const comSituacao = await Promise.all(linhas.map(async (s) => {
    const at = await atendimentoDaSolicitacao(prisma, s.id);
    const solicitado = at.reduce((a, i) => a.plus(i.solicitado), toMoney("0"));
    const pendente = at.reduce((a, i) => a.plus(i.pendente), toMoney("0"));
    const recebido = at.reduce((a, i) => a.plus(i.recebido), toMoney("0"));
    return { ...s, situacao: await situacaoDaSolicitacao(prisma, s.id), atendimento: `${recebido.toFixed(4)} recebido · ${pendente.toFixed(4)} pendente de ${solicitado.toFixed(4)}` };
  }));
  const filtradas = sit === "" ? comSituacao : comSituacao.filter((s) => s.situacao === sit);
  return {
    total: sit === "" ? total : filtradas.length,
    linhas: filtradas.map((s) => ({
      id: s.id,
      numero: s.numero,
      setor: `${s.setor.codigo} — ${s.setor.nome}`,
      data: diaCivilBr(s.data),
      solicitante: s.solicitante,
      itens: String(s._count.itens),
      atendimento: s.atendimento,
      situacao: s.situacao,
    })),
  };
}

/** O ATENDIMENTO da solicitação como a tela o lê — tudo string, tudo derivado (V6 P1.1). */
export interface ParcelaLida {
  readonly alocacaoId: string;
  readonly ordemId: string;
  readonly ordemNumero: string;
  readonly quantidade: string;
  readonly recebido: string;
  readonly situacao: "VIVA" | "DESFEITA" | "ORDEM_ESTORNADA";
  readonly motivo: string | null;
  readonly criadoPor: string;
  readonly criadoEm: string;
}
export interface ItemDoAtendimentoLido {
  readonly itemDeSolicitacaoId: string;
  readonly materialId: string;
  readonly rotulo: string;
  readonly solicitado: string;
  readonly ordenado: string;
  readonly recebido: string;
  readonly cancelado: string;
  readonly pendente: string;
  readonly parcelas: readonly ParcelaLida[];
}
export interface SolicitacaoLida extends DetalheLido {
  readonly situacao: "PENDENTE" | "AUTORIZADA" | "ANULADA";
  readonly atendimento: readonly ItemDoAtendimentoLido[];
  /** Os itens com pendente > 0 — o que a ilha "formar ordem" oferece. */
  readonly itensPendentes: readonly { readonly itemDeSolicitacaoId: string; readonly materialId: string; readonly rotulo: string; readonly pendente: string }[];
}

async function lerAtendimento(id: string): Promise<readonly ItemDoAtendimentoLido[]> {
  const at = await atendimentoDaSolicitacao(cliente(), id);
  return at.map((i) => ({
    itemDeSolicitacaoId: i.itemId,
    materialId: i.materialId,
    rotulo: `${i.materialCodigo} — ${i.materialDescricao}`,
    solicitado: i.solicitado.toFixed(4),
    ordenado: i.ordenado.toFixed(4),
    recebido: i.recebido.toFixed(4),
    cancelado: i.cancelado.toFixed(4),
    pendente: i.pendente.toFixed(4),
    parcelas: i.parcelas.map((p) => ({
      alocacaoId: p.alocacaoId, ordemId: p.ordemId, ordemNumero: p.ordemNumero, quantidade: p.quantidade.toFixed(4), recebido: p.recebido.toFixed(4),
      situacao: p.situacao, motivo: p.motivo, criadoPor: p.criadoPor, criadoEm: diaCivilBr(p.criadoEm),
    })),
  }));
}

export async function verSolicitacao(id: string): Promise<SolicitacaoLida | null> {
  const prisma = cliente();
  const s = await prisma.solicitacaoDeCompra.findUnique({
    where: { id },
    select: {
      numero: true, data: true, justificativa: true, solicitante: true, criadoEm: true, criadoPor: true,
      setor: { select: { codigo: true, nome: true } },
      processoDigital: { select: { id: true, numero: true } },
      itens: { orderBy: { criadoEm: "asc" }, select: { id: true, quantidade: true, criadoEm: true, criadoPor: true, material: { select: { codigo: true, descricaoSucinta: true } } } },
      movimentos: { orderBy: [{ data: "asc" }, { criadoEm: "asc" }], select: { id: true, tipo: true, data: true, motivo: true, criadoEm: true, criadoPor: true } },
    },
  });
  if (s === null) return null;
  const [situacao, atendimento] = await Promise.all([situacaoDaSolicitacao(prisma, id), lerAtendimento(id)]);
  const ROTULO_DO_MOVIMENTO: Record<string, string> = { AUTORIZACAO: "Autorização", ANULACAO: "Anulação", ORDEM_ESTORNADA: "Ordem estornada — parcelas de volta a pendente" };
  const historico: LinhaDoHistorico[] = [
    ...s.itens.map((i) => ({ id: i.id, oQue: `Item: ${i.material.codigo} — ${i.material.descricaoSucinta}`, quando: diaCivilBr(s.data), registradoEm: diaCivilBr(i.criadoEm), por: i.criadoPor, motivo: `Quantidade ${i.quantidade.toFixed(4)}` })),
    ...s.movimentos.map((m) => ({ id: m.id, oQue: ROTULO_DO_MOVIMENTO[m.tipo] ?? m.tipo, quando: diaCivilBr(m.data), registradoEm: diaCivilBr(m.criadoEm), por: m.criadoPor, motivo: m.motivo })),
    ...atendimento.flatMap((i) => i.parcelas.map((pa) => ({
      id: pa.alocacaoId,
      oQue: `${pa.situacao === "VIVA" ? "Parcela na ordem" : pa.situacao === "DESFEITA" ? "Parcela desfeita na ordem" : "Parcela em ordem estornada"} ${pa.ordemNumero} · ${i.rotulo}`,
      quando: pa.criadoEm, registradoEm: pa.criadoEm, por: pa.criadoPor,
      motivo: `${pa.quantidade} ordenado · ${pa.recebido} recebido${pa.motivo !== null ? ` · ${pa.motivo}` : ""}`,
      href: `/licitacoes/ordens-de-compra/${pa.ordemId}`, hrefRotulo: "Abrir ordem",
    }))),
  ];
  const totalSolicitado = atendimento.reduce((a, i) => a.plus(toMoney(i.solicitado)), toMoney("0"));
  const totalOrdenado = atendimento.reduce((a, i) => a.plus(toMoney(i.ordenado)), toMoney("0"));
  const totalRecebido = atendimento.reduce((a, i) => a.plus(toMoney(i.recebido)), toMoney("0"));
  const totalPendente = atendimento.reduce((a, i) => a.plus(toMoney(i.pendente)), toMoney("0"));
  return {
    titulo: `Solicitação ${s.numero}`,
    subtitulo: `${s.setor.codigo} — ${s.setor.nome} · ${s.solicitante}`,
    selos: [
      { texto: situacao, tom: situacao === "AUTORIZADA" ? "ok" : situacao === "ANULADA" ? "erro" : "alerta" },
      { texto: `${s.itens.length} item(ns)`, tom: "neutro" },
    ],
    dados: [
      { rotulo: "Número", valor: s.numero },
      { rotulo: "Setor", valor: `${s.setor.codigo} — ${s.setor.nome}` },
      { rotulo: "Data", valor: diaCivilBr(s.data), tipo: "data" },
      { rotulo: "Solicitante", valor: s.solicitante },
      { rotulo: "Justificativa", valor: s.justificativa, tipo: "longo" },
      { rotulo: "Situação", valor: situacao, nota: "Conforme o último registro de autorização ou anulação." },
      { rotulo: "Atendimento", valor: `${totalOrdenado.toFixed(4)} ordenado · ${totalRecebido.toFixed(4)} recebido · ${totalPendente.toFixed(4)} pendente de ${totalSolicitado.toFixed(4)}`, nota: "Quantidades incluídas em ordens de compra ativas e respectivos recebimentos. Quantidade em ordem de compra ainda não significa atendimento." },
      { rotulo: "Processo digital", valor: s.processoDigital === null ? "—" : String(s.processoDigital.numero) },
      { rotulo: "Cadastrada em", valor: diaCivilBr(s.criadoEm), tipo: "data" },
      { rotulo: "Cadastrada por", valor: s.criadoPor },
    ],
    historico,
    situacao,
    atendimento,
    itensPendentes: atendimento.filter((i) => toMoney(i.pendente).greaterThan(0)).map((i) => ({ itemDeSolicitacaoId: i.itemDeSolicitacaoId, materialId: i.materialId, rotulo: i.rotulo, pendente: i.pendente })),
  };
}

export interface LinhaParaFormarOrdem {
  readonly itemDeSolicitacaoId: string;
  readonly materialId: string;
  readonly quantidade: string;
  readonly valorUnitario: string;
}

/** FORMAR UMA ORDEM A PARTIR DA SOLICITAÇÃO — os itens da ordem nascem das linhas escolhidas e a origem vai na mesma transação. */
export async function formarOrdemDaSolicitacao(c: Campos, linhas: readonly LinhaParaFormarOrdem[]): Promise<{ readonly ordemId: string; readonly itens: number }> {
  return comEscritaAutenticada("EMITIR_ORDEM_DE_COMPRA", async (criadoPor) => {
    const r = await emitirOrdemDeCompra(cliente(), {
      numero: t(c, "numero"),
      tipo: t(c, "tipo") as "ORDINARIA" | "GLOBAL" | "ESTIMATIVA",
      ...(t(c, "processoId") !== "" ? { processoId: t(c, "processoId") } : {}),
      fornecedorId: t(c, "fornecedorId"),
      dataEmissao: dia(c, "dataEmissao"),
      ...(t(c, "dataVencimento") !== "" ? { dataVencimento: dia(c, "dataVencimento") } : {}),
      finalidade: t(c, "finalidade"),
      ...(t(c, "fichaId") !== "" ? { fichaId: t(c, "fichaId") } : {}),
      consumoImediato: t(c, "consumoImediato") === "on" || t(c, "consumoImediato") === "1",
      itens: linhas.map((l) => ({ materialId: l.materialId, quantidade: decimalDaTela(l.quantidade), valorUnitario: decimalDaTela(l.valorUnitario) })),
      origem: linhas.map((l, i) => ({ itemIndex: i, itemDeSolicitacaoId: l.itemDeSolicitacaoId, quantidade: decimalDaTela(l.quantidade) })),
      criadoPor,
    });
    return { ordemId: r.ordemId, itens: linhas.length };
  });
}

export interface LinhaParaVincular {
  readonly itemDeSolicitacaoId: string;
  readonly itemDeOrdemId: string;
  readonly quantidade: string;
}

/** VINCULAR parcelas de solicitações autorizadas a uma ordem já emitida. */
export async function vincularNaOrdem(ordemId: string, linhas: readonly LinhaParaVincular[]): Promise<{ readonly parcelas: number; readonly quantidade: string }> {
  return comEscritaAutenticada("EMITIR_ORDEM_DE_COMPRA", async (criadoPor) => {
    const r = await vincularSolicitacaoAOrdem(cliente(), { ordemId, alocacoes: linhas.map((l) => ({ ...l, quantidade: decimalDaTela(l.quantidade) })), criadoPor });
    return { parcelas: r.alocacoes, quantidade: r.quantidade.toFixed(4) };
  });
}

/** DESFAZER uma parcela — linha nova de estorno. */
export async function desfazerVinculo(alocacaoId: string, motivo: string): Promise<void> {
  await comEscritaAutenticada("ESTORNAR_ORDEM_DE_COMPRA", (criadoPor) => desfazerVinculoDaSolicitacao(cliente(), { alocacaoId, motivo, criadoPor }));
}

export interface SolicitacaoParaVincular {
  readonly id: string;
  readonly numero: string;
  readonly rotulo: string;
  readonly itens: readonly { readonly itemDeSolicitacaoId: string; readonly materialId: string; readonly rotulo: string; readonly pendente: string }[];
}

/**
 * AS SOLICITAÇÕES AUTORIZADAS COM PENDENTE do MESMO material de algum item desta ordem — o que a
 * ilha "vincular" oferece. Recorte de 100 solicitações mais recentes; nada é casado sozinho.
 */
export async function solicitacoesParaVincular(ordemId: string): Promise<readonly SolicitacaoParaVincular[]> {
  const prisma = cliente();
  const materiaisDaOrdem = new Set((await prisma.itemDeOrdemDeCompra.findMany({ where: { ordemId }, select: { materialId: true } })).map((i) => i.materialId));
  if (materiaisDaOrdem.size === 0) return [];
  const candidatas = await prisma.solicitacaoDeCompra.findMany({
    where: { itens: { some: { materialId: { in: [...materiaisDaOrdem] } } }, movimentos: { some: { tipo: "AUTORIZACAO" } } },
    orderBy: { data: "desc" },
    take: 100,
    select: { id: true, numero: true, solicitante: true, setor: { select: { codigo: true } } },
  });
  const saida: SolicitacaoParaVincular[] = [];
  for (const s of candidatas) {
    if ((await situacaoDaSolicitacao(prisma, s.id)) !== "AUTORIZADA") continue;
    const itens = (await atendimentoDaSolicitacao(prisma, s.id))
      .filter((i) => materiaisDaOrdem.has(i.materialId) && i.pendente.greaterThan(0))
      .map((i) => ({ itemDeSolicitacaoId: i.itemId, materialId: i.materialId, rotulo: `${i.materialCodigo} — ${i.materialDescricao}`, pendente: i.pendente.toFixed(4) }));
    if (itens.length === 0) continue;
    saida.push({ id: s.id, numero: s.numero, rotulo: `${s.numero} · ${s.setor.codigo} · ${s.solicitante}`, itens });
  }
  return saida;
}

export interface ItemDaSolicitacaoLido {
  readonly materialId: string;
  readonly quantidade: string;
}

export async function criarSolicitacao(c: Campos, itens: readonly ItemDaSolicitacaoLido[]): Promise<string> {
  return comEscritaAutenticada("REGISTRAR_SOLICITACAO_DE_COMPRA", async (criadoPor) => {
    const r = await registrarSolicitacaoDeCompra(cliente(), {
      numero: t(c, "numero"),
      setorId: t(c, "setorId"),
      data: dia(c, "data"),
      justificativa: t(c, "justificativa"),
      solicitante: t(c, "solicitante"),
      itens: itens.map((i) => ({ materialId: i.materialId, quantidade: decimalDaTela(i.quantidade) })),
      criadoPor,
    });
    return r.solicitacaoId;
  });
}

export async function acaoDaSolicitacao(acao: string, solicitacaoId: string, c: Campos): Promise<void> {
  if (acao !== "autorizar" && acao !== "anular") throw new Error(`Ação "${acao}" não existe neste cadastro. Nada foi gravado.`);
  await comEscritaAutenticada("MOVIMENTAR_SOLICITACAO_DE_COMPRA", (criadoPor) =>
    movimentarSolicitacaoDeCompra(cliente(), { solicitacaoId, tipo: acao === "autorizar" ? "AUTORIZACAO" : "ANULACAO", data: dia(c, "data"), motivo: t(c, "motivo"), criadoPor })
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PESQUISA DE PREÇOS
// ═══════════════════════════════════════════════════════════════════════════

export async function listarPesquisas(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = (c.filtros["q"] ?? "").trim();
  const where: Prisma.PesquisaDePrecosWhereInput = q === "" ? {} : { OR: [{ numero: { contains: q, mode: "insensitive" } }, { objeto: { contains: q, mode: "insensitive" } }] };
  const ordem: Prisma.PesquisaDePrecosOrderByWithRelationInput = c.ordem === "data" ? { data: c.direcao } : { numero: c.direcao };
  const [total, linhas] = await Promise.all([
    prisma.pesquisaDePrecos.count({ where }),
    prisma.pesquisaDePrecos.findMany({ where, orderBy: ordem, ...paginacao(c), select: { id: true, numero: true, objeto: true, data: true, itens: { select: { _count: { select: { cotacoes: true } } } } } }),
  ]);
  return {
    total,
    linhas: linhas.map((p) => ({
      id: p.id,
      numero: p.numero,
      objeto: p.objeto.length > 80 ? `${p.objeto.slice(0, 77)}…` : p.objeto,
      data: diaCivilBr(p.data),
      itens: String(p.itens.length),
      cotacoes: String(p.itens.reduce((s, i) => s + i._count.cotacoes, 0)),
    })),
  };
}

export async function verPesquisa(id: string): Promise<DetalheLido | null> {
  const prisma = cliente();
  const p = await prisma.pesquisaDePrecos.findUnique({
    where: { id },
    select: {
      numero: true, objeto: true, data: true, criadoEm: true, criadoPor: true,
      itens: {
        orderBy: { criadoEm: "asc" },
        select: {
          id: true, materialId: true, quantidade: true, criadoEm: true, criadoPor: true,
          material: { select: { codigo: true, descricaoSucinta: true } },
          cotacoes: { orderBy: { criadoEm: "asc" }, select: { id: true, valorUnitario: true, origem: true, criadoEm: true, criadoPor: true, fornecedor: { select: { documento: true, versoes: { select: { nome: true }, orderBy: { criadoEm: "desc" }, take: 1 } } } } },
        },
      },
    },
  });
  if (p === null) return null;
  const estatisticas = await estatisticasDaPesquisa(prisma, id);
  const porMaterial = new Map(estatisticas.map((e) => [e.materialId, e]));
  const totalPeloMedio = p.itens.reduce((s, i) => {
    const e = porMaterial.get(i.materialId);
    return e === undefined ? s : s.plus(e.medio.times(i.quantidade.toFixed(4)));
  }, toMoney("0"));
  const historico: LinhaDoHistorico[] = p.itens.flatMap((i) => {
    const e = porMaterial.get(i.materialId);
    return [
      {
        id: i.id,
        oQue: `Item: ${i.material.codigo} — ${i.material.descricaoSucinta} · ${i.quantidade.toFixed(4)}`,
        quando: diaCivilBr(p.data),
        registradoEm: diaCivilBr(i.criadoEm),
        por: i.criadoPor,
        motivo: e === undefined || e.cotacoes === 0 ? "Sem cotação: média, mínimo e máximo indisponíveis." : `${e.cotacoes} cotação(ões) · mínimo ${e.minimo.toFixed(6)} · médio ${e.medio.toFixed(6)} · máximo ${e.maximo.toFixed(6)}`,
      },
      ...i.cotacoes.map((q) => ({
        id: q.id,
        oQue: `Cotação de ${nomeDaPessoa(q.fornecedor)} para ${i.material.codigo}`,
        quando: diaCivilBr(q.criadoEm),
        registradoEm: diaCivilBr(q.criadoEm),
        por: q.criadoPor,
        motivo: `Unitário ${q.valorUnitario.toFixed(6)} · origem: ${q.origem}`,
      })),
    ];
  });
  return {
    titulo: `Pesquisa de preços ${p.numero}`,
    subtitulo: p.objeto,
    selos: [{ texto: `${p.itens.length} item(ns)`, tom: "neutro" }, { texto: `${p.itens.reduce((s, i) => s + i.cotacoes.length, 0)} cotação(ões)`, tom: "neutro" }],
    dados: [
      { rotulo: "Número", valor: p.numero },
      { rotulo: "Objeto", valor: p.objeto, tipo: "longo" },
      { rotulo: "Data", valor: diaCivilBr(p.data), tipo: "data" },
      { rotulo: "Estimativa pelo preço médio", valor: totalPeloMedio.toFixed(2), tipo: "dinheiro", nota: "Soma de quantidade × preço médio das cotações de cada item." },
      { rotulo: "Cadastrada em", valor: diaCivilBr(p.criadoEm), tipo: "data" },
      { rotulo: "Cadastrada por", valor: p.criadoPor },
    ],
    historico,
  };
}

export interface ItemDaPesquisaLido {
  readonly materialId: string;
  readonly quantidade: string;
  readonly cotacoes: readonly { readonly fornecedorId: string; readonly valorUnitario: string; readonly origem: string }[];
}

export async function criarPesquisa(c: Campos, itens: readonly ItemDaPesquisaLido[]): Promise<string> {
  return comEscritaAutenticada("REGISTRAR_PESQUISA_DE_PRECOS", async (criadoPor) => {
    const r = await registrarPesquisaDePrecos(cliente(), {
      numero: t(c, "numero"),
      objeto: t(c, "objeto"),
      data: dia(c, "data"),
      itens: itens.map((i) => ({
        materialId: i.materialId,
        quantidade: decimalDaTela(i.quantidade),
        cotacoes: i.cotacoes.map((q) => ({ fornecedorId: q.fornecedorId, valorUnitario: decimalDaTela(q.valorUnitario), origem: q.origem })),
      })),
      criadoPor,
    });
    return r.pesquisaId;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ORDEM DE COMPRA
// ═══════════════════════════════════════════════════════════════════════════

function totalDaOrdem(itens: readonly { readonly quantidade: { toFixed(n: number): string }; readonly valorUnitario: { toFixed(n: number): string } }[]): string {
  return itens.reduce((s, i) => s.plus(toMoney(i.valorUnitario.toFixed(6)).times(i.quantidade.toFixed(4))), toMoney("0")).toFixed(2);
}

export async function listarOrdens(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = (c.filtros["q"] ?? "").trim();
  const tipo = c.filtros["tipo"] ?? "";
  const vivas = c.filtros["vivas"] ?? "";
  const where: Prisma.OrdemDeCompraWhereInput = {};
  if (q !== "") where.OR = [{ numero: { contains: q, mode: "insensitive" } }, { fornecedor: { versoes: { some: { nome: { contains: q, mode: "insensitive" } } } } }];
  if (tipo === "ORDINARIA" || tipo === "GLOBAL" || tipo === "ESTIMATIVA") where.tipo = tipo;
  // V6 P1.1: o estorno é fato — "vivas" exclui as estornadas; "estornadas" mostra só elas.
  if (vivas === "VIVAS") where.movimentos = { none: { tipo: "ESTORNO" } };
  if (vivas === "ESTORNADAS") where.movimentos = { some: { tipo: "ESTORNO" } };
  const ordem: Prisma.OrdemDeCompraOrderByWithRelationInput = c.ordem === "dataEmissao" ? { dataEmissao: c.direcao } : { numero: c.direcao };
  const [total, linhas] = await Promise.all([
    prisma.ordemDeCompra.count({ where }),
    prisma.ordemDeCompra.findMany({
      where, orderBy: ordem, ...paginacao(c),
      select: {
        id: true, numero: true, tipo: true, dataEmissao: true,
        fornecedor: { select: { documento: true, versoes: { select: { nome: true }, orderBy: { criadoEm: "desc" }, take: 1 } } },
        itens: { select: { quantidade: true, valorUnitario: true, origens: { where: { estornoDeId: null, estorno: null }, select: { itemDeSolicitacao: { select: { solicitacao: { select: { numero: true } } } } } } } },
        movimentos: { where: { tipo: "ESTORNO" }, select: { id: true } },
        _count: { select: { recebimentos: true } },
      },
    }),
  ]);
  const comSaldo = await Promise.all(
    linhas.map(async (o) => {
      const saldos = await saldoDaOrdemDeCompra(prisma, o.id);
      const pendente = saldos.reduce((s, x) => s.plus(x.valorPendente), toMoney("0"));
      return { ...o, pendente };
    })
  );
  return {
    total,
    linhas: comSaldo.map((o) => ({
      id: o.id,
      numero: o.numero,
      tipo: ROTULO_DO_TIPO_DE_ORDEM[o.tipo] ?? o.tipo,
      fornecedor: nomeDaPessoa(o.fornecedor),
      dataEmissao: diaCivilBr(o.dataEmissao),
      total: totalDaOrdem(o.itens),
      pendente: o.movimentos.length > 0 ? "0.00" : o.pendente.toFixed(2),
      origem: [...new Set(o.itens.flatMap((i) => i.origens.map((a) => a.itemDeSolicitacao.solicitacao.numero)))].join(", ") || "—",
      situacao: o.movimentos.length > 0 ? "ESTORNADA" : o.pendente.greaterThan(0) ? (o._count.recebimentos > 0 ? "RECEBIDA EM PARTE" : "A RECEBER") : "RECEBIDA",
    })),
  };
}

export interface ItemDaOrdemParaReceber {
  readonly id: string;
  readonly rotulo: string;
  readonly pendente: string;
}

export interface ParcelaDeOrigemLida {
  readonly alocacaoId: string;
  readonly solicitacaoId: string;
  readonly solicitacaoNumero: string;
  readonly setor: string;
  readonly solicitante: string;
  readonly quantidade: string;
  readonly recebido: string;
  readonly situacao: "VIVA" | "DESFEITA";
}
export interface ItemDeOrigemLido {
  readonly itemDeOrdemId: string;
  readonly rotulo: string;
  readonly quantidade: string;
  readonly parcelas: readonly ParcelaDeOrigemLida[];
  readonly semOrigem: string;
}
export interface OrdemLida extends DetalheLido {
  readonly itensParaReceber: readonly ItemDaOrdemParaReceber[];
  readonly estornada: boolean;
  readonly origem: readonly ItemDeOrigemLido[];
  /** Os itens da ordem com o que ainda pode ser atribuído a solicitações (quantidade − Σ parcelas vivas). */
  readonly itensParaVincular: readonly { readonly itemDeOrdemId: string; readonly materialId: string; readonly rotulo: string; readonly disponivel: string }[];
}

export async function verOrdem(id: string): Promise<OrdemLida | null> {
  const prisma = cliente();
  const o = await prisma.ordemDeCompra.findUnique({
    where: { id },
    select: {
      numero: true, tipo: true, dataEmissao: true, dataVencimento: true, finalidade: true, consumoImediato: true, desconto: true, criadoEm: true, criadoPor: true,
      fornecedor: { select: { documento: true, versoes: { select: { nome: true }, orderBy: { criadoEm: "desc" }, take: 1 } } },
      processo: { select: { numeroProcesso: true } },
      ficha: { select: { exercicio: true, numero: true } },
      itens: { orderBy: { criadoEm: "asc" }, select: { id: true, materialId: true, quantidade: true, valorUnitario: true, criadoEm: true, criadoPor: true, material: { select: { codigo: true, descricaoSucinta: true } } } },
      recebimentos: { orderBy: [{ data: "asc" }, { criadoEm: "asc" }], select: { id: true, data: true, notaFiscal: true, responsavelRecebimento: true, criadoEm: true, criadoPor: true, itens: { select: { quantidade: true, itemDeOrdem: { select: { material: { select: { codigo: true } } } } } } } },
      empenhos: { where: { estornoDeId: null, anulacaoParcialDeId: null }, select: { id: true, numero: true, valor: true, data: true, criadoEm: true, criadoPor: true } },
      documentosFiscais: { select: { id: true, numero: true, serie: true, dataRecebimento: true, criadoEm: true, criadoPor: true } },
      movimentos: { orderBy: { criadoEm: "asc" }, select: { id: true, tipo: true, data: true, motivo: true, criadoEm: true, criadoPor: true } },
    },
  });
  if (o === null) return null;
  const estornada = await ordemEstornada(prisma, id);
  const origemBruta = await origemDaOrdem(prisma, id);
  const origem: ItemDeOrigemLido[] = origemBruta.map((i) => ({
    itemDeOrdemId: i.itemId, rotulo: `${i.materialCodigo} — ${i.materialDescricao}`, quantidade: i.quantidade.toFixed(4), semOrigem: i.semOrigem.toFixed(4),
    parcelas: i.parcelas.map((p) => ({ alocacaoId: p.alocacaoId, solicitacaoId: p.solicitacaoId, solicitacaoNumero: p.solicitacaoNumero, setor: p.setor, solicitante: p.solicitante, quantidade: p.quantidade.toFixed(4), recebido: p.recebido.toFixed(4), situacao: p.situacao })),
  }));
  const saldos = await saldoDaOrdemDeCompra(prisma, id);
  const saldoDoItem = new Map(saldos.map((s) => [s.itemId, s]));
  const pendente = saldos.reduce((s, x) => s.plus(x.valorPendente), toMoney("0"));
  const total = totalDaOrdem(o.itens);
  const historico: LinhaDoHistorico[] = [
    ...o.itens.map((i) => {
      const s = saldoDoItem.get(i.id);
      return {
        id: i.id,
        oQue: `Item: ${i.material.codigo} — ${i.material.descricaoSucinta}`,
        quando: diaCivilBr(o.dataEmissao),
        registradoEm: diaCivilBr(i.criadoEm),
        por: i.criadoPor,
        motivo: `${i.quantidade.toFixed(4)} × ${i.valorUnitario.toFixed(6)} · recebido ${s?.recebida.toFixed(4) ?? "0.0000"} · pendente ${s?.pendente.toFixed(4) ?? i.quantidade.toFixed(4)}`,
        valor: toMoney(i.valorUnitario.toFixed(6)).times(i.quantidade.toFixed(4)).toFixed(2),
      };
    }),
    ...o.recebimentos.map((r) => ({
      id: r.id,
      oQue: `Recebimento${r.notaFiscal === null ? "" : ` — nota ${r.notaFiscal}`} · ${r.responsavelRecebimento}`,
      quando: diaCivilBr(r.data),
      registradoEm: diaCivilBr(r.criadoEm),
      por: r.criadoPor,
      motivo: r.itens.map((x) => `${x.itemDeOrdem.material.codigo}: ${x.quantidade.toFixed(4)}`).join(" · "),
    })),
    ...o.empenhos.map((e) => ({
      id: e.id,
      oQue: `Empenho ${e.numero}`,
      quando: diaCivilBr(e.data),
      registradoEm: diaCivilBr(e.criadoEm),
      por: e.criadoPor,
      motivo: "Empenho vinculado a esta ordem",
      valor: e.valor.toFixed(2),
      href: `/despesa/empenhos/${e.id}`,
      hrefRotulo: "Abrir empenho",
    })),
    ...o.documentosFiscais.map((d) => ({
      id: d.id,
      oQue: `Documento fiscal ${d.numero}/${d.serie}`,
      quando: diaCivilBr(d.dataRecebimento),
      registradoEm: diaCivilBr(d.criadoEm),
      por: d.criadoPor,
      motivo: "Documento recebido vinculado a esta ordem",
      href: `/licitacoes/documentos-fiscais/${d.id}`,
      hrefRotulo: "Abrir documento",
    })),
    ...o.movimentos.map((m) => ({
      id: m.id,
      oQue: m.tipo === "ESTORNO" ? "Estorno da ordem" : m.tipo,
      quando: diaCivilBr(m.data),
      registradoEm: diaCivilBr(m.criadoEm),
      por: m.criadoPor,
      motivo: m.motivo,
    })),
    ...origem.flatMap((i) => i.parcelas.map((pa) => ({
      id: pa.alocacaoId,
      oQue: `${pa.situacao === "VIVA" ? "Origem" : "Origem desfeita"}: solicitação ${pa.solicitacaoNumero} · ${i.rotulo}`,
      quando: diaCivilBr(o.dataEmissao),
      registradoEm: diaCivilBr(o.dataEmissao),
      por: o.criadoPor,
      motivo: `${pa.quantidade} desta linha · ${pa.recebido} recebido atribuído · ${pa.setor} · ${pa.solicitante}`,
      href: `/licitacoes/solicitacoes/${pa.solicitacaoId}`,
      hrefRotulo: "Abrir solicitação",
    }))),
  ];
  return {
    titulo: `Ordem de compra ${o.numero}`,
    subtitulo: `${ROTULO_DO_TIPO_DE_ORDEM[o.tipo] ?? o.tipo} · ${nomeDaPessoa(o.fornecedor)}`,
    selos: [
      estornada
        ? { texto: "ESTORNADA", tom: "erro" }
        : { texto: pendente.greaterThan(0) ? (o.recebimentos.length > 0 ? "RECEBIDA EM PARTE" : "A RECEBER") : "RECEBIDA", tom: pendente.greaterThan(0) ? "alerta" : "ok" },
      { texto: `${o.itens.length} item(ns)`, tom: "neutro" },
      { texto: `${o.recebimentos.length} recebimento(s)`, tom: "neutro" },
      { texto: origem.some((i) => i.parcelas.some((pa) => pa.situacao === "VIVA")) ? `origem: ${[...new Set(origem.flatMap((i) => i.parcelas.filter((pa) => pa.situacao === "VIVA").map((pa) => pa.solicitacaoNumero)))].join(", ")}` : "sem origem (compra direta ou legado)", tom: "neutro" },
    ],
    dados: [
      { rotulo: "Número", valor: o.numero },
      { rotulo: "Tipo", valor: ROTULO_DO_TIPO_DE_ORDEM[o.tipo] ?? o.tipo },
      { rotulo: "Fornecedor", valor: nomeDaPessoa(o.fornecedor) },
      { rotulo: "Processo licitatório", valor: o.processo === null ? "— (dispensa ou sem processo)" : o.processo.numeroProcesso },
      { rotulo: "Recurso orçamentário", valor: o.ficha === null ? "—" : `${o.ficha.exercicio} · ficha ${o.ficha.numero}` },
      { rotulo: "Emissão", valor: diaCivilBr(o.dataEmissao), tipo: "data" },
      { rotulo: "Vencimento", valor: o.dataVencimento === null ? "—" : diaCivilBr(o.dataVencimento), tipo: "data" },
      { rotulo: "Finalidade", valor: o.finalidade, tipo: "longo" },
      { rotulo: "Consumo imediato", valor: o.consumoImediato ? "Sim" : "Não" },
      { rotulo: "Desconto", valor: o.desconto === null ? "0.00" : o.desconto.toFixed(2), tipo: "dinheiro" },
      { rotulo: "Total dos itens", valor: total, tipo: "dinheiro" },
      { rotulo: "A receber (valor)", valor: pendente.toFixed(2), tipo: "dinheiro", nota: "Soma, por item, da quantidade pendente × valor unitário." },
      { rotulo: "Emitida em", valor: diaCivilBr(o.criadoEm), tipo: "data" },
      { rotulo: "Emitida por", valor: o.criadoPor },
      ...(estornada ? [{ rotulo: "Situação", valor: "ESTORNADA", nota: "A ordem estornada permanece no histórico e não pode receber, ser empenhada nem vincular solicitações." }] : []),
    ],
    historico,
    estornada,
    origem,
    itensParaReceber: estornada ? [] : o.itens
      .map((i) => ({ id: i.id, rotulo: `${i.material.codigo} — ${i.material.descricaoSucinta}`, pendente: saldoDoItem.get(i.id)?.pendente.toFixed(4) ?? i.quantidade.toFixed(4) }))
      .filter((i) => toMoney(i.pendente).greaterThan(0)),
    itensParaVincular: estornada ? [] : o.itens
      .map((i) => {
        const vivas = origem.find((x) => x.itemDeOrdemId === i.id);
        return { itemDeOrdemId: i.id, materialId: i.materialId, rotulo: `${i.material.codigo} — ${i.material.descricaoSucinta}`, disponivel: vivas?.semOrigem ?? i.quantidade.toFixed(4) };
      })
      .filter((i) => toMoney(i.disponivel).greaterThan(0)),
  };
}

export interface ItemDaOrdemLido {
  readonly materialId: string;
  readonly quantidade: string;
  readonly valorUnitario: string;
}

export async function criarOrdem(c: Campos, itens: readonly ItemDaOrdemLido[]): Promise<string> {
  return comEscritaAutenticada("EMITIR_ORDEM_DE_COMPRA", async (criadoPor) => {
    const r = await emitirOrdemDeCompra(cliente(), {
      numero: t(c, "numero"),
      tipo: t(c, "tipo") as "ORDINARIA" | "GLOBAL" | "ESTIMATIVA",
      ...(t(c, "processoId") !== "" ? { processoId: t(c, "processoId") } : {}),
      fornecedorId: t(c, "fornecedorId"),
      dataEmissao: dia(c, "dataEmissao"),
      ...(t(c, "dataVencimento") !== "" ? { dataVencimento: dia(c, "dataVencimento") } : {}),
      finalidade: t(c, "finalidade"),
      ...(t(c, "fichaId") !== "" ? { fichaId: t(c, "fichaId") } : {}),
      consumoImediato: t(c, "consumoImediato") === "on" || t(c, "consumoImediato") === "true" || t(c, "consumoImediato") === "1",
      ...(t(c, "desconto") !== "" ? { desconto: decimalDaTela(t(c, "desconto")) } : {}),
      itens: itens.map((i) => ({ materialId: i.materialId, quantidade: decimalDaTela(i.quantidade), valorUnitario: decimalDaTela(i.valorUnitario) })),
      criadoPor,
    });
    return r.ordemId;
  });
}

export interface ItemRecebidoLido {
  readonly itemDeOrdemId: string;
  readonly quantidade: string;
}

export async function receberOrdem(ordemId: string, c: Campos, itens: readonly ItemRecebidoLido[]): Promise<{ readonly itens: number; readonly pendenteValor: string }> {
  await comEscritaAutenticada("REGISTRAR_RECEBIMENTO_DE_ORDEM", (criadoPor) =>
    registrarRecebimentoDeOrdem(cliente(), {
      ordemId,
      data: dia(c, "data"),
      ...(t(c, "notaFiscal") !== "" ? { notaFiscal: t(c, "notaFiscal") } : {}),
      ...(t(c, "documentoFiscalId") !== "" ? { documentoFiscalId: t(c, "documentoFiscalId") } : {}),
      responsavelRecebimento: t(c, "responsavelRecebimento"),
      itens: itens.map((i) => ({ itemDeOrdemId: i.itemDeOrdemId, quantidade: decimalDaTela(i.quantidade) })),
      criadoPor,
    })
  );
  const saldos = await saldoDaOrdemDeCompra(cliente(), ordemId);
  const pendente = saldos.reduce((s, x) => s.plus(x.valorPendente), toMoney("0"));
  return { itens: itens.length, pendenteValor: pendente.toFixed(2) };
}

async function estadoDosAtosDaOrdem(ordemId: string): Promise<{ readonly estado: EstadoDaOrdemParaAtos; readonly versao: string } | null> {
  const prisma = cliente();
  const o = await prisma.ordemDeCompra.findUnique({
    where: { id: ordemId },
    select: {
      numero: true,
      recebimentos: { select: { id: true } },
      movimentos: { select: { id: true } },
      empenhos: { select: { id: true, numero: true, estornoDeId: true, anulacaoParcialDeId: true, estornos: { select: { id: true } } } },
    },
  });
  if (o === null) return null;
  const [estornada, saldos] = await Promise.all([ordemEstornada(prisma, ordemId), saldoDaOrdemDeCompra(prisma, ordemId)]);
  const estado: EstadoDaOrdemParaAtos = {
    numero: o.numero,
    estornada,
    recebimentos: o.recebimentos.length,
    empenhosVivos: o.empenhos.filter((e) => e.estornoDeId === null && e.anulacaoParcialDeId === null && e.estornos.length === 0).map((e) => e.numero),
    itensPendentes: saldos.filter((x) => x.pendente.greaterThan(0)).length,
  };
  return { estado, versao: versaoDoEstado([o.movimentos.map((m) => m.id).sort(), o.recebimentos.map((r) => r.id).sort(), o.empenhos.map((e) => [e.id, e.estornos.length])]) };
}

/**
 * V6.2 U0 — estornar (barra do molde), receber (ilha) e empenhar (atalho) projetados do predicado do
 * domínio. Receber e empenhar não são ações do molde, mas a página lê a MESMA projeção em vez de
 * repetir `estornada ? … : …` à mão.
 */
export async function disponibilidadeDaOrdem(ordemId: string): Promise<DisponibilidadeDoRegistro | null> {
  const lido = await estadoDosAtosDaOrdem(ordemId);
  if (lido === null) return null;
  return {
    versao: lido.versao,
    porAcao: {
      estornar: apresentar(elegibilidadeParaEstornarOrdem(lido.estado)),
      receber: apresentar(elegibilidadeParaReceberOrdem(lido.estado)),
      empenhar: apresentar(elegibilidadeParaEmpenharOrdem(lido.estado)),
    },
  };
}

export async function acaoDaOrdem(acao: string, ordemId: string, c: Campos): Promise<void> {
  if (acao !== "estornar") throw new Error(`Ação "${acao}" não existe neste cadastro. Nada foi gravado.`);
  const versaoDoFormulario = (c["__versao"] ?? "").trim();
  if (versaoDoFormulario !== "") {
    const atual = await estadoDosAtosDaOrdem(ordemId);
    if (atual !== null && atual.versao !== versaoDoFormulario) throw new RegistroMudouError("Esta ordem de compra");
  }
  await comEscritaAutenticada("ESTORNAR_ORDEM_DE_COMPRA", (criadoPor) => estornarOrdemDeCompra(cliente(), { ordemId, motivo: t(c, "motivo"), criadoPor }));
}
