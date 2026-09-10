import { describe, expect, it } from "vitest";

/**
 * O INVENTÁRIO DOS 22 TESTES MÍNIMOS DO ENT02 — E ELE É UM TESTE, NÃO UMA TABELA.
 *
 * ═══ ⚠️ POR QUE UM TESTE, E NÃO UMA SEÇÃO DO ESTADO-EXECUCAO ═══
 * Uma tabela em Markdown apodrece em silêncio: o arquivo citado é renomeado, o teste
 * apontado é removido, e a tabela continua dizendo "coberto". Aqui, cada item aponta
 * para uma EVIDÊNCIA — arquivo e nome do teste —, e o placar vai para a saída da suíte.
 *
 * ⚠️ ELE NÃO EXECUTA OS TESTES APONTADOS. Ele conserva a decisão de classificação e a
 * torna visível a cada execução. O que ele impede é o esquecimento: um item marcado
 * PARCIAL ou NÃO COBERTO é obrigado a dizer o que falta, e o total aparece no console
 * toda vez.
 *
 * ⚠️ E OS NÚMEROS AQUI FORAM CONFERIDOS ITEM A ITEM, depois de escritos. A primeira
 * versão do cabeçalho do ESTADO-EXECUCAO dizia "17 cobertos, 2 parciais, 3 não
 * cobertos" — números escritos de memória, antes da conferência, e errados. Este
 * arquivo é a conferência.
 */

type Situacao = "COBERTO" | "PARCIAL" | "NAO_COBERTO";

interface ItemDoLote {
  readonly n: number;
  readonly enunciado: string;
  readonly situacao: Situacao;
  /** Onde está a prova — ou, quando não há, o que falta e por quê. */
  readonly evidencia: string;
}

