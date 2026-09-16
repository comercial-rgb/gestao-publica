import "dotenv/config";
import { createHash } from "node:crypto";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { criarUsuario, concederPerfil } from "../modules/m16-travamento/servico-usuarios.js";
import {
  cadastrarServicoDaCarta,
  cadastrarVersaoDoServico,
  publicarVersaoDoServico,
  registrarManifestacaoAnonima,
} from "../modules/m21-protocolo/servico.js";
import type { PrismaClient } from "../prisma/generated/client/client.js";
import type { AcaoDoSistema } from "../modules/m16-travamento/acoes.js";

/**
 * A FIXTURE DO PERCURSO DO ENCAMINHAMENTO DA OUVIDORIA (V9 N3) — no próprio script.
 *
 * ⚠️ ELA MORA AQUI, E NÃO NO BANCO DOS PERCURSOS EM GERAL, pela mesma razão da obra do percurso
 * da medição: é um cenário de UM percurso, com dois setores e duas pessoas que só existem para
 * provar quem alcança o quê. Espalhá-lo pela semente comum faria todo outro percurso carregar
 * uma ouvidoria que ele não usa — e, pior, faria a asserção "o terceiro setor não alcança"
 * depender de o resto do banco não ter mudado.
 *
 * ⚠️ IDEMPOTENTE. Rodar duas vezes não duplica setor, serviço nem usuário; só a manifestação é
 * criada a cada execução (são atos, e um ato não se reaproveita).
 *
 * Uso: `DATABASE_URL=<percursos> npx tsx scripts/preparar-ouvidoria-percursos.ts`
 */

const ADMIN = process.env["SEED_IDENTIDADE"] ?? "admin@cg.pb.gov.br";
const SENHA = process.env["PERCURSOS_SENHA_PAPEIS"] ?? "Percurso#2026";

export const OUVIDOR = "ouvidor@percursos.local";
export const SAUDE = "saude@percursos.local";
export const OBRAS_ALHEIO = "obras-alheio@percursos.local";

const ACOES: readonly AcaoDoSistema[] = [
  "CONSULTAR_PROTOCOLO",
  "TRIAR_MANIFESTACAO_DE_OUVIDORIA",
  "TRAMITAR_PROCESSO",
  "RECEBER_PROCESSO",
];

const url = process.env["DATABASE_URL"];
if (url === undefined || url === "") throw new Error("DATABASE_URL não definida.");
const prisma = criarPrismaClient(url) as unknown as PrismaClient;

async function setor(codigo: string, nome: string, unidadeOrcId: string): Promise<string> {
  const ja = await prisma.setor.findFirst({ where: { codigo }, select: { id: true } });
  if (ja !== null) return ja.id;
  return (await prisma.setor.create({ data: { codigo, nome, unidadeOrcId, criadoPor: ADMIN }, select: { id: true } })).id;
}

async function usuario(identificador: string, nome: string, setorId: string): Promise<void> {
  let u = await prisma.usuario.findUnique({ where: { identificador }, select: { id: true } });
  if (u === null) {
    const { usuarioId } = await criarUsuario(prisma, { nome, email: identificador, senhaInicial: SENHA, criadoPor: ADMIN });
    u = { id: usuarioId };
    const perfil = await prisma.$transaction(async (tx) => {
      const p = await tx.perfil.create({ data: { nome: `OUVIDORIA — ${identificador}`, descricao: "Percurso do encaminhamento da ouvidoria.", criadoPor: ADMIN }, select: { id: true } });
      await tx.permissaoDePerfil.createMany({ data: ACOES.map((acao) => ({ perfilId: p.id, acao, unidadeOrcId: null, criadoPor: ADMIN })) });
      return p;
    });
    await concederPerfil(prisma, { usuarioId: u.id, perfilId: perfil.id, criadoPor: ADMIN });
  }
  const lotado = await prisma.usuarioDoSetor.findUnique({ where: { usuarioIdent_setorId: { usuarioIdent: identificador, setorId } }, select: { id: true } });
  if (lotado === null) await prisma.usuarioDoSetor.create({ data: { usuarioIdent: identificador, setorId, criadoPor: ADMIN } });
}

