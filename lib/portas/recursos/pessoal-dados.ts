import { diaCivil, diaCivilBr, fimDoDiaCivil, inicioDoDiaCivil, meioDiaCivil } from "../../../packages/datas/index.js";
import { toMoney } from "../../../packages/contracts/index.js";
import { formatarDocumento } from "../../../packages/documento/index.js";
import type { Prisma } from "../../../prisma/generated/client/client.js";
import {
  cargoVigenteEm,
  gratificacoesVigentesEm,
  funcaoVigenteEm,
  centroDeCustoVigenteEm,
  lotacaoVigenteEm,
  lotadosNaLotacao,
  regimeVigenteEm,
  salarioBaseVigenteEm,
  situacaoDoVinculo,
  baixaEfetiva,
  vagasOcupadasDoCargo,
  haEixoDerivadoDeVinculo,
  haEixoDeVinculo,
  vinculoAtendeAosEixos,
  type EixosDeConsultaDeVinculo,
  type EventoDoVinculo,
  type SituacaoVinculo,
} from "../../../modules/m32-pessoal/dominio.js";
import {
  admitirServidor,
  cadastrarCargo,
  cadastrarDependente,
  baixarFinalidadeDependente,
  cadastrarFuncao,
  cadastrarLotacao,
  cadastrarServidor,
  desligarServidor,
  registrarAlteracaoRemuneratoria,
  registrarAnotacaoServidor,
  registrarMovimentacao,
  registrarPortaria,
  registrarTreinamento,
} from "../../../modules/m32-pessoal/servico.js";
import type { ConsultaDoMolde } from "../../molde/consulta.js";
import { TAMANHO_DE_PAGINA } from "../../molde/consulta.js";
import type { LinhaDoHistorico, LinhaDoMolde } from "../../molde/tipos.js";
import { comEscritaAutenticada, exigirSessao, type Identidade } from "../sessao";
import { exigirLeituraDoEntePara } from "../leitura";
import { cliente, PortaSemBancoError } from "../cliente";
import type { DetalheLido, OpcoesDoCadastro, PaginaDoMolde } from "./dados";

/**
 * A PORTA DO PESSOAL (M32, V6 P2.2). A porta lê e chama — quem decide é o domínio. Cargo, lotação,
 * salário e situação de cada vínculo saem das derivações puras de `dominio.ts` sobre os eventos,
 * na data pedida (hoje, nas telas). Nenhuma coluna de situação.
 */
export { PortaSemBancoError };

type Campos = Readonly<Record<string, string>>;
const t = (c: Campos, k: string): string => (c[k] ?? "").trim();
const opcional = (c: Campos, k: string): string | undefined => (t(c, k) === "" ? undefined : t(c, k));
const dia = (c: Campos, k: string): Date => meioDiaCivil(t(c, k));
const inteiro = (c: Campos, k: string): number | undefined => (t(c, k) === "" ? undefined : Number.parseInt(t(c, k), 10));
export function decimalDaTela(v: string): string {
  const s = v.trim();
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s) || /^\d+,\d+$/.test(s)) return s.replace(/\./g, "").replace(",", ".");
  return s;
}
function paginacao(c: ConsultaDoMolde): { readonly skip: number; readonly take: number } {
  return { skip: (c.pagina - 1) * TAMANHO_DE_PAGINA, take: TAMANHO_DE_PAGINA };
}

const ROTULO_DO_EVENTO: Readonly<Record<string, string>> = {
  ADMISSAO: "Admissão", PROMOCAO: "Promoção", MUDANCA_CARGO: "Mudança de cargo", MUDANCA_LOTACAO: "Mudança de lotação",
  REAJUSTE_SALARIAL: "Reajuste salarial", GRATIFICACAO: "Gratificação", AFASTAMENTO: "Afastamento", RETORNO_AFASTAMENTO: "Retorno de afastamento", DESLIGAMENTO: "Desligamento", MUDANCA_REGIME_PREVIDENCIARIO: "Mudança de regime previdenciário",
  // ⚠️ V11 V9.5 — SEM ESTES TRÊS A FICHA MOSTRARIA O VALOR CRU DO ENUM. O `?? e.tipo` do chamador
  // não é erro: é o fallback que faz um tipo novo aparecer como `DESIGNACAO_FUNCAO` em vez de
  // sumir — feio, mas honesto. O que não pode é ficar feio em produção por esquecimento.
  DESIGNACAO_FUNCAO: "Designação para função", DISPENSA_FUNCAO: "Dispensa de função", MUDANCA_CENTRO_DE_CUSTO: "Mudança de centro de custo",
};
const ROTULO_DA_SITUACAO: Readonly<Record<SituacaoVinculo, string>> = { ATIVO: "ATIVO", AFASTADO: "AFASTADO", DESLIGADO: "DESLIGADO" };

const SELECAO_DE_EVENTOS = {
  orderBy: [{ data: "asc" as const }, { criadoEm: "asc" as const }],
  select: {
    id: true, data: true, criadoEm: true, tipo: true, cargoId: true, lotacaoId: true, salarioBase: true, regimePrevidenciario: true,
    funcaoId: true, centroDeCustoId: true,
    gratificacaoDescricao: true, gratificacaoValor: true, motivo: true, criadoPor: true,
    cargo: { select: { codigo: true, denominacao: true } }, lotacao: { select: { codigo: true, nome: true } },
    funcao: { select: { codigo: true, denominacao: true } }, centroDeCusto: { select: { codigo: true, nome: true } },
    portaria: { select: { numero: true, ano: true } },
  },
};
type EventoLido = Prisma.HistoricoVinculoGetPayload<{ select: (typeof SELECAO_DE_EVENTOS)["select"] }>;

function eventos(es: readonly EventoLido[]): readonly (EventoDoVinculo & { readonly gratificacaoDescricao: string | null; readonly gratificacaoValor: ReturnType<typeof toMoney> | null })[] {
  return es.map((e) => ({
    data: e.data, criadoEm: e.criadoEm, tipo: e.tipo, cargoId: e.cargoId, lotacaoId: e.lotacaoId, regimePrevidenciario: e.regimePrevidenciario,
    funcaoId: e.funcaoId, centroDeCustoId: e.centroDeCustoId,
    salarioBase: e.salarioBase === null ? null : toMoney(e.salarioBase.toFixed(2)),
    gratificacaoDescricao: e.gratificacaoDescricao, gratificacaoValor: e.gratificacaoValor === null ? null : toMoney(e.gratificacaoValor.toFixed(2)),
  }));
}

