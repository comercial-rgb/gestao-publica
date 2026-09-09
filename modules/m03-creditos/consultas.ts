import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { Decimal, toMoney } from "../../packages/contracts/index.js";
// ⚠️ A ARITMÉTICA DA DOTAÇÃO NÃO NASCE AQUI. `calcularSaldos` é a função PURA do M05 que já
// traduz Σ(MovimentoDotacao por tipo) nos saldos da ficha — é ela que o `recalcularCache` usa
// para escrever o cache, e é ela que a `reconciliarFicha` usa para conferir o cache. O QDD lê
// pela MESMA função: uma terceira soma de dotação seria a que divergiria das outras duas.
import { calcularSaldos, type TipoMovimentoDotacao, type TotaisPorTipo } from "../m05-despesa/dominio.js";

/**
 * LEITURA do M03 (créditos adicionais) — para as telas/relatórios. LEITURA PURA: só `findMany`, sem
 * `create/update/aggregate` (o teste-invariante do módulo prova). Os totais são SOMAS de valores que
 * já existem (Σ dos itens) — reporte, não aritmética nova de negócio.
 *
 * "Encerrado?" é DERIVADO da existência de um `DecretoEncerramento` (append-only) — nunca coluna.
 */

export interface ItemDecretoNaLista {
  readonly id: string;
  readonly tipo: "SUPLEMENTACAO" | "ANULACAO";
  /** Dinheiro em string (regra de ouro na borda). */
  readonly valor: string;
  readonly fichaNumero: number;
  readonly unidadeCodigo: string;
  readonly fonteCodigo: string;
  readonly anulado: boolean;
}

export interface DecretoNaLista {
  readonly id: string;
  readonly numero: string;
  readonly ano: number;
  readonly data: Date;
  readonly origemRecurso: "ANULACAO" | "SUPERAVIT_FINANCEIRO" | "EXCESSO_ARRECADACAO" | "OPERACAO_CREDITO";
  readonly leiNumero: string;
  readonly leiAno: number;
  readonly tipoCredito: "SUPLEMENTAR" | "ESPECIAL" | "EXTRAORDINARIO";
  readonly encerrado: boolean;
  readonly encerramento: { readonly data: Date; readonly motivo: string } | null;
  /** 4.27-4.28: suplementado (Σ SUPLEMENTACAO viva), anulado (Σ ANULACAO viva), diferença = líquido. Strings. */
  readonly suplementado: string;
  readonly anulado: string;
  readonly diferenca: string;
  readonly itens: readonly ItemDecretoNaLista[];
}

/** Um item vivo? (não é estorno e não foi estornado.) */
function vivo(i: { estornoDeId: string | null; estornos: readonly unknown[] }): boolean {
  return i.estornoDeId === null && i.estornos.length === 0;
}

/** Os decretos de crédito do exercício, com os totais por decreto e o estado de encerramento. */
export async function listarDecretos(
  prisma: PrismaClient,
  params: { readonly ano: number }
): Promise<DecretoNaLista[]> {
  const decretos = await prisma.decretoCredito.findMany({
    where: { ano: params.ano },
    include: {
      lei: { select: { numero: true, ano: true, tipoCredito: true } },
      encerramento: { select: { data: true, motivo: true } },
      itens: {
        include: {
          ficha: { select: { numero: true, unidadeOrc: { select: { codigo: true } } } },
          fonte: { select: { codigo: true } },
          estornos: { select: { id: true } },
        },
      },
    },
    orderBy: [{ ano: "asc" }, { numero: "asc" }],
  });

  return decretos.map((d) => {
    let suplementado = new Decimal(0);
    let anulado = new Decimal(0);
    const itens: ItemDecretoNaLista[] = d.itens.map((i) => {
      const estaVivo = vivo(i);
      if (estaVivo && i.tipo === "SUPLEMENTACAO") suplementado = suplementado.plus(i.valor);
      if (estaVivo && i.tipo === "ANULACAO") anulado = anulado.plus(i.valor);
      return {
        id: i.id,
        tipo: i.tipo,
        valor: i.valor.toFixed(2),
        fichaNumero: i.ficha.numero,
        unidadeCodigo: i.ficha.unidadeOrc.codigo,
        fonteCodigo: i.fonte.codigo,
        anulado: !estaVivo,
      };
    });
    return {
      id: d.id,
      numero: d.numero,
      ano: d.ano,
      data: d.data,
      origemRecurso: d.origemRecurso,
      leiNumero: d.lei.numero,
      leiAno: d.lei.ano,
      tipoCredito: d.lei.tipoCredito,
      encerrado: d.encerramento !== null,
      encerramento: d.encerramento !== null ? { data: d.encerramento.data, motivo: d.encerramento.motivo } : null,
      suplementado: suplementado.toFixed(2),
      anulado: anulado.toFixed(2),
      diferenca: suplementado.minus(anulado).toFixed(2),
      itens,
    };
  });
}

