import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import {
  comporFicha,
  comporReceitaPrevista,
  comporReprevisao,
  type CriarFichaInput,
  type CriarReceitaPrevistaInput,
  type ReprevisarReceitaInput,
} from "./dominio.js";
import type {
  M02Deps,
  ResolucaoClassificacao,
  UnidadeResolvida,
} from "./ports.js";

/**
 * CASOS DE USO do M02. Orquestra domain puro + ports. Não fala Prisma.
 *
 * FAIL-CLOSED em três barreiras:
 * 1. forma (Zod, em `dominio.ts`) — componente obrigatório ausente;
 * 2. existência (aqui, contra a ClassificacaoRepositoryPort) — código que não
 *    existe no plano nunca vira ficha; nada é criado implicitamente;
 * 3. coerência órgão × UO (aqui) — ver nota abaixo;
 * e a unicidade `uq_ficha_sagres`, que é do BANCO (o adapter traduz o erro).
 */

/**
 * A ficha guarda `orgaoId` E `unidadeOrcId`, mas a UO já aponta para o órgão —
 * o órgão na ficha é DENORMALIZADO (fiel ao SAGRES, que exporta os dois). Isso
 * abre espaço para divergência: ficha.orgao != ficha.unidadeOrc.orgao. Sem esta
 * checagem, o Dotacao.txt sairia com um órgão que não é o dono da UO, e o TCE
 * rejeitaria — ou pior, aceitaria errado.
 */
function conferirCoerenciaOrgaoUnidade(
  orgaoId: string,
  unidade: UnidadeResolvida
): void {
  if (unidade.orgaoId !== orgaoId) {
    throw new Error(
      `Órgão incoerente com a unidade orçamentária: a UO pertence ao órgão ` +
        `${unidade.orgaoId}, mas a ficha declara ${orgaoId}.`
    );
  }
}

/** Lista, em português, os componentes que não existem no plano. */
function componentesFaltantes(
  resolucao: ResolucaoClassificacao,
  classificacao: Record<string, string | undefined>
): readonly string[] {
  const obrigatorios = [
    "orgao",
    "unidadeOrc",
    "funcao",
    "subfuncao",
    "programa",
    "acao",
    "naturezaDespesa",
    "fonte",
  ] as const;

  const faltantes = obrigatorios
    .filter((chave) => resolucao[chave] === null)
    .map((chave) => `${chave}="${classificacao[chave] ?? ""}"`);

  // `co` é opcional: só é falta se foi INFORMADO e não existe.
  if (classificacao["co"] !== undefined && resolucao.co === null) {
    faltantes.push(`co="${classificacao["co"]}"`);
  }

  return faltantes;
}

/** Cria uma ficha orçamentária (dotação da LOA). */
export async function criarFicha(
  input: CriarFichaInput,
  deps: M02Deps
): Promise<string> {
  const dados = comporFicha(input);

  const resolucao = await deps.classificacao.resolver(dados.classificacao);

  const faltantes = componentesFaltantes(resolucao, dados.classificacao);
  if (faltantes.length > 0) {
    throw new Error(
      `Componente(s) inexistente(s) no plano de classificação: ` +
        `${faltantes.join(", ")}.`
    );
  }

  // Após a checagem de faltantes, os obrigatórios estão todos resolvidos.
  const orgao = resolucao.orgao!;
  const unidadeOrc = resolucao.unidadeOrc!;

  conferirCoerenciaOrgaoUnidade(orgao.id, unidadeOrc);

  // ⚠️ AQUI A UG NÃO SE DERIVA: ELA É O PRÓPRIO OBJETO DO ATO.
  //
  // Em todo o resto do sistema a unidade do fato é descoberta andando até a ficha. Na criação
  // DA ficha, a unidade vem no input — e é justamente o que se está decidindo. Quem cria fichas
  // da Saúde precisa de permissão NA Saúde; a permissão GLOBAL cria em qualquer uma.
  //
  // (A resolução do código da UO precede a chamada porque não dá para perguntar "ele pode
  // AQUI?" antes de saber onde é "aqui" — e um código de UO que não existe no plano já foi
  // barrado acima, com a mensagem do M02.)
  await deps.autz.exigir(dados.criadoPor, ACAO_DO_SERVICO.criarFicha, {
    ug: unidadeOrc.id,
  });

  return deps.fichas.criar({
    exercicio: dados.exercicio,
    numero: dados.numero,
    orgaoId: orgao.id,
    unidadeOrcId: unidadeOrc.id,
    funcaoId: resolucao.funcao!.id,
    subfuncaoId: resolucao.subfuncao!.id,
    programaId: resolucao.programa!.id,
    acaoId: resolucao.acao!.id,
    naturezaDespesaId: resolucao.naturezaDespesa!.id,
    fonteId: resolucao.fonte!.id,
    ...(resolucao.co !== null ? { coId: resolucao.co.id } : {}),
    exercicioFonte: dados.exercicioFonte,
    valorDotado: dados.valorDotado,
  });
}

