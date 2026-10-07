import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import {
  GRANDEZAS_DO_ALVO,
  MODELO_DO_ALVO,
  PECA_DO_ALVO,
  valorVigente,
  violacoesDoAlvo,
  zAcrescentarItemAoAtoInput,
  zRegistrarAtoDeAlteracaoInput,
  type AcrescentarItemAoAtoInput,
  type AlvoDaAlteracao,
  type ItemDeAlteracaoInput,
  type RegistrarAtoDeAlteracaoInput,
} from "./alteracao.js";

/**
 * M02b — OS SERVIÇOS DA ALTERAÇÃO DA PEÇA (V18/C13).
 *
 * Dois serviços, UMA ação (`ALTERAR_PLANEJAMENTO`): registrar o ato com seus itens, e
 * acrescentar item a um ato já registrado (a mesma lei mexendo em mais uma linha, TR
 * 5.9.3.16). Partir em dois crachás daria ao ente a chance de conceder um sem o outro, o que
 * não significaria nada — mesmo critério do rol de fontes da conta bancária (V16).
 *
 * ═══ ⚠️ O GUARD QUE É A RAZÃO DESTE ARQUIVO ═══
 * O ajuste é gravado AO LADO da linha, então nenhum CHECK da linha é avaliado sobre o valor
 * que o sistema passa a exibir. `violacoesDoAlvo` (domínio) reimpõe os predicados; aqui eles
 * são aplicados ao valor DERIVADO lido DENTRO da transação — como o M03 confere o saldo da
 * dotação pelo SUM real antes de aceitar a anulação, e não por um cache.
 *
 * ⚠️ E O GUARD OLHA DOIS ESTADOS. O final (com todos os atos) e o da DATA DO ATO (só com os
 * atos até ela). Para o caso comum — um ato novo, mais recente que todos — os dois coincidem.
 * Quando alguém registra um ato com data retroativa, eles divergem: o final pode estar
 * positivo e o estado intermediário, negativo. O comparativo sabe cortar por data, então esse
 * estado intermediário é EXIBÍVEL — e exibir uma previsão negativa que o banco recusa na
 * linha seria a mesma falha por outra porta.
 */

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/** A linha planejada, como o guard precisa dela: a peça a que pertence e os valores originais. */
export interface LinhaDoAlvo {
  readonly pecaId: string;
  readonly original: Readonly<Record<string, Money>>;
  /** Como a linha se chama na tela e na mensagem de recusa. */
  readonly rotulo: string;
}

/**
 * LÊ A LINHA PLANEJADA E DESCOBRE A QUE PEÇA ELA PERTENCE.
 *
 * ⚠️ O `switch` É EXAUSTIVO sobre `AlvoDaAlteracao` e o TypeScript cobra: acrescentar um alvo
 * ao rol sem tratá-lo aqui não compila. É o mesmo mecanismo do despacho dos anexos da LDO.
 *
 * ⚠️ A AÇÃO DO PPA CHEGA À PEÇA POR DOIS SALTOS (`acaoPpa -> programaPpa -> plano`), e é por
 * isso que este leitor existe em vez de uma coluna `planoId` na `AlteracaoDeValorPlanejado`:
 * aquela coluna seria uma segunda verdade sobre um vínculo que o schema já tem.
 */
export async function lerLinhaDoAlvo(
  tx: Tx,
  alvo: AlvoDaAlteracao,
  alvoId: string
): Promise<LinhaDoAlvo | null> {
  switch (alvo) {
    case "PREVISAO_RECEITA_PPA": {
      const l = await tx.previsaoReceitaPpa.findUnique({
        where: { id: alvoId },
        select: {
          planoId: true,
          ano: true,
          valor: true,
          naturezaReceita: { select: { codigo: true } },
          fonte: { select: { codigo: true } },
        },
      });
      if (l === null) return null;
      return {
        pecaId: l.planoId,
        original: { valor: toMoney(l.valor.toFixed(2)) },
        rotulo: `previsão de receita ${l.naturezaReceita.codigo} fonte ${l.fonte.codigo} em ${l.ano}`,
      };
    }

    case "PROGRAMA_PPA": {
      const l = await tx.programaPpa.findUnique({
        where: { id: alvoId },
        select: {
          planoId: true,
          valorPrevisto: true,
          programa: { select: { codigo: true, descricao: true } },
        },
      });
      if (l === null) return null;
      return {
        pecaId: l.planoId,
        original: { valorPrevisto: toMoney(l.valorPrevisto.toFixed(2)) },
        rotulo: `programa ${l.programa.codigo} - ${l.programa.descricao}`,
      };
    }

    case "ACAO_PPA": {
      const l = await tx.acaoPpa.findUnique({
        where: { id: alvoId },
        select: {
          metaFinanceira: true,
          acao: { select: { codigo: true, descricao: true } },
          programaPpa: { select: { planoId: true } },
        },
      });
      if (l === null) return null;
      return {
        pecaId: l.programaPpa.planoId,
        original: { metaFinanceira: toMoney(l.metaFinanceira.toFixed(2)) },
        rotulo: `ação ${l.acao.codigo} - ${l.acao.descricao}`,
      };
    }

    case "META_ANUAL_LDO": {
      const l = await tx.metaAnualLdo.findUnique({ where: { id: alvoId } });
      if (l === null) return null;
      const original: Record<string, Money> = {};
      for (const g of GRANDEZAS_DO_ALVO.META_ANUAL_LDO) {
        // ⚠️ O acesso é pelo NOME DA COLUNA, que é exatamente o que a grandeza é. O teste do
        // DMMF garante que cada nome do rol existe no model e é `Decimal` — sem ele, uma
        // grandeza mal escrita daria `undefined` e o guard passaria por vacuidade.
        const bruto = (l as unknown as Record<string, { toFixed: (n: number) => string }>)[g];
        original[g] = toMoney(bruto!.toFixed(2));
      }
      return { pecaId: l.ldoId, original, rotulo: `metas fiscais de ${l.ano}` };
    }
  }
}

