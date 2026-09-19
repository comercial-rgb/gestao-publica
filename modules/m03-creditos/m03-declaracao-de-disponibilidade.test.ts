import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichasDeTeste } from "../../test/ficha-teste.js";
import { abrirExercicio } from "../m08-restos-a-pagar/exercicio.js";
import { criarM03Deps } from "./adapter-prisma.js";
import { usosDoRecursoNovo } from "./consulta-da-disponibilidade.js";
import { criarDecreto, criarLei, declararDisponibilidade, executarCredito } from "./servico.js";
import type { M03Deps } from "./ports.js";

/**
 * A DECLARAÇÃO DA DISPONIBILIDADE DE RECURSO NOVO (V11 V7.3) — versionada, com piso.
 *
 * ═══ ⚠️ O QUE ESTE ARQUIVO PROTEGE ═══
 * Este número é o que AUTORIZA a despesa por superávit, excesso de arrecadação ou operação de
 * crédito. Três coisas dele falham em silêncio, e cada uma tem um teste:
 *
 *  (1) SOBRESCREVER. Até a V7.3 havia uma linha por (exercício, fonte, origem), e redeclarar
 *      TROCAVA o valor. Um decreto aprovado contra 100.000 passava a constar aprovado contra
 *      40.000 — e nada no banco lembrava o contrário. t2 exige que a versão anterior CONTINUE lá.
 *
 *  (2) DECLARAR ABAIXO DO USADO. Sem piso, a declaração nova deixa decreto VIVO apoiado em
 *      recurso que ela mesma nega, e o sistema só percebe no decreto seguinte — quando já não é
 *      mais possível saber o que corrigir. t3.
 *
 *  (3) LER A VERSÃO ERRADA. O guard do crédito tem de conferir contra a VIGENTE. Ler qualquer
 *      outra conferiria o decreto contra um número já substituído; ler todas listaria a mesma
 *      fonte várias vezes na tela. t4 e t5.
 *
 * ═══ FIXTURE N=2, DE PROPÓSITO ═══
 * Versionamento só se manifesta em CONJUNTO: com uma declaração só, uma tabela versionada e uma
 * sobrescrita se comportam de forma idêntica. Todo teste que importa aqui declara DUAS vezes.
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula.
await exigirBanco(prisma);

const POR = "m03@cg.pb.gov.br";
const FONTE = "fnt-500";
const FICHA = "ficha-500";
const APURACAO = "Balanco de 2025 — quadro do superavit financeiro, fonte 500";

const C_DISPONIVEL = "6.2.2.1.1.00.00";
const DOT_INICIAL = "5.2.2.1.1.01.00";
const CRED_SUPLEMENTAR = "5.2.2.1.2.01.00";

let deps: M03Deps;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  deps = criarM03Deps(prisma);

  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-disp", codigo: C_DISPONIVEL, nome: "Credito Disponivel", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-dot", codigo: DOT_INICIAL, nome: "Credito Inicial", naturezaSaldo: "DEVEDORA", nivel: 6, analitica: true },
      { id: "c-supl", codigo: CRED_SUPLEMENTAR, nome: "Credito Adicional - Suplementar", naturezaSaldo: "DEVEDORA", nivel: 6, analitica: true },
    ],
    skipDuplicates: true,
  });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "01001", descricao: "Educacao", orgaoId: "org-01" } });
  await prisma.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educacao" } });
  await prisma.subfuncao.create({ data: { id: "sub-361", codigo: "361", nome: "EF" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0012", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({
    data: { id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Servicos PJ" },
  });
  await prisma.fonteRecurso.create({ data: { id: FONTE, codigo: "500", descricao: "Nao vinculados", codigoTce: "500" } });
  await abrirExercicio(prisma, { ano: 2026, criadoPor: POR });
  await criarFichasDeTeste(prisma, [
    {
      exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-12",
      programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd",
      id: FICHA, numero: 1, subfuncaoId: "sub-361", fonteId: FONTE, valorDotado: "10000.00",
    },
  ]);
}

/** Declara, com a explicação padrão quando nenhuma outra é dada. */
async function declarar(valor: string, descricao = APURACAO): Promise<{ readonly versao: number; readonly anterior: string | null }> {
  return declararDisponibilidade(
    { exercicio: 2026, fonteId: FONTE, origem: "EXCESSO_ARRECADACAO", valor, descricao, criadoPor: POR },
    deps
  );
}

