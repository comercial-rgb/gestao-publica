import { Decimal, formatarMoeda, toMoney, type Money } from "../../packages/contracts/index.js";

/**
 * RETENÇÃO NA FONTE CALCULADA (V24) — IR, INSS e ISS do fornecedor, a partir das tabelas oficiais.
 *
 * Domínio PURO: recebe as tabelas vigentes, o perfil fiscal do fornecedor e os dados da operação, e
 * devolve, por tributo, uma de quatro respostas:
 *
 *   RETIDO          — base × alíquota da tabela, com o fundamento;
 *   NAO_RETIDO      — a regra manda não reter (Simples, dispensa, serviço fora do rol...), com o motivo;
 *   NAO_CALCULAVEL  — o caso não está coberto pelas fontes obtidas; o pagamento só segue se o operador
 *                     informar o valor (zero inclusive) com justificativa;
 *   INFORMADO       — o operador informou, e a justificativa fica gravada.
 *
 * ═══ O QUE ISTO NÃO FAZ, DE PROPÓSITO ═══
 * - Pessoa física: o IR segue a tabela progressiva e o INSS do contribuinte individual tem outra regra;
 *   nenhuma das duas está nas fontes obtidas → NAO_CALCULAVEL.
 * - Contribuinte sobre a receita bruta: a alíquota da retenção previdenciária dele não está nas fontes
 *   obtidas → NAO_CALCULAVEL.
 * - Adicional de atividade especial (IN RFB 2.110/2022, art. 131) → não calculado; quem tiver o caso
 *   informa.
 * - ISS de construção civil (subitens 7.02 e 7.05) em Esperança: a LC 132/2025 deu redação nova à base
 *   que conflita com a dedução presumida de 40% da LC 80/2017, sem revogá-la expressamente →
 *   NAO_CALCULAVEL até a decisão do município.
 * - ISS de optante do Simples: a alíquota é a declarada no documento fiscal; sem ela, NAO_CALCULAVEL.
 * - Dispensa de IR abaixo de R$ 10,00: o art. 3º, § 6º da IN RFB 1.234/2012 não é estendido aos
 *   municípios pelo art. 2º-A, § 1º → retém qualquer valor.
 *
 * Arredondamento: duas casas, meio-par (`toMoney`), o padrão monetário do projeto. As normas obtidas não
 * fixam o critério.
 */

export type Tributo = "IRRF" | "INSS" | "ISS";
export const TRIBUTOS: readonly Tributo[] = ["IRRF", "INSS", "ISS"];

export interface NaturezaIR {
  readonly codigoReceita: string;
  readonly natureza: string;
  readonly aliquota: Decimal;
  readonly fonte: string;
}
export interface ServicoINSS {
  readonly codigo: string;
  readonly descricao: string;
  readonly somenteCessaoDeMaoDeObra: boolean;
  readonly construcaoCivil: boolean;
  readonly fonte: string;
}
export interface ParametroINSS {
  readonly aliquota: Decimal;
  readonly valorMinimo: Decimal;
  readonly fonte: string;
}
export interface BaseMinimaINSS {
  readonly codigo: string;
  readonly descricao: string;
  readonly percentual: Decimal;
  readonly fonte: string;
}
export type LocalDeIncidencia = "ESTABELECIMENTO_DO_PRESTADOR" | "ESTABELECIMENTO_DO_TOMADOR" | "LOCAL_DA_PRESTACAO";
export interface ItemISS {
  readonly subitem: string;
  readonly descricao: string;
  readonly aliquota: Decimal;
  readonly localDeIncidencia: LocalDeIncidencia;
  readonly fonte: string;
}

/** As tabelas VIGENTES na data do pagamento. Quem lê o banco escolhe a vigência; aqui só se aplica. */
export interface TabelasDaRetencao {
  readonly naturezasIR: readonly NaturezaIR[];
  readonly servicosINSS: readonly ServicoINSS[];
  readonly parametroINSS: ParametroINSS | null;
  readonly basesMinimasINSS: readonly BaseMinimaINSS[];
  /** A lista do ISS DO MUNICÍPIO DO ENTE (vazia = não carregada). */
  readonly itensISS: readonly ItemISS[];
  /** Código IBGE do município do ente (nulo = não configurado). */
  readonly municipioDoEnte: string | null;
}

