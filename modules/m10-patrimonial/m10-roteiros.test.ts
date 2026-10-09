import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import {
  parametrizarRoteiroAlmoxarifado,
  parametrizarRoteiroPatrimonial,
  parametrizarRoteiroResultadoAlienacao,
  TIPOS_DO_ROTEIRO_ALMOXARIFADO,
  versaoVigente,
} from "./roteiros.js";
import { cadastrarClasseDeMaterial, registrarAjusteAlmoxarifado } from "./almoxarifado.js";

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

// ⚠️ V3 (4.5): a parametrização grava VERSÕES (append-only); a tabela legada fica só-leitura.
async function quantosRoteiros(): Promise<number> {
  return prisma.versaoDeRoteiro.count({ where: { familia: "PATRIMONIAL" } });
}
async function vigente(tipo: string): Promise<{ contaDebito: string; contaCredito: string }> {
  const v = await versaoVigente(prisma, "PATRIMONIAL", tipo);
  if (v === null) throw new Error(`sem versão vigente para ${tipo}`);
  const [d, c] = await Promise.all([
    prisma.contaPcasp.findUniqueOrThrow({ where: { codigo: v.contaDebito }, select: { id: true } }),
    prisma.contaPcasp.findUniqueOrThrow({ where: { codigo: v.contaCredito }, select: { id: true } }),
  ]);
  return { contaDebito: d.id, contaCredito: c.id };
}

