import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { admitirServidor, cadastrarCargo, cadastrarLotacao, cadastrarServidor } from "../m32-pessoal/servico.js";
import { registrarAlteracaoRemuneratoria } from "../m32-pessoal/servico.js";
import {
  abrirFolha,
  cadastrarRubrica,
  cadastrarTabelaDeContribuicao,
  cadastrarTabelaIrrf,
  cadastrarTabelaSalarioFamilia,
  calcularFolha,
  cancelarCalculoDaFolha,
  fecharFolha,
} from "./servico.js";

/**
 * ═══ A SELEÇÃO NO CÁLCULO E O FATO DE ABRANGÊNCIA — TR 5.12.50 (V11 V9.5) ═══
 *
 * ⚠️ O TESTE OBRIGATÓRIO DESTE ARQUIVO É O CASO (4): nº1={A,B}, nº2={C,D}, fechar → recusa
 * nomeando A e B. Duas seleções sobrepostas **não pagam duas vezes: elas se apagam**, porque o
 * fechamento congela um único cálculo. Todo mundo vigia duplicidade; o risco real é o oposto, e
 * sem esta guarda ele fecha com o total, o empenho e a liquidação batendo.
 *
 * N=2 nas duas seleções de propósito: com um vínculo por cálculo, uma guarda que comparasse
 * cardinalidade passaria por vacuidade.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "contabilidade@cg.pb.gov.br";
const D = (a: number, m: number, d: number): Date => new Date(Date.UTC(a, m - 1, d, 12, 0, 0));

beforeEach(async () => {
  await limparBanco(prisma);
});
afterAll(async () => {
  await prisma.$disconnect();
});

async function baseDoEnte(): Promise<void> {
  await cadastrarTabelaDeContribuicao(prisma, { regime: "RGPS", competenciaInicio: "2026-01", teto: "8000.00", fundamentacaoLegal: "fixture", faixas: [{ ordem: 1, ate: null, aliquota: "0.09" }], criadoPor: POR });
  await cadastrarTabelaIrrf(prisma, { competenciaInicio: "2026-01", deducaoPorDependente: "200.00", descontoSimplificado: "600.00", isencaoMaior65: "1900.00", redutorBase: "1000.00", redutorFator: "0.2", redutorRendaMaxima: "5000.00", fundamentacaoLegal: "fixture", faixas: [{ ordem: 1, ate: null, aliquota: "0" }], criadoPor: POR });
  await cadastrarTabelaSalarioFamilia(prisma, { competenciaInicio: "2026-01", rendaMaxima: "2000.00", valorPorDependente: "60.00", idadeLimite: 14, fundamentacaoLegal: "fixture", criadoPor: POR });
  await cadastrarRubrica(prisma, { codigo: "VENC", descricao: "Vencimento", tipo: "PROVENTO", natureza: "VENCIMENTO_BASE", incideContribuicao: true, incideIrrf: true, proporcionalAosDias: true, ordem: 1, fundamentacaoLegal: "fixture", criadoPor: POR });
  await cadastrarRubrica(prisma, { codigo: "PREV", descricao: "Contribuicao", tipo: "DESCONTO", natureza: "CONTRIBUICAO_PREVIDENCIARIA", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 90, fundamentacaoLegal: "fixture", criadoPor: POR });
  await cadastrarRubrica(prisma, { codigo: "IRRF", descricao: "IRRF", tipo: "DESCONTO", natureza: "IMPOSTO_DE_RENDA", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 91, fundamentacaoLegal: "fixture", criadoPor: POR });
}

/** Quatro vínculos — A, B, C, D. N=2 em cada seleção do cenário obrigatório. */
async function quatroVinculos(): Promise<Record<"A" | "B" | "C" | "D", string>> {
  const { cargoId } = await cadastrarCargo(prisma, { codigo: "PROF", denominacao: "Professor", tipo: "EFETIVO", vagasFixadas: 10, leiAutorizativa: "Lei 1/2010", dataPublicacaoLei: D(2010, 1, 1), criadoPor: POR });
  const { lotacaoId } = await cadastrarLotacao(prisma, { codigo: "SEDUC", nome: "Educacao", criadoPor: POR });
  const docs: Record<string, string> = { A: "11144477735", B: "52998224725", C: "15350946056", D: "28625587887" };
  const out: Record<string, string> = {};
  for (const [nome, doc] of Object.entries(docs)) {
    const p = await prisma.pessoa.create({ data: { documento: doc, tipo: "FISICA", criadoPor: POR, versoes: { create: { nome: `Servidor ${nome}`, criadoPor: POR } } }, select: { id: true } });
    const { servidorId } = await cadastrarServidor(prisma, { pessoaId: p.id, dataNascimento: D(1985, 7, 20), sexo: "FEMININO", criadoPor: POR });
    const { vinculoId } = await admitirServidor(prisma, { servidorId, matricula: `M-${nome}`, tipo: "EFETIVO", regimeJuridico: "Estatutario", regimePrevidenciario: "RGPS", dataAdmissao: D(2026, 1, 1), cargoId, lotacaoId, salarioBase: "3000.00", criadoPor: POR });
    out[nome] = vinculoId;
  }
  return out as Record<"A" | "B" | "C" | "D", string>;
}

