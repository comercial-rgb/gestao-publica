import "dotenv/config";
import type { PrismaClient } from "../generated/client/client.js";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import {
  carregarPlanoOficial,
  type ContaOficial,
} from "./oficial/pcasp-oficial.js";
import { creditoDe } from "./oficial/procedencia.js";

/**
 * ═══ SEED DO PLANO DE CONTAS **OFICIAL** — A TABELA REAL, LIDA DO ARQUIVO DO TCE ═══
 *
 * ⚠️ POR QUE ELE EXISTE, E O QUE O `seed:pcasp` ANTIGO ERA. O `prisma/seed/pcasp.ts`
 * semeia um PLANO MÍNIMO de 64 contas, e ele mesmo declara: metade veio das FIXTURES, é "a
 * melhor informação disponível, e pode estar errada", com a pendência `PCASP-COMPLETO`
 * anotada. Este arquivo quita essa pendência: lê o `Pcasp_2025.xlsx` publicado pelo TCE-PB,
 * confere o `sha256` contra o `MANIFEST.json` e semeia **7.864 contas** com nome, natureza
 * de saldo, nível e hierarquia derivados da tabela real.
 *
 * Os dois convivem: o mínimo continua sendo o caminho de instalação enxuta; este é o plano
 * completo, e ele CONTÉM o mínimo — as 64 contas do plano antigo existem, todas, no
 * arquivo oficial (medido: zero ausentes).
 *
 * ═══ ⚠️ O QUE A MEDIÇÃO ENCONTROU AO CONFRONTAR OS DOIS ═══
 *
 * Nenhum código usado pelo sistema é inventado — os 70 existem no PCASP oficial. Mas o
 * confronto de NOME revelou contas no lugar errado, e são erros de classificação, não de
 * digitação:
 *
 *   · `1.1.1.1.2.00.00` o sistema chama de "Bancos Conta Movimento"; no PCASP é
 *     **"CAIXA E EQUIVALENTES DE CAIXA EM MOEDA NACIONAL - INTRA OFSS"** — a variante
 *     INTRA-orçamentária, para transações entre entes do mesmo OFSS. O banco do município
 *     é `1.1.1.1.1.19.00 BANCOS CONTA MOVIMENTO - DEMAIS CONTAS`;
 *   · `1.1.5.1.1.00.00` o sistema chama de "Almoxarifado"; no PCASP é **"MERCADORIAS PARA
 *     REVENDA OU DOAÇÃO"**. Almoxarifado é `1.1.5.6.x`;
 *   · `2.2.1.1.1.00.00` o sistema chama de "Dívida Fundada Interna"; no PCASP é
 *     **"PESSOAL A PAGAR - CONSOLIDAÇÃO"**. A dívida fundada é `2.2.2.x EMPRÉSTIMOS E
 *     FINANCIAMENTOS A LONGO PRAZO`;
 *   · `1.1.2.2.x` o sistema chama de "Créditos Tributários a Receber"; no PCASP é
 *     **"CLIENTES"**;
 *   · `6.2.1.2.0.00.00 RECEITA REALIZADA` está semeada como DEVEDORA e é **CREDORA**.
 *
 * Está tudo em `test/contas-contra-o-plano-oficial.test.ts`, que é quem cobra. A correção
 * não é deste seed: ela muda LANÇAMENTO já gravado e exige caracterização antes.
 * Pendência **`PLANO-DE-CONTAS-FORA-DO-PCASP`**.
 *
 * ═══ ⚠️ POR QUE ESTE SEED **NÃO** SOBRESCREVE `analitica` DE CONTA JÁ EXISTENTE ═══
 *
 * No PCASP estendido, 55 dos 70 códigos que o sistema usa são **SINTÉTICOS** — têm filhas,
 * e o `INVARIANTE 5` do adapter recusa partida em sintética. A maioria é ancestral de
 * hierarquia e nunca recebe partida; cerca de dez, porém, estão em roteiro de verdade
 * (`5.2.2.1.1.00.00` da dotação inicial, `8.2.1.1.1.00.00` da DDR, `2.1.3.1.1.00.00` de
 * fornecedores).
 *
 * Marcar essas contas como sintéticas aqui faria o sistema **recusar as próprias escritas**
 * no instante seguinte ao seed — um seed que instala e quebra. Marcar tudo como analítico
 * seria mentir sobre a hierarquia. A saída é a terceira: **conta nova entra com a
 * `analitica` oficial; conta que já existe mantém a sua e a divergência é RELATADA, com
 * nome e contagem.** O defeito fica visível e datado em vez de virar uma quebra silenciosa
 * ou uma mentira silenciosa.
 *
 * ⚠️ IDEMPOTENTE, e não roda em teste. `test/limpar-banco.ts` trunca `ContaPcasp`: as
 * fixtures são donas do banco de teste e semeiam as próprias contas.
 */

export interface ResultadoDoSeed {
  readonly total: number;
  readonly criadas: number;
  readonly jaExistiam: number;
  /** Contas já existentes cuja `analitica` diverge da hierarquia oficial. */
  readonly divergenciaDeAnalitica: readonly string[];
  /** Contas já existentes cuja natureza de saldo diverge da oficial. */
  readonly divergenciaDeNatureza: readonly string[];
}

