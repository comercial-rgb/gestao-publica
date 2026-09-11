import { toMoney } from "../../packages/contracts/index.js";
import { diaCivil, fimDoDiaCivil, somarDiasCivis } from "../../packages/datas/index.js";
import {
  posicaoDeEstoque,
  saldoNaoAtendido,
  type TipoMovimentoFisicoEstoque,
} from "../../modules/m10-patrimonial/estoque-fisico-dominio.js";
import { cliente } from "./cliente";
import { exigirSessao } from "./sessao";

/**
 * ⚠️ O TETO DAS CONTAGENS DERIVADAS. As faixas que precisam DERIVAR (saldo a atender, lote
 * com saldo) não podem ser um `count` no banco — a resposta não é uma coluna. Trazer 300
 * linhas para contar é barato; trazer todas as de um ente que opera há cinco anos não é.
 * O critério na tela diz que o corte existe, em vez de o número redondo o esconder.
 */
const TETO_DA_CONTAGEM = 300;

/**
 * ═══ AS PENDÊNCIAS DO USUÁRIO — O QUE ESPERA POR ELE, E SÓ POR ELE ═══
 *
 * ⚠️ ESTE ARQUIVO NÃO INVENTA INDICADOR. Toda linha abaixo é uma CONTAGEM sobre registro
 * que já existe no banco, com o `where` que a define. Não há contador estático, não há
 * número semeado, e um painel que ainda não tem origem **não aparece** — a regra do lote,
 * e a mesma que fez a home ter um traço em vez de um zero bonito quando a porta falha.
 *
 * ⚠️ A PERGUNTA É "ESPERA POR MIM?", NÃO "EXISTE NO SISTEMA?". Um painel que contasse todas
 * as assinaturas pendentes do ente diria ao tesoureiro que há 40 documentos na fila — e
 * nenhum deles seria dele. O recorte é sempre o `identificador` da sessão.
 *
 * ⚠️ E CADA CONTAGEM É INDEPENDENTE. Se uma consulta falhar (tabela vazia, banco fora), o
 * painel daquela linha some e os outros continuam — a mesma escolha da home. Um painel de
 * pendências que derruba a tela inteira faz o operador perder também o que estava certo.
 */

export interface Pendencia {
  readonly chave: string;
  readonly rotulo: string;
  readonly quantidade: number;
  readonly href: string;
  /** O que exatamente foi contado — vai para a tela, como legenda. */
  readonly criterio: string;
}

/**
 * ASSINATURAS NA FILA — as que esperam a MINHA assinatura.
 *
 * ⚠️ "PENDENTE" É DERIVADO DA AUSÊNCIA DA ASSINATURA, não de uma coluna de estado. O
 * `SignatarioDaFila` ganha uma `AssinaturaDeDocumento` quando assina (INSERT, nunca
 * UPDATE — ver o comentário do M22). Sem a assinatura, está pendente. Uma coluna
 * `assinado` seria a segunda verdade sobre o mesmo fato.
 */
async function assinaturasNaFila(identificador: string): Promise<Pendencia> {
  const prisma = cliente();
  const quantidade = await prisma.signatarioDaFila.count({
    where: { usuarioIdent: identificador, assinatura: { is: null } },
  });
  return {
    chave: "assinaturas",
    rotulo: "Assinaturas na fila",
    quantidade,
    href: "/documentos",
    criterio: "documentos em que você é signatário e ainda não assinou",
  };
}

/**
 * PARECERES QUE ESPERAM RESPOSTA MINHA.
 *
 * ⚠️ RESPONDIDO É DERIVADO DE `respostas`, a back-relation do `respondeAId`. Um
 * `PARECER_SOLICITADO` sem nenhuma resposta apontando para ele continua aberto. É a mesma
 * anatomia da assinatura: o fato novo aponta para o antigo, e o antigo nunca é reescrito.
 *
 * ⚠️ E O MOVIMENTO TORNADO SEM EFEITO NÃO CONTA. Ele existe (append-only), mas foi anulado
 * — cobrar resposta de um pedido anulado mandaria o servidor trabalhar por nada.
 */
