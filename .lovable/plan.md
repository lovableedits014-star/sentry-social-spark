## 🎯 Objetivo

Substituir a captura atual de redes sociais (que pede ao apoiador colar URL — confuso para leigos) por um fluxo **guiado em 3 cliques**: **Buscar → Copiar link no Facebook/Instagram → Confirmar foto**. O apoiador nunca precisa entender o que é "URL".

---

## ⚠️ Avisos técnicos honestos (lidos antes de codar)

1. **Não existe API pública** para buscar perfis do Facebook/Instagram por nome desde 2019 (Meta removeu por causa do Cambridge Analytica). Qualquer scraping é detectado e bloqueado em horas.
2. **Iframe do Facebook/Instagram não funciona** — ambos enviam `X-Frame-Options: DENY`. Tem que ser **popup (window.open)**, não iframe embutido.
3. A solução abaixo **não é mágica** — ainda exige que o apoiador clique 2-3 vezes dentro do app oficial. Mas elimina a etapa "achar e copiar uma URL", que é o que confunde leigos.

---

## 🧩 Como funciona o novo fluxo

### Passo 1 — Apoiador chega na seção "Redes Sociais" do cadastro

Vê dois botões grandes (ao invés de campos de texto vazios):

```
┌────────────────────────────────┐    ┌────────────────────────────────┐
│  📘  Conectar meu Facebook    │    │  📷  Conectar meu Instagram   │
│      (toque para buscar)      │    │      (toque para buscar)      │
└────────────────────────────────┘    └────────────────────────────────┘
```

### Passo 2 — Toca em "Conectar meu Facebook"

Abre um **diálogo guiado** dentro do nosso app com 3 passos visuais ilustrados:

- **Passo 1/3**: "Vamos abrir o Facebook pra você achar seu perfil. Tá pronto?" → botão `Abrir Facebook` (`window.open(...)`).
- A URL aberta no popup já vai com a busca pré-preenchida usando o **nome que ele digitou no formulário**: `https://www.facebook.com/search/people/?q=Nome+Completo`. Ele já cai na lista de resultados — não precisa nem digitar o nome de novo.
- **Passo 2/3** (na tela do nosso app, enquanto o popup está aberto): GIF/imagem mostrando "No Facebook que abriu, toque em você → toque nos `⋯` → Copiar link". Texto grande, ícones grandes.
- **Passo 3/3**: campo único `Cole aqui o link copiado` + botão `📋 Colar do meu celular` (usa `navigator.clipboard.readText()` quando disponível — em iOS/Android pede permissão e cola automático).

### Passo 3 — Confirmação visual ("É você?")

Assim que ele cola o link, chamamos a edge function **`resolve-social-link` (já existe no projeto)** que segue redirects do Facebook (incluindo `facebook.com/share/xxx` que é o formato que o app mobile copia hoje) e devolve o handle real + URL canônica.

Em paralelo, buscamos a **foto e nome** do perfil:
- **Facebook**: `https://graph.facebook.com/{handle}/picture?type=large&redirect=true` (já usado no projeto — ver `mem://tecnico/integracao-avatar-social`)
- **Instagram**: tentamos `og:image` da página do perfil via uma nova função `preview-social-profile` (fetch + parse meta tags com User-Agent de bot, mesma estratégia da `resolve-social-link`)

E mostramos um **card de confirmação grande**:

```
┌──────────────────────────────────┐
│  [foto redonda]  João da Silva   │
│                  facebook.com/   │
│                  joao.silva.123  │
│                                  │
│   ✅ É você?  [Sim, sou eu]     │
│              [Não, é outro perfil]│
└──────────────────────────────────┘
```

Se ele clica **"Sim"** → handle é salvo silenciosamente. Botão da seção muda para `✅ Facebook conectado: João da Silva` com "trocar" pequenininho ao lado.
Se clica **"Não"** → volta para o passo 1 do diálogo e tenta de novo.

### Passo 4 — Mesmo fluxo para Instagram

Idêntico ao Facebook, com a busca aberta em `https://www.instagram.com/explore/search/?q=NomeCompleto`.

