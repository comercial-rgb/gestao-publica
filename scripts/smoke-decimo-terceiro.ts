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
 * ═══ PERCURSO DO 13º EM DUAS PARCELAS (M33, V11 V9.1 — escrito na V11 V9.2) ═══
 *
 * O roteiro de QUINZE PASSOS está em `modules/m33-folha/MODULO.md`, seção "O roteiro de quinze
 * passos". Os números dos passos aqui são os de lá, e os valores esperados são os mesmos do par
 * N=2 de `m33-decimo-terceiro.test.ts` — de propósito: a suíte confere pelo BANCO, o percurso
 * confere pela TELA. O que esta execução prova e os 262 testes não provam é a interface
 * ALCANÇANDO o domínio: quatro dos cinco defeitos da V11 V9.1 eram exatamente isso, e nenhum
 * tinha teste vermelho.
 *
 * ═══ OS PAPÉIS, E POR QUE SÃO ESTES ═══
 *   admin           cadastra o PARÂMETRO do 13º
 *   rh@             cadastra rubricas, admite, abre as folhas e CALCULA
 *   contabilidade@  FECHA (é o fechamento que vai ao empenho)
 *
 * ⚠️ NENHUM PAPEL DE PERCURSO TEM `CONFIGURAR_PARAMETRO_DO_DECIMO_TERCEIRO`, e **isso não se
 * conserta concedendo a ação ao `rh@`**. A ação vai só a quem administra permissões no global
 * (derivação v28), porque um erro nela não tem detector adiante: o 13º fecha, o total bate, o
 * empenho bate, e a diferença só aparece no contracheque de quem foi admitido perto da borda do
 * mês. A negativa do passo 5 é EVIDÊNCIA, não obstáculo — alargar a concessão para o percurso
 * passar seria apagar a prova com o motivo dela.
 *
 * ═══ ⚠️ BANCO CLONADO POR EXECUÇÃO — NÃO É PREFERÊNCIA, É O QUE FAZ ESTE PERCURSO RODAR ═══
 *
 * A folha de 13º calcula sobre **TODOS os vínculos vivos do banco**, não só sobre o par que este
 * percurso cria. No banco compartilhado dos percursos vivem as matrículas que `smoke-folha`,
 * `smoke-pessoal` e os demais deixaram — e basta UMA delas sem regime previdenciário, sem
 * vencimento vigente, ou adiantada acima do próprio 13º (`ABATIMENTO-MAIOR-QUE-O-13`) para o
 * cálculo INTEIRO recusar. O percurso ficaria vermelho por vínculo alheio, e quem diagnosticasse
 * iria procurar o defeito no 13º, que não tem nenhum.
 *
 * O precedente é o `smoke-encargos-da-folha.ts`: cada execução no próprio banco clonado,
 * declarado em `PERCURSO_BANCO` e servido por `percursos:servir`. Uso:
 *
 *   PERCURSO_BANCO=gestao_publica_percursos_13o_<sufixo> npm run percursos:servir
 *   PERCURSO_BANCO=gestao_publica_percursos_13o_<sufixo> npm run smoke:decimo-terceiro
 *
 * ⚠️ Rodar sem `PERCURSO_BANCO` é RECUSADO abaixo, com o comando certo — e não seguido "para ver
 * se dá". Um percurso que aceita o banco de todo mundo é um percurso cujo vermelho não se lê.
 *
 * ═══ ⚠️ IDEMPOTÊNCIA — `@@unique([exercicio, tipo])` ═══
 * Existe UMA folha de adiantamento e UMA de 13º por exercício. Reexecutar no mesmo exercício é
 * RECONHECIDO e PULADO COM AVISO (saída 4, distinta do verde e do vermelho): nunca falhar sem
 * motivo, nunca passar em silêncio. Para rodar de novo de verdade, escolha outro exercício:
 *   DECIMO_TERCEIRO_EXERCICIO=2031 npm run smoke:decimo-terceiro
 *
 * ⚠️ TODOS OS VALORES SÃO SINTÉTICOS — o avo de 15 dias, os 12 avos, os 50% e a alíquota de 10%
 * aparecem porque ALGUÉM tem de declará-los para a folha calcular, e é esse o ponto do parâmetro.
 * Nenhum deles afirma norma de ente nenhum.
 */
const N: Navegador = { base: process.argv[2] ?? "http://localhost:3010" };
const SENHA = process.env["PERCURSOS_SENHA_PAPEIS"] ?? "Percurso#2026";
const ADMIN = process.env["SEED_IDENTIDADE"] ?? "admin@cg.pb.gov.br";
const SENHA_ADMIN = process.env["SEED_ADMIN_SENHA"] ?? "";
const RH = "rh@percursos.local";
const CONTABILIDADE = "contabilidade@percursos.local";

/**
 * O exercício do percurso. O padrão é bem à frente do exercício corrente para não disputar com os
 * percursos da folha MENSAL, que vivem no presente do banco.
 */
const EXERCICIO = Number(process.env["DECIMO_TERCEIRO_EXERCICIO"] ?? "2031");
const COMP_ADIANTAMENTO = `${EXERCICIO}-06`;
const COMP_DECIMO = `${EXERCICIO}-12`;
const SUF = String(EXERCICIO).slice(-2);

/** Saída 4 = pulado com aviso. Nem verde (não provou nada) nem vermelho (não há defeito). */
const SAIDA_PULADO = 4;

const R = registroDePassos();
/**
 * ⚠️ CONTADOR PRÓPRIO DO QUE NÃO RODOU (V11 V9.3). `registroDePassos` só conta ok e falha, e este
 * percurso passou a ter um trecho cuja execução depende do que a TELA oferece. Somar um passo não
 * executado aos verdes mentiria; somá-lo às falhas culparia o produto por um estado que ele talvez
 * recuse de propósito. "Passo pulado é passo que não aconteceu" — então ele tem linha própria.
 */
const naoExecutados: string[] = [];
function naoExecutado(passo: string, motivo: string): void {
  naoExecutados.push(`${passo} — ${motivo}`);
  console.error(`[NAO EXECUTADO] ${passo} — ${motivo}`);
}
function nota(texto: string): void {
  console.log(`      [${texto}]`);
}

/**
 * ⚠️ AS MATRÍCULAS SÃO O PAR N=2 DO TESTE, e o par é desigual de propósito.
 * M-1 ano inteiro (12 avos) e M-2 admitida em 20/03 (9 avos: março rende 11 dias, abaixo do
 * mínimo de 15; janeiro e fevereiro são anteriores ao vínculo). Com uma matrícula só, "abater
 * valor fixo" e "abater o do vínculo errado" passariam por vacuidade.
 *
 * O vencimento de M-2 é 2.401,00 — e não 2.400,00 — para que 9/12 da base caia num EMPATE EXATO
 * (2.641,10 × 0,75 = 1.980,825) e o arredondamento half-even fique load-bearing: half-up daria
 * 1.980,83. Se a tela mostrar 1.980,83, a regra de arredondamento do sistema mudou.
 */
const M1 = `D13A-${SUF}`;
const M2 = `D13B-${SUF}`;
const NOME_M1 = `Decimo Terceiro A ${SUF}`;
/** A servidora do quadro — é a conta dela que tem de alcançar o PRÓPRIO contracheque de 13º. */
const SERVIDORA = "servidor@percursos.local";

/**
 * CPF sintético COM dígito verificador.
 *
 * ⚠️ O cadastro único valida o DV, e onze dígitos quaisquer são recusados — foi o que fez a
 * primeira corrida deste percurso não criar ninguém e falhar sete telas adiante.
 *
 * ⚠️ `PERCURSOS-SEM-HELPER-COMUM`: esta é a terceira cópia (`smoke-folha.ts`,
 * `smoke-portal-do-servidor.ts`). O lugar dela é `percursos-navegador.ts`, que nesta rodada é de
 * outra frente e não se toca. Fica nomeado, não escondido.
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
 * Os rótulos de um grupo de CHECKBOXES com o mesmo `name`, e os `value` de cada um.
 *
 * ⚠️ ISTO EXISTE PORQUE O RECORTE DA BASE NÃO É UM `select`. As rubricas da base do 13º são
 * caixas de marcação (`FormParametroDo13`), e `opcoesDe` — que exige `HTMLSelectElement` —
 * devolvia LISTA VAZIA para elas. A asserção "a base não oferece horas extras" passava por
 * VACUIDADE: nada não contém nada. Um instrumento verde por não achar o que vigia é pior que
 * instrumento nenhum, e este repositório já pagou quatro vezes por essa família de defeito.
 */
async function caixasDe(page: Page, seletor: string): Promise<readonly { readonly rotulo: string; readonly valor: string }[]> {
  return page.evaluate((sel) => {
    return Array.from(document.querySelectorAll(sel)).map((el) => {
      const i = el as HTMLInputElement;
      return { rotulo: (i.closest("label")?.textContent ?? "").trim(), valor: i.value };
    });
  }, seletor);
}

