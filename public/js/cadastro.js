let authToken = localStorage.getItem('rh_token') || null;
let modelsLoaded = false;

const rhAuthBox = document.getElementById('rh-auth-box');
const registrationSection = document.getElementById('registration-section');
const rhLoginForm = document.getElementById('rh-login-form');
const registerForm = document.getElementById('register-form');
const video = document.getElementById('webcam');
const statusDiv = document.getElementById('status');

function showStatus(msg, type) {
  if (statusDiv) {
    statusDiv.className = `status-msg ${type}`;
    statusDiv.innerText = msg;
  }
}

// 1. Login do RH
if (rhLoginForm) {
  rhLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('rhUser').value.trim();
    const password = document.getElementById('rhPass').value.trim();

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
        rhAuthBox.style.display = 'none';
        registrationSection.style.display = 'block';
        initFaceApi();
      } else {
        showStatus(data.error || 'Credenciais inválidas.', 'error');
      }
    } catch (err) {
      showStatus('Erro ao conectar com servidor.', 'error');
    }
  });
}

if (authToken) {
  if (rhAuthBox) rhAuthBox.style.display = 'none';
  if (registrationSection) registrationSection.style.display = 'block';
  initFaceApi();
}

// 2. Carrega Modelos do face-api
async function initFaceApi() {
  showStatus('Carregando modelos faciais...', 'info');
  try {
    const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
    ]);

    modelsLoaded = true;
    showStatus('Modelos carregados. Ligando câmera...', 'info');
    startCamera();
  } catch (err) {
    showStatus('Erro ao carregar modelos: ' + err.message, 'error');
  }
}

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: {} });
    video.srcObject = stream;
    showStatus('Câmera pronta para captura.', 'success');
  } catch (err) {
    showStatus('Erro ao acessar a câmera.', 'error');
  }
}

// 3. Salva o cadastro com descritor do face-api
if (registerForm) {
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!modelsLoaded) {
      showStatus('Aguarde os modelos faciais carregarem.', 'error');
      return;
    }

    showStatus('Capturando biometria do rosto...', 'info');

    const detection = await faceapi.detectSingleFace(video)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      showStatus('Nenhum rosto detectado na câmera! Posicione-se em frente à câmera.', 'error');
      return;
    }

    const descriptorArray = Array.from(detection.descriptor);

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
          descriptor: descriptorArray
        })
      });

      const result = await response.json();

      if (response.ok) {
        showStatus(`✅ Colaborador cadastrado! Código: ${result.employee.employeeCode}`, 'success');
        registerForm.reset();
      } else {
        showStatus(result.error || 'Erro ao cadastrar.', 'error');
      }
    } catch (err) {
      showStatus('Erro na requisição: ' + err.message, 'error');
    }
  });
}