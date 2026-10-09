# V38 — matriz por ID dos áudios da contadora (09/10/2026)

Uma linha por ID de `V38-audios-da-contadora.md`. O levantamento foi feito contra o código e a base fictícia local por
três agentes de leitura (execução; planejamento; tesouraria, contabilidade e prestações) e conferido por quem escreveu
as correções. Os áudios não foram ouvidos nesta máquina (não há transcritor instalado): as linhas marcadas "dúvida de
transcrição" seguem como a análise as marcou, sem suposição.

Estados: **funciona** (existe e funciona), **falha** (existe e falha), **escondido** (existe mas não é encontrável),
**falta**, **decisão** (depende de dado ou decisão do ente), **não verificado**. Instalação: **1ª leva** = corrigido e
publicado nesta rodada (commit da 1ª leva da V38); **2ª leva**, **3ª leva** e **4ª leva** = as levas seguintes; **já** = já estava em produção; **não** = não instalado.

| ID | Classe | Achado | Alteração ou justificativa | Teste / percurso | Instalação |
|---|---|---|---|---|---|
| AUD-001 | dúvida de transcrição | Não há campo de UF nem de tribunal no empenho; candidatos: "Categoria (art. 141)" e "Nº da nota (como o SAGRES recebe)" | Nada mudou; reouvir o trecho | — | — |
| AUD-002 | verificação | Empenho existe e funciona (`empenhos/actions.ts`, 82 na base) | Nada | `m05.test.ts` | já |
| AUD-003 | verificação | Liquidação existe e funciona (64 na base) | Nada | `m05.test.ts` | já |
| AUD-004 | verificação | Pagamento existe e funciona (34 na base) | Nada | `m07-retencao-calculada.test.ts` | já |
| AUD-005 | verificação | Anulação de empenho existe; o sistema diz "anular", não "estornar" | Nada | `m05-anulacao-parcial.test.ts` t1 | já |
| AUD-006 | verificação | Anulação de liquidação existe | Nada | `m05-anulacao-parcial.test.ts` t2 | já |
| AUD-007 | verificação | Anulação de pagamento existe (com retenção, só total) | Nada | `m05-anulacao-parcial.test.ts` t3, t4 | já |
| AUD-008 | melhoria | A ficha vem de um select com busca local sobre todas as fichas do recorte (1.054) | Nada nesta leva; a classificação inteira passou a aparecer ao escolher (AUD-022) | `test/ui/busca-da-ficha.test.ts` | já |
| AUD-009 | verificação | O servidor recusa ficha inexistente, exercício fechado e valor acima do disponível (também na data) | Nada; não reproduzido como defeito | `m05.test.ts:184` | já |
| AUD-010 | defeito | Log de produção do dia do teste: "Failed to find Server Action", formulário aberto durante uma publicação; nada avisava | Vigia de versão: a tela consulta `/release` e avisa para recarregar quando a versão muda; tela de erro legível com "Recarregar" | `test/versao-em-uso.test.ts` (puro) | 1ª leva |
| AUD-011 | defeito | A busca do empenho só oferecia pessoa com o papel de credor; "Pessoas e Credores" lista todas (produção: 6 pessoas, 1 com papel) | A busca oferece qualquer pessoa ativa; sem o papel, diz "cadastro sem o papel de credor"; papel encerrado e cadastro desativado não aparecem | `fornecedores-catalogo` t1d (3 mutações vermelhas); percurso v38 passo 1 | 1ª leva |
| AUD-012 | melhoria | Busca por CPF, CNPJ ou nome no próprio campo já existe (combobox) | Nada | `fornecedores-catalogo` t1d | já |
| AUD-013 | verificação | A busca tira a pontuação do documento; a falha relatada era o papel (AUD-011) | Nada | `fornecedores-catalogo` t1d (CPF mascarado) | já |
| AUD-014 | verificação | A lista e a busca leem a mesma tabela; a divergência era o filtro de papel | Resolvido por AUD-011 | idem | 1ª leva |
| AUD-015 | melhoria | O atalho de cadastro leva o documento e volta com o credor; o resto do rascunho se perde | 4ª leva: o clique em "Cadastrar este credor" guarda na aba os campos do empenho (ficha, número, valor, data, tipo, categoria, histórico, origem e vínculos; não o credor) e a volta com o credor os repõe uma vez; a origem reposta não sobrescreve os campos; rascunho com mais de 2 h, malformado ou com campo não declarado é descartado inteiro | `test/rascunho-do-formulario.test.ts` (puro, 2 mutações vermelhas); percurso v38 4ª leva passo 4 | 4ª leva |
| AUD-016 | verificação | Ordinário, global e estimativo existem; a ordem de compra impõe o tipo | Nada | `m05-tipo-do-empenho.test.ts` | já |
| AUD-017 | dúvida de transcrição | O campo é "Categoria (art. 141)": obrigatória sem contrato, herdada do contrato | Pendente: trocar o rótulo por termo de negócio; reouvir | — | não |
| AUD-018 | verificação | Vínculo com ordem de compra existe | Nada | `m11-empenho-ordem.test.ts` | já |
| AUD-019 | verificação | Vínculo com convênio existe | Nada | `m28-convenios.test.ts` | já |
| AUD-020 | verificação | Vínculo com obra existe (obrigatório no elemento 51) | Nada | `m11-medicoes-integracao.test.ts` | já |
| AUD-021 | verificação | Vínculo com dívida fundada existe (grupo 6) | Nada | `m10-divida.test.ts` | já |
| AUD-022 | melhoria | Depois de escolher a ficha só aparecia o disponível | O empenho mostra unidade, classificação funcional, natureza e fonte da dotação escolhida | tipos; percurso v38 (tela do empenho) | 1ª leva |
| AUD-023 | verificação | Fila a pagar com liquidação, anulação e estorno | Nada | `percurso-v36-a-pagar.mts` (não rodado nesta leva) | já |
| AUD-024 | decisão | Não há EFD-Reinf (série R-2000) em código; `docs/oficial` não tem o leiaute | Pendente: obter o leiaute oficial vigente; só então gerador de arquivo, sem transmitir | — | não |
| AUD-025 | decisão | Idem para a série R-4000; `CalculoDaRetencao` guarda base, alíquota e valor, sem tabela de natureza de rendimento | Pendente, evidência separada da 024 | — | não |
| AUD-026 | escondido | A retenção é informada no pagamento; a liquidação não dizia isso | A liquidação (formulário e detalhe) diz onde a retenção é informada, com link "Pagar esta liquidação, com as retenções" | percurso v38 passo 2 | 1ª leva |
| AUD-027 | escondido | O dossiê mostra as retenções sob cada pagamento; a entrada é só no pagamento | Idem AUD-026 | percurso v38 passo 2 | 1ª leva |
| AUD-028 | escondido | O select oferecia os últimos 300 documentos conferidos de qualquer emitente, e o domínio recusa emitente diferente do credor | Documento fiscal por busca, só do credor do empenho escolhido, conferido e não cancelado, com atalho para registrar | `liquidacao-documento-e-conta` t1 (2 mutações vermelhas); percurso v38 passo 2 | 1ª leva |
| AUD-029 | escondido | A chave é copiada do documento e aparece no detalhe da liquidação | Resolvido por AUD-028 (a chave aparece na busca e no detalhe) | idem | 1ª leva |
| AUD-030 | escondido | Número e série aparecem no detalhe; só 8 de 64 liquidações da base têm nota | Resolvido por AUD-028 | idem | 1ª leva |
| AUD-031 | decisão | A retenção nasce no pagamento, bruto e líquido num fato só (M07, SAGRES "Retencao" no pagamento); "retenção prevista" na liquidação não existe | Pendente: regra do TCE-PB; se vier, prévia na liquidação que preenche o pagamento sem lançar | — | não |
| AUD-032 | dúvida de transcrição | Candidatos: "Valor (R$)" e "Valor bruto do documento fiscal" (opcional; vazio assume o pago) | Reproduzir no navegador com a contadora | — | — |
| AUD-033 | defeito de preparo | A tabela do IR (IN 1.234) estava vazia na base fictícia e está vazia em produção, então o select vinha vazio | Tabelas oficiais carregadas na base fictícia (IR 9, INSS 30, ISS 200); carga em produção nesta publicação | `carregar-tabelas-da-retencao.ts` (idempotente, sha256 conferido) | 1ª leva |
| AUD-034 | escondido | O perfil fiscal do fornecedor é em Cadastros › Pessoas › pessoa (Simples, Anexo IV, dispensa de IR) | Pendente: link "Cadastrar dados fiscais" na prévia do pagamento | `m07-retencao-calculada.test.ts:301` | já |
| AUD-035 | dúvida de transcrição | Mensagens candidatas: perfil fiscal ausente; classificação da retenção do município ausente (0 em produção) | Reproduzir; a classificação é decisão do ente (`/financeiro/retencoes-proprias`) | — | — |
| AUD-036 | defeito | O bloco do IR da IN 1.234 (só pessoas jurídicas) aparecia para pessoa física; o cálculo de PF é "sem cálculo" | Para credor pessoa física o bloco some, com explicação, e o "valor informado" abre; a gravação do IR informado de PF como "IRRF_FORNECEDOR_PJ" é decisão pendente | percurso v38 passo 7 | 1ª leva (tela) |
| AUD-037 | escondido | O "valor informado" existia num bloco fechado, só para tributo "Sem cálculo" | Abre sozinho quando a prévia dá "Sem cálculo" ou o credor é pessoa física | percurso v38 passo 7 | 1ª leva |
| AUD-038 | decisão | A natureza do IR vai para `CalculoDaRetencao`; sem Reinf não alimenta nada | Depende de AUD-024/025 | — | não |
| AUD-039 | verificação | Enquadramento (Simples etc.) é o perfil fiscal da pessoa; sem perfil nada se calcula | Pendente: link na prévia (AUD-034) | `m07-calculo-da-retencao.test.ts` | já |
| AUD-040 | verificação | INSS retido vira movimento extraorçamentário com o pagamento; faltavam as tabelas na base | Tabelas carregadas (AUD-033) | `m07-retencao-calculada.test.ts:140` | 1ª leva (dados) |
| AUD-041 | verificação | IR do próprio Tesouro vira receita (guia), não consignação; exige a classificação do ente (0 em produção) | Decisão do ente em `/financeiro/retencoes-proprias`; pendente mostrar "IR retido: receita, guia nº" no dossiê | `m07-retencao-calculada.test.ts:140-176` | decisão |
| AUD-042 | verificação | ISS: receita quando o local é o município do ente; senão consignação | Idem AUD-041 | idem | decisão |
| AUD-043 | dúvida numérica | A fonte do movimento extra vem da conta bancária, não é digitada; "1869" não foi confirmado | Nada gravado | `m07-fonte-no-movimento.test.ts` | — |
| AUD-044 | verificação | Não há exclusão: Empenho, Liquidação e Pagamento estão fora do censo de UPDATE/DELETE do papel do banco | Nada | `test/papel-runtime.test.ts` | já |
| AUD-045 | verificação | Contas bancárias: `/financeiro/contas-bancarias` (4 na base) | Nada | `percurso-v36-conta-bancaria.mts` | já |
| AUD-046 | verificação | Movimentação bancária: `/financeiro/movimentacao` | Nada | `m09-movimentacao.test.ts` | já |
| AUD-047 | melhoria | A tela de conciliação dizia "exige extrato importado"; a conciliação por período abre sem extrato e declara pendências, mas não tem entrada manual de linhas do extrato | Texto da tela vazia aponta a conciliação por período, com link; a entrada manual de linhas do extrato espera decisão do ente: aceitar linha digitada como prova bancária e qual documento a sustenta (a linha do extrato é o fato que o banco informa) | `m09-conciliacao-periodo.test.ts` | 1ª leva (texto) |
| AUD-048 | verificação | Importar OFX e vincular linha a registro funciona; sem sugestão automática; o aviso "dados de demonstração" aparecia até para OFX real | O aviso só aparece para o extrato da API de demonstração | `percurso-v36-importar-extrato.mts` | 1ª leva |
| AUD-049 | verificação | API do BB: só leitura de extrato, sem credencial e sem chamador de tela | Texto da conciliação diz que a consulta direta depende de credencial e está desligada | `m17-modos` | 1ª leva (texto) |
| AUD-050 | melhoria | A base fictícia não tem conciliação concluída (1 aberta, 0 vínculos) | Pendente: concluir uma na base de demonstração | — | não |
| AUD-051 | verificação | Pagamentos efetuados: `/relatorios/pagamentos` | Nada | `m05-pagamentos-efetuados.test.ts` | já |
| AUD-052 | defeito | O movimento diário abria em "hoje", vazio | Abre no último dia com pagamento ou arrecadação | percurso v38 passo 5 | 1ª leva |
| AUD-053 | verificação | Receita mês a mês (`/relatorios/receita-mensal`) e arrecadação (`/receita/arrecadacoes`) | Nada; título a confirmar com a contadora | `m04-arrecadado-mes-a-mes` | já |
| AUD-054 | verificação | Retenções na fonte com drill ao pagamento em `/financeiro/extraorcamentario` (INSS e consignações); IR e ISS próprios são receita | Pendente mostrar os próprios no dossiê (AUD-041) | `m07-retencao.test.ts` | já |
| AUD-055 | verificação | Recolhimento em `/financeiro/extraorcamentario/recolher`, total e parcial, com link na tela do extraorçamentário | Nada | `m07-composicao-do-recolhimento.test.ts` | já |
| AUD-056 | decisão | O M07 só modela o passivo (consignações); não há "realizáveis" (ativo extraorçamentário) | Pendente: o contador define o que são e as contas; depois movimento extra de natureza ativa | — | não |
| AUD-057 | verificação | Restos a pagar: `/despesa/restos-a-pagar`; base sem inscrições | Nada | `smoke-restos-a-pagar-operacoes.ts` | já |
| AUD-058 | melhoria | Cadastro imobiliário e parâmetros tributários ficavam no menu Receitas | Aba "Tributos" (cadastro, lançamento, cobrança e certidões); Receitas fica com classificação, previsão e arrecadação | `menu-do-contador`, `navegacao-aponta-para-rota-viva`; percurso v38 passo 4 | 1ª leva |
| AUD-059 | decisão | Importar o cadastro imobiliário do sistema legado: sem formato nem canal | Pendente: exportação autorizada do legado | — | não |
| AUD-060 | melhoria | Certidões estavam no menu Receitas | Na aba Tributos, "Certidões de débitos" | idem AUD-058 | 1ª leva |
| AUD-061 | verificação | Arrecadação com conta bancária, natureza, fonte, dívida ativa; receitas de retenção em `/financeiro/retencoes-proprias` | Nada | `FormArrecadacao`; `m04` | já |
| AUD-062 | melhoria | Dívida ativa estava em "Acompanhamento" da Receita; o roteiro contábil fica na Contabilidade | Na aba Tributos; a inscrição continua nascendo do reconhecimento da receita (sem duplo reconhecimento) | idem AUD-058 | 1ª leva |
| AUD-063 | escondido | O lançamento manual existe em `/contabilidade/lancamentos`, mas o menu não dizia | Rótulo "Lançamentos, documentos de origem e lançamento manual" | `test/periodo-fechado.test.ts:162` | 1ª leva |
| AUD-064 | verificação | Reclassificar é lançamento novo (e estorno por lançamento novo); nunca edição | Nada | `lancamento-manual.ts:66-70` | já |
| AUD-065 | melhoria | A conta era digitada inteira, com os sete níveis | A conta vem da busca por código ou nome (só analíticas), no próprio lançamento | `liquidacao-documento-e-conta` t2 (1 mutação vermelha); percurso v38 passo 3 | 1ª leva |
| AUD-066 | defeito | O Diário tinha 1.423 lançamentos em 2026 e não levava ao lançamento | O número abre o lançamento | percurso v38 passo 5 | 1ª leva |
| AUD-067 | verificação | Razão existe e funciona, por conta digitada | 4ª leva: a conta pela busca (código ou nome, só analíticas, onde há movimento), com a leitura da própria tela do razão (catálogo `contas-do-razao`) | `m12-livros.test.ts`; percurso v38 4ª leva passo 1 | 4ª leva |
| AUD-068 | verificação | Balancete de verificação: `/relatorios/livros/balancete` | Nada | `m12-livros.test.ts` t3, t4 | já |
| AUD-069 | verificação | Balancete por fonte: `/relatorios/livros/balancete-por-fonte` | Nada | `m12-balancete-por-fonte.test.ts` | já |
| AUD-070 | verificação | Balanço Orçamentário (Lei 4.320) e RREO Anexo 1 são duas telas | Nada | `m12-balanco-orcamentario` | já |
| AUD-071 | verificação | Balanço Financeiro existe | Nada | `balanco-financeiro.ts` | já |
| AUD-072 | melhoria | "Anexo 14" rotulava o Balanço Patrimonial e o Demonstrativo Simplificado do RREO | Rótulo "Anexo 14 da Lei 4.320" no Balanço Patrimonial | `menu-do-contador` | 1ª leva |
| AUD-073 | verificação | DVP existe | Nada | `m12-dvp.test.ts` | já |
| AUD-074 | verificação | Dívida fundada: demonstrativo e cadastro | Nada | — | já |
| AUD-075 | verificação | Dívida flutuante existe; base sem restos | Nada | — | já |
| AUD-076 | verificação | DFC existe | Nada | `m12-dfc.test.ts` | já |
| AUD-077 | verificação | Notas explicativas existem | Nada | `m12-notas-explicativas.test.ts` | já |
| AUD-078 | decisão | MCASP 11ª ed. citado só na DMPL e nas notas; os demais citam a Lei 4.320; RREO/RGF pelo MDF 15ª | Pendente: conferir cada demonstração contra a Parte V com a contadora | — | não |
| AUD-079 | verificação | Custos: `/contabilidade/custos`; base sem apropriação | Nada | — | já |
| AUD-080 | verificação | RREO existe (19 anexos, CSV e PDF) | Grupo do menu "RREO (Siconfi)" | `menu-do-contador` | 1ª leva (rótulo) |
| AUD-081 | verificação | RGF existe | Grupo do menu "RGF (Siconfi)" | idem | 1ª leva (rótulo) |
| AUD-082 | decisão | SIOPE: leiaute CSV obtido; falta a Tabela 2 e o plano de contas do SIOPE | Pendente de dado oficial | — | não |
| AUD-083 | decisão | SIOPS: nada em código, sem leiaute | Pendente; reouvir o nome | — | não |
| AUD-084 | escondido | A MSC existia em "Arquivos para a STN e a Receita" | Menu e tela: "Matriz de Saldos Contábeis (MSC) e MANAD" | percurso v38 passo 4 | 1ª leva |
| AUD-085 | verificação | SAGRES (TCE-PB): 58 de 58 tabelas por gerador, prévia e validação; remessa real depende do Tribunal | Nada | `adapters/tribunais/tce-pb` | já |
| AUD-086 | escondido | A proposta do próximo exercício só era alcançada pelo menu e pela LDO | Botão "Preparar o próximo exercício" na LOA; relacionados no PPA, nas leis orçamentárias e nas fichas; rótulo do menu com o verbo | percurso v38 passo 4 | 1ª leva |
| AUD-087 | verificação | A execução usa as fichas geradas pela proposta efetivada; abrir o exercício só cria a linha | Nada | `m02-proposta-orcamentaria.test.ts:286` | já |
| AUD-088 | escondido | Idem AUD-086 | Idem | idem | 1ª leva |
| AUD-089 | verificação | Reajuste da receita na elaboração da proposta (percentual) | Nada; limite: um percentual só (AUD-111) | `m02-proposta-orcamentaria.test.ts:184-207` | já |
| AUD-090 | verificação | Reajuste da despesa, com opção de poupar projetos | Nada | idem `:422` | já |
| AUD-091 | verificação | Proposta e orçamento em execução são separados: proposta efetivada recusa ajuste e aponta crédito adicional | Nada | idem `:295-308` | já |
| AUD-092 | defeito | A reprevisão abria em 2026 fixo quando a URL não trazia o exercício; menu só na aba Receitas | Exercício do contexto da sessão; rótulo "Reestimativa da receita (reprevisão)"; exercício ausente na gravação é recusado | tipos; `navegacao-aponta-para-rota-viva` | 1ª leva |
| AUD-093 | melhoria | Fichas em Planejamento › "Fichas e dotações"; a proposta lista as fichas sem âncora | 1ª leva: relacionado nas fichas. 4ª leva: atalhos no topo da proposta (todas as propostas, receitas, fichas, fichas da origem), também na proposta efetivada; âncora por ficha (`#ficha-<número>`) | percurso v38 4ª leva passo 3 | 4ª leva |
| AUD-094 | verificação | "Fontes por natureza da receita": `/receita/naturezas/fontes`, configuração com tabela de leitura | Nada | `m04-fontes-da-natureza.test.ts` | já |
| AUD-095 | decisão | Dotação não prevista: antes de gerar, pela proposta; depois, ficha mais crédito especial | Antes de gerar: ficha nova na proposta (2ª leva, AUD-096). Depois de gerar continua o crédito especial | `m02-proposta-orcamentaria.test.ts` (V38 INCLUI) | 2ª leva |
| AUD-096 | falta | A proposta só ajusta linhas importadas: não cria ficha nova | 2ª leva: "Incluir ficha" na proposta (classificação pela busca, valor, motivo); a efetivação cria a ficha com o próximo número; CHECK origem-ou-nova no banco | `m02-proposta-orcamentaria.test.ts` (V38 INCLUI, EFETIVA); percurso `percurso-v38-proposta-ate-o-empenho` | 2ª leva |
| AUD-097 | verificação | A importação já deixa receitas e fichas preenchidas | Nada | `m02-proposta-orcamentaria.test.ts:184-207` | já |
| AUD-098 | dúvida de transcrição | A LDO não tem previsão de receita; as metas mudam por ato de alteração | Reouvir; depois linkar | — | — |
| AUD-099 | escondido | Dentro da LOA não havia como criar o exercício seguinte | Botão "Preparar o próximo exercício" na LOA (com e sem dados) | percurso v38 passo 4 | 1ª leva |
| AUD-100 | verificação | Ajustar valores antes de aprovar: ajuste por linha com motivo, versionado | Nada | idem `:229-246` | já |
| AUD-101 | decisão | Gerar o orçamento não exige lei sancionada com número | Pendente: decidir se exige | — | não |
| AUD-102 | verificação | A proposta só lê a origem; a prova no teste conta fichas e receitas de 2026 | Pendente: teste comparando somas e razão de 2026 antes e depois | idem `:281-283` | já |
| AUD-103 | falta | Não há prévia do que a importação vai copiar nem bloco "o que veio e o que não veio" | 3ª leva: "Ver o que vai ser importado" antes de criar (o que vem de quanto a origem tem, totais da lei, da partida e com reajuste, o que fica de fora, o que vai sem reajuste, o que chega sem valor, deduções sem tipo, a recusa que o ato daria, o que nunca vem); na proposta criada, o bloco "o que veio e o que não veio" | `m02-proposta-orcamentaria.test.ts` (V38 PRÉVIA DA IMPORTAÇÃO: prévia igual ao ato; resumo puro N=2); percurso | 3ª leva |
| AUD-104 | falta | LDO: criar existe; importar/copiar a anterior não | Pendente (`IMPORTACAO-DE-PECA-ANTERIOR`), com decisão do ente: quais blocos da LDO anterior copiar (prioridades, riscos, renúncias, metas) e como deslocar os anos das metas; o rito (envio, protocolo, sanção) nunca se copia | — | não |
| AUD-105 | escondido | Criar a LOA do exercício é a proposta; não era alcançável da LOA | Idem AUD-099 | idem | 1ª leva |
| AUD-106 | decisão | PPA: criar existe; importar não; o PPA é quadrienal | Pendente: decidir se "importar" é copiar o PPA anterior como base do novo quadriênio | — | não |
| AUD-107 | verificação | Par origem/destino é livre (destino posterior à origem); testado só 2026 para 2027 | 2ª leva: o percurso aceita `PERCURSO_ORIGEM` e rodou 2027 → 2028 e 2028 → 2029 na base fictícia | percurso `percurso-v38-proposta-ate-o-empenho` | 2ª leva |
| AUD-108 | verificação | Nenhum percurso segue de "orçamento gerado" até empenhar no exercício seguinte | 2ª leva: percurso elaborar → incluir → reajustar → abrir exercício → efetivar → empenhar na ficha nova | `percurso-v38-proposta-ate-o-empenho.mts` | 2ª leva |
| AUD-109 | falta | A proposta não inclui receita nova | 2ª leva: "Incluir receita" (natureza e fonte pela busca, tipo, valor, motivo); dedução recusada nomeando; repetição recusada | `m02-proposta-orcamentaria.test.ts` (V38 INCLUI); percurso | 2ª leva |
| AUD-110 | falta | A proposta não inclui ficha nova | 2ª leva, com AUD-096 | idem | 2ª leva |
| AUD-111 | falta | O percentual da receita é um só, aplicado ao criar a proposta, sem recorte nem prévia | 2ª leva: reajuste em lote com recorte (lado, fonte, unidade, prefixo da natureza, tipo da ação ou da receita), prévia que não grava e aplicação com um ajuste por linha | `m02-proposta-orcamentaria.test.ts` (V38 REAJUSTA, `linhasNoRecorte` pura); percurso | 2ª leva |
| AUD-112 | falta | Idem para a despesa | 2ª leva, o mesmo reajuste com lado DESPESA | idem | 2ª leva |
| AUD-113 | verificação | Ajuste por linha existe; "realocar entre linhas" com total preservado não | 3ª leva: "Realocar entre linhas" (tirar de uma e pôr noutra do mesmo lado, num ato; motivo e nome da outra linha no histórico das duas; recusa acima do valor da origem, mesma linha, linha alheia e dedução com receita) | `m02-proposta-orcamentaria.test.ts` (V38 REALOCA fichas e receitas; aritmética pura); percurso | 3ª leva |
| AUD-114 | verificação | Reserva ligada ao processo; contrato no empenho; folha com grupos de empenho | Nada | `m11-integracao.test.ts` | já |
| AUD-115 | defeito | A reserva do processo oferecia só as 500 primeiras fichas (554 de 1.054 inalcançáveis) | A ficha da reserva vem da busca (`fichas-para-ordem`) | `descritores-consistentes`, `molde`; percurso v38 passo 6 (base sem processo: lista aberta) | 1ª leva |
| AUD-116 | melhoria | O contrato nasce com contratado e valor digitados; não há registro do vencedor da licitação | Pendente: decisão | — | não |
| AUD-117 | verificação | Contrato no empenho existe (busca `contratos-para-empenho`) | Nada | `m11-integracao.test.ts` t1, t3, t4 | já |
| AUD-118 | decisão | Só a DDR (8.2.1.1.x) é controlada; não há roteiro nas contas de execução de contratos (8.1.2.3.x), que existem no plano | Pendente: eventos e contas por tipo de contrato, com a contadora; depois roteiro por tabela | — | não |
| AUD-119 | decisão | Idem | Idem | — | não |
| AUD-120 | decisão | Idem | Idem | — | não |
| AUD-121 | decisão | Idem; o estorno inverte o que o original fizer | Idem | — | não |
| AUD-122 | escondido | Ordem de serviço existe no contrato (emitir, medir, receber, liquidar parcelas); sem rota própria no menu | 4ª leva: "Ordens de serviço" em Licitações e no menu do contador; a lista alcança os mesmos contratos da tela do contrato (designação vigente, administrador da fiscalização ou visão financeira) e leva à ordem; a situação é uma régua só com a execução do contrato | `test/ordens-de-servico-da-sessao.test.ts` (N=2 contratos, 3 mutações vermelhas); percurso v38 4ª leva passo 2 | 4ª leva |
| AUD-123 | verificação | Ordem de fornecimento ligada à liquidação (`recebimentos-para-liquidacao`) | Nada | `recebimentos-catalogo.test.ts` | já |
| AUD-124 | decisão | O vínculo do empenho é por cadastro (processo, contrato); referência externa em texto livre não existe de propósito | Pendente: decidir se aceita referência declarada | — | não |
