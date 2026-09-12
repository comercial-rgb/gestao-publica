import "dotenv/config";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  criarPrismaDeTeste,
  criarPrismaDoPapelDeRuntime,
  exigirBanco,
} from "./banco.js";
import { limparBanco } from "./limpar-banco.js";
import { criarFichaDeTeste } from "./ficha-teste.js";
import { ESCRITA_MUTAVEL_DO_RUNTIME } from "../prisma/papel-runtime.js";
import { criarM05Deps } from "../modules/m05-despesa/adapter-prisma.js";
import {
  roteiroEmpenho,
  roteiroLiquidacao,
  roteiroPagamento,
  type RoteiroContabil,
} from "../modules/m05-despesa/dominio.js";
import { empenhar, reconciliarFicha } from "../modules/m05-despesa/servico.js";
import { liquidar, pagar } from "../modules/m05-despesa/servico-bloco2.js";
import type { M05Deps } from "../modules/m05-despesa/ports.js";

/**
 * O PAPEL DE RUNTIME — e as DUAS coisas que ele precisa provar de uma vez.
 *
 * ═══ 1. QUE ELE FECHA A LACUNA MEDIDA NO ENT00 ═══
 * O ENT00 provou, por SQL cru, que o append-only do razão existia só no domínio: o papel
 * da aplicação era superusuário e dono das tabelas, e `UPDATE`/`DELETE` no
 * `LancamentoContabil` passavam. O domínio protege quem passa por ele; não protege de um
 * script, de um console de banco, nem de uma rota que esqueça o funil.
 *
 * ═══ 2. QUE A APLICAÇÃO AINDA FUNCIONA SOB ELE ═══
 * E este é o lado que costuma faltar. Um papel restrito que ninguém exercita é uma
 * configuração bonita que quebra na primeira operação real — e quebra em produção, porque
 * a suíte rodou toda com o papel de sempre. Por isso a cadeia INTEIRA da despesa
 * (empenho -> liquidação -> pagamento COM RETENÇÃO) roda aqui pelo papel restrito, com os
 * números do cenário de aceite, e o razão é conferido conta a conta.
 *
 * ⚠️ DOIS CLIENTS, E A DIVISÃO É O DESENHO. `dono` semeia e limpa (truncar é um poder que
 * o runtime não tem, de propósito). `app` executa os casos de uso. Semear com o papel
 * restrito provaria só que a fixture não roda; operar com o dono provaria só que
 * superusuário passa.
 */

const dono = criarPrismaDeTeste();
const app = criarPrismaDoPapelDeRuntime();

await exigirBanco(dono);
await exigirBanco(app);

// ── o cenário de aceite do ENT01, §2.4 ──────────────────────────────────────
//
// ⚠️ VALORES DE ENGENHARIA. Não representam alíquota legal, pagamento real nem tabela
// tributária de município algum. Existem para exercitar exatamente a diferença entre
// bruto, líquido e a perna que carrega cada um.
const DOTACAO = "10000.00";
const EMPENHO = "1000.00";
const LIQUIDACAO = "1000.00";
const RETENCAO = "100.00";
const CAIXA_ESPERADO = "900.00";

