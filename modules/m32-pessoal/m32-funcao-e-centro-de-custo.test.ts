import { describe, expect, it } from "vitest";
import {
  EIXOS_DE_CONSULTA_VAZIOS,
  centroDeCustoVigenteEm,
  funcaoVigenteEm,
  haEixoDerivadoDeVinculo,
  vinculoAtendeAosEixos,
  type EventoDoVinculo,
  type VinculoParaConsulta,
} from "./dominio.js";

/**
 * ═══ OS DOIS EIXOS QUE FALTAVAM — função e centro de custo (TR 5.12.50, V11 V9.4) ═══
 *
 * ⚠️ O QUE ESTE ARQUIVO EXISTE PARA ACUSAR, e é o motivo de ele ser escrito antes de qualquer
 * tela: **a derivação da função não pode ser `ultimoAte`.**
 *
 * `ultimoAte` guarda o último valor NÃO NULO e ignora os nulos — é o que cargo e lotação querem,
 * porque um reajuste não deve apagar o cargo. Mas a DISPENSA da função é um evento cujo `funcaoId`
 * é nulo DE PROPÓSITO (o CHECK do banco impõe), e "ignorar o nulo" faria a dispensa não ter efeito
 * nenhum: o servidor dispensado em 2024 continuaria aparecendo como diretor em 2026, no filtro, na
 * tela e em qualquer relatório — PARA SEMPRE, sem erro nenhum, porque o evento ESTÁ lá.
 *
 * É a mesma família de "existe como linha ≠ produziu efeito" que já deixou uma guarda inerte neste
 * repositório. Por isso o caso 2 abaixo é o teste que mata a implementação errada: trocar o corpo
 * de `funcaoVigenteEm` por `ultimoAte(eventos, quando, (e) => e.funcaoId ?? null)` o deixa VERMELHO.
 *
 * ═══ E O CENTRO DE CUSTO PROVA A PROPRIEDADE INVERSA ═══
 *
 * Nele `ultimoAte` está certo, e a assimetria é deliberada: não existe evento que "desapropria" um
 * vínculo. O que o caso 4 afirma é o CONTEXTO HISTÓRICO DA COMPETÊNCIA — o centro de custo de maio
 * não é o de hoje, e uma coluna reescrita por `UPDATE` faria o relatório de maio mentir depois de
 * agosto sem que nada acusasse.
 *
 * ⚠️ FIXTURE N=2 EM TODA REGRA DE CONJUNTO. A função passa por DUAS designações com uma dispensa
 * entre elas (com N=1 a redesignação passaria por vacuidade), e a composição dos eixos usa DUAS
 * matrículas da MESMA pessoa — senão um predicado que conferisse cada eixo contra o conjunto dos
 * vínculos passaria e devolveria a pessoa errada no dia em que alguém acumulasse dois cargos.
 */

const D = (iso: string): Date => new Date(`${iso}T12:00:00.000Z`);

function ev(p: Partial<EventoDoVinculo> & { readonly data: Date; readonly tipo: EventoDoVinculo["tipo"] }): EventoDoVinculo {
  return {
    criadoEm: p.data,
    cargoId: null,
    lotacaoId: null,
    salarioBase: null,
    ...p,
  };
}

/**
 * A DIRETORA — professora efetiva, designada diretora, dispensada, e designada de novo para OUTRA
 * função. É a fixture N=2 da função.
 */
const EVENTOS_DA_DIRETORA: readonly EventoDoVinculo[] = [
  ev({ data: D("2020-02-01"), tipo: "ADMISSAO", cargoId: "cargo-professora", lotacaoId: "lot-escola", centroDeCustoId: "setor-educacao" }),
  ev({ data: D("2022-03-01"), tipo: "DESIGNACAO_FUNCAO", funcaoId: "func-diretora" }),
  ev({ data: D("2024-06-30"), tipo: "DISPENSA_FUNCAO" }),
  ev({ data: D("2025-01-15"), tipo: "DESIGNACAO_FUNCAO", funcaoId: "func-coordenadora" }),
];

describe("funcaoVigenteEm — a dispensa ENCERRA, e é isto que `ultimoAte` não faria", () => {
  it("1. antes de qualquer designação não há função, e `null` é o estado NORMAL", () => {
    expect(funcaoVigenteEm(EVENTOS_DA_DIRETORA, D("2021-12-31"))).toBeNull();
  });

  it("2. ⚠️ DEPOIS DA DISPENSA A FUNÇÃO É NULA — o caso que mata a implementação com `ultimoAte`", () => {
    // Vigente entre a designação e a dispensa.
    expect(funcaoVigenteEm(EVENTOS_DA_DIRETORA, D("2023-08-01"))).toBe("func-diretora");
    // E NÃO vigente depois dela. Com `ultimoAte`, esta linha devolveria "func-diretora" — a
    // dispensa seria uma linha no banco sem efeito nenhum sobre a resposta.
    expect(funcaoVigenteEm(EVENTOS_DA_DIRETORA, D("2024-07-01"))).toBeNull();
    expect(funcaoVigenteEm(EVENTOS_DA_DIRETORA, D("2024-12-31"))).toBeNull();
  });

  it("3. a REDESIGNAÇÃO depois da dispensa vale, e é outra função (N=2)", () => {
    expect(funcaoVigenteEm(EVENTOS_DA_DIRETORA, D("2025-06-01"))).toBe("func-coordenadora");
  });

  it("4. NO DIA da dispensa ela já valeu — a borda é `<=`, como em todas as derivações deste módulo", () => {
    expect(funcaoVigenteEm(EVENTOS_DA_DIRETORA, D("2024-06-30"))).toBeNull();
    expect(funcaoVigenteEm(EVENTOS_DA_DIRETORA, D("2024-06-29"))).toBe("func-diretora");
  });
});

