import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * OS 25 TESTES MÍNIMOS DO INCREMENTO — o inventário, e por que ele é um TESTE.
 *
 * ═══ ⚠️ POR QUE ISTO NÃO É UMA TABELA NUM MARKDOWN ═══
 * Um inventário em documento apodrece em silêncio: o arquivo citado é renomeado, o teste
 * some numa refatoração, e a tabela continua dizendo "coberto" com a mesma confiança do
 * primeiro dia. Aqui cada cobertura aponta para ARQUIVOS REAIS, e o teste falha se algum
 * deixar de existir.
 *
 * ⚠️ ELE **NÃO** PROVA QUE O CENÁRIO ESTÁ COBERTO — prova que o arquivo que alguém disse
 * cobri-lo existe. A honestidade do mapeamento é humana; o que a máquina garante é que
 * ninguém apagou a evidência sem mexer no inventário. Por isso os itens NÃO cobertos são
 * declarados com o mesmo peso dos cobertos: um gate que só lista acertos não é gate.
 *
 * ═══ A ORIGEM ═══
 * `especificacoes/PRIMEIRA-ENTREGA.md`, seção 5.
 */

const RAIZ = fileURLToPath(new URL("..", import.meta.url));

type Situacao = "COBERTO" | "PARCIAL" | "NAO_COBERTO";

interface ItemDoIncremento {
  readonly n: number;
  readonly enunciado: string;
  readonly situacao: Situacao;
  /** Arquivos que sustentam a afirmação. Vazio só é aceito em NAO_COBERTO. */
  readonly evidencias: readonly string[];
  /** Obrigatória em PARCIAL e NAO_COBERTO: o que falta, e por quê. */
  readonly observacao?: string;
}

