import { sumMoney, toMoney } from "../../packages/contracts/index.js";
import { janelaCivilDoAno, diaCivil } from "../../packages/datas/index";
import { cliente, PortaSemBancoError } from "./cliente";
import { documentoPublicavelDoCredor } from "./despesas-publicas";

/**
 * CONSULTA PÚBLICA DE DIÁRIAS (V32). Sem sessão: é o que o portal mostra a qualquer pessoa.
 *
 * ⚠️ O QUE SAI: quem recebeu (nome e cargo), o CPF MASCARADO pela mesma regra das despesas, destino, período,
 * finalidade, quantidade, valor, a norma que autorizou e se a prestação de contas já foi aprovada. O que NÃO
 * sai: o documento cru, o relatório da prestação e o parecer (podem trazer dado pessoal de terceiros).
 */

export { PortaSemBancoError };

export const CAMPOS_PUBLICOS_DA_DIARIA = [
  "numero", "beneficiarioNome", "cargoOuFuncao", "beneficiarioDocumento", "destino", "finalidade",
  "diaSaida", "diaRetorno", "quantidade", "valorUnitario", "valor", "atoAutorizativo", "prestacaoAprovada",
] as const;

export interface DiariaPublica {
  readonly numero: string;
  readonly beneficiarioNome: string;
  readonly cargoOuFuncao: string | null;
  /** CPF mascarado; nunca o número cru. */
  readonly beneficiarioDocumento: string;
  readonly destino: string;
  readonly finalidade: string;
  readonly diaSaida: string;
  readonly diaRetorno: string;
  readonly quantidade: string;
  readonly valorUnitario: string;
  readonly valor: string;
  readonly atoAutorizativo: string;
  readonly prestacaoAprovada: boolean;
}

export async function listarDiariasPublicas(exercicio: number): Promise<{ readonly linhas: readonly DiariaPublica[]; readonly total: string }> {
  const j = janelaCivilDoAno(exercicio);
  const linhas = await cliente().concessaoDeAdiantamento.findMany({
    where: { especie: "DIARIA", dataInicio: { gte: j.inicio, lte: j.fim } },
    orderBy: [{ dataInicio: "desc" }, { numero: "asc" }],
    select: {
      numero: true, beneficiarioNome: true, cargoOuFuncao: true, beneficiarioDocumento: true, destino: true, finalidade: true,
      dataInicio: true, dataFim: true, quantidadeDeDiarias: true, valorUnitario: true, valor: true, atoAutorizativo: true,
      prestacoes: { select: { decisao: { select: { aprovada: true } } } },
    },
  });
  const saida = linhas.map((l) => {
    return {
      numero: l.numero,
      beneficiarioNome: l.beneficiarioNome,
      cargoOuFuncao: l.cargoOuFuncao,
      beneficiarioDocumento: documentoPublicavelDoCredor(l.beneficiarioDocumento),
      destino: l.destino ?? "",
      finalidade: l.finalidade,
      diaSaida: diaCivil(l.dataInicio),
      diaRetorno: diaCivil(l.dataFim),
      quantidade: l.quantidadeDeDiarias?.toFixed(1) ?? "",
      valorUnitario: l.valorUnitario?.toFixed(2) ?? "",
      valor: l.valor.toFixed(2),
      atoAutorizativo: l.atoAutorizativo,
      prestacaoAprovada: l.prestacoes.some((p) => p.decisao?.aprovada === true),
    };
  });
  return { linhas: saida, total: sumMoney(linhas.map((l) => toMoney(l.valor.toFixed(2)))).toFixed(2) };
}
