import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { criarUsuario, concederPerfil } from "../modules/m16-travamento/servico-usuarios.js";
import { cadastrarServicoDaCarta, cadastrarVersaoDoServico, publicarVersaoDoServico } from "../modules/m21-protocolo/servico.js";
import { diaCivil } from "../packages/datas/index.js";
import type { PrismaClient } from "../prisma/generated/client/client.js";

/**
 * A PREPARAÇÃO DO PERCURSO DO GUICHÊ (V11 V8) — o que a TELA do guichê não faz.
 *
 * ⚠️ E ELE É CURTO DE PROPÓSITO. Unidade, guichê, o que o guichê atende, a oferta de horários, o
 * feriado e a marcação entram TODOS pela tela — é exatamente isso que o percurso existe para
 * provar. Semear qualquer um deles esconderia o que há de novo.
 *
 * O que sobra aqui é o que pertence a outros módulos e que a agenda apenas CONSOME:
 *
 *   · um SERVIÇO DA CARTA publicado (M21) — é o que o guichê vai atender;
 *   · uma PESSOA no cadastro (M19) — é quem vai ser atendido. A marcação a resolve pelo
 *     documento e RECUSA se não existir: uma pessoa criada a partir de um agendamento entraria
 *     sem nome, sem endereço e sem quem responde por ela;
 *   · um usuário deliberadamente FRACO, que LÊ o protocolo e não tem nenhuma das três ações do
 *     guichê. É ele que demonstra a recusa — e a demonstração importa porque estas telas
 *     RENDERIZAM o formulário para todo mundo: quem protege é o servidor.
 *
 * ⚠️ RECUSA banco que não seja descartável, pelo mesmo padrão dos outros percursos.
 * Saída: uma linha `GUICHE {json}` com os identificadores.
 */

const ADMIN = process.env["SEED_IDENTIDADE"] ?? "admin@cg.pb.gov.br";
const SUF = process.env["GUICHE_SUFIXO"] ?? String(Date.now()).slice(-6);
const FRACO = "sem-guiche@percursos.local";
const NOME_PERFIL_FRACO = `SO LE O PROTOCOLO — PERCURSO ${SUF}`;
const DESCARTAVEL = /^gestao_publica_(percursos|capturas|instalacao)_v7m[12]_[a-z0-9_]{1,40}$/;

/** CPF sintético VÁLIDO no dígito verificador — o cadastro de pessoas recusa o que não fecha. */
const CPF = "11144477735";
const NOME_DA_PESSOA = "Ana Cidada do Percurso";

/**
 * A PRÓXIMA SEGUNDA-FEIRA, em dia civil do ente.
 *
 * ⚠️ O PERCURSO NÃO PODE MARCAR "HOJE": a oferta é publicada por DIA DA SEMANA, e um percurso
 * que rodasse num sábado não encontraria horário nenhum e acusaria a tela de um defeito que não
 * existe. Ele publica a oferta de SEGUNDA e marca na segunda seguinte — sempre um dia futuro,
 * sempre o mesmo dia da semana.
 */
function somarDias(dia: string, n: number): string {
  const [a, m, d] = dia.split("-").map(Number) as [number, number, number];
  const x = new Date(Date.UTC(a, m - 1, d) + n * 86_400_000);
  const p = (v: number): string => String(v).padStart(2, "0");
  return `${x.getUTCFullYear()}-${p(x.getUTCMonth() + 1)}-${p(x.getUTCDate())}`;
}

