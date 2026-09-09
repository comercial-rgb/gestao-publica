# APRESENTAÇÃO POC — PASSO A PASSO · Pregão 330/2026

**Cada passo é autocontido: NAVEGUE → CLIQUE → APONTE → FALE.**
**Nunca dependa de aba pré-aberta: se perder, digite a URL.**

> **Revisão de 20/07/2026.** Cada caminho de clique, rótulo de botão e número deste documento foi
> conferido contra o sistema rodando, com login real. O que não existia foi construído; o que o
> roteiro anterior afirmava e não era verdade está corrigido e **marcado com ⚠️ CORRIGIDO**.
>
> **O que foi executado de verdade, e não apenas lido no código:** a recusa do usuário restrito e o
> registro dela na auditoria (passo 10); a importação da folha com os 25 fatos, a recusa de
> duplicidade e o arquivo inválido (passo 20); a simulação do Captura e a comparação com o TCE
> (passo 21); a variante com erro proposital e a correção (passos 6 e 7); e os **15 PDFs**, todos
> abertos e conferidos byte a byte — os 15 trazem `SHA-256` e a frase *"documento não assinado
> digitalmente — assinatura ICP-Brasil pendente de certificado"*.

---

## CREDENCIAIS

| Papel | Usuário | Senha |
|---|---|---|
| Administrador | `admin@cg.pb.gov.br` | `h7DMDqYJCwR-Tcbbu4T_GdxqMTrpeK34` |
| Operador restrito (passo 10) | `operador.poc@cg.pb.gov.br` | `OperadorPOC#2026` |

O operador restrito tem **uma única permissão**: `EMPENHAR`, e só na unidade `99001`. Não tem
nenhuma permissão de administração.

---

## ANTES DE COMEÇAR — 1 HORA ANTES (obrigatório)

```bash
# 1. Postgres de pé
docker start pg-siafic

# 2. Compilar e subir o servidor de produção
npm run build
npx next start -p 3000

# 3. EM OUTRO TERMINAL — a conferência completa. Ela é o porteiro da POC.
npm run poc:conferir
```

`poc:conferir` faz login de verdade, abre **todas** as telas do roteiro, confere que cada uma tem
dado, que cada botão que você vai clicar existe, e que a contingência está atualizada. Ele termina
com **✅ PODE COMEÇAR** ou **🛑 NÃO INICIAR** seguido do comando exato para corrigir cada problema.

**Se der 🛑, não comece.** Rode o que ele mandar e rode-o de novo.

Depois disso:
1. Segundo navegador (Edge) logado como `operador.poc@cg.pb.gov.br`.
2. Aba anônima em `/transparencia/demonstrativos`.
3. Explorer aberto em `CONTINGENCIA/` e em `docs/poc-fixtures/`.
4. Terminal livre para o passo 6.

---

## OS PERÍODOS DA MASSA — decore isto ⚠️ CORRIGIDO

O roteiro anterior anunciava períodos errados. A massa tem movimento **exatamente** nestes 16 dias:

| Julho | Agosto | Setembro |
|---|---|---|
| **05** receita 80.000 | **05** empenho 20.000 | **10** empenho 10.000 |
| **10** empenho 50.000 | **07** liquidação | **12** liquidação |
| **12** liquidação | **08** pagamento | **14** pagamento + **retenção ISS 500** |
| **14** pagamento | | **20** recolhimento ISS 300 |
| **15** transferência entre contas | | **22 · 24 · 25 · 28** fila do art. 141 |

**Meses com movimento: julho, agosto e setembro de 2026. Só esses três.**

> ⚠️ **Não anuncie outubro nem novembro.** Outubro tem movimento **patrimonial** e novembro tem a
> **folha**, mas nenhum dos dois gera fato diário exportável para o SAGRES: se a Comissão escolher
> um desses meses, o pacote sai vazio. A folha de novembro só passa a existir **depois** do passo 20,
> porque é a importação ao vivo que a cria.

**Ao pedir a escolha, ofereça: "julho, agosto ou setembro".**

## FOLHA DE DADOS (os números que você vai apontar)

Receita 05/07 = 80.000 · Cadeia 1 (10→14/07) = **50.000** · Cadeia 2 (05→08/08) = 20.000 ·
Cadeia 3 setembro = **10.000, retenção ISS 500, recolhido 300, saldo 200** ·
Patrimônio = móvel 50k + imóvel 200k→**220k** (reavaliação) · Folha = **5 servidores, 10 retenções** ·
Decreto = 5.000 supl + 5.000 anul (mesma fonte) · Divergência TCE = 50.000,00 × 50.000,**50** ·
Fila art. 141 = **8.000 + 4.500 = 12.500** · CMD = **12.500/mês** · MBA = **25.000/bimestre**.

## ABERTURA (de pé, 30s)

> "Bom dia. A demonstração usa exclusivamente dados sintéticos da Prefeitura Modelo — POC.
> Mostraremos geração nos formatos configurados, validações locais, integridade dos pacotes e os
> fluxos técnicos e modulares, na ordem do Termo de Referência. Quando houver integração externa,
> indicaremos se é simulação ou integração preparada para credencial. Não haverá transmissão ao TCE
> nesta POC — portanto não haverá protocolo, recibo ou aceite externo."

---

# PARTE I — TÉCNICOS

