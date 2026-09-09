// @vitest-environment happy-dom

/**
 * OS CAMPOS MASCARADOS, NA TELA — o teste mínimo da 7.9: **formata na tela e submete o valor cru**.
 *
 * ⚠️ POR QUE ESTE TESTE PRECISA DE DOM, quando o resto da UI se testa sem React. O
 * `mascaras.test.ts` já prova a REGRA (é lá que mora o risco de 1000×). O que ele NÃO alcança é a
 * FIAÇÃO — e a fiação é exatamente onde esta frente pode falhar em silêncio: o padrão é um input
 * VISÍVEL sem `name` (mascarado) mais um HIDDEN com `name` (cru). Se alguém puser o `name` no
 * visível, tudo continua parecendo certo na tela e o domínio passa a receber `"1.234,56"`, que o
 * `zMoney` recusa — ou pior, `"123.456.789-01"`, que tem 14 caracteres e o M13 leria como CNPJ.
 * Só um `FormData` de verdade prova que não é isso que acontece. Por isso o DOM entrou na 7.9.
 *
 * O ambiente é pedido POR ARQUIVO (o docblock acima) — o default da suíte segue `node`.
 */

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CampoCep, CampoCpfCnpj, CampoTelefone, CampoValor } from "../../components/ui/Campos";

// `globals` não está ligado no vitest.config, então o auto-cleanup do testing-library não engata.
afterEach(() => {
  cleanup();
});

/** O que o browser submeteria — a fronteira UI→porta, lida como a Server Action a lê. */
function submeter(form: HTMLFormElement): Record<string, string> {
  const dados = new FormData(form);
  return Object.fromEntries([...dados.entries()].map(([k, v]) => [k, String(v)]));
}

function comForm(ui: React.ReactElement): HTMLFormElement {
  const { container } = render(<form>{ui}</form>);
  return container.querySelector("form")!;
}

function campoVisivel(mascara: string): HTMLInputElement {
  return document.querySelector<HTMLInputElement>(`input[data-mascara="${mascara}"]`)!;
}

describe("CampoValor — formata na tela, submete cru", () => {
  it("digita 1234567.89 → exibe 1.234.567,89 e SUBMETE 1234.56-style cru", () => {
    const form = comForm(<CampoValor name="valor" />);
    const input = campoVisivel("valor");

    fireEvent.change(input, { target: { value: "1234567.89" } });
    fireEvent.blur(input);

    expect(input.value, "o que o usuário LÊ").toBe("1.234.567,89");
    expect(submeter(form), "o que a porta RECEBE").toEqual({ valor: "1234567.89" });
  });

  it("aceita o pt-BR digitado à mão e submete cru", () => {
    const form = comForm(<CampoValor name="valor" />);
    const input = campoVisivel("valor");

    fireEvent.change(input, { target: { value: "10.000,00" } });
    fireEvent.blur(input);

    expect(input.value).toBe("10.000,00");
    expect(submeter(form)).toEqual({ valor: "10000.00" });
  });

  it("⚠️ o valor cru sai no formato que o zMoney aceita — a regex da fronteira, aqui", () => {
    const form = comForm(<CampoValor name="valor" />);
    const input = campoVisivel("valor");
    fireEvent.change(input, { target: { value: "10.000,00" } });

    // packages/contracts/money.ts:78-83 — se a máscara vazasse, isto falharia.
    expect(submeter(form)["valor"]).toMatch(/^-?\d+(\.\d+)?$/);
  });

  it("negativo: parênteses ao SAIR, sinal ao ENTRAR — e cru com o menos", () => {
    const form = comForm(<CampoValor name="ajuste" />);
    const input = campoVisivel("valor");

    fireEvent.change(input, { target: { value: "-5000" } });
    fireEvent.blur(input);
    expect(input.value, "convenção contábil na exibição").toBe("(5.000,00)");
    expect(submeter(form), "a reprevisão precisa do sinal").toEqual({ ajuste: "-5000.00" });

    fireEvent.focus(input);
    expect(input.value, "parêntese não se digita — no foco vira typeável").toBe("-5.000,00");
  });

  it("o campo vazio submete vazio — não inventa zero", () => {
    const form = comForm(<CampoValor name="valor" />);
    expect(submeter(form)).toEqual({ valor: "" });
  });

  it("o que a máscara não entende chega CRU ao domínio, para ele recusar nomeando", () => {
    const form = comForm(<CampoValor name="valor" />);
    const input = campoVisivel("valor");

    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.blur(input);

    expect(input.value).toBe("abc");
    expect(submeter(form), "a tela SUGERE, o domínio DECIDE").toEqual({ valor: "abc" });
  });

  it("defaultValue cru vem do domínio já formatado na tela", () => {
    comForm(<CampoValor name="valor" defaultValue="1234.5" />);
    expect(campoVisivel("valor").value).toBe("1.234,50");
  });

  it("o input visível NÃO tem name — é isso que o mantém fora do FormData", () => {
    comForm(<CampoValor name="valor" />);
    expect(campoVisivel("valor").getAttribute("name")).toBeNull();
  });

  it("o required fica no visível (browser valida) e o hidden carrega o name (browser submete)", () => {
    const form = comForm(<CampoValor name="valor" required />);
    expect(campoVisivel("valor").required, "sem name, mas validado").toBe(true);
    expect(form.querySelector<HTMLInputElement>('input[type="hidden"]')!.name).toBe("valor");
  });
});

