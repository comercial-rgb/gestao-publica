import {
  CadastroDeResponsavelInvalidoError,
  INDICADORES_DE_CENTRALIZACAO,
  registrarContabilistaDoManad,
  registrarEmpresaGeradoraDoManad,
  type RegistrarContabilistaInput,
  type RegistrarEmpresaGeradoraInput,
} from "../../modules/m01-core-contabil/responsaveis-do-manad.js";
import type { AcaoDoSistema } from "../../modules/m16-travamento/acoes.js";
import { autorizar } from "../../modules/m16-travamento/autorizacao.js";
import { vigenciasEfetivas } from "../../modules/m14-exports-federais/manad/responsaveis.js";
import { cliente } from "./cliente";
import { exigirLeituraDoEntePara } from "./leitura";
import { comEscritaAutenticada, exigirSessao, type Identidade } from "./sessao";

/**
 * PORTA — OS RESPONSÁVEIS TÉCNICOS DO ARQUIVO DA RECEITA (MANAD 0000/0050/0100).
 *
 * ⚠️ LEITURA sob `CONSULTAR_CONTABILIDADE` no ENTE (a mesma da tela dos arquivos federais: quem
 * gera o arquivo vê quem o assina). ESCRITA sob `CADASTRAR_ENTIDADE_CONTABIL`, pelo funil único
 * (`comEscritaAutenticada`: licenciamento, chave do comando, auditoria) — e o domínio confere a
 * mesma ação de novo, dentro da transação. A tela esconder o formulário não protege nada.
 *
 * ⚠️ O INDICADOR DE CENTRALIZAÇÃO É SÓ LIDO AQUI. Ele mora no `EnteConfig` (singleton), e o papel
 * da aplicação não tem UPDATE nessa tabela: declarar é passo de implantação
 * (`scripts/declarar-centralizacao-da-escrituracao.ts`). Ver `responsaveis-do-manad.ts` no M01.
 */

export { CadastroDeResponsavelInvalidoError };

/** A ação de escrita, uma vez só — a tela a usa para decidir se mostra os formulários. */
export const ACAO_DE_CADASTRO_DOS_RESPONSAVEIS: AcaoDoSistema = "CADASTRAR_ENTIDADE_CONTABIL";

export interface ResponsavelNaTela {
  readonly id: string;
  readonly nome: string;
  /** CPF ou CNPJ, sem máscara (a tela formata). */
  readonly documento: string | null;
  readonly detalhe: string;
  /** "AAAA-MM-DD" (a data do leiaute, sem fuso). */
  readonly inicio: string;
  /** Fim efetivo: o declarado, ou a véspera do sucessor. `null` = vigente. */
  readonly fim: string | null;
  /** `true` quando o fim não foi declarado e vem da sucessão. */
  readonly fimPelaSucessao: boolean;
  readonly conferidoPor: string;
}

export interface ResponsaveisNaTela {
  readonly contabilistas: readonly ResponsavelNaTela[];
  readonly geradoras: readonly ResponsavelNaTela[];
  /** O código ("0", "1", "2") e o texto dele; `null` = ainda não declarado. */
  readonly centralizacao: { readonly codigo: string; readonly descricao: string } | null;
  /** A sessão pode cadastrar? (mesma pergunta que o servidor faz na escrita.) */
  readonly podeCadastrar: boolean;
}

