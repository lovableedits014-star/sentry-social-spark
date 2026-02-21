

# Indicador "Apoiador Cadastrado" nos Comentarios

## Objetivo
Mostrar automaticamente nos comentarios quando o autor ja esta cadastrado como apoiador, evitando duplicacoes e facilitando a gestao.

## Como vai funcionar
- Ao lado do nome do autor do comentario, aparecera um badge verde com "Apoiador" quando ele ja estiver cadastrado na base
- Um tooltip explicara a classificacao atual (ativo, passivo, neutro, critico) e o nome cadastrado
- O botao "Adicionar aos Apoiadores" sera substituido por um indicador visual quando o autor ja estiver cadastrado

## Detalhes Tecnicos

### 1. Comments.tsx - Buscar apoiadores cadastrados
- Apos carregar os comentarios, fazer uma query em `supporter_profiles` para o client_id atual
- Construir um Map de `platform:platform_user_id` -> `{ name, classification }` com os dados do supporter vinculado
- Passar esse Map como prop `registeredSupporters` para `PostCard` e `CommentItem`

### 2. CommentItem.tsx - Exibir badge de apoiador
- Receber a nova prop `registeredSupporters`
- Verificar se o `platform:platform_user_id` do comentario existe no Map
- Se existir, mostrar um badge verde "Apoiador" com tooltip contendo nome e classificacao
- Esconder o botao "Adicionar aos Apoiadores" quando ja estiver cadastrado

### 3. PostCard.tsx - Repassar prop
- Receber e repassar `registeredSupporters` para cada `CommentItem`

### 4. AddToSupportersButton.tsx
- Nenhuma alteracao necessaria (o botao simplesmente nao sera renderizado quando o apoiador ja estiver cadastrado)

### Fluxo resumido

1. Pagina carrega comentarios + lista de supporter_profiles do cliente
2. Para cada comentario, verifica se o author_id ja existe em supporter_profiles
3. Se sim: badge verde "Apoiador" com tooltip da classificacao, sem botao de cadastro
4. Se nao: comportamento atual mantido (botao "Adicionar aos Apoiadores" visivel)