/**
 * UM VÍNCULO ADMITIDO DEPOIS DA COMPETÊNCIA — inelegível em 2026-03 e, por isso mesmo, SEM apurado.
 *
 * ⚠️ É ele que dá o N=2 do caso do apurado a repor. Com um inelegível só, "a recusa nomeia quem tem
 * apurado" passaria por vacuidade: nomear TODOS os inelegíveis daria o mesmo resultado. Com dois —
 * um com dinheiro pendurado e um sem —, a afirmação só fica verde se a recusa souber separá-los.
 */
async function vinculoAdmitidoDepois(): Promise<string> {
  const cargo = await prisma.cargo.findFirstOrThrow({ select: { id: true } });
  const lot = await prisma.lotacao.findFirstOrThrow({ select: { id: true } });
  const p = await prisma.pessoa.create({ data: { documento: "39053344705", tipo: "FISICA", criadoPor: POR, versoes: { create: { nome: "Servidor E", criadoPor: POR } } }, select: { id: true } });
  const { servidorId } = await cadastrarServidor(prisma, { pessoaId: p.id, dataNascimento: D(1990, 4, 3), sexo: "FEMININO", criadoPor: POR });
  const { vinculoId } = await admitirServidor(prisma, { servidorId, matricula: "M-E", tipo: "EFETIVO", regimeJuridico: "Estatutario", regimePrevidenciario: "RGPS", dataAdmissao: D(2026, 5, 1), cargoId: cargo.id, lotacaoId: lot.id, salarioBase: "3000.00", criadoPor: POR });
  return vinculoId;
}

async function abrangenciaDe(calculoId: string): Promise<readonly { readonly matricula: string; readonly calculado: boolean; readonly motivo: string | null }[]> {
  const ls = await prisma.abrangenciaDoCalculo.findMany({ where: { calculoId }, select: { calculado: true, motivo: true, vinculo: { select: { matricula: true } } } });
  return ls.map((l) => ({ matricula: l.vinculo.matricula, calculado: l.calculado, motivo: l.motivo })).sort((a, b) => a.matricula.localeCompare(b.matricula));
}

describe("(1) EXPLÍCITA — o operador declara quem entra, sem recorte implícito", () => {
  it("sem seleção, calcula TODOS e grava o modo — o recorte tem de ser PEDIDO", async () => {
    await baseDoEnte();
    await quatroVinculos();
    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-03", criadoPor: POR });
    const r = await calcularFolha(prisma, { folhaId, criadoPor: POR });
    expect(r.contracheques).toBe(4);
    const c = await prisma.calculoDaFolha.findUniqueOrThrow({ where: { id: r.calculoId }, select: { modoDeSelecao: true } });
    expect(c.modoDeSelecao).toBe("TODOS_OS_ELEGIVEIS");
  });

  it("com seleção explícita, calcula SÓ os pedidos — e o modo fica gravado", async () => {
    await baseDoEnte();
    const v = await quatroVinculos();
    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-03", criadoPor: POR });
    const r = await calcularFolha(prisma, { folhaId, criadoPor: POR, selecao: { modo: "EXPLICITA", vinculoIds: [v.A, v.B] } });
    expect(r.contracheques).toBe(2);
    const c = await prisma.calculoDaFolha.findUniqueOrThrow({ where: { id: r.calculoId }, select: { modoDeSelecao: true } });
    expect(c.modoDeSelecao).toBe("EXPLICITA");
  });

  it("⚠️ EXPLÍCITA VAZIA É RECUSADA — 'todos' e 'nenhum' são estados diferentes", async () => {
    await baseDoEnte();
    await quatroVinculos();
    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-03", criadoPor: POR });
    await expect(calcularFolha(prisma, { folhaId, criadoPor: POR, selecao: { modo: "EXPLICITA", vinculoIds: [] } })).rejects.toThrow();
  });

  it("⚠️ 'TODOS' COM LISTA É RECUSADO — senão o registro não diria o que o operador quis", async () => {
    await baseDoEnte();
    const v = await quatroVinculos();
    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-03", criadoPor: POR });
    await expect(calcularFolha(prisma, { folhaId, criadoPor: POR, selecao: { modo: "TODOS_OS_ELEGIVEIS", vinculoIds: [v.A] } })).rejects.toThrow();
  });
});

