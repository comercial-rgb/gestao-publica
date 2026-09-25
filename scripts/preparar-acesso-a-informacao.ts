import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { publicarConfiguracaoDoAcesso } from "../modules/m21-protocolo/servico-acesso-a-informacao.js";
import { criarUsuario, concederPerfil } from "../modules/m16-travamento/servico-usuarios.js";
import type { PrismaClient } from "../prisma/generated/client/client.js";
import { PADRAO_DE_BANCO_DESCARTAVEL } from "./nome-de-banco-descartavel.js";

/**
 * A PREPARAÇÃO DO PERCURSO DO ACESSO À INFORMAÇÃO (V11 V5.3) — o CONTEXTO, num banco DESCARTÁVEL.
 *
 * Cria o que o percurso NÃO afirma fazer pela tela:
 *   · o assunto do pedido de acesso, com o setor de entrada e o setor que responde;
 *   · a CONFIGURAÇÃO publicada pelo serviço real (nunca por INSERT) — é dela que sai o prazo;
 *   · um usuário deliberadamente FRACO, que LÊ o protocolo e não tem nenhuma das cinco ações do
 *     rito. É ele que demonstra a recusa: a tela não oferece o formulário, e o servidor recusa
 *     nomeando a ação se alguém enviar mesmo assim.
 *
 * O percurso faz pela tela: protocolar, encaminhar, receber, prorrogar, prévia, resposta
 * entregue, recurso, decisão, a repetição que não duplica e a consulta do cidadão.
 *
 * ⚠️ RECUSA banco que não seja descartável, pelo mesmo padrão dos outros percursos.
 * Saída: uma linha `ACESSO {json}` com os identificadores.
 */

const ADMIN = process.env["SEED_IDENTIDADE"] ?? "admin@cg.pb.gov.br";
const SUF = process.env["ACESSO_SUFIXO"] ?? String(Date.now()).slice(-6);
const FRACO = "sem-acesso-a-informacao@percursos.local";
const NOME_PERFIL_FRACO = `SO LE O PROTOCOLO — PERCURSO ${SUF}`;
const DESCARTAVEL = PADRAO_DE_BANCO_DESCARTAVEL;

