import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
// A soma LÍQUIDA de registros estornáveis é do M08 e é fonte única (o M12 já a
// usa no relatório de restos). O líquido de UM pagamento é do M09 — nasceu na
// conciliação, e recopiá-la aqui seria criar a segunda verdade sobre o mesmo
// cheque. Importar é o preço de não ter duas.
import { somaLiquidaEstornaveis } from "../m08-restos-a-pagar/dominio.js";
import { tetoConciliavelDoPagamento } from "../m09-tesouraria/dominio.js";
import type { LinhaEstornavel } from "../../packages/estornaveis/index.js";
import { statusDoEmpenho, type CategoriaOrdemCronologica, type StatusEmpenho } from "./dominio.js";

/** O client OU uma transação dele — as consultas servem aos dois. */
type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/**
 * A DESPESA DE CADA FONTE — leitura pura, aritmética reusada.
 *
 * ═══ AS DUAS MEDIDAS DO PAGAMENTO, E POR QUE SÃO DIFERENTES ═══
 * Um pagamento de 6.000 com 900 retidos:
 *   - tira do CAIXA .......... 5.100 (o LÍQUIDO — só isso sai do banco)
 *   - baixa de FORNECEDORES .. 6.000 (o BRUTO — a obrigação foi extinta inteira;
 *                                     os 900 viraram OUTRA obrigação, com o
 *                                     consignatário)
 * Usar o bruto no caixa some com 900 reais que ainda estão lá; usar o líquido na
 * obrigação deixa 900 de dívida que já não existe. As duas medidas convivem, e
 * é por isso que esta função devolve as duas.
 *
 * ═══ A OBRIGAÇÃO A PAGAR NASCE NA LIQUIDAÇÃO, NÃO NA INSCRIÇÃO DE RP ═══
 * `obrigacoesAPagar = liquidado − pago (bruto)` — que é EXATAMENTE o saldo de
 * Fornecedores no razão, em qualquer corte. A inscrição de restos a pagar (M08)
 * não cria nem apaga obrigação: ela ROTULA a que já existia em 31/12. Por isso o
 * passivo financeiro da fonte sai daqui, e não das inscrições — senão o quadro
 * por fonte só fecharia depois do encerramento, e o balanço de março mostraria um
 * ente sem dívida nenhuma.
 *
 * ⚠️ CORTE PELA DATA DO FATO (`data`), nunca pelo `criadoEm`.
 *
 * ⚠️ LIMITE CONHECIDO: a fonte do PAGAMENTO (`Pagamento.fonteId`, casada com a
 * conta bancária pela TR 5.23) e a fonte da LIQUIDAÇÃO (empenho → ficha) são
 * lidas cada uma da sua ponta. Nada no sistema hoje obriga as duas a serem a
 * mesma — pagar um empenho da fonte 500 por uma conta da fonte 999 deixaria a
 * fonte 500 com uma obrigação eterna e a 999 com um caixa a menos. Está
 * registrado no MODULO.md do M12; o guard é do M05, não do relatório.
 */
/**
 * O EMPENHADO LÍQUIDO CONTRA UM CONTRATO (M11) — e por que ele nasce AQUI.
 *
 * ═══ POR QUE NÃO DEU PARA "ESTENDER A FUNÇÃO EXISTENTE" ═══
 * O empenhado da FICHA sai de `totaisPorTipo` (o razão da dotação:
 * EMPENHO − EMPENHO_ANULADO em `MovimentoDotacao`). Esse razão NÃO TEM a dimensão
 * contrato — e nem deveria: a dotação é do orçamento, não do contrato. A dimensão
 * contrato vive no `Empenho`. Então o recorte por contrato é uma leitura DIFERENTE
 * do mesmo fato, e não um parâmetro a mais na mesma consulta.
 *
 * O que NÃO se duplica é a ARITMÉTICA: a soma líquida de registros append-only
 * estornáveis é `somaLiquidaEstornaveis` (M08), a mesma que o relatório de restos
 * e o caixa por fonte usam. Original vivo soma; anulado não soma; a anulação em si
 * não soma.
 *
 * ⚠️ A ANULAÇÃO SÓ ENTRA AQUI PORQUE ELA **COPIA** O `contratoId` DO ORIGINAL
 * (adapter-prisma). Se não copiasse, o filtro `where: { contratoId }` traria o
 * empenho e deixaria a anulação dele de fora — e o contrato ficaria empenhado para
 * sempre.
 *
 * ⚠️ A ANULAÇÃO DE EMPENHO É **TOTAL** neste sistema (o estorno copia o valor do
 * original; `zAnularEmpenhoInput` não tem campo `valor`). Não existe anulação
 * parcial — quem precisa reduzir um empenho anula e reempenha o resto.
 */
export async function empenhadoLiquidoPorContrato(
  prisma: Tx,
  contratoId: string,
  corte?: Date
): Promise<Money> {
  const empenhos = await prisma.empenho.findMany({
    where: {
      contratoId,
      // Corte pela data do FATO (a emissão da nota de empenho).
      ...(corte !== undefined ? { data: { lte: corte } } : {}),
    },
    select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true },
  });

  return somaLiquidaEstornaveis(
    empenhos.map((e) => ({
      id: e.id,
      valor: toMoney(e.valor.toFixed(2)),
      estornoDeId: e.estornoDeId,
      anulacaoParcialDeId: e.anulacaoParcialDeId,
    }))
  );
}

/**
 * LIQUIDADO e PAGO por CONTRATO — o recorte que o relatório 5.103 precisa.
 *
 * A cadeia é `Liquidacao → Empenho.contratoId` e `Pagamento → Liquidacao →
 * Empenho.contratoId`. Nenhuma coluna nova: a dimensão contrato já está no empenho,
 * e o resto é JOIN.
 *
 * ⚠️ O PAGO É O **BRUTO** — o mesmo bruto que baixa a obrigação (ver
 * `despesaPorFonte`). A retenção não reduz o que o ente pagou ao contrato: ela muda
 * de credor. Usar o líquido aqui faria o relatório dizer que o contratado recebeu
 * menos do que a nota diz, e a cadeia `pago <= liquidado` deixaria de significar o
 * que significa.
 *
 * A aritmética é a de sempre: `somaLiquidaEstornaveis` (originais vivos).
 */
export interface ExecucaoDoContrato {
  readonly liquidado: Money;
  readonly pago: Money;
}

export async function execucaoPorContrato(
  prisma: Tx,
  contratoId: string,
  corte?: Date
): Promise<ExecucaoDoContrato> {
  const doContrato = { empenho: { contratoId } };

  const liquidacoes = await prisma.liquidacao.findMany({
    where: {
      ...doContrato,
      ...(corte !== undefined ? { data: { lte: corte } } : {}),
    },
    select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true },
  });

  const pagamentos = await prisma.pagamento.findMany({
    where: {
      liquidacao: doContrato,
      ...(corte !== undefined ? { data: { lte: corte } } : {}),
    },
    select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true },
  });

  const soma = (
    linhas: readonly {
      id: string;
      valor: { toFixed(n: number): string };
      estornoDeId: string | null;
      anulacaoParcialDeId: string | null;
    }[]
  ): Money =>
    somaLiquidaEstornaveis(
      linhas.map((l) => ({
        id: l.id,
        valor: toMoney(l.valor.toFixed(2)),
        estornoDeId: l.estornoDeId,
        anulacaoParcialDeId: l.anulacaoParcialDeId,
      }))
    );

  return { liquidado: soma(liquidacoes), pago: soma(pagamentos) };
}

