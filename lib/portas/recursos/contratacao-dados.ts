import { diaCivil, diaCivilBr, meioDiaCivil } from "../../../packages/datas/index.js";
import { toMoney, type Money } from "../../../packages/contracts/index.js";
import { normalizarDocumento, formatarDocumento } from "../../../packages/documento/index.js";
import type { Prisma } from "../../../prisma/generated/client/client.js";
import { MODALIDADES, vigenciaDoFormulario } from "../../../modules/m11-licitacoes/dominio.js";
import {
  cadastrarContrato,
  cadastrarProcesso,
  estornarMovimentoContratual,
  homologadoEm,
  homologarProcesso,
  registrarAditivo,
  situacaoDoProcesso,
  valorAtualizadoDoContrato,
  vigenciaFimDoContrato,
} from "../../../modules/m11-licitacoes/contratos.js";
import { criarM05DepsComContratos } from "../../../modules/m11-licitacoes/adapter-m05.js";
import { liberarReserva, reservarDotacao } from "../../../modules/m05-despesa/servico.js";
import type { ConsultaDoMolde } from "../../molde/consulta.js";
import { TAMANHO_DE_PAGINA } from "../../molde/consulta.js";
import type { LinhaDoHistorico } from "../../molde/tipos.js";
import { comEscritaAutenticada } from "../sessao";
import { cliente, PortaSemBancoError } from "../cliente";
import type { DetalheLido, OpcoesDoCadastro, PaginaDoMolde } from "./dados";

/**
 * ═══ OS DADOS DA CONTRATAÇÃO — M11, V4 §8 (Fila A) ═══
 *
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI. Processo não homologado, vigência antes da homologação, teto
 * da dispensa, supressão acima do saldo, reserva vinculada que exige contrato — tudo é do domínio,
 * dentro da transação, e a recusa sobe COMO VEIO.
 *
 * ⚠️ E NENHUM SALDO É SOMADO AQUI. O valor atualizado e a vigência do contrato vêm de
 * `valorAtualizadoDoContrato`/`vigenciaFimDoContrato` (M11); a situação do processo vem de
 * `situacaoDoProcesso(homologadoEm(...))`. A única conta desta porta é a do saldo EXIBIDO da
 * reserva (valor menos os empenhos que a consomem), que é orientação — quem decide é o M05.
 */

export { PortaSemBancoError };

type Campos = Readonly<Record<string, string>>;
const t = (c: Campos, k: string): string => (c[k] ?? "").trim();
const opcional = (c: Campos, k: string): string | undefined => (t(c, k) === "" ? undefined : t(c, k));
const dia = (c: Campos, k: string): Date => meioDiaCivil(t(c, k));

function paginacao(c: ConsultaDoMolde): { readonly skip: number; readonly take: number } {
  return { skip: (c.pagina - 1) * TAMANHO_DE_PAGINA, take: TAMANHO_DE_PAGINA };
}

const ROTULO_DA_SITUACAO: Readonly<Record<string, string>> = { EM_ANDAMENTO: "EM ANDAMENTO", HOMOLOGADO: "HOMOLOGADO" };
const ROTULO_DA_HIPOTESE: Readonly<Record<string, string>> = {
  POR_VALOR_OBRAS: "por valor — obras (art. 75, I)",
  POR_VALOR_COMPRAS: "por valor — compras e serviços (art. 75, II)",
  OUTRAS: "outras hipóteses do art. 75",
};
const ROTULO_DO_MOVIMENTO: Readonly<Record<string, string>> = {
  ACRESCIMO_VALOR: "Acréscimo de valor",
  SUPRESSAO_VALOR: "Supressão de valor",
  PRORROGACAO_PRAZO: "Prorrogação de prazo",
  ESTORNO_ACRESCIMO_VALOR: "Estorno de acréscimo",
  ESTORNO_SUPRESSAO_VALOR: "Estorno de supressão",
  ESTORNO_PRORROGACAO_PRAZO: "Estorno de prorrogação",
};

