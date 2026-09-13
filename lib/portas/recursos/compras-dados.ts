import { diaCivilBr, meioDiaCivil } from "../../../packages/datas/index.js";
import { toMoney } from "../../../packages/contracts/index.js";
import { formatarDocumento } from "../../../packages/documento/index.js";
import type { Prisma } from "../../../prisma/generated/client/client.js";
import {
  emitirOrdemDeCompra,
  estatisticasDaPesquisa,
  estornarOrdemDeCompra,
  movimentarSolicitacaoDeCompra,
  registrarPesquisaDePrecos,
  registrarRecebimentoDeOrdem,
  registrarSolicitacaoDeCompra,
  saldoDaOrdemDeCompra,
  situacaoDaSolicitacao,
} from "../../../modules/m11-licitacoes/compras.js";
import type { ConsultaDoMolde } from "../../molde/consulta.js";
import { TAMANHO_DE_PAGINA } from "../../molde/consulta.js";
import type { LinhaDoHistorico } from "../../molde/tipos.js";
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
// AS OPÇÕES DAS ILHAS — materiais, fornecedores, setores, processos, fichas
// ═══════════════════════════════════════════════════════════════════════════

export interface OpcaoDaIlha {
  readonly id: string;
  readonly rotulo: string;
}

export async function materiaisAtivos(): Promise<readonly OpcaoDaIlha[]> {
  const xs = await cliente().material.findMany({ where: { ativo: true }, select: { id: true, codigo: true, descricaoSucinta: true }, orderBy: { codigo: "asc" }, take: 500 });
  return xs.map((m) => ({ id: m.id, rotulo: `${m.codigo} — ${m.descricaoSucinta}` }));
}

export async function fornecedores(): Promise<readonly OpcaoDaIlha[]> {
  const xs = await cliente().pessoa.findMany({
    select: { id: true, documento: true, versoes: { select: { nome: true }, orderBy: { criadoEm: "desc" }, take: 1 } },
    orderBy: { documento: "asc" },
    take: 500,
  });
  return xs.map((p) => ({ id: p.id, rotulo: nomeDaPessoa(p) }));
}

export async function opcoesDaSolicitacao(): Promise<OpcoesDoCadastro> {
  const setores = await cliente().setor.findMany({ where: { ativo: true }, select: { id: true, codigo: true, nome: true }, orderBy: { codigo: "asc" } });
  return {
    setorId: setores.map((s) => ({ valor: s.id, rotulo: `${s.codigo} — ${s.nome}` })),
  };
}

export async function opcoesDaPesquisa(): Promise<OpcoesDoCadastro> {
  return {};
}

export async function opcoesDaOrdem(): Promise<OpcoesDoCadastro> {
  const prisma = cliente();
  const [pessoas, processos, fichas] = await Promise.all([
    fornecedores(),
    prisma.processoLicitatorio.findMany({ select: { id: true, numeroProcesso: true, objeto: true }, orderBy: { numeroProcesso: "desc" }, take: 300 }),
    prisma.fichaOrcamentaria.findMany({
      orderBy: [{ exercicio: "desc" }, { numero: "asc" }],
      take: 500,
      select: { id: true, exercicio: true, numero: true, saldoDisponivel: true, unidadeOrc: { select: { codigo: true } }, naturezaDespesa: { select: { codigoCompleto: true } }, fonte: { select: { codigo: true } } },
    }),
  ]);
  return {
    fornecedorId: pessoas.map((p) => ({ valor: p.id, rotulo: p.rotulo })),
    processoId: processos.map((p) => ({ valor: p.id, rotulo: `${p.numeroProcesso} — ${p.objeto.slice(0, 60)}` })),
    fichaId: fichas.map((f) => ({ valor: f.id, rotulo: `${f.exercicio} · ficha ${f.numero} · UO ${f.unidadeOrc.codigo} · ${f.naturezaDespesa.codigoCompleto} · fonte ${f.fonte.codigo} · saldo ${f.saldoDisponivel.toFixed(2)}` })),
  };
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
  const comSituacao = await Promise.all(linhas.map(async (s) => ({ ...s, situacao: await situacaoDaSolicitacao(prisma, s.id) })));
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
      situacao: s.situacao,
    })),
  };
}

