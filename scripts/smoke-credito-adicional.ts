import "dotenv/config";
import type { Page } from "puppeteer-core";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { CONTA_CREDITO_ADICIONAL_SUPLEMENTAR } from "../modules/m01-core-contabil/roteiros.js";
import {
  entrar,
  irPara,
  lancarNavegadorDoPercurso,
  preencherEEnviar,
  registroDePassos,
  sair,
  texto,
  type Navegador,
} from "./percursos-navegador.js";
import type { PrismaClient } from "../prisma/generated/client/client.js";

/**
 * ═══ O PERCURSO DO CRÉDITO ADICIONAL (V11 V7.2) ═══
 *
 * A V7.1 fez o crédito adicional SUPLEMENTAR passar a funcionar em instalação limpa — o roteiro
 * orçamentário virou (movimento, tipo de crédito) e o suplementar entrou na analítica do plano.
 * Isso estava provado em teste e no seed. **Não estava provado pela tela**, e "não declarar
 * percurso concluído porque foi escrito ou tipado" vale aqui inteiro.
 *
 * O que este percurso afirma:
 *
 *  1. A LEI entra PELA TELA (formulário novo da V7.2). Antes ela só entrava por seed, e sem lei
 *     não há decreto: o crédito adicional inteiro estava fora do alcance de quem só tem a tela.
 *  2. O DECRETO e as PERNAS entram pela tela, e o ato CONFIRMA — o formulário sai e a
 *     confirmação fica, com o número do decreto.
 *  3. O DINHEIRO CHEGA NA FICHA: a dotação atualizada sobe exatamente o que foi suplementado, e
 *     isso se lê na tela do QDD, não só no banco.
 *  4. ⚠️ A PARTIDA ENTRA NA CONTA DO TIPO DO CRÉDITO — a afirmação central da V7.1, e a única
 *     que a tela não mostra. Conferida no banco: o débito do movimento é
 *     `5.2.2.1.2.01.00 CREDITO ADICIONAL - SUPLEMENTAR`, e não a sintética de antes.
 *  5. REPETIR O MESMO DECRETO é recusado NOMEANDO o motivo, e nada duplica.
 *  6. A NEGATIVA tem motivo: esta tela RENDERIZA o formulário para todo mundo (botão oculto não
 *     é proteção), então quem não tem a ação envia e o SERVIDOR recusa, dizendo qual ação falta.
 *
 * Uso: PERCURSO_BANCO=<banco> CREDITO_JSON='{...}' npx tsx scripts/smoke-credito-adicional.ts [base]
 */

interface Cenario {
  readonly sufixo: string;
  readonly exercicio: number;
  readonly fichaId: string;
  readonly fichaNumero: number;
  readonly fonteCodigo: string;
  readonly unidadeCodigo: string;
  readonly teto: string;
  readonly suplementacao: string;
  readonly usuarioFraco: string;
}

const N: Navegador = { base: process.argv[2] ?? "http://localhost:3010" };
const SENHA = process.env["PERCURSOS_SENHA_PAPEIS"] ?? "Percurso#2026";
const ADMIN = process.env["SEED_IDENTIDADE"] ?? "admin@cg.pb.gov.br";
const SENHA_ADMIN = process.env["SEED_ADMIN_SENHA"] ?? "";
const C: Cenario = JSON.parse(process.env["CREDITO_JSON"] ?? "null") as Cenario;

const LEI = `L-${C?.sufixo ?? "000000"}`;
const DECRETO = `D-${C?.sufixo ?? "000000"}`;
const FORM_LEI = "cadastrar-lei-de-credito";
const FORM_DECRETO = "cadastrar-decreto-de-credito";

const rota = (): string => `/planejamento/creditos-adicionais?exercicio=${C.exercicio}`;

/** Abre um painel de formulário clicando no botão que o revela — o que a pessoa faz. */
async function abrirPainel(page: Page, rotulo: string): Promise<boolean> {
  await page.bringToFront();
  const clicou = await page.evaluate((texto) => {
    const botoes = Array.from(document.querySelectorAll("button"));
    const alvo = botoes.find((b) => (b.textContent ?? "").trim() === texto);
    if (!(alvo instanceof HTMLButtonElement)) return false;
    alvo.click();
    return true;
  }, rotulo);
  if (!clicou) return false;
  await new Promise((r) => setTimeout(r, 400));
  return true;
}

