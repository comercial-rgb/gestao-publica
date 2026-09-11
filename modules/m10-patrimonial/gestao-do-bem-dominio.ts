import { compararPorDiaCivil, meioDiaCivil } from "../../packages/datas/index.js";

/**
 * M10 — PATRIMÔNIO, EIXO DE GESTÃO: o DOMÍNIO PURO (TR 5.19).
 *
 * ═══ ⚠️ A DECISÃO D4, INTEIRA, MORA NESTE ARQUIVO ═══
 * Situação, estado e localização do bem **não são colunas**. São o ÚLTIMO MOVIMENTO DE
 * CADA TIPO ATÉ UMA DATA — e a data importa porque a TR 5.19.20 pede, literalmente, "seu
 * estado e localização **atual (no momento do inventário)**".
 *
 * Uma coluna `localizacaoAtual` responderia "hoje" a uma pergunta que é sobre o dia do
 * inventário, e a divergência apurada pela comissão passaria a comparar a observação de
 * março com a posição de dezembro.
 */

export type TipoMovimentoDeGestao =
  | "LOCALIZACAO"
  | "RESPONSAVEL"
  | "ESTADO"
  | "SITUACAO"
  | "TRANSFERENCIA_SAIDA"
  | "TRANSFERENCIA_ENTRADA"
  | "ESTORNO_LOCALIZACAO"
  | "ESTORNO_RESPONSAVEL"
  | "ESTORNO_ESTADO"
  | "ESTORNO_SITUACAO"
  | "ESTORNO_TRANSFERENCIA_SAIDA"
  | "ESTORNO_TRANSFERENCIA_ENTRADA";

export type EstadoDeConservacao =
  | "OTIMO"
  | "BOM"
  | "REGULAR"
  | "RUIM"
  | "INSERVIVEL";

export type SituacaoFisicaDoBem =
  | "EM_USO"
  | "EM_EMPRESTIMO"
  | "EM_LOCACAO"
  | "EM_MANUTENCAO_PREVENTIVA"
  | "EM_MANUTENCAO_CORRETIVA"
  | "EM_DESUSO"
  | "BAIXADO";

/** ⚠️ `Record` EXAUSTIVO: tipo novo sem estorno declarado não compila. */
export const TIPO_DO_ESTORNO_DE_GESTAO: Record<
  TipoMovimentoDeGestao,
  TipoMovimentoDeGestao | null
> = {
  LOCALIZACAO: "ESTORNO_LOCALIZACAO",
  RESPONSAVEL: "ESTORNO_RESPONSAVEL",
  ESTADO: "ESTORNO_ESTADO",
  SITUACAO: "ESTORNO_SITUACAO",
  TRANSFERENCIA_SAIDA: "ESTORNO_TRANSFERENCIA_SAIDA",
  TRANSFERENCIA_ENTRADA: "ESTORNO_TRANSFERENCIA_ENTRADA",

  ESTORNO_LOCALIZACAO: null,
  ESTORNO_RESPONSAVEL: null,
  ESTORNO_ESTADO: null,
  ESTORNO_SITUACAO: null,
  ESTORNO_TRANSFERENCIA_SAIDA: null,
  ESTORNO_TRANSFERENCIA_ENTRADA: null,
};

/**
 * QUAL CAMPO CADA TIPO OBRIGA A PREENCHER.
 *
 * ⚠️ SEM ISTO, UM MOVIMENTO DE LOCALIZAÇÃO SEM LOCALIZAÇÃO SERIA GRAVÁVEL — e ele
 * apagaria a posição do bem em silêncio: a derivação leria o último movimento do tipo,
 * acharia `null`, e concluiria que o bem não está em lugar nenhum.
 */
export const CAMPO_OBRIGATORIO_DO_TIPO: Record<
  TipoMovimentoDeGestao,
  "localizacaoId" | "responsavelId" | "estado" | "situacao" | "unidadeOrcId" | null
