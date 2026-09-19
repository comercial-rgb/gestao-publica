// @vitest-environment happy-dom

/**
 * O FORM DA LEI DE CRÉDITO (V11 V7.2) — o que ele PRECISA fazer, e o que ele não pode fazer.
 *
 * ═══ ⚠️ POR QUE ESTE ARQUIVO EXISTE ═══
 * O formulário é simples, e é justamente aí que mora o risco: três coisas dele falham EM
 * SILÊNCIO, e nenhuma delas aparece num typecheck.
 *
 *   (1) UM DEFAULT NO TIPO DE CRÉDITO. Se alguém puser `defaultValue="SUPLEMENTAR"` para
 *       "facilitar", a tela passa a escolher CLASSIFICAÇÃO CONTÁBIL no lugar do usuário — e o
 *       tipo decide em qual conta do PCASP o crédito entra (`5.2.2.1.2` é "dotação adicional POR
 *       TIPO DE CRÉDITO"). O erro sairia no balancete, não aqui.
 *
 *   (2) A CONFIRMAÇÃO DO ATO QUE SAI DA TELA. O formulário FECHA no sucesso; se a confirmação
 *       não existir fora dele, quem enviou lê silêncio — indistinguível de "não aconteceu" — e
 *       reenvia. Foi exatamente esse o defeito medido no irmão ao lado (o decreto gravava e a
 *       tela não dizia nada).
 *
 *   (3) RÓTULO EM TODO CAMPO. Campo sem rótulo é caixa muda para leitor de tela.
 *
 * ═══ POR QUE A SERVER ACTION É MOCKADA ═══
 * A ilha importa `./actions`, que é `"use server"` e puxa a porta → o Prisma. O que está sob
 * teste é a FIAÇÃO da tela, não a gravação (essa é do M03, contra o Postgres).
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const acao = vi.hoisted(() => ({ resposta: {} as { erro?: string; sucesso?: string } }));

// ⚠️ Antes do import do componente: a ilha importa `./actions`, que é "use server".
vi.mock("../../app/(areas)/planejamento/creditos-adicionais/actions", () => ({
  cadastrarLeiAction: async () => acao.resposta,
  cadastrarDecretoAction: async () => ({}),
  encerrarDecretoAction: async () => ({}),
}));

const { FormLeiCredito } = await import(
  "../../app/(areas)/planejamento/creditos-adicionais/FormLeiCredito"
);

afterEach(() => {
  acao.resposta = {};
  cleanup();
});

/** Abre o painel — a tela nasce fechada (divulgação progressiva). */
function abrir(): void {
  fireEvent.click(screen.getByRole("button", { name: "Cadastrar lei" }));
}

describe("o formulário da lei de crédito", () => {
  it("t1: nasce FECHADO, com o botão que o revela", () => {
    render(<FormLeiCredito exercicio={2026} />);
    expect(screen.getByRole("button", { name: "Cadastrar lei" })).toBeTruthy();
    expect(document.querySelector('form[data-acao="cadastrar-lei-de-credito"]')).toBeNull();
  });

  it("t2: aberto, TODO campo tem rótulo — nenhum é caixa muda", () => {
    render(<FormLeiCredito exercicio={2026} />);
    abrir();
    const form = document.querySelector('form[data-acao="cadastrar-lei-de-credito"]');
    expect(form).not.toBeNull();
    // ⚠️ A AFIRMAÇÃO É SOBRE A PROPRIEDADE, não sobre uma lista de nomes: TODO campo visível
    // dentro do form tem de estar dentro de um <label> (associação por envolvimento) ou apontado
    // por um `for`. Um campo NOVO sem rótulo cai aqui sozinho.
    const visiveis = Array.from(form!.querySelectorAll("input, select")).filter(
      (e) => (e as HTMLInputElement).type !== "hidden"
    );
    expect(visiveis.length).toBeGreaterThan(0);
    const mudos = visiveis.filter((e) => {
      const el = e as HTMLElement;
      if (el.closest("label") !== null) return false;
      const id = el.getAttribute("id");
      return id === null || form!.querySelector(`label[for="${id}"]`) === null;
    });
    expect(mudos.map((e) => (e as HTMLInputElement).name || "(sem nome)")).toEqual([]);
  });

  it("t3: o TIPO DE CRÉDITO não tem default — a tela não classifica pelo usuário", () => {
    render(<FormLeiCredito exercicio={2026} />);
    abrir();
    const tipo = document.querySelector('select[name="tipoCredito"]');
    expect(tipo).not.toBeNull();
    expect((tipo as HTMLSelectElement).value).toBe("");
    // E as três opções reais do PCASP estão lá, cada uma dizendo o que é.
    const valores = Array.from((tipo as HTMLSelectElement).options).map((o) => o.value);
    expect(valores).toEqual(["", "SUPLEMENTAR", "ESPECIAL", "EXTRAORDINARIO"]);
  });

  it("t4: o exercício NÃO é escolhido no form — ele é o recorte da página", () => {
    render(<FormLeiCredito exercicio={2026} />);
    abrir();
    const ano = document.querySelector('form input[name="ano"]');
    expect((ano as HTMLInputElement).type).toBe("hidden");
    expect((ano as HTMLInputElement).value).toBe("2026");
  });

  it("t5: no SUCESSO o painel fecha E a confirmação fica, marcada para quem não enxerga a tela", async () => {
    acao.resposta = { sucesso: "Lei L-001/2026 cadastrada." };
    render(<FormLeiCredito exercicio={2026} />);
    abrir();
    fireEvent.submit(document.querySelector('form[data-acao="cadastrar-lei-de-credito"]')!);
    await screen.findByText("Lei L-001/2026 cadastrada.");

    // O formulário SAIU…
    expect(document.querySelector('form[data-acao="cadastrar-lei-de-credito"]')).toBeNull();
    // …e a confirmação ficou, com `role="status"` (leitor de tela) e a marca do ato (percurso).
    const aviso = document.querySelector('[data-resultado-da-acao="cadastrar-lei-de-credito"]');
    expect(aviso).not.toBeNull();
    expect(aviso!.getAttribute("role")).toBe("status");
    expect(aviso!.getAttribute("data-resultado-seq")).toBe("1");
  });

  it("t6: no ERRO o painel CONTINUA aberto, com o motivo — o trabalho não se perde", async () => {
    acao.resposta = { erro: "Lei L-001/2026 já existe." };
    render(<FormLeiCredito exercicio={2026} />);
    abrir();
    fireEvent.submit(document.querySelector('form[data-acao="cadastrar-lei-de-credito"]')!);
    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toContain("já existe");
    expect(document.querySelector('form[data-acao="cadastrar-lei-de-credito"]')).not.toBeNull();
  });
});
