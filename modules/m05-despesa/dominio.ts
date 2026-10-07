import { diaCivil } from "../../packages/datas/index.js";
import { documentoTemDigitoValido, normalizarDocumento } from "../../packages/documento/index.js";
import { z } from "zod";
import { toMoney, zMoney, type Money } from "../../packages/contracts/index.js";
import {
  validarLancamento,
  type Partida,
  type Subsistema,
  type TipoPartida,
} from "../../packages/ledger/index.js";
// M05 -> M06 (nunca o inverso).
import { zJustificativaQuebraOrdemInput } from "../m06-ordem-cronologica/dominio.js";

/**
 * DOMAIN do M05 — SEM I/O.
 *
 * Aqui mora a aritmética do saldo. Ela é PURA de propósito: dado o conjunto de
 * movimentos, os saldos são uma FUNÇÃO deles. A coluna no banco é só cache, e a
 * reconciliação existe justamente para provar que o cache = f(movimentos).
 */

export type TipoMovimentoDotacao =
  | "DOTACAO_INICIAL"
  | "CREDITO_ADICIONAL"
  | "ANULACAO_CREDITO"
  | "RESERVA"
  | "RESERVA_LIBERADA"
  | "EMPENHO"
  | "EMPENHO_ANULADO"
  | "REALOCACAO_ACRESCIMO"
  | "REALOCACAO_REDUCAO"
  | "BLOQUEIO_DE_PREVIA"
  | "BLOQUEIO_DE_PREVIA_LIBERADO";

export const TIPOS_MOVIMENTO: readonly TipoMovimentoDotacao[] = [
  "DOTACAO_INICIAL",
  "CREDITO_ADICIONAL",
  "ANULACAO_CREDITO",
  "RESERVA",
  "RESERVA_LIBERADA",
  "EMPENHO",
  "EMPENHO_ANULADO",
  "REALOCACAO_ACRESCIMO",
  "REALOCACAO_REDUCAO",
  "BLOQUEIO_DE_PREVIA",
  "BLOQUEIO_DE_PREVIA_LIBERADO",
] as const;

/**
 * Em qual saldo cada tipo entra, e com que sinal. O `valor` do movimento é
 * SEMPRE positivo — é este mapa que dá o sinal. Assim não existe movimento com
 * valor negativo escondendo uma anulação.
 */
const SINAIS: Record<
  TipoMovimentoDotacao,
  { readonly saldo: "autorizado" | "reservado" | "empenhado"; readonly sinal: 1 | -1 }
> = {
  DOTACAO_INICIAL: { saldo: "autorizado", sinal: 1 },
  CREDITO_ADICIONAL: { saldo: "autorizado", sinal: 1 },
  ANULACAO_CREDITO: { saldo: "autorizado", sinal: -1 },
  RESERVA: { saldo: "reservado", sinal: 1 },
  RESERVA_LIBERADA: { saldo: "reservado", sinal: -1 },
  EMPENHO: { saldo: "empenhado", sinal: 1 },
  EMPENHO_ANULADO: { saldo: "empenhado", sinal: -1 },
  // V21 — a realocação por lei específica (CF art. 167, VI) mexe no AUTORIZADO, como o crédito:
  // a ficha que recebe passa a poder empenhar mais, a que cede, menos. Entra aqui e em nenhum outro
  // lugar da aritmética — o QDD, o saldo e a reconciliação leem esta tabela.
  REALOCACAO_ACRESCIMO: { saldo: "autorizado", sinal: 1 },
  REALOCACAO_REDUCAO: { saldo: "autorizado", sinal: -1 },
  // V36 — o bloqueio da anulação de uma prévia de alteração orçamentária torna o valor INDISPONÍVEL como a reserva (no
  // PCASP os dois moram sob CRÉDITO INDISPONÍVEL), e por isso soma no mesmo saldo; a conta é a do roteiro próprio.
  BLOQUEIO_DE_PREVIA: { saldo: "reservado", sinal: 1 },
  BLOQUEIO_DE_PREVIA_LIBERADO: { saldo: "reservado", sinal: -1 },
};

