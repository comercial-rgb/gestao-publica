import { z } from "zod";
import { anoCivil, diaCivil } from "../../packages/datas/index.js";
import { Decimal, zMoney, type Money } from "../../packages/contracts/index.js";
// ⚠️ A NORMALIZAÇÃO DO DOCUMENTO VEM DO M11 — INTEIRA, SEM CÓPIA. Ver o docblock de
// `documento.ts:4-17`: o que mantém uma FK lógica honesta é os dois lados gravarem a MESMA
// string. Aqui a aposta é maior que lá: o CPF é a IDENTIDADE do servidor, e é por ele que
// SEFIP, CAGED, RAIS, DIRF e eSocial (bloco 4) vão encontrar a pessoa.
import { documentoTemFormatoValido, normalizarDocumento } from "../m11-licitacoes/documento.js";

/**
 * M22 — RH, BLOCO 1: CADASTRO, VÍNCULO E ESTRUTURA DE CARGOS. TR item 06.
 *
 * ═══ ⚠️ ESTE ARQUIVO É PURO. Nenhuma linha toca o banco ═══
 * Tudo aqui recebe dados e devolve dados. É isso que permite que o teste do cargo vigente
 * (o defeito da projeção) rode sem Postgres, e que o serviço e a porta usem A MESMA função —
 * duas implementações do "cargo vigente" é exatamente como a projeção e o domínio começariam a
 * discordar sobre quem é o quê em maio.
 *
 * ═══ ⚠️ O DEFEITO QUE ESTE MÓDULO EXISTE PARA NÃO REPETIR ═══
 * Na projeção da LC 131, `cargo` é coluna da PESSOA (m20-folha-transparencia.prisma:19) e
 * `datasetFolhaPublica` o lê por join (m13-transparencia/folha.ts:35). Consequência verificável:
 * um servidor promovido em junho tem a folha de MAIO republicada com o cargo de junho.
 *
 * Aqui cargo, lotação e salário são EVENTOS com data, e o vigente numa data é o último evento
 * até ela. `cargoVigenteEm(eventos, maio)` devolve o cargo de maio depois da promoção de junho,
 * e há teste que prova.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// OS TIPOS DO MÓDULO
// ═══════════════════════════════════════════════════════════════════════════════

export type SexoServidor = "MASCULINO" | "FEMININO" | "NAO_INFORMADO";

export type TipoVinculoRh =
  | "EFETIVO"
  | "COMISSIONADO"
  | "TEMPORARIO"
  | "ELETIVO"
  | "APOSENTADO"
  | "PENSIONISTA"
  | "ESTAGIARIO";

export type TipoEventoVinculo =
  | "ADMISSAO"
  | "PROMOCAO"
  | "MUDANCA_CARGO"
  | "MUDANCA_LOTACAO"
  | "REAJUSTE_SALARIAL"
  | "GRATIFICACAO"
  | "AFASTAMENTO"
  | "RETORNO_AFASTAMENTO"
  | "DESLIGAMENTO"
  | "MUDANCA_REGIME_PREVIDENCIARIO"
  // V11 V9.4 (TR 5.12.50) — os dois eixos que faltavam. Ver os docblocks no schema.
  | "DESIGNACAO_FUNCAO"
  | "DISPENSA_FUNCAO"
  | "MUDANCA_CENTRO_DE_CUSTO";

export type GrauParentesco =
  | "CONJUGE"
  | "COMPANHEIRO"
  | "FILHO"
  | "ENTEADO"
  | "TUTELADO"
  | "PAI"
  | "MAE"
  | "IRMAO"
  | "NETO"
  | "OUTRO";

export type FinalidadeDoDependente =
  | "IMPOSTO_RENDA"
  | "SALARIO_FAMILIA"
  | "PLANO_SAUDE"
  | "PENSAO_ALIMENTICIA";

export type TipoCargo =
  | "EFETIVO"
  | "COMISSAO"
  | "FUNCAO_GRATIFICADA"
  | "EMPREGO_PUBLICO"
  | "TEMPORARIO"
  | "AGENTE_POLITICO";

export type TipoPortaria =
  | "NOMEACAO"
  | "DESIGNACAO"
  | "SUBSTITUICAO"
  | "PROMOCAO"
  | "EXONERACAO"
  | "DEMISSAO";

export type TipoDiaCalendario =
  | "FERIADO_NACIONAL"
  | "FERIADO_ESTADUAL"
  | "FERIADO_MUNICIPAL"
  | "PONTO_FACULTATIVO"
  | "SEM_EXPEDIENTE"
  | "EXPEDIENTE_REDUZIDO";

export type PrazoContratoTrabalho = "DETERMINADO" | "INDETERMINADO";

export type ResultadoAvaliacao = "EM_ANDAMENTO" | "APROVADO" | "REPROVADO" | "PRORROGADO";

/** ATIVO, AFASTADO ou DESLIGADO — **derivada**, nunca coluna. */
export type SituacaoVinculo = "ATIVO" | "AFASTADO" | "DESLIGADO";

// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ AS DERIVAÇÕES DA VIDA FUNCIONAL — o coração do módulo
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Um evento do histórico, como as derivações o enxergam.
 *
 * ⚠️ SÃO **DUAS** DATAS, E A SEGUNDA NÃO É DECORAÇÃO. `data` é a data de EFEITO (a promoção
 * vale a partir de 1º de junho); `criadoEm` é a de digitação. As derivações ordenam pela
 * primeira — mas quando dois eventos têm a MESMA data de efeito (a promoção e o reajuste que a
 * acompanha, ambos em 1º de junho), a ordem entre eles decide qual salário vale. Sem o
 * desempate por `criadoEm`, a resposta dependeria da ordem em que o Postgres devolvesse as
 * linhas — que não é ordem nenhuma.
 */
export interface EventoDoVinculo {
  readonly data: Date;
  readonly criadoEm: Date;
  readonly tipo: TipoEventoVinculo;
  readonly cargoId: string | null;
  readonly lotacaoId: string | null;
  readonly salarioBase: Money | null;
  /** V6 P2.3 — presente na admissão e na mudança de regime; ver `regimeVigenteEm`. */
  readonly regimePrevidenciario?: RegimePrevidenciarioDoVinculo | null;
  /**
   * V11 V9.4 — a função designada; presente SÓ em `DESIGNACAO_FUNCAO`. Ver `funcaoVigenteEm`.
   *
   * ⚠️ OPCIONAL NO TIPO, como `regimePrevidenciario` já era, e a razão é a mesma: há chamadores
   * que montam `EventoDoVinculo` a partir de um `select` que não pede estas colunas — o motor da
   * folha (M33) é um deles. Um campo obrigatório os quebraria em massa para obrigá-los a escrever
   * `funcaoId: null`, que não acrescenta informação nenhuma. Quem PRECISA da função pede a coluna.
   */
  readonly funcaoId?: string | null;
  /** V11 V9.4 — o centro de custo (`Setor` do M21); presente em `ADMISSAO` e
   * `MUDANCA_CENTRO_DE_CUSTO`. Ver `centroDeCustoVigenteEm`. Opcional pelo mesmo motivo acima. */
  readonly centroDeCustoId?: string | null;
}

/** O regime previdenciário do vínculo — decide a tabela de contribuição que a folha aplica (M33). */
export type RegimePrevidenciarioDoVinculo = "RGPS" | "RPPS" | "ISENTO";

/**
 * Ordem estável: data de efeito, depois data de digitação. Ver `EventoDoVinculo`.
 *
 * ⚠️ GENÉRICA EM `T extends EventoDoVinculo` porque `gratificacoesVigentesEm` recebe eventos COM
 * as colunas de gratificação. Uma assinatura fechada em `EventoDoVinculo` apagaria esses campos
 * na saída, e o chamador teria de convertê-los de volta — que é onde a conversão vira hábito.
 */
function ordenados<T extends EventoDoVinculo>(eventos: readonly T[]): readonly T[] {
  return [...eventos].sort((a, b) => {
    const porData = a.data.getTime() - b.data.getTime();
    if (porData !== 0) return porData;
    return a.criadoEm.getTime() - b.criadoEm.getTime();
  });
}

/**
 * O ÚLTIMO EVENTO ATÉ `quando` que satisfaz `tem`.
 *
 * ⚠️ A BORDA É INCLUSIVA: um evento datado em D vale EM D. A promoção que começa em 1º de junho
 * já produz o cargo novo no dia 1º — é o que a portaria diz, e é o que a folha daquele mês paga.
 */
function ultimoAte<T>(
  eventos: readonly EventoDoVinculo[],
  quando: Date,
  tem: (e: EventoDoVinculo) => T | null
): T | null {
  let achado: T | null = null;
  for (const e of ordenados(eventos)) {
    if (e.data.getTime() > quando.getTime()) break;
    const v = tem(e);
    if (v !== null) achado = v;
  }
  return achado;
}

/**
 * O CARGO VIGENTE NUMA DATA — o último evento COM cargo até ela.
 *
 * ⚠️ ESTA É A FUNÇÃO QUE O DEFEITO DA PROJEÇÃO PEDE. Promovido em junho, o servidor continua no
 * cargo antigo quando se pergunta por maio. Se cargo fosse coluna do vínculo, o `UPDATE` da
 * promoção teria reescrito o passado e não haveria pergunta a fazer.
 *
 * `null` = o vínculo ainda não existia naquela data (nem a admissão tinha ocorrido).
 */
export function cargoVigenteEm(
  eventos: readonly EventoDoVinculo[],
  quando: Date
): string | null {
  return ultimoAte(eventos, quando, (e) => e.cargoId);
}

/** A LOTAÇÃO VIGENTE NUMA DATA — mesma disciplina do cargo. */
export function lotacaoVigenteEm(
  eventos: readonly EventoDoVinculo[],
  quando: Date
): string | null {
  return ultimoAte(eventos, quando, (e) => e.lotacaoId);
}

