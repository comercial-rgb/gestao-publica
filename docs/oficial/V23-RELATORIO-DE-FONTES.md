# Relatório de fontes normativas — coleta de 29/09/2026

Pasta: `fontes/` (este diretório). Todas as fontes foram acessadas em **2026-09-29**.
Citações entre aspas ou em bloco são **transcrição literal** do texto baixado (extraído com
`pdftotext`/conversão HTML→texto; quebras de linha normalizadas). Onde houve interpretação minha,
está marcado **[NOTA]**. Nada aqui foi tirado de resumo de mecanismo de busca.

## 0. Inventário de arquivos

| Arquivo | URL de origem | sha256 | Versão / vigência declarada no documento |
|---|---|---|---|
| `in-rfb-1234-2012.html` | https://normas.receita.fazenda.gov.br/sijut2consulta/link.action?idAto=37200 | db22c15d9b6634df9f0db2698a6db3b480b7505d7ced865533598bba58725d78 | Só um redirecionamento (JS) para normasinternet2 — sem texto |
| `in-rfb-1234-2012-multivigente.json` | https://normasinternet2.receita.fazenda.gov.br/api/consulta-externa/ato/37200/visao/multivigente (API da própria página oficial) | a83e85fa53ef6b08af9efd27c4e9e7c7d3b36c6ba0f4f8ce0a25f65adcb42641 | IN RFB 1.234/2012, DOU 12/01/2012; histórico até IN RFB 2.335/2026 (vig. 15/07/2026) |
| `in-rfb-1234-2012-compilado.txt` | derivado do JSON acima (só segmentos `compilado=true`, `tachado=false`) | — | texto vigente |
| `in-rfb-1234-anexo-I.pdf` | https://normasinternet2.receita.fazenda.gov.br/api/consulta-externa/ato/37200/anexo/41766 | 52b085909d4135585f1adc82255dfd8c1a39fd83edb56cec1de6fd8d9163feac | Anexo I (Tabela de Retenção) — sem anotação de alteração no compilado |
| `in-rfb-1234-anexo-III.pdf` | .../ato/37200/anexo/85423 | a3c2c42813ac61d78c231e2fd6287c2cd5021fc1c6b253a1ddacd691bf0be15f | Anexo III, redação da IN RFB 2.335/2026 |
| `in-rfb-2145-2023-multivigente.json` (+ `-compilado.txt`) | .../api/consulta-externa/ato/131582/visao/multivigente | b478aace7a6950c42919e4a0a878511154167dbcd466eb0370d0a7bc3caac397 | IN RFB 2.145/2023, DOU 27/06/2023 |
| `in-rfb-2110-2022-multivigente.json` (+ `-compilado.txt`) | .../api/consulta-externa/ato/126687/visao/multivigente | e53cb7912491558444af797b054f2176b7add6ec2ec2d82e37bc9b738494f072 | IN RFB 2.110/2022; alterações até IN RFB 2.321/2026 (vig. 14/04/2026) |
| `lei-8212-1991.html` (+ `.txt`) | https://www.planalto.gov.br/ccivil_03/leis/l8212cons.htm | 488824a05711c24d5a920ffb55459d48d28717af331f3f9cc09a193909d1b547 | texto compilado Planalto |
| `decreto-3048-1999.html` (+ `.txt`) | https://www.planalto.gov.br/ccivil_03/decreto/d3048.htm | bae4db2b191276a14e9175e7ae284a37b37fb9f1246ff75643745c4ec94be9ba | texto compilado Planalto |
| `lei-10666-2003.html` (+ `.txt`) | https://www.planalto.gov.br/ccivil_03/leis/2003/l10.666.htm | fd7c9552561c8f39e4dea65a45edfade8f14baf60083a1cc42a1c4dd6cd6c1f7 | — |
| `fap-govbr.html` (+ `.txt`) | https://www.gov.br/previdencia/pt-br/assuntos/previdencia-social/saude-e-seguranca-do-trabalhador/fap/fator-acidentario-de-prevencao-fap | 6dca846f7ffd8cd3c388e40f3139f9d02e0107218b989919ce80006fdec3a368 | lista portarias até "Ano 2025" |
| `portaria-mpsmf-10-2025-fap.html` (+ `.txt`) | https://www.in.gov.br/en/web/dou/-/portaria-interministerial-mps/mf-n-10-de-10-de-setembro-de-2025-658081547 | fc7fe4a70ac5cd0f041aeeaf30e84629b7bad47e1728c39fe01ddc87f4e0499c | DOU 24/09/2025, Ed. 182, S.1, p.153 — FAP calculado em 2025, vigente em 2026 |
| `esocial-leiautes-S-1.3.html` (+ `.txt`) | https://www.gov.br/esocial/pt-br/documentacao-tecnica/leiautes-esocial-v-1.3 | ef955847bb70fbc257b97961bbe287d8d96a110f78af1116c4b2d9c1e7c9a037 | "Versão S-1.3", produção desde 02/12/2024 |
| `esperanca-lc80-2017.pdf` (+ `.txt`) | https://www.esperanca.pb.gov.br/storage/content/publicacoes/quinzenario-oficial/324/arquivos/file_202006151846rBFQ.pdf | 1e95d5bdb1b3ece5c01dc56ae87b96f4b6070fe1075c735e2336c891a9ee7cbb | Quinzenário Oficial Ano I nº 014 (16 a 31/12/2017); LC 80 de 27/12/2017; "Art. 415. Este Código entra em vigor em 1º de janeiro de 2018." — ver [NOTA] no item 3 sobre marcas "(NR)" |
| `esperanca-alteracao.pdf` (+ `.txt`) | https://www.esperanca.pb.gov.br/storage/content/publicacoes/quinzenarios/2805/arquivos/69c3f567d8fdbeq5li.pdf | cac43a9ebdcd04430e567260cf3987c1535bdb36dc12f83dfcbf790087775b3a | Quinzenário nº 206, Ano VIII (16 a 31/12/2025) — contém a **LC 132, de 30/12/2025** |
| `esperanca-lc132-2025-anexoI-colunas-DERIVADO.csv` | derivado por mim do PDF acima (posição das marcas "x", via pdfjs) | d86a88823216fdf1811b305c7825470e5ddb17065f32ecc8203750c1c3de9586 | ver item 3.6 |
| `pcasp-tcepb/Pcasp_2025.xlsx` | https://tce.pb.gov.br/wp-content/uploads/2024/12/Pcasp_2025.xlsx | 52ae7c7336b27a5c2056f7e36947be8ca8c995b6fae74c891d88cab74c517ffb | Last-Modified HTTP 06/12/2024; propriedades do arquivo: criado/modificado 2024-10-29 (Marcos Uchoa) — ver item 9 |
| `pcasp-tcepb/Pcasp2024_2.xlsx` | https://tce.pb.gov.br/wp-content/uploads/2024/12/Pcasp2024_2.xlsx | c7812c37655e1cee499055705a707c6ae5342a492d36d04181e66e98f461639f | "Pcasp 2024 (26/02/24)"; modificado 2024-02-26 |
| `pcasp-tcepb/plano-contas-2022.csv` | https://sagres.gitlab.tce.pb.gov.br/sm/sm_documentacao_externa/anexos/plano-contas-2022.csv | 1da9e89fc69d778809de53f20235b10db889d50833ad0ef11b9a455cb6a9502d | layout 2022, UTF-8, `;` |
| `pcasp-tcepb/tcepb-layout-sagres-2.html` | https://tce.pb.gov.br/layout-sagres-2/ | c409faf6944cffc81cee78a39be148e1b3acfc7913ca7423f9e9428a0c2d618e | página "SAGRES Captura" com downloads por exercício |
| `siope/Manual_SIOPE_2026.pdf` (+ `.txt`) | extraído (innoextract, sem executar) do instalador oficial https://www.fnde.gov.br/webservices/castor/index.php/cas/view/nu_seq_arquivo/10971499/sg_aplicacao/SIOPE | 875c2566916edd8de31f20cb6e53b7043cba496d31d2ce88405f09c2318259d6 | Arquivo do instalador "SIOPE Ano Base 2026 (Anual) 26.0.3.6"; o PDF abre com "Tutorial – SIOPE 2024" e segue com "Manual de Orientações ... (3ª Revisão)" |
| `siope/Siope_2026_Anual-26.0.3.6.exe.bin` | mesma URL acima (Content-Disposition: `Siope_2026_Anual-26.0.3.6.exe.exe`) | a07dcff4ac0a8d6fc5c9e4c25d9e29169e215cfeae2498af86a85204ac6e4781 | instalador Inno Setup 5.3.x; **não executado** |
| `siope/Tutorial_Bsico_Siope_2024_v2.pdf` | https://www.gov.br/fnde/pt-br/assuntos/sistemas/siope/media/Tutorial_Bsico_Siope_2024_v2.pdf | 5bb3889853ceb51c306f677e8b023aab06dfbc3efa12fa1407b567656f1dff76 | "SIOPE 2024" |
| `siope/dicionario-dados-siope-2019.pdf` | https://www.fnde.gov.br/phocadownload/sistemas/siope/Manuais/DICIONARIO%20DE%20DADOS%20SIOPE%202019.pdf | 6a892024113182107749a1203e36578c160860f50c245533db9e8ad2c06909c8 | dicionário dos dados **analíticos publicados** (não é leiaute de importação) |
| `siope/rreo-municipal-estrutura.xlsx` | https://www.fnde.gov.br/phocadownload/sistemas/siope/arquivos_dados_analiticos/RREO%20Municipal.xlsx | e70c1ff5d54ac45431aa1620856958dcdafdf687e97b62c36eaa71edf87ae2be | modificado em 2018-06-15; cita Lei 11.494/2007 — **desatualizado** (pré-Lei 14.113/2020) |
| `mto-2026-versao-4.pdf` | https://www1.siop.planejamento.gov.br/mto/lib/exe/fetch.php/mto2026:mto_2026_-_versao_4_.pdf | 80fc87c6496ce160c99da26c372f181571a47ee15bd2e06a742d3ec81494ed6f | "Edição 2026 (4ª Versão) Disponibilizada em janeiro de 2026" |
| `portaria-163-2001-consolidada-103-16-v11-11-25.pdf` | https://cdn.tesouro.gov.br/.../26965_1625802/Portaria nº 163 consolidada pela Port_ 103 e Port_ 16 v_ 11_11_25 .pdf (link oficial na página "Portarias" do Tesouro) | 9dd46ea5ad9820f545b0cfaa6ca223bb79ff77c32d063fbff264d4319d432501 | Portaria Conjunta 163/2001 consolidada pela Port. Conj. STN/SOF/ME 103/2021 (e Port. 16), versão de arquivo 11/11/25 |
| `portaria-interministerial-338-2006.pdf` | http://www.orcamentofederal.gov.br/informacoes-orcamentarias/arquivos-receitas-publicas/Ptr_Intermin_338_de_260406.pdf | 24aef371ed5f70b1789e82f8c0f1c1792a004730d7332a8fe7eab3387c168052 | DOU 28/04/2006, efeitos a partir de 2007 |
| `mcasp-11a-edicao.pdf` | https://cdn.tesouro.gov.br/sistemas-internos/apex/producao/sistemas/thot/arquivos/publicacoes/51045_2434252/MCASP%20-%2011%C2%AA%20Edi%C3%A7%C3%A3o.pdf | 2a520efe8575b2dd647fd2351c6b6d6bddeb2dbfd866a0f475bf3d88b218c065 | MCASP 11ª edição, "2025" no cabeçalho (válido a partir de 2025); é a mais recente listada na página do Tesouro em 29/09/2026 |
| `sagres-book.html` | https://docs.tcepb.tc.br/books/dados-da-contabilidade | b276dd9d9aa719cb55a73e3b61185206498e357c429321e7c2cde5b7414ed642 | lista de páginas do livro |
| `sagres-v11.html` | https://docs.tcepb.tc.br/books/dados-da-contabilidade/page/versao-11-12122025 | 080bd3f69e49b539c1789eb8456e4f9cabd8646bf13ef41447cd82e20441011c | "Revisão #4", criado 2025-12-12 11:27:32 UTC, atualizado 2026-02-02 13:09:33 UTC |
| `sagres-2027-v1-em-andamento.html` | https://docs.tcepb.tc.br/books/dados-da-contabilidade/page/2027-versao-1-em-andamento | fcf8cdc500f8da3e6a9a227f374d9ec145636975c91e68e8dd50fd658ef0c8bf | "Revisão #13", criado 2026-09-21 14:54:33 UTC, atualizado 2026-09-29 16:54:09 UTC |

---

## 1. IRRF — IN RFB 1.234/2012 (texto multivigente oficial)

**Última alteração no texto consolidado:** IN RFB nº 2.335, de 13 de julho de 2026, vigência 15/07/2026
(alterou somente o **Anexo III** — modelo de declaração). Histórico completo de atos alteradores, com
data de início de vigência, conforme a própria base da RFB:

- IN RFB 1.244/2012 (12/01/2012); 1.540/2015 (08/01/2015); 1.552/2015 (03/03/2015); 1.636/2016 (10/05/2016);
  1.663/2016 (11/10/2016); 2.108/2022 (01/11/2022); **2.145/2023 (27/06/2023)**; **2.239/2024 (10/12/2024)**;
  2.257/2025 (24/03/2025 — incluiu § 3º em art. sobre FII, sem efeito para municípios); **2.335/2026 (15/07/2026 — Anexo III)**.

**[NOTA] correção de numeração pedida:** a base/percentual está nos arts. **3º e 3º-A**; a dispensa de
R$ 10,00 é o **§ 6º do art. 3º**; o art. 6º trata das declarações (Anexos II a IV); o art. 7º trata do
prazo de recolhimento.

### 1.1 Ementa (redação IN 2.145/2023)
"Dispõe sobre a retenção de tributos incidentes sobre pagamentos efetuados a pessoas jurídicas pelo fornecimento de bens ou prestação de serviços pelos órgãos da administração pública federal direta, autarquias, fundações, empresas públicas federais, sociedades de economia mista e demais entidades que menciona, e pelos órgãos da administração pública direta dos estados, do Distrito Federal e dos municípios, inclusive suas autarquias e fundações."

