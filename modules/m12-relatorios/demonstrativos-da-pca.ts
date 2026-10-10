import { serializar, toMoney, type Money } from "../../packages/contracts/index.js";
import { anoCivil, janelaCivilDoAno } from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { somasPorConta } from "../m01-core-contabil/adapter-prisma.js";
import { restosParaAnexo7, type InscricaoParaAnexo7 } from "../m08-restos-a-pagar/consultas.js";
import { conciliacaoBancaria } from "../m09-tesouraria/conciliacao.js";
import { limiteDoBancoApos } from "../m09-tesouraria/dia-do-banco.js";
import { SINAL_MOVIMENTO_DIVIDA, type TipoMovimentoDivida } from "../m10-patrimonial/divida.js";

/**
 * V35 — OS DEMONSTRATIVOS DA PRESTAÇÃO DE CONTAS ANUAL QUE O SISTEMA NÃO PRODUZIA.
 *
 * O rol do TCE-PB (RN-TC 03/2010, art. 15 — ver docs/oficial/tce-pb/PCA-ROL-RN-TC-03-2010.md) pede,
 * além dos balanços que o M12 já emite:
 *   · ANEXO 16 da Lei 4.320/64 — Demonstração da Dívida Fundada (art. 98);
 *   · ANEXO 17 da Lei 4.320/64 — Demonstração da Dívida Flutuante (art. 92);
 *   · o TERMO DE CONFERÊNCIA DE CAIXA E BANCOS em 31/12.
 *
 * ═══ LEITURA PURA, COMPOSTA ═══
 * Nenhuma aritmética nova sobre o fato: a dívida fundada é Σ(valor × SINAL_MOVIMENTO_DIVIDA) do M10,
 * os restos vêm de `restosParaAnexo7` do M08 (a mesma fonte do RREO Anexo 7), os depósitos vêm de
 * `somasPorConta` do M01 e cada conta bancária vem de `conciliacaoBancaria` do M09. Este arquivo só
 * compõe colunas — e cada demonstrativo confere a própria identidade antes de devolver.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

const zero = () => toMoney("0.00");
const soma = (a: Money, b: Money) => toMoney(a.plus(b));
const sub = (a: Money, b: Money) => toMoney(a.minus(b));

// ═══════════════════════════════════════════════════════════════════════════
// ANEXO 16 — DÍVIDA FUNDADA
// ═══════════════════════════════════════════════════════════════════════════

export type OrigemDaDivida = "INTERNA" | "EXTERNA";

export interface LinhaAnexo16 {
  readonly identificador: string;
  readonly credor: string;
  readonly leiAutorizativa: string;
  readonly tipo: "CONTRATUAL" | "MOBILIARIA";
  readonly origem: OrigemDaDivida;
  readonly contaContabil: string;
  readonly saldoAnterior: string;
  /** Contratação ou emissão no exercício, líquida dos estornos. */
  readonly contratacao: string;
  /** Atualização monetária no exercício, líquida dos estornos. */
  readonly atualizacao: string;
  /** Amortização ou resgate no exercício, líquido dos estornos. */
  readonly amortizacao: string;
  readonly saldoSeguinte: string;
}

export interface TotalAnexo16 {
  readonly saldoAnterior: string;
  readonly contratacao: string;
  readonly atualizacao: string;
  readonly amortizacao: string;
  readonly saldoSeguinte: string;
}

export interface Anexo16 {
  readonly exercicio: number;
  readonly interna: readonly LinhaAnexo16[];
  readonly totalInterna: TotalAnexo16;
  readonly externa: readonly LinhaAnexo16[];
  readonly totalExterna: TotalAnexo16;
  readonly total: TotalAnexo16;
}

/** Em qual coluna do Anexo 16 cada movimento cai — `Record` exaustivo: um tipo novo não compila calado. */
const COLUNA_DO_MOVIMENTO: Record<TipoMovimentoDivida, "contratacao" | "atualizacao" | "amortizacao"> = {
  INGRESSO_OPERACAO_CREDITO: "contratacao",
  ESTORNO_INGRESSO_OPERACAO_CREDITO: "contratacao",
  ATUALIZACAO_MONETARIA: "atualizacao",
  ESTORNO_ATUALIZACAO_MONETARIA: "atualizacao",
  AMORTIZACAO: "amortizacao",
  ESTORNO_AMORTIZACAO: "amortizacao",
};

