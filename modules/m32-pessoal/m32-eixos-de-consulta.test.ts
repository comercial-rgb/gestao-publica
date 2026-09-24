import { describe, expect, it } from "vitest";
import {
  EIXOS_DE_CONSULTA_VAZIOS,
  haEixoDerivadoDeVinculo,
  haEixoDeVinculo,
  vinculoAtendeAosEixos,
  type EixosDeConsultaDeVinculo,
  type EventoDoVinculo,
  type VinculoParaConsulta,
} from "./dominio.js";

/**
 * ═══ OS EIXOS DE CONSULTA DE SERVIDOR — TR 5.12.50, a metade que TEM DADO (V11 V9.4) ═══
 *
 * ⚠️ O QUE ESTE ARQUIVO **NÃO** PROVA, E DE PROPÓSITO: que a folha pode ser calculada por um
 * recorte. A cláusula pede os oito eixos "na rotina de cálculo"; entregá-los ali recortaria QUEM É
 * CALCULADO, e `calcularFolha` promete "todos os vínculos vivos na competência" POR CONSTRUÇÃO —
 * o `findMany` de lá não tem `where` nenhum. Estes eixos são CONSULTA. A decisão de recortar o
 * cálculo está pendente e nomeada em `modules/m33-folha/MODULO.md`.
 *
 * ═══ O QUE ELE PROVA ═══
 *
 *  1. **O "E" SIGNIFICA "E", SOBRE O MESMO VÍNCULO.** A professora que também é motorista NÃO sai
 *     numa busca por "motorista na Escola Central". É a fixture N=2 que fecha a vacuidade: com uma
 *     matrícula por servidor, um predicado que conferisse cada eixo contra o CONJUNTO dos vínculos
 *     passaria — e devolveria a pessoa errada no dia em que alguém acumulasse dois cargos.
 *  2. **A DATA DE REFERÊNCIA MUDA A RESPOSTA.** Promovida em junho, ela está no cargo antigo
 *     quando se pergunta por maio. "Cargo hoje" e "cargo na competência" dão listas diferentes, e
 *     escolher em silêncio é o defeito — aqui as duas perguntas são feitas e recebem listas
 *     diferentes.
 *  3. **REGIME JURÍDICO E REGIME PREVIDENCIÁRIO SÃO DOIS EIXOS.** "Estatutário" e "RPPS" não
 *     disputam a mesma caixa; um estatutário no RGPS é achado por um e não pelo outro.
 *
 * ⚠️ ESTE ARQUIVO É O PREDICADO PURO. A consulta pela PORTA (paginação, autorização, teto e o
 * descritor) está em `test/pessoal-eixos-de-consulta.test.ts` — ela importa `lib/portas/`, que é
 * escrito para `moduleResolution: bundler` e não compila sob o alvo NodeNext deste diretório (o
 * `tsconfig.backend.json` documenta essa exata armadilha).
 *
 *  4. **A PAGINAÇÃO NÃO MENTE.** O filtro derivado é apurado ANTES do recorte da página. Era o
 *     defeito que estava aqui: a situação era aplicada DEPOIS do `skip`/`take`, e o total virava
 *     "quantos casam NESTA PÁGINA". Com 25 servidores ou menos ninguém vê — por isso a fixture
 *     deste teste tem TRINTA.
 *  5. **FILTRO QUE NÃO ACHA DEVOLVE VAZIO, NÃO TUDO.** Cargo inexistente ⇒ zero linhas. Ler `[]`
 *     como "sem filtro" é o modo mais discreto de um filtro deixar de filtrar.
 *  6. **A CONSULTA É AUTORIZADA POR AÇÃO NOMEADA**, nos dois sentidos, e a recusa DIZ O MOTIVO.
 *  7. **O TETO RECUSA, NÃO TRUNCA** — e a recusa é provada nas duas direções.
 */