### 1.2 Art. 1º (redação IN 2.145/2023, vig. 27/06/2023)
"Art. 1º A retenção de tributos incidentes sobre pagamentos efetuados a pessoas jurídicas pelo fornecimento de bens ou prestação de serviços pelos órgãos da administração pública federal direta, autarquias, fundações, empresas públicas federais, sociedades de economia mista e demais entidades das quais a União, direta ou indiretamente, detenha a maioria do capital social sujeito a voto, e que recebam recursos do Tesouro Nacional e estejam obrigadas a registrar sua execução orçamentária e financeira no Sistema Integrado de Administração Financeira do Governo Federal (Siafi), obedecerá ao disposto nesta Instrução Normativa."

### 1.3 Art. 2º §§ aplicáveis a municípios por remissão do art. 2º-A § 1º
- "§ 1º A retenção efetuada na forma deste artigo dispensa, em relação aos pagamentos efetuados, as demais retenções previstas na legislação do IR."
- "§ 2º As retenções serão efetuadas sobre qualquer forma de pagamento, inclusive os pagamentos antecipados por conta de fornecimento de bens ou de prestação de serviços, para entrega futura."
- "§ 6º Para fins desta Instrução Normativa, a pessoa jurídica fornecedora do bem ou prestadora do serviço deverá informar no documento fiscal o valor do IR e das contribuições a serem retidos na operação."
- "§ 7º Para fins desta Instrução Normativa considera-se: I - serviços prestados com emprego de materiais, os serviços cuja prestação envolva o fornecimento pelo contratado de materiais, desde que tais materiais estejam discriminados no contrato ou em planilhas à parte integrante do contrato, e na nota fiscal ou fatura de prestação de serviços; II - construção por empreitada com emprego de materiais, a contratação por empreitada de construção civil, na modalidade total, fornecendo o empreiteiro todos os materiais indispensáveis à sua execução, sendo tais materiais incorporados à obra."
- "§ 8º Excetua-se do disposto no inciso I do § 7º os serviços hospitalares, de que trata o art. 30, e os serviços médicos referidos no art. 31."
- "§ 9º Para efeito do inciso II do § 7º, não serão considerados como materiais incorporados à obra os instrumentos de trabalho utilizados e os materiais consumidos na execução da obra."
- "§ 10. Em caso de pagamentos com glosa de valores constantes da nota fiscal, sem emissão de nova nota fiscal, a retenção deverá incidir sobre o valor original da nota."
- "§ 11. Em caso de pagamentos com acréscimos de juros e multas por atraso no pagamento, a retenção deverá incidir sobre o valor da nota fiscal incluídos os acréscimos."

### 1.4 Art. 2º-A (caput na redação da IN 2.239/2024, vig. 10/12/2024; §§ 1º–3º IN 2.145/2023; §§ 4º–5º IN 2.239/2024)
"Art. 2º-A Os órgãos da administração pública direta dos estados, do Distrito Federal e dos municípios, inclusive suas autarquias e fundações que instituírem e mantiverem ficam obrigados a efetuar a retenção, na fonte, do imposto sobre a renda incidente sobre os pagamentos que efetuarem a pessoas jurídicas pelo fornecimento de bens ou prestação de serviços em geral, inclusive obras de construção civil.
§ 1º Aplica-se aos órgãos e entidades a que se refere o caput, quando cabível, o disposto nos §§ 1º, 2º, 6º, 7º, 8º, 9º, 10 e 11 do art. 2º.
§ 2º No caso de fornecimento de bens ou de prestação de serviços amparados por isenção, não incidência ou alíquota zero do imposto sobre a renda, na forma da legislação em vigor, a retenção do imposto será feita mediante aplicação da alíquota a que se refere o art. 3º-A, que incidirá sobre os valores não abrangidos pela isenção, não incidência ou alíquota zero.
§ 3º Para fins do disposto no § 2º a pessoa jurídica fornecedora do bem ou prestadora do serviço amparado pela isenção, não incidência ou alíquota zero deve informar o enquadramento legal do benefício no respectivo documento fiscal, sob pena de a retenção do imposto sobre a renda ser efetuada sobre o valor total do documento fiscal, no percentual correspondente à natureza do bem ou serviço.
§ 4º As fundações de que trata o caput compreendem somente aquelas com natureza autárquica ou que possuam, no mínimo, mais da metade das receitas obtidas do respectivo poder público mantenedor.
§ 5º O disposto no § 4º também se aplica para fins de aplicação do disposto no art. 157, inciso I, e art. 158, inciso I da Constituição Federal."

(Redação original do caput dada pela IN 2.145/2023, para histórico: "Art. 2º-A. Os órgãos da administração pública direta dos estados, do Distrito Federal e dos municípios, inclusive suas autarquias e fundações, ficam obrigados a efetuar a retenção, na fonte, do imposto sobre a renda incidente sobre os pagamentos que efetuarem a pessoas jurídicas pelo fornecimento de bens ou prestação de serviços em geral, inclusive obras de construção civil.")

### 1.5 Art. 3º (federal — soma das alíquotas) e § 6º (dispensa R$ 10)
"Art. 3º A retenção será efetuada aplicando-se, sobre o valor a ser pago, o percentual constante da coluna 06 do Anexo I a esta Instrução Normativa, que corresponde à soma das alíquotas das contribuições devidas e da alíquota do IR, determinada mediante a aplicação de 15% (quinze por cento) sobre a base de cálculo estabelecida no art. 15 da Lei nº 9.249, de 26 de dezembro de 1995, conforme a natureza do bem fornecido ou do serviço prestado.
§ 1º O percentual a ser aplicado sobre o valor a ser pago corresponderá à espécie do bem fornecido ou do serviço prestado, conforme estabelecido em contrato.
§ 2º Sem prejuízo do estabelecido no § 7º do art. 2º, caso o pagamento se refira a contratos distintos celebrados com a mesma pessoa jurídica pelo fornecimento de bens ou de serviços prestados com percentuais diferenciados, aplicar-se-á o percentual correspondente a cada fornecimento contratado.
[...]
§ 6º Fica dispensada a retenção de valor inferior a R$ 10,00 (dez reais), exceto na hipótese de Documento de Arrecadação de Receitas Federais (Darf) eletrônico efetuado por meio do Siafi.
§ 7º Ocorrendo a hipótese do § 2º, os valores retidos correspondentes a cada percentual serão recolhidos em Darf distintos."

**[NOTA — importante para regra fail-closed]:** o art. 2º-A § 1º remete apenas a §§ do **art. 2º**; o art. 3º-A
não repete nem remete ao **§ 6º do art. 3º** (dispensa de retenção inferior a R$ 10,00). O texto
vigente, portanto, **não estende expressamente** a dispensa de R$ 10,00 à retenção de IR por
municípios (art. 3º-A). Não localizei ato ou orientação oficial da RFB que resolva isso.

### 1.6 Art. 3º-A (IN 2.145/2023, vig. 27/06/2023) — regra para estados/DF/municípios
"Art. 3º-A. A retenção a que se refere o art. 2º-A será efetuada mediante aplicação, sobre o valor a ser pago pelo fornecimento do bem ou prestação do serviço, da alíquota informada na coluna 02-IR do Anexo I, determinada mediante a aplicação do percentual de 15% (quinze por cento) sobre a base de cálculo determinada na forma estabelecida pelo art. 15 da Lei nº 9.249, de 1995, conforme a natureza do bem fornecido ou do serviço prestado.
§ 1º O percentual a ser aplicado sobre o valor a ser pago corresponderá à espécie do bem fornecido ou do serviço prestado, conforme estabelecido em contrato.
§ 2º Sem prejuízo do disposto no art. 2º, caso o pagamento se refira a contratos distintos celebrados com a mesma pessoa jurídica pelo fornecimento de bens ou prestação de serviços, com percentuais diferenciados, será aplicado o percentual correspondente ao bem adquirido ou serviço contratado."

### 1.7 Art. 4º — hipóteses em que não haverá retenção (texto integral vigente)
"Art. 4º Não serão retidos os valores correspondentes ao IR e às contribuições de que trata esta Instrução Normativa, nos pagamentos efetuados a:
I - templos de qualquer culto;
II - partidos políticos;
III - instituições de educação e de assistência social, sem fins lucrativos, a que se refere o art. 12 da Lei nº 9.532, de 10 de dezembro de 1997;
IV - instituições de caráter filantrópico, recreativo, cultural, científico e às associações civis, a que se refere o art. 15 da Lei nº 9.532, de 1997;
V - sindicatos, federações e confederações de empregados;
VI - serviços sociais autônomos, criados ou autorizados por lei;
VII - conselhos de fiscalização de profissões regulamentadas;
VIII - fundações de direito privado e a fundações públicas instituídas ou mantidas pelo Poder Público;
IX - condomínios edilícios;
X - Organização das Cooperativas Brasileiras (OCB) e as Organizações Estaduais de Cooperativas previstas no caput e no § 1º do art. 105 da Lei nº 5.764, de 16 de dezembro de 1971;
XI - pessoas jurídicas optantes pelo Regime Especial Unificado de Arrecadação de Tributos e Contribuições devidos pelas Microempresas e Empresas de Pequeno Porte (Simples Nacional), de que trata o art. 12 da Lei Complementar nº 123, de 14 de dezembro de 2006, em relação às suas receitas próprias;
XII - pessoas jurídicas exclusivamente distribuidoras de jornais e revistas;
XIII - Itaipu binacional;
XIV - empresas estrangeiras de transportes marítimos, aéreos e terrestres, relativos ao transporte internacional de cargas ou passageiros, nos termos do disposto no art. 176 do Decreto nº 3.000, de 26 de março de 1999 - Regulamento do Imposto de Renda (RIR/1999), e no inciso V do art. 14 da Medida Provisória nº 2.158-35, de 24 de agosto de 2001;
XV - órgãos da administração direta, autarquias e fundações do Governo Federal, Estadual ou Municipal, observado, no que se refere às autarquias e fundações, os termos dos §§ 2º e 3º do art. 150 da Constituição Federal;
XVI - no caso das entidades previstas no art. 34 da Lei nº 10.833, de 29 de dezembro de 2003, a título de adiantamentos efetuados a empregados para despesas miúdas de pronto pagamento, até o limite de 5 (cinco) salários mínimos;
XVII - título de prestações relativas à aquisição de bem financiado por instituição financeira;
XVIII - entidades fechadas de previdência complementar, nos termos do art. 32 da Lei nº 10.637, de 30 de dezembro de 2002;
XIX - título de aquisição de petróleo, gasolina, gás natural, óleo diesel, gás liquefeito de petróleo, querosene de aviação, demais derivados de petróleo, gás natural, álcool, biodiesel e demais biocombustíveis efetuados pelas pessoas jurídicas dispostas nos incisos IV a VI do caput do art. 2º, conforme disposto no parágrafo único do art. 34 da Lei nº 10.833, de 2003; [IN 1.244/2012]
XX - título de seguro obrigatório de danos pessoais causados por veículos automotores; e [IN 1.244/2012]
XXI - título de suprimentos de fundos de que tratam os arts. 45 a 47 do Decreto nº 93.872, de 23 de dezembro de 1986. [IN 1.244/2012]
XXII - título de Contribuição para o Custeio da Iluminação Pública cobrada nas faturas de consumo de energia elétrica emitidas por distribuidoras de energia elétrica com base em convênios firmados com os Municípios ou com o Distrito Federal. [IN 1.540/2015]
§ 1º. A imunidade ou a isenção das entidades previstas nos incisos III e IV é restrita aos serviços para os quais tenham sido instituídas, observado o disposto nos arts. 12 e 15 da Lei nº 9.532, de 10 de dezembro de 1997. [IN 1.663/2016]
§ 2º. A condição de imunidade e isenção de que trata o §1º será declarada pela entidade nos anexos II e III. [IN 1.663/2016]"

**[NOTA]** o inciso XIX remete a "incisos IV a VI do caput do art. 2º", que foram **revogados** pelo
art. 3º da IN 2.145/2023 ("Ficam revogados os incisos I, II, III, IV, V e VI do caput do art. 2º") — o
texto vigente mantém a remissão órfã.

### 1.8 Art. 5º, parágrafo único (IN 2.145/2023)
"Parágrafo único. O disposto neste artigo aplica-se, em relação aos pagamentos efetuados pelos órgãos da administração pública direta dos estados, do Distrito Federal e dos municípios, inclusive suas autarquias e fundações, apenas à retenção do imposto sobre a renda."
(O art. 5º trata dos casos com código 8767 e 8850 em que não se retém PIS/Cofins; texto completo em `in-rfb-1234-2012-compilado.txt`.)

### 1.9 Art. 6º (declaração dos beneficiários de dispensa — incisos III, IV e XI do art. 4º)
"Art. 6º Para efeito do disposto nos incisos III, IV e XI do caput do art. 4º, a pessoa jurídica deverá, no ato da assinatura do contrato, apresentar ao órgão ou à entidade declaração de acordo com os modelos constantes dos Anexos II, III ou IV desta Instrução Normativa, conforme o caso, em 2 (duas) vias, assinada pelo seu representante legal." [IN 1.540/2015]
"§ 4º Alternativamente à declaração de que trata o caput, a fonte pagadora poderá verificar a permanência do contratado no Simples Nacional mediante consulta ao Portal do Simples Nacional e anexar cópia da consulta ao contrato ou documentação que deu origem ao pagamento, sem prejuízo do contratado informar imediatamente ao contratante qualquer alteração da sua permanência no Simples Nacional."
"§ 5º A exigência prevista no caput e no §4º aplica-se no caso de prorrogação do contrato ou a cada novo contrato, ainda que nas mesmas condições do anterior."
"§ 8º No caso de não apresentação do Cebas, na forma prevista no § 6º, o órgão ou a entidade pagadora obriga-se a efetuar a retenção do IR e das contribuições sobre o valor total do documento fiscal ou fatura apresentada pela entidade no percentual de 9,45% (nove inteiros e quarenta e cinco centésimos por cento), mediante o código de arrecadação 6190 (demais serviços) do Anexo I desta Instrução Normativa."

