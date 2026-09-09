import "dotenv/config";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import { BASE_IMPOSTO_ASPS, FONTE_CLASSE_ASPS } from "./dados/asps-deparas.js";
import { DEPARA_RCL_ANEXO3 } from "./dados/depara-rcl-anexo3.js";

/**
 * ⚠️ DIAGNÓSTICO DAS ÓRFÃS DO UPSERT-ONLY — lê, imprime, NUNCA apaga.
 *
 * ═══ O PROBLEMA QUE ELE EXISTE PARA MOSTRAR ═══
 * Todos os seeds de de-para são UPSERT-ONLY, sem delete. Isso os faz idempotentes e seguros de
 * rodar duas vezes — e cria um ponto cego exato: **tirar uma linha da lista do seed não a apaga do
 * banco**. Num ambiente já povoado, um mapeamento retratado CONTINUA GRAVADO e o relatório continua
 * saindo com ele, enquanto o código-fonte já diz outra coisa. O seed roda, imprime verde, e mente.
 *
 * A 7.9 tornou isso concreto: os dois de-paras trocaram os códigos dos QUATRO impostos contra o
 * ementário oficial. Num banco que rodou o seed anterior, os códigos velhos (`11121101 → IPTU`,
 * `11180111 → ISS`, `11180311 → IRRF`, `11120111 → ITBI`, `11130111`, `11140111`, `11130113`)
 * continuam lá, agora ao lado dos novos — e como o motor lê o BANCO, o Anexo 12 contaria o IPTU
 * duas vezes, por duas naturezas diferentes, sem nenhum erro em lugar nenhum.
 *
 * ═══ POR QUE ELE NÃO APAGA ═══
 * Remoção em banco povoado é ATO DELIBERADO, com identidade e trilha. Não sai de um script que roda
 * sozinho e sem dono: o `criadoPor` de uma linha órfã pode ser "SEED" (retratação) ou uma pessoa
 * (decisão do ente que o seed nunca conheceu), e as duas pedem tratamento diferente. Por isso a
 * saída traz `criadoPor` e `criadoEm` — é com eles que se decide, não com o código sozinho.
 *
 * ⚠️ SAI COM EXIT 1 QUANDO ACHA ÓRFÃ. Um diagnóstico que encontra problema e devolve 0 é a mesma
 * armadilha da suíte inteiramente pulada que o `test/global-setup.ts` recusa: um verde que não
 * significa nada. O 1 aqui não é "falhou" — é "TEM ÓRFÃ, decida".
 *
 * Uso: npm run seed:diagnostico   (rodar DEPOIS de cada atualização de seed em ambiente povoado)
 */

const DATABASE_URL = process.env["DATABASE_URL"];
if (DATABASE_URL === undefined) {
  throw new Error("DATABASE_URL não definida — veja .env.example.");
}

const prisma = criarPrismaClient(DATABASE_URL);

interface LinhaBanco {
  readonly identidade: string;
  readonly destino: string;
  readonly criadoPor: string;
  readonly criadoEm: Date;
}

interface Tabela {
  readonly nome: string;
  readonly identidadeChamada: string;
  readonly noBanco: readonly LinhaBanco[];
  /** As identidades que a lista do seed conhece hoje. */
  readonly noSeed: ReadonlySet<string>;
}

/**
 * ⚠️ TABELA AUSENTE É DIAGNÓSTICO, NÃO STACK TRACE. Rodar isto contra um banco sem as migrations
 * aplicadas devolvia 40 linhas de stack do Prisma terminadas num P2021 — e a pessoa que roda um
 * diagnóstico depois de um seed é exatamente quem não deveria ter de ler stack de ORM para
 * descobrir que errou de banco. Nomeia a tabela e o que fazer.
 */
async function ler<T>(tabela: string, consulta: () => Promise<T[]>): Promise<T[]> {
  try {
    return await consulta();
  } catch (causa) {
    const codigo = (causa as { code?: string }).code;
    if (codigo === "P2021") {
      await prisma.$disconnect();
      throw new Error(
        `TABELA "${tabela}" NÃO EXISTE neste banco.\n\n` +
          `O diagnóstico lê as três tabelas de de-para; sem migrations aplicadas não há o que\n` +
          `diagnosticar. Confira para onde a DATABASE_URL aponta e aplique as migrations:\n\n` +
          `  npx prisma migrate deploy\n`
      );
    }
    throw causa;
  }
}

