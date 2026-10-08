import { escopoDaAcaoDeLeitura } from "../../modules/m16-travamento/leitura.js";
import { pessoaDoUsuario } from "../../modules/m16-travamento/servico-pessoa-do-usuario.js";
import { formatarDocumento } from "../../packages/documento/index.js";
import type { AcaoDeLeitura } from "../../modules/m16-travamento/acoes.js";
import type { Prisma } from "../../prisma/generated/client/client.js";
import { cliente } from "./cliente";
import { saldoReconhecidoDe } from "../../modules/m04-receita/reconhecimento.js";
import { saldoAIncorporarDaLiquidacao } from "../../modules/m10-patrimonial/patrimonio.js";
import { saldoDaDividaAtivaEm } from "../../modules/m10-patrimonial/divida-ativa.js";
import { formatarMoeda } from "../../packages/contracts/moeda";
import { CATALOGOS_DA_EXECUCAO } from "./opcoes-da-execucao";
import { podeLerPara } from "./leitura";
import type { Identidade } from "./sessao";

/**
 * ═══ OS CATÁLOGOS DO SELETOR REFERENCIADO (V6.1 §4 / V6.2 U0) ═══
 *
 * Um `<select>` com 500 naturezas de despesa ordenadas por código é um formulário bonito e inútil
 * (CLAUDE.md, "Interface"). O seletor referenciado pesquisa no servidor, pagina, e só oferece o que
 * a sessão pode usar NAQUELE ato. Cada catálogo declara três coisas, e nenhuma é regra de negócio:
 *
 *   · a LEITURA exigida para conhecer a lista (fail-closed: sem ela, 403 com o motivo);
 *   · o RECORTE (a UO de uma ficha nova só entre as unidades onde a sessão tem CRIAR_FICHA);
 *   · a BUSCA (código que começa com, ou descrição que contém — sem acento de diferença).
 *
 * ⚠️ OFERECER NÃO É AUTORIZAR. O caso de uso resolve de novo cada código e autoriza na transação:
 * o seletor só evita que a pessoa escolha o que seria recusado. Uma opção que sumiu entre a busca e
 * o envio (outra aba, permissão revogada) é recusada lá, nomeando.
 *
 * ⚠️ VIGÊNCIA. As tabelas de classificação (função, programa, ação, natureza, fonte) NÃO têm
 * vigência no cadastro; a que existe é a do EXERCÍCIO, conferida pelo M08 dentro da transação da
 * ficha. Inventar aqui um "vigente" para programa seria a segunda régua — e ela divergiria.
 */

export interface OpcaoReferenciada {
  readonly valor: string;
  readonly rotulo: string;
  readonly detalhe?: string;
  /** V22: sugestão de preenchimento para a tela (documento, ficha, objeto) — nunca autoriza nada. */
  readonly dados?: Readonly<Record<string, string>>;
}

export interface PaginaDeOpcoes {
  readonly opcoes: readonly OpcaoReferenciada[];
  readonly temMais: boolean;
}

export const TAMANHO_DA_PAGINA_DE_OPCOES = 20;

interface PedidoDeOpcoes {
  readonly q: string;
  readonly pagina: number;
  /** Resolver UM valor já escolhido (revalidação quando o contexto muda). */
  readonly valor?: string;
  readonly contexto: Readonly<Record<string, string>>;
}

interface CatalogoDeOpcoes {
  readonly leitura: AcaoDeLeitura;
  buscar(sessao: Identidade, p: PedidoDeOpcoes): Promise<PaginaDeOpcoes>;
}

const contem = (q: string): Prisma.StringFilter => ({ contains: q, mode: "insensitive" });

function pagina<T>(linhas: readonly T[], p: PedidoDeOpcoes): { readonly linhas: readonly T[]; readonly temMais: boolean } {
  return { linhas: linhas.slice(0, TAMANHO_DA_PAGINA_DE_OPCOES), temMais: linhas.length > TAMANHO_DA_PAGINA_DE_OPCOES };
}
const skip = (p: PedidoDeOpcoes): number => (p.pagina - 1) * TAMANHO_DA_PAGINA_DE_OPCOES;
const take = TAMANHO_DA_PAGINA_DE_OPCOES + 1;

