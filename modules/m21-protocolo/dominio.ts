import { z } from "zod";

/**
 * M21 — O DOMÍNIO DO PROCESSO DIGITAL. PURO: sem Prisma, sem I/O, sem Date.now().
 *
 * ═══ ⚠️ A SITUAÇÃO É DERIVADA, E ESTA É A FUNÇÃO QUE A DERIVA ═══
 * Não existe coluna `situacao` (ver `prisma/schema/m21-protocolo.prisma`). Quem
 * responde "em que pé está este processo?" é `situacaoDoProcesso`, dobrando os
 * movimentos em ordem cronológica. É o mesmo desenho do `statusDoEmpenho` (que soma o
 * razão) e do `estadoDaOrdem` (M05).
 *
 * O ganho não é elegância: é que a resposta NÃO PODE divergir do histórico, porque ela
 * É o histórico. Uma coluna congelada num valor antigo é a falha que a tela não mostra.
 */

// ═══════════════════════════════════════════════════════════════════════════
// A SITUAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

export type SituacaoDoProcesso =
  | "ABERTO"
  | "EM_TRAMITE"
  | "EM_ANALISE"
  | "AGUARDANDO_PARECER"
  | "AGUARDANDO_READEQUACAO"
  | "PARALISADO"
  | "ENCERRADO"
  | "ARQUIVADO"
  | "CANCELADO";

export type TipoDeMovimento =
  | "TRAMITE"
  | "RECEBIMENTO"
  | "COMPLEMENTO"
  | "PARECER_SOLICITADO"
  | "PARECER_RESPONDIDO"
  | "READEQUACAO_SOLICITADA"
  | "READEQUACAO_ATENDIDA"
  | "PARALISACAO"
  | "ENCERRAMENTO"
  | "ARQUIVAMENTO"
  | "REABERTURA"
  | "CANCELAMENTO"
  | "ALTERACAO"
  | "TORNADO_SEM_EFEITO";

/** O mínimo que a derivação precisa. Deliberadamente menor que a linha do banco. */
export interface MovimentoParaDerivar {
  readonly id: string;
  readonly tipo: TipoDeMovimento;
  readonly setorOrigemId?: string | null | undefined;
  readonly setorDestinoId?: string | null | undefined;
  readonly respondeAId?: string | null | undefined;
  readonly tornaSemEfeitoId?: string | null | undefined;
  readonly criadoEm: Date;
}

/**
 * OS MOVIMENTOS QUE VALEM — os que sobraram depois de retirar os tornados sem efeito.
 *
 * ⚠️ ELE TIRA O PAR INTEIRO: some o movimento anulado E o `TORNADO_SEM_EFEITO` que o
 * anulou. Deixar o segundo mudaria a situação para o valor de um movimento
 * administrativo, e "processo em TORNADO_SEM_EFEITO" não é estado nenhum.
 *
 * O histórico continua mostrando os dois — quem os esconde é ESTA derivação, não a
 * linha do tempo. É a diferença entre "não conta para o estado" e "nunca aconteceu".
 */
export function movimentosVigentes(
  movimentos: readonly MovimentoParaDerivar[]
): readonly MovimentoParaDerivar[] {
  const anulados = new Set<string>();
  for (const m of movimentos) {
    if (m.tipo === "TORNADO_SEM_EFEITO") {
      anulados.add(m.id);
      if (m.tornaSemEfeitoId != null) anulados.add(m.tornaSemEfeitoId);
    }
  }
  return movimentos.filter((m) => !anulados.has(m.id));
}

