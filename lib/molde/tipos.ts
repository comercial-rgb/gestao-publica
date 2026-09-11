/**
 * ═══ O MOLDE DE RECURSO — uma definição declarativa, e a superfície padrão sai dela ═══
 *
 * ⚠️ POR QUE ELE EXISTE, E A MEDIÇÃO QUE O OBRIGOU. Os cinco últimos gates entregaram cerca
 * de dez cláusulas cada. A causa não era execução: era que **cada cadastro custava uma tela
 * escrita à mão**, e cada tela religava à mão o que o ENT02 já havia construído — RBAC por
 * ação, linha do tempo de auditoria, anexos do M22, campos adicionais do M25, fila de
 * assinaturas, designer de relatórios. Sete cadastros × seis religações é quarenta e duas
 * oportunidades de esquecer uma.
 *
 * ═══ ⚠️ TRÊS LIMITES, PARA ELE NÃO VIRAR UM PROJETO DE FRAMEWORK ═══
 *
 * 1. **Ele é provado pelos cadastros do próprio lote**, não depois. Um molde sem consumidor
 *    é uma abstração adivinhada — e a abstração adivinhada custa mais que a repetição.
 * 2. **Cadastro que não couber escapa para tela escrita à mão.** O molde não cresce para
 *    acomodar exceção: a exceção vira `page.tsx` próprio e o molde continua pequeno.
 * 3. **NENHUMA REGRA DE NEGÓCIO AQUI.** Ele monta superfície e delega ao caso de uso. Saldo,
 *    período aberto, ordem cronológica, teto — tudo do domínio, dentro da transação. Uma
 *    validação de negócio no molde seria a segunda verdade sobre a mesma regra, e ela
 *    divergiria em silêncio do guard que decide de verdade.
 *
 * ═══ ⚠️ POR QUE ISTO NÃO IMPORTA O DOMÍNIO ═══
 * `test/ui/fronteira-ui.test.ts` proíbe `lib/**` (fora de `lib/portas/**`) de importar
 * `modules/mNN`. O descritor é, por isso, **dado puro**: a ação de autorização é uma
 * `string`. Quem a tipa contra o censo é a PORTA, que pode importar o M16 — e
 * `test/molde/censo-do-molde.test.ts` prova que toda ação nomeada num descritor existe no
 * censo. Sem esse teste, um erro de digitação em `permissoes` produziria uma tela cuja
 * autorização não existe, e o modo de falha seria `ACESSO NEGADO` em produção.
 */

/** Os tipos de campo que o molde sabe montar. Rol fechado — ver o limite 2. */
export type TipoDeCampoDoMolde =
  | "texto"
  | "textoLongo"
  | "inteiro"
  | "dinheiro"
  | "data"
  | "selecao"
  | "booleano"
  | "cpfCnpj";

export interface OpcaoDoMolde {
  readonly valor: string;
  readonly rotulo: string;
}

export interface CampoDoMolde {
  /** O `name` do `FormData` — e a chave do Zod do caso de uso. */
  readonly nome: string;
  readonly rotulo: string;
  readonly tipo: TipoDeCampoDoMolde;
  readonly obrigatorio?: boolean;
  /** Texto de apoio. É onde a base legal do campo vive. */
  readonly ajuda?: string;
  readonly placeholder?: string;
  readonly largura?: 1 | 2 | 3 | 4;
  /** Só para `selecao`. Vazio ⇒ o campo aparece desabilitado dizendo o motivo. */
  readonly opcoes?: readonly OpcaoDoMolde[];
  /** Só para `inteiro`. */
  readonly minimo?: number;
  readonly maximo?: number;
}

/**
 * Uma coluna da listagem.
 *
 * ⚠️ A CÉLULA NÃO É UMA FUNÇÃO. O descritor atravessa a fronteira servidor→cliente na
 * seleção múltipla, e função não serializa. A coluna diz o NOME do campo e o SEU TIPO, e
 * quem renderiza é o molde — dinheiro com `ValorMonetario`, data pelo dia civil do ente.
 * Coluna que precise de composição livre é sinal de que o cadastro escapou para tela
 * escrita à mão (limite 2).
 */
