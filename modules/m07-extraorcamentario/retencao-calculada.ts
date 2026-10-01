import {
  documentoTemDigitoValido,
  normalizarDocumento,
  tipoDeDocumento,
} from "../../packages/documento/index.js";
import {
  Decimal,
  toMoney,
  type Money,
} from "../../packages/contracts/index.js";
import {
  calcularRetencoes,
  exigirJustificativa,
  exigirRetencoesFechadas,
  valorRetido,
  type Avaliacao,
  type OperacaoDaRetencao,
  type PerfilFiscal,
  type TabelasDaRetencao,
  type Tributo,
} from "./calculo-da-retencao.js";
import { listarTiposConsignacao } from "./consultas.js";
import type { FatoDaRetencaoPropria, RetencaoDoPagamentoInput, RetencaoPropriaParaCompor } from "./dominio.js";
import { exigirClassificacaoPropria, mesmoPerimetro } from "./retencao-propria.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import type { Tx } from "./extraorcamentario.js";
import type { CalculoDaRetencaoParaPersistir } from "./retencao.js";

/**
 * RETENÇÃO CALCULADA — o lado que lê o banco (V24): as tabelas vigentes, o perfil fiscal do fornecedor,
 * o contexto do pagamento; e o cadastro do perfil. O cálculo em si é `calculo-da-retencao.ts` (puro).
 */

// ── Perfil fiscal do fornecedor ────────────────────────────────────────────────────────────────────

const INCISOS_DO_ART_4 = new Set([
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
  "XI",
  "XII",
  "XIII",
  "XIV",
  "XV",
  "XVI",
  "XVII",
  "XVIII",
  "XIX",
  "XX",
  "XXI",
  "XXII",
]);

export interface PerfilFiscalInput {
  readonly documento: string;
  /** Data civil (AAAA-MM-DD) a partir da qual vale. */
  readonly vigenteDesde: Date;
  readonly optanteSimplesNacional: boolean;
  readonly tributadoNoAnexoIVDoSimples: boolean;
  readonly contribuiSobreReceitaBruta: boolean;
  readonly dispensaDoIR: string | null;
  readonly municipioDoEstabelecimento: string | null;
  readonly fundamento: string;
  readonly criadoPor: string;
}

/** Recusa antes de gravar: documento com dígito errado, combinação impossível, fundamento vazio. */
export function validarPerfilFiscal(p: PerfilFiscalInput): PerfilFiscalInput {
  const documento = normalizarDocumento(p.documento);
  if (
    tipoDeDocumento(documento) === "INVALIDO" ||
    !documentoTemDigitoValido(documento)
  ) {
    throw new Error("O CPF/CNPJ do fornecedor não é válido. Nada foi gravado.");
  }
  if (p.tributadoNoAnexoIVDoSimples && !p.optanteSimplesNacional) {
    throw new Error(
      "Só o optante pelo Simples Nacional é tributado no Anexo IV. Nada foi gravado.",
    );
  }
  const dispensa =
    p.dispensaDoIR === null || p.dispensaDoIR.trim() === ""
      ? null
      : p.dispensaDoIR.trim().toUpperCase();
  if (dispensa !== null && !INCISOS_DO_ART_4.has(dispensa)) {
    throw new Error(
      "A dispensa do IR é um inciso do art. 4º da IN RFB 1.234/2012 (I a XXII). Nada foi gravado.",
    );
  }
  const municipio =
    p.municipioDoEstabelecimento === null ||
    p.municipioDoEstabelecimento.trim() === ""
      ? null
      : p.municipioDoEstabelecimento.trim();
  if (municipio !== null && !/^\d{7}$/.test(municipio)) {
    throw new Error(
      "O município do estabelecimento é o código IBGE de 7 dígitos. Nada foi gravado.",
    );
  }
  const fundamento = p.fundamento.trim().replace(/\s+/g, " ");
  if (fundamento.length < 10) {
    throw new Error(
      "Diga de onde vem a informação (consulta ao Portal do Simples, declaração do fornecedor...), com pelo menos 10 caracteres. Nada foi gravado.",
    );
  }
  return {
    ...p,
    documento,
    dispensaDoIR: dispensa,
    municipioDoEstabelecimento: municipio,
    fundamento,
  };
}

