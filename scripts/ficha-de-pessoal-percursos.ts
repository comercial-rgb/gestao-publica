import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { criarM02Deps } from "../modules/m02-planejamento/adapter-prisma.js";
import { criarFicha } from "../modules/m02-planejamento/servico.js";
import type { PrismaClient } from "../prisma/generated/client/client.js";

/**
 * A FICHA DE PESSOAL DO BANCO DE DEMONSTRAÇÃO — resolve `FICHA-DE-PESSOAL-NOS-PERCURSOS`.
 *
 * ⚠️ ISTO É SEED DE DEMONSTRAÇÃO, NÃO CAPACIDADE DO PRODUTO. O banco dos percursos nasceu com
 * fichas de 339039 (serviços de terceiros) e nenhuma de 319011 (vencimentos), e a dotação da que
 * existe é curta: a apropriação da folha parava por saldo no primeiro servidor, e sem empenho não
 * havia o que liquidar. Os percursos exercitavam o caminho INTERROMPIDO e nunca o completo.
 *
 * ⚠️ E ELE NÃO ESCREVE NO BANCO À MÃO. Usa o caso de uso `criarFicha` do M02 — a mesma
 * autorização, a mesma dotação inicial e a mesma perna no razão que qualquer ficha do ente. Uma
 * `fichaOrcamentaria.create` solta produziria a ficha órfã que o `garantirDotacaoInicial` recusa.
 *
 * ⚠️ POR QUE UM SEED E NÃO A TELA: `CRIAR_FICHA` existe no censo e NÃO tem superfície — o QDD é
 * só leitura. Criar ficha pela interface é lacuna do planejamento (P1), não desta unidade; a
 * pendência fica nomeada como `CRIAR-FICHA-SEM-TELA` e este seed não a esconde.
 *
 * ⚠️ E ELE VIVE EM `scripts/`, NÃO EM `prisma/seed/`: o grep-guard do M16 proíbe qualquer arquivo
 * de `prisma/seed/` de tocar na tabela de usuários — é por ali que um superusuário vazaria para um
 * banco de produção. Este script PRECISA garantir a identidade `LOA`, então ele não pode morar lá.
 *
 * Uso: `DATABASE_URL=<percursos> SEED_IDENTIDADE=admin@... npx tsx scripts/ficha-de-pessoal-percursos.ts`
 * Idempotente: ficha já existente é no-op.
 */

const POR = process.env["SEED_IDENTIDADE"] ?? "admin@cg.pb.gov.br";
const EXERCICIO = Number(process.env["SEED_EXERCICIO"] ?? "2026");

/** As duas naturezas da folha: vencimentos (o bruto do servidor) e obrigações patronais. */
const FICHAS = [
  { numero: 3101, naturezaDespesa: "319011", valorDotado: "5000000.00", oQue: "Vencimentos e Vantagens Fixas - Pessoal Civil" },
  { numero: 3102, naturezaDespesa: "319013", valorDotado: "1500000.00", oQue: "Obrigações Patronais" },
] as const;

async function main(): Promise<void> {
  const url = process.env["DATABASE_URL"];
  if (url === undefined || url === "") throw new Error("DATABASE_URL não definida.");
  const prisma = criarPrismaClient(url) as unknown as PrismaClient;
  try {
    // A classificação é a MESMA das fichas que já existem no banco de demonstração — trocá-la
    // criaria uma ficha numa unidade que o percurso não alcança.
    const modelo = await prisma.fichaOrcamentaria.findFirst({
      where: { exercicio: EXERCICIO },
      orderBy: { numero: "asc" },
      select: {
        exercicioFonte: true,
        orgao: { select: { codigo: true } }, unidadeOrc: { select: { codigo: true } },
        funcao: { select: { codigo: true } }, subfuncao: { select: { codigo: true } },
        programa: { select: { codigo: true } }, acao: { select: { codigo: true } },
        fonte: { select: { codigo: true } },
      },
    });
    if (modelo === null) throw new Error(`Não há ficha de ${EXERCICIO} para copiar a classificação. Este seed é do banco de demonstração.`);

    // ⚠️ A IDENTIDADE `LOA` — "quem dota é a LEI", diz o adapter do M02, e é ela que assina a
    // DOTAÇÃO_INICIAL no razão. O funil do M16 exige que TODO autor de fato exista e esteja ativo;
    // sem esta linha, nenhuma ficha nasce neste banco (e é exatamente por isso que a primeira
    // execução caiu com "USUÁRIO NÃO CADASTRADO: LOA" — comportamento certo).
    //
    // ⚠️ SEM CREDENCIAL, de propósito: é identidade de SISTEMA, não conta de pessoa. Ela não
    // entra pelo login — a `CredencialDeUsuario` é outra tabela, e nada aqui a cria.
    const loa = await prisma.usuario.findUnique({ where: { identificador: "LOA" }, select: { id: true, ativo: true } });
    if (loa === null) {
      await prisma.usuario.create({ data: { identificador: "LOA", nome: "Lei Orcamentaria Anual (identidade de sistema)", criadoPor: POR } });
      console.log('[ficha-pessoal] identidade de sistema "LOA" criada — sem credencial, não entra pelo login.');
    } else if (!loa.ativo) {
      throw new Error('A identidade "LOA" existe e está DESATIVADA. Nenhuma ficha nasce assim. Reative-a antes.');
    }

    const deps = criarM02Deps(prisma);
    for (const f of FICHAS) {
      const nd = await prisma.naturezaDespesa.findUnique({ where: { codigoCompleto: f.naturezaDespesa }, select: { id: true } });
      if (nd === null) {
        console.log(`[ficha-pessoal] natureza ${f.naturezaDespesa} não existe no plano — pulada.`);
        continue;
      }
      const ja = await prisma.fichaOrcamentaria.findFirst({ where: { exercicio: EXERCICIO, naturezaDespesaId: nd.id }, select: { numero: true, saldoDisponivel: true } });
      if (ja !== null) {
        console.log(`[ficha-pessoal] ${f.naturezaDespesa} já tem a ficha ${ja.numero} (disponível ${String(ja.saldoDisponivel)}) — no-op.`);
        continue;
      }
      const id = await criarFicha(
        {
          exercicio: EXERCICIO,
          numero: f.numero,
          exercicioFonte: modelo.exercicioFonte === 2 ? 2 : 1,
          valorDotado: f.valorDotado,
          criadoPor: POR,
          classificacao: {
            orgao: modelo.orgao.codigo, unidadeOrc: modelo.unidadeOrc.codigo,
            funcao: modelo.funcao.codigo, subfuncao: modelo.subfuncao.codigo,
            programa: modelo.programa.codigo, acao: modelo.acao.codigo,
            naturezaDespesa: f.naturezaDespesa, fonte: modelo.fonte.codigo,
          },
        },
        deps
      );
      console.log(`[ficha-pessoal] ficha ${f.numero} (${f.naturezaDespesa} — ${f.oQue}) CRIADA com ${f.valorDotado} dotado. id=${id}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
