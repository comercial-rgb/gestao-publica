import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import type { Tx } from "../m16-travamento/autorizacao.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { setorAtual } from "../m21-protocolo/dominio.js";
import {
  estaPreenchido,
  valorParaColunas,
  zDefinirCampoAdicional,
  zDesativarCampoAdicional,
  zPreencherCamposAdicionais,
  type CadastroComCampos,
  type DefinirCampoAdicionalInput,
  type DesativarCampoAdicionalInput,
  type OrigemDinamica,
  type PreencherCamposAdicionaisInput,
  type TipoDeCampo,
} from "./dominio.js";

/**
 * M25 — OS CASOS DE USO DOS CAMPOS ADICIONAIS.
 *
 * ═══ ⚠️ A DEFINIÇÃO É POR UNIDADE GESTORA, E A GRAVAÇÃO RESPEITA ISSO ═══
 * `preencherCamposAdicionais` só enxerga as definições da UG DO REGISTRO. Um código de
 * campo que exista noutra unidade simplesmente não é encontrado — e a mensagem diz
 * exatamente isso, em vez de gravar em silêncio no campo de outra entidade.
 *
 * É o teste 13 do lote, e ele não é uma consulta filtrada: é a impossibilidade de a
 * gravação alcançar a definição alheia.
 */

// ═══════════════════════════════════════════════════════════════════════════
// A DEFINIÇÃO
// ═══════════════════════════════════════════════════════════════════════════

export async function definirCampoAdicional(
  prisma: PrismaClient,
  input: DefinirCampoAdicionalInput
): Promise<{ readonly definicaoId: string }> {
  const d = zDefinirCampoAdicional.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.definirCampoAdicional, {
      ug: d.unidadeOrcId,
    });

    if (d.tipo === "LISTA" && d.opcoes.length === 0) {
      throw new Error(
        `Um campo do tipo LISTA sem opção nenhuma não aceita valor nenhum: ele seria um ` +
          `campo que a tela mostra e ninguém consegue preencher. Cadastre as opções. ` +
          `Nada foi gravado.`
      );
    }
    if (d.tipo !== "LISTA" && d.opcoes.length > 0) {
      throw new Error(
        `Opções só fazem sentido no tipo LISTA. Para uma lista alimentada por cadastro ` +
          `do sistema, use LISTA_DINAMICA com a origem. Nada foi gravado.`
      );
    }
    if (d.tipo === "LISTA_DINAMICA" && d.origemDinamica === undefined) {
      throw new Error(
        `LISTA_DINAMICA exige a ORIGEM das opções. Sem ela o campo não teria de onde ` +
          `tirar a lista. Nada foi gravado.`
      );
    }
    if (d.tipo !== "LISTA_DINAMICA" && d.origemDinamica !== undefined) {
      throw new Error(
        `A origem dinâmica só se aplica ao tipo LISTA_DINAMICA. Nada foi gravado.`
      );
    }

    const ug = await tx.unidadeOrcamentaria.findUnique({
      where: { id: d.unidadeOrcId },
      select: { codigo: true },
    });
    if (ug === null) {
      throw new Error(`Unidade gestora ${d.unidadeOrcId} não existe. Nada foi gravado.`);
    }

    const existente = await tx.definicaoDeCampoAdicional.findUnique({
      where: {
        unidadeOrcId_cadastro_codigo: {
          unidadeOrcId: d.unidadeOrcId,
          cadastro: d.cadastro,
          codigo: d.codigo,
        },
      },
      select: { rotulo: true, ativo: true },
    });
    if (existente !== null) {
      throw new Error(
        `Já existe o campo "${d.codigo}" (${existente.rotulo}) no cadastro ` +
          `${d.cadastro} da unidade ${ug.codigo}${existente.ativo ? "" : " (desativado)"}. ` +
          `O código identifica o campo — reaproveitá-lo para outra coisa faria os valores ` +
          `antigos passarem a significar o que nunca significaram. Nada foi gravado.`
      );
    }

    const def = await tx.definicaoDeCampoAdicional.create({
      data: {
        unidadeOrcId: d.unidadeOrcId,
        cadastro: d.cadastro,
        codigo: d.codigo,
        rotulo: d.rotulo,
        tipo: d.tipo,
        obrigatorio: d.obrigatorio,
        ordem: d.ordem,
        origemDinamica: d.origemDinamica ?? null,
        criadoPor: d.criadoPor,
        opcoes: {
          create: [...new Set(d.opcoes)].map((valor, i) => ({ valor, ordem: i + 1 })),
        },
      },
      select: { id: true },
    });
    return { definicaoId: def.id };
  });
}

/**
 * DESATIVA — e NÃO apaga.
 *
 * ⚠️ APAGAR A DEFINIÇÃO LEVARIA OS VALORES JUNTO, e com eles o histórico de um dado que
 * a entidade coletou de verdade. Um campo desativado some do formulário e continua
 * visível no detalhe dos registros que o têm — que é o que "parei de usar" significa.
 */
