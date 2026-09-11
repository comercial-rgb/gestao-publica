import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import {
  abrirInventarioDeEstoque,
  bloquearEstoque,
  cadastrarDeposito,
  cadastrarGrupoDeMaterial,
  cadastrarMaterial,
  cadastrarUnidadeDeMedida,
  definirCotaDeConsumo,
  definirParametroDeEstoque,
  encerrarBloqueioDeEstoque,
  estornarMovimentoFisico,
  fecharInventarioDeEstoque,
  fichaDeControleDeEstoque,
  materiaisAbaixoDoMinimo,
  posicaoDoMaterial,
  registrarContagemDeInventario,
  registrarEntradaFisica,
  registrarRequisicaoDeMaterial,
  registrarSaidaFisica,
  requisicoesPendentes,
  transferirEntreDepositos,
  validadeDoEstoqueDoDeposito,
} from "./estoque-fisico.js";
import {
  cadastrarClasseDeMaterial,
  registrarEntradaAlmoxarifado,
  saldoDaClasseDeMaterial,
} from "./almoxarifado.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { roteiroEmpenho, roteiroLiquidacao } from "../m05-despesa/dominio.js";
import { liquidar } from "../m05-despesa/servico-bloco2.js";
import { empenhar } from "../m05-despesa/servico.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import { Decimal } from "../../packages/contracts/index.js";

/**
 * M10 — ALMOXARIFADO, EIXO FÍSICO (TR 5.18): OS CASOS DE USO CONTRA BANCO.
 *
 * ⚠️ AS CONTAS FEITAS À MÃO, ANTES DO CÓDIGO — e o número que importa é o do preço médio,
 * porque é ele que atravessa para o razão:
 *
 *   ENTRADA 1 ....  100 un a R$  5,00  =   500,00
 *   ENTRADA 2 ....  100 un a R$  9,00  =   900,00
 *   posição ......  200 un                1.400,00   -> preço médio = 7,00
 *   SAÍDA ........   50 un a R$  7,00  =   350,00    <- o médio, NÃO o último preço
 *   posição ......  150 un                1.050,00   -> preço médio segue 7,00
 *
 * ⚠️ N = 2 COM PREÇOS DIFERENTES É O QUE SEPARA "média" de "preço da última entrada".
 * Com uma entrada só, as duas implementações dariam 5,00 e o teste não provaria nada.
 *
 * ⚠️ E O EIXO CONTÁBIL TEM DE ANDAR JUNTO: a saída física gera o MESMO lançamento que
 * `registrarSaidaConsumo` sempre gerou, na mesma transação. O t3 confere os dois eixos.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "almoxarifado@cg.pb.gov.br";
/**
 * ⚠️ UM USUÁRIO CRIADO AQUI, E NÃO UM DAS FIXTURES — porque TODOS os usuários de
 * `semearUsuariosDeTeste` recebem o perfil ADMIN, que tem todas as ações. Usar um deles
 * como "sem permissão" faria este teste passar por acidente, provando o contrário do que
 * afirma: que a autorização é cobrada.
 */
const SEM_PERMISSAO = "estagiario@cg.pb.gov.br";

const ESTOQUE = "1.1.5.1.1.00.00";
const VPD_CONSUMO = "3.3.1.1.1.00.00";
const FORNECEDOR = "2.1.3.1.1.00.00";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const C_LIQUIDADO = "6.2.2.1.3.03.00";
const FICHA = "ficha-1";
const FONTE = "fnt-500";

const R_EMPENHO = roteiroEmpenho({
  creditoDisponivel: C_DISPONIVEL,
  creditoEmpenhado: C_EMPENHADO,
});
/** ⚠️ A perna de DÉBITO da liquidação vai ao ESTOQUE — a despesa não nasce na compra. */
const R_LIQUIDACAO = roteiroLiquidacao({
  variacaoDiminutiva: ESTOQUE,
  obrigacaoAPagar: FORNECEDOR,
  creditoEmpenhado: C_EMPENHADO,
  creditoLiquidado: C_LIQUIDADO,
});

let deps: M05Deps;
let classeId: string;
let sequencia = 0;
let depositoId: string;
let deposito2Id: string;
let materialId: string;
let unidadeId: string;
let caixaId: string;
let setorId: string;