describe("(2) REGISTRADA — a abrangência é recuperável, e diz por que ficou de fora quem ficou", () => {
  it("⚠️ A ABRANGÊNCIA REGISTRA OS CONSIDERADOS — e quem não foi pedido é DERIVÁVEL, não linha", async () => {
    await baseDoEnte();
    const v = await quatroVinculos();
    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-03", criadoPor: POR });
    const r = await calcularFolha(prisma, { folhaId, criadoPor: POR, selecao: { modo: "EXPLICITA", vinculoIds: [v.A, v.B] } });
    const ab = await abrangenciaDe(r.calculoId);
    // ⚠️ DUAS LINHAS, NÃO QUATRO — e a decisão é medida, não estética. Gravar "não selecionado"
    // por vínculo faria um cálculo de 2 pessoas num ente de 900 gravar 898 linhas de ruído,
    // escondendo as exclusões que importam. Quem não foi pedido se sabe por `modoDeSelecao =
    // EXPLICITA` mais esta lista: fato derivável não vira linha.
    expect(ab).toEqual([
      { matricula: "M-A", calculado: true, motivo: null },
      { matricula: "M-B", calculado: true, motivo: null },
    ]);
    const c = await prisma.calculoDaFolha.findUniqueOrThrow({ where: { id: r.calculoId }, select: { modoDeSelecao: true } });
    expect(c.modoDeSelecao).toBe("EXPLICITA");
  });

  it("⚠️ O `continue` MUDO VIROU MOTIVO: admitido depois da competência é EXCLUSÃO NOMEADA", async () => {
    await baseDoEnte();
    const v = await quatroVinculos();
    // D é admitido em JUNHO; a folha é de MARÇO.
    await prisma.historicoVinculo.updateMany({ where: { vinculoId: v.D }, data: { data: D(2026, 6, 1) } });
    await prisma.vinculo.update({ where: { id: v.D }, data: { dataAdmissao: D(2026, 6, 1) } });
    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-03", criadoPor: POR });
    const r = await calcularFolha(prisma, { folhaId, criadoPor: POR });
    const ab = await abrangenciaDe(r.calculoId);
    expect(ab.find((x) => x.matricula === "M-D")).toEqual({ matricula: "M-D", calculado: false, motivo: "ADMITIDO_APOS_A_COMPETENCIA" });
    // ⚠️ E ELE TEM LINHA: antes desta unidade ele simplesmente não existia no registro, e
    // "não apareceu" era indistinguível de "não foi considerado".
    expect(ab).toHaveLength(4);
  });
});

describe("(3) REVALIDADA — a seleção é reconferida no instante do cálculo", () => {
  it("⚠️ VÍNCULO QUE NÃO EXISTE MAIS RECUSA O CÁLCULO INTEIRO — não entra em silêncio", async () => {
    await baseDoEnte();
    const v = await quatroVinculos();
    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-03", criadoPor: POR });
    // ⚠️ RECUSAR É MAIS FORTE QUE REGISTRAR, e aqui é também a única saída possível: a FK de
    // `AbrangenciaDoCalculo` aponta para `Vinculo`, então um vínculo inexistente não tem para
    // onde apontar — a primeira versão tentou gravá-lo e estourou a FK, derrubando a transação.
    // Calcular os demais calando sobre ele seria exatamente o silêncio que esta unidade elimina.
    await expect(
      calcularFolha(prisma, { folhaId, criadoPor: POR, selecao: { modo: "EXPLICITA", vinculoIds: [v.A, "vinculo-que-nao-existe"] } })
    ).rejects.toThrow(/SELECAO-COM-VINCULO-INEXISTENTE/);
    // E NADA foi gravado — nem o cálculo do vínculo válido.
    expect(await prisma.calculoDaFolha.count({ where: { folhaId } })).toBe(0);
  });
});

