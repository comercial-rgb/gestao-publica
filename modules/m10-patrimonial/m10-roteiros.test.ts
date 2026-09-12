import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import {
  parametrizarRoteiroPatrimonial,
  parametrizarRoteiroResultadoAlienacao,
} from "./roteiros.js";

/**
 * M10 — A PARAMETRIZAÇÃO DO ROTEIRO CONTÁBIL DO PATRIMÔNIO, CONTRA BANCO (ENT11).
 *
 * ⚠️ ESTE CASO DE USO NÃO EXISTIA, e a medição é o argumento: `RoteiroPatrimonial` tinha
 * ZERO linhas no banco de desenvolvimento, `RoteiroResultadoAlienacao` também, e
 * `MovimentoPatrimonial` também. Não é coincidência — `roteiroDoTipo` é fail-closed e recusa
 * todo movimento de um tipo sem roteiro. Os únicos escritores dessas tabelas eram os testes
 * (por `createMany` cru) e o seed da POC, que parametriza três dos treze tipos.
 *
 * ⚠️ A CONFERÊNCIA DAS CONTAS CHAMA O MOTOR DO M01, e o t4 é quem prova que isso não é
 * enfeite: uma conta de CONTROLE (classe 7) é recusada com a mensagem do próprio motor. Se
 * o serviço tivesse reescrito a regra ("classe 1 a 4") em vez de chamá-la, este teste
 * passaria igual — e divergiria no dia em que o MCASP mudasse uma classe. A prova de que é
 * o motor falando está no texto da recusa, que nomeia o subsistema.
 *
 * ⚠️ FIXTURE N=2 NO t10 E NO t11. A regra "um roteiro por evento" só se manifesta em
 * conjunto: com um tipo só, "o roteiro do tipo A não virou o roteiro do tipo B" passa por
 * vacuidade, porque não existe B.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

/**
 * ⚠️ O IDENTIFICADOR VEM DA LISTA SEMEADA, e não é inventado aqui. `limparBanco` chama
 * `semearUsuariosDeTeste`, que cria um rol fixo de usuários com TODAS as ações do censo —
 * `patrimonio@cg.pb.gov.br` é um deles. Um identificador novo não existe no banco, e o funil
 * do M01 o recusa antes de qualquer regra: "USUÁRIO NÃO CADASTRADO". O efeito é traiçoeiro,
 * porque a recusa é CORRETA e as onze asserções passam a medir a identidade em vez do que
 * dizem medir — foi assim que este arquivo falhou onze vezes na primeira execução.
 */
const POR = "patrimonio@cg.pb.gov.br";
const SEM_PERMISSAO = "estagiario@cg.pb.gov.br";

/**
 * ⚠️ CINCO CONTAS, E CADA UMA EXISTE PARA UMA NEGAÇÃO DIFERENTE. Uma fixture só com o par
 * bom provaria o caminho feliz e deixaria quatro recusas sem sujeito.
 */
async function semear(): Promise<void> {
  await limparBanco(prisma);

  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-ativo", codigo: "1.2.3.1.1.01.00", nome: "Bens moveis", naturezaSaldo: "DEVEDORA", nivel: 6, analitica: true, indicadorSuperavit: "P" },
      { id: "c-ativo2", codigo: "1.2.3.2.1.01.00", nome: "Bens imoveis", naturezaSaldo: "DEVEDORA", nivel: 6, analitica: true, indicadorSuperavit: "P" },
      { id: "c-vpd", codigo: "3.3.3.1.1.01.00", nome: "Depreciacao", naturezaSaldo: "DEVEDORA", nivel: 6, analitica: true, indicadorSuperavit: "P" },
      { id: "c-vpa", codigo: "4.6.3.9.1.00.00", nome: "Ganhos com incorporacao de ativos", naturezaSaldo: "CREDORA", nivel: 6, analitica: true, indicadorSuperavit: "P" },
      { id: "c-sintetica", codigo: "1.2.3.1.1", nome: "Bens moveis (sintetica)", naturezaSaldo: "DEVEDORA", nivel: 4, analitica: false, indicadorSuperavit: "P" },
      // ⚠️ A CONTA DE CONTROLE É O SUJEITO DO t4: ela é analítica e existe, então só o motor
      // pode recusá-la. É isso que separa "o serviço conferiu" de "o serviço reimplementou".
      { id: "c-controle", codigo: "7.1.1.1.1.00.00", nome: "Controles devedores", naturezaSaldo: "DEVEDORA", nivel: 6, analitica: true, indicadorSuperavit: "P" },
    ],
  });

  const perfilVazio = await prisma.perfil.create({
    data: { nome: "SEM_PODERES", descricao: "Perfil sem permissao alguma", criadoPor: POR },
    select: { id: true },
  });
  const estagiario = await prisma.usuario.create({
    data: { identificador: SEM_PERMISSAO, nome: SEM_PERMISSAO, criadoPor: POR },
    select: { id: true },
  });
  await prisma.vinculoUsuarioPerfil.create({
    data: { usuarioId: estagiario.id, perfilId: perfilVazio.id, criadoPor: POR },
  });
}

