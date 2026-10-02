import "dotenv/config";
import { readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import { cadastrarNaturezaReceita } from "../../modules/m04-receita/ementario.js";
import { cadastrarTipoDeConsignacao, decisaoVigente, redefinirContaDaConsignacao } from "../../modules/m07-extraorcamentario/servico-tipos-de-consignacao.js";
import { classificarRetencaoPropria, classificacaoPropriaVigente } from "../../modules/m07-extraorcamentario/retencao-propria.js";
import { diaCivil, meioDiaCivil } from "../../packages/datas/index.js";

/**
 * V26 (ordem, item 3) — O QUE A PROMOÇÃO DA APRESENTAÇÃO FAZ NO BANCO, depois das migrations. Roda contra a CÓPIA do
 * banco (nunca contra o original, que fica intacto como reversão): `DATABASE_URL=<cópia> CARGA_POR=<usuário> npx tsx
 * scripts/implantacao/v26-preparar-promocao.ts <arquivo-do-relatório.md>`.
 *
 * Faz, idempotente e pelos serviços do sistema (com autorização e fundamento):
 *  1. confere que todas as migrations do repositório estão aplicadas (senão para, sem gravar nada);
 *  2. as naturezas da receita do IR e do ISS próprios (ementário STN 2026, decididas na ordem V26, item 1);
 *  3. os vínculos das consignações: ISS deixa Garantias e vai a 2.1.8.8.1.01.08; INSS vai à analítica do RGPS
 *     2.1.8.8.1.01.02; IRRF passa a existir em 2.1.8.8.1.01.04 (redefinição versionada: os fatos antigos ficam na conta
 *     em que foram lançados);
 *  4. a decisão de que o IR e o ISS retidos são receita do município (a cadeia de receita, não só a consignação).
 *
 * NÃO faz: regularizar fato antigo (o relatório o identifica e propõe; quem regulariza é o contador, pela tela
 * Financeiro › Retenções do município), trocar o nome ou o IBGE do ente, apagar ou recriar o banco.
 */

const PCASP = "PCASP do TCE-PB 2025 (docs/oficial/tce-pb/Pcasp_2025.xlsx)";
const ORDEM = "ordem V26, item 1 (docs/lotes/V26-decisoes-da-v25.md)";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  const por = process.env.CARGA_POR ?? "";
  const saida = process.argv[2] ?? "";
  if (url === "" || por === "" || saida === "") throw new Error("Uso: DATABASE_URL=<cópia> CARGA_POR=<usuário> npx tsx scripts/implantacao/v26-preparar-promocao.ts <relatorio.md>");
  const prisma = criarPrismaClient(url);
  const passos: string[] = [];
  const passo = (s: string): void => {
    passos.push(s);
    console.log(s);
  };
  try {
    // 1. Migrations.
    const noRepo = readdirSync(resolve(import.meta.dirname, "../../prisma/migrations")).filter((n) => /^\d{14}_/.test(n)).sort();
    const aplicadas = new Set((await prisma.$queryRawUnsafe<{ migration_name: string }[]>(`select migration_name from _prisma_migrations where finished_at is not null`)).map((r) => r.migration_name));
    const faltam = noRepo.filter((n) => !aplicadas.has(n));
    if (faltam.length > 0) throw new Error(`Migrations ainda não aplicadas neste banco (${faltam.length}): ${faltam.join(", ")}. Rode "npx prisma migrate deploy" antes. Nada foi gravado.`);
    passo(`= migrations: ${noRepo.length} de ${noRepo.length} aplicadas`);

    // Pré-condições de cadastro antes de qualquer gravação.
    const fonte = await prisma.fonteRecurso.findFirst({ where: { codigo: "500" }, select: { id: true } });
    if (fonte === null) throw new Error("Fonte 500 ausente. Nada foi gravado.");
    for (const c of ["2.1.8.8.1.01.02", "2.1.8.8.1.01.04", "2.1.8.8.1.01.08", "1.1.2.1.1.01.01", "1.1.2.1.1.01.07", "4.1.1.2.1.03.01", "4.1.1.2.1.03.02", "4.1.1.3.1.02.00"]) {
      const conta = await prisma.contaPcasp.findUnique({ where: { codigo: c }, select: { analitica: true } });
      if (conta === null || !conta.analitica) throw new Error(`A conta ${c} não existe ou não é analítica neste plano. Nada foi gravado.`);
    }

    // 2. Naturezas (ementário STN 2026, o principal pelo último dígito 1).
    for (const n of [
      { codigo: "11130311", descricao: "Imposto sobre a Renda - Retido na Fonte - Trabalho - Principal" },
      { codigo: "11130341", descricao: "Imposto sobre a Renda - Retido na Fonte - Outros Rendimentos - Principal" },
      { codigo: "11145111", descricao: "Imposto sobre Serviços de Qualquer Natureza - ISSQN - Principal" },
    ]) {
      if ((await prisma.naturezaReceita.findUnique({ where: { codigo: n.codigo } })) !== null) passo(`= natureza ${n.codigo}`);
      else {
        await cadastrarNaturezaReceita(prisma, { ...n, criadoPor: por });
        passo(`+ natureza ${n.codigo} ${n.descricao}`);
      }
    }

    // 3. Os vínculos das consignações.
    // O tipo anterior ao histórico de decisões guarda a conta no próprio cadastro: é ela a vigente até a primeira decisão.
    const contaVigente = async (tipoId: string): Promise<string | null> =>
      (await decisaoVigente(prisma, tipoId))?.contaPassivoCodigo ??
      (await prisma.tipoConsignacao.findUnique({ where: { id: tipoId }, select: { contaPassivo: { select: { codigo: true } } } }))?.contaPassivo?.codigo ??
      null;
    for (const v of [
      { codigo: "ISS", descricao: "ISS retido na fonte", conta: "2.1.8.8.1.01.08", motivo: `${PCASP}: 2.1.8.8.1.01.08 ISS, analítica; a conta anterior era Garantias (2.1.8.8.1.02.00), que não é de consignação de imposto` },
      { codigo: "INSS", descricao: "INSS retido na fonte", conta: "2.1.8.8.1.01.02", motivo: `${PCASP}: 2.1.8.8.1.01.02 Contribuição ao RGPS, analítica; a conta anterior (2.1.8.8.1.01.00) é sintética` },
      { codigo: "IRRF", descricao: "Imposto de renda retido na fonte", conta: "2.1.8.8.1.01.04", motivo: `${PCASP}: 2.1.8.8.1.01.04 IRRF, analítica` },
    ]) {
      const tipo = await prisma.tipoConsignacao.findUnique({ where: { codigo: v.codigo }, select: { id: true } });
      if (tipo === null) {
        await cadastrarTipoDeConsignacao(prisma, { codigo: v.codigo, descricao: v.descricao, contaPassivoCodigo: v.conta, fundamento: v.motivo, criadoPor: por });
        passo(`+ consignação ${v.codigo} em ${v.conta}`);
        continue;
      }
      const atual = await contaVigente(tipo.id);
      if (atual === v.conta) passo(`= consignação ${v.codigo} já em ${v.conta}`);
      else {
        await redefinirContaDaConsignacao(prisma, { tipoId: tipo.id, contaPassivoCodigo: v.conta, fundamento: v.motivo, criadoPor: por });
        passo(`~ consignação ${v.codigo}: ${atual ?? "sem conta"} -> ${v.conta}`);
      }
    }

    // 4. A cadeia de receita do IR e do ISS próprios.
    const desde = meioDiaCivil("2026-01-01");
    for (const c of [
      { fato: "IRRF_FOLHA" as const, tipo: "IRRF", natureza: "11130311", credito: "1.1.2.1.1.01.01", vpa: "4.1.1.2.1.03.01" },
      { fato: "IRRF_FORNECEDOR_PJ" as const, tipo: "IRRF", natureza: "11130341", credito: "1.1.2.1.1.01.01", vpa: "4.1.1.2.1.03.02" },
      { fato: "ISS" as const, tipo: "ISS", natureza: "11145111", credito: "1.1.2.1.1.01.07", vpa: "4.1.1.3.1.02.00" },
    ]) {
      const vigente = await classificacaoPropriaVigente(prisma, c.fato, new Date());
      if (vigente !== null) {
        passo(`= receita própria ${c.fato} já decidida`);
        continue;
      }
      await classificarRetencaoPropria(prisma, {
        fato: c.fato,
        tipoConsignacaoCodigo: c.tipo,
        naturezaReceitaCodigo: c.natureza,
        fonteCodigo: "500",
        contaCreditoCodigo: c.credito,
        contaVpaCodigo: c.vpa,
        entidadeTitularId: null,
        vigenteDesde: desde,
        fundamento: `${ORDEM}; ${PCASP}; MCASP 11ª ed., Parte I 3.6.2`,
        criadoPor: por,
      });
      passo(`+ receita própria ${c.fato}: natureza ${c.natureza}, crédito ${c.credito}, VPA ${c.vpa}`);
    }

    // 5. Inventário dos fatos afetados (sem regularizar).
    const saldos = await prisma.$queryRawUnsafe<{ codigo: string; nome: string; partidas: number; saldo: string }[]>(
      `select c.codigo, c.nome, count(*)::int as partidas, sum(case when p.tipo='CREDITO' then p.valor else -p.valor end)::text as saldo
         from "PartidaContabil" p join "ContaPcasp" c on c.id = p."contaId"
        where c.codigo in ('2.1.8.8.1.02.00','2.1.8.8.1.01.00') group by 1,2 order by 1`
    );
    const movimentos = await prisma.movimentoExtraorcamentario.findMany({
      where: { tipoConsignacao: { codigo: { in: ["ISS", "INSS", "IRRF"] } } },
      orderBy: { data: "asc" },
      select: { tipo: true, valor: true, data: true, credorConsignatario: true, pagamentoId: true, tipoConsignacao: { select: { codigo: true } }, lancamento: { select: { partidas: { select: { tipo: true, conta: { select: { codigo: true } } } } } } },
    });
    const ente = await prisma.enteConfig.findFirst({ select: { nome: true, codigoIbge: true } });
    const linhas = [
      `# V26 — preparação da promoção: resultado em ${new Date().toISOString()}`,
      "",
      "## Passos",
      "",
      ...passos.map((p) => `- \`${p}\``),
      "",
      "## Fatos afetados pelos vínculos antigos (não regularizados aqui)",
      "",
      "| Conta | Nome | Partidas | Saldo credor |",
      "|---|---|---:|---:|",
      ...saldos.map((s) => `| ${s.codigo} | ${s.nome} | ${s.partidas} | ${s.saldo} |`),
      ...(saldos.length === 0 ? ["| — | nenhuma partida nas contas antigas | 0 | 0,00 |"] : []),
      "",
      "| Dia | Consignação | Movimento | Valor | Credor | Do pagamento | Conta do passivo no lançamento |",
      "|---|---|---|---:|---|---|---|",
      ...movimentos.map(
        (m) =>
          `| ${diaCivil(m.data)} | ${m.tipoConsignacao.codigo} | ${m.tipo} | ${m.valor.toFixed(2)} | ${m.credorConsignatario} | ${m.pagamentoId === null ? "não" : "sim"} | ${m.lancamento.partidas.filter((p) => p.conta.codigo.startsWith("2.")).map((p) => p.conta.codigo).join(", ")} |`
      ),
      "",
      `Ente neste banco: ${ente?.nome ?? "(sem cadastro)"}, IBGE ${ente?.codigoIbge ?? "-"}. Nenhum fato foi alterado nem renomeado.`,
    ];
    writeFileSync(saida, `${linhas.join("\n")}\n`);
    console.log(`Relatório: ${saida}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
