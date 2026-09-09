import "dotenv/config";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import { definirSenha } from "../../modules/m16-travamento/autenticacao.js";
import { COMPRIMENTO_MINIMO_DA_SENHA } from "../../modules/m16-travamento/credenciais.js";
import { TODAS_AS_ACOES } from "../../modules/m16-travamento/acoes.js";

/**
 * BOOTSTRAP DE PRIMEIRO ACESSO — o ovo e a galinha da borda autenticada.
 *
 * ═══ ⚠️ ESTE ARQUIVO É A ÚNICA EXCEÇÃO DO t5, E ELE SABE DISSO ═══
 * `m16-rollout.test.ts` (t5) varre `prisma/seed/` e proíbe qualquer menção a perfil,
 * usuário ou permissão. A razão é boa e continua valendo:
 *
 *   > um seed que carimba um superusuário no banco de produção entrega a chave-mestra
 *   > a quem rodar `npm run seed`.
 *
 * A 7.2 tentou nascer aqui e foi barrada — corretamente. O que mudou não foi o guard
 * ficar mais frouxo: foi a distinção entre as duas coisas que estavam no mesmo balaio.
 *
 *   SEED      = rotina RE-EXECUTÁVEL. Roda no deploy, roda de novo, roda sempre.
 *   BOOTSTRAP = ato ÚNICO de instalação. Roda uma vez na vida do banco, ou nenhuma.
 *
 * O t5 estava certo sobre o primeiro e MUDO sobre o segundo — e alguém sempre terá de
 * criar o primeiro usuário, senão a UI (que vive inteira atrás de `exigirSessao()`)
 * fica atrás de uma porta cuja chave não existe.
 *
 * ═══ ⚠️ A CONDIÇÃO QUE MATA O VETOR: `count(Usuario) > 0` ⇒ ABORTA ═══
 * É ela que faz a exceção ser mais DURA que a regra, e não um buraco nela. O medo do
 * t5 é "alguém roda o seed num banco de produção e ganha a chave-mestra". Aqui, num
 * banco povoado, este script é INERTE: ele não cria, não atualiza, não reseta senha —
 * ele **falha**. O vetor deixa de existir; não é mitigado, é impossível.
 *
 * ⚠️ E POR ISSO ELE **NÃO É IDEMPOTENTE**, de propósito. Idempotência é a propriedade
 * certa para um seed (rodar de novo não muda nada) e a ERRADA para um bootstrap: um
 * bootstrap idempotente num banco com usuários passaria em SILÊNCIO, e o silêncio é
 * exatamente o que esconderia a tentativa. Segunda execução FALHA, nomeando.
 *
 * ⚠️ ZERO IMPORT DE `test/`. O perfil onipotente das fixtures (o de `usuarios-teste`)
 * é ferramenta de teste e continua lá. Este script cria o PRÓPRIO perfil, com outro
 * nome, a partir do censo — e o t5b confere que ele não importou nada de fixture.
 */

const IDENT_ADMIN = "admin@cg.pb.gov.br";
/** ⚠️ NÃO é o `ADMIN` das fixtures — este nasce aqui, do censo. */
const NOME_PERFIL = "ADMINISTRADOR";

export interface ResultadoBootstrap {
  readonly usuarioId: string;
  readonly perfilId: string;
  readonly identificador: string;
  readonly permissoesConcedidas: number;
}

/**
 * Lê e valida a senha do ambiente. Fail-hard, nomeando o que falta.
 *
 * ⚠️ O MÍNIMO VEM DO DOMÍNIO (`COMPRIMENTO_MINIMO_DA_SENHA`), não de um `12` digitado
 * aqui: dois números iguais em lugares diferentes são um número que vai divergir.
 */
export function exigirSenhaDoAmbiente(
  env: NodeJS.ProcessEnv = process.env
): string {
  const senha = env["SEED_ADMIN_SENHA"];

  if (senha === undefined || senha === "") {
    throw new Error(
      `SEED_ADMIN_SENHA ausente — o bootstrap NÃO cria usuário sem ela, e não existe ` +
        `senha padrão neste código de propósito: uma senha default nasceria igual em ` +
        `toda instalação e ficaria versionada, pública, para sempre. Defina a variável ` +
        `(ao menos ${COMPRIMENTO_MINIMO_DA_SENHA} caracteres) e rode de novo. Nada foi gravado.`
    );
  }

  if (senha.length < COMPRIMENTO_MINIMO_DA_SENHA) {
    throw new Error(
      `SEED_ADMIN_SENHA curta demais: ${senha.length} caractere(s), e o mínimo é ` +
        `${COMPRIMENTO_MINIMO_DA_SENHA} — o mesmo que o domínio cobra de qualquer senha. ` +
        `O que protege uma senha é o COMPRIMENTO: uma frase longa vale mais do que um ` +
        `"Senha@123". Nada foi gravado.`
    );
  }

  return senha;
}

