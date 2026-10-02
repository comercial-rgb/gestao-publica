import { diaCivilBr } from "../../../packages/datas/index.js";
import { toPercentual, type Percentual } from "../../../packages/contracts/index.js";
import {
  definirParametroDeAtualizacao,
  parametroVigente,
  versoesDoParametro,
  type ParametroVigente,
} from "../../../modules/m10-patrimonial/parametros.js";
import type { ConsultaDoMolde } from "../../molde/consulta.js";
import { TAMANHO_DE_PAGINA } from "../../molde/consulta.js";
import { comEscritaAutenticada } from "../sessao";
import { cliente, PortaSemBancoError } from "../cliente";
import type { DetalheLido, OpcoesDoCadastro, PaginaDoMolde } from "./dados";
import { OPCOES_DE_METODO } from "./parametros.js";

/**
 * ═══ OS DADOS DOS PARÂMETROS DE ATUALIZAÇÃO — M10, V3 pacote 2 ═══
 *
 * ⚠️ A LISTAGEM É O ROL DAS CLASSES ATIVAS, com o parâmetro em vigor quando existe — a mesma
 * anatomia dos roteiros: o que falta é o que precisa ser visto. O `id` da linha é o id da
 * classe.
 *
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI. Vida útil, residual, classe inativa, versão idêntica e
 * concorrência são decididos dentro da transação do domínio, e a recusa sobe COMO VEIO.
 *
 * ⚠️ O RESIDUAL CHEGA EM PORCENTO e sai como fração de seis casas — a única conversão desta
 * porta, feita pelo `Decimal`, nunca por `number`.
 */

export { PortaSemBancoError };

type Campos = Readonly<Record<string, string>>;
const t = (c: Campos, k: string): string => (c[k] ?? "").trim();

const ROTULO_DO_METODO: Readonly<Record<string, string>> = Object.fromEntries(
  OPCOES_DE_METODO.map((o) => [o.valor, o.rotulo])
);

/** "0.100000" -> "10%" ; "0.125000" -> "12,5%". */
export function residualEmPorcento(fracao: Percentual | string): string {
  // Seis casas na fração são quatro no porcento: 0,033333 é 3,3333%. Passar por `toMoney`
  // achatava 0,125 em 0,12 e a tela dizia 12% de um parâmetro de 12,5%.
  const pct = toPercentual(typeof fracao === "string" ? fracao : fracao.toFixed(6)).times(100);
  const texto = pct.toFixed(4).replace(/\.?0+$/, "").replace(".", ",");
  return `${texto === "" ? "0" : texto}%`;
}

/**
 * "10" -> "0.100000"; "12,5" -> "0.125000" (fração de seis casas, então até quatro no porcento).
 * O que não for número entre 0 e 99,9999 é recusado com o motivo, e não arredondado em silêncio.
 */
export function fracaoDoPorcento(porcento: string): string {
  const normal = porcento === "" ? "0" : porcento.replace(",", ".");
  if (!/^\d{1,2}(\.\d{1,4})?$/.test(normal)) {
    throw new Error(
      `Valor residual "${porcento}" inválido: informe o percentual entre 0 e 99,9999, com até quatro casas decimais (ex.: 10 ou 12,5).`
    );
  }
  return toPercentual(normal).dividedBy(100).toFixed(6);
}

type LinhaComposta = {
  readonly id: string;
  readonly classe: string;
  readonly metodo: string;
  readonly vidaUtil: string;
  readonly residual: string;
  readonly versao: string;
  readonly situacao: string;
};

function situacaoDe(p: ParametroVigente | null): "Parametrizada" | "Sem parâmetro" | "Atualização encerrada" {
  if (p === null) return "Sem parâmetro";
  return p.ativo ? "Parametrizada" : "Atualização encerrada";
}

async function linhasCompostas(): Promise<readonly LinhaComposta[]> {
  const prisma = cliente();
  const classes = await prisma.classeDeBens.findMany({
    where: { ativa: true },
    select: { id: true, codigo: true, descricao: true },
    orderBy: { codigo: "asc" },
    take: 500,
  });
  const linhas: LinhaComposta[] = [];
  for (const c of classes) {
    const p = await parametroVigente(prisma, c.id);
    linhas.push({
      id: c.id,
      classe: `${c.codigo} — ${c.descricao}`,
      metodo: p === null ? "—" : (ROTULO_DO_METODO[p.metodo] ?? p.metodo),
      vidaUtil: p === null ? "—" : `${p.vidaUtilMeses} meses`,
      residual: p === null ? "—" : residualEmPorcento(p.percentualResidual),
      versao: p === null ? "—" : p.origem === "LEGADO" ? "origem (sem versão)" : `versão ${p.numero}`,
      situacao: situacaoDe(p),
    });
  }
  return linhas;
}