async function semear(): Promise<void> {
  await limparBanco(prisma);

  deps = criarM05Deps(prisma);
  sequencia = 0;

  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-estoque", codigo: ESTOQUE, nome: "Almoxarifado", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "P" },
      { id: "c-vpd", codigo: VPD_CONSUMO, nome: "VPD consumo de material", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-forn", codigo: FORNECEDOR, nome: "Fornecedores", naturezaSaldo: "CREDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "c-disp", codigo: C_DISPONIVEL, nome: "Crédito Disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-emp", codigo: C_EMPENHADO, nome: "Crédito Empenhado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-liq", codigo: C_LIQUIDADO, nome: "Crédito Liquidado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "uo-01", codigo: "01001", descricao: "Administração", orgaoId: "org-01" },
  });
  await prisma.funcao.create({ data: { id: "fun-04", codigo: "04", nome: "Administração" } });
  await prisma.subfuncao.create({ data: { id: "sub-122", codigo: "122", nome: "Adm geral" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0004", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({
    data: { id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "30", codigoCompleto: "339030", descricao: "Material de consumo" },
  });
  await prisma.fonteRecurso.create({
    data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" },
  });
  await criarFichaDeTeste(prisma, {
    id: FICHA, exercicio: 2026, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-04", subfuncaoId: "sub-122", programaId: "prg", acaoId: "aca",
    naturezaDespesaId: "nd", fonteId: FONTE, valorDotado: "500000.00",
  });
  await prisma.setor.create({
    data: { id: "set-01", codigo: "S01", nome: "Secretaria de Saúde", unidadeOrcId: "uo-01", criadoPor: POR },
  });
  setorId = "set-01";

  // O usuário sem poder nenhum: perfil vazio, vínculo real. Fail-closed de verdade.
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

  const classe = await cadastrarClasseDeMaterial(prisma, {
    codigo: "3.01", descricao: "Material de consumo", contaContabilId: "c-estoque", criadoPor: POR,
  });
  classeId = classe.classeDeMaterialId;
  // O roteiro da SAÍDA — sem ele o eixo contábil recusa, e é assim que tem de ser.
  await prisma.roteiroAlmoxarifado.create({
    data: { tipo: "SAIDA_CONSUMO", contaDebitoId: "c-vpd", contaCreditoId: "c-estoque", criadoPor: POR },
  });

  ({ depositoId } = await cadastrarDeposito(prisma, {
    codigo: "DEP01", nome: "Almoxarifado central", unidadeOrcId: "uo-01", criadoPor: POR,
  }));
  ({ depositoId: deposito2Id } = await cadastrarDeposito(prisma, {
    codigo: "DEP02", nome: "Posto de saúde", unidadeOrcId: "uo-01", criadoPor: POR,
  }));

  ({ unidadeDeMedidaId: unidadeId } = await cadastrarUnidadeDeMedida(prisma, {
    sigla: "UN", descricao: "Unidade", criadoPor: POR,
  }));
  ({ unidadeDeMedidaId: caixaId } = await cadastrarUnidadeDeMedida(prisma, {
    sigla: "CX", descricao: "Caixa com 12", criadoPor: POR,
  }));

  const { grupoId } = await cadastrarGrupoDeMaterial(prisma, {
    codigo: "01", descricao: "Higiene", criadoPor: POR,
  });

  ({ materialId } = await cadastrarMaterial(prisma, {
    codigo: "M001",
    descricaoSucinta: "Luva de procedimento",
    descricaoDetalhada: "Luva de procedimento não cirúrgica, látex, tamanho M",
    grupoId,
    classificacao: "CONSUMO",
    categoria: "NAO_PERECIVEL",
    catmat: "150385",
    classeDeMaterialId: classe.classeDeMaterialId,
    controlaLote: false,
    unidades: [
      { unidadeDeMedidaId: unidadeId, fatorParaEstoque: "1", ehDeEstoque: true },
      { unidadeDeMedidaId: caixaId, fatorParaEstoque: "12", ehDeEstoque: false },
    ],
    criadoPor: POR,
  }));
}

/**
 * ⚠️ A ENTRADA DE VERDADE PASSA PELA LIQUIDAÇÃO, e o teste passa por ela também.
 *
 * A primeira versão deste helper chamava só `registrarEntradaFisica` — e a suíte inteira
 * caiu com "CONSUMO MAIOR QUE O ESTOQUE ... ele vale 0,00". O guard estava CERTO: a
 * entrada física não contabiliza nada (quem contabiliza é o M05, pela liquidação, e é
 * assim para a despesa não nascer na compra). Sem liquidação, o razão não tinha estoque
 * nenhum — e a saída, que move os dois eixos, não tinha o que consumir no contábil.
 *
 * Corrigir o teste, e não o guard, é o ponto: o fluxo real é liquidar → entrada contábil
 * → entrada física AMARRADA a ela. É esse fluxo que está provado aqui.
 */
async function entrada(quantidade: string, valorUnitario: string, dia: string): Promise<string> {
  return entradaDe(materialId, quantidade, valorUnitario, dia);
}

