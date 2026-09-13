import { z } from "zod";
import { toMoney, zMoney, type Money } from "../../packages/contracts/index.js";

/**
 * M02b — DOMÍNIO PURO do planejamento PLURIANUAL (PPA e LDO).
 *
 * Nada aqui toca banco: as mesmas funções validam o PPA do teste e o do TCE.
 *
 * ═══ ⚠️ A PROCEDÊNCIA DOS CAMPOS ═══
 * As listas vieram do enunciado do PR, escritas por quem leu o manual SIGA v44.
 * **Nenhuma das specs 48/49/76-82 está transcrita neste repositório.** Isto NÃO é
 * conformidade SIGA conferida — ver o cabeçalho de `prisma/schema/m02b-plurianual.prisma`.
 */

// ═══════════════════════════════════════════════════════════════════════════
// O QUADRIÊNIO — a regra que define o que é um PPA
// ═══════════════════════════════════════════════════════════════════════════

/** Quantos exercícios o PPA cobre (CF art. 165 §1º). */
export const ANOS_DO_QUADRIENIO = 4;

/**
 * ⚠️ `anoFim − anoInicio == 3`, E NÃO `== 4`.
 *
 * As duas pontas são INCLUSIVAS: 2026 a 2029 são QUATRO exercícios, e a diferença é
 * TRÊS. Escrever `== 4` é o erro clássico de intervalo fechado — e ele produziria um
 * "PPA" de cinco anos que nenhum teste de valor pegaria, porque os valores estariam
 * todos certos.
 */
export function duracaoValidaDoQuadrienio(anoInicio: number, anoFim: number): boolean {
  return anoFim - anoInicio === ANOS_DO_QUADRIENIO - 1;
}

/** O ano está DENTRO do quadriênio? Bordas inclusivas. */
export function anoNoQuadrienio(anoInicio: number, anoFim: number, ano: number): boolean {
  return ano >= anoInicio && ano <= anoFim;
}

// ═══════════════════════════════════════════════════════════════════════════
// AS DERIVAÇÕES — o que NÃO é coluna, e por quê
// ═══════════════════════════════════════════════════════════════════════════

/**
 * O RESULTADO PRIMÁRIO = receita primária − despesa primária.
 *
 * ═══ ⚠️ POR QUE ELE NÃO É COLUNA ═══
 * As duas parcelas estão gravadas em `MetaAnualLdo`. Guardar a diferença seria CACHE
 * DE DINHEIRO — exatamente o que este repositório recusa desde o M11 ("uma coluna
 * `valorAtual` seria um cache, e cache de dinheiro é o bug do TR 5.9 esperando
 * acontecer").
 *
 * No dia em que alguém corrigisse a receita primária e esquecesse o resultado, a LDO
 * passaria a declarar um superávit que as próprias parcelas dela desmentem — e o
 * Anexo de Metas Fiscais é assinado pelo Prefeito.
 *
 * ⚠️ ELE PODE SER NEGATIVO, e frequentemente é: déficit primário é um resultado
 * legítimo, não um erro. Nenhum guard de sinal aqui.
 */
export function resultadoPrimario(receitaPrimaria: Money, despesaPrimaria: Money): Money {
  return toMoney(receitaPrimaria.minus(despesaPrimaria));
}

/**
 * A DÍVIDA CONSOLIDADA LÍQUIDA = consolidada − deduções.
 *
 * ⚠️ Mesma razão do resultado primário: as duas parcelas estão em
 * `DividaConsolidadaLdo`, e a diferença não vira coluna. O CHECK do banco garante
 * `deducoes <= dividaConsolidada`, então o resultado nunca é negativo aqui.
 */
export function dividaLiquida(consolidada: Money, deducoes: Money): Money {
  return toMoney(consolidada.minus(deducoes));
}

/**
 * A MARGEM DE EXPANSÃO (LRF art. 4º §2º, V) = aumento permanente de receita
 * + redução permanente de despesa − novas despesas obrigatórias continuadas.
 *
 * ⚠️ ELA PODE SER NEGATIVA, e é aí que ela informa: margem negativa significa que o
 * ente assumiu mais gasto continuado do que a receita permanente comporta. Um CHECK
 * de positividade impediria justamente a declaração que a LRF quer ver.
 */
