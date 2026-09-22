import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { semearRoteiroOrcamentario } from "../../test/roteiro-orcamentario.js";
import { publicarRoteiroOrcamentario } from "../m05-despesa/servico-roteiro-orcamentario.js";
import { criarM03Deps } from "./adapter-prisma.js";
import { criarDecreto, criarLei, executarCredito } from "./servico.js";

/**
 * ═══ ABERTO E REABERTO ENTRAM EM CONTAS DIFERENTES (V11 V8.8), CONTRA BANCO ═══
 *
 * A pendência `ROTEIRO-SEM-DIMENSAO-DA-ABERTURA` dizia o que sobrou da V8.6: o sistema passou a
 * SABER se um crédito especial é aberto ou reaberto (a leitura do decreto contra a lei, CF art.
 * 167 § 2º), e a guarda impedia o decreto ilegal de nascer — mas o roteiro continuava chaveado por
 * (movimento, tipo de crédito). Saber e não usar: o reaberto do exercício seguinte lançava na
 * MESMA conta do aberto, que é exatamente a diferença que o tribunal lê.
 *
 * ⚠️ ISSO NÃO DAVA VERMELHO EM LUGAR NENHUM, pelo mesmo motivo incômodo da V7.1: o lançamento
 * seguia BALANCEADO. Uma partida na conta errada fecha igual a uma na conta certa. Quem enxerga a
 * diferença é quem compara a partida com a CLASSIFICAÇÃO DO ATO que a originou — t1.
 *
 * ═══ FIXTURE N=2, E ELA É O TESTE ═══
 * Com um crédito só, um roteiro partido pela abertura e um roteiro único se comportam de forma
 * idêntica: a asserção passaria por vacuidade. t1 abre DOIS créditos especiais — um do mesmo
 * exercício da lei, outro do exercício seguinte a uma lei de dezembro — e exige contas
 * DIFERENTES.
 *
 * ⚠️ E A ASSERÇÃO É DE DIFERENÇA, NÃO DE CÓDIGO FIXO. Qual analítica de reabertura o ente usa
 * (`REABERTOS` ou `REABERTOS - SUPLEMENTAÇÃO`) é decisão dele — cravar o código aqui transformaria
 * a fixture em classificação, que é o erro que este repositório já cometeu uma vez.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "orcamento@cg.pb.gov.br";
const CONTABIL = "contabil@cg.pb.gov.br";
const FONTE = "fnt-500";

/** Lei de FEVEREIRO: o decreto do mesmo ano é ABERTO. */
const PUBLICACAO_DE_FEVEREIRO = new Date("2026-02-01T12:00:00Z");
/** Lei de DEZEMBRO: dentro dos últimos quatro meses, então o decreto de 2027 é REABERTO. */
const PUBLICACAO_DE_DEZEMBRO = new Date("2026-12-10T12:00:00Z");

async function debitosDa(fichaId: string): Promise<readonly string[]> {
  const partidas = await prisma.partidaContabil.findMany({
    where: { fichaId, tipo: "DEBITO" },
    select: { conta: { select: { codigo: true } } },
    orderBy: { id: "asc" },
  });
  return partidas.map((p) => p.conta.codigo);
}