/** Total por tipo, como sai de um GROUP BY no banco. */
export type TotaisPorTipo = Readonly<Partial<Record<TipoMovimentoDotacao, Money>>>;

/**
 * ═══ O CORTE TEMPORAL DO SALDO — E POR QUE ELE É OBRIGATÓRIO ═══
 *
 * `MovimentoDotacao` tem DOIS eixos de tempo, e eles respondem perguntas diferentes
 * (ver `docs/adr/ADR-competencia-no-movimento-de-dotacao.md`):
 *
 *   · `competencia` — a data do EFEITO LEGAL do ato. "Qual era a dotação disponível
 *     em 30/06?" O decreto de 20/06 digitado em 15/07 conta para junho.
 *   · `criadoEm`    — o instante da GRAVAÇÃO. "O que o sistema RESPONDIA em 30/06?"
 *     O mesmo decreto não conta para junho, porque em junho ninguém o tinha digitado.
 *
 * ⚠️ NENHUM DOS DOIS É O PADRÃO, E É DE PROPÓSITO. Um padrão implícito é como o
 * defeito nasceu: `saldosDaFicha(fichaId, deps)` respondia SEM corte, e quem
 * perguntasse "saldo em 30/06" receberia o saldo de hoje sem nada avisar. Quem
 * consulta saldo agora DECLARA o eixo — e um eixo declarado errado é um erro que
 * alguém pode ler no código.
 */
export type CorteTemporal =
  /** Todos os movimentos. O saldo de AGORA — o que a tela do dia mostra. */
  | { readonly eixo: "CORRENTE" }
  /** Movimentos com competência <= `ate`. Posição do orçamento, cotas, demonstrativo. */
  | { readonly eixo: "COMPETENCIA"; readonly ate: Date }
  /** Movimentos gravados <= `ate`. Reproduzir demonstrativo já publicado, auditoria. */
  | { readonly eixo: "REGISTRO"; readonly ate: Date };

/** Só para mensagem de erro e histórico — nunca para decidir comportamento. */
export function descreverCorte(c: CorteTemporal): string {
  if (c.eixo === "CORRENTE") return "saldo corrente (todos os movimentos)";
  const dia = diaCivil(c.ate);
  return c.eixo === "COMPETENCIA"
    ? `saldo por competência até ${dia}`
    : `saldo como registrado até ${dia}`;
}

export interface SaldosFicha {
  readonly autorizado: Money;
  readonly reservado: Money;
  readonly empenhado: Money;
  /** autorizado − reservado − empenhado */
  readonly disponivel: Money;
}

/**
 * Os saldos são uma FUNÇÃO dos movimentos. Pura, sem banco, testável sozinha —
 * e é exatamente esta função que a reconciliação usa para conferir o cache.
 */
export function calcularSaldos(totais: TotaisPorTipo): SaldosFicha {
  const zero = toMoney("0.00");
  const acc = { autorizado: zero, reservado: zero, empenhado: zero };

  for (const tipo of TIPOS_MOVIMENTO) {
    const total = totais[tipo];
    if (total === undefined) continue;
    const { saldo, sinal } = SINAIS[tipo];
    acc[saldo] =
      sinal === 1 ? toMoney(acc[saldo].plus(total)) : toMoney(acc[saldo].minus(total));
  }

  return {
    autorizado: acc.autorizado,
    reservado: acc.reservado,
    empenhado: acc.empenhado,
    disponivel: toMoney(
      acc.autorizado.minus(acc.reservado).minus(acc.empenhado)
    ),
  };
}

