import "dotenv/config";
import {
  entrar,
  irPara,
  lancarNavegadorDoPercurso,
  preencherEEnviar,
  sair,
  type Navegador,
} from "./percursos-navegador.js";
import type { Page } from "puppeteer";

/**
 * J9 — A ENTIDADE TITULAR NA ARRECADAÇÃO, PELA TELA (V11 V9.2, M04/M01/M16).
 *
 * ═══ O QUE ESTE PERCURSO PROVA, E O QUE ELE DELIBERADAMENTE NÃO REPETE ═══
 *
 * A aritmética do rodapé, a herança do estorno, a estabilidade do carimbo e a régua do ato JÁ
 * estão provadas por teste em banco: `modules/m04-receita/m04-entidade-titular.test.ts` (t1 a
 * t5), `modules/m01-core-contabil/m01-ato-declarado.test.ts` e
 * `modules/m16-travamento/m16-entidade-contabil-permissoes.test.ts`. Repetir a SOMA aqui seria
 * segunda aritmética sobre o mesmo dinheiro.
 *
 * O que só a tela alcança, e é o que este arquivo mede (ESTADO-EXECUCAO.md §84.12):
 *
 *   1. **A recusa do ato inaplicável lida como MENSAGEM DE TELA.** O domínio lança
 *      `AtoDeclaradoInvalidoError`; o que ninguém tinha conferido é que esse texto CHEGA ao
 *      usuário, num `role="alert"`, em vez de virar 500 ou sumir no servidor.
 *   2. **O recorte dos seletores.** `FormTitular` tem três formas conforme o estado — sem
 *      entidade cadastrada mostra a nota e NENHUM campo; com entidade mostra "Declarar"; com
 *      titular vigente mostra "Alterar". Um `select` de entidades vazio é um formulário bonito
 *      e inútil, e só a tela diz qual das três apareceu.
 *   3. **A conciliação conferida no rodapé.** Não a soma — a APRESENTAÇÃO dela: que a linha do
 *      NÃO ATRIBUÍDO existe na mesma tabela, que ela não é escondida quando é zero nem quando é
 *      grande, e que o total do `tfoot` é o que a pessoa consegue fechar com os olhos.
 *
 * ⚠️ E O QUE ELE PROVA PELA PERSISTÊNCIA, NÃO PELA MENSAGEM: o carimbo é do FATO. Trocar o
 * titular da conta depois de arrecadar NÃO pode mover a guia velha para o titular novo — e a
 * única forma honesta de ver isso é arrecadar, trocar, recarregar e reler a tabela.
 *
 * ⚠️ NÃO LIGA A APURAÇÃO DE SUPERÁVIT. As cinco lacunas de
 * `SUPERAVIT-SEM-ENTIDADE-NAS-QUATRO-PERNAS` continuam pendentes de propósito: este percurso
 * lê a NOTA da tela que declara o recorte, e não constrói nada por cima dele.
 *
 * ⚠️ NÃO LIMPA O BANCO. Todo identificador leva o sufixo do instante; os passos que dependem de
 * estado anterior leem o estado e se adaptam, dizendo quando pulam e por quê.
 *
 * Uso:  npm run smoke:receita-por-entidade
 *       npx tsx scripts/smoke-receita-por-entidade.ts http://localhost:3010
 */
const BASE = process.argv[2] ?? "http://localhost:3010";
const ADMIN = process.argv[3] ?? "admin@cg.pb.gov.br";
const SENHA_ADMIN = process.argv[4] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const TESOUREIRO = "tesouraria@percursos.local";
const SENHA_PAPEIS = process.env["PERCURSOS_SENHA_PAPEIS"] ?? "Percurso#2026";
const SUF = String(Date.now()).slice(-6);
const ANO = new Date().getFullYear();
const n: Navegador = { base: BASE };

const falhas: string[] = [];
const passos: string[] = [];
/**
 * ⚠️ O QUE NÃO RODOU TEM CONTADOR PRÓPRIO. "Passo pulado é passo que não aconteceu": somá-lo
 * aos ok mentiria, e somá-lo às falhas culparia o produto por uma pendência que ele declara.
 */
const naoExecutados: string[] = [];
function naoExecutado(passo: string, motivo: string): void {
  naoExecutados.push(`${passo} — ${motivo}`);
  console.error(`[NAO EXECUTADO] ${passo} — ${motivo}`);
}
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
function nota(texto: string): void {
  console.log(`      [${texto}]`);
}
function hoje(mais = 0): string {
  return new Date(Date.now() + mais * 86_400_000).toISOString().slice(0, 10);
}

/**
 * ⚠️ LÊ O DINHEIRO DA TELA COM UM PARSER INDEPENDENTE DO QUE A ESCREVEU. `formatarMoeda` é do
 * produto; se este percurso a importasse, ele confirmaria a própria formatação e passaria com
 * qualquer convenção errada consistente. Aqui o texto renderizado é desmontado à mão, em
 * pt-BR, e o resultado vira centavos INTEIROS — nunca float, que é a regra do repositório
 * inclusive quando o número só serve para conferir.
 */
function centavosDaTela(bruto: string): number | null {
  const m = /-?\s*\d{1,3}(?:\.\d{3})*,\d{2}|-?\s*\d+,\d{2}/.exec(bruto.replace(/ /g, " "));
  if (m === null) return null;
  const limpo = m[0].replace(/\s/g, "");
  const negativo = limpo.startsWith("-");
  const digitos = limpo.replace(/[^\d]/g, "");
  if (digitos === "") return null;
  return (negativo ? -1 : 1) * Number.parseInt(digitos, 10);
}

interface Rodape {
  readonly linhas: readonly { readonly codigo: string; readonly guias: number; readonly centavos: number }[];
  readonly naoAtribuido: { readonly guias: number; readonly centavos: number } | null;
  readonly totalCentavos: number | null;
  readonly temTabela: boolean;
}

