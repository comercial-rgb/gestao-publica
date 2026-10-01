import {
  classificarRetencaoPropria,
  ehTributoDoProprioTesouro,
  listarClassificacoesDaRetencaoPropria,
} from "../../modules/m07-extraorcamentario/retencao-propria.js";
import { regularizarConsignacaoPropria } from "../../modules/m04-receita/receita-por-retencao.js";
import { saldoReconhecidoDe } from "../../modules/m04-receita/reconhecimento.js";
import { toMoney } from "../../packages/contracts/index.js";
import { sinalDaReceitaRealizada } from "../../modules/m04-receita/dominio.js";
import { formatarMoeda } from "../format/moeda";
import {
  FAMILIA_DA_VPA_DO_FATO,
  FAMILIA_DO_CREDITO_TRIBUTARIO,
  FATOS_DA_RETENCAO_PROPRIA,
  ROTULO_DO_FATO_PROPRIO,
  type FatoDaRetencaoPropria,
} from "../../modules/m07-extraorcamentario/dominio.js";
import { diaCivil, diaCivilBr } from "../../packages/datas/index.js";
import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";

/**
 * V26 — O IR E O ISS RETIDOS PELO PRÓPRIO MUNICÍPIO, NA TELA: onde o ente diz que eles são receita, com que
 * natureza, destinação e contas. A regra (natureza do principal, contas analíticas da família, append-only) é do
 * domínio, dentro da transação; esta porta só lê e encaminha.
 */

export interface ClassificacaoNaTela {
  readonly id: string;
  readonly fato: FatoDaRetencaoPropria;
  readonly rotulo: string;
  readonly tipoConsignacao: string;
  readonly natureza: string;
  readonly fonte: string;
  readonly contaCredito: string;
  readonly contaVpa: string;
  readonly tesouro: string | null;
  readonly vigenteDesde: Date;
  /** A data da coluna (`@db.Date`, meia-noite UTC), lida no eixo dela — não é instante a converter. */
  readonly vigenteDesdeTexto: string;
  readonly fundamento: string;
  readonly por: string;
  /** É a decisão que vale hoje para o fato (a de maior vigência até hoje). */
  readonly vigente: boolean;
}

export async function lerClassificacoesDaRetencaoPropria(): Promise<readonly ClassificacaoNaTela[]> {
  await exigirLeituraDoEnte("CONSULTAR_FINANCEIRO");
  const prisma = cliente();
  const todas = await listarClassificacoesDaRetencaoPropria(prisma);
  const entidades = await prisma.versaoDaEntidadeContabil.findMany({
    orderBy: { versao: "desc" },
    select: { entidadeId: true, nome: true },
  });
  const nomeDa = new Map<string, string>();
  for (const e of entidades) if (!nomeDa.has(e.entidadeId)) nomeDa.set(e.entidadeId, e.nome);
  // O dia civil do ente, no mesmo eixo de `vigenteDesde` (data à meia-noite UTC).
  const hoje = new Date(`${diaCivil(new Date())}T00:00:00.000Z`);
  const vigentes = new Set<string>();
  for (const fato of FATOS_DA_RETENCAO_PROPRIA) {
    const v = todas.find((c) => c.fato === fato && c.vigenteDesde <= hoje);
    if (v !== undefined) vigentes.add(v.id);
  }
  return todas.map((c) => ({
    id: c.id,
    fato: c.fato,
    rotulo: ROTULO_DO_FATO_PROPRIO[c.fato],
    tipoConsignacao: c.tipoConsignacaoCodigo,
    natureza: c.naturezaReceitaCodigo,
    fonte: c.fonteCodigo,
    contaCredito: c.contaCredito,
    contaVpa: c.contaVpa,
    tesouro: c.entidadeTitularId === null ? null : (nomeDa.get(c.entidadeTitularId) ?? null),
    vigenteDesde: c.vigenteDesde,
    vigenteDesdeTexto: diaCivilBr(c.vigenteDesde, "UTC"),
    fundamento: c.fundamento,
    por: c.criadoPor,
    vigente: vigentes.has(c.id),
  }));
}

