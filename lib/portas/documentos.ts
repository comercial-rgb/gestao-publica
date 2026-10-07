import { cliente, PortaSemBancoError } from "./cliente";
import { comEscritaAutenticada, sessaoAtual } from "./sessao";
import {
  exigirLeituraDoEnte,
  exigirLeituraEmAlgumEscopo,
  autorizarLeituraDoRegistroPara,
  podeLerPara,
  type AcaoDeLeitura,
  type NivelDeLeitura,
} from "./leitura";
import { anexarArquivo, baixarAnexo } from "../../modules/m22-documentos/anexos";
import { alcanceNoContrato } from "../../modules/m11-licitacoes/acesso-da-fiscalizacao";
import {
  listarAnexosDaLeiOrcamentaria,
  listarAnexosDosDecretos,
  listarAnexosDasRealocacoes,
  listarAnexosDasNormas,
  listarAnexosDaPessoa,
  listarAnexosDasLiquidacoes,
  listarAnexosDoComunicado,
  listarAnexosDoPagamentoOuMovimento,
  listarAnexosDoTermo,
  listarAnexosDoProcesso,
  loteDeAnexosDaPessoa,
  loteDeAnexosDoProcesso,
  type AnexoNaLista,
  type LoteDeAnexos,
} from "../../modules/m22-documentos/consultas";
import {
  MIMES_ACEITOS,
  TAMANHO_MAXIMO_BYTES,
} from "../../modules/m22-documentos/armazenamento";

/**
 * PORTA — ANEXOS (M22): a entrada pelo formulário e a saída pela rota.
 *
 * ═══ ⚠️ POR QUE ESTA PORTA EXISTIU TÃO TARDE, E O QUE ISSO CUSTAVA ═══
 * O M22 nasceu no ENT02 com caso de uso, autorização por registro, hash, conferência de
 * integridade e quinze testes. E com ZERO consumidores: `anexarArquivo` e `baixarAnexo`
 * eram chamados só pelo próprio arquivo de teste. Não havia porta, não havia rota, e o
 * único `<input type="file">` do produto era o do importador de CSV.
 *
 * Na prática o produto tinha um cofre sem porta: nada entrava pela interface, e o que
 * entrasse por um script não sairia. "Documentos preservados na tramitação, com download
 * individual e em lote" era uma promessa que nenhuma tela cumpria.
 *
 * ⚠️ E A SAÍDA É UMA ROTA, NÃO UMA SERVER ACTION. Server Action devolve JSON serializado
 * pelo protocolo do React — um PDF de 20 MB atravessaria como array de bytes e o browser
 * não teria como salvá-lo. O download é HTTP: `Content-Type`, `Content-Disposition`, e o
 * navegador faz o resto. Ver `app/(areas)/documentos/anexos/[id]/route.ts`.
 */

export { PortaSemBancoError };
export type { AnexoNaLista, LoteDeAnexos };

/** O rol aceito, para o `accept` do input. ⚠️ Conveniência de tela — quem valida é o servidor. */
export const EXTENSOES_ACEITAS = Object.values(MIMES_ACEITOS)
  .map((e) => `.${e}`)
  .join(",");

export { TAMANHO_MAXIMO_BYTES };

// ═══════════════════════════════════════════════════════════════════════════
// LEITURAS
// ═══════════════════════════════════════════════════════════════════════════

// ⚠️ O ANEXO HERDA A ÁREA DO REGISTRO DONO (orquestração V3, 4.1). Até aqui
// `listarAnexosDaPessoa` exigia só "usuário ativo": qualquer identidade cadastrada
// baixava o documento de qualquer pessoa. Agora a área do dono é cobrada ANTES de o M22
// perguntar ao registro: processo e comunicado são caixas por participação (a ação em
// algum escopo abre a área, o registro decide), e o cadastro de pessoas é do ENTE.

export async function lerAnexosDoProcesso(
  processoId: string
): Promise<readonly AnexoNaLista[]> {
  const sessao = await exigirLeituraEmAlgumEscopo("CONSULTAR_PROTOCOLO");
  return listarAnexosDoProcesso(cliente(), processoId, sessao.identificador);
}

/**
 * V22 — os anexos das liquidações da lista, por liquidação. Cada liquidação é autorizada NA UNIDADE
 * dela (CONSULTAR_DESPESA); a que não passa simplesmente não entra no mapa — a tela mostra "sem
 * anexo" para quem não lê a unidade, o que é o mesmo que ela já mostraria da liquidação.
 */
