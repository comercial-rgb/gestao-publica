import { z } from "zod";
import { toMoney, zMoney, type Money } from "../../packages/contracts/index.js";

/**
 * M11 — DOMÍNIO PURO de licitações e contratos (Lei 14.133/2021).
 *
 * Nada aqui toca banco: as mesmas funções somam o contrato do teste e o contrato
 * do TCE. O que muda é o RECORTE (quais movimentos, até quando) — a aritmética é
 * uma só.
 */

// ═══════════════════════════════════════════════════════════════════════════
// MODALIDADES — rol FECHADO (art. 28 + arts. 74/75 da Lei 14.133/2021)
// ═══════════════════════════════════════════════════════════════════════════

export type ModalidadeLicitacao =
  | "PREGAO_ELETRONICO"
  | "PREGAO_PRESENCIAL"
  | "CONCORRENCIA"
  | "CONCURSO"
  | "LEILAO"
  | "DIALOGO_COMPETITIVO"
  | "DISPENSA"
  | "INEXIGIBILIDADE";

/**
 * O rol da LEI, com o artigo de cada um. O `Record` exaustivo é o guarda: quando
 * alguém acrescentar uma modalidade ao enum do Prisma, o TypeScript vai cobrar a
 * entrada aqui — e quem a acrescentar terá de dizer de que artigo ela saiu.
 *
 * ⚠️ DISPENSA e INEXIGIBILIDADE são MODALIDADES, não a ausência de uma. É por
 * isso que `Contrato.processoId` é obrigatório: a contratação direta também tem
 * processo.
 */
export const MODALIDADES: Record<
  ModalidadeLicitacao,
  { readonly nome: string; readonly base: string }
> = {
  PREGAO_ELETRONICO: { nome: "Pregão eletrônico", base: "art. 28, I" },
  PREGAO_PRESENCIAL: { nome: "Pregão presencial", base: "art. 28, I" },
  CONCORRENCIA: { nome: "Concorrência", base: "art. 28, II" },
  CONCURSO: { nome: "Concurso", base: "art. 28, III" },
  LEILAO: { nome: "Leilão", base: "art. 28, IV" },
  DIALOGO_COMPETITIVO: { nome: "Diálogo competitivo", base: "art. 28, V" },
  DISPENSA: { nome: "Dispensa de licitação", base: "art. 75" },
  INEXIGIBILIDADE: { nome: "Inexigibilidade", base: "art. 74" },
};

// ═══════════════════════════════════════════════════════════════════════════
// DISPENSA POR VALOR — o teto do art. 75, I e II (TR 5.106)
// ═══════════════════════════════════════════════════════════════════════════

export type HipoteseDispensa =
  | "POR_VALOR_OBRAS"
  | "POR_VALOR_COMPRAS"
  | "OUTRAS";

/**
 * Qual COLUNA de limite cada hipótese consulta — e o `null` que diz "nenhuma".
 *
 * Os incisos III a XVI (emergência, licitação deserta, produtor rural...) dispensam
 * a licitação por MOTIVO, não por valor: uma emergência de 5 milhões é legal. Por
 * isso `OUTRAS` tem `null` — e o guard do teto simplesmente NÃO CORRE para ela.
 * O `null` aqui não é "não sei": é "esta hipótese não tem teto", e é o Record que
 * força quem criar uma hipótese nova a dizer de qual das duas ela é.
 */
export const LIMITE_DA_HIPOTESE: Record<
  HipoteseDispensa,
  "OBRAS" | "COMPRAS" | null
> = {
  POR_VALOR_OBRAS: "OBRAS",
  POR_VALOR_COMPRAS: "COMPRAS",
  OUTRAS: null,
};

export interface LimiteVigente {
  readonly fonteLegal: string;
  readonly vigenciaInicio: Date;
  readonly obrasEngenharia: Money;
  readonly comprasServicos: Money;
  readonly controleInternoObras: Money | null;
  readonly controleInternoCompras: Money | null;
}

/**
 * O TETO REAL de uma hipótese = MIN(oficial, controle interno).
 *
 * O ente pode se autolimitar ABAIXO da lei (controle interno), nunca acima — o Zod
 * do cadastro barra o inverso. Devolve `null` quando a hipótese não tem teto
 * (OUTRAS), e é o `null` que faz o guard não correr.
 */
