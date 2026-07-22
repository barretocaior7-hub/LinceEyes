const video = document.getElementById('webcam');
const statusDiv = document.getElementById('status');
let faceMatcher = null;
let isAuthenticating = false;

async function init() {
  showStatus('Carregando modelos e base biométrica...', 'info');
  try {
    const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
    
    // Carrega modelos e dados cadastrados em paralelo
    const [, usersResponse] = await Promise.all([
      Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
      ]),
      fetch('/api/users')
    ]);

    const users = await usersResponse.json();

    if (users.length === 0) {
      showStatus('Nenhum usuário cadastrado no banco de dados.', 'error');
      return;
    }

    // Prepara os descritores para a comparação
    const labeledDescriptors = users.map(user => {
      const floatDescriptor = new Float32Array(user.descriptor);
      return new faceapi.LabeledFaceDescriptors(user.name, [floatDescriptor]);
    });

    // Inicializa o Matcher com limite de distância euclidiana de 0.5 (Tolerância)
    faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.5);

    showStatus('Modelos prontos. Iniciando câmera...', 'info');
    startVideo();
  } catch (err) {
    showStatus('Erro ao inicializar o sistema: ' + err.message, 'error');
  }
}

async function startVideo() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: {} });
    video.srcObject = stream;
  } catch (err) {
    showStatus('Erro de acesso à câmera.', 'error');
  }
}

video.addEventListener('play', () => {
  const canvas = faceapi.createCanvasFromMedia(video);
  document.getElementById('canvas-container').append(canvas);

  const displaySize = { width: video.videoWidth || 480, height: video.videoHeight || 360 };
  faceapi.matchDimensions(canvas, displaySize);

  const interval = setInterval(async () => {
    if (isAuthenticating) return;

    const detections = await faceapi.detectAllFaces(video)
      .withFaceLandmarks()
      .withFaceDescriptors();

    const resizedDetections = faceapi.resizeResults(detections, displaySize);
    
    // Limpa o canvas a cada frame
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    faceapi.draw.drawDetections(canvas, resizedDetections);

    if (detections.length > 0) {
      for (const detection of resizedDetections) {
        const bestMatch = faceMatcher.findBestMatch(detection.descriptor);

        if (bestMatch.label !== 'unknown') {
          isAuthenticating = true;
          clearInterval(interval);
          showStatus(`Acesso Permitido! Bem-vindo(a), ${bestMatch.label}. Redirecionando...`, 'success');

          // Redirecionamento seguro para o painel secreto
          setTimeout(() => {
            window.location.href = '/painel-secreto';
          }, 1500);
          break;
        } else {
          showStatus('Rosto não reconhecido. Acesso negado.', 'error');
        }
      }
    } else {
      showStatus('Aguardando detecção facial...', 'info');
    }
  }, 300);
});

function showStatus(message, type) {
  statusDiv.className = `status-msg ${type}`;
  statusDiv.innerText = message;
}

init();