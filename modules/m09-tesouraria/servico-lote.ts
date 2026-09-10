import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { toMoney } from "../../packages/contracts/index.js";
import { travar } from "../../packages/locks/index.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import type { Tx } from "../m16-travamento/autorizacao.js";
import { estadoDaOrdem } from "../m05-despesa/ordem-pagamento.js";
import { avaliarOrdem } from "../m06-ordem-cronologica/dominio.js";
import { anexarArquivo } from "../m22-documentos/anexos.js";
import { criarFilaDeAssinatura } from "../m22-documentos/assinatura.js";
import { sha256 } from "./dominio.js";
import {
  conteudoDoBordero,
  estadoDasAssinaturas,
  estadoDoBordero,
  estadoDoLote,
  zCriarLote,
  zGerarBordero,
  zIncluirNoLote,
  zProcessarRetorno,
  type CriarLoteInput,
  type GerarBorderoInput,
  type IncluirNoLoteInput,
  type ProcessarRetornoInput,
} from "./lote.js";

/**
 * M09 — LOTE DE PAGAMENTO, BORDERÔ E RETORNO BANCÁRIO (ENT03, 2.2).
 *
 * ═══ ⚠️ O LOTE NÃO É UM SEGUNDO CAMINHO PARA PAGAR ═══
 * Ele AGRUPA `OrdemDePagamento` (M05) e `MovimentoExtraorcamentario` (M07) que já existem,
 * já foram autorizados e já têm valor, credor e conta. O lote não copia nada disso.
 *
 * A consequência é a que importa: **quem paga continua sendo o M05**. O lote organiza a
 * remessa ao banco; ele não cria uma rota alternativa que escape dos guards do pagamento —
 * e é por isso que a ordem cronológica é conferida AQUI, na inclusão, contra a mesma fila
 * do M06 que o pagamento individual consulta.
 *
 * ═══ ⚠️ ENVIO AO BANCO: INDISPONÍVEL COM MOTIVO, NUNCA SUCESSO LOCAL ═══
 * Não há convênio bancário configurado neste ambiente. `enviarBordero` RECUSA, nomeando —
 * do mesmo jeito que a assinatura qualificada (M22) e o envio ao banco do T07 recusam. Um
 * "enviado" gravado localmente pareceria transmissão na tela, e o dinheiro não teria saído.
 */

// ═══════════════════════════════════════════════════════════════════════════
// CRIAR E COMPOR
// ═══════════════════════════════════════════════════════════════════════════

export async function criarLoteDePagamento(
  prisma: PrismaClient,
  input: CriarLoteInput
): Promise<{ readonly loteId: string; readonly numero: number }> {
  const d = zCriarLote.parse(input);

  return prisma.$transaction(async (tx) => {
    const conta = await tx.contaBancaria.findUnique({
      where: { id: d.contaBancariaId },
      select: { id: true, fonte: { select: { id: true } } },
    });
    if (conta === null) {
      throw new Error(`Conta bancária ${d.contaBancariaId} não existe. Nada foi gravado.`);
    }

    const exercicio = await tx.exercicio.findUnique({
      where: { ano: d.exercicio },
      select: { id: true, encerramento: { select: { id: true } } },
    });
    if (exercicio === null) {
      throw new Error(`Exercício ${d.exercicio} não existe. Nada foi gravado.`);
    }
    if (exercicio.encerramento !== null) {
      throw new Error(
        `Exercício ${d.exercicio} está ENCERRADO — não se compõe lote de pagamento nele. ` +
          `Nada foi gravado.`
      );
    }

    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.criarLoteDePagamento, "ENTE");

    // ⚠️ O TRINCO É SOBRE O EXERCÍCIO, e a corrida é a de NÚMERO — a mesma do protocolo
    // (M21) e do comunicado (M23). Duas criações concorrentes leem `MAX(numero)` no mesmo
    // estado, calculam o mesmo próximo, e as duas gravam.
    await travar(tx, "SequenciaDeLoteDePagamento", [exercicio.id]);

    const ultimo = await tx.loteDePagamento.findFirst({
      where: { exercicioId: exercicio.id },
      select: { numero: true },
      orderBy: { numero: "desc" },
    });
    const numero = (ultimo?.numero ?? 0) + 1;

    const lote = await tx.loteDePagamento.create({
      data: {
        exercicioId: exercicio.id,
        numero,
        dataVencimento: d.dataVencimento,
        contaBancariaId: d.contaBancariaId,
        descricao: d.descricao,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });

    return { loteId: lote.id, numero };
  });
}

