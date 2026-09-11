/**
 * Erros tipados do motor de calculo.
 *
 * Padrao:
 * - `codigo` e UPPER_SNAKE_CASE, estavel (API HTTP usa pra mapear pra 422)
 * - `contexto` carrega dados pra debug e mensagem ao usuario
 * - Sempre serializa pra JSON sem perder informacao (Postgres logs)
 */

export class ErroFolhaEngine extends Error {
  constructor(
    public readonly codigo: string,
    public readonly contexto: Record<string, unknown> = {},
    message?: string,
  ) {
    super(message ?? `${codigo}: ${JSON.stringify(contexto)}`)
    this.name = this.constructor.name
    // Preserva stack em ES2022+
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor)
  }

  toJSON() {
    return {
      name: this.name,
      codigo: this.codigo,
      contexto: this.contexto,
      message: this.message,
    }
  }
}

// ============================================================
// Tabelas vigentes nao encontradas
// ============================================================

export class TabelaVigenteNaoEncontrada extends ErroFolhaEngine {
  constructor(
    tipo: 'INSS' | 'IRRF' | 'SALARIO_FAMILIA' | 'RPPS',
    competencia: Date,
  ) {
    super('TABELA_VIGENTE_NAO_ENCONTRADA', {
      tipo,
      competencia: competencia.toISOString().slice(0, 10),
    }, `Nao ha tabela ${tipo} vigente para a competencia ${competencia.toISOString().slice(0, 7)}`)
  }
}

// ============================================================
// Inconsistencias fiscais
// ============================================================

export class RegimeIncompativel extends ErroFolhaEngine {
  constructor(vinculoId: string, regime: string, motivo: string) {
    super('REGIME_INCOMPATIVEL', { vinculoId, regime, motivo })
  }
}

export class RppsSemAliquotaVigente extends ErroFolhaEngine {
  constructor(competencia: Date) {
    super('RPPS_SEM_ALIQUOTA_VIGENTE', {
      competencia: competencia.toISOString().slice(0, 10),
    }, 'Vinculo RPPS sem aliquota municipal configurada para esta competencia')
  }
}

export class EventoFuncionalInvalido extends ErroFolhaEngine {
  constructor(eventoId: string, motivo: string) {
    super('EVENTO_FUNCIONAL_INVALIDO', { eventoId, motivo })
  }
}

// ============================================================
// Erros de processamento
// ============================================================

export class CompetenciaInvalida extends ErroFolhaEngine {
  constructor(competencia: Date, motivo: string) {
    super('COMPETENCIA_INVALIDA', {
      competencia: competencia.toISOString(),
      motivo,
    })
  }
}

export class PeriodoFiscalFechado extends ErroFolhaEngine {
  constructor(competencia: Date) {
    super('PERIODO_FISCAL_FECHADO', {
      competencia: competencia.toISOString().slice(0, 10),
    }, 'Nao e possivel calcular folha em periodo fiscal fechado')
  }
}

export class DadosInsuficientes extends ErroFolhaEngine {
  constructor(camposFaltantes: string[]) {
    super('DADOS_INSUFICIENTES', { camposFaltantes })
  }
}
