import { toMoney } from "../../packages/contracts/index.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import {
  comporCredito,
  zAnularCreditoInput,
  zCriarDecretoInput,
  zCriarLeiInput,
  zEncerrarDecretoInput,
  type AnularCreditoInput,
  type CriarDecretoInput,
  type CriarLeiInput,
  type EncerrarDecretoInput,
  type ExecutarCreditoInput,
} from "./dominio.js";
import type { M03Deps } from "./ports.js";

/**
 * CASOS DE USO do M03.
 *
 * Fluxo do TR: a LEI autoriza um TETO; o DECRETO executa (parte d)o teto.
 * O balanceamento (Σanul == Σsupl, por fonte) é validado no domínio PURO, antes
 * de qualquer I/O. Os limites que dependem de banco — teto restante da lei,
 * saldo disponível das fichas anuladas, disponibilidade da fonte — são lidos do
 * SUM REAL dentro da transação, no adapter.
 */

export async function criarLei(
  input: CriarLeiInput,
  deps: M03Deps
): Promise<string> {
  const dados = zCriarLeiInput.parse(input);

  // ⚠️ SEM UG: a LEI é ato do Legislativo, registrado pelo ente. Ela AUTORIZA um teto — não
  // mexe em ficha nenhuma (quem mexe é o decreto, e é lá que a unidade aparece).
  await deps.autz.exigir(dados.criadoPor, ACAO_DO_SERVICO.criarLei, "ENTE");

  return deps.creditos.criarLei({
    id: deps.ids.novo(),
    numero: dados.numero,
    ano: dados.ano,
    tipoCredito: dados.tipoCredito,
    valorAutorizado: dados.valorAutorizado,
    ...(dados.percentualLimite !== undefined
      ? { percentualLimite: dados.percentualLimite }
      : {}),
    dataPublicacao: dados.dataPublicacao,
    criadoPor: dados.criadoPor,
  });
}

export async function criarDecreto(
  input: CriarDecretoInput,
  deps: M03Deps
): Promise<string> {
  const dados = zCriarDecretoInput.parse(input);

  // ⚠️ SEM UG: o decreto NASCE VAZIO — os itens (e as fichas, e as unidades) entram no
  // `executarCredito`. Não há unidade nenhuma a que amarrá-lo aqui.
  await deps.autz.exigir(dados.criadoPor, ACAO_DO_SERVICO.criarDecreto, "ENTE");

  return deps.creditos.criarDecreto({
    id: deps.ids.novo(),
    leiId: dados.leiId,
    numero: dados.numero,
    ano: dados.ano,
    data: dados.data,
    origemRecurso: dados.origemRecurso,
    criadoPor: dados.criadoPor,
  });
}

/**
 * Executa o crédito. INVARIANTE 2 (balanceamento) é conferido no domínio PURO,
 * antes de tocar o banco: um decreto por anulação que não fecha nem chega a
 * abrir transação.
 */
export async function executarCredito(
  input: ExecutarCreditoInput,
  deps: M03Deps
): Promise<readonly string[]> {
  const decreto = await deps.creditos.buscarDecreto(input.decretoId);
  if (decreto === null) {
    throw new Error(`Decreto ${input.decretoId} não encontrado.`);
  }
  if (decreto.encerrado) {
    throw new Error(
      `Decreto ${input.decretoId} está ENCERRADO — não aceita novos itens.`
    );
  }

  // Domain puro: Σanul == Σsupl no total E em cada fonte (TR 5.111).
  const { itens } = comporCredito(decreto.origemRecurso, input);

  // ⚠️ TODAS AS UNIDADES DO DECRETO — E ELE É INDIVISÍVEL. TR 6.5.
  //
  // Um decreto anula 50 mil na Educação para suplementar 50 mil na Saúde: é UM ato, sobre
  // DUAS unidades. Quem só tem permissão na Saúde não executa "a parte dele" — não existe
  // meia execução: o balanceamento (Σanul == Σsupl) é a razão de o decreto existir, e gravar
  // metade dele criaria um crédito que não fecha. Ou passa nas duas, ou não passa.
  //
  // A permissão GLOBAL cobre todas de uma vez; a de UMA unidade só cobre a sua — e a negação
  // nomeia QUAL unidade faltou.
  await deps.autz.exigir(input.criadoPor, ACAO_DO_SERVICO.executarCredito, {
    fichas: itens.map((i) => i.fichaId),
  });

  return deps.creditos.executarCredito({
    decretoId: decreto.id,
    itens: itens.map((i) => ({ ...i, itemId: deps.ids.novo() })),
    criadoPor: input.criadoPor,
  });
}