### 1.10 Art. 7º e 7º-A (prazo e destino)
"Art. 7º Os valores retidos na forma estabelecida por esta Instrução Normativa deverão ser recolhidos ao Tesouro Nacional, mediante Darf, até o dia 20 (vinte) do mês subsequente àquele em que tiver sido efetuado o pagamento à pessoa jurídica fornecedora do bem ou prestadora do serviço, ou até o dia útil imediatamente anterior ao dia 20 (vinte)." [IN 2.108/2022, vig. 01/11/2022]
"Art. 7º-A. O imposto sobre a renda retido na forma estabelecida pelo art. 2º-A deverá ser recolhido, pelo órgão ou entidade que efetuar a retenção, à conta do respectivo ente federativo, observado o disposto no art. 7º, quando cabível, e a legislação própria." [IN 2.145/2023]

### 1.11 Art. 37 § 4º (Dirf)
"§ 4º As retenções efetuadas na forma estabelecida pelo art. 2º-A deverão ser informadas na Dirf, com o código de receita 6256." [IN 2.145/2023]
(Art. 36, I: "6256 - no caso de IR" — código usado para recolhimento individualizado em caso de suspensão de exigibilidade.)

### 1.12 Anexo I — Tabela de Retenção (texto integral, `in-rfb-1234-anexo-I.pdf`, extraído com `pdftotext -table`)
Colunas: (01) natureza; (02) IR; (03) CSLL; (04) COFINS; (05) PIS/PASEP; (06) percentual a ser aplicado; (07) código da receita.
**Para município (art. 3º-A) aplica-se só a coluna (02) IR.**

| Cód. (07) | IR (02) | CSLL (03) | COFINS (04) | PIS (05) | Total (06) | Natureza do bem/serviço (01) — literal |
|---|---|---|---|---|---|---|
| 6147 | 1,2 | 1,0 | 3,0 | 0,65 | 5,85 | Alimentação; Energia elétrica; Serviços prestados com emprego de materiais; Construção Civil por empreitada com emprego de materiais; Serviços hospitalares de que trata o art. 30; Serviços de auxílio diagnóstico e terapia, patologia clínica, imagenologia, anatomia patológica e citopatológia, medicina nuclear e análises e patologias clínicas de que trata o art. 31. Transporte de cargas, exceto os relacionados no código 8767; Produtos farmacêuticos, de perfumaria, de toucador ou de higiene pessoal adquiridos de produtor, importador, distribuidor ou varejista, exceto os relacionados no código 8767; e Mercadorias e bens em geral. |
| 9060 | 0,24 | 1,0 | 3,0 | 0,65 | 4,89 | Gasolina, inclusive de aviação, óleo diesel, gás liquefeito de petróleo (GLP), combustíveis derivados de petróleo ou de gás natural, querosene de aviação (QAV), e demais produtos derivados de petróleo, adquiridos de refinarias de petróleo, de demais produtores, de importadores, de distribuidor ou varejista, pelos órgãos da administração pública de que trata o caput do art. 19; Álcool etílico hidratado, inclusive para fins carburantes, adquirido diretamente de produtor, importador ou distribuidor de que trata o art. 20; Biodiesel adquirido de produtor ou importador, de que trata o art. 21. |
| 8739 | 0,24 | 1,0 | 0,0 | 0,0 | 1,24 | Gasolina, exceto gasolina de aviação, óleo diesel, gás liquefeito de petróleo (GLP), derivados de petróleo ou de gás natural e querosene de aviação adquiridos de dis- tribuidores e comerciantes varejistas; Álcool etílico hidratado nacional, inclusive para fins carburantes adquirido de comerciante varejista; Biodiesel adquirido de distribuidores e comerciantes varejistas; Biodiesel adquirido de produtor detentor regular do selo "Combustível Social", fabricado a partir de mamona ou fruto, caroço ou amêndoa de palma produzidos nas regiões norte e nordeste e no semiárido, por agricultor familiar enquadrado no Programa Nacional de Fortalecimento da Agricultura Familiar (Pronaf). |
| 8767 | 1,2 | 1,0 | 0,0 | 0,0 | 2,2 | Transporte internacional de cargas efetuado por empresas nacionais; Estaleiros navais brasileiros nas atividades de construção, conservação, modernização, conversão e reparo de embarcações pré-registradas ou registradas no Registro Especial Brasileiro (REB), instituído pela Lei nº 9.432, de 8 de janeiro de 1997; Produtos farmacêuticos, de perfumaria, de toucador e de higiene pessoal a que se refere o § 1º do art. 22 , adquiridos de distribuidores e de comerciantes varejistas; Produtos a que se refere o § 2º do art. 22; Produtos de que tratam as alíneas "c" a "k"do inciso I do art. 5º; Outros produtos ou serviços beneficiados com isenção, não incidência ou alíquotas zero da Cofins e da Contribuição para o PIS/Pasep, observado o disposto no § 5º do art. 2º. |
| 6175 | 2,40 | 1,0 | 3,0 | 0,65 | 7,05 | Passagens aéreas, rodoviárias e demais serviços de transporte de passageiros, inclusive, tarifa de embarque, exceto as relacionadas no código 8850. |
| 8850 | 2,40 | 1,0 | 0,0 | 0,0 | 3,40 | Transporte internacional de passageiros efetuado por empresas nacionais. |
| 8863 | 0,0 | 1,0 | 3,0 | 0,65 | 4,65 | Serviços prestados por associações profissionais ou assemelhadas e cooperativas. |
| 6188 | 2,40 | 1,0 | 3,0 | 0,65 | 7,05 | Serviços prestados por bancos comerciais, bancos de investimento, bancos de desenvolvimento, caixas econômicas, sociedades de crédito, financiamento e investimento, sociedades de crédito imobiliário, e câmbio, distribuidoras de títulos e valores mobiliários, empresas de arrendamento mercantil, cooperativas de crédito, empresas de seguros privados e de capitalização e entidades abertas de previdência complementar; Seguro saúde. |
| 6190 | 4,80 | 1,0 | 3,0 | 0,65 | 9,45 | Serviços de abastecimento de água; Telefone; Correio e telégrafos; Vigilância; Limpeza; Locação de mão de obra; Intermediação de negócios; Administração, locação ou cessão de bens imóveis, móveis e direitos de qualquer natureza; Factoring; Plano de saúde humano, veterinário ou odontológico com valores fixos por servidor, por empregado ou por animal; Demais serviços. |

**[NOTA — conferência independente]** a extração em modo `-layout` embaralha a coluna (07) nas linhas
6175–6190; a atribuição acima vem do modo `-table`, em que cada código cai na mesma linha do
respectivo total, e confere com a aritmética IR+CSLL+COFINS+PIS = coluna 06 em todas as 9 linhas.

### 1.13 IN RFB 2.145/2023 (idAto 131582)
- Publicação: "Publicado(a) no DOU de 27/06/2023, seção 1, página 42".
- Fundamento no preâmbulo: "tendo em vista o disposto no art. 64 da Lei nº 9.430, de 27 de dezembro de 1996, e no Parecer SEI nº 5744/2022/ME, de 14 de abril de 2022, da Procuradoria-Geral da Fazenda Nacional".
- "Art. 3º Ficam revogados os incisos I, II, III, IV, V e VI do caput do art. 2º da Instrução Normativa RFB nº 1.234, de 2012."
- "Art. 4º Esta Instrução Normativa entra em vigor na data de sua publicação no Diário Oficial da União."
- **[NOTA]** o texto da IN 2.145 **não menciona** o STF nem o "Tema 1130"; cita apenas art. 64 da Lei 9.430/1996 e o Parecer SEI 5744/2022/ME da PGFN.

### 1.14 Página da Receita "Retenção de IR por Estados, DF e Municípios"
**Não localizada** em gov.br/receitafederal na busca feita. Os resultados eram manuais de entes
(DF, ES, PE, Ipatinga, Rondônia) — não usados, por não serem fonte da RFB.

---

## 2. Retenção previdenciária 11% — Lei 8.212/1991 art. 31 e IN RFB 2.110/2022

### 2.1 Lei 8.212/1991, art. 31 (Planalto, compilado)
"Art. 31. A empresa contratante de serviços executados mediante cessão de mão de obra, inclusive em regime de trabalho temporário, deverá reter 11% (onze por cento) do valor bruto da nota fiscal ou fatura de prestação de serviços e recolher, em nome da empresa cedente da mão de obra, a importância retida até o dia 20 (vinte) do mês subsequente ao da emissão da respectiva nota fiscal ou fatura, ou até o dia útil imediatamente anterior se não houver expediente bancário naquele dia, observado o disposto no § 5o do art. 33 desta Lei. (Redação dada pela Lei nº 11.933, de 2009).
§ 1o O valor retido de que trata o caput deste artigo, que deverá ser destacado na nota fiscal ou fatura de prestação de serviços, poderá ser compensado por qualquer estabelecimento da empresa cedente da mão de obra, por ocasião do recolhimento das contribuições destinadas à Seguridade Social devidas sobre a folha de pagamento dos seus segurados. (Redação dada pela Lei nº 11.941, de 2009)
§ 2o Na impossibilidade de haver compensação integral na forma do parágrafo anterior, o saldo remanescente será objeto de restituição.
§ 3o Para os fins desta Lei, entende-se como cessão de mão-de-obra a colocação à disposição do contratante, em suas dependências ou nas de terceiros, de segurados que realizem serviços contínuos, relacionados ou não com a atividade-fim da empresa, quaisquer que sejam a natureza e a forma de contratação.
§ 4o Enquadram-se na situação prevista no parágrafo anterior, além de outros estabelecidos em regulamento, os seguintes serviços: I - limpeza, conservação e zeladoria; II - vigilância e segurança; III - empreitada de mão-de-obra; IV - contratação de trabalho temporário na forma da Lei no 6.019, de 3 de janeiro de 1974.
§ 5o O cedente da mão-de-obra deverá elaborar folhas de pagamento distintas para cada contratante.
§ 6o Em se tratando de retenção e recolhimento realizados na forma do caput deste artigo, em nome de consórcio, [...] aplica-se o disposto em todo este artigo, observada a participação de cada uma das empresas consorciadas, na forma do respectivo ato constitutivo."

Lei 8.212, art. 15, I: "empresa - a firma individual ou sociedade que assume o risco de atividade econômica urbana ou rural, com fins lucrativos ou não, bem como os órgãos e entidades da administração pública direta, indireta e fundacional;"

### 2.2 IN RFB 2.110/2022 (multivigente; alterações até IN 2.321/2026, vig. 14/04/2026)
**Art. 110 (caput):** "A empresa contratante de serviços prestados mediante cessão de mão de obra ou empreitada, inclusive em regime de trabalho temporário, deverá reter 11% (onze por cento) do valor bruto da nota fiscal ou fatura e recolher à Previdência Social a importância retida, em documento de arrecadação identificado com a denominação social e o CNPJ da empresa contratada, observado o disposto no art. 50 e no art. 131."

**Art. 111** (sujeitos se contratados mediante cessão **ou empreitada**): "I - limpeza, conservação ou zeladoria [...]; II - vigilância ou segurança [...]; III - construção civil [...]; IV - natureza rural [...]; V - digitação [...]; e VI - preparação de dados para processamento [...]. Parágrafo único. Os serviços de vigilância ou segurança prestados por meio de monitoramento eletrônico não estão sujeitos à retenção."

**Art. 112** (sujeitos se contratados mediante cessão de mão de obra): "I - acabamento; II - embalagem; III - acondicionamento; IV - cobrança; V - coleta ou reciclagem de lixo ou de resíduos [...] exceto quando realizados com a utilização de equipamentos tipo contêineres ou caçambas estacionárias; VI - copa; VII - hotelaria; VIII - corte ou ligação de serviços públicos; IX - distribuição; X - treinamento e ensino; XI - entrega de contas e de documentos; XII - ligação de medidores; XIII - leitura de medidores; XIV - manutenção de instalações, de máquinas ou de equipamentos, quando indispensáveis ao seu funcionamento regular e permanente e desde que mantida equipe à disposição da contratante; XV - montagem; XVI - operação de máquinas, de equipamentos e de veículos [...]; XVII - operação de pedágio ou de terminal de transporte; XVIII - operação de transporte de passageiros, inclusive nos casos de concessão ou de subconcessão [...]; XIX - portaria, recepção ou ascensorista; XX - recepção, triagem ou movimentação; XXI - promoção de vendas ou de eventos; XXII - secretaria e expediente; XXIII - saúde, quando prestados por empresas da área da saúde e direcionados ao atendimento de pacientes [...]; e XXIV - telefonia ou de telemarketing." (texto integral de cada inciso no `.txt`, linhas 1162–1194)

**Art. 113:** "São exaustivas as relações dos serviços sujeitos à retenção constantes dos arts. 111 e 112. Parágrafo único. A pormenorização das tarefas compreendidas em cada um dos serviços constantes dos incisos do caput dos arts. 111 e 112 é exemplificativa."

**Art. 114 (redação IN 2.289/2025, vig. 13/11/2025):** "Não se aplica a retenção de que trata o art. 110:
I - à contratação de serviços prestados por trabalhadores avulsos por intermédio de sindicato da categoria ou Ogmo;
II - à empreitada total, conforme definição estabelecida no art. 7º, caput, inciso III, e § 1º, da Instrução Normativa RFB nº 2.021, de 16 de abril de 2021;
III - à contratação de serviços prestados por entidade beneficente de assistência social abrangida por imunidade tributária relativa às contribuições sociais;
IV - à pessoa física, inclusive na condição de contribuinte individual equiparado a empresa, na hipótese de ser contratante de serviços;
V - à contratação de serviços de transporte de cargas;
VI - à empreitada realizada nas dependências da contratada; e
VII - aos órgãos públicos da administração direta, autarquias e fundações de direito público, na hipótese de serem contratantes de obra de construção civil, reforma ou acréscimo, mediante empreitada total, observados a obrigatoriedade de retenção prevista no § 2º e o disposto no art. 135, § 2º, inciso II.
[...] § 2º Os órgãos públicos da administração direta, autarquias e fundações de direito público que contratarem serviços de construção civil mediante cessão de mão de obra ou empreitada parcial são obrigados a efetuar a retenção prevista no art. 110. (Decreto nº 3.048, de 1999, art. 221-A, parágrafo único)"

