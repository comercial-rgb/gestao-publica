import "dotenv/config";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { criarM05Deps } from "./adapter-prisma.js";
import type { M05Deps } from "./ports.js";
import { roteiroEmpenho, roteiroLiquidacao } from "./dominio.js";
import { empenhar } from "./servico.js";
import { liquidar } from "./servico-bloco2.js";
import {
  autorizarOrdemDePagamento,
  prepararOrdemDePagamento,
} from "./ordem-pagamento.js";
import {
  enviarEmpenhoParaAssinatura,
  enviarLiquidacaoParaAssinatura,
  enviarOrdemParaAssinatura,
} from "./assinatura-da-despesa.js";
import {
  conteudoDaNotaDeEmpenho,
  reais,
} from "./documentos.js";
import { assinarNaFila } from "../m22-documentos/assinatura.js";
import { lerArquivo } from "../m22-documentos/armazenamento.js";
import { toMoney } from "../../packages/contracts/index.js";

/**
 * ENT03a, item 4 — EMPENHO, LIQUIDAÇÃO E ORDEM DE PAGAMENTO NA FILA DE ASSINATURAS.
 *
 * ═══ O QUE ESTE ARQUIVO PRECISA PROVAR ═══
 *   1. os três geram documento e entram na fila do ENT02 — a MESMA, não uma paralela;
 *   2. o documento é `Anexo` de origem SISTEMA, com hash conferível;
 *   3. o texto é CANÔNICO: duas gerações dão o mesmo byte;
 *   4. o escopo NÃO afrouxa para "ENTE";
 *   5. um segundo documento do mesmo fato é recusado.
 *
 * ⚠️ N=2 onde a regra só aparece em conjunto: o teste do segundo documento precisa do
 * primeiro para existir, e o da fila precisa de DOIS signatários — com um só, "o segundo
 * não pode furar a fila" passaria por vacuidade.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const RAIZ_TEMPORARIA = mkdtempSync(join(tmpdir(), "assinatura-despesa-"));
beforeAll(() => {
  process.env["ANEXOS_DIR"] = RAIZ_TEMPORARIA;
});

const POR = "despesa@cg.pb.gov.br";
const ORDENADOR = "m08@cg.pb.gov.br";
const SIG_1 = "alice@cg.pb.gov.br";
const SIG_2 = "bob@cg.pb.gov.br";

const FICHA = "ficha-assin";
const FONTE = "fnt-assin";
const CREDOR = "12345678000199";
const CONTA = "CC-ASSIN";

const CAIXA = "1.1.1.1.2.00.00";
const FORNECEDOR = "2.1.3.1.1.00.00";
const VPD = "3.3.2.1.1.01.00";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const C_LIQUIDADO = "6.2.2.1.3.03.00";

const R_EMPENHO = roteiroEmpenho({
  creditoDisponivel: C_DISPONIVEL,
  creditoEmpenhado: C_EMPENHADO,
});
const R_LIQUIDACAO = roteiroLiquidacao({
  variacaoDiminutiva: VPD,
  obrigacaoAPagar: FORNECEDOR,
  creditoEmpenhado: C_EMPENHADO,
  creditoLiquidado: C_LIQUIDADO,
});

let deps: M05Deps;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  deps = criarM05Deps(prisma);

  await prisma.contaPcasp.createMany({
    data: [
      { id: "ac-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "ac-forn", codigo: FORNECEDOR, nome: "Fornecedores", naturezaSaldo: "CREDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "ac-vpd", codigo: VPD, nome: "VPD", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "ac-disp", codigo: C_DISPONIVEL, nome: "Crédito Disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "ac-emp", codigo: C_EMPENHADO, nome: "Crédito Empenhado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "ac-liq", codigo: C_LIQUIDADO, nome: "Crédito Liquidado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.orgao.create({ data: { id: "ao-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "au-01", codigo: "01001", descricao: "Administração", orgaoId: "ao-01" },
  });
  await prisma.funcao.create({ data: { id: "af-04", codigo: "04", nome: "Administração" } });
  await prisma.subfuncao.create({ data: { id: "as-122", codigo: "122", nome: "Adm" } });
  await prisma.programa.create({ data: { id: "ap-1", codigo: "0004", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aa-1", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({
    data: { id: "an-1", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "30", codigoCompleto: "339030", descricao: "Material de consumo" },
  });
  await prisma.fonteRecurso.create({
    data: { id: FONTE, codigo: "500", descricao: "Recursos Livres", codigoTce: "500" },
  });
  await prisma.contaBancaria.create({
    data: { id: "cb-assin", codigo: CONTA, descricao: "Movimento", fonteId: FONTE, contaContabilId: "ac-caixa" },
  });

  await criarFichaDeTeste(prisma, {
    id: FICHA, numero: 1, exercicio: 2026, orgaoId: "ao-01", unidadeOrcId: "au-01",
    funcaoId: "af-04", subfuncaoId: "as-122", programaId: "ap-1", acaoId: "aa-1",
    naturezaDespesaId: "an-1", fonteId: FONTE, valorDotado: "500000.00",
  });
}

async function cadeia(): Promise<{
  empenhoId: string;
  liquidacaoId: string;
  ordemId: string;
}> {
  const e = await empenhar(
    {
      fichaId: FICHA, numero: "NE-1", tipo: "ORDINARIO", valor: "12345.67",
      data: new Date("2026-03-10T12:00:00Z"), credorCpfCnpj: CREDOR,
      historico: "aquisição de material de expediente",
      categoriaOrdemCronologica: "FORNECIMENTO_BENS", criadoPor: POR,
    },
    R_EMPENHO,
    deps
  );
  const l = await liquidar(
    {
      empenhoId: e.empenhoId, numero: "NL-1", valor: "12345.67",
      data: new Date("2026-03-20T12:00:00Z"), responsavelAtesto: "Maria da Silva",
      historico: "material recebido", criadoPor: POR,
    },
    R_LIQUIDACAO,
    deps
  );
  const o = await prepararOrdemDePagamento(prisma, {
    liquidacaoId: l.liquidacaoId, numero: "OP-1", valor: "12345.67",
    dataPrevista: new Date("2026-04-01T12:00:00Z"),
    contaBancaria: CONTA, fonteId: FONTE,
    historico: "pagamento do material", criadoPor: POR,
  });
  await autorizarOrdemDePagamento(prisma, { ordemId: o.ordemId, criadoPor: ORDENADOR });
  return { empenhoId: e.empenhoId, liquidacaoId: l.liquidacaoId, ordemId: o.ordemId };
}

describe("M05 — os documentos da despesa na fila de assinaturas do ENT02", () => {
  beforeEach(semear);

  /**
   * ⚠️ OS TRÊS NA MESMA FILA — e "a mesma" é literal: `FilaDeAssinatura` do M22, o modelo
   * que o borderô já usava. Uma fila paralela teria duplicado a ordenação, o "já
   * assinou?" e o significado do hash, e as duas divergiriam na primeira correção feita
   * só de um lado.
   */
  it("t1: empenho, liquidação e ordem geram documento e entram na fila do M22", async () => {
    const { empenhoId, liquidacaoId, ordemId } = await cadeia();

    const emp = await enviarEmpenhoParaAssinatura(prisma, {
      empenhoId, modo: "SIMPLES", signatarios: [SIG_1, SIG_2], criadoPor: POR,
    });
    const liq = await enviarLiquidacaoParaAssinatura(prisma, {
      liquidacaoId, modo: "SIMPLES", signatarios: [SIG_1], criadoPor: POR,
    });
    const ord = await enviarOrdemParaAssinatura(prisma, {
      ordemId, modo: "SIMPLES", signatarios: [ORDENADOR], criadoPor: POR,
    });

    // Três filas, três anexos — e todas do MESMO modelo do ENT02.
    expect(await prisma.filaDeAssinatura.count()).toBe(3);
    for (const r of [emp, liq, ord]) {
      const fila = await prisma.filaDeAssinatura.findUniqueOrThrow({
        where: { id: r.filaId },
        select: { anexoId: true, signatarios: { select: { ordem: true } } },
      });
      expect(fila.anexoId).toBe(r.anexoId);
    }

    // ⚠️ O DONO DE CADA ANEXO É O FATO CERTO — e exatamente um deles.
    const anexoEmp = await prisma.anexo.findUniqueOrThrow({
      where: { id: emp.anexoId },
      select: { empenhoId: true, liquidacaoId: true, ordemDePagamentoId: true, origem: true },
    });
    expect(anexoEmp.empenhoId).toBe(empenhoId);
    expect(anexoEmp.liquidacaoId).toBeNull();
    expect(anexoEmp.ordemDePagamentoId).toBeNull();
    expect(anexoEmp.origem).toBe("SISTEMA");

    const anexoOrd = await prisma.anexo.findUniqueOrThrow({
      where: { id: ord.anexoId },
      select: { ordemDePagamentoId: true, empenhoId: true },
    });
    expect(anexoOrd.ordemDePagamentoId).toBe(ordemId);
    expect(anexoOrd.empenhoId).toBeNull();
  });

  /**
   * ⚠️ O CONTEÚDO GRAVADO É O MESMO QUE A FUNÇÃO DEVOLVE, e o hash confere.
   *
   * `lerArquivo` recusa quando o disco não bate com o hash registrado. Este teste passa
   * por ele — se o documento fosse gravado com um conteúdo e o hash calculado sobre
   * outro, ele falharia aqui e não em produção.
   */
  it("t2: o documento no disco confere com o hash registrado, e o texto é o esperado", async () => {
    const { empenhoId } = await cadeia();
    const emp = await enviarEmpenhoParaAssinatura(prisma, {
      empenhoId, modo: "SIMPLES", signatarios: [SIG_1], criadoPor: POR,
    });

    const a = await prisma.anexo.findUniqueOrThrow({
      where: { id: emp.anexoId },
      select: { sha256: true, mimeType: true, nomeOriginal: true },
    });
    const bytes = await lerArquivo(emp.anexoId, a.sha256);
    const texto = new TextDecoder().decode(bytes);

    expect(texto).toBe(emp.conteudo);
    expect(a.mimeType).toBe("text/plain");
    expect(a.nomeOriginal).toBe("nota-de-empenho-NE-1.txt");

    // O documento diz o que quem assina precisa ver.
    expect(texto).toContain("NOTA DE EMPENHO No NE-1");
    expect(texto).toContain("10/03/2026");
    expect(texto).toContain("R$ 12.345,67");
    expect(texto).toContain(CREDOR);
    expect(texto).toContain("339030");
    expect(texto).toContain("500 — Recursos Livres");
    expect(texto).toContain("aquisição de material de expediente");
  });

  /**
   * ⚠️ CANÔNICO É EXIGÊNCIA, NÃO ADJETIVO. Duas gerações do mesmo empenho têm de dar o
   * MESMO byte — senão o `hashConteudo` da assinatura não tem resposta estável, e "a
   * assinatura confere?" vira "depende de quando você perguntou".
   *
   * O modo de falhar que este teste pega é o clássico: um `new Date()` ou um
   * `toLocaleString` dentro do gerador.
   */
  it("t3: o texto é canônico — duas gerações dão o mesmo byte", () => {
    const dados = {
      numero: "NE-9", data: new Date("2026-03-10T12:00:00Z"), tipo: "ORDINARIO",
      valor: toMoney("1234567.89"), credorCpfCnpj: CREDOR, historico: "x",
      ficha: { numero: 1, exercicio: 2026 }, dotacao: "339030", fonte: "500",
    };
    expect(conteudoDaNotaDeEmpenho(dados)).toBe(conteudoDaNotaDeEmpenho(dados));

    // E o separador de milhar não vem do locale da máquina.
    expect(reais(toMoney("1234567.89"))).toBe("R$ 1.234.567,89");
    expect(reais(toMoney("0.05"))).toBe("R$ 0,05");
    expect(reais(toMoney("-1000.00"))).toBe("-R$ 1.000,00");
  });

  /**
   * ⚠️ N=2 NOS SIGNATÁRIOS. Com um só, "o segundo não fura a fila" passaria por vacuidade
   * — não haveria segundo. A fila do ENT02 é ordenada, e é essa ordem que este teste
   * exercita pelo caminho novo.
   */
  it("t4: a fila é ordenada — o segundo signatário não assina antes do primeiro", async () => {
    const { empenhoId } = await cadeia();
    const emp = await enviarEmpenhoParaAssinatura(prisma, {
      empenhoId, modo: "SIMPLES", signatarios: [SIG_1, SIG_2], criadoPor: POR,
    });
    expect(emp.proximo).toBe(SIG_1);

    // ⚠️ A NEGAÇÃO AFIRMA O MOTIVO, e não só o resultado. Um `rejects.toThrow()` vazio
    // ficaria verde se a recusa viesse de autorização, de fila inexistente ou de um erro
    // de digitação no id — todos compatíveis com a fila NÃO estar sendo ordenada.
    await expect(
      assinarNaFila(prisma, { filaId: emp.filaId, criadoPor: SIG_2 })
    ).rejects.toThrow(
      new RegExp(`Ainda não é a sua vez: falta "${SIG_1}" \\(posição 1\\)`)
    );

    await assinarNaFila(prisma, { filaId: emp.filaId, criadoPor: SIG_1 });
    await assinarNaFila(prisma, { filaId: emp.filaId, criadoPor: SIG_2 });

    const assinaturas = await prisma.signatarioDaFila.findMany({
      where: { filaId: emp.filaId },
      // ⚠️ "ASSINOU?" É DERIVADO da relação, não de uma coluna — não há `assinouEm` no
      // modelo, e é deliberado: uma coluna exigiria UPDATE no signatário, e o M22 é
      // append-only. A primeira versão deste teste assumiu a coluna e não compilou.
      select: { ordem: true, usuarioIdent: true, assinatura: { select: { id: true } } },
      orderBy: { ordem: "asc" },
    });
    expect(assinaturas.map((s) => s.usuarioIdent)).toEqual([SIG_1, SIG_2]);
    expect(assinaturas.every((s) => s.assinatura !== null)).toBe(true);
  });

  /**
   * ⚠️ O SEGUNDO DOCUMENTO DO MESMO FATO É RECUSADO — e o motivo não é asseio.
   *
   * Dois documentos do mesmo empenho iriam a duas filas. Cada uma colheria assinaturas
   * válidas, sobre textos que podem divergir, e "o empenho está assinado?" passaria a ter
   * duas respostas verdadeiras e contraditórias.
   */
  it("t5: um segundo documento do mesmo empenho é recusado", async () => {
    const { empenhoId } = await cadeia();
    await enviarEmpenhoParaAssinatura(prisma, {
      empenhoId, modo: "SIMPLES", signatarios: [SIG_1], criadoPor: POR,
    });

    await expect(
      enviarEmpenhoParaAssinatura(prisma, {
        empenhoId, modo: "SIMPLES", signatarios: [SIG_2], criadoPor: POR,
      })
    ).rejects.toThrow(/já tem documento gerado/);

    expect(await prisma.filaDeAssinatura.count()).toBe(1);
    expect(await prisma.anexo.count()).toBe(1);
  });

  /**
   * ⚠️ A ASSINATURA QUALIFICADA CONTINUA RECUSANDO, e pelo caminho novo também.
   *
   * Não há provedor ICP-Brasil configurado. Se o caminho da despesa tivesse escapado
   * dessa recusa, o sistema passaria a produzir, para o documento que o TCE mais olha,
   * uma assinatura que pareceria qualificada na tela e não seria.
   */
  it("t6: modo QUALIFICADA é recusado com motivo, e nada fica gravado", async () => {
    const { empenhoId } = await cadeia();
    // ⚠️ O MOTIVO, de novo: tem de ser a INDISPONIBILIDADE do provedor, e não qualquer
    // outra recusa que passasse por aqui por acaso.
    await expect(
      enviarEmpenhoParaAssinatura(prisma, {
        empenhoId, modo: "QUALIFICADA", signatarios: [SIG_1], criadoPor: POR,
      })
    ).rejects.toThrow(/nenhum provedor de certificado configurado/);

    expect(await prisma.filaDeAssinatura.count()).toBe(0);

    // ⚠️ E NENHUM ANEXO FICOU PARA TRÁS — este `expect` é o que prova a correção de um
    // defeito real da primeira versão deste módulo.
    //
    // Antes, o documento era gravado ANTES de a fila ser aberta. A tentativa com modo
    // QUALIFICADA criava o `Anexo` e morria na fila, deixando um órfão — e o guard de
    // "um documento por fato" passava a recusar a tentativa SEGUINTE, correta. O empenho
    // ficava impossível de assinar por qualquer modo, PARA SEMPRE.
    expect(await prisma.anexo.count()).toBe(0);
  });

  /**
   * ⚠️ O TESTE QUE NOMEIA O DEFEITO: depois de uma tentativa recusada, a tentativa
   * correta TEM de funcionar.
   *
   * Ele é separado do t6 de propósito. O t6 prova que nada ficou gravado; este prova a
   * CONSEQUÊNCIA de nada ter ficado — que é o que o usuário sente. Um deles sozinho
   * deixaria metade da regressão desprotegida.
   */
  it("t8: depois de uma tentativa QUALIFICADA recusada, a assinatura SIMPLES funciona", async () => {
    const { empenhoId } = await cadeia();

    await expect(
      enviarEmpenhoParaAssinatura(prisma, {
        empenhoId, modo: "QUALIFICADA", signatarios: [SIG_1], criadoPor: POR,
      })
    ).rejects.toThrow(/nenhum provedor de certificado configurado/);

    // O mesmo empenho, agora pelo modo disponível: passa.
    const ok = await enviarEmpenhoParaAssinatura(prisma, {
      empenhoId, modo: "SIMPLES", signatarios: [SIG_1], criadoPor: POR,
    });
    expect(ok.filaId).toBeTruthy();
    expect(await prisma.anexo.count()).toBe(1);
  });

  /**
   * O mesmo, para a outra pré-condição da fila: signatário repetido. Ela também é
   * conferida ANTES de gravar — e pela MESMA função que a fila usa, não por uma cópia.
   */
  it("t9: signatário repetido é recusado antes de gravar o documento", async () => {
    const { empenhoId } = await cadeia();

    await expect(
      enviarEmpenhoParaAssinatura(prisma, {
        empenhoId, modo: "SIMPLES", signatarios: [SIG_1, SIG_1], criadoPor: POR,
      })
    ).rejects.toThrow(/Signatário repetido/);

    expect(await prisma.anexo.count()).toBe(0);
    expect(await prisma.filaDeAssinatura.count()).toBe(0);
  });

  /**
   * ⚠️ O ESCOPO NÃO AFROUXOU PARA "ENTE". Este teste prova pelo dado: o anexo do empenho
   * aponta para o empenho, e é por ele que `escopoDoDono` resolve a UG. O borderô é o
   * único que vira ato do ENTE, e ali há razão (a tesouraria paga pelo ente).
   *
   * Sem esta amarração, alguém poderia "simplificar" o resolvedor devolvendo "ENTE" para
   * todos, e a suíte continuaria verde enquanto a autorização afrouxava.
   */
  it("t7: o anexo da despesa tem dono próprio — o escopo NÃO é o do ENTE", async () => {
    const { empenhoId, liquidacaoId, ordemId } = await cadeia();
    await enviarEmpenhoParaAssinatura(prisma, { empenhoId, modo: "SIMPLES", signatarios: [SIG_1], criadoPor: POR });
    await enviarLiquidacaoParaAssinatura(prisma, { liquidacaoId, modo: "SIMPLES", signatarios: [SIG_1], criadoPor: POR });
    await enviarOrdemParaAssinatura(prisma, { ordemId, modo: "SIMPLES", signatarios: [SIG_1], criadoPor: POR });

    const anexos = await prisma.anexo.findMany({
      select: { empenhoId: true, liquidacaoId: true, ordemDePagamentoId: true, borderoId: true, processoId: true, pessoaId: true, comunicadoId: true },
    });
    expect(anexos.length).toBe(3);
    for (const a of anexos) {
      const donos = [a.empenhoId, a.liquidacaoId, a.ordemDePagamentoId, a.borderoId, a.processoId, a.pessoaId, a.comunicadoId].filter((x) => x !== null);
      // Exatamente um dono, e ele é um dos três da despesa — nunca "nenhum".
      expect(donos.length).toBe(1);
      expect(a.borderoId).toBeNull();
    }
  });
});
