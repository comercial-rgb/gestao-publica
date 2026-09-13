import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { toMoney } from "../../packages/contracts/index.js";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import {
  LIMITE_ETARIO_LEGAL,
  cargoVigenteEm,
  criaCicloDeLotacao,
  dataDeDesligamento,
  dependenteValeEm,
  idadeEm,
  lotacaoVigenteEm,
  lotadosNaLotacao,
  motivoDaInvalidade,
  regimeVigenteEm,
  salarioBaseVigenteEm,
  situacaoDoVinculo,
  terminoVigenteDoContrato,
  vagasOcupadasDoCargo,
  type EventoDoVinculo,
} from "./dominio.js";
import {
  admitirServidor,
  baixarFinalidadeDependente,
  cadastrarCargo,
  cadastrarContratoTrabalho,
  cadastrarDependente,
  cadastrarDiaCalendarioRh,
  cadastrarLotacao,
  cadastrarServidor,
  desligarServidor,
  prorrogarContratoTrabalho,
  registrarAlteracaoRemuneratoria,
  registrarAnotacaoServidor,
  registrarAvaliacaoExperiencia,
  registrarMovimentacao,
  registrarPortaria,
  registrarTreinamento,
} from "./servico.js";

/**
 * M32 — PESSOAL (RH bloco 1, conciliado do siafic-cg c04ad5a; lá "m22-rh"). TR 5.12.
 *
 * ═══ ⚠️ O QUE ESTE ARQUIVO PROVA, E O QUE ELE EXISTE PARA IMPEDIR ═══
 *
 * · **O DEFEITO DA PROJEÇÃO NÃO SE REPETE.** Na folha da LC 131, `cargo` é coluna da PESSOA
 *   (m20-folha-transparencia.prisma:19) e a folha de maio é republicada com o cargo de hoje. Aqui
 *   o teste pergunta por MAIO depois de uma promoção em JUNHO — e recebe o cargo de maio. Se
 *   alguém transformar cargo em coluna do vínculo, este teste cai primeiro.
 *
 * · **A SEGUNDA MATRÍCULA É ALERTA, NÃO ERRO** (TR req. 4), e a acumulação fica VISÍVEL. Recusar
 *   obrigaria o RH a cadastrar a mesma pessoa com CPFs falsos; passar em silêncio deixaria o
 *   acúmulo ilegal atravessar anos.
 *
 * · **A BAIXA DO DEPENDENTE POR IDADE ACONTECE SOZINHA** (req. 7) — sem job noturno, porque não
 *   há coluna a atualizar.
 *
 * · **AS VAGAS OCUPADAS SÃO CONTADAS, NUNCA GUARDADAS** (req. 9): é este número que autoriza a
 *   próxima nomeação.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

// ⚠️ IDENTIDADE DAS FIXTURES — não se inventa uma nova (`test/usuarios-teste.ts`). Uma fora da
// lista faz TODA escrita cair em "USUÁRIO NÃO CADASTRADO", que é outra recusa e mascararia o
// teste de permissão.
const POR = "contabilidade@cg.pb.gov.br";
const SEM_PODER = "estagiario.rh@cg.pb.gov.br";
const D = (a: number, m: number, d: number): Date => new Date(Date.UTC(a, m - 1, d, 12, 0, 0));

/** A PESSOA FÍSICA do cadastro único (M19) — o servidor aponta para ela (V6 P2.1). CPF fictício. */
async function pessoaFisica(documento: string, nome: string): Promise<string> {
  const p = await prisma.pessoa.create({
    data: { documento, tipo: "FISICA", criadoPor: POR, versoes: { create: { nome, criadoPor: POR } } },
    select: { id: true },
  });
  return p.id;
}