**Art. 115 (dispensa):** "A contratante fica dispensada de efetuar a retenção na forma do art. 110, e a contratada, de registrar o destaque da retenção na nota fiscal ou fatura, quando:
I - o valor correspondente a 11% (onze por cento) dos serviços contidos em cada nota fiscal ou fatura de prestação de serviços for inferior ao limite mínimo estabelecido pela RFB para recolhimento em documento de arrecadação;
II - a contratada não possuir empregados, o serviço for prestado pessoalmente pelo titular ou sócio e o seu faturamento do mês anterior for igual ou inferior a 2 (duas) vezes o limite máximo do salário de contribuição, cumulativamente; ou
III - a contratação envolver somente serviços profissionais relativos ao exercício de profissão regulamentada por legislação federal, ou serviços de treinamento e ensino definidos no inciso X do caput do art. 112, desde que prestados pessoalmente pelos sócios, sem o concurso de empregados ou de outros contribuintes individuais."
(§§ 1º–3º: declarações exigidas e rol exemplificativo de profissões regulamentadas — ver `.txt` linhas 1219–1221.)

**Limite mínimo referido no art. 115, I — Art. 238:** "É vedado o recolhimento de contribuições sociais previdenciárias, em documento de arrecadação, de valor inferior a R$ 10,00 (dez reais). § 1º Se o valor a recolher na competência for inferior ao valor mínimo estabelecido no caput, deverá ser adicionado ao devido na competência seguinte, e assim sucessivamente, até atingir o valor mínimo permitido para recolhimento [...] § 2º Não se aplica o disposto no caput aos órgãos e às entidades da administração pública quando o recolhimento for efetuado pelo Siafi."
**[NOTA]** a dispensa do art. 115, I é **por nota fiscal** ("dos serviços contidos em cada nota fiscal").

**Art. 116 (materiais/equipamentos discriminados):** "Os valores de materiais ou de equipamentos, próprios ou de terceiros, exceto os equipamentos manuais, fornecidos pela contratada, discriminados no contrato e na nota fiscal ou fatura, não integram a base de cálculo da retenção de que trata o art. 110, desde que comprovados. § 1º O valor do material fornecido ao contratante ou o de locação de equipamento de terceiros, utilizado na execução do serviço, não poderá ser superior ao valor de aquisição ou de locação para fins de apuração da base de cálculo da retenção. [...] § 3º Considera-se discriminação no contrato os valores nele consignados, relativos a material ou equipamentos, ou os previstos em planilha à parte, desde que esta seja parte integrante do contrato mediante cláusula nele expressa."

**Art. 117 (previstos em contrato sem valor, discriminados na NF — base mínima):** "[...] que deve corresponder no mínimo aos seguintes percentuais do valor bruto da nota fiscal ou fatura: I - 30% (trinta por cento), para os serviços de transporte de passageiros, cujas despesas de combustível e de manutenção dos veículos corram por conta da contratada; II - 65% (sessenta e cinco por cento), quando se referir a limpeza hospitalar; III - 80% (oitenta por cento), quando se referir a serviço de limpeza não mencionado no inciso II; e IV - 50% (cinquenta por cento), nos demais casos."

**Art. 118 (equipamento inerente):** "II - se não houver a discriminação de valores em contrato, independentemente da previsão contratual do fornecimento de equipamento, a base de cálculo da retenção de que trata o art. 110 corresponderá, no mínimo, aos seguintes percentuais do valor bruto da nota fiscal ou fatura: a) 50% (cinquenta por cento), para a prestação de serviços em geral; e b) no caso da prestação de serviços na área da construção civil: 1. 10% (dez por cento), para pavimentação asfáltica; 2. 15% (quinze por cento), para terraplenagem, aterro sanitário e dragagem; 3. 45% (quarenta e cinco por cento), para obras de arte (pontes ou viadutos); 4. 50% (cinquenta por cento), para drenagem; e 5. 35% (trinta e cinco por cento), para os demais serviços realizados com a utilização de equipamentos, exceto os manuais. § 1º Se na mesma nota fiscal ou fatura constar a execução de mais de um dos serviços referidos nos incisos do caput, cujos valores não constem individualmente discriminados na nota fiscal ou fatura, deverá ser aplicado o percentual correspondente a cada tipo de serviço, conforme disposto em contrato, ou o percentual maior, se o contrato não permitir identificar o valor de cada serviço."

**Art. 119:** "Se não existir previsão contratual de fornecimento de material ou de utilização de equipamento, e o uso desse equipamento não for inerente ao serviço, mesmo se houver a discriminação de valores na nota fiscal ou fatura, a base de cálculo da retenção de que trata o art. 110 será o valor bruto da nota fiscal ou fatura, exceto no caso do serviço de transporte de passageiros, para o qual a base de cálculo da retenção corresponderá, no mínimo, à prevista no inciso I do caput do art. 117. Parágrafo único. Na falta de discriminação de valores na nota fiscal ou fatura, a base de cálculo da retenção será o seu valor bruto, ainda que exista previsão contratual para o fornecimento de material ou a utilização de equipamento, com ou sem discriminação de valores em contrato."

**Art. 120 (deduções):** "Poderão ser deduzidas da base de cálculo da retenção de que trata o art. 110 as parcelas que estiverem discriminadas na nota fiscal ou fatura, que correspondam: I - ao custo da alimentação in natura fornecida pela contratada e, a partir de 11 de novembro de 2017, ao custo do auxílio alimentação, desde que este não seja pago em dinheiro; e II - ao fornecimento de vale-transporte, ainda que pago em dinheiro, limitado ao valor equivalente ao necessário para o custeio do deslocamento em transporte coletivo de passageiros. § 1º O valor relativo à taxa de administração ou de agenciamento não poderá ser deduzido da base de cálculo da retenção, inclusive no caso de serviços prestados por trabalhadores temporários, ainda que o valor seja discriminado no documento ou seja objeto de nota fiscal ou fatura específica."

**Art. 121** (destaque "RETENÇÃO PARA A PREVIDÊNCIA SOCIAL"); **Art. 122** (dedução de retenção de subcontratada, "desde que todos os documentos envolvidos se refiram à mesma competência e ao mesmo serviço").

**Art. 123 (prazo):** "As contribuições retidas na forma deste Capítulo deverão ser recolhidas pela empresa contratante até o dia 20 do mês seguinte ao da emissão da nota fiscal ou fatura, antecipando-se esse prazo para o dia útil imediatamente anterior quando não houver expediente bancário na referida data. [...] § 3º Nos casos em que um mesmo estabelecimento da contratada emitir mais de uma nota fiscal ou fatura para um mesmo estabelecimento da contratante, na mesma competência, sobre as quais houve retenção, a contratante deverá efetuar o recolhimento dos valores retidos, em nome da contratada, num único documento de arrecadação."
**[NOTA]** competência da retenção = mês de **emissão** da NF (não o do pagamento), diferente do IRRF (mês do pagamento).

**Art. 131 (atividade especial — adicional):** "[...] o percentual da retenção aplicado sobre o valor dos serviços prestados por estes segurados, a partir de 1º de abril de 2003, deve ser acrescido de 4% (quatro por cento), 3% (três por cento) ou 2% (dois por cento), respectivamente, perfazendo o total de 15% (quinze por cento), 14% (quatorze por cento) ou 13% (treze por cento)." (§ 4º: na falta de identificação, "o percentual mínimo de 2% (dois por cento)").

**Simples Nacional:**
- "Art. 166. As microempresas e empresas de pequeno porte tributadas na forma do Anexo IV da Lei Complementar nº 123, de 2006, estão sujeitas à retenção da contribuição social previdenciária incidente sobre o valor bruto da nota fiscal, da fatura ou do recibo de prestação de serviços executados mediante cessão de mão de obra ou empreitada. (Lei Complementar nº 123, de 2006, art. 18, § 5º-C; [...]) Parágrafo único. A retenção disposta no caput restringe-se à execução dos serviços elencados nos arts. 111 e 112, sendo aplicado, no que couber, as disposições do Capítulo VIII do Título II."
- "Art. 167. As microempresas e as empresas de pequeno porte optantes pelo Simples Nacional que prestarem serviços mediante cessão de mão de obra ou empreitada, exceto nos casos previstos no art. 166, não estão sujeitas à retenção da contribuição social previdenciária incidente sobre o valor da nota fiscal, da fatura ou do recibo da prestação de serviços. (STJ, Súmula nº 425) Parágrafo único. As microempresas e as empresas de pequeno porte optantes pelo Simples Nacional que prestarem serviços mediante cessão ou locação de mão de obra estão sujeitas à exclusão do Simples Nacional, exceto nos casos previstos no art. 166. [...]" [parágrafo único na redação IN 2.289/2025]

---

## 3. Esperança/PB — ISS (LC 80/2017 e LC 132/2025)

### 3.0 Situação dos PDFs
- Ambos têm camada de texto (não são digitalizações); extração com `pdftotext` funcionou. `tesseract` não existe na máquina e não foi necessário.
- **[NOTA]** o PDF da LC 80 (cabeçalho "ANO I • Nº 014 • DE 16 A 31/12 | DOMINGO, 31 DE DEZEMBRO DE 2017", arquivo com nome datado de 15/06/2020) contém marcas **"(NR)"** em vários dispositivos (ex.: arts. 12, 93, 412 — "revisão [...] no ano de 2020, para entrar em vigor no exercício financeiro de 2021. (NR)"). Isso indica texto com alterações posteriores já incorporadas, **sem identificar** a lei alteradora. O capítulo do ISS (arts. 53–88) **não** tem marcas (NR).
- O PDF da alteração é o **Quinzenário Oficial nº 206 (16 a 31/12/2025)**; nele está a **Lei Complementar nº 132, de 30 de dezembro de 2025**, "ALTERA A LEI COMPLEMENTAR MUNICIPAL Nº 80, DE 27 DE DEZEMBRO DE 2017 (CÓDIGO TRIBUTÁRIO MUNICIPAL)." O texto da LC 132 aparece intercalado, na extração, com o de outra lei (utilidade pública do Clube Campestre) por causa da diagramação em colunas — o art. 10 "produzindo efeitos a partir de 1º de janeiro de 2026" pertence **à outra lei**, não à LC 132.

### 3.1 Incidência (LC 80)
"Art. 53. O Imposto Sobre Serviços de Qualquer Natureza – ISSQN, tem como fato gerador a prestação dos serviços incluídos na Lista de Serviços constante do Anexo I deste Código, ainda que não constituam atividade preponderante do prestador. § 1º O imposto incide também sobre os serviços provenientes do exterior do País ou cuja prestação se tenha iniciado no exterior do País. § 2º O imposto incide ainda sobre os serviços prestados através da utilização de bens e serviços públicos explorados economicamente mediante autorização, permissão ou concessão, com o pagamento de tarifa, preço ou pedágio pelo usuário final do serviço. § 3º O exercício de mais de uma das atividades relacionadas na Lista de Serviços constante do Anexo I deste Código estará sujeito ao imposto sobre cada uma delas, inclusive sobre profissional autônomo."
Art. 55 (não incidência): "I - as exportações de serviços para o exterior do País; II - a prestação de serviços em relação de emprego, dos trabalhadores avulsos, dos diretores e membros de conselho consultivo ou de conselho fiscal de sociedades e fundações, bem como dos sócios-gerentes e dos gerentes-delegados; III - o valor intermediado no mercado de títulos e valores mobiliários, o valor dos depósitos bancários, o principal, juros e acréscimos moratórios relativos a operações de crédito realizadas por instituições financeiras."

### 3.2 Local da incidência (LC 80, art. 56)
"Art. 56. O serviço considera-se prestado e o imposto devido no local do estabelecimento prestador ou, na falta do estabelecimento, no local do domicílio do prestador, exceto nas hipóteses previstas nos incisos I a XX, quando o imposto será devido no local:
I - do estabelecimento do tomador ou intermediário do serviço ou, na falta de estabelecimento, onde ele estiver domiciliado, na hipótese do § 1º do art. 53 desta Lei Complementar;
II - da instalação dos andaimes, palcos, coberturas e outras estruturas, no caso dos serviços descritos no subitem 3.05 da lista anexa;
III - da execução da obra, no caso dos serviços descritos no subitem 7.02 e 7.19 da lista anexa;
IV - da demolição, no caso dos serviços descritos no subitem 7.04 da lista anexa;
V - das edificações em geral, estradas, pontes, portos e congêneres, no caso dos serviços descritos no subitem 7.05 da lista anexa;
VI - da execução da varrição, coleta, remoção, incineração, tratamento, reciclagem, separação e destinação final de lixo, rejeitos e outros resíduos quaisquer, no caso dos serviços descritos no subitem 7.09 da lista anexa;
VII - da execução da limpeza, manutenção e conservação de vias e logradouros públicos, imóveis, chaminés, piscinas, parques, jardins e congêneres, no caso dos serviços descritos no subitem 7.10 da lista anexa;
VIII - da execução da decoração e jardinagem, do corte e poda de árvores, no caso dos serviços descritos no subitem 7.11 da lista anexa;
IX - do controle e tratamento do efluente de qualquer natureza e de agentes físicos, químicos e biológicos, no caso dos serviços descritos no subitem 7.12 da lista anexa;
X - do florestamento, reflorestamento, semeadura, adubação e congêneres, no caso dos serviços descritos no subitem 7.16 da lista anexa;
XI - da execução dos serviços de escoramento, contenção de encostas e congêneres, no caso dos serviços descritos no subitem 7.17 da lista anexa;
XII - da limpeza e dragagem, no caso dos serviços descritos no subitem 7.18 da lista anexa;
XIII - onde o bem estiver guardado ou estacionado, no caso dos serviços descritos no subitem 11.01 da lista anexa;
XIV - dos bens ou do domicílio das pessoas vigiados, segurados ou monitorados, no caso dos serviços descritos no subitem 11.02 da lista anexa;
XV - do armazenamento, depósito, carga, descarga, arrumação e guarda do bem, no caso dos serviços descritos no subitem 11.04 da lista anexa;
XVI - da execução dos serviços de diversão, lazer, entretenimento e congêneres, no caso dos serviços descritos nos subitens do item 12, exceto o 12.13, da lista anexa;
XVII - do Município onde está sendo executado o transporte, no caso dos serviços descritos pelo subitem 16.01 da lista anexa;
XVIII - do estabelecimento do tomador da mão-de-obra ou, na falta de estabelecimento, onde ele estiver domiciliado, no caso dos serviços descritos pelo subitem 17.05 da lista anexa;
XIX - da feira, exposição, congresso ou congênere a que se referir o planejamento, organização e administração, no caso dos serviços descritos pelo subitem 17.10 da lista anexa;
XX - do porto, aeroporto, ferroporto, terminal rodoviário, ferroviário ou metroviário, no caso dos serviços descritos pelo item 20 da lista anexa.
§ 1º [subitem 3.4 — extensão de ferrovia, rodovia, postes, cabos...] § 2º [subitem 22.1 — extensão de rodovia explorada] § 3º Considera-se estabelecimento prestador o local onde o contribuinte desenvolva a atividade de prestar serviço, de modo permanente ou temporário, e que configure unidade econômica ou profissional, sendo irrelevantes para caracterizá-lo as denominações de sede, filial, agência, posto de atendimento, sucursal, escritório de representação ou contato ou quaisquer outras que venham a ser utilizadas."
**[NOTA]** o art. 56 da LC 80 **não** contém as hipóteses posteriores da LC 116 (planos de saúde 4.22/4.23/5.09, 10.04, 15.01, 15.09 — LC 157/2016 e LC 175/2020). O novo Anexo I da LC 132/2025 marca esses subitens na coluna "Estab. do tomador" (ver 3.6).