export async function registrarPerfilFiscal(
  prisma: PrismaClient,
  entrada: PerfilFiscalInput,
): Promise<string> {
  // Recusa de forma ANTES de abrir a transação; a autorização é a primeira coisa dentro dela.
  const p = validarPerfilFiscal(entrada);
  return prisma.$transaction(async (db) => {
    await autorizarNo(
      db,
      p.criadoPor,
      ACAO_DO_SERVICO.registrarPerfilFiscal,
      "ENTE",
    );
    const r = await db.perfilFiscalDoFornecedor.create({
      data: {
        documento: p.documento,
        vigenteDesde: p.vigenteDesde,
        optanteSimplesNacional: p.optanteSimplesNacional,
        tributadoNoAnexoIVDoSimples: p.tributadoNoAnexoIVDoSimples,
        contribuiSobreReceitaBruta: p.contribuiSobreReceitaBruta,
        dispensaDoIR: p.dispensaDoIR,
        municipioDoEstabelecimento: p.municipioDoEstabelecimento,
        fundamento: p.fundamento,
        criadoPor: p.criadoPor,
      },
      select: { id: true },
    });
    return r.id;
  });
}

/** O perfil vigente na data: o de maior `vigenteDesde` até ela; empate, o gravado por último. */
export async function perfilFiscalVigente(
  db: Tx,
  documento: string,
  data: Date,
): Promise<
  (PerfilFiscal & { readonly id: string; readonly vigenteDesde: Date }) | null
> {
  const p = await db.perfilFiscalDoFornecedor.findFirst({
    where: {
      documento: normalizarDocumento(documento),
      vigenteDesde: { lte: data },
    },
    orderBy: [{ vigenteDesde: "desc" }, { criadoEm: "desc" }],
  });
  if (p === null) return null;
  return {
    id: p.id,
    vigenteDesde: p.vigenteDesde,
    optanteSimplesNacional: p.optanteSimplesNacional,
    tributadoNoAnexoIVDoSimples: p.tributadoNoAnexoIVDoSimples,
    contribuiSobreReceitaBruta: p.contribuiSobreReceitaBruta,
    dispensaDoIR: p.dispensaDoIR,
    municipioDoEstabelecimento: p.municipioDoEstabelecimento,
    fundamento: p.fundamento,
  };
}

// ── Tabelas vigentes ──────────────────────────────────────────────────────────────────────────────

/** De cada chave, a linha de maior `vigenteDesde` até a data. */
function vigentesPor<T extends { vigenteDesde: Date }>(
  linhas: readonly T[],
  chave: (t: T) => string,
): T[] {
  const m = new Map<string, T>();
  for (const l of linhas) {
    const atual = m.get(chave(l));
    if (atual === undefined || l.vigenteDesde > atual.vigenteDesde)
      m.set(chave(l), l);
  }
  return [...m.values()];
}

