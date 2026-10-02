import { createHash } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { MODALIDADES_PERMITIDAS, MODALIDADES_DO_TRIBUNAL } from "./modalidades-do-tribunal.js";

/**
 * V27 — AS LICITAÇÕES COMO O TCE-PB AS PUBLICA nos dados abertos (`licitacoes-AAAA.csv` por município, em
 * https://dados-abertos.tce.pb.gov.br/). Servem de lista de referência para identificar o processo no Tramita: o
 * operador escolhe a licitação do Tribunal, e o número, a UG, a modalidade e o protocolo vêm dela — nada é redigitado
 * nem casado sozinho com o número do processo interno.
 *
 * O arquivo do Tribunal tem quebra de linha dentro do objeto da licitação: cada registro começa pelo nome do município
 * seguido do código da UG (6 dígitos); a linha que não começa assim continua o registro anterior. As colunas são achadas
 * pelo nome no cabeçalho (o arquivo derivado, só com as colunas do vínculo, também é aceito).
 */

/**
 * O texto da modalidade no arquivo do Tribunal → o código da tabela §6.2 do leiaute. Só os textos medidos no arquivo
 * oficial (Esperança, 2026), cada um a mesma descrição da §6.2 em outra grafia. Texto fora daqui entra sem código, e a
 * identificação a partir dele é recusada nomeando o texto.
 */
export const MODALIDADE_DO_ARQUIVO_DO_TRIBUNAL: Readonly<Record<string, string>> = {
  "Pregão (Lei Nº 14.133/2021)": "24",
  "Dispensa (Lei Nº 14.133/2021)": "21",
  "Inexigibilidade (Lei Nº 14.133/2021)": "22",
  "Concorrência (Lei Nº 14.133/2021)": "23",
  "Credenciamento (Lei Nº 14.133/2021)": "30",
  "Adesão a Ata de Registro de Preços (Lei Nº 14.133/2021)": "35",
};

export interface LicitacaoDoArquivo {
  readonly codUnidadeGestora: string;
  readonly numeroLicitacao: string;
  readonly protocoloTce: string;
  readonly ano: number;
  readonly modalidadeTexto: string;
  readonly modalidadeSagres: string | null;
}

export function lerLicitacoesDoTribunal(conteudo: string): { readonly licitacoes: readonly LicitacaoDoArquivo[]; readonly erros: readonly string[] } {
  const linhas = conteudo.replace(/^﻿/, "").split(/\r?\n/);
  const cabecalho = (linhas.shift() ?? "").split(";").map((c) => c.trim());
  const nomes = ["codigo_unidade_gestora", "numero_licitacao", "numero_protocolo_tce", "ano_licitacao", "modalidade"] as const;
  const idx = nomes.map((n) => cabecalho.indexOf(n));
  const faltam = nomes.filter((_n, k) => (idx[k] ?? -1) < 0);
  if (faltam.length > 0) return { licitacoes: [], erros: [`O arquivo não é o de licitações dos dados abertos do Tribunal: faltam as colunas ${faltam.join(", ")}.`] };
  const primeira = idx[0] ?? 0;
  // Um registro começa quando a coluna da UG traz 6 dígitos na posição dela.
  const comeca = (l: string): boolean => /^\d{6}$/.test((l.split(";")[primeira] ?? "").trim());
  const registros: string[] = [];
  for (const l of linhas) {
    if (comeca(l)) registros.push(l);
    else if (registros.length > 0 && l.trim() !== "") registros[registros.length - 1] += ` ${l}`;
  }
  const erros: string[] = [];
  const vistos = new Map<string, LicitacaoDoArquivo>();
  registros.forEach((r, k) => {
    const c = r.split(";").map((x) => x.trim());
    const [ug, numero, protocolo, ano, modalidade] = idx.map((i) => c[i] ?? "");
    if (!/^\d{5}\/\d{4}$/.test(numero ?? "") || !/^Doc\. \d{1,8}\/\d{2}$/.test(protocolo ?? "") || !/^\d{4}$/.test(ano ?? "")) {
      erros.push(`Registro ${String(k + 1)} (UG ${ug ?? ""}, licitação ${numero ?? ""}): número, protocolo ou ano fora do formato do Tribunal.`);
      return;
    }
    const lic: LicitacaoDoArquivo = { codUnidadeGestora: ug ?? "", numeroLicitacao: numero ?? "", protocoloTce: protocolo ?? "", ano: Number(ano), modalidadeTexto: modalidade ?? "", modalidadeSagres: MODALIDADE_DO_ARQUIVO_DO_TRIBUNAL[modalidade ?? ""] ?? null };
    // O arquivo traz uma linha por proposta: a licitação se repete. Uma por (UG, número, modalidade).
    const chave = `${lic.codUnidadeGestora}|${lic.numeroLicitacao}|${lic.modalidadeTexto}`;
    const ja = vistos.get(chave);
    if (ja !== undefined && ja.protocoloTce !== lic.protocoloTce) {
      erros.push(`A licitação ${lic.numeroLicitacao} da UG ${lic.codUnidadeGestora} aparece com dois protocolos (${ja.protocoloTce} e ${lic.protocoloTce}).`);
      return;
    }
    vistos.set(chave, lic);
  });
  return { licitacoes: [...vistos.values()], erros };
}