/** Suplementa a ficha por EXCESSO DE ARRECADAÇÃO — o consumo da disponibilidade. */
async function suplementar(numero: string, valor: string): Promise<void> {
  const lei = await criarLei(
    { numero: `L-${numero}`, ano: 2026, tipoCredito: "SUPLEMENTAR", valorAutorizado: "100000.00", dataPublicacao: new Date("2026-02-01T12:00:00Z"), criadoPor: POR },
    deps
  );
  const decreto = await criarDecreto(
    { leiId: lei, numero, ano: 2026, data: new Date("2026-02-02T12:00:00Z"), origemRecurso: "EXCESSO_ARRECADACAO", criadoPor: POR },
    deps
  );
  await executarCredito(
    { decretoId: decreto, criadoPor: POR, itens: [{ fichaId: FICHA, tipo: "SUPLEMENTACAO", valor, fonteId: FONTE }] },
    deps
  );
}

async function versoes(): Promise<readonly { readonly versao: number; readonly valor: string }[]> {
  const linhas = await prisma.disponibilidadeRecursoNovo.findMany({
    where: { exercicio: 2026, fonteId: FONTE, origem: "EXCESSO_ARRECADACAO" },
    orderBy: { versao: "asc" },
    select: { versao: true, valor: true },
  });
  return linhas.map((l) => ({ versao: l.versao, valor: l.valor.toFixed(2) }));
}

beforeEach(semear);
afterAll(async () => {
  await prisma.$disconnect();
});