### PASSO 1 · Ambiente e autenticação
**NAVEGUE:** URL `/`
**APONTE:** topo direito (**EXERCÍCIO 2026** · **UNIDADE Consolidado (ente)**) → rodapé da barra
lateral (`admin@cg.pb.gov.br` · **Autenticado**) → e **apenas os dois primeiros cards**:
**DESPESA DO EXERCÍCIO** (92.500,00 · liquidado 92.500,00 · pago 80.000,00) e
**RECEITA CORRENTE LÍQUIDA** (80.000,00).

> ⚠️ **Os outros três cards** (Saúde, Educação, Pessoal) dizem **"sem movimento no período"**.
> Não passe a mão pelos cinco: aponte os dois com número.
**FALE:** "Ambiente autenticado, perfis individuais, ações auditadas. Exercício 2026, dados 100% sintéticos."

### PASSO 2 · A Comissão escolhe dia e mês
**NAVEGUE:** menu lateral **Integrações** → card **SAGRES** (`/integracoes/sagres`)
**APONTE:** o card **"Competência a gerar"** no topo — o campo de data, o campo de mês, e as duas
fileiras de atalhos: **`DIAS COM MOVIMENTO NA BASE (16)`** e **`MESES COM MOVIMENTO NA BASE (3)`**,
cada atalho com a contagem real do que há naquele dia.
**FALE:** "Estes períodos não são uma lista escrita à mão: o sistema os descobre do próprio banco a
cada carregamento. A massa tem movimento em julho, agosto e setembro de 2026. Peço que a Comissão
escolha **um dia** para o Diário e **um mês** para o Mensal."
**ANOTE** na folha: dia ______ · mês ______.

> Se escolherem um dia sem movimento, **não desconverse**: a tela mostra um aviso dizendo que os
> arquivos daquele dia saem com **0 registro**, e que isso é correto — o arquivo é gerado vazio,
> nunca omitido. Aponte o aviso e diga exatamente isso.

### PASSO 3 · SAGRES Diário ao vivo ⚠️ o botão NÃO se chama "Aplicar"
**CLIQUE:** no campo de **data**, escolha o dia da Comissão → botão **"Gerar para esta competência"**.
**APONTE:** a lista de arquivos com a **contagem de registros** → o badge **"Layout SAGRES 2026 v1.1"**
→ o banner **"Formato oficial gerado e validado localmente"**, cuja terceira linha diz:
> ⚠ **Transmissão externa não realizada.** Esta tela não fala com o TCE: não há recibo, protocolo nem aceite.

**FALE:** "SAGRES Diário do dia escolhido — formato oficial gerado e validado localmente, em tempo de execução."

> ⚠️ **ARMADILHA:** o atalho de **dia** preserva o mês que já estava selecionado (a URL fica
> `?dia=…&mes=…`). Se a Comissão pedir setembro inteiro, **mexa nos dois campos** — senão a
> competência mensal continua no mês anterior e você mostra o mensal errado.

**PLANO B:** Explorer → `CONTINGENCIA/sagres/diario/<dia>/` → "pré-gerado como contingência para o
mesmo período; não o apresento como geração deste instante."

### PASSO 4 · Prévia e régua de posições ⚠️ CORRIGIDO
> **Não há o que clicar:** todas as prévias já vêm abertas na carga da tela, uma por arquivo.
> E **escolha um arquivo que tenha registro**: no dia 14/09, `Empenhos.txt` tem **0** — use
> **`Pagamentos.txt`** (1), **`Retencao.txt`** (1) ou **`CadastroContaBancaria.txt`** (2).

**APONTE:** no card do arquivo escolhido, a **régua de posições acima do bloco** (duas linhas:
dezenas e unidades) → conte as **posições 1 a 6** → é o **código da Unidade Gestora: `999001`** →
depois um valor monetário: "zeros à esquerda, vírgula decimal, exatamente como o layout exige".
**FALE:** "Inspeção posicional contra a fonte oficial versionada com manifesto SHA-256."

### PASSO 5 · Validações locais ⚠️ CORRIGIDO
> As três categorias **não estão** na seção Validações — estão no **banner do topo** da tela.

**APONTE primeiro no banner do topo:**
> ✓ Validado localmente (**obrigatoriedade, domínios oficiais e integridade referencial**).

**E DEPOIS** role até a seção **VALIDAÇÕES**, que traz o resultado:
> ✓ Nenhuma violação — o pacote passou nas validações locais.

**FALE:** "Validação contra os arquivos oficiais do TCE-PB. Resultado limpo local **não** é aceite
externo — essa distinção é nossa política de honestidade."

### PASSO 6 · Erro proposital (variante isolada) ⚠️ CORRIGIDO
> O roteiro anterior mandava "recarregar as validações na tela". **Isso não funciona**, e por um
> motivo bom: o seed é idempotente e a variante **não pode** tocar a massa da apresentação. A
> demonstração é no terminal, em base descartável — e é isso que a torna verdadeira.

**EXECUTE no terminal:**
```bash
npm run poc:erro-proposital
```
**APONTE na tela do terminal:** o cabeçalho dizendo **"massa da apresentação: INTOCADA"** → as
**2 violações**, cada uma nomeando `arquivo`, `campo` (`codSubelementoDespesa`), `regra` (`DOMINIO`)
e `detalhe` (o subelemento `999` fora da tabela oficial, e o par elemento 39 × 999 inválido).
**FALE:** "Variante controlada com erro proposital, isolada por construção: ela roda numa base
descartável, e o comando diz isso na primeira linha. A massa principal não é tocada."