export function margemDeExpansao(
  aumentoReceita: Money,
  reducaoDespesa: Money,
  novasDespesas: Money
): Money {
  return toMoney(aumentoReceita.plus(reducaoDespesa).minus(novasDespesas));
}

// ═══════════════════════════════════════════════════════════════════════════
// OS DOMÍNIOS TABELADOS — do enunciado, NÃO de spec conferida
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ O ROL DO PASSIVO CONTINGENTE (1 a 8, mais 99).
 *
 * Veio do enunciado do PR, que o leu no manual v44. Como o manual NÃO está transcrito
 * aqui, isto é um `Set` de strings + CHECK no banco, e NÃO um enum do Prisma: um enum
 * congelaria em migration um rol ainda não conferido, e mudá-lo exigiria `ALTER TYPE`.
 *
 * ⚠️ O 99 ("outros") EXISTE DE PROPÓSITO: sem ele, um passivo que não se encaixa nos
 * oito viraria uma classificação ERRADA, e classificação errada num anexo da LRF é
 * pior do que a honestidade de "outros".
 */
export const CODIGOS_PASSIVO_CONTINGENTE: readonly string[] = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "99",
];

/** ⚠️ Mesma procedência e mesmo raciocínio: rol do enunciado, imposto por CHECK. */
export const TIPOS_APLICACAO_ALIENACAO: readonly string[] = ["1", "2", "3", "4", "5"];

// ═══════════════════════════════════════════════════════════════════════════
// ENTRADA (Zod)
// ═══════════════════════════════════════════════════════════════════════════

const zAno = z.number().int().min(1900).max(2200);
const zCodigo = z.string().trim().min(1);
const zDescricao = z.string().trim().min(3);
/** Dinheiro NÃO-NEGATIVO. Onde o negativo é legítimo, usa-se `zMoney` puro. */
const zValorNaoNegativo = zMoney.refine((v) => v.greaterThanOrEqualTo(0), {
  message: "Valor não pode ser negativo",
});
/** Índice/quantidade — pode ser negativo (saldo migratório, variação do PIB). */
const zIndice = zMoney;

// ── PPA ────────────────────────────────────────────────────────────────────

export const zCriarPlanoPlurianualInput = z
  .object({
    anoInicio: zAno,
    anoFim: zAno,
    leiRef: z.string().trim().min(1, "A lei que instituiu o plano"),
    dataPublicacao: z.coerce.date(),
    criadoPor: z.string().min(1),
  })
  .superRefine((v, ctx) => {
    if (v.anoFim <= v.anoInicio) {
      ctx.addIssue({
        code: "custom",
        path: ["anoFim"],
        message:
          `QUADRIÊNIO INVERTIDO: ${v.anoFim} não é posterior a ${v.anoInicio}. ` +
          `O PPA cobre quatro exercícios consecutivos.`,
      });
      return;
    }
    if (!duracaoValidaDoQuadrienio(v.anoInicio, v.anoFim)) {
      ctx.addIssue({
        code: "custom",
        path: ["anoFim"],
        message:
          `DURAÇÃO INVÁLIDA: ${v.anoInicio}–${v.anoFim} são ` +
          `${v.anoFim - v.anoInicio + 1} exercícios. A CF art. 165 §1º define o PPA como ` +
          `de QUATRO — nem três, nem cinco. Um plano de outra duração não é um PPA.`,
      });
    }
  });
export type CriarPlanoPlurianualInput = z.input<typeof zCriarPlanoPlurianualInput>;

/** Os quatro cadastros da árvore temática compartilham a forma. */
export const zCriarEixoInput = z.object({
  codigo: zCodigo,
  descricao: zDescricao,
  criadoPor: z.string().min(1),
});
export type CriarEixoInput = z.input<typeof zCriarEixoInput>;

export const zCriarAreaTematicaInput = z.object({
  codigo: zCodigo,
  descricao: zDescricao,
  eixoId: z.string().min(1),
  criadoPor: z.string().min(1),
});
export type CriarAreaTematicaInput = z.input<typeof zCriarAreaTematicaInput>;

export const zCriarPublicoAlvoInput = zCriarEixoInput;
export type CriarPublicoAlvoInput = z.input<typeof zCriarPublicoAlvoInput>;