/** Os ajustes já gravados para uma linha, com a data do ato de cada um. */
async function ajustesDaLinha(
  tx: Tx,
  alvo: AlvoDaAlteracao,
  alvoId: string
): Promise<readonly { readonly grandeza: string; readonly valor: Money; readonly data: Date }[]> {
  const fk = MODELO_DO_ALVO[alvo].fk;
  const linhas = await tx.alteracaoDeValorPlanejado.findMany({
    where: { [fk]: alvoId } as Record<string, string>,
    select: { grandeza: true, valorAjuste: true, ato: { select: { data: true } } },
  });
  return linhas.map((l) => ({
    grandeza: l.grandeza,
    valor: toMoney(l.valorAjuste.toFixed(2)),
    data: l.ato.data,
  }));
}

/** O item, com o ajuste já convertido. */
interface ItemResolvido {
  readonly alvo: AlvoDaAlteracao;
  readonly alvoId: string;
  readonly grandeza: string;
  readonly valorAjuste: Money;
  readonly justificativa: string | undefined;
}

/**
 * O GUARD COMPLETO DE UM CONJUNTO DE ITENS CONTRA UMA PEÇA.
 *
 * Confere, para cada alvo tocado: que a linha existe, que ela pertence À PEÇA DO ATO, e que
 * o valor derivado não viola o que o banco recusa na linha original — no estado final e no
 * estado da data do ato.
 *
 * ⚠️ OS ITENS DO MESMO ATO SÃO SOMADOS JUNTOS antes de conferir, e não um a um: um ato que
 * acrescente 100 na receita primária e 100 na total é legítimo; conferido item a item, o
 * primeiro seria recusado por exceder a total que o segundo ia levantar. A ordem dos itens
 * dentro de uma lei não é matéria de direito.
 */
async function exigirItensViaveis(
  tx: Tx,
  peca: "PPA" | "LDO",
  pecaId: string,
  data: Date,
  itens: readonly ItemResolvido[]
): Promise<void> {
  const porAlvo = new Map<string, ItemResolvido[]>();
  for (const i of itens) {
    const chave = `${i.alvo}::${i.alvoId}`;
    const lista = porAlvo.get(chave) ?? [];
    lista.push(i);
    porAlvo.set(chave, lista);
  }

  for (const [, doAlvo] of porAlvo) {
    const { alvo, alvoId } = doAlvo[0]!;
    const linha = await lerLinhaDoAlvo(tx, alvo, alvoId);
    if (linha === null) {
      throw new Error(
        `LINHA PLANEJADA NÃO EXISTE: ${alvo} ${alvoId}. Um ato não altera o que não foi ` +
          `aprovado — cadastre a linha na peça antes de alterá-la.`
      );
    }
    if (PECA_DO_ALVO[alvo] !== peca || linha.pecaId !== pecaId) {
      throw new Error(
        `ALVO DE OUTRA PEÇA: a ${linha.rotulo} não pertence ${peca === "PPA" ? "ao PPA" : "à LDO"} ` +
          `que o ato altera. Um ato que alcançasse duas peças produziria um comparativo em ` +
          `que o total de nenhuma delas fecha.`
      );
    }

    const gravados = await ajustesDaLinha(tx, alvo, alvoId);
    const novos = doAlvo.map((i) => ({ grandeza: i.grandeza, valor: i.valorAjuste }));

    // ⚠️ DOIS ESTADOS: o final (todos os atos) e o da DATA deste ato (só os atos até ela).
    // Para um ato mais recente que todos, os dois são o mesmo cálculo.
    const cortes: readonly { readonly nome: string; readonly ate: Date | null }[] = [
      { nome: "estado vigente", ate: null },
      { nome: `estado na data do ato`, ate: data },
    ];

    for (const corte of cortes) {
      const vigente: Record<string, Money> = {};
      for (const g of GRANDEZAS_DO_ALVO[alvo]) {
        const doCorte = gravados
          .filter((a) => a.grandeza === g && (corte.ate === null || a.data <= corte.ate))
          .map((a) => a.valor);
        const dosNovos = novos.filter((n) => n.grandeza === g).map((n) => n.valor);
        vigente[g] = valorVigente(linha.original[g]!, [...doCorte, ...dosNovos]);
      }
      const ruins = violacoesDoAlvo(alvo, vigente);
      if (ruins.length > 0) {
        throw new Error(
          `ALTERAÇÃO RECUSADA na ${linha.rotulo} (${corte.nome}): ${ruins.join(" ")}`
        );
      }
    }
  }
}