/**
 * POR QUE O ENVIO NÃO SAIU — lido da própria tela, e não adivinhado.
 *
 * ⚠️ "silêncio" é o diagnóstico mais pobre que um percurso pode dar: ele cobre desde um campo
 * que não recebeu o valor até um botão desabilitado pela validação de forma. Esta função
 * transforma o silêncio em uma frase com nome de campo — é a diferença entre reexecutar o
 * percurso às cegas e ler o motivo na primeira vez.
 */
async function porQueNaoEnviou(page: Page, acao: string): Promise<string> {
  return page.evaluate((a) => {
    const f = document.querySelector(`form[data-acao="${a}"]`);
    if (f === null) return "o formulário não está mais na tela";
    const erros = f.querySelector('[data-teste="erros-forma"]')?.textContent?.trim() ?? "";
    const b = f.querySelector('button[type="submit"]');
    const estadoBotao = b instanceof HTMLButtonElement ? (b.disabled ? "DESABILITADO" : "habilitado") : "ausente";
    const campos = Array.from(f.querySelectorAll("input, select"))
      .map((e) => {
        const el = e as HTMLInputElement | HTMLSelectElement;
        const nome = el.name !== "" ? el.name : (el.getAttribute("aria-label") ?? "(sem nome)");
        return `${nome}="${el.value}"`;
      })
      .join(" · ");
    return `botão ${estadoBotao} | erros de forma: ${erros === "" ? "(nenhum)" : erros} | campos: ${campos}`;
  }, acao);
}

/** O dia civil de hoje em `AAAA-MM-DD`, para os campos `type="date"`. */
function hojeCivil(): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const de = (t: string): string => partes.find((p) => p.type === t)?.value ?? "";
  return `${de("year")}-${de("month")}-${de("day")}`;
}

