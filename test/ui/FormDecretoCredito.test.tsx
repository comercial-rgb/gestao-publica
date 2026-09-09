// @vitest-environment happy-dom

/**
 * O FORM DE DECRETO DE CRÉDITO — a validação em TEMPO REAL, e a fronteira que ela não atravessa.
 *
 * ═══ ⚠️ O QUE ESTE ARQUIVO PROTEGE ═══
 * Duas coisas que só falham em silêncio:
 *
 *   (1) O QUE BLOQUEIA. `errosDoRascunho` decide se o botão fica desabilitado. Se um erro parasse
 *       de bloquear, o form deixaria passar um decreto sem ficha (ou com valor zero) e o usuário
 *       receberia um erro de Zod cru no lugar de uma frase em português. Se um erro PASSASSE a
 *       bloquear indevidamente, o form travaria sem dizer por quê.
 *
 *   (2) O QUE **NÃO** BLOQUEIA — e este é o teste que importa mais. O balanceamento por fonte
 *       (TR 5.111) aparece como AVISO e o envio segue, porque quem julga isso é o
 *       `validarBalanceamento` do M03, no domínio puro. No dia em que alguém "melhorar" a tela
 *       fazendo-a bloquear, ela vira um segundo domínio — e o t5 cai. É a doutrina da MODULO-UI:
 *       a tela sugere, o domínio decide.
 *
 * ═══ POR QUE A SERVER ACTION É MOCKADA ═══
 * A ilha importa `./actions`, que é `"use server"` e puxa a porta → o Prisma. Num teste de DOM
 * isso arrastaria o banco inteiro para provar um `disabled`. O mock troca a action por uma função
 * que não faz nada: o que está sob teste é a VALIDAÇÃO, não a gravação (essa é do M03, contra o
 * Postgres, em `m03.test.ts`).
 *
 * A parte PURA da validação (`errosDoRascunho`, `desequilibrioPorFonte`) é testada aqui sem DOM,
 * no primeiro `describe` — o DOM entra só onde a FIAÇÃO pode falhar.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  desequilibrioPorFonte,
  errosDoRascunho,
  type MovimentoRascunho,
} from "../../app/(areas)/planejamento/creditos-adicionais/rascunho";

// ⚠️ Antes do import do componente: a ilha importa `./actions`, que é "use server". Ver o cabeçalho.
vi.mock("../../app/(areas)/planejamento/creditos-adicionais/actions", () => ({
  cadastrarDecretoAction: async () => ({}),
  encerrarDecretoAction: async () => ({}),
}));

const { FormDecretoCredito } = await import(
  "../../app/(areas)/planejamento/creditos-adicionais/FormDecretoCredito"
);

afterEach(() => {
  cleanup();
});

const LEIS = [
  { id: "lei-1", numero: "L-001", ano: 2026, tipoCredito: "SUPLEMENTAR", valorAutorizado: "20000.00" },
];
/** Duas fichas na fonte 500 e uma na 540 — dá para fechar e para NÃO fechar. */
const FICHAS = [
  { id: "f-a", numero: 1, unidadeCodigo: "01001", fonteId: "fnt-500", fonteCodigo: "500", naturezaCodigo: "339039", naturezaDescricao: "Serviços PJ", dotacaoAtualizada: "10000.00", saldoDisponivel: "10000.00" },
  { id: "f-b", numero: 2, unidadeCodigo: "01001", fonteId: "fnt-500", fonteCodigo: "500", naturezaCodigo: "339030", naturezaDescricao: "Material", dotacaoAtualizada: "5000.00", saldoDisponivel: "5000.00" },
  { id: "f-c", numero: 3, unidadeCodigo: "02001", fonteId: "fnt-540", fonteCodigo: "540", naturezaCodigo: "449052", naturezaDescricao: "Equipamentos", dotacaoAtualizada: "8000.00", saldoDisponivel: "8000.00" },
];

const mov = (fichaId: string, tipo: "SUPLEMENTACAO" | "ANULACAO", valor: string, fonteCodigo: string): MovimentoRascunho => ({
  fichaId, tipo, valor, fonteId: `fnt-${fonteCodigo}`, fonteCodigo,
});

