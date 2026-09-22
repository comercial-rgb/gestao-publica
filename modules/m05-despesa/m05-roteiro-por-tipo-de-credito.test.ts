import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import {
  CONTA_CREDITO_ADICIONAL_SUPLEMENTAR,
  CONTA_CREDITO_DISPONIVEL,
  CONTA_DOTACAO_INICIAL,
  semearRoteiroOrcamentario,
} from "../../test/roteiro-orcamentario.js";
import { criarM03Deps } from "../m03-creditos/adapter-prisma.js";
import { criarDecreto, criarLei, executarCredito } from "../m03-creditos/servico.js";
import { registrarMovimentoDotacao } from "./dotacao-razao.js";

/**
 * O ROTEIRO DO CRÉDITO ADICIONAL É PARTIDO POR TIPO DE CRÉDITO (V11 V7.1).
 *
 * ═══ O QUE ESTAVA ERRADO, E POR QUE NINGUÉM VIA ═══
 * `RoteiroOrcamentario.tipo` era `@unique` por tipo de MOVIMENTO, e `CREDITO_ADICIONAL` é
 * UM tipo de movimento: havia lugar para um roteiro só. Mas o plano oficial chama a
 * sintética `5.2.2.1.2` de **DOTAÇÃO ADICIONAL POR TIPO DE CREDITO** e a parte em
 * suplementar, especial e extraordinário. Com uma linha só, todo crédito especial e
 * extraordinário seria lançado na conta do suplementar — e o erro apareceria no balancete
 * e na remessa ao TCE, não aqui.
 *
 * ⚠️ ISSO NÃO DAVA TESTE VERMELHO POR UM MOTIVO INCÔMODO: o lançamento continuava
 * BALANCEADO (ΣD == ΣC, no subsistema certo). Um lançamento na conta errada fecha igual a
 * um lançamento na conta certa. Quem enxerga a diferença é quem compara a partida com a
 * classificação do ATO que a originou — que é o que t1 faz.
 *
 * ═══ FIXTURE N=2, DE PROPÓSITO ═══
 * A partição só se manifesta em CONJUNTO: com um único tipo de crédito, um roteiro
 * partido e um roteiro único se comportam de forma idêntica, e o teste passaria por
 * vacuidade. t1 abre DOIS créditos de tipos diferentes e exige contas diferentes.
 *
 * ⚠️ AS CONTAS DO ESPECIAL E DO EXTRAORDINÁRIO AQUI SÃO FIXTURE, NÃO CLASSIFICAÇÃO. O
 * plano parte cada um desses ramos em três analíticas (ABERTOS / REABERTOS / REABERTOS -
 * SUPLEMENTAÇÃO). Desde a V11 V8.8 o sistema SEPARA as duas primeiras — a abertura é lida do
 * decreto contra a lei e entra na chave do roteiro —, mas QUAL analítica de reabertura o ente usa
 * continua sendo decisão dele (`REABERTO-COM-SUPLEMENTACAO-NAO-DISTINGUIDO`). Em produção o seed
 * RECUSA esses roteiros; o helper de teste os semeia sob nomes `FIXTURE_*` justamente para que
 * isto se leia como andaime. O que t1 prova é a PARTIÇÃO, não a conta.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "orcamento@cg.pb.gov.br";
const FONTE = "fnt-500";

/** Os códigos das contas debitadas por todos os movimentos de uma ficha. */
async function debitosDa(fichaId: string): Promise<readonly string[]> {
  const partidas = await prisma.partidaContabil.findMany({
    where: { fichaId, tipo: "DEBITO" },
    select: { conta: { select: { codigo: true } } },
    orderBy: { id: "asc" },
  });
  return partidas.map((p) => p.conta.codigo);
}