### PASSO 7 · Correção e revalidação
**APONTE:** a segunda metade da **mesma saída** — subelemento agora `040`, **✅ 0 violação**, pacote
liberado localmente.
**FALE:** "Corrigido e revalidado pelas mesmas regras, preservando o registro da ocorrência.
O comando faz os dois lados de uma vez: a rejeição e o conserto."

### PASSO 8 · ZIP + manifesto
**CLIQUE:** **"Baixar pacote (.zip + manifesto)"** → abra o ZIP no Explorer → abra `manifesto.json`.
**APONTE:** as **11 entradas** (10 `.txt` + `manifesto.json`) → um SHA-256 de arquivo → o `hashPacote`
→ e confira que ele é **o mesmo exibido na tela**.
**FALE:** "Integridade verificável por hash. Não é protocolo nem recibo — é prova de integridade local."

> ⚠️ **O nome do ZIP não muda com o mês** — os pacotes saem como
> `sagres_999001_<dia>_diario.zip`. Se você baixar dois na mesma pasta, o Windows cria `…(1).zip` e
> você pode abrir o errado ao vivo. **Baixe o segundo numa pasta limpa.**

### PASSO 9 · SAGRES Mensal ⚠️ CORRIGIDO
> Antes não havia seletor de mês nenhum — o mensal saía sempre do mês do dia. Agora é independente.

**CLIQUE:** no campo de **mês**, escolha a competência da Comissão → **"Gerar para esta competência"**.
**APONTE:** `Dotacao.txt` e `SaldoMensal.txt` com a competência escolhida → **Baixar pacote**.
**APONTE ainda:** `Retencao.txt` e `DespesaExtra.txt` — "cobertura de 10 das 13 entidades do layout".

### PASSO 10 · Usuários, perfis e segregação ⚠️ CORRIGIDO
> **Leia isto antes.** O roteiro anterior mandava abrir `/administracao` como restrito e "apontar o
> bloqueio". **Não há bloqueio de rota** neste sistema: o layout exige **sessão**, e a autorização é
> cobrada no **ato**, não na navegação. Se você prometer um bloqueio de tela, a Comissão verá a tela
> abrir e a promessa cair. A demonstração correta é mais forte: mostre a recusa **no botão**.

**NAVEGUE:** menu **Administração** → **Usuários** (`/administracao/usuarios`).
**APONTE:** os dois usuários → clique em **Perfis** (`/administracao/perfis`) → o perfil
**OPERADOR RESTRITO — POC**: **uma** permissão (`EMPENHAR`), amarrada à **UG 99001**.
**FALE:** "Sem herança: cada permissão é concedida explicitamente, e cada uma carrega o seu escopo
de unidade. A senha inicial é exibida uma única vez, no ato da criação."

**TROQUE para o Edge** (logado como `operador.poc@cg.pb.gov.br`):
**NAVEGUE:** `/administracao/usuarios` → **APONTE que a tela abre** e diga:
> "A leitura do cadastro é aberta a quem tem sessão. O controle deste sistema não é cosmético — ele
> não esconde o botão, ele **recusa o ato**. Vejam."

**CLIQUE:** no formulário "criar usuário", preencha nome e e-mail quaisquer → **Criar usuário**.
**APONTE a recusa** — *este é o texto exato que vai aparecer*:
> **ACESSO NEGADO:** o usuário "operador.poc@cg.pb.gov.br" não tem permissão para **CRIAR_USUARIO**
> no escopo do ENTE (este ato não pertence a unidade nenhuma — só uma permissão GLOBAL o autoriza).
> **o que faltou: A AÇÃO** — nenhum dos perfis dele concede CRIAR_USUARIO, em unidade nenhuma.
> **Não é escopo: é a ação.** Conceda CRIAR_USUARIO ao perfil (TR 4.56).

**FALE, apontando a última frase:** "Reparem que o sistema distingue **faltar a ação** de **faltar o
escopo**. Não é um 'acesso negado' genérico: ele diz qual das duas coisas faltou, para o
administrador conceder a permissão certa — e não a errada."

**VOLTE ao navegador principal:** Administração → **Auditoria** (`/administracao/auditoria`).
**APONTE** a linha que acabou de nascer:
> `operador.poc@cg.pb.gov.br | CRIAR_USUARIO | negado`, com data/hora e IP.

**FALE:** "A recusa é por ação, não por tela — e ela fica registrada com o autor. É o que o TR 6.1
a 6.5 cobra: quem tentou, o quê, quando, e o que o sistema respondeu."

---

# PARTE II — MODULARES

### PASSO 11 · Planejamento: QDD, CMD/MBA, reprevisão
**NAVEGUE:** menu **Planejamento** → card **QDD** (`/planejamento/qdd`).
**APONTE:** a coluna cujo cabeçalho é a chave inteira —
**Órgão›Unidade›Programa›Função›Subfunção›Ação›Fonte›CO›Natureza** — e a coluna **Dotação atualizada**
em negrito. Passe o mouse sobre a chave: o nome por extenso de cada componente aparece.
**FALE:** "A ficha só é identificável pela classificação funcional-programática inteira. A dotação
atualizada é inicial + suplementações − anulações, e é o teto contra o qual o empenho é julgado."

