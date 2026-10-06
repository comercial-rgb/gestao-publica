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
import { CampoReferenciado, correspondenciaExata } from "../../components/ui/CampoReferenciado";

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
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("foi removida");
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
  // ── V37 — o defeito de produção: o CPF inteiro digitado, sem clicar na lista, ia VAZIO ao servidor ──

  it("V37 CORRESPONDÊNCIA EXATA: documento com máscara casa pelos dígitos; prefixo e parte do nome não", () => {
    const ops = [
      { valor: "41827365919", rotulo: "418.273.659-19 — Maria" },
      { valor: "41827365900", rotulo: "418.273.659-00 — João" },
    ];
    expect(correspondenciaExata("418.273.659-19", ops)?.valor).toBe("41827365919");
    expect(correspondenciaExata("41827365900", ops)?.valor).toBe("41827365900");
    expect(correspondenciaExata("418.273.659-00 — joão", ops)?.valor).toBe("41827365900");
    expect(correspondenciaExata("4182736", ops)).toBeUndefined();
    expect(correspondenciaExata("Maria", ops)).toBeUndefined();
    expect(correspondenciaExata("CPF 41827365919", ops)).toBeUndefined();
    expect(correspondenciaExata("", ops)).toBeUndefined();
  });

  it("V37 AO SAIR DO CAMPO: o texto que é exatamente uma opção vira escolha; a aproximação não", async () => {
    const { container, getByRole } = render(
      <form>
        <CampoReferenciado name="credor" rotulo="Credor" catalogo="credores" obrigatorio />
      </form>
    );
    const input = getByRole("combobox");
    const hidden = container.querySelector('input[type="hidden"][name="credor"]') as HTMLInputElement;

    await digitar(input, "4182");
    await responder(0, { opcoes: [{ valor: "41827365919", rotulo: "418.273.659-19 — Maria" }], temMais: false });
    fireEvent.blur(input);
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(hidden.value).toBe("");

    await digitar(input, "418.273.659-19");
    await responder(1, { opcoes: [{ valor: "41827365919", rotulo: "418.273.659-19 — Maria" }], temMais: false });
    fireEvent.blur(input);
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(hidden.value).toBe("41827365919");
  });

  it("V37 OBRIGATÓRIO SEM ESCOLHA NÃO ENVIA: o envio é barrado com o motivo, e o formulário oferece a alternativa", async () => {
    const naoEncontrado = vi.fn();
    const { container, getByRole } = render(
      <form>
        <CampoReferenciado name="credor" rotulo="Credor" catalogo="credores" obrigatorio aoNaoEncontrar={naoEncontrado} />
      </form>
    );
    const form = container.querySelector("form") as HTMLFormElement;
    const input = getByRole("combobox");
    await digitar(input, "418.273.659-19");
    await responder(0, { opcoes: [], temMais: false });
    let enviou = true;
    act(() => {
      enviou = fireEvent.submit(form);
    });
    expect(enviou).toBe(false);
    expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/não foi escolhido na lista/);
    expect(naoEncontrado).toHaveBeenCalledWith("418.273.659-19");

    // Com a escolha feita, o envio passa.
    await digitar(input, "418");
    await responder(1, { opcoes: [{ valor: "41827365919", rotulo: "418.273.659-19 — Maria" }], temMais: false });
    fireEvent.mouseDown(container.querySelector('[data-valor="41827365919"]') as HTMLElement);
    act(() => {
      enviou = fireEvent.submit(form);
    });
    expect(enviou).toBe(true);
  });

  it("V37 O OPCIONAL NÃO BARRA: sem obrigatorio, o envio vazio segue", () => {
    const { container } = render(
      <form>
        <CampoReferenciado name="obra" rotulo="Obra" catalogo="obras" />
      </form>
    );
    expect(fireEvent.submit(container.querySelector("form") as HTMLFormElement)).toBe(true);
  });
  it("V37 ATALHO DE CADASTRO: a busca sem resultado oferece o cadastro com o documento — só a quem a tela autoriza", async () => {
    const { container, getByRole, unmount } = render(
      <form>
        <CampoReferenciado name="credor" rotulo="Credor" catalogo="credores" obrigatorio cadastro={{ href: "/cadastros/pessoas/nova?papel=CREDOR", rotulo: "Cadastrar este credor" }} />
      </form>
    );
    await digitar(getByRole("combobox"), "418.273.659-19");
    await responder(0, { opcoes: [], temMais: false });
    const link = container.querySelector("[data-atalho-de-cadastro]") as HTMLAnchorElement | null;
    expect(link?.textContent).toBe("Cadastrar este credor");
    const u = new URL(link!.getAttribute("href")!, "http://x");
    expect(u.pathname).toBe("/cadastros/pessoas/nova");
    expect(u.searchParams.get("documento")).toBe("41827365919");
    expect(u.searchParams.get("papel")).toBe("CREDOR");
    expect(u.searchParams.get("retorno")?.startsWith("/")).toBe(true);
    unmount();

    // Sem a autorização (a tela não passa `cadastro`), o mesmo vazio não oferece atalho nenhum.
    const sem = render(
      <form>
        <CampoReferenciado name="credor" rotulo="Credor" catalogo="credores" obrigatorio />
      </form>
    );
    await digitar(sem.getByRole("combobox"), "418.273.659-19");
    await responder(1, { opcoes: [], temMais: false });
    expect(sem.container.querySelector("[data-atalho-de-cadastro]")).toBeNull();
  });
});
