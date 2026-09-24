/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * A SELEÇÃO E A ABRANGÊNCIA DO CÁLCULO — TR 5.12.50 (V11 V9.5)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ LEIA A DISTINÇÃO ANTES DE MEXER. São TRÊS coisas, e confundi-las já custou uma entrega:
 *
 *   (a) FILTRO DE CONSULTA — "quem eu quero VER". Mora no M32 (`EixosDeConsultaDeVinculo`),
 *       é cobrado como LEITURA, e NÃO recorta quem é calculado.
 *   (b) SELEÇÃO PARA PROCESSAMENTO — "quem eu quero CALCULAR". É ato do operador, com ação
 *       própria. É o `SelecaoDoCalculo` deste arquivo.
 *   (c) ABRANGÊNCIA EFETIVA — "quem o motor de fato calculou, e por que os outros não". É um
 *       FATO apurado, nunca um parâmetro. É a `LinhaDeAbrangencia` deste arquivo.
 *
 * ═══ ⚠️ O QUE MUDA NA PROMESSA DA FOLHA, E POR QUE (c) NASCE COM (b) ═══
 *
 * Até aqui `calcularFolha` prometia "todos os vínculos vivos na competência" e mantinha a
 * promessa **POR CONSTRUÇÃO**: o `findMany` dos vínculos não tinha `where` nenhum. Com a seleção
 * essa construção vai embora, e **uma promessa mantida por construção some junto com a
 * construção**. A promessa passa a ser:
 *
 *     "exatamente os SELECIONADOS e ELEGÍVEIS, com cada exclusão NOMEADA"
 *
 * e ela tem de ser **afirmada por teste**, porque nada mais a segura sozinha. Sem (c) gravado, uma
 * folha parcial fecha com o total batendo, o empenho batendo e a liquidação batendo — nenhuma
 * etapa adiante acusa. É a forma exata de defeito que este módulo já pagou três vezes.
 *
 * ═══ ⚠️ E O PERIGO NÃO É A DUPLICIDADE — É A SUBTRAÇÃO SILENCIOSA ═══
 *
 * Todo mundo vigia "pagar duas vezes". O risco real é o oposto, e ninguém o procuraria:
 * `fecharFolha` congela **UM** cálculo (o último não cancelado). Com seleção por cálculo,
 * nº1={A,B} e nº2={C,D} fazem o fechamento levar só {C,D} — **A e B não recebem**, sem erro, sem
 * aviso, com totais coerentes. É `uniaoDasSelecoesVivas` + `selecionadosQueSumiriam` que impedem.
 */

/** Como o operador declarou quem entra. */
export type ModoDeSelecao = "TODOS_OS_ELEGIVEIS" | "EXPLICITA";

/**
 * A SELEÇÃO DECLARADA PELO OPERADOR.
 *
 * ⚠️ `TODOS_OS_ELEGIVEIS` NÃO É "LISTA VAZIA", E A DISTINÇÃO É A GUARDA CONTRA O DEFEITO DA
 * PAGINAÇÃO. Uma tela paginada que oferece "selecionar tudo" e manda os 25 visíveis produziria
 * uma `EXPLICITA` de 25 — e o sistema registraria 25, que é a verdade. O que não pode acontecer é
 * "selecionar tudo" virar `TODOS_OS_ELEGIVEIS` sem que todos tenham sido considerados, nem os 25
 * passarem por "todos". Por isso o modo é DECLARADO, nunca inferido do tamanho da lista: inferir
 * faria uma seleção de 25 num ente de 25 servidores ser indistinguível de "todos".
 */
export interface SelecaoDoCalculo {
  readonly modo: ModoDeSelecao;
  /** Os vínculos declarados. Vazio — e obrigatoriamente vazio — quando o modo é `TODOS_OS_ELEGIVEIS`. */
  readonly vinculoIds: readonly string[];
}

export const SELECAO_DE_TODOS: SelecaoDoCalculo = { modo: "TODOS_OS_ELEGIVEIS", vinculoIds: [] };

/**
 * POR QUE UM VÍNCULO SELECIONADO NÃO PRODUZIU CONTRACHEQUE.
 *
 * ⚠️ CADA VALOR AQUI ERA UM `continue` MUDO OU UMA AUSÊNCIA SILENCIOSA. `ADMITIDO_APOS...` e
 * `DESLIGADO_ANTES...` são literalmente as duas linhas que o motor mensal descartava sem deixar
 * rastro; `NAO_SELECIONADO` é o que a seleção introduz; `VINCULO_INEXISTENTE` é o que a
 * revalidação encontra quando a tela envelheceu. Exclusão sem motivo registrado é irmã de
 * "existe como linha ≠ produziu efeito".
 */
export type MotivoDaExclusao =
  | "ADMITIDO_APOS_A_COMPETENCIA"
  | "DESLIGADO_ANTES_DA_COMPETENCIA"
  | "SEM_DIFERENCA_A_PAGAR";