export async function desativarCampoAdicional(
  prisma: PrismaClient,
  input: DesativarCampoAdicionalInput
): Promise<{ readonly definicaoId: string }> {
  const d = zDesativarCampoAdicional.parse(input);

  return prisma.$transaction(async (tx) => {
    const def = await tx.definicaoDeCampoAdicional.findUnique({
      where: { id: d.definicaoId },
      select: { unidadeOrcId: true, ativo: true, rotulo: true },
    });
    if (def === null) {
      throw new Error(`Campo adicional ${d.definicaoId} não existe. Nada foi gravado.`);
    }
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.desativarCampoAdicional, {
      ug: def.unidadeOrcId,
    });
    if (!def.ativo) {
      throw new Error(`O campo "${def.rotulo}" já está desativado. Nada foi gravado.`);
    }

    await tx.definicaoDeCampoAdicional.update({
      where: { id: d.definicaoId },
      data: { ativo: false },
    });
    return { definicaoId: d.definicaoId };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// O PREENCHIMENTO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GRAVA OS VALORES — um append por campo alterado.
 *
 * ⚠️ CÓDIGO DESCONHECIDO É RECUSADO, e não ignorado. Ignorar em silêncio faria a tela
 * "salvar com sucesso" um formulário cujo campo não foi gravado — e o usuário só
 * descobriria dias depois, procurando o dado que ele tem certeza de ter digitado.
 */
export async function preencherCamposAdicionais(
  prisma: PrismaClient,
  input: PreencherCamposAdicionaisInput
): Promise<{ readonly gravados: number; readonly apagados: number }> {
  const d = zPreencherCamposAdicionais.parse(input);

  return prisma.$transaction(async (tx) => {
    const alvo = await resolverRegistro(tx, d.cadastro, d.registroId);
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.preencherCamposAdicionais, alvo.escopo);

    // ⚠️ SÓ AS DEFINIÇÕES DA UG DO REGISTRO. É aqui que o isolamento entre entidades
    // acontece — não numa consulta filtrada depois, mas na impossibilidade de a
    // gravação alcançar a definição alheia.
    const definicoes = await tx.definicaoDeCampoAdicional.findMany({
      where: { unidadeOrcId: alvo.unidadeOrcId, cadastro: d.cadastro, ativo: true },
      select: {
        id: true,
        codigo: true,
        rotulo: true,
        tipo: true,
        obrigatorio: true,
        origemDinamica: true,
        opcoes: { select: { valor: true }, orderBy: { ordem: "asc" } },
      },
    });
    const porCodigo = new Map(definicoes.map((x) => [x.codigo, x]));

    const desconhecidos = Object.keys(d.valores).filter((c) => !porCodigo.has(c));
    if (desconhecidos.length > 0) {
      throw new Error(
        `Campo(s) adicional(is) não encontrado(s) neste cadastro da unidade gestora: ` +
          `${desconhecidos.join(", ")}. Um campo definido em OUTRA unidade não vale aqui — ` +
          `e gravar em silêncio faria a tela dizer "salvo" sobre um dado que não foi. ` +
          `Nada foi gravado.`
      );
    }

    let gravados = 0;
    let apagados = 0;

    for (const [codigo, bruto] of Object.entries(d.valores)) {
      const def = porCodigo.get(codigo)!;
      const opcoes =
        def.tipo === "LISTA_DINAMICA"
          ? await opcoesDinamicas(tx, def.origemDinamica as OrigemDinamica | null, alvo.unidadeOrcId)
          : def.opcoes.map((o) => o.valor);

      const colunas = valorParaColunas(def.tipo as TipoDeCampo, bruto, opcoes);
      const preenchido = estaPreenchido(colunas);

      if (!preenchido && def.obrigatorio) {
        throw new Error(
          `O campo "${def.rotulo}" é obrigatório e veio vazio. Nada foi gravado.`
        );
      }

      await tx.valorDeCampoAdicional.create({
        data: {
          definicaoId: def.id,
          pessoaId: d.cadastro === "PESSOA" ? d.registroId : null,
          processoId: d.cadastro === "PROCESSO" ? d.registroId : null,
          comunicadoId: d.cadastro === "COMUNICADO" ? d.registroId : null,
          valorTexto: colunas.valorTexto,
          valorNumero: colunas.valorNumero,
          valorData: colunas.valorData,
          valorBooleano: colunas.valorBooleano,
          apagado: !preenchido,
          criadoPor: d.criadoPor,
        },
      });

      if (preenchido) gravados += 1;
      else apagados += 1;
    }

    return { gravados, apagados };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS — privados
// ═══════════════════════════════════════════════════════════════════════════

/**
 * DE QUAL UNIDADE GESTORA É ESTE REGISTRO, E QUAL É O ESCOPO DO ATO.
 *
 * ⚠️ A PESSOA É DO ENTE, NÃO DE UMA UG. O cadastro de pessoas é compartilhado (M19): o
 * mesmo fornecedor é credor da Educação e da Saúde. Então o campo adicional de pessoa é
 * definido na unidade que o ente escolher para isso, e a gravação usa ESSA — não uma
 * unidade "da pessoa", que não existe.
 *
 * Fail-closed: sem uma unidade definida para o cadastro de pessoas, a gravação recusa
 * em vez de escolher uma qualquer.
 */
async function resolverRegistro(
  tx: Tx,
  cadastro: CadastroComCampos,
  registroId: string
): Promise<{
  readonly unidadeOrcId: string;
  readonly escopo: "ENTE" | { readonly setor: string } | { readonly ug: string };
}> {
  if (cadastro === "PROCESSO") {
    const p = await tx.processo.findUnique({
      where: { id: registroId },
      select: {
        setorAberturaId: true,
        setorAbertura: { select: { unidadeOrcId: true } },
        movimentos: {
          select: {
            id: true,
            tipo: true,
            setorOrigemId: true,
            setorDestinoId: true,
            respondeAId: true,
            tornaSemEfeitoId: true,
            criadoEm: true,
          },
        },
      },
    });
    if (p === null) {
      throw new Error(`Processo ${registroId} não existe. Nada foi gravado.`);
    }
    return {
      unidadeOrcId: p.setorAbertura.unidadeOrcId,
      escopo: { setor: setorAtual(p.setorAberturaId, p.movimentos) },
    };
  }

  if (cadastro === "COMUNICADO") {
    const c = await tx.comunicado.findUnique({
      where: { id: registroId },
      select: {
        setorRemetenteId: true,
        setorRemetente: { select: { unidadeOrcId: true } },
      },
    });
    if (c === null) {
      throw new Error(`Comunicado ${registroId} não existe. Nada foi gravado.`);
    }
    return {
      unidadeOrcId: c.setorRemetente.unidadeOrcId,
      escopo: { setor: c.setorRemetenteId },
    };
  }

  const pessoa = await tx.pessoa.findUnique({
    where: { id: registroId },
    select: { id: true },
  });
  if (pessoa === null) {
    throw new Error(`Pessoa ${registroId} não existe. Nada foi gravado.`);
  }

  const unidades = await tx.definicaoDeCampoAdicional.findMany({
    where: { cadastro: "PESSOA", ativo: true },
    select: { unidadeOrcId: true },
    distinct: ["unidadeOrcId"],
  });
  if (unidades.length === 0) {
    throw new Error(
      `Nenhum campo adicional está definido para o cadastro de pessoas. Defina os campos ` +
        `antes de preenchê-los. Nada foi gravado.`
    );
  }
  if (unidades.length > 1) {
    // ⚠️ FAIL-CLOSED, E COM O MOTIVO. O cadastro de pessoas é do ENTE; duas unidades
    // definindo campos para ele criam a pergunta "os campos de qual delas valem?", e
    // escolher uma em silêncio gravaria o dado no lugar errado.
    throw new Error(
      `Há campos adicionais de PESSOA definidos em ${unidades.length} unidades gestoras ` +
        `diferentes, e o cadastro de pessoas é do ENTE — não de uma unidade. Não dá para ` +
        `saber quais campos valem. Concentre a definição numa unidade só. Nada foi gravado. ` +
        `(Pendência: CAMPO-ADICIONAL-PESSOA-NO-ENTE.)`
    );
  }
  return { unidadeOrcId: unidades[0]!.unidadeOrcId, escopo: "ENTE" };
}

/** As opções de uma LISTA_DINAMICA — de um rol FECHADO de cadastros. */
async function opcoesDinamicas(
  tx: Tx,
  origem: OrigemDinamica | null,
  unidadeOrcId: string
): Promise<readonly string[]> {
  switch (origem) {
    case "SETOR": {
      const s = await tx.setor.findMany({
        where: { unidadeOrcId, ativo: true },
        select: { codigo: true },
        orderBy: { codigo: "asc" },
      });
      return s.map((x) => x.codigo);
    }
    case "ASSUNTO": {
      const a = await tx.assunto.findMany({
        where: { ativo: true },
        select: { codigo: true },
        orderBy: { codigo: "asc" },
      });
      return a.map((x) => x.codigo);
    }
    case "TIPO_DE_COMUNICADO": {
      const t = await tx.tipoDeComunicado.findMany({
        where: { ativo: true },
        select: { codigo: true },
        orderBy: { codigo: "asc" },
      });
      return t.map((x) => x.codigo);
    }
    default:
      throw new Error(
        `Campo de lista dinâmica sem origem válida. Nada foi gravado.`
      );
  }
}
