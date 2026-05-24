/**
 * Job principal: processa folha mensal completa de um tenant.
 *
 * Fluxo otimizado para 15k servidores:
 *   1. Acquire lock no Redis (1 folha por tenant por vez)
 *   2. Inicia ProgressoTracker (DB + pub/sub)
 *   3. Lista TODOS os vinculos ativos da competencia
 *   4. Resolve tabelas UMA vez (cache no escopo do job)
 *   5. Para cada batch de BATCH_SIZE vinculos:
 *      a. Pre-carrega dependencias em lote (3 queries)
 *      b. Calcula holerite paralelo (Promise.all)
 *      c. Grava em folha_processamento_log (batch insert)
 *      d. Atualiza progresso
 *   6. Libera lock
 *
 * Tratamento de erros:
 *   - Erro num holerite individual -> registra em folha_progresso.erros, continua
 *   - Erro bloqueante (DB, lock) -> marca status=ERRO, falha o job (retry BullMQ)
 */

import type { Job } from 'bullmq'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { sql as sqlOp } from 'drizzle-orm'
import { Redis } from 'ioredis'

import {
  calcularHolerite,
  type ContextoCalculo,
  type RubricaParaCalcular,
} from '@saas-municipal/folha-engine'
import {
  resolverTabelaInss,
  resolverTabelaIrrf,
  resolverSalarioFamilia,
  resolverRppsAliquota,
} from '@saas-municipal/folha-engine'
import {
  folhaEventosFuncional,
  pessoaDependentes,
  consignacoesAtivas,
  folhaProcessamentoLog,
} from '@saas-municipal/database/schema/folha-calculo'

import type { ProcessarFolhaMensalPayload } from '../queues/folha.js'
import { tenantPool } from '../utils/tenant-pool.js'
import { logger } from '../utils/logger.js'
import { publicDb, redisConnection } from '../connection.js'
import { ProgressoTracker } from '../progresso/tracker.js'
import { config } from '../config.js'

// ============================================================
// Lock distribuido (Redis SETNX)
// ============================================================

async function acquireLock(
  redis: Redis,
  key: string,
  ttlSeconds: number,
): Promise<boolean> {
  const result = await redis.set(key, config.WORKER_ID, 'EX', ttlSeconds, 'NX')
  return result === 'OK'
}

async function releaseLock(redis: Redis, key: string): Promise<void> {
  // So libera se o lock for nosso (nao forca liberar lock de outro worker)
  await redis.eval(
    `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end`,
    1,
    key,
    config.WORKER_ID,
  )
}

// ============================================================
// Job processor
// ============================================================