export function tetoDaDispensa(
  hipotese: HipoteseDispensa,
  limite: LimiteVigente
): Money | null {
  const coluna = LIMITE_DA_HIPOTESE[hipotese];
  if (coluna === null) return null;

  const oficial =
    coluna === "OBRAS" ? limite.obrasEngenharia : limite.comprasServicos;
  const interno =
    coluna === "OBRAS"
      ? limite.controleInternoObras
      : limite.controleInternoCompras;

  if (interno === null) return oficial;
  return interno.lessThan(oficial) ? interno : oficial;
}

/**
 * ⚠️ O TETO É ESTRITO: o art. 75 autoriza a dispensa para "valores INFERIORES a".
 * Um contrato de EXATAMENTE 65.492,11 NÃO é inferior a 65.492,11 — ele é igual, e a
 * dispensa não o alcança. `>=` reprova, e é de propósito.
 */
export function estouraOTeto(valor: Money, teto: Money): boolean {
  return valor.greaterThanOrEqualTo(teto);
}

// ═══════════════════════════════════════════════════════════════════════════
// AS DUAS DIMENSÕES DE UM ADITIVO — e por que são DOIS Records
// ═══════════════════════════════════════════════════════════════════════════

export type TipoMovimentoContratual =
  | "ACRESCIMO_VALOR"
  | "SUPRESSAO_VALOR"
  | "PRORROGACAO_PRAZO"
  | "ESTORNO_ACRESCIMO_VALOR"
  | "ESTORNO_SUPRESSAO_VALOR"
  | "ESTORNO_PRORROGACAO_PRAZO";

/**
 * DUAS DIMENSÕES, UM MOVIMENTO.
 *
 * Um aditivo mexe em VALOR **ou** em PRAZO. Um único Record com um sinal só teria
 * de responder "quanto este movimento soma?" sem saber SOMA NO QUÊ — e um
 * `PRORROGACAO_PRAZO` de 90 acabaria somando 90 reais ao contrato, ou um
 * `ACRESCIMO_VALOR` de 20.000 esticaria a vigência em 20 mil dias.
 *
 * Daí o ZERO: cada tipo é NEUTRO na dimensão que não é a dele. O zero não é
 * "não sei" — é "este movimento não fala dessa dimensão", e é o que faz as duas
 * somas correrem sobre a MESMA lista sem se contaminarem.
 *
 * (E o CHECK no banco garante que a dimensão neutra venha NULA — ver
 * prisma/sql/ck_movimento_contratual_xor.sql. Record e CHECK dizem a mesma coisa,
 * um em TypeScript e o outro em SQL.)
 */
export const SINAL_VALOR_CONTRATUAL: Record<TipoMovimentoContratual, 1 | -1 | 0> = {
  ACRESCIMO_VALOR: 1,
  SUPRESSAO_VALOR: -1,
  /** Prorrogar não muda o preço. */
  PRORROGACAO_PRAZO: 0,
  /** Desfaz o acréscimo: o valor volta a baixar. */
  ESTORNO_ACRESCIMO_VALOR: -1,
  /** Desfaz a supressão: o valor volta a subir. */
  ESTORNO_SUPRESSAO_VALOR: 1,
  ESTORNO_PRORROGACAO_PRAZO: 0,
};

export const SINAL_PRAZO_CONTRATUAL: Record<TipoMovimentoContratual, 1 | -1 | 0> = {
  /** Mexer no valor não estica a vigência. */
  ACRESCIMO_VALOR: 0,
  SUPRESSAO_VALOR: 0,
  PRORROGACAO_PRAZO: 1,
  ESTORNO_ACRESCIMO_VALOR: 0,
  ESTORNO_SUPRESSAO_VALOR: 0,
  /** Desfaz a prorrogação: a vigência volta a encurtar. */
  ESTORNO_PRORROGACAO_PRAZO: -1,
};

/** O tipo do estorno de cada movimento. Um estorno NÃO se estorna. */
export const TIPO_DO_ESTORNO: Record<
  TipoMovimentoContratual,
  TipoMovimentoContratual | null
> = {
  ACRESCIMO_VALOR: "ESTORNO_ACRESCIMO_VALOR",
  SUPRESSAO_VALOR: "ESTORNO_SUPRESSAO_VALOR",
  PRORROGACAO_PRAZO: "ESTORNO_PRORROGACAO_PRAZO",
  ESTORNO_ACRESCIMO_VALOR: null,
  ESTORNO_SUPRESSAO_VALOR: null,
  ESTORNO_PRORROGACAO_PRAZO: null,
};

