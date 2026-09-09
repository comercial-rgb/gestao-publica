import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { PERFIL_ADMIN } from "../../test/usuarios-teste.js";
import { TODAS_AS_ACOES } from "./acoes.js";
import { criarM02Deps } from "../m02-planejamento/adapter-prisma.js";
import { criarFicha } from "../m02-planejamento/servico.js";
import { criarM03Deps } from "../m03-creditos/adapter-prisma.js";
import { criarDecreto, criarLei, executarCredito } from "../m03-creditos/servico.js";
import { roteiroArrecadacao } from "../m04-receita/dominio.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";
import {
  roteiroEmpenho,
  roteiroLiquidacao,
  roteiroPagamento,
  type RoteiroContabil,
} from "../m05-despesa/dominio.js";
import { empenhar, saldosDaFicha } from "../m05-despesa/servico.js";
import { anularLiquidacao, liquidar, pagar } from "../m05-despesa/servico-bloco2.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import { abrirExercicio } from "../m08-restos-a-pagar/exercicio.js";
import { encerrarExercicioComRestos } from "../m08-restos-a-pagar/encerramento.js";
import { liquidarRestosAPagar } from "../m08-restos-a-pagar/restos.js";
import {
  cadastrarClasseDeMaterial,
  registrarEntradaAlmoxarifado,
} from "../m10-patrimonial/almoxarifado.js";
import { criarM05DepsComAlmoxarifado } from "../m10-patrimonial/adapter-m05-almox.js";
import { arrecadarRecebimentoDividaAtiva } from "../m10-patrimonial/adapter-m04.js";
import {
  cadastrarDividaAtiva,
  inscreverDividaAtiva,
} from "../m10-patrimonial/divida-ativa.js";
import { criarM04DepsComDividas } from "../m10-patrimonial/adapter-m04.js";
import { cadastrarContrato, cadastrarProcesso } from "../m11-licitacoes/contratos.js";
import type { AcaoDoSistema } from "./acoes.js";

/**
 * M16 BLOCO 3 — O ROLLOUT DA AUTORIZAÇÃO NOS 76 SERVIÇOS. TR 4.56 · 6.4 · 6.5.
 *
 * ═══ O QUE ESTE ARQUIVO PROVA, E POR QUE CADA PEÇA IMPORTA ═══
 * O bloco 2 provou o MECANISMO (as quatro portas do `autorizar`) sobre UM serviço — o
 * travamento, o piloto. Provar o mecanismo não prova o SISTEMA: 76 serviços continuavam
 * gravando sem perguntar nada a ninguém, e uma fechadura instalada numa porta só não fecha a
 * casa.
 *
 * Aqui a autorização é exercida de PONTA A PONTA, com FATOS COMPLETOS (ficha → empenho →
 * liquidação → pagamento, em DUAS unidades gestoras de verdade), e é isso que dá sentido à
 * segregação do 6.5: a UG do teste é a UG REAL do fato, derivada pelo mesmo caminho de FKs que
 * o `escopo.ts` percorre em produção — nunca um id inventado no teste.
 *
 * ⚠️ E TODA NEGAÇÃO É CONFERIDA PELA **CAUSA**, não pelo "acesso negado". São três, e elas
 * pedem providências DIFERENTES:
 *   · SEM PERFIL   -> ele não tem crachá nenhum;
 *   · A AÇÃO       -> o crachá dele não concede isto em lugar nenhum;
 *   · O ESCOPO     -> ele PODE isto — só não AQUI (é o 6.5, e é o que mais se erra).
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

// ─── as duas unidades gestoras. É a segregação 6.5 que elas existem para provar. ───
const UO_SAUDE = "uo-saude";
const UO_EDUC = "uo-educ";
const FICHA_SAUDE = "ficha-saude";
const FICHA_EDUC = "ficha-educ";

const ADMIN = "despesa@cg.pb.gov.br"; // identidade de fixture -> ADMIN (global, todas as ações)
const FONTE = "fnt-500";

const CONTAS = [
  { id: "c-disp", codigo: "6.2.2.1.1.00.00", nome: "Crédito Disponível", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-emp", codigo: "6.2.2.1.3.01.00", nome: "Crédito Empenhado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-liq", codigo: "6.2.2.1.3.03.00", nome: "Crédito Liquidado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-pago", codigo: "6.2.2.1.3.04.00", nome: "Crédito Pago", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-estoque", codigo: "1.1.5.6.1.00.00", nome: "Estoque", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-forn", codigo: "2.1.3.1.1.00.00", nome: "Fornecedores", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-banco", codigo: "1.1.1.1.2.00.00", nome: "Bancos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-da", codigo: "1.2.1.1.1.00.00", nome: "Dívida Ativa", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpa-da", codigo: "4.4.1.1.1.00.00", nome: "VPA Dívida Ativa", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-rar", codigo: "5.2.1.1.1.00.00", nome: "Receita a Realizar", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-rr", codigo: "6.2.1.1.1.00.00", nome: "Receita Realizada", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
];

const R_EMPENHO = roteiroEmpenho({
  creditoDisponivel: "6.2.2.1.1.00.00",
  creditoEmpenhado: "6.2.2.1.3.01.00",
});
/** A perna de débito vai ao ESTOQUE — é o que habilita a entrada no almoxarifado (TR 5.85). */
const R_LIQUIDACAO: RoteiroContabil = roteiroLiquidacao({
  variacaoDiminutiva: "1.1.5.6.1.00.00",
  obrigacaoAPagar: "2.1.3.1.1.00.00",
  creditoEmpenhado: "6.2.2.1.3.01.00",
  creditoLiquidado: "6.2.2.1.3.03.00",
});
const R_PAGAMENTO = roteiroPagamento({
  obrigacaoAPagar: "2.1.3.1.1.00.00",
  disponibilidade: "1.1.1.1.2.00.00",
  creditoLiquidado: "6.2.2.1.3.03.00",
  creditoPago: "6.2.2.1.3.04.00",
});
const R_ARRECADACAO_DA = roteiroArrecadacao({
  disponibilidade: "1.1.1.1.2.00.00",
  variacaoAumentativa: "1.2.1.1.1.00.00", // conta RESERVADA pelo M10 (dívida ativa)
  receitaARealizar: "5.2.1.1.1.00.00",
  receitaRealizada: "6.2.1.1.1.00.00",
});

let deps: M05Deps;