export async function processarFolhaMensal(
  job: Job<ProcessarFolhaMensalPayload>,
): Promise<{ totalProcessado: number; totalComErro: number; duracaoMs: number }> {
  const inicio = Date.now()
  const { tenantSlug, tenantConnectionString, folhaId, competencia, iniciadoPor } = job.data

  logger.info(`Iniciando processamento de folha`, {
    tenantSlug,
    folhaId,
    competencia,
    iniciadoPor,
    jobId: job.id,
  })

  const lockKey = `folha:lock:${tenantSlug}:${competencia}`
  const competenciaDate = new Date(competencia + 'T00:00:00.000Z')
  const competenciaIso = competencia.slice(0, 10)

  // ============================================================
  // 1. Acquire lock
  // ============================================================
  const lockAdquirido = await acquireLock(redisConnection, lockKey, config.LOCK_TTL_SECONDS)
  if (!lockAdquirido) {
    throw new Error(
      `Outra folha ja esta sendo processada para ${tenantSlug} em ${competencia}`,
    )
  }

  // Setup pool do tenant
  const { db: tenantDb } = tenantPool.get(tenantConnectionString, tenantSlug)
  const tracker = new ProgressoTracker(tenantDb, folhaId, job.id!, 'processarFolhaMensal')

  try {
    // ============================================================
    // 2. Lista vinculos ativos
    // ============================================================
    const vinculos = await tenantDb.execute(sqlOp`
      SELECT
        vf.id AS vinculo_id,
        vf.pessoa_id,
        vf.matricula,
        vf.regime_previdenciario,
        vf.data_admissao,
        p.data_nascimento
      FROM vinculos_funcionais vf
      JOIN pessoas p ON p.id = vf.pessoa_id
      WHERE vf.status = 'ativo'
        AND vf.deleted_at IS NULL
        AND vf.data_admissao <= ${competenciaIso}
      ORDER BY vf.matricula
    `) as unknown as Array<{
      vinculo_id: string
      pessoa_id: string
      matricula: string
      regime_previdenciario: string
      data_admissao: string
      data_nascimento: string | null
    }>

    // Filtra por payload se especificado
    const vinculosProcessar = job.data.vinculosFiltrados
      ? vinculos.filter((v) => job.data.vinculosFiltrados!.includes(v.vinculo_id))
      : vinculos

    await tracker.iniciar(vinculosProcessar.length)

    logger.info(`Vinculos a processar: ${vinculosProcessar.length}`, {
      tenantSlug,
      folhaId,
    })

    if (vinculosProcessar.length === 0) {
      await tracker.concluir('Nenhum vinculo ativo para processar')
      return { totalProcessado: 0, totalComErro: 0, duracaoMs: Date.now() - inicio }
    }

    // Atualiza folha pra status "calculando"
    await tenantDb.execute(sqlOp`
      UPDATE folhas SET status = 'calculando', calculo_iniciado_em = NOW(), updated_at = NOW()
      WHERE id = ${folhaId}
    `)

    // ============================================================
    // 3. Resolve tabelas UMA vez (cache no escopo)
    // ============================================================
    const [tabelaInss, tabelaIrrf, salarioFamiliaTabela, rppsAliquota] = await Promise.all([
      resolverTabelaInss({ publicDb, tenantDb, competencia: competenciaDate }),
      resolverTabelaIrrf({ publicDb, tenantDb, competencia: competenciaDate }),
      resolverSalarioFamilia({ publicDb, competencia: competenciaDate }),
      resolverRppsAliquota({ tenantDb, competencia: competenciaDate }),
    ])

    // ============================================================
    // 4. Processa em batches
    // ============================================================
    let totalProcessado = 0
    let totalComErro = 0

    for (let i = 0; i < vinculosProcessar.length; i += config.BATCH_SIZE) {
      const batch = vinculosProcessar.slice(i, i + config.BATCH_SIZE)

      const resultados = await processarBatch({
        batch,
        tenantDb,
        competencia: competenciaDate,
        competenciaIso,
        folhaId,
        iniciadoPor,
        tabelaInss,
        tabelaIrrf,
        salarioFamiliaTabela,
        rppsAliquota,
      })

      // Contabiliza
      for (const r of resultados) {
        if (r.ok) {
          totalProcessado++
        } else {
          totalComErro++
          await tracker.registrarErroItem(r.vinculoId, r.erro)
        }
      }

      await tracker.incrementarProcessados(
        resultados.filter((r) => r.ok).length,
        `Batch ${Math.floor(i / config.BATCH_SIZE) + 1}/${Math.ceil(vinculosProcessar.length / config.BATCH_SIZE)}`,
      )

      // Atualiza progresso BullMQ
      const pct = Math.round(((i + batch.length) / vinculosProcessar.length) * 100)
      await job.updateProgress(pct)
    }

    // ============================================================
    // 5. Finaliza folha
    // ============================================================
    const statusFinal = totalComErro === 0 ? 'calculada' : 'em_revisao'
    const duracaoMs = Date.now() - inicio

    await tenantDb.execute(sqlOp`
      UPDATE folhas SET
        status = ${statusFinal},
        calculo_concluido_em = NOW(),
        qtd_servidores = ${totalProcessado},
        updated_at = NOW()
      WHERE id = ${folhaId}
    `)

    await tracker.concluir(
      `${totalProcessado} processados, ${totalComErro} erros em ${(duracaoMs / 1000).toFixed(1)}s`,
    )

    logger.info(`Folha concluida`, { folhaId, totalProcessado, totalComErro, statusFinal, duracaoMs })
    return { totalProcessado, totalComErro, duracaoMs }
  } catch (err) {
    const erro = err instanceof Error ? err : new Error(String(err))
    await tracker.falhar(`Erro bloqueante: ${erro.message}`, erro)
    throw erro // BullMQ vai tratar retry
  } finally {
    await releaseLock(redisConnection, lockKey)
  }
}

// ============================================================
// Processamento de batch (pre-carregamento + calculo paralelo)
// ============================================================

type ResultadoItem =
  | { ok: true; vinculoId: string; holeriteId: string }
  | { ok: false; vinculoId: string; erro: Error }

