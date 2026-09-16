# M34 — Cadastro imobiliário e parâmetros do tributo (V7 B1)

Primeira unidade da frente tributária (F07 do plano mestre, M3 da orquestração). A cadeia desta unidade é
**cadastrar → resolver o parâmetro aplicável → simular com memória**. Ela **não lança tributo, não constitui dívida,
não emite guia e não escreve no ledger** — a efetivação financeira é a unidade seguinte (B2), por contrato próprio com
o M04/M01.

## O cadastro é histórico

`Imovel` é a identidade (a inscrição). O que muda — endereço, uso, padrão, áreas, fração ideal e os atributos
declarados pelo ente — é uma `VersaoDoImovel` com vigência e motivo. Nenhuma versão é reescrita: `versaoDoImovelNoDia`
devolve a que valia naquele dia, e é por isso que a simulação de um exercício anterior não muda quando o cadastro é
atualizado hoje. Versão nova não pode valer antes da última (`VIGENCIA-ANTERIOR-A-VERSAO-VIGENTE`).

`AtributoDaVersaoDoImovel` é o dado numérico que o ente declara (testada, pavimentos, fator de esquina): é o que a
fórmula pode usar sem migration nova. O que a fórmula pedir e o cadastro não tiver é recusa nomeada — nunca zero em
silêncio.

## Os vínculos com a Pessoa canônica (M19)

`VinculoDePessoaComImovel` liga a Pessoa ao imóvel por PAPEL (proprietário, compromissário, possuidor, responsável
tributário — art. 34 do CTN), com fração e vigência. A soma das frações vigentes do MESMO papel não passa de 1
(`FRACAO-ACIMA-DO-INTEIRO`); a mesma pessoa não repete vínculo vigente no mesmo papel (`VINCULO-JA-EXISTE`). Encerrar é
fato com data de efeito e motivo (`EncerramentoDoVinculoComImovel`), e o histórico continua legível. Este módulo **não
cria pessoa**: ela vem do cadastro de pessoas, pelo documento (`PESSOA-NAO-CADASTRADA`).

## A conta é do ente, não do código

`TabelaDeParametrosTributarios` guarda, por tributo e exercício, a **fórmula** do município, o **fundamento** legal
declarado e os **parâmetros** (`ParametroTributario`), tudo versionado por vigência. A fórmula é interpretada por
`packages/formula` — universo fechado: números, variáveis declaradas, `+ − * /`, comparações, parênteses e as funções
`min`, `max`, `arredondar`, `teto`, `piso` e `se`. **Nunca `eval`, `new Function` ou lista negra**: `constructor`,
`process`, `require`, `[]` e afins não chegam a ser avaliados, porque não existem nesse universo.

Na publicação, a fórmula é analisada ANTES de gravar: variável que não vem do cadastro nem dos parâmetros é recusa
(`VARIAVEL-SEM-ORIGEM`) — uma tabela que só quebraria na hora de simular seria norma quebrada guardada como boa.

## A simulação

`simularTributo` é LEITURA: resolve a versão do cadastro e a tabela que valem no dia, monta as variáveis (cadastro,
atributos do imóvel e parâmetros — nessa ordem de precedência, com aviso quando o atributo cobre o parâmetro), calcula
e devolve valor, **memória** (cada variável com o seu valor e a origem) e o rateio informativo por responsável.
Sem tabela publicada, recusa nomeada (`SEM-TABELA-PUBLICADA`) — inventar alíquota de IPTU seria inventar norma
municipal. Resultado negativo é recusado (`SIMULACAO-NEGATIVA`).

Ações: `GERIR_CADASTRO_IMOBILIARIO` (imóvel, versão, vínculo, encerramento) e `GERIR_PARAMETROS_TRIBUTARIOS` (tabela),
atualização de permissões **v22**. Simular não é ação: é leitura sob `CONSULTAR_RECEITA`.
Telas: `/receita/imoveis`, `/receita/imoveis/[inscricao]` (versões, vínculos e a simulação com memória) e
`/receita/parametros-tributarios`. Testes: `test/cadastro-imobiliario-e-simulacao.test.ts` (CI01, CI02, SI01–SI03) e
`packages/formula/formula.test.ts` (FM01–FM05).

Fora desta unidade: lançamento, guia, baixa, contabilização, parcelamento, dívida ativa (B2 em diante), cadastro
econômico/ISS, ITBI por transmissão, isenções e imunidades por regra declarada, e a planta de valores como cadastro
próprio (hoje ela é parâmetro da tabela).
