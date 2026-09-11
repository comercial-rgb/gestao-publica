import { z } from "zod";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { Decimal, toMoney, type Money } from "../../packages/contracts/index.js";
import { diaCivil } from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { lancarNoRazao } from "./razao.js";

/**
 * ═══ O REPONTAMENTO DE CONTA (ENT05, ITEM 3) ═══
 *
 * ⚠️ O ACHADO QUE ISTO CORRIGE. O censo do ENT04 confrontou os 70 códigos de conta que a
 * produção usa contra o PCASP oficial do TCE-PB. Nenhum foi inventado — mas QUATRO
 * apontam para um conceito diferente do que o sistema chama:
 *
 *   · `1.1.1.1.2.00.00` o sistema chama "Bancos Conta Movimento"; oficialmente é
 *     **CAIXA E EQUIVALENTES — INTRA OFSS**, a variante de transação entre órgãos do
 *     MESMO ente. A conta bancária comum é `1.1.1.1.1.19.00`;
 *   · `1.1.5.1.1.00.00` o sistema chama "Almoxarifado"; oficialmente é **MERCADORIAS
 *     PARA REVENDA OU DOAÇÃO**. O almoxarifado é `1.1.5.6.1.01.00`;
 *   · `2.2.1.1.1.00.00` o sistema chama "Dívida Fundada Interna"; oficialmente é
 *     **PESSOAL A PAGAR**. Empréstimo interno de longo prazo é `2.2.2.1.1.02.98`;
 *   · `1.1.2.2.0.00.00` o sistema chama "Créditos Tributários a Receber"; oficialmente é
 *     **CLIENTES**, e ainda por cima é SINTÉTICA. O correto é `1.1.2.1.1.99.00`.
 *
 * ═══ ⚠️ POR QUE NÃO É UM `UPDATE` NO CÓDIGO DA CONTA ═══
 * Trocar o código deixaria todos os lançamentos já feitos apontando para um conceito
 * DIFERENTE do que tinham quando foram feitos. O balancete do exercício anterior mudaria
 * sozinho, e nada no razão explicaria por quê — é razão reescrito com outro nome.
 *
 * ⚠️ E TAMBÉM NÃO É UM LANÇAMENTO SOLTO. O lançamento de migração existe, mas ele vem
 * acompanhado de um REGISTRO (`MigracaoDeConta`) que diz de onde, para onde, quando, por
 * quê e QUANTO — porque o lançamento sozinho é dois números, e quem audita precisa saber
 * que aqueles dois números são uma correção de eixo e não um fato do exercício.
 *
 * ⚠️ É O MESMO REGIME DA COMPETÊNCIA: caracterizar primeiro, corrigir depois. A
 * caracterização está em `test/contas-contra-o-plano-oficial.test.ts`, que mede as quatro
 * divergências e FALHA se a lista crescer.
 */

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/**
 * O REPONTAMENTO DECIDIDO, com origem e destino MEDIDOS contra o plano oficial.
 *
 * ⚠️ ESTA TABELA É A DECISÃO, e ela é código com revisão — não configuração. Acrescentar
 * uma linha aqui é mover saldo de conta, e isso não se faz por formulário.
 */