/** Catálogo simples por código/descrição — a forma das tabelas de classificação. */
function porCodigo(
  leitura: AcaoDeLeitura,
  consultar: (where: { q: string; valor?: string }, s: number, t: number) => Promise<readonly { codigo: string; texto: string }[]>
): CatalogoDeOpcoes {
  return {
    leitura,
    async buscar(_sessao, p) {
      const linhas = await consultar({ q: p.q, ...(p.valor !== undefined ? { valor: p.valor } : {}) }, skip(p), take);
      const r = pagina(linhas, p);
      return { opcoes: r.linhas.map((l) => ({ valor: l.codigo, rotulo: `${l.codigo} — ${l.texto}` })), temMais: r.temMais };
    },
  };
}

const onde = (w: { q: string; valor?: string }, campoTexto: string): Record<string, unknown> =>
  w.valor !== undefined ? { codigo: w.valor } : w.q === "" ? {} : { OR: [{ codigo: { startsWith: w.q } }, { [campoTexto]: contem(w.q) }] };

/** O mesmo recorte de classe que `declararContaDaLiquidacao` confere (M01). */
const PREFIXO_DO_EFEITO_NA_BUSCA: Readonly<Record<string, string>> = { VPD: "3.", IMOBILIZADO: "1.2.3.", INTANGIVEL: "1.2.4.", BAIXA_DE_PASSIVO: "2.", VPA: "4." };