/**
 * AS OBRIGAÇÕES A PAGAR DE UM **EXERCÍCIO**, por fonte — a coluna (c) do RGF Anexo 5.
 *
 * ═══ POR QUE NÃO DEU PARA "PASSAR UM PARÂMETRO A MAIS" NO `despesaPorFonte` ═══
 * Aquele devolve o passivo financeiro da fonte INTEIRO — todos os exercícios —, e é
 * isso que o Anexo 14 e o superávit precisam: o saldo de Fornecedores no razão não
 * pergunta de que ano é a dívida.
 *
 * O Anexo 5 pergunta OUTRA coisa. Ele separa a obrigação liquidada e não paga em duas
 * colunas — (b) de exercícios ANTERIORES (que já viraram RP e o M08 conhece) e (c) DO
 * exercício (que ainda não virou RP nenhum). Somar as duas dá o `despesaPorFonte`; mas
 * são leituras diferentes do mesmo fato, e o recorte é por `empenho → ficha.exercicio`.
 *
 * ⚠️ A ARITMÉTICA CONTINUA SENDO UMA: `somaLiquidaEstornaveis`. O que muda é o `where`.
 *
 * ⚠️ E O PAGO É O **BRUTO** — o mesmo bruto que baixa a obrigação. A retenção não
 * reduz o que o ente deve ao credor: ela muda de credor (e vira `consignacoesARepassar`,
 * que o Anexo 5 põe em (e)). Usar o líquido aqui contaria a consignação duas vezes.
 */
export async function obrigacoesDoExercicioPorFonte(
  prisma: Tx,
  p: { readonly exercicio: number; readonly ate: Date }
): Promise<ReadonlyMap<string, Money>> {
  const doExercicio = { empenho: { ficha: { exercicio: p.exercicio } } };

  const liquidacoes = await prisma.liquidacao.findMany({
    where: { ...doExercicio, data: { lte: p.ate } },
    select: {
      id: true,
      valor: true,
      estornoDeId: true,
      anulacaoParcialDeId: true,
      empenho: { select: { ficha: { select: { fonteId: true } } } },
    },
  });

  const pagamentos = await prisma.pagamento.findMany({
    where: { liquidacao: doExercicio, data: { lte: p.ate } },
    select: {
      id: true,
      valor: true,
      estornoDeId: true,
      anulacaoParcialDeId: true,
      liquidacao: {
        select: { empenho: { select: { ficha: { select: { fonteId: true } } } } },
      },
    },
  });

  const fontes = new Set<string>([
    ...liquidacoes.map((l) => l.empenho.ficha.fonteId),
    ...pagamentos.map((p2) => p2.liquidacao.empenho.ficha.fonteId),
  ]);

  const por = new Map<string, Money>();
  for (const fonteId of fontes) {
    const liquidado = somaLiquidaEstornaveis(
      liquidacoes
        .filter((l) => l.empenho.ficha.fonteId === fonteId)
        .map(comoLinha)
    );
    const pago = somaLiquidaEstornaveis(
      pagamentos
        .filter((x) => x.liquidacao.empenho.ficha.fonteId === fonteId)
        .map(comoLinha)
    );
    por.set(fonteId, toMoney(liquidado.minus(pago)));
  }
  return por;
}

// ═══════════════════════════════════════════════════════════════════════════
// A EXECUÇÃO POR GRUPO DE NATUREZA DA DESPESA — o eixo que o RREO Anexo 6 mede
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A CHAVE deste leitor: `${codNatureza}|${codElemento}` — grupo e elemento da ND.
 *
 * ⚠️ POR QUE O ELEMENTO, SE O EIXO É O GRUPO. O RREO Anexo 6 separa primária de financeira pelo
 * GRUPO (2 = juros da dívida, 6 = amortização) — mas não só: ele também tira da primária a
 * CONCESSÃO DE EMPRÉSTIMOS, que é elemento (66), dentro de um grupo primário. Uma chave só de
 * grupo não conseguiria excluí-la, e o leitor teria de ser refeito no primeiro anexo que pedisse
 * o grão. Agrupar é barato para quem lê; desagregar depois é impossível.
 */
export function chaveNd(grupo: string, elemento: string): string {
  return `${grupo}|${elemento}`;
}

/** O grupo (2º dígito) de uma chave deste leitor. */
export function grupoDaChaveNd(chave: string): string {
  return chave.split("|")[0]!;
}

/** O elemento (5º-6º dígitos) de uma chave deste leitor. */
export function elementoDaChaveNd(chave: string): string {
  return chave.split("|")[1]!;
}

/**
 * As quatro colunas orçamentárias de um par (grupo, elemento) de ND, no exercício.
 *
 * O RREO Anexo 6 (7.8-a) separa despesa PRIMÁRIA de FINANCEIRA por este eixo. O recorte não
 * existia como leitor — o padrão de colunas estava implementado TRÊS vezes, sempre privado dentro
 * do arquivo de um anexo (`rreo-anexo1`, `rreo-anexo11`, `rreo-anexo12`), cada um acoplado ao seu
 * próprio filtro. A quarta cópia seria a que finalmente divergiria.
 */
export interface ExecucaoDoGrupoNd {
  /** dotação inicial das fichas + créditos (SUPLEMENTACAO − ANULACAO). */
  readonly dotacaoAtualizada: Money;
  readonly empenhada: Money;
  readonly liquidada: Money;
  /** O que saiu do caixa por despesa DESTE exercício. Ver o aviso sobre RP abaixo. */
  readonly paga: Money;
}

/**
 * A EXECUÇÃO DO EXERCÍCIO POR (GRUPO, ELEMENTO) DE ND, até o corte. Chave: `chaveNd(g, e)`.
 *
 * ═══ ⚠️ POR QUE O `exercicio` NÃO É OPCIONAL AQUI ═══
 * `despesaPorFonte` avisa, logo abaixo, que TODA linha de `Pagamento` cai na varredura dela —
 * inclusive o pagamento de RESTOS A PAGAR, que o M08 cria como um `Pagamento` de verdade. Lá isso
 * é CORRETO (o caixa da fonte não distingue de que ano é o cheque).
 *
 * Aqui seria FATAL. O Anexo 6 mede o resultado primário somando `pagas + RP pagos`: se `pagas`
 * varresse todo `Pagamento`, o cheque do RP entraria nas DUAS parcelas e o resultado sairia
 * deficitário pelo valor de cada RP pago duas vezes.
 *
 * A separação é ESTRUTURAL, não um filtro de conveniência: `Pagamento → Liquidacao → Empenho →
 * FichaOrcamentaria.exercicio`. O pagamento de um resto a pagar pendura na liquidação do empenho
 * ANTIGO, cuja ficha é de exercício anterior — logo `ficha.exercicio === p.exercicio` o exclui por
 * construção, e o RP entra UMA vez só, pelo M08 (`rpPagosPorGrupoNd`). É a mesma família de erro
 * que o `exercicioOrigemAte` resolveu no RGF Anexo 5 (7.5), pelo mesmo motivo: um fato que cabe em
 * duas gavetas é contado nas duas, a menos que alguém escolha.
 */
