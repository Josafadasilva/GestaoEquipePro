# Versão Google Apps Script

Mesma avaliação de desempenho, rodando no Google Apps Script com uma planilha como banco de dados.
Os técnicos entram com a conta Google @triviatrens.com.br (sem senha própria do app).

- `Code.gs` — servidor (planilha, papéis, avaliações, feedback)
- `Index.html`, `Styles.html`, `App.html` — interface (montada "crua" pelo `doGet`)
- `appsscript.json` — executa como o dono, acesso restrito ao domínio

Instalação: crie o projeto na conta da Trivia, cole os arquivos, rode `configurar` uma vez e
implante como App da Web (Executar como: Eu · Acesso: Qualquer pessoa na Trivia Trens).
No portal, use o link `/exec?embed=1` na aba Ferramentas, abrindo em ABA.
