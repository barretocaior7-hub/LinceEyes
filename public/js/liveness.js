/**
 * Validador de Profundidade Tridimensional (MediaPipe 3D Mesh)
 */
const MediaPipe3DLiveness = {
  // Índices canônicos da malha 3D de 478 pontos do MediaPipe
  LANDMARKS: {
    NOSE_TIP: 1,      // Ponta do nariz (ponto mais próximo da câmera)
    LEFT_EAR: 234,    // Tragus/Orelha esquerda
    RIGHT_EAR: 454,   // Tragus/Orelha direita
    CHIN: 152,        // Queixo
    FOREHEAD: 10      // Testa
  },

  /**
   * Avalia se a face detectada possui curvatura 3D real ou se é uma imagem plana (2D)
   * @param {Array} landmarks - Array de 478 pontos com {x, y, z}
   * @returns {Object} { is3D: boolean, depthScore: number, message: string }
   */
  validate3DDepth(landmarks) {
    if (!landmarks || landmarks.length < 478) {
      return { is3D: false, depthScore: 0, message: 'Rosto incompleto no enquadramento.' };
    }

    const nose = landmarks[this.LANDMARKS.NOSE_TIP];
    const leftEar = landmarks[this.LANDMARKS.LEFT_EAR];
    const rightEar = landmarks[this.LANDMARKS.RIGHT_EAR];

    // No MediaPipe, valores menores de Z significam pontos mais próximos do sensor.
    // Em uma cabeça 3D, a ponta do nariz fica visivelmente mais próxima que as orelhas.
    const averageEarZ = (leftEar.z + rightEar.z) / 2;
    const depthDifference = averageEarZ - nose.z;

    // Em fotos planas (impressas ou em celular), a diferença de profundidade Z é virtualmente nula (< 0.025)
    const LIMIAR_MINIMO_3D = 0.035;

    if (depthDifference < LIMIAR_MINIMO_3D) {
      return {
        is3D: false,
        depthScore: depthDifference.toFixed(4),
        message: '🔒 ALERTA DE SPOOFING: Imagem plana detectada (Foto/Tela)!'
      };
    }

    return {
      is3D: true,
      depthScore: depthDifference.toFixed(4),
      message: '✅ Rosto Tridimensional Autêntico Validado.'
    };
  },

  /**
   * Converte os 478 pontos 3D do MediaPipe em um descritor/vetor numérico de características
   * para salvamento e comparação no banco de dados.
   */
  generateDescriptor(landmarks) {
    const descriptor = [];
    // Normaliza e extrai posições relativas x, y, z
    const nose = landmarks[this.LANDMARKS.NOSE_TIP];
    
    for (let i = 0; i < landmarks.length; i += 3) { // Sub-amostragem homogênea para otimização
      descriptor.push(landmarks[i].x - nose.x);
      descriptor.push(landmarks[i].y - nose.y);
      descriptor.push(landmarks[i].z - nose.z);
    }
    return descriptor;
  }
};