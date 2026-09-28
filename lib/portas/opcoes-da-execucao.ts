import { formatarMoeda } from "../../packages/contracts/moeda";
import { toMoney } from "../../packages/contracts/index";
import { formatarDocumento } from "../../packages/documento/index.js";
import { homologadoEm, situacaoDoProcesso, vigenciaFimDoContrato } from "../../modules/m11-licitacoes/contratos";
import type { AcaoDeLeitura } from "../../modules/m16-travamento/acoes.js";
import { cliente } from "./cliente";
import type { Identidade } from "./sessao";

/**
 * OS CATÁLOGOS DA EMISSÃO DO EMPENHO (V22) — credor, ordem de compra, contrato e reserva, com
 * busca no servidor pelo NÚMERO ou pelo nome, no lugar dos `select` de 300 a 500 itens que o
 * formulário carregava inteiros.
 *
 * ⚠️ OFERECER NÃO É AUTORIZAR, e também não é conferir. Os filtros aqui (contrato de processo
 * homologado e vigente, reserva com saldo, ordem com ficha e sem estorno) são os que a lista antiga
 * do formulário aplicava, e servem só para não oferecer o que o domínio vai recusar; quem recusa é
 * o M05, na transação, contra o saldo real.
 *
 * ⚠️ OS `dados` SÃO SUGESTÃO DE PREENCHIMENTO, não vínculo. A tela usa o documento do credor, a
 * ficha e o texto do objeto para autopreencher o formulário; o que viaja para o servidor continua
 * sendo o que a pessoa deixou nos campos, e o caso de uso confere tudo de novo.
 */

interface Opcao {
  readonly valor: string;
  readonly rotulo: string;
  readonly detalhe?: string;
  readonly dados?: Readonly<Record<string, string>>;
}

interface Pedido {
  readonly q: string;
  readonly pagina: number;
  readonly valor?: string;
}

interface Catalogo {
  readonly leitura: AcaoDeLeitura;
  buscar(sessao: Identidade, p: Pedido): Promise<{ readonly opcoes: readonly Opcao[]; readonly temMais: boolean }>;
}

const TAMANHO = 20;
const contem = (q: string): { contains: string; mode: "insensitive" } => ({ contains: q, mode: "insensitive" });
const reais = (v: string): string => `R$ ${formatarMoeda(v).texto}`;

/** Corta a página e diz se há mais — a consulta pede um a mais do que mostra. */
function paginar<T>(linhas: readonly T[]): { readonly linhas: readonly T[]; readonly temMais: boolean } {
  return { linhas: linhas.slice(0, TAMANHO), temMais: linhas.length > TAMANHO };
}

