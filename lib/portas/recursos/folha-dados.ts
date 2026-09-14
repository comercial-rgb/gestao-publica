import { diaCivilBr } from "../../../packages/datas/index.js";
import { Decimal, toMoney, sumMoney } from "../../../packages/contracts/index.js";
import { formatarDocumento } from "../../../packages/documento/index.js";
import type { Prisma } from "../../../prisma/generated/client/client.js";
import { situacaoDaFolha, vigenteNaCompetencia, type SituacaoDaFolha } from "../../../modules/m33-folha/dominio.js";
import { situacaoDoVinculo, type EventoDoVinculo } from "../../../modules/m32-pessoal/dominio.js";
import { apropriacaoDaFolha, apropriarFolha, cadastrarGrupoDeEmpenhoDaFolha } from "../../../modules/m33-folha/apropriacao.js";
import {
  abrirFolha,
  cadastrarRubrica,
  cadastrarTabelaDeContribuicao,
  cadastrarTabelaIrrf,
  cadastrarTabelaSalarioFamilia,
  calcularFolha,
  cancelarCalculoDaFolha,
  fecharFolha,
  lancarNaFolha,
} from "../../../modules/m33-folha/servico.js";
import type { ConsultaDoMolde } from "../../molde/consulta.js";
import { TAMANHO_DE_PAGINA } from "../../molde/consulta.js";
import type { DadoDoDetalhe, LinhaDoHistorico } from "../../molde/tipos.js";
import { comEscritaAutenticada } from "../sessao";
import { cliente, PortaSemBancoError } from "../cliente";
import type { DetalheLido, OpcoesDoCadastro, PaginaDoMolde } from "./dados";
import { decimalDaTela } from "./pessoal-dados";
import { OPCOES_DE_TIPO_DE_TABELA } from "./folha";

/**
 * A PORTA DA FOLHA (M33, V6 P2.3). Lê e chama; quem decide é o domínio. A situação da folha, o
 * líquido da lista, a vigência "hoje" das tabelas e a situação das matrículas oferecidas são
 * DERIVADAS a cada leitura. Nenhuma coluna de situação.
 */
export { PortaSemBancoError };

type Campos = Readonly<Record<string, string>>;
const t = (c: Campos, k: string): string => (c[k] ?? "").trim();
const opcional = (c: Campos, k: string): string | undefined => (t(c, k) === "" ? undefined : t(c, k));
const marcado = (c: Campos, k: string): boolean => ["on", "true", "1", "sim"].includes(t(c, k).toLowerCase());
function paginacao(c: ConsultaDoMolde): { readonly skip: number; readonly take: number } {
  return { skip: (c.pagina - 1) * TAMANHO_DE_PAGINA, take: TAMANHO_DE_PAGINA };
}
const competenciaDeHoje = (): string => diaCivilBr(new Date()).split("/").reverse().slice(0, 2).join("-");
const ROTULO_DA_SITUACAO: Readonly<Record<SituacaoDaFolha, string>> = { SEM_CALCULO: "SEM CÁLCULO", CALCULADA: "CALCULADA", FECHADA: "FECHADA" };
const ROTULO_DA_NATUREZA: Readonly<Record<string, string>> = {
  VENCIMENTO_BASE: "Vencimento-base", GRATIFICACOES_DO_VINCULO: "Gratificações do vínculo", VALOR_INFORMADO: "Valor informado", PERCENTUAL_DO_VENCIMENTO: "Percentual do vencimento",
  CONTRIBUICAO_PREVIDENCIARIA: "Contribuição previdenciária", IMPOSTO_DE_RENDA: "IRRF", SALARIO_FAMILIA: "Salário-família",
};

// ═══════════════════════════════════════════════════════════════════════════════
// FOLHAS
// ═══════════════════════════════════════════════════════════════════════════════

const SELECAO_DA_FOLHA = {
  id: true, competencia: true, tipo: true, criadoEm: true, criadoPor: true,
  fechamento: { select: { id: true, criadoEm: true, criadoPor: true, sha256: true, calculo: { select: { numero: true } } } },
  calculos: { orderBy: { numero: "asc" as const }, select: { id: true, numero: true, motivo: true, criadoEm: true, criadoPor: true, totalProventos: true, totalDescontos: true, totalLiquido: true, contracheques: true, sha256: true, versaoDoMotor: true, cancelamento: { select: { id: true, motivo: true, criadoEm: true, criadoPor: true } } } },
} satisfies Prisma.FolhaDePagamentoSelect;
type FolhaBruta = Prisma.FolhaDePagamentoGetPayload<{ select: typeof SELECAO_DA_FOLHA }>;

function derivarFolha(f: FolhaBruta): { readonly situacao: SituacaoDaFolha; readonly vivo: FolhaBruta["calculos"][number] | null } {
  const vivos = f.calculos.filter((c) => c.cancelamento === null);
  const vivo = f.fechamento !== null ? (f.calculos.find((c) => c.numero === f.fechamento!.calculo.numero) ?? null) : (vivos[vivos.length - 1] ?? null);
  return { situacao: situacaoDaFolha({ calculos: f.calculos.map((c) => ({ cancelada: c.cancelamento !== null })), fechada: f.fechamento !== null }), vivo };
}

export async function listarFolhas(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = (c.filtros["q"] ?? "").trim();
  const sit = c.filtros["situacao"] ?? "";
  const where: Prisma.FolhaDePagamentoWhereInput = q === "" ? {} : { competencia: { contains: q } };
  const todas = await prisma.folhaDePagamento.findMany({ where, orderBy: { competencia: c.direcao === "asc" ? "asc" : "desc" }, select: SELECAO_DA_FOLHA });
  const mapeadas = todas.map((f) => {
    const d = derivarFolha(f);
    return { id: f.id, competencia: f.competencia, tipo: f.tipo, calculos: String(f.calculos.length), contracheques: String(d.vivo?.contracheques ?? 0), liquido: d.vivo === null ? "0.00" : toMoney(d.vivo.totalLiquido).toFixed(2), situacao: ROTULO_DA_SITUACAO[d.situacao], situacaoTom: d.situacao === "FECHADA" ? "neutro" : d.situacao === "SEM_CALCULO" ? "alerta" : "neutro", _sit: d.situacao };
  });
  const filtradas = sit === "" ? mapeadas : mapeadas.filter((l) => l._sit === sit);
  const { skip, take } = paginacao(c);
  return { total: filtradas.length, linhas: filtradas.slice(skip, skip + take).map(({ _sit: _s, ...l }) => l) };
}

export interface EmpenhoDaFolhaLido {
  readonly numero: string;
  readonly ficha: number;
  readonly grupo: string;
  readonly matricula: string | null;
  readonly credor: string;
  readonly valor: string;
  readonly empenhoId: string;
}