> = {
  LOCALIZACAO: "localizacaoId",
  RESPONSAVEL: "responsavelId",
  ESTADO: "estado",
  SITUACAO: "situacao",
  TRANSFERENCIA_SAIDA: "unidadeOrcId",
  TRANSFERENCIA_ENTRADA: "unidadeOrcId",

  // O estorno copia o campo do original — não recebe um novo.
  ESTORNO_LOCALIZACAO: null,
  ESTORNO_RESPONSAVEL: null,
  ESTORNO_ESTADO: null,
  ESTORNO_SITUACAO: null,
  ESTORNO_TRANSFERENCIA_SAIDA: null,
  ESTORNO_TRANSFERENCIA_ENTRADA: null,
};

export interface MovimentoDeGestaoParaLeitura {
  readonly id: string;
  readonly tipo: TipoMovimentoDeGestao;
  readonly dataMovimento: Date;
  readonly criadoEm: Date;
  readonly localizacaoId: string | null;
  readonly responsavelId: string | null;
  readonly estado: EstadoDeConservacao | null;
  readonly situacao: SituacaoFisicaDoBem | null;
  readonly unidadeOrcId: string | null;
  readonly estornoDeId: string | null;
}

export interface EstadoDoBem {
  readonly localizacaoId: string | null;
  readonly responsavelId: string | null;
  readonly estado: EstadoDeConservacao | null;
  readonly situacao: SituacaoFisicaDoBem | null;
  readonly unidadeOrcId: string | null;
}

/**
 * O ESTADO DO BEM EM UMA DATA CIVIL — decisão D4.
 *
 * ⚠️ O ESTORNO NÃO É "MAIS UM MOVIMENTO NO FIM DA FILA". Ele ANULA o original, e por isso
 * a leitura primeiro remove os pares (original, estorno) e só então procura o último de
 * cada tipo. Tratá-lo como movimento comum faria a localização do bem voltar a ser a que
 * o estorno desfez — o contrário do que ele significa.
 *
 * ⚠️ E O DESEMPATE, quando dois movimentos do mesmo tipo caem no MESMO dia civil, é o
 * `criadoEm`. Comparar por instante o tempo todo ordenaria por hora de digitação e faria
 * um lançamento retroativo da manhã perder para outro da tarde — mas dentro do mesmo dia
 * a hora de digitação é a única ordem que existe.
 */
export function estadoDoBemEm(
  movimentos: readonly MovimentoDeGestaoParaLeitura[],
  ateDia?: string
): EstadoDoBem {
  const alvo = ateDia === undefined ? undefined : meioDiaCivil(ateDia);
  const noPrazo = movimentos.filter(
    (m) => alvo === undefined || compararPorDiaCivil(m.dataMovimento, alvo) <= 0
  );

  const estornados = new Set(
    noPrazo.filter((m) => m.estornoDeId !== null).map((m) => m.estornoDeId as string)
  );
  const vivos = noPrazo.filter(
    (m) => m.estornoDeId === null && !estornados.has(m.id)
  );

  const ultimo = (
    tipo: TipoMovimentoDeGestao
  ): MovimentoDeGestaoParaLeitura | undefined => {
    const doTipo = vivos.filter((m) => m.tipo === tipo);
    if (doTipo.length === 0) return undefined;
    return doTipo.reduce((a, b) => {
      const c = compararPorDiaCivil(a.dataMovimento, b.dataMovimento);
      if (c !== 0) return c > 0 ? a : b;
      return a.criadoEm.getTime() >= b.criadoEm.getTime() ? a : b;
    });
  };

  // A unidade gestora vem da última TRANSFERENCIA_ENTRADA — é ela que diz onde o bem
  // está agora. A perna de saída existe para o estorno andar em par, não para ser lida.
  const entrada = ultimo("TRANSFERENCIA_ENTRADA");

  return {
    localizacaoId: ultimo("LOCALIZACAO")?.localizacaoId ?? null,
    responsavelId: ultimo("RESPONSAVEL")?.responsavelId ?? null,
    estado: ultimo("ESTADO")?.estado ?? null,
    situacao: ultimo("SITUACAO")?.situacao ?? null,
    unidadeOrcId: entrada?.unidadeOrcId ?? null,
  };
}

