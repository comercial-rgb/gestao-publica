import { formatarMoeda } from "../../format/moeda";
import { diaCivilBr, meioDiaCivil } from "../../../packages/datas/index.js";
import { Decimal, toMoney, sumMoney } from "../../../packages/contracts/index.js";
import { formatarDocumento } from "../../../packages/documento/index.js";
import type { Prisma } from "../../../prisma/generated/client/client.js";
import { NATUREZA_DO_TIPO_DE_FOLHA, situacaoDaFolha, vigenteNaCompetencia, type SituacaoDaFolha } from "../../../modules/m33-folha/dominio.js";
import { situacaoDoVinculo, type EventoDoVinculo } from "../../../modules/m32-pessoal/dominio.js";
import { apropriacaoDaFolha, apropriarFolha, cadastrarGrupoDeEmpenhoDaFolha, definirContasDaLiquidacaoDoGrupo } from "../../../modules/m33-folha/apropriacao.js";
import { elegibilidadeDosAtosDaFolha } from "../../../modules/m33-folha/elegibilidade.js";
import { criterioDoAbatimentoNoCalculo } from "../../../modules/m33-folha/decimo-terceiro-servico.js";
import { conferirDeclaracao, resolverMatriculas } from "../../../modules/m33-folha/declaracao-da-selecao.js";
import type { SelecaoDoCalculo } from "../../../modules/m33-folha/abrangencia.js";
import { lerMemoriaDoContracheque, type MemoriaLida } from "../../../modules/m33-folha/memoria-do-contracheque.js";
import {
  certificacaoDaFolha,
  certificarFolha,
  designacaoVigenteEm,
  retratoDosAtosDaFolha,
  designarNaFolha,
  devolverFolhaParaCorrecao,
  liquidacaoDaFolha,
  liquidarFolha,
  revogarDesignacaoNaFolha,
  type SituacaoDaCertificacao,
} from "../../../modules/m33-folha/certificacao.js";
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
import type { DadoDoDetalhe, DisponibilidadeDoRegistro, LinhaDoHistorico } from "../../molde/tipos.js";
import { apresentar, RegistroMudouError } from "../disponibilidade";
import { disponibilidadeDosEncargos } from "./encargos-dados";
import { ajustarEncargosDaFolha, apropriarEncargosDaFolha, apurarEncargosDaFolha, certificarEncargosDaFolha, liquidarEncargosDaFolha, retratoDosEncargos } from "../../../modules/m33-folha/encargos-servico.js";
import { comEscritaAutenticada, exigirSessao } from "../sessao";
import { cliente, PortaSemBancoError } from "../cliente";
import type { DetalheLido, OpcoesDoCadastro, PaginaDoMolde } from "./dados";
import { decimalDaTela } from "./pessoal-dados";
import { OPCOES_DE_TIPO_DE_TABELA, OPCOES_DE_TIPO_DE_ATO } from "./folha";
import { cadastrarParametroDoDecimoTerceiro } from "../../../modules/m33-folha/decimo-terceiro-servico.js";
import { cadastrarParametroDoAdiantamentoSalarial } from "../../../modules/m33-folha/adiantamento-salarial-servico.js";
import { RAMO_DO_ADIANTAMENTO_CONCEDIDO, SEMANTICA_DA_BASE, type BaseDoAdiantamentoSalarial } from "../../../modules/m33-folha/adiantamento-salarial.js";
import type { TipoDeFolha } from "../../../modules/m33-folha/dominio.js";

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
const ROTULO_DA_CERTIFICACAO: Readonly<Record<SituacaoDaCertificacao, string>> = {
  PENDENTE: "PENDENTE DE ATESTO",
  CERTIFICADA: "CERTIFICADA",
  DEVOLVIDA: "DEVOLVIDA PARA CORREÇÃO",
  SUPERADA: "SUPERADA (atesto de cálculo anterior)",
};

/**
 * O DIA CIVIL DO ENTE a partir do campo `data` do formulário (`AAAA-MM-DD`).
 *
 * ⚠️ MEIO-DIA, e não meia-noite: `new Date("2026-06-02")` é UTC, e às 21h de Campina Grande a
 * data do ato viraria o dia seguinte. O meio-dia civil sobrevive a qualquer fuso do Brasil.
 */
function diaDoCampo(c: Campos, nome: string): Date {
  return meioDiaCivil(t(c, nome));
}
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
  /**
   * ⚠️ AS DIMENSÕES SÃO SEPARADAS, e é de propósito: cálculo, certificação, apropriação e
   * liquidação são fatos distintos, e uma coluna única que os misturasse faria a tela dizer
   * "liquidada" sobre uma folha que ninguém atestou. `null` = a folha nem está fechada.
   */
  readonly certificacao: {
    readonly situacao: SituacaoDaCertificacao;
    readonly fatos: readonly { readonly id: string; readonly tipo: string; readonly motivo: string | null; readonly sha256: string; readonly vinculos: number; readonly totalLiquido: string; readonly ato: string; readonly responsavel: string; readonly criadoPor: string; readonly quando: string }[];
  } | null;
  /** `null` = a folha não foi apropriada; sem empenho não há o que liquidar. */
  readonly liquidacao: {
    readonly liquidadas: number;
    readonly pendentes: number;
    readonly total: string;
    /** Por número de empenho — a tela dos empenhos mostra qual já virou obrigação. */
    readonly porEmpenho: Readonly<Record<string, { readonly numero: string; readonly responsavelAtesto: string; readonly data: string }>>;
  } | null;
  readonly contracheques: readonly { readonly vinculoId: string; readonly matricula: string; readonly servidor: string; readonly regime: string; readonly dias: number; readonly proventos: string; readonly descontos: string; readonly liquido: string }[];
  /**
   * ⚠️ V11 V9.3 — NÃO-NULO = ESTA FOLHA É SIMULAÇÃO, NÃO APURAÇÃO APROVADA.
   *
   * O cálculo abateu 1ª parcela e o parâmetro sob o qual ele rodou não declarava sob que critério
   * o adiantamento podia ser abatido. A memória do contracheque já dizia isso desde esta rodada;
   * o que faltava era a TELA dizer — quem olha o detalhe tem de ver, antes de mandar apropriar,
   * que aquilo não é apuração aprovada. A apropriação recusa pelo mesmo motivo, com o mesmo código.
   */
  readonly simulacaoDoAbatimento: { readonly totalAbatido: string } | null;
}

