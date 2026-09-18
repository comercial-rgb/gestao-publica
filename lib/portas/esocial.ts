import {
  conferirConsistencia,
  type Ambiente,
  type LeiauteLido,
  type LinhaDeOrigem,
  type ResultadoDaConsistencia,
} from "../../modules/m14-exports-federais/esocial/leiaute.js";
import { cliente } from "./cliente.js";

/**
 * A PORTA DA CONSISTÊNCIA PARA O eSOCIAL (V11 V2.1).
 *
 * ⚠️ SÓ LEITURA, E SÓ O QUE PRECISA DO SERVIDOR. A máquina inteira — escolher o pacote vigente,
 * respeitar a vigência de cada evento, achar a origem vazia — mora no M14, pura e testável sem
 * banco. Aqui entram o client e as duas consultas.
 *
 * ⚠️ CONFERE TODOS OS VÍNCULOS REGISTRADOS, e isso é deliberado. Recortar pela folha da
 * competência pareceria mais fino, mas os eventos cadastrais do eSocial alcançam vínculo que
 * não teve remuneração no mês — e qual evento alcança qual vínculo é regra do leiaute, que não
 * está registrado. Recortar por um critério que o leiaute não deu esconderia ausência real.
 *
 * ⚠️ E NÃO PUBLICA NADA. Esta consulta traz nome e matrícula para quem tem `CONSULTAR_FOLHA`
 * corrigir o cadastro. Nada daqui alimenta o portal do cidadão, que tem porta própria e política
 * própria (`lib/portas/pessoal-publico.ts`).
 */

export type { ResultadoDaConsistencia, PendenciaDeConsistencia, Ambiente } from "../../modules/m14-exports-federais/esocial/leiaute.js";

export const AMBIENTES: readonly { readonly valor: Ambiente; readonly rotulo: string }[] = [
  { valor: "PRODUCAO", rotulo: "Produção" },
  { valor: "PRODUCAO_RESTRITA", rotulo: "Produção restrita" },
];

export async function consistenciaDoESocial(criterio: {
  readonly ambiente: Ambiente;
  readonly dia: Date;
}): Promise<ResultadoDaConsistencia> {
  const prisma = cliente();

  const pacotes = await prisma.leiauteDoESocial.findMany({
    where: { ambiente: criterio.ambiente },
    orderBy: { publicadoEm: "desc" },
    include: { eventos: { orderBy: { codigo: "asc" }, include: { campos: { orderBy: { caminho: "asc" } } } } },
  });

  const leiautes: readonly LeiauteLido[] = pacotes.map((p) => ({
    id: p.id,
    versao: p.versao,
    ambiente: p.ambiente,
    fonte: p.fonte,
    sha256: p.sha256,
    arquivo: p.arquivo,
    publicadoEm: p.publicadoEm,
    eventos: p.eventos.map((e) => ({
      id: e.id,
      codigo: e.codigo,
      nome: e.nome,
      xsdArquivo: e.xsdArquivo,
      xsdSha256: e.xsdSha256,
      vigenciaInicio: e.vigenciaInicio,
      vigenciaFim: e.vigenciaFim,
      campos: e.campos.map((c) => ({
        id: c.id,
        caminho: c.caminho,
        rotulo: c.rotulo,
        origem: c.origem,
        obrigatoriedade: c.obrigatoriedade,
        condicao: c.condicao,
        regra: c.regra,
        vigenciaInicio: c.vigenciaInicio,
        vigenciaFim: c.vigenciaFim,
      })),
    })),
  }));

  // ⚠️ SEM PACOTE REGISTRADO, NÃO SE LÊ VÍNCULO NENHUM. O resultado é recusa nomeada, e varrer o
  // quadro inteiro para depois descartar seria trabalho e exposição sem finalidade.
  if (leiautes.length === 0) {
    return conferirConsistencia([], [], criterio);
  }

  const ente = await prisma.enteConfig.findUnique({ where: { id: "unico" }, select: { cnpj: true } });

  const vinculos = await prisma.vinculo.findMany({
    orderBy: { matricula: "asc" },
    select: {
      id: true,
      matricula: true,
      dataAdmissao: true,
      tipo: true,
      regimeJuridico: true,
      regimePrevidenciario: true,
      servidor: {
        select: {
          id: true,
          nomeSocial: true,
          dataNascimento: true,
          sexo: true,
          pisPasep: true,
          nomeMae: true,
          nomePai: true,
          pessoa: {
            select: {
              documento: true,
              versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } },
            },
          },
        },
      },
    },
  });

  const linhas: readonly LinhaDeOrigem[] = vinculos.map((v) => {
    const nome = v.servidor.pessoa.versoes[0]?.nome ?? null;
    return {
      servidorId: v.servidor.id,
      vinculoId: v.id,
      identificacao: `${v.servidor.nomeSocial ?? nome ?? v.servidor.pessoa.documento} — matrícula ${v.matricula}`,
      cpf: v.servidor.pessoa.documento,
      nome,
      nomeSocial: v.servidor.nomeSocial,
      dataNascimento: v.servidor.dataNascimento,
      sexo: v.servidor.sexo,
      nis: v.servidor.pisPasep,
      nomeMae: v.servidor.nomeMae,
      nomePai: v.servidor.nomePai,
      matricula: v.matricula,
      dataAdmissao: v.dataAdmissao,
      tipoDeVinculo: v.tipo,
      regimeJuridico: v.regimeJuridico,
      regimePrevidenciario: v.regimePrevidenciario,
      cnpjDoEnte: ente?.cnpj ?? null,
    };
  });

  return conferirConsistencia(leiautes, linhas, criterio);
}
