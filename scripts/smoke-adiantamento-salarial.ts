import "dotenv/config";
import type { Browser, Page } from "puppeteer";
import { apresentacaoDoAto } from "./percursos-disponibilidade.js";
import {
  entrar,
  hrefDoRegistro,
  irPara,
  lancarNavegadorDoPercurso,
  preencherEEnviar,
  registroDePassos,
  sair,
  type Navegador,
} from "./percursos-navegador.js";

/**
 * ═══ PERCURSO DO ADIANTAMENTO SALARIAL — O VALE DO MÊS (M33, V13) ═══
 *
 * ⚠️ ESTE ARQUIVO NUNCA FOI EXECUTADO. Ele é commitado NÃO EXECUTADO de propósito, e o motivo é
 * material: a ordem V13 proibiu `next build` e navegador enquanto a máquina estivesse como está
 * (8 GB, swap acima de 6 GB; foi `next build` com heap de 5,3 GB mais navegador que a travou duas
 * vezes nesta sessão). **Percurso escrito não é percurso verde** — nada aqui prova nada até uma
 * execução sair com `0 falhas`, e a cláusula 5.12.50 não se move por causa deste arquivo.
 *
 * O que ele é: o roteiro pronto, para que a primeira execução gaste a máquina medindo, não
 * escrevendo. Já se perderam 454 linhas nesta sessão por trabalho não commitado.
 *
 * ⚠️ E É PROVÁVEL QUE A PRIMEIRA EXECUÇÃO SEJA VERMELHA. Todo percurso deste repositório foi:
 * o do 13º achou cinco defeitos de superfície, o da complementar achou sete. É para isso que ele
 * existe — quem o rodar pela primeira vez deve LER o vermelho antes de concluir que o roteiro
 * está errado.
 *
 * ═══ A JORNADA, NA ORDEM DA ORDEM V13 ═══
 *   configurar → selecionar vínculos → calcular → revisar → fechar → emitir documento →
 *   integrar aos atos financeiros → reconciliar com a folha posterior
 *
 * ═══ OS PAPÉIS, E POR QUE SÃO ESTES ═══
 *   admin           cadastra o PARÂMETRO do vale
 *   rh@             cadastra rubricas, admite, abre as folhas e CALCULA
 *   contabilidade@  FECHA (é o fechamento que vai ao empenho)
 *
 * ⚠️ NENHUM PAPEL DE PERCURSO TEM `CONFIGURAR_PARAMETRO_DO_ADIANTAMENTO_SALARIAL`, e isso NÃO se
 * conserta concedendo a ação ao `rh@`. A ação vai só a quem administra permissões no global
 * (atualização versionada 30), porque um erro nela não tem detector adiante: a folha de vale
 * fecha, o empenho fecha, a mensal abate exatamente aquele valor e o total bate dos dois lados.
 * A negativa do passo 4 é EVIDÊNCIA, não obstáculo — alargar a concessão para o percurso passar
 * seria apagar a prova com o motivo dela. Mesma decisão do percurso do 13º.
 *
 * ═══ ⚠️ BANCO CLONADO POR EXECUÇÃO ═══
 *
 * A folha de vale, na prática `REMUNERACAO_PROJETADA_DO_MES`, roda o motor mensal sobre TODOS os
 * vínculos vivos da competência — não só sobre o par que este percurso cria. No banco
 * compartilhado vivem as matrículas que `smoke-folha`, `smoke-pessoal` e os demais deixaram, e
 * basta UMA sem regime previdenciário ou sem vencimento vigente para o cálculo INTEIRO recusar.
 * O percurso ficaria vermelho por vínculo alheio, e quem diagnosticasse iria procurar o defeito
 * no vale, que não tem nenhum. Uso:
 *
 *   PERCURSO_BANCO=gestao_publica_percursos_vale_<sufixo> npm run percursos:servir
 *   PERCURSO_BANCO=gestao_publica_percursos_vale_<sufixo> npm run smoke:adiantamento-salarial
 *
 * ⚠️ E A COMPETÊNCIA É PARAMETRIZÁVEL pelo mesmo motivo do exercício do 13º: existe UMA folha de
 * cada tipo por competência (`@@unique([competencia, tipo])`), então reexecutar na mesma
 * competência esbarra em `FOLHA-JA-ABERTA`. Rodar de novo de verdade é escolher outra:
 *   VALE_COMPETENCIA=2031-07 npm run smoke:adiantamento-salarial
 *
 * ⚠️ TODOS OS VALORES SÃO SINTÉTICOS. O percentual de 40%, a base declarada e a alíquota de 10%
 * aparecem porque ALGUÉM tem de declará-los para a folha calcular, e é esse o ponto do parâmetro.
 * Nenhum deles afirma norma de município nenhum.
 */
const N: Navegador = { base: process.argv[2] ?? "http://localhost:3010" };
const SENHA = process.env["PERCURSOS_SENHA_PAPEIS"] ?? "Percurso#2026";
const ADMIN = process.env["SEED_IDENTIDADE"] ?? "admin@cg.pb.gov.br";
const SENHA_ADMIN = process.env["SEED_ADMIN_SENHA"] ?? "";
const RH = "rh@percursos.local";
const CONTABILIDADE = "contabilidade@percursos.local";

/** A competência do vale. Padrão bem à frente, para não disputar com os percursos da mensal. */
const COMP = process.env["VALE_COMPETENCIA"] ?? "2031-06";
const SUF = COMP.replace("-", "");

const M1 = `VALEA-${SUF}`;
const M2 = `VALEB-${SUF}`;

/**
 * ⚠️ O PAR N=2 É DESIGUAL DE PROPÓSITO, e a desigualdade é o instrumento: 3.000,00 e 2.000,00
 * produzem vales de 1.200,00 e 800,00, e abatimentos DIFERENTES na mensal. Com uma matrícula só,
 * um motor que abatesse valor FIXO — ou o valor do outro vínculo — passaria por vacuidade.
 *
 * OS NÚMEROS, À MÃO (os mesmos de `m33-adiantamento-salarial.test.ts`, e é de propósito: a suíte
 * confere pelo BANCO, o percurso confere pela TELA):
 *   vale     M-1 40% × 3.000,00 = 1.200,00     M-2 40% × 2.000,00 = 800,00
 *   mensal   M-1 3.000,00 − PREV 300,00 − ABAT 1.200,00 = 1.500,00
 *            M-2 2.000,00 − PREV 200,00 − ABAT   800,00 = 1.000,00
 */