export interface OpcoesDaClassificacao {
  readonly fatos: readonly { readonly fato: FatoDaRetencaoPropria; readonly rotulo: string }[];
  readonly tipos: readonly { readonly codigo: string; readonly descricao: string }[];
  readonly naturezas: readonly { readonly codigo: string; readonly descricao: string }[];
  readonly fontes: readonly { readonly codigo: string; readonly descricao: string }[];
  readonly contasCredito: readonly { readonly codigo: string; readonly nome: string }[];
  readonly contasVpa: readonly { readonly codigo: string; readonly nome: string; readonly familia: string }[];
  readonly entidades: readonly { readonly id: string; readonly nome: string }[];
}

/**
 * O que o formulário oferece, já recortado: naturezas de PRINCIPAL (final 1) dos impostos sobre a renda e sobre
 * serviços, analíticas do crédito tributário e das VPAs de impostos. Um `select` com o plano inteiro ofereceria
 * contas que a gravação recusa.
 */
export async function lerOpcoesDaClassificacao(): Promise<OpcoesDaClassificacao> {
  await exigirLeituraDoEnte("CONSULTAR_FINANCEIRO");
  const prisma = cliente();
  const familiasVpa = [...new Set(Object.values(FAMILIA_DA_VPA_DO_FATO))];
  const [tipos, naturezas, fontes, contasCredito, contasVpa, versoes] = await Promise.all([
    prisma.tipoConsignacao.findMany({ orderBy: { codigo: "asc" }, select: { codigo: true, descricao: true } }),
    prisma.naturezaReceita.findMany({
      where: { OR: [{ codigo: { startsWith: "1113" } }, { codigo: { startsWith: "11145" } }, { codigo: { startsWith: "111802" } }], codigo: { endsWith: "1" } },
      orderBy: { codigo: "asc" },
      select: { codigo: true, descricao: true },
    }),
    prisma.fonteRecurso.findMany({ orderBy: { codigo: "asc" }, select: { codigo: true, descricao: true } }),
    prisma.contaPcasp.findMany({ where: { analitica: true, codigo: { startsWith: FAMILIA_DO_CREDITO_TRIBUTARIO } }, orderBy: { codigo: "asc" }, select: { codigo: true, nome: true } }),
    prisma.contaPcasp.findMany({ where: { analitica: true, OR: familiasVpa.map((f) => ({ codigo: { startsWith: f } })) }, orderBy: { codigo: "asc" }, select: { codigo: true, nome: true } }),
    prisma.versaoDaEntidadeContabil.findMany({ orderBy: { versao: "desc" }, select: { entidadeId: true, nome: true } }),
  ]);
  const entidades = new Map<string, string>();
  for (const v of versoes) if (!entidades.has(v.entidadeId)) entidades.set(v.entidadeId, v.nome);
  return {
    fatos: FATOS_DA_RETENCAO_PROPRIA.map((fato) => ({ fato, rotulo: ROTULO_DO_FATO_PROPRIO[fato] })),
    tipos,
    naturezas,
    fontes,
    contasCredito,
    contasVpa: contasVpa.map((c) => ({ ...c, familia: c.codigo.slice(0, 8) })),
    entidades: [...entidades].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome)),
  };
}

export async function registrarClassificacaoDaRetencaoPropria(input: {
  readonly fato: FatoDaRetencaoPropria;
  readonly tipoConsignacaoCodigo: string;
  readonly naturezaReceitaCodigo: string;
  readonly fonteCodigo: string;
  readonly contaCreditoCodigo: string;
  readonly contaVpaCodigo: string;
  readonly entidadeTitularId: string | null;
  readonly vigenteDesde: Date;
  readonly fundamento: string;
}): Promise<string> {
  await comEscritaAutenticada("GERIR_TIPOS_DE_CONSIGNACAO", (criadoPor) => classificarRetencaoPropria(cliente(), { ...input, criadoPor }));
  return `${ROTULO_DO_FATO_PROPRIO[input.fato]}: passa a entrar como receita (natureza ${input.naturezaReceitaCodigo}, fonte ${input.fonteCodigo}) nos pagamentos a partir da data informada. Os pagamentos anteriores não mudam.`;
}