/** Cria uma previsão de receita (LOA). */
export async function criarReceitaPrevista(
  input: CriarReceitaPrevistaInput,
  deps: M02Deps
): Promise<string> {
  const dados = comporReceitaPrevista(input);

  // ⚠️ SEM UG: a receita prevista é natureza + fonte, e a `ReceitaPrevista` não tem unidade
  // nenhuma no schema. Prever a receita é ato do ENTE — quem prevê o IPTU não prevê "o IPTU da
  // Secretaria de Saúde". Só a permissão GLOBAL autoriza.
  await deps.autz.exigir(
    dados.criadoPor,
    ACAO_DO_SERVICO.criarReceitaPrevista,
    "ENTE"
  );

  const resolucao = await deps.classificacao.resolverReceita({
    naturezaReceita: dados.naturezaReceita,
    fonte: dados.fonte,
  });

  const faltantes: string[] = [];
  if (resolucao.naturezaReceita === null) {
    faltantes.push(`naturezaReceita="${dados.naturezaReceita}"`);
  }
  if (resolucao.fonte === null) {
    faltantes.push(`fonte="${dados.fonte}"`);
  }
  if (faltantes.length > 0) {
    throw new Error(
      `Componente(s) inexistente(s) no plano de classificação: ` +
        `${faltantes.join(", ")}.`
    );
  }

  return deps.receitas.criar({
    exercicio: dados.exercicio,
    naturezaReceitaId: resolucao.naturezaReceita!.id,
    fonteId: resolucao.fonte!.id,
    exercicioFonte: dados.exercicioFonte,
    tipoReceita: dados.tipoReceita,
    valorPrevisto: dados.valorPrevisto,
  });
}

/**
 * REPREVISÃO DE RECEITA (reestimativa, LRF art. 12) — ato APPEND-ONLY, gerencial (sem razão).
 *
 * ⚠️ NÃO É FATO CONTÁBIL. A previsão de receita não é escriturada neste sistema (a `ReceitaPrevista`
 * é planejamento), então reestimar é ajustar o planejamento — cada reprevisão é uma LINHA nova, com
 * SINAL (+ aumenta, − reduz). A previsão ATUALIZADA = inicial + Σ ajustes (é o que os Anexos leem).
 * Mesma autorização da previsão (ato do ENTE, sem UG). A natureza/fonte têm de existir na classificação.
 */
export async function reprevisarReceita(
  input: ReprevisarReceitaInput,
  deps: M02Deps
): Promise<string> {
  const dados = comporReprevisao(input);

  await deps.autz.exigir(dados.criadoPor, ACAO_DO_SERVICO.reprevisarReceita, "ENTE");

  const resolucao = await deps.classificacao.resolverReceita({ naturezaReceita: dados.naturezaReceita, fonte: dados.fonte });
  const faltantes: string[] = [];
  if (resolucao.naturezaReceita === null) faltantes.push(`naturezaReceita="${dados.naturezaReceita}"`);
  if (resolucao.fonte === null) faltantes.push(`fonte="${dados.fonte}"`);
  if (faltantes.length > 0) {
    throw new Error(`Componente(s) inexistente(s) no plano de classificação: ${faltantes.join(", ")}.`);
  }

  return deps.receitas.reprevisar({
    exercicio: dados.exercicio,
    naturezaCodigo: dados.naturezaReceita,
    fonteCodigo: dados.fonte,
    tipoReceita: dados.tipoReceita,
    valorAjuste: dados.valorAjuste,
    motivo: dados.motivo,
    data: dados.data,
    criadoPor: dados.criadoPor,
  });
}