async function entradaDe(
  idDoMaterial: string,
  quantidade: string,
  valorUnitario: string,
  dia: string,
  lote?: { readonly loteIdentificacao: string; readonly loteValidade: Date }
): Promise<string> {
  sequencia += 1;
  const total = new Decimal(quantidade).times(valorUnitario).toFixed(2);
  const n = String(sequencia).padStart(3, "0");

  const e = await empenhar(
    {
      fichaId: FICHA, numero: `NE-${n}`, tipo: "ORDINARIO", valor: total,
      data: new Date("2026-01-15T12:00:00Z"), credorCpfCnpj: "12345678000199",
      historico: "compra de material", categoriaOrdemCronologica: "FORNECIMENTO_BENS",
      criadoPor: POR,
    },
    R_EMPENHO,
    deps
  );
  const l = await liquidar(
    {
      empenhoId: e.empenhoId, numero: `NL-${n}`, valor: total,
      data: new Date(`${dia}T12:00:00.000Z`), responsavelAtesto: "Almoxarife",
      historico: "material recebido e atestado", criadoPor: POR,
    },
    R_LIQUIDACAO,
    deps
  );
  const contabil = await registrarEntradaAlmoxarifado(prisma, {
    classeDeMaterialId: classeId, liquidacaoId: l.liquidacaoId, valor: total,
    dataMovimento: new Date(`${dia}T15:00:00.000Z`), criadoPor: POR,
  });
  const { movimentoId } = await registrarEntradaFisica(prisma, {
    materialId: idDoMaterial, depositoId, quantidade, valorUnitario,
    dataMovimento: new Date(`${dia}T15:00:00.000Z`),
    movimentoAlmoxarifadoId: contabil.movimentoId,
    ...(lote === undefined ? {} : lote),
    motivo: "recebimento de material", criadoPor: POR,
  });
  return movimentoId;
}

beforeEach(semear);

describe("t1 · o cadastro de material, e a N-N de unidades (TR 5.17.2)", () => {
  it("o material nasce com as duas unidades e exatamente uma de estoque", async () => {
    const unidades = await prisma.materialUnidade.findMany({
      where: { materialId }, select: { ehDeEstoque: true, fatorParaEstoque: true },
    });
    expect(unidades).toHaveLength(2);
    expect(unidades.filter((u) => u.ehDeEstoque)).toHaveLength(1);
  });

  it("⚠️ RECUSA material com DUAS unidades de estoque — o saldo não teria unidade", async () => {
    const { grupoId } = await cadastrarGrupoDeMaterial(prisma, {
      codigo: "02", descricao: "Outro", criadoPor: POR,
    });
    const classe = await prisma.classeDeMaterial.findFirstOrThrow({ select: { id: true } });
    await expect(
      cadastrarMaterial(prisma, {
        codigo: "M002", descricaoSucinta: "Caneta", descricaoDetalhada: "Caneta esferográfica azul", grupoId,
        classificacao: "CONSUMO", categoria: "ESTOCAVEL",
        classeDeMaterialId: classe.id, controlaLote: false,
        unidades: [
          { unidadeDeMedidaId: unidadeId, fatorParaEstoque: "1", ehDeEstoque: true },
          { unidadeDeMedidaId: caixaId, fatorParaEstoque: "12", ehDeEstoque: true },
        ],
        criadoPor: POR,
      })
    ).rejects.toThrow(/declarou 2 unidades de ESTOQUE/);
  });

  it("⚠️ RECUSA unidade de estoque com fator diferente de 1", async () => {
    const { grupoId } = await cadastrarGrupoDeMaterial(prisma, {
      codigo: "03", descricao: "Outro", criadoPor: POR,
    });
    const classe = await prisma.classeDeMaterial.findFirstOrThrow({ select: { id: true } });
    await expect(
      cadastrarMaterial(prisma, {
        codigo: "M003", descricaoSucinta: "Lápis", descricaoDetalhada: "Lápis preto nº 2", grupoId,
        classificacao: "CONSUMO", categoria: "ESTOCAVEL",
        classeDeMaterialId: classe.id, controlaLote: false,
        unidades: [{ unidadeDeMedidaId: unidadeId, fatorParaEstoque: "12", ehDeEstoque: true }],
        criadoPor: POR,
      })
    ).rejects.toThrow(/multiplicaria o saldo por si mesmo/);
  });
});

describe("t2 · a posição é derivada, e a conversão de unidade é aritmética", () => {
  it("entrada em CAIXA vira quantidade na unidade de ESTOQUE", async () => {
    await registrarEntradaFisica(prisma, {
      materialId, depositoId, unidadeDeMedidaId: caixaId,
      quantidade: "3", valorUnitario: "120.00", // 3 caixas a 120 -> 36 un a 10,00
      dataMovimento: new Date("2026-03-10T15:00:00.000Z"),
      motivo: "recebimento em caixa", criadoPor: POR,
    });
    const p = await posicaoDoMaterial(prisma, materialId, depositoId);
    expect(p.quantidade.toFixed(4)).toBe("36.0000");
    expect(p.valor.toFixed(2)).toBe("360.00");
  });

  it("⚠️ RECUSA unidade não relacionada ao material — inventaria o fator", async () => {
    const { unidadeDeMedidaId: litro } = await cadastrarUnidadeDeMedida(prisma, {
      sigla: "L", descricao: "Litro", criadoPor: POR,
    });
    await expect(
      registrarEntradaFisica(prisma, {
        materialId, depositoId, unidadeDeMedidaId: litro, quantidade: "1",
        valorUnitario: "1.00", dataMovimento: new Date("2026-03-10T15:00:00.000Z"),
        motivo: "entrada em unidade alheia", criadoPor: POR,
      })
    ).rejects.toThrow(/não está relacionada ao material/);
  });
});