export interface ComissaoParaVigencia {
  readonly vigenciaInicio: Date;
  readonly vigenciaFim: Date | null;
}

/**
 * A COMISSÃO ESTAVA VIGENTE NAQUELE DIA? (TR 5.19.16)
 *
 * ⚠️ BORDAS INCLUSIVAS, e elas decidem se um termo vale: uma comissão designada para
 * terminar em 31/12 assinou validamente o termo de 31/12. É a mesma régua da medição de
 * obra e do bloqueio de estoque — uma só neste repositório, e não uma por módulo.
 */
export function comissaoVigenteEm(c: ComissaoParaVigencia, dia: string): boolean {
  const alvo = meioDiaCivil(dia);
  if (compararPorDiaCivil(c.vigenciaInicio, alvo) > 0) return false;
  if (c.vigenciaFim !== null && compararPorDiaCivil(c.vigenciaFim, alvo) < 0) return false;
  return true;
}

export interface ContagemParaDivergencia {
  readonly bemId: string;
  readonly encontrado: boolean;
  readonly localizacaoObservadaId: string | null;
  readonly estadoObservado: EstadoDeConservacao | null;
}

export interface DivergenciaDeInventarioDeBens {
  readonly bemId: string;
  readonly motivo:
    | "NAO_ENCONTRADO"
    | "LOCAL_DIFERENTE"
    | "ESTADO_DIFERENTE"
    | "SEM_REGISTRO_ANTERIOR";
  readonly esperado: string | null;
  readonly observado: string | null;
}

/**
 * A DIVERGÊNCIA DO INVENTÁRIO DE BENS — TR 5.19.21 ("relatórios de inconsistência no
 * momento que o bem está com status em inventário, desde que não esteja em seu lugar de
 * origem").
 *
 * ⚠️ ELA É DERIVADA, SEMPRE, e a comparação é contra o estado do bem NA DATA DO
 * FECHAMENTO — não contra o de hoje. Foi por isso que `estadoDoBemEm` recebe data.
 *
 * ⚠️ E `SEM_REGISTRO_ANTERIOR` É UM ACHADO, NÃO UM VAZIO. Um bem que a comissão encontrou
 * numa sala e que o sistema nunca soube onde estava é exatamente o caso que o primeiro
 * inventário existe para descobrir — silenciá-lo faria o relatório de inconsistência
 * esconder o acervo que nunca foi localizado.
 */
export function divergenciasDoInventario(
  contagens: readonly ContagemParaDivergencia[],
  estadoNaData: (bemId: string) => EstadoDoBem
): readonly DivergenciaDeInventarioDeBens[] {
  const achados: DivergenciaDeInventarioDeBens[] = [];

  for (const c of contagens) {
    if (!c.encontrado) {
      achados.push({
        bemId: c.bemId,
        motivo: "NAO_ENCONTRADO",
        esperado: estadoNaData(c.bemId).localizacaoId,
        observado: null,
      });
      continue;
    }

    const esperado = estadoNaData(c.bemId);

    if (esperado.localizacaoId === null && c.localizacaoObservadaId !== null) {
      achados.push({
        bemId: c.bemId,
        motivo: "SEM_REGISTRO_ANTERIOR",
        esperado: null,
        observado: c.localizacaoObservadaId,
      });
    } else if (
      c.localizacaoObservadaId !== null &&
      esperado.localizacaoId !== null &&
      c.localizacaoObservadaId !== esperado.localizacaoId
    ) {
      achados.push({
        bemId: c.bemId,
        motivo: "LOCAL_DIFERENTE",
        esperado: esperado.localizacaoId,
        observado: c.localizacaoObservadaId,
      });
    }

    if (
      c.estadoObservado !== null &&
      esperado.estado !== null &&
      c.estadoObservado !== esperado.estado
    ) {
      achados.push({
        bemId: c.bemId,
        motivo: "ESTADO_DIFERENTE",
        esperado: esperado.estado,
        observado: c.estadoObservado,
      });
    }
  }

  return achados;
}