export const CATALOGOS_DA_EXECUCAO: Readonly<Record<string, Catalogo>> = {
  /**
   * CREDORES — pessoas com o papel CREDOR vigente (o último movimento do par é CONCEDIDO). O valor
   * é o DOCUMENTO, não o id: o empenho grava `credorCpfCnpj` como fato, e não como chave do cadastro.
   */
  credores: {
    leitura: "CONSULTAR_DESPESA",
    async buscar(_s, p) {
      const digitos = p.q.replace(/\D/g, "");
      const filtro =
        p.valor !== undefined
          ? { documento: p.valor }
          : p.q === ""
            ? {}
            : { OR: [...(digitos.length >= 2 ? [{ documento: { startsWith: digitos } }] : []), { versoes: { some: { nome: contem(p.q) } } }] };
      const linhas = await cliente().pessoa.findMany({
        where: { ...filtro, movimentos: { some: { papel: "CREDOR" } } },
        orderBy: { documento: "asc" },
        skip: (p.pagina - 1) * TAMANHO,
        take: TAMANHO + 1,
        select: {
          documento: true,
          tipo: true,
          versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true, municipio: true, uf: true } },
          movimentos: { where: { papel: "CREDOR" }, orderBy: [{ data: "desc" }, { criadoEm: "desc" }], take: 1, select: { movimento: true } },
        },
      });
      const r = paginar(linhas);
      const vigentes = r.linhas.filter((x) => x.movimentos[0]?.movimento === "CONCEDIDO");
      return {
        opcoes: vigentes.map((x) => {
          const v = x.versoes[0];
          const lugar = v?.municipio != null && v.municipio !== "" ? ` · ${v.municipio}${v.uf != null && v.uf !== "" ? `/${v.uf}` : ""}` : "";
          return {
            valor: x.documento,
            rotulo: `${formatarDocumento(x.documento)} — ${v?.nome ?? "(sem nome)"}`,
            detalhe: `${x.tipo === "JURIDICA" ? "pessoa jurídica" : "pessoa física"}${lugar}`,
            dados: { credorNome: v?.nome ?? "" },
          };
        }),
        temMais: r.temMais,
      };
    },
  },

  /** ORDENS DE COMPRA com ficha e sem estorno — o empenho nasce delas. Busca pelo número. */
  "ordens-para-empenho": {
    leitura: "CONSULTAR_DESPESA",
    async buscar(_s, p) {
      const filtro = p.valor !== undefined ? { id: p.valor } : p.q === "" ? {} : { OR: [{ numero: contem(p.q) }, { finalidade: contem(p.q) }] };
      const linhas = await cliente().ordemDeCompra.findMany({
        where: { ...filtro, fichaId: { not: null }, movimentos: { none: { tipo: "ESTORNO" } } },
        orderBy: { numero: "desc" },
        skip: (p.pagina - 1) * TAMANHO,
        take: TAMANHO + 1,
        select: {
          id: true,
          numero: true,
          tipo: true,
          finalidade: true,
          dataEmissao: true,
          desconto: true,
          fichaId: true,
          ficha: { select: { numero: true } },
          itens: { select: { quantidade: true, valorUnitario: true } },
          fornecedor: { select: { documento: true, versoes: { select: { nome: true }, orderBy: { criadoEm: "desc" }, take: 1 } } },
        },
      });
      const r = paginar(linhas);
      return {
        opcoes: r.linhas.map((o) => {
          const bruto = o.itens.reduce((s, i) => s.plus(toMoney(i.quantidade.toString()).times(toMoney(i.valorUnitario.toString()))), toMoney("0"));
          const total = bruto.minus(o.desconto === null ? toMoney("0") : toMoney(o.desconto.toFixed(2))).toDecimalPlaces(2).toFixed(2);
          const nome = o.fornecedor.versoes[0]?.nome ?? formatarDocumento(o.fornecedor.documento);
          return {
            valor: o.id,
            rotulo: `${o.numero} — ${nome}`,
            detalhe: `${o.finalidade} · ${reais(total)}${o.ficha === null ? "" : ` · ficha ${o.ficha.numero}`}`,
            dados: {
              numero: o.numero,
              fichaId: o.fichaId ?? "",
              credorDocumento: o.fornecedor.documento,
              credorNome: nome,
              objeto: o.finalidade,
              valor: total,
            },
          };
        }),
        temMais: r.temMais,
      };
    },
  },

  /** CONTRATOS de processo homologado e vigentes hoje. Busca pelo número ou pelo contratado. */
  "contratos-para-empenho": {
    leitura: "CONSULTAR_DESPESA",
    async buscar(_s, p) {
      const prisma = cliente();
      const filtro = p.valor !== undefined ? { id: p.valor } : p.q === "" ? {} : { OR: [{ numeroContrato: contem(p.q) }, { contratadoNome: contem(p.q) }] };
      const linhas = await prisma.contrato.findMany({
        where: filtro,
        orderBy: { numeroContrato: "desc" },
        skip: (p.pagina - 1) * TAMANHO,
        take: TAMANHO + 1,
        select: {
          id: true,
          numeroContrato: true,
          contratadoDocumento: true,
          contratadoNome: true,
          valorInicial: true,
          categoriaOrdemCronologica: true,
          processo: { select: { id: true, numeroProcesso: true, objeto: true } },
        },
      });
      const r = paginar(linhas);
      const hoje = new Date();
      const opcoes: Opcao[] = [];
      for (const c of r.linhas) {
        if (situacaoDoProcesso(await homologadoEm(prisma, c.processo.id)) !== "HOMOLOGADO") continue;
        const fim = await vigenciaFimDoContrato(prisma, c.id);
        if (fim.getTime() < hoje.getTime()) continue;
        opcoes.push({
          valor: c.id,
          rotulo: `${c.numeroContrato} — ${c.contratadoNome}`,
          detalhe: `processo ${c.processo.numeroProcesso} · ${reais(c.valorInicial.toFixed(2))} · vigente até ${fim.toLocaleDateString("pt-BR", { timeZone: "UTC" })}`,
          dados: {
            numero: c.numeroContrato,
            credorDocumento: c.contratadoDocumento,
            credorNome: c.contratadoNome,
            objeto: c.processo.objeto,
            processo: c.processo.numeroProcesso,
            categoria: c.categoriaOrdemCronologica,
          },
        });
      }
      return { opcoes, temMais: r.temMais };
    },
  },

  /** RESERVAS de dotação vivas (sem estorno e com saldo). Busca pela ficha, pelo processo ou pelo texto. */
  "reservas-para-empenho": {
    leitura: "CONSULTAR_DESPESA",
    async buscar(_s, p) {
      const n = Number.parseInt(p.q.replace(/\D/g, ""), 10);
      const filtro =
        p.valor !== undefined
          ? { id: p.valor }
          : p.q === ""
            ? {}
            : {
                OR: [
                  { historico: contem(p.q) },
                  { processo: { numeroProcesso: contem(p.q) } },
                  ...(Number.isFinite(n) ? [{ ficha: { numero: n } }] : []),
                ],
              };
      const linhas = await cliente().reservaDotacao.findMany({
        where: { ...filtro, estornoDeId: null, estornos: { none: {} } },
        orderBy: { criadoEm: "desc" },
        skip: (p.pagina - 1) * TAMANHO,
        take: TAMANHO + 1,
        select: {
          id: true,
          valor: true,
          historico: true,
          fichaId: true,
          ficha: { select: { numero: true, exercicio: true } },
          processo: { select: { numeroProcesso: true } },
          empenhos: { select: { empenho: { select: { valor: true } } } },
        },
      });
      const r = paginar(linhas);
      const opcoes: Opcao[] = [];
      for (const x of r.linhas) {
        const consumido = x.empenhos.reduce((s, e) => s.plus(e.empenho.valor.toFixed(2)), toMoney("0"));
        const saldo = toMoney(x.valor.toFixed(2)).minus(consumido);
        if (!saldo.greaterThan(0)) continue;
        opcoes.push({
          valor: x.id,
          rotulo: `Ficha ${x.ficha.numero}/${x.ficha.exercicio} — saldo ${reais(saldo.toFixed(2))}`,
          detalhe: `${x.historico}${x.processo === null ? "" : ` · processo ${x.processo.numeroProcesso}`}`,
          dados: {
            fichaId: x.fichaId,
            objeto: x.historico,
            saldo: saldo.toFixed(2),
            ...(x.processo === null ? {} : { processo: x.processo.numeroProcesso }),
          },
        });
      }
      return { opcoes, temMais: r.temMais };
    },
  },
};
