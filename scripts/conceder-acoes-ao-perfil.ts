import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { TODAS_AS_ACOES, type AcaoDoSistema } from "../modules/m16-travamento/acoes.js";

/**
 * CONCEDER AÇÕES A UM PERFIL QUE JÁ EXISTE — o caminho de ATUALIZAÇÃO.
 *
 * ═══ ⚠️ O PROBLEMA QUE ISTO RESOLVE, E COMO ELE APARECEU ═══
 * O `bootstrap-usuario` cria o perfil de instalação a partir do censo — **uma vez**, na
 * vida do banco. Quando uma versão nova acrescenta ações ao censo (T07 acrescentou três),
 * elas **não chegam** aos perfis que já existem: o administrador da instalação abre a tela
 * nova e recebe `ACESSO NEGADO`, nomeando a ação que ninguém lhe concedeu.
 *
 * Foi exatamente o que aconteceu no smoke desta entrega. O funil estava certo; o que
 * faltava era o caminho de atualização.
 *
 * ═══ ⚠️ POR QUE ELE **NÃO** MORA EM `prisma/seed/` ═══
 * `m16-rollout.test.ts` (t5) proíbe qualquer menção a perfil, usuário ou permissão dentro
 * de `prisma/seed/`, e a razão continua inteira: *"um seed que carimba um superusuário no
 * banco de produção entrega a chave-mestra a quem rodar `npm run seed`"*. Seed é rotina
 * re-executável; conceder poder não é rotina.
 *
 * ═══ ⚠️ E POR QUE ELE EXIGE AS AÇÕES POR NOME ═══
 * A tentação era `--todas`: pegue o censo e conceda tudo. Seria a chave-mestra por
 * conveniência — apontá-lo para um perfil limitado o tornaria onipotente, e o comando
 * teria a mesma cara de rotina. Aqui cada ação é DIGITADA por quem executa, conferida
 * contra o censo, e sai no relatório final. Conceder poder é um ato, e ele fica com o
 * nome de quem o praticou no `criadoPor` de cada permissão.
 *
 * ⚠️ NÃO CRIA PERFIL. Perfil inexistente derruba o comando. Criar perfil é ato de
 * administração, com tela, autor e auditoria — não de script de atualização.
 *
 * Uso:
 *   npx tsx scripts/conceder-acoes-ao-perfil.ts ADMINISTRADOR PREPARAR_ORDEM_PAGAMENTO AUTORIZAR_ORDEM_PAGAMENTO
 */

const DATABASE_URL = process.env["DATABASE_URL"];
if (DATABASE_URL === undefined) {
  throw new Error("DATABASE_URL não definida — veja .env.example.");
}

const [nomeDoPerfil, ...acoesPedidas] = process.argv.slice(2);

if (nomeDoPerfil === undefined || acoesPedidas.length === 0) {
  throw new Error(
    "Uso: conceder-acoes-ao-perfil.ts <PERFIL> <ACAO> [ACAO...]\n" +
      "As ações são digitadas UMA A UMA, de propósito: um `--todas` transformaria este " +
      "comando na chave-mestra, com cara de rotina."
  );
}

const censo = new Set<string>(TODAS_AS_ACOES);
const desconhecidas = acoesPedidas.filter((a) => !censo.has(a));
if (desconhecidas.length > 0) {
  throw new Error(
    `Ação(ões) fora do censo: ${desconhecidas.join(", ")}. Conceder permissão para algo ` +
      `que o sistema não faz é uma promessa vazia — e some do rol na próxima limpeza. ` +
      `Nada foi gravado.`
  );
}

const quemConcede = (process.env["SEED_IDENTIDADE"] ?? "").trim();
if (quemConcede === "") {
  throw new Error(
    "SEED_IDENTIDADE não definida. Conceder poder é um ATO e ele precisa de autor — a " +
      "permissão fica gravada com o nome de quem a concedeu. Nada foi gravado."
  );
}

const prisma = criarPrismaClient(DATABASE_URL);

const perfil = await prisma.perfil.findUnique({
  where: { nome: nomeDoPerfil },
  select: { id: true, nome: true, permissoes: { select: { acao: true, unidadeOrcId: true } } },
});
if (perfil === null) {
  throw new Error(
    `Perfil "${nomeDoPerfil}" não existe. Este comando ATUALIZA um perfil existente — ` +
      `criar perfil é ato de administração, com tela e auditoria. Nada foi gravado.`
  );
}

// ⚠️ `unidadeOrcId: null` = TODAS as unidades. É a forma que o perfil de instalação usa;
// para um perfil de unidade, a concessão por unidade é feita pela administração.
const jaTem = new Set(
  perfil.permissoes.filter((p) => p.unidadeOrcId === null).map((p) => p.acao as string)
);
const aConceder = acoesPedidas.filter((a) => !jaTem.has(a));

if (aConceder.length > 0) {
  await prisma.permissaoDePerfil.createMany({
    data: aConceder.map((acao) => ({
      perfilId: perfil.id,
      acao: acao as AcaoDoSistema,
      unidadeOrcId: null,
      criadoPor: quemConcede,
    })),
  });
}

console.log(`PERFIL "${perfil.nome}" — concessão por ${quemConcede}:\n`);
for (const a of acoesPedidas) {
  console.log(`  ${aConceder.includes(a) ? "+ concedida" : "  já tinha "}  ${a}`);
}
console.log(
  `\n  ${aConceder.length} concedida(s), ${acoesPedidas.length - aConceder.length} já existia(m).` +
    `\n  ⚠️ Cada permissão ficou gravada com o autor. Conceder poder é um ato auditável.`
);

await prisma.$disconnect();