describe("t3 · ⚠️ O PREÇO MÉDIO E OS DOIS EIXOS — o coração do lote", () => {
  it("N=2: a saída sai pelo MÉDIO (7,00), não pelo preço da última entrada (9,00)", async () => {
    await entrada("100", "5.00", "2026-03-01");
    await entrada("100", "9.00", "2026-03-05");

    const r = await registrarSaidaFisica(prisma, {
      materialId, depositoId, quantidade: "50",
      dataMovimento: new Date("2026-03-10T15:00:00.000Z"),
      motivo: "consumo do setor", criadoPor: POR,
    });

    expect(
      r.valorUnitario.toFixed(2),
      "a saída saiu a 9,00 (o preço da última entrada) ou a 5,00 (o da primeira) — em " +
        "qualquer dos dois casos o custo médio da TR 5.18.11 não está sendo calculado"
    ).toBe("7.00");

    const p = await posicaoDoMaterial(prisma, materialId, depositoId);
    expect(p.quantidade.toFixed(4)).toBe("150.0000");
    expect(p.valor.toFixed(2)).toBe("1050.00");
  });

  it("⚠️ o eixo CONTÁBIL anda junto, na mesma transação, e os dois batem", async () => {
    await entrada("100", "5.00", "2026-03-01");
    await entrada("100", "9.00", "2026-03-05");
    const r = await registrarSaidaFisica(prisma, {
      materialId, depositoId, quantidade: "50",
      dataMovimento: new Date("2026-03-10T15:00:00.000Z"),
      motivo: "consumo do setor", criadoPor: POR,
    });

    const contabil = await prisma.movimentoAlmoxarifado.findUniqueOrThrow({
      where: { id: r.movimentoContabilId },
      select: { tipo: true, valor: true, lancamentoId: true },
    });
    expect(contabil.tipo).toBe("SAIDA_CONSUMO");
    expect(contabil.valor.toFixed(2)).toBe("350.00"); // 50 × 7,00
    expect(contabil.lancamentoId, "a saída tem de gerar lançamento").not.toBeNull();

    const fisico = await prisma.movimentoFisicoDeEstoque.findFirstOrThrow({
      where: { tipo: "SAIDA" }, select: { valorTotal: true, movimentoAlmoxarifadoId: true },
    });
    expect(fisico.valorTotal.toFixed(2)).toBe("350.00");
    expect(
      fisico.movimentoAlmoxarifadoId,
      "o movimento físico ficou solto do contábil — os dois eixos divergiriam sem que " +
        "nada acusasse"
    ).toBe(r.movimentoContabilId);
  });

  it("⚠️ SAÍDA MAIOR QUE O ESTOQUE recusa, e NÃO deixa lançamento órfão", async () => {
    await entrada("10", "5.00", "2026-03-01");
    const antes = await prisma.lancamentoContabil.count();

    await expect(
      registrarSaidaFisica(prisma, {
        materialId, depositoId, quantidade: "11",
        dataMovimento: new Date("2026-03-10T15:00:00.000Z"),
        motivo: "consumo impossível", criadoPor: POR,
      })
    ).rejects.toThrow(/deixaria a posição NEGATIVA/);

    // ⚠️ A CONTAPROVA DO EFEITO ANTES DA GUARDA: a recusa não pode ter gravado nada.
    expect(await prisma.lancamentoContabil.count()).toBe(antes);
    expect(await prisma.movimentoFisicoDeEstoque.count({ where: { tipo: "SAIDA" } })).toBe(0);
  });
});