const rcl = await ler("DeParaRclAnexo3", () => prisma.deParaRclAnexo3.findMany({ orderBy: { naturezaCodigo: "asc" } }));
const asps = await ler("DeParaBaseImpostoAsps", () =>
  prisma.deParaBaseImpostoAsps.findMany({ orderBy: { naturezaCodigo: "asc" } })
);
const fontes = await ler("DeParaFonteClasseAsps", () =>
  prisma.deParaFonteClasseAsps.findMany({ orderBy: { fonteCodigo: "asc" } })
);

const TABELAS: readonly Tabela[] = [
  {
    nome: "DeParaRclAnexo3 (RCL, Anexo 3)",
    identidadeChamada: "natureza",
    noBanco: rcl.map((d) => ({
      identidade: d.naturezaCodigo,
      destino: `${d.chaveLinha} (${d.tipo})`,
      criadoPor: d.criadoPor,
      criadoEm: d.criadoEm,
    })),
    noSeed: new Set(DEPARA_RCL_ANEXO3.map((d) => d.naturezaCodigo)),
  },
  {
    nome: "DeParaBaseImpostoAsps (base de impostos, Anexo 12)",
    identidadeChamada: "natureza",
    noBanco: asps.map((d) => ({
      identidade: d.naturezaCodigo,
      destino: d.chave,
      criadoPor: d.criadoPor,
      criadoEm: d.criadoEm,
    })),
    noSeed: new Set(BASE_IMPOSTO_ASPS.map((d) => d.naturezaCodigo)),
  },
  {
    nome: "DeParaFonteClasseAsps (fonte → classe ASPS)",
    identidadeChamada: "fonte",
    noBanco: fontes.map((f) => ({
      identidade: f.fonteCodigo,
      destino: f.classe,
      criadoPor: f.criadoPor,
      criadoEm: f.criadoEm,
    })),
    noSeed: new Set(FONTE_CLASSE_ASPS.map((f) => f.fonteCodigo)),
  },
];

console.log("═══ DIAGNÓSTICO DOS DE-PARAS — órfãs do upsert-only ═══\n");
console.log("  Órfã = linha GRAVADA no banco que não consta mais da lista do seed.");
console.log("  Este script NÃO apaga nada. Ver o cabeçalho para o porquê.\n");

let totalOrfas = 0;

for (const t of TABELAS) {
  const orfas = t.noBanco.filter((l) => !t.noSeed.has(l.identidade));
  totalOrfas += orfas.length;

  console.log(`── ${t.nome}`);
  console.log(`   no banco: ${t.noBanco.length}  ·  no seed: ${t.noSeed.size}  ·  órfãs: ${orfas.length}`);

  if (t.noBanco.length === 0) {
    console.log(`   (vazia — o seed desta tabela nunca rodou neste banco)\n`);
    continue;
  }
  if (orfas.length === 0) {
    console.log(`   ✓ nenhuma órfã: tudo que está gravado o seed ainda afirma.\n`);
    continue;
  }

  console.log(`   ⚠️ ÓRFÃS — gravadas aqui, ausentes do seed:`);
  for (const o of orfas) {
    const quando = o.criadoEm.toISOString().slice(0, 10);
    console.log(`       ${t.identidadeChamada} ${o.identidade}  →  ${o.destino}`);
    console.log(`         criadoPor: ${o.criadoPor}  ·  criadoEm: ${quando}`);
  }
  console.log("");
}

if (totalOrfas === 0) {
  console.log("✓ NENHUMA ÓRFÃ. O banco e as listas do seed dizem a mesma coisa.");
  await prisma.$disconnect();
} else {
  console.log(`⚠️ ${totalOrfas} ÓRFÃ(S) NO TOTAL.\n`);
  console.log("  O motor lê o BANCO, não estas listas — enquanto estiverem gravadas, elas VALEM.");
  console.log("  Uma natureza órfã ao lado da nova faz o MESMO imposto ser contado por dois");
  console.log("  códigos: o total infla e nada acusa.\n");
  console.log("  Decida cada uma, com identidade e trilha:");
  console.log("    · criadoPor SEED  → mapeamento retratado pelo próprio seed; provável remoção.");
  console.log("    · criadoPor pessoa → decisão do ente que o seed nunca conheceu; PERGUNTE antes.");
  console.log("\n  A remoção não sai daqui — ela é feita por quem responde por ela, e fica registrada.");
  await prisma.$disconnect();
  process.exitCode = 1;
}