export { FATOS_DA_RETENCAO_PROPRIA, type FatoDaRetencaoPropria };

// ── V26 — o legado: IR/ISS do próprio município que ficou na consignação ─────────────────────────────

export interface RetencaoAntigaNaTela {
  readonly ingressoId: string;
  readonly tipo: string;
  readonly data: string;
  readonly pagamento: string;
  readonly valor: string;
  readonly aRegularizar: string;
  readonly natureza: string;
  /** Reconhecimentos da mesma natureza com saldo, para quando a receita já foi reconhecida. */
  readonly reconhecimentos: readonly { readonly id: string; readonly rotulo: string }[];
}

/**
 * As retenções de IR/ISS do próprio município (mesmo caixa, decisão vigente) que ainda têm saldo na consignação.
 * É a lista do que a regularização alcança — o resto (INSS, ISS de outro município, repasse de outra entidade) não
 * aparece, porque é dívida de verdade.
 */
export async function lerRetencoesAntigasDoMunicipio(): Promise<readonly RetencaoAntigaNaTela[]> {
  await exigirLeituraDoEnte("CONSULTAR_FINANCEIRO");
  const prisma = cliente();
  const ente = await prisma.enteConfig.findFirst({ select: { nome: true } });
  if (ente === null) return [];
  const hoje = new Date();
  const candidatos = await prisma.movimentoExtraorcamentario.findMany({
    where: { tipo: "INGRESSO", pagamentoId: { not: null }, credorConsignatario: ente.nome, estornos: { none: {} }, apropriacaoDoIngresso: null },
    orderBy: { data: "asc" },
    select: {
      id: true,
      data: true,
      valor: true,
      tipoConsignacaoId: true,
      contaBancariaId: true,
      tipoConsignacao: { select: { codigo: true } },
      pagamento: { select: { numero: true } },
      alocacoesRecebidas: { select: { valor: true, recolhimento: { select: { estornos: { select: { id: true } } } } } },
    },
  });
  const linhas: RetencaoAntigaNaTela[] = [];
  for (const m of candidatos) {
    const c = await ehTributoDoProprioTesouro(prisma, { tipoConsignacaoId: m.tipoConsignacaoId, credorConsignatario: ente.nome, contaBancariaId: m.contaBancariaId, data: hoje });
    if (c === null) continue;
    let alocado = toMoney("0.00");
    for (const a of m.alocacoesRecebidas) if (a.recolhimento.estornos.length === 0) alocado = toMoney(alocado.plus(a.valor.toString()));
    const pendente = toMoney(toMoney(m.valor.toFixed(2)).minus(alocado));
    if (!pendente.greaterThan(0)) continue;
    const recs = await prisma.receitaReconhecida.findMany({ where: { naturezaCodigo: c.naturezaReceitaCodigo, estornoDeId: null, estornos: { none: {} } }, select: { id: true, valor: true, historico: true, dataFatoGerador: true } });
    const comSaldo: { id: string; rotulo: string }[] = [];
    for (const r of recs) {
      const saldo = await saldoReconhecidoDe(prisma, r.id);
      if (saldo.greaterThan(0)) comSaldo.push({ id: r.id, rotulo: `${diaCivilBr(r.dataFatoGerador)} — ${r.historico} (saldo ${formatarMoeda(saldo.toFixed(2)).texto})` });
    }
    linhas.push({
      ingressoId: m.id,
      tipo: m.tipoConsignacao.codigo,
      data: diaCivilBr(m.data),
      pagamento: m.pagamento?.numero ?? "",
      valor: formatarMoeda(m.valor.toFixed(2)).texto,
      aRegularizar: formatarMoeda(pendente.toFixed(2)).texto,
      natureza: c.naturezaReceitaCodigo,
      reconhecimentos: comSaldo,
    });
  }
  return linhas;
}

