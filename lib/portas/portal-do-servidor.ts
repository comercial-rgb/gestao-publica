import { diaCivilBr } from "../../packages/datas/index.js";
import { toMoney } from "../../packages/contracts/index.js";
import { formatarDocumento } from "../../packages/documento/index.js";
import {
  cargoVigenteEm,
  dependenteValeEm,
  gratificacoesVigentesEm,
  lotacaoVigenteEm,
  motivoDaInvalidade,
  regimeVigenteEm,
  salarioBaseVigenteEm,
  situacaoDoVinculo,
  type EventoDoVinculo,
} from "../../modules/m32-pessoal/dominio.js";
import { pessoaDoUsuario } from "../../modules/m16-travamento/servico-pessoa-do-usuario.js";
import { cliente, PortaSemBancoError } from "./cliente";
import type { Identidade } from "./sessao";

/**
 * ═══ O PORTAL DO SERVIDOR (V6 P2.4) — o que é SEU, e só o que é seu ═══
 *
 * O servidor entra com a PRÓPRIA conta e vê os próprios vínculos, dependentes e contracheques.
 *
 * ⚠️ O RECORTE É A PESSOA DA SESSÃO, NÃO UM PARÂMETRO DA URL. Nenhuma função aqui recebe
 * `servidorId` ou `vinculoId`: a porta resolve quem é o usuário pelo vínculo EXPLÍCITO
 * usuário → pessoa (M16, `pessoaDoUsuario`) e lê a partir dele. Não há id de outra pessoa a
 * adulterar porque não há id na entrada — que é mais forte do que conferir um id recebido.
 *
 * ⚠️ SEM O VÍNCULO, A TELA DIZ QUE ELE ESTÁ PENDENTE. Não se procura a pessoa pelo nome do
 * usuário nem pelo e-mail: dois servidores homônimos trocariam de contracheque, e o erro seria
 * descoberto pelo contracheque errado na mão da pessoa errada. É a mesma disciplina de
 * "meus bens" (V3, pacote 2).
 *
 * ⚠️ SÓ FOLHAS FECHADAS. Um cálculo ainda vivo pode ser cancelado e refeito; mostrá-lo ao
 * servidor seria prometer um valor que a competência ainda pode mudar. O que o portal mostra é o
 * cálculo CONGELADO pelo fechamento, com o sha256 que o identifica.
 *
 * ⚠️ A AÇÃO `CONSULTAR_PORTAL_DO_SERVIDOR` NÃO ABRE A FOLHA DO ENTE. Ela é a leitura da ÁREA (é
 * o que o menu e a política administram); o recorte por pessoa é desta porta, e vale mesmo para
 * quem tem `CONSULTAR_FOLHA` — o RH que abrir o portal vê a ficha DELE, não a de quem quiser.
 */

export { PortaSemBancoError };

export interface VinculoDoServidor {
  readonly id: string;
  readonly matricula: string;
  readonly tipo: string;
  readonly regimeJuridico: string;
  readonly regimePrevidenciario: string;
  readonly situacao: string;
  readonly desde: string;
  readonly cargo: string;
  readonly lotacao: string;
  readonly salarioBase: string;
  readonly gratificacoes: readonly { readonly descricao: string; readonly valor: string }[];
}

export interface DependenteDoServidor {
  readonly id: string;
  readonly nome: string;
  readonly parentesco: string;
  readonly nascimento: string;
  readonly finalidades: readonly { readonly finalidade: string; readonly vale: boolean; readonly motivo: string | null }[];
}

export interface ContrachequeDoServidor {
  readonly folhaId: string;
  readonly competencia: string;
  readonly matricula: string;
  readonly liquido: string;
  readonly proventos: string;
  readonly descontos: string;
  readonly fechadaEm: string;
}

export interface MinhaFicha {
  /** `null` = o usuário da sessão não está vinculado a nenhuma pessoa do cadastro. */
  readonly pessoa: { readonly nome: string; readonly documento: string } | null;
  /** `true` = a pessoa existe, mas não tem ficha de servidor. */
  readonly semFicha: boolean;
  readonly nomeSocial: string | null;
  readonly nascimento: string | null;
  readonly vinculos: readonly VinculoDoServidor[];
  readonly dependentes: readonly DependenteDoServidor[];
  readonly contracheques: readonly ContrachequeDoServidor[];
}

const ROTULO_DA_SITUACAO: Readonly<Record<string, string>> = { ATIVO: "ativo", AFASTADO: "afastado", DESLIGADO: "desligado" };