export async function lerAnexosDasLiquidacoes(
  liquidacaoIds: readonly string[]
): Promise<ReadonlyMap<string, readonly AnexoNaLista[]>> {
  const sessao = await exigirLeituraEmAlgumEscopo("CONSULTAR_DESPESA");
  if (liquidacaoIds.length === 0) return new Map();
  const donos = await cliente().liquidacao.findMany({
    where: { id: { in: [...liquidacaoIds] } },
    select: { id: true, empenho: { select: { ficha: { select: { unidadeOrc: { select: { codigo: true } } } } } } },
  });
  const porUnidade = new Map<string, string[]>();
  for (const d of donos) {
    const u = d.empenho.ficha.unidadeOrc.codigo;
    porUnidade.set(u, [...(porUnidade.get(u) ?? []), d.id]);
  }
  const autorizadas: string[] = [];
  for (const [unidade, ids] of porUnidade) {
    try {
      await autorizarLeituraDoRegistroPara(sessao, "CONSULTAR_DESPESA", unidade);
      autorizadas.push(...ids);
    } catch {
      // unidade fora do escopo de leitura: nenhum anexo dela
    }
  }
  return listarAnexosDasLiquidacoes(cliente(), autorizadas, sessao.identificador);
}

export async function lerAnexosDaPessoa(
  pessoaId: string
): Promise<readonly AnexoNaLista[]> {
  const sessao = await exigirLeituraDoEnte("CONSULTAR_CADASTROS");
  return listarAnexosDaPessoa(cliente(), pessoaId, sessao.identificador);
}

/** V4 (§5): os anexos (o termo assinado) de um termo patrimonial — leitura do ente. */
export async function lerAnexosDoTermo(termoPatrimonialId: string): Promise<readonly AnexoNaLista[]> {
  const sessao = await exigirLeituraDoEnte("CONSULTAR_PATRIMONIO");
  return listarAnexosDoTermo(cliente(), termoPatrimonialId, sessao.identificador);
}

/** V22 — os anexos da Lei Orçamentária Anual: quem lê o planejamento no ente. */
export async function lerAnexosDaLeiOrcamentaria(leiOrcamentariaAnualId: string): Promise<readonly AnexoNaLista[]> {
  const sessao = await exigirLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
  return listarAnexosDaLeiOrcamentaria(cliente(), leiOrcamentariaAnualId, sessao.identificador);
}

/** V26 — os PDFs dos decretos de crédito: quem lê o planejamento no ente. */
export async function lerAnexosDosDecretos(decretoIds: readonly string[]): Promise<ReadonlyMap<string, readonly AnexoNaLista[]>> {
  const sessao = await exigirLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
  return listarAnexosDosDecretos(cliente(), decretoIds, sessao.identificador);
}

/** V27 — os PDFs das leis no cadastro de normas, por norma. */
export async function lerAnexosDasNormas(normaIds: readonly string[]): Promise<ReadonlyMap<string, readonly AnexoNaLista[]>> {
  const sessao = await exigirLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
  return listarAnexosDasNormas(cliente(), normaIds, sessao.identificador);
}

/** V27 — os PDFs dos decretos de realocação, por ato. */
export async function lerAnexosDasRealocacoes(atoIds: readonly string[]): Promise<ReadonlyMap<string, readonly AnexoNaLista[]>> {
  const sessao = await exigirLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
  return listarAnexosDasRealocacoes(cliente(), atoIds, sessao.identificador);
}

export async function lerAnexosDoComunicado(
  comunicadoId: string
): Promise<readonly AnexoNaLista[]> {
  const sessao = await exigirLeituraEmAlgumEscopo("CONSULTAR_COMUNICACAO");
  return listarAnexosDoComunicado(cliente(), comunicadoId, sessao.identificador);
}

/**
 * A área que um anexo herda do dono — e o nível: caixa por participação ou ente.
 *
 * ⚠️ `null` para o anexo que não existe OU que não tem dono conhecido: a rota responde
 * 404, o mesmo de "não pode". Um anexo órfão não é entregue a ninguém.
 */
type LeituraDoDono =
  | { readonly acao: AcaoDeLeitura; readonly nivel: NivelDeLeitura }
  /** V7 M2 U0.1 — documento INTERNO da fiscalização: só quem alcança a fiscalização daquele contrato. */
  | { readonly fiscalizacaoDoContrato: string }
  /** V22 — documento da DESPESA (empenho, liquidação): a leitura é a da despesa NA UNIDADE do fato. */
  | { readonly despesaDaUnidade: string };

