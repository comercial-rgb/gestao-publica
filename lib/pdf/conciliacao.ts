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
  // V39-R2 (R2-001) — a pendência deste período registrada depois do encerramento do anterior, com data dele.
  const retro = (lado: string, id: string): string => { const x = c.retroativas.find((y) => y.lado === lado && y.referencia === id); return x === undefined ? "" : ` (registrada depois do encerramento de ${x.periodoAfetado})`; };
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
    linhas: r.noExtratoSemVinculo.length === 0 ? [["", "Nenhuma pendência do extrato.", "", ""]] : r.noExtratoSemVinculo.map((l) => [diaCivilBr(l.data), `${l.descricao}${retro("EXTRATO", l.id)}`, brl(l.residual), justificativa("EXTRATO", l.id)]),
  };
  const sistema: SecaoPdf = {
    titulo: "No sistema e não no extrato",
    colunas: [{ rotulo: "Data" }, { rotulo: "Registro" }, { rotulo: "Valor", alinhamento: "direita" }, { rotulo: "Justificativa" }],
    linhas: r.internoSemVinculo.length === 0 ? [["", "Nenhuma pendência contábil.", "", ""]] : r.internoSemVinculo.map((l) => [diaCivilBr(l.data), `[${l.tipoInterno}] ${l.descricao}${retro(l.tipoInterno, l.id)}`, brl(l.residual), justificativa(l.tipoInterno, l.id)]),
  };
  const secoes: SecaoPdf[] = [saldos, extrato, sistema];
  if (c.herdadasDaAnterior.length > 0) {
    secoes.push({
      titulo: "Pendências herdadas do período anterior",
      colunas: [{ rotulo: "Lado" }, { rotulo: "Descrição" }, { rotulo: "Valor", alinhamento: "direita" }, { rotulo: "Justificativa" }],
      linhas: c.herdadasDaAnterior.map((h) => [h.lado, h.descricao, brl(h.residual), h.justificativa ?? "—"]),
    });
  }
  if (c.fatosTardios.length + c.resolvidosDepois.length > 0) {
    secoes.push({
      titulo: "Registrado depois do encerramento, com data neste período (fora da conferência acima)",
      colunas: [{ rotulo: "Data" }, { rotulo: "Registro" }, { rotulo: "Valor", alinhamento: "direita" }, { rotulo: "Situação" }],
      linhas: [
        ...c.fatosTardios.map((x) => [diaCivilBr(new Date(x.data)), `[${x.lado}] ${x.descricao}`, brl(x.residual), "registrado depois; tratado no período seguinte"]),
        ...c.resolvidosDepois.map((x) => [diaCivilBr(new Date(x.data)), `[${x.lado}] ${x.descricao}`, brl(x.residual), "pendente no encerramento; resolvida depois"]),
      ],
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
      c.fonteDoRelatorio === "FOTO_DO_ENCERRAMENTO"
        ? "Saldos e pendências como foram conferidos no encerramento; o que foi registrado depois aparece à parte."
        : c.estado === "ENCERRADA"
          ? "Encerrado antes de o sistema guardar a conferência: valores recalculados na data da emissão."
          : "Valores calculados na data da emissão.",
      "A diferença é explicada pelas linhas sem vínculo dos dois lados; o sistema não emite o relatório quando não é.",
    ],
  };
}
