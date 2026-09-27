import "dotenv/config";
import {
  entrar,
  irPara,
  lancarNavegadorDoPercurso,
  preencherEEnviar,
  type Navegador,
} from "./percursos-navegador.js";
import type { Page } from "puppeteer";

/**
 * V16/C30 — A GUIA REPARTIDA ENTRE FONTES, PELA TELA.
 *
 * ═══ O QUE SÓ A TELA ALCANÇA, E O QUE ESTE PERCURSO NÃO REPETE ═══
 * A aritmética — a classe 7 repartida por natureza, a DDR 60/40, a conservação garantida pelo
 * motor, o estorno herdando a distribuição, o CHECK do banco — está provada em
 * `modules/m04-receita/m04-distribuicao-por-fonte.test.ts` (13 testes) e o rol em
 * `modules/m09-tesouraria/m09-rol-de-fontes.test.ts` (6). Repetir a soma aqui seria segunda
 * aritmética sobre o mesmo dinheiro.
 *
 * O que só a tela responde, e é o que este arquivo mede:
 *
 *   1. **A CADEIA DE CONFIGURAÇÃO, NA ORDEM.** A mesma guia é recusada TRÊS vezes, cada uma
 *      nomeando a coisa que falta — a natureza da fonte (ato do ente), o rol da conta (o cadastro
 *      que nasceu nesta unidade) e, no caso da fonte não prevista, o motivo escrito. Depois de
 *      cada cadastro, a MESMA guia é reenviada. É a ordem que prova o cadastro: uma tela que
 *      aceitasse antes teria aceitado por acidente.
 *   2. **A REPARTIÇÃO LEGÍVEL.** A lista de guias mostra "500 · 60.000,00 / 540 · 40.000,00" onde
 *      antes mostrava só a fonte padrão. É o único lugar em que um servidor confere isso.
 *   3. **O SNAPSHOT NO ESTORNO, PELA PERSISTÊNCIA.** A anulação é feita pela tela e a lista,
 *      recarregada, mostra a linha da anulação com as MESMAS duas fontes e os mesmos valores.
 *
 * ⚠️ NÃO LIMPA O BANCO. Todo número de guia leva o sufixo do instante; os passos que dependem de
 * estado anterior leem o estado e dizem quando pulam e por quê.
 *
 * ⚠️ PRÉ-REQUISITO: `scripts/preparar-receita-por-fontes-de-percursos.ts` no MESMO banco (ele
 * cadastra as fontes 540 e 700 e prevê a natureza em 500 e 540 — a 700 fica de fora de propósito).
 *
 * ⚠️ ACHADO DE TELA, NOMEADO E NÃO CONSERTADO AQUI: o painel de atualizações de permissões
 * (`/administracao/perfis`) NÃO carrega o marcador `data-resultado-da-acao` do contrato V6.2 — o
 * formulário SAI da tela e a confirmação fica fora dele, então o ajudante lê "silêncio" mesmo
 * quando o ato funciona. Por isso o passo 1 confere pela PERSISTÊNCIA (recarrega e lê
 * `data-situacao="aplicada"`), que é evidência mais forte de todo modo.
 *
 * Uso:  npx tsx scripts/smoke-receita-por-fontes.ts http://localhost:3010
 */
const BASE = process.argv[2] ?? "http://localhost:3010";
const ADMIN = process.argv[3] ?? "admin@cg.pb.gov.br";
const SENHA_ADMIN = process.argv[4] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const SUF = String(Date.now()).slice(-6);
const ANO = new Date().getFullYear();
const n: Navegador = { base: BASE };

const falhas: string[] = [];
const passos: string[] = [];
const naoExecutados: string[] = [];

function ok(passo: string): void {
  passos.push(passo);
  console.log(`[ok] ${passo}`);
}
function falhou(passo: string, detalhe: string): void {
  falhas.push(`${passo} — ${detalhe}`);
  console.error(`[FALHA] ${passo} — ${detalhe}`);
}
function conferir(passo: string, condicao: boolean, detalhe: string): void {
  if (condicao) ok(passo);
  else falhou(passo, detalhe);
}
function naoExecutado(passo: string, motivo: string): void {
  naoExecutados.push(`${passo} — ${motivo}`);
  console.error(`[NAO EXECUTADO] ${passo} — ${motivo}`);
}
function nota(texto: string): void {
  console.log(`      [${texto}]`);
}
function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

