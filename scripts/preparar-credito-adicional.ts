import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { criarUsuario, concederPerfil } from "../modules/m16-travamento/servico-usuarios.js";
import type { PrismaClient } from "../prisma/generated/client/client.js";

/**
 * A PREPARAÇÃO DO PERCURSO DO CRÉDITO ADICIONAL (V11 V7.2) — o que a TELA ainda não faz.
 *
 * ⚠️ E É CURTO DE PROPÓSITO. A LEI **não** entra aqui: ela passou a ter formulário na V7.2, e o
 * percurso a cadastra pela tela — semeá-la aqui esconderia justamente o que há de novo.
 *
 * O que sobra para este script são duas coisas que a tela não tem:
 *
 *   · a DISPONIBILIDADE DE RECURSO NOVO da fonte. Um crédito por excesso de arrecadação bate
 *     contra a disponibilidade DECLARADA (TR 4.37), e não há tela para declará-la — ela é
 *     apurada fora do sistema. A própria página nomeia isso como a próxima fatia.
 *   · um usuário deliberadamente FRACO, que LÊ o planejamento e não tem `CRIAR_LEI_DE_CREDITO`
 *     nem `CRIAR_DECRETO_DE_CREDITO`. É ele que demonstra a recusa — e a demonstração importa
 *     porque esta tela RENDERIZA o formulário para todo mundo: quem protege é o servidor, e é
 *     isso que o percurso tem de provar.
 *
 * ⚠️ RECUSA banco que não seja descartável, pelo mesmo padrão dos outros percursos.
 * Saída: uma linha `CREDITO {json}` com os identificadores.
 */

const ADMIN = process.env["SEED_IDENTIDADE"] ?? "admin@cg.pb.gov.br";
const SUF = process.env["CREDITO_SUFIXO"] ?? String(Date.now()).slice(-6);
const FRACO = "sem-credito-adicional@percursos.local";
const NOME_PERFIL_FRACO = `SO LE O PLANEJAMENTO — PERCURSO ${SUF}`;
const DESCARTAVEL = /^gestao_publica_(percursos|capturas|instalacao)_v7m[12]_[a-z0-9_]{1,40}$/;

/** O teto da lei e o valor do decreto — o decreto consome parte do teto, nunca ele todo. */
const TETO = "50000.00";
const SUPLEMENTACAO = "7500.00";

async function main(): Promise<void> {
  const url = process.env["DATABASE_URL"];
  if (url === undefined || url === "") throw new Error("DATABASE_URL não definida.");
  const senhaFraco = process.env["PERCURSOS_SENHA_PAPEIS"] ?? "Percurso#2026";
  const prisma = criarPrismaClient(url) as unknown as PrismaClient;

  try {
    const [{ banco }] = (await prisma.$queryRawUnsafe(`SELECT current_database() AS banco`)) as [{ banco: string }];
    if (!DESCARTAVEL.test(banco)) throw new Error(`"${banco}" não é banco descartável do percurso. Nada foi feito.`);

    const exercicio = await prisma.exercicio.findFirst({
      // ⚠️ "ABERTO" é a AUSÊNCIA do fato de encerramento, não uma coluna — é assim que o M08
      // modela a virada, e perguntar por coluna aqui teria dado erro de tipo, não silêncio.
      where: { encerramento: { is: null } },
      orderBy: { ano: "desc" },
      select: { ano: true },
    });
    if (exercicio === null) throw new Error("Nenhum exercício ABERTO neste banco. Nada foi feito.");

    // A ficha do cenário de aceite — a que o percurso vai suplementar. A fonte da perna é a
    // fonte DELA (o domínio recusa divergência), e é essa fonte que precisa de disponibilidade.
    const ficha = await prisma.fichaOrcamentaria.findFirst({
      where: { exercicio: exercicio.ano },
      orderBy: { numero: "asc" },
      select: {
        id: true, numero: true, fonteId: true,
        fonte: { select: { codigo: true } },
        unidadeOrc: { select: { codigo: true } },
      },
    });
    if (ficha === null) throw new Error(`Nenhuma ficha no exercício ${exercicio.ano}. Rode o cenário de aceite antes.`);

    // ── A DISPONIBILIDADE DECLARADA ──────────────────────────────────────────
    // ⚠️ UPSERT pela chave natural (exercício, fonte, origem): reexecutar o percurso não pode
    // criar uma segunda declaração da MESMA apuração — seriam dois lastros para o mesmo dinheiro.
    const disponibilidade = await prisma.disponibilidadeRecursoNovo.upsert({
      where: {
        exercicio_fonteId_origem: {
          exercicio: exercicio.ano,
          fonteId: ficha.fonteId,
          origem: "EXCESSO_ARRECADACAO",
        },
      },
      update: {},
      create: {
        exercicio: exercicio.ano,
        fonteId: ficha.fonteId,
        origem: "EXCESSO_ARRECADACAO",
        valor: "100000.00",
        descricao: `Excesso apurado para o percurso ${SUF} (sintético).`,
        criadoPor: ADMIN,
      },
      select: { id: true, valor: true },
    });

    // ── O USUÁRIO FRACO ──────────────────────────────────────────────────────
    const jaFraco = await prisma.usuario.findUnique({ where: { identificador: FRACO }, select: { id: true } });
    if (jaFraco === null) {
      const orfao = await prisma.perfil.findFirst({ where: { nome: NOME_PERFIL_FRACO }, select: { id: true } });
      if (orfao !== null) {
        await prisma.$transaction(async (tx) => {
          await tx.permissaoDePerfil.deleteMany({ where: { perfilId: orfao.id } });
          await tx.perfil.delete({ where: { id: orfao.id } });
        });
      }
      // ⚠️ PERFIL E PERMISSÃO NA MESMA TRANSAÇÃO: um perfil órfão apareceria na tela de perfis
      // como se fosse concessão real.
      const perfil = await prisma.$transaction(async (tx) => {
        const p = await tx.perfil.create({
          data: {
            nome: NOME_PERFIL_FRACO,
            descricao:
              "Perfil de demonstração: LÊ o planejamento e não tem nenhuma das ações de crédito adicional.",
            criadoPor: ADMIN,
          },
          select: { id: true },
        });
        await tx.permissaoDePerfil.create({ data: { perfilId: p.id, acao: "CONSULTAR_PLANEJAMENTO", criadoPor: ADMIN } });
        return p;
      });
      const criado = await criarUsuario(prisma as never, {
        nome: `Servidor sem as ações do crédito adicional (percurso ${SUF})`,
        email: FRACO,
        senhaInicial: senhaFraco,
        criadoPor: ADMIN,
      });
      await concederPerfil(prisma as never, { usuarioId: criado.usuarioId, perfilId: perfil.id, criadoPor: ADMIN });
    }

    console.log(
      `CREDITO ${JSON.stringify({
        sufixo: SUF,
        exercicio: exercicio.ano,
        fichaId: ficha.id,
        fichaNumero: ficha.numero,
        fonteCodigo: ficha.fonte.codigo,
        unidadeCodigo: ficha.unidadeOrc.codigo,
        disponibilidadeId: disponibilidade.id,
        disponibilidadeValor: disponibilidade.valor.toFixed(2),
        teto: TETO,
        suplementacao: SUPLEMENTACAO,
        usuarioFraco: FRACO,
      })}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
