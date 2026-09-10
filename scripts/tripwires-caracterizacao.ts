import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

/**
 * ═══ PROVA DOS TRIPWIRES DA CARACTERIZAÇÃO FINANCEIRA ═══
 *
 * ⚠️ POR QUE ISTO EXISTE, E O CASO QUE O OBRIGOU.
 *
 * O `c2` de `test/caracterizacao/financeiro.test.ts` afirmava, no próprio docblock,
 * vigiar a chegada de uma coluna de competência a `MovimentoDotacao`. A asserção era:
 *
 *     expect(nomes.filter((n) => /^data/i.test(n))).toEqual([])
 *
 * A coluna criada no ENT03a chama-se `competencia`. Não começa com "data", não casa com
 * a regex — **o teste teria passado verde sobre exatamente a mudança que dizia vigiar.**
 *
 * **Um tripwire que nunca ficou vermelho tem valor DESCONHECIDO**, e é pior que não ter
 * tripwire nenhum: ele dá a sensação oposta. Uma suíte verde onde metade dos guardas não
 * guarda nada é uma suíte que mente com confiança.
 *
 * Este script prova cada um dos catorze restantes pelo único jeito que prova: **muta o
 * que ele diz vigiar, confere que fica VERMELHO, e reverte.**
 *
 * ⚠️ A MUTAÇÃO É NO CÓDIGO DE PRODUÇÃO, NUNCA NO TESTE. Mutar o teste provaria que o
 * teste testa a si mesmo. O que precisa ser provado é que ele enxerga o COMPORTAMENTO
 * mudar.
 *
 * ⚠️ E O REVERT É GARANTIDO POR `finally`. Um script destes que morresse no meio
 * deixaria o repositório com código mutado — e o próximo `commit` levaria junto. Cada
 * arquivo é lido antes, restaurado depois, aconteça o que acontecer.
 *
 * Uso:  npx tsx scripts/tripwires-caracterizacao.ts [nome-do-tripwire ...]
 */

const ARQUIVO_DE_TESTE = "test/caracterizacao/financeiro.test.ts";

interface Mutacao {
  readonly arquivo: string;
  readonly de: string;
  readonly para: string;
}

interface Tripwire {
  /** O `-t` do vitest: casa com o começo do nome do teste. */
  readonly teste: string;
  /** O que o teste AFIRMA vigiar — a frase que a mutação tem de desmentir. */
  readonly vigia: string;
  /** O que a mutação faz. Uma ou mais — todas aplicadas juntas. */
  readonly mutacoes: readonly Mutacao[];
}