describe("CampoCpfCnpj — 11 ↔ 14 na tela, só dígitos na fronteira", () => {
  it("CPF: exibe pontuado, submete 11 dígitos", () => {
    const form = comForm(<CampoCpfCnpj name="credor" />);
    const input = campoVisivel("cpf-cnpj");

    fireEvent.change(input, { target: { value: "12345678901" } });

    expect(input.value).toBe("123.456.789-01");
    expect(submeter(form)).toEqual({ credor: "12345678901" });
  });

  it("CNPJ: exibe pontuado, submete 14 dígitos", () => {
    const form = comForm(<CampoCpfCnpj name="credor" />);
    const input = campoVisivel("cpf-cnpj");

    fireEvent.change(input, { target: { value: "12345678000199" } });

    expect(input.value).toBe("12.345.678/0001-99");
    expect(submeter(form)).toEqual({ credor: "12345678000199" });
  });

  it("⚠️ O COMPRIMENTO SUBMETIDO É O QUE O M13 USA PARA DIZER PF DE PJ", () => {
    // m13-transparencia/dominio.ts:47-63 distingue por 11 × 14 e chama CPF pontuado de DADO
    // QUEBRADO. Se a máscara vazasse, "123.456.789-01" teria 14 e viraria um CNPJ.
    const form = comForm(<CampoCpfCnpj name="credor" />);
    fireEvent.change(campoVisivel("cpf-cnpj"), { target: { value: "123.456.789-01" } });

    const cru = submeter(form)["credor"]!;
    expect(cru, "11 = pessoa física").toHaveLength(11);
    expect(cru, "nenhum caractere de máscara atravessa").toMatch(/^\d+$/);
  });

  it("mascara ao vivo, a cada tecla", () => {
    comForm(<CampoCpfCnpj name="credor" />);
    const input = campoVisivel("cpf-cnpj");

    fireEvent.change(input, { target: { value: "1234" } });
    expect(input.value).toBe("123.4");
  });
});

describe("CampoTelefone / CampoCep — prontos, ainda sem consumidor", () => {
  it("telefone celular exibe (00) 00000-0000 e submete dígitos", () => {
    const form = comForm(<CampoTelefone name="telefone" />);
    const input = campoVisivel("telefone");

    fireEvent.change(input, { target: { value: "83999887766" } });

    expect(input.value).toBe("(83) 99988-7766");
    expect(submeter(form)).toEqual({ telefone: "83999887766" });
  });

  it("CEP exibe 00000-000 e submete dígitos", () => {
    const form = comForm(<CampoCep name="cep" />);
    const input = campoVisivel("cep");

    fireEvent.change(input, { target: { value: "58400000" } });

    expect(input.value).toBe("58400-000");
    expect(submeter(form)).toEqual({ cep: "58400000" });
  });
});

describe("o rótulo continua achando o campo (o hidden não rouba o label)", () => {
  it("um <label> que embrulha o CampoValor aponta para o input VISÍVEL", () => {
    // ⚠️ `label.control`, e NÃO `getByLabelText`. Os dois discordam aqui, e o DOM é quem tem razão:
    // o testing-library varre qualquer form element dentro do label e acha DOIS (visível + hidden);
    // a especificação diz que `input[type=hidden]` NÃO é "labelable", então o `control` de verdade
    // — o que o navegador foca ao clicar no rótulo, e o que o leitor de tela anuncia — é o visível.
    // Testar pelo `control` é testar o browser; testar pelo query seria testar a biblioteca.
    const { container } = render(
      <form>
        <label>
          <span>Valor (R$)</span>
          <CampoValor name="valor" />
        </label>
      </form>
    );
    const label = container.querySelector("label")!;
    expect(label.control).toBe(campoVisivel("valor"));
    expect(label.textContent).toContain("Valor (R$)");
  });
});
