import { cliente, PortaSemBancoError } from "./cliente";
import {
  anularCancelamentoRestosAPagar,
  anularPagamentoRestosAPagar,
  cancelarRestosAPagar,
  liquidarRestosAPagar,
  pagarRestosAPagar,
  saldoDosRestos,
  type SaldoRP,
} from "../../modules/m08-restos-a-pagar/restos";
import {
  roteiroCancelamentoRestos,
  roteiroLiquidacaoRestos,
  roteiroPagamentoRestos,
} from "../../modules/m08-restos-a-pagar/dominio";
import {
  exigirRoteiroDeRestos,
  passivoDaLiquidacaoDeOrigem,
  RoteiroDeRestosAusenteError,
  type EventoDeRestos,
} from "../../modules/m08-restos-a-pagar/servico-roteiro";
import { comEscritaAutenticada } from "./sessao";
import { encerrarExercicioComRestos } from "../../modules/m08-restos-a-pagar/encerramento";
import {
  apurarResultadoDoExercicio,
  estornarApuracao,
  ORIGEM_APURACAO,
} from "../../modules/m08-restos-a-pagar/apuracao";
import { anoCivil, meioDiaCivil } from "../../packages/datas/index";

export { RoteiroDeRestosAusenteError };

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
 * ⚠️ A V14 ENTREGOU SÓ A LEITURA, E A RAZÃO ERA NOMEADA: as operações de escrita exigem um
 * `RoteiroContabil` do CHAMADOR, e não existia tabela de configuração para elas. Construir a
 * escrita naquele momento exigiria escolher conta contábil no código, que é fabricar norma da STN
 * dentro de uma porta.
 *
 * ⚠️ A V15 FECHOU ISSO, e o levantamento reduziu a unidade duas vezes antes de alguém começá-la:
 *
 *   · SÃO TRÊS OPERAÇÕES QUE PEDEM CONTAS, não cinco. `anularPagamentoRestosAPagar` e
 *     `anularCancelamentoRestosAPagar` não têm parâmetro `roteiro`: leem o lançamento original e
 *     INVERTEM as pernas (`gerarEstorno` do M01). Configurar conta de estorno criaria a
 *     possibilidade de um estorno que não fecha com o que estornou;
 *   · O PASSIVO DO PAGAMENTO NÃO É CONFIGURAÇÃO — ele se RASTREIA. A inscrição no encerramento
 *     não gera lançamento, então a obrigação a baixar é a que a liquidação de origem CREDITOU:
 *     a do exercício de origem, num resto processado; a do exercício seguinte, num que era não
 *     processado. Ver `passivoDaLiquidacaoDeOrigem` no M08;
 *   · A CONTA DE SAÍDA vem da conta bancária escolhida no ato (`ContaBancaria.contaContabil`),
 *     nunca de cadastro de roteiro.
 *
 * O que falta configurar, o sistema RECUSA nomeando a operação e dizendo onde configurá-la. Nunca
 * conta padrão, nunca sucesso simulado.
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

// ═══════════════════════════════════════════════════════════════════════════
// AS OPERAÇÕES (V15) — cada uma com autorização no servidor, transação do
// domínio e recusa nomeada quando falta configuração.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resolve o par patrimonial e o par de controle do evento, ou recusa.
 *
 * ⚠️ FAIL-CLOSED COM MOTIVO ACIONÁVEL. "Não configurado" não pode chegar ao operador como erro
 * genérico: ele é quem resolve, e a mensagem diz onde. E não se degrada para conta padrão — um
 * padrão aqui escrituraria contra uma conta que ninguém decidiu.
 */
async function paresDoEvento(
  evento: EventoDeRestos
): Promise<{
  readonly patrimonial: { readonly debito: string; readonly credito: string } | null;
  readonly controle: { readonly debito: string; readonly credito: string } | null;
}> {
  const r = await exigirRoteiroDeRestos(cliente(), evento);
  return { patrimonial: r.patrimonial, controle: r.controle };
}

