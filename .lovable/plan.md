

## Diagnóstico e Plano de Correção — Telemarketing + Indicados

### Problema Identificado

Verifiquei o banco de dados e confirmei: a indicada **Leiliane** continua com `ligacao_status: pendente` e `operador_nome: null`. A atualização **nunca chegou ao banco**, mesmo que o telemarketing tenha mostrado sucesso na tela.

**Causa raiz**: O Supabase, quando uma atualização é bloqueada por RLS (Row Level Security), **não retorna erro** — simplesmente atualiza 0 linhas. O código atual só verifica `error`, não verifica se alguma linha foi de fato alterada. Resultado: o estado local é atualizado (aparece como salvo na tela), mas o banco permanece inalterado.

O segundo problema: o painel do telemarketing usa o Supabase client que pode carregar uma sessão autenticada antiga (cookie do admin). Nesse caso, as políticas `anon` não se aplicam, e as políticas `authenticated` exigem ser o dono do client — o que não funciona para um operador sem conta Supabase.

### Plano de Correção (3 itens)

**1. Corrigir a gravação no Telemarketing** (`src/pages/Telemarketing.tsx`)
- Forçar logout do Supabase Auth ao entrar na central (garantir que opera como `anon`)
- Alterar o `handleSave` para usar `.select()` após o `.update()` e verificar se retornou dados (confirmar que a linha foi realmente atualizada)
- Se retornar vazio, mostrar toast de erro: "Falha ao salvar no banco"

**2. Remover contatos já ligados do funil** (`src/pages/Telemarketing.tsx`)
- Na carga inicial de contatos, filtrar fora quem já tem `ligacao_status` diferente de `pendente` e não-nulo
- Contatos que já "atenderam", "recusaram" ou "não atenderam" **não voltam** à fila
- O operador só vê contatos pendentes

**3. Atualizar a interface Indicado na aba Ligações** (`src/pages/Contratados.tsx`)
- Adicionar os campos `ligacao_status`, `vota_candidato`, `candidato_alternativo`, `operador_nome`, `ligacao_em` à interface `Indicado`
- Garantir que o `TelemarketingResultsPanel` receba e exiba corretamente esses dados dos indicados

### Detalhes Técnicos

- **RLS fix**: Chamar `await supabase.auth.signOut()` no `useEffect` inicial da página de Telemarketing para garantir role `anon`
- **Verificação de update**: Trocar `.update(data).eq("id", id)` por `.update(data).eq("id", id).select()` e checar `data.length > 0`
- **Filtro do funil**: `lista.filter(c => !c.ligacao_status || c.ligacao_status === "pendente")` aplicado no momento do carregamento, não só na navegação

