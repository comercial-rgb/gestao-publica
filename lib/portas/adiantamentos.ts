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

/** "dd/mm/aaaa; documento; emitente; descrição; valor" por linha; a linha errada é recusada pelo número dela. */
export function lerComprovantes(texto: string): { dia: string; documento: string; emitente: string; descricao: string; valor: string }[] {
  const saida: { dia: string; documento: string; emitente: string; descricao: string; valor: string }[] = [];
  for (const [k, bruta] of texto.split(/\r?\n/).entries()) {
    const linha = bruta.trim();
    if (linha === "") continue;
    const partes = linha.split(";").map((x) => x.trim());
    const [data, documento, emitente, descricao, valor] = partes;
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(data ?? "");
    const valorOk = /^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(valor ?? "");
    if (partes.length !== 5 || m === null || !valorOk || documento === "" || emitente === "" || descricao === "") {
      throw new Error(`Comprovante da linha ${String(k + 1)}: escreva "dd/mm/aaaa; documento; emitente; descrição; valor" (ex.: 05/02/2026; NF 10; Papelaria; Material de expediente; 300,00). Nada foi gravado.`);
    }
    saida.push({ dia: `${m[3]}-${m[2]}-${m[1]}`, documento: documento ?? "", emitente: emitente ?? "", descricao: descricao ?? "", valor: (valor ?? "").replace(/\./g, "").replace(",", ".") });
  }
  return saida;
}

export async function registrarPrestacaoNaTela(p: {
  readonly concessaoId: string;
  readonly valorComprovado: string;
  readonly valorDevolvido: string;
  readonly relatorio: string;
  readonly diaApresentacao: string;
  /** V39-R2 — os comprovantes da aplicação, um por linha: "dd/mm/aaaa; documento; emitente; descrição; valor". */
  readonly comprovantes?: string;
}): Promise<string> {
  const { comprovantes: texto, ...resto } = p;
  const comprovantes = lerComprovantes(texto ?? "");
  return comEscritaAutenticada("EMPENHAR", async (criadoPor) => {
    await registrarPrestacaoDeAdiantamento(cliente(), { ...resto, ...(comprovantes.length > 0 ? { comprovantes } : {}), criadoPor });
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
