import "dotenv/config";
import type { Browser, Page } from "puppeteer";
import { apresentacaoDoAto } from "./percursos-disponibilidade.js";
import {
  barrado,
  entrar,
  hrefDoRegistro,
  irPara,
  lancarNavegadorDoPercurso,
  preencherEEnviar,
  registroDePassos,
  sair,
  texto,
  type Navegador,
} from "./percursos-navegador.js";

/**
 * ═══ PERCURSO DA FOLHA MENSAL COMPLEMENTAR (M33, V11 V9.4 — TR 5.12.50) ═══
 *
 * A unidade anterior (`0b70809`) construiu e MEDIU a complementar pelo banco: tipos 0/0/0, 27/27
 * dirigidos, oito mutações com oito acusações, banco isolado com sondas de efeito. O que nunca
 * aconteceu foi percurso de NAVEGADOR — e é exatamente a faixa em que a V11 V9.2 achou quatro
 * defeitos de interface que 262 testes verdes não pegaram.
 *
 * ⚠️ ESTE ARQUIVO NASCEU VERMELHO, DE PROPÓSITO, E ISSO É A PROVA DELE. Cinco defeitos foram
 * achados por LEITURA DE FONTE antes de existir percurso. Consertá-los primeiro deixaria um
 * percurso verde e NENHUMA evidência de que ele teria pegado alguma coisa — a mesma classe da
 * guarda que nasce inerte e da mutação que não acusa, que esta empreitada já pagou. A ordem é:
 * rodar contra o artefato `6fa0d62` SEM conserto nenhum, colher o vermelho, consertar,
 * reconstruir, rodar de novo. O par vermelho→verde é a entrega, e está no `ESTADO-EXECUCAO.md`.
 *
 * ⚠️ O QUE SÓ A TELA ALCANÇA, e é por isso que este arquivo existe:
 *   · a modalidade é ENCONTRÁVEL? Se o operador não acha o tipo, a capacidade não existe para ele;
 *   · a MEMÓRIA por rubrica diz de ONDE vem cada delta — no documento que o servidor lê, não no
 *     JSON do banco;
 *   · a recusa da diferença NEGATIVA ORIENTA quem a recebe, em vez de despejar arquitetura;
 *   · e a pergunta que manda nesta rodada: alguma tela, rótulo, memória ou documento afirma
 *     PAGAMENTO, OBRIGAÇÃO ou QUITAÇÃO que o sistema não verificou? Esta empreitada já pegou uma
 *     memória lacrada dizendo "1ª parcela já PAGA" quando o único fato verificado era o
 *     FECHAMENTO. O que a complementar verifica é o MESMO e só ele:
 *     `FolhaDePagamento.fechamento !== null`. Certificação, empenho, liquidação e pagamento NÃO
 *     são consultados em lugar nenhum de `calcularFolhaComplementarNaTx` — logo, nenhuma
 *     superfície dela pode afirmá-los.
 *
 * ═══ OS TRÊS ESTADOS QUE ESTE PERCURSO MANTÉM SEPARADOS ═══
 *   APURADO    — há cálculo e a folha FECHOU. É o único fato que a complementar consulta.
 *   CONSTITUÍDA— a obrigação existe: houve `apropriar` (empenho) e `liquidar`. NENHUM dos dois
 *                acontece neste roteiro.
 *   PAGO       — o dinheiro saiu, e o pagamento nem é ato do M33.
 * Toda asserção com ⚠️ sobre pagamento existe para impedir que uma superfície pule dois degraus.
 *
 * ═══ OS PAPÉIS, E POR QUE SÃO ESTES ═══
 *   rh@             cadastra rubricas e tabelas, admite, lança, ABRE e CALCULA
 *   contabilidade@  FECHA (é o fechamento que arma a complementar da competência)
 *   tesouraria@     NÃO tem `CONSULTAR_FOLHA` — é o ator NEGATIVO da leitura, e a negativa é do
 *                   SERVIDOR (`exigirLeitura`), não de um botão escondido
 *
 * ⚠️ A PROVENIÊNCIA DO ATOR NEGATIVO FOI CONFERIDA ANTES DE CONFIAR NO PAR. Nenhuma identidade do
 * censo das FIXTURES serviria: `semearUsuariosDeTeste` cria `ADMIN` com `TODAS_AS_ACOES` e o
 * vincula a todas elas. Aqui o censo é OUTRO — `percursos-usuarios-por-papel.ts` cria perfis
 * RESTRITOS — e `tesouraria@` tem `CONSULTAR_DESPESA`, `CONSULTAR_RECEITA`, `CONSULTAR_FINANCEIRO`
 * e `CONSULTAR_CADASTROS`, e NÃO tem `CONSULTAR_FOLHA`. Sem essa conferência o par provaria menos
 * do que afirma.
 *
 * ═══ ⚠️ BANCO CLONADO POR EXECUÇÃO — NÃO É PREFERÊNCIA ═══
 * A complementar recalcula a competência inteira, sobre TODOS os vínculos vivos: no banco
 * compartilhado dos percursos, uma matrícula alheia sem regime ou sem vencimento derruba o
 * cálculo INTEIRO, e o vermelho não é deste percurso. Uso:
 *
 *   PERCURSO_BANCO=gestao_publica_percursos_v7m1_compl_<sha> PERCURSO_PORTA=3012 \
 *     npm run percursos:servir          (no diretório do ARTEFATO, nunca na árvore de edição)
 *   PERCURSO_BANCO=... npx tsx scripts/trinco-de-maquina.ts 'percurso da complementar' -- \
 *     npx tsx scripts/smoke-complementar-da-folha.ts http://localhost:3012
 *
 * ⚠️ IDEMPOTÊNCIA: `@@unique([competencia, tipo])` dá UMA folha de cada tipo por competência.
 * Reexecutar no mesmo ANO é RECONHECIDO e PULADO COM AVISO (saída 4, distinta do verde e do
 * vermelho): nunca falhar sem motivo, nunca passar em silêncio. Para rodar de novo de verdade:
 *   COMPLEMENTAR_ANO=2029 npx tsx scripts/smoke-complementar-da-folha.ts <base>
 *
 * ⚠️ TODOS OS VALORES SÃO SINTÉTICOS. A contribuição de 10% linear e o IRRF zerado existem para
 * tornar o par determinístico; não afirmam norma de ente nenhum.
 */
const N: Navegador = { base: process.argv[2] ?? "http://localhost:3010" };
const SENHA = process.env["PERCURSOS_SENHA_PAPEIS"] ?? "Percurso#2026";
const RH = "rh@percursos.local";
const CONTABILIDADE = "contabilidade@percursos.local";
const TESOURARIA = "tesouraria@percursos.local";

const ANO = Number(process.env["COMPLEMENTAR_ANO"] ?? "2028");
const SUF = String(ANO).slice(-2);
/** A competência do caminho POSITIVO: mensal fechada, achado, complementar, recálculo, fechamento. */
const COMP = `${ANO}-05`;
/** A competência do caminho NEGATIVO: o correto passa a ser MENOR que o já apurado. */
const COMP_NEG = `${ANO}-06`;
/** A competência sem mensal nenhuma — a recusa que impede pagar o mês duas vezes. */
const COMP_SEM_MENSAL = `${ANO}-09`;

/** Saída 4 = pulado com aviso. Nem verde (não provou nada) nem vermelho (não há defeito). */
const SAIDA_PULADO = 4;
/** Saída 3 = bloqueio de AMBIENTE, antes do primeiro clique. */
const SAIDA_AMBIENTE = 3;

const R = registroDePassos();
/**
 * ⚠️ CONTADOR PRÓPRIO DO QUE NÃO RODOU. `registroDePassos` só conta ok e falha. Somar um passo não
 * executado aos verdes mentiria; somá-lo às falhas culparia o produto por um estado que ele talvez
 * recuse de propósito. "Passo pulado é passo que não aconteceu" — então ele tem linha própria.
 */
const naoExecutados: string[] = [];
function naoExecutado(passo: string, motivo: string): void {
  naoExecutados.push(`${passo} — ${motivo}`);
  console.error(`[NAO EXECUTADO] ${passo} — ${motivo}`);
}
function nota(t: string): void {
  console.log(`      [${t}]`);
}

/**
 * ⚠️ O PAR N=2 É DESIGUAL DE PROPÓSITO, E A DESIGUALDADE É A PROVA.
 * M-1 ganha o achado no cálculo nº 1; M-2 só no nº 2. Com uma matrícula só, "o recálculo repete o
 * já reconhecido" e "o recálculo absorve o segundo achado" seriam indistinguíveis — e "quem não
 * tem diferença não vira contracheque" passaria por vacuidade.
 */
const M1 = `CPL1-${SUF}`;
const M2 = `CPL2-${SUF}`;
const NOME_M1 = `Complementar A ${SUF}`;
const NOME_M2 = `Complementar B ${SUF}`;

/**
 * CPF sintético COM dígito verificador.
 * ⚠️ O cadastro único valida o DV, e onze dígitos quaisquer são recusados — foi o que fez a
 * primeira corrida do percurso do 13º não criar ninguém e falhar sete telas adiante.
 * ⚠️ `PERCURSOS-SEM-HELPER-COMUM`: esta é a quarta cópia (`smoke-folha.ts`,
 * `smoke-portal-do-servidor.ts`, `smoke-decimo-terceiro.ts`). O lugar dela é
 * `percursos-navegador.ts`, que é de outra frente e não se toca nesta rodada. Fica nomeado, não
 * escondido.
 */
