import type { DocumentoPdf, SecaoPdf } from "./documento.js";

/**
 * ═══ OS DOCUMENTOS DA EXECUÇÃO DO CONTRATO EM PDF (V7 M2 U4) — a impressão do MANIFESTO gravado no ato ═══
 *
 * ⚠️ MÓDULO PURO. Recebe o manifesto canônico que o ato gravou (ordem de serviço emitida, termo de recebimento
 * provisório, decisão da controvérsia, termo de recebimento definitivo) e o sha256 dele, e devolve o `DocumentoPdf`
 * que o motor existente (`lib/pdf/gerar.ts`) imprime. NADA vem do cadastro vivo: a segunda via é a mesma, e o nome do
 * ente é o que estava no manifesto na emissão.
 *
 * ⚠️ O QUE O DOCUMENTO NÃO É: não é assinatura digital (o rodapé do motor diz isso em toda página), não é nota de
 * empenho nem ordem de pagamento. O sha256 impresso identifica o manifesto; ele não autentica ninguém.
 */

type M = Readonly<Record<string, unknown>>;

const txt = (v: unknown): string => (v === null || v === undefined || v === "" ? "não informado" : String(v));
const obj = (v: unknown): M => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as M) : {});
const lista = (v: unknown): readonly M[] => (Array.isArray(v) ? (v as M[]) : []);
const dataBr = (v: unknown): string => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split("-").reverse().join("/") : txt(v));
const brl = (v: unknown): string => {
  const n = typeof v === "string" ? v : "0.00";
  const [int, dec = "00"] = n.split(".");
  return `R$ ${(int ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec.padEnd(2, "0").slice(0, 2)}`;
};
const qtd = (v: unknown): string => (typeof v === "string" ? v.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "").replace(".", ",") : txt(v));
const pares = (linhas: readonly (readonly [string, string])[]): SecaoPdf => ({ colunas: [{ rotulo: "Campo" }, { rotulo: "Valor" }], linhas: linhas.map(([a, b]) => [a, b]) });

export type TipoDoDocumentoDoContrato = "ordem" | "provisorio" | "decisao" | "definitivo" | "memoria";

export const NOME_DO_TIPO: Readonly<Record<TipoDoDocumentoDoContrato, string>> = {
  ordem: "ordem-de-servico",
  provisorio: "termo-de-recebimento-provisorio",
  decisao: "decisao-de-controversia",
  definitivo: "termo-de-recebimento-definitivo",
  memoria: "memoria-da-medicao",
};

