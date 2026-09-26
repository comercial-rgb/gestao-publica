import { cliente, PortaSemBancoError } from "./cliente";
import { saldoDosRestos, type SaldoRP } from "../../modules/m08-restos-a-pagar/restos";

/**
 * PORTA — RESTOS A PAGAR (C38). Borda de LEITURA sobre o M08, que já existia inteiro.
 *
 * ⚠️ O QUE O M08 JÁ TINHA, E O QUE FALTAVA. O domínio dos restos a pagar é dos mais maduros do
 * repositório: inscrição no encerramento, processado e não processado, liquidação, pagamento com
 * retenção, cancelamento, estorno de pagamento, estorno de cancelamento, a fila do art. 141
 * atravessando exercícios, locks de concorrência e testes de mutação. O que NÃO existia era
 * qualquer superfície: nenhuma porta, nenhuma rota, nenhuma tela. O único consumidor era o Anexo 7
 * do RREO — um demonstrativo fiscal que LÊ o resultado, não uma tela por onde alguém opere.
 *
 * ⚠️ ESTA PORTA É SÓ LEITURA, E A RAZÃO É NOMEADA, não preguiça. As cinco operações de escrita
 * (`liquidarRestosAPagar`, `pagarRestosAPagar`, `cancelarRestosAPagar` e os dois estornos) exigem
 * um `RoteiroContabil` do CHAMADOR — as contas de variação diminutiva, de restos a pagar
 * processados, de disponibilidade e de variação aumentativa. Não existe tabela de configuração
 * para elas: o repositório tem treze tabelas de roteiro e NENHUMA de restos a pagar, e os únicos
 * chamadores hoje são testes, que passam códigos literais.
 *
 * Construir a escrita agora exigiria escolher conta contábil no código — que é fabricar norma da
 * STN dentro de uma porta. O contrato de dados que falta está nomeado no `MODULO.md` do M08 e no
 * checkpoint: uma tabela de roteiro de restos a pagar, com cadastro, na mesma forma das outras
 * treze. Até ela existir, a tela mostra a posição e diz, em linguagem de operação, que a
 * contabilização das ações precisa ser configurada — em vez de oferecer botão que não pode
 * funcionar, ou pior, de inventar a conta.
 */

export { PortaSemBancoError };

/**
 * O NOME VIGENTE do credor, pelo documento do empenho.
 *
 * ⚠️ `Pessoa` NÃO TEM COLUNA `nome`, e isso não é lacuna: o nome é decisão VERSIONADA, e a vigente
 * é a última versão. Ler um nome de qualquer outro lugar é como se mostra o nome CIVIL de quem
 * declarou nome social — um defeito que nesta obra já fez um percurso procurar na tela um nome que
 * a tela, corretamente, não mostrava.
 *
 * Mesma consulta das outras portas que exibem pessoa (`administracao`, `carta-de-servicos`):
 * `criadoEm desc`, `take 1`. Não há helper compartilhado hoje; o que há é esta forma, repetida
 * igual — e repeti-la igual é melhor que inventar uma quarta.
 *
 * `null` quando o credor não está no cadastro canônico: a tela mostra o documento, nunca um nome
 * inventado nem um vazio silencioso.
 */
async function nomeDoCredor(
  prisma: ReturnType<typeof cliente>,
  documento: string
): Promise<string | null> {
  const p = await prisma.pessoa.findUnique({
    where: { documento },
    select: { versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } },
  });
  return p?.versoes[0]?.nome ?? null;
}

export interface RestoAPagarNaLista {
  readonly inscricaoId: string;
  readonly exercicioOrigem: number;
  readonly tipo: "PROCESSADO" | "NAO_PROCESSADO";
  readonly empenhoId: string;
  readonly empenhoNumero: string;
  readonly credorCpfCnpj: string;
  readonly credorNome: string | null;
  readonly fonteCodigo: string;
  readonly fonteDescricao: string;
  /** O saldo vem do M08, nunca recalculado aqui — ver a nota de `listarRestosAPagar`. */
  readonly valorInscrito: string;
  readonly pagoLiquido: string;
  readonly canceladoLiquido: string;
  readonly saldo: string;
  /** Derivada do saldo e dos movimentos, no M08. */
  readonly situacao: "A PAGAR" | "QUITADO" | "CANCELADO";
}

/** Como a situação se lê a partir dos números do M08 — uma função, dois consumidores (lista e detalhe). */
function situacaoDe(s: SaldoRP): RestoAPagarNaLista["situacao"] {
  if (s.saldo.isZero() && !s.canceladoLiquido.isZero()) return "CANCELADO";
  if (s.saldo.isZero()) return "QUITADO";
  return "A PAGAR";
}