describe("(4) ⚠️ O CENÁRIO OBRIGATÓRIO — a SUBTRAÇÃO SILENCIOSA no fechamento", () => {
  it("nº1={A,B}, nº2={C,D}, fechar → RECUSA NOMEANDO A e B", async () => {
    await baseDoEnte();
    const v = await quatroVinculos();
    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-03", criadoPor: POR });

    await calcularFolha(prisma, { folhaId, criadoPor: POR, selecao: { modo: "EXPLICITA", vinculoIds: [v.A, v.B] } });
    await calcularFolha(prisma, { folhaId, criadoPor: POR, selecao: { modo: "EXPLICITA", vinculoIds: [v.C, v.D] } });

    // ⚠️ SEM A GUARDA, ISTO FECHARIA: o cálculo nº2 tem totais coerentes, e A e B sumiriam.
    const erro = await fecharFolha(prisma, { folhaId, criadoPor: POR }).catch((e: Error) => e);
    expect(erro).toBeInstanceOf(Error);
    expect((erro as Error).message).toMatch(/SELECIONADOS-QUE-SUMIRIAM/);
    expect((erro as Error).message).toContain("M-A");
    expect((erro as Error).message).toContain("M-B");
    // E NADA foi gravado — "recusou" e "recusou sem deixar fechamento" são afirmações diferentes.
    expect(await prisma.fechamentoDaFolha.count({ where: { folhaId } })).toBe(0);
  });

  it("⚠️ A SAÍDA LEGÍTIMA É EXPLÍCITA: recalcular com a seleção acumulada fecha", async () => {
    await baseDoEnte();
    const v = await quatroVinculos();
    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-03", criadoPor: POR });
    await calcularFolha(prisma, { folhaId, criadoPor: POR, selecao: { modo: "EXPLICITA", vinculoIds: [v.A, v.B] } });
    await calcularFolha(prisma, { folhaId, criadoPor: POR, selecao: { modo: "EXPLICITA", vinculoIds: [v.C, v.D] } });
    await calcularFolha(prisma, { folhaId, criadoPor: POR, selecao: { modo: "EXPLICITA", vinculoIds: [v.A, v.B, v.C, v.D] } });
    const f = await fecharFolha(prisma, { folhaId, criadoPor: POR });
    expect(f.fechamentoId).toBeTruthy();
  });

  it("⚠️ E A OUTRA SAÍDA TAMBÉM: CANCELAR o nº1 retira A e B da promessa POR ATO", async () => {
    await baseDoEnte();
    const v = await quatroVinculos();
    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-03", criadoPor: POR });
    const c1 = await calcularFolha(prisma, { folhaId, criadoPor: POR, selecao: { modo: "EXPLICITA", vinculoIds: [v.A, v.B] } });
    await calcularFolha(prisma, { folhaId, criadoPor: POR, selecao: { modo: "EXPLICITA", vinculoIds: [v.C, v.D] } });
    await cancelarCalculoDaFolha(prisma, { calculoId: c1.calculoId, motivo: "A e B saem desta folha por decisao do ordenador", criadoPor: POR });
    // A guarda impede o ESQUECIMENTO, não a DECISÃO — e a decisão fica gravada.
    const f = await fecharFolha(prisma, { folhaId, criadoPor: POR });
    expect(f.fechamentoId).toBeTruthy();
  });
});

