import {
  escolherConfiguracaoVigente,
  prazoDoPedido,
  type ConfiguracaoLida,
  type PendenciaDaConfiguracao,
} from "../../modules/m21-protocolo/acesso-a-informacao.js";
import {
  publicarConfiguracaoDoAcesso,
  versoesDaConfiguracaoDoAcesso,
} from "../../modules/m21-protocolo/servico-acesso-a-informacao.js";
import { diaCivil, diaCivilBr } from "../../packages/datas/index.js";
import { comEscritaAutenticada } from "./sessao";
import { acoesPermitidas } from "./molde";
import { cliente } from "./cliente";

/**
 * A PORTA DA CONFIGURAÇÃO DO ACESSO À INFORMAÇÃO (V11 V5.1) — fina de propósito.
 *
 * ⚠️ A ESCRITA PASSA POR `comEscritaAutenticada`, o funil onde moram sessão, autorização por ação
 * nomeada e o gate de módulo comercial. Chamar o serviço direto daqui pularia os três.
 */

type Campos = Readonly<Record<string, string>>;
const t = (c: Campos, k: string): string => (c[k] ?? "").trim();
const n = (c: Campos, k: string): number => Number.parseInt(t(c, k), 10);
const opcional = (c: Campos, k: string): string | null => (t(c, k) === "" ? null : t(c, k));

export type { ConfiguracaoLida, PendenciaDaConfiguracao } from "../../modules/m21-protocolo/acesso-a-informacao.js";

export interface VersaoNaTela {
  readonly versao: number;
  readonly vigenciaInicio: string;
  readonly vigente: boolean;
  readonly prazoDeRespostaEmDias: number;
  readonly prazoDeProrrogacaoEmDias: number;
  readonly prorrogacoesPermitidas: number;
  readonly instanciasDeRecurso: number;
  readonly prazoDeRecursoEmDias: number;
  readonly normaFederal: string;
  readonly normaFederalPublicadaEm: string;
  readonly regulamentacaoLocal: string | null;
  readonly regulamentacaoLocalPublicadaEm: string | null;
  readonly observacao: string | null;
}

export interface PainelDoAcessoAInformacao {
  readonly hoje: string;
  readonly versoes: readonly VersaoNaTela[];
  readonly vigente: ConfiguracaoLida | null;
  readonly pendencias: readonly PendenciaDaConfiguracao[];
  /** O prazo que um pedido protocolado HOJE teria. Torna a configuração conferível sem simular. */
  readonly exemploDeLimite: string | null;
  readonly podePublicar: boolean;
}

export async function painelDoAcessoAInformacao(): Promise<PainelDoAcessoAInformacao> {
  const prisma = cliente();
  const agora = new Date();
  const hoje = diaCivil(agora);

  const [versoes, permitidas] = await Promise.all([
    versoesDaConfiguracaoDoAcesso(prisma),
    acoesPermitidas(["PUBLICAR_CONFIGURACAO_DO_ACESSO_A_INFORMACAO"]),
  ]);

  const vigente = escolherConfiguracaoVigente(versoes, hoje);
  // ⚠️ O EXEMPLO É CALCULADO PELA MESMA RÉGUA do pedido real. Um número de exemplo montado à parte
  // seria um segundo cálculo do mesmo prazo, e o dia em que divergisse ninguém saberia qual vale.
  const exemplo = prazoDoPedido(vigente, agora, 0, agora);

  return {
    hoje: diaCivilBr(agora),
    versoes: versoes.map((v) => ({
      versao: v.versao,
      vigenciaInicio: v.vigenciaInicio,
      vigente: vigente !== null && v.versao === vigente.versao,
      prazoDeRespostaEmDias: v.prazoDeRespostaEmDias,
      prazoDeProrrogacaoEmDias: v.prazoDeProrrogacaoEmDias,
      prorrogacoesPermitidas: v.prorrogacoesPermitidas,
      instanciasDeRecurso: v.instanciasDeRecurso,
      prazoDeRecursoEmDias: v.prazoDeRecursoEmDias,
      normaFederal: v.normaFederal,
      normaFederalPublicadaEm: diaCivilBr(v.normaFederalPublicadaEm),
      regulamentacaoLocal: v.regulamentacaoLocal,
      regulamentacaoLocalPublicadaEm:
        v.regulamentacaoLocalPublicadaEm === null ? null : diaCivilBr(v.regulamentacaoLocalPublicadaEm),
      observacao: v.observacao,
    })),
    vigente,
    pendencias: exemplo.pendencias,
    exemploDeLimite: exemplo.limiteBr,
    podePublicar: permitidas.has("PUBLICAR_CONFIGURACAO_DO_ACESSO_A_INFORMACAO"),
  };
}

export async function publicarConfiguracaoNaTela(campos: Campos): Promise<string> {
  return comEscritaAutenticada("PUBLICAR_CONFIGURACAO_DO_ACESSO_A_INFORMACAO", async (criadoPor) => {
    const r = await publicarConfiguracaoDoAcesso(cliente(), {
      vigenciaInicio: t(campos, "vigenciaInicio"),
      prazoDeRespostaEmDias: n(campos, "prazoDeRespostaEmDias"),
      prazoDeProrrogacaoEmDias: n(campos, "prazoDeProrrogacaoEmDias"),
      prorrogacoesPermitidas: n(campos, "prorrogacoesPermitidas"),
      instanciasDeRecurso: n(campos, "instanciasDeRecurso"),
      prazoDeRecursoEmDias: n(campos, "prazoDeRecursoEmDias"),
      normaFederal: t(campos, "normaFederal"),
      normaFederalPublicadaEm: t(campos, "normaFederalPublicadaEm"),
      regulamentacaoLocal: opcional(campos, "regulamentacaoLocal"),
      regulamentacaoLocalPublicadaEm: opcional(campos, "regulamentacaoLocalPublicadaEm"),
      observacao: opcional(campos, "observacao"),
      criadoPor,
    });
    return `Configuração do acesso à informação publicada na versão ${r.versao}. As versões anteriores continuam valendo para os pedidos protocolados sob elas.`;
  });
}