const D = (a: number, m: number, d: number): Date => new Date(Date.UTC(a, m - 1, d, 12, 0, 0));

// ═══════════════════════════════════════════════════════════════════════════════
// (A) O PREDICADO, PURO — sem banco, sem relógio
// ═══════════════════════════════════════════════════════════════════════════════

const ev = (
  data: Date,
  tipo: EventoDoVinculo["tipo"],
  extra: Partial<Pick<EventoDoVinculo, "cargoId" | "lotacaoId" | "regimePrevidenciario">> = {}
): EventoDoVinculo => ({
  data, criadoEm: data, tipo,
  cargoId: extra.cargoId ?? null, lotacaoId: extra.lotacaoId ?? null, salarioBase: null,
  regimePrevidenciario: extra.regimePrevidenciario ?? null,
});

const eixos = (p: Partial<EixosDeConsultaDeVinculo>): EixosDeConsultaDeVinculo => ({
  ...EIXOS_DE_CONSULTA_VAZIOS,
  ...p,
});

/** A MESMA PESSOA, DUAS MATRÍCULAS — a fixture sem a qual o item 1 passa por vacuidade. */
const professora: VinculoParaConsulta = {
  matricula: "1001", regimeJuridico: "Estatutario", dataAdmissao: D(2020, 3, 1), regimePrevidenciario: "RPPS",
  eventos: [ev(D(2020, 3, 1), "ADMISSAO", { cargoId: "cargo-professor", lotacaoId: "lot-escola", regimePrevidenciario: "RPPS" })],
};
const motorista: VinculoParaConsulta = {
  matricula: "1002", regimeJuridico: "CLT", dataAdmissao: D(2022, 8, 15), regimePrevidenciario: "RGPS",
  eventos: [ev(D(2022, 8, 15), "ADMISSAO", { cargoId: "cargo-motorista", lotacaoId: "lot-garagem", regimePrevidenciario: "RGPS" })],
};
const AS_DUAS = [professora, motorista];
const HOJE = D(2026, 9, 24);

