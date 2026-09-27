import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import {
  gerarEstorno,
  type Partida,
} from "../../packages/ledger/index.js";
import type {
  ContaResolvida,
  PartidaParaPersistir,
} from "../m01-core-contabil/ports.js";
import {
  comporArrecadacao,
  zAnularArrecadacaoInput,
  type AnularArrecadacaoInput,
  type RegistrarArrecadacaoInput,
  type RoteiroContabil,
} from "./dominio.js";
import type {
  ConfrontoPrevisao,
  M04Deps,
  ParcelaPersistidaDeFonte,
} from "./ports.js";
import {
  consolidarPorNatureza,
  type ParcelaDaDistribuicao,
} from "./distribuicao.js";
import { contaDeControleDaDdr } from "../m01-core-contabil/roteiros.js";

/**
 * CASOS DE USO do M04. Orquestra domain puro + ports. Não fala Prisma.
 *
 * Ordem em `registrarArrecadacao`:
 *   forma (Zod) -> partidas balanceadas (motor puro) -> classificação existe
 *   (fail-closed) -> contas existem e são ANALÍTICAS (fail-closed, M01) ->
 *   persistência ATÔMICA (arrecadação + lançamento na mesma transação).
 *
 * Nada toca o banco antes do lançamento fechar.
 */

export interface ResultadoArrecadacao {
  readonly receitaId: string;
  readonly lancamentoId: string;
  /** INVARIANTE 5: excesso de arrecadação é LEGÍTIMO — sinalizado, não barrado. */
  readonly confronto: ConfrontoPrevisao;
}

/**
 * FAIL-CLOSED: nenhuma partida pode tocar conta RESERVADA por outro módulo.
 *
 * Quem responde "esta conta é gerida por alguém?" é o dono dela (o M10, pelo
 * `ContaReservadaPort`) — o M04 não sabe o que é uma dívida, e não deve saber.
 */
async function exigirContasLivres(
  partidas: readonly PartidaParaPersistir[],
  deps: M04Deps
): Promise<void> {
  const port = deps.contasReservadas!;
  for (const contaId of new Set(partidas.map((p) => p.contaId))) {
    const gestor = await port.quemGere(contaId);
    if (gestor !== null) {
      throw new Error(
        `CONTA RESERVADA: a conta desta partida é gerida pelo ${gestor} — o saldo ` +
          `dela é o Σ dos movimentos daquele livro, e uma arrecadação avulsa a ` +
          `moveria no RAZÃO sem mover os MOVIMENTOS. A amarração razão×movimentos ` +
          `passaria a acusar para sempre, sem que ninguém soubesse de onde veio a ` +
          `diferença. Use a OPERAÇÃO COMPOSTA do M10 — ela grava os dois lados na ` +
          `mesma transação.`
      );
    }
  }
}

/** Resolve os códigos PCASP em contaIds, aplicando a regra da conta analítica. */
async function resolverContas(
  partidas: readonly Partida[],
  deps: M04Deps
): Promise<readonly PartidaParaPersistir[]> {
  const codigos = [...new Set(partidas.map((p) => p.conta))];
  const encontradas = await deps.contas.buscarPorCodigos(codigos);
  const porCodigo = new Map<string, ContaResolvida>(
    encontradas.map((c) => [c.codigo, c])
  );

  const inexistentes = codigos.filter((c) => !porCodigo.has(c));
  if (inexistentes.length > 0) {
    throw new Error(
      `Conta(s) inexistente(s) no plano PCASP: ${inexistentes.join(", ")}.`
    );
  }

  const sinteticas = encontradas.filter((c) => !c.analitica);
  if (sinteticas.length > 0) {
    throw new Error(
      `Conta sintética não recebe partida: ` +
        `${sinteticas.map((c) => c.codigo).join(", ")}.`
    );
  }

  return partidas.map((p) => ({
    contaId: porCodigo.get(p.conta)!.id,
    tipo: p.tipo,
    subsistema: p.subsistema,
    valor: p.valor,
  }));
}

/** Registra uma arrecadação e sua contabilização. */
/**
 * ⚠️ CANAL INTERNO — NÃO USE.
 *
 * É por aqui que a OPERAÇÃO COMPOSTA do M10 se identifica: ela É a dona da conta
 * reservada (a arrecadação e o movimento da dívida nascem juntos, na mesma
 * transação), e o guard da entrada lateral não pode barrá-la. Qualquer outro
 * chamador que passe isto está driblando o guard — e o grep de `origem:` mostra
 * exatamente quem.
 */
