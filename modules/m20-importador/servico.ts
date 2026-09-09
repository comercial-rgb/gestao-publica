import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar, pagar } from "../m05-despesa/servico-bloco2.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import type { RoteiroContabil } from "../m05-despesa/dominio.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";
import type { M04Deps } from "../m04-receita/ports.js";
import type { RoteiroContabil as RoteiroReceita } from "../m04-receita/dominio.js";
import {
  previaDaFolha,
  previaDeTributos,
  type MapaColunasFolha,
  type MapaColunasTributos,
} from "./dominio.js";

/**
 * M20 — A CONFIRMAÇÃO DO LOTE. O importador NÃO escreve razão: ele chama os serviços REAIS
 * (`empenhar`/`liquidar`/`pagar` do M05 com retenções do M07; `registrarArrecadacao` do M04). Cada
 * fato nasce pelo mesmo funil de sempre, com a mesma autorização e a mesma trilha — o arquivo só
 * decide QUANTOS e QUAIS.
 *
 * ═══ IDEMPOTÊNCIA PELO HASH DA ORIGEM ═══
 * Reimportar o MESMO arquivo é RECUSA NOMEADA (`ARQUIVO-JA-IMPORTADO`), nunca duplicação silenciosa —
 * a mesma doutrina do extrato bancário (M09).
 *
 * ⚠️ PRÉ-RESOLUÇÃO FAIL-CLOSED. Todas as referências (fichas, fonte, tipos de consignação) são
 * resolvidas ANTES de qualquer escrita: um arquivo que cite ficha inexistente cai sem ter gravado
 * nada. Os serviços do M05/M04 abrem transação POR FATO (é o desenho deles), então o lote não é uma
 * transação única — por isso a validação inteira acontece antes, e o registro da importação só é
 * gravado quando todos os fatos existem.
 */

export class ArquivoJaImportadoError extends Error {
  readonly codigo = "ARQUIVO-JA-IMPORTADO";
  constructor(nome: string, hash: string) {
    super(
      `ARQUIVO-JA-IMPORTADO: "${nome}" (sha256 ${hash.slice(0, 12)}…) já foi importado e confirmado. ` +
        `Reimportar duplicaria os fatos — se o arquivo mudou, o hash muda e a importação passa.`
    );
    this.name = "ArquivoJaImportadoError";
  }
}

export class ImportacaoInvalidaError extends Error {
  readonly codigo = "IMPORTACAO-INVALIDA";
  constructor(quantas: number) {
    super(`IMPORTACAO-INVALIDA: o arquivo tem ${quantas} violação(ões). Corrija a origem — nada foi gravado.`);
    this.name = "ImportacaoInvalidaError";
  }
}

async function exigirArquivoNovo(prisma: PrismaClient, nome: string, hash: string): Promise<void> {
  const ja = await prisma.importacaoArquivo.findUnique({ where: { arquivoHash: hash }, select: { id: true } });
  if (ja !== null) throw new ArquivoJaImportadoError(nome, hash);
}

export interface ResultadoImportacao {
  readonly importacaoId: string;
  readonly correlationId: string;
  readonly linhas: number;
  readonly fatosGerados: number;
}

// ── FOLHA (TR 7.10) ───────────────────────────────────────────────────────────────

export interface ConfirmarFolhaParams {
  readonly nomeArquivo: string;
  readonly conteudo: string;
  readonly exercicio: number;
  readonly dataEmpenho: Date;
  readonly dataLiquidacao: Date;
  readonly dataPagamento: Date;
  /** Código da conta bancária pagadora. */
  readonly contaBancaria: string;
  /** Conta PCASP da disponibilidade (o líquido sai daqui). */
  readonly contaDisponibilidade: string;
  /** tipoCodigo da consignação → conta PCASP do passivo (ex.: ISS → 2.1.8.8.1.02.00). */
  readonly contaConsignacaoPorTipo: Readonly<Record<string, string>>;
  /** CPF/CNPJ sintético do credor da folha (a POC não usa CPF de servidor real). */
  readonly credorCpfCnpj: string;
  readonly criadoPor: string;
  readonly mapa?: MapaColunasFolha;
}