export interface PerfilFiscal {
  readonly optanteSimplesNacional: boolean;
  readonly tributadoNoAnexoIVDoSimples: boolean;
  readonly contribuiSobreReceitaBruta: boolean;
  readonly dispensaDoIR: string | null;
  readonly municipioDoEstabelecimento: string | null;
  readonly fundamento: string;
}

export type ModalidadeDoServico = "CESSAO_DE_MAO_DE_OBRA" | "EMPREITADA_PARCIAL" | "EMPREITADA_TOTAL";
export type EnquadramentoDaBaseINSS =
  /** Sem material nem equipamento: a base é o valor bruto (art. 119). */
  | "VALOR_BRUTO"
  /** Materiais/equipamentos discriminados no contrato e no documento (art. 116): deduz o valor informado. */
  | "MATERIAIS_DISCRIMINADOS"
  /** Previstos no contrato sem valor, discriminados no documento (art. 117): base mínima pelo percentual. */
  | "PREVISTO_SEM_VALOR_NO_CONTRATO"
  /** Equipamento inerente ao serviço, sem discriminação de valores no contrato (art. 118, II). */
  | "EQUIPAMENTO_INERENTE_SEM_DISCRIMINACAO";

export interface OperacaoDaRetencao {
  /** CPF (11) ou CNPJ (14) do credor do empenho. */
  readonly documentoDoFornecedor: string;
  readonly valorDoPagamento: Money;
  /** O valor bruto do documento fiscal a que este pagamento corresponde. */
  readonly valorDoDocumentoFiscal: Money;
  /** IN RFB 1.234/2012, art. 2º, § 10: pagamento com glosa sem nota nova → IR sobre o valor da nota. */
  readonly pagamentoComGlosa: boolean;
  /** Código da receita da natureza do bem/serviço (coluna 07 do Anexo I). */
  readonly naturezaIR: string | null;
  readonly inss: {
    /** Código do serviço (art. 111/112). Nulo = o serviço não está no rol. */
    readonly servico: string | null;
    readonly modalidade: ModalidadeDoServico | null;
    readonly enquadramento: EnquadramentoDaBaseINSS;
    /** Materiais/equipamentos discriminados (art. 116) ou discriminados no documento (art. 117). */
    readonly valorMateriais: Money;
    /** Código da base mínima (art. 117 ou 118, II), quando o enquadramento a exige. */
    readonly baseMinima: string | null;
    /** Alimentação e vale-transporte discriminados no documento (art. 120). */
    readonly deducoes: Money;
    /** Dispensa declarada (art. 115, II ou III), com a referência da declaração. */
    readonly dispensa: { readonly inciso: "II" | "III"; readonly declaracao: string } | null;
  };
  readonly iss: {
    /** Subitem da lista ("7.02"). Nulo = não é prestação de serviço (fornecimento de bens). */
    readonly subitem: string | null;
    /** IBGE do município onde o serviço foi prestado (exigido quando o local da prestação decide). */
    readonly municipioDaPrestacao: string | null;
    /** Alíquota declarada no documento fiscal pelo optante do Simples, em fração. */
    readonly aliquotaDoSimplesNoDocumento: Decimal | null;
  };
  /** Valores informados pelo operador para o que o cálculo não cobre. */
  readonly informados: Partial<Record<Tributo, { readonly valor: Money; readonly justificativa: string }>>;
}

export type Avaliacao =
  | { readonly tributo: Tributo; readonly resultado: "RETIDO"; readonly base: Money; readonly aliquota: Decimal; readonly valor: Money; readonly fundamento: string }
  | { readonly tributo: Tributo; readonly resultado: "NAO_RETIDO"; readonly fundamento: string }
  | { readonly tributo: Tributo; readonly resultado: "NAO_CALCULAVEL"; readonly motivo: string }
  | { readonly tributo: Tributo; readonly resultado: "INFORMADO"; readonly valor: Money; readonly fundamento: string };

const IN_1234 = "IN RFB 1.234/2012";
const IN_2110 = "IN RFB 2.110/2022";
const LC_80 = "LC municipal 80/2017";

const pct = (d: Decimal): string => `${d.times(100).toDecimalPlaces(4).toString().replace(".", ",")}%`;
const moeda = (m: Money): string => `R$ ${formatarMoeda(m.toFixed(2)).texto}`;

