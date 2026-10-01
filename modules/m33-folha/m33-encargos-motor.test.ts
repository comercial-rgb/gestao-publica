import { describe, expect, it } from "vitest";
import { Decimal, toMoney } from "../../packages/contracts/index.js";
import {
  apurarEncargos,
  diferencaAEmpenhar,
  elegibilidadeParaApropriarEncargos,
  elegibilidadeParaCertificarEncargos,
  elegibilidadeParaLiquidarEncargos,
  versaoVigente,
  type ComponenteParaApurar,
  type ContrachequeParaApurar,
  type EstadoDosEncargos,
  type VersaoParaApurar,
} from "./encargos.js";

/**
 * ═══ O MOTOR DOS ENCARGOS — PROFUNDIDADE, SEM BANCO ═══
 *
 * ⚠️ OS ESPERADOS SÃO CONTAS FEITAS À MÃO, escritas como literais — nenhum sai do motor. Cada um tem a
 * conta ao lado. Os percentuais são SINTÉTICOS (20%, 1,5%, 11%): não afirmam alíquota oficial.
 *
 * FIXTURE N=2 em tudo: dois vínculos RGPS e um RPPS; dois componentes RGPS e um RPPS; duas versões
 * com mudança de vigência; uma rubrica que NÃO incide; um valor com meio centavo (arredondamento).
 */

const PATR: ComponenteParaApurar = { id: "c-patr", codigo: "RGPS-PATRONAL", descricao: "Cota patronal RGPS", tipo: "PREVIDENCIA_PATRONAL", regime: "RGPS" };
const RAT: ComponenteParaApurar = { id: "c-rat", codigo: "RGPS-RAT", descricao: "Risco ambiental do trabalho", tipo: "RISCO_AMBIENTAL_DO_TRABALHO", regime: "RGPS" };
const RPPS: ComponenteParaApurar = { id: "c-rpps", codigo: "RPPS-PATRONAL", descricao: "Contribuição patronal RPPS", tipo: "PREVIDENCIA_PATRONAL", regime: "RPPS" };

const versao = (p: Omit<Partial<VersaoParaApurar>, "aliquota"> & { id: string; componenteId: string; aliquota: string }): VersaoParaApurar => ({
  competenciaInicio: "2026-01", competenciaFim: null, teto: null, rubricasIncidentes: ["r-venc", "r-hext"], fundamentacaoLegal: "fixture sintética", sintetica: true, aprovada: true,
  ...p, aliquota: new Decimal(p.aliquota),
});

const linha = (rubricaId: string, codigo: string, valor: string, tipo: "PROVENTO" | "DESCONTO" = "PROVENTO") => ({ rubricaId, codigo, tipo, valor: toMoney(valor) });

const CC: readonly ContrachequeParaApurar[] = [
  // MAT-A: vencimento 3000,00 + horas extras 500,00 (incidem) + diária 200,00 (NÃO incide) − contribuição 350,00
  { vinculoId: "v-a", matricula: "MAT-A", regime: "RGPS", linhas: [linha("r-venc", "VENC", "3000.00"), linha("r-hext", "HEXT", "500.00"), linha("r-diaria", "DIARIA", "200.00"), linha("r-prev", "PREV", "350.00", "DESCONTO")] },
  // MAT-B: vencimento 2000,03 — 1,5% dá 30,00045 (arredonda 30,00); 20% dá 400,006 (arredonda 400,01)
  { vinculoId: "v-b", matricula: "MAT-B", regime: "RGPS", linhas: [linha("r-venc", "VENC", "2000.03")] },
  // MAT-C: RPPS, vencimento 4000,00
  { vinculoId: "v-c", matricula: "MAT-C", regime: "RPPS", linhas: [linha("r-venc", "VENC", "4000.00")] },
];

const VERSOES: readonly VersaoParaApurar[] = [
  versao({ id: "vp-1", componenteId: "c-patr", aliquota: "0.20" }),
  versao({ id: "vr-1", componenteId: "c-rat", aliquota: "0.015" }),
  versao({ id: "vs-1", componenteId: "c-rpps", aliquota: "0.11", rubricasIncidentes: ["r-venc"] }),
];

const apurar = (versoes = VERSOES, competencia = "2026-05", cc = CC, comps = [PATR, RAT, RPPS]) =>
  apurarEncargos({ competencia, calculo: { numero: 1, sha256: "a".repeat(64) }, contracheques: cc, componentes: comps, versoes });

