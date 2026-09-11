import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import {
  abrirInventarioDeBens,
  avaliarBemPorFormula,
  bensSobResponsabilidade,
  cadastrarComissaoPatrimonial,
  cadastrarFormulaDeAvaliacao,
  cadastrarLocalizacaoFisica,
  cadastrarMotivoDeBaixa,
  cadastrarTipoDeIncorporacao,
  emitirTermoPatrimonial,
  estadoDoBem,
  estornarMovimentoDeGestao,
  fecharInventarioDeBens,
  gerarEtiquetaDeBem,
  inconsistenciasDoInventarioDeBens,
  registrarContagemDeBem,
  registrarMovimentoDeGestao,
  transferirBemEntreEntidades,
} from "./gestao-do-bem.js";

/**
 * M10 — PATRIMÔNIO, EIXO DE GESTÃO (TR 5.19): OS CASOS DE USO CONTRA BANCO.
 *
 * ⚠️ NENHUM DESTES SERVIÇOS TOCA O RAZÃO, e o t9 prova isso contando as linhas de
 * `LancamentoContabil` antes e depois. É a garantia de que o eixo de gestão não
 * contamina a contabilidade do bem, que já está provada e não mudou.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "patrimonio@cg.pb.gov.br";
const SEM_PERMISSAO = "estagiario@cg.pb.gov.br";

let bemId: string;
let bem2Id: string;
let sala1: string;
let sala2: string;
let anaId: string;
let comissaoId: string;

async function semear(): Promise<void> {
  await limparBanco(prisma);

  await prisma.contaPcasp.create({
    data: { id: "c-movel", codigo: "1.2.3.1.1.01.00", nome: "Bens móveis", naturezaSaldo: "DEVEDORA", nivel: 6, analitica: true, indicadorSuperavit: "P" },
  });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.createMany({
    data: [
      { id: "uo-01", codigo: "01001", descricao: "Administração", orgaoId: "org-01" },
      { id: "uo-02", codigo: "01002", descricao: "Saúde", orgaoId: "org-01" },
    ],
  });
  await prisma.setor.create({
    data: { id: "set-01", codigo: "S01", nome: "Almoxarifado", unidadeOrcId: "uo-01", criadoPor: POR },
  });

  const perfilVazio = await prisma.perfil.create({
    data: { nome: "SEM_PODERES", descricao: "Perfil sem permissão alguma", criadoPor: POR },
    select: { id: true },
  });
  const estagiario = await prisma.usuario.create({
    data: { identificador: SEM_PERMISSAO, nome: SEM_PERMISSAO, criadoPor: POR },
    select: { id: true },
  });
  await prisma.vinculoUsuarioPerfil.create({
    data: { usuarioId: estagiario.id, perfilId: perfilVazio.id, criadoPor: POR },
  });

  const classe = await prisma.classeDeBens.create({
    data: {
      codigo: "1.2.3", descricao: "Móveis e utensílios", especie: "MOVEL",
      contaContabilAtivoId: "c-movel", criadoPor: POR,
      parametro: {
        create: {
          metodo: "DEPRECIACAO", vidaUtilMeses: 120,
          percentualResidual: "0.100000", criadoPor: POR,
        },
      },
    },
    select: { id: true },
  });

  const bem = await prisma.bemPatrimonial.create({
    data: {
      numeroTombamento: "TOMB-0001", descricao: "Armário de aço",
      classeDeBensId: classe.id, dataAquisicao: new Date("2024-01-15T12:00:00Z"),
      criadoPor: POR,
    },
    select: { id: true },
  });
  bemId = bem.id;
  const bem2 = await prisma.bemPatrimonial.create({
    data: {
      numeroTombamento: "TOMB-0002", descricao: "Mesa de reunião",
      classeDeBensId: classe.id, dataAquisicao: new Date("2024-01-15T12:00:00Z"),
      criadoPor: POR,
    },
    select: { id: true },
  });
  bem2Id = bem2.id;

  const ana = await prisma.pessoa.create({
    data: { documento: "11144477735", tipo: "FISICA", criadoPor: POR },
    select: { id: true },
  });
  anaId = ana.id;

  ({ localizacaoId: sala1 } = await cadastrarLocalizacaoFisica(prisma, {
    codigo: "P1-S1", descricao: "Prédio 1 — Sala 1", setorId: "set-01", criadoPor: POR,
  }));
  ({ localizacaoId: sala2 } = await cadastrarLocalizacaoFisica(prisma, {
    codigo: "P1-S2", descricao: "Prédio 1 — Sala 2", setorId: "set-01", criadoPor: POR,
  }));

  ({ comissaoId } = await cadastrarComissaoPatrimonial(prisma, {
    codigo: "CI-2026", descricao: "Comissão de inventário 2026",
    finalidade: "INVENTARIO", atoDesignacao: "Portaria 12/2026",
    vigenciaInicio: new Date("2026-01-01T12:00:00Z"),
    vigenciaFim: new Date("2026-12-31T12:00:00Z"),
    membros: [{ pessoaId: ana.id, atribuicao: "Presidente da comissão", presidente: true }],
    criadoPor: POR,
  }));
}

beforeEach(semear);

describe("t1 · a comissão, e a regra do presidente único", () => {
  it("⚠️ RECUSA comissão sem presidente e com dois", async () => {
    const outra = await prisma.pessoa.create({
      data: { documento: "52998224725", tipo: "FISICA", criadoPor: POR },
      select: { id: true },
    });
    const base = {
      codigo: "X", descricao: "Comissão de prova", finalidade: "INVENTARIO" as const,
      atoDesignacao: "Portaria 99", vigenciaInicio: new Date("2026-01-01T12:00:00Z"),
      criadoPor: POR,
    };
    await expect(
      cadastrarComissaoPatrimonial(prisma, {
        ...base,
        membros: [{ pessoaId: anaId, atribuicao: "Membro", presidente: false }],
      })
    ).rejects.toThrow(/declarou 0 presidentes/);

    await expect(
      cadastrarComissaoPatrimonial(prisma, {
        ...base,
        membros: [
          { pessoaId: anaId, atribuicao: "Membro", presidente: true },
          { pessoaId: outra.id, atribuicao: "Membro", presidente: true },
        ],
      })
    ).rejects.toThrow(/declarou 2 presidentes/);
  });

  it("⚠️ RECUSA abrir inventário com comissão de OUTRA finalidade", async () => {
    const { comissaoId: reav } = await cadastrarComissaoPatrimonial(prisma, {
      codigo: "CR-2026", descricao: "Comissão de reavaliação",
      finalidade: "REAVALIACAO", atoDesignacao: "Portaria 13/2026",
      vigenciaInicio: new Date("2026-01-01T12:00:00Z"),
      membros: [{ pessoaId: anaId, atribuicao: "Presidente", presidente: true }],
      criadoPor: POR,
    });
    await expect(
      abrirInventarioDeBens(prisma, {
        exercicio: 2026, comissaoId: reav, unidadeOrcId: "uo-01",
        dataAbertura: new Date("2026-06-01T12:00:00Z"), criadoPor: POR,
      })
    ).rejects.toThrow(/designada para REAVALIACAO/);
  });

  it("⚠️ RECUSA abrir inventário com comissão FORA da vigência", async () => {
    await expect(
      abrirInventarioDeBens(prisma, {
        exercicio: 2027, comissaoId, unidadeOrcId: "uo-01",
        dataAbertura: new Date("2027-06-01T12:00:00Z"), criadoPor: POR,
      })
    ).rejects.toThrow(/não estava vigente/);
  });
});

describe("t2 · o estado do bem é derivado, e a data manda", () => {
  it("localização e responsável aparecem, e a data passada responde o passado", async () => {
    await registrarMovimentoDeGestao(prisma, {
      bemId, tipo: "LOCALIZACAO", dataMovimento: new Date("2026-03-01T12:00:00Z"),
      localizacaoId: sala1, motivo: "alocação inicial do armário", criadoPor: POR,
    });
    await registrarMovimentoDeGestao(prisma, {
      bemId, tipo: "LOCALIZACAO", dataMovimento: new Date("2026-08-01T12:00:00Z"),
      localizacaoId: sala2, motivo: "mudança de sala por reforma", criadoPor: POR,
    });

    expect((await estadoDoBem(prisma, bemId)).localizacaoId).toBe(sala2);
    expect(
      (await estadoDoBem(prisma, bemId, "2026-07-31")).localizacaoId,
      "a leitura respondeu 'hoje' a uma pergunta com data"
    ).toBe(sala1);
  });

  it("⚠️ RECUSA movimento de LOCALIZACAO sem localização — apagaria a posição em silêncio", async () => {
    await expect(
      registrarMovimentoDeGestao(prisma, {
        bemId, tipo: "LOCALIZACAO", dataMovimento: new Date("2026-03-01T12:00:00Z"),
        motivo: "movimento sem o campo do tipo", criadoPor: POR,
      })
    ).rejects.toThrow(/exige "localizacaoId"/);
  });

  it("o estorno devolve a localização anterior", async () => {
    await registrarMovimentoDeGestao(prisma, {
      bemId, tipo: "LOCALIZACAO", dataMovimento: new Date("2026-03-01T12:00:00Z"),
      localizacaoId: sala1, motivo: "alocação inicial", criadoPor: POR,
    });
    const { movimentoId } = await registrarMovimentoDeGestao(prisma, {
      bemId, tipo: "LOCALIZACAO", dataMovimento: new Date("2026-08-01T12:00:00Z"),
      localizacaoId: sala2, motivo: "mudança lançada por engano", criadoPor: POR,
    });
    await estornarMovimentoDeGestao(prisma, {
      movimentoId, dataMovimento: new Date("2026-08-02T12:00:00Z"),
      motivo: "lançamento equivocado, bem nunca saiu da sala 1", criadoPor: POR,
    });

    expect((await estadoDoBem(prisma, bemId)).localizacaoId).toBe(sala1);
  });
});

describe("t3 · o termo de responsabilidade move o eixo junto", () => {
  it("emitir o termo registra o movimento — uma verdade só", async () => {
    const r = await emitirTermoPatrimonial(prisma, {
      numero: "TR-001", tipo: "RESPONSABILIDADE", responsavelId: anaId,
      setorId: "set-01", data: new Date("2026-04-01T12:00:00Z"),
      bensId: [bemId, bem2Id], criadoPor: POR,
    });
    expect(r.movimentos).toBe(2);

    expect((await estadoDoBem(prisma, bemId)).responsavelId).toBe(anaId);
    const sob = await bensSobResponsabilidade(prisma, anaId);
    expect(sob.map((b) => b.numeroTombamento).sort()).toEqual(["TOMB-0001", "TOMB-0002"]);
  });

  it("⚠️ RECUSA termo de responsabilidade SEM responsável", async () => {
    await expect(
      emitirTermoPatrimonial(prisma, {
        numero: "TR-002", tipo: "RESPONSABILIDADE", setorId: "set-01",
        data: new Date("2026-04-01T12:00:00Z"), bensId: [bemId], criadoPor: POR,
      })
    ).rejects.toThrow(/não entrega o bem a ninguém/);
  });

  it("o termo de BAIXA põe a situação em BAIXADO", async () => {
    await emitirTermoPatrimonial(prisma, {
      numero: "TB-001", tipo: "BAIXA", data: new Date("2026-05-01T12:00:00Z"),
      bensId: [bemId], criadoPor: POR,
    });
    expect((await estadoDoBem(prisma, bemId)).situacao).toBe("BAIXADO");
  });
});

describe("t4 · etiqueta com código de barras (TR 5.19.2)", () => {
  it("⚠️ é IDEMPOTENTE — a segunda chamada devolve a MESMA etiqueta", async () => {
    const a = await gerarEtiquetaDeBem(prisma, { bemId, criadoPor: POR });
    expect(a.reaproveitada).toBe(false);
    expect(a.codigoDeBarras).toBe("TOMB-0001");

    const b = await gerarEtiquetaDeBem(prisma, { bemId, criadoPor: POR });
    expect(
      b.codigoDeBarras,
      "gerar um código novo faria o leitor deixar de reconhecer a etiqueta já colada"
    ).toBe(a.codigoDeBarras);
    expect(b.reaproveitada).toBe(true);
  });
});

describe("t5 · transferência entre entidades é operação composta (TR 5.19.28)", () => {
  it("as duas pernas nascem juntas, e o estorno desfaz as DUAS", async () => {
    const t = await transferirBemEntreEntidades(prisma, {
      bemId, unidadeOrcOrigemId: "uo-01", unidadeOrcDestinoId: "uo-02",
      dataMovimento: new Date("2026-06-01T12:00:00Z"),
      motivo: "cessão do armário para a Saúde", criadoPor: POR,
    });
    expect((await estadoDoBem(prisma, bemId)).unidadeOrcId).toBe("uo-02");

    const e = await estornarMovimentoDeGestao(prisma, {
      movimentoId: t.saidaId, dataMovimento: new Date("2026-06-02T12:00:00Z"),
      motivo: "cessão cancelada pelo secretário", criadoPor: POR,
    });
    expect(
      e.movimentosId,
      "estornar só uma perna deixaria o bem em duas entidades ou em nenhuma"
    ).toHaveLength(2);
    expect((await estadoDoBem(prisma, bemId)).unidadeOrcId).toBeNull();
  });

  it("⚠️ RECUSA transferir de uma origem onde o bem não está", async () => {
    await transferirBemEntreEntidades(prisma, {
      bemId, unidadeOrcOrigemId: "uo-01", unidadeOrcDestinoId: "uo-02",
      dataMovimento: new Date("2026-06-01T12:00:00Z"),
      motivo: "primeira cessão", criadoPor: POR,
    });
    await expect(
      transferirBemEntreEntidades(prisma, {
        bemId, unidadeOrcOrigemId: "uo-01", unidadeOrcDestinoId: "uo-02",
        dataMovimento: new Date("2026-07-01T12:00:00Z"),
        motivo: "segunda cessão da mesma origem", criadoPor: POR,
      })
    ).rejects.toThrow(/e não na origem declarada|mesma unidade/);
  });

  it("⚠️ RECUSA transferir bem BAIXADO", async () => {
    await emitirTermoPatrimonial(prisma, {
      numero: "TB-009", tipo: "BAIXA", data: new Date("2026-05-01T12:00:00Z"),
      bensId: [bemId], criadoPor: POR,
    });
    await expect(
      transferirBemEntreEntidades(prisma, {
        bemId, unidadeOrcOrigemId: "uo-01", unidadeOrcDestinoId: "uo-02",
        dataMovimento: new Date("2026-06-01T12:00:00Z"),
        motivo: "cessão de bem baixado", criadoPor: POR,
      })
    ).rejects.toThrow(/está BAIXADO/);
  });
});

describe("t6 · o inventário de bens e a inconsistência derivada", () => {
  it("bem em sala errada vira LOCAL_DIFERENTE; com correção, ele se move", async () => {
    await registrarMovimentoDeGestao(prisma, {
      bemId, tipo: "LOCALIZACAO", dataMovimento: new Date("2026-01-10T12:00:00Z"),
      localizacaoId: sala1, motivo: "alocação inicial", criadoPor: POR,
    });

    const { inventarioId } = await abrirInventarioDeBens(prisma, {
      exercicio: 2026, comissaoId, unidadeOrcId: "uo-01",
      dataAbertura: new Date("2026-06-01T12:00:00Z"), criadoPor: POR,
    });
    await registrarContagemDeBem(prisma, {
      inventarioId, bemId, encontrado: true,
      localizacaoObservadaId: sala2, criadoPor: POR,
    });

    const antes = await inconsistenciasDoInventarioDeBens(prisma, inventarioId);
    expect(antes).toHaveLength(1);
    expect(antes[0]?.motivo).toBe("LOCAL_DIFERENTE");
    expect(antes[0]?.numeroTombamento).toBe("TOMB-0001");

    // TR 5.19.19 — a comissão DECIDE corrigir; não é automático por omissão.
    await registrarContagemDeBem(prisma, {
      inventarioId, bemId, encontrado: true, localizacaoObservadaId: sala2,
      transferirParaOndeFoiEncontrado: true, criadoPor: POR,
    });
    expect((await estadoDoBem(prisma, bemId)).localizacaoId).toBe(sala2);
  });

  it("bem não encontrado é NAO_ENCONTRADO", async () => {
    const { inventarioId } = await abrirInventarioDeBens(prisma, {
      exercicio: 2026, comissaoId, unidadeOrcId: "uo-01",
      dataAbertura: new Date("2026-06-01T12:00:00Z"), criadoPor: POR,
    });
    await registrarContagemDeBem(prisma, {
      inventarioId, bemId, encontrado: false, criadoPor: POR,
    });
    const d = await inconsistenciasDoInventarioDeBens(prisma, inventarioId);
    expect(d[0]?.motivo).toBe("NAO_ENCONTRADO");
  });

  it("⚠️ RECUSA fechar sem contagem, e RECUSA contar depois de fechado", async () => {
    const { inventarioId } = await abrirInventarioDeBens(prisma, {
      exercicio: 2026, comissaoId, unidadeOrcId: "uo-01",
      dataAbertura: new Date("2026-06-01T12:00:00Z"), criadoPor: POR,
    });
    await expect(
      fecharInventarioDeBens(prisma, {
        inventarioId, dataFechamento: new Date("2026-06-10T12:00:00Z"), criadoPor: POR,
      })
    ).rejects.toThrow(/não tem contagem nenhuma/);

    await registrarContagemDeBem(prisma, {
      inventarioId, bemId, encontrado: true, criadoPor: POR,
    });
    await fecharInventarioDeBens(prisma, {
      inventarioId, dataFechamento: new Date("2026-06-10T12:00:00Z"), criadoPor: POR,
    });

    await expect(
      registrarContagemDeBem(prisma, {
        inventarioId, bemId: bem2Id, encontrado: true, criadoPor: POR,
      })
    ).rejects.toThrow(/já foi FECHADO/);
  });
});

describe("t7 · a fórmula de avaliação (TR 5.19.42)", () => {
  it("avalia com os dados do bem, e NÃO escreve nada", async () => {
    // ⚠️ O LANÇAMENTO PRIMEIRO, E DEPOIS O MOVIMENTO. Misturar `classeDeBensId` escalar
    // com `lancamento: { create: ... }` aninhado faz o Prisma exigir TODAS as relações na
    // forma aninhada — e a mensagem ("Argument `classeDeBens` is missing") não diz isso.
    const lanc = await prisma.lancamentoContabil.create({
      data: {
        numeroControle: "LC-AV-1", dataTransacao: new Date("2024-01-15T12:00:00Z"),
        historico: "aquisição", origemTipo: "PATRIMONIAL", origemId: bemId,
        criadoPor: POR,
        partidas: {
          create: [
            { contaId: "c-movel", tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "10000.00" },
            { contaId: "c-movel", tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "10000.00" },
          ],
        },
      },
      select: { id: true },
    });
    await prisma.movimentoPatrimonial.create({
      data: {
        classeDeBensId: (await prisma.classeDeBens.findFirstOrThrow({ select: { id: true } })).id,
        bemId, tipo: "AQUISICAO", valor: "10000.00",
        dataMovimento: new Date("2024-01-15T12:00:00Z"),
        lancamentoId: lanc.id, criadoPor: POR,
      },
    });

    const { formulaId } = await cadastrarFormulaDeAvaliacao(prisma, {
      codigo: "F-RESIDUAL", descricao: "Valor residual mínimo",
      expressao: "valorBruto * percentualResidual", criadoPor: POR,
    });

    const antes = await prisma.movimentoPatrimonial.count();
    const r = await avaliarBemPorFormula(prisma, {
      bemId, formulaId, ateDia: "2026-06-01",
    });
    expect(r.valor.toFixed(2)).toBe("1000.00");
    expect(
      await prisma.movimentoPatrimonial.count(),
      "avaliar CALCULA; lançar é registrarReavaliacao, que passa pelo funil do M01"
    ).toBe(antes);
  });

  it("⚠️ fórmula com código NÃO é salva", async () => {
    await expect(
      cadastrarFormulaDeAvaliacao(prisma, {
        codigo: "F-MAU", descricao: "Tentativa de execução",
        expressao: 'this.constructor.constructor("return process.env")()',
        criadoPor: POR,
      })
    ).rejects.toThrow();
    expect(await prisma.formulaDeAvaliacao.count()).toBe(0);
  });
});

describe("t8 · os cadastros configuráveis (TR 5.19.3, 5.19.7, 5.19.30)", () => {
  it("motivo de baixa e tipo de incorporação são TABELA", async () => {
    await cadastrarMotivoDeBaixa(prisma, {
      codigo: "OBSOL", descricao: "Obsolescência", criadoPor: POR,
    });
    await cadastrarTipoDeIncorporacao(prisma, {
      codigo: "DOACAO", descricao: "Recebido em doação", criadoPor: POR,
    });
    expect(await prisma.motivoDeBaixa.count()).toBe(1);
    expect(await prisma.tipoDeIncorporacao.count()).toBe(1);
  });
});

describe("t9 · ⚠️ O EIXO DE GESTÃO NÃO TOCA O RAZÃO, e a autorização é do servidor", () => {
  it("nenhum lançamento contábil nasce de movimento de gestão", async () => {
    const antes = await prisma.lancamentoContabil.count();

    await registrarMovimentoDeGestao(prisma, {
      bemId, tipo: "LOCALIZACAO", dataMovimento: new Date("2026-03-01T12:00:00Z"),
      localizacaoId: sala1, motivo: "alocação inicial", criadoPor: POR,
    });
    await emitirTermoPatrimonial(prisma, {
      numero: "TR-900", tipo: "RESPONSABILIDADE", responsavelId: anaId,
      data: new Date("2026-04-01T12:00:00Z"), bensId: [bemId], criadoPor: POR,
    });
    await transferirBemEntreEntidades(prisma, {
      bemId, unidadeOrcOrigemId: "uo-01", unidadeOrcDestinoId: "uo-02",
      dataMovimento: new Date("2026-06-01T12:00:00Z"),
      motivo: "cessão administrativa", criadoPor: POR,
    });

    expect(
      await prisma.lancamentoContabil.count(),
      "um movimento de GESTÃO gerou lançamento — o eixo de gestão está contaminando a " +
        "contabilidade do bem, que é o que ele existe para NÃO fazer"
    ).toBe(antes);
  });

  it("usuário sem a ação é recusado, e nada é gravado", async () => {
    const antes = await prisma.movimentoDeGestaoDoBem.count();
    await expect(
      registrarMovimentoDeGestao(prisma, {
        bemId, tipo: "LOCALIZACAO", dataMovimento: new Date("2026-03-01T12:00:00Z"),
        localizacaoId: sala1, motivo: "movimento sem permissão",
        criadoPor: SEM_PERMISSAO,
      })
    ).rejects.toThrow();
    expect(await prisma.movimentoDeGestaoDoBem.count()).toBe(antes);
  });
});