---

## 🛠️ Implementação técnica

### Frontend — novo componente `SocialConnectFlow`

Arquivo novo: `src/components/pessoas/SocialConnectFlow.tsx`
- Recebe `nome`, `plataforma` ('facebook' | 'instagram'), `value`, `onChange(handle, url, previewName, previewAvatar)`.
- Estados: `idle` → `popup_open` → `pasted` → `previewing` → `confirmed` (ou `rejected` que volta pra `idle`).
- Renderiza o diálogo guiado em 3 passos descrito acima.
- Substitui os campos atuais de Instagram/Facebook em **`SupporterRegister.tsx`**.

### Frontend — helpers
- Função utilitária em `src/lib/social-url.ts` (já existe): adicionar `buildSearchUrl(platform, name)` que monta a URL de busca pré-preenchida.
- Tentativa de auto-paste com `navigator.clipboard.readText()` envolvida em try/catch (Safari/iOS pede permissão e pode negar; nesse caso o usuário cola manualmente — campo continua visível).

### Backend — nova edge function `preview-social-profile`

Arquivo novo: `supabase/functions/preview-social-profile/index.ts`
- Input: `{ platform, handle }`.
- Lógica:
  - Se `platform === 'facebook'`: monta URL da Graph API para foto (`graph.facebook.com/{handle}/picture?type=large&redirect=true`) e tenta extrair o nome via `og:title` da página pública do perfil (mesma técnica de fetch com User-Agent `facebookexternalhit/1.1` da `resolve-social-link`).
  - Se `platform === 'instagram'`: faz fetch de `instagram.com/{handle}/` com User-Agent de bot, extrai `og:image` (foto) e `og:title` (nome) das meta tags.
  - Retorna `{ name, avatarUrl, canonicalUrl, found: true|false }`.
- CORS configurado igual às outras funções do projeto.
- Cache simples em memória do Deno por 5 minutos para não bater na Meta toda hora se o apoiador clicar várias vezes.

### Backend — reutilização

- `resolve-social-link` (já existe) continua resolvendo links de share `facebook.com/share/xxx` e devolvendo o handle real. Sem mudanças.
- A RPC `register_pessoa_public` (já existe) já aceita o array `p_socials` no formato `[{ plataforma, usuario, url_perfil }]` — sem mudanças.

### O que NÃO mexer

- `RegistroFuncionario.tsx` — funcionário é cadastrado por atendente da campanha (não é leigo), o fluxo atual de colar link funciona bem para esse perfil.
- Edge function `register-supporter` — continua recebendo o mesmo payload.
- Validação de CPF (recém implementada) — intacta.

---

## 📋 Aplicação

- Apenas no **cadastro do Apoiador** (`SupporterRegister.tsx`), conforme você pediu (apoiador sozinho no celular).
- Funcionário e Pessoa (CRM interno) seguem com o input de link atual — atendentes sabem mexer.

---

## ✅ Critérios de aceite

1. Apoiador no celular consegue conectar o Facebook em **3 toques** sem digitar URL nenhuma.
2. Cartão de confirmação mostra **foto real + nome real** do perfil escolhido antes de salvar.
3. Se a Meta bloquear preview (sem foto), ainda assim o handle resolvido entra no banco — só não aparece a foto, mostra um placeholder.
4. Funciona tanto colando link `facebook.com/joao.silva` quanto link de share mobile `facebook.com/share/1bGUhmcd66/` (resolve via `resolve-social-link`).
5. Se o apoiador fechar o popup sem copiar nada, dá pra recomeçar do passo 1.
6. Mobile-first: todos os botões grandes (`h-14`+), texto legível sem zoom.

---

## ⏱️ Escopo

- 1 componente novo (`SocialConnectFlow.tsx`)
- 1 edge function nova (`preview-social-profile`)
- Pequenas adições em `social-url.ts`
- Integração em `SupporterRegister.tsx` (substituir 2 inputs por 2 botões do novo componente)

Sem migrações de banco. Sem novos secrets. Sem mexer em RLS. Sem mexer em Login Social/OAuth (descartado conforme sua orientação).