**NAVEGUE:** menu **Planejamento** → **CMD/MBA** (`/planejamento/cmd-mba`).
**APONTE:** os **duodécimos** — `500 | 12.500,00 ×12 | 150.000,00` → as **metas bimestrais**,
6 de **25.000,00** → e os **dois atos**: CMD **Versão 1 · Decreto POC nº 001/2026**, MBA
**Versão 1 · Decreto POC nº 002/2026** (são decretos diferentes, não um só).
**CLIQUE:** no link **"Imprimir programação e minutas de decreto"** (não existe botão chamado "PDF").

> ⚠️ **PREPARE-SE PARA UMA PERGUNTA.** Logo acima do botão há a seção **"Confronto do art. 9º —
> meta × arrecadado"** com três linhas em vermelho: `1º | 25.000,00 | 0,00 | (25.000,00) |
> Frustração — gatilho do art. 9º`. A Comissão vai ver "frustração de receita". **Resposta pronta:**
> "A massa sintética não tem arrecadação lançada nesses bimestres, então o confronto acusa
> frustração — e é assim que ele deve se comportar. A própria tela informa que a limitação de
> empenho do TR 4.43 é *opt-in por exercício* e está **desligada** aqui."
**FALE:** "O CMD reparte a despesa fixada em doze cotas; o MBA reparte a receita prevista em seis
metas. A distribuição fecha ao centavo com a LOA, e os planos são versionados: retificar é publicar
decreto novo, e a versão anterior permanece na base."

**NAVEGUE:** menu **Planejamento** → **Reprevisão** (`/planejamento/reprevisao`).
**PREENCHA** (rótulos exatos): **NATUREZA (8 DÍG.)** `11130211` · **FONTE (3 DÍG.)** `500` ·
**TIPO** Orçamentária · **AJUSTE (+/−, R$)** `10.000,00` · **MOTIVO** "reestimativa POC" → **Registrar**.
**APONTE:** a mensagem **"Reprevisão registrada."** e a linha que nasce na tabela, com
**quem registrou e quando**.

> ⚠️ **NÃO prometa "150.000 → 160.000".** Esta tela **não exibe previsão nenhuma** — nem antes nem
> depois. Ela lista os ajustes. Se você anunciar o número, vai procurá-lo na tela e não achar.
> A previsão consolidada aparece nos **Anexos 1, 3, 8 e 12**, como a própria tela explica.
>
> ⚠️ **Já existe uma reprevisão registrada** (de 20/07, do ensaio). A sua será a **segunda**.
> Use isso a favor: *"reparem que é append-only — já há um registro anterior, e o meu se soma a ele,
> sem apagar nada."*

**FALE:** "Reprevisão append-only e auditada: o ajuste não apaga a previsão original, ele se soma a ela."

### PASSO 12 · Créditos adicionais ⚠️ CORRIGIDO
> O botão não se chama "novo movimento": é **"Cadastrar decreto"**, e o formulário só aparece
> depois de clicar nele.

**NAVEGUE:** menu **Planejamento** → **Créditos adicionais** (`/planejamento/creditos-adicionais`).
**APONTE:** a lei (teto autorizado) → o decreto: suplementado **5.000** · anulado **5.000** ·
**diferença 0** → **CLIQUE** em **Imprimir decreto** (PDF).
**LEIA** o texto do topo da tela, que já enuncia a regra:
> *"Num decreto por anulação, o suplementado fecha com o anulado **por fonte** (TR 5.111)."*

**DEMONSTRE a trava:** **CLIQUE "Cadastrar decreto"** → escolha a lei `001/2026 — Suplementar ·
teto 5.000,00` → origem **"Anulação (remanejamento entre fichas)"** → monte as duas pernas
(**Suplementação (+)** e **Anulação (−)**) e faça a anulação sair de **fonte diferente** →
**"+ incluir movimento"** → **"Cadastrar decreto e lançar movimentos"** → **APONTE a recusa** →
**"Cancelar"** sem salvar.

> ⚠️ **A massa POC tem uma única ficha e uma única fonte (500).** Para a trava disparar de verdade
> é preciso haver duas fontes. Se no ensaio você não conseguir montar o cenário, **não force ao
> vivo**: aponte a regra escrita na tela e diga que ela é coberta por teste automatizado — é
> honesto e não arrisca a demonstração.
**FALE:** "Teto por lei, saldo por decreto, e a trava legal: a fonte da anulação tem de ser a mesma
da suplementação. A dotação atualizada libera empenho automaticamente."

### PASSO 13 · Empenho + Nota de Empenho
**NAVEGUE:** menu **Despesa** → **Empenhos** (`/despesa/empenhos`).
**APONTE:** as colunas empenhado / liquidado / pago / a pagar / anulações · status.
**CLIQUE:** **Emitir NE** na linha do empenho **nº 1** → o PDF abre em nova aba.
**APONTE:** o rodapé do PDF: **SHA-256** + **"não assinado — ICP pendente"**.
**FALE:** "Empenho só com saldo de dotação, e documento individual emitido pelo próprio sistema."

### PASSO 14 · Liquidação e retenção na fonte ⚠️ CORRIGIDO
> O roteiro anterior mandava apontar "bruto 10.000 · retenção 500 · líquido 9.500" na **Fila de
> pagamentos**. Esses três números **não existem naquela tela** — ela lista liquidações à espera de
> pagamento, sem coluna de retenção. Os números da retenção estão no Extraorçamentário.

**NAVEGUE:** menu **Despesa** → **Liquidações** (`/despesa/liquidacoes`).
**APONTE:** a coluna **EMPENHO** em cada linha — o vínculo à origem — e a coluna
**ATESTO (RESPONSÁVEL)**, com `Ordenador POC`. São **5 liquidações**.
> ⚠️ O número do empenho é **texto**, não link. Não tente clicar nele.

**FALE:** "A liquidação é o marco de exigibilidade: ela referencia o empenho e nomeia quem atestou."

**NAVEGUE:** menu **Financeiro** → **Extraorçamentário** (`/financeiro/extraorcamentario`).
**APONTE:** na seção **Retenções na fonte**, a linha de **14/09** — tipo **ISS**, valor **500,00**,
com as colunas **Empenho** e **Pagamento** ligando à origem.
**FALE:** "O pagamento bruto de 10.000 saiu com 500 retidos na fonte: 9.500 líquidos ao credor.
O retido não é despesa — vira receita extraorçamentária vinculada ao próprio pagamento."

### PASSO 15 · Extraorçamentário — o saldo ⚠️ CORRIGIDO
> **Não há drill clicável nesta tela.** As células "Empenho" e "Pagamento" são **texto puro**.
> Não tente clicar: o clique morre diante da Comissão. O drill navegável existe de verdade em
> **Contabilidade · Lançamentos** (passo 17), e é lá que você o demonstra.

**APONTE (mesma tela):** a seção **Saldos por consignatário** — a linha
`ISS · Municipio de Campina Grande · ingressado 500,00 · recolhido 300,00 · **saldo a repassar 200,00**`.
**APONTE** na seção **Retenções na fonte** a linha `14/09/2026 · ISS · Empenho **3** · Pagamento **3** · 500,00`
e diga: *"a retenção já nasce identificada pelo empenho e pelo pagamento que a originaram."*
**APONTE** a seção **Recolhimentos (despesa extra)**: `20/09/2026 · ISS · 300,00`.
**CLIQUE:** **Imprimir PDF**.
**FALE:** "Fail-closed: não se recolhe mais do que foi retido — 500 retidos, 300 recolhidos, 200 a
repassar. Saldo por consignatário, rastreável de ponta a ponta."

### PASSO 16 · Ordem cronológica (Lei 14.133)
**NAVEGUE:** menu **Despesa** → **Ordem cronológica** (`/despesa/ordem-cronologica`).
**APONTE:** **posição 1** — credor `98.765.432/0001-88`, empenho 10, liquidado 24/09, **8.000,00** →
**posição 2** — credor `11.222.333/0001-44`, empenho 11, liquidado 28/09, **4.500,00**.
**APONTE:** o quadro das **cinco hipóteses do §1º** — as únicas que autorizam quebra da ordem.
**SELECIONE:** no filtro **FONTE DE RECURSO** → **`Fonte 500`** (aplica sozinho, não há botão) →
depois **`Imprimir ordem (PDF)`**.
> ⚠️ **A tela não muda ao filtrar** — só existe a fonte 500 na massa, então continuam as mesmas 2
> linhas. **Vá direto ao PDF:** é nele que o recorte aparece. Não fique clicando esperando efeito.
**APONTE no PDF:** a nota **"⚠ RELATÓRIO FILTRADO: fonte de recurso 500. As demais fontes são filas
próprias e não constam deste documento."** — e o **SHA-256** do rodapé.

> ⚠️ **Sempre imprima esta com o filtro aplicado.** Sem filtro, este PDF é **byte a byte o mesmo**
> de `/despesa/pagamentos/pdf` (mesmo montador, de propósito — um documento só para o art. 141).
> Se você clicar nos dois botões sem filtro, abrirá o mesmo papel duas vezes diante da Comissão.
**FALE:** "Cada fonte é uma fila própria — elas não se disputam. A ordem é a data de liquidação.
Pagar fora da posição 1 exige justificativa prévia numa das cinco hipóteses taxativas, e quem
confere a posição é o domínio, dentro da transação. E o relatório filtrado **declara** que está
filtrado: um papel recortado que não se declara recortado engana quem o recebe."

### PASSO 17 · PCASP, lançamentos e livros ⚠️ CORRIGIDO
> O caminho mudou: o plano de contas e os lançamentos agora têm **área própria — Contabilidade**,
> e não ficam sob Relatórios.

**NAVEGUE:** menu **Contabilidade** → **Plano de contas** (`/contabilidade/plano-de-contas`).
**CLIQUE:** no filtro **"2 — Passivo e Patrimônio Líquido"**.
**APONTE a conta certa** — ⚠️ **`2.1.8.8.1.02.00 Consignacoes ISS a Pagar · credora · 200,00 C`**.
> **NÃO aponte `2.1.8.8.1.01 Consignações`**: é a conta genérica, a massa não a movimenta, e ela
> aparece com saldo **`—`**. Você acabou de anunciar "saldo a repassar 200" no passo 15 — apontar
> uma conta zerada logo em seguida desmonta o argumento. A `...02.00` é a que fecha com os 200.

**APONTE:** a coluna **Natureza do saldo** (credora, do cadastro) e, ao lado, **Natureza da
informação (derivada)** — e diga a diferença: "a primeira é do cadastro da conta; a segunda é
derivada da classe, e a de verdade vem do subsistema de cada partida."
**NAVEGUE:** menu **Contabilidade** → **Lançamentos** (`/contabilidade/lancamentos`).
**PREENCHA** o filtro: de `01/09/2026` até `30/09/2026` → **Aplicar**.
**APONTE:** as partidas abertas com **D** e **C**, o **nº de controle**, o histórico, e a soma
**ΣD / ΣC** batendo em cada lançamento.
**CLIQUE:** na coluna **Origem (drill)**, no link **"Nota de Empenho (PDF)"** → o documento abre.
**FALE:** "Partidas dobradas automáticas — os eventos já vêm prontos, sem parametrização do usuário.
E do lançamento se chega ao documento que o originou, em um clique."
**NAVEGUE:** menu **Relatórios** → **Livros** → **Balancete** (`/relatorios/livros/balancete`) →
**APONTE** débitos = créditos.

### PASSO 18 · Patrimônio
**NAVEGUE:** menu **Patrimônio** → card **Bens** (`/patrimonio/bens`).
**APONTE** a tabela **Posição patrimonial por classe**, lendo os números que estão lá:
> `Veiculos · ingressos 50.000,00 · atualizações **(1.875,00)** · final 48.125,00`
> `Edificacoes · ingressos 220.000,00 · atualizações 0,00 · final 220.000,00`
> `TOTAL · ingressos **270.000,00** · atualizações (1.875,00) · final **268.125,00**`

**APONTE** a **depreciação do móvel** como a atualização negativa de **(1.875,00)** — este é o
número vivo da tela.

> ⚠️ **Não diga "reavaliação de +20.000" apontando a coluna Atualizações do imóvel**: ela mostra
> **0,00**. A reavaliação já está embutida no ingresso de 220.000 (200.000 + 20.000). Fale da
> reavaliação pelo **valor final de 220.000**, não pela coluna.
>
> ⚠️ **A seção "Dívida consolidada por tipo" está VAZIA** — diz *"Sem dívida consolidada no
> exercício."* Não aponte em silêncio: **enuncie o zero** — *"a seção existe e declara zero: a massa
> POC não tem dívida fundada, e é o mesmo dado que alimentaria o RGF Anexo 2."*

**CLIQUE:** **Imprimir PDF**.
**FALE:** "Avaliação, reavaliação e depreciação com reflexo automático na contabilidade; a identidade
do relatório fecha na tela: 270.000 de ingressos menos 1.875 de depreciação dão os 268.125 finais."

### PASSO 19 · Conciliação bancária ⚠️ CORRIGIDO — *tela nova*
> Até esta revisão **não existia tela de conciliação**, e o card do Banco do Brasil não era
> clicável: quem seguisse o roteiro anterior ficaria procurando um link inexistente. A tela foi
> construída sobre o motor do M09, que já era testado.

**NAVEGUE:** menu **Integrações** (`/integracoes`) → card **Banco do Brasil** → **CLIQUE em
"Abrir conciliação bancária"** (ou vá direto a `/financeiro/conciliacao`).
**APONTE, de cima para baixo:**
1. o quadro de origem: **FIXTURE POC (modo MOCK)** — *"Nenhuma chamada financeira real foi feita"*;
2. os badges **origem API_BB** e **modo MOCK**, a competência do extrato e o **SHA-256 da origem**;
3. **Agência (mascarada)** e **Conta (mascarada)** — "o número completo não sai do servidor";
4. **Correspondências:** o débito de **50.000,00** de 14/07 no extrato **×** o Pagamento nº 1
   (empenho 1 · liquidação 1), conciliado;
5. **No banco e não no razão** (80.000,00 e −2.500,00) e **No razão e não no banco** (80.000,00);
6. o **Resumo**: extrato 27.500,00 · razão 30.000,00 · **diferença (2.500,00)** — e o selo
   **"amarração fecha — a diferença está inteiramente explicada pelas pendências"**.

**FALE:** "Conciliação contábil × extrato, com a diferença **inteiramente nomeada**: nenhum centavo
sem explicação. A origem é exclusiva por conta e competência — tentar importar um OFX sobre a mesma
competência é **recusado**. Essa recusa é **controle funcionando**, não falha."

> **Se perguntarem da máscara** (`12•4-0`): "é a mesma função que mascara o log da integração —
> fonte única para o que pode ser exibido. O dado completo fica no banco e não trafega para a tela."

### PASSO 20 · Importadores (folha e tributário) — *executado e conferido*
**NAVEGUE:** menu **Integrações** → card **Importadores** (`/integracoes/importadores`).
**SELECIONE** em TIPO: **Folha de pagamento** → escolha o arquivo `docs/poc-fixtures/folha-poc-2026-11.csv`
→ **CLIQUE em "Ver prévia"** (o botão chama-se assim, não "enviar").
**APONTE a prévia:** `5 linha(s)`, o badge **confirmável**, a tabela com bruto, consignações
(INSS · ISS) e líquido por servidor — e a linha do quadro: **"A prévia não grava nada."**
**CLIQUE:** **Confirmar e gerar os fatos**.
**APONTE:** o **Histórico de importações** — `folha-poc-2026-11.csv · 5 linhas · **25 fatos** ·
correlação · SHA-256`. Os 25 fatos são **5 empenhos + 5 liquidações + 5 pagamentos + 10 retenções**
(5 INSS + 5 ISS) — *conferido no banco*.
→ volte em **Despesa → Empenhos** e mostre-os na lista, com data de **novembro**.

**CLIQUE:** envie o **mesmo arquivo** de novo → "Ver prévia" → **Confirmar** → **APONTE que nada
duplicou** (a idempotência é por SHA-256 da origem; o histórico continua com **uma** importação).
**CLIQUE:** envie `docs/poc-fixtures/folha-poc-2026-11-INVALIDA.csv` → **APONTE a violação nomeada**:
> **linha 4 · campo bruto:** valor bruto "QUATROMIL" inválido

e o bloqueio: **"Corrija a origem: um arquivo com violação não é confirmável."** Note que a prévia
ainda lista as **4 linhas válidas** — o sistema mostra o que aproveitaria, mas não deixa confirmar.
**REPITA rápido** com `tributos-poc-2026-11.csv`, TIPO **Arrecadação tributária** (3 guias →
**Receita → Arrecadações**).
**FALE:** "Layout parametrizável: o mapa de colunas é configuração — o layout oficial do ente entra
na implantação sem reescrita. E o importador **nunca escreve no razão**: quem lança são os mesmos
serviços da operação manual, com as mesmas travas."

### PASSO 21 · Captura 2.0 e consulta TCE ⚠️ CORRIGIDO — *executado e conferido*
> **Não há botão de "gerar" nem de "validar".** A tela já chega com o JSON gerado e validado no
> carregamento. O roteiro anterior mandava clicar em dois botões inexistentes.

**NAVEGUE:** **Integrações** → card **Captura 2.0** (`/integracoes/captura`).
**APONTE** o quadro do topo, que já está pronto quando a tela abre:
> ✓ JSON conforme os **41 JSON Schemas oficiais** do TCE (draft 2020-12, versionados no repo com SHA-256 no manifesto).

**CLIQUE:** em **"ver JSON gerado"** de uma entidade → mostre o JSON.
**CLIQUE:** **"Simular submissão (MOCK)"**.
**APONTE:** o bloco **SIMULAÇÕES RECENTES** com o estado **`SIMULATED`** e a cadeia completa
**`DRAFT → VALIDATED_LOCAL → SUBMITTED_MOCK → SIMULATED`**, e o `simulationId`.
**LEIA em voz alta** a linha da tela: *"○ Nenhum protocolo, recibo ou aceite do TCE: isso só existe
com resposta real."*

**NAVEGUE:** card **API TCE** (`/integracoes/tce`). ⚠️ **Não há botão de consultar** — a comparação
já vem carregada.
**APONTE:** o badge **MODO MOCK** ("Retorno sintético — simulação executada") e a linha da tabela:
**`1 | 50.000,00 | 50.000,50 | DIVERGENTE`** — cinquenta centavos de diferença entre o local e o
que o "TCE" devolveu — mais o resumo `0 iguais · 1 divergentes` e o `corr:`.
**FALE:** "2026 é o ano oficial de testes do Captura 2.0 — Portaria TC 293/2025, obrigatório em 2027.
TXT e JSON são duas serializações do mesmo dado: a migração de 2027 não refaz o motor. Simulação
executada; integração preparada para credencial; transmissão externa não realizada."

### PASSO 22 · Relatórios gerenciais e fiscais
**NAVEGUE:** menu **Relatórios** → seção **Gerenciais** → **Relatórios Gerenciais** (`/relatorios/gerenciais`).
**APONTE** que são **5 linhas** sem filtro.
**SELECIONE:** **CREDOR (CPF/CNPJ)** → `12.345.678/0001-99` · **FONTE** → `500` → botão **`Filtrar`**.
**APONTE:** a tabela cai para **3 linhas**.
**CLIQUE:** **`Imprimir PDF`** → **APONTE** no PDF a nota
**"RELATÓRIO FILTRADO: credor 12.345.678/0001-99 · fonte 500"** e o SHA-256.
**CLIQUE:** **`Exportar CSV`** → o arquivo baixa como
`gerencial-empenhos-2026-credor-12345678000199-fonte-500.csv` — **abra-o** e mostre que traz o
**mesmo recorte** da tela.
**FALE:** "O filtro de credor é por CPF/CNPJ — este sistema não tem cadastro de credores, e a tela
diz isso em vez de oferecer uma busca por nome que não funcionaria. PDF e CSV saem com **o mesmo
recorte da tela** — o nome do arquivo carrega o recorte."

**NAVEGUE:** **Relatórios** → **RREO Anexo 1** → ⚠️ **troque para o 4º bimestre** (`?bimestre=4`).
**APONTE:** `RECEITAS CORRENTES | 160.000,00 previsto | 80.000,00 realizado | 50,00%`.

> 🛑 **NÃO ABRA o RGF Anexo 1 (Despesa com Pessoal): está VAZIO nos três quadrimestres** — *"Não há
> despesa de pessoal apurada"*. A massa POC não tem folha empenhada **antes** do passo 20. Se quiser
> mostrar RGF, faça-o **depois** da importação da folha, ou não mostre.
> ⚠️ **No 1º bimestre (o padrão) o RREO vem todo zerado.** Abrir sem trocar o bimestre mostra 0,00%.

**FALE:** "RREO, RGF e livros gerados automaticamente da mesma base — o padrão SIAFIC."

### PASSO 23 · Transparência pública
**TROQUE** para a **aba anônima** em `/transparencia/demonstrativos` — **aponte que não há login**
e leia a linha da tela: *"Acesso público, sem cadastro."*
**CLIQUE** em **`2026/1º bim · PDF`** → o PDF abre.
**APONTE** o rodapé: `SHA-256: 999a3fb5…` + **"documento não assinado digitalmente — assinatura
ICP-Brasil pendente de certificado"**.

> 🛑 **NÃO PROCURE BOTÃO DE CSV NESTA TELA — ele não existe.** A rota `/transparencia/demonstrativos/csv`
> responde 404. O CSV que você demonstra é o de **Relatórios Gerenciais** (passo 22).
> ⚠️ A lista tem **um** demonstrativo (RREO Anexo 1) em 12 competências — diga "o demonstrativo",
> não "os demonstrativos".
**FALE:** "Área pública por construção, LC 131. Integridade por SHA-256; a assinatura ICP-Brasil
aplica-se com o e-CNPJ do ente — insumo da contratante."

### PASSO 24 · Auditoria final
**NAVEGUE:** menu **Administração** → **Auditoria** (`/administracao/auditoria`).
**FILTRE:** no campo **RESULTADO** escolha **`negado`** → **Filtrar**.
**APONTE** a linha que volta — **a tentativa negada do operador restrito**, com usuário, data/hora,
ação, resultado, IP e o detalhe inteiro da recusa.
**LIMPE o filtro** e mostre também **`IMPORTAR_FOLHA`** (nascida no passo 20), **`REPREVISAR_RECEITA`**
(passo 11c), **`SUBMETER_CAPTURA`** (passo 21) e **`CONSULTAR_TCE`**.

> 🛑 **NÃO prometa "a geração SAGRES" na auditoria — ela não está lá, por decisão de arquitetura.**
> Gerar arquivo é **leitura pura**, não muta nada, e o censo do M16 a classifica assim; ações de
> leitura não geram linha de trilha. Se a Comissão perguntar, essa é a resposta — e é uma resposta
> boa: *"auditamos os ATOS que alteram estado. Exportar não altera; o que prova a exportação é o
> manifesto SHA-256 do pacote."* O **decreto** também não tem linha (foi criado pelo seed, não ao vivo).

**FALE:** "Tudo que ALTEROU estado nesta sala está registrado — inclusive o que o sistema recusou."

### PASSO 25 · Suporte (TR 4.20.9)
**NAVEGUE:** menu **Suporte** (`/suporte`).
**APONTE:** os três canais e a tabela de prazos por classe de chamado.
**TROQUE** para o WhatsApp Business real → abra um chamado de exemplo → mostre o e-mail de suporte
e a ferramenta de helpdesk (fila/histórico).
**FALE:** "Dúvida de operação: imediato; análise: 12h; correção de defeito: 24h; ajustes de dados:
5 dias úteis; novas funcionalidades: 5 a 45 dias por complexidade — os prazos do próprio TR. A tela
publica o compromisso; o chamado nasce e é acompanhado nas ferramentas de atendimento."

## ENCERRAMENTO (de pé, 30s)

> "Concluímos a sequência técnica e modular na ordem do Termo de Referência. Os arquivos SAGRES
> foram gerados no formato configurado e validados localmente; as integrações estão preparadas para
> credencial; nenhuma transmissão ao TCE foi realizada. Estamos à disposição da Comissão."

---

## SE PERGUNTAREM

**Transmite ao TCE?** → "Formato oficial validado localmente; a transmissão depende de credencial do
ente — arquitetura pronta, ativação na implantação."

**O TCE aceitou?** → "Não podemos afirmar aceite externo. O arquivo passou pelas regras do validador
local. O aceite só poderia ser declarado após validação no ambiente oficial do TCE."

**Esse número é um protocolo?** → "Não. É identificação local da geração. Não há protocolo porque
não houve transmissão."

**Importem a base 2025.** → "O link previsto no edital não nos foi disponibilizado. Demonstramos
massa sintética equivalente e o módulo de importação parametrizável ao vivo — a rotina seguirá
exatamente a estrutura que for disponibilizada."

**Por que o restrito conseguiu abrir a administração?** → "Porque o controle deste sistema é no
**ato**, não na aparência da tela. Esconder o botão não impede nada — a garantia é o serviço recusar
a execução e registrar a tentativa, e foi isso que a Comissão acabou de ver."

**PPA/LDO?** → "Planejamento integrado operante (LOA, fichas, QDD, CMD/MBA, reprevisão); cadastros
de PPA/LDO com anexos entram na implantação, sobre o mesmo motor."

**Por que está usando um pacote pronto?** → "Pré-gerado com a mesma massa e o mesmo período,
apresentado expressamente como contingência."

**REGRA DE OURO:** nunca responder "não temos" — responder o que o sistema **tem** + como o gap se
resolve (insumo do ente / implantação).

## NUNCA

Dizer "TCE aceitou / transmitido / recibo" · prometer **bloqueio de rota** para o usuário restrito
(a trava é no ato) · anunciar outubro ou novembro como períodos SAGRES · afirmar versão de layout
sem evidência na tela · apresentar o Captura 2.0 como transmissão real em vez de `SIMULATED` ·
travar: **se uma tela falhar, frase pronta ("vou apresentar o artefato de contingência do mesmo
período") e siga para o passo seguinte.**