function calcularIR(op: OperacaoDaRetencao, perfil: PerfilFiscal, t: TabelasDaRetencao): Avaliacao {
  const tributo = "IRRF" as const;
  if (op.documentoDoFornecedor.length !== 14) {
    return { tributo, resultado: "NAO_CALCULAVEL", motivo: `Fornecedor pessoa física: a retenção do IR segue a tabela progressiva, que este cálculo não cobre (a ${IN_1234} trata só de pessoa jurídica).` };
  }
  if (perfil.optanteSimplesNacional) {
    return { tributo, resultado: "NAO_RETIDO", fundamento: `Optante pelo Simples Nacional: não se retém (${IN_1234}, art. 4º, XI). Comprovação: ${perfil.fundamento}.` };
  }
  if (perfil.dispensaDoIR !== null) {
    return { tributo, resultado: "NAO_RETIDO", fundamento: `Dispensa declarada: ${IN_1234}, art. 4º, inciso ${perfil.dispensaDoIR}. Comprovação: ${perfil.fundamento}.` };
  }
  if (op.naturezaIR === null) {
    return { tributo, resultado: "NAO_CALCULAVEL", motivo: `Informe a natureza do bem ou serviço (Anexo I da ${IN_1234}) para calcular o IR.` };
  }
  const nat = t.naturezasIR.find((n) => n.codigoReceita === op.naturezaIR);
  if (nat === undefined) {
    return { tributo, resultado: "NAO_CALCULAVEL", motivo: `A natureza ${op.naturezaIR} não está na tabela do IR vigente na data do pagamento.` };
  }
  if (nat.aliquota.isZero()) {
    return { tributo, resultado: "NAO_RETIDO", fundamento: `Natureza ${nat.codigoReceita}: alíquota do IR igual a zero na coluna 02 do Anexo I (${nat.fonte}).` };
  }
  // Art. 3º-A: "sobre o valor a ser pago"; art. 2º, § 10 (por remissão do art. 2º-A, § 1º): com glosa sem
  // nota nova, sobre o valor original da nota.
  const base = op.pagamentoComGlosa ? op.valorDoDocumentoFiscal : op.valorDoPagamento;
  const valor = toMoney(base.times(nat.aliquota));
  return {
    tributo,
    resultado: "RETIDO",
    base,
    aliquota: nat.aliquota,
    valor,
    fundamento: `${pct(nat.aliquota)} sobre ${moeda(base)} (${op.pagamentoComGlosa ? "valor original da nota, pagamento com glosa — art. 2º, § 10" : "valor pago — art. 3º-A"}); natureza ${nat.codigoReceita} do Anexo I, coluna 02 (${nat.fonte}).`,
  };
}