function nomeDaPessoa(p: { readonly documento: string; readonly versoes: readonly { readonly nome: string }[] }, nomeSocial: string | null): string {
  return nomeSocial ?? p.versoes[0]?.nome ?? p.documento;
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVIDORES
// ═══════════════════════════════════════════════════════════════════════════

const SELECAO_DO_SERVIDOR = {
  id: true, nomeSocial: true, dataNascimento: true, sexo: true, pisPasep: true, rgNumero: true, rgOrgaoEmissor: true, rgUf: true,
  tituloEleitor: true, ctpsNumero: true, ctpsSerie: true, nomeMae: true, nomePai: true, criadoEm: true, criadoPor: true,
  pessoa: { select: { id: true, documento: true, versoes: { orderBy: { criadoEm: "desc" as const }, take: 1, select: { nome: true, email: true, telefone: true, municipio: true, uf: true } } } },
  vinculos: { orderBy: { dataAdmissao: "asc" as const }, select: { id: true, matricula: true, tipo: true, regimeJuridico: true, regimePrevidenciario: true, dataAdmissao: true, criadoPor: true, criadoEm: true, eventos: SELECAO_DE_EVENTOS } },
};

/**
 * ═══ O TETO DO CONJUNTO A APURAR (TR 5.12.50) ═══
 *
 * Eixo DERIVADO (cargo, lotação, regime previdenciário) e a SITUAÇÃO não se resolvem no `WHERE`:
 * a resposta está nos eventos. O conjunto tem de ser apurado inteiro ANTES de recortar a página —
 * e apurar "inteiro" sem teto é carregar o ente todo em memória no dia em que alguém abre a tela
 * com um filtro largo.
 *
 * ⚠️ O TETO RECUSA, NÃO TRUNCA. Truncar devolveria uma lista que PARECE completa, com um total que
 * PARECE certo — a forma silenciosa do mesmo defeito que este módulo existe para impedir.
 */
export const TETO_DE_CANDIDATOS = 5000;

export class ConsultaDePessoalAmplaDemaisError extends Error {
  readonly candidatos: number;
  readonly teto: number;
  constructor(candidatos: number, teto: number) {
    super(
      `A consulta alcança ${candidatos} servidores, acima do teto de ${teto} que esta tela apura por evento. ` +
        "Cargo, lotação, regime previdenciário e situação são derivados do histórico funcional — não há como recortar a " +
        "página no banco sem apurar o conjunto. Estreite por nome, matrícula, data de admissão ou regime jurídico e " +
        "repita. A lista NÃO foi truncada: truncar devolveria um total que parece certo."
    );
    this.name = "ConsultaDePessoalAmplaDemaisError";
    this.candidatos = candidatos;
    this.teto = teto;
  }
}

/** O vínculo, lido enxuto — só o que os eixos e as derivações precisam. Sem joins de cargo/lotação. */
const SELECAO_ENXUTA_DO_VINCULO = {
  id: true, matricula: true, dataAdmissao: true, regimeJuridico: true, regimePrevidenciario: true,
  eventos: {
    orderBy: [{ data: "asc" as const }, { criadoEm: "asc" as const }],
    // ⚠️ V11 V9.4 — `funcaoId` E `centroDeCustoId` ENTRAM AQUI PORQUE SÃO EIXOS DERIVADOS. Este é
    // o `select` do caminho de DUAS FASES, o único que o predicado percorre quando há eixo
    // derivado ativo. Sem estas duas colunas, `funcaoVigenteEm` e `centroDeCustoVigenteEm`
    // devolveriam `null` para TODO MUNDO e os dois filtros novos responderiam SEMPRE a lista
    // vazia — sem erro, sem log, com cara de "não há ninguém com essa função".
    select: { data: true, criadoEm: true, tipo: true, cargoId: true, lotacaoId: true, salarioBase: true, regimePrevidenciario: true, funcaoId: true, centroDeCustoId: true },
  },
};
type EventoEnxuto = Prisma.HistoricoVinculoGetPayload<{ select: (typeof SELECAO_ENXUTA_DO_VINCULO)["eventos"]["select"] }>;

/**
 * ⚠️ `salarioBase` ENTRA MESMO SEM SER USADO AQUI. `EventoDoVinculo` o declara, e preenchê-lo com
 * `null` faria `salarioBaseVigenteEm` devolver "sem salário" para todo mundo no dia em que alguém
 * reusasse esta leitura — um `null` fabricado é pior que uma coluna a mais.
 */
function eventosEnxutos(es: readonly EventoEnxuto[]): readonly EventoDoVinculo[] {
  return es.map((e) => ({
    data: e.data, criadoEm: e.criadoEm, tipo: e.tipo, cargoId: e.cargoId, lotacaoId: e.lotacaoId,
    regimePrevidenciario: e.regimePrevidenciario,
    funcaoId: e.funcaoId, centroDeCustoId: e.centroDeCustoId,
    salarioBase: e.salarioBase === null ? null : toMoney(e.salarioBase.toFixed(2)),
  }));
}

/** A situação do SERVIDOR — o agregado que a coluna sempre mostrou. Ver a nota de composição abaixo. */
function situacaoDoServidor(
  vinculos: readonly (readonly EventoDoVinculo[])[],
  quando: Date
): string {
  if (vinculos.length === 0) return "SEM_VINCULO";
  const vivos = vinculos.map((evs) => situacaoDoVinculo(evs, quando)).filter((s) => s !== "DESLIGADO");
  if (vivos.length === 0) return "DESLIGADO";
  return vivos.every((s) => s === "AFASTADO") ? "AFASTADO" : "ATIVO";
}

/**
 * ═══ ⚠️ A TRADUÇÃO DO TEXTO PARA IDENTIFICADORES (cargo e lotação) ═══
 *
 * O eixo do TR é "cargo", e o que a pessoa digita é código ou denominação. Quem resolve é o banco,
 * UMA vez, e o predicado do domínio compara IDENTIFICADORES — não texto. Assim a derivação
 * (`cargoVigenteEm` devolve um `cargoId`) e o filtro falam a mesma língua.
 *
 * ⚠️ `[]` NÃO VIRA "SEM FILTRO". Digitar um cargo que não existe devolve a lista VAZIA, que é a
 * resposta certa. Se `[]` fosse lido como eixo inativo, o ente inteiro apareceria para quem
 * procurou algo inexistente — o modo mais discreto de um filtro deixar de filtrar.
 */
async function idsDoCargo(termo: string): Promise<readonly string[]> {
  const achados = await cliente().cargo.findMany({
    where: { OR: [{ codigo: { contains: termo, mode: "insensitive" } }, { denominacao: { contains: termo, mode: "insensitive" } }] },
    select: { id: true },
  });
  return achados.map((x) => x.id);
}

async function idsDaLotacao(termo: string): Promise<readonly string[]> {
  const achados = await cliente().lotacao.findMany({
    where: { OR: [{ codigo: { contains: termo, mode: "insensitive" } }, { nome: { contains: termo, mode: "insensitive" } }] },
    select: { id: true },
  });
  return achados.map((x) => x.id);
}

/** V11 V9.4 — a FUNÇÃO. Mesma disciplina do cargo, inclusive o `[]` que não vira "sem filtro". */
async function idsDaFuncao(termo: string): Promise<readonly string[]> {
  const achados = await cliente().funcaoDePessoal.findMany({
    where: { OR: [{ codigo: { contains: termo, mode: "insensitive" } }, { denominacao: { contains: termo, mode: "insensitive" } }] },
    select: { id: true },
  });
  return achados.map((x) => x.id);
}

/**
 * V11 V9.4 — o CENTRO DE CUSTO, que é o `Setor` do M21.
 *
 * ⚠️ SEM `where: { ativo: true }`, E A AUSÊNCIA É A DECISÃO. Procurar por um setor desativado tem
 * de achar quem foi apropriado nele enquanto ele existia — filtrar por `ativo` aqui apagaria da
 * consulta o histórico inteiro de um centro de custo no dia em que alguém o desativasse. Quem
 * recusa setor inativo é o ATO (`exigirCentroDeCustoAtivo`, no serviço), não a leitura.
 */
async function idsDoCentroDeCusto(termo: string): Promise<readonly string[]> {
  const achados = await cliente().setor.findMany({
    where: { OR: [{ codigo: { contains: termo, mode: "insensitive" } }, { nome: { contains: termo, mode: "insensitive" } }] },
    select: { id: true },
  });
  return achados.map((x) => x.id);
}

type ServidorLidoParaLista = Prisma.ServidorGetPayload<{ select: typeof SELECAO_DO_SERVIDOR }>;

/**
 * A LINHA DA LISTA. `vinculoId` é o vínculo que CASOU com os eixos — quando há filtro de vínculo, é
 * ELE que a linha mostra, e não o primeiro vivo.
 *
 * ⚠️ MOSTRAR O PRIMEIRO VIVO SOB UM FILTRO DE CARGO SERIA MENTIR NA CÉLULA: quem procurou
 * "motorista" veria a linha da professora com o cargo "Professora" na coluna, e concluiria que o
 * filtro está quebrado — ou pior, que ela é motorista.
 */
async function montarLinhas(
  achados: readonly { readonly s: ServidorLidoParaLista; readonly vinculoId: string | null }[],
  quando: Date
): Promise<readonly LinhaDoMolde[]> {
  if (achados.length === 0) return [];
  const prisma = cliente();
  const [cs, ls, fs, ccs] = await Promise.all([
    prisma.cargo.findMany({ select: { id: true, codigo: true, denominacao: true } }),
    prisma.lotacao.findMany({ select: { id: true, codigo: true, nome: true } }),
    prisma.funcaoDePessoal.findMany({ select: { id: true, codigo: true, denominacao: true } }),
    prisma.setor.findMany({ select: { id: true, codigo: true, nome: true } }),
  ]);
  const cargos = new Map(cs.map((x) => [x.id, `${x.codigo} — ${x.denominacao}`]));
  const lotacoes = new Map(ls.map((x) => [x.id, `${x.codigo} — ${x.nome}`]));
  const funcoes = new Map(fs.map((x) => [x.id, `${x.codigo} — ${x.denominacao}`]));
  const centrosDeCusto = new Map(ccs.map((x) => [x.id, `${x.codigo} — ${x.nome}`]));

  return achados.map(({ s, vinculoId }) => {
    const casou = vinculoId === null ? undefined : s.vinculos.find((v) => v.id === vinculoId);
    const vivos = s.vinculos.filter((v) => situacaoDoVinculo(eventos(v.eventos), quando) !== "DESLIGADO");
    const mostrado = casou ?? vivos[0];
    const evs = mostrado === undefined ? [] : eventos(mostrado.eventos);
    return {
      id: s.id,
      nome: nomeDaPessoa(s.pessoa, s.nomeSocial),
      documento: formatarDocumento(s.pessoa.documento),
      vinculos: String(s.vinculos.length),
      matricula: mostrado === undefined ? "—" : mostrado.matricula,
      cargo: mostrado === undefined ? "—" : (cargos.get(cargoVigenteEm(evs, quando) ?? "") ?? "—"),
      lotacao: mostrado === undefined ? "—" : (lotacoes.get(lotacaoVigenteEm(evs, quando) ?? "") ?? "—"),
      // ⚠️ V11 V9.4 — AS DUAS COLUNAS NOVAS DERIVAM NO MESMO `quando` QUE O FILTRO USOU, e isso
      // não é detalhe de implementação: é o que separa a célula de uma mentira. Sob "servidores
      // em 31/05", mostrar o centro de custo de HOJE faria a linha dizer que a despesa de maio
      // foi apropriada num setor para onde a pessoa só se mudou em agosto — com o filtro e a
      // coluna discordando na mesma tela. Cargo, lotação e situação já faziam assim; o defeito
      // seria quebrar o padrão só nos dois novos.
      funcao: mostrado === undefined ? "—" : (funcoes.get(funcaoVigenteEm(evs, quando) ?? "") ?? "—"),
      centroDeCusto: mostrado === undefined ? "—" : (centrosDeCusto.get(centroDeCustoVigenteEm(evs, quando) ?? "") ?? "—"),
      situacao: situacaoDoServidor(s.vinculos.map((v) => eventos(v.eventos)), quando),
    };
  });
}

/**
 * ═══ A CONSULTA DE SERVIDORES — os oito eixos do TR 5.12.50, os seis que têm dado (V11 V9.4) ═══
 *
 * ⚠️ ESTA É A CONSULTA, E NÃO O RECORTE DO CÁLCULO DA FOLHA. A cláusula pede os eixos "na rotina de
 * cálculo"; entregá-los ali recortaria QUEM É CALCULADO, e `calcularFolha` (M33) promete "todos os
 * vínculos vivos na competência" POR CONSTRUÇÃO — o `findMany` de lá não tem `where` nenhum. Um
 * filtro do operador no cálculo produz folha PARCIAL em silêncio: o total bate, o empenho bate, e
 * nada compara o número de contracheques ao de vínculos ativos. A decisão de recortar o cálculo
 * está PENDENTE e nomeada em `modules/m33-folha/MODULO.md` e `modules/m32-pessoal/MODULO.md`.
 *
 * ═══ A REGRA DE COMPOSIÇÃO, EM DUAS CAMADAS ═══
 *
 *   · Os eixos do VÍNCULO (matrícula, cargo, lotação, regime jurídico, regime previdenciário, data
 *     de admissão) se conjugam sobre **UM MESMO VÍNCULO** — `vinculoAtendeAosEixos` recebe um de
 *     cada vez e aqui se faz `.some(...)`. A professora que também é motorista NÃO aparece numa
 *     busca por "motorista na Escola Central", e é o único jeito de o "E" significar "E".
 *   · `q`, `nome` e `situacao` são do SERVIDOR: os dois primeiros porque a identidade é da pessoa,
 *     e `situacao` porque é o agregado que a coluna sempre mostrou — torná-la per-vínculo mudaria
 *     em silêncio o significado de "só desligados" para quem já usa o filtro.
 *
 * ═══ POR QUE DUAS FASES, E POR QUE A PAGINAÇÃO EXIGE ISSO ═══
 *
 * O `where` do Prisma é SUPERCONJUNTO: ele estreita ("o cargo aparece em ALGUM evento de ALGUM
 * vínculo"), mas não decide — "aparece em algum evento" não é "vigente na data", e "algum vínculo"
 * não é "o mesmo vínculo". Quem decide é o predicado puro do domínio.
 *
 * ⚠️ E É POR ISSO QUE A PÁGINA NÃO PODE SAIR DO BANCO QUANDO HÁ EIXO DERIVADO. Era o defeito que
 * estava aqui: `situacao` era aplicada DEPOIS do `skip`/`take`, sobre as 25 linhas já recortadas —
 * o total virava "quantos ativos NESTA PÁGINA", e a página 2 perdia os ativos que ficaram na 1.
 * Com 25 servidores ou menos ninguém vê. É a vacuidade que o teste de duas páginas fecha.
 */
/**
 * ═══ ⚠️ A ÂNCORA DA DERIVAÇÃO É UM **DIA CIVIL DO ENTE**, NUNCA UM INSTANTE ═══
 *
 * Os eventos do histórico funcional são gravados em MEIO-DIA CIVIL (o mesmo `meioDiaCivil` que a
 * escrita usa), e as derivações comparam `e.data.getTime() <= quando.getTime()`. Ancorar o padrão
 * em `new Date()` cru faz a tela responder DIFERENTE conforme a hora do dia:
 *
 *   · promoção com efeito HOJE, gravada às 12:00 civis;
 *   · às 09h00 o RH filtra por "Diretor" sem data de referência: `quando` = 09:00, a promoção ainda
 *     não "aconteceu" — e **o servidor não aparece na lista**;
 *   · às 12h01 a MESMA consulta o traz. E informar `dataRef` com o MESMO DIA também o traz.
 *
 * Duas respostas para a mesma pergunta no mesmo dia, e a errada OMITE PESSOA de um filtro. O
 * `new Date()` cru já morava na linha antiga (`const hoje = new Date()`); o que mudou com os eixos
 * foi o raio de ação — antes errava uma célula, agora deixa gente de fora da lista. Achado na
 * auditoria de invariantes do V11 V9.4.
 *
 * ⚠️ `agora` ENTRA POR PARÂMETRO para que o teste prove isso numa hora ESCOLHIDA. Um teste que
 * dependesse do relógio da suíte só falharia antes do meio-dia — isto é, passaria por vacuidade
 * metade do dia, que é a pior espécie de verde.
 */
export function diaDeReferencia(dataRefBruta: string, agora: Date): Date {
  return meioDiaCivil(dataRefBruta === "" ? diaCivil(agora) : dataRefBruta);
}

/**
 * `opcoes.teto` existe para que a recusa por amplitude seja PROVÁVEL num teste, nas duas direções,
 * sem semear cinco mil servidores.
 *
 * ⚠️ É UM LIMITE, NÃO UM DUBLÊ: baixá-lo não troca o caminho do código nem finge um banco — faz a
 * MESMA consulta, sobre os MESMOS dados, recusar antes. Um guard que nunca foi visto acusar é um
 * guard que ninguém sabe se acusa, e já houve quatro defeitos dentro de instrumentos de medição
 * neste repositório.
 */
export async function listarServidores(
  c: ConsultaDoMolde,
  opcoes: { readonly teto?: number; readonly agora?: Date } = {}
): Promise<PaginaDoMolde> {
  return listarServidoresPara(await exigirSessao(), c, opcoes);
}

/**
 * ═══ ⚠️ O GATE MORA AQUI, NA PORTA — NÃO NA TELA QUE POR ACASO A CHAMA ═══
 *
 * A auditoria do V11 V9.4 acusou: a consulta não cobrava ação nenhuma, e só não vazava porque a
 * página era o ÚNICO chamador. **Proteção que depende de quem chama não é proteção — é uma
 * coincidência que dura até o próximo chamador.** A segunda rota a reusar esta porta (uma
 * exportação, uma API, um worker) nasceria sem gate, e o teste continuaria verde. Invariante 6:
 * autorização no servidor, por ação nomeada.
 *
 * ⚠️ E A PORTA **LANÇA**, NUNCA REDIRECIONA. `telaExigeLeituraDoEnte` responde à recusa com
 * `redirect("/sem-acesso")`, que é comportamento de TELA: um worker não redireciona, e uma porta
 * que redireciona está decidindo apresentação em nome de quem a chamou. Aqui se cobra pela
 * variante `...Para`, que estoura `EscopoDeLeituraError` NOMEANDO a ação que falta; quem traduz
 * isso em `/sem-acesso` é a página, que segue com o `exigirLeitura` dela. As duas cobranças
 * coexistem de propósito — a da tela dá a experiência, a da porta dá a garantia.
 *
 * ⚠️ É TAMBÉM O QUE TORNA A PROVA POSSÍVEL SEM ROTA: a suíte chama esta função com a identidade
 * na mão e afirma a recusa pelo MOTIVO. Mesmo par de `lerDossieDoEmpenho`/`lerDossieDoEmpenhoPara`
 * (`lib/portas/empenho.ts`), cujo comentário já diz "a que a suíte exercita".
 */
export async function listarServidoresPara(
  quem: Identidade,
  c: ConsultaDoMolde,
  opcoes: { readonly teto?: number; readonly agora?: Date } = {}
): Promise<PaginaDoMolde> {
  await exigirLeituraDoEntePara(quem, "CONSULTAR_PESSOAL");
  const teto = opcoes.teto ?? TETO_DE_CANDIDATOS;
  const prisma = cliente();
  const q = (c.filtros["q"] ?? "").trim();
  const nome = (c.filtros["nome"] ?? "").trim();
  const sit = c.filtros["situacao"] ?? "";
  const dataRefBruta = (c.filtros["dataRef"] ?? "").trim();
  const quando = diaDeReferencia(dataRefBruta, opcoes.agora ?? new Date());

  const termoDoCargo = (c.filtros["cargo"] ?? "").trim();
  const termoDaLotacao = (c.filtros["lotacao"] ?? "").trim();
  const termoDaFuncao = (c.filtros["funcao"] ?? "").trim();
  const termoDoCentroDeCusto = (c.filtros["centroDeCusto"] ?? "").trim();
  const [cargoIds, lotacaoIds, funcaoIds, centroDeCustoIds] = await Promise.all([
    termoDoCargo === "" ? Promise.resolve(null) : idsDoCargo(termoDoCargo),
    termoDaLotacao === "" ? Promise.resolve(null) : idsDaLotacao(termoDaLotacao),
    termoDaFuncao === "" ? Promise.resolve(null) : idsDaFuncao(termoDaFuncao),
    termoDoCentroDeCusto === "" ? Promise.resolve(null) : idsDoCentroDeCusto(termoDoCentroDeCusto),
  ]);
  const regimePrevBruto = c.filtros["regimePrev"] ?? "";
  const admitidoDeBruto = (c.filtros["admitidoDe"] ?? "").trim();
  const admitidoAteBruto = (c.filtros["admitidoAte"] ?? "").trim();

  const eixos: EixosDeConsultaDeVinculo = {
    matricula: (c.filtros["matricula"] ?? "").trim(),
    cargoIds,
    lotacaoIds,
    regimeJuridico: (c.filtros["regimeJuridico"] ?? "").trim(),
    regimePrevidenciario:
      regimePrevBruto === "" ? null : (regimePrevBruto as EixosDeConsultaDeVinculo["regimePrevidenciario"]),
    funcaoIds,
    centroDeCustoIds,
    admitidoDe: admitidoDeBruto === "" ? null : inicioDoDiaCivil(admitidoDeBruto),
    // ⚠️ O ÚLTIMO INSTANTE CIVIL DO DIA. `lte` sobre a meia-noite deixaria de fora quem foi
    // admitido NO dia escolhido — e "admitidos até 31/12" sem o 31/12 é um relatório errado.
    admitidoAte: admitidoAteBruto === "" ? null : fimDoDiaCivil(admitidoAteBruto),
  };

  // ── Fase 1: o SUPERCONJUNTO, no banco ─────────────────────────────────────────────────────
  const doServidor: Prisma.ServidorWhereInput[] = [];
  if (q !== "") {
    doServidor.push({
      OR: [
        { pessoa: { documento: { contains: q.replace(/\D/g, "") || q } } },
        { pessoa: { versoes: { some: { nome: { contains: q, mode: "insensitive" } } } } },
        { nomeSocial: { contains: q, mode: "insensitive" } },
        { vinculos: { some: { matricula: { contains: q, mode: "insensitive" } } } },
      ],
    });
  }
  if (nome !== "") {
    // ⚠️ O NOME É PROCURADO PELOS DOIS, e é decisão de produto, não de implementação. O que a tela
    // MOSTRA é o social quando há (Lei 14.164/2021 e Decreto 8.727/2016; `nomeDaPessoa` já fazia
    // isso). O que a busca ACHA tem de ser os dois: quem usa nome social e não é encontrado por
    // ele é defeito de produto — e quem é procurado pelo nome que está na portaria e não é
    // encontrado também. E `versoes: { some }` procura em TODA versão da pessoa, não só na
    // vigente: quem procura pelo nome de solteira de alguém que casou procura a pessoa certa.
    doServidor.push({
      OR: [
        { nomeSocial: { contains: nome, mode: "insensitive" } },
        { pessoa: { versoes: { some: { nome: { contains: nome, mode: "insensitive" } } } } },
      ],
    });
  }
  const doVinculo: Prisma.VinculoWhereInput = {
    ...(eixos.matricula !== "" ? { matricula: { contains: eixos.matricula, mode: "insensitive" } } : {}),
    ...(eixos.regimeJuridico !== "" ? { regimeJuridico: { contains: eixos.regimeJuridico, mode: "insensitive" } } : {}),
    ...(eixos.admitidoDe !== null || eixos.admitidoAte !== null
      ? { dataAdmissao: { ...(eixos.admitidoDe !== null ? { gte: eixos.admitidoDe } : {}), ...(eixos.admitidoAte !== null ? { lte: eixos.admitidoAte } : {}) } }
      : {}),
    ...(cargoIds !== null ? { eventos: { some: { cargoId: { in: [...cargoIds] } } } } : {}),
    ...(lotacaoIds !== null ? { eventos: { some: { lotacaoId: { in: [...lotacaoIds] } } } } : {}),
    ...(funcaoIds !== null ? { eventos: { some: { funcaoId: { in: [...funcaoIds] } } } } : {}),
    ...(centroDeCustoIds !== null ? { eventos: { some: { centroDeCustoId: { in: [...centroDeCustoIds] } } } } : {}),
  };
  if (Object.keys(doVinculo).length > 0) doServidor.push({ vinculos: { some: doVinculo } });
  const where: Prisma.ServidorWhereInput = doServidor.length === 0 ? {} : { AND: doServidor };

  // ⚠️ CONJUNTO VAZIO DE CARGOS OU LOTAÇÕES ENCERRA A CONSULTA AQUI. O `in: []` do Prisma já
  // devolveria nada, mas dizê-lo evita que uma refatoração leia `[]` como "sem filtro".
  if (
    (cargoIds !== null && cargoIds.length === 0) ||
    (lotacaoIds !== null && lotacaoIds.length === 0) ||
    (funcaoIds !== null && funcaoIds.length === 0) ||
    (centroDeCustoIds !== null && centroDeCustoIds.length === 0)
  ) {
    return { total: 0, linhas: [] };
  }

  // ⚠️ O DESEMPATE POR `id` NÃO É ENFEITE. Página 1 e página 2 são duas requisições, e cada uma
  // refaz a consulta inteira — o Postgres não promete ordem entre linhas EMPATADAS. `criadoEm` é
  // `now()`, o instante da TRANSAÇÃO: qualquer carga que crie vários servidores numa transação só
  // produz empates em bloco, e aí a página 2 repete e perde gente. Hoje `cadastrarServidor` abre
  // uma transação por servidor e o empate não ocorre — o desempate existe para que a propriedade
  // não dependa disso.
  const ordem: Prisma.ServidorOrderByWithRelationInput[] =
    c.ordem === "nome"
      ? [{ pessoa: { documento: c.direcao } }, { id: "asc" }]
      : [{ criadoEm: "desc" }, { id: "asc" }];

  // ── O caminho rápido: nada a derivar; o banco recorta a página e o total é dele ────────────
  if (!haEixoDerivadoDeVinculo(eixos) && sit === "") {
    const [total, achados] = await Promise.all([
      prisma.servidor.count({ where }),
      prisma.servidor.findMany({ where, orderBy: ordem, ...paginacao(c), select: SELECAO_DO_SERVIDOR }),
    ]);
    const comVinculo = achados.map((s) => ({
      s,
      vinculoId: haEixoDeVinculo(eixos)
        ? (s.vinculos.find((v) => vinculoAtendeAosEixos({ matricula: v.matricula, regimeJuridico: v.regimeJuridico, dataAdmissao: v.dataAdmissao, regimePrevidenciario: v.regimePrevidenciario, eventos: eventos(v.eventos) }, eixos, quando))?.id ?? null)
        : null,
    }));
    return { total, linhas: await montarLinhas(comVinculo, quando) };
  }

  // ── Fase 2: apurar o conjunto INTEIRO, decidir pela derivação, e só ENTÃO paginar ──────────
  const candidatos = await prisma.servidor.count({ where });
  if (candidatos > teto) throw new ConsultaDePessoalAmplaDemaisError(candidatos, teto);

  const enxutos = await prisma.servidor.findMany({
    where, orderBy: ordem,
    select: { id: true, vinculos: { orderBy: { dataAdmissao: "asc" }, select: SELECAO_ENXUTA_DO_VINCULO } },
  });

  const casaram: { readonly id: string; readonly vinculoId: string | null }[] = [];
  for (const s of enxutos) {
    const porVinculo = s.vinculos.map((v) => ({ v, evs: eventosEnxutos(v.eventos) }));
    if (sit !== "" && situacaoDoServidor(porVinculo.map((x) => x.evs), quando) !== sit) continue;
    if (!haEixoDeVinculo(eixos)) {
      casaram.push({ id: s.id, vinculoId: null });
      continue;
    }
    const casou = porVinculo.find((x) =>
      vinculoAtendeAosEixos({ matricula: x.v.matricula, regimeJuridico: x.v.regimeJuridico, dataAdmissao: x.v.dataAdmissao, regimePrevidenciario: x.v.regimePrevidenciario, eventos: x.evs }, eixos, quando)
    );
    if (casou !== undefined) casaram.push({ id: s.id, vinculoId: casou.v.id });
  }

  const { skip, take } = paginacao(c);
  const daPagina = casaram.slice(skip, skip + take);
  if (daPagina.length === 0) return { total: casaram.length, linhas: [] };

  // ⚠️ A ORDEM É A DO CONJUNTO APURADO, não a do segundo `findMany`: um `in` não promete ordem
  // nenhuma, e reordenar aqui faria a página 2 repetir gente da página 1.
  const cheios = await prisma.servidor.findMany({ where: { id: { in: daPagina.map((x) => x.id) } }, select: SELECAO_DO_SERVIDOR });
  const porId = new Map(cheios.map((s) => [s.id, s]));
  const emOrdem = daPagina.flatMap((x) => {
    const s = porId.get(x.id);
    return s === undefined ? [] : [{ s, vinculoId: x.vinculoId }];
  });
  return { total: casaram.length, linhas: await montarLinhas(emOrdem, quando) };
}

export interface ServidorLido extends DetalheLido {
  readonly vinculos: readonly { readonly id: string; readonly matricula: string; readonly situacao: SituacaoVinculo }[];
}

export async function verServidor(id: string): Promise<ServidorLido | null> {
  const prisma = cliente();
  const s = await prisma.servidor.findUnique({
    where: { id },
    select: {
      ...SELECAO_DO_SERVIDOR,
      dependentes: { orderBy: { criadoEm: "asc" }, select: { id: true, nome: true, dataNascimento: true, grauParentesco: true, criadoEm: true, criadoPor: true, finalidades: { select: { finalidade: true, dataInicio: true, dataBaixa: true, limiteIdadeAnos: true, encerramento: { select: { id: true, dataEfeito: true, motivo: true, criadoEm: true, criadoPor: true } } } } } },
      anotacoes: { orderBy: { data: "asc" }, select: { id: true, data: true, tipo: true, titulo: true, texto: true, criadoEm: true, criadoPor: true } },
      treinamentos: { orderBy: { dataInicio: "asc" }, select: { id: true, descricao: true, instituicao: true, cargaHoraria: true, dataInicio: true, dataTermino: true, criadoEm: true, criadoPor: true } },
    },
  });
  if (s === null) return null;
  const hoje = new Date();
  const [cargos, lotacoes] = await Promise.all([
    prisma.cargo.findMany({ select: { id: true, codigo: true, denominacao: true } }),
    prisma.lotacao.findMany({ select: { id: true, codigo: true, nome: true } }),
  ]);
  const cargoDe = new Map(cargos.map((x) => [x.id, `${x.codigo} — ${x.denominacao}`]));
  const lotacaoDe = new Map(lotacoes.map((x) => [x.id, `${x.codigo} — ${x.nome}`]));
  const nome = nomeDaPessoa(s.pessoa, s.nomeSocial);
  const versao = s.pessoa.versoes[0];

  const vinculos = s.vinculos.map((v) => {
    const evs = eventos(v.eventos);
    return { v, evs, situacao: situacaoDoVinculo(evs, hoje), cargo: cargoDe.get(cargoVigenteEm(evs, hoje) ?? "") ?? "—", lotacao: lotacaoDe.get(lotacaoVigenteEm(evs, hoje) ?? "") ?? "—", salario: salarioBaseVigenteEm(evs, hoje), gratificacoes: gratificacoesVigentesEm(evs, hoje), regime: regimeVigenteEm(evs, v.regimePrevidenciario, hoje) };
  });

  const dados = [
    { rotulo: "Pessoa (cadastro único)", valor: `${versao?.nome ?? s.pessoa.documento} · ${formatarDocumento(s.pessoa.documento)}`, nota: "CPF, nome, endereço e contatos vivem no cadastro de pessoas (cadastro de pessoas); aqui só o que é do servidor." },
    { rotulo: "Nome social", valor: s.nomeSocial ?? "—" },
    { rotulo: "Nascimento", valor: diaCivilBr(s.dataNascimento), tipo: "data" as const },
    { rotulo: "Sexo", valor: s.sexo },
    { rotulo: "PIS/PASEP", valor: s.pisPasep ?? "—" },
    { rotulo: "RG", valor: s.rgNumero === null ? "—" : `${s.rgNumero}${s.rgOrgaoEmissor !== null ? ` ${s.rgOrgaoEmissor}` : ""}${s.rgUf !== null ? `/${s.rgUf}` : ""}` },
    { rotulo: "Título de eleitor", valor: s.tituloEleitor ?? "—" },
    { rotulo: "CTPS", valor: s.ctpsNumero === null ? "—" : `${s.ctpsNumero}${s.ctpsSerie !== null ? ` série ${s.ctpsSerie}` : ""}` },
    { rotulo: "Filiação", valor: [s.nomeMae, s.nomePai].filter((x) => x !== null).join(" · ") || "—" },
    { rotulo: "Contato (da pessoa)", valor: [versao?.email, versao?.telefone].filter((x) => x !== null && x !== undefined).join(" · ") || "—" },
    ...vinculos.map((x) => ({
      rotulo: `Vínculo ${x.v.matricula}`,
      valor: `${x.situacao} · ${x.v.tipo} · ${x.v.regimeJuridico} · previdência: ${x.regime ?? "NÃO INFORMADA — a folha recusa calcular esta matrícula"} · desde ${diaCivilBr(x.v.dataAdmissao)} · cargo: ${x.cargo} · lotação: ${x.lotacao} · salário base: ${x.salario?.toFixed(2) ?? "—"}${x.gratificacoes.length > 0 ? ` · gratificações: ${x.gratificacoes.map((g) => `${g.descricao} ${g.valor.toFixed(2)}`).join(", ")}` : ""}`,
      nota: "Cargo, lotação, salário, regime previdenciário e situação derivados dos eventos até hoje — a folha de cada competência usa os DAQUELA competência.",
    })),
    { rotulo: "Cadastrado em", valor: diaCivilBr(s.criadoEm), tipo: "data" as const },
    { rotulo: "Cadastrado por", valor: s.criadoPor },
  ];

  const historico: LinhaDoHistorico[] = [
    ...vinculos.flatMap((x) => [
      { id: x.v.id, oQue: `Vínculo ${x.v.matricula} (${x.v.tipo})`, quando: diaCivilBr(x.v.dataAdmissao), registradoEm: diaCivilBr(x.v.criadoEm), por: x.v.criadoPor, motivo: x.v.regimeJuridico },
      ...x.v.eventos.map((e) => ({
        id: e.id,
        oQue: `${ROTULO_DO_EVENTO[e.tipo] ?? e.tipo} · ${x.v.matricula}`,
        quando: diaCivilBr(e.data), registradoEm: diaCivilBr(e.criadoEm), por: e.criadoPor,
        motivo: [
          e.cargo !== null ? `cargo ${e.cargo.codigo} — ${e.cargo.denominacao}` : null,
          e.lotacao !== null ? `lotação ${e.lotacao.codigo} — ${e.lotacao.nome}` : null,
          e.salarioBase !== null ? `salário ${e.salarioBase.toFixed(2)}` : null,
          e.regimePrevidenciario !== null ? `previdência ${e.regimePrevidenciario}` : null,
          e.gratificacaoDescricao !== null ? `gratificação ${e.gratificacaoDescricao} ${e.gratificacaoValor?.toFixed(2) ?? ""}` : null,
          e.portaria !== null ? `portaria ${e.portaria.numero}/${e.portaria.ano}` : null,
          e.motivo,
        ].filter((p) => p !== null).join(" · "),
        ...(e.salarioBase !== null ? { valor: e.salarioBase.toFixed(2) } : {}),
      })),
    ]),
    ...s.dependentes.map((d) => ({ id: d.id, oQue: `Dependente: ${d.nome} (${d.grauParentesco})`, quando: diaCivilBr(d.dataNascimento), registradoEm: diaCivilBr(d.criadoEm), por: d.criadoPor, motivo: d.finalidades.map((f) => { const b = baixaEfetiva(f); return `${f.finalidade} desde ${diaCivilBr(f.dataInicio)}${b !== null ? ` (encerrada em ${diaCivilBr(b)})` : f.limiteIdadeAnos !== null ? ` (até ${f.limiteIdadeAnos} anos)` : ""}`; }).join(" · ") })),
    ...s.dependentes.flatMap((d) => d.finalidades.flatMap((f) => (f.encerramento === null ? [] : [{ id: f.encerramento.id, oQue: `Finalidade ${f.finalidade} de ${d.nome} ENCERRADA`, quando: diaCivilBr(f.encerramento.dataEfeito), registradoEm: diaCivilBr(f.encerramento.criadoEm), por: f.encerramento.criadoPor, motivo: f.encerramento.motivo }]))),
    ...s.anotacoes.map((a) => ({ id: a.id, oQue: `Anotação: ${a.tipo} — ${a.titulo}`, quando: diaCivilBr(a.data), registradoEm: diaCivilBr(a.criadoEm), por: a.criadoPor, motivo: a.texto })),
    ...s.treinamentos.map((tr) => ({ id: tr.id, oQue: `Treinamento: ${tr.descricao}`, quando: diaCivilBr(tr.dataInicio), registradoEm: diaCivilBr(tr.criadoEm), por: tr.criadoPor, motivo: [tr.instituicao, tr.cargaHoraria !== null ? `${tr.cargaHoraria} h` : null, tr.dataTermino !== null ? `até ${diaCivilBr(tr.dataTermino)}` : null].filter((p) => p !== null).join(" · ") })),
  ];

  const ativos = vinculos.filter((x) => x.situacao !== "DESLIGADO").length;
  return {
    titulo: nome,
    subtitulo: `${formatarDocumento(s.pessoa.documento)} · ${s.vinculos.length} vínculo(s), ${ativos} vivo(s)`,
    selos: [
      s.vinculos.length === 0 ? { texto: "SEM VÍNCULO", tom: "neutro" as const } : ativos === 0 ? { texto: "DESLIGADO", tom: "erro" as const } : vinculos.some((x) => x.situacao === "AFASTADO") ? { texto: "AFASTADO", tom: "alerta" as const } : { texto: "ATIVO", tom: "ok" as const },
      ...(s.vinculos.length > 1 ? [{ texto: `${s.vinculos.length} matrículas — confira a acumulação`, tom: "alerta" as const }] : []),
    ],
    dados,
    historico,
    vinculos: vinculos.map((x) => ({ id: x.v.id, matricula: x.v.matricula, situacao: x.situacao })),
  };
}

/** As opções das telas do servidor. Com `servidorId`, as matrículas oferecidas são SÓ as dele (vivas). */
export async function opcoesDoServidor(servidorId?: string): Promise<OpcoesDoCadastro> {
  const prisma = cliente();
  const [pessoas, cargos, lotacoes, vinculos, finalidades, funcoes, setores] = await Promise.all([
    prisma.pessoa.findMany({
      where: { tipo: "FISICA", servidor: null },
      orderBy: { documento: "asc" }, take: 500,
      select: { id: true, documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } },
    }),
    prisma.cargo.findMany({ where: { dataExtincao: null }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true, denominacao: true } }),
    prisma.lotacao.findMany({ where: { dataExtincao: null }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true, nome: true } }),
    servidorId === undefined ? Promise.resolve([]) : prisma.vinculo.findMany({ where: { servidorId }, orderBy: { dataAdmissao: "asc" }, select: { id: true, matricula: true, tipo: true, regimePrevidenciario: true, eventos: SELECAO_DE_EVENTOS } }),
    // Só as finalidades SEM encerramento (nem legado): as encerradas são histórico, não ato possível.
    servidorId === undefined ? Promise.resolve([]) : prisma.finalidadeDependente.findMany({ where: { dependente: { servidorId }, dataBaixa: null, encerramento: null }, orderBy: { dataInicio: "asc" }, select: { id: true, finalidade: true, dataInicio: true, dependente: { select: { nome: true } } } }),
    // V11 V9.5 — só as VIGENTES: designar para função extinta é recusado pelo serviço
    // (`FUNCAO-EXTINTA`), e oferecê-la na lista seria um formulário que convida ao erro.
    prisma.funcaoDePessoal.findMany({ where: { dataExtincao: null }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true, denominacao: true } }),
    // ⚠️ SÓ OS ATIVOS, e aqui a regra é `ativo`, não vigência: o `Setor` do M21 desativa por
    // boolean e não guarda data (`CENTRO-DE-CUSTO-SEM-VIGENCIA-HISTORICA`). A LISTA oferece só os
    // ativos porque apropriar em setor morto é recusado pelo serviço; a CONSULTA continua achando
    // os inativos, senão o histórico sumiria da tela ao desativar um setor.
    prisma.setor.findMany({ where: { ativo: true }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true, nome: true } }),
  ]);
  const hoje = new Date();
  return {
    pessoaId: pessoas.map((p) => ({ valor: p.id, rotulo: `${p.versoes[0]?.nome ?? p.documento} (${formatarDocumento(p.documento)})` })),
    cargoId: cargos.map((c) => ({ valor: c.id, rotulo: `${c.codigo} — ${c.denominacao}` })),
    lotacaoId: lotacoes.map((l) => ({ valor: l.id, rotulo: `${l.codigo} — ${l.nome}` })),
    funcaoId: funcoes.map((f) => ({ valor: f.id, rotulo: `${f.codigo} — ${f.denominacao}` })),
    centroDeCustoId: setores.map((x) => ({ valor: x.id, rotulo: `${x.codigo} — ${x.nome}` })),
    finalidadeId: finalidades.map((f) => ({ valor: f.id, rotulo: `${f.dependente.nome} · ${f.finalidade} desde ${diaCivilBr(f.dataInicio)}` })),
    vinculoId: vinculos
      .map((v) => ({ v, situacao: situacaoDoVinculo(eventos(v.eventos), hoje) }))
      .filter((x) => x.situacao !== "DESLIGADO")
      .map((x) => ({ valor: x.v.id, rotulo: `${x.v.matricula} · ${x.v.tipo} · ${ROTULO_DA_SITUACAO[x.situacao]}` })),
    // ⚠️ ESTA LISTA INCLUI OS DESLIGADOS, e é a única que inclui: a carga do regime previdenciário
    // do legado alcança o vínculo que já acabou (a folha ainda o paga pelos dias em que ele
    // viveu). As demais movimentações continuam sem ele — e por isso são duas listas, não uma com
    // um aviso.
    vinculoRegimeId: vinculos.map((v) => {
      const evs = eventos(v.eventos);
      const situacao = situacaoDoVinculo(evs, hoje);
      const regime = regimeVigenteEm(evs, v.regimePrevidenciario, hoje);
      return { valor: v.id, rotulo: `${v.matricula} · ${v.tipo} · ${ROTULO_DA_SITUACAO[situacao]} · previdência: ${regime ?? "NÃO INFORMADA"}` };
    }),
  };
}

