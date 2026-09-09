import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  criarPrismaDeTeste,
  criarPrismaDoPapelDeRuntime,
  exigirBanco,
} from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarM19Deps } from "./adapter-prisma.js";
import { alterarPessoa, cadastrarPessoa, moverPapelDePessoa } from "./servico.js";
import type { M19Deps } from "./ports.js";

/**
 * M19 contra o banco — e ele roda pelo PAPEL DE RUNTIME, não pelo dono.
 *
 * ⚠️ ISSO É PARTE DO QUE O ARQUIVO PROVA. O cadastro de pessoas é append-only justamente
 * para não precisar de UPDATE; rodá-lo com o dono (que pode tudo) não mostraria se a
 * escolha se sustenta. Aqui ela é exercida: se algum caminho do M19 tentasse um UPDATE,
 * o banco recusaria e o teste cairia.
 *
 * O `dono` só semeia e limpa — truncar é poder que o runtime não tem, de propósito.
 */

const dono = criarPrismaDeTeste();
const app = criarPrismaDoPapelDeRuntime();

await exigirBanco(dono);
await exigirBanco(app);

const AUTOR = "ent01@cg.pb.gov.br";
const CNPJ = "11222333000181";
const CPF = "52998224725";

let deps: M19Deps;

beforeEach(async () => {
  await limparBanco(dono);
  deps = criarM19Deps(app);
});

afterAll(async () => {
  await app.$disconnect();
  await dono.$disconnect();
});

describe("M19 — cadastrar", () => {
  it("cria a pessoa e a primeira versão juntas, sob o papel restrito", async () => {
    const { pessoaId, versaoId } = await cadastrarPessoa(
      {
        documento: "11.222.333/0001-81",
        nome: "Fornecedor Alfa Ltda",
        nomeFantasia: "Alfa",
        municipio: "Campina Grande",
        uf: "pb",
        criadoPor: AUTOR,
      },
      deps
    );

    expect(pessoaId).toBeTruthy();
    expect(versaoId).toBeTruthy();

    const pessoa = await deps.pessoas.buscarPorId(pessoaId);
    expect(pessoa?.documento).toBe(CNPJ); // guardado SEM máscara
    expect(pessoa?.tipo).toBe("JURIDICA"); // derivado do documento
    expect(pessoa?.nome).toBe("Fornecedor Alfa Ltda");
    expect(pessoa?.ativa).toBe(true);
    expect(pessoa?.papeis).toEqual([]); // cadastrar não concede papel nenhum
  });

  it("o tipo sai do documento — CPF vira FISICA sem ninguém escolher", async () => {
    const { pessoaId } = await cadastrarPessoa(
      { documento: CPF, nome: "Maria da Silva", criadoPor: AUTOR },
      deps
    );
    expect((await deps.pessoas.buscarPorId(pessoaId))?.tipo).toBe("FISICA");
  });

  it("RECUSA documento já cadastrado, nomeando quem é", async () => {
    await cadastrarPessoa(
      { documento: CNPJ, nome: "Fornecedor Alfa Ltda", criadoPor: AUTOR },
      deps
    );

    await expect(
      cadastrarPessoa(
        // mesma empresa, digitada com máscara — a normalização é o que faz o guard valer
        { documento: "11.222.333/0001-81", nome: "Alfa Ltda", criadoPor: AUTOR },
        deps
      )
    ).rejects.toThrow(/já cadastrado para "Fornecedor Alfa Ltda"/);

    expect(await dono.pessoa.count()).toBe(1);
  });

  it("RECUSA documento com dígito verificador errado — nada é gravado", async () => {
    await expect(
      cadastrarPessoa(
        { documento: "11222333000180", nome: "Empresa Fantasma", criadoPor: AUTOR },
        deps
      )
    ).rejects.toThrow(/dígito verificador/i);

    expect(await dono.pessoa.count()).toBe(0);
  });

  it("RECUSA autor não cadastrado — a identidade é conferida antes de gravar", async () => {
    await expect(
      cadastrarPessoa(
        { documento: CNPJ, nome: "Fornecedor Alfa", criadoPor: "ninguem@lugar.nenhum" },
        deps
      )
    ).rejects.toThrow(/NÃO CADASTRADO/i);

    expect(await dono.pessoa.count()).toBe(0);
  });
});

describe("M19 — alterar é acrescentar versão, nunca reescrever", () => {
  it("a versão anterior CONTINUA no banco, e a vigente é a nova", async () => {
    const { pessoaId } = await cadastrarPessoa(
      {
        documento: CNPJ,
        nome: "Fornecedor Alfa Ltda",
        municipio: "Campina Grande",
        criadoPor: AUTOR,
      },
      deps
    );

    await alterarPessoa(
      {
        pessoaId,
        nome: "Fornecedor Alfa Ltda",
        municipio: "João Pessoa",
        ativa: true,
        motivo: "mudança de sede",
        criadoPor: AUTOR,
      },
      deps
    );

    const versoes = await dono.versaoDePessoa.findMany({
      where: { pessoaId },
      orderBy: { criadoEm: "asc" },
      select: { municipio: true, motivo: true },
    });

    // DUAS versões: a original intacta e a nova. É o histórico.
    expect(versoes.map((v) => v.municipio)).toEqual([
      "Campina Grande",
      "João Pessoa",
    ]);
    expect(versoes[0]?.motivo).toBeNull();
    expect(versoes[1]?.motivo).toBe("mudança de sede");
  });

  it("desativar é uma versão, com autor e motivo — não um interruptor sem história", async () => {
    const { pessoaId } = await cadastrarPessoa(
      { documento: CNPJ, nome: "Fornecedor Alfa Ltda", criadoPor: AUTOR },
      deps
    );

    await alterarPessoa(
      {
        pessoaId,
        nome: "Fornecedor Alfa Ltda",
        ativa: false,
        motivo: "encerrou as atividades",
        criadoPor: AUTOR,
      },
      deps
    );

    expect((await deps.pessoas.buscarPorId(pessoaId))?.ativa).toBe(false);

    const historico = await deps.pessoas.historico(pessoaId);
    expect(historico.versoes).toHaveLength(2);
    expect(historico.versoes[0]?.criadoPor).toBe(AUTOR);
    expect(historico.versoes[0]?.motivo).toBe("encerrou as atividades");
  });

  it("recusa alterar pessoa inexistente", async () => {
    await expect(
      alterarPessoa(
        {
          pessoaId: "nao-existe",
          nome: "Qualquer",
          ativa: true,
          motivo: "teste",
          criadoPor: AUTOR,
        },
        deps
      )
    ).rejects.toThrow(/não encontrada/i);
  });
});

