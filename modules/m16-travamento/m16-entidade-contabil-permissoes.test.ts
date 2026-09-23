import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { AREA_DA_ACAO } from "../../lib/portas/navegacao-permissoes.js";
import { bootstrapUsuario } from "../../prisma/seed/bootstrap-usuario.js";
import {
  aplicarAtualizacaoDePermissoes,
  derivarEntidadeContabil,
  type PerfilComPermissoes,
} from "./atualizacoes-de-permissoes.js";

/**
 * ═══ V11 V9 — INSTALAÇÃO LIMPA E ATUALIZAÇÃO, PARA AS TRÊS AÇÕES DA ENTIDADE CONTÁBIL ═══
 *
 * ⚠️ NÃO É OPCIONAL, E O MOTIVO É ONDE O BURACO APARECERIA. Mudança de censo, de perfis ou de
 * bootstrap só falha no ENTE NOVO — a instalação que nasce depois da mudança. Quem só mede no
 * banco de teste já semeado nunca vê.
 *
 * Duas perguntas, e elas são independentes:
 *   1. INSTALAÇÃO LIMPA — o bootstrap concede as três ações novas? E a prévia da v27 é ZERO
 *      num banco que já nasce com ela (porque não sobra nada a derivar)?
 *   2. ATUALIZAÇÃO — a v27 alcança SÓ quem administra permissões no global, e não se espalha
 *      por aproximação para quem já tem poderes vizinhos?
 *
 * ⚠️ A SEGUNDA É A QUE VALE MAIS, e é a que `derivarEntidadeContabil` promete no comentário: a
 * recusa de derivar `ATRIBUIR_ENTIDADE_A_ARRECADACAO` de quem já tem
 * `ATRIBUIR_CONTA_A_ARRECADACAO`. Mesma tela, mesmo operador, mesma disciplina — e poderes
 * diferentes, porque um erra contra um detector (a conciliação não fecha) e o outro erra contra
 * nada. Uma promessa em comentário que nenhum teste exerce é uma promessa que a próxima
 * refatoração apaga.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const AS_TRES = [
  "CADASTRAR_ENTIDADE_CONTABIL",
  "DECLARAR_TITULAR_DA_CONTA_BANCARIA",
  "ATRIBUIR_ENTIDADE_A_ARRECADACAO",
] as const;

describe("V11 V9 — a derivação da v27, pura (sem banco)", () => {
  /**
   * ⚠️ N=2 EM PERFIS, e os dois são o ponto: um administra permissões no global, o outro tem
   * exatamente o poder VIZINHO do qual seria "natural" derivar. Com um perfil só, a regra
   * passaria por vacuidade — não haveria de quem NÃO derivar.
   */
  const perfis: readonly PerfilComPermissoes[] = [
    {
      id: "p-admin",
      nome: "ADMINISTRA-PERMISSOES",
      permissoes: [{ acao: "CONCEDER_ACAO_A_PERFIL", unidadeOrcId: null }],
    },
    {
      id: "p-tesouraria",
      nome: "TESOURARIA",
      permissoes: [
        // O vizinho tentador: quem já arruma o vínculo bancário de uma guia do legado.
        { acao: "ATRIBUIR_CONTA_A_ARRECADACAO", unidadeOrcId: null },
        { acao: "REGISTRAR_ARRECADACAO", unidadeOrcId: null },
        { acao: "IMPORTAR_EXTRATO", unidadeOrcId: null },
      ],
    },
  ];

  it("t1: as três vão a quem administra permissões no global — e só a ele", () => {
    const d = derivarEntidadeContabil(perfis, AREA_DA_ACAO);
    expect(d.map((c) => `${c.perfilId} ${c.acao} ${c.unidadeOrcId ?? "G"}`).sort()).toEqual([
      "p-admin ATRIBUIR_ENTIDADE_A_ARRECADACAO G",
      "p-admin CADASTRAR_ENTIDADE_CONTABIL G",
      "p-admin DECLARAR_TITULAR_DA_CONTA_BANCARIA G",
    ]);
  });

  it("t2: quem tem ATRIBUIR_CONTA_A_ARRECADACAO NÃO recebe ATRIBUIR_ENTIDADE_A_ARRECADACAO", () => {
    /**
     * ⚠️ ESTE É O TESTE DA RECUSA, e ele é o conteúdo da regra — não um detalhe dela.
     *
     * Dizer EM QUE CONTA o dinheiro entrou erra contra um detector: a conciliação não fecha e
     * alguém percebe. Dizer DE QUEM ele é erra contra nada — vira caixa da autarquia virando
     * caixa da prefeitura numa consulta que ninguém confere contra extrato. Herdar o segundo do
     * primeiro entregaria a titularidade da receita a quem o ente autorizou a arrumar um
     * vínculo bancário.
     */
    const d = derivarEntidadeContabil(perfis, AREA_DA_ACAO);
    expect(d.some((c) => c.perfilId === "p-tesouraria")).toBe(false);
  });

  it("t3: IDEMPOTENTE — quem já tem as três não recebe nada de novo", () => {
    const jaTem: readonly PerfilComPermissoes[] = [
      {
        id: "p-admin",
        nome: "ADMINISTRA-PERMISSOES",
        permissoes: [
          { acao: "CONCEDER_ACAO_A_PERFIL", unidadeOrcId: null },
          ...AS_TRES.map((acao) => ({ acao, unidadeOrcId: null })),
        ],
      },
    ];
    expect(derivarEntidadeContabil(jaTem, AREA_DA_ACAO)).toEqual([]);
  });

  it("t4: o escopo é GLOBAL, e uma concessão por UG não conta como já ter", () => {
    // ⚠️ Uma permissão de UMA UG não cobre o ato SEM UG (ver `autorizacao.ts`). Se a regra
    // aceitasse a concessão por UG como "já tem", o perfil ficaria sem poder nenhum sobre um
    // ato do ENTE — e ninguém saberia, porque a v27 diria que aplicou.
    const porUg: readonly PerfilComPermissoes[] = [
      {
        id: "p-admin",
        nome: "ADMIN",
        permissoes: [
          { acao: "CONCEDER_ACAO_A_PERFIL", unidadeOrcId: null },
          { acao: "CADASTRAR_ENTIDADE_CONTABIL", unidadeOrcId: "ug-a" },
        ],
      },
    ];
    const d = derivarEntidadeContabil(porUg, AREA_DA_ACAO);
    expect(d.filter((c) => c.acao === "CADASTRAR_ENTIDADE_CONTABIL")).toHaveLength(1);
    expect(d[0]?.unidadeOrcId ?? "G").toBe("G");
  });

  it("t5: quem NÃO administra permissões no global não recebe — nem por UG", () => {
    const soUg: readonly PerfilComPermissoes[] = [
      {
        id: "p-chefe-de-ug",
        nome: "CHEFE-UG",
        permissoes: [{ acao: "CONCEDER_ACAO_A_PERFIL", unidadeOrcId: "ug-a" }],
      },
    ];
    // Conceder ação DENTRO de uma UG não é distribuir poder do ENTE.
    expect(derivarEntidadeContabil(soUg, AREA_DA_ACAO)).toEqual([]);
  });
});