describe("(5) AUTORIZADA — ação própria, e o ator negativo vem de FORA do censo", () => {
  it("⚠️ QUEM TEM `CALCULAR_FOLHA` MAS NÃO `SELECIONAR_VINCULOS_DA_FOLHA` CALCULA TODOS E NÃO RECORTA", async () => {
    await baseDoEnte();
    const v = await quatroVinculos();
    // Ator FORA do censo de `test/usuarios-teste.ts` (toda identidade de lá é ADMIN =
    // TODAS_AS_ACOES), com a ação VIZINHA e não a vigiada: é o que separa "recusou porque não
    // tem ESTA ação" de "recusou porque não tem ação nenhuma".
    const perfil = await prisma.perfil.create({
      data: {
        nome: "SO_CALCULA", descricao: "Calcula, nao recorta", criadoPor: "TESTE",
        permissoes: { create: [{ acao: "CALCULAR_FOLHA", criadoPor: "TESTE" }, { acao: "ABRIR_FOLHA", criadoPor: "TESTE" }] },
      },
      select: { id: true },
    });
    const u = await prisma.usuario.create({ data: { identificador: "so.calcula.folha@teste.local", nome: "So Calcula", criadoPor: "TESTE" }, select: { id: true } });
    await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: perfil.id, criadoPor: "TESTE" } });

    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-03", criadoPor: POR });

    // NEGATIVA — com recorte, recusa NOMEANDO a ação que falta.
    await expect(
      calcularFolha(prisma, { folhaId, criadoPor: "so.calcula.folha@teste.local", selecao: { modo: "EXPLICITA", vinculoIds: [v.A] } })
    ).rejects.toThrow(/SELECIONAR_VINCULOS_DA_FOLHA/);
    expect(await prisma.calculoDaFolha.count({ where: { folhaId } })).toBe(0);

    // ⚠️ POSITIVA SOBRE O MESMO CENÁRIO — e ela é a metade que prova que a separação produz o
    // PADRÃO CONSERVADOR: sem a ação, o operador continua podendo calcular TODOS.
    const r = await calcularFolha(prisma, { folhaId, criadoPor: "so.calcula.folha@teste.local" });
    expect(r.contracheques).toBe(4);
  });
});


describe("(6) ⚠️ A GUARDA `VINCULO-APURADO-FORA-DO-RECALCULO`, RECONCILIADA POR INTERSEÇÃO", () => {
  /**
   * ⚠️ ESTE É O TESTE QUE A ADVERTÊNCIA PEDIU. A guarda compara o apurado em folha FECHADA contra
   * quem produziu contracheque no recálculo. Com seleção, percorrer o apurado INTEIRO faria
   * **todo vínculo não selecionado** cair no filtro — a guarda acusaria em massa uma coisa que não
   * aconteceu.
   *
   * ⚠️ E O CONJUNTO TEM DE SER `considerados`, NÃO `matriculaPorVinculo`: este último é montado
   * sobre TODOS os vínculos lidos, e usá-lo faria o filtro ser sempre-verdadeiro — a guarda
   * voltaria a NUNCA disparar, **com a suíte verde**. Foi assim que ela nasceu inerte da primeira
   * vez, e é por isso que os dois casos abaixo vêm PAREADOS: um que não pode acusar e um que tem
   * de acusar. Um teste só, de qualquer um dos lados, passaria com a guarda quebrada.
   */
  it("com seleção, os NÃO selecionados não são acusados — a guarda deixa de disparar em massa", async () => {
    await baseDoEnte();
    const v = await quatroVinculos();
    const mensal = await abrirFolha(prisma, { competencia: "2026-03", criadoPor: POR });
    await calcularFolha(prisma, { folhaId: mensal.folhaId, criadoPor: POR });
    await fecharFolha(prisma, { folhaId: mensal.folhaId, criadoPor: POR });

    // A ganha aumento retroativo: só ele tem diferença a pagar.
    await registrarAlteracaoRemuneratoria(prisma, { vinculoId: v.A, tipo: "REAJUSTE_SALARIAL", data: D(2026, 3, 1), motivo: "Reajuste retroativo", salarioBase: "3500.00", criadoPor: POR });

    const compl = await abrirFolha(prisma, { competencia: "2026-03", tipo: "MENSAL_COMPLEMENTAR", criadoPor: POR });
    // ⚠️ B, C e D têm apurado em folha fechada e NÃO são selecionados. Sem a interseção, os três
    // cairiam em `VINCULO-APURADO-FORA-DO-RECALCULO` e a complementar seria impossível de calcular.
    const r = await calcularFolha(prisma, { folhaId: compl.folhaId, criadoPor: POR, selecao: { modo: "EXPLICITA", vinculoIds: [v.A] } });
    expect(r.contracheques).toBe(1);
  });

  it("⚠️ E O CASO REAL CONTINUA ACUSANDO: selecionado, apurado e fora do recálculo", async () => {
    await baseDoEnte();
    const v = await quatroVinculos();
    const mensal = await abrirFolha(prisma, { competencia: "2026-03", criadoPor: POR });
    await calcularFolha(prisma, { folhaId: mensal.folhaId, criadoPor: POR });
    await fecharFolha(prisma, { folhaId: mensal.folhaId, criadoPor: POR });

    // A é desligado com efeito ANTES da competência, registrado depois do fechamento: o recálculo
    // de março não o alcança mais, e o apurado dele continua lá. Correto = 0, apurado > 0.
    await prisma.historicoVinculo.create({ data: { vinculoId: v.A, data: D(2026, 2, 1), tipo: "DESLIGAMENTO", motivo: "Exoneracao retroativa", criadoPor: POR } });
    // B ganha aumento: é ele que dá ao cálculo uma diferença a pagar, para o motor não parar antes
    // por conjunto vazio. Ver a pendência `APURADO-A-REPOR-ENCOBERTO-POR-FOLHA-SEM-VINCULOS`.
    await registrarAlteracaoRemuneratoria(prisma, { vinculoId: v.B, tipo: "REAJUSTE_SALARIAL", data: D(2026, 3, 1), motivo: "Reajuste retroativo", salarioBase: "3500.00", criadoPor: POR });

    const compl = await abrirFolha(prisma, { competencia: "2026-03", tipo: "MENSAL_COMPLEMENTAR", criadoPor: POR });
    await expect(
      calcularFolha(prisma, { folhaId: compl.folhaId, criadoPor: POR, selecao: { modo: "EXPLICITA", vinculoIds: [v.A, v.B] } })
    ).rejects.toThrow(/VINCULO-APURADO-FORA-DO-RECALCULO/);
  });
});