export function tipoDoEstorno(
  tipo: TipoMovimentoContratual
): TipoMovimentoContratual {
  const estorno = TIPO_DO_ESTORNO[tipo];
  if (estorno === null) {
    throw new Error(
      `${tipo} JÁ É um estorno — não se estorna um estorno. Para desfazer o ` +
        `desfazimento, registre o movimento original de novo (append-only: cada ` +
        `fato é uma linha, e o histórico não se reescreve).`
    );
  }
  return estorno;
}

// ═══════════════════════════════════════════════════════════════════════════
// AS DERIVAÇÕES — puras, e as ÚNICAS
// ═══════════════════════════════════════════════════════════════════════════

export interface MovimentoDoContrato {
  readonly tipo: TipoMovimentoContratual;
  readonly valor: Money | null;
  readonly dias: number | null;
}

const MS_POR_DIA = 86_400_000;

/**
 * O VALOR ATUAL do contrato = valorInicial + Σ(valor × SINAL_VALOR).
 *
 * Nunca uma coluna. Um `valorAtual` cacheado seria uma segunda verdade — e o dia
 * em que um estorno esquecesse de atualizá-la, o ente empenharia contra um saldo
 * que não existe.
 */
export function valorAtualizado(
  valorInicial: Money,
  movimentos: readonly MovimentoDoContrato[]
): Money {
  let total = valorInicial;
  for (const m of movimentos) {
    const sinal = SINAL_VALOR_CONTRATUAL[m.tipo];
    if (sinal === 0) continue; // movimento de PRAZO: neutro aqui
    if (m.valor === null) {
      throw new Error(
        `Movimento ${m.tipo} sem valor: o tipo mexe em VALOR e a coluna está ` +
          `nula. O CHECK do banco impede isso — se chegou aqui, alguém o removeu.`
      );
    }
    total = toMoney(sinal === 1 ? total.plus(m.valor) : total.minus(m.valor));
  }
  return total;
}

/**
 * O FIM DA VIGÊNCIA = vigenciaFimInicial + Σ(dias × SINAL_PRAZO) dias.
 *
 * `vigenciaFimInicial` é o ÚLTIMO INSTANTE da vigência original, e a soma é em
 * dias UTC (86.400.000 ms) — sem horário de verão para deslocar a data.
 */
export function vigenciaFim(
  vigenciaFimInicial: Date,
  movimentos: readonly MovimentoDoContrato[]
): Date {
  let dias = 0;
  for (const m of movimentos) {
    const sinal = SINAL_PRAZO_CONTRATUAL[m.tipo];
    if (sinal === 0) continue; // movimento de VALOR: neutro aqui
    if (m.dias === null) {
      throw new Error(
        `Movimento ${m.tipo} sem dias: o tipo mexe em PRAZO e a coluna está ` +
          `nula. O CHECK do banco impede isso — se chegou aqui, alguém o removeu.`
      );
    }
    dias += sinal * m.dias;
  }
  return new Date(vigenciaFimInicial.getTime() + dias * MS_POR_DIA);
}

/**
 * VIGENTE EM: início <= data <= fim derivado.
 *
 * ⚠️ AS DUAS BORDAS SÃO INCLUSIVAS, e isso é deliberado. `vigenciaFimInicial`
 * guarda o ÚLTIMO INSTANTE da vigência (23:59:59 do último dia, não 00:00:00
 * dele): no último dia o contrato ainda vale, e uma entrega feita nele é
 * legítima. Uma borda exclusiva no fim mataria o contrato no primeiro segundo do
 * último dia — e o fornecedor entregaria fora da vigência sem saber.
 */
export function estaVigente(
  vigenciaInicio: Date,
  fim: Date,
  data: Date
): boolean {
  return vigenciaInicio <= data && data <= fim;
}

/**
 * QUANTOS DIAS FALTAM PARA O FIM DA VIGÊNCIA — negativo depois de vencido.
 *
 * ⚠️ ELE PARTE DO `fim` JÁ DERIVADO, e não recalcula nada: quem sabe somar os aditivos é o
 * `vigenciaFim` acima, e uma segunda soma aqui seria a segunda verdade sobre a mesma data.
 *
 * ⚠️ A CONTA É EM DIAS DE CALENDÁRIO, não em milissegundos arredondados. `vigenciaFimInicial`
 * guarda o ÚLTIMO INSTANTE do último dia (23:59:59), então `fim - hoje` em ms daria 0,99 dia para
 * um contrato que vence AMANHÃ — e `Math.floor` o transformaria em "vence hoje". Normalizar as
 * duas pontas para o início do dia UTC é o que faz "faltam 90 dias" significar 90 dias.
 */
