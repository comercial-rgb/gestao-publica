import {
  anexo10,
  lerTabelaDaProjecao,
  registrarProjecaoAtuarialDoRreo,
  retirarProjecaoAtuarialDoRreo,
  type Anexo10,
  type PlanoDoRegimeProprio,
} from "../../modules/m12-relatorios/rreo-anexo10.js";
import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";

export { ANOS_MINIMOS_DA_PROJECAO, PLANOS_DO_REGIME_PROPRIO, ROTULO_DO_PLANO } from "../../modules/m12-relatorios/rreo-anexo10.js";
export type { Anexo10, LinhaDoAnexo10, PlanoDoRegimeProprio, QuadroDoAnexo10 } from "../../modules/m12-relatorios/rreo-anexo10.js";
export { PortaSemBancoError } from "./cliente";

/** V35 — RREO Anexo 10: a projeção atuarial registrada, com resultado e saldo derivados. */
export async function gerarRreoAnexo10(p: { readonly exercicio: number; readonly bimestre: number }): Promise<Anexo10> {
  await exigirLeituraDoEnte("CONSULTAR_RELATORIOS");
  return anexo10(cliente(), p);
}

/** Registra a projeção de um plano a partir da tabela colada da avaliação atuarial (ano; receitas; despesas). */
export async function registrarProjecaoAtuarial(input: {
  readonly exercicio: number;
  readonly plano: PlanoDoRegimeProprio;
  readonly dataDaAvaliacao: string;
  readonly documento: string;
  readonly saldoFinanceiroAnterior: string;
  readonly tabela: string;
}): Promise<string> {
  const linhas = lerTabelaDaProjecao(input.tabela);
  const r = await comEscritaAutenticada("CADASTRAR_LINHA_DEMONSTRATIVO", (criadoPor) =>
    registrarProjecaoAtuarialDoRreo(cliente(), {
      exercicio: input.exercicio, plano: input.plano, dataDaAvaliacao: input.dataDaAvaliacao, documento: input.documento,
      saldoFinanceiroAnterior: input.saldoFinanceiroAnterior, linhas, criadoPor,
    })
  );
  return r.versao === 1 ? `Projeção registrada: ${String(r.anos)} anos.` : `Projeção substituída (versão ${String(r.versao)}): ${String(r.anos)} anos.`;
}

export async function retirarProjecaoAtuarial(input: { readonly exercicio: number; readonly plano: PlanoDoRegimeProprio }): Promise<string> {
  await comEscritaAutenticada("CADASTRAR_LINHA_DEMONSTRATIVO", (criadoPor) => retirarProjecaoAtuarialDoRreo(cliente(), { ...input, criadoPor }));
  return "Projeção retirada do demonstrativo; o histórico permanece.";
}
