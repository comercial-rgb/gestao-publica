import { diaCivilBr } from "../../../packages/datas/index.js";
import { bensSobResponsabilidade, estadoDoBem } from "../../../modules/m10-patrimonial/gestao-do-bem.js";
import { pessoaDoUsuario } from "../../../modules/m16-travamento/servico-pessoa-do-usuario.js";
import { cliente, PortaSemBancoError } from "../cliente";
import { exigirLeituraEmAlgumEscopo } from "../leitura";
import type { Identidade } from "../sessao";

/**
 * "MEUS BENS" — os bens sob a responsabilidade de QUEM ESTÁ NA SESSÃO (V3, pacote 2; TR 5.19.10).
 *
 * ═══ A DERIVAÇÃO, EM DOIS PASSOS EXPLÍCITOS ═══
 *   1. quem está na sessão É qual pessoa? — `pessoaDoUsuario`, a última linha VINCULO do
 *      vínculo explícito. Sem vínculo, a tela diz que o vínculo está PENDENTE e quem resolve
 *      (o administrador); ela não procura a pessoa pelo nome do usuário;
 *   2. por quais bens essa pessoa responde HOJE? — `bensSobResponsabilidade`, o último
 *      movimento RESPONSAVEL vivo de cada bem, como o domínio já derivava (D4).
 *
 * ⚠️ A LEITURA É DA ÁREA, EM ALGUM ESCOPO: a lista é do próprio usuário, e a ação de
 * consultar o patrimônio numa unidade qualquer já abre a área para ele. O recorte real
 * aqui é a PESSOA, não a unidade.
 */

export { PortaSemBancoError };

export interface MeuBem {
  readonly id: string;
  readonly numeroTombamento: string;
  readonly descricao: string;
  readonly classe: string;
  readonly localizacao: string;
  readonly situacao: string;
  readonly estado: string;
}

export interface MeusBens {
  readonly pessoa: { readonly nome: string; readonly documento: string } | null;
  readonly bens: readonly MeuBem[];
}

const ROTULO_SITUACAO: Readonly<Record<string, string>> = {
  EM_USO: "em uso",
  EM_EMPRESTIMO: "em empréstimo",
  EM_LOCACAO: "em locação",
  EM_MANUTENCAO_PREVENTIVA: "em manutenção preventiva",
  EM_MANUTENCAO_CORRETIVA: "em manutenção corretiva",
  EM_DESUSO: "em desuso",
  BAIXADO: "baixado",
};
const ROTULO_ESTADO: Readonly<Record<string, string>> = {
  OTIMO: "ótimo",
  BOM: "bom",
  REGULAR: "regular",
  RUIM: "ruim",
  INSERVIVEL: "inservível",
};

/** A mesma leitura com a identidade por parâmetro — a que a suíte exercita. */
export async function meusBensPara(sessao: Identidade): Promise<MeusBens> {
  const prisma = cliente();
  const pessoa = await pessoaDoUsuario(prisma, sessao.identificador);
  if (pessoa === null) return { pessoa: null, bens: [] };

  const sob = await bensSobResponsabilidade(prisma, pessoa.pessoaId);
  const bens: MeuBem[] = [];
  for (const b of sob) {
    const [bem, estado] = await Promise.all([
      prisma.bemPatrimonial.findUnique({
        where: { id: b.bemId },
        select: { descricao: true, classeDeBens: { select: { codigo: true, descricao: true } } },
      }),
      estadoDoBem(prisma, b.bemId),
    ]);
    if (bem === null) continue;
    const localizacao =
      estado.localizacaoId === null
        ? null
        : await prisma.localizacaoFisica.findUnique({ where: { id: estado.localizacaoId }, select: { codigo: true, descricao: true } });
    bens.push({
      id: b.bemId,
      numeroTombamento: b.numeroTombamento,
      descricao: bem.descricao,
      classe: `${bem.classeDeBens.codigo} — ${bem.classeDeBens.descricao}`,
      localizacao: localizacao === null ? "—" : `${localizacao.codigo} — ${localizacao.descricao}`,
      situacao: estado.situacao === null ? "—" : (ROTULO_SITUACAO[estado.situacao] ?? estado.situacao),
      estado: estado.estado === null ? "—" : (ROTULO_ESTADO[estado.estado] ?? estado.estado),
    });
  }
  bens.sort((a, b) => a.numeroTombamento.localeCompare(b.numeroTombamento));
  return { pessoa: { nome: pessoa.nome, documento: pessoa.documento }, bens };
}

export async function meusBens(): Promise<MeusBens> {
  const sessao = await exigirLeituraEmAlgumEscopo("CONSULTAR_PATRIMONIO");
  return meusBensPara(sessao);
}

/** "12/03/2026" — reexportado para a tela não importar `packages/datas` só por isto. */
export const dataBr = diaCivilBr;