/**
 * A FUNÇÃO VIGENTE NUMA DATA — e ela NÃO usa `ultimoAte`, que é o ponto desta função.
 *
 * ═══ ⚠️ POR QUE `ultimoAte` NÃO SERVE AQUI, E O DEFEITO QUE ELE PRODUZIRIA ═══
 *
 * `ultimoAte` guarda o último valor NÃO NULO e ignora os nulos — é o que cargo e lotação querem,
 * porque um evento de reajuste não deve apagar o cargo. Mas a DISPENSA da função é exatamente um
 * evento cujo `funcaoId` é nulo DE PROPÓSITO (o CHECK do banco impõe isso), e "ignorar o nulo"
 * faria a dispensa não ter efeito nenhum: o servidor dispensado em 2024 continuaria aparecendo
 * como diretor de escola em 2026, no filtro, na tela e em qualquer relatório — para sempre, e sem
 * erro nenhum, porque o evento ESTÁ lá.
 *
 * ⚠️ É A MESMA FAMÍLIA DE "existe como linha ≠ produziu efeito" que já deixou uma guarda inerte
 * neste repositório. Por isso a derivação olha o TIPO do evento, não a nulidade da coluna.
 *
 * ═══ FUNÇÃO É FREQUENTEMENTE NULA, E ISSO NÃO É AUSÊNCIA DE DADO ═══
 *
 * `cargoVigenteEm` só devolve `null` antes da admissão. Aqui `null` é o estado NORMAL: a maioria
 * dos servidores nunca exerceu função nenhuma. Quem consumir isto não pode ler `null` como
 * "cadastro incompleto" — lê como "não exerce função", que é o que é.
 *
 * ⚠️ O DESLIGAMENTO NÃO ZERA A FUNÇÃO, pela mesma disciplina do cargo: `cargoVigenteEm` também
 * devolve o cargo de quem foi exonerado. Quem responde "ainda está na casa?" é
 * `situacaoDoVinculo`, que é eixo próprio — e fundir os dois faria esta função responder duas
 * perguntas e nenhuma direito.
 */
export function funcaoVigenteEm(
  eventos: readonly EventoDoVinculo[],
  quando: Date
): string | null {
  let achado: string | null = null;
  for (const e of ordenados(eventos)) {
    if (e.data.getTime() > quando.getTime()) break;
    if (e.tipo === "DESIGNACAO_FUNCAO") achado = e.funcaoId ?? null;
    else if (e.tipo === "DISPENSA_FUNCAO") achado = null;
  }
  return achado;
}

/**
 * O CENTRO DE CUSTO VIGENTE NUMA DATA — o `Setor` do M21 onde a despesa deste vínculo é apropriada.
 *
 * ⚠️ AQUI `ultimoAte` SERVE, e a assimetria com a função é deliberada: não existe evento que
 * "desapropria" um vínculo. O custo de quem está na folha vai para algum lugar; o que muda é PARA
 * ONDE. Um `DISPENSA_CENTRO_DE_CUSTO` seria um vínculo cuja despesa não é de ninguém.
 *
 * ⚠️ `null` SIGNIFICA "NUNCA FOI APROPRIADO", E É O ESTADO DE TODO VÍNCULO ANTERIOR À V11 V9.4.
 * A coluna nasceu nula e não há de onde tirá-la: escolher um setor para o histórico seria
 * apropriar despesa passada num centro de custo que ninguém escolheu. **Quem consome recusa com
 * motivo**, fail-closed — nunca completa com um padrão.
 *
 * ⚠️ E O CONTEXTO HISTÓRICO DA COMPETÊNCIA É O MOTIVO DE ISTO SER DERIVAÇÃO E NÃO COLUNA. O centro
 * de custo de maio não é o de hoje: quem mudou de setor em agosto teve a folha de maio apropriada
 * no setor antigo, e uma coluna no vínculo — reescrita pelo `UPDATE` da mudança — faria o
 * relatório de maio mentir depois de agosto, sem que nada acusasse.
 */
export function centroDeCustoVigenteEm(
  eventos: readonly EventoDoVinculo[],
  quando: Date
): string | null {
  return ultimoAte(eventos, quando, (e) => e.centroDeCustoId ?? null);
}

/**
 * O VENCIMENTO-BASE VIGENTE NUMA DATA.
 *
 * ⚠️ **NÃO SOMA GRATIFICAÇÃO.** O adicional de insalubridade não muda o vencimento-base, e
 * somá-lo aqui faria o próximo reajuste incidir sobre ele — um erro que se acumula em cascata,
 * exercício após exercício, e que ninguém confere à mão. As gratificações vigentes saem por
 * `gratificacoesVigentesEm`; quem as compõe com a base é o CÁLCULO, no bloco 2.
 */
export function salarioBaseVigenteEm(
  eventos: readonly EventoDoVinculo[],
  quando: Date
): Money | null {
  return ultimoAte(eventos, quando, (e) => e.salarioBase);
}

/**
 * A SITUAÇÃO NUMA DATA — DESLIGADO, AFASTADO ou ATIVO, nessa ordem de precedência.
 *
 * ⚠️ NÃO É COLUNA, e o motivo é o mesmo do cargo com um agravante: uma coluna `situacao` teria
 * de ser atualizada no dia em que o afastamento termina. Ninguém atualiza — e o servidor que
 * voltou da licença em março continuaria "AFASTADO" na folha de abril, deixando de ser pago.
 * Derivada, ela é verdade em qualquer data que se pergunte, sem job noturno nenhum.
 *
 * ⚠️ E O `DESLIGAMENTO` PRECEDE TUDO. Quem foi exonerado durante um afastamento está desligado,
 * não afastado — a exoneração encerra o vínculo, e um vínculo encerrado não tem licença em curso.
 */
export function situacaoDoVinculo(
  eventos: readonly EventoDoVinculo[],
  quando: Date
): SituacaoVinculo {
  const ate = ordenados(eventos).filter((e) => e.data.getTime() <= quando.getTime());
  if (ate.some((e) => e.tipo === "DESLIGAMENTO")) return "DESLIGADO";

  // O último entre afastar e voltar decide. Sem RETORNO, o afastamento segue aberto.
  let afastado = false;
  for (const e of ate) {
    if (e.tipo === "AFASTAMENTO") afastado = true;
    if (e.tipo === "RETORNO_AFASTAMENTO") afastado = false;
  }
  return afastado ? "AFASTADO" : "ATIVO";
}

/**
 * O REGIME PREVIDENCIÁRIO VIGENTE NUMA DATA — o último evento COM regime até ela.
 *
 * ⚠️ ESTE É O MESMO DEFEITO DO CARGO, e ele valeria dinheiro: quem migrou para o RPPS em junho
 * contribuía ao RGPS em maio, com outra tabela e outro teto. Se o regime fosse coluna do vínculo,
 * recalcular a folha de maio depois da migração aplicaria a tabela errada — e o recálculo é
 * exatamente o que se faz quando alguém contesta o desconto.
 *
 * `naAdmissao` é o fallback dos vínculos criados ANTES de o evento existir (o campo
 * `Vinculo.regimePrevidenciario`). `null` = o vínculo não declara regime, e a folha recusa
 * calcular nomeando a matrícula.
 */
export function regimeVigenteEm(
  eventos: readonly EventoDoVinculo[],
  naAdmissao: RegimePrevidenciarioDoVinculo | null,
  quando: Date
): RegimePrevidenciarioDoVinculo | null {
  return ultimoAte(eventos, quando, (e) => e.regimePrevidenciario ?? null) ?? naAdmissao;
}

/** A data do desligamento, se houve. `null` = vínculo aberto. Derivada, nunca coluna. */
export function dataDeDesligamento(eventos: readonly EventoDoVinculo[]): Date | null {
  const fim = ordenados(eventos).find((e) => e.tipo === "DESLIGAMENTO");
  return fim === undefined ? null : fim.data;
}

/**
 * AS GRATIFICAÇÕES CONCEDIDAS ATÉ UMA DATA.
 *
 * ⚠️ ELAS **NÃO** SE REVOGAM POR ESTE BLOCO, e a ausência é honesta em vez de conveniente: a
 * cessação de uma gratificação é um ato que o TR trata no cálculo (bloco 2), com o prazo e a
 * base legal dela. Inventar aqui uma "revogação" seria criar um ato que ninguém regulamentou —
 * a mesma razão pela qual o termo de cooperação do M21 não tem cancelamento.
 */