export async function execucaoPorGrupoNd(
  prisma: Tx,
  p: { readonly exercicio: number; readonly ate: Date }
): Promise<ReadonlyMap<string, ExecucaoDoGrupoNd>> {
  const fichas = await prisma.fichaOrcamentaria.findMany({
    where: { exercicio: p.exercicio },
    select: {
      id: true,
      valorDotado: true,
      naturezaDespesa: { select: { codNatureza: true, codElemento: true } },
    },
  });

  const zero = toMoney("0.00");
  const grupoDaFicha = new Map<string, string>();
  const acc = new Map<
    string,
    { dotacao: Money; empenhada: Money; liquidada: Money; paga: Money }
  >();
  const get = (g: string) => {
    const a = acc.get(g) ?? { dotacao: zero, empenhada: zero, liquidada: zero, paga: zero };
    acc.set(g, a);
    return a;
  };

  for (const f of fichas) {
    const g = chaveNd(f.naturezaDespesa.codNatureza, f.naturezaDespesa.codElemento);
    grupoDaFicha.set(f.id, g);
    get(g).dotacao = toMoney(get(g).dotacao.plus(toMoney(f.valorDotado.toFixed(2))));
  }

  // CRÉDITOS: a dotação ATUALIZADA é a inicial ± os créditos abertos. Sem eles, um grupo
  // suplementado apareceria estourando a própria dotação.
  for (const it of await prisma.itemCredito.findMany({
    where: { ficha: { exercicio: p.exercicio } },
    select: { tipo: true, valor: true, fichaId: true },
  })) {
    const g = grupoDaFicha.get(it.fichaId);
    if (g === undefined) continue;
    const v = toMoney(it.valor.toFixed(2));
    const a = get(g);
    a.dotacao = it.tipo === "SUPLEMENTACAO" ? toMoney(a.dotacao.plus(v)) : toMoney(a.dotacao.minus(v));
  }

  // ⚠️ AS TRÊS SOMAS PASSAM PELA MESMA FUNÇÃO — `somaLiquidaEstornaveis`, a aritmética única do
  // repositório. O que muda é o RECORTE (a data do fato de cada estágio); a regra de "quem está
  // vivo", com anulação total e parcial, é uma só. Nenhum SUM bruto novo nasce aqui.
  const porGrupo = <T extends LinhaEstornavel>(
    linhas: readonly (T & { readonly fichaId: string })[]
  ): Map<string, T[]> => {
    const m = new Map<string, T[]>();
    for (const l of linhas) {
      const g = grupoDaFicha.get(l.fichaId);
      if (g === undefined) continue;
      const arr = m.get(g) ?? [];
      arr.push(l);
      m.set(g, arr);
    }
    return m;
  };

  const empenhos = await prisma.empenho.findMany({
    where: { ficha: { exercicio: p.exercicio }, data: { lte: p.ate } },
    select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true, fichaId: true },
  });
  for (const [g, arr] of porGrupo(
    empenhos.map((e) => ({
      id: e.id, valor: toMoney(e.valor.toFixed(2)),
      estornoDeId: e.estornoDeId, anulacaoParcialDeId: e.anulacaoParcialDeId, fichaId: e.fichaId,
    }))
  )) {
    get(g).empenhada = somaLiquidaEstornaveis(arr);
  }

  const liquidacoes = await prisma.liquidacao.findMany({
    where: { empenho: { ficha: { exercicio: p.exercicio } }, data: { lte: p.ate } },
    select: {
      id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true,
      empenho: { select: { fichaId: true } },
    },
  });
  for (const [g, arr] of porGrupo(
    liquidacoes.map((l) => ({
      id: l.id, valor: toMoney(l.valor.toFixed(2)),
      estornoDeId: l.estornoDeId, anulacaoParcialDeId: l.anulacaoParcialDeId, fichaId: l.empenho.fichaId,
    }))
  )) {
    get(g).liquidada = somaLiquidaEstornaveis(arr);
  }

  // ⚠️ O filtro por `ficha.exercicio` é o que mantém o RP FORA daqui. Ver o cabeçalho.
  const pagamentos = await prisma.pagamento.findMany({
    where: { liquidacao: { empenho: { ficha: { exercicio: p.exercicio } } }, data: { lte: p.ate } },
    select: {
      id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true,
      liquidacao: { select: { empenho: { select: { fichaId: true } } } },
    },
  });
  for (const [g, arr] of porGrupo(
    pagamentos.map((pg) => ({
      id: pg.id, valor: toMoney(pg.valor.toFixed(2)),
      estornoDeId: pg.estornoDeId, anulacaoParcialDeId: pg.anulacaoParcialDeId,
      fichaId: pg.liquidacao.empenho.fichaId,
    }))
  )) {
    get(g).paga = somaLiquidaEstornaveis(arr);
  }

  return new Map(
    [...acc.entries()].map(([g, a]) => [
      g,
      { dotacaoAtualizada: a.dotacao, empenhada: a.empenhada, liquidada: a.liquidada, paga: a.paga },
    ])
  );
}

export interface DespesaDaFonte {
  /** O que saiu do BANCO (bruto − retenções). Alimenta o caixa. */
  readonly pagoLiquido: Money;
  /** O que baixou da OBRIGAÇÃO (bruto). Alimenta o passivo. */
  readonly pagoBruto: Money;
  readonly liquidado: Money;
  /** liquidado − pagoBruto: o saldo de Fornecedores da fonte. */
  readonly obrigacoesAPagar: Money;
}

