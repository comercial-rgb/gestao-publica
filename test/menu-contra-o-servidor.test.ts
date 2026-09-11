import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { limparBanco } from "./limpar-banco.js";
import { autorizar } from "../modules/m16-travamento/autorizacao.js";
import type { AcaoDoSistema } from "../modules/m16-travamento/acoes.js";
import {
  AREA_DA_ACAO,
  areasSemAcao,
  areasVisiveis,
} from "../lib/portas/navegacao-permissoes.js";
import { AREAS } from "../lib/navegacao.js";

/**
 * ═══ O MENU NÃO PODE OFERECER O QUE O SERVIDOR NEGA — MEDIDO, NÃO PROMETIDO ═══
 *
 * ⚠️ O CASO QUE ORIGINOU A REGRA. No ENT02, o seletor de encaminhamento do protocolo
 * oferecia setores que o servidor recusava: a tela tinha a própria ideia de quem podia
 * receber. O usuário escolhia, o servidor negava, e nada explicava por quê.
 *
 * A barra lateral é o mesmo defeito em escala de sistema — 18 áreas fixas prometem ao
 * operador da tesouraria uma tela de "Administração" que ele nunca vai poder usar.
 *
 * ═══ ⚠️ O QUE ESTE ARQUIVO TESTA É UMA PROPRIEDADE, NÃO UMA LISTA ═══
 *
 * Seria fácil — e quase inútil — escrever "o perfil X vê as áreas A, B e C". Isso passaria
 * a valer no dia em que alguém mudasse as permissões do perfil X, e continuaria verde.
 *
 * A propriedade é outra, e vale para QUALQUER usuário e QUALQUER perfil:
 *
 *   **área escondida ⟺ o servidor nega TODAS as ações daquela área.**
 *
 * O teste percorre as 185 ações do censo do M16 chamando o MESMO `autorizar` que o serviço
 * chama, e confronta o veredito com o que a barra lateral mostraria. É a mesma escolha do
 * eixo de data no ENT03c: vigiar a propriedade pega as formas que ninguém imaginou.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const SO_DESPESA = "so-despesa@cg.pb.gov.br";
const SEM_PERFIL = "sem-perfil@cg.pb.gov.br";

/** As ações do usuário, lidas da MESMA tabela que `autorizar` consulta. */
async function acoesDe(identificador: string): Promise<readonly AcaoDoSistema[]> {
  const u = await prisma.usuario.findUnique({
    where: { identificador },
    select: { id: true, ativo: true },
  });
  if (u === null || !u.ativo) return [];
  const vinculos = await prisma.vinculoUsuarioPerfil.findMany({
    where: { usuarioId: u.id },
    select: { perfil: { select: { permissoes: { select: { acao: true } } } } },
  });
  return [
    ...new Set(
      vinculos.flatMap((v) => v.perfil.permissoes.map((p) => p.acao as AcaoDoSistema))
    ),
  ];
}

/** O servidor deixa? Pergunta feita ao `autorizar` de verdade, não a uma cópia da regra. */
async function servidorDeixa(
  identificador: string,
  acao: AcaoDoSistema
): Promise<boolean> {
  try {
    await autorizar(prisma, identificador, acao);
    return true;
  } catch {
    return false;
  }
}

const TODAS_AS_ACOES = Object.keys(AREA_DA_ACAO) as readonly AcaoDoSistema[];

beforeEach(async () => {
  await limparBanco(prisma);

  // ⚠️ UM PERFIL ESTREITO DE PROPÓSITO: só empenhar e liquidar. Um perfil largo faria quase
  // tudo aparecer, e o teste passaria sem exercitar a parte que importa — o que fica de fora.
  const perfil = await prisma.perfil.create({
    data: {
      nome: "SO_DESPESA_TESTE",
      descricao: "perfil estreito para medir a barra lateral",
      criadoPor: "TESTE",
      permissoes: {
        create: [
          { acao: "EMPENHAR", criadoPor: "TESTE" },
          { acao: "LIQUIDAR", criadoPor: "TESTE" },
        ],
      },
    },
    select: { id: true },
  });
  for (const ident of [SO_DESPESA, SEM_PERFIL]) {
    await prisma.usuario.create({
      // A senha mora em `CredencialDeUsuario`, tabela à parte — aqui só a identidade.
      data: { identificador: ident, nome: ident, ativo: true, criadoPor: "TESTE" },
    });
  }
  const u = await prisma.usuario.findUniqueOrThrow({
    where: { identificador: SO_DESPESA },
    select: { id: true },
  });
  await prisma.vinculoUsuarioPerfil.create({
    data: { usuarioId: u.id, perfilId: perfil.id, criadoPor: "TESTE" },
  });
});