beforeEach(async () => {
  await limparBanco(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ═══════════════════════════════════════════════════════════════════════════════
// AS DERIVAÇÕES, PURAS — sem banco. É aqui que o defeito da projeção morre.
// ═══════════════════════════════════════════════════════════════════════════════

const ev = (
  data: Date,
  tipo: EventoDoVinculo["tipo"],
  extra: Partial<Pick<EventoDoVinculo, "cargoId" | "lotacaoId" | "salarioBase" | "regimePrevidenciario">> = {}
): EventoDoVinculo => ({
  data,
  criadoEm: data,
  tipo,
  cargoId: extra.cargoId ?? null,
  lotacaoId: extra.lotacaoId ?? null,
  salarioBase: extra.salarioBase ?? null,
  regimePrevidenciario: extra.regimePrevidenciario ?? null,
});

describe("(5) o cargo vigente é DERIVADO — a promoção de junho não muda o cargo de maio", () => {
  const eventos = [
    ev(D(2026, 1, 1), "ADMISSAO", {
      cargoId: "cargo-professor",
      lotacaoId: "lot-escola",
      salarioBase: toMoney("3000.00"),
    }),
    ev(D(2026, 6, 1), "PROMOCAO", {
      cargoId: "cargo-diretor",
      salarioBase: toMoney("5000.00"),
    }),
  ];

  /**
   * ⚠️ ESTE É O TESTE QUE JUSTIFICA O MÓDULO INTEIRO.
   *
   * `datasetFolhaPublica` (m13-transparencia/folha.ts:35) lê o cargo por join no servidor, e o
   * cargo é coluna da pessoa: publicar a competência 2026-05 depois desta promoção mostraria
   * "Diretor". Aqui a mesma pergunta devolve "Professor", porque a promoção é uma LINHA NOVA e a
   * de janeiro continua onde estava.
   */
  it("⚠️ em MAIO ele ainda é professor — o passado não foi reescrito", () => {
    expect(cargoVigenteEm(eventos, D(2026, 5, 31))).toBe("cargo-professor");
    expect(salarioBaseVigenteEm(eventos, D(2026, 5, 31))?.toFixed(2)).toBe("3000.00");
  });

  it("em JUNHO ele já é diretor — a borda é INCLUSIVA, vale no dia 1º", () => {
    expect(cargoVigenteEm(eventos, D(2026, 6, 1))).toBe("cargo-diretor");
    expect(salarioBaseVigenteEm(eventos, D(2026, 6, 1))?.toFixed(2)).toBe("5000.00");
  });

  it("antes da admissão não há cargo nenhum — `null`, e não o primeiro que aparecer", () => {
    expect(cargoVigenteEm(eventos, D(2025, 12, 31))).toBeNull();
  });

  it("a promoção NÃO move a lotação — ela só carrega o que declarou", () => {
    expect(lotacaoVigenteEm(eventos, D(2026, 12, 31))).toBe("lot-escola");
  });

  /**
   * ⚠️ O MESMO DEFEITO, AGORA EM DINHEIRO (V6 P2.3). O regime previdenciário decide QUAL TABELA de
   * contribuição a folha aplica — RGPS progressivo com teto, ou a alíquota do RPPS do ente. Se ele
   * fosse coluna do vínculo, recalcular a folha de maio depois de uma migração em junho aplicaria a
   * tabela errada, e o recálculo é exatamente o que se faz quando alguém contesta o desconto.
   */
  it("⚠️ o regime previdenciário de MAIO não muda com a migração de junho — e antes da admissão é o fallback", () => {
    const comRegime = [
      ev(D(2026, 1, 1), "ADMISSAO", { cargoId: "cargo-professor", lotacaoId: "lot-escola", salarioBase: toMoney("3000.00"), regimePrevidenciario: "RGPS" }),
      ev(D(2026, 6, 1), "MUDANCA_REGIME_PREVIDENCIARIO", { regimePrevidenciario: "RPPS" }),
    ];
    expect(regimeVigenteEm(comRegime, null, D(2026, 5, 31))).toBe("RGPS");
    expect(regimeVigenteEm(comRegime, null, D(2026, 6, 1))).toBe("RPPS");
    // Vínculo legado, sem evento com regime: vale o declarado na admissão (a coluna), e nada mais.
    expect(regimeVigenteEm(eventos, "RGPS", D(2026, 12, 31))).toBe("RGPS");
    expect(regimeVigenteEm(eventos, null, D(2026, 12, 31))).toBeNull();
  });

  /**
   * ⚠️ O DESEMPATE POR `criadoEm` — dois eventos no MESMO dia de efeito.
   *
   * Sem ele, qual salário vale dependeria da ordem em que o Postgres devolvesse as linhas, que
   * não é ordem nenhuma. Aqui a promoção é digitada antes e o reajuste depois: vale o reajuste.
   */
  it("⚠️ dois eventos no mesmo dia: quem foi digitado por último vence", () => {
    const mesmoDia = [
      ev(D(2026, 1, 1), "ADMISSAO", {
        cargoId: "c1",
        lotacaoId: "l1",
        salarioBase: toMoney("1000.00"),
      }),
      {
        ...ev(D(2026, 6, 1), "PROMOCAO", { cargoId: "c2", salarioBase: toMoney("2000.00") }),
        criadoEm: D(2026, 6, 10),
      },
      {
        ...ev(D(2026, 6, 1), "REAJUSTE_SALARIAL", { salarioBase: toMoney("2200.00") }),
        criadoEm: D(2026, 6, 20),
      },
    ];
    expect(salarioBaseVigenteEm(mesmoDia, D(2026, 6, 1))?.toFixed(2)).toBe("2200.00");
    expect(cargoVigenteEm(mesmoDia, D(2026, 6, 1))).toBe("c2");
  });
});

describe("a situação do vínculo — derivada, e o desligamento precede tudo", () => {
  const base = ev(D(2026, 1, 1), "ADMISSAO", {
    cargoId: "c",
    lotacaoId: "l",
    salarioBase: toMoney("1000.00"),
  });

  it("sem eventos além da admissão: ATIVO", () => {
    expect(situacaoDoVinculo([base], D(2026, 3, 1))).toBe("ATIVO");
  });

  it("afastado e ainda não retornado: AFASTADO", () => {
    const e = [base, ev(D(2026, 2, 1), "AFASTAMENTO")];
    expect(situacaoDoVinculo(e, D(2026, 3, 1))).toBe("AFASTADO");
  });

  /**
   * ⚠️ ESTE É O DEFEITO QUE A COLUNA `situacao` TERIA. Uma coluna precisaria ser atualizada no
   * dia do retorno; ninguém atualiza, e o servidor que voltou em março continuaria "AFASTADO" na
   * folha de abril — deixando de ser pago.
   */
  it("⚠️ retornado: volta a ATIVO sozinho, sem ninguém atualizar nada", () => {
    const e = [base, ev(D(2026, 2, 1), "AFASTAMENTO"), ev(D(2026, 3, 1), "RETORNO_AFASTAMENTO")];
    expect(situacaoDoVinculo(e, D(2026, 2, 15))).toBe("AFASTADO");
    expect(situacaoDoVinculo(e, D(2026, 3, 1))).toBe("ATIVO");
  });

  it("⚠️ exonerado DURANTE afastamento: DESLIGADO — a exoneração encerra o vínculo", () => {
    const e = [base, ev(D(2026, 2, 1), "AFASTAMENTO"), ev(D(2026, 4, 1), "DESLIGAMENTO")];
    expect(situacaoDoVinculo(e, D(2026, 5, 1))).toBe("DESLIGADO");
    expect(dataDeDesligamento(e)?.toISOString().slice(0, 10)).toBe("2026-04-01");
  });

  it("a situação ANTES do desligamento continua sendo a de então", () => {
    const e = [base, ev(D(2026, 4, 1), "DESLIGAMENTO")];
    expect(situacaoDoVinculo(e, D(2026, 3, 1))).toBe("ATIVO");
  });
});

describe("(8) vagas ocupadas — contadas, nunca guardadas (TR req. 9)", () => {
  const admitido = (cargo: string): { readonly eventos: readonly EventoDoVinculo[] } => ({
    eventos: [
      ev(D(2026, 1, 1), "ADMISSAO", {
        cargoId: cargo,
        lotacaoId: "lot",
        salarioBase: toMoney("1000.00"),
      }),
    ],
  });

  it("conta os vínculos ativos naquele cargo", () => {
    const vinculos = [admitido("c1"), admitido("c1"), admitido("c2")];
    expect(vagasOcupadasDoCargo(vinculos, "c1", D(2026, 3, 1))).toBe(2);
    expect(vagasOcupadasDoCargo(vinculos, "c2", D(2026, 3, 1))).toBe(1);
  });

  /** ⚠️ Sem o filtro de situação, o cargo pareceria lotado com gente que já saiu. */
  it("⚠️ o desligado NÃO ocupa vaga", () => {
    const saiu = {
      eventos: [...admitido("c1").eventos, ev(D(2026, 2, 1), "DESLIGAMENTO")],
    };
    expect(vagasOcupadasDoCargo([admitido("c1"), saiu], "c1", D(2026, 3, 1))).toBe(1);
    // E antes de sair, ocupava.
    expect(vagasOcupadasDoCargo([admitido("c1"), saiu], "c1", D(2026, 1, 15))).toBe(2);
  });

  /** ⚠️ Sem o cargo VIGENTE, o promovido ocuparia DUAS vagas: a antiga e a nova. */
  it("⚠️ o promovido larga a vaga antiga e ocupa a nova — nunca as duas", () => {
    const promovido = {
      eventos: [
        ...admitido("c1").eventos,
        ev(D(2026, 6, 1), "PROMOCAO", { cargoId: "c2", salarioBase: toMoney("2000.00") }),
      ],
    };
    expect(vagasOcupadasDoCargo([promovido], "c1", D(2026, 7, 1))).toBe(0);
    expect(vagasOcupadasDoCargo([promovido], "c2", D(2026, 7, 1))).toBe(1);
    // E em maio a conta era a outra — a mesma função, outra data.
    expect(vagasOcupadasDoCargo([promovido], "c1", D(2026, 5, 1))).toBe(1);
  });

  it("a lotação conta pela mesma disciplina", () => {
    const removido = {
      eventos: [
        ...admitido("c1").eventos,
        ev(D(2026, 6, 1), "MUDANCA_LOTACAO", { lotacaoId: "lot2" }),
      ],
    };
    expect(lotadosNaLotacao([removido], "lot", D(2026, 5, 1))).toBe(1);
    expect(lotadosNaLotacao([removido], "lot", D(2026, 7, 1))).toBe(0);
    expect(lotadosNaLotacao([removido], "lot2", D(2026, 7, 1))).toBe(1);
  });
});

describe("(6) o dependente baixa sozinho na idade limite (TR req. 7)", () => {
  const NASCIMENTO = D(2012, 3, 10);
  const salarioFamilia = {
    dataNascimento: NASCIMENTO,
    invalidezPermanente: false,
    dataInicio: D(2012, 3, 10),
    limiteIdadeAnos: LIMITE_ETARIO_LEGAL.SALARIO_FAMILIA,
    dataBaixa: null,
  };

  it("os limites legais são os da lei, e o `null` diz SEM LIMITE", () => {
    expect(LIMITE_ETARIO_LEGAL.SALARIO_FAMILIA).toBe(14);
    expect(LIMITE_ETARIO_LEGAL.IMPOSTO_RENDA).toBe(21);
    expect(LIMITE_ETARIO_LEGAL.PLANO_SAUDE).toBeNull();
    expect(LIMITE_ETARIO_LEGAL.PENSAO_ALIMENTICIA).toBeNull();
  });

  it("a idade conta anos COMPLETOS, e o aniversário vale NO DIA", () => {
    expect(idadeEm(NASCIMENTO, D(2026, 3, 9))).toBe(13);
    expect(idadeEm(NASCIMENTO, D(2026, 3, 10))).toBe(14);
  });

  /**
   * ⚠️ NINGUÉM RODOU NADA ENTRE AS DUAS ASSERÇÕES. Não há job, não há coluna, não há update.
   * A virada acontece porque a pergunta é feita com outra data.
   */
  it("⚠️ na véspera dos 14 vale; no aniversário, não — e nada foi executado no meio", () => {
    expect(dependenteValeEm(salarioFamilia, D(2026, 3, 9))).toBe(true);
    expect(dependenteValeEm(salarioFamilia, D(2026, 3, 10))).toBe(false);
  });

  it("o motivo diz POR QUE saiu — quem lê precisa saber se há documento a conferir", () => {
    expect(motivoDaInvalidade(salarioFamilia, D(2026, 3, 9))).toBeNull();
    expect(motivoDaInvalidade(salarioFamilia, D(2026, 3, 10))).toMatch(
      /Baixa automática por idade: 14 anos, limite 14/
    );
  });

  it("⚠️ o MESMO dependente continua valendo no IR — limites diferentes por finalidade", () => {
    const ir = { ...salarioFamilia, limiteIdadeAnos: LIMITE_ETARIO_LEGAL.IMPOSTO_RENDA };
    expect(dependenteValeEm(ir, D(2026, 3, 10))).toBe(true);
    expect(dependenteValeEm(ir, D(2033, 3, 10))).toBe(false);
  });

  it("a invalidez permanente SUSPENDE o limite (Lei 8.213/91 art. 16 §-único)", () => {
    const invalido = { ...salarioFamilia, invalidezPermanente: true };
    expect(dependenteValeEm(invalido, D(2060, 1, 1))).toBe(true);
  });

  it("⚠️ mas a invalidez NÃO suspende a baixa por FATO — inválido que morre está baixado", () => {
    const morreu = {
      ...salarioFamilia,
      invalidezPermanente: true,
      dataBaixa: D(2026, 1, 1),
    };
    expect(dependenteValeEm(morreu, D(2026, 1, 2))).toBe(false);
    expect(dependenteValeEm(morreu, D(2025, 12, 31))).toBe(true);
  });

  it("sem limite (plano de saúde): vale sempre, em qualquer idade", () => {
    const plano = { ...salarioFamilia, limiteIdadeAnos: null };
    expect(dependenteValeEm(plano, D(2099, 1, 1))).toBe(true);
  });
});

describe("o contrato de trabalho — término derivado, e o ciclo de lotação", () => {
  it("término vigente = inicial + Σ dias das prorrogações", () => {
    const fim = terminoVigenteDoContrato(D(2026, 6, 30), [{ dias: 90 }, { dias: 30 }]);
    expect(fim?.toISOString().slice(0, 10)).toBe("2026-10-28");
  });

  it("prazo indeterminado não tem término a derivar", () => {
    expect(terminoVigenteDoContrato(null, [{ dias: 90 }])).toBeNull();
  });

  it("o ciclo de lotação é recusado — inclusive o de dois nós, que o CHECK não alcança", () => {
    expect(criaCicloDeLotacao("A", null, [])).toBe(false);
    expect(criaCicloDeLotacao("A", "A", [])).toBe(true);
    // A → B, e B já tem A como ancestral: fecharia A → B → A.
    expect(criaCicloDeLotacao("A", "B", ["A"])).toBe(true);
    expect(criaCicloDeLotacao("A", "B", ["C", "D"])).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AS ESCRITAS — contra o banco
// ═══════════════════════════════════════════════════════════════════════════════

async function cenario(): Promise<{
  readonly cargoProfessor: string;
  readonly cargoDiretor: string;
  readonly lotacao: string;
  readonly servidor: string;
  readonly pessoa: string;
}> {
  const { cargoId: cargoProfessor } = await cadastrarCargo(prisma, {
    codigo: "PROF-I",
    denominacao: "Professor Nivel I",
    tipo: "EFETIVO",
    vagasFixadas: 2,
    leiAutorizativa: "Lei Municipal 1.234/2010",
    dataPublicacaoLei: D(2010, 5, 1),
    criadoPor: POR,
  });
  const { cargoId: cargoDiretor } = await cadastrarCargo(prisma, {
    codigo: "DIR-ESC",
    denominacao: "Diretor de Escola",
    tipo: "COMISSAO",
    vagasFixadas: 1,
    leiAutorizativa: "Lei Municipal 1.234/2010",
    dataPublicacaoLei: D(2010, 5, 1),
    criadoPor: POR,
  });
  const { lotacaoId: lotacao } = await cadastrarLotacao(prisma, {
    codigo: "SEDUC",
    nome: "Secretaria de Educacao",
    criadoPor: POR,
  });
  // ⚠️ CPF FICTÍCIO de teste — 11 dígitos, e o repositório não guarda documento de pessoa real.
  const pessoa = await pessoaFisica("11122233344", "Maria de Teste");
  const { servidorId: servidor } = await cadastrarServidor(prisma, {
    pessoaId: pessoa,
    dataNascimento: D(1985, 7, 20),
    sexo: "FEMININO",
    criadoPor: POR,
  });
  return { cargoProfessor, cargoDiretor, lotacao, servidor, pessoa };
}

const admissao = (
  c: Awaited<ReturnType<typeof cenario>>,
  matricula: string
): Parameters<typeof admitirServidor>[1] => ({
  servidorId: c.servidor,
  matricula,
  tipo: "EFETIVO",
  regimeJuridico: "Estatutario",
  dataAdmissao: D(2026, 1, 1),
  cargoId: c.cargoProfessor,
  lotacaoId: c.lotacao,
  salarioBase: "3000.00",
  criadoPor: POR,
});

describe("(1) sem permissão, TODA escrita estoura — e nada é gravado", () => {
  it("as dezesseis recusam quem não tem o crachá", async () => {
    await prisma.usuario.create({
      data: { identificador: SEM_PODER, nome: "Estagiario sem perfil", criadoPor: "TESTE" },
    });

    await expect(
      cadastrarCargo(prisma, {
        codigo: "X",
        denominacao: "Cargo qualquer",
        tipo: "EFETIVO",
        vagasFixadas: 1,
        leiAutorizativa: "Lei 1/2020",
        dataPublicacaoLei: D(2020, 1, 1),
        criadoPor: SEM_PODER,
      })
    ).rejects.toThrow(/ACESSO NEGADO/);

    await expect(
      cadastrarLotacao(prisma, { codigo: "X", nome: "Lotacao", criadoPor: SEM_PODER })
    ).rejects.toThrow(/ACESSO NEGADO/);

    await expect(
      cadastrarServidor(prisma, {
        pessoaId: await pessoaFisica("11122233344", "Fulano de Teste"),
        dataNascimento: D(1990, 1, 1),
        sexo: "NAO_INFORMADO",
        criadoPor: SEM_PODER,
      })
    ).rejects.toThrow(/ACESSO NEGADO/);

    // Nada gravado — a autorização estoura ANTES de qualquer efeito.
    expect(await prisma.cargo.count()).toBe(0);
    expect(await prisma.lotacao.count()).toBe(0);
    expect(await prisma.servidor.count()).toBe(0);
  });

  /**
   * ⚠️ A SEGREGAÇÃO DO 6.4, EXERCIDA: quem pode CRIAR A VAGA não pode OCUPÁ-LA.
   *
   * Este é o eixo mais importante do módulo. Se as duas ações fossem uma, o quantitativo do TR
   * req. 9 viraria autoatendimento — quem quisesse nomear criaria a vaga e a ocuparia.
   */
  /**
   * ⚠️ A CARGA DO REGIME NO VÍNCULO JÁ DESLIGADO (V6 P2.3b) — a única exceção ao vínculo terminal,
   * e ela existe porque SEM ELA NÃO HAVIA CAMINHO: a matrícula legada desligada no dia 1º de um
   * mês viveu um dia, tem de ser paga por ele, e a folha precisa do regime para saber qual tabela
   * aplicar. Recusar trancava a folha daquele mês para sempre.
   *
   * O que a exceção NÃO afrouxa: cargo, lotação e afastamento continuam recusados, e o regime com
   * data POSTERIOR ao desligamento também — depois do fim não há regime a declarar.
   */
  it("⚠️ regime previdenciário no vínculo DESLIGADO: aceito ATÉ o desligamento, recusado depois — e nenhum outro evento passa", async () => {
    const c = await cenario();
    const { vinculoId } = await admitirServidor(prisma, {
      servidorId: c.servidor, matricula: "DESL-1", tipo: "EFETIVO", regimeJuridico: "Estatutario",
      dataAdmissao: D(2026, 1, 1), cargoId: c.cargoProfessor, lotacaoId: c.lotacao,
      salarioBase: "3000.00", criadoPor: POR,
    });
    await desligarServidor(prisma, { vinculoId, data: D(2026, 9, 1), motivo: "exoneracao a pedido", criadoPor: POR });

    // ATÉ o desligamento: aceito, e o regime passa a valer para as competências em que ele viveu.
    await registrarMovimentacao(prisma, { vinculoId, tipo: "MUDANCA_REGIME_PREVIDENCIARIO", data: D(2026, 9, 1), motivo: "carga do regime do legado", regimePrevidenciario: "RGPS", criadoPor: POR });
    const eventos = await prisma.historicoVinculo.findMany({ where: { vinculoId }, select: { data: true, criadoEm: true, tipo: true, cargoId: true, lotacaoId: true, salarioBase: true, regimePrevidenciario: true } });
    const paraDominio = eventos.map((e) => ({ data: e.data, criadoEm: e.criadoEm, tipo: e.tipo as EventoDoVinculo["tipo"], cargoId: e.cargoId, lotacaoId: e.lotacaoId, salarioBase: e.salarioBase === null ? null : toMoney(e.salarioBase), regimePrevidenciario: e.regimePrevidenciario }));
    expect(regimeVigenteEm(paraDominio, null, D(2026, 9, 1))).toBe("RGPS");

    // DEPOIS do desligamento: recusado — não há regime a declarar para quem já saiu.
    await expect(
      registrarMovimentacao(prisma, { vinculoId, tipo: "MUDANCA_REGIME_PREVIDENCIARIO", data: D(2026, 10, 1), motivo: "tarde demais", regimePrevidenciario: "RPPS", criadoPor: POR })
    ).rejects.toThrow(/desligad/i);

    // ⚠️ E A EXCEÇÃO É SÓ DO REGIME: um AFASTAMENTO no DIA do desligamento continua recusado.
    await expect(
      registrarMovimentacao(prisma, { vinculoId, tipo: "AFASTAMENTO", data: D(2026, 9, 1), motivo: "licenca no dia da saida", criadoPor: POR })
    ).rejects.toThrow(/desligad/i);

    // ⚠️ E O QUE JÁ VALIA CONTINUA VALENDO, e é preciso dizê-lo para não se confundir com a
    // exceção: a guarda olha a situação NA DATA DO FATO, então um evento datado DENTRO da vida do
    // vínculo sempre foi aceito, mesmo registrado depois do desligamento — é a disciplina das
    // duas datas (data do fato ≠ data do registro), não um afrouxamento novo.
    await registrarMovimentacao(prisma, { vinculoId, tipo: "AFASTAMENTO", data: D(2026, 8, 1), motivo: "licenca de agosto, lancada agora", criadoPor: POR });
    expect((await prisma.historicoVinculo.findMany({ where: { vinculoId }, select: { tipo: true } })).map((e) => e.tipo).sort()).toEqual(["ADMISSAO", "AFASTAMENTO", "DESLIGAMENTO", "MUDANCA_REGIME_PREVIDENCIARIO"]);
  });

  it("⚠️ mudança de regime SEM regime de destino é recusada; afastamento que levasse regime também (V6 P2.3)", async () => {
    const c = await cenario();
    const { vinculoId } = await admitirServidor(prisma, {
      servidorId: c.servidor, matricula: "REG-1", tipo: "EFETIVO", regimeJuridico: "Estatutario",
      regimePrevidenciario: "RGPS", dataAdmissao: D(2026, 1, 1), cargoId: c.cargoProfessor, lotacaoId: c.lotacao,
      salarioBase: "3000.00", criadoPor: POR,
    });
    await expect(
      registrarMovimentacao(prisma, { vinculoId, tipo: "MUDANCA_REGIME_PREVIDENCIARIO", data: D(2026, 6, 1), motivo: "migracao ao RPPS", criadoPor: POR })
    ).rejects.toThrow(/regime de destino/);
    await expect(
      registrarMovimentacao(prisma, { vinculoId, tipo: "AFASTAMENTO", data: D(2026, 6, 1), motivo: "licenca", regimePrevidenciario: "RPPS", criadoPor: POR })
    ).rejects.toThrow(/Só a mudança de regime previdenciário informa regime/);
    // Nada gravado: o vínculo continua com o regime da admissão.
    const eventos = await prisma.historicoVinculo.findMany({ where: { vinculoId }, select: { tipo: true, regimePrevidenciario: true } });
    expect(eventos.map((e) => `${e.tipo}:${e.regimePrevidenciario ?? "-"}`)).toEqual(["ADMISSAO:RGPS"]);

    // E a mudança COM regime grava o evento datado.
    await registrarMovimentacao(prisma, { vinculoId, tipo: "MUDANCA_REGIME_PREVIDENCIARIO", data: D(2026, 6, 1), motivo: "migracao ao RPPS", regimePrevidenciario: "RPPS", criadoPor: POR });
    const depois = await prisma.historicoVinculo.findMany({ where: { vinculoId }, orderBy: { data: "asc" }, select: { tipo: true, regimePrevidenciario: true } });
    expect(depois.map((e) => `${e.tipo}:${e.regimePrevidenciario ?? "-"}`)).toEqual(["ADMISSAO:RGPS", "MUDANCA_REGIME_PREVIDENCIARIO:RPPS"]);
  });

  it("⚠️ quem só tem CADASTRAR_CARGO não ADMITE — o limite legal não é autoatendimento", async () => {
    const perfil = await prisma.perfil.create({
      data: {
        nome: "SO_ESTRUTURA",
        descricao: "So cadastra cargo",
        criadoPor: "TESTE",
        permissoes: { create: [{ acao: "CADASTRAR_CARGO", criadoPor: "TESTE" }] },
      },
      select: { id: true },
    });
    const usuario = await prisma.usuario.create({
      data: { identificador: "so.estrutura@cg.pb.gov.br", nome: "Estrutura", criadoPor: "TESTE" },
      select: { id: true },
    });
    await prisma.vinculoUsuarioPerfil.create({
      data: { usuarioId: usuario.id, perfilId: perfil.id, criadoPor: "TESTE" },
    });

    const c = await cenario();

    // Pode criar o cargo…
    await expect(
      cadastrarCargo(prisma, {
        codigo: "NOVO",
        denominacao: "Cargo novo",
        tipo: "EFETIVO",
        vagasFixadas: 10,
        leiAutorizativa: "Lei 9/2026",
        dataPublicacaoLei: D(2026, 1, 1),
        criadoPor: "so.estrutura@cg.pb.gov.br",
      })
    ).resolves.toBeDefined();

    // …e NÃO pode ocupá-lo.
    await expect(
      admitirServidor(prisma, {
        ...admissao(c, "M-001"),
        criadoPor: "so.estrutura@cg.pb.gov.br",
      })
    ).rejects.toThrow(/ACESSO NEGADO/);
  });
});

describe("(7) a identidade é a PESSOA canônica (V6 P2.1) — o servidor não repete CPF", () => {
  it("o servidor aponta para a pessoa; o CPF mora só no cadastro único, já normalizado", async () => {
    const c = await cenario();
    const s = await prisma.servidor.findFirstOrThrow({ select: { pessoaId: true, pessoa: { select: { documento: true } } } });
    expect(s.pessoaId).toBe(c.pessoa);
    expect(s.pessoa.documento).toBe("11122233344");
  });

  it("pessoa JURÍDICA é recusada — servidor é pessoa física", async () => {
    const pj = await prisma.pessoa.create({
      data: { documento: "11222333000181", tipo: "JURIDICA", criadoPor: POR, versoes: { create: { nome: "Empresa de Teste", criadoPor: POR } } },
      select: { id: true },
    });
    await expect(
      cadastrarServidor(prisma, { pessoaId: pj.id, dataNascimento: D(1990, 1, 1), sexo: "NAO_INFORMADO", criadoPor: POR })
    ).rejects.toThrow(/PESSOA-JURIDICA/);
  });

  it("a mesma pessoa não vira dois SERVIDORES — a segunda matrícula é um vínculo, não uma ficha", async () => {
    const c = await cenario();
    await expect(
      cadastrarServidor(prisma, { pessoaId: c.pessoa, dataNascimento: D(1990, 1, 1), sexo: "NAO_INFORMADO", criadoPor: POR })
    ).rejects.toThrow(/PESSOA-JA-E-SERVIDOR/);
    await expect(
      cadastrarServidor(prisma, { pessoaId: "nao-existe", dataNascimento: D(1990, 1, 1), sexo: "NAO_INFORMADO", criadoPor: POR })
    ).rejects.toThrow(/não existe no cadastro único/);
  });
});

describe("(3) e (4) uma pessoa, N vínculos — TR req. 4", () => {
  it("⚠️ dois vínculos do MESMO servidor, matrículas distintas, ambos aparecem", async () => {
    const c = await cenario();
    await admitirServidor(prisma, admissao(c, "MAT-001"));
    await admitirServidor(prisma, {
      ...admissao(c, "MAT-002"),
      cargoId: c.cargoDiretor,
      tipo: "COMISSIONADO",
    });

    const vinculos = await prisma.vinculo.findMany({
      where: { servidorId: c.servidor },
      select: { matricula: true, tipo: true },
      orderBy: { matricula: "asc" },
    });
    expect(vinculos.map((v) => v.matricula)).toEqual(["MAT-001", "MAT-002"]);
    expect(new Set(vinculos.map((v) => v.matricula)).size).toBe(2);
    expect(await prisma.servidor.count()).toBe(1);
  });

  /**
   * ⚠️ ALERTA, NÃO ERRO — e a diferença é o que se está criando.
   *
   * A acumulação é legítima (CF art. 37, XVI: dois cargos de professor, dois de saúde, cargo
   * efetivo + função). Recusar obrigaria o RH a cadastrar a mesma pessoa com CPFs falsos, e a
   * DIRF do ente declararia dois rendimentos a duas pessoas que são a mesma.
   */
  it("⚠️ a segunda matrícula VOLTA a lista das anteriores — a acumulação fica visível", async () => {
    const c = await cenario();
    const primeira = await admitirServidor(prisma, admissao(c, "MAT-001"));
    // A primeira não tem com o que alertar.
    expect(primeira.alertaAcumulacao).toEqual([]);

    const segunda = await admitirServidor(prisma, {
      ...admissao(c, "MAT-002"),
      cargoId: c.cargoDiretor,
    });
    expect(segunda.vinculoId).toBeTruthy();
    expect(segunda.alertaAcumulacao).toEqual([{ matricula: "MAT-001", tipo: "EFETIVO" }]);
  });

  it("⚠️ mas a MATRÍCULA repetida é erro nomeado — ela é única no ente inteiro", async () => {
    const c = await cenario();
    await admitirServidor(prisma, admissao(c, "MAT-001"));

    const { servidorId: outro } = await cadastrarServidor(prisma, {
      pessoaId: await pessoaFisica("99988877766", "Joao de Teste"),
      dataNascimento: D(1980, 2, 2),
      sexo: "MASCULINO",
      criadoPor: POR,
    });

    await expect(
      admitirServidor(prisma, { ...admissao(c, "MAT-001"), servidorId: outro })
    ).rejects.toThrow(/MATRICULA-JA-USADA.*Maria de Teste/s);
  });

  it("a admissão nasce COM o evento ADMISSAO — cargo, lotação e salário juntos", async () => {
    const c = await cenario();
    const { vinculoId } = await admitirServidor(prisma, admissao(c, "MAT-001"));

    const eventos = await prisma.historicoVinculo.findMany({
      where: { vinculoId },
      select: { tipo: true, cargoId: true, lotacaoId: true, salarioBase: true },
    });
    expect(eventos).toHaveLength(1);
    expect(eventos[0]!.tipo).toBe("ADMISSAO");
    expect(eventos[0]!.cargoId).toBe(c.cargoProfessor);
    expect(eventos[0]!.lotacaoId).toBe(c.lotacao);
    expect(eventos[0]!.salarioBase?.toFixed(2)).toBe("3000.00");
  });
});

describe("a vida funcional, contra o banco", () => {
  it("⚠️ promoção em junho: o cargo de maio continua sendo o de janeiro", async () => {
    const c = await cenario();
    const { vinculoId } = await admitirServidor(prisma, admissao(c, "MAT-001"));

    await registrarAlteracaoRemuneratoria(prisma, {
      vinculoId,
      tipo: "PROMOCAO",
      data: D(2026, 6, 1),
      cargoId: c.cargoDiretor,
      salarioBase: "5000.00",
      motivo: "Progressao por antiguidade, portaria 45/2026",
      criadoPor: POR,
    });

    const linhas = await prisma.historicoVinculo.findMany({
      where: { vinculoId },
      select: { data: true, criadoEm: true, tipo: true, cargoId: true, lotacaoId: true, salarioBase: true },
    });
    const eventos: readonly EventoDoVinculo[] = linhas.map((e) => ({
      data: e.data,
      criadoEm: e.criadoEm,
      tipo: e.tipo,
      cargoId: e.cargoId,
      lotacaoId: e.lotacaoId,
      salarioBase: e.salarioBase === null ? null : toMoney(e.salarioBase.toFixed(2)),
    }));

    expect(cargoVigenteEm(eventos, D(2026, 5, 31))).toBe(c.cargoProfessor);
    expect(cargoVigenteEm(eventos, D(2026, 6, 1))).toBe(c.cargoDiretor);
    // ⚠️ E O REGISTRO ANTIGO CONTINUA LÁ, intocado: append-only.
    expect(linhas).toHaveLength(2);
  });

  it("o vínculo DESLIGADO não recebe evento posterior — mas recebe retroativo", async () => {
    const c = await cenario();
    const { vinculoId } = await admitirServidor(prisma, admissao(c, "MAT-001"));

    await desligarServidor(prisma, {
      vinculoId,
      data: D(2026, 6, 30),
      motivo: "Exoneracao a pedido",
      criadoPor: POR,
    });

    await expect(
      registrarMovimentacao(prisma, {
        vinculoId,
        tipo: "MUDANCA_LOTACAO",
        data: D(2026, 7, 1),
        lotacaoId: c.lotacao,
        motivo: "Remocao posterior ao desligamento",
        criadoPor: POR,
      })
    ).rejects.toThrow(/VINCULO-DESLIGADO/);

    // ⚠️ RETROATIVO PASSA: a portaria saiu depois, o fato é de antes.
    await expect(
      registrarMovimentacao(prisma, {
        vinculoId,
        tipo: "MUDANCA_LOTACAO",
        data: D(2026, 3, 1),
        lotacaoId: c.lotacao,
        motivo: "Remocao de marco, portaria lavrada em julho",
        criadoPor: POR,
      })
    ).resolves.toBeDefined();
  });

  it("desligar duas vezes é recusado nomeando", async () => {
    const c = await cenario();
    const { vinculoId } = await admitirServidor(prisma, admissao(c, "MAT-001"));
    await desligarServidor(prisma, {
      vinculoId,
      data: D(2026, 6, 30),
      motivo: "Exoneracao a pedido",
      criadoPor: POR,
    });
    await expect(
      desligarServidor(prisma, {
        vinculoId,
        data: D(2026, 7, 30),
        motivo: "Segunda exoneracao",
        criadoPor: POR,
      })
    ).rejects.toThrow(/VINCULO-DESLIGADO/);
  });

  it("evento anterior à admissão é recusado", async () => {
    const c = await cenario();
    const { vinculoId } = await admitirServidor(prisma, admissao(c, "MAT-001"));
    await expect(
      registrarMovimentacao(prisma, {
        vinculoId,
        tipo: "AFASTAMENTO",
        data: D(2025, 12, 1),
        motivo: "Licenca antes de existir",
        criadoPor: POR,
      })
    ).rejects.toThrow(/EVENTO-ANTES-DA-ADMISSAO/);
  });

  it("⚠️ afastamento não pode carregar cargo nem lotação — licença não remove ninguém", async () => {
    const c = await cenario();
    const { vinculoId } = await admitirServidor(prisma, admissao(c, "MAT-001"));
    await expect(
      registrarMovimentacao(prisma, {
        vinculoId,
        tipo: "AFASTAMENTO",
        data: D(2026, 3, 1),
        lotacaoId: c.lotacao,
        motivo: "Licenca maternidade",
        criadoPor: POR,
      })
    ).rejects.toThrow(/não mudam cargo nem lotação/);
  });

  it("⚠️ gratificação não redefine o vencimento-base — o reajuste incidiria sobre ela", async () => {
    const c = await cenario();
    const { vinculoId } = await admitirServidor(prisma, admissao(c, "MAT-001"));
    await expect(
      registrarAlteracaoRemuneratoria(prisma, {
        vinculoId,
        tipo: "GRATIFICACAO",
        data: D(2026, 3, 1),
        gratificacaoDescricao: "Insalubridade grau medio",
        gratificacaoValor: "300.00",
        salarioBase: "3300.00",
        motivo: "Adicional de insalubridade",
        criadoPor: POR,
      })
    ).rejects.toThrow(/parcela ADICIONAL/);
  });

  it("a gratificação legítima entra e NÃO move o salário-base derivado", async () => {
    const c = await cenario();
    const { vinculoId } = await admitirServidor(prisma, admissao(c, "MAT-001"));
    await registrarAlteracaoRemuneratoria(prisma, {
      vinculoId,
      tipo: "GRATIFICACAO",
      data: D(2026, 3, 1),
      gratificacaoDescricao: "Insalubridade grau medio",
      gratificacaoValor: "300.00",
      motivo: "Adicional de insalubridade, laudo 12/2026",
      criadoPor: POR,
    });

    const linhas = await prisma.historicoVinculo.findMany({
      where: { vinculoId },
      select: { data: true, criadoEm: true, tipo: true, cargoId: true, lotacaoId: true, salarioBase: true },
    });
    const eventos: readonly EventoDoVinculo[] = linhas.map((e) => ({
      data: e.data,
      criadoEm: e.criadoEm,
      tipo: e.tipo,
      cargoId: e.cargoId,
      lotacaoId: e.lotacaoId,
      salarioBase: e.salarioBase === null ? null : toMoney(e.salarioBase.toFixed(2)),
    }));
    expect(salarioBaseVigenteEm(eventos, D(2026, 4, 1))?.toFixed(2)).toBe("3000.00");
  });

  it("cargo EXTINTO antes da data não recebe nomeação", async () => {
    const c = await cenario();
    const { cargoId: extinto } = await cadastrarCargo(prisma, {
      codigo: "EXT",
      denominacao: "Cargo extinto",
      tipo: "EFETIVO",
      vagasFixadas: 1,
      leiAutorizativa: "Lei 1/2010",
      dataPublicacaoLei: D(2010, 1, 1),
      dataExtincao: D(2020, 1, 1),
      leiExtincao: "Lei 50/2020",
      criadoPor: POR,
    });
    await expect(
      admitirServidor(prisma, { ...admissao(c, "MAT-009"), cargoId: extinto })
    ).rejects.toThrow(/CARGO-EXTINTO/);
  });

  it("⚠️ mas o ato RETROATIVO ao tempo em que o cargo existia é aceito", async () => {
    const c = await cenario();
    const { cargoId: extinto } = await cadastrarCargo(prisma, {
      codigo: "EXT",
      denominacao: "Cargo extinto",
      tipo: "EFETIVO",
      vagasFixadas: 1,
      leiAutorizativa: "Lei 1/2010",
      dataPublicacaoLei: D(2010, 1, 1),
      dataExtincao: D(2020, 1, 1),
      leiExtincao: "Lei 50/2020",
      criadoPor: POR,
    });
    await expect(
      admitirServidor(prisma, {
        ...admissao(c, "MAT-010"),
        cargoId: extinto,
        dataAdmissao: D(2015, 3, 1),
      })
    ).resolves.toBeDefined();
  });

  it("cargo só se extingue por LEI — data sem lei é recusada", async () => {
    await expect(
      cadastrarCargo(prisma, {
        codigo: "MEIO",
        denominacao: "Extincao pela metade",
        tipo: "EFETIVO",
        vagasFixadas: 1,
        leiAutorizativa: "Lei 1/2010",
        dataPublicacaoLei: D(2010, 1, 1),
        dataExtincao: D(2020, 1, 1),
        criadoPor: POR,
      })
    ).rejects.toThrow(/EXTINÇÃO INCOMPLETA/);
  });
});

describe("dependentes, contra o banco", () => {
  it("o limite vem do Record do domínio quando a entrada o omite", async () => {
    const c = await cenario();
    await cadastrarDependente(prisma, {
      servidorId: c.servidor,
      nome: "Filho de Teste",
      dataNascimento: D(2020, 1, 1),
      grauParentesco: "FILHO",
      finalidade: "SALARIO_FAMILIA",
      dataInicio: D(2020, 1, 1),
      criadoPor: POR,
    });
    const f = await prisma.finalidadeDependente.findFirstOrThrow({
      select: { limiteIdadeAnos: true, finalidade: true },
    });
    expect(f.finalidade).toBe("SALARIO_FAMILIA");
    expect(f.limiteIdadeAnos).toBe(14);
  });

  it("o limite declarado ganha do legal (universitário até 24 no IR)", async () => {
    const c = await cenario();
    await cadastrarDependente(prisma, {
      servidorId: c.servidor,
      nome: "Filha Universitaria",
      dataNascimento: D(2004, 1, 1),
      grauParentesco: "FILHO",
      finalidade: "IMPOSTO_RENDA",
      dataInicio: D(2022, 1, 1),
      limiteIdadeAnos: 24,
      criadoPor: POR,
    });
    const f = await prisma.finalidadeDependente.findFirstOrThrow({
      select: { limiteIdadeAnos: true },
    });
    expect(f.limiteIdadeAnos).toBe(24);
  });

  it("baixar por FATO grava data e motivo; baixar de novo é recusado nomeando", async () => {
    const c = await cenario();
    const { finalidadeId } = await cadastrarDependente(prisma, {
      servidorId: c.servidor,
      nome: "Filho de Teste",
      dataNascimento: D(2020, 1, 1),
      grauParentesco: "FILHO",
      finalidade: "PLANO_SAUDE",
      dataInicio: D(2020, 1, 1),
      criadoPor: POR,
    });

    await baixarFinalidadeDependente(prisma, {
      finalidadeId,
      dataBaixa: D(2026, 5, 1),
      motivoBaixa: "Saida do plano a pedido do titular",
      criadoPor: POR,
    });

    const f = await prisma.finalidadeDependente.findUniqueOrThrow({
      where: { id: finalidadeId },
      select: { dataBaixa: true, motivoBaixa: true },
    });
    expect(f.dataBaixa?.toISOString().slice(0, 10)).toBe("2026-05-01");
    expect(f.motivoBaixa).toMatch(/Saida do plano/);

    await expect(
      baixarFinalidadeDependente(prisma, {
        finalidadeId,
        dataBaixa: D(2026, 6, 1),
        motivoBaixa: "Segunda baixa",
        criadoPor: POR,
      })
    ).rejects.toThrow(/FINALIDADE-JA-BAIXADA/);
  });
});

describe("os atos e os registros auxiliares", () => {
  it("portaria: o ano tem de bater com a data — a numeração é por exercício", async () => {
    const c = await cenario();
    const { vinculoId } = await admitirServidor(prisma, admissao(c, "MAT-001"));
    await expect(
      registrarPortaria(prisma, {
        vinculoId,
        numero: "045",
        ano: 2025,
        tipo: "NOMEACAO",
        data: D(2026, 1, 5),
        ementa: "Nomeia a servidora para o cargo de Professor Nivel I",
        criadoPor: POR,
      })
    ).rejects.toThrow(/não bate com o da data/);
  });

  it("a portaria legítima entra e pode fundamentar um evento", async () => {
    const c = await cenario();
    const { vinculoId } = await admitirServidor(prisma, admissao(c, "MAT-001"));
    const { portariaId } = await registrarPortaria(prisma, {
      vinculoId,
      numero: "045",
      ano: 2026,
      tipo: "PROMOCAO",
      data: D(2026, 6, 1),
      dataPublicacao: D(2026, 6, 3),
      veiculoPublicacao: "Diario Oficial do Municipio",
      ementa: "Promove a servidora ao cargo de Diretor de Escola",
      criadoPor: POR,
    });

    const { eventoId } = await registrarAlteracaoRemuneratoria(prisma, {
      vinculoId,
      tipo: "PROMOCAO",
      data: D(2026, 6, 1),
      cargoId: c.cargoDiretor,
      salarioBase: "5000.00",
      portariaId,
      motivo: "Promocao pela portaria 045/2026",
      criadoPor: POR,
    });
    const e = await prisma.historicoVinculo.findUniqueOrThrow({
      where: { id: eventoId },
      select: { portariaId: true },
    });
    expect(e.portariaId).toBe(portariaId);
  });

  /**
   * TR req. 23, segunda metade — a ANOTAÇÃO na ficha.
   *
   * ⚠️ O GUARD QUE IMPORTA É O DO VÍNCULO DE OUTRO SERVIDOR, e ele NÃO tem CHECK equivalente no
   * banco (exigiria subconsulta). Sem ele, uma advertência entraria na ficha de uma pessoa
   * apontando para a matrícula de outra — e a ficha de dois servidores ficaria misturada
   * exatamente no registro que tem consequência disciplinar.
   */
  it("⚠️ a anotação recusa vínculo que é de OUTRO servidor", async () => {
    const c = await cenario();
    const { vinculoId } = await admitirServidor(prisma, admissao(c, "MAT-001"));

    const { servidorId: outro } = await cadastrarServidor(prisma, {
      pessoaId: await pessoaFisica("55566677788", "Pedro de Teste"),
      dataNascimento: D(1990, 6, 6),
      sexo: "MASCULINO",
      criadoPor: POR,
    });

    await expect(
      registrarAnotacaoServidor(prisma, {
        servidorId: outro,
        vinculoId,
        data: D(2026, 4, 10),
        tipo: "ADVERTENCIA",
        titulo: "Advertencia na ficha errada",
        texto: "Esta anotacao aponta para a matricula de outra pessoa.",
        criadoPor: POR,
      })
    ).rejects.toThrow(/VINCULO-DE-OUTRO-SERVIDOR/);

    expect(await prisma.anotacaoServidor.count()).toBe(0);
  });

  it("a anotação entra, com e sem vínculo — e o texto vazio é recusado", async () => {
    const c = await cenario();
    const { vinculoId } = await admitirServidor(prisma, admissao(c, "MAT-001"));

    // Da PESSOA: vale para todas as matrículas.
    await registrarAnotacaoServidor(prisma, {
      servidorId: c.servidor,
      data: D(2026, 3, 15),
      tipo: "ELOGIO",
      titulo: "Elogio da comunidade escolar",
      texto: "Reconhecimento formal pelo projeto de reforco em leitura.",
      criadoPor: POR,
    });
    // De UMA matrícula.
    await registrarAnotacaoServidor(prisma, {
      servidorId: c.servidor,
      vinculoId,
      data: D(2026, 4, 2),
      tipo: "OCORRENCIA",
      titulo: "Sindicancia instaurada",
      texto: "Portaria de sindicancia sobre frequencia no turno da tarde.",
      criadoPor: POR,
    });

    const linhas = await prisma.anotacaoServidor.findMany({
      where: { servidorId: c.servidor },
      select: { tipo: true, vinculoId: true },
      orderBy: { data: "asc" },
    });
    expect(linhas).toHaveLength(2);
    expect(linhas[0]!.vinculoId).toBeNull();
    expect(linhas[1]!.vinculoId).toBe(vinculoId);

    // ⚠️ Anotação em branco ocupa uma linha do histórico e não diz o quê — recusada nos dois
    // lados: o Zod dá a mensagem, o CHECK fecha o INSERT direto.
    await expect(
      registrarAnotacaoServidor(prisma, {
        servidorId: c.servidor,
        data: D(2026, 5, 1),
        tipo: "OBSERVACAO",
        titulo: "ok",
        texto: "curto",
        criadoPor: POR,
      })
    ).rejects.toThrow();
  });

  it("contrato por prazo DETERMINADO exige término; INDETERMINADO não prorroga", async () => {
    const c = await cenario();
    const { vinculoId } = await admitirServidor(prisma, {
      ...admissao(c, "MAT-TEMP"),
      tipo: "TEMPORARIO",
    });

    await expect(
      cadastrarContratoTrabalho(prisma, {
        vinculoId,
        numero: "CT-001/2026",
        prazo: "DETERMINADO",
        dataInicio: D(2026, 1, 1),
        objetoContratacao: "Contratacao temporaria para o programa de alfabetizacao",
        criadoPor: POR,
      })
    ).rejects.toThrow(/vence nunca/);

    const { contratoId } = await cadastrarContratoTrabalho(prisma, {
      vinculoId,
      numero: "CT-002/2026",
      prazo: "INDETERMINADO",
      dataInicio: D(2026, 1, 1),
      objetoContratacao: "Emprego publico por prazo indeterminado",
      criadoPor: POR,
    });

    await expect(
      prorrogarContratoTrabalho(prisma, {
        contratoId,
        numeroTermo: "1",
        data: D(2026, 6, 1),
        dias: 90,
        motivo: "Prorrogacao do indeterminado",
        criadoPor: POR,
      })
    ).rejects.toThrow(/CONTRATO-INDETERMINADO/);
  });

  it("a prorrogação move o término derivado — o inicial continua onde estava", async () => {
    const c = await cenario();
    const { vinculoId } = await admitirServidor(prisma, {
      ...admissao(c, "MAT-TEMP"),
      tipo: "TEMPORARIO",
    });
    const { contratoId } = await cadastrarContratoTrabalho(prisma, {
      vinculoId,
      numero: "CT-003/2026",
      prazo: "DETERMINADO",
      dataInicio: D(2026, 1, 1),
      dataTerminoInicial: D(2026, 6, 30),
      objetoContratacao: "Contratacao temporaria para o programa de alfabetizacao",
      criadoPor: POR,
    });
    await prorrogarContratoTrabalho(prisma, {
      contratoId,
      numeroTermo: "1",
      data: D(2026, 6, 20),
      dias: 90,
      motivo: "Prorrogacao autorizada pela Lei 12/2026",
      criadoPor: POR,
    });

    const ct = await prisma.contratoTrabalho.findUniqueOrThrow({
      where: { id: contratoId },
      select: { dataTerminoInicial: true, prorrogacoes: { select: { dias: true } } },
    });
    expect(ct.dataTerminoInicial?.toISOString().slice(0, 10)).toBe("2026-06-30");
    expect(
      terminoVigenteDoContrato(ct.dataTerminoInicial, ct.prorrogacoes)?.toISOString().slice(0, 10)
    ).toBe("2026-09-28");
  });

  it("o calendário exige horas SÓ no expediente reduzido — e as exige nele", async () => {
    await expect(
      cadastrarDiaCalendarioRh(prisma, {
        data: D(2026, 9, 7),
        tipo: "FERIADO_NACIONAL",
        descricao: "Independencia",
        horasExpediente: "4",
        criadoPor: POR,
      })
    ).rejects.toThrow(/não tem horas a informar/);

    await expect(
      cadastrarDiaCalendarioRh(prisma, {
        data: D(2026, 12, 24),
        tipo: "EXPEDIENTE_REDUZIDO",
        descricao: "Vespera de Natal",
        criadoPor: POR,
      })
    ).rejects.toThrow(/exige quantas horas/);

    await expect(
      cadastrarDiaCalendarioRh(prisma, {
        data: D(2026, 12, 24),
        tipo: "EXPEDIENTE_REDUZIDO",
        descricao: "Vespera de Natal",
        horasExpediente: "4",
        criadoPor: POR,
      })
    ).resolves.toBeDefined();
  });

  it("treinamento e avaliação entram pendurados em quem devem", async () => {
    const c = await cenario();
    const { vinculoId } = await admitirServidor(prisma, admissao(c, "MAT-001"));

    // ⚠️ TREINAMENTO É DO SERVIDOR (a pós-graduação conta nas duas matrículas);
    // AVALIAÇÃO É DO VÍNCULO (o estágio probatório é de um cargo).
    await registrarTreinamento(prisma, {
      servidorId: c.servidor,
      descricao: "Pos-graduacao em gestao publica",
      instituicao: "UEPB",
      cargaHoraria: 360,
      dataInicio: D(2026, 2, 1),
      criadoPor: POR,
    });
    await registrarAvaliacaoExperiencia(prisma, {
      vinculoId,
      etapa: 1,
      periodoInicio: D(2026, 1, 1),
      periodoFim: D(2026, 12, 31),
      resultado: "EM_ANDAMENTO",
      criadoPor: POR,
    });

    expect(await prisma.treinamento.count({ where: { servidorId: c.servidor } })).toBe(1);
    expect(await prisma.avaliacaoExperiencia.count({ where: { vinculoId } })).toBe(1);

    // A mesma etapa duas vezes é o mesmo período julgado duas vezes, com resultados que podem
    // discordar — o `@@unique([vinculoId, etapa])` recusa.
    await expect(
      registrarAvaliacaoExperiencia(prisma, {
        vinculoId,
        etapa: 1,
        periodoInicio: D(2026, 1, 1),
        periodoFim: D(2026, 12, 31),
        resultado: "APROVADO",
        criadoPor: POR,
      })
    ).rejects.toThrow();
  });
});
