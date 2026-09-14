// @vitest-environment happy-dom

/**
 * O SELETOR REFERENCIADO — as quatro garantias do cabeçalho de `CampoReferenciado`, com `fetch`
 * controlado pelo teste para escolher QUAL resposta chega primeiro.
 *
 * A contraprova de cada uma está no próprio `it`: sem a guarda de sequência, a resposta lenta de
 * "31" chegaria por último e seria a lista oferecida; sem o `hidden`, o texto digitado viajaria.
 */

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CampoReferenciado } from "../../components/ui/CampoReferenciado";

interface Pendente {
  readonly url: string;
  resolver(corpo: unknown, status?: number): void;
}

let pendentes: Pendente[] = [];

beforeEach(() => {
  pendentes = [];
  vi.useFakeTimers();
  vi.stubGlobal("fetch", (url: string) =>
    new Promise((resolve) => {
      pendentes.push({
        url,
        resolver: (corpo, status = 200) => resolve({ ok: status < 400, status, json: async () => corpo }),
      });
    })
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function digitar(input: HTMLElement, texto: string): Promise<void> {
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: texto } });
  await act(async () => {
    vi.advanceTimersByTime(300);
  });
}

async function responder(i: number, corpo: unknown, status?: number): Promise<void> {
  await act(async () => {
    pendentes[i]?.resolver(corpo, status);
    await Promise.resolve();
    await Promise.resolve();
  });
}

function montar(extra?: React.ReactNode) {
  return render(
    <form>
      {extra}
      <CampoReferenciado name="naturezaDespesa" rotulo="Natureza" catalogo="naturezas-de-despesa" obrigatorio contexto={["exercicio"]} />
    </form>
  );
}

describe("CampoReferenciado", () => {
  it("RESPOSTA ATRASADA NÃO VALE: a busca de '31' que chega depois da de '33' é descartada", async () => {
    const { container, getByRole } = montar();
    const input = getByRole("combobox");
    await digitar(input, "31");
    await digitar(input, "33");
    expect(pendentes.map((p) => new URL(p.url, "http://x").searchParams.get("q"))).toEqual(["31", "33"]);
    await responder(1, { opcoes: [{ valor: "339039", rotulo: "339039 — Serviços" }], temMais: false });
    await responder(0, { opcoes: [{ valor: "319011", rotulo: "319011 — Vencimentos" }], temMais: false });
    const valores = [...container.querySelectorAll('[role="option"]')].map((o) => o.getAttribute("data-valor"));
    expect(valores).toEqual(["339039"]);
  });

  it("O TEXTO DIGITADO NÃO É ESCOLHA: o hidden só recebe valor ao escolher, e perde se o texto muda", async () => {
    const { container, getByRole } = montar();
    const input = getByRole("combobox");
    const hidden = container.querySelector('input[type="hidden"][name="naturezaDespesa"]') as HTMLInputElement;
    await digitar(input, "3190");
    expect(hidden.value).toBe("");
    await responder(0, { opcoes: [{ valor: "319011", rotulo: "319011 — Vencimentos" }], temMais: false });
    fireEvent.mouseDown(container.querySelector('[data-valor="319011"]') as HTMLElement);
    expect(hidden.value).toBe("319011");
    fireEvent.change(input, { target: { value: "319011 — Vencimentoss" } });
    expect(hidden.value).toBe("");
  });

  it("RESPOSTA EM VOO NÃO TROCA A ESCOLHA feita enquanto ela viajava", async () => {
    const { container, getByRole } = montar();
    const input = getByRole("combobox");
    await digitar(input, "31");
    await responder(0, { opcoes: [{ valor: "319011", rotulo: "319011 — Vencimentos" }], temMais: false });
    await digitar(input, "3190");
    // escolhe da lista anterior enquanto a busca "3190" ainda não voltou
    fireEvent.mouseDown(container.querySelector('[data-valor="319011"]') as HTMLElement);
    await responder(1, { opcoes: [{ valor: "319013", rotulo: "319013 — Patronais" }], temMais: false });
    expect((container.querySelector('input[name="naturezaDespesa"]') as HTMLInputElement).value).toBe("319011");
  });

  it("MUDAR O CONTEXTO REVALIDA: a escolha que não vale mais é retirada COM aviso, e o texto fica", async () => {
    const { container, getByLabelText } = montar(
      <select name="exercicio" defaultValue="2026" aria-label="Exercício">
        <option value="2026">2026</option>
        <option value="2027">2027</option>
      </select>
    );
    const input = getByLabelText("Natureza") as HTMLInputElement;
    await digitar(input, "3190");
    expect(new URL(pendentes[0]?.url ?? "", "http://x").searchParams.get("ctx.exercicio")).toBe("2026");
    await responder(0, { opcoes: [{ valor: "319011", rotulo: "319011 — Vencimentos" }], temMais: false });
    fireEvent.mouseDown(container.querySelector('[data-valor="319011"]') as HTMLElement);
    const select = container.querySelector('select[name="exercicio"]') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "2027" } });
    const revalidacao = pendentes[pendentes.length - 1];
    expect(new URL(revalidacao?.url ?? "", "http://x").searchParams.get("valor")).toBe("319011");
    expect(new URL(revalidacao?.url ?? "", "http://x").searchParams.get("ctx.exercicio")).toBe("2027");
    await responder(pendentes.length - 1, { opcoes: [], temMais: false });
    expect((container.querySelector('input[name="naturezaDespesa"]') as HTMLInputElement).value).toBe("");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("foi retirada");
    expect(input.value).toBe("319011 — Vencimentos");
  });

  it("RECUSA DO SERVIDOR aparece com o motivo, e nada é escolhido", async () => {
    const { container, getByRole } = montar();
    await digitar(getByRole("combobox"), "31");
    await responder(0, { erro: "Esta lista não está no seu acesso." }, 403);
    expect(container.textContent).toContain("Esta lista não está no seu acesso.");
    expect((container.querySelector('input[name="naturezaDespesa"]') as HTMLInputElement).value).toBe("");
  });

  it("ACESSIBILIDADE: combobox rotulado, listbox controlado, Enter escolhe sem enviar", async () => {
    const aoEnviar = vi.fn((e: Event) => e.preventDefault());
    const { container, getByRole, getByLabelText } = montar();
    container.querySelector("form")?.addEventListener("submit", aoEnviar);
    const input = getByLabelText("Natureza");
    expect(input.getAttribute("role")).toBe("combobox");
    await digitar(getByRole("combobox"), "31");
    await responder(0, { opcoes: [{ valor: "319011", rotulo: "319011 — Vencimentos" }, { valor: "319013", rotulo: "319013 — Patronais" }], temMais: false });
    expect(container.querySelector(`#${CSS.escape(input.getAttribute("aria-controls") ?? "")}`)?.getAttribute("role")).toBe("listbox");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect((container.querySelector('input[name="naturezaDespesa"]') as HTMLInputElement).value).toBe("319013");
    expect(aoEnviar).not.toHaveBeenCalled();
  });
});
