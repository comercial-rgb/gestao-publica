import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type { ValidateFunction } from "ajv";

/**
 * CONTRATO da API de CONSULTA do TCE-PB (M19, S4). Fonte: `openapi-sagrescaptura.json` (Swagger 2.0,
 * sha256 no MANIFEST). O RECORTE da POC são as rotas que sustentam a comparação "dados locais × TCE":
 *
 *   RECORTE (3 de 32) — a cadeia da massa POC, cada uma com DONO LOCAL:
 *     · GET /api/v1/dotacoes   (filtro codUnidadeGestora + exercicio)      — dono: FichaOrcamentaria/DotacaoFato
 *     · GET /api/v1/empenhos    (filtro codUnidadeGestora + dataMin/Max)   — dono: Empenho/EmpenhoFato
 *     · GET /api/v1/pagamentos  (filtro codUnidadeGestora + dataMin/Max)   — dono: Pagamento (sem exporter próprio)
 *
 * As outras 29 rotas ficam **versionadas, não implementadas** (matriz no MODULO). O escopo é a demo.
 *
 * ⚠️ O CONTRATO MANDA, a fixture obedece (DIRETIVA §3): as fixtures do MOCK são VALIDADAS contra o
 * schema de RESPOSTA aqui — uma fixture que viola o contrato NÃO passa no teste. Nada inventado.
 */

export type RotaTce = "dotacoes" | "empenhos" | "pagamentos";

interface DefRota {
  readonly path: string;
  readonly metodo: string;
  readonly params: readonly { readonly name: string; readonly required: boolean }[];
  readonly respostaItem: object;
}

export const ROTAS_TCE: readonly RotaTce[] = ["dotacoes", "empenhos", "pagamentos"];

// ⚠️ LAZY (como o M18): ler o JSON e montar o ajv são I/O — no carregamento do módulo, o `next build`
// tropeçaria. Tudo na 1ª chamada, cacheado.
let _schemas: Record<RotaTce, DefRota> | null = null;
function schemas(): Record<RotaTce, DefRota> {
  if (_schemas === null) {
    _schemas = JSON.parse(readFileSync(fileURLToPath(new URL("./schemas-consulta-2026.json", import.meta.url)), "utf8")) as Record<RotaTce, DefRota>;
  }
  return _schemas;
}

export function defDaRota(rota: RotaTce): DefRota {
  return schemas()[rota];
}

// ajv (base — os schemas do Swagger 2.0 são draft-04-ish; strict:false + sem validação de format).
let ajvSingleton: { compile(s: object): ValidateFunction } | null = null;
const compilados = new Map<RotaTce, ValidateFunction>();

function validadorDe(rota: RotaTce): ValidateFunction {
  if (ajvSingleton === null) {
    const requireCjs = createRequire(import.meta.url);
    const Ajv = (requireCjs("ajv") as { default: new (o?: object) => { compile(s: object): ValidateFunction } }).default;
    ajvSingleton = new Ajv({ allErrors: true, strict: false, validateFormats: false });
  }
  const cache = compilados.get(rota);
  if (cache !== undefined) return cache;
  const v = ajvSingleton.compile(defDaRota(rota).respostaItem);
  compilados.set(rota, v);
  return v;
}

export interface ViolacaoContratoTce {
  readonly rota: RotaTce;
  readonly indice: number;
  readonly campo: string;
  readonly regra: string;
  readonly detalhe: string;
}

/** Valida uma lista de registros de RESPOSTA contra o schema oficial da rota. Vazio = conformes. */
export function validarRespostaTce(rota: RotaTce, registros: readonly unknown[]): ViolacaoContratoTce[] {
  const validate = validadorDe(rota);
  const out: ViolacaoContratoTce[] = [];
  registros.forEach((r, i) => {
    if (validate(r)) return;
    for (const e of validate.errors ?? []) {
      const faltante = (e.params as { missingProperty?: string }).missingProperty;
      const campo = e.keyword === "required" && faltante !== undefined ? `${e.instancePath}/${faltante}` : e.instancePath === "" ? "/" : e.instancePath;
      out.push({ rota, indice: i, campo, regra: e.keyword, detalhe: e.message ?? "inválido" });
    }
  });
  return out;
}
