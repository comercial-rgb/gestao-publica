import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createTenantDatabase, tenantSchema, eq, inArray } from '@saas-municipal/database'
import { env } from '../../../env.js'

const dotacaoImportItem = z.object({
  entidadeId: z.string().uuid(), orgaoCodigo: z.string().regex(/^\d{2}$/), unidadeCodigo: z.string().regex(/^\d{2}$/),
  funcaoCodigo: z.string().regex(/^\d{2}$/), subfuncaoCodigo: z.string().regex(/^\d{3}$/),
  programaCodigo: z.string().regex(/^\d{4}$/), acaoCodigo: z.string().regex(/^\d{4}$/),
  naturezaCategoria: z.string().regex(/^[34]$/), naturezaGrupo: z.string().regex(/^\d$/),
  modalidadeCodigo: z.string().regex(/^\d{2}$/), naturezaElemento: z.string().regex(/^\d{2}$/),
  naturezaSubelemento: z.string().regex(/^\d{2}$/).optional(),
  fonteCodigo: z.string().min(3).max(20), indicadorResultadoPrimario: z.string().max(1).optional(),
  valorInicial: z.coerce.number().positive(),
})

const importBody = z.object({
  leiOrcamentariaId: z.string().uuid(),
  exercicioId: z.string().uuid(),
  dotacoes: z.array(dotacaoImportItem).min(1).max(5000),
})

