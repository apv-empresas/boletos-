/* ================================================================
   HACKEANDO OS BOLETOS — script.js
   Motor do quiz. Depende de APP_CONFIG (config.js), que deve
   carregar antes deste arquivo.

   COMO ADICIONAR UMA NOVA PERGUNTA (Pergunta 4, 5, ...):
   Basta inserir um novo objeto dentro do array QUIZ_QUESTIONS,
   em qualquer posição ANTES do objeto do tipo "calculator".
   Nenhuma div nova precisa ser criada no HTML — a tela é
   renderizada automaticamente a partir deste array.
   ================================================================ */

(function () {
  'use strict';

  // --------------------------------------------------------------
  // 1. DADOS DO QUIZ
  // --------------------------------------------------------------
  const QUIZ_QUESTIONS = [
    {
      id: 'moradia',
      type: 'choice',
      question: 'Onde você mora atualmente?',
      options: ['Casa', 'Apartamento', 'Condomínio'],
    },
    {
      id: 'conta_dor',
      type: 'choice',
      question: 'Qual dessas contas mais tira o seu sono?',
      options: ['Energia Elétrica', 'Água', 'IPVA/Carro', 'Supermercado'],
    },
    {
      id: 'valor_conta',
      type: 'calculator',
      question: 'Qual o valor médio dessa conta hoje?',
      inputLabel: 'Digite o valor aproximado',
      buttonLabel: 'Calcular Desperdício',
    },

    // Exemplo de como adicionar a Pergunta 4 no futuro — é só descomentar
    // e ajustar o texto, sempre ANTES do objeto "valor_conta" acima:
    // {
    //   id: 'nova_pergunta',
    //   type: 'choice',
    //   question: 'Sua pergunta aqui?',
    //   options: ['Opção A', 'Opção B', 'Opção C'],
    // },
  ];

  const LOADING_MESSAGES = [
    'Cruzando dados da região...',
    'Buscando brechas tarifárias...',
    'Cálculo finalizado.',
  ];

  // Precisa bater com a duração de --transition-step no style.css (.45s)
  const TRANSITION_MS = 450;

  // --------------------------------------------------------------
  // 2. ESTADO
  // --------------------------------------------------------------
  const state = {
    currentIndex: 0,
    answers: {},
  };

  let quizContainerEl = null;
  let progressFillEl = null;
  let progressPercentEl = null;
  let progressNoteEls = [];
  let buttonAudioContext = null;
  let progressAnimationFrame = null;

  // --------------------------------------------------------------
  // 3. UTILITÁRIOS
  // --------------------------------------------------------------
  function formatBRL(value) {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function trackEvent(eventName, payload) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(Object.assign({ event: eventName }, payload || {}));
  }

  function trackFbEvent(eventName, params) {
    if (typeof window.fbq === 'function') {
      window.fbq('track', eventName, params);
    }
  }

  function playButtonSound() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    if (!buttonAudioContext) {
      buttonAudioContext = new AudioContextClass();
    }

    const context = buttonAudioContext;
    const startSound = () => {
      const now = context.currentTime;
      const click = context.createOscillator();
      const clickGain = context.createGain();
      const body = context.createOscillator();
      const bodyGain = context.createGain();

      click.type = 'square';
      click.frequency.setValueAtTime(1100, now);
      click.frequency.exponentialRampToValueAtTime(420, now + 0.018);
      clickGain.gain.setValueAtTime(0.0001, now);
      clickGain.gain.exponentialRampToValueAtTime(0.055, now + 0.001);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.026);

      body.type = 'triangle';
      body.frequency.setValueAtTime(180, now);
      body.frequency.exponentialRampToValueAtTime(85, now + 0.035);
      bodyGain.gain.setValueAtTime(0.0001, now);
      bodyGain.gain.exponentialRampToValueAtTime(0.035, now + 0.002);
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

      click.connect(clickGain);
      clickGain.connect(context.destination);
      body.connect(bodyGain);
      bodyGain.connect(context.destination);
      click.start(now);
      click.stop(now + 0.03);
      body.start(now);
      body.stop(now + 0.05);
    };

    if (context.state === 'suspended') {
      context.resume().then(startSound).catch(() => {});
      return;
    }

    startSound();
  }

  function setupButtonSounds() {
    document.addEventListener('click', (event) => {
      if (event.target.closest('button')) playButtonSound();
    }, true);
  }

  function getUtmParams() {
    const params = new URLSearchParams(window.location.search);
    const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    const utm = {};
    keys.forEach((key) => {
      const value = params.get(key);
      if (value) utm[key] = value;
    });
    return utm;
  }

  // Máscara de moeda BRL simples, sem dependências externas.
  function maskCurrencyInput(inputEl) {
    inputEl.addEventListener('input', () => {
      let digits = inputEl.value.replace(/\D/g, '');

      if (!digits) {
        inputEl.value = '';
        inputEl.dataset.raw = '0';
        return;
      }

      if (digits.length > 9) digits = digits.slice(0, 9); // trava valores absurdamente longos

      const numberValue = parseInt(digits, 10) / 100;
      inputEl.dataset.raw = String(numberValue);
      inputEl.value = formatBRL(numberValue);
    });
  }

  // --------------------------------------------------------------
  // 4. MOTOR DE TRANSIÇÃO ENTRE TELAS (estilo Typeform)
  // --------------------------------------------------------------
  function goToStep(buildFn) {
    const current = quizContainerEl.querySelector('.quiz-step.is-active');

    const stepEl = document.createElement('div');
    stepEl.className = 'quiz-step';
    buildFn(stepEl);
    quizContainerEl.appendChild(stepEl);

    // Duplo requestAnimationFrame garante que o navegador aplique o
    // estado inicial antes de disparar a transição para "is-active".
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (current) {
          current.classList.remove('is-active');
          current.classList.add('is-exiting');
          setTimeout(() => current.remove(), TRANSITION_MS);
        }
        stepEl.classList.add('is-active');
      });
    });

    // Move o foco para o título da nova tela (acessibilidade / leitores de tela)
    setTimeout(() => {
      const heading = stepEl.querySelector('h2');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }
    }, TRANSITION_MS);
  }

  function updateProgress(stepsCompleted) {
    const total = QUIZ_QUESTIONS.length;
    const targetPct = Math.round(Math.min(1, stepsCompleted / total) * 100);
    const currentPct = Number(progressPercentEl.dataset.value || 0);
    const motionReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (progressAnimationFrame) cancelAnimationFrame(progressAnimationFrame);

    const renderProgress = (value) => {
      const roundedValue = Math.round(value);
      const fraction = roundedValue / 100;
      progressFillEl.style.transform = `scaleX(${fraction})`;
      progressPercentEl.textContent = `${roundedValue}%`;
      progressPercentEl.dataset.value = String(roundedValue);

      progressNoteEls.forEach((note, index) => {
        note.classList.toggle('is-earned', roundedValue >= ((index + 1) * 100) / progressNoteEls.length);
      });
    };

    if (motionReduced || currentPct === targetPct) {
      renderProgress(targetPct);
      return;
    }

    const startedAt = performance.now();
    const duration = 700;
    const animate = (now) => {
      const elapsed = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - elapsed, 3);
      renderProgress(currentPct + (targetPct - currentPct) * eased);
      if (elapsed < 1) progressAnimationFrame = requestAnimationFrame(animate);
    };

    progressAnimationFrame = requestAnimationFrame(animate);
  }

  // --------------------------------------------------------------
  // 5. RENDERIZAÇÃO DAS PERGUNTAS
  // --------------------------------------------------------------
  function renderIntroStep() {
    updateProgress(0);

    goToStep((el) => {
      const wrap = document.createElement('div');
      wrap.className = 'step-inner intro-step-inner';

      const image = document.createElement('img');
      image.className = 'intro-wallet-image';
      image.src = 'carteira.jpg';
      image.alt = 'Carteira vazia';

      const eyebrow = document.createElement('p');
      eyebrow.className = 'intro-eyebrow';
      eyebrow.textContent = 'ANTES DE COMEÇAR';

      const heading = document.createElement('h2');
      heading.className = 'step-question intro-question';
      heading.textContent = 'Quanto dinheiro está escapando da sua carteira sem você perceber?';

      const subtitle = document.createElement('p');
      subtitle.className = 'step-subtitle';
      subtitle.textContent = 'Descubra em poucos passos onde suas contas estão drenando seu dinheiro.';

      const startButton = document.createElement('button');
      startButton.type = 'button';
      startButton.className = 'btn-primary intro-start-button';
      startButton.textContent = 'Começar o quiz';
      startButton.addEventListener('click', () => renderQuestion(0));

      wrap.append(image, eyebrow, heading, subtitle, startButton);
      el.appendChild(wrap);
    });
  }

  function renderQuestion(index) {
    updateProgress(index);
    const question = QUIZ_QUESTIONS[index];

    goToStep((el) => {
      if (question.type === 'choice') {
        renderChoiceStep(el, question, index);
      } else if (question.type === 'calculator') {
        renderCalculatorStep(el, question, index);
      }
    });
  }

  function renderChoiceStep(el, question, index) {
    const wrap = document.createElement('div');
    wrap.className = 'step-inner';

    const count = document.createElement('p');
    count.className = 'step-count';
    count.textContent = `Pergunta ${index + 1} de ${QUIZ_QUESTIONS.length}`;

    const heading = document.createElement('h2');
    heading.className = 'step-question';
    heading.textContent = question.question;

    const subtitle = document.createElement('p');
    subtitle.className = 'step-subtitle';
    subtitle.textContent = 'SÃO POUCAS PERGUNTAS SEM ENROLAÇÃO DE GURUS.';

    const options = document.createElement('div');
    options.className = 'options-list';

    question.options.forEach((optionLabel) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'option-btn';
      btn.textContent = optionLabel;
      btn.addEventListener('click', () => handleChoiceSelect(question, optionLabel, btn));
      options.appendChild(btn);
    });

    if (index === 0) {
      wrap.append(count, heading, subtitle, options);
    } else {
      wrap.append(count, heading, options);
    }
    el.appendChild(wrap);
  }

  function handleChoiceSelect(question, value, btnEl) {
    const siblings = btnEl.parentElement.querySelectorAll('.option-btn');
    siblings.forEach((btn) => { btn.disabled = true; });
    btnEl.classList.add('is-selected');

    state.answers[question.id] = value;
    trackEvent('quiz_answer', { question_id: question.id, question_value: value });

    setTimeout(advanceQuiz, 180); // pequena pausa para o usuário ver o feedback do clique
  }

  function renderCalculatorStep(el, question, index) {
    const wrap = document.createElement('div');
    wrap.className = 'step-inner';

    const count = document.createElement('p');
    count.className = 'step-count';
    count.textContent = `Pergunta ${index + 1} de ${QUIZ_QUESTIONS.length}`;

    const heading = document.createElement('h2');
    heading.className = 'step-question';
    heading.textContent = question.question;

    const label = document.createElement('label');
    label.className = 'input-label';
    label.htmlFor = 'valorContaInput';
    label.textContent = question.inputLabel;

    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.id = 'valorContaInput';
    input.className = 'currency-input';
    input.placeholder = 'R$ 0,00';
    input.autocomplete = 'off';
    input.dataset.raw = '0';
    maskCurrencyInput(input);

    const errorMsg = document.createElement('p');
    errorMsg.className = 'input-error';
    errorMsg.setAttribute('role', 'alert');
    errorMsg.hidden = true;
    errorMsg.textContent = 'Digite um valor maior que zero para continuar.';

    const submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'btn-primary';
    submitBtn.textContent = question.buttonLabel;

    function submit() {
      const raw = parseFloat(input.dataset.raw || '0');
      if (!raw || raw <= 0) {
        errorMsg.hidden = false;
        input.classList.add('has-error');
        input.focus();
        return;
      }
      errorMsg.hidden = true;
      state.answers[question.id] = raw;
      trackEvent('calculator_submit', { question_id: question.id, value: raw });
      advanceQuiz();
    }

    submitBtn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
    });
    input.addEventListener('input', () => {
      input.classList.remove('has-error');
      errorMsg.hidden = true;
    });

    wrap.append(count, heading, label, input, errorMsg, submitBtn);
    el.appendChild(wrap);

    setTimeout(() => input.focus(), TRANSITION_MS + 50);
  }

  function advanceQuiz() {
    state.currentIndex += 1;
    if (state.currentIndex < QUIZ_QUESTIONS.length) {
      renderQuestion(state.currentIndex);
    } else {
      startLoadingSequence();
    }
  }

  // --------------------------------------------------------------
  // 6. TELA DE ANTECIPAÇÃO / CARREGAMENTO (Passo 4)
  // --------------------------------------------------------------
  function startLoadingSequence() {
    updateProgress(QUIZ_QUESTIONS.length);
    trackEvent('loading_started');

    goToStep((el) => {
      const wrap = document.createElement('div');
      wrap.className = 'step-inner';

      const heading = document.createElement('h2');
      heading.className = 'loading-title';
      heading.textContent = 'Calculando o seu desperdício...';

      const track = document.createElement('div');
      track.className = 'loading-track';

      const fill = document.createElement('div');
      fill.className = 'loading-fill';
      fill.style.transitionDuration = `${APP_CONFIG.LOADING_DURATION_MS}ms`;
      track.appendChild(fill);

      const statusText = document.createElement('p');
      statusText.className = 'loading-status';
      statusText.textContent = LOADING_MESSAGES[0];

      wrap.append(heading, track, statusText);
      el.appendChild(wrap);

      // Dispara a animação de preenchimento 0% -> 100%
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          fill.classList.add('is-filling');
        });
      });

      // Alterna os textos de status durante o carregamento
      const stepDuration = APP_CONFIG.LOADING_DURATION_MS / LOADING_MESSAGES.length;
      LOADING_MESSAGES.forEach((msg, i) => {
        if (i === 0) return;
        setTimeout(() => {
          statusText.classList.add('is-fading');
          setTimeout(() => {
            statusText.textContent = msg;
            statusText.classList.remove('is-fading');
          }, 150);
        }, stepDuration * i);
      });
    });

    setTimeout(showResult, APP_CONFIG.LOADING_DURATION_MS);
  }

  // --------------------------------------------------------------
  // 7. TELA DE RESULTADO E VENDA (Passo 5)
  // --------------------------------------------------------------
  function calculateWaste() {
    const monthly = state.answers.valor_conta || 0;
    const annualTotal = monthly * APP_CONFIG.MONTHS_PER_YEAR;
    return annualTotal * APP_CONFIG.WASTE_PERCENTAGE;
  }

  function showResult() {
    const wasteValue = calculateWaste();
    const formatted = formatBRL(wasteValue);

    trackEvent('result_viewed', { waste_value: wasteValue });
    trackFbEvent('Lead', { value: wasteValue, currency: 'BRL' });

    goToStep((el) => {
      const wrap = document.createElement('div');
      wrap.className = 'step-inner';

      const lead = document.createElement('p');
      lead.className = 'result-lead';
      lead.textContent = 'Você está perdendo cerca de';

      const value = document.createElement('h2');
      value.className = 'result-value';
      value.textContent = `${formatted}`;

      const per = document.createElement('p');
      per.className = 'result-period';
      per.textContent = 'por ano';

      const support = document.createElement('p');
      support.className = 'result-support';
      support.textContent = 'Identificamos brechas tarifárias para o seu perfil. O aplicativo vai te mostrar o passo a passo para estancar esse vazamento de dinheiro hoje.';

      const cta = document.createElement('button');
      cta.type = 'button';
      cta.className = 'btn-cta';
      cta.textContent = 'QUERO RECUPERAR MEU DINHEIRO (R$ 19,90)';
      cta.addEventListener('click', () => handleCtaClick(wasteValue, cta));

      wrap.append(lead, value, per, support, cta);
      el.appendChild(wrap);
    });
  }

  // --------------------------------------------------------------
  // 8. CTA FINAL: ENVIA DADOS PARA n8n + GOOGLE SHEETS E REDIRECIONA
  // --------------------------------------------------------------
  function handleCtaClick(wasteValue, btnEl) {
    btnEl.disabled = true;
    btnEl.textContent = 'Redirecionando...';

    trackEvent('cta_click', { waste_value: wasteValue });
    trackFbEvent('InitiateCheckout', { value: 19.9, currency: 'BRL' });

    const payload = {
      tipo_moradia: state.answers.moradia || '',
      conta_principal: state.answers.conta_dor || '',
      valor_conta_mensal: state.answers.valor_conta || 0,
      desperdicio_calculado_anual: wasteValue,
      utm: getUtmParams(),
      timestamp: new Date().toISOString(),
      // Inclui automaticamente qualquer pergunta nova que você adicionar no futuro:
      respostas_completas: state.answers,
    };

    sendConversionData(payload).finally(redirectToCheckout);
  }

  // Dispara os dados simultaneamente para o n8n e para o Google Apps Script.
  // Usa mode: 'no-cors' (esses endpoints normalmente não devolvem headers CORS)
  // e keepalive: true (garante o envio mesmo se a navegação para o checkout
  // já tiver começado). Um timeout evita que um webhook lento trave o CTA.
  function sendConversionData(payload) {
    const body = JSON.stringify(payload);
    const requestOptions = {
      method: 'POST',
      mode: 'no-cors',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body,
    };

    const requests = [
      fetch(APP_CONFIG.N8N_WEBHOOK_URL, requestOptions).catch((err) => {
        console.warn('[n8n] Falha ao enviar webhook:', err);
      }),
      fetch(APP_CONFIG.GOOGLE_SHEETS_URL, requestOptions).catch((err) => {
        console.warn('[Google Sheets] Falha ao enviar dados:', err);
      }),
    ];

    const timeout = new Promise((resolve) => setTimeout(resolve, APP_CONFIG.WEBHOOK_TIMEOUT_MS));

    return Promise.race([Promise.allSettled(requests), timeout]);
  }

  function redirectToCheckout() {
    try {
      const url = new URL(APP_CONFIG.CHECKOUT_URL);
      const utm = getUtmParams();
      Object.entries(utm).forEach(([key, value]) => url.searchParams.set(key, value));
      window.location.href = url.toString();
    } catch (err) {
      // Fallback caso CHECKOUT_URL ainda não tenha sido configurada como URL válida
      window.location.href = APP_CONFIG.CHECKOUT_URL;
    }
  }

  function setupLegalModal() {
    const modal = document.getElementById('legalModal');
    const title = document.getElementById('legalModalTitle');
    const privacyContent = document.getElementById('privacyContent');
    const termsContent = document.getElementById('termsContent');
    const closeButton = document.getElementById('closeLegalModal');
    const legalButtons = document.querySelectorAll('[data-legal]');

    if (!modal || !title || !privacyContent || !termsContent || !closeButton) return;

    legalButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const isPrivacy = button.dataset.legal === 'privacy';
        title.textContent = isPrivacy ? 'Política de Privacidade' : 'Termos de Uso';
        privacyContent.hidden = !isPrivacy;
        termsContent.hidden = isPrivacy;
        if (typeof modal.showModal === 'function') {
          modal.showModal();
        } else {
          modal.setAttribute('open', '');
        }
        closeButton.focus();
      });
    });

    closeButton.addEventListener('click', () => modal.close());
    modal.addEventListener('click', (event) => {
      if (event.target === modal) modal.close();
    });
  }

  function loadConsentScripts(categories) {
    document.querySelectorAll('script[type="text/plain"][data-consent]').forEach((script) => {
      const category = script.dataset.consent;
      if (!categories[category] || script.dataset.loaded === 'true') return;

      const activeScript = document.createElement('script');
      activeScript.textContent = script.textContent;
      activeScript.dataset.loaded = 'true';
      document.head.appendChild(activeScript);
      script.dataset.loaded = 'true';
    });
  }

  function setupCookieConsent() {
    const storageKey = 'cookie_consent_v1';
    const banner = document.getElementById('cookieBanner');
    const modal = document.getElementById('cookieModal');
    const analyticsInput = document.getElementById('analyticsCookies');
    const marketingInput = document.getElementById('marketingCookies');
    const storedConsent = localStorage.getItem(storageKey);

    if (!banner || !modal || !analyticsInput || !marketingInput) return;

    const applyConsent = (analytics, marketing) => {
      const consent = {
        analytics: Boolean(analytics),
        marketing: Boolean(marketing),
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(storageKey, JSON.stringify(consent));
      loadConsentScripts(consent);
      banner.hidden = true;
      if (modal.open) modal.close();
    };

    if (storedConsent) {
      try {
        const consent = JSON.parse(storedConsent);
        analyticsInput.checked = consent.analytics === true;
        marketingInput.checked = consent.marketing === true;
        loadConsentScripts(consent);
      } catch (error) {
        localStorage.removeItem(storageKey);
      }
    }

    if (!localStorage.getItem(storageKey)) banner.hidden = false;

    document.getElementById('acceptCookies').addEventListener('click', () => applyConsent(true, true));
    document.getElementById('rejectCookies').addEventListener('click', () => applyConsent(false, false));
    document.getElementById('saveCookiePreferences').addEventListener('click', () => {
      applyConsent(analyticsInput.checked, marketingInput.checked);
    });
    document.getElementById('openCookieDetails').addEventListener('click', () => {
      modal.showModal();
    });
    document.getElementById('openCookieSettings').addEventListener('click', () => {
      modal.showModal();
    });
    document.getElementById('closeCookieModal').addEventListener('click', () => modal.close());
    modal.addEventListener('click', (event) => {
      if (event.target === modal) modal.close();
    });
  }

  // --------------------------------------------------------------
  // 9. INICIALIZAÇÃO
  // --------------------------------------------------------------
  function initQuiz() {
    quizContainerEl = document.getElementById('quizContainer');
    progressFillEl = document.getElementById('quizProgressFill');
    progressPercentEl = document.getElementById('quizProgressPercent');
    progressNoteEls = Array.from(document.querySelectorAll('.progress-note'));

    const yearEl = document.getElementById('currentYear');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    setupLegalModal();
    setupCookieConsent();
    setupButtonSounds();
    trackEvent('quiz_start');
    renderIntroStep();
  }

  document.addEventListener('DOMContentLoaded', initQuiz);
})();
