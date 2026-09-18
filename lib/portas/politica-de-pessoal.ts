import {
  COLUNAS_DO_DEMONSTRATIVO,
  TODAS_AS_COLUNAS,
  type ColunaDoDemonstrativo,
} from "../../modules/m13-transparencia/publicacao-de-pessoal.js";
import {
  aprovarPoliticaDePessoal,
  cadastrarPoliticaDePessoal,
  revogarPoliticaDePessoal,
} from "../../modules/m13-transparencia/servico-politica-de-pessoal.js";
import { diaCivilBr } from "../../packages/datas/index.js";
import { comEscritaAutenticada } from "./sessao";
import { acoesPermitidas } from "./molde";
import { cliente } from "./cliente";

/**
 * A PORTA DA POLÍTICA DE PUBLICAÇÃO DE PESSOAL (V11 V4.2) — fina de propósito.
 *
 * ⚠️ AS TRÊS ESCRITAS PASSAM POR `comEscritaAutenticada`, o funil onde moram sessão, autorização
 * por ação nomeada e o gate de módulo comercial. Chamar o serviço direto daqui pularia os três.
 */

type Campos = Readonly<Record<string, string>>;
const t = (c: Campos, k: string): string => (c[k] ?? "").trim();

export interface PoliticaNaTela {
  readonly id: string;
  readonly versao: number;
  readonly vigencia: string;
  readonly situacao: string;
  readonly fundamentacaoLegal: string;
  readonly colunas: readonly string[];
  readonly autoria: string;
  readonly podeAprovar: boolean;
  readonly podeRevogar: boolean;
}

export interface PainelDaPolitica {
  readonly politicas: readonly PoliticaNaTela[];
  readonly podeCadastrar: boolean;
  readonly colunasDisponiveis: readonly { readonly valor: ColunaDoDemonstrativo; readonly rotulo: string; readonly fundamento: string }[];
}

export async function painelDaPoliticaDePessoal(): Promise<PainelDaPolitica> {
  const prisma = cliente();
  const [politicas, permitidas] = await Promise.all([
    prisma.politicaDePublicacaoDePessoal.findMany({
      orderBy: { versao: "desc" },
      select: {
        id: true, versao: true, competenciaInicio: true, competenciaFim: true, fundamentacaoLegal: true,
        situacao: true, criadoPor: true, criadoEm: true, aprovadoPor: true, aprovadoEm: true,
        revogadoPor: true, revogadoEm: true, motivoDaRevogacao: true,
        colunas: { select: { coluna: true } },
      },
    }),
    acoesPermitidas(["CADASTRAR_POLITICA_DE_PESSOAL", "APROVAR_POLITICA_DE_PESSOAL", "REVOGAR_POLITICA_DE_PESSOAL"]),
  ]);

  return {
    podeCadastrar: permitidas.has("CADASTRAR_POLITICA_DE_PESSOAL"),
    colunasDisponiveis: TODAS_AS_COLUNAS.map((c) => ({ valor: c, rotulo: COLUNAS_DO_DEMONSTRATIVO[c].rotulo, fundamento: COLUNAS_DO_DEMONSTRATIVO[c].fundamento })),
    politicas: politicas.map((p) => ({
      id: p.id,
      versao: p.versao,
      vigencia: p.competenciaFim === null ? `de ${p.competenciaInicio} (aberta)` : `de ${p.competenciaInicio} a ${p.competenciaFim}`,
      situacao: p.situacao,
      fundamentacaoLegal: p.fundamentacaoLegal,
      colunas: p.colunas.map((c) => COLUNAS_DO_DEMONSTRATIVO[c.coluna as ColunaDoDemonstrativo].rotulo).sort(),
      autoria:
        p.situacao === "REVOGADA" && p.revogadoPor !== null && p.revogadoEm !== null
          ? `redigida por ${p.criadoPor} em ${diaCivilBr(p.criadoEm)}; revogada por ${p.revogadoPor} em ${diaCivilBr(p.revogadoEm)} — ${p.motivoDaRevogacao ?? ""}`
          : p.aprovadoPor !== null && p.aprovadoEm !== null
            ? `redigida por ${p.criadoPor} em ${diaCivilBr(p.criadoEm)}; aprovada por ${p.aprovadoPor} em ${diaCivilBr(p.aprovadoEm)}`
            : `redigida por ${p.criadoPor} em ${diaCivilBr(p.criadoEm)}; aguardando aprovação de outra pessoa`,
      podeAprovar: p.situacao === "RASCUNHO" && permitidas.has("APROVAR_POLITICA_DE_PESSOAL"),
      podeRevogar: p.situacao !== "REVOGADA" && permitidas.has("REVOGAR_POLITICA_DE_PESSOAL"),
    })),
  };
}

export async function cadastrarPoliticaNaTela(c: Campos, colunas: readonly string[]): Promise<string> {
  const r = await comEscritaAutenticada("CADASTRAR_POLITICA_DE_PESSOAL", (criadoPor) =>
    cadastrarPoliticaDePessoal(cliente(), {
      competenciaInicio: t(c, "competenciaInicio"),
      competenciaFim: t(c, "competenciaFim") === "" ? null : t(c, "competenciaFim"),
      fundamentacaoLegal: t(c, "fundamentacaoLegal"),
      colunas: colunas as never,
      criadoPor,
    }),
  );
  return `Política ${r.versao} gravada como RASCUNHO — ela ainda NÃO publica nada. Outra pessoa precisa aprová-la para que o demonstrativo por servidor passe a existir no portal.`;
}

export async function aprovarPoliticaNaTela(c: Campos): Promise<string> {
  const r = await comEscritaAutenticada("APROVAR_POLITICA_DE_PESSOAL", (aprovadoPor) =>
    aprovarPoliticaDePessoal(cliente(), { politicaId: t(c, "__politica"), aprovadoPor }),
  );
  const fecho = r.anteriorFechadaEm === null ? "" : ` A política anterior teve a vigência fechada em ${r.anteriorFechadaEm} — ela continua aprovada e continua explicando o que já publicou.`;
  return `Política aprovada. O demonstrativo por servidor passa a publicar, no portal aberto, as colunas declaradas.${fecho}`;
}

export async function revogarPoliticaNaTela(c: Campos): Promise<string> {
  await comEscritaAutenticada("REVOGAR_POLITICA_DE_PESSOAL", (revogadoPor) =>
    revogarPoliticaDePessoal(cliente(), { politicaId: t(c, "__politica"), motivo: t(c, "motivo"), revogadoPor }),
  );
  return "Política revogada. O demonstrativo por servidor deixa de publicar AGORA; os totais por unidade continuam, porque não contêm dado pessoal.";
}