export const zCriarMacroacaoInput = zCriarEixoInput;
export type CriarMacroacaoInput = z.input<typeof zCriarMacroacaoInput>;

export const zCriarProgramaPpaInput = z.object({
  planoId: z.string().min(1),
  programaId: z.string().min(1),
  areaTematicaId: z.string().min(1),
  publicoAlvoId: z.string().min(1).optional(),
  /** COMO o programa será executado neste plano. O `objetivo` é do `Programa` (M02). */
  estrategia: z.string().trim().min(3).optional(),
  valorPrevisto: zValorNaoNegativo,
  criadoPor: z.string().min(1),
});
export type CriarProgramaPpaInput = z.input<typeof zCriarProgramaPpaInput>;

export const zCriarIndicadorProgramaInput = z.object({
  programaPpaId: z.string().min(1),
  descricao: zDescricao,
  unidadeMedida: z.string().trim().min(1),
  /** ⚠️ Podem ser NEGATIVOS — ver `zIndice`. */
  situacaoInicial: zIndice,
  situacaoModificada: zIndice,
  criadoPor: z.string().min(1),
});
export type CriarIndicadorProgramaInput = z.input<typeof zCriarIndicadorProgramaInput>;

export const zCriarAcaoPpaInput = z.object({
  programaPpaId: z.string().min(1),
  acaoId: z.string().min(1),
  macroacaoId: z.string().min(1).optional(),
  unidadeExecutoraId: z.string().min(1),
  funcaoId: z.string().min(1),
  subfuncaoId: z.string().min(1),
  produto: z.string().trim().min(3, "O bem ou serviço entregue à sociedade"),
  unidadeMedida: z.string().trim().min(1),
  regiaoAtendida: z.string().trim().min(1).optional(),
  metaFisica: zValorNaoNegativo,
  metaFinanceira: zValorNaoNegativo,
  criadoPor: z.string().min(1),
});
export type CriarAcaoPpaInput = z.input<typeof zCriarAcaoPpaInput>;

export const zCriarPrevisaoReceitaPpaInput = z.object({
  planoId: z.string().min(1),
  naturezaReceitaId: z.string().min(1),
  fonteId: z.string().min(1),
  /** ⚠️ Tem de estar DENTRO do quadriênio — o serviço confere contra o plano. */
  ano: zAno,
  valor: zValorNaoNegativo,
  criadoPor: z.string().min(1),
});
export type CriarPrevisaoReceitaPpaInput = z.input<typeof zCriarPrevisaoReceitaPpaInput>;

export const zCriarReceitaAnteriorPpaInput = z.object({
  planoId: z.string().min(1),
  naturezaReceitaId: z.string().min(1),
  /** ⚠️ Tem de ser ANTERIOR ao quadriênio — é a série histórica que o instrui. */
  ano: zAno,
  valor: zValorNaoNegativo,
  criadoPor: z.string().min(1),
});
export type CriarReceitaAnteriorPpaInput = z.input<typeof zCriarReceitaAnteriorPpaInput>;

// ── LDO ────────────────────────────────────────────────────────────────────

export const zCriarLdoInput = z
  .object({
    exercicio: zAno,
    inicioVigencia: z.coerce.date(),
    fimVigencia: z.coerce.date(),
    dataEnvioLegislativo: z.coerce.date().optional(),
    dataDevolucaoExecutivo: z.coerce.date().optional(),
    numeroProtocolo: z.string().trim().min(1).optional(),
    dataSancao: z.coerce.date().optional(),
    criadoPor: z.string().min(1),
  })
  .superRefine((v, ctx) => {
    if (v.fimVigencia <= v.inicioVigencia) {
      ctx.addIssue({
        code: "custom",
        path: ["fimVigencia"],
        message: `VIGÊNCIA INVERTIDA: o fim não é posterior ao início.`,
      });
    }
    // ⚠️ O TRÂMITE TEM ORDEM, e cada regra só vale com as DUAS pontas presentes: a LDO
    // é cadastrada antes de tramitar, e as datas chegam uma a uma.
    if (
      v.dataEnvioLegislativo !== undefined &&
      v.dataDevolucaoExecutivo !== undefined &&
      v.dataDevolucaoExecutivo < v.dataEnvioLegislativo
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["dataDevolucaoExecutivo"],
        message:
          "TRÂMITE FORA DE ORDEM: o Legislativo devolveu antes de receber. " +
          "Uma data digitada trocada faria o extrato de trâmite contar uma história impossível.",
      });
    }
    if (
      v.dataDevolucaoExecutivo !== undefined &&
      v.dataSancao !== undefined &&
      v.dataSancao < v.dataDevolucaoExecutivo
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["dataSancao"],
        message: "TRÂMITE FORA DE ORDEM: sancionada antes de devolvida pelo Legislativo.",
      });
    }
  });
