import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../banco.js";
import { limparBanco } from "../limpar-banco.js";
import { criarFichaDeTeste } from "../ficha-teste.js";
import { DIA_DE_BORDA } from "../instantes.js";
import { criarM05Deps } from "../../modules/m05-despesa/adapter-prisma.js";
import type { M05Deps } from "../../modules/m05-despesa/ports.js";
import { roteiroEmpenho } from "../../modules/m05-despesa/dominio.js";
import { empenhar } from "../../modules/m05-despesa/servico.js";
import type { Identidade } from "../../modules/m16-travamento/autenticacao.js";
import { listarEmpenhosDaExecucao } from "../../lib/portas/empenho.js";
import { listarUgsDoUsuario } from "../../lib/portas/contexto.js";

/**
 * CARACTERIZAÇÃO — A LEITURA DA EXECUÇÃO NÃO PERGUNTA QUEM ESTÁ PEDINDO.
 *
 * ═══ ISTO NÃO É UM TESTE DE REQUISITO ═══
 * Um teste de requisito afirma o que o sistema DEVE fazer e falha quando o código está
 * errado. Este afirma o que o sistema **FAZ HOJE** e falhará quando o comportamento mudar —
 * e a mudança, aqui, é a correção. É esse o serviço que ele presta: o conserto passa a ser
 * uma decisão consciente, com o antes e o depois à vista, em vez de uma alteração silenciosa
 * de semântica no meio de outro trabalho.
 *
 * ═══ O QUE ESTÁ MEDIDO, E NÃO É DESCOBERTA NOVA ═══
 * `test/ui/contexto-ug.test.ts` nasceu do MESMO furo e corrigiu METADE dele: o seletor do
 * cabeçalho deixou de oferecer unidade que o usuário não pode ler. A outra metade é a URL —
 * e é ela que este arquivo mede. O usuário da Saúde não precisa mais do seletor: basta
 * digitar `?ug=01003` (Educação), ou omitir o parâmetro e receber o ente inteiro.
 *
 * ═══ E O DEFEITO ESTÁ NA ASSINATURA, NÃO NUMA CAMADA ESQUECIDA ═══
 * `listarEmpenhosDaExecucao({ exercicio, unidadeCodigo? })` **não tem parâmetro de
 * identidade**. Não há onde a pergunta "quem está pedindo?" caberia. Por isso a correção não
 * é acrescentar uma guarda dentro da função: é mudar a forma de entrada, para que o recorte
 * chegue já autorizado e o defeito se torne inexprimível em vez de vigiado.
 *
 * ⚠️ CONTRASTE COM A ESCRITA, que prova não ser descuido de estilo: a escrita resolve a
 * unidade pelo ALVO DO FATO (`resolverUgs`) e recusa nomeando o escopo. A leitura não tem
 * equivalente — ela nem recebe a identidade.
 *
 * ═══ ⚠️ ESTE ARQUIVO CHAMA AS PORTAS DE VERDADE ═══
 * O teste vizinho (`contexto-ug.test.ts`) REPRODUZ a consulta contra o mesmo schema e
 * declara o custo em voz alta: *"se a porta divergir desta consulta, o teste continua
 * verde"*. A justificativa escrita era que `lib/portas/cliente` depende de `next/headers`.
 * **Ela está errada, e isso foi medido:** `cliente()` lê `process.env.DATABASE_URL` DENTRO da
 * função (`lib/portas/cliente.ts:13`), e o `test/setup.ts` reescreve essa variável para o
 * banco isolado ANTES de o arquivo de teste ser importado. Quem depende de request é
 * `sessao.ts`, que lê cookies e cabeçalhos.
 *
 * Consequência: aqui a porta é EXERCITADA, não imitada. Duas conexões distintas (a fixture
 * pelo `criarPrismaDeTeste`, a porta pelo singleton de `cliente()`) apontam para o mesmo
 * banco — por isso a fixture grava em chamadas discretas, nunca dentro de uma transação
 * aberta: a porta leria antes do commit e o teste passaria por vacuidade.
 *
 * ═══ FIXTURE N=2, E COM N=1 NÃO HAVERIA NADA A PROVAR ═══
 * Duas unidades do MESMO órgão, uma ficha em cada, um empenho em cada, e um usuário com
 * permissão só na primeira. Com uma unidade só, "a lista trouxe a unidade certa" é verdade
 * por vacuidade — trouxe a única que existe.
 *
 * ⚠️ O usuário nasce DEPOIS do `limparBanco`, e isso é necessário: `semearUsuariosDeTeste`
 * vincula ao perfil ADMIN **todo usuário que existir naquele instante**. Um usuário criado
 * antes chegaria aqui com permissão GLOBAL, e o teste da segregação provaria o contrário do
 * que pretende. O prefixo `ent10.` evita, além disso, colidir com os identificadores
 * daquela lista, que são únicos.
 */

