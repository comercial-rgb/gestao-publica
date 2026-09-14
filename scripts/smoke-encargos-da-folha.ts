import "dotenv/config";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { apresentacaoDoAto } from "./percursos-disponibilidade.js";
import { buscarJson, entrar, hrefDoRegistro, irPara, preencherEEnviar, registroDePassos, sair, texto, type Navegador } from "./percursos-navegador.js";

/**
 * PERCURSO — OS ENCARGOS DO EMPREGADOR SOBRE UMA FOLHA JÁ FECHADA E ATESTADA (M33, V6.2 U1).
 *
 * Seis papéis, nenhum faz o ato do outro:
 *   admin (cadastra componente e versão) → aprovador (aprova a versão; o admin é barrado) →
 *   contabilidade (grupos dos encargos, APURA, empenha; o grupo apontado para a ficha SEM CRÉDITO criada
 *   pela tela para, dizendo onde) → admin (designa para certificar os ENCARGOS) → atestador (certifica
 *   os encargos; antes da designação própria, é travado — a designação da folha salarial não serve) →
 *   liquidante (liquida) → servidora (não baixa o resumo da folha do ente) e sessão ausente.
 *
 * ⚠️ A FOLHA É UMA FOLHA JÁ FECHADA, CERTIFICADA E LIQUIDADA NO SALÁRIO (`ENCARGOS_COMPETENCIA`,
 * padrão 2026-12): é o caso do LEGADO do pedido — a apuração nasce COMPLEMENTAR, e o percurso confere
 * que a folha salarial não muda.
 *
 * ⚠️ PARÂMETROS SINTÉTICOS: 20% e 0,1%, marcados como perfil de teste. Não afirmam alíquota oficial.
 * ⚠️ AS CONTAS SÃO ESCOLHIDAS PELO CÓDIGO E PELO NOME DO PLANO, com o motivo, nunca pela posição:
 *    VPD 3.1.2.2.1.01.00 (contribuições previdenciárias — RGPS) para a cota patronal, 3.1.2.2.1.03.00
 *    (seguro de acidente no trabalho) para o RAT, obrigação 2.1.1.4.1.01.01 (contribuições ao RGPS
 *    sobre salários). No ente de verdade quem escolhe é o contador.
 * ⚠️ O QUE ELE NÃO PROVA: a ficha sem crédito recebendo crédito pela tela. A única lei de crédito do
 *    banco dos percursos está com o teto esgotado e a LEI não tem tela (pendência anterior). A retomada
 *    depois do crédito está provada em m33-encargos.test.ts ("RETOMADA POR GRUPO").
 */
const N: Navegador = { base: process.argv[2] ?? "http://localhost:3010" };
const SENHA = process.env["PERCURSOS_SENHA_PAPEIS"] ?? "Percurso#2026";
const ADMIN = process.env["SEED_IDENTIDADE"] ?? "admin@cg.pb.gov.br";
const SENHA_ADMIN = process.env["SEED_ADMIN_SENHA"] ?? "";
const APROVADOR = "aprovador-encargos@percursos.local";
const CONTABILIDADE = "contabilidade@percursos.local";
const ATESTADOR = "atestador@percursos.local";
const LIQUIDANTE = "liquidante@percursos.local";
const SERVIDOR = "servidor@percursos.local";
const COMP = process.env["ENCARGOS_COMPETENCIA"] ?? "2026-12";
const FICHA_SEM_CREDITO = process.env["ENCARGOS_FICHA_SEM_CREDITO"] ?? "32260";
const SUF = String(Date.now()).slice(-5);
const PATR = `PATR-${SUF}`;
const RAT = `RAT-${SUF}`;
const R = registroDePassos();
const hoje = (): string => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(new Date());

async function opcaoPorTexto(page: Page, seletor: string, trecho: string): Promise<string | null> {
  return page.evaluate((sel, t) => {
    const s = document.querySelector(sel) as HTMLSelectElement | null;
    const o = Array.from(s?.options ?? []).find((x) => x.value !== "" && (x.textContent ?? "").includes(t));
    return o?.value ?? null;
  }, seletor, trecho);
}

async function marcarRubricas(page: Page, form: string, codigos: readonly string[]): Promise<number> {
  return page.evaluate((f, cods) => {
    let n = 0;
    for (const label of Array.from(document.querySelectorAll(`${f} fieldset label`))) {
      const cx = label.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      if (cx === null) continue;
      if (cods.some((c) => (label.textContent ?? "").trim().startsWith(`${c} —`))) {
        cx.checked = true;
        n += 1;
      }
    }
    return n;
  }, form, codigos);
}