/** A guia repartida, enviada pelo formulário do segundo passo. */
async function enviarGuia(
  page: Page,
  p: {
    readonly conta: string;
    readonly total: string;
    readonly numero: string;
    readonly parcelas: readonly string[];
    readonly outraFonte?: string;
    readonly outroValor?: string;
    readonly fundamento?: string;
  }
): Promise<{ readonly tipo: string; readonly texto: string }> {
  // ⚠️ TODOS OS CAMPOS DE DINHEIRO SÃO `input[data-mascara="valor"]`, E `indice` CONTA ELEMENTOS —
  // não opções, não fontes. A ordem no DOM é: 0 = total do depósito, 1..N = as parcelas das fontes
  // previstas (na ordem da LOA, por código), N+1 = o valor da fonte não prevista. O campo que o
  // formulário submete é o HIDDEN que a máscara mantém ao lado, com o valor cru; digitar no
  // visível é o que a pessoa faz.
  const campos = [
    { sel: 'select[name="contaBancaria"]', valor: p.conta, tipo: "select" as const },
    { sel: 'input[data-mascara="valor"]', valor: p.total, indice: 0 },
    { sel: 'input[name="data"]', valor: hoje(), tipo: "data" as const },
    { sel: 'input[name="numeroReceita"]', valor: p.numero },
    ...p.parcelas.flatMap((valor, i) =>
      valor === "" ? [] : [{ sel: 'input[data-mascara="valor"]', valor, indice: i + 1 }]
    ),
    ...(p.outraFonte === undefined
      ? []
      : [{ sel: 'select[name="outraFonte"]', valor: p.outraFonte, tipo: "select" as const }]),
    ...(p.outroValor === undefined
      ? []
      : [
          {
            sel: 'input[data-mascara="valor"]',
            valor: p.outroValor,
            indice: p.parcelas.length + 1,
          },
        ]),
    ...(p.fundamento === undefined
      ? []
      : [{ sel: 'input[name="outroFundamento"]', valor: p.fundamento }]),
  ];
  const r = await preencherEEnviar(page, "registrar-guia-distribuida", campos, "registrar-guia-distribuida");
  return { tipo: r.tipo, texto: r.texto };
}

/** A linha de uma guia na lista, com as fontes que a tela mostra. */
async function linhaDaGuia(page: Page, numero: string): Promise<string | null> {
  return page.evaluate((num) => {
    const tr = Array.from(document.querySelectorAll("table tbody tr")).find((x) =>
      (x.textContent ?? "").includes(num)
    );
    return tr === null || tr === undefined ? null : (tr.textContent ?? "").replace(/\s+/g, " ").trim();
  }, numero);
}