/** Carrega o lote com o que os guards precisam. */
async function carregarLote(tx: Tx, loteId: string) {
  const lote = await tx.loteDePagamento.findUnique({
    where: { id: loteId },
    select: {
      id: true,
      numero: true,
      dataVencimento: true,
      contaBancariaId: true,
      contaBancaria: { select: { codigo: true, fonteId: true } },
      movimentos: { select: { tipo: true, criadoEm: true } },
      borderos: { select: { id: true } },
    },
  });
  if (lote === null) {
    throw new Error(`Lote ${loteId} não existe. Nada foi gravado.`);
  }
  return lote;
}

/**
 * INCLUI UMA ORDEM (ou uma nota extra) NO LOTE.
 *
 * ⚠️ AQUI ESTÃO OS GUARDS QUE O LOTE PODERIA TER CONTORNADO — e é por isso que eles estão
 * no caso de uso, dentro da transação, e não na tela:
 *
 *   1. o lote tem de estar ABERTO;
 *   2. a ordem tem de estar AUTORIZADA (o estado é derivado, `estadoDaOrdem`);
 *   3. a conta da ordem tem de ser a do LOTE — senão o borderô iria a dois bancos;
 *   4. **a ordem cronológica do art. 141** é conferida contra a MESMA fila do M06 que o
 *      pagamento individual consulta.
 *
 * O guard 4 é o teste 4 do lote ("rota alternativa não contorna"). A caracterização
 * (`docs/caracterizacao/01-financeiro.md`, 3.4) registrou que `avaliarOrdem` **relata** e
 * não bloqueia: quem bloqueia é quem chama. Este é o "quem chama".
 */