export interface OrigemInterna {
  readonly origem: "OPERACAO_COMPOSTA_M10";
}

/**
 * V16/C30 — RESOLVE A DISTRIBUIÇÃO: soma, fontes, previsão da LOA, autorização e coerência.
 *
 * ⚠️ A ORDEM É A GARANTIA, e ela é a mesma de todo este arquivo: **nada é gravado antes de tudo
 * ser conferido**. Soma, existência das fontes, previsão, autorização e coerência com o roteiro
 * acontecem ANTES do primeiro INSERT — "efeito colateral antes da operação guardada envenena a
 * tentativa seguinte".
 */
async function resolverDistribuicao(
  p: {
    readonly parcelas: readonly ParcelaDaDistribuicao[];
    readonly total: Money;
    readonly exercicio: number;
    readonly naturezaReceitaId: string;
    readonly naturezaReceitaCodigo: string;
    readonly fontePadrao: string;
    readonly numeroReceita: string;
    readonly criadoPor: string;
    /** A conta que recebeu o dinheiro, quando a guia a declara — para cobrar o rol por parcela. */
    readonly contaId?: string | undefined;
  },
  roteiro: RoteiroContabil,
  deps: M04Deps
): Promise<readonly ParcelaPersistidaDeFonte[]> {
  // 1. A soma das parcelas já foi conferida no DOMÍNIO (`comporArrecadacao`), antes de as
  //    partidas serem compostas — é de lá que sai a recusa que diz PARCELA e TOTAL. Aqui começa o
  //    que depende de banco.

  // 2. As fontes existem? TODAS de uma vez, e a recusa nomeia as que faltam.
  const ids = await deps.classificacao.resolverFontes(p.parcelas.map((x) => x.fonte));
  const inexistentes = p.parcelas.map((x) => x.fonte).filter((c) => !ids.has(c));
  if (inexistentes.length > 0) {
    throw new Error(
      `Fonte(s) de recurso inexistente(s) na distribuição: ${[...new Set(inexistentes)].join(", ")}. ` +
        `Nada foi gravado.`
    );
  }

  // 3. ⚠️ A FONTE PADRÃO DA GUIA TEM DE SER UMA DAS QUE RECEBERAM DINHEIRO.
  //    `ReceitaArrecadada.fonteId` continua NOT NULL e é a fonte padrão da guia; todo leitor que
  //    ainda não aprendeu a distribuição a usa. Se ela apontasse para uma fonte que não recebeu
  //    nada, esse leitor atribuiria o total inteiro a uma fonte que a guia diz não ter recebido —
  //    e o erro seria invisível, porque a soma continuaria certa.
  if (!p.parcelas.some((x) => x.fonte === p.fontePadrao)) {
    throw new Error(
      `A guia ${p.numeroReceita} declara a fonte ${p.fontePadrao}, que não está entre as fontes da ` +
        `distribuição (${p.parcelas.map((x) => x.fonte).join(", ")}). A fonte da guia tem de ser uma ` +
        `das que receberam dinheiro. Nada foi gravado.`
    );
  }

  // 3a. ⚠️ CADA PARCELA CONTRA O ROL DA CONTA. A guia repartida põe dinheiro em VÁRIAS fontes na
  //     MESMA conta bancária — e é justamente por isso que a conta multifonte existe (TR 5.10.2.6:
  //     município pequeno não abre uma conta por fonte). Sem esta conferência, a distribuição
  //     viraria a porta de entrada para carimbar recurso numa conta que não o comporta, e o
  //     controle de destinação — a prova de que recurso vinculado não custeou outra coisa —
  //     acontece DENTRO da conta.
  if (p.contaId !== undefined && deps.contasBancarias !== undefined) {
    for (const x of p.parcelas) {
      await deps.contasBancarias.exigirFonteNoRol(
        p.contaId,
        ids.get(x.fonte)!,
        `a parcela da fonte ${x.fonte} na guia ${p.numeroReceita}`
      );
    }
  }

  // 4. O "conforme LOA": quais (fonte, exercício da fonte) a previsão desta natureza contempla.
  const previstas = await deps.receitas.fontesPrevistas(p.exercicio, p.naturezaReceitaId);
  const chavesPrevistas = new Set(previstas.map((x) => `${x.fonteId}|${x.exercicioFonte}`));

  // ⚠️ O CÓDIGO DA FONTE ANDA JUNTO DA PARCELA RESOLVIDA. Filtrar uma lista e indexar a outra
  // pelo mesmo número é como se erra isto em silêncio: depois do `filter` os índices não
  // correspondem mais, e a recusa nomearia a fonte errada.
  const resolvidas: readonly {
    readonly codigo: string;
    readonly parcela: ParcelaPersistidaDeFonte;
  }[] = p.parcelas.map((x) => {
    const fonteId = ids.get(x.fonte)!;
    return {
      codigo: x.fonte,
      parcela: {
        fonteId,
        exercicioFonte: x.exercicioFonte,
        valor: x.valor,
        previstaNaLoa: chavesPrevistas.has(`${fonteId}|${x.exercicioFonte}`),
        ...(x.fundamento !== undefined ? { fundamento: x.fundamento } : {}),
      },
    };
  });

  const foraDaPrevisao = resolvidas.filter((x) => !x.parcela.previstaNaLoa);
  if (foraDaPrevisao.length > 0) {
    // 4a. O MOTIVO ESCRITO é exigido sempre que a parcela não estava prevista — inclusive quando
    //     a natureza não tem previsão nenhuma. É o que a prestação de contas lê. O CHECK do banco
    //     cobra o mesmo, para que nenhum importador ou INSERT de manutenção passe por baixo.
    const semMotivo = foraDaPrevisao.filter(
      (x) => x.parcela.fundamento === undefined || x.parcela.fundamento.trim().length < 10
    );
    if (semMotivo.length > 0) {
      throw new Error(
        `FONTE FORA DA PREVISÃO SEM MOTIVO ESCRITO: a LOA deste exercício não prevê a natureza ` +
          `${p.naturezaReceitaCodigo} na(s) fonte(s) ${semMotivo.map((x) => x.codigo).join(", ")}. ` +
          `Receita além do previsto é legítima, mas o motivo é o que a prestação de contas lê. ` +
          `Escreva por quê (mínimo 10 caracteres). Nada foi gravado.`
      );
    }

    // 4b. ⚠️ A AUTORIZAÇÃO NOMEADA — e SÓ quando há previsão a contrariar.
    //     Natureza que a LOA prevê em certas fontes e recebe dinheiro em OUTRA é alteração da
    //     destinação decidida no orçamento: isso pede crachá próprio
    //     (`DISTRIBUIR_RECEITA_FORA_DA_PREVISAO`), porque o erro sai no RGF Anexo 5 e na DDR.
    //     Natureza SEM previsão nenhuma é excesso de arrecadação, que é legítimo (INVARIANTE 5) e
    //     não tem distribuição orçamentária para contrariar — exigir crachá ali pararia a
    //     arrecadação para cobrar um cadastro.
    if (previstas.length > 0) {
      // ⚠️ A AÇÃO É LITERAL, e não uma entrada do `ACAO_DO_SERVICO`. Aquele Record mapeia
      // SERVIÇO -> ação, e o censo cobra que cada nome corresponda a uma função exportada; esta
      // autorização não guarda um serviço próprio — ela é a SEGUNDA que `registrarArrecadacao`
      // cobra, dentro dele. Inventar um nome de serviço para ela deixaria um fantasma no censo.
      await deps.autz.exigir(p.criadoPor, "DISTRIBUIR_RECEITA_FORA_DA_PREVISAO", "ENTE");
    }
  }

  // 5. ⚠️ O ROTEIRO REPARTE A CLASSE 7 NA MESMA PARTIÇÃO QUE AS PARCELAS DIZEM?
  //    O motor já garante que o subsistema CONTROLE fecha — logo Σ das pernas de classe 7 é o
  //    total. Mas fechar não é bastar: roteiro e parcelas poderiam repartir o MESMO total em
  //    naturezas diferentes, e a DDR sairia carimbada numa destinação que a parcela não declara.
  //    É a mesma conferência que a guia já faz contra a conta bancária ("escrituração incoerente").
  const esperado = consolidarPorNatureza(
    p.parcelas.map((x) => ({ natureza: x.naturezaDaFonte, valor: x.valor })),
    (x) => x.natureza
  ).map((x) => `${contaDeControleDaDdr(x.natureza)}=${x.valor.toFixed(2)}`);
  const doRoteiro = roteiro
    .filter((perna) => perna.subsistema === "CONTROLE" && perna.tipo === "DEBITO")
    .map((perna) => `${perna.conta}=${(perna.valor ?? p.total).toFixed(2)}`);
  if (esperado.join(" ") !== doRoteiro.join(" ")) {
    throw new Error(
      `ESCRITURAÇÃO INCOERENTE COM A DISTRIBUIÇÃO: a guia ${p.numeroReceita} reparte ` +
        `${esperado.join(", ")} por natureza de fonte, e o roteiro debita a classe 7 em ` +
        `${doRoteiro.join(", ")}. As duas somam o mesmo total e carimbam destinações diferentes — ` +
        `a DDR sairia atribuída a uma natureza que a parcela não declara. Nada foi gravado.`
    );
  }

  return resolvidas.map((x) => x.parcela);
}

