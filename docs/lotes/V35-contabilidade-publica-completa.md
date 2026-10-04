# V35 — Contabilidade pública completa para um município real

Pedido do usuário, como veio (2026-10-04, depois da publicação da V34 em produção):

> pode tomar todas decisoes com base em pesquisas para fechar e entregar completo, quero todas as fases planejamento, execucao e demais ponto da contabilidade publica feitos, para um municipio real

Contexto imediato: o usuário perguntou "tudo feito e testado ? o ecossistema de contabilidade publica esta pronto ?" e a
resposta foi que não — pendências do ente, lacuna do adiantamento, catálogo sem marcação, portão integral não rodado
desde 10/09, cópia de segurança só no servidor.

Leitura da delegação:
- Decisão técnica e normativa pode ser tomada com base em fonte oficial pesquisada (MCASP, PCASP/STN, LRF, Lei 4.320,
  leiautes TCE-PB/SICONFI), registrada com a fonte. Isso não autoriza fabricar FATO do ente (qual UG é dona de qual
  unidade, quem é titular de qual conta, números de lei municipal): fato do ente sem fonte continua pendência nomeada,
  com caminho de cadastro em tela.
- "Entregar completo" inclui a verificação de candidato (portão integral) e a publicação ao fim.

## Inventário (quatro levantamentos somente leitura, 04/10/2026)

Planejamento: PPA, LDO (8 anexos), LOA, créditos, realocação, CMD/MBA e limitação de empenho operam. Falta:
cadastro de fonte de recurso (só seed/fixture criam — bloqueia o ciclo), limite percentual de suplementação
gravado e nunca validado, vínculo PPA→LOA, 3 demonstrativos do Anexo de Metas Fiscais, publicação e audiências.

Execução: despesa, extra, tesouraria, patrimônio, almoxarifado, dívida, precatórios operam. Falta: dedução do
FUNDEB na arrecadação, restituição de receita, empenho estimativo/global com regra, ajuste para perdas da dívida
ativa, provisão de férias e 13º por competência, devolução do adiantamento conferida.

LRF e prestação: RREO 1/2/3/7, RGF 1–6, DCASP (BO, BF, BP, DVP, DFC), MSC, MANAD e SAGRES operam. Falta: DMPL,
notas explicativas, duodécimo da Câmara (CF 29-A), RREO anexos 4 e 10 (Esperança tem RPPS: UG 601078), DCA,
SIOPE, SIOPS, parecer do controle interno e prestação de contas anual.

Ente: a conta de resultado do ensaio V34 (`2.3.7.1.1.00.00`) é sintética no PCASP oficial; a correta é
`2.3.7.1.1.01.00`. A produção tem plano, administrador, LOA e licença; nenhuma outra configuração do exercício
aparece no instalador.

## Fontes oficiais obtidas nesta rodada

- `docs/oficial/stn-sof/fonte-ou-destinacao-de-recursos-2026.xlsx` — STN, "Fonte ou Destinação de Recursos 2026"
  (https://thot-arquivos.tesouro.gov.br/publicacao-anexo/28902), sha256 `271c9771…1071`, abas FR, CO e síntese.
- `docs/oficial/tce-pb/esperanca-078/unidades-orcamentarias-2026-DERIVADO.csv` — UO → UG declarado ao TCE-PB.
- `docs/oficial/tce-pb/esperanca-078/fontes-2026-DERIVADO.csv` — fontes que Esperança usa em 2026.

## Plano por ondas (ordem = o que mais impede o município de operar)

A. Implantação do ente — A1 fonte de recurso (serviço, tela, carga STN 2026 de FR e CO); A2 instalador completo
   (UO→UG pelo dado do Tribunal, roteiro de encerramento com 2.3.7.1.1.01.00, roteiro ADIANTAMENTO, seeds
   normativos, exercício); A3 virada dos controles pela norma.
B. Execução — B1 dedução do FUNDEB; B2 restituição de receita; B3 devolução do adiantamento conferida; B4 ajuste
   para perdas da dívida ativa; B5 provisão de férias e 13º; B6 empenho estimativo e global; B7 limite percentual
   de suplementação.
C. Prestação — C1 DMPL; C2 notas explicativas; C3 duodécimo da Câmara; C4 RREO anexos 4 e 10; C5 DCA; C6 SIOPE;
   C7 SIOPS; C8 parecer do controle interno e PCA ao TCE-PB; C9 publicação de PPA/LDO/LOA.
D. Verificação e entrega — portão integral no candidato, percursos, catálogo, publicação.
