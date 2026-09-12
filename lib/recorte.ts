/**
 * O RECORTE DE UMA PÁGINA DE EXECUÇÃO — exercício e unidade, lidos da URL.
 *
 * As páginas são Server Components; quem põe exercício/UG na URL é a ilha
 * `SincronizarContexto` (o UiContext do cabeçalho). Este módulo é a leitura do outro
 * lado — e existe para que as quatro telas leiam a URL do MESMO jeito. Quatro cópias
 * de `Number.parseInt(searchParams.exercicio)` divergiriam no primeiro caso de borda
 * (`?exercicio=abc`), e cada tela responderia um ano diferente.
 *
 * ⚠️ SEM DOMÍNIO E SEM PRISMA — é `lib/` fora de `lib/portas/`. Só parse de string.
 */
import { diaCivilBr } from "../packages/datas/index";


/** O exercício default quando a URL ainda não tem um (o primeiro render, antes da ilha sincronizar). */
export const EXERCICIO_PADRAO = 2026;

export interface RecorteDaPagina {
  readonly exercicio: number;
  /** Código SAGRES da unidade. `undefined` = consolidado (o ente inteiro). */
  readonly unidadeCodigo: string | undefined;
}

type Params = Record<string, string | string[] | undefined>;

/** Um `searchParam` pode vir repetido (`?ug=a&ug=b`); vale o primeiro. */
function primeiro(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * O RECORTE CRU DA URL — **SEM AUTORIZAÇÃO NENHUMA**. Quase nada deve chamar isto.
 *
 * ═══ ⚠️ O NOME É O AVISO, E ELE FOI TROCADO POR ISSO ═══
 * Esta função chamava-se `recorteDe`, e o nome mentia por omissão: lia-se como "a forma de
 * ler o recorte", e era a que todo mundo alcançava por reflexo ao escrever uma tela nova.
 * Ela aceita **qualquer** `?ug=` sem perguntar de quem é o crachá, e a AUSÊNCIA do
 * parâmetro produz o ENTE INTEIRO. Medido em
 * `test/caracterizacao/leitura-por-unidade.test.ts`: a mesma identidade recebia UMA unidade
 * de `listarUgsDoUsuario` e DUAS da lista de empenhos.
 *
 * O pedido da ENT10 exigia tornar o defeito **inexprimível, não vigiado**. Renomear é
 * metade disso: quem digitar `recorteNaoAutorizado(sp)` não o faz sem ler o que está
 * escrevendo. A outra metade é o grep-teste
 * (`test/ui/recorte-sem-autorizacao.test.ts`), que falha quando aparece um segundo
 * chamador.
 *
 * ═══ O QUE USAR NO LUGAR ═══
 *   · `recorteDePagina(sp)` (`lib/portas/contexto`) — telas e rotas com dimensão de
 *     UNIDADE. Resolve identidade e escopo no servidor e RECUSA nomeando;
 *   · `exercicioAutorizado(sp)` (aqui) — leituras do ENTE (receita, extraorçamentário,
 *     conciliação, patrimônio, plano de contas, programação financeira). Recusa exercício
 *     ilegível e não toca em unidade.
 *
 * ═══ ⚠️ O ÚNICO CHAMADOR LEGÍTIMO, E POR QUE ELE É LEGÍTIMO ═══
 * `app/(areas)/despesa/ordem-cronologica/page.tsx`. Aquela tela lê o recorte **para não
 * usá-lo**: a ordem do art. 141 é do ENTE, por fonte e categoria, e a página imprime, no
 * pé, que "o recorte do cabeçalho não se aplica a esta tela". Ela precisa do valor CRU
 * justamente para dizer isso com o número que o usuário escolheu. Impor-lhe a recusa faria
 * a tela rejeitar um parâmetro que ela própria declara inerte.
 *
 * Um exercício ilegível continua virando o padrão aqui — nunca `NaN`: uma consulta com
 * `exercicio: NaN` não erra, devolve lista vazia, e a tela mentiria dizendo "não há
 * empenhos" quando o certo é "o ano que você pediu não é um ano".
 */
export function recorteNaoAutorizado(sp: Params): RecorteDaPagina {
  const bruto = primeiro(sp["exercicio"]);
  const n = bruto !== undefined ? Number.parseInt(bruto, 10) : Number.NaN;
  const ug = primeiro(sp["ug"])?.trim();

  return {
    exercicio: Number.isInteger(n) ? n : EXERCICIO_PADRAO,
    unidadeCodigo: ug !== undefined && ug !== "" ? ug : undefined,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════
// O RECORTE **AUTORIZADO** — a decisão pura, sem banco e sem request.
//
// ⚠️ POR QUE ELE EXISTE, E POR QUE NÃO É UMA GUARDA DENTRO DA CONSULTA.
// `recorteDe` acima só faz parse: ele aceita qualquer `?ug=` e devolve. Nenhuma porta de
// LEITURA pergunta quem está pedindo — `listarEmpenhosDaExecucao` não tem parâmetro de
// identidade, e por isso não havia onde a pergunta caber. O defeito está na FORMA DE
// ENTRADA, e é ela que muda aqui: o recorte passa a nascer de uma decisão que recebe o
// escopo do usuário, ou recusa nomeando.
//
// Medido em `test/caracterizacao/leitura-por-unidade.test.ts`: hoje, sem `ug`, a porta
// entrega DUAS unidades a qualquer sessão; com `?ug=` alheia, entrega a unidade alheia; e
// a MESMA identidade recebe uma unidade de `listarUgsDoUsuario` e duas da lista.
//
// ⚠️ A ILHA DO CABEÇALHO NÃO É O FURO — e isso estreita o problema. `SincronizarContexto`
// procura a UG em `ugsDisponiveis` (vindas de `listarUgsDoUsuario`) e APAGA o parâmetro
// quando não a acha: "o que não está na lista não chega à URL". O que sobra é a URL
// digitada, salva ou compartilhada — e as rotas de exportação, que entregam o arquivo
// inteiro por GET direto, sem passar por menu.
//
// ⚠️ FUNÇÃO PURA, E A FRONTEIRA EXIGE ISSO. Este arquivo é zona 1 do
// `test/ui/fronteira-ui.test.ts`: não pode importar `modules/**` nem Prisma. O escopo
// chega por PARÂMETRO; quem o busca é a porta. É o que torna esta decisão testável sem
// banco e sem request — e é por isso que a prova dela roda na partição rápida.
// ═══════════════════════════════════════════════════════════════════════════════════

/**
 * O ESCOPO DE LEITURA DE UM USUÁRIO — o que a porta descobre e esta decisão consome.
 *
 * Vem de `listarUgsDoUsuario` (`lib/portas/contexto.ts`), que já é a MESMA tabela que a
 * escrita lê (`PermissaoDePerfil`): permissão com `unidadeOrcId` nulo é GLOBAL, permissões
 * de UGs específicas são só aquelas, e nenhuma permissão devolve VAZIO. Não há segunda
 * fonte sobre quem enxerga o quê.
 */
export interface EscopoDeLeitura {
  /** Códigos SAGRES das unidades que ele pode ler. Vazio = nenhuma. */
  readonly unidades: readonly string[];
  /**
   * Permissão GLOBAL em alguma ação. É o que autoriza o recorte CONSOLIDADO (o ente
   * inteiro) — quem só tem unidades específicas não pode pedi-lo, porque ele conteria
   * unidades que o usuário não pode ler.
   */
  readonly podeConsolidado: boolean;
}

/**
 * O exercício pedido não é um ano.
 *
 * ⚠️ ANTES ISSO VIRAVA `2026` EM SILÊNCIO, e o silêncio era o defeito: `?exercicio=abc`
 * devolvia o exercício padrão, e a tela respondia com confiança sobre um ano que o usuário
 * não pediu. `NaN` seria pior ainda — uma consulta com `exercicio: NaN` não erra, devolve
 * lista vazia, e a tela mentiria dizendo "não há empenhos".
 *
 * ⚠️ E O PARÂMETRO **AUSENTE** CONTINUA CAINDO NO PADRÃO. Ausência não é ilegibilidade: o
 * primeiro render acontece antes de a ilha do cabeçalho sincronizar a URL, e recusar ali
 * quebraria toda navegação por link sem parâmetro. Só o valor PRESENTE e ilegível recusa.
 */
export class ExercicioIlegivelError extends Error {
  constructor(bruto: string) {
    super(
      `O exercício pedido ("${bruto}") não é um ano. Corrija o endereço ou use o seletor ` +
        `de exercício no alto da tela. Nada foi consultado.`
    );
    this.name = "ExercicioIlegivelError";
  }
}

/**
 * A unidade pedida não está no escopo de leitura de quem pediu — ou o pedido é ambíguo.
 *
 * ⚠️ A MENSAGEM NOMEIA O ESCOPO QUE ELE **TEM**, e isso é deliberado: é a mesma distinção
 * que a ESCRITA já faz (`modules/m16-travamento/autorizacao.ts`), onde "não tem permissão"
 * se separa em A AÇÃO (o crachá não concede em lugar nenhum) e O ESCOPO (ele pode, só não
 * aqui). As duas pedem providências OPOSTAS, e mandar as duas com o mesmo texto faz o
 * servidor pedir a coisa errada ao administrador.
 *
 * ⚠️ E NÃO É "NÃO ENCONTRADO". Dizer que a unidade não existe mentiria sobre a base e
 * deixaria o usuário procurando um erro de digitação que não há.
 */
export class EscopoDeLeituraError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "EscopoDeLeituraError";
  }
}

/** Lista de unidades para a mensagem — ordenada, sem repetição, legível. */
function nomearUnidades(unidades: readonly string[]): string {
  return [...new Set(unidades)].sort().join(", ");
}

/**
 * O EXERCÍCIO PEDIDO, OU A RECUSA — **sem tocar em unidade**.
 *
 * ═══ ⚠️ POR QUE ELE EXISTE SEPARADO, E NÃO É DUPLICAÇÃO ═══
 * Metade das leituras do sistema é do **ENTE**, não de unidade: a arrecadação da receita, o
 * extraorçamentário, a conciliação bancária, a posição patrimonial, o plano de contas, a
 * programação financeira (o caixa é um só). Medido: essas telas **não passam
 * `unidadeCodigo` a porta nenhuma** — a dimensão não existe no modelo delas.
 *
 * Aplicar-lhes `recorteAutorizado` daria a recusa do exercício (que elas precisam) junto da
 * recusa de UNIDADE (que para elas é inerte). O efeito seria recusar `?ug=` numa tela que
 * ignora `ug` — quebrando link salvo **sem nenhum ganho de acesso**, porque não há dado de
 * outra unidade a proteger ali. Seria rigor aparente com custo real.
 *
 * ⚠️ E É UM LUGAR SÓ. `recorteAutorizado` chama esta função em vez de repetir o parse: dois
 * parses do mesmo parâmetro divergiriam no primeiro caso de borda, e o repositório já pagou
 * essa conta em `PERCURSOS-SEM-HELPER-COMUM` (dez cópias, cinco divergidas).
 *
 * ⚠️ A CONFERÊNCIA É SOBRE A STRING INTEIRA, não sobre o resultado do parse:
 * `Number.parseInt("2026abc", 10)` devolve **2026**. Um ano com sujeira colada não é um ano,
 * e aceitá-lo faria `?exercicio=2026';DROP` parecer legível.
 *
 * ⚠️ AUSENTE CAI NO PADRÃO, e isso não é frouxidão: o primeiro render acontece antes de a
 * ilha do cabeçalho sincronizar a URL, e recusar a ausência quebraria toda navegação por
 * link sem parâmetro. Só o valor PRESENTE e ilegível recusa.
 */
export function exercicioAutorizado(
  pedido: Record<string, string | string[] | undefined>
): number {
  const bruto = primeiro(pedido["exercicio"])?.trim();
  if (bruto === undefined || bruto === "") return EXERCICIO_PADRAO;
  const n = Number.parseInt(bruto, 10);
  if (!/^\d{4}$/.test(bruto) || !Number.isInteger(n)) {
    throw new ExercicioIlegivelError(bruto);
  }
  return n;
}

/**
 * O RECORTE EFETIVO — ou a recusa.
 *
 * A tabela de decisão, inteira:
 *
 * | exercício          | `ug`                    | resposta                                  |
 * |--------------------|-------------------------|-------------------------------------------|
 * | ausente            | —                       | `EXERCICIO_PADRAO`                        |
 * | presente, ilegível | —                       | recusa: `ExercicioIlegivelError`          |
 * | ok                 | presente, no escopo     | aquela unidade                            |
 * | ok                 | presente, fora          | recusa nomeando o escopo dele             |
 * | ok                 | ausente, pode consolidar| consolidado (como hoje)                   |
 * | ok                 | ausente, 1 unidade      | aquela unidade — sem consolidado           |
 * | ok                 | ausente, 2+ unidades    | recusa pedindo que escolha                |
 * | ok                 | ausente, 0 unidades     | recusa: não há o que ler                  |
 *
 * ⚠️ NUNCA CONSOLIDADO POR OMISSÃO. Era o caminho mais largo do defeito: omitir `ug`
 * entregava o ente inteiro a qualquer sessão, e nenhuma tela de leitura chamava
 * autorização para reclamar.
 *
 * ⚠️ A LINHA "2+ UNIDADES" É UMA LIMITAÇÃO DECLARADA, não um esquecimento.
 * `RecorteDaPagina` carrega UMA unidade (`unidadeCodigo`), e o `where` das consultas é
 * `unidadeOrc: { codigo }` — um único código. Um usuário com duas unidades e sem
 * consolidado quer o CONSOLIDADO PARCIAL das dele, e isso não é exprimível no tipo de
 * hoje: exprimi-lo pede `unidades: readonly string[]` atravessando `daFicha` e as cinco
 * consultas que passam por ela. Escolher uma unidade por ele seria arbitrário; devolver o
 * ente seria o defeito de volta. Então recusa, nomeando as dele e o que fazer.
 * Pendência: `CONSOLIDADO-PARCIAL-NAO-EXPRIMIVEL`.
 *
 * ⚠️ E O USUÁRIO GLOBAL PASSA PELA MESMA PORTA. `listarUgsDoUsuario` devolve TODAS as
 * unidades quando a permissão é global, então a conferência de pertinência vale para ele
 * sem caso especial — é o que evita um ramo "se for global, aceite qualquer coisa", que é
 * onde este tipo de guarda costuma vazar.
 */
export function recorteAutorizado(p: {
  readonly pedido: Record<string, string | string[] | undefined>;
  readonly escopo: EscopoDeLeitura;
  /** Identificador do usuário — entra na recusa, como na escrita. */
  readonly identificador: string;
}): RecorteDaPagina {
  const exercicio = exercicioAutorizado(p.pedido);

  const ug = primeiro(p.pedido["ug"])?.trim();
  const temUg = ug !== undefined && ug !== "";

  if (temUg) {
    if (!p.escopo.unidades.includes(ug)) {
      throw new EscopoDeLeituraError(
        p.escopo.unidades.length === 0
          ? `ACESSO NEGADO: o usuário "${p.identificador}" não tem leitura em unidade ` +
            `nenhuma, e por isso não pode ler a unidade ${ug}. Não é o endereço: é o ` +
            `crachá. Quem resolve é o administrador, concedendo acesso a uma unidade.`
          : `ACESSO NEGADO: a unidade ${ug} não está no escopo de leitura do usuário ` +
            `"${p.identificador}". Ele TEM leitura, mas só em: ` +
            `${nomearUnidades(p.escopo.unidades)}. Não é a ação: é ONDE. Quem resolve é o ` +
            `administrador, estendendo o escopo.`
      );
    }
    return { exercicio, unidadeCodigo: ug };
  }

  if (p.escopo.podeConsolidado) return { exercicio, unidadeCodigo: undefined };

  if (p.escopo.unidades.length === 1) {
    // ⚠️ CAI NO ESCOPO DELE em vez de recusar, e é o caso comum: o primeiro render
    // acontece antes de a ilha do cabeçalho pôr `ug` na URL. Recusar aqui faria toda tela
    // piscar uma recusa antes de funcionar.
    return { exercicio, unidadeCodigo: p.escopo.unidades[0] };
  }

  if (p.escopo.unidades.length === 0) {
    throw new EscopoDeLeituraError(
      `ACESSO NEGADO: o usuário "${p.identificador}" não tem leitura em unidade nenhuma. ` +
        `Não há o que consultar. Quem resolve é o administrador, concedendo acesso a uma ` +
        `unidade (ou reativando o cadastro, se ele foi revogado).`
    );
  }

  throw new EscopoDeLeituraError(
    `ESCOLHA A UNIDADE: o usuário "${p.identificador}" tem leitura em mais de uma ` +
      `unidade (${nomearUnidades(p.escopo.unidades)}) e não tem acesso consolidado ao ` +
      `ente. Selecione uma unidade no alto da tela — o consolidado apenas das unidades ` +
      `dele ainda não é oferecido.`
  );
}

/** "2026 · unidade 01001" — o subtítulo que diz ao usuário o que ele está vendo. */
export function descreverRecorte(r: RecorteDaPagina): string {
  return `Exercício ${r.exercicio} · ${
    r.unidadeCodigo !== undefined
      ? `unidade ${r.unidadeCodigo}`
      : "consolidado (ente)"
  }`;
}

/**
 * Data → "dd/mm/aaaa" NO CALENDÁRIO DO ENTE. A data do FATO, como o usuário a escreve.
 *
 * ⚠️ ESTA LINHA IMPRIMIA POR UTC, e é o formatador que quase toda tela usa. Um fato de
 * 31/12 às 22:00 saía "01/01" — e no ano seguinte. Ver docs/adr/ADR-data-civil-do-ente.md.
 */
export function dataBr(d: Date): string {
  return diaCivilBr(d);
}