export function diasAteVencimento(fim: Date, hoje: Date): number {
  const diaUtc = (d: Date): number =>
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((diaUtc(fim) - diaUtc(hoje)) / MS_POR_DIA);
}

/**
 * O CONTRATO ESTÁ NA JANELA DE ALERTA DE VENCIMENTO? (TR req. 7)
 *
 * ⚠️ A JANELA É `[0, diasAlerta]` — e o limite inferior é ZERO, não menos infinito. Um contrato JÁ
 * VENCIDO não está "a vencer": ele é outro estado, e o req. 9 pede as duas listas SEPARADAS
 * (vencidos × a vencer). Misturá-los faria o gestor ver, na fila de "renovar", contratos cujo
 * prazo de renovação já passou — e a providência para esses é outra.
 *
 * `diasAlerta` vem de `Contrato.diasAlertaVencimento` (NOT NULL, default 90): o req. 7 exige que o
 * gestor possa configurá-lo, então ele é dado do contrato, nunca constante deste arquivo.
 */
export function estaEmAlertaDeVencimento(
  fim: Date,
  hoje: Date,
  diasAlerta: number
): boolean {
  const faltam = diasAteVencimento(fim, hoje);
  return faltam >= 0 && faltam <= diasAlerta;
}

/** JÁ VENCIDO? O par do `estaEmAlertaDeVencimento` — o req. 9 consulta os dois separadamente. */
export function estaVencido(fim: Date, hoje: Date): boolean {
  return diasAteVencimento(fim, hoje) < 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// ENTRADA (Zod) — o XOR barrado ANTES do banco
// ═══════════════════════════════════════════════════════════════════════════

const zModalidade = z.enum(
  Object.keys(MODALIDADES) as [ModalidadeLicitacao, ...ModalidadeLicitacao[]]
);
const zValorPositivo = zMoney.refine((v) => v.greaterThan(0), {
  message: "Valor deve ser > 0",
});
const zMotivo = z
  .string()
  .trim()
  .min(10, "O motivo precisa de ao menos 10 caracteres");

export const zCadastrarProcessoInput = z
  .object({
    numeroProcesso: z.string().trim().min(1),
    modalidade: zModalidade,
    objeto: z.string().trim().min(10, "O objeto precisa descrever o que se contrata"),
    valorLicitado: zValorPositivo,
    /** Ausente = processo NÃO homologado. A situação é derivada disto. */
    dataHomologacao: z.coerce.date().optional(),
    /** Art. 75 — obrigatória SE e SÓ SE a modalidade é DISPENSA. */
    hipoteseDispensa: z
      .enum(Object.keys(LIMITE_DA_HIPOTESE) as [HipoteseDispensa, ...HipoteseDispensa[]])
      .optional(),
    criadoPor: z.string().min(1),
  })
  .superRefine((v, ctx) => {
    const ehDispensa = v.modalidade === "DISPENSA";
    if (ehDispensa && v.hipoteseDispensa === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["hipoteseDispensa"],
        message:
          "DISPENSA sem hipótese do art. 75: uma contratação direta sem base legal " +
          "é a primeira coisa que o TCE procura. Diga por qual inciso ela se " +
          "dispensa (por valor, ou OUTRAS).",
      });
    }
    if (!ehDispensa && v.hipoteseDispensa !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["hipoteseDispensa"],
        message:
          `Hipótese de dispensa numa ${v.modalidade}: só a DISPENSA tem hipótese do ` +
          `art. 75. Aqui ela faria o relatório 5.103 classificar um certame comum ` +
          `como contratação direta.`,
      });
    }
  });
export type CadastrarProcessoInput = z.input<typeof zCadastrarProcessoInput>;

/**
 * CADASTRO DE LIMITE — append-only (decreto novo = linha nova).
 *
 * O controle interno NUNCA pode ser maior que o oficial: seria o ente se autorizando
 * a dispensar o que a lei manda licitar. Menor, pode — é autolimitação, e é legítima.
 */