const RASCUNHO_BOM = {
  leiId: "lei-1",
  numero: "D-001",
  data: "2026-03-01",
  origemRecurso: "ANULACAO",
  movimentos: [mov("f-a", "ANULACAO", "1500.00", "500"), mov("f-b", "SUPLEMENTACAO", "1500.00", "500")],
};

describe("rascunho do decreto — a validação de FORMA (pura)", () => {
  it("t1: um rascunho completo não tem erro de forma", () => {
    expect(errosDoRascunho(RASCUNHO_BOM)).toEqual([]);
  });

  it("t2: cada campo do cabeçalho em branco nomeia o próprio erro", () => {
    expect(errosDoRascunho({ ...RASCUNHO_BOM, leiId: "" })).toContain("Escolha a lei que autoriza este crédito.");
    expect(errosDoRascunho({ ...RASCUNHO_BOM, numero: "  " })).toContain("Informe o número do decreto.");
    expect(errosDoRascunho({ ...RASCUNHO_BOM, data: "" })).toContain("Informe a data do decreto.");
    expect(errosDoRascunho({ ...RASCUNHO_BOM, origemRecurso: "" })).toContain("Escolha a origem do recurso.");
    // Origem inventada (payload adulterado) é tratada como ausente, não aceita em silêncio.
    expect(errosDoRascunho({ ...RASCUNHO_BOM, origemRecurso: "MAGICA" })).toContain("Escolha a origem do recurso.");
  });

  it("t3: decreto sem movimento é recusado — ele não alteraria dotação nenhuma", () => {
    expect(errosDoRascunho({ ...RASCUNHO_BOM, movimentos: [] })).toContain(
      "Um decreto sem movimento não altera dotação nenhuma — inclua ao menos uma perna."
    );
  });

  it("t4: a perna precisa de ficha e de valor MAIOR QUE ZERO", () => {
    const semFicha = errosDoRascunho({ ...RASCUNHO_BOM, movimentos: [mov("", "SUPLEMENTACAO", "100.00", "500")] });
    expect(semFicha).toContain("Movimento 1: escolha a ficha.");

    for (const ruim of ["", "0", "0.00", "abc", "-100.00"]) {
      expect(
        errosDoRascunho({ ...RASCUNHO_BOM, movimentos: [mov("f-a", "SUPLEMENTACAO", ruim, "500")] }),
        `"${ruim}" não é um valor de perna`
      ).toContain("Movimento 1: informe um valor maior que zero.");
    }
    // ⚠️ O SINAL VEM DO TIPO, nunca de um menos digitado: uma anulação é ANULACAO com valor
    // positivo. Aceitar "-100" abriria duas formas de dizer a mesma coisa, e o domínio só entende uma.
  });

  it("t5: a mesma ficha com o mesmo tipo duas vezes pede consolidação (defesa contra duplo clique)", () => {
    const erros = errosDoRascunho({
      ...RASCUNHO_BOM,
      movimentos: [mov("f-a", "SUPLEMENTACAO", "100.00", "500"), mov("f-a", "SUPLEMENTACAO", "100.00", "500")],
    });
    expect(erros.some((e) => e.includes("some os valores numa linha só"))).toBe(true);

    // A MESMA ficha com tipos DIFERENTES é legítima (anular e suplementar a mesma ficha),
    // e não pode ser confundida com a duplicata.
    expect(
      errosDoRascunho({
        ...RASCUNHO_BOM,
        movimentos: [mov("f-a", "ANULACAO", "100.00", "500"), mov("f-a", "SUPLEMENTACAO", "100.00", "500")],
      })
    ).toEqual([]);
  });
});

describe("desequilíbrio por fonte — o AVISO da TR 5.111", () => {
  it("t6: fecha por fonte = lista vazia; sobra = a fonte e a diferença, com sinal", () => {
    expect(desequilibrioPorFonte(RASCUNHO_BOM.movimentos)).toEqual([]);

    expect(
      desequilibrioPorFonte([mov("f-a", "ANULACAO", "1500.00", "500"), mov("f-b", "SUPLEMENTACAO", "1000.00", "500")])
    ).toEqual([{ fonteCodigo: "500", diferenca: "-500.00" }]);
  });

  it("t7: cada fonte fecha SOZINHA — 5.111 é por fonte, não no total", () => {
    // No total, +1500 e −1500 se cancelam. Por FONTE, as duas estão erradas.
    const fora = desequilibrioPorFonte([
      mov("f-a", "ANULACAO", "1500.00", "500"),
      mov("f-c", "SUPLEMENTACAO", "1500.00", "540"),
    ]);
    expect(fora).toEqual([
      { fonteCodigo: "500", diferenca: "-1500.00" },
      { fonteCodigo: "540", diferenca: "1500.00" },
    ]);
  });
});

