import type { Tx } from "../m16-travamento/autorizacao.js";
import { exibirValor, type TipoDeCampo, type CadastroComCampos } from "./dominio.js";

/**
 * M25 — AS CONSULTAS. Leitura pura.
 *
 * ⚠️ A VERSÃO VIGENTE É A MAIS RECENTE, e a leitura é que resolve isso. Guardar um
 * ponteiro "valor atual" numa coluna seria a segunda verdade — e ela divergiria no dia
 * em que uma gravação falhasse entre o append e a atualização do ponteiro.
 */

export interface CampoDoRegistro {
  readonly definicaoId: string;
  readonly codigo: string;
  readonly rotulo: string;
  readonly tipo: TipoDeCampo;
  readonly obrigatorio: boolean;
  readonly ordem: number;
  readonly ativo: boolean;
  /** Texto de exibição do valor vigente. Vazio quando nunca preenchido ou apagado. */
  readonly valor: string;
  readonly preenchidoEm: Date | null;
  readonly preenchidoPor: string | null;
  readonly opcoes: readonly string[];
}

const FK_DO_CADASTRO: Record<CadastroComCampos, "pessoaId" | "processoId" | "comunicadoId"> = {
  PESSOA: "pessoaId",
  PROCESSO: "processoId",
  COMUNICADO: "comunicadoId",
};

/**
 * OS CAMPOS DE UM REGISTRO, com o valor vigente.
 *
 * ⚠️ DEFINIÇÕES DESATIVADAS APARECEM **SE TIVEREM VALOR**. Um campo que a entidade
 * parou de usar não deve aparecer no formulário — mas esconder o que já foi respondido
 * apagaria da tela um dado que continua no banco, e o usuário concluiria que ele se
 * perdeu.
 */
export async function camposDoRegistro(
  tx: Tx,
  cadastro: CadastroComCampos,
  registroId: string,
  unidadeOrcId: string
): Promise<readonly CampoDoRegistro[]> {
  const definicoes = await tx.definicaoDeCampoAdicional.findMany({
    where: { unidadeOrcId, cadastro },
    select: {
      id: true,
      codigo: true,
      rotulo: true,
      tipo: true,
      obrigatorio: true,
      ordem: true,
      ativo: true,
      opcoes: { select: { valor: true }, orderBy: { ordem: "asc" } },
    },
    orderBy: { ordem: "asc" },
  });
  if (definicoes.length === 0) return [];

  const valores = await tx.valorDeCampoAdicional.findMany({
    where: {
      definicaoId: { in: definicoes.map((d) => d.id) },
      [FK_DO_CADASTRO[cadastro]]: registroId,
    },
    select: {
      definicaoId: true,
      valorTexto: true,
      valorNumero: true,
      valorData: true,
      valorBooleano: true,
      apagado: true,
      criadoEm: true,
      criadoPor: true,
    },
    orderBy: { criadoEm: "desc" },
  });

  // O primeiro de cada definição é o vigente — a ordenação já é decrescente.
  const vigente = new Map<string, (typeof valores)[number]>();
  for (const v of valores) {
    if (!vigente.has(v.definicaoId)) vigente.set(v.definicaoId, v);
  }

  return definicoes
    .map((d): CampoDoRegistro => {
      const v = vigente.get(d.id);
      const texto =
        v === undefined || v.apagado
          ? ""
          : exibirValor(d.tipo as TipoDeCampo, {
              valorTexto: v.valorTexto,
              valorNumero: v.valorNumero?.toFixed(2) ?? null,
              valorData: v.valorData,
              valorBooleano: v.valorBooleano,
            });
      return {
        definicaoId: d.id,
        codigo: d.codigo,
        rotulo: d.rotulo,
        tipo: d.tipo as TipoDeCampo,
        obrigatorio: d.obrigatorio,
        ordem: d.ordem,
        ativo: d.ativo,
        valor: texto,
        preenchidoEm: v?.criadoEm ?? null,
        preenchidoPor: v?.criadoPor ?? null,
        opcoes: d.opcoes.map((o) => o.valor),
      };
    })
    .filter((c) => c.ativo || c.valor !== "");
}

