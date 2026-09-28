import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarM01Deps } from "../m01-core-contabil/adapter-prisma.js";
import { registrarLancamento } from "../m01-core-contabil/servico.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { roteiroArrecadacao } from "../m04-receita/dominio.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { roteiroEmpenho, roteiroLiquidacao } from "../m05-despesa/dominio.js";
import { empenhar, anularEmpenho } from "../m05-despesa/servico.js";
import { liquidar } from "../m05-despesa/servico-bloco2.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import { eliminacoesIntragovernamentais } from "./eliminacoes-intra.js";

/**
 * ELIMINAÇÕES INTRAGOVERNAMENTAIS (C07) — a eliminação é DEMONSTRATIVO, nada se escreve.
 *
 * ═══ ⚠️ FIXTURE N=2 POR CONSTRUÇÃO ═══
 * A regra só se manifesta em CONJUNTO: um par de eliminação com UMA guia de receita intra
 * passaria por vacuidade — qualquer implementação que ignorasse a segunda guia acertaria o total.
 * Por isso as receitas intra são DUAS (60.000 + 40.000) e as contrapartes são DUAS (uma que casa
 * com entidade cadastrada, outra que não casa).
 *
 * ═══ AS CONTAS, À MÃO, E COM O NOME OFICIAL — porque é o NOME que autoriza a eliminação ═══
 *   `3.5.1.3.2.00.00` TRANSFERÊNCIAS CONCEDIDAS PARA APORTES DE RECURSOS PARA O RPPS - INTRA OFSS
 *   `4.5.1.3.2.00.00` TRANSFERÊNCIAS RECEBIDAS PARA APORTES DE RECURSOS PARA O RPPS - INTRA OFSS
 *   `3.3.2.1.1.00.00` USO DE MATERIAL DE CONSUMO - CONSOLIDAÇÃO   <- NÃO é intra, e o par prova
 *
 * ⚠️ E O CAIXA DO MUNICÍPIO ENTRA DE PROPÓSITO EM `1.1.1.1.2.00.00`, que é onde este sistema o
 * põe hoje: no PCASP oficial esse código é **CAIXA E EQUIVALENTES ... - INTRA OFSS** (a pendência
 * `PLANO-DE-CONTAS-FORA-DO-PCASP`, já nomeada pelo repositório). O t6 mede a consequência.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "contabilidade@cg.pb.gov.br";
const EXERC = 2026;
const FONTE = "fnt-500";
const NAT_IPTU = "11130111";
/** Receita INTRA-orçamentária: categoria econômica 7. */
const NAT_INTRA_A = "71130111";
const NAT_INTRA_B = "71130112";

const CAIXA = "1.1.1.1.2.00.00";
const VPD_INTRA = "3.5.1.3.2.00.00";
const VPA_INTRA = "4.5.1.3.2.00.00";
const VPD_COMUM = "3.3.2.1.1.00.00";
const ATIVO_INTRA = "1.1.2.3.2.00.00";
const PASSIVO_INTRA = "2.1.1.2.2.00.00";

/** O CNPJ do fundo — a contraparte que CASA com entidade cadastrada. */
const CNPJ_FUNDO = "11222333000144";
/** Um credor que NÃO é entidade cadastrada — a contraparte que não se identifica. */
const CNPJ_ESTRANHO = "99888777000166";