export const CATALOGOS: Readonly<Record<string, CatalogoDeOpcoes>> = {
  ...CATALOGOS_DA_EXECUCAO,
  /**
   * A UO de uma FICHA NOVA — só as unidades onde a sessão tem CRIAR_FICHA. É o mesmo escopo que o
   * `autz.exigir(..., { ug })` do `criarFicha` confere; aqui ele só evita oferecer o que cairia.
   */
  /**
   * V37 — FORNECEDORES da ordem de compra e da formação de ordem: as pessoas do cadastro, por documento ou nome. O
   * valor é o ID da pessoa (é o que a ordem grava). Substitui o `select` com as 500 primeiras pessoas por documento,
   * que escondia a 501ª.
   */
  fornecedores: {
    leitura: "CONSULTAR_LICITACOES",
    async buscar(_sessao, p) {
      const digitos = p.q.replace(/\D/g, "");
      const where: Prisma.PessoaWhereInput =
        p.valor !== undefined
          ? { id: p.valor }
          : p.q === ""
            ? {}
            : { OR: [...(digitos.length >= 2 ? [{ documento: { startsWith: digitos } }] : []), { versoes: { some: { nome: contem(p.q) } } }] };
      const linhas = await cliente().pessoa.findMany({
        where,
        orderBy: { documento: "asc" },
        skip: skip(p),
        take,
        select: { id: true, documento: true, tipo: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } },
      });
      const r = pagina(linhas, p);
      return {
        opcoes: r.linhas.map((x) => ({
          valor: x.id,
          rotulo: `${formatarDocumento(x.documento)} — ${x.versoes[0]?.nome ?? "(sem nome)"}`,
          detalhe: x.tipo === "JURIDICA" ? "pessoa jurídica" : "pessoa física",
        })),
        temMais: r.temMais,
      };
    },
  },

  "unidades-para-ficha": {
    leitura: "CONSULTAR_PLANEJAMENTO",
    async buscar(sessao, p) {
      const escopo = await escopoDaAcaoDeLeitura(cliente(), sessao.identificador, "CRIAR_FICHA");
      if (!escopo.ativo || escopo.unidades.length === 0) return { opcoes: [], temMais: false };
      const ids = escopo.unidades.map((u) => u.id);
      const linhas = await cliente().unidadeOrcamentaria.findMany({
        where: {
          id: { in: ids },
          ...(p.valor !== undefined ? { codigo: p.valor } : p.q === "" ? {} : { OR: [{ codigo: { startsWith: p.q } }, { descricao: contem(p.q) }] }),
        },
        orderBy: { codigo: "asc" },
        skip: skip(p), take,
        select: { codigo: true, descricao: true, orgao: { select: { codigo: true, nome: true } } },
      });
      const r = pagina(linhas, p);
      return { opcoes: r.linhas.map((u) => ({ valor: u.codigo, rotulo: `${u.codigo} — ${u.descricao}`, detalhe: `órgão ${u.orgao.codigo} — ${u.orgao.nome}` })), temMais: r.temMais };
    },
  },
  funcoes: porCodigo("CONSULTAR_PLANEJAMENTO", async (w, s, t) =>
    (await cliente().funcao.findMany({ where: onde(w, "nome"), orderBy: { codigo: "asc" }, skip: s, take: t, select: { codigo: true, nome: true } })).map((x) => ({ codigo: x.codigo, texto: x.nome }))),
  subfuncoes: porCodigo("CONSULTAR_PLANEJAMENTO", async (w, s, t) =>
    (await cliente().subfuncao.findMany({ where: onde(w, "nome"), orderBy: { codigo: "asc" }, skip: s, take: t, select: { codigo: true, nome: true } })).map((x) => ({ codigo: x.codigo, texto: x.nome }))),
  programas: porCodigo("CONSULTAR_PLANEJAMENTO", async (w, s, t) =>
    (await cliente().programa.findMany({ where: onde(w, "descricao"), orderBy: { codigo: "asc" }, skip: s, take: t, select: { codigo: true, descricao: true } })).map((x) => ({ codigo: x.codigo, texto: x.descricao }))),
  acoes: porCodigo("CONSULTAR_PLANEJAMENTO", async (w, s, t) =>
    (await cliente().acao.findMany({ where: onde(w, "descricao"), orderBy: { codigo: "asc" }, skip: s, take: t, select: { codigo: true, descricao: true } })).map((x) => ({ codigo: x.codigo, texto: x.descricao }))),
  "naturezas-de-despesa": {
    leitura: "CONSULTAR_PLANEJAMENTO",
    async buscar(_s, p) {
      const where = p.valor !== undefined ? { codigoCompleto: p.valor } : p.q === "" ? {} : { OR: [{ codigoCompleto: { startsWith: p.q.replace(/\D/g, "") || p.q } }, { descricao: contem(p.q) }] };
      const linhas = await cliente().naturezaDespesa.findMany({ where, orderBy: { codigoCompleto: "asc" }, skip: skip(p), take, select: { codigoCompleto: true, descricao: true } });
      const r = pagina(linhas, p);
      return { opcoes: r.linhas.map((n) => ({ valor: n.codigoCompleto, rotulo: `${n.codigoCompleto} — ${n.descricao}` })), temMais: r.temMais };
    },
  },
  fontes: porCodigo("CONSULTAR_PLANEJAMENTO", async (w, s, t) =>
    (await cliente().fonteRecurso.findMany({ where: onde(w, "descricao"), orderBy: { codigo: "asc" }, skip: s, take: t, select: { codigo: true, descricao: true } })).map((x) => ({ codigo: x.codigo, texto: x.descricao }))),
  /**
   * V6.2 P3 — a PESSOA representada: busca por documento (dígitos) ou nome da versão vigente. O valor é
   * o id interno, que o caso de uso resolve de novo.
   */
  /**
   * V28 — as contas ANALÍTICAS do plano, recortadas pela classe que o efeito escolhido exige
   * (contexto `efeito`). O recorte é o mesmo que a declaração confere no servidor; aqui ele só
   * evita oferecer o que seria recusado.
   */
  "contas-analiticas": {
    leitura: "CONSULTAR_CONTABILIDADE",
    async buscar(_s, p) {
      const prefixo = PREFIXO_DO_EFEITO_NA_BUSCA[p.contexto["efeito"] ?? ""];
      const linhas = await cliente().contaPcasp.findMany({
        where: {
          analitica: true,
          ...(p.valor !== undefined
            ? { codigo: p.valor }
            : {
                AND: [
                  ...(prefixo !== undefined ? [{ codigo: { startsWith: prefixo } }] : []),
                  ...(p.q === "" ? [] : [{ OR: [{ codigo: { startsWith: p.q } }, { nome: contem(p.q) }] }]),
                ],
              }),
        },
        orderBy: { codigo: "asc" },
        skip: skip(p), take,
        select: { codigo: true, nome: true },
      });
      const r = pagina(linhas, p);
      return { opcoes: r.linhas.map((c) => ({ valor: c.codigo, rotulo: `${c.codigo} — ${c.nome}` })), temMais: r.temMais };
    },
  },
  /**
   * V28 — as LIQUIDAÇÕES DE CAPITAL que ainda têm valor a incorporar ao patrimônio. Só as vivas
   * (nem anuladas nem anulação), de natureza do grupo 4 ou 5, com saldo positivo — o mesmo saldo que
   * o teto de `adquirirBem` confere dentro da trava.
   */
  "liquidacoes-de-capital": {
    leitura: "CONSULTAR_PATRIMONIO",
    async buscar(_s, p) {
      const linhas = await cliente().liquidacao.findMany({
        where: {
          estornoDeId: null,
          anulacaoParcialDeId: null,
          estornos: { none: {} },
          empenho: { ficha: { naturezaDespesa: { codNatureza: { in: ["4", "5"] } } } },
          ...(p.valor !== undefined
            ? { id: p.valor }
            : p.q === "" ? {} : { OR: [{ numero: contem(p.q) }, { empenho: { numero: contem(p.q) } }, { empenho: { credorCpfCnpj: { startsWith: p.q.replace(/\D/g, "") || p.q } } }] }),
        },
        orderBy: [{ data: "desc" }, { id: "asc" }],
        skip: skip(p), take,
        select: {
          id: true, numero: true, data: true,
          empenho: { select: { numero: true, credorCpfCnpj: true, ficha: { select: { naturezaDespesa: { select: { codigoCompleto: true, descricao: true } } } } } },
        },
      });
      const r = pagina(linhas, p);
      const comSaldo = await Promise.all(r.linhas.map(async (l) => ({ l, saldo: await saldoAIncorporarDaLiquidacao(cliente(), l.id) })));
      return {
        opcoes: comSaldo
          .filter((x) => p.valor !== undefined || x.saldo.greaterThan(0))
          .map(({ l, saldo }) => ({
            valor: l.id,
            rotulo: `${l.numero} — empenho ${l.empenho.numero} — ${l.empenho.ficha.naturezaDespesa.codigoCompleto} ${l.empenho.ficha.naturezaDespesa.descricao}`,
            detalhe: `credor ${formatarDocumento(l.empenho.credorCpfCnpj)} · a incorporar R$ ${formatarMoeda(saldo.toFixed(2)).texto}`,
            dados: { valor: saldo.toFixed(2) },
          })),
        temMais: r.temMais,
      };
    },
  },
  /**
   * V28 — o CRÉDITO JÁ LANÇADO que uma guia quita: só os vivos com saldo, recortados pela natureza e
   * pela fonte que a guia já declara. O saldo é o mesmo que a quitação confere dentro da trava.
   */
  "creditos-a-receber": {
    leitura: "CONSULTAR_RECEITA",
    async buscar(_s, p) {
      const natureza = p.contexto["natureza"] ?? "";
      const fonte = p.contexto["fonte"] ?? "";
      const linhas = await cliente().receitaReconhecida.findMany({
        where: {
          estornoDeId: null,
          estornos: { none: {} },
          ...(p.valor !== undefined ? { id: p.valor } : {}),
          ...(/^\d{8}$/.test(natureza) ? { naturezaCodigo: natureza } : {}),
          ...(/^\d{3}$/.test(fonte) ? { fonte: { codigo: fonte } } : {}),
          ...(p.q === "" ? {} : { OR: [{ historico: contem(p.q) }, { contribuinteRef: contem(p.q) }] }),
        },
        orderBy: [{ dataFatoGerador: "asc" }, { id: "asc" }],
        skip: skip(p), take,
        select: { id: true, historico: true, contribuinteRef: true, naturezaCodigo: true, dataFatoGerador: true, fonte: { select: { codigo: true } } },
      });
      const r = pagina(linhas, p);
      const comSaldo = await Promise.all(r.linhas.map(async (l) => ({ l, saldo: await saldoReconhecidoDe(cliente(), l.id) })));
      return {
        opcoes: comSaldo
          .filter((x) => p.valor !== undefined || x.saldo.greaterThan(0))
          .map(({ l, saldo }) => ({
            valor: l.id,
            rotulo: `${l.historico}${l.contribuinteRef !== null ? ` — ${l.contribuinteRef}` : ""}`,
            detalhe: `natureza ${l.naturezaCodigo} · fonte ${l.fonte.codigo} · saldo a receber R$ ${formatarMoeda(saldo.toFixed(2)).texto}`,
            dados: { saldo: saldo.toFixed(2) },
          })),
        temMais: r.temMais,
      };
    },
  },
  // V32 — a dívida ativa que a guia RECEBE (só as com saldo a receber). O saldo é o do M10 (Σ movimentos).
  "dividas-ativas-a-receber": {
    leitura: "CONSULTAR_DIVIDA",
    async buscar(_s, p) {
      const linhas = await cliente().dividaAtiva.findMany({
        where: {
          ...(p.valor !== undefined ? { id: p.valor } : {}),
          ...(p.q === "" ? {} : { OR: [{ identificador: contem(p.q) }, { devedorNome: contem(p.q) }, { devedorDocumento: { startsWith: p.q.replace(/\D/g, "") || p.q } }] }),
        },
        orderBy: [{ identificador: "asc" }],
        skip: skip(p), take,
        select: { id: true, identificador: true, devedorNome: true, devedorDocumento: true, contaContabil: { select: { codigo: true } } },
      });
      const r = pagina(linhas, p);
      const comSaldo = await Promise.all(r.linhas.map(async (l) => ({ l, saldo: await saldoDaDividaAtivaEm(cliente(), l.id) })));
      return {
        opcoes: comSaldo
          .filter((x) => p.valor !== undefined || x.saldo.greaterThan(0))
          .map(({ l, saldo }) => ({
            valor: l.id,
            rotulo: `${l.identificador} — ${l.devedorNome}`,
            detalhe: `${formatarDocumento(l.devedorDocumento)} · conta ${l.contaContabil.codigo} · saldo R$ ${formatarMoeda(saldo.toFixed(2)).texto}`,
            dados: { saldo: saldo.toFixed(2) },
          })),
        temMais: r.temMais,
      };
    },
  },
  // V36 (TR 5.10.1.89) — a parceria público-privada que o empenho executa. Leitura de quem consulta a despesa.
  "ppps-para-empenho": {
    leitura: "CONSULTAR_DESPESA",
    async buscar(_s, p) {
      const linhas = await cliente().contratoPPP.findMany({
        where: {
          ...(p.valor !== undefined ? { id: p.valor } : {}),
          ...(p.q === "" ? {} : { OR: [{ numero: contem(p.q) }, { parceiroPrivado: contem(p.q) }, { objeto: contem(p.q) }] }),
        },
        orderBy: [{ numero: "asc" }],
        skip: skip(p), take,
        select: { id: true, numero: true, parceiroPrivado: true, objeto: true },
      });
      const r = pagina(linhas, p);
      return { opcoes: r.linhas.map((l) => ({ valor: l.id, rotulo: `${l.numero} — ${l.parceiroPrivado}`, detalhe: l.objeto })), temMais: r.temMais };
    },
  },
  // V36 — a obra cadastrada (M11) a que a obra prevista na LDO se refere. Identificador e descrição, o que a LDO
  // imprime; a leitura é a do planejamento, de quem digita a LDO.
  "obras-para-ldo": {
    leitura: "CONSULTAR_PLANEJAMENTO",
    async buscar(_s, p) {
      const linhas = await cliente().obra.findMany({
        where: {
          ...(p.valor !== undefined ? { id: p.valor } : {}),
          ...(p.q === "" ? {} : { OR: [{ identificador: contem(p.q) }, { descricao: contem(p.q) }] }),
        },
        orderBy: [{ identificador: "asc" }],
        skip: skip(p), take,
        select: { id: true, identificador: true, descricao: true },
      });
      const r = pagina(linhas, p);
      return { opcoes: r.linhas.map((l) => ({ valor: l.id, rotulo: `${l.identificador} — ${l.descricao}` })), temMais: r.temMais };
    },
  },
  // V32 — a dívida fundada (operação de crédito) em que a guia registra o INGRESSO do empréstimo.
  "dividas-fundadas": {
    leitura: "CONSULTAR_DIVIDA",
    async buscar(_s, p) {
      const linhas = await cliente().dividaConsolidada.findMany({
        where: {
          ...(p.valor !== undefined ? { id: p.valor } : {}),
          ...(p.q === "" ? {} : { OR: [{ identificador: contem(p.q) }, { credorNome: contem(p.q) }, { objeto: contem(p.q) }] }),
        },
        orderBy: [{ identificador: "asc" }],
        skip: skip(p), take,
        select: { id: true, identificador: true, credorNome: true, leiAutorizativa: true, contaContabil: { select: { codigo: true } } },
      });
      const r = pagina(linhas, p);
      return {
        opcoes: r.linhas.map((l) => ({
          valor: l.id,
          rotulo: `${l.identificador} — ${l.credorNome}`,
          detalhe: `lei ${l.leiAutorizativa} · conta ${l.contaContabil.codigo}`,
        })),
        temMais: r.temMais,
      };
    },
  },
  // V32 — os empenhos que podem pagar uma diária (elemento 14 ou 15) ou um suprimento (os demais). Só os
  // originais (nem anulação total nem parcial); o saldo que ainda cabe é conferido na concessão, sob trinco.
  "empenhos-para-adiantamento": {
    leitura: "CONSULTAR_DESPESA",
    async buscar(_s, p) {
      const especie = p.contexto["especie"] ?? "";
      const elementos = ["14", "15"];
      const linhas = await cliente().empenho.findMany({
        where: {
          estornoDeId: null,
          anulacaoParcialDeId: null,
          ...(especie === "DIARIA" ? { ficha: { naturezaDespesa: { codElemento: { in: elementos } } } } : {}),
          ...(especie === "SUPRIMENTO_DE_FUNDOS" ? { ficha: { naturezaDespesa: { codElemento: { notIn: elementos } } } } : {}),
          ...(p.valor !== undefined ? { id: p.valor } : {}),
          ...(p.q === "" ? {} : { OR: [{ numero: { contains: p.q } }, { credorCpfCnpj: { startsWith: p.q.replace(/\D/g, "") || p.q } }] }),
        },
        orderBy: [{ data: "desc" }, { numero: "desc" }],
        skip: skip(p), take,
        select: { id: true, numero: true, valor: true, credorCpfCnpj: true, ficha: { select: { naturezaDespesa: { select: { codigoCompleto: true } } } } },
      });
      const r = pagina(linhas, p);
      return {
        opcoes: r.linhas.map((e) => ({
          valor: e.id,
          rotulo: `${e.numero} — ${formatarDocumento(e.credorCpfCnpj)}`,
          detalhe: `natureza ${e.ficha.naturezaDespesa.codigoCompleto} · R$ ${formatarMoeda(e.valor.toFixed(2)).texto}`,
          dados: { credorDocumento: e.credorCpfCnpj },
        })),
        temMais: r.temMais,
      };
    },
  },
  // V32 — os precatórios INSCRITOS e com saldo, para o empenho que os paga.
  "precatorios-para-empenho": {
    leitura: "CONSULTAR_DESPESA",
    async buscar(_s, p) {
      const linhas = await cliente().precatorio.findMany({
        where: {
          movimentos: { some: { tipo: "INSCRICAO" } },
          ...(p.valor !== undefined ? { id: p.valor } : {}),
          ...(p.q === "" ? {} : { OR: [{ numeroProcesso: contem(p.q) }, { beneficiarioNome: contem(p.q) }] }),
        },
        orderBy: [{ dataApresentacao: "asc" }, { numeroProcesso: "asc" }],
        skip: skip(p), take,
        select: { id: true, numeroProcesso: true, beneficiarioNome: true, beneficiarioDocumento: true, natureza: true, tribunal: true },
      });
      const r = pagina(linhas, p);
      return {
        opcoes: r.linhas.map((x) => ({
          valor: x.id,
          rotulo: `${x.numeroProcesso} — ${x.beneficiarioNome}`,
          detalhe: `${x.tribunal} · ${x.natureza === "ALIMENTAR" ? "alimentar" : "comum"} · ${formatarDocumento(x.beneficiarioDocumento)}`,
          dados: { credorDocumento: x.beneficiarioDocumento, credorNome: x.beneficiarioNome },
        })),
        temMais: r.temMais,
      };
    },
  },
  pessoas: {
    leitura: "CONSULTAR_CADASTROS",
    async buscar(_s, p) {
      const digitos = p.q.replace(/\D/g, "");
      const where = p.valor !== undefined ? { id: p.valor } : p.q === "" ? {} : { OR: [...(digitos.length >= 3 ? [{ documento: { startsWith: digitos } }] : []), { versoes: { some: { nome: contem(p.q) } } }] };
      const linhas = await cliente().pessoa.findMany({ where, orderBy: { documento: "asc" }, skip: skip(p), take, select: { id: true, documento: true, tipo: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } });
      const r = pagina(linhas, p);
      return { opcoes: r.linhas.map((x) => ({ valor: x.id, rotulo: `${x.versoes[0]?.nome ?? ""} — ${formatarDocumento(x.documento)}`, detalhe: x.tipo === "JURIDICA" ? "pessoa jurídica" : "pessoa física" })), temMais: r.temMais };
    },
  },
  /**
   * V6.2 P3 — a CONTA de quem representa: só contas ativas vinculadas HOJE a uma pessoa física (o vínculo
   * vigente é a última linha do usuário). O caso de uso confere as duas coisas de novo.
   */
  "contas-com-pessoa-fisica": {
    leitura: "CONSULTAR_CADASTROS",
    async buscar(_s, p) {
      const prisma = cliente();
      const where = p.valor !== undefined ? { identificador: p.valor, ativo: true } : { ativo: true, vinculosDePessoa: { some: {} }, ...(p.q === "" ? {} : { OR: [{ identificador: contem(p.q) }, { nome: contem(p.q) }] }) };
      const contas = await prisma.usuario.findMany({ where, orderBy: { identificador: "asc" }, skip: skip(p), take, select: { identificador: true, nome: true } });
      const r = pagina(contas, p);
      const opcoes: OpcaoReferenciada[] = [];
      for (const u of r.linhas) {
        const pessoa = await pessoaDoUsuario(prisma, u.identificador);
        if (pessoa === null || pessoa.documento.length !== 11) continue;
        opcoes.push({ valor: u.identificador, rotulo: `${u.nome} (${u.identificador})`, detalhe: `${pessoa.nome} — ${formatarDocumento(pessoa.documento)}` });
      }
      return { opcoes, temMais: r.temMais };
    },
  },
  "codigos-de-acompanhamento": porCodigo("CONSULTAR_PLANEJAMENTO", async (w, s, t) =>
    (await cliente().codigoAcompanhamento.findMany({ where: onde(w, "descricao"), orderBy: { codigo: "asc" }, skip: s, take: t, select: { codigo: true, descricao: true } })).map((x) => ({ codigo: x.codigo, texto: x.descricao }))),
};