// ----------------------------------------------------------------------------
// STATUS DO EMPENHO — DERIVADO, não coluna.
//
// Um `status` gravado no empenho não sobrevive ao append-only: para andar de
// EMPENHADO a LIQUIDADO seria preciso dar UPDATE nele. Então não gravamos — o
// estado é uma função dos SUMs.
// ----------------------------------------------------------------------------

export type StatusEmpenho =
  | "EMPENHADO"
  | "PARCIAL_LIQUIDADO"
  | "LIQUIDADO"
  | "PARCIAL_PAGO"
  | "PAGO"
  | "ANULADO";

export interface TotaisEmpenho {
  /** Valor do empenho. */
  readonly empenhado: Money;
  readonly liquidado: Money;
  readonly pago: Money;
  readonly anulado: boolean;
}

export function statusDoEmpenho(t: TotaisEmpenho): StatusEmpenho {
  if (t.anulado) return "ANULADO";

  const totalmenteLiquidado = t.liquidado.greaterThanOrEqualTo(t.empenhado);
  const totalmentePago =
    t.pago.greaterThanOrEqualTo(t.empenhado) && t.empenhado.greaterThan(0);

  if (totalmentePago) return "PAGO";
  if (t.pago.greaterThan(0)) return "PARCIAL_PAGO";
  if (totalmenteLiquidado) return "LIQUIDADO";
  if (t.liquidado.greaterThan(0)) return "PARCIAL_LIQUIDADO";
  return "EMPENHADO";
}

// ----------------------------------------------------------------------------
// Roteiro contábil do empenho — sem conta mágica (mesmo padrão do M04).
// ----------------------------------------------------------------------------

export interface PernaRoteiro {
  readonly conta: string;
  readonly tipo: TipoPartida;
  readonly subsistema: Subsistema;
}
export type RoteiroContabil = readonly PernaRoteiro[];

/**
 * ORÇAMENTÁRIO: D crédito disponível / C crédito empenhado.
 * O empenho não gera fato patrimonial (não há despesa incorrida ainda) — quem
 * gera é a LIQUIDAÇÃO. Por isso o roteiro é só orçamentário.
 */
export interface ContasEmpenho {
  readonly creditoDisponivel: string;
  readonly creditoEmpenhado: string;
}

export function roteiroEmpenho(c: ContasEmpenho): RoteiroContabil {
  return [
    { conta: c.creditoDisponivel, tipo: "DEBITO", subsistema: "ORCAMENTARIO" },
    { conta: c.creditoEmpenhado, tipo: "CREDITO", subsistema: "ORCAMENTARIO" },
  ];
}

/**
 * LIQUIDAÇÃO — aqui, sim, nasce o fato patrimonial: a despesa foi incorrida e a
 * obrigação com o fornecedor existe.
 *
 * PATRIMONIAL:  D variação patrimonial diminutiva / C obrigação a pagar
 * ORÇAMENTÁRIO: D crédito empenhado                / C crédito liquidado
 */
export interface ContasLiquidacao {
  readonly variacaoDiminutiva: string;
  readonly obrigacaoAPagar: string;
  readonly creditoEmpenhado: string;
  readonly creditoLiquidado: string;
}

export function roteiroLiquidacao(c: ContasLiquidacao): RoteiroContabil {
  return [
    { conta: c.variacaoDiminutiva, tipo: "DEBITO", subsistema: "PATRIMONIAL" },
    { conta: c.obrigacaoAPagar, tipo: "CREDITO", subsistema: "PATRIMONIAL" },
    { conta: c.creditoEmpenhado, tipo: "DEBITO", subsistema: "ORCAMENTARIO" },
    { conta: c.creditoLiquidado, tipo: "CREDITO", subsistema: "ORCAMENTARIO" },
  ];
}

/**
 * PAGAMENTO — a obrigação é extinta e o dinheiro sai do caixa.
 *
 * PATRIMONIAL:  D obrigação a pagar  / C disponibilidade
 * ORÇAMENTÁRIO: D crédito liquidado  / C crédito pago
 */
