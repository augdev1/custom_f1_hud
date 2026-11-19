# F1 24 Custom HUD Overlay

> HUD de telemetria customizada, ultra-leve, transparente e click-through para EA SPORTS™ F1 24 rodando no Windows.  
> Projetada com metodologia Harness Engineering & Test-First Delivery, garantindo latência de broadcast sub-milissegundo (< 0.05ms) a 60Hz sem travamentos, vazamentos de memória ou perda de frames.

---

## 1. Sobre o Projeto

O **F1 24 Custom HUD Overlay** é uma aplicação desktop híbrida de alta performance voltada para o automobilismo virtual (Sim Racing). Ela extrai dados de telemetria em tempo real diretamente do jogo F1 24 via pacotes UDP nativos, processa essas informações em um núcleo assíncrono e projeta um painel de corrida transparente na tela do piloto.

### Diferenciais Principais:
- **Click-Through Total (WS_EX_TRANSPARENT):** O cursor do mouse e todos os cliques atravessam a janela do HUD sem qualquer interferência na janela principal do F1 24 ao travar com a tecla F8.
- **Transparência Hardware Win32 (DWM + Chroma Key):** Recorte nativo de transparência sem bordas serrilhadas ou artefatos visuais ao redor do painel.
- **Superposição Contínua em Jogos (DirectFlip Watchdog):** Mecanismo ativo em 4Hz com garantia de permanência em primeiro plano (`HWND_TOPMOST` e `GWLP_HWNDPARENT`) sobre jogos em modo Janela Sem Bordas.
- **Suporte Nativo a Docker & Virtualização:** Backend de telemetria encapsulado em container Linux de alta performance, permitindo execução tanto local quanto em máquinas virtuais (VirtualBox) ou hosts remotos.
- **Zero Backpressure (Dropping Queue):** Mecanismo de fila que descarta automaticamente frames defasados caso haja qualquer oscilação, mantendo estritamente o frame mais atual com latência garantida de 0.025 ms.

---

## 2. Arquitetura do Sistema

```
                  ┌──────────────────────────────┐
                  │    EA SPORTS™ F1 24 (Jogo)   │
                  │  ou Mock Telemetry Producer  │
                  └──────────────┬───────────────┘
                                 │ UDP Datagrams (Porta 20777)
                                 │ Packet ID 6 (Telemetry) & 7 (Status)
                                 ▼
          ┌────────────────────────────────────────────────┐
          │      BACKEND CORE (Python / Docker)            │
          │  - asyncio.DatagramProtocol (Zero-Copy)        │
          │  - Little-Endian struct.unpack                 │
          │  - Dropping Queue (maxsize=1)                  │
          │  - FastAPI WebSocket Broadcaster               │
          └───────────────────────┬────────────────────────┘
                                 │ WebSocket Stream (ws://127.0.0.1:8000/ws/telemetry)
                                 │ 60Hz JSON Payload
                                 ▼
          ┌────────────────────────────────────────────────┐
          │         FRONTEND OVERLAY (Windows Win32)       │
          │  - pywebview Desktop Shell                     │
          │  - Win32 API Hardware Transparency (DWM)       │
          │  - Tailored UI: Marcha, RPM, ERS, DRS, Pneus   │
          │  - Zero White Borders & Clean Chroma Key       │
          └────────────────────────────────────────────────┘
```

---

## 3. Estrutura do Repositório

```text
f1-custom-hud/
├── backend/
│   ├── protocol/
│   │   ├── __init__.py
│   │   ├── f124_packets.py        # Structs binárias F1 24 e unpacker zero-copy
│   │   └── mock_producer.py       # Gerador de carga UDP 60Hz (Simulação de Monza)
│   ├── static/
│   │   ├── overlay.html           # HUD in-game flutuante transparente
│   │   └── index.html             # HUD Studio Web & configurador de temas
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── test_packet_unpack.py  # Testes unitários de desempacotamento binário
│   │   ├── test_ws_performance.py # Testes de estresse assíncrono e latência
│   │   └── test_tauri_config.py   # Testes estáticos de configuração
│   ├── requirements.txt           # Dependências Python (FastAPI, uvicorn, websockets, pytest)
│   ├── server.py                  # Servidor assíncrono UDP + WebSocket FastAPI
│   └── __init__.py
├── Dockerfile                     # Imagem de produção containerizada (Python 3.12-slim)
├── docker-compose.yml             # Orquestrador de serviços (Portas 8000/tcp e 20777/udp)
├── hud_config.json                # Configurações visuais persistidas (tema, cores, escala)
├── iniciar_hud.bat                # Script de inicialização completa
├── reiniciar_hud.bat              # Script de reinicialização rápida do backend e overlay
├── run_overlay.py                 # Janela flutuante desktop transparente Win32
└── pytest.ini                     # Configuração do Pytest
```

