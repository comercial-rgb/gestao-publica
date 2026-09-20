import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { raizesExistentes, RAIZES_DE_ESCRITA } from "./raizes-dominio.js";
import { somenteCodigo } from "./prosa.js";

/**
 * ═══ TODO MODELO DO SCHEMA TEM DE SER ALCANÇADO POR CÓDIGO ESCRITO À MÃO ═══
 *
 * ⚠️ O CENSO DO ENT03c ACHOU DOIS MODELOS MORTOS, e nenhum guard existente os via:
 * `ParecerContrato` e `CertidaoFornecedor` estão no schema, têm tabela no banco, têm
 * migration aplicada, têm enum próprio — e **nenhuma linha de código escrita à mão os
 * lê ou escreve**. As 57 ocorrências dos dois nomes no repositório estão TODAS em
 * `prisma/generated/`, que é saída do gerador.
 *
 * O modo de falha é o pior que este projeto tem: **a tabela parece atendimento**. Quem
 * abre o schema procurando "o sistema registra parecer jurídico?" acha `ParecerContrato`
 * com os quatro tipos certos e conclui que sim. O catálogo receberia a marcação errada, e
 * a marcação errada é o que faz o próximo lote NÃO construir o que falta.
 *
 * É literalmente a regra do prompt — "código que existe não é comportamento provado" —
 * promovida a teste.
 *
 * ⚠️ ALCANÇAR NÃO É ATENDER. Este teste prova o piso: alguém escreveu o nome do modelo
 * fora do gerador. Um modelo citado só num `limpar-banco.ts` passaria aqui e continuaria
 * sem caso de uso — por isso a lista de exceções abaixo separa os dois casos, e por isso
 * o censo do catálogo continua sendo leitura humana. O que este arquivo garante é que
 * ninguém acrescente uma tabela e vá embora.
 */

const RAIZ = resolve(import.meta.dirname, "..");

/**
 * Modelos que EXISTEM no schema e que o código à mão não alcança — com a decisão junto.
 *
 * ⚠️ ESTA LISTA DEVERIA ENCOLHER, NUNCA CRESCER. Cada linha é uma tabela que o banco
 * carrega e ninguém usa: ela custa migration, custa grant no papel de runtime e custa a
 * impressão de que o requisito está atendido.
 */
const SEM_CASO_DE_USO: Readonly<Record<string, string>> = {
  TipoLancamentoReceitaSagres:
    "ENT03c: schema sem caso de uso. A única menção fora de prisma/generated/ é a lista de " +
    "tabelas a truncar em test/limpar-banco.ts — que é string, não uso. Pendência " +
    "SCHEMA-SEM-CASO-DE-USO.",
  DeParaContaSiga:
    "ENT03c: schema sem caso de uso. O de-para de contas do leiaute SIGA (TCM-BA) não é " +
    "lido nem escrito por linha nenhuma — o adapter do TCM-BA resolve a conta por outro " +
    "caminho. Pendência SCHEMA-SEM-CASO-DE-USO.",
  DeParaFonteSiga:
    "ENT03c: schema sem caso de uso. Gêmeo do DeParaContaSiga, e com a mesma ausência. " +
    "Pendência SCHEMA-SEM-CASO-DE-USO.",
  ParecerContrato:
    "ENT03c: schema sem caso de uso. Os quatro tipos (jurídico, técnico, controle " +
    "interno, contábil) estão modelados e NADA escreve a tabela. Cláusulas 5.17.21 e " +
    "5.17.22 marcadas AUSENTE_CONFIRMADO por isso. Pendência SCHEMA-SEM-CASO-DE-USO.",
  CertidaoFornecedor:
    "ENT03c: schema sem caso de uso. Tipo, número, emissão e validade estão modelados, " +
    "com índice por validade — e nada escreve nem lê. As cláusulas de validade de " +
    "documento do fornecedor (5.17.87, 5.17.89, 5.17.90, 5.17.94) são AUSENTE_CONFIRMADO. " +
    "Pendência SCHEMA-SEM-CASO-DE-USO.",
};