function calcularINSS(op: OperacaoDaRetencao, perfil: PerfilFiscal, t: TabelasDaRetencao): Avaliacao {
  const tributo = "INSS" as const;
  const i = op.inss;
  if (i.servico === null) {
    return { tributo, resultado: "NAO_RETIDO", fundamento: `Serviço fora do rol dos arts. 111 e 112, que é exaustivo (${IN_2110}, art. 113).` };
  }
  const servico = t.servicosINSS.find((s) => s.codigo === i.servico);
  if (servico === undefined) {
    return { tributo, resultado: "NAO_CALCULAVEL", motivo: `O serviço ${i.servico} não está na tabela vigente da retenção previdenciária.` };
  }
  if (op.documentoDoFornecedor.length !== 14) {
    return { tributo, resultado: "NAO_CALCULAVEL", motivo: `Fornecedor pessoa física: a contribuição do contribuinte individual tem regra própria, que este cálculo não cobre.` };
  }
  if (i.modalidade === null) {
    return { tributo, resultado: "NAO_CALCULAVEL", motivo: `Informe se o serviço é prestado por cessão de mão de obra, empreitada parcial ou empreitada total.` };
  }
  if (servico.somenteCessaoDeMaoDeObra && i.modalidade !== "CESSAO_DE_MAO_DE_OBRA") {
    return { tributo, resultado: "NAO_RETIDO", fundamento: `${servico.descricao}: sujeito à retenção só quando contratado por cessão de mão de obra (${IN_2110}, art. 112).` };
  }
  if (servico.construcaoCivil && i.modalidade === "EMPREITADA_TOTAL") {
    return { tributo, resultado: "NAO_RETIDO", fundamento: `Órgão público contratante de obra de construção civil por empreitada total (${IN_2110}, art. 114, VII).` };
  }
  if (perfil.optanteSimplesNacional && !perfil.tributadoNoAnexoIVDoSimples) {
    return { tributo, resultado: "NAO_RETIDO", fundamento: `Optante pelo Simples Nacional fora do Anexo IV: não se retém (${IN_2110}, art. 167). Comprovação: ${perfil.fundamento}.` };
  }
  if (perfil.contribuiSobreReceitaBruta) {
    return { tributo, resultado: "NAO_CALCULAVEL", motivo: `Fornecedor contribuinte sobre a receita bruta: a alíquota da retenção dele não está nas fontes carregadas.` };
  }
  if (i.dispensa !== null) {
    return { tributo, resultado: "NAO_RETIDO", fundamento: `Dispensa do ${IN_2110}, art. 115, ${i.dispensa.inciso}, declarada: ${i.dispensa.declaracao}.` };
  }
  const p = t.parametroINSS;
  if (p === null) {
    return { tributo, resultado: "NAO_CALCULAVEL", motivo: `A alíquota da retenção previdenciária não está carregada para a data do pagamento.` };
  }

  const bruto = op.valorDoDocumentoFiscal;
  let base: Money;
  let comoBase: string;
  switch (i.enquadramento) {
    case "VALOR_BRUTO":
      base = bruto;
      comoBase = "valor bruto do documento (art. 119)";
      break;
    case "MATERIAIS_DISCRIMINADOS":
      if (i.valorMateriais.greaterThan(bruto)) {
        return { tributo, resultado: "NAO_CALCULAVEL", motivo: `Os materiais e equipamentos informados (${moeda(i.valorMateriais)}) passam do valor do documento (${moeda(bruto)}).` };
      }
      base = bruto.minus(i.valorMateriais);
      comoBase = `valor bruto menos ${moeda(i.valorMateriais)} de materiais/equipamentos discriminados (art. 116)`;
      break;
    case "PREVISTO_SEM_VALOR_NO_CONTRATO":
    case "EQUIPAMENTO_INERENTE_SEM_DISCRIMINACAO": {
      const art = i.enquadramento === "PREVISTO_SEM_VALOR_NO_CONTRATO" ? "117" : "118";
      const minima = i.baseMinima === null ? undefined : t.basesMinimasINSS.find((b) => b.codigo === i.baseMinima);
      if (minima === undefined || !minima.codigo.startsWith(art)) {
        return { tributo, resultado: "NAO_CALCULAVEL", motivo: `Escolha a hipótese de base mínima do art. ${art} da ${IN_2110}.` };
      }
      const piso = toMoney(bruto.times(minima.percentual));
      if (i.enquadramento === "PREVISTO_SEM_VALOR_NO_CONTRATO") {
        const discriminado = bruto.minus(i.valorMateriais);
        base = Decimal.max(discriminado, piso);
        comoBase = `o maior entre o bruto menos os materiais discriminados no documento e ${pct(minima.percentual)} do bruto (art. 117, ${minima.descricao})`;
      } else {
        base = piso;
        comoBase = `${pct(minima.percentual)} do bruto (art. 118, II, ${minima.descricao})`;
      }
      break;
    }
  }
  if (i.deducoes.greaterThan(0)) {
    base = Decimal.max(base.minus(i.deducoes), new Decimal(0));
    comoBase += `, menos ${moeda(i.deducoes)} de alimentação/vale-transporte discriminados (art. 120)`;
  }
  const valor = toMoney(base.times(p.aliquota));
  if (valor.lessThan(p.valorMinimo)) {
    return { tributo, resultado: "NAO_RETIDO", fundamento: `${pct(p.aliquota)} da base dá ${moeda(valor)}, abaixo do mínimo de ${moeda(toMoney(p.valorMinimo))} para recolhimento: dispensa do ${IN_2110}, art. 115, I (com o art. 238).` };
  }
  return {
    tributo,
    resultado: "RETIDO",
    base: toMoney(base),
    aliquota: p.aliquota,
    valor,
    fundamento: `${pct(p.aliquota)} (art. 110) sobre ${moeda(toMoney(base))}: ${comoBase}; serviço ${servico.codigo} — ${servico.descricao} (${servico.fonte}).`,
  };
}

/** Subitens de construção civil cuja base está em conflito entre a LC 80/2017 e a LC 132/2025. */
const SUBITENS_COM_BASE_EM_CONFLITO = new Set(["7.02", "7.05"]);