describe("V11 V9 — instalação limpa e atualização (banco)", () => {
  beforeEach(async () => {
    await limparBanco(prisma);
    /**
     * ⚠️ O `limparBanco` SEMEIA os usuários de fixture, e o `bootstrapUsuario` RECUSA banco
     * povoado — corretamente, e a recusa dele é uma das boas do repositório: *"o bootstrap é
     * ato de INSTALAÇÃO, roda uma vez na vida do banco; um script re-executável capaz de
     * carimbar um administrador entregaria a chave-mestra a quem tivesse acesso ao shell."*
     *
     * Para provar a INSTALAÇÃO LIMPA é preciso um banco sem quadro de acesso nenhum. O
     * esvaziamento é feito aqui, pelo dono do banco de teste — mesmo recurso e mesma
     * justificativa do `m16-atualizacoes.test.ts`, que enfrentou exatamente isto.
     */
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "PermissaoDePerfil", "VinculoUsuarioPerfil", "CredencialDeUsuario", "SessaoAberta", "Perfil", "Usuario" CASCADE'
    );
  });

  it("t6: INSTALAÇÃO LIMPA — o bootstrap concede as três ações novas, no global", async () => {
    const r = await bootstrapUsuario(prisma, "senha-de-instalacao-com-tamanho-suficiente");

    const vinculos = await prisma.vinculoUsuarioPerfil.findMany({
      where: { usuario: { identificador: r.identificador } },
      select: { perfil: { select: { permissoes: { select: { acao: true, unidadeOrcId: true } } } } },
    });
    const concedidas = new Set(
      vinculos.flatMap((v) =>
        v.perfil.permissoes.map((p) => `${p.acao} ${p.unidadeOrcId ?? "G"}`)
      )
    );

    /**
     * ⚠️ AS TRÊS, E NO GLOBAL — E O MOTIVO NÃO ESTÁ NO NOME DESTE TESTE, então fica aqui:
     *
     * **uma ação nova que o bootstrap não conceda deixa o ente novo sem ninguém capaz de
     * usá-la NEM de concedê-la a outro — porque não se concede o que não se tem.**
     *
     * É o que impede alguém de "simplificar" este teste amanhã achando que bootstrap é detalhe
     * de seed. Não é: é a única porta de entrada de poder numa instalação que acabou de nascer.
     * Sem isto, a instalação limpa fica com um cadastro que existe na tela, recusa todo mundo no
     * servidor, e não tem como ser destravada por dentro.
     */
    for (const acao of AS_TRES) expect(concedidas.has(`${acao} G`)).toBe(true);
  });

  it("t7: ATUALIZAÇÃO — a v27 alcança quem administra no global, e NÃO o vizinho", async () => {
    const r = await bootstrapUsuario(prisma, "senha-de-instalacao-com-tamanho-suficiente");

    /**
     * ⚠️ O CENÁRIO DO UPGRADE PRECISA DE UM PERFIL QUE **NÃO** NASCEU COM AS TRÊS, senão a
     * atualização não tem o que derivar e o teste passa por vacuidade. Este é o perfil de antes
     * da V11 V9: ele arruma conta de guia do legado e não sabe nada de entidade.
     */
    const vizinho = await prisma.perfil.create({
      data: {
        nome: "TESOURARIA-LEGADA",
        descricao: "perfil de antes da entidade contábil",
        criadoPor: "TESTE",
        permissoes: {
          create: [
            { acao: "ATRIBUIR_CONTA_A_ARRECADACAO", unidadeOrcId: null, criadoPor: "TESTE" },
            { acao: "REGISTRAR_ARRECADACAO", unidadeOrcId: null, criadoPor: "TESTE" },
          ],
        },
      },
      select: { id: true },
    });

    await aplicarAtualizacaoDePermissoes(prisma, {
      versao: 27,
      criadoPor: r.identificador,
      areaDaAcao: AREA_DA_ACAO,
    });

    const doVizinho = await prisma.permissaoDePerfil.findMany({
      where: { perfilId: vizinho.id },
      select: { acao: true },
    });
    const acoesDoVizinho = new Set(doVizinho.map((p) => p.acao));

    // ⚠️ O QUE NÃO ENTROU, AFIRMADO UMA A UMA. "Não recebeu nada" seria compatível com a
    // atualização não ter rodado; isto afirma que ela rodou e que ele ficou de fora.
    for (const acao of AS_TRES) expect(acoesDoVizinho.has(acao)).toBe(false);
    // E o que ele já tinha continua lá — a atualização não revoga nada.
    expect(acoesDoVizinho.has("ATRIBUIR_CONTA_A_ARRECADACAO")).toBe(true);
  });

  it("t8: reaplicar a v27 é recusado nomeando — é o que preserva uma revogação deliberada", async () => {
    const r = await bootstrapUsuario(prisma, "senha-de-instalacao-com-tamanho-suficiente");
    await aplicarAtualizacaoDePermissoes(prisma, {
      versao: 27,
      criadoPor: r.identificador,
      areaDaAcao: AREA_DA_ACAO,
    });
    await expect(
      aplicarAtualizacaoDePermissoes(prisma, {
        versao: 27,
        criadoPor: r.identificador,
        areaDaAcao: AREA_DA_ACAO,
      })
    ).rejects.toThrow(/JÁ APLICADA/);
  });
});