describe("(A) o predicado puro — o 'E' se conjuga sobre UM MESMO vínculo", () => {
  it("cada eixo, sozinho, acha UM dos dois vínculos — a fixture não é degenerada", () => {
    expect(AS_DUAS.filter((v) => vinculoAtendeAosEixos(v, eixos({ cargoIds: ["cargo-motorista"] }), HOJE)).map((v) => v.matricula)).toEqual(["1002"]);
    expect(AS_DUAS.filter((v) => vinculoAtendeAosEixos(v, eixos({ lotacaoIds: ["lot-escola"] }), HOJE)).map((v) => v.matricula)).toEqual(["1001"]);
  });

  it("CARGO DE UM + LOTAÇÃO DO OUTRO não acha vínculo nenhum — e é isto que a segunda matrícula existe para provar", () => {
    const cruzado = eixos({ cargoIds: ["cargo-motorista"], lotacaoIds: ["lot-escola"] });
    expect(AS_DUAS.some((v) => vinculoAtendeAosEixos(v, cruzado, HOJE))).toBe(false);
    // ⚠️ E O MOTIVO, não só o resultado: nenhum dos dois atende — cada um falha no eixo do outro.
    expect(vinculoAtendeAosEixos(professora, eixos({ cargoIds: ["cargo-motorista"] }), HOJE)).toBe(false);
    expect(vinculoAtendeAosEixos(motorista, eixos({ lotacaoIds: ["lot-escola"] }), HOJE)).toBe(false);
  });

  it("os eixos do MESMO vínculo se conjugam e acham", () => {
    expect(vinculoAtendeAosEixos(motorista, eixos({ cargoIds: ["cargo-motorista"], lotacaoIds: ["lot-garagem"], matricula: "1002", regimeJuridico: "clt" }), HOJE)).toBe(true);
  });

  it("REGIME JURÍDICO E PREVIDENCIÁRIO SÃO DOIS EIXOS — a professora é Estatutária no RPPS, o motorista CLT no RGPS", () => {
    expect(vinculoAtendeAosEixos(professora, eixos({ regimeJuridico: "estatut" }), HOJE)).toBe(true);
    expect(vinculoAtendeAosEixos(professora, eixos({ regimeJuridico: "CLT" }), HOJE)).toBe(false);
    expect(vinculoAtendeAosEixos(professora, eixos({ regimePrevidenciario: "RPPS" }), HOJE)).toBe(true);
    expect(vinculoAtendeAosEixos(professora, eixos({ regimePrevidenciario: "RGPS" }), HOJE)).toBe(false);
    // O cruzamento que uma fusão dos dois eixos deixaria passar: "Estatutário" com regime GERAL.
    const estatutarioNoRgps: VinculoParaConsulta = { ...professora, matricula: "1003", regimePrevidenciario: "RGPS", eventos: [ev(D(2020, 3, 1), "ADMISSAO", { cargoId: "cargo-professor", lotacaoId: "lot-escola", regimePrevidenciario: "RGPS" })] };
    expect(vinculoAtendeAosEixos(estatutarioNoRgps, eixos({ regimeJuridico: "estatut" }), HOJE)).toBe(true);
    expect(vinculoAtendeAosEixos(estatutarioNoRgps, eixos({ regimePrevidenciario: "RPPS" }), HOJE)).toBe(false);
  });

  it("A DATA DE REFERÊNCIA MUDA A RESPOSTA: promovida em junho, ela é Professora em maio e Diretora em junho", () => {
    const promovida: VinculoParaConsulta = {
      ...professora,
      eventos: [
        ev(D(2026, 1, 1), "ADMISSAO", { cargoId: "cargo-professor", lotacaoId: "lot-escola", regimePrevidenciario: "RPPS" }),
        ev(D(2026, 6, 1), "PROMOCAO", { cargoId: "cargo-diretor" }),
      ],
    };
    expect(vinculoAtendeAosEixos(promovida, eixos({ cargoIds: ["cargo-professor"] }), D(2026, 5, 31))).toBe(true);
    expect(vinculoAtendeAosEixos(promovida, eixos({ cargoIds: ["cargo-diretor"] }), D(2026, 5, 31))).toBe(false);
    expect(vinculoAtendeAosEixos(promovida, eixos({ cargoIds: ["cargo-diretor"] }), D(2026, 6, 1))).toBe(true);
    expect(vinculoAtendeAosEixos(promovida, eixos({ cargoIds: ["cargo-professor"] }), D(2026, 6, 1))).toBe(false);
  });

  it("MIGROU DE REGIME EM JUNHO: RGPS em maio, RPPS em junho — o filtro não pode responder pelo de hoje", () => {
    const migrou: VinculoParaConsulta = {
      matricula: "2001", regimeJuridico: "Estatutario", dataAdmissao: D(2026, 1, 1), regimePrevidenciario: "RGPS",
      eventos: [
        ev(D(2026, 1, 1), "ADMISSAO", { cargoId: "cargo-professor", lotacaoId: "lot-escola", regimePrevidenciario: "RGPS" }),
        ev(D(2026, 6, 1), "MUDANCA_REGIME_PREVIDENCIARIO", { regimePrevidenciario: "RPPS" }),
      ],
    };
    expect(vinculoAtendeAosEixos(migrou, eixos({ regimePrevidenciario: "RGPS" }), D(2026, 5, 31))).toBe(true);
    expect(vinculoAtendeAosEixos(migrou, eixos({ regimePrevidenciario: "RPPS" }), D(2026, 5, 31))).toBe(false);
    expect(vinculoAtendeAosEixos(migrou, eixos({ regimePrevidenciario: "RPPS" }), D(2026, 6, 1))).toBe(true);
  });

  it("O VÍNCULO QUE AINDA NÃO EXISTIA NÃO ENTRA POR FALLBACK — o buraco que `regimeVigenteEm` deixaria aberto", () => {
    // `regimeVigenteEm` cai no regime da ADMISSÃO quando não há evento até a data — inclusive
    // ANTES da admissão. Sem a conferência de existência, "RPPS em janeiro" traria quem entrou em
    // agosto. Aqui a professora foi admitida em 2020/03: perguntar por 2019 tem de dar não.
    expect(vinculoAtendeAosEixos(professora, eixos({ regimePrevidenciario: "RPPS" }), D(2019, 12, 31))).toBe(false);
    expect(vinculoAtendeAosEixos(professora, eixos({ cargoIds: ["cargo-professor"] }), D(2019, 12, 31))).toBe(false);
    expect(vinculoAtendeAosEixos(professora, eixos({ regimePrevidenciario: "RPPS" }), D(2020, 3, 1))).toBe(true);
  });

  it("NAO_INFORMADO acha exatamente as matrículas que a folha recusa calcular — e só elas", () => {
    const semRegime: VinculoParaConsulta = { ...professora, matricula: "3001", regimePrevidenciario: null, eventos: [ev(D(2020, 3, 1), "ADMISSAO", { cargoId: "cargo-professor", lotacaoId: "lot-escola" })] };
    expect(vinculoAtendeAosEixos(semRegime, eixos({ regimePrevidenciario: "NAO_INFORMADO" }), HOJE)).toBe(true);
    expect(vinculoAtendeAosEixos(professora, eixos({ regimePrevidenciario: "NAO_INFORMADO" }), HOJE)).toBe(false);
    // Antes da admissão não é "não informado": é "não existia".
    expect(vinculoAtendeAosEixos(semRegime, eixos({ regimePrevidenciario: "NAO_INFORMADO" }), D(2019, 1, 1))).toBe(false);
  });

  it("CONJUNTO VAZIO DE CARGOS NÃO É EIXO INATIVO — é 'nenhum cargo casa', e a resposta é vazia", () => {
    expect(vinculoAtendeAosEixos(professora, eixos({ cargoIds: [] }), HOJE)).toBe(false);
    expect(vinculoAtendeAosEixos(professora, EIXOS_DE_CONSULTA_VAZIOS, HOJE)).toBe(true);
    expect(haEixoDeVinculo(eixos({ cargoIds: [] }))).toBe(true);
    expect(haEixoDeVinculo(EIXOS_DE_CONSULTA_VAZIOS)).toBe(false);
    expect(haEixoDerivadoDeVinculo(eixos({ matricula: "1001" }))).toBe(false);
    expect(haEixoDerivadoDeVinculo(eixos({ cargoIds: ["x"] }))).toBe(true);
    expect(haEixoDerivadoDeVinculo(eixos({ regimePrevidenciario: "RGPS" }))).toBe(true);
  });

  it("A JANELA DE ADMISSÃO É INCLUSIVA NAS DUAS BORDAS — 'admitidos até 15/08' inclui o dia 15", () => {
    expect(vinculoAtendeAosEixos(motorista, eixos({ admitidoAte: D(2022, 8, 15) }), HOJE)).toBe(true);
    expect(vinculoAtendeAosEixos(motorista, eixos({ admitidoDe: D(2022, 8, 15) }), HOJE)).toBe(true);
    expect(vinculoAtendeAosEixos(motorista, eixos({ admitidoAte: D(2022, 8, 14) }), HOJE)).toBe(false);
    expect(vinculoAtendeAosEixos(motorista, eixos({ admitidoDe: D(2022, 8, 16) }), HOJE)).toBe(false);
    expect(AS_DUAS.filter((v) => vinculoAtendeAosEixos(v, eixos({ admitidoDe: D(2021, 1, 1) }), HOJE)).map((v) => v.matricula)).toEqual(["1002"]);
  });
});