export function gratificacoesVigentesEm(
  eventos: readonly (EventoDoVinculo & {
    readonly gratificacaoDescricao: string | null;
    readonly gratificacaoValor: Money | null;
  })[],
  quando: Date
): readonly { readonly descricao: string; readonly valor: Money; readonly desde: Date }[] {
  return ordenados(eventos)
    .filter(
      (e) =>
        e.tipo === "GRATIFICACAO" &&
        e.data.getTime() <= quando.getTime() &&
        e.gratificacaoValor !== null &&
        e.gratificacaoDescricao !== null
    )
    // O `filter` acima já garantiu os dois não-nulos; o `!` evita uma conversão de tipo, que é
    // a coisa que este repositório só admite dentro da fábrica `subLista()`.
    .map((e) => ({
      descricao: e.gratificacaoDescricao!,
      valor: e.gratificacaoValor!,
      desde: e.data,
    }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ A OCUPAÇÃO — TR req. 9, e ela é DERIVADA, não coluna
// ═══════════════════════════════════════════════════════════════════════════════

/** Um vínculo, reduzido ao que a contagem de ocupação precisa. */
export interface VinculoParaOcupacao {
  readonly eventos: readonly EventoDoVinculo[];
}

/**
 * QUANTOS VÍNCULOS OCUPAM ESTE CARGO NESTA DATA.
 *
 * ═══ ⚠️ AS DUAS METADES DA CONTA, E AS DUAS IMPORTAM ═══
 *   · SITUAÇÃO ≠ DESLIGADO — sem isso o cargo pareceria lotado com gente que já saiu, e o ente
 *     deixaria de nomear porque um exonerado de 2019 continua ocupando a vaga.
 *   · CARGO **VIGENTE**, não o de admissão — sem isso o servidor promovido ocuparia DUAS vagas:
 *     a antiga (onde entrou) e a nova (para onde foi).
 *
 * ⚠️ POR QUE ISTO NÃO É UMA COLUNA `vagasOcupadas`. É este número que responde se o ente PODE
 * nomear mais alguém (`vagasFixadas` é o teto da lei). Uma coluna dessincronizada autorizaria uma
 * nomeação acima do quantitativo legal com a APARÊNCIA de conformidade — e a aparência de
 * conformidade é pior que a ausência dela, porque ninguém vai conferir.
 */
export function vagasOcupadasDoCargo(
  vinculos: readonly VinculoParaOcupacao[],
  cargoId: string,
  quando: Date
): number {
  return vinculos.filter(
    (v) =>
      situacaoDoVinculo(v.eventos, quando) !== "DESLIGADO" &&
      cargoVigenteEm(v.eventos, quando) === cargoId
  ).length;
}

/** Quantos vínculos estão lotados aqui nesta data. Mesma disciplina da ocupação do cargo. */
export function lotadosNaLotacao(
  vinculos: readonly VinculoParaOcupacao[],
  lotacaoId: string,
  quando: Date
): number {
  return vinculos.filter(
    (v) =>
      situacaoDoVinculo(v.eventos, quando) !== "DESLIGADO" &&
      lotacaoVigenteEm(v.eventos, quando) === lotacaoId
  ).length;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ OS EIXOS DE CONSULTA DO VÍNCULO (TR 5.12.50) — ISTO É (a). NÃO É (b) NEM (c).
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ═══ ⚠️ TRÊS COISAS DIFERENTES, E ESTE ARQUIVO É SÓ A PRIMEIRA ═══
 *
 * A 5.12.50 pede a rotina de cálculo "permitindo filtrar os funcionários". Ler isso como se fosse
 * uma coisa só é o erro que este comentário existe para impedir. São TRÊS:
 *
 *   (a) FILTRO DE CONSULTA — "quem eu quero VER". É este arquivo. Um predicado puro sobre UM
 *       vínculo, sem efeito, cobrado como LEITURA (`CONSULTAR_PESSOAL`, em
 *       `lib/portas/recursos/pessoal-dados.ts`). O pior defeito que pode ter é mostrar a lista
 *       errada na tela.
 *
 *   (b) SELEÇÃO PARA PROCESSAMENTO — "quem eu quero CALCULAR". É um ATO do operador, com autor,
 *       instante e efeito sobre dinheiro. Mora no M33, tem ação PRÓPRIA no censo, e é gravada.
 *       **Não mora aqui e não se faz com este predicado.**
 *
 *   (c) ABRANGÊNCIA EFETIVA — "quem o motor de fato calculou, e por que os outros não". É um FATO
 *       apurado pelo cálculo, não um parâmetro dele. Não se pede: descobre-se e grava-se.
 *
 * ═══ ⚠️ POR QUE REUSAR ESTE PREDICADO EM (b) SEM (c) É O DEFEITO ═══
 *
 * Até a V11 V9.4 este bloco dizia "eles não recortam quem é calculado", e dava como fundamento que
 * o `findMany` dos vínculos do M33 não tem `where` nenhum. **Esse fundamento era falso.** A
 * ausência de um `where` é propriedade da implementação de hoje; ela prova que ninguém CONSEGUE
 * recortar, nunca provou que recortar seja proibido. A 5.12.50 prende "filtrar os funcionários" à
 * ROTINA DE CÁLCULO, e (b) é capacidade devida.
 *
 * O que continua verdadeiro é o PERIGO, e ele é de (c), não de (a):
 *
 *   - **folha parcial em silêncio.** Nada compara o número de contracheques ao de vínculos
 *     devidos; o manifesto da certificação lista só quem entrou no cálculo; a apropriação empenha
 *     só esses. A folha fecha, o total bate, o empenho bate, a liquidação bate — e nenhuma etapa
 *     adiante acusa.
 *
 *   - **e a SUBTRAÇÃO SILENCIOSA, que é o oposto do que se procura.** Todo mundo vigia
 *     duplicidade; o risco real é o contrário. `fecharFolha` congela UM cálculo: o último não
 *     cancelado. Com seleção por cálculo, nº1={A,B} e nº2={C,D} fazem o fechamento levar só
 *     {C,D} — **A e B não recebem**, sem erro, sem aviso, com totais coerentes.
 *
 * Por isso (c) NASCE NO MESMO COMMIT QUE (b), nunca depois: o estado intermediário é uma folha que
 * pode ser parcial sem acusar. E a promessa do M33 muda de forma — deixa de ser "todos os vínculos
 * vivos" e passa a ser **"exatamente os selecionados e elegíveis, com cada exclusão nomeada"**. Uma
 * promessa mantida POR CONSTRUÇÃO some junto com a construção; esta tem de ser afirmada por teste.
 *
 * ⚠️ E A SEGREGAÇÃO DO 6.4 SEPARA (a) DE (b) NA AUTORIZAÇÃO, não só no desenho: quem pode VER a
 * lista de servidores não pode, POR ISSO, escolher quem o ente paga. Cobrar (b) com
 * `CONSULTAR_PESSOAL` faria o perfil de consulta recortar folha.
 *
 * Ver a seção correspondente em `modules/m33-folha/MODULO.md`.
 *
 * ═══ A REGRA DE COMPOSIÇÃO, QUE É A METADE QUE SE ESQUECE ═══
 *
 * Os eixos se conjugam sobre **UM MESMO VÍNCULO**, não sobre o servidor. A professora que também
 * é motorista tem duas matrículas: uma de professora na Escola Central, outra de motorista na
 * Garagem. Perguntar "cargo de motorista E lotação Escola Central" tem de devolver VAZIO — e
 * devolveria ELA se cada eixo fosse conferido contra o conjunto dos vínculos. É por isso que este
 * predicado recebe UM vínculo por vez e quem chama faz `vinculos.some(...)`.
 *
 * ⚠️ E É POR ISSO QUE A FIXTURE DE TESTE PRECISA DE DUAS MATRÍCULAS NA MESMA PESSOA. Com uma
 * matrícula por servidor, um predicado que conferisse eixo contra o conjunto passa por vacuidade.
 *
 * ═══ A DATA DE REFERÊNCIA NÃO É DETALHE ═══
 *
 * Cargo, lotação e regime previdenciário são DERIVADOS dos eventos (`cargoVigenteEm` e irmãs).
 * "Cargo hoje" e "cargo na competência de maio" dão listas diferentes — a promoção de junho move
 * o servidor de uma para a outra. Quem chama informa `quando`; escolher em silêncio é o defeito.
 */
export interface EixosDeConsultaDeVinculo {
  /** Texto contido na matrícula, sem distinção de caixa. Vazio = eixo inativo. */
  readonly matricula: string;
  /**
   * Os cargos aceitos, JÁ RESOLVIDOS A IDENTIFICADORES pela porta. `null` = eixo inativo.
   *
   * ⚠️ LISTA VAZIA NÃO É EIXO INATIVO: é "nenhum cargo casa com o que se digitou", e a resposta
   * certa é a lista vazia. Tratar `[]` como "sem filtro" devolveria o ente inteiro para quem
   * procurou um cargo que não existe — o modo mais discreto de um filtro deixar de filtrar.
   */
  readonly cargoIds: readonly string[] | null;
  /** As lotações aceitas, já resolvidas a identificadores. Mesma disciplina do cargo. */
  readonly lotacaoIds: readonly string[] | null;
  /**
   * Texto contido no regime JURÍDICO (`Vinculo.regimeJuridico`, `String` livre porque sai da lei
   * orgânica do ente). Vazio = eixo inativo.
   *
   * ⚠️ ELE NÃO É O REGIME PREVIDENCIÁRIO, e fundir os dois num filtro só seria erro de domínio:
   * "Estatutário" é como a lei do ente nomeia o vínculo; RGPS/RPPS decide QUAL TABELA de
   * contribuição a folha aplica. Um estatutário pode estar no RGPS.
   */
  readonly regimeJuridico: string;
  /**
   * O regime PREVIDENCIÁRIO vigente em `quando`, derivado dos eventos. `null` = eixo inativo.
   * `"NAO_INFORMADO"` procura exatamente as matrículas que a folha RECUSA calcular — é consulta
   * de trabalho, não curiosidade.
   */
  readonly regimePrevidenciario: RegimePrevidenciarioDoVinculo | "NAO_INFORMADO" | null;
  /**
   * V11 V9.4 — as FUNÇÕES aceitas, já resolvidas a identificadores. Mesma disciplina do cargo:
   * `null` = eixo inativo, `[]` = nenhuma função casa com o que se digitou.
   *
   * ⚠️ NÃO CONFUNDIR COM O CARGO. Cargo é o posto; função é a atribuição exercida. Filtrar por
   * `TipoCargo.FUNCAO_GRATIFICADA` devolveria quem OCUPA um cargo dessa natureza, que é outra
   * pergunta — e era o atalho disponível antes de `Funcao` existir.
   */
  readonly funcaoIds: readonly string[] | null;
  /**
   * V11 V9.4 — os CENTROS DE CUSTO aceitos (`Setor` do M21), já resolvidos a identificadores.
   *
   * ⚠️ NÃO CONFUNDIR COM A LOTAÇÃO. Lotação é onde a pessoa trabalha; centro de custo é onde a
   * despesa é apropriada. O servidor cedido continua lotado na origem e custa ao destino — e
   * quem procura "quanto a Saúde gasta com pessoal" quer o segundo, não o primeiro.
   */
  readonly centroDeCustoIds: readonly string[] | null;
  /** Admitido em ou depois deste instante. `null` = eixo inativo. */
  readonly admitidoDe: Date | null;
  /** Admitido em ou antes deste instante — o ÚLTIMO instante civil do dia, não a meia-noite. */
  readonly admitidoAte: Date | null;
}

/** Nenhum eixo ativo. */
export const EIXOS_DE_CONSULTA_VAZIOS: EixosDeConsultaDeVinculo = {
  matricula: "",
  cargoIds: null,
  lotacaoIds: null,
  regimeJuridico: "",
  regimePrevidenciario: null,
  funcaoIds: null,
  centroDeCustoIds: null,
  admitidoDe: null,
  admitidoAte: null,
};

/** Há algum eixo de vínculo ativo? */
export function haEixoDeVinculo(e: EixosDeConsultaDeVinculo): boolean {
  return (
    e.matricula !== "" ||
    e.cargoIds !== null ||
    e.lotacaoIds !== null ||
    e.regimeJuridico !== "" ||
    e.regimePrevidenciario !== null ||
    e.funcaoIds !== null ||
    e.centroDeCustoIds !== null ||
    e.admitidoDe !== null ||
    e.admitidoAte !== null
  );
}

/**
 * Há algum eixo DERIVADO ativo — isto é, algum que só se responde percorrendo os eventos?
 *
 * ⚠️ QUEM PERGUNTA É A PAGINAÇÃO. Eixo de coluna o banco resolve, e `skip`/`take` continuam
 * exatos. Eixo derivado não: o banco não sabe qual era o cargo vigente, então o conjunto tem de
 * ser apurado ANTES de recortar a página — senão o total mente e a página 2 perde quem ficou na 1.
 */
export function haEixoDerivadoDeVinculo(e: EixosDeConsultaDeVinculo): boolean {
  return (
    e.cargoIds !== null ||
    e.lotacaoIds !== null ||
    e.regimePrevidenciario !== null ||
    // ⚠️ V11 V9.4 — OS DOIS NOVOS SÃO DERIVADOS, e esquecê-los aqui seria o defeito exato que a
    // V11 V9.4 já consertou uma vez: o banco recortaria a página por `eventos: { some: ... }`,
    // que responde "ALGUM DIA teve esta função", enquanto o predicado responde "tinha NA DATA".
    // As duas listas divergem em todo servidor que já foi dispensado — e o total mentiria.
    e.funcaoIds !== null ||
    e.centroDeCustoIds !== null
  );
}

/** O vínculo, como este predicado precisa dele. */
export interface VinculoParaConsulta {
  readonly matricula: string;
  readonly regimeJuridico: string;
  readonly dataAdmissao: Date;
  /** `Vinculo.regimePrevidenciario` — o da ADMISSÃO, fallback de `regimeVigenteEm`. */
  readonly regimePrevidenciario: RegimePrevidenciarioDoVinculo | null;
  readonly eventos: readonly EventoDoVinculo[];
}

function contem(alvo: string, procurado: string): boolean {
  return alvo.toLowerCase().includes(procurado.toLowerCase());
}

/**
 * ESTE VÍNCULO ATENDE A TODOS OS EIXOS ATIVOS, NA DATA DE REFERÊNCIA?
 *
 * Puro: nenhuma consulta, nenhum relógio. `quando` entra por parâmetro porque três dos eixos são
 * derivados e a resposta MUDA com a data — ver o docblock do tipo.
 *
 * ⚠️ OS EIXOS DERIVADOS EXIGEM QUE O VÍNCULO EXISTISSE EM `quando`. Cargo e lotação já cuidam
 * disso sozinhos (`cargoVigenteEm` devolve `null` antes da admissão), mas o regime previdenciário
 * NÃO: `regimeVigenteEm` cai no valor da admissão quando não há evento até a data — e sem a
 * conferência abaixo, uma consulta por "RPPS em janeiro" traria quem só foi admitido em agosto.
 */
export function vinculoAtendeAosEixos(
  v: VinculoParaConsulta,
  eixos: EixosDeConsultaDeVinculo,
  quando: Date
): boolean {
  if (eixos.matricula !== "" && !contem(v.matricula, eixos.matricula)) return false;
  if (eixos.regimeJuridico !== "" && !contem(v.regimeJuridico, eixos.regimeJuridico)) return false;
  if (eixos.admitidoDe !== null && v.dataAdmissao.getTime() < eixos.admitidoDe.getTime()) return false;
  if (eixos.admitidoAte !== null && v.dataAdmissao.getTime() > eixos.admitidoAte.getTime()) return false;

  if (eixos.cargoIds !== null) {
    const c = cargoVigenteEm(v.eventos, quando);
    if (c === null || !eixos.cargoIds.includes(c)) return false;
  }
  if (eixos.lotacaoIds !== null) {
    const l = lotacaoVigenteEm(v.eventos, quando);
    if (l === null || !eixos.lotacaoIds.includes(l)) return false;
  }
  // ⚠️ V11 V9.4 — FUNÇÃO NULA NÃO CASA COM NENHUMA FUNÇÃO PEDIDA, e isto é a metade que se
  // esquece: `null` aqui é o estado NORMAL (a maioria não exerce função), então um predicado que
  // tratasse `null` como "passa" devolveria o ente inteiro para quem procurou uma função
  // específica — o modo mais discreto de um filtro deixar de filtrar.
  if (eixos.funcaoIds !== null) {
    const f = funcaoVigenteEm(v.eventos, quando);
    if (f === null || !eixos.funcaoIds.includes(f)) return false;
  }
  if (eixos.centroDeCustoIds !== null) {
    const cc = centroDeCustoVigenteEm(v.eventos, quando);
    if (cc === null || !eixos.centroDeCustoIds.includes(cc)) return false;
  }
  if (eixos.regimePrevidenciario !== null) {
    const existiaEm = v.dataAdmissao.getTime() <= quando.getTime();
    const r = existiaEm ? regimeVigenteEm(v.eventos, v.regimePrevidenciario, quando) : null;
    if (eixos.regimePrevidenciario === "NAO_INFORMADO") {
      if (!existiaEm || r !== null) return false;
    } else if (r !== eixos.regimePrevidenciario) return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ O DEPENDENTE — a baixa por IDADE é derivada, a baixa por FATO é coluna
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * OS LIMITES DE IDADE, POR FINALIDADE, COM A BASE LEGAL.
 *
 * ⚠️ `null` = SEM LIMITE ETÁRIO, e não "esqueci". Plano de saúde é contrato do ente (o limite,
 * quando existe, é o do contrato, e cada ente tem o seu); pensão alimentícia é decisão judicial,
 * e o juiz é quem diz até quando.
 *
 * ⚠️ ELE NÃO É `@default` DE COLUNA, ao contrário do `Convenio.diasAlertaVencimento`. Lá o padrão
 * é UM número para todos os convênios, e a coluna é a fonte certa. Aqui o padrão DEPENDE da
 * finalidade — um default de coluna teria de escolher entre 14 e 21 e estaria errado no outro.
 */
export const LIMITE_ETARIO_LEGAL: Readonly<Record<FinalidadeDoDependente, number | null>> = {
  /** Lei 9.250/1995 art. 35, III — 21 anos (24 se cursando ensino superior; declare 24). */
  IMPOSTO_RENDA: 21,
  /** Lei 8.213/1991 art. 65 — 14 anos. */
  SALARIO_FAMILIA: 14,
  /** Contrato de assistência do ente — não há limite LEGAL. */
  PLANO_SAUDE: null,
  /** Decisão judicial — o juiz diz até quando. */
  PENSAO_ALIMENTICIA: null,
};

/**
 * A IDADE COMPLETA em `quando`.
 *
 * ⚠️ ANOS COMPLETOS, e o aniversário conta NO DIA. Quem faz 14 anos hoje TEM 14 hoje — e por
 * isso sai do salário-família hoje, não amanhã. Contar por diferença de milissegundos dividida
 * por 365,25 erraria um dia em cada bissexto, e o dia errado é o do aniversário.
 */
export function idadeEm(dataNascimento: Date, quando: Date): number {
  // Dia civil do ente, não UTC: quem nasceu 01/01 às 22:00 (hora local) nasceu em 01/01.
  const [aq, mq, dq] = diaCivil(quando).split("-").map(Number) as [number, number, number];
  const [an, mn, dn] = diaCivil(dataNascimento).split("-").map(Number) as [number, number, number];
  let anos = aq - an;
  const mes = mq - mn;
  const dia = dq - dn;
  if (mes < 0 || (mes === 0 && dia < 0)) anos -= 1;
  return anos;
}

/** O que a derivação da baixa precisa saber. */
export interface FinalidadeParaBaixa {
  readonly dataNascimento: Date;
  readonly invalidezPermanente: boolean;
  readonly dataInicio: Date;
  readonly limiteIdadeAnos: number | null;
  readonly dataBaixa: Date | null;
}

/**
 * ESTE DEPENDENTE VALE NESTA DATA, PARA ESTA FINALIDADE?
 *
 * ═══ ⚠️ TRÊS PERGUNTAS, E A TERCEIRA É A QUE NÃO TEM COLUNA ═══
 *   1. já começou?          — `dataInicio <= quando`
 *   2. foi baixado por FATO? — óbito, perda da guarda, decisão judicial: `dataBaixa`
 *   3. passou da idade?      — DERIVADA, e é o requisito 7
 *
 * A terceira acontece SOZINHA, num dia que se sabe desde o nascimento. Materializá-la exigiria
 * um job noturno — e no dia em que o job não rodasse, o ente pagaria salário-família de um jovem
 * de vinte anos e nada acusaria. Derivada, ela é verdade em toda consulta.
 *
 * ⚠️ A INVALIDEZ PERMANENTE SUSPENDE O LIMITE (Lei 8.213/91 art. 16 §-único; Lei 9.250/95
 * art. 35 §-único) — e não a baixa por fato: dependente inválido que morre está baixado.
 */
export function dependenteValeEm(f: FinalidadeParaBaixa, quando: Date): boolean {
  if (f.dataInicio.getTime() > quando.getTime()) return false;
  if (f.dataBaixa !== null && f.dataBaixa.getTime() <= quando.getTime()) return false;
  if (f.invalidezPermanente) return true;
  if (f.limiteIdadeAnos === null) return true;
  return idadeEm(f.dataNascimento, quando) < f.limiteIdadeAnos;
}

/**
 * POR QUE ELE NÃO VALE — a frase que a tela mostra. `null` quando vale.
 *
 * ⚠️ EXISTE PORQUE "inativo" NÃO INFORMA NADA. Quem olha a tela precisa saber se o dependente
 * saiu por idade (e então não há o que fazer) ou por fato (e então há um documento a conferir).
 */
export function motivoDaInvalidade(f: FinalidadeParaBaixa, quando: Date): string | null {
  if (f.dataInicio.getTime() > quando.getTime()) {
    return `Ainda não vigente — começa em ${diaCivil(f.dataInicio)}.`;
  }
  if (f.dataBaixa !== null && f.dataBaixa.getTime() <= quando.getTime()) {
    return `Baixado em ${diaCivil(f.dataBaixa)}.`;
  }
  if (f.invalidezPermanente || f.limiteIdadeAnos === null) return null;
  const idade = idadeEm(f.dataNascimento, quando);
  if (idade >= f.limiteIdadeAnos) {
    return `Baixa automática por idade: ${idade} anos, limite ${f.limiteIdadeAnos}.`;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// O CONTRATO DE TRABALHO — término derivado
// ═══════════════════════════════════════════════════════════════════════════════

const MS_POR_DIA = 86_400_000;

/**
 * O TÉRMINO VIGENTE — `dataTerminoInicial + Σ dias`. `null` no prazo indeterminado.
 *
 * ⚠️ NÃO REUSA `vigenciaFim` DO M11, e a decisão é o CONTRÁRIO da do M21. Lá, o convênio reusou
 * o helper porque reusou o ENUM inteiro: `TipoMovimentoContratual` tem seis valores com sinais
 * diferentes, e o helper existe para resolver esse sinal. Aqui só há uma direção — carregar uma
 * coluna `tipo` que admite um único valor, apenas para alcançar o helper, seria uma coluna que
 * não informa nada, e o primeiro leitor perguntaria que outros valores ela aceita.
 */
export function terminoVigenteDoContrato(
  dataTerminoInicial: Date | null,
  prorrogacoes: readonly { readonly dias: number }[]
): Date | null {
  if (dataTerminoInicial === null) return null;
  const dias = prorrogacoes.reduce((acc, p) => acc + p.dias, 0);
  return new Date(dataTerminoInicial.getTime() + dias * MS_POR_DIA);
}

// ═══════════════════════════════════════════════════════════════════════════════
// A ÁRVORE DE LOTAÇÃO — o ciclo que o CHECK do banco não alcança
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * PÔR `candidatoPai` COMO PAI DE `id` FECHARIA UM CICLO?
 *
 * ⚠️ O CHECK `ck_lotacao_nao_e_pai_de_si` pega o ciclo de UM nó — é tudo que o SQL declarativo
 * alcança sem recursão. O ciclo A → B → A precisa da CADEIA, e a cadeia vem do banco: quem a lê
 * é o serviço, quem a julga é esta função pura (e é por isso que há teste sem Postgres).
 *
 * ⚠️ E O CICLO NÃO É TEORIA: uma árvore fechada faz `lotacoesDescendentes` girar para sempre na
 * primeira consulta que a percorra — a tela trava sem erro, sem log, sem nada que denuncie.
 */
/** `ancestraisDoCandidato`: a cadeia de `candidatoPai` até a raiz, já lida do banco. */
export function criaCicloDeLotacao(
  id: string,
  candidatoPai: string | null,
  ancestraisDoCandidato: readonly string[]
): boolean {
  if (candidatoPai === null) return false;
  if (candidatoPai === id) return true;
  return ancestraisDoCandidato.includes(id);
}

// ═══════════════════════════════════════════════════════════════════════════════
// OS SCHEMAS DE ENTRADA
// ═══════════════════════════════════════════════════════════════════════════════

const zTexto = (min: number, msg?: string): z.ZodString =>
  msg !== undefined ? z.string().trim().min(min, msg) : z.string().trim().min(min);

const zOpcional = (min: number): z.ZodOptional<z.ZodString> => zTexto(min).optional();

/**
 * ⚠️ TRANSFORM ANTES DE REFINE — validar o cru recusaria a máscara que o próprio formulário
 * mostrou. É o mesmo `zDocumento` do contrato, do certame e do convênio; a diferença é que aqui
 * ele exige **CPF**, e não "CPF ou CNPJ": servidor é pessoa física, e um CNPJ de 14 dígitos
 * passando por aqui seria uma empresa na folha de pagamento.
 */
const zCpf = z
  .string()
  .transform(normalizarDocumento)
  .refine((d) => documentoTemFormatoValido(d) && d.length === 11, {
    message:
      "CPF com 11 dígitos. A máscara é removida automaticamente — o que sobrou não tem 11 " +
      "dígitos (CNPJ tem 14, e servidor é pessoa física).",
  });

/** ⚠️ SÓ DÍGITOS, como o CPF, e pelo mesmo motivo: a SEFIP e o eSocial casam por ele. */
const zPis = z
  .string()
  .transform(normalizarDocumento)
  .refine((d) => /^[0-9]{11}$/.test(d), { message: "PIS/PASEP/NIT tem 11 dígitos." });

const zUf = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, "UF com duas letras (PB, PE, RN).");

/** O identificador de quem pratica o ato — é o que o `RegistroDeOperacao` carrega. */
const zAutor = z.string().min(1);

const zMotivo = zTexto(5, "O motivo precisa dizer o que fundamenta o evento");

const zValorPositivo = zMoney.refine((v) => v.greaterThan(0), {
  message: "Valor deve ser maior que zero",
});

/**
 * UM DECIMAL DE DUAS CASAS QUE **NÃO É DINHEIRO** — horas de expediente, pontuação de avaliação.
 *
 * ═══ ⚠️ POR QUE NÃO `z.number()`, E POR QUE NÃO `zMoney` ═══
 * `z.number()` traria ponto flutuante binário para dentro do domínio: 3,5 horas sobrevive, mas
 * 0,1 + 0,2 não — e o cálculo de frequência do bloco 2 vai somar centenas dessas. A regra da casa
 * ("nunca `number` em caminho de valor") vale aqui pela mesma física, ainda que não seja dinheiro.
 *
 * `zMoney` serviria tecnicamente (é Decimal de 2 casas), e é justamente por isso que não se usa:
 * ele se chama *money*, e quem lesse `horasExpediente: zMoney` teria de parar para descobrir que
 * horas não são dinheiro. O nome é parte do tipo.
 *
 * ⚠️ E ELE NÃO SERVE PARA 3 CASAS. `packages/contracts/money.ts:25` trunca em 2 casas em
 * silêncio, e esta moldura faz o mesmo, de propósito: as duas colunas que a consomem são
 * `Decimal(4,2)` e `Decimal(6,2)`. Campo de 3 casas usa `tres()` (M11), não isto.
 */
// ⚠️ O SEGUNDO PARÂMETRO DE `ZodType` É O **INPUT**, e omiti-lo o deixa `unknown` — o que faz o
// `z.input<>` do schema aceitar qualquer coisa, inclusive o `number` que esta moldura existe para
// recusar. Foi assim na primeira versão, e o compilador não reclamou de `horasExpediente: 4`.
const zDecimalNaoMonetario = (max: number, oQueE: string): z.ZodType<Decimal, string> =>
  z
    .string()
    .trim()
    .regex(/^\d{1,3}([.,]\d{1,2})?$/, `${oQueE}: número com até duas casas decimais.`)
    .transform((s) => new Decimal(s.replace(",", ".")).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN))
    .refine((d) => d.greaterThan(0) && d.lessThanOrEqualTo(max), {
      message: `${oQueE}: precisa estar entre 0 (exclusive) e ${max}.`,
    });

// ── ESTRUTURA ────────────────────────────────────────────────────────────────

export const zCadastrarCargoInput = z
  .object({
    codigo: zTexto(1),
    denominacao: zTexto(3),
    tipo: z.enum([
      "EFETIVO",
      "COMISSAO",
      "FUNCAO_GRATIFICADA",
      "EMPREGO_PUBLICO",
      "TEMPORARIO",
      "AGENTE_POLITICO",
    ]),
    /** ⚠️ ZERO É LEGÍTIMO: cargo criado em lei e ainda sem provimento na LOA. */
    vagasFixadas: z.number().int().min(0, "Vagas fixadas não pode ser negativo"),
    leiAutorizativa: zTexto(3, "Cargo público só existe por lei — informe qual"),
    dataPublicacaoLei: z.coerce.date(),
    requisitoIngresso: zOpcional(3),
    cargaHorariaSemanal: z.number().int().positive().optional(),
    dataExtincao: z.coerce.date().optional(),
    leiExtincao: zOpcional(3),
    criadoPor: zAutor,
  })
  .superRefine((v, ctx) => {
    // ⚠️ A MESMA BICONDICIONAL DO CHECK `ck_cargo_extincao_completa`, e ela está nos dois
    // lugares de propósito: o Zod dá a mensagem que o usuário entende, o CHECK fecha o caminho
    // que não passa pelo Zod. Cargo só se extingue por LEI.
    if ((v.dataExtincao === undefined) !== (v.leiExtincao === undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["leiExtincao"],
        message:
          "EXTINÇÃO INCOMPLETA: cargo público só se extingue por lei. Informe a data E a lei, " +
          "ou nenhuma das duas.",
      });
    }
    if (v.dataExtincao !== undefined && v.dataExtincao < v.dataPublicacaoLei) {
      ctx.addIssue({
        code: "custom",
        path: ["dataExtincao"],
        message: "O cargo não pode ser extinto antes de ter sido criado.",
      });
    }
  });
export type CadastrarCargoInput = z.input<typeof zCadastrarCargoInput>;

/**
 * V11 V9.4 (TR 5.12.50) — O CADASTRO DA FUNÇÃO.
 *
 * ⚠️ MESMA EXIGÊNCIA DE ATO QUE O CARGO, e pelo mesmo motivo: função exercida sem ato que a criou
 * é designação sem fundamento, e o TCE pergunta qual foi a portaria. `leiAutorizativa` é texto
 * porque cada ente escreve o dele como a lei dele escreveu — não se inventa um formato.
 */
export const zCadastrarFuncaoInput = z.object({
  codigo: z.string().trim().min(1, "código da função"),
  denominacao: z.string().trim().min(1, "denominação da função"),
  leiAutorizativa: z.string().trim().min(1, "a lei ou o ato que criou a função"),
  dataPublicacaoLei: z.coerce.date(),
  dataExtincao: z.coerce.date().optional(),
  leiExtincao: z.string().trim().min(1).optional(),
  criadoPor: zAutor,
});
export type CadastrarFuncaoInput = z.input<typeof zCadastrarFuncaoInput>;

export const zCadastrarLotacaoInput = z.object({
  codigo: zTexto(1),
  nome: zTexto(3),
  paiId: z.string().min(1).optional(),
  /**
   * ⚠️ OPCIONAL DE PROPÓSITO. A maioria das caixas do organograma (escola, creche, posto) NÃO
   * corresponde a uma unidade orçamentária — ver o docblock de `Lotacao` no schema. Quando
   * corresponde, é esta FK que o bloco 2 vai usar para apropriar a despesa de pessoal.
   */
  unidadeOrcId: z.string().min(1).optional(),
  dataExtincao: z.coerce.date().optional(),
  criadoPor: zAutor,
});
export type CadastrarLotacaoInput = z.input<typeof zCadastrarLotacaoInput>;

// ── A PESSOA ─────────────────────────────────────────────────────────────────

export const zCadastrarServidorInput = z
  .object({
    /**
     * ⚠️ A IDENTIDADE É A PESSOA CANÔNICA (M19) — V6 P2.1. O servidor não repete CPF, nome,
     * endereço nem contato: aponta para a `Pessoa` FÍSICA do cadastro único, e é lá que esses
     * dados vivem (versionados). Uma pessoa é no máximo UM servidor; um servidor tem N vínculos.
     */
    pessoaId: z.string().min(1),
    /** Lei 14.164/2021 — quando presente, é ELE que as telas mostram. */
    nomeSocial: zOpcional(2),
    dataNascimento: z.coerce.date(),
    sexo: z.enum(["MASCULINO", "FEMININO", "NAO_INFORMADO"]),
    pisPasep: zPis.optional(),
    rgNumero: zOpcional(1),
    rgOrgaoEmissor: zOpcional(2),
    rgUf: zUf.optional(),
    rgDataEmissao: z.coerce.date().optional(),
    tituloEleitor: zOpcional(1),
    tituloZona: zOpcional(1),
    tituloSecao: zOpcional(1),
    ctpsNumero: zOpcional(1),
    ctpsSerie: zOpcional(1),
    ctpsUf: zUf.optional(),
    nomeMae: zOpcional(3),
    nomePai: zOpcional(3),
    /** ⚠️ REFERÊNCIA, NUNCA BYTES — ver o docblock do model. */
    fotoCaminho: zOpcional(1),
    fotoTipoConteudo: zOpcional(3),
    fotoHashSha256: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[0-9a-f]{64}$/, "SHA-256 em hexadecimal, 64 caracteres.")
      .optional(),
    criadoPor: zAutor,
  })
  .superRefine((v, ctx) => {
    if (v.dataNascimento.getTime() > Date.now()) {
      ctx.addIssue({
        code: "custom",
        path: ["dataNascimento"],
        message: "Data de nascimento no futuro.",
      });
    }
  });
export type CadastrarServidorInput = z.input<typeof zCadastrarServidorInput>;

// ── O VÍNCULO ────────────────────────────────────────────────────────────────

/**
 * A ADMISSÃO — cria o vínculo E o evento `ADMISSAO`, na mesma transação.
 *
 * ⚠️ CARGO, LOTAÇÃO E SALÁRIO SÃO OBRIGATÓRIOS AQUI, e é o CHECK
 * `ck_historico_vinculo_admissao_completa` que os impõe no banco. Um vínculo cuja admissão não
 * diz o cargo é um vínculo cujo `cargoVigenteEm` devolve `null` para sempre — ninguém saberia em
 * que cargo a pessoa foi nomeada, nem a folha saberia quanto pagar.
 */
export const zAdmitirServidorInput = z.object({
  servidorId: z.string().min(1),
  matricula: zTexto(1),
  tipo: z.enum([
    "EFETIVO",
    "COMISSIONADO",
    "TEMPORARIO",
    "ELETIVO",
    "APOSENTADO",
    "PENSIONISTA",
    "ESTAGIARIO",
  ]),
  regimeJuridico: zTexto(3, "O regime jurídico como a lei do ente o nomeia"),
  /** V6 P2.3 — decide a tabela de contribuição da folha (M33). Opcional no cadastro; a folha exige. */
  regimePrevidenciario: z.enum(["RGPS", "RPPS", "ISENTO"]).optional(),
  dataAdmissao: z.coerce.date(),
  cargoId: z.string().min(1),
  lotacaoId: z.string().min(1),
  /**
   * V11 V9.5 — O CENTRO DE CUSTO NA ADMISSÃO, OPCIONAL. `Setor` do M21.
   *
   * ⚠️ POR QUE A ADMISSÃO O ACEITA E NÃO ACEITA `funcaoId` — a assimetria tem fundamento, não é
   * descuido:
   *
   *   · CENTRO DE CUSTO é atributo CONTÍNUO do vínculo: a despesa dele é apropriada em algum
   *     lugar desde o primeiro dia. Se só pudesse entrar por movimentação posterior, TODO vínculo
   *     novo nasceria sem apropriação e dependeria de um segundo ato que alguém vai esquecer —
   *     criando de propósito mais dívida do tipo que `VINCULOS-ANTERIORES-SEM-CENTRO-DE-CUSTO` já
   *     registra para o histórico. O CHECK do banco foi escrito permitindo ADMISSAO exatamente
   *     para isto.
   *
   *   · FUNÇÃO é ato PRÓPRIO e datado (a portaria de designação), quase sempre posterior. Ninguém
   *     é admitido já designado. E `ck_historico_vinculo_funcao` é BICONDICIONAL: só
   *     `DESIGNACAO_FUNCAO` traz função. Aceitá-la aqui exigiria afrouxar o CHECK para dois
   *     tipos, e então "admitiu" e "designou" ficariam com as mesmas colunas preenchidas na ficha
   *     funcional. Quando os dois coincidem na data, são DOIS eventos na mesma data — que é o que
   *     a razão append-only já suporta sem precisar de exceção.
   */
  centroDeCustoId: z.string().min(1).optional(),
  salarioBase: zValorPositivo,
  observacao: zOpcional(3),
  portariaId: z.string().min(1).optional(),
  criadoPor: zAutor,
});
export type AdmitirServidorInput = z.input<typeof zAdmitirServidorInput>;

/** Os eventos que MOVEM (onde e em quê se trabalha) — ação `MOVIMENTAR_SERVIDOR`. */
export const TIPOS_DE_MOVIMENTACAO = [
  "MUDANCA_CARGO",
  "MUDANCA_LOTACAO",
  "AFASTAMENTO",
  "RETORNO_AFASTAMENTO",
  "MUDANCA_REGIME_PREVIDENCIARIO",
  // ⚠️ V11 V9.4 — OS TRÊS NOVOS ENTRAM EM "MOVER", NÃO EM "PAGAR", e a escolha é do censo, não
  // de conveniência. Designar alguém para uma função NÃO paga nada por si: a gratificação que
  // costuma acompanhá-la é evento PRÓPRIO (`GRATIFICACAO`, em `TIPOS_DE_ALTERACAO_REMUNERATORIA`),
  // com outro crachá. Fundi-los faria quem pode designar passar a poder aumentar salário.
  // Mudar o centro de custo também não paga: muda ONDE a mesma despesa é apropriada.
  "DESIGNACAO_FUNCAO",
  "DISPENSA_FUNCAO",
  "MUDANCA_CENTRO_DE_CUSTO",
] as const;

/** Os eventos que PAGAM (quanto se recebe) — ação `ALTERAR_REMUNERACAO`. */
export const TIPOS_DE_ALTERACAO_REMUNERATORIA = [
  "PROMOCAO",
  "REAJUSTE_SALARIAL",
  "GRATIFICACAO",
] as const;

const zEventoBase = {
  vinculoId: z.string().min(1),
  data: z.coerce.date(),
  motivo: zMotivo,
  portariaId: z.string().min(1).optional(),
  criadoPor: zAutor,
};

export const zRegistrarMovimentacaoInput = z
  .object({
    ...zEventoBase,
    tipo: z.enum(TIPOS_DE_MOVIMENTACAO),
    cargoId: z.string().min(1).optional(),
    lotacaoId: z.string().min(1).optional(),
    /** Só MUDANCA_REGIME_PREVIDENCIARIO. */
    regimePrevidenciario: z.enum(["RGPS", "RPPS", "ISENTO"]).optional(),
    /** V11 V9.4 — só DESIGNACAO_FUNCAO. A DISPENSA não o traz, e o `superRefine` impõe. */
    funcaoId: z.string().min(1).optional(),
    /** V11 V9.4 — só MUDANCA_CENTRO_DE_CUSTO (na admissão ele entra por `admitirServidor`). */
    centroDeCustoId: z.string().min(1).optional(),
  })
  .superRefine((v, ctx) => {
    // ⚠️ ESPELHA `ck_historico_vinculo_cargo_exigido` E `..._lotacao_exigida`. Um evento de
    // MUDANCA_CARGO sem cargo não move nada — `cargoVigenteEm` procura o último evento COM
    // cargo, e este não é um. O servidor "mudou de cargo" e continuaria no antigo, sem erro.
    if (v.tipo === "MUDANCA_CARGO" && v.cargoId === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["cargoId"],
        message: "MUDANCA_CARGO sem cargo de destino não move nada. Informe o cargo.",
      });
    }
    if (v.tipo === "MUDANCA_LOTACAO" && v.lotacaoId === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["lotacaoId"],
        message: "MUDANCA_LOTACAO sem lotação de destino não move nada. Informe a lotação.",
      });
    }
    // ⚠️ MESMA DISCIPLINA DO CARGO: mudança de regime sem o regime de destino não muda nada —
    // `regimeVigenteEm` procura o último evento COM regime, e este não seria um.
    if (v.tipo === "MUDANCA_REGIME_PREVIDENCIARIO" && v.regimePrevidenciario === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["regimePrevidenciario"],
        message: "MUDANCA_REGIME_PREVIDENCIARIO sem o regime de destino não muda nada. Informe RGPS, RPPS ou isento.",
      });
    }
    if (v.tipo !== "MUDANCA_REGIME_PREVIDENCIARIO" && v.regimePrevidenciario !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["regimePrevidenciario"],
        message: "Só a mudança de regime previdenciário informa regime. Um afastamento que trocasse o regime mudaria a contribuição sem que ninguém tivesse pedido.",
      });
    }
    // ⚠️ E O CONTRÁRIO TAMBÉM: afastamento não muda cargo nem lotação. Deixar passar faria a
    // licença-maternidade mover a servidora de setor, sem que ninguém tivesse pedido.
    if (
      (v.tipo === "AFASTAMENTO" || v.tipo === "RETORNO_AFASTAMENTO") &&
      (v.cargoId !== undefined || v.lotacaoId !== undefined)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["tipo"],
        message:
          "Afastamento e retorno não mudam cargo nem lotação — o vínculo volta para onde estava. " +
          "Se houve remoção, ela é outro evento.",
      });
    }
    // ═══ V11 V9.4 — ESPELHA `ck_historico_vinculo_funcao`, QUE É BICONDICIONAL ═══
    if (v.tipo === "DESIGNACAO_FUNCAO" && v.funcaoId === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["funcaoId"],
        message: "DESIGNACAO_FUNCAO sem a função de destino não designa nada. Informe a função.",
      });
    }
    // ⚠️ E A DISPENSA NÃO TRAZ FUNÇÃO — não é preciosismo. `funcaoVigenteEm` decide pelo TIPO do
    // evento, então uma dispensa COM `funcaoId` preenchido continuaria encerrando; o estrago é na
    // LEITURA humana da ficha funcional, onde "dispensado da função de diretor" e "designado para
    // diretor" passariam a ter exatamente as mesmas colunas preenchidas.
    if (v.tipo !== "DESIGNACAO_FUNCAO" && v.funcaoId !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["funcaoId"],
        message:
          "Só a designação informa função. A dispensa ENCERRA a que estiver vigente, e preenchê-la " +
          "faria a ficha funcional mostrar a dispensa com a mesma cara de uma designação.",
      });
    }
    // ═══ V11 V9.4 — ESPELHA `ck_historico_vinculo_centro_de_custo` E `..._exigido` ═══
    if (v.tipo === "MUDANCA_CENTRO_DE_CUSTO" && v.centroDeCustoId === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["centroDeCustoId"],
        message: "MUDANCA_CENTRO_DE_CUSTO sem o centro de custo de destino não muda nada. Informe o setor.",
      });
    }
    if (v.tipo !== "MUDANCA_CENTRO_DE_CUSTO" && v.centroDeCustoId !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["centroDeCustoId"],
        message:
          "Só a mudança de centro de custo informa centro de custo por aqui. Uma remoção que também " +
          "reapropriasse a despesa moveria dinheiro sem que ninguém tivesse pedido — são dois atos.",
      });
    }
  });