/**
 * ═══ ⚠️ A SEGUNDA COBRANÇA, PROVADA COM UM ATOR QUE NÃO É ADMIN (V12) ═══
 *
 * `calcularFolha` cobra `CALCULAR_FOLHA` sempre e `SELECIONAR_VINCULOS_DA_FOLHA` **só quando a
 * seleção é EXPLICITA**. Isso estava escrito no motor desde a V11 V9.5 e nunca foi afirmado por um
 * teste — e não podia ser afirmado com as identidades das fixtures, que recebem tudo: com um ator
 * que já tem as duas ações, "o negativo recusa" passa por vacuidade, porque não há o que recusar.
 *
 * Por isso o ator aqui é construído com um perfil de UMA ação só. E o par é obrigatório: o MESMO
 * ator calcula TODOS com sucesso e é recusado no recorte. Sem a metade positiva, um erro qualquer
 * (identidade inexistente, folha errada, tabela faltando) produziria o mesmo vermelho e seria lido
 * como "a autorização funcionou".
 */
describe("(6) recortar quem entra é outra autoridade — e o par prova que é ela que barra", () => {
  const SO_CALCULA = "so-calcula@cg.pb.gov.br";

  async function contaCom(identificador: string, acoes: readonly string[]): Promise<void> {
    const perfil = await prisma.perfil.create({
      data: { nome: `P-${identificador}`, descricao: "fixture da V12", criadoPor: "TESTE", permissoes: { create: acoes.map((acao) => ({ acao: acao as never, criadoPor: "TESTE" })) } },
      select: { id: true },
    });
    const usuario = await prisma.usuario.create({ data: { identificador, nome: identificador, criadoPor: "TESTE" }, select: { id: true } });
    await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: usuario.id, perfilId: perfil.id, criadoPor: "TESTE" } });
  }

  it("⚠️ quem só tem CALCULAR_FOLHA calcula TODOS — e é RECUSADO ao recortar", async () => {
    await baseDoEnte();
    const v = await quatroVinculos();
    await contaCom(SO_CALCULA, ["CALCULAR_FOLHA"]);

    // (a) POSITIVO — o padrão é conservador: sem a segunda ação, a folha INTEIRA continua possível.
    const semRecorte = await abrirFolha(prisma, { competencia: "2026-03", criadoPor: POR });
    const r = await calcularFolha(prisma, { folhaId: semRecorte.folhaId, criadoPor: SO_CALCULA });
    expect(r.contracheques, "sem a segunda ação, calcular TODOS tem de continuar possível").toBe(4);

    // (b) NEGATIVO — o MESMO ator, a MESMA folha, mudando só o modo da seleção.
    const erro = await calcularFolha(prisma, {
      folhaId: semRecorte.folhaId,
      criadoPor: SO_CALCULA,
      selecao: { modo: "EXPLICITA", vinculoIds: [v.A, v.B] },
    }).then(() => null, (e: unknown) => (e instanceof Error ? e.message : String(e)));

    expect(erro, "recortar sem a ação própria tinha de recusar").not.toBeNull();
    // ⚠️ A NEGAÇÃO AFIRMA O MOTIVO: "não calculou" é compatível com o servidor recusando por
    // qualquer outra coisa — inclusive por já haver cálculo, que não é uma recusa de autorização.
    expect(erro).toMatch(/SELECIONAR_VINCULOS_DA_FOLHA/);
  });

  it("e quem tem as DUAS recorta — senão a recusa acima não provaria nada sobre a ação", async () => {
    await baseDoEnte();
    const v = await quatroVinculos();
    await contaCom("recorta@cg.pb.gov.br", ["CALCULAR_FOLHA", "SELECIONAR_VINCULOS_DA_FOLHA"]);
    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-03", criadoPor: POR });
    const r = await calcularFolha(prisma, {
      folhaId,
      criadoPor: "recorta@cg.pb.gov.br",
      selecao: { modo: "EXPLICITA", vinculoIds: [v.A, v.B] },
    });
    expect(r.contracheques).toBe(2);
  });
});