describe("t4 · o inventário bloqueia, e o bloqueio é fato com início e fim", () => {
  it("inventário ABERTO recusa a movimentação; FECHADO libera", async () => {
    await entrada("100", "5.00", "2026-03-01");

    const { inventarioId } = await abrirInventarioDeEstoque(prisma, {
      depositoId, dataAbertura: new Date("2026-03-05T15:00:00.000Z"), criadoPor: POR,
    });

    await expect(
      registrarSaidaFisica(prisma, {
        materialId, depositoId, quantidade: "1",
        dataMovimento: new Date("2026-03-06T15:00:00.000Z"),
        motivo: "consumo durante inventário", criadoPor: POR,
      })
    ).rejects.toThrow(/MOVIMENTAÇÃO BLOQUEADA/);

    await registrarContagemDeInventario(prisma, {
      inventarioId, materialId, quantidadeContada: "98", criadoPor: POR,
    });
    await fecharInventarioDeEstoque(prisma, {
      inventarioId, dataFechamento: new Date("2026-03-07T15:00:00.000Z"), criadoPor: POR,
    });

    const r = await registrarSaidaFisica(prisma, {
      materialId, depositoId, quantidade: "1",
      dataMovimento: new Date("2026-03-08T15:00:00.000Z"),
      motivo: "consumo depois do inventário", criadoPor: POR,
    });
    expect(r.movimentoId).toBeTruthy();
  });

  it("⚠️ RECUSA fechar inventário SEM contagem — registraria um inventário que ninguém fez", async () => {
    const { inventarioId } = await abrirInventarioDeEstoque(prisma, {
      depositoId, dataAbertura: new Date("2026-03-05T15:00:00.000Z"), criadoPor: POR,
    });
    await expect(
      fecharInventarioDeEstoque(prisma, {
        inventarioId, dataFechamento: new Date("2026-03-07T15:00:00.000Z"), criadoPor: POR,
      })
    ).rejects.toThrow(/não tem contagem nenhuma/);
  });

  it("⚠️ RECUSA dois inventários abertos no mesmo depósito", async () => {
    await abrirInventarioDeEstoque(prisma, {
      depositoId, dataAbertura: new Date("2026-03-05T15:00:00.000Z"), criadoPor: POR,
    });
    await expect(
      abrirInventarioDeEstoque(prisma, {
        depositoId, dataAbertura: new Date("2026-03-06T15:00:00.000Z"), criadoPor: POR,
      })
    ).rejects.toThrow(/Já há inventário ABERTO/);
  });

  it("o bloqueio por material vale em TODO depósito, e encerrar põe o fim (não apaga)", async () => {
    await entrada("100", "5.00", "2026-03-01");
    const { bloqueioId } = await bloquearEstoque(prisma, {
      materialId, inicio: new Date("2026-03-05T15:00:00.000Z"),
      motivo: "recolhimento sanitário do lote", criadoPor: POR,
    });

    await expect(
      registrarSaidaFisica(prisma, {
        materialId, depositoId, quantidade: "1",
        dataMovimento: new Date("2026-03-06T15:00:00.000Z"),
        motivo: "consumo bloqueado", criadoPor: POR,
      })
    ).rejects.toThrow(/MOVIMENTAÇÃO BLOQUEADA/);

    await encerrarBloqueioDeEstoque(prisma, {
      bloqueioId, fim: new Date("2026-03-07T15:00:00.000Z"), criadoPor: POR,
    });

    const b = await prisma.bloqueioDeEstoque.findUniqueOrThrow({
      where: { id: bloqueioId }, select: { fim: true, motivo: true },
    });
    expect(b.fim, "encerrar é pôr o FIM, não apagar a linha").not.toBeNull();
    expect(b.motivo).toContain("recolhimento");
  });
});