export interface AlteracaoDeCampo {
  readonly codigo: string;
  readonly rotulo: string;
  readonly valor: string;
  readonly apagado: boolean;
  readonly em: Date;
  readonly por: string;
}

/**
 * O HISTÓRICO DE ALTERAÇÕES de um registro — é o que "versionado e auditado" significa.
 *
 * ⚠️ NÃO HÁ UMA SEGUNDA TABELA DE DIFFS. O histórico É a tabela de valores, porque ela
 * é append-only. Uma estrutura paralela de auditoria seria mais uma coisa para alguém
 * esquecer de escrever — e ela mente exatamente no caminho que esqueceram.
 */
export async function historicoDeCamposAdicionais(
  tx: Tx,
  cadastro: CadastroComCampos,
  registroId: string
): Promise<readonly AlteracaoDeCampo[]> {
  const valores = await tx.valorDeCampoAdicional.findMany({
    where: { [FK_DO_CADASTRO[cadastro]]: registroId },
    select: {
      valorTexto: true,
      valorNumero: true,
      valorData: true,
      valorBooleano: true,
      apagado: true,
      criadoEm: true,
      criadoPor: true,
      definicao: { select: { codigo: true, rotulo: true, tipo: true } },
    },
    orderBy: { criadoEm: "desc" },
  });

  return valores.map((v) => ({
    codigo: v.definicao.codigo,
    rotulo: v.definicao.rotulo,
    valor: v.apagado
      ? ""
      : exibirValor(v.definicao.tipo as TipoDeCampo, {
          valorTexto: v.valorTexto,
          valorNumero: v.valorNumero?.toFixed(2) ?? null,
          valorData: v.valorData,
          valorBooleano: v.valorBooleano,
        }),
    apagado: v.apagado,
    em: v.criadoEm,
    por: v.criadoPor,
  }));
}

/**
 * OS REGISTROS QUE TÊM UM CAMPO COM DETERMINADO VALOR — o filtro na listagem.
 *
 * ⚠️ O FILTRO CAI SOBRE A COLUNA TIPADA, no SQL. É o motivo de existirem quatro colunas
 * em vez de um `valor String`: comparar "1.000" com "900" como texto diria que 900 é
 * maior.
 *
 * ⚠️ E ELE OLHA SÓ O VALOR VIGENTE. Sem isso, um registro cujo campo FOI "urgente" e
 * hoje é "normal" continuaria aparecendo no filtro por "urgente" — o filtro estaria
 * respondendo sobre o passado sem avisar.
 */
export async function registrosComCampo(
  tx: Tx,
  cadastro: CadastroComCampos,
  definicaoId: string,
  igualA: { readonly texto?: string; readonly numero?: string; readonly booleano?: boolean }
): Promise<readonly string[]> {
  const fk = FK_DO_CADASTRO[cadastro];
  const valores = await tx.valorDeCampoAdicional.findMany({
    where: { definicaoId, NOT: { [fk]: null } },
    select: {
      pessoaId: true,
      processoId: true,
      comunicadoId: true,
      valorTexto: true,
      valorNumero: true,
      valorBooleano: true,
      apagado: true,
      criadoEm: true,
    },
    orderBy: { criadoEm: "desc" },
  });

  const vigentes = new Map<string, (typeof valores)[number]>();
  for (const v of valores) {
    const id = v[fk];
    if (id !== null && !vigentes.has(id)) vigentes.set(id, v);
  }

  const casa = (v: (typeof valores)[number]): boolean => {
    if (v.apagado) return false;
    if (igualA.texto !== undefined) return v.valorTexto === igualA.texto;
    if (igualA.numero !== undefined) {
      return v.valorNumero !== null && v.valorNumero.toFixed(2) === igualA.numero;
    }
    if (igualA.booleano !== undefined) return v.valorBooleano === igualA.booleano;
    return false;
  };

  return [...vigentes.entries()].filter(([, v]) => casa(v)).map(([id]) => id);
}