/** Sem acento e em maiúsculas — os nomes do PCASP vêm com e sem acento conforme a versão. */
function normalizarNome(n: string): string {
  return n.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}

/**
 * INTERNA OU EXTERNA PELO PLANO, NUNCA PELO CREDOR.
 *
 * Lei 4.320, art. 98: a dívida fundada se demonstra separada em interna e externa. O PCASP já faz a
 * separação no nome da conta de passivo ("EMPRÉSTIMOS INTERNOS", "FINANCIAMENTOS EXTERNOS",
 * "... A LONGO PRAZO - INTERNO"). Sobe-se da conta da dívida pelos pais até achar um dos dois termos.
 * Adivinhar pelo documento do credor erraria o organismo internacional com CNPJ no Brasil.
 * Nenhum dos dois termos na cadeia: recusa nomeada (fail-closed).
 */
async function origemPelaConta(leitor: Tx, contaId: string, identificador: string): Promise<OrigemDaDivida> {
  let atual: string | null = contaId;
  const vistos: string[] = [];
  while (atual !== null) {
    const c: { codigo: string; nome: string; contaPaiId: string | null } | null = await leitor.contaPcasp.findUnique({
      where: { id: atual },
      select: { codigo: true, nome: true, contaPaiId: true },
    });
    if (c === null) break;
    vistos.push(`${c.codigo} ${c.nome}`);
    const nome = normalizarNome(c.nome);
    const interna = /\bINTERN[OA]S?\b/.test(nome);
    const externa = /\bEXTERN[OA]S?\b/.test(nome);
    if (interna !== externa) return interna ? "INTERNA" : "EXTERNA";
    atual = c.contaPaiId;
  }
  throw new Error(
    `Anexo 16: a dívida "${identificador}" está numa conta de passivo que não diz se é interna ou externa ` +
      `(${vistos.join(" > ")}). Aponte a dívida para a conta do plano que separa as duas e gere de novo.`
  );
}

function totalDe(linhas: readonly LinhaAnexo16[]): TotalAnexo16 {
  const t = { saldoAnterior: zero(), contratacao: zero(), atualizacao: zero(), amortizacao: zero(), saldoSeguinte: zero() };
  for (const l of linhas) {
    t.saldoAnterior = soma(t.saldoAnterior, toMoney(l.saldoAnterior));
    t.contratacao = soma(t.contratacao, toMoney(l.contratacao));
    t.atualizacao = soma(t.atualizacao, toMoney(l.atualizacao));
    t.amortizacao = soma(t.amortizacao, toMoney(l.amortizacao));
    t.saldoSeguinte = soma(t.saldoSeguinte, toMoney(l.saldoSeguinte));
  }
  return {
    saldoAnterior: serializar(t.saldoAnterior),
    contratacao: serializar(t.contratacao),
    atualizacao: serializar(t.atualizacao),
    amortizacao: serializar(t.amortizacao),
    saldoSeguinte: serializar(t.saldoSeguinte),
  };
}

