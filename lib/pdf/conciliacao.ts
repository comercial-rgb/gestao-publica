import type { DocumentoPdf, SecaoPdf } from "./documento";
import { formatarMoeda } from "../format/moeda";
import { diaCivilBr } from "../../packages/datas/index.js";
import type { ConciliacaoDoPeriodo } from "../portas/tesouraria";

/**
 * V36 — O RELATÓRIO DA CONCILIAÇÃO DE UM PERÍODO EM PDF (TR 5.10.2.53; pendência CONCILIACAO-PERIODO-PDF).
 *
 * O mesmo `verConciliacao` da tela: saldo do extrato, saldo contábil e diferença; as linhas do extrato e do sistema
 * sem vínculo, com a justificativa de cada uma quando houver; as pendências herdadas do período anterior e as
 * declaradas à mão. Nenhuma conta é refeita aqui — o motor (M09) já confere que a diferença é explicada pelas
 * linhas sem vínculo, e recusa emitir quando não é (a rota devolve a recusa com o motivo).
 */
const brl = (v: string): string => formatarMoeda(v).texto;

export function documentoDaConciliacao(p: { readonly ente: string; readonly conciliacao: ConciliacaoDoPeriodo }): DocumentoPdf {
  const c = p.conciliacao;
  const r = c.relatorio;
  const justificativa = (lado: string, referencia: string): string => c.justificativas.find((j) => j.lado === lado && j.referencia === referencia)?.motivo ?? "—";
  const saldos: SecaoPdf = {
    titulo: "Saldos no corte",
    colunas: [{ rotulo: "Item" }, { rotulo: "Valor", alinhamento: "direita" }],
    linhas: [
      ["Saldo do extrato bancário", brl(r.saldoExtrato)],
      [`Saldo contábil (conta ${r.contaBancaria.contaContabil})`, brl(r.saldoContabil)],
      ["Diferença a explicar", brl(r.diferenca)],
    ],
    totais: [2],
  };
  const extrato: SecaoPdf = {
    titulo: "No extrato e não no sistema",
    colunas: [{ rotulo: "Data" }, { rotulo: "Descrição" }, { rotulo: "Valor", alinhamento: "direita" }, { rotulo: "Justificativa" }],
    linhas: r.noExtratoSemVinculo.length === 0 ? [["", "Nenhuma pendência do extrato.", "", ""]] : r.noExtratoSemVinculo.map((l) => [diaCivilBr(l.data), l.descricao, brl(l.residual), justificativa("EXTRATO", l.id)]),
  };
  const sistema: SecaoPdf = {
    titulo: "No sistema e não no extrato",
    colunas: [{ rotulo: "Data" }, { rotulo: "Registro" }, { rotulo: "Valor", alinhamento: "direita" }, { rotulo: "Justificativa" }],
    linhas: r.internoSemVinculo.length === 0 ? [["", "Nenhuma pendência contábil.", "", ""]] : r.internoSemVinculo.map((l) => [diaCivilBr(l.data), `[${l.tipoInterno}] ${l.descricao}`, brl(l.residual), justificativa(l.tipoInterno, l.id)]),
  };
  const secoes: SecaoPdf[] = [saldos, extrato, sistema];
  if (c.herdadasDaAnterior.length > 0) {
    secoes.push({
      titulo: "Pendências herdadas do período anterior",
      colunas: [{ rotulo: "Lado" }, { rotulo: "Descrição" }, { rotulo: "Valor", alinhamento: "direita" }, { rotulo: "Justificativa" }],
      linhas: c.herdadasDaAnterior.map((h) => [h.lado, h.descricao, brl(h.residual), h.justificativa ?? "—"]),
    });
  }
  if (c.pendenciasManuais.length > 0) {
    secoes.push({
      titulo: "Pendências declaradas",
      colunas: [{ rotulo: "Descrição" }, { rotulo: "Natureza" }, { rotulo: "Valor", alinhamento: "direita" }, { rotulo: "Motivo" }, { rotulo: "Situação" }],
      linhas: c.pendenciasManuais.map((m) => [m.descricao, m.natureza === "CREDITO" ? "crédito" : "débito", brl(m.valor), m.motivo, m.resolvida ? "resolvida" : "aberta"]),
    });
  }
  return {
    ente: p.ente,
    titulo: "Conciliação bancária",
    subtitulo: `Conta ${r.contaBancaria.codigo} · ${c.rotulo}`,
    periodo: `${diaCivilBr(c.periodoInicio)} a ${diaCivilBr(c.periodoFim)}`,
    secoes,
    notas: [
      c.estado === "ENCERRADA"
        ? `Período encerrado${c.encerradaPor !== null ? ` por ${c.encerradaPor}` : ""}${c.encerradaEm !== null ? ` em ${diaCivilBr(c.encerradaEm)}` : ""}; o que ficou aberto passou ao período seguinte.`
        : "Período em aberto: o relatório mostra a posição no momento da emissão.",
      "A diferença é explicada pelas linhas sem vínculo dos dois lados; o sistema não emite o relatório quando não é.",
    ],
  };
}