export async function semearPcaspOficial(
  prisma: PrismaClient,
  aoProgredir: (feitas: number, total: number) => void = () => {}
): Promise<ResultadoDoSeed> {
  const { contas, procedencia } = carregarPlanoOficial();

  const existentes = new Map(
    (
      await prisma.contaPcasp.findMany({
        select: { codigo: true, analitica: true, naturezaSaldo: true },
      })
    ).map((c) => [c.codigo, c])
  );

  const divergenciaDeAnalitica: string[] = [];
  const divergenciaDeNatureza: string[] = [];
  let criadas = 0;

  // ⚠️ EM DUAS PASSADAS, E A ORDEM IMPORTA. A primeira grava todas as contas SEM pai; a
  // segunda amarra a hierarquia. Tentar gravar o pai junto exigiria inserir em ordem
  // topológica e quebraria na primeira conta cujo ancestral ainda não existe.
  const lote = 500;
  for (let i = 0; i < contas.length; i += lote) {
    const pedaco = contas.slice(i, i + lote);
    await prisma.$transaction(
      pedaco.map((c) => {
        const atual = existentes.get(c.codigo);
        if (atual === undefined) criadas += 1;
        else {
          if (atual.analitica !== c.analitica) {
            divergenciaDeAnalitica.push(
              `${c.codigo} [${c.nome}] — no banco analitica=${atual.analitica}, ` +
                `oficial=${c.analitica}`
            );
          }
          if (atual.naturezaSaldo !== c.naturezaSaldo) {
            divergenciaDeNatureza.push(
              `${c.codigo} [${c.nome}] — no banco ${atual.naturezaSaldo}, ` +
                `oficial ${c.naturezaSaldo}`
            );
          }
        }
        return prisma.contaPcasp.upsert({
          where: { codigo: c.codigo },
          // ⚠️ `analitica` FORA do update de propósito — ver o cabeçalho. Nome, natureza e
          // nível vêm da tabela oficial e podem corrigir o que estava errado; `analitica`
          // decide se a conta aceita partida, e virar isso debaixo de um lançamento
          // existente é quebrar o sistema no meio da instalação.
          update: {
            nome: c.nome,
            naturezaSaldo: c.naturezaSaldo,
            nivel: c.nivel,
          },
          create: {
            codigo: c.codigo,
            nome: c.nome,
            naturezaSaldo: c.naturezaSaldo,
            nivel: c.nivel,
            analitica: c.analitica,
          },
        });
      })
    );
    aoProgredir(Math.min(i + lote, contas.length), contas.length);
  }

  await amarrarHierarquia(prisma, contas);

  return {
    total: contas.length,
    criadas,
    jaExistiam: contas.length - criadas,
    divergenciaDeAnalitica,
    divergenciaDeNatureza,
  };
}

async function amarrarHierarquia(
  prisma: PrismaClient,
  contas: readonly ContaOficial[]
): Promise<void> {
  const ids = new Map(
    (await prisma.contaPcasp.findMany({ select: { id: true, codigo: true } })).map(
      (c) => [c.codigo, c.id]
    )
  );
  const lote = 500;
  const comPai = contas.filter((c) => c.codigoPai !== null);
  for (let i = 0; i < comPai.length; i += lote) {
    await prisma.$transaction(
      comPai.slice(i, i + lote).map((c) => {
        const paiId = ids.get(c.codigoPai as string);
        if (paiId === undefined) {
          // Não deveria acontecer: `planoOficial` já sobe até achar um pai existente.
          throw new Error(
            `A conta ${c.codigo} declara pai ${c.codigoPai}, que não está no banco.`
          );
        }
        return prisma.contaPcasp.update({
          where: { codigo: c.codigo },
          data: { contaPaiId: paiId },
        });
      })
    );
  }
}

/** Execução direta: `npm run seed:pcasp-oficial`. */
if (process.argv[1]?.includes("pcasp-oficial") === true) {
  const url = process.env["DATABASE_URL"];
  if (url === undefined || url === "") {
    throw new Error("DATABASE_URL não configurada — o seed não tem banco.");
  }
  const prisma = criarPrismaClient(url);
  const { procedencia } = carregarPlanoOficial();
  console.log(`[seed:pcasp-oficial] fonte: ${creditoDe(procedencia)}`);

  const r = await semearPcaspOficial(prisma, (feitas, total) => {
    if (feitas % 2000 === 0 || feitas === total) {
      console.log(`[seed:pcasp-oficial]   ${feitas}/${total}`);
    }
  });

  console.log(
    `[seed:pcasp-oficial] ${r.total} contas — ${r.criadas} criada(s), ` +
      `${r.jaExistiam} já existia(m).`
  );
  if (r.divergenciaDeNatureza.length > 0) {
    console.log(
      `\n[seed:pcasp-oficial] ⚠️ ${r.divergenciaDeNatureza.length} conta(s) com NATUREZA ` +
        `DE SALDO corrigida para a oficial:`
    );
    for (const l of r.divergenciaDeNatureza) console.log(`   ${l}`);
  }
  if (r.divergenciaDeAnalitica.length > 0) {
    console.log(
      `\n[seed:pcasp-oficial] ⚠️ ${r.divergenciaDeAnalitica.length} conta(s) já existentes ` +
        `divergem da hierarquia oficial em "analitica". NÃO foram alteradas: mudar isso ` +
        `debaixo de lançamento já gravado faria o sistema recusar as próprias escritas. ` +
        `Pendência PLANO-DE-CONTAS-FORA-DO-PCASP.`
    );
    for (const l of r.divergenciaDeAnalitica.slice(0, 20)) console.log(`   ${l}`);
    if (r.divergenciaDeAnalitica.length > 20) {
      console.log(`   ... e mais ${r.divergenciaDeAnalitica.length - 20}`);
    }
  }
  await prisma.$disconnect();
}