async function pareceresAguardando(identificador: string): Promise<Pendencia> {
  const prisma = cliente();
  const quantidade = await prisma.movimentoDoProcesso.count({
    where: {
      tipo: "PARECER_SOLICITADO",
      usuarioDestino: identificador,
      respostas: { none: {} },
      anuladoPor: { is: null },
    },
  });
  return {
    chave: "pareceres",
    rotulo: "Pareceres aguardando você",
    quantidade,
    href: "/protocolo",
    criterio: "pedidos de parecer dirigidos a você, sem resposta e não anulados",
  };
}

/**
 * CONCILIAÇÕES BANCÁRIAS ABERTAS.
 *
 * ⚠️ ABERTA É A ÚLTIMA DA CADEIA. A conciliação encadeia (`anteriorId`/`seguinte`): a que
 * não tem seguinte é a corrente. Contar todas diria "12 conciliações abertas" num ente que
 * concilia há um ano e está em dia.
 *
 * ⚠️ ESTA NÃO É POR USUÁRIO, e está dito na tela. Conciliação é do ente, não de quem a
 * abriu; esconder a de outro faria o substituto de férias não ver o que precisa fechar.
 */
async function conciliacoesAbertas(): Promise<Pendencia> {
  const prisma = cliente();
  const quantidade = await prisma.conciliacaoBancaria.count({
    where: { seguinte: { is: null } },
  });
  return {
    chave: "conciliacoes",
    rotulo: "Conciliações em aberto",
    quantidade,
    href: "/financeiro/conciliacao",
    criterio: "a conciliação corrente de cada conta (a última da cadeia), do ente inteiro",
  };
}

/**
 * ═══ ⚠️ AS FAIXAS DO ALMOXARIFADO E DO PATRIMÔNIO (ENT06) ═══
 *
 * Todas são CONTAGEM sobre registro que já existe, com o `where` que as define. Nenhuma é
 * indicador novo, nenhuma tem número semeado, e nenhuma inventa um estado que o modelo não
 * guarda.
 *
 * ⚠️ E TRÊS DELAS NÃO SÃO POR USUÁRIO, como a conciliação já não era — e está dito no
 * critério que vai para a tela. Inventário aberto, bem sem responsável e lote vencendo são
 * do ENTE: esconder o inventário que outro abriu faria o substituto de férias não ver o
 * depósito que está bloqueado por causa dele.
 */

/**
 * REQUISIÇÕES COM SALDO A ATENDER.
 *
 * ⚠️ "COM SALDO" É DERIVADO, e por isso esta contagem NÃO é um `count` com `where`. O que
 * falta atender é a diferença entre o solicitado e as saídas vinculadas ao item — não há
 * coluna `quantidadeAtendida`, de propósito (ela poderia divergir das saídas no primeiro
 * estorno). Então a conta é feita item a item, em memória, sobre a MESMA função pura que a
 * tela usa. Um `count` que fingisse saber a resposta precisaria da coluna que o ENT05
 * recusou.
 *
 * ⚠️ O TETO É DELIBERADO. Trazer 300 requisições para contar é barato; trazer todas as de
 * um ente que requisita há cinco anos não é. A faixa diz "pelo menos N" quando bate no teto
 * — e dizer "pelo menos" é mais honesto do que um número redondo que esconde o corte.
 */
async function requisicoesComSaldo(): Promise<Pendencia> {
  const prisma = cliente();
  const abertas = await prisma.requisicaoDeMaterial.findMany({
    select: {
      id: true,
      itens: {
        select: {
          quantidadeSolicitada: true,
          atendimentos: { select: { tipo: true, quantidade: true } },
        },
      },
    },
    orderBy: { dataRequisicao: "desc" },
    take: TETO_DA_CONTAGEM,
  });

  const quantidade = abertas.filter((r) =>
    r.itens.some((i) =>
      saldoNaoAtendido(
        toMoney(i.quantidadeSolicitada.toFixed(4)),
        i.atendimentos.map((a) => ({
          tipo: a.tipo as TipoMovimentoFisicoEstoque,
          quantidade: toMoney(a.quantidade.toFixed(4)),
        }))
      ).greaterThan(0)
    )
  ).length;

  return {
    chave: "requisicoes-de-material",
    rotulo: "Requisições aguardando atendimento",
    quantidade,
    href: "/patrimonio/almoxarifado/requisicoes?pendentes=PENDENTES",
    criterio:
      "requisições em que algum item ainda não foi totalmente entregue — do ente inteiro, " +
      `entre as ${TETO_DA_CONTAGEM} mais recentes`,
  };
}