export async function verFolha(id: string): Promise<FolhaLida | null> {
  const prisma = cliente();
  const f = await prisma.folhaDePagamento.findUnique({ where: { id }, select: SELECAO_DA_FOLHA });
  if (f === null) return null;
  const d = derivarFolha(f);
  const apropriada = await apropriacaoDaFolha(prisma, id);
  const [certificada, liquidada] = await Promise.all([certificacaoDaFolha(prisma, id), liquidacaoDaFolha(prisma, id)]);
  /**
   * ⚠️ LÊ-SE DO CÁLCULO VIVO, E NÃO SÓ DO FECHADO. A folha calculada e ainda aberta já é a
   * simulação; esperar o fechamento para avisar deixaria o operador descobrir o problema com o
   * cálculo congelado e a folha pronta para apropriar. O `catch` devolve `null` porque uma tela
   * que some é pior que uma tela sem o aviso — e quem BLOQUEIA de verdade é `apropriarFolha`,
   * fail-closed e sem `catch` nenhum.
   */
  const simulacaoDoAbatimento =
    f.tipo === "DECIMO_TERCEIRO" && d.vivo !== null
      ? await criterioDoAbatimentoNoCalculo(prisma, d.vivo.id).then(
          (c) => (c.abateu && c.criterioDeclarado === null ? { totalAbatido: c.totalAbatido } : null),
          () => null
        )
      : null;
  const contracheques = d.vivo === null ? [] : await prisma.contracheque.findMany({
    where: { calculoId: d.vivo.id }, orderBy: { vinculo: { matricula: "asc" } },
    select: { vinculoId: true, regime: true, diasComputados: true, totalProventos: true, totalDescontos: true, liquido: true, vinculo: { select: { matricula: true, servidor: { select: { nomeSocial: true, pessoa: { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } } } } } } },
  });
  const dados: DadoDoDetalhe[] = [
    { rotulo: "Competência", valor: f.competencia },
    { rotulo: "Tipo", valor: f.tipo },
    { rotulo: "Situação", valor: ROTULO_DA_SITUACAO[d.situacao] },
    ...(simulacaoDoAbatimento === null
      ? []
      : [{
          rotulo: "Natureza da apuração",
          valor: `Simulação, sem apuração aprovada (${simulacaoDoAbatimento.totalAbatido} de abatimento)`,
          nota:
            "O parâmetro do 13º deste exercício não informa a situação que o adiantamento deve ter alcançado para " +
            "ser abatido; por isso, o abatimento considerou o fechamento da folha de adiantamento, sem respaldo em ato " +
            "do ente. O fechamento e a apropriação desta folha ficam bloqueados até que o critério seja informado, com " +
            "o ato que o fundamenta, em Folha > Parâmetros do 13º, e a folha seja recalculada.",
        }]),
    ...(d.vivo === null ? [] : [
      { rotulo: d.situacao === "FECHADA" ? "Cálculo fechado" : "Cálculo vigente", valor: `nº ${d.vivo.numero} · ${d.vivo.contracheques} contracheque(s)` },
      { rotulo: "Proventos", valor: toMoney(d.vivo.totalProventos).toFixed(2), tipo: "dinheiro" as const },
      { rotulo: "Descontos", valor: toMoney(d.vivo.totalDescontos).toFixed(2), tipo: "dinheiro" as const },
      { rotulo: "Líquido", valor: toMoney(d.vivo.totalLiquido).toFixed(2), tipo: "dinheiro" as const },
      { rotulo: "Código de integridade do cálculo", valor: d.vivo.sha256, nota: "Gerado a partir dos contracheques; permite verificar que o cálculo não foi alterado." },
    ]),
    ...(f.fechamento === null ? [] : [{ rotulo: "Fechada em", valor: `${diaCivilBr(f.fechamento.criadoEm)} por ${f.fechamento.criadoPor}` }]),
    ...(apropriada === null
      ? f.fechamento === null ? [] : [{ rotulo: "Apropriação contábil", valor: "não apropriada", nota: "A apropriação gera os empenhos desta folha conforme os grupos de empenho cadastrados." }]
      : [{ rotulo: "Apropriação contábil", valor: `${apropriada.empenhos.length} empenho(s), ${apropriada.total.toFixed(2)} — empenhos de ${diaCivilBr(apropriada.dataDoEmpenho)}, por ${apropriada.criadoPor}`, nota: "Empenha-se o valor bruto; as retenções são tratadas no pagamento." }]),
    ...(certificada === null
      ? []
      : [{
          rotulo: "Certificação",
          valor: ROTULO_DA_CERTIFICACAO[certificada.situacao],
          nota: "Atesto do responsável designado sobre o cálculo conferido: pendente, certificada, devolvida para correção ou superada por novo cálculo.",
        }]),
    ...(liquidada === null
      ? []
      : [{
          rotulo: "Liquidação",
          valor:
            liquidada.pendentes === 0
              ? `${liquidada.liquidadas} de ${liquidada.liquidadas} empenho(s), ${liquidada.total.toFixed(2)}`
              : `${liquidada.liquidadas} de ${liquidada.liquidadas + liquidada.pendentes} empenho(s) — ${liquidada.pendentes} pendente(s)`,
          nota: "Empenho, liquidação e pagamento são etapas distintas: folha liquidada não é paga até o registro do pagamento.",
        }]),
    { rotulo: "Aberta em", valor: diaCivilBr(f.criadoEm), tipo: "data" as const },
    { rotulo: "Aberta por", valor: f.criadoPor },
  ];
  const historico: LinhaDoHistorico[] = [
    { id: `abertura-${f.id}`, oQue: "Folha aberta", quando: diaCivilBr(f.criadoEm), registradoEm: diaCivilBr(f.criadoEm), por: f.criadoPor },
    ...f.calculos.flatMap((c) => [
      { id: c.id, oQue: `Cálculo nº ${c.numero} · ${c.contracheques} contracheque(s)`, quando: diaCivilBr(c.criadoEm), registradoEm: diaCivilBr(c.criadoEm), por: c.criadoPor, motivo: [c.motivo, `código de integridade ${c.sha256.slice(0, 12)}…`].filter((x) => x !== null).join(" · "), valor: toMoney(c.totalLiquido).toFixed(2), ...(c.cancelamento !== null ? { estornado: true } : {}) },
      ...(c.cancelamento === null ? [] : [{ id: c.cancelamento.id, oQue: `Cancelamento do cálculo nº ${c.numero}`, quando: diaCivilBr(c.cancelamento.criadoEm), registradoEm: diaCivilBr(c.cancelamento.criadoEm), por: c.cancelamento.criadoPor, motivo: c.cancelamento.motivo }]),
    ]),
    ...(certificada?.fatos ?? []).map((c) => ({
      id: c.id,
      oQue: c.tipo === "CERTIFICACAO" ? `Certificação por ${c.responsavel} (${c.ato})` : `Devolvida para correção por ${c.responsavel} (${c.ato})`,
      quando: diaCivilBr(c.criadoEm), registradoEm: diaCivilBr(c.criadoEm), por: c.criadoPor,
      motivo: [c.motivo, `${c.vinculos} vínculo(s) · código de integridade ${c.sha256.slice(0, 12)}…`].filter((x) => x !== null).join(" · "),
      valor: c.totalLiquido.toFixed(2),
    })),
    ...(f.fechamento === null ? [] : [{ id: f.fechamento.id, oQue: `Fechamento sobre o cálculo nº ${f.fechamento.calculo.numero}`, quando: diaCivilBr(f.fechamento.criadoEm), registradoEm: diaCivilBr(f.fechamento.criadoEm), por: f.fechamento.criadoPor, motivo: `código de integridade ${f.fechamento.sha256.slice(0, 12)}…` }]),
  ];
  return {
    titulo: `Folha ${f.tipo.toLowerCase()} de ${f.competencia}`,
    subtitulo: d.vivo === null ? "sem cálculo" : `cálculo nº ${d.vivo.numero} · líquido R$ ${formatarMoeda(toMoney(d.vivo.totalLiquido).toFixed(2)).texto}`,
    selos: [
      { texto: ROTULO_DA_SITUACAO[d.situacao], tom: d.situacao === "FECHADA" ? "ok" : d.situacao === "CALCULADA" ? "neutro" : "alerta" },
      // ⚠️ O SELO VEM DEPOIS DA SITUAÇÃO, E NÃO NO LUGAR DELA. "Fechada" continua sendo verdade;
      // o que o segundo selo acrescenta é que aquilo fechou sobre um critério que ninguém declarou.
      ...(simulacaoDoAbatimento === null ? [] : [{ texto: "Simulação: apuração não aprovada", tom: "alerta" as const }]),
    ],
    dados, historico,
    competencia: f.competencia, situacao: d.situacao, calculoVivoId: d.vivo?.id ?? null,
    certificacao: certificada === null ? null : {
      situacao: certificada.situacao,
      fatos: certificada.fatos.map((c) => ({
        id: c.id, tipo: c.tipo, motivo: c.motivo, sha256: c.sha256, vinculos: c.vinculos,
        totalLiquido: c.totalLiquido.toFixed(2), ato: c.ato, responsavel: c.responsavel,
        criadoPor: c.criadoPor, quando: diaCivilBr(c.criadoEm),
      })),
    },
    liquidacao: liquidada === null ? null : {
      liquidadas: liquidada.liquidadas, pendentes: liquidada.pendentes, total: liquidada.total.toFixed(2),
      porEmpenho: Object.fromEntries(
        liquidada.linhas
          .filter((l) => l.numero !== null && l.data !== null)
          .map((l) => [l.empenho, { numero: l.numero as string, responsavelAtesto: l.responsavelAtesto ?? "", data: diaCivilBr(l.data as Date) }])
      ),
    },
    apropriacao: apropriada === null ? null : {
      dataDoEmpenho: diaCivilBr(apropriada.dataDoEmpenho), por: apropriada.criadoPor, total: apropriada.total.toFixed(2),
      empenhos: apropriada.empenhos.map((e) => ({ numero: e.numero, ficha: e.ficha, grupo: e.grupo, matricula: e.matricula, credor: e.credor, valor: e.valor.toFixed(2), empenhoId: e.empenhoId })),
    },
    simulacaoDoAbatimento,
    contracheques: contracheques.map((x) => ({ vinculoId: x.vinculoId, matricula: x.vinculo.matricula, servidor: x.vinculo.servidor.nomeSocial ?? x.vinculo.servidor.pessoa.versoes[0]?.nome ?? x.vinculo.servidor.pessoa.documento, regime: x.regime, dias: x.diasComputados, proventos: toMoney(x.totalProventos).toFixed(2), descontos: toMoney(x.totalDescontos).toFixed(2), liquido: toMoney(x.liquido).toFixed(2) })),
  };
}

/**
 * V6.2 U0 — O QUE A BARRA DA FOLHA OFERECE, para quem está olhando, AGORA.
 *
 * ⚠️ O RETRATO E O PREDICADO SÃO DO DOMÍNIO (`retratoDosAtosDaFolha` + `elegibilidadeDosAtosDaFolha`),
 * os mesmos que `certificacao.ts` usa dentro da transação. Aqui só se traduz a resposta.
 *
 * ⚠️ LEITURA PURA: não reserva número, não cria comando, não registra ciência. A designação é
 * consultada só para quem tem a permissão de certificar — ninguém mais precisa dela na tela.
 */
