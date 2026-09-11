import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

/**
 * ═══ PROVA DO EIXO DE DATA CIVIL, POR MUTAÇÃO ═══
 *
 * ⚠️ POR QUE ISTO EXISTE. A pendência `DATA-CIVIL-RESTANTES` nomeava cinco sítios, porque
 * era o que a guarda do ENT03a sabia enxergar: ela procurava `getUTC*` e o corte do ISO.
 * A forma DOMINANTE do defeito não era nenhuma das duas — era a **construção** da janela
 * por `new Date(Date.UTC(...))`, e ela estava em **35 arquivos**, incluindo o
 * `janelaDoBimestre` que é a régua de oito anexos do RREO.
 *
 * É o mesmo caso do `c2`: uma guarda que dizia vigiar o eixo de data e ficava verde sobre
 * metade dele. Corrigir os sítios não basta — **é preciso provar que existe teste que fica
 * vermelho quando o eixo volta a ser UTC**. Sem isso, a correção é uma afirmação, e a
 * próxima pessoa a mexer no arquivo não tem nada que a avise.
 *
 * Cada entrada abaixo: (1) confere VERDE antes, (2) muta o CÓDIGO DE PRODUÇÃO devolvendo o
 * eixo a UTC, (3) confere VERMELHO, (4) reverte no `finally`.
 *
 * ⚠️ A MUTAÇÃO DEVOLVE EXATAMENTE O CÓDIGO QUE ESTAVA LÁ ANTES DO CONSERTO. Não é uma
 * mutação inventada para ficar vermelha: é a regressão real que se quer impedir.
 *
 * Uso:  npx tsx scripts/mutacoes-eixo-de-data.ts [nome ...]
 */

interface Alvo {
  /** Nome curto, para a linha de comando e para o relatório. */
  readonly nome: string;
  /** O que se afirma estar protegido. */
  readonly protege: string;
  /** Os arquivos de teste que deveriam acusar. */
  readonly testes: readonly string[];
  readonly arquivo: string;
  readonly de: string;
  readonly para: string;
}

const ALVOS: readonly Alvo[] = [
  {
    nome: "regua",
    protege: "a régua inteira — o fuso do ente é o que separa os dois eixos",
    testes: ["packages/datas/datas.test.ts"],
    arquivo: "packages/datas/index.ts",
    de: 'export const FUSO_DO_ENTE = "America/Sao_Paulo";',
    para: 'export const FUSO_DO_ENTE = "UTC";',
  },
  {
    nome: "corrida-de-meses",
    protege: "a janela de bimestre/quadrimestre/doze meses começa no dia civil 1º",
    testes: ["packages/datas/datas.test.ts"],
    arquivo: "packages/datas/index.ts",
    de: `  const primeiro = normalizarMes(ano, mesInicio);
  const ultimo = normalizarMes(ano, mesInicio + quantidadeDeMeses - 1);
  return {
    inicio: janelaCivilDoMes(primeiro, fuso).inicio,
    fim: janelaCivilDoMes(ultimo, fuso).fim,
  };`,
    para: `  const idx = mesInicio - 1;
  return {
    inicio: new Date(Date.UTC(ano, idx, 1, 0, 0, 0, 0)),
    fim: new Date(Date.UTC(ano, idx + quantidadeDeMeses, 1, 0, 0, 0, 0) - 1),
  };`,
  },
  {
    nome: "distancia-em-dias",
    protege: "a distância até o vencimento não depende da hora em que a tela abriu",
    testes: ["packages/datas/datas.test.ts", "modules/m11-licitacoes/m11-vigencia-alerta.test.ts"],
    arquivo: "packages/datas/index.ts",
    de: `  const meioDia = (d: Date): number => {
    const [a, m, dd] = exigirDia(diaCivil(d, fuso));
    return instanteCivil(a, m, dd, 12, 0, 0, 0, fuso).getTime();
  };
  return Math.round((meioDia(ate) - meioDia(de)) / 86_400_000);`,
    para: `  const diaUtc = (d: Date): number =>
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((diaUtc(ate) - diaUtc(de)) / 86_400_000);`,
  },
  {
    nome: "soma-de-dias",
    protege: "prorrogar N dias não move o DIA do vencimento na virada do horário de verão",
    testes: ["modules/m11-licitacoes/m11-vigencia-alerta.test.ts"],
    arquivo: "modules/m11-licitacoes/dominio.ts",
    de: "  return somarDiasCivis(vigenciaFimInicial, dias);",
    para: "  return new Date(vigenciaFimInicial.getTime() + dias * 86_400_000);",
  },
  {
    nome: "bimestre-do-rreo",
    protege: "a janela do bimestre — a régua de oito anexos do RREO",
    testes: ["modules/m12-relatorios/m12-janelas.test.ts"],
    arquivo: "modules/m12-relatorios/rreo-anexo1.ts",
    de: `  const mesInicio = (bimestre - 1) * 2 + 1; // 1-indexed: bim1 → mês 1 (jan)
  const { inicio, fim } = janelaCivilDeMeses(exercicio, mesInicio, 2);
  const inicioExercicio = janelaCivilDoAno(exercicio).inicio;`,
    para: `  const mesInicio = (bimestre - 1) * 2;
  const inicio = new Date(Date.UTC(exercicio, mesInicio, 1, 0, 0, 0, 0));
  const fim = new Date(Date.UTC(exercicio, mesInicio + 2, 1, 0, 0, 0, 0) - 1);
  const inicioExercicio = new Date(Date.UTC(exercicio, 0, 1, 0, 0, 0, 0));`,
  },
  {
    nome: "fim-do-exercicio-rp",
    protege: "o fato do encerramento é o último instante CIVIL do exercício",
    testes: ["modules/m08-restos-a-pagar/m08-encerramento-controles.test.ts"],
    arquivo: "modules/m08-restos-a-pagar/encerramento-controles.ts",
    de: "  return janelaCivilDoAno(ano).fim;",
    para: "  return new Date(Date.UTC(ano, 11, 31, 23, 59, 59, 0));",
  },
  {
    nome: "competencia-da-msc",
    protege: "a remessa de dezembro leva o encerramento do exercício, e a M3 fecha",
    testes: ["modules/m14-exports-federais/m14-msc.test.ts"],
    arquivo: "modules/m14-exports-federais/msc/dominio.ts",
    de: `    ...janela,
    anteriorAoInicio: new Date(janela.inicio.getTime() - 1),`,
    para: `    inicio: new Date(Date.UTC(ano, mes - 1, 1, 0, 0, 0, 0)),
    fim: new Date(Date.UTC(ano, mes, 0, 23, 59, 59, 999)),
    anteriorAoInicio: new Date(Date.UTC(ano, mes - 1, 1, 0, 0, 0, 0) - 1),`,
  },
  {
    nome: "demonstrativo-patrimonial",
    protege: "o bem doado na noite da virada é saldo ANTERIOR, não ingresso do período",
    testes: ["modules/m10-patrimonial/m10-alienacao.test.ts"],
    arquivo: "modules/m10-patrimonial/demonstrativo.ts",
    de: `          inicio: janelaCivilDoAno(periodo).inicio,
          fim: janelaCivilDoAno(periodo).fim,`,
    para: `          inicio: new Date(Date.UTC(periodo, 0, 1, 0, 0, 0, 0)),
          fim: new Date(Date.UTC(periodo, 11, 31, 23, 59, 59, 999)),`,
  },
  {
    nome: "data-do-decreto",
    protege: "o decreto — documento assinado — imprime a data civil do ente",
    testes: ["modules/m02-planejamento/m02-programacao.test.ts"],
    arquivo: "modules/m02-planejamento/programacao.ts",
    de: "    data: diaCivil(p.dataVigencia),\n    corpo: p.corpo,\n  });\n}\n\nexport async function gerarDecretoMba(",
    para: "    data: p.dataVigencia.toISOString().slice(0, 10),\n    corpo: p.corpo,\n  });\n}\n\nexport async function gerarDecretoMba(",
  },
  {
    nome: "celula-do-designer",
    protege: "o relatório do desenhista imprime o dia que o ente viveu",
    testes: ["modules/m26-designer/m26-gramatica.test.ts"],
    arquivo: "modules/m26-designer/gramatica.ts",
    de: "    return diaCivilBr(v);\n  }",
    para: '    return v.toISOString().slice(0, 10).split("-").reverse().join("/");\n  }',
  },
  {
    nome: "guarda-do-eixo",
    protege: "a própria guarda — ela precisa acusar a volta do `Date.UTC` ao domínio",
    testes: ["test/data-civil.test.ts"],
    arquivo: "modules/m12-relatorios/consistencia.ts",
    de: "const inicioDoExercicio = (exercicio: number): Date => janelaCivilDoAno(exercicio).inicio;",
    para:
      "const inicioDoExercicio = (exercicio: number): Date =>\n" +
      "  new Date(Date.UTC(exercicio, 0, 1, 0, 0, 0, 0));",
  },
];