/**
 * O VALOR COMO A PESSOA O DIGITA, convertido no decimal que o domínio exige.
 *
 * ⚠️ `zMoney` ACEITA SÓ `^-?\d+(\.\d+)?$` — "400,00" é recusado por ele com "String decimal
 * inválida", que é mensagem de biblioteca chegando a um servidor municipal. A tela brasileira
 * digita "1.000,00", e converter é trabalho da borda.
 *
 * ⚠️ E A CONVERSÃO É CONDICIONAL, de propósito. Tirar todos os pontos sempre transformaria
 * "400.00" (quem digita no formato do sistema) em "40000" — um erro de fator 100 que balanceia e
 * passa por todo guard. Só há separador de milhar quando há vírgula decimal.
 */
function dinheiroDoFormulario(valor: string, campo: string): string {
  const t = valor.trim();
  const normalizado = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  if (!/^\d+(\.\d{1,2})?$/.test(normalizado)) {
    throw new Error(
      `O ${campo} informado ("${valor}") não é um valor em reais. Use o formato 1.234,56. Nada foi gravado.`
    );
  }
  return normalizado;
}

/** A conta contábil da conta bancária escolhida. Recusa nomeando a conta, nunca supõe. */
async function contaContabilDaContaBancaria(codigo: string): Promise<string> {
  const c = await cliente().contaBancaria.findUnique({
    where: { codigo },
    select: { codigo: true, descricao: true, contaContabil: { select: { codigo: true } } },
  });
  if (c === null) {
    throw new Error(`A conta bancária "${codigo}" não está cadastrada. Nada foi gravado.`);
  }
  if (c.contaContabil === null) {
    throw new Error(
      `A conta bancária ${c.codigo} ("${c.descricao}") não tem conta contábil informada, e sem ela o ` +
        `pagamento não sabe de onde o dinheiro saiu. Informe a conta contábil desta conta em ` +
        `Financeiro / Contas bancárias. Nada foi gravado.`
    );
  }
  return c.contaContabil.codigo;
}

/**
 * LIQUIDAR um resto NÃO PROCESSADO no exercício seguinte.
 *
 * ⚠️ NÃO NASCE EMPENHO NOVO AQUI, e esta é a regra que um sistema de restos a pagar erra com mais
 * frequência. A obrigação já foi empenhada no exercício que fechou; empenhar de novo gastaria
 * duas vezes o mesmo dinheiro e consumiria dotação do exercício corrente. O domínio do M08 não
 * toca `MovimentoDotacao` em nenhuma operação de RP — e a liquidação aqui reusa o `Empenho` de
 * origem, pela inscrição.
 */
export async function liquidarResto(input: {
  readonly empenhoId: string;
  readonly numero: string;
  readonly valor: string;
  readonly data: string;
  readonly responsavelAtesto: string;
  readonly historico: string;
}): Promise<string> {
  const pares = await paresDoEvento("LIQUIDACAO_NAO_PROCESSADO");
  if (pares.patrimonial === null) {
    throw new RoteiroDeRestosAusenteError("LIQUIDACAO_NAO_PROCESSADO");
  }
  const roteiro = roteiroLiquidacaoRestos({
    variacaoDiminutiva: pares.patrimonial.debito,
    restosAPagarProcessados: pares.patrimonial.credito,
    ...(pares.controle !== null
      ? {
          ddrComprometidaPorEmpenho: pares.controle.debito,
          ddrComprometidaPorLiquidacao: pares.controle.credito,
        }
      : {}),
  });
  const r = await comEscritaAutenticada("LIQUIDAR_RESTOS_A_PAGAR", (criadoPor) =>
    liquidarRestosAPagar(
      cliente(),
      {
        empenhoId: input.empenhoId,
        numero: input.numero,
        valor: dinheiroDoFormulario(input.valor, "valor da liquidação") as never,
        data: meioDiaCivil(input.data), // dia civil do ente: "AAAA-MM-DD" cru virava meia-noite UTC, o dia anterior no ente
        responsavelAtesto: input.responsavelAtesto,
        historico: input.historico,
        criadoPor,
      } as never,
      roteiro
    )
  );
  return `Liquidação ${input.numero} registrada no valor de ${input.valor}. A obrigação passou a existir e o resto pode ser pago. (${r.liquidacaoId})`;
}