export interface ColunaDoMolde {
  readonly nome: string;
  readonly cabecalho: string;
  readonly tipo: "texto" | "dinheiro" | "data" | "inteiro" | "situacao" | "link";
  /** Ordenável na URL (`?ordem=&dir=`). */
  readonly ordenavel?: boolean;
  /**
   * A coluna entra na SOMA da seleção múltipla. Só `dinheiro`.
   *
   * ⚠️ A SOMA É DO SERVIDOR, NÃO DO JAVASCRIPT DA TELA. O total de uma seleção é dinheiro,
   * e dinheiro não vira `number` em lugar nenhum deste repositório — somar no browser
   * exigiria ou float ou embarcar `decimal.js` na ilha. O molde soma em Decimal no
   * servidor, pela mesma porta que lê a lista.
   */
  readonly somavel?: boolean;
}

export interface FiltroDoMolde {
  /** O nome do parâmetro na query string. */
  readonly nome: string;
  readonly rotulo: string;
  readonly tipo: "texto" | "selecao" | "data" | "inteiro";
  readonly opcoes?: readonly OpcaoDoMolde[];
  readonly largura?: 1 | 2 | 3 | 4;
  readonly placeholder?: string;
}

/**
 * Uma ação da barra — um `<form>` com Server Action, nunca um link.
 *
 * ⚠️ `GET` NÃO PRODUZ TRANSIÇÃO DE ESTADO. Uma ação por link deixaria o pré-carregador do
 * navegador encerrar o convênio de alguém, e o histórico do browser repeti-la ao voltar.
 */
export interface AcaoDoMolde {
  /** Identidade estável da ação na tela — vira `data-acao`, e é por ela que o percurso casa. */
  readonly nome: string;
  readonly rotulo: string;
  /** A ação do CENSO exigida no servidor. Ver a nota de cabeçalho sobre a tipagem. */
  readonly acaoDoCenso: string;
  /** Campos que a ação pede antes de disparar. Vazio ⇒ só o botão. */
  readonly campos?: readonly CampoDoMolde[];
  /** Aviso mostrado junto ao botão — o que ele torna irreversível, por exemplo. */
  readonly aviso?: string;
  /** `true` ⇒ a ação é destrutiva/irreversível e o botão diz isso. */
  readonly irreversivel?: boolean;
}

/**
 * As cinco abas FIXAS do detalhe. São fixas de propósito: um cadastro em que "histórico"
 * fica num lugar e "anexos" em outro obriga quem usa o sistema a reaprender cada tela.
 */
export type AbaDoMolde = "dados" | "campos" | "anexos" | "historico" | "relacionados";

export const ABAS_DO_MOLDE: readonly AbaDoMolde[] = [
  "dados",
  "campos",
  "anexos",
  "historico",
  "relacionados",
];

export const ROTULO_DA_ABA: Readonly<Record<AbaDoMolde, string>> = {
  dados: "Dados",
  campos: "Campos adicionais",
  anexos: "Anexos",
  historico: "Histórico",
  relacionados: "Relacionados",
};

/**
 * As ações do CENSO que esta tela precisa — e só as de ESCRITA.
 *
 * ⚠️ NÃO HÁ AÇÃO DE LEITURA AQUI, e a ausência é decisão do repositório, não esquecimento.
 * O censo do M16 é o rol dos atos que MUTAM estado: leitura entra em `FORA_DO_CENSO` com o
 * motivo, e o que controla quem vê o quê é o par sessão (fail-closed, `exigirSessao`) +
 * recorte por unidade gestora (`lib/portas/contexto.ts`). Inventar aqui um
 * `LER_CONVENIO` criaria uma segunda régua de visibilidade, e no dia em que as duas
 * divergissem a tela mostraria o que a consulta esconde — ou o contrário.
 *
 * ⚠️ E O QUE O MOLDE FAZ COM ELAS É ESCONDER O BOTÃO QUE NÃO SERVE. Quem não tem a ação
 * não vê o formulário — vê o MOTIVO. O `autorizar` do domínio recusaria de qualquer forma
 * dentro da transação (é ele que decide); a tela não decide, ela só para de oferecer o que
 * vai ser recusado. Oferecer e recusar depois é ensinar que o sistema é instável.
 */
