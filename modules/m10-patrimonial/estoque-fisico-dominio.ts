import { Decimal, toMoney, type Money } from "../../packages/contracts/index.js";
import {
  compararPorDiaCivil,
  competenciaCivil,
  diferencaEmDiasCivis,
  meioDiaCivil,
} from "../../packages/datas/index.js";

/**
 * M10 — ALMOXARIFADO, EIXO FÍSICO: o DOMÍNIO PURO (TR 5.18).
 *
 * ═══ ⚠️ POR QUE ESTE ARQUIVO NÃO FALA COM BANCO ═══
 * Tudo aqui é função de listas para números. É o que permite provar a posição de
 * estoque, o preço médio e o bloqueio no regime de PROFUNDIDADE — caracterização,
 * mutação e fixture em hora de borda — sem subir Postgres. O serviço
 * (`estoque-fisico.ts`) é quem lê, trava e escreve.
 *
 * ═══ ⚠️ AS TRÊS DECISÕES QUE ESTE ARQUIVO MATERIALIZA ═══
 *  · **D1** — a posição é Σ até uma DATA CIVIL, nunca uma coluna. A 5.18.1 pede
 *    "atualização automática do estoque" (a formulação exata de uma coluna) e a
 *    5.18.16, na mesma seção, pede o saldo **anterior ao período** — que coluna
 *    nenhuma responde.
 *  · **D2** — o preço médio é derivado da MESMA janela: valor da posição dividido
 *    pela quantidade da posição. O preço efetivamente aplicado numa saída é gravado
 *    no movimento, porque é fato.
 *  · **D14** — bloqueio é FATO com início e fim, e "está bloqueado em D?" é derivado.
 */

export type TipoMovimentoFisicoEstoque =
  | "ENTRADA"
  | "SAIDA"
  | "TRANSFERENCIA_SAIDA"
  | "TRANSFERENCIA_ENTRADA"
  | "AJUSTE_ENTRADA"
  | "AJUSTE_SAIDA"
  | "ESTORNO_ENTRADA"
  | "ESTORNO_SAIDA"
  | "ESTORNO_TRANSFERENCIA_SAIDA"
  | "ESTORNO_TRANSFERENCIA_ENTRADA"
  | "ESTORNO_AJUSTE_ENTRADA"
  | "ESTORNO_AJUSTE_SAIDA";

/**
 * ⚠️ `Record` EXAUSTIVO, e isso é a rede: acrescentar um tipo ao enum sem tratá-lo
 * aqui NÃO compila. É a mesma escolha de `SINAL_MOVIMENTO_PATRIMONIAL` — e é por ela
 * que o módulo não ganha um tipo silenciosamente com sinal errado.
 */
export const SINAL_MOVIMENTO_FISICO: Record<TipoMovimentoFisicoEstoque, 1 | -1> = {
  ENTRADA: 1,
  SAIDA: -1,
  TRANSFERENCIA_SAIDA: -1,
  TRANSFERENCIA_ENTRADA: 1,
  AJUSTE_ENTRADA: 1,
  AJUSTE_SAIDA: -1,

  ESTORNO_ENTRADA: -1,
  ESTORNO_SAIDA: 1,
  ESTORNO_TRANSFERENCIA_SAIDA: 1,
  ESTORNO_TRANSFERENCIA_ENTRADA: -1,
  ESTORNO_AJUSTE_ENTRADA: -1,
  ESTORNO_AJUSTE_SAIDA: 1,
};

export const TIPO_DO_ESTORNO_FISICO: Record<
  TipoMovimentoFisicoEstoque,
  TipoMovimentoFisicoEstoque | null
> = {
  ENTRADA: "ESTORNO_ENTRADA",
  SAIDA: "ESTORNO_SAIDA",
  TRANSFERENCIA_SAIDA: "ESTORNO_TRANSFERENCIA_SAIDA",
  TRANSFERENCIA_ENTRADA: "ESTORNO_TRANSFERENCIA_ENTRADA",
  AJUSTE_ENTRADA: "ESTORNO_AJUSTE_ENTRADA",
  AJUSTE_SAIDA: "ESTORNO_AJUSTE_SAIDA",

  // Estorno de estorno não existe: a correção de um estorno é um fato NOVO.
  ESTORNO_ENTRADA: null,
  ESTORNO_SAIDA: null,
  ESTORNO_TRANSFERENCIA_SAIDA: null,
  ESTORNO_TRANSFERENCIA_ENTRADA: null,
  ESTORNO_AJUSTE_ENTRADA: null,
  ESTORNO_AJUSTE_SAIDA: null,
};