/**
 * Anula o crédito: INVARIANTE 1 — o decreto original fica intacto. Cada item
 * vivo ganha um item de estorno (tipo invertido) e um MovimentoDotacao inverso,
 * devolvendo o saldo às fichas.
 */
export async function anularCredito(
  input: AnularCreditoInput,
  deps: M03Deps
): Promise<readonly string[]> {
  const dados = zAnularCreditoInput.parse(input);

  const decreto = await deps.creditos.buscarDecreto(dados.decretoId);
  if (decreto === null) {
    throw new Error(`Decreto ${dados.decretoId} não encontrado.`);
  }
  if (decreto.itensVivos.length === 0) {
    throw new Error(
      `Decreto ${dados.decretoId} não tem item vivo — nada a anular.`
    );
  }

  // ⚠️ AS MESMAS UNIDADES DA EXECUÇÃO — desfazer o decreto devolve saldo a TODAS as fichas
  // que ele tocou, e por isso exige poder em todas elas. Simetria com `executarCredito`: quem
  // não podia executar na Educação também não pode desfazer o que se fez lá.
  await deps.autz.exigir(dados.criadoPor, ACAO_DO_SERVICO.anularCredito, {
    fichas: decreto.itensVivos.map((i) => i.fichaId),
  });

  return deps.creditos.anularCredito({
    decretoId: decreto.id,
    data: dados.data,
    motivo: dados.motivo,
    criadoPor: dados.criadoPor,
    idsEstorno: decreto.itensVivos.map(() => deps.ids.novo()),
  });
}

/** Encerra o decreto. "Encerrado?" passa a ser derivado da existência do fato. */
export async function encerrarDecreto(
  input: EncerrarDecretoInput,
  deps: M03Deps
): Promise<string> {
  const dados = zEncerrarDecretoInput.parse(input);

  const decreto = await deps.creditos.buscarDecreto(dados.decretoId);
  if (decreto === null) {
    throw new Error(`Decreto ${dados.decretoId} não encontrado.`);
  }
  if (decreto.encerrado) {
    throw new Error(`Decreto ${dados.decretoId} já está encerrado.`);
  }

  // ⚠️ SEM UG: encerrar o decreto não mexe em ficha nenhuma — é um fato SOBRE O DECRETO ("ele
  // não aceita mais itens"). O saldo das unidades fica exatamente como estava.
  await deps.autz.exigir(dados.criadoPor, ACAO_DO_SERVICO.encerrarDecreto, "ENTE");

  return deps.creditos.encerrarDecreto({
    decretoId: decreto.id,
    data: dados.data,
    motivo: dados.motivo,
    criadoPor: dados.criadoPor,
  });
}

/** Quanto ainda resta do teto da lei (TR 4.30). */
export async function saldoDaLei(
  leiId: string,
  valorAutorizado: string,
  deps: M03Deps
): Promise<{ readonly autorizado: string; readonly consumido: string; readonly restante: string }> {
  const consumido = await deps.creditos.consumidoDaLei(leiId);
  const autorizado = toMoney(valorAutorizado);
  return {
    autorizado: autorizado.toFixed(2),
    consumido: consumido.toFixed(2),
    restante: toMoney(autorizado.minus(consumido)).toFixed(2),
  };
}
