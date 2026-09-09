/**
 * ⚠️ O GUARD DO EMENTÁRIO — o teste que faltava, e cuja falta causou a divergência.
 *
 * ═══ POR QUE ESTE ARQUIVO EXISTE ═══
 * `depara-rcl-anexo3.ts` (RCL, Anexo 3) e `asps-deparas.ts` (base de impostos, Anexo 12) são DOIS
 * mapas que respondem à MESMA pergunta — "qual natureza é o IPTU deste município?" — e até a 7.9
 * discordavam de TRÊS dos QUATRO impostos. Ninguém viu por um motivo mecânico: **nenhum teste
 * importava esses arquivos**. Os seeds de de-para eram consumidos só por script avulso, e o R3 do
 * Anexo 12 — que existe justamente para confrontar o IPTU entre os dois — criava o próprio de-para
 * na fixture (`m12-rreo-anexo12.test.ts:143`) e nunca olhava para a produção.
 *
 * De-para de produção sem consumidor testado é dado que ninguém verifica. Este teste é o
 * consumidor: ele importa os DOIS mapas DE PRODUÇÃO e os confronta com o extrato oficial. Não é
 * teste de fixture — fixture foi exatamente o que enganou os dois arquivos, cada um contra a sua.
 *
 * ═══ FONTE DO EXTRATO ═══
 * Ementário oficial da receita do ente (o cadastro de naturezas do município), seção de IMPOSTOS,
 * hierarquia literal — obtido na sessão 7.9. É a AUTORIDADE deste repositório sobre que código é
 * qual imposto: não há seed de `NaturezaReceita`, e a `descricao` de uma fixture nunca foi ementário.
 *
 * ⚠️ O EXTRATO ABAIXO SÓ MUDA COM DOCUMENTO NA MÃO. Editar esta constante para fazer um teste passar
 * é inverter a direção da prova — é o mapa que se dobra ao ementário, nunca o contrário. Código de
 * imposto novo entra AQUI primeiro, com a hierarquia; nos seeds, só depois.
 *
 * ⚠️ ESCOPO: o extrato é a seção de IMPOSTOS. As transferências dos dois mapas (FPM, ICMS, ...) NÃO
 * têm lastro e este guard NÃO as julga — ver `TRANSFERENCIAS_SEM_EMENTARIO` em
 * `depara-rcl-anexo3.ts`, que nomeia a pendência e uma contradição viva sobre o `17210651`.
 */

import { describe, expect, it } from "vitest";
import { tipoDaNatureza } from "../../../modules/m04-receita/natureza.js";
import { BASE_IMPOSTO_ASPS } from "./asps-deparas.js";
import { DEPARA_RCL_ANEXO3, LINHAS_SEM_NATUREZA_ANEXO3 } from "./depara-rcl-anexo3.js";

interface LinhaEmentario {
  /** A hierarquia literal do ementário — a forma em que o documento fala. */
  readonly hierarquia: string;
  /** Os 8 dígitos, que é como `NaturezaReceita.codigo` fala. */
  readonly codigo: string;
  readonly rotulo: string;
  /** A chave da linha do demonstrativo a que este código pertence. */
  readonly chave: string;
}

/** ⚠️ O EXTRATO OFICIAL (7.9). Ver o cabeçalho antes de tocar. */
const EMENTARIO: readonly LinhaEmentario[] = [
  { hierarquia: "1.1.1.8.01.1.1", codigo: "11180111", rotulo: "IPTU – Principal", chave: "IPTU" },
  { hierarquia: "1.1.1.8.01.1.2", codigo: "11180112", rotulo: "IPTU – Multas e Juros de Mora", chave: "IPTU" },
  { hierarquia: "1.1.1.8.01.1.3", codigo: "11180113", rotulo: "IPTU – Dívida Ativa", chave: "IPTU" },
  { hierarquia: "1.1.1.8.01.1.4", codigo: "11180114", rotulo: "IPTU – M&J de Mora da Dívida Ativa", chave: "IPTU" },
  { hierarquia: "1.1.1.8.01.4.1", codigo: "11180141", rotulo: "ITBI – Principal", chave: "ITBI" },
  { hierarquia: "1.1.1.8.02.3.1", codigo: "11180231", rotulo: "ISSQN – Principal", chave: "ISS" },
  { hierarquia: "1.1.1.8.02.3.2", codigo: "11180232", rotulo: "ISSQN – Multas e Juros de Mora", chave: "ISS" },
  { hierarquia: "1.1.1.3.03.1.1", codigo: "11130311", rotulo: "IRRF – Trabalho – Principal", chave: "IRRF" },
];

/** As chaves que o extrato governa. Fora delas, este guard não opina. */
const CHAVES_DE_IMPOSTO: ReadonlySet<string> = new Set(EMENTARIO.map((e) => e.chave));