export async function criarServidor(c: Campos): Promise<string> {
  return comEscritaAutenticada("CADASTRAR_SERVIDOR", async (criadoPor) => {
    const r = await cadastrarServidor(cliente(), {
      pessoaId: t(c, "pessoaId"),
      ...(opcional(c, "nomeSocial") !== undefined ? { nomeSocial: t(c, "nomeSocial") } : {}),
      dataNascimento: dia(c, "dataNascimento"),
      sexo: t(c, "sexo") as "MASCULINO" | "FEMININO" | "NAO_INFORMADO",
      ...(opcional(c, "pisPasep") !== undefined ? { pisPasep: t(c, "pisPasep") } : {}),
      ...(opcional(c, "rgNumero") !== undefined ? { rgNumero: t(c, "rgNumero") } : {}),
      ...(opcional(c, "rgOrgaoEmissor") !== undefined ? { rgOrgaoEmissor: t(c, "rgOrgaoEmissor") } : {}),
      ...(opcional(c, "rgUf") !== undefined ? { rgUf: t(c, "rgUf") } : {}),
      ...(opcional(c, "tituloEleitor") !== undefined ? { tituloEleitor: t(c, "tituloEleitor") } : {}),
      ...(opcional(c, "ctpsNumero") !== undefined ? { ctpsNumero: t(c, "ctpsNumero") } : {}),
      ...(opcional(c, "ctpsSerie") !== undefined ? { ctpsSerie: t(c, "ctpsSerie") } : {}),
      ...(opcional(c, "nomeMae") !== undefined ? { nomeMae: t(c, "nomeMae") } : {}),
      ...(opcional(c, "nomePai") !== undefined ? { nomePai: t(c, "nomePai") } : {}),
      criadoPor,
    });
    return r.servidorId;
  });
}

