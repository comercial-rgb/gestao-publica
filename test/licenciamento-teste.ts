import type { PrismaClient } from "../prisma/generated/client/client.js";
import { ID_DO_ENTE_UNICO } from "../modules/m01-core-contabil/contexto-do-ente.js";
import { instalarLicenciamento } from "../modules/m35-licenciamento/instalacao.js";
import { MODULOS_LICENCIAVEIS } from "../modules/m35-licenciamento/modulos.js";

/**
 * O LICENCIAMENTO DAS FIXTURES (V10 T1 · N6.1).
 *
 * ═══ ⚠️ POR QUE ELE EXISTE, E POR QUE PELO CAMINHO OFICIAL ═══
 * O gate é fail-closed: sem contrato, nenhum módulo contratável opera. A suíte exercita as
 * portas de leitura e o funil de escrita — e sem um contrato semeado, 900 testes passariam a
 * falhar por um motivo que não é o deles.
 *
 * ⚠️ E ELE CHAMA `instalarLicenciamento`, o MESMO caminho que a instalação real usa, em vez de
 * fabricar linhas com `create`. Fixture que constrói o estado por dentro prova o teste e não
 * prova o produto: no dia em que a instalação mudasse, a suíte continuaria verde sobre um
 * estado que nenhuma instalação produz.
 *
 * ⚠️ TODOS OS MÓDULOS, DECLARADOS. A alternativa — deduzir das permissões — daria o mesmo
 * resultado (as fixtures têm um perfil com o censo inteiro) por um caminho menos legível. Quem
 * precisa de um recorte menor o monta no próprio teste, e `test/licenciamento.test.ts` o faz.
 */
export const CONTRATO_DAS_FIXTURES = "CT-FIXTURES";

export async function semearLicenciamentoDeTeste(prisma: PrismaClient): Promise<void> {
  await instalarLicenciamento(prisma, {
    enteId: ID_DO_ENTE_UNICO,
    numero: CONTRATO_DAS_FIXTURES,
    cliente: "Município das fixtures",
    criadoPor: "SEED",
    demonstracao: true,
    modulos: MODULOS_LICENCIAVEIS,
    // ⚠️ VIGÊNCIA QUE COMEÇA NO PASSADO. Começar "hoje" faria um teste que fixa o relógio num
    // instante anterior encontrar o contrato fora de vigência — e o defeito apareceria como
    // uma recusa comercial no meio de um teste de empenho.
    agora: new Date("2000-01-01T12:00:00-03:00"),
  });
}

/**
 * APAGA o licenciamento — para os testes que precisam do estado "não instalado".
 *
 * ⚠️ `deleteMany`, e não `TRUNCATE`: aqui o alvo é sabido e pequeno, e a ordem importa (evento
 * e habilitação apontam para o contrato).
 */
export async function apagarLicenciamentoDeTeste(prisma: PrismaClient): Promise<void> {
  await prisma.eventoDeLicenciamento.deleteMany();
  await prisma.habilitacaoDeModulo.deleteMany();
  await prisma.contratoComercial.deleteMany();
}