describe("t5 · cota mensal, requisição e atendimento parcial", () => {
  it("⚠️ a cota do MÊS recusa o que passa dela", async () => {
    await entrada("1000", "1.00", "2026-03-01");
    await definirCotaDeConsumo(prisma, {
      setorId, materialId, competencia: "2026-03", quantidadeLimite: "100", criadoPor: POR,
    });

    await registrarSaidaFisica(prisma, {
      materialId, depositoId, quantidade: "60", setorId,
      dataMovimento: new Date("2026-03-10T15:00:00.000Z"),
      motivo: "primeira retirada do mês", criadoPor: POR,
    });

    await expect(
      registrarSaidaFisica(prisma, {
        materialId, depositoId, quantidade: "41", setorId,
        dataMovimento: new Date("2026-03-20T15:00:00.000Z"),
        motivo: "segunda retirada do mês", criadoPor: POR,
      })
    ).rejects.toThrow(/COTA MENSAL ESTOURADA/);

    // ⚠️ O MÊS SEGUINTE TEM COTA PRÓPRIA — a cota é mensal, não acumulada.
    const r = await registrarSaidaFisica(prisma, {
      materialId, depositoId, quantidade: "41", setorId,
      dataMovimento: new Date("2026-04-02T15:00:00.000Z"),
      motivo: "retirada de abril", criadoPor: POR,
    });
    expect(r.movimentoId).toBeTruthy();
  });

  it("atendimento PARCIAL deixa saldo, e o estorno o devolve", async () => {
    await entrada("1000", "1.00", "2026-03-01");
    const { requisicaoId } = await registrarRequisicaoDeMaterial(prisma, {
      numero: "REQ-001", depositoId, setorId,
      dataRequisicao: new Date("2026-03-02T15:00:00.000Z"),
      solicitante: "Enfermaria", itens: [{ materialId, quantidadeSolicitada: "100" }],
      criadoPor: POR,
    });
    const item = await prisma.itemDeRequisicaoDeMaterial.findFirstOrThrow({
      where: { requisicaoId }, select: { id: true },
    });

    const saida = await registrarSaidaFisica(prisma, {
      materialId, depositoId, quantidade: "30", itemDeRequisicaoId: item.id,
      dataMovimento: new Date("2026-03-03T15:00:00.000Z"),
      motivo: "atendimento parcial", criadoPor: POR,
    });

    const pendentes = await requisicoesPendentes(prisma, { depositoId });
    expect(pendentes).toHaveLength(1);
    expect(pendentes[0]?.itensPendentes[0]?.naoAtendida.toFixed(4)).toBe("70.0000");

    // ⚠️ ATENDER ALÉM DO PEDIDO RECUSA.
    await expect(
      registrarSaidaFisica(prisma, {
        materialId, depositoId, quantidade: "71", itemDeRequisicaoId: item.id,
        dataMovimento: new Date("2026-03-04T15:00:00.000Z"),
        motivo: "atendimento além do pedido", criadoPor: POR,
      })
    ).rejects.toThrow(/ATENDIMENTO MAIOR QUE O PEDIDO/);

    await estornarMovimentoFisico(prisma, {
      movimentoId: saida.movimentoId,
      dataMovimento: new Date("2026-03-05T15:00:00.000Z"),
      motivo: "material devolvido pelo setor", criadoPor: POR,
    });

    const depois = await requisicoesPendentes(prisma, { depositoId });
    expect(
      depois[0]?.itensPendentes[0]?.naoAtendida.toFixed(4),
      "o estorno não devolveu o saldo ao item — é exatamente onde uma coluna " +
        "`quantidadeAtendida` derraparia"
    ).toBe("100.0000");
  });
});

describe("t6 · transferência entre depósitos é operação composta", () => {
  it("as duas pernas nascem sob o mesmo operacaoId, e o custo vai junto", async () => {
    await entrada("100", "5.00", "2026-03-01");
    await entrada("100", "9.00", "2026-03-02");

    const t = await transferirEntreDepositos(prisma, {
      materialId, depositoOrigemId: depositoId, depositoDestinoId: deposito2Id,
      quantidade: "40", dataMovimento: new Date("2026-03-10T15:00:00.000Z"),
      motivo: "abastecimento do posto", criadoPor: POR,
    });

    const origem = await posicaoDoMaterial(prisma, materialId, depositoId);
    const destino = await posicaoDoMaterial(prisma, materialId, deposito2Id);
    expect(origem.quantidade.toFixed(4)).toBe("160.0000");
    expect(destino.quantidade.toFixed(4)).toBe("40.0000");
    // 40 × 7,00 (o médio da origem) — o material não muda de valor ao mudar de prateleira.
    expect(destino.valor.toFixed(2)).toBe("280.00");

    const pernas = await prisma.movimentoFisicoDeEstoque.findMany({
      where: { operacaoId: t.operacaoId }, select: { tipo: true },
    });
    expect(pernas).toHaveLength(2);
  });

  it("⚠️ RECUSA transferir para o mesmo depósito", async () => {
    await entrada("100", "5.00", "2026-03-01");
    await expect(
      transferirEntreDepositos(prisma, {
        materialId, depositoOrigemId: depositoId, depositoDestinoId: depositoId,
        quantidade: "1", dataMovimento: new Date("2026-03-10T15:00:00.000Z"),
        motivo: "transferência para si mesma", criadoPor: POR,
      })
    ).rejects.toThrow(/mesmo depósito/);
  });
});

