import "dotenv/config";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import { FUNCOES } from "./dados/funcoes.js";
import { SUBFUNCOES } from "./dados/subfuncoes.js";
import {
  CATEGORIAS_ECONOMICAS,
  GRUPOS_NATUREZA_DESPESA,
  MODALIDADES_APLICACAO,
} from "./dados/natureza-componentes.js";
import { ELEMENTOS } from "./dados/elementos.js";
import {
  montarNatureza,
  NATUREZAS_COMUNS,
} from "./dados/naturezas-despesa.js";

/**
 * SEED OFICIAL do M02 — dimensões classificatórias NACIONAIS e fixas.
 *
 * Semeia:
 * - Funcao e Subfuncao (Portaria 42/1999 consolidada);
 * - NaturezaDespesa comuns, MONTADAS a partir dos componentes (163/2001).
 *
 * NÃO semeia em tabela: categoria econômica, grupo de natureza, modalidade de
 * aplicação e elemento — o schema não tem model para eles (a NaturezaDespesa
 * guarda os 4 como CAMPOS). Vivem como const arrays em `dados/`, e são o rol
 * contra o qual `montarNatureza()` valida (fail-closed).
 *
 * Subelemento: ainda não semeado (aparece no empenho — M05).
 *
 * IDEMPOTENTE: upsert com o CÓDIGO como chave natural. Rodar N vezes deixa o
 * banco no mesmo estado — sem duplicar, sem erro de unique.
 *
 * FAIL-CLOSED: todo o material é validado ANTES de gravar qualquer linha. Um
 * código torto aborta o seed inteiro, em vez de gravar metade.
 *
 * Uso: npx tsx prisma/seed/m02-seed-oficial.ts
 */

const DATABASE_URL = process.env["DATABASE_URL"];
if (DATABASE_URL === undefined) {
  throw new Error("DATABASE_URL não definida — veja .env.example.");
}

const prisma = criarPrismaClient(DATABASE_URL);

/** Fail-closed: valida TUDO antes de gravar QUALQUER coisa. */
function validarAntesDeGravar(): void {
  const erros: string[] = [];

  const digitos = /^\d+$/;

  for (const f of FUNCOES) {
    if (f.codigo.length !== 2 || !digitos.test(f.codigo)) {
      erros.push(`Função "${f.codigo}" (${f.nome}): esperado 2 dígitos.`);
    }
    if (f.nome.trim() === "") {
      erros.push(`Função "${f.codigo}": nome vazio.`);
    }
  }

  for (const s of SUBFUNCOES) {
    if (s.codigo.length !== 3 || !digitos.test(s.codigo)) {
      erros.push(`Subfunção "${s.codigo}" (${s.nome}): esperado 3 dígitos.`);
    }
    if (s.nome.trim() === "") {
      erros.push(`Subfunção "${s.codigo}": nome vazio.`);
    }
  }

  // Duplicata na FONTE seria pega pelo unique do banco, mas com metade das
  // linhas já gravadas. Melhor pegar aqui, antes de escrever.
  const dupFuncao = duplicados(FUNCOES.map((f) => f.codigo));
  if (dupFuncao.length > 0) {
    erros.push(`Funções duplicadas na fonte: ${dupFuncao.join(", ")}.`);
  }
  const dupSub = duplicados(SUBFUNCOES.map((s) => s.codigo));
  if (dupSub.length > 0) {
    erros.push(`Subfunções duplicadas na fonte: ${dupSub.join(", ")}.`);
  }

  // Lista oficial definitiva: 109 (Portaria 42 consolidada) + 997 e 999
  // (reservas, STN 163/2001 art. 8º) = 111. Se a lista mudar de tamanho sem
  // alguém mexer aqui de propósito, é erro — não silêncio.
  if (SUBFUNCOES.length !== 111) {
    erros.push(
      `Lista de subfunções tem ${SUBFUNCOES.length} itens; o oficial são 111 ` +
        `(109 da Portaria 42 + reservas 997/999 da STN 163/2001). ` +
        `Confira antes de semear.`
    );
  }

  // As subfunções de Agricultura 601–604 foram REVOGADAS (fundidas em 608/609
  // na consolidação de 2022). Se voltarem à lista, é engano.
  const revogadas = SUBFUNCOES.filter((s) =>
    ["601", "602", "603", "604"].includes(s.codigo)
  );
  if (revogadas.length > 0) {
    erros.push(
      `Subfunções REVOGADAS na lista de seed: ` +
        `${revogadas.map((s) => s.codigo).join(", ")}. ` +
        `Foram fundidas em 608/609 pela consolidação de 2022.`
    );
  }

  // --- elementos de despesa (Anexo II 163/2001) ------------------------------
  for (const e of ELEMENTOS) {
    if (e.codigo.length !== 2 || !digitos.test(e.codigo)) {
      erros.push(`Elemento "${e.codigo}" (${e.nome}): esperado 2 dígitos.`);
    }
    if (e.nome.trim() === "") {
      erros.push(`Elemento "${e.codigo}": nome vazio.`);
    }
  }
  const dupElem = duplicados(ELEMENTOS.map((e) => e.codigo));
  if (dupElem.length > 0) {
    erros.push(`Elementos duplicados na fonte: ${dupElem.join(", ")}.`);
  }

  // Rol FECHADO: 78 elementos no Anexo II. Se a lista mudar de tamanho sem
  // alguém mexer aqui de propósito, é erro — não silêncio.
  if (ELEMENTOS.length !== 78) {
    erros.push(
      `Lista de elementos tem ${ELEMENTOS.length} itens; o Anexo II da ` +
        `163/2001 tem 78. Confira antes de semear.`
    );
  }

  // As modalidades 35 e 45 foram substituídas por 31 e 41 na renumeração
  // fundo-a-fundo. Se voltarem, é engano.
  const modRevogadas = MODALIDADES_APLICACAO.filter((m) =>
    ["35", "45"].includes(m.codigo)
  );
  if (modRevogadas.length > 0) {
    erros.push(
      `Modalidades REVOGADAS na lista: ` +
        `${modRevogadas.map((m) => m.codigo).join(", ")} ` +
        `(substituídas por 31 e 41 na renumeração fundo-a-fundo).`
    );
  }

  // --- naturezas de despesa -------------------------------------------------
  // `montarNatureza` é fail-closed: se um componente não existir no rol, lança.
  // Rodamos aqui, na fase de validação, para que NADA seja gravado nesse caso.
  for (const n of NATUREZAS_COMUNS) {
    try {
      montarNatureza(n);
    } catch (e) {
      erros.push(e instanceof Error ? e.message : String(e));
    }
  }
  const dupNat = duplicados(
    NATUREZAS_COMUNS.map(
      (n) => n.categoria + n.grupo + n.modalidade + n.elemento
    )
  );
  if (dupNat.length > 0) {
    erros.push(`Naturezas duplicadas na fonte: ${dupNat.join(", ")}.`);
  }

  if (erros.length > 0) {
    throw new Error(
      `SEED ABORTADO (fail-closed) — nada foi gravado:\n  - ` +
        erros.join("\n  - ")
    );
  }
}

