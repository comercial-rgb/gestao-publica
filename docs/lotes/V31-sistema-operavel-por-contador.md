# V31 — Sistema operável por contador público (pedido como veio, 03/10/2026)

ORDEM — SISTEMA OPERÁVEL POR CONTADOR PÚBLICO

Construa uma experiência completa de operação da contabilidade pública.
O contador deve localizar e executar as atividades pela interface,
sem depender de scripts, SQL, conhecimento dos módulos internos
ou sequência previamente ensaiada.

Use o vídeo do PublicSoft já anexado como referência de organização
funcional e familiaridade. Preserve nossa identidade visual e reutilize
os componentes existentes.

Não basta reorganizar menus. Cada ação exposta deve chegar ao serviço,
persistir corretamente e produzir seus efeitos nos módulos relacionados.

1. NAVEGAÇÃO PRINCIPAL

Organize abas principais, com submenus legíveis:

PLANEJAMENTO
- PPA: programas, ações, objetivos e metas.
- LDO: elaboração, prioridades, metas e anexos.
- LOA: proposta, receitas previstas, dotações e aprovação.
- Importação e preparação do próximo exercício.
- Comparação de exercícios e versões.
- QDD e detalhamento da receita.
- Programação financeira, CMD e MBA.
- Conferências e relatórios do planejamento.

ORÇAMENTO E DESPESA
- Dotações e saldos.
- Solicitações, reservas e bloqueios.
- Alterações orçamentárias e créditos adicionais.
- Solicitação e autorização de empenho.
- Empenhos.
- Liquidações e documentos fiscais.
- Anulações e estornos.
- Restos a pagar.

RECEITAS
- Classificação e previsão.
- Lançamento e reconhecimento, quando aplicável.
- Arrecadação.
- Distribuição por fontes.
- Deduções, restituições e estornos.
- Receitas próprias decorrentes de retenções.
- Consultas e acompanhamento da arrecadação.

TESOURARIA
- Contas bancárias e disponibilidades.
- Programação e ordens de pagamento.
- Pagamentos e respectivos retornos.
- Transferências financeiras.
- Conciliação bancária.
- Consultas por conta, fonte, entidade e período.

EXTRAORÇAMENTÁRIO
- Ingressos e dispêndios.
- Consignações e retenções.
- Recolhimentos.
- Saldos a recolher de exercícios anteriores.
- Estornos e conciliações.

CONTRATAÇÕES
- Demandas e planejamento da contratação.
- Licitações e contratações diretas.
- Fases, documentos, responsáveis e decisões.
- Resultados e vínculos externos.
- Contratos e alterações.
- Ordens de fornecimento e serviço.
- Fiscalização, medições, recebimentos e glosas.

PESSOAL E FOLHA
- Servidores, beneficiários e vínculos.
- Cargos, funções, lotações e centros de custo.
- Eventos, rubricas e parâmetros.
- Tipos de folha exigidos.
- Cálculo, conferência, fechamento e contracheques.
- Encargos e consignações.
- Apropriação e acompanhamento do pagamento.

PATRIMÔNIO E ESTOQUE
- Bens e materiais.
- Entradas e incorporações.
- Localização e responsabilidade.
- Movimentações e inventários.
- Mensuração, depreciação e baixas aplicáveis.
- Integração com aquisição, contabilidade e custos.

CONTABILIDADE
- Plano de contas e configurações contábeis.
- Lançamentos e documentos de origem.
- Diário, Razão e Balancete.
- Conciliações e conferências.
- Demonstrações contábeis.
- Abertura, encerramento e transporte de saldos.
- Consolidação e operações intragovernamentais.
- Custos.

PRESTAÇÃO DE CONTAS
- Relatórios fiscais e demais demonstrativos exigidos.
- SAGRES/TCE-PB.
- Integrações e arquivos.
- Validações, protocolos e retornos reais.
- Documentos e histórico das remessas.

CADASTROS E ADMINISTRAÇÃO
- Ente, entidades, UGs, órgãos e unidades.
- Credores e fornecedores.
- Classificações, fontes e parâmetros.
- Responsáveis, permissões e atos.
- Importações e histórico de operações.

Ajuste os agrupamentos ao modelo existente quando necessário,
preservando a facilidade de localização.

Não crie módulos duplicados para atender a esta nomenclatura.
Uma mesma operação pode ter atalhos em diferentes áreas, mas deve usar
o mesmo serviço, as mesmas permissões e os mesmos fatos.

2. CONTEXTO SEMPRE VISÍVEL

Mantenha visíveis:
ente/entidade, exercício, período e situação do período.

Diferencie proposta em elaboração de orçamento aprovado e execução.

Ao mudar exercício ou entidade:
- descarte seleções incompatíveis;
- preserve filtros compatíveis;
- avise sobre edição não salva;
- revalide o contexto no servidor.

A troca de aba não pode perder silenciosamente o contexto do trabalho.
A mudança de exercício não pode copiar fatos ou transportar saldos.

3. PADRÃO DE OPERAÇÃO DAS TELAS