export async function tabelasVigentes(
  db: Tx,
  data: Date,
): Promise<TabelasDaRetencao> {
  const ente = await db.enteConfig.findFirst({ select: { codigoIbge: true } });
  const municipioDoEnte = ente?.codigoIbge ?? null;
  const ate = { vigenteDesde: { lte: data } };
  const [ir, servicos, parametros, bases, iss] = await Promise.all([
    db.naturezaDaRetencaoDoIR.findMany({ where: ate }),
    db.servicoDaRetencaoPrevidenciaria.findMany({ where: ate }),
    db.parametroDaRetencaoPrevidenciaria.findMany({
      where: ate,
      orderBy: { vigenteDesde: "desc" },
      take: 1,
    }),
    db.baseMinimaDaRetencaoPrevidenciaria.findMany({ where: ate }),
    municipioDoEnte === null
      ? Promise.resolve([])
      : db.itemDaListaDoISS.findMany({
          where: { ...ate, municipioIbge: municipioDoEnte },
        }),
  ]);
  const p = parametros[0];
  return {
    naturezasIR: vigentesPor(ir, (x) => x.codigoReceita)
      .sort((a, b) => a.codigoReceita.localeCompare(b.codigoReceita))
      .map((x) => ({
        codigoReceita: x.codigoReceita,
        natureza: x.natureza,
        aliquota: new Decimal(x.aliquota.toString()),
        fonte: x.fonte,
      })),
    servicosINSS: vigentesPor(servicos, (x) => x.codigo)
      .sort(
        (a, b) =>
          a.artigo - b.artigo || ordemRomana(a.inciso) - ordemRomana(b.inciso),
      )
      .map((x) => ({
        codigo: x.codigo,
        descricao: x.descricao,
        somenteCessaoDeMaoDeObra: x.somenteCessaoDeMaoDeObra,
        construcaoCivil: x.construcaoCivil,
        fonte: x.fonte,
      })),
    parametroINSS:
      p === undefined
        ? null
        : {
            aliquota: new Decimal(p.aliquota.toString()),
            valorMinimo: new Decimal(p.valorMinimo.toString()),
            fonte: p.fonte,
          },
    basesMinimasINSS: vigentesPor(bases, (x) => x.codigo)
      .sort((a, b) => a.codigo.localeCompare(b.codigo))
      .map((x) => ({
        codigo: x.codigo,
        descricao: x.descricao,
        percentual: new Decimal(x.percentual.toString()),
        fonte: x.fonte,
      })),
    itensISS: vigentesPor(iss, (x) => x.subitem)
      .sort((a, b) => ordemDoSubitem(a.subitem) - ordemDoSubitem(b.subitem))
      .map((x) => ({
        subitem: x.subitem,
        descricao: x.descricao,
        aliquota: new Decimal(x.aliquota.toString()),
        localDeIncidencia: x.localDeIncidencia,
        fonte: x.fonte,
      })),
    municipioDoEnte,
  };
}

const ROMANOS: Record<string, number> = { I: 1, V: 5, X: 10, L: 50 };
const ordemRomana = (r: string): number =>
  [...r].reduce(
    (s, c, i, a) =>
      ROMANOS[c]! < (ROMANOS[a[i + 1] ?? ""] ?? 0)
        ? s - ROMANOS[c]!
        : s + ROMANOS[c]!,
    0,
  );
const ordemDoSubitem = (s: string): number => {
  const [i, j] = s.split(".");
  return Number(i) * 1000 + Number(j);
};

// ── O pagamento ───────────────────────────────────────────────────────────────────────────────────

/** O que a tela manda: os dados da operação, SEM o fornecedor e sem valores de retenção. */
export type DadosFiscaisDaOperacao = Omit<
  OperacaoDaRetencao,
  "documentoDoFornecedor" | "valorDoPagamento"
>;

export interface AvaliacaoDoPagamento {
  readonly documentoDoFornecedor: string;
  readonly perfil:
    | (PerfilFiscal & { readonly id: string; readonly vigenteDesde: Date })
    | null;
  readonly avaliacoes: readonly Avaliacao[];
}

