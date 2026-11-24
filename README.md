<div align="center">

# ⚔️ CHRONICLES ⚔️
### *Mesa Virtual de RPG de Alta Fantasia & Dark Fantasy para Desktop*

> *"Acendam as tochas, rolem a iniciativa e escrevam sua lenda em aço, sangue e arcano."*

![Electron](https://img.shields.io/badge/Electron-Desktop%20App-2b2e3b?style=for-the-badge&logo=electron&logoColor=e8c266)
![React](https://img.shields.io/badge/React-18-161822?style=for-the-badge&logo=react&logoColor=38bdf8)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-161822?style=for-the-badge&logo=typescript&logoColor=60a5fa)
![Socket.IO](https://img.shields.io/badge/Socket.IO-Multiplayer%20Real--Time-161822?style=for-the-badge&logo=socketdotio&logoColor=e8c266)
![Vite](https://img.shields.io/badge/Vite-6-161822?style=for-the-badge&logo=vite&logoColor=c084fc)

</div>

---

## 🕯️ O que é o CHRONICLES?

**CHRONICLES** é uma mesa virtual de RPG (**VTT**) desktop, construída em **Electron + React + TypeScript + Socket.IO** e inspirada em **D&D 5e** e **Baldur's Gate 3**. Ela reúne fichas completas, mapa tático interativo, motor de regras automatizado, compêndio totalmente editável, áudio imersivo e multiplayer em tempo real — tudo em um único aplicativo portátil, sem mensalidades e sem depender de serviços externos.

O **Mestre** cria e hospeda campanhas diretamente do próprio computador (em **rede local/LAN** ou via **Túnel Público Cloudflare** com 1 clique), enquanto os **Jogadores** se conectam por código de sala com sincronização instantânea.

---

## 🗺️ Visão Geral dos Sistemas

### 🎭 Fichas, Criação de Heróis & Cofre de Personagens
- **Criação Guiada & Regras Editáveis:** Distribuição de atributos (`0` a `20`), raças, classes, perícias treinadas e progressão de nível com regras de pontos totalmente configuráveis pelo Mestre na campanha.
- **Ficha Completa com Paperdoll & Inventário:** Equipamento visual por slot (arma principal, secundária, armadura, elmo, anéis, amuleto, botas), ouro, peso, ataques customizados, magias, notas e retratos personalizados.
- **Cofre de Heróis (*Hero Vault*):** Salve, importe e reutilize personagens entre campanhas.
- **Pontos de Inspiração Heroica (0 a 3):** Acumuláveis pelo Mestre e gastáveis pelo jogador tanto **antes** de rolar (para ganhar Vantagem) quanto **depois** de um `d20` ruim (re-rolagem direta em duelos e salvaguardas).
- **Barra de Ações Reordenável:** Atalhos rápidos (`1`–`9`), busca instantânea, indicador de economia de turno (*Ação Padrão*, *Bônus*, *Reação*, *Deslocamento*) e manobras táticas (*Disparada*, *Desengajar*, *Esquivar*, *Empurrar*, *Esconder*, *Ajudar*, *Saltar*).

### ⚔️ Combate Tático & Motor d20
- **Iniciativa Dinâmica:** Cerimônia de abertura de combate, rastreador de turnos com condições/durações por turno real do personagem, e entrada automática na iniciativa para tokens que surgem durante um combate já em andamento.
- **Arena de Duelo Coreografada:** Fluxo visual de *Ataque vs CA → Dano* com dados poliédricos 3D, cálculo automático de Vantagem/Desvantagem, Flanqueamento, Cobertura, Linha de Visão e **Reações** (*Escudo Arcano*, *Ataques de Oportunidade*).
- **Magias em Área (AoE) & Salvaguardas Híbridas:** Esferas, cones, linhas e cubos com mira geométrica no grid. Monstros rolam salvaguardas automaticamente enquanto jogadores rolam seus próprios `d20`.
- **Concentração & Testes contra a Morte:** Controle automático de concentração com teste de Constituição ao sofrer dano, linhas arcanas ligando conjurador e alvos, e fluxo completo de *Death Saves* com auxílio de aliados.
- **Invocações & Familiares Controlados pelo Jogador:** O Mestre pode atribuir qualquer monstro ou NPC a um herói — o jogador passa a mover, atacar e passar o turno da sua invocação diretamente no mapa.
- **Chefes Multi-Fase (*Boss Fight*):** Barra de Chefe dedicada, múltiplas fases por limiar de PV, Ações Lendárias, Resistências Lendárias e card de **Vitória & MVP** ao final do combate.

### 🌍 Mapa Tático, Iluminação & Exploração
- **Iluminação Dinâmica, Escuridão Total & Visão no Escuro:** Tochas e lanternas iluminam para todo o grupo (exigindo o item/habilidade), enquanto *Visão no Escuro* revela o mapa apenas para o próprio portador, respeitando paredes e obstáculos.
- **Portas Interativas & Terrenos Táticos:** Paredes, coberturas (`+2`/`+5` CA), terreno difícil e **Portas** (*Aberta*, *Fechada* ou *Trancada* com CD de Ladinagem) que bloqueiam movimento, visão e luz quando fechadas.
- **Superfícies & Combos Elementais (*Flood-Fill*):** Fogo, Gelo, Ácido e Água configuráveis por mapa, com efeitos ao pisar/iniciar turno e reações em cadeia (Raio + Água, Gelo + Água, Fogo + Gelo, Fogo + Ácido).
- **Ciclo Dia/Noite & Clima Atmosférico (Opcional):** Alternância visual de *Dia*, *Crepúsculo* e *Noite*, além de *Chuva*, *Brasas*, *Neve* e *Névoa* em Canvas 2D com efeitos táticos opcionais.
- **Segredos por Percepção, Armadilhas & Espólio:** Baús, itens, armadilhas automáticas, passagens entre mapas e **Loot Drop automático** ao derrotar monstros. Marcadores e tokens ocultos podem ser revelados seletivamente apenas para quem passou no teste de Percepção.

### 📖 Compêndio Modular & Controle do Mestre
- **100% Customizável & Controle de Privacidade:** Crie e edite Raças, Classes, Itens, Habilidades/Magias, Condições, Monstros e Encontros Salvos, escolhendo individualmente ou em massa o que fica **Público** ou **Privado** para os jogadores.
- **Condições Flexíveis:** Qualquer condição pode conceder modificadores de atributo/CA/dado, **ataques/habilidades exclusivos** enquanto ativa, **ações extras por turno**, **dano ou cura por turno (DoT/HoT)**, **salvaguarda no fim do turno**, **resistências/vulnerabilidades/imunidades** e **transformação visual** (imagem e tamanho do token).
- **Itens Mágicos com Cargas:** Vincule qualquer habilidade do Compêndio a um item com cargas máximas e recarga (*Descanso Longo*, *Curto* ou *Consumível*).
- **Recursos Customizados & Escudo do Mestre:** Crie barras extras (*Estamina*, *Ki*, *Sanidade*), gerencie NPCs, missões (*Quest Log*), notas privadas, pedidos de teste de perícia para o grupo e **Sussurros / Handouts** secretos (texto + imagem) para jogadores específicos.

### 🎬 Efeitos Visuais, Câmera & Áudio
- **VFX & Impacto Cinemático (Desativáveis):** Projéteis animados em 60fps, auras de condição nos tokens, ondas de choque, tremor de tela escalonado, flashes de crítico/dano e **Auto-Foco suave de câmera** (mais botão do Mestre para focar a câmera da mesa). Cada usuário pode ligar ou desligar **🎥 Auto-Foco** e **🎬 Cinemático** individualmente na barra do mapa.
- **Trilha Sonora & SFX Sincronizados:** Motor WebAudio com efeitos sonoros temáticos por habilidade/evento e player de músicas locais com *Loop*, *Shuffle*, *Fade Out* e temas musicais por personagem.

---

## ⌨️ Atalhos Rápidos

| Tecla | Ação |
| :---: | :--- |
| **`1` – `9`** | Executa ataques, armas e habilidades da barra de ações |
| **`Espaço`** | Avança/encerra o turno ativo na iniciativa |
| **`I`** | Abre o card de inspeção do token selecionado |
| **`Esc`** | Cancela mira ativa ou fecha menus abertos |
| **`Ctrl + Z`** | Desfaz a última alteração no mapa/campanha (Mestre) |

---

## 🚀 Como Executar & Compilar

### Pré-requisitos
- **Node.js 20+** (com `npm`)

### 1. Instalar dependências
```bash
npm install
```

### 2. Desenvolvimento (Servidor + Frontend)
```bash
npm run dev
```

### 3. Executar como aplicativo Desktop (Electron)
```bash
npm run desktop
```
*(Ou `npm run desktop:start` caso o frontend já esteja compilado.)*

### 4. Gerar executável portátil do Windows (`Chronicles.exe`)
```bash
npm run build:exe
```
O executável portátil é gerado em `release/Chronicles.exe`.

---

## 🗂️ Estrutura do Projeto

```text
rpg-tabletop/
├── electron/          # Processo principal Electron & empacotamento desktop
├── server/            # Servidor Express + Socket.IO + Túnel Cloudflare
│   └── data/          # Campanhas, cofres de heróis e uploads locais (ignorado no Git)
├── src/
│   ├── components/    # Mapa tático, HUD, Arena de Duelo, Ficha, Compêndio, Escudo, VFX
│   ├── context/       # Estado sincronizado da campanha e eventos em tempo real
│   ├── shared/        # Motor de regras d20, iluminação, combos, tipos e compêndio base
│   └── utils/         # Motor de áudio WebAudio (SFX sintetizados + Player de Música)
└── build/             # Ícone e recursos do executável
```

---

<div align="center">

*Forjado para noites épicas de dados rolados, planos mirabolantes e críticos naturais no último segundo.* 🎲✨

</div>