const CONTAS = [
  { id: "c-disp", codigo: "6.2.2.1.1.00.00", nome: "Crédito Disponível", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-emp", codigo: "6.2.2.1.3.01.00", nome: "Crédito Empenhado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-liq", codigo: "6.2.2.1.3.03.00", nome: "Crédito Liquidado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-pago", codigo: "6.2.2.1.3.04.00", nome: "Crédito Pago", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpd", codigo: "3.3.2.1.1.01.00", nome: "VPD - Serviços", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-forn", codigo: "2.1.3.1.1.00.00", nome: "Fornecedores a Pagar", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-banco", codigo: "1.1.1.1.2.00.00", nome: "Bancos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-inss", codigo: "2.1.8.8.1.01.00", nome: "Consignações - INSS", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
];

const CAIXA = "1.1.1.1.2.00.00";
const P_INSS = "2.1.8.8.1.01.00";

const R_EMPENHO: RoteiroContabil = roteiroEmpenho({
  creditoDisponivel: "6.2.2.1.1.00.00",
  creditoEmpenhado: "6.2.2.1.3.01.00",
});
const R_LIQUIDACAO: RoteiroContabil = roteiroLiquidacao({
  variacaoDiminutiva: "3.3.2.1.1.01.00",
  obrigacaoAPagar: "2.1.3.1.1.00.00",
  creditoEmpenhado: "6.2.2.1.3.01.00",
  creditoLiquidado: "6.2.2.1.3.03.00",
});
const R_PAGAMENTO: RoteiroContabil = roteiroPagamento({
  obrigacaoAPagar: "2.1.3.1.1.00.00",
  disponibilidade: CAIXA,
  creditoLiquidado: "6.2.2.1.3.03.00",
  creditoPago: "6.2.2.1.3.04.00",
});

/**
 * ⚠️ OS VALORES ESPERADOS, ESCRITOS ANTES DE RODAR — é isto que o §2.4 pede, e a ordem
 * importa: uma expectativa escrita DEPOIS de ver o resultado não é expectativa, é
 * transcrição. O ponto que estes números protegem é UM: o caixa leva 900, e todas as
 * demais pernas levam 1.000. Um lançamento cujas pernas têm valores DIFERENTES.
 */
const PERNAS_ESPERADAS_DO_PAGAMENTO: ReadonlyArray<{
  readonly conta: string;
  readonly tipo: "DEBITO" | "CREDITO";
  readonly subsistema: "PATRIMONIAL" | "ORCAMENTARIO";
  readonly valor: string;
}> = [
  // patrimonial: a obrigação morre pelo BRUTO...
  { conta: "2.1.3.1.1.00.00", tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "1000.00" },
  // ...o caixa entrega só o LÍQUIDO...
  { conta: CAIXA, tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: CAIXA_ESPERADO },
  // ...e o retido vira passivo com o consignatário. 1000 = 900 + 100.
  { conta: P_INSS, tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: RETENCAO },
  // orçamentário: a execução do crédito é do BRUTO — o retido foi pago, só que a terceiro.
  { conta: "6.2.2.1.3.03.00", tipo: "DEBITO", subsistema: "ORCAMENTARIO", valor: "1000.00" },
  { conta: "6.2.2.1.3.04.00", tipo: "CREDITO", subsistema: "ORCAMENTARIO", valor: "1000.00" },
];

const CRIADO_POR = "ent01@cg.pb.gov.br";
const FICHA_ID = "ficha-papel";
const FONTE = "fnt-500";

async function semear(): Promise<void> {
  await limparBanco(dono);

  await dono.contaPcasp.createMany({ data: CONTAS });
  await dono.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await dono.unidadeOrcamentaria.create({
    data: { id: "uo-01", codigo: "01001", descricao: "Educação", orgaoId: "org-01" },
  });
  await dono.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educação" } });
  await dono.subfuncao.create({ data: { id: "sub-361", codigo: "361", nome: "Ensino Fundamental" } });
  await dono.programa.create({ data: { id: "prg-0012", codigo: "0012", descricao: "Educação Básica" } });
  await dono.acao.create({ data: { id: "aca-2001", codigo: "2001", descricao: "Manutenção", tipo: "ATIVIDADE" } });
  await dono.naturezaDespesa.create({
    data: {
      id: "nd-339039", codCategoria: "3", codNatureza: "3", codModalidade: "90",
      codElemento: "39", codigoCompleto: "339039", descricao: "Serviços PJ",
    },
  });
  await dono.fonteRecurso.create({
    data: { id: FONTE, codigo: "500", descricao: "Não vinculados", codigoTce: "500" },
  });
  await dono.contaBancaria.create({
    data: { id: "cb-1", codigo: "CC-001", descricao: "Conta livre", fonteId: FONTE },
  });
  await dono.tipoConsignacao.create({
    data: {
      id: "tc-inss", codigo: "INSS", descricao: "INSS", criadoPor: CRIADO_POR,
      // A conta de passivo é do CADASTRO — a gravação a confronta com a conta composta.
      contaPassivo: { connect: { codigo: P_INSS } },
    },
  });
  await criarFichaDeTeste(dono, {
    id: FICHA_ID, exercicio: 2026, numero: 1,
    orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-12",
    subfuncaoId: "sub-361", programaId: "prg-0012", acaoId: "aca-2001",
    naturezaDespesaId: "nd-339039", fonteId: FONTE,
    valorDotado: DOTACAO,
  });
}

// ════════════════════════════════════════════════════════════════════════════
// 1. A FORMA DO PAPEL
// ════════════════════════════════════════════════════════════════════════════

describe("papel de runtime — a forma", () => {
  it("não é superusuário, não contorna RLS e não cria banco nem papel", async () => {
    const [l] = await app.$queryRaw<
      ReadonlyArray<{
        usuario: string;
        rolsuper: boolean;
        rolbypassrls: boolean;
        rolcreatedb: boolean;
        rolcreaterole: boolean;
        rolreplication: boolean;
      }>
    >`SELECT current_user::text AS usuario, r.rolsuper, r.rolbypassrls,
             r.rolcreatedb, r.rolcreaterole, r.rolreplication
        FROM pg_roles r WHERE r.rolname = current_user`;

    expect(l).toBeDefined();
    expect(l?.rolsuper, "superusuário atravessa grant E política de linha").toBe(false);
    expect(l?.rolbypassrls, "BYPASSRLS torna toda política de linha decorativa").toBe(false);
    expect(l?.rolcreatedb).toBe(false);
    expect(l?.rolcreaterole, "CREATEROLE é escalada de privilégio por outro nome").toBe(false);
    expect(l?.rolreplication, "REPLICATION lê o WAL — as linhas que o grant nega").toBe(false);
  });

  it("não possui tabela nenhuma — dono de tabela ignora política de linha", async () => {
    const donas = await app.$queryRaw<ReadonlyArray<{ tablename: string }>>`
      SELECT tablename FROM pg_tables
       WHERE schemaname = 'public' AND tableowner = current_user`;
    expect(donas).toEqual([]);
  });

  it("não tem DDL: sem CREATE no schema, o papel não altera a estrutura", async () => {
    const [p] = await app.$queryRaw<ReadonlyArray<{ cria: boolean }>>`
      SELECT has_schema_privilege(current_user, 'public', 'CREATE') AS cria`;
    expect(p?.cria).toBe(false);

    await expect(app.$executeRawUnsafe("CREATE TABLE papel_ddl_proibido (x int)"))
      .rejects.toThrow();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. O CENSO CONTRA OS GRANTS REAIS — NAS DUAS DIREÇÕES
// ════════════════════════════════════════════════════════════════════════════

describe("papel de runtime — o censo da escrita mutável", () => {
  /** O que o BANCO diz que o papel pode mudar. `information_schema` já é por coluna. */
  async function grantsReais(): Promise<
    ReadonlyMap<string, { update: Set<string>; delete: boolean }>
  > {
    const colunas = await app.$queryRaw<
      ReadonlyArray<{ table_name: string; column_name: string }>
    >`SELECT table_name, column_name
        FROM information_schema.column_privileges
       WHERE grantee = current_user AND privilege_type = 'UPDATE'
         AND table_schema = 'public'`;
    const tabelas = await app.$queryRaw<ReadonlyArray<{ table_name: string; privilege_type: string }>>`
      SELECT table_name, privilege_type
        FROM information_schema.table_privileges
       WHERE grantee = current_user AND table_schema = 'public'
         AND privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE')`;

    const mapa = new Map<string, { update: Set<string>; delete: boolean }>();
    const entrada = (t: string) => {
      const e = mapa.get(t) ?? { update: new Set<string>(), delete: false };
      mapa.set(t, e);
      return e;
    };
    for (const c of colunas) entrada(c.table_name).update.add(c.column_name);
    for (const t of tabelas) {
      if (t.privilege_type === "DELETE") entrada(t.table_name).delete = true;
      // UPDATE em nível de TABELA (não de coluna) é privilégio amplo demais: ele
      // alcançaria colunas que o censo não declarou. Marcamos com "*" para o
      // confronto abaixo denunciá-lo pelo nome.
      if (t.privilege_type === "UPDATE") entrada(t.table_name).update.add("*");
      if (t.privilege_type === "TRUNCATE") entrada(t.table_name).update.add("TRUNCATE");
    }
    return mapa;
  }

  it("o banco não concede um único UPDATE/DELETE fora do censo", async () => {
    const reais = await grantsReais();
    const sobrando = [...reais.keys()].filter(
      (t) => ESCRITA_MUTAVEL_DO_RUNTIME[t] === undefined
    );
    expect(
      sobrando,
      "tabela mutável para o runtime que ninguém declarou em prisma/papel-runtime.ts"
    ).toEqual([]);
  });

  it("cada linha do censo bate coluna a coluna com o grant real", async () => {
    const reais = await grantsReais();
    for (const [tabela, esperado] of Object.entries(ESCRITA_MUTAVEL_DO_RUNTIME)) {
      const real = reais.get(tabela);
      if (esperado.update.length === 0 && !esperado.delete) continue;
      expect(real, `censo declara ${tabela}, mas o banco não concede nada`).toBeDefined();
      expect([...(real?.update ?? [])].sort(), `UPDATE em ${tabela}`).toEqual(
        [...esperado.update].sort()
      );
      expect(real?.delete ?? false, `DELETE em ${tabela}`).toBe(esperado.delete);
    }
  });

  it("o razão e a cadeia da despesa são somente-inserção para o runtime", async () => {
    const reais = await grantsReais();
    for (const tabela of [
      "LancamentoContabil",
      "PartidaContabil",
      "Empenho",
      "Liquidacao",
      "Pagamento",
      "MovimentoDotacao",
      "RegistroDeOperacao",
    ]) {
      expect(reais.get(tabela), `${tabela} deveria ser append-only no banco`).toBeUndefined();
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. A CADEIA INTEIRA SOB O PAPEL RESTRITO — o cenário de aceite
// ════════════════════════════════════════════════════════════════════════════

describe("papel de runtime — a despesa atravessa o sistema", () => {
  let deps: M05Deps;
  let lancamentoDoPagamento: string;

  beforeAll(async () => {
    await semear();
    // ⚠️ AS DEPS SÃO MONTADAS SOBRE O CLIENT DA APLICAÇÃO. É o ponto do arquivo: os
    // casos de uso do M05 rodam com o papel restrito, não com o dono.
    deps = criarM05Deps(app);

    const e = await empenhar(
      {
        fichaId: FICHA_ID,
        numero: "2026NE0001",
        tipo: "ORDINARIO",
        valor: EMPENHO,
        data: new Date("2026-04-10T12:00:00Z"),
        credorCpfCnpj: "12345678000199",
        historico: "empenho do cenário de aceite",
        categoriaOrdemCronologica: "FORNECIMENTO_BENS",
        criadoPor: CRIADO_POR,
      },
      R_EMPENHO,
      deps
    );

    const l = await liquidar(
      {
        empenhoId: e.empenhoId,
        numero: "2026NL0001",
        valor: LIQUIDACAO,
        data: new Date("2026-05-01T12:00:00Z"),
        responsavelAtesto: "Fulano de Tal",
        historico: "liquidação do cenário de aceite",
        criadoPor: CRIADO_POR,
      },
      R_LIQUIDACAO,
      deps
    );

    const p = await pagar(
      {
        liquidacaoId: l.liquidacaoId,
        numero: "2026OP0001",
        valor: LIQUIDACAO,
        data: new Date("2026-06-01T12:00:00Z"),
        contaBancaria: "CC-001",
        fonteId: FONTE,
        historico: "pagamento com retenção do cenário de aceite",
        criadoPor: CRIADO_POR,
      },
      R_PAGAMENTO,
      deps,
      {
        contaDisponibilidade: CAIXA,
        retencoes: [
          {
            tipoConsignacaoId: "tc-inss",
            credorConsignatario: "INSS",
            valor: RETENCAO,
            contaConsignacaoAPagar: P_INSS,
          },
        ],
      }
    );
    lancamentoDoPagamento = p.lancamentoId;
  });

  it("o pagamento tem pernas de valores DIFERENTES: caixa 900, o resto 1.000", async () => {
    const l = await app.lancamentoContabil.findUniqueOrThrow({
      where: { id: lancamentoDoPagamento },
      select: {
        partidas: {
          select: {
            tipo: true,
            subsistema: true,
            valor: true,
            conta: { select: { codigo: true } },
          },
        },
      },
    });

    const obtidas = l.partidas
      .map((p) => ({
        conta: p.conta.codigo,
        tipo: p.tipo as "DEBITO" | "CREDITO",
        subsistema: p.subsistema as "PATRIMONIAL" | "ORCAMENTARIO",
        valor: p.valor.toFixed(2),
      }))
      .sort((a, b) => (a.conta + a.tipo).localeCompare(b.conta + b.tipo));

    const esperadas = [...PERNAS_ESPERADAS_DO_PAGAMENTO].sort((a, b) =>
      (a.conta + a.tipo).localeCompare(b.conta + b.tipo)
    );

    expect(obtidas).toEqual(esperadas);
  });

  it("o caixa recebeu o LÍQUIDO — nunca o bruto de um desembolso que não houve", async () => {
    const caixa = await app.partidaContabil.findMany({
      where: { lancamentoId: lancamentoDoPagamento, conta: { codigo: CAIXA } },
      select: { valor: true, tipo: true },
    });
    expect(caixa).toHaveLength(1);
    expect(caixa[0]?.valor.toFixed(2)).toBe(CAIXA_ESPERADO);
    expect(caixa[0]?.tipo).toBe("CREDITO");
  });

  it("cada subsistema fecha sozinho — não por compensação entre eles", async () => {
    const partidas = await app.partidaContabil.findMany({
      where: { lancamentoId: lancamentoDoPagamento },
      select: { tipo: true, subsistema: true, valor: true },
    });

    const porSubsistema = new Map<string, { d: number; c: number }>();
    for (const p of partidas) {
      const s = porSubsistema.get(p.subsistema) ?? { d: 0, c: 0 };
      if (p.tipo === "DEBITO") s.d += Number(p.valor.toFixed(2));
      else s.c += Number(p.valor.toFixed(2));
      porSubsistema.set(p.subsistema, s);
    }

    expect(porSubsistema.size).toBeGreaterThan(1);
    for (const [subsistema, { d, c }] of porSubsistema) {
      expect(d, `ΣD == ΣC no subsistema ${subsistema}`).toBe(c);
    }
  });

  it("o cache de saldo da ficha reconcilia com os movimentos — sob o papel restrito", async () => {
    // A ÚNICA coluna que o runtime tem direito de UPDATE nesta cadeia. Se o grant por
    // coluna estivesse errado, o `recalcularCache` teria estourado no empenho — e este
    // teste nem chegaria aqui.
    expect(await reconciliarFicha(FICHA_ID, deps)).toEqual([]);

    const ficha = await app.fichaOrcamentaria.findUniqueOrThrow({
      where: { id: FICHA_ID },
      select: { saldoEmpenhado: true, saldoDisponivel: true },
    });
    expect(ficha.saldoEmpenhado.toFixed(2)).toBe(EMPENHO);
    expect(ficha.saldoDisponivel.toFixed(2)).toBe("9000.00");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. O QUE O ENT00 MEDIU, AGORA FECHADO
// ════════════════════════════════════════════════════════════════════════════

describe("papel de runtime — o razão é imutável no banco, não só no domínio", () => {
  beforeEach(async () => {
    await semear();
    await dono.lancamentoContabil.create({
      data: {
        id: "alvo-papel",
        numeroControle: "ENT01-ALVO",
        dataTransacao: new Date("2026-01-02T00:00:00Z"),
        historico: "lançamento alvo",
        origemTipo: "TESTE_PAPEL",
        criadoPor: CRIADO_POR,
      },
    });
  });

  it("o papel LÊ o lançamento — a restrição não cegou a aplicação", async () => {
    const l = await app.lancamentoContabil.findUnique({ where: { id: "alvo-papel" } });
    expect(l?.historico).toBe("lançamento alvo");
  });

  it("UPDATE no lançamento é negado PELO BANCO", async () => {
    await expect(
      app.lancamentoContabil.update({
        where: { id: "alvo-papel" },
        data: { historico: "MUTAÇÃO INDEVIDA" },
      })
    ).rejects.toThrow(/permission denied|permissão negada/i);

    const depois = await dono.lancamentoContabil.findUniqueOrThrow({
      where: { id: "alvo-papel" },
    });
    expect(depois.historico).toBe("lançamento alvo");
  });

  it("DELETE no lançamento é negado PELO BANCO", async () => {
    await expect(
      app.lancamentoContabil.delete({ where: { id: "alvo-papel" } })
    ).rejects.toThrow(/permission denied|permissão negada/i);

    expect(
      await dono.lancamentoContabil.count({ where: { id: "alvo-papel" } })
    ).toBe(1);
  });

  it("TRUNCATE é negado — apagar o razão inteiro de uma vez também não passa", async () => {
    await expect(
      app.$executeRawUnsafe('TRUNCATE TABLE "PartidaContabil", "LancamentoContabil" CASCADE')
    ).rejects.toThrow();
    expect(await dono.lancamentoContabil.count()).toBeGreaterThan(0);
  });

  it("a auditoria de operações também não pode ser reescrita", async () => {
    await expect(
      app.$executeRawUnsafe(`UPDATE "RegistroDeOperacao" SET "resultado" = 'SUCESSO'`)
    ).rejects.toThrow(/permission denied|permissão negada/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5. ENT06 — A CONCESSÃO DE PERMISSÃO PELO PAPEL DA APLICAÇÃO
//
// ⚠️ POR QUE ESTE BLOCO EXISTE, E ELE NASCEU DE UMA MUTAÇÃO QUE NÃO ACUSOU.
//
// O censo (`ESCRITA_MUTAVEL_DO_RUNTIME`) ganhou `PermissaoDePerfil` porque a tela de perfis
// REVOGA, e revogar apaga a linha. A prova tentada foi tirar a tabela do censo e esperar
// vermelho — e **ficou verde**. A razão: o `global-setup` PROVISIONA a partir do próprio
// censo antes da suíte, então censo e banco se movem juntos, e a comparação entre os dois
// não consegue enxergar uma omissão. Aquele teste pega grant manual fora do censo; não pega
// permissão que faltou.
//
// O que prova é o EFEITO: o papel da aplicação apagando a linha de verdade. Tire
// `PermissaoDePerfil` do censo e este bloco fica vermelho com "permission denied" — que é a
// mesma falha que o município veria, com a suíte de módulo verde na máquina de quem escreveu
// (os testes de domínio conectam como DONO).
// ════════════════════════════════════════════════════════════════════════════

describe("papel de runtime — a tela de perfis escreve e apaga permissão", () => {
  beforeEach(async () => {
    await dono.permissaoDePerfil.deleteMany({ where: { perfil: { nome: "PAPEL-PERFIL" } } });
    await dono.perfil.deleteMany({ where: { nome: "PAPEL-PERFIL" } });
    await dono.perfil.create({
      data: { id: "papel-perfil", nome: "PAPEL-PERFIL", descricao: "alvo do teste", criadoPor: CRIADO_POR },
    });
  });

  it("o papel CONCEDE — a linha de permissão é INSERT, como todo fato do repositório", async () => {
    await app.permissaoDePerfil.create({
      data: { perfilId: "papel-perfil", acao: "CADASTRAR_DEPOSITO", criadoPor: CRIADO_POR },
    });
    expect(
      await dono.permissaoDePerfil.count({ where: { perfilId: "papel-perfil" } })
    ).toBe(1);
  });

  it("o papel REVOGA — e é isto que o censo precisou autorizar", async () => {
    const criada = await dono.permissaoDePerfil.create({
      data: { perfilId: "papel-perfil", acao: "CADASTRAR_MATERIAL", criadoPor: CRIADO_POR },
      select: { id: true },
    });

    // ⚠️ SEM A ENTRADA NO CENSO, ESTA LINHA ESTOURA COM "permission denied" — e a tela de
    // perfis falharia no município com a suíte de domínio verde.
    await app.permissaoDePerfil.delete({ where: { id: criada.id } });

    expect(await dono.permissaoDePerfil.count({ where: { id: criada.id } })).toBe(0);
  });

  it("o papel NÃO reescreve uma permissão — mudar de ação seria trocar o poder sem rastro", async () => {
    const criada = await dono.permissaoDePerfil.create({
      data: { perfilId: "papel-perfil", acao: "CADASTRAR_DEPOSITO", criadoPor: CRIADO_POR },
      select: { id: true },
    });

    // ⚠️ O CENSO DECLARA `update: []` — DELETE sim, UPDATE não. Reescrever a ação de uma
    // concessão existente mudaria o poder mantendo o `criadoPor` de quem concedeu OUTRA
    // coisa: a auditoria diria que fulano concedeu o que ele não concedeu.
    await expect(
      app.permissaoDePerfil.update({ where: { id: criada.id }, data: { acao: "CADASTRAR_MATERIAL" } })
    ).rejects.toThrow(/permission denied|permissão negada/i);

    const depois = await dono.permissaoDePerfil.findUniqueOrThrow({ where: { id: criada.id } });
    expect(String(depois.acao)).toBe("CADASTRAR_DEPOSITO");
  });
});

afterAll(async () => {
  await app.$disconnect();
  await dono.$disconnect();
});
