import "dotenv/config";
import type { Browser, Page } from "puppeteer";
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
 * ═══ PERCURSO DA SELEÇÃO NO CÁLCULO DA FOLHA — TR 5.12.50 (V12) ═══
 *
 * A capacidade existe no motor desde `29a43fe`, com guarda, fato de abrangência e testes. Até a
 * V12 R5 **ninguém a alcançava**: a ação de calcular lia só `motivo` e nunca repassava `selecao`,
 * e nenhuma tela lia `AbrangenciaDoCalculo`. Este percurso é a prova de que a cadeia inteira
 * chegou à interface — entrada, seleção, autorização, motor, efeito, consulta e correção.
 *
 * ⚠️ O CENÁRIO OBRIGATÓRIO É A SUBTRAÇÃO SILENCIOSA, não a duplicidade. Cálculo nº1={A,B},
 * cálculo nº2={C,D}, fechar → **recusa nomeando M-A e M-B**. Todo mundo vigia pagar duas vezes; o
 * risco real é o oposto, e ele fecha com o total, o empenho e a liquidação batendo.
 *
 * ⚠️ E AS DUAS SAÍDAS SÃO EXERCITADAS, porque a guarda impede o ESQUECIMENTO e não a DECISÃO. Se
 * a tela oferecesse só uma, ela viraria a decisão no lugar do operador:
 *   · recalcular com a seleção ACUMULADA (folha 1) — "eu queria todos";
 *   · CANCELAR o cálculo que os processou (folha 2) — "eu não quero aqueles".
 *
 * ⚠️ O PASSO QUE SÓ A TELA RESPONDE. A ordem do usuário proíbe em letra que "a paginação defina
 * silenciosamente quem será calculado". O percurso navega a lista de servidores para uma página
 * onde os declarados NÃO aparecem e confirma que o calculado é o declarado — e afirma também que o
 * formulário de calcular não tem nenhum campo por vínculo, isto é, que não há o que a paginação
 * pudesse influenciar.
 *
 * ⚠️ ELE NÃO LIMPA O BANCO. Tabelas e rubricas do ente são únicas por vigência: a primeira
 * execução as cadastra, as seguintes as reusam (e dizem isso). Cargos, lotações, pessoas e
 * matrículas levam o sufixo da execução.
 */
const N: Navegador = { base: process.argv[2] ?? "http://localhost:3010" };
const RH = "rh@percursos.local";
const CONTABIL = "contabilidade@percursos.local";
const SENHA = process.env["PERCURSOS_SENHA_PAPEIS"] ?? "Percurso#2026";
const SUF = String(Date.now()).slice(-6);

const MAT = { A: `SEL-A${SUF}`, B: `SEL-B${SUF}`, C: `SEL-C${SUF}`, D: `SEL-D${SUF}` } as const;
const R = registroDePassos();