export interface PermissoesDoMolde {
  /** Ação exigida para CRIAR. Ausente ⇒ o cadastro não se cria por esta tela. */
  readonly criar?: string;
  /** Ação exigida para EDITAR os dados. */
  readonly editar?: string;
  /** Ação exigida para ANEXAR documento. */
  readonly anexar?: string;
}

export interface DefinicaoDeRecurso {
  /** Slug estável — a rota, o `data-acao` dos formulários e a chave dos testes saem dele. */
  readonly nome: string;
  readonly rotulo: string;
  readonly rotuloSingular: string;
  /** A rota base, sem barra final. */
  readonly rota: string;
  /** Uma frase: o que este cadastro é. Vai no subtítulo e no estado vazio. */
  readonly descricao: string;

  readonly campos: readonly CampoDoMolde[];
  readonly colunas: readonly ColunaDoMolde[];
  readonly filtros: readonly FiltroDoMolde[];
  readonly acoes: readonly AcaoDoMolde[];
  readonly permissoes: PermissoesDoMolde;

  /**
   * As abas que este recurso realmente tem. As ausentes NÃO aparecem.
   *
   * ⚠️ ABA VAZIA É PIOR QUE ABA AUSENTE. Uma aba "Anexos" num cadastro que não aceita anexo
   * ensina que o sistema perdeu o arquivo. `verificarDefinicao` recusa declarar `anexos` sem
   * `donoDoAnexo`, e `campos` sem `cadastroDeCamposAdicionais`.
   */
  readonly abas: readonly AbaDoMolde[];

  /**
   * A COLUNA de `Anexo` que aponta para este recurso.
   *
   * ⚠️ ISTO É MODELO, NÃO SUPERFÍCIE, E POR ISSO NÃO É GENÉRICO. `Anexo` tem uma FK por tipo
   * de dono, e o cabeçalho do `m22-documentos.prisma` explica por quê: um `donoTipo String`
   * livre faria o banco deixar de garantir que o registro existe, e um id digitado errado
   * viraria anexo órfão que nenhuma tela mostra e nenhuma limpeza acha. Cadastro novo com
   * anexo = uma migration aditiva com a coluna, e UMA linha aqui.
   */
  readonly donoDoAnexo?: string;

  /** O valor de `CadastroComCamposAdicionais` deste recurso, quando ele tem campos. */
  readonly cadastroDeCamposAdicionais?: string;

  /**
   * O recurso entra na FILA DE ASSINATURAS do ENT02?
   *
   * Só faz sentido com `donoDoAnexo`: a fila assina um CONTEÚDO, e sem anexo a assinatura
   * recairia sobre o nada — é o que o `m22-documentos.prisma` recusa.
   */
  readonly assinavel?: boolean;

  /**
   * As CLASSES do PCASP que o campo `contaContabilId` deste cadastro aceita — `["2"]` para
   * conta de passivo, `["1"]` para ativo, `["7", "8"]` para controle.
   *
   * ⚠️ OBRIGATÓRIO QUANDO O CADASTRO TEM CAMPO DE CONTA, e `verificarDefinicao` cobra.
   * Enquanto o banco tinha 64 contas, oferecer "todas as analíticas" funcionava por
   * acidente. Com o plano oficial do TCE-PB (6.074 analíticas) isso passou a significar
   * duas coisas ruins ao mesmo tempo: uma lista de 400 KB no navegador, e — porque a
   * consulta tem teto — um "Conta do passivo" sem nenhuma conta de passivo, porque as
   * primeiras por código são todas da classe 1. O formulário montava, bonito e inútil.
   */
  readonly classesDeConta?: readonly string[];