export class CatalogoInexistenteError extends Error {}
export class LeituraDoCatalogoNegadaError extends Error {}

/** A leitura que o catálogo exige — a rota a cobra ANTES de ler qualquer parâmetro. `null` = não existe. */
export function leituraDoCatalogo(catalogo: string): AcaoDeLeitura | null {
  return Object.hasOwn(CATALOGOS, catalogo) ? (CATALOGOS[catalogo]?.leitura ?? null) : null;
}

/** A consulta autorizada. Lança nomeando quando a sessão não pode conhecer a lista. */
export async function buscarOpcoes(sessao: Identidade, catalogo: string, p: PedidoDeOpcoes): Promise<PaginaDeOpcoes> {
  const c = Object.hasOwn(CATALOGOS, catalogo) ? CATALOGOS[catalogo] : undefined;
  if (c === undefined) throw new CatalogoInexistenteError(`Não há lista de opções chamada "${catalogo}".`);
  if (!(await podeLerPara(sessao, c.leitura, "algum"))) {
    throw new LeituraDoCatalogoNegadaError("Esta lista não está no seu acesso. Peça ao administrador a permissão de consulta da área.");
  }
  return c.buscar(sessao, { ...p, q: p.q.trim().slice(0, 80), pagina: Math.max(1, Math.min(p.pagina, 50)) });
}
