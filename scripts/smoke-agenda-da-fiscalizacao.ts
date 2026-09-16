import "dotenv/config";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Browser, Page } from "puppeteer";
import { diaCivil } from "../packages/datas/index.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, registroDePassos, sair, texto, type Navegador } from "./percursos-navegador.js";

/**
 * PERCURSO — A AGENDA DA FISCALIZAÇÃO E OS FORMULÁRIOS DE OCORRÊNCIA (V7 M2 U8), POR PAPÉIS.
 *
 * Preparação declarada: `scripts/preparar-ponte-contratual.ts` (contrato com gestora, fiscal e recebedor designados).
 * Nada da agenda, dos tipos ou das ocorrências é preparado escondido — tudo pela tela.
 *
 *   1. a configuração da fiscalização cadastra o tipo de ocorrência do ente e publica a versão 1 do formulário;
 *   2. a gestora programa duas fiscalizações com horário, duração e local, e a agenda aponta o conflito de horário;
 *   3. as três vistas (dia, semana, mês) mostram os mesmos compromissos; a troca de dia leva o compromisso com ela;
 *   4. a gestora reagenda com motivo (o compromisso sai do dia) e cancela o outro;
 *   5. o fiscal registra a realização do reagendado e, no contrato, a ocorrência com o formulário do tipo — o
 *      obrigatório é cobrado, o formulário mantém o que foi digitado na recusa, e a resposta fica presa à versão;
 *   6. publicada a versão 2, o histórico continua na versão 1; o tipo desativado sai da lista de quem vai preencher;
 *   7. NEGATIVAS: outro setor não recebe os formulários da agenda nem dos tipos; quem não alcança contrato nenhum vê a
 *      agenda vazia com o motivo, não a agenda dos outros.
 */
const N: Navegador = { base: process.argv[2] ?? "http://localhost:3010" };
const SENHA = process.env["PERCURSOS_SENHA_PAPEIS"] ?? "Percurso#2026";
const CONFIG = "configuracao-fiscalizacao@percursos.local";
const GESTORA = "gestora-contrato@percursos.local";
const FISCAL = "fiscal-contrato@percursos.local";
const OUTRO = "outro-setor-contrato@percursos.local";
const R = registroDePassos();
const CAPTURAS = process.env["PERCURSO_CAPTURAS"] ?? join(process.cwd(), ".registro-de-execucao", "pacote-v7-m2", "capturas");
const dia = (d: number): string => diaCivil(new Date(Date.now() + d * 86_400_000));
const HOJE = dia(0);

interface Ponte { readonly sufixo: string; readonly contratoId: string; readonly contrato: string }
const PONTE: Ponte = JSON.parse(process.env["PONTE_JSON"] ?? "null") as Ponte;

async function capturar(page: Page, nome: string): Promise<void> {
  mkdirSync(CAPTURAS, { recursive: true });
  await page.screenshot({ path: join(CAPTURAS, `agenda-${nome}.png`), fullPage: true });
}

async function opcao(page: Page, select: string, trecho: string): Promise<string> {
  return page.$$eval(`${select} option`, (os, t) => (os.find((o) => (o.textContent ?? "").includes(t as string)) as HTMLOptionElement | undefined)?.value ?? "", trecho);
}

const AGENDA = (vista: string, d: string): string => `/licitacoes/fiscalizacao/agenda?vista=${vista}&dia=${d}`;