function resolver(itens: readonly ItemDeAlteracaoInput[]): readonly ItemResolvido[] {
  return itens.map((i) => ({
    alvo: i.alvo as AlvoDaAlteracao,
    alvoId: i.alvoId,
    grandeza: i.grandeza.trim(),
    valorAjuste: toMoney(i.valorAjuste as never),
    justificativa: i.justificativa?.trim(),
  }));
}

/** O `data` do item, com a FK tipada do alvo preenchida e as outras três nulas. */
function dadosDoItem(i: ItemResolvido, criadoPor: string): Record<string, unknown> {
  const fk = MODELO_DO_ALVO[i.alvo].fk;
  return {
    [fk]: i.alvoId,
    grandeza: i.grandeza,
    valorAjuste: i.valorAjuste.toFixed(2),
    justificativa: i.justificativa ?? null,
    criadoPor,
  };
}

/**
 * REGISTRA O ATO QUE ALTERA A PEÇA, com seus itens, numa transação.
 *
 * ⚠️ O ATO E OS ITENS NASCEM JUNTOS. Um ato sem item é uma lei que altera nada: ela apareceria
 * na consulta cronológica e o operador procuraria o valor que mudou sem achar nenhum. O Zod
 * exige `.min(1)`.
 *
 * ⚠️ NADA DE ESTADO NO ATO. Ele existe, logo valeu; o que o desfaz é outro ato com os ajustes
 * invertidos — a mesma doutrina do estorno no razão e do `DecretoEncerramento` do M03.
 */
export async function registrarAtoDeAlteracaoDoPlanejamento(
  prisma: PrismaClient,
  input: RegistrarAtoDeAlteracaoInput
): Promise<{ readonly atoId: string; readonly itens: number }> {
  const dados = zRegistrarAtoDeAlteracaoInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(
      tx,
      dados.criadoPor,
      ACAO_DO_SERVICO.registrarAtoDeAlteracaoDoPlanejamento,
      "ENTE"
    );

    if (dados.peca === "PPA") {
      const p = await tx.planoPlurianual.findUnique({
        where: { id: dados.pecaId },
        select: { id: true },
      });
      if (p === null) throw new Error(`Plano plurianual ${dados.pecaId} não existe.`);
    } else {
      const l = await tx.leiDiretrizesOrcamentarias.findUnique({
        where: { id: dados.pecaId },
        select: { id: true },
      });
      if (l === null) throw new Error(`LDO ${dados.pecaId} não existe.`);
    }

    const itens = resolver(dados.itens);
    await exigirItensViaveis(tx, dados.peca, dados.pecaId, dados.data, itens);

    const ato = await tx.atoDeAlteracaoDoPlanejamento.create({
      data: {
        planoId: dados.peca === "PPA" ? dados.pecaId : null,
        ldoId: dados.peca === "LDO" ? dados.pecaId : null,
        numero: dados.numero,
        ano: dados.ano,
        data: dados.data,
        dataPublicacao: dados.dataPublicacao,
        fundamento: dados.fundamento,
        criadoPor: dados.criadoPor,
        itens: {
          create: itens.map((i) => dadosDoItem(i, dados.criadoPor)) as never,
        },
      },
      select: { id: true },
    });

    return { atoId: ato.id, itens: itens.length };
  });
}

/**
 * ACRESCENTA UM ITEM a um ato já registrado — a mesma lei alterando mais uma linha.
 *
 * ⚠️ O GUARD É O MESMO, e tem de ser: o item que entra depois soma sobre os que já estão, e
 * sem reconferir o derivado a segunda linha da mesma lei seria a rota que zera o guard da
 * primeira.
 */
