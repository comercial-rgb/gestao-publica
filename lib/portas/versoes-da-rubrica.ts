import { Decimal } from "../../packages/contracts/index.js";
import { diaCivilBr } from "../../packages/datas/index.js";
import { VARIAVEIS_DO_CONTRACHEQUE, PREFIXO_DE_RUBRICA } from "../../modules/m33-folha/rubrica-versionada.js";
import { aprovarVersaoDaRubrica, criarVersaoDaRubrica, revogarVersaoDaRubrica } from "../../modules/m33-folha/versao-servico.js";
import { comEscritaAutenticada } from "./sessao";
import { acoesPermitidas } from "./molde";
import { cliente } from "./cliente";

/**
 * ═══ A PORTA DAS VERSÕES DA RUBRICA (V11 V1.1) ═══
 *
 * ⚠️ NENHUMA REGRA AQUI. Grafo, ciclo, vigência, regime aplicável, segregação entre quem escreve
 * e quem aprova e o congelamento do conteúdo são do domínio
 * (`modules/m33-folha/rubrica-versionada.ts` e `versao-servico.ts`). Esta porta só traduz campos
 * de formulário e devolve texto de tela.
 *
 * ⚠️ AS TRÊS ESCRITAS PASSAM POR `comEscritaAutenticada`, que é o funil onde moram a sessão, a
 * autorização por ação nomeada e o gate de módulo comercial (M35). Chamar o serviço direto daqui
 * pularia os três de uma vez.
 */

type Campos = Readonly<Record<string, string>>;
const t = (c: Campos, k: string): string => (c[k] ?? "").trim();

export interface VersaoNaTela {
  readonly id: string;
  readonly versao: number;
  readonly vigencia: string;
  readonly situacao: string;
  readonly formula: string | null;
  readonly percentual: string | null;
  readonly regime: string;
  readonly incidencias: string;
  readonly casasDecimais: number;
  readonly fundamentacaoLegal: string;
  readonly dependencias: readonly string[];
  readonly autoria: string;
  readonly podeAprovar: boolean;
  readonly podeRevogar: boolean;
}

export interface PainelDeVersoes {
  readonly rubricaId: string;
  readonly codigo: string;
  readonly descricao: string;
  readonly natureza: string;
  readonly ehFormula: boolean;
  readonly podeCriar: boolean;
  readonly versoes: readonly VersaoNaTela[];
  /** O universo fechado, mostrado na tela: quem escreve a fórmula precisa saber o que existe. */
  readonly variaveis: readonly { readonly nome: string; readonly explicacao: string }[];
  /** Os códigos das outras rubricas, para citar com o prefixo. */
  readonly rubricasCitaveis: readonly string[];
  readonly prefixo: string;
}

