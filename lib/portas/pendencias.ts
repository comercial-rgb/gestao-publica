import { cliente } from "./cliente";
import { exigirSessao } from "./sessao";

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
  ]);
  return resultados
    .filter(
      (r): r is PromiseFulfilledResult<Pendencia> => r.status === "fulfilled"
    )
    .map((r) => r.value)
    .filter((p) => p.quantidade > 0);
}
