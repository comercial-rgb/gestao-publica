import { beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../banco.js";
import { limparBanco } from "../limpar-banco.js";

/**
 * O CONTEXTO DE UG RESPEITA A PERMISSÃO — e este teste existe por causa de um furo real.
 *
 * ═══ O QUE HAVIA ANTES ═══
 * `lib/ui-context.tsx` servia três unidades CONSTANTES a TODO usuário. A segregação por UG
 * (TR 6.5) estava viva no domínio — `autorizar` recusa a UG errada —, mas a INTERFACE oferecia o
 * recorte proibido.
 *
 * E o pior caso não era a escrita: uma tela de ESCRITA estoura no `autorizar`. Uma tela de
 * LEITURA não chama `autorizar` — então o usuário da Saúde escolhia "Educação" no seletor e LIA
 * os dados da unidade que não é dele, sem que nada reclamasse.
 *
 * ⚠️ ESTE TESTE FALA COM O BANCO, e não com a função da porta. `listarUgsDoUsuario` importa
 * `lib/portas/cliente`, que depende de `next/headers` — inalcançável fora de um request. O que
 * importa provar é a REGRA (quem enxerga o quê), e ela é uma consulta: o teste a reproduz contra
 * o mesmo schema, com a mesma forma. É uma limitação conhecida — se a porta divergir desta
 * consulta, o teste continua verde. Por isso a porta é FINA de propósito: ela não tem lógica além
 * desta, e qualquer regra nova tem de nascer aqui junto.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

/** A MESMA regra de `listarUgsDoUsuario`, contra o mesmo schema. */
async function ugsVisiveis(
  identificador: string
): Promise<{ readonly codigos: readonly string[]; readonly global: boolean }> {
  const usuario = await prisma.usuario.findUnique({
    where: { identificador },
    select: { id: true, ativo: true },
  });
  if (usuario === null || !usuario.ativo) return { codigos: [], global: false };

  const vinculos = await prisma.vinculoUsuarioPerfil.findMany({
    where: { usuarioId: usuario.id },
    select: { perfil: { select: { permissoes: { select: { unidadeOrcId: true } } } } },
  });
  const permissoes = vinculos.flatMap((v) => v.perfil.permissoes);
  const global = permissoes.some((p) => p.unidadeOrcId === null);

  if (global) {
    const todas = await prisma.unidadeOrcamentaria.findMany({
      select: { codigo: true },
      orderBy: { codigo: "asc" },
    });
    return { codigos: todas.map((u) => u.codigo), global: true };
  }

  const ids = [
    ...new Set(permissoes.map((p) => p.unidadeOrcId).filter((i): i is string => i !== null)),
  ];
  if (ids.length === 0) return { codigos: [], global: false };

  const escopadas = await prisma.unidadeOrcamentaria.findMany({
    where: { id: { in: ids } },
    select: { codigo: true },
    orderBy: { codigo: "asc" },
  });
  return { codigos: escopadas.map((u) => u.codigo), global: false };
}

async function semear(): Promise<void> {
  const orgao = await prisma.orgao.create({
    data: { id: "org-ctx", codigo: "01", nome: "Prefeitura" },
  });
  const saude = await prisma.unidadeOrcamentaria.create({
    data: { codigo: "01004", descricao: "Secretaria de Saude", orgaoId: orgao.id },
  });
  await prisma.unidadeOrcamentaria.create({
    data: { codigo: "01003", descricao: "Secretaria de Educacao", orgaoId: orgao.id },
  });

  const criarUsuarioComPerfil = async (
    identificador: string,
    permissoes: readonly { readonly unidadeOrcId: string | null }[]
  ): Promise<void> => {
    // ⚠️ `Usuario` NÃO guarda senha — a credencial vive em `CredencialDeUsuario`, e este teste
    // não autentica ninguém: ele pergunta o que a IDENTIDADE enxerga, não como ela entra.
    const usuario = await prisma.usuario.create({
      data: { identificador, nome: identificador, criadoPor: "seed-teste" },
    });
    const perfil = await prisma.perfil.create({
      data: { nome: `perfil-${identificador}`, descricao: "teste", criadoPor: "seed-teste" },
    });
    for (const p of permissoes) {
      await prisma.permissaoDePerfil.create({
        data: {
          perfilId: perfil.id,
          // Qualquer ação serve: a pergunta aqui é "onde ele trabalha?", não "o que ele faz".
          acao: "EMPENHAR",
          unidadeOrcId: p.unidadeOrcId,
          criadoPor: "seed-teste",
        },
      });
    }
    await prisma.vinculoUsuarioPerfil.create({
      data: { usuarioId: usuario.id, perfilId: perfil.id, criadoPor: "seed-teste" },
    });
  };

  // ⚠️ PREFIXO `ctx.` de propósito: o `limparBanco` semeia as identidades das fixtures e dá ADMIN
  // (permissão GLOBAL) a TODAS elas. Um nome que colidisse com aquela lista chegaria aqui já
  // enxergando tudo, e o teste da segregação passaria a provar o contrário do que pretende.
  await criarUsuarioComPerfil("ctx.so.saude", [{ unidadeOrcId: saude.id }]);
  await criarUsuarioComPerfil("ctx.global", [{ unidadeOrcId: null }]);
  // Existe, ativo, com perfil — e o perfil não concede permissão nenhuma.
  await criarUsuarioComPerfil("ctx.sem.permissao", []);
}

describe("contexto de UG — o seletor respeita a segregação (TR 6.5)", () => {
  beforeEach(async () => {
    await limparBanco(prisma);
    await semear();
  });

  it("usuário com permissão em UMA unidade NÃO enxerga a segunda", async () => {
    const { codigos, global } = await ugsVisiveis("ctx.so.saude");

    expect(codigos).toEqual(["01004"]); // só a Saúde
    expect(codigos).not.toContain("01003"); // a Educação não aparece
    expect(global).toBe(false);
  });

  it("usuário SEM permissão recebe lista VAZIA — nunca todas", async () => {
    // ⚠️ O REFLEXO PERIGOSO É O OPOSTO: tratar "sem filtro" como "mostre tudo" faria de quem não
    // tem crachá o usuário mais poderoso do sistema. Fail-closed: vazio.
    const { codigos, global } = await ugsVisiveis("ctx.sem.permissao");

    expect(codigos).toEqual([]);
    expect(global).toBe(false);
  });

  it("usuário com permissão GLOBAL enxerga todas as unidades", async () => {
    const { codigos, global } = await ugsVisiveis("ctx.global");

    expect(codigos).toEqual(["01003", "01004"]);
    expect(global).toBe(true);
  });

  it("usuário inexistente não enxerga nada (não estoura — o seletor não derruba a página)", async () => {
    const { codigos, global } = await ugsVisiveis("ctx.nao.existe");
    expect(codigos).toEqual([]);
    expect(global).toBe(false);
  });
});
