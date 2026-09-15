import "dotenv/config";
import { diaCivil, inicioDoDiaCivil } from "../packages/datas/index.js";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { roteiroEmpenho } from "../modules/m01-core-contabil/roteiros.js";
import { empenhar } from "../modules/m05-despesa/servico.js";
import { criarM05DepsComContratos } from "../modules/m11-licitacoes/adapter-m05.js";
import { cadastrarContrato, cadastrarProcesso, homologarProcesso } from "../modules/m11-licitacoes/contratos.js";
import { cadastrarItemDoContrato, designarNoContrato } from "../modules/m11-licitacoes/fiscalizacao.js";
import { pessoaDoUsuario, vincularPessoaAoUsuario } from "../modules/m16-travamento/servico-pessoa-do-usuario.js";
import type { PrismaClient } from "../prisma/generated/client/client.js";

/**
 * A PREPARAÇÃO DO PERCURSO DA PONTE CONTRATUAL (V7 M2 U4) — o CONTEXTO de uma execução, num banco DESCARTÁVEL.
 *
 * Cria, pelos casos de uso do domínio e com a identidade do administrador, o que o percurso NÃO afirma fazer pela tela:
 *   processo homologado; contrato de serviços com dois itens (visita 10 × R$ 100,00; hora 20 × R$ 50,00); as contas de
 *   gestora, fiscal e recebedor com pessoa vinculada e designadas NESTE contrato; um empenho de R$ 1.100,00 do contrato
 *   numa ficha de serviços com crédito; o fornecedor (pessoa jurídica) do contrato.
 * O percurso faz pela tela: a ordem de serviço, a medição, os recebimentos e a decisão, a nota do fornecedor e a
 * conferência, a liquidação, os documentos, as negativas e a projeção pública.
 *
 * ⚠️ RECUSA banco que não seja descartável (`gestao_publica_<percursos|capturas|instalacao>_v7m1_*` ou `_v7m2_*`), e
 * cada execução usa o próprio sufixo — a repetição do cenário não depende de procurar data livre.
 * Saída: uma linha `PONTE {json}` com os identificadores para o percurso.
 */

const ADMIN = process.env["SEED_IDENTIDADE"] ?? "admin@cg.pb.gov.br";
const SUF = process.env["PONTE_SUFIXO"] ?? String(Date.now()).slice(-6);
const GESTORA = "gestora-contrato@percursos.local";
const FISCAL = "fiscal-contrato@percursos.local";
const RECEBEDOR = "recebedor-contrato@percursos.local";
const DESCARTAVEL = /^gestao_publica_(percursos|capturas|instalacao)_v7m[12]_[a-z0-9_]{1,40}$/;