/**
 * INVENTÁRIOS DE ESTOQUE ABERTOS — e cada um BLOQUEIA um depósito.
 *
 * ⚠️ NÃO É "QUANTOS INVENTÁRIOS EXISTEM": é quantos estão sem data de fechamento. Enquanto
 * um está aberto, entrada, saída e transferência daquele depósito são recusadas — então
 * esta faixa não é informativa, é operacional.
 */
async function inventariosDeEstoqueAbertos(): Promise<Pendencia> {
  const quantidade = await cliente().inventarioDeEstoque.count({
    where: { dataFechamento: null },
  });
  return {
    chave: "inventarios-de-estoque",
    rotulo: "Inventários de estoque abertos",
    quantidade,
    href: "/patrimonio/almoxarifado/inventarios?situacao=ABERTO",
    criterio:
      "inventários sem data de fechamento — cada um BLOQUEIA a movimentação do seu depósito",
  };
}

/**
 * INVENTÁRIOS DE BENS ABERTOS.
 *
 * ⚠️ ELE NÃO BLOQUEIA NADA, e por isso o critério é diferente do de estoque. O inventário
 * patrimonial convive com a movimentação: o que ele espera é a contagem e o fechamento.
 */
async function inventariosDeBensAbertos(): Promise<Pendencia> {
  const quantidade = await cliente().inventarioDeBens.count({
    where: { dataFechamento: null },
  });
  return {
    chave: "inventarios-de-bens",
    rotulo: "Inventários de bens abertos",
    quantidade,
    href: "/patrimonio/bens",
    criterio: "inventários patrimoniais sem data de fechamento, aguardando contagem ou termo",
  };
}

/**
 * BENS SEM RESPONSÁVEL DESIGNADO.
 *
 * ⚠️ "SEM RESPONSÁVEL" É DERIVADO DO ÚLTIMO MOVIMENTO DE GESTÃO, e não de uma coluna. O
 * responsável de um bem é quem o último movimento do tipo RESPONSAVEL nomeou — é isso que
 * torna a pergunta "quem respondia por este bem em março" possível de responder. Um bem sem
 * nenhum movimento desse tipo nunca teve responsável designado.
 *
 * ⚠️ O `none` É O CORTE CERTO, e o `some` seria o errado: um bem cujo responsável foi
 * designado e depois o movimento estornado continuaria aparecendo como tendo responsável.
 * Por isso a contagem exige que não haja NENHUM movimento de responsável vigente — estorno
 * inclusive.
 */
async function bensSemResponsavel(): Promise<Pendencia> {
  const quantidade = await cliente().bemPatrimonial.count({
    where: { movimentosDeGestao: { none: { tipo: "RESPONSAVEL" } } },
  });
  return {
    chave: "bens-sem-responsavel",
    rotulo: "Bens sem responsável designado",
    quantidade,
    href: "/patrimonio/bens",
    criterio:
      "bens que nunca receberam movimento de designação de responsável — do ente inteiro",
  };
}

/**
 * LOTES QUE VENCEM EM ATÉ 30 DIAS, OU JÁ VENCIDOS — e SÓ OS QUE TÊM SALDO.
 *
 * ⚠️ SÓ COM SALDO, e este é literalmente o defeito que o teste do ENT05 pegou: um lote já
 * consumido não vence para ninguém, e listá-lo mandaria o almoxarife procurar na prateleira
 * uma coisa que não está lá. A posição de cada lote é derivada dos seus movimentos.
 *
 * ⚠️ A JANELA É DE DIA CIVIL DO ENTE, e não de instante. "Vence em 30 dias" comparado por
 * relógio do hospedeiro erraria por um dia a cada execução perto da meia-noite.
 */