describe("M19 — os papéis", () => {
  async function pessoa(): Promise<string> {
    const { pessoaId } = await cadastrarPessoa(
      { documento: CNPJ, nome: "Fornecedor Alfa Ltda", criadoPor: AUTOR },
      deps
    );
    return pessoaId;
  }

  it("conceder CREDOR torna a pessoa credora; encerrar a retira", async () => {
    const id = await pessoa();

    await moverPapelDePessoa(
      {
        pessoaId: id,
        papel: "CREDOR",
        movimento: "CONCEDIDO",
        data: new Date("2026-01-10T12:00:00Z"),
        criadoPor: AUTOR,
      },
      deps
    );
    expect((await deps.pessoas.buscarPorId(id))?.papeis).toEqual(["CREDOR"]);

    await moverPapelDePessoa(
      {
        pessoaId: id,
        papel: "CREDOR",
        movimento: "ENCERRADO",
        data: new Date("2026-04-10T12:00:00Z"),
        motivo: "contrato encerrado",
        criadoPor: AUTOR,
      },
      deps
    );
    expect((await deps.pessoas.buscarPorId(id))?.papeis).toEqual([]);

    // ...e os DOIS movimentos continuam no banco. O papel saiu; a história não.
    expect(await dono.movimentoDePapelDaPessoa.count({ where: { pessoaId: id } })).toBe(2);
  });

  it("recusa conceder um papel que já está vigente", async () => {
    const id = await pessoa();
    const mov = {
      pessoaId: id,
      papel: "CREDOR" as const,
      movimento: "CONCEDIDO" as const,
      data: new Date("2026-01-10T12:00:00Z"),
      criadoPor: AUTOR,
    };
    await moverPapelDePessoa(mov, deps);

    await expect(moverPapelDePessoa(mov, deps)).rejects.toThrow(/já exerce o papel/i);
    expect(await dono.movimentoDePapelDaPessoa.count({ where: { pessoaId: id } })).toBe(1);
  });

  it("recusa encerrar um papel que não existe", async () => {
    const id = await pessoa();
    await expect(
      moverPapelDePessoa(
        {
          pessoaId: id,
          papel: "SERVIDOR",
          movimento: "ENCERRADO",
          data: new Date("2026-01-10T12:00:00Z"),
          criadoPor: AUTOR,
        },
        deps
      )
    ).rejects.toThrow(/não exerce o papel/i);
  });

  it("SERVIDOR e CREDOR convivem e são independentes", async () => {
    const id = await pessoa();
    for (const papel of ["CREDOR", "SERVIDOR"] as const) {
      await moverPapelDePessoa(
        {
          pessoaId: id,
          papel,
          movimento: "CONCEDIDO",
          data: new Date("2026-01-10T12:00:00Z"),
          criadoPor: AUTOR,
        },
        deps
      );
    }
    expect((await deps.pessoas.buscarPorId(id))?.papeis).toEqual([
      "CREDOR",
      "SERVIDOR",
    ]);

    await moverPapelDePessoa(
      {
        pessoaId: id,
        papel: "CREDOR",
        movimento: "ENCERRADO",
        data: new Date("2026-02-10T12:00:00Z"),
        criadoPor: AUTOR,
      },
      deps
    );
    expect((await deps.pessoas.buscarPorId(id))?.papeis).toEqual(["SERVIDOR"]);
  });
});

describe("M19 — o cadastro não é mutável nem para quem tenta por fora", () => {
  it("o papel de runtime não consegue dar UPDATE numa versão de pessoa", async () => {
    const { pessoaId } = await cadastrarPessoa(
      { documento: CNPJ, nome: "Fornecedor Alfa Ltda", criadoPor: AUTOR },
      deps
    );
    const versao = await dono.versaoDePessoa.findFirstOrThrow({ where: { pessoaId } });

    await expect(
      app.versaoDePessoa.update({
        where: { id: versao.id },
        data: { nome: "OUTRO NOME, SEM HISTÓRICO" },
      })
    ).rejects.toThrow(/permission denied|permissão negada/i);

    await expect(
      app.movimentoDePapelDaPessoa.deleteMany({ where: { pessoaId } })
    ).rejects.toThrow(/permission denied|permissão negada/i);

    expect(
      (await dono.versaoDePessoa.findUniqueOrThrow({ where: { id: versao.id } })).nome
    ).toBe("Fornecedor Alfa Ltda");
  });
});