describe("a apuração — conta a conta, contra números escritos à mão", () => {
  it("base incidente exclui a rubrica que não incide e o desconto; arredonda por vínculo, meio-par", () => {
    const r = apurar();
    const v = (m: string, c: string) => r.itens.find((i) => i.matricula === m && i.componente === c);
    // MAT-A patronal: (3000 + 500) × 0,20 = 700,00 — a diária de 200 e o desconto de 350 NÃO entram
    expect(v("MAT-A", "RGPS-PATRONAL")?.baseIncidente).toBe("3500.00");
    expect(v("MAT-A", "RGPS-PATRONAL")?.valor).toBe("700.00");
    // MAT-A RAT: 3500 × 0,015 = 52,50
    expect(v("MAT-A", "RGPS-RAT")?.valor).toBe("52.50");
    // MAT-B patronal: 2000,03 × 0,20 = 400,006 → 400,01
    expect(v("MAT-B", "RGPS-PATRONAL")?.valor).toBe("400.01");
    // MAT-B RAT: 2000,03 × 0,015 = 30,00045 → 30,00
    expect(v("MAT-B", "RGPS-RAT")?.valor).toBe("30.00");
    // MAT-C RPPS: 4000 × 0,11 = 440,00
    expect(v("MAT-C", "RPPS-PATRONAL")?.valor).toBe("440.00");
  });

  it("NÃO APLICÁVEL pelo regime DO CONTRACHEQUE; a soma dos itens bate com o total", () => {
    const r = apurar();
    expect(r.itens.find((i) => i.matricula === "MAT-C" && i.componente === "RGPS-PATRONAL")?.situacao).toBe("NAO_APLICAVEL");
    expect(r.itens.find((i) => i.matricula === "MAT-A" && i.componente === "RPPS-PATRONAL")?.situacao).toBe("NAO_APLICAVEL");
    // 700,00 + 52,50 + 400,01 + 30,00 + 440,00 = 1622,51
    expect(r.total.toFixed(2)).toBe("1622.51");
    expect(r.porComponente.map((p) => `${p.codigo}=${p.total}`)).toEqual(["RGPS-PATRONAL=1100.01", "RGPS-RAT=82.50", "RPPS-PATRONAL=440.00"]);
    expect(r.esperados).toBe(5);
    expect(r.completa).toBe(true);
  });

  it("PARÂMETRO AUSENTE não vira zero: a apuração fica INCOMPLETA e o total não o soma", () => {
    const semRat = VERSOES.filter((v) => v.componenteId !== "c-rat");
    const r = apurar(semRat);
    const rat = r.itens.filter((i) => i.componente === "RGPS-RAT" && i.regime === "RGPS");
    expect(rat.map((i) => i.situacao)).toEqual(["PARAMETRO_AUSENTE", "PARAMETRO_AUSENTE"]);
    expect(rat.every((i) => i.valor === undefined)).toBe(true);
    expect(r.completa).toBe(false);
    expect(r.total.toFixed(2)).toBe("1540.01"); // 1622,51 − 82,50
  });

  it("versão NÃO APROVADA não vale — e o motivo diz isso, em vez de 'não há versão'", () => {
    const naoAprovada = VERSOES.map((v) => (v.componenteId === "c-rat" ? { ...v, aprovada: false } : v));
    const r = apurar(naoAprovada);
    expect(r.itens.find((i) => i.componente === "RGPS-RAT")?.motivo).toMatch(/NÃO aprovada/);
  });

  it("ZERO CALCULADO é legítimo e distinto: base incidente zero com parâmetro vigente", () => {
    const soDiaria: ContrachequeParaApurar[] = [{ vinculoId: "v-d", matricula: "MAT-D", regime: "RGPS", linhas: [linha("r-diaria", "DIARIA", "900.00")] }, ...CC.slice(1)];
    const r = apurar(VERSOES, "2026-05", soDiaria);
    const d = r.itens.find((i) => i.matricula === "MAT-D" && i.componente === "RGPS-PATRONAL");
    expect(d?.situacao).toBe("ZERO_CALCULADO");
    expect(d?.valor).toBe("0.00");
    expect(r.completa).toBe(true);
  });

  it("MUDANÇA DE VIGÊNCIA: 20% até abril, 22% a partir de maio — cada competência usa a sua", () => {
    const duas = [
      ...VERSOES.filter((v) => v.componenteId !== "c-patr"),
      versao({ id: "vp-1", componenteId: "c-patr", aliquota: "0.20", competenciaInicio: "2026-01", competenciaFim: "2026-04" }),
      versao({ id: "vp-2", componenteId: "c-patr", aliquota: "0.22", competenciaInicio: "2026-05" }),
    ];
    const abril = apurar(duas, "2026-04");
    const maio = apurar(duas, "2026-05");
    // abril: 3500 × 0,20 = 700,00; maio: 3500 × 0,22 = 770,00
    expect(abril.itens.find((i) => i.matricula === "MAT-A" && i.componente === "RGPS-PATRONAL")?.valor).toBe("700.00");
    expect(maio.itens.find((i) => i.matricula === "MAT-A" && i.componente === "RGPS-PATRONAL")?.valor).toBe("770.00");
    // e um parâmetro FUTURO (a partir de 2027) não mexe em 2026
    const futura = [...duas, versao({ id: "vp-3", componenteId: "c-patr", aliquota: "0.30", competenciaInicio: "2027-01" })];
    expect(apurar(futura, "2026-05").sha256).toBe(maio.sha256);
  });

  it("TETO aplicado à base, e dito na memória", () => {
    const comTeto = VERSOES.map((v) => (v.componenteId === "c-patr" ? { ...v, teto: toMoney("2500.00") } : v));
    const a = apurar(comTeto).itens.find((i) => i.matricula === "MAT-A" && i.componente === "RGPS-PATRONAL");
    // min(3500, 2500) × 0,20 = 500,00
    expect([a?.tetoAplicado, a?.base, a?.valor]).toEqual([true, "2500.00", "500.00"]);
  });

  it("duas versões aprovadas com o mesmo início: ambíguo — ausente com motivo, nunca a primeira que vier", () => {
    const amb = [...VERSOES, versao({ id: "vp-x", componenteId: "c-patr", aliquota: "0.25" })];
    const v = versaoVigente(amb, "c-patr", "2026-05");
    expect("motivo" in v ? v.motivo : "").toMatch(/ambíguo/);
  });

  it("o sha256 é do resultado: igual com a mesma entrada; muda com um centavo; a versão sintética é dita", () => {
    const a = apurar();
    expect(apurar().sha256).toBe(a.sha256);
    const outro = [{ ...CC[0]!, linhas: [linha("r-venc", "VENC", "3000.01"), ...CC[0]!.linhas.slice(1)] }, ...CC.slice(1)];
    expect(apurar(VERSOES, "2026-05", outro).sha256).not.toBe(a.sha256);
    expect(a.itens.filter((i) => i.situacao === "CALCULADO").every((i) => i.sintetica === true)).toBe(true);
  });
});

