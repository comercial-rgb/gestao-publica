import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import {
  cadastrarNaturezaReceita,
  hierarquiaDaNaturezaReceita,
  normalizarCodigoNaturezaReceita,
} from "./ementario.js";

/**
 * ═══ O EMENTÁRIO DA RECEITA — O CADASTRO DAS NATUREZAS, CONTRA BANCO (V22) ═══
 *
 * ⚠️ FIXTURE N=2: IPTU e ITBI entram na mesma rodada, com os rótulos do extrato oficial
 * (`prisma/seed/dados/depara-impostos.test.ts`). Com uma natureza só, um serviço que gravasse
 * "a última descrição" ou confundisse os códigos passaria por vacuidade.
 *
 * ⚠️ A NEGAÇÃO AFIRMA O MOTIVO. O ator da negativa TEM crachá — o de registrar a guia —, e a
 * recusa tem de nomear a ação que falta. "Não gravou" seria compatível com o servidor
 * recusando por qualquer outra razão.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const PARAMETRIZA = "orcamento.ementario@cg.pb.gov.br";
const SO_ARRECADA = "so.arrecada.ementario@cg.pb.gov.br";

async function usuarioComAcao(identificador: string, perfil: string, acao: string): Promise<void> {
  const p = await prisma.perfil.create({
    data: {
      nome: perfil,
      descricao: perfil,
      criadoPor: "SEED",
      permissoes: { create: [{ acao: acao as never, criadoPor: "SEED" }] },
    },
    select: { id: true },
  });
  const u = await prisma.usuario.create({
    data: { identificador, nome: identificador, criadoPor: "SEED" },
    select: { id: true },
  });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "SEED" } });
}

beforeEach(async () => {
  await limparBanco(prisma);
  await usuarioComAcao(PARAMETRIZA, "ORCAMENTO_EMENTARIO", "PARAMETRIZAR_ROTEIRO_ORCAMENTARIO");
  await usuarioComAcao(SO_ARRECADA, "SO_ARRECADA_EMENTARIO", "REGISTRAR_ARRECADACAO");
}, 120_000);

const cadastrar = (codigo: string, descricao: string, por = PARAMETRIZA) =>
  cadastrarNaturezaReceita(prisma, { codigo, descricao, criadoPor: por });

describe("O ementário da receita", () => {
  it("t1: N=2 — IPTU e ITBI entram cada um com o SEU código e o SEU rótulo", async () => {
    // A hierarquia vem como o ementário a escreve (com pontos) num e em 8 dígitos no outro.
    const iptu = await cadastrar("1.1.1.8.01.1.1", "IPTU – Principal");
    const itbi = await cadastrar("11180141", "ITBI – Principal");

    expect(iptu.codigo).toBe("11180111");
    expect(itbi.codigo).toBe("11180141");
    expect(iptu.classificacao.origem).toBe("IMPOSTOS_TAXAS_CONTRIBUICOES_DE_MELHORIA");
    expect(iptu.classificacao.tipo).toBe("PRINCIPAL");

    // Persistência e recarga: o que está no banco é o que foi cadastrado, por código.
    const noBanco = await prisma.naturezaReceita.findMany({
      where: { codigo: { in: ["11180111", "11180141"] } },
      orderBy: { codigo: "asc" },
      select: { codigo: true, descricao: true },
    });
    expect(noBanco).toEqual([
      { codigo: "11180111", descricao: "IPTU – Principal" },
      { codigo: "11180141", descricao: "ITBI – Principal" },
    ]);
  });

  it("t2: duplicata é recusada nomeando a natureza que já está lá — e nada muda", async () => {
    await cadastrar("11180231", "ISSQN – Principal");
    await expect(cadastrar("1.1.1.8.02.3.1", "ISS outro rótulo")).rejects.toThrow(
      /1\.1\.1\.8\.02\.3\.1 já está cadastrada no ementário como "ISSQN – Principal"/
    );
    const linhas = await prisma.naturezaReceita.findMany({ where: { codigo: "11180231" }, select: { descricao: true } });
    expect(linhas).toEqual([{ descricao: "ISSQN – Principal" }]);
  });

  it("t3: código malformado é recusado pelo motivo certo, antes de gravar", async () => {
    const antes = await prisma.naturezaReceita.count();
    // forma: 7 dígitos
    await expect(cadastrar("1118011", "Sete dígitos")).rejects.toThrow(/8 DÍGITOS/);
    // caractere estranho
    await expect(cadastrar("1118-0111", "Com hífen")).rejects.toThrow(/use só dígitos/);
    // origem fora do rol da categoria corrente (1.8 não existe)
    await expect(cadastrar("18180111", "Origem inexistente")).rejects.toThrow(/origem "8" não existe na categoria 1/);
    // tipo reservado (8º dígito 7)
    await expect(cadastrar("11180117", "Tipo reservado")).rejects.toThrow(/tipo "7" \(8º dígito\) está RESERVADO/);
    // descrição vazia
    await expect(cadastrar("11180112", "  ")).rejects.toThrow(/Informe a descrição/);
    expect(await prisma.naturezaReceita.count()).toBe(antes);
  });

  it("t4: NEGAÇÃO — quem só registra a guia não cria o código em que a registra", async () => {
    const antes = await prisma.naturezaReceita.count();
    const recusa = cadastrar("11130311", "IRRF – Trabalho – Principal", SO_ARRECADA);
    await expect(recusa).rejects.toThrow(/ACESSO NEGADO/);
    await expect(cadastrar("11130311", "IRRF – Trabalho – Principal", SO_ARRECADA)).rejects.toThrow(
      new RegExp(`"${SO_ARRECADA.replaceAll(".", "\\.")}" não tem permissão para PARAMETRIZAR_ROTEIRO_ORCAMENTARIO`)
    );
    await expect(cadastrar("11130311", "IRRF – Trabalho – Principal", SO_ARRECADA)).rejects.toThrow(
      /nenhum dos perfis dele concede PARAMETRIZAR_ROTEIRO_ORCAMENTARIO/
    );
    expect(await prisma.naturezaReceita.count()).toBe(antes);
    expect(await prisma.naturezaReceita.findUnique({ where: { codigo: "11130311" } })).toBeNull();

    // E o mesmo cadastro, pelo ator com a ação, passa — a recusa era do crachá, não do dado.
    const ok = await cadastrar("11130311", "IRRF – Trabalho – Principal");
    expect(ok.codigo).toBe("11130311");
  });

  it("t5: normalização e hierarquia são inversas nos oito códigos do extrato", () => {
    for (const h of [
      "1.1.1.8.01.1.1", "1.1.1.8.01.1.2", "1.1.1.8.01.1.3", "1.1.1.8.01.1.4",
      "1.1.1.8.01.4.1", "1.1.1.8.02.3.1", "1.1.1.8.02.3.2", "1.1.1.3.03.1.1",
    ]) {
      expect(hierarquiaDaNaturezaReceita(normalizarCodigoNaturezaReceita(h))).toBe(h);
    }
  });
});