export type RegistrarMovimentacaoInput = z.input<typeof zRegistrarMovimentacaoInput>;

export const zRegistrarAlteracaoRemuneratoriaInput = z
  .object({
    ...zEventoBase,
    tipo: z.enum(TIPOS_DE_ALTERACAO_REMUNERATORIA),
    /** PROMOCAO muda o cargo junto; REAJUSTE e GRATIFICACAO, não. */
    cargoId: z.string().min(1).optional(),
    salarioBase: zValorPositivo.optional(),
    gratificacaoDescricao: zOpcional(3),
    gratificacaoValor: zValorPositivo.optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.tipo === "PROMOCAO" || v.tipo === "REAJUSTE_SALARIAL") && v.salarioBase === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["salarioBase"],
        message: `${v.tipo} sem o novo vencimento-base não altera remuneração nenhuma.`,
      });
    }
    if (v.tipo === "PROMOCAO" && v.cargoId === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["cargoId"],
        message: "PROMOCAO é progressão para OUTRO cargo. Informe o cargo de destino.",
      });
    }
    // ⚠️ BICONDICIONAL, como o CHECK `ck_historico_vinculo_gratificacao`: a gratificação traz
    // valor E descrição, e nenhum outro tipo os traz. Um reajuste que carregasse gratificação de
    // carona a poria na folha sem ato que a fundamente.
    const temGratificacao =
      v.gratificacaoValor !== undefined && v.gratificacaoDescricao !== undefined;
    if ((v.tipo === "GRATIFICACAO") !== temGratificacao) {
      ctx.addIssue({
        code: "custom",
        path: ["gratificacaoValor"],
        message:
          v.tipo === "GRATIFICACAO"
            ? "GRATIFICACAO exige descrição E valor — é o que a folha vai pagar e o que o ato diz."
            : `${v.tipo} não carrega gratificação. Conceder uma é outro evento, com o ato dela.`,
      });
    }
    if (v.tipo !== "PROMOCAO" && v.cargoId !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["cargoId"],
        message: `${v.tipo} não muda de cargo. Mudar de cargo é MUDANCA_CARGO ou PROMOCAO.`,
      });
    }
    if (v.tipo === "GRATIFICACAO" && v.salarioBase !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["salarioBase"],
        message:
          "Gratificação é parcela ADICIONAL — ela não redefine o vencimento-base. Somá-la à base " +
          "faria o próximo reajuste incidir sobre ela.",
      });
    }
  });