function cpfFicticio(semente: string): string {
  const base = `${semente.replace(/\D/g, "")}000000000`.slice(0, 9).split("").map(Number);
  const dv = (ds: readonly number[], peso: number): number => {
    const soma = ds.reduce((acc, d, i) => acc + d * (peso - i), 0);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(base, 10);
  const d2 = dv([...base, d1], 11);
  return `${base.join("")}${d1}${d2}`;
}

/** O texto de uma opção de `select` que casa com um trecho — devolve o `value`. */
async function opcaoQueCasa(page: Page, seletor: string, trecho: string): Promise<string> {
  return page.evaluate(
    (sel, t) => {
      const s = document.querySelector(sel);
      if (!(s instanceof HTMLSelectElement)) return "";
      const o = Array.from(s.options).find((x) => x.textContent?.includes(t) === true);
      return o?.value ?? "";
    },
    seletor,
    trecho
  );
}

/** Os textos de todas as opções de um `select` — é com isso que se confere um RECORTE. */
async function opcoesDe(page: Page, seletor: string): Promise<readonly string[]> {
  return page.evaluate((sel) => {
    const s = document.querySelector(sel);
    if (!(s instanceof HTMLSelectElement)) return [] as string[];
    return Array.from(s.options).map((o) => (o.textContent ?? "").trim());
  }, seletor);
}

/**
 * O texto do RÓTULO de um campo — o que o operador lê ANTES de escolher, ajuda incluída.
 * ⚠️ Devolve "" quando o campo não existe, e TODA asserção sobre ele exige não-vazio: "o rótulo
 * não diz 'já pago'" é trivialmente verdadeiro quando não há rótulo nenhum. Instrumento verde por
 * não achar o que vigia é pior que instrumento nenhum.
 */
async function rotuloDoCampo(page: Page, form: string, campo: string): Promise<string> {
  return page.evaluate(
    (f, c) => {
      const el = document.querySelector(`${f} [name="${c}"]`);
      if (el === null) return "";
      const rotulo = el.closest("label") ?? el.parentElement;
      return (rotulo?.textContent ?? "").replace(/\s+/g, " ").trim();
    },
    form,
    campo
  );
}

/** O href do contracheque de uma matrícula, lido da linha da tabela da folha. */
async function hrefDoContracheque(page: Page, matricula: string): Promise<string> {
  return page.evaluate((mat) => {
    const linha = Array.from(document.querySelectorAll("tbody tr")).find((tr) => (tr.textContent ?? "").includes(mat));
    return (linha?.querySelector('a[href*="/contracheque/"]') as HTMLAnchorElement | null)?.getAttribute("href") ?? "";
  }, matricula);
}

/**
 * O valor e a memória de UMA linha do contracheque, pelo `data-linha` do código da rubrica.
 *
 * ⚠️ NÃO POR REGEX SOBRE O TEXTO CORRIDO. A tabela declara `data-linha={l.codigo}`; ler dali é ler
 * o efeito. Uma varredura por "o primeiro montante depois do código" acha o número certo pelo
 * motivo errado no dia em que a ordem das colunas mudar. E `existe` é campo próprio: "a linha vale
 * 0,00" e "a linha não está lá" são coisas diferentes, e um dos passos afirma justamente a ausência.
 */
async function linhaDoContracheque(page: Page, codigo: string): Promise<{ readonly existe: boolean; readonly valor: string; readonly memoria: string }> {
  return page.evaluate((cod) => {
    const tr = document.querySelector(`tr[data-linha="${cod}"]`);
    if (tr === null) return { existe: false, valor: "", memoria: "" };
    const tds = Array.from(tr.querySelectorAll("td"));
    const prov = (tds[3]?.textContent ?? "").trim();
    const desc = (tds[4]?.textContent ?? "").trim();
    return { existe: true, valor: prov !== "" ? prov : desc, memoria: (tds[2]?.textContent ?? "").replace(/\s+/g, " ").trim() };
  }, codigo);
}

/** Baixa um PDF com a sessão do navegador e extrai o texto com o pdf.js — leitor INDEPENDENTE. */
async function textoDoPdf(page: Page, url: string): Promise<string> {
  const obtido = await page.evaluate(async (u) => {
    const r = await fetch(u);
    if (r.status !== 200) return { status: r.status, b64: "" };
    const bytes = new Uint8Array(await r.arrayBuffer());
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return { status: r.status, b64: btoa(bin) };
  }, url);
  if (obtido.b64 === "") return `[http ${String(obtido.status)}]`;
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(Buffer.from(obtido.b64, "base64")), useSystemFonts: true }).promise;
  const partes: string[] = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const pagina = await doc.getPage(i);
    const conteudo = await pagina.getTextContent();
    partes.push(conteudo.items.map((it) => ("str" in it ? it.str : "")).join(" "));
  }
  return partes.join("\n");
}

