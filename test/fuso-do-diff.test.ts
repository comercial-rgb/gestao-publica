import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { decidirFuso, diffDoRepositorio, unirCaminhos, type EntradaDaDecisao } from "../scripts/fuso-do-diff.js";

/**
 * ⚠️ INSTRUMENTO DE AGENDAMENTO, E POR ISSO ELE PRECISA DA PROVA NAS DUAS DIREÇÕES.
 *
 * Um decisor que sempre responde "roda" está certo e é inútil — devolve o custo que o
 * agendamento existe para evitar. Um que sempre responde "pula" está errado e PARECE certo,
 * porque o portão fica verde e rápido. Os dois erros são invisíveis olhando só o resultado
 * do portão: o primeiro some no tempo, o segundo some no silêncio.
 *
 * Os testes abaixo separam os dois casos. Metade prova acusação, metade prova recusa.
 */

const base = (p: Partial<EntradaDaDecisao> = {}): EntradaDaDecisao => ({
  arquivos: [],
  ler: () => null,
  fimDeLote: false,
  diffConhecido: true,
  ...p,
});

const comConteudo =
  (mapa: Readonly<Record<string, string>>) =>
  (a: string): string | null =>
    mapa[a] ?? null;

describe("quando o passo de fuso precisa rodar", () => {
  describe("acusa — o fuso roda", () => {
    it("no portão que fecha o lote, mesmo sem diff nenhum", () => {
      const d = decidirFuso(base({ fimDeLote: true }));
      expect(d.roda).toBe(true);
      expect(d.porque).toContain("fechamento do lote");
    });

    it("quando o diff não pôde ser determinado — na dúvida, roda", () => {
      const d = decidirFuso(base({ diffConhecido: false }));
      expect(d.roda).toBe(true);
      expect(d.porque).toContain("na dúvida");
    });

    it("quando o diff toca packages/datas, ainda que o arquivo tenha sido APAGADO", () => {
      // `ler` devolve null: é o caso do arquivo removido. O caminho decide sozinho.
      const d = decidirFuso(base({ arquivos: ["packages/datas/index.ts"] }));
      expect(d.roda).toBe(true);
      expect(d.gatilhos).toEqual(["packages/datas/index.ts"]);
    });

    it("quando toca um guard de período ou uma janela de relatório", () => {
      for (const a of [
        "test/periodo-fechado.test.ts",
        "test/data-civil.test.ts",
        "modules/m12-relatorios/m12-rgf-anexo2.test.ts",
      ]) {
        expect(decidirFuso(base({ arquivos: [a] })).roda, a).toBe(true);
      }
    });

    it("quando um arquivo qualquer passa a ler relógio", () => {
      const casos: readonly [string, string][] = [
        ["new Date()", "const agora = new Date();"],
        ["Date.now", "const t = Date.now();"],
        ["toISOString", 'const s = d.toISOString().slice(0, 10);'],
        ["helper civil", "const dia = meioDiaCivil(entrada);"],
        ["vocabulário", "const { competencia } = props;"],
        ["relógio falso", "vi.setSystemTime(new Date(2026, 0, 1));"],
      ];
      for (const [nome, corpo] of casos) {
        const d = decidirFuso(
          base({
            arquivos: ["app/(areas)/estoque/page.tsx"],
            ler: comConteudo({ "app/(areas)/estoque/page.tsx": corpo }),
          })
        );
        expect(d.roda, nome).toBe(true);
        expect(d.gatilhos, nome).toEqual(["app/(areas)/estoque/page.tsx"]);
      }
    });

    it("nomeia os gatilhos no motivo, e resume quando são muitos", () => {
      const arquivos = ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"];
      const ler = (): string => "new Date()";
      const d = decidirFuso(base({ arquivos, ler }));
      expect(d.porque).toContain("a.ts");
      expect(d.porque).toContain("e mais 2");
      expect(d.gatilhos).toHaveLength(5);
    });
  });

  describe("recusa — o fuso é pulado, e é isso que dá valor ao instrumento", () => {
    it("um lote que só mexeu em tela sem data", () => {
      const arquivos = [
        "app/(areas)/almoxarifado/materiais/page.tsx",
        "components/ui/Tabela.tsx",
      ];
      const d = decidirFuso(
        base({
          arquivos,
          ler: comConteudo({
            "app/(areas)/almoxarifado/materiais/page.tsx":
              'export default function Pagina() { return <Lista titulo="Materiais" />; }',
            "components/ui/Tabela.tsx": "export function Tabela({ linhas }) { return null; }",
          }),
        })
      );
      expect(d.roda).toBe(false);
      expect(d.porque).toContain("nenhum dos 2 arquivos");
      expect(d.gatilhos).toEqual([]);
    });

    it("quando nada mudou", () => {
      const d = decidirFuso(base());
      expect(d.roda).toBe(false);
      expect(d.porque).toContain("nada mudou");
    });

    it("um arquivo que NÃO é código não é lido nem acusa", () => {
      // Um .md que fala de competência o tempo todo — como este repositório fala.
      const d = decidirFuso(
        base({
          arquivos: ["docs/doador.md"],
          ler: comConteudo({ "docs/doador.md": "a competencia e o exercicio de 2026" }),
        })
      );
      expect(d.roda).toBe(false);
    });

    it("um caminho que só COMEÇA parecido com packages/datas", () => {
      const d = decidirFuso(
        base({
          arquivos: ["packages/datasul-adaptador/index.ts"],
          ler: comConteudo({ "packages/datasul-adaptador/index.ts": "export const x = 1;" }),
        })
      );
      expect(d.roda).toBe(false);
    });
  });
});

