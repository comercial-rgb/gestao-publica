import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { raizesExistentes, RAIZES_DE_ESCRITA } from "./raizes-dominio.js";
import { somenteCodigo } from "./prosa.js";

/**
 * ═══ TODO MODELO DO SCHEMA TEM DE SER ALCANÇADO POR CÓDIGO ESCRITO À MÃO ═══
 *
 * ⚠️ O CENSO DO ENT03c ACHOU DOIS MODELOS MORTOS, e nenhum guard existente os via:
 * `ParecerContrato` e `CertidaoFornecedor` estão no schema, têm tabela no banco, têm
 * migration aplicada, têm enum próprio — e **nenhuma linha de código escrita à mão os
 * lê ou escreve**. As 57 ocorrências dos dois nomes no repositório estão TODAS em
 * `prisma/generated/`, que é saída do gerador.
 *
 * O modo de falha é o pior que este projeto tem: **a tabela parece atendimento**. Quem
 * abre o schema procurando "o sistema registra parecer jurídico?" acha `ParecerContrato`
 * com os quatro tipos certos e conclui que sim. O catálogo receberia a marcação errada, e
 * a marcação errada é o que faz o próximo lote NÃO construir o que falta.
 *
 * É literalmente a regra do prompt — "código que existe não é comportamento provado" —
 * promovida a teste.
 *
 * ⚠️ ALCANÇAR NÃO É ATENDER. Este teste prova o piso: alguém escreveu o nome do modelo
 * fora do gerador. Um modelo citado só num `limpar-banco.ts` passaria aqui e continuaria
 * sem caso de uso — por isso a lista de exceções abaixo separa os dois casos, e por isso
 * o censo do catálogo continua sendo leitura humana. O que este arquivo garante é que
 * ninguém acrescente uma tabela e vá embora.
 */

const RAIZ = resolve(import.meta.dirname, "..");

/**
 * Modelos que EXISTEM no schema e que o código à mão não alcança — com a decisão junto.
 *
 * ⚠️ ESTA LISTA DEVERIA ENCOLHER, NUNCA CRESCER. Cada linha é uma tabela que o banco
 * carrega e ninguém usa: ela custa migration, custa grant no papel de runtime e custa a
 * impressão de que o requisito está atendido.
 */
const SEM_CASO_DE_USO: Readonly<Record<string, string>> = {
  TipoLancamentoReceitaSagres:
    "ENT03c: schema sem caso de uso. A única menção fora de prisma/generated/ é a lista de " +
    "tabelas a truncar em test/limpar-banco.ts — que é string, não uso. Pendência " +
    "SCHEMA-SEM-CASO-DE-USO.",
  DeParaContaSiga:
    "ENT03c: schema sem caso de uso. O de-para de contas do leiaute SIGA (TCM-BA) não é " +
    "lido nem escrito por linha nenhuma — o adapter do TCM-BA resolve a conta por outro " +
    "caminho. Pendência SCHEMA-SEM-CASO-DE-USO.",
  DeParaFonteSiga:
    "ENT03c: schema sem caso de uso. Gêmeo do DeParaContaSiga, e com a mesma ausência. " +
    "Pendência SCHEMA-SEM-CASO-DE-USO.",
  ParecerContrato:
    "ENT03c: schema sem caso de uso. Os quatro tipos (jurídico, técnico, controle " +
    "interno, contábil) estão modelados e NADA escreve a tabela. Cláusulas 5.17.21 e " +
    "5.17.22 marcadas AUSENTE_CONFIRMADO por isso. Pendência SCHEMA-SEM-CASO-DE-USO.",
  CertidaoFornecedor:
    "ENT03c: schema sem caso de uso. Tipo, número, emissão e validade estão modelados, " +
    "com índice por validade — e nada escreve nem lê. As cláusulas de validade de " +
    "documento do fornecedor (5.17.87, 5.17.89, 5.17.90, 5.17.94) são AUSENTE_CONFIRMADO. " +
    "Pendência SCHEMA-SEM-CASO-DE-USO.",
};