export async function despesaPorFonte(
  prisma: Tx,
  p: { readonly ate: Date }
): Promise<ReadonlyMap<string, DespesaDaFonte>> {
  // ⚠️ TODA linha de `Pagamento` entra aqui — inclusive a de PAGAMENTO DE RESTOS
  // A PAGAR, que o M08 cria como um `Pagamento` de verdade (restos.ts). É POR
  // ISSO que não existe um `pagamentosDeRpPorFonte` alimentando o caixa: o cheque
  // do RP já está nesta varredura. Contá-lo de novo pelo M08 pagaria o mesmo
  // fornecedor duas vezes no relatório.
  const pagamentos = await prisma.pagamento.findMany({
    where: { data: { lte: p.ate } },
    select: {
      id: true,
      valor: true,
      fonteId: true,
      estornoDeId: true,
      anulacaoParcialDeId: true,
      retencoes: { select: { tipo: true, valor: true } },
    },
  });

  const liquidacoes = await prisma.liquidacao.findMany({
    where: { data: { lte: p.ate } },
    select: {
      id: true,
      valor: true,
      estornoDeId: true,
      anulacaoParcialDeId: true,
      empenho: { select: { ficha: { select: { fonteId: true } } } },
    },
  });

  const fontes = new Set<string>([
    ...pagamentos.map((x) => x.fonteId),
    ...liquidacoes.map((x) => x.empenho.ficha.fonteId),
  ]);

  const por = new Map<string, DespesaDaFonte>();
  for (const fonteId of fontes) {
    const daFonte = pagamentos.filter((x) => x.fonteId === fonteId);

    // As duas somas passam pela MESMA função (a do M08): o que muda é qual valor
    // cada linha carrega. A regra de "quem está vivo" é uma só.
    const linhas = daFonte.map((x) => {
      const bruto = toMoney(x.valor.toFixed(2));
      return {
        id: x.id,
        estornoDeId: x.estornoDeId,
        anulacaoParcialDeId: x.anulacaoParcialDeId,
        bruto,
        liquido: tetoConciliavelDoPagamento(
          bruto,
          x.retencoes.map((r) => ({
            tipo: r.tipo,
            valor: toMoney(r.valor.toFixed(2)),
          }))
        ),
      };
    });

    const pagoBruto = somaLiquidaEstornaveis(
      linhas.map((l) => ({
        id: l.id,
        valor: l.bruto,
        estornoDeId: l.estornoDeId,
        anulacaoParcialDeId: l.anulacaoParcialDeId,
      }))
    );
    const pagoLiquido = somaLiquidaEstornaveis(
      linhas.map((l) => ({
        id: l.id,
        valor: l.liquido,
        estornoDeId: l.estornoDeId,
        anulacaoParcialDeId: l.anulacaoParcialDeId,
      }))
    );

    const liquidado = somaLiquidaEstornaveis(
      liquidacoes
        .filter((x) => x.empenho.ficha.fonteId === fonteId)
        .map((x) => ({
          id: x.id,
          valor: toMoney(x.valor.toFixed(2)),
          estornoDeId: x.estornoDeId,
          anulacaoParcialDeId: x.anulacaoParcialDeId,
        }))
    );

    por.set(fonteId, {
      pagoLiquido,
      pagoBruto,
      liquidado,
      obrigacoesAPagar: toMoney(liquidado.minus(pagoBruto)),
    });
  }

  return por;
}

// ═══════════════════════════════════════════════════════════════════════════════
// A EXECUÇÃO DA DESPESA, LISTADA — as leituras que a UI da 7.1 consome (TR 5.17).
//
// ⚠️ POR QUE ESTAS FUNÇÕES NASCEM AQUI, E NÃO NA PORTA (lib/portas/**)
// A borda pode LER o domínio, mas não pode DERIVAR dinheiro: derivar é decidir o
// que "empenhado" significa quando existe anulação parcial — e essa decisão já foi
// tomada, UMA vez, em `packages/estornaveis`. Um `SUM` novo na porta seria a
// segunda verdade sobre o mesmo empenho, e as duas divergiriam no primeiro estorno.
// A porta pergunta; quem soma é o módulo.
//
// ⚠️ NENHUMA COLUNA DE STATUS. O estado do empenho é DERIVADO, e a lista usa
// EXATAMENTE a função (e a forma de entrada) que `statusDeEmpenho()` usa no
// serviço — senão a tela e o serviço responderiam coisas diferentes sobre o mesmo
// empenho, e o usuário acreditaria na que estivesse na frente dele.
// ═══════════════════════════════════════════════════════════════════════════════

/** O recorte de toda lista de execução: um exercício e, opcionalmente, uma unidade. */
export interface RecorteDaExecucao {
  readonly exercicio: number;
  /** Código SAGRES (5 dígitos) da unidade orçamentária. Ausente = o ente inteiro. */
  readonly unidadeCodigo?: string | undefined;
  /**
   * ADITIVO (relatórios gerenciais): o código da FONTE DE RECURSOS.
   *
   * ⚠️ A FONTE É DA FICHA, NÃO DO EMPENHO. Ela é uma dimensão da DOTAÇÃO — quem tem
   * `fonteId` é a `FichaOrcamentaria`, e o empenho a herda por estar preso a uma ficha.
   * Por isso o filtro entra em `daFicha` e vale de graça para as três listas que passam
   * por ela (empenhos, liquidações, pagamentos) e para `listarFichas`: uma só definição
   * de "esta linha é da fonte X", em vez de quatro que divergiriam.
   *
   * ⚠️ E É POR ISSO QUE A FONTE **NÃO** TEM O PROBLEMA DO CREDOR (ver `doCredor`): a
   * anulação COPIA o `fichaId` do original, logo ela cai na mesma fonte e continua
   * visível para a aritmética líquida.
   */
  readonly fonteCodigo?: string | undefined;
}

export interface EmpenhoNaLista {
  readonly id: string;
  readonly numero: string;
  readonly data: Date;
  readonly credorCpfCnpj: string;
  readonly historico: string;
  readonly fichaNumero: number;
  readonly unidadeCodigo: string;
  readonly unidadeNome: string;
  readonly fonteCodigo: string;
  readonly categoriaOrdemCronologica: CategoriaOrdemCronologica;
  /** O BRUTO da nota de empenho — o valor de emissão. */
  readonly valor: Money;
  /** valor − anulações vivas (a total zera; as parciais subtraem). O "empenhado" da TR 5.17. */
  readonly empenhadoLiquido: Money;
  /** valor − empenhadoLiquido: quanto deste empenho já foi anulado. */
  readonly anulacoes: Money;
  readonly liquidado: Money;
  readonly pago: Money;
  /** empenhadoLiquido − liquidado. */
  readonly saldoALiquidar: Money;
  /** liquidado − pago: a obrigação viva deste empenho. */
  readonly saldoAPagar: Money;
  readonly anulado: boolean;
  readonly status: StatusEmpenho;
}

/**
 * O `where` da ficha — o recorte é sempre por exercício; unidade e fonte são opcionais.
 *
 * ⚠️ OS FILTROS COMPÕEM O `where` — zero pós-filtro em JS onde o SQL alcança (a regra do
 * `diario` em m12-relatorios/livros.ts, 5.94). Trazer o exercício inteiro do banco para
 * descartar 99% dele em memória é o mesmo erro em outra tela.
 */
function daFicha(p: RecorteDaExecucao): {
  readonly exercicio: number;
  readonly unidadeOrc?: { readonly codigo: string };
  readonly fonte?: { readonly codigo: string };
} {
  return {
    exercicio: p.exercicio,
    ...(p.unidadeCodigo !== undefined
      ? { unidadeOrc: { codigo: p.unidadeCodigo } }
      : {}),
    ...(p.fonteCodigo !== undefined ? { fonte: { codigo: p.fonteCodigo } } : {}),
  };
}

