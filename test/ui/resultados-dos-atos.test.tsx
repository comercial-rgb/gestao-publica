// @vitest-environment happy-dom

/**
 * O RESULTADO DO ATO SOBREVIVE AO FORMULÁRIO QUE A RECARGA RETIRA.
 *
 * O defeito que isto prende (medido duas vezes em percurso): o ato grava, a recarga deixa de oferecer o formulário, e a
 * mensagem do que foi gravado some com ele — a pessoa não sabe se gravou. Candidato 208246f na ponte do contrato,
 * candidato 8ed0806 na confirmação da prévia da planilha da obra.
 *
 *   R1. enquanto o formulário está na página, o aviso NÃO se repete no topo (a mensagem fica junto dos campos);
 *   R2. o formulário sai da página: o aviso aparece no topo, com o papel certo e a sequência nova;
 *   R3. uma recusa aparece como alerta, e um novo resultado da mesma ação substitui o anterior (sequência maior);
 *   R4. sem provedor, publicar não quebra o formulário.
 */

import { act, cleanup, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { AvisosDosAtos, ResultadosDosAtos, useResultadoDoAto } from "../../components/ui/ResultadosDosAtos";

afterEach(() => {
  cleanup();
});

let publicarExterno: ((tipo: "ok" | "erro", texto: string) => void) | null = null;
let retirarExterno: (() => void) | null = null;

function Formulario(): React.ReactElement {
  const publicar = useResultadoDoAto("confirmar-planilha");
  publicarExterno = publicar;
  return <form data-acao="confirmar-planilha" />;
}

function Pagina({ comProvedor = true }: { readonly comProvedor?: boolean }): React.ReactElement {
  const [oferecido, setOferecido] = useState(true);
  retirarExterno = () => setOferecido(false);
  const corpo = <><AvisosDosAtos />{oferecido ? <Formulario /> : null}</>;
  return comProvedor ? <ResultadosDosAtos>{corpo}</ResultadosDosAtos> : corpo;
}

describe("ResultadosDosAtos", () => {
  it("R1/R2: o aviso só aparece no topo quando o formulário que publicou saiu da página", () => {
    const { container } = render(<Pagina />);
    act(() => publicarExterno?.("ok", "Versão 1 da planilha confirmada"));
    expect(container.querySelector("[data-avisos-dos-atos] [data-resultado-da-acao]")).toBeNull();
    act(() => retirarExterno?.());
    const aviso = container.querySelector('[data-avisos-dos-atos] [data-resultado-da-acao="confirmar-planilha"]');
    expect(aviso?.textContent).toContain("Versão 1 da planilha confirmada");
    expect(aviso?.getAttribute("role")).toBe("status");
    expect(aviso?.getAttribute("data-resultado-seq")).toBe("1");
  });

  it("R3: a recusa é alerta e o resultado novo da mesma ação substitui o anterior", () => {
    const { container } = render(<Pagina />);
    const publicar = publicarExterno;
    act(() => publicar?.("ok", "primeiro"));
    act(() => retirarExterno?.());
    act(() => publicar?.("erro", "PREVIA-JA-CONFIRMADA: segundo"));
    const avisos = container.querySelectorAll("[data-avisos-dos-atos] [data-resultado-da-acao]");
    expect(avisos).toHaveLength(1);
    expect(avisos[0]?.getAttribute("role")).toBe("alert");
    expect(avisos[0]?.getAttribute("data-resultado-seq")).toBe("2");
    expect(avisos[0]?.textContent).toContain("segundo");
  });

  it("R4: sem provedor, publicar é ignorado e nada quebra", () => {
    const { container } = render(<Pagina comProvedor={false} />);
    act(() => publicarExterno?.("ok", "sem provedor"));
    act(() => retirarExterno?.());
    expect(container.querySelector("[data-resultado-da-acao]")).toBeNull();
  });
});