beforeEach(semear);

const AVALIACAO = {
  tipo: "AVALIACAO_INICIAL",
  contaDebitoId: "c-ativo",
  contaCreditoId: "c-vpa",
  criadoPor: POR,
};

async function quantosRoteiros(): Promise<number> {
  return prisma.roteiroPatrimonial.count();
}

describe("t1 · o roteiro se parametriza, e grava o par informado", () => {
  it("grava débito e crédito, e o evento passa a ter roteiro", async () => {
    const { roteiroId, substituiu } = await parametrizarRoteiroPatrimonial(prisma, AVALIACAO);
    expect(substituiu).toBe(false);

    const gravado = await prisma.roteiroPatrimonial.findUniqueOrThrow({
      where: { id: roteiroId },
      select: { tipo: true, contaDebitoId: true, contaCreditoId: true, criadoPor: true },
    });
    expect(gravado.tipo).toBe("AVALIACAO_INICIAL");
    expect(gravado.contaDebitoId).toBe("c-ativo");
    expect(gravado.contaCreditoId).toBe("c-vpa");
    expect(gravado.criadoPor).toBe(POR);
  });
});

describe("t2 a t6 · as recusas, cada uma nomeando o motivo, e nada fica gravado", () => {
  it("t2: RECUSA conta SINTÉTICA — ela não recebe lançamento", async () => {
    const antes = await quantosRoteiros();
    await expect(
      parametrizarRoteiroPatrimonial(prisma, { ...AVALIACAO, contaDebitoId: "c-sintetica" })
    ).rejects.toThrow(/é SINTÉTICA e não recebe lançamento/);
    expect(await quantosRoteiros()).toBe(antes);
  });

  it("t3: RECUSA conta INEXISTENTE — a conferência vem antes da escrita", async () => {
    const antes = await quantosRoteiros();
    await expect(
      parametrizarRoteiroPatrimonial(prisma, { ...AVALIACAO, contaCreditoId: "nao-existe" })
    ).rejects.toThrow(/não existe no plano de contas/);
    expect(await quantosRoteiros()).toBe(antes);
  });

  it("⚠️ t4: RECUSA conta de CONTROLE — e quem recusa é o MOTOR, não uma cópia da regra", async () => {
    const antes = await quantosRoteiros();
    const tentativa = parametrizarRoteiroPatrimonial(prisma, {
      ...AVALIACAO,
      contaDebitoId: "c-controle",
    });

    // A mensagem do motor nomeia o subsistema e a natureza de informação. Uma reimplementação
    // ("classe 1 a 4") produziria outro texto — é por isto que a asserção é sobre ELE.
    await expect(tentativa).rejects.toThrow(/subsistema declarado PATRIMONIAL/);
    await expect(
      parametrizarRoteiroPatrimonial(prisma, { ...AVALIACAO, contaDebitoId: "c-controle" })
    ).rejects.toThrow(/O motor contábil recusou/);
    expect(await quantosRoteiros()).toBe(antes);
  });

  it("t5: RECUSA débito e crédito na MESMA conta — fecharia sem mover nada", async () => {
    const antes = await quantosRoteiros();
    await expect(
      parametrizarRoteiroPatrimonial(prisma, { ...AVALIACAO, contaCreditoId: "c-ativo" })
    ).rejects.toThrow(/MESMA conta/);
    expect(await quantosRoteiros()).toBe(antes);
  });

  it("t6: RECUSA tipo de ESTORNO — o lançamento contrário é gerado, não parametrizado", async () => {
    const antes = await quantosRoteiros();
    await expect(
      parametrizarRoteiroPatrimonial(prisma, { ...AVALIACAO, tipo: "ESTORNO_AVALIACAO_INICIAL" })
    ).rejects.toThrow(/é um ESTORNO, e estorno NÃO tem roteiro próprio/);
    expect(await quantosRoteiros()).toBe(antes);
  });
});