/** O mínimo que a aritmética precisa de um movimento. */
export interface MovimentoParaPosicao {
  readonly tipo: TipoMovimentoFisicoEstoque;
  readonly quantidade: Money | string;
  readonly valorTotal: Money | string;
  readonly dataMovimento: Date;
}

export interface PosicaoDeEstoque {
  readonly quantidade: Money;
  readonly valor: Money;
}

/**
 * A POSIÇÃO EM UMA DATA CIVIL — decisão D1.
 *
 * ⚠️ O CORTE É POR DIA CIVIL, e não por instante. Um recebimento lançado às 23h50 de
 * 31/12 pertence a dezembro no calendário do ente, e um `<=` sobre `Date` responderia
 * conforme o fuso do processo que fez a pergunta. `compararPorDiaCivil` é a mesma
 * função que fechou a pendência DATA-CIVIL no ENT03b, em 35 arquivos.
 *
 * `ateDia` ausente = a posição de hoje. Presente = a posição **naquela data**, que é a
 * pergunta que a 5.18.16 e o inventário fazem.
 */
export function posicaoDeEstoque(
  movimentos: readonly MovimentoParaPosicao[],
  ateDia?: string
): PosicaoDeEstoque {
  let quantidade = new Decimal(0);
  let valor = new Decimal(0);

  for (const m of movimentos) {
    if (
      ateDia !== undefined &&
      compararPorDiaCivil(m.dataMovimento, meioDiaCivil(ateDia)) > 0
    ) {
      continue;
    }
    const sinal = SINAL_MOVIMENTO_FISICO[m.tipo];
    quantidade = quantidade.plus(toMoney(m.quantidade).times(sinal));
    valor = valor.plus(toMoney(m.valorTotal).times(sinal));
  }

  return { quantidade, valor };
}

/**
 * O PREÇO MÉDIO PONDERADO EM UMA DATA — decisão D2 (TR 5.18.11).
 *
 * ⚠️ ELE É O VALOR DA POSIÇÃO DIVIDIDO PELA QUANTIDADE DA POSIÇÃO, e não um número
 * guardado e atualizado "a cada entrada" como a cláusula descreve. A cláusula descreve
 * o EFEITO; a coluna seria a implementação que torna o efeito inauditável.
 *
 * ⚠️ E ELE RECUSA QUANDO A QUANTIDADE É ZERO, em vez de devolver zero. Estoque zerado
 * NÃO TEM preço médio — devolver 0,00 faria a saída seguinte ser lançada a custo zero,
 * e um custo zero atravessa o razão sem acusar nada.
 */
export function precoMedioDaPosicao(posicao: PosicaoDeEstoque): Money {
  if (posicao.quantidade.lessThanOrEqualTo(0)) {
    throw new Error(
      `Não há preço médio para uma posição de ${posicao.quantidade.toFixed(4)} — ` +
        `estoque zerado ou negativo não tem custo médio. Devolver zero faria a saída ` +
        `ser lançada a custo zero, e custo zero atravessa o razão sem acusar nada.`
    );
  }
  // 6 casas, como a coluna: arredondar a 2 aqui empurraria o erro para o valor total
  // de cada saída, e ele se acumularia movimento a movimento.
  return posicao.valor.dividedBy(posicao.quantidade).toDecimalPlaces(6);
}

/**
 * A CONVERSÃO PARA A UNIDADE DE ESTOQUE — decisão D6 (TR 5.17.2).
 *
 * ⚠️ Sem isto, "3 caixas" e "36 unidades" seriam dois números somáveis e sem sentido.
 * O fator é Decimal porque "1 caixa = 12,5 kg" existe.
 */
