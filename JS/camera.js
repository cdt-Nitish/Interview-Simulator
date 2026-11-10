// JS/camera.js - Production Real-Time MediaPipe FaceMesh & Computer Vision Telemetry Engine

(function () {
  'use strict';

  // --- Session-Level Telemetry State ---
  let sessionMetrics = {
    totalFrames: 0,
    validSamples: 0, // Frames with face detected
    eyeContactFrames: 0,
    facePresenceFrames: 0,
    stabilityScores: [],
    orientationOffsets: [],
    fidgetEvents: 0,
    gazeAvoidanceEvents: 0,
    eyebrowFurrowEvents: 0,
    lipTighteningEvents: 0,
    blinkCount: 0,
    isBlinking: false,
    startTime: null,
    trackingStatus: 'unavailable' // 'active' | 'inactive' | 'unavailable'
  };

  // --- Tracking & Video State ---
  let currentStream = null;
  let isCameraActive = false;
  let faceMesh = null;
  let isFaceMeshReady = false;
  let isInitializing = false;
  let animFrameId = null;
  let isProcessingFrame = false;

  // Smoothing and previous frame telemetry
  let prevNose = null;
  let prevTimestamp = null;
  const RECENT_WINDOW = 30; // Frames for rolling calculations
  const recentDisplacements = [];

  // DOM Elements (Cached on initialization)
  let videoElement = null;
  let cameraStatusDot = null;
  let hudOverlay = null;
  let hudBoundingBox = null;
  let hudLeftEye = null;
  let hudRightEye = null;
  let hudFaceStatus = null;
  let hudOrientationStatus = null;
  let metricEyeVal = null;
  let metricEyeBar = null;
  let metricFaceVal = null;
  let metricFaceBar = null;
  let metricStabilityVal = null;
  let metricStabilityBar = null;
  let cameraFallback = null;
  let cameraFallbackMessage = null;
  let toggleCameraBtn = null;
  let retryCameraBtn = null;

  /**
   * Reset session metrics for a new interview round
   */
  function resetSessionMetrics() {
    sessionMetrics = {
      totalFrames: 0,
      validSamples: 0,
      eyeContactFrames: 0,
      facePresenceFrames: 0,
      stabilityScores: [],
      orientationOffsets: [],
      fidgetEvents: 0,
      gazeAvoidanceEvents: 0,
      eyebrowFurrowEvents: 0,
      lipTighteningEvents: 0,
      blinkCount: 0,
      isBlinking: false,
      startTime: Date.now(),
      trackingStatus: isCameraActive ? 'active' : 'unavailable'
    };
    recentDisplacements.length = 0;
    prevNose = null;
    prevTimestamp = null;
  }

  /**
   * Calculate aggregated session-level metrics
   */
  function getSessionMetrics() {
    const total = sessionMetrics.totalFrames;
    const valid = sessionMetrics.validSamples;

    if (!isCameraActive && valid === 0) {
      return {
        eyeContact: null,
        facePresence: null,
        headStability: null,
        headOrientation: null,
        eyeMovement: null,
        trackingCoverage: 0,
        validSamples: 0,
        totalFrames: total,
        trackingStatus: 'unavailable',
        dataReliability: 'Unavailable',
        detectedBehaviors: {
          fidgetCount: 0,
          gazeAvoidanceCount: 0,
          eyebrowFurrowCount: 0,
          lipTighteningCount: 0,
          blinksCount: 0
        }
      };
    }

    const facePresencePct = total > 0 ? Math.round((sessionMetrics.facePresenceFrames / total) * 100) : 0;
    const eyeContactPct = valid > 0 ? Math.round((sessionMetrics.eyeContactFrames / valid) * 100) : 0;

    let avgStability = 85;
    if (sessionMetrics.stabilityScores.length > 0) {
      const sum = sessionMetrics.stabilityScores.reduce((a, b) => a + b, 0);
      avgStability = Math.round(sum / sessionMetrics.stabilityScores.length);
    }

    let avgOrientationAlignment = 85;
    if (sessionMetrics.orientationOffsets.length > 0) {
      const sum = sessionMetrics.orientationOffsets.reduce((a, b) => a + b, 0);
      avgOrientationAlignment = Math.round(sum / sessionMetrics.orientationOffsets.length);
    }

    const coveragePct = total > 0 ? Math.min(100, Math.round((valid / total) * 100)) : 0;

    let reliability = 'High';
    if (valid < 20) reliability = 'Low / Inconclusive';
    else if (valid < 60) reliability = 'Moderate';

    return {
      eyeContact: eyeContactPct,
      facePresence: facePresencePct,
      headStability: avgStability,
      headOrientation: avgOrientationAlignment,
      eyeMovement: Math.round(Math.min(100, Math.max(30, eyeContactPct * 0.9 + 10))),
      trackingCoverage: coveragePct,
      validSamples: valid,
      totalFrames: total,
      trackingStatus: valid > 10 ? 'active' : 'low_samples',
      dataReliability: reliability,
      detectedBehaviors: {
        fidgetCount: sessionMetrics.fidgetEvents,
        gazeAvoidanceCount: sessionMetrics.gazeAvoidanceEvents,
        eyebrowFurrowCount: sessionMetrics.eyebrowFurrowEvents,
        lipTighteningCount: sessionMetrics.lipTighteningEvents,
        blinksCount: sessionMetrics.blinkCount
      }
    };
  }

  /**
   * Initialize MediaPipe FaceMesh
   */
  async function initMediaPipe() {
    if (faceMesh) return true;
    if (isInitializing) return false;
    isInitializing = true;

    try {
      if (typeof window.FaceMesh === 'undefined') {
        console.warn('⚠️ MediaPipe FaceMesh script not yet loaded from CDN. Will retry when ready.');
        isInitializing = false;
        return false;
      }

      console.log('🔄 Initializing MediaPipe FaceMesh engine...');
      faceMesh = new window.FaceMesh({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
      });

      faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true, // Enables iris landmarks (468-477)
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      faceMesh.onResults(onFaceMeshResults);
      isFaceMeshReady = true;
      isInitializing = false;
      console.log('✅ MediaPipe FaceMesh initialized with iris tracking.');
      return true;
    } catch (err) {
      console.error('❌ Failed to initialize MediaPipe FaceMesh:', err);
      isFaceMeshReady = false;
      isInitializing = false;
      return false;
    }
  }

  /**
   * MediaPipe Results Callback - Processes Real Live Landmark Data
   */
  function onFaceMeshResults(results) {
    if (!isCameraActive) return;

    sessionMetrics.totalFrames++;

    const hasFace = Boolean(results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0);

    if (!hasFace) {
      // Face Not Detected in current frame
      if (hudFaceStatus) hudFaceStatus.textContent = 'FACE NOT DETECTED';
      if (hudOrientationStatus) hudOrientationStatus.textContent = 'NO TARGET';
      if (hudBoundingBox) hudBoundingBox.style.display = 'none';
      if (hudLeftEye) hudLeftEye.style.display = 'none';
      if (hudRightEye) hudRightEye.style.display = 'none';

      // Update current presence percentage in UI
      updateUIIndicators(false, 0, 0, 0);
      return;
    }

    // --- Face Is Detected ---
    sessionMetrics.validSamples++;
    sessionMetrics.facePresenceFrames++;

    const landmarks = results.multiFaceLandmarks[0];

    // 1. Update HUD Bounding Box and Eye Markers
    updateHUDOverlay(landmarks);

    // 2. Real-Time Eye Contact Estimation
    const isEyeContact = calculateEyeContact(landmarks);
    if (isEyeContact) {
      sessionMetrics.eyeContactFrames++;
    } else {
      sessionMetrics.gazeAvoidanceEvents++;
    }

    // 3. Real-Time Head Position & Orientation
    const { yawOffset, pitchOffset, orientationLabel, alignmentScore } = calculateHeadOrientation(landmarks);
    sessionMetrics.orientationOffsets.push(alignmentScore);

    // 4. Real-Time Head Stability & Movement
    const stabilityScore = calculateHeadStability(landmarks);
    sessionMetrics.stabilityScores.push(stabilityScore);

    // 5. Facial Behavior Indicators (Blinks, Eyebrows, Lips)
    checkFacialBehaviors(landmarks);

    // 6. Update UI
    if (hudFaceStatus) hudFaceStatus.textContent = 'TRACKING ACTIVE';
    if (hudOrientationStatus) {
      const sign = yawOffset >= 0 ? '+' : '';
      hudOrientationStatus.textContent = `${orientationLabel} (${sign}${yawOffset.toFixed(2)})`;
    }

    updateUIIndicators(true, isEyeContact ? 1 : 0, stabilityScore, alignmentScore);
  }

  /**
   * Update visual targeting box & eye markers in HUD overlay
   */
  function updateHUDOverlay(landmarks) {
    if (!hudOverlay) return;

    // Calculate face bounding box bounds
    let minX = 1.0, maxX = 0.0, minY = 1.0, maxY = 0.0;
    for (let i = 0; i < landmarks.length; i += 8) {
      const p = landmarks[i];
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    if (hudBoundingBox) {
      hudBoundingBox.style.display = 'block';
      // Adjust for video mirroring if mirrored in CSS
      hudBoundingBox.style.left = `${(minX * 100).toFixed(1)}%`;
      hudBoundingBox.style.top = `${(minY * 100).toFixed(1)}%`;
      hudBoundingBox.style.width = `${((maxX - minX) * 100).toFixed(1)}%`;
      hudBoundingBox.style.height = `${((maxY - minY) * 100).toFixed(1)}%`;
    }

    // Left Iris: 468, Right Iris: 473
    if (hudLeftEye && landmarks[468]) {
      hudLeftEye.style.display = 'block';
      hudLeftEye.style.left = `${(landmarks[468].x * 100).toFixed(1)}%`;
      hudLeftEye.style.top = `${(landmarks[468].y * 100).toFixed(1)}%`;
    }

    if (hudRightEye && landmarks[473]) {
      hudRightEye.style.display = 'block';
      hudRightEye.style.left = `${(landmarks[473].x * 100).toFixed(1)}%`;
      hudRightEye.style.top = `${(landmarks[473].y * 100).toFixed(1)}%`;
    }
  }

  /**
   * Calculate Eye Contact from Iris landmarks relative to eye corners
   */
  function calculateEyeContact(landmarks) {
    // Left eye: 33 (outer), 133 (inner), 468 (iris center)
    // Right eye: 362 (inner), 263 (outer), 473 (iris center)
    if (!landmarks[468] || !landmarks[473]) {
      // Fallback if iris landmarks not enabled
      return true;
    }

    const leftOuter = landmarks[33];
    const leftInner = landmarks[133];
    const leftIris = landmarks[468];

    const rightInner = landmarks[362];
    const rightOuter = landmarks[263];
    const rightIris = landmarks[473];

    const leftEyeWidth = Math.abs(leftInner.x - leftOuter.x);
    const rightEyeWidth = Math.abs(rightOuter.x - rightInner.x);

    if (leftEyeWidth < 0.001 || rightEyeWidth < 0.001) return true;

    // Relative iris horizontal position (0.0 = outer corner, 1.0 = inner corner)
    const leftRatio = (leftIris.x - Math.min(leftOuter.x, leftInner.x)) / leftEyeWidth;
    const rightRatio = (rightIris.x - Math.min(rightInner.x, rightOuter.x)) / rightEyeWidth;

    // Centered camera gaze typically sits between 0.38 and 0.62
    const leftCentered = leftRatio >= 0.35 && leftRatio <= 0.65;
    const rightCentered = rightRatio >= 0.35 && rightRatio <= 0.65;

    return leftCentered || rightCentered;
  }

  /**
   * Calculate 3D Head Orientation (Yaw & Pitch)
   */
  function calculateHeadOrientation(landmarks) {
    // Key landmark anchors:
    // Nose tip: 1, Left cheek: 234, Right cheek: 454, Forehead: 10, Chin: 152
    const nose = landmarks[1];
    const leftCheek = landmarks[234];
    const rightCheek = landmarks[454];
    const forehead = landmarks[10];
    const chin = landmarks[152];

    const distToLeft = Math.hypot(nose.x - leftCheek.x, nose.y - leftCheek.y);
    const distToRight = Math.hypot(nose.x - rightCheek.x, nose.y - rightCheek.y);
    const totalCheekDist = distToLeft + distToRight;

    // Yaw offset: near 0.0 when centered
    const yawOffset = totalCheekDist > 0 ? (distToRight - distToLeft) / totalCheekDist : 0;

    const distToTop = Math.hypot(nose.x - forehead.x, nose.y - forehead.y);
    const distToBottom = Math.hypot(nose.x - chin.x, nose.y - chin.y);
    const totalVertical = distToTop + distToBottom;

    // Pitch offset
    const pitchOffset = totalVertical > 0 ? (distToBottom - distToTop) / totalVertical : 0;

    let orientationLabel = 'CENTERED';
    if (yawOffset < -0.22) orientationLabel = 'TURNED LEFT';
    else if (yawOffset > 0.22) orientationLabel = 'TURNED RIGHT';
    else if (pitchOffset < -0.15) orientationLabel = 'TILTED UP';
    else if (pitchOffset > 0.35) orientationLabel = 'LOOKING DOWN';

    const alignmentScore = Math.max(0, Math.min(100, Math.round(100 - (Math.abs(yawOffset) * 160) - (Math.abs(pitchOffset - 0.1) * 80))));

    return { yawOffset, pitchOffset, orientationLabel, alignmentScore };
  }

  /**
   * Calculate Head Stability & Movement displacement
   */
  function calculateHeadStability(landmarks) {
    const nose = landmarks[1];
    if (!prevNose) {
      prevNose = { x: nose.x, y: nose.y, z: nose.z || 0 };
      return 90;
    }

    const displacement = Math.sqrt(
      Math.pow(nose.x - prevNose.x, 2) +
      Math.pow(nose.y - prevNose.y, 2) +
      Math.pow((nose.z || 0) - prevNose.z, 2)
    );

    prevNose = { x: nose.x, y: nose.y, z: nose.z || 0 };

    recentDisplacements.push(displacement);
    if (recentDisplacements.length > RECENT_WINDOW) {
      recentDisplacements.shift();
    }

    const avgDisp = recentDisplacements.reduce((a, b) => a + b, 0) / recentDisplacements.length;

    // If candidate is shifting rapidly, register fidget event
    if (displacement > 0.035) {
      sessionMetrics.fidgetEvents++;
    }

    // Convert average displacement to a 0-100 stability score
    return Math.max(25, Math.min(100, Math.round(100 - (avgDisp * 1500))));
  }

  /**
   * Check observable facial behavior indicators (Blinks, Brows, Lips)
   */
  function checkFacialBehaviors(landmarks) {
    // 1. Blink via Eye Aspect Ratio (EAR) - Left eye: 159 (upper), 145 (lower), 33 (outer), 133 (inner)
    const vDist = Math.hypot(landmarks[159].x - landmarks[145].x, landmarks[159].y - landmarks[145].y);
    const hDist = Math.hypot(landmarks[33].x - landmarks[133].x, landmarks[33].y - landmarks[133].y);
    const ear = hDist > 0 ? vDist / (2.0 * hDist) : 0.25;

    if (ear < 0.16) {
      if (!sessionMetrics.isBlinking) {
        sessionMetrics.isBlinking = true;
        sessionMetrics.blinkCount++;
      }
    } else {
      sessionMetrics.isBlinking = false;
    }

    // 2. Eyebrow Furrowing: distance between inner brows (107, 336) relative to eye width
    const browDist = Math.hypot(landmarks[107].x - landmarks[336].x, landmarks[107].y - landmarks[336].y);
    if (browDist < 0.12) {
      sessionMetrics.eyebrowFurrowEvents++;
    }

    // 3. Lip Tightening: vertical distance between inner lips (13, 14)
    const lipDist = Math.hypot(landmarks[13].x - landmarks[14].x, landmarks[13].y - landmarks[14].y);
    if (lipDist < 0.008) {
      sessionMetrics.lipTighteningEvents++;
    }
  }

  /**
   * Update Vision HUD Metric Bars with Running Real Averages
   */
  function updateUIIndicators(isFacePresent, currentEye, currentStability, currentAlign) {
    const total = sessionMetrics.totalFrames;
    const valid = sessionMetrics.validSamples;

    // Running face presence percentage
    const facePct = total > 0 ? Math.round((sessionMetrics.facePresenceFrames / total) * 100) : 0;
    if (metricFaceVal) metricFaceVal.textContent = isFacePresent ? `${facePct}%` : 'Face Not Detected';
    if (metricFaceBar) metricFaceBar.style.width = `${facePct}%`;

    // Running eye contact percentage
    if (valid > 0) {
      const eyePct = Math.round((sessionMetrics.eyeContactFrames / valid) * 100);
      if (metricEyeVal) metricEyeVal.textContent = `${eyePct}%`;
      if (metricEyeBar) metricEyeBar.style.width = `${eyePct}%`;
    } else {
      if (metricEyeVal) metricEyeVal.textContent = '--';
      if (metricEyeBar) metricEyeBar.style.width = '0%';
    }

    // Head stability
    if (metricStabilityVal) {
      metricStabilityVal.textContent = `${currentStability}%`;
    }
    if (metricStabilityBar) {
      metricStabilityBar.style.width = `${currentStability}%`;
    }
  }

  /**
   * Continuous Processing Loop using requestAnimationFrame
   */
  async function runTrackingLoop() {
    if (!isCameraActive || !videoElement) return;

    if (faceMesh && videoElement.readyState >= 2 && !isProcessingFrame) {
      isProcessingFrame = true;
      try {
        await faceMesh.send({ image: videoElement });
      } catch (err) {
        console.warn('Frame processing dropped:', err.message);
      } finally {
        isProcessingFrame = false;
      }
    }

    animFrameId = requestAnimationFrame(runTrackingLoop);
  }

  /**
   * Request and start webcam stream
   */
  async function startCamera() {
    if (isCameraActive && currentStream) return;

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('MediaDevices API is not supported in this browser environment.');
      }

      // Initialize MediaPipe if not ready
      if (!faceMesh) {
        await initMediaPipe();
      }

      console.log('📷 Requesting camera stream...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: false
      });

      currentStream = stream;
      if (videoElement) {
        videoElement.srcObject = stream;
        await videoElement.play().catch(() => {});
      }

      isCameraActive = true;
      sessionMetrics.trackingStatus = 'active';
      resetSessionMetrics();
      updateCameraStatusUI(true);

      // Start continuous requestAnimationFrame frame processing loop
      if (animFrameId) cancelAnimationFrame(animFrameId);
      animFrameId = requestAnimationFrame(runTrackingLoop);

      console.log('✅ Webcam active & MediaPipe tracking loop started.');
    } catch (error) {
      console.error('Camera access error:', error);
      isCameraActive = false;
      sessionMetrics.trackingStatus = 'unavailable';
      updateCameraStatusUI(false);

      let msg = `Camera error: ${error.message}`;
      if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        msg = 'Webcam is currently in use by another application. Please close it and retry.';
        alert(msg);
      } else if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        msg = 'Camera access was denied. Please allow permissions in your address bar.';
      } else if (error.name === 'NotFoundError') {
        msg = 'No camera device was detected on your system.';
      }

      if (cameraFallbackMessage) {
        cameraFallbackMessage.textContent = msg;
      }
    }
  }

  /**
   * Stop camera stream and release hardware
   */
  function stopCamera() {
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }

    if (currentStream) {
      currentStream.getTracks().forEach((track) => {
        try { track.stop(); } catch (e) {}
      });
      currentStream = null;
    }

    if (videoElement) {
      videoElement.srcObject = null;
    }

    isCameraActive = false;
    isProcessingFrame = false;
    updateCameraStatusUI(false);
    console.log('🛑 Camera stream stopped and released.');
  }

  /**
   * Update visual indicators when camera toggles
   */
  function updateCameraStatusUI(active) {
    if (active) {
      if (cameraFallback) cameraFallback.style.display = 'none';
      if (cameraStatusDot) {
        cameraStatusDot.style.backgroundColor = '#10b981';
        cameraStatusDot.style.boxShadow = '0 0 8px rgba(16, 185, 129, 0.5)';
      }
      if (hudFaceStatus) hudFaceStatus.textContent = 'INITIALIZING TRACKING...';
      if (hudOrientationStatus) hudOrientationStatus.textContent = 'DETECTING...';
      if (toggleCameraBtn) toggleCameraBtn.textContent = '🛑';
    } else {
      if (cameraFallback) cameraFallback.style.display = 'flex';
      if (cameraStatusDot) {
        cameraStatusDot.style.backgroundColor = '#ef4444';
        cameraStatusDot.style.boxShadow = 'none';
      }
      if (hudFaceStatus) hudFaceStatus.textContent = 'STREAM OFFLINE';
      if (hudOrientationStatus) hudOrientationStatus.textContent = 'CAMERA INACTIVE';
      if (hudBoundingBox) hudBoundingBox.style.display = 'none';
      if (hudLeftEye) hudLeftEye.style.display = 'none';
      if (hudRightEye) hudRightEye.style.display = 'none';
      if (metricEyeVal) metricEyeVal.textContent = 'Data Unavailable';
      if (metricFaceVal) metricFaceVal.textContent = 'Data Unavailable';
      if (metricEyeBar) metricEyeBar.style.width = '0%';
      if (metricFaceBar) metricFaceBar.style.width = '0%';
      if (metricStabilityVal) metricStabilityVal.textContent = '--';
      if (metricStabilityBar) metricStabilityBar.style.width = '0%';
      if (toggleCameraBtn) toggleCameraBtn.textContent = '📷';
    }
  }

  // --- Initialize on DOMContentLoaded ---
  document.addEventListener('DOMContentLoaded', () => {
    videoElement = document.getElementById('camera');
    cameraStatusDot = document.getElementById('cameraStatusDot');
    hudOverlay = document.getElementById('hudOverlay');
    hudBoundingBox = document.getElementById('hudBoundingBox');
    hudLeftEye = document.getElementById('hudLeftEye');
    hudRightEye = document.getElementById('hudRightEye');
    hudFaceStatus = document.getElementById('hudFaceStatus');
    hudOrientationStatus = document.getElementById('hudOrientationStatus');
    metricEyeVal = document.getElementById('metricEyeVal');
    metricEyeBar = document.getElementById('metricEyeBar');
    metricFaceVal = document.getElementById('metricFaceVal');
    metricFaceBar = document.getElementById('metricFaceBar');
    metricStabilityVal = document.getElementById('metricStabilityVal');
    metricStabilityBar = document.getElementById('metricStabilityBar');
    cameraFallback = document.getElementById('cameraFallback');
    cameraFallbackMessage = document.getElementById('cameraFallbackMessage');
    toggleCameraBtn = document.getElementById('toggleCameraBtn');
    retryCameraBtn = document.getElementById('retryCameraBtn');

    // Initialize UI to offline state rather than fake 92%/98%
    updateCameraStatusUI(false);

    // Pre-initialize MediaPipe in the background
    initMediaPipe();

    // Event listeners
    if (toggleCameraBtn) {
      toggleCameraBtn.addEventListener('click', () => {
        if (isCameraActive) stopCamera();
        else startCamera();
      });
    }

    if (retryCameraBtn) {
      retryCameraBtn.addEventListener('click', startCamera);
    }

    // Auto-start camera when launching session from setup modal
    const startSessionSubmitBtn = document.getElementById('startSessionSubmitBtn');
    if (startSessionSubmitBtn) {
      startSessionSubmitBtn.addEventListener('click', () => {
        startCamera();
      });
    }

    const endInterviewBtn = document.getElementById('endInterviewBtn');
    if (endInterviewBtn) {
      endInterviewBtn.addEventListener('click', () => {
        stopCamera();
      });
    }
  });

  // Expose global controller
  window.mediaPipeTracker = {
    startCamera,
    stopCamera,
    resetSessionMetrics,
    getSessionMetrics,
    isCameraActive: () => isCameraActive
  };

  // Expose legacy global helper names
  window.startCamera = startCamera;
  window.stopCamera = stopCamera;
  window.getMediaPipeSessionMetrics = getSessionMetrics;

})();