/**
 * PAGAR um resto a pagar processado.
 *
 * ⚠️ O DÉBITO VEM DA ORIGEM, e a origem é inequívoca: o pagamento nomeia a `liquidacaoId`, e é o
 * lançamento DELA que diz contra que passivo a baixa recai. A conferência da contraparte está no
 * domínio (`passivoDaLiquidacaoDeOrigem` exige que a liquidação seja do MESMO empenho da
 * inscrição) e mais de uma perna de passivo no mesmo lançamento RECUSA em vez de escolher.
 */
export async function pagarResto(input: {
  readonly inscricaoId: string;
  readonly liquidacaoId: string;
  readonly numero: string;
  readonly valor: string;
  readonly data: string;
  readonly contaBancaria: string;
  readonly fonteId: string;
  readonly historico: string;
}): Promise<string> {
  const prisma = cliente();
  const pares = await paresDoEvento("PAGAMENTO");

  const inscricao = await prisma.inscricaoRestosAPagar.findUnique({
    where: { id: input.inscricaoId },
    select: { empenhoId: true },
  });
  if (inscricao === null) {
    throw new Error("O resto a pagar informado não existe. Nada foi gravado.");
  }

  const origem = await passivoDaLiquidacaoDeOrigem(prisma, {
    liquidacaoId: input.liquidacaoId,
    empenhoIdEsperado: inscricao.empenhoId,
  });
  const disponibilidade = await contaContabilDaContaBancaria(input.contaBancaria);

  const roteiro = roteiroPagamentoRestos({
    restosAPagarProcessados: origem.conta,
    disponibilidade,
    ...(pares.controle !== null
      ? {
          ddrComprometidaPorLiquidacao: pares.controle.debito,
          ddrUtilizada: pares.controle.credito,
        }
      : {}),
  });

  await comEscritaAutenticada("PAGAR_RESTOS_A_PAGAR", (criadoPor) =>
    pagarRestosAPagar(
      prisma,
      {
        liquidacaoId: input.liquidacaoId,
        numero: input.numero,
        valor: dinheiroDoFormulario(input.valor, "valor do pagamento") as never,
        data: meioDiaCivil(input.data), // dia civil do ente: "AAAA-MM-DD" cru virava meia-noite UTC, o dia anterior no ente
        contaBancaria: input.contaBancaria,
        fonteId: input.fonteId,
        historico: input.historico,
        criadoPor,
      } as never,
      roteiro
    )
  );
  return (
    `Pagamento ${input.numero} registrado no valor de ${input.valor}, pela conta ${input.contaBancaria}. ` +
    `A baixa recaiu sobre a obrigação da liquidação ${origem.liquidacaoNumero} (${origem.conta} ${origem.nome}).`
  );
}

/** CANCELAR um resto a pagar. O evento depende do tipo, e as contas com ele. */
export async function cancelarResto(input: {
  readonly inscricaoId: string;
  readonly valor: string;
  readonly motivo: string;
}): Promise<string> {
  const prisma = cliente();
  const inscricao = await prisma.inscricaoRestosAPagar.findUnique({
    where: { id: input.inscricaoId },
    select: { tipo: true },
  });
  if (inscricao === null) {
    throw new Error("O resto a pagar informado não existe. Nada foi gravado.");
  }
  // ⚠️ DOIS EVENTOS, NÃO UM: cancelar um resto processado extingue um passivo que existe; cancelar
  // um não processado desfaz um compromisso que nunca virou passivo. As contas não são as mesmas,
  // e por isso a chave da configuração é o par (operação, tipo) e não só a operação.
  const evento: EventoDeRestos =
    inscricao.tipo === "PROCESSADO" ? "CANCELAMENTO_PROCESSADO" : "CANCELAMENTO_NAO_PROCESSADO";
  const pares = await paresDoEvento(evento);
  if (pares.patrimonial === null) throw new RoteiroDeRestosAusenteError(evento);

  const roteiro = roteiroCancelamentoRestos({
    restosAPagar: pares.patrimonial.debito,
    variacaoAumentativa: pares.patrimonial.credito,
    ...(pares.controle !== null
      ? { ddrDebito: pares.controle.debito, ddrCredito: pares.controle.credito }
      : {}),
  });

  await comEscritaAutenticada("CANCELAR_RESTOS_A_PAGAR", (criadoPor) =>
    cancelarRestosAPagar(
      prisma,
      {
        inscricaoId: input.inscricaoId,
        valor: dinheiroDoFormulario(input.valor, "valor a cancelar") as never,
        data: new Date(),
        motivo: input.motivo,
        criadoPor,
      } as never,
      roteiro
    )
  );
  return `Cancelamento registrado no valor de ${input.valor}. A obrigação com o credor deixou de existir nesta parte.`;
}