/**
 * ⚠️ TODO MOTIVO QUE SOBROU FRUSTRA UMA EXPECTATIVA — e a lista encolheu por MEDIÇÃO, não por
 * gosto. Duas exclusões foram tentadas e descartadas pelo que o banco disse:
 *
 *   · `NAO_SELECIONADO` — gravar uma linha por vínculo NÃO pedido faria um cálculo de 2 pessoas
 *     num ente de 900 gravar 898 linhas de ruído, escondendo as três exclusões que importam.
 *     E ele é DERIVÁVEL: `modoDeSelecao = EXPLICITA` mais a lista dos considerados já diz quem
 *     não foi pedido. Fato derivável não vira linha.
 *   · `VINCULO_INEXISTENTE` — **é impossível de gravar**: a FK de `AbrangenciaDoCalculo` aponta
 *     para `Vinculo`, e um vínculo que não existe não tem para onde apontar. A tentativa estourou
 *     `AbrangenciaDoCalculo_vinculoId_fkey` e derrubou a transação inteira. A revalidação passou
 *     a RECUSAR o cálculo, que é mais forte: em vez de um registro sobre alguém inexistente, o
 *     operador recebe "você pediu alguém que não existe, confira a seleção" e nada é gravado.
 */
export const EXCLUSAO_FOI_PEDIDA: Readonly<Record<MotivoDaExclusao, boolean>> = {
  ADMITIDO_APOS_A_COMPETENCIA: true,
  DESLIGADO_ANTES_DA_COMPETENCIA: true,
  SEM_DIFERENCA_A_PAGAR: true,
};

/** Uma linha do fato de abrangência: este vínculo entrou, ou ficou de fora por este motivo. */
export interface LinhaDeAbrangencia {
  readonly vinculoId: string;
  readonly calculado: boolean;
  /** `null` exatamente quando `calculado` é verdadeiro. */
  readonly motivo: MotivoDaExclusao | null;
}

/**
 * QUEM O CÁLCULO DEVE CONSIDERAR, A PARTIR DA SELEÇÃO — puro, sem banco e sem relógio.
 *
 * ⚠️ A REVALIDAÇÃO ACONTECE AQUI, E É POR ISSO QUE ESTA FUNÇÃO RECEBE O QUE O BANCO TEM AGORA.
 * A seleção vem da tela, e entre a tela e o cálculo um vínculo pode ter deixado de existir. O
 * exigido pelo usuário é que ele "não entre em silêncio" — então ele não some: vira exclusão com
 * motivo `VINCULO_INEXISTENTE`, visível para sempre no fato do cálculo.
 *
 * ⚠️ E A ORDEM É DETERMINÍSTICA porque ela entra no `sha256` do cálculo por via indireta (a lista
 * de contracheques). Duas execuções com a mesma seleção têm de produzir a mesma abrangência.
 */
export class SelecaoComVinculoInexistenteError extends Error {
  constructor(readonly inexistentes: readonly string[]) {
    super(
      `SELECAO-COM-VINCULO-INEXISTENTE: a seleção nomeia ${inexistentes.length} vínculo(s) que não ` +
        `existem no instante do cálculo (${inexistentes.join(", ")}). A tela pode ter envelhecido — ` +
        `um vínculo apagado entre a seleção e o cálculo, ou um identificador digitado errado. ` +
        `Recusar é mais seguro que calcular os demais e calar sobre estes: o operador declarou que ` +
        `os queria. Confira a seleção e recalcule. Nada foi calculado.`
    );
    this.name = "SelecaoComVinculoInexistenteError";
  }
}

/**
 * QUEM O CÁLCULO DEVE CONSIDERAR, A PARTIR DA SELEÇÃO — puro, sem banco e sem relógio.
 *
 * ⚠️ A REVALIDAÇÃO ACONTECE AQUI, E RECUSA EM VEZ DE REGISTRAR. A seleção vem da tela, e entre a
 * tela e o cálculo um vínculo pode ter deixado de existir. Ele não pode virar linha de abrangência
 * — a FK aponta para `Vinculo` e não há para onde apontar —, e calcular os demais calando sobre
 * ele seria exatamente o silêncio que esta unidade existe para eliminar. Então estoura.
 *
 * ⚠️ E A ORDEM É DETERMINÍSTICA porque a abrangência entra no fato do cálculo: duas execuções com
 * a mesma seleção têm de produzir o mesmo conjunto considerado.
 */
export function abrangenciaDeclarada(
  selecao: SelecaoDoCalculo,
  vinculosQueExistem: readonly string[]
): { readonly aConsiderar: readonly string[] } {
  if (selecao.modo === "TODOS_OS_ELEGIVEIS") {
    return { aConsiderar: [...vinculosQueExistem].sort() };
  }
  const existem = new Set(vinculosQueExistem);
  const pedidos = [...new Set(selecao.vinculoIds)].sort();
  const inexistentes = pedidos.filter((id) => !existem.has(id));
  if (inexistentes.length > 0) throw new SelecaoComVinculoInexistenteError(inexistentes);
  return { aConsiderar: pedidos };
}