async function main(): Promise<void> {
  if (SENHA_ADMIN === "") {
    console.error("[FALHA] SEED_ADMIN_SENHA não está no ambiente — o parâmetro do 13º só o admin cadastra.");
    process.exit(3);
  }
  /**
   * ⚠️ RECUSA ANTES DO PRIMEIRO CLIQUE, e é bloqueio de AMBIENTE (saída 3), não passo vermelho.
   * Ver o cabeçalho: sem banco próprio, um vínculo alheio derruba o cálculo inteiro e o vermelho
   * aponta para o lugar errado.
   */
  const banco = process.env["PERCURSO_BANCO"] ?? "";
  if (banco === "") {
    console.error(
      "[FALHA] PERCURSO_BANCO não declarado. A folha de 13º calcula sobre TODOS os vínculos do banco:\n" +
        "        no banco compartilhado, uma matrícula alheia sem regime ou já adiantada acima do próprio\n" +
        "        13º derruba o cálculo inteiro, e o vermelho não é deste percurso.\n" +
        "        Use um banco clonado por execução (o padrão do smoke-encargos-da-folha):\n" +
        `          PERCURSO_BANCO=gestao_publica_percursos_13o_${SUF} npm run percursos:servir\n` +
        `          PERCURSO_BANCO=gestao_publica_percursos_13o_${SUF} npm run smoke:decimo-terceiro`
    );
    process.exit(3);
  }
  console.log(`      [exercício ${EXERCICIO} · banco ${banco} · par ${M1} e ${M2}]`);
  let navegador: Browser | null = null;
  try {
    navegador = await lancarNavegadorDoPercurso();
    const page = await navegador.newPage();

    // ══ 1. A LANDING LEVA ÀS TELAS ═══════════════════════════════════════════
    await entrar(N, page, RH, SENHA);
    const landing = await irPara(N, page, "/folha");
    /**
     * ⚠️ AS QUATRO QUE FICARAM UM ANO ESCONDIDAS. Até `38c4f2a` esta landing tinha lista própria,
     * escrita à mão, e ela divergiu de `lib/navegacao.ts`: o submenu levava a encargos, grupos de
     * empenho, designações e eSocial, e a landing — por onde o servidor municipal ENTRA — não
     * tinha card para nenhum dos quatro. Conferir os nove é o que impede a divergência de voltar
     * por outro caminho.
     */
    const cards = ["folhas de pagamento", "rubricas", "lançamentos", "tabelas do ente", "parâmetros do 13º", "grupos de empenho", "encargos do empregador", "designações", "eSocial"];
    const faltando = cards.filter((c) => !landing.includes(c.toLowerCase()));
    R.conferir("1 a landing da folha lista as nove telas da área (as quatro que ficaram escondidas incluídas)", faltando.length === 0, `faltaram: ${faltando.join(", ")}`);

    // ══ 2. O SELECT DE NATUREZA OFERECE O ABATIMENTO ═════════════════════════
    await irPara(N, page, "/folha/rubricas");
    const naturezas = await opcoesDe(page, 'form[data-acao="criar-rubricas"] select[name="natureza"]');
    /**
     * ⚠️ ESTE É O DEFEITO Nº 1 DA V11 V9.1, VISTO PELA TELA. Sem esta opção a rubrica que o motor
     * do 13º sabe ler é INCADASTRÁVEL: a cadeia existe no domínio e não pela interface, a 2ª
     * parcela nunca abate a 1ª, e o ente paga o 13º INTEIRO a quem já recebeu metade — com todos
     * os totais fechando e nenhum teste vermelho.
     */
    R.conferir("2 o select de NATUREZA oferece o abatimento do adiantamento do 13º", naturezas.some((o) => /abatimento/i.test(o)), naturezas.join(" | "));

    // ══ 3. NEGATIVA: o abatimento cadastrado como PROVENTO é recusado ════════
    const rProvento = await preencherEEnviar(page, "criar-rubricas", [
      { sel: 'input[name="codigo"]', valor: `ABTX${SUF}` },
      { sel: 'input[name="descricao"]', valor: "Abatimento cadastrado como provento (percurso)" },
      { sel: 'select[name="tipo"]', valor: "PROVENTO", tipo: "select" },
      { sel: 'select[name="natureza"]', valor: "ABATIMENTO_DO_ADIANTAMENTO_DO_13", tipo: "select" },
      { sel: 'input[name="ordem"]', valor: "96" },
      { sel: 'input[name="fundamentacaoLegal"]', valor: "percurso sintetico" },
    ]);
    R.conferir(
      "3 NEGATIVA: a rubrica de abatimento como PROVENTO é RECUSADA, e a recusa chega legível à tela",
      rProvento.tipo === "erro" && /é DESCONTO/i.test(rProvento.texto),
      `${rProvento.tipo}: ${rProvento.texto.slice(0, 300)}`
    );

    // ══ 4. AS RUBRICAS DO 13º E DA BASE ══════════════════════════════════════
    const rubrica = async (codigo: string, descricao: string, tipo: string, natureza: string, ordem: string, percentual?: string): Promise<boolean> => {
      const campos = [
        { sel: 'input[name="codigo"]', valor: codigo },
        { sel: 'input[name="descricao"]', valor: descricao },
        { sel: 'select[name="tipo"]', valor: tipo, tipo: "select" as const },
        { sel: 'select[name="natureza"]', valor: natureza, tipo: "select" as const },
        { sel: 'input[name="ordem"]', valor: ordem },
        { sel: 'input[name="fundamentacaoLegal"]', valor: "percurso sintetico" },
        ...(percentual === undefined ? [] : [{ sel: 'input[name="percentual"]', valor: percentual }]),
      ];
      const r = await preencherEEnviar(page, "criar-rubricas", campos);
      // ⚠️ REEXECUÇÃO É REUSO, E SÃO DUAS RECUSAS DIFERENTES: o código repetido volta erro de
      // unicidade, e a natureza SISTÊMICA repetida volta `RUBRICA-SISTEMICA-DUPLICADA` (ela existe
      // uma vez por ente). A segunda faltava, e por isso a quarta corrida acusou as quatro
      // sistêmicas como falha quando elas apenas já estavam lá.
      return r.tipo === "ok" || /já existe|unique|sistemica-duplicada|sistêmica-duplicada/i.test(r.texto);
    };
    /**
     * ⚠️ AS SISTÊMICAS NÃO SE CRIAM DE NOVO. `VENCIMENTO_BASE`, `GRATIFICACOES_DO_VINCULO`,
     * `CONTRIBUICAO_PREVIDENCIARIA`, `IMPOSTO_DE_RENDA` e `SALARIO_FAMILIA` existem UMA vez por
     * ente (`NATUREZAS_SISTEMICAS`), e a segunda tentativa é recusada com
     * `RUBRICA-SISTEMICA-DUPLICADA`. O percurso REUSA as que o banco já tem — e a base do 13º as
     * escolhe por ID no parâmetro, então não há ambiguidade. O que ele cria é só o que é DELE:
     * as três do 13º e o adicional por percentual.
     */
    /**
     * ⚠️ AS SISTÊMICAS TAMBÉM SE CRIAM QUANDO FALTAM — achado da segunda corrida. Eu supunha que
     * o banco clonado trazia `VENCIMENTO_BASE`, `CONTRIBUICAO_PREVIDENCIARIA` e companhia, porque
     * o `smoke-folha` as cria. Este clone não as tinha, e o cálculo recusou com `RUBRICA-AUSENTE`
     * (contribuição). Pior que a recusa: a base do parâmetro ficou só com o adicional, e os
     * valores esperados deste percurso estariam apoiados numa base que não é a que eu declaro.
     *
     * Elas existem UMA vez por ente (`NATUREZAS_SISTEMICAS`), então a segunda tentativa volta
     * `RUBRICA-SISTEMICA-DUPLICADA` — que aqui é REUSO, não falha.
     */
    const feitas = [
      await rubrica(`VENC-${SUF}`, "Vencimento base (percurso)", "PROVENTO", "VENCIMENTO_BASE", "1"),
      await rubrica(`GRAT-${SUF}`, "Gratificacoes do vinculo (percurso)", "PROVENTO", "GRATIFICACOES_DO_VINCULO", "2"),
      await rubrica(`PREV-${SUF}`, "Contribuicao previdenciaria (percurso)", "DESCONTO", "CONTRIBUICAO_PREVIDENCIARIA", "90"),
      await rubrica(`IRRF-${SUF}`, "Imposto de renda (percurso)", "DESCONTO", "IMPOSTO_DE_RENDA", "91"),
      await rubrica(`D13-${SUF}`, "13o salario (percurso)", "PROVENTO", "VALOR_INFORMADO", "10"),
      await rubrica(`ADI-${SUF}`, "Adiantamento do 13o (percurso)", "PROVENTO", "VALOR_INFORMADO", "11"),
      await rubrica(`ABT-${SUF}`, "Abatimento do adiantamento do 13o (percurso)", "DESCONTO", "ABATIMENTO_DO_ADIANTAMENTO_DO_13", "95"),
      // ⚠️ O percentual entra EM PORCENTO ("10" = 10%), como o rótulo do campo diz e como a borda
      // converte (`folha-dados.ts`, `new Decimal(decimalDaTela(pct)).div(100)`).
      await rubrica(`QUIN-${SUF}`, "Adicional por tempo de servico (percurso)", "PROVENTO", "PERCENTUAL_DO_VENCIMENTO", "4", "10"),
    ];
    R.conferir("4.1 as rubricas do 13º e a da base por percentual estão cadastradas", feitas.every((x) => x), `resultados: ${feitas.join(", ")}`);

    // ── 4.2 O PAR N=2 QUE A FOLHA VAI PAGAR ──────────────────────────────────
    /**
     * ⚠️ AS DUAS MATRÍCULAS SÃO CRIADAS AQUI, e não pressupostas no banco. Um percurso que
     * calculasse sobre "os vínculos que houver" afirmaria números que dependem do que a corrida
     * anterior deixou — e a primeira divergência seria lida como defeito do 13º.
     *
     * M-1: admitida em 01/01 de dois anos antes → 12 avos; vencimento 3.000,00 + gratificação 500,00
     * M-2: admitida em 20/03 do exercício       →  9 avos; vencimento 2.401,00, sem gratificação
     */
    // O cargo e a lotação do percurso — num banco clonado eles podem não existir, e a admissão
    // exige os dois. Reusados quando já estão lá.
    await irPara(N, page, "/pessoal/cargos");
    if (!(await texto(page)).includes(`13o-${SUF}`.toLowerCase())) {
      await preencherEEnviar(page, "criar-cargos", [
        { sel: 'input[name="codigo"]', valor: `13O-${SUF}` },
        { sel: 'input[name="denominacao"]', valor: `Cargo do percurso do 13o ${SUF}` },
        { sel: 'select[name="tipo"]', valor: "EFETIVO", tipo: "select" },
        { sel: 'input[name="vagasFixadas"]', valor: "10" },
        { sel: 'input[name="leiAutorizativa"]', valor: "Lei Municipal 1.234/2010 (percurso)" },
        { sel: 'input[name="dataPublicacaoLei"]', valor: "2010-05-01", tipo: "data" },
      ]);
    }
    await irPara(N, page, "/pessoal/lotacoes");
    if (!(await texto(page)).includes(`13o-${SUF}`.toLowerCase())) {
      await preencherEEnviar(page, "criar-lotacoes", [
        { sel: 'input[name="codigo"]', valor: `13O-${SUF}` },
        { sel: 'input[name="nome"]', valor: `Lotacao do percurso do 13o ${SUF}` },
      ]);
    }

    /**
     * ⚠️ DEVOLVE O MOTIVO, NÃO UM `false`. A primeira corrida deste percurso falhou com
     * "M-1=false M-2=false" e mais nada — sete telas atrás do ponto onde a coisa realmente
     * quebrou (o CPF sem dígito verificador). Uma fixture que falha sem dizer ONDE custa uma
     * execução inteira para diagnosticar, e esta custa um `next build`.
     */
    /**
     * ═══ AS TABELAS DO EXERCÍCIO — sem elas nada calcula, e com elas o percurso vira determinístico ═══
     *
     * ⚠️ ISTO MUDOU O QUE O PERCURSO AFIRMA, e a mudança é deliberada. Na primeira corrida o
     * cálculo recusou com `TABELA-AUSENTE` (IRRF em 2031-06): as tabelas do banco dos percursos
     * não alcançam o exercício deste roteiro. Eu havia decidido NÃO afirmar os líquidos
     * justamente porque a tabela do banco tem faixas 7,5/9/14 e a fixture da suíte presume 10%
     * lineares — mas agora o percurso declara as PRÓPRIAS tabelas, começando em ${EXERCICIO}-01, e
     * `escolherVigente` fica com a de início mais recente. A contribuição deixa de depender do que
     * o banco tinha, e os líquidos passam a ser exigíveis — o que é estritamente mais forte.
     *
     * ⚠️ As alíquotas vão EM PORCENTO ("10"), como a tela pede, e são SINTÉTICAS: não afirmam
     * norma nenhuma. O IRRF é zerado de propósito — o que este percurso mede é o 13º, e uma
     * tabela progressiva faria o esperado depender de uma conta que já tem teste próprio.
     */
    const tabela = async (tipo: string, campos: readonly { readonly sel: string; readonly valor: string; readonly tipo?: "select" | "data" | "marcar" }[]): Promise<boolean> => {
      const r = await preencherEEnviar(page, "criar-tabela", [
        { sel: 'select[name="tipo"]', valor: tipo, tipo: "select" },
        { sel: 'input[name="competenciaInicio"]', valor: `${EXERCICIO}-01` },
        { sel: 'input[name="fundamentacaoLegal"]', valor: `FIXTURE sintetica do percurso do 13o (${EXERCICIO})` },
        ...campos,
      ]);
      // reexecução: a tabela que já existe volta como TABELA-AMBIGUA, e isso é REUSO
      return r.tipo === "ok" || /ambígua|ambigua|já existe/i.test(r.texto);
    };
    await irPara(N, page, "/folha/tabelas");
    const tabRgps = await tabela("CONTRIBUICAO_RGPS", [{ sel: 'input[name="faixas.0.aliquota"]', valor: "10" }]);
    await irPara(N, page, "/folha/tabelas");
    const tabIrrf = await tabela("IRRF", [
      { sel: 'input[name="deducaoPorDependente"]', valor: "0,00" },
      { sel: 'input[name="faixas.0.aliquota"]', valor: "0" },
    ]);
    R.conferir(`4.0 as tabelas do exercício ${EXERCICIO} estão vigentes (contribuição 10% linear, IRRF zerado — sintéticas)`, tabRgps && tabIrrf, `RGPS=${tabRgps} IRRF=${tabIrrf}`);

    const criarMatricula = async (matricula: string, nome: string, semente: string, admissao: string, salario: string, gratificacao: string | null): Promise<string> => {
      await irPara(N, page, "/cadastros/pessoas");
      const rPessoa = await preencherEEnviar(page, "cadastrar-pessoa", [
        // ⚠️ CPF COM DÍGITO VERIFICADOR. Onze dígitos quaisquer NÃO passam: o cadastro único
        // valida o DV, e foi por isso que a primeira corrida não criou ninguém.
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
      // ⚠️ POR TEXTO DE VERDADE, NUNCA POR "". `includes("")` casa com TUDO e devolvia o
      // placeholder vazio do seletor — que eu então descartava, mandando a admissão sem cargo.
      const cargo = await opcaoQueCasa(page, 'form[data-acao="admitir"] select[name="cargoId"]', `13O-${SUF}`);
      const lotacao = await opcaoQueCasa(page, 'form[data-acao="admitir"] select[name="lotacaoId"]', `13O-${SUF}`);
      if (cargo === "" || lotacao === "") return `o seletor da admissão não ofereceu cargo (${cargo === "" ? "vazio" : "ok"}) ou lotação (${lotacao === "" ? "vazio" : "ok"}) 13O-${SUF}`;
      const rAdm = await preencherEEnviar(page, "admitir", [
        { sel: 'input[name="matricula"]', valor: matricula },
        { sel: 'select[name="tipo"]', valor: "EFETIVO", tipo: "select" },
        { sel: 'input[name="regimeJuridico"]', valor: "Estatutario" },
        // ⚠️ O REGIME É O QUE ESCOLHE A TABELA. Sem ele o cálculo recusa nomeando a matrícula.
        { sel: 'select[name="regimePrevidenciario"]', valor: "RGPS", tipo: "select" },
        { sel: 'input[name="dataAdmissao"]', valor: admissao, tipo: "data" },
        { sel: 'select[name="cargoId"]', valor: cargo, tipo: "select" },
        { sel: 'select[name="lotacaoId"]', valor: lotacao, tipo: "select" },
        { sel: 'input[data-mascara="valor"]', valor: salario },
      ]);
      if (rAdm.tipo === "erro" && !/já existe|unique/i.test(rAdm.texto)) return `admitir: ${rAdm.texto.slice(0, 160)}`;
      if (gratificacao !== null) {
        await irPara(N, page, href);
        const idVinculo = await opcaoQueCasa(page, 'form[data-acao="alterar-remuneracao"] select[name="vinculoId"]', matricula);
        if (idVinculo === "") return `o seletor de alterar remuneração não ofereceu a matrícula ${matricula}`;
        const rGrat = await preencherEEnviar(page, "alterar-remuneracao", [
          { sel: 'select[name="vinculoId"]', valor: idVinculo, tipo: "select" },
          { sel: 'select[name="tipo"]', valor: "GRATIFICACAO", tipo: "select" },
          { sel: 'input[name="data"]', valor: `${EXERCICIO - 1}-01-02`, tipo: "data" },
          { sel: 'input[name="gratificacaoDescricao"]', valor: "Funcao gratificada (percurso)" },
          /**
           * ⚠️ `indice: 1`, E É O CONSERTO DE UM DEFEITO REAL DA PRIMEIRA CORRIDA. O campo de
           * dinheiro do molde põe a máscara no input VISÍVEL (sem `name`) e o `name` num input
           * OCULTO — então `input[data-mascara="valor"]` casa com TODOS os campos de dinheiro do
           * formulário, e o primeiro aqui é `salarioBase`. Sem o índice, os 500,00 iam para o
           * salário-base e a gratificação ficava vazia: a tela recusou com as duas mensagens
           * certas ("GRATIFICACAO exige descrição E valor" e "Gratificação é parcela ADICIONAL").
           * A ordem é a do descritor de `alterar-remuneracao`: salarioBase, depois gratificacaoValor.
           */
          { sel: 'input[data-mascara="valor"]', valor: gratificacao, indice: 1 },
          { sel: 'input[name="motivo"]', valor: "Designacao para funcao gratificada (percurso)" },
        ]);
        if (rGrat.tipo === "erro") return `alterar-remuneracao: ${rGrat.texto.slice(0, 160)}`;
      }
      return "";
    };
    // ⚠️ SEMENTES DIFERENTES: o mesmo `Date.now()` nas duas chamadas gerava o MESMO CPF, e a
    // segunda pessoa colidiria com a primeira no cadastro único.
    const CPF_M1 = cpfFicticio(`1${SUF}000001`);
    const m1 = await criarMatricula(M1, NOME_M1, `1${SUF}000001`, `${EXERCICIO - 2}-01-01`, "3.000,00", "500,00");
    const m2 = await criarMatricula(M2, `Decimo Terceiro B ${SUF}`, `2${SUF}000002`, `${EXERCICIO}-03-20`, "2.401,00", null);
    R.conferir("4.2 o par N=2 está admitido: uma o ano inteiro, outra em 20/03 do exercício", m1 === "" && m2 === "", `M-1: ${m1 === "" ? "ok" : m1} · M-2: ${m2 === "" ? "ok" : m2}`);

    // ══ 5. NEGATIVA DE AUTORIZAÇÃO: o rh@ não configura o parâmetro do 13º ═══
    const paramComoRh = await irPara(N, page, "/folha/parametros-do-13");
    const temFormulario = (await page.$('form[data-acao="criar-parametro-do-13"]')) !== null;
    /**
     * ⚠️ A NEGATIVA AFIRMA O MOTIVO, não só a ausência do botão. "Não apareceu formulário" é
     * compatível com a tela ter quebrado. O que se exige é a tela NOMEANDO a ação que falta — e
     * botão oculto não é proteção: a recusa de verdade está no caso de uso, e tem teste próprio
     * (`m33-decimo-terceiro.test.ts`, "sem a ação, recusa NOMEANDO-A e não grava nada").
     */
    R.conferir(
      "5 NEGATIVA: o RH lê a lista de parâmetros do 13º e NÃO recebe o formulário — a tela nomeia a ação que falta",
      !temFormulario && /CONFIGURAR_PARAMETRO_DO_DECIMO_TERCEIRO/.test(paramComoRh.toUpperCase()),
      `formulário presente=${temFormulario}; ${paramComoRh.slice(0, 300)}`
    );

    // ══ 6. O RECORTE DOS SELETORES DO PARÂMETRO ══════════════════════════════
    await sair(N, page);
    await entrar(N, page, ADMIN, SENHA_ADMIN);
    await irPara(N, page, "/folha/parametros-do-13");
    const form = 'form[data-acao="criar-parametro-do-13"]';
    // ⚠️ A base é um grupo de CHECKBOXES, não um `select` — ver `caixasDe`.
    const caixasDaBase = await caixasDe(page, `${form} input[type="checkbox"][name="rubricasDaBase"]`);
    const daBase = caixasDaBase.map((c) => c.rotulo);
    const doAbatimento = await opcoesDe(page, `${form} select[name="rubricaDoAbatimentoId"]`);
    /**
     * ⚠️ O RECORTE É A REGRA VISTA PELA TELA. A base do 13º admite só vencimento, gratificações do
     * vínculo e percentual do vencimento: valor informado e fórmula exigiriam a MÉDIA das
     * variáveis do ano (TR 5.12.82), que este sistema não calcula. E o abatimento só aceita a
     * natureza própria — é ela que faz o motor buscar o valor na OUTRA folha, e nenhuma outra o
     * faz. Um seletor largo aqui é um formulário bonito que grava a folha errada.
     */
    /**
     * ⚠️ A ASSERÇÃO EXIGE A LISTA NÃO-VAZIA, e isso não é zelo: "a base não oferece horas extras"
     * é trivialmente verdadeiro quando a base não oferece NADA. Foi assim que este passo passou
     * por vacuidade na primeira escrita, lendo um `select` que não existe. O piso é frouxo de
     * propósito — afirma "a varredura achou o recorte", não "o recorte tem este tamanho".
     */
    R.conferir(
      "6.1 o recorte da BASE existe e não oferece rubrica de valor informado (horas extras)",
      daBase.length > 0 && !daBase.some((o) => /horas extras/i.test(o)),
      `${daBase.length} caixa(s): ${daBase.join(" | ")}`
    );
    R.conferir("6.2 o seletor do ABATIMENTO oferece só a natureza própria — contribuição não aparece", doAbatimento.length > 0 && !doAbatimento.some((o) => /contribui/i.test(o)), doAbatimento.join(" | "));

    // ══ 7. NEGATIVA DE COERÊNCIA DO ATO ══════════════════════════════════════
    const idD13 = await opcaoQueCasa(page, `${form} select[name="rubricaDoDecimoTerceiroId"]`, `D13-${SUF}`);
    const idAdi = await opcaoQueCasa(page, `${form} select[name="rubricaDoAdiantamentoId"]`, `ADI-${SUF}`);
    const idAbt = await opcaoQueCasa(page, `${form} select[name="rubricaDoAbatimentoId"]`, `ABT-${SUF}`);
    /**
     * ⚠️ A BASE É OBRIGATÓRIA, E ESQUECÊ-LA NÃO PASSA EM SILÊNCIO: sem rubrica nenhuma o 13º de
     * todo servidor sairia ZERO, e um zero calculado é indistinguível de um zero devido — é por
     * isso que existe `BASE-DO-13-VAZIA`. Aqui ela é vencimento-base (a sistêmica que o banco já
     * tem) mais o adicional por percentual criado no passo 4.
     */
    const caixa = (trecho: RegExp): string => caixasDaBase.find((c) => trecho.test(c.rotulo))?.valor ?? "";
    const idVenc = caixa(/vencimento/i);
    const idGrat = caixa(/gratifica/i);
    const idQuin = caixa(new RegExp(`QUIN-${SUF}`, "i"));
    /**
     * ⚠️ A BASE DECLARADA TEM DE SER A BASE QUE O PERCURSO AFIRMA — e isto é conserto de uma
     * vacuidade da segunda corrida. O passo 6.1 só exigia que a lista existisse e não trouxesse
     * horas extras; ela existia com UMA caixa (o adicional), o vencimento nem estava lá, e o
     * parâmetro foi gravado com uma base que não produz 3.800,00 nem 2.641,10. Os valores
     * esperados adiante seriam afirmados sobre uma base diferente da declarada — o percurso
     * "passaria" medindo outra coisa.
     */
    R.conferir(
      "6.3 as três rubricas da base declarada estão ofertadas (vencimento, gratificações e o adicional)",
      idVenc !== "" && idGrat !== "" && idQuin !== "",
      `venc=${idVenc === "" ? "AUSENTE" : "ok"} grat=${idGrat === "" ? "AUSENTE" : "ok"} quin=${idQuin === "" ? "AUSENTE" : "ok"} · caixas: ${daBase.join(" | ")}`
    );
    const camposDoParametro = (ementa: string): readonly { readonly sel: string; readonly valor: string; readonly tipo?: "select" | "data" | "marcar" | "referencia" | "arquivo" }[] => [
      { sel: 'input[name="exercicio"]', valor: String(EXERCICIO) },
      { sel: 'input[name="diasMinimosDoAvo"]', valor: "15" },
      { sel: 'input[name="avosNoExercicio"]', valor: "12" },
      // ⚠️ EM PORCENTO, como a norma escreve. A tela recebe "50" e a borda converte para 0,5000;
      // o CHECK do banco exige [0,1]. Sem a conversão de borda esta tela nunca gravaria nada.
      { sel: 'input[name="percentualDaPrimeiraParcela"]', valor: "50" },
      { sel: 'select[name="baseDosAvosDoAdiantamento"]', valor: "EXERCICIO_INTEIRO", tipo: "select" as const },
      // ⚠️ AS INCIDÊNCIAS SÃO DECLARADAS, não deixadas no padrão: o 13º sofre contribuição neste
      // parâmetro sintético, e o IRRF não. A 1ª parcela não sofre nenhum dos dois — isso é limite
      // do sistema (`INCIDENCIA-NA-PRIMEIRA-PARCELA`) e não depende desta caixa.
      { sel: 'input[name="decimoTerceiroSofreContribuicao"]', valor: "sim", tipo: "marcar" as const },
      { sel: 'select[name="rubricaDoDecimoTerceiroId"]', valor: idD13, tipo: "select" as const },
      { sel: 'select[name="rubricaDoAdiantamentoId"]', valor: idAdi, tipo: "select" as const },
      { sel: 'select[name="rubricaDoAbatimentoId"]', valor: idAbt, tipo: "select" as const },
      // ⚠️ CAIXAS DE MARCAÇÃO, uma por rubrica da base — `value` é o id, e marcar é o ato.
      ...(idVenc === "" ? [] : [{ sel: `input[name="rubricasDaBase"][value="${idVenc}"]`, valor: "sim", tipo: "marcar" as const }]),
      ...(idGrat === "" ? [] : [{ sel: `input[name="rubricasDaBase"][value="${idGrat}"]`, valor: "sim", tipo: "marcar" as const }]),
      ...(idQuin === "" ? [] : [{ sel: `input[name="rubricasDaBase"][value="${idQuin}"]`, valor: "sim", tipo: "marcar" as const }]),
      // ⚠️ `atoEsfera` é OBRIGATÓRIO e eu o havia esquecido: sem ele o formulário não passa na
      // validação do navegador e nada é enviado — silêncio, não recusa.
      { sel: 'select[name="atoEsfera"]', valor: "MUNICIPAL", tipo: "select" as const },
      { sel: 'select[name="atoTipo"]', valor: "ESTATUTO_DOS_SERVIDORES", tipo: "select" as const },
      { sel: 'input[name="atoNumero"]', valor: "1.234" },
      { sel: 'input[name="atoAno"]', valor: "2010" },
      { sel: 'input[name="atoDispositivo"]', valor: "art. 78, § 2º" },
      { sel: 'textarea[name="atoEmenta"]', valor: ementa },
    ];
    /**
     * ⚠️ "conforme a legislação vigente" TEM 29 CARACTERES e passa por qualquer piso de
     * comprimento — por isso a conferência é de COERÊNCIA, não de tamanho. Aqui uma ementa de UMA
     * palavra: rótulo não é citação.
     */
    const rAto = await preencherEEnviar(page, "criar-parametro-do-13", camposDoParametro("Natalina"));
    R.conferir(
      "7 NEGATIVA: ato com ementa de uma palavra é recusado, e a recusa chega legível à tela",
      rAto.tipo === "erro" && /ATO-INCOERENTE/i.test(rAto.texto) && /três palavras/i.test(rAto.texto),
      `${rAto.tipo}: ${rAto.texto.slice(0, 300)}`
    );

    // ══ 8. O PARÂMETRO GRAVADO, COM O PERCENTUAL EM PORCENTO ═════════════════
    await preencherEEnviar(page, "criar-parametro-do-13", camposDoParametro("Dispoe sobre a gratificacao natalina dos servidores do Municipio"));
    /**
     * ⚠️ AFIRMADO PELO EFEITO, NÃO PELA RESPOSTA DO FORMULÁRIO — e por um motivo achado na
     * primeira corrida: `FormParametroDo13` é escrito à mão e NÃO emite
     * `data-resultado-da-acao`; ele mostra `role="alert"` / `role="status"` soltos. O helper
     * esperou o marcador e leu "silêncio" — e o parâmetro TINHA sido gravado (o cálculo adiante
     * falhou por falta de TABELA, não por falta de parâmetro).
     *
     * Conferir pela lista recarregada é o que a casa manda de qualquer jeito: afirme o efeito.
     * Fica nomeada a lacuna de interface: `PARAMETRO-DO-13-SEM-MARCADOR-DE-RESULTADO` — todo
     * formulário do sistema emite o marcador; este não. Não foi consertado aqui porque mudar a
     * tela por conveniência do percurso é o rabo abanando o cachorro.
     */
    const listaParam = await irPara(N, page, "/folha/parametros-do-13");
    R.conferir(
      "8.1 o parâmetro do exercício está GRAVADO, conferido na lista recarregada (o formulário não emite marcador de resultado)",
      listaParam.includes(String(EXERCICIO)) && listaParam.includes("1.234"),
      listaParam.slice(0, 500)
    );
    /**
     * ⚠️ O PERCENTUAL EM PORCENTO É O DEFEITO DE PRODUTO DA V11 V9.1 VISTO PELA TELA: a tela
     * recebe "50", o parâmetro guarda fração, e sem a conversão de borda o CHECK
     * `ck_parametro_13_percentual_primeira` recusaria tudo. `50,00%` é a forma exata que a lista
     * renderiza — `/50/` sozinho casaria com qualquer "2050" da página.
     */
    R.conferir(
      "8.2 a lista mostra o percentual em pt-BR (50,00%), e não a fração crua nem o ponto",
      /50,00\s*%/.test(listaParam) && !/0[.,]5000/.test(listaParam),
      listaParam.slice(0, 500)
    );

    // ══ 16. O CRITÉRIO DO ABATIMENTO NA TELA, E A RECUSA ESTRUTURAL DE "PAGO" ══
    //
    // ⚠️ POR QUE ESTE PASSO EXISTE (V11 V9.3). O critério do abatimento nasceu coberto pela suíte
    // (`m33-criterio-do-abatimento.test.ts`) e SEM percurso — e é exatamente nessa faixa que a
    // V11 V9.2 achou quatro defeitos de interface que 262 testes não pegaram. O que só a tela
    // alcança: que o `select` EXISTA com as quatro opções, que a ausência seja uma opção NOMEADA
    // (e não um branco mudo), e que a recusa de "PAGO" chegue LEGÍVEL a quem escolheu.
    const formParam = await page.evaluate(() => {
      const sel = document.querySelector('form[data-acao="criar-parametro-do-13"] select[name="estadoMinimoDoAdiantamentoParaAbater"]');
      if (!(sel instanceof HTMLSelectElement)) return null;
      const rotulo = (sel.closest("label")?.textContent ?? "").replace(/\s+/g, " ").trim();
      return {
        opcoes: Array.from(sel.options).map((o) => o.value),
        textoDoVazio: Array.from(sel.options).find((o) => o.value === "")?.textContent?.trim() ?? "",
        exigido: sel.required,
        padrao: sel.value,
        rotulo,
      };
    });
    if (formParam === null) {
      R.falhou("16.1 o formulário do parâmetro oferece o estado mínimo do adiantamento", 'select[name="estadoMinimoDoAdiantamentoParaAbater"] não existe na tela');
    } else {
      R.conferir(
        "16.1 o select do estado mínimo existe, com as três opções declaráveis mais a ausência",
        JSON.stringify(formParam.opcoes) === JSON.stringify(["", "FECHADO", "CERTIFICADO", "PAGO"]),
        JSON.stringify(formParam.opcoes)
      );
      // ⚠️ A AUSÊNCIA TEM DE SER ESCOLHA NOMEADA, e não um branco. Um `select` obrigatório aqui
      // obrigaria o município a declarar uma norma que ele talvez não tenha levantado; um branco
      // mudo faria parecer esquecimento. A opção vazia DIZ o que a ausência produz.
      R.conferir(
        "16.2 a ausência é opção NOMEADA e é o padrão — a tela diz que o 13º sai como simulação",
        !formParam.exigido && formParam.padrao === "" && /simula/i.test(formParam.textoDoVazio),
        `exigido=${String(formParam.exigido)} padrao="${formParam.padrao}" vazio="${formParam.textoDoVazio}"`
      );
      // ⚠️ A NOTA É O QUE IMPEDE A ESCOLHA CEGA: "pago" só é verificável onde o empenho é POR
      // SERVIDOR. Sem a nota, quem escolhe descobre pela recusa.
      R.conferir(
        "16.3 a tela DIZ, antes da escolha, que exigir “pago” depende de empenho POR SERVIDOR",
        /POR SERVIDOR/i.test(formParam.rotulo) && /pago/i.test(formParam.rotulo),
        formParam.rotulo.slice(0, 400)
      );
    }

    /**
     * ⚠️ A NEGATIVA AFIRMA O MOTIVO, E O MOTIVO É ESTRUTURAL — não é validação de formulário.
     * "PAGO" pergunta se ESTE servidor recebeu a 1ª parcela; com o grupo empenhando o total
     * (`porServidor = false`) esse fato NÃO EXISTE no banco. A recusa tem de dizer isso, e não
     * "valor inválido": quem lê precisa saber que falta um GRUPO, não um preenchimento.
     */
    const rPago = await preencherEEnviar(page, "criar-parametro-do-13", [
      ...camposDoParametro("Dispoe sobre a gratificacao natalina dos servidores do Municipio"),
      { sel: 'select[name="estadoMinimoDoAdiantamentoParaAbater"]', valor: "PAGO", tipo: "select" as const },
    ]);
    R.conferir(
      "16.4 NEGATIVA ESTRUTURAL: exigir “pago” sem empenho por servidor é RECUSADO, com o código na tela",
      rPago.tipo === "erro" && /ESTADO-PAGO-NAO-VERIFICAVEL/i.test(rPago.texto),
      `${rPago.tipo}: ${rPago.texto.slice(0, 300)}`
    );
    R.conferir(
      "16.5 e a recusa diz POR QUE — o fato não existe no banco —, não “valor inválido”",
      /POR SERVIDOR/i.test(rPago.texto) && /(não existe como fato|grupo de empenho)/i.test(rPago.texto),
      rPago.texto.slice(0, 400)
    );
    // ⚠️ E NADA FOI GRAVADO: a recusa roda ANTES do `create`, senão uma versão inválida ocuparia
    // o número. Conferido na lista recarregada, que é onde a versão apareceria.
    const listaAposPago = await irPara(N, page, "/folha/parametros-do-13");
    R.conferir(
      "16.6 e NADA foi gravado — a versão 2 não nasceu da tentativa recusada",
      !/vers(ão|ao)\s*2\b/i.test(listaAposPago),
      listaAposPago.slice(0, 400)
    );

    // ══ 9. A 1ª PARCELA ══════════════════════════════════════════════════════
    await sair(N, page);
    await entrar(N, page, RH, SENHA);

    await irPara(N, page, "/folha/folhas");
    const rAbrirAdi = await preencherEEnviar(page, "criar-folhas", [
      { sel: 'input[name="competencia"]', valor: COMP_ADIANTAMENTO },
      { sel: 'select[name="tipo"]', valor: "ADIANTAMENTO_DECIMO_TERCEIRO", tipo: "select" },
    ]);
    if (rAbrirAdi.tipo === "erro" && /já existe|JA-ABERTA|unique/i.test(rAbrirAdi.texto)) {
      /**
       * ⚠️ PULADO COM AVISO, E NÃO FALHA. `@@unique([exercicio, tipo])` dá UMA folha de cada tipo
       * por exercício; reexecutar aqui não é defeito nenhum. Mas também não é verde: nada foi
       * provado nesta corrida, e dizer "passou" seria a mentira que o roteiro proíbe.
       */
      console.warn(
        `\n[PULADO] O exercício ${EXERCICIO} já tem folha de 13º (uma de cada tipo por ano, pelo ` +
          `@@unique([exercicio, tipo])). NADA foi provado nesta corrida.\n` +
          `          Para rodar de verdade: DECIMO_TERCEIRO_EXERCICIO=<outro ano> npm run smoke:decimo-terceiro\n`
      );
      await navegador.close();
      process.exit(SAIDA_PULADO);
    }
    R.conferir("9.1 a folha de ADIANTAMENTO DO 13º abre pelo tipo do seletor", rAbrirAdi.tipo === "ok", `${rAbrirAdi.tipo}: ${rAbrirAdi.texto.slice(0, 200)}`);

    const hrefAdi = (await hrefDoRegistro(page, COMP_ADIANTAMENTO)) ?? "";
    R.conferir("9.2 a folha aberta leva ao próprio detalhe", hrefAdi !== "", "sem link para a folha");
    await irPara(N, page, hrefAdi);
    const rCalcAdi = await preencherEEnviar(page, "calcular", [{ sel: 'input[name="motivo"]', valor: "1a parcela (percurso)" }]);
    R.conferir("9.3 o RH CALCULA a 1ª parcela", rCalcAdi.tipo === "ok" && /nº 1/.test(rCalcAdi.texto), `${rCalcAdi.tipo}: ${rCalcAdi.texto.slice(0, 200)}`);

    const adiCalculada = await irPara(N, page, hrefAdi);
    R.conferir("9.4 a 1ª parcela do par N=2 sai 1.900,00 e 990,41 — e o 990,41 é o empate resolvido por half-even", adiCalculada.includes("1.900,00") && adiCalculada.includes("990,41"), adiCalculada.slice(0, 600));
    R.conferir("9.5 half-even, e não half-up: 1.980,83 NÃO aparece em lugar nenhum", !adiCalculada.includes("1.980,83"), "apareceu 1.980,83 — a regra de arredondamento mudou");

    // ══ 10 e 11. A MEMÓRIA DOS DOZE MESES E A INCIDÊNCIA DECLARADA ═══════════
    const hrefContraM2 = await page.evaluate((mat) => {
      const linha = Array.from(document.querySelectorAll("tbody tr")).find((tr) => (tr.textContent ?? "").includes(mat));
      return (linha?.querySelector('a[href*="/contracheque/"]') as HTMLAnchorElement | null)?.getAttribute("href") ?? "";
    }, M2);
    R.conferir("10.0 a linha do contracheque leva à memória de cálculo", hrefContraM2 !== "", "sem link para o contracheque");
    /**
     * ⚠️ ABRIR O CONTRACHEQUE NÃO PODE DERRUBAR O PERCURSO INTEIRO. Na terceira corrida esta rota
     * respondeu 500 e o `irPara` subiu a exceção, abortando os passos 11 a 15 — e o relatório
     * ficou sem saber se o resto da cadeia funciona. Um percurso que morre no primeiro 500 mede
     * um defeito e esconde os outros.
     */
    let mem = "";
    let memErro = "";
    if (hrefContraM2 !== "") {
      try {
        mem = await irPara(N, page, hrefContraM2);
      } catch (e) {
        memErro = e instanceof Error ? e.message : String(e);
      }
      R.conferir("10.0b a tela do contracheque do 13º ABRE", memErro === "", memErro);
    }
    if (hrefContraM2 !== "" && memErro === "") {
      /**
       * ⚠️ O TOTAL SOZINHO É INDEFENSÁVEL. Quem recebeu 9/12 quer saber QUAIS três meses não
       * contaram, e o controle interno quer conferir sem recalcular. É por isso que a memória
       * leva os doze meses com o motivo de cada um — e é isso que a tela tem de renderizar.
       */
      R.conferir("10.1 a memória mostra os doze meses, e não só o total de avos", mem.includes(`${EXERCICIO}-01`) && mem.includes(`${EXERCICIO}-03`) && mem.includes(`${EXERCICIO}-12`), mem.slice(0, 800));
      R.conferir("10.2 março diz POR QUE não contou: 11 dias, abaixo do mínimo de 15", /11\/30/.test(mem) && /abaixo do mínimo de 15/.test(mem), mem.slice(0, 900));
      R.conferir("10.3 os avos computados são 9 — a projeção até dezembro não apaga a admissão de março", /9\s*\/\s*12/.test(mem), mem.slice(0, 500));
      /**
       * ⚠️ A MEMÓRIA DECLARA O LIMITE. Sem esta linha, "sem contribuição na 1ª parcela" é
       * indistinguível de "a tabela não achou nada a descontar" — e o operador deduz do silêncio.
       */
      R.conferir("11.1 a memória do adiantamento DECLARA que não há incidência, e por quê", /INCIDENCIA-NA-PRIMEIRA-PARCELA/i.test(mem) && /limite declarado/i.test(mem), mem.slice(0, 900));
      /**
       * ⚠️ A PROVA É A MENSAGEM DE AUSÊNCIA, NÃO A FALTA DA PALAVRA. A tela sempre traz o
       * cabeçalho "Contribuição previdenciária"; procurar a palavra acusava o próprio título.
       * O que distingue "não incide, e aqui está o porquê" de "a tela não achou nada" é o texto
       * declarado — e é ele que o servidor lê.
       */
      R.conferir("11.2 a tela DIZ que não incide, com o motivo — em vez de deixar o espaço em branco", /não incide contribuição/i.test(mem) && /não incide imposto de renda/i.test(mem), mem.slice(0, 900));
    }

    // ══ 12. OS DOIS PAPÉIS SÃO SESSÕES DISTINTAS ═════════════════════════════
    await irPara(N, page, hrefAdi);
    R.conferir("12.1 NEGATIVA: o RH não vê o formulário de FECHAR — fechar é da contabilidade", (await page.$('form[data-acao="fechar"]')) === null, "o formulário de fechar apareceu para quem não tem a ação");
    await sair(N, page);
    await entrar(N, page, CONTABILIDADE, SENHA);
    await irPara(N, page, hrefAdi);
    R.conferir("12.2 NEGATIVA: a contabilidade não vê o formulário de CALCULAR", (await page.$('form[data-acao="calcular"]')) === null, "o formulário de calcular apareceu para quem não tem a ação");
    const rFecharAdi = await preencherEEnviar(page, "fechar", []);
    R.conferir("12.3 a contabilidade FECHA a 1ª parcela — e é o fechamento que arma o abatimento", rFecharAdi.tipo === "ok" && /nº 1/.test(rFecharAdi.texto), `${rFecharAdi.tipo}: ${rFecharAdi.texto.slice(0, 200)}`);

    // ══ 13. A 2ª PARCELA, COM O ABATIMENTO ═══════════════════════════════════
    await sair(N, page);
    await entrar(N, page, RH, SENHA);
    await irPara(N, page, "/folha/folhas");
    const rAbrir13 = await preencherEEnviar(page, "criar-folhas", [
      { sel: 'input[name="competencia"]', valor: COMP_DECIMO },
      { sel: 'select[name="tipo"]', valor: "DECIMO_TERCEIRO", tipo: "select" },
    ]);
    R.conferir("13.1 a folha de 13º abre, e o elo com o adiantamento é resolvido pelo servidor (nunca digitado)", rAbrir13.tipo === "ok", `${rAbrir13.tipo}: ${rAbrir13.texto.slice(0, 200)}`);
    const href13 = (await hrefDoRegistro(page, COMP_DECIMO)) ?? "";
    await irPara(N, page, href13);
    const rCalc13 = await preencherEEnviar(page, "calcular", [{ sel: 'input[name="motivo"]', valor: "2a parcela (percurso)" }]);
    R.conferir("13.2 o RH CALCULA a 2ª parcela", rCalc13.tipo === "ok" && /nº 1/.test(rCalc13.texto), `${rCalc13.tipo}: ${rCalc13.texto.slice(0, 200)}`);

    const folha13 = await irPara(N, page, href13);
    /**
     * ⚠️ AGORA OS LÍQUIDOS ENTRAM — e entram porque o percurso passou a declarar as PRÓPRIAS
     * tabelas do exercício (passo 4.0). Antes disso a contribuição dependia do que o banco tinha
     * (faixas 7,5/9/14) e cravar o líquido deixaria o passo vermelho sem defeito nenhum; com a
     * tabela declarada, o par inteiro é determinístico e não afirmá-lo seria deixar prova na mesa.
     *
     *   M-1: base 3.000,00 + 500,00 + 300,00 = 3.800,00 × 12/12 = 3.800,00
     *        contribuição 10% = 380,00 ; abatimento 1.900,00 ; líquido 1.520,00
     *   M-2: base 2.401,00 +   0,00 + 240,10 = 2.641,10 ×  9/12 = 1.980,825 → 1.980,82 (half-even)
     *        contribuição 10% = 198,082 → 198,08 ; abatimento 990,41 ; líquido 792,33
     *
     * CONFERÊNCIA CRUZADA (1ª + líquido da 2ª == apurado − contribuição):
     *   M-1: 1.900,00 + 1.520,00 = 3.420,00 = 3.800,00 − 380,00  ✓
     *   M-2:   990,41 +   792,33 = 1.782,74 = 1.980,82 − 198,08  ✓
     */
    R.conferir("13.3 o 13º apurado do par sai 3.800,00 e 1.980,82", folha13.includes("3.800,00") && folha13.includes("1.980,82"), folha13.slice(0, 700));
    R.conferir("13.4 half-even, e não half-up: 1.980,83 NÃO aparece", !folha13.includes("1.980,83"), "apareceu 1.980,83 — a regra de arredondamento mudou");
    /**
     * ⚠️ A PROVA DIRETA VOLTOU (V11 V9.2). Enquanto a tela do contracheque respondia 500, este
     * passo estava REBAIXADO para afirmar os descontos totais — um proxy. Consertada a tela, ele
     * volta ao que deve provar: a linha `D13ABAT` de CADA vínculo, com valores DIFERENTES entre
     * si. Abater valor fixo, ou o do vínculo errado, falha nos dois sentidos.
     */
    const abatimentoDe = async (matricula: string): Promise<string> => {
      const href = await page.evaluate((mat) => {
        const linha = Array.from(document.querySelectorAll("tbody tr")).find((tr) => (tr.textContent ?? "").includes(mat));
        return (linha?.querySelector('a[href*="/contracheque/"]') as HTMLAnchorElement | null)?.getAttribute("href") ?? "";
      }, matricula);
      if (href === "") return "sem link";
      const t = await irPara(N, page, href);
      // ⚠️ `texto()` COLAPSA TODO ESPAÇO EM BRANCO (`\s+` → " "): não há linhas para dividir.
      // O valor é o primeiro montante logo depois do código da rubrica, no texto corrido.
      // ⚠️ O CÓDIGO É O DESTE PERCURSO (`ABT-<sufixo>`), não o `13ABAT` da fixture da suíte —
      // dois cenários, dois cadastros, e copiar o código de um para o outro procura o que não está lá.
      const codigo = `abt-${SUF}`.toLowerCase();
      const i = t.indexOf(codigo);
      if (i < 0) return `a linha ${codigo} não está na tela: ${t.slice(0, 200)}`;
      return /([0-9.]+,[0-9]{2})/.exec(t.slice(i))?.[1] ?? `nao achei valor apos ${codigo}: ${t.slice(i, i + 200)}`;
    };
    const abatM1 = await abatimentoDe(M1);
    await irPara(N, page, href13);
    const abatM2 = await abatimentoDe(M2);
    R.conferir(
      "13.5 o abatimento sai por VÍNCULO na linha D13ABAT: 1.900,00 e 990,41, diferentes entre si",
      abatM1 === "1.900,00" && abatM2 === "990,41",
      `M-1=${abatM1} M-2=${abatM2}`
    );
    await irPara(N, page, href13);
    R.conferir("13.6 os líquidos fecham a conferência cruzada: 1.520,00 e 792,33", folha13.includes("1.520,00") && folha13.includes("792,33"), folha13.slice(0, 700));

    // ══ 14. A MEMÓRIA DIZ DE ONDE VEIO O ABATIMENTO, E NÃO AFIRMA PAGAMENTO ══
    const hrefContra13 = await page.evaluate((mat) => {
      const linha = Array.from(document.querySelectorAll("tbody tr")).find((tr) => (tr.textContent ?? "").includes(mat));
      return (linha?.querySelector('a[href*="/contracheque/"]') as HTMLAnchorElement | null)?.getAttribute("href") ?? "";
    }, M1);
    if (hrefContra13 !== "") {
      let mem13 = "";
      let erro13 = "";
      try {
        mem13 = await irPara(N, page, hrefContra13);
      } catch (e) {
        erro13 = e instanceof Error ? e.message : String(e);
      }
      R.conferir("14.0 a tela do contracheque da 2ª parcela ABRE", erro13 === "", erro13);
      /**
       * ⚠️ O QUE ESTE PASSO IMPEDE É UMA AFIRMAÇÃO FALSA, NÃO UM CENTAVO ERRADO (V11 V9.2). Até
       * aqui a memória dizia "1ª parcela já PAGA". O único fato que o cálculo verifica é o
       * FECHAMENTO da folha de adiantamento — entre fechada e paga há certificação (que pode ser
       * DEVOLVIDA), empenho e liquidação, e o pagamento nem é ato do M33.
       */
      R.conferir("14.1 a memória diz o fato verificado: 1ª parcela APURADA em folha FECHADA", /APURADA na folha de adiantamento FECHADA/i.test(mem13), mem13.slice(0, 900));
      /**
       * ⚠️ A ASSERÇÃO NEGATIVA EXIGE A PÁGINA NÃO-VAZIA — vacuidade que eu mesmo introduzi ao pôr
       * o `try/catch` no passo 14.0: com a tela em 500, `mem13` fica "" e "não contém 'já paga'"
       * é trivialmente verdadeiro. Um passo verde porque a página nem abriu é pior que vermelho.
       */
      R.conferir("14.2 e NÃO afirma pagamento — 'já paga' não aparece", mem13.length > 0 && !/já paga/i.test(mem13), mem13.length === 0 ? "a tela não abriu — nada foi lido (não vale como prova)" : "a memória voltou a afirmar pagamento que ninguém verificou");
      R.conferir("14.3 a memória nomeia a competência de origem do abatimento", mem13.includes(COMP_ADIANTAMENTO), mem13.slice(0, 900));
    }

    // ══ 17a. O SELO DE SIMULAÇÃO NO DETALHE DA FOLHA, COM ELA AINDA ABERTA ════
    //
    // ⚠️ LIDO ANTES DO FECHAMENTO, DE PROPÓSITO. O aviso existe para ser visto ANTES de a folha
    // virar documento; se só aparecesse depois, quem opera descobriria o problema com o cálculo
    // já congelado. O parâmetro deste percurso NÃO declara o critério — o passo 8 grava sem ele,
    // e o 16 provou que a ausência é escolha nomeada —, então esta folha É simulação.
    await irPara(N, page, href13);
    const detalheAntes = await page.evaluate(() => (document.body.textContent ?? "").replace(/\s+/g, " "));
    R.conferir(
      "17.1 o detalhe da folha traz a linha “Natureza da apuração” dizendo SIMULAÇÃO",
      /Natureza da apura[çc][ãa]o/i.test(detalheAntes) && /SIMULA[ÇC][ÃA]O/i.test(detalheAntes),
      detalheAntes.slice(0, 700)
    );
    /**
     * ⚠️ O QUE A TELA IMPEDE MUDOU COM A GUARDA (V11 V9.3): o bloqueio que o operador encontra
     * PRIMEIRO é o do FECHAMENTO, não o da apropriação. Dizer só "a apropriação está bloqueada"
     * mandaria a pessoa olhar o ato errado — a mesma família do remédio falso que a corrida
     * anterior achou. A nota do detalhe passou a nomear os dois, e este passo cobra os dois.
     */
    R.conferir(
      "17.2 e a tela DIZ o que isso impede — o FECHAMENTO e a apropriação —, em vez de só rotular",
      /fechamento/i.test(detalheAntes) && /apropria[çc][ãa]o/i.test(detalheAntes) && /bloquead/i.test(detalheAntes),
      detalheAntes.slice(0, 900)
    );

    // ══ 17b. A BARRA RECUSA `fechar`, E É AQUI QUE A RECUSA PASSOU A MORAR ════
    //
    // ⚠️ ESTE BLOCO MUDOU DE ATO NA V11 V9.3, e o motivo é a razão de a guarda existir. Antes a
    // folha era FECHADA aqui e a recusa era medida em `apropriar`. Só que fechar CONGELA, e
    // cálculo congelado não se recalcula (`FOLHA-FECHADA`) nem se cancela (`CALCULO-FECHADO`):
    // a folha ficava sem apropriação, sem liquidação e sem correção — beco sem saída. A guarda
    // subiu para o `fechar`, que é a gravação que envenena, e o estado que este passo media
    // deixou de ser alcançável PELA TELA. Medir aqui o `apropriar` viraria VERDE POR VACUIDADE:
    // a recusa que apareceria seria `FOLHA-NAO-FECHADA`, não a do critério.
    //
    // A prova das guardas de `apropriar` e `liquidar` (que continuam existindo, para as folhas
    // já congeladas antes da mudança) fica na SUÍTE, que constrói esse estado pelo banco
    // (`congelarComoAntesDaGuarda`, em `m33-criterio-do-abatimento.test.ts`).
    await sair(N, page);
    await entrar(N, page, CONTABILIDADE, SENHA);
    await irPara(N, page, href13);
    const barraSemCriterio = await apresentacaoDoAto(page, "fechar");
    R.conferir(
      "17.3 calculada e sem critério declarado, a barra NÃO oferece o formulário de FECHAR",
      barraSemCriterio.estado !== "formulario",
      JSON.stringify(barraSemCriterio).slice(0, 400)
    );
    /**
     * ⚠️ AFIRMA O MOTIVO, NÃO O CÓDIGO — a barra não mostra código de ato em lugar nenhum do
     * sistema: ela projeta MOTIVO e REMÉDIO (`percursos-disponibilidade.ts`). Exigir o código
     * aqui cobraria da tela uma convenção que ela não tem.
     */
    R.conferir(
      "17.4 e a barra diz o MOTIVO — congelar é o que criava o beco",
      /abateu a 1ª parcela sem que o par[âa]metro/i.test(barraSemCriterio.texto) &&
        /CONGELA/i.test(barraSemCriterio.texto) &&
        /sem sa[íi]da/i.test(barraSemCriterio.texto),
      JSON.stringify(barraSemCriterio).slice(0, 700)
    );
    /**
     * ⚠️ E AQUI O REMÉDIO É VERDADEIRO — é a diferença que a guarda comprou. Na recusa de
     * `apropriar` (folha já fechada) o remédio honesto é "declare ANTES de fechar, esta depende
     * de retificação". Nesta, a folha está ABERTA: declarar e recalcular FUNCIONA, e o passo 18
     * percorre isso de ponta a ponta em vez de acreditar no texto.
     */
    R.conferir(
      "17.5 e o remédio é EXECUTÁVEL nesta folha: declarar e RECALCULAR antes de fechar",
      /Par[âa]metros do 13º/i.test(barraSemCriterio.texto) &&
        /recalculada/i.test(barraSemCriterio.texto) &&
        !/RETIFICA[ÇC][ÃA]O DA FOLHA/i.test(barraSemCriterio.texto),
      barraSemCriterio.texto.slice(0, 700)
    );

    // ══ 18. O PAR QUE IMPORTA, E O DESTRAVE MEDIDO (NÃO SUPOSTO) ══════════════
    //
    // ⚠️ O BLOQUEIO NÃO É DO PARÂMETRO: É DO CÁLCULO. O 13º que já rodou abateu a 1ª parcela sob
    // um parâmetro que não declarava critério, e essa procedência está gravada na memória DELE.
    // Declarar hoje não reescreve o que foi apurado ontem — se a tela destravasse só com a
    // declaração, o ente fecharia uma apuração que continuou sendo simulação.
    await sair(N, page);
    await entrar(N, page, ADMIN, SENHA_ADMIN);
    await irPara(N, page, "/folha/parametros-do-13");
    await preencherEEnviar(page, "criar-parametro-do-13", [
      ...camposDoParametro("Dispoe sobre a gratificacao natalina dos servidores do Municipio"),
      { sel: 'select[name="estadoMinimoDoAdiantamentoParaAbater"]', valor: "FECHADO", tipo: "select" as const },
    ]);
    const listaComCriterio = await irPara(N, page, "/folha/parametros-do-13");
    R.conferir(
      "18.1 o critério é declarado na VERSÃO SEGUINTE — nunca um UPDATE na vigente",
      /fechado/i.test(listaComCriterio),
      listaComCriterio.slice(0, 500)
    );

    await sair(N, page);
    await entrar(N, page, CONTABILIDADE, SENHA);
    await irPara(N, page, href13);
    const barraSoDeclarado = await apresentacaoDoAto(page, "fechar");
    R.conferir(
      "18.2 ⚠️ DECLARAR SEM RECALCULAR NÃO DESTRAVA: fechar segue recusado pelo MESMO motivo",
      barraSoDeclarado.estado !== "formulario" &&
        /abateu a 1ª parcela sem que o par[âa]metro/i.test(barraSoDeclarado.texto),
      JSON.stringify(barraSoDeclarado).slice(0, 600)
    );

    /**
     * ⚠️ O RECÁLCULO SE MEDE, NÃO SE SUPÕE — e esta guarda de medição fica, mesmo agora que o
     * caminho existe. A folha está ABERTA, então `RECALCULAR` deve estar na barra; se não
     * estiver, o percurso REGISTRA o não executado com o estado lido, em vez de afirmar um
     * destrave que o produto não tem. Foi assim que a corrida anterior descobriu que o remédio
     * prometido era falso.
     */
    await sair(N, page);
    await entrar(N, page, RH, SENHA);
    await irPara(N, page, href13);
    const barraRecalcular = await apresentacaoDoAto(page, "calcular");
    nota(`RECALCULAR na folha ABERTA: estado="${barraRecalcular.estado}" · ${barraRecalcular.texto.slice(0, 200)}`);
    if (barraRecalcular.estado === "formulario") {
      const rRecalc = await preencherEEnviar(page, "calcular", []);
      R.conferir("18.3 com o critério declarado, o RH RECALCULA a folha (ela está aberta — por isso dá)", rRecalc.tipo === "ok", `${rRecalc.tipo}: ${rRecalc.texto.slice(0, 200)}`);
      const detalheDepois = await irPara(N, page, href13);
      R.conferir(
        "18.4 recalculada, o selo de SIMULAÇÃO SOME do detalhe",
        !/SIMULA[ÇC][ÃA]O/i.test(detalheDepois),
        detalheDepois.slice(0, 700)
      );
      await sair(N, page);
      await entrar(N, page, CONTABILIDADE, SENHA);
      await irPara(N, page, href13);
      const barraFechar = await apresentacaoDoAto(page, "fechar");
      R.conferir(
        "18.5 e FECHAR passa a ser OFERECIDO — o destrave chega à barra, no ato que recusava",
        barraFechar.estado === "formulario",
        JSON.stringify(barraFechar).slice(0, 600)
      );
      const rFechar13 = await preencherEEnviar(page, "fechar", []);
      R.conferir("18.6 a contabilidade FECHA a folha de 13º — é o fechamento que a torna documento", rFechar13.tipo === "ok", `${rFechar13.tipo}: ${rFechar13.texto.slice(0, 200)}`);
      /**
       * ⚠️ E SÓ AGORA A APROPRIAÇÃO É OFERECIDA. Ela é o ato seguinte, e este passo é o que prova
       * que a cadeia inteira voltou a andar: declarar → recalcular → fechar → apropriar.
       */
      const barraApropriar = await apresentacaoDoAto(page, "apropriar");
      R.conferir(
        "18.7 e a apropriação passa a ser OFERECIDA — a cadeia inteira voltou a andar",
        barraApropriar.estado === "formulario",
        JSON.stringify(barraApropriar).slice(0, 600)
      );
    } else {
      naoExecutado(
        "18.3 a 18.7 o destrave pelo recálculo (pela tela)",
        `a folha de 13º está ABERTA e a barra apresenta RECALCULAR como "${barraRecalcular.estado}", ` +
          "quando deveria oferecer o formulário. O remédio que a recusa de 17.5 promete não pôde ser " +
          "percorrido, e o percurso NÃO o declara feito"
      );
    }

    // ══ 15. O CONTRACHEQUE DO 13º ALCANÇA O PORTAL DO SERVIDOR ═══════════════
    /**
     * ⚠️ SEM TELA, UM SERVIDOR MUNICIPAL NÃO ALCANÇA. O domínio pode estar perfeito e o
     * contracheque do 13º não chegar a quem ele é — que é a família de defeito desta unidade
     * inteira. O portal recorta pela PESSOA da sessão; o RH não é a servidora, então o que este
     * passo prova é o recorte: a folha do 13º aparece na área, e o RH não vê o que é de outro.
     */
    const noPortal = await barrado(N, page, "/portal-do-servidor");
    R.conferir("15.0 o portal recorta pela pessoa da sessão: quem não é a pessoa não lê o contracheque dela", noPortal.barrado || !(await texto(page)).includes(M1.toLowerCase()), `${noPortal.url} ${noPortal.status}`);

    /**
     * ⚠️ ATÉ A V11 V9.2 ESTE PASSO SÓ PROVAVA O RECORTE — que o RH NÃO lê o contracheque alheio —,
     * e isso é a metade fácil. O item 7 do roteiro é o contrário: **a servidora lê o DELA**. E não
     * era possível provar, porque a tela do contracheque respondia 500 em todo contracheque de 13º.
     *
     * O administrador liga a conta da servidora à PESSOA de M-1 (pelo CPF, nunca pelo nome — o
     * precedente é `smoke-portal-do-servidor.ts`), e então a sessão dela abre o portal e encontra
     * o próprio 13º. Sem tela, um servidor municipal não alcança; é essa a régua.
     */
    await sair(N, page);
    await entrar(N, page, ADMIN, SENHA_ADMIN);
    await irPara(N, page, `/administracao/usuarios?q=${encodeURIComponent(SERVIDORA)}`);
    const jaVinculada = (await texto(page)).includes(NOME_M1.toLowerCase());
    if (!jaVinculada) {
      if ((await page.$(`form[data-acao="desvincular-pessoa"][data-usuario="${SERVIDORA}"]`)) !== null) {
        await preencherEEnviar(page, `form[data-acao="desvincular-pessoa"][data-usuario="${SERVIDORA}"]`, [
          { sel: 'input[name="motivo"]', valor: `percurso do 13o ${SUF}: a conta passa a ser da servidora desta execução` },
        ]);
        await irPara(N, page, `/administracao/usuarios?q=${encodeURIComponent(SERVIDORA)}`);
      }
      await preencherEEnviar(page, `form[data-acao="vincular-pessoa"][data-usuario="${SERVIDORA}"]`, [
        { sel: 'input[name="documento"]', valor: CPF_M1 },
        { sel: 'input[name="motivo"]', valor: "é a servidora do percurso do 13o" },
      ]);
    }
    const usuarios = await irPara(N, page, `/administracao/usuarios?q=${encodeURIComponent(SERVIDORA)}`);
    R.conferir("15.1 o administrador liga a conta da servidora à pessoa de M-1, pelo CPF", usuarios.includes(NOME_M1.toLowerCase()), usuarios.slice(0, 300));

    await sair(N, page);
    await entrar(N, page, SERVIDORA, SENHA);
    const portal = await irPara(N, page, "/portal-do-servidor");
    R.conferir("15.2 a servidora encontra a PRÓPRIA matrícula e a competência do 13º no portal", portal.includes(M1.toLowerCase()) && portal.includes(COMP_DECIMO), portal.slice(0, 600));
    R.conferir("15.3 e NÃO vê a matrícula da outra — o recorte é por pessoa", !portal.includes(M2.toLowerCase()), portal.slice(0, 600));

    /**
     * ⚠️ FECHADA, NÃO SE RECALCULA — é o que protege a memória já lacrada. E a conferência volta
     * a uma sessão que ENXERGA a folha: a servidora do quadro não tem `CONSULTAR_FOLHA`, então
     * medir a barra na sessão dela leria "ausente" e diria que o ato sumiu — quando o que sumiu
     * era o acesso.
     */
    await sair(N, page);
    await entrar(N, page, RH, SENHA);
    await irPara(N, page, hrefAdi);
    const recalcFechada = await apresentacaoDoAto(page, "calcular");
    R.conferir("15.4 fechada, RECALCULAR sai da barra e a tela diz por quê", recalcFechada.estado === "nao-aplicavel", JSON.stringify(recalcFechada));
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
