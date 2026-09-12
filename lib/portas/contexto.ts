import { cliente } from "./cliente";
import type { AcaoDoSistema } from "../../modules/m16-travamento/acoes";
import { exigirSessao } from "./sessao";
import type { Identidade } from "../../modules/m16-travamento/autenticacao";
// ⚠️ A DECISÃO É PURA E MORA FORA DA PORTA — ver `recorteDePagina`, abaixo. A porta traz a
// identidade e o escopo (as duas coisas que exigem servidor) e encaminha; a regra tem 19
// asserções e duas provas por mutação em `test/ui/recorte-autorizado.test.ts`, na partição
// rápida, porque não precisa de banco.
import {
  EscopoDeLeituraError,
  ExercicioIlegivelError,
  recorteAutorizado,
  type RecorteDaPagina,
} from "../recorte";

// ⚠️ OS DOIS ERROS SAEM PELA PORTA, e não é conveniência de import: é o idioma que ~70
// telas já falam com `PortaSemBancoError` (e `lib/portas/tesouraria.ts` com
// `MapeamentoContabilAusenteError`). A tela nomeia no `catch` o erro que a porta que ela
// chamou reexporta — uma origem só. Fazê-la importar de `lib/recorte` E da porta espalharia
// a procedência do mesmo erro por dois caminhos, e o dia em que a decisão se mudasse de
// arquivo cada tela descobriria isso por conta própria.
export { EscopoDeLeituraError, ExercicioIlegivelError };
export type { RecorteDaPagina };

/**
 * PORTA — O CONTEXTO DE TRABALHO: quais EXERCÍCIOS existem e quais UNIDADES GESTORAS o usuário
 * PODE enxergar.
 *
 * ═══ ⚠️ ISTO SUBSTITUI UM MOCK, E O MOCK ERA PERIGOSO ═══
 * Até aqui `lib/ui-context.tsx` servia três UGs constantes (`uo-01001`, `uo-01004`, `uo-01003`) e
 * três exercícios fixos. Duas consequências, e a segunda é a grave:
 *
 *   · os ids não existiam no banco — a URL levava um código que a porta não achava, e a tela
 *     respondia lista vazia sem explicar por quê;
 *   · o seletor mostrava TODAS as unidades a TODO usuário. A segregação por UG (TR 6.5) existe no
 *     domínio (`autorizar` recusa a UG errada), mas a INTERFACE oferecia o recorte proibido. O
 *     usuário da Saúde via "Educação" na lista, escolhia, e só descobria o limite quando uma
 *     escrita estourava — se estourasse: uma tela de LEITURA não chama `autorizar`, então ele
 *     LERIA os dados da unidade que não é dele.
 *
 * ⚠️ FAIL-CLOSED: SEM PERMISSÃO, LISTA VAZIA — NUNCA "TODAS". O reflexo de tratar lista vazia como
 * "não filtrei nada, mostre tudo" é o que transforma um usuário sem crachá no usuário mais
 * poderoso do sistema. Aqui, quem não tem permissão não enxerga unidade nenhuma.
 */

export interface ExercicioDisponivel {
  readonly ano: number;
  readonly encerrado: boolean;
}

export interface UgDisponivel {
  readonly id: string;
  /** SAGRES-PB: 5 dígitos. É o identificador de DOMÍNIO — o que viaja na URL. */
  readonly codigo: string;
  readonly nome: string;
}

export interface ContextoDoUsuario {
  readonly exercicios: readonly ExercicioDisponivel[];
  readonly ugs: readonly UgDisponivel[];
  /**
   * O usuário tem permissão GLOBAL (em alguma ação)? É o que autoriza o recorte "CONSOLIDADO"
   * (o ente inteiro). Quem só tem permissão de UGs específicas não pode pedir o consolidado —
   * ele conteria unidades que o usuário não pode ler.
   */
  readonly podeConsolidado: boolean;
  /**
   * AS AÇÕES QUE ESTE USUÁRIO REALMENTE TEM — o insumo da barra lateral.
   *
   * ⚠️ ELAS VÊM DA MESMA TABELA QUE `autorizar` LÊ (`PermissaoDePerfil`, pelos vínculos de
   * perfil). Não há segunda fonte: um menu com a própria ideia de quem pode o quê é o
   * defeito do seletor de encaminhamento do ENT02, repetido em escala de sistema.
   */
  readonly acoes: readonly AcaoDoSistema[];
}

