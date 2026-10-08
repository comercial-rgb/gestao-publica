import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { limparBanco, truncarTudo } from "./limpar-banco.js";

/**
 * ═══ A LIMPEZA DO BANCO DE TESTE ALCANÇA TODA TABELA? ATÉ AQUI, NINGUÉM CONFERIA (V11 V8.9) ═══
 *
 * `limpar-banco.ts` diz, em comentário, que "a lista tem de ser COMPLETA: uma tabela esquecida faz
 * o processo 1/2026 de um teste sobreviver ao seguinte". Estava certo, e era só um comentário.
 *
 * ⚠️ E O DEFEITO ACONTECEU NESTE MESMO LOTE. As duas tabelas da V8.9 nasceram fora da lista, e o
 * sintoma NÃO foi "a lista está incompleta": foram SETE testes vermelhos do arquivo do eixo, com
 * mensagens que apontavam para o domínio ("Republicar a mesma decisão não é um fato novo") — a
 * política publicada no primeiro teste sobrevivendo até o último.
 *
 * ⚠️ V37 — A LISTA SAIU (a limpeza acha as tabelas no catálogo), e com ela os guardas t1 e t2 que a conferiam. Fica
 * o t3, que afirma o EFEITO. O texto abaixo é a história do guarda antigo.
 *
 * ═══ ⚠️ O QUE ESTE GUARD AFIRMAVA NÃO ERA "A LISTA CONTÉM TODA TABELA" ═══
 * Seria uma afirmação ERRADA, e medi-la assim daria 56 acusações falsas. `TRUNCATE ... CASCADE`
 * alcança, além da tabela listada, TODA tabela que a referencia por chave estrangeira — de
 * `ItemDoLote` a `MovimentoDoBordero`, a maior parte do schema é filha de alguém listado e é
 * limpa sem estar na lista.
 *
 * O que importa é a PROPRIEDADE: **toda tabela do schema é alcançada pela limpeza**, seja porque
 * está na lista, seja porque o CASCADE chega nela. É o fecho transitivo das arestas de FK a
 * partir da lista, e é isso que este arquivo calcula — do banco REAL, não de um desenho.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

/**
 * ⚠️ A ÚNICA EXCEÇÃO, E ELA É NOMEADA. `_prisma_migrations` é o registro de quais migrations já
 * rodaram; truncá-la faria o `migrate deploy` seguinte tentar reaplicar tudo desde o começo. Uma
 * lista de exceções que cresce sem motivo é como um guard morre — esta tem uma linha e um porquê.
 */
const FORA_DA_LIMPEZA = new Set(["_prisma_migrations"]);

async function tabelasDoBanco(): Promise<readonly string[]> {
  const linhas = await prisma.$queryRawUnsafe<{ readonly table_name: string }[]>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name`
  );
  return linhas.map((l) => l.table_name).filter((t) => !FORA_DA_LIMPEZA.has(t));
}

describe("a limpeza do banco de teste alcança TODAS as tabelas", () => {
  /**
   * ⚠️ V37 — O EFEITO, NÃO A LISTA. A limpeza deixou de truncar a lista com CASCADE (31 s medidos) e passou a apagar
   * as tabelas COM LINHA, achadas no catálogo do banco, em passadas até esvaziar. O que se afirma aqui é o que ela
   * promete: depois dela, NENHUMA tabela do esquema tem linha, e a sequência recomeça. A cadeia órgão → unidade →
   * ficha tem chaves RESTRICT (a mãe só sai depois da filha); a pessoa leva versão e papel, filhas fora da lista.
   */
  it("t3 — depois da limpeza nenhuma tabela do esquema tem linha, e a sequência recomeça", async () => {
    await limparBanco(prisma);
    await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
    await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "02001", descricao: "Educação", orgaoId: "org-01" } });
    await prisma.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educação" } });
    await prisma.subfuncao.create({ data: { id: "sub-361", codigo: "361", nome: "Ensino fundamental" } });
    await prisma.programa.create({ data: { id: "prg", codigo: "0010", descricao: "P" } });
    await prisma.acao.create({ data: { id: "aca", codigo: "2010", descricao: "A", tipo: "ATIVIDADE" } });
    await prisma.naturezaDespesa.create({ data: { id: "nd-30", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "30", codigoCompleto: "339030", descricao: "Material de consumo" } });
    await prisma.fonteRecurso.create({ data: { id: "fnt-500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
    const base = { exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-12", subfuncaoId: "sub-361", programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd-30", fonteId: "fnt-500", exercicioFonte: 1, valorDotado: "0.00" };
    await prisma.fichaOrcamentaria.create({ data: { ...base, id: "fic-1", numero: 1 } });
    await prisma.pessoa.create({ data: { id: "pes", documento: "11222333000181", tipo: "JURIDICA", criadoPor: "t3", versoes: { create: { nome: "Fornecedor", criadoPor: "t3" } }, movimentos: { create: { papel: "CREDOR", movimento: "CONCEDIDO", data: new Date("2026-01-02T15:00:00Z"), criadoPor: "t3" } } } });
    const sequencia = await prisma.$queryRawUnsafe<{ s: string }[]>(`SELECT pg_get_serial_sequence('"MovimentoPatrimonial"', 'sequencia') AS s`);
    const nomeDaSequencia = sequencia[0]?.s ?? "";
    expect(nomeDaSequencia).not.toBe("");
    await prisma.$queryRawUnsafe(`SELECT nextval('${nomeDaSequencia}'), nextval('${nomeDaSequencia}')`);

    await truncarTudo(prisma);

    const comLinha: string[] = [];
    for (const t of await tabelasDoBanco()) {
      const r = await prisma.$queryRawUnsafe<{ tem: boolean }[]>(`SELECT EXISTS (SELECT 1 FROM "${t}") AS tem`);
      if (r[0]?.tem === true) comLinha.push(t);
    }
    expect(comLinha).toEqual([]);
    const proximo = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT nextval('${nomeDaSequencia}') AS n`);
    expect(String(proximo[0]?.n)).toBe("1");
    // E o banco volta ao estado que os outros arquivos esperam ao começar.
    await limparBanco(prisma);
  });
});
