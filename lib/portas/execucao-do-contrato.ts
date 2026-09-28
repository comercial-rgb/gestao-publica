import { diaCivil, diaCivilBr } from "../../packages/datas/index.js";
import { toMoney } from "../../packages/contracts/index.js";
import { CONTA_FORNECEDORES_A_PAGAR, roteiroLiquidacao, elementoDebitaEstoque } from "../../modules/m01-core-contabil/roteiros";
import { naturezaDoEmpenho } from "../../modules/m05-despesa/consultas";
import { alcanceNoContrato, type AlcanceNoContrato } from "../../modules/m11-licitacoes/acesso-da-fiscalizacao.js";
import { criarM05DepsComContratos } from "../../modules/m11-licitacoes/adapter-m05.js";
import { saldoDoDocumentoFiscal } from "../../modules/m11-licitacoes/documento-fiscal.js";
import { execucaoDoContrato, type ExecucaoDoContrato, type OrdemNaTela } from "../../modules/m11-licitacoes/execucao-do-contrato.js";
import { liquidarParcelasDoContrato } from "../../modules/m11-licitacoes/liquidacao-da-parcela.js";
import {
  cancelarSaldoDaOrdemDeServico,
  criarRascunhoDeOrdemDeServico,
  decidirControversia,
  descartarRascunhoDeOrdemDeServico,
  emitirOrdemDeServico,
  estornarMedicaoDaOrdem,
  estornarRecebimentoDefinitivo,
  movimentarExecucaoDaOrdemDeServico,
  registrarMedicaoDaOrdem,
  registrarRecebimentoDefinitivo,
  registrarRecebimentoProvisorio,
} from "../../modules/m11-licitacoes/ordem-de-servico.js";
import { medirOrdemPelaPlanilha, versoesParaMedirAOrdem, type VersaoParaMedir } from "../../modules/m11-licitacoes/medicao-pela-planilha.js";
import { estornarAditivoPorItens, preverAditivoPorItens, registrarAditivoPorItens, type ComposicaoDoAditivo } from "../../modules/m11-licitacoes/aditivo-por-itens.js";
import { historicosDosItens, versaoNoDia } from "../../modules/m11-licitacoes/versoes-dos-itens.js";
import { designacaoVigenteEm } from "../../modules/m33-folha/certificacao.js";
import { cliente } from "./cliente";
import { acoesPermitidas } from "./molde";
import { comEscritaAutenticada, exigirSessao, type Identidade } from "./sessao";

/**
 * ═══ A EXECUÇÃO DO CONTRATO NA TELA (V7 M2 U4) — ordens, medições, recebimentos e a liquidação da parcela ═══
 *
 * A porta NÃO decide regra: projeta o que o domínio já decidiu. A projeção (fiscalização ou financeira) sai do mesmo
 * `alcanceNoContrato` da página; os formulários só aparecem para quem pode praticar o ato (ação E designação vigente
 * hoje, ou a leitura financeira com LIQUIDAR), e o motivo aparece para quem não pode. O servidor recusa de novo.
 *
 * As OPÇÕES são o recorte do servidor: itens deste contrato, fiscais vigentes deste contrato, empenhos vivos que
 * informaram este contrato (sem os de material), documentos de cobrança conferidos do contratado com saldo. Nenhuma
 * lista é "a primeira opção" nem "o maior saldo": quem escolhe é a pessoa, e o domínio confere.
 */



