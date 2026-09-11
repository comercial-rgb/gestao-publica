import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { autenticar, definirSenha, validarSessao } from "./autenticacao.js";
import { comOperacaoRegistrada, criarRegistroDeOperacaoPrisma } from "./operacao.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar, pagar } from "../m05-despesa/servico-bloco2.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";
import {
  contrapartidaDaLiquidacao,
  roteiroArrecadacao,
  roteiroEmpenho,
  roteiroLiquidacao,
  roteiroPagamento,
  CONTA_ESTOQUE,
} from "../m01-core-contabil/roteiros.js";
import { semearPcasp } from "../../prisma/seed/pcasp.js";

/**
 * A BORDA DA EXECUÇÃO (7.3) — a cadeia que as quatro telas orquestram.
 *
 * ⚠️ A PORTA EM SI (`lib/portas/*`) NÃO RODA NO VITEST: ela lê cookies/headers do Next.
 * Aqui provamos a CADEIA que ela liga, sobre o domínio pronto — o mesmo desenho do
 * `m16-borda-sessao.test.ts`:
 *
 *   autenticar → validarSessao → identificador → comOperacaoRegistrada(ação, ato)
 *     → serviço(input com criadoPor real, ROTEIRO DO M01, deps)
 *       → fato gravado + lançamento pelo funil + RegistroDeOperacao
 *
 * ⚠️ E O ROTEIRO É O DE PRODUÇÃO. Estes testes semeiam o plano com `semearPcasp` — o
 * MESMO seed que roda em dev/prod — e usam os roteiros de `m01/roteiros.ts`. É isso que
 * separa este arquivo dos outros: as fixtures do M05 inventam as próprias contas, e por
 * isso não provariam que a tela funciona num banco real. A 7.1 recusou entregar as telas
 * exatamente porque esse elo não existia.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const IDENT = "orcamento@cg.pb.gov.br"; // fixture ADMIN — pode tudo do censo
const SENHA = "SenhaForte#2026";
const FONTE = "fnt-500";
const FICHA_SERVICO = "ficha-39";
const FICHA_MATERIAL = "ficha-30";
const CREDOR = "12345678000199";

const R_EMPENHO = roteiroEmpenho();
const R_LIQ_SERVICO = roteiroLiquidacao({
  codElemento: "39",
  obrigacaoAPagar: "2.1.3.1.1.00.00",
});
const R_PAGAMENTO = roteiroPagamento({
  obrigacaoAPagar: "2.1.3.1.1.00.00",
  // ENT05 ITEM 3 — repontada. Ver ESTADO-EXECUCAO 20.7.
  disponibilidade: "1.1.1.1.1.19.00",
});
const R_ARRECADACAO = roteiroArrecadacao({
  disponibilidade: "1.1.1.1.1.00.00",
  variacaoAumentativa: "4.1.1.2.1.01.00",
});

async function semear(): Promise<void> {
  await limparBanco(prisma);
  // ⚠️ O PLANO DE PRODUÇÃO, não contas inventadas. Ver o cabeçalho.
  await semearPcasp(prisma);

  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "uo-01", codigo: "01001", descricao: "Administração", orgaoId: "org-01" },
  });
  await prisma.funcao.create({ data: { id: "fun-04", codigo: "04", nome: "Administração" } });
  await prisma.subfuncao.create({ data: { id: "sub-122", codigo: "122", nome: "Adm" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0004", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.createMany({
    data: [
      { id: "nd39", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços PJ" },
      { id: "nd30", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "30", codigoCompleto: "339030", descricao: "Material de consumo" },
    ],
  });
  await prisma.naturezaReceita.create({
    data: { id: "nr-iptu", codigo: "11121101", descricao: "IPTU" },
  });
  await prisma.fonteRecurso.create({
    data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" },
  });
  await prisma.contaBancaria.create({
    data: { id: "cb1", codigo: "CC-001", descricao: "Movimento", fonteId: FONTE },
  });

  const base = {
    exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-04", subfuncaoId: "sub-122", programaId: "prg", acaoId: "aca",
    fonteId: FONTE, valorDotado: "500000.00",
  };
  await criarFichaDeTeste(prisma, { ...base, id: FICHA_SERVICO, numero: 1, naturezaDespesaId: "nd39" });
  await criarFichaDeTeste(prisma, { ...base, id: FICHA_MATERIAL, numero: 2, naturezaDespesaId: "nd30" });

  const u = await prisma.usuario.findUniqueOrThrow({
    where: { identificador: IDENT },
    select: { id: true },
  });
  await definirSenha(prisma, { usuarioId: u.id, senha: SENHA, criadoPor: "TESTE" });
}

/** O que a porta faz: valida a sessão e devolve o `criadoPor` REAL. */
async function entrar(): Promise<string> {
  const sessao = await autenticar(prisma, { identificador: IDENT, senha: SENHA });
  const ident = await validarSessao(prisma, sessao.token);
  return ident.identificador;
}

