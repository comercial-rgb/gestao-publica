import { desmascararValor } from "../../../../lib/format/mascaras";
import type { DadosFiscaisDaOperacao } from "../../../../lib/portas/retencao-calculada";
import { Decimal } from "../../../../packages/contracts/index";

/**
 * V24 — LEITURA DOS DADOS FISCAIS DA OPERAÇÃO, comum ao pagamento e à prévia. Não é Server Action: só
 * traduz o FormData nos tipos da porta.
 */
const MODALIDADES = ["CESSAO_DE_MAO_DE_OBRA", "EMPREITADA_PARCIAL", "EMPREITADA_TOTAL"] as const;
const ENQUADRAMENTOS = ["VALOR_BRUTO", "MATERIAIS_DISCRIMINADOS", "PREVISTO_SEM_VALOR_NO_CONTRATO", "EQUIPAMENTO_INERENTE_SEM_DISCRIMINACAO"] as const;
const TRIBUTOS = ["IRRF", "INSS", "ISS"] as const;

const texto = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();
const dinheiro = (f: FormData, k: string): string => desmascararValor(texto(f, k));

/**
 * Os dados fiscais da operação, do formulário para a porta. Só LÊ e recusa o que não é número; as
 * regras (o que se retém, de quem, quanto) são do M07, e a mensagem dele sobe como veio.
 */
export function lerOperacaoFiscal(f: FormData, valorDoPagamento: string): DadosFiscaisDaOperacao | string {
  const numero = (s: string, rotulo: string): Decimal | string => {
    if (s === "") return new Decimal(0);
    try {
      const d = new Decimal(s);
      return d.isNegative() ? `${rotulo} não pode ser negativo.` : d;
    } catch {
      return `${rotulo}: valor inválido.`;
    }
  };
  const docBruto = dinheiro(f, "rcValorDocumento");
  const doc = numero(docBruto === "" ? valorDoPagamento : docBruto, "O valor do documento fiscal");
  const materiais = numero(dinheiro(f, "rcInssMateriais"), "O valor dos materiais");
  const deducoes = numero(dinheiro(f, "rcInssDeducoes"), "O valor das deduções");
  for (const v of [doc, materiais, deducoes]) if (typeof v === "string") return v;

  const modalidade = texto(f, "rcInssModalidade");
  const enquadramento = texto(f, "rcInssEnquadramento") || "VALOR_BRUTO";
  if (modalidade !== "" && !(MODALIDADES as readonly string[]).includes(modalidade)) return "Modalidade de contratação inválida.";
  if (!(ENQUADRAMENTOS as readonly string[]).includes(enquadramento)) return "Enquadramento da base do INSS inválido.";
  const dispensa = texto(f, "rcInssDispensa");
  if (dispensa !== "" && dispensa !== "II" && dispensa !== "III") return "Dispensa do INSS inválida.";

  const municipio = texto(f, "rcIssMunicipio");
  if (municipio !== "" && !/^\d{7}$/.test(municipio)) return "O município da prestação é o código IBGE de 7 dígitos.";
  const aliqBruta = texto(f, "rcIssAliquotaSimples").replace("%", "").replace(",", ".");
  let aliquotaDoSimples: Decimal | null = null;
  if (aliqBruta !== "") {
    try {
      aliquotaDoSimples = new Decimal(aliqBruta).dividedBy(100);
    } catch {
      return "A alíquota do ISS declarada no documento é um percentual, como 2,01.";
    }
  }

  const informados: Partial<Record<(typeof TRIBUTOS)[number], { valor: Decimal; justificativa: string }>> = {};
  for (const t of TRIBUTOS) {
    const v = dinheiro(f, `rcInformado${t}`);
    const j = texto(f, `rcJustificativa${t}`);
    if (v === "" && j === "") continue;
    if (v === "" || j === "") return `Para informar o ${t}, preencha o valor e a justificativa.`;
    const d = numero(v, `O valor informado do ${t}`);
    if (typeof d === "string") return d;
    informados[t] = { valor: d, justificativa: j };
  }

  return {
    valorDoDocumentoFiscal: doc as Decimal,
    pagamentoComGlosa: f.get("rcGlosa") === "on",
    naturezaIR: texto(f, "rcNaturezaIR") || null,
    inss: {
      servico: texto(f, "rcInssServico") || null,
      modalidade: modalidade === "" ? null : (modalidade as (typeof MODALIDADES)[number]),
      enquadramento: enquadramento as (typeof ENQUADRAMENTOS)[number],
      valorMateriais: materiais as Decimal,
      baseMinima: texto(f, "rcInssBaseMinima") || null,
      deducoes: deducoes as Decimal,
      dispensa: dispensa === "" ? null : { inciso: dispensa, declaracao: texto(f, "rcInssDeclaracao") || "declaração não identificada" },
    },
    iss: {
      subitem: texto(f, "rcIssSubitem").split(" ")[0] || null,
      municipioDaPrestacao: municipio === "" ? null : municipio,
      aliquotaDoSimplesNoDocumento: aliquotaDoSimples,
    },
    informados,
  };
}

