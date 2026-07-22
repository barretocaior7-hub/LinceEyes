const video = document.getElementById('webcam');
const registerForm = document.getElementById('register-form');
const btnRegister = document.getElementById('btn-register');
const statusDiv = document.getElementById('status');

// 1. Carregar modelos do face-api.js
async function loadModels() {
  showStatus('Carregando modelos de IA...', 'info');
  try {
    const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
    ]);
    btnRegister.disabled = false;
    btnRegister.innerText = 'Capturar e Cadastrar Biometria';
    showStatus('Modelos carregados com sucesso!', 'success');
    startVideo();
  } catch (err) {
    showStatus('Erro ao carregar modelos de IA: ' + err.message, 'error');
  }
}

// 2. Iniciar Stream da Webcam
async function startVideo() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: {} });
    video.srcObject = stream;
  } catch (err) {
    showStatus('Erro ao acessar a webcam. Verifique as permissões do navegador.', 'error');
  }
}

// 3. Capturar e Extrair Descritor Biométrico
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  btnRegister.disabled = true;
  btnRegister.innerText = 'Processando vetor biométrico...';

  const employeeId = document.getElementById('employeeId').value.trim();
  const name = document.getElementById('name').value.trim();

  try {
    // Detecta o rosto com landmarks e calcula o vetor de 128 posições
    const detection = await faceapi.detectSingleFace(video)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      showStatus('Nenhum rosto detectado. Certifique-se de que a iluminação está boa.', 'error');
      btnRegister.disabled = false;
      btnRegister.innerText = 'Capturar e Cadastrar Biometria';
      return;
    }

    // Vetor numérico (Float32Array convertido para Array padrão para JSON)
    const descriptorArray = Array.from(detection.descriptor);

    // Envia os dados para a API Backend (Sem foto bruta)
    const response = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeId,
        name,
        descriptor: descriptorArray
      })
    });

    const result = await response.json();

    if (response.ok) {
      showStatus('Biometria cadastrada com sucesso!', 'success');
      registerForm.reset();
    } else {
      showStatus(result.error || 'Erro ao registrar.', 'error');
    }
  } catch (err) {
    showStatus('Erro durante o processamento: ' + err.message, 'error');
  } finally {
    btnRegister.disabled = false;
    btnRegister.innerText = 'Capturar e Cadastrar Biometria';
  }
});

function showStatus(message, type) {
  statusDiv.className = `status-msg ${type}`;
  statusDiv.innerText = message;
}

loadModels();