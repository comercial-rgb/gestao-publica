/**
 * Seed do Plano de Contas Aplicado ao Setor Público — versão Paraná 2026.
 *
 * Estrutura: Categoria (1) > Origem (1) > Espécie (1) > Rubrica (1) > Alínea (2) > Subalínea (2) > Detalhe (2)
 * Formato código completo: "1.1.1.8.01.1.0"
 *
 * Uso:
 *   pnpm db:seed:pcasp-pr
 *   pnpm db:seed:pcasp-pr --tenant=santa-izabel-oeste
 */
import { config } from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { createMasterDatabase } from './client.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../../.env') })

interface PcaspNode {
  codigo: string
  nivel: number
  descricao: string
  analitica?: boolean
  msc?: string
}

const PCASP_PR_2026: PcaspNode[] = [
  // Nível 1 — Categoria Econômica
  { codigo: '1.0.0.0.00.0.0', nivel: 1, descricao: 'Receitas Correntes' },
  { codigo: '2.0.0.0.00.0.0', nivel: 1, descricao: 'Receitas de Capital' },
  { codigo: '7.0.0.0.00.0.0', nivel: 1, descricao: 'Receitas Correntes Intra-Orçamentárias' },
  { codigo: '8.0.0.0.00.0.0', nivel: 1, descricao: 'Receitas de Capital Intra-Orçamentárias' },
  { codigo: '9.0.0.0.00.0.0', nivel: 1, descricao: 'Deduções da Receita Corrente' },

  // ─── 1.1 Receitas Tributárias ─────────────────────────────────
  { codigo: '1.1.0.0.00.0.0', nivel: 2, descricao: 'Impostos, Taxas e Contribuições de Melhoria' },
  { codigo: '1.1.1.0.00.0.0', nivel: 3, descricao: 'Impostos' },
  { codigo: '1.1.1.3.00.0.0', nivel: 4, descricao: 'Impostos sobre a Renda e Proventos de Qualquer Natureza' },
  { codigo: '1.1.1.3.03.0.0', nivel: 5, descricao: 'Imposto sobre a Renda – Retido nas Fontes' },
  { codigo: '1.1.1.3.03.1.0', nivel: 6, descricao: 'IRRF – Trabalho', analitica: true, msc: 'IRRF-TRAB' },
  { codigo: '1.1.1.3.03.4.0', nivel: 6, descricao: 'IRRF – Outros Rendimentos', analitica: true, msc: 'IRRF-OUT' },

  { codigo: '1.1.1.8.00.0.0', nivel: 4, descricao: 'Impostos Específicos de Estados, DF e Municípios' },
  { codigo: '1.1.1.8.01.0.0', nivel: 5, descricao: 'Imposto sobre a Propriedade Predial e Territorial Urbana' },
  { codigo: '1.1.1.8.01.1.0', nivel: 6, descricao: 'IPTU – Principal', analitica: true, msc: 'IPTU-PRINC' },
  { codigo: '1.1.1.8.01.1.1', nivel: 7, descricao: 'IPTU – Parcela única com desconto', analitica: true },
  { codigo: '1.1.1.8.01.1.2', nivel: 7, descricao: 'IPTU – Parcelado', analitica: true },
  { codigo: '1.1.1.8.01.2.0', nivel: 6, descricao: 'IPTU – Multas e Juros de Mora', analitica: true, msc: 'IPTU-MJM' },
  { codigo: '1.1.1.8.01.3.0', nivel: 6, descricao: 'IPTU – Dívida Ativa', analitica: true, msc: 'IPTU-DA' },
  { codigo: '1.1.1.8.01.4.0', nivel: 6, descricao: 'IPTU – Dívida Ativa Multas e Juros', analitica: true },

  { codigo: '1.1.1.8.02.0.0', nivel: 5, descricao: 'Imposto sobre Transmissão Inter Vivos – ITBI' },
  { codigo: '1.1.1.8.02.1.0', nivel: 6, descricao: 'ITBI – Principal', analitica: true, msc: 'ITBI-PRINC' },
  { codigo: '1.1.1.8.02.2.0', nivel: 6, descricao: 'ITBI – Multas e Juros', analitica: true },

  { codigo: '1.1.1.8.04.0.0', nivel: 5, descricao: 'Imposto sobre Serviços de Qualquer Natureza' },
  { codigo: '1.1.1.8.04.1.0', nivel: 6, descricao: 'ISS – Principal', analitica: true, msc: 'ISS-PRINC' },
  { codigo: '1.1.1.8.04.2.0', nivel: 6, descricao: 'ISS – Multas e Juros', analitica: true },
  { codigo: '1.1.1.8.04.3.0', nivel: 6, descricao: 'ISS – Dívida Ativa', analitica: true, msc: 'ISS-DA' },

  // ─── 1.1.2 Taxas ────────────────────────────────────────────
  { codigo: '1.1.2.0.00.0.0', nivel: 3, descricao: 'Taxas' },
  { codigo: '1.1.2.1.00.0.0', nivel: 4, descricao: 'Taxas pelo Exercício do Poder de Polícia' },
  { codigo: '1.1.2.1.01.1.0', nivel: 6, descricao: 'Taxa de Localização e Funcionamento', analitica: true },
  { codigo: '1.1.2.1.02.1.0', nivel: 6, descricao: 'Taxa de Licença para Construção', analitica: true },
  { codigo: '1.1.2.1.03.1.0', nivel: 6, descricao: 'Taxa de Vigilância Sanitária', analitica: true },
  { codigo: '1.1.2.2.00.0.0', nivel: 4, descricao: 'Taxas pela Prestação de Serviços' },
  { codigo: '1.1.2.2.01.1.0', nivel: 6, descricao: 'Taxa de Coleta de Lixo', analitica: true },
  { codigo: '1.1.2.2.02.1.0', nivel: 6, descricao: 'Taxa de Emissão de Documentos', analitica: true },

  // ─── 1.1.3 Contribuições de Melhoria ───────────────────────
  { codigo: '1.1.3.0.00.0.0', nivel: 3, descricao: 'Contribuição de Melhoria' },
  { codigo: '1.1.3.0.01.1.0', nivel: 6, descricao: 'Contribuição de Melhoria – Pavimentação', analitica: true },

  // ─── 1.2 Contribuições ─────────────────────────────────────
  { codigo: '1.2.0.0.00.0.0', nivel: 2, descricao: 'Contribuições' },
  { codigo: '1.2.4.0.00.0.0', nivel: 3, descricao: 'Contribuição para Custeio do Serviço de Iluminação Pública' },
  { codigo: '1.2.4.0.01.1.0', nivel: 6, descricao: 'COSIP', analitica: true, msc: 'COSIP' },

  // ─── 1.3 Patrimoniais ──────────────────────────────────────
  { codigo: '1.3.0.0.00.0.0', nivel: 2, descricao: 'Receita Patrimonial' },
  { codigo: '1.3.2.0.00.0.0', nivel: 3, descricao: 'Valores Mobiliários' },
  { codigo: '1.3.2.1.00.1.0', nivel: 6, descricao: 'Remuneração de Depósitos Bancários', analitica: true },
  { codigo: '1.3.3.0.00.0.0', nivel: 3, descricao: 'Delegação de Serviços Públicos' },
  { codigo: '1.3.3.0.01.1.0', nivel: 6, descricao: 'Concessão de Serviços', analitica: true },

  // ─── 1.7 Transferências Correntes ──────────────────────────
  { codigo: '1.7.0.0.00.0.0', nivel: 2, descricao: 'Transferências Correntes' },
  { codigo: '1.7.1.0.00.0.0', nivel: 3, descricao: 'Transferências da União' },
  { codigo: '1.7.1.8.00.0.0', nivel: 4, descricao: 'Transferências da União – Específicas E/F/M' },
  { codigo: '1.7.1.8.01.1.0', nivel: 6, descricao: 'FPM – Cota Mensal', analitica: true, msc: 'FPM' },
  { codigo: '1.7.1.8.01.2.0', nivel: 6, descricao: 'FPM – 1% de Dezembro', analitica: true },
  { codigo: '1.7.1.8.01.3.0', nivel: 6, descricao: 'FPM – 1% de Julho', analitica: true },
  { codigo: '1.7.1.8.02.1.0', nivel: 6, descricao: 'ITR – Cota Parte', analitica: true },
  { codigo: '1.7.1.8.05.1.0', nivel: 6, descricao: 'Lei Kandir – Compensação Financeira', analitica: true },
  { codigo: '1.7.1.8.06.1.0', nivel: 6, descricao: 'Transferência do SUS – Bloco Atenção Básica', analitica: true, msc: 'SUS-AB' },
  { codigo: '1.7.1.8.06.2.0', nivel: 6, descricao: 'Transferência do SUS – MAC', analitica: true, msc: 'SUS-MAC' },
  { codigo: '1.7.1.8.07.1.0', nivel: 6, descricao: 'Transferência do FNDE – PNAE (Merenda)', analitica: true, msc: 'FNDE-PNAE' },
  { codigo: '1.7.1.8.07.2.0', nivel: 6, descricao: 'Transferência do FNDE – PNATE (Transporte)', analitica: true },
  { codigo: '1.7.1.8.08.1.0', nivel: 6, descricao: 'Convênios da União', analitica: true },

  { codigo: '1.7.2.0.00.0.0', nivel: 3, descricao: 'Transferências do Estado' },
  { codigo: '1.7.2.8.00.0.0', nivel: 4, descricao: 'Transferências do Estado – Específicas' },
  { codigo: '1.7.2.8.01.1.0', nivel: 6, descricao: 'Cota-Parte do ICMS', analitica: true, msc: 'ICMS-CP' },
  { codigo: '1.7.2.8.01.2.0', nivel: 6, descricao: 'Cota-Parte do IPVA', analitica: true, msc: 'IPVA-CP' },
  { codigo: '1.7.2.8.01.3.0', nivel: 6, descricao: 'Cota-Parte do IPI – Exportações', analitica: true },

  { codigo: '1.7.5.0.00.0.0', nivel: 3, descricao: 'Transferências de Outras Instituições Públicas' },
  { codigo: '1.7.5.8.01.1.0', nivel: 6, descricao: 'Transferências do FUNDEB', analitica: true, msc: 'FUNDEB' },
  { codigo: '1.7.5.8.01.2.0', nivel: 6, descricao: 'FUNDEB – Complementação da União VAAF', analitica: true },

  // ─── 1.9 Outras Receitas Correntes ────────────────────────
  { codigo: '1.9.0.0.00.0.0', nivel: 2, descricao: 'Outras Receitas Correntes' },
  { codigo: '1.9.1.0.00.0.0', nivel: 3, descricao: 'Multas Administrativas, Contratuais e Judiciais' },
  { codigo: '1.9.1.0.01.1.0', nivel: 6, descricao: 'Multas de Trânsito', analitica: true, msc: 'MULT-TRANS' },
  { codigo: '1.9.1.0.02.1.0', nivel: 6, descricao: 'Multas Administrativas Diversas', analitica: true },
  { codigo: '1.9.3.0.00.0.0', nivel: 3, descricao: 'Indenizações, Restituições e Ressarcimentos' },
  { codigo: '1.9.3.0.01.1.0', nivel: 6, descricao: 'Restituições Diversas', analitica: true },

  // ─── 2 Receitas de Capital ────────────────────────────────
  { codigo: '2.1.0.0.00.0.0', nivel: 2, descricao: 'Operações de Crédito' },
  { codigo: '2.1.1.0.00.0.0', nivel: 3, descricao: 'Operações de Crédito Internas' },
  { codigo: '2.1.1.8.01.1.0', nivel: 6, descricao: 'Empréstimos – Bancos do Brasil', analitica: true },

  { codigo: '2.2.0.0.00.0.0', nivel: 2, descricao: 'Alienação de Bens' },
  { codigo: '2.2.1.0.00.0.0', nivel: 3, descricao: 'Alienação de Bens Móveis' },
  { codigo: '2.2.1.0.01.1.0', nivel: 6, descricao: 'Alienação de Veículos', analitica: true },
  { codigo: '2.2.2.0.00.0.0', nivel: 3, descricao: 'Alienação de Bens Imóveis' },
  { codigo: '2.2.2.0.01.1.0', nivel: 6, descricao: 'Alienação de Terrenos', analitica: true },

  { codigo: '2.4.0.0.00.0.0', nivel: 2, descricao: 'Transferências de Capital' },
  { codigo: '2.4.1.0.00.0.0', nivel: 3, descricao: 'Transferências da União – Capital' },
  { codigo: '2.4.1.8.01.1.0', nivel: 6, descricao: 'Convênios de Capital – União', analitica: true },
  { codigo: '2.4.2.8.01.1.0', nivel: 6, descricao: 'Convênios de Capital – Estado', analitica: true },

  // ─── 9 Deduções da Receita Corrente ─────────────────────
  { codigo: '9.1.0.0.00.0.0', nivel: 2, descricao: 'Deduções da Receita Corrente – FUNDEB' },
  { codigo: '9.1.7.2.01.1.0', nivel: 6, descricao: 'Dedução de ICMS – FUNDEB', analitica: true, msc: 'DED-ICMS-FUNDEB' },
  { codigo: '9.1.7.2.01.2.0', nivel: 6, descricao: 'Dedução de IPVA – FUNDEB', analitica: true, msc: 'DED-IPVA-FUNDEB' },
  { codigo: '9.1.7.1.01.1.0', nivel: 6, descricao: 'Dedução de FPM – FUNDEB', analitica: true, msc: 'DED-FPM-FUNDEB' },
]

