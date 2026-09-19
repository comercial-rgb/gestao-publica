import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { semComentarios, somenteCodigo } from "./prosa.js";
import { carregarPlanoOficial } from "../prisma/seed/oficial/pcasp-oficial.js";

/**
 * ═══ TODA CONTA CITADA NO CÓDIGO TEM DE EXISTIR NO PCASP OFICIAL ═══
 *
 * ⚠️ O QUE ESTE ARQUIVO MEDE, E POR QUE ELE SÓ FOI POSSÍVEL AGORA. Até o ENT04 não havia
 * contra o que conferir: o plano de contas do sistema eram 64 contas semeadas à mão, e o
 * próprio seed avisava que metade tinha vindo das FIXTURES e "pode estar errada". Com o
 * `Pcasp_2025.xlsx` do TCE-PB lido e conferido por sha256, existe uma TABELA REAL — e a
 * primeira coisa que se faz com uma tabela real é conferir o que se vinha usando.
 *
 * ═══ ⚠️ O QUE A PRIMEIRA MEDIÇÃO ENCONTROU ═══
 *
 * **A boa notícia primeiro: ZERO códigos inventados.** Os 70 códigos PCASP escritos no
 * código de produção existem, todos, no plano publicado. Nenhum lote anterior fabricou
 * código de conta — a disciplina segurou.
 *
 * **A má é de classificação, e é séria.** Confrontados os NOMES, o sistema opera contas que
 * no PCASP significam outra coisa:
 *
 *   · `1.1.1.1.2.00.00` o seed CHAMAVA "Bancos Conta Movimento" (repontado no ENT05); no PCASP é
 *     **"CAIXA E EQUIVALENTES DE CAIXA EM MOEDA NACIONAL - INTRA OFSS"** — a variante para
 *     transações ENTRE entes do mesmo orçamento fiscal e da seguridade. A conta bancária do
 *     município é `1.1.1.1.1.19.00`. Todo movimento de banco do sistema está numa conta
 *     intra-orçamentária;
 *   · `1.1.5.1.1.00.00` o seed chama "Almoxarifado"; no PCASP é **"MERCADORIAS PARA REVENDA
 *     OU DOAÇÃO"**. Almoxarifado é `1.1.5.6.x`;
 *   · `2.2.1.1.1.00.00` o seed chama "Dívida Fundada Interna"; no PCASP é **"PESSOAL A
 *     PAGAR - CONSOLIDAÇÃO"**. A dívida fundada é `2.2.2.x`;
 *   · `1.1.2.2.x` o seed chama "Créditos Tributários a Receber"; no PCASP é **"CLIENTES"**.
 *
 * ⚠️ **A CORREÇÃO NÃO FOI FEITA NESTE LOTE, E ISSO É UMA DECISÃO — NÃO UM ESQUECIMENTO.**
 * Trocar a conta de um roteiro muda lançamento JÁ GRAVADO: o saldo migra de conta sem que
 * exista movimento explicando a migração, e o balanço de dois exercícios deixa de fechar
 * entre si. É correção de eixo do mesmo peso que a do eixo de data, e como aquela precisa
 * de caracterização ANTES — o que cada conta hoje acumula, e para onde cada saldo vai.
 * Pendência **`PLANO-DE-CONTAS-FORA-DO-PCASP`**.
 *
 * O que este arquivo garante enquanto isso: **a lista não cresce**. Código novo que cite uma
 * conta inexistente, ou sintética, ou com nome divergente, falha aqui nomeando o arquivo.
 */

const RAIZ = resolve(import.meta.dirname, "..");

/** `1.1.1.1.2.00.00` — o formato do sistema, sete segmentos. */
const PADRAO_DE_CONTA = /\b\d\.\d\.\d\.\d\.\d\.\d{2}\.\d{2}\b/g;

const IGNORAR = new Set([
  "node_modules",
  ".next",
  ".git",
  "generated",
  ".registro-de-execucao",
  "docs",
  "CONTINGENCIA",
]);

/**
 * ⚠️ OS TESTES FICAM DE FORA, e é uma escolha com motivo. Uma fixture semeia as PRÓPRIAS
 * contas — `limparBanco` trunca `ContaPcasp` — então ela é internamente consistente mesmo
 * usando um código que produção não teria. Incluí-las encheria o relatório de ruído e
 * esconderia as ocorrências que importam: as que vão para o banco de verdade.
 */