/**
 * ANULAR um pagamento de resto a pagar.
 *
 * ⚠️ A ANULAÇÃO É ATO PRÓPRIO: TEM NÚMERO E DATA. O domínio os exige
 * (`zAnularPagamentoRestosInput`), e a primeira versão desta porta não os passava — as duas
 * anulações eram, por isso, IMPOSSÍVEIS: a recusa chegava como `numero: Invalid input`, mensagem de
 * biblioteca, num botão que a tela oferecia. Quem achou foi o percurso; nenhum typecheck pegaria,
 * porque o `as never` da fronteira apaga o contrato. É a razão pela qual percurso não é enfeite.
 *
 * ⚠️ SEM ROTEIRO, E ISSO É O DESENHO. O estorno lê o lançamento original e INVERTE as pernas
 * (`gerarEstorno` do M01), inclusive as de retenção, que levam bruto e líquido diferentes. Um
 * estorno que recarimbasse contas de cadastro devolveria ao caixa o BRUTO de um pagamento que só
 * desembolsou o LÍQUIDO. O original permanece intocado: append-only.
 */
export async function anularPagamentoDeResto(input: {
  readonly pagamentoId: string;
  readonly numero: string;
  readonly data: string;
  readonly motivo: string;
}): Promise<string> {
  await comEscritaAutenticada("ANULAR_PAGAMENTO_RESTOS_A_PAGAR", (criadoPor) =>
    anularPagamentoRestosAPagar(cliente(), {
      pagamentoId: input.pagamentoId,
      numero: input.numero,
      data: meioDiaCivil(input.data), // dia civil do ente: "AAAA-MM-DD" cru virava meia-noite UTC, o dia anterior no ente
      motivo: input.motivo,
      criadoPor,
    } as never)
  );
  return "Pagamento anulado. O registro original permanece, e o valor voltou ao saldo do resto a pagar.";
}

/** ANULAR um cancelamento — a obrigação com o credor volta a existir. Sem roteiro, pelo mesmo motivo. */
export async function anularCancelamentoDeResto(input: {
  readonly movimentoId: string;
  readonly numero: string;
  readonly data: string;
  readonly motivo: string;
}): Promise<string> {
  await comEscritaAutenticada("ANULAR_CANCELAMENTO_RESTOS_A_PAGAR", (criadoPor) =>
    anularCancelamentoRestosAPagar(cliente(), {
      movimentoId: input.movimentoId,
      numero: input.numero,
      data: meioDiaCivil(input.data), // dia civil do ente: "AAAA-MM-DD" cru virava meia-noite UTC, o dia anterior no ente
      motivo: input.motivo,
      criadoPor,
    } as never)
  );
  return "Cancelamento anulado. A obrigação com o credor voltou a existir e o valor retornou ao saldo.";
}

// ═══════════════════════════════════════════════════════════════════════════
// OS ATOS INDIVIDUAIS — o que a anulação precisa para existir
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ TOTAIS NÃO BASTAM PARA ANULAR. A tela da V14 mostrava inscrito, pago, cancelado e saldo, e
 * com isso ninguém anula nada: anular um pagamento exige o PAGAMENTO, e anular um cancelamento
 * exige o MOVIMENTO. Sem esta leitura, as duas anulações seriam botões sem alvo.
 *
 * ⚠️ E O QUE JÁ FOI ANULADO APARECE COMO ANULADO, não desaparece. Some-lo esconderia um pagamento
 * de 500,00 anulado como se nunca tivesse existido, e o histórico é append-only justamente para
 * que ele exista.
 */
export interface AtoDoResto {
  readonly id: string;
  readonly rotulo: string;
  readonly valor: string;
  readonly data: Date;
  readonly motivo: string | null;
  /** Já anulado: a ação de anular não se oferece de novo. */
  readonly anulado: boolean;
  /** Se este ato é um estorno de outro. */
  readonly ehAnulacao: boolean;
}

