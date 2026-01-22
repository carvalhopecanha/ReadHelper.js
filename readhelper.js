/**
 * ReadHelper.js
 * Uma biblioteca leve para leitura guiada por seleção visual de texto, caractere por caractere.
 * 
 * FUNCIONALIDADES:
 * - Seleciona automaticamente o texto do início ao fim, letra por letra
 * - Controles integrados: Play, Pause, +Velocidade, -Velocidade
 * - Exibe o tempo atual entre seleções (ex: "300ms")
 * - Funciona com texto que contém HTML (parágrafos, spans, etc.)
 * - Focado em acessibilidade, TDAH, dislexia e aprendizado de idiomas
 * 
 * COMO FUNCIONA:
 * Usa a API nativa de seleção do navegador (window.getSelection + Range)
 * para simular o "arrastar do mouse" sem que o usuário precise interagir.
 */

class ReadHelper {
  /**
   * Construtor da classe ReadHelper
   * 
   * @param {string|HTMLElement} targetElement
   *   - Se string: seletor CSS (ex: "#meu-texto")
   *   - Se HTMLElement: referência direta ao elemento DOM
   * 
   * @param {Object} options - Opções de configuração
   *   - delay: tempo inicial entre cada caractere (em milissegundos)
   *   - minDelay: velocidade máxima (valor mínimo permitido)
   *   - maxDelay: velocidade mínima (valor máximo permitido)
   *   - onComplete: função executada ao final da leitura
   */
  constructor(targetElement, options = {}) {
    // Resolve o elemento alvo: se for string, busca no DOM; senão, usa diretamente
    this.element = typeof targetElement === 'string' 
      ? document.querySelector(targetElement) 
      : targetElement;

    // Garante que o elemento exista
    if (!this.element) {
      throw new Error('🎯 ReadHelper: Elemento alvo não encontrado. Verifique o seletor.');
    }

    // Configura opções com valores padrão
    this.delay = options.delay || 300;        // Tempo entre caracteres (ms)
    this.minDelay = options.minDelay || 50;    // Limite superior de velocidade
    this.maxDelay = options.maxDelay || 2000;  // Limite inferior de velocidade
    this.onComplete = options.onComplete || (() => {}); // Callback ao terminar

    // Estado interno do leitor
    this.isReading = false;   // Indica se está em modo de leitura
    this.currentIndex = 0;    // Posição atual na sequência de caracteres
    this.textNodes = [];      // Lista de nós de texto (excluindo tags HTML)
    this.totalLength = 0;     // Número total de caracteres legíveis

    // APIs do navegador para manipulação de seleção
    this.range = document.createRange();       // Objeto que define um intervalo de seleção
    this.selection = window.getSelection();    // Objeto que representa a seleção atual

    // Extrai todos os nós de texto do elemento (ignorando tags, scripts, etc.)
    this._extractTextNodes(this.element);

    // Calcula o comprimento total do texto legível
    this.totalLength = this.textNodes.reduce(
      (sum, node) => sum + node.textContent.length,
      0
    );

    // Cria e insere os controles de interface na página
    this._createControls();
  }

  // ────────────────────────────────────────
  // MÉTODOS PÚBLICOS (API da biblioteca)
  // ────────────────────────────────────────

  /**
   * Inicia a leitura guiada, caractere por caractere.
   */
  start() {
    // Evita iniciar se já estiver lendo ou se não há texto
    if (this.isReading || this.totalLength === 0) return;
    this.isReading = true;
    this._readNext(); // Inicia o loop de leitura
  }

  /**
   * Pausa a leitura imediatamente.
   */
  pause() {
    this.isReading = false;
    // A seleção permanece onde parou (não é limpa)
  }

  /**
   * Aumenta a velocidade (reduz o delay entre caracteres).
   */
  increaseSpeed() {
    this.delay = Math.max(this.minDelay, this.delay - 50);
    this._updateSpeedDisplay(); // Atualiza o display do tempo
  }

  /**
   * Diminui a velocidade (aumenta o delay).
   */
  decreaseSpeed() {
    this.delay = Math.min(this.maxDelay, this.delay + 50);
    this._updateSpeedDisplay();
  }

  // ────────────────────────────────────────
  // MÉTODOS PRIVADOS (internos)
  // ────────────────────────────────────────

