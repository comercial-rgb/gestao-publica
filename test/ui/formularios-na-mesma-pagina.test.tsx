// @vitest-environment happy-dom

/**
 * VÁRIOS FORMULÁRIOS NA MESMA PÁGINA — a identidade de cada campo e de cada `<form>`.
 *
 * ═══ ⚠️ POR QUE ESTE ARQUIVO EXISTE ═══
 * A tela do processo tem catorze `<form>` simultâneos, e vários compartilham nomes de
 * campo (`texto`, `setorDestinoId`, `processoId`). Isso levantou duas perguntas
 * diferentes, e só uma delas era um defeito:
 *
 *   1. **O smoke apertava o botão errado.** `document.querySelector('[name=texto]')`
 *      devolve o PRIMEIRO do documento: ele preenchia os campos do parecer e submetia o
 *      formulário do trâmite. Era defeito de verdade, corrigido na TELA (cada `<form>`
 *      ganhou `data-acao`) e no smoke (que passou a procurar dentro do formulário).
 *
 *   2. **Os `id` estariam repetidos?** Não estão — e é isso que este arquivo PROVA em vez
 *      de afirmar. `CampoEnvolvido` monta o id com `useId()`, que o React garante único
 *      por instância. Mas "eu li o código e ele usa useId" é exatamente o tipo de
 *      afirmação que envelhece: basta alguém passar um `id` literal num campo novo.
 *
 * ═══ O QUE UM ID REPETIDO QUEBRARIA, CONCRETAMENTE ═══
 * `<label for="x">` aponta para o PRIMEIRO `#x` do documento. Com ids repetidos:
 *   · o leitor de tela anuncia o rótulo do primeiro formulário ao chegar no campo do
 *     segundo — a pessoa ouve "Setor de destino" e está preenchendo o parecer;
 *   · o clique no rótulo do segundo formulário move o foco para o campo do primeiro, e
 *     quem navega por teclado cai no MESMO formulário errado em que o seletor do smoke
 *     caiu.
 *
 * O segundo é o ponto: o defeito do smoke e o defeito de acessibilidade são a mesma
 * doença. O smoke tinha; a tela não tem — e agora há um teste que garante isso.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  CampoNumero,
  CampoSelect,
  CampoTexto,
  CampoTextarea,
} from "../../components/ui/Campos";

afterEach(() => {
  cleanup();
});

/**
 * DUAS AÇÕES, com os MESMOS `name` — que é a situação real da tela do processo.
 *
 * ⚠️ Os `name` REPETIDOS SÃO CORRETOS e não são o alvo do teste. Dois formulários
 * distintos podem (e devem) ter um campo `texto` cada: o `name` é o rótulo do dado DENTRO
 * do formulário que o submete, e o browser monta um `FormData` por `<form>`. O que não
 * pode repetir é o `id`, que é global ao documento.
 */
function DuasAcoes(): React.ReactElement {
  return (
    <div>
      <form data-acao="tramitar">
        <CampoSelect
          name="setorDestinoId"
          rotulo="Setor de destino"
          required
          opcoes={[{ valor: "s1", rotulo: "JUR" }]}
          vazio="Escolha o setor"
        />
        <CampoTextarea name="texto" rotulo="Despacho" ajuda="Vai no histórico." />
        <button type="submit">Tramitar</button>
      </form>

      <form data-acao="solicitar-parecer">
        <CampoSelect
          name="setorDestinoId"
          rotulo="A quem pedir o parecer"
          required
          opcoes={[{ valor: "s2", rotulo: "CONT" }]}
          vazio="Escolha o setor"
        />
        <CampoTextarea name="texto" rotulo="Pedido" erro="O texto é obrigatório." />
        <CampoTexto name="prazo" rotulo="Prazo" />
        <CampoNumero name="dias" rotulo="Dias" />
        <button type="submit">Pedir parecer</button>
      </form>
    </div>
  );
}