### 3.3 Responsáveis / substituição (LC 80, arts. 57, 58 e 73)
"Art. 57. Contribuinte do ISSQN é o prestador do serviço."
"Art. 58. Preservada a responsabilidade do contribuinte em caráter supletivo, são responsáveis pelo cumprimento total ou parcial da obrigação tributária, inclusive no que se refere à multa e aos acréscimos legais:
I - o tomador ou intermediário de serviço proveniente do exterior do País ou cuja prestação se tenha iniciado no exterior do País;
II - a pessoa jurídica, ainda que imune ou isenta, tomadora ou intermediária dos serviços descritos nos subitens 3.4, 7.2, 7.4, 7.5, 7.9, 7.10, 7.11, 7.12, 7.14, 7.15, 7.16, 7.17, 11.1, 11.2, 11.4, 12 (exceto o subitem 12.13), 16, 17.5, 17.9, 17.10 e 20 da Lista de Serviços constante do Anexo I deste Código.
III - os órgãos da Administração Pública direta e indireta dos Municípios, dos Estados e da União, assim como suas autarquias, fundações, empresas públicas e sociedades de economia mista, em relação aos serviços que lhes forem prestados;
IV - as concessionárias, permissionárias ou autorizatárias de serviços públicos, em relação aos serviços que lhes forem prestados;
V - as instituições financeiras e seguradoras em relação aos serviços que lhes forem prestados;
VI - as empresas que explorem planos de medicina de grupo ou individual e convênios para prestação de assistência médica, hospitalar, odontológica e congêneres e as empresas de seguro saúde, em relação aos serviços previstos no item 4, exceto os subitens 4.22 e 4.23, e no subitem 10.01 da Lista de Serviços constante do Anexo I deste Código;
VII - as empresas que prestam os serviços referidos nos subitens 7.2 e 7.5 da Lista de Serviços constante do Anexo I deste Código, em relação aos serviços subempreitados;
VIII - o tomador ou o intermediário, quando o prestador do serviço estabelecido ou domiciliado no Município não comprovar sua inscrição no Cadastro Mercantil de Contribuintes ou deixar de emitir a nota fiscal de serviços, estando obrigado a fazê-lo;
IX - o tomador ou o intermediário que utilizar serviços de profissionais autônomos, pelo imposto incidente sobre as prestações, se não exigirem destes prova de quitação fiscal.
X - as companhias de aviação e quem as represente no Município em relação aos serviços que lhe forem prestados;
XI - as empresas e entidades que explorem loterias e outros jogos permitidos, inclusive apostas, pelo imposto devido sobre comissões pagas aos seus agentes, revendedores ou concessionários;
XII - os condomínios e administradoras de shopping centers em relação aos serviços que lhes forem prestados."
"Art. 73. Os responsáveis pelo cumprimento da obrigação tributária, de que trata o Art. 58. deste Código, estão obrigados a efetuar a retenção na fonte e o recolhimento do ISSQN aos cofres do Município. § 1º O descumprimento do disposto no caput deste artigo obrigará o responsável ao pagamento do imposto devido, acrescido de multa, juros de mora e atualização monetária, quando for o caso. § 2º O imposto será retido na fonte com base na alíquota correspondente à atividade do prestador do serviço. § 3º Quando o prestador do serviço for profissional autônomo que, estando obrigado, não estiver inscrito no Cadastro Mercantil de Contribuintes ou, ainda que inscrito, não apresentar o comprovante de quitação do imposto, o desconto na fonte será efetuado à razão de 5% (cinco por cento) do preço do serviço."
Art. 72 (prazo): "II - até o décimo dia do mês subsequente ao da ocorrência do fato gerador, nos demais casos. [...] § 3º O recolhimento do imposto sujeito à retenção na fonte far-se-á em nome do responsável tributário."
**[NOTA]** o inciso III do art. 58 atribui responsabilidade aos órgãos públicos **sem limitar a subitens nem ao local de incidência** — o texto não diz se vale só quando o ISS é devido a Esperança. O novo Anexo I (coluna "Retenção na fonte") marca apenas 13 subitens; a relação entre essa coluna e o art. 58, III não está explicada no texto obtido.

### 3.4 Base de cálculo e deduções (LC 80, art. 59; §§ relevantes)
"Art. 59. A base de cálculo do ISSQN é o preço do serviço. § 1º Considera-se preço do serviço o valor bruto a ele correspondente, recebido ou não, nele se incorporando os bens, substâncias, insumos, os valores acrescidos e os encargos de qualquer natureza, ainda que de responsabilidade de terceiros.
§ 2º A base de cálculo do Imposto sobre Serviços de Qualquer Natureza – ISSQN descritos nos subitens 7.2 e 7.5 da Lista de Serviços constante do Anexo I deste Código é o preço total do serviço, dela podendo ser deduzidos o valor das subempreitadas já tributadas pelo imposto e os valores dos materiais que se incorporarem definitivamente à obra, fornecidos pelo prestador de serviço, desde que devidamente comprovados, e nas seguintes condições:
I - A dedução dos materiais na base de cálculo do ISSQN das empresas enquadradas na forma deste parágrafo fica autorizada por uma das duas formas elencadas abaixo, conforme opção do prestador de serviços: a) Dedução Real: o prestador do serviço referido neste parágrafo poderá abater os valores dos materiais aplicados por eles na respectiva obra, sem limite de dedução, desde que devidamente comprovados na forma contida neste parágrafo; b) Regime Presumido: independentemente de comprovação, o prestador do serviço referido neste parágrafo poderá optar por deduzir 40% (quarenta por cento) do valor total do serviço, constante no documento fiscal (Nota Fiscal de Serviço – NFs), a título de materiais incorporados à obra; ficando a base de cálculo do ISSQN correspondente a 60% (sessenta por cento) do valor total do respectivo documento fiscal;
II - As deduções reais da base de cálculo ficam condicionadas ao preenchimento obrigatório dos campos existentes na emissão da NFS-e (nota fiscal de serviço eletrônica), através da apresentação dos documentos fiscais de aquisição dos materiais ou dos serviços subempreitados, de modo a confirmar o respectivo abatimento, pelo fisco municipal.
III - Caso o prestador não tenha apresentado a documentação comprobatória de dedução, o tomador do serviço deverá obrigatoriamente realizar a retenção a título de ISS sobre 60% (sessenta por cento) do valor total da nota fiscal de serviços;
IV - Caberá ao tomador do serviço, na condição de substituto tributário, o aceite das informações e deduções lançadas pelo prestador na nota fiscal de serviço, tendo por base os documentos nela anexados. [...]"
(incisos V–X sobre documentação, tabela por decreto, subempreitadas e regime presumido — íntegra em `esperanca-lc80-2017.txt`.)
Outros §§: § 4º "Não serão deduzidos do preço do serviço os descontos e abatimentos condicionados [...]"; § 5º (item 9.2 — passagens e hospedagem pagas a terceiros); § 6º/§ 7º (item 17.6 — despesas de veiculação etc.); § 8º (subitem 3.4 proporcional); "§ 9º Na prestação de serviços por profissionais autônomos e sociedades uniprofissionais o imposto será calculado com base em valores fixos."; § 10 (diversões públicas, item 12). Art. 61 (cooperativas — deduções, "V - Não poderá resultar em base de cálculo inferior a 10%(dez por cento) do total dos ingressos decorrentes da atividade.").

**Alterações da LC 132/2025 na base:**
- Art. 3º acrescenta ao art. 59: "§14. Quando se tratar da prestação dos serviços descritos no subitem 19.02 do Anexo I desta Lei Complementar, consideram-se repasses não tributáveis pelo Imposto sobre Serviços de Qualquer Natureza (ISSQN) a dedução das importâncias de que tratam os incisos III e V do caput do Art. 30, da Lei n.º 13.756/2018, com redação dada pela Lei n.º 14.790/2023, bem como o percentual de 12% (doze por cento) do produto da arrecadação da loteria de apostas de quota fixa em meio físico ou virtual, com destinação estabelecida pelo §1º-A do mesmo dispositivo legal."
- Art. 6º: "Fica alterada a redação do art. 59, § 2º, inciso II, alínea “b” da Lei Complementar Municipal nº 80, de 27 de dezembro de 2017, que passa a vigorar com as seguintes alterações: “[...] Art. 59, § 2º, inc. II, "b". Para fins de ISS nas atividades de construção civil, a base de cálculo é o preço do serviço. Somente poderão ser excluídos da base de cálculo os valores relativos a materiais produzidos pelo prestador fora do local da obra e comercializados em operação sujeita ao ICMS, quando comprovados documentalmente. [...]”"
  **[NOTA — ambiguidade real]** no texto da LC 80 obtido, o inciso **II** do § 2º do art. 59 **não tem alíneas**; a alínea "b" existente é a do inciso **I** ("Regime Presumido", 40%). A LC 132 não diz expressamente se revoga o regime presumido de 40% nem a dedução real de materiais do inciso I, "a". A redação nova conflita materialmente com o inciso I. Pendência para decisão humana/consulta ao fisco municipal.

### 3.5 Alíquotas (art. 62)
**Redação original LC 80 (inciso I, substituído):** "a) 2,5% [...] informática, item 1; b) 2,5% [...] pesquisas e desenvolvimento, item 2; c) 3,5% [...] saúde, item 4; d) 4% [...] educação, item 8; e) 5% [...] demais serviços".

**Redação vigente do inciso I — LC 132/2025, art. 4º (literal):**
"Art. 62. O ISSQN será calculado com base nas seguintes alíquotas e valores: I - na prestação de serviços por empresas: a) 2% (dois por cento) para os serviços de informática e congêneres, descritos no item 1, e seus subitens, da Lista de Serviços constante do Anexo I deste Código e para os serviços do subitem 10.9 e 10.5, da Lista de Serviços constante do Anexo I deste Código; b) 2 % (dois por cento) para os serviços de pesquisas e desenvolvimento de qualquer natureza, descritos no item 2 da Lista de Serviços constante do Anexo I deste Código; c) 2% (dois por cento) para os serviços de saúde, assistência médica e congêneres, descritos no item 4, e seus subitens, da Lista de Serviços constante do Anexo I deste Código; d) 3,6% (três inteiros e seis décimos por cento) para os serviços de registros públicos, cartorários e notariais descritos no item 21 da Lista de Serviços constante do Anexo I deste Código; e) 3% (três por cento) para os serviços de educação, ensino, orientação pedagógica e educacional, instrução, treinamento e avaliação pessoa de qualquer grau ou natureza, descritos no item 8, e seus subitens, da Lista de Serviços constante do Anexo I deste Código; f) 5% (cinco por cento) para os demais serviços descritos nos itens e subitens da Lista de Serviços constante do Anexo I deste Código;"

Tabela para codificar (derivada literalmente do texto acima):

| Item/subitem da lista | Alíquota (empresas) |
|---|---|
| item 1 e subitens; subitens 10.05 e 10.09 ("10.9 e 10.5" no texto) | 2% |
| item 2 | 2% |
| item 4 e subitens | 2% |
| item 21 | 3,6% |
| item 8 e subitens | 3% |
| demais | 5% |

**Incisos II e III (não alterados pela LC 132 — continuam os da LC 80):**
"II - Para os profissionais autônomos regularmente inscritos, conforme definidos na legislação tributária, o imposto será devido à razão de: a) 20 (vinte) UFRE por ano, em relação aos profissionais liberais, assim considerados aqueles que desenvolvem atividades intelectuais de nível universitário ou a este equiparado; b) 10 (dez) UFRE por ano, em relação aos profissionais autônomos que exerçam atividades técnicas de nível médio, inclusive despachante, artista plástico, representante comercial, agente intermediador de qualquer natureza, cabeleireiro, decorador, digitador ou datilógrafo, músico, fotógrafo, Leiloeiro, motorista, tradutor ou intérprete; c) 04 (quatro) UFRE por ano, em relação aos profissionais autônomos de nível elementar cujas atividades não estejam enquadradas nos incisos anteriores.
III - na prestação de serviços por sociedades uniprofissionais: 20 UFRE ao ano, por cada profissional habilitado, sócio, empregado ou não, que preste serviços em nome da sociedade, embora assumindo responsabilidade pessoal, nos termos da Lei."
§ 1º, I: "profissional autônomo: a pessoa física que habitualmente e sem subordinação jurídica ou dependência hierárquica exerça atividade econômica de prestação de serviço, em caráter pessoal, ainda que com o auxílio de até três pessoas físicas, com ou sem vínculo empregatício;" § 1º, II: requisitos da sociedade uniprofissional, alíneas a–g, com 21 categorias (íntegra no `.txt`).
"§ 4º Aos autônomos não regularmente inscritos, ou quando não caiba a cobrança na forma do inciso II, o imposto será recolhido mediante aplicação da alíquota de 5% (cinco por cento) sobre a base de cálculo."
Isenções (art. 87, I–VIII) — íntegra no `.txt`; ex.: "I - os que aufiram, no exercício de suas atividades, receita anual inferior a 50 (cinquenta) UFRE, com exceção de profissionais liberais e autônomos;".