/**
 * Modelos que o código ALCANÇA SEM NOMEAR — escritos por `create` ANINHADO a partir do pai.
 *
 * ⚠️ POR QUE ESTA LISTA É EXPLÍCITA E NÃO DEDUZIDA. A tentação é aceitar o NOME DO CAMPO de
 * relação (`opcoes`, `colunas`, `pareceres`) como prova de uso. Não serve: `pareceres`
 * aparece quatro vezes no repositório e NENHUMA é de `ParecerContrato` — são os pareceres do
 * PROCESSO, no M21. A dedução por nome de campo teria escondido justamente o achado que este
 * arquivo existe para dar. Colisão de nome é a regra, não a exceção.
 *
 * Cada linha nomeia o pai e o campo — quem ler pode conferir em um grep.
 */
const ESCRITO_POR_ANINHAMENTO: Readonly<Record<string, string>> = {
  CotacaoDePreco:
    "escrito por `cotacoes: { create: ... }` em registrarPesquisaDePrecos " +
    "(modules/m11-licitacoes/compras.ts); LIDO em estatisticasDaPesquisa pela relação " +
    "`cotacoes` do item da pesquisa — é dela que saem médio, mínimo e máximo",
  ItemDeSolicitacaoDeCompra:
    "escrito por `itens: { create: ... }` em registrarSolicitacaoDeCompra " +
    "(modules/m11-licitacoes/compras.ts) — solicitação e itens nascem no mesmo ato",
  RecebimentoDeItem:
    "escrito por `itens: { create: ... }` em registrarRecebimentoDeOrdem " +
    "(modules/m11-licitacoes/compras.ts); LIDO em saldoDaOrdemDeCompra pela relação " +
    "`recebimentos` do item da ordem",
  MembroDeComissaoPatrimonial:
    "escrito por `membros: { create: ... }` em cadastrarComissaoPatrimonial " +
    "(modules/m10-patrimonial/gestao-do-bem.ts) — a comissão e seus membros nascem no " +
    "mesmo ato, porque uma comissão sem membro não delibera",
  ItemDeTermoPatrimonial:
    "escrito por `itens: { create: ... }` em emitirTermoPatrimonial " +
    "(modules/m10-patrimonial/gestao-do-bem.ts) — o termo e os bens que ele entrega " +
    "nascem juntos, e um termo sem bem não entrega nada",
  OpcaoDeCampoAdicional:
    "escrito por `opcoes: { create: ... }` em modules/m25-campos-adicionais/servico.ts",
  ColunaDoModelo: "escrito por `colunas: { create: ... }` em modules/m26-designer/",
  TipoDeComunicadoPorSetor:
    "escrito por `setoresAutorizados: { create: ... }` em modules/m23-comunicacao/servico.ts",
  RequerenteAdicionalDoProcesso:
    "escrito por `requerentesAdicionais: { create: ... }` em modules/m21-protocolo/servico.ts",
};

function arquivosDeSchema(): readonly string[] {
  const dir = join(RAIZ, "prisma", "schema");
  return readdirSync(dir)
    .filter((n) => n.endsWith(".prisma"))
    .map((n) => join(dir, n));
}

function modelosDoSchema(): readonly string[] {
  const nomes: string[] = [];
  for (const p of arquivosDeSchema()) {
    for (const linha of readFileSync(p, "utf8").split("\n")) {
      const m = /^model\s+([A-Za-z0-9_]+)\s*\{/.exec(linha);
      if (m?.[1] !== undefined) nomes.push(m[1]);
    }
  }
  return nomes;
}

function fontes(dir: string): readonly string[] {
  const achados: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      // ⚠️ `generated` FICA DE FORA, e é o ponto inteiro do teste: o gerador cita TODOS
      // os modelos, sempre. Incluí-lo faria este arquivo ficar verde para sempre.
      if (["node_modules", "generated", ".git", ".next"].includes(e.name)) continue;
      achados.push(...fontes(p));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(e.name)) continue;
    achados.push(p);
  }
  return achados;
}

