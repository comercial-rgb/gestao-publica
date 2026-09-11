import "dotenv/config";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { truncarTudo } from "./limpar-banco.js";
import { bootstrapUsuario } from "../prisma/seed/bootstrap-usuario.js";
import { criarM05Deps } from "../modules/m05-despesa/adapter-prisma.js";
import { criarM01Deps } from "../modules/m01-core-contabil/adapter-prisma.js";
import { criarM04Deps } from "../modules/m04-receita/adapter-prisma.js";
import {
  roteiroEmpenho,
  roteiroLiquidacao,
} from "../modules/m01-core-contabil/roteiros.js";
import { empenhar } from "../modules/m05-despesa/servico.js";
import { liquidar } from "../modules/m05-despesa/servico-bloco2.js";
import { registrarLancamento } from "../modules/m01-core-contabil/servico.js";
import { registrarIngressoExtra } from "../modules/m07-extraorcamentario/index.js";

/**
 * O BANCO SEMEADO **SÓ** PELOS SEEDS DE PRODUÇÃO — e a primeira escrita de cada módulo.
 *
 * ═══ POR QUE ESTE ARQUIVO EXISTE ═══
 * `RoteiroOrcamentario` é uma tabela-parâmetro FAIL-CLOSED: sem ela, o movimento de
 * dotação não lança no razão e **nenhuma ficha nasce**. Os roteiros existiam apenas num
 * helper de TESTE (`test/roteiro-orcamentario.ts`), então a suíte inteira — 1.382 testes —
 * passava enquanto um banco de verdade não conseguia criar a primeira ficha.
 *
 * **A suíte não podia pegar isso: ela mesma semeava o que faltava.** Nenhum teste do
 * repositório era capaz de detectar a classe inteira dessa falha, porque todos partiam de
 * um banco já preparado por fixtures.
 *
 * Este arquivo parte de um banco VAZIO, roda **os mesmos comandos que um operador roda**
 * (`npx tsx prisma/seed/…`, exatamente o que os `npm run seed:*` executam), e só então
 * tenta a primeira escrita de cada módulo. O que faltar aparece aqui — e a correção é
 * seed de produção, nunca helper de teste.
 *
 * ═══ ⚠️ O QUE ELE NÃO USA, E O MOTIVO ═══
 * `truncarTudo`, e não `limparBanco`: a segunda semeia os usuários de fixture. Herdá-los
 * provaria que o sistema funciona com um ator que produção nenhuma tem — exatamente o
 * falso-verde que este arquivo caça. A identidade sai do `bootstrapUsuario`, que é o
 * caminho REAL de instalação (e aborta num banco povoado, de propósito).
 *
 * ═══ AS TABELAS-PARÂMETRO SOB SUSPEITA ═══
 * Toda tabela-parâmetro fail-closed tem o mesmo formato de risco: o domínio recusa sem
 * ela, e a fixture a semeia sem que ninguém perceba que produção não a tem. As
 * conhecidas: PCASP, classificações da STN (função, subfunção, natureza de despesa),
 * roteiro orçamentário, tipos de consignação e — quando existirem — naturezas de receita
 * e eventos contábeis.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const IDENT = "admin@cg.pb.gov.br";
const SENHA_DE_INSTALACAO = "instalacao-de-teste-longa-o-bastante";

/**
 * Roda um seed COMO O OPERADOR RODA — o mesmo `tsx <script>` que o `npm run seed:*`
 * executa, no banco de TESTE.
 *
 * ⚠️ SPAWN, e não `import`. Importar a função exportada testaria a função; o que precisa
 * ser testado é o COMANDO — inclusive o que ele exige de ambiente e a ordem em que os
 * comandos têm de rodar. Um seed que só funciona quando chamado de dentro do Vitest não
 * serve para instalar nada.
 */