/** código → chave oficial. */
const CHAVE_OFICIAL: ReadonlyMap<string, string> = new Map(EMENTARIO.map((e) => [e.codigo, e.chave]));

/** Os dois mapas de PRODUÇÃO, normalizados para (codigo, chave) — é só disso que o guard trata. */
const MAPAS: readonly { readonly nome: string; readonly linhas: readonly { codigo: string; chave: string }[] }[] = [
  {
    nome: "depara-rcl-anexo3 (RCL, Anexo 3)",
    linhas: DEPARA_RCL_ANEXO3.map((d) => ({ codigo: d.naturezaCodigo, chave: d.chaveLinha })),
  },
  {
    nome: "asps-deparas (base de impostos, Anexo 12)",
    linhas: BASE_IMPOSTO_ASPS.map((d) => ({ codigo: d.naturezaCodigo, chave: d.chave })),
  },
];

/** Os códigos de imposto de um mapa, agrupados por chave. */
function impostosDe(linhas: readonly { codigo: string; chave: string }[]): Map<string, string[]> {
  const por = new Map<string, string[]>();
  for (const l of linhas) {
    if (!CHAVES_DE_IMPOSTO.has(l.chave)) continue;
    por.set(l.chave, [...(por.get(l.chave) ?? []), l.codigo]);
  }
  return por;
}

function principalDe(codigos: readonly string[]): string[] {
  return codigos.filter((c) => tipoDaNatureza(c) === "PRINCIPAL");
}

describe("o extrato do ementário — a constante se prova antes de julgar os mapas", () => {
  it("os 8 dígitos são a hierarquia sem os pontos", () => {
    for (const e of EMENTARIO) {
      expect(e.hierarquia.replaceAll(".", ""), `${e.hierarquia} (${e.rotulo})`).toBe(e.codigo);
    }
  });

  it("todo código do extrato é uma natureza VÁLIDA para o parser do M04", () => {
    // Se o parser rejeitasse um código do ementário, o seed gravaria uma linha que o motor não sabe
    // ler — o de-para "existiria" e a receita cairia no fail-open sem ninguém ver.
    for (const e of EMENTARIO) {
      expect(() => tipoDaNatureza(e.codigo), `${e.codigo} (${e.rotulo})`).not.toThrow();
    }
  });

  it("cada imposto tem EXATAMENTE um principal no extrato", () => {
    for (const chave of CHAVES_DE_IMPOSTO) {
      const codigos = EMENTARIO.filter((e) => e.chave === chave).map((e) => e.codigo);
      expect(principalDe(codigos), `${chave}: principais no extrato`).toHaveLength(1);
    }
  });

  it("nenhum código se repete no extrato", () => {
    const codigos = EMENTARIO.map((e) => e.codigo);
    expect(new Set(codigos).size, "códigos duplicados no extrato").toBe(codigos.length);
  });
});

describe("(b) todo código de imposto mapeado existe no extrato oficial", () => {
  for (const mapa of MAPAS) {
    it(`${mapa.nome}: nenhum código de imposto sem lastro`, () => {
      const semLastro = mapa.linhas
        .filter((l) => CHAVES_DE_IMPOSTO.has(l.chave) && !CHAVE_OFICIAL.has(l.codigo))
        .map((l) => `${l.codigo} → ${l.chave}`);
      expect(semLastro, "código mapeado como imposto e AUSENTE do ementário — inferência").toEqual([]);
    });
  }
});

describe("(c) nenhum código órfão: o extrato manda em quem o cita", () => {
  for (const mapa of MAPAS) {
    it(`${mapa.nome}: nenhum código do extrato aponta chave diferente da oficial`, () => {
      // ⚠️ ESTE É O TESTE QUE TERIA PEGO A 7.8-a: o `11180111` (IPTU no ementário) estava mapeado
      // como ISS no asps e como IRRF no rcl. Um código, três significados.
      const divergentes = mapa.linhas
        .filter((l) => {
          const oficial = CHAVE_OFICIAL.get(l.codigo);
          return oficial !== undefined && oficial !== l.chave;
        })
        .map((l) => `${l.codigo} → ${l.chave} (oficial: ${CHAVE_OFICIAL.get(l.codigo)})`);
      expect(divergentes, "código do ementário usado com a chave errada").toEqual([]);
    });

    it(`${mapa.nome}: nenhuma natureza mapeada duas vezes (a unicidade é do banco)`, () => {
      const codigos = mapa.linhas.map((l) => l.codigo);
      const repetidos = codigos.filter((c, i) => codigos.indexOf(c) !== i);
      expect(repetidos, "`@@unique([naturezaCodigo])` — o seed quebraria no upsert").toEqual([]);
    });

    it(`${mapa.nome}: todo imposto mapeado tem um principal`, () => {
      for (const [chave, codigos] of impostosDe(mapa.linhas)) {
        expect(principalDe(codigos), `${chave}: um imposto sem principal é uma linha que nunca soma`).toHaveLength(1);
      }
    });
  }
});