export async function incluirNoLote(
  prisma: PrismaClient,
  input: IncluirNoLoteInput
): Promise<{ readonly itemId: string }> {
  const d = zIncluirNoLote.parse(input);

  return prisma.$transaction(async (tx) => {
    const lote = await carregarLote(tx, d.loteId);
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.incluirNoLote, "ENTE");

    const estado = estadoDoLote(lote.movimentos);
    if (estado !== "ABERTO") {
      throw new Error(
        `O lote ${lote.numero} está ${estado} — não se acrescenta item a ele. ` +
          `Reabra-o antes, se ainda não houver borderô. Nada foi gravado.`
      );
    }

    if (d.ordemId !== undefined) {
      await exigirOrdemElegivel(tx, lote, d.ordemId);
    } else {
      await exigirNotaElegivel(tx, lote, d.movimentoExtraId as string);
    }

    const item = await tx.itemDoLote.create({
      data: {
        loteId: d.loteId,
        ordemId: d.ordemId ?? null,
        movimentoExtraId: d.movimentoExtraId ?? null,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { itemId: item.id };
  });
}

async function exigirOrdemElegivel(
  tx: Tx,
  lote: Awaited<ReturnType<typeof carregarLote>>,
  ordemId: string
): Promise<void> {
  const ordem = await tx.ordemDePagamento.findUnique({
    where: { id: ordemId },
    select: {
      id: true,
      numero: true,
      valor: true,
      contaBancaria: true,
      liquidacaoId: true,
      movimentos: { select: { tipo: true, criadoEm: true } },
      pagamentos: { select: { id: true } },
    },
  });
  if (ordem === null) {
    throw new Error(`Ordem de pagamento ${ordemId} não existe. Nada foi gravado.`);
  }

  const estadoOrdem = estadoDaOrdem(ordem.movimentos, ordem.pagamentos.length > 0);
  if (estadoOrdem !== "AUTORIZADA") {
    throw new Error(
      `A ordem ${ordem.numero} está ${estadoOrdem} — só ordem AUTORIZADA entra em lote. ` +
        `Incluir uma ordem preparada faria o banco pagar o que ninguém autorizou. ` +
        `Nada foi gravado.`
    );
  }

  // ⚠️ A CONTA DO ITEM TEM DE SER A DO LOTE. `OrdemDePagamento.contaBancaria` é o CÓDIGO
  // (texto), não a FK — ver o schema do M05.
  if (ordem.contaBancaria !== lote.contaBancaria.codigo) {
    throw new Error(
      `A ordem ${ordem.numero} sai da conta ${ordem.contaBancaria} e o lote ${lote.numero} ` +
        `paga pela ${lote.contaBancaria.codigo}. Um lote com duas contas viraria dois ` +
        `borderôs, para dois bancos. Nada foi gravado.`
    );
  }

  await exigirOrdemCronologica(tx, ordem.liquidacaoId, ordem.numero);
}

/**
 * ⚠️ A ORDEM CRONOLÓGICA (art. 141) — CONFERIDA NA INCLUSÃO, contra a fila real.
 *
 * A fila é por (fonte, categoria), como no M06: a exigibilidade se compara entre iguais.
 * Só liquidações com saldo a pagar entram — quem já foi quitada saiu da fila.
 *
 * ⚠️ E PAGAMENTO PARCIAL NÃO TIRA DA FILA: a liquidação parcialmente paga continua na
 * posição da data ORIGINAL. Se saísse, bastaria pagar R$ 0,01 a cada credor para desmontar
 * a ordem inteira. É a regra que o M06 já registra, aplicada aqui.
 */
async function exigirOrdemCronologica(
  tx: Tx,
  liquidacaoId: string,
  numeroOrdem: string
): Promise<void> {
  const alvo = await tx.liquidacao.findUnique({
    where: { id: liquidacaoId },
    select: {
      id: true,
      numero: true,
      data: true,
      valor: true,
      empenho: {
        select: { fichaId: true, categoriaOrdemCronologica: true, ficha: { select: { fonteId: true } } },
      },
      pagamentos: { select: { valor: true, estornoDeId: true } },
    },
  });
  if (alvo === null) {
    throw new Error(`Liquidação ${liquidacaoId} não existe. Nada foi gravado.`);
  }

  const fonteId = alvo.empenho.ficha.fonteId;
  const categoria = alvo.empenho.categoriaOrdemCronologica;

  const candidatas = await tx.liquidacao.findMany({
    where: {
      empenho: {
        categoriaOrdemCronologica: categoria,
        ficha: { fonteId },
      },
      estornoDeId: null,
    },
    select: {
      id: true,
      numero: true,
      data: true,
      valor: true,
      pagamentos: { select: { valor: true, estornoDeId: true } },
      ordensDePagamento: {
        select: {
          itemDeLote: {
            select: { lote: { select: { movimentos: { select: { tipo: true, criadoEm: true } } } } },
          },
        },
      },
    },
  });

  // ⚠️ O QUE JÁ ESTÁ NUM LOTE VIGENTE SAI DA FILA — e este guard nasceu errado sem isso.
  //
  // A primeira versão não considerava os itens já incluídos, e o efeito era um lote
  // IMPOSSÍVEL DE COMPOR: incluída a liquidação de 01/03, a de 02/03 era recusada por
  // "quebra de ordem" — porque a primeira continuava com saldo a pagar (incluir no lote
  // não paga). Duas liquidações da mesma fonte nunca caberiam na mesma remessa, que é
  // exatamente o caso comum.
  //
  // O art. 141 protege quem está sendo PRETERIDO. Uma liquidação já comprometida na mesma
  // remessa não está sendo preterida — ela vai ser paga junto. Quem sai da fila é ela; quem
  // continua é a que ninguém pôs em lote nenhum.
  //
  // ⚠️ E LOTE CANCELADO NÃO CONTA. Um lote cancelado libera os seus itens de volta para a
  // fila — senão bastaria criar um lote, cancelá-lo, e a liquidação antiga ficaria fora da
  // fila para sempre, abrindo a porta que o guard existe para fechar.
  const emLoteVigente = new Set(
    candidatas
      .filter((l) =>
        l.ordensDePagamento.some((o) => {
          const movimentos = o.itemDeLote?.lote.movimentos;
          return movimentos !== undefined && estadoDoLote(movimentos) !== "CANCELADO";
        })
      )
      .map((l) => l.id)
  );

  const fila = candidatas
    .map((l) => {
      const pago = l.pagamentos
        .filter((p) => p.estornoDeId === null)
        .reduce((s, p) => s.plus(toMoney(p.valor.toFixed(2))), toMoney("0.00"));
      const saldo = toMoney(l.valor.toFixed(2)).minus(pago);
      return {
        liquidacaoId: l.id,
        numero: l.numero,
        dataLiquidacao: l.data,
        fonteId,
        categoria,
        saldoAPagar: saldo,
      };
    })
    .filter((l) => l.saldoAPagar.greaterThan(toMoney("0.00")))
    .filter((l) => !emLoteVigente.has(l.liquidacaoId));

  const r = avaliarOrdem(fila, liquidacaoId);
  if (!r.ehCabecaDaFila && r.preterida !== null) {
    throw new Error(
      `QUEBRA DA ORDEM CRONOLÓGICA (art. 141): a ordem ${numeroOrdem} é a ${r.posicao}ª da ` +
        `fila, e a liquidação ${r.preterida.numero} (de ` +
        `${r.preterida.dataLiquidacao.toISOString().slice(0, 10)}) está na frente, na mesma ` +
        `fonte e categoria.\n\n` +
        `Incluí-la no lote pagaria antes de quem tem exigibilidade anterior — e o lote não ` +
        `é uma rota alternativa à regra: ele passa pelo MESMO guard do pagamento ` +
        `individual. Pague a fila em ordem, ou registre a quebra pelo caminho do §1º, com ` +
        `justificativa. Nada foi gravado.`
    );
  }
}

async function exigirNotaElegivel(
  tx: Tx,
  lote: Awaited<ReturnType<typeof carregarLote>>,
  movimentoExtraId: string
): Promise<void> {
  const nota = await tx.movimentoExtraorcamentario.findUnique({
    where: { id: movimentoExtraId },
    select: {
      id: true,
      tipo: true,
      contaBancariaId: true,
      estornoDeId: true,
      estornos: { select: { id: true } },
    },
  });
  if (nota === null) {
    throw new Error(`Nota extraorçamentária ${movimentoExtraId} não existe. Nada foi gravado.`);
  }
  if (nota.contaBancariaId !== lote.contaBancariaId) {
    throw new Error(
      `A nota extraorçamentária sai de outra conta bancária que não a do lote ` +
        `${lote.numero}. Nada foi gravado.`
    );
  }
  if (nota.estornos.length > 0) {
    throw new Error(
      `A nota extraorçamentária já foi estornada — ela não representa mais uma saída de ` +
        `caixa. Nada foi gravado.`
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FECHAR
// ═══════════════════════════════════════════════════════════════════════════

export async function fecharLote(
  prisma: PrismaClient,
  input: { readonly loteId: string; readonly criadoPor: string }
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const lote = await carregarLote(tx, input.loteId);
    await autorizarNo(tx, input.criadoPor, ACAO_DO_SERVICO.fecharLote, "ENTE");

    if (estadoDoLote(lote.movimentos) !== "ABERTO") {
      throw new Error(`O lote ${lote.numero} não está aberto. Nada foi gravado.`);
    }
    const itens = await tx.itemDoLote.count({ where: { loteId: input.loteId } });
    if (itens === 0) {
      // ⚠️ LOTE VAZIO NÃO FECHA. Um borderô sem linha nenhuma seria transmitido ao banco
      // como remessa válida, e o operador só descobriria pelo extrato que não veio nada.
      throw new Error(
        `O lote ${lote.numero} não tem item nenhum — não há o que pagar. Nada foi gravado.`
      );
    }

    await tx.movimentoDoLote.create({
      data: {
        loteId: input.loteId,
        tipo: "FECHADO",
        motivo: `Fechado com ${itens} item(ns).`,
        criadoPor: input.criadoPor,
      },
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// BORDERÔ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GERA O BORDERÔ — e ele nasce com a FILA DE ASSINATURAS do M22 já montada.
 *
 * ⚠️ SEM SIGNATÁRIO, NÃO SE GERA. O `zGerarBordero` exige `min(1)`, e a razão está em
 * `estadoDasAssinaturas`: `[].every(...)` é `true` em JavaScript, então uma fila vazia
 * passaria por "todas as assinaturas colhidas" e o borderô seria enviado. É o teste 5 do
 * lote — "borderô sem as assinaturas exigidas não é gerado nem enviado" —, e o "nem
 * gerado" é esta linha.
 *
 * ⚠️ O HASH É CARIMBADO NA GERAÇÃO. Ele é do conteúdo canônico (ordenado, determinístico);
 * é o que prova depois que o documento assinado é o mesmo que foi enviado.
 */
export async function gerarBordero(
  prisma: PrismaClient,
  input: GerarBorderoInput
): Promise<{ readonly borderoId: string; readonly numero: number; readonly hash: string }> {
  const d = zGerarBordero.parse(input);

  const { borderoId, numero, hash, descricao, conteudo } = await prisma.$transaction(async (tx) => {
    const lote = await carregarLote(tx, d.loteId);
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.gerarBordero, "ENTE");

    if (estadoDoLote(lote.movimentos) !== "FECHADO") {
      throw new Error(
        `O lote ${lote.numero} não está FECHADO — só um lote fechado gera borderô. Um lote ` +
          `aberto ainda pode mudar de composição, e o hash carimbado no documento deixaria ` +
          `de valer sem que ninguém percebesse. Nada foi gravado.`
      );
    }
    if (lote.borderos.length > 0) {
      throw new Error(
        `O lote ${lote.numero} já tem borderô. Gerar um segundo enviaria os mesmos ` +
          `pagamentos ao banco duas vezes. Nada foi gravado.`
      );
    }

    const itens = await tx.itemDoLote.findMany({
      where: { loteId: d.loteId },
      select: {
        id: true,
        ordem: { select: { numero: true, valor: true, liquidacao: { select: { empenho: { select: { credorCpfCnpj: true } } } } } },
        movimentoExtra: { select: { valor: true, credorConsignatario: true } },
      },
    });

    const conteudo = conteudoDoBordero({
      numero: lote.numero,
      dataVencimento: lote.dataVencimento,
      contaBancaria: lote.contaBancaria.codigo,
      linhas: itens.map((i) => ({
        ordemOuNota: i.ordem?.numero ?? `EXTRA-${i.id.slice(-8)}`,
        favorecido:
          i.ordem?.liquidacao.empenho.credorCpfCnpj ??
          i.movimentoExtra?.credorConsignatario ??
          "(sem favorecido)",
        valor: toMoney((i.ordem?.valor ?? i.movimentoExtra?.valor)?.toFixed(2) ?? "0.00"),
      })),
    });

    const hashConteudo = sha256(conteudo);

    const b = await tx.bordero.create({
      data: {
        loteId: d.loteId,
        numero: lote.numero,
        hashConteudo,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });

    return {
      borderoId: b.id,
      numero: lote.numero,
      hash: hashConteudo,
      conteudo,
      descricao: `Borderô ${lote.numero} — ${itens.length} pagamento(s), conta ${lote.contaBancaria.codigo}`,
    };
  });

  // ⚠️ O DOCUMENTO E A FILA NASCEM FORA DA TRANSAÇÃO DO BORDERÔ, e de propósito:
  // `anexarArquivo` e `criarFilaDeAssinatura` abrem as suas próprias (`prisma.$transaction`),
  // e aninhar transações do Prisma não compõe — a de dentro não participa da de fora, e um
  // rollback externo deixaria as duas órfãs.
  //
  // A ordem escolhida é a que falha de forma segura: se qualquer um dos dois falhar, sobra
  // um borderô SEM fila — e `enviarBordero` recusa exatamente esse caso ("fila ausente"),
  // com mensagem. O contrário (fila sem borderô) deixaria um documento assinável apontando
  // para nada.
  //
  // ⚠️ O BORDERÔ VIRA UM DOCUMENTO DE VERDADE, e não um registro abstrato. O texto canônico
  // — o mesmo de que saiu o `hashConteudo` — é gravado como `Anexo` de origem SISTEMA. Três
  // coisas vêm de graça com isso, e nenhuma delas precisou de código novo: ele é baixável
  // pela rota do ENT02 com autorização por registro, é assinável pela fila do M22, e a
  // conferência de integridade do `lerArquivo` passa a valer para ele.
  //
  // A alternativa era afrouxar a fila para aceitar assinatura sem anexo. Seria pior: o
  // `hashConteudo` de uma assinatura só significa alguma coisa se houver conteúdo a que ele
  // corresponda — uma fila sem anexo produziria assinaturas sobre o nada.
  const documento = await anexarArquivo(prisma, {
    nomeOriginal: `bordero-${numero}.txt`,
    mimeType: "text/plain",
    conteudo: new TextEncoder().encode(conteudo),
    origem: "SISTEMA",
    borderoId,
    criadoPor: d.criadoPor,
  });

  const fila = await criarFilaDeAssinatura(prisma, {
    descricao,
    modo: d.modo,
    anexoId: documento.anexoId,
    signatarios: d.signatarios,
    criadoPor: d.criadoPor,
  });

  await prisma.bordero.update({
    where: { id: borderoId },
    data: { filaAssinaturaId: fila.filaId },
  });

  return { borderoId, numero, hash };
}

/**
 * O ENVIO AO BANCO — **INDISPONÍVEL**, com motivo.
 *
 * ⚠️ ELE CONFERE AS ASSINATURAS PRIMEIRO, e não por acaso.
 *
 * Um "indisponível" que aparecesse ANTES da conferência esconderia o defeito de assinatura:
 * no dia em que o convênio existisse, o borderô sem assinatura seria transmitido e ninguém
 * teria testado o guard. Conferindo primeiro, o teste 5 do lote continua exercitando a
 * regra de verdade, e o motivo do bloqueio de transmissão é o último a aparecer.
 */
export async function enviarBordero(
  prisma: PrismaClient,
  input: { readonly borderoId: string; readonly criadoPor: string }
): Promise<never> {
  const b = await prisma.bordero.findUnique({
    where: { id: input.borderoId },
    select: {
      numero: true,
      movimentos: { select: { tipo: true, criadoEm: true } },
      filaAssinatura: {
        select: {
          signatarios: {
            select: {
              ordem: true,
              usuarioIdent: true,
              assinatura: { select: { criadoEm: true } },
            },
          },
        },
      },
    },
  });
  if (b === null) {
    throw new Error(`Borderô ${input.borderoId} não existe.`);
  }

  const estado = estadoDoBordero(b.movimentos);
  if (estado !== "GERADO") {
    throw new Error(`O borderô ${b.numero} está ${estado} — não se envia de novo.`);
  }

  if (b.filaAssinatura === null) {
    throw new Error(
      `O borderô ${b.numero} não tem fila de assinaturas. Ele não pode ser enviado: ` +
        `nenhuma assinatura foi exigida, e um documento que ninguém assinou não autoriza ` +
        `saída de dinheiro.`
    );
  }

  const assin = estadoDasAssinaturas(
    b.filaAssinatura.signatarios.map((s) => ({
      ordem: s.ordem,
      usuarioIdent: s.usuarioIdent,
      assinouEm: s.assinatura?.criadoEm ?? null,
    }))
  );

  if (!assin.completa) {
    throw new Error(
      `BORDERÔ SEM AS ASSINATURAS EXIGIDAS: ${assin.colhidas} de ${assin.exigidas} ` +
        `colhida(s). Faltam: ${assin.faltam.join(", ")}.\n\n` +
        `O documento só se conclui com TODOS os signatários configurados — assinatura ` +
        `parcial mantém o estado pendente. Nada foi enviado.`
    );
  }

  // ⚠️ INDISPONÍVEL, NUNCA "ENVIADO" LOCALMENTE. Ver o cabeçalho do módulo: um sucesso
  // gravado aqui apareceria na tela como transmissão, e o dinheiro não teria saído.
  throw new Error(
    `TRANSMISSÃO AO BANCO INDISPONÍVEL: nenhum convênio bancário está configurado neste ` +
      `ambiente.\n\n` +
      `O borderô ${b.numero} está íntegro e com as ${assin.exigidas} assinaturas colhidas — ` +
      `o que falta é o canal. Gravar "ENVIADO" sem transmitir seria pior que recusar: a ` +
      `tela diria que o pagamento foi ao banco, e o extrato do dia seguinte não teria nada.\n\n` +
      `Pendência declarada: BORDERO-CONVENIO-BANCARIO.`
  );
}

/**
 * O RETORNO DO BANCO — baixa SOMENTE os itens correspondentes, e o repetido não duplica.
 *
 * ⚠️ A IDEMPOTÊNCIA É DO BANCO, não de um `if`. `BaixaDeRetornoBancario` tem
 * `@@unique([itemId])`: reprocessar o mesmo arquivo encontra a linha já lá e a pula.
 * Um `if (jaBaixado)` lido antes do insert perderia a corrida entre dois processamentos
 * simultâneos — os dois leriam "não baixado" e os dois gravariam.
 *
 * ⚠️ E ITEM DE OUTRO BORDERÔ É RECUSADO. Um retorno que baixasse item alheio marcaria como
 * pago o que o banco não liquidou — o teste 6 do lote.
 */
export async function processarRetornoBancario(
  prisma: PrismaClient,
  input: ProcessarRetornoInput
): Promise<{ readonly baixados: number; readonly jaBaixados: number }> {
  const d = zProcessarRetorno.parse(input);

  return prisma.$transaction(async (tx) => {
    const b = await tx.bordero.findUnique({
      where: { id: d.borderoId },
      select: {
        id: true,
        numero: true,
        loteId: true,
        movimentos: { select: { tipo: true, criadoEm: true } },
      },
    });
    if (b === null) {
      throw new Error(`Borderô ${d.borderoId} não existe. Nada foi gravado.`);
    }
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.processarRetornoBancario, "ENTE");

    if (estadoDoBordero(b.movimentos) === "CANCELADO") {
      throw new Error(
        `O borderô ${b.numero} está CANCELADO — um retorno não baixa pagamento de remessa ` +
          `cancelada. Nada foi gravado.`
      );
    }

    const doLote = new Set(
      (
        await tx.itemDoLote.findMany({
          where: { loteId: b.loteId },
          select: { id: true },
        })
      ).map((i) => i.id)
    );

    const forasteiros = d.linhas.filter((l) => !doLote.has(l.itemId));
    if (forasteiros.length > 0) {
      throw new Error(
        `O retorno traz ${forasteiros.length} item(ns) que NÃO pertencem ao borderô ` +
          `${b.numero}: ${forasteiros.map((f) => f.itemId).join(", ")}.\n\n` +
          `Baixá-los marcaria como pago o que este banco não liquidou. Nada foi gravado.`
      );
    }

    const jaBaixados = new Set(
      (
        await tx.baixaDeRetornoBancario.findMany({
          where: { itemId: { in: d.linhas.map((l) => l.itemId) } },
          select: { itemId: true },
        })
      ).map((x) => x.itemId)
    );

    const novas = d.linhas.filter((l) => !jaBaixados.has(l.itemId));
    if (novas.length > 0) {
      await tx.baixaDeRetornoBancario.createMany({
        data: novas.map((l) => ({
          borderoId: d.borderoId,
          itemId: l.itemId,
          dataLiquidacaoBanco: l.dataLiquidacaoBanco,
          identificadorBanco: l.identificadorBanco,
          criadoPor: d.criadoPor,
        })),
      });

      await tx.movimentoDoBordero.create({
        data: {
          borderoId: d.borderoId,
          tipo: "RETORNO_PROCESSADO",
          motivo: `Retorno processado: ${novas.length} baixa(s).`,
          criadoPor: d.criadoPor,
        },
      });
    }

    return { baixados: novas.length, jaBaixados: jaBaixados.size };
  });
}