export interface FolhaLida extends DetalheLido {
  readonly competencia: string;
  readonly situacao: SituacaoDaFolha;
  readonly calculoVivoId: string | null;
  /** `null` = a folha ainda não foi apropriada (ou nem está fechada). */
  readonly apropriacao: { readonly dataDoEmpenho: string; readonly por: string; readonly total: string; readonly empenhos: readonly EmpenhoDaFolhaLido[] } | null;
  readonly contracheques: readonly { readonly vinculoId: string; readonly matricula: string; readonly servidor: string; readonly regime: string; readonly dias: number; readonly proventos: string; readonly descontos: string; readonly liquido: string }[];
}

export async function verFolha(id: string): Promise<FolhaLida | null> {
  const prisma = cliente();
  const f = await prisma.folhaDePagamento.findUnique({ where: { id }, select: SELECAO_DA_FOLHA });
  if (f === null) return null;
  const d = derivarFolha(f);
  const apropriada = await apropriacaoDaFolha(prisma, id);
  const contracheques = d.vivo === null ? [] : await prisma.contracheque.findMany({
    where: { calculoId: d.vivo.id }, orderBy: { vinculo: { matricula: "asc" } },
    select: { vinculoId: true, regime: true, diasComputados: true, totalProventos: true, totalDescontos: true, liquido: true, vinculo: { select: { matricula: true, servidor: { select: { nomeSocial: true, pessoa: { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } } } } } } },
  });
  const dados: DadoDoDetalhe[] = [
    { rotulo: "Competência", valor: f.competencia },
    { rotulo: "Tipo", valor: f.tipo },
    { rotulo: "Situação (derivada)", valor: ROTULO_DA_SITUACAO[d.situacao], nota: "Sem cálculo / calculada (há cálculo vivo) / fechada (um cálculo congelado). Nunca coluna." },
    ...(d.vivo === null ? [] : [
      { rotulo: d.situacao === "FECHADA" ? "Cálculo fechado" : "Último cálculo vivo", valor: `nº ${d.vivo.numero} · ${d.vivo.contracheques} contracheque(s) · motor ${d.vivo.versaoDoMotor}` },
      { rotulo: "Proventos", valor: toMoney(d.vivo.totalProventos).toFixed(2), tipo: "dinheiro" as const },
      { rotulo: "Descontos", valor: toMoney(d.vivo.totalDescontos).toFixed(2), tipo: "dinheiro" as const },
      { rotulo: "Líquido", valor: toMoney(d.vivo.totalLiquido).toFixed(2), tipo: "dinheiro" as const },
      { rotulo: "sha256 do cálculo", valor: d.vivo.sha256, nota: "Impressão digital do conjunto (lista ordenada dos sha256 dos contracheques)." },
    ]),
    ...(f.fechamento === null ? [] : [{ rotulo: "Fechada em", valor: `${diaCivilBr(f.fechamento.criadoEm)} por ${f.fechamento.criadoPor}` }]),
    ...(apropriada === null
      ? f.fechamento === null ? [] : [{ rotulo: "Apropriação contábil", valor: "não apropriada", nota: "Apropriar gera os empenhos desta folha pelos grupos de empenho cadastrados." }]
      : [{ rotulo: "Apropriação contábil", valor: `${apropriada.empenhos.length} empenho(s), ${apropriada.total.toFixed(2)} — empenhos de ${diaCivilBr(apropriada.dataDoEmpenho)}, por ${apropriada.criadoPor}`, nota: "Só o BRUTO é empenhado; as retenções viajam no pagamento." }]),
    { rotulo: "Aberta em", valor: diaCivilBr(f.criadoEm), tipo: "data" as const },
    { rotulo: "Aberta por", valor: f.criadoPor },
  ];
  const historico: LinhaDoHistorico[] = [
    { id: `abertura-${f.id}`, oQue: "Folha aberta", quando: diaCivilBr(f.criadoEm), registradoEm: diaCivilBr(f.criadoEm), por: f.criadoPor },
    ...f.calculos.flatMap((c) => [
      { id: c.id, oQue: `Cálculo nº ${c.numero} · ${c.contracheques} contracheque(s)`, quando: diaCivilBr(c.criadoEm), registradoEm: diaCivilBr(c.criadoEm), por: c.criadoPor, motivo: [c.motivo, `sha256 ${c.sha256.slice(0, 12)}…`].filter((x) => x !== null).join(" · "), valor: toMoney(c.totalLiquido).toFixed(2), ...(c.cancelamento !== null ? { estornado: true } : {}) },
      ...(c.cancelamento === null ? [] : [{ id: c.cancelamento.id, oQue: `Cancelamento do cálculo nº ${c.numero}`, quando: diaCivilBr(c.cancelamento.criadoEm), registradoEm: diaCivilBr(c.cancelamento.criadoEm), por: c.cancelamento.criadoPor, motivo: c.cancelamento.motivo }]),
    ]),
    ...(f.fechamento === null ? [] : [{ id: f.fechamento.id, oQue: `Fechamento sobre o cálculo nº ${f.fechamento.calculo.numero}`, quando: diaCivilBr(f.fechamento.criadoEm), registradoEm: diaCivilBr(f.fechamento.criadoEm), por: f.fechamento.criadoPor, motivo: `sha256 ${f.fechamento.sha256.slice(0, 12)}…` }]),
  ];
  return {
    titulo: `Folha ${f.tipo.toLowerCase()} de ${f.competencia}`,
    subtitulo: d.vivo === null ? "sem cálculo" : `cálculo nº ${d.vivo.numero} · líquido ${toMoney(d.vivo.totalLiquido).toFixed(2)}`,
    selos: [{ texto: ROTULO_DA_SITUACAO[d.situacao], tom: d.situacao === "FECHADA" ? "ok" : d.situacao === "CALCULADA" ? "neutro" : "alerta" }],
    dados, historico,
    competencia: f.competencia, situacao: d.situacao, calculoVivoId: d.vivo?.id ?? null,
    apropriacao: apropriada === null ? null : {
      dataDoEmpenho: diaCivilBr(apropriada.dataDoEmpenho), por: apropriada.criadoPor, total: apropriada.total.toFixed(2),
      empenhos: apropriada.empenhos.map((e) => ({ numero: e.numero, ficha: e.ficha, grupo: e.grupo, matricula: e.matricula, credor: e.credor, valor: e.valor.toFixed(2), empenhoId: e.empenhoId })),
    },
    contracheques: contracheques.map((x) => ({ vinculoId: x.vinculoId, matricula: x.vinculo.matricula, servidor: x.vinculo.servidor.nomeSocial ?? x.vinculo.servidor.pessoa.versoes[0]?.nome ?? x.vinculo.servidor.pessoa.documento, regime: x.regime, dias: x.diasComputados, proventos: toMoney(x.totalProventos).toFixed(2), descontos: toMoney(x.totalDescontos).toFixed(2), liquido: toMoney(x.liquido).toFixed(2) })),
  };
}

