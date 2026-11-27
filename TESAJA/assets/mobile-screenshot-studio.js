(() => {
  const devices = {
    iphone: { name: 'iPhone 15 Pro', width: 390, height: 844 },
    android: { name: 'Android Pixel 8', width: 393, height: 873 },
  };
  const frame = document.querySelector('#phone-frame');
  const screen = document.querySelector('#phone-screen');
  const iframe = document.querySelector('#site-preview');
  const deviceScale = document.querySelector('#device-scale');
  const urlInput = document.querySelector('#page-url');
  const status = document.querySelector('#status-message');
  const captureButton = document.querySelector('#screenshot-button');
  const captureHelp = document.querySelector('#capture-help');
  const state = { device: 'iphone', orientation: 'portrait', zoom: 1, background: 'gray' };
  let fitZoom = 1;

  function localUrl(route = 'home') {
    return new URL(`index.php#${route}`, location.href).href;
  }
  function setStatus(message, error = false) {
    status.textContent = message;
    status.classList.toggle('is-error', error);
  }
  function validUrl(value) {
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  }
  function applyDevice() {
    const device = devices[state.device];
    const width = state.orientation === 'portrait' ? device.width : device.height;
    const height = state.orientation === 'portrait' ? device.height : device.width;
    frame.dataset.device = state.device;
    frame.classList.toggle('iphone', state.device === 'iphone');
    frame.classList.toggle('android', state.device === 'android');
    frame.style.setProperty('--screen-width', `${width}px`);
    frame.style.setProperty('--screen-height', `${height}px`);
    iframe.style.width = `${width}px`;
    iframe.style.height = `${height}px`;
    document.querySelector('#device-name').textContent = device.name;
    document.querySelector('#device-resolution').textContent = `${width} × ${height} px`;
    document.querySelector('#preview-device-title').textContent = device.name;
    document.querySelector('#preview-size').textContent = `${width} × ${height}`;
    document.querySelectorAll('[data-device]').forEach((button) => {
      if (button.matches('button')) button.setAttribute('aria-pressed', String(button.dataset.device === state.device));
    });
    applyZoom();
  }
  function applyZoom() {
    const stage = document.querySelector('.stage-viewport');
    fitZoom = Math.min(1, (stage.clientWidth - 28) / frame.offsetWidth, (stage.clientHeight - 28) / frame.offsetHeight);
    fitZoom = Math.max(.35, fitZoom);
    deviceScale.style.setProperty('--zoom', String(state.zoom * fitZoom));
    document.querySelector('#zoom-value').textContent = `${Math.round(state.zoom * 100)}%`;
  }
  function loadUrl(value) {
    const safeUrl = validUrl(value);
    if (!safeUrl) {
      setStatus('Masukkan URL halaman dengan protokol http:// atau https://.', true);
      return;
    }
    urlInput.value = safeUrl;
    iframe.src = safeUrl;
    setStatus('Memuat halaman di dalam perangkat...');
  }
  document.querySelector('#url-form').addEventListener('submit', (event) => {
    event.preventDefault();
    loadUrl(urlInput.value.trim());
  });
  document.querySelectorAll('.quick-pages button').forEach((button) => {
    button.addEventListener('click', () => loadUrl(localUrl(button.dataset.page)));
  });
  document.querySelectorAll('.segmented [data-device]').forEach((button) => {
    button.addEventListener('click', () => {
      state.device = button.dataset.device;
      applyDevice();
    });
  });
  document.querySelectorAll('.segmented [data-orientation]').forEach((button) => {
    button.addEventListener('click', () => {
      state.orientation = button.dataset.orientation;
      document.querySelectorAll('[data-orientation]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
      applyDevice();
    });
  });
  document.querySelectorAll('[data-zoom]').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.zoom === 'reset') state.zoom = 1;
      else state.zoom = Math.max(.65, Math.min(1.3, state.zoom + (button.dataset.zoom === 'in' ? .1 : -.1)));
      applyZoom();
    });
  });
  document.querySelectorAll('[data-background]').forEach((button) => {
    button.addEventListener('click', () => {
      state.background = button.dataset.background;
      document.querySelectorAll('[data-background]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
      document.querySelector('.preview-area').classList.toggle('transparent-preview', state.background === 'transparent');
    });
  });
  iframe.addEventListener('load', () => setStatus('Halaman siap. Konten tetap interaktif di dalam frame.'));
  iframe.addEventListener('error', () => setStatus('Halaman tidak dapat dimuat di dalam frame ini.', true));
  document.querySelector('#refresh-button').addEventListener('click', () => {
    try { iframe.contentWindow.location.reload(); } catch { iframe.src = urlInput.value; }
    setStatus('Memuat ulang halaman...');
  });
  document.querySelector('#fullscreen-button').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.querySelector('.preview-area').requestFullscreen();
    } catch {
      setStatus('Fullscreen tidak tersedia di browser ini.', true);
    }
  });

  function nextVideoFrame(video) {
    return new Promise((resolve) => {
      if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(() => resolve());
      else requestAnimationFrame(() => resolve());
    });
  }
  function clipRoundedRect(context, x, y, width, height, radius) {
    const corner = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + corner, y);
    context.arcTo(x + width, y, x + width, y + height, corner);
    context.arcTo(x + width, y + height, x, y + height, corner);
    context.arcTo(x, y + height, x, y, corner);
    context.arcTo(x, y, x + width, y, corner);
    context.closePath();
    context.clip();
  }
  async function capturePng() {
    const capture = navigator.mediaDevices?.getDisplayMedia;
    if (!capture) {
      setStatus('Browser ini belum mendukung capture tab. Gunakan Chrome atau Edge versi terbaru.', true);
      return;
    }
    captureHelp.hidden = false;
    captureButton.disabled = true;
    setStatus('Pilih tab studio ini pada dialog berbagi layar untuk membuat PNG.');
    let stream;
    let fitScale = 1;
    try {
      const currentBounds = frame.getBoundingClientRect();
      fitScale = Math.min(1, (window.innerWidth - 48) / currentBounds.width, (window.innerHeight - 48) / currentBounds.height);
      document.body.style.setProperty('--capture-fit', String(state.zoom * fitZoom * fitScale));
      document.body.classList.add('capture-fit');
      frame.scrollIntoView({ block: 'center', inline: 'center' });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser', cursor: 'never' },
        audio: false,
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
      });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      await nextVideoFrame(video);

      const bounds = frame.getBoundingClientRect();
      const scaleX = video.videoWidth / window.innerWidth;
      const scaleY = video.videoHeight / window.innerHeight;
      const sourceX = Math.max(0, Math.round(bounds.left * scaleX));
      const sourceY = Math.max(0, Math.round(bounds.top * scaleY));
      const sourceWidth = Math.min(video.videoWidth - sourceX, Math.round(bounds.width * scaleX));
      const sourceHeight = Math.min(video.videoHeight - sourceY, Math.round(bounds.height * scaleY));
      if (sourceWidth <= 0 || sourceHeight <= 0) throw new Error('Frame perangkat berada di luar area yang dapat ditangkap.');

      const canvas = document.createElement('canvas');
      const padding = Math.round(28 * Math.min(scaleX, scaleY));
      canvas.width = sourceWidth + padding * 2;
      canvas.height = sourceHeight + padding * 2;
      const context = canvas.getContext('2d', { alpha: true });
      if (!context) throw new Error('Canvas tidak dapat dibuat oleh browser.');
      if (state.background !== 'transparent') {
        context.fillStyle = state.background === 'white' ? '#ffffff' : '#eef0ef';
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      const cornerRadius = Math.round((state.device === 'iphone' ? 50 : 37) * Math.min(scaleX, scaleY));
      clipRoundedRect(context, padding, padding, sourceWidth, sourceHeight, cornerRadius);
      context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, padding, padding, sourceWidth, sourceHeight);
      const blob = await new Promise((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('PNG gagal dibuat.')), 'image/png'));
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `trustify-${state.device}-${state.orientation}-${new Date().toISOString().slice(0, 10)}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      setStatus(`PNG dibuat dan unduhan dimulai (${canvas.width} × ${canvas.height} px).`);
    } catch (error) {
      if (error.name === 'NotAllowedError') setStatus('Izin capture dibatalkan. Klik Screenshot PNG dan pilih tab studio.', true);
      else setStatus(error.message || 'Screenshot tidak dapat dibuat.', true);
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      document.body.classList.remove('capture-fit');
      document.body.style.removeProperty('--capture-fit');
      captureButton.disabled = false;
      captureHelp.hidden = true;
    }
  }
  captureButton.addEventListener('click', capturePng);
  window.addEventListener('resize', applyZoom);

  urlInput.value = localUrl();
  iframe.src = urlInput.value;
  applyDevice();
  applyZoom();
})();