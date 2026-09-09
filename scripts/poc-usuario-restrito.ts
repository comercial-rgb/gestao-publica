import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { criarUsuario, concederPerfil } from "../modules/m16-travamento/servico-usuarios.js";
import type { PrismaClient } from "../prisma/generated/client/client.js";

/**
 * POC — O USUÁRIO RESTRITO da demonstração de SEGREGAÇÃO (TR 4.55/4.56, 6.5).
 *
 * ⚠️ POR QUE ISTO MORA EM `scripts/` E NÃO EM `prisma/seed/`. O grep de segurança do M16
 * (m16-rollout t5) proíbe QUALQUER menção a perfil/usuário/permissão dentro de `prisma/seed/`,
 * e com razão: um seed re-executável capaz de carimbar identidades entrega a chave-mestra a quem
 * tiver o shell. Isto aqui não é seed de instalação — é preparação de DEMONSTRAÇÃO, roda uma vez,
 * à mão, e cria um usuário deliberadamente FRACO.
 *
 * ⚠️ PELO SERVIÇO REAL (`criarUsuario`), nunca por INSERT: o ato cobra a permissão CRIAR_USUARIO
 * do autor, valida a senha e fica na trilha de auditoria. É exatamente o que aconteceria se o
 * administrador o criasse pela tela — e é isso que a Comissão precisa ver como verdade.
 *
 * ═══ O QUE ESTE USUÁRIO PODE, E O QUE ELE NÃO PODE ═══
 * O perfil recebe UMA permissão, EMPENHAR, e ela é ESCOPADA à unidade 99001. Disso saem as três
 * demonstrações do passo de segregação, todas verificáveis ao vivo:
 *   · o que ele PODE: empenhar na SUA unidade;
 *   · o que ele NÃO PODE por AÇÃO: criar usuário (não tem CRIAR_USUARIO) — a recusa nomeia a ação;
 *   · o que ele NÃO PODE por ESCOPO: empenhar em OUTRA unidade — a recusa nomeia a UG.
 * Um perfil vazio provaria menos: "não pode nada" não distingue falta de permissão de falta de
 * escopo, e é a distinção que o TR 6.5 cobra.
 *
 * ⚠️ LIMITE CONHECIDO — E ELE PRECISA SER DITO NA APRESENTAÇÃO. A autorização deste sistema é
 * cobrada no ATO (o serviço chama `autorizar`), não na ROTA: o layout só exige SESSÃO. Portanto
 * este usuário CONSEGUE ABRIR /administracao e LER a lista de usuários — o que ele não consegue é
 * EXECUTAR. Quem apresentar deve demonstrar a recusa no BOTÃO, não esperar um bloqueio ao navegar.
 *
 * Uso:  npx tsx scripts/poc-usuario-restrito.ts
 *       (senha inicial via POC_SENHA_RESTRITO, ou a padrão de demonstração abaixo)
 */

const ADMIN = "admin@cg.pb.gov.br";
const IDENT = "operador.poc@cg.pb.gov.br";
const NOME_PERFIL = "OPERADOR RESTRITO — POC";
/** UG à qual a permissão é amarrada — a mesma da massa POC. */
const UG_AUTORIZADA = "99001";

async function main(): Promise<void> {
  const url = process.env["DATABASE_URL"];
  if (url === undefined || url === "") throw new Error("DATABASE_URL não definida (.env).");
  const senha = process.env["POC_SENHA_RESTRITO"] ?? "OperadorPOC#2026";

  const prisma = criarPrismaClient(url) as unknown as PrismaClient;
  try {
    const ja = await prisma.usuario.findUnique({ where: { identificador: IDENT }, select: { id: true } });
    if (ja !== null) {
      console.log(`[poc-usuario-restrito] ${IDENT} já existe — no-op. Senha inalterada.`);
      return;
    }

    // LIMPEZA DE ÓRFÃO: uma execução anterior que falhou DEPOIS do perfil e ANTES da permissão
    // deixa um perfil vazio com este nome. Removê-lo antes de recriar evita que a tela de perfis
    // acumule concessões fantasma a cada tentativa.
    const orfao = await prisma.perfil.findFirst({ where: { nome: NOME_PERFIL }, select: { id: true } });
    if (orfao !== null) {
      await prisma.$transaction(async (tx) => {
        await tx.permissaoDePerfil.deleteMany({ where: { perfilId: orfao.id } });
        await tx.perfil.delete({ where: { id: orfao.id } });
      });
      console.log(`[poc-usuario-restrito] perfil órfão "${NOME_PERFIL}" de execução anterior removido.`);
    }

    // A UG pelo CÓDIGO → id. A permissão guarda a CHAVE ESTRANGEIRA (`unidadeOrcId`), não o código:
    // o escopo aponta para a unidade que existe, e não para uma string que poderia não resolver.
    const ug = await prisma.unidadeOrcamentaria.findUniqueOrThrow({ where: { codigo: UG_AUTORIZADA }, select: { id: true } });

    // ⚠️ PERFIL E PERMISSÃO NA MESMA TRANSAÇÃO. Criá-los soltos deixa, na primeira falha, um perfil
    // ÓRFÃO — um perfil sem permissão nenhuma, que ninguém pediu e que a tela de perfis exibiria
    // como se fosse uma concessão real. Ou nascem os dois, ou não nasce nenhum.
    const perfil = await prisma.$transaction(async (tx) => {
      const p = await tx.perfil.create({
        data: {
          nome: NOME_PERFIL,
          descricao: `Perfil de demonstração: EMPENHAR apenas na unidade ${UG_AUTORIZADA}. Sem permissões de administração.`,
          criadoPor: ADMIN,
        },
        select: { id: true },
      });
      // `unidadeOrcId` preenchido = concessão LOCAL; deixá-lo nulo seria concessão GLOBAL, e a
      // demonstração de escopo (TR 6.5) perderia justamente o que ela existe para mostrar.
      await tx.permissaoDePerfil.create({
        data: { perfilId: p.id, acao: "EMPENHAR", unidadeOrcId: ug.id, criadoPor: ADMIN },
      });
      return p;
    });

    const { usuarioId } = await criarUsuario(prisma, {
      nome: "Operador Restrito - POC",
      email: IDENT,
      senhaInicial: senha,
      criadoPor: ADMIN,
    });
    await concederPerfil(prisma, { usuarioId, perfilId: perfil.id, criadoPor: ADMIN });

    console.log(
      `[poc-usuario-restrito] ${IDENT} CRIADO — perfil "${NOME_PERFIL}": 1 permissão (EMPENHAR na UG ${UG_AUTORIZADA}).\n` +
        `  senha inicial: ${senha}\n` +
        `  ⚠️ ele ABRE /administracao (a trava é no ATO, não na rota) — demonstre a recusa no BOTÃO.`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error("[poc-usuario-restrito] FALHOU:", e instanceof Error ? e.message : e);
  process.exit(1);
});
