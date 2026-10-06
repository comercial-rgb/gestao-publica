import type { DocumentoPdf, SecaoPdf } from "./documento";
import { formatarMoeda } from "../format/moeda";
import { formatarDocumento } from "../../packages/documento/index.js";
import { diaCivilBr } from "../../packages/datas/index.js";
import {
  gerarDiario,
  gerarRazao,
  lerResponsaveisDosLivros,
  type LancamentoDoDiario,
  type RazaoAnalitico,
  type ResponsaveisDosLivros,
} from "../portas/livros";
import { nomeDoEnteParaDocumentos } from "./ente.js";

/**
 * V36 — O LIVRO DIÁRIO E O RAZÃO EM PDF, COM TERMO DE ABERTURA E TERMO DE ENCERRAMENTO (TR 5.10.1.109 e 5.10.1.110).
 *
 * As telas já mostravam os dois livros; faltava o livro como documento: identificação do ente, período, o
 * conteúdo e os dois termos com quem responde por ele. O conteúdo é o MESMO leitor das telas (`gerarDiario`,
 * `gerarRazao`), sem segunda aritmética; os totais do termo de encerramento vêm do mesmo conjunto impresso.
 *
 * A montagem é PURA (`documentoDoDiario`, `documentoDoRazao`) e testada sem banco; a leitura fica nos `montar*`.
 */

const brl = (v: string): string => formatarMoeda(v).texto;
/** "2026-01-31" -> "31/01/2026": o período chega como dia civil já escolhido na tela. */
const diaDoTexto = (dia: string): string => dia.split("-").reverse().join("/");
const naoCadastrado = (v: string | null, oque: string): string => v ?? `${oque} não cadastrado no cadastro institucional do ente`;

function centavos(v: string): bigint {
  return BigInt(v.replace(".", ""));
}
function emReais(c: bigint): string {
  const neg = c < 0n;
  const s = (neg ? -c : c).toString().padStart(3, "0");
  return `${neg ? "-" : ""}${s.slice(0, -2)}.${s.slice(-2)}`;
}

interface Cabecalho {
  readonly ente: string;
  readonly responsaveis: ResponsaveisDosLivros;
  readonly desde: string;
  readonly ate: string;
}

function termo(titulo: string, texto: string, c: Cabecalho): SecaoPdf {
  return {
    titulo,
    colunas: [{ rotulo: "Campo" }, { rotulo: "Conteúdo" }],
    linhas: [
      ["Texto", texto],
      ["Entidade", c.ente],
      ["CNPJ", c.responsaveis.cnpj === null ? naoCadastrado(null, "CNPJ") : formatarDocumento(c.responsaveis.cnpj)],
      [
        "Responsável pela contabilidade",
        c.responsaveis.nomeContador === null
          ? naoCadastrado(null, "Contador")
          : `${c.responsaveis.nomeContador} — CRC ${naoCadastrado(c.responsaveis.crcContador, "CRC")}`,
      ],
      ["Titular / ordenador", naoCadastrado(c.responsaveis.nomeOrdenador, "Ordenador")],
      ["Assinaturas", "____________________________   ____________________________"],
    ],
  };
}

export function documentoDoDiario(p: Cabecalho & { readonly lancamentos: readonly LancamentoDoDiario[] }): DocumentoPdf {
  const periodo = `${diaDoTexto(p.desde)} a ${diaDoTexto(p.ate)}`;
  let debito = 0n;
  let credito = 0n;
  const linhas: string[][] = [];
  for (const l of p.lancamentos) {
    for (const [i, pt] of l.partidas.entries()) {
      if (pt.tipo === "DEBITO") debito += centavos(pt.valor);
      else credito += centavos(pt.valor);
      linhas.push([
        i === 0 ? diaCivilBr(l.data) : "",
        i === 0 ? l.numeroControle : "",
        i === 0 ? l.historico : "",
        pt.conta,
        pt.tipo === "DEBITO" ? brl(pt.valor) : "",
        pt.tipo === "CREDITO" ? brl(pt.valor) : "",
      ]);
    }
  }
  const primeiro = p.lancamentos[0]?.numeroControle ?? "—";
  const ultimo = p.lancamentos[p.lancamentos.length - 1]?.numeroControle ?? "—";
  return {
    ente: p.ente,
    titulo: "Livro Diário",
    subtitulo: "Lançamentos contábeis em ordem cronológica",
    periodo,
    secoes: [
      termo(
        "Termo de abertura",
        `Este livro contém os lançamentos contábeis de ${p.ente} no período de ${periodo}, em ordem cronológica, e servirá de Livro Diário da entidade.`,
        p
      ),
      {
        titulo: "Lançamentos",
        colunas: [
          { rotulo: "Data" },
          { rotulo: "Nº" },
          { rotulo: "Histórico" },
          { rotulo: "Conta" },
          { rotulo: "Débito", alinhamento: "direita" },
          { rotulo: "Crédito", alinhamento: "direita" },
        ],
        linhas: [...linhas, ["", "", "Totais do período", "", brl(emReais(debito)), brl(emReais(credito))]],
        totais: [linhas.length],
      },
      termo(
        "Termo de encerramento",
        `Este livro encerra ${String(p.lancamentos.length)} lançamento(s), do nº ${primeiro} ao nº ${ultimo}, com débitos de R$ ${brl(emReais(debito))} e créditos de R$ ${brl(emReais(credito))}${debito === credito ? ", iguais" : " — DIFERENTES: confira a consistência do razão antes de assinar"}.`,
        p
      ),
    ],
    notas: ["Conteúdo lido do razão, o mesmo da tela do Livro Diário; valores em R$."],
  };
}