async function main(): Promise<void> {
  if (PONTE === null) {
    R.falhou("preparação", "PONTE_JSON ausente: rode scripts/preparar-ponte-contratual.ts no banco descartável antes");
    R.encerrar();
    return;
  }
  let navegador: Browser | undefined;
  const SUF = PONTE.sufixo;
  const hrefContrato = `/licitacoes/contratos/${PONTE.contratoId}`;
  const CODIGO = `ATRASO-${SUF}`;
  try {
    navegador = await lancarNavegadorDoPercurso();
    const page = await navegador.newPage();
    page.setDefaultTimeout(120000);
    await page.setViewport({ width: 1366, height: 900 });
    console.log(`      [contrato ${PONTE.contrato} · banco ${process.env["PERCURSO_BANCO"] ?? "não declarado"}]`);

    // ══ 1. a configuração: tipo do ente e versão 1 do formulário ══
    await entrar(N, page, CONFIG, SENHA);
    await irPara(N, page, "/licitacoes/fiscalizacao/tipos-de-ocorrencia");
    const cad = await preencherEEnviar(page, "cadastrar-tipo-de-ocorrencia", [
      { sel: 'input[name="codigo"]', valor: CODIGO }, { sel: 'input[name="nome"]', valor: `Atraso na execução (percurso ${SUF})` }, { sel: 'select[name="natureza"]', valor: "ATRASO", tipo: "select" },
    ]);
    R.conferir("1.1 a configuração cadastra o tipo de ocorrência do ente, ativo e sem formulário", cad.tipo === "ok" && /cadastrado e ativo/.test(cad.texto), `${cad.tipo}: ${cad.texto.slice(0, 200)}`);
    await irPara(N, page, "/licitacoes/fiscalizacao/tipos-de-ocorrencia");
    const pub = await preencherEEnviar(page, `publicar-versao-${CODIGO}`, [
      { sel: 'input[name="vigenciaInicio"]', valor: dia(-1), tipo: "data" },
      { sel: 'select[name="exigeGravidade"]', valor: "sim", tipo: "select" },
      { sel: 'select[name="encaminhamentoPadrao"]', valor: "GESTOR", tipo: "select" },
      { sel: 'input[name="motivo"]', valor: "Formulário aprovado pela fiscalização" },
      { sel: 'input[name="pergunta.0.codigo"]', valor: "local" }, { sel: 'input[name="pergunta.0.rotulo"]', valor: "Onde foi constatado" }, { sel: 'select[name="pergunta.0.obrigatoria"]', valor: "sim", tipo: "select" },
      { sel: 'input[name="pergunta.1.codigo"]', valor: "dias" }, { sel: 'input[name="pergunta.1.rotulo"]', valor: "Quantos dias de atraso" }, { sel: 'select[name="pergunta.1.tipo"]', valor: "NUMERO", tipo: "select" }, { sel: 'select[name="pergunta.1.obrigatoria"]', valor: "sim", tipo: "select" },
      { sel: 'input[name="pergunta.2.codigo"]', valor: "risco" }, { sel: 'input[name="pergunta.2.rotulo"]', valor: "Risco identificado" }, { sel: 'select[name="pergunta.2.tipo"]', valor: "OPCAO", tipo: "select" }, { sel: 'input[name="pergunta.2.opcoes"]', valor: "Nenhum; Ambiental; Segurança do trabalho" },
    ]);
    R.conferir("1.2 publica a versão 1 do formulário com três perguntas", pub.tipo === "ok" && /Versão 1 do formulário publicada com 3 pergunta/.test(pub.texto), `${pub.tipo}: ${pub.texto.slice(0, 220)}`);
    await irPara(N, page, "/licitacoes/fiscalizacao/tipos-de-ocorrencia");
    R.conferir("1.3 a tela mostra o tipo ativo com as perguntas da versão vigente", (await page.$(`[data-perguntas-do-tipo="${CODIGO}"]`)) !== null && (await texto(page)).includes("quantos dias de atraso"), (await texto(page)).slice(0, 240));
    await capturar(page, "tipos");
    await sair(N, page);

    // ══ 2–4. a gestora: programa, vê o conflito, reagenda e cancela ══
    await entrar(N, page, GESTORA, SENHA);
    await irPara(N, page, hrefContrato);
    const fiscal = await opcao(page, 'form[data-acao="programar-fiscalizacao"] select[name="fiscalDesignacaoId"]', `Fábio Fiscal Ponte ${SUF}`);
    const programar = (hora: string, objetivo: string) =>
      preencherEEnviar(page, "programar-fiscalizacao", [
        { sel: 'select[name="fiscalDesignacaoId"]', valor: fiscal, tipo: "select" }, { sel: 'input[name="dataPrevista"]', valor: HOJE, tipo: "data" },
        { sel: 'input[name="horaInicio"]', valor: hora, tipo: "data" }, { sel: 'input[name="duracaoMinutos"]', valor: "90" }, { sel: 'input[name="local"]', valor: "Unidade básica de saúde central" },
        { sel: 'textarea[name="objetivo"]', valor: objetivo },
      ]);
    const p1 = await programar("09:00", `Visita de acompanhamento da execução (percurso ${SUF})`);
    await irPara(N, page, hrefContrato);
    const p2 = await programar("10:00", `Conferência do relatório mensal (percurso ${SUF})`);
    R.conferir("2.1 a gestora programa duas fiscalizações com horário, duração e local", p1.tipo === "ok" && p2.tipo === "ok" && /às 09:00/.test(p1.texto) && /aparece na agenda/.test(p1.texto), `${p1.tipo}/${p2.tipo}: ${p1.texto.slice(0, 160)}`);
    await irPara(N, page, AGENDA("dia", HOJE));
    const doDia = await page.$$eval("[data-compromisso]", (ls) => ls.map((l) => (l.textContent ?? "").replace(/\s+/g, " ").trim()));
    R.conferir("2.2 a agenda do dia mostra os dois, com horário, e aponta o conflito de horário do mesmo fiscal", doDia.length === 2 && doDia.every((t) => /09:00|10:00/.test(t)) && doDia.some((t) => /horário cruza com a nº/.test(t)), doDia.join(" | ").slice(0, 300));
    await capturar(page, "dia");
    await irPara(N, page, AGENDA("semana", HOJE));
    const daSemana = await page.$$eval("[data-compromisso]", (ls) => ls.length);
    await irPara(N, page, AGENDA("mes", HOJE));
    const doMes = await page.$$eval("[data-compromisso]", (ls) => ls.length);
    R.conferir("3.1 semana e mês mostram os MESMOS compromissos do dia", daSemana === 2 && doMes === 2, `semana=${daSemana} mes=${doMes}`);
    await capturar(page, "mes");
    await irPara(N, page, AGENDA("dia", HOJE));
    const rea = await preencherEEnviar(page, "reagendar-fiscalizacao-1", [
      { sel: 'input[name="dataPrevista"]', valor: dia(2), tipo: "data" }, { sel: 'input[name="horaInicio"]', valor: "14:00", tipo: "data" }, { sel: 'input[name="duracaoMinutos"]', valor: "60" },
      { sel: 'input[name="local"]', valor: "Almoxarifado central" }, { sel: 'textarea[name="motivo"]', valor: "Responsável da unidade em licença" },
    ]);
    R.conferir("4.1 a gestora reagenda a nº 1 com motivo", rea.tipo === "ok" && /reagendada para/.test(rea.texto), `${rea.tipo}: ${rea.texto.slice(0, 200)}`);
    await irPara(N, page, AGENDA("dia", HOJE));
    const sobrou = await page.$$eval("[data-compromisso]", (ls) => ls.map((l) => l.getAttribute("data-compromisso")));
    await irPara(N, page, AGENDA("dia", dia(2)));
    const noNovoDia = await texto(page);
    R.conferir("4.2 reagendada, ela sai do dia de hoje e aparece no novo dia, com o histórico e o motivo", sobrou.length === 1 && sobrou[0] === "2" && /14:00/.test(noNovoDia) && /responsável da unidade em licença/.test(noNovoDia) && /reagendada/.test(noNovoDia), `hoje=${sobrou.join(",")} novo=${noNovoDia.slice(0, 200)}`);
    await irPara(N, page, AGENDA("dia", HOJE));
    const canc = await preencherEEnviar(page, "cancelar-fiscalizacao-2", [{ sel: 'textarea[name="motivo"]', valor: "Serviço suspenso pela administração" }]);
    await irPara(N, page, AGENDA("dia", HOJE));
    R.conferir("4.3 a gestora cancela a nº 2: ela fica no histórico, com o motivo, e sem formulários", canc.tipo === "ok" && (await texto(page)).includes("cancelada") && (await page.$('form[data-acao="reagendar-fiscalizacao-2"]')) === null, `${canc.tipo}: ${canc.texto.slice(0, 160)}`);
    await sair(N, page);

    // ══ 5. o fiscal: realização e ocorrência com o formulário ══
    await entrar(N, page, FISCAL, SENHA);
    await irPara(N, page, AGENDA("dia", dia(2)));
    const real = await preencherEEnviar(page, "realizar-fiscalizacao-1", [
      { sel: 'input[name="data"]', valor: HOJE, tipo: "data" }, { sel: 'input[name="horaInicio"]', valor: "14:05", tipo: "data" }, { sel: 'input[name="horaFim"]', valor: "15:30", tipo: "data" },
      { sel: 'textarea[name="relato"]', valor: "Visita feita com o responsável do almoxarifado" },
    ]);
    R.conferir("5.1 o fiscal registra a realização: a fiscalização fica REALIZADA e não se reagenda mais", real.tipo === "ok" && /Realização da fiscalização nº 1 registrada/.test(real.texto), `${real.tipo}: ${real.texto.slice(0, 200)}`);
    await irPara(N, page, AGENDA("dia", dia(2)));
    R.conferir("5.2 recarregada, a agenda mostra a realização e não oferece reagendar nem cancelar", (await page.$("[data-realizacao-do-compromisso]")) !== null && (await page.$('form[data-acao="reagendar-fiscalizacao-1"]')) === null, (await texto(page)).slice(0, 200));
    await irPara(N, page, hrefContrato);
    const tipoOpcao = await opcao(page, 'form[data-acao="registrar-ocorrencia"] select[name="tipoConfigurado"]', CODIGO);
    const semObrigatoria = await preencherEEnviar(page, "registrar-ocorrencia", [
      { sel: 'input[name="data"]', valor: HOJE, tipo: "data" }, { sel: 'select[name="tipo"]', valor: "ATRASO", tipo: "select" },
      { sel: 'textarea[name="descricao"]', valor: "Serviço parado na frente norte da unidade" },
      { sel: 'select[name="tipoConfigurado"]', valor: tipoOpcao, tipo: "select" },
      { sel: 'select[name="gravidade"]', valor: "ALTA", tipo: "select" },
      { sel: 'input[name^="resposta."]', valor: "Frente norte", indice: 0 },
    ]);
    const mantido = await page.$eval('form[data-acao="registrar-ocorrencia"] textarea[name="descricao"]', (e) => (e as HTMLTextAreaElement).value).catch(() => "");
    R.conferir("5.3 NEGATIVA: a pergunta obrigatória do formulário é cobrada, e o formulário mantém o que foi digitado", semObrigatoria.tipo === "erro" && /PERGUNTA-OBRIGATORIA-SEM-RESPOSTA/.test(semObrigatoria.texto) && mantido === "Serviço parado na frente norte da unidade", `${semObrigatoria.tipo}: ${semObrigatoria.texto.slice(0, 200)} mantido=${mantido.slice(0, 40)}`);
    const comFormulario = await preencherEEnviar(page, "registrar-ocorrencia", [
      { sel: 'input[name="data"]', valor: HOJE, tipo: "data" }, { sel: 'select[name="tipo"]', valor: "ATRASO", tipo: "select" },
      { sel: 'textarea[name="descricao"]', valor: "Serviço parado na frente norte da unidade" },
      { sel: 'select[name="tipoConfigurado"]', valor: tipoOpcao, tipo: "select" },
      { sel: 'select[name="gravidade"]', valor: "ALTA", tipo: "select" },
      { sel: 'input[name^="resposta."]', valor: "Frente norte", indice: 0 },
      { sel: 'input[name^="resposta."]', valor: "5", indice: 1 },
      { sel: 'select[name^="resposta."]', valor: "Segurança do trabalho", tipo: "select" },
    ]);
    R.conferir("5.4 a ocorrência grava com as três respostas do formulário e a gravidade", comFormulario.tipo === "ok" && /3 resposta\(s\) do formulário/.test(comFormulario.texto), `${comFormulario.tipo}: ${comFormulario.texto.slice(0, 220)}`);
    await capturar(page, "ocorrencia");
    await sair(N, page);

    // ══ 6. versão 2 e desativação: o histórico não se reinterpreta ══
    await entrar(N, page, CONFIG, SENHA);
    await irPara(N, page, "/licitacoes/fiscalizacao/tipos-de-ocorrencia");
    const pub2 = await preencherEEnviar(page, `publicar-versao-${CODIGO}`, [
      { sel: 'input[name="vigenciaInicio"]', valor: HOJE, tipo: "data" }, { sel: 'input[name="motivo"]', valor: "Formulário revisado pela fiscalização" },
      { sel: 'input[name="pergunta.0.codigo"]', valor: "resumo" }, { sel: 'input[name="pergunta.0.rotulo"]', valor: "Resumo do atraso" }, { sel: 'select[name="pergunta.0.obrigatoria"]', valor: "sim", tipo: "select" },
    ]);
    await irPara(N, page, "/licitacoes/fiscalizacao/tipos-de-ocorrencia");
    R.conferir("6.1 a versão 2 passa a valer, e a tela mostra as perguntas dela", pub2.tipo === "ok" && /Versão 2 do formulário publicada com 1 pergunta/.test(pub2.texto) && (await texto(page)).includes("resumo do atraso"), `${pub2.tipo}: ${pub2.texto.slice(0, 200)}`);
    const desat = await preencherEEnviar(page, `mudar-situacao-${CODIGO}`, [{ sel: 'input[name="motivo"]', valor: "Tipo substituído pelo novo fluxo de atraso" }]);
    R.conferir("6.2 desativado, o tipo sai de quem vai preencher — e as ocorrências anteriores continuam", desat.tipo === "ok" && /não é mais oferecido em ocorrência nova/.test(desat.texto), `${desat.tipo}: ${desat.texto.slice(0, 200)}`);
    await sair(N, page);
    await entrar(N, page, FISCAL, SENHA);
    await irPara(N, page, hrefContrato);
    const aindaLa = await texto(page);
    R.conferir("6.3 a ocorrência respondida continua no dossiê, e o tipo desativado não é mais oferecido", aindaLa.includes("serviço parado na frente norte") && (await page.$(`form[data-acao="registrar-ocorrencia"] option[value]:not([value=""])`)) !== null && (await opcao(page, 'form[data-acao="registrar-ocorrencia"] select[name="tipoConfigurado"]', CODIGO)) === "", aindaLa.slice(0, 200));
    await sair(N, page);

    // ══ 7. negativas de papel e de alcance ══
    await entrar(N, page, OUTRO, SENHA);
    await irPara(N, page, AGENDA("dia", dia(2)));
    R.conferir("7.1 NEGATIVA: quem não alcança contrato nenhum vê a agenda vazia com o motivo — não a agenda dos outros", (await page.$("[data-sem-alcance-na-agenda]")) !== null && (await page.$("[data-compromisso]")) === null, (await texto(page)).slice(0, 200));
    await irPara(N, page, "/licitacoes/fiscalizacao/tipos-de-ocorrencia");
    R.conferir("7.2 NEGATIVA: sem a ação de gerir tipos, a pessoa lê os tipos e não recebe formulário nenhum", (await page.$("[data-motivo-dos-tipos]")) !== null && (await page.$('form[data-acao="cadastrar-tipo-de-ocorrencia"]')) === null, (await texto(page)).slice(0, 200));
    await sair(N, page);
  } catch (e) {
    R.falhou("execução", e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e));
    if (navegador !== undefined) {
      const p = (await navegador.pages()).at(-1);
      if (p !== undefined) await capturar(p, "falha").catch(() => undefined);
    }
  } finally {
    await navegador?.close();
  }
  R.encerrar();
}

void main();
