const video = document.getElementById("webcam");
const statusDiv = document.getElementById("status");
let faceMatcher = null;
let isAuthenticating = false;

function showStatus(message, type) {
  if (statusDiv) {
    statusDiv.className = `status-msg ${type}`;
    statusDiv.innerText = message;
  }
}

async function init() {
  showStatus("Carregando modelos de reconhecimento facial...", "info");
  try {
    const MODEL_URL =
      "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/";

    // Carrega modelos do face-api e lista de usuários
    const [, usersResponse] = await Promise.all([
      Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]),
      fetch("/api/users"),
    ]);

    const users = await usersResponse.json();

    if (!users || users.length === 0) {
      showStatus("Nenhum colaborador cadastrado no banco de dados.", "error");
      return;
    }

    // Prepara os descritores
    const labeledDescriptors = users.map((user) => {
      const floatDescriptor = new Float32Array(Object.values(user.descriptor));
      return new faceapi.LabeledFaceDescriptors(user.name, [floatDescriptor]);
    });

    faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.5);

    showStatus("Modelos prontos. Iniciando câmera...", "info");
    startVideo();
  } catch (err) {
    showStatus("Erro ao inicializar: " + err.message, "error");
  }
}

async function startVideo() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: {} });
    video.srcObject = stream;
  } catch (err) {
    showStatus("Erro ao acessar a câmera.", "error");
  }
}

video.addEventListener("play", () => {
  const displaySize = {
    width: video.width || 640,
    height: video.height || 480,
  };

  const interval = setInterval(async () => {
    if (isAuthenticating) return;

    const detections = await faceapi
      .detectAllFaces(video)
      .withFaceLandmarks()
      .withFaceDescriptors();

    if (detections.length > 0) {
      const resizedDetections = faceapi.resizeResults(detections, displaySize);

      for (const detection of resizedDetections) {
        const bestMatch = faceMatcher.findBestMatch(detection.descriptor);

        if (bestMatch.label !== "unknown") {
          isAuthenticating = true;
          clearInterval(interval);

          // Salva uma flag no navegador indicando que o usuário passou na biometria
          localStorage.setItem("user_authenticated", "true");
          localStorage.setItem("user_name", bestMatch.label);

          showStatus(
            `Acesso Permitido! Bem-vindo(a), ${bestMatch.label}. Redirecionando...`,
            "success",
          );

          // Redireciona para o Painel Secreto (e não para o cadastro)
          setTimeout(() => {
            window.location.href = "/painel-secreto";
          }, 1200);
          break;
        } else {
          showStatus("Rosto não reconhecido. Acesso negado.", "error");
        }
      }
    } else {
      showStatus("Aguardando detecção de rosto...", "info");
    }
  }, 400);
});

init();