/** Lê a tabela inteira de `/receita/por-entidade` como números, do DOM renderizado. */
async function lerRodape(page: Page): Promise<Rodape> {
  const cru = await page.evaluate(() => {
    const t = document.querySelector('[data-papel="arrecadado-por-entidade"]');
    if (t === null) return null;
    const linhas = Array.from(t.querySelectorAll("tbody tr[data-linha-entidade]")).map((tr) => ({
      codigo: tr.getAttribute("data-linha-entidade") ?? "",
      celulas: Array.from(tr.querySelectorAll("td")).map((td) => (td.textContent ?? "").trim()),
    }));
    const total = t.querySelector('[data-papel="total-do-exercicio"]');
    return { linhas, total: total === null ? null : (total.textContent ?? "").trim() };
  });
  if (cru === null) return { linhas: [], naoAtribuido: null, totalCentavos: null, temTabela: false };
  const mapa = cru.linhas.map((l) => ({
    codigo: l.codigo,
    guias: Number.parseInt((l.celulas[1] ?? "0").replace(/[^\d]/g, ""), 10) || 0,
    centavos: centavosDaTela(l.celulas[2] ?? "") ?? 0,
  }));
  const na = mapa.find((l) => l.codigo === "nao-atribuido") ?? null;
  return {
    linhas: mapa.filter((l) => l.codigo !== "nao-atribuido"),
    naoAtribuido: na === null ? null : { guias: na.guias, centavos: na.centavos },
    totalCentavos: cru.total === null ? null : centavosDaTela(cru.total),
    temTabela: true,
  };
}

function linhaDe(r: Rodape, codigo: string): { readonly guias: number; readonly centavos: number } {
  return r.linhas.find((l) => l.codigo === codigo) ?? { guias: 0, centavos: 0 };
}

/** O ato que MENCIONA o alvo — o caminho legítimo. As palavras próprias passam das três exigidas. */
function citacaoQueMenciona(alvo: string): string {
  return (
    `Fica instituida, na estrutura da administracao indireta do Municipio, a unidade ${alvo}, ` +
    `dotada de autonomia administrativa e financeira e de escrituracao contabil propria, ` +
    `competindo-lhe gerir os recursos que lhe forem consignados.`
  );
}
/** O ato que NÃO menciona o alvo — forma impecável, assunto errado. É esta recusa que a tela tem de dizer. */
const CITACAO_INAPLICAVEL =
  "Ficam reajustados em cinco por cento os vencimentos dos servidores publicos municipais " +
  "ocupantes de cargo efetivo, a partir do primeiro dia do mes subsequente ao da publicacao.";