export interface AtosDoResto {
  /** Liquidações do resto não processado, feitas depois do encerramento de origem. */
  readonly liquidacoes: readonly { readonly id: string; readonly numero: string; readonly valor: string; readonly data: Date }[];
  readonly pagamentos: readonly AtoDoResto[];
  readonly cancelamentos: readonly AtoDoResto[];
}

const ROTULO_DO_MOVIMENTO: Record<string, string> = {
  PAGAMENTO: "Pagamento",
  CANCELAMENTO: "Cancelamento",
  ESTORNO_PAGAMENTO: "Anulação de pagamento",
  ESTORNO_CANCELAMENTO: "Anulação de cancelamento",
};

export async function atosDoResto(inscricaoId: string): Promise<AtosDoResto> {
  const prisma = cliente();

  const inscricao = await prisma.inscricaoRestosAPagar.findUnique({
    where: { id: inscricaoId },
    select: {
      empenhoId: true,
      exercicioOrigem: true,
      tipo: true,
    },
  });
  if (inscricao === null) return { liquidacoes: [], pagamentos: [], cancelamentos: [] };

  // ⚠️ A DATA DO ENCERRAMENTO SEPARA AS DUAS, E O LADO DEPENDE DO TIPO — foi o percurso que
  // ensinou isto, e o defeito era meu. "É liquidação de restos a pagar" é DERIVADO, não coluna, e
  // eu só havia programado UM dos dois casos:
  //
  //   NAO_PROCESSADO  a liquidação vem DEPOIS do encerramento — é ela que transforma o
  //                   compromisso em obrigação, no exercício seguinte;
  //   PROCESSADO      a liquidação veio ANTES do encerramento — é justamente por ela existir e
  //                   não ter sido paga que o resto foi inscrito como processado.
  //
  // Com o filtro só de `>`, um resto PROCESSADO não tinha nenhuma liquidação a pagar e ficava
  // IMPAGÁVEL pela tela — silenciosamente, com o formulário na tela e o seletor vazio.
  const enc = await prisma.exercicio.findUnique({
    where: { ano: inscricao.exercicioOrigem },
    select: { encerramento: { select: { criadoEm: true } } },
  });
  const corte = enc?.encerramento?.criadoEm ?? null;

  const liquidacoes =
    corte === null
      ? []
      : await prisma.liquidacao.findMany({
          where: {
            empenhoId: inscricao.empenhoId,
            estornoDeId: null,
            ...(inscricao.tipo === "NAO_PROCESSADO"
              ? { criadoEm: { gt: corte } }
              : { criadoEm: { lte: corte } }),
          },
          orderBy: { data: "asc" },
          select: { id: true, numero: true, valor: true, data: true },
        });

  const movimentos = await prisma.movimentoRestosAPagar.findMany({
    where: { inscricaoId },
    orderBy: { criadoEm: "asc" },
    select: {
      id: true,
      tipo: true,
      valor: true,
      criadoEm: true,
      motivo: true,
      estornoDeId: true,
      pagamentoId: true,
      estornos: { select: { id: true } },
    },
  });

  const paraAto = (m: (typeof movimentos)[number], id: string): AtoDoResto => ({
    id,
    rotulo: ROTULO_DO_MOVIMENTO[m.tipo] ?? m.tipo,
    valor: m.valor.toFixed(2),
    data: m.criadoEm,
    motivo: m.motivo,
    anulado: m.estornos.length > 0,
    ehAnulacao: m.estornoDeId !== null,
  });

  return {
    liquidacoes: liquidacoes.map((l) => ({
      id: l.id,
      numero: l.numero,
      valor: l.valor.toFixed(2),
      data: l.data,
    })),
    // ⚠️ O ALVO DA ANULAÇÃO DE PAGAMENTO É O `Pagamento`, não o movimento — é o que
    // `anularPagamentoRestosAPagar` recebe. Movimento de pagamento sem `pagamentoId` não
    // oferece a ação, em vez de oferecer um botão que falharia.
    pagamentos: movimentos
      .filter((m) => m.tipo === "PAGAMENTO" || m.tipo === "ESTORNO_PAGAMENTO")
      .map((m) => paraAto(m, m.pagamentoId ?? ""))
      .filter((a) => a.id !== "" || a.ehAnulacao),
    cancelamentos: movimentos
      .filter((m) => m.tipo === "CANCELAMENTO" || m.tipo === "ESTORNO_CANCELAMENTO")
      .map((m) => paraAto(m, m.id)),
  };
}