describe("t7 e t8 · substituir é ato EXPLÍCITO", () => {
  it("⚠️ t7: parametrizar um evento que JÁ tem roteiro é recusado, nomeando o par vigente", async () => {
    await parametrizarRoteiroPatrimonial(prisma, AVALIACAO);

    const tentativa = parametrizarRoteiroPatrimonial(prisma, {
      ...AVALIACAO,
      contaDebitoId: "c-ativo2",
    });
    // A recusa diz QUAIS contas estão vigentes — é a informação de que quem digitou precisa
    // para decidir o passo seguinte. "Já existe" sozinho mandaria a pessoa adivinhar.
    await expect(tentativa).rejects.toThrow(/JÁ TEM roteiro/);

    const depois = await prisma.roteiroPatrimonial.findUniqueOrThrow({
      where: { tipo: "AVALIACAO_INICIAL" },
      select: { contaDebitoId: true },
    });
    expect(depois.contaDebitoId, "a tentativa recusada não pode ter trocado nada").toBe("c-ativo");
  });

  it("t8: com `substituir`, as contas trocam — e continua havendo UMA linha do evento", async () => {
    await parametrizarRoteiroPatrimonial(prisma, AVALIACAO);
    const { substituiu } = await parametrizarRoteiroPatrimonial(prisma, {
      ...AVALIACAO,
      contaDebitoId: "c-ativo2",
      substituir: true,
    });
    expect(substituiu).toBe(true);

    const linhas = await prisma.roteiroPatrimonial.findMany({
      where: { tipo: "AVALIACAO_INICIAL" },
      select: { contaDebitoId: true },
    });
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.contaDebitoId).toBe("c-ativo2");
  });
});

describe("t9 · a autorização", () => {
  it("RECUSA quem não tem a ação, nomeando a AÇÃO como o que faltou", async () => {
    const antes = await quantosRoteiros();
    await expect(
      parametrizarRoteiroPatrimonial(prisma, { ...AVALIACAO, criadoPor: SEM_PERMISSAO })
    ).rejects.toThrow(/PARAMETRIZAR_ROTEIRO_PATRIMONIAL/);
    expect(await quantosRoteiros()).toBe(antes);
  });
});

describe("t10 e t11 · N=2 — um roteiro por evento, e os eventos não se contaminam", () => {
  it("⚠️ t10: DOIS eventos, DOIS pares — e trocar um não mexe no outro", async () => {
    await parametrizarRoteiroPatrimonial(prisma, AVALIACAO);
    await parametrizarRoteiroPatrimonial(prisma, {
      tipo: "DEPRECIACAO",
      contaDebitoId: "c-vpd",
      contaCreditoId: "c-ativo",
      criadoPor: POR,
    });

    // A substituição de UM evento é o que expõe a contaminação: com um tipo só, "não mexeu no
    // outro" passaria por vacuidade.
    await parametrizarRoteiroPatrimonial(prisma, {
      ...AVALIACAO,
      contaDebitoId: "c-ativo2",
      substituir: true,
    });

    const avaliacao = await prisma.roteiroPatrimonial.findUniqueOrThrow({
      where: { tipo: "AVALIACAO_INICIAL" },
      select: { contaDebitoId: true, contaCreditoId: true },
    });
    const depreciacao = await prisma.roteiroPatrimonial.findUniqueOrThrow({
      where: { tipo: "DEPRECIACAO" },
      select: { contaDebitoId: true, contaCreditoId: true },
    });

    expect(avaliacao.contaDebitoId).toBe("c-ativo2");
    expect(depreciacao.contaDebitoId, "a depreciação não foi tocada").toBe("c-vpd");
    expect(depreciacao.contaCreditoId).toBe("c-ativo");
    expect(await quantosRoteiros()).toBe(2);
  });

  it("t11: ganho e perda da alienação são DOIS roteiros independentes", async () => {
    await parametrizarRoteiroResultadoAlienacao(prisma, {
      chave: "GANHO_ALIENACAO",
      contaDebitoId: "c-ativo",
      contaCreditoId: "c-vpa",
      criadoPor: POR,
    });
    await parametrizarRoteiroResultadoAlienacao(prisma, {
      chave: "PERDA_ALIENACAO",
      contaDebitoId: "c-vpd",
      contaCreditoId: "c-ativo",
      criadoPor: POR,
    });

    expect(await prisma.roteiroResultadoAlienacao.count()).toBe(2);

    const ganho = await prisma.roteiroResultadoAlienacao.findUniqueOrThrow({
      where: { chave: "GANHO_ALIENACAO" },
      select: { contaDebitoId: true, contaCreditoId: true },
    });
    expect(ganho.contaDebitoId).toBe("c-ativo");
    expect(ganho.contaCreditoId).toBe("c-vpa");
  });

  it("t11b: o resultado da alienação usa as MESMAS recusas — sintética é negada aqui também", async () => {
    await expect(
      parametrizarRoteiroResultadoAlienacao(prisma, {
        chave: "PERDA_ALIENACAO",
        contaDebitoId: "c-sintetica",
        contaCreditoId: "c-ativo",
        criadoPor: POR,
      })
    ).rejects.toThrow(/é SINTÉTICA e não recebe lançamento/);
    expect(await prisma.roteiroResultadoAlienacao.count()).toBe(0);
  });
});
