import { diaCivil } from "../../packages/datas/index.js";
import { cadastrarImovel, encerrarVinculoComImovel, imovelPorInscricao, novaVersaoDoImovel, vincularPessoaAoImovel, type ImovelLido } from "../../modules/m34-tributario/cadastro-imobiliario.js";
import { publicarTabelaDeParametros, simularTributo, VARIAVEIS_DO_CADASTRO, type ResultadoDaSimulacao, type TributoMunicipal } from "../../modules/m34-tributario/simulacao.js";
import { cliente } from "./cliente";
import { acoesPermitidas } from "./molde";
import { comEscritaAutenticada } from "./sessao";

/**
 * ═══ O CADASTRO IMOBILIÁRIO E A SIMULAÇÃO NA TELA (V7 B1) ═══
 *
 * A porta não decide regra: projeta o que o domínio já decidiu. Cadastrar e vincular exigem GERIR_CADASTRO_IMOBILIARIO;
 * publicar a tabela, GERIR_PARAMETROS_TRIBUTARIOS; SIMULAR é leitura (a página exige a leitura da receita) e não grava
 * nada — nem lançamento, nem dívida, nem linha no ledger.
 */

export interface ImovelNaTela extends ImovelLido {
  readonly podeCadastrar: boolean;
  readonly podeParametrizar: boolean;
  readonly hoje: string;
  readonly exercicio: number;
}

export async function imoveisParaTela(busca: string): Promise<{ readonly imoveis: readonly { readonly id: string; readonly inscricao: string; readonly endereco: string; readonly uso: string; readonly versoes: number }[]; readonly podeCadastrar: boolean; readonly hoje: string }> {
  const prisma = cliente();
  const termo = busca.trim();
  const [lista, permitidas] = await Promise.all([
    prisma.imovel.findMany({
      where: termo === "" ? {} : { OR: [{ inscricao: { contains: termo, mode: "insensitive" } }, { versoes: { some: { OR: [{ logradouro: { contains: termo, mode: "insensitive" } }, { bairro: { contains: termo, mode: "insensitive" } }] } } }] },
      orderBy: { inscricao: "asc" },
      take: 100,
      select: { id: true, inscricao: true, versoes: { orderBy: { versao: "desc" }, take: 1, select: { logradouro: true, numero: true, bairro: true, uso: true } }, _count: { select: { versoes: true } } },
    }),
    acoesPermitidas(["GERIR_CADASTRO_IMOBILIARIO"]),
  ]);
  return {
    imoveis: lista.map((i) => ({ id: i.id, inscricao: i.inscricao, endereco: i.versoes[0] === undefined ? "sem versão" : `${i.versoes[0].logradouro}, ${i.versoes[0].numero} — ${i.versoes[0].bairro}`, uso: i.versoes[0]?.uso ?? "—", versoes: i._count.versoes })),
    podeCadastrar: permitidas.has("GERIR_CADASTRO_IMOBILIARIO"),
    hoje: diaCivil(new Date()),
  };
}

export async function imovelParaTela(inscricao: string): Promise<ImovelNaTela | null> {
  const prisma = cliente();
  const [lido, permitidas] = await Promise.all([imovelPorInscricao(prisma, inscricao), acoesPermitidas(["GERIR_CADASTRO_IMOBILIARIO", "GERIR_PARAMETROS_TRIBUTARIOS"])]);
  if (lido === null) return null;
  const hoje = diaCivil(new Date());
  return { ...lido, podeCadastrar: permitidas.has("GERIR_CADASTRO_IMOBILIARIO"), podeParametrizar: permitidas.has("GERIR_PARAMETROS_TRIBUTARIOS"), hoje, exercicio: Number(hoje.slice(0, 4)) };
}

export async function tabelasParaTela(): Promise<{ readonly tabelas: readonly { readonly id: string; readonly tributo: string; readonly exercicio: number; readonly versao: number; readonly vigenciaInicio: string; readonly fundamento: string; readonly formula: string; readonly parametros: number }[]; readonly podeParametrizar: boolean; readonly variaveisDoCadastro: readonly string[]; readonly hoje: string }> {
  const prisma = cliente();
  const [tabelas, permitidas] = await Promise.all([
    prisma.tabelaDeParametrosTributarios.findMany({ orderBy: [{ tributo: "asc" }, { exercicio: "desc" }, { versao: "desc" }], take: 200, select: { id: true, tributo: true, exercicio: true, versao: true, vigenciaInicio: true, fundamento: true, formula: true, _count: { select: { parametros: true } } } }),
    acoesPermitidas(["GERIR_PARAMETROS_TRIBUTARIOS"]),
  ]);
  return {
    tabelas: tabelas.map((t) => ({ id: t.id, tributo: t.tributo, exercicio: t.exercicio, versao: t.versao, vigenciaInicio: diaCivil(t.vigenciaInicio), fundamento: t.fundamento, formula: t.formula, parametros: t._count.parametros })),
    podeParametrizar: permitidas.has("GERIR_PARAMETROS_TRIBUTARIOS"),
    variaveisDoCadastro: VARIAVEIS_DO_CADASTRO,
    hoje: diaCivil(new Date()),
  };
}

/** A SIMULAÇÃO na tela — leitura; devolve o resultado com a memória, ou a recusa do domínio como mensagem. */
export async function simularNaTela(imovelId: string, tributo: string, exercicio: number, dia: string): Promise<ResultadoDaSimulacao> {
  return simularTributo(cliente(), { imovelId, tributo: tributo as TributoMunicipal, exercicio, ...(dia === "" ? {} : { dia }) });
}