const TRIPWIRES: readonly Tripwire[] = [
  {
    teste: "c1:",
    vigia: "o saldo aceita corte por COMPETÊNCIA, e os dois eixos DIVERGEM",
    mutacoes: [
      {
        // Colapsa o eixo de competência no de "tudo": o corte deixa de cortar.
        arquivo: "modules/m05-despesa/adapter-prisma.ts",
        de: "        ? { fichaId, competencia: { lte: corte.ate } }",
        para: "        ? { fichaId }",
      },
    ],
  },
  {
    teste: "c3:",
    vigia: "o lançamento nasce do ROTEIRO passado ao serviço",
    mutacoes: [
      {
        // Inverte as pernas do roteiro do empenho: se o lançamento seguisse outra
        // fonte que não o roteiro, o teste não notaria.
        arquivo: "modules/m05-despesa/dominio.ts",
        de:
          '    { conta: c.creditoDisponivel, tipo: "DEBITO", subsistema: "ORCAMENTARIO" },\n' +
          '    { conta: c.creditoEmpenhado, tipo: "CREDITO", subsistema: "ORCAMENTARIO" },',
        para:
          '    { conta: c.creditoDisponivel, tipo: "CREDITO", subsistema: "ORCAMENTARIO" },\n' +
          '    { conta: c.creditoEmpenhado, tipo: "DEBITO", subsistema: "ORCAMENTARIO" },',
      },
    ],
  },
  {
    teste: "c4:",
    vigia: "o estorno preserva o valor DE CADA perna — nada é recarimbado",
    mutacoes: [
      {
        // Recarimba: todas as pernas do estorno passam a levar o valor da primeira.
        arquivo: "packages/ledger/estorno.ts",
        de: "      subsistema: partida.subsistema,\n      valor: partida.valor,",
        para:
          "      subsistema: partida.subsistema,\n" +
          "      valor: original.partidas[0]!.valor,",
      },
    ],
  },
  {
    teste: "c5:",
    vigia: "estornar duas vezes o mesmo lançamento é RECUSADO",
    mutacoes: [
      {
        arquivo: "packages/ledger/estorno.ts",
        de: "  if (original.estornos.length > 0) {",
        para: "  if (false) {",
      },
    ],
  },
  {
    teste: "c6:",
    vigia: "anulação parcial de lançamento COMPOSTO é recusada",
    mutacoes: [
      {
        arquivo: "packages/ledger/estorno.ts",
        de: "  if (valores.size !== 1) {",
        para: "  if (false) {",
      },
    ],
  },
  {
    teste: "c7:",
    vigia: "a anulação parcial NÃO marca `estornoDeId`",
    mutacoes: [
      {
        arquivo: "packages/ledger/estorno.ts",
        de:
          "    historico: `ANULAÇÃO PARCIAL de ${original.numeroControle}: ${original.historico}`,",
        para:
          "    historico: `ANULAÇÃO PARCIAL de ${original.numeroControle}: ${original.historico}`,\n" +
          "    estornoDeId: original.id,",
      },
    ],
  },
  {
    teste: "c8:",
    vigia: "a fila desempata pelo NÚMERO da liquidação",
    mutacoes: [
      {
        arquivo: "modules/m06-ordem-cronologica/dominio.ts",
        de: "    return a.numero.localeCompare(b.numero);",
        para: "    return b.numero.localeCompare(a.numero);",
      },
    ],
  },
  {
    teste: "c9:",
    vigia: "a quebra vem NOMEANDO a liquidação preterida",
    mutacoes: [
      {
        arquivo: "modules/m06-ordem-cronologica/dominio.ts",
        de: "    preterida: ehCabeca ? null : cabeca,",
        para: "    preterida: null,",
      },
    ],
  },
  {
    teste: "c10:",
    vigia: "`avaliarOrdem` RELATA a quebra — ela NÃO bloqueia",
    mutacoes: [
      {
        // Faz a função pura BLOQUEAR. É o oposto exato do que o teste registra.
        arquivo: "modules/m06-ordem-cronologica/dominio.ts",
        de: "  const ehCabeca = posicao === 1;",
        para:
          "  const ehCabeca = posicao === 1;\n" +
          '  if (!ehCabeca) throw new Error("MUTACAO: bloqueia em vez de relatar");',
      },
    ],
  },
  {
    teste: "c11:",
    vigia: "liquidação fora da fila devolve posição NULA",
    mutacoes: [
      {
        arquivo: "modules/m06-ordem-cronologica/dominio.ts",
        de: "    return { ehCabecaDaFila: false, posicao: null, preterida: cabeca };",
        para: "    return { ehCabecaDaFila: false, posicao: 0, preterida: cabeca };",
      },
    ],
  },
  {
    teste: "c12:",
    vigia: "o encerramento registra QUEM encerrou",
    mutacoes: [
      {
        arquivo: "modules/m08-restos-a-pagar/exercicio.ts",
        de: "        encerradoPor: dados.encerradoPor,",
        para: '        encerradoPor: "MUTACAO",',
      },
    ],
  },
  {
    teste: "c13:",
    vigia: "o guard recusa exercício INEXISTENTE, e não só o encerrado",
    mutacoes: [
      {
        arquivo: "modules/m08-restos-a-pagar/guard-exercicio.ts",
        de: "  if (exercicio === null) {",
        para: "  if (false && exercicio === null) {",
      },
    ],
  },
  {
    teste: "c14:",
    vigia: "o guard é cobrado NO CASO DE USO, e nada fica gravado",
    mutacoes: [
      {
        // ⚠️ OS DOIS GUARDS. Desde o ADR da competência, `empenhar` confere o exercício
        // DA FICHA e o da COMPETÊNCIA. Remover só um deixaria o outro recusando, e o
        // tripwire ficaria verde provando nada — que é exatamente o modo de falha que
        // este script existe para achar.
        arquivo: "modules/m05-despesa/adapter-prisma.ts",
        de: '        await exigirExercicioDaFichaAberto(tx, p.fichaId, "empenho");',
        para: '        // MUTACAO: guard da ficha removido',
      },
      {
        arquivo: "modules/m05-despesa/adapter-prisma.ts",
        de: '        await exigirCompetenciaEmExercicioAberto(tx, p.data, "empenho");',
        para: "        // MUTACAO: guard da competência removido",
      },
    ],
  },
  {
    teste: "c15:",
    vigia: "o lançamento carrega a `dataTransacao` DO FATO, não a da gravação",
    mutacoes: [
      {
        arquivo: "modules/m01-core-contabil/razao.ts",
        de: "      dataTransacao: l.dataTransacao,",
        para: "      dataTransacao: new Date(),",
      },
    ],
  },
];