export const zCadastrarLimiteInput = z
  .object({
    vigenciaInicio: z.coerce.date(),
    fonteLegal: z.string().trim().min(10, "Diga de qual norma o número saiu"),
    limiteObrasEngenharia: zValorPositivo,
    limiteComprasServicos: zValorPositivo,
    limiteControleInternoObras: zValorPositivo.optional(),
    limiteControleInternoCompras: zValorPositivo.optional(),
    criadoPor: z.string().min(1),
  })
  .superRefine((v, ctx) => {
    if (
      v.limiteControleInternoObras !== undefined &&
      v.limiteControleInternoObras.greaterThan(v.limiteObrasEngenharia)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["limiteControleInternoObras"],
        message:
          `Controle interno (${v.limiteControleInternoObras.toFixed(2)}) ACIMA do ` +
          `limite legal (${v.limiteObrasEngenharia.toFixed(2)}): o ente pode se ` +
          `autolimitar abaixo da lei, nunca acima dela.`,
      });
    }
    if (
      v.limiteControleInternoCompras !== undefined &&
      v.limiteControleInternoCompras.greaterThan(v.limiteComprasServicos)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["limiteControleInternoCompras"],
        message:
          `Controle interno (${v.limiteControleInternoCompras.toFixed(2)}) ACIMA do ` +
          `limite legal (${v.limiteComprasServicos.toFixed(2)}): o ente pode se ` +
          `autolimitar abaixo da lei, nunca acima dela.`,
      });
    }
  });
export type CadastrarLimiteInput = z.input<typeof zCadastrarLimiteInput>;

/** O EVENTO de homologação — o fato que o append-only exige (ver o schema). */
export const zHomologarProcessoInput = z.object({
  processoId: z.string().min(1),
  /** A data do ATO, não a da digitação. */
  data: z.coerce.date(),
  criadoPor: z.string().min(1),
});
export type HomologarProcessoInput = z.input<typeof zHomologarProcessoInput>;

export const zCadastrarContratoInput = z.object({
  numeroContrato: z.string().trim().min(1),
  processoId: z.string().min(1),
  contratadoDocumento: z.string().trim().min(11, "CPF (11) ou CNPJ (14), sem máscara"),
  contratadoNome: z.string().trim().min(3),
  valorInicial: zValorPositivo,
  vigenciaInicio: z.coerce.date(),
  vigenciaFimInicial: z.coerce.date(),
  categoriaOrdemCronologica: z.enum([
    "FORNECIMENTO_BENS",
    "LOCACAO",
    "PRESTACAO_SERVICOS",
    "REALIZACAO_OBRAS",
  ]),
  criadoPor: z.string().min(1),
});
export type CadastrarContratoInput = z.input<typeof zCadastrarContratoInput>;

/**
 * O XOR, EM ZOD.
 *
 * Um aditivo de VALOR traz `valor` e não traz `dias`; um de PRAZO, o contrário.
 * `superRefine` porque a regra depende do `tipo` — e é o `tipo` que diz qual
 * dimensão o movimento fala.
 */
export const zRegistrarAditivoInput = z
  .object({
    contratoId: z.string().min(1),
    tipo: z.enum(["ACRESCIMO_VALOR", "SUPRESSAO_VALOR", "PRORROGACAO_PRAZO"]),
    valor: zValorPositivo.optional(),
    dias: z.number().int().positive().optional(),
    data: z.coerce.date(),
    numeroAditivo: z.string().trim().min(1),
    motivo: zMotivo,
    criadoPor: z.string().min(1),
  })
  .superRefine((v, ctx) => {
    const ehDeValor = SINAL_VALOR_CONTRATUAL[v.tipo] !== 0;

    if (ehDeValor && v.valor === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["valor"],
        message: `${v.tipo} mexe em VALOR — informe \`valor\`.`,
      });
    }
    if (ehDeValor && v.dias !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["dias"],
        message:
          `${v.tipo} mexe em VALOR, não em prazo — \`dias\` não pode vir junto. ` +
          `Um movimento fala de UMA dimensão; para mexer nas duas, são dois ` +
          `aditivos.`,
      });
    }
    if (!ehDeValor && v.dias === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["dias"],
        message: `${v.tipo} mexe em PRAZO — informe \`dias\`.`,
      });
    }
    if (!ehDeValor && v.valor !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["valor"],
        message:
          `${v.tipo} mexe em PRAZO, não em valor — \`valor\` não pode vir junto.`,
      });
    }
  });
export type RegistrarAditivoInput = z.input<typeof zRegistrarAditivoInput>;

export const zEstornarMovimentoContratualInput = z.object({
  movimentoId: z.string().min(1),
  data: z.coerce.date(),
  motivo: zMotivo,
  criadoPor: z.string().min(1),
});
export type EstornarMovimentoContratualInput = z.input<
  typeof zEstornarMovimentoContratualInput
>;