/**
 * Modelos que o código ALCANÇA SEM NOMEAR — escritos por `create` ANINHADO a partir do pai.
 *
 * ⚠️ POR QUE ESTA LISTA É EXPLÍCITA E NÃO DEDUZIDA. A tentação é aceitar o NOME DO CAMPO de
 * relação (`opcoes`, `colunas`, `pareceres`) como prova de uso. Não serve: `pareceres`
 * aparece quatro vezes no repositório e NENHUMA é de `ParecerContrato` — são os pareceres do
 * PROCESSO, no M21. A dedução por nome de campo teria escondido justamente o achado que este
 * arquivo existe para dar. Colisão de nome é a regra, não a exceção.
 *
 * Cada linha nomeia o pai e o campo — quem ler pode conferir em um grep.
 */
const ESCRITO_POR_ANINHAMENTO: Readonly<Record<string, string>> = {
  CotacaoDePreco:
    "escrito por `cotacoes: { create: ... }` em registrarPesquisaDePrecos " +
    "(modules/m11-licitacoes/compras.ts); LIDO em estatisticasDaPesquisa pela relação " +
    "`cotacoes` do item da pesquisa — é dela que saem médio, mínimo e máximo",
  MembroDeComissaoPatrimonial:
    "escrito por `membros: { create: ... }` em cadastrarComissaoPatrimonial " +
    "(modules/m10-patrimonial/gestao-do-bem.ts) — a comissão e seus membros nascem no " +
    "mesmo ato, porque uma comissão sem membro não delibera",
  ItemDeTermoPatrimonial:
    "escrito por `itens: { create: ... }` em emitirTermoPatrimonial " +
    "(modules/m10-patrimonial/gestao-do-bem.ts) — o termo e os bens que ele entrega " +
    "nascem juntos, e um termo sem bem não entrega nada",
  OpcaoDeCampoAdicional:
    "escrito por `opcoes: { create: ... }` em modules/m25-campos-adicionais/servico.ts",
  ColunaDoModelo: "escrito por `colunas: { create: ... }` em modules/m26-designer/",
  TipoDeComunicadoPorSetor:
    "escrito por `setoresAutorizados: { create: ... }` em modules/m23-comunicacao/servico.ts",
  RequerenteAdicionalDoProcesso:
    "escrito por `requerentesAdicionais: { create: ... }` em modules/m21-protocolo/servico.ts",
  // ── V7 M2 U8 — a agenda e os formulários da fiscalização ──
  PerguntaDoFormularioDeOcorrencia:
    "escrita por `perguntas: { create: ... }` em publicarVersaoDoTipoDeOcorrencia " +
    "(modules/m11-licitacoes/formularios-de-ocorrencia.ts); LIDA pela relação `perguntas` da versão em " +
    "tiposDeOcorrenciaDoEnte e em conferirFormularioDaOcorrencia — a pergunta não existe fora da versão que a publicou",
  RespostaDoFormularioDeOcorrencia:
    "escrita por `respostas: { create: ... }` em registrarOcorrencia (modules/m11-licitacoes/fiscalizacao.ts), depois de " +
    "conferida por conferirFormularioDaOcorrencia; LIDA pela relação `respostas` da ocorrência — a resposta não existe " +
    "fora da ocorrência que a respondeu",
  // ── V7 B1 — o cadastro imobiliário e os parâmetros do tributo ──
  AtributoDaVersaoDoImovel:
    "escrito por `atributos: { create: ... }` em cadastrarImovel e publicarVersaoDoImovel " +
    "(modules/m34-tributario/cadastro-imobiliario.ts); LIDO pela relação `atributos` da versão em " +
    "montarVariaveis (simulacao.ts) — é de lá que saem as variáveis do ente para a fórmula. O " +
    "atributo não existe fora da versão que o declarou: uma versão do cadastro é uma fotografia, " +
    "e um atributo avulso não pertenceria a fotografia nenhuma",
  ParametroTributario:
    "escrito por `parametros: { create: ... }` em publicarTabelaDoTributo " +
    "(modules/m34-tributario/simulacao.ts); LIDO pela relação `parametros` da tabela em " +
    "tabelaVigente, que é o que a simulação consome. O parâmetro vale POR VIGÊNCIA, e fora da " +
    "tabela que o publicou ele não tem fundamento nem data — que é exatamente o que a regra " +
    "\"nenhum código no código\" exige dele",

  // ── V6 P2.3 — M33 folha ──
  FaixaDeContribuicao:
    "escrita por `faixas: { create: ... }` em cadastrarTabelaDeContribuicao " +
    "(modules/m33-folha/servico.ts); LIDA pela relação `faixas` da tabela em lerTabelas e na " +
    "porta — a faixa não existe fora da tabela que a publicou, e uma faixa avulsa não tem norma",
  FaixaIrrf:
    "escrita por `faixas: { create: ... }` em cadastrarTabelaIrrf (modules/m33-folha/servico.ts); " +
    "LIDA pela relação `faixas` da tabela — mesma razão da faixa de contribuição",
  RubricaDoGrupoDeEmpenho:
    "escrita por `rubricas: { create: ... }` em cadastrarGrupoDeEmpenhoDaFolha " +
    "(modules/m33-folha/apropriacao.ts); LIDA pela relação `rubricas` do grupo e pela relação " +
    "inversa `grupoDeEmpenho` da rubrica (é ela que responde 'esta rubrica já empenha em algum " +
    "grupo?'). A linha não existe fora do grupo que a declarou",
  // ── V11 V8.2 — cinco tabelas que o censo do `af32666` acusava e que SÃO aninhadas ──
  //
  // ⚠️ AS CINCO ESTAVAM NA LISTA DE ÓRFÃS POR OMISSÃO, NÃO POR AUSÊNCIA. Cada uma é escrita por
  // `create` aninhado e LIDA pela relação — o que faltava era alguém conferir e declarar. E a
  // conferência importou: em duas delas o nome do campo COLIDE com outra coisa do mesmo módulo
  // (`dependencias` é também o resultado de `analisarFormulaDaRubrica`, calculado da fórmula e
  // não lido do banco; `colunas` é também o do M26 designer), que é exatamente a armadilha que
  // o cabeçalho desta lista descreve.
  ColunaPublicadaDePessoal:
    "escrita por `colunas: { create: ... }` em cadastrarPoliticaDePublicacao " +
    "(modules/m13-transparencia/servico-politica-de-pessoal.ts); LIDA pela relação `colunas` da " +
    "política em lib/portas/pessoal-publico.ts e lib/portas/politica-de-pessoal.ts — são elas que " +
    "dizem o que pode ir ao portal. A coluna não existe fora da política que a autorizou: uma " +
    "coluna avulsa seria permissão de expor dado pessoal sem ato que a conceda",
  DependenciaDaVersaoDaRubrica:
    "escrita por `dependencias: { create: ... }` em cadastrarVersaoDeRubrica " +
    "(modules/m33-folha/versao-servico.ts); LIDA pela relação `dependencias` da versão em " +
    "lib/portas/versoes-da-rubrica.ts. ⚠️ NÃO CONFUNDIR com o `dependencias` de " +
    "`analisarFormulaDaRubrica`, que é CALCULADO da fórmula e não lido do banco — o campo tem o " +
    "mesmo nome e outra procedência",
  ResponsavelPeloLancamento:
    "escrita por `responsaveis: { create: ... }` em constituirLancamento " +
    "(modules/m34-tributario/lancamento.ts); LIDA por `responsaveis: { some: ... }` em " +
    "levantarCobertura (certidao.ts) — é ela que responde 'este lançamento é desta pessoa?'. A " +
    "responsabilidade é CONGELADA no lançamento: ler o vínculo vigente depois mudaria o passado",
  VencimentoDoLancamento:
    "escrita por `vencimentos: { create: ... }` em constituirLancamento " +
    "(modules/m34-tributario/lancamento.ts); LIDA pela relação `vencimentos` do lançamento na " +
    "projeção dele. A parcela não existe fora do lançamento que a constituiu",
  BaseConsultadaNaCertidao:
    "escrita por `cobertura: { create: ... }` em solicitarCertidao " +
    "(modules/m34-tributario/certidao.ts); LIDA na mesma função e na projeção da certidão — é a " +
    "lista do que FOI consultado, e é ela que impede a certidão afirmar mais do que olhou",
  ItemRecebidoDefinitivamente:
    "escrita por `itens: { create: ... }` em registrarRecebimentoDefinitivo (modules/m11-licitacoes/ordem-de-servico.ts, " +
    "V7 M2 U2); LIDA pelas relações `recebidos` do item medido (o elegível ao definitivo) e `itens` do recebimento (o valor " +
    "do termo). A linha não existe fora do recebimento que a declarou",
};