/**
 * ═══ `APURADO-A-REPOR-ENCOBERTO-POR-FOLHA-SEM-VINCULOS` — CONSERTADO NA V12 (item 3.A) ═══
 *
 * O ACHADO, como estava registrado: quando o ÚNICO vínculo selecionado é inelegível E tem valor
 * apurado em folha fechada, o motor estourava `FOLHA-SEM-VINCULOS` **antes** de chegar em
 * `VINCULO-APURADO-FORA-DO-RECALCULO`. O operador lia uma mensagem sobre elegibilidade e o sistema
 * **calava sobre o que é mais grave**: há dinheiro apurado para alguém cujo correto agora é zero —
 * valor a repor ao erário. Não era silêncio; era ORDEM DE GUARDAS escondendo o sério atrás do
 * trivial. O teste do caso real precisava selecionar DOIS vínculos só para contornar a ordem.
 *
 * O CONSERTO, em `servico.ts`: `contrachequesMensaisDaCompetencia` ganhou `aoFicarSemVinculos`.
 * O caminho MENSAL continua `RECUSAR` (padrão, comportamento idêntico ao de antes); o caminho
 * COMPLEMENTAR pede `DEVOLVER_VAZIO` e recusa ele mesmo — DEPOIS de conferir o apurado. As duas
 * recusas continuam existindo e nenhuma virou aviso: o que mudou é qual delas fala primeiro.
 *
 * ⚠️ E A RECUSA CONTINUA SENDO RECUSA. Nada é gravado, e em nenhum momento a diferença negativa
 * (correto zero, apurado maior) vira crédito ao servidor: o cálculo inteiro para, e a pendência
 * financeira fica nomeada por matrícula para quem pode tratá-la.
 */