/** Ordem cronológica estável: `criadoEm` e, no empate, o id. */
function emOrdem(
  movimentos: readonly MovimentoParaDerivar[]
): readonly MovimentoParaDerivar[] {
  return [...movimentos].sort((a, b) => {
    const d = a.criadoEm.getTime() - b.criadoEm.getTime();
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
}

/**
 * A SITUAÇÃO — pela dobra dos movimentos vigentes, em ordem.
 *
 * ⚠️ PARECER E READEQUAÇÃO SÃO PENDÊNCIAS, NÃO ESTADOS TERMINAIS. Um processo com dois
 * pareceres pedidos e um respondido continua AGUARDANDO_PARECER: a dobra só sai do
 * estado de espera quando NÃO SOBRA pedido sem resposta. Contar "o último movimento"
 * diria "em análise" com um parecer ainda pendente, e o prazo correria contra o setor
 * errado.
 */
export function situacaoDoProcesso(
  movimentos: readonly MovimentoParaDerivar[]
): SituacaoDoProcesso {
  const vigentes = emOrdem(movimentosVigentes(movimentos));

  const pareceresPendentes = new Set<string>();
  const readequacoesPendentes = new Set<string>();
  let situacao: SituacaoDoProcesso = "ABERTO";

  for (const m of vigentes) {
    switch (m.tipo) {
      case "TRAMITE":
        situacao = "EM_TRAMITE";
        break;
      case "RECEBIMENTO":
      case "REABERTURA":
        situacao = "EM_ANALISE";
        break;
      case "COMPLEMENTO":
        // Complemento não muda o pé em que o processo está: ele acrescenta texto.
        // Mas tira do limbo um processo recém-aberto que ainda não tramitou.
        if (situacao === "ABERTO") situacao = "EM_ANALISE";
        break;
      case "PARECER_SOLICITADO":
        pareceresPendentes.add(m.id);
        situacao = "AGUARDANDO_PARECER";
        break;
      case "PARECER_RESPONDIDO":
        if (m.respondeAId != null) pareceresPendentes.delete(m.respondeAId);
        if (pareceresPendentes.size === 0) situacao = "EM_ANALISE";
        break;
      case "READEQUACAO_SOLICITADA":
        readequacoesPendentes.add(m.id);
        situacao = "AGUARDANDO_READEQUACAO";
        break;
      case "READEQUACAO_ATENDIDA":
        if (m.respondeAId != null) readequacoesPendentes.delete(m.respondeAId);
        if (readequacoesPendentes.size === 0) situacao = "EM_ANALISE";
        break;
      case "PARALISACAO":
        situacao = "PARALISADO";
        break;
      case "ENCERRAMENTO":
        situacao = "ENCERRADO";
        break;
      case "ARQUIVAMENTO":
        situacao = "ARQUIVADO";
        break;
      case "CANCELAMENTO":
        situacao = "CANCELADO";
        break;
      case "ALTERACAO":
      case "TORNADO_SEM_EFEITO":
        break;
    }
  }

  return situacao;
}

/**
 * AS SITUAÇÕES QUE FECHAM O PROCESSO PARA ESCRITA.
 *
 * ⚠️ REABRIR É A ÚNICA COISA QUE UM PROCESSO FECHADO ACEITA. Tramitar um processo
 * arquivado seria movimentar um documento que a entidade declarou concluído — e o
 * histórico mostraria trâmites DEPOIS do arquivamento, sem nada explicando por quê.
 */
const FECHADAS: ReadonlySet<SituacaoDoProcesso> = new Set([
  "ENCERRADO",
  "ARQUIVADO",
  "CANCELADO",
]);

export function estaFechado(situacao: SituacaoDoProcesso): boolean {
  return FECHADAS.has(situacao);
}

/** O rótulo de tela. Vocabulário de negócio, sem identificador de catálogo. */
export function descreverSituacao(s: SituacaoDoProcesso): string {
  const rotulos: Record<SituacaoDoProcesso, string> = {
    ABERTO: "Aberto",
    EM_TRAMITE: "Em trâmite (não recebido)",
    EM_ANALISE: "Em análise",
    AGUARDANDO_PARECER: "Aguardando parecer",
    AGUARDANDO_READEQUACAO: "Aguardando readequação do requerente",
    PARALISADO: "Paralisado",
    ENCERRADO: "Encerrado",
    ARQUIVADO: "Arquivado",
    CANCELADO: "Cancelado",
  };
  return rotulos[s];
}

/**
 * O SETOR ONDE O PROCESSO ESTÁ AGORA.
 *
 * ⚠️ O TRÂMITE JÁ MOVE O PROCESSO — o recebimento apenas o ACEITA. Enquanto não
 * recebido, o processo está no setor de destino e aparece na caixa dele como pendente
 * de recebimento; foi para isso que a situação `EM_TRAMITE` existe. Deixá-lo na origem
 * até o recebimento o faria sumir da caixa de quem tem de recebê-lo.
 */
export function setorAtual(
  setorDeAbertura: string,
  movimentos: readonly MovimentoParaDerivar[]
): string {
  let atual = setorDeAbertura;
  for (const m of emOrdem(movimentosVigentes(movimentos))) {
    if (m.tipo === "TRAMITE" && m.setorDestinoId != null) atual = m.setorDestinoId;
  }
  return atual;
}

// ═══════════════════════════════════════════════════════════════════════════
// PRAZO
// ═══════════════════════════════════════════════════════════════════════════

export type SituacaoDePrazo = "SEM_PRAZO" | "NO_PRAZO" | "PROXIMO_DO_FIM" | "ATRASADO";

const UM_DIA_MS = 24 * 60 * 60 * 1000;

/**
 * O PRAZO DA ETAPA CORRENTE — e ele conta do RECEBIMENTO, não do trâmite.
 *
 * ⚠️ UM PROCESSO ENVIADO NA SEXTA E RECEBIDO NA SEGUNDA NÃO CONSUMIU O FIM DE SEMANA
 * DE QUEM O RECEBEU. Contar do trâmite puniria o setor destino pelo tempo em que o
 * documento esteve parado na caixa de outra pessoa.
 *
 * ⚠️ E O `agora` É PARÂMETRO. Uma função de prazo que lê o relógio por dentro não é
 * testável: o teste passaria hoje e falharia amanhã, e ninguém saberia por quê.
 */
export function situacaoDePrazo(
  inicioDaContagem: Date | null,
  prazoDias: number | null,
  agora: Date
): SituacaoDePrazo {
  if (inicioDaContagem === null || prazoDias === null) return "SEM_PRAZO";

  const limite = inicioDaContagem.getTime() + prazoDias * UM_DIA_MS;
  const restanteMs = limite - agora.getTime();

  if (restanteMs < 0) return "ATRASADO";
  // "Próximo do fim" = 20% final do prazo, com o piso de um dia. O piso importa:
  // 20% de um prazo de 2 dias seriam 9,6 horas, e o aviso chegaria tarde demais para
  // ser útil a quem trabalha em dias, não em horas.
  const janelaDeAviso = Math.max(UM_DIA_MS, prazoDias * UM_DIA_MS * 0.2);
  return restanteMs <= janelaDeAviso ? "PROXIMO_DO_FIM" : "NO_PRAZO";
}

/** Quando a contagem começou: o último RECEBIMENTO vigente, ou nada. */
export function inicioDaContagem(
  movimentos: readonly MovimentoParaDerivar[]
): Date | null {
  const recebimentos = emOrdem(movimentosVigentes(movimentos)).filter(
    (m) => m.tipo === "RECEBIMENTO"
  );
  const ultimo = recebimentos[recebimentos.length - 1];
  return ultimo?.criadoEm ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════
// TAXAS
// ═══════════════════════════════════════════════════════════════════════════

export type SituacaoDaTaxa = "EM_ABERTO" | "PAGA" | "CANCELADA";

/**
 * ⚠️ EM_ABERTO É A AUSÊNCIA DE MOVIMENTO. A taxa nasce devida; pagar e cancelar são os
 * fatos. Uma coluna `situacao` teria de ser atualizada, e o dia em que a baixa
 * falhasse pela metade a taxa ficaria paga sem pagamento.
 */
export function situacaoDaTaxa(
  movimentos: readonly { readonly tipo: "PAGAMENTO" | "CANCELAMENTO"; readonly criadoEm: Date }[]
): SituacaoDaTaxa {
  const ordenados = [...movimentos].sort(
    (a, b) => a.criadoEm.getTime() - b.criadoEm.getTime()
  );
  const ultimo = ordenados[ordenados.length - 1];
  if (ultimo === undefined) return "EM_ABERTO";
  return ultimo.tipo === "PAGAMENTO" ? "PAGA" : "CANCELADA";
}

// ═══════════════════════════════════════════════════════════════════════════
// APENSAMENTO
// ═══════════════════════════════════════════════════════════════════════════

export interface MovimentoDeApensamentoParaDerivar {
  readonly processoPrincipalId: string;
  readonly processoApensoId: string;
  readonly tipo: "APENSADO" | "DESAPENSADO";
  readonly criadoEm: Date;
}

/**
 * ESTE PROCESSO ESTÁ APENSADO A QUEM? — o último movimento do par manda.
 *
 * ⚠️ APENSAR TEM EFEITO REAL: enquanto apensado, o processo acompanha a movimentação do
 * principal. Um vínculo que só desenha uma linha na tela é um rótulo, e o catálogo pede
 * que "ambos sigam as mesmas movimentações".
 */
export function principalDoApenso(
  processoId: string,
  movimentos: readonly MovimentoDeApensamentoParaDerivar[]
): string | null {
  const doApenso = [...movimentos]
    .filter((m) => m.processoApensoId === processoId)
    .sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime());
  const ultimo = doApenso[doApenso.length - 1];
  if (ultimo === undefined || ultimo.tipo === "DESAPENSADO") return null;
  return ultimo.processoPrincipalId;
}

/** Os apensos VIGENTES de um principal. */
export function apensosDe(
  processoId: string,
  movimentos: readonly MovimentoDeApensamentoParaDerivar[]
): readonly string[] {
  const candidatos = new Set(
    movimentos
      .filter((m) => m.processoPrincipalId === processoId)
      .map((m) => m.processoApensoId)
  );
  return [...candidatos].filter(
    (apenso) => principalDoApenso(apenso, movimentos) === processoId
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// O CÓDIGO VERIFICADOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ O ALFABETO EXCLUI 0/O/1/I/L. O código é ditado por telefone e digitado por quem
 * não o escolheu; confundir zero com O transforma "consulte seu processo" em "seu
 * processo não existe". A exclusão custa 5 símbolos de 36 e paga em ligações.
 */
const ALFABETO_DO_VERIFICADOR = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/**
 * O código verificador, a partir de bytes ALEATÓRIOS fornecidos por quem chama.
 *
 * ⚠️ OS BYTES VÊM DE FORA porque esta camada é pura — e porque o teste precisa de um
 * código previsível. Quem chama passa `randomBytes` de verdade; o teste passa os bytes
 * que quiser. Um `Math.random()` aqui dentro seria aleatoriedade não-criptográfica num
 * segredo que dá acesso ao processo.
 */
export function codigoVerificador(bytes: Uint8Array): string {
  if (bytes.length < 10) {
    throw new Error(
      `Código verificador exige ao menos 10 bytes de aleatoriedade; vieram ${bytes.length}. ` +
        "Um código curto é adivinhável, e ele é o que autoriza a consulta externa."
    );
  }
  let s = "";
  for (let i = 0; i < 10; i++) {
    s += ALFABETO_DO_VERIFICADOR[bytes[i]! % ALFABETO_DO_VERIFICADOR.length];
  }
  return s;
}

// ═══════════════════════════════════════════════════════════════════════════
// AS ENTRADAS — Zod, fail-closed, antes de qualquer I/O
// ═══════════════════════════════════════════════════════════════════════════

const texto = (min: number, oQue: string) =>
  z.string().trim().min(min, `${oQue} tem de ter ao menos ${min} caracteres.`);

export const zAbrirProcesso = z
  .object({
    exercicio: z.number().int().min(1900).max(2200),
    assuntoId: z.string().min(1),
    subassuntoId: z.string().min(1).optional(),
    /** Do cadastro único. Ausente = anônimo, e aí o contato é obrigatório. */
    requerenteId: z.string().min(1).optional(),
    contatoAnonimo: z.string().trim().min(5).optional(),
    finalidade: z.enum(["ATENDIMENTO_AO_PUBLICO", "INTERNO"]),
    prioridade: z.enum(["NORMAL", "ALTA", "URGENTE"]).default("NORMAL"),
    sigiloso: z.boolean().default(false),
    documentacaoFisica: z.boolean().default(false),
    textoAbertura: texto(10, "O texto de abertura"),
    setorAberturaId: z.string().min(1),
    requerentesAdicionais: z.array(z.string().min(1)).default([]),
    /** O requerente aceitou o termo do assunto? Só cobrado quando o assunto exige. */
    aceitouTermo: z.boolean().default(false),
    criadoPor: z.string().min(1),
  })
  .refine((d) => (d.requerenteId === undefined) !== (d.contatoAnonimo === undefined), {
    message:
      "Informe O REQUERENTE do cadastro único OU o contato do requerente anônimo — " +
      "nunca os dois, nunca nenhum. Um processo sem nenhum dos dois não tem a quem " +
      "responder; com os dois, não se sabe qual vale.",
  });

export type AbrirProcessoInput = z.input<typeof zAbrirProcesso>;

export const zTramitar = z.object({
  processoId: z.string().min(1),
  setorDestinoId: z.string().min(1),
  usuarioDestino: z.string().min(1).optional(),
  texto: texto(5, "O despacho do trâmite"),
  criadoPor: z.string().min(1),
});
export type TramitarInput = z.input<typeof zTramitar>;

export const zReceber = z.object({
  processoId: z.string().min(1),
  texto: z.string().trim().default("Recebido."),
  criadoPor: z.string().min(1),
});
export type ReceberInput = z.input<typeof zReceber>;

export const zComplementar = z.object({
  processoId: z.string().min(1),
  texto: texto(5, "O complemento"),
  criadoPor: z.string().min(1),
});
export type ComplementarInput = z.input<typeof zComplementar>;

export const zSolicitarParecer = z.object({
  processoId: z.string().min(1),
  setorDestinoId: z.string().min(1),
  usuarioDestino: z.string().min(1).optional(),
  texto: texto(10, "O pedido de parecer"),
  criadoPor: z.string().min(1),
});
export type SolicitarParecerInput = z.input<typeof zSolicitarParecer>;

export const zResponderParecer = z.object({
  processoId: z.string().min(1),
  solicitacaoId: z.string().min(1),
  texto: texto(10, "O parecer"),
  criadoPor: z.string().min(1),
});
export type ResponderParecerInput = z.input<typeof zResponderParecer>;

export const zSolicitarReadequacao = z.object({
  processoId: z.string().min(1),
  texto: texto(10, "O pedido de readequação"),
  criadoPor: z.string().min(1),
});
export type SolicitarReadequacaoInput = z.input<typeof zSolicitarReadequacao>;

export const zAtenderReadequacao = z.object({
  processoId: z.string().min(1),
  solicitacaoId: z.string().min(1),
  texto: texto(5, "A resposta da readequação"),
  /**
   * ⚠️ QUEM ATENDE É O REQUERENTE, E ELE PODE NÃO SER USUÁRIO DO SISTEMA. O código
   * verificador é o que prova que quem responde tem o processo em mãos. Ver
   * `atenderReadequacao`.
   */
  codigoVerificador: z.string().trim().min(10).optional(),
  criadoPor: z.string().min(1),
});
export type AtenderReadequacaoInput = z.input<typeof zAtenderReadequacao>;

export const zEncerrar = z.object({
  processoId: z.string().min(1),
  texto: texto(10, "O parecer de encerramento"),
  criadoPor: z.string().min(1),
});
export type EncerrarInput = z.input<typeof zEncerrar>;

export const zArquivar = z.object({
  processoId: z.string().min(1),
  texto: texto(5, "O despacho de arquivamento"),
  criadoPor: z.string().min(1),
});
export type ArquivarInput = z.input<typeof zArquivar>;

export const zReabrir = z.object({
  processoId: z.string().min(1),
  texto: texto(10, "O motivo da reabertura"),
  criadoPor: z.string().min(1),
});
export type ReabrirInput = z.input<typeof zReabrir>;

export const zApensar = z.object({
  processoPrincipalId: z.string().min(1),
  processoApensoId: z.string().min(1),
  motivo: texto(10, "O motivo do apensamento"),
  criadoPor: z.string().min(1),
});
export type ApensarInput = z.input<typeof zApensar>;

export const zDesapensar = z.object({
  processoPrincipalId: z.string().min(1),
  processoApensoId: z.string().min(1),
  motivo: texto(10, "O motivo do desapensamento"),
  criadoPor: z.string().min(1),
});
export type DesapensarInput = z.input<typeof zDesapensar>;

export const zTornarMovimentoSemEfeito = z.object({
  processoId: z.string().min(1),
  movimentoId: z.string().min(1),
  motivo: texto(10, "O motivo"),
  criadoPor: z.string().min(1),
});
export type TornarMovimentoSemEfeitoInput = z.input<typeof zTornarMovimentoSemEfeito>;