export interface ContasPagamento {
  readonly obrigacaoAPagar: string;
  readonly disponibilidade: string;
  readonly creditoLiquidado: string;
  readonly creditoPago: string;
}

export function roteiroPagamento(c: ContasPagamento): RoteiroContabil {
  return [
    { conta: c.obrigacaoAPagar, tipo: "DEBITO", subsistema: "PATRIMONIAL" },
    { conta: c.disponibilidade, tipo: "CREDITO", subsistema: "PATRIMONIAL" },
    { conta: c.creditoLiquidado, tipo: "DEBITO", subsistema: "ORCAMENTARIO" },
    { conta: c.creditoPago, tipo: "CREDITO", subsistema: "ORCAMENTARIO" },
  ];
}

/** Aplica o valor a cada perna e submete ao motor puro (fail-closed). */
export function comporPartidas(
  valor: Money,
  roteiro: RoteiroContabil
): readonly Partida[] {
  return validarLancamento(
    roteiro.map((p) => ({
      conta: p.conta,
      tipo: p.tipo,
      subsistema: p.subsistema,
      valor,
    }))
  );
}

// ----------------------------------------------------------------------------
// Entrada
// ----------------------------------------------------------------------------

const zValorPositivo = zMoney.refine((v) => v.greaterThan(0), {
  message: "Valor deve ser > 0",
});

export const zTipoEmpenho = z.enum(["ORDINARIO", "GLOBAL", "ESTIMATIVO"]);
export type TipoEmpenho = z.infer<typeof zTipoEmpenho>;

/**
 * M06 — Lei 14.133/2021, art. 141: a ordem cronológica é por FONTE, subdividida
 * nestas 4 categorias de contrato. OBRIGATÓRIO no empenho, sem default: a
 * liquidação herda a categoria dele, e é ela que define em qual fila o pagamento
 * entra. Um default silencioso misturaria a fila de obras com a de bens.
 */
export const zCategoriaOrdemCronologica = z.enum([
  "FORNECIMENTO_BENS",
  "LOCACAO",
  "PRESTACAO_SERVICOS",
  "REALIZACAO_OBRAS",
]);
export type CategoriaOrdemCronologica = z.infer<
  typeof zCategoriaOrdemCronologica
>;

export const zReservarDotacaoInput = z.object({
  fichaId: z.string().min(1),
  valor: zValorPositivo,
  historico: z.string().min(1),
  /**
   * M11 (TR 4.41/4.42): a reserva pode nascer VINCULADA a um processo
   * licitatório — e aí o empenho que a consome TEM de informar um contrato desse
   * mesmo processo.
   *
   * Substitui a antiga `licitacaoId`: uma STRING sem FK, que o serviço ESCREVIA e
   * ninguém NUNCA leu. Uma coluna que só se escreve não é um vínculo — é um
   * comentário caro. Foi DROPADA (ver a migration do DROP).
   */
  processoId: z.string().min(1).optional(),
  criadoPor: z.string().min(1),
});