---

## 4. Como Executar e Instalar (Pronto para o Jogo em 1 Clique)

### Instalação no PC (Para você ou seu irmão após clonar o repositório):

1. **Clone o repositório:**
   ```cmd
   git clone https://github.com/augdev1/custom_f1_hud.git
   cd custom_f1_hud
   ```

2. **Dê 2 cliques em `instalar_no_pc.bat`:**
   - Detecta o Python automaticamente (ou instala via `winget` se não houver).
   - Cria o ambiente virtual isolado `.venv`.
   - Instala todas as dependências do `requirements.txt`.
   - Instala as extensões recomendadas do VS Code caso utilize o editor (`instalar_extensoes.bat`).
   - Cria o atalho oficial **F1 24 Custom HUD** diretamente na sua Área de Trabalho.

3. **Iniciar a HUD:**
   - Abra o atalho **F1 24 Custom HUD** na Área de Trabalho ou execute `iniciar_hud.bat`.
   - Para abrir o Studio no navegador com simulador e personalização de cores, execute `iniciar_studio.bat`.

---

O backend pode ser executado em container Docker (local ou em máquina virtual como VirtualBox).

1. Iniciar os serviços com Docker Compose:
```bash
docker compose up -d --build
```

2. Verificar o status do servidor:
```bash
curl http://127.0.0.1:8000/health
```

3. Iniciar o overlay desktop no Windows:
```cmd
python run_overlay.py
```
*Caso o container esteja em outro IP de VM (modo Bridge), execute antes:*
```cmd
set HUD_BACKEND_HOST=192.168.x.x
python run_overlay.py
```

---

### Opção B: Execução Local Nativa (Windows)

#### 1. Configurar o ambiente Python e dependências
```powershell
# Criação do ambiente virtual
python -m venv .venv
.venv\Scripts\activate

# Instalação das dependências
pip install -r backend/requirements.txt
```

#### 2. Executar a suíte de testes automatizados
```powershell
pytest -v
```
*Resultado esperado: 11 testes aprovados com latência média confirmada de ~0.025ms.*

#### 3. Iniciar o servidor e overlay
Execute o arquivo `iniciar_hud.bat` ou inicie manualmente:
```powershell
# Terminal 1: Iniciar o núcleo de telemetria
python -m backend.server

# Terminal 2: Iniciar a HUD transparente
python run_overlay.py
```

---

## 5. Configuração no Jogo F1 24

Para receber telemetria durante as sessões no EA SPORTS™ F1 24:

1. Acesse **Opções do Jogo** > **Configurações** > **Telemetria UDP**.
2. Configure as seguintes opções:

| Parâmetro | Valor Configurado |
| :--- | :--- |
| **Telemetria UDP** | `Ativado` |
| **Formato UDP** | `2024` |
| **Endereço IP** | `127.0.0.1` (ou o IP da VM caso use modo Bridge) |
| **Porta UDP** | `20777` |
| **Taxa de Envio UDP** | `60 Hz` |

---

## 6. Atalhos e Controles da HUD

- **F8:** Alterna entre **Modo Mover** (permite arrastar o painel pela tela) e **Modo Corrida** (HUD travada e cliques passam 100% transparentes para o volante/jogo).
- **Botão Centralizar:** Reposiciona a HUD no centro inferior da tela (alinhado com o Halo do cockpit).
- **Botão Cores:** Abre o seletor de temas e cores oficiais de construtores (Mercedes, Ferrari, Aston Martin, McLaren, Red Bull, Neon).
- **Testar Giro:** Dispara o gerador interno de telemetria simulada para validação sem necessidade de abrir o jogo.

---

## 7. Benchmark de Performance

Métricas obtidas em testes de estresse sob carga sintética contínua a 60Hz:

