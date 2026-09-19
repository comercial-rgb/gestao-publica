// @vitest-environment happy-dom

/**
 * O FORM DA DECLARAÇÃO DE DISPONIBILIDADE (V11 V7.3) — a tela que grava o número que AUTORIZA.
 *
 * ═══ ⚠️ POR QUE ESTE ARQUIVO EXISTE ═══
 * Este formulário é o mais curto do módulo e o de maior consequência: o valor que ele grava é o
 * único lastro de um crédito adicional por recurso novo. Quatro coisas dele falham EM SILÊNCIO,
 * e nenhuma aparece num typecheck.
 *
 *   (1) UM DEFAULT NA ORIGEM OU NA FONTE. Cada origem amarra contra uma apuração diferente
 *       (superávit contra o balanço do exercício anterior, excesso contra a arrecadação do
 *       próprio ano, operação de crédito contra o contrato). Um default escolheria a amarração
 *       no lugar de quem apurou, e o erro só apareceria na prestação de contas.
 *
 *   (2) `ANULACAO` NA LISTA. Crédito por anulação não traz dinheiro novo — ele REMANEJA, e o que
 *       o autoriza é o saldo da ficha anulada. Uma opção aqui criaria uma declaração que nada lê,
 *       e um servidor concluiria que anulou "com lastro".
 *
 *   (3) A CONFIRMAÇÃO DO ATO QUE SAI DA TELA. O painel FECHA no sucesso; sem a confirmação fora
 *       dele, quem declarou lê silêncio e redeclara.
 *
 *   (4) RÓTULO EM TODO CAMPO. Campo sem rótulo é caixa muda para leitor de tela.
 *
 * ⚠️ A SERVER ACTION É MOCKADA: o que está sob teste é a FIAÇÃO da tela. O versionamento, o piso
 * do que já foi usado e a recusa da repetição são do domínio, e estão provados por mutação em
 * `modules/m03-creditos/m03-declaracao-de-disponibilidade.test.ts`, contra o Postgres.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const acao = vi.hoisted(() => ({ resposta: {} as { erro?: string; sucesso?: string } }));

vi.mock("../../app/(areas)/planejamento/recursos-novos/actions", () => ({
  declararAction: async () => acao.resposta,
}));

const { FormDeclaracao } = await import(
  "../../app/(areas)/planejamento/recursos-novos/FormDeclaracao"
);

const FONTES = [
  { id: "f-500", codigo: "500", descricao: "Recursos nao vinculados de impostos" },
  { id: "f-540", codigo: "540", descricao: "Transferencias do FUNDEB" },
] as const;

afterEach(() => {
  acao.resposta = {};
  cleanup();
});

function abrir(): void {
  fireEvent.click(screen.getByRole("button", { name: "Declarar disponibilidade" }));
}

function form(): HTMLFormElement | null {
  return document.querySelector('form[data-acao="declarar-disponibilidade"]');
}

describe("o formulário da declaração de disponibilidade", () => {
  it("t1: nasce FECHADO, com o botão que o revela", () => {
    render(<FormDeclaracao exercicio={2026} fontes={FONTES} />);
    expect(screen.getByRole("button", { name: "Declarar disponibilidade" })).toBeTruthy();
    expect(form()).toBeNull();
  });

  it("t2: aberto, TODO campo tem rótulo — nenhum é caixa muda", () => {
    render(<FormDeclaracao exercicio={2026} fontes={FONTES} />);
    abrir();
    expect(form()).not.toBeNull();
    // ⚠️ A AFIRMAÇÃO É SOBRE A PROPRIEDADE, não sobre uma lista de nomes: um campo NOVO sem
    // rótulo cai aqui sozinho, sem ninguém se lembrar de acrescentá-lo a uma lista.
    const visiveis = Array.from(form()!.querySelectorAll("input, select")).filter(
      (e) => (e as HTMLInputElement).type !== "hidden"
    );
    expect(visiveis.length).toBeGreaterThan(0);
    const mudos = visiveis.filter((e) => {
      const el = e as HTMLElement;
      if (el.closest("label") !== null) return false;
      const id = el.getAttribute("id");
      return id === null || form()!.querySelector(`label[for="${id}"]`) === null;
    });
    expect(mudos.map((e) => (e as HTMLInputElement).name || "(sem nome)")).toEqual([]);
  });

  it("t3: a ORIGEM não tem default, e ANULACAO não está entre as opções", () => {
    render(<FormDeclaracao exercicio={2026} fontes={FONTES} />);
    abrir();
    const origem = form()!.querySelector('select[name="origem"]') as HTMLSelectElement;
    expect(origem.value).toBe("");
    const valores = Array.from(origem.options).map((o) => o.value);
    expect(valores).toEqual(["", "SUPERAVIT_FINANCEIRO", "EXCESSO_ARRECADACAO", "OPERACAO_CREDITO"]);
    // ⚠️ A ausência afirmada explicitamente: uma opção a mais aqui não quebraria nada acima.
    expect(valores).not.toContain("ANULACAO");
  });

  it("t4: a FONTE não tem default — a disponibilidade é apurada POR FONTE", () => {
    render(<FormDeclaracao exercicio={2026} fontes={FONTES} />);
    abrir();
    const fonte = form()!.querySelector('select[name="fonteId"]') as HTMLSelectElement;
    expect(fonte.value).toBe("");
    expect(Array.from(fonte.options).map((o) => o.value)).toEqual(["", "f-500", "f-540"]);
    // O código vem junto do nome: "500" sozinho não diz a ninguém contra o que se está declarando.
    expect(fonte.options[1]!.textContent).toContain("500");
    expect(fonte.options[1]!.textContent).toContain("Recursos nao vinculados");
  });

  it("t5: o exercício NÃO é escolhido no form — ele é o recorte da página", () => {
    render(<FormDeclaracao exercicio={2026} fontes={FONTES} />);
    abrir();
    const ex = form()!.querySelector('input[name="exercicio"]') as HTMLInputElement;
    expect(ex.type).toBe("hidden");
    expect(ex.value).toBe("2026");
  });

  it("t6: a explicação é exigida, e com tamanho de FRASE — 'ajuste' não explica nada", () => {
    render(<FormDeclaracao exercicio={2026} fontes={FONTES} />);
    abrir();
    const d = form()!.querySelector('input[name="descricao"]') as HTMLInputElement;
    expect(d.required).toBe(true);
    // O mesmo piso que o domínio cobra (zDeclararDisponibilidadeInput). A tela avisa antes de
    // enviar; quem RECUSA é o domínio, porque o navegador não é autoridade.
    expect(d.minLength).toBe(10);
  });

  it("t7: no SUCESSO o painel fecha E a confirmação fica, marcada para quem não enxerga a tela", async () => {
    acao.resposta = { sucesso: "Disponibilidade declarada — versão 2, substituindo 50000.00." };
    render(<FormDeclaracao exercicio={2026} fontes={FONTES} />);
    abrir();
    fireEvent.submit(form()!);
    await screen.findByText(/Disponibilidade declarada/);

    expect(form()).toBeNull();
    const aviso = document.querySelector('[data-resultado-da-acao="declarar-disponibilidade"]');
    expect(aviso).not.toBeNull();
    expect(aviso!.getAttribute("role")).toBe("status");
    expect(aviso!.getAttribute("data-resultado-seq")).toBe("1");
    // ⚠️ A CONFIRMAÇÃO DIZ O QUE SUBSTITUIU. "Pronto" deixaria quem corrigiu sem saber que
    // corrigiu — e é a correção silenciosa que esta unidade inteira existe para impedir.
    expect(aviso!.textContent).toContain("substituindo 50000.00");
  });

  it("t8: no ERRO o painel CONTINUA aberto, com o motivo inteiro — o trabalho não se perde", async () => {
    acao.resposta = { erro: "A disponibilidade declarada (20000.00) é MENOR do que o que a fonte 500 já suplementou (30000.00)." };
    render(<FormDeclaracao exercicio={2026} fontes={FONTES} />);
    abrir();
    fireEvent.submit(form()!);
    await screen.findByRole("alert");

    expect(form()).not.toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("já suplementou (30000.00)");
  });

  it("t9: sem fonte cadastrada, a tela DIZ por quê em vez de oferecer um form vazio", () => {
    render(<FormDeclaracao exercicio={2026} fontes={[]} />);
    expect(screen.queryByRole("button", { name: "Declarar disponibilidade" })).toBeNull();
    expect(screen.getByText(/Sem fonte de recurso cadastrada/)).toBeTruthy();
  });
});
