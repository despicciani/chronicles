# CHRONICLE — Mesa Virtual de RPG de Alta Fantasia

Aplicação Desktop (**Electron + Vite + React + Socket.IO**) para mesas de RPG de Alta Fantasia em tempo real, com tela inicial cinematográfica, motor d20 configurável pelo Mestre, criação de personagem com orçamento de pontos e perícias definidos por campanha, cerimônia animada de iniciativa e Arena de Duelo tática (Ataque vs CA → Rolagem de Dano → Redução automática de PV).

## Como Abrir o Programa Desktop

- **Clique Duplo:** Execute `Iniciar Cronicas d20 (Desktop).vbs` (ou `Iniciar Cronicas d20 (Desktop).bat`).
- **Pelo Terminal:** `npm run desktop:start` (ou `npm run desktop` para recompilar e abrir).

## Fluxo da Mesa no CHRONICLE

1. **Tela de Título & Portais:**
   - Abertura animada do emblema **CHRONICLE** revelando os dois portais de entrada: **SOU JOGADOR** e **SOU MESTRE**.
2. **Santuário do Mestre & Criação de Campanha:**
   - Ao criar uma nova campanha, o Mestre define Nome, Foto de Capa, Descrição, **Pontos de Atributo (`attributePointBudget`)** e **Máximo de Perícias Treinadas (`maxTrainedSkills`)**.
   - As campanhas ficam salvas em `server/data/campaigns/`.
3. **Entrada do Jogador & Ficha Controlada:**
   - Descoberta automática de salas na rede local/VPN (ou conexão por Código Curto `RUNA-XXXX-XXXX`).
   - Cada jogador cria seu único personagem distribuindo exatamente os pontos de atributo e perícias configurados pelo Mestre; após criado, atributos e perícias ficam protegidos sob controle do Mestre, e pedidos de descanso ou cura passam pelo sistema de solicitação.
4. **Combate Cinematográfico & Automação:**
   - **Iniciativa:** Ao iniciar combate, uma cerimônia animada rola os `d20` e organiza os combatentes da maior para a menor iniciativa no topo da tela (`1º`, `2º`, `3º`...).
   - **Arena de Duelo (Ataque vs CA → Dano):** Ao selecionar um alvo no mapa (ou escolher uma arma/ataque), o duelo rola `1d20` (ou `2d20` com Vantagem/Desvantagem) contra a CA do defensor, exibe o bloqueio ou estilhaçamento do escudo, e em seguida rola o dano reduzindo automaticamente os PV no mapa, iniciativa e ficha.
   - **Controle Tático do Mestre:** Clique em qualquer token/monstro no mapa para atacar heróis, ajustar PV, ocultar/revelar ou **remover** monstros adicionados por engano.
   - **Consumíveis & Modelos em Área:** Poções consumíveis na hotbar curam PV/PM e consomem carga automaticamente; esferas, cones e linhas no mapa podem ser arrastados e girados livremente.