const ITENS: readonly ItemDoLote[] = [
  {
    n: 1,
    enunciado: "Processo aberto no município A não é visível nem tramitável no B.",
    situacao: "NAO_COBERTO",
    evidencia:
      "É o eixo de município, decidido por docs/adr/ADR-eixo-de-municipio.md (schema por " +
      "município) e deliberadamente fora deste lote. Segue declarado, como no ENT01 — não " +
      "há município novo habilitado, e nada aqui o simula.",
  },
  {
    n: 2,
    enunciado: "Tramitação para setor sem permissão é rejeitada no servidor, com botão oculto ou não.",
    situacao: "COBERTO",
    evidencia:
      "modules/m21-protocolo/m21-protocolo.test.ts t14 — o usuário TEM a ação e TEM a " +
      "unidade gestora, e mesmo assim é recusado por não estar lotado no setor. O teste " +
      "cria o próprio usuário porque as fixtures têm permissão global.",
  },
  {
    n: 3,
    enunciado: "Processo sigiloso não aparece em listagem, busca, relatório nem exportação de quem não é envolvido.",
    situacao: "COBERTO",
    evidencia:
      "A regra é uma só (m21-protocolo/consultas.ts podeVerProcesso), consumida pela caixa, " +
      "pelo dossiê, pelo anexo (m22 t6) e pela fonte do designer (m26 t11, onde o TOTAL " +
      "também é 1 — o recorte está no where, não num filtro depois).",
  },
  {
    n: 4,
    enunciado: "Anexo de um processo não é acessível por URL a quem não tem permissão no registro.",
    situacao: "COBERTO",
    evidencia:
      "A URL existe agora: `app/(areas)/documentos/anexos/[id]/route.ts`. Duas metades, e as " +
      "duas medidas. NO DOMÍNIO: quem está logado e não tem permissão NO REGISTRO recebe null " +
      "no download (m22 t6) e lista VAZIA na enumeração (t16) — os nomes dos arquivos também " +
      "não vazam, e o lote devolve null pelo mesmo caminho (t19). POR HTTP: o smoke do ENT02 " +
      "baixa o anexo com o cookie da sessão, confere os bytes, o `attachment`, o `nosniff` e o " +
      "hash no cabeçalho, e então repete a MESMA URL sem sessão e recebe 404 — não 401, não " +
      "redirecionamento para o login: a mesma resposta de um anexo que não existe.",
  },
  {
    n: 5,
    enunciado: "Anexo permanece acessível ao setor de origem depois da tramitação.",
    situacao: "COBERTO",
    evidencia: "modules/m22-documentos/m22-documentos.test.ts t7.",
  },
  {
    n: 6,
    enunciado: "Bloqueio por taxa em aberto impede a tramitação pela API e por qualquer rota alternativa.",
    situacao: "COBERTO",
    evidencia:
      "m21-protocolo.test.ts t13 e m21-cadastros.test.ts t6. O guard está no CASO DE USO, " +
      "dentro da transação — não há caminho de tramitação que não passe por ele.",
  },
  {
    n: 7,
    enunciado: "Apensamento faz os dois processos seguirem a movimentação; desapensar restabelece independência.",
    situacao: "COBERTO",
    evidencia:
      "m21-protocolo.test.ts t16 — o trâmite do principal grava o movimento no apenso, na " +
      "mesma transação; depois de desapensar, alvos volta a 1.",
  },
  {
    n: 8,
    enunciado: "Numeração reinicia no exercício seguinte sem colidir com a do anterior.",
    situacao: "COBERTO",
    evidencia: "m21-protocolo.test.ts t2.",
  },
  {
    n: 9,
    enunciado: "Duas aberturas concorrentes não geram o mesmo número.",
    situacao: "COBERTO",
    evidencia:
      "m21-protocolo.test.ts t3, pelo posto SequenciaDeProtocolo do packages/locks, tomado " +
      "ANTES de somar o MAX.",
  },
  {
    n: 10,
    enunciado: "Circular não aceita resposta; resposta a memorando só oferece setores já envolvidos.",
    situacao: "COBERTO",
    evidencia: "m23-comunicacao.test.ts t6 e t7.",
  },
  {
    n: 11,
    enunciado: "Consulta de leitura mostra usuário, instante e origem, sem expor segredo.",
    situacao: "COBERTO",
    evidencia:
      "m23-comunicacao.test.ts t12 — e quem não participa recebe null, porque um relatório " +
      "de leitura aberto ao ente inteiro diria quem está trabalhando em quê.",
  },
  {
    n: 12,
    enunciado: "Campo adicional do tipo lista dinâmica persiste, filtra na listagem e aparece no histórico de alterações.",
    situacao: "COBERTO",
    evidencia:
      "m25-campos-adicionais.test.ts t5 — inclusive a parte que o enunciado não diz: o filtro " +
      "olha só o valor VIGENTE, senão responderia sobre o passado sem avisar.",
  },
  {
    n: 13,
    enunciado: "Campo adicional de uma entidade não vaza para outra entidade do mesmo município.",
    situacao: "COBERTO",
    evidencia:
      "m25-campos-adicionais.test.ts t6 — e não por filtro: pela IMPOSSIBILIDADE de a " +
      "gravação alcançar a definição alheia.",
  },
  {
    n: 14,
    enunciado: "Documento assinado mantém o original recuperável e a assinatura verificável.",
    situacao: "COBERTO",
    evidencia: "m22-documentos.test.ts t11 — o hash da assinatura bate com o SHA-256 do conteúdo.",
  },
  {
    n: 15,
    enunciado: "Segundo signatário recebe notificação real e o documento só conclui com todas as assinaturas exigidas.",
    situacao: "COBERTO",
    evidencia: "m22-documentos.test.ts t12.",
  },
  {
    n: 16,
    enunciado: "Modo HSM indisponível retorna motivo explícito e não produz assinatura simulada.",
    situacao: "COBERTO",
    evidencia:
      "m22-documentos.test.ts t9 — a recusa vem com motivo E o count() de assinaturas " +
      "continua zero. O estado é `disponivel: false` LITERAL: o caminho feliz não compila.",
  },
  {
    n: 17,
    enunciado: "Cópia de modelo de relatório não altera o original; modelo restrito não é visível a terceiros.",
    situacao: "COBERTO",
    evidencia: "m26-designer.test.ts t3 e t4.",
  },
  {
    n: 18,
    enunciado: "Relatório em segundo plano notifica ao terminar e o resultado corresponde aos filtros aplicados.",
    situacao: "COBERTO",
    evidencia:
      "m26-designer.test.ts t8 e t9 — e o t8 confere que ANTES do trabalhador rodar não há " +
      "resultado, que é o que 'segundo plano' significa.",
  },
  {
    n: 19,
    enunciado: "Campo calculado com expressão maliciosa é rejeitado pela gramática, sem acesso ao banco.",
    situacao: "COBERTO",
    evidencia:
      "m26-gramatica.test.ts t1 e t2 (a linguagem não TEM a construção) e m26-designer.test.ts " +
      "t2 (a recusa acontece na gravação, com o count() em zero).",
  },
  {
    n: 20,
    enunciado: "Chamado registra número único e a pesquisa de satisfação é gravada.",
    situacao: "COBERTO",
    evidencia: "m27-suporte.test.ts t4, t5 e t8.",
  },
  {
    n: 21,
    enunciado: "Recarregar cada tela após a operação encontra o dado persistido.",
    situacao: "COBERTO",
    evidencia:
      "scripts/smoke-ent02.ts — 37 passos, 0 falhas, e CADA passo recarrega a tela do " +
      "servidor antes de conferir. É o único lugar que pega 'grava e a lista não mostra'.",
  },
  {
    n: 22,
    enunciado: "Nenhum rótulo de conformidade, número de cláusula ou identificador do catálogo em tela, mensagem, notificação, PDF operacional ou rota.",
    situacao: "COBERTO",
    evidencia: "test/ui/rotulos-de-conformidade.test.ts, que varre app, components e lib.",
  },
];

