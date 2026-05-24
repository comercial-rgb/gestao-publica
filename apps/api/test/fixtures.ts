import postgres from 'postgres'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { env } from '../src/env.js'
import { seedFolhaPublico } from '@saas-municipal/database/seeds/folha-publico'
import { hashSnapshotSha256 } from '@saas-municipal/database/utils/hash-snapshot'
import { folhaCalculoSchema } from '@saas-municipal/database'

export interface OrcamentoFixtures {
  entidadeId: string
  ppaId: string
  loaId: string
  exercicioId: string
  programaId: string
  acaoId: string
  modalidadeId: string
  fonteId: string
  dotacaoAId: string
  dotacaoBId: string
  valorInicialA: string
  valorInicialB: string
}

/**
 * Cria estrutura mínima de orçamento para testar aplicar-crédito.
 */
export async function seedOrcamentoBasico(
  schemaName: string,
  userId: string,
): Promise<OrcamentoFixtures> {
  const client = postgres(env.DATABASE_URL, { max: 1 })

  try {
    return await client.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL search_path TO "${schemaName}", public`)

      const [entidade] = await tx<{ id: string }[]>`
        INSERT INTO entidades (codigo, nome, tipo)
        VALUES ('001', 'Prefeitura Test', 'prefeitura')
        RETURNING id
      `

      const [ppa] = await tx<{ id: string }[]>`
        INSERT INTO leis_orcamentarias
          (tipo, numero, descricao, ano_inicio, ano_fim, status, created_by)
        VALUES
          ('ppa', 'Lei Test PPA/2026', 'PPA 2026-2029', 2026, 2029, 'em_execucao', ${userId}::uuid)
        RETURNING id
      `

      const [loa] = await tx<{ id: string }[]>`
        INSERT INTO leis_orcamentarias
          (tipo, numero, descricao, ano_inicio, ano_fim, status, ppa_vigente_id, created_by)
        VALUES
          ('loa', 'Lei Test LOA/2026', 'LOA 2026', 2026, 2026, 'em_execucao', ${ppa!.id}::uuid, ${userId}::uuid)
        RETURNING id
      `

      const [exercicio] = await tx<{ id: string }[]>`
        SELECT id FROM exercicios WHERE ano = 2026 LIMIT 1
      `
      if (!exercicio) throw new Error('Exercício 2026 não foi seedado pelo baseline')

      const [programa] = await tx<{ id: string }[]>`
        INSERT INTO programas (ppa_id, codigo, nome, ativo)
        VALUES (${ppa!.id}::uuid, '0001', 'Programa Test', true)
        RETURNING id
      `

      const [acao] = await tx<{ id: string }[]>`
        INSERT INTO acoes (programa_id, codigo, nome, tipo, ativo)
        VALUES (${programa!.id}::uuid, '2003', 'Ação Test', 2, true)
        RETURNING id
      `

      let modalidadeId: string
      const [modalidade] = await tx<{ id: string }[]>`
        SELECT id FROM modalidades_aplicacao WHERE codigo = '90' LIMIT 1
      `
      if (!modalidade) {
        const [m] = await tx<{ id: string }[]>`
          INSERT INTO modalidades_aplicacao (codigo, descricao, tipo, ativo)
          VALUES ('90', 'Aplicações Diretas', 'stn', true)
          RETURNING id
        `
        modalidadeId = m!.id
      } else {
        modalidadeId = modalidade.id
      }

      let fonteId: string
      const [fonte] = await tx<{ id: string }[]>`
        SELECT id FROM fontes_recurso WHERE codigo = '1.500.0000' LIMIT 1
      `
      if (!fonte) {
        const [f] = await tx<{ id: string }[]>`
          INSERT INTO fontes_recurso (codigo, descricao, grupo, tipo, ativo)
          VALUES ('1.500.0000', 'Recursos Não Vinculados de Impostos', '1', 'stn', true)
          RETURNING id
        `
        fonteId = f!.id
      } else {
        fonteId = fonte.id
      }

      const classificacaoA = '03.01.10.301.0001.2003.3.3.90.30.00.1.500.0000.U'
      const [dotacaoA] = await tx<{ id: string }[]>`
        INSERT INTO dotacoes (
          lei_orcamentaria_id, exercicio_id, classificacao_completa,
          entidade_id, orgao_codigo, unidade_codigo, funcao_codigo, subfuncao_codigo,
          programa_id, acao_id,
          natureza_categoria, natureza_grupo, modalidade_aplicacao_id, natureza_elemento,
          fonte_recurso_id, indicador_resultado_primario,
          valor_inicial, valor_atualizado,
          ativo, created_by
        ) VALUES (
          ${loa!.id}::uuid, ${exercicio.id}::uuid, ${classificacaoA},
          ${entidade!.id}::uuid, '03', '01', '10', '301',
          ${programa!.id}::uuid, ${acao!.id}::uuid,
          '3', '3', ${modalidadeId}::uuid, '30',
          ${fonteId}::uuid, 'U',
          '100000.00', '100000.00',
          true, ${userId}::uuid
        ) RETURNING id
      `

      const classificacaoB = '03.01.10.302.0001.2003.3.3.90.30.00.1.500.0000.U'
      const [dotacaoB] = await tx<{ id: string }[]>`
        INSERT INTO dotacoes (
          lei_orcamentaria_id, exercicio_id, classificacao_completa,
          entidade_id, orgao_codigo, unidade_codigo, funcao_codigo, subfuncao_codigo,
          programa_id, acao_id,
          natureza_categoria, natureza_grupo, modalidade_aplicacao_id, natureza_elemento,
          fonte_recurso_id, indicador_resultado_primario,
          valor_inicial, valor_atualizado,
          ativo, created_by
        ) VALUES (
          ${loa!.id}::uuid, ${exercicio.id}::uuid, ${classificacaoB},
          ${entidade!.id}::uuid, '03', '01', '10', '302',
          ${programa!.id}::uuid, ${acao!.id}::uuid,
          '3', '3', ${modalidadeId}::uuid, '30',
          ${fonteId}::uuid, 'U',
          '50000.00', '50000.00',
          true, ${userId}::uuid
        ) RETURNING id
      `

      return {
        entidadeId: entidade!.id,
        ppaId: ppa!.id,
        loaId: loa!.id,
        exercicioId: exercicio.id,
        programaId: programa!.id,
        acaoId: acao!.id,
        modalidadeId,
        fonteId,
        dotacaoAId: dotacaoA!.id,
        dotacaoBId: dotacaoB!.id,
        valorInicialA: '100000.00',
        valorInicialB: '50000.00',
      }
    })
  } finally {
    await client.end()
  }
}

export async function seedCreditoAprovado(
  schemaName: string,
  userId: string,
  fixtures: OrcamentoFixtures,
  opts: {
    valorReforcoA: string
    valorAnulacaoB: string
    numero?: string
  },
): Promise<{ creditoId: string; linhaReforcoId: string; linhaAnulacaoId: string }> {
  const client = postgres(env.DATABASE_URL, { max: 1 })

  try {
    return await client.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL search_path TO "${schemaName}", public`)

      const numero = opts.numero ?? `Decreto TEST-${Math.floor(Math.random() * 10000)}`
      const valorTotal = (Number(opts.valorReforcoA) + Number(opts.valorAnulacaoB)).toFixed(2)

      const [credito] = await tx<{ id: string }[]>`
        INSERT INTO creditos_orcamentarios (
          exercicio_id, lei_orcamentaria_id, numero, tipo, origem,
          valor, data_decreto, justificativa, status, created_by
        ) VALUES (
          ${fixtures.exercicioId}::uuid, ${fixtures.loaId}::uuid,
          ${numero}, 'suplementar', 'anulacao_dotacao',
          ${valorTotal}, '2026-05-01',
          'Crédito de teste para validação automatizada de aplicação',
          'aprovado', ${userId}::uuid
        ) RETURNING id
      `

      const [reforco] = await tx<{ id: string }[]>`
        INSERT INTO creditos_dotacoes (credito_id, dotacao_id, sinal, valor)
        VALUES (${credito!.id}::uuid, ${fixtures.dotacaoAId}::uuid, 1, ${opts.valorReforcoA})
        RETURNING id
      `

      const [anulacao] = await tx<{ id: string }[]>`
        INSERT INTO creditos_dotacoes (credito_id, dotacao_id, sinal, valor)
        VALUES (${credito!.id}::uuid, ${fixtures.dotacaoBId}::uuid, -1, ${opts.valorAnulacaoB})
        RETURNING id
      `

      return {
        creditoId: credito!.id,
        linhaReforcoId: reforco!.id,
        linhaAnulacaoId: anulacao!.id,
      }
    })
  } finally {
    await client.end()
  }
}