export interface PapeisNaExecucao {
  readonly gestor: boolean;
  readonly fiscal: boolean;
  readonly recebedor: boolean;
  readonly podeEmitir: boolean;
  readonly podeMedir: boolean;
  readonly podeReceberProvisorio: boolean;
  readonly podeReceberDefinitivo: boolean;
  /**
   * V9 N4 — desfazer um termo definitivo já assinado. Ação PRÓPRIA e autoridade de recebedor:
   * receber é ordinário, desfazer é excepcional. Um só interruptor para as duas coisas daria o
   * poder de desfazer a todo mundo que pode receber, no dia em que a funcionalidade entrasse.
   */
  readonly podeEstornarRecebimento: boolean;
  readonly podeLiquidar: boolean;
  /** V7 M2 U5 — registrar (e prever) aditivo por itens: ato do ente, pela ação de registrar aditivo; estornar, pela do movimento. */
  readonly podeRegistrarAditivo: boolean;
  readonly podeEstornarAditivo: boolean;
  /** A frase que explica a quem não recebe um formulário por que ele não aparece. */
  readonly motivos: { readonly emitir: string; readonly medir: string; readonly provisorio: string; readonly definitivo: string; readonly liquidar: string; readonly aditivo: string };
}

export interface OpcoesDaExecucao {
  readonly itensDoContrato: readonly { readonly valor: string; readonly rotulo: string; readonly aAutorizar: string; readonly unidade: string }[];
  readonly fiscais: readonly { readonly valor: string; readonly rotulo: string }[];
  readonly empenhos: readonly { readonly valor: string; readonly rotulo: string }[];
  readonly documentos: readonly { readonly valor: string; readonly rotulo: string; readonly aLiquidar: string }[];
}

export interface ExecucaoParaTela extends ExecucaoDoContrato {
  readonly alcance: AlcanceNoContrato;
  readonly papeis: PapeisNaExecucao;
  readonly opcoes: OpcoesDaExecucao;
  readonly hoje: string;
}

const brl = (v: string): string => toMoney(v).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");