function rodarTeste(nome: string): boolean {
  try {
    execFileSync(
      "npx",
      ["vitest", "run", ARQUIVO_DE_TESTE, "-t", nome, "--reporter=dot"],
      { stdio: "pipe", encoding: "utf8" }
    );
    return true; // verde
  } catch {
    return false; // vermelho
  }
}

interface Resultado {
  readonly teste: string;
  readonly vigia: string;
  readonly verdeAntes: boolean;
  readonly vermelhoComMutacao: boolean;
}

async function main(): Promise<number> {
  const pedidos = process.argv.slice(2);
  const alvos =
    pedidos.length === 0
      ? TRIPWIRES
      : TRIPWIRES.filter((t) => pedidos.some((p) => t.teste.startsWith(p)));

  const resultados: Resultado[] = [];

  for (const t of alvos) {
    const originais = new Map<string, string>();
    for (const m of t.mutacoes) {
      if (!originais.has(m.arquivo)) {
        originais.set(m.arquivo, readFileSync(m.arquivo, "utf8"));
      }
    }

    let verdeAntes = false;
    let vermelhoComMutacao = false;

    try {
      // (1) VERDE ANTES. Sem isto, um teste já quebrado por outro motivo daria
      // "vermelho com mutação" e passaria por tripwire funcionando.
      verdeAntes = rodarTeste(t.teste);

      // (2) MUTA.
      for (const m of t.mutacoes) {
        const atual = readFileSync(m.arquivo, "utf8");
        const ocorrencias = atual.split(m.de).length - 1;
        if (ocorrencias !== 1) {
          throw new Error(
            `A âncora da mutação de ${t.teste} aparece ${ocorrencias} vezes em ` +
              `${m.arquivo} — esperava exatamente 1. O código mudou; ajuste a âncora.`
          );
        }
        writeFileSync(m.arquivo, atual.replace(m.de, m.para));
      }

      // (3) VERMELHO COM MUTAÇÃO?
      vermelhoComMutacao = !rodarTeste(t.teste);
    } finally {
      // (4) REVERTE, aconteça o que acontecer.
      for (const [arquivo, conteudo] of originais) {
        writeFileSync(arquivo, conteudo);
      }
    }

    const ok = verdeAntes && vermelhoComMutacao;
    resultados.push({ teste: t.teste, vigia: t.vigia, verdeAntes, vermelhoComMutacao });
    console.log(
      `${ok ? "PROVADO " : "FALHOU  "} ${t.teste.padEnd(6)} ` +
        `verde-antes=${verdeAntes ? "sim" : "NAO"} ` +
        `vermelho-com-mutacao=${vermelhoComMutacao ? "sim" : "NAO"}  ${t.vigia}`
    );
  }

  const falhos = resultados.filter((r) => !(r.verdeAntes && r.vermelhoComMutacao));
  console.log(
    `\n${resultados.length - falhos.length} de ${resultados.length} tripwires PROVADOS.`
  );
  if (falhos.length > 0) {
    console.log(
      "\n⚠️ Os abaixo NAO ficaram vermelhos com a mutação: eles não vigiam o que dizem\n" +
        "vigiar, e o valor deles é DESCONHECIDO ate alguem consertar o teste ou a ancora.\n"
    );
    for (const f of falhos) console.log(`  · ${f.teste} ${f.vigia}`);
  }
  return falhos.length === 0 ? 0 : 1;
}

process.exitCode = await main();
