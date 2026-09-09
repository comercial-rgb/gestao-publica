import {
  serializar,
  toMoney,
  type Dinheiro,
  type Money,
} from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import {
  SINAL_MOVIMENTO_ALMOXARIFADO,
  saldoDoAlmoxarifado,
  type TipoMovimentoAlmoxarifado,
} from "./almoxarifado.js";
import {
  atualizacaoAcumulada,
  EH_ATUALIZACAO_ACUMULADA,
  SINAL_MOVIMENTO_PATRIMONIAL,
  valorBruto,
  valorContabil,
  type MovimentoPatrimonial,
  type TipoMovimentoPatrimonial,
} from "./dominio.js";

/**
 * DEMONSTRATIVO PATRIMONIAL POR CLASSE (TR 5.86) — LEITURA PURA.
 *
 * Zero escrita, zero tabela, nenhuma coluna cache. Todo número sai de SUM via os
 * Records exaustivos do domínio (`SINAL_MOVIMENTO_PATRIMONIAL` e
 * `EH_ATUALIZACAO_ACUMULADA`). Dinheiro serializa como string. As regras do M12
 * valem integralmente.
 *
 * ═══ O CORTE É A DATA DO FATO ═══
 * `dataMovimento` — nunca `criadoEm`. É a lição do `campoData` do M09: recortar um
 * lado pela data do fato e outro pela data da digitação faz os dois nunca fecharem.
 *
 *   saldoAnterior : dataMovimento  <  início   (EXCLUSIVO)
 *   período       : início ≤ dataMovimento ≤ fim
 *   saldoFinal    : dataMovimento  ≤  fim      (INCLUSIVO)
 *
 * ═══ AS DUAS AMARRAÇÕES ═══
 *  1. saldoFinal == saldoAnterior + Σ(linhas do período). Ela pega o que mais dói
 *     num relatório: um tipo de movimento que não caiu em bucket nenhum. Se um
 *     valor novo entrar no enum e ninguém o classificar, o saldo do período deixa
 *     de somar o saldo final — e o demonstrativo NÃO SAI.
 *  2. saldoFinal == valorBruto(fim) − atualizaçãoAcumulada(fim). É a identidade do
 *     módulo, apurada por funções INDEPENDENTES (uma filtra as retificadoras, a
 *     outra o complemento). Se alguém reescrever uma das duas com uma lista à mão,
 *     ela deixa de ser complemento da outra — e aqui aparece.
 */

export interface LinhaPorTipo {
  readonly tipo: TipoMovimentoPatrimonial;
  /** COM SINAL: o efeito no valor contábil. Estorno vem com valor REAL. */
  readonly valor: Dinheiro;
}

export interface LinhaDaClasse {
  readonly classeDeBensId: string;
  readonly codigo: string;
  readonly descricao: string;
  /** A conta do PCASP que a classe movimenta (parâmetro da classe). */
  readonly classificacaoContabil: string;
  readonly saldoAnterior: Dinheiro;
  /** Σ dos movimentos do período que AUMENTAM o bruto. */
  readonly ingressos: Dinheiro;
  /** Σ do resto do período: retificadoras e reduções do bruto (com sinal). */
  readonly atualizacoes: Dinheiro;
  /** O período, aberto por tipo — é aqui que o estorno aparece com valor real. */
  readonly porTipo: readonly LinhaPorTipo[];
  readonly saldoFinal: Dinheiro;
  /** A identidade: saldoFinal == valorBruto − atualizacaoAcumulada. */
  readonly valorBruto: Dinheiro;
  readonly atualizacaoAcumulada: Dinheiro;
}

/**
 * A SEÇÃO DO ALMOXARIFADO (TR 5.85/5.86) — as MESMAS colunas.
 *
 * `ingressos` = o que entrou (compra + sobra de inventário); `saidas` = o que saiu
 * (consumo + falta), COM SINAL (negativo). É a mesma anatomia da seção de bens — e é de
 * propósito: o TCE lê as duas na mesma planilha.
 */
export interface LinhaPorTipoAlmox {
  readonly tipo: TipoMovimentoAlmoxarifado;
  readonly valor: Dinheiro;
}