### 3.6 Novo Anexo I (Lista de Serviços) — LC 132/2025, art. 11
"Art. 11. Ficam alteradas as redações dos Anexos I e II Lei Complementar Municipal nº 80, de 27 de dezembro de 2017, que passa a vigorar com as seguintes alterações: ANEXO I – LISTA DE SERVIÇOS"
O novo Anexo I traz, além de "Item" e "Descrição do serviço", um grupo de colunas "Domicílio fiscal -" com cabeçalhos **girados** que o `pdftotext` embaralha. Recuperei-os com pdfjs: **"Estab. do prestador" | "Estab. do tomador" | "No local de prestação" | "Retenção na fonte"**. Mapeei cada "x" à coluna pela posição horizontal (x=226/241/255/269 na metade esquerda, 492/506/521/535 na direita) e ao subitem pela mesma linha. Resultado em `esperanca-lc132-2025-anexoI-colunas-DERIVADO.csv` (202 subitens com marca; 158 só "Estab. do prestador"; 2 marcas sem código na mesma linha — p.8 y=716 e p.10 y=322 — precisam de conferência visual).
Subitens com marca diferente de só "prestador":
- **Estab. do tomador:** 4.22, 4.23, 5.09, 10.04, 15.01, 15.09, 17.05 (este também "Retenção na fonte").
- **No local de prestação + Retenção na fonte:** 3.05, 7.02, 7.04, 7.05, 7.09, 7.10, 7.12, 7.16, 7.17, 7.19, 11.02, 17.10.
- **No local de prestação (sem retenção):** 7.11, 7.18, 11.01, 11.04, 12.01–12.12, 12.14–12.17, 16.01, 16.02, 20.01, 20.02, 20.03.
**[NOTA]** este mapeamento é **derivado por posição** e não substitui leitura visual do PDF (pp. 8–11 do Quinzenário 206). Recomendo conferir com uma pessoa olhando a página antes de codificar.

### 3.7 Outras alterações da LC 132/2025 (resumo por artigo, texto literal no `.txt`)
- Art. 1º: acrescenta arts. 12-A e 12-B (IPTU de loteamentos, "lotes virtuais", redutores 70%/50%).
- Art. 2º: nova redação do art. 45 (ITBI: SFH 0,5% sobre financiado / 2,0% restante; MCMV 0,5%; "III - 2,0% nas demais transmissões a título oneroso").
- Art. 3º: § 14 do art. 59 (subitem 19.02, apostas) — acima.
- Art. 4º: art. 62, I (alíquotas) — acima.
- Art. 5º: "Art. 86-A. O Município poderá aderir ao Padrão Nacional de Nota Fiscal de Serviço eletrônica (NFS-e) e a ambientes nacionais de compartilhamento de dados fiscais, na forma de regulamento [...]".
- Art. 6º: art. 59 § 2º "inc. II, b" (construção civil) — acima, com ambiguidade.
- Art. 7º: § 3º do art. 238 (desconto de juros e multa do ISS à vista, por decreto).
- Art. 8º: art. 239-A (mediação/parcelamento; convênio com MPPB).
- Art. 9º: "Art. 239-B. Autorizar o Poder Executivo Municipal, através de Decreto Executivo, a estabelecer desconto de até 10% (dez por cento) sobre o Imposto Sobre Serviços de Qualquer Natureza para pagamentos efetuados até o último dia útil do mês de sua competência."
- Art. 10: § 3º do art. 297 (parcelamento de ISS não inscrito em dívida ativa).
- Art. 11: novos Anexos I (lista) e II (TLF). Art. 12: alterações no Anexo III (taxas de expediente).
- **Vigência:** "Art. 13. Esta Lei Complementar entra em vigor na data de sua publicação, observadas as regras constitucionais de anterioridade quando aplicáveis às alterações de natureza tributária." Data: "Esperança/PB, 30 de dezembro de 2025." Publicação: Quinzenário nº 206 (período 16 a 31/12/2025). **[NOTA]** a lei não fixa data de efeito para as alíquotas; a aplicação da anterioridade (anual/nonagesimal) a cada alteração é questão jurídica que não resolvo aqui.

### 3.8 Simples Nacional
**Ausente.** A LC 80 (arquivo obtido) e a LC 132 não contêm tratamento de ISS de optantes pelo Simples Nacional (busca por "Simples Nacional", "123/2006", "123, de 14": zero ocorrências no ISS). O regime decorre da LC federal 123/2006, não obtida nesta coleta.

---

## 4. SIOPE (FNDE)