async function abrirCredito(
  tipoCredito: "SUPLEMENTAR" | "ESPECIAL" | "EXTRAORDINARIO",
  fichaId: string,
  sufixo: string
): Promise<void> {
  const deps = criarM03Deps(prisma);
  const lei = await criarLei(
    {
      numero: `L-${sufixo}`,
      ano: 2026,
      tipoCredito,
      valorAutorizado: "5000.00",
      dataPublicacao: new Date("2026-02-01T12:00:00Z"),
      criadoPor: POR,
    },
    deps
  );
  const decreto = await criarDecreto(
    {
      leiId: lei,
      numero: `D-${sufixo}`,
      ano: 2026,
      data: new Date("2026-02-02T12:00:00Z"),
      // ⚠️ RECURSO NOVO, e não anulação: a perna de anulação continua sem roteiro
      // (pendência `ANULACAO-DE-DOTACAO-DOIS-CANCELAMENTOS-HOMONIMOS`), e usá-la aqui
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
      itens: [{ fichaId, tipo: "SUPLEMENTACAO", valor: "1000.00", fonteId: FONTE }],
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
  await prisma.acao.create({
    data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" },
  });
  await prisma.naturezaDespesa.create({
    data: {
      id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90",
      codElemento: "39", codigoCompleto: "339039", descricao: "Serviços PJ",
    },
  });
  await prisma.fonteRecurso.create({
    data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" },
  });
  // O crédito por recurso novo exige a disponibilidade DECLARADA da fonte (TR 4.37).
  await prisma.disponibilidadeRecursoNovo.create({
    data: {
      exercicio: 2026, fonteId: FONTE, origem: "EXCESSO_ARRECADACAO",
      valor: "100000.00", descricao: "Excesso apurado (fixture)", criadoPor: POR,
    },
  });

  const base = {
    exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-12",
    programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd", fonteId: FONTE,
  };
  await criarFichaDeTeste(prisma, { ...base, id: "ficha-a", numero: 1, subfuncaoId: "sub-361", valorDotado: "10000.00" });
  await criarFichaDeTeste(prisma, { ...base, id: "ficha-b", numero: 2, subfuncaoId: "sub-362", valorDotado: "10000.00" });
}

beforeEach(semear);

describe("o crédito adicional entra na conta do SEU tipo", () => {
  it("t1 — suplementar e especial debitam contas DIFERENTES (a partição, com N=2)", async () => {
    await abrirCredito("SUPLEMENTAR", "ficha-a", "supl");
    await abrirCredito("ESPECIAL", "ficha-b", "esp");

    // Cada ficha nasceu com a sua DOTACAO_INICIAL (10.000) e recebeu UM crédito adicional.
    const [inicialA, adicionalA] = await debitosDa("ficha-a");
    const [inicialB, adicionalB] = await debitosDa("ficha-b");

    expect(inicialA).toBe(CONTA_DOTACAO_INICIAL);
    expect(inicialB).toBe(CONTA_DOTACAO_INICIAL);

    // O suplementar vai para a analítica única do plano oficial.
    expect(adicionalA).toBe(CONTA_CREDITO_ADICIONAL_SUPLEMENTAR);

    // ⚠️ A AFIRMAÇÃO QUE IMPORTA: o especial NÃO caiu na conta do suplementar. É
    // exatamente isto que um roteiro único não conseguiria — e é por isto que a asserção
    // é de DIFERENÇA e não de igualdade a um código fixo: qual é a conta do especial é
    // pendência aberta, e cravá-la aqui transformaria a fixture em classificação.
    expect(adicionalB).not.toBe(adicionalA);
    expect(adicionalB).not.toBeUndefined();
  });

  it("t2 — tipo de crédito SEM roteiro é recusado NOMEANDO o tipo, e nada é gravado", async () => {
    await semearRoteiroOrcamentario(prisma);
    // ⚠️ A ABERTURA ENTRA NO `where` DESDE A V8.8, e não é detalhe: o helper passou a semear DUAS
    // linhas de EXTRAORDINARIO (ABERTO e REABERTO). Sem ela, o `findFirst` podia apagar a do
    // REABERTO e o teste mediria o silêncio — o crédito deste caso é de 2026 contra lei de 2026,
    // ou seja, ABERTO.
    const alvo = await prisma.roteiroOrcamentario.findFirstOrThrow({
      where: { tipo: "CREDITO_ADICIONAL", tipoCredito: "EXTRAORDINARIO", abertura: "ABERTO" },
      select: { id: true },
    });
    await prisma.roteiroOrcamentario.delete({ where: { id: alvo.id } });

    const antes = await prisma.movimentoDotacao.count();

    await expect(abrirCredito("EXTRAORDINARIO", "ficha-a", "extra")).rejects.toThrow(
      // ⚠️ E A MENSAGEM NOMEIA A ABERTURA. Quem lê a recusa precisa saber QUAL das duas linhas
      // falta: dizer só "EXTRAORDINARIO" mandaria a pessoa conferir um roteiro que existe.
      /ROTEIRO ORÇAMENTÁRIO NÃO PARAMETRIZADO para CREDITO_ADICIONAL do tipo EXTRAORDINARIO, ABERTO/
    );

    // ⚠️ E A RECUSA DESFEZ TUDO. O movimento é criado ANTES da consulta do roteiro; o que
    // o desfaz é a transação. Contar aqui é o que separa "recusou" de "recusou e deixou
    // meio fato no banco" — e um movimento de dotação sem perna no razão é o furo de
    // 46dfd5d voltando pela porta dos fundos.
    expect(await prisma.movimentoDotacao.count()).toBe(antes);
  });

  it("t3 — crédito adicional SEM tipo de crédito é recusado ANTES de gravar o movimento", async () => {
    await semearRoteiroOrcamentario(prisma);
    const antes = await prisma.movimentoDotacao.count();

    await expect(
      prisma.$transaction((tx) =>
        registrarMovimentoDotacao(tx, {
          fichaId: "ficha-a",
          tipo: "CREDITO_ADICIONAL",
          valor: "100.00",
          origemTipo: "TESTE",
          criadoPor: POR,
          data: new Date("2026-02-02T12:00:00Z"),
        })
      )
    ).rejects.toThrow(/CRÉDITO ADICIONAL SEM TIPO DE CRÉDITO/);

    expect(await prisma.movimentoDotacao.count()).toBe(antes);
  });

  it("t4 — tipo de crédito em movimento que não é crédito adicional é recusado nos DOIS lugares", async () => {
    await semearRoteiroOrcamentario(prisma);

    // No domínio, com motivo.
    await expect(
      prisma.$transaction((tx) =>
        registrarMovimentoDotacao(tx, {
          fichaId: "ficha-a",
          tipo: "RESERVA",
          valor: "100.00",
          origemTipo: "TESTE",
          criadoPor: POR,
          data: new Date("2026-02-02T12:00:00Z"),
          tipoCredito: "SUPLEMENTAR",
        })
      )
    ).rejects.toThrow(/TIPO DE CRÉDITO em movimento RESERVA/);

    // E no BANCO, que é quem impede — o domínio só explica. Um roteiro de RESERVA com
    // tipo de crédito ficaria invisível para a consulta (que procura o par com NULL) e o
    // movimento cairia com "não parametrizado" tendo a linha gravada.
    const reserva = await prisma.roteiroOrcamentario.findFirstOrThrow({
      where: { tipo: "RESERVA" },
      select: { id: true },
    });
    await expect(
      prisma.roteiroOrcamentario.update({
        where: { id: reserva.id },
        data: { tipoCredito: "SUPLEMENTAR" },
      })
    ).rejects.toThrow(/ck_roteiro_tipo_de_credito/);
  });

  it("t5 — dois roteiros do MESMO movimento sem tipo de crédito não cabem (o índice parcial)", async () => {
    /**
     * ⚠️ A ASSERÇÃO É SOBRE OS CAMPOS DO ÍNDICE, E ISSO NÃO É DETALHE (medido ao escrever).
     * São DOIS guardas diferentes nesta tabela, e só os campos os separam:
     *
     *   (`tipo`)                -> `uq_roteiro_sem_tipo_de_credito` (o parcial, prisma/sql)
     *   (`tipo`,`tipoCredito`)  -> `RoteiroOrcamentario_tipo_tipoCredito_key` (o do modelo)
     *
     * Afirmar só "deu erro de unicidade" deixaria este teste passar com o parcial APAGADO:
     * o composto continuaria acusando o par preenchido, o teste ficaria verde, e dois
     * DOTACAO_INICIAL entrariam em silêncio. É o motivo que se afirma, não o resultado.
     *
     * ⚠️ E É PELA MENSAGEM, NÃO PELO `meta.target`: MEDIDO neste Prisma (7.8), o P2002 de um
     * índice ÚNICO PARCIAL chega com `meta.target` indefinido — os campos vêm só no texto.
     */
    const camposDoErro = async (fn: () => Promise<unknown>): Promise<string> => {
      try {
        await fn();
      } catch (e) {
        expect((e as { code?: string }).code).toBe("P2002");
        const m = /Unique constraint failed on the fields: \(([^)]*)\)/.exec(String((e as Error).message));
        if (m === null) throw new Error(`P2002 sem lista de campos: ${String((e as Error).message)}`);
        // O Postgres devolve o campo camelCase entre aspas; a crase é do Prisma.
        return m[1]!.replaceAll("`", "").replaceAll('"', "").replaceAll(" ", "");
      }
      throw new Error("não recusou — a linha duplicada entrou no banco.");
    };

    await semearRoteiroOrcamentario(prisma);
    const original = await prisma.roteiroOrcamentario.findFirstOrThrow({
      where: { tipo: "DOTACAO_INICIAL" },
      select: { contaDebitoId: true, contaCreditoId: true },
    });

    // ⚠️ ESTE É O CASO QUE O `@@unique([tipo, tipoCredito])` **NÃO** PEGA: no Postgres dois
    // NULL são distintos, e a segunda linha entraria. Quem recusa é
    // `uq_roteiro_sem_tipo_de_credito`, em `prisma/sql/`. Sem este teste, apagar aquele
    // arquivo não deixaria rastro em lugar nenhum — e a consulta do roteiro passaria a
    // depender de qual linha o planejador devolvesse primeiro.
    expect(
      await camposDoErro(() =>
        prisma.roteiroOrcamentario.create({
          data: {
            tipo: "DOTACAO_INICIAL",
            contaDebitoId: original.contaDebitoId,
            contaCreditoId: original.contaCreditoId,
            criadoPor: "TESTE",
          },
        })
      )
      // ⚠️ A AFIRMAÇÃO MUDOU NA V11 V8.4, E O MODELO É QUE MUDOU — não o teste.
      //
      // O índice parcial era por `tipo`; passou a ser por `(tipo, versao)` quando o roteiro virou
      // VERSIONADO para o ente poder trocá-lo pela tela. Com a versão fora dele, a segunda versão
      // de um roteiro sem tipo de crédito colidiria com a primeira, e justamente os dois que o
      // ente mais precisa corrigir (DOTAÇÃO INICIAL e ANULAÇÃO) são desse grupo.
      //
      // O que o índice protege continua idêntico: dois roteiros do MESMO movimento na MESMA
      // versão não cabem. Sem ele, dois NULL seriam distintos no Postgres.
    ).toBe("tipo,versao");

    // E o par PREENCHIDO continua fechado pelo índice composto do modelo.
    const supl = await prisma.contaPcasp.findUniqueOrThrow({
      where: { codigo: CONTA_CREDITO_ADICIONAL_SUPLEMENTAR },
      select: { id: true },
    });
    const disp = await prisma.contaPcasp.findUniqueOrThrow({
      where: { codigo: CONTA_CREDITO_DISPONIVEL },
      select: { id: true },
    });
    expect(
      await camposDoErro(() =>
        prisma.roteiroOrcamentario.create({
          data: {
            tipo: "CREDITO_ADICIONAL",
            tipoCredito: "SUPLEMENTAR",
            contaDebitoId: supl.id,
            contaCreditoId: disp.id,
            criadoPor: "TESTE",
          },
        })
      )
      // Pelo mesmo motivo, o índice composto passou a incluir a versão.
    ).toBe("tipo,tipoCredito,versao");
  });
});