/** Cria um usuário COM PERFIL PRÓPRIO — o oposto do onipotente das fixtures. */
async function criarUsuarioCom(
  identificador: string,
  perfil: string,
  permissoes: readonly { readonly acao: AcaoDoSistema; readonly ug?: string }[]
): Promise<void> {
  const p = await prisma.perfil.create({
    data: {
      nome: perfil,
      descricao: `perfil de teste: ${perfil}`,
      criadoPor: "TESTE",
      permissoes: {
        create: permissoes.map((x) => ({
          acao: x.acao,
          ...(x.ug !== undefined ? { unidadeOrcId: x.ug } : {}),
          criadoPor: "TESTE",
        })),
      },
    },
    select: { id: true },
  });
  const u = await prisma.usuario.create({
    data: { identificador, nome: identificador, criadoPor: "TESTE" },
    select: { id: true },
  });
  await prisma.vinculoUsuarioPerfil.create({
    data: { usuarioId: u.id, perfilId: p.id, criadoPor: "TESTE" },
  });
}

/** Um usuário que EXISTE e não pode NADA (nem perfil tem). */
async function criarUsuarioMagro(identificador: string): Promise<void> {
  await prisma.usuario.create({
    data: { identificador, nome: identificador, criadoPor: "TESTE" },
  });
}

async function semear(): Promise<void> {
  await limparBanco(prisma);

  await prisma.contaPcasp.createMany({ data: CONTAS });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.createMany({
    data: [
      { id: UO_SAUDE, codigo: "01004", descricao: "Saúde", orgaoId: "org-01" },
      { id: UO_EDUC, codigo: "01003", descricao: "Educação", orgaoId: "org-01" },
    ],
  });
  await prisma.funcao.create({ data: { id: "fun-10", codigo: "10", nome: "Saúde" } });
  await prisma.subfuncao.create({ data: { id: "sub-301", codigo: "301", nome: "Atenção Básica" } });
  await prisma.programa.create({ data: { id: "prg-0010", codigo: "0010", descricao: "Saúde Básica" } });
  await prisma.acao.create({
    data: { id: "aca-2010", codigo: "2010", descricao: "Manutenção", tipo: "ATIVIDADE" },
  });
  await prisma.naturezaDespesa.createMany({
    data: [
      {
        id: "nd-339030", codCategoria: "3", codNatureza: "3", codModalidade: "90",
        codElemento: "30", codigoCompleto: "339030", descricao: "Material de consumo",
      },
      // ⚠️ A SEGUNDA NATUREZA existe para a ficha NOVA do t1/M02: a `uq_ficha_sagres` proíbe
      // duas fichas com a MESMA classificação — e a ficha criada pelo serviço tem de diferir
      // da semeada em ALGUM componente. Ela difere no elemento de despesa.
      {
        id: "nd-339039", codCategoria: "3", codNatureza: "3", codModalidade: "90",
        codElemento: "39", codigoCompleto: "339039", descricao: "Serviços PJ",
      },
    ],
  });
  await prisma.naturezaReceita.create({
    data: { id: "nr-1", codigo: "11130113", descricao: "Dívida ativa do IPTU" },
  });
  await prisma.fonteRecurso.create({
    data: { id: FONTE, codigo: "500", descricao: "Não vinculados", codigoTce: "500" },
  });
  await prisma.contaBancaria.create({
    data: { id: "cb-1", codigo: "CC-001", descricao: "Conta única", fonteId: FONTE },
  });
  await prisma.roteiroDividaAtiva.createMany({
    data: [
      { tipo: "INSCRICAO", contaDebitoId: "c-da", contaCreditoId: "c-vpa-da", criadoPor: "TESTE" },
    ],
  });

  // ⚠️ AS DUAS FICHAS — a da SAÚDE e a da EDUCAÇÃO. É a UG DELAS que o `escopo.ts` deriva, e é
  // contra ela que a permissão é conferida. Nenhum id de unidade é inventado nos testes.
  for (const [id, ug, numero] of [
    [FICHA_SAUDE, UO_SAUDE, 1],
    [FICHA_EDUC, UO_EDUC, 2],
  ] as const) {
    await criarFichaDeTeste(prisma, {
      id, exercicio: 2026, numero,
      orgaoId: "org-01", unidadeOrcId: ug, funcaoId: "fun-10",
      subfuncaoId: "sub-301", programaId: "prg-0010", acaoId: "aca-2010",
      naturezaDespesaId: "nd-339030", fonteId: FONTE, valorDotado: "100000.00",
    });
  }

  deps = criarM05DepsComAlmoxarifado(prisma);
}

/** O fato COMPLETO, numa UG: empenha -> liquida -> (opcional) paga. */
async function empenharELiquidar(
  fichaId: string,
  n: string,
  criadoPor = ADMIN,
  valor = "1000.00"
): Promise<{ empenhoId: string; liquidacaoId: string }> {
  const e = await empenhar(
    {
      fichaId, numero: `NE-${n}`, tipo: "ORDINARIO", valor,
      data: new Date("2026-03-01T12:00:00Z"), credorCpfCnpj: "12345678000199",
      historico: "material de consumo", categoriaOrdemCronologica: "FORNECIMENTO_BENS",
      criadoPor,
    },
    R_EMPENHO,
    deps
  );
  const l = await liquidar(
    {
      empenhoId: e.empenhoId, numero: `NL-${n}`, valor,
      data: new Date("2026-04-01T12:00:00Z"),
      responsavelAtesto: "Fulano", historico: "atesto", criadoPor,
    },
    R_LIQUIDACAO,
    deps
  );
  return { empenhoId: e.empenhoId, liquidacaoId: l.liquidacaoId };
}

const pg = (liquidacaoId: string, n: string, criadoPor: string, valor = "1000.00") => ({
  liquidacaoId, numero: `NP-${n}`, valor,
  data: new Date("2026-05-01T12:00:00Z"),
  contaBancaria: "CC-001", fonteId: FONTE,
  historico: "pagamento", criadoPor,
});