function dv11(ds: readonly number[], pesos: readonly number[]): number {
  const r = ds.reduce((a, d, i) => a + d * (pesos[i] ?? 0), 0) % 11;
  return r < 2 ? 0 : 11 - r;
}
function cpf(semente: string): string {
  const base = `${semente}000000000`.slice(0, 9).split("").map(Number);
  const d1 = dv11(base, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv11([...base, d1], [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return [...base, d1, d2].join("");
}
function cnpj(semente: string): string {
  const base = `${semente}00000000`.slice(0, 8).split("").map(Number).concat([0, 0, 0, 1]);
  const d1 = dv11(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv11([...base, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return [...base, d1, d2].join("");
}

async function pessoaDaConta(prisma: PrismaClient, identificador: string, semente: string, nome: string): Promise<void> {
  if ((await pessoaDoUsuario(prisma, identificador)) !== null) return;
  const u = await prisma.usuario.findUnique({ where: { identificador }, select: { id: true } });
  if (u === null) throw new Error(`A conta ${identificador} não existe: rode percursos-usuarios-por-papel antes.`);
  const documento = cpf(semente);
  if ((await prisma.pessoa.findFirst({ where: { documento }, select: { id: true } })) === null) {
    await prisma.pessoa.create({ data: { documento, tipo: "FISICA", criadoPor: ADMIN, versoes: { create: { nome, criadoPor: ADMIN } } } });
  }
  await vincularPessoaAoUsuario(prisma, { usuarioId: u.id, documento, motivo: "Preparação do percurso da ponte contratual (sintético).", criadoPor: ADMIN });
}

async function main(): Promise<void> {
  const url = process.env["DATABASE_URL"];
  if (url === undefined || url === "") throw new Error("DATABASE_URL não definida.");
  const prisma = criarPrismaClient(url) as unknown as PrismaClient;
  try {
    const [{ banco }] = (await prisma.$queryRawUnsafe(`SELECT current_database() AS banco`)) as [{ banco: string }];
    if (!DESCARTAVEL.test(banco)) throw new Error(`"${banco}" não é banco descartável do percurso. Nada foi feito.`);
    const hoje = diaCivil(new Date());
    const dia = (d: number): Date => inicioDoDiaCivil(diaCivil(new Date(Date.now() + d * 86_400_000)));
    const ano = Number(hoje.slice(0, 4));

    const ficha = await prisma.fichaOrcamentaria.findFirst({
      where: { exercicio: ano, naturezaDespesa: { codElemento: "39" }, saldoDisponivel: { gte: "1100.00" } },
      orderBy: { saldoDisponivel: "desc" },
      select: { id: true, numero: true },
    });
    if (ficha === null) throw new Error(`Sem ficha de serviços (elemento 39) com R$ 1.100,00 disponíveis em ${ano}: o banco não tem a premissa. Nada foi feito.`);

    const doc = cnpj(`7${SUF}`);
    if ((await prisma.pessoa.findFirst({ where: { documento: doc }, select: { id: true } })) === null) {
      await prisma.pessoa.create({ data: { documento: doc, tipo: "JURIDICA", criadoPor: ADMIN, versoes: { create: { nome: `Serviços Técnicos Ponte ${SUF} (sintética)`, criadoPor: ADMIN } } } });
    }

    const { processoId } = await cadastrarProcesso(prisma, { numeroProcesso: `PONTE/${SUF}`, modalidade: "PREGAO_ELETRONICO", objeto: `Serviços técnicos de manutenção preventiva — percurso ${SUF}`, valorLicitado: "2000.00", criadoPor: ADMIN });
    await homologarProcesso(prisma, { processoId, data: dia(-70), criadoPor: ADMIN });
    const { contratoId } = await cadastrarContrato(prisma, { numeroContrato: `CT-PONTE-${SUF}`, processoId, contratadoDocumento: doc, contratadoNome: `Serviços Técnicos Ponte ${SUF} (sintética)`, valorInicial: "2000.00", vigenciaInicio: dia(-60), vigenciaFimInicial: dia(120), categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: ADMIN });
    await cadastrarItemDoContrato(prisma, { contratoId, descricao: `Visita técnica ${SUF}`, unidade: "visita", quantidade: "10", valorUnitario: "100", criadoPor: ADMIN });
    await cadastrarItemDoContrato(prisma, { contratoId, descricao: `Hora técnica ${SUF}`, unidade: "hora", quantidade: "20", valorUnitario: "50", criadoPor: ADMIN });

    await pessoaDaConta(prisma, GESTORA, `3${SUF}`, `Gabriela Gestora Ponte ${SUF}`);
    await pessoaDaConta(prisma, FISCAL, `4${SUF}`, `Fábio Fiscal Ponte ${SUF}`);
    await pessoaDaConta(prisma, RECEBEDOR, `5${SUF}`, `Regina Recebedora Ponte ${SUF}`);
    await designarNoContrato(prisma, { contratoId, papel: "GESTOR", usuarioIdentificador: GESTORA, atoDesignacao: `Portaria ${SUF}-G/${ano}`, vigenciaInicio: diaCivil(dia(-30)), criadoPor: ADMIN });
    await designarNoContrato(prisma, { contratoId, papel: "FISCAL", usuarioIdentificador: FISCAL, atoDesignacao: `Portaria ${SUF}-F/${ano}`, vigenciaInicio: diaCivil(dia(-30)), criadoPor: ADMIN });
    await designarNoContrato(prisma, { contratoId, papel: "RECEBEDOR_DEFINITIVO", usuarioIdentificador: RECEBEDOR, atoDesignacao: `Portaria ${SUF}-R/${ano}`, vigenciaInicio: diaCivil(dia(-30)), criadoPor: ADMIN });

    const { empenhoId } = await empenhar(
      { fichaId: ficha.id, numero: `${ano}NE-PONTE-${SUF}`, tipo: "GLOBAL", valor: "1100.00", data: dia(-25), credorCpfCnpj: doc, historico: `Serviços técnicos do contrato CT-PONTE-${SUF} (percurso sintético)`, categoriaOrdemCronologica: "PRESTACAO_SERVICOS", contratoId, criadoPor: ADMIN },
      roteiroEmpenho(),
      criarM05DepsComContratos(prisma)
    );
    const empenho = await prisma.empenho.findUniqueOrThrow({ where: { id: empenhoId }, select: { numero: true } });
    console.log(`PONTE ${JSON.stringify({ sufixo: SUF, contratoId, contrato: `CT-PONTE-${SUF}`, cnpj: doc, empenho: empenho.numero, ficha: ficha.numero })}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
