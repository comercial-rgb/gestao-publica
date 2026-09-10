import type { PrismaClient } from "../../prisma/generated/client/client.js";

/**
 * GUARD DO EXERCÍCIO — fail-closed.
 *
 * Fica num arquivo SÓ DELE de propósito: o M02, o M03 e o M05 precisam dele, e o
 * resto do M08 (restos a pagar) precisa DELES. Se o guard morasse junto do resto
 * do M08, teríamos um ciclo M05 → M08 → M05. Aqui ele não importa nada além do
 * tipo do Prisma.
 *
 * "Está encerrado?" é DERIVADO: existe um `EncerramentoExercicio` apontando para
 * o exercício. Não há coluna `status` — ela exigiria UPDATE, e o encerramento é
 * um FATO (quem encerrou, quando), não um atributo.
 */

/** Qualquer coisa que fale Prisma: o client ou uma transação dele. */
export type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

export async function estaEncerrado(tx: Tx, ano: number): Promise<boolean> {
  const e = await tx.exercicio.findUnique({
    where: { ano },
    select: { encerramento: { select: { id: true } } },
  });
  return e?.encerramento != null;
}

/**
 * FAIL-CLOSED: rejeita operação em exercício INEXISTENTE ou ENCERRADO.
 *
 * Exercício inexistente também é erro — e não "cria na hora". Um exercício que
 * ninguém abriu não deveria receber empenho: se o sistema o criasse sozinho, um
 * erro de digitação (2062 em vez de 2026) viraria um exercício novo em silêncio,
 * com orçamento próprio e sem lei nenhuma por trás.
 *
 * Chamar SEMPRE dentro da transação da operação.
 */
export async function exigirExercicioAberto(
  tx: Tx,
  ano: number,
  operacao: string
): Promise<void> {
  const exercicio = await tx.exercicio.findUnique({
    where: { ano },
    select: { ano: true, encerramento: { select: { criadoEm: true } } },
  });

  if (exercicio === null) {
    throw new Error(
      `Exercício ${ano} não existe — ${operacao} rejeitado. Abra o exercício ` +
        `antes de operar nele (um exercício não nasce de um empenho).`
    );
  }

  if (exercicio.encerramento !== null) {
    throw new Error(
      `Exercício ${ano} está ENCERRADO (em ` +
        `${exercicio.encerramento.criadoEm.toISOString().slice(0, 10)}) — ` +
        `${operacao} rejeitado. Despesa de exercício encerrado vira RESTOS A ` +
        `PAGAR; use as operações de RP.`
    );
  }
}

/** O ano do exercício de uma ficha. Fonte única — ninguém digita o ano de novo. */
export async function anoDaFicha(tx: Tx, fichaId: string): Promise<number> {
  const f = await tx.fichaOrcamentaria.findUnique({
    where: { id: fichaId },
    select: { exercicio: true },
  });
  if (f === null) {
    throw new Error(`Ficha ${fichaId} não encontrada.`);
  }
  return f.exercicio;
}

/** Conveniência: exige que o exercício DA FICHA esteja aberto. */
export async function exigirExercicioDaFichaAberto(
  tx: Tx,
  fichaId: string,
  operacao: string
): Promise<void> {
  await exigirExercicioAberto(tx, await anoDaFicha(tx, fichaId), operacao);
}