export const zEmpenharInput = z
  .object({
    fichaId: z.string().min(1),
    /** Se veio de uma reserva, o empenho a consome (gera RESERVA_LIBERADA). */
    reservaId: z.string().min(1).optional(),
    /** Opcional: o Subelemento (M02) ainda não tem seed real. */
    subelementoId: z.string().min(1).optional(),
    /**
     * M11 — o contrato que esta despesa executa (TR 5.6/5.101/5.102/5.112).
     * Ausente = despesa sem contrato (diária, folha, sentença): caminho de sempre.
     */
    contratoId: z.string().min(1).optional(),
    /**
     * V5 — a ordem de compra da qual este empenho nasce. Ausente = empenho sem ordem
     * (folha, diária, contrato direto). O guard vive no adapter (precisa travar a
     * ordem e somar o empenhado contra ela).
     */
    ordemDeCompraId: z.string().min(1).optional(),
    /**
     * M11/M10 (TR 4.49/5.15) — a classe de bens que este empenho vai adquirir.
     * OBRIGATÓRIA quando o empenho é de CAPITAL (grupos 4/5) E tem contrato; o
     * guard vive no adapter (precisa ler a natureza da ficha).
     */
    classeDeBensId: z.string().min(1).optional(),
    /**
     * M11 (TR 4.50) — a OBRA que este empenho executa.
     * OBRIGATÓRIA quando o elemento é de obra (51); o guard vive no adapter (precisa ler
     * a natureza da ficha). PERMITIDA fora dele — o vínculo voluntário não é erro.
     */
    obraId: z.string().min(1).optional(),
    /**
     * M10 (TR 4.48) — a DÍVIDA que este empenho amortiza. OBRIGATÓRIA no grupo 6 e
     * PROIBIDA fora dele; o guard vive no adapter (precisa ler a natureza da ficha).
     */
    dividaId: z.string().min(1).optional(),
    /**
     * M28 (V22) — o CONVÊNIO que este empenho executa. VOLUNTÁRIO (ver o schema); o adapter confere
     * que ele existe, e a anulação o COPIA, como copia o contrato e a obra.
     */
    convenioId: z.string().min(1).optional(),
    /** V22 — a CAMPANHA PUBLICITÁRIA que o empenho custeia. VOLUNTÁRIO; o adapter confere que existe. */
    campanhaPublicitariaId: z.string().min(1).optional(),
    /** V36 (TR 5.10.1.89) — a PARCERIA PÚBLICO-PRIVADA que o empenho executa. VOLUNTÁRIO; o adapter confere que existe. */
    contratoPppId: z.string().min(1).optional(),
    /**
     * V32 — o PRECATÓRIO que este empenho paga. VOLUNTÁRIO; o adapter confere que existe, que está
     * inscrito e que a ficha é de sentenças judiciais (elemento 91). É ele que faz o `pagar` baixar o
     * precatório e conferir a ordem constitucional — antes só um teste o gravava, direto no banco.
     */
    precatorioId: z.string().min(1).optional(),
    /**
     * V22 — a SOLICITAÇÃO AUTORIZADA da qual o empenho é emitido. O adapter confere, DENTRO da
     * transação e sob trava, que ela está autorizada, não foi empenhada e casa com o empenho.
     */
    solicitacaoDeEmpenhoId: z.string().min(1).optional(),
    /** V22 — a chave da reserva do numerador, quando o NÚMERO foi reservado pelo sistema (folha, encargos). */
    chaveDoNumero: z.string().min(1).optional(),
    numero: z.string().min(1),
    tipo: zTipoEmpenho,
    valor: zValorPositivo,
    data: z.coerce.date(),
    // V4 (§7): normalizado pelo pacote (sem máscara, maiúsculas — o CNPJ pode ser alfanumérico).
    // ⚠️ V22 — E O DÍGITO VERIFICADOR É CONFERIDO AQUI, no empenho NOVO. Antes a regra dizia que o DV
    // não se exigia porque o empenho antigo com documento quebrado é dado legado que o portal (M13)
    // omite com motivo. O legado continua existindo e continua omitido — mas ele chega por importação
    // ou migração, não por este caso de uso; um empenho emitido hoje com dígito errado vira credor que
    // ninguém identifica, no SAGRES, no MANAD e no portal. Esta entrada só serve à emissão.
    credorCpfCnpj: z
      .string()
      .transform(normalizarDocumento)
      .pipe(z.string().min(11, "CPF/CNPJ inválido"))
      .refine(documentoTemDigitoValido, "CPF/CNPJ do credor com dígito verificador inválido. Confira o documento."),
    historico: z.string().min(1),
    /**
     * M06 (art. 141): define em qual fila o pagamento entra.
     *
     * ⚠️ CONTINUA OBRIGATÓRIA SEM CONTRATO. Só é opcional QUANDO HÁ CONTRATO — e
     * aí ela é HERDADA dele. Torná-la opcional para todos traria de volta
     * exatamente o que o comentário do schema proíbe: um empenho sem categoria
     * escolhida, caindo em silêncio numa fila qualquer.
     */
    categoriaOrdemCronologica: zCategoriaOrdemCronologica.optional(),
    criadoPor: z.string().min(1),
  })
  .superRefine((v, ctx) => {
    if (v.contratoId === undefined && v.categoriaOrdemCronologica === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["categoriaOrdemCronologica"],
        message:
          "Empenho SEM contrato precisa da categoria da ordem cronológica (art. " +
          "141): não há de quem herdá-la, e um default a faria virar " +
          "FORNECIMENTO_BENS em silêncio — a fila de obras se misturaria com a de " +
          "bens sem ninguém perceber.",
      });
    }
  });

