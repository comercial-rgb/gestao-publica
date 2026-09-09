/**
 * O ENTE DO CONTEXTO — o único lugar que sabe COMO se acha o ente.
 *
 * ═══ POR QUE ISTO EXISTE (e não é abstração por gosto) ═══
 * `EnteConfig` é um singleton por chave primária: a linha se chama `"unico"`. Essa
 * string estava escrita à mão em quatro lugares — os geradores da MSC e do MANAD, a
 * porta do SAGRES e um script de conferência. Cada um "sabia" que o ente é um só.
 *
 * A decisão de produto registrada em `docs/adr/ADR-eixo-de-municipio.md` é atender
 * vários municípios por **schema por município**, e não por coluna de tenant. Nesse
 * desenho, o ente continua sendo um por schema — mas QUAL schema passa a ser resolvido
 * por requisição. O dia em que isso valer, "achar o ente" deixa de ser uma constante e
 * vira uma função do contexto.
 *
 * ⚠️ ISTO **NÃO** IMPLANTA MULTI-TENANCY, e é importante dizer. Nada aqui resolve
 * schema, nada aqui lê membership. O que este arquivo faz é uma coisa só: parar de
 * espalhar a suposição. Quando o lote de tenancy chegar, ele muda UM arquivo em vez de
 * caçar quatro — e o compilador aponta quem esqueceu de passar o contexto.
 *
 * ═══ ⚠️ A MENSAGEM DE ERRO CONTINUA DE QUEM CHAMA ═══
 * A função recebe `oQueQuebraSemEle` porque o ente ausente quebra coisas DIFERENTES: a
 * MSC iria à União em nome de ninguém; o MANAD, à Receita; o SAGRES não saberia a quem
 * exportar. Uma mensagem genérica ("ente não configurado") faria o operador abrir o
 * código para descobrir o que ele estava tentando fazer. O texto específico de cada
 * chamador é o que torna a recusa acionável — e por isso ele não foi centralizado junto.
 */

/**
 * O identificador do singleton.
 *
 * ⚠️ EXPORTADO PARA O SEED, e para mais ninguém. Quem LÊ o ente usa `enteDoContexto`;
 * quem o SEMEIA precisa da chave para o `upsert`. São os dois usos legítimos.
 */
export const ID_DO_ENTE_UNICO = "unico";

/**
 * A superfície mínima de leitura — estrutural, e genérica no formato da linha.
 *
 * ⚠️ NÃO IMPORTA O `PrismaClient`. Os chamadores passam clientes de tipos diferentes (o
 * `Leitor` do M14, o client da porta, uma transação); amarrar a um deles obrigaria os
 * outros a converter. O genérico `E` faz o tipo da linha atravessar intacto: quem chama
 * com um `select` recebe de volta exatamente o que pediu.
 */
export interface LeitorDoEnte<E> {
  readonly enteConfig: {
    findUnique(args: {
      readonly where: { readonly id: string };
    }): Promise<E | null>;
  };
}

/**
 * Resolve o ente do contexto. FAIL-CLOSED: ausente, derruba nomeando o que quebra.
 *
 * @param oQueQuebraSemEle frase que completa "sem ele, ..." — o que este chamador
 *   especificamente não consegue fazer. Ver o cabeçalho.
 */
export async function enteDoContexto<E>(
  leitor: LeitorDoEnte<E>,
  oQueQuebraSemEle: string
): Promise<E> {
  const ente = await leitor.enteConfig.findUnique({
    where: { id: ID_DO_ENTE_UNICO },
  });
  if (ente === null) {
    throw new Error(
      `A configuração do ente NÃO está semeada. ${oQueQuebraSemEle} ` +
        `Semeie a configuração do ente — e confira os códigos oficiais (IBGE, CNPJ, ` +
        `tribunal) contra a fonte antes, com quem responde por eles.`
    );
  }
  return ente;
}
