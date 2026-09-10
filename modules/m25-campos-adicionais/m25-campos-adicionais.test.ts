import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { abrirProcesso } from "../m21-protocolo/servico.js";
import {
  camposDoRegistro,
  historicoDeCamposAdicionais,
  registrosComCampo,
} from "./consultas.js";
import { exibirValor, valorParaColunas } from "./dominio.js";
import {
  definirCampoAdicional,
  desativarCampoAdicional,
  preencherCamposAdicionais,
} from "./servico.js";

/**
 * M25 — CAMPOS ADICIONAIS DE VERDADE.
 *
 * ═══ O QUE ESTE ARQUIVO PROVA ═══
 * Os testes do lote: campo do tipo LISTA DINÂMICA persiste, filtra na listagem e aparece
 * no histórico de alterações (12); campo adicional de uma entidade NÃO vaza para outra
 * entidade do mesmo município (13).
 *
 * E a coisa que o prompt do lote cobra em voz alta: que isto não seja um campo de
 * observação com outro nome. Os sete tipos convertem, validam e RECUSAM — um campo
 * declarado DATA que aceita "amanhã" é um campo de texto com rótulo de data.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const PROTOCOLO = "protocolo@cg.pb.gov.br";
let assuntoId = "";
let requerenteId = "";

async function semear(): Promise<void> {
  await limparBanco(prisma);

  await prisma.orgao.create({ data: { id: "k-org", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.createMany({
    data: [
      { id: "k-uo1", codigo: "01001", descricao: "Educação", orgaoId: "k-org" },
      { id: "k-uo2", codigo: "01002", descricao: "Saúde", orgaoId: "k-org" },
    ],
  });
  await prisma.exercicio.create({ data: { id: "k-ex", ano: 2026, criadoPor: "SEED" } });
  await prisma.setor.createMany({
    data: [
      { id: "k-s1", codigo: "EDU", nome: "Protocolo da Educação", unidadeOrcId: "k-uo1", criadoPor: "SEED" },
      { id: "k-s2", codigo: "SAU", nome: "Protocolo da Saúde", unidadeOrcId: "k-uo2", criadoPor: "SEED" },
      // ⚠️ SEGUNDO SETOR NA MESMA UNIDADE — a lista dinâmica é escopada por unidade
      // gestora, então trocar o valor exige outra opção DA MESMA unidade. A primeira
      // versão deste teste tentou trocar para "SAU" (que é da Saúde) e foi recusada:
      // o comportamento estava certo, o teste é que estava errado.
      { id: "k-s3", codigo: "EDUB", nome: "Almoxarifado da Educação", unidadeOrcId: "k-uo1", criadoPor: "SEED" },
    ],
  });
  await prisma.usuarioDoSetor.createMany({
    data: [
      { usuarioIdent: PROTOCOLO, setorId: "k-s1", criadoPor: "SEED" },
      { usuarioIdent: PROTOCOLO, setorId: "k-s2", criadoPor: "SEED" },
    ],
  });
  assuntoId = (
    await prisma.assunto.create({
      data: { codigo: "REQ", nome: "Requerimento geral", criadoPor: "SEED" },
      select: { id: true },
    })
  ).id;
  requerenteId = (
    await prisma.pessoa.create({
      data: {
        documento: "11144477735", tipo: "FISICA", criadoPor: "SEED",
        versoes: { create: { nome: "Maria", ativa: true, criadoPor: "SEED" } },
      },
      select: { id: true },
    })
  ).id;
}

const ABERTURA = {
  exercicio: 2026,
  finalidade: "INTERNO" as const,
  textoAbertura: "Processo para exercitar os campos adicionais.",
  criadoPor: PROTOCOLO,
};

beforeEach(semear);

describe("M25 — os sete tipos convertem, validam e RECUSAM", () => {
  it("t1: VALOR vai para Decimal, e o texto brasileiro é entendido", () => {
    expect(valorParaColunas("VALOR", "1.234,56").valorNumero).toBe("1234.56");
    expect(valorParaColunas("VALOR", "0,10").valorNumero).toBe("0.10");
    expect(() => valorParaColunas("VALOR", "muito")).toThrow(/não é um valor monetário/);
    // A volta: o que a tela mostra.
    expect(
      exibirValor("VALOR", {
        valorTexto: null, valorNumero: "1234.56", valorData: null, valorBooleano: null,
      })
    ).toBe("1.234,56");
  });

  it("t2: DATA aceita ISO e dd/mm/aaaa — e recusa o dia que não existe", () => {
    expect(valorParaColunas("DATA", "2026-03-15").valorData?.toISOString()).toBe(
      "2026-03-15T00:00:00.000Z"
    );
    expect(valorParaColunas("DATA", "15/03/2026").valorData?.toISOString()).toBe(
      "2026-03-15T00:00:00.000Z"
    );
    // ⚠️ 31/02 vira 03/03 num `new Date` complacente. A conferência de volta o recusa.
    expect(() => valorParaColunas("DATA", "31/02/2026")).toThrow(/exista no calendário/);
    expect(() => valorParaColunas("DATA", "amanhã")).toThrow(/não é uma data/);
  });

  it("t3: HORA é HH:MM e nada mais; BOOLEANO é sim ou não", () => {
    expect(valorParaColunas("HORA", "08:30").valorTexto).toBe("08:30");
    expect(() => valorParaColunas("HORA", "25:00")).toThrow(/Use HH:MM/);
    expect(valorParaColunas("BOOLEANO", "sim").valorBooleano).toBe(true);
    expect(valorParaColunas("BOOLEANO", "0").valorBooleano).toBe(false);
    expect(() => valorParaColunas("BOOLEANO", "talvez")).toThrow(/não é sim nem não/);
  });

  it("t4: LISTA só aceita o que está nas opções", () => {
    const opcoes = ["Baixa", "Média", "Alta"];
    expect(valorParaColunas("LISTA", "Alta", opcoes).valorTexto).toBe("Alta");
    expect(() => valorParaColunas("LISTA", "Altíssima", opcoes)).toThrow(
      /não está entre as opções[\s\S]*Baixa, Média, Alta/
    );
  });
});

describe("M25 — definição, preenchimento e histórico", () => {
  it("t5: LISTA DINÂMICA persiste, filtra na listagem e aparece no histórico", async () => {
    const def = await definirCampoAdicional(prisma, {
      unidadeOrcId: "k-uo1",
      cadastro: "PROCESSO",
      codigo: "setor_responsavel",
      rotulo: "Setor responsável pela instrução",
      tipo: "LISTA_DINAMICA",
      origemDinamica: "SETOR",
      ordem: 1,
      criadoPor: PROTOCOLO,
    });

    const p1 = await abrirProcesso(prisma, {
      ...ABERTURA, assuntoId, requerenteId, setorAberturaId: "k-s1",
    });
    const p2 = await abrirProcesso(prisma, {
      ...ABERTURA, assuntoId, requerenteId, setorAberturaId: "k-s1",
    });

    // As opções vêm do cadastro de SETORES da unidade — não de uma lista digitada.
    await preencherCamposAdicionais(prisma, {
      cadastro: "PROCESSO", registroId: p1.processoId,
      valores: { setor_responsavel: "EDU" }, criadoPor: PROTOCOLO,
    });
    // ⚠️ O SETOR DA SAÚDE NÃO É OPÇÃO AQUI. A lista dinâmica sai dos setores DA
    // UNIDADE — um campo da Educação não oferece o setor da Saúde, e isso é o mesmo
    // isolamento que o t6 prova por outro caminho.
    await expect(
      preencherCamposAdicionais(prisma, {
        cadastro: "PROCESSO", registroId: p2.processoId,
        valores: { setor_responsavel: "SAU" }, criadoPor: PROTOCOLO,
      })
    ).rejects.toThrow(/não está entre as opções do campo. Opções: EDU, EDUB/);

    // PERSISTE e aparece no detalhe.
    const campos = await camposDoRegistro(prisma, "PROCESSO", p1.processoId, "k-uo1");
    expect(campos).toHaveLength(1);
    expect(campos[0]?.rotulo).toBe("Setor responsável pela instrução");
    expect(campos[0]?.valor).toBe("EDU");
    expect(campos[0]?.preenchidoPor).toBe(PROTOCOLO);

    // FILTRA na listagem.
    const achados = await registrosComCampo(prisma, "PROCESSO", def.definicaoId, {
      texto: "EDU",
    });
    expect(achados).toEqual([p1.processoId]);

    // E o HISTÓRICO mostra a alteração. Corrigir é gravar outro valor — o anterior fica.
    await preencherCamposAdicionais(prisma, {
      cadastro: "PROCESSO", registroId: p1.processoId,
      valores: { setor_responsavel: "EDUB" }, criadoPor: PROTOCOLO,
    });
    const historico = await historicoDeCamposAdicionais(prisma, "PROCESSO", p1.processoId);
    expect(historico.map((h) => h.valor)).toEqual(["EDUB", "EDU"]);
    expect(historico[0]?.por).toBe(PROTOCOLO);

    // ⚠️ E O FILTRO ACOMPANHA: quem mudou para SAU sai do filtro por EDU. Sem olhar só
    // o valor vigente, o filtro responderia sobre o passado sem avisar.
    expect(
      await registrosComCampo(prisma, "PROCESSO", def.definicaoId, { texto: "EDU" })
    ).toEqual([]);
    expect(
      await registrosComCampo(prisma, "PROCESSO", def.definicaoId, { texto: "EDUB" })
    ).toEqual([p1.processoId]);
  });

  it("t6: campo adicional de uma ENTIDADE não vaza para outra do mesmo município", async () => {
    await definirCampoAdicional(prisma, {
      unidadeOrcId: "k-uo1", cadastro: "PROCESSO", codigo: "turma",
      rotulo: "Turma", tipo: "ALFANUMERICO", ordem: 1, criadoPor: PROTOCOLO,
    });

    const daSaude = await abrirProcesso(prisma, {
      ...ABERTURA, assuntoId, requerenteId, setorAberturaId: "k-s2",
    });

    // ⚠️ O ISOLAMENTO NÃO É UMA CONSULTA FILTRADA: é a IMPOSSIBILIDADE de a gravação
    // alcançar a definição alheia. O código existe — na Educação — e mesmo assim o
    // processo da Saúde não consegue usá-lo.
    await expect(
      preencherCamposAdicionais(prisma, {
        cadastro: "PROCESSO", registroId: daSaude.processoId,
        valores: { turma: "3º ano B" }, criadoPor: PROTOCOLO,
      })
    ).rejects.toThrow(/não encontrado\(s\) neste cadastro da unidade gestora: turma/);

    // E a leitura pela unidade da Saúde não enxerga o campo da Educação.
    expect(await camposDoRegistro(prisma, "PROCESSO", daSaude.processoId, "k-uo2")).toEqual([]);

    // O MESMO CÓDIGO pode existir nas duas unidades, significando coisas diferentes —
    // e é por isso que a unicidade é [unidade, cadastro, código].
    await definirCampoAdicional(prisma, {
      unidadeOrcId: "k-uo2", cadastro: "PROCESSO", codigo: "turma",
      rotulo: "Turma de vacinação", tipo: "ALFANUMERICO", ordem: 1, criadoPor: PROTOCOLO,
    });
    await preencherCamposAdicionais(prisma, {
      cadastro: "PROCESSO", registroId: daSaude.processoId,
      valores: { turma: "Idosos" }, criadoPor: PROTOCOLO,
    });
    const campos = await camposDoRegistro(prisma, "PROCESSO", daSaude.processoId, "k-uo2");
    expect(campos[0]?.rotulo).toBe("Turma de vacinação");
    expect(campos[0]?.valor).toBe("Idosos");
  });

  it("t7: código desconhecido é RECUSADO, não ignorado em silêncio", async () => {
    const p = await abrirProcesso(prisma, {
      ...ABERTURA, assuntoId, requerenteId, setorAberturaId: "k-s1",
    });
    await expect(
      preencherCamposAdicionais(prisma, {
        cadastro: "PROCESSO", registroId: p.processoId,
        valores: { inventado: "x" }, criadoPor: PROTOCOLO,
      })
    ).rejects.toThrow(/não encontrado\(s\)[\s\S]*gravar em silêncio faria a tela dizer/);
  });

  it("t8: obrigatório vazio é recusado; e apagar um campo é um FATO no histórico", async () => {
    await definirCampoAdicional(prisma, {
      unidadeOrcId: "k-uo1", cadastro: "PROCESSO", codigo: "matricula",
      rotulo: "Matrícula", tipo: "ALFANUMERICO", obrigatorio: true, ordem: 1,
      criadoPor: PROTOCOLO,
    });
    await definirCampoAdicional(prisma, {
      unidadeOrcId: "k-uo1", cadastro: "PROCESSO", codigo: "observacao_extra",
      rotulo: "Observação", tipo: "ALFANUMERICO", ordem: 2, criadoPor: PROTOCOLO,
    });

    const p = await abrirProcesso(prisma, {
      ...ABERTURA, assuntoId, requerenteId, setorAberturaId: "k-s1",
    });

    await expect(
      preencherCamposAdicionais(prisma, {
        cadastro: "PROCESSO", registroId: p.processoId,
        valores: { matricula: "  " }, criadoPor: PROTOCOLO,
      })
    ).rejects.toThrow(/"Matrícula" é obrigatório e veio vazio/);

    await preencherCamposAdicionais(prisma, {
      cadastro: "PROCESSO", registroId: p.processoId,
      valores: { observacao_extra: "primeiro texto" }, criadoPor: PROTOCOLO,
    });
    const apagou = await preencherCamposAdicionais(prisma, {
      cadastro: "PROCESSO", registroId: p.processoId,
      valores: { observacao_extra: "" }, criadoPor: PROTOCOLO,
    });
    expect(apagou).toEqual({ gravados: 0, apagados: 1 });

    // ⚠️ APAGAR É UM FATO, e ele fica na história. Sem esta linha, "apagar" seria
    // deletar a anterior e o histórico perderia que o dado existiu.
    const h = await historicoDeCamposAdicionais(prisma, "PROCESSO", p.processoId);
    expect(h.map((x) => ({ valor: x.valor, apagado: x.apagado }))).toEqual([
      { valor: "", apagado: true },
      { valor: "primeiro texto", apagado: false },
    ]);
  });

  it("t9: a definição recusa o incoerente — lista sem opção, dinâmica sem origem", async () => {
    const base = {
      unidadeOrcId: "k-uo1", cadastro: "PROCESSO" as const, ordem: 1,
      criadoPor: PROTOCOLO,
    };
    await expect(
      definirCampoAdicional(prisma, {
        ...base, codigo: "vazia", rotulo: "Lista vazia", tipo: "LISTA",
      })
    ).rejects.toThrow(/campo que a tela mostra e ninguém consegue preencher/);

    await expect(
      definirCampoAdicional(prisma, {
        ...base, codigo: "sem_origem", rotulo: "Dinâmica sem origem", tipo: "LISTA_DINAMICA",
      })
    ).rejects.toThrow(/exige a ORIGEM das opções/);

    await expect(
      definirCampoAdicional(prisma, {
        ...base, codigo: "texto_com_opcoes", rotulo: "Texto", tipo: "ALFANUMERICO",
        opcoes: ["a", "b"],
      })
    ).rejects.toThrow(/Opções só fazem sentido no tipo LISTA/);

    // Código repetido no mesmo cadastro e unidade: recusado, e a mensagem diz por quê.
    await definirCampoAdicional(prisma, {
      ...base, codigo: "unico", rotulo: "Único", tipo: "ALFANUMERICO",
    });
    await expect(
      definirCampoAdicional(prisma, {
        ...base, codigo: "unico", rotulo: "Outro sentido", tipo: "DATA",
      })
    ).rejects.toThrow(/passarem a significar o que nunca significaram/);
  });

  it("t10: campo desativado some do formulário e CONTINUA visível onde tem valor", async () => {
    const def = await definirCampoAdicional(prisma, {
      unidadeOrcId: "k-uo1", cadastro: "PROCESSO", codigo: "programa_antigo",
      rotulo: "Programa (descontinuado)", tipo: "ALFANUMERICO", ordem: 1,
      criadoPor: PROTOCOLO,
    });

    const comValor = await abrirProcesso(prisma, {
      ...ABERTURA, assuntoId, requerenteId, setorAberturaId: "k-s1",
    });
    await preencherCamposAdicionais(prisma, {
      cadastro: "PROCESSO", registroId: comValor.processoId,
      valores: { programa_antigo: "Mais Educação" }, criadoPor: PROTOCOLO,
    });

    await desativarCampoAdicional(prisma, {
      definicaoId: def.definicaoId, criadoPor: PROTOCOLO,
    });

    // Num processo NOVO ele não aparece: a entidade parou de perguntar isso.
    const novo = await abrirProcesso(prisma, {
      ...ABERTURA, assuntoId, requerenteId, setorAberturaId: "k-s1",
    });
    expect(await camposDoRegistro(prisma, "PROCESSO", novo.processoId, "k-uo1")).toEqual([]);

    // ⚠️ MAS ONDE JÁ FOI RESPONDIDO, CONTINUA VISÍVEL. Escondê-lo apagaria da tela um
    // dado que continua no banco, e o usuário concluiria que ele se perdeu.
    const antigos = await camposDoRegistro(prisma, "PROCESSO", comValor.processoId, "k-uo1");
    expect(antigos).toHaveLength(1);
    expect(antigos[0]?.valor).toBe("Mais Educação");
    expect(antigos[0]?.ativo).toBe(false);

    // E preencher um campo desativado é recusado.
    await expect(
      preencherCamposAdicionais(prisma, {
        cadastro: "PROCESSO", registroId: novo.processoId,
        valores: { programa_antigo: "tentativa" }, criadoPor: PROTOCOLO,
      })
    ).rejects.toThrow(/não encontrado\(s\)/);
  });
});