export async function anexo16(leitor: Tx, p: { readonly exercicio: number }): Promise<Anexo16> {
  const ref = p.exercicio;
  const dividas = await leitor.dividaConsolidada.findMany({
    select: {
      identificador: true,
      credorNome: true,
      leiAutorizativa: true,
      tipo: true,
      contaContabilId: true,
      contaContabil: { select: { codigo: true } },
      movimentos: { select: { tipo: true, valor: true, dataMovimento: true } },
    },
    orderBy: { identificador: "asc" },
  });

  const interna: LinhaAnexo16[] = [];
  const externa: LinhaAnexo16[] = [];
  for (const d of dividas) {
    let anterior = zero();
    const col = { contratacao: zero(), atualizacao: zero(), amortizacao: zero() };
    let movimentouNoAno = false;
    for (const m of d.movimentos) {
      const ano = anoCivil(m.dataMovimento);
      if (ano > ref) continue;
      const v = toMoney(m.valor.toFixed(2));
      const comSinal = SINAL_MOVIMENTO_DIVIDA[m.tipo] === 1 ? v : toMoney(v.negated());
      if (ano < ref) {
        anterior = soma(anterior, comSinal);
        continue;
      }
      movimentouNoAno = true;
      const coluna = COLUNA_DO_MOVIMENTO[m.tipo];
      // A amortização se mostra positiva na coluna de baixa: o sinal da coluna é o oposto do saldo.
      col[coluna] = coluna === "amortizacao" ? sub(col[coluna], comSinal) : soma(col[coluna], comSinal);
    }
    if (!movimentouNoAno && anterior.isZero()) continue; // dívida liquidada antes do exercício, ou futura
    const seguinte = sub(soma(soma(anterior, col.contratacao), col.atualizacao), col.amortizacao);
    const linha: LinhaAnexo16 = {
      identificador: d.identificador,
      credor: d.credorNome,
      leiAutorizativa: d.leiAutorizativa,
      tipo: d.tipo,
      origem: await origemPelaConta(leitor, d.contaContabilId, d.identificador),
      contaContabil: d.contaContabil.codigo,
      saldoAnterior: serializar(anterior),
      contratacao: serializar(col.contratacao),
      atualizacao: serializar(col.atualizacao),
      amortizacao: serializar(col.amortizacao),
      saldoSeguinte: serializar(seguinte),
    };
    (linha.origem === "INTERNA" ? interna : externa).push(linha);
  }

  const totalInterna = totalDe(interna);
  const totalExterna = totalDe(externa);
  const total = totalDe([...interna, ...externa]);

  // IDENTIDADE: o saldo final do demonstrativo é o saldo que o M10 dá para o fim do exercício.
  let saldoM10 = zero();
  for (const d of dividas) {
    for (const m of d.movimentos) {
      if (anoCivil(m.dataMovimento) > ref) continue;
      const v = toMoney(m.valor.toFixed(2));
      saldoM10 = SINAL_MOVIMENTO_DIVIDA[m.tipo] === 1 ? soma(saldoM10, v) : sub(saldoM10, v);
    }
  }
  if (!toMoney(total.saldoSeguinte).equals(saldoM10)) {
    throw new Error(`Anexo 16: o saldo para o exercício seguinte (${total.saldoSeguinte}) difere do saldo da dívida em 31/12 (${serializar(saldoM10)}). Nada foi emitido.`);
  }

  return { exercicio: ref, interna, totalInterna, externa, totalExterna, total };
}

// ═══════════════════════════════════════════════════════════════════════════
// ANEXO 17 — DÍVIDA FLUTUANTE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Lei 4.320, art. 92 — a dívida flutuante compreende:
 *   I   os restos a pagar, excluídos os serviços da dívida;
 *   II  os serviços da dívida a pagar;
 *   III os depósitos;
 *   IV  os débitos de tesouraria.
 *
 * Serviço da dívida = grupos de natureza 2 (juros e encargos) e 6 (amortização), Portaria
 * Interministerial 163/2001, Anexo II.
 */
const GRUPOS_DO_SERVICO_DA_DIVIDA: ReadonlySet<string> = new Set(["2", "6"]);

/**
 * Os depósitos (art. 92, III) são o grupo VALORES RESTITUÍVEIS do PCASP — consignações, garantias,
 * depósitos judiciais e não judiciais, precatórios em conta especial. O prefixo é estrutural do plano
 * (MCASP, Parte IV); o nome de cada conta vem da tabela.
 */
const PREFIXO_DOS_DEPOSITOS = "2.1.8.8.";

/**
 * Os débitos de tesouraria (art. 92, IV) são as operações de crédito por antecipação da receita
 * (LRF art. 38). A conta se reconhece pelo NOME no plano carregado, dentro do passivo.
 */
const NOME_DA_ARO = "ANTECIPACAO DA RECEITA ORCAMENTARIA";

