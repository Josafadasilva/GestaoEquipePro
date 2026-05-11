# GestaoEquipePro

Sistema web de gestão de equipe técnica, férias e avaliações de desempenho.

## Funcionalidades

- **Cadastro de técnicos** com vínculo a usuários do sistema
- **Controle de férias** com calendário de equipe e detecção de conflitos por base
- **Avaliações de desempenho** semestrais (autoavaliação + supervisor + feedback)
- **Dashboard** moderno com KPIs, status por base e strip de 14 dias
- **Geração de PDF** de avaliação completa
- Controle de acesso por role: `admin` (supervisor) e `user` (técnico)

## Tecnologias

- Node.js + Express
- Autenticação JWT (`jsonwebtoken`)
- Banco de dados em arquivo JSON (`lowdb@1.0.0`)
- Frontend vanilla JS + CSS (sem frameworks)

## Instalação

```bash
# 1. Clone o repositório
git clone https://github.com/SEU_USUARIO/GestaoEquipePro.git
cd GestaoEquipePro

# 2. Instale as dependências
npm install

# 3. Crie o banco de dados inicial
cp gestao.example.json gestao.json

# 4. (Opcional) Crie um .env com JWT_SECRET personalizado
echo "JWT_SECRET=sua_chave_secreta_aqui" > .env

# 5. Inicie o servidor
npm start
```

Acesse em: `http://localhost:3000`

## Primeiro acesso

Após copiar o `gestao.example.json` para `gestao.json`, use a opção **Solicitar Acesso** na tela de login para criar o primeiro administrador, ou edite o `gestao.json` manualmente adicionando um usuário com `"role": "admin"` e senha gerada com bcrypt.

## Variáveis de ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `3000` | Porta do servidor |
| `JWT_SECRET` | `gestao_secret_2025` | Chave de assinatura JWT |

## Estrutura

```
GestaoEquipePro/
├── server.js           # API REST (Express)
├── gestao.json         # Banco de dados (não versionado)
├── gestao.example.json # Estrutura de exemplo do banco
├── package.json
└── public/
    ├── index.html
    ├── app.js
    └── style.css
```