export const zAnularEmpenhoInput = z.object({
  empenhoId: z.string().min(1),
  numero: z.string().min(1),
  data: z.coerce.date(),
  historico: z.string().min(1),
  criadoPor: z.string().min(1),
});

export const zLiberarReservaInput = z.object({
  reservaId: z.string().min(1),
  historico: z.string().min(1),
  criadoPor: z.string().min(1),
});

export const zLiquidarInput = z.object({
  empenhoId: z.string().min(1),
  numero: z.string().min(1),
  valor: zValorPositivo,
  data: z.coerce.date(),
  responsavelAtesto: z.string().min(1, "Responsável pelo atesto é obrigatório"),
  notaFiscalChave: z.string().min(1).optional(),
  notaFiscalNum: z.string().min(1).optional(),
  notaFiscalSerie: z.string().min(1).optional(),
  notaFiscalData: z.coerce.date().optional(),
  notaFiscalValor: zValorPositivo.optional(),
  documentoFiscalId: z.string().min(1).optional(),
  historico: z.string().min(1),
  criadoPor: z.string().min(1),
  /**
   * M11 (ENT03b) — A MEDIÇÃO que autoriza esta liquidação.
   *
   * ⚠️ OPCIONAL AQUI E OBRIGATÓRIA NO GUARD quando o empenho tem OBRA. Torná-la obrigatória
   * no Zod quebraria toda liquidação de custeio, material e serviço — que não têm medição
   * nenhuma. Quem sabe se ela é exigível é o EMPENHO, e essa leitura é do adapter, dentro da
   * transação. Ver `exigirMedicaoAprovadaDaObra`.
   */
  medicaoId: z.string().min(1).optional(),
  /** V36 (TR 5.10.1.7) — o subempenho que esta liquidação consome. Quem confere é o adapter, sob a trava da ficha. */
  subempenhoId: z.string().min(1).optional(),
  /** V36 (TR 5.10.1.30) — a despesa foi realizada sem empenho prévio; o empenho a regulariza. Só informação. */
  despesaSemEmpenhoPrevio: z.boolean().optional(),
  /**
   * M10 (ENT06 item 2) — AS ENTRADAS NO ALMOXARIFADO, quando a despesa é de material.
   *
   * ⚠️ LISTA, porque uma nota abastece VÁRIAS classes (papel e toner são contas diferentes),
   * e é a soma delas que tem de fechar com o valor liquidado. Com chamadas separadas — uma
   * por classe, cada uma na sua transação — a soma exata não era exigível, e o `MODULO.md`
   * do M10 registrava isso como furo conhecido.
   *
   * ⚠️ OPCIONAL AQUI E OBRIGATÓRIA NO GUARD quando o elemento é de material, como a
   * `medicaoId`: quem sabe se é exigível é o empenho, e a leitura é do adapter, dentro da
   * transação.
   */
  entradasDeMaterial: z
    .array(
      z.object({
        classeDeMaterialId: z.string().min(1),
        valor: zValorPositivo,
        /** O eixo FÍSICO — opcional: o contábil já explica a conta de estoque. */
        fisica: z
          .object({
            materialId: z.string().min(1),
            depositoId: z.string().min(1),
            quantidade: zValorPositivo,
            valorUnitario: zValorPositivo,
            unidadeDeMedidaId: z.string().min(1).optional(),
            loteIdentificacao: z.string().trim().max(60).optional(),
            loteValidade: z.coerce.date().optional(),
            /** V4 (§6): o recebimento existente que esta entrada consome. */
            recebimentoDeItemId: z.string().min(1).optional(),
          })
          .optional(),
      })
    )
    .min(1)
    .optional(),
  /**
   * V7 M2 U3 — AS PARCELAS RECEBIDAS DO CONTRATO que esta liquidação consome (recebimento definitivo e valor).
   *
   * ⚠️ OPCIONAL, como a `medicaoId` e as entradas de material: a liquidação de custeio, de folha e de encargos não tem
   * parcela de contrato. Quando vem, o adapter confere as parcelas DENTRO da transação, sob o trinco do contrato, antes
   * de gravar, e grava as alocações no mesmo commit (`modules/m11-licitacoes/parcelas-da-liquidacao.ts`).
   */
  parcelasDoContrato: z
    .array(z.object({ recebimentoDefinitivoId: z.string().min(1), valor: zValorPositivo }))
    .min(1)
    .optional(),
});

