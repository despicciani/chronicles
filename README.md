<div align="center">

# ⚔️ CHRONICLES ⚔️
### *A Mesa Virtual de RPG de Alta Fantasia & Dark Fantasy*

> *"Acendam as tochas, rolem a iniciativa e escrevam sua lenda em aço, sangue e arcano."*

![Electron](https://img.shields.io/badge/Electron-Desktop%20App-2b2e3b?style=for-the-badge&logo=electron&logoColor=e8c266)
![React](https://img.shields.io/badge/React-18-161822?style=for-the-badge&logo=react&logoColor=38bdf8)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-161822?style=for-the-badge&logo=typescript&logoColor=60a5fa)
![Socket.IO](https://img.shields.io/badge/Socket.IO-Multiplayer%20Real--Time-161822?style=for-the-badge&logo=socketdotio&logoColor=e8c266)
![Vite](https://img.shields.io/badge/Vite-6-161822?style=for-the-badge&logo=vite&logoColor=c084fc)

</div>

---

## 🕯️ O que é o CHRONICLES?

**CHRONICLES** é uma aplicação desktop (**Electron + React + TypeScript + Socket.IO**) inspirada em **D&D 5e** e **Baldur's Gate 3**, projetada para transformar sessões de RPG de mesa em uma experiência visual, tática e sonora cinematográfica — com estética de obsidiana, latão antigo e pergaminho, sem depender de navegadores ou assinaturas.

O Mestre hospeda a sessão diretamente do próprio computador (em **rede local/LAN** ou via **Túnel Público Cloudflare** com 1 clique), enquanto os jogadores entram pelo portal do aventureiro com sincronização instantânea em tempo real.

---

## ✨ Pilares da Experiência

### ⚔️ Combate Tático & Cinematográfico
- **Cerimônia de Iniciativa & Banner de Turno:** Rola a iniciativa da mesa em uma sequência animada, organiza os combatentes no topo e dispara um aviso visual + toque sonoro (**"É O SEU TURNO!"**) quando chega a vez de cada herói.
- **Arena de Duelo Coreografada (Ataque vs CA → Dano):** Rola `1d20` (ou `2d20` com Vantagem/Desvantagem, Flanqueamento, Cobertura e Linha de Visão), suporta **Reações** (*Escudo Arcano +5 CA*) e, ao confirmar/disparar o golpe, fecha o dado para toda a mesa assistir o impacto ao vivo no mapa.
- **Projéteis, Feixes Mágicos & *Screen-Shake* de Crítico:** Flechas, bolas de fogo, relâmpagos bifurcados, estilhaços de gelo, curas e maldições voam em 60fps pelo mapa até o alvo, com explosão dourada e tremor de tela no **Crítico Natural (Nat 20)**.
- **Magias em Área (AoE) & Salvaguardas Híbridas:** Esferas, cones, linhas e cubos com mira translúcida e hitbox geométrica exata. NPCs e monstros rolam salvaguarda automaticamente, enquanto jogadores rolam seus próprios `d20` com aplicação automática de dano/condição.
- **Card de Vitória & MVP do Combate:** Ao encerrar um confronto, toda a mesa recebe um resumo épico com *Maior Dano*, *Maior Cura*, *Críticos (Nat 20)*, placar completo e botões rápidos de XP para o Mestre.

### 🔥 Mundo Vivo, Tochas & Combos Elementais
- **Combos Elementais em Cadeia (*Flood-Fill*):** Superfícies pintadas no mapa ou criadas por magias reagem entre si por toda a poça conectada:
  - ⚡ **Raio + Água** → *Tempestade na Poça* (eletrifica a poça, dano elétrico extra + Atordoado)
  - ❄️ **Gelo + Água** → *Congelamento em Cadeia* (transforma a poça em gelo + dano frio + Caído)
  - 💨 **Fogo + Gelo** → *Explosão de Vapor* (derrete para água + dano de vapor)
  - 💥 **Fogo + Ácido** → *Detonação Tóxica* (inflama toda a poça em fogo + dano explosivo)
- **Iluminação Dinâmica & Névoa de Guerra (*Fog of War*):** Tokens equipados com **Tocha (6m)**, **Lanterna (9m)** ou **Visão no Escuro (18m)** projetam aura luminosa e revelam a névoa automaticamente conforme exploram o mapa.
- **Clima Atmosférico em Canvas 2D:** Chuva, Brasas, Neve e Névoa em camadas sobre o mapa de batalha.
- **Paredes, Linha de Visão, Cobertura & Armadilhas:** Terrenos táticos que bloqueiam visão/ataques, concedem `+2` / `+5` CA por cobertura e disparam armadilhas ou passagens secretas ao pisar.

### 📜 Grimório, Concentração & Crônicas da Campanha
- **Concentração & Alvo Único Exclusivo:** Magias de concentração exibem brasão dourado no token e **linhas arcanas** ligando o conjurador aos alvos; sofrer dano dispara teste de CON automático, e perder concentração (ou cair a `0 PV`) remove os efeitos aplicados. Habilidades de alvo único (como *Bênção*) pedem confirmação ao trocar de alvo.
- **Recursos Customizados & Usos por Descanso:** O Mestre pode criar barras extras no Compêndio (*Estamina*, *Ki*, *Sanidade*, etc.), configurar habilidades que consomem PV, MP ou recursos customizados, e controlar cargas por descanso (`● ○`) diretamente no HUD.
- **Quadro de Missões (*Quest Log*) & Baú de Saque:** Missões principais, secundárias e contratos com objetivos marcáveis e entrega de **XP + Ouro** para a party com 1 clique, além de baús interativos de loot e **Descanso em Grupo** (Curto/Longo) com banner cinematográfico.
- **Chefes de Fase (*Boss Fight*):** Barra de Chefe arrastável com transição automática para **Fase 2**, Ações Lendárias e Resistências Lendárias.

### 🎵 Som Imersivo & Controle da Mesa
- **Efeitos Sonoros Inteligentes (WebAudio + Reverb):** Cada habilidade dispara SFX temático sincronizado para toda a mesa (espada, arco, fogo, raio, gelo, cura, bênção, maldição, escudo, crítico), com seletor customizável no Compêndio.
- **Player de Músicas do PC & Mesa de Som:** Importe suas próprias trilhas de batalha/taverna com controles independentes de Música e SFX, *Fade Out*, *Loop*, *Shuffle* e temas musicais individuais por herói.
- **Sala Protegida pelo Mestre:** Se o Mestre sair para o Lobby, desconectar ou fechar o aplicativo, a sala se encerra automaticamente e impede entrada sem a presença do Mestre.

---

## ⌨️ Atalhos Táticos na Mesa

| Tecla | Ação |
| :---: | :--- |
| **`1` – `9`** | Dispara rapidamente ataques, armas e habilidades da barra do jogador |
| **`Esc`** | Cancela mira ativa ou fecha menus abertos |
| **`Espaço`** | Encerra/avança o turno atual na iniciativa |
| **`I`** | Inspeciona o token selecionado (Card de Inspeção estilo BG3) |
| **`Ctrl + Z`** | Desfaz a última ação tática (Mestre) |

---

## 🚀 Como Executar & Compilar

### Pré-requisitos
- **Node.js** 20+ (com `npm`)

### 1. Instalar dependências
```bash
npm install
```

### 2. Rodar em modo desenvolvimento (Cliente + Servidor)
```bash
npm run dev
```

### 3. Abrir o aplicativo Desktop (Electron)
```bash
npm run desktop
```
*(Ou `npm run desktop:start` se o frontend já estiver compilado.)*

### 4. Compilar o executável portátil do Windows (`Chronicles.exe`)
```bash
npm run build:exe
```
O executável portátil será gerado em `release/Chronicles.exe`.

---

## 🗂️ Estrutura do Grimório (Projeto)

```text
rpg-tabletop/
├── electron/          # Processo principal Electron & empacotamento desktop
├── server/            # Servidor Express + Socket.IO + Túnel Cloudflare
│   └── data/          # Campanhas, personagens e uploads locais (ignorado no Git)
├── src/
│   ├── components/    # Battlemap, HUD, Arena de Duelo, Ficha, Missões, VFX, Som
│   ├── context/       # Estado sincronizado da campanha e motor de eventos em tempo real
│   ├── shared/        # Motor de regras d20, combos elementais, tipos e compêndio 5e
│   └── utils/         # Motor de áudio WebAudio (SFX sintetizados + Player de Música)
└── build/             # Ícone e recursos do instalador
```

---

<div align="center">

*Forjado para noites épicas de dados rolados, planos mirabolantes e críticos naturais no último segundo.* 🎲✨

</div>