describe("ENT02 — o inventário dos 22 testes mínimos do lote", () => {
  it("o inventário cobre os 22, e cada item declara a sua evidência", () => {
    expect(ITENS).toHaveLength(22);
    expect(ITENS.map((i) => i.n)).toEqual(
      Array.from({ length: 22 }, (_, k) => k + 1)
    );

    // ⚠️ TODO ITEM APONTA ALGO; QUEM PRECISA EXPLICAR É O QUE NÃO ESTÁ PRONTO.
    //
    // Um item COBERTO só precisa do ponteiro — "m21-protocolo.test.ts t2." é evidência
    // suficiente, e exigir prosa dele produziria comentário de encher. Já um PARCIAL ou
    // um NÃO COBERTO tem de dizer O QUE FALTA e POR QUÊ: sem isso, "parcial" vira um
    // rótulo que não custa nada e que ninguém reabre.
    //
    // A primeira versão desta regra exigia 40 caracteres de TODOS, e reprovou cinco
    // itens cobertos cuja evidência era exatamente o que devia ser. A regra é que
    // estava errada, não os itens.
    const semPonteiro = ITENS.filter((i) => i.evidencia.trim().length < 15);
    expect(semPonteiro.map((i) => i.n), "itens sem evidência nenhuma").toEqual([]);

    const semExplicacao = ITENS.filter(
      (i) => i.situacao !== "COBERTO" && i.evidencia.trim().length < 80
    );
    expect(
      semExplicacao.map((i) => i.n),
      "itens PARCIAIS ou NÃO COBERTOS sem dizer o que falta"
    ).toEqual([]);
  });

  it("o placar é o que se leva ao gate — e ele é impresso a cada execução", () => {
    const cobertos = ITENS.filter((i) => i.situacao === "COBERTO");
    const parciais = ITENS.filter((i) => i.situacao === "PARCIAL");
    const naoCobertos = ITENS.filter((i) => i.situacao === "NAO_COBERTO");

    console.log(
      `\n[ENT02] ${cobertos.length} coberto(s), ${parciais.length} parcial(is), ` +
        `${naoCobertos.length} não coberto(s) de ${ITENS.length}.`
    );
    for (const i of [...parciais, ...naoCobertos]) {
      console.log(
        `  ${i.situacao === "PARCIAL" ? "parcial     " : "NÃO COBERTO "} ${i.n}. ${i.enunciado}`
      );
    }

    expect({
      cobertos: cobertos.length,
      parciais: parciais.length,
      naoCobertos: naoCobertos.length,
    }).toEqual({ cobertos: 21, parciais: 0, naoCobertos: 1 });

    // ⚠️ O ÚNICO NÃO COBERTO É O EIXO MUNICÍPIO — o mesmo do ENT01, e por decisão de
    // ADR. Se um dia outro item cair para NÃO COBERTO, este teste falha nomeando.
    expect(naoCobertos.map((i) => i.n)).toEqual([1]);

    // ⚠️ O 4 SAIU DE PARCIAL, e o número mudou por uma razão que vale escrever: o
    // enunciado fala em "acessível por URL", e até o fechamento do ENT02 não HAVIA URL
    // nenhuma — nem para quem tem permissão. O item ficou parcial não porque a regra
    // falhasse, mas porque não existia superfície onde exercitá-la. A rota de download
    // (com autorização por registro) é o que o tornou exercitável.
    expect(parciais.map((i) => i.n)).toEqual([]);
  });
});
