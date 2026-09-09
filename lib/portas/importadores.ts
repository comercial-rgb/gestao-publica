import { cliente, PortaSemBancoError } from "./cliente";
import { comEscritaAutenticada, exigirSessao } from "./sessao";
import { previaDaFolha, previaDeTributos } from "../../modules/m20-importador/dominio";
import {
  confirmarImportacaoFolha,
  confirmarImportacaoTributos,
  listarImportacoes,
} from "../../modules/m20-importador/servico";
import { criarM05DepsComAlmoxarifado } from "../../modules/m10-patrimonial/adapter-m05-almox";
import { roteiroEmpenho, roteiroLiquidacao, roteiroPagamento } from "../../modules/m05-despesa/dominio";
import { criarM04Deps } from "../../modules/m04-receita/adapter-prisma";
import { roteiroArrecadacao } from "../../modules/m04-receita/dominio";

/**
 * PORTA — IMPORTADORES (M20, TR 7.10-7.11). A tela consome ISTO (grep trivalente).
 *
 * A PRÉVIA é pura (parse+validação do texto, nada toca o banco) — mas exige sessão, porque é tela
 * autenticada. A CONFIRMAÇÃO é escrita autenticada: injeta o `criadoPor` real, registra a operação e
 * encaminha aos SERVIÇOS REAIS (M05/M07/M04). O importador nunca escreve razão por conta própria.
 *
 * ⚠️ A PORTA ENCAMINHA O ROTEIRO, NÃO O ESCOLHE — as contas são as canônicas da POC (as mesmas do
 * seed `pcasp`/massa). Um ente com outro plano troca estas constantes na implantação.
 */

export { PortaSemBancoError };
export type { PreviaImportacao, LinhaFolha, LinhaTributo, ViolacaoImportacao } from "../../modules/m20-importador/dominio";
export type { ImportacaoNaLista } from "../../modules/m20-importador/servico";

// ── Contas canônicas da POC (mesmas do seed) ───────────────────────────────────────
const CONTA_BANCOS = "1.1.1.1.2.00.00";
const CONTA_OBRIGACAO = "2.1.3.1.1.00.00";
const CONTA_VPD = "3.3.2.1.1.01.00";
const CONTA_DISP = "6.2.2.1.1.00.00";
const CONTA_EMPENHADO = "6.2.2.1.3.01.00";
const CONTA_LIQUIDADO = "6.2.2.1.3.03.00";
const CONTA_PAGO = "6.2.2.1.3.04.00";
const CONTAS_CONSIGNACAO: Readonly<Record<string, string>> = { INSS: "2.1.8.8.1.01.00", ISS: "2.1.8.8.1.02.00" };

const ROTEIROS = {
  empenho: roteiroEmpenho({ creditoDisponivel: CONTA_DISP, creditoEmpenhado: CONTA_EMPENHADO }),
  liquidacao: roteiroLiquidacao({ variacaoDiminutiva: CONTA_VPD, obrigacaoAPagar: CONTA_OBRIGACAO, creditoEmpenhado: CONTA_EMPENHADO, creditoLiquidado: CONTA_LIQUIDADO }),
  pagamento: roteiroPagamento({ obrigacaoAPagar: CONTA_OBRIGACAO, disponibilidade: CONTA_BANCOS, creditoLiquidado: CONTA_LIQUIDADO, creditoPago: CONTA_PAGO }),
};
const R_ARRECADACAO = roteiroArrecadacao({
  disponibilidade: CONTA_BANCOS, variacaoAumentativa: "4.1.1.2.1.01.00",
  receitaARealizar: "6.2.1.1.0.00.00", receitaRealizada: "6.2.1.2.0.00.00",
});

// ── PRÉVIA (pura; exige sessão porque é tela autenticada) ──────────────────────────
export async function previewFolha(nomeArquivo: string, conteudo: string) {
  await exigirSessao();
  return previaDaFolha(nomeArquivo, conteudo);
}

export async function previewTributos(nomeArquivo: string, conteudo: string) {
  await exigirSessao();
  return previaDeTributos(nomeArquivo, conteudo);
}

// ── CONFIRMAÇÃO (escrita autenticada; os fatos nascem pelos serviços reais) ─────────
export async function confirmarFolha(p: { readonly nomeArquivo: string; readonly conteudo: string; readonly exercicio: number }) {
  return comEscritaAutenticada("IMPORTAR_FOLHA", (criadoPor) =>
    confirmarImportacaoFolha(
      cliente(),
      {
        nomeArquivo: p.nomeArquivo, conteudo: p.conteudo, exercicio: p.exercicio,
        dataEmpenho: new Date(), dataLiquidacao: new Date(), dataPagamento: new Date(),
        contaBancaria: "CC-POC-A", contaDisponibilidade: CONTA_BANCOS,
        contaConsignacaoPorTipo: CONTAS_CONSIGNACAO, credorCpfCnpj: "12345678000199", criadoPor,
      },
      ROTEIROS,
      criarM05DepsComAlmoxarifado(cliente())
    )
  );
}

export async function confirmarTributos(p: { readonly nomeArquivo: string; readonly conteudo: string; readonly exercicio: number }) {
  return comEscritaAutenticada("IMPORTAR_TRIBUTOS", (criadoPor) =>
    confirmarImportacaoTributos(
      cliente(),
      { nomeArquivo: p.nomeArquivo, conteudo: p.conteudo, exercicio: p.exercicio, criadoPor },
      R_ARRECADACAO,
      criarM04Deps(cliente())
    )
  );
}

// ── HISTÓRICO (trilha, TR 4.12.2) ──────────────────────────────────────────────────
export async function lerImportacoes() {
  await exigirSessao();
  return listarImportacoes(cliente());
}