describe("t7 · as consultas que as telas pedem", () => {
  it("a ficha traz o saldo ANTERIOR ao período (TR 5.18.16)", async () => {
    await entrada("100", "5.00", "2026-02-10");
    await entrada("50", "9.00", "2026-03-05");

    const f = await fichaDeControleDeEstoque(prisma, {
      materialId, depositoId, de: "2026-03-01", ate: "2026-03-31",
    });
    expect(
      f.saldoAnterior.quantidade.toFixed(4),
      "o saldo anterior veio zerado — a ficha está somando só o período, e a TR 5.18.16 " +
        "pede explicitamente o que havia ANTES dele"
    ).toBe("100.0000");
    expect(f.movimentos).toHaveLength(1);
    expect(f.saldoFinal.quantidade.toFixed(4)).toBe("150.0000");
  });

  it("abaixo do mínimo é a posição contra o parâmetro (TR 5.18.3)", async () => {
    await definirParametroDeEstoque(prisma, {
      materialId, depositoId, quantidadeMinima: "50", criadoPor: POR,
    });
    await entrada("40", "5.00", "2026-03-01");

    const baixos = await materiaisAbaixoDoMinimo(prisma, depositoId);
    expect(baixos).toHaveLength(1);
    expect(baixos[0]?.quantidade.toFixed(4)).toBe("40.0000");

    await entrada("20", "5.00", "2026-03-02");
    expect(await materiaisAbaixoDoMinimo(prisma, depositoId)).toHaveLength(0);
  });

  it("⚠️ lote sem saldo NÃO entra na lista de vencidos — ninguém o acharia na prateleira", async () => {
    const classe = await prisma.classeDeMaterial.findFirstOrThrow({ select: { id: true } });
    const { grupoId } = await cadastrarGrupoDeMaterial(prisma, {
      codigo: "04", descricao: "Medicamentos", criadoPor: POR,
    });
    const { materialId: remedioId } = await cadastrarMaterial(prisma, {
      codigo: "M010", descricaoSucinta: "Dipirona", descricaoDetalhada: "Dipirona 500mg",
      grupoId, classificacao: "CONSUMO", categoria: "PERECIVEL",
      classeDeMaterialId: classe.id, controlaLote: true,
      unidades: [{ unidadeDeMedidaId: unidadeId, fatorParaEstoque: "1", ehDeEstoque: true }],
      criadoPor: POR,
    });

    await entradaDe(remedioId, "10", "2.00", "2026-03-01", {
      loteIdentificacao: "L-2026-A",
      loteValidade: new Date("2026-03-20T12:00:00.000Z"),
    });

    const antes = await validadeDoEstoqueDoDeposito(prisma, depositoId, "2026-03-10");
    expect(antes.aVencer).toHaveLength(1);

    const lote = await prisma.loteDeMaterial.findFirstOrThrow({
      where: { materialId: remedioId }, select: { id: true },
    });
    await registrarSaidaFisica(prisma, {
      materialId: remedioId, depositoId, quantidade: "10", loteId: lote.id,
      dataMovimento: new Date("2026-03-05T15:00:00.000Z"),
      motivo: "consumo total do lote", criadoPor: POR,
    });

    const depois = await validadeDoEstoqueDoDeposito(prisma, depositoId, "2026-03-10");
    expect(depois.aVencer).toHaveLength(0);
    expect(depois.vencidos).toHaveLength(0);
  });

  it("⚠️ RECUSA SAÍDA sem lote em material que controla lote — o defeito que o t7 pegou", async () => {
    const classe = await prisma.classeDeMaterial.findFirstOrThrow({ select: { id: true } });
    const { grupoId } = await cadastrarGrupoDeMaterial(prisma, {
      codigo: "06", descricao: "Medicamentos C", criadoPor: POR,
    });
    const { materialId: remedioId } = await cadastrarMaterial(prisma, {
      codigo: "M012", descricaoSucinta: "Ibuprofeno", descricaoDetalhada: "Ibuprofeno 600mg",
      grupoId, classificacao: "CONSUMO", categoria: "PERECIVEL",
      classeDeMaterialId: classe.id, controlaLote: true,
      unidades: [{ unidadeDeMedidaId: unidadeId, fatorParaEstoque: "1", ehDeEstoque: true }],
      criadoPor: POR,
    });
    await entradaDe(remedioId, "10", "2.00", "2026-03-01", {
      loteIdentificacao: "L-2026-B",
      loteValidade: new Date("2026-09-01T12:00:00.000Z"),
    });

    await expect(
      registrarSaidaFisica(prisma, {
        materialId: remedioId, depositoId, quantidade: "1",
        dataMovimento: new Date("2026-03-05T15:00:00.000Z"),
        motivo: "saída sem dizer de qual lote", criadoPor: POR,
      })
    ).rejects.toThrow(/a saída não informou de qual/);
  });

  it("⚠️ RECUSA sair por lote de OUTRO depósito", async () => {
    const classe = await prisma.classeDeMaterial.findFirstOrThrow({ select: { id: true } });
    const { grupoId } = await cadastrarGrupoDeMaterial(prisma, {
      codigo: "07", descricao: "Medicamentos D", criadoPor: POR,
    });
    const { materialId: remedioId } = await cadastrarMaterial(prisma, {
      codigo: "M013", descricaoSucinta: "Paracetamol", descricaoDetalhada: "Paracetamol 750mg",
      grupoId, classificacao: "CONSUMO", categoria: "PERECIVEL",
      classeDeMaterialId: classe.id, controlaLote: true,
      unidades: [{ unidadeDeMedidaId: unidadeId, fatorParaEstoque: "1", ehDeEstoque: true }],
      criadoPor: POR,
    });
    await entradaDe(remedioId, "10", "2.00", "2026-03-01", {
      loteIdentificacao: "L-2026-C",
      loteValidade: new Date("2026-09-01T12:00:00.000Z"),
    });
    const alheio = await prisma.loteDeMaterial.create({
      data: {
        materialId: remedioId, depositoId: deposito2Id, identificacao: "L-2026-C",
        validade: new Date("2026-09-01T12:00:00.000Z"), criadoPor: POR,
      },
      select: { id: true },
    });

    await expect(
      registrarSaidaFisica(prisma, {
        materialId: remedioId, depositoId, quantidade: "1", loteId: alheio.id,
        dataMovimento: new Date("2026-03-05T15:00:00.000Z"),
        motivo: "saída pelo lote do outro depósito", criadoPor: POR,
      })
    ).rejects.toThrow(/de outro material ou de outro depósito/);
  });

  it("⚠️ RECUSA entrada sem lote em material que controla lote", async () => {
    const classe = await prisma.classeDeMaterial.findFirstOrThrow({ select: { id: true } });
    const { grupoId } = await cadastrarGrupoDeMaterial(prisma, {
      codigo: "05", descricao: "Medicamentos B", criadoPor: POR,
    });
    const { materialId: remedioId } = await cadastrarMaterial(prisma, {
      codigo: "M011", descricaoSucinta: "Amoxicilina", descricaoDetalhada: "Amoxicilina 500mg",
      grupoId, classificacao: "CONSUMO", categoria: "PERECIVEL",
      classeDeMaterialId: classe.id, controlaLote: true,
      unidades: [{ unidadeDeMedidaId: unidadeId, fatorParaEstoque: "1", ehDeEstoque: true }],
      criadoPor: POR,
    });

    await expect(
      registrarEntradaFisica(prisma, {
        materialId: remedioId, depositoId, quantidade: "10", valorUnitario: "2.00",
        dataMovimento: new Date("2026-03-01T15:00:00.000Z"),
        motivo: "entrada sem lote", criadoPor: POR,
      })
    ).rejects.toThrow(/controla LOTE/);
  });
});

