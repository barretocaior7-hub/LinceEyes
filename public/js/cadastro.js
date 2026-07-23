let faceLandmarker = null;
let authToken = localStorage.getItem('rh_token') || null;
let currentLandmarks = null;
let is3DVerified = false;
let lastVideoTime = -1;

// Mapeamento dos Elementos do DOM
const rhAuthBox = document.getElementById('rh-auth-box');
const registrationSection = document.getElementById('registration-section');
const rhLoginForm = document.getElementById('rh-login-form');
const registerForm = document.getElementById('register-form');
const video = document.getElementById('webcam');
const btnRegister = document.getElementById('btn-register');
const statusDiv = document.getElementById('status');
const livenessBadge = document.getElementById('liveness-badge');

/**
 * Exibe mensagens de status na interface
 */
function showStatus(msg, type) {
  if (statusDiv) {
    statusDiv.className = `status-msg ${type}`;
    statusDiv.innerText = msg;
  }
}

/**
 * Inicialização do Detector 3D MediaPipe
 */
async function waitForMediaPipe(timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const FaceLandmarker = window.vision?.FaceLandmarker || window.FaceLandmarker;
    const FilesetResolver = window.vision?.FilesetResolver || window.FilesetResolver;
    
    if (FaceLandmarker && FilesetResolver) {
      return { FaceLandmarker, FilesetResolver };
    }
    // Aguarda 200ms antes de tentar novamente
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  return null;
}

/**
 * Inicialização com tolerância a carregamento lento de rede
 */
async function initMediaPipe() {
  showStatus('Aguardando inicialização da biblioteca MediaPipe 3D...', 'info');

  try {
    // Tenta obter as classes com retenção de tempo
    const mp = await waitForMediaPipe();

    if (!mp) {
      throw new Error('O navegador não conseguiu baixar a biblioteca do CDN. Verifique a conexão com a internet ou bloqueadores de anúncios.');
    }

    const { FaceLandmarker, FilesetResolver } = mp;

    const filesetResolver = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
    );

    faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numFaces: 1
    });

    showStatus('Modelo 3D pronto! Solicitando acesso à câmera...', 'info');
    startCamera();
  } catch (err) {
    showStatus('Erro ao carregar MediaPipe 3D: ' + err.message, 'error');
  }
}

/**
 * Inicia a Câmera do Usuário
 */
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { width: 640, height: 480 } 
    });
    video.srcObject = stream;
    video.addEventListener("loadeddata", predictWebcam);
  } catch (err) {
    showStatus('Erro ao acessar a webcam. Permita o uso da câmera no navegador.', 'error');
  }
}

/**
 * Processamento em Tempo Real do Rosto 3D
 */
async function predictWebcam() {
  if (!faceLandmarker) return;

  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    let results = faceLandmarker.detectForVideo(video, performance.now());

    if (results.faceLandmarks && results.faceLandmarks.length > 0) {
      currentLandmarks = results.faceLandmarks[0];

      // Valida se possui curvatura 3D real no eixo Z
      const validation = MediaPipe3DLiveness.validate3DDepth(currentLandmarks);

      if (validation.is3D) {
        is3DVerified = true;
        livenessBadge.className = 'status-msg success';
        livenessBadge.innerText = `${validation.message} (Escore 3D: ${validation.depthScore})`;
        btnRegister.disabled = false;
        btnRegister.innerText = 'Salvar Cadastramento Biométrico';
      } else {
        is3DVerified = false;
        livenessBadge.className = 'status-msg error';
        livenessBadge.innerText = `${validation.message} (Escore 3D: ${validation.depthScore})`;
        btnRegister.disabled = true;
        btnRegister.innerText = 'Bloqueado (Superfície Plana Detectada)';
      }
    } else {
      is3DVerified = false;
      livenessBadge.className = 'status-msg info';
      livenessBadge.innerText = 'Aguardando enquadramento do rosto na câmera...';
      btnRegister.disabled = true;
    }
  }
  requestAnimationFrame(predictWebcam);
}

// ============================================================================
// EVENTOS E FLUXO DE NAVEGAÇÃO
// ============================================================================

// 1. Login do Operador RH
if (rhLoginForm) {
  rhLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('rhUser').value.trim();
    const password = document.getElementById('rhPass').value.trim();

    showStatus('Autenticando operador do RH...', 'info');

    try {
      const res = await fetch('/api/auth/login-rh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();

      if (res.ok && data.token) {
        authToken = data.token;
        localStorage.setItem('rh_token', authToken);
        showStatus('RH Autenticado com sucesso!', 'success');
        
        rhAuthBox.style.display = 'none';
        registrationSection.style.display = 'block';
        
        // Inicializa o detector 3D
        initMediaPipe();
      } else {
        showStatus(data.error || 'Credenciais de RH inválidas.', 'error');
      }
    } catch (err) {
      showStatus('Erro ao conectar com o servidor: ' + err.message, 'error');
    }
  });
}

// 2. Se o operador RH já possui sessão ativa/salva
if (authToken) {
  if (rhAuthBox) rhAuthBox.style.display = 'none';
  if (registrationSection) registrationSection.style.display = 'block';
  initMediaPipe();
}

// 3. Submissão do Formulário de Cadastramento Biométrico
if (registerForm) {
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!is3DVerified || !currentLandmarks) {
      showStatus('Apenas rostos tridimensionais autênticos podem ser cadastrados.', 'error');
      return;
    }

    btnRegister.disabled = true;
    showStatus('Processando e salvando colaborador...', 'info');

    const descriptor = MediaPipe3DLiveness.generateDescriptor(currentLandmarks);

    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          name: document.getElementById('name').value.trim(),
          cargo: document.getElementById('cargo').value.trim(),
          setor: document.getElementById('setor').value.trim(),
          descriptor: descriptor
        })
      });

      const result = await response.json();

      if (response.ok) {
        showStatus(`✅ Sucesso! Colaborador registrado com o Código: ${result.employee.employeeCode}`, 'success');
        registerForm.reset();
        is3DVerified = false;
      } else {
        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem('rh_token');
          showStatus('Sessão do RH expirada. Faça login novamente.', 'error');
          setTimeout(() => window.location.reload(), 2000);
        } else {
          showStatus(result.error || 'Erro ao cadastrar colaborador.', 'error');
        }
      }
    } catch (err) {
      showStatus('Erro ao enviar requisição: ' + err.message, 'error');
    } finally {
      if (is3DVerified) btnRegister.disabled = false;
    }
  });
}