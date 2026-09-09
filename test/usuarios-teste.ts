import type { PrismaClient } from "../prisma/generated/client/client.js";
import { TODAS_AS_ACOES, ACOES_DE_ADMINISTRACAO } from "../modules/m16-travamento/acoes.js";
import type { AutorizacaoPort } from "../modules/m16-travamento/porta.js";

/**
 * ⚠️ O STUB DA AUTORIZAÇÃO — E ELE SÓ SERVE AOS TESTES **UNITÁRIOS**, OS QUE NÃO TÊM BANCO.
 *
 * Os testes de integração NÃO usam isto: eles montam `deps` pelo `criarM0xDeps(prisma)`, e lá
 * a porta é a de verdade, contra o cadastro de verdade — é assim que a autorização é exercida
 * de ponta a ponta na suíte.
 *
 * Aqui, em `m01.test.ts` e `m02.test.ts`, não há Prisma nenhum: são testes de FORMA (o motor
 * puro, as invariantes contábeis, o fail-closed do plano de contas). Eles precisam de uma
 * resposta para "ele pode?", e a resposta é "pode".
 *
 * ⚠️ E É POR ISSO QUE A PORTA É **OBRIGATÓRIA** NO `M0xDeps`, e não opcional: a permissividade
 * fica ESCRITA, com nome e comentário, em vez de ser o silêncio de um campo que ninguém
 * preencheu. Um `autz?: AutorizacaoPort` teria deixado estes dois testes verdes sem que
 * ninguém percebesse que a autorização não estava lá.
 */
export const autzQuePermiteTudo: AutorizacaoPort = {
  async exigir(): Promise<void> {
    // deixa passar — ver o cabeçalho
  },
};

/**
 * OS USUÁRIOS E PERFIS DE TESTE — e por que eles moram DENTRO do `limparBanco`.
 *
 * ⚠️ A PARTIR DESTE BLOCO, TODO LANÇAMENTO EXIGE UM AUTOR CADASTRADO (o funil confere a
 * identidade). Isso alcança **49 arquivos de teste** — e uma cópia do seed em cada um seriam
 * quarenta e nove lugares para esquecer de um.
 *
 * É exatamente o argumento do `semearRoteiroOrcamentario` dentro do `criarFichaDeTeste`
 * ("a partir deste bloco, TODA ficha que nasce lança no razão"). A solução é a mesma: o seed
 * roda de dentro do helper que TODA fixture já chama — aqui, o `limparBanco`.
 *
 * ═══ OS PERFIS CANÔNICOS — e eles saem da SEGREGAÇÃO DO 6.4, não do gosto de ninguém ═══
 * O TR 6.4 pede a separação entre quem EXECUTA, quem CONTROLA e quem só CONSULTA. Os três
 * perfis abaixo são essa separação, e nada mais:
 *
 *   EXECUCAO   — quem faz o dinheiro andar: empenha, liquida, paga, arrecada, patrimônio.
 *                NÃO trava nem destrava competência (quem empenha não fecha o próprio mês).
 *   CONTROLE   — quem fecha e reabre o período, apura o resultado, encerra o exercício.
 *                É o contrapeso: ele NÃO empenha.
 *   ADMIN      — tudo. Existe porque a fixture precisa de um ator onipotente para MONTAR o
 *                cenário — e porque a maioria dos testes não é sobre permissão. Num ente de
 *                verdade este perfil é de UMA pessoa, e o TCE vai perguntar quem é.
 *
 * ⚠️ As fixtures usam ADMIN por padrão. Os testes QUE SÃO SOBRE PERMISSÃO usam EXECUCAO e
 * CONTROLE — e é neles que a segregação é provada.
 */

/**
 * ⚠️ O CENSO DAS IDENTIDADES DAS FIXTURES. Levantado por grep ANTES de mexer numa linha:
 * são estas as strings que os 49 arquivos de teste (e os helpers) passam como `criadoPor`.
 *
 * Elas NÃO são bonitas — "atacante", "t", "u", "LOA" — e é justamente por isso que estão
 * aqui: o repositório as usava como se fossem nomes, e ninguém podia cobrá-las. Agora elas
 * são identidades cadastradas, e o dia em que uma fixture inventar uma nova, o funil a
 * recusa nomeando — que é o comportamento certo.
 */