export interface DespesaPipelineFixtures {
  fornecedorId: string
  empenhoId: string
  empenhoNumero: string
  liquidacaoId: string
  liquidacaoNumero: string
  opId: string
  opNumero: string
  mesFiscalId: string
  empenhoValor: string
  empenhoLiquidadoInicial: string
  opValor: string
}

/**
 * Cria pipeline pronto ate liquidacao:
 *   - usa seedOrcamentoBasico para ter dotacao A (100k)
 *   - cria 1 fornecedor PJ
 *   - cria 1 empenho de 30k na dotacao A
 *   - cria 1 liquidacao de 15k do empenho
 *   - cria 1 OP de 15k aprovada (pronta pra receber pagamento)
 */
export async function seedDespesaProntaParaPagar(
  schemaName: string,
  userId: string,
  orcamento: OrcamentoFixtures,
): Promise<DespesaPipelineFixtures> {
  const client = postgres(env.DATABASE_URL, { max: 1 })

  try {
    return await client.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL search_path TO "${schemaName}", public`)

      const [mes] = await tx<{ id: string }[]>`
        SELECT id FROM meses_fiscais WHERE exercicio_id = ${orcamento.exercicioId}::uuid AND mes = 1
      `
      if (!mes) throw new Error('Mes fiscal 01/2026 nao foi seedado pelo baseline')

      const [fornecedor] = await tx<{ id: string }[]>`
        INSERT INTO pessoas (tipo, nome, documento, active) VALUES ('PJ', 'Fornecedor Test Ltda', '12345678000100', true) RETURNING id
      `

      const [empenho] = await tx<{ id: string; numero: string }[]>`
        INSERT INTO empenhos (numero, tipo, status, exercicio_id, mes_fiscal_id, dotacao_id, fornecedor_pessoa_id, data_empenho, valor, valor_liquidado, valor_pago, valor_anulado, objeto, created_by)
        VALUES ('2026/TEST01', 'ordinario', 'vigente', ${orcamento.exercicioId}::uuid, ${mes!.id}::uuid, ${orcamento.dotacaoAId}::uuid, ${fornecedor!.id}::uuid, '2026-01-15', '30000.00', '0', '0', '0', 'Empenho de teste para cobertura de cascata de pagamento', ${userId}::uuid)
        RETURNING id, numero
      `

      await tx`UPDATE dotacoes SET valor_empenhado = valor_empenhado + 30000 WHERE id = ${orcamento.dotacaoAId}::uuid`

      const [liquidacao] = await tx<{ id: string; numero: string }[]>`
        INSERT INTO liquidacoes (numero, status, empenho_id, mes_fiscal_id, data_liquidacao, valor, valor_pago, documento_comprovante, created_by)
        VALUES ('2026/TEST-L01', 'vigente', ${empenho!.id}::uuid, ${mes!.id}::uuid, '2026-01-20', '15000.00', '0', 'NF TEST-001', ${userId}::uuid)
        RETURNING id, numero
      `

      await tx`UPDATE empenhos SET valor_liquidado = valor_liquidado + 15000 WHERE id = ${empenho!.id}::uuid`
      await tx`UPDATE dotacoes SET valor_liquidado = valor_liquidado + 15000 WHERE id = ${orcamento.dotacaoAId}::uuid`

      const [op] = await tx<{ id: string; numero: string }[]>`
        INSERT INTO ordens_pagamento (numero, status, liquidacao_id, mes_fiscal_id, valor, valor_pago, data_emissao, data_aprovacao, aprovada_em, aprovada_por_user_id, created_by)
        VALUES ('2026/TEST-OP01', 'aprovada', ${liquidacao!.id}::uuid, ${mes!.id}::uuid, '15000.00', '0', '2026-01-21', '2026-01-22', NOW(), ${userId}::uuid, ${userId}::uuid)
        RETURNING id, numero
      `

      return {
        fornecedorId: fornecedor!.id,
        empenhoId: empenho!.id, empenhoNumero: empenho!.numero,
        liquidacaoId: liquidacao!.id, liquidacaoNumero: liquidacao!.numero,
        opId: op!.id, opNumero: op!.numero,
        mesFiscalId: mes!.id,
        empenhoValor: '30000.00', empenhoLiquidadoInicial: '15000.00', opValor: '15000.00',
      }
    })
  } finally {
    await client.end()
  }
}

// ─────────────────────────────────────────────────────────────
// Folha calculo (B35)
// ─────────────────────────────────────────────────────────────

type Db = PostgresJsDatabase<Record<string, never>>

/**
 * Seed completo do modulo folha-calculo pra testes do engine (B35.2+).
 *
 * Aplica em ORDEM:
 *   1. seedFolhaPublico (INSS/IRRF/SF 2020-2026)
 *   2. RPPS aliquota vigente do tenant
 *   3. (B35.2: cargo + vinculos + dependentes + periodo fiscal + folha)
 *
 * Retorna IDs pra os testes usarem.
 */
export async function seedFolhaCalculoCompleto(opts: {
  tenantDb: Db
  publicDb: Db
  competencia: Date // ex: new Date('2026-05-01')
}): Promise<{
  rppsAliquotaId: string
  cargoId: string
  vinculoRgpsId: string
  vinculoRppsId: string
  vinculoComissionadoId: string
  pessoaId: string
  folhaId: string
  periodoFiscalId: string
}> {
  // 1. Seed publico (idempotente)
  await seedFolhaPublico(opts.publicDb)

  // 2. RPPS aliquota do municipio (exemplo: Santa Izabel do Oeste/PR)
  const [rpps] = await opts.tenantDb
    .insert(folhaCalculoSchema.rppsAliquotas)
    .values({
      vigenciaInicio: '2024-01-01',
      vigenciaFim: null,
      aliquotaServidor: '0.1400',
      aliquotaPatronalNormal: '0.2200',
      aliquotaPatronalSuplementar: '0.0500',
      tetoContribuicao: null,
      fundamentacaoLegal: 'Lei Municipal n. XXX/YYYY (fixture de teste)',
      ativa: true,
    })
    .returning({ id: folhaCalculoSchema.rppsAliquotas.id })

  // 3-5. (continua no B35.2 quando engine precisar dessas fixtures especificas)
  return {
    rppsAliquotaId: rpps!.id,
    cargoId: 'TODO',
    vinculoRgpsId: 'TODO',
    vinculoRppsId: 'TODO',
    vinculoComissionadoId: 'TODO',
    pessoaId: 'TODO',
    folhaId: 'TODO',
    periodoFiscalId: 'TODO',
  }
}

/**
 * Helper pra testes: gera holerite snapshot fake e calcula hash.
 */
export function gerarSnapshotFake(opts: {
  vinculoId: string
  bruto: number
  liquido: number
}) {
  const snapshot = {
    vinculoId: opts.vinculoId,
    competencia: '2026-05-01',
    rubricas: [
      { codigo: 'VENCIMENTO', valor: opts.bruto, tipo: 'PROVENTO' },
      { codigo: 'INSS', valor: opts.bruto * 0.14, tipo: 'DESCONTO' },
    ],
    totais: { bruto: opts.bruto, descontos: opts.bruto - opts.liquido, liquido: opts.liquido },
  }
  return { snapshot, hash: hashSnapshotSha256(snapshot) }
}