Listagens devem oferecer:
busca, filtros pertinentes, situação, valores, totais com abrangência
identificada e acesso ao detalhe.

No detalhe, use uma estrutura consistente:
- resumo;
- dados e itens;
- documentos;
- operações relacionadas;
- efeitos e saldos;
- histórico.

Mostre as próximas ações permitidas conforme estado e autorização.
Quando faltar requisito, explique o que falta e ofereça acesso ao
cadastro ou documento correspondente, quando o usuário tiver permissão.

Use nomes que o contador reconhece.
Não exponha códigos de módulos, cláusulas de TR ou textos de engenharia.

4. EXECUÇÃO ENTRE AS FASES

Complete e opere estas cadeias:

A. Planejamento:
importar 2026 → preparar proposta 2027 → ajustar receitas e dotações
→ conferir → gerar documentos → registrar aprovação.

B. Despesa:
dotação → reserva → autorização → empenho → liquidação
→ retenções → pagamento → conciliação.

C. Contratação:
demanda → dotação/reserva → procedimento → resultado
→ contrato → entrega/medição → liquidação → pagamento.

D. Receita:
classificação → previsão → reconhecimento quando aplicável
→ arrecadação → fonte → conciliação → relatório.

E. Folha:
cadastro e vínculo → eventos → cálculo → conferência → fechamento
→ apropriação → pagamento → retenções/encargos → custos.

F. Patrimônio:
aquisição → recebimento → incorporação → responsabilidade
→ movimentação/mensuração → baixa.

G. Encerramento:
conferências → tratamento das pendências → restos e obrigações
→ encerramento → abertura e transporte autorizados.

Utilize as etapas e regras efetivamente aplicáveis a cada caso.
Não force toda operação a passar por fases que não lhe correspondem.

5. PARTICULARIDADES DA CONTABILIDADE PÚBLICA

Confira no código e nas fontes oficiais aplicáveis:
- relação entre planejamento, autorização orçamentária e execução;
- separação entre saldo de dotação e disponibilidade financeira;
- classificações e vinculações de recursos;
- efeitos orçamentários, patrimoniais e de controle;
- estágios da receita e da despesa;
- ingressos e dispêndios extraorçamentários;
- restos a pagar e obrigações entre exercícios;
- operações entre entidades e consolidação;
- demonstrativos e prestação de contas.

Não adapte um fluxo empresarial genérico apenas trocando os rótulos.
Não invente regra municipal, conta contábil ou parâmetro normativo.

6. RASTREABILIDADE PARA O CONTADOR

Permita navegar nos dois sentidos:

relatório ↔ lançamento ↔ documento ↔ operação de origem.

Da dotação, abrir reservas, empenhos e contratações.
Do contrato, abrir medições, liquidações e pagamentos.
Do pagamento, abrir retenções e lançamento contábil.
Da folha, abrir obrigação, pagamento e memória.
Da receita, abrir arrecadação, fonte e conciliação.

Exiba os efeitos persistidos nos saldos.
Não calcule na tela um resultado diferente daquele usado no serviço
ou no relatório.

7. PERGUNTAS ABERTAS COMO VERIFICAÇÃO

Um auxiliar deve atuar como contador avaliador e solicitar operações
em ordem variável, usando registros e valores diferentes.

Exemplos:
"Crie 2027 com base no orçamento atualizado de 2026."
"Mostre por que essa ação difere das fichas."
"Reserve essa dotação para uma contratação."
"Liquide apenas parte do empenho."
"Mostre o que ainda falta pagar."
"Estorne e confira o saldo."
"Localize a origem desse valor no balanço."
"Mostre a folha chegando à tesouraria."
"Mostre o arquivo e o retorno real do Tribunal."

Execute pela interface com perfil compatível com o trabalho.
Não valide tudo exclusivamente como administrador.

Se precisar de SQL ou script para completar uma ação normal,
considere a jornada incompleta e construa a entrada que falta.

8. DISCIPLINA DE ENTREGA

Você será o único escritor e integrador.
Use até dois auxiliares de análise e revisão.
Mantenha a árvore unificada e preserve trabalho existente.

Verifique primeiro o que já funciona e reutilize suas evidências.
Execute testes dirigidos às alterações e consumidores afetados.
Não rode suites completas ou portões integrais.

Percursos com escrita somente na 3011.
Prepare a atualização da 3010 sem executá-la antes da janela autorizada.
Sem push ou transmissão oficial.

Entregue por unidade funcional:
- onde o contador acessa;
- quais operações consegue realizar;
- quais efeitos foram verificados;
- qual percurso foi executado;
- qual dependência externa permanece.

Comece pela navegação integrada e pelo planejamento 2026 → 2027.
Em seguida, complete as transições para execução, contratação
e pagamento, mantendo as demais frentes da ordem anterior.

O trabalho termina quando as capacidades aplicáveis estiverem operáveis
e verificadas, ou quando restarem dependências externas precisamente
identificadas. Um menu completo, sozinho, não encerra esta ordem.
