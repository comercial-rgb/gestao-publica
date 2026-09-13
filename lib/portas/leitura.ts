import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cliente } from "./cliente";
import { exigirSessao, type Identidade } from "./sessao";
import {
  ACOES_DE_LEITURA,
  ehAcaoDeLeitura,
  type AcaoDeLeitura,
} from "../../modules/m16-travamento/acoes";
import {
  acoesDeLeituraDoUsuario,
  escopoDaAcaoDeLeitura,
} from "../../modules/m16-travamento/leitura";
import {
  EscopoDeLeituraError,
  ExercicioIlegivelError,
  exigirAlgumEscopo,
  exigirEscopoDoEnte,
  exigirEscopoDoRegistro,
  recorteAutorizado,
  type EscopoDeLeitura,
  type RecorteDaPagina,
} from "../recorte";

/**
 * PORTA — A POLÍTICA DE LEITURA (orquestração V3, 4.1): quem pode CONSULTAR o quê, e onde.
 *
 * ═══ ⚠️ O QUE ISTO CORRIGE, E FOI MEDIDO ═══
 *   · `recorteDePagina` (ENT10) resolvia o escopo pela UNIÃO das unidades de TODAS as ações
 *     do usuário — um crachá de EMPENHAR na Saúde lia a Educação se outra ação alcançasse
 *     a Educação;
 *   · `exigirLeitura` do molde exigia SESSÃO e nada mais: 46 telas abertas a qualquer
 *     identidade cadastrada;
 *   · `lerDossieDoEmpenho` recebia um id e devolvia o dossiê sem perguntar de quem era;
 *   · as leituras do ENTE (receita, extraorçamentário, conciliação, patrimônio, livros e
 *     demonstrativos) só validavam o exercício.
 *
 * ═══ A DECISÃO DE PRODUTO ═══
 * Cada leitura protegida exige a ação de leitura da sua área (`CONSULTAR_<ÁREA>`,
 * `ACOES_DE_LEITURA` no censo) **no escopo efetivo pedido**:
 *
 *   · `exigirLeituraDoEnte(acao)` — a leitura é do ente inteiro (não há dimensão de
 *     unidade): só a concessão GLOBAL da ação autoriza;
 *   · `recorteDePagina(pedido, acao)` — a leitura tem dimensão de unidade: o escopo é o
 *     DAQUELA ação, o consolidado exige a global, e `?ug=` fora do escopo recusa nomeando;
 *   · `autorizarLeituraDoRegistro(acao, unidade)` — detalhe por id: o escopo sai do
 *     PRÓPRIO registro (a ficha do empenho), nunca da URL;
 *   · `exigirLeituraEmAlgumEscopo(acao)` — caixas por participação (processos, comunicados,
 *     chamados): a ação em qualquer escopo abre a área; o registro decide o resto.
 *
 * A UNIÃO das unidades (`listarUgsDoUsuario`) continua servindo ao SELETOR do cabeçalho — e
 * a nada mais. Permissão global em uma ação não concede leitura global em outra.
 *
 * ═══ ⚠️ A DECISÃO É PURA E MORA EM `lib/recorte.ts` ═══
 * Aqui há só o que exige servidor: a identidade (`exigirSessao`) e o escopo da ação
 * (`escopoDaAcaoDeLeitura`, a MESMA tabela que `autorizar` lê). As funções `...Para(sessao,
 * ...)` recebem a identidade por parâmetro e são as que a suíte exercita — `exigirSessao`
 * lê cookies do request e não existe fora dele.
 *
 * ═══ ⚠️ TELA × ROTA: A MESMA RECUSA, DUAS TRADUÇÕES ═══
 * Numa ROTA de exportação a recusa é um 403 com o motivo (`lib/rotas/recusa.ts`). Numa
 * TELA, uma exceção viraria a página genérica de erro do Next — que em produção apaga a
 * mensagem, e a mensagem é justamente o que diz ao servidor quem resolve. Por isso as
 * variantes `telaExige...` REDIRECIONAM para `/sem-acesso`, que recalcula a decisão a
 * partir da sessão (nada de motivo viajando na URL) e a mostra com o mesmo texto.
 */

export type { AcaoDeLeitura, EscopoDeLeitura, RecorteDaPagina };
export { ACOES_DE_LEITURA, EscopoDeLeituraError, ExercicioIlegivelError, ehAcaoDeLeitura };

/** Nível de leitura — o que cada tela declara ao chamar a porta. */
export type NivelDeLeitura = "ente" | "algum";

