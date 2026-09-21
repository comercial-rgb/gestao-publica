// @vitest-environment happy-dom

/**
 * A CAIXA DE SELEÇÃO CONTROLADA (V11 V8.7) — a medição que a pendência
 * `MARCAR-EM-CAMPO-CONTROLADO` pedia e que ninguém podia fazer.
 *
 * ═══ ⚠️ POR QUE ESTA MEDIÇÃO NÃO EXISTIA ═══
 * A técnica de marcar vivia dentro de um `page.evaluate` do helper dos percursos. Nenhum teste a
 * alcançava, e a pendência dizia "mede-se quando aparecer o caso" — mas o caso só apareceria como
 * um percurso morrendo em silêncio, sem nome de campo, contra uma tela que estava certa.
 *
 * Extraída para `scripts/marca-em-caixa.ts`, ela virou uma função comum. Aqui um checkbox
 * REALMENTE controlado pelo React recebe as duas técnicas, e a diferença aparece.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { aplicarMarca, aplicarMarcaIngenua } from "../../scripts/marca-em-caixa";

afterEach(cleanup);

/**
 * Um checkbox CONTROLADO — `checked` vem do estado e só muda pelo `onChange`. É a forma que o
 * repositório usa em toda ilha com estado, e é exatamente a que a técnica ingênua não alcança.
 */
function CaixaControlada(): React.ReactElement {
  const [marcado, setMarcado] = useState(false);
  return (
    <label>
      <span>Aceito o termo</span>
      <input
        type="checkbox"
        name="aceito"
        checked={marcado}
        onChange={(e) => setMarcado(e.target.checked)}
      />
      <output data-teste="estado">{marcado ? "sim" : "nao"}</output>
    </label>
  );
}

const caixa = (): HTMLInputElement => screen.getByRole("checkbox") as HTMLInputElement;
const estado = (): string => document.querySelector('[data-teste="estado"]')?.textContent ?? "";

describe("marcar uma caixa controlada pelo React", () => {
  it("t1: a técnica INGÊNUA não chega ao estado — o DOM muda e o React não vê", () => {
    // ⚠️ ESTA É A MEDIÇÃO QUE FALTAVA. `el.checked = true` grava por cima do setter que o React
    // instala; o evento dispara, o React compara o valor interno DELE (inalterado) e conclui que
    // nada mudou. A tela continua achando que a caixa está desmarcada.
    render(<CaixaControlada />);
    expect(estado()).toBe("nao");

    aplicarMarcaIngenua(caixa(), true);

    expect(estado()).toBe("nao");
  });

  it("t2: o setter do PROTÓTIPO chega — o estado do React acompanha", () => {
    render(<CaixaControlada />);
    aplicarMarca(caixa(), true);
    expect(estado()).toBe("sim");
    expect(caixa().checked).toBe(true);
  });

  it("t3: e ela DESMARCA o que estava marcado — sem inverter por acidente", () => {
    // ⚠️ ERA ESTE O RISCO QUE SEGUROU A CORREÇÃO POR VÁRIOS LOTES: a cura "óbvia" seria despachar
    // um `click`, que aciona a ativação padrão do navegador e INVERTE `checked` de novo. Marcar o
    // que já está marcado o desmarcaria em silêncio, e o percurso passaria a fazer o contrário do
    // que pediu. O setter do protótipo não aciona ativação nenhuma.
    render(<CaixaControlada />);
    aplicarMarca(caixa(), true);
    expect(estado()).toBe("sim");

    aplicarMarca(caixa(), true); // idempotente: marcar de novo não desmarca
    expect(estado()).toBe("sim");

    aplicarMarca(caixa(), false);
    expect(estado()).toBe("nao");
  });

  it("t4: numa caixa NÃO-controlada as duas funcionam — a diferença é só no controlado", () => {
    // A contraprova: se a técnica nova "funcionasse" também onde a antiga funciona, t1 poderia
    // estar medindo outra coisa. Aqui as duas chegam ao DOM, e é o React que distingue.
    render(<input type="checkbox" aria-label="solta" />);
    const solta = screen.getByLabelText("solta") as HTMLInputElement;
    aplicarMarcaIngenua(solta, true);
    expect(solta.checked).toBe(true);
    aplicarMarca(solta, false);
    expect(solta.checked).toBe(false);
  });
});
