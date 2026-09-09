import { createRequire } from "node:module";
import type { ValidateFunction } from "ajv";
// ⚠️ IMPORT ESTÁTICO DO JSON, e não `readFileSync` do disco — ver o comentário de `obterMotor`.
import schemasOficiais from "./schemas-captura-2026.json" with { type: "json" };
import {
  cadastroContaParaCaptura,
  dotacaoParaCaptura,
  empenhoParaCaptura,
  liquidacaoParaCaptura,
  movimentacaoParaCaptura,
  saldoMensalParaCaptura,
} from "./dto-captura.js";
import type {
  CadastroContaFato,
  DotacaoFato,
  EmpenhoFato,
  LiquidacaoFato,
  MovimentacaoFato,
  SaldoMensalFato,
} from "../sagres/index.js";

/**
 * VALIDAÇÃO CAPTURA 2.0 (F2) — contra os JSON Schemas OFICIAIS (draft 2020-12), com `ajv` (já no
 * stack — sem dependência nova). Cada violação nomeia a entidade, o elemento (índice), o campo e a
 * REGRA DO SCHEMA que quebrou (required/minLength/pattern/enum/type…). Nada de contrato inventado: o
 * que valida é o schema baixado do TCE (PATCH §4 / DIRETIVA §2).
 */

/** As 6 entidades que a S1 já produz como DTO — cada uma amarra o schema OFICIAL ao seu mapeador. */
export const ENTIDADES_CAPTURA = {
  dotacao: { titulo: "Lista de Dotações", mapear: (f: DotacaoFato) => dotacaoParaCaptura(f) },
  empenhos: { titulo: "Empenhos", mapear: (f: EmpenhoFato) => empenhoParaCaptura(f) },
  liquidacao: { titulo: "Liquidações", mapear: (f: LiquidacaoFato) => liquidacaoParaCaptura(f) },
  cadastroConta: { titulo: "Conta Bancária", mapear: (f: CadastroContaFato) => cadastroContaParaCaptura(f) },
  saldoMensal: { titulo: "Lista de Saldos Mensais", mapear: (f: SaldoMensalFato) => saldoMensalParaCaptura(f) },
  movimentacao: { titulo: "Lista de Transferências Bancárias", mapear: (f: MovimentacaoFato) => movimentacaoParaCaptura(f) },
} as const;

export type EntidadeCaptura = keyof typeof ENTIDADES_CAPTURA;

export interface ViolacaoCaptura {
  readonly entidade: EntidadeCaptura;
  /** Caminho do campo dentro do envelope (ex.: "/elementos/0/cpfOrdenador"). Vazio = raiz. */
  readonly campo: string;
  /** A palavra-chave do JSON Schema que falhou (required, minLength, pattern, enum, type…). */
  readonly regra: string;
  readonly detalhe: string;
}

// ⚠️ INICIALIZAÇÃO LAZY. Ler o JSON + montar o ajv são efeitos de I/O — se rodassem no CARREGAMENTO
// do módulo, o `next build` (que importa a página → porta → aqui só para coletar dados) tropeçaria.
// Fazemos tudo na 1ª validação (request time), e cacheamos.
interface Motor {
  readonly schemas: Record<string, unknown>;
  readonly ajv: { compile(s: object): ValidateFunction };
  readonly compilados: Map<EntidadeCaptura, ValidateFunction>;
}
let motor: Motor | null = null;

/**
 * ⚠️ OS SCHEMAS ENTRAM POR IMPORT ESTÁTICO — e isto é uma correção de DEFEITO DE PRODUÇÃO, não estilo.
 *
 * Antes, o motor lia o arquivo do disco:
 *   `readFileSync(fileURLToPath(new URL("./schemas-captura-2026.json", import.meta.url)))`
 *
 * Isso funciona sob `tsx`/Node — e é por isso que TODA a suíte passava —, mas MORRE no build de
 * produção do Next. Duas razões somadas: (a) o webpack transforma o JSON num *asset module* com
 * nome hasheado (`static/media/schemas-captura-2026.<hash>.json`), então o caminho relativo ao
 * módulo já não aponta para arquivo nenhum; e (b) `import.meta.url` é shimado no bundle, e o
 * `fileURLToPath` recebia um objeto URL que não era `URL` nativo, estourando
 * "The 'path' argument must be of type string or an instance of URL".
 *
 * O sintoma era a tela `/integracoes/captura` inteira caindo em "Não foi possível gerar a prévia" —
 * sem JSON, sem botão de simular, sem linha do tempo. Invisível para os testes, fatal para quem
 * abrisse a tela no ambiente compilado.
 *
 * Com o import estático, o bundler EMBUTE o JSON no chunk e o Node o resolve nativamente pelo
 * atributo `with { type: "json" }`. Some o I/O de runtime, some a dependência de layout de arquivos,
 * e os dois ambientes passam a carregar exatamente os mesmos bytes.
 */
function obterMotor(): Motor {
  if (motor !== null) return motor;
  const schemas = schemasOficiais as Record<string, unknown>;
  // ajv 8 é CommonJS; o build 2020 (draft 2020-12) entra por `createRequire` (o default-export não
  // tipa como construtor sob NodeNext) — padrão limpo para o stack.
  const requireCjs = createRequire(import.meta.url);
  const Ajv2020 = (requireCjs("ajv/dist/2020.js") as { default: new (o?: object) => { compile(s: object): ValidateFunction } }).default;
  motor = { schemas, ajv: new Ajv2020({ allErrors: true, strict: false }), compilados: new Map() };
  return motor;
}

/**
 * QUANTOS SCHEMAS OFICIAIS o repositório carrega — CONTADO do arquivo, nunca escrito à mão.
 *
 * ⚠️ A tela afirma este número à Comissão do TCE. Um literal `41` no JSX seria uma afirmação que
 * o código não sustenta: no dia em que o TCE publicar a 42ª entidade e alguém atualizar o JSON, a
 * tela continuaria dizendo 41 — e a demonstração passaria a mentir sem ninguém notar. Contando as
 * chaves do próprio arquivo, a tela não tem como divergir da fonte.
 */
export function totalDeSchemasOficiais(): number {
  return Object.keys(obterMotor().schemas).length;
}

function validador(entidade: EntidadeCaptura): ValidateFunction {
  const m = obterMotor();
  const cache = m.compilados.get(entidade);
  if (cache !== undefined) return cache;
  const titulo = ENTIDADES_CAPTURA[entidade].titulo;
  const schema = m.schemas[titulo];
  if (schema === undefined) throw new Error(`CAPTURA — schema oficial "${titulo}" ausente em schemas-captura-2026.json.`);
  const v = m.ajv.compile(schema as object);
  m.compilados.set(entidade, v);
  return v;
}

/** Valida um envelope Captura 2.0 contra o schema OFICIAL da entidade. Devolve as violações nomeadas. */
export function validarEnvelopeCaptura(entidade: EntidadeCaptura, envelope: unknown): ViolacaoCaptura[] {
  const validate = validador(entidade);
  if (validate(envelope)) return [];
  return (validate.errors ?? []).map((e) => {
    // Em `required`, o campo que falta vive em params.missingProperty (não no instancePath).
    const faltante = (e.params as { missingProperty?: string }).missingProperty;
    const campo = e.keyword === "required" && faltante !== undefined ? `${e.instancePath}/${faltante}` : e.instancePath === "" ? "/" : e.instancePath;
    return { entidade, campo, regra: e.keyword, detalhe: e.message ?? "inválido" };
  });
}