function fontesDeProducao(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORAR.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      fontesDeProducao(p, acc);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(e.name)) continue;
    if (/\.test\.tsx?$/.test(e.name)) continue;
    // `test/` guarda helpers de fixture, que são tão "de teste" quanto os `.test.ts`.
    if (relative(RAIZ, p).startsWith("test/")) continue;
    acc.push(p);
  }
  return acc;
}

/**
 * As contas que o sistema usa e que são SINTÉTICAS no plano oficial — medido em 2026-09-11.
 *
 * ⚠️ ESTA LISTA DEVERIA ENCOLHER, NUNCA CRESCER. Sintética não recebe partida (INVARIANTE 5
 * do adapter). A maioria das entradas abaixo é ancestral de hierarquia semeada pelo
 * `prisma/seed/pcasp.ts` e nunca recebe lançamento — mas dez delas estão em ROTEIRO, e
 * essas são a pendência `PLANO-DE-CONTAS-FORA-DO-PCASP`.
 */
const SINTETICAS_TOLERADAS: ReadonlySet<string> = new Set([
  "1.0.0.0.0.00.00", "1.1.0.0.0.00.00", "1.1.1.0.0.00.00", "1.1.1.1.1.00.00",
  "1.1.2.0.0.00.00", "1.1.2.2.0.00.00", "1.1.2.2.1.00.00", "1.1.5.0.0.00.00",
  "1.1.5.1.1.00.00", "1.2.3.1.1.01.00", "1.2.3.2.1.01.00", "1.2.3.8.1.01.00",
  "2.0.0.0.0.00.00", "2.1.0.0.0.00.00", "2.1.1.0.0.00.00", "2.1.1.1.0.00.00",
  "2.1.3.0.0.00.00", "2.1.3.1.1.00.00", "2.1.8.0.0.00.00", "2.1.8.8.1.01.00",
  "2.2.0.0.0.00.00", "2.2.1.0.0.00.00", "2.2.1.1.1.00.00", "3.0.0.0.0.00.00",
  "3.3.0.0.0.00.00", "3.3.2.0.0.00.00", "3.3.3.1.1.00.00", "4.0.0.0.0.00.00",
  "4.1.0.0.0.00.00", "4.1.1.0.0.00.00", "4.5.9.1.1.00.00", "4.6.0.0.0.00.00",
  "4.6.4.0.0.00.00", "5.0.0.0.0.00.00", "5.2.0.0.0.00.00", "5.2.2.0.0.00.00",
  "5.2.2.1.0.00.00", "5.2.2.1.1.00.00", "5.2.2.1.2.00.00", "6.0.0.0.0.00.00",
  "6.2.0.0.0.00.00", "6.2.1.0.0.00.00", "6.2.2.0.0.00.00", "6.2.2.1.0.00.00",
  "6.2.2.1.2.00.00", "6.2.2.1.3.00.00", "7.0.0.0.0.00.00", "7.2.0.0.0.00.00",
  "7.2.1.0.0.00.00", "7.2.1.1.0.00.00", "8.0.0.0.0.00.00", "8.2.0.0.0.00.00",
  "8.2.1.0.0.00.00", "8.2.1.1.0.00.00", "8.2.1.1.1.00.00",
  // ── ENT05 (ITEM 3) — os nós de HIERARQUIA que o repontamento trouxe junto. ──
  // Eles entram no seed como PAIS das analíticas repontadas; nenhuma partida os toca.
  "1.1.2.1.0.00.00", "2.2.2.0.0.00.00",
]);

interface Uso {
  readonly codigo: string;
  readonly arquivos: readonly string[];
}