export async function disponibilidadeDaFolha(folhaId: string, permitidas: ReadonlySet<string>): Promise<DisponibilidadeDoRegistro | null> {
  const sessao = await exigirSessao();
  const r = await retratoDosAtosDaFolha(cliente(), folhaId, sessao.identificador, { consultarDesignacao: permitidas.has("CERTIFICAR_FOLHA"), lerDistribuicao: true });
  if (r === null) return null;
  const porAto = elegibilidadeDosAtosDaFolha(r.estado, r.ator);
  /**
   * ⚠️ O AVISO DE `calcular` SAI DO TIPO DESTA FOLHA (V11 V9.4b). O descritor é um só para os
   * quatro tipos, e o texto dele prometia "Calcula todos os vínculos vivos na competência" —
   * medido como falso numa complementar, que produziu 1 contracheque para 2 vínculos vivos porque
   * quem não tem diferença não vira contracheque. A frase vem da declaração exaustiva
   * `NATUREZA_DO_TIPO_DE_FOLHA`, então um tipo novo não compila até escrever a própria.
   */
  const tipoDaFolha = await cliente().folhaDePagamento.findUnique({ where: { id: folhaId }, select: { tipo: true } });
  const avisoDoCalculo =
    tipoDaFolha === null ? null : NATUREZA_DO_TIPO_DE_FOLHA[tipoDaFolha.tipo as TipoDeFolha].oQueOCalculoProduz;
  // V6.2 — os quatro atos dos encargos, pelo retrato e pelos predicados de `encargos.ts`.
  const encargos = await disponibilidadeDosEncargos(folhaId, sessao.identificador, permitidas);
  return {
    versao: `${r.versao}.${encargos?.versao ?? "-"}`,
    porAcao: {
      ...Object.fromEntries(
        Object.entries(porAto).map(([acao, e]) => {
          const d = apresentar(e, e.situacao === "PRE_CONDICAO" && e.codigo === "SEM-DESIGNACAO-VIGENTE" && permitidas.has("DESIGNAR_NA_FOLHA") ? "/folha/designacoes" : undefined);
          return [acao, acao === "calcular" && avisoDoCalculo !== null ? { ...d, aviso: avisoDoCalculo } : d];
        })
      ),
      ...(encargos?.porAcao ?? {}),
    },
  };
}

export async function opcoesDaFolha(): Promise<OpcoesDoCadastro> {
  return {};
}