/** As leis de crédito do exercício (para o SELECT do form de decreto). */
export interface LeiNaLista {
  readonly id: string;
  readonly numero: string;
  readonly ano: number;
  readonly tipoCredito: "SUPLEMENTAR" | "ESPECIAL" | "EXTRAORDINARIO";
  readonly valorAutorizado: string;
}

export async function listarLeis(prisma: PrismaClient, params: { readonly ano: number }): Promise<LeiNaLista[]> {
  const leis = await prisma.leiCredito.findMany({ where: { ano: params.ano }, orderBy: [{ numero: "asc" }] });
  return leis.map((l) => ({ id: l.id, numero: l.numero, ano: l.ano, tipoCredito: l.tipoCredito, valorAutorizado: l.valorAutorizado.toFixed(2) }));
}

// ── QDD — A DOTAÇÃO DE CADA FICHA, INICIAL E ATUALIZADA ────────────────────────────
/**
 * O QUADRO DE DETALHAMENTO DA DESPESA (QDD) — uma linha por ficha, com a coluna que o M03
 * existe para produzir: a **dotação ATUALIZADA** (TR 4.20–4.40).
 *
 * ═══ ⚠️ POR QUE ISTO NÃO SOMA NADA DE NOVO ═══
 *   dotação atualizada = dotação inicial + Σ(CREDITO_ADICIONAL) − Σ(ANULACAO_CREDITO)
 *
 * Essa identidade JÁ existe, e num lugar só: a tabela `SINAIS` do `m05-despesa/dominio`, que diz
 * que os três tipos caem no saldo "autorizado" com sinal +1, +1 e −1. `calcularSaldos` a aplica.
 * Reescrever a soma aqui criaria uma SEGUNDA definição de dotação atualizada — e a primeira vez
 * que um tipo novo de movimento entrasse (uma RESERVA que virasse crédito, digamos), o QDD e o
 * saldo da ficha passariam a discordar sem que nenhum teste falhasse. Por isso a leitura monta o
 * `TotaisPorTipo` e DELEGA.
 *
 * ═══ ⚠️ POR QUE O `MovimentoDotacao`, E NÃO AS COLUNAS DE SALDO DA FICHA ═══
 * `ficha.saldoAutorizado` é CACHE (o schema do M02 o diz em letras maiúsculas) — orientação, nunca
 * fonte da verdade. O QDD é um demonstrativo: ele lê os FATOS (os movimentos), que é exatamente o
 * que a `reconciliarFicha` compara contra o cache. Um relatório que lê o cache não pode servir de
 * conferência dele.
 *
 * ═══ ⚠️ "INICIAL" É O MOVIMENTO, NÃO O `valorDotado` ═══
 * `ficha.valorDotado` é o campo da LOA; `DOTACAO_INICIAL` é o FATO de ele ter sido lançado. Eles
 * nascem juntos, na mesma transação (adapter do M02), e é por isso que dá no mesmo — mas ler o
 * fato mantém as três colunas do QDD vindo da MESMA origem, e a soma inicial+créditos fecha com a
 * atualizada por construção, não por coincidência.
 *
 * LEITURA PURA: um `findMany` de fichas com os movimentos embutidos. Sem `groupBy` (que é
 * agregação no banco) e sem escrita.
 */
export interface LinhaQdd {
  readonly fichaId: string;
  readonly numero: number;
  // ── A CHAVE ORÇAMENTÁRIA COMPLETA ────────────────────────────────────────────────
  // ⚠️ POR QUE A CHAVE INTEIRA, E NÃO SÓ A UNIDADE. O QDD é o quadro que o servidor usa para
  // ACHAR a dotação certa antes de empenhar, e a ficha só é identificável pela classificação
  // funcional-programática inteira (a `uq_ficha_sagres` do M02 é exatamente esta lista). Duas
  // fichas da mesma unidade, mesma natureza e mesma fonte diferem só no programa/ação — mostrar
  // apenas UG+natureza faria duas linhas visualmente idênticas com dotações diferentes, e a
  // escolha entre elas viraria adivinhação. Aditivo: quem já lia só unidade/fonte/natureza
  // continua compilando.
  readonly orgaoCodigo: string;
  readonly orgaoNome: string;
  readonly unidadeCodigo: string;
  readonly unidadeNome: string;
  readonly programaCodigo: string;
  readonly programaDescricao: string;
  readonly funcaoCodigo: string;
  readonly funcaoNome: string;
  readonly subfuncaoCodigo: string;
  readonly subfuncaoNome: string;
  readonly acaoCodigo: string;
  readonly acaoDescricao: string;
  /** CO (Código de Acompanhamento, SAGRES-PB) — NULLABLE no schema: nem toda ficha tem. */
  readonly coCodigo: string | null;
  readonly coDescricao: string | null;
  /** O id da fonte — o form de crédito o usa para a perna do movimento (a fonte É a da ficha). */
  readonly fonteId: string;
  readonly fonteCodigo: string;
  readonly naturezaCodigo: string;
  readonly naturezaDescricao: string;
  /** Σ DOTACAO_INICIAL — o que a LOA fixou. String decimal (regra de ouro na borda). */
  readonly dotacaoInicial: string;
  /** Σ CREDITO_ADICIONAL — o que os decretos suplementaram nesta ficha. */
  readonly creditoSuplementado: string;
  /** Σ ANULACAO_CREDITO — o que os decretos tiraram desta ficha. */
  readonly creditoAnulado: string;
  /** inicial + suplementado − anulado, por `calcularSaldos`. É o teto contra o qual se empenha. */
  readonly dotacaoAtualizada: string;
  /** Cache do M05 — orientação. Vai à tela ao lado da atualizada, sem substituí-la. */
  readonly saldoDisponivel: string;
}