export const zPagarInput = z.object({
  liquidacaoId: z.string().min(1),
  numero: z.string().min(1),
  valor: zValorPositivo,
  data: z.coerce.date(),
  /** Código da ContaBancaria de onde sai o dinheiro. */
  contaBancaria: z.string().min(1),
  /** TR 5.23: tem de casar com a fonte da conta bancária. */
  fonteId: z.string().min(1),
  historico: z.string().min(1),
  criadoPor: z.string().min(1),
  /**
   * M06 (art. 141, §1º) — SÓ é necessária para pagar fora da ordem cronológica.
   * Pagar a cabeça da fila não exige nada. Pagar outra sem isto = rejeitado.
   */
  justificativaQuebraOrdem: zJustificativaQuebraOrdemInput.optional(),
  /**
   * T07 — a ORDEM DE PAGAMENTO que autoriza este desembolso.
   *
   * ⚠️ OPCIONAL, e a opcionalidade é uma decisão declarada. Torná-la obrigatória
   * quebraria todo pagamento que já existe e toda fixture — e, pior, obrigaria a
   * inventar uma autorização retroativa para os pagamentos anteriores à ordem existir.
   * Um ente que queira exigi-la o faz negando a ação `PAGAR` a quem não tem ordem; o
   * caminho sem ordem continua sendo o de sempre, partida por partida.
   */
  ordemDePagamentoId: z.string().min(1).optional(),
  /**
   * M29 (ENT03b · CF art. 100) — a justificativa da quebra da ordem CONSTITUCIONAL.
   *
   * ⚠️ SEPARADA da do art. 141, e o motivo está em `PagarParams`: aquela exige uma hipótese
   * de um rol fechado da Lei 14.133, e nenhuma das cinco cobre os casos do art. 100.
   * Sem ela, pagar um precatório na frente de quem tem preferência é rejeitado (fail-closed).
   */
  justificativaOrdemConstitucional: z.string().trim().min(20).optional(),
  /**
   * V36 (TR 5.10.2.42) — o NÚMERO DO CHEQUE, quando o pagamento sai por cheque. O cheque nasce na mesma transação,
   * com o valor de face = líquido do pagamento (bruto − retenções), e o número é único na conta bancária.
   */
  numeroDoCheque: z.string().trim().min(1).max(15).optional(),
});