describe("FormDecretoCredito — a fiação da validação em tempo real", () => {
  function abrir(): void {
    render(<FormDecretoCredito exercicio={2026} leis={LEIS} fichas={FICHAS} />);
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar decreto" }));
  }

  /**
   * O repo marca ganchos de teste com `data-teste` (a mesma família de `data-chrome` e
   * `data-mascara`), e não com o `data-testid` que o testing-library procura por padrão. Uma
   * função só, para as duas consultas não divergirem.
   */
  const painel = (nome: string): HTMLElement | null =>
    document.querySelector<HTMLElement>(`[data-teste="${nome}"]`);
  const exigirPainel = (nome: string): HTMLElement => {
    const el = painel(nome);
    if (el === null) throw new Error(`o painel [data-teste="${nome}"] não está na tela`);
    return el;
  };

  const botaoSubmeter = (): HTMLButtonElement =>
    screen.getByRole("button", { name: /Cadastrar decreto e lançar movimentos/ }) as HTMLButtonElement;

  /** O que o browser submeteria — a fronteira form → Server Action, lida como a action a lê. */
  function payload(): { readonly ano: string; readonly movimentos: string } {
    const form = document.querySelector("form")!;
    const dados = Object.fromEntries([...new FormData(form).entries()].map(([k, v]) => [k, String(v)]));
    return { ano: dados["ano"] ?? "", movimentos: dados["movimentos"] ?? "" };
  }

  function preencherCabecalho(): void {
    fireEvent.change(screen.getByRole("combobox", { name: /Lei autorizadora/ }), { target: { value: "lei-1" } });
    fireEvent.change(document.querySelector('input[name="numero"]')!, { target: { value: "D-001" } });
    fireEvent.change(document.querySelector('input[name="data"]')!, { target: { value: "2026-03-01" } });
    fireEvent.change(screen.getByRole("combobox", { name: /Origem do recurso/ }), { target: { value: "ANULACAO" } });
  }

  function preencherPerna(i: number, fichaId: string, tipo: string, valor: string): void {
    fireEvent.change(screen.getByLabelText(`Ficha do movimento ${i}`), { target: { value: fichaId } });
    fireEvent.change(screen.getByLabelText(`Tipo do movimento ${i}`), { target: { value: tipo } });
    fireEvent.change(screen.getByLabelText(`Valor do movimento ${i}`), { target: { value: valor } });
  }

  it("t8: nasce bloqueado e lista os erros; some a some conforme se preenche", () => {
    abrir();
    expect(botaoSubmeter().disabled, "form vazio não submete").toBe(true);
    expect(exigirPainel("erros-forma").textContent).toContain("Escolha a lei que autoriza este crédito.");

    preencherCabecalho();
    // Falta a perna — o erro do cabeçalho morreu, o do movimento continua.
    expect(exigirPainel("erros-forma").textContent).not.toContain("Escolha a lei");
    expect(exigirPainel("erros-forma").textContent).toContain("escolha a ficha");
    expect(botaoSubmeter().disabled).toBe(true);

    preencherPerna(1, "f-a", "ANULACAO", "1500.00");
    fireEvent.click(screen.getByRole("button", { name: "+ incluir movimento" }));
    preencherPerna(2, "f-b", "SUPLEMENTACAO", "1500.00");

    expect(painel("erros-forma"), "sem erro de forma, a lista some").toBeNull();
    expect(botaoSubmeter().disabled, "com tudo preenchido, o form submete").toBe(false);
  });

  it("t9: o AVISO de balanceamento reage a cada tecla — e NÃO bloqueia o envio", () => {
    abrir();
    preencherCabecalho();
    preencherPerna(1, "f-a", "ANULACAO", "1500.00");
    fireEvent.click(screen.getByRole("button", { name: "+ incluir movimento" }));
    preencherPerna(2, "f-b", "SUPLEMENTACAO", "1000.00");

    // Não fecha: sobram 500 na fonte 500 — o aviso diz qual fonte e quanto.
    const aviso = exigirPainel("balanceamento");
    expect(aviso.textContent).toContain("ainda não fecham por fonte");
    expect(aviso.textContent).toContain("fonte 500");

    // ⚠️ A LINHA QUE GUARDA A DOUTRINA: desbalanceado, o botão CONTINUA habilitado. Quem recusa
    // é o `validarBalanceamento` do M03. Se este expect virar `true`, a tela virou domínio.
    expect(botaoSubmeter().disabled).toBe(false);

    // Corrigido o valor, o aviso vira confirmação — sem recarregar nada.
    fireEvent.change(screen.getByLabelText("Valor do movimento 2"), { target: { value: "1500.00" } });
    expect(exigirPainel("balanceamento").textContent).toContain("fecham por fonte");
  });

  it("t10: o aviso de balanceamento só aparece na origem ANULACAO", () => {
    abrir();
    preencherCabecalho();
    preencherPerna(1, "f-a", "SUPLEMENTACAO", "1500.00");
    expect(exigirPainel("balanceamento")).toBeTruthy();

    // Recurso NOVO não fecha por fonte — ele bate contra a disponibilidade declarada. Exibir o
    // aviso aqui diria ao usuário que ele errou quando ele acertou.
    fireEvent.change(screen.getByRole("combobox", { name: /Origem do recurso/ }), {
      target: { value: "SUPERAVIT_FINANCEIRO" },
    });
    expect(painel("balanceamento")).toBeNull();
    expect(botaoSubmeter().disabled).toBe(false);
  });

  it("t11: a FONTE de cada perna é derivada da ficha — e NOMEADA enquanto não há ficha", () => {
    abrir();
    preencherCabecalho();

    // ⚠️ Sem ficha, a tela DIZ que não sabe a fonte em vez de exibir um código plausível.
    expect(document.body.textContent).toContain("— escolha a ficha");

    preencherPerna(1, "f-c", "SUPLEMENTACAO", "800.00");
    const enviados: readonly { fonteId: string; fonteCodigo: string; fichaId: string; valor: string }[] =
      JSON.parse(payload().movimentos);
    expect(enviados[0]!.fichaId).toBe("f-c");
    expect(
      enviados[0]!.fonteId,
      "a fonte que atravessa a fronteira é a da FICHA — o adapter do M03 recusa divergência"
    ).toBe("fnt-540");
    expect(enviados[0]!.fonteCodigo).toBe("540");
  });

  it("t12: o valor atravessa CRU (a máscara não vaza) e o exercício vem do recorte da página", () => {
    abrir();
    preencherCabecalho();
    // Digitado em pt-BR, como o servidor público digita.
    preencherPerna(1, "f-a", "SUPLEMENTACAO", "1.500,00");

    const enviados: readonly { valor: string }[] = JSON.parse(payload().movimentos);
    expect(enviados[0]!.valor, "o domínio recebe decimal cru, nunca '1.500,00'").toBe("1500.00");
    expect(payload().ano, "o ano é o da URL, não um campo que o usuário possa divergir").toBe("2026");
  });

  it("t13: remover uma perna a tira do payload e do balanceamento", () => {
    abrir();
    preencherCabecalho();
    preencherPerna(1, "f-a", "ANULACAO", "1500.00");
    fireEvent.click(screen.getByRole("button", { name: "+ incluir movimento" }));
    preencherPerna(2, "f-b", "SUPLEMENTACAO", "1500.00");
    expect(JSON.parse(payload().movimentos).length).toBe(2);

    fireEvent.click(screen.getByRole("button", { name: "Remover movimento 2" }));
    expect(JSON.parse(payload().movimentos).length).toBe(1);
    expect(exigirPainel("balanceamento").textContent, "com uma perna só, deixa de fechar").toContain(
      "ainda não fecham"
    );
  });

  it("t14: sem lei cadastrada, o form NOMEIA a pendência em vez de oferecer um cadastro que não existe", () => {
    render(<FormDecretoCredito exercicio={2026} leis={[]} fichas={FICHAS} />);
    expect(document.body.textContent).toContain("Sem lei de crédito neste exercício");
    expect(document.body.textContent).toContain("fica NOMEADO aqui como a próxima fatia");
    expect(screen.queryByRole("button", { name: "Cadastrar decreto" })).toBeNull();
  });
});