/**
 * Modelos que o código LÊ sem nomear — e que NINGUÉM ESCREVE, por um motivo declarado.
 *
 * ═══ ⚠️ POR QUE UMA TERCEIRA LISTA, E NÃO UMA DAS DUAS DE CIMA ═══
 * `SEM_CASO_DE_USO` diz "o código à mão não alcança"; `ESCRITO_POR_ANINHAMENTO` diz "é escrito
 * pelo pai". As tabelas abaixo não são nenhuma das duas: elas são LIDAS — o leitor existe,
 * escrito à mão, e funciona — e não têm escritor, porque a FONTE ainda não chegou.
 *
 * Enfiá-las em qualquer uma das outras duas seria escrever uma frase falsa numa lista de
 * exceções, e é isso que faz a próxima pessoa deixar de confiar em todas elas.
 *
 * ⚠️ E A LISTA TEM VIGILÂNCIA PRÓPRIA (o teste abaixo): no dia em que alguém escrever o
 * transcritor, a linha vira mentira em silêncio — porque um escritor aninhado não NOMEIA o
 * modelo, e o teste de "já não é aninhamento" não o pegaria.
 */
const LIDO_SEM_ESCRITOR: Readonly<Record<string, { readonly motivo: string; readonly campoDoPai: string }>> = {
  EventoDoLeiaute: {
    motivo:
      "LIDO por `include: { eventos: { include: { campos } } }` em consistenciaDoESocial " +
      "(lib/portas/esocial.ts), que alimenta a conferência de consistência do M14. NÃO É ESCRITO " +
      "por ninguém, e a razão está nomeada: `LEIAUTE-ESOCIAL-NAO-OBTIDO` — o leiaute oficial não " +
      "foi obtido, e transcrever um evento inventado seria pior que a ausência (o sistema " +
      "validaria contra uma regra que a União não publicou). A tabela existe para receber a " +
      "transcrição conferida por um humano, e o leitor já está pronto para o dia em que ela vier.",
    campoDoPai: "eventos",
  },
  CampoDoEvento: {
    motivo:
      "LIDO pela mesma consulta, um nível abaixo. Mesma ausência e mesma pendência do " +
      "`EventoDoLeiaute` — o campo não existe fora do evento que o declara.",
    campoDoPai: "campos",
  },
};

