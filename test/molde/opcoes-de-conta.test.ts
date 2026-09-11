import { describe, expect, it } from "vitest";
import {
  RECURSOS_DO_MOLDE,
} from "../../lib/portas/recursos/definicoes.js";
import { verificarDefinicao } from "../../lib/molde/tipos.js";
import { carregarPlanoOficial } from "../../prisma/seed/oficial/pcasp-oficial.js";

/**
 * ═══ UM CAMPO "CONTA DO PASSIVO" TEM DE PODER OFERECER UMA CONTA DE PASSIVO ═══
 *
 * ⚠️ O DEFEITO QUE ISTO IMPEDE FOI CRIADO NESTE MESMO LOTE, e ele é do tipo que não estoura.
 * Até o ENT04 o banco tinha 64 contas: `opcoesDoCadastro` pedia "todas as analíticas" com
 * `take: 500` e trazia todas. Com o plano oficial do TCE-PB (7.864 contas, 6.074
 * analíticas), as 500 primeiras POR CÓDIGO são **todas da classe 1** — e o campo "Conta do
 * passivo" da dívida fundada passou a não oferecer nenhuma conta de passivo.
 *
 * Nada quebrou. O formulário montou, o `select` apareceu, e simplesmente não havia o que
 * escolher — o cadastro ficou impossível sem uma linha de erro em lugar nenhum. **Lista
 * curta não é exceção: é um formulário bonito e inútil.**
 *
 * ⚠️ E A CORREÇÃO É DECLARATIVA, não um teto maior. O descritor diz QUAIS CLASSES o campo
 * aceita, `verificarDefinicao` cobra a declaração, e a consulta filtra por elas. Um teto
 * maior adiaria o mesmo defeito para o dia em que o plano crescesse — e ainda mandaria
 * 400 KB de `<option>` para o navegador.
 */

describe("as classes de conta do molde", () => {
  const { contas } = carregarPlanoOficial();
  const analiticasPorClasse = new Map<string, number>();
  for (const c of contas) {
    if (!c.analitica) continue;
    const classe = c.codigo[0] as string;
    analiticasPorClasse.set(classe, (analiticasPorClasse.get(classe) ?? 0) + 1);
  }

  it("todo cadastro com campo de conta DECLARA as classes que aceita", () => {
    const semDeclarar = RECURSOS_DO_MOLDE.filter(
      (d) =>
        d.campos.some((c) => c.nome === "contaContabilId") &&
        (d.classesDeConta === undefined || d.classesDeConta.length === 0)
    ).map((d) => d.nome);
    expect(
      semDeclarar,
      "sem a classe declarada, a consulta oferece 'todas as analíticas' — e o teto da " +
        "consulta corta justamente a classe que o campo precisa."
    ).toEqual([]);
  });

  it("⚠️ TODA CLASSE DECLARADA TEM CONTA ANALÍTICA NO PLANO OFICIAL", () => {
    // Se um descritor declarasse, digamos, a classe 9, a lista viria vazia e o cadastro
    // ficaria impossível — exatamente o defeito, com outra causa.
    const vazias: string[] = [];
    for (const d of RECURSOS_DO_MOLDE) {
      for (const classe of d.classesDeConta ?? []) {
        const quantas = analiticasPorClasse.get(classe) ?? 0;
        if (quantas === 0) vazias.push(`${d.nome} declara a classe ${classe}, que não tem analítica`);
      }
    }
    expect(vazias).toEqual([]);
  });

  it("o descritor é RECUSADO quando tem campo de conta e não declara a classe", () => {
    const base = RECURSOS_DO_MOLDE.find((d) =>
      d.campos.some((c) => c.nome === "contaContabilId")
    );
    expect(base, "nenhum cadastro do molde usa conta contábil — o teste perdeu o alvo").toBeDefined();

    const { classesDeConta: _removida, ...semClasse } = base as typeof base & {
      classesDeConta?: readonly string[];
    };
    const erros = verificarDefinicao(semClasse as never);
    expect(erros.join(" ")).toMatch(/classesDeConta/);
  });

  it("classe fora das oito do PCASP é recusada", () => {
    const base = RECURSOS_DO_MOLDE.find((d) =>
      d.campos.some((c) => c.nome === "contaContabilId")
    ) as never as { readonly classesDeConta?: readonly string[] };
    const erros = verificarDefinicao({
      ...(base as object),
      classesDeConta: ["9"],
    } as never);
    expect(erros.join(" ")).toMatch(/classe de conta "9"/);
  });
});