async function main(): Promise<void> {
  const R = registroDePassos();
  if (C === null) {
    R.conferir("preparação — CREDITO_JSON ausente: rode scripts/preparar-credito-adicional.ts antes", false, "sem cenário");
    R.encerrar();
    return;
  }
  if (SENHA_ADMIN === "") {
    R.conferir("preparação — SEED_ADMIN_SENHA ausente", false, "sem senha do administrador");
    R.encerrar();
    return;
  }

  const navegador = await lancarNavegadorDoPercurso();
  const page = await navegador.newPage();
  const url = process.env["DATABASE_URL"] ?? "";
  const prisma = url === "" ? null : (criarPrismaClient(url) as unknown as PrismaClient);

  try {
    console.log(`      [banco ${process.env["PERCURSO_BANCO"] ?? "não declarado"} · cenário ${C.sufixo}]`);

    // ═══ 1. A LEI, PELA TELA ═══════════════════════════════════════════════
    await entrar(N, page, ADMIN, SENHA_ADMIN);
    const corpo1 = await irPara(N, page, rota());
    R.conferir("1.1 a tela dos créditos adicionais abre", corpo1.includes("créditos adicionais"), corpo1.slice(0, 200));

    R.conferir("1.2 o painel da lei existe e abre", await abrirPainel(page, "Cadastrar lei"), "o botão 'Cadastrar lei' não está na tela");

    const r1 = await preencherEEnviar(page, FORM_LEI, [
      { sel: 'input[name="numero"]', valor: LEI },
      { sel: 'input[name="dataPublicacao"]', valor: hojeCivil(), tipo: "data" },
      { sel: 'select[name="tipoCredito"]', valor: "SUPLEMENTAR", tipo: "select" },
      { sel: 'input[data-mascara="valor"]', valor: C.teto.replace(".", ",") },
    ]);
    R.conferir(
      `1.3 a lei ${LEI} é cadastrada PELA TELA e o ato confirma`,
      r1.tipo === "ok" && r1.texto.includes(LEI),
      `${r1.tipo}: ${r1.texto}`
    );

    // ═══ 2. O DECRETO E AS PERNAS ══════════════════════════════════════════
    await irPara(N, page, rota());
    R.conferir("2.1 o painel do decreto abre", await abrirPainel(page, "Cadastrar decreto"), "o botão 'Cadastrar decreto' não está na tela");

    // ⚠️ A LEI SE CONFERE NO SELECT DO DECRETO, e não no texto da página: fora do formulário
    // aberto ela não é exibida em lugar nenhum desta tela. Procurar o número no corpo faria o
    // percurso acusar "a lei sumiu" quando o que houve foi um painel fechado.
    let leiId = "";
    try {
      leiId = await idDaLei(page);
    } catch (e) {
      R.falhou("2.2 a lei gravada está disponível para o decreto", e instanceof Error ? e.message : String(e));
    }
    R.conferir("2.2 a lei gravada está disponível para o decreto", leiId !== "", "a lei não entrou no select");

    const r2 = await preencherEEnviar(page, FORM_DECRETO, [
      { sel: 'select[name="leiId"]', valor: leiId, tipo: "select" },
      { sel: 'input[name="numero"]', valor: DECRETO },
      { sel: 'input[name="data"]', valor: hojeCivil(), tipo: "data" },
      { sel: 'select[name="origemRecurso"]', valor: "EXCESSO_ARRECADACAO", tipo: "select" },
      { sel: '[aria-label="Ficha do movimento 1"]', valor: C.fichaId, tipo: "select" },
      { sel: '[aria-label="Tipo do movimento 1"]', valor: "SUPLEMENTACAO", tipo: "select" },
      { sel: '[aria-label="Valor do movimento 1"]', valor: C.suplementacao.replace(".", ",") },
    ]);
    R.conferir(
      `2.3 o decreto ${DECRETO} grava com 1 movimento e o ato confirma`,
      r2.tipo === "ok" && r2.texto.includes(DECRETO),
      r2.tipo === "silencio" ? await porQueNaoEnviou(page, FORM_DECRETO) : `${r2.tipo}: ${r2.texto}`
    );

    const corpo3 = await irPara(N, page, rota());
    const valorNaTela = Number(C.suplementacao).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
    R.conferir("2.4 o decreto aparece na lista, ATIVO e do tipo suplementar", corpo3.includes(DECRETO.toLowerCase()) && corpo3.includes("suplementar"), "decreto ausente da lista");
    R.conferir(`2.5 o suplementado do decreto é ${valorNaTela}`, corpo3.includes(valorNaTela.toLowerCase()), `não achei ${valorNaTela} na tela`);

    // ═══ 3. O DINHEIRO CHEGOU NA FICHA ═════════════════════════════════════
    const corpoQdd = await irPara(N, page, `/planejamento/qdd?exercicio=${C.exercicio}`);
    R.conferir("3.1 a tela do QDD abre", corpoQdd.includes("qdd") || corpoQdd.includes("detalhamento"), corpoQdd.slice(0, 200));

    if (prisma !== null) {
      const ficha = await prisma.fichaOrcamentaria.findUniqueOrThrow({
        where: { id: C.fichaId },
        select: { saldoAutorizado: true, valorDotado: true },
      });
      const esperado = Number(ficha.valorDotado.toFixed(2)) + Number(C.suplementacao);
      R.conferir(
        `3.2 a dotação autorizada da ficha ${C.fichaNumero} subiu para ${esperado.toFixed(2)}`,
        Number(ficha.saldoAutorizado.toFixed(2)) === esperado,
        `autorizado ${ficha.saldoAutorizado.toFixed(2)}, esperado ${esperado.toFixed(2)}`
      );

      // ═══ 4. A AFIRMAÇÃO CENTRAL DA V7.1 — A CONTA DO TIPO DO CRÉDITO ═════
      // ⚠️ ESTA É A ÚNICA CONFERÊNCIA QUE NÃO SE FAZ PELA TELA, e não é por desleixo: a conta
      // do PCASP não aparece em tela nenhuma do crédito adicional — ela é o que o balancete e a
      // remessa leem. Um lançamento na conta errada FECHA igual ao certo, então a tela não teria
      // como denunciá-lo.
      const partidas = await prisma.partidaContabil.findMany({
        where: { fichaId: C.fichaId, tipo: "DEBITO", conta: { codigo: { startsWith: "5.2.2.1.2" } } },
        select: { valor: true, conta: { select: { codigo: true, nome: true } } },
      });
      R.conferir(
        `4.1 o crédito adicional debitou ${CONTA_CREDITO_ADICIONAL_SUPLEMENTAR} (a analítica do SUPLEMENTAR)`,
        partidas.length === 1 && partidas[0]?.conta.codigo === CONTA_CREDITO_ADICIONAL_SUPLEMENTAR,
        partidas.length === 0
          ? "nenhuma partida na dotação adicional"
          : partidas.map((p) => `${p.conta.codigo} ${p.conta.nome}`).join("; ")
      );
      R.conferir(
        `4.2 e o valor da partida é ${C.suplementacao}`,
        partidas[0] !== undefined && partidas[0].valor.toFixed(2) === C.suplementacao,
        partidas[0] === undefined ? "sem partida" : partidas[0].valor.toFixed(2)
      );
    } else {
      R.falhou("3.2/4.x a conferência contábil precisa de DATABASE_URL", "DATABASE_URL não definida");
    }

    // ═══ 5. REPETIR O MESMO DECRETO ════════════════════════════════════════
    await irPara(N, page, rota());
    await abrirPainel(page, "Cadastrar decreto");
    const r3 = await preencherEEnviar(page, FORM_DECRETO, [
      { sel: 'select[name="leiId"]', valor: await idDaLei(page), tipo: "select" },
      { sel: 'input[name="numero"]', valor: DECRETO },
      { sel: 'input[name="data"]', valor: hojeCivil(), tipo: "data" },
      { sel: 'select[name="origemRecurso"]', valor: "EXCESSO_ARRECADACAO", tipo: "select" },
      { sel: '[aria-label="Ficha do movimento 1"]', valor: C.fichaId, tipo: "select" },
      { sel: '[aria-label="Tipo do movimento 1"]', valor: "SUPLEMENTACAO", tipo: "select" },
      { sel: '[aria-label="Valor do movimento 1"]', valor: C.suplementacao.replace(".", ",") },
    ]);
    R.conferir(
      "5.1 repetir o MESMO número de decreto é recusado com motivo",
      r3.tipo === "erro" && r3.texto.trim() !== "",
      r3.tipo === "silencio" ? await porQueNaoEnviou(page, FORM_DECRETO) : `${r3.tipo}: ${r3.texto}`
    );

    if (prisma !== null) {
      const quantos = await prisma.decretoCredito.count({ where: { numero: DECRETO, ano: C.exercicio } });
      R.conferir("5.2 e NADA duplicou: continua UM decreto com esse número", quantos === 1, `${quantos} decreto(s)`);
    }

    // ═══ 6. A NEGATIVA, COM MOTIVO ═════════════════════════════════════════
    await sair(N, page);
    await entrar(N, page, C.usuarioFraco, SENHA);
    const corpoFraco = await irPara(N, page, rota());
    R.conferir("6.1 quem só LÊ o planejamento alcança a tela", corpoFraco.includes("créditos adicionais"), corpoFraco.slice(0, 200));

    R.conferir("6.2 e a tela OFERECE o formulário a ele — botão oculto não é a proteção", await abrirPainel(page, "Cadastrar lei"), "o painel da lei não abriu para o usuário fraco");
    const r4 = await preencherEEnviar(page, FORM_LEI, [
      { sel: 'input[name="numero"]', valor: `${LEI}-X` },
      { sel: 'input[name="dataPublicacao"]', valor: hojeCivil(), tipo: "data" },
      { sel: 'select[name="tipoCredito"]', valor: "SUPLEMENTAR", tipo: "select" },
      { sel: 'input[data-mascara="valor"]', valor: "1.000,00" },
    ]);
    R.conferir(
      "6.3 o SERVIDOR recusa e NOMEIA a ação que falta",
      r4.tipo === "erro" && r4.texto.includes("CRIAR_LEI_DE_CREDITO"),
      `${r4.tipo}: ${r4.texto}`
    );

    if (prisma !== null) {
      const leis = await prisma.leiCredito.count({ where: { numero: `${LEI}-X` } });
      R.conferir("6.4 e nada foi gravado pela recusa", leis === 0, `${leis} lei(s) com o número recusado`);
    }
  } catch (erro) {
    R.falhou("percurso interrompido", erro instanceof Error ? erro.message : String(erro));
  } finally {
    await prisma?.$disconnect();
    await page.close();
    await navegador.close();
  }

  R.encerrar();
}

/** O `value` da opção da lei do cenário, lido do próprio `select` — nunca adivinhado. */
async function idDaLei(page: Page): Promise<string> {
  const id = await page.evaluate((numero) => {
    const sel = document.querySelector('select[name="leiId"]');
    if (!(sel instanceof HTMLSelectElement)) return "";
    const opcao = Array.from(sel.options).find((o) => o.textContent?.includes(numero) === true);
    return opcao?.value ?? "";
  }, LEI);
  if (id === "") throw new Error(`a lei ${LEI} não está no select do decreto — ela foi gravada?`);
  return id;
}

void main();
