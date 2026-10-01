import "dotenv/config";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import { criarM19Deps } from "../../modules/m19-pessoas/adapter-prisma.js";
import { cadastrarPessoa } from "../../modules/m19-pessoas/servico.js";
import { cadastrarNaturezaReceita } from "../../modules/m04-receita/ementario.js";
import { cadastrarTipoDeConsignacao } from "../../modules/m07-extraorcamentario/servico-tipos-de-consignacao.js";
import { admitirServidor, cadastrarServidor } from "../../modules/m32-pessoal/servico.js";
import { abrirFolha, calcularFolha, fecharFolha } from "../../modules/m33-folha/servico.js";
import { apropriarFolha } from "../../modules/m33-folha/apropriacao.js";
import { certificarFolha, liquidarFolha } from "../../modules/m33-folha/certificacao.js";
import { documentoTemDigitoValido } from "../../packages/documento/index.js";
import { meioDiaCivil } from "../../packages/datas/index.js";

/**
 * V26 — O QUE O BANCO PRECISA PARA MOSTRAR O IR E O ISS DO MUNICÍPIO COMO RECEITA. Cada passo chama o MESMO serviço
 * que a tela chama, com autorização; idempotente (o que existe não se cria de novo).
 *
 * 1. As naturezas de receita do principal, do ementário STN 2026 (`docs/oficial/stn-sof/ementario-2026/`):
 *    1.1.1.3.03.4.1 (IR retido — outros rendimentos) e 1.1.1.4.51.1.1 (ISSQN). A 1.1.1.3.03.1.1 já está no banco.
 * 2. O tipo de consignação IRRF, no passivo analítico 2.1.8.8.1.01.04 do PCASP do TCE-PB (é o tipo a que a decisão
 *    do IR aponta, e o legado de IR retido como consignação).
 * 3. Uma folha de SETEMBRO com um terceiro servidor acima da faixa isenta (dado de demonstração, salário 9.000,00),
 *    calculada pelas tabelas oficiais já carregadas, fechada, empenhada, certificada e liquidada — para o pagamento
 *    dela reter o IR na tela.
 *
 * As DECISÕES do ente (natureza, destinação e contas de cada imposto) NÃO são feitas aqui: são feitas pela tela
 * `/financeiro/retencoes-proprias`, no percurso.
 *
 * Uso: `DATABASE_URL=<clone> npx tsx scripts/demonstracao/preparar-v26-retencoes.ts`. Recusa qualquer banco que não
 * seja o clone de ensaio (`gestao_publica_ensaio`), salvo `PROMOVER_V26=1` no banco da apresentação (procedimento de
 * promoção, `docs/lotes/V26-decisoes-da-v25.md`).
 */

const AUTOR = "admin@cg.pb.gov.br";
const ATESTADOR = "atestador@percursos.local";
const LIQUIDANTE = "liquidante@percursos.local";
const COMPETENCIA = "2026-09";
const DATA_DO_ATO = "2026-09-30";
const D = (dia: string): Date => meioDiaCivil(dia);