export const importarRoute: FastifyPluginAsyncZod = async (app) => {

  app.post('/preview', {
    preHandler: async (req) => req.requirePermission('orcamento:importar_xml'),
    schema: {
      tags: ['tenant-orcamento'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
      body: importBody,
      response: { 200: z.object({
        resolvidas: z.array(z.object({ linha: z.number(), classificacaoCompleta: z.string(), valorInicial: z.string(), programaResolvido: z.string(), acaoResolvida: z.string() })),
        comErro: z.array(z.object({ linha: z.number(), codigo: z.string(), motivo: z.string() })),
      }) },
    },
  }, async (req) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

    const lei = await db.query.leisOrcamentarias.findFirst({ where: (l, { eq }) => eq(l.id, req.body.leiOrcamentariaId) })
    if (!lei) throw app.httpErrors.notFound('Lei nao encontrada')
    if (lei.tipo !== 'loa') throw app.httpErrors.badRequest('Importacao so em LOAs')
    if (!lei.ppaVigenteId) throw app.httpErrors.conflict('LOA precisa ter PPA vinculado')

    const [programas, modalidades, fontes] = await Promise.all([
      db.query.programas.findMany({ where: (p, { eq }) => eq(p.ppaId, lei.ppaVigenteId!) }),
      db.query.modalidadesAplicacao.findMany({}),
      db.query.fontesRecurso.findMany({}),
    ])
    const progMap = new Map(programas.map((p) => [p.codigo, p]))
    const modMap = new Map(modalidades.map((m) => [m.codigo, m]))
    const fonteMap = new Map(fontes.map((f) => [f.codigo, f]))

    const progIds = programas.map((p) => p.id)
    const acoes = progIds.length > 0
      ? await db.query.acoes.findMany({ where: (a, { inArray: ina }) => ina(a.programaId, progIds) })
      : []
    const acaoMap = new Map(acoes.map((a) => [`${a.programaId}:${a.codigo}`, a]))

    const resolvidas: Array<{ linha: number; classificacaoCompleta: string; valorInicial: string; programaResolvido: string; acaoResolvida: string }> = []
    const comErro: Array<{ linha: number; codigo: string; motivo: string }> = []

    req.body.dotacoes.forEach((d, idx) => {
      const prog = progMap.get(d.programaCodigo)
      if (!prog) { comErro.push({ linha: idx + 1, codigo: d.programaCodigo, motivo: `Programa ${d.programaCodigo} nao cadastrado no PPA` }); return }
      const acao = acaoMap.get(`${prog.id}:${d.acaoCodigo}`)
      if (!acao) { comErro.push({ linha: idx + 1, codigo: d.acaoCodigo, motivo: `Acao ${d.acaoCodigo} nao cadastrada no programa ${d.programaCodigo}` }); return }
      const mod = modMap.get(d.modalidadeCodigo)
      if (!mod) { comErro.push({ linha: idx + 1, codigo: d.modalidadeCodigo, motivo: `Modalidade ${d.modalidadeCodigo} nao cadastrada` }); return }
      const fonte = fonteMap.get(d.fonteCodigo)
      if (!fonte) { comErro.push({ linha: idx + 1, codigo: d.fonteCodigo, motivo: `Fonte ${d.fonteCodigo} nao cadastrada` }); return }

      const cls = [d.orgaoCodigo, d.unidadeCodigo, d.funcaoCodigo, d.subfuncaoCodigo,
        prog.codigo, acao.codigo, d.naturezaCategoria, d.naturezaGrupo, mod.codigo, d.naturezaElemento,
        d.naturezaSubelemento || '00', fonte.codigo, d.indicadorResultadoPrimario || '0'].join('.')

      resolvidas.push({ linha: idx + 1, classificacaoCompleta: cls, valorInicial: d.valorInicial.toFixed(2),
        programaResolvido: `${prog.codigo} - ${prog.nome}`, acaoResolvida: `${acao.codigo} - ${acao.nome}` })
    })

    return { resolvidas, comErro }
  })

  app.post('/commit', {
    preHandler: async (req) => req.requirePermission('orcamento:importar_xml'),
    schema: {
      tags: ['tenant-orcamento'], security: [{ bearerAuth: [] }, { tenantCookie: [], csrfToken: [] }],
      body: importBody,
      response: { 200: z.object({ criadas: z.number(), ignoradasPorErro: z.number(), erros: z.array(z.object({ linha: z.number(), motivo: z.string() })) }) },
    },
  }, async (req) => {
    const tenant = await req.resolveTenant()
    const db = createTenantDatabase(env.DATABASE_URL, tenant.schemaName)

    const lei = await db.query.leisOrcamentarias.findFirst({ where: (l, { eq }) => eq(l.id, req.body.leiOrcamentariaId) })
    if (!lei || !lei.ppaVigenteId) throw app.httpErrors.badRequest('LOA sem PPA vinculado')

    const [programas, modalidades, fontes] = await Promise.all([
      db.query.programas.findMany({ where: (p, { eq }) => eq(p.ppaId, lei.ppaVigenteId!) }),
      db.query.modalidadesAplicacao.findMany({}),
      db.query.fontesRecurso.findMany({}),
    ])
    const progMap = new Map(programas.map((p) => [p.codigo, p]))
    const modMap = new Map(modalidades.map((m) => [m.codigo, m]))
    const fonteMap = new Map(fontes.map((f) => [f.codigo, f]))
    const progIds = programas.map((p) => p.id)
    const acoes = progIds.length > 0
      ? await db.query.acoes.findMany({ where: (a, { inArray: ina }) => ina(a.programaId, progIds) })
      : []
    const acaoMap = new Map(acoes.map((a) => [`${a.programaId}:${a.codigo}`, a]))

    let criadas = 0
    const erros: Array<{ linha: number; motivo: string }> = []

    for (let i = 0; i < req.body.dotacoes.length; i++) {
      const d = req.body.dotacoes[i]!
      try {
        const prog = progMap.get(d.programaCodigo)
        if (!prog) throw new Error(`Programa ${d.programaCodigo} nao cadastrado`)
        const acao = acaoMap.get(`${prog.id}:${d.acaoCodigo}`)
        if (!acao) throw new Error(`Acao ${d.acaoCodigo} nao cadastrada`)
        const mod = modMap.get(d.modalidadeCodigo)
        if (!mod) throw new Error(`Modalidade ${d.modalidadeCodigo} nao cadastrada`)
        const fonte = fonteMap.get(d.fonteCodigo)
        if (!fonte) throw new Error(`Fonte ${d.fonteCodigo} nao cadastrada`)

        const cls = [d.orgaoCodigo, d.unidadeCodigo, d.funcaoCodigo, d.subfuncaoCodigo,
          prog.codigo, acao.codigo, d.naturezaCategoria, d.naturezaGrupo, mod.codigo, d.naturezaElemento,
          d.naturezaSubelemento || '00', fonte.codigo, d.indicadorResultadoPrimario || '0'].join('.')

        const valorStr = d.valorInicial.toFixed(2)
        await db.insert(tenantSchema.dotacoes).values({
          leiOrcamentariaId: req.body.leiOrcamentariaId, exercicioId: req.body.exercicioId,
          classificacaoCompleta: cls, entidadeId: d.entidadeId,
          orgaoCodigo: d.orgaoCodigo, unidadeCodigo: d.unidadeCodigo,
          funcaoCodigo: d.funcaoCodigo, subfuncaoCodigo: d.subfuncaoCodigo,
          programaId: prog.id, acaoId: acao.id,
          naturezaCategoria: d.naturezaCategoria, naturezaGrupo: d.naturezaGrupo,
          modalidadeAplicacaoId: mod.id, naturezaElemento: d.naturezaElemento,
          naturezaSubelemento: d.naturezaSubelemento ?? null,
          fonteRecursoId: fonte.id, indicadorResultadoPrimario: d.indicadorResultadoPrimario ?? null,
          valorInicial: valorStr, valorAtualizado: valorStr, ativo: true, createdBy: req.tenantAuth!.sub,
        }).onConflictDoNothing()
        criadas++
      } catch (err) { erros.push({ linha: i + 1, motivo: (err as Error).message }) }
    }

    await db.insert(tenantSchema.tenantAuditLog).values({
      userId: req.tenantAuth!.sub, action: 'orcamento.dotacoes.importar',
      resource: 'lei_orcamentaria', resourceId: req.body.leiOrcamentariaId,
      after: { criadas, ignoradasPorErro: erros.length }, ipAddress: req.ip,
    })

    return { criadas, ignoradasPorErro: erros.length, erros }
  })
}