const INVENTARIO: readonly ItemDoIncremento[] = [
  {
    n: 1,
    enunciado: "Usuário só recebe contextos autorizados; entidade/exercício não se amplia por URL.",
    situacao: "COBERTO",
    evidencias: ["test/ui/contexto-ug.test.ts", "lib/portas/contexto.ts"],
    observacao:
      "Fail-closed: sem permissão a lista vem VAZIA, nunca 'todas'. O parâmetro de URL " +
      "filtra a leitura; ele não concede nada — a autorização é resolvida a partir do ALVO " +
      "do fato (teste 3).",
  },
  {
    n: 2,
    enunciado: "Troca de entidade sem novo login, preservando o ano quando autorizado.",
    situacao: "PARCIAL",
    evidencias: ["lib/portas/contexto.ts", "components/ui/SincronizarContexto.tsx"],
    observacao:
      "A troca acontece sem novo login e o exercício é preservado na URL. O que NÃO existe " +
      "é a regra do caso em que o exercício não está disponível na entidade nova: o " +
      "incremento pede motivo declarado e escolha explícita, e hoje a tela não os oferece. " +
      "Pendência TROCA-DE-ENTIDADE-SEM-EXERCICIO.",
  },
  {
    n: 3,
    enunciado: "Duas abas em entidades diferentes não trocam o destino de uma escrita.",
    situacao: "COBERTO",
    evidencias: ["test/borda-de-escrita.test.ts", "modules/m16-travamento/m16-rollout.test.ts"],
    observacao:
      "Estrutural (nenhuma Server Action lê contexto ambiente para decidir ONDE escrever) " +
      "somado ao comportamental do M16, que roda a cadeia em DUAS unidades gestoras reais.",
  },
  {
    n: 4,
    enunciado: "Município A não lê dados de B; tentativa de escrita em B é rejeitada.",
    situacao: "NAO_COBERTO",
    evidencias: ["docs/adr/ADR-eixo-de-municipio.md"],
    observacao:
      "O eixo município NÃO EXISTE nesta base: `EnteConfig` é singleton e nenhuma das 118 " +
      "tabelas tem coluna de tenant. Decidido (ADR aceito) que o produto atenderá vários " +
      "municípios por SCHEMA POR MUNICÍPIO — lote transversal próprio, posterior a este. " +
      "Declarado como pendência, NUNCA como atendido.",
  },
  {
    n: 5,
    enunciado: "FK de pessoa/fonte/dotação de outro tenant não é aceita.",
    situacao: "NAO_COBERTO",
    evidencias: ["docs/adr/ADR-eixo-de-municipio.md"],
    observacao:
      "Mesma razão do item 4. No desenho escolhido (schema por município) a pergunta muda " +
      "de forma: não haverá FK entre schemas para recusar — o isolamento é físico.",
  },
  {
    n: 6,
    enunciado: "Usuário sem permissão não executa comando pela API mesmo com botão oculto.",
    situacao: "COBERTO",
    evidencias: [
      "modules/m16-travamento/m16-rollout.test.ts",
      "modules/m16-travamento/m16-borda-execucao.test.ts",
      "modules/m05-despesa/m05-ordem-pagamento.test.ts",
    ],
    observacao:
      "A autorização é do CASO DE USO, não da tela. O T07 acrescentou a prova mais direta: " +
      "a segregação preparar × autorizar é recusada pelo domínio, e o smoke a exercita " +
      "pela interface.",
  },
  {
    n: 7,
    enunciado: "Consolidação de entidades autorizadas de A não inclui B.",
    situacao: "NAO_COBERTO",
    evidencias: ["docs/adr/ADR-eixo-de-municipio.md"],
    observacao:
      "Item 4. A consolidação ENTRE UNIDADES GESTORAS do mesmo ente funciona e é a que os " +
      "demonstrativos usam; o recorte por município não existe.",
  },
  {
    n: 8,
    enunciado: "Pool reutilizado depois de uma requisição não reaproveita seu tenant/contexto.",
    situacao: "COBERTO",
    evidencias: ["test/isolamento-de-requisicao.test.ts"],
    observacao:
      "O vazamento é MEDIDO num pool real (max:1), não suposto; e o código de produção é " +
      "varrido em busca de SET de sessão. Pré-requisito do lote de tenancy.",
  },
  {
    n: 9,
    enunciado: "Job/exportação/anexo não vaza entre tenants; memberships revogadas são respeitadas.",
    situacao: "PARCIAL",
    evidencias: [
      "modules/m16-travamento/m16-usuarios.test.ts",
      "test/periodo-fechado.test.ts",
    ],
    observacao:
      "A metade das memberships está coberta: revogar perfil e inativar usuário derrubam " +
      "as sessões, e o worker (importador do M20) passa pelos mesmos guards. A metade dos " +
      "TENANTS é o item 4.",
  },
  {
    n: 10,
    enunciado: "Papel de runtime não altera/apaga ledger/auditoria nem contorna isolamento.",
    situacao: "COBERTO",
    evidencias: ["test/papel-runtime.test.ts", "test/invariantes-nucleo.test.ts", "prisma/papel-runtime.ts"],
    observacao:
      "Sem superusuário, sem BYPASSRLS, sem posse de tabela, sem DDL — e a cadeia inteira " +
      "roda SOB o papel restrito, porque um papel que ninguém exercita quebra em produção.",
  },
  {
    n: 11,
    enunciado: "Período fechado bloqueia escrita por API, worker e rota alternativa exposta.",
    situacao: "COBERTO",
    evidencias: ["test/periodo-fechado.test.ts"],
    observacao:
      "Quatro rotas medidas (caso de uso, importador em lote, lançamento manual e " +
      "extraorçamentário), mais o par que impede o falso-verde: dezembro continua escrevendo.",
  },
  {
    n: 12,
    enunciado: "Duas requisições concorrentes não excedem saldo de dotação/liquidação/pagamento.",
    situacao: "COBERTO",
    evidencias: ["modules/m05-despesa/m05-concorrencia.test.ts", "packages/locks/locks.test.ts"],
    observacao:
      "Comportamental (duas transações concorrentes na mesma ficha) mais estrutural: todo " +
      "recurso da fila é efetivamente travado e nenhum trinco de banco mora fora do pacote.",
  },
  {
    n: 13,
    enunciado: "Repetição idempotente retorna o mesmo efeito; payload divergente com mesma chave não duplica.",
    situacao: "PARCIAL",
    evidencias: ["test/borda-de-escrita.test.ts"],
    observacao:
      "A SEGUNDA metade está implementada e medida: chave repetida é RECUSADA pelo banco, " +
      "com payload igual ou divergente, e o primeiro fato fica intacto. A PRIMEIRA não: " +
      "repetir não devolve o efeito anterior. Retorno idempotente exige chave de " +
      "IDEMPOTÊNCIA por requisição, guardada com o resultado — outra coisa que a chave de " +
      "NEGÓCIO. Pendência IDEMPOTENCIA-DE-REQUISICAO.",
  },
  {
    n: 14,
    enunciado: "Falha no meio da unidade de trabalho reverte operacional, ledger, auditoria de sucesso e outbox juntos.",
    situacao: "COBERTO",
    evidencias: ["test/unidade-de-trabalho.test.ts"],
    observacao:
      "Com PAR: o caminho feliz prova que cada escrita existe antes de a falha provar que " +
      "some. O outbox não tem produtor hoje — dito no teste, com guard para o dia em que " +
      "ganhar um.",
  },
  {
    n: 15,
    enunciado: "Ledger balanceia por subsistema e recusa conta/classificação incompatível.",
    situacao: "COBERTO",
    evidencias: [
      "modules/m01-core-contabil/m01.test.ts",
      "modules/m01-core-contabil/m01-funil.test.ts",
      "test/invariantes-nucleo.test.ts",
    ],
  },
  {
    n: 16,
    enunciado: "Pagamento com retenção preserva bruto, líquido e obrigações em pernas distintas.",
    situacao: "COBERTO",
    evidencias: [
      "modules/m07-extraorcamentario/m07-retencao.test.ts",
      "test/papel-runtime.test.ts",
      "modules/m05-despesa/m05-dossie.test.ts",
    ],
    observacao:
      "Os valores por conta e subsistema foram escritos ANTES de rodar. Caixa 900,00; as " +
      "demais pernas 1.000,00.",
  },
  {
    n: 17,
    enunciado: "Estorno preserva valores por perna, original imutável e saldo reversível.",
    situacao: "COBERTO",
    evidencias: [
      "modules/m08-restos-a-pagar/m08-anulacao-rp.test.ts",
      "modules/m05-despesa/m05-dossie.test.ts",
      "modules/m08-restos-a-pagar/MODULO.md",
    ],
    observacao:
      "O estorno devolve ao caixa 900,00 — o que saiu —, nunca os 1.000,00 do bruto. Um " +
      "estorno pelo bruto FECHA o lançamento com os dois lados errados na mesma medida: " +
      "nenhuma amarração de balancete o pega.",
  },
  {
    n: 18,
    enunciado: "Estorno parcial não é tratado como estorno total por um booleano.",
    situacao: "COBERTO",
    evidencias: ["modules/m05-despesa/m05-anulacao-parcial.test.ts", "packages/estornaveis/index.ts"],
    observacao:
      "Colunas SEPARADAS no schema (`estornoDeId` nega; `anulacaoParcialDeId` reduz) — não " +
      "um booleano. Usar a mesma coluna faria toda leitura líquida ZERAR o fato inteiro.",
  },
  {
    n: 19,
    enunciado: "Recarregar a tela após cada operação encontra dados persistidos, não estado de componente.",
    situacao: "COBERTO",
    evidencias: ["scripts/smoke-cadeia-despesa.ts", "scripts/smoke-cadastro-pessoas.ts"],
    observacao:
      "Navegador real. A cadeia inteira (23 passos) e o cadastro (9 passos) recarregam a " +
      "tela depois de cada escrita e procuram o dado.",
  },
  {
    n: 20,
    enunciado: "Relatório corresponde aos registros consultados e respeita contexto/filtros.",
    situacao: "PARCIAL",
    evidencias: ["modules/m12-relatorios/m12-livros.test.ts", "app/(areas)/contabilidade/lancamentos/page.tsx"],
    observacao:
      "A tela e o PDF chamam a MESMA porta com os MESMOS filtros — é o desenho que impede " +
      "as duas de discordarem, e os totais por subsistema vêm do módulo, não de um `reduce` " +
      "na tela. O que falta é um teste que gere as duas saídas e as CONFRONTE linha a linha; " +
      "hoje a garantia é estrutural. Pendência RELATORIO-VS-TELA-CONFRONTADOS.",
  },
  {
    n: 21,
    enunciado: "Timeline apresenta autor, momento e alterações do cadastro, sem exposição de segredo.",
    situacao: "COBERTO",
    evidencias: [
      "modules/m19-pessoas/m19.test.ts",
      "scripts/smoke-cadastro-pessoas.ts",
      "app/(areas)/despesa/empenhos/[id]/page.tsx",
    ],
    observacao:
      "O histórico É o cadastro (append-only), não uma tabela de auditoria paralela que " +
      "mente no dia em que alguém gravar sem escrevê-la.",
  },
  {
    n: 22,
    enunciado: "Serviço externo sem credencial não emite protocolo falso nem marca aceite.",
    situacao: "COBERTO",
    evidencias: ["modules/m17-banco-bb/m17-modos.test.ts", "lib/portas/ordem-pagamento.ts"],
    observacao:
      "SANDBOX sem credencial responde CREDENTIAL_NOT_CONFIGURED, nunca vira MOCK; LIVE é " +
      "BLOQUEADO. E o envio ao banco (T07, etapa 3) devolve um tipo em que o caminho feliz " +
      "não compila — não há como escrever o `return { ok: true }`.",
  },
  {
    n: 23,
    enunciado: "Nenhum GET emite despesa, cancela ou estorna.",
    situacao: "COBERTO",
    evidencias: ["test/borda-de-escrita.test.ts"],
    observacao:
      "As 15 rotas HTTP são GET de leitura, e nenhuma chama serviço do censo de mutação " +
      "nem `comEscritaAutenticada`. A lista de mutações é o próprio censo do M16 — não uma " +
      "segunda lista que envelhece.",
  },
  {
    n: 24,
    enunciado: "Rótulos de conformidade e IDs do inventário não aparecem nas telas/saídas.",
    situacao: "COBERTO",
    evidencias: ["test/ui/rotulos-de-conformidade.test.ts"],
    observacao:
      "85 ocorrências removidas. O vocabulário de negócio (licitação, edital, pregão, " +
      "contrato) tem teste PRÓPRIO para não ser varrido junto por excesso de zelo.",
  },
  {
    n: 25,
    enunciado: "Suíte regressiva original continua executada com os mesmos invariantes.",
    situacao: "COBERTO",
    evidencias: ["test/invariantes-nucleo.test.ts", "vitest.config.ts"],
    observacao:
      "A suíte de ENT00 continua inteira; nenhum teste foi removido nem afrouxado. O único " +
      "que MUDOU foi o `it.fails` do append-only, que virou asserção positiva quando o " +
      "papel de runtime fechou a lacuna — ele expirou porque a proteção chegou.",
  },
];