/** O fornecedor vem do EMPENHO da liquidação — nunca do navegador. */
export async function avaliarRetencoesDoPagamento(
  db: Tx,
  p: {
    readonly liquidacaoId: string;
    readonly valorDoPagamento: Money;
    readonly data: Date;
    readonly operacao: DadosFiscaisDaOperacao;
  },
): Promise<AvaliacaoDoPagamento> {
  const liq = await db.liquidacao.findUnique({
    where: { id: p.liquidacaoId },
    select: { empenho: { select: { credorCpfCnpj: true } } },
  });
  if (liq === null)
    throw new Error("Liquidação não encontrada. Nada foi gravado.");
  const documento = normalizarDocumento(liq.empenho.credorCpfCnpj);
  const [perfil, tabelas] = await Promise.all([
    perfilFiscalVigente(db, documento, p.data),
    tabelasVigentes(db, p.data),
  ]);
  const avaliacoes = calcularRetencoes(
    {
      ...p.operacao,
      documentoDoFornecedor: documento,
      valorDoPagamento: p.valorDoPagamento,
    },
    perfil,
    tabelas,
  );
  return { documentoDoFornecedor: documento, perfil, avaliacoes };
}

const CODIGO_DO_TIPO: Record<Tributo, string> = {
  IRRF: "IRRF",
  INSS: "INSS",
  ISS: "ISS",
};

/**
 * Monta as retenções e a memória do cálculo para o `pagar` do M05. Recusa se algum tributo ficou sem
 * resposta, se as retenções passam do valor pago, ou se falta o tipo de consignação (com conta) do
 * tributo retido.
 */