export async function registrarArrecadacao(
  input: RegistrarArrecadacaoInput,
  roteiro: RoteiroContabil,
  deps: M04Deps,
  interno?: OrigemInterna
): Promise<ResultadoArrecadacao> {
  // 1. Domain puro: forma + partidas balanceadas por subsistema.
  const { dados, partidas } = comporArrecadacao(input, roteiro);

  // ⚠️ SEM UG: a receita é do ENTE, e isso não é um detalhe do schema — é o art. 167, IV da
  // Constituição em ação. O dinheiro que entra é do município; a `ReceitaArrecadada` tem
  // natureza e fonte, e NÃO tem unidade orçamentária, porque a receita não "pertence" à
  // Secretaria de Saúde. A vinculação por FONTE é outra coisa, e ela já existe (TR 5.23).
  //
  // ⚠️ E NA OPERAÇÃO COMPOSTA (M10 × M04 — receber dívida ativa, tomar empréstimo) esta é a
  // ÚNICA autorização que roda, DENTRO da transação dela: `criarM04DepsNaTx(tx)` monta a porta
  // sobre a tx. Os linkers (`receberNaTx`, `ingressoNaTx`) não são atos do usuário — são
  // pernas do mesmo fato, e autorizá-los de novo seria cobrar duas vezes pela mesma coisa.
  await deps.autz.exigir(
    dados.criadoPor,
    ACAO_DO_SERVICO.registrarArrecadacao,
    "ENTE"
  );

  // 2. Classificação existe? (fail-closed — nunca cria implicitamente)
  const resolucao = await deps.classificacao.resolver({
    naturezaReceita: dados.naturezaReceita,
    fonte: dados.fonte,
    co: dados.co,
  });

  const faltantes: string[] = [];
  if (resolucao.naturezaReceita === null) {
    faltantes.push(`naturezaReceita="${dados.naturezaReceita}"`);
  }
  if (resolucao.fonte === null) faltantes.push(`fonte="${dados.fonte}"`);
  if (dados.co !== undefined && resolucao.co === null) {
    faltantes.push(`co="${dados.co}"`);
  }
  if (faltantes.length > 0) {
    throw new Error(
      `Componente(s) inexistente(s) na classificação: ${faltantes.join(", ")}.`
    );
  }

  const naturezaReceitaId = resolucao.naturezaReceita!.id;

  // 3. Contas existem e são analíticas (regra do M01).
  const partidasParaPersistir = await resolverContas(partidas, deps);

  // ═══ 3a. A CONTA BANCÁRIA (V6 P1.2) — fato, vinculação e escrituração COERENTES ═══
  // Quando a guia declara a conta que recebeu o dinheiro: (i) a fonte da conta é a da guia;
  // (ii) a conta contábil mapeada da conta é EXATAMENTE a perna de disponibilidade do roteiro.
  // Sem (ii) a conciliação daquela conta nunca fecharia — o fato diria "entrou em CC-X" e o razão
  // diria "entrou em outra conta". Sem port ligado, declarar conta é recusado nomeando.
  let contaBancariaId: string | undefined;
  let entidadeTitularId: string | undefined;
  if (dados.contaBancaria !== undefined) {
    if (deps.contasBancarias === undefined) {
      throw new Error(
        `A guia ${dados.numeroReceita} declara a conta bancária ${dados.contaBancaria}, mas o módulo de contas ` +
          `bancárias não foi ligado a esta operação. Nada foi gravado.`
      );
    }
    const conta = await deps.contasBancarias.buscarPorCodigo(dados.contaBancaria);
    if (conta === null) {
      throw new Error(`Conta bancária ${dados.contaBancaria} não cadastrada. Nada foi gravado.`);
    }
    // ⚠️ V16/C30 — O **ROL** DA CONTA, E NÃO MAIS A COLUNA `fonteId`.
    //
    // Aqui havia `conta.fonteCodigo !== dados.fonte`, e a comparação era a de ANTES da
    // `ADR-conta-bancaria-com-varias-fontes` (aceita em 2026-09-10). A ADR mandou o guard olhar o
    // VÍNCULO — cinco sítios passaram a usar `exigirFonteNoRolDaConta` e a arrecadação ficou de
    // fora, porque naquela data ela não tinha conta bancária. Ela ganhou conta na V6 P1.2 e
    // trouxe a comparação velha. O efeito: conta multifonte NÃO recebia guia da segunda fonte
    // dela, que é exatamente o caso que a decisão veio permitir.
    //
    // A regra (rol vazio cai para a fonte padrão; fonte fora do rol recusa NOMEANDO as
    // permitidas) mora numa função só, chamada pelo port.
    await deps.contasBancarias.exigirFonteNoRol(
      conta.id,
      resolucao.fonte!.id,
      `a guia ${dados.numeroReceita}`
    );
    const disponibilidade = roteiro.find((p) => p.tipo === "DEBITO" && p.subsistema === "PATRIMONIAL");
    if (conta.contaContabilCodigo === null) {
      throw new Error(
        `A conta bancária ${conta.codigo} não tem conta contábil mapeada; sem isso a arrecadação não pode dizer ` +
          `em que conta do razão o dinheiro entrou. Parametrize o mapeamento antes. Nada foi gravado.`
      );
    }
    if (disponibilidade === undefined || disponibilidade.conta !== conta.contaContabilCodigo) {
      throw new Error(
        `ESCRITURAÇÃO INCOERENTE: a guia ${dados.numeroReceita} diz que o dinheiro entrou em ${conta.codigo} ` +
          `(conta contábil ${conta.contaContabilCodigo}), mas o roteiro debita ${disponibilidade?.conta ?? "nenhuma"}. ` +
          `A perna de disponibilidade tem de ser a conta contábil da conta bancária declarada. Nada foi gravado.`
      );
    }
    contaBancariaId = conta.id;
    // ═══ 3a.1 O CARIMBO DA ENTIDADE TITULAR (V11 V9) ═══
    // ⚠️ DERIVADO, NUNCA ESCOLHIDO NA GUIA. A entidade sai do titular VIGENTE da conta em que o
    // dinheiro entrou — o único vínculo inequívoco que este sistema tem: uma conta bancária tem
    // exatamente um titular jurídico. Deixar a guia declarar uma entidade diferente da conta
    // seria a guia sabendo mais do que a conta, e a contradição não teria árbitro.
    //
    // ⚠️ E `null` NÃO PEDE ESCOLHA NEM BARRA A GUIA. Conta sem titular declarado produz guia NÃO
    // ATRIBUÍDA, e isso é um estado honesto: o dinheiro entrou, o ente ainda não disse de quem
    // é, e a consulta mostra exatamente isso. Barrar aqui pararia a arrecadação inteira para
    // cobrar um cadastro; inventar um titular seria pior.
    entidadeTitularId = conta.entidadeTitularId ?? undefined;
  }

  // ═══ 3b. A ENTRADA LATERAL — TR do M10 (dívida e dívida ativa) ═══
  // Uma conta RESERVADA é gerida por um livro próprio (o saldo dela é Σ dos
  // movimentos da dívida). Uma arrecadação AVULSA que a toque mexe no RAZÃO sem
  // mexer nos MOVIMENTOS — e a amarração razão×movimentos passa a acusar para
  // sempre, sem que ninguém saiba de onde veio a diferença.
  //
  // A operação COMPOSTA (que grava os dois lados na mesma transação) é a dona da
  // conta: ela se identifica pelo canal interno e passa.
  if (interno === undefined && deps.contasReservadas !== undefined) {
    await exigirContasLivres(partidasParaPersistir, deps);
  }

  // 4. Confronto com a previsão. SINALIZA, não bloqueia (INVARIANTE 5):
  //    excesso de arrecadação é legítimo e vira fonte de crédito adicional.
  const confronto = await confrontarPrevisao(
    dados.exercicio,
    naturezaReceitaId,
    dados.valor,
    deps
  );

  // ═══ 4a. V16/C30 — A DISTRIBUIÇÃO ENTRE FONTES, resolvida ANTES do primeiro INSERT ═══
  const distribuicao =
    dados.distribuicao === undefined
      ? undefined
      : await resolverDistribuicao(
          {
            parcelas: dados.distribuicao,
            total: dados.valor,
            exercicio: dados.exercicio,
            naturezaReceitaId,
            naturezaReceitaCodigo: dados.naturezaReceita,
            fontePadrao: dados.fonte,
            numeroReceita: dados.numeroReceita,
            criadoPor: dados.criadoPor,
            ...(contaBancariaId !== undefined ? { contaId: contaBancariaId } : {}),
          },
          roteiro,
          deps
        );

  // 5. Persistência atômica.
  const receitaId = deps.ids.novo();
  const lancamentoId = deps.ids.novo();

  await deps.receitas.persistir(
    {
      id: receitaId,
      exercicio: dados.exercicio,
      naturezaReceitaId,
      fonteId: resolucao.fonte!.id,
      ...(resolucao.co !== null ? { coId: resolucao.co.id } : {}),
      exercicioFonte: dados.exercicioFonte,
      tipo: "ARRECADACAO",
      valor: dados.valor,
      dataArrecadacao: dados.dataArrecadacao,
      numeroReceita: dados.numeroReceita,
      ...(contaBancariaId !== undefined ? { contaBancariaId } : {}),
      ...(entidadeTitularId !== undefined ? { entidadeTitularId } : {}),
      ...(distribuicao !== undefined ? { distribuicao } : {}),
      criadoPor: dados.criadoPor,
    },
    {
      id: lancamentoId,
      numeroControle: dados.numeroReceita,
      dataTransacao: dados.dataArrecadacao,
      historico: `Arrecadação da receita ${dados.naturezaReceita} (guia ${dados.numeroReceita})`,
      origemTipo: "ARRECADACAO",
      origemId: receitaId,
      criadoPor: dados.criadoPor,
      partidas: partidasParaPersistir,
    }
  );

  return { receitaId, lancamentoId, confronto };
}