export async function opcoesDaFolha(): Promise<OpcoesDoCadastro> {
  return {};
}

export async function criarFolha(c: Campos): Promise<string> {
  return comEscritaAutenticada("ABRIR_FOLHA", async (criadoPor) => {
    const r = await abrirFolha(cliente(), { competencia: t(c, "competencia"), tipo: (opcional(c, "tipo") ?? "MENSAL") as "MENSAL", criadoPor });
    return r.folhaId;
  });
}

export async function acaoDaFolha(acao: string, folhaId: string, c: Campos): Promise<string> {
  const prisma = cliente();
  switch (acao) {
    case "calcular": {
      const r = await comEscritaAutenticada("CALCULAR_FOLHA", (criadoPor) => calcularFolha(prisma, { folhaId, ...(opcional(c, "motivo") !== undefined ? { motivo: t(c, "motivo") } : {}), criadoPor }));
      return `Cálculo nº ${r.numero} gravado: ${r.contracheques} contracheque(s), líquido ${r.totalLiquido.toFixed(2)}. Cada contracheque traz a memória e o sha256.`;
    }
    case "cancelar-calculo": {
      const vivo = await prisma.calculoDaFolha.findFirst({ where: { folhaId, cancelamento: null }, orderBy: { numero: "desc" }, select: { id: true, numero: true } });
      if (vivo === null) throw new Error("Esta folha não tem cálculo vivo para cancelar. Nada foi gravado.");
      await comEscritaAutenticada("CANCELAR_CALCULO_DA_FOLHA", (criadoPor) => cancelarCalculoDaFolha(prisma, { calculoId: vivo.id, motivo: t(c, "motivo"), criadoPor }));
      return `Cálculo nº ${vivo.numero} cancelado como fato; ele continua no histórico.`;
    }
    case "apropriar": {
      const r = await comEscritaAutenticada("APROPRIAR_FOLHA", (criadoPor) => apropriarFolha(prisma, { folhaId, dataDoEmpenho: new Date(`${t(c, "dataDoEmpenho")}T12:00:00`), criadoPor }));
      const detalhe = r.porGrupo.map((g) => `${g.codigo} (ficha ${g.ficha}): ${g.empenhos} empenho(s), ${g.valor.toFixed(2)}`).join(" · ");
      return r.empenhados === 0 && r.jaExistiam > 0
        ? `Nada novo a empenhar: os ${r.jaExistiam} empenho(s) desta folha já existem. ${detalhe}`
        : `Apropriação gravada: ${r.empenhados} empenho(s) novo(s)${r.jaExistiam > 0 ? ` (${r.jaExistiam} já existiam)` : ""}, total ${r.total.toFixed(2)}. ${detalhe}`;
    }
    case "fechar": {
      const r = await comEscritaAutenticada("FECHAR_FOLHA", (criadoPor) => fecharFolha(prisma, { folhaId, criadoPor }));
      return `Folha fechada sobre o cálculo nº ${r.numero}. Ela não se recalcula mais.`;
    }
    default:
      throw new Error(`Ação desconhecida: ${acao}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// O CONTRACHEQUE — a memória de cálculo, legível (5.12.51, 5.12.53, 5.12.54)
// ═══════════════════════════════════════════════════════════════════════════════

export interface ContrachequeLido {
  readonly folhaId: string;
  readonly competencia: string;
  readonly calculoNumero: number;
  readonly matricula: string;
  readonly servidor: string;
  readonly regime: string;
  readonly dias: number;
  readonly totais: { readonly proventos: string; readonly descontos: string; readonly liquido: string; readonly baseContribuicao: string; readonly contribuicao: string; readonly baseIrrf: string; readonly irrf: string };
  readonly linhas: readonly { readonly id: string; readonly codigo: string; readonly descricao: string; readonly tipo: string; readonly valorBase: string; readonly fator: string; readonly valor: string; readonly incideContribuicao: boolean; readonly incideIrrf: boolean; readonly memoria: string }[];
  readonly memoria: unknown;
  readonly sha256: string;
}

export async function verContracheque(folhaId: string, vinculoId: string): Promise<ContrachequeLido | null> {
  const prisma = cliente();
  const f = await prisma.folhaDePagamento.findUnique({ where: { id: folhaId }, select: SELECAO_DA_FOLHA });
  if (f === null) return null;
  const d = derivarFolha(f);
  if (d.vivo === null) return null;
  const c = await prisma.contracheque.findUnique({
    where: { calculoId_vinculoId: { calculoId: d.vivo.id, vinculoId } },
    select: {
      regime: true, diasComputados: true, totalProventos: true, totalDescontos: true, liquido: true, baseContribuicao: true, contribuicao: true, baseIrrf: true, irrf: true, memoria: true, sha256: true,
      vinculo: { select: { matricula: true, servidor: { select: { nomeSocial: true, pessoa: { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } } } } } },
      linhas: { orderBy: { ordem: "asc" }, select: { id: true, tipo: true, valorBase: true, fator: true, valor: true, incideContribuicao: true, incideIrrf: true, memoria: true, rubrica: { select: { codigo: true, descricao: true } } } },
    },
  });
  if (c === null) return null;
  return {
    folhaId, competencia: f.competencia, calculoNumero: d.vivo.numero,
    matricula: c.vinculo.matricula, servidor: c.vinculo.servidor.nomeSocial ?? c.vinculo.servidor.pessoa.versoes[0]?.nome ?? c.vinculo.servidor.pessoa.documento,
    regime: c.regime, dias: c.diasComputados,
    totais: { proventos: toMoney(c.totalProventos).toFixed(2), descontos: toMoney(c.totalDescontos).toFixed(2), liquido: toMoney(c.liquido).toFixed(2), baseContribuicao: toMoney(c.baseContribuicao).toFixed(2), contribuicao: toMoney(c.contribuicao).toFixed(2), baseIrrf: toMoney(c.baseIrrf).toFixed(2), irrf: toMoney(c.irrf).toFixed(2) },
    linhas: c.linhas.map((l) => ({ id: l.id, codigo: l.rubrica.codigo, descricao: l.rubrica.descricao, tipo: l.tipo, valorBase: toMoney(l.valorBase).toFixed(2), fator: new Decimal(l.fator).toFixed(6), valor: toMoney(l.valor).toFixed(2), incideContribuicao: l.incideContribuicao, incideIrrf: l.incideIrrf, memoria: l.memoria })),
    memoria: c.memoria, sha256: c.sha256,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// RUBRICAS
// ═══════════════════════════════════════════════════════════════════════════════

export async function listarRubricas(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = (c.filtros["q"] ?? "").trim();
  const tipo = c.filtros["tipo"] ?? "";
  const where: Prisma.RubricaWhereInput = { ...(q === "" ? {} : { OR: [{ codigo: { contains: q, mode: "insensitive" } }, { descricao: { contains: q, mode: "insensitive" } }] }), ...(tipo === "" ? {} : { tipo: tipo as "PROVENTO" | "DESCONTO" }) };
  const [total, linhas] = await Promise.all([
    prisma.rubrica.count({ where }),
    prisma.rubrica.findMany({ where, orderBy: c.ordem === "codigo" ? { codigo: c.direcao } : { ordem: c.direcao === "desc" ? "desc" : "asc" }, ...paginacao(c), select: { id: true, codigo: true, descricao: true, tipo: true, natureza: true, incideContribuicao: true, incideIrrf: true, ordem: true } }),
  ]);
  return {
    total,
    linhas: linhas.map((r) => ({ id: r.id, codigo: r.codigo, descricao: r.descricao, tipo: r.tipo === "PROVENTO" ? "Provento" : "Desconto", natureza: ROTULO_DA_NATUREZA[r.natureza] ?? r.natureza, incidencias: [r.incideContribuicao ? "contribuição" : null, r.incideIrrf ? "IRRF" : null].filter((x) => x !== null).join(" e ") || "—", ordem: String(r.ordem) })),
  };
}

export async function verRubrica(id: string): Promise<DetalheLido | null> {
  const prisma = cliente();
  const r = await prisma.rubrica.findUnique({ where: { id }, select: { id: true, codigo: true, descricao: true, tipo: true, natureza: true, percentual: true, incideContribuicao: true, incideIrrf: true, proporcionalAosDias: true, ordem: true, fundamentacaoLegal: true, criadoEm: true, criadoPor: true, _count: { select: { lancamentos: true, linhas: true } } } });
  if (r === null) return null;
  return {
    titulo: `${r.codigo} — ${r.descricao}`,
    subtitulo: `${r.tipo === "PROVENTO" ? "Provento" : "Desconto"} · ${ROTULO_DA_NATUREZA[r.natureza] ?? r.natureza}`,
    selos: [{ texto: r.tipo, tom: r.tipo === "PROVENTO" ? "ok" : "alerta" }],
    dados: [
      { rotulo: "Código", valor: r.codigo },
      { rotulo: "Descrição", valor: r.descricao },
      { rotulo: "Natureza", valor: ROTULO_DA_NATUREZA[r.natureza] ?? r.natureza },
      ...(r.percentual === null ? [] : [{ rotulo: "Percentual", valor: `${new Decimal(r.percentual).times(100).toFixed(2)}% do vencimento-base` }]),
      { rotulo: "Compõe a base da contribuição", valor: r.incideContribuicao ? "sim" : "não" },
      { rotulo: "Compõe a base do IRRF", valor: r.incideIrrf ? "sim" : "não" },
      { rotulo: "Proporcional aos dias", valor: r.proporcionalAosDias ? "sim (mês fiscal de 30 dias)" : "não" },
      { rotulo: "Ordem no contracheque", valor: String(r.ordem), tipo: "inteiro" },
      { rotulo: "Fundamentação legal", valor: r.fundamentacaoLegal },
      { rotulo: "Uso", valor: `${r._count.lancamentos} lançamento(s) · ${r._count.linhas} linha(s) de contracheque` },
      { rotulo: "Cadastrada em", valor: diaCivilBr(r.criadoEm), tipo: "data" },
      { rotulo: "Cadastrada por", valor: r.criadoPor },
    ],
    historico: [],
  };
}

export async function opcoesDaRubrica(): Promise<OpcoesDoCadastro> {
  return {};
}

export async function criarRubrica(c: Campos): Promise<string> {
  return comEscritaAutenticada("CADASTRAR_RUBRICA", async (criadoPor) => {
    const pct = opcional(c, "percentual");
    const r = await cadastrarRubrica(cliente(), {
      codigo: t(c, "codigo"), descricao: t(c, "descricao"), tipo: t(c, "tipo") as "PROVENTO", natureza: t(c, "natureza") as "VALOR_INFORMADO",
      ...(pct === undefined ? {} : { percentual: new Decimal(decimalDaTela(pct)).div(100).toFixed(4) }),
      incideContribuicao: marcado(c, "incideContribuicao"), incideIrrf: marcado(c, "incideIrrf"), proporcionalAosDias: marcado(c, "proporcionalAosDias"),
      ordem: Number.parseInt(t(c, "ordem"), 10), fundamentacaoLegal: t(c, "fundamentacaoLegal"), criadoPor,
    });
    return r.rubricaId;
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// LANÇAMENTOS
// ═══════════════════════════════════════════════════════════════════════════════

const SELECAO_DE_EVENTOS = { select: { data: true, criadoEm: true, tipo: true, cargoId: true, lotacaoId: true, salarioBase: true } } as const;
const eventos = (xs: readonly { data: Date; criadoEm: Date; tipo: string; cargoId: string | null; lotacaoId: string | null; salarioBase: Decimal | null }[]): EventoDoVinculo[] =>
  xs.map((e) => ({ data: e.data, criadoEm: e.criadoEm, tipo: e.tipo as EventoDoVinculo["tipo"], cargoId: e.cargoId, lotacaoId: e.lotacaoId, salarioBase: e.salarioBase === null ? null : toMoney(e.salarioBase) }));

export async function listarLancamentos(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = (c.filtros["q"] ?? "").trim();
  const comp = (c.filtros["competencia"] ?? "").trim();
  const where: Prisma.LancamentoDaFolhaWhereInput = {
    ...(q === "" ? {} : { OR: [{ vinculo: { matricula: { contains: q, mode: "insensitive" } } }, { rubrica: { codigo: { contains: q, mode: "insensitive" } } }, { rubrica: { descricao: { contains: q, mode: "insensitive" } } }] }),
    ...(comp === "" ? {} : { competenciaInicio: { lte: comp }, OR: [{ competenciaFim: null }, { competenciaFim: { gte: comp } }] }),
  };
  const [total, linhas] = await Promise.all([
    prisma.lancamentoDaFolha.count({ where }),
    prisma.lancamentoDaFolha.findMany({ where, orderBy: [{ competenciaInicio: "desc" }, { criadoEm: "desc" }], ...paginacao(c), select: { id: true, tipo: true, competenciaInicio: true, competenciaFim: true, valor: true, rubrica: { select: { codigo: true, descricao: true } }, vinculo: { select: { matricula: true, servidor: { select: { nomeSocial: true, pessoa: { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } } } } } } } }),
  ]);
  return {
    total,
    linhas: linhas.map((l) => ({ id: l.id, matricula: l.vinculo.matricula, servidor: l.vinculo.servidor.nomeSocial ?? l.vinculo.servidor.pessoa.versoes[0]?.nome ?? l.vinculo.servidor.pessoa.documento, rubrica: `${l.rubrica.codigo} — ${l.rubrica.descricao}`, tipo: l.tipo === "FIXO" ? "Fixo" : "Variável", vigencia: l.tipo === "VARIAVEL" ? l.competenciaInicio : `${l.competenciaInicio} → ${l.competenciaFim ?? "aberto"}`, valor: toMoney(l.valor).toFixed(2) })),
  };
}

export async function verLancamento(id: string): Promise<DetalheLido | null> {
  const prisma = cliente();
  const l = await prisma.lancamentoDaFolha.findUnique({ where: { id }, select: { id: true, tipo: true, competenciaInicio: true, competenciaFim: true, valor: true, observacao: true, atoLegal: true, criadoEm: true, criadoPor: true, rubrica: { select: { codigo: true, descricao: true } }, vinculo: { select: { matricula: true } } } });
  if (l === null) return null;
  return {
    titulo: `${l.rubrica.codigo} · ${l.vinculo.matricula}`,
    subtitulo: `${l.tipo === "FIXO" ? "Fixo" : "Variável"} · ${l.tipo === "VARIAVEL" ? l.competenciaInicio : `${l.competenciaInicio} → ${l.competenciaFim ?? "aberto"}`}`,
    selos: [{ texto: l.tipo, tom: "neutro" }],
    dados: [
      { rotulo: "Matrícula", valor: l.vinculo.matricula },
      { rotulo: "Rubrica", valor: `${l.rubrica.codigo} — ${l.rubrica.descricao}` },
      { rotulo: "Tipo", valor: l.tipo === "FIXO" ? "Fixo (por vigência)" : "Variável (uma competência)" },
      { rotulo: "Vigência", valor: l.tipo === "VARIAVEL" ? l.competenciaInicio : `${l.competenciaInicio} até ${l.competenciaFim ?? "aberto"}` },
      { rotulo: "Valor", valor: toMoney(l.valor).toFixed(2), tipo: "dinheiro" },
      { rotulo: "Observação", valor: l.observacao ?? "—" },
      { rotulo: "Ato legal", valor: l.atoLegal ?? "—" },
      { rotulo: "Lançado em", valor: diaCivilBr(l.criadoEm), tipo: "data" },
      { rotulo: "Lançado por", valor: l.criadoPor },
    ],
    historico: [],
  };
}

export async function opcoesDoLancamento(): Promise<OpcoesDoCadastro> {
  const prisma = cliente();
  const [vinculos, rubricas] = await Promise.all([
    prisma.vinculo.findMany({ orderBy: { matricula: "asc" }, take: 500, select: { id: true, matricula: true, eventos: SELECAO_DE_EVENTOS, servidor: { select: { nomeSocial: true, pessoa: { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } } } } } }),
    prisma.rubrica.findMany({ where: { natureza: "VALOR_INFORMADO" }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true, descricao: true, tipo: true } }),
  ]);
  const hoje = new Date();
  return {
    // Só as matrículas VIVAS hoje: lançar para um desligado é recusado pelo domínio de qualquer forma.
    vinculoId: vinculos.filter((v) => situacaoDoVinculo(eventos(v.eventos), hoje) !== "DESLIGADO").map((v) => ({ valor: v.id, rotulo: `${v.matricula} · ${v.servidor.nomeSocial ?? v.servidor.pessoa.versoes[0]?.nome ?? v.servidor.pessoa.documento}` })),
    rubricaId: rubricas.map((r) => ({ valor: r.id, rotulo: `${r.codigo} — ${r.descricao} (${r.tipo === "PROVENTO" ? "provento" : "desconto"})` })),
  };
}

export async function criarLancamento(c: Campos): Promise<string> {
  return comEscritaAutenticada("LANCAR_NA_FOLHA", async (criadoPor) => {
    const r = await lancarNaFolha(cliente(), {
      vinculoId: t(c, "vinculoId"), rubricaId: t(c, "rubricaId"), tipo: t(c, "tipo") as "FIXO" | "VARIAVEL",
      competenciaInicio: t(c, "competenciaInicio"), ...(opcional(c, "competenciaFim") !== undefined ? { competenciaFim: t(c, "competenciaFim") } : {}),
      valor: decimalDaTela(t(c, "valor")),
      ...(opcional(c, "observacao") !== undefined ? { observacao: t(c, "observacao") } : {}),
      ...(opcional(c, "atoLegal") !== undefined ? { atoLegal: t(c, "atoLegal") } : {}),
      criadoPor,
    });
    return r.lancamentoId;
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// AS TABELAS DO ENTE — três modelos, uma lista
// ═══════════════════════════════════════════════════════════════════════════════

interface TabelaNaLista {
  readonly id: string;
  readonly tipo: string;
  readonly competenciaInicio: string;
  readonly competenciaFim: string | null;
  readonly resumo: string;
  readonly fundamentacaoLegal: string;
}

async function todasAsTabelas(): Promise<readonly TabelaNaLista[]> {
  const prisma = cliente();
  const [contrib, irrf, sf] = await Promise.all([
    prisma.tabelaDeContribuicao.findMany({ select: { id: true, regime: true, competenciaInicio: true, competenciaFim: true, teto: true, fundamentacaoLegal: true, faixas: { orderBy: { ordem: "asc" }, select: { ate: true, aliquota: true } } } }),
    prisma.tabelaIrrf.findMany({ select: { id: true, competenciaInicio: true, competenciaFim: true, deducaoPorDependente: true, descontoSimplificado: true, redutorBase: true, fundamentacaoLegal: true, faixas: { orderBy: { ordem: "asc" }, select: { ate: true, aliquota: true } } } }),
    prisma.tabelaSalarioFamilia.findMany({ select: { id: true, competenciaInicio: true, competenciaFim: true, rendaMaxima: true, valorPorDependente: true, idadeLimite: true, fundamentacaoLegal: true } }),
  ]);
  const pct = (a: Decimal): string => `${new Decimal(a).times(100).toFixed(2)}%`;
  return [
    ...contrib.map((x) => ({ id: x.id, tipo: x.regime === "RGPS" ? "CONTRIBUICAO_RGPS" : "CONTRIBUICAO_RPPS", competenciaInicio: x.competenciaInicio, competenciaFim: x.competenciaFim, resumo: `${x.faixas.length} faixa(s): ${x.faixas.map((f) => pct(f.aliquota)).join(" / ")}${x.teto === null ? "" : ` · teto ${toMoney(x.teto).toFixed(2)}`}`, fundamentacaoLegal: x.fundamentacaoLegal })),
    ...irrf.map((x) => ({ id: x.id, tipo: "IRRF", competenciaInicio: x.competenciaInicio, competenciaFim: x.competenciaFim, resumo: `${x.faixas.length} faixa(s) · dep. ${toMoney(x.deducaoPorDependente).toFixed(2)}${x.descontoSimplificado === null ? "" : ` · simplificado ${toMoney(x.descontoSimplificado).toFixed(2)}`}${x.redutorBase === null ? "" : " · com redutor"}`, fundamentacaoLegal: x.fundamentacaoLegal })),
    ...sf.map((x) => ({ id: x.id, tipo: "SALARIO_FAMILIA", competenciaInicio: x.competenciaInicio, competenciaFim: x.competenciaFim, resumo: `${toMoney(x.valorPorDependente).toFixed(2)} por dependente até ${x.idadeLimite} anos · renda até ${toMoney(x.rendaMaxima).toFixed(2)}`, fundamentacaoLegal: x.fundamentacaoLegal })),
  ];
}

export async function listarTabelas(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const tipo = c.filtros["tipo"] ?? "";
  const hoje = competenciaDeHoje();
  const todas = (await todasAsTabelas()).filter((x) => tipo === "" || x.tipo === tipo).sort((a, b) => a.tipo.localeCompare(b.tipo) || (a.competenciaInicio < b.competenciaInicio ? 1 : -1));
  const { skip, take } = paginacao(c);
  return {
    total: todas.length,
    linhas: todas.slice(skip, skip + take).map((x) => ({
      id: x.id, tipo: OPCOES_DE_TIPO_DE_TABELA.find((o) => o.valor === x.tipo)?.rotulo ?? x.tipo,
      vigencia: `${x.competenciaInicio} → ${x.competenciaFim ?? "aberta"}`, resumo: x.resumo, fundamentacaoLegal: x.fundamentacaoLegal,
      situacao: vigenteNaCompetencia(x, hoje) ? "VIGENTE" : x.competenciaInicio > hoje ? "FUTURA" : "ENCERRADA",
    })),
  };
}

export async function verTabela(id: string): Promise<DetalheLido | null> {
  const prisma = cliente();
  const pct = (a: Decimal): string => `${new Decimal(a).times(100).toFixed(2)}%`;
  const faixasParaDados = (fx: readonly { ordem: number; ate: Decimal | null; aliquota: Decimal }[]): DadoDoDetalhe[] => fx.map((f) => ({ rotulo: `Faixa ${f.ordem}`, valor: `${f.ate === null ? "acima da anterior, sem limite" : `até ${toMoney(f.ate).toFixed(2)}`} · ${pct(f.aliquota)}` }));
  const contrib = await prisma.tabelaDeContribuicao.findUnique({ where: { id }, select: { regime: true, competenciaInicio: true, competenciaFim: true, teto: true, aliquotaPatronal: true, fundamentacaoLegal: true, criadoEm: true, criadoPor: true, faixas: { orderBy: { ordem: "asc" }, select: { ordem: true, ate: true, aliquota: true } } } });
  if (contrib !== null) {
    return {
      titulo: `Contribuição ${contrib.regime} — desde ${contrib.competenciaInicio}`, subtitulo: contrib.fundamentacaoLegal, selos: [{ texto: contrib.regime, tom: "neutro" }],
      dados: [
        { rotulo: "Vigência", valor: `${contrib.competenciaInicio} → ${contrib.competenciaFim ?? "aberta"}` },
        { rotulo: "Teto (salário de contribuição)", valor: contrib.teto === null ? "sem teto" : toMoney(contrib.teto).toFixed(2), tipo: contrib.teto === null ? "texto" : "dinheiro" },
        { rotulo: "Alíquota patronal (informativa)", valor: contrib.aliquotaPatronal === null ? "—" : pct(contrib.aliquotaPatronal) },
        ...faixasParaDados(contrib.faixas),
        { rotulo: "Fundamentação legal", valor: contrib.fundamentacaoLegal },
        { rotulo: "Cadastrada em", valor: `${diaCivilBr(contrib.criadoEm)} por ${contrib.criadoPor}` },
      ],
      historico: [],
    };
  }
  const irrf = await prisma.tabelaIrrf.findUnique({ where: { id }, select: { competenciaInicio: true, competenciaFim: true, deducaoPorDependente: true, descontoSimplificado: true, isencaoMaior65: true, redutorBase: true, redutorFator: true, redutorRendaMaxima: true, fundamentacaoLegal: true, criadoEm: true, criadoPor: true, faixas: { orderBy: { ordem: "asc" }, select: { ordem: true, ate: true, aliquota: true, parcelaADeduzir: true } } } });
  if (irrf !== null) {
    return {
      titulo: `IRRF — desde ${irrf.competenciaInicio}`, subtitulo: irrf.fundamentacaoLegal, selos: [{ texto: "IRRF", tom: "neutro" }],
      dados: [
        { rotulo: "Vigência", valor: `${irrf.competenciaInicio} → ${irrf.competenciaFim ?? "aberta"}` },
        { rotulo: "Dedução por dependente", valor: toMoney(irrf.deducaoPorDependente).toFixed(2), tipo: "dinheiro" },
        { rotulo: "Desconto simplificado", valor: irrf.descontoSimplificado === null ? "não há (cenário indisponível)" : toMoney(irrf.descontoSimplificado).toFixed(2) },
        { rotulo: "Parcela isenta (65 anos ou mais)", valor: irrf.isencaoMaior65 === null ? "não há" : toMoney(irrf.isencaoMaior65).toFixed(2) },
        { rotulo: "Redutor", valor: irrf.redutorBase === null ? "não há (cenário indisponível)" : `max(0, ${toMoney(irrf.redutorBase).toFixed(2)} − ${new Decimal(irrf.redutorFator ?? 0).toFixed(8)} × renda), zerado acima de ${toMoney(irrf.redutorRendaMaxima ?? 0).toFixed(2)}` },
        ...irrf.faixas.map((f) => ({ rotulo: `Faixa ${f.ordem}`, valor: `${f.ate === null ? "acima da anterior, sem limite" : `até ${toMoney(f.ate).toFixed(2)}`} · ${pct(f.aliquota)} · parcela a deduzir ${toMoney(f.parcelaADeduzir).toFixed(2)}` })),
        { rotulo: "Fundamentação legal", valor: irrf.fundamentacaoLegal },
        { rotulo: "Cadastrada em", valor: `${diaCivilBr(irrf.criadoEm)} por ${irrf.criadoPor}` },
      ],
      historico: [],
    };
  }
  const sf = await prisma.tabelaSalarioFamilia.findUnique({ where: { id }, select: { competenciaInicio: true, competenciaFim: true, rendaMaxima: true, valorPorDependente: true, idadeLimite: true, fundamentacaoLegal: true, criadoEm: true, criadoPor: true } });
  if (sf !== null) {
    return {
      titulo: `Salário-família — desde ${sf.competenciaInicio}`, subtitulo: sf.fundamentacaoLegal, selos: [{ texto: "SALÁRIO-FAMÍLIA", tom: "neutro" }],
      dados: [
        { rotulo: "Vigência", valor: `${sf.competenciaInicio} → ${sf.competenciaFim ?? "aberta"}` },
        { rotulo: "Renda máxima do servidor", valor: toMoney(sf.rendaMaxima).toFixed(2), tipo: "dinheiro" },
        { rotulo: "Valor por dependente", valor: toMoney(sf.valorPorDependente).toFixed(2), tipo: "dinheiro" },
        { rotulo: "Idade limite", valor: `${sf.idadeLimite} anos (inválido: sem limite)` },
        { rotulo: "Fundamentação legal", valor: sf.fundamentacaoLegal },
        { rotulo: "Cadastrada em", valor: `${diaCivilBr(sf.criadoEm)} por ${sf.criadoPor}` },
      ],
      historico: [],
    };
  }
  return null;
}

export async function opcoesDaTabela(): Promise<OpcoesDoCadastro> {
  return {};
}

/** A ilha manda o cabeçalho e as linhas `faixas.N.*` já extraídas (`linhasDoFormulario`). */
export async function criarTabela(c: Campos, faixas: readonly Readonly<Record<string, string>>[]): Promise<string> {
  return comEscritaAutenticada("CONFIGURAR_TABELAS_DA_FOLHA", async (criadoPor) => {
    const prisma = cliente();
    const tipo = t(c, "tipo");
    const comum = { competenciaInicio: t(c, "competenciaInicio"), ...(opcional(c, "competenciaFim") !== undefined ? { competenciaFim: t(c, "competenciaFim") } : {}), fundamentacaoLegal: t(c, "fundamentacaoLegal"), criadoPor };
    const linhas = faixas.map((f, i) => ({ ordem: i + 1, ate: (f["ate"] ?? "").trim() === "" ? null : decimalDaTela(f["ate"] ?? ""), aliquota: new Decimal(decimalDaTela(f["aliquota"] ?? "0")).div(100).toFixed(4), parcelaADeduzir: (f["parcelaADeduzir"] ?? "").trim() === "" ? undefined : decimalDaTela(f["parcelaADeduzir"] ?? "") }));
    if (tipo === "CONTRIBUICAO_RGPS" || tipo === "CONTRIBUICAO_RPPS") {
      const r = await cadastrarTabelaDeContribuicao(prisma, { ...comum, regime: tipo === "CONTRIBUICAO_RGPS" ? "RGPS" : "RPPS", ...(opcional(c, "teto") !== undefined ? { teto: decimalDaTela(t(c, "teto")) } : {}), ...(opcional(c, "aliquotaPatronal") !== undefined ? { aliquotaPatronal: new Decimal(decimalDaTela(t(c, "aliquotaPatronal"))).div(100).toFixed(4) } : {}), faixas: linhas.map((l) => ({ ordem: l.ordem, ate: l.ate, aliquota: l.aliquota })) });
      return r.tabelaId;
    }
    if (tipo === "IRRF") {
      const r = await cadastrarTabelaIrrf(prisma, {
        ...comum, deducaoPorDependente: decimalDaTela(t(c, "deducaoPorDependente")),
        ...(opcional(c, "descontoSimplificado") !== undefined ? { descontoSimplificado: decimalDaTela(t(c, "descontoSimplificado")) } : {}),
        ...(opcional(c, "isencaoMaior65") !== undefined ? { isencaoMaior65: decimalDaTela(t(c, "isencaoMaior65")) } : {}),
        ...(opcional(c, "redutorBase") !== undefined ? { redutorBase: decimalDaTela(t(c, "redutorBase")) } : {}),
        ...(opcional(c, "redutorFator") !== undefined ? { redutorFator: decimalDaTela(t(c, "redutorFator")) } : {}),
        ...(opcional(c, "redutorRendaMaxima") !== undefined ? { redutorRendaMaxima: decimalDaTela(t(c, "redutorRendaMaxima")) } : {}),
        faixas: linhas.map((l) => ({ ordem: l.ordem, ate: l.ate, aliquota: l.aliquota, ...(l.parcelaADeduzir === undefined ? {} : { parcelaADeduzir: l.parcelaADeduzir }) })),
      });
      return r.tabelaId;
    }
    if (tipo === "SALARIO_FAMILIA") {
      const r = await cadastrarTabelaSalarioFamilia(prisma, { ...comum, rendaMaxima: decimalDaTela(t(c, "rendaMaxima")), valorPorDependente: decimalDaTela(t(c, "valorPorDependente")), idadeLimite: Number.parseInt(t(c, "idadeLimite"), 10) });
      return r.tabelaId;
    }
    throw new Error(`Tipo de tabela desconhecido: ${tipo}. Nada foi gravado.`);
  });
}

/** Para a landing: quantas tabelas vigentes hoje, por tipo — o que falta para a folha calcular. */
export async function tabelasVigentesHoje(): Promise<readonly { readonly tipo: string; readonly vigente: boolean }[]> {
  const hoje = competenciaDeHoje();
  const todas = await todasAsTabelas();
  return OPCOES_DE_TIPO_DE_TABELA.map((o) => ({ tipo: o.rotulo, vigente: todas.some((x) => x.tipo === o.valor && vigenteNaCompetencia(x, hoje)) }));
}

export { sumMoney };

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPOS DE EMPENHO — como a folha vira despesa
// ═══════════════════════════════════════════════════════════════════════════════

export async function listarGruposDeEmpenho(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = (c.filtros["q"] ?? "").trim();
  const where: Prisma.GrupoDeEmpenhoDaFolhaWhereInput = q === "" ? {} : { OR: [{ codigo: { contains: q, mode: "insensitive" } }, { descricao: { contains: q, mode: "insensitive" } }] };
  const [total, linhas] = await Promise.all([
    prisma.grupoDeEmpenhoDaFolha.count({ where }),
    prisma.grupoDeEmpenhoDaFolha.findMany({
      where, orderBy: { codigo: c.direcao === "desc" ? "desc" : "asc" }, ...paginacao(c),
      select: { id: true, codigo: true, descricao: true, serie: true, porServidor: true, ficha: { select: { numero: true } }, rubricas: { select: { rubrica: { select: { codigo: true } } } } },
    }),
  ]);
  return {
    total,
    linhas: linhas.map((g) => ({
      id: g.id, codigo: g.codigo, descricao: g.descricao, ficha: String(g.ficha.numero),
      rubricas: g.rubricas.map((r) => r.rubrica.codigo).join(", ") || "—",
      como: g.porServidor ? `um por servidor · série ${g.serie}` : `um só para o grupo · série ${g.serie}`,
    })),
  };
}

export async function verGrupoDeEmpenho(id: string): Promise<DetalheLido | null> {
  const prisma = cliente();
  const g = await prisma.grupoDeEmpenhoDaFolha.findUnique({
    where: { id },
    select: {
      codigo: true, descricao: true, serie: true, porServidor: true, tipoEmpenho: true, categoriaOrdemCronologica: true, criadoEm: true, criadoPor: true,
      ficha: { select: { numero: true, naturezaDespesa: { select: { codigoCompleto: true, descricao: true } }, fonte: { select: { codigo: true } }, saldoDisponivel: true } },
      credor: { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } },
      rubricas: { select: { rubrica: { select: { codigo: true, descricao: true } } } },
      empenhos: { select: { id: true } },
    },
  });
  if (g === null) return null;
  return {
    titulo: `${g.codigo} — ${g.descricao}`,
    subtitulo: g.porServidor ? "um empenho por servidor" : `um empenho para o grupo, credor ${g.credor?.versoes[0]?.nome ?? g.credor?.documento ?? "—"}`,
    selos: [{ texto: g.porServidor ? "POR SERVIDOR" : "EMPENHO ÚNICO", tom: "neutro" }],
    dados: [
      { rotulo: "Ficha orçamentária", valor: `${g.ficha.numero} — ${g.ficha.naturezaDespesa.codigoCompleto} ${g.ficha.naturezaDespesa.descricao} · fonte ${g.ficha.fonte.codigo}` },
      { rotulo: "Saldo disponível da ficha", valor: toMoney(g.ficha.saldoDisponivel).toFixed(2), tipo: "dinheiro" },
      { rotulo: "Série do número do empenho", valor: g.serie, nota: "O número do empenho é série/competência/matrícula — determinístico, e é o que impede a apropriação repetida de duplicar a despesa." },
      { rotulo: "Tipo de empenho", valor: g.tipoEmpenho },
      { rotulo: "Categoria (art. 141)", valor: g.categoriaOrdemCronologica.replace(/_/g, " ").toLowerCase() },
      { rotulo: "Credor", valor: g.porServidor ? "o CPF de cada servidor" : `${g.credor?.versoes[0]?.nome ?? "—"} (${g.credor?.documento ?? "—"})` },
      { rotulo: "Rubricas que este grupo empenha", valor: g.rubricas.map((r) => `${r.rubrica.codigo} — ${r.rubrica.descricao}`).join(" · ") || "—", tipo: "longo" },
      { rotulo: "Empenhos já gerados por ele", valor: String(g.empenhos.length), tipo: "inteiro" },
      { rotulo: "Cadastrado em", valor: diaCivilBr(g.criadoEm), tipo: "data" },
      { rotulo: "Cadastrado por", valor: g.criadoPor },
    ],
    historico: [],
  };
}

/**
 * As opções do grupo, CHAVEADAS PELO NOME DO CAMPO (`fichaId`, `credorId`) — é assim que o guard
 * t20 do molde confere que todo `selecao` sem opções declaradas tem quem as preencha, mesmo
 * quando quem monta o formulário é uma ilha. As RUBRICAS saem por função própria: elas não são um
 * `selecao` do descritor, são caixas de marcação da ilha.
 */
export async function opcoesDoGrupoDeEmpenho(): Promise<OpcoesDoCadastro> {
  const prisma = cliente();
  const [fichas, credores, vpds, obrigacoes] = await Promise.all([
    prisma.fichaOrcamentaria.findMany({
      orderBy: { numero: "asc" }, take: 300,
      select: { id: true, numero: true, saldoDisponivel: true, naturezaDespesa: { select: { codigoCompleto: true, descricao: true } }, fonte: { select: { codigo: true } } },
    }),
    prisma.pessoa.findMany({ orderBy: { documento: "asc" }, take: 300, select: { id: true, documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } }),
    // ⚠️ O RECORTE É DO DESCRITOR, não uma lista de 500 contas ordenadas por código. A VPD de
    // pessoal vive em 3.1 e a obrigação de pessoal em 2.1.1 — oferecer o plano inteiro seria um
    // formulário bonito e inútil, e a primeira opção da lista mudaria o efeito contábil.
    prisma.contaPcasp.findMany({ where: { codigo: { startsWith: "3.1." }, analitica: true }, orderBy: { codigo: "asc" }, take: 300, select: { id: true, codigo: true, nome: true } }),
    prisma.contaPcasp.findMany({ where: { codigo: { startsWith: "2.1.1." }, analitica: true }, orderBy: { codigo: "asc" }, take: 300, select: { id: true, codigo: true, nome: true } }),
  ]);
  return {
    fichaId: fichas.map((f) => ({ valor: f.id, rotulo: `${f.numero} — ${f.naturezaDespesa.codigoCompleto} ${f.naturezaDespesa.descricao} · fonte ${f.fonte.codigo} · disponível ${toMoney(f.saldoDisponivel).toFixed(2)}` })),
    credorId: credores.map((p) => ({ valor: p.id, rotulo: `${p.versoes[0]?.nome ?? p.documento} (${formatarDocumento(p.documento)})` })),
    contaVariacaoId: vpds.map((c) => ({ valor: c.id, rotulo: `${c.codigo} — ${c.nome}` })),
    contaObrigacaoId: obrigacoes.map((c) => ({ valor: c.id, rotulo: `${c.codigo} — ${c.nome}` })),
  };
}

/** As rubricas de PROVENTO oferecidas à ilha, dizendo qual já está em outro grupo. */
export async function rubricasParaGrupoDeEmpenho(): Promise<readonly { readonly id: string; readonly rotulo: string; readonly jaNoGrupo: string | null }[]> {
  const rubricas = await cliente().rubrica.findMany({ where: { tipo: "PROVENTO" }, orderBy: { ordem: "asc" }, select: { id: true, codigo: true, descricao: true, grupoDeEmpenho: { select: { grupo: { select: { codigo: true } } } } } });
  return rubricas.map((r) => ({ id: r.id, rotulo: `${r.codigo} — ${r.descricao}`, jaNoGrupo: r.grupoDeEmpenho?.grupo.codigo ?? null }));
}

/** A ilha manda o cabeçalho e as rubricas marcadas (`rubricas.N.id`). */
export async function criarGrupoDeEmpenho(c: Campos, rubricaIds: readonly string[]): Promise<string> {
  return comEscritaAutenticada("CADASTRAR_GRUPO_DE_EMPENHO_DA_FOLHA", async (criadoPor) => {
    const porServidor = marcado(c, "porServidor");
    const r = await cadastrarGrupoDeEmpenhoDaFolha(cliente(), {
      codigo: t(c, "codigo"), descricao: t(c, "descricao"), fichaId: t(c, "fichaId"),
      categoriaOrdemCronologica: t(c, "categoriaOrdemCronologica") as "PRESTACAO_SERVICOS",
      tipoEmpenho: t(c, "tipoEmpenho") as "ORDINARIO", serie: t(c, "serie").toUpperCase(),
      porServidor,
      ...(porServidor ? {} : { credorId: t(c, "credorId") }),
      contaVariacaoId: t(c, "contaVariacaoId"), contaObrigacaoId: t(c, "contaObrigacaoId"),
      rubricaIds: [...rubricaIds], criadoPor,
    });
    return r.grupoId;
  });
}