const prisma = criarPrismaDeTeste();

// FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Ver test/banco.ts.
await exigirBanco(prisma);

/** O autor das escritas da fixture — identidade já cadastrada pelo `limparBanco`. */
const POR = "despesa@cg.pb.gov.br";
const CREDOR = "12345678000199";
const EXERCICIO = 2026;

/** As duas unidades do cenário, pelos códigos SAGRES que o `contexto-ug.test.ts` já usa. */
const COD_SAUDE = "01004";
const COD_EDUCACAO = "01003";

const FICHA_SAUDE = "ficha-ent10-saude";
const FICHA_EDUCACAO = "ficha-ent10-educacao";
const FONTE = "fnt-ent10";

// Contas do PCASP — os mesmos códigos reais que as fixtures do M05 usam. Nenhum código
// inventado: fabricar conta para um teste passar é inventar norma da STN dentro de um teste.
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";

const R_EMPENHO = roteiroEmpenho({
  creditoDisponivel: C_DISPONIVEL,
  creditoEmpenhado: C_EMPENHADO,
});

let deps: M05Deps;
/** A identidade de quem só tem crachá da Saúde — montada com os dois campos reais. */
let soSaude: Identidade;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  deps = criarM05Deps(prisma);

  await prisma.contaPcasp.createMany({
    data: [
      {
        id: "c-disp-ent10",
        codigo: C_DISPONIVEL,
        nome: "Crédito Disponível",
        naturezaSaldo: "CREDORA",
        nivel: 5,
        analitica: true,
      },
      {
        id: "c-emp-ent10",
        codigo: C_EMPENHADO,
        nome: "Crédito Empenhado",
        naturezaSaldo: "CREDORA",
        nivel: 5,
        analitica: true,
      },
    ],
  });

  // ⚠️ O MESMO ÓRGÃO para as duas unidades. Se fossem órgãos diferentes, um filtro por órgão
  // esconderia o defeito por acidente, e o teste ficaria verde sem que a unidade importasse.
  await prisma.orgao.create({
    data: { id: "org-ent10", codigo: "01", nome: "Prefeitura" },
  });
  const saude = await prisma.unidadeOrcamentaria.create({
    data: {
      id: "uo-ent10-saude",
      codigo: COD_SAUDE,
      descricao: "Secretaria de Saude",
      orgaoId: "org-ent10",
    },
  });
  await prisma.unidadeOrcamentaria.create({
    data: {
      id: "uo-ent10-educacao",
      codigo: COD_EDUCACAO,
      descricao: "Secretaria de Educacao",
      orgaoId: "org-ent10",
    },
  });

  await prisma.funcao.create({ data: { id: "fun-ent10", codigo: "04", nome: "Administração" } });
  await prisma.subfuncao.create({ data: { id: "sub-ent10", codigo: "122", nome: "Adm" } });
  await prisma.programa.create({ data: { id: "prg-ent10", codigo: "0004", descricao: "P" } });
  await prisma.acao.create({
    data: { id: "aca-ent10", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" },
  });
  await prisma.naturezaDespesa.create({
    data: {
      id: "nd-ent10",
      codCategoria: "3",
      codNatureza: "3",
      codModalidade: "90",
      codElemento: "30",
      codigoCompleto: "339030",
      descricao: "Material",
    },
  });
  await prisma.fonteRecurso.create({
    data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" },
  });

  const comum = {
    exercicio: EXERCICIO,
    orgaoId: "org-ent10",
    funcaoId: "fun-ent10",
    subfuncaoId: "sub-ent10",
    programaId: "prg-ent10",
    acaoId: "aca-ent10",
    naturezaDespesaId: "nd-ent10",
    fonteId: FONTE,
    valorDotado: "500000.00",
  } as const;

  await criarFichaDeTeste(prisma, {
    ...comum,
    id: FICHA_SAUDE,
    numero: 1,
    unidadeOrcId: "uo-ent10-saude",
  });
  await criarFichaDeTeste(prisma, {
    ...comum,
    id: FICHA_EDUCACAO,
    numero: 2,
    unidadeOrcId: "uo-ent10-educacao",
  });

  await empenha(FICHA_SAUDE, "NE-SAUDE-1", "10000.00");
  await empenha(FICHA_EDUCACAO, "NE-EDUCACAO-1", "7000.00");

  // ── o usuário com crachá de UMA unidade só ──
  const usuario = await prisma.usuario.create({
    data: {
      identificador: "ent10.so.saude",
      nome: "ent10.so.saude",
      criadoPor: "seed-teste",
    },
    select: { id: true, identificador: true },
  });
  const perfil = await prisma.perfil.create({
    data: { nome: "perfil-ent10-saude", descricao: "teste", criadoPor: "seed-teste" },
    select: { id: true },
  });
  await prisma.permissaoDePerfil.create({
    data: {
      perfilId: perfil.id,
      // Qualquer ação serve: a pergunta é "onde ele trabalha?", não "o que ele faz".
      acao: "EMPENHAR",
      unidadeOrcId: saude.id,
      criadoPor: "seed-teste",
    },
  });
  await prisma.vinculoUsuarioPerfil.create({
    data: { usuarioId: usuario.id, perfilId: perfil.id, criadoPor: "seed-teste" },
  });

  soSaude = { usuarioId: usuario.id, identificador: usuario.identificador };
}