  /**
   * Percorre recursivamente o DOM para coletar todos os nós de texto
   * dentro do elemento alvo.
   * 
   * Ignora nós vazios ou apenas com espaços.
   * 
   * @param {Node} node - Nó atual da árvore DOM
   */
  _extractTextNodes(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      // Só inclui nós com conteúdo visível
      if (node.textContent.trim()) {
        this.textNodes.push(node);
      }
    } else {
      // Para elementos (div, p, span...), visita seus filhos
      node.childNodes.forEach(child => this._extractTextNodes(child));
    }
  }

  /**
   * Executa um passo da leitura: seleciona até o caractere atual
   * e agenda o próximo passo (se ainda houver texto).
   */
  _readNext() {
    if (!this.isReading) return; // Cancela se pausado

    // Atualiza a seleção visual até this.currentIndex
    this._selectUpTo(this.currentIndex);

    // Verifica se chegou ao fim
    if (this.currentIndex < this.totalLength) {
      this.currentIndex++;
      // Agenda o próximo caractere com base na velocidade atual
      setTimeout(() => this._readNext(), this.delay);
    } else {
      // Fim da leitura
      this.isReading = false;
      this.onComplete(); // Executa callback de conclusão
    }
  }

  /**
   * Seleciona visualmente o texto do início até uma determinada posição global.
   * 
   * Como o texto pode estar dividido em múltiplos nós (ex: <p>Palavra</p><span>Outra</span>),
   * esta função mapeia o índice global para os nós corretos e offsets.
   * 
   * @param {number} index - Posição global (0 = primeiro caractere)
   */
  _selectUpTo(index) {
    let remaining = index;
    let endNode = null;
    let endOffset = 0;

    // Percorre os nós de texto para encontrar onde "index" está
    for (const node of this.textNodes) {
      const len = node.textContent.length;
      if (remaining <= len) {
        // Encontrou o nó que contém o caractere de destino
        endNode = node;
        endOffset = remaining;
        break;
      }
      remaining -= len;
    }

    // Caso raro: índice excede o texto (proteção)
    if (!endNode) {
      const last = this.textNodes[this.textNodes.length - 1];
      endNode = last;
      endOffset = last.textContent.length;
    }

    // Limpa qualquer seleção anterior
    this.selection.removeAllRanges();

    // Define novo intervalo: do início do primeiro nó até o caractere atual
    const startNode = this.textNodes[0];
    this.range.setStart(startNode, 0);
    this.range.setEnd(endNode, endOffset);

    // Aplica a seleção no navegador
    this.selection.addRange(this.range);
  }

  /**
   * Cria os controles de interface (botões e display) e os insere
   * imediatamente antes do elemento de texto.
   */
  _createControls() {
    // Cria um contêiner <div> para os controles
    const controls = document.createElement('div');
    controls.style.cssText = `
      display: flex;
      gap: 8px;
      padding: 12px;
      background: #f9f9f9;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 14px;
      margin: 16px 0;
      align-items: center;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    `;

    // Botão Start
    const startBtn = document.createElement('button');
    startBtn.textContent = 'Start';
    startBtn.style.padding = '6px 12px';
    startBtn.onclick = () => this.start();

    // Botão Pause
    const pauseBtn = document.createElement('button');
    pauseBtn.textContent = 'Pause';
    pauseBtn.style.padding = '6px 12px';
    pauseBtn.onclick = () => this.pause();

    // Botão "–" (diminuir velocidade)
    const decBtn = document.createElement('button');
    decBtn.textContent = '–';
    decBtn.style.padding = '6px 10px';
    decBtn.onclick = () => this.decreaseSpeed();

    // Botão "+" (aumentar velocidade)
    const incBtn = document.createElement('button');
    incBtn.textContent = '+';
    incBtn.style.padding = '6px 10px';
    incBtn.onclick = () => this.increaseSpeed();

    // Display da velocidade (ex: "300ms")
    this.speedDisplay = document.createElement('span');
    this.speedDisplay.textContent = `${this.delay}ms`;
    this.speedDisplay.style.minWidth = '60px';
    this.speedDisplay.style.textAlign = 'center';
    this.speedDisplay.style.fontWeight = 'bold';

    // Monta a interface
    controls.appendChild(startBtn);
    controls.appendChild(pauseBtn);
    controls.appendChild(decBtn);
    controls.appendChild(incBtn);
    controls.appendChild(this.speedDisplay);

    // Insere os controles ANTES do elemento de texto
    this.element.parentNode.insertBefore(controls, this.element);
  }

  /**
   * Atualiza o display de velocidade com o valor atual de `this.delay`.
   */
  _updateSpeedDisplay() {
    this.speedDisplay.textContent = `${this.delay}ms`;
  }
}