/**
 * AS AÇÕES DO USUÁRIO, sem recorte de unidade.
 *
 * ⚠️ SEM RECORTE DE UG, E DE PROPÓSITO. A pergunta da barra lateral é "esta área existe
 * para ele em ALGUM lugar do ente?", não "ele pode empenhar NESTA unidade?". Filtrar por UG
 * aqui esconderia a área inteira de quem tem a ação em outra unidade — e ele deixaria de
 * achar a tela que pode usar. A pergunta específica continua sendo do `autorizar`, no ato.
 *
 * ⚠️ FAIL-CLOSED, como as UGs: usuário inexistente, inativo ou sem perfil devolve VAZIO.
 * Tratar vazio como "mostre tudo" faria de quem não tem crachá o usuário mais visível do
 * sistema.
 */
export async function listarAcoesDoUsuario(
  sessao: Identidade
): Promise<readonly AcaoDoSistema[]> {
  const prisma = cliente();
  const usuario = await prisma.usuario.findUnique({
    where: { identificador: sessao.identificador },
    select: { id: true, ativo: true },
  });
  if (usuario === null || !usuario.ativo) return [];

  const vinculos = await prisma.vinculoUsuarioPerfil.findMany({
    where: { usuarioId: usuario.id },
    select: { perfil: { select: { permissoes: { select: { acao: true } } } } },
  });
  return [
    ...new Set(
      vinculos.flatMap((v) => v.perfil.permissoes.map((p) => p.acao as AcaoDoSistema))
    ),
  ];
}

/**
 * AS UNIDADES QUE ESTE USUÁRIO PODE ENXERGAR.
 *
 * A regra vem do mesmo lugar que a escrita usa (`PermissaoDePerfil`), e por isso não há como as
 * duas discordarem:
 *   · alguma permissão com `unidadeOrcId` NULO  → GLOBAL → todas as unidades;
 *   · permissões de UGs específicas             → só essas;
 *   · nenhuma permissão                          → NENHUMA (lista vazia).
 *
 * ⚠️ A CONSULTA É POR USUÁRIO, NÃO POR AÇÃO. Aqui a pergunta é "onde ele trabalha?", não "ele pode
 * empenhar aqui?" — esta segunda continua sendo do `autorizar`, no momento do ato. Filtrar o
 * seletor por uma ação específica esconderia unidades onde ele tem outras ações, e a tela ficaria
 * mentindo por omissão na direção oposta.
 */
export async function listarUgsDoUsuario(
  sessao: Identidade
): Promise<{ readonly ugs: readonly UgDisponivel[]; readonly global: boolean }> {
  const prisma = cliente();

  const usuario = await prisma.usuario.findUnique({
    where: { identificador: sessao.identificador },
    select: { id: true, ativo: true },
  });

  // ⚠️ Usuário inexistente ou revogado NÃO enxerga nada. O `exigirUsuarioAtivo` do domínio diria o
  // mesmo com uma mensagem melhor, mas ele ESTOURA — e um seletor de cabeçalho que estoura derruba
  // a página inteira. Aqui a resposta é o vazio, e a tela o nomeia.
  if (usuario === null || !usuario.ativo) return { ugs: [], global: false };

  const vinculos = await prisma.vinculoUsuarioPerfil.findMany({
    where: { usuarioId: usuario.id },
    select: { perfil: { select: { permissoes: { select: { unidadeOrcId: true } } } } },
  });

  const permissoes = vinculos.flatMap((v) => v.perfil.permissoes);
  const global = permissoes.some((p) => p.unidadeOrcId === null);

  if (global) {
    const todas = await prisma.unidadeOrcamentaria.findMany({
      select: { id: true, codigo: true, descricao: true },
      orderBy: { codigo: "asc" },
    });
    return {
      ugs: todas.map((u) => ({ id: u.id, codigo: u.codigo, nome: u.descricao })),
      global: true,
    };
  }

  const ids = [...new Set(permissoes.map((p) => p.unidadeOrcId).filter((i): i is string => i !== null))];
  if (ids.length === 0) return { ugs: [], global: false };

  const escopadas = await prisma.unidadeOrcamentaria.findMany({
    where: { id: { in: ids } },
    select: { id: true, codigo: true, descricao: true },
    orderBy: { codigo: "asc" },
  });
  return {
    ugs: escopadas.map((u) => ({ id: u.id, codigo: u.codigo, nome: u.descricao })),
    global: false,
  };
}

