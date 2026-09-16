import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { diaCivil } from "../packages/datas/index.js";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { limparBanco } from "./limpar-banco.js";
import { cadastrarImovel, encerrarVinculoComImovel, imovelPorInscricao, novaVersaoDoImovel, versaoDoImovelNoDia, vincularPessoaAoImovel } from "../modules/m34-tributario/cadastro-imobiliario.js";
import { publicarTabelaDeParametros, simularTributo, tabelaVigente } from "../modules/m34-tributario/simulacao.js";

/**
 * ═══ O CADASTRO IMOBILIÁRIO HISTÓRICO E A SIMULAÇÃO COM MEMÓRIA (V7 B1) ═══
 *
 * ⚠️ A CONFIGURAÇÃO É SINTÉTICA E DECLARADA — nenhuma alíquota, planta de valores ou fórmula de município real. O
 * exercício é 2026 e a tabela abaixo é do "ente de teste":
 *
 *   fórmula: `arredondar(max(areaConstruida * valorDoM2Construido + areaDoTerreno * valorDoM2Terreno, valorMinimo)
 *             * se(usoResidencial = 1, aliquotaResidencial, aliquotaOutros), 2)`
 *   parâmetros: valorDoM2Construido = 1200, valorDoM2Terreno = 300, valorMinimo = 50000,
 *               aliquotaResidencial = 0.005, aliquotaOutros = 0.01
 *
 * O IMÓVEL: terreno 360 m², construída 120 m², uso residencial.
 *   base = 120 × 1200 + 360 × 300 = 144.000 + 108.000 = 252.000 (acima do mínimo de 50.000)
 *   IPTU = 252.000 × 0,005 = 1.260,00  ← ESPERADO, calculado à mão, fora do motor.
 * Versão 2 do cadastro (construída 200 m², a partir de 2027-01-01):
 *   base = 200 × 1200 + 360 × 300 = 240.000 + 108.000 = 348.000 → 348.000 × 0,005 = 1.740,00.
 * Versão 2 da tabela (aliquotaResidencial 0,006 desde 2026-07-01):
 *   252.000 × 0,006 = 1.512,00.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const CADASTRO = "cadastro.imobiliario@teste.local";
const TRIBUTARIO = "administracao.tributaria@teste.local";
const OUTRO = "outro.setor.b1@teste.local";
const DOC_A = "52998224725";
const DOC_B = "86288366757";

const FORMULA = "arredondar(max(areaConstruida * valorDoM2Construido + areaDoTerreno * valorDoM2Terreno, valorMinimo) * se(usoResidencial = 1, aliquotaResidencial, aliquotaOutros), 2)";
const PARAMETROS = [
  { chave: "valorDoM2Construido", valor: "1200", descricao: "Valor do m² construído da planta sintética" },
  { chave: "valorDoM2Terreno", valor: "300", descricao: "Valor do m² de terreno da planta sintética" },
  { chave: "valorMinimo", valor: "50000", descricao: "Base mínima declarada na tabela sintética" },
  { chave: "aliquotaResidencial", valor: "0.005", descricao: "Alíquota residencial sintética" },
  { chave: "aliquotaOutros", valor: "0.01", descricao: "Alíquota dos demais usos, sintética" },
];

async function conta(identificador: string, acoes: readonly string[]): Promise<void> {
  const p = await prisma.perfil.create({ data: { nome: `P-${identificador}`, descricao: "teste", criadoPor: "SEED", permissoes: { create: acoes.map((acao) => ({ acao: acao as never, criadoPor: "SEED" })) } }, select: { id: true } });
  const u = await prisma.usuario.create({ data: { identificador, nome: identificador, criadoPor: "SEED" }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "SEED" } });
}

async function pessoa(documento: string, nome: string): Promise<void> {
  await prisma.pessoa.create({ data: { documento, tipo: "FISICA", criadoPor: "SEED", versoes: { create: { nome, criadoPor: "SEED" } } } });
}

const imovel = (extra: Record<string, unknown> = {}) =>
  cadastrarImovel(prisma, {
    inscricao: "01.02.003.0004", vigenciaInicio: "2026-01-01", motivo: "Cadastro inicial do imóvel",
    logradouro: "Rua Sintética", numero: "100", bairro: "Centro", zona: "Z1", uso: "RESIDENCIAL", padraoConstrutivo: "Médio",
    areaDoTerreno: "360", areaConstruida: "120", criadoPor: CADASTRO, ...extra,
  } as never);

const tabela = (extra: Record<string, unknown> = {}) =>
  publicarTabelaDeParametros(prisma, { tributo: "IPTU", exercicio: 2026, vigenciaInicio: "2026-01-01", fundamento: "Lei municipal sintética nº 1/2025, art. 5º", motivo: "Tabela do exercício", formula: FORMULA, parametros: PARAMETROS, criadoPor: TRIBUTARIO, ...extra } as never);

beforeEach(async () => {
  await limparBanco(prisma);
  await conta(CADASTRO, ["GERIR_CADASTRO_IMOBILIARIO"]);
  await conta(TRIBUTARIO, ["GERIR_PARAMETROS_TRIBUTARIOS"]);
  await conta(OUTRO, ["CONSULTAR_RECEITA"]);
  await pessoa(DOC_A, "Maria do Carmo (sintética)");
  await pessoa(DOC_B, "João Ribeiro (sintético)");
}, 120_000);

describe("B1 — o cadastro imobiliário histórico", () => {
  it("CI01: o imóvel nasce com a versão 1; a versão nova não reescreve a anterior e cada dia acha a sua", async () => {
    const { imovelId } = await imovel();
    await expect(imovel()).rejects.toThrow(/INSCRICAO-JA-CADASTRADA/);
    const v2 = await novaVersaoDoImovel(prisma, { imovelId, vigenciaInicio: "2027-01-01", motivo: "Ampliação averbada", logradouro: "Rua Sintética", numero: "100", bairro: "Centro", zona: "Z1", uso: "RESIDENCIAL", padraoConstrutivo: "Médio", areaDoTerreno: "360", areaConstruida: "200", atributos: [{ chave: "pavimentos", valor: "2" }], criadoPor: CADASTRO });
    expect(v2.versao).toBe(2);
    await expect(novaVersaoDoImovel(prisma, { imovelId, vigenciaInicio: "2026-06-01", motivo: "Tentativa de intercalar versão antiga", logradouro: "Rua Sintética", numero: "100", bairro: "Centro", uso: "RESIDENCIAL", areaDoTerreno: "360", areaConstruida: "150", criadoPor: CADASTRO })).rejects.toThrow(/VIGENCIA-ANTERIOR-A-VERSAO-VIGENTE/);
    expect((await versaoDoImovelNoDia(prisma, imovelId, "2026-12-31"))).toMatchObject({ versao: 1, areaConstruida: "120.0000" });
    expect((await versaoDoImovelNoDia(prisma, imovelId, "2027-01-01"))).toMatchObject({ versao: 2, areaConstruida: "200.0000", atributos: [{ chave: "pavimentos", valor: "2.000000" }] });
    expect(await versaoDoImovelNoDia(prisma, imovelId, "2025-12-31")).toBeNull();
    const lido = (await imovelPorInscricao(prisma, "01.02.003.0004"))!;
    expect(lido.versoes.map((v) => v.versao)).toEqual([2, 1]);
    // Outro setor, sem a ação, não cadastra.
    await expect(imovel({ inscricao: "09.09.009.0009", criadoPor: OUTRO })).rejects.toThrow(/ACESSO NEGADO[\s\S]*GERIR_CADASTRO_IMOBILIARIO/);
    expect(await prisma.imovel.count()).toBe(1);
  });

  it("CI02: os vínculos com a Pessoa têm papel, fração e vigência; a soma do papel não passa de 100%, e encerrar é fato", async () => {
    const { imovelId } = await imovel();
    await expect(vincularPessoaAoImovel(prisma, { imovelId, pessoaDocumento: "11111111111", papel: "PROPRIETARIO", fracao: "1", vigenciaInicio: "2026-01-01", motivo: "Escritura registrada", criadoPor: CADASTRO })).rejects.toThrow(/PESSOA-NAO-CADASTRADA/);
    await expect(vincularPessoaAoImovel(prisma, { imovelId, pessoaDocumento: DOC_A, papel: "PROPRIETARIO", fracao: "0.6", vigenciaInicio: "2026-01-01", motivo: "Escritura registrada", criadoPor: CADASTRO })).resolves.toMatchObject({ fracaoDoPapel: "0.600000" });
    await expect(vincularPessoaAoImovel(prisma, { imovelId, pessoaDocumento: DOC_B, papel: "PROPRIETARIO", fracao: "0.6", vigenciaInicio: "2026-01-01", motivo: "Escritura registrada", criadoPor: CADASTRO })).rejects.toThrow(/FRACAO-ACIMA-DO-INTEIRO: as frações vigentes de proprietario .* somariam 1\.200000/);
    const b = await vincularPessoaAoImovel(prisma, { imovelId, pessoaDocumento: DOC_B, papel: "PROPRIETARIO", fracao: "0.4", vigenciaInicio: "2026-01-01", motivo: "Escritura registrada", criadoPor: CADASTRO });
    await expect(vincularPessoaAoImovel(prisma, { imovelId, pessoaDocumento: DOC_B, papel: "PROPRIETARIO", fracao: "0.1", vigenciaInicio: "2026-02-01", motivo: "Tentativa de repetir o vínculo", criadoPor: CADASTRO })).rejects.toThrow(/VINCULO-JA-EXISTE/);
    // O mesmo dono pode ser RESPONSÁVEL TRIBUTÁRIO integral: o papel é outro.
    await expect(vincularPessoaAoImovel(prisma, { imovelId, pessoaDocumento: DOC_A, papel: "RESPONSAVEL_TRIBUTARIO", fracao: "1", vigenciaInicio: "2026-01-01", motivo: "Acordo entre os coproprietários", criadoPor: CADASTRO })).resolves.toMatchObject({ fracaoDoPapel: "1.000000" });
    await expect(encerrarVinculoComImovel(prisma, { vinculoId: b.vinculoId, dataEfeito: "2025-12-01", motivo: "Tentativa antes da vigência", criadoPor: CADASTRO })).rejects.toThrow(/ENCERRAMENTO-ANTES-DA-VIGENCIA/);
    await encerrarVinculoComImovel(prisma, { vinculoId: b.vinculoId, dataEfeito: "2026-07-01", motivo: "Venda da fração ao coproprietário", criadoPor: CADASTRO });
    await expect(encerrarVinculoComImovel(prisma, { vinculoId: b.vinculoId, dataEfeito: "2026-08-01", motivo: "Tentativa de encerrar de novo", criadoPor: CADASTRO })).rejects.toThrow(/VINCULO-JA-ENCERRADO/);
    // Encerrado, a fração dele volta a caber a partir do efeito — e o histórico continua.
    await expect(vincularPessoaAoImovel(prisma, { imovelId, pessoaDocumento: DOC_B, papel: "PROPRIETARIO", fracao: "0.4", vigenciaInicio: "2026-07-01", motivo: "Recompra registrada", criadoPor: CADASTRO })).resolves.toMatchObject({ fracaoDoPapel: "1.000000" });
    const lido = (await imovelPorInscricao(prisma, "01.02.003.0004"))!;
    expect(lido.vinculos.filter((v) => v.papel === "PROPRIETARIO").map((v) => [v.fracao, v.encerrado?.dataEfeito ?? null])).toEqual([["0.600000", null], ["0.400000", "2026-07-01"], ["0.400000", null]]);
  });
});

describe("B1 — os parâmetros do tributo e a simulação", () => {
  it("SI01: a simulação resolve versão e tabela do dia, calcula o esperado e traz a memória — sem gravar nada", async () => {
    const { imovelId } = await imovel();
    await vincularPessoaAoImovel(prisma, { imovelId, pessoaDocumento: DOC_A, papel: "PROPRIETARIO", fracao: "0.75", vigenciaInicio: "2026-01-01", motivo: "Escritura registrada", criadoPor: CADASTRO });
    await vincularPessoaAoImovel(prisma, { imovelId, pessoaDocumento: DOC_B, papel: "PROPRIETARIO", fracao: "0.25", vigenciaInicio: "2026-01-01", motivo: "Escritura registrada", criadoPor: CADASTRO });
    await expect(simularTributo(prisma, { imovelId, tributo: "IPTU", exercicio: 2026 })).rejects.toThrow(/SEM-TABELA-PUBLICADA: não há tabela de IPTU do exercício 2026/);
    const t = await tabela();
    expect(t.versao).toBe(1);
    const antes = [await prisma.imovel.count(), await prisma.versaoDoImovel.count(), await prisma.tabelaDeParametrosTributarios.count()];
    const r = await simularTributo(prisma, { imovelId, tributo: "IPTU", exercicio: 2026 });
    // 120 × 1200 + 360 × 300 = 252.000; 252.000 × 0,005 = 1.260,00 (conta feita à mão, fora do motor).
    expect(r.valor).toBe("1260.00");
    expect(r.imovel).toMatchObject({ inscricao: "01.02.003.0004", versao: 1 });
    expect(r.tabela).toMatchObject({ versao: 1, fundamento: "Lei municipal sintética nº 1/2025, art. 5º" });
    // ⚠️ `aliquotaOutros` NÃO aparece: o `se` só avalia o ramo tomado, e a memória traz o que a conta REALMENTE usou.
    expect(r.memoria).toEqual([
      { nome: "aliquotaResidencial", valor: "0.005", origem: "parâmetro da tabela" },
      { nome: "areaConstruida", valor: "120", origem: "cadastro" },
      { nome: "areaDoTerreno", valor: "360", origem: "cadastro" },
      { nome: "usoResidencial", valor: "1", origem: "cadastro" },
      { nome: "valorDoM2Construido", valor: "1200", origem: "parâmetro da tabela" },
      { nome: "valorDoM2Terreno", valor: "300", origem: "parâmetro da tabela" },
      { nome: "valorMinimo", valor: "50000", origem: "parâmetro da tabela" },
    ]);
    // O rateio é informativo: 75% e 25% de 1.260,00.
    expect(r.responsaveis.map((x) => [x.papel, x.fracao, x.valorProporcional])).toEqual([["PROPRIETARIO", "0.750000", "945.00"], ["PROPRIETARIO", "0.250000", "315.00"]]);
    // SIMULAR NÃO GRAVA: nenhuma linha nova, nenhum lançamento, nenhuma dívida.
    expect([await prisma.imovel.count(), await prisma.versaoDoImovel.count(), await prisma.tabelaDeParametrosTributarios.count()]).toEqual(antes);
  });

  it("SI02: versão nova do cadastro e da tabela mudam a conta dali em diante; o exercício anterior continua o mesmo", async () => {
    const { imovelId } = await imovel();
    await tabela();
    await novaVersaoDoImovel(prisma, { imovelId, vigenciaInicio: "2027-01-01", motivo: "Ampliação averbada", logradouro: "Rua Sintética", numero: "100", bairro: "Centro", zona: "Z1", uso: "RESIDENCIAL", padraoConstrutivo: "Médio", areaDoTerreno: "360", areaConstruida: "200", criadoPor: CADASTRO });
    await publicarTabelaDeParametros(prisma, { tributo: "IPTU", exercicio: 2027, vigenciaInicio: "2027-01-01", fundamento: "Lei municipal sintética nº 2/2026, art. 3º", motivo: "Tabela do exercício seguinte", formula: FORMULA, parametros: PARAMETROS, criadoPor: TRIBUTARIO });
    // 2026 continua 1.260,00; 2027, com 200 m² construídos: 348.000 × 0,005 = 1.740,00.
    expect((await simularTributo(prisma, { imovelId, tributo: "IPTU", exercicio: 2026 })).valor).toBe("1260.00");
    expect((await simularTributo(prisma, { imovelId, tributo: "IPTU", exercicio: 2027 })).valor).toBe("1740.00");
    // Versão 2 da tabela de 2026, valendo de julho: 252.000 × 0,006 = 1.512,00 — e janeiro continua 1.260,00.
    const v2 = await publicarTabelaDeParametros(prisma, { tributo: "IPTU", exercicio: 2026, vigenciaInicio: "2026-07-01", fundamento: "Lei municipal sintética nº 3/2026, art. 1º", motivo: "Correção da alíquota residencial", formula: FORMULA, parametros: PARAMETROS.map((p) => (p.chave === "aliquotaResidencial" ? { ...p, valor: "0.006" } : p)), criadoPor: TRIBUTARIO });
    expect(v2.versao).toBe(2);
    expect((await simularTributo(prisma, { imovelId, tributo: "IPTU", exercicio: 2026, dia: "2026-01-01" })).valor).toBe("1260.00");
    const julho = await simularTributo(prisma, { imovelId, tributo: "IPTU", exercicio: 2026, dia: "2026-07-01" });
    expect([julho.valor, julho.tabela.versao]).toEqual(["1512.00", 2]);
    expect((await tabelaVigente(prisma, "IPTU", 2026, "2026-06-30"))!.versao).toBe(1);
    await expect(publicarTabelaDeParametros(prisma, { tributo: "IPTU", exercicio: 2026, vigenciaInicio: "2026-03-01", fundamento: "Lei sintética", motivo: "Tentativa de intercalar", formula: FORMULA, parametros: PARAMETROS, criadoPor: TRIBUTARIO })).rejects.toThrow(/VIGENCIA-ANTERIOR-A-VERSAO-VIGENTE/);
  });

  it("SI03: a fórmula é do ente e é conferida na publicação; variável sem origem, fórmula inválida e falta de ação recusam", async () => {
    const { imovelId } = await imovel({ inscricao: "07.07.007.0007", uso: "COMERCIAL" });
    await expect(publicarTabelaDeParametros(prisma, { tributo: "IPTU", exercicio: 2026, vigenciaInicio: "2026-01-01", fundamento: "Lei sintética", motivo: "Fórmula com variável inexistente", formula: "areaConstruida * valorDaPlantaGenerica", parametros: PARAMETROS, criadoPor: TRIBUTARIO })).rejects.toThrow(/VARIAVEL-SEM-ORIGEM: a fórmula usa "valorDaPlantaGenerica"/);
    await expect(publicarTabelaDeParametros(prisma, { tributo: "IPTU", exercicio: 2026, vigenciaInicio: "2026-01-01", fundamento: "Lei sintética", motivo: "Fórmula com escape", formula: "this.constructor.constructor('return process')()", parametros: PARAMETROS, criadoPor: TRIBUTARIO })).rejects.toThrow(/FORMULA-INVALIDA/);
    await expect(publicarTabelaDeParametros(prisma, { tributo: "IPTU", exercicio: 2026, vigenciaInicio: "2026-01-01", fundamento: "Lei sintética", motivo: "Sem a ação", formula: FORMULA, parametros: PARAMETROS, criadoPor: CADASTRO })).rejects.toThrow(/ACESSO NEGADO[\s\S]*GERIR_PARAMETROS_TRIBUTARIOS/);
    expect(await prisma.tabelaDeParametrosTributarios.count()).toBe(0);
    await tabela();
    // Uso comercial: 252.000 × 0,01 = 2.520,00 — a mesma fórmula, o outro ramo do `se`.
    const r = await simularTributo(prisma, { imovelId, tributo: "IPTU", exercicio: 2026 });
    expect(r.valor).toBe("2520.00");
    expect(r.avisos).toEqual(["O imóvel não tem vínculo vigente de pessoa neste dia: a simulação não tem a quem atribuir."]);
    // O atributo do imóvel entra na conta: uma tabela que o usa fica por conta do cadastro de cada imóvel.
    await novaVersaoDoImovel(prisma, { imovelId, vigenciaInicio: "2026-02-01", motivo: "Levantamento de campo", logradouro: "Rua Sintética", numero: "100", bairro: "Centro", uso: "COMERCIAL", areaDoTerreno: "360", areaConstruida: "120", atributos: [{ chave: "fatorDeEsquina", valor: "1.1", descricao: "Imóvel de esquina" }], criadoPor: CADASTRO });
    await publicarTabelaDeParametros(prisma, { tributo: "TAXA", exercicio: 2026, vigenciaInicio: "2026-01-01", fundamento: "Lei sintética de taxas, art. 2º", motivo: "Taxa sintética por área", formula: "arredondar(areaConstruida * valorPorM2 * fatorDeEsquina, 2)", parametros: [{ chave: "valorPorM2", valor: "2", descricao: "Valor sintético por m²" }, { chave: "fatorDeEsquina", valor: "1", descricao: "Padrão quando o imóvel não é de esquina" }], criadoPor: TRIBUTARIO });
    const taxa = await simularTributo(prisma, { imovelId, tributo: "TAXA", exercicio: 2026, dia: "2026-02-01" });
    // 120 × 2 × 1,1 = 264,00 — o atributo do imóvel prevaleceu sobre o padrão da tabela, e o aviso diz isso.
    expect(taxa.valor).toBe("264.00");
    expect(taxa.memoria.find((m) => m.nome === "fatorDeEsquina")).toEqual({ nome: "fatorDeEsquina", valor: "1.1", origem: "atributo do imóvel" });
    expect(taxa.avisos[0]).toMatch(/atributo "fatorDeEsquina" do imóvel foi usado no lugar do parâmetro/);
    // Sem versão do cadastro naquele dia, a simulação recusa em vez de inventar base.
    await expect(simularTributo(prisma, { imovelId, tributo: "TAXA", exercicio: 2026, dia: "2025-01-01" })).rejects.toThrow(/CADASTRO-SEM-VERSAO-NO-DIA/);
  });
});

/** O dia de hoje não entra nas contas acima: as vigências são declaradas. Guardado para a leitura do próximo. */
export const HOJE_NAO_IMPORTA = diaCivil(new Date());