describe("a barra lateral e o servidor dizem a mesma coisa", () => {
  it("A PROPRIEDADE: área escondida ⟺ o servidor nega TODAS as ações dela", async () => {
    const acoes = await acoesDe(SO_DESPESA);
    const visiveis = new Set(areasVisiveis(acoes));
    const semAcao = new Set(areasSemAcao());

    const permitidasPeloServidor = new Map<string, AcaoDoSistema[]>();
    for (const acao of TODAS_AS_ACOES) {
      if (!(await servidorDeixa(SO_DESPESA, acao))) continue;
      const area = AREA_DA_ACAO[acao];
      if (area === "transversal") continue;
      const lista = permitidasPeloServidor.get(area) ?? [];
      lista.push(acao);
      permitidasPeloServidor.set(area, lista);
    }

    const mentiras: string[] = [];
    for (const area of AREAS) {
      // Área só de leitura não é decidida por ação — ver o cabeçalho de
      // `lib/portas/navegacao-permissoes.ts`. Ela fica de fora da equivalência, com nome.
      if (semAcao.has(area.slug)) continue;
      const oServidorDeixaAlgo = (permitidasPeloServidor.get(area.slug) ?? []).length > 0;
      const oMenuMostra = visiveis.has(area.slug);
      if (oMenuMostra && !oServidorDeixaAlgo) {
        mentiras.push(
          `"${area.rotulo}" APARECE no menu e o servidor nega TODAS as suas ações — ` +
            `o usuário entra e não consegue fazer nada.`
        );
      }
      if (!oMenuMostra && oServidorDeixaAlgo) {
        mentiras.push(
          `"${area.rotulo}" está ESCONDIDA e o servidor permite ` +
            `${(permitidasPeloServidor.get(area.slug) ?? []).join(", ")} — ` +
            `o usuário perdeu uma tela que pode usar.`
        );
      }
    }
    expect(mentiras, `\n\n${mentiras.join("\n")}\n`).toEqual([]);
  }, 120_000);

  it("o perfil estreito vê DESPESA e NÃO vê administração", async () => {
    const visiveis = areasVisiveis(await acoesDe(SO_DESPESA));
    expect(visiveis).toContain("despesa");
    expect(visiveis).not.toContain("administracao");
    expect(visiveis).not.toContain("protocolo");
    // ⚠️ E A CONTRAPROVA NO SERVIDOR, no mesmo teste: se `autorizar` deixasse passar
    // CRIAR_USUARIO, esconder o menu seria teatro de segurança.
    expect(await servidorDeixa(SO_DESPESA, "CRIAR_USUARIO")).toBe(false);
    expect(await servidorDeixa(SO_DESPESA, "EMPENHAR")).toBe(true);
  }, 30_000);

  it("SEM PERFIL o menu não oferece área de trabalho nenhuma — fail-closed", async () => {
    const visiveis = areasVisiveis(await acoesDe(SEM_PERFIL));
    const semAcao = new Set(areasSemAcao());
    const comTrabalho = visiveis.filter((s) => !semAcao.has(s));
    expect(
      comTrabalho,
      "quem não tem perfil não pode nada (TR 4.56: nega-se por omissão). Um menu que " +
        "mostrasse tudo para ele faria do usuário sem crachá o mais visível do sistema."
    ).toEqual([]);
  }, 30_000);

  it("toda ação do censo está classificada, e nenhuma aponta para área inexistente", () => {
    const slugs = new Set<string>(AREAS.map((a) => a.slug));
    const invalidas = Object.entries(AREA_DA_ACAO).filter(
      ([, destino]) => destino !== "transversal" && !slugs.has(destino)
    );
    expect(invalidas.map(([a, d]) => `${a} -> ${d}`)).toEqual([]);
    // O `Record<AcaoDoSistema, …>` já obriga o compilador a exigir todas; esta linha guarda
    // a contagem para que uma queda brusca (uma união reescrita) apareça como falha.
    expect(TODAS_AS_ACOES.length).toBeGreaterThanOrEqual(185);
  });

  it("as áreas SEM ação de mutação são só as de leitura — e estão nomeadas", () => {
    // ⚠️ SE ESTA LISTA CRESCER, uma área de trabalho ficou sem ação classificada e passou a
    // aparecer para todo mundo. O teste falha nomeando qual.
    expect([...areasSemAcao()].sort()).toEqual(["transparencia"]);
  });
});
