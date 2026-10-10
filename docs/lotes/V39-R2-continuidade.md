ORDEM DE CONTINUIDADE — V39-R2
Construção dos motores, integração das áreas e integridade operacional

> Guardada como veio em 10/10/2026 (14:11 UTC), HEAD 96827a30. Continuação de `V39-construcao-integral-apos-V38.md`.

Execute a continuidade da V39. Esta ordem complementa os 97 itens;
não substitui nem elimina nenhum deles.

Não encerre após inventariar, escrever documentação ou concluir apenas
uma frente. Avance pelas unidades tratáveis, entregando operação real
pela interface e seus efeitos persistidos.

CONTEXTO OBRIGATÓRIO

1. Confira o HEAD atual e preserve alterações alheias.

2. Consulte os prompts guardados em Downloads na máquina sempre que
precisar recuperar requisito, critério, decisão, áudio ou referência
da apresentação. Localize os arquivos reais; não presuma seus nomes
ou conteúdos. Relacione a ordem consultada ao item executado.

3. Leia a matriz V39, o checkpoint e os documentos dos módulos tocados.
Não trate o relatório anterior como prova de execução nesta rodada.

4. Desdobre todos os intervalos agrupados da matriz.
Cada V39 deve ter sua própria linha, evidência e pendência.
Separe “mecanismo existente” de “fluxo completo”.
Reconte os estados somente depois dessa correção.

5. Use até dois auxiliares para reconhecimento e revisão.
Mantenha um único escritor/integrador e serialize processos pesados.
Enquanto uma verificação executa, continue trabalho leve nas outras
unidades. Não crie uma segunda sessão disputando o mesmo índice.

FRENTE 1 — FECHAMENTO DA CONCILIAÇÃO CONFIÁVEL

R2-001 — Fato retroativo após encerramento

Reproduza a inclusão de um fato depois do encerramento, com data
da ocorrência dentro do período já encerrado.

Identifique separadamente:
- data da ocorrência;
- momento de registro;
- conjunto efetivamente conhecido no encerramento.

Construa uma forma consistente de reproduzir a conferência encerrada,
sem esconder o fato tardio do razão atual e sem alterar silenciosamente
a evidência anterior.

Avalie a arquitetura e o ADR existentes. Se precisarem de revisão,
documente a mudança com a evidência concreta. Não congele apenas
um total que perca a composição e não acrescente um filtro de
criadoEm supondo que ele resolve transações concorrentes.

O fato tardio precisa aparecer no tratamento posterior, com referência
ao período afetado. Não alterar artificialmente sua data de ocorrência.

Aceite: a conferência histórica permanece reproduzível; o fato novo
continua visível e tratável; os relatórios distinguem as duas situações.

R2-002 — Corrida no encerramento

A conferência e a gravação do encerramento devem observar um conjunto
consistente de fatos.

Mapeie os escritores que alteram movimentos, extratos, vínculos e
justificativas. Defina a proteção transacional adequada para eles.
Mover uma consulta para dentro da transação, sem conferir isolamento
e escritores concorrentes, não encerra automaticamente o problema.

Teste duas conexões concorrentes com sincronização determinística:
uma encerra; a outra altera um dado relevante.
Não usar apenas sleeps como prova.

R2-003 — Percursos com login próprio

Migre os 28 scripts identificados para a guarda comum ou proteção
equivalente comprovada. A recusa deve acontecer antes de credenciais
e antes de qualquer escrita.

Não mudar a natureza de uma base para fazer um percurso passar.
Não aceitar a marca visual “base fictícia” como autorização suficiente.

R2-004 — Papel de runtime

Preparação de schema pode usar papel administrativo.
A execução funcional das novas jornadas deve usar o papel real
da aplicação.

Conferir justificativas, parâmetro de estoque e cota de consumo com
esse papel. Corrigir privilégios mínimos; não conceder propriedade,
superusuário ou acesso amplo para eliminar recusas.

FRENTE 2 — RETENÇÃO DE PESSOA FÍSICA

R2-005 — Identidade própria da retenção PF

Executar V39-028.

Separar a identificação de PF da classificação IRRF_FORNECEDOR_PJ
em domínio, persistência, validações, CHECKs e consumidores.

Examinar os registros históricos antes de qualquer migração.
Não reclassificar automaticamente fatos antigos somente pelo
documento atual da pessoa.

R2-006 — Operação da retenção PF

Entregar entrada pela tela, memória, documento, pagamento e consulta
com a classificação correta.

Distinguir cálculo automático de valor declarado.
Valor declarado deve ter autoria, fundamento e coerência verificáveis.

Na ausência de parâmetro municipal, construir a configuração e testar
em base de ensaio. Não inventar alíquota oficial nem aplicar a regra
de PJ à PF.

R2-007 — Correção e repetição

Provar reexecução sem duplicidade, estorno pertinente e preservação
dos valores bruto, líquido e retido.

Manter IR próprio, ISS próprio e consignação de terceiro em cadeias
distintas conforme a regra aplicável.

FRENTE 3 — CONTRATOS NO RAZÃO

R2-008 — Aplicação dos roteiros

Executar V39-032 reutilizando a família CONTRATO.

Mapear os eventos efetivos do módulo antes de ligar lançamentos.
Registrar a versão do roteiro usada pelo fato.

Permitir configurar e ensaiar o mecanismo sem aguardar a escolha
definitiva da contadora. Parâmetro sintético não habilita operação
oficial nem exportação que alegue conformidade.

R2-009 — Registro contratual

