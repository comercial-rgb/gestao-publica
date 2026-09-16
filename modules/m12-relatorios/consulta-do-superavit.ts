import { serializar, toMoney, type Dinheiro, type Money } from "../../packages/contracts/index.js";
import { janelaCivilDoAno, diaCivilBr } from "../../packages/datas/index.js";
import { linhasDoSuperavitPorFonte, type Leitor } from "./superavit-por-fonte.js";
import { usosDoRecursoNovo } from "../m03-creditos/consulta-da-disponibilidade.js";

/**
 * ═══ A CONSULTA DO SUPERÁVIT: APURADO, DECLARADO, UTILIZADO E DISPONÍVEL (V11 V3.1) ═══
 *
 * ⚠️ SÃO DOIS TETOS, E A TELA MOSTRA OS DOIS. Um crédito por superávit tem de caber sob o
 * que os FATOS dão (`apurado`) E sob o que alguém DECLAROU ter apurado (`declarado`). O
 * guard do M03 confere contra os dois; uma tela que mostrasse só um deles anunciaria
 * disponibilidade que o guard recusa, ou esconderia a que ele aceita. Qual dos dois está
 * mordendo é a informação que o servidor precisa para saber o que corrigir.
 *
 * ⚠️ ZERO SEGUNDA ARITMÉTICA. `apurado` vem de `linhasDoSuperavitPorFonte` (a mesma do
 * Anexo 14 e do guard); `utilizado` vem de `usadoDaDisponibilidade` (a mesma que o guard
 * subtrai). Esta porta SOMA e SUBTRAI o que os donos produziram — não reconstrói nada.
 *
 * ⚠️ EXERCÍCIO ANTERIOR NÃO ENCERRADO NÃO É SUPERÁVIT ZERO. É dado AUSENTE, e a consulta
 * diz isso com o nome. Mostrar zero faria a tela afirmar que não há lastro quando o que
 * há é um exercício ainda aberto — e o servidor iria procurar dinheiro que existe.
 */

export interface LinhaDaConsultaDoSuperavit {
  readonly fonteCodigo: string;
  readonly fonteDescricao: string;
  /** Dos FATOS, no encerramento do exercício anterior. `null` = exercício não encerrado. */
  readonly apurado: Dinheiro | null;
  /** O que foi declarado para este exercício. `null` = nada declarado. */
  readonly declarado: Dinheiro | null;
  readonly utilizado: Dinheiro;
  /** min(apurado, declarado) − utilizado. `null` quando falta um dos dois tetos. */
  readonly disponivel: Dinheiro | null;
  /** Qual teto está limitando — o que o servidor precisa saber para agir. */
  readonly tetoQueLimita: "FATOS" | "DECLARACAO" | "IGUAIS" | "SEM_TETO";
  readonly situacao: string;
  readonly decretos: readonly {
    readonly identificacao: string;
    readonly data: string;
    readonly liquido: Dinheiro;
    readonly encerrado: boolean;
  }[];
}

export interface ConsultaDoSuperavit {
  readonly exercicio: number;
  readonly exercicioApurado: number;
  readonly exercicioAnteriorEncerrado: boolean;
  readonly linhas: readonly LinhaDaConsultaDoSuperavit[];
  readonly totalApurado: Dinheiro | null;
  readonly totalUtilizado: Dinheiro;
  readonly totalDisponivel: Dinheiro | null;
}

/**
 * ⚠️ RECEBE UM `Leitor`, e a porta e o teste passam clientes DIFERENTES. Amarrar `cliente()`
 * aqui dentro tornaria esta composição impossível de exercitar contra o banco de teste — e a
 * consulta que ninguém consegue testar é a que diverge do guard em silêncio.
 *
 * ⚠️ MORA NO M12, E NÃO NA PORTA: a seta entre os módulos já é m12 → m03 (é o M12 que responde
 * a pergunta do superávit ao M03). Compor na porta poria aritmética de dois módulos numa
 * camada que não é dona de nenhum dos dois.
 */