export async function listarQdd(
  prisma: PrismaClient,
  params: { readonly exercicio: number; readonly unidadeCodigo?: string | undefined }
): Promise<readonly LinhaQdd[]> {
  const fichas = await prisma.fichaOrcamentaria.findMany({
    where: {
      exercicio: params.exercicio,
      ...(params.unidadeCodigo !== undefined ? { unidadeOrc: { codigo: params.unidadeCodigo } } : {}),
    },
    orderBy: [{ numero: "asc" }],
    select: {
      id: true,
      numero: true,
      saldoDisponivel: true,
      fonteId: true,
      fonte: { select: { codigo: true } },
      // A chave orçamentária inteira, em `select` (não `include`): o QDD lê os CÓDIGOS e os
      // nomes de cada componente, e nada mais das tabelas de domínio — trazer a linha inteira
      // de sete relações só para usar dois campos de cada uma é peso de rede sem leitor.
      orgao: { select: { codigo: true, nome: true } },
      unidadeOrc: { select: { codigo: true, descricao: true } },
      programa: { select: { codigo: true, descricao: true } },
      funcao: { select: { codigo: true, nome: true } },
      subfuncao: { select: { codigo: true, nome: true } },
      acao: { select: { codigo: true, descricao: true } },
      // `co` é relação OPCIONAL — o Prisma devolve `null` quando a ficha não tem CO, e a
      // borda propaga esse `null` em vez de inventar um "-": quem formata é a tela.
      co: { select: { codigo: true, descricao: true } },
      naturezaDespesa: { select: { codigoCompleto: true, descricao: true } },
      movimentos: { select: { tipo: true, valor: true } },
    },
  });

  return fichas.map((f) => {
    // O `TotaisPorTipo` que `calcularSaldos` espera — o mesmo shape que o `groupBy` do adapter
    // produz. Aqui a agregação é em memória (o grão é uma ficha), e o resultado é idêntico.
    const totais: Partial<Record<TipoMovimentoDotacao, ReturnType<typeof toMoney>>> = {};
    for (const m of f.movimentos) {
      const anterior = totais[m.tipo];
      const v = toMoney(m.valor.toFixed(2));
      totais[m.tipo] = anterior === undefined ? v : toMoney(anterior.plus(v));
    }
    const zero = toMoney("0.00");
    const saldos = calcularSaldos(totais as TotaisPorTipo);

    return {
      fichaId: f.id,
      numero: f.numero,
      orgaoCodigo: f.orgao.codigo,
      orgaoNome: f.orgao.nome,
      unidadeCodigo: f.unidadeOrc.codigo,
      unidadeNome: f.unidadeOrc.descricao,
      programaCodigo: f.programa.codigo,
      programaDescricao: f.programa.descricao,
      funcaoCodigo: f.funcao.codigo,
      funcaoNome: f.funcao.nome,
      subfuncaoCodigo: f.subfuncao.codigo,
      subfuncaoNome: f.subfuncao.nome,
      acaoCodigo: f.acao.codigo,
      acaoDescricao: f.acao.descricao,
      // `?? null` e não `?? ""`: string vazia é um CO que existe e é vazio; `null` é "esta ficha
      // não tem CO". A distinção importa no SAGRES, e quem apaga aqui não a recupera na tela.
      coCodigo: f.co?.codigo ?? null,
      coDescricao: f.co?.descricao ?? null,
      fonteId: f.fonteId,
      fonteCodigo: f.fonte.codigo,
      naturezaCodigo: f.naturezaDespesa.codigoCompleto,
      naturezaDescricao: f.naturezaDespesa.descricao,
      dotacaoInicial: (totais.DOTACAO_INICIAL ?? zero).toFixed(2),
      creditoSuplementado: (totais.CREDITO_ADICIONAL ?? zero).toFixed(2),
      creditoAnulado: (totais.ANULACAO_CREDITO ?? zero).toFixed(2),
      dotacaoAtualizada: saldos.autorizado.toFixed(2),
      saldoDisponivel: f.saldoDisponivel.toFixed(2),
    };
  });
}