const SELECAO_DE_EVENTOS = {
  orderBy: [{ data: "asc" as const }, { criadoEm: "asc" as const }],
  select: { data: true, criadoEm: true, tipo: true, cargoId: true, lotacaoId: true, salarioBase: true, regimePrevidenciario: true, gratificacaoDescricao: true, gratificacaoValor: true },
};

/**
 * A leitura recebe a IDENTIDADE POR PARÂMETRO, e não a busca sozinha — as duas razões:
 * a tela já chamou o gate (`telaExigeLeituraDoEnte`) e passa o que ele devolveu, sem perguntar
 * duas vezes; e a suíte exercita o recorte com uma identidade qualquer, sem cookie nem servidor.
 */
export async function minhaFichaPara(sessao: Identidade): Promise<MinhaFicha> {
  const prisma = cliente();
  const vazia = { pessoa: null, semFicha: false, nomeSocial: null, nascimento: null, vinculos: [], dependentes: [], contracheques: [] } as const;
  const pessoa = await pessoaDoUsuario(prisma, sessao.identificador);
  if (pessoa === null) return vazia;

  const servidor = await prisma.servidor.findUnique({
    where: { pessoaId: pessoa.pessoaId },
    select: {
      id: true, nomeSocial: true, dataNascimento: true,
      vinculos: {
        orderBy: { dataAdmissao: "asc" },
        select: { id: true, matricula: true, tipo: true, regimeJuridico: true, regimePrevidenciario: true, dataAdmissao: true, eventos: SELECAO_DE_EVENTOS },
      },
      dependentes: {
        orderBy: { dataNascimento: "asc" },
        select: { id: true, nome: true, grauParentesco: true, dataNascimento: true, invalidezPermanente: true, finalidades: { select: { finalidade: true, dataInicio: true, limiteIdadeAnos: true, dataBaixa: true } } },
      },
    },
  });
  const base = { pessoa: { nome: pessoa.nome, documento: formatarDocumento(pessoa.documento) } };
  if (servidor === null) return { ...vazia, ...base, semFicha: true };

  const hoje = new Date();
  const [cargos, lotacoes] = await Promise.all([
    prisma.cargo.findMany({ select: { id: true, codigo: true, denominacao: true } }),
    prisma.lotacao.findMany({ select: { id: true, codigo: true, nome: true } }),
  ]);
  const cargoDe = new Map(cargos.map((c) => [c.id, `${c.codigo} — ${c.denominacao}`]));
  const lotacaoDe = new Map(lotacoes.map((l) => [l.id, `${l.codigo} — ${l.nome}`]));
  const eventos = (es: typeof servidor.vinculos[number]["eventos"]): readonly (EventoDoVinculo & { readonly gratificacaoDescricao: string | null; readonly gratificacaoValor: ReturnType<typeof toMoney> | null })[] =>
    es.map((e) => ({
      data: e.data, criadoEm: e.criadoEm, tipo: e.tipo as EventoDoVinculo["tipo"], cargoId: e.cargoId, lotacaoId: e.lotacaoId,
      regimePrevidenciario: e.regimePrevidenciario, salarioBase: e.salarioBase === null ? null : toMoney(e.salarioBase.toFixed(2)),
      gratificacaoDescricao: e.gratificacaoDescricao, gratificacaoValor: e.gratificacaoValor === null ? null : toMoney(e.gratificacaoValor.toFixed(2)),
    }));

  const vinculos: VinculoDoServidor[] = servidor.vinculos.map((v) => {
    const evs = eventos(v.eventos);
    return {
      id: v.id, matricula: v.matricula, tipo: v.tipo, regimeJuridico: v.regimeJuridico,
      regimePrevidenciario: regimeVigenteEm(evs, v.regimePrevidenciario, hoje) ?? "não informado",
      situacao: ROTULO_DA_SITUACAO[situacaoDoVinculo(evs, hoje)] ?? situacaoDoVinculo(evs, hoje),
      desde: diaCivilBr(v.dataAdmissao),
      cargo: cargoDe.get(cargoVigenteEm(evs, hoje) ?? "") ?? "—",
      lotacao: lotacaoDe.get(lotacaoVigenteEm(evs, hoje) ?? "") ?? "—",
      salarioBase: salarioBaseVigenteEm(evs, hoje)?.toFixed(2) ?? "—",
      gratificacoes: gratificacoesVigentesEm(evs, hoje).map((g) => ({ descricao: g.descricao, valor: g.valor.toFixed(2) })),
    };
  });

  const dependentes: DependenteDoServidor[] = servidor.dependentes.map((d) => ({
    id: d.id, nome: d.nome, parentesco: d.grauParentesco, nascimento: diaCivilBr(d.dataNascimento),
    finalidades: d.finalidades.map((f) => {
      const forma = { dataNascimento: d.dataNascimento, invalidezPermanente: d.invalidezPermanente, dataInicio: f.dataInicio, limiteIdadeAnos: f.limiteIdadeAnos, dataBaixa: f.dataBaixa };
      return { finalidade: f.finalidade, vale: dependenteValeEm(forma, hoje), motivo: motivoDaInvalidade(forma, hoje) };
    }),
  }));

  // ⚠️ SÓ O CÁLCULO QUE O FECHAMENTO CONGELOU: `fechamento.calculoId`, não o último cálculo.
  const fechados = await prisma.contracheque.findMany({
    where: { vinculoId: { in: servidor.vinculos.map((v) => v.id) }, calculo: { fechamento: { isNot: null } } },
    orderBy: [{ calculo: { folha: { competencia: "desc" } } }, { vinculo: { matricula: "asc" } }],
    select: {
      totalProventos: true, totalDescontos: true, liquido: true,
      vinculo: { select: { matricula: true } },
      calculo: { select: { folha: { select: { id: true, competencia: true } }, fechamento: { select: { criadoEm: true } } } },
    },
  });

  return {
    ...base,
    semFicha: false,
    nomeSocial: servidor.nomeSocial,
    nascimento: diaCivilBr(servidor.dataNascimento),
    vinculos,
    dependentes,
    contracheques: fechados.map((c) => ({
      folhaId: c.calculo.folha.id, competencia: c.calculo.folha.competencia, matricula: c.vinculo.matricula,
      liquido: toMoney(c.liquido).toFixed(2), proventos: toMoney(c.totalProventos).toFixed(2), descontos: toMoney(c.totalDescontos).toFixed(2),
      fechadaEm: c.calculo.fechamento === null ? "—" : diaCivilBr(c.calculo.fechamento.criadoEm),
    })),
  };
}

