# Mapa de acesso — derivado das rotas reais

> ⚠️ **GERADO POR `scripts/mapa-de-acesso.ts`. Não edite à mão.** Uma tabela mantida à parte
> envelhece em silêncio: a rota nova não entra nela, e o documento passa a afirmar uma
> fronteira que o código não tem. Aqui cada linha vem do que o ARQUIVO da rota diz.

A categoria sai do portão de leitura **literalmente escrito** no arquivo — o mesmo efeito que
o guard `leitura-exige-acao` cobra. `SEM-PORTAO-DECLARADO` é achado, não lacuna do script.

Este mapa **não** diz quais CAMPOS cada rota expõe: projeção pública por allowlist de campos é
frente própria (`PROJECAO-PUBLICA-POR-CAMPO`), e afirmá-la aqui seria inventar cobertura.

Rotas encontradas: **202** (180 páginas, 22 rotas HTTP).

## Resumo por categoria

| Categoria | Rotas |
|---|---|
| OPERADOR:CONSULTAR_PATRIMONIO | 38 |
| OPERADOR:CONSULTAR_RELATORIOS (ente) | 23 |
| LANDING (só navegação; o menu é recortado no servidor) | 19 |
| OPERADOR:CONSULTAR_LICITACOES | 16 |
| OPERADOR:CONSULTAR_FOLHA | 13 |
| OPERADOR:CONSULTAR_DESPESA (por unidade) | 9 |
| OPERADOR:CONSULTAR_PLANEJAMENTO | 7 |
| PUBLICA | 6 |
| OPERADOR:CONSULTAR_DIVIDA | 6 |
| OPERADOR:CONSULTAR_FINANCEIRO (ente) | 6 |
| OPERADOR:CONSULTAR_INTEGRACOES (ente) | 6 |
| OPERADOR:CONSULTAR_PESSOAL | 6 |
| OPERADOR:CONSULTAR_PLANEJAMENTO (ente) | 5 |
| POR-REGISTRO-DONO | 4 |
| OPERADOR:CONSULTAR_TRANSFERENCIAS | 4 |
| OPERADOR:CONSULTAR_ADMINISTRACAO | 3 |
| OPERADOR:CONSULTAR_DESPESA (ente) | 3 |
| OPERADOR:CONSULTAR_PATRIMONIO (ente) | 3 |
| OPERADOR:CONSULTAR_RECEITA (ente) | 3 |
| OPERADOR:CONSULTAR_ADMINISTRACAO (ente) | 2 |
| OPERADOR:CONSULTAR_CADASTROS (ente) | 2 |
| OPERADOR:CONSULTAR_COMUNICACAO (algum escopo) | 2 |
| OPERADOR:CONSULTAR_CONTABILIDADE (por unidade) | 2 |
| OPERADOR:CONSULTAR_CONTROLE_INTERNO | 2 |
| OPERADOR:CONSULTAR_PLANEJAMENTO (por unidade) | 2 |
| TITULAR | 2 |
| OPERADOR:CONSULTAR_PROTOCOLO (algum escopo) | 2 |
| OPERADOR:CONSULTAR_SUPORTE (algum escopo) | 2 |
| MESA (cada bloco pergunta se pode, e some se não) | 1 |
| AUTOSSERVICO DA PROPRIA CONTA | 1 |
| OPERADOR:CONSULTAR_DESPESA (algum escopo) | 1 |
| OPERADOR:CONSULTAR_PATRIMONIO (algum escopo) | 1 |

## As rotas PÚBLICAS — o que um visitante sem sessão alcança

| Rota | Arquivo |
|---|---|
| `/consulta` | `app/consulta/page.tsx` |
| `/fumaca` | `app/fumaca/page.tsx` |
| `/identidade/imagem` | `app/identidade/imagem/route.ts` |
| `/login` | `app/login/page.tsx` |
| `/transparencia/demonstrativos` | `app/transparencia/demonstrativos/page.tsx` |
| `/transparencia/demonstrativos/pdf` | `app/transparencia/demonstrativos/pdf/route.ts` |

