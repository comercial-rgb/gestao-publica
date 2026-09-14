// @vitest-environment happy-dom

/**
 * A BARRA DE AÇÕES DO MOLDE PROJETA DISPONIBILIDADE, NÃO SÓ PERMISSÃO (V6.2 U0).
 *
 * O defeito que isto prende: a folha já certificada continuava oferecendo "Certificar". O servidor
 * recusava — a tela prometia. Cada `it` abaixo é uma das cinco distinções do pedido:
 *
 *   1. sem permissão → nenhum motivo de estado vaza (o motivo pode carregar dado do registro);
 *   2. disponível → o formulário, com a versão do estado lido;
 *   3. não aplicável → sai da barra e aparece como estado;
 *   4. pré-condição → travada, com o motivo como TEXTO associado ao botão, focável, sem action;
 *   5. consulta falhou (ou ação sem entrada) → TRAVADA — nunca liberar tudo por fallback.
 *
 * E a contraprova de que o instrumento acusa: um descritor SEM `acoesPorEstado` continua
 * oferecendo o formulário — senão os testes acima passariam com uma barra que esconde tudo.
 */

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FormsDoRecurso } from "../../components/molde/FormsDoRecurso";
import { definirRecurso, type DefinicaoDeRecurso, type DisponibilidadeDoRegistro } from "../../lib/molde/tipos";

afterEach(() => {
  cleanup();
});

const BASE = {
  nome: "coisas",
  rotulo: "Coisas",
  rotuloSingular: "Coisa",
  rota: "/coisas",
  descricao: "fixture da barra",
  campos: [],
  colunas: [{ nome: "n", cabecalho: "N", tipo: "texto" as const }],
  filtros: [],
  permissoes: {},
  abas: ["dados" as const],
  acoes: [
    { nome: "certificar", rotulo: "Certificar", acaoDoCenso: "CERTIFICAR_FOLHA", campos: [{ nome: "data", rotulo: "Data", tipo: "data" as const }] },
    { nome: "liquidar", rotulo: "Liquidar", acaoDoCenso: "LIQUIDAR_FOLHA" },
    { nome: "devolver", rotulo: "Devolver", acaoDoCenso: "CERTIFICAR_FOLHA" },
  ],
};

const POR_ESTADO: DefinicaoDeRecurso = definirRecurso({ ...BASE, acoesPorEstado: true });
const SO_PERMISSAO: DefinicaoDeRecurso = definirRecurso(BASE);
const acao = vi.fn(async () => ({}));

const DISP: DisponibilidadeDoRegistro = {
  versao: "v-123",
  porAcao: {
    certificar: { apresentacao: "nao-aplicavel", motivo: "A folha de 2026-05 já está certificada." },
    liquidar: { apresentacao: "bloqueada", motivo: "Você certificou esta folha e não pode liquidá-la.", providencia: "Outra pessoa pratica o ato." },
    devolver: { apresentacao: "disponivel" },
  },
};

function montar(def: DefinicaoDeRecurso, permitidas: readonly string[], disponibilidade?: DisponibilidadeDoRegistro | null) {
  return render(
    <FormsDoRecurso definicao={def} permitidas={permitidas} opcoes={{}} registroId="r1" action={acao} modo="acoes" {...(disponibilidade !== undefined ? { disponibilidade } : {})} />
  );
}