export async function listarParametros(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const q = (c.filtros["q"] ?? "").trim().toLowerCase();
  const situacao = c.filtros["situacao"] ?? "";
  const todas = (await linhasCompostas()).filter((l) => {
    if (situacao === "PARAMETRIZADA" && l.situacao !== "Parametrizada") return false;
    if (situacao === "PENDENTE" && l.situacao !== "Sem parâmetro") return false;
    if (situacao === "ENCERRADA" && l.situacao !== "Atualização encerrada") return false;
    if (q === "") return true;
    return l.classe.toLowerCase().includes(q);
  });
  const ordenadas = c.direcao === "desc" ? [...todas].reverse() : todas;
  const inicio = (c.pagina - 1) * TAMANHO_DE_PAGINA;
  return { total: ordenadas.length, linhas: ordenadas.slice(inicio, inicio + TAMANHO_DE_PAGINA) };
}

export async function verParametro(classeId: string): Promise<DetalheLido | null> {
  const prisma = cliente();
  const classe = await prisma.classeDeBens.findUnique({
    where: { id: classeId },
    select: {
      codigo: true, descricao: true, ativa: true,
      contaContabilAtivo: { select: { codigo: true, nome: true } },
    },
  });
  if (classe === null) return null;
  const [vigente, versoes] = await Promise.all([parametroVigente(prisma, classeId), versoesDoParametro(prisma, classeId)]);
  const situacao = situacaoDe(vigente);
  const selos: Array<DetalheLido["selos"][number]> = [
    { texto: situacao, tom: situacao === "Parametrizada" ? "ok" : situacao === "Sem parâmetro" ? "alerta" : "neutro" },
  ];
  if (!classe.ativa) selos.push({ texto: "classe inativa", tom: "erro" });
  if (vigente !== null && vigente.origem === "VERSAO") selos.push({ texto: `versão ${vigente.numero} em vigor`, tom: "neutro" });
  if (vigente !== null && vigente.origem === "LEGADO") selos.push({ texto: "parâmetro de origem, sem versão", tom: "alerta" });

  const dados: Array<DetalheLido["dados"][number]> = [
    { rotulo: "Conta do ativo", valor: `${classe.contaContabilAtivo.codigo} — ${classe.contaContabilAtivo.nome}` },
  ];
  if (vigente === null) {
    dados.push({
      rotulo: "Parâmetro",
      valor: "Nenhum",
      nota:
        "Sem parâmetro, esta classe não entra no processamento mensal. O MCASP sugere vidas úteis, " +
        "mas a definição cabe ao ente.",
    });
  } else {
    dados.push({ rotulo: "Método", valor: ROTULO_DO_METODO[vigente.metodo] ?? vigente.metodo });
    dados.push({ rotulo: "Vida útil", valor: `${vigente.vidaUtilMeses} meses`, nota: "Parcela mensal = (base − valor residual) ÷ vida útil; a última parcela ajusta o arredondamento até o valor residual." });
    dados.push({ rotulo: "Valor residual", valor: residualEmPorcento(vigente.percentualResidual) });
    dados.push({ rotulo: "Em vigor", valor: vigente.ativo ? "Sim — a classe é atualizada" : "Não — a atualização foi encerrada" });
    dados.push({ rotulo: "Vigência", valor: vigente.vigenteDesde === null ? "desde o início" : `desde a competência ${diaCivilBr(vigente.vigenteDesde).slice(3)}`, nota: "Cada competência é calculada com a versão vigente naquela competência." });
    const v = versoes.find((x) => x.vigente);
    if (v !== undefined) {
      dados.push({ rotulo: "Motivo da versão em vigor", valor: v.motivo });
      dados.push({ rotulo: "Competências calculadas por esta versão", valor: String(v.atualizacoes), tipo: "inteiro" });
    }
  }

  return {
    titulo: `${classe.codigo} — ${classe.descricao}`,
    subtitulo: "Parâmetro de depreciação, amortização ou exaustão",
    selos,
    dados,
    historico: versoes.map((v) => ({
      id: v.id,
      oQue:
        `Versão ${v.numero} — ${v.ativo ? `${ROTULO_DO_METODO[v.metodo] ?? v.metodo}, ${v.vidaUtilMeses} meses, residual ${residualEmPorcento(v.percentualResidual)}` : "atualização encerrada"}` +
        (v.vigenteDesde === null ? " · desde o início" : ` · vigente desde ${v.vigenteDesde}`) +
        (v.vigente ? " (a mais recente)" : v.vigenciaFim !== null ? ` (substituída em ${diaCivilBr(v.vigenciaFim)})` : "") +
        (v.atualizacoes > 0 ? ` · ${v.atualizacoes} competência(s) calculada(s) por ela` : ""),
      quando: diaCivilBr(v.criadoEm),
      registradoEm: diaCivilBr(v.criadoEm),
      por: v.criadoPor,
      motivo: v.motivo,
    })),
  };
}