type Campos = Readonly<Record<string, string>>;
const t = (c: Campos, k: string): string => (c[k] ?? "").trim();
const decimal = (v: string): string => v.trim().replace(/\./g, "").replace(",", ".");

/** Os campos `atributo.<n>.chave` e `.valor` preenchidos, na ordem do formulário. */
function atributosDoFormulario(c: Campos): { readonly chave: string; readonly valor: string; readonly descricao?: string }[] {
  const indices = [...new Set(Object.keys(c).filter((k) => k.startsWith("atributo.")).map((k) => k.split(".")[1] ?? ""))].sort((a, b) => Number(a) - Number(b));
  return indices
    .filter((i) => t(c, `atributo.${i}.chave`) !== "" && t(c, `atributo.${i}.valor`) !== "")
    .map((i) => ({ chave: t(c, `atributo.${i}.chave`), valor: decimal(t(c, `atributo.${i}.valor`)), ...(t(c, `atributo.${i}.descricao`) === "" ? {} : { descricao: t(c, `atributo.${i}.descricao`) }) }));
}

const dadosDaVersao = (c: Campos) => ({
  vigenciaInicio: t(c, "vigenciaInicio"), motivo: t(c, "motivo"),
  logradouro: t(c, "logradouro"), numero: t(c, "numero"), bairro: t(c, "bairro"),
  ...(t(c, "zona") === "" ? {} : { zona: t(c, "zona") }),
  uso: t(c, "uso") as "RESIDENCIAL",
  ...(t(c, "padraoConstrutivo") === "" ? {} : { padraoConstrutivo: t(c, "padraoConstrutivo") }),
  areaDoTerreno: decimal(t(c, "areaDoTerreno")), areaConstruida: decimal(t(c, "areaConstruida")),
  ...(t(c, "fracaoIdeal") === "" ? {} : { fracaoIdeal: decimal(t(c, "fracaoIdeal")) }),
  atributos: atributosDoFormulario(c),
});

export async function cadastrarImovelNaTela(c: Campos): Promise<string> {
  const r = await comEscritaAutenticada("GERIR_CADASTRO_IMOBILIARIO", (criadoPor) => cadastrarImovel(cliente(), { inscricao: t(c, "inscricao"), ...dadosDaVersao(c), criadoPor }));
  return `Imóvel ${t(c, "inscricao")} cadastrado com a versão ${r.versao}. O que mudar depois entra como versão nova, com a data em que passa a valer.`;
}

export async function novaVersaoNaTela(c: Campos): Promise<string> {
  const r = await comEscritaAutenticada("GERIR_CADASTRO_IMOBILIARIO", (criadoPor) => novaVersaoDoImovel(cliente(), { imovelId: t(c, "imovelId"), ...dadosDaVersao(c), criadoPor }));
  return `Versão ${r.versao} do cadastro registrada. As versões anteriores continuam valendo nos dias delas — a simulação de um exercício passado não muda.`;
}

export async function vincularNaTela(c: Campos): Promise<string> {
  const r = await comEscritaAutenticada("GERIR_CADASTRO_IMOBILIARIO", (criadoPor) =>
    vincularPessoaAoImovel(cliente(), { imovelId: t(c, "imovelId"), pessoaDocumento: t(c, "pessoaDocumento").replace(/\D/g, ""), papel: t(c, "papel") as "PROPRIETARIO", fracao: decimal(t(c, "fracao")), vigenciaInicio: t(c, "vigenciaInicio"), motivo: t(c, "motivo"), criadoPor })
  );
  return `Vínculo registrado. As frações vigentes deste papel somam ${r.fracaoDoPapel}.`;
}

export async function encerrarVinculoNaTela(c: Campos): Promise<string> {
  await comEscritaAutenticada("GERIR_CADASTRO_IMOBILIARIO", (criadoPor) => encerrarVinculoComImovel(cliente(), { vinculoId: t(c, "vinculoId"), dataEfeito: t(c, "dataEfeito"), motivo: t(c, "motivo"), criadoPor }));
  return "Vínculo encerrado. Ele continua no histórico do imóvel, com a data de efeito e o motivo.";
}

/** Os parâmetros chegam como `parametro.<n>.{chave,valor,descricao}`. */
function parametrosDoFormulario(c: Campos): { readonly chave: string; readonly valor: string; readonly descricao: string }[] {
  const indices = [...new Set(Object.keys(c).filter((k) => k.startsWith("parametro.")).map((k) => k.split(".")[1] ?? ""))].sort((a, b) => Number(a) - Number(b));
  return indices
    .filter((i) => t(c, `parametro.${i}.chave`) !== "")
    .map((i) => ({ chave: t(c, `parametro.${i}.chave`), valor: decimal(t(c, `parametro.${i}.valor`)), descricao: t(c, `parametro.${i}.descricao`) === "" ? "sem descrição" : t(c, `parametro.${i}.descricao`) }));
}

export async function publicarTabelaNaTela(c: Campos): Promise<string> {
  const r = await comEscritaAutenticada("GERIR_PARAMETROS_TRIBUTARIOS", (criadoPor) =>
    publicarTabelaDeParametros(cliente(), {
      tributo: t(c, "tributo") as "IPTU", exercicio: Number(t(c, "exercicio")), vigenciaInicio: t(c, "vigenciaInicio"),
      fundamento: t(c, "fundamento"), motivo: t(c, "motivo"), formula: t(c, "formula"), parametros: parametrosDoFormulario(c), criadoPor,
    })
  );
  return `Versão ${r.versao} da tabela publicada, valendo a partir de ${t(c, "vigenciaInicio").split("-").reverse().join("/")}. A fórmula usa: ${r.variaveis.join(", ")}. As simulações de dias anteriores continuam na versão delas.`;
}