const CORPO: string = [
  ...raizesExistentes(RAIZ, [...RAIZES_DE_ESCRITA]).flatMap((r) => fontes(r)),
  ...fontes(join(RAIZ, "prisma")),
]
  .filter((p) => !p.includes("modelo-sem-caso-de-uso"))
  .map((p) => somenteCodigo(readFileSync(p, "utf8")))
  .join("\n");

describe("modelo do schema sem caso de uso", () => {
  it("todo modelo é alcançado por código escrito à mão", () => {
    const orfaos: string[] = [];
    for (const modelo of modelosDoSchema()) {
      if (modelo in SEM_CASO_DE_USO) continue;
      if (modelo in ESCRITO_POR_ANINHAMENTO) continue;
      // O nome do modelo aparece capitalizado (tipos, `Prisma.X`) ou com inicial minúscula
      // (`tx.parecerContrato`). Qualquer uma das duas conta como alcance.
      const camel = modelo.charAt(0).toLowerCase() + modelo.slice(1);
      const achado = new RegExp(`\\b(${modelo}|${camel})\\b`).test(CORPO);
      if (!achado) orfaos.push(modelo);
    }

    expect(
      orfaos,
      "\n\n⚠️ MODELO NO SCHEMA QUE NENHUM CÓDIGO ALCANÇA.\n\n" +
        "Uma tabela sem caso de uso não é meio caminho andado — ela PARECE atendimento " +
        "para quem lê o schema procurando saber se o requisito existe, e é assim que uma " +
        "cláusula do catálogo recebe a marcação errada.\n\n" +
        "Ou escreva o caso de uso, ou remova o modelo, ou declare-o em `SEM_CASO_DE_USO` " +
        "COM a decisão e a pendência — nunca sem elas.\n\nModelos órfãos:\n"
    ).toEqual([]);
  });

  /**
   * ⚠️ E A LISTA DE EXCEÇÕES TAMBÉM É VIGIADA — no sentido de ENCOLHER. No dia em que
   * alguém escrever o caso de uso do parecer, a linha aqui vira mentira, e mentira numa
   * lista de exceções é o que faz a próxima pessoa não confiar em nenhuma delas.
   */
  /**
   * ⚠️ E A LISTA DO ANINHAMENTO TAMBÉM É VIGIADA — no sentido contrário. Se o modelo passar
   * a ser nomeado por código, a linha aqui vira ruído: ela diz "não procure, é aninhado",
   * e quem a lê deixa de procurar.
   */
  it("todo modelo do aninhamento continua sem ser nomeado por código", () => {
    const nomeados: string[] = [];
    for (const modelo of Object.keys(ESCRITO_POR_ANINHAMENTO)) {
      const camel = modelo.charAt(0).toLowerCase() + modelo.slice(1);
      if (new RegExp(`\\b(${modelo}|${camel})\\b`).test(CORPO)) {
        nomeados.push(`${modelo} (agora é nomeado — remova a linha de ESCRITO_POR_ANINHAMENTO)`);
      }
    }
    expect(nomeados, "\n\nAninhamentos que já não são aninhamentos:\n").toEqual([]);
  });

  it("toda exceção declarada ainda é um modelo órfão de verdade", () => {
    const resolvidas: string[] = [];
    const inexistentes: string[] = [];
    const modelos = new Set(modelosDoSchema());
    for (const modelo of Object.keys(SEM_CASO_DE_USO)) {
      if (!modelos.has(modelo)) {
        inexistentes.push(`${modelo} (já não existe no schema — remova a exceção)`);
        continue;
      }
      const camel = modelo.charAt(0).toLowerCase() + modelo.slice(1);
      if (new RegExp(`\\b(${modelo}|${camel})\\b`).test(CORPO)) {
        resolvidas.push(
          `${modelo} (agora TEM código — remova a exceção e reavalie as cláusulas que ela cita)`
        );
      }
    }
    expect([...resolvidas, ...inexistentes], "\n\nExceções desatualizadas:\n").toEqual([]);
  });
});