const SALARIO_M1 = "3000.00";
const SALARIO_M2 = "2000.00";
const VALE_M1 = "1.200,00";
const VALE_M2 = "800,00";
const LIQUIDO_M1 = "1.500,00";
const LIQUIDO_M2 = "1.000,00";

const R = registroDePassos();

/**
 * ⚠️ CONTADOR PRÓPRIO DO QUE NÃO RODOU. `registroDePassos` só conta ok e falha, e este percurso
 * tem trechos cuja execução depende do que a TELA oferece. Somar um passo não executado aos
 * verdes mentiria; somá-lo às falhas culparia o produto por um estado que ele talvez recuse de
 * propósito. "Passo pulado é passo que não aconteceu" — então ele tem linha própria.
 */
const naoExecutados: string[] = [];
function naoExecutado(passo: string, motivo: string): void {
  naoExecutados.push(`${passo} — ${motivo}`);
  console.error(`[NAO EXECUTADO] ${passo} — ${motivo}`);
}

/** Os textos de todas as opções de um `select` — é com isso que se confere um RECORTE. */
async function opcoesDe(page: Page, seletor: string): Promise<readonly string[]> {
  return page.evaluate((sel) => {
    const s = document.querySelector(sel);
    if (!(s instanceof HTMLSelectElement)) return [] as string[];
    return Array.from(s.options).map((o) => (o.textContent ?? "").trim());
  }, seletor);
}

/** O `value` da opção cujo texto casa com um trecho. */
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