export async function confirmarImportacaoFolha(
  prisma: PrismaClient,
  p: ConfirmarFolhaParams,
  roteiros: { readonly empenho: RoteiroContabil; readonly liquidacao: RoteiroContabil; readonly pagamento: RoteiroContabil },
  deps: M05Deps
): Promise<ResultadoImportacao> {
  await autorizarNo(prisma, p.criadoPor, ACAO_DO_SERVICO.confirmarImportacaoFolha, "ENTE");

  const previa = previaDaFolha(p.nomeArquivo, p.conteudo, p.mapa);
  if (!previa.confirmavel) throw new ImportacaoInvalidaError(previa.violacoes.length);
  await exigirArquivoNovo(prisma, p.nomeArquivo, previa.arquivoHash);

  // ── PRÉ-RESOLUÇÃO fail-closed: nada é gravado antes de tudo existir. ──
  const numeros = [...new Set(previa.linhas.map((l) => l.fichaNumero))];
  const fichas = await prisma.fichaOrcamentaria.findMany({ where: { exercicio: p.exercicio, numero: { in: numeros } }, select: { id: true, numero: true, fonteId: true } });
  const fichaPorNumero = new Map(fichas.map((f) => [f.numero, f]));
  for (const n of numeros) {
    if (!fichaPorNumero.has(n)) throw new Error(`FICHA-INEXISTENTE: a folha cita a ficha ${n} no exercício ${p.exercicio}, que não existe. Nada foi gravado.`);
  }
  const codigosTipo = [...new Set(previa.linhas.flatMap((l) => l.consignacoes.map((c) => c.tipoCodigo)))];
  const tipos = await prisma.tipoConsignacao.findMany({ where: { codigo: { in: codigosTipo } }, select: { id: true, codigo: true } });
  const tipoPorCodigo = new Map(tipos.map((t) => [t.codigo, t]));
  for (const c of codigosTipo) {
    if (!tipoPorCodigo.has(c)) throw new Error(`CONSIGNACAO-INEXISTENTE: a folha cita a consignação "${c}", que não está cadastrada. Nada foi gravado.`);
    if (p.contaConsignacaoPorTipo[c] === undefined) throw new Error(`CONSIGNACAO-SEM-CONTA: a consignação "${c}" não tem conta de passivo configurada. Nada foi gravado.`);
  }

  // ── O LOTE: cada linha vira empenho → liquidação → pagamento (com as suas retenções). ──
  const correlationId = randomUUID();
  let fatos = 0;
  for (const l of previa.linhas) {
    const ficha = fichaPorNumero.get(l.fichaNumero)!;
    const sufixo = `${correlationId.slice(0, 4)}-${l.linha}`;
    const e = await empenhar(
      {
        fichaId: ficha.id, numero: `FL${sufixo}`, tipo: "ORDINARIO", valor: l.valorBruto, data: p.dataEmpenho,
        credorCpfCnpj: p.credorCpfCnpj, historico: `Folha ${p.nomeArquivo} — matricula ${l.matricula} (${l.nome})`,
        categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: p.criadoPor,
      },
      roteiros.empenho, deps
    );
    const liq = await liquidar(
      { empenhoId: e.empenhoId, numero: `FL${sufixo}`, valor: l.valorBruto, data: p.dataLiquidacao, responsavelAtesto: "Importacao de folha", historico: `Folha — matricula ${l.matricula}`, criadoPor: p.criadoPor },
      roteiros.liquidacao, deps
    );
    const retencoes = l.consignacoes.map((c) => ({
      tipoConsignacaoId: tipoPorCodigo.get(c.tipoCodigo)!.id,
      credorConsignatario: c.tipoCodigo,
      valor: c.valor,
      contaConsignacaoAPagar: p.contaConsignacaoPorTipo[c.tipoCodigo]!,
    }));
    await pagar(
      { liquidacaoId: liq.liquidacaoId, numero: `FL${sufixo}`, valor: l.valorBruto, data: p.dataPagamento, contaBancaria: p.contaBancaria, fonteId: ficha.fonteId, historico: `Folha — matricula ${l.matricula}`, criadoPor: p.criadoPor },
      roteiros.pagamento, deps,
      retencoes.length > 0 ? { contaDisponibilidade: p.contaDisponibilidade, retencoes } : undefined
    );
    fatos += 3 + retencoes.length;
  }

  const reg = await prisma.importacaoArquivo.create({
    data: { tipo: "FOLHA", arquivoHash: previa.arquivoHash, nomeArquivo: p.nomeArquivo, linhas: previa.linhas.length, fatosGerados: fatos, correlationId, criadoPor: p.criadoPor },
    select: { id: true },
  });
  return { importacaoId: reg.id, correlationId, linhas: previa.linhas.length, fatosGerados: fatos };
}