export type RegistrarAlteracaoRemuneratoriaInput = z.input<
  typeof zRegistrarAlteracaoRemuneratoriaInput
>;

export const zDesligarServidorInput = z.object({
  vinculoId: z.string().min(1),
  data: z.coerce.date(),
  motivo: zMotivo,
  portariaId: z.string().min(1).optional(),
  criadoPor: zAutor,
});
export type DesligarServidorInput = z.input<typeof zDesligarServidorInput>;

// ── DEPENDENTES ──────────────────────────────────────────────────────────────

const zFinalidade = z.enum([
  "IMPOSTO_RENDA",
  "SALARIO_FAMILIA",
  "PLANO_SAUDE",
  "PENSAO_ALIMENTICIA",
]);

export const zCadastrarDependenteInput = z
  .object({
    servidorId: z.string().min(1),
    nome: zTexto(3),
    /** ⚠️ OPCIONAL: recém-nascido entra na folha antes de ter CPF. */
    cpf: zCpf.optional(),
    dataNascimento: z.coerce.date(),
    grauParentesco: z.enum([
      "CONJUGE",
      "COMPANHEIRO",
      "FILHO",
      "ENTEADO",
      "TUTELADO",
      "PAI",
      "MAE",
      "IRMAO",
      "NETO",
      "OUTRO",
    ]),
    invalidezPermanente: z.boolean().optional(),
    /** A primeira finalidade — um dependente sem finalidade nenhuma não vale para nada. */
    finalidade: zFinalidade,
    dataInicio: z.coerce.date(),
    /** Ausente = o limite LEGAL da finalidade (`LIMITE_ETARIO_LEGAL`). */
    limiteIdadeAnos: z.number().int().positive().optional(),
    criadoPor: zAutor,
  })
  .superRefine((v, ctx) => {
    if (v.dataNascimento.getTime() > Date.now()) {
      ctx.addIssue({
        code: "custom",
        path: ["dataNascimento"],
        message: "Data de nascimento no futuro.",
      });
    }
  });