async function confrontarPrevisao(
  exercicio: number,
  naturezaReceitaId: string,
  valor: Money,
  deps: M04Deps
): Promise<ConfrontoPrevisao> {
  const [previsto, acumuladoAnterior] = await Promise.all([
    deps.receitas.previsaoTotal(exercicio, naturezaReceitaId),
    deps.receitas.acumuladoLiquido(exercicio, naturezaReceitaId),
  ]);

  const acumuladoComEsta = toMoney(acumuladoAnterior.plus(valor));

  return {
    previsto,
    acumuladoAnterior,
    acumuladoComEsta,
    excedeuPrevisao: acumuladoComEsta.greaterThan(previsto),
  };
}

/**
 * Anula uma arrecadação: INVARIANTE 2 — não escreve de volta na original.
 * Persiste uma ReceitaArrecadada NOVA (tipo ANULACAO) e um LancamentoContabil
 * NOVO com as partidas invertidas, ambos referenciando os originais.
 *
 * O motor puro (`gerarEstorno`) rejeita duplo estorno lendo
 * `lancamento.estornos`; a corrida se fecha no índice único parcial
 * `uq_estorno_receita_unico` (prisma/sql/).
 */
export async function anularArrecadacao(
  input: AnularArrecadacaoInput,
  deps: M04Deps
): Promise<{ readonly receitaId: string; readonly lancamentoId: string }> {
  const dados = zAnularArrecadacaoInput.parse(input);

  // ⚠️ SEM UG (mesma razão da arrecadação) — e repare no que ISTO autoriza: a anulação dispara
  // a CASCATA do M10 (`AoAnularArrecadacaoPort`), que estorna, na mesma transação, tudo o que
  // a receita quitou — o recebimento de dívida ativa, o ingresso da operação de crédito.
  //
  // A cascata roda com ESTA autorização, a do ato original, e não pede outra. Ver t3: exigir
  // uma permissão própria para cada perna partiria a anulação ao meio — o dinheiro desfeito no
  // razão e a dívida do contribuinte ainda baixada. Ele teria "pago" sem ter pago.
  await deps.autz.exigir(
    dados.criadoPor,
    ACAO_DO_SERVICO.anularArrecadacao,
    "ENTE"
  );

  const original = await deps.receitas.buscar(dados.receitaId);
  if (original === null) {
    throw new Error(`Receita ${dados.receitaId} não encontrada.`);
  }
  if (original.tipo === "ANULACAO") {
    throw new Error(
      `Receita ${dados.receitaId} JÁ É uma anulação — não se anula uma anulação.`
    );
  }
  if (original.estornos.length > 0) {
    throw new Error(
      `Receita ${dados.receitaId} já foi anulada ` +
        `(por ${original.estornos.join(", ")}).`
    );
  }

  const idReceita = deps.ids.novo();
  const idLancamento = deps.ids.novo();

  // Motor puro: inverte cada perna, valida o resultado, não muta o original.
  const estorno = gerarEstorno(original.lancamento, {
    idEstorno: idLancamento,
    numeroControleEstorno: dados.numeroReceita,
    dataEstorno: dados.dataAnulacao,
  });

  const partidasParaPersistir = await resolverContas(estorno.partidas, deps);

  await deps.receitas.persistir(
    {
      id: idReceita,
      exercicio: original.exercicio,
      naturezaReceitaId: original.naturezaReceitaId,
      fonteId: original.fonteId,
      ...(original.coId !== null ? { coId: original.coId } : {}),
      // V6 P1.2 — a anulação sai da MESMA conta em que o dinheiro entrou.
      ...(original.contaBancariaId !== null ? { contaBancariaId: original.contaBancariaId } : {}),
      // ⚠️ V11 V9 — A ENTIDADE É **HERDADA**, NUNCA RE-DERIVADA PELA CONTA. A conta pode ter
      // trocado de titular entre a arrecadação e a anulação, e trocar de titular é fato NOVO.
      // Re-derivar faria a entrada ser de uma entidade e o estorno, de outra: uma ficaria com
      // receita que nunca teve e a outra com um débito que nunca fez, e o líquido por entidade
      // não fecharia em nenhuma das duas. Se a original é NÃO ATRIBUÍDA, a anulação também é —
      // desfazer um fato sem titular não produz um titular.
      ...(original.entidadeTitularId !== null ? { entidadeTitularId: original.entidadeTitularId } : {}),
      // ⚠️ V16/C30 — A DISTRIBUIÇÃO É **HERDADA**, NUNCA RE-DERIVADA DA LOA. `ReceitaReprevista`
      // existe: a previsão muda ao longo do exercício, e recalcular a distribuição no dia do
      // estorno desfaria uma repartição diferente da que entrou — a fonte A ficaria com receita
      // que nunca teve e a B com um estorno que não lhe pertence, e o líquido por fonte não
      // fecharia em nenhuma das duas. É o snapshot que o C30 pede, e é a mesma razão da entidade
      // titular. O `previstaNaLoa` e o `fundamento` vêm com ela, porque são o retrato do ato.
      ...(original.distribuicao.length > 0 ? { distribuicao: original.distribuicao } : {}),
      exercicioFonte: original.exercicioFonte,
      tipo: "ANULACAO",
      valor: original.valor,
      dataArrecadacao: dados.dataAnulacao,
      numeroReceita: dados.numeroReceita,
      estornoDeId: original.id,
      criadoPor: dados.criadoPor,
    },
    {
      id: idLancamento,
      numeroControle: dados.numeroReceita,
      dataTransacao: dados.dataAnulacao,
      historico: estorno.historico,
      origemTipo: "ANULACAO_RECEITA",
      origemId: idReceita,
      estornoDeId: original.lancamentoId,
      criadoPor: dados.criadoPor,
      partidas: partidasParaPersistir,
    }
  );

  return { receitaId: idReceita, lancamentoId: idLancamento };
}