export interface MeuContracheque {
  readonly competencia: string;
  readonly matricula: string;
  readonly regime: string;
  readonly dias: number;
  readonly fechadaEm: string;
  readonly sha256: string;
  readonly totais: { readonly proventos: string; readonly descontos: string; readonly liquido: string };
  readonly linhas: readonly { readonly id: string; readonly codigo: string; readonly descricao: string; readonly tipo: string; readonly valor: string; readonly memoria: string }[];
}

/**
 * O contracheque de UMA competência — dos vínculos DESTE usuário, e só deles.
 *
 * ⚠️ A FOLHA VEM POR ID NA URL, E ISSO É SEGURO AQUI porque o `where` cruza o id da folha com os
 * vínculos da pessoa da sessão: pedir a folha certa com o vínculo de outro devolve vazio, não o
 * contracheque alheio. O `vinculoId` NUNCA vem da URL.
 */
export async function meuContrachequePara(sessao: Identidade, folhaId: string): Promise<readonly MeuContracheque[]> {
  const prisma = cliente();
  const pessoa = await pessoaDoUsuario(prisma, sessao.identificador);
  if (pessoa === null) return [];
  const servidor = await prisma.servidor.findUnique({ where: { pessoaId: pessoa.pessoaId }, select: { vinculos: { select: { id: true } } } });
  if (servidor === null) return [];

  const contracheques = await prisma.contracheque.findMany({
    where: { vinculoId: { in: servidor.vinculos.map((v) => v.id) }, calculo: { folhaId, fechamento: { isNot: null } } },
    orderBy: { vinculo: { matricula: "asc" } },
    select: {
      regime: true, diasComputados: true, totalProventos: true, totalDescontos: true, liquido: true, sha256: true,
      vinculo: { select: { matricula: true } },
      calculo: { select: { folha: { select: { competencia: true } }, fechamento: { select: { criadoEm: true } } } },
      linhas: { orderBy: { ordem: "asc" }, select: { id: true, tipo: true, valor: true, memoria: true, rubrica: { select: { codigo: true, descricao: true } } } },
    },
  });
  return contracheques.map((c) => ({
    competencia: c.calculo.folha.competencia,
    matricula: c.vinculo.matricula,
    regime: c.regime,
    dias: c.diasComputados,
    fechadaEm: c.calculo.fechamento === null ? "—" : diaCivilBr(c.calculo.fechamento.criadoEm),
    sha256: c.sha256,
    totais: { proventos: toMoney(c.totalProventos).toFixed(2), descontos: toMoney(c.totalDescontos).toFixed(2), liquido: toMoney(c.liquido).toFixed(2) },
    linhas: c.linhas.map((l) => ({ id: l.id, codigo: l.rubrica.codigo, descricao: l.rubrica.descricao, tipo: l.tipo, valor: toMoney(l.valor).toFixed(2), memoria: l.memoria })),
  }));
}