describe("(a) os dois mapas apontam o MESMO código para o mesmo imposto", () => {
  it("o principal de cada imposto presente nos dois é idêntico — e é o do ementário", () => {
    const rcl = impostosDe(MAPAS[0]!.linhas);
    const asps = impostosDe(MAPAS[1]!.linhas);
    const nosDois = [...rcl.keys()].filter((c) => asps.has(c));

    // Sanidade: se um dia os dois mapas não partilharem imposto nenhum, este teste passaria vazio.
    expect(nosDois.length, "impostos presentes nos DOIS mapas").toBeGreaterThan(0);

    for (const chave of nosDois) {
      const pRcl = principalDe(rcl.get(chave)!)[0];
      const pAsps = principalDe(asps.get(chave)!)[0];
      const oficial = EMENTARIO.find((e) => e.chave === chave && tipoDaNatureza(e.codigo) === "PRINCIPAL")!.codigo;
      expect(pRcl, `${chave}: o principal do RCL contra o ementário`).toBe(oficial);
      expect(pAsps, `${chave}: o principal do ASPS contra o ementário`).toBe(oficial);
      expect(pRcl, `${chave}: os dois mapas discordam — a divergência de 7.8-a voltou`).toBe(pAsps);
    }
  });

  it("os quatro impostos do ementário estão nos DOIS mapas", () => {
    for (const mapa of MAPAS) {
      const presentes = [...impostosDe(mapa.linhas).keys()].sort();
      expect(presentes, `${mapa.nome}: impostos mapeados`).toEqual([...CHAVES_DE_IMPOSTO].sort());
    }
  });

  it("os códigos SEM LASTRO da 7.8-a não voltam para linha de imposto", () => {
    // Cada um destes foi, um dia, afirmado como imposto por um dos dois mapas — todos contra
    // fixture, nenhum contra documento. Se um reaparecer, é reconstrução de memória outra vez.
    const semLastro = ["11130111", "11121101", "11140111", "11120111", "11180311"];
    for (const mapa of MAPAS) {
      const voltaram = mapa.linhas
        .filter((l) => CHAVES_DE_IMPOSTO.has(l.chave) && semLastro.includes(l.codigo))
        .map((l) => `${l.codigo} → ${l.chave}`);
      expect(voltaram, `${mapa.nome}: código de fixture usado como imposto`).toEqual([]);
    }
  });
});

describe("o interruptor e o mapa não podem se contradizer", () => {
  it("nenhuma linha está ao mesmo tempo mapeada e declarada sem natureza", () => {
    const mapeadas = new Set(DEPARA_RCL_ANEXO3.map((d) => d.chaveLinha));
    const contradicao = LINHAS_SEM_NATUREZA_ANEXO3.filter((l) => mapeadas.has(l));
    expect(contradicao, "o interruptor diz que falta o que o mapa diz que tem").toEqual([]);
  });

  it("o interruptor está VAZIO — o ementário da 7.9 quitou o IRRF", () => {
    // Documenta a mudança: a 7.8-a deixou ["IRRF"] por falta de lastro; o extrato deu 11130311.
    // Se algum dia voltar a encher, é porque uma linha de imposto perdeu o código — e aí este teste
    // falha exigindo que a decisão seja escrita, não silenciosa.
    expect(LINHAS_SEM_NATUREZA_ANEXO3).toEqual([]);
  });
});

describe("o grão de cada mapa — a assimetria é DELIBERADA", () => {
  it("o RCL é principal-only (o motor do Anexo 3 não lê o 8º dígito)", () => {
    for (const [chave, codigos] of impostosDe(MAPAS[0]!.linhas)) {
      expect(codigos, `${chave}: o RCL mapeia só o principal — ver o cabeçalho do arquivo`).toEqual(
        principalDe(codigos)
      );
    }
  });

  it("o ASPS desce ao grão do tipo, e cada tipo aparece no máximo uma vez por imposto", () => {
    for (const [chave, codigos] of impostosDe(MAPAS[1]!.linhas)) {
      const tipos = codigos.map((c) => tipoDaNatureza(c));
      expect(new Set(tipos).size, `${chave}: dois códigos do MESMO tipo somariam na mesma coluna`).toBe(tipos.length);
    }
  });

  it("o ASPS mapeia todos os sub-códigos que o ementário dá — nem mais, nem menos", () => {
    const asps = impostosDe(MAPAS[1]!.linhas);
    for (const chave of CHAVES_DE_IMPOSTO) {
      const oficiais = EMENTARIO.filter((e) => e.chave === chave)
        .map((e) => e.codigo)
        .sort();
      expect([...(asps.get(chave) ?? [])].sort(), `${chave}: o ASPS contra o extrato`).toEqual(oficiais);
    }
  });
});