/** Data do leiaute (meia-noite UTC) -> "AAAA-MM-DD". UTC por ser o formato externo. */
function dia(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function lerResponsaveisDoManadPara(sessao: Identidade): Promise<ResponsaveisNaTela> {
  await exigirLeituraDoEntePara(sessao, "CONSULTAR_CONTABILIDADE");
  const prisma = cliente();
  const [contabilistas, geradoras, ente, podeCadastrar] = await Promise.all([
    prisma.manadContabilista.findMany({ orderBy: { dtInicio: "asc" } }),
    prisma.manadEmpresaGeradora.findMany({ orderBy: { dtInicioServico: "asc" } }),
    prisma.enteConfig.findUnique({ where: { id: "unico" }, select: { indCentralizacao: true } }),
    sessaoTemAcaoGlobal(sessao, ACAO_DE_CADASTRO_DOS_RESPONSAVEIS),
  ]);

  const c = vigenciasEfetivas(contabilistas, (x) => ({ inicio: x.dtInicio, fim: x.dtFim })).map(
    (v): ResponsavelNaTela => ({
      id: v.registro.id,
      nome: v.registro.nome,
      documento: v.registro.cpf,
      detalhe: `CRC ${v.registro.crc}`,
      inicio: dia(v.inicio),
      fim: v.fimEfetivo === null ? null : dia(v.fimEfetivo),
      fimPelaSucessao: v.registro.dtFim === null && v.fimEfetivo !== null,
      conferidoPor: v.registro.conferidoPor,
    })
  );
  const g = vigenciasEfetivas(geradoras, (x) => ({ inicio: x.dtInicioServico, fim: x.dtFimServico })).map(
    (v): ResponsavelNaTela => ({
      id: v.registro.id,
      nome: v.registro.empresaOuTecnico,
      documento: v.registro.cnpj ?? v.registro.cpf,
      detalhe: v.registro.cargo,
      inicio: dia(v.inicio),
      fim: v.fimEfetivo === null ? null : dia(v.fimEfetivo),
      fimPelaSucessao: v.registro.dtFimServico === null && v.fimEfetivo !== null,
      conferidoPor: v.registro.conferidoPor,
    })
  );

  const cod = ente?.indCentralizacao ?? null;
  const descricao =
    cod !== null && Object.hasOwn(INDICADORES_DE_CENTRALIZACAO, cod)
      ? INDICADORES_DE_CENTRALIZACAO[cod as keyof typeof INDICADORES_DE_CENTRALIZACAO]
      : null;
  return {
    contabilistas: c.reverse(),
    geradoras: g.reverse(),
    centralizacao: cod === null || cod === "" || descricao === null ? null : { codigo: cod, descricao },
    podeCadastrar,
  };
}

/**
 * A sessão tem a ação no escopo do ENTE? Só para a TELA decidir se mostra o formulário — a
 * decisão que vale é a do servidor, na escrita. É a MESMA função (`autorizar`, sem UG), não uma
 * cópia da regra: uma cópia divergiria no dia em que a regra mudasse.
 *
 * ⚠️ Só a recusa de acesso vira `false`; qualquer outra falha (banco fora) sobe.
 */
async function sessaoTemAcaoGlobal(sessao: Identidade, acao: AcaoDoSistema): Promise<boolean> {
  try {
    await autorizar(cliente(), sessao.identificador, acao);
    return true;
  } catch (e) {
    if (e instanceof Error && /^ACESSO NEGADO/u.test(e.message)) return false;
    throw e;
  }
}

export async function lerResponsaveisDoManad(): Promise<ResponsaveisNaTela> {
  return lerResponsaveisDoManadPara(await exigirSessao());
}

type SemAutor<T> = Omit<T, "criadoPor">;

export async function registrarContabilista(
  dados: SemAutor<RegistrarContabilistaInput>
): Promise<{ readonly id: string }> {
  return comEscritaAutenticada(ACAO_DE_CADASTRO_DOS_RESPONSAVEIS, (criadoPor) =>
    registrarContabilistaDoManad(cliente(), { ...dados, criadoPor }, new Date())
  );
}

export async function registrarEmpresaGeradora(
  dados: SemAutor<RegistrarEmpresaGeradoraInput>
): Promise<{ readonly id: string }> {
  return comEscritaAutenticada(ACAO_DE_CADASTRO_DOS_RESPONSAVEIS, (criadoPor) =>
    registrarEmpresaGeradoraDoManad(cliente(), { ...dados, criadoPor }, new Date())
  );
}
