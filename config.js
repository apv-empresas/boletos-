/* ================================================================
   HACKEANDO OS BOLETOS — config.js
   Edite SOMENTE os valores abaixo. O script.js não precisa ser
   alterado para você colocar isso no ar.
   ================================================================ */

const APP_CONFIG = Object.freeze({

  // ------------------------------------------------------------
  // INTEGRAÇÕES DE BACK-END
  // ------------------------------------------------------------

  // URL do Webhook do n8n. No n8n, crie um nó "Webhook" (método POST),
  // ative o workflow e cole aqui a URL de PRODUÇÃO (não a de teste).
  N8N_WEBHOOK_URL: 'https://SEU-N8N.dominio.com/webhook/hackeando-os-boletos',

  // URL do Web App do Google Apps Script.
  // No editor do Apps Script: Implantar > Nova implantação > Tipo "App da Web",
  // Executar como "Eu", Quem pode acessar "Qualquer pessoa". Cole a URL /exec aqui.
  GOOGLE_SHEETS_URL: 'https://script.google.com/macros/s/SEU_ID_DO_SCRIPT/exec',

  // Página de checkout para onde o usuário é enviado ao clicar no CTA final.
  CHECKOUT_URL: 'https://SEUDOMINIO.com.br/checkout',

  // Tempo máximo (ms) que o quiz espera pelos dois envios acima antes de
  // redirecionar de qualquer forma. Evita que uma falha no webhook trave o CTA.
  WEBHOOK_TIMEOUT_MS: 1200,

  // ------------------------------------------------------------
  // REGRAS DE NEGÓCIO DA CALCULADORA
  // ------------------------------------------------------------

  MONTHS_PER_YEAR: 12,     // multiplicador de meses
  WASTE_PERCENTAGE: 0.30,  // 30% de "desperdício" estimado sobre o valor anual

  // Duração (ms) da tela de "Antecipação" / carregamento (Passo 4).
  LOADING_DURATION_MS: 3000,
});
