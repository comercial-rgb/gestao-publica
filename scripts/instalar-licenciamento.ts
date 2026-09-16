import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { ID_DO_ENTE_UNICO } from "../modules/m01-core-contabil/contexto-do-ente.js";
import {
  instalarLicenciamento,
  modulosEmUso,
} from "../modules/m35-licenciamento/instalacao.js";
import { MODULOS_LICENCIAVEIS, type ModuloComercial } from "../modules/m35-licenciamento/modulos.js";

/**
 * INSTALAR O LICENCIAMENTO COMERCIAL DESTA IMPLANTAÇÃO (V10 T1 · N6.1).
 *
 * ═══ ⚠️ ELE EXISTE PARA QUE A ATUALIZAÇÃO NÃO TRANQUE NINGUÉM ═══
 * O gate é fail-closed: sem contrato, nenhum módulo contratável opera. Numa instalação que
 * já existe, subir a versão sem rodar isto trancaria todo mundo. Rodar isto lê as permissões
 * já concedidas, deduz os módulos que a instalação de fato usa, e registra o contrato com
 * eles — com autor, data e a marca de demonstração quando for o caso.
 *
 * ⚠️ IDEMPOTENTE: num banco que já tem contrato ele não mexe em nada e diz qual é. Isso é o
 * certo para um passo de atualização de rotina, e é o OPOSTO do bootstrap de usuário (que
 * FALHA num banco povoado, porque uma segunda execução dele criaria um poder novo).
 *
 * Uso:
 *   npm run licenciamento:instalar                        pré-visualiza (nada grava)
 *   npm run licenciamento:instalar -- --aplicar           instala com os módulos em uso
 *   npm run licenciamento:instalar -- --aplicar --demonstracao
 *   npm run licenciamento:instalar -- --aplicar --modulos NUCLEO_CONTABIL,COMPRAS_E_CONTRATOS
 *
 * Variáveis: LICENCA_NUMERO, LICENCA_CLIENTE, SEED_IDENTIDADE (o autor, que precisa existir).
 */

const url = process.env["DATABASE_URL"];
if (url === undefined || url === "") throw new Error("DATABASE_URL não configurada.");

const args = process.argv.slice(2);
const aplicar = args.includes("--aplicar");
const demonstracao = args.includes("--demonstracao");
const indiceModulos = args.indexOf("--modulos");
const modulosDeclarados: readonly ModuloComercial[] | undefined =
  indiceModulos >= 0
    ? (args[indiceModulos + 1] ?? "").split(",").map((m) => {
        const t = m.trim();
        if (!(MODULOS_LICENCIAVEIS as readonly string[]).includes(t)) {
          throw new Error(
            `MÓDULO DESCONHECIDO: "${t}". Os contratáveis são: ${MODULOS_LICENCIAVEIS.join(", ")}. ` +
              `Nada foi gravado.`
          );
        }
        return t as ModuloComercial;
      })
    : undefined;

const prisma = criarPrismaClient(url);
try {
  const existente = await prisma.contratoComercial.findFirst({
    where: { enteId: ID_DO_ENTE_UNICO },
    select: { numero: true, situacao: true, habilitacoes: { select: { modulo: true, ativa: true } } },
  });
  if (existente !== null) {
    console.log(
      `Esta implantação JÁ está sob o contrato "${existente.numero}" (${existente.situacao}), com ` +
        `${existente.habilitacoes.length} módulo(s): ` +
        existente.habilitacoes.map((h) => `${h.modulo}${h.ativa ? "" : " (suspenso)"}`).join(", ")
    );
    console.log("Nada foi gravado. Mudanças de módulo se fazem pela tela do fornecedor, com motivo e histórico.");
    process.exit(0);
  }

  const acoes = (
    await prisma.permissaoDePerfil.findMany({ select: { acao: true }, distinct: ["acao"] })
  ).map((p) => String(p.acao));
  const deduzidos = modulosEmUso(acoes);
  const escolhidos = modulosDeclarados ?? deduzidos;

  console.log(`Permissões distintas já concedidas nesta instalação: ${acoes.length}`);
  console.log(`Módulos EM USO, deduzidos delas: ${deduzidos.length === 0 ? "(nenhum)" : deduzidos.join(", ")}`);
  if (modulosDeclarados !== undefined) {
    console.log(`Módulos DECLARADOS na linha de comando: ${modulosDeclarados.join(", ")}`);
  }
  console.log(`Fora do contrato ficariam: ` +
    (MODULOS_LICENCIAVEIS.filter((m) => !escolhidos.includes(m)).join(", ") || "(nenhum)"));

  if (!aplicar) {
    console.log("\nPré-visualização: NADA foi gravado. Rode de novo com --aplicar para instalar.");
    process.exit(0);
  }

  const quem = (process.env["SEED_IDENTIDADE"] ?? "").trim();
  if (quem === "") {
    throw new Error(
      "SEED_IDENTIDADE não definida. Instalar o licenciamento é um ATO e precisa de autor — o " +
        "contrato e cada habilitação ficam gravados com o nome de quem os registrou. Nada foi gravado."
    );
  }
  const numero = (process.env["LICENCA_NUMERO"] ?? "").trim();
  const clienteContratante = (process.env["LICENCA_CLIENTE"] ?? "").trim();
  if (numero === "" || clienteContratante === "") {
    throw new Error(
      "LICENCA_NUMERO e LICENCA_CLIENTE são obrigatórias. Um contrato sem número e sem parte " +
        "contratante não se confere contra instrumento nenhum, e não existe valor padrão neste " +
        "código de propósito. Nada foi gravado."
    );
  }

  const r = await instalarLicenciamento(prisma, {
    enteId: ID_DO_ENTE_UNICO,
    numero,
    cliente: clienteContratante,
    criadoPor: quem,
    demonstracao,
    ...(modulosDeclarados !== undefined ? { modulos: modulosDeclarados } : {}),
  });
  console.log(`\n${r.detalhe}`);
  console.log(`  módulos: ${r.modulos.join(", ") || "(nenhum)"}`);
} finally {
  await prisma.$disconnect();
}
