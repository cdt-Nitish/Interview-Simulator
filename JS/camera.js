// JS/camera.js - Robust Webcam Stream & MediaPipe HUD Telemetry Controller

document.addEventListener('DOMContentLoaded', () => {
  // Camera DOM Elements
  const videoElement = document.getElementById('camera');
  const toggleCameraBtn = document.getElementById('toggleCameraBtn');
  const retryCameraBtn = document.getElementById('retryCameraBtn');
  const cameraFallback = document.getElementById('cameraFallback');
  const cameraFallbackMessage = document.getElementById('cameraFallbackMessage');
  const cameraStatusDot = document.getElementById('cameraStatusDot');
  const hudFaceStatus = document.getElementById('hudFaceStatus');

  let currentStream = null;
  let isCameraActive = false;

  /**
   * Request and start the webcam video stream with robust error handling
   */
  const startCamera = async () => {
    // If stream is already active, prevent duplicate requests
    if (isCameraActive && currentStream) {
      return;
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('MediaDevices API is not supported in this browser environment.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
        audio: false, // Audio processed separately if required
      });

      currentStream = stream;
      if (videoElement) {
        videoElement.srcObject = stream;
      }

      isCameraActive = true;
      updateCameraUI(true);
      console.log('✅ Webcam initialized successfully.');
    } catch (error) {
      console.error('Error accessing the camera:', error);
      isCameraActive = false;
      updateCameraUI(false);

      // Handle NotReadableError: Device in use by another app (Zoom, Teams, another browser tab, etc.)
      if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        const busyMessage = 'Webcam is currently in use by another application. Please close it and try again.';
        alert(busyMessage);
        if (cameraFallbackMessage) {
          cameraFallbackMessage.textContent = busyMessage;
        }
      } else if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        const deniedMsg = 'Webcam access was denied. Please allow camera permissions in your browser address bar.';
        if (cameraFallbackMessage) {
          cameraFallbackMessage.textContent = deniedMsg;
        }
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        const notFoundMsg = 'No webcam device was detected. Please connect a camera and try again.';
        if (cameraFallbackMessage) {
          cameraFallbackMessage.textContent = notFoundMsg;
        }
      } else {
        if (cameraFallbackMessage) {
          cameraFallbackMessage.textContent = `Camera error (${error.name || 'Unavailable'}): ${error.message}`;
        }
      }
    }
  };

  /**
   * Gracefully stop the camera stream and release hardware tracks
   */
  const stopCamera = () => {
    if (currentStream) {
      currentStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {}
      });
      currentStream = null;
    }
    if (videoElement) {
      videoElement.srcObject = null;
    }
    isCameraActive = false;
    updateCameraUI(false);
    console.log('🛑 Webcam stream stopped and released.');
  };

  /**
   * Update visual HUD and telemetry indicators
   */
  const updateCameraUI = (active) => {
    if (active) {
      if (cameraFallback) cameraFallback.style.display = 'none';
      if (cameraStatusDot) {
        cameraStatusDot.style.backgroundColor = '#10b981'; // Green status dot
        cameraStatusDot.style.boxShadow = '0 0 8px rgba(16, 185, 129, 0.5)';
      }
      if (hudFaceStatus) hudFaceStatus.textContent = 'TRACKING ACTIVE';
      if (toggleCameraBtn) toggleCameraBtn.textContent = '🛑';
    } else {
      if (cameraFallback) cameraFallback.style.display = 'flex';
      if (cameraStatusDot) {
        cameraStatusDot.style.backgroundColor = '#ef4444'; // Red status dot
        cameraStatusDot.style.boxShadow = 'none';
      }
      if (hudFaceStatus) hudFaceStatus.textContent = 'STREAM OFFLINE';
      if (toggleCameraBtn) toggleCameraBtn.textContent = '📷';
    }
  };

  // Event Listeners for Camera Controls
  if (toggleCameraBtn) {
    toggleCameraBtn.addEventListener('click', () => {
      if (isCameraActive) {
        stopCamera();
      } else {
        startCamera();
      }
    });
  }

  if (retryCameraBtn) {
    retryCameraBtn.addEventListener('click', startCamera);
  }

  // Automatically request camera when session starts from Setup Modal
  const startSessionSubmitBtn = document.getElementById('startSessionSubmitBtn');
  if (startSessionSubmitBtn) {
    startSessionSubmitBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const setupModal = document.getElementById('setupModal');
      const interviewScreen = document.getElementById('interviewScreen');
      if (setupModal) setupModal.setAttribute('hidden', 'true');
      if (interviewScreen) interviewScreen.removeAttribute('hidden');
      document.body.style.overflow = 'hidden';

      // Request camera with safety
      startCamera();
    });
  }

  // Stop camera when user clicks 'End Session'
  const endInterviewBtn = document.getElementById('endInterviewBtn');
  if (endInterviewBtn) {
    endInterviewBtn.addEventListener('click', () => {
      stopCamera();
    });
  }

  // Expose camera functions globally
  window.startCamera = startCamera;
  window.stopCamera = stopCamera;
});