/**
 * A POSIÇÃO DOS RESTOS A PAGAR, por exercício de origem e tipo.
 *
 * ⚠️ O SALDO DE CADA INSCRIÇÃO VEM DE `saldoDosRestos`, UMA CHAMADA POR INSCRIÇÃO — e isso é
 * deliberado. A tentação era escrever aqui um `groupBy` que somasse os movimentos de todas as
 * inscrições de uma vez: seria uma consulta em vez de N. E seria a SEGUNDA ARITMÉTICA dos restos
 * a pagar — porque a semântica não é uma soma ingênua. `pago − estornoPagamento` é o pago
 * líquido, `cancelado − estornoCancelamento` é a obrigação que de fato morreu, e o saldo é
 * `inscrito − pagoLiquido − canceladoLiquido`. No dia em que o M08 mudasse o tratamento de um
 * estorno, a lista continuaria somando do jeito antigo e discordaria do Anexo 7, com a mesma cara
 * de certeza.
 *
 * O custo é N+1 consultas, e ele é real: numa base com milhares de inscrições esta listagem fica
 * lenta. A resposta certa, quando doer, é uma função de LOTE no M08 reusando o mesmo caminho de
 * código — não uma soma nova aqui. Fica nomeado em vez de otimizado às cegas.
 */
export async function listarRestosAPagar(p: {
  readonly exercicioOrigem?: number | undefined;
  readonly tipo?: "PROCESSADO" | "NAO_PROCESSADO" | undefined;
}): Promise<readonly RestoAPagarNaLista[]> {
  const prisma = cliente();
  const inscricoes = await prisma.inscricaoRestosAPagar.findMany({
    where: {
      ...(p.exercicioOrigem !== undefined ? { exercicioOrigem: p.exercicioOrigem } : {}),
      ...(p.tipo !== undefined ? { tipo: p.tipo } : {}),
    },
    select: {
      id: true,
      exercicioOrigem: true,
      tipo: true,
      empenho: {
        select: {
          id: true,
          numero: true,
          credorCpfCnpj: true,
          ficha: { select: { fonte: { select: { codigo: true, descricao: true } } } },
        },
      },
    },
    orderBy: [{ exercicioOrigem: "asc" }, { tipo: "asc" }],
  });

  const linhas: RestoAPagarNaLista[] = [];
  for (const i of inscricoes) {
    const s = await saldoDosRestos(prisma, i.id);
    const pessoa = await nomeDoCredor(prisma, i.empenho.credorCpfCnpj);
    linhas.push({
      inscricaoId: i.id,
      exercicioOrigem: i.exercicioOrigem,
      tipo: i.tipo,
      empenhoId: i.empenho.id,
      empenhoNumero: i.empenho.numero,
      credorCpfCnpj: i.empenho.credorCpfCnpj,
      credorNome: pessoa,
      fonteCodigo: i.empenho.ficha.fonte.codigo,
      fonteDescricao: i.empenho.ficha.fonte.descricao,
      valorInscrito: s.valorInscrito.toFixed(2),
      pagoLiquido: s.pagoLiquido.toFixed(2),
      canceladoLiquido: s.canceladoLiquido.toFixed(2),
      saldo: s.saldo.toFixed(2),
      situacao: situacaoDe(s),
    });
  }
  return linhas;
}

export interface RestoAPagarDetalhe extends RestoAPagarNaLista {
  /** As pernas BRUTAS, antes do líquido — é o que torna o saldo auditável. */
  readonly pago: string;
  readonly estornoDePagamento: string;
  readonly cancelado: string;
  readonly estornoDeCancelamento: string;
  readonly empenhoData: Date;
  readonly empenhoValor: string;
}

/** O detalhe de UMA inscrição: as pernas brutas, o líquido e a origem. */
export async function lerRestoAPagar(inscricaoId: string): Promise<RestoAPagarDetalhe | null> {
  const prisma = cliente();
  const i = await prisma.inscricaoRestosAPagar.findUnique({
    where: { id: inscricaoId },
    select: {
      id: true,
      exercicioOrigem: true,
      tipo: true,
      empenho: {
        select: {
          id: true,
          numero: true,
          credorCpfCnpj: true,
          data: true,
          valor: true,
          ficha: { select: { fonte: { select: { codigo: true, descricao: true } } } },
        },
      },
    },
  });
  if (i === null) return null;

  const s = await saldoDosRestos(prisma, i.id);
  const pessoa = await nomeDoCredor(prisma, i.empenho.credorCpfCnpj);

  return {
    inscricaoId: i.id,
    exercicioOrigem: i.exercicioOrigem,
    tipo: i.tipo,
    empenhoId: i.empenho.id,
    empenhoNumero: i.empenho.numero,
    credorCpfCnpj: i.empenho.credorCpfCnpj,
    credorNome: pessoa,
    fonteCodigo: i.empenho.ficha.fonte.codigo,
    fonteDescricao: i.empenho.ficha.fonte.descricao,
    valorInscrito: s.valorInscrito.toFixed(2),
    pago: s.pago.toFixed(2),
    estornoDePagamento: s.estornado.toFixed(2),
    pagoLiquido: s.pagoLiquido.toFixed(2),
    cancelado: s.cancelado.toFixed(2),
    estornoDeCancelamento: s.estornoCancelamento.toFixed(2),
    canceladoLiquido: s.canceladoLiquido.toFixed(2),
    saldo: s.saldo.toFixed(2),
    situacao: situacaoDe(s),
    empenhoData: i.empenho.data,
    empenhoValor: i.empenho.valor.toFixed(2),
  };
}