/** O recorte das listas de EMPENHO — o da execução mais o credor (que só o empenho tem). */
export interface RecorteDeEmpenhos extends RecorteDaExecucao {
  /**
   * CPF/CNPJ do credor, **só dígitos** — é o que a coluna guarda.
   *
   * ⚠️ NÃO EXISTE ENTIDADE CREDOR/FORNECEDOR NESTE SCHEMA. O `Empenho` carrega uma
   * STRING (`credorCpfCnpj`) e mais nada: não há nome, não há cadastro, não há FK. Logo
   * "filtrar por credor" é **casamento exato por documento**, nunca busca por nome — e a
   * tela tem de dizer isso ao usuário em vez de oferecer um campo que não funcionaria.
   */
  readonly credorCpfCnpj?: string | undefined;
}

/**
 * O `where` do CREDOR — e por que ele NÃO é um `{ credorCpfCnpj }` simples.
 *
 * ═══ ⚠️ A ANULAÇÃO **NÃO COPIA** O CREDOR — ELA O SUBSTITUI POR UM SENTINELA ═══
 * O adapter grava `credorCpfCnpj: "ANULACAO"` no estorno total, `"ANULACAO_PARCIAL"` na
 * parcial e `"ESTORNO_ANULACAO_PARCIAL"` no estorno da parcial. É diferente do
 * `contratoId` e do `obraId`, que a anulação COPIA justamente para não sumir das somas.
 *
 * Consequência, se o filtro fosse `where: { credorCpfCnpj: doc }`: a varredura traria o
 * empenho ORIGINAL e deixaria as anulações DELE de fora. `liquidoDeUmFato` só enxerga o
 * que está no conjunto — sem a linha do estorno, ele não tem como saber que o fato morreu
 * e devolve o valor CHEIO. A tela filtrada mostraria, para aquele credor, dinheiro que já
 * não existe. É exatamente a armadilha que o cabeçalho de `listarEmpenhos` descreve.
 *
 * A solução continua sendo SQL (nada de pós-filtro): o `OR` alcança o credor pelo próprio
 * empenho OU pelo PAI dele. Três níveis, porque a cadeia tem três:
 *   original ← anulação parcial ← estorno da anulação parcial.
 */
function doCredor(credorCpfCnpj: string | undefined): {
  OR?: {
    credorCpfCnpj?: string;
    estornoDe?: {
      credorCpfCnpj?: string;
      anulacaoParcialDe?: { credorCpfCnpj: string };
    };
    anulacaoParcialDe?: { credorCpfCnpj: string };
  }[];
} {
  if (credorCpfCnpj === undefined) return {};
  return {
    OR: [
      { credorCpfCnpj },
      // A anulação TOTAL e a PARCIAL apontam para o original.
      { estornoDe: { credorCpfCnpj } },
      { anulacaoParcialDe: { credorCpfCnpj } },
      // O estorno da anulação parcial aponta para a PARCIAL (cujo credor é o sentinela).
      { estornoDe: { anulacaoParcialDe: { credorCpfCnpj } } },
    ],
  };
}

/**
 * Toda linha estornável tem a mesma forma; o `map` é um só.
 *
 * ⚠️ EXPORTADO para `./dossie.ts` — e exportar foi a alternativa MENOS ruim. O dossiê do
 * empenho monta a mesma aritmética líquida sobre o mesmo conjunto de fatos; recopiá-la lá
 * criaria uma segunda noção de "quanto deste empenho ainda vale", e as duas divergiriam no
 * primeiro caso que só uma delas conhecesse (a anulação da anulação, por exemplo).
 */
export function comoLinha(x: {
  readonly id: string;
  readonly valor: { toFixed: (n: number) => string };
  readonly estornoDeId: string | null;
  readonly anulacaoParcialDeId: string | null;
}): LinhaEstornavel {
  return {
    id: x.id,
    valor: toMoney(x.valor.toFixed(2)),
    estornoDeId: x.estornoDeId,
    anulacaoParcialDeId: x.anulacaoParcialDeId,
  };
}

/**
 * O LÍQUIDO DE UM FATO SÓ: valor − parciais vivas, ou 0,00 se ele foi anulado TOTAL.
 *
 * ⚠️ POR QUE NÃO É O `liquidoDoFato` DE `packages/estornaveis`.
 * O `liquidoDoFato` de lá recorta o conjunto em `l.id === fatoId || l.anulacaoParcialDeId
 * === fatoId` — ou seja, JOGA FORA a linha do estorno TOTAL (que aponta por
 * `estornoDeId`). Sem essa linha, `somaLiquidaEstornaveis` não tem como saber que o fato
 * morreu, e devolve o valor CHEIO de um empenho anulado. O docstring de lá promete o
 * contrário ("Devolve 0,00 se o fato foi anulado TOTALMENTE"); a função não cumpre.
 *
 * Ela tem ZERO chamadores no repositório e nenhum teste — este foi o primeiro uso real, e
 * o t1 de `m05-consultas-execucao.test.ts` pegou a divergência. Corrigir lá é mexer em
 * `packages/estornaveis/index.ts`, fora do escopo desta fatia (só borda). Fica NOMEADO:
 * pendência **liquidoDoFato-anulacao-total** (ver components/ui/MODULO-UI.md).
 *
 * A ARITMÉTICA CONTINUA SENDO UMA: `somaLiquidaEstornaveis`. O que muda aqui é só o
 * RECORTE — o fato, as parciais dele e os estornos dele.
 */
export function liquidoDeUmFato(
  fatoId: string,
  universo: readonly LinhaEstornavel[]
): Money {
  return somaLiquidaEstornaveis(
    universo.filter(
      (l) =>
        l.id === fatoId ||
        l.anulacaoParcialDeId === fatoId ||
        l.estornoDeId === fatoId
    )
  );
}

/**
 * OS EMPENHOS DO EXERCÍCIO (e da unidade, se houver), com os saldos da TR 5.17.
 *
 * ⚠️ A VARREDURA TRAZ AS ANULAÇÕES JUNTO — e tem de trazer. `liquidoDoFato` precisa
 * ver o original E as anulações dele no MESMO conjunto; filtrá-las no `where` faria
 * todo empenho parecer inteiro, e a tela mostraria dinheiro que já não existe. Elas
 * entram na aritmética e ficam fora da LISTA: só originais viram linha.
 */
