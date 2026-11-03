# GestaoEquipePro

Gestão da equipe de sinalização da Trivia: cadastro de técnicos e avaliação de desempenho semestral
(autoavaliação → avaliação do supervisor → feedback → liberação para o técnico).
As férias ficam no app de férias da equipe, separado deste.

Visual no padrão do **Portal Manutenção Trivia**, pensado primeiro para o celular.

## O que cada perfil faz

**Técnico**
- Início com o "próximo passo" (fazer autoavaliação ou ver o feedback).
- Faz a autoavaliação (10 critérios, notas 1 a 5) e vê o resultado e o feedback quando liberados.

**Supervisor**
- Início com "Precisa da sua atenção": pedidos de cadastro, técnicos para avaliar,
  feedbacks pendentes e técnicos sem acesso ao app, além do andamento do semestre por base.
- Avaliação: progresso do semestre, filtros por situação e base, e um botão com o próximo passo
  de cada técnico (Avaliar → Dar feedback → Liberar → PDF).
- Equipe, pedidos de cadastro, usuários e nomes das bases.

## Instalação

```bash
npm install
npm start          # http://localhost:3000
```

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `MONGODB_URI` | sim | Conexão do MongoDB |
| `JWT_SECRET` | sim em produção | Chave longa e aleatória para assinar os logins |
| `ALLOWED_DOMAIN` | não | Domínio de e-mail aceito (padrão `triviatrens.com.br`) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | não | Primeiro supervisor, criado só se não existir nenhum. Sem senha definida, uma provisória é gerada e mostrada uma vez no log |
| `PORT` | não | Porta (padrão 3000) |

Quem entra com senha provisória (ou com a antiga senha padrão) é obrigado a trocar no primeiro acesso.

## Estrutura

```
server.js          API (Express + MongoDB); notas calculadas no servidor
public/index.html  estrutura das telas
public/style.css   visual (padrão Portal Trivia)
public/app.js      interface
```