describe("a diferença a empenhar", () => {
  it.each([
    ["1100.01", "0.00", "EMPENHAR 1100.01"],
    ["1210.01", "1100.01", "EMPENHAR 110.00"],
    ["1100.01", "1100.01", "NADA"],
    ["1000.00", "1100.01", "REDUCAO 100.01"],
  ])("pedido %s, já empenhado %s → %s", (pedido, ja, esperado) => {
    const d = diferencaAEmpenhar(toMoney(pedido), toMoney(ja));
    expect(d.tipo === "NADA" ? "NADA" : `${d.tipo} ${d.valor.toFixed(2)}`).toBe(esperado);
  });
});

describe("os predicados dos atos sobre os encargos", () => {
  const BASE: EstadoDosEncargos = { competencia: "2026-05", fechada: true, apuracao: { numero: 1, completa: true, apuradaPor: "rh" }, certificacao: "PENDENTE", gruposPendentesDeEmpenho: 1, componentesSemGrupo: [], empenhosDaApuracao: 0, liquidados: 0 };
  const cod = (e: ReturnType<typeof elegibilidadeParaApropriarEncargos>) => (e.situacao === "ELEGIVEL" ? "ELEGIVEL" : `${e.situacao}:${e.codigo}`);
  it("certificar: incompleta trava; quem apurou trava; certificada sai da barra; o atesto salarial não conta", () => {
    expect(cod(elegibilidadeParaCertificarEncargos({ ...BASE, apuracao: { numero: 1, completa: false, apuradaPor: "rh" } }, { apurou: false, certificou: false, designado: true }))).toBe("PRE_CONDICAO:APURACAO-INCOMPLETA");
    expect(cod(elegibilidadeParaCertificarEncargos(BASE, { apurou: true, certificou: false, designado: true }))).toBe("PRE_CONDICAO:AUTOCERTIFICACAO-DOS-ENCARGOS");
    expect(cod(elegibilidadeParaCertificarEncargos({ ...BASE, certificacao: "CERTIFICADA" }, { apurou: false, certificou: false, designado: false }))).toBe("NAO_APLICAVEL:ENCARGOS-JA-CERTIFICADOS");
    expect(cod(elegibilidadeParaCertificarEncargos(BASE, { apurou: false, certificou: false, designado: true }))).toBe("ELEGIVEL");
  });
  it("empenhar: incompleta trava (empenhar uma parte seria afirmar o todo); nada pendente sai da barra", () => {
    expect(cod(elegibilidadeParaApropriarEncargos({ ...BASE, apuracao: { numero: 2, completa: false, apuradaPor: "rh" } }))).toBe("PRE_CONDICAO:APURACAO-INCOMPLETA");
    expect(cod(elegibilidadeParaApropriarEncargos({ ...BASE, gruposPendentesDeEmpenho: 0 }))).toBe("NAO_APLICAVEL:ENCARGOS-JA-EMPENHADOS");
  });
  it("liquidar: sem atesto DOS ENCARGOS trava — mesmo com a folha salarial certificada; quem certificou não liquida", () => {
    const empenhada = { ...BASE, empenhosDaApuracao: 2, gruposPendentesDeEmpenho: 0 };
    expect(cod(elegibilidadeParaLiquidarEncargos(empenhada, { apurou: false, certificou: false, designado: null }))).toBe("PRE_CONDICAO:ENCARGOS-NAO-CERTIFICADOS");
    expect(cod(elegibilidadeParaLiquidarEncargos({ ...empenhada, certificacao: "CERTIFICADA" }, { apurou: false, certificou: true, designado: null }))).toBe("PRE_CONDICAO:AUTOLIQUIDACAO-DOS-ENCARGOS");
    expect(cod(elegibilidadeParaLiquidarEncargos({ ...empenhada, certificacao: "CERTIFICADA", liquidados: 2 }, { apurou: false, certificou: false, designado: null }))).toBe("NAO_APLICAVEL:ENCARGOS-JA-LIQUIDADOS");
  });
});

