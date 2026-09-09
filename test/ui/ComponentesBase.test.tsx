// @vitest-environment happy-dom

/**
 * OS COMPONENTES BASE QUE O SCAFFOLD CONSOME.
 *
 * ⚠️ POR QUE O TESTE DE PRECISÃO MONETÁRIA MORA AQUI, e não num gate de lint.
 *
 * A tentação era um `rg -n "parseFloat|Number\("` sobre `components/ui/`. Ele não serve: o
 * `Seletores.tsx:24` coage o ANO do exercício para número, o que é legítimo (ano é inteiro), e um
 * gate que grita sobre o legítimo é um gate que alguém desliga por atrito. Uma allowlist envelhece
 * pior ainda — cresce, ninguém revisa as entradas antigas, e em seis meses é carimbo.
 *
 * Regex pega a FORMA (`parseFloat` escrito); teste pega o EFEITO (a precisão perdida). Se alguém
 * introduzir coerção numérica no caminho do valor, o teste de `0.1 + 0.2` morre — e ele não some
 * por atrito, porque é teste, não configuração.
 */

import { cleanup, fireEvent, render } from "@testing-library/react";
import { Decimal } from "decimal.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CampoSelect, CampoTexto, CampoValor } from "../../components/ui/Campos";
import { Botao } from "../../components/ui/Botao";
import { Alerta } from "../../components/ui/Alerta";
import { Paginacao } from "../../components/ui/Paginacao";
import { TabelaDeDados } from "../../components/ui/TabelaDeDados";

afterEach(() => {
  cleanup();
});

function submeter(form: HTMLFormElement): Record<string, string> {
  const dados = new FormData(form);
  return Object.fromEntries([...dados.entries()].map(([k, v]) => [k, String(v)]));
}

function comForm(ui: React.ReactElement): HTMLFormElement {
  const { container } = render(<form>{ui}</form>);
  return container.querySelector("form")!;
}

const valorVisivel = (): HTMLInputElement =>
  document.querySelector<HTMLInputElement>('input[data-mascara="valor"]')!;

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * PRECISÃO MONETÁRIA — o teste que substitui o gate por regex
 * ════════════════════════════════════════════════════════════════════════════════════════════ */