export async function verSolicitacao(id: string): Promise<DetalheLido | null> {
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
  const situacao = await situacaoDaSolicitacao(prisma, id);
  const historico: LinhaDoHistorico[] = [
    ...s.itens.map((i) => ({ id: i.id, oQue: `Item: ${i.material.codigo} — ${i.material.descricaoSucinta}`, quando: diaCivilBr(s.data), registradoEm: diaCivilBr(i.criadoEm), por: i.criadoPor, motivo: `Quantidade ${i.quantidade.toFixed(4)}` })),
    ...s.movimentos.map((m) => ({ id: m.id, oQue: m.tipo === "AUTORIZACAO" ? "Autorização" : "Anulação", quando: diaCivilBr(m.data), registradoEm: diaCivilBr(m.criadoEm), por: m.criadoPor, motivo: m.motivo })),
  ];
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
      { rotulo: "Situação", valor: situacao, nota: "Derivada do último movimento (autorização ou anulação)." },
      { rotulo: "Processo digital", valor: s.processoDigital === null ? "—" : String(s.processoDigital.numero) },
      { rotulo: "Cadastrada em", valor: diaCivilBr(s.criadoEm), tipo: "data" },
      { rotulo: "Cadastrada por", valor: s.criadoPor },
    ],
    historico,
  };
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
        motivo: e === undefined || e.cotacoes === 0 ? "Sem cotação — média, mínimo e máximo não existem." : `${e.cotacoes} cotação(ões) · mínimo ${e.minimo.toFixed(6)} · médio ${e.medio.toFixed(6)} · máximo ${e.maximo.toFixed(6)} (derivados)`,
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
      { rotulo: "Estimativa pelo preço médio", valor: totalPeloMedio.toFixed(2), tipo: "dinheiro", nota: "Σ quantidade × média das cotações de cada item — derivado a cada leitura." },
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
  const where: Prisma.OrdemDeCompraWhereInput = {};
  if (q !== "") where.OR = [{ numero: { contains: q, mode: "insensitive" } }, { fornecedor: { versoes: { some: { nome: { contains: q, mode: "insensitive" } } } } }];
  if (tipo === "ORDINARIA" || tipo === "GLOBAL" || tipo === "ESTIMATIVA") where.tipo = tipo;
  const ordem: Prisma.OrdemDeCompraOrderByWithRelationInput = c.ordem === "dataEmissao" ? { dataEmissao: c.direcao } : { numero: c.direcao };
  const [total, linhas] = await Promise.all([
    prisma.ordemDeCompra.count({ where }),
    prisma.ordemDeCompra.findMany({
      where, orderBy: ordem, ...paginacao(c),
      select: { id: true, numero: true, tipo: true, dataEmissao: true, fornecedor: { select: { documento: true, versoes: { select: { nome: true }, orderBy: { criadoEm: "desc" }, take: 1 } } }, itens: { select: { quantidade: true, valorUnitario: true } }, _count: { select: { recebimentos: true } } },
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
      pendente: o.pendente.toFixed(2),
      situacao: o.pendente.greaterThan(0) ? (o._count.recebimentos > 0 ? "RECEBIDA EM PARTE" : "A RECEBER") : "RECEBIDA",
    })),
  };
}

export interface ItemDaOrdemParaReceber {
  readonly id: string;
  readonly rotulo: string;
  readonly pendente: string;
}

export async function verOrdem(id: string): Promise<(DetalheLido & { readonly itensParaReceber: readonly ItemDaOrdemParaReceber[] }) | null> {
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
    },
  });
  if (o === null) return null;
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
        motivo: `${i.quantidade.toFixed(4)} × ${i.valorUnitario.toFixed(6)} · recebido ${s?.recebida.toFixed(4) ?? "0.0000"} · pendente ${s?.pendente.toFixed(4) ?? i.quantidade.toFixed(4)} (derivado)`,
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
  ];
  return {
    titulo: `Ordem de compra ${o.numero}`,
    subtitulo: `${ROTULO_DO_TIPO_DE_ORDEM[o.tipo] ?? o.tipo} · ${nomeDaPessoa(o.fornecedor)}`,
    selos: [
      { texto: pendente.greaterThan(0) ? (o.recebimentos.length > 0 ? "RECEBIDA EM PARTE" : "A RECEBER") : "RECEBIDA", tom: pendente.greaterThan(0) ? "alerta" : "ok" },
      { texto: `${o.itens.length} item(ns)`, tom: "neutro" },
      { texto: `${o.recebimentos.length} recebimento(s)`, tom: "neutro" },
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
      { rotulo: "A receber (valor)", valor: pendente.toFixed(2), tipo: "dinheiro", nota: "Σ pendente × unitário, item a item — derivado dos recebimentos." },
      { rotulo: "Emitida em", valor: diaCivilBr(o.criadoEm), tipo: "data" },
      { rotulo: "Emitida por", valor: o.criadoPor },
    ],
    historico,
    itensParaReceber: o.itens
      .map((i) => ({ id: i.id, rotulo: `${i.material.codigo} — ${i.material.descricaoSucinta}`, pendente: saldoDoItem.get(i.id)?.pendente.toFixed(4) ?? i.quantidade.toFixed(4) }))
      .filter((i) => toMoney(i.pendente).greaterThan(0)),
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

export async function receberOrdem(ordemId: string, c: Campos, itens: readonly ItemRecebidoLido[]): Promise<void> {
  await comEscritaAutenticada("REGISTRAR_RECEBIMENTO_DE_ORDEM", (criadoPor) =>
    registrarRecebimentoDeOrdem(cliente(), {
      ordemId,
      data: dia(c, "data"),
      ...(t(c, "notaFiscal") !== "" ? { notaFiscal: t(c, "notaFiscal") } : {}),
      responsavelRecebimento: t(c, "responsavelRecebimento"),
      itens: itens.map((i) => ({ itemDeOrdemId: i.itemDeOrdemId, quantidade: decimalDaTela(i.quantidade) })),
      criadoPor,
    })
  );
}

export async function acaoDaOrdem(acao: string, ordemId: string, c: Campos): Promise<void> {
  if (acao !== "estornar") throw new Error(`Ação "${acao}" não existe neste cadastro. Nada foi gravado.`);
  await comEscritaAutenticada("ESTORNAR_ORDEM_DE_COMPRA", (criadoPor) => estornarOrdemDeCompra(cliente(), { ordemId, motivo: t(c, "motivo"), criadoPor }));
}