function usosNoCodigo(): readonly Uso[] {
  const mapa = new Map<string, Set<string>>();
  for (const f of fontesDeProducao(RAIZ)) {
    const texto = readFileSync(f, "utf8");
    for (const m of texto.matchAll(PADRAO_DE_CONTA)) {
      const atual = mapa.get(m[0]) ?? new Set<string>();
      atual.add(relative(RAIZ, f));
      mapa.set(m[0], atual);
    }
  }
  return [...mapa]
    .map(([codigo, arquivos]) => ({ codigo, arquivos: [...arquivos].sort() }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
}

describe("as contas do código contra o PCASP oficial", () => {
  const { contas, procedencia } = carregarPlanoOficial();
  const oficial = new Map(contas.map((c) => [c.codigo, c]));
  const usos = usosNoCodigo();

  it("a medição alcança o código de produção — e não está vazia por engano", () => {
    // ⚠️ SEM ISTO O ARQUIVO INTEIRO PASSA POR VACUIDADE. Um erro na varredura (um filtro a
    // mais, uma extensão a menos) deixaria zero usos e todos os testes verdes.
    expect(usos.length).toBeGreaterThan(50);
    expect(procedencia.arquivo).toBe("Pcasp_2025.xlsx");
  });

  it("⚠️ NENHUMA CONTA INVENTADA — toda conta citada existe no plano publicado", () => {
    const inexistentes = usos
      .filter((u) => !oficial.has(u.codigo))
      .map((u) => `${u.codigo} em ${u.arquivos.join(", ")}`);
    expect(
      inexistentes,
      "\n\n⚠️ CÓDIGO DE CONTA QUE NÃO EXISTE NO PCASP DO TCE-PB.\n\n" +
        "Um código inventado não é um detalhe de digitação: ele vira partida no razão, " +
        "entra no balancete e é rejeitado na remessa — depois de o exercício ter fechado " +
        "em cima dele. A conta certa se escolhe na tabela real (o plano tem 7.864), nunca " +
        "de memória.\n\nContas inexistentes:\n"
    ).toEqual([]);
  });

  it("⚠️ NENHUMA PARTIDA EM CONTA SINTÉTICA NOVA — a lista tolerada não cresce", () => {
    const novas = usos
      .filter((u) => {
        const o = oficial.get(u.codigo);
        return o !== undefined && !o.analitica && !SINTETICAS_TOLERADAS.has(u.codigo);
      })
      .map((u) => `${u.codigo} [${oficial.get(u.codigo)?.nome}] em ${u.arquivos.join(", ")}`);
    expect(
      novas,
      "\n\n⚠️ CONTA SINTÉTICA NOVA NO CÓDIGO.\n\n" +
        "Sintética não recebe partida (INVARIANTE 5 do adapter). Ela agrega as filhas; " +
        "lançar nela faz o balancete somar duas vezes o mesmo valor. Escolha a ANALÍTICA " +
        "correspondente no plano oficial.\n\nContas sintéticas novas:\n"
    ).toEqual([]);
  });

  it("a lista de sintéticas toleradas não guarda conta que deixou de ser sintética", () => {
    // ⚠️ NO SENTIDO DE ENCOLHER. Uma tolerância que virou mentira faz a próxima pessoa
    // desconfiar de todas as outras — foi o que aconteceu com a exceção obsoleta do
    // guard de data civil no ENT03c.
    const obsoletas = [...SINTETICAS_TOLERADAS].filter((c) => {
      const o = oficial.get(c);
      return o === undefined || o.analitica;
    });
    expect(
      obsoletas,
      "estas contas estão na lista de sintéticas toleradas e não são mais sintéticas " +
        "(ou sumiram do plano). Remova a linha."
    ).toEqual([]);
  });

  it("⚠️ AS QUATRO CONTAS REPONTADAS NO ENT05 SAÍRAM DO CÓDIGO DE PRODUÇÃO", () => {
    // ⚠️ A PENDÊNCIA `PLANO-DE-CONTAS-FORA-DO-PCASP` FOI QUITADA NO ENT05 (ITEM 3), e
    // este teste é o que impede que ela volte pela porta dos fundos.
    //
    // As quatro origens continuam EXISTINDO no plano oficial — elas são contas de
    // verdade, e o repontamento não as apaga. O que não pode voltar é o CÓDIGO DE
    // PRODUÇÃO apontar para elas como se fossem outra coisa.
    const origensRepontadas = [
      "1.1.1.1.2.00.00", // CAIXA E EQUIVALENTES — INTRA OFSS
      "1.1.5.1.1.00.00", // MERCADORIAS PARA REVENDA OU DOAÇÃO
      "2.2.1.1.1.00.00", // PESSOAL A PAGAR
      "1.1.2.2.0.00.00", // CLIENTES
    ];
    const aindaEmProducao = origensRepontadas.filter((c) => {
      const uso = usos.find((u) => u.codigo === c);
      if (uso === undefined) return false;
      // Fixture e teste podem citá-las (o repontamento tem de ser testável); o que não
      // pode é `prisma/seed/` e `modules/**` de produção.
      // ⚠️ PROSA NÃO É CÓDIGO — a mesma correção que o guard de tabela morta recebeu no
      // ENT04. Este repositório DOCUMENTA o repontamento: o cabeçalho do seed oficial, o
      // comentário do roteiro e a tabela de decisão citam as quatro origens pelo nome. Um
      // guard que acusasse a explicação do conserto ficaria vermelho por dizer a verdade.
      return uso.arquivos.some((a) => {
        if (a.includes(".test.") || a.includes("migracao-de-conta")) return false;
        const fonte = somenteCodigo(readFileSync(join(RAIZ, a), "utf8"));
        return fonte.includes(c);
      });
    });
    expect(
      aindaEmProducao,
      "\n\n⚠️ UMA CONTA REPONTADA VOLTOU AO CÓDIGO DE PRODUÇÃO.\n\n" +
        "O ENT05 mediu que estas quatro apontavam para conceitos diferentes do que o " +
        "sistema chama, e moveu o saldo com `repontarConta` — um lançamento que EXPLICA " +
        "a mudança. Reintroduzi-las no seed ou num módulo faz o sistema voltar a lançar " +
        "no lugar errado, agora sobre um saldo que já foi migrado.\n\nOnde voltou:\n"
    ).toEqual([]);
  });

  // ═════════════════════════════════════════════════════════════════════════════════════
  // ⚠️ A PERNA DE PARTIDA — a medição que faltava, e que custou uma instalação quebrada.
  //
  // Os testes acima medem CÓDIGOS CITADOS em arquivo de produção, e toleram 57 sintéticas
  // porque a maioria é ancestral de hierarquia semeada e nunca recebe lançamento. Essa
  // tolerância é correta para ancestral — e foi ela que escondeu `8.2.1.1.1.00.00`, que
  // NÃO é ancestral: é perna de roteiro, recebe partida em toda arrecadação e todo empenho.
  //
  // Medido em 2026-09-19, em instalação limpa com o plano oficial: `empenhar` recusava com
  // "Conta sintética não recebe partida". Nos bancos de trabalho nada aparecia, porque eles
  // nasciam clonados e o plano MÍNIMO marcava aquela conta como analítica.
  //
  // ⚠️ PROPRIEDADE, NÃO PADRÃO. Não se enumera arquivo de roteiro nem nome de constante: o
  // que se procura é a FORMA de uma perna — `{ conta: <algo>, tipo: "DEBITO"|"CREDITO" }` —
  // onde quer que ela esteja escrita. Literal ou constante, em M01 ou em M08, a perna é
  // achada e a conta tem de aceitar partida. Uma perna nova num módulo novo entra na
  // medição sozinha.
  // ═════════════════════════════════════════════════════════════════════════════════════

  /**
   * As contas que ESTÃO EM PERNA DE ROTEIRO e continuam sintéticas no plano oficial.
   *
   * ⚠️ ESTA LISTA SÓ ENCOLHE. Cada entrada é uma operação que a instalação limpa RECUSA, e
   * o valor é a pendência que diz o que falta decidir — nenhuma delas se resolve escolhendo
   * uma filha de nome parecido.
   */
  const EM_PERNA_DE_ROTEIRO: Readonly<Record<string, string>> = {
    "5.2.2.1.2.00.00": "ROTEIRO-CREDITO-ADICIONAL-POR-TIPO",
    "6.2.2.1.2.00.00": "ROTEIRO-RESERVA-SEM-CONTA",
    "7.2.1.1.0.00.00": "CONTROLE-DDR-POR-NATUREZA-DA-FONTE",
    "2.1.8.8.1.01.00": "CONSIGNACAO-CONTA-SINTETICA",
  };

  /**
   * As chaves que carregam uma conta para dentro de uma partida. São DUAS formas hoje:
   * `{ conta: X, tipo: "DEBITO" }` (a perna do `RoteiroContabil`) e `{ debito: X, credito: Y }`
   * (o par do roteiro orçamentário, que o seed grava em `contaDebitoId`/`contaCreditoId`).
   *
   * ⚠️ E ENUMERAR FORMA É JUSTAMENTE O QUE FALHA — a primeira versão deste teste conhecia só
   * `conta:` e perdeu as cinco pernas do roteiro orçamentário inteiro. Por isso a forma NÃO é
   * a única medida: logo abaixo, `NAO_E_PERNA` obriga a classificar TODA constante de conta
   * do sistema. Uma forma nova aparece como constante que a colheita não alcança, e o teste
   * cobra a classificação em vez de passar por omissão.
   */
  const CHAVES_DE_PERNA = [
    // a perna do `RoteiroContabil`, e o par do roteiro orçamentário
    "conta", "debito", "credito",
    // os PARÂMETROS por onde um roteiro recebe a conta de quem o chama. Foi esta família que
    // a primeira versão não conhecia, e foi por ela que `2.1.3.1.1.00.00` entrou em CINCO
    // arquivos — quatro em `lib/portas/`, um em `prisma/seed/poc-fila.ts`.
    "obrigacaoAPagar", "disponibilidade", "variacaoDiminutiva", "variacaoAumentativa",
    "creditoEmpenhado", "creditoLiquidado", "creditoPago", "contaDisponibilidade",
    // a conta de passivo de uma consignação: a retenção credita nela no meio do pagamento
    "contaPassivo", "contaConsignacaoAPagar",
  ] as const;
  const PERNA = new RegExp(
    `\\b(?:${CHAVES_DE_PERNA.join("|")}):\\s*(?:"(\\d\\.\\d\\.\\d\\.\\d\\.\\d\\.\\d{2}\\.\\d{2})"|([A-Z][A-Z0-9_]{3,}))`,
    "g"
  );

  /** `export const CONTA_X = "..."` de qualquer fonte de produção. */
  const DECLARACAO = /\bconst\s+([A-Z][A-Z0-9_]{3,})\s*=\s*"(\d\.\d\.\d\.\d\.\d\.\d{2}\.\d{2})"/g;

  interface Perna {
    readonly codigo: string;
    readonly origem: string;
    readonly arquivo: string;
  }

  function pernasDeRoteiro(): readonly Perna[] {
    const fontes = fontesDeProducao(RAIZ).map((f) => ({
      arquivo: relative(RAIZ, f),
      // ⚠️ `semComentarios`, NÃO `somenteCodigo`. O segundo ESVAZIA todo literal de string —
      // e o código de uma conta mora dentro de um literal. A primeira versão deste teste
      // usava `somenteCodigo` e colheu ZERO pernas; quem contou foi o teste de vacuidade
      // logo abaixo, e é exatamente para isso que ele existe. A prosa continua fora: o
      // comentário que EXPLICA a conta não é perna.
      texto: semComentarios(readFileSync(f, "utf8")),
    }));

    // ⚠️ A RESOLUÇÃO É POR ARQUIVO PRIMEIRO, E ISSO NÃO É ZELO — É UM DEFEITO MEDIDO. A
    // primeira versão mantinha UM mapa nome→código para toda a produção, e `CONTA_BANCOS`
    // existe com DOIS valores (`1.1.1.1.2.00.00` em `lib/portas/importadores.ts`,
    // `1.1.1.1.1.19.00` nos seeds): o último a ser lido sobrescrevia o outro, e uma perna
    // real era resolvida para a conta errada. Cada arquivo resolve com a sua própria
    // declaração; só quando o nome não é declarado ali se recorre ao mapa global, e apenas
    // se o nome for inequívoco em todo o sistema.
    const porArquivo = new Map<string, Map<string, string>>();
    const globais = new Map<string, Set<string>>();
    for (const { arquivo, texto } of fontes) {
      const local = new Map<string, string>();
      for (const m of texto.matchAll(DECLARACAO)) {
        local.set(m[1]!, m[2]!);
        const vistos = globais.get(m[1]!) ?? new Set<string>();
        vistos.add(m[2]!);
        globais.set(m[1]!, vistos);
      }
      porArquivo.set(arquivo, local);
    }

    const achadas: Perna[] = [];
    for (const { arquivo, texto } of fontes) {
      const local = porArquivo.get(arquivo)!;
      for (const m of texto.matchAll(PERNA)) {
        const literal = m[1];
        if (literal !== undefined) {
          achadas.push({ codigo: literal, origem: `"${literal}"`, arquivo });
          continue;
        }
        const nome = m[2]!;
        const daqui = local.get(nome);
        if (daqui !== undefined) {
          achadas.push({ codigo: daqui, origem: nome, arquivo });
          continue;
        }
        const vistos = globais.get(nome);
        // Nome com mais de um valor não se resolve por adivinhação: a perna fica sem código,
        // e a constante aparece como não classificada — que é onde ela tem de aparecer.
        if (vistos !== undefined && vistos.size === 1) {
          achadas.push({ codigo: [...vistos][0]!, origem: nome, arquivo });
        }
      }
    }
    return achadas;
  }

  /**
   * ⚠️ O ESPELHO DA FORMA, E ELE EXISTE PORQUE A FORMA JÁ FALHOU DUAS VEZES NESTE ARQUIVO.
   *
   * `PERNA` conhece um punhado de chaves. Uma delas — `obrigacaoAPagar:`, por onde o roteiro
   * de liquidação recebe a conta do credor — passou despercebida na primeira versão, e com
   * ela `2.1.3.1.1.00.00` ficou escrita em CINCO arquivos apontando para um nó sintético. O
   * percurso da ponte contratual foi quem acusou, no meio da liquidação, depois de a medição
   * e o recebimento já terem passado pela tela.
   *
   * Então a forma não é a única medida. Aqui se classifica TODA constante de produção que
   * guarda um código PCASP: ou o código aparece numa perna colhida, ou está declarado abaixo
   * com o motivo. Uma chave nova que a colheita não conheça aparece como constante
   * inalcançada, e o teste cobra a classificação — em vez de passar por omissão.
   */
  const NAO_E_PERNA: Readonly<Record<string, string>> = {
    "6.2.2.1.3.02.00":
      "CREDITO EMPENHADO EM LIQUIDAÇÃO — o estado que este sistema NÃO usa. A constante " +
      "existe para `m01-roteiros.test.ts` afirmar que ela não aparece no roteiro: a " +
      "liquidação vai direto de EMPENHADO A LIQUIDAR para LIQUIDADO A PAGAR.",
    "1.2.3.1.1.01.00":
      "declarada no plano do cenário SAGRES (`codigo:`), e nenhum roteiro dele a usa — a " +
      "POC exercita despesa e extraorçamentário, não patrimonial.",
    "1.2.3.2.1.01.00": "idem — plano do cenário SAGRES, sem roteiro que a use.",
    "1.2.3.8.1.01.00": "idem — plano do cenário SAGRES, sem roteiro que a use.",
    "3.3.3.1.1.00.00": "idem — plano do cenário SAGRES, sem roteiro que a use.",
    "4.5.9.1.1.00.00": "idem — plano do cenário SAGRES, sem roteiro que a use.",
  };

  /**
   * ⚠️ PERNA QUE A REGEX NÃO LÊ, E QUE MESMO ASSIM É CONFERIDA. Uma conta pode chegar ao
   * roteiro sem passar por chave nenhuma — pela TABELA de contrapartida por elemento, por
   * exemplo. Declarar isso como "não é perna" seria classificar para calar; declarar aqui
   * mantém a conta sob a mesma exigência de aceitar partida, e diz por onde ela chega.
   */
  const PERNA_INDIRETA: Readonly<Record<string, string>> = {
    "1.1.5.6.1.01.00":
      "CONTA_ESTOQUE chega a `variacaoDiminutiva` pela tabela CONTRAPARTIDA_DA_LIQUIDACAO " +
      "(elemento 30 → estoque), em `modules/m01-core-contabil/roteiros.ts`.",
  };

  function constantesDeConta(): ReadonlyMap<string, readonly string[]> {
    const mapa = new Map<string, Set<string>>();
    for (const f of fontesDeProducao(RAIZ)) {
      const arquivo = relative(RAIZ, f);
      const texto = semComentarios(readFileSync(f, "utf8"));
      for (const m of texto.matchAll(DECLARACAO)) {
        const atual = mapa.get(m[2]!) ?? new Set<string>();
        atual.add(`${m[1]!} em ${arquivo}`);
        mapa.set(m[2]!, atual);
      }
    }
    return new Map([...mapa].map(([k, v]) => [k, [...v].sort()]));
  }

  const pernas = pernasDeRoteiro();

  it("a medição alcança as pernas de roteiro — e não está vazia por engano", () => {
    // ⚠️ SEM ISTO O TESTE SEGUINTE PASSA POR VACUIDADE. Um `somenteCodigo` mais agressivo,
    // uma vírgula a mais na regex, e zero pernas viram zero defeitos.
    const codigos = new Set(pernas.map((p) => p.codigo));
    expect(pernas.length).toBeGreaterThan(40);
    expect(codigos.size).toBeGreaterThan(15);
    // A perna tem de ser achada nas DUAS formas, ou metade da medição está morta.
    expect(pernas.some((p) => p.origem.startsWith('"')), "nenhuma perna LITERAL achada").toBe(true);
    expect(pernas.some((p) => !p.origem.startsWith('"')), "nenhuma perna por CONSTANTE achada").toBe(true);
    // E tem de alcançar módulo fora do M01 — o M08 escreve as suas pernas em literal.
    expect(pernas.some((p) => !p.arquivo.includes("m01-core-contabil"))).toBe(true);
  });

  it("⚠️ TODA PERNA DE ROTEIRO APONTA PARA CONTA QUE ACEITA PARTIDA", () => {
    const recusadas = [...new Set(
      pernas
        .filter((p) => {
          const o = oficial.get(p.codigo);
          return o !== undefined && !o.analitica && EM_PERNA_DE_ROTEIRO[p.codigo] === undefined;
        })
        .map((p) => `${p.codigo} (${p.origem}) em ${p.arquivo} -> ${oficial.get(p.codigo)?.nome}`)
    )].sort();
    expect(
      recusadas,
      "\n\n⚠️ PERNA DE ROTEIRO EM CONTA SINTÉTICA — A INSTALAÇÃO LIMPA VAI RECUSAR.\n\n" +
        "Sintética não recebe partida (INVARIANTE 5 do adapter). Em banco clonado isto não " +
        "aparece, porque o plano mínimo mente sobre a `analitica`; em instalação nova com o " +
        "plano oficial o caso de uso para, e o operador vê 'Conta sintética não recebe " +
        "partida'.\n\nA conta certa é a ANALÍTICA do ramo, escolhida na partição do plano — " +
        "nunca a de nome mais parecido. Se a partição depender de um dado que o roteiro não " +
        "lê (o tipo do crédito, a natureza da fonte), então NÃO se escolhe conta: registra-se " +
        "a pendência em EM_PERNA_DE_ROTEIRO e o movimento continua recusado.\n\nPernas:\n"
    ).toEqual([]);
  });

  it("⚠️ TODA CONSTANTE DE CONTA OU É PERNA COLHIDA, OU ESTÁ CLASSIFICADA", () => {
    const constantes = constantesDeConta();
    const emPerna = new Set(pernas.map((p) => p.codigo));
    const semClassificacao = [...constantes]
      .filter(
        ([codigo]) =>
          !emPerna.has(codigo) &&
          NAO_E_PERNA[codigo] === undefined &&
          PERNA_INDIRETA[codigo] === undefined
      )
      .map(([codigo, onde]) => `${codigo} (${onde.join("; ")})`)
      .sort();
    expect(
      semClassificacao,
      "\n\n⚠️ CONSTANTE DE CONTA QUE A COLHEITA DE PERNAS NÃO ALCANÇA.\n\n" +
        "Ou ela chega ao razão por uma chave que `PERNA` ainda não conhece — e então a " +
        "colheita está cega, como esteve para `obrigacaoAPagar:` —, ou ela não é perna e o " +
        "motivo precisa estar escrito em NAO_E_PERNA.\n\nNão classifique para calar: " +
        "confira primeiro se a constante vira partida em algum roteiro.\n\nConstantes:\n"
    ).toEqual([]);
    // Anti-vacuidade: se a varredura de constantes voltar vazia, o teste acima passa sozinho.
    expect(constantes.size).toBeGreaterThan(15);
  });

  it("⚠️ A PERNA INDIRETA TAMBÉM ACEITA PARTIDA", () => {
    const recusadas = Object.keys(PERNA_INDIRETA).filter((c) => {
      const o = oficial.get(c);
      return o !== undefined && !o.analitica && EM_PERNA_DE_ROTEIRO[c] === undefined;
    });
    expect(
      recusadas,
      "\n\n⚠️ PERNA INDIRETA EM CONTA SINTÉTICA. Chegar por tabela em vez de por chave não " +
        "muda nada para o INVARIANTE 5: o lançamento é recusado igual.\n\n"
    ).toEqual([]);
  });

  it("nenhuma conta está classificada duas vezes", () => {
    // ⚠️ Duas licenças para a mesma conta é como uma some sem ninguém notar.
    const dobradas = Object.keys(NAO_E_PERNA).filter((c) => PERNA_INDIRETA[c] !== undefined);
    expect(dobradas, "\n\nconta em NAO_E_PERNA e em PERNA_INDIRETA ao mesmo tempo\n\n").toEqual([]);
  });

  it("a classificação NAO_E_PERNA não guarda conta que virou perna", () => {
    const emPerna = new Set(pernas.map((p) => p.codigo));
    const obsoletas = Object.keys(NAO_E_PERNA).filter((c) => emPerna.has(c));
    expect(
      obsoletas,
      "\n\n⚠️ ENTRADA DE NAO_E_PERNA QUE A COLHEITA JÁ ACHA COMO PERNA.\n\nA justificativa " +
        "de 'não é perna' deixou de valer: remova a entrada.\n\n"
    ).toEqual([]);
  });

  it("a lista de pendências de perna não guarda conta que já aceita partida", () => {
    // O espelho: quando a decisão sair e a perna descer para a analítica, a entrada some.
    const resolvidas = Object.keys(EM_PERNA_DE_ROTEIRO).filter((c) => {
      const o = oficial.get(c);
      return o === undefined || o.analitica;
    });
    expect(
      resolvidas,
      "\n\n⚠️ ENTRADA OBSOLETA EM EM_PERNA_DE_ROTEIRO.\n\nEstas contas aceitam partida no " +
        "plano oficial (ou saíram dele): a pendência correspondente não existe mais.\n\n"
    ).toEqual([]);
  });

  it("toda pendência declarada continua SENDO usada por alguma perna", () => {
    // ⚠️ NÃO ATESTAR PELA PAPELADA. Uma entrada que ninguém mais usa vira licença guardada:
    // alguém reintroduz a perna anos depois e a lista a perdoa em silêncio.
    const citadas = new Set(pernas.map((p) => p.codigo));
    const orfas = Object.keys(EM_PERNA_DE_ROTEIRO).filter((c) => !citadas.has(c));
    expect(
      orfas,
      "\n\n⚠️ PENDÊNCIA DE PERNA QUE NENHUMA PERNA USA.\n\nA conta saiu dos roteiros: " +
        "remova a entrada, ou a lista passa a perdoar uma perna futura sem ninguém decidir.\n\n"
    ).toEqual([]);
  });

  it("as quatro origens continuam com o NOME oficial que o censo mediu", () => {
    // Elas não somem do plano: são contas reais. O que muda é para onde a produção aponta.
    const divergencias: Record<string, string> = {
      "1.1.1.1.2.00.00": "CAIXA E EQUIVALENTES DE CAIXA EM MOEDA NACIONAL - INTRA OFSS",
      "1.1.5.1.1.00.00": "MERCADORIAS PARA REVENDA OU DOAÇÃO - CONSOLIDAÇÃO",
      "2.2.1.1.1.00.00": "PESSOAL A PAGAR- CONSOLIDAÇÃO",
      "1.1.2.2.0.00.00": "CLIENTES",
    };
    for (const [codigo, nomeOficial] of Object.entries(divergencias)) {
      expect(oficial.get(codigo)?.nome, `o nome oficial de ${codigo} mudou`).toBe(nomeOficial);
    }
  });
});
