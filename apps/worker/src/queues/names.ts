/**
 * Nomes de filas -- modulo SEM efeitos colaterais.
 *
 * Fica separado de `queues/folha.ts` porque aquele modulo instancia a Queue e
 * as conexoes Redis/PG no import. Scripts que so precisam do nome (smoke, ops)
 * importam daqui e nao abrem conexao nenhuma.
 */

export const FOLHA_QUEUE_NAME = 'folha'