const CONTAS = [
  // âncoras e analíticas do orçamentário (roteiros)
  { id: "c-disp", codigo: "6.2.2.1.1.00.00", nome: "CREDITO DISPONÍVEL", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-emp", codigo: "6.2.2.1.3.01.00", nome: "CREDITO EMPENHADO A LIQUIDAR", naturezaSaldo: "CREDORA" as const, nivel: 7, analitica: true },
  { id: "c-liq", codigo: "6.2.2.1.3.03.00", nome: "CREDITO LIQUIDADO A PAGAR", naturezaSaldo: "CREDORA" as const, nivel: 7, analitica: true },
  { id: "c-rar", codigo: "5.2.1.1.1.00.00", nome: "PREVISAO INICIAL DA RECEITA BRUTA", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-rr", codigo: "6.2.1.1.1.00.00", nome: "RECEITA A REALIZAR - CONSOLIDAÇÃO", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  // patrimonial — com o NOME OFICIAL, que é o que autoriza a classificação
  // ⚠️ O NOME QUE O SISTEMA USA HOJE, não o oficial — a fixture retrata a instalação real. O t6
  // troca pelo oficial e mede a consequência.
  { id: "c-caixa", codigo: CAIXA, nome: "Bancos Conta Movimento", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-forn", codigo: "2.1.3.1.1.00.00", nome: "FORNECEDORES E CONTAS A PAGAR NACIONAIS - CONSOLIDAÇÃO", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpa", codigo: "4.1.1.1.1.00.00", nome: "IMPOSTOS SOBRE COMERCIO EXTERIOR - CONSOLIDAÇÃO", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpd-comum", codigo: VPD_COMUM, nome: "USO DE MATERIAL DE CONSUMO - CONSOLIDAÇÃO", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpd-intra", codigo: VPD_INTRA, nome: "TRANSFERÊNCIAS CONCEDIDAS PARA APORTES DE RECURSOS PARA O RPPS - INTRA OFSS", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpa-intra", codigo: VPA_INTRA, nome: "TRANSFERÊNCIAS RECEBIDAS PARA APORTES DE RECURSOS PARA O RPPS - INTRA OFSS", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-ativo-intra", codigo: ATIVO_INTRA, nome: "CRÉDITOS DE TRANSFERÊNCIAS A RECEBER - INTRA OFSS", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-passivo-intra", codigo: PASSIVO_INTRA, nome: "BENEFÍCIOS PREVIDENCIÁRIOS A PAGAR- INTRA OFSS", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
];

const R_EMPENHO = roteiroEmpenho({ creditoDisponivel: "6.2.2.1.1.00.00", creditoEmpenhado: "6.2.2.1.3.01.00" });
const R_LIQUIDACAO = roteiroLiquidacao({
  variacaoDiminutiva: VPD_INTRA,
  obrigacaoAPagar: "2.1.3.1.1.00.00",
  creditoEmpenhado: "6.2.2.1.3.01.00",
  creditoLiquidado: "6.2.2.1.3.03.00",
});
/**
 * ⚠️ DOIS ROTEIROS DE ARRECADAÇÃO, E A DIFERENÇA É O PONTO. A receita COMUM credita a VPA de
 * consolidação; a receita INTRA credita a VPA **intra**, que é o que a norma manda. Um roteiro só,
 * apontando para a VPA intra, faria o IPTU do município aparecer como transferência recebida de
 * outra unidade — e o par das variações acusaria resíduo em cima de um fato que não é intra.
 */
const R_ARREC = roteiroArrecadacao({
  disponibilidade: CAIXA,
  variacaoAumentativa: "4.1.1.1.1.00.00",
  receitaARealizar: "5.2.1.1.1.00.00",
  receitaRealizada: "6.2.1.1.1.00.00",
});
const R_ARREC_INTRA = roteiroArrecadacao({
  disponibilidade: CAIXA,
  variacaoAumentativa: VPA_INTRA,
  receitaARealizar: "5.2.1.1.1.00.00",
  receitaRealizada: "6.2.1.1.1.00.00",
});

let deps: M05Deps;
let m04: ReturnType<typeof criarM04Deps>;
let m01: ReturnType<typeof criarM01Deps>;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  deps = criarM05Deps(prisma);
  m04 = criarM04Deps(prisma);
  m01 = criarM01Deps(prisma);

  await prisma.contaPcasp.createMany({ data: CONTAS });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "01001", descricao: "Administração", orgaoId: "org-01" } });
  await prisma.funcao.create({ data: { id: "fun-09", codigo: "09", nome: "Previdência" } });
  await prisma.subfuncao.create({ data: { id: "sub-272", codigo: "272", nome: "Previdência do servidor" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0009", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "M", tipo: "ATIVIDADE" } });

  // ⚠️ DUAS naturezas de despesa: a INTRA (modalidade 91) e uma comum (90). Sem a comum, "só a
  // intra entra" passaria por vacuidade.
  await prisma.naturezaDespesa.createMany({
    data: [
      { id: "nd-91", codCategoria: "3", codNatureza: "1", codModalidade: "91", codElemento: "97", codigoCompleto: "319197", descricao: "Aporte ao RPPS — intra" },
      { id: "nd-90", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "333039", descricao: "Serviços — aplicação direta" },
    ],
  });
  await prisma.naturezaReceita.createMany({
    data: [
      { id: "nr-iptu", codigo: NAT_IPTU, descricao: "IPTU" },
      { id: "nr-intra-a", codigo: NAT_INTRA_A, descricao: "Contribuição patronal — intra" },
      { id: "nr-intra-b", codigo: NAT_INTRA_B, descricao: "Aporte — intra" },
    ],
  });
  await prisma.fonteRecurso.create({ data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" } });

  await criarFichaDeTeste(prisma, {
    id: "ficha-intra", exercicio: EXERC, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-09", subfuncaoId: "sub-272", programaId: "prg", acaoId: "aca",
    naturezaDespesaId: "nd-91", fonteId: FONTE, valorDotado: "200000.00",
  });
  await criarFichaDeTeste(prisma, {
    id: "ficha-comum", exercicio: EXERC, numero: 2, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-09", subfuncaoId: "sub-272", programaId: "prg", acaoId: "aca",
    naturezaDespesaId: "nd-90", fonteId: FONTE, valorDotado: "50000.00",
  });

  // ⚠️ A ENTIDADE ENTRA POR `create`, E ISSO É DELIBERADO: aqui ela é INSUMO DE LEITURA. O caminho
  // de escrita dela tem autorização e ato, e é testado onde ele mora
  // (`m16-entidade-contabil-permissoes.test.ts`, `m04-entidade-titular.test.ts`).
  await prisma.entidadeContabil.create({
    data: {
      id: "ent-rpps", codigo: "0002", criadoPor: POR,
      versoes: { create: { versao: 1, nome: "Fundo Previdenciário de Campina Grande", cnpj: CNPJ_FUNDO, tipoManad: "07", atoTipo: "LEI", atoNumero: "1", atoAno: 2020, atoDispositivo: "art. 1º", atoCitacao: "c", criadoPor: POR } },
    },
  });
}

async function preverReceita(naturezaId: string, valor: string): Promise<void> {
  await prisma.receitaPrevista.create({
    data: { exercicio: EXERC, naturezaReceitaId: naturezaId, fonteId: FONTE, tipoReceita: "ORCAMENTARIA", valorPrevisto: valor },
  });
}

async function arrecadar(natureza: string, valor: string, data: string, guia: string): Promise<string> {
  // A categoria econômica 7 é a receita INTRA-orçamentária — e ela leva o roteiro intra.
  const roteiro = natureza.startsWith("7") || natureza.startsWith("8") ? R_ARREC_INTRA : R_ARREC;
  const r = await registrarArrecadacao(
    { exercicio: EXERC, naturezaReceita: natureza, fonte: "500", valor, dataArrecadacao: new Date(data), numeroReceita: guia, criadoPor: POR },
    roteiro, m04
  );
  return r.receitaId;
}

async function empenharIntra(numero: string, valor: string, data: string, credor: string, ficha = "ficha-intra"): Promise<string> {
  const e = await empenhar(
    { fichaId: ficha, numero, tipo: "ORDINARIO", valor, data: new Date(data), credorCpfCnpj: credor, historico: "aporte", categoriaOrdemCronologica: "FORNECIMENTO_BENS", criadoPor: POR },
    R_EMPENHO, deps
  );
  return e.empenhoId;
}

async function liquidarIntra(empenhoId: string, numero: string, valor: string, data: string): Promise<void> {
  await liquidar(
    { empenhoId, numero, valor, data: new Date(data), responsavelAtesto: "F", historico: "l", criadoPor: POR },
    R_LIQUIDACAO, deps
  );
}

/** Um lançamento patrimonial à mão — a transferência entre unidades, nas contas INTRA OFSS. */
async function lancarIntra(p: { readonly debito: string; readonly credito: string; readonly valor: string; readonly data: string; readonly historico: string }): Promise<void> {
  await registrarLancamento(
    {
      numeroControle: `LC-${p.historico}`,
      dataTransacao: new Date(p.data),
      historico: p.historico,
      origemTipo: "MANUAL",
      criadoPor: POR,
      partidas: [
        { conta: p.debito, tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: p.valor },
        { conta: p.credito, tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: p.valor },
      ],
    },
    m01
  );
}

const par = (r: Awaited<ReturnType<typeof eliminacoesIntragovernamentais>>, chave: string) =>
  r.pares.find((p) => p.chave === chave)!;

describe("M12 — eliminações intragovernamentais na consolidação", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ═══ t1 — o par orçamentário FECHA, com N=2 do lado da receita ═══════════
  it("t1 receita intra 60.000 + 40.000 contra despesa intra liquidada 100.000 — elimina, resíduo 0,00", async () => {
    await preverReceita("nr-intra-a", "60000.00");
    await preverReceita("nr-intra-b", "40000.00");
    await arrecadar(NAT_INTRA_A, "60000.00", "2026-01-20T12:00:00Z", "G-1");
    await arrecadar(NAT_INTRA_B, "40000.00", "2026-02-10T12:00:00Z", "G-2");

    const e = await empenharIntra("NE-1", "100000.00", "2026-01-15T12:00:00Z", CNPJ_FUNDO);
    await liquidarIntra(e, "NL-1", "100000.00", "2026-02-20T12:00:00Z");

    const r = await eliminacoesIntragovernamentais(prisma, { exercicio: EXERC, bimestre: 1 });
    const e1 = par(r, "INTRA_ORCAMENTARIO");
    expect(e1.esquerda).toBe("100000.00");
    expect(e1.direita).toBe("100000.00");
    expect(e1.residuo).toBe("0.00");
    expect(e1.situacao).toBe("ELIMINA");
  });

  // ═══ t2 — o RESÍDUO é o ajuste, e ele aparece com o número ═══════════════
  it("t2 liquidada só 70.000 — o par acusa RESIDUO de 30.000, que É o ajuste a explicar", async () => {
    await preverReceita("nr-intra-a", "60000.00");
    await preverReceita("nr-intra-b", "40000.00");
    await arrecadar(NAT_INTRA_A, "60000.00", "2026-01-20T12:00:00Z", "G-1");
    await arrecadar(NAT_INTRA_B, "40000.00", "2026-02-10T12:00:00Z", "G-2");
    const e = await empenharIntra("NE-1", "100000.00", "2026-01-15T12:00:00Z", CNPJ_FUNDO);
    await liquidarIntra(e, "NL-1", "70000.00", "2026-02-20T12:00:00Z");

    const e1 = par(await eliminacoesIntragovernamentais(prisma, { exercicio: EXERC, bimestre: 1 }), "INTRA_ORCAMENTARIO");
    expect(e1.situacao).toBe("RESIDUO");
    expect(e1.residuo).toBe("30000.00");
  });

  // ═══ t3 — SEM_DADO não se disfarça de ELIMINA ═══════════════════════════
  it("t3 sem nenhum fato intra, os três pares são SEM_DADO com motivo — não 'elimina'", async () => {
    await preverReceita("nr-iptu", "120000.00");
    await arrecadar(NAT_IPTU, "10000.00", "2026-01-20T12:00:00Z", "G-1");

    const r = await eliminacoesIntragovernamentais(prisma, { exercicio: EXERC, bimestre: 1 });
    for (const p of r.pares) {
      expect(p.situacao).toBe("SEM_DADO");
      expect(p.motivo ?? "").toMatch(/\S/);
    }
    expect(r.contrapartes).toEqual([]);
  });

  // ═══ t4 — o par das variações, e a conta NÃO-intra que não entra ════════
  it("t4 transferência concedida x recebida elimina; a VPD comum do mesmo período NÃO entra", async () => {
    await lancarIntra({ debito: VPD_INTRA, credito: VPA_INTRA, valor: "25000.00", data: "2026-01-10T12:00:00Z", historico: "aporte-intra" });
    // ⚠️ A ARMADILHA: uma VPD de CONSOLIDAÇÃO no mesmo período. Se ela entrasse, o par acusaria
    // resíduo de 7.000 e o operador procuraria um erro que não existe.
    await lancarIntra({ debito: VPD_COMUM, credito: "2.1.3.1.1.00.00", valor: "7000.00", data: "2026-01-11T12:00:00Z", historico: "consumo" });

    const e2 = par(await eliminacoesIntragovernamentais(prisma, { exercicio: EXERC, bimestre: 1 }), "INTRA_VARIACOES");
    expect(e2.esquerda).toBe("25000.00");
    expect(e2.direita).toBe("25000.00");
    expect(e2.situacao).toBe("ELIMINA");
    expect(e2.contas.map((c) => c.codigo).sort()).toEqual([VPD_INTRA, VPA_INTRA].sort());
  });

  // ═══ t5 — os saldos recíprocos ═════════════════════════════════════════
  it("t5 ativo intra x passivo intra: o direito de um é a obrigação do outro", async () => {
    await lancarIntra({ debito: ATIVO_INTRA, credito: PASSIVO_INTRA, valor: "12000.00", data: "2026-01-10T12:00:00Z", historico: "reciproco" });

    const e3 = par(await eliminacoesIntragovernamentais(prisma, { exercicio: EXERC, bimestre: 1 }), "INTRA_RECIPROCO");
    expect(e3.esquerda).toBe("12000.00");
    expect(e3.direita).toBe("12000.00");
    expect(e3.situacao).toBe("ELIMINA");
    expect(e3.contas.map((c) => c.codigo)).toContain(ATIVO_INTRA);
  });

  // ═══ t6 — O ACHADO: o caixa do município mora numa conta INTRA OFSS ═════
  it("t6 com o nome OFICIAL, o caixa em 1.1.1.1.2 vira ativo intra — a acusação de PLANO-DE-CONTAS-FORA-DO-PCASP", async () => {
    await preverReceita("nr-iptu", "120000.00");
    await arrecadar(NAT_IPTU, "10000.00", "2026-01-20T12:00:00Z", "G-1");

    // Com o nome que o sistema usa hoje, a conta NÃO é intra: nada se elimina por suposição.
    const antes = par(await eliminacoesIntragovernamentais(prisma, { exercicio: EXERC, bimestre: 1 }), "INTRA_RECIPROCO");
    expect(antes.contas.map((c) => c.codigo)).not.toContain(CAIXA);
    expect(antes.situacao).toBe("SEM_DADO");

    // ⚠️ E AGORA O ACHADO: no PCASP oficial, `1.1.1.1.2.00.00` é **CAIXA E EQUIVALENTES ... -
    // INTRA OFSS**, e é nela que este sistema põe o caixa do município. Instalado o plano
    // oficial, o caixa inteiro passa a ser saldo recíproco intragovernamental — e o par acusa,
    // porque não existe passivo intra nenhum do outro lado. O demonstrativo virou o DETECTOR do
    // repontamento que `MigracaoDeConta` existe para fazer.
    await prisma.contaPcasp.update({
      where: { codigo: CAIXA },
      data: { nome: "CAIXA E EQUIVALENTES DE CAIXA EM MOEDA NACIONAL - INTRA OFSS" },
    });
    const depois = par(await eliminacoesIntragovernamentais(prisma, { exercicio: EXERC, bimestre: 1 }), "INTRA_RECIPROCO");
    expect(depois.contas.map((c) => c.codigo)).toContain(CAIXA);
    expect(depois.esquerda).toBe("10000.00");
    expect(depois.situacao).toBe("RESIDUO");
  });

  // ═══ t7 — a CONTRAPARTE, N=2: uma casa por CNPJ, a outra não ════════════
  it("t7 a contraparte sai do CNPJ do credor — e a que não casa é dita NÃO IDENTIFICADA", async () => {
    await empenharIntra("NE-1", "100000.00", "2026-01-15T12:00:00Z", CNPJ_FUNDO);
    await empenharIntra("NE-2", "8000.00", "2026-01-16T12:00:00Z", CNPJ_ESTRANHO);
    // A despesa COMUM (modalidade 90) não é contraparte intragovernamental de ninguém.
    await empenharIntra("NE-3", "5000.00", "2026-01-17T12:00:00Z", CNPJ_FUNDO, "ficha-comum");

    const r = await eliminacoesIntragovernamentais(prisma, { exercicio: EXERC, bimestre: 1 });
    expect(r.contrapartes.length).toBe(2);

    const fundo = r.contrapartes.find((c) => c.credorCpfCnpj === CNPJ_FUNDO)!;
    expect(fundo.entidadeCodigo).toBe("0002");
    expect(fundo.entidadeNome).toBe("Fundo Previdenciário de Campina Grande");
    // Só o empenho da ficha INTRA — o de 5.000 da ficha comum ficou fora.
    expect(fundo.empenhado).toBe("100000.00");
    expect(fundo.empenhos).toBe(1);

    const estranho = r.contrapartes.find((c) => c.credorCpfCnpj === CNPJ_ESTRANHO)!;
    expect(estranho.entidadeCodigo).toBeNull();
    expect(estranho.entidadeNome).toBeNull();
  });

  // ═══ t8 — a anulação SUBTRAI da contraparte ════════════════════════════
  it("t8 empenho intra anulado deixa de contar na contraparte", async () => {
    const e = await empenharIntra("NE-1", "100000.00", "2026-01-15T12:00:00Z", CNPJ_FUNDO);
    await anularEmpenho({ empenhoId: e, numero: "NE-1-A", data: new Date("2026-01-20T12:00:00Z"), historico: "anulacao", criadoPor: POR }, deps);

    const r = await eliminacoesIntragovernamentais(prisma, { exercicio: EXERC, bimestre: 1 });
    const fundo = r.contrapartes.find((c) => c.credorCpfCnpj === CNPJ_FUNDO)!;
    expect(fundo.empenhado).toBe("0.00");
    expect(fundo.empenhos).toBe(1);

    // ⚠️ E NENHUM CREDOR FANTASMA. O adapter grava o literal "ANULACAO" em `credorCpfCnpj` da
    // linha de anulação: um agrupamento por credor produziria uma contraparte chamada "ANULACAO"
    // com valor negativo, e deixaria o fundo devendo o bruto. Uma contraparte só.
    expect(r.contrapartes.map((c) => c.credorCpfCnpj)).not.toContain("ANULACAO");
    expect(r.contrapartes.length).toBe(1);
  });
});