async function empenha(fichaId: string, numero: string, valor: string): Promise<void> {
  await empenhar(
    {
      fichaId,
      numero,
      tipo: "ORDINARIO",
      valor,
      // ⚠️ HORA DE BORDA, não meio-dia — ver test/instantes.ts.
      data: DIA_DE_BORDA(EXERCICIO, 2, 1),
      credorCpfCnpj: CREDOR,
      historico: `empenho ${numero}`,
      categoriaOrdemCronologica: "FORNECIMENTO_BENS",
      criadoPor: POR,
    },
    R_EMPENHO,
    deps
  );
}

describe("caracterização — a leitura da execução ignora o escopo de quem pede", () => {
  beforeEach(async () => {
    await semear();
  });

  /**
   * ⚠️ O CONSOLIDADO POR OMISSÃO. Sem `unidadeCodigo`, o `where` da ficha é apenas por
   * exercício — e a omissão produz o ente inteiro dentro do próprio SQL
   * (`modules/m05-despesa/consultas.ts:589`). Qualquer sessão que chegue à tela sem o
   * parâmetro na URL recebe as duas unidades.
   */
  it("HOJE: sem unidade na URL, a porta entrega as DUAS unidades a qualquer sessão", async () => {
    const empenhos = await listarEmpenhosDaExecucao({ exercicio: EXERCICIO });

    const unidades = [...new Set(empenhos.map((e) => e.unidadeCodigo))].sort();
    expect(unidades).toEqual([COD_EDUCACAO, COD_SAUDE]);
    expect(empenhos).toHaveLength(2);
  });

  /**
   * ⚠️ A UNIDADE ALHEIA, PEDIDA PELA URL. Este é o caminho que o `contexto-ug.test.ts`
   * deixou aberto: corrigido o seletor, a URL continua aceitando qualquer código.
   *
   * E a asserção AFIRMA O MOTIVO, não só o resultado: a porta devolve o empenho da Educação
   * porque **não existe parâmetro de identidade na assinatura**. Não há chamada a fazer que
   * informasse quem está pedindo.
   */
  it("HOJE: a porta entrega a unidade pedida na URL sem ter como saber quem pediu", async () => {
    const empenhos = await listarEmpenhosDaExecucao({
      exercicio: EXERCICIO,
      unidadeCodigo: COD_EDUCACAO,
    });

    expect(empenhos).toHaveLength(1);
    expect(empenhos[0]?.unidadeCodigo).toBe(COD_EDUCACAO);
    expect(empenhos[0]?.numero).toBe("NE-EDUCACAO-1");
  });

  /**
   * ⚠️ A CONTRADIÇÃO, LADO A LADO, NA MESMA TRANSAÇÃO DE LEITURA — e é isto que faz deste
   * arquivo uma caracterização e não um registro de comportamento.
   *
   * A MESMA identidade, perguntada de dois jeitos, recebe duas respostas incompatíveis:
   *   · `listarUgsDoUsuario` — a fonte que o cabeçalho consome — diz UMA unidade;
   *   · `listarEmpenhosDaExecucao` — a fonte que a TELA mostra — entrega DUAS.
   *
   * Não são duas camadas discordando por acidente: são duas verdades sobre a mesma pergunta,
   * e o usuário acredita na que está na frente dele. O que está na frente dele é a lista.
   */
  it("HOJE: o escopo do usuário diz UMA unidade e a lista entrega DUAS", async () => {
    const { ugs, global } = await listarUgsDoUsuario(soSaude);

    // O escopo real, pela mesma tabela que a escrita usa.
    expect(global).toBe(false);
    expect(ugs.map((u) => u.codigo)).toEqual([COD_SAUDE]);

    // E a leitura, para a mesma pessoa, no mesmo instante.
    const empenhos = await listarEmpenhosDaExecucao({ exercicio: EXERCICIO });
    const unidades = [...new Set(empenhos.map((e) => e.unidadeCodigo))].sort();

    expect(unidades).toEqual([COD_EDUCACAO, COD_SAUDE]);
    expect(
      unidades.length,
      "o usuário enxerga 1 unidade de escopo e recebe 2 na lista — é o defeito que a ENT10 fecha"
    ).toBeGreaterThan(ugs.length);
  });
});