/** CPF sintético válido — o dígito é calculado, não inventado. */
function cpfFicticio(semente: number): string {
  const base = String(semente).padStart(9, "0").slice(-9).split("").map(Number);
  const dv = (ds: readonly number[]): number => {
    const peso = ds.length + 1;
    const soma = ds.reduce((acc, d, i) => acc + d * (peso - i), 0);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(base);
  const d2 = dv([...base, d1]);
  return `${base.join("")}${d1}${d2}`;
}

async function celulas(page: Page): Promise<readonly string[]> {
  return page.$$eval("table tbody tr", (linhas) =>
    linhas.map((tr) => (tr.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase())
  );
}

async function opcaoQueCasa(page: Page, select: string, trecho: string): Promise<string> {
  return page
    .$$eval(`${select} option`, (os, t) => (os.find((o) => (o.textContent ?? "").includes(t as string)) as HTMLOptionElement | undefined)?.value ?? "", trecho)
    .catch(() => "");
}

/** As matrículas que a seção de abrangência mostra como CALCULADAS no cálculo de número `n`. */
async function calculadosNoCalculo(page: Page, n: number): Promise<readonly string[]> {
  return page
    .$$eval(`[data-abrangencia-do-calculo="${n}"] tr[data-abrangencia-matricula]`, (linhas) =>
      linhas
        .filter((tr) => tr.querySelector('[data-calculado="sim"]') !== null)
        .map((tr) => tr.getAttribute("data-abrangencia-matricula") ?? "")
    )
    .catch(() => []);
}

async function modoDoCalculo(page: Page, n: number): Promise<string> {
  return page
    .$eval(`[data-abrangencia-do-calculo="${n}"] [data-modo-de-selecao]`, (e) => e.getAttribute("data-modo-de-selecao") ?? "")
    .catch(() => "");
}

async function abrirFolhaDaCompetencia(page: Page, competencia: string): Promise<string> {
  await irPara(N, page, "/folha/folhas");
  const r = await preencherEEnviar(page, "criar-folhas", [
    { sel: 'input[name="competencia"]', valor: competencia },
    { sel: 'select[name="tipo"]', valor: "MENSAL", tipo: "select" },
  ]);
  if (r.tipo !== "ok") return "";
  await irPara(N, page, "/folha/folhas");
  return (await hrefDoRegistro(page, competencia)) ?? "";
}

async function calcular(
  page: Page,
  href: string,
  modo: "TODOS_OS_ELEGIVEIS" | "EXPLICITA",
  matriculas: string
): Promise<{ readonly tipo: string; readonly texto: string }> {
  await irPara(N, page, href);
  return preencherEEnviar(page, "calcular", [
    { sel: 'select[name="modoDeSelecao"]', valor: modo, tipo: "select" },
    { sel: 'textarea[name="matriculasSelecionadas"]', valor: matriculas },
    { sel: 'input[name="motivo"]', valor: `percurso da seleção ${SUF}` },
  ]);
}

async function main(): Promise<void> {
  let navegador: Browser | undefined;
  try {
    navegador = await lancarNavegadorDoPercurso();
    const page = await navegador.newPage();
    page.setDefaultTimeout(120000);
    await page.setViewport({ width: 1366, height: 900 });
    console.log(`      [sufixo ${SUF} · base ${N.base}]`);

    await entrar(N, page, RH, SENHA);

    // ══ 0. a base do ente: tabelas e rubricas (reusadas quando já vigoram) ══
    await irPara(N, page, "/folha/tabelas");
    /**
     * ⚠️ A EXISTÊNCIA SE LÊ NAS LINHAS DA TABELA, NUNCA NO TEXTO DA PÁGINA — e a primeira versão
     * deste percurso errou exatamente aqui. `texto(page)` inclui o FORMULÁRIO, e o `select` de tipo
     * tem as opções "IRRF", "CONTRIBUICAO_RGPS" e "SALARIO_FAMILIA": o instrumento concluiu "já
     * vigora — reusada" com ZERO tabelas no banco, e o cálculo depois recusou com TABELA-AUSENTE,
     * que era o produto fazendo o certo. É a mesma doença de um guard que casa com o texto-fonte
     * em vez de afirmar o efeito.
     */
    const linhasDasTabelas = await celulas(page);
    const temTabela = (t: string): boolean => linhasDasTabelas.some((c) => c.includes(t));
    if (!temTabela("rgps")) {
      const r = await preencherEEnviar(page, "criar-tabela", [
        { sel: 'select[name="tipo"]', valor: "CONTRIBUICAO_RGPS", tipo: "select" },
        { sel: 'input[name="competenciaInicio"]', valor: "2026-01" },
        { sel: 'input[name="fundamentacaoLegal"]', valor: "Tabela sintética do percurso — não é a portaria vigente" },
        { sel: 'input[name="teto"]', valor: "8.000,00" },
        { sel: 'input[name="aliquotaPatronal"]', valor: "22" },
        { sel: 'input[name="faixas.0.aliquota"]', valor: "9" },
      ]);
      R.conferir("0.1 tabela de contribuição RGPS", r.tipo === "ok", r.texto.slice(0, 200));
    } else R.ok("0.1 tabela de contribuição RGPS já vigora — reusada");
    if (!temTabela("irrf")) {
      await irPara(N, page, "/folha/tabelas");
      const r = await preencherEEnviar(page, "criar-tabela", [
        { sel: 'select[name="tipo"]', valor: "IRRF", tipo: "select" },
        { sel: 'input[name="competenciaInicio"]', valor: "2026-01" },
        { sel: 'input[name="fundamentacaoLegal"]', valor: "Tabela sintética do percurso — não é a tabela da Receita" },
        { sel: 'input[name="deducaoPorDependente"]', valor: "200,00" },
        { sel: 'input[name="descontoSimplificado"]', valor: "600,00" },
        { sel: 'input[name="faixas.0.aliquota"]', valor: "0" },
      ]);
      R.conferir("0.2 tabela de IRRF", r.tipo === "ok", r.texto.slice(0, 200));
    } else R.ok("0.2 tabela de IRRF já vigora — reusada");
    if (!temTabela("salário-família")) {
      await irPara(N, page, "/folha/tabelas");
      const r = await preencherEEnviar(page, "criar-tabela", [
        { sel: 'select[name="tipo"]', valor: "SALARIO_FAMILIA", tipo: "select" },
        { sel: 'input[name="competenciaInicio"]', valor: "2026-01" },
        { sel: 'input[name="fundamentacaoLegal"]', valor: "Tabela sintética do percurso" },
        { sel: 'input[name="rendaMaxima"]', valor: "2.000,00" },
        { sel: 'input[name="valorPorDependente"]', valor: "60,00" },
        { sel: 'input[name="idadeLimite"]', valor: "14" },
      ]);
      R.conferir("0.3 tabela de salário-família", r.tipo === "ok", r.texto.slice(0, 200));
    } else R.ok("0.3 tabela de salário-família já vigora — reusada");

    await irPara(N, page, "/folha/rubricas?pagina=1");
    const rubricas = await celulas(page);
    const temNatureza = (nat: string): boolean => rubricas.some((c) => c.includes(nat.toLowerCase()));
    const rubrica = async (campos: readonly { readonly sel: string; readonly valor: string; readonly tipo?: "select" | "marcar" }[], rotulo: string, nat: string): Promise<void> => {
      if (temNatureza(nat)) {
        R.ok(`${rotulo} — já existe rubrica desta natureza, reusada`);
        return;
      }
      await irPara(N, page, "/folha/rubricas");
      const r = await preencherEEnviar(page, "criar-rubricas", campos);
      R.conferir(rotulo, r.tipo === "ok", r.texto.slice(0, 200));
    };
    await rubrica(
      [
        { sel: 'input[name="codigo"]', valor: "VENC" },
        { sel: 'input[name="descricao"]', valor: "Vencimento base" },
        { sel: 'select[name="tipo"]', valor: "PROVENTO", tipo: "select" },
        { sel: 'select[name="natureza"]', valor: "VENCIMENTO_BASE", tipo: "select" },
        { sel: 'input[name="ordem"]', valor: "1" },
        { sel: 'input[name="fundamentacaoLegal"]', valor: "Percurso" },
      ],
      "0.4 rubrica de vencimento base",
      "vencimento base"
    );
    await rubrica(
      [
        { sel: 'input[name="codigo"]', valor: "PREV" },
        { sel: 'input[name="descricao"]', valor: "Contribuição previdenciária" },
        { sel: 'select[name="tipo"]', valor: "DESCONTO", tipo: "select" },
        { sel: 'select[name="natureza"]', valor: "CONTRIBUICAO_PREVIDENCIARIA", tipo: "select" },
        { sel: 'input[name="ordem"]', valor: "90" },
        { sel: 'input[name="fundamentacaoLegal"]', valor: "Percurso" },
      ],
      "0.5 rubrica de contribuição",
      "contribuição previdenciária"
    );
    await rubrica(
      [
        { sel: 'input[name="codigo"]', valor: "IRRF" },
        { sel: 'input[name="descricao"]', valor: "Imposto de renda" },
        { sel: 'select[name="tipo"]', valor: "DESCONTO", tipo: "select" },
        { sel: 'select[name="natureza"]', valor: "IMPOSTO_DE_RENDA", tipo: "select" },
        { sel: 'input[name="ordem"]', valor: "91" },
        { sel: 'input[name="fundamentacaoLegal"]', valor: "Percurso" },
      ],
      "0.6 rubrica de IRRF",
      "imposto de renda"
    );

    // ══ 1. os quatro servidores do cenário obrigatório ══
    await irPara(N, page, "/pessoal/cargos");
    const rc = await preencherEEnviar(page, "criar-cargos", [
      { sel: 'input[name="codigo"]', valor: `SEL${SUF}` },
      { sel: 'input[name="denominacao"]', valor: `Cargo do percurso da seleção ${SUF}` },
      { sel: 'select[name="tipo"]', valor: "EFETIVO", tipo: "select" },
      { sel: 'input[name="vagasFixadas"]', valor: "50" },
      { sel: 'input[name="leiAutorizativa"]', valor: "Lei Municipal 1.234/2010 (percurso)" },
      { sel: 'input[name="dataPublicacaoLei"]', valor: "2010-05-01", tipo: "data" },
    ]);
    R.conferir("1.1 cargo do percurso criado", rc.tipo === "ok", rc.texto.slice(0, 160));
    await irPara(N, page, "/pessoal/lotacoes");
    const rl = await preencherEEnviar(page, "criar-lotacoes", [
      { sel: 'input[name="codigo"]', valor: `LSEL${SUF}` },
      { sel: 'input[name="nome"]', valor: `Lotação do percurso ${SUF}` },
    ]);
    R.conferir("1.2 lotação do percurso criada", rl.tipo === "ok", rl.texto.slice(0, 160));

    const admitidos: string[] = [];
    let i = 0;
    for (const [letra, matricula] of Object.entries(MAT)) {
      i += 1;
      const nome = `Servidora ${letra} da selecao ${SUF}`;
      await irPara(N, page, "/cadastros/pessoas");
      const rp = await preencherEEnviar(page, "cadastrar-pessoa", [
        { sel: 'input[data-mascara="cpf-cnpj"]', valor: cpfFicticio(Number(SUF) * 10 + i) },
        { sel: 'input[name="nome"]', valor: nome },
      ]);
      if (rp.tipo === "erro" && !/já existe|unique/i.test(rp.texto)) {
        R.falhou(`1.3 pessoa ${letra}`, rp.texto.slice(0, 160));
        continue;
      }
      await irPara(N, page, "/pessoal/servidores");
      const pessoaId = await opcaoQueCasa(page, 'form[data-acao="criar-servidores"] select[name="pessoaId"]', nome);
      const rs = await preencherEEnviar(page, "criar-servidores", [
        { sel: 'select[name="pessoaId"]', valor: pessoaId, tipo: "select" },
        { sel: 'input[name="dataNascimento"]', valor: "1985-07-20", tipo: "data" },
        { sel: 'select[name="sexo"]', valor: "FEMININO", tipo: "select" },
      ]);
      if (rs.tipo === "erro" && !/já existe|unique/i.test(rs.texto)) {
        R.falhou(`1.4 servidor ${letra}`, rs.texto.slice(0, 160));
        continue;
      }
      await irPara(N, page, "/pessoal/servidores");
      const href = await hrefDoRegistro(page, nome);
      if (href === null) {
        R.falhou(`1.5 ficha de ${letra}`, `não achei a ficha de "${nome}" na lista`);
        continue;
      }
      await irPara(N, page, href);
      const cargoId = await opcaoQueCasa(page, 'form[data-acao="admitir"] select[name="cargoId"]', `SEL${SUF}`);
      const lotId = await opcaoQueCasa(page, 'form[data-acao="admitir"] select[name="lotacaoId"]', `LSEL${SUF}`);
      const ra = await preencherEEnviar(page, "admitir", [
        { sel: 'input[name="matricula"]', valor: matricula },
        { sel: 'select[name="tipo"]', valor: "EFETIVO", tipo: "select" },
        { sel: 'input[name="regimeJuridico"]', valor: "Estatutario" },
        { sel: 'select[name="regimePrevidenciario"]', valor: "RGPS", tipo: "select" },
        { sel: 'input[name="dataAdmissao"]', valor: "2026-01-05", tipo: "data" },
        { sel: 'select[name="cargoId"]', valor: cargoId, tipo: "select" },
        { sel: 'select[name="lotacaoId"]', valor: lotId, tipo: "select" },
        { sel: 'input[data-mascara="valor"]', valor: "3.000,00" },
      ]);
      if (ra.tipo === "ok") admitidos.push(matricula);
      else R.falhou(`1.6 admissão de ${letra}`, ra.texto.slice(0, 200));
    }
    R.conferir("1.7 as QUATRO matrículas do cenário estão admitidas", admitidos.length === 4, `admitidas: ${admitidos.join(", ") || "nenhuma"}`);

    // ══ 2. o formulário declara o MODO — e não tem campo por vínculo ══
    const comp1 = `2026-0${(Number(SUF.slice(-1)) % 8) + 1}`.slice(0, 7);
    const folha1 = await abrirFolhaDaCompetencia(page, comp1);
    if (folha1 === "") {
      R.falhou("2.0 abrir a folha do percurso", `não consegui abrir/achar a folha de ${comp1}`);
      R.encerrar();
      return;
    }
    await irPara(N, page, folha1);
    const temModo = (await page.$('form[data-acao="calcular"] select[name="modoDeSelecao"]')) !== null;
    const temTextarea = (await page.$('form[data-acao="calcular"] textarea[name="matriculasSelecionadas"]')) !== null;
    R.conferir("2.1 o formulário de calcular DECLARA o modo e recebe as matrículas", temModo && temTextarea, `modo=${temModo} matriculas=${temTextarea}`);

    /**
     * ⚠️ O PASSO QUE FECHA A PROIBIÇÃO DA ORDEM, PELA AUSÊNCIA. "A paginação não pode definir
     * silenciosamente quem será calculado" — e a forma mais forte de garantir isso é o formulário
     * NÃO TER nada por vínculo para enviar. Se um dia alguém acrescentar caixas de seleção por
     * linha, este passo fica vermelho antes de qualquer defeito aparecer numa folha.
     */
    const camposPorVinculo = await page.$$eval(
      'form[data-acao="calcular"] input[type="checkbox"], form[data-acao="calcular"] select[multiple]',
      (es) => es.length
    ).catch(() => 0);
    R.conferir("2.2 NÃO há campo por vínculo no formulário — não existe o que a paginação pudesse definir", camposPorVinculo === 0, `campos por vínculo encontrados: ${camposPorVinculo}`);

    // ══ 3. as recusas da declaração ══
    const negVazia = await calcular(page, folha1, "EXPLICITA", "   ");
    R.conferir("3.1 NEGATIVA: recorte EXPLÍCITO sem matrícula recusa — 'ninguém' não vira 'todos'", negVazia.tipo === "erro" && /SELECAO-EXPLICITA-SEM-MATRICULA/.test(negVazia.texto), `${negVazia.tipo}: ${negVazia.texto.slice(0, 220)}`);

    const negContra = await calcular(page, folha1, "TODOS_OS_ELEGIVEIS", MAT.A);
    R.conferir("3.2 NEGATIVA: modo TODOS com matrículas digitadas recusa — as duas leituras são opostas", negContra.tipo === "erro" && /SELECAO-CONTRADITORIA/.test(negContra.texto), `${negContra.tipo}: ${negContra.texto.slice(0, 220)}`);

    const negInexistente = await calcular(page, folha1, "EXPLICITA", `${MAT.A}\nNAO-EXISTE-${SUF}`);
    R.conferir(
      "3.3 NEGATIVA: matrícula inexistente recusa NOMEANDO, e não calcula a que achou",
      negInexistente.tipo === "erro" && /MATRICULA-NAO-ENCONTRADA/.test(negInexistente.texto) && negInexistente.texto.includes(`NAO-EXISTE-${SUF}`),
      `${negInexistente.tipo}: ${negInexistente.texto.slice(0, 260)}`
    );

    // ══ 4. o cenário obrigatório: nº1={A,B}, nº2={C,D} ══
    const c1 = await calcular(page, folha1, "EXPLICITA", `${MAT.A}, ${MAT.B}`);
    R.conferir("4.1 cálculo nº1 com recorte EXPLÍCITO de {A,B}: 2 contracheques", c1.tipo === "ok" && /2 contracheque/.test(c1.texto) && /EXPL[ÍI]CITO de 2/.test(c1.texto), `${c1.tipo}: ${c1.texto.slice(0, 260)}`);

    const c2 = await calcular(page, folha1, "EXPLICITA", `${MAT.C}\n${MAT.D}`);
    R.conferir("4.2 cálculo nº2 com recorte EXPLÍCITO de {C,D}: 2 contracheques", c2.tipo === "ok" && /2 contracheque/.test(c2.texto), `${c2.tipo}: ${c2.texto.slice(0, 260)}`);

    // ══ 5. a abrangência é CONSULTÁVEL — quem entrou em cada cálculo ══
    await irPara(N, page, folha1);
    const calc1 = await calculadosNoCalculo(page, 1);
    const calc2 = await calculadosNoCalculo(page, 2);
    R.conferir(
      "5.1 a seção de abrangência mostra o cálculo nº1 com EXATAMENTE M-A e M-B",
      calc1.length === 2 && calc1.includes(MAT.A) && calc1.includes(MAT.B),
      `nº1 calculados: ${calc1.join(", ") || "nenhum"}`
    );
    R.conferir(
      "5.2 e o cálculo nº2 com EXATAMENTE M-C e M-D — não a união, não os visíveis",
      calc2.length === 2 && calc2.includes(MAT.C) && calc2.includes(MAT.D),
      `nº2 calculados: ${calc2.join(", ") || "nenhum"}`
    );
    R.conferir("5.3 o MODO fica gravado por cálculo, e é EXPLICITA nos dois", (await modoDoCalculo(page, 1)) === "EXPLICITA" && (await modoDoCalculo(page, 2)) === "EXPLICITA", `nº1=${await modoDoCalculo(page, 1)} nº2=${await modoDoCalculo(page, 2)}`);

    // ══ 6. FECHAR recusa nomeando quem sumiria ══
    await sair(N, page);
    await entrar(N, page, CONTABIL, SENHA);
    await irPara(N, page, folha1);
    const fechar1 = await preencherEEnviar(page, "fechar", []);
    R.conferir(
      "6.1 ⚠️ FECHAR RECUSA nomeando M-A e M-B — a subtração silenciosa barrada na tela",
      fechar1.tipo === "erro" && /SELECIONADOS-QUE-SUMIRIAM/.test(fechar1.texto) && fechar1.texto.includes(MAT.A) && fechar1.texto.includes(MAT.B),
      `${fechar1.tipo}: ${fechar1.texto.slice(0, 300)}`
    );
    R.conferir(
      "6.2 e a recusa oferece as DUAS saídas — recalcular incluindo, ou cancelar o cálculo que as processou",
      /[Rr]ecalcule/.test(fechar1.texto) && /cancele/i.test(fechar1.texto),
      fechar1.texto.slice(0, 300)
    );

    // ══ 7. SAÍDA 1 — recalcular com a seleção ACUMULADA ══
    await sair(N, page);
    await entrar(N, page, RH, SENHA);
    const c3 = await calcular(page, folha1, "EXPLICITA", `${MAT.A}, ${MAT.B}, ${MAT.C}, ${MAT.D}`);
    R.conferir("7.1 SAÍDA 1: recalcular com a seleção acumulada {A,B,C,D} — 4 contracheques", c3.tipo === "ok" && /4 contracheque/.test(c3.texto), `${c3.tipo}: ${c3.texto.slice(0, 220)}`);
    await sair(N, page);
    await entrar(N, page, CONTABIL, SENHA);
    await irPara(N, page, folha1);
    const fechar2 = await preencherEEnviar(page, "fechar", []);
    R.conferir("7.2 agora a folha FECHA — a guarda impedia o esquecimento, não a decisão", fechar2.tipo === "ok" && /[Ff]echada/.test(fechar2.texto), `${fechar2.tipo}: ${fechar2.texto.slice(0, 220)}`);

    // ══ 8. SAÍDA 2 — cancelar o cálculo que processou os que sairiam ══
    await sair(N, page);
    await entrar(N, page, RH, SENHA);
    const comp2 = `2026-${String(((Number(SUF.slice(-1)) + 4) % 8) + 1).padStart(2, "0")}`;
    const folha2 = await abrirFolhaDaCompetencia(page, comp2);
    if (folha2 === "") {
      R.falhou("8.0 abrir a segunda folha", `não consegui abrir/achar a folha de ${comp2}`);
    } else {
      const d1 = await calcular(page, folha2, "EXPLICITA", `${MAT.A}, ${MAT.B}`);
      const d2 = await calcular(page, folha2, "EXPLICITA", `${MAT.C}, ${MAT.D}`);
      R.conferir("8.1 segunda folha com a mesma armadilha: nº1={A,B}, nº2={C,D}", d1.tipo === "ok" && d2.tipo === "ok", `${d1.tipo}/${d2.tipo}`);
      await sair(N, page);
      await entrar(N, page, CONTABIL, SENHA);
      await irPara(N, page, folha2);
      const bloqueada = await preencherEEnviar(page, "fechar", []);
      R.conferir("8.2 e ela também é recusada, nomeando M-A e M-B", bloqueada.tipo === "erro" && bloqueada.texto.includes(MAT.A), bloqueada.texto.slice(0, 200));
      await sair(N, page);
      await entrar(N, page, RH, SENHA);
      await irPara(N, page, folha2);
      // ⚠️ Cancelar o VIVO (o nº2) não resolveria: quem sumiria continua sendo A e B do nº1. O
      // percurso cancela até que o cálculo que processou A e B deixe de valer.
      const cancel1 = await preencherEEnviar(page, "cancelar-calculo", [{ sel: 'input[name="motivo"]', valor: `percurso: este recorte não vale (${SUF})` }]);
      const cancel2 = await preencherEEnviar(page, "cancelar-calculo", [{ sel: 'input[name="motivo"]', valor: `percurso: A e B não entram nesta folha (${SUF})` }]);
      R.conferir("8.3 SAÍDA 2: os cálculos são cancelados como FATO, com motivo", cancel1.tipo === "ok" && cancel2.tipo === "ok", `${cancel1.tipo}/${cancel2.tipo}`);
      await irPara(N, page, folha2);
      const marcados = await page.$$eval("[data-calculo-cancelado]", (es) => es.length).catch(() => 0);
      R.conferir("8.4 os cancelados continuam VISÍVEIS na abrangência, marcados como tais", marcados >= 2, `cálculos marcados como cancelados: ${marcados}`);
      const d3 = await calcular(page, folha2, "EXPLICITA", `${MAT.C}, ${MAT.D}`);
      R.conferir("8.5 um cálculo novo só com {C,D}", d3.tipo === "ok" && /2 contracheque/.test(d3.texto), d3.texto.slice(0, 200));
      await sair(N, page);
      await entrar(N, page, CONTABIL, SENHA);
      await irPara(N, page, folha2);
      const fechar3 = await preencherEEnviar(page, "fechar", []);
      R.conferir("8.6 e AGORA fecha sem A e B — porque a exclusão deles virou ATO, não esquecimento", fechar3.tipo === "ok", `${fechar3.tipo}: ${fechar3.texto.slice(0, 220)}`);
    }

    // ══ 9. o passo que só a tela responde: declarado ≠ visível ══
    await sair(N, page);
    await entrar(N, page, RH, SENHA);
    const comp3 = `2026-${String(((Number(SUF.slice(-1)) + 7) % 12) + 1).padStart(2, "0")}`;
    const folha3 = await abrirFolhaDaCompetencia(page, comp3);
    if (folha3 === "") {
      R.falhou("9.0 abrir a terceira folha", `não consegui abrir/achar a folha de ${comp3}`);
    } else {
      // Fica numa página da lista de servidores onde os declarados NÃO aparecem.
      await irPara(N, page, "/pessoal/servidores?pagina=1&ordenar=matricula");
      const visiveisNaPagina = await celulas(page);
      const algumDeclaradoVisivel = visiveisNaPagina.some((c) => c.includes(MAT.A.toLowerCase()) || c.includes(MAT.C.toLowerCase()));
      const c4 = await calcular(page, folha3, "EXPLICITA", `${MAT.A}, ${MAT.C}`);
      await irPara(N, page, folha3);
      const calculados = await calculadosNoCalculo(page, 1);
      R.conferir(
        "9.1 ⚠️ QUEM É CALCULADO É QUEM FOI DECLARADO — a lista de servidores estava noutra página",
        c4.tipo === "ok" && calculados.length === 2 && calculados.includes(MAT.A) && calculados.includes(MAT.C),
        `declarados A e C · calculados: ${calculados.join(", ") || "nenhum"} · declarados visíveis na página consultada: ${algumDeclaradoVisivel}`
      );
      R.conferir(
        "9.2 e B e D, que NÃO foram declarados, não entraram — a omissão também é afirmada",
        !calculados.includes(MAT.B) && !calculados.includes(MAT.D),
        `calculados: ${calculados.join(", ")}`
      );
    }

    await sair(N, page);
  } catch (e) {
    R.falhou("execução", e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e));
  } finally {
    if (navegador !== undefined) await navegador.close();
  }
  R.encerrar();
}

await main();