export async function execucaoDoContratoPara(sessao: Identidade, contratoId: string): Promise<ExecucaoParaTela | null> {
  const prisma = cliente();
  const alcance = await alcanceNoContrato(prisma, sessao.identificador, contratoId);
  if (!alcance.fiscalizacao && !alcance.financeira) return null;
  const contrato = await prisma.contrato.findUnique({ where: { id: contratoId }, select: { contratadoDocumento: true } });
  if (contrato === null) return null;
  const [base, permitidas, minhas, fiscais, empenhos, documentos] = await Promise.all([
    execucaoDoContrato(prisma, contratoId, alcance.fiscalizacao ? "FISCALIZACAO" : "FINANCEIRA"),
    acoesPermitidas(["EMITIR_ORDEM_DE_SERVICO_DO_CONTRATO", "REGISTRAR_MEDICAO_DE_OBRA", "REGISTRAR_RECEBIMENTO_PROVISORIO", "REGISTRAR_RECEBIMENTO_DEFINITIVO", "ESTORNAR_RECEBIMENTO_DEFINITIVO", "LIQUIDAR", "REGISTRAR_ADITIVO", "ESTORNAR_MOVIMENTO_CONTRATUAL"]),
    prisma.designacaoNoContrato.findMany({ where: { contratoId, usuario: { identificador: sessao.identificador } }, select: { papel: true, vigenciaInicio: true, vigenciaFim: true, revogacao: { select: { dataEfeito: true } } } }),
    prisma.designacaoNoContrato.findMany({ where: { contratoId, papel: "FISCAL" }, select: { id: true, atoDesignacao: true, vigenciaInicio: true, vigenciaFim: true, revogacao: { select: { dataEfeito: true } }, pessoa: { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } } } }),
    prisma.empenho.findMany({ where: { contratoId, estornoDeId: null, estornos: { none: {} } }, orderBy: { data: "desc" }, take: 100, select: { id: true, numero: true, valor: true, ficha: { select: { naturezaDespesa: { select: { codElemento: true, codigoCompleto: true } } } } } }),
    prisma.documentoFiscalRecebido.findMany({
      where: { OR: [{ contratoId }, { contratoId: null, emitente: { documento: contrato.contratadoDocumento } }], movimentos: { some: { tipo: "CONFERENCIA" }, none: { tipo: { in: ["CANCELAMENTO", "SUBSTITUICAO"] } } } },
      orderBy: { dataRecebimento: "desc" },
      take: 100,
      select: { id: true, modelo: true, serie: true, numero: true, dataEmissao: true, valorTotal: true },
    }),
  ]);
  const agora = new Date();
  const vigente = (papel: string): boolean => minhas.some((d) => d.papel === papel && designacaoVigenteEm(d, agora));
  const gestor = vigente("GESTOR");
  const fiscal = vigente("FISCAL");
  const recebedor = vigente("RECEBEDOR_DEFINITIVO");
  const podeLiquidar = alcance.financeira && permitidas.has("LIQUIDAR");
  const docsComSaldo = (await Promise.all(documentos.map(async (d) => ({ d, s: await saldoDoDocumentoFiscal(prisma, d.id) })))).filter((x) => x.s.aLiquidar.gt(0));
  return {
    ...base,
    alcance,
    hoje: diaCivil(agora),
    papeis: {
      gestor, fiscal, recebedor,
      podeEmitir: gestor && permitidas.has("EMITIR_ORDEM_DE_SERVICO_DO_CONTRATO"),
      podeMedir: fiscal && permitidas.has("REGISTRAR_MEDICAO_DE_OBRA"),
      podeReceberProvisorio: fiscal && permitidas.has("REGISTRAR_RECEBIMENTO_PROVISORIO"),
      podeReceberDefinitivo: recebedor && permitidas.has("REGISTRAR_RECEBIMENTO_DEFINITIVO"),
      podeEstornarRecebimento: recebedor && permitidas.has("ESTORNAR_RECEBIMENTO_DEFINITIVO"),
      podeLiquidar,
      podeRegistrarAditivo: permitidas.has("REGISTRAR_ADITIVO"),
      podeEstornarAditivo: permitidas.has("ESTORNAR_MOVIMENTO_CONTRATUAL"),
      motivos: {
        aditivo: "Registrar aditivo é da área de contratos (a ação de registrar aditivo no seu perfil).",
        emitir: gestor ? "Seu perfil não tem a ação de emitir ordem de serviço." : "Criar, emitir, suspender e cancelar saldo de ordem é do GESTOR designado e vigente neste contrato.",
        medir: fiscal ? "Seu perfil não tem a ação de registrar medição." : "Medir a ordem é do FISCAL designado e vigente neste contrato.",
        provisorio: fiscal ? "Seu perfil não tem a ação de registrar o recebimento provisório." : "O recebimento provisório é do FISCAL designado e vigente (art. 140, I, a).",
        definitivo: recebedor ? "Seu perfil não tem a ação de registrar o recebimento definitivo." : "Decidir a controvérsia e receber em definitivo é do RECEBEDOR designado e vigente (art. 140, I, b).",
        liquidar: alcance.financeira ? "Seu perfil não tem a ação de liquidar." : "A liquidação é da área financeira (leitura da despesa e a ação de liquidar).",
      },
    },
    opcoes: {
      itensDoContrato: base.itensDoContrato.map((i) => ({ valor: i.id, rotulo: `${i.numero} — ${i.descricao} (${i.unidade}; R$ ${brl(i.valorUnitario)} cada)`, aAutorizar: i.aAutorizar, unidade: i.unidade })),
      fiscais: fiscais.filter((f) => designacaoVigenteEm(f, agora)).map((f) => ({ valor: f.id, rotulo: `${f.pessoa.versoes[0]?.nome ?? f.pessoa.documento} (${f.atoDesignacao})` })),
      empenhos: empenhos.filter((e) => !elementoDebitaEstoque(e.ficha.naturezaDespesa.codElemento)).map((e) => ({ valor: e.id, rotulo: `${e.numero} — ${e.ficha.naturezaDespesa.codigoCompleto} — R$ ${brl(e.valor.toFixed(2))}` })),
      documentos: docsComSaldo.map(({ d, s }) => ({ valor: d.id, rotulo: `${d.modelo} ${d.numero}/${d.serie} de ${diaCivilBr(d.dataEmissao)} — total R$ ${brl(d.valorTotal.toFixed(2))}, a liquidar R$ ${brl(s.aLiquidar.toFixed(2))}`, aLiquidar: s.aLiquidar.toFixed(2) })),
    },
  };
}