async function main(): Promise<void> {
  if (SENHA_ADMIN === "") throw new Error("SEED_ADMIN_SENHA ausente.");
  const navegador = await lancarNavegadorDoPercurso();
  try {
    const page = await navegador.newPage();
    page.setDefaultTimeout(120000);
    await entrar(n, page, ADMIN, SENHA_ADMIN);
    ok("0.1 login do administrador");

    // ══ 1. AS ATUALIZAÇÕES DE PERMISSÃO DESTA UNIDADE, PELA TELA ══
    // As ações novas (distribuir fora da previsão; gerir o rol) não existiam quando este banco foi
    // semeado. É o censo versionado que as distribui, e ele tem tela.
    // ⚠️ APLICA **TODAS** AS PENDENTES, EM LAÇO, E FOI A PRIMEIRA CORRIDA QUE ENSINOU. O painel
    // mostra um formulário por atualização pendente e o ajudante clica no PRIMEIRO; supor que a
    // primeira pendente é a minha fez o percurso aplicar a v31 (que este banco, clonado antes da
    // unidade anterior, ainda devia) achando que aplicava a v32. O sintoma veio três passos
    // depois, como ACESSO NEGADO — longe da causa. Agora o laço esgota a fila e a asserção é sobre
    // o ESTADO FINAL das duas versões desta unidade.
    await irPara(n, page, "/administracao/perfis");
    for (let i = 0; i < 12; i += 1) {
      const pendente = await page.evaluate(
        () => document.querySelector('li[data-atualizacao] [data-situacao="pendente"]') !== null
      );
      if (!pendente) break;
      await preencherEEnviar(page, "aplicar-atualizacao", []);
      await irPara(n, page, "/administracao/perfis");
    }
    for (const versao of [32, 33]) {
      const aplicada = await page.evaluate(
        (v) => document.querySelector(`li[data-atualizacao="${v}"] [data-situacao="aplicada"]`) !== null,
        versao
      );
      conferir(
        `1.${String(versao - 31)} a atualização ${String(versao)} de permissões está aplicada, pela tela e lida da PERSISTÊNCIA`,
        aplicada,
        `a atualização ${String(versao)} continua pendente depois de esgotar a fila do painel`
      );
    }

    // ══ 2. O ESTADO INICIAL DA CONTA: O ROL NÃO DECLARADO, DITO NA TELA ══
    await irPara(n, page, "/financeiro/contas-bancarias");
    const contaAlvo = await page.evaluate(() => {
      const li = Array.from(document.querySelectorAll("li[data-conta]")).find((x) =>
        (x.textContent ?? "").includes("fonte 500")
      );
      return li === undefined ? null : li.getAttribute("data-conta");
    });
    if (contaAlvo === null) throw new Error("nenhuma conta bancária da fonte 500 nesta instalação");
    nota(`conta do percurso: ${contaAlvo}`);
    const rolInicial = await page.evaluate((c) => {
      const p = document.querySelector(`[data-papel="rol-${c}"]`);
      return p === null ? null : (p.textContent ?? "").replace(/\s+/g, " ").trim();
    }, contaAlvo);
    // ⚠️ O PERCURSO NÃO LIMPA O BANCO, ENTÃO ELE LÊ O ESTADO ANTES DE AFIRMAR. Numa base em que o
    // rol JÁ foi declarado (uma execução anterior), a recusa por fonte fora do rol não é
    // observável — e dizer "não executado" com o motivo é honesto; transformá-la em falha culparia
    // o produto pelo estado da fixture.
    const rolJaTemAsDuas =
      rolInicial !== null && /540/.test(rolInicial) && /700/.test(rolInicial);
    if (rolJaTemAsDuas) {
      naoExecutado(
        "2.1 a tela DIZER que o rol não foi declarado",
        `o rol desta conta já está declarado nesta base (${rolInicial})`
      );
    } else {
      conferir(
        "2.1 a tela DIZ que o rol de fontes da conta não foi declarado, em vez de calar",
        rolInicial !== null && /rol não declarado/i.test(rolInicial),
        `a linha do rol diz: ${String(rolInicial)?.slice(0, 160)}`
      );
    }

    // ══ 3. A NATUREZA DAS FONTES — ATO DO ENTE, SEM O QUAL A ARRECADAÇÃO RECUSA ══
    await irPara(n, page, "/contabilidade/natureza-das-fontes");
    for (const [fonte, natureza, conta] of [
      ["500", "ORDINARIOS", "7.2.1.1.1.00.00"],
      ["540", "VINCULADOS", "7.2.1.1.2.00.00"],
      ["700", "OUTROS", "7.2.1.1.9.00.00"],
    ] as const) {
      const estado = await page.evaluate((f) => {
        const tr = document.querySelector(`tr[data-fonte="${f}"]`);
        if (tr === null) return null;
        const decl = (tr.querySelector('[data-papel="natureza-declarada"]')?.textContent ?? "").trim();
        return { declarada: !/Não declarada/i.test(decl), texto: decl };
      }, fonte);
      if (estado === null) {
        falhou(`3.${fonte} a fonte ${fonte} aparece na tela de natureza das fontes`, "sem linha na tabela");
        continue;
      }
      if (estado.declarada) {
        nota(`a fonte ${fonte} já estava declarada (${estado.texto})`);
        continue;
      }
      const r = await preencherEEnviar(
        page,
        `form[data-acao="declarar-natureza-da-fonte"][data-fonte="${fonte}"]`,
        [
          { sel: 'select[name="natureza"]', valor: natureza, tipo: "select" as const },
          {
            sel: 'input[name="fundamento"]',
            valor: `Classificacao declarada pelo ente para o percurso da guia repartida entre fontes (fonte ${fonte}).`,
          },
        ],
        "declarar-natureza-da-fonte"
      );
      conferir(
        `3.${fonte} a natureza da fonte ${fonte} é declarada e a confirmação diz a conta de controle`,
        r.tipo === "ok" && r.texto.includes(conta),
        `${r.tipo}: ${r.texto.slice(0, 200)}`
      );
      await irPara(n, page, "/contabilidade/natureza-das-fontes");
    }

    // ══ 4. A GUIA REPARTIDA, RECUSADA PELO ROL DA CONTA ══
    await irPara(n, page, `/receita/arrecadacoes/distribuir?exercicio=${String(ANO)}`);
    const primeiroPasso = await page.evaluate(() =>
      document.body.innerText.replace(/\s+/g, " ")
    );
    conferir(
      "4.1 o primeiro passo lista a natureza com as fontes que a LOA prevê para ela",
      /Prevista nas fontes 500, 540/.test(primeiroPasso),
      primeiroPasso.slice(0, 220)
    );
    const linkDaNatureza = await page.evaluate(() => {
      const a = Array.from(document.querySelectorAll("a")).find((x) =>
        (x.textContent ?? "").includes("Repartir uma guia")
      );
      return a === undefined ? null : a.getAttribute("href");
    });
    if (linkDaNatureza === null) throw new Error("o primeiro passo não ofereceu nenhuma natureza");
    await irPara(n, page, linkDaNatureza);
    const segundoPasso = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
    conferir(
      "4.2 o segundo passo mostra as duas fontes previstas COM o valor previsto de cada uma",
      /Fonte 500/.test(segundoPasso) && /Fonte 540/.test(segundoPasso) && /previsto na LOA/.test(segundoPasso),
      segundoPasso.slice(0, 260)
    );

    const numero = `RF-${SUF}`;
    if (rolJaTemAsDuas) {
      naoExecutado(
        "4.3 a recusa por fonte fora do rol da conta",
        "o rol desta conta já comporta as duas fontes; a recusa só se observa antes do cadastro do rol"
      );
    } else {
      const semRol = await enviarGuia(page, {
        conta: contaAlvo,
        total: "100.000,00",
        numero,
        parcelas: ["60.000,00", "40.000,00"],
      });
      conferir(
        "4.3 a guia repartida é RECUSADA porque a conta não comporta a segunda fonte — e a recusa DIZ quais ela comporta",
        semRol.tipo === "erro" &&
          /FONTE FORA DO ROL/i.test(semRol.texto) &&
          /permitidas nesta conta são: 500/.test(semRol.texto),
        `${semRol.tipo}: ${semRol.texto.slice(0, 260)}`
      );
    }

    // ══ 5. O ROL DA CONTA, PELA TELA — E AS RECUSAS QUE ELE TEM ══
    await irPara(n, page, "/financeiro/contas-bancarias");
    const acaoDeAcrescentar = `rol-acrescentar-${contaAlvo}`;
    const acaoDeRemover = `rol-remover-${contaAlvo}`;
    if (rolJaTemAsDuas) {
      naoExecutado(
        "5.1/5.2 acrescentar as duas fontes ao rol pela tela",
        "as duas já estão no rol desta base; o ato só se observa em conta que ainda não as comporta"
      );
    } else {
      const r540 = await preencherEEnviar(
        page,
        acaoDeAcrescentar,
        [{ sel: 'select[name="fonte"]', valor: "540", tipo: "select" }],
        acaoDeAcrescentar
      );
      conferir(
        "5.1 a fonte 540 entra no rol da conta, e a confirmação diz o rol inteiro — a PADRÃO entra junto",
        r540.tipo === "ok" && /fontes 500, 540/.test(r540.texto),
        `${r540.tipo}: ${r540.texto.slice(0, 200)}`
      );
      await irPara(n, page, "/financeiro/contas-bancarias");
      const r700 = await preencherEEnviar(
        page,
        acaoDeAcrescentar,
        [{ sel: 'select[name="fonte"]', valor: "700", tipo: "select" }],
        acaoDeAcrescentar
      );
      conferir(
        "5.2 a fonte 700 também entra no rol",
        r700.tipo === "ok" && /fontes 500, 540, 700/.test(r700.texto),
        `${r700.tipo}: ${r700.texto.slice(0, 200)}`
      );
    }
    // ⚠️ A REMOÇÃO BEM-SUCEDIDA EXISTE PARA EXERCITAR O **GRANT DE DELETE** DO PAPEL DE RUNTIME.
    // A aplicação conecta como `gestao_app`, que só apaga nas tabelas do censo assinado
    // (`ESCRITA_MUTAVEL_DO_RUNTIME`). Sem a entrada nova, isto falharia com "permission denied" no
    // município e passaria na suíte, que roda como DONO — é a armadilha que o próprio censo
    // documenta. Só um percurso servido pelo papel de runtime a pega.
    await irPara(n, page, "/financeiro/contas-bancarias");
    const temRemover = await page.evaluate(
      (a) => document.querySelector(`form[data-acao="${a}"] select[name="fonteRemover"]`) !== null,
      acaoDeRemover
    );
    if (!temRemover) {
      naoExecutado(
        "5.3/5.4 a remoção do rol pelo papel de runtime (o grant de DELETE)",
        "o rol da conta tem uma fonte só, e a tela não oferece remoção nesse estado — o passo anterior não acrescentou"
      );
    }
    const rRemover = !temRemover ? { tipo: "pulado", texto: "" } : await preencherEEnviar(
      page,
      acaoDeRemover,
      [{ sel: 'select[name="fonteRemover"]', valor: "700", tipo: "select" }],
      acaoDeRemover
    );
    if (temRemover) conferir(
      "5.3 remover uma fonte NÃO padrão do rol funciona pelo papel de runtime (o grant de DELETE)",
      rRemover.tipo === "ok" && /fontes 500, 540\.?$/.test(rRemover.texto.trim()),
      `${rRemover.tipo}: ${rRemover.texto.slice(0, 200)}`
    );
    await irPara(n, page, "/financeiro/contas-bancarias");
    const rDeVolta = !temRemover ? { tipo: "pulado", texto: "" } : await preencherEEnviar(
      page,
      acaoDeAcrescentar,
      [{ sel: 'select[name="fonte"]', valor: "700", tipo: "select" }],
      acaoDeAcrescentar
    );
    if (temRemover) conferir(
      "5.4 e a fonte volta ao rol — o cadastro é decisão vigente, não fato irreversível",
      rDeVolta.tipo === "ok" && /fontes 500, 540, 700/.test(rDeVolta.texto),
      `${rDeVolta.tipo}: ${rDeVolta.texto.slice(0, 200)}`
    );

    await irPara(n, page, "/financeiro/contas-bancarias");
    const rPadrao = await preencherEEnviar(
      page,
      acaoDeRemover,
      [{ sel: 'select[name="fonteRemover"]', valor: "500", tipo: "select" }],
      acaoDeRemover
    );
    conferir(
      "5.5 remover a fonte PADRÃO do rol é RECUSADO, e a recusa diz por quê",
      rPadrao.tipo === "erro" && /fonte PADRÃO/.test(rPadrao.texto),
      `${rPadrao.tipo}: ${rPadrao.texto.slice(0, 220)}`
    );

    // ══ 6. A MESMA GUIA, AGORA ACEITA — É A ORDEM QUE PROVA O CADASTRO ══
    await irPara(n, page, linkDaNatureza);
    const aceita = await enviarGuia(page, {
      conta: contaAlvo,
      total: "100.000,00",
      numero,
      parcelas: ["60.000,00", "40.000,00"],
    });
    conferir(
      "6.1 COM o rol declarado, a MESMA guia é aceita e a confirmação diz entre quantas fontes ela foi repartida",
      aceita.tipo === "ok" && /repartida entre 2 fonte/.test(aceita.texto),
      `${aceita.tipo}: ${aceita.texto.slice(0, 220)}`
    );

    await irPara(n, page, `/receita/arrecadacoes?exercicio=${String(ANO)}`);
    const linha = await linhaDaGuia(page, numero);
    conferir(
      "6.2 a lista mostra a REPARTIÇÃO na coluna da fonte — 500 e 540 com os valores, não a fonte padrão sozinha",
      linha !== null && /500/.test(linha) && /540/.test(linha) && /60\.000,00/.test(linha) && /40\.000,00/.test(linha),
      `a linha diz: ${String(linha)?.slice(0, 240)}`
    );

    // ══ 7. AS PARCELAS QUE NÃO SOMAM O TOTAL ══
    await irPara(n, page, linkDaNatureza);
    const naoSoma = await enviarGuia(page, {
      conta: contaAlvo,
      total: "100.000,00",
      numero: `RF-NS-${SUF}`,
      parcelas: ["60.000,00", "39.000,00"],
    });
    conferir(
      "7.1 parcelas que não somam o total são RECUSADAS, e a recusa diz os DOIS números e a diferença",
      naoSoma.tipo === "erro" &&
        /99000\.00/.test(naoSoma.texto) &&
        /100000\.00/.test(naoSoma.texto) &&
        /falta 1000\.00/.test(naoSoma.texto),
      `${naoSoma.tipo}: ${naoSoma.texto.slice(0, 260)}`
    );

    // ══ 8. A FONTE QUE A LOA NÃO PREVÊ — SEM MOTIVO, COM MOTIVO ══
    await irPara(n, page, linkDaNatureza);
    const semMotivo = await enviarGuia(page, {
      conta: contaAlvo,
      total: "50.000,00",
      numero: `RF-NP-${SUF}`,
      parcelas: ["30.000,00", ""],
      outraFonte: "700",
      outroValor: "20.000,00",
    });
    conferir(
      "8.1 fonte que a LOA não prevê SEM motivo escrito é RECUSADA, e a recusa nomeia a fonte",
      semMotivo.tipo === "erro" && /700/.test(semMotivo.texto) && /motivo/i.test(semMotivo.texto),
      `${semMotivo.tipo}: ${semMotivo.texto.slice(0, 260)}`
    );

    await irPara(n, page, linkDaNatureza);
    const comMotivo = await enviarGuia(page, {
      conta: contaAlvo,
      total: "50.000,00",
      numero: `RF-NP-${SUF}`,
      parcelas: ["30.000,00", ""],
      outraFonte: "700",
      outroValor: "20.000,00",
      fundamento: "Convenio federal assinado apos a LOA, ainda sem credito aberto neste exercicio.",
    });
    conferir(
      "8.2 COM o motivo escrito e a autorização, a MESMA guia entra — é a ordem que prova a exigência",
      comMotivo.tipo === "ok" && /repartida entre 2 fonte/.test(comMotivo.texto),
      `${comMotivo.tipo}: ${comMotivo.texto.slice(0, 220)}`
    );

    // ══ 9. A ANULAÇÃO PRESERVA A DISTRIBUIÇÃO ORIGINAL ══
    await irPara(n, page, `/receita/arrecadacoes?exercicio=${String(ANO)}`);
    // ⚠️ O FORMULÁRIO DE ANULAÇÃO NÃO TEM `data-acao` (ele é um por linha da tabela), então o alvo
    // é o `receitaId` DELE — a mesma técnica do percurso da entidade titular. E o nome do marcador
    // vai junto: o `<details>` se fecha no sucesso e a confirmação fica FORA do formulário; sem o
    // parâmetro o ajudante procuraria o resultado dentro do que sumiu e leria silêncio.
    const idDaGuia = await page.evaluate((num) => {
      for (const c of Array.from(document.querySelectorAll('input[name="receitaId"]'))) {
        const linha = c.closest("tr");
        if (linha !== null && (linha.textContent ?? "").includes(num)) return (c as HTMLInputElement).value;
      }
      return "";
    }, numero);
    if (idDaGuia === "") {
      naoExecutado(
        "9.1 a anulação pela tela preservando a distribuição",
        "a linha da guia não trouxe o formulário de anulação (a guia pode já estar anulada neste banco)"
      );
    } else {
      const rAnular = await preencherEEnviar(
        page,
        `form[class]:has(input[name="receitaId"][value="${idDaGuia}"])`,
        [
          { sel: 'input[name="numero"]', valor: `RA-${SUF}` },
          { sel: 'input[name="data"]', valor: hoje(), tipo: "data" as const },
        ],
        "anular-receita"
      );
      conferir(
        "9.1 a guia repartida é anulada pela tela",
        rAnular.tipo === "ok",
        `${rAnular.tipo}: ${rAnular.texto.slice(0, 220)}`
      );
      await irPara(n, page, `/receita/arrecadacoes?exercicio=${String(ANO)}`);
      const linhaDaAnulacao = await linhaDaGuia(page, `RA-${SUF}`);
      conferir(
        "9.2 a ANULAÇÃO carrega a MESMA repartição da original — o snapshot, lido da persistência",
        linhaDaAnulacao !== null &&
          /60\.000,00/.test(linhaDaAnulacao) &&
          /40\.000,00/.test(linhaDaAnulacao),
        `a linha da anulação diz: ${String(linhaDaAnulacao)?.slice(0, 240)}`
      );
    }
  } finally {
    await navegador.close();
  }

  console.log(
    `\n${String(passos.length)} passo(s) ok, ${String(falhas.length)} falha(s), ${String(naoExecutados.length)} nao executado(s)`
  );
  for (const f of falhas) console.error(`  FALHA: ${f}`);
  for (const p of naoExecutados) console.error(`  NAO EXECUTADO: ${p}`);
  if (falhas.length > 0) process.exitCode = 1;
}

void main();