function rodar(testes: readonly string[]): boolean {
  try {
    execFileSync("npx", ["vitest", "run", ...testes, "--reporter=dot"], {
      stdio: "pipe",
      encoding: "utf8",
    });
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<number> {
  const pedidos = process.argv.slice(2);
  const alvos =
    pedidos.length === 0 ? ALVOS : ALVOS.filter((a) => pedidos.includes(a.nome));

  const falhos: Alvo[] = [];
  for (const a of alvos) {
    const original = readFileSync(a.arquivo, "utf8");
    let verdeAntes = false;
    let vermelho = false;
    try {
      verdeAntes = rodar(a.testes);
      const ocorrencias = original.split(a.de).length - 1;
      if (ocorrencias !== 1) {
        throw new Error(
          `A âncora de "${a.nome}" aparece ${ocorrencias} vezes em ${a.arquivo} — ` +
            `esperava exatamente 1. O código mudou; ajuste a âncora.`
        );
      }
      writeFileSync(a.arquivo, original.replace(a.de, a.para));
      vermelho = !rodar(a.testes);
    } finally {
      writeFileSync(a.arquivo, original);
    }
    const ok = verdeAntes && vermelho;
    if (!ok) falhos.push(a);
    console.log(
      `${ok ? "PROVADO " : "FALHOU  "} ${a.nome.padEnd(26)} ` +
        `verde-antes=${verdeAntes ? "sim" : "NAO"} ` +
        `vermelho=${vermelho ? "sim" : "NAO"}  ${a.protege}`
    );
  }

  console.log(`\n${alvos.length - falhos.length} de ${alvos.length} sítios do eixo PROVADOS.`);
  if (falhos.length > 0) {
    console.log(
      "\n⚠️ Os abaixo NAO ficaram vermelhos: o sítio esta corrigido, mas NADA vigia a\n" +
        "volta do defeito. A correcao vale por hoje e nao vale por amanha.\n"
    );
    for (const f of falhos) console.log(`  · ${f.nome} — ${f.protege}`);
  }
  return falhos.length === 0 ? 0 : 1;
}

process.exitCode = await main();