export async function listarEmpenhos(
  prisma: Tx,
  p: RecorteDeEmpenhos
): Promise<readonly EmpenhoNaLista[]> {
  const linhas = await prisma.empenho.findMany({
    // ⚠️ Fonte pela FICHA, credor pelo EMPENHO (e pelos pais dele — ver `doCredor`).
    where: { ficha: daFicha(p), ...doCredor(p.credorCpfCnpj) },
    orderBy: [{ data: "desc" }, { numero: "desc" }],
    select: {
      id: true,
      numero: true,
      data: true,
      credorCpfCnpj: true,
      historico: true,
      valor: true,
      estornoDeId: true,
      anulacaoParcialDeId: true,
      categoriaOrdemCronologica: true,
      estornos: { select: { id: true } },
      ficha: {
        select: {
          numero: true,
          fonte: { select: { codigo: true } },
          unidadeOrc: { select: { codigo: true, descricao: true } },
        },
      },
    },
  });

  const universo = linhas.map(comoLinha);
  const originais = linhas.filter(
    (l) => l.estornoDeId === null && l.anulacaoParcialDeId === null
  );
  const ids = originais.map((e) => e.id);

  const liquidadoPor = await liquidadoDosEmpenhos(prisma, ids);
  const pagoPor = await pagoDosEmpenhos(prisma, ids);

  return originais.map((e) => {
    const valor = toMoney(e.valor.toFixed(2));
    const empenhadoLiquido = liquidoDeUmFato(e.id, universo);
    const liquidado = liquidadoPor.get(e.id) ?? toMoney("0.00");
    const pago = pagoPor.get(e.id) ?? toMoney("0.00");
    const anulado = e.estornos.length > 0;

    return {
      id: e.id,
      numero: e.numero,
      data: e.data,
      credorCpfCnpj: e.credorCpfCnpj,
      historico: e.historico,
      fichaNumero: e.ficha.numero,
      unidadeCodigo: e.ficha.unidadeOrc.codigo,
      unidadeNome: e.ficha.unidadeOrc.descricao,
      fonteCodigo: e.ficha.fonte.codigo,
      categoriaOrdemCronologica: e.categoriaOrdemCronologica,
      valor,
      empenhadoLiquido,
      anulacoes: toMoney(valor.minus(empenhadoLiquido)),
      liquidado,
      pago,
      saldoALiquidar: toMoney(empenhadoLiquido.minus(liquidado)),
      saldoAPagar: toMoney(liquidado.minus(pago)),
      anulado,
      // ⚠️ A MESMA entrada que o serviço monta: `empenhado` é o valor de EMISSÃO e
      // `anulado` é "tem estorno total" (ver `totaisDoEmpenho` no adapter).
      status: statusDoEmpenho({ empenhado: valor, liquidado, pago, anulado }),
    };
  });
}

/**
 * O VOCABULÁRIO DO FILTRO — os credores e as fontes que REALMENTE existem no recorte.
 *
 * ⚠️ POR QUE ISTO EXISTE, EM VEZ DE DOIS CAMPOS DE TEXTO LIVRE. Sem cadastro de credor
 * (ver `RecorteDeEmpenhos.credorCpfCnpj`), um campo livre transformaria todo erro de
 * digitação — um dígito a menos, um CPF de outro ente — em "nenhum empenho encontrado".
 * O usuário leria isso como "este credor não recebeu nada", que é uma resposta FALSA
 * dada com a cara de verdadeira. Um `select` montado a partir dos documentos que estão
 * no banco não tem como produzir essa mentira: toda escolha rende ao menos uma linha.
 *
 * ⚠️ SÓ ORIGINAIS (`estornoDeId: null, anulacaoParcialDeId: null`). É o que mantém os
 * sentinelas "ANULACAO"/"ANULACAO_PARCIAL"/"ESTORNO_ANULACAO_PARCIAL" fora da lista de
 * credores — eles são marcas de anulação, não pessoas, e oferecê-los como opção seria
 * convidar o usuário a filtrar por um credor que não existe.
 *
 * ⚠️ O VOCABULÁRIO IGNORA O PRÓPRIO FILTRO (o chamador passa só exercício/unidade). Se
 * ele fosse filtrado pelo que já está selecionado, o `select` colapsaria para uma opção
 * e o usuário não teria como trocar de credor sem limpar tudo antes.
 */
export interface VocabularioDosEmpenhos {
  /** CPF/CNPJ distintos, só dígitos, em ordem. */
  readonly credores: readonly string[];
  /** Códigos de fonte de recursos com pelo menos um empenho no recorte. */
  readonly fontes: readonly string[];
}

export async function vocabularioDosEmpenhos(
  prisma: Tx,
  p: RecorteDaExecucao
): Promise<VocabularioDosEmpenhos> {
  // `distinct` no SQL — não é um `Set` em memória sobre o exercício inteiro.
  const credores = await prisma.empenho.findMany({
    where: { ficha: daFicha(p), estornoDeId: null, anulacaoParcialDeId: null },
    distinct: ["credorCpfCnpj"],
    orderBy: { credorCpfCnpj: "asc" },
    select: { credorCpfCnpj: true },
  });

  // A fonte é da FICHA; `empenhos: { some: {} }` tira as fichas que nunca foram
  // executadas — oferecer uma fonte sem empenho seria oferecer uma tela vazia.
  const fichas = await prisma.fichaOrcamentaria.findMany({
    where: { ...daFicha(p), empenhos: { some: {} } },
    distinct: ["fonteId"],
    select: { fonte: { select: { codigo: true } } },
  });

  return {
    credores: credores.map((c) => c.credorCpfCnpj),
    fontes: fichas.map((f) => f.fonte.codigo).sort((a, b) => a.localeCompare(b)),
  };
}

/** Liquidado LÍQUIDO por empenho — a soma do adapter, em lote. */
async function liquidadoDosEmpenhos(
  prisma: Tx,
  empenhoIds: readonly string[]
): Promise<ReadonlyMap<string, Money>> {
  if (empenhoIds.length === 0) return new Map();

  const linhas = await prisma.liquidacao.findMany({
    where: { empenhoId: { in: [...empenhoIds] } },
    select: {
      id: true,
      empenhoId: true,
      valor: true,
      estornoDeId: true,
      anulacaoParcialDeId: true,
    },
  });

  const por = new Map<string, Money>();
  for (const id of empenhoIds) {
    por.set(
      id,
      somaLiquidaEstornaveis(
        linhas.filter((l) => l.empenhoId === id).map(comoLinha)
      )
    );
  }
  return por;
}

/**
 * Pago (BRUTO) por empenho, contado por liquidação VIVA — a mesma exclusão que
 * `pagoDoEmpenho` faz no adapter: uma liquidação anulada não carrega pagamento.
 */
async function pagoDosEmpenhos(
  prisma: Tx,
  empenhoIds: readonly string[]
): Promise<ReadonlyMap<string, Money>> {
  const por = new Map<string, Money>();
  for (const id of empenhoIds) por.set(id, toMoney("0.00"));
  if (empenhoIds.length === 0) return por;

  const liquidacoes = await prisma.liquidacao.findMany({
    where: { empenhoId: { in: [...empenhoIds] }, estornoDeId: null },
    select: { id: true, empenhoId: true, estornos: { select: { id: true } } },
  });
  const vivas = liquidacoes.filter((l) => l.estornos.length === 0);
  if (vivas.length === 0) return por;

  const pagamentos = await prisma.pagamento.findMany({
    where: { liquidacaoId: { in: vivas.map((l) => l.id) } },
    select: {
      id: true,
      liquidacaoId: true,
      valor: true,
      estornoDeId: true,
      anulacaoParcialDeId: true,
    },
  });

  for (const l of vivas) {
    const daLiquidacao = somaLiquidaEstornaveis(
      pagamentos.filter((x) => x.liquidacaoId === l.id).map(comoLinha)
    );
    por.set(
      l.empenhoId,
      toMoney((por.get(l.empenhoId) ?? toMoney("0.00")).plus(daLiquidacao))
    );
  }
  return por;
}