Operar o registro pela tela e conferir o lançamento correspondente
quando previsto pelo roteiro aplicável.

R2-010 — Acréscimo contratual

Operar o acréscimo, preservar a versão anterior e conferir o efeito
correspondente sem repetir o registro inicial.

R2-011 — Supressão contratual

Operar a supressão respeitando execução já realizada e saldo pertinente.

R2-012 — Execução contratual

Ligar a etapa adequada ao controle contábil, distinguindo medição,
recebimento, liquidação e pagamento.

Não lançar o mesmo efeito em todas as etapas por conveniência.

R2-013 — Estorno contratual

Inverter o que o fato original efetivamente lançou.
Troca posterior de roteiro não pode mudar a inversão histórica.

FRENTE 4 — RESULTADO DA LICITAÇÃO ATÉ O CONTRATO

R2-014 — Participantes

Construir cadastro/vínculo de participantes ao procedimento,
aproveitando pessoas e fornecedores existentes.

R2-015 — Propostas por item ou lote

Registrar proposta, abrangência, valor e documento, com histórico
e regras compatíveis com o procedimento.

R2-016 — Resultado

Registrar o resultado por item ou lote.
Não escolher vencedor automaticamente apenas pelo menor valor.
O sistema deve representar o ato e o critério aplicáveis.

R2-017 — Adjudicação

Registrar ato, autoridade, data, documento e abrangência.

R2-018 — Homologação

Completar o mecanismo existente com abrangência e correção por novo
ato quando pertinente, preservando o anterior.

R2-019 — Contrato originado do resultado

Selecionar resultado válido e transportar contratado, itens,
quantidades e limites, evitando redigitação e incompatibilidades.

R2-020 — Ata de registro de preços

Construir V39-046 com fornecedores, itens, vigência, quantidades e
contratações derivadas.

Saldo da ata, saldo contratual e saldo orçamentário são controles
diferentes e devem permanecer distinguíveis.

FRENTE 5 — PLANEJAMENTO AINDA INCOMPLETO

R2-021 — Importação da LDO

Executar V39-017 com seleção dos blocos, prévia, mapeamento dos anos
e criação de rascunho. Não copiar aprovação, assinatura ou protocolo.

R2-022 — Importação e revisão do PPA

Executar V39-018 distinguindo revisão do ciclo vigente de preparação
do próximo ciclo. Manter origem e versões.

R2-023 — Proposta ligada ao projeto enviado

Completar V39-019: a versão capturada para envio deve apontar para
os dados correspondentes da proposta.

R2-024 — Comparativo das emendas

Completar V39-020 mostrando o efeito das emendas em relação à versão
capturada, sem reconstruir documento histórico inexistente.

FRENTE 6 — OUTRAS ÁREAS MUNICIPAIS

Depois das frentes anteriores, continuar a fila V39 sem exigir outro
prompt para cada unidade.

R2-025 — Condutores e habilitação, V39-063.
R2-026 — Ordem de abastecimento, V39-064.
R2-027 — Hodômetro/horímetro e consumo, V39-065.
R2-028 — Manutenção de veículos, V39-066.
R2-029 — Bloqueio de saída de lote vencido, V39-070.
R2-030 — Dispensação, V39-071.
R2-031 — Inventário farmacêutico, V39-072.

Cada item terá entrada, operação, consulta, autorização, histórico e
efeito no estoque/custo quando pertinente.

Não considerar informe mensal SAGRES como motor operacional completo.
Reutilizar almoxarifado e cadastros existentes onde forem adequados.

Em paralelo ao reconhecimento dessas frentes, preparar os percursos
dos fluxos existentes: encerramento anual, convênios, diárias,
suprimento, patrimônio e folha até tesouraria.

Se a operação mostrar falta de tela ou de ligação, construir.
Não manter a classificação “só falta provar” quando faltar função.

FONTES E PARÂMETROS

Pesquisar os materiais oficiais necessários para Reinf, SIOPE,
SIOPS, BNAFAR e demonstrativos, preservando origem e versão.

Ausência de material externo não bloqueia preparação interna,
cadastros, configuração e simulação.
Também não autoriza inventar leiaute ou declarar transmissão validada.

Não construir licenciamento municipal com base no nome M35.
Conferir o escopo nos prompts/TR de Downloads: M35 é licenciamento
do software.

VERIFICAÇÃO E PUBLICAÇÃO

Somente testes dirigidos às mudanças e consumidores afetados.
Não rodar suítes completas ou portões integrais.

Usar o papel de runtime nas operações testadas.
Conferir efeito persistido, não apenas mensagem ou exit code.
Contraprovas devem atingir o alvo e executar o teste correspondente.

Antes de publicar, abrir todas as telas afetadas e percorrer as
operações modificadas no artefato preparado para instalação.

Seguir a autorização direta vigente nesta sessão para publicação,
sem pedir novamente o que já estiver autorizado.
Não inferir autorização para pagamento bancário ou transmissão fiscal.

A FIC-CM-500 fica aberta nesta rodada; não fabricar movimento nem
transformar essa decisão em bloqueio para as demais entregas.

FECHAMENTO

Entregar uma linha por R2 e por V39 afetado, sem intervalos agrupados.

Separar:
- construído;
- testado com runtime;
- operado pelo navegador;
- instalado;
- validado externamente.

Informar as funções que o operador passou a executar, as rotas,
os perfis, os efeitos e as limitações restantes.

Não declarar a V39 encerrada enquanto os itens residuais continuarem
sem entrega ou sem uma dependência específica comprovada.