/**
 * Quais operações JÁ têm contas informadas — para a tela de despesa avisar o que será recusado.
 *
 * ⚠️ POR QUE ELA VIVE AQUI, E NÃO NA PORTA DE CONFIGURAÇÃO. `listarRoteirosDeRestos` exige a
 * leitura de CONTABILIDADE, e o detalhe do resto a pagar é guardado por DESPESA. Chamar aquela
 * porta daqui faria a página INTEIRA ser recusada para quem tem despesa e não tem contabilidade —
 * o aviso sobre configuração derrubaria a consulta que a pessoa tem direito de ver. Aqui só se lê
 * se HÁ contas, nunca quais: nada da decisão contábil atravessa a fronteira da área.
 */
export async function eventosConfigurados(): Promise<readonly string[]> {
  const prisma = cliente();
  const linhas = await prisma.roteiroRestosAPagar.findMany({
    distinct: ["evento"],
    select: { evento: true },
  });
  return linhas.map((l) => String(l.evento));
}

/**
 * ENCERRA O EXERCÍCIO E INSCREVE OS RESTOS A PAGAR — o ato do fim do ano (V19).
 *
 * ⚠️ ELE EXISTIA NO DOMÍNIO E SÓ SCRIPT O CHAMAVA. `encerrarExercicioComRestos` varre as fichas de
 * todas as unidades, inscreve os processados e os não processados e grava o encerramento — tudo ou
 * nada, na mesma transação. Nenhuma porta o expunha, então o cenário *"inscrever conforme
 * procedimento"* só era demonstrável pelo RESULTADO, pré-fabricado por script. A ordem de
 * construção é explícita sobre isso: a demonstração funciona pela interface.
 *
 * ⚠️ E É O ATO MENOS REVERSÍVEL DO SISTEMA. Depois dele, a competência do exercício está travada:
 * empenho, liquidação e pagamento com data naquele ano passam a ser recusados pelo guard de
 * período. A tela cobra confirmação digitada e diz isso com estas palavras — não é zelo excessivo,
 * é a diferença entre um ato administrativo e um clique.
 *
 * ⚠️ NÃO TOCA DOTAÇÃO, e a nota do domínio explica: inscrever resto não é gastar de novo, é
 * reconhecer o que ficou pendente. A dotação do ano que fecha já foi consumida pelo empenho.
 */
export async function encerrarExercicioComRestosAPagar(input: {
  readonly ano: number;
}): Promise<string> {
  const r = await comEscritaAutenticada("ENCERRAR_EXERCICIO", (encerradoPor) =>
    encerrarExercicioComRestos(cliente(), { ano: input.ano, encerradoPor })
  );
  const processados = r.inscricoes.filter((i) => i.tipo === "PROCESSADO").length;
  const naoProcessados = r.inscricoes.length - processados;
  return (
    `Exercício ${String(r.ano)} encerrado. Restos a pagar inscritos: ${String(processados)} ` +
    `processado(s) e ${String(naoProcessados)} não processado(s). A competência do exercício está ` +
    `travada — fatos com data nele passam a ser recusados.`
  );
}

/**
 * APURA O RESULTADO DO EXERCÍCIO — o procedimento contábil da virada (V19).
 *
 * ⚠️ É O LANÇAMENTO QUE FECHA O ANO: zera as contas de variação patrimonial (as classes 3 e 4) e
 * transfere o saldo para o patrimônio líquido, na conta de resultados acumulados que o ente
 * parametrizou. Positivo é superávit, negativo é déficit — os dois são resultados legítimos.
 *
 * ⚠️ ELE SÓ RODA DEPOIS DO ENCERRAMENTO, e a ordem é do domínio, não desta borda: a apuração exige
 * o exercício encerrado (o FATO do encerramento), porque apurar um ano que ainda recebe fato daria
 * um resultado que muda depois de publicado.
 *
 * ⚠️ E O `exercicioId` NÃO ATRAVESSA A TELA. Quem opera conhece o ANO; o identificador é do banco.
 * A porta resolve — e recusa nomeando quando o ano não existe como exercício cadastrado.
 */