export async function consultaDoSuperavit(prisma: Leitor, exercicio: number): Promise<ConsultaDoSuperavit> {
  const anterior = exercicio - 1;

  const fechamento = await prisma.exercicio.findUnique({
    where: { ano: anterior },
    select: { encerramento: { select: { id: true } } },
  });
  const encerrado = fechamento !== null && fechamento.encerramento !== null;

  const [apuradoPorFonte, usos] = await Promise.all([
    encerrado
      ? linhasDoSuperavitPorFonte(prisma, { corte: janelaCivilDoAno(anterior).fim }).then((r) => r.porFonteId)
      : Promise.resolve(null),
    usosDoRecursoNovo(prisma, { exercicio, origem: "SUPERAVIT_FINANCEIRO" }),
  ]);

  // ⚠️ AS FONTES QUE TÊM APURADO E NÃO TÊM DECLARAÇÃO APARECEM TAMBÉM. Elas são dinheiro
  // que existe e que ninguém pode usar enquanto não for declarado — e omiti-las faria a
  // tela esconder exatamente o passo que falta dar.
  const declaradas = new Map(usos.map((u) => [u.fonteId, u]));
  const idsComApurado = apuradoPorFonte === null ? [] : [...apuradoPorFonte.keys()].filter((id) => !declaradas.has(id) && (apuradoPorFonte.get(id) ?? toMoney(0)).gt(0));
  const fontesSoComApurado = idsComApurado.length === 0 ? [] : await prisma.fonteRecurso.findMany({ where: { id: { in: idsComApurado } }, select: { id: true, codigo: true, descricao: true } });

  const linhas: LinhaDaConsultaDoSuperavit[] = [];

  for (const u of usos) {
    const apurado = apuradoPorFonte === null ? null : (apuradoPorFonte.get(u.fonteId) ?? toMoney("0.00"));
    const teto = apurado === null ? null : (apurado.lt(u.declarado) ? apurado : u.declarado);
    const disponivel = teto === null ? null : toMoney(teto.minus(u.utilizado));
    linhas.push({
      fonteCodigo: u.fonteCodigo,
      fonteDescricao: u.fonteDescricao,
      apurado: apurado === null ? null : serializar(apurado),
      declarado: serializar(u.declarado),
      utilizado: serializar(u.utilizado),
      disponivel: disponivel === null ? null : serializar(disponivel),
      tetoQueLimita: apurado === null ? "SEM_TETO" : apurado.eq(u.declarado) ? "IGUAIS" : apurado.lt(u.declarado) ? "FATOS" : "DECLARACAO",
      situacao:
        apurado === null
          ? `O exercício ${anterior} não foi encerrado: não há superávit apurável contra o que conferir. Nenhum crédito por superávit é aceito antes do encerramento.`
          : apurado.lt(u.declarado)
            ? `Os fatos do exercício ${anterior} dão menos do que a declaração: quem manda é o menor. A declaração precisa ser corrigida.`
            : apurado.gt(u.declarado)
              ? "A declaração é menor que os fatos: só o declarado pode ser usado. Declarar o restante libera o resto."
              : "Declaração e fatos coincidem.",
      decretos: u.decretos.map((d) => ({
        identificacao: `${d.numero}/${d.ano}`,
        data: diaCivilBr(d.data),
        liquido: serializar(d.liquido),
        encerrado: d.encerrado,
      })),
    });
  }

  for (const f of fontesSoComApurado) {
    const apurado = apuradoPorFonte?.get(f.id) ?? toMoney("0.00");
    linhas.push({
      fonteCodigo: f.codigo,
      fonteDescricao: f.descricao,
      apurado: serializar(apurado),
      declarado: null,
      utilizado: serializar(toMoney("0.00")),
      disponivel: null,
      tetoQueLimita: "SEM_TETO",
      situacao: "Há superávit apurado nos fatos e NENHUMA disponibilidade declarada para este exercício. Enquanto não houver declaração, nenhum crédito pode sair desta fonte.",
      decretos: [],
    });
  }

  linhas.sort((a, b) => a.fonteCodigo.localeCompare(b.fonteCodigo));

  const somar = (vs: readonly Money[]): Money => vs.reduce((a, b) => toMoney(a.plus(b)), toMoney("0.00"));
  const utilizados = usos.map((u) => u.utilizado);
  const disponiveis = linhas.map((l) => l.disponivel).filter((d): d is Dinheiro => d !== null).map((d) => toMoney(d));
  const apurados = linhas.map((l) => l.apurado).filter((a): a is Dinheiro => a !== null).map((a) => toMoney(a));

  return {
    exercicio,
    exercicioApurado: anterior,
    exercicioAnteriorEncerrado: encerrado,
    linhas,
    totalApurado: encerrado ? serializar(somar(apurados)) : null,
    totalUtilizado: serializar(somar(utilizados)),
    totalDisponivel: encerrado ? serializar(somar(disponiveis)) : null,
  };
}