function proximaSegunda(): string {
  const hoje = diaCivil(new Date());
  const [a, m, d] = hoje.split("-").map(Number) as [number, number, number];
  // Aritmética de calendário em UTC puro: aqui não há fuso, só contagem de dias.
  const base = Date.UTC(a, m - 1, d);
  const semana = new Date(base).getUTCDay();
  const faltam = semana === 1 ? 7 : (8 - semana) % 7 || 7;
  const alvo = new Date(base + faltam * 86_400_000);
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${alvo.getUTCFullYear()}-${p(alvo.getUTCMonth() + 1)}-${p(alvo.getUTCDate())}`;
}

async function main(): Promise<void> {
  const url = process.env["DATABASE_URL"];
  if (url === undefined || url === "") throw new Error("DATABASE_URL não definida.");
  const senhaFraco = process.env["PERCURSOS_SENHA_PAPEIS"] ?? "Percurso#2026";
  const prisma = criarPrismaClient(url) as unknown as PrismaClient;

  try {
    const [{ banco }] = (await prisma.$queryRawUnsafe(`SELECT current_database() AS banco`)) as [{ banco: string }];
    if (!DESCARTAVEL.test(banco)) throw new Error(`"${banco}" não é banco descartável do percurso. Nada foi feito.`);

    const setor = await prisma.setor.findFirst({ orderBy: { codigo: "asc" }, select: { id: true, codigo: true, nome: true } });
    if (setor === null) throw new Error("Nenhum setor neste banco. Rode os seeds do protocolo antes.");

    const assunto = await prisma.assunto.findFirst({ orderBy: { codigo: "asc" }, select: { id: true } });
    if (assunto === null) throw new Error("Nenhum assunto neste banco. Rode os seeds do protocolo antes.");

    // ── O SERVIÇO DA CARTA ───────────────────────────────────────────────────
    const slug = `atendimento-presencial-${SUF}`;
    const titulo = `Segunda via de IPTU (percurso ${SUF})`;
    const { servicoId } = await cadastrarServicoDaCarta(prisma, {
      slug, titulo, categoria: "Tributos", publico: "CIDADAO",
      tipo: "REQUERIMENTO_ADMINISTRATIVO", assuntoId: assunto.id, criadoPor: ADMIN,
    });
    const { versaoId } = await cadastrarVersaoDoServico(prisma, {
      servicoId,
      descricao: "Emissao da segunda via do carne do IPTU do exercicio corrente.",
      requisitos: "Documento de identificacao com foto e a inscricao do imovel.",
      documentos: ["Documento de identidade"],
      canais: "Presencialmente, no guiche de atendimento.",
      prazoDias: 5,
      fundamentoDoPrazo: "Lei municipal de processo administrativo, art. 10",
      // ⚠️ TRUE, E NÃO É DETALHE: o M21 RECUSA um REQUERIMENTO_ADMINISTRATIVO sem autenticação —
      // ele protocola em nome de uma pessoa do cadastro, e isso exige entrar. A leitura da carta
      // continua pública. Medido ao escrever este script.
      exigeAutenticacao: true,
      setorDeEntradaId: setor.id,
      campos: [{ nome: "inscricao", rotulo: "Inscricao do imovel", tipo: "texto", obrigatorio: true }],
      criadoPor: ADMIN,
    });
    await publicarVersaoDoServico(prisma, { versaoId, criadoPor: ADMIN });

    // ── A PESSOA QUE VAI SER ATENDIDA ────────────────────────────────────────
    const jaPessoa = await prisma.pessoa.findUnique({ where: { documento: CPF }, select: { id: true } });
    if (jaPessoa === null) {
      await prisma.pessoa.create({
        data: {
          documento: CPF, tipo: "FISICA", criadoPor: ADMIN,
          versoes: { create: { nome: NOME_DA_PESSOA, criadoPor: ADMIN } },
        },
      });
    }

    // ── A QUOTA DO PORTAL, ZERADA PARA ESTA CORRIDA ──────────────────────────
    // ⚠️ E ISSO NÃO É AFROUXAR A DEFESA. A quota por origem protege o ente de uma enxurrada
    // vinda da internet; ela não foi pensada para uma máquina que roda o percurso três vezes em
    // dez minutos, sempre do mesmo `localhost`. Bloqueado por ela, o percurso acusaria a tela de
    // um defeito que não existe.
    //
    // ⚠️ E ELA CONTINUA PROVADA: `m21-guiche-portal.test.ts` t7 afirma que a quota barra a
    // enxurrada e que outra origem não é afetada, contra o Postgres, com a mutação que a desliga
    // derrubando o teste. O que se apaga aqui é o RASTRO das corridas anteriores, num banco
    // descartável — não a regra.
    const limpos = await prisma.envioPublicoSemConta.deleteMany({ where: { finalidade: "AGENDAMENTO" } });
    if (limpos.count > 0) console.log(`[preparar-guiche] quota do portal zerada: ${limpos.count} envio(s) de corridas anteriores.`);

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
      const perfil = await prisma.$transaction(async (tx) => {
        const p = await tx.perfil.create({
          data: {
            nome: NOME_PERFIL_FRACO,
            descricao: "Perfil de demonstracao: LE o protocolo e nao tem nenhuma das tres acoes do guiche.",
            criadoPor: ADMIN,
          },
          select: { id: true },
        });
        await tx.permissaoDePerfil.create({ data: { perfilId: p.id, acao: "CONSULTAR_PROTOCOLO", criadoPor: ADMIN } });
        return p;
      });
      const criado = await criarUsuario(prisma as never, {
        nome: `Servidor sem as acoes do guiche (percurso ${SUF})`,
        email: FRACO,
        senhaInicial: senhaFraco,
        criadoPor: ADMIN,
      });
      await concederPerfil(prisma as never, { usuarioId: criado.usuarioId, perfilId: perfil.id, criadoPor: ADMIN });
    }

    console.log(
      `GUICHE ${JSON.stringify({
        sufixo: SUF,
        setorCodigo: setor.codigo,
        setorNome: setor.nome,
        servicoId,
        servicoTitulo: titulo,
        documento: CPF,
        nomeDaPessoa: NOME_DA_PESSOA,
        segunda: proximaSegunda(),
        // ⚠️ A SEGUNDA SEGUINTE existe porque o percurso FECHA a primeira (feriado) antes de
        // chegar ao portal do cidadão. E ela prova, de graça, que a oferta publicada vale em
        // TODA segunda dentro da vigência, e não só naquela em que foi cadastrada.
        segundaSeguinte: somarDias(proximaSegunda(), 7),
        usuarioFraco: FRACO,
      })}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

await main();