  /** Consultas existentes a que o detalhe liga, com o filtro já aplicado. */
  readonly relacionados?: readonly {
    readonly rotulo: string;
    readonly href: string;
    readonly explicacao: string;
  }[];
}

/**
 * ⚠️ A VERIFICAÇÃO É EM TEMPO DE MÓDULO, e não um teste que alguém pode esquecer de escrever.
 *
 * Um descritor inconsistente — aba de anexos sem dono, coluna somável que não é dinheiro,
 * ação sem permissão do censo — produziria uma tela que parece pronta. `definirRecurso`
 * recusa carregar, e o `next build` falha junto: o erro aparece antes de alguém abrir a
 * página, não depois.
 */
export function definirRecurso(d: DefinicaoDeRecurso): DefinicaoDeRecurso {
  const erros = verificarDefinicao(d);
  if (erros.length > 0) {
    throw new Error(
      `Definição do recurso "${d.nome}" é inconsistente:\n  · ${erros.join("\n  · ")}`
    );
  }
  return Object.freeze(d);
}

/** Os problemas do descritor, em prosa. Vazio ⇒ consistente. Exportada para o teste. */
export function verificarDefinicao(d: DefinicaoDeRecurso): readonly string[] {
  const e: string[] = [];

  if (!/^[a-z][a-z0-9-]*$/.test(d.nome)) {
    e.push(`o nome "${d.nome}" não é um slug (minúsculas, dígitos e hífen)`);
  }
  if (!d.rota.startsWith("/") || d.rota.endsWith("/")) {
    e.push(`a rota "${d.rota}" precisa começar com "/" e não terminar com "/"`);
  }
  if (d.colunas.length === 0) e.push("a listagem não tem coluna nenhuma");

  // ⚠️ CAMPO DE CONTA SEM CLASSE DECLARADA É UM SELECT QUE PODE VIR VAZIO DA CLASSE CERTA.
  // Com o plano oficial do TCE-PB no banco (6.074 contas analíticas), "todas as analíticas"
  // deixou de ser uma lista; a consulta tem teto e as primeiras por código são todas da
  // classe 1. Um "Conta do passivo" sem conta de passivo monta sem erro e não serve.
  if (
    d.campos.some((c) => c.nome === "contaContabilId") &&
    (d.classesDeConta === undefined || d.classesDeConta.length === 0)
  ) {
    e.push(
      "tem campo `contaContabilId` e não declara `classesDeConta` — diga quais classes do " +
        'PCASP o campo aceita (por exemplo ["2"] para passivo)'
    );
  }
  for (const c of d.classesDeConta ?? []) {
    if (!/^[1-8]$/.test(c)) e.push(`a classe de conta "${c}" não é uma das oito do PCASP`);
  }
  if (d.campos.length === 0 && d.permissoes.criar !== undefined) {
    e.push("declara permissão de criar e não tem campo nenhum para o formulário");
  }

  for (const c of d.colunas) {
    if (c.somavel === true && c.tipo !== "dinheiro") {
      e.push(`a coluna "${c.nome}" é somável e não é dinheiro`);
    }
  }
  if (d.colunas.some((c) => c.tipo === "link") && !d.abas.includes("dados")) {
    e.push("a listagem tem coluna de link para o detalhe, mas o detalhe não tem a aba de dados");
  }

  for (const campo of [...d.campos, ...d.acoes.flatMap((a) => a.campos ?? [])]) {
    if (campo.tipo === "selecao" && campo.opcoes === undefined) {
      e.push(`o campo "${campo.nome}" é de seleção e não declara opções`);
    }
    if (campo.tipo !== "selecao" && campo.opcoes !== undefined) {
      e.push(`o campo "${campo.nome}" declara opções e não é de seleção`);
    }
    if (campo.rotulo.trim() === "") e.push(`o campo "${campo.nome}" está sem rótulo`);
  }

  const nomesDeAcao = new Set<string>();
  for (const a of d.acoes) {
    if (nomesDeAcao.has(a.nome)) e.push(`a ação "${a.nome}" está declarada duas vezes`);
    nomesDeAcao.add(a.nome);
    if (a.acaoDoCenso.trim() === "") e.push(`a ação "${a.nome}" não declara ação do censo`);
  }

  if (d.abas.includes("anexos") && d.donoDoAnexo === undefined) {
    e.push("declara a aba de anexos e não diz qual coluna de `Anexo` aponta para este recurso");
  }
  if (d.abas.includes("campos") && d.cadastroDeCamposAdicionais === undefined) {
    e.push("declara a aba de campos adicionais e não diz qual cadastro do M25 ela usa");
  }
  if (d.abas.includes("relacionados") && (d.relacionados ?? []).length === 0) {
    e.push("declara a aba de relacionados e não lista nenhum");
  }
  if (d.assinavel === true && d.donoDoAnexo === undefined) {
    e.push(
      "declara-se assinável sem dono de anexo: a fila assina um CONTEÚDO, e sem anexo a " +
        "assinatura recairia sobre o nada"
    );
  }
  if (d.abas.includes("anexos") && d.permissoes.anexar === undefined) {
    e.push("declara a aba de anexos e não declara a ação do censo para anexar");
  }
  if (d.acoes.length === 0 && d.permissoes.criar === undefined) {
    e.push(
      "não declara ação nenhuma nem permissão de criar: seria uma tela de leitura montada " +
        "pelo molde, e para isso a listagem basta — o detalhe não teria o que oferecer"
    );
  }

  for (const aba of d.abas) {
    if (!ABAS_DO_MOLDE.includes(aba)) e.push(`"${aba}" não é uma aba do molde`);
  }

  return e;
}