function arquivosDeSchema(): readonly string[] {
  const dir = join(RAIZ, "prisma", "schema");
  return readdirSync(dir)
    .filter((n) => n.endsWith(".prisma"))
    .map((n) => join(dir, n));
}

function modelosDoSchema(): readonly string[] {
  const nomes: string[] = [];
  for (const p of arquivosDeSchema()) {
    for (const linha of readFileSync(p, "utf8").split("\n")) {
      const m = /^model\s+([A-Za-z0-9_]+)\s*\{/.exec(linha);
      if (m?.[1] !== undefined) nomes.push(m[1]);
    }
  }
  return nomes;
}

function fontes(dir: string): readonly string[] {
  const achados: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      // ⚠️ `generated` FICA DE FORA, e é o ponto inteiro do teste: o gerador cita TODOS
      // os modelos, sempre. Incluí-lo faria este arquivo ficar verde para sempre.
      if (["node_modules", "generated", ".git", ".next"].includes(e.name)) continue;
      achados.push(...fontes(p));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(e.name)) continue;
    achados.push(p);
  }
  return achados;
}

const CORPO: string = [
  ...raizesExistentes(RAIZ, [...RAIZES_DE_ESCRITA]).flatMap((r) => fontes(r)),
  ...fontes(join(RAIZ, "prisma")),
]
  .filter((p) => !p.includes("modelo-sem-caso-de-uso"))
  .map((p) => somenteCodigo(readFileSync(p, "utf8")))
  .join("\n");