/** O que `comEscritaAutenticada` faz depois de ter o `criadoPor`. */
async function comRegistro<T>(acao: string, criadoPor: string, ato: () => Promise<T>): Promise<T> {
  return comOperacaoRegistrada(
    criarRegistroDeOperacaoPrisma(prisma),
    { usuarioIdent: criadoPor, acao },
    ato
  );
}

describe("M16 — a borda da EXECUÇÃO (as 4 telas da 7.3)", () => {
  beforeEach(async () => {
    await semear();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1: EMPENHO — sessão real → fato + lançamento pelo funil + RegistroDeOperacao", async () => {
    const criadoPor = await entrar();

    const r = await comRegistro("EMPENHAR", criadoPor, () =>
      empenhar(
        {
          fichaId: FICHA_SERVICO, numero: "2026NE000001", tipo: "ORDINARIO",
          valor: "10000.00", data: new Date("2026-02-01T12:00:00Z"),
          credorCpfCnpj: CREDOR, historico: "serviços de manutenção",
          categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor,
        },
        R_EMPENHO,
        criarM05Deps(prisma)
      )
    );

    // O FATO existe, e o criadoPor é o da SESSÃO — não um literal de fixture.
    const emp = await prisma.empenho.findUniqueOrThrow({
      where: { id: r.empenhoId },
      include: { lancamento: { include: { partidas: { include: { conta: true } } } } },
    });
    expect(emp.criadoPor).toBe(IDENT);

    // O LANÇAMENTO nasceu pelo funil, com as contas OFICIAIS do M01.
    const contas = emp.lancamento.partidas.map((p) => p.conta.codigo).sort();
    expect(contas).toEqual([
      "6.2.2.1.1.00.00",
      "6.2.2.1.3.01.00",
      // A DDR: comprometer crédito e comprometer dinheiro são fatos distintos.
      "8.2.1.1.1.00.00",
      "8.2.1.1.2.01.00",
    ]);
    expect(emp.lancamento.criadoPor).toBe(IDENT);

    // E a OPERAÇÃO ficou auditada.
    const op = await prisma.registroDeOperacao.findFirstOrThrow({
      where: { acao: "EMPENHAR" },
    });
    expect(op.usuarioIdent).toBe(IDENT);
    expect(op.resultado).toBe("SUCESSO");
  });

  it("t2: LIQUIDAÇÃO de serviço (39) — a contrapartida é a VPD que o M01 escolheu", async () => {
    const criadoPor = await entrar();
    const e = await empenhar(
      {
        fichaId: FICHA_SERVICO, numero: "2026NE000001", tipo: "ORDINARIO",
        valor: "10000.00", data: new Date("2026-02-01T12:00:00Z"),
        credorCpfCnpj: CREDOR, historico: "serviços", categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
        criadoPor,
      },
      R_EMPENHO,
      criarM05Deps(prisma)
    );

    const l = await comRegistro("LIQUIDAR", criadoPor, () =>
      liquidar(
        {
          empenhoId: e.empenhoId, numero: "2026NL000001", valor: "6000.00",
          data: new Date("2026-03-01T12:00:00Z"), responsavelAtesto: "Fulano de Tal",
          historico: "recebimento atestado", criadoPor,
        },
        R_LIQ_SERVICO,
        criarM05Deps(prisma)
      )
    );

    const lanc = await prisma.lancamentoContabil.findUniqueOrThrow({
      where: { id: l.lancamentoId },
      include: { partidas: { include: { conta: true } } },
    });
    const contas = lanc.partidas.map((p) => p.conta.codigo).sort();
    // D VPD / C Fornecedores (patrimonial) · D a liquidar / C liquidado a pagar (orç.)
    expect(contas).toEqual([
      "2.1.3.1.1.00.00",
      "3.3.2.1.1.01.00",
      "6.2.2.1.3.01.00",
      "6.2.2.1.3.03.00",
      // DDR: comprometida por empenho → por liquidação (a obrigação virou exigível).
      "8.2.1.1.2.01.00",
      "8.2.1.1.3.01.00",
    ]);
    expect(
      (await prisma.registroDeOperacao.findFirstOrThrow({ where: { acao: "LIQUIDAR" } }))
        .usuarioIdent
    ).toBe(IDENT);
  });

  it("t3: LIQUIDAÇÃO de material (30) é BLOQUEADA na porta — e o rol do M01 diz por quê", () => {
    // ⚠️ O rol do M01 manda material para o ESTOQUE, e está certo: material de consumo
    // vira ativo, não despesa. Mas a entrada no almoxarifado é ato do M10, e liquidar
    // sem ela deixaria estoque no razão que movimento nenhum explica. A porta recusa
    // ANTES do domínio — pendência LIQUIDACAO-MATERIAL-ALMOXARIFADO.
    expect(contrapartidaDaLiquidacao("30")).toBe(CONTA_ESTOQUE);
    // e o serviço NÃO cai nessa regra: ele vira VPD.
    expect(contrapartidaDaLiquidacao("39")).not.toBe(CONTA_ESTOQUE);
  });

  it("t4: PAGAMENTO — a cabeça da fila passa SEM justificativa; fora dela, o §2º RECUSA", async () => {
    const criadoPor = await entrar();
    const deps = criarM05Deps(prisma);

    // duas liquidações na MESMA fila (fonte 500 × PRESTACAO_SERVICOS): A é mais antiga.
    const e = await empenhar(
      {
        fichaId: FICHA_SERVICO, numero: "2026NE000001", tipo: "ORDINARIO",
        valor: "10000.00", data: new Date("2026-02-01T12:00:00Z"),
        credorCpfCnpj: CREDOR, historico: "serviços", categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
        criadoPor,
      },
      R_EMPENHO,
      deps
    );
    const liqA = await liquidar(
      { empenhoId: e.empenhoId, numero: "NL-A", valor: "1000.00", data: new Date("2026-03-01T12:00:00Z"), responsavelAtesto: "F", historico: "A", criadoPor },
      R_LIQ_SERVICO,
      deps
    );
    const liqB = await liquidar(
      { empenhoId: e.empenhoId, numero: "NL-B", valor: "1000.00", data: new Date("2026-03-20T12:00:00Z"), responsavelAtesto: "F", historico: "B", criadoPor },
      R_LIQ_SERVICO,
      deps
    );

    const pg = (liquidacaoId: string, numero: string, justificativa?: unknown) => ({
      liquidacaoId, numero, valor: "1000.00",
      data: new Date("2026-04-01T12:00:00Z"), contaBancaria: "CC-001",
      fonteId: FONTE, historico: "pagamento", criadoPor,
      ...(justificativa !== undefined ? { justificativaQuebraOrdem: justificativa as never } : {}),
    });

    // ⚠️ B está ATRÁS de A na fila. Pagar B sem justificativa: o M05 chama o M06 DENTRO
    // da transação, e o art. 141 §2º recusa. É esta rejeição que a Server Action mostra.
    await expect(
      comRegistro("PAGAR", criadoPor, () => pagar(pg(liqB.liquidacaoId, "NP-B"), R_PAGAMENTO, deps))
    ).rejects.toThrow(/QUEBRA DA ORDEM CRONOLÓGICA sem justificativa/);

    // ...e a tentativa FICOU AUDITADA como falha — é o que o RegistroDeOperacao existe para ver.
    const falha = await prisma.registroDeOperacao.findFirstOrThrow({
      where: { acao: "PAGAR", resultado: "ERRO" },
    });
    expect(falha.usuarioIdent).toBe(IDENT);
    expect(await prisma.pagamento.count()).toBe(0); // fail-closed: nada gravado

    // A CABEÇA DA FILA passa sem justificativa nenhuma.
    const okA = await comRegistro("PAGAR", criadoPor, () =>
      pagar(pg(liqA.liquidacaoId, "NP-A"), R_PAGAMENTO, deps)
    );
    expect(okA.pagamentoId).toBeTruthy();

    // Agora B é a cabeça — e passa.
    const okB = await comRegistro("PAGAR", criadoPor, () =>
      pagar(pg(liqB.liquidacaoId, "NP-B"), R_PAGAMENTO, deps)
    );
    expect(okB.pagamentoId).toBeTruthy();
    expect(await prisma.pagamento.count()).toBe(2);
  });

  it("t5: PAGAMENTO fora da ordem COM justificativa passa — e ela fica gravada", async () => {
    const criadoPor = await entrar();
    const deps = criarM05Deps(prisma);

    const e = await empenhar(
      {
        fichaId: FICHA_SERVICO, numero: "2026NE000001", tipo: "ORDINARIO",
        valor: "10000.00", data: new Date("2026-02-01T12:00:00Z"),
        credorCpfCnpj: CREDOR, historico: "serviços", categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
        criadoPor,
      },
      R_EMPENHO,
      deps
    );
    await liquidar(
      { empenhoId: e.empenhoId, numero: "NL-A", valor: "1000.00", data: new Date("2026-03-01T12:00:00Z"), responsavelAtesto: "F", historico: "A", criadoPor },
      R_LIQ_SERVICO,
      deps
    );
    const liqB = await liquidar(
      { empenhoId: e.empenhoId, numero: "NL-B", valor: "1000.00", data: new Date("2026-03-20T12:00:00Z"), responsavelAtesto: "F", historico: "B", criadoPor },
      R_LIQ_SERVICO,
      deps
    );

    const r = await comRegistro("PAGAR", criadoPor, () =>
      pagar(
        {
          liquidacaoId: liqB.liquidacaoId, numero: "NP-B", valor: "1000.00",
          data: new Date("2026-04-01T12:00:00Z"), contaBancaria: "CC-001",
          fonteId: FONTE, historico: "pagamento urgente", criadoPor,
          justificativaQuebraOrdem: {
            hipotese: "V_ATIVIDADE_FINALISTICA",
            justificativa:
              "Pagamento imprescindível à continuidade do atendimento da rede municipal de ensino.",
            autorizadoPor: "Secretário de Finanças",
          },
        },
        R_PAGAMENTO,
        deps
      )
    );
    expect(r.pagamentoId).toBeTruthy();

    // ⚠️ A JUSTIFICATIVA E O PAGAMENTO NASCERAM NA MESMA TRANSAÇÃO — é isso que o
    // desenho M05→M06 garante, e é por isso que a porta chama só o M05.
    const quebra = await prisma.justificativaQuebraOrdem.findFirstOrThrow({
      where: { liquidacaoId: liqB.liquidacaoId },
    });
    expect(quebra.hipotese).toBe("V_ATIVIDADE_FINALISTICA");
    expect(quebra.autorizadoPor).toBe("Secretário de Finanças");
  });

  it("t6: ARRECADAÇÃO — guia + lançamento oficial + auditoria, e sem UG", async () => {
    const criadoPor = await entrar();

    const r = await comRegistro("REGISTRAR_ARRECADACAO", criadoPor, () =>
      registrarArrecadacao(
        {
          exercicio: 2026, naturezaReceita: "11121101", fonte: "500",
          exercicioFonte: 1, valor: "1500.00",
          dataArrecadacao: new Date("2026-03-10T12:00:00Z"),
          numeroReceita: "2026RC000001", criadoPor,
        },
        R_ARRECADACAO,
        criarM04Deps(prisma)
      )
    );

    const guia = await prisma.receitaArrecadada.findUniqueOrThrow({
      where: { id: r.receitaId },
      include: { lancamento: { include: { partidas: { include: { conta: true } } } } },
    });
    expect(guia.criadoPor).toBe(IDENT);
    const contas = guia.lancamento.partidas.map((p) => p.conta.codigo).sort();
    expect(contas).toEqual([
      "1.1.1.1.1.00.00",
      "4.1.1.2.1.01.00",
      "6.2.1.1.0.00.00",
      "6.2.1.2.0.00.00",
      // ⚠️ A ÚNICA perna de classe 7 do sistema: é a arrecadação que traz dinheiro NOVO
      // sob controle (D 7.2.1.1 / C 8.2.1.1.1). Daí em diante ele só muda de estado.
      "7.2.1.1.0.00.00",
      "8.2.1.1.1.00.00",
    ]);
    expect(
      (await prisma.registroDeOperacao.findFirstOrThrow({ where: { acao: "REGISTRAR_ARRECADACAO" } }))
        .resultado
    ).toBe("SUCESSO");
  });

  it("t7: SEM SESSÃO não há criadoPor real — e um identificador forjado NÃO passa no funil", async () => {
    // A porta barra antes (exigirSessao); esta é a rede de baixo: mesmo que alguém
    // chegasse ao serviço com um `criadoPor` inventado, o M16 recusa.
    await expect(
      empenhar(
        {
          fichaId: FICHA_SERVICO, numero: "2026NE000009", tipo: "ORDINARIO",
          valor: "10.00", data: new Date("2026-02-01T12:00:00Z"),
          credorCpfCnpj: CREDOR, historico: "tentativa",
          categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
          criadoPor: "ninguem@lugar-nenhum.gov",
        },
        R_EMPENHO,
        criarM05Deps(prisma)
      )
    ).rejects.toThrow();

    expect(await prisma.empenho.count()).toBe(0);
  });
});
