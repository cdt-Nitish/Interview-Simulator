document.addEventListener('DOMContentLoaded', () => {
    // Camera DOM Elements
    const videoElement = document.getElementById('camera');
    const toggleCameraBtn = document.getElementById('toggleCameraBtn');
    const retryCameraBtn = document.getElementById('retryCameraBtn');
    const cameraFallback = document.getElementById('cameraFallback');
    const cameraStatusDot = document.getElementById('cameraStatusDot');
    const hudFaceStatus = document.getElementById('hudFaceStatus');

    let currentStream = null;
    let isCameraActive = false;

    // Function to request and start the camera stream
    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 1280, height: 720 },
                audio: false // Audio can be handled separately if needed
            });

            currentStream = stream;
            if (videoElement) {
                videoElement.srcObject = stream;
            }

            isCameraActive = true;
            updateCameraUI(true);

        } catch (error) {
            console.error('Error accessing the camera:', error);
            isCameraActive = false;
            updateCameraUI(false);
        }
    };

    // Function to stop the camera stream
    const stopCamera = () => {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
            currentStream = null;
        }
        if (videoElement) {
            videoElement.srcObject = null;
        }
        isCameraActive = false;
        updateCameraUI(false);
    };

    // Update UI based on camera state
    const updateCameraUI = (active) => {
        if (active) {
            if (cameraFallback) cameraFallback.style.display = 'none';
            if (cameraStatusDot) {
                cameraStatusDot.style.backgroundColor = '#10b981'; // Green dot
                cameraStatusDot.style.boxShadow = '0 0 8px rgba(16, 185, 129, 0.5)';
            }
            if (hudFaceStatus) hudFaceStatus.textContent = 'TRACKING ACTIVE';
            if (toggleCameraBtn) toggleCameraBtn.textContent = '🛑'; // Stop icon
        } else {
            if (cameraFallback) cameraFallback.style.display = 'flex';
            if (cameraStatusDot) {
                cameraStatusDot.style.backgroundColor = '#ef4444'; // Red dot
                cameraStatusDot.style.boxShadow = 'none';
            }
            if (hudFaceStatus) hudFaceStatus.textContent = 'STREAM OFFLINE';
            if (toggleCameraBtn) toggleCameraBtn.textContent = '📷'; // Start icon
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

    // Listen for the interview session starting to automatically trigger the camera
    const startSessionSubmitBtn = document.getElementById('startSessionSubmitBtn');
    if (startSessionSubmitBtn) {
        startSessionSubmitBtn.addEventListener('click', (e) => {
            e.preventDefault();
            // Switch UI to interview screen
            document.getElementById('setupModal').setAttribute('hidden', 'true');
            document.getElementById('interviewScreen').removeAttribute('hidden');
            document.body.style.overflow = 'hidden';

            // Automatically request camera when session starts
            startCamera();
        });
    }

    // Stop camera when session ends
    const endInterviewBtn = document.getElementById('endInterviewBtn');
    if (endInterviewBtn) {
        endInterviewBtn.addEventListener('click', () => {
            stopCamera();
            document.getElementById('interviewScreen').setAttribute('hidden', 'true');
            document.getElementById('resultModal').removeAttribute('hidden');
        });
    }
});