function duplicados(codigos: readonly string[]): readonly string[] {
  const vistos = new Set<string>();
  const repetidos = new Set<string>();
  for (const c of codigos) {
    if (vistos.has(c)) repetidos.add(c);
    vistos.add(c);
  }
  return [...repetidos];
}

async function semear(): Promise<void> {
  validarAntesDeGravar();

  console.log("Seed oficial M02 — Portaria 42/1999 (funções e subfunções)\n");

  for (const f of FUNCOES) {
    await prisma.funcao.upsert({
      where: { codigo: f.codigo },
      update: { nome: f.nome },
      create: { codigo: f.codigo, nome: f.nome },
    });
  }
  console.log(`  Funcao ......... ${FUNCOES.length} upserts`);

  for (const s of SUBFUNCOES) {
    await prisma.subfuncao.upsert({
      where: { codigo: s.codigo },
      update: { nome: s.nome },
      create: { codigo: s.codigo, nome: s.nome },
    });
  }
  console.log(`  Subfuncao ...... ${SUBFUNCOES.length} upserts`);

  // NaturezaDespesa: montada a partir dos componentes, nunca digitada à mão.
  for (const n of NATUREZAS_COMUNS) {
    const m = montarNatureza(n);
    await prisma.naturezaDespesa.upsert({
      where: { codigoCompleto: m.codigoCompleto },
      update: {
        codCategoria: m.codCategoria,
        codNatureza: m.codNatureza,
        codModalidade: m.codModalidade,
        codElemento: m.codElemento,
        descricao: m.descricao,
        mapeamentoStn: m.mapeamentoStn,
      },
      create: {
        codCategoria: m.codCategoria,
        codNatureza: m.codNatureza,
        codModalidade: m.codModalidade,
        codElemento: m.codElemento,
        codigoCompleto: m.codigoCompleto,
        descricao: m.descricao,
        mapeamentoStn: m.mapeamentoStn,
      },
    });
  }
  console.log(`  NaturezaDespesa  ${NATUREZAS_COMUNS.length} upserts`);

  console.log(
    `\n  Componentes SEM tabela no schema (const arrays em prisma/seed/dados/):\n` +
      `    categorias econômicas ..... ${CATEGORIAS_ECONOMICAS.length}\n` +
      `    grupos de natureza (GND) .. ${GRUPOS_NATUREZA_DESPESA.length}\n` +
      `    modalidades de aplicação .. ${MODALIDADES_APLICACAO.length}\n` +
      `    elementos de despesa ...... ${ELEMENTOS.length}\n` +
      `    -> é o rol contra o qual montarNatureza() valida (fail-closed).`
  );

  const [nFuncao, nSubfuncao, nNatureza] = await Promise.all([
    prisma.funcao.count(),
    prisma.subfuncao.count(),
    prisma.naturezaDespesa.count(),
  ]);
  console.log(
    `\n  Contagem no banco:  Funcao = ${nFuncao}  |  Subfuncao = ${nSubfuncao}` +
      `  |  NaturezaDespesa = ${nNatureza}`
  );

  const naturezas = await prisma.naturezaDespesa.findMany({
    select: { codigoCompleto: true, descricao: true },
    orderBy: { codigoCompleto: "asc" },
  });
  console.log("\n  NaturezaDespesa semeadas (codigoCompleto, 6 díg):");
  for (const n of naturezas) {
    console.log(`    ${n.codigoCompleto}  (${n.codigoCompleto.length} díg)  ${n.descricao}`);
  }

  // O seed NUNCA apaga. Se sobrar código no banco que não está no oficial, ele
  // AVISA — a decisão de remover é humana (pode ser subfunção local legítima).
  if (nSubfuncao > SUBFUNCOES.length) {
    console.log(
      `\n  ⚠️ Há ${nSubfuncao - SUBFUNCOES.length} subfunção(ões) no banco fora ` +
        `da lista oficial (FANTASMA). O seed não apaga nada.\n` +
        `     Rode: npx tsx prisma/seed/m02-auditar-subfuncoes.ts`
    );
  }
}

await semear();
await prisma.$disconnect();
