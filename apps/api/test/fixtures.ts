import postgres from 'postgres'
import { env } from '../src/env.js'

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