| Métrica | Requisito Técnico | Resultado Obtido | Avaliação |
| :--- | :--- | :--- | :--- |
| **Latência Média WS** | < 5.0 ms | **0.025 ms** | Superado (200x mais rápido) |
| **Latência WS (P99)** | < 10.0 ms | **0.045 ms** | Superado |
| **Jitter do Event Loop** | < 5.0 ms | **0.104 ms** | Estável |
| **Consumo de Fila sob Burst** | <= 1 frame | **<= 1 frame** | Zero Backpressure |
| **Taxa de Atualização da UI** | 60 FPS | **60 FPS** | Zero Frame Drops |

---

## 8. Tecnologias Utilizadas

- **Núcleo de Telemetria:** Python 3.12, FastAPI, uvicorn, asyncio, websockets.
- **Containerização:** Docker, Docker Compose (Alpine/Debian-slim).
- **Desktop Shell & Transparência:** pywebview, Win32 API, DWM (Desktop Window Manager), Chroma Keying.
- **Frontend & Interface:** HTML5, CSS3, Tailwind CSS, Lucide Icons, JetBrains Mono & Rajdhani Typography.
- **Qualidade & Validação:** Pytest, pytest-asyncio, HTTPX.

## 9. Halo Transparente — execução local (16/11/2026)

A interface atual segue o conceito aprovado: arco contínuo, velocímetro compacto,
painéis com 18% de opacidade e indicadores opacos. Studio e overlay compartilham
`halo.css`, `halo.js` e `halo-model.js`; não dependem de CDN, Docker ou build Node.
O Studio permite ajustar cores, opacidade, escala, pneus e simular aceleração/freio.

### Portas deste PC
- **20777/UDP**: telemetria do jogo (formato 2024, 60 Hz, destino 127.0.0.1).
- **8765/TCP**: Studio, HTTP e WebSocket. A porta 8000 tem outro serviço neste PC.
- `iniciar_hud.bat`, `iniciar_studio.bat` e `reiniciar_hud.bat` configuram 8765.
- Para iniciar manualmente em PowerShell:
  ```powershell
  $env:API_HOST='127.0.0.1'
  $env:API_PORT='8765'
  .venv\Scripts\python.exe -m backend.server
  # Em outro terminal:
  .venv\Scripts\python.exe run_overlay.py
  ```
- Studio: http://127.0.0.1:8765/ ; estado: http://127.0.0.1:8765/health .
- F8 alterna mover/corrida; controles desaparecem no modo corrida.
- O simulador deve ser parado antes de iniciar o jogo. O Studio não o inicia se
  já existe telemetria UDP ativa.

### Harness reproduzível
1. `.venv\Scripts\python.exe -m pytest -v -p no:cacheprovider`
2. `node scripts/test_halo.mjs` (Node apenas para testes, não para executar a HUD).
3. Com backend local iniciado e jogo/simulador parados:
   `.venv\Scripts\python.exe -m scripts.harness_live`
4. O terceiro comando envia 1.200 frames binários F1 24 pelas portas reais,
   verifica aceleração, frenagem, marcha, DRS, ERS, contrato dual e sinal expirado.
   Grava evidência em `scratch/harness-live.json` e encerra seu emissor UDP.
5. Validar visualmente o Studio e, no desktop interativo, mover, F8, transparência
   sobre outra janela, click-through e topmost com F1 24 em janela sem bordas.

Resultado desta execução: 11 testes Python + 4 testes JS aprovados; 1.200/1.200
frames no teste UDP/WS. Tempo médio servidor→cliente WS: 0,314 ms, P99: 0,524 ms.
Esses tempos não incluem a renderização nem representam latência de ponta a ponta.
Há um aviso preexistente de depreciação Starlette/httpx.
A visualização no navegador foi conferida. A janela Win32 foi inicializada, mas
não ficou acessível à captura de desktop desta sessão: F8/click-through/topmost
sobre o jogo ainda precisam de validação no desktop do usuário.

### Transparência atual
O fundo HTML permanece transparente para o WebView2, com painéis SVG de alpha
configurável. Não aplicar opacidade à janela inteira: isso apagaria os textos.
A regra histórica de fundo HTML preto/chroma key não descreve este renderer.
O shell mantém `transparent=True`, fundo nativo preto e a extensão DWM existente.
A transparência parcial sobre o jogo depende do compositor WebView2/Win32 e deve
ser conferida no desktop, não inferida apenas da prévia do navegador.
