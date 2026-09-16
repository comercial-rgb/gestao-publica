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

---

# M34 B2 — o lançamento, a constituição do crédito e a certidão (V10 T2 · N5)

A unidade B1 parava antes de gravar: cadastrar, resolver o parâmetro, **simular**. B2 fecha a
cadeia — e a primeira decisão foi **não criar um crédito novo**.

## O crédito canônico já existia

É `ReceitaReconhecida` (M04). Ela nasce no fato gerador, debita o crédito a receber e credita a
VPA, tem roteiro contábil por origem da receita, tem vínculo N:N com a arrecadação, tem inscrição
em dívida ativa e tem cancelamento por VPD. E ela já tinha reservado, em 2026, a coluna
`referenciaExterna @unique`, com o comentário dizendo que a integração tributária viria em lote e
que a chave existia para não gerar o crédito duas vezes.

**É esta a integração.** `ConstituicaoDoLancamento` é uma ponte 1-1 entre a preparação e esse
crédito; ela não guarda valor nem data, porque os dois já estão do outro lado e uma segunda cópia
é a que diverge.

## Preparar não é simular, e simular continua sem gravar

`simularTributo` (B1) é leitura e não grava — a regra não mudou, e há teste afirmando isso aqui.
`prepararLoteDeLancamento` chama **a mesma** simulação e grava o resultado, por comando explícito.
Usar dois cálculos diferentes faria a prévia mentir sobre o lançamento.

O que a preparação congela: versão do cadastro, versão da tabela, fundamento, fórmula e cada
variável com valor e origem, mais o sha256 do JSON canônico. Atualizar o cadastro do imóvel depois
**não muda** o que foi lançado — e é essa a diferença entre um lançamento e uma consulta.

## O lote é o grão da revisão, não da constituição

Preparar trinta mil imóveis e constituir trinta mil créditos no mesmo ato deixaria, num erro no
17.000º, um estado que ninguém sabe descrever. Preparar é do lote; constituir é por lançamento,
com ação própria e idempotência própria.

Um imóvel que falha na simulação **não derruba o lote**: entra na lista de recusados, com o
motivo. Um lote de vinte mil que aborta no primeiro cadastro incompleto é um lote que ninguém
consegue preparar.

## As quatro recusas da constituição

1. lançamento que não está `PREPARADO`;
2. lançamento **com inconsistência** — é para isso que a revisão existe;
3. valor não positivo;
4. **roteiro contábil ausente** para a origem da natureza. Esta é a que a ordem V10 nomeia:
   *"sem roteiro contábil validado, impedir a efetivação e produzir pendência acionável"*. A
   mensagem diz o que não se faz (escolher uma conta parecida — seria inventar norma da STN), quem
   resolve, e que a preparação e a revisão continuam disponíveis.

**Constituir não arrecada.** O caixa não é tocado; arrecadar é outro fato, e ele **baixa** este
crédito (permutativa). Lançar os dois contaria a mesma receita duas vezes.

## Corrigir preserva a origem

`CANCELAR` baixa o crédito por **VPD**, não por estorno: o crédito existiu (a VPA daquele mês foi
verdadeira e fica), e o que se perdeu depois é a renúncia — que é justamente o número que o
controle externo procura. `RETIFICAR` cancela e prepara um substituto **PREPARADO**, num lote
`<numero>-R`; constituir o crédito novo continua sendo ato à parte.

As duas recusam quando o crédito já foi tocado — arrecadado, inscrito em dívida ativa ou já
cancelado em parte — e a mensagem traz **a sequência permitida**, na ordem.

## A certidão: a negativa falsa é o defeito a evitar

"Não achei dívida" e "não olhei" produzem a mesma tela e são opostas para quem assina. A saída é a
**cobertura**: uma linha por base do ente, com a situação em que ela respondeu —
`SEM_PENDENCIA`, `COM_PENDENCIA`, `INDISPONIVEL` (existe e não respondeu) ou `FORA_DO_ALCANCE`
(existe no ente e este sistema não a cobre).

Hoje, três bases estão **fora do alcance**, e está escrito no código por quê:

| Base | Por que não é alcançada |
|---|---|
| Dívida ativa | o M10 guarda o devedor como TEXTO, sem vínculo com a Pessoa canônica — consultar por nome faria de um homônimo uma certidão errada |
| Parcelamento | não existe neste sistema |
| Cadastro econômico e ISS | não existem neste sistema; quem não deve IPTU pode dever ISS |

Consequência declarada: **o sistema não sugere nem emite negativa sozinho.** Ele faz o pedido e a
análise, e a emissão de negativa exige a `declaracaoDeConferencia` — o que quem assina conferiu
fora daqui —, que vai **congelada** no documento com o nome dela.

E a emissão exige a **configuração** (validade em dias e fundamento), versionada por vigência. Sem
ela, emitir é recusado: "90 dias" é o prazo de muitos municípios e não é o de todos, e cravá-lo
seria inventar norma. O pedido e a análise funcionam sem a configuração.

A **chave de autenticidade** é 64 hex de `randomBytes`, não enumerável; a conferência pública
devolve o mínimo (protocolo, tipo, titular com documento mascarado, emissão, validade, vigência) e
nunca o extrato de débitos. Chave inválida e chave inexistente respondem **igual** — a diferença
ensinaria a quem varre o que está perto de acertar.

## Ações, telas e testes

Ações: `PREPARAR_LANCAMENTO_TRIBUTARIO`, `CONSTITUIR_CREDITO_TRIBUTARIO`,
`RETIFICAR_LANCAMENTO_TRIBUTARIO`, `CANCELAR_LANCAMENTO_TRIBUTARIO`, `SOLICITAR_CERTIDAO`,
`DECIDIR_CERTIDAO`. A **configuração** da certidão compartilha `GERIR_PARAMETROS_TRIBUTARIOS`:
validade e fundamento são parâmetro normativo do ente, como a alíquota.

Telas: `/receita/lancamentos`, `/receita/lancamentos/[loteId]`, `/receita/certidoes` e a
conferência pública `/consulta/certidao` (sem sessão).

Testes: `test/lancamento-tributario.test.ts` (19) e `test/certidao.test.ts` (21). O valor esperado
do IPTU é calculado **à mão** no cabeçalho do teste, com uma regra sintética identificada como
tal — usar `calcular()` para conferir `calcular()` passaria com qualquer interpretação errada
consistente.

## Pendências nomeadas

- **`CERTIDAO-SEM-DOCUMENTO-PDF`** — a emissão congela o conteúdo (`emissao` + `emissaoSha256`),
  e ainda não gera o PDF pelo M22. A conferência pública já funciona pela chave.
- **`DIVIDA-ATIVA-SEM-PESSOA`** — enquanto o M10 não vincular a inscrição em dívida ativa à Pessoa
  canônica, a base continua `FORA_DO_ALCANCE` e nenhuma negativa sai sem declaração humana.
- **`CERTIDAO-SEM-EXIGIBILIDADE-SUSPENSA`** — "positiva com efeito de negativa" (art. 206 do CTN)
  existe como tipo, e quem a escolhe é a pessoa que analisa: o sistema não modela suspensão de
  exigibilidade por parcelamento ou liminar.
- **`LANCAMENTO-SEM-GUIA`** — vencimentos existem; guia com código de barras, não.
- **`LANCAMENTO-SEM-NOTIFICACAO`** — notificar o contribuinte do lançamento (CTN art. 145) é ato
  que ainda não existe aqui.