async function abrirEspecial(p: {
  readonly sufixo: string;
  readonly fichaId: string;
  readonly publicacao: Date;
  readonly decretoAno: number;
}): Promise<void> {
  const deps = criarM03Deps(prisma);
  const lei = await criarLei(
    {
      numero: `L-${p.sufixo}`,
      ano: 2026,
      tipoCredito: "ESPECIAL",
      valorAutorizado: "5000.00",
      dataPublicacao: p.publicacao,
      criadoPor: POR,
    },
    deps
  );
  const decreto = await criarDecreto(
    {
      leiId: lei,
      numero: `D-${p.sufixo}`,
      ano: p.decretoAno,
      data: new Date(`${p.decretoAno}-02-02T12:00:00Z`),
      // Recurso NOVO, e não anulação: a perna de anulação tem roteiro próprio, e usá-la aqui
      // faria o teste cair por um motivo que não é o que ele mede.
      origemRecurso: "EXCESSO_ARRECADACAO",
      criadoPor: POR,
    },
    deps
  );
  await executarCredito(
    {
      decretoId: decreto,
      criadoPor: POR,
      itens: [{ fichaId: p.fichaId, tipo: "SUPLEMENTACAO", valor: "1000.00", fonteId: FONTE }],
    },
    deps
  );
}

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "uo-01", codigo: "01001", descricao: "Educação", orgaoId: "org-01" },
  });
  await prisma.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educação" } });
  await prisma.subfuncao.createMany({
    data: [
      { id: "sub-361", codigo: "361", nome: "EF" },
      { id: "sub-362", codigo: "362", nome: "EM" },
    ],
  });
  await prisma.programa.create({ data: { id: "prg", codigo: "0012", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({
    data: {
      id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90",
      codElemento: "39", codigoCompleto: "339039", descricao: "Serviços PJ",
    },
  });
  await prisma.fonteRecurso.create({
    data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" },
  });
  // O crédito por recurso novo exige a disponibilidade DECLARADA da fonte (TR 4.37) — e o
  // reaberto executa no exercício SEGUINTE, que tem a sua própria apuração.
  await prisma.disponibilidadeRecursoNovo.createMany({
    data: [2026, 2027].map((exercicio) => ({
      exercicio, fonteId: FONTE, origem: "EXCESSO_ARRECADACAO" as const,
      valor: "100000.00", descricao: "Excesso apurado (fixture)", criadoPor: POR,
    })),
  });

  const base = {
    orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-12",
    programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd", fonteId: FONTE,
  };
  // ⚠️ DUAS FICHAS, EM DOIS EXERCÍCIOS: o crédito reaberto é incorporado ao orçamento do
  // exercício SUBSEQUENTE — é o que o § 2º manda, e é onde a despesa dele corre.
  await criarFichaDeTeste(prisma, { ...base, exercicio: 2026, id: "ficha-2026", numero: 1, subfuncaoId: "sub-361", valorDotado: "10000.00" });
  await criarFichaDeTeste(prisma, { ...base, exercicio: 2027, id: "ficha-2027", numero: 2, subfuncaoId: "sub-362", valorDotado: "10000.00" });

  const perfil = await prisma.perfil.create({
    data: {
      nome: "CONTABILIDADE", descricao: "CONTABILIDADE", criadoPor: "SEED",
      permissoes: { create: [{ acao: "PARAMETRIZAR_ROTEIRO_ORCAMENTARIO" as never, criadoPor: "SEED" }] },
    },
    select: { id: true },
  });
  const u = await prisma.usuario.create({
    data: { identificador: CONTABIL, nome: CONTABIL, criadoPor: "SEED" },
    select: { id: true },
  });
  await prisma.vinculoUsuarioPerfil.create({
    data: { usuarioId: u.id, perfilId: perfil.id, criadoPor: "SEED" },
  });
}

beforeEach(semear, 120_000);

const roteiroDe = (abertura: "ABERTO" | "REABERTO") =>
  prisma.roteiroOrcamentario.findFirstOrThrow({
    where: { tipo: "CREDITO_ADICIONAL", tipoCredito: "ESPECIAL", abertura },
    select: { id: true, contaDebito: { select: { codigo: true } } },
  });

describe("a abertura do crédito entra na chave do roteiro", () => {
  it("t1 — ABERTO e REABERTO debitam contas DIFERENTES (a partição, com N=2)", async () => {
    await abrirEspecial({ sufixo: "ab", fichaId: "ficha-2026", publicacao: PUBLICACAO_DE_FEVEREIRO, decretoAno: 2026 });
    await abrirEspecial({ sufixo: "re", fichaId: "ficha-2027", publicacao: PUBLICACAO_DE_DEZEMBRO, decretoAno: 2027 });

    // Cada ficha nasceu com a sua DOTACAO_INICIAL e recebeu UM crédito adicional.
    const [, adicionalAberto] = await debitosDa("ficha-2026");
    const [, adicionalReaberto] = await debitosDa("ficha-2027");

    expect(adicionalAberto).not.toBeUndefined();
    expect(adicionalReaberto).not.toBeUndefined();

    // ⚠️ A AFIRMAÇÃO QUE IMPORTA. Antes da V8.8 os dois eram a MESMA conta, e o balancete
    // fechava do mesmo jeito.
    expect(adicionalReaberto).not.toBe(adicionalAberto);

    // E cada um na conta do SEU roteiro — não só "diferentes", mas diferentes do jeito certo:
    // "diferentes" sozinho passaria se os dois estivessem trocados.
    expect(adicionalAberto).toBe((await roteiroDe("ABERTO")).contaDebito.codigo);
    expect(adicionalReaberto).toBe((await roteiroDe("REABERTO")).contaDebito.codigo);
  });

  it("t2 — sem o roteiro da SUA abertura, o crédito é recusado NOMEANDO-a, e nada é gravado", async () => {
    await prisma.roteiroOrcamentario.delete({ where: { id: (await roteiroDe("REABERTO")).id } });
    const antes = await prisma.movimentoDotacao.count();

    await expect(
      abrirEspecial({ sufixo: "re", fichaId: "ficha-2027", publicacao: PUBLICACAO_DE_DEZEMBRO, decretoAno: 2027 })
    ).rejects.toThrow(/NÃO PARAMETRIZADO para CREDITO_ADICIONAL do tipo ESPECIAL, REABERTO/);

    // ⚠️ E A RECUSA DESFEZ TUDO. O movimento é criado ANTES da consulta do roteiro; o que o
    // desfaz é a transação. Contar aqui separa "recusou" de "recusou e deixou meio fato".
    expect(await prisma.movimentoDotacao.count()).toBe(antes);
  });

  it("t2b — CONTRAPROVA: apagado o roteiro do REABERTO, o ABERTO continua passando", async () => {
    // Sem esta, t2 ficaria verde com uma leitura que recusa TUDO — e recusar tudo não é
    // classificar coisa nenhuma.
    await prisma.roteiroOrcamentario.delete({ where: { id: (await roteiroDe("REABERTO")).id } });
    await abrirEspecial({ sufixo: "ab", fichaId: "ficha-2026", publicacao: PUBLICACAO_DE_FEVEREIRO, decretoAno: 2026 });
    expect((await debitosDa("ficha-2026")).length).toBe(2);
  });

  it("t3 — a linha ANTERIOR à dimensão (abertura nula) NÃO é usada no lugar da que falta", async () => {
    // ⚠️ ESTE É O TESTE DO QUE **NÃO** SE FEZ. A saída fácil seria cair na linha de abertura nula
    // quando a da abertura não existe — nenhuma instalação quebraria. E seria a pendência inteira
    // de volta: o reaberto lançaria, em silêncio, na conta decidida quando a pergunta ainda não
    // existia. Fail-closed com o motivo é pior de usar e certo de ler.
    const reaberto = await roteiroDe("REABERTO");
    await prisma.roteiroOrcamentario.delete({ where: { id: reaberto.id } });
    const aberto = await roteiroDe("ABERTO");
    await prisma.roteiroOrcamentario.create({
      data: {
        tipo: "CREDITO_ADICIONAL", tipoCredito: "ESPECIAL", abertura: null, versao: 9,
        contaDebitoId: (await prisma.roteiroOrcamentario.findUniqueOrThrow({ where: { id: aberto.id }, select: { contaDebitoId: true } })).contaDebitoId,
        contaCreditoId: (await prisma.roteiroOrcamentario.findUniqueOrThrow({ where: { id: aberto.id }, select: { contaCreditoId: true } })).contaCreditoId,
        criadoPor: "LEGADO",
      },
    });

    await expect(
      abrirEspecial({ sufixo: "re", fichaId: "ficha-2027", publicacao: PUBLICACAO_DE_DEZEMBRO, decretoAno: 2027 })
    ).rejects.toThrow(/NÃO PARAMETRIZADO para CREDITO_ADICIONAL do tipo ESPECIAL, REABERTO/);
  });

  it("t4 — publicar o roteiro de um crédito que se parte EXIGE a abertura, e proíbe-a nos demais", async () => {
    const contas = await prisma.contaPcasp.findMany({
      where: { analitica: true }, take: 2, orderBy: { codigo: "asc" }, select: { codigo: true },
    });
    const fundamento = "Plano de contas do ente, quadro da dotacao adicional; orientacao do TCE-PB.";

    await expect(
      publicarRoteiroOrcamentario(prisma, {
        tipo: "CREDITO_ADICIONAL", tipoCredito: "ESPECIAL",
        contaDebitoCodigo: contas[0]!.codigo, contaCreditoCodigo: contas[1]!.codigo,
        fundamento, criadoPor: CONTABIL,
      })
    ).rejects.toThrow(/se parte em ABERTO e REABERTO/);

    await expect(
      publicarRoteiroOrcamentario(prisma, {
        tipo: "RESERVA", abertura: "ABERTO",
        contaDebitoCodigo: contas[0]!.codigo, contaCreditoCodigo: contas[1]!.codigo,
        fundamento, criadoPor: CONTABIL,
      })
    ).rejects.toThrow(/não se parte em ABERTO e REABERTO/);
  });

  it("t5 — e quem guarda por último é o BANCO: o CHECK recusa a abertura fora do ramo que se parte", async () => {
    // ⚠️ A GUARDA DE APLICAÇÃO NÃO É A ÚNICA PORTA. Um seed, um script de importação ou um
    // caso de uso futuro escrevem direto no modelo — e a linha entraria parecendo configuração,
    // com o movimento seguindo recusado e ninguém entendendo por quê.
    const aberto = await roteiroDe("ABERTO");
    const contas = await prisma.roteiroOrcamentario.findUniqueOrThrow({
      where: { id: aberto.id }, select: { contaDebitoId: true, contaCreditoId: true },
    });
    await expect(
      prisma.roteiroOrcamentario.create({
        data: {
          tipo: "RESERVA", tipoCredito: null, abertura: "REABERTO", versao: 7,
          contaDebitoId: contas.contaDebitoId, contaCreditoId: contas.contaCreditoId,
          criadoPor: "TESTE",
        },
      })
    ).rejects.toThrow(/ck_roteiro_abertura_so_de_credito_reabrivel/);
  });

  it("t6 — o SUPLEMENTAR não ganha a dimensão: ele não se reabre", async () => {
    // ⚠️ "Não se aplica" não é "não decidido". Exigir a abertura do suplementar inventaria uma
    // classificação que a norma não faz — e deixaria o movimento mais comum do sistema recusado
    // para sempre, à espera de uma decisão que não existe.
    await semearRoteiroOrcamentario(prisma);
    const supl = await prisma.roteiroOrcamentario.findMany({
      where: { tipo: "CREDITO_ADICIONAL", tipoCredito: "SUPLEMENTAR" },
      select: { abertura: true },
    });
    expect(supl.length).toBe(1);
    expect(supl[0]!.abertura).toBeNull();
  });
});