export interface LinhaAnexo17 {
  readonly grupo: "RESTOS_A_PAGAR" | "SERVICO_DA_DIVIDA" | "DEPOSITOS" | "DEBITOS_DE_TESOURARIA";
  readonly codigo: string;
  readonly descricao: string;
  readonly saldoAnterior: string;
  readonly inscricao: string;
  readonly baixa: string;
  readonly saldoSeguinte: string;
}

export interface Anexo17 {
  readonly exercicio: number;
  readonly linhas: readonly LinhaAnexo17[];
  readonly total: Omit<LinhaAnexo17, "grupo" | "codigo" | "descricao">;
}

interface Acc17 {
  anterior: Money;
  inscricao: Money;
  baixa: Money;
}
const acc17 = (): Acc17 => ({ anterior: zero(), inscricao: zero(), baixa: zero() });

function linha17(grupo: LinhaAnexo17["grupo"], codigo: string, descricao: string, a: Acc17): LinhaAnexo17 {
  return {
    grupo,
    codigo,
    descricao,
    saldoAnterior: serializar(a.anterior),
    inscricao: serializar(a.inscricao),
    baixa: serializar(a.baixa),
    saldoSeguinte: serializar(sub(soma(a.anterior, a.inscricao), a.baixa)),
  };
}

function ehServicoDaDivida(i: InscricaoParaAnexo7): boolean {
  return GRUPOS_DO_SERVICO_DA_DIVIDA.has(i.grupoDaDespesa);
}

