import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { limparBanco } from "./limpar-banco.js";
import { criarFichaDeTeste } from "./ficha-teste.js";
import { criarM05Deps } from "../modules/m05-despesa/adapter-prisma.js";
import { roteiroEmpenho, type RoteiroContabil } from "../modules/m05-despesa/dominio.js";
import { empenhar } from "../modules/m05-despesa/servico.js";
import { ACAO_DO_SERVICO } from "../modules/m16-travamento/acoes.js";
import type { M05Deps } from "../modules/m05-despesa/ports.js";

/**
 * A BORDA DE ESCRITA — os testes 3, 13 e 23 do incremento.
 *
 *   3.  Duas abas em entidades diferentes não trocam o destino de uma escrita.
 *   13. Repetição com a mesma chave não duplica.
 *   23. Nenhum `GET` emite despesa, cancela ou estorna.
 *
 * Os três têm a mesma natureza: são sobre COMO a escrita chega ao domínio, e nenhum deles
 * se prova olhando só o domínio.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const RAIZ = fileURLToPath(new URL("..", import.meta.url));

function arquivos(dir: string, filtro: (nome: string) => boolean): readonly string[] {
  const achados: string[] = [];
  const varrer = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".next") continue;
        varrer(p);
        continue;
      }
      if (filtro(e.name)) achados.push(p);
    }
  };
  varrer(dir);
  return achados;
}

const rel = (p: string): string =>
  p.slice(RAIZ.length).replace(/^[\\/]/, "").replace(/\\/g, "/");

// ════════════════════════════════════════════════════════════════════════════
// 23 — NENHUM `GET` EMITE, CANCELA OU ESTORNA
// ════════════════════════════════════════════════════════════════════════════

describe("teste 23 — nenhum GET produz transição de estado", () => {
  /**
   * ⚠️ POR QUE ISTO IMPORTA MAIS DO QUE PARECE.
   *
   * Um `GET` que escreve é acionado por qualquer coisa que siga um link: o prefetch do
   * navegador, o crawler do antivírus corporativo, o preview de um link colado no chat da
   * secretaria. Ninguém clicou em nada, e o empenho foi anulado.
   *
   * E o método não protege sozinho: o que protege é o `GET` não CHAMAR a mutação. Por isso
   * o teste varre as rotas e procura o nome dos serviços de mutação — o mesmo censo do
   * M16, para não haver uma segunda lista que envelhece.
   */
  const MUTACOES = Object.keys(ACAO_DO_SERVICO);

  it("todas as rotas HTTP são GET de LEITURA — e nenhuma chama serviço de mutação", () => {
    const rotas = arquivos(join(RAIZ, "app"), (n) => n === "route.ts");
    expect(rotas.length, "deveria haver rotas HTTP para conferir").toBeGreaterThan(0);

    const infratores: string[] = [];
    for (const p of rotas) {
      const fonte = readFileSync(p, "utf8");
      const semComentario = fonte
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/[^\n]*/gm, "$1");

      const metodos = [...semComentario.matchAll(/export\s+async\s+function\s+(\w+)\s*\(/g)]
        .map((m) => m[1]!)
        .filter((m) => ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(m));

      // Uma rota que só tem GET não pode chamar mutação. Uma que tenha POST é outra
      // conversa — e hoje não existe nenhuma, o que é a razão de o teste ser tão direto.
      if (!metodos.every((m) => m === "GET")) continue;

      for (const servico of MUTACOES) {
        if (new RegExp(`\\b${servico}\\s*\\(`).test(semComentario)) {
          infratores.push(`${rel(p)} → GET chama ${servico}()`);
        }
      }
      // A escrita também chega por `comEscritaAutenticada` — a porta de toda mutação da UI.
      if (/comEscritaAutenticada\s*\(/.test(semComentario)) {
        infratores.push(`${rel(p)} → GET chama comEscritaAutenticada()`);
      }
    }

    expect(
      infratores,
      "\n\n⚠️ UM `GET` QUE ESCREVE.\n\n" +
        "Ele é acionado por qualquer coisa que siga um link: o prefetch do navegador, o " +
        "crawler do antivírus, o preview de um link colado no chat. Ninguém clicou, e o " +
        "fato aconteceu.\n\nOcorrências:\n"
    ).toEqual([]);
  });

  it("as Server Actions vivem em arquivos `\"use server\"` — nunca dentro de uma rota GET", () => {
    // ⚠️ A DIRETIVA É O QUE FAZ O NEXT SERVIR A FUNÇÃO SÓ POR POST. Uma mutação escrita
    // dentro de um `route.ts` de GET não teria essa proteção — ela seria alcançável pelo
    // método errado, e o framework não avisaria.
    const rotas = arquivos(join(RAIZ, "app"), (n) => n === "route.ts");
    const comDiretiva = rotas.filter((p) =>
      /^\s*["']use server["']/m.test(readFileSync(p, "utf8"))
    );
    expect(
      comDiretiva.map(rel),
      "um `route.ts` com \"use server\" mistura os dois contratos: a rota responde a GET e " +
        "as funções do arquivo viram Server Actions. Separe."
    ).toEqual([]);

    const actions = arquivos(join(RAIZ, "app"), (n) => n === "actions.ts");
    const semDiretiva = actions.filter(
      (p) => !/^\s*["']use server["']/m.test(readFileSync(p, "utf8"))
    );
    expect(
      semDiretiva.map(rel),
      "Server Action sem a diretiva `\"use server\"` no topo do arquivo."
    ).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3 — DUAS ABAS EM ENTIDADES DIFERENTES NÃO TROCAM O DESTINO DE UMA ESCRITA
// ════════════════════════════════════════════════════════════════════════════

describe("teste 3 — o destino da escrita vem do FORMULÁRIO, não do contexto", () => {
  /**
   * ═══ A FALHA QUE ISTO IMPEDE ═══
   * O operador tem duas abas: numa, a Saúde; noutra, a Educação. Ele preenche o empenho na
   * aba da Saúde e envia. Se o destino da escrita fosse resolvido a partir do contexto —
   * um cookie, um cabeçalho, uma variável de sessão —, a última aba que tocou o contexto
   * decidiria em qual unidade o empenho nasce. **E não haveria erro:** o empenho existiria,
   * na unidade errada, com o dinheiro da dotação errada.
   *
   * ═══ O DESENHO QUE FECHA ISSO ═══
   * Toda escrita nomeia o ALVO por id (`fichaId`, `liquidacaoId`, `empenhoId`), e a
   * autorização resolve a unidade **a partir do alvo** (`autorizarNo(tx, quem, acao,
   * { ficha })`). O contexto do cabeçalho é conveniência de leitura — ele filtra listas, e
   * não decide onde nada nasce.
   *
   * ⚠️ ESTE TESTE É ESTRUTURAL, e é por isso que ele é um grep. O comportamento (permissão
   * por unidade, com duas UGs de verdade) já é provado em `m16-rollout.test.ts`. O que
   * nenhum teste de comportamento pega é a Server Action FUTURA que resolva a unidade
   * lendo o cookie — ela passaria em tudo, e só quebraria com duas abas abertas.
   */
  it("nenhuma Server Action lê contexto ambiente para decidir ONDE escrever", () => {
    const actions = arquivos(join(RAIZ, "app"), (n) => n === "actions.ts");
    expect(actions.length).toBeGreaterThan(0);

    const infratores: string[] = [];
    for (const p of actions) {
      const fonte = readFileSync(p, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/[^\n]*/gm, "$1");

      for (const [padrao, oQue] of [
        [/\bcookies\s*\(/, "lê cookies() na action"],
        [/\bheaders\s*\(\s*\)/, "lê headers() na action"],
        [/searchParams/, "lê searchParams na action"],
      ] as const) {
        if (padrao.test(fonte)) infratores.push(`${rel(p)} → ${oQue}`);
      }
    }

    expect(
      infratores,
      "\n\n⚠️ UMA SERVER ACTION LENDO CONTEXTO AMBIENTE.\n\n" +
        "O destino de uma escrita tem de vir do FORMULÁRIO (o id do alvo), nunca de " +
        "cookie, cabeçalho ou URL. Com duas abas em unidades diferentes, o contexto da " +
        "última aba que o tocou decidiria onde o fato nasce — e não haveria erro nenhum: " +
        "o fato existiria, na unidade errada.\n\n" +
        "A sessão (quem é o autor) é outra coisa e continua vindo do cookie, dentro de " +
        "`comEscritaAutenticada` — ela diz QUEM, não ONDE.\n\nOcorrências:\n"
    ).toEqual([]);
  });

  it("quem resolve a unidade é o ALVO da escrita — e o censo do escopo prova isso", () => {
    // O `EscopoDoFato` do M16 é a lista dos alvos a partir dos quais a unidade é resolvida:
    // ficha, empenho, liquidação, pagamento, inscrição… Nenhum deles é "contexto", "sessão"
    // ou "unidade atual", e é essa ausência que o teste fixa.
    const escopo = readFileSync(join(RAIZ, "modules/m16-travamento/escopo.ts"), "utf8");
    for (const proibido of ["contextoAtual", "unidadeAtual", "sessao.ug", "cookies("]) {
      expect(
        escopo.includes(proibido),
        `\`escopo.ts\` menciona "${proibido}" — a unidade tem de sair do ALVO do fato.`
      ).toBe(false);
    }
    // E o alvo por id continua sendo a forma: uma amostra do que o tipo aceita.
    for (const alvo of ["ficha", "empenho", "liquidacao", "pagamento"]) {
      expect(escopo).toContain(`readonly ${alvo}: string`);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 13 — MESMA CHAVE NÃO DUPLICA
// ════════════════════════════════════════════════════════════════════════════

const CONTAS = [
  { id: "b-disp", codigo: "6.2.2.1.1.00.00", nome: "Crédito Disponível", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "b-emp", codigo: "6.2.2.1.3.01.00", nome: "Crédito Empenhado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
];
const R_EMPENHO: RoteiroContabil = roteiroEmpenho({
  creditoDisponivel: "6.2.2.1.1.00.00",
  creditoEmpenhado: "6.2.2.1.3.01.00",
});
const POR = "m05@cg.pb.gov.br";
const FICHA = "ficha-borda";

let deps: M05Deps;

describe("teste 13 — repetir a mesma chave não duplica o fato", () => {
  beforeAll(async () => {
    await limparBanco(prisma);
    await prisma.contaPcasp.createMany({ data: CONTAS });
    await prisma.orgao.create({ data: { id: "b-org", codigo: "01", nome: "Prefeitura" } });
    await prisma.unidadeOrcamentaria.create({
      data: { id: "b-uo", codigo: "01001", descricao: "Administração", orgaoId: "b-org" },
    });
    await prisma.funcao.create({ data: { id: "b-fun", codigo: "04", nome: "Administração" } });
    await prisma.subfuncao.create({ data: { id: "b-sub", codigo: "122", nome: "Administração Geral" } });
    await prisma.programa.create({ data: { id: "b-prg", codigo: "0001", descricao: "Gestão" } });
    await prisma.acao.create({ data: { id: "b-aca", codigo: "2001", descricao: "Manutenção", tipo: "ATIVIDADE" } });
    await prisma.naturezaDespesa.create({
      data: {
        id: "b-nd", codCategoria: "3", codNatureza: "3", codModalidade: "90",
        codElemento: "39", codigoCompleto: "339039", descricao: "Serviços PJ",
      },
    });
    await prisma.fonteRecurso.create({
      data: { id: "b-fnt", codigo: "500", descricao: "Livre", codigoTce: "500" },
    });
    await criarFichaDeTeste(prisma, {
      id: FICHA, exercicio: 2026, numero: 1,
      orgaoId: "b-org", unidadeOrcId: "b-uo", funcaoId: "b-fun", subfuncaoId: "b-sub",
      programaId: "b-prg", acaoId: "b-aca", naturezaDespesaId: "b-nd", fonteId: "b-fnt",
      valorDotado: "100000.00",
    });
    deps = criarM05Deps(prisma);
  });

  const empenhoDe = (valor: string) => ({
    fichaId: FICHA, numero: "2026NE-CHAVE", tipo: "ORDINARIO" as const, valor,
    data: new Date("2026-04-10T12:00:00Z"), credorCpfCnpj: "12345678000199",
    historico: "empenho da chave repetida",
    categoriaOrdemCronologica: "PRESTACAO_SERVICOS" as const, criadoPor: POR,
  });

  /**
   * ⚠️ ESTE SISTEMA **REJEITA** A DUPLICATA; ele NÃO devolve o efeito anterior.
   *
   * O incremento pede duas coisas na mesma linha: *"repetição idempotente retorna o mesmo
   * efeito; payload divergente com mesma chave não duplica"*. A segunda está implementada e
   * é o que este teste mede. A PRIMEIRA não: repetir a mesma requisição não devolve o
   * empenho anterior — devolve uma recusa por chave duplicada.
   *
   * É uma decisão, e ela está registrada como tal: retorno idempotente exige uma chave de
   * IDEMPOTÊNCIA por requisição (um cabeçalho, guardado com o resultado), que é outra
   * coisa do que a chave de NEGÓCIO (`ficha + número`). Fingir que uma é a outra faria o
   * sistema devolver "sucesso" para uma segunda nota de empenho com o mesmo número e VALOR
   * DIFERENTE — o pior dos dois mundos. Pendência **IDEMPOTENCIA-DE-REQUISICAO**.
   */
  it("mesma chave, MESMO payload: o segundo é recusado — e o primeiro fica intacto", async () => {
    const primeiro = await empenhar(empenhoDe("1000.00"), R_EMPENHO, deps);

    await expect(empenhar(empenhoDe("1000.00"), R_EMPENHO, deps)).rejects.toThrow();

    const todos = await prisma.empenho.findMany({
      where: { numero: "2026NE-CHAVE" },
      select: { id: true, valor: true },
    });
    expect(todos).toHaveLength(1);
    expect(todos[0]?.id).toBe(primeiro.empenhoId);
    expect(todos[0]?.valor.toFixed(2)).toBe("1000.00");
  });

  it("mesma chave, payload DIVERGENTE: não duplica e não sobrescreve", async () => {
    // ⚠️ O CASO PERIGOSO. Um sistema que "aceitasse" a repetição por idempotência ingênua
    // devolveria sucesso — e quem enviou acreditaria que o empenho vale 5.000,00.
    await expect(empenhar(empenhoDe("5000.00"), R_EMPENHO, deps)).rejects.toThrow();

    const todos = await prisma.empenho.findMany({
      where: { numero: "2026NE-CHAVE" },
      select: { valor: true },
    });
    expect(todos).toHaveLength(1);
    expect(
      todos[0]?.valor.toFixed(2),
      "o valor do primeiro não pode ter sido sobrescrito pelo segundo"
    ).toBe("1000.00");
  });

  it("a garantia é do BANCO, não do código — a unicidade está no schema", () => {
    // Um guard em JS ("já existe um empenho com este número?") perde a corrida: duas
    // requisições simultâneas leem "não existe" e as duas gravam. A `@@unique` do Postgres
    // é a única que não perde.
    const schema = readFileSync(join(RAIZ, "prisma/schema/m05-despesa.prisma"), "utf8");
    expect(schema).toContain("@@unique([fichaId, numero])");
    expect(schema).toContain("@@unique([empenhoId, numero])");
    expect(schema).toContain("@@unique([liquidacaoId, numero])");
  });
});