export type CadastrarDependenteInput = z.input<typeof zCadastrarDependenteInput>;

export const zRegistrarFinalidadeDependenteInput = z.object({
  dependenteId: z.string().min(1),
  finalidade: zFinalidade,
  dataInicio: z.coerce.date(),
  limiteIdadeAnos: z.number().int().positive().optional(),
  criadoPor: zAutor,
});
export type RegistrarFinalidadeDependenteInput = z.input<
  typeof zRegistrarFinalidadeDependenteInput
>;

/**
 * A BAIXA POR FATO EFETIVA de uma finalidade — o ENCERRAMENTO (fato, V7 M1) ou, para linha anterior a
 * ele, a coluna legada gravada por UPDATE. Todo leitor passa por aqui; ninguém lê `dataBaixa` cru.
 */
export function baixaEfetiva(f: { readonly dataBaixa: Date | null; readonly encerramento?: { readonly dataEfeito: Date } | null }): Date | null {
  return f.encerramento?.dataEfeito ?? f.dataBaixa;
}

/**
 * A BAIXA POR **FATO** — óbito, perda da guarda, decisão judicial.
 *
 * ⚠️ A BAIXA POR IDADE NÃO PASSA POR AQUI, e não existe serviço para ela: ela é derivada
 * (`dependenteValeEm`). Um serviço de "baixar por idade" seria um job noturno com outro nome, e
 * o dia em que não rodasse o ente pagaria salário-família de um jovem de vinte anos.
 */