/**
 * CPF sintético COM dígito verificador — o cadastro único valida o DV.
 *
 * ⚠️ `PERCURSOS-SEM-HELPER-COMUM`: esta é a quarta cópia (`smoke-folha.ts`,
 * `smoke-portal-do-servidor.ts`, `smoke-decimo-terceiro.ts`). O lugar dela é
 * `percursos-navegador.ts`. Fica nomeado, não escondido.
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

async function main(): Promise<void> {
  if (SENHA_ADMIN === "") {
    console.error("[FALHA] SEED_ADMIN_SENHA não está no ambiente — o parâmetro do vale só o admin cadastra.");
    process.exit(3);
  }
  const banco = process.env["PERCURSO_BANCO"] ?? "";
  if (banco === "") {
    console.error(
      "[FALHA] PERCURSO_BANCO não declarado. O vale projetado roda o motor mensal sobre TODOS os\n" +
        "        vínculos vivos da competência: no banco compartilhado, uma matrícula alheia sem regime\n" +
        "        ou sem vencimento derruba o cálculo inteiro, e o vermelho não é deste percurso.\n" +
        `          PERCURSO_BANCO=gestao_publica_percursos_vale_${SUF} npm run percursos:servir\n` +
        `          PERCURSO_BANCO=gestao_publica_percursos_vale_${SUF} npm run smoke:adiantamento-salarial`
    );
    process.exit(3);
  }
  console.log(`      [competência ${COMP} · banco ${banco} · par ${M1} e ${M2}]`);

  let navegador: Browser | null = null;
  try {
    navegador = await lancarNavegadorDoPercurso();
    const page = await navegador.newPage();

    // ══ 1. A LANDING DA FOLHA LEVA À TELA NOVA ═══════════════════════════════
    /**
     * ⚠️ O PASSO QUE FECHA `ADIANTAMENTO-SALARIAL-SEM-SUPERFICIE`. Esta ordem encontrou DUAS vezes
     * um motor que o operador não alcança. A landing é por onde o servidor municipal ENTRA, e ela
     * já divergiu do submenu uma vez (quatro telas ficaram um ano escondidas).
     */
    await entrar(N, page, RH, SENHA);
    const landing = await irPara(N, page, "/folha");
    R.conferir(
      "1 a landing da folha oferece os parâmetros do adiantamento salarial",
      landing.includes("adiantamento salarial"),
      landing.slice(0, 600)
    );

    // ══ 2. A NATUREZA NOVA APARECE NO CADASTRO DE RUBRICA ════════════════════
    /**
     * ⚠️ SEM ESTA OPÇÃO A CADEIA NÃO EXISTE PELA INTERFACE: a rubrica que o motor mensal sabe ler
     * para abater o vale é INCADASTRÁVEL, o parâmetro não pode ser cadastrado, e o vale nunca é
     * abatido — com o domínio inteiro funcionando e nenhum teste vermelho. É o defeito nº 1 da
     * V11 V9.1 repetido, e `OPCOES_DE_NATUREZA` é um array que nenhum compilador cobra.
     */
    await irPara(N, page, "/folha/rubricas");
    const naturezas = await opcoesDe(page, 'form[data-acao="criar-rubricas"] select[name="natureza"]');
    R.conferir(
      "2.1 o select de NATUREZA oferece o abatimento do adiantamento SALARIAL",
      naturezas.some((o) => /abatimento do adiantamento salarial/i.test(o)),
      naturezas.join(" | ")
    );
    /**
     * ⚠️ E AS DUAS NATUREZAS DE ABATIMENTO SÃO DISTINGUÍVEIS NA TELA. Se os rótulos fossem
     * parecidos, o operador escolheria a do 13º para o vale — e o motor mensal descontaria do
     * salário do mês metade da gratificação natalina, com os totais fechando.
     */
    R.conferir(
      "2.2 e a do 13º continua lá, com rótulo que a distingue",
      naturezas.some((o) => /abatimento do adiantamento do 13/i.test(o)),
      naturezas.join(" | ")
    );

    const rubrica = async (codigo: string, descricao: string, tipo: string, natureza: string, ordem: string): Promise<boolean> => {
      const r = await preencherEEnviar(page, "criar-rubricas", [
        { sel: 'input[name="codigo"]', valor: codigo },
        { sel: 'input[name="descricao"]', valor: descricao },
        { sel: 'select[name="tipo"]', valor: tipo, tipo: "select" },
        { sel: 'select[name="natureza"]', valor: natureza, tipo: "select" },
        { sel: 'input[name="ordem"]', valor: ordem },
        { sel: 'input[name="fundamentacaoLegal"]', valor: "percurso sintetico" },
      ]);
      // Reexecução é REUSO: código repetido volta unicidade; natureza sistêmica repetida volta
      // `RUBRICA-SISTEMICA-DUPLICADA` (ela existe uma vez por ente).
      return r.tipo === "ok" || /já existe|unique|sistemica-duplicada|sistêmica-duplicada/i.test(r.texto);
    };

    // ══ 3. NEGATIVA: o abatimento salarial cadastrado como PROVENTO é recusado ══
    const comoProvento = await preencherEEnviar(page, "criar-rubricas", [
      { sel: 'input[name="codigo"]', valor: `ABSX${SUF}` },
      { sel: 'input[name="descricao"]', valor: "Abatimento salarial cadastrado como provento (percurso)" },
      { sel: 'select[name="tipo"]', valor: "PROVENTO", tipo: "select" },
      { sel: 'select[name="natureza"]', valor: "ABATIMENTO_DO_ADIANTAMENTO_SALARIAL", tipo: "select" },
      { sel: 'input[name="ordem"]', valor: "97" },
      { sel: 'input[name="fundamentacaoLegal"]', valor: "percurso sintetico" },
    ]);
    R.conferir(
      "3 NEGATIVA: a rubrica de abatimento salarial como PROVENTO é RECUSADA, e a recusa chega legível à tela",
      comoProvento.tipo === "erro" && /é DESCONTO/i.test(comoProvento.texto),
      `${comoProvento.tipo}: ${comoProvento.texto.slice(0, 300)}`
    );

    const feitas = [
      await rubrica(`VENC-${SUF}`, "Vencimento base (percurso)", "PROVENTO", "VENCIMENTO_BASE", "1"),
      await rubrica(`PREV-${SUF}`, "Contribuicao previdenciaria (percurso)", "DESCONTO", "CONTRIBUICAO_PREVIDENCIARIA", "90"),
      await rubrica(`IRRF-${SUF}`, "Imposto de renda (percurso)", "DESCONTO", "IMPOSTO_DE_RENDA", "91"),
      await rubrica(`ADS-${SUF}`, "Adiantamento salarial (percurso)", "PROVENTO", "VALOR_INFORMADO", "12"),
      await rubrica(`ABS-${SUF}`, "Abatimento do adiantamento salarial (percurso)", "DESCONTO", "ABATIMENTO_DO_ADIANTAMENTO_SALARIAL", "96"),
    ];
    R.conferir("3.1 as rubricas do vale estão cadastradas", feitas.every((x) => x), `resultados: ${feitas.join(", ")}`);

    // ══ 4. NEGATIVA DE AUTORIZAÇÃO: o rh@ NÃO configura o parâmetro do vale ══
    /**
     * ⚠️ ESTA NEGATIVA É EVIDÊNCIA, NÃO OBSTÁCULO. A ação é própria e vai só a quem administra
     * permissões no global. A tela tem de DIZER qual permissão falta e por que ela é separada —
     * um "criar" ausente sem explicação faz o operador concluir que o sistema não sabe fazer.
     */
    const semPoder = await irPara(N, page, "/folha/parametros-do-adiantamento-salarial");
    R.conferir(
      "4.1 NEGATIVA: sem a ação, a tela não oferece o cadastro e NOMEIA a permissão que falta",
      semPoder.includes("configurar_parametro_do_adiantamento_salarial"),
      semPoder.slice(0, 600)
    );
    R.conferir(
      "4.2 e explica por que ela não vem junto com a do 13º",
      /estatuto|decreto|própria|propria/i.test(semPoder),
      semPoder.slice(0, 900)
    );

    // ══ 5. CONFIGURAR — o admin cadastra o parâmetro da competência ══════════
    await sair(N, page);
    await entrar(N, page, ADMIN, SENHA_ADMIN);
    const tela = await irPara(N, page, "/folha/parametros-do-adiantamento-salarial");

    /**
     * ⚠️ AS DUAS BASES APARECEM E A TELA DIZ QUE ELAS NÃO ESGOTAM AS REGRAS. É a pendência
     * `REGRA-DO-ADIANTAMENTO-SALARIAL-NAO-SUPORTADA` chegando a quem escolhe: um ente cujo ato
     * fixe outra coisa não pode escolher "a mais parecida", porque o cálculo sairia errado todo
     * mês com a folha fechando e nada acusando.
     */
    const bases = await opcoesDe(page, 'form[data-acao="criar-parametro-do-adiantamento-salarial"] select[name="baseDoAdiantamento"]');
    R.conferir("5.1 as duas bases suportadas são oferecidas", bases.length >= 3, bases.join(" | "));
    R.conferir(
      "5.2 e a tela avisa que elas NÃO esgotam as regras possíveis",
      /não esgotam|nao esgotam|mais parecida/i.test(tela),
      tela.slice(0, 1200)
    );
    /**
     * ⚠️ E A TELA DIZ QUE FECHAR NÃO É PAGAR. É a pergunta inteira da ordem V13 num rótulo: se o
     * operador escolher "fechado" achando que o dinheiro já saiu, a mensal descontará do servidor
     * um vale que o ente pode ainda não ter pago.
     */
    R.conferir("5.3 e o campo do estado mínimo diz, em letra, que FECHAR NÃO É PAGAR", /fechar não é pagar|fechar nao e pagar/i.test(tela), tela.slice(0, 1600));

    /**
     * ⚠️ O RECORTE DO SELETOR DE ABATIMENTO: só a natureza que o motor mensal sabe ler. A do 13º
     * NÃO pode aparecer aqui — "lista curta não é exceção", e oferecer a errada produziria um
     * formulário bonito que o caso de uso recusa depois de o operador ter confiado nele.
     */
    const abatimentos = await opcoesDe(page, 'form[data-acao="criar-parametro-do-adiantamento-salarial"] select[name="rubricaDoAbatimentoId"]');
    R.conferir("5.4 o seletor do abatimento oferece a rubrica do VALE", abatimentos.some((o) => o.includes(`ABS-${SUF}`)), abatimentos.join(" | "));
    R.conferir("5.5 e NÃO oferece a rubrica de abatimento do 13º — o recorte é por natureza", !abatimentos.some((o) => /13/.test(o)), abatimentos.join(" | "));

    /**
     * ⚠️ O SELETOR DA CONTA CONTABIL (V13 r4) — E O RECORTE E O QUE SE MEDE, nao a presenca do
     * campo. O plano oficial tem 7.864 contas; o que a tela deve oferecer sao APENAS as analiticas
     * do ramo 1.1.3.1 (Adiantamentos concedidos). Uma VPD de pessoal aqui seria o defeito da
     * rodada 2 de volta pela porta da frente: o vale viraria despesa do mes, e a mensal a
     * reconheceria de novo pelo bruto.
     *
     * ⚠️ E A ESCOLHA E PELO CODIGO LIDO DA PROPRIA LISTA, nunca por id cravado: o id e um cuid
     * gerado pelo seed, e cravar um faria o instrumento medir o seed em vez da tela.
     */
    const contas = await opcoesDe(page, 'form[data-acao="criar-parametro-do-adiantamento-salarial"] select[name="contaDoAdiantamentoId"]');
    const contasReais = contas.filter((o) => /\d/.test(o));
    R.conferir(
      "5.4a o seletor da conta oferece ao menos uma analitica do ramo 1.1.3.1",
      contasReais.length > 0 && contasReais.every((o) => o.trim().startsWith("1.1.3.1")),
      contas.join(" | ")
    );
    R.conferir(
      "5.4b e o recorte EXCLUI o que nao e adiantamento concedido — nenhuma conta de classe 3 (VPD)",
      !contasReais.some((o) => o.trim().startsWith("3.")),
      contas.join(" | ")
    );
    const idConta = await opcaoQueCasa(page, 'form[data-acao="criar-parametro-do-adiantamento-salarial"] select[name="contaDoAdiantamentoId"]', "1.1.3.1");

    const idAdiantamento = await opcaoQueCasa(page, 'form[data-acao="criar-parametro-do-adiantamento-salarial"] select[name="rubricaDoAdiantamentoId"]', `ADS-${SUF}`);
    const idAbatimento = await opcaoQueCasa(page, 'form[data-acao="criar-parametro-do-adiantamento-salarial"] select[name="rubricaDoAbatimentoId"]', `ABS-${SUF}`);

    // ── 5.6 NEGATIVA: o ato "conforme a legislação vigente" não serve ────────
    /**
     * ⚠️ 29 CARACTERES PASSARIAM POR QUALQUER PISO DE TAMANHO. O CHECK exige número com dígito,
     * dispositivo e ementa com mais de duas palavras — e é isso que permite ao controle interno
     * conferir sem abrir o diário oficial.
     */
    const atoVago = await preencherEEnviar(page, "criar-parametro-do-adiantamento-salarial", [
      { sel: 'input[name="competencia"]', valor: COMP },
      { sel: 'input[name="percentualDoAdiantamento"]', valor: "40" },
      { sel: 'select[name="baseDoAdiantamento"]', valor: "REMUNERACAO_PROJETADA_DO_MES", tipo: "select" },
      { sel: 'select[name="estadoMinimoParaAbater"]', valor: "FECHADO", tipo: "select" },
      { sel: 'select[name="rubricaDoAdiantamentoId"]', valor: idAdiantamento, tipo: "select" },
      { sel: 'select[name="rubricaDoAbatimentoId"]', valor: idAbatimento, tipo: "select" },
      { sel: 'select[name="contaDoAdiantamentoId"]', valor: idConta, tipo: "select" },
      { sel: 'select[name="atoEsfera"]', valor: "MUNICIPAL", tipo: "select" },
      { sel: 'select[name="atoTipo"]', valor: "DECRETO", tipo: "select" },
      { sel: 'input[name="atoNumero"]', valor: "sem numero" },
      { sel: 'input[name="atoAno"]', valor: "2020" },
      { sel: 'input[name="atoDispositivo"]', valor: "art. 3o" },
      { sel: 'textarea[name="atoEmenta"]', valor: "conforme a legislacao vigente" },
    ]);
    R.conferir("5.6 NEGATIVA: ato sem número identificável é recusado, e a recusa chega à tela", atoVago.tipo === "erro", `${atoVago.tipo}: ${atoVago.texto.slice(0, 300)}`);

    // ── 5.7 O CADASTRO DE VERDADE ───────────────────────────────────────────
    const criado = await preencherEEnviar(page, "criar-parametro-do-adiantamento-salarial", [
      { sel: 'input[name="competencia"]', valor: COMP },
      { sel: 'input[name="percentualDoAdiantamento"]', valor: "40" },
      { sel: 'select[name="baseDoAdiantamento"]', valor: "REMUNERACAO_PROJETADA_DO_MES", tipo: "select" },
      { sel: 'select[name="estadoMinimoParaAbater"]', valor: "FECHADO", tipo: "select" },
      { sel: 'select[name="rubricaDoAdiantamentoId"]', valor: idAdiantamento, tipo: "select" },
      { sel: 'select[name="rubricaDoAbatimentoId"]', valor: idAbatimento, tipo: "select" },
      { sel: 'select[name="contaDoAdiantamentoId"]', valor: idConta, tipo: "select" },
      { sel: 'select[name="atoEsfera"]', valor: "MUNICIPAL", tipo: "select" },
      { sel: 'select[name="atoTipo"]', valor: "DECRETO", tipo: "select" },
      { sel: 'input[name="atoNumero"]', valor: "4.321" },
      { sel: 'input[name="atoAno"]', valor: "2020" },
      { sel: 'input[name="atoDispositivo"]', valor: "art. 3o, caput" },
      { sel: 'textarea[name="atoEmenta"]', valor: "Dispoe sobre o adiantamento salarial aos servidores do Municipio" },
    ]);
    R.conferir("5.7 o parâmetro do vale é gravado na versão 1", criado.tipo === "ok" && /versão 1|versao 1/i.test(criado.texto), `${criado.tipo}: ${criado.texto.slice(0, 300)}`);

    /**
     * ⚠️ O PERCENTUAL SAI COM VÍRGULA, e isso já foi defeito medido no percurso do 13º ("50.00%"
     * com PONTO num sistema em que todo dinheiro e toda alíquota saem com vírgula).
     */
    const lista = await irPara(N, page, "/folha/parametros-do-adiantamento-salarial");
    R.conferir("5.8 a lista mostra o percentual em pt-BR e a situação VIGENTE", lista.includes("40,00%") && lista.includes("vigente"), lista.slice(0, 900));
    R.conferir("5.9 e a coluna do critério diz que FECHADO não significa que o dinheiro saiu", /não significa que o dinheiro saiu|nao significa que o dinheiro saiu/i.test(lista), lista.slice(0, 1200));

    // ══ 6. O PAR N=2, ADMITIDO PELA TELA ═════════════════════════════════════
    /**
     * ═══ ⚠️ ESTE PASSO NÃO EXISTIA, E A AUSÊNCIA DELE ERA O QUE TRANCAVA A METADE DA FOLHA ═══
     *
     * A rodada 4 mediu: `/folha/folhas` respondia **200** e o percurso abortava logo depois, porque
     * `Servidor` era ZERO — o passo estava declarado como não executado, apontando para
     * `smoke-folha.ts`. E rodar o smoke-folha antes NÃO resolve: ele cria matrícula própria
     * (`FOL-...`), e este percurso espera `VALEA-`/`VALEB-`, porque os dois valores têm de ser
     * DIFERENTES.
     *
     * ⚠️ O HELPER É LOCAL, DE PROPÓSITO, e isso não fecha `PERCURSOS-SEM-HELPER-COMUM`. Unificar a
     * fixture de pessoal dos percursos é unidade própria, com censo dos arquivos que hoje a copiam;
     * fazê-la de passagem aqui produziria a sexta variante em vez da primeira comum. A pendência
     * CONTINUA aberta e nomeada — o que muda é que este percurso deixou de depender dela.
     */
    await sair(N, page);
    await entrar(N, page, RH, SENHA);

    /**
     * ⚠️ AS TABELAS SÃO SINTÉTICAS E O PERCENTUAL É LINEAR, e as duas escolhas são medição, não
     * preguiça. A conta à mão no alto deste arquivo diz `3.000,00 − PREV 300,00`, isto é **10%
     * exatos**; uma tabela progressiva como a do `smoke-folha` (7,5 / 9 / 14) daria outro número e
     * o percurso ficaria vermelho por causa da FIXTURE, não do produto. As três faixas levam a
     * MESMA alíquota justamente para que o total seja 10% em qualquer base do par.
     *
     * E o IRRF vai a ZERO pelo mesmo motivo: o líquido esperado (1.500,00 e 1.000,00) não tem
     * termo de imposto. Zerar aqui não afirma nada sobre a tabela da Receita — afirma que ESTE
     * percurso mede o abatimento do vale, e um imposto no meio mediria outra coisa.
     */
    /**
     * ⚠️ A EXISTENCIA DA TABELA SE CONFERE NAS LINHAS DA LISTA, NUNCA NO TEXTO DA PAGINA. Medido na
     * primeira corrida desta rodada: `/contribuição previdenciária/i` sobre o corpo inteiro casou
     * com a PROSA do formulario (o rotulo do proprio seletor de tipo) e o percurso anunciou
     * "ja vigora — reusada" com ZERO tabela no banco. E a licao "nao atestar pela papelada que
     * declara", cometida dentro do instrumento: afirme o EFEITO, e o efeito aqui e uma linha na
     * tabela marcada como vigente.
     */
    const tabelaVigente = async (rotulo: string): Promise<boolean> =>
      page.evaluate((r) => {
        const linhas = Array.from(document.querySelectorAll("tbody tr"));
        return linhas.some((tr) => {
          const cs = Array.from(tr.querySelectorAll("td")).map((td) => (td.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase());
          return cs.some((c) => c.includes(r)) && cs.some((c) => c.includes("vigente"));
        });
      }, rotulo.toLowerCase());

    await irPara(N, page, "/folha/tabelas");
    if (!(await tabelaVigente("contribuição previdenciária"))) {
      const rPrev = await preencherEEnviar(page, "criar-tabela", [
        { sel: 'select[name="tipo"]', valor: "CONTRIBUICAO_RGPS", tipo: "select" },
        { sel: 'input[name="competenciaInicio"]', valor: "2026-01" },
        { sel: 'input[name="fundamentacaoLegal"]', valor: "Tabela sintetica do percurso do vale — NAO e a portaria vigente" },
        { sel: 'input[name="teto"]', valor: "8.000,00" },
        { sel: 'input[name="aliquotaPatronal"]', valor: "22" },
        { sel: 'input[name="faixas.0.ate"]', valor: "1.000,00" },
        { sel: 'input[name="faixas.0.aliquota"]', valor: "10" },
        { sel: 'input[name="faixas.1.ate"]', valor: "3.000,00" },
        { sel: 'input[name="faixas.1.aliquota"]', valor: "10" },
        { sel: 'input[name="faixas.2.aliquota"]', valor: "10" },
      ]);
      R.conferir("6.1 tabela de contribuição LINEAR 10% cadastrada pela tela", rPrev.tipo === "ok", `${rPrev.tipo}: ${rPrev.texto.slice(0, 300)}`);
    } else {
      R.conferir("6.1 tabela de contribuição já vigora — reusada", true, "execucao anterior");
    }

    await irPara(N, page, "/folha/tabelas");
    if (!(await tabelaVigente("irrf"))) {
      const rIrrf = await preencherEEnviar(page, "criar-tabela", [
        { sel: 'select[name="tipo"]', valor: "IRRF", tipo: "select" },
        { sel: 'input[name="competenciaInicio"]', valor: "2026-01" },
        { sel: 'input[name="fundamentacaoLegal"]', valor: "Tabela sintetica do percurso do vale — NAO e a tabela da Receita" },
        { sel: 'input[name="deducaoPorDependente"]', valor: "0,00" },
        { sel: 'input[name="descontoSimplificado"]', valor: "0,00" },
        { sel: 'input[name="faixas.0.ate"]', valor: "1.000,00" },
        { sel: 'input[name="faixas.0.aliquota"]', valor: "0" },
        { sel: 'input[name="faixas.1.ate"]', valor: "3.000,00" },
        { sel: 'input[name="faixas.1.aliquota"]', valor: "0" },
        { sel: 'input[name="faixas.2.aliquota"]', valor: "0" },
      ]);
      R.conferir("6.2 tabela de IRRF zerada cadastrada pela tela", rIrrf.tipo === "ok", `${rIrrf.tipo}: ${rIrrf.texto.slice(0, 300)}`);
    } else {
      R.conferir("6.2 tabela de IRRF já vigora — reusada", true, "execucao anterior");
    }

    /**
     * ── 6.0 A LOTACAO ───────────────────────────────────────────────────────
     *
     * ⚠️ ELA FALTAVA, E O PRODUTO ESTAVA CERTO EM RECUSAR. Medido: o banco de percursos nasce com
     * ZERO lotacoes, e `admitir` devolvia `lotacaoId: Invalid input` — admissao sem lotacao nao e
     * admissao, porque e a lotacao que diz ONDE o servidor trabalha, e o M32 exige que ela esteja
     * VIGENTE na data. A primeira versao deste passo tentou adivinhar uma lotacao existente com
     * `opcaoQueCasa(..., "-")`; nao havia nenhuma para achar.
     */
    const telaLot = await irPara(N, page, "/pessoal/lotacoes");
    if (!telaLot.toLowerCase().includes(`vale-${SUF}`.toLowerCase())) {
      const rLot = await preencherEEnviar(page, "criar-lotacoes", [
        { sel: 'input[name="codigo"]', valor: `VALE-${SUF}` },
        { sel: 'input[name="nome"]', valor: `Lotacao do percurso do vale ${SUF}` },
      ]);
      R.conferir("6.0 lotação do percurso criada pela tela", rLot.tipo === "ok", `${rLot.tipo}: ${rLot.texto.slice(0, 300)}`);
    } else {
      R.conferir("6.0 lotação do percurso já existe — reusada", true, "execucao anterior");
    }

    // ── 6.3 o cargo do percurso ─────────────────────────────────────────────
    const telaCargos = await irPara(N, page, "/pessoal/cargos");
    if (!telaCargos.toLowerCase().includes(`vale-${SUF}`.toLowerCase())) {
      const rCargo = await preencherEEnviar(page, "criar-cargos", [
        { sel: 'input[name="codigo"]', valor: `VALE-${SUF}` },
        { sel: 'input[name="denominacao"]', valor: `Cargo do percurso do vale ${SUF}` },
        { sel: 'select[name="tipo"]', valor: "EFETIVO", tipo: "select" },
        { sel: 'input[name="vagasFixadas"]', valor: "5" },
        { sel: 'input[name="leiAutorizativa"]', valor: "Lei Municipal 1.234/2010 (percurso)" },
        { sel: 'input[name="dataPublicacaoLei"]', valor: "2010-05-01", tipo: "data" },
      ]);
      R.conferir("6.3 cargo do percurso criado", rCargo.tipo === "ok", `${rCargo.tipo}: ${rCargo.texto.slice(0, 300)}`);
    } else {
      R.conferir("6.3 cargo do percurso já existe — reusado", true, "execucao anterior");
    }

    /**
     * ADMITE UM SERVIDOR PELA TELA e devolve se a admissão foi aceita. Pessoa, ficha e admissão são
     * três telas distintas — e é assim que o produto separa "existe no cadastro único", "é
     * servidor" e "tem vínculo vigente".
     */
    const admitir = async (nome: string, matricula: string, salario: string, nascimento: string, semente: string): Promise<boolean> => {
      await irPara(N, page, "/cadastros/pessoas");
      const rPessoa = await preencherEEnviar(page, "cadastrar-pessoa", [
        // ⚠️ A SEMENTE E NUMERICA E DISTINTA, e isto foi defeito MEDIDO: `cpfFicticio` faz
        // `replace(/\D/g, "")`, entao `VALEA-...` e `VALEB-...` perdiam a letra que as
        // distinguia e as duas matriculas recebiam o MESMO CPF. O produto recusou, CERTO
        // ("um documento identifica UMA pessoa"), e o vermelho era do instrumento.
        { sel: 'input[data-mascara="cpf-cnpj"]', valor: cpfFicticio(semente) },
        { sel: 'input[name="nome"]', valor: nome },
      ]);
      if (rPessoa.tipo !== "ok") {
        R.falhou(`6.x pessoa ${matricula}`, `${rPessoa.tipo}: ${rPessoa.texto.slice(0, 300)}`);
        return false;
      }
      await irPara(N, page, "/pessoal/servidores");
      const idPessoa = await opcaoQueCasa(page, 'form[data-acao="criar-servidores"] select[name="pessoaId"]', nome);
      if (idPessoa === "") {
        R.falhou(`6.x ficha de ${matricula}`, "a pessoa recem-criada nao foi oferecida no seletor");
        return false;
      }
      const rServ = await preencherEEnviar(page, "criar-servidores", [
        { sel: 'select[name="pessoaId"]', valor: idPessoa, tipo: "select" },
        { sel: 'input[name="dataNascimento"]', valor: nascimento, tipo: "data" },
        { sel: 'select[name="sexo"]', valor: "FEMININO", tipo: "select" },
      ]);
      if (rServ.tipo !== "ok") {
        R.falhou(`6.x ficha de ${matricula}`, `${rServ.tipo}: ${rServ.texto.slice(0, 300)}`);
        return false;
      }
      await irPara(N, page, `/pessoal/servidores?q=${encodeURIComponent(nome)}`);
      const hrefServ = await hrefDoRegistro(page, nome);
      if (hrefServ === null) {
        R.falhou(`6.x detalhe de ${matricula}`, "servidor criado nao aparece na lista com href");
        return false;
      }
      await irPara(N, page, hrefServ);
      const idCargo = await opcaoQueCasa(page, 'form[data-acao="admitir"] select[name="cargoId"]', `VALE-${SUF}`);
      /**
       * ⚠️ A PRIMEIRA OPCAO COM VALOR DE VERDADE, e nao a que "contem um hifen". Medido: casar por
       * `"-"` pegava a opcao de placeholder e a admissao voltava `lotacaoId: Invalid input`. O
       * seletor do instrumento nao pode adivinhar o rotulo — ele pergunta qual opcao tem `value`.
       */
      const idLot = await page.evaluate((cod) => {
        const s2 = document.querySelector('form[data-acao="admitir"] select[name="lotacaoId"]');
        if (!(s2 instanceof HTMLSelectElement)) return "";
        const uteis = Array.from(s2.options).filter((o) => o.value.trim() !== "" && !o.disabled);
        return (uteis.find((o) => (o.textContent ?? "").includes(cod)) ?? uteis[0])?.value ?? "";
      }, `VALE-${SUF}`);
      const rAdm = await preencherEEnviar(page, "admitir", [
        { sel: 'input[name="matricula"]', valor: matricula },
        { sel: 'select[name="tipo"]', valor: "EFETIVO", tipo: "select" },
        { sel: 'input[name="regimeJuridico"]', valor: "Estatutario" },
        // ⚠️ O REGIME PREVIDENCIÁRIO É O QUE ESCOLHE A TABELA. Sem ele declarado, o cálculo da
        // competência inteira recusa — e a recusa nomeia a matrícula, que é o certo.
        { sel: 'select[name="regimePrevidenciario"]', valor: "RGPS", tipo: "select" },
        { sel: 'input[name="dataAdmissao"]', valor: "2026-02-01", tipo: "data" },
        ...(idCargo === "" ? [] : [{ sel: 'select[name="cargoId"]', valor: idCargo, tipo: "select" as const }]),
        ...(idLot === "" ? [] : [{ sel: 'select[name="lotacaoId"]', valor: idLot, tipo: "select" as const }]),
        { sel: 'input[data-mascara="valor"]', valor: salario },
      ]);
      if (rAdm.tipo !== "ok") {
        R.falhou(`6.x admissao de ${matricula}`, `${rAdm.tipo}: ${rAdm.texto.slice(0, 400)}`);
        return false;
      }
      return true;
    };

    /**
     * ⚠️ AS BASES SÃO DIFERENTES, E É ISSO QUE FAZ O N=2 SER INSTRUMENTO. 3.000,00 e 2.000,00 dão
     * vales de 1.200,00 e 800,00: um motor que abatesse valor FIXO, ou que abatesse o valor do
     * OUTRO vínculo, passaria com duas bases iguais e passaria com uma só.
     */
    const okM1 = await admitir(`Vale A do Percurso ${SUF}`, M1, "3.000,00", "1985-07-20", `1${SUF}01`);
    const okM2 = await admitir(`Vale B do Percurso ${SUF}`, M2, "2.000,00", "1990-03-11", `2${SUF}02`);
    R.conferir(
      "6.4 o par N=2 está admitido pela tela, com bases DIFERENTES (3.000,00 e 2.000,00)",
      okM1 && okM2,
      `M1=${okM1} M2=${okM2}`
    );
    if (!(okM1 && okM2)) {
      R.falhou("6.5 sem o par admitido, a metade da FOLHA do roteiro não pode ser medida", "interrompido aqui de proposito: seguir produziria vermelhos em cascata que nao sao do produto");
      R.encerrar();
      return;
    }

    // ══ 7. ABRIR A FOLHA DO VALE — o tipo novo aparece na barra ══════════════
    await irPara(N, page, "/folha/folhas");
    const tipos = await opcoesDe(page, 'form[data-acao="criar-folhas"] select[name="tipo"]');
    /**
     * ⚠️ `OPCOES_DE_TIPO_DE_FOLHA` É OUTRO ARRAY QUE NENHUM COMPILADOR COBRA. Sem esta linha o
     * tipo existe no domínio, no banco e no motor, e NÃO EXISTE para quem opera — foi assim que
     * `ROTULO-CRU-DO-TIPO-DE-FOLHA` se repetiu duas vezes na V11.
     */
    R.conferir("7.1 a barra de abrir folha oferece o Adiantamento salarial", tipos.some((o) => /adiantamento salarial/i.test(o)), tipos.join(" | "));
    R.conferir("7.2 e o rótulo NÃO é o nome cru do enum", !tipos.some((o) => o.trim() === "ADIANTAMENTO_SALARIAL"), tipos.join(" | "));

    const abriu = await preencherEEnviar(page, "criar-folhas", [
      { sel: 'input[name="competencia"]', valor: COMP },
      { sel: 'select[name="tipo"]', valor: "ADIANTAMENTO_SALARIAL", tipo: "select" },
    ]);
    R.conferir("7.3 a folha de vale da competência é aberta", abriu.tipo === "ok", `${abriu.tipo}: ${abriu.texto.slice(0, 300)}`);

    const href = await hrefDoRegistro(page, COMP);
    if (href === null) {
      R.falhou("7.4 a folha aberta aparece na lista com link para o detalhe", "nenhum registro da competência com href");
      R.encerrar();
      return;
    }
    await irPara(N, page, href);

    // ══ 8. SELECIONAR VÍNCULOS E CALCULAR ════════════════════════════════════
    /**
     * ⚠️ A SELEÇÃO É DECLARADA, NUNCA INFERIDA DO TAMANHO DA LISTA (V11 V9.5). Este passo confere
     * que o formulário de calcular da folha de VALE oferece o mesmo recorte que a mensal — e que
     * recortar continua exigindo `SELECIONAR_VINCULOS_DA_FOLHA`, que é ação separada de calcular.
     */
    const barraCalcular = await apresentacaoDoAto(page, "calcular");
    R.conferir("8.1 a folha de vale oferece CALCULAR, com o formulário", barraCalcular.estado === "formulario", JSON.stringify(barraCalcular));

    const calculou = await preencherEEnviar(page, "calcular", [{ sel: 'input[name="motivo"]', valor: "percurso do adiantamento salarial" }]);
    R.conferir("8.2 o cálculo nº 1 do vale roda e a tela confirma", calculou.tipo === "ok", `${calculou.tipo}: ${calculou.texto.slice(0, 400)}`);

    // ══ 9. REVISAR — o contracheque do vale se explica ═══════════════════════
    const detalhe = await irPara(N, page, href);
    R.conferir("9.1 o vale de M-1 é 1.200,00 na tela", detalhe.includes(VALE_M1), detalhe.slice(0, 1500));
    R.conferir("9.2 o vale de M-2 é 800,00 — e os dois são DIFERENTES (N=2)", detalhe.includes(VALE_M2), detalhe.slice(0, 1500));
    /**
     * ⚠️ A MEDIDA É PERCENTUAL, E ISSO É O QUE A V13 ACRESCENTOU AO `zMedida`. A tela do
     * contracheque dizia "30/30 dias" em documentos que não medem dias — a mesma mentira que este
     * módulo já registrou duas vezes (13º e complementar). Um vale que anuncie "dias" é o defeito
     * de volta pela terceira porta.
     */
    R.conferir("9.3 o contracheque do vale NÃO anuncia dias — a medida dele é percentual", /percentual/i.test(detalhe) && !/30\/30 dias/.test(detalhe), detalhe.slice(0, 2000));
    /**
     * ⚠️ E ELE DIZ QUE NÃO RETEVE NADA, em letra, em vez de o operador deduzir do silêncio.
     * `INCIDENCIA-NO-ADIANTAMENTO-SALARIAL`: quem tributa a remuneração do mês é a MENSAL.
     */
    R.conferir("9.4 e declara que não houve retenção nesta folha", /sem retenção|sem retencao|SEM_RETENCAO/i.test(detalhe), detalhe.slice(0, 2000));

    // ══ 10. FECHAR ══════════════════════════════════════════════════════════
    await sair(N, page);
    await entrar(N, page, CONTABILIDADE, SENHA);
    await irPara(N, page, href);
    const fechou = await preencherEEnviar(page, "fechar", []);
    R.conferir("10.1 a folha de vale FECHA", fechou.tipo === "ok", `${fechou.tipo}: ${fechou.texto.slice(0, 300)}`);
    const recalc = await apresentacaoDoAto(page, "calcular");
    R.conferir("10.2 fechada, RECALCULAR sai da barra e a tela diz por quê", recalc.estado === "nao-aplicavel", JSON.stringify(recalc));

    // ══ 11. EMITIR DOCUMENTO ════════════════════════════════════════════════
    /**
     * ⚠️ O RESUMO TEM DE SE INTITULAR PELO TIPO. O percurso da complementar mediu um PDF que dizia
     * "Folha mensal" numa folha que não era — e um documento que mente sobre o próprio tipo é
     * pior que documento nenhum, porque o servidor arquiva.
     */
    await irPara(N, page, `${href}?aba=resumo`);
    /**
     * ⚠️ A CONFERENCIA E NO TITULO, E A VERSAO ANTERIOR ESTAVA ERRADA — medido nesta rodada. Ela
     * proibia a expressao "folha mensal" em QUALQUER lugar da pagina, e o resumo do vale a usa
     * CORRETAMENTE na prosa que explica o proprio vale: "quem tributa a remuneracao inteira do mes
     * e a folha mensal" e "a folha mensal da mesma competencia abate o que este vale pagou". As
     * duas frases sao o produto fazendo o CERTO; reprova-las seria o instrumento enumerando a
     * forma que ele conhece e culpando a pagina por ela.
     *
     * O defeito que este passo existe para pegar e outro, e continua pego: o percurso da
     * complementar mediu um PDF que se INTITULAVA "Folha mensal" numa folha que nao era. Entao a
     * pergunta certa e sobre o TITULO — `h1`/`h2` do cabecalho —, nao sobre o corpo.
     */
    const titulo = await page.evaluate(() =>
      Array.from(document.querySelectorAll("h1, h2"))
        .map((h) => (h.textContent ?? "").replace(/\s+/g, " ").trim())
        .join(" | ")
        .toLowerCase()
    );
    R.conferir(
      "11 o resumo da folha se intitula pelo TIPO (adiantamento salarial), e o titulo NAO diz 'folha mensal'",
      /adiantamento salarial/i.test(titulo) && !/folha mensal/i.test(titulo),
      `titulos: ${titulo.slice(0, 400)}`
    );

    // ══ 12. INTEGRAR AOS ATOS FINANCEIROS ═══════════════════════════════════
    naoExecutado(
      "12 apropriar, certificar, liquidar e pagar o vale pela tela",
      "os passos são os de scripts/smoke-apropriacao-da-folha.ts e scripts/smoke-atesto-da-folha.ts, e " +
        "exigem ficha, grupo de empenho POR SERVIDOR e designação de atestador no banco do percurso. " +
        "⚠️ E ANTES DE EXECUTÁ-LOS, LEIA A PENDÊNCIA `VALE-EMPENHADO-DUPLICA-A-DESPESA-DO-MES` no " +
        "MODULO do M33: medido com banco, vale e mensal empenham cada um o seu bruto, e a competência " +
        "fecha com 4.200,00 empenhados para 3.000,00 de custo. Fazer o percurso passar por cima disso " +
        "seria dar verde a um defeito conhecido."
    );

    // ══ 13. RECONCILIAR COM A FOLHA POSTERIOR ═══════════════════════════════
    /**
     * ⚠️ É AQUI QUE A UNIDADE SE FECHA, E É O PASSO QUE OS TESTES NÃO SUBSTITUEM: o operador tem
     * de VER o desconto no contracheque do mês, com a explicação de onde ele veio.
     */
    await sair(N, page);
    await entrar(N, page, RH, SENHA);
    await irPara(N, page, "/folha/folhas");
    const abriuMensal = await preencherEEnviar(page, "criar-folhas", [
      { sel: 'input[name="competencia"]', valor: COMP },
      { sel: 'select[name="tipo"]', valor: "MENSAL", tipo: "select" },
    ]);
    R.conferir("13.1 a folha MENSAL da mesma competência é aberta", abriuMensal.tipo === "ok", `${abriuMensal.tipo}: ${abriuMensal.texto.slice(0, 300)}`);

    const hrefMensal = await hrefDoRegistro(page, COMP);
    if (hrefMensal === null) {
      R.falhou("13.2 a mensal aparece na lista", "nenhum registro com href");
      R.encerrar();
      return;
    }
    await irPara(N, page, hrefMensal);
    const calcMensal = await preencherEEnviar(page, "calcular", [{ sel: 'input[name="motivo"]', valor: "mensal da competencia do vale" }]);
    R.conferir("13.2 a mensal calcula — o vale FECHADO não a bloqueia", calcMensal.tipo === "ok", `${calcMensal.tipo}: ${calcMensal.texto.slice(0, 400)}`);

    const detalheMensal = await irPara(N, page, hrefMensal);
    R.conferir("13.3 o líquido de M-1 é 1.500,00 — a remuneração MENOS o vale já recebido", detalheMensal.includes(LIQUIDO_M1), detalheMensal.slice(0, 1800));
    R.conferir("13.4 e o de M-2 é 1.000,00 — abatimentos DIFERENTES, que é o que o N=2 prova", detalheMensal.includes(LIQUIDO_M2), detalheMensal.slice(0, 1800));
    /**
     * ⚠️ O DESCONTO SE EXPLICA NA TELA, citando a folha de origem, o critério declarado pelo ente
     * e o fato verificado. Um desconto de 1.200,00 sem procedência é o tipo de linha que o
     * servidor leva ao sindicato.
     */
    R.conferir(
      "13.5 a linha do abatimento cita a folha de origem, o critério do ente e o que foi verificado",
      /APURADA na folha FECHADA/i.test(detalheMensal) && /Critério DECLARADO|Criterio DECLARADO/i.test(detalheMensal),
      detalheMensal.slice(0, 2500)
    );
    /**
     * ⚠️ E A CONTRIBUIÇÃO CONTINUA SOBRE A REMUNERAÇÃO INTEIRA. Se o abatimento reduzisse a base,
     * M-1 recolheria 10% de 1.800,00 = 180,00 e o ente recolheria a MENOS ao RPPS todo mês com
     * vale — com a folha fechando e o total batendo.
     */
    R.conferir("13.6 a contribuição de M-1 é 300,00 (sobre 3.000,00), não 180,00", detalheMensal.includes("300,00") && !detalheMensal.includes("180,00"), detalheMensal.slice(0, 2500));
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