describe("V24 — o FAP sobre o RAT (Lei 10.666/2003, art. 10; Decreto 3.048/1999, art. 202-A)", () => {
  const RAT_COM_FAP = [versao({ id: "vp-1", componenteId: "c-patr", aliquota: "0.20" }), versao({ id: "vr-fap", componenteId: "c-rat", aliquota: "0.02", aplicaFap: true }), versao({ id: "vs-1", componenteId: "c-rpps", aliquota: "0.11", rubricasIncidentes: ["r-venc"] })];
  const com = (fap?: Parameters<typeof apurarEncargos>[0]["fap"], versoes: readonly VersaoParaApurar[] = RAT_COM_FAP) =>
    apurarEncargos({ competencia: "2026-05", calculo: { numero: 1, sha256: "a".repeat(64) }, contracheques: CC, componentes: [PATR, RAT, RPPS], versoes, ...(fap === undefined ? {} : { fap }) });
  const item = (r: ReturnType<typeof com>, m: string) => r.itens.find((i) => i.matricula === m && i.componente === "RGPS-RAT");

  it("RAT 2% × FAP 1,2345 = 2,469%: MAT-A 3.500,00 → 86,42; MAT-B 2.000,03 → 49,38 (N=2)", () => {
    const r = com({ fator: new Decimal("1.2345"), fonte: "consulta ao FAP 2026" });
    // 3500 × 0,02 × 1,2345 = 3500 × 0,02469 = 86,415 → meio-par: 86,42
    expect(item(r, "MAT-A")?.valor).toBe("86.42");
    // 2000,03 × 0,02469 = 49,3807407 → 49,38
    expect(item(r, "MAT-B")?.valor).toBe("49.38");
    expect(item(r, "MAT-A")?.aliquota).toBe("0.0200");
    expect(item(r, "MAT-A")?.fap).toBe("1.2345");
    expect(item(r, "MAT-A")?.aliquotaAjustada).toBe("0.024690");
    expect(item(r, "MAT-A")?.fundamentacao).toMatch(/FAP 1\.2345 \(consulta ao FAP 2026\)/);
    expect(r.completa).toBe(true);
  });

  it("sem FAP, o RAT que o aplica fica AUSENTE com o motivo — e a apuração não se completa; os outros componentes seguem", () => {
    const sem = com();
    expect(item(sem, "MAT-A")?.situacao).toBe("PARAMETRO_AUSENTE");
    expect(item(sem, "MAT-A")?.motivo).toBe("FAP: não informado");
    expect(sem.completa).toBe(false);
    expect(sem.itens.find((i) => i.matricula === "MAT-A" && i.componente === "RGPS-PATRONAL")?.valor).toBe("700.00");
    const motivo = com({ motivo: "nenhum FAP aprovado para o CNPJ 12345678000195 em 2026" });
    expect(item(motivo, "MAT-B")?.motivo).toBe("FAP: nenhum FAP aprovado para o CNPJ 12345678000195 em 2026");
  });

  it("a versão que não aplica o FAP calcula igual com ou sem ele — e a memória (sha256) não muda", () => {
    const antes = apurar();
    const comFap = com({ fator: new Decimal("1.5000"), fonte: "x" }, VERSOES);
    expect(item(comFap, "MAT-A")?.valor).toBe("52.50");
    expect(item(comFap, "MAT-A")?.fap).toBeUndefined();
    expect(comFap.sha256).toBe(antes.sha256);
  });
});
