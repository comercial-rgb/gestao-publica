import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { jsonSchemaTransform } from 'fastify-type-provider-zod'
import { env } from '../env.js'

async function swaggerPluginFn(app: FastifyInstance) {
  if (env.NODE_ENV === 'production' && !env.ENABLE_SWAGGER_IN_PROD) {
    return
  }

  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'SaaS Municipal API',
        description: 'API multi-tenant para gestão municipal (Lei 14.133/2021).',
        version: '0.1.0',
        contact: { name: 'Suporte', email: '[email protected]' },
      },
      servers: [
        { url: 'http://localhost:3333', description: 'Desenvolvimento local' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Token JWT no header Authorization: Bearer <token>',
          },
          cookieAuth: {
            type: 'apiKey',
            in: 'cookie',
            name: 'sm_admin_access',
            description: 'Cookie httpOnly automático após login (admin)',
          },
          tenantCookie: {
            type: 'apiKey',
            in: 'cookie',
            name: 'sm_tenant_access',
            description: 'Cookie httpOnly automático após login (tenant)',
          },
          csrfToken: {
            type: 'apiKey',
            in: 'header',
            name: 'X-CSRF-Token',
            description: 'Token CSRF lido do cookie sm_csrf (obrigatório em mutations)',
          },
          tenantSlug: {
            type: 'apiKey',
            in: 'header',
            name: 'X-Tenant-Slug',
            description: 'Slug do tenant em rotas públicas (ex: /tenant/auth/login)',
          },
        },
      },
      tags: [
        { name: 'health', description: 'Health checks e info do servidor' },
        { name: 'admin-auth', description: 'Autenticação master (equipe interna do SaaS)' },
        { name: 'admin-tenants', description: 'Gestão de tenants (prefeituras)' },
        { name: 'tenant-auth', description: 'Autenticação tenant (servidores da prefeitura)' },
        { name: 'tenant-users', description: 'Gestão de usuários do tenant' },
        { name: 'tenant-pessoas', description: 'Cadastro base de pessoas (PF/PJ)' },
      ],
    },
    transform: jsonSchemaTransform,
  })

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      tryItOutEnabled: true,
    },
    staticCSP: true,
    transformSpecificationClone: true,
  })

  app.log.info('Swagger UI disponível em /docs')
}

export const swaggerPlugin = fp(swaggerPluginFn, {
  name: 'swagger-plugin',
  fastify: '5.x',
})