export async function apurarResultadoDoExercicioPorAno(input: {
  readonly ano: number;
}): Promise<string> {
  const exercicio = await cliente().exercicio.findUnique({
    where: { ano: input.ano },
    select: { id: true, encerramento: { select: { id: true } } },
  });
  if (exercicio === null) {
    throw new Error(
      `O exercício ${String(input.ano)} não está cadastrado. Apurar o resultado de um ano que o ` +
        `sistema não conhece não tem sentido. Nada foi gravado.`
    );
  }

  const r = await comEscritaAutenticada("APURAR_RESULTADO", (criadoPor) =>
    apurarResultadoDoExercicio(cliente(), { exercicioId: exercicio.id, criadoPor })
  );
  const sinal = r.resultadoApurado.isNegative() ? "déficit" : "superávit";
  return (
    `Resultado do exercício ${String(input.ano)} apurado: ${sinal} de ` +
    `${r.resultadoApurado.abs().toFixed(2)}, com ${String(r.contasZeradas)} conta(s) de variação ` +
    `patrimonial zerada(s) e o saldo transferido ao patrimônio líquido.`
  );
}

/**
 * AS APURAÇÕES JÁ FEITAS — o que o formulário de estorno precisa para existir (V21).
 *
 * ⚠️ O "id da operação" que `estornarApuracao` pede é o `origemId` dos lançamentos da apuração —
 * um identificador que até aqui só existia dentro da transação de quem apurou. Sem esta leitura o
 * estorno estava censado e INALCANÇÁVEL (pendência `ESTORNO-DA-APURACAO-SEM-BORDA`). Mesmo desenho
 * de `lerEncerramentosDeControles` (V20): o fato é o lançamento; "estornada" é existir estorno.
 */
export interface ApuracaoFeitaParaTela {
  readonly operacaoId: string;
  /** O ano civil da data do lançamento (31/12 do exercício apurado). */
  readonly ano: number;
  readonly data: Date;
  readonly historico: string;
  readonly criadoPor: string;
  readonly estornada: boolean;
}

export async function lerApuracoesFeitas(): Promise<readonly ApuracaoFeitaParaTela[]> {
  const lancamentos = await cliente().lancamentoContabil.findMany({
    where: { origemTipo: ORIGEM_APURACAO, estornoDeId: null },
    orderBy: { dataTransacao: "desc" },
    select: {
      origemId: true,
      dataTransacao: true,
      historico: true,
      criadoPor: true,
      estornos: { select: { id: true } },
    },
  });
  // Uma apuração pode ter mais de um lançamento (um por subsistema); a operação é uma só.
  const porOperacao = new Map<string, ApuracaoFeitaParaTela>();
  for (const l of lancamentos) {
    if (l.origemId === null) continue;
    const ja = porOperacao.get(l.origemId);
    const estornada = l.estornos.length > 0;
    if (ja === undefined) {
      porOperacao.set(l.origemId, {
        operacaoId: l.origemId,
        ano: anoCivil(l.dataTransacao),
        data: l.dataTransacao,
        historico: l.historico,
        criadoPor: l.criadoPor,
        estornada,
      });
    } else if (estornada && !ja.estornada) {
      porOperacao.set(l.origemId, { ...ja, estornada: true });
    }
  }
  return [...porOperacao.values()];
}

export async function estornarApuracaoDoExercicio(p: {
  readonly operacaoId: string;
  readonly motivo: string;
}): Promise<string> {
  return comEscritaAutenticada("ESTORNAR_APURACAO", async (criadoPor) => {
    const r = await estornarApuracao(cliente(), {
      operacaoId: p.operacaoId,
      motivo: p.motivo,
      criadoPor,
    });
    return (
      `Apuração estornada: ${String(r.lancamentos.length)} lançamento(s) de estorno gravado(s). O ` +
      `original permanece no razão — as contas de variação patrimonial voltaram a ter saldo, e o ` +
      `resultado pode ser apurado de novo.`
    );
  });
}