function codigoReduzido(codigo: string): string {
  return codigo.replace(/\./g, '')
}

function calcularCodigoPai(codigo: string, nivel: number): string | null {
  if (nivel === 1) return null
  const partes = codigo.split('.')
  const novaPartes = [...partes]
  switch (nivel) {
    case 2: novaPartes[1] = '0'; break
    case 3: novaPartes[2] = '0'; break
    case 4: novaPartes[3] = '0'; break
    case 5: novaPartes[4] = '00'; break
    case 6: novaPartes[5] = '0'; break
    case 7: novaPartes[6] = '0'; break
  }
  return novaPartes.join('.')
}

async function seedTenant(connectionString: string, schemaName: string): Promise<void> {
  const client = postgres(connectionString, { max: 1 })

  try {
    await client.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL search_path TO "${schemaName}", public`)

      const versaoRows = await tx<{ id: string }[]>`
        INSERT INTO pcasp_versoes (uf, ano, fonte, ativa)
        VALUES ('PR', 2026, 'TCE-PR Resolução 2026 + MCASP 9ª edição', true)
        ON CONFLICT (uf, ano) DO UPDATE SET ativa = EXCLUDED.ativa
        RETURNING id
      `
      const versaoId = versaoRows[0]?.id
      if (!versaoId) throw new Error('Falha ao criar versão PCASP')

      const ordered = [...PCASP_PR_2026].sort((a, b) => a.nivel - b.nivel || a.codigo.localeCompare(b.codigo))

      for (const node of ordered) {
        const codigoPai = calcularCodigoPai(node.codigo, node.nivel)
        let parentId: string | null = null

        if (codigoPai) {
          const parentRows = await tx<{ id: string }[]>`
            SELECT id FROM receitas_naturezas WHERE codigo_completo = ${codigoPai}
          `
          parentId = parentRows[0]?.id ?? null
        }

        await tx`
          INSERT INTO receitas_naturezas
            (codigo_completo, codigo_reduzido, descricao, nivel, parent_id, analitica, pcasp_versao_id, identificador_msc)
          VALUES
            (${node.codigo}, ${codigoReduzido(node.codigo)}, ${node.descricao}, ${node.nivel},
             ${parentId}, ${node.analitica ?? false}, ${versaoId}, ${node.msc ?? null})
          ON CONFLICT (codigo_completo) DO UPDATE SET
            descricao = EXCLUDED.descricao,
            analitica = EXCLUDED.analitica,
            identificador_msc = EXCLUDED.identificador_msc,
            updated_at = now()
        `
      }
    })
  } finally {
    await client.end()
  }
}

async function main() {
  const DATABASE_URL = process.env.DATABASE_URL
  if (!DATABASE_URL) { console.error('[ERRO] DATABASE_URL ausente'); process.exit(1) }

  const tenantFilter = process.argv.slice(2).find(a => a.startsWith('--tenant='))?.split('=')[1]

  const db = createMasterDatabase(DATABASE_URL)
  const tenants = await db.query.tenants.findMany({
    where: (t, { eq, and, isNull }) =>
      and(
        eq(t.status, 'active'),
        isNull(t.deletedAt),
        tenantFilter ? eq(t.slug, tenantFilter) : undefined,
      ),
  })

  console.log(`[seed] PCASP-PR 2026 em ${tenants.length} tenant(s)...`)

  for (const tenant of tenants) {
    process.stdout.write(`  → ${tenant.slug}: `)
    try {
      await seedTenant(DATABASE_URL, tenant.schemaName)
      console.log(`✓ ${PCASP_PR_2026.length} naturezas`)
    } catch (err) {
      console.error(`✗ ${(err as Error).message}`)
    }
  }

  process.exit(0)
}

main()