function calcularISS(op: OperacaoDaRetencao, perfil: PerfilFiscal, t: TabelasDaRetencao): Avaliacao {
  const tributo = "ISS" as const;
  if (op.iss.subitem === null) {
    return { tributo, resultado: "NAO_RETIDO", fundamento: `Fornecimento de bens, sem prestação de serviço da lista: não há ISS.` };
  }
  if (t.municipioDoEnte === null) {
    return { tributo, resultado: "NAO_CALCULAVEL", motivo: `O município do ente (código IBGE) não está configurado.` };
  }
  if (t.itensISS.length === 0) {
    return { tributo, resultado: "NAO_CALCULAVEL", motivo: `A lista de serviços do ISS do município ${t.municipioDoEnte} não está carregada.` };
  }
  const item = t.itensISS.find((x) => x.subitem === op.iss.subitem);
  if (item === undefined) {
    return { tributo, resultado: "NAO_CALCULAVEL", motivo: `O subitem ${op.iss.subitem} não está na lista de serviços do município.` };
  }
  if (op.documentoDoFornecedor.length !== 14) {
    return { tributo, resultado: "NAO_CALCULAVEL", motivo: `Prestador pessoa física: o autônomo inscrito paga valor fixo e o não inscrito sofre 5% (${LC_80}, arts. 62 e 73, § 3º); a situação da inscrição não está no cadastro.` };
  }
  let devidoEm: string | null;
  let porque: string;
  switch (item.localDeIncidencia) {
    case "ESTABELECIMENTO_DO_TOMADOR":
      devidoEm = t.municipioDoEnte;
      porque = "no estabelecimento do tomador";
      break;
    case "LOCAL_DA_PRESTACAO":
      devidoEm = op.iss.municipioDaPrestacao;
      porque = "no local da prestação";
      if (devidoEm === null) return { tributo, resultado: "NAO_CALCULAVEL", motivo: `Subitem ${item.subitem}: o ISS é devido no local da prestação; informe o município onde o serviço foi prestado.` };
      break;
    case "ESTABELECIMENTO_DO_PRESTADOR":
      devidoEm = perfil.municipioDoEstabelecimento;
      porque = "no estabelecimento do prestador";
      if (devidoEm === null) return { tributo, resultado: "NAO_CALCULAVEL", motivo: `Subitem ${item.subitem}: o ISS é devido no estabelecimento do prestador; o município dele não está no perfil fiscal do fornecedor.` };
      break;
  }
  if (devidoEm !== t.municipioDoEnte) {
    return { tributo, resultado: "NAO_CALCULAVEL", motivo: `Subitem ${item.subitem}: o ISS é devido ${porque}, no município ${devidoEm}, e não no do ente (${LC_80}, art. 56). Se a lei daquele município exigir a retenção, informe o valor.` };
  }
  if (SUBITENS_COM_BASE_EM_CONFLITO.has(item.subitem)) {
    return { tributo, resultado: "NAO_CALCULAVEL", motivo: `Subitem ${item.subitem} (construção civil): a LC 132/2025 deu nova redação à base, que conflita com a dedução presumida de 40% da ${LC_80} (art. 59, § 2º) sem revogá-la expressamente. Informe o valor conforme a orientação do fisco municipal.` };
  }
  let aliquota: Decimal;
  let qual: string;
  if (perfil.optanteSimplesNacional) {
    const a = op.iss.aliquotaDoSimplesNoDocumento;
    if (a === null) return { tributo, resultado: "NAO_CALCULAVEL", motivo: `Prestador optante pelo Simples Nacional: informe a alíquota do ISS declarada no documento fiscal.` };
    aliquota = a;
    qual = "alíquota declarada no documento fiscal pelo optante do Simples Nacional";
  } else {
    aliquota = item.aliquota;
    qual = `alíquota do subitem para empresas (${item.fonte})`;
  }
  const base = op.valorDoDocumentoFiscal;
  const valor = toMoney(base.times(aliquota));
  if (valor.isZero()) {
    return { tributo, resultado: "NAO_RETIDO", fundamento: `Alíquota resulta em retenção zero (${qual}).` };
  }
  return {
    tributo,
    resultado: "RETIDO",
    base,
    aliquota,
    valor,
    fundamento: `${pct(aliquota)} sobre o preço do serviço ${moeda(base)} (${LC_80}, art. 59); ${qual}; subitem ${item.subitem}; devido ${porque}, no município do ente (art. 56); o órgão público tomador é responsável pela retenção (art. 58, III, e art. 73).`,
  };
}