## Todas as rotas

| Rota | Tipo | Categoria de acesso |
|---|---|---|
| `/` | pagina | MESA (cada bloco pergunta se pode, e some se não) |
| `/administracao` | pagina | LANDING (só navegação; o menu é recortado no servidor) |
| `/administracao/apresentacao` | pagina | OPERADOR:CONSULTAR_ADMINISTRACAO |
| `/administracao/auditoria` | pagina | OPERADOR:CONSULTAR_ADMINISTRACAO (ente) |
| `/administracao/perfis` | pagina | OPERADOR:CONSULTAR_ADMINISTRACAO |
| `/administracao/senha` | pagina | AUTOSSERVICO DA PROPRIA CONTA |
| `/administracao/sistema` | pagina | OPERADOR:CONSULTAR_ADMINISTRACAO |
| `/administracao/usuarios` | pagina | OPERADOR:CONSULTAR_ADMINISTRACAO (ente) |
| `/cadastros` | pagina | LANDING (só navegação; o menu é recortado no servidor) |
| `/cadastros/pessoas` | pagina | OPERADOR:CONSULTAR_CADASTROS (ente) |
| `/cadastros/pessoas/[id]` | pagina | OPERADOR:CONSULTAR_CADASTROS (ente) |
| `/comunicacao` | pagina | LANDING (só navegação; o menu é recortado no servidor) |
| `/comunicacao/comunicados` | pagina | OPERADOR:CONSULTAR_COMUNICACAO (algum escopo) |
| `/comunicacao/comunicados/[id]` | pagina | OPERADOR:CONSULTAR_COMUNICACAO (algum escopo) |
| `/consulta` | pagina | PUBLICA |
| `/contabilidade` | pagina | LANDING (só navegação; o menu é recortado no servidor) |
| `/contabilidade/lancamentos` | pagina | OPERADOR:CONSULTAR_CONTABILIDADE (por unidade) |
| `/contabilidade/plano-de-contas` | pagina | OPERADOR:CONSULTAR_CONTABILIDADE (por unidade) |
| `/controle-interno` | pagina | LANDING (só navegação; o menu é recortado no servidor) |
| `/controle-interno/auditorias` | pagina | OPERADOR:CONSULTAR_CONTROLE_INTERNO |
| `/controle-interno/auditorias/[id]` | pagina | OPERADOR:CONSULTAR_CONTROLE_INTERNO |
| `/despesa` | pagina | LANDING (só navegação; o menu é recortado no servidor) |
| `/despesa/assinaturas` | pagina | OPERADOR:CONSULTAR_DESPESA (algum escopo) |
| `/despesa/empenhos` | pagina | OPERADOR:CONSULTAR_DESPESA (por unidade) |
| `/despesa/empenhos/[id]` | pagina | POR-REGISTRO-DONO |
| `/despesa/empenhos/ne` | rota-http | OPERADOR:CONSULTAR_DESPESA (por unidade) |
| `/despesa/empenhos/pdf` | rota-http | OPERADOR:CONSULTAR_DESPESA (por unidade) |
| `/despesa/liquidacoes` | pagina | OPERADOR:CONSULTAR_DESPESA (por unidade) |
| `/despesa/liquidacoes/pdf` | rota-http | OPERADOR:CONSULTAR_DESPESA (por unidade) |
| `/despesa/ordem-cronologica` | pagina | OPERADOR:CONSULTAR_DESPESA (ente) |
| `/despesa/ordem-cronologica/pdf` | rota-http | OPERADOR:CONSULTAR_DESPESA (ente) |
| `/despesa/ordens` | pagina | OPERADOR:CONSULTAR_DESPESA (por unidade) |
| `/despesa/pagamentos` | pagina | OPERADOR:CONSULTAR_DESPESA (por unidade) |
| `/despesa/pagamentos/pdf` | rota-http | OPERADOR:CONSULTAR_DESPESA (ente) |
| `/divida` | pagina | LANDING (só navegação; o menu é recortado no servidor) |
| `/divida/ativa` | pagina | OPERADOR:CONSULTAR_DIVIDA |
| `/divida/ativa/[id]` | pagina | OPERADOR:CONSULTAR_DIVIDA |
| `/divida/fundada` | pagina | OPERADOR:CONSULTAR_DIVIDA |
| `/divida/fundada/[id]` | pagina | OPERADOR:CONSULTAR_DIVIDA |
| `/divida/precatorios` | pagina | OPERADOR:CONSULTAR_DIVIDA |
| `/divida/precatorios/[id]` | pagina | OPERADOR:CONSULTAR_DIVIDA |
| `/documentos/anexos/[id]` | rota-http | POR-REGISTRO-DONO |
| `/documentos/lote` | rota-http | POR-REGISTRO-DONO |
| `/financeiro` | pagina | LANDING (só navegação; o menu é recortado no servidor) |
| `/financeiro/conciliacao` | pagina | OPERADOR:CONSULTAR_FINANCEIRO (ente) |
| `/financeiro/conciliacao/periodo` | pagina | OPERADOR:CONSULTAR_FINANCEIRO (ente) |
| `/financeiro/extraorcamentario` | pagina | OPERADOR:CONSULTAR_FINANCEIRO (ente) |
| `/financeiro/extraorcamentario/pdf` | rota-http | OPERADOR:CONSULTAR_FINANCEIRO (ente) |
| `/financeiro/lotes` | pagina | OPERADOR:CONSULTAR_FINANCEIRO (ente) |
| `/financeiro/movimentacao` | pagina | OPERADOR:CONSULTAR_FINANCEIRO (ente) |
| `/folha` | pagina | LANDING (só navegação; o menu é recortado no servidor) |
| `/folha/designacoes` | pagina | OPERADOR:CONSULTAR_FOLHA |
| `/folha/designacoes/[id]` | pagina | OPERADOR:CONSULTAR_FOLHA |
| `/folha/folhas` | pagina | OPERADOR:CONSULTAR_FOLHA |
| `/folha/folhas/[id]` | pagina | OPERADOR:CONSULTAR_FOLHA |
| `/folha/folhas/[id]/contracheque/[vinculoId]` | pagina | OPERADOR:CONSULTAR_FOLHA |
| `/folha/grupos-de-empenho` | pagina | OPERADOR:CONSULTAR_FOLHA |
| `/folha/grupos-de-empenho/[id]` | pagina | OPERADOR:CONSULTAR_FOLHA |
| `/folha/lancamentos` | pagina | OPERADOR:CONSULTAR_FOLHA |
| `/folha/lancamentos/[id]` | pagina | OPERADOR:CONSULTAR_FOLHA |
| `/folha/rubricas` | pagina | OPERADOR:CONSULTAR_FOLHA |
| `/folha/rubricas/[id]` | pagina | OPERADOR:CONSULTAR_FOLHA |
| `/folha/tabelas` | pagina | OPERADOR:CONSULTAR_FOLHA |
| `/folha/tabelas/[id]` | pagina | OPERADOR:CONSULTAR_FOLHA |
| `/fumaca` | pagina | PUBLICA |
| `/identidade/imagem` | rota-http | PUBLICA |
| `/integracoes` | pagina | OPERADOR:CONSULTAR_INTEGRACOES (ente) |
| `/integracoes/captura` | pagina | OPERADOR:CONSULTAR_INTEGRACOES (ente) |
| `/integracoes/importadores` | pagina | OPERADOR:CONSULTAR_INTEGRACOES (ente) |
| `/integracoes/sagres` | pagina | OPERADOR:CONSULTAR_INTEGRACOES (ente) |
| `/integracoes/sagres/download` | rota-http | OPERADOR:CONSULTAR_INTEGRACOES (ente) |
| `/integracoes/tce` | pagina | OPERADOR:CONSULTAR_INTEGRACOES (ente) |
| `/licitacoes` | pagina | LANDING (só navegação; o menu é recortado no servidor) |
| `/licitacoes/contratos` | pagina | OPERADOR:CONSULTAR_LICITACOES |
| `/licitacoes/contratos/[id]` | pagina | OPERADOR:CONSULTAR_LICITACOES |
| `/licitacoes/documentos-fiscais` | pagina | OPERADOR:CONSULTAR_LICITACOES |
| `/licitacoes/documentos-fiscais/[id]` | pagina | OPERADOR:CONSULTAR_LICITACOES |
| `/licitacoes/documentos-fiscais/conferencia` | rota-http | OPERADOR:CONSULTAR_LICITACOES |
| `/licitacoes/obras` | pagina | OPERADOR:CONSULTAR_LICITACOES |
| `/licitacoes/obras/[id]` | pagina | OPERADOR:CONSULTAR_LICITACOES |
| `/licitacoes/ordens-de-compra` | pagina | OPERADOR:CONSULTAR_LICITACOES |
| `/licitacoes/ordens-de-compra/[id]` | pagina | OPERADOR:CONSULTAR_LICITACOES |
| `/licitacoes/ordens-de-compra/espelho` | rota-http | OPERADOR:CONSULTAR_LICITACOES |
| `/licitacoes/pesquisas-de-precos` | pagina | OPERADOR:CONSULTAR_LICITACOES |
| `/licitacoes/pesquisas-de-precos/[id]` | pagina | OPERADOR:CONSULTAR_LICITACOES |
| `/licitacoes/processos` | pagina | OPERADOR:CONSULTAR_LICITACOES |
| `/licitacoes/processos/[id]` | pagina | OPERADOR:CONSULTAR_LICITACOES |
| `/licitacoes/solicitacoes` | pagina | OPERADOR:CONSULTAR_LICITACOES |
| `/licitacoes/solicitacoes/[id]` | pagina | OPERADOR:CONSULTAR_LICITACOES |
| `/login` | pagina | PUBLICA |
| `/patrimonio` | pagina | LANDING (só navegação; o menu é recortado no servidor) |
| `/patrimonio/almoxarifado/classes` | pagina | OPERADOR:CONSULTAR_PATRIMONIO |
| `/patrimonio/almoxarifado/classes/[id]` | pagina | OPERADOR:CONSULTAR_PATRIMONIO |
| `/patrimonio/almoxarifado/depositos` | pagina | OPERADOR:CONSULTAR_PATRIMONIO |
| `/patrimonio/almoxarifado/depositos/[id]` | pagina | OPERADOR:CONSULTAR_PATRIMONIO |
| `/patrimonio/almoxarifado/estoque` | pagina | OPERADOR:CONSULTAR_PATRIMONIO |
| `/patrimonio/almoxarifado/grupos` | pagina | OPERADOR:CONSULTAR_PATRIMONIO |
| `/patrimonio/almoxarifado/grupos/[id]` | pagina | OPERADOR:CONSULTAR_PATRIMONIO |
| `/patrimonio/almoxarifado/inventarios` | pagina | OPERADOR:CONSULTAR_PATRIMONIO |
| `/patrimonio/almoxarifado/inventarios/[id]` | pagina | OPERADOR:CONSULTAR_PATRIMONIO |
| `/patrimonio/almoxarifado/materiais` | pagina | OPERADOR:CONSULTAR_PATRIMONIO |
| `/patrimonio/almoxarifado/materiais/[id]` | pagina | OPERADOR:CONSULTAR_PATRIMONIO |
| `/patrimonio/almoxarifado/requisicoes` | pagina | OPERADOR:CONSULTAR_PATRIMONIO |
| `/patrimonio/almoxarifado/requisicoes/[id]` | pagina | OPERADOR:CONSULTAR_PATRIMONIO |
| `/patrimonio/almoxarifado/unidades` | pagina | OPERADOR:CONSULTAR_PATRIMONIO |
| `/patrimonio/almoxarifado/unidades/[id]` | pagina | OPERADOR:CONSULTAR_PATRIMONIO |
| `/patrimonio/bens` | pagina | OPERADOR:CONSULTAR_PATRIMONIO (ente) |
| `/patrimonio/bens-patrimoniais` | pagina | OPERADOR:CONSULTAR_PATRIMONIO |
| `/patrimonio/bens-patrimoniais/[id]` | pagina | OPERADOR:CONSULTAR_PATRIMONIO |
| `/patrimonio/bens/pdf` | rota-http | OPERADOR:CONSULTAR_PATRIMONIO (ente) |
| `/patrimonio/classes-de-bens` | pagina | OPERADOR:CONSULTAR_PATRIMONIO |
| `/patrimonio/classes-de-bens/[id]` | pagina | OPERADOR:CONSULTAR_PATRIMONIO |
| `/patrimonio/competencia` | pagina | OPERADOR:CONSULTAR_PATRIMONIO |
| `/patrimonio/estornos/[eixo]/[id]` | pagina | OPERADOR:CONSULTAR_PATRIMONIO |
| `/patrimonio/etiquetas` | pagina | OPERADOR:CONSULTAR_PATRIMONIO |
| `/patrimonio/localizacoes` | pagina | OPERADOR:CONSULTAR_PATRIMONIO |
| `/patrimonio/localizacoes/[id]` | pagina | OPERADOR:CONSULTAR_PATRIMONIO |
| `/patrimonio/meus-bens` | pagina | OPERADOR:CONSULTAR_PATRIMONIO (algum escopo) |
| `/patrimonio/motivos-de-baixa` | pagina | OPERADOR:CONSULTAR_PATRIMONIO |
| `/patrimonio/motivos-de-baixa/[id]` | pagina | OPERADOR:CONSULTAR_PATRIMONIO |
| `/patrimonio/parametros-de-atualizacao` | pagina | OPERADOR:CONSULTAR_PATRIMONIO |
| `/patrimonio/parametros-de-atualizacao/[id]` | pagina | OPERADOR:CONSULTAR_PATRIMONIO |
| `/patrimonio/provisoes` | pagina | OPERADOR:CONSULTAR_PATRIMONIO |
| `/patrimonio/provisoes/[id]` | pagina | OPERADOR:CONSULTAR_PATRIMONIO |
| `/patrimonio/roteiros` | pagina | OPERADOR:CONSULTAR_PATRIMONIO |
| `/patrimonio/roteiros-de-resultado` | pagina | OPERADOR:CONSULTAR_PATRIMONIO |
| `/patrimonio/roteiros-de-resultado/[id]` | pagina | OPERADOR:CONSULTAR_PATRIMONIO |
| `/patrimonio/roteiros/[id]` | pagina | OPERADOR:CONSULTAR_PATRIMONIO |
| `/patrimonio/termos` | pagina | OPERADOR:CONSULTAR_PATRIMONIO |
| `/patrimonio/termos/[id]` | pagina | OPERADOR:CONSULTAR_PATRIMONIO |
| `/patrimonio/termos/[id]/pdf` | rota-http | OPERADOR:CONSULTAR_PATRIMONIO (ente) |
| `/patrimonio/tipos-de-incorporacao` | pagina | OPERADOR:CONSULTAR_PATRIMONIO |
| `/patrimonio/tipos-de-incorporacao/[id]` | pagina | OPERADOR:CONSULTAR_PATRIMONIO |
| `/pessoal` | pagina | LANDING (só navegação; o menu é recortado no servidor) |
| `/pessoal/cargos` | pagina | OPERADOR:CONSULTAR_PESSOAL |
| `/pessoal/cargos/[id]` | pagina | OPERADOR:CONSULTAR_PESSOAL |
| `/pessoal/lotacoes` | pagina | OPERADOR:CONSULTAR_PESSOAL |
| `/pessoal/lotacoes/[id]` | pagina | OPERADOR:CONSULTAR_PESSOAL |
| `/pessoal/servidores` | pagina | OPERADOR:CONSULTAR_PESSOAL |
| `/pessoal/servidores/[id]` | pagina | OPERADOR:CONSULTAR_PESSOAL |
| `/planejamento` | pagina | LANDING (só navegação; o menu é recortado no servidor) |
| `/planejamento/cmd-mba` | pagina | OPERADOR:CONSULTAR_PLANEJAMENTO (ente) |
| `/planejamento/cmd-mba/pdf` | rota-http | OPERADOR:CONSULTAR_PLANEJAMENTO (ente) |
| `/planejamento/creditos-adicionais` | pagina | OPERADOR:CONSULTAR_PLANEJAMENTO (por unidade) |
| `/planejamento/creditos-adicionais/decreto` | rota-http | OPERADOR:CONSULTAR_PLANEJAMENTO (ente) |
| `/planejamento/ldo` | pagina | OPERADOR:CONSULTAR_PLANEJAMENTO |
| `/planejamento/ldo/[id]` | pagina | OPERADOR:CONSULTAR_PLANEJAMENTO |
| `/planejamento/ldo/[id]/anexos/[anexo]` | rota-http | OPERADOR:CONSULTAR_PLANEJAMENTO (ente) |
| `/planejamento/ppa` | pagina | OPERADOR:CONSULTAR_PLANEJAMENTO |
| `/planejamento/ppa/[id]` | pagina | OPERADOR:CONSULTAR_PLANEJAMENTO |
| `/planejamento/ppa/estrutura` | pagina | OPERADOR:CONSULTAR_PLANEJAMENTO |
| `/planejamento/ppa/programas` | pagina | OPERADOR:CONSULTAR_PLANEJAMENTO |
| `/planejamento/ppa/programas/[id]` | pagina | OPERADOR:CONSULTAR_PLANEJAMENTO |
| `/planejamento/qdd` | pagina | OPERADOR:CONSULTAR_PLANEJAMENTO (por unidade) |
| `/planejamento/reprevisao` | pagina | OPERADOR:CONSULTAR_PLANEJAMENTO (ente) |
| `/portal-do-servidor` | pagina | TITULAR |
| `/portal-do-servidor/contracheque/[folhaId]` | pagina | TITULAR |
| `/protocolo` | pagina | LANDING (só navegação; o menu é recortado no servidor) |
| `/protocolo/processos` | pagina | OPERADOR:CONSULTAR_PROTOCOLO (algum escopo) |
| `/protocolo/processos/[id]` | pagina | OPERADOR:CONSULTAR_PROTOCOLO (algum escopo) |
| `/receita` | pagina | LANDING (só navegação; o menu é recortado no servidor) |
| `/receita/arrecadacoes` | pagina | OPERADOR:CONSULTAR_RECEITA (ente) |
| `/receita/arrecadacoes/guia` | rota-http | OPERADOR:CONSULTAR_RECEITA (ente) |
| `/receita/arrecadacoes/pdf` | rota-http | OPERADOR:CONSULTAR_RECEITA (ente) |
| `/relatorios` | pagina | LANDING (só navegação; o menu é recortado no servidor) |
| `/relatorios/atualizacoes-orcamentarias` | pagina | OPERADOR:CONSULTAR_RELATORIOS (ente) |
| `/relatorios/atualizacoes-orcamentarias/pdf` | rota-http | OPERADOR:CONSULTAR_RELATORIOS (ente) |
| `/relatorios/consistencia` | pagina | OPERADOR:CONSULTAR_RELATORIOS (ente) |
| `/relatorios/designer` | pagina | OPERADOR:CONSULTAR_RELATORIOS (ente) |
| `/relatorios/gerenciais` | pagina | OPERADOR:CONSULTAR_DESPESA (por unidade) |
| `/relatorios/gerenciais/pdf` | rota-http | OPERADOR:CONSULTAR_DESPESA (por unidade) |
| `/relatorios/livros/balancete` | pagina | OPERADOR:CONSULTAR_RELATORIOS (ente) |
| `/relatorios/livros/diario` | pagina | OPERADOR:CONSULTAR_RELATORIOS (ente) |
| `/relatorios/livros/razao` | pagina | OPERADOR:CONSULTAR_RELATORIOS (ente) |
| `/relatorios/rgf/anexo1` | pagina | OPERADOR:CONSULTAR_RELATORIOS (ente) |
| `/relatorios/rgf/anexo2` | pagina | OPERADOR:CONSULTAR_RELATORIOS (ente) |
| `/relatorios/rgf/anexo3` | pagina | OPERADOR:CONSULTAR_RELATORIOS (ente) |
| `/relatorios/rgf/anexo4` | pagina | OPERADOR:CONSULTAR_RELATORIOS (ente) |
| `/relatorios/rgf/anexo5` | pagina | OPERADOR:CONSULTAR_RELATORIOS (ente) |
| `/relatorios/rgf/anexo6` | pagina | OPERADOR:CONSULTAR_RELATORIOS (ente) |
| `/relatorios/rreo/anexo1` | pagina | OPERADOR:CONSULTAR_RELATORIOS (ente) |
| `/relatorios/rreo/anexo11` | pagina | OPERADOR:CONSULTAR_RELATORIOS (ente) |
| `/relatorios/rreo/anexo12` | pagina | OPERADOR:CONSULTAR_RELATORIOS (ente) |
| `/relatorios/rreo/anexo13` | pagina | OPERADOR:CONSULTAR_RELATORIOS (ente) |
| `/relatorios/rreo/anexo14` | pagina | OPERADOR:CONSULTAR_RELATORIOS (ente) |
| `/relatorios/rreo/anexo2` | pagina | OPERADOR:CONSULTAR_RELATORIOS (ente) |
| `/relatorios/rreo/anexo3` | pagina | OPERADOR:CONSULTAR_RELATORIOS (ente) |
| `/relatorios/rreo/anexo6` | pagina | OPERADOR:CONSULTAR_RELATORIOS (ente) |
| `/relatorios/rreo/anexo7` | pagina | OPERADOR:CONSULTAR_RELATORIOS (ente) |
| `/relatorios/rreo/anexo8` | pagina | OPERADOR:CONSULTAR_RELATORIOS (ente) |
| `/sem-acesso` | pagina | POR-REGISTRO-DONO |
| `/suporte` | pagina | LANDING (só navegação; o menu é recortado no servidor) |
| `/suporte/chamados` | pagina | OPERADOR:CONSULTAR_SUPORTE (algum escopo) |
| `/suporte/chamados/[id]` | pagina | OPERADOR:CONSULTAR_SUPORTE (algum escopo) |
| `/transferencias` | pagina | LANDING (só navegação; o menu é recortado no servidor) |
| `/transferencias/consorcios` | pagina | OPERADOR:CONSULTAR_TRANSFERENCIAS |
| `/transferencias/consorcios/[id]` | pagina | OPERADOR:CONSULTAR_TRANSFERENCIAS |
| `/transferencias/convenios` | pagina | OPERADOR:CONSULTAR_TRANSFERENCIAS |
| `/transferencias/convenios/[id]` | pagina | OPERADOR:CONSULTAR_TRANSFERENCIAS |
| `/transparencia` | pagina | LANDING (só navegação; o menu é recortado no servidor) |
| `/transparencia/demonstrativos` | pagina | PUBLICA |
| `/transparencia/demonstrativos/pdf` | rota-http | PUBLICA |
