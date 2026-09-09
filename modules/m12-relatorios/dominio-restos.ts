import { toMoney, type Money } from "../../packages/contracts/index.js";
// ⚠️ A ARITMÉTICA DO SALDO DE RP É DO M08 — fonte única. O M12 NÃO a reimplementa:
// uma cópia com um sinal trocado é o bug do 345af7d nascendo de novo, agora num
// relatório que vai para o TCE.
import type { TotaisRP } from "../m08-restos-a-pagar/dominio.js";
import { serializar, type Dinheiro, type TipoRestos } from "./dominio.js";

/**
 * DOMAIN do RELATÓRIO DE RESTOS A PAGAR (M12, bloco 3a). SEM I/O.
 *
 * Uma linha por INSCRIÇÃO, agrupada por (exercício de origem, tipo). Todas as
 * colunas saem do `TotaisRP` que o M08 calcula — aqui só se organiza e serializa.
 *
 * As colunas de ESTORNO existem para serem VISTAS. Um relatório que mostrasse só
 * o pago LÍQUIDO esconderia que houve um pagamento e uma anulação — e é
 * exatamente isso que o controle externo precisa enxergar.
 */

export interface ColunasRestos {
  readonly inscrito: Dinheiro;
  /** Só nas NÃO PROCESSADAS — a processada já nasceu liquidada. */
  readonly liquidadoAposInscricao: Dinheiro;
  /** Pago BRUTO. */
  readonly pago: Dinheiro;
  readonly estornosDePagamento: Dinheiro;
  /** Cancelado BRUTO. */
  readonly cancelado: Dinheiro;
  readonly estornosDeCancelamento: Dinheiro;
  /** inscrito − pagoLíquido − canceladoLíquido (a definição do M08). */
  readonly saldo: Dinheiro;
}

export interface LinhaRestosAPagar extends ColunasRestos {
  readonly inscricaoId: string;
  readonly exercicioOrigem: number;
  readonly tipo: TipoRestos;
  readonly empenhoId: string;
  readonly numeroEmpenho: string;
  readonly credorCpfCnpj: string;
}

export interface GrupoRestosAPagar {
  readonly exercicioOrigem: number;
  readonly tipo: TipoRestos;
  readonly linhas: readonly LinhaRestosAPagar[];
  readonly total: ColunasRestos;
}

export interface RelatorioRestosAPagar {
  readonly relatorio: "RELATÓRIO DE RESTOS A PAGAR";
  readonly exercicioReferencia: number;
  /** Exercício ainda ABERTO: retrato parcial. */
  readonly parcial: boolean;
  readonly grupos: readonly GrupoRestosAPagar[];
  readonly total: ColunasRestos;
}

/** O que a leitura entrega: a inscrição + os totais JÁ calculados pelo M08. */
export interface FatoInscricao {
  readonly inscricaoId: string;
  readonly exercicioOrigem: number;
  readonly tipo: TipoRestos;
  readonly empenhoId: string;
  readonly numeroEmpenho: string;
  readonly credorCpfCnpj: string;
  readonly inscrito: Money;
  /** Liquidações do empenho feitas DEPOIS da inscrição (só faz sentido em NP). */
  readonly liquidadoAposInscricao: Money;
  /** Do M08 (`totaisDosMovimentos`), com o recorte temporal já aplicado. */
  readonly totais: TotaisRP;
}

const zero = () => toMoney("0.00");
const soma = (a: Money, b: Money) => toMoney(a.plus(b));
const sub = (a: Money, b: Money) => toMoney(a.minus(b));

interface Acumulador {
  inscrito: Money;
  liquidadoAposInscricao: Money;
  pago: Money;
  estornosDePagamento: Money;
  cancelado: Money;
  estornosDeCancelamento: Money;
  saldo: Money;
}

const acumuladorZero = (): Acumulador => ({
  inscrito: zero(),
  liquidadoAposInscricao: zero(),
  pago: zero(),
  estornosDePagamento: zero(),
  cancelado: zero(),
  estornosDeCancelamento: zero(),
  saldo: zero(),
});

/** O saldo de UMA inscrição: inscrito − baixa líquida (a definição do M08). */
function saldoDaLinha(f: FatoInscricao): Money {
  return sub(f.inscrito, f.totais.baixaLiquida);
}

function acumular(acc: Acumulador, f: FatoInscricao): void {
  acc.inscrito = soma(acc.inscrito, f.inscrito);
  acc.liquidadoAposInscricao = soma(
    acc.liquidadoAposInscricao,
    f.liquidadoAposInscricao
  );
  acc.pago = soma(acc.pago, f.totais.pago);
  acc.estornosDePagamento = soma(
    acc.estornosDePagamento,
    f.totais.estornoPagamento
  );
  acc.cancelado = soma(acc.cancelado, f.totais.cancelado);
  acc.estornosDeCancelamento = soma(
    acc.estornosDeCancelamento,
    f.totais.estornoCancelamento
  );
  acc.saldo = soma(acc.saldo, saldoDaLinha(f));
}