async function leituraDoDonoDoAnexo(anexoId: string): Promise<LeituraDoDono | null> {
  const a = await cliente().anexo.findUnique({
    where: { id: anexoId },
    select: {
      processoId: true,
      movimentoProcessoId: true,
      comunicadoId: true,
      pessoaId: true,
      chamadoId: true,
      termoPatrimonialId: true,
      documentoFiscalId: true,
      guiaDeRecolhimentoId: true,
      leiOrcamentariaAnualId: true,
      decretoCreditoId: true,
      atoDeRealocacaoId: true,
      normaOrcamentariaId: true,
      ocorrenciaDeFiscalizacaoId: true,
      ocorrenciaDeFiscalizacao: { select: { contratoId: true } },
      medicaoDaOrdem: { select: { ordem: { select: { contratoId: true } } } },
      empenho: { select: { ficha: { select: { unidadeOrc: { select: { codigo: true } } } } } },
      liquidacao: { select: { empenho: { select: { ficha: { select: { unidadeOrc: { select: { codigo: true } } } } } } } },
      pagamento: { select: { liquidacao: { select: { empenho: { select: { ficha: { select: { unidadeOrc: { select: { codigo: true } } } } } } } } } },
      movimentoBancarioId: true,
      obraId: true,
    },
  });
  if (a === null) return null;
  if (a.processoId !== null || a.movimentoProcessoId !== null) return { acao: "CONSULTAR_PROTOCOLO", nivel: "algum" };
  if (a.comunicadoId !== null) return { acao: "CONSULTAR_COMUNICACAO", nivel: "algum" };
  if (a.chamadoId !== null) return { acao: "CONSULTAR_SUPORTE", nivel: "algum" };
  if (a.pessoaId !== null) return { acao: "CONSULTAR_CADASTROS", nivel: "ente" };
  if (a.termoPatrimonialId !== null) return { acao: "CONSULTAR_PATRIMONIO", nivel: "ente" };
  if (a.documentoFiscalId !== null) return { acao: "CONSULTAR_LICITACOES", nivel: "algum" };
  if (a.guiaDeRecolhimentoId !== null) return { acao: "CONSULTAR_FOLHA", nivel: "ente" };
  // V22 — o projeto, a lei e os anexos da LOA: documento público do planejamento, lido no ente.
  if (a.leiOrcamentariaAnualId !== null) return { acao: "CONSULTAR_PLANEJAMENTO", nivel: "ente" };
  // V26 — o PDF do decreto de crédito: documento público do planejamento, lido no ente, como a LOA.
  if (a.decretoCreditoId !== null) return { acao: "CONSULTAR_PLANEJAMENTO", nivel: "ente" };
  // V27 — o PDF do decreto de realocação: documento público do planejamento, como o de crédito.
  if (a.atoDeRealocacaoId !== null) return { acao: "CONSULTAR_PLANEJAMENTO", nivel: "ente" };
  // V27 — o PDF da lei publicada: documento público do planejamento.
  if (a.normaOrcamentariaId !== null) return { acao: "CONSULTAR_PLANEJAMENTO", nivel: "ente" };
  // V7 M2.1 — evidência de fiscalização é documento INTERNO do contrato: nunca vai à projeção pública.
  // ⚠️ V7 M2 U0.1 — e também não vai a quem só lê licitações: a evidência é da visão de FISCALIZAÇÃO (designado
  // vigente no contrato ou administrador da fiscalização). Antes, `CONSULTAR_LICITACOES` baixava qualquer uma.
  if (a.ocorrenciaDeFiscalizacao !== null) return { fiscalizacaoDoContrato: a.ocorrenciaDeFiscalizacao.contratoId };
  // V7 M2 U7 — a evidência da medição da ordem é interna da fiscalização, como a da ocorrência.
  if (a.medicaoDaOrdem !== null) return { fiscalizacaoDoContrato: a.medicaoDaOrdem.ordem.contratoId };
  // V22 — o comprovante da liquidação (e o anexo do empenho) seguem a UG do fato, como a escrita
  // (`escopoDoDono` no M22): quem não lê a despesa DAQUELA unidade não baixa o documento dela.
  if (a.liquidacao !== null) return { despesaDaUnidade: a.liquidacao.empenho.ficha.unidadeOrc.codigo };
  if (a.empenho !== null) return { despesaDaUnidade: a.empenho.ficha.unidadeOrc.codigo };
  // V36 — o documento do pagamento segue a UG do pagamento, como a escrita; o do movimento bancário é do financeiro
  // do ente, como a movimentação.
  if (a.pagamento !== null) return { despesaDaUnidade: a.pagamento.liquidacao.empenho.ficha.unidadeOrc.codigo };
  if (a.movimentoBancarioId !== null) return { acao: "CONSULTAR_FINANCEIRO", nivel: "ente" };
  // V36 — o documento da obra: quem lê licitações (a tela da obra) lê o anexo dela. Publicada no portal, o anexo
  // também sai sem sessão, pela rota pública, que confere a publicação.
  if (a.obraId !== null) return { acao: "CONSULTAR_LICITACOES", nivel: "algum" };
  return null;
}