try {
  const uo = await prisma.unidadeOrcamentaria.findFirstOrThrow({ select: { id: true }, orderBy: { codigo: "asc" } });
  const sOuv = await setor("OUV", "Ouvidoria", uo.id);
  const sSaude = await setor("SAU", "Secretaria de Saúde", uo.id);
  const sObras = await setor("OBR", "Secretaria de Obras", uo.id);

  // ⚠️ AS TRÊS PESSOAS TÊM AS MESMAS AÇÕES. O que as separa é a LOTAÇÃO — é isso que o percurso
  // prova: sem lotação no setor onde a manifestação está, a ação no ente não abre caso sigiloso.
  await usuario(OUVIDOR, "Ouvidor (percurso)", sOuv);
  await usuario(SAUDE, "Servidora da Saúde (percurso)", sSaude);
  await usuario(OBRAS_ALHEIO, "Servidor de Obras (percurso)", sObras);

  let assunto = await prisma.assunto.findFirst({ where: { codigo: "OUV" }, select: { id: true } });
  if (assunto === null) {
    assunto = await prisma.assunto.create({
      data: {
        codigo: "OUV", nome: "Ouvidoria", permiteAnonimo: true, sigiloPadrao: true, criadoPor: ADMIN,
        // O prazo vem da ETAPA do roteiro e conta do RECEBIMENTO — nunca cravado no encaminhamento.
        roteiro: { create: [{ ordem: 1, setorId: sOuv, prazoDias: 30, descricao: "Triagem da ouvidoria", criadoPor: ADMIN }] },
      },
      select: { id: true },
    });
  }

  const slug = "ouvidoria-percurso";
  const ja = await prisma.servicoDaCarta.findFirst({ where: { slug }, select: { id: true } });
  if (ja === null) {
    const { servicoId } = await cadastrarServicoDaCarta(prisma, { slug, titulo: "Ouvidoria", categoria: "Atendimento", publico: "CIDADAO", tipo: "MANIFESTACAO_ANONIMA", assuntoId: assunto.id, criadoPor: ADMIN });
    const { versaoId } = await cadastrarVersaoDoServico(prisma, {
      servicoId, descricao: "Registre reclamação, denúncia, sugestão ou elogio, sem se identificar.", requisitos: "Nenhum.",
      documentos: [], canais: "Internet.", exigeAutenticacao: false, setorDeEntradaId: sOuv,
      campos: [{ nome: "relato", rotulo: "Relato", tipo: "textoLongo", obrigatorio: true }], criadoPor: ADMIN,
    });
    await publicarVersaoDoServico(prisma, { versaoId, criadoPor: ADMIN });
  }

  const m = await registrarManifestacaoAnonima(prisma, {
    slug, tipo: "DENUNCIA",
    respostas: { relato: "Fila de três horas na unidade básica do bairro, todas as manhãs desta semana." },
    // A chave de quota é um sha256 (o domínio exige o formato): aqui ela é sintética e única por
    // execução, para que preparar o percurso duas vezes não esbarre na quota por origem.
    chaveDeQuota: createHash("sha256").update(`percurso-ouvidoria-${Date.now()}-${Math.random()}`).digest("hex"),
  });

  // ⚠️ O SEGREDO VAI PARA O `stdout` PORQUE ESTE É UM BANCO DE PERCURSO, com dado sintético, e
  // o percurso precisa dele para provar que o anônimo continua acompanhando depois do
  // encaminhamento. Ele NÃO é gravado em lugar nenhum — nem aqui, nem no banco (só o sha256).
  console.log(JSON.stringify({ protocolo: m.protocolo, segredo: m.segredo, setores: { ouvidoria: sOuv, saude: sSaude, obras: sObras } }));
} finally {
  await prisma.$disconnect();
}
