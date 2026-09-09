import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { exigirUsuarioAtivo } from "../m16-travamento/autorizacao.js";
import { exigirCompetenciaDestravada } from "../m16-travamento/guard.js";
import type { NaturezaLancamento } from "./adapter-prisma.js";

/**
 * O FUNIL DO RAZÃO — **todo** lançamento contábil deste sistema passa por aqui.
 *
 * ═══ ⚠️ POR QUE ELE PRECISOU EXISTIR ═══
 * Ele não existia. Até este bloco, `LancamentoContabil` era criado em **19 pontos, em 9
 * módulos**, cada um chamando `tx.lancamentoContabil.create()` por conta própria. Cada um
 * fazia a mesma coisa (as mesmas 10 colunas, as partidas aninhadas), e nenhum sabia dos
 * outros.
 *
 * Isso funcionou enquanto ninguém precisou de uma regra que valesse para TODO fato. O
 * travamento de competência (TR 4.52/4.53/4.54) é essa regra — e um travamento que cobre 18
 * dos 19 caminhos é **pior do que nenhum**: ele dá ao gestor a certeza de que o mês está
 * fechado enquanto o razão continua se movendo pela porta esquecida.
 *
 * ⚠️ E O FUNIL **SÓ É FUNIL SE FOR O ÚNICO**. Por isso existe um teste que varre o
 * repositório inteiro e FALHA se `lancamentoContabil.create` aparecer fora deste arquivo
 * (`m01-funil.test.ts`). Sem ele, o 20º escritor — o do próximo módulo — reabre o furo em
 * silêncio, e ninguém descobre até o TCE perguntar por que março se mexeu depois de fechado.
 *
 * ═══ O QUE ELE **NÃO** FAZ (e é escopo declarado) ═══
 * Ele NÃO valida ΣD == ΣC por subsistema. Essa validação hoje mora nos CHAMADORES (o
 * `validarLancamento` do motor puro, chamado por cada módulo antes de compor as partidas), e
 * consolidá-la aqui mudaria o comportamento de 19 lugares num bloco que promete não mudar
 * literal nenhum. É o **candidato natural** do funil — e está NOMEADO como pendência.
 */

/** O client OU uma transação dele. */
export type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

export interface PartidaParaGravar {
  readonly contaId: string;
  readonly tipo: "DEBITO" | "CREDITO";
  readonly subsistema: "ORCAMENTARIO" | "PATRIMONIAL" | "CONTROLE";
  /**
   * ⚠️ STRING DECIMAL DE 2 CASAS — a travessia da fronteira (INVARIANTE 1). O `Money` do
   * domínio (decimal.js) e o `Prisma.Decimal` são classes DIFERENTES, e passar uma pela
   * outra é como o dinheiro se corrompe em silêncio. Quem chama já fez o `toFixed(2)`.
   */
  readonly valor: string;
  /** ADITIVO M02/M05 — a dimensão orçamentária. Nulo quando a partida não a tem. */
  readonly fichaId?: string | null | undefined;
}

/**
 * A UNIÃO DOS 19 SHAPES — e ela absorve, não bifurca.
 *
 * Levantada dos 19 pontos ANTES de escrever uma linha: todos gravam exatamente estas
 * colunas. O `id` é opcional porque metade deles deixa o Prisma gerar (`@default(cuid())`) e
 * a outra metade informa um id que o motor puro já criou (o estorno precisa saber o id antes
 * de gravar). O funil aceita os dois — bifurcar em `lancarComId`/`lancarSemId` seria ter
 * dois funis, que é ter nenhum.
 */
export interface LancamentoParaGravar {
  readonly id?: string | undefined;
  readonly numeroControle: string;
  /** A data do FATO. É ela que corta os relatórios — e é ela que o travamento olha. */
  readonly dataTransacao: Date;
  readonly historico: string;
  readonly origemTipo: string;
  readonly origemId?: string | null | undefined;
  /** `undefined`/`null` lê-se NORMAL (a coluna entrou aditiva, sem backfill). */
  readonly natureza?: NaturezaLancamento | null | undefined;
  readonly estornoDeId?: string | null | undefined;
  readonly criadoPor: string;
  readonly partidas: readonly PartidaParaGravar[];
}

/**
 * GRAVA O LANÇAMENTO E AS PARTIDAS — e roda o guard de travamento antes.
 *
 * Devolve o `id`. Comportamento IDÊNTICO ao `create` direto que ele substitui: nenhum
 * literal de nenhum teste existente muda. A única diferença observável é o guard — e ele só
 * fala quando há trava.
 */
export async function lancarNoRazao(
  tx: Tx,
  l: LancamentoParaGravar
): Promise<string> {
  // ⚠️ O GUARD VEM **ANTES** DO INSERT, E NA MESMA TRANSAÇÃO.
  //
  // Antes, porque um lançamento barrado não pode deixar rastro: o teste prova por SELECT
  // que a competência travada não grava NEM a linha do lançamento, NEM as partidas.
  //
  // Na mesma transação, porque a leitura da trava e a escrita do fato têm de enxergar o
  // MESMO estado do banco. Sob READ COMMITTED, uma trava commitada ANTES desta leitura é
  // sempre vista — e é essa a semântica que o teste de corrida prova.
  //
  // ⚠️ E ELE NÃO VALIDA ΣD == ΣC. Ver o cabeçalho: essa validação mora nos chamadores
  // (motor puro do M01), e trazê-la para cá é o próximo bloco.
  // ⚠️ (1) A IDENTIDADE — E ELA NÃO É AUTORIZAÇÃO.
  //
  // O funil confere QUEM ESTÁ ASSINANDO, nunca O QUE ELE PODE. E a separação é a coisa
  // certa a fazer: um `LancamentoContabil` chega aqui idêntico venha ele de um empenho, de
  // um pagamento ou de uma provisão — o funil NÃO SABE que ação está sendo executada, e
  // fingir que sabe (adivinhando pelo `origemTipo`, que é string livre) seria construir
  // uma autorização que erra em silêncio.
  //
  // Quem sabe qual é a ação é o SERVIÇO, e é lá que o `autorizar` mora (TR 4.55/4.56).
  // Aqui mora o que TODO fato tem em comum: um autor, e ele tem de existir e estar ativo.
  //
  // ⚠️ E ISSO CURA A PENDÊNCIA DE a4f2bd6: o `criadoPor` era uma string livre — um nome
  // que ninguém podia cobrar. Agora ele é uma identidade.
  await exigirUsuarioAtivo(tx, l.criadoPor, `lançamento ${l.numeroControle}`);

  // ⚠️ (2) O TRAVAMENTO DE COMPETÊNCIA.
  await exigirCompetenciaDestravada(tx, l);

  const criado = await tx.lancamentoContabil.create({
    data: {
      ...(l.id !== undefined ? { id: l.id } : {}),
      numeroControle: l.numeroControle,
      dataTransacao: l.dataTransacao,
      historico: l.historico,
      origemTipo: l.origemTipo,
      origemId: l.origemId ?? null,
      ...(l.natureza !== undefined && l.natureza !== null
        ? { natureza: l.natureza }
        : {}),
      estornoDeId: l.estornoDeId ?? null,
      criadoPor: l.criadoPor,
      partidas: {
        create: l.partidas.map((p) => ({
          contaId: p.contaId,
          tipo: p.tipo,
          subsistema: p.subsistema,
          valor: p.valor,
          fichaId: p.fichaId ?? null,
        })),
      },
    },
    select: { id: true },
  });

  return criado.id;
}