export function documentoDoManifesto(tipo: TipoDoDocumentoDoContrato, manifesto: unknown, sha256: string): DocumentoPdf {
  const m = obj(manifesto);
  const ente = txt(m["ente"]);
  const notaFinal = [
    `Impressão do manifesto gravado no ato (sha256 ${sha256}). Esta via é idêntica a qualquer outra: nada é lido do cadastro atual.`,
    "Documento sem assinatura digital: a identificação do responsável é a designação registrada no sistema.",
  ];
  if (tipo === "memoria") return memoriaDaMedicao(m, ente, notaFinal);
  if (tipo === "ordem") {
    const c = obj(m["contrato"]);
    const o = obj(m["ordem"]);
    const itens = lista(m["itens"]);
    return {
      ente,
      titulo: `ORDEM DE SERVIÇO Nº ${txt(o["numero"])}/${txt(o["ano"])}`,
      subtitulo: `Contrato ${txt(c["numero"])} — ${txt(c["contratado"])} (${txt(c["documentoDoContratado"])})`,
      periodo: `Execução autorizada a partir de ${dataBr(o["inicioAutorizado"])}, prevista até ${dataBr(o["fimPrevisto"])}`,
      secoes: [
        pares([
          ["Finalidade", txt(o["finalidade"])],
          ["Local", txt(o["local"])],
          ["Unidade solicitante", txt(o["unidadeSolicitante"])],
          ["Período previsto", `${dataBr(o["inicioPrevisto"])} a ${dataBr(o["fimPrevisto"])}`],
          ["Emitida em", dataBr(o["emitidaEm"])],
          ["Gestor", `${txt(obj(m["gestor"])["nome"])} — ${txt(obj(m["gestor"])["ato"])}`],
          ["Fiscal", `${txt(obj(m["fiscal"])["nome"])} — ${txt(obj(m["fiscal"])["ato"])}`],
          ["Empenho indicado", txt(m["empenho"])],
          ["Condições de recebimento", txt(o["condicoesDeRecebimento"])],
        ]),
        {
          titulo: "Itens autorizados",
          colunas: [{ rotulo: "Item" }, { rotulo: "Descrição" }, { rotulo: "Unidade" }, { rotulo: "Quantidade", alinhamento: "direita" }, { rotulo: "Unitário", alinhamento: "direita" }, { rotulo: "Valor", alinhamento: "direita" }],
          linhas: [...itens.map((i) => [txt(i["item"]), txt(i["descricao"]), txt(i["unidade"]), qtd(i["quantidade"]), brl(i["valorUnitario"]), brl(i["valor"])]), ["", "Total autorizado", "", "", "", brl(m["total"])]],
          totais: [itens.length],
        },
      ],
      notas: ["A ordem de serviço autoriza a execução; ela não empenha, não recebe nem paga.", ...notaFinal],
    };
  }
  if (tipo === "provisorio" || tipo === "definitivo") {
    const c = obj(m["contrato"]);
    const o = obj(m["ordem"]);
    const med = obj(m["medicao"]);
    const per = obj(med["periodo"]);
    const r = obj(m["responsavel"]);
    const itens = lista(m["itens"]);
    const cabecalho = pares([
      ["Contrato", `${txt(c["numero"])} — ${txt(c["contratado"])} (${txt(c["documentoDoContratado"])})`],
      ["Ordem de serviço", `${txt(o["numero"])}/${txt(o["ano"])}`],
      ["Medição", `nº ${txt(med["numero"])}, de ${dataBr(per["inicio"])} a ${dataBr(per["fim"])}`],
      ["Data do recebimento", dataBr(m["data"])],
      ["Responsável", `${txt(r["nome"])} — ${txt(r["ato"])}`],
      ["Fundamento", txt(m["fundamento"])],
    ]);
    if (tipo === "provisorio") {
      const v = obj(m["valores"]);
      return {
        ente,
        titulo: "TERMO DE RECEBIMENTO PROVISÓRIO",
        subtitulo: `Contrato ${txt(c["numero"])} — ordem de serviço nº ${txt(o["numero"])}/${txt(o["ano"])} — medição nº ${txt(med["numero"])}`,
        periodo: `Recebido provisoriamente em ${dataBr(m["data"])}`,
        secoes: [
          cabecalho,
          pares([["Verificações", txt(m["verificacoes"])], ["Condições de recebimento da ordem", txt(o["condicoesDeRecebimento"])]]),
          {
            titulo: "Conferência por item",
            colunas: [{ rotulo: "Item" }, { rotulo: "Descrição" }, { rotulo: "Unidade" }, { rotulo: "Medido", alinhamento: "direita" }, { rotulo: "Conforme", alinhamento: "direita" }, { rotulo: "Em controvérsia", alinhamento: "direita" }, { rotulo: "Motivo da controvérsia" }],
            linhas: itens.map((i) => [txt(i["item"]), txt(i["descricao"]), txt(i["unidade"]), qtd(i["medido"]), qtd(i["conforme"]), qtd(i["emControversia"]), i["motivo"] === null ? "—" : txt(i["motivo"])]),
          },
          { titulo: "Valores", colunas: [{ rotulo: "Grandeza" }, { rotulo: "Valor", alinhamento: "direita" }], linhas: [["Conforme", brl(v["conforme"])], ["Em controvérsia (aguarda decisão)", brl(v["emControversia"])]] },
        ],
        notas: ["O recebimento provisório não aceita o objeto em definitivo nem autoriza a liquidação. A controvérsia não é glosa, retenção nem multa.", ...notaFinal],
      };
    }
    const pendencias = Array.isArray(m["pendencias"]) ? (m["pendencias"] as unknown[]).map(txt) : [];
    return {
      ente,
      titulo: `TERMO DE RECEBIMENTO DEFINITIVO Nº ${txt(m["recebimento"])}`,
      subtitulo: `Contrato ${txt(c["numero"])} — ordem de serviço nº ${txt(o["numero"])}/${txt(o["ano"])} — medição nº ${txt(med["numero"])}`,
      periodo: `Recebido definitivamente em ${dataBr(m["data"])}`,
      secoes: [
        cabecalho,
        pares([["Conclusão", txt(m["conclusao"])]]),
        {
          titulo: "Parcela recebida",
          colunas: [{ rotulo: "Item" }, { rotulo: "Descrição" }, { rotulo: "Unidade" }, { rotulo: "Quantidade", alinhamento: "direita" }, { rotulo: "Unitário", alinhamento: "direita" }, { rotulo: "Valor", alinhamento: "direita" }],
          linhas: [...itens.map((i) => [txt(i["item"]), txt(i["descricao"]), txt(i["unidade"]), qtd(i["quantidade"]), brl(i["valorUnitario"]), brl(i["valor"])]), ["", "Total recebido", "", "", "", brl(m["valor"])]],
          totais: [itens.length],
        },
        { titulo: "Pendências desta medição no momento do termo", colunas: [{ rotulo: "Pendência" }], linhas: pendencias.length === 0 ? [["Nenhuma."]] : pendencias.map((p) => [p]) },
      ],
      notas: ["O recebimento definitivo não liquida nem paga: a liquidação é ato da despesa, sobre a parcela recebida.", ...notaFinal],
    };
  }
  const it = obj(m["item"]);
  const o = obj(m["ordem"]);
  const r = obj(m["responsavel"]);
  const aceita = m["resultado"] === "ACEITA";
  return {
    ente,
    titulo: aceita ? "DECISÃO DE ACEITAÇÃO DE QUANTIDADE EM CONTROVÉRSIA" : "TERMO DE RECUSA",
    subtitulo: `Contrato ${txt(m["contrato"])} — ordem de serviço nº ${txt(o["numero"])}/${txt(o["ano"])} — medição nº ${txt(m["medicao"])}`,
    periodo: `Decidido em ${dataBr(m["data"])}`,
    secoes: [
      pares([
        ["Item", `${txt(it["numero"])} — ${txt(it["descricao"])}`],
        ["Quantidade", `${qtd(it["quantidade"])} ${txt(it["unidade"])}`],
        ["Valor", brl(it["valor"])],
        ["Motivo da controvérsia", txt(it["motivoDaControversia"])],
        ["Resultado", aceita ? "Aceita: a quantidade fica elegível ao recebimento definitivo do complemento." : "Rejeitada: glosa confirmada; a quantidade não se recebe."],
        ["Fundamento da decisão", txt(m["fundamentoDaDecisao"])],
        ["Responsável", `${txt(r["nome"])} — ${txt(r["ato"])}`],
        ["Fundamento legal", txt(m["fundamento"])],
      ]),
    ],
    notas: [aceita ? "Aceitar não recebe: o recebimento definitivo do complemento é outro ato." : "A recusa não é multa nem retenção; a liberação de saldo depende de ato próprio.", ...notaFinal],
  };
}