export type CriarLdoInput = z.input<typeof zCriarLdoInput>;

export const zCriarPrioridadeLdoInput = z.object({
  ldoId: z.string().min(1),
  /** Nullable: a prioridade pode ser aprovada antes de a ação existir na classificação. */
  acaoId: z.string().min(1).optional(),
  descricaoAcao: zDescricao,
  produto: z.string().trim().min(3),
  unidadeMedida: z.string().trim().min(1),
  meta: zValorNaoNegativo,
  criadoPor: z.string().min(1),
});
export type CriarPrioridadeLdoInput = z.input<typeof zCriarPrioridadeLdoInput>;

/**
 * ⚠️ NÃO HÁ `resultadoPrimario` NA ENTRADA, e é deliberado: ele é derivado das duas
 * parcelas primárias. Aceitá-lo abriria a porta para o chamador informar um resultado
 * que não bate com elas — e aí haveria duas verdades no mesmo registro.
 */
export const zCriarMetaAnualLdoInput = z
  .object({
    ldoId: z.string().min(1),
    ano: zAno,
    receitaTotal: zValorNaoNegativo,
    receitaPrimaria: zValorNaoNegativo,
    despesaTotal: zValorNaoNegativo,
    despesaPrimaria: zValorNaoNegativo,
    /** ⚠️ PODE SER NEGATIVO — déficit nominal é resultado legítimo. */
    resultadoNominal: zMoney,
    dividaPublicaConsolidada: zValorNaoNegativo,
    dividaConsolidadaLiquida: zValorNaoNegativo,
    receitaPrimariaPpp: zValorNaoNegativo,
    despesaPrimariaPpp: zValorNaoNegativo,
    /** ⚠️ PODE SER NEGATIVO — o impacto das PPP no saldo costuma ser. */
    impactoSaldoPpp: zMoney,
    criadoPor: z.string().min(1),
  })
  .superRefine((v, ctx) => {
    // A primária é a total MENOS as financeiras — por construção, menor ou igual.
    // Uma primária maior que a total denuncia colunas trocadas no preenchimento.
    if (v.receitaPrimaria.greaterThan(v.receitaTotal)) {
      ctx.addIssue({
        code: "custom",
        path: ["receitaPrimaria"],
        message:
          `RECEITA PRIMÁRIA (${v.receitaPrimaria.toFixed(2)}) MAIOR QUE A TOTAL ` +
          `(${v.receitaTotal.toFixed(2)}). A primária é a total menos as financeiras — ` +
          `ela não pode excedê-la. Confira se as colunas não foram trocadas.`,
      });
    }
    if (v.despesaPrimaria.greaterThan(v.despesaTotal)) {
      ctx.addIssue({
        code: "custom",
        path: ["despesaPrimaria"],
        message:
          `DESPESA PRIMÁRIA (${v.despesaPrimaria.toFixed(2)}) MAIOR QUE A TOTAL ` +
          `(${v.despesaTotal.toFixed(2)}).`,
      });
    }
  });
export type CriarMetaAnualLdoInput = z.input<typeof zCriarMetaAnualLdoInput>;

export const zCriarRiscoFiscalInput = z.object({
  ldoId: z.string().min(1),
  codigoPassivo: z
    .string()
    .trim()
    .refine((c) => CODIGOS_PASSIVO_CONTINGENTE.includes(c), {
      message:
        `Código de passivo contingente fora do domínio. Aceitos: ` +
        `${CODIGOS_PASSIVO_CONTINGENTE.join(", ")} (99 = outros).`,
    }),
  descricaoPassivo: zDescricao,
  valorPassivo: zValorNaoNegativo,
  /** ⚠️ A LRF exige o risco COM a medida de contenção — passivo sem providência é
   *  metade do anexo. Por isso os dois são obrigatórios. */
  descricaoProvidencia: zDescricao,
  valorProvidencia: zValorNaoNegativo,
  criadoPor: z.string().min(1),
});
export type CriarRiscoFiscalInput = z.input<typeof zCriarRiscoFiscalInput>;

