const video = document.getElementById('webcam');
const statusDiv = document.getElementById('status');

let faceLandmarker = null;
let registeredUsers = [];
let isAuthenticating = false;
let lastVideoTime = -1;

function showStatus(message, type) {
  if (statusDiv) {
    statusDiv.className = `status-msg ${type}`;
    statusDiv.innerText = message;
  }
}

function calculate3DDistance(descA, descB) {
  if (!descA || !descB || descA.length !== descB.length) return 999;
  let sum = 0;
  for (let i = 0; i < descA.length; i++) {
    const diff = descA[i] - descB[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

async function init() {
  showStatus('A procurar colaboradores cadastrados...', 'info');
  
  try {
    const usersResponse = await fetch('/api/users');
    if (!usersResponse.ok) throw new Error('Falha ao conectar à API.');
    
    registeredUsers = await usersResponse.json();

    if (!registeredUsers || registeredUsers.length === 0) {
      showStatus('Nenhum colaborador cadastrado. Cadastre um usuário primeiro no Painel RH.', 'error');
      return;
    }

    const FaceLandmarker = window.vision?.FaceLandmarker || window.FaceLandmarker;
    const FilesetResolver = window.vision?.FilesetResolver || window.FilesetResolver;

    if (!FaceLandmarker || !FilesetResolver) {
      throw new Error('A biblioteca MediaPipe ainda não foi carregada no navegador.');
    }

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

    showStatus('Modelo 3D pronto! A ligar a câmara...', 'info');
    startCamera();
  } catch (err) {
    showStatus('Erro na inicialização: ' + err.message, 'error');
  }
}

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
    video.srcObject = stream;
    video.addEventListener("loadeddata", processLoginFrame);
  } catch (err) {
    showStatus('Erro ao aceder à câmara.', 'error');
  }
}

async function processLoginFrame() {
  if (isAuthenticating || !faceLandmarker) return;

  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const results = faceLandmarker.detectForVideo(video, performance.now());

    if (results.faceLandmarks && results.faceLandmarks.length > 0) {
      const landmarks = results.faceLandmarks[0];

      // 1. Antispoofing / Vivacidade 3D
      const validation = MediaPipe3DLiveness.validate3DDepth(landmarks);

      if (!validation.is3D) {
        showStatus('🔒 Acesso Negado: Foto/Tela plana detectada!', 'error');
      } else {
        // 2. Reconhecimento
        const currentDescriptor = MediaPipe3DLiveness.generateDescriptor(landmarks);
        let bestMatch = null;
        let minDistance = 0.25; // Tolerância de comparação

        registeredUsers.forEach(user => {
          const dist = calculate3DDistance(currentDescriptor, user.descriptor);
          if (dist < minDistance) {
            minDistance = dist;
            bestMatch = user;
          }
        });

        if (bestMatch) {
          isAuthenticating = true;
          showStatus(`✅ Autenticado! Bem-vindo(a), ${bestMatch.name}. A redirecionar...`, 'success');
          
          setTimeout(() => {
            window.location.href = '/painel-secreto';
          }, 1200);
          return;
        } else {
          showStatus('Rosto autêntico 3D, mas não cadastrado no sistema.', 'error');
        }
      }
    } else {
      showStatus('Aguardando rosto no enquadramento...', 'info');
    }
  }

  requestAnimationFrame(processLoginFrame);
}

init();