### 4.1 O que foi obtido
- Página oficial de downloads (https://www.fnde.gov.br/siope/download.do): "Municipal - 2026 | Instalador do Sistema | 2026 Anual | 26.0.3.6 | 28 MB | 25/09/2026 | Correção para ocorrência de crítica 500 na condição 8. Sistema Operacional indicado: Windows 11." Rodapé "Versão: 23.09.2026#5a1863". Anos anteriores: 2025 Anual 25.0.5.6 (24/07/2026), 2024 Anual 24.5.4.9 (05/08/2026), etc.
- **Não há, em nenhuma página oficial acessada, leiaute de importação publicado como arquivo próprio.** A página "Manuais do Siope" só lista manuais 2005–2018, e os links antigos (`fnde.gov.br/index.php/...download=118xx`) redirecionam para a página inicial do FNDE (verificado: HTTP 200 com HTML da home).
- O leiaute **está dentro do manual embarcado no instalador oficial 2026**: extraí `app\Manual_SIOPE_2026.pdf` com `innoextract` 1.9 (listagem: `app\SIOPE_2026.exe` 49,5 MiB e `app\Manual_SIOPE_2026.pdf` 17,9 MiB). **O instalador não foi executado.**

### 4.2 Formato — texto literal do Manual_SIOPE_2026.pdf
Menu Arquivo: "Exporta dados de planilhas em arquivo no formato CSV." / "Importa dados de planilhas de arquivo no formato CSV." / "Permite importar para a planilha de receita total do SIOPE os dados do Siops do Ministério da Saúde [...]" / "Observação: Arquivos no formato CSV: pode ser aberto no Excel e o conteúdo é apresentado separado com ponto e vírgula."
"O SIOPE permite que os dados preenchidos nas planilhas sejam exportados para um arquivo em formato de texto separado por ponto-e-vírgula (CSV) [...]. O SIOPE também permite que você importe os dados de um arquivo neste formato (o layout deste arquivo está descrito neste manual). Para isso acesse o menu Arquivos e selecione a opção Importar Dados de arquivo CSV. [...] o SIOPE perguntará se você deseja importar todos os dados do arquivo ou apenas um item e suas subplanilhas."

**Quadro 10: Campos dos arquivos CSV** (receitas/despesas/demais planilhas — literal):
1. "Pode ser "V" para indicar que se trata de uma linha contendo valores de uma planilha do SIOPE ou "T" para indicar que é apenas uma linha de texto usada para controle dos usuários “I” para linhas referentes às planilhas “Remuneração dos Profissionais de Educação” [...]. Na exportação para arquivo CSV, o SIOPE grava algumas linhas com o valor "T" neste campo. Estas linhas são o nome da planilha, os títulos das colunas da planilha e os totalizadores existentes na planilha. Já na importação, todas as linhas começadas por "T" são ignoradas. Os demais campos explicados nesta tabela só se aplicam às linhas em que este campo possui o valor "V"."
2. "É o código da instituição a que pertence os valores da linha. Para as planilhas da administração consolidada, este campo deve ser preenchido com "1"."
3. "É o código de identificação das planilhas usado pelo SIOPE. Tabela 2 - Código de Identificação das Planilhas de Administração Consolidada."
4. "Código da conta a que corresponde a linha. Neste campo somente os caracteres numéricos serão considerados pelo SIOPE; assim, o código pode conter caracteres de formatação ou não."
5. "É o nome da conta. Este campo não é utilizado durante a importação e existe apenas para facilitar a identificação dos dados exportados pelo SIOPE."
6+. "O sexto campo e os posteriores correspondem aos valores de cada coluna da planilha. Estes valores devem estar na mesma ordem em que estão as colunas na planilha do SIOPE. Caso haja na linha do arquivo mais valores que o número de colunas da planilha do SIOPE, os valores extras serão desconsiderados. Caso haja menos valores na linha do que o número de colunas da planilha do SIOPE, então as últimas colunas da planilha não serão preenchidas por nenhum valor."

**Quadro 11: Campos do arquivo CSV para planilha da Remuneração dos Profissionais de Educação** (literal):
1 “I” [...]; 2 Número sequencial iniciado por 0; 3 Mês de referência; 4 CPF do profissional da educação; 5 Nome do profissional da educação; 6 "Código do local de exercício fornecido pelo INEP. [...] No caso da Secretaria de Educação informar “99999999”."; 7 Nome do local de exercício; 8 Carga horaria; 9 Código do tipo de categoria; 10 Nome do tipo de categoria; 11 Código da categoria profissional; 12 Nome da categoria profissional; 13 Situação; 14 Salário ou vencimento básico; 15 Remuneração bruta com a parcela mínima de 60% do FUNDEB; 16 Remuneração bruta com a parcela máxima de 40% do FUNDEB; 17 Remuneração bruta com outras receitas; 18 Total da remuneração.
"OBS: Todos os campos são de preenchimento obrigatório, sendo permitido, somente, para os campos 14,15 e/ou 16 o valor 0 (zero)."
Exemplo literal do manual:
```
T;Dados Gerais \ Remuneração dos Profissionais de Educação \ 01 - Janeiro
I;0;01;12345678901;JOSE;99999999;SEC MUN DE EDUC DE BUJARI;10;1;PROFISSIONAIS DO MAGISTÉRIO;6;Docente graduado bacharél e tecnólogo com diploma de mestrado ou doutorado na área do componente curricular da educação profissional técnica de nível médio;1;Outros;0,01;0,02;0,03;0,04;0,09
I;1;01; 12345678901;MARIA;12009342;ESC BURITI;20;2;OUTROS PROFISSIONAIS;16;Profissionais que atuam na realização das atividades requeridos nos ambientes de secretaria, de manutenção em geral.;1;Outros;545,64;3,21;5,64;31,32;40,17
```
**[NOTA — inconsistências no próprio manual]** (a) no exemplo, o campo 13 vem como "1;Outros" (código **e** nome), deslocando os campos seguintes — o exemplo tem 19 campos, o Quadro 11 lista 18; (b) no exemplo, a "Situação" código 1 aparece com texto "Outros", mas a tabela de situação diz 1 = Efetivo; (c) a segunda linha tem espaço antes do CPF. Decimal com **vírgula**. Nenhuma codificação de caracteres (UTF-8/ANSI) é declarada no manual.
Instrução oficial para gerar leiaute de referência: "pedimos que preencha alguns registros na planilha de remuneração [...] Clique no menu “arquivo” e em seguida clique em “Exportar dados para arquivo CSV”, e clique em “apenas item selecionado e suas planilhas”. Feito isso, o sistema vai gerar um arquivo CSV com o layout que será reconhecido pelo Siope. Utilize este arquivo como exemplo para migrar os dados de outros sistemas para o Siope."
Validação na importação: "O SIOPE efetuará uma verificação em todos os registros e campos do arquivo “.csv” e, na ocorrência de erros, o sistema apresentará uma lista indicando o número da linha e os erros encontrados."

Códigos (literal, tópico 9.2): Tipo de categoria **1 Profissionais do magistério** (categorias 1–13) e **2 Outros profissionais da educação** (14 Auxiliar/Assistente Educacional; 15 "Profissionais que exercem funções de secretaria escolar, alimentação escolar (merendeiras), multimeios didáticos e infraestrutura."; 16 "Profissionais que atuam na realização das atividades requeridos nos ambientes de secretaria, de manutenção em geral."). Categorias 1–13: 1 Docente habilitado em curso de nível médio; 2 ... pedagogia; 3 ... licenciatura plena; 4 ... programa especial de formação pedagógica de docentes; 5 Docente pós-graduado em cursos de especialização para formação de docentes para educação profissional técnica de nível médio; 6 Docente graduado bacharel e tecnólogo com diploma de mestrado ou doutorado na área do componente curricular da educação profissional técnica de nível médio; 7 Docente professor indígena sem prévia formação pedagógica; 8 Docente instrutor, tradutor e intérprete de libras.; 9 Docente professor de comunidade quilombola; 10 Profissionais não habilitados, porém autorizados a exercer a docência em caráter precário e provisório na educação infantil e nos anos iniciais do ensino fundamental.; 11 Profissionais graduados, bacharéis e tecnólogos autorizados a atuar como docentes, em caráter precário e provisório, nos anos finais do ensino fundamental e no ensino médio e médio integrado à educação.; 12 Profissionais experientes, não graduados, autorizados a atuar como docentes, em caráter precário e provisório, no ensino médio e médio integrado à educação profissional técnica de nível médio.; 13 Profissionais em efetivo exercício no âmbito da educação infantil e ensino fundamental.
Situação: "1 Efetivo; 2 Temporário; 3 Profissional da educação em atividade alheia à MDE; 4 Outros".

### 4.3 Periodicidade (literal)
"1º bimestre: Janeiro e Fevereiro; [...] 6º bimestre: Novembro e Dezembro. Cabe ressaltar, que a partir de 2017, o Siope passou a ser bimestral. Com isso, o prazo para a transmissão dos dados do Siope Bimestral será até trinta dias após o término do bimestre, conforme dispõe o art. 165, § 3º da Constituição Federal. Relembramos que o prazo para transmissão dos dados do Siope Anual é até trinta de janeiro para os Municípios, para os Estados e DF, de acordo com o disposto na Portaria Interministerial 424, de 30/12/2016."
Dicionário de dados 2019: "TP_PERIODO Tipo do período ( A-anual, S-semestral, B-bimestral) [...] A partir de 2017, os dados passaram a ser bimestrais, sendo o período 6 a consolidação anual".

### 4.4 O que aceita importação vs. digitação (segundo o manual)
- Importação CSV: planilhas de Receita/Despesa/demais (linhas "V", Quadro 10) e Remuneração (linhas "I", Quadro 11).
- Importação da **receita total** a partir do **Siops** (saúde).
- Importação do **Censo Escolar** para Remuneração (só CPF, nome e lotação; "necessita que seu computador esteja conectado na internet").
- "Incorporar dados" de outra cópia de segurança do SIOPE (mesmo ano e ente).
- Justificativas e demais itens: o manual não prevê importação.

### 4.5 NÃO obtido (declaração exata)
- **"Tabela 2 - Código de Identificação das Planilhas de Administração Consolidada"**: citada no Quadro 10, **não consta** do Manual_SIOPE_2026.pdf (busca pelo título retorna apenas a própria remissão). Não localizada em página oficial.
- **Plano de contas SIOPE** (códigos de receita/despesa por planilha, funções/subfunções e códigos MDE/Fundeb) na forma usada pela importação: **não publicado** em arquivo oficial encontrado. O único indício é `rreo-municipal-estrutura.xlsx` (FNDE, dados analíticos), que usa contas no padrão `4.17.22.01.01.00`, `3.31.90.01.00.00.1` e subfunções 361/362/363/364/365, mas é de 2018 e baseado na Lei 11.494/2007 — **não serve** como tabela vigente. Provavelmente o plano está nos metadados do `SIOPE_2026.exe` (não extraído — exigiria executar ou fazer engenharia reversa do binário).
- Codificação de caracteres do CSV: **não declarada** em documento oficial.
- Leiaute XML: o sistema grava "Cópia de Segurança XML", mas **não há leiaute XML publicado** para importação.
- Data/versão do manual: o PDF não traz número de versão próprio além de "(3ª Revisão)" e "Tutorial – SIOPE 2024" na abertura; a data do arquivo só é inferível pela versão do instalador (26.0.3.6, 25/09/2026).

---

## 5. FAP

### 5.1 Decreto 3.048/1999, art. 202-A (Planalto; somente redação vigente)
"Art. 202-A. As alíquotas a que se refere o caput do art. 202 serão reduzidas em até cinquenta por cento ou aumentadas em até cem por cento em razão do desempenho da empresa, individualizada pelo seu CNPJ em relação à sua atividade econômica, aferido pelo Fator Acidentário de Prevenção - FAP. (Redação dada pelo Decreto nº 10.410, de 2020)
§ 1º O FAP consiste em multiplicador variável em um intervalo contínuo de cinco décimos a dois inteiros aplicado à respectiva alíquota, considerado o critério de truncamento na quarta casa decimal. (Redação dada pelo Decreto nº 10.410, de 2020)
§ 2º Para fins da redução ou da majoração a que se refere o caput, o desempenho da empresa, individualizada pelo seu CNPJ será discriminado em relação à sua atividade econômica, a partir da criação de índice composto pelos índices de gravidade, de frequência e de custo que pondera os respectivos percentis. (Redação dada pelo Decreto nº 10.410, de 2020)
[...]
§ 5º O Ministério da Economia publicará, anualmente, no Diário Oficial da União, portaria para disponibilizar consulta ao FAP e aos róis dos percentis de frequência, gravidade e custo por subclasse da Classificação Nacional de Atividades Econômicas. (Redação dada pelo Decreto nº 10.410, de 2020)
§ 6º O FAP produzirá efeitos tributários a partir do primeiro dia do quarto mês subseqüente ao de sua divulgação. (Incluído pelo Decreto nº 6.042, de 2007).
§ 7º Para o cálculo anual do FAP, serão utilizados os dados de janeiro a dezembro de cada ano, até completar o período de dois anos, a partir do qual os dados do ano inicial serão substituídos pelos novos dados anuais incorporados. (Redação dada pelo Decreto nº 6.957, de 2009)
§ 8º O FAP será calculado a partir de 1º de janeiro do ano seguinte àquele ano em que o estabelecimento completar dois anos de sua constituição. (Redação dada pelo Decreto nº 10.410, de 2020)"
**[NOTA]** (a) A redação anterior do § 1º (Decreto 6.957/2009) dizia "(0,5000) a dois inteiros (2,0000), aplicado com quatro casas decimais, considerado o critério de **arredondamento** na quarta casa decimal" — está **tachada** no Planalto; a vigente fala em **truncamento** e não repete "quatro casas". A precisão de 4 casas vigente vem do eSocial (5.4) e da página do MPS ("varia de 0,5000 a 2,0000"). (b) No HTML do Planalto, o § 6º tem apenas o símbolo "§" dentro de `<strike>` e o texto não tachado, sem anotação de revogação — tratei como vigente, mas é marcação atípica.
**Art. 202-B (contestação com efeito suspensivo) está REVOGADO:** "Art. 202-B. O FAP atribuído às empresas pelo Ministério da Previdência Social poderá ser contestado [...] § 3º O processo administrativo de que trata este artigo tem efeito suspensivo." — todo tachado, "(Revogado pelo Decreto nº 10.410, de 2020)".
Art. 202, caput (base do RAT): "[...] incidentes sobre o total da remuneração paga, devida ou creditada a qualquer título, no decorrer do mês, ao segurado empregado e trabalhador avulso: I - um por cento [...] leve; II - dois por cento [...] médio; ou III - três por cento [...] grave."

### 5.2 Lei 10.666/2003, art. 10
"Art. 10. A alíquota de contribuição de um, dois ou três por cento, destinada ao financiamento do benefício de aposentadoria especial ou daqueles concedidos em razão do grau de incidência de incapacidade laborativa decorrente dos riscos ambientais do trabalho, poderá ser reduzida, em até cinqüenta por cento, ou aumentada, em até cem por cento, conforme dispuser o regulamento, em razão do desempenho da empresa em relação à respectiva atividade econômica, apurado em conformidade com os resultados obtidos a partir dos índices de freqüência, gravidade e custo, calculados segundo metodologia aprovada pelo Conselho Nacional de Previdência Social."

### 5.3 Portaria Interministerial MPS/MF nº 10/2025 (FAP vigente em 2026) — DOU 24/09/2025
Ementa: "Dispõe sobre a disponibilização do resultado do processamento do Fator Acidentário de Prevenção - FAP em 2025, com vigência para o ano de 2026, e dos róis dos percentis [...]"
"Art. 1º Serão disponibilizados pelo Ministério da Previdência Social - MPS, no dia 30 de setembro de 2025 [...] II - o Fator Acidentário de Prevenção - FAP calculado em 2025 e vigente para o ano de 2026, juntamente com as respectivas ordens de frequência, gravidade, custo e demais elementos que possibilitem ao estabelecimento (CNPJ completo) verificar o respectivo desempenho dentro da sua Subclasse da CNAE."
"Art. 2º O FAP atribuído aos estabelecimentos (CNPJ completo) pelo Ministério da Previdência Social poderá ser contestado perante o Conselho de Recursos da Previdência Social, exclusivamente por meio eletrônico [...] § 4º O formulário eletrônico de contestação deverá ser preenchido e transmitido no período de 1° de novembro de 2025 a 30 de novembro de 2025. [...] **§ 6º A contestação de que trata este artigo não possui efeito suspensivo.**"
"Art. 3º Da decisão proferida pelo Conselho de Recursos da Previdência Social caberá recurso, exclusivamente por meio eletrônico, no prazo de trinta dias, contado da data da publicação do resultado no DOU."
"Art. 5º Esta Portaria entra em vigor no dia 30 de setembro de 2025."
(Art. 2º § 2º, V, nota (**): "excetuados os vinculados a Regimes Próprios de Previdência".)
Página MPS (literal): "O Fator Acidentário de Prevenção – FAP é um multiplicador, atualmente calculado por estabelecimento, que varia de 0,5000 a 2,0000, a ser aplicado sobre as alíquotas de 1%, 2% ou 3% da tarifação coletiva por subclasse econômica, incidentes sobre a folha de salários das empresas [...]. O FAP varia anualmente."
**[NOTA]** a página do MPS acessada lista portarias até "Ano 2025"; **não verifiquei** se já saiu a portaria de 2026 (FAP vigente em 2027).

### 5.4 FAP e RPPS
- Lei 8.212, art. 13: "O servidor civil ocupante de cargo efetivo ou o militar da União, dos Estados, do Distrito Federal ou dos Municípios, bem como o das respectivas autarquias e fundações, são excluídos do Regime Geral de Previdência Social consubstanciado nesta Lei, desde que amparados por regime próprio de previdência social."
- Lei 8.212, art. 22, II: "para o financiamento do benefício previsto nos arts. 57 e 58 da Lei nº 8.213, de 24 de julho de 1991, e daqueles concedidos em razão do grau de incidência de incapacidade laborativa decorrente dos riscos ambientais do trabalho, sobre o total das remunerações pagas ou creditadas, no decorrer do mês, aos segurados empregados e trabalhadores avulsos: a) 1% [...] leve; b) 2% [...] médio; c) 3% [...] grave."
- **[NOTA]** conclusão pelo texto: RAT/FAP incide sobre remuneração de **segurados empregados e avulsos do RGPS**; servidor efetivo amparado por RPPS está excluído do RGPS (art. 13). Não há texto que aplique FAP ao RPPS.

### 5.5 eSocial S-1.3 (leiaute oficial)
S-1005, grupo `aliqGilrat`:
- `aliqRat` — E, N, 0-1, Tam 1, Dec "-": "Informar a alíquota RAT, quando divergente da legislação vigente para a atividade (CNAE) preponderante. [...] Valores válidos: 1, 2, 3".
- `fap` — E, N, 0-1, **Tam 1-5, Dec 4**: "Fator Acidentário de Prevenção - FAP. Validação: Preenchimento obrigatório e exclusivo por Pessoa Jurídica e: a) ideEstab/tpInsc = [4] e o campo cnpjResp não estiver informado; ou b) ideEstab/tpInsc = [1, 4] e o fator informado for diferente do definido pelo órgão governamental competente para o estabelecimento ou para o CNPJ responsável pela inscrição no CNO (neste caso, deverá haver informações de processo em procAdmJudFap); ou c) ideEstab/tpInsc = [1, 4] e o estabelecimento ou o CNPJ responsável pela inscrição no CNO não for encontrado na tabela FAP. Se informado, deve ser um número maior ou igual a 0,5000 e menor ou igual a 2,0000 [...]".
- **`aliqRatAjust` não existe no S-1005 na versão S-1.3.** Existe no **S-5011** (totalizador, `infoEstab`): `aliqRatAjust` — E, N, 0-1, **Tam 1-5, Dec 4**: "Alíquota do RAT após ajuste pelo FAP. Validação: Informação obrigatória e exclusiva se ideEmpregador/tpInsc = [1]. Deve corresponder ao resultado da multiplicação dos campos infoEstab/aliqRat e infoEstab/fap." — **[NOTA]** o leiaute não define arredondamento nem truncamento desse produto.

---

## 6. Natureza 3.1.90.13 × 3.1.91.13

### 6.1 Portaria Conjunta STN/SOF nº 163/2001, consolidada (arquivo do Tesouro, versão 11/11/25)
Anexo II — modalidade (p. 16 do PDF): "91 - Aplicação Direta Decorrente de Operação entre Órgãos, Fundos e Entidades Integrantes dos Orçamentos Fiscal e da Seguridade Social — Despesas orçamentárias de órgãos, fundos, autarquias, fundações, empresas estatais dependentes e outras entidades integrantes dos orçamentos fiscal e da seguridade social decorrentes da aquisição de materiais, bens e serviços, pagamento de impostos, taxas e contribuições, além de outras operações, quando o recebedor dos recursos também for órgão, fundo, autarquia, fundação, empresa estatal dependente ou outra entidade constante desses orçamentos, no âmbito da mesma esfera de Governo."
Anexo II — elemento (p. 18): "13 - Obrigações Patronais — Despesas orçamentárias com encargos que a administração tem pela sua condição de empregadora, e resultantes de pagamento de pessoal ativo, inativo e pensionistas, tais como Fundo de Garantia por Tempo de Serviço e contribuições para Institutos de Previdência, inclusive a alíquota de contribuição suplementar para cobertura do déficit atuarial, bem como os encargos resultantes do pagamento com atraso das contribuições de que trata este elemento de despesa."
Anexo III (p. 26): "3.1.90.13.00 Obrigações Patronais" e "3.1.91.13.00 **Contribuições Patronais**" (rótulo diferente na modalidade 91).
Art. (receita intra, p. do art. 2º): "§ 13. A natureza de receita intraorçamentária deve ser constituída substituindo-se o dígito referente às categorias econômicas 1 ou 2 pelos dígitos 7, se receita intraorçamentária corrente, ou 8, se receita intraorçamentária de capital, mantendo-se o restante da codificação."

### 6.2 MTO 2026, 4ª versão (páginas do PDF)
- p. 21: "Operações intraorçamentárias são aquelas realizadas entre órgãos e demais entidades da Administração Pública integrantes dos Orçamentos Fiscal e da Seguridade Social do mesmo ente federativo. Não representam novas entradas de recursos nos cofres públicos do ente, mas apenas fluxo financeiro interno de receitas entre seus órgãos. As receitas intraorçamentárias são contrapartida de despesas classificadas na modalidade de aplicação 91- Aplicação Direta Decorrente de Operação entre Órgãos, Fundos e Entidades Integrantes do Orçamento Fiscal e do Orçamento da Seguridade Social, que, devidamente identificadas, evitam a dupla contagem na consolidação das contas governamentais. Assim, a Portaria Interministerial STN/SOF nº 338, de 26 de abril de 2006, que alterou a Portaria Interministerial STN/SOF nº 163, de 2001, incluiu as Receitas Correntes Intraorçamentárias e Receitas de Capital Intraorçamentárias, representadas, respectivamente, pelos códigos 7 e 8 em suas categorias econômicas."
- p. 86: definição da modalidade 91 — **idêntica** à da Portaria 163 (6.1).
- p. 94: "13 - Obrigações Patronais" — **idêntica** à da Portaria 163.
- p. 248–249 (item 10.2.3, "Anexo III da Portaria Conjunta STN/SOF nº 163, de 2001, consolidada pela Portaria Conjunta STN/SOF/ME nº 103, de 5 de outubro de 2021"): "3.1.90.13.00 Obrigações Patronais" ... "3.1.91.13.00 Contribuições Patronais".

### 6.3 Criação da modalidade 91
- **Portaria Interministerial STN/SOF nº 688, de 14/10/2005: texto primário NÃO obtido.** Os endereços tentados no orcamentofederal.gov.br retornaram 404; a página do Tesouro "06.08.00 PORTARIAS" só traz a ementa: "Altera o Anexo II da Portaria Interministerial STN/SOF no 163, de 4.5.2001, e dá outras providências." (DOU 17/10/2005, segundo aquela página).
- Prova indireta primária (Portaria Interministerial nº 338/2006, `portaria-interministerial-338-2006.pdf`): "Considerando a necessidade de identificar as receitas decorrentes das operações intra-orçamentárias, a exemplo do que ocorre na despesa com a utilização da modalidade de aplicação “91 - Aplicação Direta Decorrente de Operação entre Órgãos, Fundos e Entidades Integrantes dos Orçamentos Fiscal e da Seguridade Social” [...] Art. 1o Definir como intra-orçamentárias as operações que resultem de despesas de órgãos, fundos, autarquias, fundações, empresas estatais dependentes e outras entidades integrantes dos orçamentos fiscal e da seguridade social decorrentes da aquisição de materiais, bens e serviços, pagamento de impostos, taxas e contribuições, quando o recebedor dos recursos também for órgão, fundo, autarquia, fundação, empresa estatal dependente ou outra entidade constante desses orçamentos, no âmbito da mesma esfera de governo. [...] Art. 3o Esta Portaria entra em vigor na data de sua publicação, aplicando-se seus efeitos a partir do exercício financeiro de 2007 [...] Art. 4o Revoga-se a partir de 1o de janeiro de 2007 o art. 2o da Portaria Interministerial STN/SOF no 688, de 14 de outubro de 2005."

### 6.4 MCASP 11ª edição (válido a partir de 2025)
- p. 449–450 do PDF (Parte III, RPPS): "Dessa forma, a contribuição previdenciária patronal, de ônus do próprio ente, constitui uma despesa intraorçamentária para o ente e uma receita intraorçamentária para o RPPS. Todavia, atenção especial deve ser conferida à transferência da contribuição dos servidores ao RPPS, pois, neste caso, o ente atua como depositário, sendo mero repassador ao RPPS dos recursos retidos dos servidores e beneficiários [...]"
- p. 451: "A Contribuição patronal corresponde à contribuição previdenciária devida pelo ente ao RPPS em decorrência da sua condição de empregador. [...] a. No Ente — i. Reconhecimento da obrigação patrimonial [...] D 3.1.2.1.2.xx.xx Encargos Patronais – RPPS – Intra OFSS / C 2.1.1.4.2.xx.xx Encargos Sociais a Pagar – Intra OFSS (P) — ii. Empenho [...] D 6.2.2.1.1.xx.xx Crédito Disponível / C 6.2.2.1.3.01.xx Crédito Empenhado a Liquidar — Natureza da despesa: 3.1.91.13"
- p. 529–530 (Parte IV, PCASP, 5º nível): "i. Contribuição patronal da Prefeitura ao Regime Próprio de Previdências Social (RPPS). Trata-se de uma operação entre entidades pertencentes ao mesmo OFSS. O passivo e a VPD serão excluídos na consolidação do ente e na consolidação nacional. [...] D 3.1.2.1.2.xx.xx Encargos Patronais – RPPS – Intra OFSS" e "i. Contribuição patronal da Prefeitura para o Regime Geral de Previdência Social (RGPS). Trata-se de uma operação entre entidades pertencentes a OFSS distintos. [...] D 3.1.2.2.3.xx.xx Encargos Patronais – RGPS – Inter OFSS – União / C 2.1.1.4.3.xx.xx Encargos Sociais a Pagar – Inter OFSS – União".
**[NOTA]** Portanto: patronal RPPS do próprio ente → 3.1.**91**.13 (intra, 5º nível PCASP = 2); patronal RGPS (INSS) → 3.1.**90**.13 (inter OFSS União, 5º nível = 3). O MCASP não traz, nos trechos extraídos, a natureza orçamentária do exemplo RGPS; a 3.1.90.13 decorre da definição da modalidade 90 (aplicação direta, recebedor fora do orçamento do ente).

---

## 7. SAGRES TCE-PB — livro "Dados da Contabilidade"

Páginas do livro (títulos literais, em 29/09/2026): "Layout do Sagres Captura" (atalho de estante) · "2024 - Versão 1.2" · "2025 - Versão 1.5" · "2026 - Versão 1" · "2027 - Versão 1 (Em andamento)" · "VERSÃO 1.1 (12/12/2025)".
- **Para 2026 não há versão mais nova que a 1.1 (12/12/2025).** A página v1.1 online está em "Revisão #4", criada 2025-12-12 11:27:32 UTC, atualizada 2026-02-02 13:09:33 UTC — **a mesma revisão e os mesmos carimbos** da cópia local.
- Existe "2027 - Versão 1 (Em andamento)", Revisão #13, atualizada **2026-09-29 16:54:09 UTC** (hoje). Síntese literal do início: "1. SÍNTESE DE MUDANÇAS PARA 2027 / Alteração da periodicidade de MENSAL para DIÁRIA das seguintes TABELAS: 4.17 [...] 4.19 Receita Extra; 4.20 Despesa Extra; 4.21 Estorno Receita Extra; 4.22 Estorno Despesa Extra; 4.28 [...] 4.34 [...]; 4.49 Normas Orçamentárias; 4.59 Movimentação Entre Contas Bancarias / Inclusão de novos tipos de retenção: 5 Outras Consignações; 6 Consignação referente a Empréstimos Consignados; 7 Consignação referente a pensão alimentícia; 8 Consignação referente a Previdência Própria vinculada a outro Ente Público / Inclusão de novos subelementos de despesas: 112 Contratação de carro pipa; 113 Contratação transporte escolar; 114 Contratação transporte de pessoas; 115 [...]". Documento em andamento, muda diariamente — não usar para 2026.
- **Comparação online × local** (`docs/oficial/tce-pb/layout-contabilidade-2026-v1.1-12122025.html`, sha256 b782a9a2...76a1, lido somente): extraí o conteúdo de `page-content` de ambos, normalizei tags/espaços e comparei linha a linha (11.908 linhas): **idênticos**, salvo a linha da tag de abertura (atributo `clearfix` × `dir="auto"`) e o rodapé de metadados de revisão que a cópia local traz em texto. Logo, as entidades **4.9 Estornos, 4.11 EstornoLiquidacao, 4.15 EstornoRetencao, 4.19 ReceitaExtra, 4.21 EstornoReceitaExtra, 4.22 EstornoDespesaExtra e 4.35 Fornecedores** (presentes nas linhas 1848, 2314, 3122, 3948, 4682, 4809 e 7239 do texto extraído) **não diferem** da cópia local.

---

## 9. Plano de contas SAGRES (TCE-PB) — flags `exige_retencao` / `exige_receita_extra`

### 9.1 O que o layout 2026 v1.1 diz (literal)
- 4.19 ReceitaExtra, regras: "O relacionamento com Retenção será obrigatório quando a Conta Contábil exigir, conforme a coluna "Exige Retenção?" no arquivo CSV; O ano do Empenho da Retenção deve ser do mesmo exercício; O campo codFonteRecurso será preenchido com as fontes 860, 861, 862 ou 869, padrão adotado pela STN para a movimentação extraorçamentária; Caso o relacionamento com a chave da Retencao não for exigido, os campos devem ser preenchidos com o caractere espaço (código 32 na tabela decimal do ASCII)."
- 5.28 PlanoDeContas: "Constituído pela IPC 00 – STN e Ajustes do TCE-PB. Nesta tabela, constam as contas contábeis que exigem retenção e/ou receita extraorçamentária. Plano de Contas - PCASP 2025" — o link desse texto é `https://tce.pb.gov.br/servicos/sagres-captura/Pcasp2024.xlsx`, que retorna **HTTP 404** (página de erro, 17.494 bytes). O mesmo link está na página "2027 - Versão 1 (Em andamento)".

### 9.2 Tentativas (todas em 29/09/2026)
- `https://tce.pb.gov.br/servicos/sagres-captura/{Pcasp2024,Pcasp2025,Pcasp2026,Pcasp_2025,Pcasp_2026,PCASP2026,pcasp2026,Pcasp2027}.xlsx` → **todas 404**; o diretório `/servicos/sagres-captura` também 404.
- GitLab do TCE-PB, `.../anexos/plano-contas-{2023..2027}.csv` → 404; só existe `plano-contas-2022.csv`.
- Página oficial https://tce.pb.gov.br/layout-sagres-2/ (downloads por exercício). Na seção **"2026"** o item **"PCASP"** aponta para `https://tce.pb.gov.br/wp-content/uploads/2024/12/Pcasp_2025.xlsx` — **o mesmo arquivo** da seção "2025" ("PCASP 2025 (29/10/2024)"). Seção "2024": `Pcasp2024_2.xlsx` ("Pcasp 2024 (26/02/24)"). **Não há arquivo de plano de contas próprio de 2026** publicado.

### 9.3 Conteúdo — arquivo vigente indicado para 2026: `Pcasp_2025.xlsx`
Uma planilha ("Planilha1"), cabeçalho: `ano_conta | codigo_conta_contabil | descricao_conta_contabil | exige_retencao | exige_receita_extra`. Contagem por `ano_conta` (valores 0/1; linhas com vazio contadas à parte):

| ano_conta | linhas | códigos distintos | exige_retencao = 1 | exige_receita_extra = 1 | ambos = 1 |
|---|---|---|---|---|---|
| 2020 | 1.373 | 1.373 | 0 | 0 | 0 |
| 2021 | 7.080 | 7.080 | 0 | 0 | 0 |
| 2022 | 7.490 | 7.490 | 32 | 60 | 30 |
| 2023 | 7.645 | 7.645 | 42 | 68 | 40 |
| 2024 | 7.792 | 7.792 | 42 | 68 | 40 |
| **2025** | **15.728** | **7.864** | **0** | **0** | **0** |
| **2026** | **nenhuma linha** | — | — | — | — |

Detalhes medidos:
- **ano 2025: todas as flags são 0** (15.656 linhas `[0,0]` e 72 linhas com flags vazias cujo valor foi parar na linha seguinte — ver abaixo, também `0,0`). Cada código de 2025 aparece **duas vezes**, com conteúdo idêntico (0 duplicatas divergentes).
- **Não existe `ano_conta` = 2026** no arquivo.
- O arquivo tem **linhas quebradas**: descrições com quebra de linha viraram linhas extras cujo `ano_conta` é texto (ex.: `[2025,361419900,"REDUÇÃO A VALOR RECUPERÁVEL DE DEMAIS INVESTIMENTOS ","",""]` seguida de `["PERMANENTES",0,0,"",""]`) — nessas, as flags ficam deslocadas para as colunas 2–3. Verifiquei todas as linhas de continuação: nenhuma carrega flag 1. Há ainda 4.536 linhas vazias.
- Amostra 2024 com flag (literal): `113810800 CRÉDITOS A RECEBER POR REEMBOLSO DE SALÁRIO FAMÍLIA PAGO (1,0)`, `113810900 ... SALÁRIO MATERNIDADE PAGO (1,0)`, `218810112 ASSISTENCIA A SAUDE - ADMINISTRAÇÃO PROPRIA (1,1)`, `218810113 RETENÇÕES - ENTIDADES REPRESENTATIVAS DE CLASSES (1,1)`, `218810114 RETENÇÕES - PLANOS DE SEGUROS (1,1)`, `218810115 RETENÇÕES - EMPRÉSTIMOS E FINANCIAMENTOS (1,1)`.

`Pcasp2024_2.xlsx`: só `ano_conta` 2024 — 7.792 linhas; exige_retencao=1: **42**; exige_receita_extra=1: **68**; ambos: **40** (distribuição `[0,0]` 7.682, `[1,0]` 2, `[1,1]` 40, `[0,1]` 28, vazios 40) — **idêntico** ao bloco 2024 do `Pcasp_2025.xlsx`.
`plano-contas-2022.csv` (GitLab): colunas `Código;Descrição;Exige Retenção?;Exige Receita Extra?` com "Sim"/"Não" (sem coluna de ano): Exige Retenção "Sim" 29 + "SIM" 2; Exige Receita Extra "Sim" 56; ambos "Sim" 29.

**[NOTA — conclusão]** para 2025 e 2026 **não há** conta marcada com `exige_retencao`/`exige_receita_extra` = 1 em nenhum arquivo publicado pelo TCE-PB. O último ano com marcações é **2024** (42 / 68 / 40). Se a regra 4.19 for codificada contra o arquivo oficial, em 2026 ela não exigirá retenção para nenhuma conta — o que provavelmente é falha de publicação do TCE-PB, não norma. Decisão fica para humano (fail-closed: não inventar marcações; registrar pendência com o TCE-PB).

## 10. Pendências / não obtido (resumo)
1. Portaria Interministerial STN/SOF 688/2005 — texto primário não encontrado (404).
2. Página da RFB "Retenção de IR por Estados, DF e Municípios" — não localizada.
3. SIOPE: Tabela 2 (códigos das planilhas), plano de contas SIOPE vigente, codificação do CSV, leiaute XML — não publicados/obtidos.
4. Portaria do FAP 2026 (vigência 2027) — não verificada.
5. Esperança: remissão da LC 132 art. 6º a "art. 59, § 2º, inc. II, b" inexistente no texto obtido; mapeamento de colunas do novo Anexo I é derivado por posição e pede conferência visual; data de efeito das novas alíquotas depende de análise de anterioridade.
6. Dispensa de R$ 10 (art. 3º § 6º da IN 1.234) não estendida expressamente ao art. 3º-A (municípios).
7. LC federal 116/2003 e LC 123/2006 não foram baixadas (fora do escopo pedido).
8. Plano de contas SAGRES 2026: não publicado; o link do layout (Pcasp2024.xlsx) dá 404; o arquivo indicado para 2026 (Pcasp_2025.xlsx) não tem linhas de 2026 e tem 2025 com todas as flags em 0.