describe("t1 · o roteiro se parametriza, e grava o par informado", () => {
  it("grava débito e crédito, e o evento passa a ter roteiro", async () => {
    const { roteiroId, substituiu } = await parametrizarRoteiroPatrimonial(prisma, AVALIACAO);
    expect(substituiu).toBe(false);

    const gravado = await prisma.versaoDeRoteiro.findUniqueOrThrow({
      where: { id: roteiroId },
      select: { chave: true, numero: true, contaDebitoId: true, contaCreditoId: true, criadoPor: true, situacao: true, publicadaPor: true },
    });
    expect(gravado.chave).toBe("AVALIACAO_INICIAL");
    expect(gravado.numero).toBe(1);
    expect(gravado.contaDebitoId).toBe("c-ativo");
    expect(gravado.contaCreditoId).toBe("c-vpa");
    expect(gravado.criadoPor).toBe(POR);
    // O ato composto propõe E publica: a versão nasce em vigor, e o resolvedor a enxerga.
    expect(gravado.situacao).toBe("PUBLICADA");
    expect(gravado.publicadaPor).toBe(POR);
    expect((await vigente("AVALIACAO_INICIAL")).contaDebito).toBe("c-ativo");
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

    const depois = await vigente("AVALIACAO_INICIAL");
    expect(depois.contaDebito, "a tentativa recusada não pode ter trocado nada").toBe("c-ativo");
    expect(await quantosRoteiros()).toBe(1);
  });

  it("t8: com `substituir`, as contas trocam — e a versão anterior FICA, com autor e momento (V3 4.5)", async () => {
    await parametrizarRoteiroPatrimonial(prisma, AVALIACAO);
    const { substituiu } = await parametrizarRoteiroPatrimonial(prisma, {
      ...AVALIACAO,
      contaDebitoId: "c-ativo2",
      substituir: true,
    });
    expect(substituiu).toBe(true);

    // ⚠️ ANTES ISTO ERA "continua havendo UMA linha": a substituição sobrescrevia a versão
    // anterior em silêncio. Agora são DUAS versões, e a vigente é a segunda.
    const versoes = await prisma.versaoDeRoteiro.findMany({
      where: { familia: "PATRIMONIAL", chave: "AVALIACAO_INICIAL" },
      orderBy: { numero: "asc" },
      select: { numero: true, contaDebitoId: true, situacao: true, criadoPor: true },
    });
    expect(versoes.map((v) => [v.numero, v.contaDebitoId, v.situacao])).toEqual([
      [1, "c-ativo", "PUBLICADA"],
      [2, "c-ativo2", "PUBLICADA"],
    ]);
    expect((await vigente("AVALIACAO_INICIAL")).contaDebito).toBe("c-ativo2");
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

    const avaliacao = await vigente("AVALIACAO_INICIAL");
    const depreciacao = await vigente("DEPRECIACAO");

    expect(avaliacao.contaDebito).toBe("c-ativo2");
    expect(depreciacao.contaDebito, "a depreciação não foi tocada").toBe("c-vpd");
    expect(depreciacao.contaCredito).toBe("c-ativo");
    // três versões: avaliação 1 e 2, depreciação 1 — a substituição não apaga a anterior.
    expect(await quantosRoteiros()).toBe(3);
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

    expect(await prisma.versaoDeRoteiro.count({ where: { familia: "RESULTADO_ALIENACAO" } })).toBe(2);

    const ganho = await versaoVigente(prisma, "RESULTADO_ALIENACAO", "GANHO_ALIENACAO");
    expect(ganho?.contaDebito).toBe("1.2.3.1.1.01.00"); // o código de "c-ativo" na fixture
    const perda = await versaoVigente(prisma, "RESULTADO_ALIENACAO", "PERDA_ALIENACAO");
    expect(perda?.contaDebito).not.toBe(ganho?.contaDebito);
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

describe("V37 · o roteiro do almoxarifado se parametriza pela tela (antes, nenhum escritor)", () => {
  const estoque = async (): Promise<void> => {
    await prisma.contaPcasp.create({ data: { id: "c-estoque", codigo: "1.1.5.6.1.01.00", nome: "Material de consumo", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true, indicadorSuperavit: "P" } });
  };

  it("t-alm1: o rol é o dos movimentos com lançamento próprio, sem estorno nem entrada", () => {
    expect([...TIPOS_DO_ROTEIRO_ALMOXARIFADO].sort()).toEqual(["AJUSTE_ENTRADA", "AJUSTE_SAIDA", "SAIDA_CONSUMO"]);
  });

  it("t-alm2: grava dois tipos com pares próprios (N=2), e o ajuste passa a lançar pelas contas escolhidas", async () => {
    await estoque();
    // Antes do roteiro, o ajuste de sobra é recusado nomeando o movimento e a tela onde se cadastra.
    const { classeDeMaterialId } = await cadastrarClasseDeMaterial(prisma, { codigo: "30.01", descricao: "Expediente", contaContabilId: "c-estoque", criadoPor: POR });
    const sobra = { classeDeMaterialId, sentido: "SOBRA" as const, valor: "120.00", dataMovimento: new Date("2026-06-01T15:00:00Z"), motivo: "inventário", criadoPor: POR };
    await expect(registrarAjusteAlmoxarifado(prisma, sobra)).rejects.toThrow(/roteiro contábil cadastrado para o ajuste de inventário por sobra[\s\S]*Roteiros contábeis do almoxarifado/);

    await parametrizarRoteiroAlmoxarifado(prisma, { tipo: "AJUSTE_ENTRADA", contaDebitoId: "c-estoque", contaCreditoId: "c-vpa", criadoPor: POR });
    await parametrizarRoteiroAlmoxarifado(prisma, { tipo: "SAIDA_CONSUMO", contaDebitoId: "c-vpd", contaCreditoId: "c-estoque", criadoPor: POR });
    // A ordem do enum no banco é a da declaração; ordena-se aqui pelo nome.
    // V37 — gravados como VERSÃO 1 publicada da família do almoxarifado (a tabela antiga não recebe linha nova).
    const gravados = (await prisma.versaoDeRoteiro.findMany({ where: { familia: "ALMOXARIFADO" }, select: { chave: true, numero: true, situacao: true, contaDebitoId: true, contaCreditoId: true, criadoPor: true } })).sort((x, y) => x.chave.localeCompare(y.chave));
    expect(gravados).toEqual([
      { chave: "AJUSTE_ENTRADA", numero: 1, situacao: "PUBLICADA", contaDebitoId: "c-estoque", contaCreditoId: "c-vpa", criadoPor: POR },
      { chave: "SAIDA_CONSUMO", numero: 1, situacao: "PUBLICADA", contaDebitoId: "c-vpd", contaCreditoId: "c-estoque", criadoPor: POR },
    ]);
    expect(await prisma.roteiroAlmoxarifado.count()).toBe(0);

    // O EFEITO: com o roteiro, a mesma sobra lança D estoque / C VPA pelas contas escolhidas. A falta, sem roteiro
    // próprio (N=2 tipos), continua recusada com o motivo.
    const { lancamentoId } = await registrarAjusteAlmoxarifado(prisma, sobra);
    const partidas = await prisma.partidaContabil.findMany({ where: { lancamentoId }, select: { contaId: true, tipo: true } });
    expect(partidas.map((x) => `${x.tipo}:${x.contaId}`).sort()).toEqual(["CREDITO:c-vpa", "DEBITO:c-estoque"]);
    await expect(registrarAjusteAlmoxarifado(prisma, { ...sobra, sentido: "FALTA", valor: "1.00" })).rejects.toThrow(/roteiro contábil cadastrado para o ajuste de inventário por falta/);
  });

  it("t-alm3: as recusas dizem o motivo — tipo sem roteiro próprio, tipo já parametrizado, mesma conta, sintética, sem permissão", async () => {
    await estoque();
    await expect(parametrizarRoteiroAlmoxarifado(prisma, { tipo: "ESTORNO_SAIDA_CONSUMO", contaDebitoId: "c-estoque", contaCreditoId: "c-vpd", criadoPor: POR })).rejects.toThrow(/não tem roteiro próprio/);
    await expect(parametrizarRoteiroAlmoxarifado(prisma, { tipo: "ENTRADA", contaDebitoId: "c-estoque", contaCreditoId: "c-vpa", criadoPor: POR })).rejects.toThrow(/entrada é lançada pela liquidação/);
    await expect(parametrizarRoteiroAlmoxarifado(prisma, { tipo: "AJUSTE_SAIDA", contaDebitoId: "c-estoque", contaCreditoId: "c-estoque", criadoPor: POR })).rejects.toThrow(/MESMA conta/);
    await expect(parametrizarRoteiroAlmoxarifado(prisma, { tipo: "AJUSTE_SAIDA", contaDebitoId: "c-vpd", contaCreditoId: "c-sintetica", criadoPor: POR })).rejects.toThrow(/SINTÉTICA/);
    await expect(parametrizarRoteiroAlmoxarifado(prisma, { tipo: "AJUSTE_SAIDA", contaDebitoId: "c-vpd", contaCreditoId: "c-estoque", criadoPor: SEM_PERMISSAO })).rejects.toThrow(/PARAMETRIZAR_ROTEIRO_PATRIMONIAL|permiss/i);
    // Cada um dos dois crachás é exigido: só parametrizar não basta (o roteiro vigora na hora), só publicar também não.
    for (const [ident, acao] of [["so-parametriza@cg.pb.gov.br", "PARAMETRIZAR_ROTEIRO_PATRIMONIAL"], ["so-publica@cg.pb.gov.br", "PUBLICAR_ROTEIRO_PATRIMONIAL"]] as const) {
      const u = await prisma.usuario.create({ data: { identificador: ident, nome: ident, criadoPor: POR }, select: { id: true } });
      const p = await prisma.perfil.create({ data: { nome: `perfil-${ident}`, descricao: "teste", criadoPor: POR }, select: { id: true } });
      await prisma.permissaoDePerfil.create({ data: { perfilId: p.id, acao, unidadeOrcId: null, criadoPor: POR } });
      await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: POR } });
      const falta = acao === "PARAMETRIZAR_ROTEIRO_PATRIMONIAL" ? "PUBLICAR_ROTEIRO_PATRIMONIAL" : "PARAMETRIZAR_ROTEIRO_PATRIMONIAL";
      await expect(parametrizarRoteiroAlmoxarifado(prisma, { tipo: "AJUSTE_SAIDA", contaDebitoId: "c-vpd", contaCreditoId: "c-estoque", criadoPor: ident })).rejects.toThrow(new RegExp(falta));
    }
    const versoes = (): Promise<number> => prisma.versaoDeRoteiro.count({ where: { familia: "ALMOXARIFADO" } });
    expect(await versoes()).toBe(0);

    await parametrizarRoteiroAlmoxarifado(prisma, { tipo: "AJUSTE_SAIDA", contaDebitoId: "c-vpd", contaCreditoId: "c-estoque", criadoPor: POR });
    await expect(parametrizarRoteiroAlmoxarifado(prisma, { tipo: "AJUSTE_SAIDA", contaDebitoId: "c-vpd", contaCreditoId: "c-ativo", criadoPor: POR })).rejects.toThrow(/JÁ TEM roteiro: débito em 3\.3\.3\.1\.1\.01\.00[\s\S]*Trocar as contas de um roteiro já cadastrado/);
    expect(await versoes()).toBe(1);
  });

  it("t-alm4: trocar as contas é versão nova (N=2 trocas, a partir da linha antiga); o movimento seguinte lança pelas novas, o já lançado não muda", async () => {
    await estoque();
    const { classeDeMaterialId } = await cadastrarClasseDeMaterial(prisma, { codigo: "30.01", descricao: "Expediente", contaContabilId: "c-estoque", criadoPor: POR });
    // A linha gravada antes das versões continua valendo enquanto não houver versão.
    await prisma.roteiroAlmoxarifado.create({ data: { tipo: "AJUSTE_ENTRADA", contaDebitoId: "c-estoque", contaCreditoId: "c-vpa", criadoPor: POR } });
    const sobra = (valor: string, dia: string) => registrarAjusteAlmoxarifado(prisma, { classeDeMaterialId, sentido: "SOBRA", valor, dataMovimento: new Date(`${dia}T15:00:00Z`), motivo: "inventário", criadoPor: POR });
    const contas = async (lancamentoId: string) => (await prisma.partidaContabil.findMany({ where: { lancamentoId }, select: { contaId: true, tipo: true } })).map((x) => `${x.tipo}:${x.contaId}`).sort();

    const l1 = (await sobra("10.00", "2026-06-01")).lancamentoId;
    expect(await contas(l1)).toEqual(["CREDITO:c-vpa", "DEBITO:c-estoque"]);

    // Sem marcar a troca, o roteiro antigo recusa; com as mesmas contas, também.
    await expect(parametrizarRoteiroAlmoxarifado(prisma, { tipo: "AJUSTE_ENTRADA", contaDebitoId: "c-ativo", contaCreditoId: "c-vpa", criadoPor: POR })).rejects.toThrow(/JÁ TEM roteiro: débito em 1\.1\.5\.6\.1\.01\.00/);
    await expect(parametrizarRoteiroAlmoxarifado(prisma, { tipo: "AJUSTE_ENTRADA", contaDebitoId: "c-estoque", contaCreditoId: "c-vpa", substituir: true, criadoPor: POR })).rejects.toThrow(/já usa estas duas contas\. Nada foi gravado\./);

    const t1 = await parametrizarRoteiroAlmoxarifado(prisma, { tipo: "AJUSTE_ENTRADA", contaDebitoId: "c-ativo", contaCreditoId: "c-vpa", substituir: true, criadoPor: POR });
    expect(t1.substituiu).toBe(true);
    const l2 = (await sobra("20.00", "2026-06-02")).lancamentoId;
    expect(await contas(l2)).toEqual(["CREDITO:c-vpa", "DEBITO:c-ativo"]);

    await parametrizarRoteiroAlmoxarifado(prisma, { tipo: "AJUSTE_ENTRADA", contaDebitoId: "c-estoque", contaCreditoId: "c-vpa", substituir: true, criadoPor: POR });
    const l3 = (await sobra("30.00", "2026-06-03")).lancamentoId;
    expect(await contas(l3)).toEqual(["CREDITO:c-vpa", "DEBITO:c-estoque"]);

    // O já lançado não muda, e o histórico guarda as duas versões, com motivo.
    expect([await contas(l1), await contas(l2)]).toEqual([["CREDITO:c-vpa", "DEBITO:c-estoque"], ["CREDITO:c-vpa", "DEBITO:c-ativo"]]);
    expect(await prisma.versaoDeRoteiro.findMany({ where: { familia: "ALMOXARIFADO", chave: "AJUSTE_ENTRADA" }, orderBy: { numero: "asc" }, select: { numero: true, contaDebitoId: true, motivo: true } })).toEqual([
      { numero: 1, contaDebitoId: "c-ativo", motivo: "Parametrização direta (substituição das contas)" },
      { numero: 2, contaDebitoId: "c-estoque", motivo: "Parametrização direta (substituição das contas)" },
    ]);
    // O outro movimento (N=2 chaves) segue sem roteiro.
    await expect(registrarAjusteAlmoxarifado(prisma, { classeDeMaterialId, sentido: "FALTA", valor: "1.00", dataMovimento: new Date("2026-06-04T15:00:00Z"), motivo: "inventário", criadoPor: POR })).rejects.toThrow(/ajuste de inventário por falta/);
  });
});