/** As ações do detalhe do servidor. A pertença da matrícula ao servidor é conferida aqui; a regra é do domínio. */
export async function acaoDoServidor(acao: string, servidorId: string, c: Campos): Promise<string> {
  const prisma = cliente();
  const exigirVinculoDoServidor = async (): Promise<string> => {
    const v = await prisma.vinculo.findUnique({ where: { id: t(c, "vinculoId") }, select: { id: true, servidorId: true, matricula: true } });
    if (v === null || v.servidorId !== servidorId) throw new Error("O vínculo informado não é deste servidor. Nada foi gravado.");
    return v.id;
  };
  switch (acao) {
    case "admitir": {
      const r = await comEscritaAutenticada("ADMITIR_SERVIDOR", (criadoPor) =>
        admitirServidor(prisma, {
          servidorId, matricula: t(c, "matricula"), tipo: t(c, "tipo") as "EFETIVO", regimeJuridico: t(c, "regimeJuridico"),
          ...(opcional(c, "regimePrevidenciario") !== undefined ? { regimePrevidenciario: t(c, "regimePrevidenciario") as "RGPS" | "RPPS" | "ISENTO" } : {}),
          dataAdmissao: dia(c, "dataAdmissao"), cargoId: t(c, "cargoId"), lotacaoId: t(c, "lotacaoId"), salarioBase: decimalDaTela(t(c, "salarioBase")),
          ...(opcional(c, "centroDeCustoId") !== undefined ? { centroDeCustoId: t(c, "centroDeCustoId") } : {}),
          ...(opcional(c, "observacao") !== undefined ? { observacao: t(c, "observacao") } : {}), criadoPor,
        })
      );
      return r.alertaAcumulacao.length > 0
        ? `Vínculo admitido. ATENÇÃO — acumulação: esta pessoa já tem ${r.alertaAcumulacao.map((a) => `${a.matricula} (${a.tipo})`).join(", ")}. Confira o limite constitucional.`
        : "Vínculo admitido: matrícula, cargo, lotação e salário registrados como evento de admissão.";
    }
    case "informar-regime": {
      const v = await prisma.vinculo.findUnique({ where: { id: t(c, "vinculoRegimeId") }, select: { id: true, servidorId: true } });
      if (v === null || v.servidorId !== servidorId) throw new Error("O vínculo informado não é deste servidor. Nada foi gravado.");
      await comEscritaAutenticada("MOVIMENTAR_SERVIDOR", (criadoPor) =>
        registrarMovimentacao(prisma, {
          vinculoId: v.id, tipo: "MUDANCA_REGIME_PREVIDENCIARIO", data: dia(c, "data"), motivo: t(c, "motivo"),
          regimePrevidenciario: t(c, "regimePrevidenciario") as "RGPS" | "RPPS" | "ISENTO", criadoPor,
        })
      );
      return "Regime previdenciário informado como fato datado. A folha de cada competência passa a aplicar o regime daquela competência.";
    }
    case "movimentar": {
      const vinculoId = await exigirVinculoDoServidor();
      await comEscritaAutenticada("MOVIMENTAR_SERVIDOR", (criadoPor) =>
        registrarMovimentacao(prisma, {
          vinculoId, tipo: t(c, "tipo") as "MUDANCA_CARGO", data: dia(c, "data"), motivo: t(c, "motivo"),
          ...(opcional(c, "cargoId") !== undefined ? { cargoId: t(c, "cargoId") } : {}),
          ...(opcional(c, "lotacaoId") !== undefined ? { lotacaoId: t(c, "lotacaoId") } : {}),
          // ⚠️ V11 V9.5 — E A DISPENSA NÃO MANDA `funcaoId` PORQUE O FORMULÁRIO PODE TRAZÊ-LO
          // PREENCHIDO de uma escolha anterior do operador. `opcional()` devolve o que veio, e o
          // `superRefine` do domínio recusa dispensa COM função — logo, mandar em branco é
          // responsabilidade de quem monta o comando, não do usuário lembrar de limpar o campo.
          ...(t(c, "tipo") !== "DISPENSA_FUNCAO" && opcional(c, "funcaoId") !== undefined ? { funcaoId: t(c, "funcaoId") } : {}),
          ...(opcional(c, "centroDeCustoId") !== undefined ? { centroDeCustoId: t(c, "centroDeCustoId") } : {}),
          ...(opcional(c, "regimePrevidenciario") !== undefined ? { regimePrevidenciario: t(c, "regimePrevidenciario") as "RGPS" | "RPPS" | "ISENTO" } : {}), criadoPor,
        })
      );
      return "Movimentação registrada como evento do vínculo; cargo, lotação e regime previdenciário de hoje já refletem — e o passado não muda.";
    }
    case "alterar-remuneracao": {
      const vinculoId = await exigirVinculoDoServidor();
      await comEscritaAutenticada("ALTERAR_REMUNERACAO", (criadoPor) =>
        registrarAlteracaoRemuneratoria(prisma, {
          vinculoId, tipo: t(c, "tipo") as "PROMOCAO", data: dia(c, "data"), motivo: t(c, "motivo"),
          ...(opcional(c, "cargoId") !== undefined ? { cargoId: t(c, "cargoId") } : {}),
          ...(opcional(c, "salarioBase") !== undefined ? { salarioBase: decimalDaTela(t(c, "salarioBase")) } : {}),
          ...(opcional(c, "gratificacaoDescricao") !== undefined ? { gratificacaoDescricao: t(c, "gratificacaoDescricao") } : {}),
          ...(opcional(c, "gratificacaoValor") !== undefined ? { gratificacaoValor: decimalDaTela(t(c, "gratificacaoValor")) } : {}), criadoPor,
        })
      );
      return "Alteração remuneratória registrada como evento; o salário vigente já reflete.";
    }
    case "desligar": {
      const vinculoId = await exigirVinculoDoServidor();
      await comEscritaAutenticada("DESLIGAR_SERVIDOR", (criadoPor) => desligarServidor(prisma, { vinculoId, data: dia(c, "data"), motivo: t(c, "motivo"), criadoPor }));
      return "Vínculo desligado — evento terminal; readmitir é outro vínculo.";
    }
    case "dependente": {
      await comEscritaAutenticada("GERIR_DEPENDENTE", (criadoPor) =>
        cadastrarDependente(prisma, {
          servidorId, nome: t(c, "nome"), ...(opcional(c, "cpf") !== undefined ? { cpf: t(c, "cpf") } : {}), dataNascimento: dia(c, "dataNascimento"),
          grauParentesco: t(c, "grauParentesco") as "FILHO", invalidezPermanente: t(c, "invalidezPermanente") === "on" || t(c, "invalidezPermanente") === "true" || t(c, "invalidezPermanente") === "1",
          finalidade: t(c, "finalidade") as "IMPOSTO_RENDA", dataInicio: dia(c, "dataInicio"), criadoPor,
        })
      );
      return "Dependente cadastrado com a finalidade; a baixa por idade é derivada do limite legal.";
    }
    case "encerrar-finalidade": {
      const f = await prisma.finalidadeDependente.findUnique({ where: { id: t(c, "finalidadeId") }, select: { dependente: { select: { servidorId: true } } } });
      if (f === null || f.dependente.servidorId !== servidorId) throw new Error("A finalidade informada não é de dependente deste servidor. Nada foi gravado.");
      const r = await comEscritaAutenticada("BAIXAR_DEPENDENTE", (criadoPor) =>
        baixarFinalidadeDependente(prisma, { finalidadeId: t(c, "finalidadeId"), dataBaixa: dia(c, "dataEfeito"), motivoBaixa: t(c, "motivo"), criadoPor })
      );
      return r.competenciasFechadasAtingidas.length === 0
        ? "Finalidade encerrada. Ela deixa de valer a partir da data de efeito; nenhuma folha fechada é alcançada."
        : `Finalidade encerrada. ATENÇÃO: o efeito alcança folha(s) JÁ FECHADA(S) — ${r.competenciasFechadasAtingidas.join(", ")} — que NÃO foram recalculadas; a correção delas é retificação.`;
    }
    case "portaria": {
      const vinculoId = await exigirVinculoDoServidor();
      await comEscritaAutenticada("REGISTRAR_PORTARIA", (criadoPor) =>
        registrarPortaria(prisma, { vinculoId, numero: t(c, "numero"), ano: inteiro(c, "ano") ?? 0, tipo: t(c, "tipo") as "NOMEACAO", data: dia(c, "data"), ementa: t(c, "ementa"), criadoPor })
      );
      return "Portaria registrada no vínculo.";
    }
    case "anotacao": {
      await comEscritaAutenticada("REGISTRAR_ANOTACAO", (criadoPor) =>
        registrarAnotacaoServidor(prisma, { servidorId, data: dia(c, "data"), tipo: t(c, "tipo") as "ELOGIO", titulo: t(c, "titulo"), texto: t(c, "texto"), criadoPor })
      );
      return "Anotação registrada na ficha (permanente, com autor).";
    }
    case "treinamento": {
      await comEscritaAutenticada("REGISTRAR_TREINAMENTO", (criadoPor) =>
        registrarTreinamento(prisma, {
          servidorId, descricao: t(c, "descricao"), ...(opcional(c, "instituicao") !== undefined ? { instituicao: t(c, "instituicao") } : {}),
          ...(inteiro(c, "cargaHoraria") !== undefined ? { cargaHoraria: inteiro(c, "cargaHoraria") as number } : {}),
          dataInicio: dia(c, "dataInicio"), ...(opcional(c, "dataTermino") !== undefined ? { dataTermino: dia(c, "dataTermino") } : {}), criadoPor,
        })
      );
      return "Treinamento registrado.";
    }
    default:
      throw new Error(`Ação "${acao}" não existe neste cadastro. Nada foi gravado.`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CARGOS
// ═══════════════════════════════════════════════════════════════════════════

const ROTULO_DO_TIPO_DE_CARGO: Readonly<Record<string, string>> = { EFETIVO: "Efetivo", COMISSAO: "Em comissão", FUNCAO_GRATIFICADA: "Função gratificada", EMPREGO_PUBLICO: "Emprego público", TEMPORARIO: "Temporário", AGENTE_POLITICO: "Agente político" };

async function vinculosParaOcupacao(): Promise<readonly { readonly eventos: readonly EventoDoVinculo[] }[]> {
  const vs = await cliente().vinculo.findMany({ select: { eventos: SELECAO_DE_EVENTOS } });
  return vs.map((v) => ({ eventos: eventos(v.eventos) }));
}

export async function listarCargos(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = (c.filtros["q"] ?? "").trim();
  const where: Prisma.CargoWhereInput = q === "" ? {} : { OR: [{ codigo: { contains: q, mode: "insensitive" } }, { denominacao: { contains: q, mode: "insensitive" } }] };
  const [total, linhas, vinculos] = await Promise.all([
    prisma.cargo.count({ where }),
    prisma.cargo.findMany({ where, orderBy: c.ordem === "denominacao" ? { denominacao: c.direcao } : { codigo: c.direcao }, ...paginacao(c), select: { id: true, codigo: true, denominacao: true, tipo: true, vagasFixadas: true, dataExtincao: true } }),
    vinculosParaOcupacao(),
  ]);
  const hoje = new Date();
  return {
    total,
    linhas: linhas.map((x) => ({
      id: x.id, codigo: x.codigo, denominacao: x.denominacao, tipo: ROTULO_DO_TIPO_DE_CARGO[x.tipo] ?? x.tipo, vagasFixadas: String(x.vagasFixadas),
      ocupadas: String(vagasOcupadasDoCargo(vinculos, x.id, hoje)),
      situacao: x.dataExtincao !== null ? "EXTINTO" : vagasOcupadasDoCargo(vinculos, x.id, hoje) >= x.vagasFixadas ? "SEM VAGA" : "COM VAGA",
    })),
  };
}

export async function verCargo(id: string): Promise<DetalheLido | null> {
  const prisma = cliente();
  const x = await prisma.cargo.findUnique({ where: { id } });
  if (x === null) return null;
  const vinculos = await vinculosParaOcupacao();
  const hoje = new Date();
  const ocupadas = vagasOcupadasDoCargo(vinculos, x.id, hoje);
  const eventosDoCargo = await prisma.historicoVinculo.findMany({ where: { cargoId: x.id }, orderBy: { data: "asc" }, select: { id: true, tipo: true, data: true, criadoEm: true, criadoPor: true, motivo: true, vinculo: { select: { matricula: true } } } });
  return {
    titulo: `${x.codigo} — ${x.denominacao}`,
    subtitulo: `${ROTULO_DO_TIPO_DE_CARGO[x.tipo] ?? x.tipo} · ${x.vagasFixadas} vaga(s) fixada(s) · ${ocupadas} ocupada(s)`,
    selos: [x.dataExtincao !== null ? { texto: "EXTINTO", tom: "erro" } : ocupadas >= x.vagasFixadas ? { texto: "SEM VAGA", tom: "alerta" } : { texto: "COM VAGA", tom: "ok" }],
    dados: [
      { rotulo: "Código", valor: x.codigo }, { rotulo: "Denominação", valor: x.denominacao }, { rotulo: "Tipo", valor: ROTULO_DO_TIPO_DE_CARGO[x.tipo] ?? x.tipo },
      { rotulo: "Vagas fixadas em lei", valor: String(x.vagasFixadas), tipo: "inteiro" }, { rotulo: "Vagas ocupadas (contadas hoje)", valor: String(ocupadas), tipo: "inteiro", nota: "Vínculos vivos cujo cargo vigente hoje é este — contados a cada leitura." },
      { rotulo: "Lei de criação", valor: `${x.leiAutorizativa} (${diaCivilBr(x.dataPublicacaoLei)})` },
      { rotulo: "Extinção", valor: x.dataExtincao === null ? "—" : `${x.leiExtincao ?? ""} (${diaCivilBr(x.dataExtincao)})` },
      { rotulo: "Carga horária semanal", valor: x.cargaHorariaSemanal === null ? "—" : `${x.cargaHorariaSemanal} h` },
      { rotulo: "Requisito de ingresso", valor: x.requisitoIngresso ?? "—", tipo: "longo" },
      { rotulo: "Cadastrado por", valor: `${x.criadoPor} em ${diaCivilBr(x.criadoEm)}` },
    ],
    historico: eventosDoCargo.map((e) => ({ id: e.id, oQue: `${ROTULO_DO_EVENTO[e.tipo] ?? e.tipo} · ${e.vinculo.matricula}`, quando: diaCivilBr(e.data), registradoEm: diaCivilBr(e.criadoEm), por: e.criadoPor, motivo: e.motivo })),
  };
}

export async function opcoesDoCargo(): Promise<OpcoesDoCadastro> {
  return {};
}

export async function criarCargo(c: Campos): Promise<string> {
  return comEscritaAutenticada("CADASTRAR_CARGO", async (criadoPor) => {
    const r = await cadastrarCargo(cliente(), {
      codigo: t(c, "codigo"), denominacao: t(c, "denominacao"), tipo: t(c, "tipo") as "EFETIVO", vagasFixadas: inteiro(c, "vagasFixadas") ?? -1,
      leiAutorizativa: t(c, "leiAutorizativa"), dataPublicacaoLei: dia(c, "dataPublicacaoLei"),
      ...(opcional(c, "requisitoIngresso") !== undefined ? { requisitoIngresso: t(c, "requisitoIngresso") } : {}),
      ...(inteiro(c, "cargaHorariaSemanal") !== undefined ? { cargaHorariaSemanal: inteiro(c, "cargaHorariaSemanal") as number } : {}),
      criadoPor,
    });
    return r.cargoId;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNÇÕES DE PESSOAL (V11 V9.5) — a ponta de entrada dos dois eixos de 5.12.50
// ═══════════════════════════════════════════════════════════════════════════

/**
 * QUANTOS VÍNCULOS EXERCEM CADA FUNÇÃO HOJE — contado a cada leitura, nunca coluna.
 *
 * ⚠️ E É `funcaoVigenteEm`, NÃO `count` DE EVENTOS. Contar eventos `DESIGNACAO_FUNCAO` diria
 * quantas designações a função já teve na vida — incluindo todos os que já foram dispensados — e
 * o número cresceria para sempre, nunca caindo. A pergunta é "quem exerce HOJE", e só a derivação
 * responde, porque a dispensa não apaga o evento anterior: ela o encerra.
 */
async function exercendoPorFuncao(quando: Date): Promise<ReadonlyMap<string, number>> {
  const vs = await cliente().vinculo.findMany({ select: { eventos: SELECAO_ENXUTA_DO_VINCULO.eventos } });
  const conta = new Map<string, number>();
  for (const v of vs) {
    const f = funcaoVigenteEm(eventosEnxutos(v.eventos), quando);
    if (f !== null) conta.set(f, (conta.get(f) ?? 0) + 1);
  }
  return conta;
}

export async function listarFuncoes(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = (c.filtros["q"] ?? "").trim();
  const where: Prisma.FuncaoDePessoalWhereInput =
    q === "" ? {} : { OR: [{ codigo: { contains: q, mode: "insensitive" } }, { denominacao: { contains: q, mode: "insensitive" } }] };
  const hoje = new Date();
  const [total, linhas, exercendo] = await Promise.all([
    prisma.funcaoDePessoal.count({ where }),
    prisma.funcaoDePessoal.findMany({
      where,
      orderBy: c.ordem === "denominacao" ? { denominacao: c.direcao } : { codigo: c.direcao },
      ...paginacao(c),
      select: { id: true, codigo: true, denominacao: true, dataExtincao: true },
    }),
    exercendoPorFuncao(hoje),
  ]);
  return {
    total,
    linhas: linhas.map((x) => ({
      id: x.id,
      codigo: x.codigo,
      denominacao: x.denominacao,
      exercendo: String(exercendo.get(x.id) ?? 0),
      situacao: x.dataExtincao !== null ? "EXTINTA" : "VIGENTE",
    })),
  };
}

export async function verFuncao(id: string): Promise<DetalheLido | null> {
  const prisma = cliente();
  const x = await prisma.funcaoDePessoal.findUnique({ where: { id } });
  if (x === null) return null;
  const hoje = new Date();
  const exercendo = (await exercendoPorFuncao(hoje)).get(x.id) ?? 0;
  const eventosDaFuncao = await prisma.historicoVinculo.findMany({
    where: { funcaoId: x.id },
    orderBy: { data: "asc" },
    select: { id: true, tipo: true, data: true, criadoEm: true, criadoPor: true, motivo: true, vinculo: { select: { matricula: true } } },
  });
  return {
    titulo: `${x.codigo} — ${x.denominacao}`,
    subtitulo: `${exercendo} vínculo(s) exercendo hoje`,
    selos: [x.dataExtincao !== null ? { texto: "EXTINTA", tom: "erro" } : { texto: "VIGENTE", tom: "ok" }],
    dados: [
      { rotulo: "Código", valor: x.codigo },
      { rotulo: "Denominação", valor: x.denominacao },
      {
        rotulo: "Exercendo hoje", valor: String(exercendo), tipo: "inteiro",
        nota: "Vínculos cuja função vigente hoje é esta — derivado dos eventos de designação e dispensa, contado a cada leitura.",
      },
      { rotulo: "Lei ou ato de criação", valor: `${x.leiAutorizativa} (${diaCivilBr(x.dataPublicacaoLei)})` },
      { rotulo: "Extinção", valor: x.dataExtincao === null ? "—" : `${x.leiExtincao ?? ""} (${diaCivilBr(x.dataExtincao)})` },
      { rotulo: "Cadastrada por", valor: `${x.criadoPor} em ${diaCivilBr(x.criadoEm)}` },
    ],
    // ⚠️ O HISTÓRICO MOSTRA SÓ AS DESIGNAÇÕES, e a ausência das dispensas aqui é consequência do
    // desenho, não esquecimento: a dispensa NÃO carrega `funcaoId` (o CHECK é bicondicional), logo
    // ela não se prende a esta função no banco — ela encerra a que estiver vigente no vínculo.
    // Quem quiser a trajetória completa a vê na ficha do SERVIDOR, onde os eventos são do vínculo.
    historico: eventosDaFuncao.map((e) => ({
      id: e.id, oQue: `${ROTULO_DO_EVENTO[e.tipo] ?? e.tipo} · ${e.vinculo.matricula}`,
      quando: diaCivilBr(e.data), registradoEm: diaCivilBr(e.criadoEm), por: e.criadoPor, motivo: e.motivo,
    })),
  };
}

export async function opcoesDaFuncao(): Promise<OpcoesDoCadastro> {
  return {};
}

export async function criarFuncao(c: Campos): Promise<string> {
  // ⚠️ `CADASTRAR_CARGO` NÃO É DESCUIDO: é a MESMA autoridade (dizer o que a estrutura do ente
  // tem), e o censo de ações traz o argumento inteiro — inclusive a condição de reversão, se um
  // dia a função ganhar campo de valor.
  return comEscritaAutenticada("CADASTRAR_CARGO", async (criadoPor) => {
    const r = await cadastrarFuncao(cliente(), {
      codigo: t(c, "codigo"),
      denominacao: t(c, "denominacao"),
      leiAutorizativa: t(c, "leiAutorizativa"),
      dataPublicacaoLei: dia(c, "dataPublicacaoLei"),
      criadoPor,
    });
    return r.funcaoId;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// LOTAÇÕES
// ═══════════════════════════════════════════════════════════════════════════

export async function listarLotacoes(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = (c.filtros["q"] ?? "").trim();
  const where: Prisma.LotacaoWhereInput = q === "" ? {} : { OR: [{ codigo: { contains: q, mode: "insensitive" } }, { nome: { contains: q, mode: "insensitive" } }] };
  const [total, linhas, vinculos] = await Promise.all([
    prisma.lotacao.count({ where }),
    prisma.lotacao.findMany({ where, orderBy: c.ordem === "nome" ? { nome: c.direcao } : { codigo: c.direcao }, ...paginacao(c), select: { id: true, codigo: true, nome: true, pai: { select: { codigo: true } }, unidadeOrc: { select: { codigo: true, descricao: true } } } }),
    vinculosParaOcupacao(),
  ]);
  const hoje = new Date();
  return {
    total,
    linhas: linhas.map((x) => ({ id: x.id, codigo: x.codigo, nome: x.nome, pai: x.pai?.codigo ?? "—", unidade: x.unidadeOrc === null ? "—" : `${x.unidadeOrc.codigo} — ${x.unidadeOrc.descricao}`, lotados: String(lotadosNaLotacao(vinculos, x.id, hoje)) })),
  };
}

export async function verLotacao(id: string): Promise<DetalheLido | null> {
  const prisma = cliente();
  const x = await prisma.lotacao.findUnique({ where: { id }, include: { pai: { select: { codigo: true, nome: true } }, unidadeOrc: { select: { codigo: true, descricao: true } }, filhas: { select: { codigo: true, nome: true } } } });
  if (x === null) return null;
  const vinculos = await vinculosParaOcupacao();
  const hoje = new Date();
  const eventosDaLotacao = await prisma.historicoVinculo.findMany({ where: { lotacaoId: x.id }, orderBy: { data: "asc" }, select: { id: true, tipo: true, data: true, criadoEm: true, criadoPor: true, motivo: true, vinculo: { select: { matricula: true } } } });
  return {
    titulo: `${x.codigo} — ${x.nome}`,
    subtitulo: `${lotadosNaLotacao(vinculos, x.id, hoje)} lotado(s) hoje`,
    selos: [x.dataExtincao !== null ? { texto: "EXTINTA", tom: "erro" } : { texto: "VIGENTE", tom: "ok" }],
    dados: [
      { rotulo: "Código", valor: x.codigo }, { rotulo: "Nome", valor: x.nome },
      { rotulo: "Superior", valor: x.pai === null ? "— (raiz)" : `${x.pai.codigo} — ${x.pai.nome}` },
      { rotulo: "Unidade orçamentária", valor: x.unidadeOrc === null ? "—" : `${x.unidadeOrc.codigo} — ${x.unidadeOrc.descricao}` },
      { rotulo: "Subordinadas", valor: x.filhas.length === 0 ? "—" : x.filhas.map((f) => `${f.codigo} — ${f.nome}`).join(" · ") },
      { rotulo: "Lotados hoje", valor: String(lotadosNaLotacao(vinculos, x.id, hoje)), tipo: "inteiro", nota: "Vínculos vivos cuja lotação vigente hoje é esta — contados a cada leitura." },
      { rotulo: "Cadastrada por", valor: `${x.criadoPor} em ${diaCivilBr(x.criadoEm)}` },
    ],
    historico: eventosDaLotacao.map((e) => ({ id: e.id, oQue: `${ROTULO_DO_EVENTO[e.tipo] ?? e.tipo} · ${e.vinculo.matricula}`, quando: diaCivilBr(e.data), registradoEm: diaCivilBr(e.criadoEm), por: e.criadoPor, motivo: e.motivo })),
  };
}

export async function opcoesDaLotacao(): Promise<OpcoesDoCadastro> {
  const prisma = cliente();
  const [lotacoes, unidades] = await Promise.all([
    prisma.lotacao.findMany({ where: { dataExtincao: null }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true, nome: true } }),
    prisma.unidadeOrcamentaria.findMany({ orderBy: { codigo: "asc" }, select: { id: true, codigo: true, descricao: true } }),
  ]);
  return {
    paiId: lotacoes.map((l) => ({ valor: l.id, rotulo: `${l.codigo} — ${l.nome}` })),
    unidadeOrcId: unidades.map((u) => ({ valor: u.id, rotulo: `${u.codigo} — ${u.descricao}` })),
  };
}

export async function criarLotacao(c: Campos): Promise<string> {
  return comEscritaAutenticada("CADASTRAR_LOTACAO", async (criadoPor) => {
    const r = await cadastrarLotacao(cliente(), {
      codigo: t(c, "codigo"), nome: t(c, "nome"),
      ...(opcional(c, "paiId") !== undefined ? { paiId: t(c, "paiId") } : {}),
      ...(opcional(c, "unidadeOrcId") !== undefined ? { unidadeOrcId: t(c, "unidadeOrcId") } : {}),
      criadoPor,
    });
    return r.lotacaoId;
  });
}
