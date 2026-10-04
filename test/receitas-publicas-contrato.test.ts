import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { limparBanco } from "./limpar-banco.js";
import { roteiroArrecadacao } from "../modules/m04-receita/dominio.js";
import { anularArrecadacao, registrarArrecadacao } from "../modules/m04-receita/servico.js";
import { reconhecerReceita } from "../modules/m04-receita/reconhecimento.js";
import { criarM04Deps } from "../modules/m04-receita/adapter-prisma.js";
import {
  CAMPOS_NUNCA_PUBLICOS_DA_RECEITA,
  CAMPOS_PUBLICOS_DA_RECEITA,
  listarReceitasPublicas,
} from "../lib/portas/receitas-publicas.js";

/**
 * ═══ A CONSULTA PÚBLICA DE RECEITAS (V11 V4) ═══
 *
 * ⚠️⚠️ O DEFEITO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR É ARITMÉTICO, e é o gêmeo do da despesa:
 * somar CONSTITUIÇÃO com ARRECADAÇÃO. O crédito reconhecido no fato gerador e o dinheiro que
 * entrou são o MESMO dinheiro em dois momentos — a arrecadação BAIXA o crédito. Um portal que os
 * empilhasse publicaria o dobro da receita do município.
 *
 * ⚠️ O SEGUNDO É A ANULAÇÃO. Ela é guia nova (append-only) apontando para a original. Listá-la
 * como guia própria mostraria uma "receita" que é correção de outra; publicar só o bruto mostraria
 * dinheiro que foi desfeito.
 *
 * ⚠️ O TERCEIRO É O RECORTE. Totais, contagem, paginação e CSV têm de falar do MESMO conjunto —
 * a lição do V10 T3, em que a fase era filtrada sobre a página já carregada.
 *
 * FIXTURE N=2 em tudo que se manifesta em conjunto: três guias (uma viva, uma anulada, uma de
 * outra fonte), duas fontes, duas naturezas.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "tributos@cg.pb.gov.br";
const NAT_IPTU = "11130111";
const NAT_ISS = "11140111";
const CR = "1.1.2.1.1.00.00";
const CAIXA = "1.1.1.1.2.00.00";
const VPA = "4.1.1.1.1.00.00";
const VPD = "3.6.1.1.1.00.00";
const R_A_REALIZAR = "5.2.1.1.1.00.00";
const R_REALIZADA = "6.2.1.1.1.00.00";

const R_ARREC = roteiroArrecadacao({
  disponibilidade: CAIXA,
  variacaoAumentativa: VPA,
  receitaARealizar: R_A_REALIZAR,
  receitaRealizada: R_REALIZADA,
});

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-cr", codigo: CR, nome: "Crédito tributário a receber", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "c-vpa", codigo: VPA, nome: "VPA — impostos", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-vpd", codigo: VPD, nome: "VPD — perda de créditos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-rar", codigo: R_A_REALIZAR, nome: "Receita a realizar", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-rr", codigo: R_REALIZADA, nome: "Receita realizada", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.naturezaReceita.createMany({
    data: [
      { id: "nr-iptu", codigo: NAT_IPTU, descricao: "IPTU — principal" },
      { id: "nr-iss", codigo: NAT_ISS, descricao: "ISS — principal" },
    ],
  });
  await prisma.fonteRecurso.createMany({
    data: [
      { id: "fnt-500", codigo: "500", descricao: "Não vinculados", codigoTce: "500" },
      { id: "fnt-540", codigo: "540", descricao: "Educação", codigoTce: "540" },
    ],
  });
  await prisma.roteiroReconhecimento.create({
    data: {
      origem: "IMPOSTOS_TAXAS_CONTRIBUICOES_DE_MELHORIA",
      contaCreditoAReceberId: "c-cr", contaVpaId: "c-vpa", contaVpdId: "c-vpd", criadoPor: POR,
    },
  });
}

async function arrecadar(numero: string, valor: string, p: { readonly natureza?: string; readonly fonte?: string; readonly data?: string } = {}): Promise<string> {
  const r = await registrarArrecadacao(
    {
      exercicio: 2026,
      naturezaReceita: p.natureza ?? NAT_IPTU,
      fonte: p.fonte ?? "500",
      valor,
      dataArrecadacao: new Date(p.data ?? "2026-03-10T12:00:00Z"),
      numeroReceita: numero,
      criadoPor: POR,
    },
    R_ARREC,
    criarM04Deps(prisma),
  );
  return r.receitaId;
}

beforeEach(semear);
afterAll(async () => {
  await prisma.$disconnect();
});

describe("V11 V4 (R) — a consulta pública de receitas", () => {
  it("R1: uma linha por GUIA, com arrecadado, anulado e líquido — e a anulação NÃO vira guia própria", async () => {
    await arrecadar("G-1", "10000.00");
    const id2 = await arrecadar("G-2", "4000.00");
    await anularArrecadacao(
      { receitaId: id2, dataAnulacao: new Date("2026-04-01T12:00:00Z"), numeroReceita: "G-2-ANUL", criadoPor: POR },
      criarM04Deps(prisma),
    );

    const p = await listarReceitasPublicas({ exercicio: "2026" });

    // ⚠️ DUAS linhas, não três: a guia de anulação é correção da G-2, não receita nova.
    expect(p.total).toBe(2);
    expect(p.linhas.map((l) => l.numero).sort()).toEqual(["G-1", "G-2"]);

    const g1 = p.linhas.find((l) => l.numero === "G-1");
    const g2 = p.linhas.find((l) => l.numero === "G-2");
    expect(g1?.arrecadado).toBe("10000.00");
    expect(g1?.anulado).toBe("0.00");
    expect(g1?.liquido).toBe("10000.00");
    expect(g1?.situacao).toBe("Arrecadada");

    // À MÃO: 4.000,00 arrecadados, 4.000,00 anulados, líquido zero.
    expect(g2?.arrecadado).toBe("4000.00");
    expect(g2?.anulado).toBe("4000.00");
    expect(g2?.liquido).toBe("0.00");
    expect(g2?.situacao).toBe("Anulada");

    // O total líquido do recorte é só a G-1.
    expect(p.totais.arrecadado).toBe("14000.00");
    expect(p.totais.anulado).toBe("4000.00");
    expect(p.totais.liquido).toBe("10000.00");
  });

  it("R2: os totais são do RECORTE INTEIRO, não da página", async () => {
    await arrecadar("G-1", "1000.00");
    await arrecadar("G-2", "2000.00");
    await arrecadar("G-3", "3000.00");

    const p = await listarReceitasPublicas({ exercicio: "2026", porPagina: 2, pagina: 1 });

    // ⚠️ A PÁGINA TEM DUAS LINHAS E O TOTAL SOMA AS TRÊS. Um rodapé que somasse a página diria
    // 3.000,00 — e o cidadão que quer o total do exercício receberia o total da primeira página.
    expect(p.linhas).toHaveLength(2);
    expect(p.total).toBe(3);
    expect(p.paginas).toBe(2);
    expect(p.totais.liquido).toBe("6000.00");
  });

  it("R3: o filtro de SITUAÇÃO vale para a contagem, a página e os totais — o mesmo conjunto", async () => {
    await arrecadar("G-1", "1000.00");
    const id2 = await arrecadar("G-2", "2000.00");
    await anularArrecadacao(
      { receitaId: id2, dataAnulacao: new Date("2026-04-01T12:00:00Z"), numeroReceita: "G-2-ANUL", criadoPor: POR },
      criarM04Deps(prisma),
    );

    const vivas = await listarReceitasPublicas({ exercicio: "2026", situacao: "Arrecadada" });
    expect(vivas.total).toBe(1);
    expect(vivas.linhas.map((l) => l.numero)).toEqual(["G-1"]);
    expect(vivas.totais.liquido).toBe("1000.00");

    const anuladas = await listarReceitasPublicas({ exercicio: "2026", situacao: "Anulada" });
    expect(anuladas.total).toBe(1);
    expect(anuladas.linhas.map((l) => l.numero)).toEqual(["G-2"]);
    expect(anuladas.totais.liquido).toBe("0.00");
  });

  it("R4 (N=2): filtros por fonte e por natureza recortam, e os totais acompanham", async () => {
    await arrecadar("G-500", "1000.00", { fonte: "500", natureza: NAT_IPTU });
    await arrecadar("G-540", "7000.00", { fonte: "540", natureza: NAT_ISS });

    const porFonte = await listarReceitasPublicas({ exercicio: "2026", fonte: "fnt-540" });
    expect(porFonte.total).toBe(1);
    expect(porFonte.totais.liquido).toBe("7000.00");

    // A natureza é hierárquica: filtrar pelo PREFIXO tem de trazer os filhos.
    const porNatureza = await listarReceitasPublicas({ exercicio: "2026", natureza: "1113" });
    expect(porNatureza.total).toBe(1);
    expect(porNatureza.linhas[0]?.numero).toBe("G-500");
  });

  it("R5: o CRÉDITO CONSTITUÍDO não entra em nenhum total de arrecadação", async () => {
    await arrecadar("G-1", "1000.00");
    await reconhecerReceita(prisma, {
      naturezaCodigo: NAT_IPTU,
      fonteId: "fnt-500",
      dataFatoGerador: new Date("2026-01-01T12:00:00Z"),
      valor: "50000.00",
      historico: "IPTU 2026 lançado",
      criadoPor: POR,
    });

    const p = await listarReceitasPublicas({ exercicio: "2026" });

    // ⚠️ O NÚMERO APARECE, SEPARADO — e NENHUM total da arrecadação o absorve. Se algum dia
    // alguém somar os dois, este caso acusa: o líquido continua sendo só a guia.
    expect(p.constituido).toBe("50000.00");
    expect(p.totais.arrecadado).toBe("1000.00");
    expect(p.totais.liquido).toBe("1000.00");
    expect(p.linhas).toHaveLength(1);
  });

  it("R6: o contrato de negação — nenhum campo proibido sai na linha pública", async () => {
    await arrecadar("G-1", "1000.00");
    const p = await listarReceitasPublicas({ exercicio: "2026" });
    const linha = p.linhas[0];
    expect(linha).toBeDefined();

    const chaves = Object.keys(linha as object).sort();
    expect(chaves).toEqual([...CAMPOS_PUBLICOS_DA_RECEITA].sort());

    // ⚠️ E A NEGAÇÃO AFIRMA O MOTIVO, não só a ausência: cada campo desta lista tem uma razão
    // própria — sigilo fiscal, dado pessoal do servidor que digitou, conta do ente.
    for (const proibido of CAMPOS_NUNCA_PUBLICOS_DA_RECEITA) {
      expect(chaves, `campo proibido "${proibido}" na linha pública`).not.toContain(proibido);
    }
    // E o objeto serializado inteiro não pode conter a referência opaca do contribuinte.
    expect(JSON.stringify(p)).not.toContain("contribuinteRef");
  });

  it("R7: a previsão vai em três números, e a DEDUÇÃO subtrai em vez de somar", async () => {
    await arrecadar("G-1", "2000.00");
    await prisma.receitaPrevista.createMany({
      data: [
        { exercicio: 2026, naturezaReceitaId: "nr-iptu", fonteId: "fnt-500", tipoReceita: "ORCAMENTARIA", valorPrevisto: "10000.00" },
        // ⚠️ A DEDUÇÃO (FUNDEB, renúncia) SUBTRAI. Somá-la como positiva publicaria uma previsão
        // maior que a que a LOA aprovou.
        { exercicio: 2026, naturezaReceitaId: "nr-iss", fonteId: "fnt-540", tipoReceita: "DEDUCAO", valorPrevisto: "2000.00" },
      ],
    });

    const p = await listarReceitasPublicas({ exercicio: "2026" });
    // À MÃO: 10.000 − 2.000 = 8.000 de previsão inicial; sem reprevisão, a atualizada é a mesma.
    expect(p.previsao?.inicial).toBe("8000.00");
    expect(p.previsao?.ajustes).toBe("0.00");
    expect(p.previsao?.atualizada).toBe("8000.00");
    expect(p.previsao?.realizado).toBe("2000.00");
    // 2.000 / 8.000 = 25,00%.
    expect(p.previsao?.execucao).toBe("25.00");
  });

  it("R8: a ordenação é estável — guias na MESMA data não trocam de página entre requisições", async () => {
    /**
     * ⚠️ N=2 NÃO BASTA AQUI, E O NÚMERO FOI MEDIDO, NÃO CHUTADO.
     *
     * Com vinte guias a mutação "tire o desempate por id" NÃO acusou: o Postgres ordena o
     * conjunto inteiro e devolve a mesma sequência por acidente. O defeito só aparece quando o
     * planejador troca para top-N heapsort — que é instável entre OFFSETs diferentes. Foi a
     * mesma medição do V10 T3 na despesa, e é por isso que este caso usa QUATROCENTAS guias na
     * MESMA data. Baixar este número devolve um teste que passa sem vigiar nada.
     */
    const TOTAL = 400;
    const POR_PAGINA = 50;
    for (let i = 1; i <= TOTAL; i++) await arrecadar(`G-${String(i).padStart(3, "0")}`, "100.00");

    const juntar = async (): Promise<readonly string[]> => {
      const todas: string[] = [];
      for (let pag = 1; pag <= TOTAL / POR_PAGINA; pag++) {
        const p = await listarReceitasPublicas({ exercicio: "2026", porPagina: POR_PAGINA, pagina: pag });
        todas.push(...p.linhas.map((l) => l.numero));
      }
      return todas;
    };

    const primeira = await juntar();
    const segunda = await juntar();
    expect(primeira).toHaveLength(TOTAL);
    // Nenhuma guia repetida e nenhuma perdida — é isso que o desempate por id garante. Sem ele,
    // uma guia aparece em duas páginas e outra nunca aparece: o cidadão nunca a vê.
    expect(new Set(primeira).size).toBe(TOTAL);
    expect(segunda).toEqual(primeira);
    // V35 — PRAZO EXPLÍCITO, MEDIDO: as 400 arrecadações em série levam ~13 ms cada (5,2 s medidos em 04/10, 5,7 s
    // com a máquina ocupada) e o padrão de 5 s ficava no fio. O número 400 é a exigência do teste, acima.
  }, 60000);
});