/** O escopo de UMA ação de leitura para UMA identidade — a mesma tabela que a escrita lê. */
export async function escopoDeLeitura(
  sessao: Identidade,
  acao: AcaoDeLeitura
): Promise<EscopoDeLeitura> {
  const e = await escopoDaAcaoDeLeitura(cliente(), sessao.identificador, acao);
  return {
    unidades: e.unidades.map((u) => u.codigo),
    podeConsolidado: e.global,
    identidadeAtiva: e.ativo,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// AS DECISÕES COM IDENTIDADE DADA — exercitáveis pela suíte
// ═══════════════════════════════════════════════════════════════════════════

export async function exigirLeituraDoEntePara(
  sessao: Identidade,
  acao: AcaoDeLeitura
): Promise<void> {
  const escopo = await escopoDeLeitura(sessao, acao);
  exigirEscopoDoEnte({ escopo, identificador: sessao.identificador, acao });
}

export async function exigirLeituraEmAlgumEscopoPara(
  sessao: Identidade,
  acao: AcaoDeLeitura
): Promise<void> {
  const escopo = await escopoDeLeitura(sessao, acao);
  exigirAlgumEscopo({ escopo, identificador: sessao.identificador, acao });
}

export async function autorizarLeituraDoRegistroPara(
  sessao: Identidade,
  acao: AcaoDeLeitura,
  unidadeCodigo: string | undefined
): Promise<void> {
  const escopo = await escopoDeLeitura(sessao, acao);
  exigirEscopoDoRegistro({ escopo, identificador: sessao.identificador, acao, unidadeCodigo });
}

export async function recorteDePaginaPara(
  sessao: Identidade,
  pedido: Record<string, string | string[] | undefined>,
  acao: AcaoDeLeitura
): Promise<RecorteDaPagina> {
  const escopo = await escopoDeLeitura(sessao, acao);
  return recorteAutorizado({ pedido, escopo, identificador: sessao.identificador, acao });
}

// ═══════════════════════════════════════════════════════════════════════════
// AS PORTAS COM A SESSÃO DO REQUEST — rotas e portas de leitura (LANÇAM a recusa)
// ═══════════════════════════════════════════════════════════════════════════

export async function exigirLeituraDoEnte(acao: AcaoDeLeitura): Promise<Identidade> {
  const sessao = await exigirSessao();
  await exigirLeituraDoEntePara(sessao, acao);
  return sessao;
}

export async function exigirLeituraEmAlgumEscopo(acao: AcaoDeLeitura): Promise<Identidade> {
  const sessao = await exigirSessao();
  await exigirLeituraEmAlgumEscopoPara(sessao, acao);
  return sessao;
}

export async function autorizarLeituraDoRegistro(
  acao: AcaoDeLeitura,
  unidadeCodigo: string | undefined
): Promise<Identidade> {
  const sessao = await exigirSessao();
  await autorizarLeituraDoRegistroPara(sessao, acao, unidadeCodigo);
  return sessao;
}

/**
 * A leitura do ente é permitida? — SEM lançar. Para COMPOR uma tela: o painel inicial
 * mostra os indicadores fiscais a quem pode consultar relatórios e os omite, dizendo por
 * quê, a quem não pode. Não é gate: quem usa isto para decidir "mostro ou não" continua
 * sem ler o dado quando a resposta é `false`.
 */
export async function temLeituraDoEnte(acao: AcaoDeLeitura): Promise<boolean> {
  const sessao = await exigirSessao();
  try {
    await exigirLeituraDoEntePara(sessao, acao);
    return true;
  } catch (e) {
    if (e instanceof EscopoDeLeituraError) return false;
    throw e;
  }
}

/**
 * A leitura é permitida? — SEM lançar e COM a identidade por parâmetro.
 *
 * É o que a porta de anexos usa: lá "não pode" e "não existe" respondem o MESMO 404, de
 * propósito (a diferença ensinaria a quem varre ids quais processos existem — ver
 * `lib/rotas/recusa.ts`). Quem precisa do motivo usa as funções que lançam.
 */
export async function podeLerPara(
  sessao: Identidade,
  acao: AcaoDeLeitura,
  nivel: NivelDeLeitura
): Promise<boolean> {
  try {
    if (nivel === "ente") await exigirLeituraDoEntePara(sessao, acao);
    else await exigirLeituraEmAlgumEscopoPara(sessao, acao);
    return true;
  } catch (e) {
    if (e instanceof EscopoDeLeituraError) return false;
    throw e;
  }
}

/** As ações de leitura da sessão em ALGUM escopo — o recorte do painel de pendências. */
export async function acoesDeLeituraDaSessao(): Promise<ReadonlySet<AcaoDeLeitura>> {
  const sessao = await exigirSessao();
  return acoesDeLeituraDoUsuario(cliente(), sessao.identificador, ACOES_DE_LEITURA);
}

// ═══════════════════════════════════════════════════════════════════════════
// AS PORTAS DE TELA — a recusa vira redirecionamento para /sem-acesso
// ═══════════════════════════════════════════════════════════════════════════

async function caminhoAtual(): Promise<string> {
  return (await headers()).get("x-pathname") ?? "/";
}

/**
 * ⚠️ O `redirect` FICA FORA DO `try`. Ele lança um erro de controle do Next
 * (`NEXT_REDIRECT`); capturá-lo junto da recusa engoliria o redirecionamento e a tela
 * ficaria em branco. Só a recusa de leitura é capturada; o resto sobe.
 */
async function telaExige(acao: AcaoDeLeitura, nivel: NivelDeLeitura): Promise<Identidade> {
  const sessao = await exigirSessao();
  let recusada = false;
  try {
    if (nivel === "ente") await exigirLeituraDoEntePara(sessao, acao);
    else await exigirLeituraEmAlgumEscopoPara(sessao, acao);
  } catch (e) {
    if (!(e instanceof EscopoDeLeituraError)) throw e;
    recusada = true;
  }
  if (recusada) {
    const de = await caminhoAtual();
    redirect(
      `/sem-acesso?acao=${encodeURIComponent(acao)}&nivel=${nivel}&de=${encodeURIComponent(de)}`
    );
  }
  return sessao;
}

/** A tela lê dados do ENTE: exige a ação de leitura GLOBAL, ou redireciona para /sem-acesso. */
export async function telaExigeLeituraDoEnte(acao: AcaoDeLeitura): Promise<Identidade> {
  return telaExige(acao, "ente");
}

/** A tela é uma caixa por participação: a ação em algum escopo basta, ou redireciona. */
export async function telaExigeLeituraEmAlgumEscopo(acao: AcaoDeLeitura): Promise<Identidade> {
  return telaExige(acao, "algum");
}