export async function criarFolha(c: Campos): Promise<string> {
  return comEscritaAutenticada("ABRIR_FOLHA", async (criadoPor) => {
    // V11 V9.1 — o tipo passa a valer os três; quem recusa o que não existe é o Zod do domínio
    // (`zAbrirFolhaInput`), e não um cast aqui. O cast antigo para "MENSAL" era o tipo mentindo.
    const r = await abrirFolha(cliente(), { competencia: t(c, "competencia"), tipo: (opcional(c, "tipo") ?? "MENSAL") as TipoDeFolha, criadoPor });
    return r.folhaId;
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// A ABRANGÊNCIA EFETIVA — o FATO de quem entrou em cada cálculo (TR 5.12.50)
// ═══════════════════════════════════════════════════════════════════════════════

export interface LinhaDaAbrangenciaNaTela {
  readonly matricula: string;
  readonly nome: string;
  readonly calculado: boolean;
  /** `null` exatamente quando `calculado` — é o CHECK do banco, refletido aqui. */
  readonly motivo: string | null;
}

export interface AbrangenciaDeUmCalculo {
  readonly numero: number;
  readonly modoDeSelecao: string;
  readonly cancelado: boolean;
  readonly calculados: number;
  readonly excluidos: number;
  readonly linhas: readonly LinhaDaAbrangenciaNaTela[];
}

/**
 * A ABRANGÊNCIA DE CADA CÁLCULO DESTA FOLHA — quem entrou, quem não, e por quê.
 *
 * ⚠️ ELA EXISTE PORQUE "CONFIAR" NÃO É "CONSULTAR". O motor grava o fato desde a V11 V9.5 e a
 * guarda do fechamento o usa, mas até aqui nenhuma tela o lia: o operador declarava um recorte,
 * recebia "12 contracheques" e não tinha como ver QUEM eram os doze nem quem ficou de fora. Um
 * número de contracheques é compatível com a pessoa errada dentro e a certa fora.
 *
 * ⚠️ E OS CÁLCULOS CANCELADOS CONTINUAM NA LISTA, marcados. É deles que sai a segunda saída
 * legítima da recusa do fechamento ("cancele o cálculo que as processou"), e esconder o cancelado
 * deixaria o operador sem ver o efeito do próprio ato.
 */
export async function abrangenciaDosCalculos(folhaId: string): Promise<readonly AbrangenciaDeUmCalculo[]> {
  const prisma = cliente();
  const calculos = await prisma.calculoDaFolha.findMany({
    where: { folhaId },
    orderBy: { numero: "desc" },
    select: {
      numero: true,
      modoDeSelecao: true,
      cancelamento: { select: { id: true } },
      abrangencia: {
        select: {
          calculado: true,
          motivo: true,
          vinculo: { select: { matricula: true, servidor: { select: { pessoa: { select: { versoes: { select: { nome: true }, orderBy: { criadoEm: "desc" }, take: 1 } } } } } } },
        },
      },
    },
  });
  return calculos.map((c) => {
    const linhas = c.abrangencia
      .map((a) => ({
        matricula: a.vinculo.matricula,
        // ⚠️ O NOME VEM DA VERSÃO VIGENTE DA PESSOA — e é o que a tela mostra em todo lugar, por
        // nome social quando há (Lei 14.164/2021). Repetir aqui outra regra de exibição faria esta
        // seção chamar a mesma pessoa por um nome que nenhuma outra tela usa.
        nome: a.vinculo.servidor.pessoa.versoes[0]?.nome ?? "",
        calculado: a.calculado,
        motivo: a.motivo === null ? null : String(a.motivo),
      }))
      .sort((x, y) => x.matricula.localeCompare(y.matricula));
    return {
      numero: c.numero,
      modoDeSelecao: String(c.modoDeSelecao),
      cancelado: c.cancelamento !== null,
      calculados: linhas.filter((l) => l.calculado).length,
      excluidos: linhas.filter((l) => !l.calculado).length,
      linhas,
    };
  });
}

/**
 * A SELEÇÃO QUE A TELA DECLAROU — resolvida contra o cadastro, ou recusada nomeando o problema.
 *
 * ⚠️ DEVOLVE `undefined` QUANDO O MODO É "TODOS", e isso importa: `calcularFolha` só cobra
 * `SELECIONAR_VINCULOS_DA_FOLHA` quando a seleção é EXPLICITA. Mandar
 * `{ modo: "TODOS_OS_ELEGIVEIS", vinculoIds: [] }` teria o mesmo efeito prático, mas passaria a
 * exigir uma autoridade que o ato não tem — quem só pode calcular continuaria podendo calcular
 * todos, que é o padrão conservador que o domínio escolheu de propósito.
 *
 * ⚠️ E A RESOLUÇÃO É POR MATRÍCULA, NÃO POR ID DE LINHA DA LISTA. Ver o cabeçalho de
 * `declaracao-da-selecao.ts`: é o que impede a paginação de definir quem é calculado.
 */
async function selecaoDeclarada(prisma: ReturnType<typeof cliente>, c: Campos): Promise<SelecaoDoCalculo | undefined> {
  const declarada = conferirDeclaracao(t(c, "modoDeSelecao"), t(c, "matriculasSelecionadas"));
  if (declarada.modo === "TODOS_OS_ELEGIVEIS") return undefined;
  const achados = await prisma.vinculo.findMany({
    where: { matricula: { in: [...declarada.matriculas] } },
    select: { id: true, matricula: true },
  });
  return { modo: "EXPLICITA", vinculoIds: resolverMatriculas(declarada.matriculas, achados) };
}

export async function acaoDaFolha(acao: string, folhaId: string, c: Campos): Promise<string> {
  const prisma = cliente();
  // ⚠️ A TELA VELHA É RECUSADA ANTES DO CASO DE USO — que recusaria de qualquer forma, mas com o
  // motivo do estado novo, e o operador não saberia que outra aba agiu. Envio sem versão (chamada
  // direta, script) segue direto para o caso de uso: a versão é conveniência, não autorização.
  const versaoDoFormulario = opcional(c, "__versao");
  if (versaoDoFormulario !== undefined) {
    const atual = await retratoDosAtosDaFolha(prisma, folhaId, "", { consultarDesignacao: false, lerDistribuicao: false });
    const atualDosEncargos = await retratoDosEncargos(prisma, folhaId, "", { consultarDesignacao: false });
    if (atual !== null && `${atual.versao}.${atualDosEncargos?.versao ?? "-"}` !== versaoDoFormulario) throw new RegistroMudouError("Esta folha");
  }
  switch (acao) {
    case "calcular": {
      // ⚠️ A SELEÇÃO É RESOLVIDA ANTES DE `comEscritaAutenticada`, e de propósito: uma matrícula
      // digitada errado recusa ANTES de qualquer tentativa de escrita, com a mensagem falando do
      // que a pessoa digitou. Dentro do ato, a mesma recusa viria embrulhada em "falha ao gravar".
      const selecao = await selecaoDeclarada(prisma, c);
      const r = await comEscritaAutenticada("CALCULAR_FOLHA", (criadoPor) =>
        calcularFolha(prisma, {
          folhaId,
          ...(opcional(c, "motivo") !== undefined ? { motivo: t(c, "motivo") } : {}),
          // O domínio recebe `vinculoIds` mutável; `SelecaoDoCalculo` é `readonly`. A cópia é na
          // FRONTEIRA, que é onde uma diferença de variância se resolve sem afrouxar nenhum lado.
          ...(selecao !== undefined ? { selecao: { modo: selecao.modo, vinculoIds: [...selecao.vinculoIds] } } : {}),
          criadoPor,
        })
      );
      const recorte =
        selecao === undefined
          ? "Abrangência: todos os elegíveis da competência."
          : `Abrangência: ${selecao.vinculoIds.length} matrícula(s) informada(s).`;
      return `Cálculo nº ${r.numero} registrado: ${r.contracheques} contracheque(s), líquido ${r.totalLiquido.toFixed(2)}. ${recorte} A memória de cálculo fica em cada contracheque, e as matrículas calculadas, na seção "Abrangência dos cálculos".`;
    }
    case "cancelar-calculo": {
      const vivo = await prisma.calculoDaFolha.findFirst({ where: { folhaId, cancelamento: null }, orderBy: { numero: "desc" }, select: { id: true, numero: true } });
      if (vivo === null) throw new Error("Esta folha não tem cálculo vigente para cancelar. Nada foi gravado.");
      await comEscritaAutenticada("CANCELAR_CALCULO_DA_FOLHA", (criadoPor) => cancelarCalculoDaFolha(prisma, { calculoId: vivo.id, motivo: t(c, "motivo"), criadoPor }));
      return `Cálculo nº ${vivo.numero} cancelado; o registro permanece no histórico.`;
    }
    case "apropriar": {
      const r = await comEscritaAutenticada("APROPRIAR_FOLHA", (criadoPor) => apropriarFolha(prisma, { folhaId, dataDoEmpenho: new Date(`${t(c, "dataDoEmpenho")}T12:00:00`), criadoPor }));
      const detalhe = r.porGrupo.map((g) => `${g.codigo} (ficha ${g.ficha}): ${g.empenhos} empenho(s), ${g.valor.toFixed(2)}`).join(" · ");
      return r.empenhados === 0 && r.jaExistiam > 0
        ? `Nada novo a empenhar: os ${r.jaExistiam} empenho(s) desta folha já existem. ${detalhe}`
        : `Apropriação gravada: ${r.empenhados} empenho(s) novo(s)${r.jaExistiam > 0 ? ` (${r.jaExistiam} já existiam)` : ""}, total ${r.total.toFixed(2)}. ${detalhe}`;
    }
    case "certificar": {
      const r = await comEscritaAutenticada("CERTIFICAR_FOLHA", (criadoPor) => certificarFolha(prisma, { folhaId, data: diaDoCampo(c, "data"), criadoPor }));
      return `Folha de ${r.competencia} certificada. O conteúdo conferido foi registrado com o código de integridade ${r.sha256.slice(0, 12)}…. Próximo passo: liquidação, a ser feita por pessoa diferente de quem certificou.`;
    }
    case "devolver": {
      const r = await comEscritaAutenticada("CERTIFICAR_FOLHA", (criadoPor) => devolverFolhaParaCorrecao(prisma, { folhaId, data: diaDoCampo(c, "data"), motivo: t(c, "motivo"), criadoPor }));
      return `Folha de ${r.competencia} devolvida para correção, com o motivo registrado no histórico. O cálculo fechado não foi reaberto: a correção é feita por retificação ou folha complementar.`;
    }
    case "liquidar": {
      const r = await comEscritaAutenticada("LIQUIDAR_FOLHA", (criadoPor) => liquidarFolha(prisma, { folhaId, data: diaDoCampo(c, "data"), criadoPor }));
      const resumo = `${r.liquidadas} liquidação(ões) nova(s)${r.jaExistiam > 0 ? ` (${r.jaExistiam} já existiam)` : ""}, total ${r.total.toFixed(2)}`;
      return r.pendentes > 0
        ? `${resumo}. Atenção: ${r.pendentes} empenho(s) desta folha ainda não foram liquidados.`
        : `${resumo}. Todos os empenhos desta folha estão liquidados. Liquidada não é paga: o pagamento é registrado à parte.`;
    }
    case "apurar-encargos": {
      const r = await comEscritaAutenticada("APURAR_ENCARGOS_DA_FOLHA", (criadoPor) => apurarEncargosDaFolha(prisma, { folhaId, ...(opcional(c, "motivo") !== undefined ? { motivo: t(c, "motivo") } : {}), criadoPor }));
      const partes = r.porComponente.map((p) => `${p.codigo} ${p.total}${p.ausentes > 0 ? ` (${p.ausentes} sem parâmetro)` : ""}`).join(" · ");
      return `Apuração nº ${r.numero} dos encargos de ${r.competencia}${r.complementar ? " — complementar (o atesto da folha não alcança estes encargos)" : ""}: total ${r.total.toFixed(2)}${r.completa ? "" : " — incompleta: há componente sem parâmetro aprovado, e a apuração não pode ser certificada nem empenhada"}. ${partes}. Os contracheques não foram alterados.`;
    }
    case "certificar-encargos": {
      const r = await comEscritaAutenticada("CERTIFICAR_ENCARGOS_DA_FOLHA", (criadoPor) => certificarEncargosDaFolha(prisma, { folhaId, data: diaDoCampo(c, "data"), criadoPor }));
      return `Encargos de ${r.competencia} (apuração nº ${r.numero}) certificados por ${r.responsavel}, com o código de integridade ${r.sha256.slice(0, 12)}…. A liquidação deve ser feita por pessoa diferente de quem certificou.`;
    }
    case "apropriar-encargos": {
      const r = await comEscritaAutenticada("APROPRIAR_FOLHA", (criadoPor) => apropriarEncargosDaFolha(prisma, { folhaId, dataDoEmpenho: diaDoCampo(c, "dataDoEmpenho"), criadoPor }));
      const partes = r.porGrupo.map((g) => `${g.codigo}: apurado ${g.pedido}, já empenhado ${g.jaEmpenhado}, empenhado agora ${g.empenhado}`).join(" · ");
      return `Encargos da apuração nº ${r.apuracao}: ${r.empenhados} empenho(s) novo(s), total ${r.total.toFixed(2)}${r.jaExistiam > 0 ? ` (${r.jaExistiam} já existiam)` : ""}. ${partes}. Nenhuma contribuição retida do servidor foi empenhada.`;
    }
    case "liquidar-encargos": {
      const r = await comEscritaAutenticada("LIQUIDAR_FOLHA", (criadoPor) => liquidarEncargosDaFolha(prisma, { folhaId, data: diaDoCampo(c, "data"), criadoPor }));
      return `${r.liquidadas} liquidação(ões) de encargos nova(s)${r.jaExistiam > 0 ? ` (${r.jaExistiam} já existiam)` : ""}, total ${r.total.toFixed(2)}${r.pendentes > 0 ? ` — atenção: ${r.pendentes} continuam pendentes` : ""}. Liquidar não é recolher: a guia e o pagamento são registrados à parte.`;
    }
    case "ajustar-encargos": {
      const r = await comEscritaAutenticada("APROPRIAR_FOLHA", (criadoPor) => ajustarEncargosDaFolha(prisma, { folhaId, data: diaDoCampo(c, "data"), motivo: (c["motivo"] ?? "").trim(), criadoPor }));
      if (r.porGrupo.length === 0) return `Nada a reduzir além do que já estava gravado: ${r.reconhecidos} ato(s) de ajuste reconhecido(s) e registrado(s) no histórico.`;
      const partes = r.porGrupo.map((g) => `${g.codigo}: apurado ${g.apurado}, empenhado antes ${g.empenhadoAntes}, anulado da liquidação ${g.anuladoDeLiquidacao}, anulado do empenho ${g.anuladoDeEmpenho}${g.restituicaoRegistrada !== "0.00" ? `, já pago acima do devido ${g.restituicaoRegistrada} (restituição a providenciar)` : ""}`).join(" · ");
      return `Ajuste para baixo da apuração nº ${r.apuracao}: ${r.atos} ato(s) novo(s)${r.reconhecidos > 0 ? `, ${r.reconhecidos} reconhecido(s)` : ""}. ${partes}.`;
    }
    case "fechar": {
      const r = await comEscritaAutenticada("FECHAR_FOLHA", (criadoPor) => fecharFolha(prisma, { folhaId, criadoPor }));
      return `Folha fechada com o cálculo nº ${r.numero}. A partir de agora, ela não pode ser recalculada.`;
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
  /**
   * ⚠️ A MEMÓRIA SAI DAQUI JÁ LIDA, e isto é a correção do defeito que derrubou a tela do
   * contracheque do 13º (V11 V9.2). Ela era devolvida como `unknown` e a página fazia
   * `as MemoriaDoContracheque` — um cast que não confere nada e que escondeu, dos três
   * typechecks, que o motor do 13º grava outra forma. A porta é a fronteira: quem atravessa
   * atravessa tipado, e o que não for legível atravessa DIZENDO que não é.
   */
  readonly memoria: MemoriaLida;
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
    memoria: lerMemoriaDoContracheque(c.memoria), sha256: c.sha256,
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
      ...(r.percentual === null ? [] : [{ rotulo: "Percentual", valor: `${new Decimal(r.percentual).times(100).toFixed(2).replace(".", ",")}% do vencimento-base` }]),
      { rotulo: "Compõe a base da contribuição", valor: r.incideContribuicao ? "sim" : "não" },
      { rotulo: "Compõe a base do IRRF", valor: r.incideIrrf ? "sim" : "não" },
      { rotulo: "Proporcional aos dias", valor: r.proporcionalAosDias ? "sim (mês de 30 dias)" : "não" },
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
  const pct = (a: Decimal): string => `${new Decimal(a).times(100).toFixed(2).replace(".", ",")}%`;
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
  const pct = (a: Decimal): string => `${new Decimal(a).times(100).toFixed(2).replace(".", ",")}%`;
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
  const irrf = await prisma.tabelaIrrf.findUnique({ where: { id }, select: { competenciaInicio: true, competenciaFim: true, deducaoPorDependente: true, descontoSimplificado: true, isencaoMaior65: true, redutorBase: true, redutorFator: true, redutorRendaMaxima: true, redutorRendaDaFaixaIsenta: true, redutorMaximoNaFaixaIsenta: true, fundamentacaoLegal: true, criadoEm: true, criadoPor: true, faixas: { orderBy: { ordem: "asc" }, select: { ordem: true, ate: true, aliquota: true, parcelaADeduzir: true } } } });
  if (irrf !== null) {
    return {
      titulo: `IRRF — desde ${irrf.competenciaInicio}`, subtitulo: irrf.fundamentacaoLegal, selos: [{ texto: "IRRF", tom: "neutro" }],
      dados: [
        { rotulo: "Vigência", valor: `${irrf.competenciaInicio} → ${irrf.competenciaFim ?? "aberta"}` },
        { rotulo: "Dedução por dependente", valor: toMoney(irrf.deducaoPorDependente).toFixed(2), tipo: "dinheiro" },
        { rotulo: "Desconto simplificado", valor: irrf.descontoSimplificado === null ? "não se aplica" : toMoney(irrf.descontoSimplificado).toFixed(2) },
        { rotulo: "Parcela isenta (65 anos ou mais)", valor: irrf.isencaoMaior65 === null ? "não há" : toMoney(irrf.isencaoMaior65).toFixed(2) },
        { rotulo: "Redutor", valor: irrf.redutorBase === null ? "não se aplica" : `max(0, ${toMoney(irrf.redutorBase).toFixed(2)} − ${new Decimal(irrf.redutorFator ?? 0).toFixed(8)} × renda), zerado acima de ${toMoney(irrf.redutorRendaMaxima ?? 0).toFixed(2)}` },
        { rotulo: "Redutor até a renda em que o imposto zera", valor: irrf.redutorRendaDaFaixaIsenta === null || irrf.redutorMaximoNaFaixaIsenta === null ? "não informado — vale só a fórmula acima" : `até ${toMoney(irrf.redutorRendaDaFaixaIsenta).toFixed(2)} de renda, redução de até ${toMoney(irrf.redutorMaximoNaFaixaIsenta).toFixed(2)}, limitada ao imposto` },
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
        { rotulo: "Idade limite", valor: `${sf.idadeLimite} anos` },
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
        ...(opcional(c, "redutorRendaDaFaixaIsenta") !== undefined ? { redutorRendaDaFaixaIsenta: decimalDaTela(t(c, "redutorRendaDaFaixaIsenta")) } : {}),
        ...(opcional(c, "redutorMaximoNaFaixaIsenta") !== undefined ? { redutorMaximoNaFaixaIsenta: decimalDaTela(t(c, "redutorMaximoNaFaixaIsenta")) } : {}),
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
      { rotulo: "Série do número do empenho", valor: g.serie, nota: "O número do empenho é composto por série, competência e matrícula, o que impede empenho em duplicidade." },
      { rotulo: "Tipo de empenho", valor: g.tipoEmpenho },
      { rotulo: "Categoria (art. 141)", valor: g.categoriaOrdemCronologica.replace(/_/g, " ").toLowerCase() },
      { rotulo: "Credor", valor: g.porServidor ? "cada servidor" : `${g.credor?.versoes[0]?.nome ?? "—"} (${g.credor?.documento ?? "—"})` },
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

export async function acaoDoGrupoDeEmpenho(acao: string, grupoId: string, c: Campos): Promise<string> {
  if (acao !== "definir-contas") throw new Error(`Ação desconhecida: ${acao}`);
  await comEscritaAutenticada("CADASTRAR_GRUPO_DE_EMPENHO_DA_FOLHA", (criadoPor) =>
    definirContasDaLiquidacaoDoGrupo(cliente(), { grupoId, contaVariacaoId: t(c, "contaVariacaoId"), contaObrigacaoId: t(c, "contaObrigacaoId"), criadoPor })
  );
  return "Contas da liquidação definidas para este grupo. As liquidações já gravadas não mudam: mantêm as contas vigentes na data em que foram registradas.";
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


// ═══════════════════════════════════════════════════════════════════════════════
// AS DESIGNAÇÕES PARA O ATESTO (V6.1)
// ═══════════════════════════════════════════════════════════════════════════════

const SELECAO_DA_DESIGNACAO = {
  id: true, atribuicao: true, atoDesignacao: true, vigenciaInicio: true, vigenciaFim: true, criadoEm: true, criadoPor: true,
  revogacao: { select: { id: true, dataEfeito: true, motivo: true, criadoEm: true, criadoPor: true } },
  usuario: { select: { identificador: true, nome: true, ativo: true } },
  pessoa: { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" as const }, take: 1, select: { nome: true } } } },
  substitutoDe: { select: { atoDesignacao: true, pessoa: { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" as const }, take: 1, select: { nome: true } } } } } },
} as const;

const nomeDaPessoa = (p: { readonly documento: string; readonly versoes: readonly { readonly nome: string }[] }): string => p.versoes[0]?.nome ?? formatarDocumento(p.documento);

const vigenciaEmTexto = (d: { readonly vigenciaInicio: Date; readonly vigenciaFim: Date | null; readonly revogacao: { readonly dataEfeito: Date } | null }): string =>
  `${diaCivilBr(d.vigenciaInicio)} → ${d.vigenciaFim === null ? "sem prazo" : diaCivilBr(d.vigenciaFim)}` +
  (d.revogacao === null ? "" : ` · revogada a partir de ${diaCivilBr(d.revogacao.dataEfeito)}`);

export async function listarDesignacoes(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = (c.filtros["q"] ?? "").trim();
  const situacao = c.filtros["situacao"] ?? "";
  const where = q === "" ? {} : {
    OR: [
      { atoDesignacao: { contains: q, mode: "insensitive" as const } },
      { usuario: { identificador: { contains: q, mode: "insensitive" as const } } },
      { pessoa: { versoes: { some: { nome: { contains: q, mode: "insensitive" as const } } } } },
    ],
  };
  // ⚠️ O FILTRO "HOJE" É APLICADO SOBRE A DERIVAÇÃO, não por SQL. Vigência aqui é início, fim E
  // revogação lidos pelo dia civil do ente — traduzir isso para `where` criaria uma segunda
  // definição de "vigente", e um dia as duas discordariam numa data de borda.
  const todas = await prisma.designacaoNaFolha.findMany({ where, orderBy: { vigenciaInicio: "desc" }, select: SELECAO_DA_DESIGNACAO });
  const hoje = new Date();
  const comVigencia = todas.map((d) => ({ d, vigente: designacaoVigenteEm({ vigenciaInicio: d.vigenciaInicio, vigenciaFim: d.vigenciaFim, revogacao: d.revogacao }, hoje) }));
  const filtradas = situacao === "" ? comVigencia : comVigencia.filter((x) => (situacao === "VIGENTE" ? x.vigente : !x.vigente));
  const pagina = filtradas.slice((c.pagina - 1) * TAMANHO_DE_PAGINA, c.pagina * TAMANHO_DE_PAGINA);
  return {
    total: filtradas.length,
    linhas: pagina.map(({ d, vigente }) => ({
      id: d.id,
      responsavel: nomeDaPessoa(d.pessoa),
      usuario: d.usuario.identificador,
      atoDesignacao: d.atoDesignacao,
      vigencia: vigenciaEmTexto(d),
      situacao: vigente ? "VIGENTE" : "NÃO VIGENTE",
    })),
  };
}

export async function verDesignacao(id: string): Promise<DetalheLido | null> {
  const d = await cliente().designacaoNaFolha.findUnique({ where: { id }, select: SELECAO_DA_DESIGNACAO });
  if (d === null) return null;
  const vigente = designacaoVigenteEm({ vigenciaInicio: d.vigenciaInicio, vigenciaFim: d.vigenciaFim, revogacao: d.revogacao }, new Date());
  const dados: DadoDoDetalhe[] = [
    { rotulo: "Atribuição", valor: d.atribuicao === "CERTIFICAR_ENCARGOS_DA_FOLHA" ? "Certificar (atestar) os encargos do empregador" : "Certificar (atestar) a folha" },
    { rotulo: "Responsável", valor: nomeDaPessoa(d.pessoa), nota: "Nome que constará no atesto e como responsável pelo atesto da liquidação." },
    { rotulo: "Documento", valor: formatarDocumento(d.pessoa.documento) },
    { rotulo: "Conta de acesso", valor: `${d.usuario.identificador}${d.usuario.ativo ? "" : " (DESATIVADA)"}`, nota: "Usuário vinculado ao responsável, conferido no cadastro, para que o atesto seja praticado pela própria pessoa designada." },
    { rotulo: "Ato que designou", valor: d.atoDesignacao, nota: "Ato administrativo do ente." },
    { rotulo: "Vigência", valor: vigenciaEmTexto(d) },
    { rotulo: "Vigente hoje", valor: vigente ? "sim" : "não", nota: "Considera o período de vigência e eventual revogação." },
    ...(d.substitutoDe === null ? [] : [{ rotulo: "Substitui", valor: `${nomeDaPessoa(d.substitutoDe.pessoa)} (${d.substitutoDe.atoDesignacao})`, nota: "O substituto certifica em nome próprio, com base no próprio ato de designação." }]),
    { rotulo: "Cadastrada em", valor: diaCivilBr(d.criadoEm), tipo: "data" as const },
    { rotulo: "Cadastrada por", valor: d.criadoPor },
  ];
  const historico: LinhaDoHistorico[] = [
    { id: `cadastro-${d.id}`, oQue: `Designação pelo ato ${d.atoDesignacao}`, quando: diaCivilBr(d.vigenciaInicio), registradoEm: diaCivilBr(d.criadoEm), por: d.criadoPor },
    ...(d.revogacao === null ? [] : [{ id: d.revogacao.id, oQue: "Revogação", quando: diaCivilBr(d.revogacao.dataEfeito), registradoEm: diaCivilBr(d.revogacao.criadoEm), por: d.revogacao.criadoPor, motivo: d.revogacao.motivo }]),
  ];
  return {
    titulo: nomeDaPessoa(d.pessoa),
    subtitulo: `${d.atoDesignacao} · ${vigenciaEmTexto(d)}`,
    selos: [{ texto: vigente ? "VIGENTE" : "NÃO VIGENTE", tom: vigente ? "ok" : "alerta" }],
    dados, historico,
  };
}

/**
 * As opções do cadastro da designação.
 *
 * ⚠️ O RECORTE É O QUE TORNA O FORMULÁRIO UTILIZÁVEL: só PESSOAS FÍSICAS com vínculo VIGENTE a
 * um usuário ATIVO aparecem, e a conta é oferecida junto do nome. Oferecer as 40 mil pessoas do
 * cadastro seria um `select` bonito e inútil — e o serviço recusaria depois de tudo preenchido.
 */
export async function opcoesDaDesignacao(): Promise<OpcoesDoCadastro> {
  const prisma = cliente();
  const [vinculos, titulares] = await Promise.all([
    prisma.vinculoUsuarioPessoa.findMany({
      orderBy: { criadoEm: "desc" }, take: 600,
      select: { tipo: true, usuarioId: true, pessoaId: true, usuario: { select: { identificador: true, ativo: true } }, pessoa: { select: { documento: true, tipo: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } } },
    }),
    prisma.designacaoNaFolha.findMany({ orderBy: { vigenciaInicio: "desc" }, take: 200, select: { id: true, atoDesignacao: true, pessoa: { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } } } }),
  ]);
  // O vigente é a ÚLTIMA linha de cada usuário, se for VINCULO — a mesma leitura do serviço.
  const ultimoDoUsuario = new Map<string, (typeof vinculos)[number]>();
  for (const v of vinculos) if (!ultimoDoUsuario.has(v.usuarioId)) ultimoDoUsuario.set(v.usuarioId, v);
  const elegiveis = [...ultimoDoUsuario.values()].filter((v) => v.tipo === "VINCULO" && v.usuario.ativo && v.pessoa.tipo === "FISICA");
  return {
    atribuicao: [{ valor: "CERTIFICAR_FOLHA", rotulo: "Certificar (atestar) a folha" }, { valor: "CERTIFICAR_ENCARGOS_DA_FOLHA", rotulo: "Certificar (atestar) os encargos do empregador" }],
    pessoaId: elegiveis.map((v) => ({ valor: v.pessoaId, rotulo: `${nomeDaPessoa(v.pessoa)} (${formatarDocumento(v.pessoa.documento)})` })),
    usuarioIdentificador: elegiveis.map((v) => ({ valor: v.usuario.identificador, rotulo: `${v.usuario.identificador} — ${nomeDaPessoa(v.pessoa)}` })),
    substitutoDeId: titulares.map((t2) => ({ valor: t2.id, rotulo: `${nomeDaPessoa(t2.pessoa)} (${t2.atoDesignacao})` })),
  };
}

export async function criarDesignacao(c: Campos): Promise<string> {
  return comEscritaAutenticada("DESIGNAR_NA_FOLHA", async (criadoPor) => {
    const fim = opcional(c, "vigenciaFim");
    const substituto = opcional(c, "substitutoDeId");
    const r = await designarNaFolha(cliente(), {
      atribuicao: t(c, "atribuicao") === "CERTIFICAR_ENCARGOS_DA_FOLHA" ? "CERTIFICAR_ENCARGOS_DA_FOLHA" : "CERTIFICAR_FOLHA",
      pessoaId: t(c, "pessoaId"),
      usuarioIdentificador: t(c, "usuarioIdentificador"),
      atoDesignacao: t(c, "atoDesignacao"),
      vigenciaInicio: diaDoCampo(c, "vigenciaInicio"),
      ...(fim === undefined || fim === "" ? {} : { vigenciaFim: meioDiaCivil(fim) }),
      ...(substituto === undefined || substituto === "" ? {} : { substitutoDeId: substituto }),
      criadoPor,
    });
    return r.designacaoId;
  });
}

export async function acaoDaDesignacao(acao: string, designacaoId: string, c: Campos): Promise<string> {
  if (acao !== "revogar") throw new Error(`Ação desconhecida: ${acao}`);
  await comEscritaAutenticada("DESIGNAR_NA_FOLHA", (criadoPor) =>
    revogarDesignacaoNaFolha(cliente(), { designacaoId, dataEfeito: diaDoCampo(c, "dataEfeito"), motivo: t(c, "motivo"), criadoPor })
  );
  return `Designação revogada a partir de ${diaCivilBr(diaDoCampo(c, "dataEfeito"))}. Ela permanece no histórico, e os atestos já praticados continuam válidos.`;
}


// ═══════════════════════════════════════════════════════════════════════════════
// V11 V9.1 — OS PARÂMETROS DO 13º DO ENTE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A LISTA DOS PARÂMETROS. A situação é DERIVADA: vigente é a de MAIOR versão do exercício; as
 * anteriores ficam como SUPERADA — nunca apagadas, porque as folhas que elas calcularam citam o
 * `id` e a `versao` na memória, e sem a linha o contracheque deixaria de se explicar.
 */
/**
 * ⚠️ V11 V9.3 — OS TRÊS CRITÉRIOS, EM PORTUGUÊS DE QUEM OPERA. O enum do banco é vocabulário do
 * sistema; a tela fala do fato. E nenhum deles diz qual é o certo — quem declara é o ente.
 */
const ROTULO_DO_CRITERIO_DO_ABATIMENTO: Readonly<Record<string, string>> = {
  FECHADO: "Fechado — a folha do adiantamento foi fechada",
  CERTIFICADO: "Certificado — a folha do adiantamento foi atestada pelo responsável designado",
  PAGO: "Pago — o adiantamento foi pago ao servidor",
};

export async function listarParametrosDoDecimoTerceiro(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = (c.filtros["q"] ?? "").trim();
  const todos = await prisma.parametroDoDecimoTerceiro.findMany({
    orderBy: [{ exercicio: "desc" }, { versao: "desc" }],
    select: {
      id: true, exercicio: true, versao: true, diasMinimosDoAvo: true, avosNoExercicio: true,
      percentualDaPrimeiraParcela: true, decimoTerceiroSofreContribuicao: true, decimoTerceiroSofreIrrf: true,
      atoTipo: true, atoNumero: true, atoAno: true, atoDispositivo: true,
      estadoMinimoDoAdiantamentoParaAbater: true,
      _count: { select: { rubricasDaBase: true } },
    },
  });
  const maiorVersaoDo = new Map<number, number>();
  for (const p of todos) if (!maiorVersaoDo.has(p.exercicio)) maiorVersaoDo.set(p.exercicio, p.versao);
  const filtrados = q === "" ? todos : todos.filter((p) => String(p.exercicio).includes(q) || p.atoNumero.includes(q));
  const { skip, take } = paginacao(c);
  return {
    total: filtrados.length,
    linhas: filtrados.slice(skip, skip + take).map((p) => ({
      id: p.id,
      exercicio: String(p.exercicio),
      // ⚠️ STRING, e o contrato de `LinhaDoMolde` e explicito: "TEXTO, E NÃO VALOR TIPADO".
      // O componente só escolhe COMO pintar; quem formata é a porta.
      versao: String(p.versao),
      avo: `${p.diasMinimosDoAvo} dia(s) por mês · ${p.avosNoExercicio} avos no ano`,
      // ⚠️ pt-BR, como o resto do sistema (`encargos-dados.ts`). A lista mostrava "50.00%" com
      // PONTO, num sistema em que todo dinheiro e toda alíquota saem com vírgula — achado pelo
      // percurso do 13º na V11 V9.2.
      primeiraParcela: `${new Decimal(p.percentualDaPrimeiraParcela).times(100).toFixed(2).replace(".", ",")}%`,
      incidencias:
        [p.decimoTerceiroSofreContribuicao ? "contribuição" : null, p.decimoTerceiroSofreIrrf ? "IRRF" : null]
          .filter((x) => x !== null).join(" e ") || "nenhuma",
      base: String(p._count.rubricasDaBase),
      /**
       * ⚠️ V11 V9.3 — "NÃO DECLARADO" É O TEXTO, E ELE NÃO PODE VIRAR TRAÇO NEM CÉLULA VAZIA.
       * Uma célula em branco aqui seria lida como "nada a dizer"; o que ela significa é que o
       * abatimento do 13º deste exercício é SIMULAÇÃO e a apropriação está bloqueada.
       */
      criterioDoAbatimento:
        p.estadoMinimoDoAdiantamentoParaAbater === null
          ? "Não informado — o abatimento é apenas simulado"
          : ROTULO_DO_CRITERIO_DO_ABATIMENTO[p.estadoMinimoDoAdiantamentoParaAbater] ?? p.estadoMinimoDoAdiantamentoParaAbater,
      ato: `${OPCOES_DE_TIPO_DE_ATO.find((o) => o.valor === p.atoTipo)?.rotulo ?? p.atoTipo} ${p.atoNumero}/${p.atoAno}, ${p.atoDispositivo}`,
      situacao: maiorVersaoDo.get(p.exercicio) === p.versao ? "VIGENTE" : "SUPERADA",
    })),
  };
}

/**
 * AS RUBRICAS QUE A ILHA OFERECE, já separadas pelo papel que podem exercer.
 *
 * ⚠️ O RECORTE É O PONTO, e é a regra "lista curta não é exceção" do CLAUDE.md: oferecer todas as
 * rubricas em todos os três seletores produziria um formulário bonito que o caso de uso recusa
 * depois — e o operador descobriria o erro só ao gravar. A base não oferece valor informado nem
 * fórmula (exigiriam a MÉDIA do ano, TR 5.12.82, que não existe aqui); o abatimento só oferece a
 * natureza que o motor sabe ler.
 */
export async function rubricasParaOParametroDo13(): Promise<{
  readonly proventos: readonly { readonly valor: string; readonly rotulo: string }[];
  readonly base: readonly { readonly valor: string; readonly rotulo: string }[];
  readonly abatimento: readonly { readonly valor: string; readonly rotulo: string }[];
  /**
   * ⚠️ V11 V9.3 — QUAIS RUBRICAS DE PROVENTO PERMITEM EXIGIR "PAGO", e a lista pode vir VAZIA.
   *
   * "Pago" só é verificável quando a rubrica do adiantamento está num grupo de empenho que emite
   * UM EMPENHO POR SERVIDOR: é o `EmpenhoDaFolha.vinculoId` que liga o pagamento à matrícula. Com
   * o empenho único do grupo, "quanto saiu para esta pessoa" não existe no banco.
   *
   * A tela mostra esta lista em vez de esconder a opção, e a razão é a mesma de sempre: esconder
   * faria o operador achar que o sistema não sabe fazer aquilo. Dizer QUAIS rubricas servem e por
   * quê transforma a limitação em instrução. O servidor recusa de qualquer forma
   * (`ESTADO-PAGO-NAO-VERIFICAVEL`) — a tela orienta, ela não protege.
   */
  readonly adiantamentosQuePermitemPago: readonly string[];
}> {
  const prisma = cliente();
  const todas = await prisma.rubrica.findMany({
    orderBy: [{ ordem: "asc" }, { codigo: "asc" }],
    select: {
      id: true, codigo: true, descricao: true, tipo: true, natureza: true,
      grupoDeEmpenho: { select: { grupo: { select: { porServidor: true } } } },
    },
  });
  const rotular = (r: { codigo: string; descricao: string }): string => `${r.codigo} — ${r.descricao}`;
  return {
    adiantamentosQuePermitemPago: todas
      .filter((r) => r.tipo === "PROVENTO" && r.grupoDeEmpenho?.grupo.porServidor === true)
      .map(rotular),
    proventos: todas.filter((r) => r.tipo === "PROVENTO").map((r) => ({ valor: r.id, rotulo: rotular(r) })),
    base: todas
      .filter((r) => r.tipo === "PROVENTO" && ["VENCIMENTO_BASE", "GRATIFICACOES_DO_VINCULO", "PERCENTUAL_DO_VENCIMENTO"].includes(r.natureza))
      .map((r) => ({ valor: r.id, rotulo: rotular(r) })),
    abatimento: todas
      .filter((r) => r.natureza === "ABATIMENTO_DO_ADIANTAMENTO_DO_13")
      .map((r) => ({ valor: r.id, rotulo: rotular(r) })),
  };
}

/**
 * GRAVA A PRÓXIMA VERSÃO DO PARÂMETRO. A ilha manda o percentual EM PORCENTO (50), como a norma o
 * escreve; a conversão para fração acontece aqui, na borda — o mesmo que o `FormTabela` faz com a
 * alíquota. Nenhuma recusa do domínio é traduzida: elas sobem como vieram.
 */
export async function criarParametroDoDecimoTerceiro(c: Campos, rubricasDaBase: readonly string[]): Promise<string> {
  return comEscritaAutenticada("CONFIGURAR_PARAMETRO_DO_DECIMO_TERCEIRO", async (criadoPor) => {
    const r = await cadastrarParametroDoDecimoTerceiro(cliente(), {
      exercicio: Number(t(c, "exercicio")),
      diasMinimosDoAvo: Number(t(c, "diasMinimosDoAvo")),
      avosNoExercicio: Number(t(c, "avosNoExercicio")),
      // ⚠️ `decimalDaTela` devolve STRING (ela só normaliza "1.234,56" para "1234.56"), e eu a
      // tratei como `Decimal`. A tela recebe o percentual EM PORCENTO, como a norma o escreve
      // ("50"), e o parâmetro guarda FRAÇÃO — a divisão por 100 é a conversão da borda, a mesma
      // que o `FormTabela` faz com a alíquota. Sem ela o ente digitaria 50 e o CHECK
      // `ck_parametro_13_percentual_primeira` (entre 0 e 1) recusaria a gravação.
      percentualDaPrimeiraParcela: new Decimal(decimalDaTela(t(c, "percentualDaPrimeiraParcela"))).div(100).toFixed(4),
      baseDosAvosDoAdiantamento: t(c, "baseDosAvosDoAdiantamento") as "ATE_A_COMPETENCIA" | "EXERCICIO_INTEIRO",
      // ⚠️ A TELA MANDA "" QUANDO NINGUÉM ESCOLHEU, e o zod converte para `null` — não declarado.
      // Nenhum default é aplicado aqui: um `?? "FECHADO"` nesta linha faria a borda declarar, em
      // nome do município, a norma que esta rodada inteira existe para não inventar.
      estadoMinimoDoAdiantamentoParaAbater: t(c, "estadoMinimoDoAdiantamentoParaAbater") as "" | "FECHADO" | "CERTIFICADO" | "PAGO",
      decimoTerceiroSofreContribuicao: marcado(c, "decimoTerceiroSofreContribuicao"),
      decimoTerceiroSofreIrrf: marcado(c, "decimoTerceiroSofreIrrf"),
      rubricaDoDecimoTerceiroId: t(c, "rubricaDoDecimoTerceiroId"),
      rubricaDoAdiantamentoId: t(c, "rubricaDoAdiantamentoId"),
      rubricaDoAbatimentoId: t(c, "rubricaDoAbatimentoId"),
      rubricasDaBase: [...rubricasDaBase],
      atoEsfera: t(c, "atoEsfera") as "FEDERAL" | "ESTADUAL" | "MUNICIPAL",
      atoTipo: t(c, "atoTipo") as Parameters<typeof cadastrarParametroDoDecimoTerceiro>[1]["atoTipo"],
      atoNumero: t(c, "atoNumero"),
      atoAno: Number(t(c, "atoAno")),
      atoDispositivo: t(c, "atoDispositivo"),
      atoEmenta: t(c, "atoEmenta"),
      criadoPor,
    });
    return `${r.parametroId}|${r.versao}`;
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// V13 (TR 5.12.50) — OS PARÂMETROS DO ADIANTAMENTO SALARIAL
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ OS TRÊS ESTADOS, EM PORTUGUÊS DE QUEM OPERA — e nenhum deles diz qual é o certo. O enum do
 * banco é vocabulário do sistema; a tela fala do FATO. E os rótulos separam explicitamente
 * "fechou" de "pagou", que é a distinção que a V13 existe para não deixar confundir.
 */
const ROTULO_DO_ESTADO_PARA_ABATER: Readonly<Record<string, string>> = {
  FECHADO: "Fechado — a folha do adiantamento foi fechada (ainda sem pagamento)",
  CERTIFICADO: "Certificado — a folha do adiantamento foi atestada pelo responsável designado",
  PAGO: "Pago — o adiantamento foi pago ao servidor",
};

export async function listarParametrosDoAdiantamentoSalarial(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = (c.filtros["q"] ?? "").trim();
  const todos = await prisma.parametroDoAdiantamentoSalarial.findMany({
    orderBy: [{ competencia: "desc" }, { versao: "desc" }],
    select: {
      id: true, competencia: true, versao: true, percentualDoAdiantamento: true,
      baseDoAdiantamento: true, estadoMinimoParaAbater: true,
      atoTipo: true, atoNumero: true, atoAno: true, atoDispositivo: true,
      rubricaDoAdiantamento: { select: { codigo: true } },
      rubricaDoAbatimento: { select: { codigo: true } },
    },
  });
  // ⚠️ A VIGENTE É A DE MAIOR VERSÃO DA COMPETÊNCIA, DERIVADA A CADA LEITURA. Não há coluna de
  // situação, e as versões anteriores continuam listadas: as folhas que elas calcularam citam o
  // id e a versão na memória, e sem a linha o contracheque deixaria de se explicar.
  const maiorVersaoDa = new Map<string, number>();
  for (const p of todos) if (!maiorVersaoDa.has(p.competencia)) maiorVersaoDa.set(p.competencia, p.versao);
  const filtrados = q === "" ? todos : todos.filter((p) => p.competencia.includes(q) || p.atoNumero.includes(q));
  const { skip, take } = paginacao(c);
  return {
    total: filtrados.length,
    linhas: filtrados.slice(skip, skip + take).map((p) => ({
      id: p.id,
      competencia: p.competencia,
      versao: String(p.versao),
      // ⚠️ pt-BR, com VÍRGULA, como o resto do sistema. "40.00%" com ponto num sistema em que
      // todo dinheiro e toda alíquota saem com vírgula foi achado medido no percurso do 13º.
      percentual: `${new Decimal(p.percentualDoAdiantamento).times(100).toFixed(2).replace(".", ",")}%`,
      base: SEMANTICA_DA_BASE[p.baseDoAdiantamento as BaseDoAdiantamentoSalarial]?.rotulo ?? p.baseDoAdiantamento,
      criterioDoAbatimento: ROTULO_DO_ESTADO_PARA_ABATER[p.estadoMinimoParaAbater] ?? p.estadoMinimoParaAbater,
      rubricas: `${p.rubricaDoAdiantamento.codigo} paga / ${p.rubricaDoAbatimento.codigo} abate`,
      ato: `${OPCOES_DE_TIPO_DE_ATO.find((o) => o.valor === p.atoTipo)?.rotulo ?? p.atoTipo} ${p.atoNumero}/${p.atoAno}, ${p.atoDispositivo}`,
      situacao: maiorVersaoDa.get(p.competencia) === p.versao ? "VIGENTE" : "SUPERADA",
    })),
  };
}

/**
 * AS RUBRICAS QUE A ILHA OFERECE, já separadas pelo papel que podem exercer.
 *
 * ⚠️ O RECORTE É O PONTO — "lista curta não é exceção" (CLAUDE.md). Oferecer todas as rubricas nos
 * dois seletores produziria um formulário bonito que o caso de uso recusa depois, e o operador
 * descobriria o erro só ao gravar. O abatimento só oferece a natureza que o motor MENSAL sabe ler,
 * e `ABATIMENTO_DO_ADIANTAMENTO_DO_13` NÃO é ela: usá-la faria o motor descontar do salário do mês
 * metade da gratificação natalina.
 */
export async function rubricasParaOParametroDoAdiantamentoSalarial(): Promise<{
  readonly proventos: readonly { readonly valor: string; readonly rotulo: string }[];
  readonly abatimento: readonly { readonly valor: string; readonly rotulo: string }[];
  /** As de provento que permitem exigir PAGO — as que estão em grupo que empenha POR SERVIDOR. */
  readonly adiantamentosQuePermitemPago: readonly string[];
}> {
  const prisma = cliente();
  const todas = await prisma.rubrica.findMany({
    orderBy: [{ ordem: "asc" }, { codigo: "asc" }],
    select: {
      id: true, codigo: true, descricao: true, tipo: true, natureza: true,
      grupoDeEmpenho: { select: { grupo: { select: { porServidor: true } } } },
    },
  });
  const rotular = (r: { codigo: string; descricao: string }): string => `${r.codigo} — ${r.descricao}`;
  return {
    adiantamentosQuePermitemPago: todas
      .filter((r) => r.tipo === "PROVENTO" && r.grupoDeEmpenho?.grupo.porServidor === true)
      .map(rotular),
    proventos: todas.filter((r) => r.tipo === "PROVENTO" && !r.natureza.startsWith("ABATIMENTO_")).map((r) => ({ valor: r.id, rotulo: rotular(r) })),
    abatimento: todas
      .filter((r) => r.natureza === "ABATIMENTO_DO_ADIANTAMENTO_SALARIAL")
      .map((r) => ({ valor: r.id, rotulo: rotular(r) })),
  };
}

/**
 * AS CONTAS DO PLANO EM QUE O VALE PODE VIRAR DIREITO — RECORTADAS, e o recorte é a entrega.
 *
 * ⚠️ "LISTA CURTA NÃO É EXCEÇÃO" (CLAUDE.md). O plano oficial do TCE-PB tem 7.864 contas; um
 * `select` com todas elas, ordenado por código, é um formulário bonito e inútil — o operador
 * escolheria uma VPD de pessoal, gravaria, e o caso de uso recusaria depois. Aqui só chegam as que
 * o domínio aceita: ramo `1.1.3.1 ADIANTAMENTOS CONCEDIDOS` e ANALÍTICAS.
 *
 * ⚠️ E O RECORTE REPETE A REGRA DO DOMÍNIO, NÃO A SUBSTITUI. Quem recusa continua sendo
 * `cadastrarParametroDoAdiantamentoSalarial` — esta consulta apenas evita oferecer o que será
 * recusado. Filtro de tela não é autorização nem validação: é cortesia.
 *
 * ⚠️ LISTA VAZIA É INFORMAÇÃO, e a tela a trata: significa que o plano do ente não tem o ramo
 * semeado, e o formulário diz o que fazer em vez de mostrar um seletor morto.
 */
export async function contasParaOAdiantamentoSalarial(): Promise<readonly { readonly valor: string; readonly rotulo: string }[]> {
  const prisma = cliente();
  const contas = await prisma.contaPcasp.findMany({
    where: { codigo: { startsWith: `${RAMO_DO_ADIANTAMENTO_CONCEDIDO}.` }, analitica: true },
    orderBy: { codigo: "asc" },
    select: { id: true, codigo: true, nome: true },
  });
  return contas.map((c) => ({ valor: c.id, rotulo: `${c.codigo} — ${c.nome}` }));
}

/**
 * GRAVA A PRÓXIMA VERSÃO DO PARÂMETRO. A ilha manda o percentual EM PORCENTO (40), como a norma o
 * escreve; a conversão para fração acontece aqui, na borda — o mesmo que o `FormTabela` faz com a
 * alíquota, e o mesmo que o parâmetro do 13º já fazia. Nenhuma recusa do domínio é traduzida:
 * elas sobem como vieram, porque é a mensagem delas que diz ao operador o que corrigir.
 */
export async function criarParametroDoAdiantamentoSalarial(c: Campos): Promise<string> {
  return comEscritaAutenticada("CONFIGURAR_PARAMETRO_DO_ADIANTAMENTO_SALARIAL", async (criadoPor) => {
    const r = await cadastrarParametroDoAdiantamentoSalarial(cliente(), {
      competencia: t(c, "competencia"),
      // ⚠️ `decimalDaTela` devolve STRING (normaliza "1.234,56" para "1234.56"). A tela recebe o
      // percentual EM PORCENTO e o parâmetro guarda FRAÇÃO: sem a divisão por 100 o ente digitaria
      // 40 e o CHECK `ck_parametro_adiant_sal_percentual` (maior que 0 e até 1) recusaria.
      percentualDoAdiantamento: new Decimal(decimalDaTela(t(c, "percentualDoAdiantamento"))).div(100).toFixed(4),
      baseDoAdiantamento: t(c, "baseDoAdiantamento") as "REMUNERACAO_DO_MES_ANTERIOR" | "REMUNERACAO_PROJETADA_DO_MES",
      // ⚠️ SEM `?? "FECHADO"` NESTA LINHA. O campo é obrigatório no domínio de propósito: um
      // default aqui faria a borda declarar, em nome do município, que congelar o cálculo basta
      // para descontar do servidor — e fechar não é pagar.
      estadoMinimoParaAbater: t(c, "estadoMinimoParaAbater") as "FECHADO" | "CERTIFICADO" | "PAGO",
      rubricaDoAdiantamentoId: t(c, "rubricaDoAdiantamentoId"),
      rubricaDoAbatimentoId: t(c, "rubricaDoAbatimentoId"),
      // ⚠️ A CONTA EM QUE O VALE VIRA DIREITO (V13 rodada 4). Sem esta linha o typecheck do APP
      // acusava, e foi ele que achou a metade que faltava: o domínio passou a exigir a conta e a
      // porta continuava não a mandando — a tela gravaria nada, porque o Zod recusa a entrada.
      contaDoAdiantamentoId: t(c, "contaDoAdiantamentoId"),
      atoEsfera: t(c, "atoEsfera") as "FEDERAL" | "ESTADUAL" | "MUNICIPAL",
      atoTipo: t(c, "atoTipo") as Parameters<typeof cadastrarParametroDoAdiantamentoSalarial>[1]["atoTipo"],
      atoNumero: t(c, "atoNumero"),
      atoAno: Number(t(c, "atoAno")),
      atoDispositivo: t(c, "atoDispositivo"),
      atoEmenta: t(c, "atoEmenta"),
      criadoPor,
    });
    return `${r.parametroId}|${r.versao}`;
  });
}
