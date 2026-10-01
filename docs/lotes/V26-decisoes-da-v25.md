# V26 — as decisões da V25 e as capacidades restantes da contabilidade

Pedido, como veio (01/10/2026), com a frase do usuário que o acompanha:

> siga este texto para fechar as pendencias e deixar o modulo contabilidade completo e testavel para
> demonstrar ao cliente sua capacidade de atender a operacao dele:

```
ORDEM — RESOLVER AS DECISÕES DA V25 E CONSTRUIR AS CAPACIDADES RESTANTES

Contexto:
docs/lotes/V25-pendentes-da-v24.md
docs/varreduras/varredura-v25-ir-e-iss-retidos-pelo-ente.md

Ente: Esperança/PB, IBGE 2506004.
Leiaute-alvo: SAGRES Contabilidade 2026 v1.1, de 12/12/2025.

Esta ordem diferencia:
- exigência expressa da fonte;
- decisão de desenho do sistema;
- dado real ainda não obtido.

Não transforme recomendação de engenharia em determinação do Tribunal.

Guarde as fontes em docs/oficial, com URL, versão, exercício, data da consulta
e SHA256 dos arquivos efetivamente baixados. Guarde esta ordem em docs/lotes.

Restrições:
- uma árvore e um único escritor;
- até dois agentes: gerente escritor e auxiliar pesquisador/revisor;
- preservar trabalho alheio e scripts do operador;
- migrations aditivas, sem reescrever fatos contabilizados;
- sem push ou transmissão externa;
- percursos que gravam somente na 3011;
- testes dirigidos ao que mudou e consumidores diretos;
- não executar suítes completas, fuso ou portão;
- sem TR, códigos internos ou instruções de engenharia no frontend.

A falha intermitente do SAGRES continua sendo investigada em frente própria.
Não a esconda com retries nem deixe que ela paralise construção independente.

1. IRRF E ISS PRÓPRIOS

1.1 Decisão de implementação

Adotar A para NOVOS pagamentos cuja receita pertence ao próprio Tesouro,
no mesmo perímetro contábil:

pagamento bruto liquidado
→ retenção identificada
→ receita tributária reconhecida/arrecadada por retenção
→ desembolso bancário somente do líquido.

Tudo deve permanecer vinculado e consistente, sem janela em que o pagamento
esteja concluído e a receita correspondente tenha sido esquecida.

Não foi localizada determinação pública do TCE-PB tornando A exclusiva.
Registre esta escolha como desenho fundamentado, não como homologação.

Antes de decidir o tratamento, identificar:
- tributo;
- titular da receita;
- entidade/UG pagadora e arrecadadora;
- conta bancária;
- fonte/destinação;
- existência de crédito tributário previamente reconhecido.

“É ISS” não basta: ISS devido a outro município não é receita própria.
“É IRRF municipal” não permite apropriar a receita ao fundo ou RPPS pagador
quando o titular é o Tesouro municipal.

Entre unidades/entidades distintas, preservar o repasse real e sua
conciliação; não simular que o dinheiro já está na conta do Tesouro.

1.2 Naturezas da receita — principal

- IRRF da folha: 1.1.1.3.03.1.1 / 11130311.
- IRRF de fornecedores PJ, no enquadramento de outros rendimentos:
  1.1.1.3.03.4.1 / 11130341.
- ISSQN próprio: 1.1.1.4.51.1.1 / 11145111.

Classificar pelo rendimento/fato, não apenas pela existência de CNPJ.
Não aplicar esses códigos de principal a multas, juros ou dívida ativa.

Conferir as entradas no ementário STN 2026 e sua compatibilidade com o rol
utilizado pelo TCE-PB. A tabela STN traz também códigos agregadores terminados
em zero; eles não substituem automaticamente o desdobramento de principal.

Divergência encontrada:
a LOA 2026 de Esperança registra IRPF em 11130101, não os dois códigos de
IRRF acima. Preservar o orçamento publicado. Não renomear a rubrica e não
inventar rateio da previsão entre folha e fornecedores.

Construir o suporte à classificação correta da execução e à reconciliação
com a previsão original, deixando nomeada a necessidade de regularização
do enquadramento orçamentário pelo ente.

1.3 Roteiro contábil de referência

Os códigos abaixo são FAMÍLIAS de contas, não autorização para lançar em
conta sintética. Resolver as analíticas no PCASP oficial adotado pelo ente,
com atributos, vigência e contas-correntes necessários.

Reconhecimento do crédito, somente quando ainda não reconhecido:
D 1.1.2.1... Créditos tributários a receber
C 4.1.1.2... VPA de impostos sobre patrimônio e renda — IR
ou
C 4.1.1.3... VPA de impostos sobre produção e circulação — ISS.

Proposta para liquidação financeira por retenção no mesmo perímetro,
considerando apenas retenções próprias:
G = valor bruto; R = retenções próprias; L = G − R.

D obrigação original com fornecedor/pessoal — G
C 1.1.1.1... Banco — L
C 1.1.2.1... Crédito tributário correspondente — R.

A conta da obrigação deve vir do fato original:
fornecedor e pessoal não usam indiscriminadamente a mesma conta.
Conferir os atributos P/F aplicáveis à compensação.

Reconhecimento orçamentário da receita retida:
D 6.2.1.1... Receita a realizar
C 6.2.1.2... Receita realizada — R.

Controle da receita:
D 7.2.1.1... Controle da disponibilidade
C 8.2.1.1.1... Disponibilidade por destinação — R.

Execução do pagamento da despesa:
D 6.2.2.1.3.03... Crédito liquidado a pagar
C 6.2.2.1.3.04... Crédito liquidado pago — G.

Controle correspondente da despesa:
D 8.2.1.1.3... DDR comprometida por liquidação
C 8.2.1.1.4... DDR utilizada — G.

Esse encadeamento é proposta de modelagem para liquidação por retenção,
não transcrição de um roteiro específico do TCE-PB.
Reconciliar com os roteiros existentes antes de implementar.

Preservar separadamente a fonte da despesa e a destinação da receita.
Não herdar a fonte da despesa para o tributo por conveniência.
Se houver mudança entre contas bancárias, registrar a transferência real,
sem gerar uma segunda receita.

Não produzir débito fictício no banco para imitar entrada de dinheiro.
Não duplicar VPA caso o crédito tributário já exista.

1.4 Legado e bloqueio

SIM: bloquear imediatamente no servidor o recolhimento externo genérico
de IR/ISS identificados como receita própria do mesmo Tesouro.

O bloqueio não deve impedir:
- INSS e demais obrigações efetivamente devidas a terceiros;
- ISS devido a outro município;
- transferência real e identificada ao Tesouro por outra entidade/UG.

Para saldos antigos em consignações:
construir regularização identificada e idempotente, sem apagar a origem.
Verificar previamente se a receita já foi reconhecida.

Quando houver consignação e crédito tributário correspondentes, a baixa
patrimonial pode ligar a obrigação ao crédito, sem saída fictícia de banco.
Completar a receita e os controles somente na extensão ainda não registrada.
Não reaplicar automaticamente o roteiro de um pagamento novo.

1.5 Folha

SIM: o IRRF da folha integra a mesma capacidade de receita própria,
com natureza e obrigação de pessoal específicas.

Calcular ou fechar folha não comprova pagamento.
Vincular o reconhecimento da arrecadação por retenção ao fato financeiro
correspondente e conservar a ligação folha → pagamento → retenção → receita.

1.6 Evidência mínima

Exercitar na 3011:
- fornecedor com IR e ISS próprios;
- folha com IR;
- retenção efetivamente devida a terceiro;
- reenvio sem duplicação;
- falha no meio sem fatos órfãos;
- pagamento parcial, quando suportado;
- estorno coordenado;
- legado com receita já reconhecida;
- tentativa de recolhimento externo indevido.

Conferir banco, obrigação, receita, VPA, DDR e arquivos SAGRES.
O arquivo de retenção e o de receita representam aspectos relacionados
do mesmo fato; não são duas arrecadações.

2. SAGRES — DECISÕES E CONSTRUÇÃO

2.1 PLOA

Separar projeto e lei aprovada.

Decisão de modelo:
manter versão identificável do projeto encaminhado à Câmara, com exercício
de destino, documento e data do encaminhamento; preservar alterações,
emendas e a versão convertida em LOA.

Não é necessário duplicar o motor orçamentário: pode ser versionamento
do planejamento existente. Não basta consultar “o cadastro atual do ano
seguinte”, pois ele pode já conter a lei aprovada e alterações posteriores.

Exportar a versão pertinente ao projeto, com a competência da remessa
separada do exercício orçamentário. O leiaute prevê setembro.

Ausência do projeto histórico não autoriza reconstruí-lo a partir da LOA
aprovada e apresentá-lo como original.

2.2 Agrupamento da folha

Usar o identificador do cadastro CodigoAgrupamentoFolhaPagamento da
remessa de pessoal: MM + oito posições identificadoras.

É informado pelo sistema de origem da folha, não um protocolo atribuído
pelo Tribunal. Se a folha vier de terceiro, importar e preservar seu código.

Criar identidade estável, com escopo por UG/exercício/competência.
Não gerar outro código na contabilidade.

Aplicar a relação um-para-um exigida no leiaute contábil. Se o modelo atual
produzir várias liquidações por agrupamento, resolver o agrupamento real;
não fabricar associação apenas no exportador.

2.3 Ordenadores e responsável pelo SIAFIC

Permitir vários ordenadores vinculados à UG, com ato, escopo e vigência.
Não impor troca mensal ou anual: a mudança acompanha nomeação, delegação,
substituição ou revogação.

A seleção do ordenador do fato deve respeitar sua data e atribuição.
Não presumir que todo ordenador é o prefeito ou o usuário que clicou.

ResponsavelSiafic:
- manutenção terceirizada: dados da empresa e de seu responsável técnico;
- manutenção própria: dados da prefeitura e do encarregado pela manutenção.

Não substituir responsável técnico por contador ou gestor sem essa função.
Construir cadastro e vigência; os dados reais devem vir de contrato/designação.

2.4 Programas e ações

Usar documentos de planejamento do ente: PPA, projeto/LOA e alterações.
Construir os campos ausentes e sua entrada na tela.

O objetivo do programa e o código da tabela 5.27 são obrigatórios no
arquivo Programas. A tabela foi atualizada para objetivos da Agenda 2030.

Não inferir objetivo por palavras no nome do programa nem usar um código
genérico para satisfazer o exportador.

A obrigatoriedade de meta/unidade difere entre Acao e PloaAcao.
Implementar validação específica de cada arquivo; não uma regra única
copiada para ambos.

2.5 Deduções da receita prevista — LOA 2026 encontrada

No Anexo II da Lei 613/2025 foram identificadas estas deduções, fonte 500:

17115111 — FPM mensal: R$ 10.147.500,00
17215001 — ICMS:       R$  2.940.300,00
17215101 — IPVA:       R$    427.900,00
17215201 — IPI:        R$      1.540,00
Total:                R$ 13.517.240,00

Classificação: tipo 3, dedução para Fundeb.
Preservar também o desdobramento local “.00” no dado de origem.

Não foram identificadas, nesse anexo, deduções não nulas dos tipos 4 e 5.
Não criar linhas fictícias para cobrir todos os tipos da tabela.

O demonstrativo MDE contém R$ 13.529.000,00, diferente do total cadastrado.
Não recalcular a LOA para corrigir silenciosamente essa divergência.
Registrar diferença de R$ 11.760,00 e preservar a origem de cada valor.

O ITR consta com dedução zero no anexo consultado.
Não preencher automaticamente 20% na previsão publicada.

2.6 Ofício, PDF e protocolo

Ofício não é alternativa genérica ao decreto:
o leiaute admite a movimentação apenas entre elementos de despesa,
mediante autorização na LOA, usando os tipos 14/15.

Construir suporte ao documento e à autorização.
Não ativar essa hipótese para Esperança sem localizar a autorização
específica aplicável; autorização para decreto não equivale à de ofício.

Associar os PDFs aos atos com integridade e exportação.
Reutilizar o mecanismo documental existente.

protocoloTCE:
é o protocolo do banco de legislação do TCE-PB, formato 000000/00.
Preservar barra e zeros. Não usar número da lei, protocolo interno,
identificador do banco local ou recibo de balancete como substituto.

Os números concretos de Esperança não foram comprovados nesta pesquisa.
Construir cadastro/importação e validação; deixar pendência por ato sem
protocolo, sem interromper as demais capacidades.

2.7 Saldo inicial

Adotar como desenho o saldo contábil de abertura sustentado pela
conciliação de encerramento, preservando:
- saldo do extrato;
- saldo contábil;
- pendências conciliatórias;
- ajustes contabilizados;
- responsável e data da conferência.

O leiaute chama SaldoInicial de saldo já conciliado; para SaldoMensal,
fala explicitamente em saldo de extrato. Não tratar os dois como sinônimos.

A interpretação operacional do saldo inicial deve ser registrada como tal:
não foi localizada nesta pesquisa uma fórmula adicional do TCE-PB.

Não somar novamente ajustes que já estão no razão e não registrar
pendências conciliatórias como lançamentos sem fato contábil.

2.8 Licitação e Tramita

De-para da Lei 14.133 no leiaute consultado:
21 — dispensa
22 — inexigibilidade
23 — concorrência
24 — pregão
25 — concurso
30 — credenciamento
32 — diálogo competitivo
33 — alienação de bens com licitação dispensada
34 — leilão
35 — adesão a ata de registro de preços.

Distinguir lei de regência e procedimento.
Não converter pregão da Lei 14.133 em 10/11 apenas por ser eletrônico/presencial.
A tabela atual chega ao código 39; não congelá-la em 35 entradas.

O relacionamento exige licitação existente no Tramita.
Guardar o número da licitação cadastrado lá e sua UG/modalidade.
Não confundir esse número com protocolo processual do Tribunal.

Número interno só serve se corresponder à identidade efetivamente
cadastrada no Tramita. Não inventar um identificador externo diferente.

Respeitar as exceções expressas de preenchimento para modalidades 6 e 9;
não estendê-las automaticamente à dispensa 21.

2.9 Unidades gestoras

Construir suporte a múltiplas UGs no mesmo ente municipal.
Monoente não significa uma única UG.

Há evidência pública de Prefeitura e Câmara de Esperança como unidades
distintas. Isso já afasta a hipótese de colapsar todo o município numa UG.

Não transformar automaticamente cada secretaria ou fundo em UG.
O rol completo, códigos e vigências de 2026 ainda devem ser confirmados
no cadastro oficial do TCE.

Construir a capacidade de transferências entre UGs, incluindo duodécimos,
com origem/destino, contas, datas, vínculo, estorno e conciliação.

Não registrar transferência financeira interna como nova receita
tributária nem duplicá-la na consolidação.

Se apenas um lado estiver sob operação do sistema, registrar esse lado
e a contraparte externa identificada; não fabricar confirmação do outro.

3. APRESENTAÇÃO 3010

Decisão desta ordem: AINDA NÃO executar a troca/reinício da 3010.
Não há janela definida pelo operador.

Isso não bloqueia a construção:
preparar migração, configuração, carga verificável e procedimento de
promoção/reversão, validando o comportamento na 3011.

Separar a identidade de Esperança dos dados históricos de Campina Grande.
Não “converter” fatos antigos apenas trocando o nome e o IBGE do ente.

Preparar a correção dos vínculos:
- ISS não pode continuar associado a Garantias;
- INSS exige conta analítica válida;
- IRRF próprio precisa da cadeia de receita, não apenas de nova consignação.

Configuração nova não corrige lançamentos antigos automaticamente.
Identificar se existem fatos afetados e propor regularização preservando
o histórico. Não apagar ou recriar o banco da apresentação.

Quando tudo estiver preparado, informar duração estimada da interrupção,
versão a promover e pendências concretas. Não abrir outro inventário genérico.

4. CONCLUSÃO DA RODADA

Execute na ordem 1, 2, 3 e continue pelas unidades independentes.
Não considere “decidido” equivalente a “implementado”.

Entregar:
- capacidades operáveis e rotas;
- decisões aplicadas com fontes;
- analíticas PCASP efetivamente utilizadas;
- testes dirigidos e percursos realmente executados;
- pendências restritas ao dado/documento ainda ausente;
- situação da 3010, sem afirmar promoção não executada.
```

## Checkpoint

(preenchido ao longo da rodada)