// ── TRIBUTOS (TR 7.11/7.19) ───────────────────────────────────────────────────────

export interface ConfirmarTributosParams {
  readonly nomeArquivo: string;
  readonly conteudo: string;
  readonly exercicio: number;
  readonly criadoPor: string;
  readonly mapa?: MapaColunasTributos;
}

export async function confirmarImportacaoTributos(
  prisma: PrismaClient,
  p: ConfirmarTributosParams,
  roteiro: RoteiroReceita,
  deps: M04Deps
): Promise<ResultadoImportacao> {
  await autorizarNo(prisma, p.criadoPor, ACAO_DO_SERVICO.confirmarImportacaoTributos, "ENTE");

  const previa = previaDeTributos(p.nomeArquivo, p.conteudo, p.mapa);
  if (!previa.confirmavel) throw new ImportacaoInvalidaError(previa.violacoes.length);
  await exigirArquivoNovo(prisma, p.nomeArquivo, previa.arquivoHash);

  // Pré-resolução: a classificação (natureza/fonte/CO) tem de existir — o M04 é fail-closed, mas
  // conferir aqui evita gravar metade do lote e cair na linha seguinte.
  const naturezas = [...new Set(previa.linhas.map((l) => l.naturezaCodigo))];
  const achadas = await prisma.naturezaReceita.findMany({ where: { codigo: { in: naturezas } }, select: { codigo: true } });
  const temNatureza = new Set(achadas.map((n) => n.codigo));
  for (const n of naturezas) {
    if (!temNatureza.has(n)) throw new Error(`NATUREZA-INEXISTENTE: o arquivo cita a natureza de receita ${n}, que não existe. Nada foi gravado.`);
  }

  const correlationId = randomUUID();
  let fatos = 0;
  for (const l of previa.linhas) {
    await registrarArrecadacao(
      {
        exercicio: p.exercicio, naturezaReceita: l.naturezaCodigo, fonte: l.fonteCodigo,
        ...(l.coCodigo !== "" ? { co: l.coCodigo } : {}),
        exercicioFonte: 1, valor: l.valor, dataArrecadacao: l.data, numeroReceita: l.guia, criadoPor: p.criadoPor,
      },
      roteiro, deps
    );
    fatos += 1;
  }

  const reg = await prisma.importacaoArquivo.create({
    data: { tipo: "TRIBUTOS", arquivoHash: previa.arquivoHash, nomeArquivo: p.nomeArquivo, linhas: previa.linhas.length, fatosGerados: fatos, correlationId, criadoPor: p.criadoPor },
    select: { id: true },
  });
  return { importacaoId: reg.id, correlationId, linhas: previa.linhas.length, fatosGerados: fatos };
}

// ── HISTÓRICO (leitura) ───────────────────────────────────────────────────────────

export interface ImportacaoNaLista {
  readonly id: string;
  readonly tipo: "FOLHA" | "TRIBUTOS";
  readonly nomeArquivo: string;
  readonly arquivoHash: string;
  readonly linhas: number;
  readonly fatosGerados: number;
  readonly correlationId: string;
  readonly criadoEm: Date;
  readonly criadoPor: string;
}

/** O histórico de importações confirmadas — a trilha (TR 4.12.2). Leitura pura. */
export async function listarImportacoes(prisma: PrismaClient): Promise<ImportacaoNaLista[]> {
  const regs = await prisma.importacaoArquivo.findMany({ orderBy: [{ criadoEm: "desc" }], take: 50 });
  return regs.map((r) => ({
    id: r.id, tipo: r.tipo, nomeArquivo: r.nomeArquivo, arquivoHash: r.arquivoHash,
    linhas: r.linhas, fatosGerados: r.fatosGerados, correlationId: r.correlationId,
    criadoEm: r.criadoEm, criadoPor: r.criadoPor,
  }));
}