/**
 * ═══ ⚠️ A GUARDA DE COMPLETUDE — a propriedade que substituiu a ausência de `where` ═══
 *
 * Afirma que **todo vínculo considerado terminou em exatamente um dos dois lados**: produziu
 * contracheque, ou tem exclusão NOMEADA. Nem um a menos (folha parcial silenciosa), nem um em
 * dois lugares (contagem que mente), nem exclusão sem motivo.
 *
 * ⚠️ ELA NÃO É `contracheques.length === selecionados.length`, e a diferença é o ponto: essa
 * igualdade passa quando um selecionado some e um intruso entra. Aqui a conferência é de
 * CONJUNTO, não de cardinalidade.
 */
export class AbrangenciaIncompletaError extends Error {
  constructor(
    readonly semDestino: readonly string[],
    readonly duplicados: readonly string[],
    readonly intrusos: readonly string[]
  ) {
    super(
      `ABRANGENCIA-INCOMPLETA: o cálculo não fecha o conjunto que declarou processar. ` +
        (semDestino.length > 0 ? `Sem contracheque e sem exclusão nomeada: ${semDestino.join(", ")}. ` : "") +
        (duplicados.length > 0 ? `Contados duas vezes: ${duplicados.join(", ")}. ` : "") +
        (intrusos.length > 0 ? `Produziram contracheque sem terem sido considerados: ${intrusos.join(", ")}. ` : "") +
        `A folha deixaria de prometer "exatamente os selecionados e elegíveis" sem que nada ` +
        `acusasse adiante — o total bateria, o empenho bateria e a liquidação bateria. Nada foi gravado.`
    );
    this.name = "AbrangenciaIncompletaError";
  }
}

export function exigirAbrangenciaCompleta(
  considerados: readonly string[],
  comContracheque: readonly string[],
  excluidos: readonly LinhaDeAbrangencia[]
): void {
  const calc = new Set(comContracheque);
  const exc = new Set(excluidos.map((e) => e.vinculoId));
  const semDestino = considerados.filter((id) => !calc.has(id) && !exc.has(id)).sort();
  const duplicados = considerados.filter((id) => calc.has(id) && exc.has(id)).sort();
  const considerado = new Set(considerados);
  const intrusos = comContracheque.filter((id) => !considerado.has(id)).sort();
  if (semDestino.length > 0 || duplicados.length > 0 || intrusos.length > 0) {
    throw new AbrangenciaIncompletaError(semDestino, duplicados, intrusos);
  }
}

/**
 * ═══ ⚠️ A UNIÃO DAS SELEÇÕES VIVAS — a guarda contra a SUBTRAÇÃO SILENCIOSA ═══
 *
 * `fecharFolha` congela **um** cálculo. Se os cálculos anteriores (não cancelados) processaram
 * gente que o cálculo a congelar não processa, essa gente **não recebe** — e nada acusa, porque a
 * folha fecha com os totais do cálculo escolhido.
 *
 * ⚠️ O CANCELAMENTO É A SAÍDA LEGÍTIMA, e é por isso que ele entra na conta: um cálculo cancelado
 * declara "isto não vale", e quem estava só nele deixou de ser prometido POR ATO. O que esta
 * guarda impede é o esquecimento, não a decisão.
 */
export function selecionadosQueSumiriam(
  calculadosEmCalculosVivos: readonly string[],
  calculadosNoQueVaiFechar: readonly string[]
): readonly string[] {
  const noFinal = new Set(calculadosNoQueVaiFechar);
  return [...new Set(calculadosEmCalculosVivos)].filter((id) => !noFinal.has(id)).sort();
}

/**
 * ═══ ⚠️ "CADA UM NO MÁXIMO UMA VEZ" — e por que ela precisou virar afirmação ═══
 *
 * Antes da seleção, "todos, uma vez" era sustentado de lado por TRÊS construções que ninguém
 * escreveu com esse fim: `@@unique([calculoId, vinculoId])` (uma vez por cálculo), o fechamento
 * congelar um único cálculo (uma vez por folha) e a subtração do apurado na complementar (uma vez
 * por competência). **Nenhuma das três AFIRMA a propriedade — as três a produzem de lado.**
 *
 * A seleção multiplica os caminhos que chegam ali, então a propriedade passa a ser afirmada aqui
 * e provada por teste, em vez de depender de três coincidências continuarem coincidindo.
 */
export function vinculosPagosDuasVezes(
  porFolhaFechadaDaCompetencia: readonly (readonly string[])[]
): readonly string[] {
  const vistos = new Map<string, number>();
  for (const folha of porFolhaFechadaDaCompetencia) {
    for (const id of new Set(folha)) vistos.set(id, (vistos.get(id) ?? 0) + 1);
  }
  return [...vistos.entries()].filter(([, n]) => n > 1).map(([id]) => id).sort();
}