const IDENTIDADES_DAS_FIXTURES: readonly string[] = [
  // ── os e-mails por módulo/área (levantados por grep sobre TODAS as constantes) ──
  "contabilidade@cg.pb.gov.br",
  "integracao@cg.pb.gov.br",
  "usuario@cg.pb.gov.br",
  "tesouraria@cg.pb.gov.br",
  "patrimonio@cg.pb.gov.br",
  "almoxarifado@cg.pb.gov.br",
  "atuarial@cg.pb.gov.br",
  "licitacoes@cg.pb.gov.br",
  "obras@cg.pb.gov.br",
  "despesa@cg.pb.gov.br",
  "orcamento@cg.pb.gov.br",
  "tributos@cg.pb.gov.br",
  "portal@cg.pb.gov.br",
  "siconfi@cg.pb.gov.br",
  "manad@cg.pb.gov.br",
  "controle.interno@cg.pb.gov.br",
  "alice@cg.pb.gov.br",
  "bob@cg.pb.gov.br",
  "m02@cg.pb.gov.br",
  "m03@cg.pb.gov.br",
  "m04@cg.pb.gov.br",
  "m05@cg.pb.gov.br",
  "m05b@cg.pb.gov.br",
  "m06@cg.pb.gov.br",
  "m07@cg.pb.gov.br",
  "m08@cg.pb.gov.br",
  "m09@cg.pb.gov.br",
  "m10@cg.pb.gov.br",
  "m11@cg.pb.gov.br",
  "m12@cg.pb.gov.br",
  "m13@cg.pb.gov.br",
  // ── ENT01: a cadeia da despesa exercitada pelo PAPEL DE RUNTIME ──
  "ent01@cg.pb.gov.br",
  // ── os automáticos dos helpers e seeds ──
  "LOA",
  "TESTE",
  "SEED",
  "BACKFILL",
  // ── os literais de cenários específicos (concorrência, adversariais, de-para) ──
  "atacante",
  "t",
  "u",
  "M04:anularArrecadacao",
  "M05:anularLiquidacao",
];

/** O nome dos perfis — exportado para que os testes de permissão os vinculem. */
export const PERFIL_EXECUCAO = "EXECUCAO";
export const PERFIL_CONTROLE = "CONTROLE";
export const PERFIL_ADMIN = "ADMIN";

/** As ações do CONTROLE (6.4): fechar, reabrir, apurar, encerrar. NÃO executa despesa. */
const ACOES_DE_CONTROLE = [
  "TRAVAR_COMPETENCIA",
  "DESTRAVAR_COMPETENCIA",
  "APURAR_RESULTADO",
  "ESTORNAR_APURACAO",
  "ENCERRAR_EXERCICIO",
  "ENCERRAR_CONTROLES_ORCAMENTARIOS",
  "ESTORNAR_ENCERRAMENTO_CONTROLES",
] as const;

/**
 * Semeia os perfis, os usuários das fixtures e os vínculos. Idempotente.
 *
 * Chamado de dentro do `limparBanco` — ver o cabeçalho.
 */
export async function semearUsuariosDeTeste(prisma: PrismaClient): Promise<void> {
  const POR = "SEED";

  const admin = await prisma.perfil.create({
    data: {
      nome: PERFIL_ADMIN,
      descricao: "Todas as ações. Nas fixtures, o ator que monta o cenário.",
      criadoPor: POR,
      permissoes: {
        create: TODAS_AS_ACOES.map((acao) => ({
          acao,
          // ⚠️ SEM UG: a permissão GLOBAL. É concessão explícita — ver o schema.
          criadoPor: POR,
        })),
      },
    },
    select: { id: true },
  });

  const controle = await prisma.perfil.create({
    data: {
      nome: PERFIL_CONTROLE,
      descricao:
        "TR 6.4 — quem FECHA e REABRE o período, apura o resultado e encerra o exercício. " +
        "NÃO empenha: é o contrapeso da execução.",
      criadoPor: POR,
      permissoes: {
        create: ACOES_DE_CONTROLE.map((acao) => ({ acao, criadoPor: POR })),
      },
    },
    select: { id: true },
  });

  const execucao = await prisma.perfil.create({
    data: {
      nome: PERFIL_EXECUCAO,
      descricao:
        "TR 6.4 — quem faz o dinheiro andar (empenha, liquida, paga, arrecada). NÃO trava " +
        "nem destrava competência: quem empenha não fecha o próprio mês.",
      criadoPor: POR,
      permissoes: {
        // ⚠️ EXECUÇÃO NÃO HERDA ADMINISTRAÇÃO (7.14). Além do CONTROLE (o contrapeso do fechamento),
        // o perfil de execução também NÃO recebe a família ADMINISTRACAO — quem empenha não cria
        // usuário nem reseta senha alheia. É a separação que o teste de não-herança prova.
        create: TODAS_AS_ACOES.filter(
          (a) =>
            !(ACOES_DE_CONTROLE as readonly string[]).includes(a) &&
            !(ACOES_DE_ADMINISTRACAO as readonly string[]).includes(a)
        ).map((acao) => ({ acao, criadoPor: POR })),
      },
    },
    select: { id: true },
  });
  void execucao;

  // ⚠️ TODAS as identidades das fixtures ganham ADMIN — porque a esmagadora maioria dos
  // testes NÃO é sobre permissão, e fazê-los tropeçar nela testaria a coisa errada. Os
  // testes que SÃO sobre permissão criam os seus próprios usuários com perfis restritos.
  await prisma.usuario.createMany({
    data: IDENTIDADES_DAS_FIXTURES.map((identificador) => ({
      identificador,
      nome: identificador,
      criadoPor: POR,
    })),
  });

  const usuarios = await prisma.usuario.findMany({ select: { id: true } });
  await prisma.vinculoUsuarioPerfil.createMany({
    data: usuarios.map((u) => ({
      usuarioId: u.id,
      perfilId: admin.id,
      criadoPor: POR,
    })),
  });

  void controle;
}
