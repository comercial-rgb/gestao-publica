import type { Page } from "puppeteer";

/**
 * O QUE OS PERCURSOS LEEM DA BARRA DE AÇÕES DESDE A V6.2 (PROD-015) — um lugar só.
 *
 * A barra passou a projetar DISPONIBILIDADE: ato que não cabe mais sai da barra; ato com
 * pré-condição aparece travado e sem formulário. As negativas que os percursos provavam
 * ENVIANDO o formulário (e lendo a recusa) passam a ser provadas em duas partes:
 *
 *   1. a TELA apresenta o ato como travado ou fora do estado, COM o motivo — `apresentacaoDoAto`;
 *   2. o SERVIDOR continua recusando a chamada direta — provada por uma aba aberta ANTES do fato,
 *      que envia depois: primeiro com a versão (a porta recusa `REGISTRO-MUDOU`) e depois sem ela
 *      (`retirarVersao`, a forma de uma chamada que não veio da tela), quando é o caso de uso que
 *      recusa com o motivo do estado.
 *
 * ⚠️ `PERCURSOS-SEM-HELPER-COMUM` já custou cinco cópias divergentes de `preencherEEnviar`. Este
 * arquivo não repete aquele: ele não envia nada, só lê a apresentação e mexe na versão.
 */

export type EstadoDoAtoNaTela = "formulario" | "bloqueada" | "nao-aplicavel" | "em-processamento" | "sem-permissao" | "ausente";

export async function apresentacaoDoAto(page: Page, nome: string): Promise<{ readonly estado: EstadoDoAtoNaTela; readonly texto: string }> {
  return page.evaluate((n) => {
    const limpo = (el: Element | null): string => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
    if (document.querySelector(`form[data-acao="${n}"]`) !== null) return { estado: "formulario" as const, texto: "" };
    const secao = document.querySelector(`section[data-acao="${n}"][data-acao-estado]`);
    if (secao !== null) return { estado: (secao.getAttribute("data-acao-estado") ?? "ausente") as "bloqueada", texto: limpo(secao) };
    const item = document.querySelector(`[data-acao-estado="nao-aplicavel"][data-acao-nome="${n}"]`);
    if (item !== null) return { estado: "nao-aplicavel" as const, texto: limpo(item) };
    const receber = document.querySelector(`p[data-acao="${n}"][data-acao-estado]`);
    if (receber !== null) return { estado: (receber.getAttribute("data-acao-estado") ?? "ausente") as "bloqueada", texto: limpo(receber) };
    return { estado: "ausente" as const, texto: "" };
  }, nome);
}

/** Retira a versão do formulário — a forma de um envio que não veio da tela lida. `false` = não havia. */
export async function retirarVersao(page: Page, nome: string): Promise<boolean> {
  return page.evaluate((n) => {
    const v = document.querySelector(`form[data-acao="${n}"] input[name="__versao"]`);
    if (v === null) return false;
    v.remove();
    return true;
  }, nome);
}