describe("(5) o apurado a repor NÃO fica encoberto pela ausência de vínculo elegível", () => {
  /**
   * ⚠️ N=2, E OS DOIS SÃO INELEGÍVEIS — a diferença entre eles é só o dinheiro.
   *
   *   · A  — desligado com efeito ANTES da competência, registrado DEPOIS do fechamento.
   *          Inelegível no recálculo, e com apurado na mensal fechada. Correto 0, apurado > 0.
   *   · E  — admitido DEPOIS da competência. Inelegível, e sem um centavo apurado.
   *
   * `finais` sai VAZIO: é exatamente a condição que antes estourava `FOLHA-SEM-VINCULOS`. A
   * afirmação é que agora o motivo VERDADEIRO fala, e que ele nomeia **M-A e não M-E** — com um
   * inelegível só, nomear todos daria o mesmo resultado e o teste passaria por vacuidade.
   */
  it("⚠️ o único elegível some e sobra dinheiro a repor: a recusa é a do APURADO, e nomeia só quem tem", async () => {
    await baseDoEnte();
    const v = await quatroVinculos();
    const mensal = await abrirFolha(prisma, { competencia: "2026-03", criadoPor: POR });
    await calcularFolha(prisma, { folhaId: mensal.folhaId, criadoPor: POR });
    await fecharFolha(prisma, { folhaId: mensal.folhaId, criadoPor: POR });

    await prisma.historicoVinculo.create({ data: { vinculoId: v.A, data: D(2026, 2, 1), tipo: "DESLIGAMENTO", motivo: "Exoneracao retroativa", criadoPor: POR } });
    const E = await vinculoAdmitidoDepois();

    const compl = await abrirFolha(prisma, { competencia: "2026-03", tipo: "MENSAL_COMPLEMENTAR", criadoPor: POR });
    const erro = await calcularFolha(prisma, { folhaId: compl.folhaId, criadoPor: POR, selecao: { modo: "EXPLICITA", vinculoIds: [v.A, E] } }).then(
      () => null,
      (e: unknown) => (e instanceof Error ? e.message : String(e))
    );

    // ⚠️ A NEGAÇÃO AFIRMA O MOTIVO, não só que falhou: "não calculou" é compatível com o sistema
    // calando sobre o dinheiro, que é precisamente o defeito que esta unidade conserta.
    expect(erro, "o cálculo tinha de recusar").not.toBeNull();
    expect(erro).toMatch(/VINCULO-APURADO-FORA-DO-RECALCULO/);
    expect(erro).toMatch(/repor ao erário/);
    expect(erro, "a recusa tem de nomear a matrícula com apurado").toMatch(/M-A/);
    expect(erro, "M-E é inelegível mas não tem apurado — nomeá-lo seria acusar em massa").not.toMatch(/M-E/);
    expect(erro, "a mensagem trivial não pode ser a que o operador lê aqui").not.toMatch(/FOLHA-SEM-VINCULOS/);

    // ⚠️ E NADA FOI GRAVADO: a diferença negativa não virou crédito, nem cálculo vazio.
    expect(await prisma.calculoDaFolha.count({ where: { folhaId: compl.folhaId } })).toBe(0);
  });

  /**
   * ⚠️ O PAR NEGATIVO — sem apurado pendurado, a recusa VOLTA a ser a da ausência.
   *
   * Sem este caso, a guarda nova poderia estar simplesmente trocando uma mensagem pela outra em
   * toda folha vazia. Aqui não há dinheiro a repor, e o motivo verdadeiro é mesmo a inelegibilidade
   * — com o motivo nomeado, que é o que a V11 V9.5 construiu.
   */
  it("sem apurado a repor, a recusa continua sendo FOLHA-SEM-VINCULOS — com o motivo nomeado", async () => {
    await baseDoEnte();
    await quatroVinculos();
    const mensal = await abrirFolha(prisma, { competencia: "2026-03", criadoPor: POR });
    await calcularFolha(prisma, { folhaId: mensal.folhaId, criadoPor: POR });
    await fecharFolha(prisma, { folhaId: mensal.folhaId, criadoPor: POR });
    const E = await vinculoAdmitidoDepois();

    const compl = await abrirFolha(prisma, { competencia: "2026-03", tipo: "MENSAL_COMPLEMENTAR", criadoPor: POR });
    const erro = await calcularFolha(prisma, { folhaId: compl.folhaId, criadoPor: POR, selecao: { modo: "EXPLICITA", vinculoIds: [E] } }).then(
      () => null,
      (e: unknown) => (e instanceof Error ? e.message : String(e))
    );
    expect(erro).toMatch(/FOLHA-SEM-VINCULOS/);
    expect(erro, "o motivo da inelegibilidade tem de aparecer").toMatch(/ADMITIDO_APOS_A_COMPETENCIA/);
    expect(erro).not.toMatch(/VINCULO-APURADO-FORA-DO-RECALCULO/);
    expect(await prisma.calculoDaFolha.count({ where: { folhaId: compl.folhaId } })).toBe(0);
  });

  /**
   * ⚠️ O CAMINHO MENSAL NÃO PODE TER MUDADO. `aoFicarSemVinculos` tem `RECUSAR` como padrão
   * justamente para isto, e um padrão só é padrão se alguém afirmar que ele continua valendo.
   */
  it("a folha MENSAL segue recusando dentro do motor, como antes", async () => {
    await baseDoEnte();
    await quatroVinculos();
    const E = await vinculoAdmitidoDepois();
    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-03", criadoPor: POR });
    await expect(
      calcularFolha(prisma, { folhaId, criadoPor: POR, selecao: { modo: "EXPLICITA", vinculoIds: [E] } })
    ).rejects.toThrow(/FOLHA-SEM-VINCULOS/);
  });
});