export async function painelDeVersoes(rubricaId: string): Promise<PainelDeVersoes | null> {
  const prisma = cliente();
  const [r, outras, permitidas] = await Promise.all([
    prisma.rubrica.findUnique({
      where: { id: rubricaId },
      select: {
        id: true, codigo: true, descricao: true, natureza: true,
        versoes: {
          orderBy: { versao: "desc" },
          select: {
            id: true, versao: true, competenciaInicio: true, competenciaFim: true, formula: true,
            percentual: true, incideContribuicao: true, incideIrrf: true, proporcionalAosDias: true,
            casasDecimais: true, regime: true, fundamentacaoLegal: true, situacao: true,
            criadoPor: true, criadoEm: true, aprovadoPor: true, aprovadoEm: true,
            revogadoPor: true, revogadoEm: true, motivoDaRevogacao: true,
            dependencias: { select: { codigoDaDependencia: true }, orderBy: { codigoDaDependencia: "asc" } },
          },
        },
      },
    }),
    prisma.rubrica.findMany({ where: { id: { not: rubricaId } }, select: { codigo: true }, orderBy: { codigo: "asc" } }),
    acoesPermitidas(["CADASTRAR_VERSAO_DE_RUBRICA", "APROVAR_VERSAO_DE_RUBRICA", "REVOGAR_VERSAO_DE_RUBRICA"]),
  ]);
  if (r === null) return null;

  return {
    rubricaId: r.id,
    codigo: r.codigo,
    descricao: r.descricao,
    natureza: r.natureza,
    ehFormula: r.natureza === "FORMULA",
    podeCriar: permitidas.has("CADASTRAR_VERSAO_DE_RUBRICA"),
    variaveis: Object.entries(VARIAVEIS_DO_CONTRACHEQUE).map(([nome, explicacao]) => ({ nome, explicacao })).sort((a, b) => a.nome.localeCompare(b.nome)),
    rubricasCitaveis: outras.map((o) => o.codigo),
    prefixo: PREFIXO_DE_RUBRICA,
    versoes: r.versoes.map((v) => ({
      id: v.id,
      versao: v.versao,
      vigencia: v.competenciaFim === null ? `de ${v.competenciaInicio} (aberta)` : `de ${v.competenciaInicio} a ${v.competenciaFim}`,
      situacao: v.situacao,
      formula: v.formula,
      percentual: v.percentual === null ? null : `${new Decimal(v.percentual).times(100).toFixed(2)}%`,
      regime: v.regime,
      incidencias: [
        v.incideContribuicao ? "compõe base de contribuição" : "fora da base de contribuição",
        v.incideIrrf ? "compõe base de IRRF" : "fora da base de IRRF",
        v.proporcionalAosDias ? "proporcional aos dias" : "valor cheio",
      ].join("; "),
      casasDecimais: v.casasDecimais,
      fundamentacaoLegal: v.fundamentacaoLegal,
      dependencias: v.dependencias.map((d) => d.codigoDaDependencia),
      autoria:
        v.situacao === "REVOGADA" && v.revogadoPor !== null && v.revogadoEm !== null
          ? `escrita por ${v.criadoPor} em ${diaCivilBr(v.criadoEm)}; revogada por ${v.revogadoPor} em ${diaCivilBr(v.revogadoEm)} — ${v.motivoDaRevogacao ?? ""}`
          : v.aprovadoPor !== null && v.aprovadoEm !== null
            ? `escrita por ${v.criadoPor} em ${diaCivilBr(v.criadoEm)}; aprovada por ${v.aprovadoPor} em ${diaCivilBr(v.aprovadoEm)}`
            : `escrita por ${v.criadoPor} em ${diaCivilBr(v.criadoEm)}; aguardando aprovação de outra pessoa`,
      podeAprovar: v.situacao === "RASCUNHO" && permitidas.has("APROVAR_VERSAO_DE_RUBRICA"),
      podeRevogar: v.situacao !== "REVOGADA" && permitidas.has("REVOGAR_VERSAO_DE_RUBRICA"),
    })),
  };
}

export async function criarVersaoNaTela(c: Campos): Promise<string> {
  const formula = t(c, "formula");
  const percentual = t(c, "percentual");
  const fim = t(c, "competenciaFim");
  const r = await comEscritaAutenticada("CADASTRAR_VERSAO_DE_RUBRICA", (criadoPor) =>
    criarVersaoDaRubrica(cliente(), {
      rubricaId: t(c, "__rubrica"),
      competenciaInicio: t(c, "competenciaInicio"),
      competenciaFim: fim === "" ? null : fim,
      formula: formula === "" ? null : formula,
      percentual: percentual === "" ? null : new Decimal(percentual),
      incideContribuicao: t(c, "incideContribuicao") === "sim",
      incideIrrf: t(c, "incideIrrf") === "sim",
      proporcionalAosDias: t(c, "proporcionalAosDias") === "sim",
      casasDecimais: Number(t(c, "casasDecimais") === "" ? "2" : t(c, "casasDecimais")),
      regime: t(c, "regime") as "TODOS" | "RGPS" | "RPPS" | "ISENTO",
      fundamentacaoLegal: t(c, "fundamentacaoLegal"),
      criadoPor,
    }),
  );
  const cita = r.dependencias.length === 0 ? "" : ` Ela cita ${r.dependencias.join(", ")}.`;
  return `Versão ${r.versao} gravada como RASCUNHO — ela ainda NÃO calcula nada.${cita} Outra pessoa precisa aprová-la para que passe a valer na folha.`;
}

export async function aprovarVersaoNaTela(c: Campos): Promise<string> {
  const r = await comEscritaAutenticada("APROVAR_VERSAO_DE_RUBRICA", (aprovadoPor) =>
    aprovarVersaoDaRubrica(cliente(), { versaoId: t(c, "__versao"), aprovadoPor }),
  );
  return r.anteriorFechadaEm === null
    ? "Versão aprovada. Ela passa a valer nas folhas da vigência declarada."
    : `Versão aprovada. A versão anterior teve a vigência FECHADA em ${r.anteriorFechadaEm} — ela continua aprovada e continua explicando as folhas que calculou.`;
}

export async function revogarVersaoNaTela(c: Campos): Promise<string> {
  await comEscritaAutenticada("REVOGAR_VERSAO_DE_RUBRICA", (revogadoPor) =>
    revogarVersaoDaRubrica(cliente(), { versaoId: t(c, "__versao"), motivo: t(c, "motivo"), revogadoPor }),
  );
  return "Versão revogada. As folhas já calculadas com ela continuam explicáveis; ela deixa de valer daqui para a frente.";
}