describe("modelo do schema sem caso de uso", () => {
  it("todo modelo é alcançado por código escrito à mão", () => {
    const orfaos: string[] = [];
    for (const modelo of modelosDoSchema()) {
      if (modelo in SEM_CASO_DE_USO) continue;
      if (modelo in ESCRITO_POR_ANINHAMENTO) continue;
      if (modelo in LIDO_SEM_ESCRITOR) continue;
      // O nome do modelo aparece capitalizado (tipos, `Prisma.X`) ou com inicial minúscula
      // (`tx.parecerContrato`). Qualquer uma das duas conta como alcance.
      const camel = modelo.charAt(0).toLowerCase() + modelo.slice(1);
      const achado = new RegExp(`\\b(${modelo}|${camel})\\b`).test(CORPO);
      if (!achado) orfaos.push(modelo);
    }

    expect(
      orfaos,
      "\n\n⚠️ MODELO NO SCHEMA QUE NENHUM CÓDIGO ALCANÇA.\n\n" +
        "Uma tabela sem caso de uso não é meio caminho andado — ela PARECE atendimento " +
        "para quem lê o schema procurando saber se o requisito existe, e é assim que uma " +
        "cláusula do catálogo recebe a marcação errada.\n\n" +
        "Ou escreva o caso de uso, ou remova o modelo, ou declare-o em `SEM_CASO_DE_USO` " +
        "COM a decisão e a pendência — nunca sem elas.\n\nModelos órfãos:\n"
    ).toEqual([]);
  });

  /**
   * ⚠️ E A LISTA DE EXCEÇÕES TAMBÉM É VIGIADA — no sentido de ENCOLHER. No dia em que
   * alguém escrever o caso de uso do parecer, a linha aqui vira mentira, e mentira numa
   * lista de exceções é o que faz a próxima pessoa não confiar em nenhuma delas.
   */
  /**
   * ⚠️ E A LISTA DO ANINHAMENTO TAMBÉM É VIGIADA — no sentido contrário. Se o modelo passar
   * a ser nomeado por código, a linha aqui vira ruído: ela diz "não procure, é aninhado",
   * e quem a lê deixa de procurar.
   */
  it("todo modelo do aninhamento continua sem ser nomeado por código", () => {
    const nomeados: string[] = [];
    for (const modelo of Object.keys(ESCRITO_POR_ANINHAMENTO)) {
      const camel = modelo.charAt(0).toLowerCase() + modelo.slice(1);
      if (new RegExp(`\\b(${modelo}|${camel})\\b`).test(CORPO)) {
        nomeados.push(`${modelo} (agora é nomeado — remova a linha de ESCRITO_POR_ANINHAMENTO)`);
      }
    }
    expect(nomeados, "\n\nAninhamentos que já não são aninhamentos:\n").toEqual([]);
  });

  /**
   * ⚠️ A LISTA DO "LIDO SEM ESCRITOR" SE VIGIA PELO ESCRITOR QUE AINDA NÃO EXISTE.
   *
   * O teste de "já não é aninhamento" olha se o modelo passou a ser NOMEADO — e não pegaria o
   * caso que aqui importa: alguém escrever o transcritor do leiaute por `create` aninhado, que
   * não nomeia nada. A linha continuaria dizendo "ninguém escreve" depois de alguém escrever.
   *
   * Então a vigilância é sobre o pai: se aparecer um `<campoDoPai>: { create`, a declaração
   * caducou e tem de mudar de lista.
   */
  it("todo modelo lido-sem-escritor continua sem escritor", () => {
    const comEscritor: string[] = [];
    for (const [modelo, d] of Object.entries(LIDO_SEM_ESCRITOR)) {
      const camel = modelo.charAt(0).toLowerCase() + modelo.slice(1);
      if (new RegExp(`\\b(${modelo}|${camel})\\b`).test(CORPO)) {
        comEscritor.push(`${modelo} (agora é NOMEADO por código — mova a linha para fora de LIDO_SEM_ESCRITOR)`);
        continue;
      }
      if (new RegExp(`${d.campoDoPai}\\s*:\\s*\\{\\s*create`).test(CORPO)) {
        comEscritor.push(
          `${modelo} (alguém passou a escrevê-lo por \`${d.campoDoPai}: { create\` — mova para ESCRITO_POR_ANINHAMENTO)`
        );
      }
    }
    expect(comEscritor, "\n\nDeclarações de 'lido sem escritor' que caducaram:\n").toEqual([]);
  });

  it("toda exceção declarada ainda é um modelo órfão de verdade", () => {
    const resolvidas: string[] = [];
    const inexistentes: string[] = [];
    const modelos = new Set(modelosDoSchema());
    for (const modelo of Object.keys(SEM_CASO_DE_USO)) {
      if (!modelos.has(modelo)) {
        inexistentes.push(`${modelo} (já não existe no schema — remova a exceção)`);
        continue;
      }
      const camel = modelo.charAt(0).toLowerCase() + modelo.slice(1);
      if (new RegExp(`\\b(${modelo}|${camel})\\b`).test(CORPO)) {
        resolvidas.push(
          `${modelo} (agora TEM código — remova a exceção e reavalie as cláusulas que ela cita)`
        );
      }
    }
    expect([...resolvidas, ...inexistentes], "\n\nExceções desatualizadas:\n").toEqual([]);
  });
});