export const zAnularLiquidacaoInput = z.object({
  liquidacaoId: z.string().min(1),
  numero: z.string().min(1),
  data: z.coerce.date(),
  historico: z.string().min(1),
  criadoPor: z.string().min(1),
});

export const zAnularPagamentoInput = z.object({
  pagamentoId: z.string().min(1),
  numero: z.string().min(1),
  data: z.coerce.date(),
  historico: z.string().min(1),
  criadoPor: z.string().min(1),
});

export type LiquidarInput = z.input<typeof zLiquidarInput>;
export type PagarInput = z.input<typeof zPagarInput>;
export type AnularLiquidacaoInput = z.input<typeof zAnularLiquidacaoInput>;
export type AnularPagamentoInput = z.input<typeof zAnularPagamentoInput>;

export type ReservarDotacaoInput = z.input<typeof zReservarDotacaoInput>;
export type EmpenharInput = z.input<typeof zEmpenharInput>;
export type AnularEmpenhoInput = z.input<typeof zAnularEmpenhoInput>;
export type LiberarReservaInput = z.input<typeof zLiberarReservaInput>;

/** Compõe o empenho: forma (Zod) + partidas balanceadas (motor puro). Sem I/O. */
export function comporEmpenho(
  input: EmpenharInput,
  roteiro: RoteiroContabil
): {
  readonly dados: z.output<typeof zEmpenharInput>;
  readonly partidas: readonly Partida[];
} {
  const dados = zEmpenharInput.parse(input);
  return { dados, partidas: comporPartidas(dados.valor, roteiro) };
}

/**
 * V21 — O MOTIVO DA ANULAÇÃO DE PAGAMENTO nasce EXPORTÁVEL.
 *
 * Ele vai à prestação de contas do Tribunal de Contas (SAGRES, EstornoPagamento), num campo de 120
 * caracteres que proíbe aspas e apóstrofo e em que uma quebra de linha parte o arquivo. O gerador
 * RECUSA o que não cabe — e descobrir isso no dia da remessa, meses depois, deixaria um fato que não
 * se exporta. Por isso a regra é conferida AQUI, na anulação, antes de gravar.
 */
export const TAMANHO_MAXIMO_DO_MOTIVO_DE_ANULACAO_DE_PAGAMENTO = 120;

export function exigirMotivoDeAnulacaoDePagamento(motivo: string): string {
  return exigirMotivoDeAnulacao(motivo, "do pagamento");
}

/**
 * V23 — a mesma regra para o EMPENHO (SAGRES Estornos §4.9) e a LIQUIDAÇÃO (EstornoLiquidacao
 * §4.11): nos dois o motivo é obrigatório no leiaute, com os mesmos 120 caracteres. Conferido na
 * anulação inteira e na parcial, antes de gravar.
 */
export function exigirMotivoDeAnulacao(motivo: string, doQue: "do pagamento" | "do empenho" | "da liquidação" | "dos encargos"): string {
  const m = motivo.trim();
  if (m === "") throw new Error(`Informe o motivo da anulação ${doQue}. Nada foi gravado.`);
  if (m.length > TAMANHO_MAXIMO_DO_MOTIVO_DE_ANULACAO_DE_PAGAMENTO) {
    throw new Error(
      `O motivo tem ${String(m.length)} caracteres; a prestação de contas ao Tribunal de Contas aceita até ` +
        `${String(TAMANHO_MAXIMO_DO_MOTIVO_DE_ANULACAO_DE_PAGAMENTO)}. Resuma o motivo. Nada foi gravado.`
    );
  }
  if (/[\u0000-\u001f]/.test(m)) {
    throw new Error("Escreva o motivo numa linha só, sem quebra de linha. Nada foi gravado.");
  }
  if (m.includes("'") || m.includes('"')) {
    throw new Error("O motivo não pode ter aspas nem apóstrofo (o arquivo do Tribunal de Contas não aceita). Nada foi gravado.");
  }
  return m;
}