export async function acrescentarItemAoAtoDeAlteracao(
  prisma: PrismaClient,
  input: AcrescentarItemAoAtoInput
): Promise<{ readonly itemId: string }> {
  const dados = zAcrescentarItemAoAtoInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(
      tx,
      dados.criadoPor,
      ACAO_DO_SERVICO.acrescentarItemAoAtoDeAlteracao,
      "ENTE"
    );

    const ato = await tx.atoDeAlteracaoDoPlanejamento.findUnique({
      where: { id: dados.atoId },
      select: { id: true, planoId: true, ldoId: true, data: true },
    });
    if (ato === null) throw new Error(`Ato de alteração ${dados.atoId} não existe.`);

    const peca = ato.planoId !== null ? "PPA" : "LDO";
    const pecaId = ato.planoId ?? ato.ldoId!;
    const itens = resolver([dados.item]);
    await exigirItensViaveis(tx, peca, pecaId, ato.data, itens);

    const criado = await tx.alteracaoDeValorPlanejado.create({
      data: { atoId: ato.id, ...dadosDoItem(itens[0]!, dados.criadoPor) } as never,
      select: { id: true },
    });
    return { itemId: criado.id };
  });
}

/**
 * V36 — GRAVA ITENS NUM ATO DE ALTERAÇÃO, DENTRO DA TRANSAÇÃO DE QUEM JÁ AUTORIZOU: a SANÇÃO DA EMENDA ao PPA ou à LDO
 * (`sancionarEmendaAoPlanejamento`, que cobra SANCIONAR_EMENDA_AO_ORCAMENTO). O efeito da sanção é o ato de alteração —
 * pelo MESMO guard de `registrarAtoDeAlteracaoDoPlanejamento` (os dois estados, os itens somados juntos) —, e cobrar
 * aqui ALTERAR_PLANEJAMENTO repetiria o critério que a sanção da LOA já recusou: o ajuste é efeito da sanção, não ato
 * próprio de quem a registra.
 *
 * A lei é a chave: se a peça já tem o ato com este número e ano (outra emenda sancionada pela mesma lei), os itens
 * entram NELE — duas emendas da mesma lei num ato só, como a lei é uma só. A data e a publicação têm de ser as do ato
 * existente; divergir é recusa, não escolha silenciosa de uma das duas.
 */
export async function gravarItensNoAtoDaLei(
  tx: Tx,
  p: {
    readonly peca: "PPA" | "LDO";
    readonly pecaId: string;
    readonly numero: string;
    readonly ano: number;
    readonly data: Date;
    readonly dataPublicacao: Date;
    readonly fundamento: string;
    readonly itens: readonly ItemDeAlteracaoInput[];
    readonly criadoPor: string;
  }
): Promise<{ readonly atoId: string; readonly alteracaoIds: readonly string[] }> {
  if (p.itens.length === 0) throw new Error("A lei não traz item aprovado: não há ato de alteração a gravar.");
  const itens = resolver(p.itens);
  const existente = await tx.atoDeAlteracaoDoPlanejamento.findFirst({
    where: { ...(p.peca === "PPA" ? { planoId: p.pecaId } : { ldoId: p.pecaId }), ano: p.ano, numero: p.numero },
    select: { id: true, data: true, dataPublicacao: true },
  });
  if (existente !== null && (existente.data.getTime() !== p.data.getTime() || existente.dataPublicacao.getTime() !== p.dataPublicacao.getTime())) {
    throw new Error(
      `A lei nº ${p.numero}/${String(p.ano)} já está registrada nesta peça com outra data ou outra publicação. A sanção pela ` +
        `mesma lei tem de usar as datas dela. Nada foi gravado.`
    );
  }
  await exigirItensViaveis(tx, p.peca, p.pecaId, p.data, itens);
  const atoId =
    existente?.id ??
    (
      await tx.atoDeAlteracaoDoPlanejamento.create({
        data: {
          planoId: p.peca === "PPA" ? p.pecaId : null,
          ldoId: p.peca === "LDO" ? p.pecaId : null,
          numero: p.numero,
          ano: p.ano,
          data: p.data,
          dataPublicacao: p.dataPublicacao,
          fundamento: p.fundamento,
          criadoPor: p.criadoPor,
        },
        select: { id: true },
      })
    ).id;
  const alteracaoIds: string[] = [];
  for (const i of itens) {
    const criado = await tx.alteracaoDeValorPlanejado.create({ data: { atoId, ...dadosDoItem(i, p.criadoPor) } as never, select: { id: true } });
    alteracaoIds.push(criado.id);
  }
  return { atoId, alteracaoIds };
}