export interface LiquidacaoNaLista {
  readonly id: string;
  readonly numero: string;
  readonly data: Date;
  readonly responsavelAtesto: string;
  readonly valor: Money;
  /** valor − anulações parciais vivas. */
  readonly liquidadoLiquido: Money;
  readonly pago: Money;
  /** liquidadoLiquido − pago: o que ainda entra na fila do art. 141. */
  readonly saldoAPagar: Money;
  readonly anulado: boolean;
  // A ORIGEM — de qual empenho esta liquidação saiu.
  readonly empenhoId: string;
  readonly empenhoNumero: string;
  readonly credorCpfCnpj: string;
  readonly fonteCodigo: string;
}

/** As liquidações do exercício (e da unidade), mais recentes primeiro. */
export async function listarLiquidacoes(
  prisma: Tx,
  p: RecorteDaExecucao
): Promise<readonly LiquidacaoNaLista[]> {
  const linhas = await prisma.liquidacao.findMany({
    where: { empenho: { ficha: daFicha(p) } },
    orderBy: [{ data: "desc" }, { numero: "desc" }],
    select: {
      id: true,
      numero: true,
      data: true,
      responsavelAtesto: true,
      valor: true,
      estornoDeId: true,
      anulacaoParcialDeId: true,
      estornos: { select: { id: true } },
      empenhoId: true,
      empenho: {
        select: {
          numero: true,
          credorCpfCnpj: true,
          ficha: { select: { fonte: { select: { codigo: true } } } },
        },
      },
    },
  });

  const universo = linhas.map(comoLinha);
  const originais = linhas.filter(
    (l) => l.estornoDeId === null && l.anulacaoParcialDeId === null
  );
  const pagos = await pagoDasLiquidacoes(
    prisma,
    originais.map((l) => l.id)
  );

  return originais.map((l) => {
    const liquidadoLiquido = liquidoDeUmFato(l.id, universo);
    const pago = pagos.get(l.id) ?? toMoney("0.00");
    return {
      id: l.id,
      numero: l.numero,
      data: l.data,
      responsavelAtesto: l.responsavelAtesto,
      valor: toMoney(l.valor.toFixed(2)),
      liquidadoLiquido,
      pago,
      saldoAPagar: toMoney(liquidadoLiquido.minus(pago)),
      anulado: l.estornos.length > 0,
      empenhoId: l.empenhoId,
      empenhoNumero: l.empenho.numero,
      credorCpfCnpj: l.empenho.credorCpfCnpj,
      fonteCodigo: l.empenho.ficha.fonte.codigo,
    };
  });
}

/**
 * OS PAGAMENTOS EXECUTADOS de um exercício/unidade — o que a tela de anulação (TR 5.35) precisa.
 *
 * ⚠️ A FILA (M06) mostra o que FALTA pagar; esta lista mostra o que JÁ foi pago — são perguntas
 * opostas, e a anulação de pagamento pergunta a segunda. `pagoLiquido` é o valor menos as anulações
 * parciais vivas (o saldo ainda anulável); `estornavel` diz se o pagamento inteiro pode ser
 * estornado (um pagamento não tem nível de baixo — só não se estorna o que já foi anulado).
 */
export interface PagamentoNaLista {
  readonly id: string;
  readonly numero: string;
  readonly data: Date;
  readonly valor: Money;
  /** valor − anulações parciais vivas: o que ainda se pode anular. */
  readonly pagoLiquido: Money;
  readonly anulado: boolean;
  readonly liquidacaoId: string;
  readonly liquidacaoNumero: string;
  readonly empenhoNumero: string;
  readonly credorCpfCnpj: string;
  readonly fonteCodigo: string;
}

export async function listarPagamentos(
  prisma: Tx,
  p: RecorteDaExecucao
): Promise<readonly PagamentoNaLista[]> {
  const linhas = await prisma.pagamento.findMany({
    where: { liquidacao: { empenho: { ficha: daFicha(p) } } },
    orderBy: [{ data: "desc" }, { numero: "desc" }],
    select: {
      id: true,
      numero: true,
      data: true,
      valor: true,
      estornoDeId: true,
      anulacaoParcialDeId: true,
      estornos: { select: { id: true } },
      liquidacaoId: true,
      liquidacao: {
        select: {
          numero: true,
          empenho: {
            select: {
              numero: true,
              credorCpfCnpj: true,
              ficha: { select: { fonte: { select: { codigo: true } } } },
            },
          },
        },
      },
    },
  });

  const universo = linhas.map(comoLinha);
  const originais = linhas.filter(
    (l) => l.estornoDeId === null && l.anulacaoParcialDeId === null
  );

  return originais.map((l) => ({
    id: l.id,
    numero: l.numero,
    data: l.data,
    valor: toMoney(l.valor.toFixed(2)),
    pagoLiquido: liquidoDeUmFato(l.id, universo),
    anulado: l.estornos.length > 0,
    liquidacaoId: l.liquidacaoId,
    liquidacaoNumero: l.liquidacao.numero,
    empenhoNumero: l.liquidacao.empenho.numero,
    credorCpfCnpj: l.liquidacao.empenho.credorCpfCnpj,
    fonteCodigo: l.liquidacao.empenho.ficha.fonte.codigo,
  }));
}

/** Pago (BRUTO) por liquidação. */
async function pagoDasLiquidacoes(
  prisma: Tx,
  liquidacaoIds: readonly string[]
): Promise<ReadonlyMap<string, Money>> {
  if (liquidacaoIds.length === 0) return new Map();

  const pagamentos = await prisma.pagamento.findMany({
    where: { liquidacaoId: { in: [...liquidacaoIds] } },
    select: {
      id: true,
      liquidacaoId: true,
      valor: true,
      estornoDeId: true,
      anulacaoParcialDeId: true,
    },
  });

  const por = new Map<string, Money>();
  for (const id of liquidacaoIds) {
    por.set(
      id,
      somaLiquidaEstornaveis(
        pagamentos.filter((x) => x.liquidacaoId === id).map(comoLinha)
      )
    );
  }
  return por;
}

/**
 * O CREDOR E O EMPENHO DE CADA LIQUIDAÇÃO — o que a FILA do art. 141 não carrega.
 *
 * `LiquidacaoNaFila` (M06) é deliberadamente magra: id, número, data, fonte,
 * categoria e saldo. Ela não sabe quem é o credor, e não deveria — a ordem
 * cronológica não depende de quem vai receber, e um campo `credor` no M06 viraria
 * um segundo lugar onde o credor mora.
 *
 * Mas a TELA da fila (TR 5.29) precisa dizer QUEM está na frente. Então o painel
 * pergunta ao dono do dado: o credor é do `Empenho`, e o `Empenho` é do M05.
 */