/**
 * ═══ O GUARD DA COMPETÊNCIA — nasceu com o ADR de 2026-09-10 ═══
 *
 * `exigirExercicioDaFichaAberto` confere o exercício DA FICHA. Isso bastava enquanto o
 * movimento de dotação não tinha data própria: o único tempo que ele conhecia era o
 * instante da gravação, e o instante da gravação é sempre "agora".
 *
 * ⚠️ COM COMPETÊNCIA, OS DOIS DEIXAM DE COINCIDIR — E ABRE-SE UM CAMINHO. Uma ficha de
 * 2026 está aberta; 2025 está encerrado. Um movimento gravado hoje na ficha de 2026 com
 * competência 20/12/2025 passa pelo guard da ficha (2026 está aberto) e vai parar, POR
 * COMPETÊNCIA, dentro de um exercício que já foi encerrado e cujos demonstrativos já
 * foram publicados. É despesa entrando em exercício fechado pela porta dos fundos — e o
 * guard antigo não a vê, porque ele nunca olhou para a data do fato.
 *
 * Este guard olha. `Despesa de exercício encerrado vira restos a pagar` continua sendo a
 * regra; ela só passa a valer também para quem antedata.
 *
 * ═══ ⚠️ POR QUE ELE MEMORIZA, E O NÚMERO QUE OBRIGOU A ISSO ═══
 * Ele é chamado UMA VEZ POR MOVIMENTO, dentro da transação. Um decreto de crédito com
 * vários itens gera vários movimentos, todos com a MESMA competência — e a versão sem
 * memória repetia o mesmo `SELECT` em `Exercicio` para cada um, com o lock da ficha na
 * mão.
 *
 * Medido em 2026-09-10, no teste `t8` do M03 (dois créditos concorrentes, 5 rodadas),
 * rodando as mesmas 18 suítes nas duas condições:
 *
 *   · sem o guard ......... 2745 ms — passa
 *   · com o guard, sem memória ... 5035 ms — ESTOURA o limite de 5000 ms do vitest
 *
 * Não é um teste lento demais: são 2,3 segundos de ida e volta ao banco dentro da seção
 * crítica, e numa corrida real isso é tempo de lock segurado à toa.
 *
 * ⚠️ MEMORIZAR AQUI É SEGURO, E A RAZÃO É ESTREITA: a memória vive por TRANSAÇÃO (a
 * `WeakMap` é chaveada pelo próprio `tx`, e o `tx` morre com ela) e guarda só ANO ABERTO.
 * Dentro de uma transação, um exercício aberto não fecha — fechá-lo exigiria uma escrita
 * que esta mesma transação teria de fazer, e nenhuma operação encerra exercício e grava
 * dotação ao mesmo tempo. O caso FECHADO nunca é memorizado: ele lança, e a transação
 * inteira cai.
 *
 * ⚠️ E O CLIENTE DE LONGA VIDA É EXCLUÍDO DA MEMÓRIA, DE PROPÓSITO. `Tx` aceita tanto o
 * cliente do Prisma quanto uma transação dele, e alguns chamadores (seeds, ajudantes de
 * teste) passam o CLIENTE. Memorizar num objeto que vive o processo inteiro seria um
 * defeito de verdade: encerrar um exercício depois de já ter gravado nele deixaria o
 * guard respondendo "aberto" para sempre, com base numa leitura de minutos atrás.
 *
 * A distinção é feita por `"$transaction" in tx`: o cliente de transação interativa do
 * Prisma NÃO expõe `$transaction`; o cliente de longa vida expõe. E a checagem é segura
 * NOS DOIS SENTIDOS — se um dia ela errar, erra para o lado de NÃO memorizar, que é
 * apenas mais lento. Nunca para o lado de memorizar o que não devia.
 *
 * ⚠️ O QUE ELE NÃO EXIGE, E É DELIBERADO: que a competência caia no MESMO exercício da
 * ficha. Uma reserva feita em janeiro de 2027 contra uma ficha de 2026 ainda aberta é
 * legítima, e a competência dela é 2027 mesmo. O saldo da ficha em 31/12/2026 a exclui,
 * que é a resposta certa. Exigir igualdade recusaria a operação honesta sem impedir
 * nenhuma desonesta.
 *
 * ═══ ⚠️ ELE PERGUNTA "ESTÁ ENCERRADO?", E NÃO "ESTÁ ABERTO?" — A DIFERENÇA CUSTOU UM
 * TESTE VERMELHO, E O TESTE ESTAVA CERTO ═══
 * A primeira versão chamava `exigirExercicioAberto`, que recusa exercício ENCERRADO **e
 * também exercício INEXISTENTE**. Isso derrubou o `t5` do M16:
 *
 *     "anular em JANEIRO um empenho de dezembro travado PASSA"
 *
 * A anulação tem data de **20/01/2027**, e o exercício de 2027 ainda não fora aberto. O
 * guard recusava — impedindo o ente de **corrigir em janeiro um erro de dezembro**, que é
 * exatamente o que ele tem de poder fazer, e que aquele teste existe para garantir.
 *
 * A condição do ADR é "competência em período **FECHADO**". Um ano que ninguém abriu não é
 * um período fechado: é um período que não começou. São coisas diferentes, e tratá-las
 * igual transformou uma proteção contra antedatar numa proibição de pós-datar.
 *
 * ⚠️ O QUE ISSO DEIXA DE FORA, DITO SEM EUFEMISMO: uma competência num ano que nunca
 * existiu (2062 por erro de digitação) **não é recusada por este guard**. Quem recusa
 * exercício inexistente continua sendo `exigirExercicioAberto`, cobrado sobre o exercício
 * DA FICHA — e é lá que ele deve ficar, porque a ficha é que tem exercício obrigatório. O
 * fato pode legitimamente competir num ano ainda não aberto; a ficha, não.
 */
const ANOS_ABERTOS_NA_TRANSACAO = new WeakMap<object, Set<number>>();

export async function exigirCompetenciaEmExercicioAberto(
  tx: Tx,
  competencia: Date,
  operacao: string
): Promise<void> {
  // ⚠️ UTC, e não a hora local. `getFullYear()` numa máquina a oeste de Greenwich diria
  // 2025 para uma competência de 01/01/2026T00:00Z — e o movimento seria recusado por um
  // exercício encerrado que não é o dele. Todas as competências deste sistema são
  // gravadas em UTC (ver o `Date.UTC` da dotação inicial).
  const ano = competencia.getUTCFullYear();

  // Ver o docblock: só uma transação de verdade tem memória.
  const memorizavel = !("$transaction" in tx);
  const jaAbertos = memorizavel ? ANOS_ABERTOS_NA_TRANSACAO.get(tx) : undefined;
  if (jaAbertos?.has(ano) === true) return;

  if (await estaEncerrado(tx, ano)) {
    throw new Error(
      `Exercício ${ano} está ENCERRADO — ${operacao} com competência em ` +
        `${competencia.toISOString().slice(0, 10)} rejeitado. A data do FATO cai dentro ` +
        `de um exercício cujos demonstrativos já foram publicados; mover o saldo dele ` +
        `agora tornaria falso o que já foi entregue. Despesa de exercício encerrado vira ` +
        `RESTOS A PAGAR. Nada foi gravado.`
    );
  }

  // Só chega aqui se PASSOU. O encerrado lança acima e nunca é memorizado.
  if (!memorizavel) return;
  if (jaAbertos === undefined) {
    ANOS_ABERTOS_NA_TRANSACAO.set(tx, new Set([ano]));
  } else {
    jaAbertos.add(ano);
  }
}