export async function anexo17(leitor: Tx, p: { readonly exercicio: number }): Promise<Anexo17> {
  const ref = p.exercicio;

  // ── I e II: restos a pagar ──
  // saldo anterior e baixas: as inscrições de anos anteriores, como o RREO Anexo 7 de `ref` as vê;
  // inscrição: as feitas no encerramento de `ref` (exercicioOrigem == ref), lidas pelo recorte de ref+1.
  const rp = {
    PROCESSADO: { demais: acc17(), servico: acc17() },
    NAO_PROCESSADO: { demais: acc17(), servico: acc17() },
  };
  for (const i of await restosParaAnexo7(leitor, { exercicioReferencia: ref })) {
    const a = rp[i.tipo][ehServicoDaDivida(i) ? "servico" : "demais"];
    a.anterior = soma(a.anterior, sub(sub(i.inscrito, i.pagoAntes), i.canceladoAntes));
    a.baixa = soma(a.baixa, soma(i.pagoNo, i.canceladoNo));
  }
  for (const i of await restosParaAnexo7(leitor, { exercicioReferencia: ref + 1 })) {
    if (i.exercicioOrigem !== ref) continue;
    const a = rp[i.tipo][ehServicoDaDivida(i) ? "servico" : "demais"];
    a.inscricao = soma(a.inscricao, i.inscrito);
  }

  const linhas: LinhaAnexo17[] = [
    linha17("RESTOS_A_PAGAR", "RPP", "Restos a pagar processados", rp.PROCESSADO.demais),
    linha17("RESTOS_A_PAGAR", "RPNP", "Restos a pagar não processados", rp.NAO_PROCESSADO.demais),
    linha17("SERVICO_DA_DIVIDA", "SDP", "Serviços da dívida a pagar — processados", rp.PROCESSADO.servico),
    linha17("SERVICO_DA_DIVIDA", "SDNP", "Serviços da dívida a pagar — não processados", rp.NAO_PROCESSADO.servico),
  ];

  // ── III e IV: depósitos e débitos de tesouraria, pelo razão (data do fato) ──
  const { inicio, fim } = janelaCivilDoAno(ref);
  const fimAnterior = janelaCivilDoAno(ref - 1).fim;
  const contasDoPassivo = await leitor.contaPcasp.findMany({
    where: { codigo: { startsWith: "2." }, analitica: true },
    select: { codigo: true, nome: true },
    orderBy: { codigo: "asc" },
  });
  const deposito = contasDoPassivo.filter((c) => c.codigo.startsWith(PREFIXO_DOS_DEPOSITOS));
  const aro = contasDoPassivo.filter((c) => normalizarNome(c.nome).includes(NOME_DA_ARO));
  const codigos = [...deposito, ...aro].map((c) => c.codigo);

  if (codigos.length > 0) {
    const antes = new Map((await somasPorConta(leitor, { codigos, ate: fimAnterior, campoData: "dataTransacao" })).map((s) => [s.codigo, s]));
    const noAno = new Map((await somasPorConta(leitor, { codigos, desde: inicio, ate: fim, campoData: "dataTransacao" })).map((s) => [s.codigo, s]));
    const porConta = (grupo: LinhaAnexo17["grupo"], c: { codigo: string; nome: string }) => {
      const a = antes.get(c.codigo);
      const n = noAno.get(c.codigo);
      if (a === undefined && n === undefined) return;
      // passivo: saldo credor. Crédito no ano é inscrição; débito é baixa (pagamento, devolução, estorno).
      const acc: Acc17 = {
        anterior: a === undefined ? zero() : sub(a.credito, a.debito),
        inscricao: n === undefined ? zero() : n.credito,
        baixa: n === undefined ? zero() : n.debito,
      };
      linhas.push(linha17(grupo, c.codigo, c.nome, acc));
    };
    for (const c of deposito) porConta("DEPOSITOS", c);
    for (const c of aro) porConta("DEBITOS_DE_TESOURARIA", c);
  }

  const t = acc17();
  for (const l of linhas) {
    t.anterior = soma(t.anterior, toMoney(l.saldoAnterior));
    t.inscricao = soma(t.inscricao, toMoney(l.inscricao));
    t.baixa = soma(t.baixa, toMoney(l.baixa));
  }
  const total = linha17("RESTOS_A_PAGAR", "", "", t);
  return {
    exercicio: ref,
    linhas,
    total: { saldoAnterior: total.saldoAnterior, inscricao: total.inscricao, baixa: total.baixa, saldoSeguinte: total.saldoSeguinte },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TERMO DE CONFERÊNCIA DE CAIXA E BANCOS EM 31/12
// ═══════════════════════════════════════════════════════════════════════════

/** Caixa e equivalentes de caixa — o grupo 1.1.1 do PCASP (MCASP, Parte IV). */
const PREFIXO_DAS_DISPONIBILIDADES = "1.1.1.";

export interface LinhaDoTermoDeCaixa {
  readonly codigo: string;
  readonly descricao: string;
  /** Banco, agência e conta, como cadastrados; vazio quando o cadastro não os tem. */
  readonly identificacao: string;
  readonly contaContabil: string;
  readonly saldoContabil: string;
  readonly saldoExtrato: string;
  readonly diferenca: string;
  /** Linhas do extrato importadas até 31/12. Zero: o saldo do banco não foi conferido. */
  readonly linhasDeExtrato: number;
  /** Pendências nomeadas da conciliação (no banco e não no razão, e o inverso). */
  readonly pendencias: number;
}

export interface OutraDisponibilidade {
  readonly contaContabil: string;
  readonly nome: string;
  readonly saldo: string;
}

export interface TermoDeConferenciaDeCaixa {
  readonly exercicio: number;
  readonly contas: readonly LinhaDoTermoDeCaixa[];
  /** Disponibilidades no razão que não são de conta bancária nenhuma (o caixa em espécie, por exemplo). */
  readonly outras: readonly OutraDisponibilidade[];
  readonly totalContabil: string;
  readonly totalExtrato: string;
  /** Σ saldos de 1.1.1 no razão em 31/12 — a disponibilidade do Balanço Patrimonial. */
  readonly totalNoRazao: string;
  /**
   * totalNoRazao − (Σ contábil das contas bancárias + Σ outras). Diferente de zero quando uma conta
   * contábil é de mais de uma conta bancária e há lançamento nela que não é fato de conta nenhuma.
   */
  readonly naoAtribuido: string;
}

export async function termoDeConferenciaDeCaixa(prisma: PrismaClient, p: { readonly exercicio: number }): Promise<TermoDeConferenciaDeCaixa> {
  const fim = janelaCivilDoAno(p.exercicio).fim;
  const bancarias = await prisma.contaBancaria.findMany({
    select: { id: true, codigo: true, descricao: true, banco: true, agencia: true, digitoAgencia: true, conta: true, digitoConta: true, contaContabilId: true },
    orderBy: { codigo: "asc" },
  });
  const semContabil = bancarias.filter((b) => b.contaContabilId === null).map((b) => b.codigo);
  if (semContabil.length > 0) {
    throw new Error(
      `Termo de conferência de caixa: ${semContabil.length === 1 ? "a conta bancária" : "as contas bancárias"} ` +
        `${semContabil.join(", ")} não ${semContabil.length === 1 ? "tem" : "têm"} conta contábil vinculada. ` +
        `Sem ela não há saldo do razão a conferir. Vincule em Tesouraria e gere de novo.`
    );
  }

  const contas: LinhaDoTermoDeCaixa[] = [];
  let totalContabil = zero();
  let totalExtrato = zero();
  for (const b of bancarias) {
    // A conciliação que não fecha NÃO vira linha do termo: um termo que certifica saldo cuja diferença ninguém explicou
    // atestaria o que não foi conferido. A recusa sobe com a conta nomeada.
    let c: Awaited<ReturnType<typeof conciliacaoBancaria>>;
    try {
      c = await conciliacaoBancaria(prisma, b.id, fim);
    } catch (e) {
      throw new Error(
        `Termo de conferência de caixa: a conta bancária ${b.codigo} não fecha a conciliação em 31/12/${String(p.exercicio)}. ` +
          `${e instanceof Error ? e.message : String(e)} Concilie a conta e gere de novo.`
      );
    }
    const linhasDeExtrato = await prisma.lancamentoExtrato.count({ where: { contaBancariaId: b.id, dataPostagem: { lt: limiteDoBancoApos(fim) } } });
    const agencia = b.agencia === null ? "" : `ag. ${b.agencia}${b.digitoAgencia ? `-${b.digitoAgencia}` : ""}`;
    const conta = b.conta === null ? "" : `c/c ${b.conta}${b.digitoConta ? `-${b.digitoConta}` : ""}`;
    contas.push({
      codigo: b.codigo,
      descricao: b.descricao,
      identificacao: [b.banco === null ? "" : `banco ${b.banco}`, agencia, conta].filter((x) => x !== "").join(", "),
      contaContabil: c.contaBancaria.contaContabil,
      saldoContabil: c.saldoContabil,
      saldoExtrato: c.saldoExtrato,
      diferenca: c.diferenca,
      linhasDeExtrato,
      pendencias: c.noExtratoSemVinculo.length + c.internoSemVinculo.length,
    });
    totalContabil = soma(totalContabil, toMoney(c.saldoContabil));
    totalExtrato = soma(totalExtrato, toMoney(c.saldoExtrato));
  }

  // As disponibilidades do razão: as contas das bancárias e as demais.
  const contabeisDasBancarias = new Set(contas.map((c) => c.contaContabil));
  const disponiveis = await prisma.contaPcasp.findMany({
    where: { codigo: { startsWith: PREFIXO_DAS_DISPONIBILIDADES }, analitica: true },
    select: { codigo: true, nome: true },
    orderBy: { codigo: "asc" },
  });
  const somas = await somasPorConta(prisma, { codigos: disponiveis.map((d) => d.codigo), ate: fim, campoData: "dataTransacao" });
  const saldoPorConta = new Map(somas.map((s) => [s.codigo, sub(s.debito, s.credito)]));
  let totalNoRazao = zero();
  for (const s of saldoPorConta.values()) totalNoRazao = soma(totalNoRazao, s);
  const outras: OutraDisponibilidade[] = [];
  let totalOutras = zero();
  for (const d of disponiveis) {
    if (contabeisDasBancarias.has(d.codigo)) continue;
    const saldo = saldoPorConta.get(d.codigo);
    if (saldo === undefined || saldo.isZero()) continue;
    outras.push({ contaContabil: d.codigo, nome: d.nome, saldo: serializar(saldo) });
    totalOutras = soma(totalOutras, saldo);
  }

  return {
    exercicio: p.exercicio,
    contas,
    outras,
    totalContabil: serializar(totalContabil),
    totalExtrato: serializar(totalExtrato),
    totalNoRazao: serializar(totalNoRazao),
    naoAtribuido: serializar(sub(totalNoRazao, soma(totalContabil, totalOutras))),
  };
}