describe("a declaração da disponibilidade de recurso novo", () => {
  it("t1: a primeira declaração nasce na versão 1, e diz que não substituiu nada", async () => {
    const r = await declarar("50000.00");
    expect(r.versao).toBe(1);
    expect(r.anterior).toBeNull();
    expect(await versoes()).toEqual([{ versao: 1, valor: "50000.00" }]);
  });

  it("t2: redeclarar cria uma VERSÃO — a anterior CONTINUA no banco (N=2)", async () => {
    await declarar("50000.00");
    const r = await declarar("80000.00", "Balanco de 2025 — retificacao do quadro do superavit");

    expect(r.versao).toBe(2);
    expect(r.anterior).toBe("50000.00");

    // ⚠️ A AFIRMAÇÃO CENTRAL DESTE ARQUIVO: nada foi apagado. Com a tabela sobrescrita, esta
    // lista teria UM elemento — e o 50.000 contra o qual algum decreto pode ter sido aprovado
    // teria desaparecido sem deixar rastro.
    expect(await versoes()).toEqual([
      { versao: 1, valor: "50000.00" },
      { versao: 2, valor: "80000.00" },
    ]);
  });

  it("t3: declarar ABAIXO do que a fonte já usou é recusado NOMEANDO o usado, e nada é gravado", async () => {
    await declarar("50000.00");
    await suplementar("D-1", "30000.00");

    await expect(declarar("20000.00", "Apuracao revista para baixo")).rejects.toThrow(
      /MENOR do que o que a fonte 500 já suplementou[\s\S]*30000\.00/
    );

    // Continua na versão 1: a recusa não deixou meia declaração.
    expect(await versoes()).toEqual([{ versao: 1, valor: "50000.00" }]);
  });

  it("t3b: declarar EXATAMENTE o que já foi usado passa — o piso é o usado, não mais", async () => {
    await declarar("50000.00");
    await suplementar("D-1", "30000.00");
    const r = await declarar("30000.00", "Apuracao revista: a fonte rendeu so o que ja foi usado");
    expect(r.versao).toBe(2);
  });

  it("t4: o guard do crédito confere contra a VIGENTE, não contra a primeira", async () => {
    await declarar("50000.00");
    // A retificação DERRUBA o teto para 35.000.
    await declarar("35000.00", "Balanco de 2025 — retificacao para baixo do superavit apurado");

    // 35.000 ainda cabe…
    await suplementar("D-1", "35000.00");
    // …e um centavo além do NOVO teto, não. Se o guard lesse a versão 1, isto passaria.
    await expect(suplementar("D-2", "0.01")).rejects.toThrow(/excede a disponibilidade da fonte/);
  });

  it("t5: a consulta mostra UMA linha por fonte — a vigente — e diz qual versão é", async () => {
    await declarar("50000.00");
    await declarar("80000.00", "Balanco de 2025 — retificacao do quadro do superavit");
    await suplementar("D-1", "10000.00");

    const linhas = await usosDoRecursoNovo(prisma, { exercicio: 2026, origem: "EXCESSO_ARRECADACAO" });

    // ⚠️ UMA linha. Sem o `distinct`, a mesma fonte apareceria duas vezes — cada uma com um
    // "declarado" diferente e o MESMO "utilizado", e a soma da tela não faria sentido nenhum.
    expect(linhas.length).toBe(1);
    expect(linhas[0]?.declarado.toFixed(2)).toBe("80000.00");
    expect(linhas[0]?.versao).toBe(2);
    expect(linhas[0]?.utilizado.toFixed(2)).toBe("10000.00");
  });

  it("t6: repetir a MESMA declaração é recusado com motivo — repetição não vira versão", async () => {
    await declarar("50000.00");
    await expect(declarar("50000.00")).rejects.toThrow(/JÁ está declarada nesse valor/);
    expect(await versoes()).toEqual([{ versao: 1, valor: "50000.00" }]);
  });

  it("t6b: o MESMO valor com explicação NOVA é uma versão — corrigir o fundamento é um fato", async () => {
    await declarar("50000.00");
    const r = await declarar("50000.00", "Mesma cifra, agora com o quadro do balanco citado");
    expect(r.versao).toBe(2);
  });

  it("t7: valor zero ou negativo é recusado pelo domínio, antes de qualquer I/O", async () => {
    await expect(declarar("0.00")).rejects.toThrow();
    await expect(declarar("-10.00")).rejects.toThrow();
    expect(await versoes()).toEqual([]);
  });

  it("t8: a explicação é obrigatória e tem de ser uma FRASE — 'ajuste' não explica nada", async () => {
    await expect(declarar("50000.00", "ajuste")).rejects.toThrow(/Descreva de onde saiu o número/);
    expect(await versoes()).toEqual([]);
  });

  it("t9: quem não tem a ação é recusado NOMEANDO a ação, e nada é gravado", async () => {
    const perfil = await prisma.perfil.create({
      data: { nome: "SO LE O PLANEJAMENTO (t9)", descricao: "sem a acao de declarar", criadoPor: POR },
      select: { id: true },
    });
    await prisma.permissaoDePerfil.create({ data: { perfilId: perfil.id, acao: "CONSULTAR_PLANEJAMENTO", criadoPor: POR } });
    const fraco = await prisma.usuario.create({
      data: { identificador: "fraco@cg.pb.gov.br", nome: "Sem a acao", criadoPor: POR },
      select: { id: true },
    });
    await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: fraco.id, perfilId: perfil.id, criadoPor: POR } });

    await expect(
      declararDisponibilidade(
        { exercicio: 2026, fonteId: FONTE, origem: "EXCESSO_ARRECADACAO", valor: "50000.00", descricao: APURACAO, criadoPor: "fraco@cg.pb.gov.br" },
        deps
      )
    ).rejects.toThrow(/DECLARAR_DISPONIBILIDADE_DE_RECURSO_NOVO/);

    expect(await versoes()).toEqual([]);
  });

  it("t10: ANULACAO não é origem declarável — ela remaneja, não traz dinheiro novo", async () => {
    await expect(
      declararDisponibilidade(
        // @ts-expect-error — o tipo já proíbe; o teste prova que o SCHEMA também proíbe, porque
        // um `FormData` chega como string e o compilador não está lá para conferi-lo.
        { exercicio: 2026, fonteId: FONTE, origem: "ANULACAO", valor: "50000.00", descricao: APURACAO, criadoPor: POR },
        deps
      )
    ).rejects.toThrow();
    expect(await versoes()).toEqual([]);
  });
});