export async function prepararRetencoesCalculadas(
  db: Tx,
  p: {
    readonly liquidacaoId: string;
    readonly valorDoPagamento: Money;
    readonly data: Date;
    readonly operacao: DadosFiscaisDaOperacao;
    /** V26 — a conta bancária que paga: é o titular dela que diz se o IR/ISS fica no mesmo Tesouro. */
    readonly contaBancariaId: string;
  },
): Promise<{
  readonly retencoes: readonly RetencaoDoPagamentoInput[];
  readonly calculos: readonly CalculoDaRetencaoParaPersistir[];
  readonly proprias: readonly RetencaoPropriaParaCompor[];
}> {
  const av = await avaliarRetencoesDoPagamento(db, p);
  exigirRetencoesFechadas(av.avaliacoes, p.valorDoPagamento);
  const ente = await db.enteConfig.findFirst({ select: { nome: true } });

  const retidos = av.avaliacoes.filter((a) => valorRetido(a).greaterThan(0));
  // A conta é a da DECISÃO VIGENTE do ente (a mesma leitura da tela de pagamento), não a do cadastro
  // original: trocar a conta pela tela de consignações tem de valer aqui também.
  const tipos = await listarTiposConsignacao(db);
  const retencoes: RetencaoDoPagamentoInput[] = [];
  const proprias: RetencaoPropriaParaCompor[] = [];
  const tipoDe = new Map<Tributo, string>();
  for (const a of retidos) {
    // ═══ V26 — O IR E O ISS DO PRÓPRIO MUNICÍPIO SÃO RECEITA, NÃO CONSIGNAÇÃO ═══
    // O IR retido de PJ (IN RFB 1.234/2012) pertence ao município (CF, art. 158, I); o ISS só é retido
    // aqui quando o local de incidência é o próprio município. Sem a decisão do ente, RECUSA nomeando.
    // Conta de OUTRO titular (fundo, autarquia): o imposto é do Tesouro, mas o dinheiro está noutra conta —
    // segue como consignação ao Tesouro, para o repasse real e conciliável.
    const fato = FATO_PROPRIO[a.tributo];
    if (fato !== null) {
      const c = await exigirClassificacaoPropria(db, fato, p.data);
      if (await mesmoPerimetro(db, p.contaBancariaId, c)) {
        proprias.push({
          fato,
          classificacaoId: c.id,
          valor: valorRetido(a),
          contaCredito: c.contaCredito,
          contaVpa: c.contaVpa,
          naturezaReceitaCodigo: c.naturezaReceitaCodigo,
          fonteCodigo: c.fonteCodigo,
          entidadeTitularId: c.entidadeTitularId,
        });
        continue;
      }
    }
    const t = tipos.find((x) => x.codigo === CODIGO_DO_TIPO[a.tributo]);
    if (t === undefined || !t.ativo || t.contaPassivoCodigo === null) {
      throw new Error(
        `O ${a.tributo} foi retido, mas o tipo de consignação ${CODIGO_DO_TIPO[a.tributo]} não está cadastrado, ativo e com conta de passivo. Cadastre em Financeiro › Tipos de consignação. Nada foi gravado.`,
      );
    }
    tipoDe.set(a.tributo, t.id);
    // O IR retido pelo município é dele (IN RFB 1.234/2012, art. 7º-A); o ISS retido aqui é devido ao
    // próprio município (o cálculo só retém quando o local de incidência é o do ente); o INSS é
    // recolhido à Previdência Social (IN RFB 2.110/2022, art. 110).
    const credor =
      a.tributo === "INSS" ? "Previdência Social" : (ente?.nome ?? "Município");
    retencoes.push({
      tipoConsignacaoId: t.id,
      credorConsignatario: credor,
      valor: valorRetido(a).toFixed(2),
      contaConsignacaoAPagar: t.contaPassivoCodigo,
    });
  }
  const entradaComum = {
    documentoDoFornecedor: av.documentoDoFornecedor,
    perfilFiscalId: av.perfil?.id ?? null,
    valorDoPagamento: p.valorDoPagamento.toFixed(2),
    valorDoDocumentoFiscal: p.operacao.valorDoDocumentoFiscal.toFixed(2),
  };
  const calculos: CalculoDaRetencaoParaPersistir[] = av.avaliacoes.map((a) => {
    const entrada =
      a.tributo === "IRRF"
        ? {
            ...entradaComum,
            naturezaIR: p.operacao.naturezaIR,
            pagamentoComGlosa: p.operacao.pagamentoComGlosa,
          }
        : a.tributo === "INSS"
          ? {
              ...entradaComum,
              ...p.operacao.inss,
              valorMateriais: p.operacao.inss.valorMateriais.toFixed(2),
              deducoes: p.operacao.inss.deducoes.toFixed(2),
            }
          : {
              ...entradaComum,
              ...p.operacao.iss,
              aliquotaDoSimplesNoDocumento:
                p.operacao.iss.aliquotaDoSimplesNoDocumento?.toString() ?? null,
            };
    switch (a.resultado) {
      case "RETIDO":
        return {
          tributo: a.tributo,
          resultado: "RETIDO",
          base: a.base,
          aliquota: a.aliquota,
          valor: a.valor,
          fundamento: a.fundamento,
          entrada,
          tipoConsignacaoId: tipoDe.get(a.tributo) ?? null,
        };
      case "INFORMADO":
        return {
          tributo: a.tributo,
          resultado: "INFORMADO",
          base: null,
          aliquota: null,
          valor: a.valor,
          fundamento: a.fundamento,
          entrada,
          tipoConsignacaoId: tipoDe.get(a.tributo) ?? null,
        };
      case "NAO_RETIDO":
        return {
          tributo: a.tributo,
          resultado: "NAO_RETIDO",
          base: null,
          aliquota: null,
          valor: toMoney(0),
          fundamento: a.fundamento,
          entrada,
          tipoConsignacaoId: null,
        };
      case "NAO_CALCULAVEL":
        // exigirRetencoesFechadas já recusou; aqui é inalcançável.
        throw new Error(`O ${a.tributo} ficou sem cálculo. Nada foi gravado.`);
    }
  });
  return { retencoes, calculos, proprias };
}

/** V26 — o fato da retenção própria que cada tributo do pagamento de fornecedor produz (o INSS nunca). */
const FATO_PROPRIO: Readonly<Record<Tributo, FatoDaRetencaoPropria | null>> = {
  IRRF: "IRRF_FORNECEDOR_PJ",
  ISS: "ISS",
  INSS: null,
};

export { exigirJustificativa };