export const zBaixarFinalidadeDependenteInput = z.object({
  finalidadeId: z.string().min(1),
  dataBaixa: z.coerce.date(),
  motivoBaixa: zTexto(5, "O motivo da baixa — óbito, perda da guarda, decisão judicial"),
  criadoPor: zAutor,
});
export type BaixarFinalidadeDependenteInput = z.input<typeof zBaixarFinalidadeDependenteInput>;

// ── ATOS E REGISTROS ─────────────────────────────────────────────────────────

export const zRegistrarPortariaInput = z
  .object({
    vinculoId: z.string().min(1),
    numero: zTexto(1),
    ano: z.number().int().min(1900, "Ano implausível").max(2200),
    tipo: z.enum([
      "NOMEACAO",
      "DESIGNACAO",
      "SUBSTITUICAO",
      "PROMOCAO",
      "EXONERACAO",
      "DEMISSAO",
    ]),
    data: z.coerce.date(),
    ementa: zTexto(10, "A ementa precisa dizer o que a portaria determina"),
    dataPublicacao: z.coerce.date().optional(),
    veiculoPublicacao: zOpcional(2),
    criadoPor: zAutor,
  })
  .superRefine((v, ctx) => {
    if (v.dataPublicacao !== undefined && v.dataPublicacao < v.data) {
      ctx.addIssue({
        code: "custom",
        path: ["dataPublicacao"],
        message: "Portaria publicada antes de assinada.",
      });
    }
    if (anoCivil(v.data) !== v.ano) {
      ctx.addIssue({
        code: "custom",
        path: ["ano"],
        message:
          `O ano da portaria (${v.ano}) não bate com o da data ` +
          `(${anoCivil(v.data)}). A numeração é por exercício.`,
      });
    }
  });