/** Exige que o motivo do valor informado seja uma frase, não um carimbo. */
export function exigirJustificativa(j: string): string {
  const t = j.trim().replace(/\s+/g, " ");
  if (t.length < 20) throw new Error("A justificativa do valor informado precisa de pelo menos 20 caracteres. Nada foi gravado.");
  if (t.length > 500) throw new Error("A justificativa do valor informado tem no máximo 500 caracteres. Nada foi gravado.");
  return t;
}

/**
 * Avalia os três tributos. Sem perfil fiscal do fornecedor, nada é calculado: Simples, dispensa e
 * município decidem as três respostas, e adivinhá-los seria reter errado.
 */
export function calcularRetencoes(op: OperacaoDaRetencao, perfil: PerfilFiscal | null, t: TabelasDaRetencao): readonly Avaliacao[] {
  if (op.valorDoPagamento.lessThanOrEqualTo(0)) throw new Error("O valor do pagamento precisa ser positivo. Nada foi gravado.");
  if (op.valorDoDocumentoFiscal.lessThanOrEqualTo(0)) throw new Error("O valor do documento fiscal precisa ser positivo. Nada foi gravado.");
  const calculadas: Avaliacao[] =
    perfil === null
      ? TRIBUTOS.map((tributo) => ({ tributo, resultado: "NAO_CALCULAVEL" as const, motivo: "O fornecedor não tem perfil fiscal cadastrado (Simples Nacional, dispensas, município). Cadastre em Cadastros › Pessoas." }))
      : [calcularIR(op, perfil, t), calcularINSS(op, perfil, t), calcularISS(op, perfil, t)];

  // O valor informado só substitui o que o cálculo não cobre: um valor "informado" por cima de um
  // cálculo feito seria a retenção manual de antes, sem rastro do porquê.
  return calculadas.map((a) => {
    const inf = op.informados[a.tributo];
    if (inf === undefined) return a;
    if (a.resultado !== "NAO_CALCULAVEL") {
      throw new Error(`O ${a.tributo} foi calculado pelas tabelas; não se informa valor por cima do cálculo. Nada foi gravado.`);
    }
    if (inf.valor.isNegative()) throw new Error(`O valor informado do ${a.tributo} não pode ser negativo. Nada foi gravado.`);
    // V39-R2 (R2-006) — coerência do valor declarado: não passa do valor do documento fiscal da operação.
    if (inf.valor.greaterThan(op.valorDoDocumentoFiscal)) {
      throw new Error(`O valor informado do ${a.tributo} (${inf.valor.toFixed(2)}) passa do valor do documento fiscal (${op.valorDoDocumentoFiscal.toFixed(2)}). Nada foi gravado.`);
    }
    return { tributo: a.tributo, resultado: "INFORMADO" as const, valor: toMoney(inf.valor), fundamento: `Valor informado pelo operador: ${exigirJustificativa(inf.justificativa)} (o cálculo não cobre: ${a.motivo})` };
  });
}

/** O que retém de fato (RETIDO, ou INFORMADO com valor positivo). */
export function valorRetido(a: Avaliacao): Money {
  return a.resultado === "RETIDO" || a.resultado === "INFORMADO" ? a.valor : new Decimal(0);
}

/**
 * Antes de gravar: nenhum tributo pode ficar sem resposta, e o total retido não pode passar do valor
 * pago (o líquido do fornecedor seria negativo).
 */
export function exigirRetencoesFechadas(avaliacoes: readonly Avaliacao[], valorDoPagamento: Money): void {
  const pendentes = avaliacoes.filter((a): a is Extract<Avaliacao, { resultado: "NAO_CALCULAVEL" }> => a.resultado === "NAO_CALCULAVEL");
  if (pendentes.length > 0) {
    throw new Error(
      `O cálculo das retenções não cobre: ${pendentes.map((p) => `${p.tributo} — ${p.motivo}`).join(" ")} Informe o valor de cada um, com justificativa (zero, se não houver retenção). Nada foi gravado.`
    );
  }
  const total = avaliacoes.reduce((s, a) => s.plus(valorRetido(a)), new Decimal(0));
  if (total.greaterThan(valorDoPagamento)) {
    throw new Error(`As retenções somam ${moeda(toMoney(total))}, mais que o valor pago (${moeda(valorDoPagamento)}). Nada foi gravado.`);
  }
}