// ═══════════════════════════════════════════════════════════════════════════
// OS DTOs DA SUPERFÍCIE — o contrato entre a PORTA e o COMPONENTE
//
// ⚠️ ELES MORAM AQUI, E NÃO NO COMPONENTE, e a fronteira do `test/ui/fronteira-ui.test.ts`
// acusou a primeira versão: a porta importava `LinhaDoMolde` de `components/molde/`, e isso
// inverte a dependência — o DADO passaria a depender do PIXEL. A acusação estava certa. A
// FORMA do dado é contrato das duas pontas, e contrato mora na camada que nenhuma das duas
// possui.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Uma linha da listagem: nome do campo → texto JÁ PRONTO, mais o `id`.
 *
 * ⚠️ TEXTO, E NÃO VALOR TIPADO. Dinheiro atravessa como string decimal (a regra de ouro do
 * núcleo), data já vem como dia civil do ente, e o componente só escolhe COMO pintar. Passar
 * `Decimal` ou `Date` para cá obrigaria o componente a conhecer o fuso e a aritmética — duas
 * coisas que ele não tem como acertar sozinho.
 */
export type LinhaDoMolde = Readonly<Record<string, string>> & { readonly id: string };

export type TipoDeDado = "texto" | "dinheiro" | "data" | "inteiro" | "longo";

export interface DadoDoDetalhe {
  readonly rotulo: string;
  readonly valor: string;
  readonly tipo?: TipoDeDado;
  /** Explicação curta — a base legal do campo, quando houver. */
  readonly nota?: string;
}

export interface LinhaDoHistorico {
  readonly id: string;
  /** O que aconteceu, em prosa de negócio. */
  readonly oQue: string;
  /** A data do FATO, como dia civil do ente. */
  readonly quando: string;
  /**
   * ⚠️ O INSTANTE DO REGISTRO É OUTRO CAMPO, e as duas datas aparecem juntas na tela. Mostrar
   * só uma faria o movimento de março, lançado em maio, parecer de maio.
   */
  readonly registradoEm: string;
  readonly por: string;
  readonly motivo?: string | null;
  readonly valor?: string;
  readonly estornado?: boolean;
}
