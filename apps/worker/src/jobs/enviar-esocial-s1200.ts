/**
 * Gera evento eSocial S-1200 (RGPS) ou S-1202 (RPPS) e grava em
 * esocial_eventos_pendentes com status TO_SEND.
 *
 * NAO envia pro webservice -- isso fica pra Fase 3-4 (B40-B42).
 */

import type { Job } from 'bullmq'
import { and, eq, desc, isNull } from 'drizzle-orm'
import { sql as sqlOp } from 'drizzle-orm'

import {
  esocial,
  type HoleriteCalculado,
} from '@saas-municipal/folha-engine'
import {
  folhaProcessamentoLog,
} from '@saas-municipal/database/schema/folha-calculo'
import {
  esocialEventosPendentes,
} from '@saas-municipal/database/schema/tenant'

import type { EnviarEsocialS1200Payload } from '../queues/folha.js'
import { tenantPool } from '../utils/tenant-pool.js'
import { logger } from '../utils/logger.js'
import { redisPubSub } from '../connection.js'
import { config } from '../config.js'

export async function enviarEsocialS1200(
  job: Job<EnviarEsocialS1200Payload>,
): Promise<{ idEvento: string; tipoEvento: 'S-1200' | 'S-1202'; status: string; duracaoMs: number }> {
  const inicio = Date.now()
  const { tenantSlug, tenantConnectionString, folhaId, vinculoId, ambiente } = job.data

  logger.info('Gerando evento eSocial', { tenantSlug, folhaId, vinculoId, ambiente })

  const { db: tenantDb } = tenantPool.get(tenantConnectionString, tenantSlug)

  // 1) Busca holerite mais recente
  const [holeriteRow] = await tenantDb
    .select()
    .from(folhaProcessamentoLog)
    .where(
      and(
        eq(folhaProcessamentoLog.folhaId, folhaId),
        eq(folhaProcessamentoLog.vinculoId, vinculoId),
      ),
    )
    .orderBy(desc(folhaProcessamentoLog.versao))
    .limit(1)

  if (!holeriteRow) {
    throw new Error(`Holerite nao encontrado: folha=${folhaId} vinculo=${vinculoId}`)
  }

  // 2) Busca dados do vinculo + pessoa
  const vinculoRows = await tenantDb.execute(sqlOp`
    SELECT vf.matricula, vf.regime_previdenciario, vf.tipo,
           p.documento AS cpf, p.nome, p.data_nascimento
    FROM vinculos_funcionais vf
    JOIN pessoas p ON p.id = vf.pessoa_id
    WHERE vf.id = ${vinculoId} AND vf.deleted_at IS NULL
    LIMIT 1
  `) as unknown as Array<Record<string, unknown>>

  if (vinculoRows.length === 0) throw new Error(`Vinculo ${vinculoId} nao encontrado`)
  const vinculoData = vinculoRows[0]!

  // 3) Busca CNPJ do municipio (entidade tipo prefeitura)
  const entidadeRows = await tenantDb.execute(sqlOp`
    SELECT codigo, nome FROM entidades WHERE tipo = 'prefeitura' AND deleted_at IS NULL LIMIT 1
  `) as unknown as Array<Record<string, unknown>>

  const cnpj = entidadeRows[0]?.codigo ? String(entidadeRows[0].codigo) : '00000000000100'
  const razaoSocial = entidadeRows[0]?.nome ? String(entidadeRows[0].nome) : 'Municipio'

  // 4) Reconstroi HoleriteCalculado do snapshot
  const snap = holeriteRow.snapshot as Record<string, unknown>
  const holerite = {
    ...snap,
    vinculoId,
    pessoaId: snap.pessoaId ?? '',
    competencia: new Date(holeriteRow.competencia + 'T00:00:00.000Z'),
    versao: holeriteRow.versao,
    snapshot: snap,
    hashSha256: holeriteRow.hashSha256,
    duracaoMs: holeriteRow.duracaoMs,
    calculadoEm: holeriteRow.calculadoEm,
    rubricas: (snap.rubricas as any[]) ?? [],
    totais: snap.totais ?? { proventos: 0, descontos: 0, bruto: 0, liquido: 0 },
    inss: snap.inss ?? { valor: 0, faixasUtilizadas: [] },
    irrf: snap.irrf ?? { valor: 0, cenariosCalculados: [] },
    salarioFamilia: snap.salarioFamilia ?? null,
    proporcionalidade: snap.proporcionalidade ?? [],
  } as unknown as HoleriteCalculado

  // 5) Checa se ja existe evento com mesmo hash -> skip
  const [existente] = await tenantDb
    .select()
    .from(esocialEventosPendentes)
    .where(
      and(
        eq(esocialEventosPendentes.vinculoId, vinculoId),
        eq(esocialEventosPendentes.competencia, holeriteRow.competencia),
      ),
    )
    .orderBy(desc(esocialEventosPendentes.geradoEm))
    .limit(1)

  if (existente?.hashSha256 === holeriteRow.hashSha256 && existente?.status === 'TO_SEND') {
    logger.info('Evento eSocial ja pendente com mesmo hash -- skip', { idEvento: existente.idEvento })
    return { idEvento: existente.idEvento, tipoEvento: existente.tipoEvento as any, status: 'TO_SEND', duracaoMs: Date.now() - inicio }
  }

  const isRetificacao = existente?.status === 'SENT_OK' && existente.hashSha256 !== holeriteRow.hashSha256
  const regime = String(vinculoData.regime_previdenciario) as 'rgps' | 'rpps' | 'isento'

  // Mapeia tipo de vinculo pra TipoVinculo do eSocial
  const tipoVinculoMap: Record<string, esocial.TipoVinculo> = {
    efetivo: 'EFETIVO', comissionado: 'COMISSIONADO', temporario: 'CONTRATO_TEMPORARIO',
    estagiario: 'ESTAGIO', agente_politico: 'CARGO_ELETIVO',
  }
  const tipoVinculo = tipoVinculoMap[String(vinculoData.tipo)] ?? 'EFETIVO'

  // 6) Build XML
  const evento = esocial.buildEventoRemuneracao({
    holerite,
    regimePrevidenciario: regime,
    empregador: { cnpj, razaoSocial },
    trabalhador: {
      cpf: String(vinculoData.cpf ?? ''),
      nome: String(vinculoData.nome),
      dataNascimento: vinculoData.data_nascimento ? String(vinculoData.data_nascimento) : '1970-01-01',
    },
    vinculo: { matricula: String(vinculoData.matricula), tipoVinculo },
    folha: {
      idDmDev: `${folhaId.slice(0, 8)}-${holeriteRow.competencia.slice(0, 7).replace('-', '')}`,
      ideTabRubr: 'TAB001',
      codLotacao: '1',
    },
    ambiente,
    indRetif: isRetificacao ? '2' : '1',
  })

  // 7) Insere em esocial_eventos_pendentes
  await tenantDb.insert(esocialEventosPendentes).values({
    tipoEvento: evento.tipoEvento,
    idEvento: evento.idEvento,
    folhaId,
    vinculoId,
    competencia: holeriteRow.competencia,
    xml: evento.xml,
    hashSha256: holeriteRow.hashSha256,
    status: isRetificacao ? 'RETIFICAR' : 'TO_SEND',
    ambiente,
    workerId: config.WORKER_ID,
  })

  // 8) Publica evento
  await redisPubSub.publish(
    `folha:progresso:${folhaId}`,
    JSON.stringify({
      tipo: 'ESOCIAL_EVENTO_GERADO',
      folhaId, vinculoId,
      idEvento: evento.idEvento,
      tipoEvento: evento.tipoEvento,
      isRetificacao,
      timestamp: new Date().toISOString(),
    }),
  )

  const duracao = Date.now() - inicio
  logger.info('Evento eSocial gerado', { idEvento: evento.idEvento, tipoEvento: evento.tipoEvento, isRetificacao, duracaoMs: duracao })

  return { idEvento: evento.idEvento, tipoEvento: evento.tipoEvento, status: isRetificacao ? 'RETIFICAR' : 'TO_SEND', duracaoMs: duracao }
}