describe("CampoValor — a precisão atravessa a UI intacta", () => {
  it('⚠️ "0.1" + "0.2" pelo campo somam EXATAMENTE "0.30" via Decimal', () => {
    // O caminho completo: digita → blur → o que o FormData carrega → soma no domínio.
    const lerCru = (digitado: string): string => {
      const form = comForm(<CampoValor name="v" />);
      const input = valorVisivel();
      fireEvent.change(input, { target: { value: digitado } });
      fireEvent.blur(input);
      const cru = submeter(form)["v"]!;
      cleanup();
      return cru;
    };

    const a = lerCru("0.1");
    const b = lerCru("0.2");

    // ⚠️ SE ALGUÉM PUSER COERÇÃO NUMÉRICA NO MEIO, ISTO MORRE: 0.1 + 0.2 em ponto flutuante dá
    // 0.30000000000000004, e a soma abaixo deixa de ser exata. É o efeito, não a forma.
    expect(new Decimal(a).plus(new Decimal(b)).toFixed(2)).toBe("0.30");
  });

  it("as quatro grafias do mesmo valor convergem para o mesmo cru (formatação no BLUR)", () => {
    // ⚠️ NÃO HÁ ACUMULADOR DE CENTAVOS aqui, e é deliberado: `123456` NÃO vira `1.234,56`.
    // MODULO-UI.md:203 — num sistema em que o número digitado vira empenho, esse padrão de
    // fintech transforma dez mil em cem reais quando alguém digita o valor redondo.
    for (const grafia of ["10000", "10000.00", "10.000,00", "10000,00"]) {
      const form = comForm(<CampoValor name="v" />);
      const input = valorVisivel();
      fireEvent.change(input, { target: { value: grafia } });
      fireEvent.blur(input);

      expect(submeter(form)["v"], `grafia "${grafia}"`).toBe("10000.00");
      cleanup();
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * A FIAÇÃO DE ACESSIBILIDADE DO INVÓLUCRO
 * ════════════════════════════════════════════════════════════════════════════════════════════ */

describe("CampoEnvolvido — o erro existe para quem usa leitor de tela", () => {
  it("erro presente ⇒ aria-invalid e aria-describedby APONTANDO para a mensagem", () => {
    const { container } = render(
      <CampoTexto name="numero" rotulo="Número" erro="Já existe contrato com este número." />
    );
    const input = container.querySelector("input")!;

    expect(input.getAttribute("aria-invalid")).toBe("true");

    const descrito = input.getAttribute("aria-describedby");
    expect(descrito, "sem isto a mensagem existe na tela e não para o leitor").not.toBeNull();

    // ⚠️ O ID TEM DE RESOLVER. Um `aria-describedby` apontando para um id inexistente é pior que
    // ausente: parece acessível na revisão e não anuncia nada.
    const alvo = container.querySelector(`#${CSS.escape(descrito!)}`);
    expect(alvo?.textContent).toBe("Já existe contrato com este número.");
  });

  it("ajuda e erro juntos: o ERRO vem primeiro na ordem de leitura", () => {
    const { container } = render(
      <CampoTexto name="cnpj" rotulo="CNPJ" ajuda="Lei 14.133, art. 92" erro="CNPJ inválido." />
    );
    const ids = container.querySelector("input")!.getAttribute("aria-describedby")!.split(" ");
    expect(ids).toHaveLength(2);
    expect(container.querySelector(`#${CSS.escape(ids[0]!)}`)?.textContent).toBe("CNPJ inválido.");
  });

  it("sem erro não há aria-invalid — o campo limpo não se anuncia quebrado", () => {
    const { container } = render(<CampoTexto name="objeto" rotulo="Objeto" />);
    expect(container.querySelector("input")!.getAttribute("aria-invalid")).toBeNull();
  });

  it("o rótulo aponta para o controle por htmlFor/id", () => {
    const { container } = render(<CampoTexto name="objeto" rotulo="Objeto do contrato" />);
    const label = container.querySelector("label")!;
    const input = container.querySelector("input")!;
    expect(label.getAttribute("for")).toBe(input.id);
    expect(input.id).not.toBe("");
  });

  it("largura vira span estático no grid (classe literal, não interpolada)", () => {
    const { container } = render(<CampoTexto name="x" rotulo="X" largura={2} />);
    // ⚠️ `md:` (768px) e NÃO `sm:` (640px): o requisito é colapsar ABAIXO de 768px, e com `sm:`
    // o grid ficaria em 4 colunas espremidas justamente em 768. Só a página de fumaça mostrou.
    expect(container.firstElementChild?.className).toContain("md:col-span-2");
    expect(container.firstElementChild?.className).not.toContain("sm:col-span");
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * SELECT — notificação sem controle
 * ════════════════════════════════════════════════════════════════════════════════════════════ */

describe("CampoSelect — aoMudar notifica, o FormData continua mandando", () => {
  const OPCOES = [
    { valor: "01", rotulo: "Prefeitura" },
    { valor: "02", rotulo: "Câmara" },
  ];

  it("submete pelo name, e aoMudar recebe o valor sem tornar o campo controlado", () => {
    const espiao = vi.fn();
    const form = comForm(
      <CampoSelect name="orgao" rotulo="Órgão" opcoes={OPCOES} defaultValue="01" aoMudar={espiao} />
    );
    const select = form.querySelector("select")!;

    fireEvent.change(select, { target: { value: "02" } });

    expect(espiao).toHaveBeenCalledWith("02");
    // O valor sai pelo FormData, como qualquer campo não-controlado.
    expect(submeter(form)).toEqual({ orgao: "02" });
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * TABELA — ordenação por link, sem estado interno
 * ════════════════════════════════════════════════════════════════════════════════════════════ */

interface Linha {
  readonly numero: string;
  readonly valor: string;
}

const LINHAS: Linha[] = [
  { numero: "001", valor: "1.000,00" },
  { numero: "002", valor: "2.000,00" },
];

const COLUNAS = [
  { chave: "numero", cabecalho: "Número", celula: (l: Linha) => l.numero, ordenavel: true },
  {
    chave: "valor",
    cabecalho: "Valor",
    alinhamento: "direita" as const,
    celula: (l: Linha) => l.valor,
    ordenavel: true,
  },
];

describe("TabelaDeDados — ordenação linkável", () => {
  it("o cabeçalho ordenável vira LINK para o href da PRÓXIMA direção", () => {
    const { container } = render(
      <TabelaDeDados
        colunas={COLUNAS}
        linhas={LINHAS}
        keyDe={(l) => l.numero}
        ordenacao={null}
        hrefDeOrdenacao={(campo, dir) => `?ordem=${campo}&dir=${dir}`}
      />
    );

    // Sem ordenação vigente, o primeiro clique é ascendente.
    const link = container.querySelector('a[data-ordenar="numero"]')!;
    expect(link.getAttribute("href")).toBe("?ordem=numero&dir=asc");
  });

  it("⚠️ clicar na coluna ATIVA inverte a direção; outra coluna recomeça em asc", () => {
    const { container } = render(
      <TabelaDeDados
        colunas={COLUNAS}
        linhas={LINHAS}
        keyDe={(l) => l.numero}
        ordenacao={{ campo: "numero", direcao: "asc" }}
        hrefDeOrdenacao={(campo, dir) => `?ordem=${campo}&dir=${dir}`}
      />
    );

    expect(container.querySelector('a[data-ordenar="numero"]')!.getAttribute("href")).toBe(
      "?ordem=numero&dir=desc"
    );
    // Manter a direção ao trocar de coluna faria o primeiro clique parecer aleatório.
    expect(container.querySelector('a[data-ordenar="valor"]')!.getAttribute("href")).toBe(
      "?ordem=valor&dir=asc"
    );
  });

  it("aria-sort anuncia a coluna ativa e só ela", () => {
    const { container } = render(
      <TabelaDeDados
        colunas={COLUNAS}
        linhas={LINHAS}
        keyDe={(l) => l.numero}
        ordenacao={{ campo: "valor", direcao: "desc" }}
        hrefDeOrdenacao={(campo, dir) => `?ordem=${campo}&dir=${dir}`}
      />
    );
    const ths = [...container.querySelectorAll("th")];
    expect(ths.map((t) => t.getAttribute("aria-sort"))).toEqual(["none", "descending"]);
  });

  it("sem hrefDeOrdenacao o cabeçalho NÃO vira link — nada parece clicável sem ser", () => {
    const { container } = render(
      <TabelaDeDados colunas={COLUNAS} linhas={LINHAS} keyDe={(l) => l.numero} />
    );
    expect(container.querySelector("a[data-ordenar]")).toBeNull();
    expect(container.querySelector("th")!.getAttribute("aria-sort")).toBeNull();
  });

  it("a coluna alinhada à direita ganha tabular-nums (a régua da coluna de valores)", () => {
    const { container } = render(
      <TabelaDeDados colunas={COLUNAS} linhas={LINHAS} keyDe={(l) => l.numero} />
    );
    const celulas = [...container.querySelectorAll("tbody tr:first-child td")];
    expect(celulas[1]!.className).toContain("tabular");
    expect(celulas[1]!.className).toContain("text-right");
    expect(celulas[0]!.className).not.toContain("tabular");
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * BOTÃO, ALERTA, PAGINAÇÃO
 * ════════════════════════════════════════════════════════════════════════════════════════════ */

describe("Botao — carregando impede o duplo submit", () => {
  it("⚠️ carregando desabilita e NÃO dispara onClick, nem no segundo clique", () => {
    const espiao = vi.fn();
    const { container } = render(
      <Botao carregando onClick={espiao}>
        Empenhar
      </Botao>
    );
    const botao = container.querySelector("button")!;

    expect(botao.disabled).toBe(true);
    expect(botao.getAttribute("aria-busy")).toBe("true");

    fireEvent.click(botao);
    fireEvent.click(botao);

    // Num sistema em que o clique vira empenho, o segundo teria número próprio e precisaria de
    // ANULAÇÃO — não de exclusão. Prevenir custa menos.
    expect(espiao).not.toHaveBeenCalled();
  });

  it("sem carregando, o clique passa uma vez por clique", () => {
    const espiao = vi.fn();
    const { container } = render(<Botao onClick={espiao}>Salvar</Botao>);
    fireEvent.click(container.querySelector("button")!);
    expect(espiao).toHaveBeenCalledTimes(1);
  });
});

describe("Alerta — reusa o vocabulário do Badge", () => {
  it("erro usa role=alert (interrompe); os demais usam role=status", () => {
    const { container: erro } = render(<Alerta status="erro" titulo="Falhou" />);
    expect(erro.firstElementChild?.getAttribute("role")).toBe("alert");
    cleanup();

    const { container: ok } = render(<Alerta status="ok" titulo="Salvo" />);
    expect(ok.firstElementChild?.getAttribute("role")).toBe("status");
  });

  it("o título é texto — a cor reforça, não informa sozinha", () => {
    const { container } = render(<Alerta status="alerta" titulo="Contrato vence em 30 dias" />);
    expect(container.textContent).toContain("Contrato vence em 30 dias");
  });
});

describe("Paginacao", () => {
  it('mostra "N–M de T" e liga anterior/próxima', () => {
    const { container } = render(
      <Paginacao
        pagina={2}
        tamanhoPagina={20}
        total={57}
        hrefDePagina={(p) => `?pagina=${p}`}
        rotuloItens="contratos"
      />
    );
    expect(container.textContent).toContain("21");
    expect(container.textContent).toContain("40");
    expect(container.textContent).toContain("57");

    const links = [...container.querySelectorAll("a")];
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["?pagina=1", "?pagina=3"]);
  });

  it("⚠️ com zero registros mostra 0–0, não 1–0 (intervalo impossível)", () => {
    const { container } = render(
      <Paginacao pagina={1} tamanhoPagina={20} total={0} hrefDePagina={(p) => `?pagina=${p}`} />
    );
    expect(container.textContent).toContain("0");
    // As duas pontas desligadas viram <span>, fora da tabulação — link sem destino é beco.
    expect(container.querySelectorAll("a")).toHaveLength(0);
    expect(container.querySelectorAll("[aria-disabled]")).toHaveLength(2);
  });
});