async function main(): Promise<void> {
  let navegador: Browser | undefined;
  try {
    navegador = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
    const page = await navegador.newPage();
    await page.setViewport({ width: 1366, height: 900 });

    // ══ 1. o administrador cadastra os componentes e as versões ══
    await entrar(N, page, ADMIN, SENHA_ADMIN);
    await irPara(N, page, `/folha/folhas?q=${COMP}`);
    const hrefFolha = await hrefDoRegistro(page, COMP);
    if (hrefFolha === null) throw new Error(`a folha ${COMP} não existe no banco dos percursos`);
    const antesSalario = await irPara(N, page, hrefFolha);
    const empenhosSalariaisAntes = await page.evaluate(() => document.querySelectorAll("[data-empenho]").length);
    R.conferir("1.0 a folha de partida está fechada e com o atesto salarial — o legado do pedido", antesSalario.includes("fechada") && antesSalario.includes("certificação (derivada)") && empenhosSalariaisAntes > 0, antesSalario.slice(0, 400));

    for (const [codigo, tipo, descricao] of [[PATR, "PREVIDENCIA_PATRONAL", "Cota patronal RGPS (percurso SINTÉTICO)"], [RAT, "RISCO_AMBIENTAL_DO_TRABALHO", "RAT (percurso SINTÉTICO)"]] as const) {
      await irPara(N, page, "/folha/encargos");
      const r = await preencherEEnviar(page, "criar-encargos-da-folha", [
        { sel: 'input[name="codigo"]', valor: codigo },
        { sel: 'input[name="descricao"]', valor: descricao },
        { sel: 'select[name="tipo"]', valor: tipo, tipo: "select" },
        { sel: 'select[name="regime"]', valor: "RGPS", tipo: "select" },
      ]);
      R.conferir(`1.1 componente ${codigo} cadastrado pela tela`, r.tipo === "ok", `${r.tipo}: ${r.texto.slice(0, 200)}`);
    }
    const lista = await irPara(N, page, `/folha/encargos?q=${SUF}`);
    R.conferir("1.2 a lista mostra os dois, SEM versão aprovada — nada calcula ainda", lista.includes(PATR.toLowerCase()) && lista.includes(RAT.toLowerCase()) && lista.includes("nenhuma aprovada"), lista.slice(0, 500));
    const hrefs: Record<string, string> = {};
    for (const [codigo, percentual] of [[PATR, "20"], [RAT, "0,1"]] as const) {
      await irPara(N, page, `/folha/encargos?q=${codigo}`);
      const href = await hrefDoRegistro(page, codigo);
      if (href === null) throw new Error(`sem link para ${codigo}`);
      hrefs[codigo] = href;
      await irPara(N, page, href);
      const marcadas = await marcarRubricas(page, 'form[data-acao="nova-versao-do-encargo"]', ["VENC", "HEXT"]);
      const r = await preencherEEnviar(page, "nova-versao-do-encargo", [
        { sel: 'input[name="competenciaInicio"]', valor: "2026-01" },
        { sel: 'input[name="percentual"]', valor: percentual },
        { sel: 'input[name="fundamentacaoLegal"]', valor: "Perfil SINTÉTICO do percurso — sem validade normativa" },
        { sel: 'input[name="sintetica"]', valor: "sim", tipo: "marcar" },
      ]);
      R.conferir(`1.3 versão de ${codigo} (${percentual}%, base VENC+HEXT, sintética) cadastrada — e AGUARDANDO APROVAÇÃO`, marcadas === 2 && r.tipo === "ok" && /AGUARDANDO APROVAÇÃO/.test(r.texto), `marcadas=${marcadas} ${r.tipo}: ${r.texto.slice(0, 200)}`);
    }
    await irPara(N, page, hrefs[PATR] as string);
    const adminAprovar = await apresentacaoDoAto(page, "aprovar-versao");
    R.conferir("1.4 NEGATIVA: quem cadastrou (admin) não tem como aprovar — a tela diz que falta a permissão, sem formulário", adminAprovar.estado !== "formulario" && (await texto(page)).includes("não tem a permissão necessária para aprovar uma versão"), JSON.stringify(adminAprovar));

    // ══ 2. o aprovador aprova ══
    await sair(N, page);
    await entrar(N, page, APROVADOR, SENHA);
    for (const codigo of [PATR, RAT]) {
      await irPara(N, page, hrefs[codigo] as string);
      const versao = await page.$eval('form[data-acao="aprovar-versao"] select[name="versaoId"]', (s) => Array.from((s as HTMLSelectElement).options).find((o) => o.value !== "")?.value ?? "");
      const r = await preencherEEnviar(page, "aprovar-versao", [{ sel: 'select[name="versaoId"]', valor: versao, tipo: "select" }, { sel: 'input[name="motivo"]', valor: "conferido contra o perfil sintético do percurso" }]);
      R.conferir(`2.1 o aprovador aprova a versão de ${codigo} — e a mensagem diz que apurações já gravadas não mudam`, r.tipo === "ok" && /APROVADA/.test(r.texto) && /NÃO mudam/.test(r.texto), `${r.tipo}: ${r.texto.slice(0, 220)}`);
    }
    const aprovados = await irPara(N, page, `/folha/encargos?q=${SUF}`);
    R.conferir("2.2 recarregada, a lista mostra as duas versões vigentes com o aviso SINTÉTICA", (aprovados.match(/sintética/g) ?? []).length >= 2 && !aprovados.includes("nenhuma aprovada"), aprovados.slice(0, 500));

    // ══ 3. a contabilidade cadastra os grupos, apura e empenha ══
    await sair(N, page);
    await entrar(N, page, CONTABILIDADE, SENHA);
    const fichaComCredito = "3102 —";
    for (const [codigo, ficha, vpd] of [[`ENC-A-${PATR}`, fichaComCredito, "3.1.2.2.1.01.00"], [`ENC-B-${RAT}`, `${FICHA_SEM_CREDITO} —`, "3.1.2.2.1.03.00"]] as const) {
      await irPara(N, page, "/folha/grupos-de-empenho");
      const form = 'form[data-acao="criar-grupo-dos-encargos"]';
      const [fichaId, vpdId, obrId, credorId] = await Promise.all([
        opcaoPorTexto(page, `${form} select[name="fichaId"]`, ficha),
        opcaoPorTexto(page, `${form} select[name="contaVariacaoId"]`, vpd),
        opcaoPorTexto(page, `${form} select[name="contaObrigacaoId"]`, "2.1.1.4.1.01.01"),
        opcaoPorTexto(page, `${form} select[name="credorId"]`, "/"),
      ]);
      if ([fichaId, vpdId, obrId, credorId].includes(null)) {
        R.falhou(`3.1 grupo ${codigo}`, `faltou opção: ficha=${fichaId} vpd=${vpdId} obrigação=${obrId} credor=${credorId}`);
        continue;
      }
      const componente = codigo.endsWith(PATR) ? PATR : RAT;
      const marcou = await page.evaluate((f, c) => {
        const label = Array.from(document.querySelectorAll(`${f} fieldset label`)).find((l) => (l.textContent ?? "").trim().startsWith(`${c} —`));
        const cx = label?.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
        if (cx === null || cx === undefined) return false;
        cx.checked = true;
        return true;
      }, form, componente);
      const r = await preencherEEnviar(page, form, [
        { sel: 'input[name="codigo"]', valor: codigo },
        { sel: 'input[name="descricao"]', valor: `Encargos ${componente} (percurso sintético)` },
        { sel: 'input[name="serie"]', valor: codigo.startsWith("ENC-A") ? "EA" : "EB" },
        { sel: 'select[name="fichaId"]', valor: fichaId as string, tipo: "select" },
        { sel: 'select[name="credorId"]', valor: credorId as string, tipo: "select" },
        { sel: 'select[name="contaVariacaoId"]', valor: vpdId as string, tipo: "select" },
        { sel: 'select[name="contaObrigacaoId"]', valor: obrId as string, tipo: "select" },
      ]);
      R.conferir(`3.1 grupo dos encargos ${codigo} cadastrado (ficha ${ficha.trim()}, VPD ${vpd}, obrigação 2.1.1.4.1.01.01)`, marcou && r.tipo === "ok", `marcou=${marcou} ${r.tipo}: ${r.texto.slice(0, 220)}`);
    }

    await irPara(N, page, hrefFolha);
    const rApurar = await preencherEEnviar(page, "apurar-encargos", [{ sel: 'input[name="motivo"]', valor: `apuração complementar do percurso ${SUF}` }]);
    R.conferir("3.2 a contabilidade APURA: a mensagem diz COMPLEMENTAR e que o contracheque não mudou", rApurar.tipo === "ok" && /COMPLEMENTAR/.test(rApurar.texto) && /contracheque não mudou/.test(rApurar.texto), `${rApurar.tipo}: ${rApurar.texto.slice(0, 400)}`);
    const painel = await irPara(N, page, hrefFolha);
    const nApuracao = /encargos do empregador — apuração nº (\d+)/.exec(painel)?.[1] ?? "?";
    R.conferir("3.3 o painel mostra a apuração COMPLEMENTAR, com universo, componentes e o aviso SINTÉTICA", (await page.$('[data-encargos="apurados"][data-complementar="sim"]')) !== null && (await page.$(`[data-componente="${PATR}"]`)) !== null && painel.includes("universo esperado") && painel.includes("sintética"), painel.slice(0, 900));
    const incompleta = (await page.$('[data-encargos="apurados"][data-completa="nao"]')) !== null;
    if (incompleta) console.log("      [a apuração ficou INCOMPLETA: há componente de execução anterior sem versão aprovada — o percurso segue e prova a trava]");
    R.conferir("3.4 a folha salarial NÃO mudou: os mesmos empenhos salariais e o atesto salarial continua", (await page.evaluate(() => document.querySelectorAll("[data-empenho]").length)) === empenhosSalariaisAntes && painel.includes("certificação (derivada)"), "a folha salarial mudou");
    R.conferir("3.5 NEGATIVA: quem apurou não vê CERTIFICAR os encargos como formulário", (await apresentacaoDoAto(page, "certificar-encargos")).estado !== "formulario", JSON.stringify(await apresentacaoDoAto(page, "certificar-encargos")));

    const idFolha = hrefFolha.split("/").pop() ?? "";
    const csv = await page.evaluate(async (u) => (await fetch(u)).text(), `${N.base}/folha/folhas/${idFolha}/resumo?formato=csv`);
    R.conferir("3.6 o resumo CSV da mesma folha traz bruto, descontos, líquido e patronal lado a lado, com o total", csv.includes("Bruto;Descontos;Líquido;Patronal (ente)") && /TOTAL;;\d+;[\d.]+,\d{2};[\d.]+,\d{2};[\d.]+,\d{2};[\d.]+,\d{2}/.test(csv), csv.slice(0, 300));

    if (!incompleta) {
      await irPara(N, page, hrefFolha);
      const rEmp = await preencherEEnviar(page, "apropriar-encargos", [{ sel: 'input[name="dataDoEmpenho"]', valor: hoje(), tipo: "data" }]);
      R.conferir("3.7 empenhar: o grupo com crédito é empenhado e o grupo da ficha SEM CRÉDITO (criada pela tela) PARA, dizendo onde e por quê", rEmp.tipo === "erro" && /EMPENHO-DOS-ENCARGOS-INTERROMPIDO: 1 empenho/.test(rEmp.texto) && rEmp.texto.includes(`ENC-B-${RAT}`) && /[Ss]aldo/.test(rEmp.texto), `${rEmp.tipo}: ${rEmp.texto.slice(0, 400)}`);
      const depoisEmp = await irPara(N, page, hrefFolha);
      R.conferir("3.8 recarregada: UM empenho de encargos, com link para a despesa, e o empenhar continua OFERECIDO (há grupo pendente)", (await page.$$("[data-empenho-dos-encargos]")).length === 1 && (await apresentacaoDoAto(page, "apropriar-encargos")).estado === "formulario", depoisEmp.slice(0, 600));
    }

    // ══ 4. o atesto dos encargos: travado sem a designação PRÓPRIA; o admin designa; o atestador certifica ══
    await sair(N, page);
    await entrar(N, page, ATESTADOR, SENHA);
    await irPara(N, page, hrefFolha);
    const semDesig = await apresentacaoDoAto(page, "certificar-encargos");
    R.conferir("4.1 NEGATIVA: sem designação para os ENCARGOS, certificar aparece travado — a designação da folha salarial não serve", incompleta ? semDesig.estado === "bloqueada" : semDesig.estado === "bloqueada" && /designação vigente/i.test(semDesig.texto), JSON.stringify(semDesig));
    await sair(N, page);
    await entrar(N, page, ADMIN, SENHA_ADMIN);
    await irPara(N, page, "/folha/designacoes");
    const pessoa = await opcaoPorTexto(page, 'form[data-acao="criar-designacoes"] select[name="usuarioIdentificador"]', ATESTADOR);
    const pessoaId = await page.evaluate((u) => {
      const s = document.querySelector('form[data-acao="criar-designacoes"] select[name="usuarioIdentificador"]') as HTMLSelectElement | null;
      const rotulo = Array.from(s?.options ?? []).find((o) => o.value === u)?.textContent ?? "";
      const nome = rotulo.split(" — ")[1] ?? "";
      const p = document.querySelector('form[data-acao="criar-designacoes"] select[name="pessoaId"]') as HTMLSelectElement | null;
      return Array.from(p?.options ?? []).find((o) => nome !== "" && (o.textContent ?? "").startsWith(nome))?.value ?? "";
    }, pessoa ?? "");
    const rDesig = await preencherEEnviar(page, "criar-designacoes", [
      { sel: 'select[name="atribuicao"]', valor: "CERTIFICAR_ENCARGOS_DA_FOLHA", tipo: "select" },
      { sel: 'select[name="pessoaId"]', valor: pessoaId, tipo: "select" },
      { sel: 'select[name="usuarioIdentificador"]', valor: pessoa ?? "", tipo: "select" },
      { sel: 'input[name="atoDesignacao"]', valor: `Portaria ${SUF}/2026 — encargos (percurso sintético)` },
      { sel: 'input[name="vigenciaInicio"]', valor: hoje(), tipo: "data" },
    ]);
    R.conferir("4.2 o administrador designa a atestadora para os ENCARGOS, com o ato próprio", rDesig.tipo === "ok", `${rDesig.tipo}: ${rDesig.texto.slice(0, 220)}`);

    await sair(N, page);
    await entrar(N, page, ATESTADOR, SENHA);
    await irPara(N, page, hrefFolha);
    if (incompleta) {
      const trava = await apresentacaoDoAto(page, "certificar-encargos");
      R.conferir("4.3 apuração INCOMPLETA: certificar os encargos continua travado, nomeando o componente sem parâmetro", trava.estado === "bloqueada" && /incompleta|sem parâmetro/i.test(trava.texto), JSON.stringify(trava));
    } else {
      const rCert = await preencherEEnviar(page, "certificar-encargos", [{ sel: 'input[name="data"]', valor: hoje(), tipo: "data" }]);
      R.conferir("4.3 a atestadora CERTIFICA os encargos: a mensagem traz a apuração, o responsável e o sha256", rCert.tipo === "ok" && new RegExp(`apuração nº ${nApuracao}`).test(rCert.texto) && /sha256/.test(rCert.texto), `${rCert.tipo}: ${rCert.texto.slice(0, 300)}`);
      await irPara(N, page, hrefFolha);
      R.conferir("4.4 recarregada: o painel diz CERTIFICADA e certificar sai da barra", (await page.$('[data-atesto-dos-encargos="CERTIFICADA"]')) !== null && (await apresentacaoDoAto(page, "certificar-encargos")).estado === "nao-aplicavel", "estado do atesto não mudou na tela");

      // ══ 5. o liquidante liquida ══
      await sair(N, page);
      await entrar(N, page, LIQUIDANTE, SENHA);
      await irPara(N, page, hrefFolha);
      const rLiq = await preencherEEnviar(page, "liquidar-encargos", [{ sel: 'input[name="data"]', valor: hoje(), tipo: "data" }]);
      R.conferir("5.1 o liquidante LIQUIDA o empenho dos encargos — e a mensagem diz que liquidar não é recolher", rLiq.tipo === "ok" && /1 liquidação\(ões\) de encargos/.test(rLiq.texto) && /não é recolher/.test(rLiq.texto), `${rLiq.tipo}: ${rLiq.texto.slice(0, 300)}`);
      await irPara(N, page, hrefFolha);
      R.conferir("5.2 recarregada: o empenho dos encargos aparece LIQUIDADO, e liquidar sai da barra", (await page.$('[data-empenho-dos-encargos][data-liquidacao="liquidado"]')) !== null && (await apresentacaoDoAto(page, "liquidar-encargos")).estado === "nao-aplicavel", "liquidação não refletida");
    }

    // ══ 6. negativas de acesso ══
    await sair(N, page);
    await entrar(N, page, SERVIDOR, SENHA);
    const alheio = await buscarJson(page, `${N.base}/folha/folhas/${idFolha}/resumo?formato=csv`);
    const corpoAlheio = JSON.stringify(alheio.corpo ?? "");
    R.conferir("6.1 NEGATIVA: a servidora do quadro não baixa o resumo da folha do ente — recusa nomeando a leitura, sem valor nenhum", alheio.status === 403 && /CONSULTAR_FOLHA/.test(corpoAlheio) && !/Patronal/.test(corpoAlheio), `${alheio.status} ${corpoAlheio.slice(0, 200)}`);
    await sair(N, page);
    const anonimo = await page.goto(`${N.base}/folha/folhas/${idFolha}/resumo?formato=csv`, { waitUntil: "domcontentloaded" });
    R.conferir("6.2 NEGATIVA: sem sessão, o resumo leva ao login — nenhum CSV", page.url().includes("/login") && !(await texto(page)).includes("patronal (ente)"), `${anonimo?.status()} ${page.url()}`);
  } catch (e) {
    R.falhou("execução", e instanceof Error ? e.message : String(e));
  } finally {
    await navegador?.close();
  }
  R.encerrar();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