/**
 * O ARQUIVO, para a rota de download.
 *
 * ⚠️ ELE USA `sessaoAtual`, NÃO `exigirSessao`, e a diferença importa AQUI. `exigirSessao`
 * REDIRECIONA para /login — o que numa página é o certo e numa rota de download é um
 * desastre silencioso: o browser seguiria o 307, receberia o HTML da tela de login e
 * salvaria isso como se fosse o PDF. O usuário abriria um "documento.pdf" com uma página
 * de login dentro.
 *
 * Sem sessão, `null`, e a rota responde 404 — a mesma resposta de "não existe" e de "não
 * pode", pelo motivo de sempre.
 */
export async function entregarAnexo(
  anexoId: string
): Promise<Awaited<ReturnType<typeof baixarAnexo>>> {
  const sessao = await sessaoAtual();
  if (sessao === null) return null;
  const dono = await leituraDoDonoDoAnexo(anexoId);
  if (dono === null) return null;
  if ("fiscalizacaoDoContrato" in dono) {
    if (!(await alcanceNoContrato(cliente(), sessao.identificador, dono.fiscalizacaoDoContrato)).fiscalizacao) return null;
  } else if ("despesaDaUnidade" in dono) {
    try {
      await autorizarLeituraDoRegistroPara(sessao, "CONSULTAR_DESPESA", dono.despesaDaUnidade);
    } catch {
      return null; // recusa de leitura: o download responde como inexistente, sem dizer de quem é
    }
  } else if (!(await podeLerPara(sessao, dono.acao, dono.nivel))) return null;
  return baixarAnexo(cliente(), anexoId, sessao.identificador);
}

export async function entregarLoteDoProcesso(
  processoId: string
): Promise<LoteDeAnexos | null> {
  const sessao = await sessaoAtual();
  if (sessao === null) return null;
  if (!(await podeLerPara(sessao, "CONSULTAR_PROTOCOLO", "algum"))) return null;
  return loteDeAnexosDoProcesso(cliente(), processoId, sessao.identificador);
}

export async function entregarLoteDaPessoa(
  pessoaId: string
): Promise<LoteDeAnexos | null> {
  const sessao = await sessaoAtual();
  if (sessao === null) return null;
  if (!(await podeLerPara(sessao, "CONSULTAR_CADASTROS", "ente"))) return null;
  return loteDeAnexosDaPessoa(cliente(), pessoaId, sessao.identificador);
}

// ═══════════════════════════════════════════════════════════════════════════
// ESCRITA — o `criadoPor` vem da sessão, sempre
// ═══════════════════════════════════════════════════════════════════════════

export interface AnexarNaTela {
  readonly nomeOriginal: string;
  readonly mimeType: string;
  readonly conteudo: Uint8Array;
  readonly origem?: "UPLOAD" | "DIGITALIZACAO" | "CAMERA" | "SISTEMA" | undefined;
  readonly processoId?: string | undefined;
  readonly movimentoProcessoId?: string | undefined;
  readonly comunicadoId?: string | undefined;
  readonly pessoaId?: string | undefined;
  readonly termoPatrimonialId?: string | undefined;
  readonly documentoFiscalId?: string | undefined;
  /** V22 — o comprovante do banco (ou outro documento) da liquidação; escopo = a UG do fato. */
  readonly liquidacaoId?: string | undefined;
  /** V22 — o projeto, a lei e os anexos da Lei Orçamentária Anual. */
  readonly leiOrcamentariaAnualId?: string | undefined;
  /** V26 — o PDF do decreto de abertura de crédito (SAGRES §4.6). */
  readonly decretoCreditoId?: string | undefined;
  /** V27 — o PDF do decreto de transposição, remanejamento ou transferência (SAGRES §4.6). */
  readonly atoDeRealocacaoId?: string | undefined;
  /** V27 — o PDF da lei orçamentária publicada, no cadastro da norma. */
  readonly normaOrcamentariaId?: string | undefined;
  /** V36 — o documento do registro de pagamento; escopo = a UG do pagamento. */
  readonly pagamentoId?: string | undefined;
  /** V36 — o documento do movimento bancário; ato do ente. */
  readonly movimentoBancarioId?: string | undefined;
  /** V36 — o documento da obra; ato do ente. */
  readonly obraId?: string | undefined;
}

