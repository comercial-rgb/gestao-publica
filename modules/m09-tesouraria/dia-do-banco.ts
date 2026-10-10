import { diaCivil, fimDoDiaCivil, meioDiaCivil } from "../../packages/datas/index.js";

/**
 * O DIA DO BANCO (V38, achado ao concluir a conciliação de demonstração) — a ponte entre o dia do extrato e o dia
 * civil do ente.
 *
 * O leitor de OFX (e o da API do banco) guarda o dia informado pelo banco como MEIA-NOITE UTC: é formato externo, e
 * formato externo fica em UTC (CLAUDE.md, "Data civil do ente"). O resto da conciliação fala em dia CIVIL do ente
 * (UTC−3): o período termina no fim do dia civil, a tela formata no fuso do ente. Comparar os dois como instantes
 * erra por um dia nas duas direções — medido em `m09-extrato-dia-do-banco.test.ts`:
 *   · a linha do dia SEGUINTE ao fim do período (meia-noite UTC = 21h do dia anterior) entrava no período;
 *   · toda linha aparecia na tela um dia ANTES do que o banco informou.
 *
 * A regra: o dia do banco se lê em UTC (é o que ele é); compara-se com o corte pela CHAVE do mesmo dia; mostra-se como
 * um instante dentro daquele dia civil.
 */

/** O dia que o banco informou, "AAAA-MM-DD". UTC de propósito: é como o leitor o guardou (formato externo). */
export function diaDoBanco(dataPostagem: Date): string {
  return dataPostagem.toISOString().slice(0, 10);
}

/**
 * O LIMITE para filtrar linhas do extrato "até o corte": a meia-noite UTC do dia SEGUINTE ao dia civil do corte, com
 * `dataPostagem < limite`. Comparar com "menor que o dia seguinte" (e não "até a meia-noite do dia") vale para as duas
 * âncoras que os leitores usam: o de OFX guarda meia-noite UTC, o da API do BB guarda meio-dia UTC (achado do auditor:
 * com "<= meia-noite do dia", a linha do BB do último dia ficava de fora).
 */
export function limiteDoBancoApos(corte: Date): Date {
  const limite = new Date(`${diaCivil(corte)}T00:00:00.000Z`);
  limite.setUTCDate(limite.getUTCDate() + 1);
  return limite;
}

/** O exercício em dias do banco: de 01/01 (inclusive) a 01/01 do ano seguinte (exclusive), nas duas âncoras. */
export function janelaDoBancoDoAno(ano: number): { readonly inicio: Date; readonly limite: Date } {
  return { inicio: new Date(`${String(ano)}-01-01T00:00:00.000Z`), limite: new Date(`${String(ano + 1)}-01-01T00:00:00.000Z`) };
}

/** O instante para EXIBIR (e ordenar com os fatos do razão) a linha do banco: meio-dia civil do dia informado. */
export function instanteDoDiaDoBanco(dataPostagem: Date): Date {
  return meioDiaCivil(diaDoBanco(dataPostagem));
}

/** O fim do dia civil do dia informado pelo banco — o corte de um extrato que termina nesse dia. */
export function fimDoDiaDoBanco(dataPostagem: Date): Date {
  return fimDoDiaCivil(diaDoBanco(dataPostagem));
}