describe("dois formulários na mesma página — identidade de campo e de form", () => {
  it("t1: nenhum `id` se repete no documento, mesmo com os `name` repetidos", () => {
    const { container } = render(<DuasAcoes />);

    const ids = Array.from(container.querySelectorAll("[id]")).map((e) => e.id);
    expect(ids.length).toBeGreaterThan(4);

    const repetidos = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(
      repetidos,
      "\n\n⚠️ ID REPETIDO NUM DOCUMENTO COM VÁRIOS FORMULÁRIOS.\n\n" +
        "`<label for>` aponta para o PRIMEIRO elemento com aquele id. Com ids repetidos, o " +
        "leitor de tela anuncia o rótulo do formulário errado, e o clique no rótulo (ou a " +
        "navegação por teclado) leva o foco para o campo do OUTRO formulário.\n\n" +
        "É o mesmo defeito que fez o smoke do ENT02 preencher o parecer e apertar o botão " +
        "do trâmite — ali com `querySelector`, aqui com um usuário de verdade.\n\n" +
        "A causa quase certa: alguém passou um `id` literal em vez de deixar o " +
        "`CampoEnvolvido` gerá-lo com `useId()`.\n\nRepetidos:\n"
    ).toEqual([]);

    // E os `name` REPETEM — de propósito. Se este número cair para zero, o teste deixou de
    // exercitar a situação que ele existe para cobrir.
    const nomes = Array.from(container.querySelectorAll("[name]")).map(
      (e) => (e as HTMLInputElement).name
    );
    expect(nomes.filter((n) => n === "texto")).toHaveLength(2);
    expect(nomes.filter((n) => n === "setorDestinoId")).toHaveLength(2);
  });

  it("t2: todo `label for` aponta para um controle DENTRO do próprio formulário", () => {
    const { container } = render(<DuasAcoes />);

    const rotulos = Array.from(container.querySelectorAll("label[for]"));
    expect(rotulos.length).toBeGreaterThan(4);

    const errados: string[] = [];
    for (const label of rotulos) {
      const alvo = container.querySelector(
        `#${CSS.escape(label.getAttribute("for") as string)}`
      );
      if (alvo === null) {
        errados.push(`"${label.textContent}" aponta para um id que não existe`);
        continue;
      }
      // ⚠️ A CONFERÊNCIA É "MESMO FORMULÁRIO", e não só "existe". Um id único que aponte
      // para o controle do formulário vizinho passaria num teste de unicidade e ainda
      // assim mandaria o foco para o lugar errado.
      if (label.closest("form") !== alvo.closest("form")) {
        errados.push(
          `"${label.textContent}" aponta para um controle de OUTRO formulário`
        );
      }
    }

    expect(
      errados,
      "\n\n⚠️ RÓTULO APONTANDO PARA FORA DO PRÓPRIO FORMULÁRIO.\n\n" +
        "Quem clica no rótulo, ou navega por teclado, é levado ao campo do formulário " +
        "vizinho — e digita a resposta certa no lugar errado.\n\n"
    ).toEqual([]);
  });

  it("t3: cada `<form>` tem `data-acao`, e ele é ÚNICO na página", () => {
    const { container } = render(<DuasAcoes />);

    const forms = Array.from(container.querySelectorAll("form"));
    const semAcao = forms.filter((f) => f.getAttribute("data-acao") === null);
    expect(
      semAcao.length,
      "\n\n⚠️ FORMULÁRIO SEM `data-acao`.\n\n" +
        "Ele é a identidade estável do formulário para o smoke — a mesma disciplina do " +
        "`data-mascara`. Sem ele, o smoke volta a localizar campos por `querySelector` " +
        "global, que devolve o primeiro do documento: foi assim que ele preencheu o " +
        "parecer e apertou o botão do trâmite.\n"
    ).toBe(0);

    const acoes = forms.map((f) => f.getAttribute("data-acao"));
    expect(new Set(acoes).size).toBe(acoes.length);
  });

  it("t4: cada `<form>` submete SÓ os seus campos — o FormData não vaza entre eles", () => {
    const { container } = render(<DuasAcoes />);

    const tramitar = container.querySelector(
      'form[data-acao="tramitar"]'
    ) as HTMLFormElement;
    const parecer = container.querySelector(
      'form[data-acao="solicitar-parecer"]'
    ) as HTMLFormElement;

    (tramitar.querySelector('[name="texto"]') as HTMLTextAreaElement).value =
      "ao juridico";
    (parecer.querySelector('[name="texto"]') as HTMLTextAreaElement).value =
      "manifeste-se";

    // ⚠️ ISTO É O QUE A SERVER ACTION RECEBE. Se os dois formulários se misturassem, o
    // `texto` do parecer chegaria à action do trâmite — e o efeito seria idêntico ao do
    // defeito do smoke, só que com um usuário de verdade no lugar do puppeteer.
    expect(String(new FormData(tramitar).get("texto"))).toBe("ao juridico");
    expect(String(new FormData(parecer).get("texto"))).toBe("manifeste-se");

    // E um campo que só existe no segundo formulário não aparece no primeiro.
    expect(new FormData(tramitar).get("prazo")).toBeNull();
    expect(new FormData(parecer).has("prazo")).toBe(true);
  });

  /**
   * ⚠️ OS QUATRO TESTES ACIMA PROVAM O COMPONENTE; ESTE PROVA AS TELAS.
   *
   * `CampoEnvolvido` gera o id com `useId()` e não há como duplicá-lo — mas ele aceita um
   * `id` por prop, e nada obriga uma tela a usá-lo. Uma página que passe `id="texto"` a
   * dois campos volta a ter o defeito, e os testes de render acima não a alcançam: eles
   * montam um componente sintético.
   *
   * Este grep alcança. Ele varre as telas de verdade e recusa `id` literal em JSX.
   */
  it("t6: nenhuma tela passa `id` LITERAL a um campo — o id vem do `useId`", () => {
    // ⚠️ `process.cwd()`, e NÃO `import.meta.url`. Este arquivo roda em `happy-dom`, onde
    // `import.meta.url` não é uma URL `file:` e o `fileURLToPath` estoura. O Vitest roda a
    // partir da raiz do repositório, que é o que este grep precisa.
    const RAIZ = process.cwd();

    /**
     * ⚠️ A PÁGINA DE FUMAÇA É A EXCEÇÃO, e ela é legítima.
     *
     * `/fumaca` é a vitrine dos componentes: ela demonstra `CampoValor` e `CampoCpfCnpj`
     * fora de um `CampoEnvolvido`, com o `<label htmlFor>` escrito à mão para mostrar
     * justamente a fiação de acessibilidade. Há UM de cada id na página inteira, e ela não
     * é tela de trabalho — nenhum dado do ente passa por ali.
     */
    const PERMITIDOS = new Set(["app/fumaca/page.tsx"]);

    const achados: string[] = [];
    const varrer = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = `${dir}/${e.name}`;
        if (e.isDirectory()) {
          if ([".next", "node_modules"].includes(e.name)) continue;
          varrer(p);
          continue;
        }
        if (!e.name.endsWith(".tsx")) continue;
        const rel = p.slice(RAIZ.length).replace(/^[\\/]/, "").replace(/\\/g, "/");
        if (PERMITIDOS.has(rel)) continue;
        readFileSync(p, "utf8")
          .split("\n")
          .forEach((linha, i) => {
            // ⚠️ COMENTÁRIO NÃO É CÓDIGO. Sem esta linha o grep se acusa: o comentário que
            // EXPLICA por que o `<datalist>` deixou de usar id literal contém, ele mesmo,
            // um `id="x"` de exemplo. Mesma anatomia do grep do M22, que precisou se
            // excluir da própria varredura — um guarda que se denuncia não é um guarda, é
            // um teste que nunca passa.
            const aparada = linha.trim();
            if (aparada.startsWith("//") || aparada.startsWith("*") || aparada.startsWith("/*")) {
              return;
            }
            // `id="algo"` em JSX. `data-*`, `aria-*` e `htmlFor` não entram: o primeiro não
            // é identidade de documento e os outros dois são cobertos pelos testes acima.
            if (/(?<![-\w])id="[^"{]+"/.test(linha)) {
              achados.push(`${rel}:${i + 1}  ${linha.trim().slice(0, 90)}`);
            }
          });
      }
    };
    for (const raiz of ["app", "components"]) varrer(join(RAIZ, raiz));

    expect(
      achados,
      "\n\n⚠️ `id` LITERAL NUMA TELA.\n\n" +
        "O id de um campo vem do `useId()` dentro do `CampoEnvolvido`, e é isso que o torna " +
        "único quando a mesma tela renderiza o componente mais de uma vez — a página do " +
        "processo tem catorze formulários, e a de anexos repete a mesma ilha por movimento.\n\n" +
        "Um id literal repete no segundo render, e aí `<label for>` passa a apontar para o " +
        "campo do primeiro formulário: o leitor de tela anuncia o rótulo errado e o foco vai " +
        "para o lugar errado.\n\n" +
        "Se o caso é legítimo (a vitrine de componentes é), acrescente o arquivo a " +
        "PERMITIDOS com o motivo.\n\nLiterais:\n"
    ).toEqual([]);
  });

  it("t5: o `aria-describedby` do erro e da ajuda também aponta para dentro do form", () => {
    const { container } = render(<DuasAcoes />);

    const comDescricao = Array.from(container.querySelectorAll("[aria-describedby]"));
    expect(comDescricao.length).toBeGreaterThan(0);

    for (const controle of comDescricao) {
      for (const id of (controle.getAttribute("aria-describedby") as string).split(" ")) {
        const alvo = container.querySelector(`#${CSS.escape(id)}`);
        expect(alvo, `o descritor "${id}" não existe no documento`).not.toBeNull();
        // Mesma armadilha do `label for`: um erro anunciado a partir do formulário
        // vizinho diria à pessoa que ela errou um campo que ela nem preencheu.
        expect(alvo?.closest("form")).toBe(controle.closest("form"));
      }
    }
  });
});
