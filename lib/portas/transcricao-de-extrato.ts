import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada, exigirSessao } from "./sessao";
import { acoesPermitidas } from "./molde";
import { instanteCivilBr } from "../../packages/datas/index";
import { diaDoBanco } from "../../modules/m09-tesouraria/dia-do-banco";
import { linhasDigitadasQueNaoValem, TEXTO_DO_MOTIVO } from "../../modules/m09-tesouraria/linhas-digitadas";
import { revisarTranscricaoDeExtrato, transcreverLinhasDeExtrato } from "../../modules/m09-tesouraria/transcricao";

/**
 * V39-R3 (R3-015) — A TELA DA TRANSCRIÇÃO DE EXTRATO: as contas, as linhas digitadas da conta escolhida com a condição de
 * cada uma (vale ou não como extrato, e por quê) e os atos de transcrever e revisar. Leitura sob CONSULTAR_FINANCEIRO,
 * como a conciliação; os atos cobram TRANSCREVER_EXTRATO no serviço.
 */

export interface LinhaDigitadaNaTela {
  readonly transcricaoId: string;
  readonly dia: string;
  readonly natureza: "CREDITO" | "DEBITO";
  readonly valor: string;
  readonly historico: string;
  readonly documentoDeSuporte: string;
  readonly digitadaPor: string;
  readonly digitadaEm: string;
  readonly revisao: { readonly resultado: "CONFIRMADA" | "DIVERGENTE"; readonly meio: string; readonly por: string; readonly em: string } | null;
  /** "VALE" ou o motivo de não valer, em texto de tela. */
  readonly condicao: "VALE" | "AGUARDANDO_REVISAO" | "REVISADA_DIVERGENTE" | "COBERTA_PELO_BANCO";
  readonly textoDaCondicao: string;
  /** Quem está vendo é revisor possível desta linha (tem a ação e não a digitou); se já foi revisada, a tela mostra a revisão. */
  readonly podeRevisar: boolean;
}

export interface TelaDaTranscricao {
  readonly contas: readonly { readonly id: string; readonly codigo: string; readonly descricao: string }[];
  readonly contaId: string | null;
  readonly linhas: readonly LinhaDigitadaNaTela[];
  readonly podeTranscrever: boolean;
}

export async function lerTelaDaTranscricao(contaId: string | null): Promise<TelaDaTranscricao> {
  await exigirLeituraDoEnte("CONSULTAR_FINANCEIRO");
  const sessao = await exigirSessao();
  const contas = await cliente().contaBancaria.findMany({ orderBy: { codigo: "asc" }, select: { id: true, codigo: true, descricao: true } });
  const escolhida = contaId !== null && contas.some((c) => c.id === contaId) ? contaId : null;
  const pode = (await acoesPermitidas(["TRANSCREVER_EXTRATO"])).has("TRANSCREVER_EXTRATO");
  if (escolhida === null) return { contas, contaId: null, linhas: [], podeTranscrever: pode };
  const naoValem = await linhasDigitadasQueNaoValem(cliente(), escolhida);
  const linhas = await cliente().lancamentoExtrato.findMany({
    where: { contaBancariaId: escolhida, extrato: { origem: "DIGITADO" } },
    orderBy: [{ dataPostagem: "desc" }, { criadoEm: "desc" }],
    select: {
      id: true, dataPostagem: true, natureza: true, valor: true, memo: true,
      transcricao: { select: { id: true, documentoDeSuporte: true, criadoPor: true, criadoEm: true, revisao: { select: { resultado: true, meio: true, criadoPor: true, criadoEm: true } } } },
    },
  });
  return {
    contas,
    contaId: escolhida,
    podeTranscrever: pode,
    linhas: linhas.flatMap((l) => {
      const t = l.transcricao;
      if (t === null) return [];
      const motivo = naoValem.get(l.id);
      return [{
        transcricaoId: t.id, dia: diaDoBanco(l.dataPostagem).split("-").reverse().join("/"), natureza: l.natureza, valor: l.valor.toFixed(2), historico: l.memo,
        documentoDeSuporte: t.documentoDeSuporte, digitadaPor: t.criadoPor, digitadaEm: instanteCivilBr(t.criadoEm),
        revisao: t.revisao === null ? null : { resultado: t.revisao.resultado, meio: t.revisao.meio, por: t.revisao.criadoPor, em: instanteCivilBr(t.revisao.criadoEm) },
        condicao: motivo ?? "VALE",
        textoDaCondicao: motivo === undefined ? "vale como extrato: revisada e confirmada" : `não vale como extrato: ${TEXTO_DO_MOTIVO[motivo]}`,
        podeRevisar: pode && t.criadoPor !== sessao.identificador,
      }];
    }),
  };
}

export async function transcreverPelaTela(input: {
  readonly contaBancariaId: string;
  readonly linhas: readonly { readonly data: string; readonly valor: string; readonly natureza: "CREDITO" | "DEBITO"; readonly historico: string; readonly documento?: string | undefined }[];
  readonly documentoDeSuporte: string;
  readonly observacao?: string | undefined;
  readonly confirmoLinhasRepetidas: boolean;
}): Promise<string> {
  const r = await comEscritaAutenticada("TRANSCREVER_EXTRATO", (criadoPor) => transcreverLinhasDeExtrato(cliente(), { ...input, linhas: [...input.linhas], criadoPor }));
  return `${String(r.linhas)} linha(s) transcrita(s). Elas só valem como extrato depois de revisadas e confirmadas por outra pessoa.`;
}

export async function revisarPelaTela(input: { readonly transcricaoId: string; readonly resultado: "CONFIRMADA" | "DIVERGENTE"; readonly meio: string; readonly observacao?: string | undefined }): Promise<string> {
  await comEscritaAutenticada("TRANSCREVER_EXTRATO", (criadoPor) => revisarTranscricaoDeExtrato(cliente(), { ...input, criadoPor }));
  return input.resultado === "CONFIRMADA" ? "Linha confirmada: passa a valer como extrato nos dias que o banco não cobre." : "Linha registrada como divergente: não vale como extrato. Transcreva a linha certa.";
}