/**
 * OS EXERCÍCIOS CADASTRADOS — do banco, nunca de constante.
 *
 * ⚠️ `encerrado` É DERIVADO da existência do `EncerramentoExercicio`, não de uma flag. Encerrar é
 * um FATO append-only (M08); uma coluna booleana seria a segunda verdade sobre ele, e o dia em que
 * as duas divergissem a tela diria "aberto" sobre um exercício que o razão já fechou.
 */
export async function listarExercicios(): Promise<readonly ExercicioDisponivel[]> {
  const prisma = cliente();
  const exercicios = await prisma.exercicio.findMany({
    select: { ano: true, encerramento: { select: { id: true } } },
    orderBy: { ano: "desc" },
  });
  return exercicios.map((e) => ({ ano: e.ano, encerrado: e.encerramento !== null }));
}

/**
 * O RECORTE DE UMA PÁGINA, JÁ AUTORIZADO — a porta fina sobre a decisão pura.
 *
 * ═══ ⚠️ POR QUE ELA É FINA, E POR QUE ELA EXISTE ═══
 * A decisão inteira mora em `lib/recorte.ts` (`recorteAutorizado`), que é PURA: sem banco,
 * sem request, escopo por parâmetro. Aqui há só as duas coisas que exigem servidor —
 * descobrir QUEM está pedindo (`exigirSessao`) e QUAL é o escopo dele
 * (`listarUgsDoUsuario`) — e a decisão é encaminhada. Lógica nenhuma se repete: uma regra
 * escrita duas vezes é a segunda verdade sobre quem pode ler o quê, e as duas divergem no
 * primeiro caso de borda.
 *
 * ⚠️ E O ESCOPO VEM DA MESMA TABELA QUE A ESCRITA LÊ. `listarUgsDoUsuario` consulta
 * `PermissaoDePerfil` pelos vínculos de perfil — a mesma fonte de `autorizar`. Não há
 * segunda fonte: um recorte com a própria ideia de quem enxerga o quê seria o defeito do
 * seletor de contexto repetido em escala de sistema.
 *
 * ⚠️ POR QUE CADA TELA CHAMA ISTO, EM VEZ DE HERDAR DO LAYOUT. O
 * `app/(areas)/layout.tsx` já carrega `{ ugs, podeConsolidado }` por request — mas um
 * layout Server Component NÃO passa props para as páginas no App Router, e, mais
 * importante, autorização que depende do render do pai é autorização que some quando a
 * rota é alcançada por outro caminho. As dez rotas de exportação são exatamente esse outro
 * caminho: `GET` direto, sem layout e sem menu. Invariante 7 — tenant e entidade resolvidos
 * no servidor, a cada leitura.
 *
 * ⚠️ ELA ESTOURA, E QUEM TRADUZ É A TELA. `EscopoDeLeituraError` e
 * `ExercicioIlegivelError` sobem com a mensagem que explica o que fazer em seguida, e a
 * página as nomeia no `catch` — o mesmo idioma de `PortaSemBancoError`, que ~70 telas já
 * usam. Devolver `null` aqui faria a tela dizer "sem empenhos" para uma recusa de acesso,
 * que é a mentira mais cara que esta camada pode contar.
 */
export async function recorteDePagina(
  pedido: Record<string, string | string[] | undefined>
): Promise<RecorteDaPagina> {
  const sessao = await exigirSessao();
  const { ugs, global } = await listarUgsDoUsuario(sessao);
  return recorteAutorizado({
    pedido,
    escopo: { unidades: ugs.map((u) => u.codigo), podeConsolidado: global },
    identificador: sessao.identificador,
  });
}

/**
 * O CONTEXTO COMPLETO, para o Server Component do layout injetar no provider client.
 *
 * ⚠️ QUEM LÊ É O SERVIDOR. O componente client recebe isto por PROPS e só guarda a SELEÇÃO — ele
 * nunca consulta o banco (o Prisma não bundla para o browser, e a fronteira do
 * `test/ui/fronteira-ui.test.ts` recusa a tentativa).
 */
export async function carregarContextoDoUsuario(): Promise<ContextoDoUsuario> {
  const sessao = await exigirSessao();
  const [{ ugs, global }, exercicios, acoes] = await Promise.all([
    listarUgsDoUsuario(sessao),
    listarExercicios(),
    listarAcoesDoUsuario(sessao),
  ]);
  return { exercicios, ugs, podeConsolidado: global, acoes };
}