function serializarColunas(a: Acumulador): ColunasRestos {
  return {
    inscrito: serializar(a.inscrito),
    liquidadoAposInscricao: serializar(a.liquidadoAposInscricao),
    pago: serializar(a.pago),
    estornosDePagamento: serializar(a.estornosDePagamento),
    cancelado: serializar(a.cancelado),
    estornosDeCancelamento: serializar(a.estornosDeCancelamento),
    saldo: serializar(a.saldo),
  };
}

/**
 * Monta o relatório. PURA, e com AMARRAÇÃO AUTO-EXECUTÁVEL.
 *
 * `Σ saldos das linhas` tem de ser igual a `Σ inscrito − Σ baixas líquidas`. As
 * duas contas percorrem os mesmos números por caminhos diferentes (uma linha a
 * linha, a outra em bloco); se divergirem, há erro de montagem — e o relatório
 * NÃO SAI. Sem isto, um totalizador que esquecesse um grupo passaria despercebido:
 * ele fecharia consigo mesmo.
 */
export function montarRelatorioRestosAPagar(f: {
  readonly exercicioReferencia: number;
  readonly parcial: boolean;
  readonly inscricoes: readonly FatoInscricao[];
}): RelatorioRestosAPagar {
  // Agrupa por (exercicioOrigem, tipo) — a chave preserva a ordem do relatório.
  const porGrupo = new Map<string, FatoInscricao[]>();
  for (const i of f.inscricoes) {
    const chave = `${i.exercicioOrigem}|${i.tipo}`;
    porGrupo.set(chave, [...(porGrupo.get(chave) ?? []), i]);
  }

  const geral = acumuladorZero();
  const grupos: GrupoRestosAPagar[] = [];

  const chaves = [...porGrupo.keys()].sort((a, b) => {
    const [anoA, tipoA] = a.split("|") as [string, string];
    const [anoB, tipoB] = b.split("|") as [string, string];
    // exercício mais antigo primeiro; processados antes dos não processados
    if (anoA !== anoB) return Number(anoA) - Number(anoB);
    return tipoA.localeCompare(tipoB);
  });

  for (const chave of chaves) {
    const doGrupo = porGrupo.get(chave)!;
    const acc = acumuladorZero();

    const linhas: LinhaRestosAPagar[] = doGrupo
      .slice()
      .sort((a, b) => a.numeroEmpenho.localeCompare(b.numeroEmpenho))
      .map((i) => {
        acumular(acc, i);
        acumular(geral, i);
        return {
          inscricaoId: i.inscricaoId,
          exercicioOrigem: i.exercicioOrigem,
          tipo: i.tipo,
          empenhoId: i.empenhoId,
          numeroEmpenho: i.numeroEmpenho,
          credorCpfCnpj: i.credorCpfCnpj,
          inscrito: serializar(i.inscrito),
          liquidadoAposInscricao: serializar(i.liquidadoAposInscricao),
          pago: serializar(i.totais.pago),
          estornosDePagamento: serializar(i.totais.estornoPagamento),
          cancelado: serializar(i.totais.cancelado),
          estornosDeCancelamento: serializar(i.totais.estornoCancelamento),
          saldo: serializar(saldoDaLinha(i)),
        };
      });

    const [ano, tipo] = chave.split("|") as [string, TipoRestos];
    grupos.push({
      exercicioOrigem: Number(ano),
      tipo,
      linhas,
      total: serializarColunas(acc),
    });
  }

  // ═══ A AMARRAÇÃO ═══
  const somaDosSaldos = geral.saldo;
  const porBloco = f.inscricoes.reduce(
    (acc, i) => sub(soma(acc, i.inscrito), i.totais.baixaLiquida),
    zero()
  );
  if (!somaDosSaldos.equals(porBloco)) {
    throw new Error(
      `Relatório de RP NÃO FECHA: a soma dos saldos das linhas é ` +
        `${serializar(somaDosSaldos)}, mas Σinscrito − Σbaixas líquidas é ` +
        `${serializar(porBloco)}. Há erro de montagem — o relatório não sai.`
    );
  }

  return {
    relatorio: "RELATÓRIO DE RESTOS A PAGAR",
    exercicioReferencia: f.exercicioReferencia,
    parcial: f.parcial,
    grupos,
    total: serializarColunas(geral),
  };
}