/**
 * V7 M2 U7 — a medição da ordem PELA PLANILHA na página da ordem: as versões de planilha do contrato com a conciliação de
 * cada serviço (a mesma do ato) e os itens da ordem com vínculo vivo à planilha (que não se medem avulsos). Só para quem
 * pode medir; os outros não recebem as versões.
 */
export async function medicaoPelaPlanilhaParaTela(e: ExecucaoParaTela, ordemId: string): Promise<{ readonly versoes: readonly VersaoParaMedir[]; readonly itensDaPlanilha: readonly number[] }> {
  if (!e.papeis.podeMedir) return { versoes: [], itensDaPlanilha: [] };
  const prisma = cliente();
  const [versoes, ligados] = await Promise.all([
    versoesParaMedirAOrdem(prisma, ordemId),
    prisma.vinculoDeItemDaPlanilhaAoContrato.findMany({ where: { revogacao: null, itemDoContrato: { itensDeOrdemDeServico: { some: { ordemId } } } }, select: { itemDoContrato: { select: { numero: true } } } }),
  ]);
  return { versoes, itensDaPlanilha: [...new Set(ligados.map((l) => l.itemDoContrato.numero))].sort((a, b) => a - b) };
}

/** A ORDEM na execução do contrato — `null` se não é deste contrato (a página responde 404). */
export function ordemDaExecucao(e: ExecucaoParaTela, ordemId: string): OrdemNaTela | null {
  return e.ordens.find((o) => o.id === ordemId) ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// OS ATOS — cada um pela escrita autenticada com a ação do censo; a regra é do domínio
// ═══════════════════════════════════════════════════════════════════════════════

type Campos = Readonly<Record<string, string>>;
const t = (c: Campos, k: string): string => (c[k] ?? "").trim();
const decimal = (v: string): string => v.trim().replace(/\./g, "").replace(",", ".");
const br = (dia: string): string => dia.split("-").reverse().join("/");

/** Os campos `prefixo.<id>` preenchidos, na ordem do formulário. */
function porItem(c: Campos, prefixo: string): { readonly id: string; readonly valor: string }[] {
  return Object.entries(c).filter(([k, v]) => k.startsWith(`${prefixo}.`) && v.trim() !== "").map(([k, v]) => ({ id: k.slice(prefixo.length + 1), valor: v.trim() }));
}

export async function rascunhoNaTela(contratoId: string, c: Campos): Promise<string> {
  const itens = porItem(c, "item").map((x) => ({ itemDoContratoId: x.id, quantidade: decimal(x.valor) }));
  const r = await comEscritaAutenticada("EMITIR_ORDEM_DE_SERVICO_DO_CONTRATO", (criadoPor) =>
    criarRascunhoDeOrdemDeServico(cliente(), {
      contratoId, finalidade: t(c, "finalidade"), ...(t(c, "local") !== "" ? { local: t(c, "local") } : {}), ...(t(c, "unidadeSolicitante") !== "" ? { unidadeSolicitante: t(c, "unidadeSolicitante") } : {}),
      inicioPrevisto: t(c, "inicioPrevisto"), fimPrevisto: t(c, "fimPrevisto"), condicoesDeRecebimento: t(c, "condicoes"), fiscalDesignacaoId: t(c, "fiscalDesignacaoId"),
      ...(t(c, "empenhoId") !== "" ? { empenhoId: t(c, "empenhoId") } : {}), itens, criadoPor,
    })
  );
  return `Rascunho da ordem de serviço nº ${r.numero}/${r.ano} criado: R$ ${brl(r.valor)} previstos em ${itens.length} item(ns). O saldo do contrato só se compromete na emissão.`;
}

export async function emitirNaTela(c: Campos): Promise<string> {
  const r = await comEscritaAutenticada("EMITIR_ORDEM_DE_SERVICO_DO_CONTRATO", (criadoPor) => emitirOrdemDeServico(cliente(), { ordemId: t(c, "ordemId"), inicioAutorizado: t(c, "inicioAutorizado"), criadoPor }));
  return `Ordem de serviço emitida: R$ ${brl(r.valor)} autorizados a partir de ${br(t(c, "inicioAutorizado"))}. O espelho foi gravado (sha256 ${r.sha256.slice(0, 12)}…). Emitir não empenha nem paga.`;
}

export async function descartarNaTela(c: Campos): Promise<string> {
  await comEscritaAutenticada("EMITIR_ORDEM_DE_SERVICO_DO_CONTRATO", (criadoPor) => descartarRascunhoDeOrdemDeServico(cliente(), { ordemId: t(c, "ordemId"), motivo: t(c, "motivo"), criadoPor }));
  return "Rascunho descartado. Ele continua no histórico e não compromete saldo.";
}

export async function cancelarSaldoNaTela(c: Campos): Promise<string> {
  const itens = porItem(c, "cancelar").map((x) => ({ itemDaOrdemId: x.id, quantidade: decimal(x.valor) }));
  const r = await comEscritaAutenticada("EMITIR_ORDEM_DE_SERVICO_DO_CONTRATO", (criadoPor) => cancelarSaldoDaOrdemDeServico(cliente(), { ordemId: t(c, "ordemId"), data: t(c, "data"), motivo: t(c, "motivo"), itens, criadoPor }));
  return `Saldo não executado cancelado em ${r.cancelados} item(ns); o medido continua comprometido.${r.empenhoIndicado === null ? "" : ` O empenho ${r.empenhoIndicado} não foi anulado: a anulação é ato da despesa.`}`;
}

export async function movimentarNaTela(c: Campos): Promise<string> {
  const tipo = t(c, "tipo") === "RETOMADA" ? "RETOMADA" : "SUSPENSAO";
  await comEscritaAutenticada("EMITIR_ORDEM_DE_SERVICO_DO_CONTRATO", (criadoPor) => movimentarExecucaoDaOrdemDeServico(cliente(), { ordemId: t(c, "ordemId"), tipo, data: t(c, "data"), motivo: t(c, "motivo"), criadoPor }));
  return tipo === "SUSPENSAO" ? `Execução suspensa a partir de ${br(t(c, "data"))}. O período suspenso não se mede.` : `Execução retomada em ${br(t(c, "data"))}.`;
}

export async function medirOrdemNaTela(c: Campos): Promise<string> {
  const itens = porItem(c, "medir").map((x) => ({ itemDaOrdemId: x.id, quantidade: decimal(x.valor) }));
  const r = await comEscritaAutenticada("REGISTRAR_MEDICAO_DE_OBRA", (criadoPor) =>
    registrarMedicaoDaOrdem(cliente(), { ordemId: t(c, "ordemId"), diaInicio: t(c, "diaInicio"), diaFim: t(c, "diaFim"), ...(t(c, "observacao") !== "" ? { observacao: t(c, "observacao") } : {}), itens, criadoPor })
  );
  const falta = r.aExecutar.filter((x) => x.quantidade !== "0.0000");
  return `Medição nº ${r.numero} registrada: R$ ${brl(r.valor)} em ${itens.length} item(ns).${falta.length === 0 ? " Nada mais a executar nesses itens." : ` Ainda a executar: ${falta.map((x) => `item ${x.item}, ${x.quantidade.replace(/\.?0+$/, "").replace(".", ",")}`).join("; ")}.`} Ela precisa do recebimento provisório do fiscal.`;
}

/** V7 M2 U7 — medir a ordem pelos serviços da versão escolhida; as evidências vão pelo M22 na mesma transação. */
export async function medirPelaPlanilhaNaTela(c: Campos, arquivos: readonly File[]): Promise<string> {
  const itens = porItem(c, "planilha").map((x) => ({ itemDaPlanilhaId: x.id, quantidade: decimal(x.valor) })).filter((x) => x.quantidade !== "" && Number(x.quantidade) !== 0);
  if (itens.length === 0) throw new Error("Informe a quantidade medida de ao menos um serviço. Nada foi gravado.");
  const evidencias = await Promise.all(arquivos.filter((a) => a.size > 0).map(async (a) => ({ nomeOriginal: a.name, mimeType: a.type, conteudo: new Uint8Array(await a.arrayBuffer()) })));
  const r = await comEscritaAutenticada("REGISTRAR_MEDICAO_DE_OBRA", (criadoPor) =>
    medirOrdemPelaPlanilha(cliente(), { ordemId: t(c, "ordemId"), planilhaId: t(c, "planilhaId"), diaInicio: t(c, "diaInicio"), diaFim: t(c, "diaFim"), ...(t(c, "observacao") !== "" ? { observacao: t(c, "observacao") } : {}), itens, evidencias, criadoPor })
  );
  const saldos = r.itens.map((i) => `serviço ${i.codigo}: acumulado ${qtd(i.acumulado)}, saldo na planilha ${qtd(i.saldoNaPlanilha)}`).join("; ");
  return `Medição nº ${r.numero} registrada pela versão ${r.versao} da planilha: R$ ${brl(r.valor)} no contrato (R$ ${brl(r.valorNaPlanilha)} a preços da planilha), ${r.evidencias} evidência(s). ${saldos}. Ela precisa do recebimento provisório do fiscal.`;
}

/** V7 M2 U7 — estornar a medição que ainda não foi recebida. */
export async function estornarMedicaoNaTela(c: Campos): Promise<string> {
  const r = await comEscritaAutenticada("REGISTRAR_MEDICAO_DE_OBRA", (criadoPor) => estornarMedicaoDaOrdem(cliente(), { medicaoId: t(c, "medicaoId"), motivo: t(c, "motivo"), criadoPor }));
  return `Medição nº ${r.numero} estornada (R$ ${brl(r.valor)}): continua no histórico, e as quantidades voltam a executar.`;
}

export async function provisorioNaTela(c: Campos): Promise<string> {
  const conformes = porItem(c, "conforme");
  const itens = conformes.map((x) => ({
    itemMedidoId: x.id, quantidadeConforme: decimal(x.valor), quantidadeEmControversia: decimal(t(c, `controversia.${x.id}`) || "0"),
    ...(t(c, `motivo.${x.id}`) !== "" ? { motivo: t(c, `motivo.${x.id}`) } : {}),
  }));
  const r = await comEscritaAutenticada("REGISTRAR_RECEBIMENTO_PROVISORIO", (criadoPor) => registrarRecebimentoProvisorio(cliente(), { medicaoId: t(c, "medicaoId"), data: t(c, "data"), verificacoes: t(c, "verificacoes"), itens, criadoPor }));
  return toMoney(r.emControversia).gt(0)
    ? `Recebimento provisório registrado: R$ ${brl(r.conforme)} conforme; R$ ${brl(r.emControversia)} em controvérsia aguardam a decisão do recebedor definitivo.`
    : `Recebimento provisório registrado: R$ ${brl(r.conforme)} conforme, sem controvérsia.`;
}

export async function decidirNaTela(c: Campos): Promise<string> {
  const resultado = t(c, "resultado") === "ACEITA" ? "ACEITA" : "REJEITADA";
  const r = await comEscritaAutenticada("REGISTRAR_RECEBIMENTO_DEFINITIVO", (criadoPor) => decidirControversia(cliente(), { conferenciaId: t(c, "conferenciaId"), resultado, fundamento: t(c, "fundamento"), data: t(c, "data"), criadoPor }));
  return resultado === "ACEITA"
    ? `Controvérsia aceita: ${r.quantidade.replace(/\.?0+$/, "").replace(".", ",")} unidade(s), R$ ${brl(r.valor)}, ficam elegíveis ao recebimento definitivo do complemento.`
    : `Controvérsia rejeitada: glosa confirmada de R$ ${brl(r.valor)}. O registro da divergência permanece.`;
}

export async function definitivoNaTela(c: Campos): Promise<string> {
  const itens = porItem(c, "receber").filter((x) => Number(decimal(x.valor)) > 0).map((x) => ({ itemMedidoId: x.id, quantidade: decimal(x.valor) }));
  const r = await comEscritaAutenticada("REGISTRAR_RECEBIMENTO_DEFINITIVO", (criadoPor) => registrarRecebimentoDefinitivo(cliente(), { medicaoId: t(c, "medicaoId"), data: t(c, "data"), conclusao: t(c, "conclusao"), itens, criadoPor }));
  return `Recebimento definitivo nº ${r.numero} registrado: R$ ${brl(r.valor)}.${r.pendencias.length === 0 ? " Sem pendência nesta medição." : ` Pendências: ${r.pendencias.join("; ")}.`} Receber não liquida: a liquidação é da área financeira.`;
}

/**
 * V9 N4 — ESTORNAR O RECEBIMENTO DEFINITIVO. Ação PRÓPRIA (`ESTORNAR_RECEBIMENTO_DEFINITIVO`), e
 * não a de receber: desfazer um termo assinado é excepcional e reabre quantidade já fechada.
 *
 * ⚠️ A FRASE DIZ O EFEITO, porque o efeito é invisível na linha do recebimento: o termo continua
 * lá, com o seu número e o seu valor, e o que mudou foi o ELEGÍVEL da medição.
 */
export async function estornarRecebimentoNaTela(c: Campos): Promise<string> {
  const r = await comEscritaAutenticada("ESTORNAR_RECEBIMENTO_DEFINITIVO", (criadoPor) =>
    estornarRecebimentoDefinitivo(cliente(), { recebimentoId: t(c, "recebimentoId"), data: t(c, "data"), motivo: t(c, "motivo"), criadoPor })
  );
  return (
    `Recebimento definitivo nº ${r.numero} (R$ ${brl(r.valor)}) estornado. O termo original continua no histórico, ` +
    `com o seu documento; a quantidade volta a ser elegível e o recebimento corrigido pode ser registrado. ` +
    `O termo do estorno tem documento próprio.`
  );
}

export async function liquidarParcelaNaTela(c: Campos): Promise<string> {
  const parcelas = porItem(c, "parcela").map((x) => ({ recebimentoDefinitivoId: x.id, valor: decimal(x.valor) })).filter((x) => Number(x.valor) > 0);
  const empenhoId = t(c, "empenhoId");
  const prisma = cliente();
  const natureza = await naturezaDoEmpenho(prisma, empenhoId);
  if (natureza === null) throw new Error("Empenho não encontrado. Nada foi gravado.");
  const r = await comEscritaAutenticada("LIQUIDAR", (criadoPor) =>
    liquidarParcelasDoContrato(prisma, { empenhoId, documentoFiscalId: t(c, "documentoFiscalId"), data: t(c, "data"), parcelas, criadoPor }, roteiroLiquidacao({ codElemento: natureza.codElemento, obrigacaoAPagar: CONTA_FORNECEDORES_A_PAGAR }), criarM05DepsComContratos(prisma))
  );
  return r.jaExistia
    ? `Esta liquidação já estava gravada (${r.numero}, R$ ${brl(r.valor)}): nada foi lançado de novo.`
    : `Liquidação ${r.numero} registrada na despesa: R$ ${brl(r.valor)} em ${parcelas.length} parcela(s) recebida(s). O pagamento segue pela despesa.`;
}

// ── V7 M2 U5 — o aditivo por itens ──

const qtd = (v: string): string => v.replace(/\.?0+$/, "").replace(".", ",");
const sinal = (v: string): string => (v.startsWith("-") ? `−R$ ${brl(v.slice(1))}` : `R$ ${brl(v)}`);

function naturezaNaFrase(c: ComposicaoDoAditivo): string {
  return c.natureza === "ACRESCIMO" ? `acréscimo de R$ ${brl(c.variacao)}` : c.natureza === "SUPRESSAO" ? `supressão de R$ ${brl(c.variacao.slice(1))}` : "sem variação de valor";
}

function linhasNaFrase(c: ComposicaoDoAditivo): string {
  return c.linhas.map((l) => `item ${l.item}${l.incluido ? " (incluído)" : ""}: ${qtd(l.quantidadeAnterior)} → ${qtd(l.quantidade)} ${l.unidade}, R$ ${brl(l.valorUnitarioAnterior)} → R$ ${brl(l.valorUnitario)}${l.medidoAntes !== "0.0000" ? ` (${qtd(l.medidoAntes)} medido antes da vigência fica ao preço anterior)` : ""}, ${sinal(l.variacao)}`).join("; ");
}

/** O termo digitado na tela: só os itens cujo campo difere da versão vigente no início da vigência, e a inclusão se houver descrição. */
async function termoDaTela(contratoId: string, c: Campos) {
  const vigenciaInicio = t(c, "vigenciaInicio");
  const historicos = await historicosDosItens(cliente(), { contratoId });
  const alteracoes = porItem(c, "aditivoQtd").flatMap((x) => {
    const h = historicos.get(x.id);
    if (h === undefined) return [{ itemDoContratoId: x.id, quantidade: decimal(x.valor), valorUnitario: decimal(t(c, `aditivoUnit.${x.id}`)) }];
    const v = versaoNoDia(h, /^\d{4}-\d{2}-\d{2}$/.test(vigenciaInicio) ? vigenciaInicio : diaCivil(new Date()));
    const quantidade = decimal(x.valor);
    const valorUnitario = decimal(t(c, `aditivoUnit.${x.id}`) || v.valorUnitario.toFixed(4));
    return v.quantidade.eq(quantidade) && v.valorUnitario.eq(valorUnitario) ? [] : [{ itemDoContratoId: x.id, quantidade, valorUnitario }];
  });
  const inclusoes = t(c, "incluirDescricao") === "" ? [] : [{ descricao: t(c, "incluirDescricao"), unidade: t(c, "incluirUnidade"), quantidade: decimal(t(c, "incluirQuantidade")), valorUnitario: decimal(t(c, "incluirUnitario")) }];
  return { contratoId, numeroAditivo: t(c, "numeroAditivo"), dataAssinatura: t(c, "dataAssinatura"), vigenciaInicio, fundamento: t(c, "fundamento"), motivo: t(c, "motivo"), alteracoes, inclusoes };
}

export async function previaDoAditivoNaTela(contratoId: string, c: Campos): Promise<string> {
  const sessao = await exigirSessao();
  const r = await preverAditivoPorItens(cliente(), { ...(await termoDaTela(contratoId, c)), criadoPor: sessao.identificador });
  return `Composição conferida, nada foi gravado: ${naturezaNaFrase(r)} — ${linhasNaFrase(r)}. Confira com o termo assinado e informe a variação dele para registrar.`;
}

export async function aditivoNaTela(contratoId: string, c: Campos): Promise<string> {
  const termo = await termoDaTela(contratoId, c);
  const r = await comEscritaAutenticada("REGISTRAR_ADITIVO", (criadoPor) => registrarAditivoPorItens(cliente(), { ...termo, variacaoDoTermo: decimal(t(c, "variacaoDoTermo")), criadoPor }));
  return `Aditivo nº ${termo.numeroAditivo} registrado: ${naturezaNaFrase(r.composicao)} no valor do contrato, com ${r.composicao.linhas.length} item(ns) em nova versão a partir de ${br(termo.vigenciaInicio)}. Ordens já emitidas e períodos já medidos mantêm o preço deles.`;
}

export async function estornarAditivoNaTela(c: Campos): Promise<string> {
  const r = await comEscritaAutenticada("ESTORNAR_MOVIMENTO_CONTRATUAL", (criadoPor) => estornarAditivoPorItens(cliente(), { aditivoId: t(c, "aditivoId"), data: t(c, "data"), motivo: t(c, "motivo"), criadoPor }));
  return `Aditivo estornado: as versões dos itens deixaram de valer${r.movimentoEstornoId === null ? "" : " e a variação de valor foi estornada no contrato"}. O registro original continua no histórico.`;
}