export type RegistrarPortariaInput = z.input<typeof zRegistrarPortariaInput>;

/**
 * A ANOTAÇÃO NA FICHA — TR req. 23, segunda metade.
 *
 * ⚠️ TÍTULO E TEXTO TÊM MÍNIMO, e não é preciosismo. Anotação em branco na ficha funcional é pior
 * que anotação nenhuma: ocupa uma linha do histórico, sugere que algo aconteceu e não diz o quê —
 * e cinco anos depois ninguém sabe se foi erro de digitação ou informação perdida. O CHECK
 * `ck_anotacao_servidor_conteudo` impõe o mesmo no caminho que não passa por aqui.
 */
export const zRegistrarAnotacaoServidorInput = z.object({
  servidorId: z.string().min(1),
  /** ⚠️ OPCIONAL: a anotação é da PESSOA, mas pode se referir a UMA matrícula. Ver o schema. */
  vinculoId: z.string().min(1).optional(),
  data: z.coerce.date(),
  tipo: z.enum(["ELOGIO", "ADVERTENCIA", "SUSPENSAO", "OCORRENCIA", "OBSERVACAO"]),
  titulo: zTexto(3, "O título precisa dizer do que se trata"),
  texto: zTexto(10, "A anotação precisa dizer o que aconteceu — dez caracteres é o mínimo"),
  portariaId: z.string().min(1).optional(),
  criadoPor: zAutor,
});
export type RegistrarAnotacaoServidorInput = z.input<typeof zRegistrarAnotacaoServidorInput>;

export const zRegistrarTreinamentoInput = z
  .object({
    servidorId: z.string().min(1),
    descricao: zTexto(3),
    instituicao: zOpcional(2),
    cargaHoraria: z.number().int().positive().optional(),
    dataInicio: z.coerce.date(),
    dataTermino: z.coerce.date().optional(),
    criadoPor: zAutor,
  })
  .superRefine((v, ctx) => {
    if (v.dataTermino !== undefined && v.dataTermino < v.dataInicio) {
      ctx.addIssue({
        code: "custom",
        path: ["dataTermino"],
        message: "O curso terminaria antes de começar.",
      });
    }
  });
export type RegistrarTreinamentoInput = z.input<typeof zRegistrarTreinamentoInput>;

export const zCadastrarDiaCalendarioRhInput = z
  .object({
    data: z.coerce.date(),
    tipo: z.enum([
      "FERIADO_NACIONAL",
      "FERIADO_ESTADUAL",
      "FERIADO_MUNICIPAL",
      "PONTO_FACULTATIVO",
      "SEM_EXPEDIENTE",
      "EXPEDIENTE_REDUZIDO",
    ]),
    descricao: zTexto(3),
    horasExpediente: zDecimalNaoMonetario(24, "Horas do expediente").optional(),
    lotacaoId: z.string().min(1).optional(),
    criadoPor: zAutor,
  })
  .superRefine((v, ctx) => {
    // ⚠️ BICONDICIONAL, como o CHECK `ck_calendario_rh_horas`. Sem a segunda metade, um feriado
    // com "4 horas" seria gravado sem erro e o cálculo de frequência (bloco 2) o trataria como
    // dia útil curto — o servidor apareceria devendo horas num dia em que ninguém trabalhou.
    const temHoras = v.horasExpediente !== undefined;
    if ((v.tipo === "EXPEDIENTE_REDUZIDO") !== temHoras) {
      ctx.addIssue({
        code: "custom",
        path: ["horasExpediente"],
        message:
          v.tipo === "EXPEDIENTE_REDUZIDO"
            ? "Expediente reduzido exige quantas horas o dia terá."
            : `${v.tipo} é dia sem expediente — não tem horas a informar.`,
      });
    }
  });
export type CadastrarDiaCalendarioRhInput = z.input<typeof zCadastrarDiaCalendarioRhInput>;

export const zCadastrarContratoTrabalhoInput = z
  .object({
    vinculoId: z.string().min(1),
    numero: zTexto(1),
    prazo: z.enum(["DETERMINADO", "INDETERMINADO"]),
    dataInicio: z.coerce.date(),
    dataTerminoInicial: z.coerce.date().optional(),
    objetoContratacao: zTexto(10, "O objeto precisa dizer para que se contratou"),
    leiAutorizativa: zOpcional(3),
    criadoPor: zAutor,
  })
  .superRefine((v, ctx) => {
    // ⚠️ BICONDICIONAL, como o CHECK `ck_contrato_trabalho_prazo`. Contrato por tempo
    // DETERMINADO sem término vence nunca — e "excepcional interesse público" (CF art. 37, IX)
    // que vence nunca é contrato por prazo indeterminado com outro nome.
    const temTermino = v.dataTerminoInicial !== undefined;
    if ((v.prazo === "DETERMINADO") !== temTermino) {
      ctx.addIssue({
        code: "custom",
        path: ["dataTerminoInicial"],
        message:
          v.prazo === "DETERMINADO"
            ? "Prazo DETERMINADO exige a data de término — sem ela o contrato vence nunca."
            : "Prazo INDETERMINADO não tem data de término.",
      });
    }
    if (v.dataTerminoInicial !== undefined && v.dataTerminoInicial <= v.dataInicio) {
      ctx.addIssue({
        code: "custom",
        path: ["dataTerminoInicial"],
        message: "O contrato terminaria antes de começar.",
      });
    }
  });
export type CadastrarContratoTrabalhoInput = z.input<typeof zCadastrarContratoTrabalhoInput>;

export const zProrrogarContratoTrabalhoInput = z.object({
  contratoId: z.string().min(1),
  numeroTermo: zTexto(1),
  data: z.coerce.date(),
  dias: z.number().int().positive("A prorrogação soma dias — o número tem de ser positivo"),
  motivo: zMotivo,
  criadoPor: zAutor,
});
export type ProrrogarContratoTrabalhoInput = z.input<typeof zProrrogarContratoTrabalhoInput>;

export const zRegistrarAvaliacaoExperienciaInput = z
  .object({
    vinculoId: z.string().min(1),
    etapa: z.number().int().min(1, "A etapa começa em 1"),
    periodoInicio: z.coerce.date(),
    periodoFim: z.coerce.date(),
    resultado: z.enum(["EM_ANDAMENTO", "APROVADO", "REPROVADO", "PRORROGADO"]),
    // ⚠️ NOTA, NÃO DINHEIRO — ver `zDecimalNaoMonetario`. A coluna é `Decimal(6,2)`.
    pontuacao: zDecimalNaoMonetario(9999, "Pontuação").optional(),
    parecer: zOpcional(5),
    avaliadorNome: zOpcional(3),
    criadoPor: zAutor,
  })
  .superRefine((v, ctx) => {
    if (v.periodoFim <= v.periodoInicio) {
      ctx.addIssue({
        code: "custom",
        path: ["periodoFim"],
        message: "O período de avaliação terminaria antes de começar.",
      });
    }
  });
export type RegistrarAvaliacaoExperienciaInput = z.input<
  typeof zRegistrarAvaliacaoExperienciaInput
>;