type VinculoRow = {
  vinculo_id: string
  pessoa_id: string
  matricula: string
  regime_previdenciario: string
  data_admissao: string
  data_nascimento: string | null
}

async function processarBatch(p: {
  batch: VinculoRow[]
  tenantDb: any
  competencia: Date
  competenciaIso: string
  folhaId: string
  iniciadoPor: string
  tabelaInss: any
  tabelaIrrf: any
  salarioFamiliaTabela: any
  rppsAliquota: any
}): Promise<ResultadoItem[]> {
  const { batch, tenantDb, competencia, competenciaIso, folhaId } = p
  const vinculoIds = batch.map((v) => v.vinculo_id)
  const pessoaIds = [...new Set(batch.map((v) => v.pessoa_id))]

  // ============================================================
  // Pre-carregamento em lote: 4 queries pra todo o batch
  // ============================================================
  const [eventosTodos, dependentesTodos, consignacoesTodas, rubricasVinculoTodas] = await Promise.all([
    tenantDb
      .select()
      .from(folhaEventosFuncional)
      .where(
        and(
          inArray(folhaEventosFuncional.vinculoId, vinculoIds),
          eq(folhaEventosFuncional.competencia, competenciaIso),
          isNull(folhaEventosFuncional.deletedAt),
        ),
      ),

    tenantDb
      .select()
      .from(pessoaDependentes)
      .where(
        and(
          inArray(pessoaDependentes.pessoaId, pessoaIds),
          isNull(pessoaDependentes.deletedAt),
        ),
      ),

    tenantDb
      .select()
      .from(consignacoesAtivas)
      .where(
        and(
          inArray(consignacoesAtivas.vinculoId, vinculoIds),
          eq(consignacoesAtivas.ativa, true),
          isNull(consignacoesAtivas.deletedAt),
        ),
      ),

    // Rubricas atribuidas aos vinculos do batch
    tenantDb.execute(sqlOp`
      SELECT rv.vinculo_id, rv.rubrica_id, rv.valor, rv.percentual, rv.quantidade,
             r.codigo, r.nome, r.tipo, r.incide_inss, r.incide_irrf, r.incide_fgts,
             r.estrategia_proporcionalidade, r.codigo_esocial
      FROM rubricas_vinculos rv
      JOIN rubricas r ON r.id = rv.rubrica_id AND r.ativo = true AND r.deleted_at IS NULL AND r.folha_mensal = true
      WHERE rv.vinculo_id = ANY(${vinculoIds}::uuid[])
        AND rv.ativo = true
        AND rv.vigencia_inicio <= ${competenciaIso}
        AND (rv.vigencia_fim IS NULL OR rv.vigencia_fim >= ${competenciaIso})
    `),
  ])

  // ============================================================
  // Indexacao em memoria pra lookup O(1)
  // ============================================================
  const eventosPorVinculo = new Map<string, any[]>()
  for (const e of eventosTodos) {
    const lista = eventosPorVinculo.get(e.vinculoId) ?? []
    lista.push(e)
    eventosPorVinculo.set(e.vinculoId, lista)
  }

  const dependentesPorPessoa = new Map<string, any[]>()
  for (const d of dependentesTodos) {
    const lista = dependentesPorPessoa.get(d.pessoaId) ?? []
    lista.push(d)
    dependentesPorPessoa.set(d.pessoaId, lista)
  }

  const consignacoesPorVinculo = new Map<string, any[]>()
  for (const c of consignacoesTodas) {
    const lista = consignacoesPorVinculo.get(c.vinculoId) ?? []
    lista.push(c)
    consignacoesPorVinculo.set(c.vinculoId, lista)
  }

  const rubricasPorVinculo = new Map<string, any[]>()
  for (const rv of rubricasVinculoTodas as unknown as Array<Record<string, unknown>>) {
    const vid = String(rv.vinculo_id)
    const lista = rubricasPorVinculo.get(vid) ?? []
    lista.push(rv)
    rubricasPorVinculo.set(vid, lista)
  }

  // ============================================================
  // Calculo paralelo (Promise.all -- nao para no primeiro erro)
  // ============================================================
  const resultados = await Promise.all(
    batch.map(async (vinculo): Promise<ResultadoItem> => {
      try {
        const contexto: ContextoCalculo = {
          vinculoId: vinculo.vinculo_id,
          pessoaId: vinculo.pessoa_id,
          competencia,
          regimePrevidenciario: vinculo.regime_previdenciario as ContextoCalculo['regimePrevidenciario'],
          tabelaInss: p.tabelaInss,
          tabelaIrrf: p.tabelaIrrf,
          salarioFamiliaTabela: p.salarioFamiliaTabela,
          rppsAliquota: p.rppsAliquota,
          eventos: eventosPorVinculo.get(vinculo.vinculo_id) ?? [],
          dependentes: dependentesPorPessoa.get(vinculo.pessoa_id) ?? [],
          consignacoes: consignacoesPorVinculo.get(vinculo.vinculo_id) ?? [],
          outrosVinculosDaPessoa: [],
          workerId: config.WORKER_ID,
        }

        // Monta rubricas do vinculo
        const rubricasRaw = rubricasPorVinculo.get(vinculo.vinculo_id) ?? []
        const rubricasParaCalcular: RubricaParaCalcular[] = rubricasRaw.map((rv: Record<string, unknown>, idx: number) => ({
          rubricaId: String(rv.rubrica_id),
          codigo: String(rv.codigo),
          descricao: String(rv.nome),
          tipo: mapTipoRubrica(String(rv.tipo)),
          ordem: idx + 1,
          estrategiaProporcionalidade: String(rv.estrategia_proporcionalidade) as RubricaParaCalcular['estrategiaProporcionalidade'],
          valorBase: Number(rv.valor ?? 0),
          incideInss: Boolean(rv.incide_inss),
          incideIrrf: Boolean(rv.incide_irrf),
          incideFgts: Boolean(rv.incide_fgts),
          fundamentacao: `Rubrica ${rv.codigo}`,
          codigoEsocial: rv.codigo_esocial ? String(rv.codigo_esocial) : null,
        }))

        const holerite = calcularHolerite({
          contexto,
          rubricas: rubricasParaCalcular,
          dataNascimento: vinculo.data_nascimento ? new Date(vinculo.data_nascimento) : undefined,
          workerId: config.WORKER_ID,
        })

        // Grava em folha_processamento_log
        const rows = await tenantDb
          .insert(folhaProcessamentoLog)
          .values({
            folhaId,
            vinculoId: vinculo.vinculo_id,
            competencia: competenciaIso,
            versao: 1,
            snapshot: holerite.snapshot,
            duracaoMs: holerite.duracaoMs,
            workerId: config.WORKER_ID,
            hashSha256: holerite.hashSha256,
          })
          .returning({ id: folhaProcessamentoLog.id })

        // Grava holerite
        const numero = `${competenciaIso.slice(0, 7)}-${vinculo.vinculo_id.slice(0, 8)}`
        await tenantDb.execute(sqlOp`
          INSERT INTO holerites (folha_id, vinculo_id, numero, total_proventos, total_descontos, total_liquido, snapshot)
          VALUES (${folhaId}, ${vinculo.vinculo_id}, ${numero}, ${holerite.totais.proventos.toFixed(2)}, ${holerite.totais.descontos.toFixed(2)}, ${holerite.totais.liquido.toFixed(2)}, ${JSON.stringify(holerite.snapshot)}::jsonb)
        `)

        // Grava lancamentos
        for (const rubrica of holerite.rubricas) {
          await tenantDb.execute(sqlOp`
            INSERT INTO folhas_lancamentos (folha_id, vinculo_id, rubrica_id, origem, ordem, valor, base_calculo, created_by)
            VALUES (${folhaId}, ${vinculo.vinculo_id}, ${rubrica.rubricaId}, 'automatico', ${rubrica.ordem}, ${rubrica.valor.toFixed(2)}, ${rubrica.baseInss.toFixed(2)}, ${p.iniciadoPor}::uuid)
          `)
        }

        return { ok: true, vinculoId: vinculo.vinculo_id, holeriteId: rows[0]!.id }
      } catch (err) {
        const erro = err instanceof Error ? err : new Error(String(err))
        return { ok: false, vinculoId: vinculo.vinculo_id, erro }
      }
    }),
  )

  return resultados
}

function mapTipoRubrica(tipo: string): 'PROVENTO' | 'DESCONTO' | 'INFORMATIVA' {
  switch (tipo) {
    case 'provento': return 'PROVENTO'
    case 'desconto': return 'DESCONTO'
    case 'informativo':
    case 'base_calculo':
      return 'INFORMATIVA'
    default: return 'PROVENTO'
  }
}