export function converterParaEstoque(
  quantidade: Money | string,
  fatorParaEstoque: Money | string
): Money {
  const fator = toMoney(fatorParaEstoque);
  if (fator.lessThanOrEqualTo(0)) {
    throw new Error(
      `Fator de conversão ${fator.toString()} é inválido: ele multiplica a quantidade, ` +
        `e um fator zero ou negativo faria entrada virar saída ou sumir.`
    );
  }
  return toMoney(quantidade).times(fator).toDecimalPlaces(4);
}

/** Um bloqueio, como o modelo o guarda: fato com início e fim opcional. */
export interface BloqueioParaAvaliacao {
  readonly materialId: string | null;
  readonly depositoId: string | null;
  readonly inicio: Date;
  readonly fim: Date | null;
  readonly motivo: string;
}

/**
 * ESTÁ BLOQUEADO NAQUELE DIA? — decisão D14 (TR 5.18.13).
 *
 * ⚠️ AS BORDAS SÃO INCLUSIVAS NOS DOIS LADOS, e é uma decisão, não um descuido: um
 * bloqueio que começa hoje bloqueia hoje, e um que termina hoje ainda bloqueia hoje. É
 * a mesma régua da medição de obra, fechada no ENT03b.
 *
 * Os três alcances da cláusula saem das duas colunas opcionais: material sem depósito
 * bloqueia o material em toda parte; depósito sem material bloqueia o depósito
 * inteiro; os dois juntos bloqueiam o par.
 */
export function bloqueiosAplicaveis(
  bloqueios: readonly BloqueioParaAvaliacao[],
  alvo: { readonly materialId: string; readonly depositoId: string },
  dia: string
): readonly BloqueioParaAvaliacao[] {
  return bloqueios.filter((b) => {
    const alcanca =
      (b.materialId === null || b.materialId === alvo.materialId) &&
      (b.depositoId === null || b.depositoId === alvo.depositoId);
    if (!alcanca) return false;
    const alvoDoDia = meioDiaCivil(dia);
    if (compararPorDiaCivil(b.inicio, alvoDoDia) > 0) return false;
    if (b.fim !== null && compararPorDiaCivil(b.fim, alvoDoDia) < 0) return false;
    return true;
  });
}

/** Um inventário aberto, para a regra da 5.18.12. */
export interface InventarioParaBloqueio {
  readonly depositoId: string;
  readonly dataAbertura: Date;
  readonly dataFechamento: Date | null;
}

/**
 * O INVENTÁRIO ABERTO BLOQUEIA PELA MESMA LEITURA (TR 5.18.12).
 *
 * ⚠️ ELE NÃO É UMA SEGUNDA REGRA. Converter o inventário aberto num bloqueio faz as
 * duas cláusulas (5.18.12 e 5.18.13) passarem pela MESMA porta — e uma porta só é uma
 * porta que se prova uma vez.
 */
export function bloqueiosDoInventario(
  inventarios: readonly InventarioParaBloqueio[]
): readonly BloqueioParaAvaliacao[] {
  return inventarios.map((i) => ({
    materialId: null,
    depositoId: i.depositoId,
    inicio: i.dataAbertura,
    fim: i.dataFechamento,
    motivo: "inventário em andamento no depósito",
  }));
}

/** Um lote, para as consultas de validade. */
export interface LoteParaValidade {
  readonly id: string;
  readonly identificacao: string;
  readonly validade: Date | null;
}

export interface ValidadeDoEstoque {
  readonly vencidos: readonly LoteParaValidade[];
  readonly aVencer: readonly LoteParaValidade[];
}

/**
 * VENCIDOS E A VENCER (TR 5.18.14 — "vencimentos em 30 dias e dos já vencidos").
 *
 * ⚠️ FRONTEIRA CIVIL, E ELA DECIDE SE UM MEDICAMENTO É SERVIDO. Um lote que vence
 * HOJE não está vencido — ele vence no fim do dia. O `> 0` e o `<= dias` abaixo são a
 * régua, e há fixture em hora de borda provando os dois lados.
 */