async function main(): Promise<void> {
  /**
   * ⚠️ RECUSA ANTES DO PRIMEIRO CLIQUE, e é bloqueio de AMBIENTE (saída 3), não passo vermelho.
   * Um percurso que aceita o banco de todo mundo é um percurso cujo vermelho não se lê.
   */
  const banco = process.env["PERCURSO_BANCO"] ?? "";
  if (banco === "") {
    console.error(
      "[FALHA] PERCURSO_BANCO não declarado. A complementar recalcula a competência sobre TODOS os\n" +
        "        vínculos do banco: no banco compartilhado, uma matrícula alheia sem regime ou sem\n" +
        "        vencimento derruba o cálculo INTEIRO, e o vermelho não é deste percurso.\n" +
        "        Use um banco clonado por execução (o padrão do smoke-encargos-da-folha):\n" +
        "          PERCURSO_BANCO=gestao_publica_percursos_v7m1_compl_<sha> npm run percursos:servir\n" +
        "          PERCURSO_BANCO=... npx tsx scripts/smoke-complementar-da-folha.ts <base>"
    );
    process.exit(SAIDA_AMBIENTE);
  }
  console.log(`      [ano ${ANO} · banco ${banco} · par ${M1} e ${M2} · base ${N.base}]`);
  let navegador: Browser | null = null;
  try {
    navegador = await lancarNavegadorDoPercurso();
    const page = await navegador.newPage();

    // ══ 1. A MODALIDADE É ENCONTRÁVEL ════════════════════════════════════════
    await entrar(N, page, RH, SENHA);
    await irPara(N, page, "/folha/folhas");
    const tipos = await opcoesDe(page, 'form[data-acao="criar-folhas"] select[name="tipo"]');
    /**
     * ⚠️ SE O OPERADOR NÃO ACHA O TIPO, A CAPACIDADE NÃO EXISTE PARA ELE. Toda a unidade V9.4 —
     * motor, cinco recusas, CHECK por propriedade — fica inalcançável por falta de uma linha em
     * `OPCOES_DE_TIPO_DE_FOLHA`. É o defeito nº 1 da V11 V9.1, visto pelo outro lado.
     */
    R.conferir(
      "1.1 o seletor de TIPO oferece a folha mensal COMPLEMENTAR, pelo rótulo de negócio",
      tipos.length > 0 && tipos.some((o) => /complementar/i.test(o)),
      tipos.length === 0 ? "o seletor de tipo não foi encontrado (não vale como prova)" : tipos.join(" | ")
    );
    /**
     * ⚠️ O RÓTULO TEM DE DIZER O QUE ELA FAZ, e não só nomeá-la. "Mensal complementar" sozinho é
     * indistinguível de "a segunda folha do mês"; o que separa é "paga a diferença de uma
     * competência já fechada".
     */
    R.conferir(
      "1.2 e o rótulo DIZ o que ela faz — diferença de competência já fechada —, não só o nome",
      tipos.some((o) => /complementar/i.test(o) && /diferen[çc]a/i.test(o)),
      tipos.find((o) => /complementar/i.test(o)) ?? "(nenhuma opção complementar)"
    );
    const rotuloDoTipo = await rotuloDoCampo(page, 'form[data-acao="criar-folhas"]', "tipo");
    nota(`rótulo+ajuda do campo TIPO: ${rotuloDoTipo.slice(0, 700)}`);
    /**
     * ⚠️ DEFEITO (1) — APURADO × PAGO, NA PRIMEIRA TELA QUE O OPERADOR LÊ.
     *
     * O que a complementar verifica é `FolhaDePagamento.fechamento !== null`, e só. Certificação,
     * empenho, liquidação e pagamento não são consultados em lugar nenhum de
     * `calcularFolhaComplementarNaTx`. Uma ajuda que diga "já pago" afirma, antes do primeiro
     * clique, um fato que o sistema nunca verificou — a mesma doença da memória que dizia "1ª
     * parcela já PAGA" e que a V11 V9.2 corrigiu no 13º. Entre FECHADA e PAGA há certificação (que
     * pode ser DEVOLVIDA), empenho e liquidação, e o pagamento nem é ato do M33.
     */
    R.conferir(
      "1.3 ⚠️ a ajuda do campo TIPO não afirma PAGAMENTO — o fato verificado é folha FECHADA",
      rotuloDoTipo !== "" && !/j[áa]\s*pag/i.test(rotuloDoTipo),
      rotuloDoTipo === "" ? "o rótulo do campo não foi encontrado (não vale como prova)" : rotuloDoTipo
    );

    // ══ 2. O CADASTRO MÍNIMO: rubricas, tabelas, cargo, lotação, o par N=2 ═══
    /**
     * ⚠️ `incideContribuicao` NÃO TEM PADRÃO ÚTIL, E ESQUECÊ-LO FEZ ESTE PERCURSO MEDIR OUTRA COISA.
     *
     * Na primeira corrida (ano 2028) os proventos nasceram todos SEM incidência declarada: a
     * `baseContribuicao` de TODO contracheque saiu `0.00`, a contribuição saiu `0.00`, e a folha
     * mensal fechou com líquido IGUAL ao bruto. Três asserções de valor ficaram vermelhas por
     * fixture errada (3.4, 5.7, 7.4) — e, muito pior, **6.8 passou por VACUIDADE**: "o bloco não
     * anuncia 350,00 como descontado" é trivialmente verdadeiro quando não existe contribuição
     * nenhuma para anunciar. Um passo verde porque a conta não aconteceu é exatamente o
     * instrumento inerte que este percurso existe para não ser.
     *
     * A incidência é declarada POR RUBRICA pelo ente, e aqui ela é declarada de propósito.
     */
    const rubrica = async (codigo: string, descricao: string, tipo: string, natureza: string, ordem: string, incideContribuicao = false): Promise<boolean> => {
      await irPara(N, page, "/folha/rubricas");
      const r = await preencherEEnviar(page, "criar-rubricas", [
        { sel: 'input[name="codigo"]', valor: codigo },
        { sel: 'input[name="descricao"]', valor: descricao },
        { sel: 'select[name="tipo"]', valor: tipo, tipo: "select" },
        { sel: 'select[name="natureza"]', valor: natureza, tipo: "select" },
        { sel: 'input[name="ordem"]', valor: ordem },
        ...(incideContribuicao ? [{ sel: 'input[name="incideContribuicao"]', valor: "sim", tipo: "marcar" as const }] : []),
        { sel: 'input[name="fundamentacaoLegal"]', valor: "percurso sintetico" },
      ]);
      /**
       * ⚠️ REEXECUÇÃO É REUSO, E SÃO DUAS RECUSAS DIFERENTES: o código repetido volta erro de
       * unicidade, e a natureza SISTÊMICA repetida volta `RUBRICA-SISTEMICA-DUPLICADA` — elas
       * existem UMA vez por ente (`NATUREZAS_SISTEMICAS`).
       */
      return r.tipo === "ok" || /já existe|unique|sistemica-duplicada|sistêmica-duplicada/i.test(r.texto);
    };
    const feitas = [
      // ⚠️ OS TRÊS PROVENTOS COMPÕEM A BASE DA CONTRIBUIÇÃO — sem isso não há delta de retenção,
      // e o passo que vigia a contradição do documento (6.8) passa por vacuidade.
      await rubrica(`VENC-${SUF}`, "Vencimento base (percurso)", "PROVENTO", "VENCIMENTO_BASE", "1", true),
      await rubrica(`GRAT-${SUF}`, "Gratificacoes do vinculo (percurso)", "PROVENTO", "GRATIFICACOES_DO_VINCULO", "2", true),
      await rubrica(`EXTRA-${SUF}`, "Adicional apurado fora de prazo (percurso)", "PROVENTO", "VALOR_INFORMADO", "20", true),
      await rubrica(`PREV-${SUF}`, "Contribuicao previdenciaria (percurso)", "DESCONTO", "CONTRIBUICAO_PREVIDENCIARIA", "90"),
      await rubrica(`IRRF-${SUF}`, "Imposto de renda (percurso)", "DESCONTO", "IMPOSTO_DE_RENDA", "91"),
    ];
    R.conferir("2.1 as rubricas do cenário estão cadastradas", feitas.every((x) => x), `resultados: ${feitas.join(", ")}`);

    /**
     * ⚠️ A CONTRIBUIÇÃO SE RESOLVE PELA NATUREZA, NUNCA PELO CÓDIGO SUFIXADO — e isto foi defeito
     * REAL deste script, achado pela corrida de 2029.
     *
     * `CONTRIBUICAO_PREVIDENCIARIA` é natureza SISTÊMICA: existe UMA por ente
     * (`NATUREZAS_SISTEMICAS`). A tentativa de criar `PREV-29` foi recusada com
     * `RUBRICA-SISTEMICA-DUPLICADA` — corretamente, e o percurso trata isso como REUSO —, então a
     * rubrica que o motor usa continuou sendo a `PREV-28` da execução anterior. Procurar
     * `PREV-<ano>` na tela não achava linha nenhuma, e os passos 6.3 e 6.4 ficavam vermelhos
     * dizendo "existe=false" — culpando o produto por uma suposição minha.
     *
     * Enumerar a forma ("o código é PREV mais o sufixo") acha só a forma que eu escrevi. Afirmar a
     * PROPRIEDADE ("a rubrica cuja natureza é contribuição previdenciária") acha a que o ente tem.
     */
    const codigoPorNatureza = async (trechoDaNatureza: string): Promise<string> => {
      await irPara(N, page, "/folha/rubricas");
      return page.evaluate((t) => {
        const linha = Array.from(document.querySelectorAll("tbody tr")).find((tr) =>
          Array.from(tr.querySelectorAll("td")).some((td) => new RegExp(t, "i").test(td.textContent ?? ""))
        );
        return (linha?.querySelector("td")?.textContent ?? "").trim();
      }, trechoDaNatureza);
    };
    const CODIGO_PREV = await codigoPorNatureza("Contribui[çc][ãa]o previdenci");
    const CODIGO_VENC = await codigoPorNatureza("Vencimento-base");
    nota(`rubricas resolvidas por natureza: contribuição="${CODIGO_PREV}" vencimento="${CODIGO_VENC}"`);
    R.conferir(
      "2.1b as rubricas sistêmicas foram resolvidas por NATUREZA (a contribuição existe uma vez por ente)",
      CODIGO_PREV !== "" && CODIGO_VENC !== "",
      `contribuição="${CODIGO_PREV}" vencimento="${CODIGO_VENC}"`
    );

    /**
     * ⚠️ AS TABELAS SÃO DECLARADAS PELO PERCURSO, e é isso que torna os líquidos exigíveis. Sem
     * elas o cálculo recusaria com `TABELA-AUSENTE`; com as do banco, os valores dependeriam do
     * que a corrida anterior deixou e cravar o líquido deixaria um passo vermelho sem defeito. As
     * alíquotas vão EM PORCENTO ("10"), como a tela pede, e são SINTÉTICAS.
     */
    const tabela = async (tipo: string, campos: readonly { readonly sel: string; readonly valor: string }[]): Promise<boolean> => {
      await irPara(N, page, "/folha/tabelas");
      const r = await preencherEEnviar(page, "criar-tabela", [
        { sel: 'select[name="tipo"]', valor: tipo, tipo: "select" },
        { sel: 'input[name="competenciaInicio"]', valor: `${ANO}-01` },
        { sel: 'input[name="fundamentacaoLegal"]', valor: `FIXTURE sintetica do percurso da complementar (${ANO})` },
        ...campos,
      ]);
      return r.tipo === "ok" || /ambígua|ambigua|já existe/i.test(r.texto);
    };
    const tabRgps = await tabela("CONTRIBUICAO_RGPS", [{ sel: 'input[name="faixas.0.aliquota"]', valor: "10" }]);
    const tabIrrf = await tabela("IRRF", [
      { sel: 'input[name="deducaoPorDependente"]', valor: "0,00" },
      { sel: 'input[name="faixas.0.aliquota"]', valor: "0" },
    ]);
    R.conferir(`2.2 as tabelas de ${ANO} estão vigentes (contribuição 10% linear, IRRF zerado — sintéticas)`, tabRgps && tabIrrf, `RGPS=${tabRgps} IRRF=${tabIrrf}`);

    await irPara(N, page, "/pessoal/cargos");
    if (!(await texto(page)).includes(`cpl-${SUF}`.toLowerCase())) {
      await preencherEEnviar(page, "criar-cargos", [
        { sel: 'input[name="codigo"]', valor: `CPL-${SUF}` },
        { sel: 'input[name="denominacao"]', valor: `Cargo do percurso da complementar ${SUF}` },
        { sel: 'select[name="tipo"]', valor: "EFETIVO", tipo: "select" },
        { sel: 'input[name="vagasFixadas"]', valor: "10" },
        { sel: 'input[name="leiAutorizativa"]', valor: "Lei Municipal 1.234/2010 (percurso)" },
        { sel: 'input[name="dataPublicacaoLei"]', valor: "2010-05-01", tipo: "data" },
      ]);
    }
    await irPara(N, page, "/pessoal/lotacoes");
    if (!(await texto(page)).includes(`cpl-${SUF}`.toLowerCase())) {
      await preencherEEnviar(page, "criar-lotacoes", [
        { sel: 'input[name="codigo"]', valor: `CPL-${SUF}` },
        { sel: 'input[name="nome"]', valor: `Lotacao do percurso da complementar ${SUF}` },
      ]);
    }

    /**
     * Devolve "" quando deu certo, ou o MOTIVO — nunca um `false` mudo sete telas atrás do ponto
     * onde a coisa realmente quebrou. Uma fixture que falha sem dizer ONDE custa uma execução
     * inteira para diagnosticar, e esta custa um `next build`.
     */
    const criarMatricula = async (matricula: string, nome: string, semente: string, salario: string): Promise<string> => {
      await irPara(N, page, "/cadastros/pessoas");
      const rPessoa = await preencherEEnviar(page, "cadastrar-pessoa", [
        { sel: 'input[data-mascara="cpf-cnpj"]', valor: cpfFicticio(semente) },
        { sel: 'input[name="nome"]', valor: nome },
      ]);
      if (rPessoa.tipo === "erro" && !/já existe|unique/i.test(rPessoa.texto)) return `cadastrar-pessoa: ${rPessoa.texto.slice(0, 160)}`;
      await irPara(N, page, "/pessoal/servidores");
      const idPessoa = await opcaoQueCasa(page, 'form[data-acao="criar-servidores"] select[name="pessoaId"]', nome);
      if (idPessoa === "") return `a pessoa "${nome}" não foi oferecida no seletor de criar servidor (o cadastro não gravou?)`;
      const rServ = await preencherEEnviar(page, "criar-servidores", [
        { sel: 'select[name="pessoaId"]', valor: idPessoa, tipo: "select" },
        { sel: 'input[name="dataNascimento"]', valor: "1985-07-20", tipo: "data" },
        { sel: 'select[name="sexo"]', valor: "FEMININO", tipo: "select" },
      ]);
      if (rServ.tipo === "erro" && !/já existe|unique/i.test(rServ.texto)) return `criar-servidores: ${rServ.texto.slice(0, 160)}`;
      await irPara(N, page, `/pessoal/servidores?q=${encodeURIComponent(nome)}`);
      const href = await hrefDoRegistro(page, nome);
      if (href === null) return `a ficha de "${nome}" não apareceu na busca`;
      await irPara(N, page, href);
      // ⚠️ POR TEXTO DE VERDADE, NUNCA POR "": `includes("")` casa com TUDO e devolveria o
      // placeholder vazio do seletor, mandando a admissão sem cargo.
      const cargo = await opcaoQueCasa(page, 'form[data-acao="admitir"] select[name="cargoId"]', `CPL-${SUF}`);
      const lotacao = await opcaoQueCasa(page, 'form[data-acao="admitir"] select[name="lotacaoId"]', `CPL-${SUF}`);
      if (cargo === "" || lotacao === "") return `o seletor da admissão não ofereceu cargo (${cargo === "" ? "vazio" : "ok"}) ou lotação (${lotacao === "" ? "vazio" : "ok"}) CPL-${SUF}`;
      const rAdm = await preencherEEnviar(page, "admitir", [
        { sel: 'input[name="matricula"]', valor: matricula },
        { sel: 'select[name="tipo"]', valor: "EFETIVO", tipo: "select" },
        { sel: 'input[name="regimeJuridico"]', valor: "Estatutario" },
        // ⚠️ O REGIME É O QUE ESCOLHE A TABELA. Sem ele o cálculo recusa nomeando a matrícula.
        { sel: 'select[name="regimePrevidenciario"]', valor: "RGPS", tipo: "select" },
        { sel: 'input[name="dataAdmissao"]', valor: `${ANO - 2}-01-01`, tipo: "data" },
        { sel: 'select[name="cargoId"]', valor: cargo, tipo: "select" },
        { sel: 'select[name="lotacaoId"]', valor: lotacao, tipo: "select" },
        { sel: 'input[data-mascara="valor"]', valor: salario },
      ]);
      if (rAdm.tipo === "erro" && !/já existe|unique/i.test(rAdm.texto)) return `admitir: ${rAdm.texto.slice(0, 160)}`;
      return "";
    };
    // ⚠️ SEMENTES DIFERENTES: a mesma semente nas duas chamadas geraria o MESMO CPF, e a segunda
    // pessoa colidiria com a primeira no cadastro único.
    const e1 = await criarMatricula(M1, NOME_M1, `3${SUF}000001`, "3.000,00");
    const e2 = await criarMatricula(M2, NOME_M2, `4${SUF}000002`, "2.000,00");
    R.conferir("2.3 o par N=2 está admitido (3.000,00 e 2.000,00 — valores diferentes de propósito)", e1 === "" && e2 === "", `M-1: ${e1 === "" ? "ok" : e1} · M-2: ${e2 === "" ? "ok" : e2}`);

    // ══ 3. A FOLHA MENSAL ORIGINAL — calculada e FECHADA ══════════════════════
    await irPara(N, page, "/folha/folhas");
    const rAbrirMensal = await preencherEEnviar(page, "criar-folhas", [
      { sel: 'input[name="competencia"]', valor: COMP },
      { sel: 'select[name="tipo"]', valor: "MENSAL", tipo: "select" },
    ]);
    if (rAbrirMensal.tipo === "erro" && /FOLHA-JA-ABERTA|já existe|unique/i.test(rAbrirMensal.texto)) {
      /**
       * ⚠️ PULADO COM AVISO, E NÃO FALHA. `@@unique([competencia, tipo])` dá UMA folha de cada
       * tipo por competência; reexecutar aqui não é defeito nenhum. Mas também não é verde: nada
       * foi provado nesta corrida, e dizer "passou" seria a mentira que o roteiro proíbe.
       */
      console.warn(
        `\n[PULADO] A competência ${COMP} já tem folha MENSAL neste banco. NADA foi provado nesta corrida.\n` +
          `          Para rodar de verdade: COMPLEMENTAR_ANO=<outro ano> npx tsx scripts/smoke-complementar-da-folha.ts ${N.base}\n`
      );
      await navegador.close();
      process.exit(SAIDA_PULADO);
    }
    R.conferir("3.1 a folha MENSAL da competência abre", rAbrirMensal.tipo === "ok", `${rAbrirMensal.tipo}: ${rAbrirMensal.texto.slice(0, 200)}`);
    const hrefMensal = (await hrefDoRegistro(page, COMP)) ?? "";
    R.conferir("3.2 a folha aberta leva ao próprio detalhe", hrefMensal !== "", "sem link para a folha");
    await irPara(N, page, hrefMensal);
    const rCalcMensal = await preencherEEnviar(page, "calcular", [{ sel: 'input[name="motivo"]', valor: "folha do mes (percurso)" }]);
    R.conferir("3.3 o RH CALCULA a mensal", rCalcMensal.tipo === "ok" && /nº 1/.test(rCalcMensal.texto), `${rCalcMensal.tipo}: ${rCalcMensal.texto.slice(0, 200)}`);
    const mensalCalculada = await irPara(N, page, hrefMensal);
    /** M-1: 3.000,00 − 10% = 2.700,00 · M-2: 2.000,00 − 10% = 1.800,00 */
    /**
     * ⚠️ AFIRMADO POR CONTRACHEQUE, NÃO PELO TOTAL DA FOLHA — e isto foi defeito REAL deste
     * script. A versão anterior procurava "2.700,00" e "1.800,00" no corpo do DETALHE, que mostra
     * o LÍQUIDO TOTAL do cálculo. Na segunda corrida o banco ainda tinha o par da primeira, o
     * total saiu 9.000,00, e o passo ficou vermelho acusando o produto por uma matrícula que este
     * roteiro não criou. O par deste percurso se afirma nas LINHAS do par deste percurso.
     *
     * ⚠️ E A LIÇÃO MAIOR É PROCEDIMENTAL, não de asserção: um percurso que recalcula a competência
     * inteira precisa de BANCO CLONADO POR EXECUÇÃO. O `smoke-decimo-terceiro` já o exige pelo
     * mesmo motivo; aqui a reexecução no mesmo banco é o que trouxe vínculos alheios ao cálculo.
     */
    const liquidoNaLinha = async (matricula: string): Promise<string> =>
      page.evaluate((mat) => {
        const linha = Array.from(document.querySelectorAll("tbody tr")).find((tr) => (tr.textContent ?? "").includes(mat));
        if (linha === null || linha === undefined) return "";
        const tds = Array.from(linha.querySelectorAll("td"));
        return (tds[tds.length - 1]?.textContent ?? "").trim();
      }, matricula);
    const liqM1 = await liquidoNaLinha(M1);
    const liqM2 = await liquidoNaLinha(M2);
    R.conferir(
      "3.4 a mensal apura, POR CONTRACHEQUE do par deste percurso, 2.700,00 e 1.800,00",
      liqM1.includes("2.700,00") && liqM2.includes("1.800,00"),
      `M-1="${liqM1}" M-2="${liqM2}" · detalhe: ${mensalCalculada.slice(0, 400)}`
    );

    // ── 3.5 a negativa e a positiva de autorização, PAREADAS, no ato de FECHAR ──
    R.conferir("3.5 NEGATIVA: o RH não recebe o formulário de FECHAR — fechar é da contabilidade", (await page.$('form[data-acao="fechar"]')) === null, "o formulário de fechar apareceu para quem não tem a ação");
    await sair(N, page);
    await entrar(N, page, CONTABILIDADE, SENHA);
    await irPara(N, page, hrefMensal);
    R.conferir("3.6 NEGATIVA pareada: a contabilidade não recebe o formulário de CALCULAR", (await page.$('form[data-acao="calcular"]')) === null, "o formulário de calcular apareceu para quem não tem a ação");
    const rFecharMensal = await preencherEEnviar(page, "fechar", []);
    R.conferir("3.7 POSITIVA: a contabilidade FECHA a mensal — é o fechamento que torna a complementar possível", rFecharMensal.tipo === "ok", `${rFecharMensal.tipo}: ${rFecharMensal.texto.slice(0, 200)}`);

    // ══ 4. O ACHADO QUE GERA DIFERENÇA POSITIVA ══════════════════════════════
    await sair(N, page);
    await entrar(N, page, RH, SENHA);
    const lancar = async (matricula: string, competencia: string, valor: string): Promise<string> => {
      await irPara(N, page, "/folha/lancamentos");
      const idVinculo = await opcaoQueCasa(page, 'form[data-acao="criar-lancamentos-da-folha"] select[name="vinculoId"]', matricula);
      const idRubrica = await opcaoQueCasa(page, 'form[data-acao="criar-lancamentos-da-folha"] select[name="rubricaId"]', `EXTRA-${SUF}`);
      if (idVinculo === "" || idRubrica === "") return `o seletor do lançamento não ofereceu vínculo (${idVinculo === "" ? "AUSENTE" : "ok"}) ou rubrica (${idRubrica === "" ? "AUSENTE" : "ok"})`;
      const r = await preencherEEnviar(page, "criar-lancamentos-da-folha", [
        { sel: 'select[name="vinculoId"]', valor: idVinculo, tipo: "select" },
        { sel: 'select[name="rubricaId"]', valor: idRubrica, tipo: "select" },
        { sel: 'select[name="tipo"]', valor: "VARIAVEL", tipo: "select" },
        { sel: 'input[name="competenciaInicio"]', valor: competencia },
        { sel: 'input[data-mascara="valor"]', valor },
        { sel: 'input[name="observacao"]', valor: "achado apos o fechamento (percurso)" },
      ]);
      return r.tipo === "ok" ? "" : `${r.tipo}: ${r.texto.slice(0, 200)}`;
    };
    const l1 = await lancar(M1, COMP, "500,00");
    R.conferir("4.1 o primeiro achado é lançado para M-1 na competência já fechada (500,00)", l1 === "", l1);

    // ══ 5. A COMPLEMENTAR — abrir e calcular ═════════════════════════════════
    await irPara(N, page, "/folha/folhas");
    const rAbrirCompl = await preencherEEnviar(page, "criar-folhas", [
      { sel: 'input[name="competencia"]', valor: COMP },
      { sel: 'select[name="tipo"]', valor: "MENSAL_COMPLEMENTAR", tipo: "select" },
    ]);
    R.conferir("5.1 POSITIVA: o RH abre a folha MENSAL COMPLEMENTAR da mesma competência (ABRIR_FOLHA)", rAbrirCompl.tipo === "ok", `${rAbrirCompl.tipo}: ${rAbrirCompl.texto.slice(0, 250)}`);

    /**
     * ⚠️ ENCONTRABILIDADE NA LISTA, E NÃO SÓ NO SELETOR. Duas folhas da MESMA competência convivem
     * agora; se a lista não distinguir os tipos, o operador abre a errada e nada acusa. É aqui que
     * o `ROTULO-CRU-DO-TIPO-DE-FOLHA` se mede: o que a CÉLULA mostra.
     */
    const lista = await irPara(N, page, `/folha/folhas?q=${encodeURIComponent(COMP)}`);
    const linhasDaLista = await page.evaluate(() =>
      Array.from(document.querySelectorAll("tbody tr")).map((tr) => (tr.textContent ?? "").replace(/\s+/g, " ").trim())
    );
    nota(`linhas da lista para ${COMP}: ${linhasDaLista.join(" || ").slice(0, 500)}`);
    R.conferir(
      "5.2 a lista distingue as DUAS folhas da mesma competência (mensal e complementar)",
      linhasDaLista.filter((l) => l.includes(COMP)).length >= 2 && /complementar/i.test(lista),
      linhasDaLista.join(" || ").slice(0, 500)
    );

    const hrefCompl = await page.evaluate((c) => {
      const linha = Array.from(document.querySelectorAll("tbody tr")).find((tr) => (tr.textContent ?? "").includes(c) && /complementar/i.test(tr.textContent ?? ""));
      return (linha?.querySelector("a[href]") as HTMLAnchorElement | null)?.getAttribute("href") ?? "";
    }, COMP);
    R.conferir("5.3 a linha da complementar leva ao PRÓPRIO detalhe, distinto do da mensal", hrefCompl !== "" && hrefCompl !== hrefMensal, `href="${hrefCompl}" (mensal="${hrefMensal}")`);
    if (hrefCompl === "") throw new Error("sem o link da complementar os passos 5 a 13 não têm alvo — o percurso PARA aqui em vez de medir outra coisa e chamar de verde");

    const detalheCompl = await irPara(N, page, hrefCompl);
    /**
     * ⚠️ ESTE PASSO NÃO EXIGE BELEZA: exige que o operador saiba QUAL das duas folhas da
     * competência ele abriu. Um título que dissesse só "Folha mensal" seria o defeito.
     */
    R.conferir("5.4 o título do detalhe diz QUAL das duas folhas é esta", /complementar/i.test(detalheCompl), detalheCompl.slice(0, 300));

    const rCalc1 = await preencherEEnviar(page, "calcular", [{ sel: 'input[name="motivo"]', valor: "primeiro achado (percurso)" }]);
    R.conferir("5.5 POSITIVA: o RH CALCULA a complementar (CALCULAR_FOLHA) — cálculo nº 1", rCalc1.tipo === "ok" && /nº 1/.test(rCalc1.texto), `${rCalc1.tipo}: ${rCalc1.texto.slice(0, 250)}`);
    /**
     * ⚠️ UM contracheque, não dois. M-2 não teve achado: diferença ZERO não vira contracheque, e
     * gravar um de zero faria a lista de quem recebeu complementar mentir sobre quem recebeu.
     */
    R.conferir("5.6 só M-1 vira contracheque: quem não tem diferença NÃO entra na complementar", /1 contracheque/.test(rCalc1.texto), rCalc1.texto.slice(0, 250));

    const compl1 = await irPara(N, page, hrefCompl);
    /** M-1: extra 500,00 · contribuição 350,00 − 300,00 = 50,00 · líquido 450,00 */
    R.conferir("5.7 a complementar apura o LÍQUIDO da diferença: 450,00 (500,00 − 50,00)", compl1.includes("450,00"), compl1.slice(0, 700));
    R.conferir("5.8 e NÃO paga o mês de novo: 2.700,00 não aparece na complementar", !compl1.includes("2.700,00"), "a complementar trouxe o líquido da mensal — o mês estaria sendo pago duas vezes");

    // ══ 6. A MEMÓRIA POR RUBRICA — de ONDE vem cada delta ════════════════════
    const hrefContra1 = await hrefDoContracheque(page, M1);
    R.conferir("6.0 a linha do contracheque leva à memória de cálculo", hrefContra1 !== "", "sem link para o contracheque");
    let memAbriu = "";
    if (hrefContra1 !== "") {
      /**
       * ⚠️ ABRIR O CONTRACHEQUE NÃO PODE DERRUBAR O PERCURSO INTEIRO. Na V11 V9.1 esta rota
       * respondia 500 em toda folha de 13º, e um percurso que morre no primeiro 500 mede um
       * defeito e esconde os outros.
       */
      try {
        await irPara(N, page, hrefContra1);
      } catch (e) {
        memAbriu = e instanceof Error ? e.message : String(e);
      }
      R.conferir("6.1 a tela do contracheque COMPLEMENTAR abre", memAbriu === "", memAbriu);
    }
    if (hrefContra1 !== "" && memAbriu === "") {
      const extra = await linhaDoContracheque(page, `EXTRA-${SUF}`);
      // ⚠️ PELO CÓDIGO RESOLVIDO POR NATUREZA (ver 2.1b), não por `PREV-<ano>`: a contribuição é
      // sistêmica e existe UMA por ente, então o código pode ser o de uma execução anterior.
      const prev = await linhaDoContracheque(page, CODIGO_PREV);
      const venc = await linhaDoContracheque(page, CODIGO_VENC);
      /**
       * ⚠️ TEXTO VISÍVEL (`innerText`) E FORA DA TABELA DE LINHAS. Duas precauções, cada uma
       * contra uma vacuidade diferente:
       *   · `textContent` traria o descritor serializado nos `<script>` da página, e a asserção
       *     "a tela declara X" passaria por causa de um JSON que ninguém vê;
       *   · a própria memória de cada LINHA já começa com "DIFERENÇA da competência…", então
       *     procurar "DIFERENÇA" no corpo inteiro seria satisfeito pela tabela — e o que este
       *     passo cobra é a DECLARAÇÃO DO DOCUMENTO sobre o que ele é, não a memória de uma linha.
       */
      const corpo = await page.evaluate(() => (document.body.innerText ?? "").replace(/\s+/g, " "));
      const foraDaTabela = await page.evaluate(() => {
        const clone = document.body.cloneNode(true) as HTMLElement;
        for (const t of Array.from(clone.querySelectorAll("table"))) t.remove();
        return (clone.innerText ?? clone.textContent ?? "").replace(/\s+/g, " ");
      });
      R.conferir("6.2 a linha do adicional vale a DIFERENÇA: 500,00", extra.existe && extra.valor.includes("500,00"), `existe=${extra.existe} valor="${extra.valor}"`);
      /**
       * ⚠️ O QUE ESTE PASSO EXIGE É PROCEDÊNCIA, NÃO ARITMÉTICA. "50,00" sozinho é indefensável: o
       * servidor precisa saber que os 350,00 corretos menos os 300,00 já apurados na folha MENSAL,
       * cálculo nº 1, dão os 50,00 que estão sendo retidos agora. É a diferença entre uma memória
       * e um número.
       */
      R.conferir(
        "6.3 ⚠️ a memória da contribuição diz DE ONDE vem o delta: correto − já apurado, nomeando a folha e o cálculo",
        prev.existe && /DIFEREN[ÇC]A/i.test(prev.memoria) && prev.memoria.includes("350,00") && prev.memoria.includes("300,00") && /MENSAL/i.test(prev.memoria) && /c[áa]lculo n[ºo]\s*1/i.test(prev.memoria),
        `existe=${prev.existe} memoria="${prev.memoria.slice(0, 500)}"`
      );
      R.conferir("6.4 e vale 50,00 — o que falta reter, não a contribuição do mês inteiro", prev.existe && prev.valor.includes("50,00"), `valor="${prev.valor}"`);
      /**
       * ⚠️ A RUBRICA SEM DIFERENÇA NÃO VIRA LINHA. O vencimento não mudou: uma linha de 0,00 diria
       * "esta rubrica foi paga agora, no valor de zero", que é falso — ela foi apurada na mensal,
       * por inteiro. Mesma decisão do 13º com zero avo.
       */
      R.conferir("6.5 a rubrica sem diferença NÃO vira linha de 0,00 no contracheque", !venc.existe, `a linha do vencimento apareceu com "${venc.valor}"`);
      /**
       * ⚠️ DEFEITO (4a) — A MEMÓRIA DIZ, E O DOCUMENTO CALA.
       *
       * A memória gravada declara, por escrito e DENTRO do sha256, que este contracheque NÃO é a
       * remuneração da competência. Se a TELA não renderizar essa declaração, o servidor lê um
       * contracheque de 450,00 e conclui que ganhou 450,00 no mês. Uma declaração que não chega a
       * quem lê é papelada: existe, e não produz efeito — a doença nomeada desta rodada.
       */
      R.conferir(
        "6.6 ⚠️ a TELA do contracheque declara — FORA da tabela de linhas — que ele é DIFERENÇA, e não a remuneração do mês",
        foraDaTabela.length > 0 && /DIFEREN[ÇC]A/i.test(foraDaTabela) && /(n[ãa]o é a remunera|NAO e a remunera)/i.test(foraDaTabela),
        foraDaTabela.length === 0 ? "a tela não abriu (não vale como prova)" : foraDaTabela.slice(0, 900)
      );
      /**
       * ⚠️ DEFEITO (4b) — O REGIME DE TRIBUTAÇÃO É LIMITE NORMATIVO DECLARADO, e foi declarado na
       * memória justamente para não deixar o servidor deduzir do silêncio
       * (`IRRF-DO-COMPLEMENTAR-EM-REGIME-DE-CAIXA`). Se ele não chega à tela, o silêncio voltou.
       */
      R.conferir(
        "6.7 ⚠️ a TELA declara o regime de tributação aplicado (competência, não caixa)",
        corpo.length > 0 && /REGIME DE COMPET[ÊE]NCIA/i.test(corpo),
        corpo.length === 0 ? "a tela não abriu (não vale como prova)" : corpo.slice(0, 900)
      );
      /**
       * ⚠️ DEFEITO (4c) — O DOCUMENTO QUE SE CONTRADIZ, e este é o mais grave dos cinco.
       *
       * O bloco "Contribuição previdenciária" da tela vem de `contracheque.memoria.contribuicao`,
       * que na complementar é o RECÁLCULO INTEGRAL — a conta de onde o delta saiu —, não o delta.
       * A tela diz "descontado 350,00"; a tabela logo acima desconta 50,00; e o total de descontos
       * é 50,00. É o documento com que o servidor confere o próprio contracheque dizendo DUAS
       * COISAS. Não é imprecisão: é contradição interna num documento lacrado em sha256.
       */
      const blocoContribuicao = await page.evaluate(() => {
        const h = Array.from(document.querySelectorAll("h2")).find((x) => /Contribui[çc][ãa]o previdenci/i.test(x.textContent ?? ""));
        return (h?.parentElement?.textContent ?? "").replace(/\s+/g, " ").trim();
      });
      nota(`bloco "Contribuição previdenciária" da tela: ${blocoContribuicao.slice(0, 400)}`);
      /**
       * ⚠️ REESCRITO — A VERSÃO ANTERIOR DESTE PASSO ERA INERTE, E ELE MESMO SE PEGOU.
       *
       * Eu previra, por LEITURA DE FONTE, que a tela diria "descontado 350,00" (o recálculo
       * INTEGRAL) sobre uma tabela que desconta 50,00 (o delta) — um documento contraditório. A
       * medição mostrou outra coisa: o bloco diz **"A memória deste cálculo não traz o
       * detalhamento da contribuição."** e cala. A guarda vigiava um número que NUNCA APARECE, e
       * por isso passou nas duas corridas — na primeira por vacuidade (a fixture não declarava
       * incidência e não havia contribuição nenhuma), na segunda por vigiar a propriedade errada.
       *
       * ⚠️ E O SILÊNCIO É PIOR QUE O NÚMERO CONTRADITÓRIO. Um número errado alguém confere e
       * questiona; um silêncio o servidor lê como "não houve contribuição" — enquanto a linha
       * retém 50,00 dele. É o vício desta empreitada na forma mais difícil de notar.
       *
       * A PROPRIEDADE REAL, e é ela que este passo passa a afirmar: quando o contracheque
       * complementar RETÉM contribuição, o bloco EXPLICA essa retenção. Ele não pode declarar
       * ausência de detalhamento sobre um desconto que ele está aplicando. A memória tem os dois
       * números — o integral em `recalculoIntegral`, o delta na linha —; o documento precisa
       * dizer qual é qual, não emudecer.
       */
      const retemContribuicao = prev.existe && /[1-9]/.test(prev.valor);
      R.conferir(
        "6.8 ⚠️ retendo contribuição, o bloco EXPLICA a retenção — não declara que não há detalhamento",
        retemContribuicao && blocoContribuicao !== "" && !/n[ãa]o traz o detalhamento/i.test(blocoContribuicao),
        !retemContribuicao
          ? `este contracheque não reteve contribuição (linha ${prev.existe ? `"${prev.valor}"` : "AUSENTE"}) — o passo não tem o que afirmar e NÃO vale como prova`
          : blocoContribuicao === ""
            ? "o bloco não foi encontrado (não vale como prova)"
            : `a linha retém ${prev.valor} e o bloco diz: ${blocoContribuicao.slice(0, 400)}`
      );
    }

    // ══ 7. O SEGUNDO ACHADO, ABSORVIDO PELO RECÁLCULO (cálculo nº 2) ═════════
    //
    // ⚠️ ESTE É O PASSO QUE MEDE A DECISÃO DE PRODUTO. `@@unique([competencia, tipo])` dá UMA
    // complementar por competência; enquanto ela está ABERTA, o segundo achado entra pelo
    // RECÁLCULO, e o desenho afirma que ele não repete o já reconhecido porque o delta é sempre
    // "o correto menos TUDO o que as folhas FECHADAS já apuraram" — e a própria complementar ainda
    // não fechou, então o cálculo nº 1 dela NÃO entra no subtraendo. Este passo mede se isso é
    // verdade PELA TELA, em vez de acreditar no desenho.
    await irPara(N, page, hrefCompl);
    const l2 = await lancar(M2, COMP, "300,00");
    R.conferir("7.1 o segundo achado é lançado para M-2, na mesma competência", l2 === "", l2);
    await irPara(N, page, hrefCompl);
    const rCalc2 = await preencherEEnviar(page, "calcular", [{ sel: 'input[name="motivo"]', valor: "segundo achado (percurso)" }]);
    R.conferir("7.2 a complementar ABERTA aceita o RECÁLCULO — cálculo nº 2", rCalc2.tipo === "ok" && /nº 2/.test(rCalc2.texto), `${rCalc2.tipo}: ${rCalc2.texto.slice(0, 250)}`);
    R.conferir("7.3 e agora são DOIS contracheques — o segundo achado entrou SEM folha nova", /2 contracheque/.test(rCalc2.texto), rCalc2.texto.slice(0, 250));
    /**
     * ⚠️ O NÚMERO QUE IMPORTA: 720,00 e não 1.170,00. Se o recálculo somasse o que o cálculo nº 1
     * já tinha reconhecido, M-1 sairia com 1.000,00 de adicional em vez de 500,00.
     *   M-1: 500,00 − 50,00 = 450,00 · M-2: 300,00 − 30,00 = 270,00 · total 720,00
     * É este passo que separa "absorve" de "repete".
     */
    const compl2 = await irPara(N, page, hrefCompl);
    R.conferir("7.4 ⚠️ o cálculo nº 2 NÃO repete o já reconhecido: o líquido é 720,00", compl2.includes("720,00"), compl2.slice(0, 700));
    R.conferir("7.5 e o dobro NÃO aparece: nem 1.170,00 nem 900,00 estão na tela", !compl2.includes("1.170,00") && !compl2.includes("900,00"), compl2.slice(0, 700));
    const hrefContra1b = await hrefDoContracheque(page, M1);
    if (hrefContra1b !== "") {
      await irPara(N, page, hrefContra1b);
      const extra2 = await linhaDoContracheque(page, `EXTRA-${SUF}`);
      R.conferir("7.6 no cálculo nº 2, o adicional de M-1 continua 500,00 — nunca 1.000,00", extra2.existe && extra2.valor.includes("500,00") && !extra2.valor.includes("1.000,00"), `existe=${extra2.existe} valor="${extra2.valor}"`);
    } else {
      naoExecutado("7.6 a linha de M-1 no cálculo nº 2", "o link do contracheque de M-1 não apareceu na tela da folha");
    }

    // ══ 8. FECHAR A COMPLEMENTAR, E O DOCUMENTO QUE ELA PRODUZ ═══════════════
    await sair(N, page);
    await entrar(N, page, CONTABILIDADE, SENHA);
    await irPara(N, page, hrefCompl);
    const rFecharCompl = await preencherEEnviar(page, "fechar", []);
    R.conferir("8.1 a contabilidade FECHA a complementar sobre o cálculo nº 2", rFecharCompl.tipo === "ok" && /nº 2/.test(rFecharCompl.texto), `${rFecharCompl.tipo}: ${rFecharCompl.texto.slice(0, 250)}`);
    /**
     * ⚠️ FECHADA NÃO É APROPRIADA, NEM LIQUIDADA, NEM PAGA — e são três estados distintos, com
     * atos distintos. Nesta folha nenhum deles aconteceu: não houve `apropriar`, `certificar`,
     * `liquidar` nem pagamento. O detalhe é onde o operador decide o que fazer em seguida; se ele
     * afirmar obrigação ou quitação aqui, afirma o que nenhum ato produziu.
     */
    /**
     * ⚠️ `innerText`, NUNCA `textContent` — e a diferença é a de um percurso que afirma sobre a
     * PÁGINA o que a página não mostra.
     *
     * `textContent` varre o DOM inteiro, `<script>` incluído — e o molde serializa o DESCRITOR
     * dentro da página. Na corrida de 2029 esta guarda acusou `"já pago"` no índice 44186: o texto
     * estava no JSON do descritor embutido (a ajuda do campo `tipo`, defeito 1), e não em coisa
     * nenhuma que o operador visse nesta tela. Eu quase relatei um sexto defeito que era o
     * primeiro, serializado. `innerText` devolve o texto RENDERIZADO e visível, que é sobre o que
     * esta asserção fala.
     */
    const detalheFechada = await page.evaluate(() => (document.body.innerText ?? "").replace(/\s+/g, " "));
    /**
     * ⚠️ O DIAGNÓSTICO IMPRIME O CONTEXTO DO ACHADO, NÃO O COMEÇO DA PÁGINA — e isto é conserto de
     * um defeito DESTE script, medido na primeira corrida. A versão anterior imprimia os primeiros
     * 700 caracteres do corpo; a expressão casou em algum ponto ADIANTE disso, e o relatório
     * mostrou o cabeçalho e o menu em vez do trecho que acusou. Ficou impossível dizer, sem
     * adivinhar, se o produto afirmava pagamento ou se a guarda pegou uma palavra inocente.
     * Guarda que acusa sem mostrar ONDE obriga quem lê a supor — e supor é o que este repositório
     * proíbe. Agora ela devolve o índice e ±220 caracteres em volta.
     */
    const mDePagamento = /\bj[áa] pag[oa]\b|\bquitad[oa]\b|\bfolha paga\b/i.exec(detalheFechada);
    const contextoDoPagamento =
      mDePagamento === null
        ? ""
        : `"${mDePagamento[0]}" no índice ${mDePagamento.index} :: …${detalheFechada.slice(Math.max(0, mDePagamento.index - 220), mDePagamento.index + 220)}…`;
    R.conferir(
      "8.2 ⚠️ fechada, a tela NÃO afirma pagamento nem quitação — nenhum empenho, liquidação ou pagamento aconteceu",
      detalheFechada.length > 0 && mDePagamento === null,
      detalheFechada.length === 0 ? "a tela não abriu (não vale como prova)" : contextoDoPagamento
    );
    /**
     * ⚠️ DEFEITO (3) — O RESUMO É O DOCUMENTO QUE SAI DA FOLHA. Ele se emite do cálculo FECHADO e
     * é lido por quem não abre a tela (contabilidade, controle interno). Se o título disser "folha
     * mensal" para uma COMPLEMENTAR, o documento descreve uma operação que não é a que produziu os
     * números que ele carrega — um documento que se apresenta como a folha do mês carregando só a
     * diferença. O leitor é o pdf.js: INDEPENDENTE do gerador.
     */
    const pdfResumo = await textoDoPdf(page, `${N.base}${hrefCompl}/resumo?formato=pdf`);
    nota(`resumo (PDF) da complementar, início: ${pdfResumo.slice(0, 300)}`);
    const pdfLido = pdfResumo !== "" && !pdfResumo.startsWith("[http");
    /**
     * ⚠️ `mensal de` E NÃO `mensal` — a diferença é a de um passo que falha sem defeito.
     * Corrigido o produto, o título da complementar é "Resumo da folha mensal COMPLEMENTAR de
     * 2029-05", que CONTÉM a cadeia "folha mensal". Proibir a cadeia deixaria este passo vermelho
     * sobre o texto certo. O que não pode aparecer é o título da MENSAL — "folha mensal de".
     */
    R.conferir(
      "8.3 ⚠️ o resumo emitido da COMPLEMENTAR não se intitula resumo da folha MENSAL",
      pdfLido && !/Resumo da folha mensal de/i.test(pdfResumo),
      pdfLido ? pdfResumo.slice(0, 500) : `o PDF não foi lido: ${pdfResumo} (não vale como prova)`
    );
    /**
     * ⚠️ ESTE PASSO PASSOU POR VACUIDADE NA CORRIDA DE 2029, E O MODO É O MAIS CARO DESTA
     * EMPREITADA — a terceira vez que aparece.
     *
     * A asserção era `/complementar/i.test(pdfResumo)` sobre o PDF inteiro. Ela deu VERDE — não
     * porque o documento se identificasse como complementar, mas porque a linha de dados trazia
     * "CPL-29 — Lotacao do percurso da complementar 29", que é o nome da lotação da MINHA FIXTURE.
     * O instrumento casou com o próprio cenário e declarou provado o que o produto não faz: o
     * título dizia, e diz, "Resumo da folha MENSAL".
     *
     * A correção é recortar o CABEÇALHO — as primeiras linhas, antes da tabela — e proibir que a
     * evidência venha de qualquer texto que este percurso mesmo escreveu no banco.
     */
    const cabecalhoDoPdf = pdfResumo.split("\n")[0] ?? "";
    const semFixture = cabecalhoDoPdf.replace(new RegExp(`Lotacao do percurso da complementar ${SUF}|CPL-${SUF}`, "gi"), "");
    nota(`cabeçalho do PDF (sem os nomes da fixture): ${semFixture.slice(0, 300)}`);
    R.conferir(
      "8.4 ⚠️ e o CABEÇALHO dele diz que é complementar — sem contar texto que a própria fixture escreveu",
      pdfLido && /complementar/i.test(semFixture),
      pdfLido ? `cabeçalho="${semFixture.slice(0, 400)}"` : `o PDF não foi lido: ${pdfResumo} (não vale como prova)`
    );

    // ══ 9. A SEGUNDA FOLHA COMPLEMENTAR NA MESMA COMPETÊNCIA — RECUSADA ══════
    //
    // ⚠️ A DECISÃO DE PRODUTO VIGENTE É UMA POR COMPETÊNCIA, e a pendência está nomeada
    // (`SEGUNDA-COMPLEMENTAR-NA-MESMA-COMPETENCIA`). Este passo NÃO constrói a segunda: ele mede o
    // que o operador RECEBE quando tenta — porque é a mensagem, não o desenho, que ele lê. E a
    // complementar acabou de FECHAR: o caso sem saída do MODULO.md é exatamente este.
    await sair(N, page);
    await entrar(N, page, RH, SENHA);
    await irPara(N, page, "/folha/folhas");
    const rSegunda = await preencherEEnviar(page, "criar-folhas", [
      { sel: 'input[name="competencia"]', valor: COMP },
      { sel: 'select[name="tipo"]', valor: "MENSAL_COMPLEMENTAR", tipo: "select" },
    ]);
    nota(`recusa da SEGUNDA complementar: ${rSegunda.tipo} :: ${rSegunda.texto.slice(0, 500)}`);
    R.conferir("9.1 a SEGUNDA folha complementar da mesma competência é RECUSADA, e a recusa chega legível à tela", rSegunda.tipo === "erro" && /FOLHA-JA-ABERTA/i.test(rSegunda.texto), `${rSegunda.tipo}: ${rSegunda.texto.slice(0, 400)}`);
    /**
     * ⚠️ DEFEITO (5) — O REMÉDIO FALSO. A complementar desta competência está FECHADA: mandar
     * "Calcule-a" envia o operador a um ato que a folha já não oferece (`FOLHA-FECHADA`, e a barra
     * nem apresenta o formulário), e ele descobre isso duas telas adiante. É a mesma família do
     * remédio falso que a V11 V9.3 achou na barra do 13º. Este passo não julga o DESENHO — julga
     * se o remédio prometido FUNCIONA no estado em que o operador está.
     */
    R.conferir(
      "9.2 ⚠️ e a orientação é EXECUTÁVEL — não manda calcular uma folha que já está FECHADA",
      rSegunda.tipo === "erro" && !/Calcule-a/i.test(rSegunda.texto),
      rSegunda.texto.slice(0, 400)
    );
    // ⚠️ E A PROVA DE QUE O REMÉDIO É FALSO É O ESTADO DA BARRA, não a minha leitura do texto.
    await irPara(N, page, hrefCompl);
    const calcularNaFechada = await apresentacaoDoAto(page, "calcular");
    nota(`estado de CALCULAR na complementar fechada: ${JSON.stringify(calcularNaFechada).slice(0, 300)}`);
    R.conferir(
      "9.3 (medição do estado) a folha a que a recusa manda o operador NÃO oferece o ato que ela sugere",
      calcularNaFechada.estado !== "formulario",
      JSON.stringify(calcularNaFechada).slice(0, 400)
    );

    // ══ 10. A DIFERENÇA NEGATIVA — recusa e ORIENTAÇÃO ═══════════════════════
    //
    // Competência própria: a mensal fecha com 3.000,00 de vencimento e depois um REAJUSTE
    // retroativo baixa o vencimento para 2.000,00. O recálculo de hoje chega a MENOS do que a
    // folha fechada apurou — e a complementar recusa, porque "pagar o que faltou" não cobra de
    // volta. N=2 importa: M-2 não tem diferença nenhuma, então a recusa não é vacuamente a única
    // coisa que podia acontecer.
    await irPara(N, page, "/folha/folhas");
    const rAbrirNeg = await preencherEEnviar(page, "criar-folhas", [
      { sel: 'input[name="competencia"]', valor: COMP_NEG },
      { sel: 'select[name="tipo"]', valor: "MENSAL", tipo: "select" },
    ]);
    R.conferir("10.1 a mensal da competência do caso negativo abre", rAbrirNeg.tipo === "ok", `${rAbrirNeg.tipo}: ${rAbrirNeg.texto.slice(0, 200)}`);
    const hrefMensalNeg = (await hrefDoRegistro(page, COMP_NEG)) ?? "";
    if (hrefMensalNeg === "") {
      naoExecutado("10.2 a 10.8 o caso da diferença negativa", "a mensal do caso negativo não trouxe link para o detalhe");
    } else {
      await irPara(N, page, hrefMensalNeg);
      await preencherEEnviar(page, "calcular", [{ sel: 'input[name="motivo"]', valor: "mes do caso negativo (percurso)" }]);
      await sair(N, page);
      await entrar(N, page, CONTABILIDADE, SENHA);
      await irPara(N, page, hrefMensalNeg);
      const rFecharNeg = await preencherEEnviar(page, "fechar", []);
      R.conferir("10.2 e ela é calculada e FECHADA", rFecharNeg.tipo === "ok", `${rFecharNeg.tipo}: ${rFecharNeg.texto.slice(0, 200)}`);

      await sair(N, page);
      await entrar(N, page, RH, SENHA);
      await irPara(N, page, `/pessoal/servidores?q=${encodeURIComponent(NOME_M1)}`);
      const fichaM1 = await hrefDoRegistro(page, NOME_M1);
      let reajuste = "a ficha de M-1 não foi encontrada";
      if (fichaM1 !== null) {
        await irPara(N, page, fichaM1);
        const idV = await opcaoQueCasa(page, 'form[data-acao="alterar-remuneracao"] select[name="vinculoId"]', M1);
        if (idV === "") {
          reajuste = "o seletor de alterar remuneração não ofereceu a matrícula";
        } else {
          const rR = await preencherEEnviar(page, "alterar-remuneracao", [
            { sel: 'select[name="vinculoId"]', valor: idV, tipo: "select" },
            { sel: 'select[name="tipo"]', valor: "REAJUSTE_SALARIAL", tipo: "select" },
            // ⚠️ DENTRO da competência: o vencimento que vale é o VIGENTE NO ÚLTIMO DIA dela.
            { sel: 'input[name="data"]', valor: `${COMP_NEG}-10`, tipo: "data" },
            { sel: 'input[data-mascara="valor"]', valor: "2.000,00" },
            { sel: 'input[name="motivo"]', valor: "correcao retroativa de enquadramento (percurso)" },
          ]);
          reajuste = rR.tipo === "ok" ? "" : `${rR.tipo}: ${rR.texto.slice(0, 200)}`;
        }
      }
      R.conferir("10.3 o vencimento de M-1 é corrigido PARA BAIXO dentro da competência já fechada", reajuste === "", reajuste);

      await irPara(N, page, "/folha/folhas");
      const rAbrirComplNeg = await preencherEEnviar(page, "criar-folhas", [
        { sel: 'input[name="competencia"]', valor: COMP_NEG },
        { sel: 'select[name="tipo"]', valor: "MENSAL_COMPLEMENTAR", tipo: "select" },
      ]);
      R.conferir("10.4 a complementar da competência do caso negativo abre", rAbrirComplNeg.tipo === "ok", `${rAbrirComplNeg.tipo}: ${rAbrirComplNeg.texto.slice(0, 200)}`);
      const hrefComplNeg = await page.evaluate((c) => {
        const linha = Array.from(document.querySelectorAll("tbody tr")).find((tr) => (tr.textContent ?? "").includes(c) && /complementar/i.test(tr.textContent ?? ""));
        return (linha?.querySelector("a[href]") as HTMLAnchorElement | null)?.getAttribute("href") ?? "";
      }, COMP_NEG);
      if (hrefComplNeg === "") {
        naoExecutado("10.5 a 10.8 a recusa da diferença negativa", "o link da complementar do caso negativo não apareceu na lista");
      } else {
        await irPara(N, page, hrefComplNeg);
        const rNeg = await preencherEEnviar(page, "calcular", [{ sel: 'input[name="motivo"]', valor: "caso negativo (percurso)" }]);
        nota(`recusa da diferença NEGATIVA: ${rNeg.tipo} :: ${rNeg.texto.slice(0, 900)}`);
        R.conferir(
          "10.5 a diferença NEGATIVA é RECUSADA, com o código e a matrícula na tela",
          rNeg.tipo === "erro" && /COMPLEMENTAR-COM-DIFERENCA-NEGATIVA/i.test(rNeg.texto) && rNeg.texto.includes(M1),
          `${rNeg.tipo}: ${rNeg.texto.slice(0, 600)}`
        );
        /**
         * ⚠️ A RECUSA TEM DE ORIENTAR, NÃO SÓ RECUSAR. Quem a recebe precisa saber (a) qual
         * matrícula e qual rubrica, (b) os DOIS números que não fecham, e (c) o que fazer agora.
         */
        /**
         * ⚠️ OS NÚMEROS SÃO CONFERIDOS NA FORMA EM QUE A MENSAGEM OS ESCREVE, e a forma é `2000.00`
         * — ponto decimal, sem separador de milhar. Exigir `2.000,00` aqui deixaria o passo
         * vermelho por uma divergência que NÃO é a que este percurso investiga, e esconderia a que
         * é. Fica REGISTRADO como observação de interface, não consertado aqui:
         * `MENSAGEM-DA-COMPLEMENTAR-EM-FORMATO-CRU` — a recusa mostra dinheiro ao operador em
         * formato de máquina, enquanto toda tela do sistema mostra pt-BR.
         */
        R.conferir(
          "10.6 e ela ORIENTA: nomeia a rubrica e os DOIS valores que não fecham",
          rNeg.texto.includes(`VENC-${SUF}`) && /2[.,]000[.,]00/.test(rNeg.texto) && /3[.,]000[.,]00/.test(rNeg.texto),
          rNeg.texto.slice(0, 600)
        );
        /**
         * ⚠️ DEFEITO (2) — E NÃO AFIRMA O QUE NÃO VERIFICOU. O que o cálculo consultou foi a folha
         * FECHADA; ele não consultou certificação, empenho, liquidação nem pagamento. Dizer ao
         * operador que "o servidor RECEBEU A MAIS" afirma um recebimento que o sistema não tem
         * como saber: a folha pode ter sido fechada e DEVOLVIDA para correção, e nunca ter sido
         * liquidada nem paga — caso que o próprio MODULO.md documenta para o 13º.
         */
        const afirmacaoIndevida = /RECEBEU A MAIS|RETEVE A MAIS|j[áa] pag/i.exec(rNeg.texto)?.[0] ?? "";
        R.conferir(
          "10.7 ⚠️ e não afirma RECEBIMENTO nem PAGAMENTO — o fato verificado é APURAÇÃO em folha fechada",
          rNeg.texto.length > 0 && afirmacaoIndevida === "",
          `achou "${afirmacaoIndevida}" :: ${rNeg.texto.slice(0, 600)}`
        );
        /**
         * ⚠️ E NADA FOI GRAVADO. A recusa roda ANTES do `create` do cálculo: um cálculo parcial
         * gravado ocuparia o número e deixaria a folha com um fato que ninguém pode explicar.
         * "Efeito colateral antes da operação guardada envenena a tentativa seguinte."
         */
        const negDepois = await irPara(N, page, hrefComplNeg);
        R.conferir("10.8 e NADA foi gravado: a folha continua sem cálculo", !/c[áa]lculo n[ºo]\s*1/i.test(negDepois), negDepois.slice(0, 500));
      }
    }

    // ══ 11. SEM MENSAL FECHADA NÃO HÁ COMPLEMENTO — HÁ DUPLICAÇÃO ════════════
    await irPara(N, page, "/folha/folhas");
    const rAbrirSemMensal = await preencherEEnviar(page, "criar-folhas", [
      { sel: 'input[name="competencia"]', valor: COMP_SEM_MENSAL },
      { sel: 'select[name="tipo"]', valor: "MENSAL_COMPLEMENTAR", tipo: "select" },
    ]);
    R.conferir("11.1 abrir uma complementar de competência sem mensal é PERMITIDO (a guarda é do CÁLCULO, não da abertura)", rAbrirSemMensal.tipo === "ok", `${rAbrirSemMensal.tipo}: ${rAbrirSemMensal.texto.slice(0, 200)}`);
    const hrefSemMensal = (await hrefDoRegistro(page, COMP_SEM_MENSAL)) ?? "";
    if (hrefSemMensal === "") {
      naoExecutado("11.2 e 11.3 a recusa MENSAL-NAO-FECHADA", "o link da complementar sem mensal não apareceu");
    } else {
      await irPara(N, page, hrefSemMensal);
      const rSem = await preencherEEnviar(page, "calcular", [{ sel: 'input[name="motivo"]', valor: "sem mensal (percurso)" }]);
      nota(`recusa MENSAL-NAO-FECHADA: ${rSem.tipo} :: ${rSem.texto.slice(0, 600)}`);
      /**
       * ⚠️ É A GUARDA QUE IMPEDE PAGAR O MÊS DUAS VEZES. Sem mensal apurada, o delta é o valor
       * INTEIRO: a complementar pagaria a competência de novo, com os totais, o empenho e a
       * liquidação fechando e nada acusando adiante.
       */
      R.conferir(
        "11.2 sem mensal fechada o cálculo é RECUSADO — e a recusa diz que pagaria a competência inteira de novo",
        rSem.tipo === "erro" && /MENSAL-NAO-FECHADA/i.test(rSem.texto) && /segunda vez|INTEIRA/i.test(rSem.texto),
        `${rSem.tipo}: ${rSem.texto.slice(0, 600)}`
      );
      R.conferir("11.3 e ela ORIENTA o que fazer: abrir e fechar a mensal antes", /Abra e feche a folha mensal/i.test(rSem.texto), rSem.texto.slice(0, 600));
    }

    // ══ 12. AUTORIZAÇÃO — o par no SERVIDOR, não no botão ════════════════════
    //
    // ⚠️ "BOTÃO OCULTO NÃO É PROTEÇÃO". Os passos 3.5 e 3.6 provam a APRESENTAÇÃO; este prova o
    // SERVIDOR: a tesouraria NÃO tem `CONSULTAR_FOLHA` e pede a rota do detalhe DIRETAMENTE, sem
    // passar por botão nenhum. A proveniência do ator negativo está conferida no cabeçalho.
    await sair(N, page);
    await entrar(N, page, TESOURARIA, SENHA);
    /**
     * ⚠️ CONTROLE POSITIVO DO ATOR NEGATIVO, ANTES DE CONFIAR NA RECUSA.
     *
     * "Não entrou" é compatível com sessão morta, senha errada e tela quebrada — e uma negativa
     * que não separa esses casos prova menos do que afirma. Antes de cobrar a recusa, esta mesma
     * sessão LÊ uma área que ela PODE ler (`CONSULTAR_DESPESA`, que o papel tem). Se este passo
     * falhar, o vermelho do 12.1 não vale como prova de autorização — vale como sessão ruim.
     *
     * ⚠️ E A PROVENIÊNCIA DO ATOR: `tesouraria@` NÃO vem do censo das fixtures da suíte
     * (`test/usuarios-teste.ts`), onde `semearUsuariosDeTeste` dá `ADMIN`/`TODAS_AS_ACOES` a TODA
     * identidade e nenhuma delas serviria de negativa. Ele vem de
     * `percursos-usuarios-por-papel.ts`, que cria perfis RESTRITOS por papel, e as ações dele são
     * vizinhas da vigiada sem serem ela: `CONSULTAR_DESPESA`, `CONSULTAR_RECEITA`,
     * `CONSULTAR_FINANCEIRO`, `CONSULTAR_CADASTROS` — e nenhuma `CONSULTAR_FOLHA`.
     */
    const podeOQueEDele = await barrado(N, page, "/despesa/empenhos");
    R.conferir(
      "12.0 (controle positivo do ator negativo) a sessão da tesouraria está viva e LÊ a área que é dela",
      !podeOQueEDele.barrado,
      `url=${podeOQueEDele.url} status=${podeOQueEDele.status} — sem isto, o vermelho do 12.1 não distingue "sem permissão" de "sessão ruim"`
    );
    const barradoNaFolha = await barrado(N, page, hrefCompl);
    R.conferir(
      "12.1 NEGATIVA no servidor: sem CONSULTAR_FOLHA, a rota do detalhe da complementar é BARRADA",
      barradoNaFolha.barrado,
      `url=${barradoNaFolha.url} status=${barradoNaFolha.status}`
    );
    /**
     * ⚠️ E O DOCUMENTO TAMBÉM. Uma rota de arquivo é a segunda porta da mesma leitura, e ela não
     * passa pela tela: se a autorização morasse só na página, o CSV sairia para quem não pode lê-lo.
     */
    const barradoNoResumo = await page.evaluate(async (u) => (await fetch(u)).status, `${N.base}${hrefCompl}/resumo?formato=csv`);
    R.conferir(
      "12.2 NEGATIVA pareada: o DOCUMENTO da complementar também é barrado — a recusa não é só da tela",
      barradoNoResumo !== 200,
      `status do resumo em CSV: ${barradoNoResumo}`
    );
    await sair(N, page);
    await entrar(N, page, RH, SENHA);
    const leituraDoRh = await irPara(N, page, hrefCompl);
    R.conferir("12.3 POSITIVA pareada: com CONSULTAR_FOLHA, a MESMA rota abre e traz a folha", leituraDoRh.includes(COMP), leituraDoRh.slice(0, 300));
    const resumoDoRh = await page.evaluate(async (u) => (await fetch(u)).status, `${N.base}${hrefCompl}/resumo?formato=csv`);
    R.conferir("12.4 POSITIVA pareada: e o MESMO documento é entregue a quem tem a ação", resumoDoRh === 200, `status do resumo em CSV: ${resumoDoRh}`);

    // ══ 13. FECHADA NÃO SE RECALCULA ═════════════════════════════════════════
    const recalcFechada = await apresentacaoDoAto(page, "calcular");
    R.conferir("13.1 fechada, RECALCULAR sai da barra e a tela diz por quê", recalcFechada.estado === "nao-aplicavel", JSON.stringify(recalcFechada).slice(0, 400));
  } catch (e) {
    R.falhou("execução", e instanceof Error ? e.message : String(e));
  } finally {
    await navegador?.close();
  }
  if (naoExecutados.length > 0) {
    console.error(`\n${naoExecutados.length} passo(s) NAO EXECUTADO(S) — contados como não executados, nunca como aprovados:`);
    for (const n of naoExecutados) console.error(` - ${n}`);
  }
  R.encerrar();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