describe("a barra do molde por estado", () => {
  it("DISPONÍVEL vira formulário, e a versão lida viaja escondida", () => {
    const { container } = montar(POR_ESTADO, ["CERTIFICAR_FOLHA", "LIQUIDAR_FOLHA"], DISP);
    const form = container.querySelector('form[data-acao="devolver"]');
    expect(form).not.toBeNull();
    expect((form?.querySelector('input[name="__versao"]') as HTMLInputElement | null)?.value).toBe("v-123");
  });

  it("NÃO APLICÁVEL sai da barra: nenhum form, nenhum botão — e aparece como estado com o motivo", () => {
    const { container } = montar(POR_ESTADO, ["CERTIFICAR_FOLHA", "LIQUIDAR_FOLHA"], DISP);
    expect(container.querySelector('[data-acao="certificar"]')).toBeNull();
    const item = container.querySelector('[data-acao-estado="nao-aplicavel"][data-acao-nome="certificar"]');
    expect(item?.textContent).toContain("já está certificada");
  });

  it("PRÉ-CONDIÇÃO: travada, SEM <form>, botão focável com aria-disabled e o motivo associado por id", () => {
    const { container } = montar(POR_ESTADO, ["CERTIFICAR_FOLHA", "LIQUIDAR_FOLHA"], DISP);
    expect(container.querySelector('form[data-acao="liquidar"]')).toBeNull();
    const secao = container.querySelector('section[data-acao="liquidar"][data-acao-estado="bloqueada"]');
    expect(secao).not.toBeNull();
    const botao = secao?.querySelector("button") as HTMLButtonElement;
    expect(botao.getAttribute("aria-disabled")).toBe("true");
    // ⚠️ NÃO `disabled`: o botão desabilitado sai da tabulação e quem usa teclado nunca ouve o motivo.
    expect(botao.disabled).toBe(false);
    expect(botao.getAttribute("type")).toBe("button");
    const motivo = container.querySelector(`#${CSS.escape(botao.getAttribute("aria-describedby") ?? "")}`);
    expect(motivo?.textContent).toContain("não pode liquidá-la");
    expect(motivo?.textContent).toContain("Outra pessoa pratica o ato.");
    fireEvent.click(botao);
    expect(acao).not.toHaveBeenCalled();
  });

  it("SEM PERMISSÃO: nenhum motivo de estado — só a falta da permissão", () => {
    const { container } = montar(POR_ESTADO, ["CERTIFICAR_FOLHA"], DISP);
    expect(container.textContent).not.toContain("não pode liquidá-la");
    expect(container.querySelector('[data-acao="liquidar"]')).toBeNull();
    expect(container.textContent).toContain("não tem a permissão necessária para liquidar");
  });

  it("V7 U5 — SEM PERMISSÃO fica num bloco só, NO FIM da barra, depois dos atos que a pessoa pode praticar", () => {
    const { container } = montar(POR_ESTADO, ["CERTIFICAR_FOLHA"], DISP);
    const bloco = container.querySelector("[data-acoes-sem-permissao]");
    expect(bloco?.querySelectorAll("li").length).toBe(1);
    expect(bloco?.textContent).toContain("Você não tem a permissão necessária para liquidar.");
    // O formulário disponível vem ANTES do bloco de sem-permissão na ordem do documento.
    const form = container.querySelector('form[data-acao="devolver"]') as Element;
    expect(form.compareDocumentPosition(bloco as Element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("V7 U5 — ÍNDICE DOS ATOS com três ou mais atos: âncoras para cada ato, travado dito como travado; com menos, sem índice", () => {
    const tresAtos: DisponibilidadeDoRegistro = { versao: "v", porAcao: { certificar: { apresentacao: "disponivel" }, liquidar: { apresentacao: "bloqueada", motivo: "x" }, devolver: { apresentacao: "disponivel" } } };
    const { container } = montar(POR_ESTADO, ["CERTIFICAR_FOLHA", "LIQUIDAR_FOLHA"], tresAtos);
    const links = Array.from(container.querySelectorAll("[data-indice-dos-atos] a")).map((a) => `${a.getAttribute("href")}|${a.textContent}`);
    expect(links).toEqual(["#ato-certificar|Certificar", "#ato-liquidar|Liquidar(travado)", "#ato-devolver|Devolver"]);
    for (const alvo of ["ato-certificar", "ato-liquidar", "ato-devolver"]) expect(container.querySelector(`#${alvo}`)).not.toBeNull();
    cleanup();
    const { container: c2 } = montar(POR_ESTADO, ["CERTIFICAR_FOLHA", "LIQUIDAR_FOLHA"], DISP);
    expect(c2.querySelector("[data-indice-dos-atos]")).toBeNull();
  });

  it("CONSULTA FALHOU (null): tudo TRAVADO com motivo — nenhuma ação é liberada por fallback", () => {
    const { container } = montar(POR_ESTADO, ["CERTIFICAR_FOLHA", "LIQUIDAR_FOLHA"], null);
    expect(container.querySelectorAll("form").length).toBe(0);
    expect(container.querySelectorAll('section[data-acao-estado="bloqueada"]').length).toBe(3);
    expect(container.textContent).toContain("Não foi possível conferir");
  });

  it("AÇÃO SEM ENTRADA na projeção também trava (a porta esqueceu uma ação nova)", () => {
    const parcial: DisponibilidadeDoRegistro = { versao: "v", porAcao: { devolver: { apresentacao: "disponivel" } } };
    const { container } = montar(POR_ESTADO, ["CERTIFICAR_FOLHA", "LIQUIDAR_FOLHA"], parcial);
    expect(container.querySelector('form[data-acao="certificar"]')).toBeNull();
    expect(container.querySelector('section[data-acao="certificar"][data-acao-estado="bloqueada"]')).not.toBeNull();
    expect(container.querySelector('form[data-acao="devolver"]')).not.toBeNull();
  });

  it("O RESULTADO SOBREVIVE À SAÍDA DO FORMULÁRIO — mesmo quando a árvore nova chega ANTES da resposta", async () => {
    // ⚠️ A ORDEM DO NAVEGADOR: a Server Action devolve o resultado JUNTO com a árvore revalidada, e o
    // formulário do ato que deixou de caber é desmontado nessa mesma transição. Aqui a árvore nova
    // (devolver → não aplicável) é aplicada DENTRO da ação, antes de ela responder. Um aviso por efeito
    // do formulário nunca roda nessa ordem — foi o que o percurso do atesto acusou.
    const depois: DisponibilidadeDoRegistro = { versao: "v-124", porAcao: { ...DISP.porAcao, devolver: { apresentacao: "nao-aplicavel", motivo: "já devolvida" } } };
    let aplicarArvoreNova: () => void = () => undefined;
    const feito = vi.fn(async () => {
      aplicarArvoreNova();
      await new Promise((r) => setTimeout(r, 5));
      return { sucesso: "Folha DEVOLVIDA para correção." };
    });
    const { container, rerender } = render(
      <FormsDoRecurso definicao={POR_ESTADO} permitidas={["CERTIFICAR_FOLHA", "LIQUIDAR_FOLHA"]} opcoes={{}} registroId="r1" action={feito} modo="acoes" disponibilidade={DISP} />
    );
    aplicarArvoreNova = () =>
      rerender(<FormsDoRecurso definicao={POR_ESTADO} permitidas={["CERTIFICAR_FOLHA", "LIQUIDAR_FOLHA"]} opcoes={{}} registroId="r1" action={feito} modo="acoes" disponibilidade={depois} />);
    const form = container.querySelector('form[data-acao="devolver"]') as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
      await new Promise((r) => setTimeout(r, 40));
    });
    expect(feito).toHaveBeenCalled();
    expect(container.querySelector('form[data-acao="devolver"]')).toBeNull();
    const aviso = container.querySelector('[data-resultado-da-acao="devolver"][role="status"]');
    expect(aviso?.textContent).toContain("Folha DEVOLVIDA para correção.");
    expect(aviso?.getAttribute("data-resultado-seq")).toBe("1");
  });

  it("CONTRAPROVA: recurso sem `acoesPorEstado` segue oferecendo o formulário por permissão", () => {
    const { container } = montar(SO_PERMISSAO, ["CERTIFICAR_FOLHA", "LIQUIDAR_FOLHA"]);
    expect(container.querySelectorAll("form").length).toBe(3);
    expect(container.querySelector('input[name="__versao"]')).toBeNull();
  });
});