export function validadeDoEstoque(
  lotes: readonly LoteParaValidade[],
  hoje: string,
  dentroDeDias = 30
): ValidadeDoEstoque {
  const vencidos: LoteParaValidade[] = [];
  const aVencer: LoteParaValidade[] = [];
  const alvo = meioDiaCivil(hoje);

  for (const l of lotes) {
    if (l.validade === null) continue;
    if (compararPorDiaCivil(l.validade, alvo) < 0) {
      vencidos.push(l);
      continue;
    }
    // ⚠️ `diferencaEmDiasCivis` conta DIAS DO CALENDÁRIO, e não milissegundos: a
    // subtração de instantes erra no dia em que o horário de verão entra.
    if (diferencaEmDiasCivis(l.validade, alvo) <= dentroDeDias) aVencer.push(l);
  }

  return { vencidos, aVencer };
}

/** Um atendimento de item de requisição, para o saldo não atendido. */
export interface AtendimentoParaSaldo {
  readonly tipo: TipoMovimentoFisicoEstoque;
  readonly quantidade: Money | string;
}

/**
 * O SALDO NÃO ATENDIDO DE UM ITEM DE REQUISIÇÃO — decisão D5 (TR 5.18.9).
 *
 * ⚠️ SEM COLUNA `quantidadeAtendida`. O atendido é Σ dos movimentos de saída que
 * apontam para o item, com os estornos devolvendo o saldo. Uma coluna aqui seria a
 * segunda verdade sobre um número que o razão físico já responde — e derraparia no
 * primeiro estorno, que é onde essa classe de defeito sempre aparece.
 */
export function saldoNaoAtendido(
  quantidadeSolicitada: Money | string,
  atendimentos: readonly AtendimentoParaSaldo[]
): Money {
  let atendido = new Decimal(0);
  for (const a of atendimentos) {
    // A saída atende; o estorno da saída devolve. O sinal do movimento já diz isso,
    // invertido — sair do estoque é atender.
    const sinal = SINAL_MOVIMENTO_FISICO[a.tipo];
    atendido = atendido.plus(toMoney(a.quantidade).times(-sinal));
  }
  return toMoney(quantidadeSolicitada).minus(atendido);
}

/** Um consumo, para a conta da cota mensal. */
export interface ConsumoParaCota {
  readonly quantidade: Money | string;
  readonly tipo: TipoMovimentoFisicoEstoque;
  readonly dataMovimento: Date;
}

/**
 * O CONSUMO DE UM SETOR NUMA COMPETÊNCIA (TR 5.18.4 — a cota é MENSAL).
 *
 * ⚠️ A COMPETÊNCIA VEM DA DATA DO FATO, no calendário do ente. Uma requisição de
 * 31/01 lançada em 01/02 consome a cota de JANEIRO — e é `competenciaCivil`, não o
 * mês do `criadoEm`, que sabe disso.
 */
export function consumoNaCompetencia(
  consumos: readonly ConsumoParaCota[],
  competencia: string
): Money {
  let total = new Decimal(0);
  for (const c of consumos) {
    if (competenciaCivil(c.dataMovimento) !== competencia) continue;
    const sinal = SINAL_MOVIMENTO_FISICO[c.tipo];
    total = total.plus(toMoney(c.quantidade).times(-sinal));
  }
  return total;
}

export interface DivergenciaDeInventario {
  readonly contado: Money;
  readonly calculado: Money;
  readonly divergencia: Money;
}

/**
 * A DIVERGÊNCIA DO INVENTÁRIO — decisão D3 (TR 5.18.12).
 *
 * ⚠️ ELA É DERIVADA, SEMPRE. O inventário guarda o que a comissão CONTOU (fato
 * observado); o esperado é a posição na data do fechamento. Congelar o esperado criaria
 * a segunda verdade, e no dia em que as duas divergissem não haveria como saber qual
 * está certa — foi exatamente o que a conciliação bancária do ENT03a recusou.
 */
export function divergenciaDeInventario(
  contado: Money | string,
  posicao: PosicaoDeEstoque
): DivergenciaDeInventario {
  const c = toMoney(contado);
  return {
    contado: c,
    calculado: posicao.quantidade,
    divergencia: c.minus(posicao.quantidade),
  };
}