export interface LinhaDoAlmoxarifado {
  readonly classeDeMaterialId: string;
  readonly codigo: string;
  readonly descricao: string;
  readonly classificacaoContabil: string;
  readonly saldoAnterior: Dinheiro;
  /** ENTRADA + AJUSTE_ENTRADA (e os estornos que aumentam). */
  readonly ingressos: Dinheiro;
  /** SAIDA_CONSUMO + AJUSTE_SAIDA (e os estornos que reduzem). COM SINAL. */
  readonly saidas: Dinheiro;
  readonly porTipo: readonly LinhaPorTipoAlmox[];
  readonly saldoFinal: Dinheiro;
}

export interface DemonstrativoPatrimonial {
  readonly relatorio: "DEMONSTRATIVO PATRIMONIAL POR CLASSE (TR 5.86)";
  readonly periodo: { readonly inicio: Date; readonly fim: Date };
  readonly classes: readonly LinhaDaClasse[];
  /** TR 5.85 — o almoxarifado, com as mesmas colunas. */
  readonly almoxarifado: readonly LinhaDoAlmoxarifado[];
  readonly total: {
    readonly saldoAnterior: Dinheiro;
    readonly ingressos: Dinheiro;
    readonly atualizacoes: Dinheiro;
    readonly saldoFinal: Dinheiro;
  };
  readonly totalAlmoxarifado: {
    readonly saldoAnterior: Dinheiro;
    readonly ingressos: Dinheiro;
    readonly saidas: Dinheiro;
    readonly saldoFinal: Dinheiro;
  };
}

export type PeriodoDoDemonstrativo =
  | number
  | { readonly inicio: Date; readonly fim: Date };

const zero = () => toMoney("0.00");
const soma = (a: Money, b: Money) => toMoney(a.plus(b));
const sub = (a: Money, b: Money) => toMoney(a.minus(b));

/** O efeito do movimento no valor contábil (valor × sinal do Record). */
function efeito(m: MovimentoPatrimonial): Money {
  return SINAL_MOVIMENTO_PATRIMONIAL[m.tipo] === 1
    ? m.valor
    : toMoney(m.valor.negated());
}

/**
 * O movimento é INGRESSO? (aumenta o valor BRUTO)
 *
 * A classificação é EXAUSTIVA por construção: ou o tipo é retificadora
 * (`EH_ATUALIZACAO_ACUMULADA`) e cai em `atualizacoes`, ou ele mexe no bruto — e aí
 * o sinal do Record decide se é ingresso (+) ou redução (−). Nenhum tipo fica de
 * fora, e é a amarração 1 que garante que continue assim.
 */
function ehIngresso(tipo: TipoMovimentoPatrimonial): boolean {
  return (
    !EH_ATUALIZACAO_ACUMULADA[tipo] && SINAL_MOVIMENTO_PATRIMONIAL[tipo] === 1
  );
}