export interface DadosDaLiquidacao {
  readonly liquidacaoId: string;
  readonly numero: string;
  readonly empenhoNumero: string;
  readonly credorCpfCnpj: string;
  readonly historico: string;
  /** O líquido da liquidação (já descontadas as anulações parciais vivas). */
  readonly valorLiquidado: Money;
}

/**
 * A NATUREZA DA DESPESA DE UM EMPENHO — o que decide o roteiro da liquidação.
 *
 * ⚠️ POR QUE ISTO NASCE AGORA. `roteiroLiquidacao(codElemento)` (M01) pergunta "a
 * despesa incorrida virou o quê?" — VPD, estoque ou baixa de passivo. A resposta está
 * na natureza da ficha do empenho, e NENHUM leitor a devolvia: `EmpenhoResumo` não a
 * tem, e o único lugar que a lê é o guard privado `exigirVinculoDeObra`, no adapter.
 *
 * O caminho é `Empenho → ficha → naturezaDespesa` — o mesmo que o guard já percorre.
 * `null` = o empenho não existe (quem decide o que fazer com isso é o chamador).
 */
export interface NaturezaDoEmpenho {
  readonly codElemento: string;
  readonly codigoCompleto: string;
  readonly descricao: string;
}

export async function naturezaDoEmpenho(
  prisma: Tx,
  empenhoId: string
): Promise<NaturezaDoEmpenho | null> {
  const e = await prisma.empenho.findUnique({
    where: { id: empenhoId },
    select: {
      ficha: {
        select: {
          naturezaDespesa: {
            select: {
              codElemento: true,
              codigoCompleto: true,
              descricao: true,
            },
          },
        },
      },
    },
  });
  if (e === null) return null;
  return {
    codElemento: e.ficha.naturezaDespesa.codElemento,
    codigoCompleto: e.ficha.naturezaDespesa.codigoCompleto,
    descricao: e.ficha.naturezaDespesa.descricao,
  };
}

/**
 * AS FICHAS DE UM EXERCÍCIO/UNIDADE — o vocabulário do form de empenho.
 *
 * O saldo DISPONÍVEL vem da coluna cache (`saldoDisponivel`), e aqui isso é correto: é
 * um número de ORIENTAÇÃO, para o usuário escolher a ficha. Quem DECIDE se cabe é o
 * `empenhar`, que lê o SUM real dentro da transação — a tela sugere, o domínio julga.
 * Usar o cache para decidir seria a corrida que o INVARIANTE 3 existe para impedir.
 */
export interface FichaNaLista {
  readonly id: string;
  readonly numero: number;
  readonly unidadeCodigo: string;
  readonly unidadeNome: string;
  readonly fonteCodigo: string;
  readonly naturezaCodigo: string;
  readonly naturezaDescricao: string;
  readonly codElemento: string;
  /** Cache — orientação para a tela, nunca decisão. Ver acima. */
  readonly saldoDisponivel: Money;
}

export async function listarFichas(
  prisma: Tx,
  p: RecorteDaExecucao
): Promise<readonly FichaNaLista[]> {
  const fichas = await prisma.fichaOrcamentaria.findMany({
    where: daFicha(p),
    orderBy: { numero: "asc" },
    select: {
      id: true,
      numero: true,
      saldoDisponivel: true,
      fonte: { select: { codigo: true } },
      unidadeOrc: { select: { codigo: true, descricao: true } },
      naturezaDespesa: {
        select: { codigoCompleto: true, descricao: true, codElemento: true },
      },
    },
  });

  return fichas.map((f) => ({
    id: f.id,
    numero: f.numero,
    unidadeCodigo: f.unidadeOrc.codigo,
    unidadeNome: f.unidadeOrc.descricao,
    fonteCodigo: f.fonte.codigo,
    naturezaCodigo: f.naturezaDespesa.codigoCompleto,
    naturezaDescricao: f.naturezaDespesa.descricao,
    codElemento: f.naturezaDespesa.codElemento,
    saldoDisponivel: toMoney(f.saldoDisponivel.toFixed(2)),
  }));
}

/**
 * AS CONTAS BANCÁRIAS — o select do pagamento, e a fonte que vem junto.
 *
 * ⚠️ A FONTE SAI DAQUI, NÃO DE UM CAMPO SEPARADO NO FORM. A TR 5.23 exige que a fonte
 * do pagamento case com a do banco de onde o dinheiro sai — e o adapter confere. Pedir
 * as duas coisas ao usuário seria oferecer a ele a chance de errar num guard que o
 * sistema já sabe responder: a conta bancária JÁ conhece a fonte dela.
 */
export interface ContaBancariaNaLista {
  readonly codigo: string;
  readonly descricao: string;
  readonly fonteId: string;
  readonly fonteCodigo: string;
}

export async function listarContasBancarias(
  prisma: Tx
): Promise<readonly ContaBancariaNaLista[]> {
  const contas = await prisma.contaBancaria.findMany({
    orderBy: { codigo: "asc" },
    select: {
      codigo: true,
      descricao: true,
      fonteId: true,
      fonte: { select: { codigo: true } },
    },
  });
  return contas.map((c) => ({
    codigo: c.codigo,
    descricao: c.descricao,
    fonteId: c.fonteId,
    fonteCodigo: c.fonte.codigo,
  }));
}

export async function dadosDasLiquidacoes(
  prisma: Tx,
  liquidacaoIds: readonly string[]
): Promise<ReadonlyMap<string, DadosDaLiquidacao>> {
  if (liquidacaoIds.length === 0) return new Map();

  const alvos = await prisma.liquidacao.findMany({
    where: { id: { in: [...liquidacaoIds] } },
    select: {
      id: true,
      numero: true,
      empenhoId: true,
      empenho: {
        select: { numero: true, credorCpfCnpj: true, historico: true },
      },
    },
  });
  if (alvos.length === 0) return new Map();

  // O líquido de cada alvo exige ver as anulações parciais DELE — que são linhas
  // irmãs (mesmo empenho), não filhas. Daí a segunda varredura.
  const irmas = await prisma.liquidacao.findMany({
    where: { empenhoId: { in: [...new Set(alvos.map((a) => a.empenhoId))] } },
    select: {
      id: true,
      valor: true,
      estornoDeId: true,
      anulacaoParcialDeId: true,
    },
  });
  const universo = irmas.map(comoLinha);

  const por = new Map<string, DadosDaLiquidacao>();
  for (const a of alvos) {
    por.set(a.id, {
      liquidacaoId: a.id,
      numero: a.numero,
      empenhoNumero: a.empenho.numero,
      credorCpfCnpj: a.empenho.credorCpfCnpj,
      historico: a.empenho.historico,
      valorLiquidado: liquidoDeUmFato(a.id, universo),
    });
  }
  return por;
}