/**
 * Cria o PRIMEIRO usuário de uma instalação. Uma vez, e só uma.
 *
 * ⚠️ O PERFIL VEM DO CENSO (`TODAS_AS_ACOES`), não de uma lista à mão: uma ação nova
 * nasce no censo e o admin passa a poder concedê-la. Sem isso, o primeiro serviço do
 * próximo bloco ficaria negado até para quem deveria distribuí-lo.
 *
 * ⚠️ `unidadeOrcId: null` = TODAS as unidades — a concessão EXPLÍCITA que o schema
 * descreve. O admin de instalação é do ENTE, não de uma secretaria.
 */
export async function bootstrapUsuario(
  prisma: ReturnType<typeof criarPrismaClient>,
  senha: string
): Promise<ResultadoBootstrap> {
  // ═══ A TRAVA. Antes de qualquer escrita. ═══
  const jaExistem = await prisma.usuario.count();
  if (jaExistem > 0) {
    throw new Error(
      `BOOTSTRAP RECUSADO: este banco já tem ${jaExistem} usuário(s), e o bootstrap é ` +
        `ato de INSTALAÇÃO — roda uma vez na vida do banco, quando não há ninguém. ` +
        `Num banco povoado ele é inerte de propósito: um script re-executável capaz de ` +
        `carimbar um administrador entregaria a chave-mestra a quem tivesse acesso ao ` +
        `shell. Para criar mais usuários, use a administração do sistema, com o ato ` +
        `auditado e um autor responsável. Nada foi gravado.`
    );
  }

  const perfil = await prisma.perfil.create({
    data: {
      nome: NOME_PERFIL,
      descricao:
        "Acesso total — criado pelo bootstrap de instalação. Todas as ações do censo, em todas as unidades.",
      // ⚠️ AUTO-REFERÊNCIA: ver o comentário do `criadoPor` do usuário, abaixo.
      criadoPor: IDENT_ADMIN,
    },
    select: { id: true },
  });

  await prisma.permissaoDePerfil.createMany({
    data: TODAS_AS_ACOES.map((acao) => ({
      perfilId: perfil.id,
      acao,
      criadoPor: IDENT_ADMIN,
    })),
  });

  /**
   * ⚠️ `criadoPor` = O PRÓPRIO IDENTIFICADOR (auto-referência), e não um marcador tipo
   * "SEED". O schema não tem FK aqui (é String), então as duas formas GRAVARIAM — mas
   * a convenção do sistema é que `criadoPor` nomeia uma identidade que EXISTE: é por
   * ela que `exigirUsuarioAtivo` procura o autor de qualquer fato. Um marcador
   * "SEED_BOOTSTRAP" seria o único `criadoPor` do banco que não resolve para usuário
   * nenhum — um autor-fantasma, e a auditoria teria de aprender uma exceção.
   *
   * A auto-referência diz a verdade do que aconteceu: o primeiro usuário nasce com a
   * instalação, e não há autor anterior a ele.
   */
  const usuario = await prisma.usuario.create({
    data: {
      identificador: IDENT_ADMIN,
      nome: "Administrador do Sistema",
      ativo: true,
      criadoPor: IDENT_ADMIN,
    },
    select: { id: true },
  });

  await prisma.vinculoUsuarioPerfil.create({
    data: { usuarioId: usuario.id, perfilId: perfil.id, criadoPor: IDENT_ADMIN },
  });

  // O scrypt é o DO DOMÍNIO (`definirSenha` → `gerarHashDeSenha`): o hash nasce com os
  // mesmos parâmetros e o mesmo formato autodescritivo de qualquer outra senha. Um
  // hash "de seed" com custo próprio seria uma senha de segunda classe.
  await definirSenha(prisma, {
    usuarioId: usuario.id,
    senha,
    criadoPor: IDENT_ADMIN,
  });

  return {
    usuarioId: usuario.id,
    perfilId: perfil.id,
    identificador: IDENT_ADMIN,
    permissoesConcedidas: TODAS_AS_ACOES.length,
  };
}

/** Execução direta: `npm run seed:bootstrap`. */
if (process.argv[1]?.includes("bootstrap-usuario")) {
  const senha = exigirSenhaDoAmbiente();
  const url = process.env["DATABASE_URL"];
  if (url === undefined || url === "") {
    throw new Error("DATABASE_URL não configurada — o bootstrap não tem banco.");
  }
  const prisma = criarPrismaClient(url);
  const r = await bootstrapUsuario(prisma, senha);
  console.log(
    `[seed:bootstrap] ${r.identificador} CRIADO — perfil ${NOME_PERFIL} com ` +
      `${r.permissoesConcedidas} permissão(ões) do censo. Troque a senha no primeiro acesso.`
  );
  await prisma.$disconnect();
}
