import { createTenantDatabase } from '@saas-municipal/database'

export interface PeriodoFiscal {
  exercicio: { id: string; ano: number; status: string }
  mes: { id: string; mes: number; status: string; dataInicio: string; dataFim: string }
}

/**
 * Retorna exercício + mês fiscal correspondentes a uma data.
 */
export async function resolverPeriodoFiscal(
  connectionString: string,
  schemaName: string,
  data: Date,
): Promise<PeriodoFiscal> {
  const tenantDb = createTenantDatabase(connectionString, schemaName)
  const ano = data.getFullYear()
  const mes = data.getMonth() + 1

  const exercicio = await tenantDb.query.exercicios.findFirst({
    where: (e, { eq }) => eq(e.ano, ano),
  })
  if (!exercicio) {
    throw new Error(`Não há exercício fiscal de ${ano} criado neste tenant`)
  }

  const mesFiscal = await tenantDb.query.mesesFiscais.findFirst({
    where: (m, { eq, and }) => and(eq(m.exercicioId, exercicio.id), eq(m.mes, mes)),
  })
  if (!mesFiscal) {
    throw new Error(`Mês ${mes}/${ano} não encontrado`)
  }

  return {
    exercicio: { id: exercicio.id, ano: exercicio.ano, status: exercicio.status },
    mes: {
      id: mesFiscal.id,
      mes: mesFiscal.mes,
      status: mesFiscal.status,
      dataInicio: mesFiscal.dataInicio.toString(),
      dataFim: mesFiscal.dataFim.toString(),
    },
  }
}

/**
 * Lança erro 422 se o período fiscal não está aberto para lançamento.
 */
export function assertPeriodoAberto(periodo: PeriodoFiscal): void {
  if (periodo.exercicio.status === 'encerrado') {
    throw createFiscalError(`Exercício ${periodo.exercicio.ano} encerrado`)
  }
  if (periodo.mes.status !== 'aberto') {
    throw createFiscalError(
      `Mês ${periodo.mes.mes}/${periodo.exercicio.ano} está ${periodo.mes.status}`,
    )
  }
}

/**
 * Valida que uma data de arrecadação pode receber novo lançamento.
 * Resolve exercício e mês fiscal correspondentes e checa status.
 */
export async function validarDataArrecadacao(
  connectionString: string,
  schemaName: string,
  dataArrecadacao: Date | string,
): Promise<{ exercicioId: string; mesFiscalId: string }> {
  const data = typeof dataArrecadacao === 'string' ? new Date(dataArrecadacao) : dataArrecadacao
  const periodo = await resolverPeriodoFiscal(connectionString, schemaName, data)
  assertPeriodoAberto(periodo)
  return {
    exercicioId: periodo.exercicio.id,
    mesFiscalId: periodo.mes.id,
  }
}

function createFiscalError(message: string): Error & { statusCode: number; code: string } {
  const err = new Error(message) as Error & { statusCode: number; code: string }
  err.statusCode = 422
  err.code = 'FISCAL_PERIOD_CLOSED'
  return err
}