export const zCriarRenunciaReceitaLdoInput = z.object({
  ldoId: z.string().min(1),
  descricao: zDescricao,
  valor: zValorNaoNegativo,
  descricaoCompensacao: zDescricao,
  /** Pode ser 0,00 (compensada pelo crescimento da base) — diferente de ausente. */
  valorCompensacao: zValorNaoNegativo,
  criadoPor: z.string().min(1),
});
export type CriarRenunciaReceitaLdoInput = z.input<typeof zCriarRenunciaReceitaLdoInput>;

export const zCriarAlienacaoBemLdoInput = z.object({
  ldoId: z.string().min(1),
  descricaoBem: zDescricao,
  valorAlienacao: zValorNaoNegativo,
  numeroLaudo: z.string().trim().min(1).optional(),
  criadoPor: z.string().min(1),
});
export type CriarAlienacaoBemLdoInput = z.input<typeof zCriarAlienacaoBemLdoInput>;

export const zCriarAplicacaoAlienacaoLdoInput = z.object({
  alienacaoId: z.string().min(1),
  tipoAplicacao: z
    .string()
    .trim()
    .refine((t) => TIPOS_APLICACAO_ALIENACAO.includes(t), {
      message: `Tipo de aplicação fora do domínio. Aceitos: ${TIPOS_APLICACAO_ALIENACAO.join(", ")}.`,
    }),
  anoAplicacao: zAno,
  descricao: zDescricao,
  valor: zValorNaoNegativo,
  criadoPor: z.string().min(1),
});
export type CriarAplicacaoAlienacaoLdoInput = z.input<
  typeof zCriarAplicacaoAlienacaoLdoInput
>;

export const zCriarDividaConsolidadaLdoInput = z
  .object({
    ldoId: z.string().min(1),
    ano: zAno,
    dividaConsolidada: zValorNaoNegativo,
    deducoes: zValorNaoNegativo,
    receitaCorrenteLiquida: zMoney.refine((v) => v.greaterThan(0), {
      message: "RCL tem de ser > 0 — é o denominador do limite do Senado.",
    }),
    percentualRcl: zValorNaoNegativo,
    criadoPor: z.string().min(1),
  })
  .superRefine((v, ctx) => {
    if (v.deducoes.greaterThan(v.dividaConsolidada)) {
      ctx.addIssue({
        code: "custom",
        path: ["deducoes"],
        message:
          `DEDUÇÕES (${v.deducoes.toFixed(2)}) MAIORES QUE A DÍVIDA CONSOLIDADA ` +
          `(${v.dividaConsolidada.toFixed(2)}). A líquida ficaria negativa, o que não é ` +
          `um estoque possível.`,
      });
    }
  });
export type CriarDividaConsolidadaLdoInput = z.input<
  typeof zCriarDividaConsolidadaLdoInput
>;

export const zCriarProjecaoAtuarialRppsInput = z.object({
  ldoId: z.string().min(1),
  ano: zAno,
  receitasPrevidenciarias: zValorNaoNegativo,
  despesasPrevidenciarias: zValorNaoNegativo,
  /** ⚠️ PODEM SER NEGATIVOS — um RPPS deficitário é o que a projeção existe para revelar. */
  resultadoPrevidenciario: zMoney,
  saldoFinanceiro: zMoney,
  criadoPor: z.string().min(1),
});
export type CriarProjecaoAtuarialRppsInput = z.input<
  typeof zCriarProjecaoAtuarialRppsInput
>;

export const zCriarMargemExpansaoLdoInput = z.object({
  ldoId: z.string().min(1),
  ano: zAno,
  aumentoPermanenteReceita: zValorNaoNegativo,
  reducaoPermanenteDespesa: zValorNaoNegativo,
  novasDespesasObrigatorias: zValorNaoNegativo,
  criadoPor: z.string().min(1),
});
export type CriarMargemExpansaoLdoInput = z.input<typeof zCriarMargemExpansaoLdoInput>;