describe("os 25 testes mínimos do incremento — o inventário", () => {
  it("o inventário cobre os 25, sem buraco e sem repetição", () => {
    expect(INVENTARIO).toHaveLength(25);
    expect(INVENTARIO.map((i) => i.n)).toEqual(
      Array.from({ length: 25 }, (_, i) => i + 1)
    );
  });

  it("toda evidência apontada EXISTE no disco", () => {
    const fantasmas: string[] = [];
    for (const item of INVENTARIO) {
      for (const e of item.evidencias) {
        if (!existsSync(join(RAIZ, e))) fantasmas.push(`item ${item.n} → ${e}`);
      }
    }
    expect(
      fantasmas,
      "\n\n⚠️ O INVENTÁRIO APONTA PARA ARQUIVO QUE NÃO EXISTE.\n\n" +
        "É assim que um inventário mente: o arquivo é renomeado numa refatoração e a " +
        "tabela continua dizendo 'coberto'. Atualize o mapeamento — ou, se a cobertura " +
        "sumiu de verdade, mude a situação do item.\n\nAusentes:\n"
    ).toEqual([]);
  });

  it("todo item COBERTO tem ao menos uma evidência", () => {
    const vazios = INVENTARIO.filter(
      (i) => i.situacao === "COBERTO" && i.evidencias.length === 0
    ).map((i) => i.n);
    expect(vazios, "'coberto' sem evidência é afirmação, não cobertura").toEqual([]);
  });

  it("todo item PARCIAL ou NÃO COBERTO diz O QUE FALTA", () => {
    // ⚠️ SEM ISTO O INVENTÁRIO VIRA UMA LISTA DE DESCULPAS. Um item não coberto sem
    // explicação some da conversa; com o motivo escrito, ele volta na próxima revisão.
    const mudos = INVENTARIO.filter(
      (i) => i.situacao !== "COBERTO" && (i.observacao ?? "").trim().length < 40
    ).map((i) => i.n);
    expect(mudos, "item não coberto tem de dizer o que falta, e por quê").toEqual([]);
  });

  it("o placar é publicado — e os não cobertos aparecem com nome", () => {
    const porSituacao = (s: Situacao): readonly ItemDoIncremento[] =>
      INVENTARIO.filter((i) => i.situacao === s);

    const cobertos = porSituacao("COBERTO");
    const parciais = porSituacao("PARCIAL");
    const naoCobertos = porSituacao("NAO_COBERTO");

    // O placar vai para a saída da suíte: quem roda os testes vê o estado do gate sem
    // precisar abrir documento nenhum.
    console.log(
      `\n[incremento] ${cobertos.length} coberto(s), ${parciais.length} parcial(is), ` +
        `${naoCobertos.length} não coberto(s) de 25.\n` +
        parciais.map((i) => `  parcial      ${i.n}. ${i.enunciado}`).join("\n") +
        "\n" +
        naoCobertos.map((i) => `  NÃO COBERTO  ${i.n}. ${i.enunciado}`).join("\n")
    );

    // ⚠️ ESTES NÚMEROS SÃO A TRAVA. Mudar a situação de um item obriga a mudar esta linha
    // — e é aí que alguém tem de olhar na cara do que mudou. Um inventário que se atualiza
    // sozinho não informa ninguém.
    expect({
      cobertos: cobertos.length,
      parciais: parciais.length,
      naoCobertos: naoCobertos.length,
    }).toEqual({ cobertos: 18, parciais: 4, naoCobertos: 3 });

    // Os três não cobertos são o MESMO assunto — o eixo município, decidido em ADR e
    // deliberadamente fora deste lote.
    expect(naoCobertos.map((i) => i.n)).toEqual([4, 5, 7]);
  });
});