export const REPONTAMENTOS_DO_ENT05: readonly {
  readonly origem: string;
  readonly destino: string;
  readonly conceito: string;
  readonly porque: string;
}[] = [
  {
    origem: "1.1.1.1.2.00.00",
    destino: "1.1.1.1.1.19.00",
    conceito: "conta bancária de movimento do ente",
    porque:
      "a origem é a variante INTRA OFSS (transação entre órgãos do MESMO ente); a conta " +
      "bancária comum é BANCOS CONTA MOVIMENTO - DEMAIS CONTAS",
  },
  {
    origem: "1.1.5.1.1.00.00",
    destino: "1.1.5.6.1.01.00",
    conceito: "estoque de material de consumo do almoxarifado",
    porque:
      "a origem é MERCADORIAS PARA REVENDA OU DOAÇÃO, que é estoque para ALIENAR ou " +
      "DISTRIBUIR; o almoxarifado de consumo próprio é MATERIAL DE CONSUMO",
  },
  {
    origem: "2.2.1.1.1.00.00",
    destino: "2.2.2.1.1.02.98",
    conceito: "dívida fundada interna por contrato",
    porque:
      "a origem é PESSOAL A PAGAR, que é obrigação de folha; empréstimo interno de longo " +
      "prazo por contrato é OUTROS CONTRATOS - EMPRÉSTIMOS INTERNOS",
  },
  {
    origem: "1.1.2.2.0.00.00",
    destino: "1.1.2.1.1.99.00",
    conceito: "créditos tributários a receber",
    porque:
      "a origem é CLIENTES (e é SINTÉTICA, que nem recebe partida); crédito tributário " +
      "é OUTROS CRÉDITOS TRIBUTÁRIOS A RECEBER",
  },
];

export const zRepontarContaInput = z.object({
  codigoOrigem: z.string().min(1),
  codigoDestino: z.string().min(1),
  data: z.coerce.date(),
  motivo: z.string().trim().min(10),
  criadoPor: z.string().min(1),
});
export type RepontarContaInput = z.input<typeof zRepontarContaInput>;

/** O saldo de uma conta pelas partidas, com o sinal da natureza dela. */
export async function saldoDaConta(
  tx: Tx,
  contaId: string,
  natureza: "DEVEDORA" | "CREDORA",
  ateData?: Date
): Promise<Money> {
  const partidas = await tx.partidaContabil.findMany({
    where: {
      contaId,
      ...(ateData === undefined
        ? {}
        : { lancamento: { dataTransacao: { lte: ateData } } }),
    },
    select: { tipo: true, valor: true },
  });

  let saldo = new Decimal(0);
  for (const p of partidas) {
    const v = toMoney(p.valor.toFixed(2));
    const soma = natureza === "DEVEDORA" ? p.tipo === "DEBITO" : p.tipo === "CREDITO";
    saldo = soma ? saldo.plus(v) : saldo.minus(v);
  }
  return saldo;
}

/**
 * REPONTA UMA CONTA — move o saldo com um lançamento que EXPLICA a mudança.
 *
 * ⚠️ IDEMPOTENTE POR PAR (origem, destino): repontar duas vezes RECUSA. Sem isso, a
 * segunda chamada moveria um saldo já movido — e o destino ficaria com o dobro enquanto a
 * origem ficaria negativa, que é exatamente a forma de defeito que a razão append-only
 * existe para tornar impossível.
 *
 * ⚠️ E SALDO ZERO NÃO GERA LANÇAMENTO. Um lançamento de valor zero polui o razão sem
 * dizer nada; o REGISTRO da migração é criado mesmo assim, porque a decisão de repontar
 * foi tomada e tem de ficar visível.
 */