export function documentoDoRazao(p: Cabecalho & { readonly razao: RazaoAnalitico; readonly contaTitulo: string | null }): DocumentoPdf {
  const periodo = `${diaDoTexto(p.desde)} a ${diaDoTexto(p.ate)}`;
  const r = p.razao;
  let debito = 0n;
  let credito = 0n;
  for (const l of r.linhas) {
    debito += centavos(l.debito);
    credito += centavos(l.credito);
  }
  const conta = p.contaTitulo === null ? r.conta : `${r.conta} ${p.contaTitulo}`;
  return {
    ente: p.ente,
    titulo: `Razão — conta ${r.conta}`,
    subtitulo: conta,
    periodo,
    secoes: [
      termo("Termo de abertura", `Este livro contém o razão da conta ${conta} de ${p.ente} no período de ${periodo}.`, p),
      {
        titulo: "Movimentos",
        colunas: [
          { rotulo: "Data" },
          { rotulo: "Nº" },
          { rotulo: "Histórico" },
          { rotulo: "Débito", alinhamento: "direita" },
          { rotulo: "Crédito", alinhamento: "direita" },
          { rotulo: "Saldo", alinhamento: "direita" },
        ],
        linhas: [
          ["", "", "Saldo anterior", "", "", brl(r.saldoAnterior)],
          ...r.linhas.map((l) => [diaCivilBr(l.data), l.numeroControle, l.historico, l.debito === "0.00" ? "" : brl(l.debito), l.credito === "0.00" ? "" : brl(l.credito), brl(l.saldoCorrente)]),
          ["", "", "Totais e saldo final", brl(emReais(debito)), brl(emReais(credito)), brl(r.saldoFinal)],
        ],
        totais: [0, r.linhas.length + 1],
      },
      termo(
        "Termo de encerramento",
        `Este livro encerra ${String(r.linhas.length)} movimento(s) da conta ${r.conta}: saldo anterior R$ ${brl(r.saldoAnterior)}, débitos R$ ${brl(emReais(debito))}, créditos R$ ${brl(emReais(credito))}, saldo final R$ ${brl(r.saldoFinal)}.`,
        p
      ),
    ],
    notas: ["Saldo corrente = débitos menos créditos acumulados (saldo bruto do razão); valores em R$."],
  };
}


export async function montarPdfDiario(p: { readonly desde: Date; readonly ate: Date; readonly desdeStr: string; readonly ateStr: string }): Promise<DocumentoPdf> {
  const [lancamentos, responsaveis, ente] = await Promise.all([gerarDiario({ desde: p.desde, ate: p.ate }), lerResponsaveisDosLivros(), nomeDoEnteParaDocumentos()]);
  return documentoDoDiario({ ente, responsaveis, desde: p.desdeStr, ate: p.ateStr, lancamentos });
}

export async function montarPdfRazao(p: { readonly conta: string; readonly contaTitulo: string | null; readonly desde: Date; readonly ate: Date; readonly desdeStr: string; readonly ateStr: string }): Promise<DocumentoPdf> {
  const [razao, responsaveis, ente] = await Promise.all([gerarRazao({ conta: p.conta, desde: p.desde, ate: p.ate }), lerResponsaveisDosLivros(), nomeDoEnteParaDocumentos()]);
  return documentoDoRazao({ ente, responsaveis, desde: p.desdeStr, ate: p.ateStr, razao, contaTitulo: p.contaTitulo });
}