describe("M16 bloco 3 — o ROLLOUT da autorização (TR 4.56 · 6.4 · 6.5)", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t1 — AMOSTRA VERTICAL: um serviço de cada onda, e os TRÊS desfechos.
  // ═══════════════════════════════════════════════════════════════════════════

  it("t1/M02 criarFicha: a UG É o objeto do ato — cria na Saúde, negado na Educação", async () => {
    const m02 = criarM02Deps(prisma);
    const FICHA = {
      exercicio: 2026,
      numero: 77,
      classificacao: {
        orgao: "01", unidadeOrc: "01004", funcao: "10", subfuncao: "301",
        programa: "0010", acao: "2010", naturezaDespesa: "339039", fonte: "500",
      },
      exercicioFonte: 1 as const,
      valorDotado: "5000.00",
    };

    // ── (a) COM a ação e NA unidade certa: passa, e o LITERAL DE NEGÓCIO fica intacto ──
    await criarUsuarioCom("orc.saude@cg.pb.gov.br", "ORCAMENTO_SAUDE", [
      { acao: "CRIAR_FICHA", ug: UO_SAUDE },
    ]);
    const id = await criarFicha(
      { ...FICHA, criadoPor: "orc.saude@cg.pb.gov.br" },
      m02
    );
    const criada = await prisma.fichaOrcamentaria.findUniqueOrThrow({
      where: { id },
      select: { unidadeOrcId: true, valorDotado: true, movimentos: { select: { tipo: true } } },
    });
    expect(criada.unidadeOrcId).toBe(UO_SAUDE);
    expect(criada.valorDotado.toFixed(2)).toBe("5000.00");
    // ...e a DOTACAO_INICIAL continua nascendo com ela (o fluxo do M02 não foi tocado).
    expect(criada.movimentos.map((m) => m.tipo)).toEqual(["DOTACAO_INICIAL"]);

    // ── (b) SEM a ação: negado nomeando A AÇÃO (não é escopo — é a ação) ──
    await criarUsuarioCom("almox@teste.gov", "SO_ALMOXARIFADO", [
      { acao: "REGISTRAR_ENTRADA_ALMOXARIFADO" },
    ]);
    const semAcao = criarFicha({ ...FICHA, numero: 78, criadoPor: "almox@teste.gov" }, m02);
    await expect(semAcao).rejects.toThrow(/não tem permissão para CRIAR_FICHA/);
    await expect(
      criarFicha({ ...FICHA, numero: 78, criadoPor: "almox@teste.gov" }, m02)
    ).rejects.toThrow(/o que faltou: A AÇÃO/);

    // ── (c) COM a ação, em OUTRA unidade: negado nomeando O ESCOPO ──
    await criarUsuarioCom("orc.educ@cg.pb.gov.br", "ORCAMENTO_EDUC", [
      { acao: "CRIAR_FICHA", ug: UO_EDUC },
    ]);
    await expect(
      criarFicha({ ...FICHA, numero: 79, criadoPor: "orc.educ@cg.pb.gov.br" }, m02)
    ).rejects.toThrow(new RegExp(`não tem permissão para CRIAR_FICHA na unidade gestora ${UO_SAUDE}`));
    await expect(
      criarFicha({ ...FICHA, numero: 79, criadoPor: "orc.educ@cg.pb.gov.br" }, m02)
    ).rejects.toThrow(/o que faltou: O ESCOPO/);

    // ⚠️ ZERO ESCRITA nas duas negações — só a ficha autorizada existe (+ as 2 do semear).
    expect(await prisma.fichaOrcamentaria.count()).toBe(3);
  });

  it("t1/M03 executarCredito: o decreto que toca DUAS unidades exige poder nas DUAS", async () => {
    const m03 = criarM03Deps(prisma);

    const leiId = await criarLei(
      {
        numero: "L-1", ano: 2026, tipoCredito: "SUPLEMENTAR",
        valorAutorizado: "50000.00", dataPublicacao: new Date("2026-01-05T12:00:00Z"),
        criadoPor: ADMIN,
      },
      m03
    );
    const decretoId = await criarDecreto(
      {
        leiId, numero: "D-1", ano: 2026, data: new Date("2026-02-01T12:00:00Z"),
        origemRecurso: "ANULACAO", criadoPor: ADMIN,
      },
      m03
    );

    // ⚠️ O DECRETO É INDIVISÍVEL: anula 2.000 na EDUCAÇÃO para suplementar 2.000 na SAÚDE.
    const itens = [
      { fichaId: FICHA_EDUC, tipo: "ANULACAO" as const, valor: "2000.00", fonteId: FONTE },
      { fichaId: FICHA_SAUDE, tipo: "SUPLEMENTACAO" as const, valor: "2000.00", fonteId: FONTE },
    ];

    // ── quem só pode na SAÚDE não executa: a perna da EDUCAÇÃO é dele também ──
    await criarUsuarioCom("cred.saude@teste.gov", "CREDITO_SAUDE", [
      { acao: "EXECUTAR_CREDITO", ug: UO_SAUDE },
    ]);
    await expect(
      executarCredito({ decretoId, itens, criadoPor: "cred.saude@teste.gov" }, m03)
    ).rejects.toThrow(new RegExp(`não tem permissão para EXECUTAR_CREDITO na unidade gestora ${UO_EDUC}`));

    // ⚠️ NADA foi gravado — metade de um decreto seria um crédito que não fecha.
    expect(await prisma.itemCredito.count()).toBe(0);

    // ── com permissão GLOBAL, passa — e o LITERAL DE NEGÓCIO (o saldo das fichas) anda ──
    await executarCredito({ decretoId, itens, criadoPor: ADMIN }, m03);
    expect(await prisma.itemCredito.count()).toBe(2);

    const saude = await saldosDaFicha(FICHA_SAUDE, deps);
    const educ = await saldosDaFicha(FICHA_EDUC, deps);
    expect(saude.autorizado.toFixed(2)).toBe("102000.00"); // 100.000 + 2.000
    expect(educ.autorizado.toFixed(2)).toBe("98000.00"); //  100.000 − 2.000
  });

  it("t1/M04 registrarArrecadacao: ato do ENTE — permissão de UMA unidade NÃO serve", async () => {
    const m04 = criarM04DepsComDividas(prisma);
    const da = await cadastrarDividaAtiva(prisma, {
      identificador: "DA-1", devedorDocumento: "11122233344",
      devedorNome: "Contribuinte", origem: "TRIBUTARIA",
      contaContabilId: "c-da", criadoPor: ADMIN,
    });
    await inscreverDividaAtiva(prisma, {
      dividaAtivaId: da.dividaAtivaId, valor: "800.00",
      dataMovimento: new Date("2026-01-10T12:00:00Z"),
      motivo: "inscricao em divida ativa do exercicio de 2024", criadoPor: ADMIN,
    });

    const guia = {
      exercicio: 2026, naturezaReceita: "11130113", fonte: "500",
      valor: "800.00",
      dataArrecadacao: new Date("2026-06-01T12:00:00Z"),
      numeroReceita: "GUIA-1", criadoPor: "tributos.saude@teste.gov",
    };

    // ⚠️ ELE TEM `REGISTRAR_ARRECADACAO` — MAS SÓ NA SAÚDE. E a receita NÃO é da Saúde: ela é
    // do ENTE (art. 167, IV). Só a permissão GLOBAL a autoriza — e a mensagem diz exatamente
    // isso, em vez de um "acesso negado" que mandaria o servidor pedir a permissão errada.
    await criarUsuarioCom("tributos.saude@teste.gov", "TRIBUTOS_SAUDE", [
      { acao: "REGISTRAR_ARRECADACAO", ug: UO_SAUDE },
    ]);
    await expect(
      arrecadarRecebimentoDividaAtiva(prisma, {
        arrecadacao: guia,
        roteiro: R_ARRECADACAO_DA,
        vinculos: [{ dividaAtivaId: da.dividaAtivaId, valor: "800.00" }],
      })
    ).rejects.toThrow(/no escopo do ENTE .*só uma permissão GLOBAL o autoriza/s);
    await expect(
      registrarArrecadacao(guia, R_ARRECADACAO_DA, m04, { origem: "OPERACAO_COMPOSTA_M10" })
    ).rejects.toThrow(/o que faltou: O ESCOPO/);

    expect(await prisma.receitaArrecadada.count()).toBe(0);
  });

  it("t1/M05 empenhar e pagar: a UG vem da FICHA, e a segregação 6.5 morde", async () => {
    // ⚠️ ELE EMPENHA — SÓ NA SAÚDE. O mesmo serviço, o mesmo valor, a mesma fonte: o que muda
    // é a UNIDADE DA FICHA, e é só isso que decide.
    await criarUsuarioCom("emp.saude@teste.gov", "EMPENHO_SAUDE", [
      { acao: "EMPENHAR", ug: UO_SAUDE },
    ]);

    const e = await empenhar(
      {
        fichaId: FICHA_SAUDE, numero: "NE-1", tipo: "ORDINARIO", valor: "1000.00",
        data: new Date("2026-03-01T12:00:00Z"), credorCpfCnpj: "12345678000199",
        historico: "compra", categoriaOrdemCronologica: "FORNECIMENTO_BENS",
        criadoPor: "emp.saude@teste.gov",
      },
      R_EMPENHO,
      deps
    );
    expect(e.empenhoId).toBeDefined();

    // ⚠️ O LITERAL DE NEGÓCIO INTACTO: o saldo da ficha caiu, e o razão recebeu o lançamento.
    const saldos = await saldosDaFicha(FICHA_SAUDE, deps);
    expect(saldos.empenhado.toFixed(2)).toBe("1000.00");
    expect(saldos.disponivel.toFixed(2)).toBe("99000.00");
    expect(
      await prisma.partidaContabil.count({ where: { fichaId: FICHA_SAUDE } })
    ).toBeGreaterThan(0);

    // ── a MESMA pessoa, o MESMO ato, na EDUCAÇÃO: negado nomeando a unidade ──
    await expect(
      empenhar(
        {
          fichaId: FICHA_EDUC, numero: "NE-2", tipo: "ORDINARIO", valor: "1000.00",
          data: new Date("2026-03-01T12:00:00Z"), credorCpfCnpj: "12345678000199",
          historico: "compra", categoriaOrdemCronologica: "FORNECIMENTO_BENS",
          criadoPor: "emp.saude@teste.gov",
        },
        R_EMPENHO,
        deps
      )
    ).rejects.toThrow(new RegExp(`não tem permissão para EMPENHAR na unidade gestora ${UO_EDUC}`));

    // ⚠️ ZERO ESCRITA: a ficha da Educação não foi tocada.
    const educ = await saldosDaFicha(FICHA_EDUC, deps);
    expect(educ.empenhado.toFixed(2)).toBe("0.00");
  });

  it("t1/M08 abrirExercicio é do ENTE; liquidarRestosAPagar herda a UG do EMPENHO", async () => {
    // ── (a) ATO DO ENTE: quem só pode na Saúde NÃO abre o exercício do município ──
    await criarUsuarioCom("ctrl.saude@teste.gov", "CONTROLE_SAUDE", [
      { acao: "ABRIR_EXERCICIO", ug: UO_SAUDE },
    ]);
    await expect(
      abrirExercicio(prisma, { ano: 2028, criadoPor: "ctrl.saude@teste.gov" })
    ).rejects.toThrow(/no escopo do ENTE/);
    expect(await prisma.exercicio.count({ where: { ano: 2028 } })).toBe(0);

    // ── (b) O RESTO A PAGAR: mesmo dinheiro, outro ano — e a MESMA unidade do empenho ──
    const { empenhoId } = await empenharELiquidar(FICHA_SAUDE, "RP", ADMIN, "1000.00");
    void empenhoId;
    const e2 = await empenhar(
      {
        fichaId: FICHA_SAUDE, numero: "NE-RP2", tipo: "ORDINARIO", valor: "500.00",
        data: new Date("2026-03-02T12:00:00Z"), credorCpfCnpj: "12345678000199",
        historico: "a inscrever", categoriaOrdemCronologica: "FORNECIMENTO_BENS",
        criadoPor: ADMIN,
      },
      R_EMPENHO,
      deps
    );
    const enc = await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: ADMIN });
    expect(enc.inscricoes.length).toBeGreaterThan(0);

    await prisma.exercicio.upsert({
      where: { ano: 2027 },
      update: {},
      create: { ano: 2027, criadoPor: ADMIN },
    });

    // ⚠️ A UG DO RESTO É A DA FICHA DO EMPENHO — e a permissão da EDUCAÇÃO não a alcança.
    await criarUsuarioCom("rp.educ@teste.gov", "RP_EDUC", [
      { acao: "LIQUIDAR_RESTOS_A_PAGAR", ug: UO_EDUC },
    ]);
    await expect(
      liquidarRestosAPagar(
        prisma,
        {
          empenhoId: e2.empenhoId, numero: "NL-RP", valor: "500.00",
          data: new Date("2027-03-01T12:00:00Z"), responsavelAtesto: "Fulano",
          historico: "liquida RP", criadoPor: "rp.educ@teste.gov",
        },
        R_LIQUIDACAO
      )
    ).rejects.toThrow(new RegExp(`LIQUIDAR_RESTOS_A_PAGAR na unidade gestora ${UO_SAUDE}`));

    // ...e quem pode na SAÚDE liquida o resto (o literal de negócio: o movimento nasce).
    await criarUsuarioCom("rp.saude@teste.gov", "RP_SAUDE", [
      { acao: "LIQUIDAR_RESTOS_A_PAGAR", ug: UO_SAUDE },
    ]);
    const l = await liquidarRestosAPagar(
      prisma,
      {
        empenhoId: e2.empenhoId, numero: "NL-RP", valor: "500.00",
        data: new Date("2027-03-01T12:00:00Z"), responsavelAtesto: "Fulano",
        historico: "liquida RP", criadoPor: "rp.saude@teste.gov",
      },
      R_LIQUIDACAO
    );
    expect(l.liquidacaoId).toBeDefined();
  });

  it("t1/M10-M12: entrada de almoxarifado tem UG (vem da liquidação); contrato e linha, não", async () => {
    const classe = await cadastrarClasseDeMaterial(prisma, {
      codigo: "30.01", descricao: "Material de expediente",
      contaContabilId: "c-estoque", criadoPor: ADMIN,
    });
    const { liquidacaoId } = await empenharELiquidar(FICHA_SAUDE, "ALM");

    // ⚠️ A ENTRADA NASCE DA LIQUIDAÇÃO (TR 5.85) -> empenho -> ficha -> UNIDADE. É o único
    // serviço do M10 com unidade derivável — e ela é derivada, não declarada.
    await criarUsuarioCom("almox.educ@teste.gov", "ALMOX_EDUC", [
      { acao: "REGISTRAR_ENTRADA_ALMOXARIFADO", ug: UO_EDUC },
    ]);
    await expect(
      registrarEntradaAlmoxarifado(prisma, {
        classeDeMaterialId: classe.classeDeMaterialId,
        liquidacaoId, valor: "1000.00",
        dataMovimento: new Date("2026-04-02T12:00:00Z"),
        criadoPor: "almox.educ@teste.gov",
      })
    ).rejects.toThrow(new RegExp(`REGISTRAR_ENTRADA_ALMOXARIFADO na unidade gestora ${UO_SAUDE}`));

    await criarUsuarioCom("almox.saude@teste.gov", "ALMOX_SAUDE", [
      { acao: "REGISTRAR_ENTRADA_ALMOXARIFADO", ug: UO_SAUDE },
    ]);
    const mov = await registrarEntradaAlmoxarifado(prisma, {
      classeDeMaterialId: classe.classeDeMaterialId,
      liquidacaoId, valor: "1000.00",
      dataMovimento: new Date("2026-04-02T12:00:00Z"),
      criadoPor: "almox.saude@teste.gov",
    });
    expect(mov.movimentoId).toBeDefined();

    // ── M11/M12: o contrato e a linha do demonstrativo NÃO têm unidade — são do ENTE ──
    await criarUsuarioCom("lic.saude@teste.gov", "LICITA_SAUDE", [
      { acao: "CADASTRAR_PROCESSO", ug: UO_SAUDE },
      { acao: "CADASTRAR_CONTRATO", ug: UO_SAUDE },
    ]);
    await expect(
      cadastrarProcesso(prisma, {
        numeroProcesso: "PL-1", modalidade: "PREGAO_ELETRONICO",
        objeto: "aquisicao de material de expediente",
        valorLicitado: "10000.00", criadoPor: "lic.saude@teste.gov",
      })
    ).rejects.toThrow(/no escopo do ENTE/);

    // ...e o ADMIN (global) cadastra os dois — o fluxo do M11 segue idêntico.
    const proc = await cadastrarProcesso(prisma, {
      numeroProcesso: "PL-1", modalidade: "PREGAO_ELETRONICO",
      objeto: "aquisicao de material de expediente",
      valorLicitado: "10000.00", dataHomologacao: new Date("2026-02-10T12:00:00Z"),
      criadoPor: ADMIN,
    });
    const c = await cadastrarContrato(prisma, {
      numeroContrato: "CT-1", processoId: proc.processoId,
      contratadoDocumento: "12345678000199", contratadoNome: "Fornecedor",
      valorInicial: "10000.00",
      vigenciaInicio: new Date("2026-03-01T12:00:00Z"),
      vigenciaFimInicial: new Date("2026-12-31T12:00:00Z"),
      categoriaOrdemCronologica: "FORNECIMENTO_BENS",
      criadoPor: ADMIN,
    });
    expect(c.contratoId).toBeDefined();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t2 — O COMPOSTO: autoriza UMA vez, na BORDA PÚBLICA.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t2: a operação COMPOSTA autoriza uma vez (REGISTRAR_ARRECADACAO), na transação dela", async () => {
    const da = await cadastrarDividaAtiva(prisma, {
      identificador: "DA-2", devedorDocumento: "11122233344",
      devedorNome: "Contribuinte", origem: "TRIBUTARIA",
      contaContabilId: "c-da", criadoPor: ADMIN,
    });
    await inscreverDividaAtiva(prisma, {
      dividaAtivaId: da.dividaAtivaId, valor: "800.00",
      dataMovimento: new Date("2026-01-10T12:00:00Z"),
      motivo: "inscricao em divida ativa do exercicio de 2024", criadoPor: ADMIN,
    });

    // ⚠️ ELE TEM **SÓ** `REGISTRAR_ARRECADACAO` (global) — e mais NADA. Nem cadastrar dívida
    // ativa, nem inscrever, nem "receber". E a composta RODA INTEIRA.
    //
    // É a decisão 0(b) provada: a autorização é a da BORDA PÚBLICA. Os linkers (`receberNaTx`)
    // são pernas do mesmo fato — estão no `FORA_DO_CENSO`, e cobrar permissão própria deles
    // seria cobrar duas vezes pelo mesmo ato, e permitir conceder METADE de uma operação
    // atômica (o dinheiro entra, a dívida não baixa) — que é pior do que não conceder nada.
    await criarUsuarioCom("caixa@teste.gov", "SO_ARRECADA", [
      { acao: "REGISTRAR_ARRECADACAO" },
    ]);

    const r = await arrecadarRecebimentoDividaAtiva(prisma, {
      arrecadacao: {
        exercicio: 2026, naturezaReceita: "11130113", fonte: "500",
        valor: "800.00",
        dataArrecadacao: new Date("2026-06-01T12:00:00Z"),
        numeroReceita: "GUIA-2", criadoPor: "caixa@teste.gov",
      },
      roteiro: R_ARRECADACAO_DA,
      vinculos: [{ dividaAtivaId: da.dividaAtivaId, valor: "800.00" }],
    });

    // AS DUAS PERNAS GRAVARAM — a receita no razão E o recebimento nos movimentos.
    expect(r.receitaId).toBeDefined();
    expect(r.movimentoIds).toHaveLength(1);
    const movs = await prisma.movimentoDividaAtiva.findMany({
      where: { dividaAtivaId: da.dividaAtivaId },
      select: { tipo: true },
    });
    expect(movs.map((m) => m.tipo).sort()).toEqual(["INSCRICAO", "RECEBIMENTO"]);

    // ── e sem a ação da BORDA, a composta INTEIRA cai: nem receita, nem recebimento ──
    await criarUsuarioMagro("magro@teste.gov");
    await expect(
      arrecadarRecebimentoDividaAtiva(prisma, {
        arrecadacao: {
          exercicio: 2026, naturezaReceita: "11130113", fonte: "500",
          valor: "800.00",
          dataArrecadacao: new Date("2026-06-02T12:00:00Z"),
          numeroReceita: "GUIA-3", criadoPor: "magro@teste.gov",
        },
        roteiro: R_ARRECADACAO_DA,
        vinculos: [{ dividaAtivaId: da.dividaAtivaId, valor: "800.00" }],
      })
    ).rejects.toThrow(/ACESSO NEGADO — SEM PERFIL/);

    expect(await prisma.receitaArrecadada.count()).toBe(1); // só a autorizada
    expect(await prisma.movimentoDividaAtiva.count()).toBe(2); // inscrição + o recebimento dela
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t3 — A CASCATA roda com a autorização DO ATO ORIGINAL.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t3: anular a liquidação com ANULAR_LIQUIDACAO — a cascata do almoxarifado roda SEM permissão própria", async () => {
    const classe = await cadastrarClasseDeMaterial(prisma, {
      codigo: "30.02", descricao: "Material", contaContabilId: "c-estoque", criadoPor: ADMIN,
    });
    const { liquidacaoId } = await empenharELiquidar(FICHA_SAUDE, "CASC");
    await registrarEntradaAlmoxarifado(prisma, {
      classeDeMaterialId: classe.classeDeMaterialId,
      liquidacaoId, valor: "1000.00",
      dataMovimento: new Date("2026-04-02T12:00:00Z"), criadoPor: ADMIN,
    });

    expect(await prisma.movimentoAlmoxarifado.count()).toBe(1);

    // ⚠️ ELE TEM **SÓ** `ANULAR_LIQUIDACAO`, NA SAÚDE. E mais NADA — em especial, NENHUMA
    // permissão de almoxarifado (nem ESTORNAR_MOVIMENTO_ALMOXARIFADO, nem entrada, nem ajuste).
    await criarUsuarioCom("anula.saude@teste.gov", "ANULA_SAUDE", [
      { acao: "ANULAR_LIQUIDACAO", ug: UO_SAUDE },
    ]);

    await anularLiquidacao(
      {
        liquidacaoId, numero: "NL-ANL",
        data: new Date("2026-04-20T12:00:00Z"),
        historico: "anulacao da liquidacao",
        criadoPor: "anula.saude@teste.gov",
      },
      deps
    );

    // ⚠️ A CASCATA RODOU: o material que entrou pela liquidação SAIU do estoque — e ninguém
    // pediu permissão de almoxarifado a ele.
    //
    // É a decisão 0(c), e ela é o oposto de um descuido: a cascata é CONSEQUÊNCIA do ato, não
    // um ato novo. Exigir permissão própria partiria a anulação AO MEIO — o razão estornado e
    // o estoque ainda cheio, numa transação que já não pode voltar atrás. Quem pode desfazer a
    // liquidação está desfazendo TUDO o que ela causou; é isso que "anular" significa.
    const movs = await prisma.movimentoAlmoxarifado.findMany({
      select: { tipo: true, estornoDeId: true },
      orderBy: { criadoEm: "asc" },
    });
    expect(movs).toHaveLength(2);
    expect(movs[1]!.estornoDeId).not.toBeNull();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t4 — O ESCOPO DA UG, COM O FATO COMPLETO NAS DUAS UNIDADES.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t4: TESOURARIA com PAGAR só na UG-A paga na A e é NEGADA na B (duas fichas, duas unidades)", async () => {
    // Dois fatos COMPLETOS e idênticos — um em cada unidade. Só a ficha os distingue.
    const a = await empenharELiquidar(FICHA_SAUDE, "A");
    const b = await empenharELiquidar(FICHA_EDUC, "B");

    await criarUsuarioCom("tesouraria.saude@teste.gov", "TESOURARIA_SAUDE", [
      { acao: "PAGAR", ug: UO_SAUDE },
    ]);

    // ── PAGA na Saúde: o dinheiro SAI, e o razão registra ──
    const pago = await pagar(
      pg(a.liquidacaoId, "A", "tesouraria.saude@teste.gov"),
      R_PAGAMENTO,
      deps
    );
    expect(pago.pagamentoId).toBeDefined();
    const saldos = await saldosDaFicha(FICHA_SAUDE, deps);
    expect(saldos.empenhado.toFixed(2)).toBe("1000.00");

    // ── NEGADA na Educação: o MESMO ato, o MESMO valor, a MESMA conta bancária ──
    await expect(
      pagar(pg(b.liquidacaoId, "B", "tesouraria.saude@teste.gov"), R_PAGAMENTO, deps)
    ).rejects.toThrow(new RegExp(`não tem permissão para PAGAR na unidade gestora ${UO_EDUC}`));
    // ...e a mensagem NOMEIA A CAUSA: é o escopo, não a ação — e diz ONDE ele pode.
    await expect(
      pagar(pg(b.liquidacaoId, "B", "tesouraria.saude@teste.gov"), R_PAGAMENTO, deps)
    ).rejects.toThrow(new RegExp(`o que faltou: O ESCOPO — ele TEM a ação PAGAR, mas só em: ${UO_SAUDE}`));

    // ⚠️ ZERO ESCRITA: existe UM pagamento no sistema, o da Saúde.
    expect(await prisma.pagamento.count()).toBe(1);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t5 — O ONIPOTENTE É DE TESTE. E o grep prova.
  //
  // ⚠️ A ALLOWLIST — UM arquivo, e ele paga um preço mais alto que a regra.
  //
  // O t5 nasceu proibindo QUALQUER menção a perfil/usuário/permissão em `prisma/seed/`,
  // porque "um seed que carimba um superusuário no banco de produção entrega a
  // chave-mestra a quem rodar `npm run seed`". Isso continua verdadeiro, e a 7.2 foi
  // barrada por isso — corretamente.
  //
  // O que a 7.2 revelou é que havia DUAS coisas no mesmo balaio:
  //   SEED      = rotina RE-EXECUTÁVEL (roda no deploy, roda de novo, roda sempre);
  //   BOOTSTRAP = ato ÚNICO de instalação (roda uma vez na vida do banco, ou nenhuma).
  // O t5 estava certo sobre o primeiro e MUDO sobre o segundo — e alguém sempre terá de
  // criar o primeiro usuário, senão a UI (inteira atrás de `exigirSessao()`) fica atrás
  // de uma porta cuja chave não existe.
  //
  // A exceção não afrouxa o guard: ela é mais DURA que ele. O `bootstrap-usuario.ts`
  // ABORTA se `count(Usuario) > 0` — num banco povoado ele é INERTE, e o vetor que o t5
  // teme deixa de existir (não é mitigado: é impossível). Quem roda o script num banco
  // de produção não ganha nada; quem instala do zero ganha o que uma instalação exige.
  //
  // O rol cresce por DECISÃO, e o t5b abaixo cobra o preço: cada condição da exceção é
  // verificada, no arquivo e na execução. Acrescentar um segundo nome aqui sem passar
  // pelo t5b é reabrir o buraco que o t5 fechou.
  // ═══════════════════════════════════════════════════════════════════════════
  const ARQUIVOS_PERMITIDOS = new Set(["bootstrap-usuario.ts"]);

  it("t5: o perfil ADMIN não existe em seed de PRODUÇÃO — e o usuário magro não pode NADA", async () => {
    // ⚠️ O ONIPOTENTE É UMA FERRAMENTA DE FIXTURE, e o dia em que ele vazar para um seed de
    // produção o ente inteiro passa a ter um superusuário que ninguém pediu. O grep varre
    // `prisma/seed/` — o que roda no banco de VERDADE — e exige silêncio total sobre perfis,
    // usuários e permissões.
    const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
    const dirSeed = join(RAIZ, "prisma", "seed");

    const suspeitos: string[] = [];
    const varrer = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) {
          varrer(p);
          continue;
        }
        if (!e.name.endsWith(".ts") || e.name.endsWith(".test.ts")) continue;
        if (ARQUIVOS_PERMITIDOS.has(e.name)) continue; // ver ARQUIVOS_PERMITIDOS
        const txt = readFileSync(p, "utf8");
        for (const marca of [
          "PERFIL_ADMIN",
          "semearUsuariosDeTeste",
          "prisma.perfil",
          "prisma.usuario",
          "vinculoUsuarioPerfil",
          "permissaoDePerfil",
        ]) {
          if (txt.includes(marca)) suspeitos.push(`${e.name}: ${marca}`);
        }
      }
    };
    varrer(dirSeed);

    expect(
      suspeitos,
      "\n\n⚠️ O PERFIL ONIPOTENTE (ou um cadastro de usuário) VAZOU PARA O SEED DE PRODUÇÃO.\n\n" +
        "O ADMIN existe porque a FIXTURE precisa de um ator que monte o cenário — e ele mora " +
        "em `test/usuarios-teste.ts`, semeado de dentro do `limparBanco`. Num ente de verdade, " +
        "quem cria perfis é o administrador, com o TCE olhando. Um seed que carimba um " +
        "superusuário no banco de produção entrega a chave-mestra a quem rodar `npm run seed`.\n\n" +
        "Achados:\n"
    ).toEqual([]);

    // ...e o ADMIN é de TESTE — ele existe aqui, e é por isso que os 737 não sabem de permissão.
    const admin = await prisma.perfil.findUnique({
      where: { nome: PERFIL_ADMIN },
      select: { permissoes: { select: { unidadeOrcId: true } } },
    });
    expect(admin).not.toBeNull();
    // Todas GLOBAIS (`unidadeOrcId` nulo) — é a concessão explícita que cobre qualquer unidade.
    expect(admin!.permissoes.every((p) => p.unidadeOrcId === null)).toBe(true);

    // ── O USUÁRIO MAGRO: existe, está ativo, e não pode NADA. É o PADRÃO do sistema. ──
    await criarUsuarioMagro("novato@cg.pb.gov.br");
    await expect(
      empenhar(
        {
          fichaId: FICHA_SAUDE, numero: "NE-X", tipo: "ORDINARIO", valor: "10.00",
          data: new Date("2026-03-01T12:00:00Z"), credorCpfCnpj: "12345678000199",
          historico: "tentativa", categoriaOrdemCronologica: "FORNECIMENTO_BENS",
          criadoPor: "novato@cg.pb.gov.br",
        },
        R_EMPENHO,
        deps
      )
    ).rejects.toThrow(/ACESSO NEGADO — SEM PERFIL/);
    await expect(
      empenhar(
        {
          fichaId: FICHA_SAUDE, numero: "NE-X", tipo: "ORDINARIO", valor: "10.00",
          data: new Date("2026-03-01T12:00:00Z"), credorCpfCnpj: "12345678000199",
          historico: "tentativa", categoriaOrdemCronologica: "FORNECIMENTO_BENS",
          criadoPor: "novato@cg.pb.gov.br",
        },
        R_EMPENHO,
        deps
      )
    ).rejects.toThrow(/o que faltou: O VÍNCULO/);

    const saldos = await saldosDaFicha(FICHA_SAUDE, deps);
    expect(saldos.empenhado.toFixed(2)).toBe("0.00");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t5b — O PREÇO DA EXCEÇÃO. O t5 abriu UM nome; aqui ele é cobrado.
  //
  // Uma allowlist sem verificação é só uma proibição com um furo. Cada condição que
  // justificou a exceção do `bootstrap-usuario.ts` é conferida — no ARQUIVO (grep, para
  // pegar quem reescrever o script amanhã) e na EXECUÇÃO (o comportamento de verdade).
  // Se alguém amansar o bootstrap, é aqui que estoura.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t5b: a exceção do bootstrap paga o preço dela — arquivo e execução", async () => {
    const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
    const arquivo = join(RAIZ, "prisma", "seed", "bootstrap-usuario.ts");
    const txt = readFileSync(arquivo, "utf8");

    // (a) A TRAVA que mata o vetor do t5: banco povoado ⇒ aborta.
    expect(
      txt.includes("prisma.usuario.count()") && txt.includes("jaExistem > 0"),
      "\n\n⚠️ O BOOTSTRAP PERDEU A TRAVA `count(Usuario) > 0`.\n\n" +
        "Era ela — e só ela — que justificava a exceção no t5: num banco povoado o script " +
        "é INERTE, então o vetor 'quem roda o seed ganha a chave-mestra' não existe. Sem a " +
        "trava, este arquivo vira exatamente o que o t5 proíbe, e a allowlist vira um furo.\n"
    ).toBe(true);

    // (b) A senha vem do AMBIENTE, com fail-hard.
    expect(txt).toMatch(/SEED_ADMIN_SENHA/);
    expect(txt).toMatch(/COMPRIMENTO_MINIMO_DA_SENHA/);

    // (c) ZERO senha literal. O que o grep procura é uma senha ATRIBUÍDA no código —
    // `senha: "..."` ou `senha = "..."`. Um default aqui nasceria igual em toda
    // instalação e ficaria versionado, público, para sempre.
    expect(
      /\bsenha\s*[:=]\s*["'`][^"'`]/.test(txt),
      "\n\n⚠️ SENHA LITERAL NO BOOTSTRAP.\n\nUma senha no código nasce igual em toda " +
        "instalação e fica no git para sempre. Ela vem do ambiente, ou não vem.\n"
    ).toBe(false);

    // (d) ZERO fixture: o ONIPOTENTE de teste continua sendo de teste.
    expect(txt).not.toMatch(/from\s+["'][^"']*test\//);
    expect(txt).not.toContain("PERFIL_ADMIN");
    expect(txt).not.toContain("semearUsuariosDeTeste");

    // ── EXECUÇÃO ──
    const { bootstrapUsuario, exigirSenhaDoAmbiente } = await import(
      "../../prisma/seed/bootstrap-usuario.js"
    );

    // (b') o fail-hard de verdade, não só o grep
    expect(() => exigirSenhaDoAmbiente({})).toThrow(/SEED_ADMIN_SENHA ausente/);
    expect(() => exigirSenhaDoAmbiente({ SEED_ADMIN_SENHA: "curta" })).toThrow(
      /curta demais/
    );
    // 11 = um a menos que o mínimo. A borda do limite é onde o bug mora.
    expect(() => exigirSenhaDoAmbiente({ SEED_ADMIN_SENHA: "12345678901" })).toThrow(
      /curta demais: 11 caractere/
    );

    // (e) BANCO POVOADO ⇒ FALHA NOMEANDO. O `beforeEach` roda `limparBanco`, que semeia
    // os usuários das fixtures — ou seja, agora estamos num banco povoado de verdade.
    expect(await prisma.usuario.count()).toBeGreaterThan(0);
    await expect(
      bootstrapUsuario(prisma, "uma frase longa de bootstrap")
    ).rejects.toThrow(/BOOTSTRAP RECUSADO: este banco já tem \d+ usuário/);

    // ⚠️ E NÃO GRAVOU NADA: o perfil do bootstrap não existe. A recusa é ANTES da
    // primeira escrita, não uma transação que rola atrás.
    expect(await prisma.perfil.count({ where: { nome: "ADMINISTRADOR" } })).toBe(0);

    // (f) BANCO VAZIO ⇒ cria UM usuário, UM perfil, e para.
    await prisma.vinculoUsuarioPerfil.deleteMany({});
    await prisma.permissaoDePerfil.deleteMany({});
    await prisma.sessaoAberta.deleteMany({});
    await prisma.credencialDeUsuario.deleteMany({});
    await prisma.perfil.deleteMany({});
    await prisma.usuario.deleteMany({});
    expect(await prisma.usuario.count()).toBe(0);

    const r = await bootstrapUsuario(prisma, "uma frase longa de bootstrap");

    expect(await prisma.usuario.count()).toBe(1);
    expect(await prisma.perfil.count()).toBe(1);
    // O perfil é PRÓPRIO — não é o ONIPOTENTE das fixtures.
    expect(await prisma.perfil.count({ where: { nome: PERFIL_ADMIN } })).toBe(0);
    // Vem do CENSO: ação nova = o admin passa a poder concedê-la.
    expect(r.permissoesConcedidas).toBe(TODAS_AS_ACOES.length);
    expect(
      await prisma.permissaoDePerfil.count({
        where: { perfilId: r.perfilId, unidadeOrcId: null },
      })
    ).toBe(TODAS_AS_ACOES.length);

    // A senha existe como EVENTO de credencial, e o hash não mora no usuário.
    expect(await prisma.credencialDeUsuario.count({ where: { usuarioId: r.usuarioId } })).toBe(1);

    // ⚠️ `criadoPor` = o PRÓPRIO identificador. Não há autor anterior ao primeiro
    // usuário, e um marcador tipo "SEED" seria o único `criadoPor` do banco que não
    // resolve para identidade nenhuma — um autor-fantasma para a auditoria.
    const criado = await prisma.usuario.findUniqueOrThrow({
      where: { id: r.usuarioId },
      select: { identificador: true, criadoPor: true, ativo: true },
    });
    expect(criado.criadoPor).toBe(criado.identificador);
    expect(criado.ativo).toBe(true);

    // E A SEGUNDA EXECUÇÃO FALHA — o banco agora tem um usuário. Unicidade, não
    // idempotência: passar em silêncio aqui é que seria o buraco.
    await expect(
      bootstrapUsuario(prisma, "uma frase longa de bootstrap")
    ).rejects.toThrow(/BOOTSTRAP RECUSADO/);
    expect(await prisma.usuario.count()).toBe(1);
  });
});
