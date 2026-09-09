import type { PrismaClient } from "../../prisma/generated/client/client.js";
import type { AcaoDoSistema } from "./acoes.js";
import type { Tx } from "./autorizacao.js";
import { autorizarNo, type EscopoDoFato } from "./escopo.js";

/**
 * M16 — A PORTA DA AUTORIZAÇÃO, para os módulos HEXAGONAIS. TR 4.56 · 6.4/6.5.
 *
 * ═══ ⚠️ POR QUE ESTA PORTA EXISTE (e por que ela NÃO é uma segunda forma de autorizar) ═══
 * Metade do repositório é hexagonal: `empenhar(input, deps)`, `registrarArrecadacao(input,
 * deps)` — o serviço NÃO conhece o Prisma, e a transação vive dentro do adapter. É a disciplina
 * do M01/M05, e ela foi construída de propósito: o serviço testa-se sem banco.
 *
 * O `autorizar(tx, ...)` precisa de um `tx`. Nesses 23 serviços não há nenhum — e passar o
 * `PrismaClient` para dentro deles desfaria justamente o que os ports foram feitos para
 * impedir. Então o serviço PEDE a autorização a uma porta, e o adapter — que já é quem fala
 * Prisma — a responde. **A chamada continua no SERVIÇO, uma linha, primeira depois do Zod:** é
 * lá que o grep-teste bidirecional olha, é lá que o revisor lê, e é a MESMA forma dos 53
 * serviços que recebem `prisma` direto. Muda quem executa, não onde se declara.
 *
 * ═══ ⚠️ O PREÇO, DITO SEM MAQUIAGEM: A CHECAGEM RODA ANTES DA TRANSAÇÃO DO WRITE ═══
 * No serviço prisma-direto, `autorizar` roda DENTRO da `$transaction` do fato. Aqui, roda um
 * instante antes dela — a tx nasce lá dentro, no adapter. Existe, portanto, uma janela de
 * milissegundos: se a permissão for REVOGADA entre a checagem e o INSERT, o ato passa.
 *
 * Não é um furo aberto, e é preciso dizer por quê:
 *   · a permissão não é um SALDO. Duas checagens concorrentes não "gastam" a mesma permissão —
 *     não há nada para estourar, ao contrário do saldo da ficha, que é o motivo pelo qual os
 *     guards de valor foram todos empurrados para dentro da transação;
 *   · a IDENTIDADE — a porta que de fato importa contra o usuário revogado — é reconferida
 *     DENTRO da tx pelo funil (`lancarNoRazao` chama `exigirUsuarioAtivo`). Um usuário demitido
 *     no meio da requisição é barrado lá, com transação aberta e zero escrita;
 *   · fechar essa janela custaria mover a chamada para dentro de ~30 métodos de adapter, e o
 *     grep-teste passaria a mirar adapters em vez de serviços — duas formas no repositório para
 *     comprar uma corrida que não corrompe nada.
 *
 * PENDÊNCIA NOMEADA (6.5-janela), e é esta a razão de ela estar escrita aqui em vez de ser
 * descoberta por alguém, daqui a um ano, lendo o código.
 */

export interface AutorizacaoPort {
  /**
   * Autoriza (ou estoura). `escopo` diz de onde sai a UG do fato — ver `escopo.ts`.
   *
   * ⚠️ Não devolve `boolean`. Um `boolean` convidaria ao `if (pode) {...}`, e o dia em que
   * alguém esquecesse o `if`, o sistema autorizaria em silêncio.
   */
  exigir(
    identificador: string,
    acao: AcaoDoSistema,
    escopo: EscopoDoFato
  ): Promise<void>;
}

/**
 * A implementação Prisma. Aceita `PrismaClient` OU uma `Tx` — e o segundo caso NÃO é um
 * detalhe: é ele que permite à OPERAÇÃO COMPOSTA (M10 × M04) autorizar DENTRO da transação
 * dela, via `criarM04DepsNaTx(tx)`. Ali a janela do cabeçalho nem existe.
 */
export function criarAutorizacaoPortPrisma(prisma: PrismaClient | Tx): AutorizacaoPort {
  return {
    exigir: (identificador, acao, escopo) =>
      autorizarNo(prisma as Tx, identificador, acao, escopo),
  };
}