async function lotesVencendo(): Promise<Pendencia> {
  const prisma = cliente();
  const hoje = new Date();
  const limite = fimDoDiaCivil(diaCivil(somarDiasCivis(hoje, 30)));

  const lotes = await prisma.loteDeMaterial.findMany({
    where: { validade: { not: null, lte: limite } },
    select: {
      id: true,
      movimentos: { select: { tipo: true, quantidade: true, valorTotal: true, dataMovimento: true } },
    },
    take: TETO_DA_CONTAGEM,
  });

  const quantidade = lotes.filter((l) =>
    posicaoDeEstoque(
      l.movimentos.map((m) => ({
        tipo: m.tipo as TipoMovimentoFisicoEstoque,
        quantidade: toMoney(m.quantidade.toFixed(6)),
        valorTotal: toMoney(m.valorTotal.toFixed(2)),
        dataMovimento: m.dataMovimento,
      }))
    ).quantidade.greaterThan(0)
  ).length;

  return {
    chave: "lotes-vencendo",
    rotulo: "Lotes vencidos ou vencendo em 30 dias",
    quantidade,
    href: "/patrimonio/almoxarifado/estoque",
    criterio:
      "lotes COM SALDO cuja validade já passou ou passa nos próximos 30 dias — lote já " +
      "consumido não entra, porque não vence para ninguém",
  };
}

/**
 * ORDENS DE COMPRA SEM NENHUM RECEBIMENTO.
 *
 * ⚠️ "SEM ENTRADA" É `none`, E NÃO UM ESTADO. A ordem não guarda "recebida": o recebimento
 * é um fato que aponta para ela. Uma ordem com recebimento PARCIAL sai desta faixa — ela
 * não está mais esperando a primeira entrega, e misturá-la com as que nunca receberam nada
 * faria a faixa perder o sentido operacional.
 */
async function ordensSemEntrada(): Promise<Pendencia> {
  // ⚠️ NÃO HÁ FILTRO DE ESTORNO AQUI, E É PORQUE NÃO HÁ O QUE FILTRAR: `estornarOrdemDeCompra`
  // APAGA a ordem e seus itens, em vez de marcá-la. Uma ordem estornada não existe mais, e
  // portanto não pode ser contada. Escrever `estornadaEm: null` seria pedir ao banco uma
  // coluna que não existe — o compilador acusou a primeira versão deste arquivo.
  const quantidade = await cliente().ordemDeCompra.count({
    where: { recebimentos: { none: {} } },
  });
  return {
    chave: "ordens-sem-entrada",
    rotulo: "Ordens de compra sem entrada",
    quantidade,
    href: "/licitacoes",
    criterio:
      "ordens emitidas que ainda não receberam NENHUMA entrega — recebimento parcial " +
      "não conta aqui, e ordem estornada não existe mais",
  };
}

/**
 * AS PENDÊNCIAS DE QUEM ESTÁ NA SESSÃO.
 *
 * ⚠️ O QUE FALHA SOME, E NÃO DERRUBA O RESTO. `allSettled`, não `all`.
 * ⚠️ E O ZERO SOME TAMBÉM: um painel "Assinaturas na fila: 0" ocupa a mesma atenção que um
 * com trabalho de verdade, e ensina o operador a ignorar a faixa inteira.
 */
export async function pendenciasDoUsuario(): Promise<readonly Pendencia[]> {
  const sessao = await exigirSessao();
  const resultados = await Promise.allSettled([
    assinaturasNaFila(sessao.identificador),
    pareceresAguardando(sessao.identificador),
    conciliacoesAbertas(),
    // ⚠️ ENT06 — e cada uma continua independente: `allSettled`, não `all`. Uma faixa nova
    // que falhe some sozinha, em vez de levar junto as três que já funcionavam.
    requisicoesComSaldo(),
    inventariosDeEstoqueAbertos(),
    inventariosDeBensAbertos(),
    bensSemResponsavel(),
    lotesVencendo(),
    ordensSemEntrada(),
  ]);
  return resultados
    .filter(
      (r): r is PromiseFulfilledResult<Pendencia> => r.status === "fulfilled"
    )
    .map((r) => r.value)
    .filter((p) => p.quantidade > 0);
}