function exigirBanco(): string {
  const url = process.env["DATABASE_URL"] ?? "";
  const nome = new URL(url).pathname.replace(/^\//, "");
  if (nome === "gestao_publica_ensaio") return url;
  if (nome === "gestao_publica_apresentacao" && process.env["PROMOVER_V26"] === "1") return url;
  throw new Error(`Recusado: este script grava, e só roda no clone de ensaio (ou na apresentação com PROMOVER_V26=1). Banco: "${nome}". Nada foi gravado.`);
}

function cpfComDv(raiz9: string): string {
  const d = raiz9.split("").map(Number);
  for (const t of [9, 10]) {
    let s = 0;
    for (let i = 0; i < t; i++) s += (d[i] as number) * (t + 1 - i);
    const r = s % 11;
    d.push(r < 2 ? 0 : 11 - r);
  }
  const doc = d.join("");
  if (!documentoTemDigitoValido(doc)) throw new Error(`CPF sem DV válido: ${doc}`);
  return doc;
}

const SERVIDOR = { cpf: cpfComDv("517246983"), nome: "Daniela Freitas Lima (demonstração)", nascimento: "1979-02-14", matricula: "DEMO-0003", salario: "9000.00" };

async function main(): Promise<void> {
  const prisma = criarPrismaClient(exigirBanco());
  const passo = async (rotulo: string, f: () => Promise<string>): Promise<void> => {
    try {
      console.log(`${await f()} ${rotulo}`);
    } catch (e) {
      console.error(`! ${rotulo}: RECUSADO — ${e instanceof Error ? e.message : String(e)}`);
      throw new Error(`parou em "${rotulo}"`);
    }
  };
  try {
    for (const n of [
      { codigo: "11130341", descricao: "Imposto sobre a Renda - Retido na Fonte - Outros Rendimentos - Principal" },
      { codigo: "11145111", descricao: "Imposto sobre Serviços de Qualquer Natureza - ISSQN - Principal" },
    ]) {
      await passo(`natureza ${n.codigo}`, async () => {
        if ((await prisma.naturezaReceita.findUnique({ where: { codigo: n.codigo } })) !== null) return "=";
        await cadastrarNaturezaReceita(prisma, { ...n, criadoPor: AUTOR });
        return "+";
      });
    }
    await passo("tipo de consignação IRRF (2.1.8.8.1.01.04)", async () => {
      if ((await prisma.tipoConsignacao.findUnique({ where: { codigo: "IRRF" } })) !== null) return "=";
      await cadastrarTipoDeConsignacao(prisma, { codigo: "IRRF", descricao: "Imposto de renda retido na fonte", contaPassivoCodigo: "2.1.8.8.1.01.04", fundamento: "PCASP do TCE-PB 2025: 2.1.8.8.1.01.04 IRRF, analítica", criadoPor: AUTOR });
      return "+";
    });

    // ── a folha de setembro com IR ──
    const m19 = criarM19Deps(prisma);
    // O cargo e a lotação da folha de demonstração de agosto (semear-folha-da-demonstracao.ts).
    const cargo = await prisma.cargo.findFirst({ where: { codigo: "DEMO-AGADM" }, select: { id: true } });
    const lotacao = await prisma.lotacao.findFirst({ where: { codigo: "DEMO-SEDUC" }, select: { id: true } });
    if (cargo === null || lotacao === null) throw new Error("A folha de demonstração de agosto não está no banco (cargo DEMO-AGADM, lotação DEMO-SEDUC): rode semear-folha-da-demonstracao antes.");
    const ref = { cargoId: cargo.id, lotacaoId: lotacao.id };
    await passo(`servidor ${SERVIDOR.matricula} (${SERVIDOR.salario})`, async () => {
      if ((await prisma.vinculo.findUnique({ where: { matricula: SERVIDOR.matricula } })) !== null) return "=";
      let pessoa = await m19.pessoas.buscarPorDocumento(SERVIDOR.cpf);
      if (pessoa === null) {
        await cadastrarPessoa({ documento: SERVIDOR.cpf, nome: SERVIDOR.nome, municipio: "Esperança", uf: "PB", criadoPor: AUTOR }, m19);
        pessoa = await m19.pessoas.buscarPorDocumento(SERVIDOR.cpf);
      }
      const pessoaId = (pessoa as { id: string }).id;
      const { servidorId } = await cadastrarServidor(prisma, { pessoaId, dataNascimento: D(SERVIDOR.nascimento), sexo: "FEMININO", criadoPor: AUTOR });
      await admitirServidor(prisma, { servidorId, matricula: SERVIDOR.matricula, tipo: "EFETIVO", regimeJuridico: "Estatutário", regimePrevidenciario: "RGPS", dataAdmissao: D("2026-09-01"), cargoId: ref.cargoId, lotacaoId: ref.lotacaoId, salarioBase: SERVIDOR.salario, criadoPor: AUTOR });
      return "+";
    });
    let folhaId = (await prisma.folhaDePagamento.findUnique({ where: { competencia_tipo: { competencia: COMPETENCIA, tipo: "MENSAL" } }, select: { id: true } }))?.id ?? "";
    await passo(`folha MENSAL ${COMPETENCIA}`, async () => {
      if (folhaId !== "") return "=";
      folhaId = (await abrirFolha(prisma, { competencia: COMPETENCIA, tipo: "MENSAL", criadoPor: AUTOR })).folhaId;
      return "+";
    });
    const situacao = () => prisma.folhaDePagamento.findUniqueOrThrow({ where: { id: folhaId }, select: { fechamento: { select: { calculoId: true } }, calculos: { where: { cancelamento: null }, select: { id: true } } } });
    await passo("cálculo", async () => {
      const f = await situacao();
      if (f.fechamento !== null || f.calculos.length > 0) return "=";
      await calcularFolha(prisma, { folhaId, motivo: "folha de setembro da demonstração (V26)", criadoPor: AUTOR });
      return "+";
    });
    await passo("fechamento", async () => {
      if ((await situacao()).fechamento !== null) return "=";
      await fecharFolha(prisma, { folhaId, criadoPor: AUTOR });
      return "+";
    });
    const calculoId = (await situacao()).fechamento?.calculoId as string;
    const ir = await prisma.linhaDoContracheque.findMany({ where: { contracheque: { calculoId }, rubrica: { natureza: "IMPOSTO_DE_RENDA" } }, select: { valor: true, contracheque: { select: { vinculo: { select: { matricula: true } } } } } });
    for (const l of ir) console.log(`    IR do contracheque ${l.contracheque.vinculo.matricula}: ${l.valor.toFixed(2)}`);
    await passo("apropriação (empenho do bruto)", async () => {
      const r = await apropriarFolha(prisma, { folhaId, dataDoEmpenho: D(DATA_DO_ATO), criadoPor: AUTOR });
      return r.empenhados > 0 ? "+" : "=";
    });
    await passo("certificação", async () => {
      if ((await prisma.certificacaoDaFolha.findFirst({ where: { folhaId, calculoId, tipo: "CERTIFICACAO" } })) !== null) return "=";
      await certificarFolha(prisma, { folhaId, data: D(DATA_DO_ATO), criadoPor: ATESTADOR });
      return "+";
    });
    await passo("liquidação", async () => {
      const r = await liquidarFolha(prisma, { folhaId, data: D(DATA_DO_ATO), criadoPor: LIQUIDANTE });
      return r.liquidadas > 0 ? "+" : "=";
    });
  } finally {
    await prisma.$disconnect();
  }
}

await main();