/**
 * V7 M2 U7 — A MEMÓRIA DA MEDIÇÃO PELA PLANILHA. Duas grandezas lado a lado e nunca misturadas: o valor NO CONTRATO
 * (quantidade × unitário vigente do item — é o que se recebe e liquida) e o valor NA PLANILHA (quantidade × preço da versão
 * — referência de orçamento). Nenhum fator entre elas é calculado aqui.
 */
function memoriaDaMedicao(m: M, ente: string, notaFinal: readonly string[]): DocumentoPdf {
  const c = obj(m["contrato"]);
  const o = obj(m["ordem"]);
  const ob = obj(m["obra"]);
  const pl = obj(m["planilha"]);
  const med = obj(m["medicao"]);
  const per = obj(med["periodo"]);
  const r = obj(m["responsavel"]);
  const t = obj(m["totais"]);
  const itens = lista(m["itens"]);
  const evidencias = lista(m["evidencias"]);
  return {
    ente,
    titulo: `MEMÓRIA DA MEDIÇÃO Nº ${txt(med["numero"])} DA ORDEM DE SERVIÇO Nº ${txt(o["numero"])}/${txt(o["ano"])}`,
    subtitulo: `Contrato ${txt(c["numero"])} — ${txt(c["contratado"])} (${txt(c["documentoDoContratado"])}) — obra ${txt(ob["identificador"])}`,
    periodo: `Período medido de ${dataBr(per["inicio"])} a ${dataBr(per["fim"])}`,
    secoes: [
      pares([
        ["Obra", `${txt(ob["identificador"])} — ${txt(ob["descricao"])}`],
        ["Planilha orçamentária", `versão ${txt(pl["versao"])} — ${txt(pl["descricao"])}, vale desde ${dataBr(pl["vigenciaInicio"])}`],
        ["Data-base e referência de preços", `${dataBr(pl["dataBaseDosPrecos"])} — ${txt(pl["referenciaDePrecos"])}`],
        ["Identidade da versão", `sha256 ${txt(pl["sha256"])}`],
        ["Finalidade da ordem", txt(o["finalidade"])],
        ["Registrada em", dataBr(med["registradaEm"])],
        ["Responsável", `${txt(r["nome"])} — ${txt(r["ato"])}`],
        ["Observação", txt(m["observacao"])],
        ["Arredondamento", txt(m["arredondamento"])],
      ]),
      {
        titulo: "Quantidades por serviço da planilha",
        colunas: [{ rotulo: "Serviço" }, { rotulo: "Descrição" }, { rotulo: "Unidade" }, { rotulo: "Previsto na versão", alinhamento: "direita" }, { rotulo: "Anterior na obra", alinhamento: "direita" }, { rotulo: "Esta medição", alinhamento: "direita" }, { rotulo: "Acumulado", alinhamento: "direita" }, { rotulo: "Saldo na planilha", alinhamento: "direita" }],
        linhas: itens.map((i) => [txt(i["codigo"]), txt(i["descricao"]), txt(i["unidade"]), qtd(i["previstoNaVersao"]), qtd(i["anteriorNaObra"]), qtd(i["atual"]), qtd(i["acumulado"]), qtd(i["saldoNaPlanilha"])]),
      },
      {
        titulo: "Valores: contrato e planilha lado a lado",
        colunas: [{ rotulo: "Serviço" }, { rotulo: "Item do contrato" }, { rotulo: "Unitário do contrato", alinhamento: "direita" }, { rotulo: "Valor no contrato", alinhamento: "direita" }, { rotulo: "Preço da planilha", alinhamento: "direita" }, { rotulo: "Valor na planilha", alinhamento: "direita" }, { rotulo: "A executar na ordem", alinhamento: "direita" }],
        linhas: [
          ...itens.map((i) => {
            const ic = obj(i["itemDoContrato"]);
            return [txt(i["codigo"]), `${txt(ic["numero"])} — ${txt(ic["descricao"])} (${txt(ic["unidade"])})`, brl(i["unitarioDoContrato"]), brl(i["valorNoContrato"]), brl(i["precoDaPlanilha"]), brl(i["valorNaPlanilha"]), qtd(i["aExecutarNaOrdem"])];
          }),
          ["", "Total", "", brl(t["contrato"]), "", brl(t["planilha"]), ""],
        ],
        totais: [itens.length],
      },
      { titulo: "Vínculos usados (serviço da planilha ao item do contrato)", colunas: [{ rotulo: "Serviço" }, { rotulo: "Motivo do vínculo" }], linhas: itens.map((i) => [txt(i["codigo"]), txt(obj(i["vinculo"])["motivo"])]) },
      { titulo: "Evidências", colunas: [{ rotulo: "Arquivo" }, { rotulo: "sha256" }], linhas: evidencias.length === 0 ? [["Nenhuma evidência anexada.", ""]] : evidencias.map((e) => [txt(e["nome"]), txt(e["sha256"])]) },
    ],
    notas: [
      "A medição não recebe, não liquida e não paga: o recebimento provisório e o definitivo são atos seguintes, e a liquidação usa o valor no contrato da parcela recebida.",
      "Nova versão da planilha ou aditivo posterior não altera esta memória.",
      ...notaFinal,
    ],
  };
}
