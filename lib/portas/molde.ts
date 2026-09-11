import { cliente, PortaSemBancoError } from "./cliente";
import { exigirSessao, type Identidade } from "./sessao";
import { TODAS_AS_ACOES, type AcaoDoSistema } from "../../modules/m16-travamento/acoes.js";

/**
 * PORTA DO MOLDE — o que a superfície padrão precisa do servidor e não pode resolver sozinha.
 *
 * Três coisas, e nenhuma é regra de negócio:
 *
 *   1. **quem pode o quê** — para o molde ESCONDER o botão que seria recusado, dizendo o
 *      motivo. Quem decide continua sendo o `autorizar` do domínio, dentro da transação;
 *   2. **a soma da seleção**, em Decimal e no servidor;
 *   3. **a sessão**, fail-closed, que é o gate de leitura (ver a nota de `PermissoesDoMolde`).
 *
 * ⚠️ A FONTE DA PERMISSÃO É A MESMA QUE A ESCRITA USA — `PermissaoDePerfil`, pelos vínculos
 * do usuário. Não há segunda tabela nem cache: se houvesse, o dia em que as duas divergissem
 * a tela ofereceria o que o domínio recusa (ou esconderia o que ele permite), e o usuário
 * concluiria que o sistema é instável.
 */

export { PortaSemBancoError };

/**
 * Das ações pedidas, quais o usuário da sessão REALMENTE tem.
 *
 * ⚠️ PERMISSÃO GLOBAL (`unidadeOrcId` nulo) COBRE QUALQUER UG — é o mesmo critério do
 * `autorizar`. A pergunta aqui é "ele tem esta ação em ALGUM lugar?", porque a tela ainda não
 * sabe de qual unidade será o fato; a pergunta "pode AQUI?" é do ato, e continua sendo do
 * domínio. Responder "não" aqui a quem tem a ação numa unidade esconderia a tela de quem
 * pode usá-la.
 */
export async function acoesPermitidas(
  acoes: readonly string[]
): Promise<ReadonlySet<string>> {
  if (acoes.length === 0) return new Set();
  const pedidas = acoes.map(exigirAcaoDoCenso);
  const sessao = await exigirSessao();
  const prisma = cliente();

  const usuario = await prisma.usuario.findUnique({
    where: { identificador: sessao.identificador },
    select: { id: true, ativo: true },
  });
  // ⚠️ FAIL-CLOSED: usuário inexistente ou revogado não tem ação nenhuma. Devolver o conjunto
  // vazio faz a tela mostrar os motivos em vez de estourar — e nenhum botão aparece.
  if (usuario === null || !usuario.ativo) return new Set();

  const vinculos = await prisma.vinculoUsuarioPerfil.findMany({
    where: { usuarioId: usuario.id },
    select: {
      perfil: {
        select: {
          permissoes: {
            where: { acao: { in: pedidas } },
            select: { acao: true },
          },
        },
      },
    },
  });

  return new Set(vinculos.flatMap((v) => v.perfil.permissoes).map((p) => String(p.acao)));
}

/**
 * ⚠️ A AÇÃO DO DESCRITOR É CONFERIDA CONTRA O CENSO, AQUI, E ESTOURA.
 *
 * O descritor do molde vive em `lib/molde/`, que não pode importar o domínio (a fronteira do
 * `test/ui/fronteira-ui.test.ts`), e por isso a ação é uma `string` lá. É esta porta que a
 * amarra ao censo — e ela ESTOURA em vez de devolver "sem permissão": um erro de digitação em
 * `permissoes` produziria uma tela cujo botão nunca aparece, para ninguém, sem nenhum aviso.
 * Esconder o botão é a resposta certa para "não tem permissão", e a resposta ERRADA para
 * "a ação não existe".
 */
function exigirAcaoDoCenso(nome: string): AcaoDoSistema {
  const achada = TODAS_AS_ACOES.find((a) => a === nome);
  if (achada === undefined) {
    throw new Error(
      `A ação "${nome}", nomeada num descritor do molde, NÃO EXISTE no censo do M16. ` +
        `Acrescente-a em \`modules/m16-travamento/acoes.ts\` (e conceda-a ao perfil) ou ` +
        `corrija o descritor. Uma ação inexistente esconderia o botão para todo mundo, em ` +
        `silêncio.`
    );
  }
  return achada;
}

/** A sessão, ou o redirecionamento para /login. É o gate de leitura das telas do molde. */
export async function exigirLeitura(): Promise<Identidade> {
  return exigirSessao();
}
