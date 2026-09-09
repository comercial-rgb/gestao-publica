import type { PrismaClient } from "../../prisma/generated/client/client.js";
import type { Tx } from "./autorizacao.js";

/**
 * M16 — O REGISTRO DE OPERAÇÃO. TR 6.1 (registro), 6.2 (resultado), 6.3 (LOCAL da operação).
 *
 * ═══ ⚠️ O QUE O RAZÃO **NÃO PODE** REGISTRAR, POR CONSTRUÇÃO ═══
 * O razão já responde QUEM (`criadoPor`) e QUANDO (`dataTransacao`, `criadoEm`) — para os fatos
 * que ACONTECERAM. Duas coisas ficam fora dele, e nenhuma por descuido:
 *
 *   1. **DE ONDE** (ip, agente). Um `LancamentoContabil` é um fato CONTÁBIL; o IP de quem o
 *      digitou não é dado contábil, e enfiá-lo lá misturaria a camada de transporte com a de
 *      escrituração. Ele é dado de ACESSO — e mora aqui.
 *
 *   2. **O QUE FOI NEGADO.** E este é o buraco que só um log pode tapar: quando a autorização
 *      (bloco 3) recusa, **NÃO HÁ FATO** — nada é gravado, e é essa exatamente a promessa
 *      ("Nada foi gravado"). Mas a TENTATIVA existiu, e ela é o que o controle interno mais
 *      procura: *quem tentou pagar fora da sua unidade, às 17h de sexta, e foi barrado?*
 *
 *      Sem este registro, o sistema protege e **não conta a ninguém que protegeu**. A negação
 *      fica invisível — e uma negação invisível não é auditoria, é sorte.
 *
 * ═══ POR QUE É UMA **PORTA**, E NÃO UMA CHAMADA DENTRO DOS 76 SERVIÇOS ═══
 * O domínio não sabe o que é um IP. Ele nem sabe que existe HTTP — e essa ignorância é o motivo
 * de os serviços serem testáveis sem servidor. Acrescentar `ip`/`agente` à assinatura dos 76
 * seria contaminar o núcleo inteiro com um detalhe de transporte que ele nunca vai usar.
 *
 * Quem sabe o IP é a BORDA. Então é a borda que registra — e esta porta é o contrato dela.
 * **Hoje não existe camada HTTP neste repositório** (levantado no passo 0: as dependências são
 * prisma, pg, decimal e zod, e nada mais). Então a porta nasce sozinha, e quem a exercita é o
 * teste, fazendo o papel do handler futuro. No dia em que o handler existir, ele encontra o
 * contrato pronto — e não uma decisão a tomar às pressas.
 */

export type ResultadoDeOperacao = "SUCESSO" | "NEGADO" | "ERRO";

export interface OperacaoRegistrada {
  /** O identificador do usuário — texto, não FK: um token forjado também se registra. */
  readonly usuarioIdent: string;
  /**
   * A ação tentada. String livre de propósito: cabem tanto as `AcaoDoSistema` do censo (EMPENHAR,
   * PAGAR) quanto os atos da própria borda (LOGIN, LOGOUT). Um log que RECUSA o que ainda não
   * classificou é um log que perde justamente o evento novo — que é sempre o mais interessante.
   */
  readonly acao: string;
  /** TR 6.3 — o LOCAL. Nulos são legítimos (um job interno não tem IP). */
  readonly ip?: string | undefined;
  readonly agente?: string | undefined;
  readonly resultado: ResultadoDeOperacao;
  /** A mensagem da negação, quando houve. É ela que responde "por quê". */
  readonly detalhe?: string | undefined;
}

export interface RegistroDeOperacaoPort {
  registrar(op: OperacaoRegistrada, agora?: Date): Promise<void>;
}

export function criarRegistroDeOperacaoPrisma(
  prisma: PrismaClient | Tx
): RegistroDeOperacaoPort {
  return {
    async registrar(op, agora = new Date()): Promise<void> {
      await (prisma as Tx).registroDeOperacao.create({
        data: {
          usuarioIdent: op.usuarioIdent,
          acao: op.acao,
          ip: op.ip ?? null,
          agente: op.agente ?? null,
          resultado: op.resultado,
          detalhe: op.detalhe ?? null,
          criadoEm: agora,
        },
      });
    },
  };
}

/**
 * O ENVELOPE DA BORDA — executa o ato e REGISTRA o desfecho, qualquer que seja.
 *
 * ⚠️ ELE RE-LANÇA O ERRO. Não é um `try/catch` que engole nada: o serviço estoura, o registro é
 * gravado, e o erro segue seu caminho até o usuário. Um envelope que silenciasse a exceção
 * transformaria uma negação em sucesso aparente — e seria muito pior do que não ter log.
 *
 * ⚠️ E O REGISTRO É GRAVADO **FORA** DA TRANSAÇÃO DO ATO — de propósito. Se ele fosse escrito
 * dentro dela, o `rollback` da negação levaria o log embora junto: o sistema barraria o
 * pagamento indevido e apagaria, no mesmo instante, a prova de que alguém o tentou. O log do 6.3
 * tem de sobreviver exatamente ao caso em que o fato NÃO sobrevive.
 */
export async function comOperacaoRegistrada<T>(
  porta: RegistroDeOperacaoPort,
  contexto: {
    readonly usuarioIdent: string;
    readonly acao: string;
    readonly ip?: string | undefined;
    readonly agente?: string | undefined;
  },
  ato: () => Promise<T>,
  agora?: Date
): Promise<T> {
  try {
    const r = await ato();
    await porta.registrar({ ...contexto, resultado: "SUCESSO" }, agora);
    return r;
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : String(e);

    // ⚠️ NEGADO × ERRO — e a distinção é a que o controle interno vai filtrar.
    //
    // NEGADO = a autorização recusou (o usuário não podia). É o evento que interessa a quem
    // procura tentativa indevida. ERRO = qualquer outra coisa (saldo insuficiente, competência
    // travada, guard de negócio). Jogar os dois no mesmo balde faria o relatório de "acessos
    // negados" vir cheio de erros de digitação — e ninguém o leria.
    const negado =
      mensagem.includes("ACESSO NEGADO") ||
      mensagem.includes("USUÁRIO INATIVO") ||
      mensagem.includes("USUÁRIO NÃO CADASTRADO");

    await porta.registrar(
      {
        ...contexto,
        resultado: negado ? "NEGADO" : "ERRO",
        detalhe: mensagem,
      },
      agora
    );
    throw e;
  }
}