export async function opcoesDosParametros(): Promise<OpcoesDoCadastro> {
  const classes = await cliente().classeDeBens.findMany({
    where: { ativa: true },
    select: { id: true, codigo: true, descricao: true },
    orderBy: { codigo: "asc" },
    take: 500,
  });
  return {
    classeDeBensId: classes.map((c) => ({ valor: c.id, rotulo: `${c.codigo} — ${c.descricao}` })),
  };
}

function versaoDoFormulario(c: Campos): {
  readonly metodo: "DEPRECIACAO" | "AMORTIZACAO" | "EXAUSTAO";
  readonly vidaUtilMeses: string;
  readonly percentualResidual: string;
  readonly motivo: string;
  readonly vigenteDesde?: string;
} {
  const metodo = t(c, "metodo");
  const vigenteDesde = t(c, "vigenteDesde");
  return {
    metodo: metodo === "AMORTIZACAO" ? "AMORTIZACAO" : metodo === "EXAUSTAO" ? "EXAUSTAO" : "DEPRECIACAO",
    vidaUtilMeses: t(c, "vidaUtilMeses"),
    percentualResidual: fracaoDoPorcento(t(c, "percentualResidual")),
    motivo: t(c, "motivo"),
    ...(vigenteDesde !== "" ? { vigenteDesde } : {}),
  };
}

export async function criarParametro(c: Campos): Promise<void> {
  await comEscritaAutenticada("DEFINIR_PARAMETRO_DE_ATUALIZACAO", (criadoPor) =>
    definirParametroDeAtualizacao(cliente(), {
      classeDeBensId: t(c, "classeDeBensId"),
      ...versaoDoFormulario(c),
      criadoPor,
    })
  );
}

/** ⚠️ FAIL-CLOSED: ação desconhecida ESTOURA — a tela não diz "gravado" sem ter gravado. */
export async function acaoDoParametro(acao: string, classeId: string, c: Campos): Promise<void> {
  if (acao === "definir") {
    await comEscritaAutenticada("DEFINIR_PARAMETRO_DE_ATUALIZACAO", (criadoPor) =>
      definirParametroDeAtualizacao(cliente(), { classeDeBensId: classeId, ...versaoDoFormulario(c), criadoPor })
    );
    return;
  }
  if (acao === "encerrar") {
    await comEscritaAutenticada("DEFINIR_PARAMETRO_DE_ATUALIZACAO", async (criadoPor) => {
      const prisma = cliente();
      // Encerrar é uma versão com `ativo = false` que REPETE o parâmetro em vigor — a régua
      // continua legível no histórico; só a atualização para. Sem parâmetro, não há o que encerrar.
      const vigente = await parametroVigente(prisma, classeId);
      if (vigente === null) {
        throw new Error("Esta classe não tem parâmetro de atualização a encerrar. Nada foi gravado.");
      }
      return definirParametroDeAtualizacao(prisma, {
        classeDeBensId: classeId,
        metodo: vigente.metodo,
        vidaUtilMeses: vigente.vidaUtilMeses,
        percentualResidual: vigente.percentualResidual.toFixed(6),
        ativo: false,
        motivo: t(c, "motivo"),
        criadoPor,
      });
    });
    return;
  }
  throw new Error(`Ação "${acao}" não existe neste cadastro. Nada foi gravado.`);
}