function modalidade(codigo: string): string {
  const m = MODALIDADES[codigo as keyof typeof MODALIDADES];
  return m === undefined ? codigo : m.nome;
}

// ═══════════════════════════════════════════════════════════════════════════
// AS RESERVAS DE UM PROCESSO — vivas, com o saldo exibido
// ═══════════════════════════════════════════════════════════════════════════

interface ReservaLida {
  readonly id: string;
  readonly fichaNumero: number;
  readonly valor: Money;
  readonly consumido: Money;
  readonly liberada: boolean;
  readonly historico: string;
  readonly criadoEm: Date;
  readonly criadoPor: string;
}

async function reservasDoProcesso(processoId: string): Promise<readonly ReservaLida[]> {
  const linhas = await cliente().reservaDotacao.findMany({
    where: { processoId, estornoDeId: null },
    orderBy: { criadoEm: "asc" },
    select: {
      id: true, valor: true, historico: true, criadoEm: true, criadoPor: true,
      ficha: { select: { numero: true } },
      estornos: { select: { id: true } },
      empenhos: { select: { empenho: { select: { valor: true } } } },
    },
  });
  return linhas.map((r) => ({
    id: r.id,
    fichaNumero: r.ficha.numero,
    valor: toMoney(r.valor.toFixed(2)),
    consumido: r.empenhos.reduce((s, e) => s.plus(e.empenho.valor.toFixed(2)), toMoney("0")),
    liberada: r.estornos.length > 0,
    historico: r.historico,
    criadoEm: r.criadoEm,
    criadoPor: r.criadoPor,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// O PROCESSO
// ═══════════════════════════════════════════════════════════════════════════

export async function listarProcessos(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = (c.filtros["q"] ?? "").trim();
  const mod = c.filtros["modalidade"] ?? "";
  const sit = c.filtros["situacao"] ?? "";
  const where: Prisma.ProcessoLicitatorioWhereInput = {};
  if (q !== "") where.OR = [{ numeroProcesso: { contains: q, mode: "insensitive" } }, { objeto: { contains: q, mode: "insensitive" } }];
  if (mod !== "") where.modalidade = mod as keyof typeof MODALIDADES;
  // A situação é DERIVADA (cadastro OU evento de homologação): o filtro repete a derivação no `where`.
  if (sit === "HOMOLOGADO") where.OR = [...(where.OR ?? []), { dataHomologacao: { not: null } }, { homologacao: { isNot: null } }];
  if (sit === "EM_ANDAMENTO") where.AND = [{ dataHomologacao: null }, { homologacao: { is: null } }];
  const ordem: Prisma.ProcessoLicitatorioOrderByWithRelationInput = c.ordem === "valorLicitado" ? { valorLicitado: c.direcao } : { numeroProcesso: c.direcao };
  const [total, linhas] = await Promise.all([
    prisma.processoLicitatorio.count({ where }),
    prisma.processoLicitatorio.findMany({
      where,
      orderBy: ordem,
      ...paginacao(c),
      select: { id: true, numeroProcesso: true, modalidade: true, objeto: true, valorLicitado: true, dataHomologacao: true, homologacao: { select: { data: true } }, _count: { select: { contratos: true } } },
    }),
  ]);
  return {
    total,
    linhas: linhas.map((p) => ({
      id: p.id,
      numeroProcesso: p.numeroProcesso,
      modalidade: modalidade(p.modalidade),
      objeto: p.objeto.length > 80 ? `${p.objeto.slice(0, 77)}…` : p.objeto,
      valorLicitado: p.valorLicitado.toFixed(2),
      situacao: ROTULO_DA_SITUACAO[situacaoDoProcesso(p.dataHomologacao ?? p.homologacao?.data ?? null)] ?? "",
      contratos: String(p._count.contratos),
    })),
  };
}

export async function verProcesso(id: string): Promise<DetalheLido | null> {
  const prisma = cliente();
  const p = await prisma.processoLicitatorio.findUnique({
    where: { id },
    select: {
      numeroProcesso: true, modalidade: true, objeto: true, valorLicitado: true, hipoteseDispensa: true, dataHomologacao: true, criadoEm: true, criadoPor: true,
      homologacao: { select: { id: true, data: true, criadoEm: true, criadoPor: true } },
      contratos: { orderBy: { criadoEm: "asc" }, select: { id: true, numeroContrato: true, contratadoNome: true, contratadoDocumento: true, valorInicial: true, vigenciaInicio: true, criadoEm: true, criadoPor: true } },
    },
  });
  if (p === null) return null;
  const homologacao = await homologadoEm(prisma, id);
  const situacao = situacaoDoProcesso(homologacao);
  const reservas = await reservasDoProcesso(id);
  const contratos = await Promise.all(p.contratos.map(async (c) => ({ ...c, atualizado: await valorAtualizadoDoContrato(prisma, c.id) })));
  const totalContratado = contratos.reduce((s, c) => s.plus(c.atualizado), toMoney("0"));
  const reservadoVivo = reservas.filter((r) => !r.liberada).reduce((s, r) => s.plus(r.valor.minus(r.consumido)), toMoney("0"));
  const historico: LinhaDoHistorico[] = [
    ...(p.homologacao === null
      ? []
      : [{ id: p.homologacao.id, oQue: "Homologação do processo", quando: diaCivilBr(p.homologacao.data), registradoEm: diaCivilBr(p.homologacao.criadoEm), por: p.homologacao.criadoPor, motivo: "Homologação registrada após o cadastro do processo." }]),
    ...reservas.map((r) => ({
      id: r.id,
      oQue: `Reserva de dotação na ficha ${r.fichaNumero}${r.liberada ? " — liberada" : ""}`,
      quando: diaCivilBr(r.criadoEm),
      registradoEm: diaCivilBr(r.criadoEm),
      por: r.criadoPor,
      motivo: `${r.historico} · consumido por empenhos ${r.consumido.toFixed(2)} · saldo ${r.liberada ? "0.00 (liberada)" : r.valor.minus(r.consumido).toFixed(2)}`,
      valor: r.valor.toFixed(2),
      estornado: r.liberada,
    })),
    ...contratos.map((c) => ({
      id: c.id,
      oQue: `Contrato ${c.numeroContrato} — ${c.contratadoNome} (${formatarDocumento(c.contratadoDocumento)})`,
      quando: diaCivilBr(c.vigenciaInicio),
      registradoEm: diaCivilBr(c.criadoEm),
      por: c.criadoPor,
      motivo: `Valor inicial ${c.valorInicial.toFixed(2)} · atualizado ${c.atualizado.toFixed(2)}`,
      valor: c.atualizado.toFixed(2),
      href: `/licitacoes/contratos/${c.id}`,
      hrefRotulo: "Abrir o contrato",
    })),
  ];
  return {
    titulo: `Processo ${p.numeroProcesso}`,
    subtitulo: `${modalidade(p.modalidade)} · ${p.objeto}`,
    selos: [
      { texto: ROTULO_DA_SITUACAO[situacao] ?? situacao, tom: situacao === "HOMOLOGADO" ? "ok" : "alerta" },
      { texto: `${p.contratos.length} contrato(s)`, tom: "neutro" },
      ...(reservadoVivo.greaterThan(0) ? [{ texto: `saldo reservado ${reservadoVivo.toFixed(2)}`, tom: "neutro" as const }] : []),
    ],
    dados: [
      { rotulo: "Número", valor: p.numeroProcesso },
      { rotulo: "Modalidade", valor: `${modalidade(p.modalidade)} — ${MODALIDADES[p.modalidade as keyof typeof MODALIDADES]?.base ?? ""}` },
      { rotulo: "Hipótese de dispensa", valor: p.hipoteseDispensa === null ? "— (não é dispensa)" : ROTULO_DA_HIPOTESE[p.hipoteseDispensa] ?? p.hipoteseDispensa },
      { rotulo: "Objeto", valor: p.objeto, tipo: "longo" },
      { rotulo: "Valor licitado", valor: p.valorLicitado.toFixed(2), tipo: "dinheiro", nota: "Valor estimado da contratação. O valor contratado resulta da proposta vencedora." },
      { rotulo: "Homologação", valor: homologacao === null ? "Ainda não homologado" : diaCivilBr(homologacao), tipo: "data", nota: "Data informada no cadastro ou registrada na homologação." },
      { rotulo: "Total contratado (atualizado)", valor: totalContratado.toFixed(2), tipo: "dinheiro" },
      { rotulo: "Saldo da reserva", valor: reservadoVivo.toFixed(2), tipo: "dinheiro", nota: "Valor reservado, descontados os empenhos emitidos e as liberações. A disponibilidade é conferida na emissão do empenho." },
      { rotulo: "Cadastrado em", valor: diaCivilBr(p.criadoEm), tipo: "data" },
      { rotulo: "Cadastrado por", valor: p.criadoPor },
    ],
    historico,
  };
}

/** As opções do processo: as fichas do exercício (para reservar) e — CONTEXTUAL — as reservas vivas DESTE processo. */
export async function opcoesDoProcesso(processoId?: string): Promise<OpcoesDoCadastro> {
  const prisma = cliente();
  const [fichas, reservas] = await Promise.all([
    prisma.fichaOrcamentaria.findMany({
      orderBy: [{ exercicio: "desc" }, { numero: "asc" }],
      take: 500,
      select: { id: true, exercicio: true, numero: true, saldoDisponivel: true, unidadeOrc: { select: { codigo: true } }, naturezaDespesa: { select: { codigoCompleto: true } }, fonte: { select: { codigo: true } } },
    }),
    processoId === undefined ? Promise.resolve([] as readonly ReservaLida[]) : reservasDoProcesso(processoId),
  ]);
  return {
    fichaId: fichas.map((f) => ({ valor: f.id, rotulo: `${f.exercicio} · ficha ${f.numero} · UO ${f.unidadeOrc.codigo} · ${f.naturezaDespesa.codigoCompleto} · fonte ${f.fonte.codigo} · saldo ${f.saldoDisponivel.toFixed(2)}` })),
    reservaId: reservas.filter((r) => !r.liberada).map((r) => ({ valor: r.id, rotulo: `Ficha ${r.fichaNumero} · ${r.valor.toFixed(2)} (saldo ${r.valor.minus(r.consumido).toFixed(2)}) · ${r.historico}` })),
  };
}

export async function criarProcesso(c: Campos): Promise<void> {
  await comEscritaAutenticada("CADASTRAR_PROCESSO", (criadoPor) =>
    cadastrarProcesso(cliente(), {
      numeroProcesso: t(c, "numeroProcesso"),
      modalidade: t(c, "modalidade") as keyof typeof MODALIDADES,
      objeto: t(c, "objeto"),
      valorLicitado: t(c, "valorLicitado"),
      ...(opcional(c, "dataHomologacao") !== undefined ? { dataHomologacao: dia(c, "dataHomologacao") } : {}),
      ...(opcional(c, "hipoteseDispensa") !== undefined ? { hipoteseDispensa: t(c, "hipoteseDispensa") as "POR_VALOR_OBRAS" | "POR_VALOR_COMPRAS" | "OUTRAS" } : {}),
      criadoPor,
    })
  );
}

export async function acaoDoProcesso(acao: string, processoId: string, c: Campos): Promise<void> {
  switch (acao) {
    case "homologar":
      await comEscritaAutenticada("HOMOLOGAR_PROCESSO", (criadoPor) => homologarProcesso(cliente(), { processoId, data: dia(c, "data"), criadoPor }));
      return;
    case "reservar":
      await comEscritaAutenticada("RESERVAR_DOTACAO", (criadoPor) =>
        reservarDotacao({ fichaId: t(c, "fichaId"), valor: t(c, "valor"), historico: t(c, "historico"), processoId, criadoPor }, criarM05DepsComContratos(cliente()))
      );
      return;
    case "liberar-reserva": {
      // ⚠️ A reserva tem de ser DESTE processo: o select já é contextual, mas quem confere é o servidor.
      const reserva = await cliente().reservaDotacao.findUnique({ where: { id: t(c, "reservaId") }, select: { processoId: true } });
      if (reserva === null || reserva.processoId !== processoId) throw new Error("A reserva escolhida não pertence a este processo. Nada foi gravado.");
      await comEscritaAutenticada("LIBERAR_RESERVA", (criadoPor) =>
        liberarReserva({ reservaId: t(c, "reservaId"), historico: t(c, "historico"), criadoPor }, criarM05DepsComContratos(cliente()))
      );
      return;
    }
    case "contratar":
      await comEscritaAutenticada("CADASTRAR_CONTRATO", (criadoPor) =>
        cadastrarContrato(cliente(), {
          numeroContrato: t(c, "numeroContrato"),
          processoId,
          contratadoDocumento: normalizarDocumento(t(c, "contratadoDocumento")),
          contratadoNome: t(c, "contratadoNome"),
          valorInicial: t(c, "valorInicial"),
          ...vigenciaDoFormulario(t(c, "vigenciaInicio"), t(c, "vigenciaFimInicial")),
          categoriaOrdemCronologica: t(c, "categoriaOrdemCronologica") as "FORNECIMENTO_BENS" | "LOCACAO" | "PRESTACAO_SERVICOS" | "REALIZACAO_OBRAS",
          criadoPor,
        })
      );
      return;
    default:
      throw new Error(`Ação "${acao}" não existe neste cadastro. Nada foi gravado.`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// O CONTRATO
// ═══════════════════════════════════════════════════════════════════════════

export async function listarContratos(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = (c.filtros["q"] ?? "").trim();
  const processo = (c.filtros["processo"] ?? "").trim();
  const sit = c.filtros["situacao"] ?? "";
  const where: Prisma.ContratoWhereInput = {};
  if (q !== "") where.OR = [{ numeroContrato: { contains: q, mode: "insensitive" } }, { contratadoNome: { contains: q, mode: "insensitive" } }];
  if (processo !== "") where.processo = { OR: [{ id: processo }, { numeroProcesso: processo }] };
  const [total, linhas] = await Promise.all([
    prisma.contrato.count({ where }),
    prisma.contrato.findMany({
      where,
      orderBy: { numeroContrato: c.direcao },
      ...paginacao(c),
      select: { id: true, numeroContrato: true, contratadoNome: true, processo: { select: { numeroProcesso: true } } },
    }),
  ]);
  const hoje = new Date();
  const derivadas = await Promise.all(
    linhas.map(async (x) => {
      const [atualizado, fim] = await Promise.all([valorAtualizadoDoContrato(prisma, x.id), vigenciaFimDoContrato(prisma, x.id)]);
      return { ...x, atualizado, fim, situacao: fim.getTime() >= hoje.getTime() ? "VIGENTE" : "ENCERRADO" };
    })
  );
  // ⚠️ O filtro de situação é sobre a VIGÊNCIA DERIVADA — só dá para aplicá-lo depois de derivar. A
  // página fica curta e honesta: o total é o das linhas que passaram.
  const filtradas = sit === "" ? derivadas : derivadas.filter((x) => x.situacao === sit);
  return {
    total: sit === "" ? total : filtradas.length,
    linhas: filtradas.map((x) => ({
      id: x.id,
      numeroContrato: x.numeroContrato,
      processo: x.processo.numeroProcesso,
      contratadoNome: x.contratadoNome,
      valorAtualizado: x.atualizado.toFixed(2),
      vigenciaFim: diaCivilBr(x.fim),
      situacao: x.situacao,
    })),
  };
}

export async function verContrato(id: string): Promise<DetalheLido | null> {
  const prisma = cliente();
  const x = await prisma.contrato.findUnique({
    where: { id },
    select: {
      numeroContrato: true, contratadoDocumento: true, contratadoNome: true, valorInicial: true, vigenciaInicio: true, vigenciaFimInicial: true, categoriaOrdemCronologica: true, objeto: true, fiscalNome: true, fiscalCpf: true, fiscalDesignacao: true, criadoEm: true, criadoPor: true,
      processo: { select: { id: true, numeroProcesso: true, modalidade: true } },
      movimentos: { orderBy: { criadoEm: "asc" }, select: { id: true, tipo: true, valor: true, dias: true, data: true, numeroAditivo: true, motivo: true, estornoDeId: true, criadoEm: true, criadoPor: true, estornos: { select: { id: true } } } },
      empenhos: { orderBy: { data: "asc" }, select: { id: true, numero: true, valor: true, data: true, criadoPor: true, criadoEm: true } },
    },
  });
  if (x === null) return null;
  const [atualizado, fim] = await Promise.all([valorAtualizadoDoContrato(prisma, id), vigenciaFimDoContrato(prisma, id)]);
  // Dia civil do ente: no último dia da vigência o contrato continua vigente até o fim DELE, não até o instante gravado.
  const vigente = diaCivil(fim) >= diaCivil(new Date());
  const empenhado = x.empenhos.reduce((s, e) => s.plus(e.valor.toFixed(2)), toMoney("0"));
  return {
    titulo: `Contrato ${x.numeroContrato}`,
    subtitulo: `${x.contratadoNome} (${formatarDocumento(x.contratadoDocumento)}) · processo ${x.processo.numeroProcesso}`,
    selos: [
      { texto: vigente ? "VIGENTE" : "ENCERRADO", tom: vigente ? "ok" : "neutro" },
      { texto: `${x.movimentos.filter((m) => m.estornoDeId === null && m.estornos.length === 0).length} aditivo(s) vivo(s)`, tom: "neutro" },
      { texto: `${x.empenhos.length} empenho(s)`, tom: "neutro" },
    ],
    dados: [
      { rotulo: "Processo", valor: `${x.processo.numeroProcesso} — ${modalidade(x.processo.modalidade)}` },
      { rotulo: "Contratado", valor: `${x.contratadoNome} · ${formatarDocumento(x.contratadoDocumento)}` },
      { rotulo: "Objeto", valor: x.objeto ?? "— (mesmo objeto do processo)", tipo: "longo" },
      { rotulo: "Valor inicial", valor: x.valorInicial.toFixed(2), tipo: "dinheiro" },
      { rotulo: "Valor atualizado", valor: atualizado.toFixed(2), tipo: "dinheiro", nota: "Valor inicial ajustado pelos aditivos registrados." },
      { rotulo: "Empenhado no contrato", valor: empenhado.toFixed(2), tipo: "dinheiro", nota: "Valor bruto dos empenhos vinculados a este contrato." },
      { rotulo: "Vigência inicial", valor: `${diaCivilBr(x.vigenciaInicio)} a ${diaCivilBr(x.vigenciaFimInicial)}` },
      { rotulo: "Fim da vigência atualizado", valor: diaCivilBr(fim), tipo: "data", nota: "Considera as prorrogações registradas." },
      { rotulo: "Categoria (art. 141)", valor: x.categoriaOrdemCronologica },
      // ⚠️ O campo em texto é carga anterior (V7 M2.1). Com o rótulo "Fiscal do contrato" e "(não designado)", a tela
      // contradizia a designação vigente mostrada no acompanhamento — achado da captura do percurso sobre 5937f41.
      { rotulo: "Fiscal em texto (registro anterior)", valor: x.fiscalNome === null ? "— (sem registro em texto)" : `${x.fiscalNome}${x.fiscalCpf === null ? "" : ` · ${formatarDocumento(x.fiscalCpf)}`}${x.fiscalDesignacao === null ? "" : ` · ${x.fiscalDesignacao}`}`, nota: "Quem gere e fiscaliza, com ato e vigência, está em “Gestor e fiscais”, no acompanhamento abaixo." },
      { rotulo: "Cadastrado em", valor: diaCivilBr(x.criadoEm), tipo: "data" },
      { rotulo: "Cadastrado por", valor: x.criadoPor },
    ],
    historico: [
      ...x.movimentos.map((m) => ({
        id: m.id,
        oQue: `${ROTULO_DO_MOVIMENTO[m.tipo] ?? m.tipo} — ${m.numeroAditivo}${m.dias === null ? "" : ` · ${m.dias} dia(s)`}`,
        quando: diaCivilBr(m.data),
        registradoEm: diaCivilBr(m.criadoEm),
        por: m.criadoPor,
        motivo: m.motivo,
        ...(m.valor === null ? {} : { valor: m.valor.toFixed(2) }),
        estornado: m.estornos.length > 0,
      })),
      ...x.empenhos.map((e) => ({
        id: e.id,
        oQue: `Empenho ${e.numero}`,
        quando: diaCivilBr(e.data),
        registradoEm: diaCivilBr(e.criadoEm),
        por: e.criadoPor,
        motivo: "Empenho vinculado a este contrato na emissão.",
        valor: e.valor.toFixed(2),
        href: `/despesa/empenhos/${e.id}`,
        hrefRotulo: "Abrir o dossiê do empenho",
      })),
    ],
  };
}

/** As opções do contrato — CONTEXTUAIS: os aditivos vivos DESTE contrato, para estornar. */
export async function opcoesDoContrato(contratoId?: string): Promise<OpcoesDoCadastro> {
  const movimentos =
    contratoId === undefined
      ? []
      : await cliente().movimentoContratual.findMany({
          where: { contratoId, estornoDeId: null, estornos: { none: {} } },
          orderBy: { criadoEm: "asc" },
          select: { id: true, tipo: true, numeroAditivo: true, valor: true, dias: true },
        });
  return {
    movimentoId: movimentos.map((m) => ({ valor: m.id, rotulo: `${m.numeroAditivo} — ${ROTULO_DO_MOVIMENTO[m.tipo] ?? m.tipo}${m.valor === null ? "" : ` ${m.valor.toFixed(2)}`}${m.dias === null ? "" : ` ${m.dias} dia(s)`}` })),
  };
}

export async function acaoDoContrato(acao: string, contratoId: string, c: Campos): Promise<void> {
  switch (acao) {
    case "aditivo":
      await comEscritaAutenticada("REGISTRAR_ADITIVO", (criadoPor) =>
        registrarAditivo(cliente(), {
          contratoId,
          tipo: t(c, "tipo") as "ACRESCIMO_VALOR" | "SUPRESSAO_VALOR" | "PRORROGACAO_PRAZO",
          ...(opcional(c, "valor") !== undefined ? { valor: t(c, "valor") } : {}),
          ...(opcional(c, "dias") !== undefined ? { dias: Number.parseInt(t(c, "dias"), 10) } : {}),
          data: dia(c, "data"),
          numeroAditivo: t(c, "numeroAditivo"),
          motivo: t(c, "motivo"),
          criadoPor,
        })
      );
      return;
    case "estornar-movimento": {
      const m = await cliente().movimentoContratual.findUnique({ where: { id: t(c, "movimentoId") }, select: { contratoId: true } });
      if (m === null || m.contratoId !== contratoId) throw new Error("O aditivo escolhido não pertence a este contrato. Nada foi gravado.");
      await comEscritaAutenticada("ESTORNAR_MOVIMENTO_CONTRATUAL", (criadoPor) =>
        estornarMovimentoContratual(cliente(), { movimentoId: t(c, "movimentoId"), data: dia(c, "data"), motivo: t(c, "motivo"), criadoPor })
      );
      return;
    }
    default:
      throw new Error(`Ação "${acao}" não existe neste cadastro. Nada foi gravado.`);
  }
}