export async function regularizarRetencaoAntiga(input: { readonly ingressoId: string; readonly motivo: string; readonly reconhecimentoId: string | null }): Promise<string> {
  const r = await comEscritaAutenticada("REGISTRAR_ARRECADACAO", (criadoPor) =>
    regularizarConsignacaoPropria(cliente(), { ...input, data: new Date(), criadoPor })
  );
  return `Regularizado: ${formatarMoeda(r.valor).texto} entraram como receita (guia ${r.numeroReceita}), sem saída de dinheiro do banco. A retenção original continua registrada.`;
}

// ── V26 — a previsão da LOA × a execução do IR e do ISS ──────────────────────────────────────────────

export interface LinhaPrevistoArrecadado {
  readonly familia: "Imposto de renda" | "ISS";
  readonly natureza: string;
  readonly descricao: string;
  readonly previsto: string;
  readonly arrecadado: string;
}

/**
 * O previsto na LOA e o arrecadado no exercício, por natureza, nas famílias do imposto de renda (1.1.1.3) e do ISS
 * (1.1.1.4.51 e 1.1.1.8.02.3). Só leitura: quando a LOA prevê o imposto numa rubrica (ex.: o IRPF) e a execução entra
 * em outra (o IR retido), o quadro mostra as duas lado a lado — a previsão publicada não é alterada nem rateada aqui;
 * regularizar o enquadramento orçamentário é ato do município.
 */
export async function lerPrevistoArrecadadoDosImpostosRetidos(exercicio: number): Promise<readonly LinhaPrevistoArrecadado[]> {
  await exigirLeituraDoEnte("CONSULTAR_FINANCEIRO");
  const prisma = cliente();
  const familiaDe = (codigo: string): LinhaPrevistoArrecadado["familia"] | null =>
    codigo.startsWith("1113") ? "Imposto de renda" : codigo.startsWith("111451") || codigo.startsWith("1118023") ? "ISS" : null;
  const naturezas = await prisma.naturezaReceita.findMany({
    where: { OR: [{ codigo: { startsWith: "1113" } }, { codigo: { startsWith: "111451" } }, { codigo: { startsWith: "1118023" } }] },
    select: { id: true, codigo: true, descricao: true },
  });
  const [previstas, guias] = await Promise.all([
    prisma.receitaPrevista.findMany({ where: { exercicio, naturezaReceitaId: { in: naturezas.map((n) => n.id) } }, select: { naturezaReceitaId: true, valorPrevisto: true } }),
    prisma.receitaArrecadada.findMany({ where: { exercicio, naturezaReceitaId: { in: naturezas.map((n) => n.id) } }, select: { naturezaReceitaId: true, tipo: true, valor: true } }),
  ]);
  const linhas: LinhaPrevistoArrecadado[] = [];
  for (const n of naturezas.sort((a, b) => a.codigo.localeCompare(b.codigo))) {
    const familia = familiaDe(n.codigo);
    if (familia === null) continue;
    const previsto = previstas.filter((p) => p.naturezaReceitaId === n.id).reduce((s, p) => toMoney(s.plus(p.valorPrevisto.toString())), toMoney("0.00"));
    const arrecadado = guias
      .filter((g) => g.naturezaReceitaId === n.id)
      .reduce((s, g) => (sinalDaReceitaRealizada(g.tipo) === 1 ? toMoney(s.plus(g.valor.toString())) : toMoney(s.minus(g.valor.toString()))), toMoney("0.00"));
    if (previsto.isZero() && arrecadado.isZero()) continue;
    linhas.push({ familia, natureza: n.codigo, descricao: n.descricao, previsto: formatarMoeda(previsto.toFixed(2)).texto, arrecadado: formatarMoeda(arrecadado.toFixed(2)).texto });
  }
  return linhas;
}
