window.addEventListener('DOMContentLoaded', () => {
  // DOM elements
  const fileInput = document.getElementById('audioFileInput');
  const uploadButton = document.getElementById('uploadButton');
  const canvas = document.getElementById('waveformCanvas');
  const errorMessage = document.getElementById('errorMessage');
  const controlsDiv = document.getElementById('controls');
  const playButton = document.getElementById('playButton');
  const loopButton = document.getElementById('loopButton');
  const crossfadeInput = document.getElementById('crossfadeInput');

  // Check if all elements exist
  if (!fileInput || !uploadButton || !canvas || !errorMessage || !controlsDiv || !playButton || !loopButton || !crossfadeInput) {
    console.error('One or more DOM elements are missing.');
    if (errorMessage) {
      errorMessage.textContent = 'Initialization error: UI elements not found.';
    }
    return;
  }

  const ctx = canvas.getContext('2d');
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  let audioBuffer = null;
  let sourceNode = null;
  let isPlaying = false;
  let isLooping = false;
  let crossfadeDuration = 0;

  // Resize canvas to fit container
  function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = 200; // Fixed height for waveform
    if (audioBuffer) {
      drawWaveform();
    }
  }
  window.addEventListener('resize', resizeCanvas);

  // Draw waveform
  function drawWaveform() {
    if (!audioBuffer) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const data = audioBuffer.getChannelData(0);
    const step = Math.ceil(data.length / canvas.width);
    const amp = canvas.height / 2;

    ctx.beginPath();
    ctx.strokeStyle = '#007bff';
    ctx.lineWidth = 2;
    for (let i = 0; i < canvas.width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = data[(i * step) + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      ctx.lineTo(i, (1 + min) * amp);
    }
    ctx.stroke();
  }

  // Load and process audio file
  async function loadAudio(file) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      controlsDiv.style.display = 'block';
      resizeCanvas();
      drawWaveform();
      errorMessage.textContent = '';
    } catch (err) {
      console.error('Error loading audio:', err);
      errorMessage.textContent = 'Failed to load audio: ' + err.message;
    }
  }

  // Play audio
  function playAudio() {
    if (!audioBuffer) return;
    if (isPlaying) {
      sourceNode.stop();
      isPlaying = false;
      playButton.textContent = 'Play';
      return;
    }

    sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.connect(audioContext.destination);
    sourceNode.loop = isLooping;
    if (isLooping && crossfadeDuration > 0) {
      const gainNode = audioContext.createGain();
      sourceNode.connect(gainNode);
      gainNode.connect(audioContext.destination);
      gainNode.gain.setValueAtTime(1.0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.0, audioContext.currentTime + crossfadeDuration);
      sourceNode.loop = true;
    }
    sourceNode.start();
    isPlaying = true;
    playButton.textContent = 'Stop';
  }

  // Event listeners
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      uploadButton.disabled = false;
    }
  });

  uploadButton.addEventListener('click', () => {
    const file = fileInput.files[0];
    if (file) {
      loadAudio(file);
    }
  });

  playButton.addEventListener('click', playAudio);

  loopButton.addEventListener('click', () => {
    isLooping = !isLooping;
    loopButton.textContent = isLooping ? 'Disable Loop' : 'Enable Loop';
    if (sourceNode) {
      sourceNode.loop = isLooping;
    }
  });

  crossfadeInput.addEventListener('input', (e) => {
    crossfadeDuration = parseFloat(e.target.value);
  });

  // Initialize
  resizeCanvas();
  controlsDiv.style.display = 'none';
  uploadButton.disabled = true;
});