describe("centroDeCustoVigenteEm — o contexto histórico da competência", () => {
  const COM_MUDANCA: readonly EventoDoVinculo[] = [
    ...EVENTOS_DA_DIRETORA,
    ev({ data: D("2025-08-01"), tipo: "MUDANCA_CENTRO_DE_CUSTO", centroDeCustoId: "setor-secretaria" }),
  ];

  it("5. ⚠️ O CENTRO DE CUSTO DE MAIO NÃO É O DE HOJE — mudar em agosto não reescreve maio", () => {
    expect(centroDeCustoVigenteEm(COM_MUDANCA, D("2025-05-31"))).toBe("setor-educacao");
    expect(centroDeCustoVigenteEm(COM_MUDANCA, D("2025-09-30"))).toBe("setor-secretaria");
  });

  it("6. vínculo que nunca foi apropriado devolve `null`, e quem consome RECUSA em vez de escolher", () => {
    const legado: readonly EventoDoVinculo[] = [
      ev({ data: D("2019-01-01"), tipo: "ADMISSAO", cargoId: "cargo-professora", lotacaoId: "lot-escola" }),
    ];
    expect(centroDeCustoVigenteEm(legado, D("2026-01-01"))).toBeNull();
  });
});

describe("os dois eixos na consulta", () => {
  it("7. ⚠️ OS DOIS SÃO DERIVADOS — e é isso que impede a paginação de mentir", () => {
    // Se qualquer um deles ficasse de fora de `haEixoDerivadoDeVinculo`, o banco recortaria a
    // página por `eventos: { some: ... }` — que responde "ALGUM DIA teve esta função" — enquanto o
    // predicado responde "tinha NA DATA". As duas listas divergem em todo dispensado, e o total
    // passaria a contar gente que a página não mostra.
    expect(haEixoDerivadoDeVinculo({ ...EIXOS_DE_CONSULTA_VAZIOS, funcaoIds: ["func-diretora"] })).toBe(true);
    expect(haEixoDerivadoDeVinculo({ ...EIXOS_DE_CONSULTA_VAZIOS, centroDeCustoIds: ["setor-educacao"] })).toBe(true);
  });

  const diretora: VinculoParaConsulta = {
    matricula: "1001",
    regimeJuridico: "Estatutário",
    dataAdmissao: D("2020-02-01"),
    regimePrevidenciario: "RPPS",
    eventos: EVENTOS_DA_DIRETORA,
  };

  it("8. o eixo da função respeita a data de referência", () => {
    const eixos = { ...EIXOS_DE_CONSULTA_VAZIOS, funcaoIds: ["func-diretora"] };
    expect(vinculoAtendeAosEixos(diretora, eixos, D("2023-08-01"))).toBe(true);
    expect(vinculoAtendeAosEixos(diretora, eixos, D("2025-06-01"))).toBe(false);
  });

  it("9. ⚠️ FUNÇÃO NULA NÃO CASA COM FUNÇÃO PEDIDA — senão o filtro devolveria o ente inteiro", () => {
    const semFuncao: VinculoParaConsulta = { ...diretora, matricula: "1002", eventos: [EVENTOS_DA_DIRETORA[0]!] };
    expect(vinculoAtendeAosEixos(semFuncao, { ...EIXOS_DE_CONSULTA_VAZIOS, funcaoIds: ["func-diretora"] }, D("2023-08-01"))).toBe(false);
  });

  it("10. ⚠️ FUNÇÃO E CENTRO DE CUSTO SE CONJUGAM SOBRE UM MESMO VÍNCULO (N=2 matrículas)", () => {
    // A MESMA pessoa: diretora na Educação por uma matrícula, e motorista (sem função) cujo custo
    // é da Secretaria pela outra. Perguntar "diretora E centro de custo Secretaria" tem de devolver
    // VAZIO — e devolveria ELA se cada eixo fosse conferido contra o CONJUNTO dos vínculos.
    const motorista: VinculoParaConsulta = {
      matricula: "1002",
      regimeJuridico: "Estatutário",
      dataAdmissao: D("2021-05-01"),
      regimePrevidenciario: "RPPS",
      eventos: [
        ev({ data: D("2021-05-01"), tipo: "ADMISSAO", cargoId: "cargo-motorista", lotacaoId: "lot-garagem", centroDeCustoId: "setor-secretaria" }),
      ],
    };
    const cruzado = { ...EIXOS_DE_CONSULTA_VAZIOS, funcaoIds: ["func-diretora"], centroDeCustoIds: ["setor-secretaria"] };
    const vinculos = [diretora, motorista];
    expect(vinculos.some((v) => vinculoAtendeAosEixos(v, cruzado, D("2023-08-01")))).toBe(false);

    // E a conjugação que EXISTE de verdade sai, pela matrícula certa.
    const coerente = { ...EIXOS_DE_CONSULTA_VAZIOS, funcaoIds: ["func-diretora"], centroDeCustoIds: ["setor-educacao"] };
    expect(vinculos.filter((v) => vinculoAtendeAosEixos(v, coerente, D("2023-08-01"))).map((v) => v.matricula)).toEqual(["1001"]);
  });
});