export async function repontarConta(
  prisma: PrismaClient,
  input: RepontarContaInput
): Promise<{
  readonly migracaoId: string;
  readonly saldoMigrado: Money;
  readonly lancamentoId: string | null;
}> {
  const d = zRepontarContaInput.parse(input);
  if (d.codigoOrigem === d.codigoDestino) {
    throw new Error(`Origem e destino são a mesma conta — não há o que repontar.`);
  }

  return prisma.$transaction(async (tx) => {
    // Ato do ENTE: repontar conta decide sobre o razão INTEIRO, não sobre uma unidade.
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.repontarConta, "ENTE");

    const [origem, destino] = await Promise.all([
      tx.contaPcasp.findUnique({
        where: { codigo: d.codigoOrigem },
        select: { id: true, codigo: true, nome: true, naturezaSaldo: true, analitica: true },
      }),
      tx.contaPcasp.findUnique({
        where: { codigo: d.codigoDestino },
        select: { id: true, codigo: true, nome: true, naturezaSaldo: true, analitica: true },
      }),
    ]);
    if (origem === null) throw new Error(`Conta de origem ${d.codigoOrigem} não existe.`);
    if (destino === null) {
      throw new Error(
        `Conta de destino ${d.codigoDestino} não existe. Semeie o plano oficial ` +
          `(npm run seed:pcasp-oficial) antes de repontar — repontar para uma conta ` +
          `inexistente criaria o saldo no vazio.`
      );
    }
    if (!destino.analitica) {
      throw new Error(
        `A conta de destino ${destino.codigo} é SINTÉTICA. Sintética não recebe partida: ` +
          `ela agrega as filhas, e lançar nela faz o balancete somar o mesmo valor duas ` +
          `vezes.`
      );
    }
    if (origem.naturezaSaldo !== destino.naturezaSaldo) {
      throw new Error(
        `A origem ${origem.codigo} é ${origem.naturezaSaldo} e o destino ` +
          `${destino.codigo} é ${destino.naturezaSaldo}. Migrar entre naturezas opostas ` +
          `INVERTERIA o saldo em vez de movê-lo.`
      );
    }

    const jaFeita = await tx.migracaoDeConta.findFirst({
      where: { contaOrigemId: origem.id, contaDestinoId: destino.id },
      select: { id: true, data: true, saldoMigrado: true },
    });
    if (jaFeita !== null) {
      throw new Error(
        `A migração de ${origem.codigo} para ${destino.codigo} JÁ FOI FEITA em ` +
          `${diaCivil(jaFeita.data)}, no valor de ${jaFeita.saldoMigrado.toFixed(2)}. ` +
          `Repetir moveria um saldo já movido: o destino ficaria com o dobro e a origem, ` +
          `negativa.`
      );
    }

    const natureza = origem.naturezaSaldo as "DEVEDORA" | "CREDORA";
    const saldo = await saldoDaConta(tx, origem.id, natureza, d.data);

    let lancamentoId: string | null = null;
    if (!saldo.isZero()) {
      if (saldo.lessThan(0)) {
        throw new Error(
          `A conta ${origem.codigo} tem saldo ${saldo.toFixed(2)} — invertido em relação ` +
            `à natureza ${natureza} dela. Migrar um saldo invertido esconderia um defeito ` +
            `anterior dentro de uma correção de eixo; conserte a causa primeiro.`
        );
      }
      // ⚠️ AS DUAS PERNAS ZERAM A ORIGEM E CRIAM O MESMO NO DESTINO. Para conta DEVEDORA:
      // D destino / C origem. Para CREDORA, o inverso — o saldo credor sai por débito.
      const debitoNoDestino = natureza === "DEVEDORA";
      lancamentoId = await lancarNoRazao(tx, {
        numeroControle: `MIG-${origem.codigo}-${destino.codigo}`,
        dataTransacao: d.data,
        historico:
          `Repontamento de conta: ${origem.codigo} (${origem.nome}) -> ` +
          `${destino.codigo} (${destino.nome}). ${d.motivo}`,
        origemTipo: "MIGRACAO_DE_CONTA",
        origemId: origem.id,
        criadoPor: d.criadoPor,
        partidas: [
          {
            contaId: debitoNoDestino ? destino.id : origem.id,
            tipo: "DEBITO",
            subsistema: "PATRIMONIAL",
            valor: saldo.toFixed(2),
          },
          {
            contaId: debitoNoDestino ? origem.id : destino.id,
            tipo: "CREDITO",
            subsistema: "PATRIMONIAL",
            valor: saldo.toFixed(2),
          },
        ],
      });
    }

    const migracao = await tx.migracaoDeConta.create({
      data: {
        contaOrigemId: origem.id,
        contaDestinoId: destino.id,
        data: d.data,
        saldoMigrado: saldo.toFixed(2),
        motivo: d.motivo,
        lancamentoId,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });

    return { migracaoId: migracao.id, saldoMigrado: saldo, lancamentoId };
  });
}