describe("o diff que o agendamento lê", () => {
  it("une o que mudou desde o último verde com o que ainda não foi commitado", () => {
    const diff = "modules/m10-patrimonial/estoque-fisico.ts\npackages/datas/index.ts\n";
    const porcelain = " M app/(areas)/almoxarifado/page.tsx\0?? test/novo.test.ts\0";
    expect(unirCaminhos(diff, porcelain)).toEqual([
      "app/(areas)/almoxarifado/page.tsx",
      "modules/m10-patrimonial/estoque-fisico.ts",
      "packages/datas/index.ts",
      "test/novo.test.ts",
    ]);
  });

  it("o `-z` preserva caminho com parêntese e com acento, sem desescape", () => {
    // Sem `-z`, o git entrega estes entre aspas e com escape octal. Este repositório tem
    // rota `app/(areas)/...`, e um caminho desescapado errado vira arquivo que não existe —
    // que o decisor leria como `null` e deixaria de acusar, em silêncio.
    const porcelain = " M app/(areas)/orçamento/página.tsx\0";
    expect(unirCaminhos("", porcelain)).toEqual(["app/(areas)/orçamento/página.tsx"]);
  });

  it("sem a marca do último portão verde, o diff é DESCONHECIDO e o fuso roda", () => {
    const e = diffDoRepositorio(process.cwd(), "/caminho/que/nao/existe/marca", false);
    expect(e.diffConhecido).toBe(false);
    expect(decidirFuso(e).roda).toBe(true);
  });

  it("com marca válida, lê o repositório de verdade e devolve caminhos relativos", () => {
    const marca = join(tmpdir(), `marca-de-teste-${process.pid}`);
    // HEAD contra HEAD: diff vazio de commits, sobra só o que estiver na área de trabalho.
    writeFileSync(marca, `${execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim()}\n`);
    try {
      const e = diffDoRepositorio(process.cwd(), marca, false);
      expect(e.diffConhecido).toBe(true);
      for (const a of e.arquivos) {
        expect(a.startsWith("/"), `caminho deveria ser relativo: ${a}`).toBe(false);
      }
      // A leitura funciona sobre arquivo que existe, e devolve null para o que não existe.
      expect(e.ler("package.json")).not.toBeNull();
      expect(e.ler("nao-existe-mesmo.ts")).toBeNull();
    } finally {
      rmSync(marca, { force: true });
    }
  });
});