/** "00001/2026" → "000012026": o "Número da Licitação" do leiaute (§4.8 e §4.38) tem 9 posições, origem Tramita. */
export function numeroDaLicitacaoNoLeiaute(numero: string): string {
  const m = /^(\d{1,5})\/(\d{4})$/.exec(numero.trim());
  if (m === null) throw new Error(`O número da licitação "${numero}" não está no formato do Tribunal (NNNNN/AAAA).`);
  return `${(m[1] ?? "").padStart(5, "0")}${m[2] ?? ""}`;
}

export const zImportarLicitacoesDoTribunal = z.object({
  conteudo: z.string().min(1, "Escolha o arquivo de licitações do Tribunal."),
  criadoPor: z.string().min(1),
});

export async function importarLicitacoesDoTribunal(prisma: PrismaClient, input: z.input<typeof zImportarLicitacoesDoTribunal>): Promise<{ readonly licitacoes: number; readonly semCodigo: readonly string[] }> {
  const d = zImportarLicitacoesDoTribunal.parse(input);
  const l = lerLicitacoesDoTribunal(d.conteudo);
  if (l.erros.length > 0) throw new Error(`${l.erros.slice(0, 5).join(" ")} Nada foi gravado.`);
  if (l.licitacoes.length === 0) throw new Error("O arquivo não tem nenhuma licitação. Nada foi gravado.");
  const hash = createHash("sha256").update(d.conteudo).digest("hex");
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.importarLicitacoesDoTribunal, "ENTE");
    const ja = await tx.licitacaoNoTribunal.count({ where: { arquivoHash: hash } });
    if (ja > 0) throw new Error("Este arquivo já foi importado (mesmo conteúdo). Nada foi gravado.");
    await tx.licitacaoNoTribunal.createMany({ data: l.licitacoes.map((x) => ({ ...x, arquivoHash: hash, importadoPor: d.criadoPor })) });
    return { licitacoes: l.licitacoes.length, semCodigo: [...new Set(l.licitacoes.filter((x) => x.modalidadeSagres === null).map((x) => x.modalidadeTexto))] };
  });
}

export interface LicitacaoCandidata {
  readonly id: string;
  readonly rotulo: string;
}

/**
 * As licitações do Tribunal que podem ser a deste processo: modalidade compatível com o procedimento do processo, da
 * importação mais recente de cada (UG, número). O operador escolhe; o sistema não casa sozinho.
 */
export async function licitacoesCandidatas(prisma: PrismaClient, processoId: string): Promise<readonly LicitacaoCandidata[]> {
  const p = await prisma.processoLicitatorio.findUnique({ where: { id: processoId }, select: { modalidade: true } });
  if (p === null) return [];
  const permitidas = MODALIDADES_PERMITIDAS[p.modalidade];
  const todas = await prisma.licitacaoNoTribunal.findMany({
    where: { modalidadeSagres: { in: [...permitidas] } },
    orderBy: [{ importadoEm: "desc" }],
    select: { id: true, codUnidadeGestora: true, numeroLicitacao: true, protocoloTce: true, modalidadeSagres: true },
  });
  const vistos = new Set<string>();
  const saida: LicitacaoCandidata[] = [];
  for (const t of todas) {
    const k = `${t.codUnidadeGestora}|${t.numeroLicitacao}|${t.modalidadeSagres ?? ""}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    saida.push({ id: t.id, rotulo: `UG ${t.codUnidadeGestora} · ${t.numeroLicitacao} · ${MODALIDADES_DO_TRIBUNAL[t.modalidadeSagres ?? ""] ?? ""} · ${t.protocoloTce}` });
  }
  return saida.sort((a, b) => a.rotulo.localeCompare(b.rotulo));
}