export async function anexarNaTela(
  input: AnexarNaTela
): Promise<{ readonly anexoId: string; readonly sha256: string }> {
  return comEscritaAutenticada("ANEXAR_ARQUIVO", (criadoPor) =>
    anexarArquivo(cliente(), { ...input, criadoPor })
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// V36 — OS DOCUMENTOS DE UM PAGAMENTO E DE UM MOVIMENTO BANCÁRIO
// ═══════════════════════════════════════════════════════════════════════════

export interface DocumentosDoPagamento {
  readonly id: string;
  readonly numero: string;
  readonly data: Date;
  readonly valor: string;
  readonly credorCpfCnpj: string;
  readonly empenhoNumero: string;
  readonly liquidacaoNumero: string;
  readonly unidadeCodigo: string;
  readonly contaBancaria: string;
  readonly anulado: boolean;
  readonly anexos: readonly AnexoNaLista[];
}

/** O pagamento e os anexos dele. A leitura é a da DESPESA na unidade do pagamento; inexistente devolve null. */
export async function lerDocumentosDoPagamento(id: string): Promise<DocumentosDoPagamento | null> {
  const sessao = await exigirLeituraEmAlgumEscopo("CONSULTAR_DESPESA");
  const p = await cliente().pagamento.findUnique({
    where: { id },
    select: {
      id: true, numero: true, data: true, valor: true, contaBancaria: true, estornoDeId: true, anulacaoParcialDeId: true, estornos: { select: { id: true } },
      liquidacao: { select: { numero: true, empenho: { select: { numero: true, credorCpfCnpj: true, ficha: { select: { unidadeOrc: { select: { codigo: true } } } } } } } },
    },
  });
  // Só o pagamento original: a anulação (total ou parcial) é outra linha de Pagamento, e não é registro de pagamento.
  if (p === null || p.estornoDeId !== null || p.anulacaoParcialDeId !== null) return null;
  await autorizarLeituraDoRegistroPara(sessao, "CONSULTAR_DESPESA", p.liquidacao.empenho.ficha.unidadeOrc.codigo);
  return {
    id: p.id, numero: p.numero, data: p.data, valor: p.valor.toFixed(2), credorCpfCnpj: p.liquidacao.empenho.credorCpfCnpj,
    empenhoNumero: p.liquidacao.empenho.numero, liquidacaoNumero: p.liquidacao.numero, unidadeCodigo: p.liquidacao.empenho.ficha.unidadeOrc.codigo,
    contaBancaria: p.contaBancaria, anulado: p.estornos.length > 0,
    anexos: await listarAnexosDoPagamentoOuMovimento(cliente(), { pagamentoId: p.id }, sessao.identificador),
  };
}

export interface DocumentosDoMovimento {
  readonly id: string;
  readonly tipo: string;
  readonly data: Date;
  readonly valor: string;
  readonly historico: string;
  readonly contaBancaria: string;
  readonly anexos: readonly AnexoNaLista[];
}

/** O movimento bancário e os anexos dele. Leitura do financeiro do ente; inexistente devolve null. */
export async function lerDocumentosDoMovimento(id: string): Promise<DocumentosDoMovimento | null> {
  const sessao = await exigirLeituraDoEnte("CONSULTAR_FINANCEIRO");
  const m = await cliente().movimentoBancario.findUnique({
    where: { id },
    select: { id: true, tipo: true, data: true, valor: true, historico: true, contaBancaria: { select: { codigo: true, descricao: true } } },
  });
  if (m === null) return null;
  return {
    id: m.id, tipo: m.tipo, data: m.data, valor: m.valor.toFixed(2), historico: m.historico,
    contaBancaria: `${m.contaBancaria.codigo} — ${m.contaBancaria.descricao}`,
    anexos: await listarAnexosDoPagamentoOuMovimento(cliente(), { movimentoBancarioId: m.id }, sessao.identificador),
  };
}

/** V36 — os anexos de uma obra, para a aba da tela da obra. Leitura de licitações. */
export async function lerAnexosDaObra(obraId: string): Promise<readonly AnexoNaLista[]> {
  const sessao = await exigirLeituraEmAlgumEscopo("CONSULTAR_LICITACOES");
  return listarAnexosDoPagamentoOuMovimento(cliente(), { obraId }, sessao.identificador);
}
