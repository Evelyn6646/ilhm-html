<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#f2f4f3">
  <title>Mobile Screenshot Studio | TRUSTIFY</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="assets/mobile-screenshot-studio.css">
  <script defer src="assets/mobile-screenshot-studio.js"></script>
</head>
<body>
  <main class="studio">
    <header class="topbar">
      <a class="wordmark" href="index.php" aria-label="Kembali ke Trustify"><span class="mark">T</span><span>TRUSTIFY <small>/ DOCUMENTATION</small></span></a>
      <div class="studio-title"><span class="live-dot"></span> MOBILE SCREENSHOT STUDIO</div>
      <a class="back-link" href="index.php">Kembali ke Trustify <span aria-hidden="true">↗</span></a>
    </header>

    <section class="workspace" aria-label="Studio screenshot mobile">
      <aside class="control-panel">
        <div class="panel-intro"><span class="eyebrow">CAPTURE WORKSPACE</span><h1>Mobile Screenshot Studio</h1><p>Pratinjau halaman Trustify dalam frame perangkat, lalu simpan untuk dokumentasi.</p></div>

        <div class="control-group">
          <label class="control-label" for="page-url">Halaman yang ditampilkan</label>
          <form id="url-form" class="url-form">
            <input id="page-url" name="url" type="url" inputmode="url" autocomplete="url" spellcheck="false" required aria-describedby="url-note">
            <button class="icon-button load-button" type="submit" aria-label="Buka URL" title="Buka URL"><span aria-hidden="true">↵</span></button>
          </form>
          <p class="field-note" id="url-note">URL lengkap diperlukan. Halaman yang melarang iframe mungkin tidak dapat dimuat.</p>
          <div class="quick-pages" aria-label="Halaman Trustify">
            <button type="button" data-page="home">Beranda</button><button type="button" data-page="login">Login</button><button type="button" data-page="register">Register</button><button type="button" data-page="dashboard">Dashboard</button>
          </div>
        </div>

        <div class="control-group">
          <span class="control-label">Perangkat</span>
          <div class="segmented" role="group" aria-label="Pilih perangkat">
            <button type="button" data-device="iphone" aria-pressed="true"><span aria-hidden="true">▯</span> iPhone</button>
            <button type="button" data-device="android" aria-pressed="false"><span aria-hidden="true">▯</span> Android</button>
          </div>
          <div class="device-meta"><span id="device-name">iPhone 15 Pro</span><span id="device-resolution">390 × 844 px</span></div>
        </div>

        <div class="control-group compact-group">
          <span class="control-label">Orientasi</span>
          <div class="segmented two-way" role="group" aria-label="Orientasi layar">
            <button type="button" data-orientation="portrait" aria-pressed="true">Portrait</button>
            <button type="button" data-orientation="landscape" aria-pressed="false">Landscape</button>
          </div>
        </div>

        <div class="control-group compact-group">
          <span class="control-label">Zoom frame</span>
          <div class="zoom-controls" role="group" aria-label="Atur zoom frame">
            <button class="icon-button" type="button" data-zoom="out" aria-label="Zoom out" title="Zoom out">−</button>
            <output id="zoom-value" for="zoom-out zoom-in">100%</output>
            <button class="icon-button" type="button" data-zoom="in" aria-label="Zoom in" title="Zoom in">+</button>
            <button class="reset-zoom" type="button" data-zoom="reset">Reset</button>
          </div>
        </div>

        <div class="control-group background-group">
          <span class="control-label">Latar hasil</span>
          <div class="swatches" role="group" aria-label="Warna latar screenshot">
            <button type="button" data-background="white" aria-pressed="false"><span class="swatch swatch-white"></span>Putih</button>
            <button type="button" data-background="gray" aria-pressed="true"><span class="swatch swatch-gray"></span>Abu muda</button>
            <button type="button" data-background="transparent" aria-pressed="false"><span class="swatch swatch-transparent"></span>Transparan</button>
          </div>
        </div>

        <div class="action-row">
          <button id="refresh-button" class="icon-button refresh-button" type="button" aria-label="Refresh halaman" title="Refresh halaman">↻</button>
          <button id="fullscreen-button" class="icon-button refresh-button" type="button" aria-label="Fullscreen" title="Fullscreen">⛶</button>
          <button id="screenshot-button" class="capture-button" type="button"><span aria-hidden="true">▣</span> Screenshot PNG</button>
        </div>
        <p id="status-message" class="status-message" role="status" aria-live="polite">Siap menampilkan halaman Trustify.</p>
      </aside>

      <section class="preview-area" aria-label="Pratinjau smartphone">
        <div class="preview-heading"><div><span class="eyebrow">LIVE PREVIEW</span><h2 id="preview-device-title">iPhone 15 Pro</h2></div><span class="preview-size" id="preview-size">390 × 844</span></div>
        <div class="stage-viewport">
          <div class="device-scale" id="device-scale">
            <div class="phone-frame iphone" id="phone-frame" data-device="iphone">
              <span class="side-button side-left-one" aria-hidden="true"></span><span class="side-button side-left-two" aria-hidden="true"></span><span class="side-button side-right" aria-hidden="true"></span>
              <div class="phone-screen" id="phone-screen">
                <iframe id="site-preview" title="Pratinjau halaman Trustify" allow="clipboard-read; clipboard-write" loading="eager"></iframe>
                <div class="dynamic-island" aria-hidden="true"></div>
                <div class="punch-hole" aria-hidden="true"></div>
                <div class="android-nav" aria-hidden="true"><span></span></div>
              </div>
              <div class="home-indicator" aria-hidden="true"></div>
            </div>
          </div>
        </div>
        <footer class="preview-footer"><span><i class="status-led"></i> Halaman interaktif</span><span>Frame lengkap disertakan dalam PNG</span></footer>
      </section>
    </section>
    <div class="capture-help" id="capture-help" hidden>Di dialog browser, pilih tab ini dan aktifkan berbagi layar. Browser tidak mengizinkan pengambilan tab secara diam-diam.</div>
  </main>
</body>
</html>