async function main(): Promise<void> {
  const url = process.env["DATABASE_URL"];
  if (url === undefined || url === "") throw new Error("DATABASE_URL não definida.");
  const senhaFraco = process.env["PERCURSOS_SENHA_PAPEIS"] ?? "Percurso#2026";
  const prisma = criarPrismaClient(url) as unknown as PrismaClient;

  try {
    const [{ banco }] = (await prisma.$queryRawUnsafe(`SELECT current_database() AS banco`)) as [{ banco: string }];
    if (!DESCARTAVEL.test(banco)) throw new Error(`"${banco}" não é banco descartável do percurso. Nada foi feito.`);

    const ano = new Date().getFullYear();
    const exercicio = await prisma.exercicio.findUnique({ where: { ano }, select: { id: true } });
    if (exercicio === null) throw new Error(`Exercício ${ano} não cadastrado neste banco. Nada foi feito.`);

    // ── O ASSUNTO e os dois setores ──────────────────────────────────────────
    const assunto = await prisma.assunto.upsert({
      where: { codigo: "LAI" },
      update: {},
      create: {
        codigo: "LAI",
        nome: "Pedido de acesso à informação",
        permiteAnonimo: true,
        textoOrientacao: "Descreva a informação que você quer. O prazo segue a norma publicada pelo ente.",
        criadoPor: ADMIN,
      },
      select: { id: true, nome: true },
    });

    const uo = await prisma.unidadeOrcamentaria.findFirst({ orderBy: { codigo: "asc" }, select: { id: true } });
    if (uo === null) throw new Error("Nenhuma unidade orçamentária neste banco. Nada foi feito.");

    const entrada = await prisma.setor.upsert({
      where: { codigo: "SIC" },
      update: { ativo: true },
      create: { codigo: "SIC", nome: "Serviço de Informação ao Cidadão", unidadeOrcId: uo.id, criadoPor: ADMIN },
      select: { id: true, codigo: true, nome: true },
    });
    const responde = await prisma.setor.upsert({
      where: { codigo: "SICOBR" },
      update: { ativo: true },
      create: { codigo: "SICOBR", nome: "Obras — informação ao cidadão", unidadeOrcId: uo.id, criadoPor: ADMIN },
      select: { id: true, codigo: true, nome: true },
    });

    // O administrador precisa estar lotado nos dois: ele protocola na entrada e recebe no destino.
    for (const setorId of [entrada.id, responde.id]) {
      const ja = await prisma.usuarioDoSetor.findFirst({ where: { usuarioIdent: ADMIN, setorId }, select: { id: true } });
      if (ja === null) await prisma.usuarioDoSetor.create({ data: { usuarioIdent: ADMIN, setorId, criadoPor: ADMIN } });
    }

    // ── A CONFIGURAÇÃO, pelo SERVIÇO REAL ────────────────────────────────────
    // ⚠️ NUNCA POR INSERT. O serviço é quem versiona, recusa vigência retroativa e cobra a
    // citação da norma. Um INSERT aqui semearia uma configuração que a tela não conseguiria
    // ter produzido — e o percurso passaria a demonstrar um estado impossível.
    const versoes = await prisma.versaoDaConfiguracaoDoAcessoAInformacao.count();
    if (versoes === 0) {
      await publicarConfiguracaoDoAcesso(prisma as never, {
        vigenciaInicio: `${ano}-01-01`,
        prazoDeRespostaEmDias: 20,
        prazoDeProrrogacaoEmDias: 10,
        prorrogacoesPermitidas: 1,
        instanciasDeRecurso: 2,
        prazoDeRecursoEmDias: 10,
        normaFederal: "Lei federal de acesso à informação — prazo de resposta e prorrogação motivada",
        normaFederalPublicadaEm: "2011-11-18",
        regulamentacaoLocal: null,
        regulamentacaoLocalPublicadaEm: null,
        observacao: `Configuração do percurso ${SUF} (sintética).`,
        criadoPor: ADMIN,
      });
    }

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
              "Perfil de demonstração: LÊ o protocolo e não tem nenhuma das ações do rito do acesso à informação.",
            criadoPor: ADMIN,
          },
          select: { id: true },
        });
        await tx.permissaoDePerfil.create({ data: { perfilId: p.id, acao: "CONSULTAR_PROTOCOLO", criadoPor: ADMIN } });
        return p;
      });
      const criado = await criarUsuario(prisma as never, {
        nome: `Servidor sem as ações do acesso (percurso ${SUF})`,
        email: FRACO,
        senhaInicial: senhaFraco,
        criadoPor: ADMIN,
      });
      await concederPerfil(prisma as never, { usuarioId: criado.usuarioId, perfilId: perfil.id, criadoPor: ADMIN });
      const lotado = await prisma.usuarioDoSetor.findFirst({ where: { usuarioIdent: FRACO, setorId: entrada.id }, select: { id: true } });
      if (lotado === null) {
        await prisma.usuarioDoSetor.create({ data: { usuarioIdent: FRACO, setorId: entrada.id, criadoPor: ADMIN } });
      }
    }

    console.log(
      `ACESSO ${JSON.stringify({
        sufixo: SUF,
        exercicio: ano,
        assuntoId: assunto.id,
        assuntoRotulo: `LAI — ${assunto.nome}`,
        setorEntradaId: entrada.id,
        setorEntradaRotulo: `${entrada.codigo} — ${entrada.nome}`,
        setorDestinoId: responde.id,
        setorDestinoRotulo: `${responde.codigo} — ${responde.nome}`,
        usuarioFraco: FRACO,
      })}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