async function main(): Promise<void> {
  if (SENHA_ADMIN === "") throw new Error("SEED_ADMIN_SENHA ausente.");
  const navegador = await lancarNavegadorDoPercurso();
  try {
    const page = await navegador.newPage();
    page.setDefaultTimeout(120000);
    await entrar(n, page, ADMIN, SENHA_ADMIN);
    ok("0.1 login do administrador");

    // ══ 1. A CONSULTA E O RODAPÉ, ANTES DE QUALQUER FATO NOVO ══
    await irPara(n, page, `/receita/por-entidade?exercicio=${ANO}`);
    const inicial = await lerRodape(page);
    conferir("1.1 /receita/por-entidade responde 200 e traz a tabela por entidade", inicial.temTabela, "sem [data-papel=arrecadado-por-entidade]");
    conferir(
      "1.2 a linha do NÃO ATRIBUÍDO existe na MESMA tabela — o histórico sem identificação é mostrado, não escondido",
      inicial.naoAtribuido !== null,
      "sem [data-linha-entidade=nao-atribuido]"
    );
    const corpoInicial = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
    conferir(
      "1.3 a linha do não atribuído DIZ o que ela é, em vez de um rótulo vazio",
      /Não atribuído — o ente ainda não disse de quem é/.test(corpoInicial),
      corpoInicial.slice(0, 200)
    );
    conferir(
      "1.4 o rodapé traz o total do exercício",
      inicial.totalCentavos !== null,
      "sem [data-papel=total-do-exercicio]"
    );
    const somaInicial = inicial.linhas.reduce((a, l) => a + l.centavos, 0) + (inicial.naoAtribuido?.centavos ?? 0);
    conferir(
      "1.5 o que a tela mostra FECHA: Σ entidades + não atribuído == total do rodapé",
      inicial.totalCentavos !== null && somaInicial === inicial.totalCentavos,
      `Σ=${somaInicial} total=${String(inicial.totalCentavos)}`
    );
    nota(
      `estado inicial: ${inicial.linhas.length} entidade(s) com linha, não atribuído ` +
        `${String(inicial.naoAtribuido?.guias ?? 0)} guia(s) / ${String(inicial.naoAtribuido?.centavos ?? 0)} centavos, ` +
        `total ${String(inicial.totalCentavos)}`
    );
    conferir(
      "1.6 a tela DECLARA o recorte (o superávit continua do ente) em vez de deixar supor que tudo está partido",
      /superávit financeiro/i.test(corpoInicial) && /continua sendo do ente/i.test(corpoInicial),
      corpoInicial.slice(0, 300)
    );

    // ══ 2. O RECORTE DO SELETOR, NO ESTADO "SEM ENTIDADE" ══
    // ⚠️ Só é observável ANTES de cadastrar a primeira entidade. Em banco já povoado por uma
    // execução anterior o estado não existe mais, e o percurso DIZ que pulou em vez de fingir.
    await irPara(n, page, "/financeiro/contas-bancarias");
    /**
     * ⚠️ O ESTADO SE LÊ DA TELA, NÃO SE DEDUZ DO RODAPÉ. A primeira versão inferia "não há
     * entidade cadastrada" de "nenhuma entidade tem linha na tabela por entidade" — e as duas
     * coisas são diferentes: entidade recém-cadastrada que ainda não arrecadou NÃO tem linha.
     * A dedução reprovou um comportamento correto na segunda execução. Agora o percurso olha o
     * que a tela mostra e diz qual dos dois estados encontrou.
     */
    const notaSemEntidade = await page.evaluate(() =>
      /Nenhuma entidade contábil cadastrada ainda/.test(document.body.innerText)
    );
    const temBotaoDeTitular = (await page.$("button[data-papel^='declarar-titular-']")) !== null;
    conferir(
      "2.1 a conta bancária mostra EXATAMENTE um dos dois estados — a nota de 'cadastre antes' ou o botão de declarar —, nunca um select vazio nem os dois",
      notaSemEntidade !== temBotaoDeTitular,
      `nota='${String(notaSemEntidade)}' botão='${String(temBotaoDeTitular)}'`
    );
    nota(notaSemEntidade ? "estado: SEM entidade cadastrada — a tela diz onde cadastrar" : "estado: JÁ há entidade cadastrada (execução anterior ou seed)");

    // ══ 3. A RECUSA DO ATO INAPLICÁVEL, LIDA NA TELA ══
    await irPara(n, page, "/contabilidade/entidades");
    conferir(
      "3.1 /contabilidade/entidades responde 200 e traz o formulário de cadastro",
      (await page.$('form[data-papel="form-cadastrar-entidade"]')) !== null,
      "sem form-cadastrar-entidade"
    );
    const nomeA = `Fundo Municipal de Demonstracao A ${SUF}`;
    const codA = `A${SUF.slice(-3)}`.slice(0, 4);
    const camposEntidade = (codigo: string, nome: string, citacao: string) => [
      { sel: 'input[name="codigo"]', valor: codigo },
      { sel: 'input[name="nome"]', valor: nome },
      { sel: 'select[name="tipoManad"]', valor: "", tipo: "select" as const },
      { sel: 'select[name="atoTipo"]', valor: "LEI", tipo: "select" as const },
      { sel: 'input[name="atoNumero"]', valor: `1${SUF.slice(-3)}` },
      { sel: 'input[name="atoAno"]', valor: String(ANO - 2) },
      { sel: 'input[name="atoDispositivo"]', valor: "art. 2º" },
      { sel: 'textarea[name="atoCitacao"]', valor: citacao },
    ];
    // O `select` de tipo da entidade: a primeira opção útil, seja qual for o censo do MANAD.
    const tipoUtil = await page.evaluate(() => {
      const s = document.querySelector('form[data-papel="form-cadastrar-entidade"] select[name="tipoManad"]');
      if (!(s instanceof HTMLSelectElement)) return "";
      return Array.from(s.options).find((o) => o.value !== "" && !o.disabled)?.value ?? "";
    });
    if (tipoUtil === "") throw new Error("o select de tipo da entidade não tem opção útil");
    const comTipo = (cs: ReturnType<typeof camposEntidade>) =>
      cs.map((c) => (c.sel.includes("tipoManad") ? { ...c, valor: tipoUtil } : c));

    const rInaplicavel = await preencherEEnviar(
      page,
      'form[data-papel="form-cadastrar-entidade"]',
      comTipo(camposEntidade(codA, nomeA, CITACAO_INAPLICAVEL)),
      "cadastrar-entidade"
    );
    conferir(
      "3.2 o ato de forma impecável mas assunto ERRADO é RECUSADO, e a recusa chega como mensagem de tela",
      rInaplicavel.tipo === "erro",
      `${rInaplicavel.tipo}: ${rInaplicavel.texto.slice(0, 200)}`
    );
    conferir(
      "3.3 a recusa DIZ o motivo e o que fazer — não só 'inválido'",
      /não menciona/i.test(rInaplicavel.texto) && /Nada foi gravado/i.test(rInaplicavel.texto),
      rInaplicavel.texto.slice(0, 300)
    );
    // ⚠️ AFIRMAR O EFEITO, NÃO A MENSAGEM: "nada foi gravado" é uma frase até alguém recarregar.
    const listaAposRecusa = await irPara(n, page, "/contabilidade/entidades");
    conferir(
      "3.4 e NADA foi gravado de fato: a entidade recusada não aparece após recarga",
      !listaAposRecusa.includes(nomeA.toLowerCase()),
      "a entidade recusada apareceu na lista"
    );

    // ══ 4. O CAMINHO LEGÍTIMO, COM N=2 ══
    const nomeB = `Fundo Municipal de Demonstracao B ${SUF}`;
    const codB = `B${SUF.slice(-3)}`.slice(0, 4);
    const rA = await preencherEEnviar(
      page,
      'form[data-papel="form-cadastrar-entidade"]',
      comTipo(camposEntidade(codA, nomeA, citacaoQueMenciona(nomeA))),
      "cadastrar-entidade"
    );
    conferir("4.1 o ato que MENCIONA a entidade é aceito e a entidade A é criada", rA.tipo === "ok", `${rA.tipo}: ${rA.texto.slice(0, 200)}`);
    await irPara(n, page, "/contabilidade/entidades");
    const rB = await preencherEEnviar(
      page,
      'form[data-papel="form-cadastrar-entidade"]',
      comTipo(camposEntidade(codB, nomeB, citacaoQueMenciona(nomeB))),
      "cadastrar-entidade"
    );
    // ⚠️ N=2 NÃO É CAPRICHO AQUI: com UMA entidade só, "Σ entidades + não atribuído == total"
    // passa por vacuidade — a única linha é o total. A segunda entidade é o que faz a soma ter
    // o que somar, e é o que permite provar que o carimbo NÃO migrou de A para B.
    conferir("4.2 a segunda entidade (N=2) é criada — a soma do rodapé passa a ter o que somar", rB.tipo === "ok", `${rB.tipo}: ${rB.texto.slice(0, 200)}`);
    await irPara(n, page, "/contabilidade/entidades");
    const rDup = await preencherEEnviar(
      page,
      'form[data-papel="form-cadastrar-entidade"]',
      comTipo(camposEntidade(codA, nomeA, citacaoQueMenciona(nomeA))),
      "cadastrar-entidade"
    );
    conferir(
      "4.3 repetir o MESMO código de entidade é recusado nomeando — repetição não vira duplicidade",
      rDup.tipo === "erro" && /já|existe|duplic/i.test(rDup.texto),
      `${rDup.tipo}: ${rDup.texto.slice(0, 200)}`
    );

    // ══ 5. O RECORTE DO SELETOR MUDA COM O ESTADO ══
    await irPara(n, page, "/financeiro/contas-bancarias");
    const contaAlvo = await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll("button[data-papel^='declarar-titular-']"));
      const alvo = b.find((x) => (x.getAttribute("data-papel") ?? "").includes("CC-500-01")) ?? b[0];
      return alvo === undefined
        ? null
        : { papel: alvo.getAttribute("data-papel") ?? "", rotulo: (alvo.textContent ?? "").trim() };
    });
    conferir(
      "5.1 com entidade cadastrada o seletor MUDA: a conta passa a oferecer o botão de declarar o titular",
      contaAlvo !== null,
      "nenhum botão data-papel=declarar-titular-*"
    );
    if (contaAlvo === null) throw new Error("sem conta para declarar titular");
    const contaCodigo = contaAlvo.papel.replace(/^declarar-titular-/, "");
    nota(`conta escolhida: ${contaCodigo} — botão diz "${contaAlvo.rotulo}"`);
    const jaTinhaTitular = /Alterar/i.test(contaAlvo.rotulo);

    const papelDoBotao = contaAlvo.papel;
    async function declararTitular(codigoEntidade: string, citacao: string): Promise<{ readonly tipo: string; readonly texto: string }> {
      await irPara(n, page, "/financeiro/contas-bancarias");
      await page.click(`button[data-papel="${papelDoBotao}"]`);
      await page.waitForSelector('select[name="entidadeId"]', { timeout: 30000 });
      const valor = await page.evaluate((cod) => {
        const s = document.querySelector('select[name="entidadeId"]');
        if (!(s instanceof HTMLSelectElement)) return "";
        return Array.from(s.options).find((o) => (o.textContent ?? "").startsWith(`${cod} —`))?.value ?? "";
      }, codigoEntidade);
      if (valor === "") throw new Error(`a entidade ${codigoEntidade} não está no select do titular`);
      return preencherEEnviar(
        page,
        'form[class]:has(select[name="entidadeId"]):has(input[name="contaBancariaId"])',
        [
          { sel: 'select[name="entidadeId"]', valor, tipo: "select" as const },
          { sel: 'select[name="atoTipo"]', valor: "DECRETO", tipo: "select" as const },
          { sel: 'input[name="atoNumero"]', valor: `2${SUF.slice(-3)}` },
          { sel: 'input[name="atoAno"]', valor: String(ANO - 1) },
          { sel: 'input[name="atoDispositivo"]', valor: "art. 1º" },
          { sel: 'textarea[name="atoCitacao"]', valor: citacao },
        ],
        "declarar-titular"
      );
    }

    const rTitularInaplicavel = await declararTitular(codA, CITACAO_INAPLICAVEL);
    conferir(
      "5.2 declarar titular com ato que não trata do assunto é RECUSADO, e o motivo é legível na tela",
      rTitularInaplicavel.tipo === "erro" && /não menciona/i.test(rTitularInaplicavel.texto),
      `${rTitularInaplicavel.tipo}: ${rTitularInaplicavel.texto.slice(0, 250)}`
    );
    const rTitularA = await declararTitular(codA, citacaoQueMenciona(nomeA));
    conferir("5.3 o titular A é declarado com ato que o menciona", rTitularA.tipo === "ok", `${rTitularA.tipo}: ${rTitularA.texto.slice(0, 200)}`);
    await irPara(n, page, "/financeiro/contas-bancarias");
    const rotuloDepois = await page.evaluate(
      (p) => (document.querySelector(`button[data-papel="${p}"]`)?.textContent ?? "").trim(),
      papelDoBotao
    );
    conferir(
      "5.4 o seletor se recorta de novo: com titular vigente o botão passa a dizer ALTERAR",
      /Alterar/i.test(rotuloDepois),
      `botão diz "${rotuloDepois}" (antes: "${contaAlvo.rotulo}", já tinha titular: ${String(jaTinhaTitular)})`
    );

    await irPara(n, page, `/receita/arrecadacoes?exercicio=${ANO}`);
    const dadosDaConta = await page.evaluate((cod) => {
      const s = document.querySelector('form[data-acao="registrar-guia"] select[name="contaBancaria"]');
      if (!(s instanceof HTMLSelectElement)) return null;
      const o = Array.from(s.options).find((x) => x.value !== "" && !x.disabled && (x.textContent ?? "").includes(cod));
      const nat = (document.querySelector('form[data-acao="registrar-guia"] datalist option') as HTMLOptionElement | null)?.value ?? "11130211";
      const fonte = /fonte (\d{3})/.exec(o?.textContent ?? "")?.[1] ?? "500";
      return o === undefined ? null : { valor: o.value, natureza: nat, fonte };
    }, contaCodigo);
    if (dadosDaConta === null) throw new Error(`a conta ${contaCodigo} não está no formulário de guia`);

    // ══ 5.5 A NATUREZA DA FONTE — O ATO DO ENTE QUE DESTRAVA A ARRECADAÇÃO (V11 V9.3) ══
    //
    // ⚠️ ESTE PASSO EXISTE PORQUE A CORREÇÃO NÃO FOI ESCOLHER UMA CONTA. O PCASP parte
    // `7.2.1.1 CONTROLE DA DISPONIBILIDADE DE RECURSOS` em cinco analíticas, uma por NATUREZA do
    // recurso; o plano não diz de que natureza é a fonte 500 deste município, e o corpus oficial
    // também não. Quem diz é o ente, por tela, com fundamento — e enquanto ele não disser, a
    // arrecadação daquela fonte é RECUSADA. Aqui a jornada faz o ato inteiro: lê o estado, prova
    // a recusa quando ela cabe, declara, e só então arrecada.
    await irPara(n, page, "/contabilidade/natureza-das-fontes");
    const naturezaDaFonte = await page.evaluate((f) => {
      const tr = document.querySelector(`tr[data-fonte="${f}"]`);
      if (tr === null) return null;
      const decl = (tr.querySelector('[data-papel="natureza-declarada"]')?.textContent ?? "").trim();
      const conta = (tr.querySelector('[data-papel="conta-de-controle"]')?.textContent ?? "").trim();
      const temForm = tr.querySelector('form[data-acao="declarar-natureza-da-fonte"]') !== null;
      return { declarada: !/Não declarada/i.test(decl), texto: decl, conta, temForm };
    }, dadosDaConta.fonte);

    if (naturezaDaFonte === null) {
      falhou("5.5 a fonte da conta bancária aparece na tela de natureza das fontes", `a fonte ${dadosDaConta.fonte} não tem linha em /contabilidade/natureza-das-fontes`);
    } else {
      conferir("5.5 a tela oferece o ato: a fonte tem formulário para declarar a natureza", naturezaDaFonte.temForm, `sem formulário na linha da fonte ${dadosDaConta.fonte}`);

      if (!naturezaDaFonte.declarada) {
        // ⚠️ A NEGAÇÃO AFIRMA O MOTIVO. "Não completou" é compatível com o servidor aceitando a
        // guia e escriturando em conta errada; o que se exige aqui é que a recusa NOMEIE a fonte.
        await irPara(n, page, `/receita/arrecadacoes?exercicio=${ANO}`);
        const rSemNatureza = await preencherEEnviar(page, "registrar-guia", [
          { sel: 'input[name="natureza"]', valor: dadosDaConta.natureza },
          { sel: 'input[name="fonte"]', valor: dadosDaConta.fonte },
          { sel: 'select[name="contaBancaria"]', valor: dadosDaConta.valor, tipo: "select" },
          { sel: 'input[data-mascara="valor"]', valor: "1.000,00" },
          { sel: 'input[name="data"]', valor: hoje(), tipo: "data" },
          { sel: 'input[name="numeroReceita"]', valor: `J9N-${SUF}` },
        ]);
        conferir(
          "5.6 fonte sem natureza declarada faz a arrecadação RECUSAR, e a recusa nomeia a fonte",
          rSemNatureza.tipo === "erro" &&
            new RegExp(`FONTE ${dadosDaConta.fonte}`, "i").test(rSemNatureza.texto) &&
            /natureza/i.test(rSemNatureza.texto),
          `${rSemNatureza.tipo}: ${rSemNatureza.texto.slice(0, 250)}`
        );
        await irPara(n, page, "/contabilidade/natureza-das-fontes");
      } else {
        nota(`a fonte ${dadosDaConta.fonte} já estava declarada (${naturezaDaFonte.texto}, conta ${naturezaDaFonte.conta}) — execução anterior neste banco`);
        naoExecutado("5.6 a recusa por fonte sem natureza declarada (pela tela)", `a fonte ${dadosDaConta.fonte} já está classificada neste banco; a recusa só se observa em fonte ainda não declarada`);
      }

      if (!naturezaDaFonte.declarada) {
        const rDeclarar = await preencherEEnviar(
          page,
          `form[data-acao="declarar-natureza-da-fonte"][data-fonte="${dadosDaConta.fonte}"]`,
          [
            { sel: 'select[name="natureza"]', valor: "ORDINARIOS", tipo: "select" as const },
            { sel: 'input[name="fundamento"]', valor: "Recurso sem vinculação legal de destinação declarada pelo ente nesta instalação de percurso." },
          ],
          "declarar-natureza-da-fonte"
        );
        conferir(
          "5.7 a natureza é declarada pela tela, e a confirmação diz em QUE CONTA a arrecadação passa a escriturar",
          rDeclarar.tipo === "ok" && /7\.2\.1\.1\.1\.00\.00/.test(rDeclarar.texto),
          `${rDeclarar.tipo}: ${rDeclarar.texto.slice(0, 250)}`
        );
        await irPara(n, page, "/contabilidade/natureza-das-fontes");
        const depois = await page.evaluate((f) => {
          const tr = document.querySelector(`tr[data-fonte="${f}"]`);
          return tr === null ? null : (tr.querySelector('[data-papel="conta-de-controle"]')?.textContent ?? "").trim();
        }, dadosDaConta.fonte);
        conferir(
          "5.8 a declaração PERSISTE: recarregada, a linha da fonte mostra a conta de controle",
          depois === "7.2.1.1.1.00.00",
          `a linha mostra "${String(depois)}"`
        );
      }
    }

    // ══ 6. A ARRECADAÇÃO NOVA — E A PENDÊNCIA QUE A BLOQUEAVA, AGORA RESOLVIDA (V11 V9.3) ══
    //
    // ⚠️ O QUE MUDOU DESDE V9.2. `CONTROLE-DDR-POR-NATUREZA-DA-FONTE` deixava este bloco sem
    // rodar: o roteiro debitava `7.2.1.1.0.00.00`, SINTÉTICA no plano oficial, e a guia era
    // recusada. A perna passou a ser resolvida pela NATUREZA da fonte
    // (`modules/m01-core-contabil/roteiros.ts`), e a correspondência fonte -> natureza virou ato
    // do ente, declarado no passo 5.5 acima. A recusa antiga não pode mais aparecer — e se
    // aparecer é REGRESSÃO, não pendência: por isso ela é FALHA aqui, e não "não executado".
    // ⚠️ O RODAPÉ ANTES DA GUIA, lido agora: é a linha-base do delta do passo 6.2, e ele tem de
    // ser lido DEPOIS da declaração da natureza — a tela de natureza não mexe em arrecadação,
    // mas ler antes e comparar depois de navegar por três telas é como um percurso mede o que
    // não aconteceu no meio.
    const antesDaGuiaA = await (async () => {
      await irPara(n, page, `/receita/por-entidade?exercicio=${ANO}`);
      return lerRodape(page);
    })();
    await irPara(n, page, `/receita/arrecadacoes?exercicio=${ANO}`);
    const numeroA = `J9A-${SUF}`;
    const rGuiaA = await preencherEEnviar(page, "registrar-guia", [
      { sel: 'input[name="natureza"]', valor: dadosDaConta.natureza },
      { sel: 'input[name="fonte"]', valor: dadosDaConta.fonte },
      { sel: 'select[name="contaBancaria"]', valor: dadosDaConta.valor, tipo: "select" },
      { sel: 'input[data-mascara="valor"]', valor: "1.000,00" },
      { sel: 'input[name="data"]', valor: hoje(), tipo: "data" },
      { sel: 'input[name="numeroReceita"]', valor: numeroA },
    ]);
    const bloqueadaPelaDdr =
      rGuiaA.tipo === "erro" && /sintética não recebe partida/i.test(rGuiaA.texto) && /7\.2\.1\.1\.0\.00\.00/.test(rGuiaA.texto);

    if (bloqueadaPelaDdr) {
      falhou(
        "6.0 a recusa da conta sintética 7.2.1.1.0.00.00 NÃO pode mais existir (V11 V9.3)",
        `a perna de classe 7 voltou a ser fixa no pai sintético: ${rGuiaA.texto.slice(0, 220)}`
      );
      naoExecutado("6.2 o carimbo da guia nova na entidade titular (pela tela)", "regressão do roteiro da DDR: a guia não foi registrada");
      naoExecutado("7.x trocar o titular e conferir que a guia anterior NÃO migra (pela tela)", "depende da guia do passo 6.2, que não existe");
      naoExecutado("8.x o estorno herdando a identificação do fato original (pela tela)", "depende da guia do passo 6.2, que não existe");
    } else {
      ok("6.0 a recusa da conta sintética 7.2.1.1.0.00.00 não aparece — a perna de classe 7 é resolvida pela natureza da fonte");
      conferir("6.1 a guia é registrada na conta cujo titular é A", rGuiaA.tipo === "ok", `${rGuiaA.tipo}: ${rGuiaA.texto.slice(0, 200)}`);
      await irPara(n, page, `/receita/por-entidade?exercicio=${ANO}`);
      const comGuiaA = await lerRodape(page);
      conferir(
        "6.2 a guia entra JÁ IDENTIFICADA: a linha da entidade A cresce exatamente os 1.000,00 arrecadados",
        linhaDe(comGuiaA, codA).centavos - linhaDe(antesDaGuiaA, codA).centavos === 100000,
        `delta de A = ${linhaDe(comGuiaA, codA).centavos - linhaDe(antesDaGuiaA, codA).centavos} centavos`
      );
      const rTrocaB = await declararTitular(codB, citacaoQueMenciona(nomeB));
      conferir("7.1 o titular da conta é ALTERADO para a entidade B", rTrocaB.tipo === "ok", `${rTrocaB.tipo}: ${rTrocaB.texto.slice(0, 200)}`);
      await irPara(n, page, `/receita/por-entidade?exercicio=${ANO}`);
      const aposTroca = await lerRodape(page);
      conferir(
        "7.2 ⚠️ A ARRECADAÇÃO ANTERIOR NÃO MIGROU: a linha de A continua igual depois da troca de titular",
        linhaDe(aposTroca, codA).centavos === linhaDe(comGuiaA, codA).centavos,
        `A: ${linhaDe(comGuiaA, codA).centavos} -> ${linhaDe(aposTroca, codA).centavos}`
      );
      await irPara(n, page, `/receita/arrecadacoes?exercicio=${ANO}`);
      const idDaGuiaA = await page.evaluate((num) => {
        for (const c of Array.from(document.querySelectorAll('input[name="receitaId"]'))) {
          const linha = c.closest("tr");
          if (linha !== null && (linha.textContent ?? "").includes(num)) return (c as HTMLInputElement).value;
        }
        return "";
      }, numeroA);
      if (idDaGuiaA === "") {
        naoExecutado("8.x o estorno herdando a identificação", "a guia de A não ofereceu formulário de anulação");
      } else {
        const rAnular = await preencherEEnviar(page, `form[class]:has(input[name="receitaId"][value="${idDaGuiaA}"])`, [
          { sel: 'input[name="numero"]', valor: `J9RA-${SUF}` },
          { sel: 'input[name="data"]', valor: hoje(), tipo: "data" },
        ]);
        conferir("8.1 a anulação da guia de A é registrada", rAnular.tipo === "ok", `${rAnular.tipo}: ${rAnular.texto.slice(0, 200)}`);
        await irPara(n, page, `/receita/por-entidade?exercicio=${ANO}`);
        const aposEstorno = await lerRodape(page);
        conferir(
          "8.2 ⚠️ O ESTORNO DEBITA A (o titular do fato ORIGINAL), embora a conta já pertença a B",
          linhaDe(aposEstorno, codA).centavos - linhaDe(aposTroca, codA).centavos === -100000,
          `A delta=${linhaDe(aposEstorno, codA).centavos - linhaDe(aposTroca, codA).centavos}`
        );
        conferir(
          "8.3 e B NÃO foi tocada pelo estorno — a identificação não se rederiva do titular de agora",
          linhaDe(aposEstorno, codB).centavos === linhaDe(aposTroca, codB).centavos,
          `B: ${linhaDe(aposTroca, codB).centavos} -> ${linhaDe(aposEstorno, codB).centavos}`
        );
      }
    }

    // ══ 9. A ATRIBUIÇÃO DO LEGADO PELA TELA — O CAMINHO QUE O LEGADO TEM ══
    //
    // ⚠️ E É ELE QUE PROVA O QUE O PEDIDO CHAMA DE "vínculo válido e opção explícita quando
    // necessária". A guia sem conta não tem de onde derivar entidade: ou alguém a atribui com
    // ato, ou ela permanece explicitamente não atribuída — e as duas coisas têm de ser visíveis.
    await irPara(n, page, `/receita/por-entidade?exercicio=${ANO}`);
    const antesDaAtribuicao = await lerRodape(page);
    const pendente = await page.evaluate(() => {
      const s = document.querySelector('[data-papel="fila-nao-atribuidas"]');
      if (s === null) return null;
      const li = s.querySelector("li[data-guia]");
      if (li === null) return null;
      const b = li.querySelector("button[data-papel^='atribuir-']");
      return {
        guia: li.getAttribute("data-guia") ?? "",
        papel: b?.getAttribute("data-papel") ?? "",
        caminho: /não declara conta bancária/.test(li.textContent ?? "")
          ? "sem conta"
          : /ainda não tem titular declarado/.test(li.textContent ?? "")
            ? "conta sem titular"
            : "(sem frase de caminho)",
        valorTexto: (li.textContent ?? "").replace(/\s+/g, " ").trim(),
      };
    });
    if (pendente === null) {
      const quantas = antesDaAtribuicao.naoAtribuido?.guias ?? 0;
      conferir(
        "9.1 sem guia pendente, a fila não é renderizada vazia — e o rodapé concorda",
        quantas === 0,
        `o rodapé diz ${String(quantas)} guia(s) não atribuída(s), mas não há fila para resolvê-las`
      );
      naoExecutado("9.2 a 9.7 a atribuição do legado pela tela", "não restou guia sem entidade neste banco (execução anterior já atribuiu)");
    } else {
      conferir("9.1 a fila nomeia a guia pendente e DIZ qual é o caminho dela", pendente.caminho !== "(sem frase de caminho)", pendente.valorTexto.slice(0, 200));
      conferir("9.2 a guia pendente traz a OPÇÃO EXPLÍCITA de atribuir — pendência nomeada, não silenciosa", pendente.papel !== "", "sem botão de atribuir");
      nota(`guia pendente: ${pendente.guia} (${pendente.caminho})`);
      const valorPendente = centavosDaTela(pendente.valorTexto) ?? 0;

      async function atribuir(codigoEntidade: string, citacao: string): Promise<{ readonly tipo: string; readonly texto: string }> {
        await irPara(n, page, `/receita/por-entidade?exercicio=${ANO}`);
        await page.click(`button[data-papel="${pendente!.papel}"]`);
        await page.waitForSelector('select[name="entidadeId"]', { timeout: 30000 });
        const valor = await page.evaluate((cod) => {
          const sel = document.querySelector('select[name="entidadeId"]');
          if (!(sel instanceof HTMLSelectElement)) return "";
          return Array.from(sel.options).find((o) => (o.textContent ?? "").startsWith(`${cod} —`))?.value ?? "";
        }, codigoEntidade);
        if (valor === "") throw new Error(`a entidade ${codigoEntidade} não está no select da atribuição`);
        return preencherEEnviar(
          page,
          'form[class]:has(input[name="receitaArrecadadaId"])',
          [
            { sel: 'select[name="entidadeId"]', valor, tipo: "select" as const },
            { sel: 'input[name="motivo"]', valor: `legado sem conta identificado no percurso J9 ${SUF}` },
            { sel: 'select[name="atoTipo"]', valor: "LEI", tipo: "select" as const },
            { sel: 'input[name="atoNumero"]', valor: `3${SUF.slice(-3)}` },
            { sel: 'input[name="atoAno"]', valor: String(ANO - 2) },
            { sel: 'input[name="atoDispositivo"]', valor: "art. 3º" },
            { sel: 'textarea[name="atoCitacao"]', valor: citacao },
          ],
          "atribuir-entidade"
        );
      }

      const rAtribInaplicavel = await atribuir(codA, CITACAO_INAPLICAVEL);
      conferir(
        "9.3 atribuir com ato que não trata do assunto é RECUSADO, e o motivo chega à tela",
        rAtribInaplicavel.tipo === "erro" && /não menciona/i.test(rAtribInaplicavel.texto),
        `${rAtribInaplicavel.tipo}: ${rAtribInaplicavel.texto.slice(0, 250)}`
      );
      await irPara(n, page, `/receita/por-entidade?exercicio=${ANO}`);
      const aposRecusa = await lerRodape(page);
      conferir(
        "9.4 e NADA foi gravado: o não atribuído continua com o mesmo valor depois da recusa",
        (aposRecusa.naoAtribuido?.centavos ?? 0) === (antesDaAtribuicao.naoAtribuido?.centavos ?? 0),
        `${String(antesDaAtribuicao.naoAtribuido?.centavos)} -> ${String(aposRecusa.naoAtribuido?.centavos)}`
      );
      const rAtrib = await atribuir(codA, citacaoQueMenciona(nomeA));
      /**
       * ⚠️ "SILÊNCIO" AQUI É ESPERADO, E TEM NOME. No sucesso a guia sai da fila no re-render e a
       * ilha que produziu a mensagem some com ela — pendência `MENSAGEM-SOME-COM-A-LINHA`, a
       * mesma já registrada em `scripts/smoke-arrecadacao-conta.ts`. Por isso o que se afirma
       * NÃO é a mensagem: é o efeito, relido do banco pela tela.
       */
      if (rAtrib.tipo === "silencio") nota("9.5 a tela não confirmou por escrito (MENSAGEM-SOME-COM-A-LINHA); o efeito é conferido a seguir");
      else conferir("9.5 a atribuição não é recusada", rAtrib.tipo === "ok", `${rAtrib.tipo}: ${rAtrib.texto.slice(0, 200)}`);
      await irPara(n, page, `/receita/por-entidade?exercicio=${ANO}`);
      const aposAtrib = await lerRodape(page);
      const saiuDaFila = !(await page.evaluate(
        (g) => document.querySelector(`[data-papel="fila-nao-atribuidas"] li[data-guia="${g}"]`) !== null,
        pendente.guia
      ));
      conferir("9.5b o ato produziu efeito: a guia saiu da fila de não atribuídas", saiuDaFila, "a guia continua na fila — a atribuição não gravou");
      /**
       * ⚠️ ESTE É O PASSO QUE SÓ A TELA ALCANÇA, E EM 24/09/2026 ELE ACUSOU.
       *
       * `ATRIBUICAO-NAO-CHEGA-AO-RODAPE`. As duas leituras da MESMA tela discordam sobre o mesmo
       * dinheiro, no MESMO render:
       *
       *   · a FILA some com a guia — `lib/portas/arrecadacao.ts:278` filtra por
       *     `atribuicaoDeEntidade: null`, e a guia atribuída deixa de ser trabalho pendente;
       *   · o RODAPÉ continua contando a guia como não atribuída —
       *     `modules/m04-receita/consultas.ts:414-443` agrupa SOMENTE por `entidadeTitularId`, e
       *     nunca lê `AtribuicaoDeEntidadeDaArrecadacao`;
       *   · e a atribuição não preenche aquela coluna —
       *     `modules/m04-receita/atribuicao-de-entidade.ts:152-166` grava a sua própria linha e
       *     mais nada (medido no banco: a guia 7 seguiu com `entidadeTitularId = null` depois de
       *     atribuída, com a linha de atribuição gravada).
       *
       * O efeito para o servidor municipal: ele atribui a guia com ato, ela SAI da lista do que
       * há para fazer, o dinheiro FICA em "Não atribuído — o ente ainda não disse de quem é"
       * para sempre, e não sobra formulário nenhum para agir de novo. O teste de domínio passa
       * porque afirma a linha gravada; nenhuma das duas leituras da tela estava confrontada com
       * a outra.
       *
       * Não se conserta aqui: ou a consulta passa a ler a atribuição, ou a atribuição passa a
       * carimbar a coluna — e isso é decisão de modelo sobre o que a coluna significa para a
       * guia de legado, que nunca teve titular.
       */
      conferir(
        "9.6 ⚠️ O VALOR MIGRA DO NÃO ATRIBUÍDO PARA A ENTIDADE, exatamente e sem sobra",
        linhaDe(aposAtrib, codA).centavos - linhaDe(antesDaAtribuicao, codA).centavos === valorPendente &&
          (antesDaAtribuicao.naoAtribuido?.centavos ?? 0) - (aposAtrib.naoAtribuido?.centavos ?? 0) === valorPendente,
        `ATRIBUICAO-NAO-CHEGA-AO-RODAPE — A delta=${linhaDe(aposAtrib, codA).centavos - linhaDe(antesDaAtribuicao, codA).centavos}, ` +
          `não atribuído delta=${(antesDaAtribuicao.naoAtribuido?.centavos ?? 0) - (aposAtrib.naoAtribuido?.centavos ?? 0)}, esperado ${valorPendente}. ` +
          `A fila soltou a guia (lib/portas/arrecadacao.ts:278) e o rodapé continua contando-a como não atribuída (modules/m04-receita/consultas.ts:414-443)`
      );
      conferir(
        "9.7 e o rodapé continua fechando depois do ato: Σ entidades + não atribuído == total",
        aposAtrib.totalCentavos !== null &&
          aposAtrib.linhas.reduce((a, l) => a + l.centavos, 0) + (aposAtrib.naoAtribuido?.centavos ?? 0) === aposAtrib.totalCentavos,
        `Σ=${aposAtrib.linhas.reduce((a, l) => a + l.centavos, 0) + (aposAtrib.naoAtribuido?.centavos ?? 0)} total=${String(aposAtrib.totalCentavos)}`
      );
      conferir(
        "9.8 o total do exercício NÃO mudou — atribuir é dizer de quem é, não arrecadar de novo",
        aposAtrib.totalCentavos === antesDaAtribuicao.totalCentavos,
        `total: ${String(antesDaAtribuicao.totalCentavos)} -> ${String(aposAtrib.totalCentavos)}`
      );
      conferir(
        "9.9 e a guia não oferece mais o ato — repetição não vira duplicidade",
        saiuDaFila,
        `a guia ${pendente.guia} continua na fila com formulário`
      );
    }

    // ══ 10. FORA DO ESCOPO AUTORIZADO, COM O MOTIVO NA TELA ══
    await sair(n, page);
    await entrar(n, page, TESOUREIRO, SENHA_PAPEIS);
    ok("10.1 login do tesoureiro (papel do percurso, sem as ações da V11 V9)");
    /**
     * ⚠️ AQUI A PRIMEIRA VERSÃO DESTE PERCURSO ESTAVA ERRADA, E O ERRO ERA MEU, NÃO DO PRODUTO.
     *
     * Ela afirmava que o tesoureiro seria BARRADO em `/contabilidade/entidades` e leu o 200 como
     * defeito. Mas a tela é de LEITURA e se guarda por `CONSULTAR_CONTABILIDADE`
     * (`app/(areas)/contabilidade/entidades/page.tsx:32`), que o tesoureiro tem por conciliar; a
     * ESCRITA se guarda por ação nomeada no servidor —
     * `comEscritaAutenticada("CADASTRAR_ENTIDADE_CONTABIL")`, em
     * `lib/portas/entidades-contabeis.ts:173`. Um percurso que reprova o 200 da leitura mandaria
     * alguém "consertar" a guarda certa.
     *
     * O que se afirma, então, é o EFEITO da negação, e com o MOTIVO junto: o tesoureiro ENVIA o
     * formulário e o servidor RECUSA nomeando a ação que falta. "Não completou" é compatível com
     * o servidor tendo gravado e escondido o resultado — por isso o passo seguinte relê a lista.
     */
    const statusEntidades = await page.goto(`${BASE}/contabilidade/entidades`, { waitUntil: "networkidle2" });
    const leituraAberta = (statusEntidades?.status() ?? 0) === 200 && !page.url().includes("/login");
    if (!leituraAberta) {
      ok("10.2 o tesoureiro nem chega à tela de entidades (a leitura também não é dele)");
    } else {
      const tipoUtilT = await page.evaluate(() => {
        const sel = document.querySelector('form[data-papel="form-cadastrar-entidade"] select[name="tipoManad"]');
        if (!(sel instanceof HTMLSelectElement)) return "";
        return Array.from(sel.options).find((o) => o.value !== "" && !o.disabled)?.value ?? "";
      });
      if (tipoUtilT === "") {
        ok("10.2 o tesoureiro lê a tela de entidades e NÃO recebe o formulário de cadastro");
      } else {
        const nomeT = `Entidade Que O Tesoureiro Nao Pode Criar ${SUF}`;
        const codT = `T${SUF.slice(-3)}`.slice(0, 4);
        const rProibido = await preencherEEnviar(
          page,
          'form[data-papel="form-cadastrar-entidade"]',
          [
            { sel: 'input[name="codigo"]', valor: codT },
            { sel: 'input[name="nome"]', valor: nomeT },
            { sel: 'select[name="tipoManad"]', valor: tipoUtilT, tipo: "select" as const },
            { sel: 'select[name="atoTipo"]', valor: "LEI", tipo: "select" as const },
            { sel: 'input[name="atoNumero"]', valor: `9${SUF.slice(-3)}` },
            { sel: 'input[name="atoAno"]', valor: String(ANO - 2) },
            { sel: 'input[name="atoDispositivo"]', valor: "art. 4º" },
            { sel: 'textarea[name="atoCitacao"]', valor: citacaoQueMenciona(nomeT) },
          ],
          "cadastrar-entidade"
        );
        conferir(
          "10.2 o servidor RECUSA o cadastro feito pelo tesoureiro, e a recusa DIZ que é falta de autorização",
          rProibido.tipo === "erro" && /aç(ão|ao)|autoriza|permiss|acesso/i.test(rProibido.texto),
          `${rProibido.tipo}: ${rProibido.texto.slice(0, 250)}`
        );
        const listaDoTesoureiro = await irPara(n, page, "/contabilidade/entidades");
        conferir(
          "10.2b e NADA foi gravado de fato — a entidade proibida não aparece na lista após recarga",
          !listaDoTesoureiro.includes(nomeT.toLowerCase()),
          "a entidade criada por quem não podia APARECEU na lista"
        );
        naoExecutado(
          "10.2c a tela de entidades esconder o formulário de quem não pode cadastrá-lo",
          "achado: `app/(areas)/contabilidade/entidades/page.tsx:63` renderiza FormCadastrarEntidade sem conferir CADASTRAR_ENTIDADE_CONTABIL. O servidor recusa (a proteção existe), mas a pessoa preenche sete campos para levar um não"
        );
      }
    }
    const bContas = await page.goto(`${BASE}/financeiro/contas-bancarias`, { waitUntil: "networkidle2" });
    const podeDeclarar = await page.evaluate(() => document.querySelector("button[data-papel^='declarar-titular-']") !== null);
    conferir(
      "10.3 e mesmo onde ele ENTRA, o ato que não é dele não aparece: sem botão de declarar titular",
      (bContas?.status() ?? 0) !== 200 || !podeDeclarar,
      `contas-bancarias respondeu ${String(bContas?.status() ?? 0)} e o botão de declarar titular ${podeDeclarar ? "APARECEU" : "não apareceu"}`
    );
    const bPorEntidade = await page.goto(`${BASE}/receita/por-entidade?exercicio=${ANO}`, { waitUntil: "networkidle2" });
    const corpoTesoureiro = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
    const temAtribuir = await page.evaluate(() => document.querySelector("button[data-papel^='atribuir-']") !== null);
    if ((bPorEntidade?.status() ?? 0) === 200 && !page.url().includes("/login")) {
      conferir(
        "10.4 o tesoureiro consulta a arrecadação por entidade mas NÃO recebe o ato de atribuir",
        !temAtribuir,
        "o botão de atribuir entidade apareceu para quem não tem a ação"
      );
    } else {
      conferir(
        "10.4 a consulta por entidade recusa o tesoureiro DIZENDO o motivo, em vez de 500",
        (bPorEntidade?.status() ?? 0) !== 500 &&
          (page.url().includes("/sem-acesso") || /acesso|não tem a ação|sem acesso/i.test(corpoTesoureiro)),
        `status ${String(bPorEntidade?.status() ?? 0)} em ${page.url()} — ${corpoTesoureiro.slice(0, 200)}`
      );
    }
  } catch (e) {
    falhou("execução", e instanceof Error ? e.message : String(e));
  } finally {
    await navegador.close();
  }
  console.log(
    `\n${passos.length} passo(s) ok, ${falhas.length} falha(s), ${naoExecutados.length} NAO EXECUTADO(S).`
  );
  if (naoExecutados.length > 0) {
    console.log("nao executados (nao sao aprovacao nem defeito — sao trabalho que nao aconteceu):");
    console.log(naoExecutados.map((f) => ` - ${f}`).join("\n"));
  }
  if (falhas.length > 0) {
    console.error(falhas.map((f) => ` - ${f}`).join("\n"));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
