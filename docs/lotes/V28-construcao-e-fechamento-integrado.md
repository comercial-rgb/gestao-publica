# V28 — ordem de construção e fechamento integrado (pedido como veio, 2026-10-01)

Pedido do usuário junto: trabalhar em conjunto com a sessão da V27 no mesmo repositório e, ao final, levar tudo para produção (o push/publicação fica para confirmação explícita no fim, porque a própria ordem abaixo e o CLAUDE.md o proíbem).

```text
ORDEM DE CONSTRUÇÃO E FECHAMENTO INTEGRADO — GESTÃO PÚBLICA

Você é o responsável pela engenharia e integração deste sistema.
Esta ordem abrange o ecossistema completo de contabilidade pública
exigido pelo TR e pelas ordens anteriores.

OBJETIVO

Concluir os módulos, motores, cadastros, telas e integrações necessários
para o operador executar os fluxos completos, com reflexo contábil
correto, rastreabilidade e demonstrações coerentes.

Não se limite a inventariar, corrigir rótulos ou escrever documentos.
Inspecione, construa, integre e execute as verificações necessárias.

Não declare o sistema completo por quantidade de tabelas, rotas,
commits ou testes. A conclusão depende da cobertura dos requisitos
e dos percursos integrados.

1. ORGANIZAÇÃO DO TRABALHO

- Leia as instruções do repositório, o checkpoint atual, o TR original
  e as ordens vigentes. Relatórios anteriores são pistas; confira o código.
- Trabalhe na árvore unificada, preservando alterações alheias,
  stash, scripts do operador e dados existentes.
- Você será o único escritor e integrador.
- Utilize até dois agentes auxiliares simultâneos:
  A: revisão funcional, aderência ao TR e identificação de fluxos incompletos;
  B: revisão dos motores, integridade contábil e evidências.
- Auxiliares não devem editar ou fazer commits na árvore compartilhada.
- Não execute suítes completas, test:fuso ou portão integral.
  Verifique somente alterações e consumidores diretamente afetados.
- Serialize processos pesados. Enquanto uma verificação aguarda recurso,
  avance em leitura, desenho e trabalho independente.
- Não mate processos de outros produtos ou sessões.
- Sem push, transmissão oficial ou publicação externa.
- Percursos com escrita somente no ambiente isolado da 3011.
- Não altere a apresentação na 3010 sem a janela do operador.
  Deixe o pacote de promoção pronto.
- Prefira migrations aditivas. Não reescreva fatos contabilizados.

2. MATRIZ ÚNICA DE CONCLUSÃO

Monte e mantenha uma matriz vinculada aos requisitos reais do TR:

requisito → capacidade → cadastro de origem → operação → autorização
→ efeito orçamentário/financeiro/patrimonial → consulta/documento
→ integração/exportação → evidência → lacuna.

Classifique cada capacidade:
- ausente;
- implementada parcialmente;
- implementada sem percurso;
- validada no ambiente isolado;
- dependente de dado ou decisão externa;
- não aplicável, com fundamento explícito.

Não marque “não aplicável” porque falta módulo.
Não marque “validado” por teste que não exercita o efeito afirmado.
Não reduza o escopo para fazer a matriz ficar verde.

Use essa matriz para construir, começando pelos elos que impedem
a execução de cadeias inteiras. Atualize-a durante o trabalho.

3. CADASTROS E CONFIGURAÇÕES QUE SUSTENTAM O SISTEMA

Confira e complete a entrada, vigência e utilização efetiva de:
- ente, entidades, UGs, órgãos e unidades orçamentárias;
- exercício, períodos e calendário aplicável;
- usuários, competências, autorizações e responsáveis;
- credores, fornecedores e dados bancários;
- contas bancárias, titularidade, contas contábeis e fontes;
- plano de contas, naturezas de receita e despesa;
- fontes/destinações e demais classificações exigidas;
- centros de custo;
- atos, normas, documentos de suporte e protocolos;
- roteiros contábeis e parâmetros versionados.

Cadastro precisa ser encontrável, utilizável e validado no servidor.
Não basta existir tabela ou formulário sem consumidor.

Diferencie UG, órgão, unidade orçamentária e centro de custo.
Não derive um do outro sem vínculo comprovado.

4. PLANEJAMENTO E ORÇAMENTO

Complete a cadeia:
PPA → LDO → proposta da LOA → LOA aprovada → dotações
→ programação financeira → execução → acompanhamento.

Confira:
- programas, ações, objetivos, metas e indicadores exigidos;
- previsão da receita e suas deduções;
- dotações com classificações e fontes corretas;
- preservação das versões e alterações;
- cronograma mensal de desembolso e metas de arrecadação;
- solicitações e aprovação de alterações orçamentárias;
- créditos adicionais, suas fontes de cobertura e limites;
- remanejamento, transposição e transferência;
- reservas/bloqueios, consumo e liberação dos saldos;
- relatórios e anexos efetivamente exigidos.

Diferencie:
saldo de dotação, reserva orçamentária, disponibilidade financeira,
programação de desembolso e provisão patrimonial.

“Provisão de recurso” não pode virar uma coluna genérica que confunde
esses conceitos ou autoriza despesa sem cobertura.

Não reconstrua o projeto original da LOA a partir da lei aprovada.
Implemente sua preservação para os próximos ciclos.

5. RECEITA COMPLETA

Execute:
cadastro/classificação → previsão → reconhecimento quando aplicável
→ arrecadação → identificação bancária → conciliação → relatórios.

Inclua, conforme o escopo:
- receitas tributárias e demais receitas;
- transferências, convênios e receitas vinculadas;
- receitas intraorçamentárias;
- deduções, restituições e estornos;
- distribuição por fontes conforme configuração aplicável;
- identificação da entidade titular;
- retenções que constituem receita própria;
- receitas extraorçamentárias, sem confundi-las com orçamentárias.

Cada recebimento deve ter origem, classificação, data, valor,
documento e vínculos exigidos.

Impeça duplicação de arrecadação pela integração bancária ou retenção.
Estorno deve preservar e referenciar o fato original.

Verifique o efeito nas disponibilidades, no razão, nos demonstrativos
e na exportação. Não ligue apurações incompletas para preencher telas.

6. LICITAÇÃO E CONTRATO ATÉ O PAGAMENTO

Complete o percurso aplicável:
demanda → identificação da dotação → reserva
→ procedimento de contratação → adjudicação/homologação
→ contrato → empenho → entrega ou medição → liquidação
→ retenções → pagamento → conciliação.

A dotação pertence ao orçamento; a licitação deve vinculá-la e consumir
a reserva conforme o modelo, sem criar saldo orçamentário fictício.

Confira:
- contratação direta e modalidades previstas;
- identificadores externos reais e documentos;
- múltiplas dotações/fontes quando cabíveis;
- itens, quantidades, preços e saldos;
- vigência, alterações contratuais e responsáveis;
- ordem de fornecimento ou serviço;
- fiscalização, recebimento, medição, glosa e parcela controversa;
- vínculo da nota fiscal e documentos da liquidação;
- prevenção de pagamento superior ao liquidado e aos saldos disponíveis;
- anulações e estornos com recomposição correta dos saldos;
- publicações e exportações exigidas, sem transmissão nesta rodada.

Não considere contrato completo se o operador não consegue seguir
até a liquidação e o pagamento pelos caminhos autorizados.

7. PESSOAL E FOLHA COMPLETA

Confira todos os tipos de folha previstos no TR, nominalmente.
Não presuma que mensal, complementar, adiantamento e 13º esgotam o escopo.

Complete os vínculos e regimes aplicáveis:
- efetivos e demais ativos;
- comissionados;
- temporários, se exigidos;
- aposentados e pensionistas sob responsabilidade do ente/RPPS.

Preserve a distinção entre quem paga, quem é beneficiário,
regime previdenciário e natureza da despesa.

O cadastro de uma pessoa não deve, sozinho, gerar despesa.
O vínculo vigente e os dados remuneratórios alimentam a simulação
ou apuração; os fatos autorizados geram obrigações e contabilização.

Confira:
- matrícula, vínculo, cargo/função, lotação, jornada e centro de custo;
- remuneração e alterações com vigência;
- rubricas, bases, incidências, vantagens e descontos;
- afastamentos, férias, desligamentos e demais eventos exigidos;
- previdência, IR, consignações e encargos patronais;
- parâmetros normativos e tabelas oficiais versionadas;
- seleção e filtros exigidos, também no cálculo;
- memória de cálculo, arredondamentos, contracheques e totais;
- complementar, retroativos e diferenças conforme regras comprovadas;
- acesso do servidor ao próprio documento;
- separação de permissões entre cadastro, cálculo, fechamento e pagamento.

Parâmetro ausente deve impedir somente a efetivação que dele depende.
Não invente alíquota, vantagem, regra previdenciária ou critério municipal.

8. FOLHA ATÉ A CONTABILIDADE E O BANCO

Execute a cadeia integral:
vínculos e eventos → cálculo → conferência → fechamento
→ apropriação contábil/orçamentária → empenho e liquidação
→ pagamento líquido → recolhimentos/destinações das retenções
→ conciliação → custos e demonstrativos.

Respeite o encadeamento efetivamente adotado pelo sistema e as regras
aplicáveis; não duplique fatos já gerados em etapa anterior.

Prove que:
- bruto, descontos, líquido e encargos reconciliam;
- despesas e obrigações são classificadas corretamente;
- não se paga novamente ao repetir comando ou retomar falha;
- folha fechada não muda por alteração posterior de cadastro;
- consignações e receitas próprias seguem suas cadeias distintas;
- encargos patronais não desaparecem do custo;
- custo por centro/unidade tem vínculo e critério demonstráveis;
- aposentados, pensionistas e ativos não são agrupados indevidamente;
- rejeição ou retorno bancário não aparece como pagamento realizado;
- fechamento da folha não é confundido com crédito bancário efetuado.

Se depender de leiaute bancário ou eSocial ausente, conclua os componentes
independentes e documente precisamente o insumo faltante.
Arquivo gerado não significa arquivo aceito ou pagamento realizado.

9. PATRIMÔNIO, ALMOXARIFADO E CUSTOS

Confira a integração aplicável:
aquisição → recebimento → entrada em estoque ou incorporação
→ localização/responsável → movimentação → inventário
→ mensuração posterior → baixa.

Diferencie material de consumo, bem permanente e serviço.
Evite reconhecer duas vezes a mesma aquisição.

Complete, conforme exigência:
- identificação e caracterização do bem;
- custo de aquisição e documentos;
- transferências e responsabilidade;
- depreciação, amortização, exaustão e demais tratamentos aplicáveis;
- ajustes e baixas com fundamento e histórico;
- integração com razão, balanço patrimonial e custos.

Não invente vida útil, valor residual ou política de mensuração.
Configurações devem ter origem e vigência.

10. TESOURARIA, EXTRAORÇAMENTÁRIO E RESTOS A PAGAR

Complete:
- programação e execução de pagamentos;
- compatibilidade de fontes e disponibilidades;
- movimentação entre contas;
- transferências entre entidades/UGs;
- ingressos e dispêndios extraorçamentários;
- retenções, recolhimentos e saldos entre exercícios;
- inscrição, liquidação, pagamento e cancelamento de restos;
- estornos e conciliação bancária.

Não trate transferência interna como nova receita externa.
Não contabilize saída de banco onde houve somente apropriação interna.
Confira passivos e controles herdados dos fatos originais.

11. CONTABILIDADE, ENCERRAMENTO E PRESTAÇÃO DE CONTAS

Todos os motores devem produzir fatos coerentes no mesmo razão.

Confira:
- partidas dobradas;
- contas analíticas válidas e vigentes;
- data da ocorrência e período;
- histórico, suporte documental e número de controle;
- dimensões e controles exigidos;
- inalterabilidade dos fatos contabilizados;
- correções por novos registros vinculados;
- prevenção de duplicidade e comportamento sob concorrência;
- abertura, encerramento e transporte de saldos;
- identificação intragovernamental e consolidação;
- Diário, Razão, Balancete e demonstrações exigidas;
- relatórios fiscais, orçamentários, financeiros e patrimoniais;
- rastreamento do total apresentado até os lançamentos de origem.

Reconcilie:
receita × arrecadação × banco;
despesa × empenho × liquidação × pagamento;
folha × obrigações × retenções × custos;
patrimônio × movimentações × razão;
restos e consignações × saldos entre exercícios.

Contas balanceadas não bastam: confira classificação, competência,
abrangência e fatos excluídos ou duplicados.

12. SAGRES E DEMAIS ENTREGAS EXIGIDAS

Reconcilie o inventário completo do leiaute aplicável, incluindo
as oito tabelas ainda reportadas como pendentes.

Cada exportador deve consumir fatos operáveis pelo sistema.
Não crie um cadastro paralelo apenas para produzir arquivo.

Confira campos, referências, formatos, totalizadores, estornos,
periodicidade e consistência entre arquivos.

Diferencie:
gerado → validado localmente → aceito pelo destinatário.
Não declare aceitação oficial sem retorno oficial.

Dependência de token, certificado ou leiaute não autoriza inventar dado
nem impede concluir as outras integrações.

13. PROVA INTEGRADA DE APRESENTAÇÃO

Prepare dados sintéticos identificados em ambiente isolado,
com configurações normativas rastreáveis.

Exercite, no mínimo:
A. Receita prevista, arrecadada, conciliada e estornada.
B. Dotação, reserva, contratação, empenho, liquidação e pagamento.
C. Contrato com execução parcial e tratamento de glosa.
D. Folha com categorias distintas, encargos, retenções e pagamento.
E. Aquisição com efeito patrimonial ou em estoque.
F. Resto a pagar atravessando exercícios.
G. Demonstrações e arquivos derivados desses mesmos fatos.

Inclua recusas relevantes, tentativa de repetição e retomada de falha.
Confirme valores persistidos e efeitos no razão, não apenas mensagens.

Não exija nova prova de partes inalteradas já suficientemente verificadas.
Uma falha de dado externo deve ficar localizada no cenário dependente.

14. ENTREGA FINAL

Entregue:
- capacidades concluídas e respectivos caminhos de operação;
- lacunas corrigidas, com efeito funcional;
- matriz de cobertura atualizada;
- evidências executadas e limitações;
- pacote de apresentação pronto e vinculado ao commit;
- pendências externas individualizadas, com responsável e insumo exato.

Não use “100%”, “completo” ou “pronto para produção” se houver
requisito aplicável sem implementação ou sem evidência suficiente.

Se houver limite de sessão, deixe checkpoint preciso:
última unidade concluída, trabalho em andamento, próximo passo
executável e verificações ainda devidas.

Comece agora pela inspeção dos fluxos existentes e avance na construção.
A prioridade é fechar cadeias operacionais inteiras e seus efeitos
contábeis, até esgotar o trabalho executável desta ordem.
```