describe("t8 · ⚠️ A AUTORIZAÇÃO É DO SERVIDOR — e ela é cobrada por AÇÃO", () => {
  it("usuário sem a ação é recusado, e nada é gravado", async () => {
    await entrada("100", "5.00", "2026-03-01");
    const antes = await prisma.movimentoFisicoDeEstoque.count();

    await expect(
      registrarSaidaFisica(prisma, {
        materialId, depositoId, quantidade: "1",
        dataMovimento: new Date("2026-03-10T15:00:00.000Z"),
        motivo: "saída sem permissão", criadoPor: SEM_PERMISSAO,
      })
    ).rejects.toThrow();

    expect(await prisma.movimentoFisicoDeEstoque.count()).toBe(antes);
  });

  it("usuário inexistente é recusado — fail-closed, não 'permite por omissão'", async () => {
    await expect(
      cadastrarDeposito(prisma, {
        codigo: "DEP99", nome: "Fantasma", unidadeOrcId: "uo-01",
        criadoPor: "ninguem@cg.pb.gov.br",
      })
    ).rejects.toThrow();
  });
});

describe("t9 · a amarração dos dois eixos, conferida", () => {
  it("Σ dos movimentos físicos de saída == saldo da classe consumido no razão", async () => {
    await entrada("100", "5.00", "2026-03-01");
    await entrada("100", "9.00", "2026-03-05");
    await registrarSaidaFisica(prisma, {
      materialId, depositoId, quantidade: "50",
      dataMovimento: new Date("2026-03-10T15:00:00.000Z"),
      motivo: "consumo do setor", criadoPor: POR,
    });

    // ⚠️ ESTA É A AMARRAÇÃO, E ELA FICOU MELHOR DO QUE EU TINHA ESCRITO.
    //
    // A primeira versão deste teste esperava −350,00, porque o helper de entrada não
    // passava pela liquidação e o razão nunca via o estoque entrar. Com o fluxo real —
    // liquidar (D estoque 1.400) e depois consumir (C estoque 350) — o saldo contábil é
    // 1.050,00. E 1.050,00 é EXATAMENTE o valor da posição física.
    //
    // A propriedade que vale não é o número: é a IGUALDADE entre os dois eixos. Escrita
    // como número, ela passaria a mentir no dia em que alguém mudasse o cenário.
    const saldo = await saldoDaClasseDeMaterial(prisma, classeId);
    const fisica = await posicaoDoMaterial(prisma, materialId, depositoId);
    expect(saldo.toFixed(2)).toBe("1050.00");
    expect(
      fisica.valor.toFixed(2),
      "o valor da posição física divergiu do saldo contábil da classe — os dois eixos " +
        "deixaram de contar a mesma coisa, que é o defeito que a amarração existe para pegar"
    ).toBe(saldo.toFixed(2));
  });
});