function semear(script: string, env: Record<string, string> = {}): string {
  return execFileSync("npx", ["tsx", `prisma/seed/${script}`], {
    cwd: RAIZ,
    encoding: "utf8",
    env: {
      ...process.env,
      // O `test/setup.ts` já apontou DATABASE_URL para o banco de teste neste worker.
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

let identidade: string;

beforeAll(async () => {
  await truncarTudo(prisma);

  // ⚠️ A ORDEM É PARTE DO QUE SE TESTA. Cada um destes falha, nomeando, se o anterior
  // não rodou — e é assim que um operador descobre a sequência sem adivinhar.
  semear("pcasp.ts");
  semear("m02-seed-oficial.ts");
  semear("roteiro-orcamentario.ts");
  semear("m07-tipos-consignacao.ts");

  // A identidade: o caminho REAL de instalação. Não há usuário de fixture aqui.
  const r = await bootstrapUsuario(prisma, SENHA_DE_INSTALACAO);
  identidade = r.identificador;
  expect(identidade).toBe(IDENT);

  semear("cenario-aceite.ts", { SEED_IDENTIDADE: IDENT });
}, 180_000);

describe("banco semeado só por seeds de produção", () => {
  it("o plano de contas e as classificações da STN estão lá", async () => {
    // Sem PCASP, `resolverContas` é fail-closed e NADA lança no razão.
    expect(await prisma.contaPcasp.count()).toBeGreaterThan(0);
    expect(await prisma.funcao.count()).toBeGreaterThan(0);
    expect(await prisma.subfuncao.count()).toBeGreaterThan(0);
    expect(await prisma.naturezaDespesa.count()).toBeGreaterThan(0);
  });

  it("o ROTEIRO ORÇAMENTÁRIO existe — a lacuna que originou este arquivo", async () => {
    const roteiros = await prisma.roteiroOrcamentario.count();
    expect(
      roteiros,
      "sem RoteiroOrcamentario o movimento de dotação não lança no razão e nenhuma ficha " +
        "nasce. Os roteiros já existiram SÓ num helper de teste, e a suíte inteira passava."
    ).toBeGreaterThan(0);
  });

  it("todo tipo de consignação tem CONTA DE PASSIVO — senão a retenção é impossível", async () => {
    const semConta = await prisma.tipoConsignacao.findMany({
      where: { contaPassivoId: null },
      select: { codigo: true },
    });
    expect(
      semConta.map((t) => t.codigo),
      "um tipo sem conta de passivo não pode receber retenção — e a recusa só apareceria " +
        "no meio de um pagamento, para o operador, sem que ele soubesse o que fazer."
    ).toEqual([]);
  });

  it("A PRIMEIRA FICHA NASCE — é ela que o roteiro ausente impedia", async () => {
    const ficha = await prisma.fichaOrcamentaria.findFirst({
      where: { exercicio: 2026 },
      select: { id: true, saldoDisponivel: true },
    });
    expect(ficha, "o seed do cenário de aceite criou a ficha").not.toBeNull();
    expect(Number(ficha?.saldoDisponivel.toFixed(2) ?? "0")).toBeGreaterThan(0);
  });

  it("M05 — A PRIMEIRA ESCRITA: empenhar e liquidar num banco recém-instalado", async () => {
    const ficha = await prisma.fichaOrcamentaria.findFirstOrThrow({
      where: { exercicio: 2026 },
      select: { id: true, naturezaDespesa: { select: { codElemento: true } } },
    });

    // ⚠️ OS ROTEIROS OFICIAIS DO M01, sem argumento de conta — os mesmos que a porta
    // usa. Passar contas à mão aqui esconderia o que se quer medir: que o PLANO DE
    // PRODUÇÃO tem as contas que o roteiro de produção pede.
    const e = await empenhar(
      {
        fichaId: ficha.id, numero: "2026NE-PRIMEIRO", tipo: "ORDINARIO",
        valor: "100.00", data: new Date("2026-04-10T12:00:00Z"),
        credorCpfCnpj: "12345678000199", historico: "primeira escrita da instalação",
        categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: identidade,
      },
      roteiroEmpenho(),
      criarM05Deps(prisma)
    );
    expect(e.empenhoId).toBeTruthy();

    const l = await liquidar(
      {
        empenhoId: e.empenhoId, numero: "2026NL-PRIMEIRO", valor: "100.00",
        data: new Date("2026-05-01T12:00:00Z"), responsavelAtesto: "Servidor",
        historico: "primeira liquidação da instalação", criadoPor: identidade,
      },
      roteiroLiquidacao({
        codElemento: ficha.naturezaDespesa.codElemento,
        obrigacaoAPagar: "2.1.3.1.1.00.00",
      }),
      criarM05Deps(prisma)
    );
    expect(l.liquidacaoId).toBeTruthy();
  });

  it("M01 — A PRIMEIRA ESCRITA: o lançamento manual do razão", async () => {
    const id = await registrarLancamento(
      {
        numeroControle: "MANUAL-PRIMEIRO",
        dataTransacao: new Date("2026-04-10T12:00:00Z"),
        historico: "primeiro lançamento manual da instalação",
        origemTipo: "MANUAL",
        criadoPor: identidade,
        partidas: [
          { conta: "1.1.1.1.1.19.00", tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "10.00" },
          { conta: "2.1.3.1.1.00.00", tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "10.00" },
        ],
      },
      criarM01Deps(prisma)
    );
    expect(id).toBeTruthy();
  });

  it("M07 — A PRIMEIRA ESCRITA: o ingresso extraorçamentário", async () => {
    const tipo = await prisma.tipoConsignacao.findFirstOrThrow({
      where: { codigo: "CAUCAO" },
      select: { id: true, contaPassivo: { select: { codigo: true } } },
    });
    const conta = await prisma.contaBancaria.findFirstOrThrow({
      select: { codigo: true, fonteId: true },
    });

    const r = await registrarIngressoExtra(
      prisma,
      {
        tipoConsignacaoId: tipo.id, credorConsignatario: "Caucionante Ltda",
        contaBancaria: conta.codigo, fonteId: conta.fonteId, valor: "500.00",
        data: new Date("2026-04-15T12:00:00Z"),
        historico: "caução contratual — primeira do banco", criadoPor: identidade,
      },
      [
        { conta: "1.1.1.1.1.19.00", tipo: "DEBITO", subsistema: "PATRIMONIAL" },
        { conta: tipo.contaPassivo!.codigo, tipo: "CREDITO", subsistema: "PATRIMONIAL" },
      ]
    );
    expect(r.movimentoId).toBeTruthy();
  });

  it("M04 — a receita tem as deps montáveis e o plano responde", async () => {
    // ⚠️ NÃO ARRECADA. `roteiroArrecadacao` exige a VPA da natureza da receita, e o plano
    // mínimo tem UMA só — a pendência **MAPA-NATUREZA-CONTA**, já nomeada em
    // `components/ui/MODULO-UI.md`. Fingir uma arrecadação aqui escolheria a conta por
    // fora do mapa que não existe, e o teste passaria a certificar a invenção.
    //
    // O que dá para afirmar honestamente: as deps do M04 montam sobre o banco instalado, e
    // a conta que o roteiro de produção usaria está no plano.
    expect(criarM04Deps(prisma)).toBeTruthy();
    expect(
      await prisma.contaPcasp.findUnique({ where: { codigo: "4.1.1.2.1.01.00" } })
    ).not.toBeNull();
  });

  it("o bootstrap é INERTE num banco já povoado — rodar de novo FALHA", async () => {
    // A condição que faz a exceção do bootstrap ser mais dura que a regra que ela abre.
    await expect(bootstrapUsuario(prisma, SENHA_DE_INSTALACAO)).rejects.toThrow(
      /BOOTSTRAP RECUSADO/
    );
  });
});
