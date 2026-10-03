import {
  aprovarPrestacaoDeAdiantamento,
  concederAdiantamento,
  listarAdiantamentos,
  registrarPrestacaoDeAdiantamento,
  rejeitarPrestacaoDeAdiantamento,
  type AdiantamentoNaLista,
  type Especie,
} from "../../modules/m05-despesa/adiantamentos.js";
import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";

/**
 * ═══ DIÁRIAS E SUPRIMENTO DE FUNDOS NA TELA (V32) ═══
 *
 * A porta só encaminha: autorização, saldo do empenho, prazos e a regra do art. 69 são do domínio (M05),
 * dentro da transação. A recusa sobe com a mensagem dele.
 */

export type { AdiantamentoNaLista, Especie };

export async function lerAdiantamentos(especie?: Especie): Promise<readonly AdiantamentoNaLista[]> {
  await exigirLeituraDoEnte("CONSULTAR_DESPESA");
  return listarAdiantamentos(cliente(), new Date(), especie);
}

export interface ConcessaoDaTela {
  readonly especie: Especie;
  readonly numero: string;
  readonly empenhoId: string;
  readonly beneficiarioNome: string;
  readonly beneficiarioDocumento: string;
  readonly cargoOuFuncao: string;
  readonly finalidade: string;
  readonly destino: string;
  readonly diaInicio: string;
  readonly diaFim: string;
  readonly quantidadeDeDiarias: string;
  readonly valorUnitario: string;
  readonly valor: string;
  readonly atoAutorizativo: string;
  readonly diaPrazoDePrestacao: string;
  readonly diaConcessao: string;
}

export async function concederNaTela(c: ConcessaoDaTela): Promise<string> {
  return comEscritaAutenticada("EMPENHAR", async (criadoPor) => {
    await concederAdiantamento(cliente(), {
      especie: c.especie,
      numero: c.numero,
      empenhoId: c.empenhoId,
      beneficiarioNome: c.beneficiarioNome,
      beneficiarioDocumento: c.beneficiarioDocumento.replace(/\D/g, ""),
      ...(c.cargoOuFuncao !== "" ? { cargoOuFuncao: c.cargoOuFuncao } : {}),
      finalidade: c.finalidade,
      ...(c.destino !== "" ? { destino: c.destino } : {}),
      diaInicio: c.diaInicio,
      diaFim: c.diaFim,
      ...(c.especie === "DIARIA" ? { quantidadeDeDiarias: c.quantidadeDeDiarias, valorUnitario: c.valorUnitario } : {}),
      valor: c.valor,
      atoAutorizativo: c.atoAutorizativo,
      diaPrazoDePrestacao: c.diaPrazoDePrestacao,
      diaConcessao: c.diaConcessao,
      criadoPor,
    });
    return `${c.especie === "DIARIA" ? "Diária" : "Suprimento de fundos"} ${c.numero} concedido. A responsabilidade a comprovar foi lançada no controle.`;
  });
}

export async function registrarPrestacaoNaTela(p: {
  readonly concessaoId: string;
  readonly valorComprovado: string;
  readonly valorDevolvido: string;
  readonly relatorio: string;
  readonly diaApresentacao: string;
}): Promise<string> {
  return comEscritaAutenticada("EMPENHAR", async (criadoPor) => {
    await registrarPrestacaoDeAdiantamento(cliente(), { ...p, criadoPor });
    return "Prestação de contas registrada; aguarda a análise.";
  });
}

export async function decidirPrestacaoNaTela(p: {
  readonly prestacaoId: string;
  readonly aprovar: boolean;
  readonly motivo: string;
  readonly diaDecisao: string;
}): Promise<string> {
  return comEscritaAutenticada("APROVAR_PRESTACAO_DE_CONTAS", async (criadoPor) => {
    const dados = { prestacaoId: p.prestacaoId, motivo: p.motivo, diaDecisao: p.diaDecisao, criadoPor };
    if (p.aprovar) {
      await aprovarPrestacaoDeAdiantamento(cliente(), dados);
      return "Prestação de contas aprovada; a responsabilidade foi baixada no controle.";
    }
    await rejeitarPrestacaoDeAdiantamento(cliente(), dados);
    return "Prestação de contas rejeitada; o beneficiário pode apresentar outra.";
  });
}