export async function demonstrativoPatrimonialPorClasse(
  prisma: PrismaClient,
  periodo: PeriodoDoDemonstrativo
): Promise<DemonstrativoPatrimonial> {
  const { inicio, fim } =
    typeof periodo === "number"
      ? {
          inicio: new Date(Date.UTC(periodo, 0, 1, 0, 0, 0, 0)),
          fim: new Date(Date.UTC(periodo, 11, 31, 23, 59, 59, 999)),
        }
      : periodo;

  if (fim < inicio) {
    throw new Error(
      `Período invertido: início ${inicio.toISOString()} depois do fim ` +
        `${fim.toISOString()}.`
    );
  }

  const classes = await prisma.classeDeBens.findMany({
    orderBy: { codigo: "asc" },
    select: {
      id: true,
      codigo: true,
      descricao: true,
      contaContabilAtivo: { select: { codigo: true } },
    },
  });

  const linhas: LinhaDaClasse[] = [];
  const total = {
    saldoAnterior: zero(),
    ingressos: zero(),
    atualizacoes: zero(),
    saldoFinal: zero(),
  };

  for (const classe of classes) {
    // TODOS os movimentos da classe até o FIM. Uma leitura; toda soma abaixo passa
    // pelas funções do domínio (Records de sinal). Nenhum SUM bruto.
    const movimentos = await prisma.movimentoPatrimonial.findMany({
      where: { classeDeBensId: classe.id, dataMovimento: { lte: fim } },
      select: { tipo: true, valor: true, dataMovimento: true },
      orderBy: { dataMovimento: "asc" },
    });

    const comSinal = movimentos.map((m) => ({
      tipo: m.tipo,
      valor: toMoney(m.valor.toFixed(2)),
      dataMovimento: m.dataMovimento,
    }));

    // CORTE EXCLUSIVO no início: o que aconteceu ANTES do período.
    const anteriores = comSinal.filter((m) => m.dataMovimento < inicio);
    // CORTE INCLUSIVO nos dois lados: o período.
    const doPeriodo = comSinal.filter((m) => m.dataMovimento >= inicio);

    const saldoAnterior = valorContabil(anteriores);
    const saldoFinal = valorContabil(comSinal); // já cortado em `fim` na query

    let ingressos = zero();
    let atualizacoes = zero();
    const porTipoAcc = new Map<TipoMovimentoPatrimonial, Money>();

    for (const m of doPeriodo) {
      const e = efeito(m);
      if (ehIngresso(m.tipo)) {
        ingressos = soma(ingressos, e);
      } else {
        atualizacoes = soma(atualizacoes, e);
      }
      porTipoAcc.set(m.tipo, soma(porTipoAcc.get(m.tipo) ?? zero(), e));
    }

    const bruto = valorBruto(comSinal);
    const acumulada = atualizacaoAcumulada(comSinal);

    // ═══ AMARRAÇÃO 1 — nenhum tipo pode ficar fora dos buckets ═══
    const esperado = soma(saldoAnterior, soma(ingressos, atualizacoes));
    if (!saldoFinal.equals(esperado)) {
      throw new Error(
        `DEMONSTRATIVO NÃO FECHA na classe ${classe.codigo} ` +
          `(${classe.descricao}): saldo final ${serializar(saldoFinal)} ≠ saldo ` +
          `anterior ${serializar(saldoAnterior)} + ingressos ` +
          `${serializar(ingressos)} + atualizações ${serializar(atualizacoes)} = ` +
          `${serializar(esperado)}. Diferença: ` +
          `${serializar(sub(saldoFinal, esperado))}. Há movimento no período que ` +
          `não caiu em nenhuma coluna — provavelmente um tipo novo no enum sem ` +
          `classificação.`
      );
    }

    // ═══ AMARRAÇÃO 2 — a identidade do módulo ═══
    const porIdentidade = sub(bruto, acumulada);
    if (!saldoFinal.equals(porIdentidade)) {
      throw new Error(
        `IDENTIDADE PATRIMONIAL QUEBRADA na classe ${classe.codigo} ` +
          `(${classe.descricao}): valor contábil ${serializar(saldoFinal)} ≠ ` +
          `bruto ${serializar(bruto)} − acumulada ${serializar(acumulada)} = ` +
          `${serializar(porIdentidade)}. Diferença: ` +
          `${serializar(sub(saldoFinal, porIdentidade))}. Os filtros de "bruto" e ` +
          `"retificadora" deixaram de ser complementares.`
      );
    }

    linhas.push({
      classeDeBensId: classe.id,
      codigo: classe.codigo,
      descricao: classe.descricao,
      classificacaoContabil: classe.contaContabilAtivo.codigo,
      saldoAnterior: serializar(saldoAnterior),
      ingressos: serializar(ingressos),
      atualizacoes: serializar(atualizacoes),
      porTipo: [...porTipoAcc.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([tipo, valor]) => ({ tipo, valor: serializar(valor) })),
      saldoFinal: serializar(saldoFinal),
      valorBruto: serializar(bruto),
      atualizacaoAcumulada: serializar(acumulada),
    });

    total.saldoAnterior = soma(total.saldoAnterior, saldoAnterior);
    total.ingressos = soma(total.ingressos, ingressos);
    total.atualizacoes = soma(total.atualizacoes, atualizacoes);
    total.saldoFinal = soma(total.saldoFinal, saldoFinal);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // A SEÇÃO DO ALMOXARIFADO (TR 5.85) — zero segunda aritmética
  // ═══════════════════════════════════════════════════════════════════════════
  // O saldo sai de `saldoDoAlmoxarifado` (o Record do DONO), e a classificação em
  // buckets sai do MESMO Record: quem soma +1 é ingresso, quem soma −1 é saída.
  // Nenhum tipo pode ficar de fora — e a amarração abaixo é quem garante.
  const classesDeMaterial = await prisma.classeDeMaterial.findMany({
    orderBy: { codigo: "asc" },
    select: {
      id: true,
      codigo: true,
      descricao: true,
      contaContabil: { select: { codigo: true } },
    },
  });

  const linhasAlmox: LinhaDoAlmoxarifado[] = [];
  const totalAlmox = {
    saldoAnterior: zero(),
    ingressos: zero(),
    saidas: zero(),
    saldoFinal: zero(),
  };

  for (const classe of classesDeMaterial) {
    const movimentos = await prisma.movimentoAlmoxarifado.findMany({
      where: { classeDeMaterialId: classe.id, dataMovimento: { lte: fim } },
      select: { tipo: true, valor: true, dataMovimento: true },
      orderBy: { dataMovimento: "asc" },
    });

    const comSinal = movimentos.map((m) => ({
      tipo: m.tipo,
      valor: toMoney(m.valor.toFixed(2)),
      dataMovimento: m.dataMovimento,
    }));

    const anteriores = comSinal.filter((m) => m.dataMovimento < inicio);
    const doPeriodo = comSinal.filter((m) => m.dataMovimento >= inicio);

    const saldoAnterior = saldoDoAlmoxarifado(anteriores);
    const saldoFinal = saldoDoAlmoxarifado(comSinal);

    let ingressos = zero();
    let saidas = zero();
    const porTipoAcc = new Map<TipoMovimentoAlmoxarifado, Money>();

    for (const m of doPeriodo) {
      const sinal = SINAL_MOVIMENTO_ALMOXARIFADO[m.tipo];
      const e = sinal === 1 ? m.valor : toMoney(m.valor.negated());
      if (sinal === 1) {
        ingressos = soma(ingressos, e);
      } else {
        saidas = soma(saidas, e);
      }
      porTipoAcc.set(m.tipo, soma(porTipoAcc.get(m.tipo) ?? zero(), e));
    }

    // ═══ AMARRAÇÃO — nenhum tipo fica fora dos buckets ═══
    const esperado = soma(saldoAnterior, soma(ingressos, saidas));
    if (!saldoFinal.equals(esperado)) {
      throw new Error(
        `ALMOXARIFADO NÃO FECHA na classe ${classe.codigo} (${classe.descricao}): ` +
          `saldo final ${serializar(saldoFinal)} ≠ saldo anterior ` +
          `${serializar(saldoAnterior)} + ingressos ${serializar(ingressos)} + saídas ` +
          `${serializar(saidas)} = ${serializar(esperado)}. Diferença: ` +
          `${serializar(sub(saldoFinal, esperado))}. Há movimento no período que não ` +
          `caiu em nenhuma coluna — provavelmente um tipo novo no enum sem ` +
          `classificação.`
      );
    }

    linhasAlmox.push({
      classeDeMaterialId: classe.id,
      codigo: classe.codigo,
      descricao: classe.descricao,
      classificacaoContabil: classe.contaContabil.codigo,
      saldoAnterior: serializar(saldoAnterior),
      ingressos: serializar(ingressos),
      saidas: serializar(saidas),
      porTipo: [...porTipoAcc.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([tipo, valor]) => ({ tipo, valor: serializar(valor) })),
      saldoFinal: serializar(saldoFinal),
    });

    totalAlmox.saldoAnterior = soma(totalAlmox.saldoAnterior, saldoAnterior);
    totalAlmox.ingressos = soma(totalAlmox.ingressos, ingressos);
    totalAlmox.saidas = soma(totalAlmox.saidas, saidas);
    totalAlmox.saldoFinal = soma(totalAlmox.saldoFinal, saldoFinal);
  }

  return {
    relatorio: "DEMONSTRATIVO PATRIMONIAL POR CLASSE (TR 5.86)",
    periodo: { inicio, fim },
    classes: linhas,
    almoxarifado: linhasAlmox,
    total: {
      saldoAnterior: serializar(total.saldoAnterior),
      ingressos: serializar(total.ingressos),
      atualizacoes: serializar(total.atualizacoes),
      saldoFinal: serializar(total.saldoFinal),
    },
    totalAlmoxarifado: {
      saldoAnterior: serializar(totalAlmox.saldoAnterior),
      ingressos: serializar(totalAlmox.ingressos),
      saidas: serializar(totalAlmox.saidas),
      saldoFinal: serializar(totalAlmox.saldoFinal),
    },
  };
}
