(() => {
  const root = document.querySelector('#app');
  const toastRegion = document.querySelector('#toast-region');
  const state = {
    user: JSON.parse(root.dataset.user || 'null'),
    csrf: document.querySelector('meta[name="csrf-token"]').content,
    type: 'message', result: null, route: '', page: 1, filters: {},
    reportPrefill: null, article: null, busy: false, lastFocused: null,
  };
  const icons = {
    shield: 'shield-check', home: 'layout-dashboard', check: 'scan-search', history: 'clock-3',
    reports: 'flag', education: 'book-open', user: 'user-round', settings: 'settings',
    logout: 'log-out', message: 'message-square-text', phone: 'phone', bank: 'landmark',
    url: 'link-2', arrow: 'arrow-right', search: 'search', save: 'bookmark', external: 'external-link',
    close: 'x', trash: 'trash-2', file: 'file-text', users: 'users-round', database: 'database',
    articles: 'newspaper', trend: 'chart-no-axes-column-increasing', calendar: 'calendar-days',
    alert: 'triangle-alert', copy: 'copy', moon: 'moon', sun: 'sun', plus: 'plus',
    refresh: 'rotate-cw', eye: 'eye', filter: 'list-filter', download: 'download', menu: 'menu',
    bell: 'bell', chevron: 'chevron-down', more: 'ellipsis', shieldAlert: 'shield-alert', activity: 'activity',
    checkCircle: 'circle-check', clock: 'clock-3', arrowUpRight: 'arrow-up-right',
  };
  const typeNames = { message: 'Pesan', phone: 'Nomor telepon', bank: 'Rekening bank', url: 'Tautan URL' };
  const riskNames = { low: 'Risiko rendah', medium: 'Risiko sedang', high: 'Risiko tinggi', unknown: 'Belum ada data' };
  const signalNames = { low: 'Rendah', medium: 'Sedang', high: 'Tinggi', unknown: 'Belum dapat dinilai' };
  const reportNames = { pending: 'Menunggu verifikasi', reviewing: 'Sedang ditinjau', verified: 'Terverifikasi', rejected: 'Ditolak' };
  const categories = ['Phishing', 'Penipuan WhatsApp', 'Penipuan Online Shop', 'Penipuan Investasi', 'Keamanan Rekening', 'Keamanan Data Pribadi'];

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
  function icon(name, cls = '') { return `<i class="icon ${cls}" data-lucide="${icons[name] || name}" aria-hidden="true"></i>`; }
  function enhance() { if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.8 } }); }
  function brand(inverse = false) {
    return `<a class="brand ${inverse ? 'brand-inverse' : ''}" href="#home" aria-label="TRUSTIFY, beranda"><span class="brand-image"><img src="assets/TRUSTIFY%20Logo.png" alt="TRUSTIFY"></span></a>`;
  }
  function button(label, action, extra = '', kind = 'button-primary') {
    return `<button class="button ${kind} ${extra}" type="button" data-action="${action}">${label}</button>`;
  }
  function toast(message, error = false) {
    const item = document.createElement('div');
    item.className = `toast${error ? ' is-error' : ''}`;
    item.setAttribute('role', error ? 'alert' : 'status');
    item.textContent = message;
    toastRegion.append(item);
    window.setTimeout(() => item.remove(), 4200);
  }
  async function api(action, options = {}) {
    const headers = { 'X-CSRF-Token': state.csrf, ...(options.headers || {}) };
    const response = await fetch(`api.php?action=${encodeURIComponent(action)}${options.query ? `&${options.query}` : ''}`, {
      method: options.method || 'GET', headers, body: options.body,
    });
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json() : {};
    if (!response.ok) {
      if (response.status === 401 && state.user) {
        state.user = null;
        state.result = null;
        location.hash = '#login';
      }
      throw new Error(data.error || 'Permintaan gagal. Coba lagi.');
    }
    if (data.csrf) state.csrf = data.csrf;
    return data;
  }
  function riskBadge(status) { return `<span class="risk-badge risk-${esc(status)}">${esc(riskNames[status] || riskNames.unknown)}</span>`; }
  function reportBadge(status) { return `<span class="status-badge status-${esc(status)}">${esc(reportNames[status] || status)}</span>`; }
  function pageHead(title, description, action = '') {
    return `<header class="page-head"><div><h1>${esc(title)}</h1><p>${esc(description)}</p></div>${action}</header>`;
  }
  function stateMessage(kind, title, description, action = '') {
    return `<div class="${kind === 'error' ? 'error-state' : kind === 'loading' ? 'loading-state' : 'empty-state'}" ${kind === 'loading' ? 'role="status"' : ''}><strong>${esc(title)}</strong><p>${esc(description)}</p>${action}</div>`;
  }

  function currentRoute() {
    const route = location.hash.replace(/^#/, '').split('?')[0];
    return route || (state.user ? 'dashboard' : 'home');
  }
  function navigate(route) { state.route = route; state.result = null; location.hash = `#${route}`; }
  function render() {
    state.route = currentRoute();
    if (state.user && ['home', 'login', 'register'].includes(state.route)) {
      location.hash = state.user.role === 'admin' ? '#admin' : '#dashboard';
      return;
    }
    if (!state.user && !['home', 'login', 'register', 'forgot', 'check', 'about', 'features', 'education', 'quick-check'].includes(state.route) && !state.route.startsWith('article/')) {
      location.hash = '#login';
      return;
    }
    if (!state.user) {
      if (state.route === 'login' || state.route === 'register') renderAuth();
      else if (state.route === 'forgot') renderForgot();
      else if (state.route === 'check') renderPublicCheck();
      else if (state.route.startsWith('article/')) renderPublicArticle(decodeURIComponent(state.route.slice(8)));
      else renderLanding();
    } else {
      renderWorkspace();
    }
    enhance();
  }

  function renderPublicCheck() {
    root.innerHTML = `<header class="public-nav">${brand()}<nav class="public-links" aria-label="Navigasi utama"><a href="#home">Beranda</a><a href="#about">Tentang</a><a href="#education">Edukasi</a></nav><div class="nav-actions"><a class="nav-text" href="#login">Masuk</a><a class="button button-primary" href="#register">Buat akun</a></div></header><main class="landing"><section class="section"><div class="section-inner"><div id="public-check-content"></div></div></section></main><footer class="site-footer"><div class="footer-row">${brand(true)}<p>Think Before You Trust. Periksa, pahami, lalu putuskan.</p></div></footer>`;
    renderCheckPage(document.querySelector('#public-check-content'));
  }

  function renderLanding() {
    root.innerHTML = `
      <header class="public-nav" id="site-nav">
        ${brand()}
        <nav class="public-links" id="landing-links" aria-label="Navigasi utama">
          <a href="#home" aria-current="page">Beranda</a><a href="#how-it-works">Cara Kerja</a><a href="#features">Fitur</a><a href="#education">Edukasi</a><a href="#about">Tentang Kami</a>
        </nav>
        <div class="nav-actions"><a class="nav-text" href="#login">Masuk</a><a class="button button-primary" href="#register">Daftar</a><button class="landing-menu-toggle" type="button" data-action="landing-menu" aria-label="Buka navigasi" aria-expanded="false" aria-controls="landing-links">${icon('menu')}</button></div>
      </header>
      <main class="landing landing-page">
        <section class="hero landing-hero" id="home" aria-labelledby="hero-title">
          <div class="hero-copy" data-reveal><p class="hero-mark">PERIKSA SEBELUM BERTINDAK</p><h1 id="hero-title">Jangan Asal Percaya.<br><span>Periksa Sebelum Terjebak.</span></h1><p>Kenali potensi penipuan digital sebelum kamu menjadi korbannya. Periksa pesan, nomor telepon, rekening bank, dan tautan mencurigakan melalui TRUSTIFY.</p><div class="hero-actions"><a class="button button-primary" href="#quick-check">Periksa Sekarang ${icon('arrow')}</a><a class="text-link" href="#how-it-works">Pelajari Cara Kerjanya</a></div><div class="hero-note">${icon('shield')}<span>Hasil pemeriksaan adalah sinyal awal, bukan jaminan keamanan.</span></div></div>
          <div class="hero-visual" role="img" aria-label="Ilustrasi isometrik ponsel yang memeriksa pesan mencurigakan dengan perlindungan TRUSTIFY" data-reveal>
            <div class="visual-grid" aria-hidden="true"></div><canvas class="scene-canvas" id="security-scene" aria-hidden="true"></canvas><div class="visual-caption">RUANG PERIKSA <span>01 / TRUSTIFY</span></div>
            <div class="visual-chip visual-chip-url">${icon('url')}<span><small>TAUTAN</small>hadiah-klaim.co</span></div>
            <div class="visual-chip visual-chip-phone">${icon('phone')}<span><small>PENGIRIM</small>+62 812 •••• 9041</span></div>
            <div class="phone-scene" aria-hidden="true"><div class="phone-side"></div><div class="phone-frame"><div class="phone-screen"><div class="phone-status"><span>09:41</span><span>● ● ●</span></div><div class="phone-appbar"><span class="phone-avatar">?</span><span><b>Nomor tidak dikenal</b><small>SMS · baru saja</small></span><i>${icon('more')}</i></div><div class="message-bubble">Selamat! Akun Anda terpilih. Verifikasi sekarang agar hadiah tidak hangus.<div class="message-link">https://hadiah-klaim.co</div></div><div class="message-warning">${icon('alert')} Pesan meminta tindakan cepat</div><div class="phone-scan"><span></span>Memeriksa indikator</div></div></div></div>
            <div class="shield-scene" aria-hidden="true"><div class="shield-face">${icon('shieldAlert')}</div><span>TERPERIKSA</span></div>
            <div class="scene-orbit scene-orbit-one" aria-hidden="true"></div><div class="scene-orbit scene-orbit-two" aria-hidden="true"></div>
            <div class="visual-footnote">Pesan • Nomor • Rekening • URL</div>
          </div>
        </section>
        <section class="quick-section section" id="quick-check" aria-labelledby="quick-title"><div class="section-inner quick-layout"><div class="quick-intro" data-reveal><p class="eyebrow">PEMEMERIKSAAN PUBLIK</p><h2 id="quick-title">Apa yang ingin kamu periksa?</h2><p>Mulai dari satu informasi. Sistem menganalisis secara lokal dan tidak membuka tautan yang kamu masukkan.</p><div class="quick-proof">${icon('checkCircle')} Tanpa perlu masuk untuk pemeriksaan awal</div></div><div class="quick-workbench" data-reveal><div class="preview-heading"><h3>Pilih jenis informasi</h3><span class="preview-label"><span></span>Analisis lokal</span></div><div class="preview-tabs quick-tabs" role="tablist" aria-label="Jenis pemeriksaan">${Object.entries(typeNames).map(([type, label]) => `<button class="quick-tab" id="tab-${type}" role="tab" type="button" aria-selected="${type === state.type}" aria-controls="preview-form" data-action="select-type" data-type="${type}">${icon(type)}<span><b>${type === 'message' ? 'Pesan mencurigakan' : type === 'phone' ? 'Nomor telepon' : type === 'bank' ? 'Rekening bank' : 'URL atau link'}</b><small>${type === 'message' ? 'Teks chat atau SMS' : type === 'phone' ? 'Nomor yang menghubungi' : type === 'bank' ? 'Tujuan transfer' : 'Alamat situs web'}</small></span></button>`).join('')}</div><form class="preview-form" id="preview-form"><label class="field"><span>${state.type === 'message' ? 'Tempel pesan yang diterima' : state.type === 'url' ? 'Masukkan tautan lengkap' : state.type === 'phone' ? 'Masukkan nomor telepon Indonesia' : 'Masukkan nomor rekening'}</span>${previewInput()}</label>${state.type === 'bank' ? bankSelect() : ''}<div id="preview-response" class="preview-result" aria-live="polite"></div><button class="button button-primary quick-submit" type="submit">${icon('check')}Periksa Sekarang</button></form><div class="quick-disclaimer">Tidak ada kecocokan bukan berarti informasi pasti aman.</div></div></div></section>
        <section class="section intro-section" id="about"><div class="section-inner intro-layout"><div class="intro-copy" data-reveal><p class="eyebrow">KENALI ANCAMAN SEBELUM TERJADI</p><h2>Kenali ancaman sebelum terjadi.</h2><p>Pesan mendesak, nomor tak dikenal, rekening tujuan, hingga website tiruan bisa hadir dalam percakapan sehari-hari. TRUSTIFY membantu memeriksa tanda yang tersedia sebelum kamu mengambil keputusan.</p><a class="text-link" href="#features">Kenali cakupan pemeriksaan ${icon('arrow')}</a></div><div class="signal-board" aria-label="Contoh jenis sinyal digital yang dapat diperiksa" data-reveal><div class="signal-board-top"><span>INFORMASI YANG PERLU DICEK</span><span class="signal-board-dot">LIVE CHECK</span></div><div class="signal-message"><div class="signal-icon">${icon('message')}</div><div><small>PESAN MASUK · 2 MENIT LALU</small><strong>“Akun dibatasi. Verifikasi melalui tautan ini.”</strong></div><span class="signal-mark">${icon('alert')}</span></div><div class="signal-data"><div class="signal-phone"><small>NOMOR PENGIRIM</small><strong>${icon('phone')} +62 811 •••• 2048</strong><span>Belum ada data terverifikasi</span></div><div class="signal-url"><small>DOMAIN TAUTAN</small><strong>verifikasi-akun.help</strong><span>${icon('url')} Belum dibuka oleh TRUSTIFY</span></div></div><div class="signal-board-foot"><span>Periksa sinyal, lalu konfirmasi lewat kanal resmi.</span>${icon('arrowUpRight')}</div></div></div></section>
        <section class="section process-section" id="how-it-works"><div class="section-inner"><div class="section-heading-row" data-reveal><div><p class="eyebrow">ALUR PEMERIKSAAN</p><h2>Periksa dalam tiga langkah.</h2></div><p>Penjelasan singkat tentang data yang masuk, cara analisis, dan batas hasilnya.</p></div><div class="process-line"><article class="process-step" data-reveal><span class="process-number">01</span><div class="process-icon">${icon('file')}</div><h3>Masukkan informasi</h3><p>Tempel pesan atau masukkan nomor, rekening, maupun URL yang ingin diperiksa.</p><span class="process-detail">Pilih satu jenis data</span></article><article class="process-step" data-reveal><span class="process-number">02</span><div class="process-icon">${icon('check')}</div><h3>Sistem melakukan analisis</h3><p>Indikator lokal, pola yang tersedia, dan laporan terverifikasi diperiksa sesuai jenis informasi.</p><span class="process-detail">URL tidak dibuka</span></article><article class="process-step" data-reveal><span class="process-number">03</span><div class="process-icon">${icon('reports')}</div><h3>Lihat hasil pemeriksaan</h3><p>Baca tingkat risiko, alasan yang terdeteksi, sumber, dan rekomendasi tindakan.</p><span class="process-detail">Konfirmasi lewat kanal resmi</span></article></div></div></section>
        <section class="section features-section" id="features"><div class="section-inner"><div class="section-heading-row" data-reveal><div><p class="eyebrow">PERLINDUNGAN DALAM SATU TEMPAT</p><h2>Satu platform untuk berbagai pemeriksaan.</h2></div><p>Gunakan alat yang sesuai, simpan hasil, dan kirim laporan untuk ditinjau.</p></div><div class="feature-mosaic"><article class="feature-featured" data-reveal><div class="feature-art feature-art-message"><div class="feature-message-window"><span>${icon('message')} Pesan masuk</span><b>Verifikasi akun Anda sekarang</b><small>Permintaan OTP · desakan waktu</small></div><span class="feature-art-label">01 / MESSAGE CHECKER</span></div><div class="feature-copy"><span class="feature-index">01</span><h3>Message Checker</h3><p>Memeriksa isi pesan dengan indikator seperti permintaan data rahasia, ancaman, hadiah, dan desakan.</p><button class="feature-action" type="button" data-action="landing-select-type" data-type="message">Periksa pesan ${icon('arrow')}</button></div></article><article class="feature-compact" data-reveal><span class="feature-index">02</span>${icon('phone')}<h3>Phone Number Checker</h3><p>Memeriksa nomor terhadap laporan terverifikasi dan pola angka yang tersedia.</p><button class="feature-action" type="button" data-action="landing-select-type" data-type="phone">Periksa nomor ${icon('arrow')}</button></article><article class="feature-compact feature-compact-lavender" data-reveal><span class="feature-index">03</span>${icon('bank')}<h3>Bank Account Checker</h3><p>Memeriksa kombinasi nama bank dan nomor rekening dari informasi laporan.</p><button class="feature-action" type="button" data-action="landing-select-type" data-type="bank">Periksa rekening ${icon('arrow')}</button></article><article class="feature-wide" data-reveal><div class="feature-wide-copy"><span class="feature-index">04</span><h3>URL Checker</h3><p>Menilai ciri domain dan indikator phishing tanpa mengakses alamat yang dikirim.</p><button class="feature-action" type="button" data-action="landing-select-type" data-type="url">Periksa tautan ${icon('arrow')}</button></div><div class="url-ribbon" aria-hidden="true"><span>${icon('url')} https://contoh-situs.co</span><b>${icon('shield')} Analisis lokal</b></div></article><article class="feature-compact feature-dark" data-reveal><span class="feature-index">05</span>${icon('reports')}<h3>Report Center</h3><p>Kirim kronologi dan bukti indikasi penipuan untuk ditinjau admin.</p><a class="feature-action" href="#register">Buat laporan ${icon('arrow')}</a></article><article class="feature-compact" data-reveal><span class="feature-index">06</span>${icon('history')}<h3>Check History</h3><p>Simpan hasil pemeriksaan dan buka kembali dari akunmu.</p><a class="feature-action" href="#login">Masuk untuk melihat riwayat ${icon('arrow')}</a></article></div></div></section>
        <section class="section risk-section" id="risk-guide"><div class="section-inner risk-layout"><div class="risk-copy" data-reveal><p class="eyebrow">MEMBACA HASIL</p><h2>Pahami risiko, tentukan langkah.</h2><p>Skor merangkum indikator yang ditemukan, bukan kepastian bahwa sesuatu aman atau penipuan. Hasil tanpa kecocokan laporan tetap ditampilkan sebagai belum ada data.</p><div class="risk-legend"><div><span class="risk-dot risk-dot-low"></span><span><b>Risiko rendah</b><small>Indikator terbatas terdeteksi</small></span></div><div><span class="risk-dot risk-dot-medium"></span><span><b>Risiko sedang</b><small>Perlu pemeriksaan lebih lanjut</small></span></div><div><span class="risk-dot risk-dot-high"></span><span><b>Risiko tinggi</b><small>Sejumlah indikator perlu diwaspadai</small></span></div></div></div><article class="sample-result" data-reveal aria-label="Contoh tampilan hasil simulasi"><div class="sample-result-top"><span>CONTOH TAMPILAN · SIMULASI</span><span class="sample-result-icon">${icon('shieldAlert')}</span></div><div class="sample-result-main"><div class="sample-score-card"><strong>62</strong><span>/100</span></div><div><span class="sample-risk-label">Risiko sedang</span><h3>Pesan meminta tindakan cepat</h3><p>Contoh pesan: “Akun akan diblokir, kirim kode verifikasi.”</p></div></div><div class="sample-indicators"><span>${icon('alert')} Desakan waktu</span><span>${icon('message')} Permintaan kode rahasia</span></div><div class="sample-source"><small>SUMBER</small><strong>Analisis indikator lokal</strong><p>Ini hanya ilustrasi, bukan hasil pemeriksaan nyata.</p></div><div class="sample-recommendation">Jangan bagikan OTP. Hubungi layanan melalui kanal resmi yang kamu ketahui.</div></article></div></section>
        <section class="section stats-section" id="stats"><div class="section-inner stats-wrap"><div class="stats-intro" data-reveal><p class="eyebrow">TRANSPARANSI DATA</p><h2>Bangun kesadaran digital bersama.</h2><p id="public-stats-note">Mengambil data aktual dari database TRUSTIFY.</p></div><div class="stats-grid" data-reveal><div class="stat"><strong id="public-checks">—</strong><span>Total pemeriksaan tersimpan</span></div><div class="stat"><strong id="public-reports">—</strong><span>Laporan masuk</span></div><div class="stat"><strong id="public-indicators">—</strong><span>Indikator risiko aktif</span></div><div class="stat"><strong id="public-users">—</strong><span>Akun terdaftar</span></div></div><p class="stats-footnote">Angka diperbarui dari database lokal. Data simulasi ditandai di dalam sistem.</p></div></section>
        <section class="section education-section" id="education"><div class="section-inner"><div class="section-heading-row" data-reveal><div><p class="eyebrow">EDUKASI DIGITAL</p><h2>Lebih paham, lebih waspada.</h2></div><div><p>Panduan yang bersumber dari artikel TRUSTIFY untuk membantu mengenali pola dan mengambil tindakan.</p><a class="text-link" href="#education">Lihat panduan edukasi ${icon('arrow')}</a></div></div><div class="article-grid" id="public-articles">${stateMessage('loading', 'Memuat artikel', 'Mengambil artikel dari database edukasi.')}</div></div></section>
        <section class="closing-cta"><div class="closing-inner" data-reveal><div><p class="eyebrow">TRUSTIFY · THINK BEFORE YOU TRUST</p><h2>Jangan tunggu menjadi korban.</h2><p>Periksa informasi mencurigakan sebelum mengambil keputusan.</p></div><div class="closing-actions"><a class="button button-primary" href="#quick-check">Mulai Pemeriksaan ${icon('arrow')}</a><a class="button button-ghost" href="#register">Buat Akun TRUSTIFY</a></div><div class="closing-mark" aria-hidden="true">${icon('shield')}</div></div></section>
      </main>
      <footer class="site-footer landing-footer"><div class="footer-main"><div class="footer-brand">${brand(true)}<p>Think Before You Trust.<br>Periksa, pahami, lalu putuskan.</p></div><div class="footer-column"><strong>Jelajahi</strong><a href="#home">Beranda</a><a href="#how-it-works">Cara Kerja</a><a href="#about">Tentang Kami</a></div><div class="footer-column"><strong>Pemeriksaan</strong><a href="#quick-check">Pesan dan SMS</a><a href="#quick-check">Nomor dan rekening</a><a href="#quick-check">URL atau link</a></div><div class="footer-column"><strong>Belajar</strong><a href="#education">Artikel edukasi</a><a href="#features">Pusat laporan</a><a href="#login">Riwayat pemeriksaan</a></div></div><div class="footer-bottom"><span>© ${new Date().getFullYear()} TRUSTIFY</span><span>Platform pemeriksaan dan pelaporan indikasi penipuan digital.</span><a href="#home">Kembali ke atas ↑</a></div></footer>`;
    state.landingLoaded = true;
    loadLandingData();
    setupLandingMotion();
  }

  function previewInput() {
    if (state.type === 'message') return '<textarea name="subject" minlength="5" maxlength="2048" required placeholder="Contoh: Akun Anda akan diblokir, kirim kode OTP untuk verifikasi."></textarea>';
    if (state.type === 'phone') return '<input name="subject" type="tel" required pattern="(?:\\+?62|0)?8[1-9][0-9]{7,11}" title="Masukkan nomor ponsel Indonesia yang valid" placeholder="0812 3456 7890" autocomplete="tel">';
    if (state.type === 'bank') return '<input name="subject" inputmode="numeric" pattern="[0-9\\s-]{5,32}" required title="Masukkan nomor rekening 5 sampai 32 digit" placeholder="Nomor rekening">';
    return '<input name="subject" type="url" required placeholder="https://contoh.domain">';
  }
  function bankSelect() {
    return `<label class="field"><span>Nama bank</span><select name="bank" required><option value="">Pilih bank</option>${['Bank Simulasi', 'BCA', 'BRI', 'BNI', 'Mandiri', 'BSI', 'Bank lainnya'].map((bank) => `<option>${esc(bank)}</option>`).join('')}</select></label>`;
  }
  function featureItem(name, title, description) {
    return `<article class="feature-item">${icon(name)}<div><h3>${esc(title)}</h3><p>${esc(description)}</p></div></article>`;
  }
  async function loadLandingData() {
    try {
      const { stats } = await api('stats');
      const checks = document.querySelector('#public-checks');
      const reports = document.querySelector('#public-reports');
      const indicators = document.querySelector('#public-indicators');
      const users = document.querySelector('#public-users');
      const note = document.querySelector('#public-stats-note');
      if (!checks || !reports || !indicators || !users || !note) return;
      [[checks, stats.checks], [reports, stats.reports], [indicators, stats.indicators], [users, stats.users]].forEach(([node, count]) => {
        node.dataset.counter = String(Number(count));
        node.textContent = '0';
      });
      note.textContent = 'Sumber: database TRUSTIFY. Data simulasi tetap ditandai di dalam sistem.';
      animateLandingCounters();
    } catch (error) {
      const note = document.querySelector('#public-stats-note');
      if (!note) return;
      note.textContent = 'Data statistik belum tersedia. Pemeriksaan lokal tetap dapat digunakan.';
      document.querySelectorAll('#public-checks, #public-reports, #public-indicators, #public-users').forEach((node) => node.textContent = '—');
    }
    try {
      const { items } = await api('articles');
      const host = document.querySelector('#public-articles');
      if (!host) return;
      host.innerHTML = items.length ? items.slice(0, 3).map((article, index) => `<article class="article-item ${index === 0 ? 'article-featured' : ''}" data-reveal><div class="article-cover article-cover-${index + 1}" aria-hidden="true"><span>${String(index + 1).padStart(2, '0')}</span>${icon(index === 0 ? 'shieldAlert' : index === 1 ? 'message' : 'url')}</div><span class="article-category">${esc(article.category)}</span><h3>${esc(article.title)}</h3><p>${esc(article.excerpt)}</p><a class="text-link" href="#article/${encodeURIComponent(article.slug)}">Baca panduan ${icon('arrow')}</a></article>`).join('') : stateMessage('empty', 'Belum ada artikel', 'Artikel edukasi akan muncul di sini setelah diterbitkan.');
      setupLandingReveals();
      enhance();
    } catch (error) {
      const host = document.querySelector('#public-articles');
      if (host) host.innerHTML = stateMessage('error', 'Artikel tidak tersedia', error.message);
    }
  }

  function setupLandingReveals() {
    const revealItems = document.querySelectorAll('.landing-page [data-reveal]');
    if (!('IntersectionObserver' in window)) {
      revealItems.forEach((item) => item.classList.add('is-visible'));
      return;
    }
    state.landingRevealObserver?.disconnect();
    state.landingRevealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12 });
    revealItems.forEach((item) => state.landingRevealObserver.observe(item));
  }

  function setupLandingMotion() {
    setupLandingReveals();
    loadLandingScene();
    const nav = document.querySelector('#site-nav');
    if (!nav) return;
    if (state.landingScrollHandler) window.removeEventListener('scroll', state.landingScrollHandler);
    state.landingScrollHandler = () => nav.classList.toggle('is-scrolled', window.scrollY > 10);
    window.addEventListener('scroll', state.landingScrollHandler, { passive: true });
    state.landingScrollHandler();
    state.landingSectionObserver?.disconnect();
    if (!('IntersectionObserver' in window)) return;
    const links = [...document.querySelectorAll('#landing-links a[href^="#"]')];
    state.landingSectionObserver = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      links.forEach((link) => {
        if (link.getAttribute('href') === `#${visible.target.id}`) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      });
    }, { rootMargin: '-24% 0px -64% 0px', threshold: [0, 0.15, 0.4] });
    document.querySelectorAll('.landing-page section[id]').forEach((section) => state.landingSectionObserver.observe(section));
  }

  function loadLandingScene() {
    const canvas = document.querySelector('#security-scene');
    if (!canvas || canvas.dataset.initialized) return;
    canvas.dataset.initialized = 'true';
    import('./landing-scene.js?v=2').then(({ mountLandingScene }) => mountLandingScene(canvas)).catch(() => canvas.remove());
  }

  function animateLandingCounters() {
    const counters = document.querySelectorAll('.stats-grid [data-counter]');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      counters.forEach((counter) => { counter.textContent = Number(counter.dataset.counter).toLocaleString('id-ID'); });
      return;
    }
    const observer = new IntersectionObserver((entries, currentObserver) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const counter = entry.target;
        currentObserver.unobserve(counter);
        const target = Number(counter.dataset.counter);
        const start = performance.now();
        const duration = 720;
        const tick = (now) => {
          const progress = Math.min(1, (now - start) / duration);
          const eased = 1 - (1 - progress) ** 3;
          counter.textContent = Math.round(target * eased).toLocaleString('id-ID');
          if (progress < 1 && counter.isConnected) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.5 });
    counters.forEach((counter) => observer.observe(counter));
  }

  function passwordField(name, label, autocomplete, minlength = 1) {
    const id = `password-${name}`;
    return `<label class="field"><span>${label}</span><span class="password-control"><input id="${id}" name="${name}" type="password" required minlength="${minlength}" autocomplete="${autocomplete}"><button class="password-toggle" type="button" data-action="toggle-password" data-target="${id}" data-label="${esc(label)}" aria-label="Tampilkan ${esc(label)}" aria-pressed="false" title="Tampilkan password">${icon('eye')}</button></span></label>`;
  }

  function renderAuth() {
    const register = state.route === 'register';
    root.innerHTML = `<main class="auth-page"><header class="auth-topbar">${brand()}<a class="auth-home-link" href="#home">${icon('arrow')} Kembali ke beranda</a></header><section class="auth-shell ${register ? 'is-register' : ''}" id="auth-shell" aria-label="Autentikasi TRUSTIFY">
      <div class="auth-form-panel"><div class="auth-form-track">
        <form class="auth-form auth-form-login" id="auth-login-form" data-mode="login" aria-hidden="${register}" ${register ? 'inert' : ''} novalidate>
          <div class="auth-form-heading"><span class="auth-eyebrow">AKUN TRUSTIFY</span><h1>Selamat Datang Kembali</h1><p>Masuk ke akun TRUSTIFY untuk memeriksa informasi mencurigakan dan mengelola aktivitas keamanan digital kamu.</p></div>
          <label class="auth-field"><span>Email atau username</span><span class="auth-input-wrap">${icon('user')}<input name="identifier" required maxlength="190" autocomplete="username" placeholder="nama@email.com atau username"></span><small class="auth-field-error" data-error-for="identifier"></small></label>
          <label class="auth-field"><span>Password</span><span class="auth-input-wrap">${icon('shield')}<input id="auth-login-password" name="password" type="password" required autocomplete="current-password" placeholder="Masukkan password"><button class="password-toggle" type="button" data-action="toggle-password" data-target="auth-login-password" data-label="password" aria-label="Tampilkan password" aria-pressed="false" title="Tampilkan password">${icon('eye')}</button></span><small class="auth-field-error" data-error-for="password"></small></label>
          <div class="auth-login-options"><label class="auth-remember"><input name="remember" type="checkbox"><span>Ingat saya</span></label><a href="#forgot">Lupa password?</a></div>
          <div class="form-message auth-message" aria-live="polite"></div><button class="button button-primary auth-submit" type="submit"><span class="auth-submit-label">Masuk</span>${icon('arrow')}</button>
          <div class="auth-mobile-switch">Belum punya akun? <button type="button" data-action="auth-switch" data-mode="register">Buat akun</button></div>
          <details class="demo-accounts"><summary>Akun demo untuk pengujian</summary><span>Admin: admin / admin123</span><span>User: user / user123</span></details>
        </form>
        <form class="auth-form auth-form-register" id="auth-register-form" data-mode="register" aria-hidden="${!register}" ${register ? '' : 'inert'} novalidate>
          <div class="auth-form-heading"><span class="auth-eyebrow">MULAI LEBIH WASPADA</span><h1>Buat Akun TRUSTIFY</h1><p>Buat akun untuk menyimpan riwayat pemeriksaan dan mengelola laporan keamanan digital kamu.</p></div>
          <label class="auth-field"><span>Nama lengkap</span><span class="auth-input-wrap">${icon('user')}<input name="name" required minlength="2" maxlength="120" autocomplete="name" placeholder="Nama lengkap"></span><small class="auth-field-error" data-error-for="name"></small></label>
          <label class="auth-field"><span>Nomor telepon</span><span class="auth-input-wrap">${icon('phone')}<input name="phone" type="tel" required pattern="(?:\\+?62|0)?8[1-9][0-9]{7,11}" maxlength="32" autocomplete="tel" placeholder="0812 3456 7890"></span><small class="auth-field-error" data-error-for="phone"></small></label>
          <label class="auth-field"><span>Email</span><span class="auth-input-wrap">${icon('mail')}<input name="email" type="email" required maxlength="190" autocomplete="email" placeholder="nama@email.com"></span><small class="auth-field-error" data-error-for="email"></small></label>
          <label class="auth-field"><span>Password</span><span class="auth-input-wrap">${icon('shield')}<input id="auth-register-password" name="password" type="password" required minlength="10" autocomplete="new-password" placeholder="Minimal 10 karakter"><button class="password-toggle" type="button" data-action="toggle-password" data-target="auth-register-password" data-label="password" aria-label="Tampilkan password" aria-pressed="false" title="Tampilkan password">${icon('eye')}</button></span><span class="password-strength" aria-live="polite"><span class="strength-track"><span id="auth-strength-bar"></span></span><small id="auth-strength-label">Minimal 10 karakter</small></span><small class="auth-field-error" data-error-for="password"></small></label>
          <label class="auth-field"><span>Konfirmasi password</span><span class="auth-input-wrap">${icon('shield')}<input id="auth-register-confirm" name="confirm" type="password" required minlength="10" autocomplete="new-password" placeholder="Ulangi password"><button class="password-toggle" type="button" data-action="toggle-password" data-target="auth-register-confirm" data-label="konfirmasi password" aria-label="Tampilkan konfirmasi password" aria-pressed="false" title="Tampilkan password">${icon('eye')}</button></span><small class="auth-field-error" data-error-for="confirm"></small></label>
          <div class="form-message auth-message" aria-live="polite"></div><button class="button button-primary auth-submit" type="submit"><span class="auth-submit-label">Buat Akun</span>${icon('arrow')}</button>
          <div class="auth-mobile-switch">Sudah punya akun? <button type="button" data-action="auth-switch" data-mode="login">Masuk</button></div>
        </form>
      </div></div>
      <aside class="auth-visual" aria-live="polite"><canvas class="scene-canvas" id="auth-security-scene" aria-hidden="true"></canvas><div class="auth-visual-grid" aria-hidden="true"></div><div class="auth-visual-content auth-visual-login"><span class="auth-visual-kicker">TRUSTIFY · THINK BEFORE YOU TRUST</span><h2>Senang Melihatmu Kembali!</h2><p>Lanjutkan langkahmu untuk mengenali dan menghindari ancaman penipuan digital.</p><button class="button auth-visual-button" type="button" data-action="auth-switch" data-mode="register">Buat Akun ${icon('arrow')}</button><div class="auth-visual-caption">Periksa dulu, putuskan dengan tenang.</div></div><div class="auth-visual-content auth-visual-register"><span class="auth-visual-kicker">LANGKAH PERTAMA DIMULAI DI SINI</span><h2>Halo, Pengguna Baru!</h2><p>Mulai perjalananmu untuk lebih waspada terhadap berbagai bentuk penipuan digital.</p><button class="button auth-visual-button" type="button" data-action="auth-switch" data-mode="login">Masuk Sekarang ${icon('arrow')}</button><div class="auth-visual-caption">Pesan • Nomor • Rekening • URL</div></div><div class="auth-visual-mark" aria-hidden="true">${icon('shield')}</div></aside>
    </section></main>`;
    const activeForm = document.querySelector(register ? '#auth-register-form' : '#auth-login-form');
    activeForm?.removeAttribute('inert');
    document.querySelector('.auth-visual-login')?.toggleAttribute('inert', register);
    document.querySelector('.auth-visual-register')?.toggleAttribute('inert', !register);
    document.querySelector('.auth-visual-login')?.setAttribute('aria-hidden', String(register));
    document.querySelector('.auth-visual-register')?.setAttribute('aria-hidden', String(!register));
    loadAuthScene();
  }

  function loadAuthScene() {
    const canvas = document.querySelector('#auth-security-scene');
    if (!canvas || canvas.dataset.initialized) return;
    canvas.dataset.initialized = 'true';
    import('./landing-scene.js?v=2').then(({ mountLandingScene }) => mountLandingScene(canvas)).catch(() => canvas.remove());
  }

  function setAuthMode(mode) {
    const register = mode === 'register';
    const shell = document.querySelector('#auth-shell');
    const loginForm = document.querySelector('#auth-login-form');
    const registerForm = document.querySelector('#auth-register-form');
    if (!shell || !loginForm || !registerForm) return;
    shell.classList.toggle('is-register', register);
    loginForm.toggleAttribute('inert', register);
    registerForm.toggleAttribute('inert', !register);
    loginForm.setAttribute('aria-hidden', String(register));
    registerForm.setAttribute('aria-hidden', String(!register));
    document.querySelector('.auth-visual-login')?.toggleAttribute('inert', register);
    document.querySelector('.auth-visual-register')?.toggleAttribute('inert', !register);
    document.querySelector('.auth-visual-login')?.setAttribute('aria-hidden', String(register));
    document.querySelector('.auth-visual-register')?.setAttribute('aria-hidden', String(!register));
    state.route = mode;
    if (location.hash !== `#${mode}`) history.pushState({ authMode: mode }, '', `#${mode}`);
    window.setTimeout(() => (register ? registerForm : loginForm).querySelector('input:not([type="checkbox"])')?.focus({ preventScroll: true }), 420);
  }

  function authFieldMessage(input) {
    if (input.validity.valueMissing) return 'Kolom ini wajib diisi.';
    if (input.validity.typeMismatch) return 'Masukkan alamat email dengan format yang benar.';
    if (input.name === 'phone' && input.validity.patternMismatch) return 'Masukkan nomor telepon Indonesia yang valid.';
    if (input.name === 'name' && input.validity.tooShort) return 'Nama minimal 2 karakter.';
    if (input.name === 'password' && input.validity.tooShort) return 'Password minimal 10 karakter.';
    if (input.name === 'confirm' && input.validity.customError) return 'Konfirmasi password belum cocok.';
    return 'Periksa kembali informasi ini.';
  }

  function updateAuthField(input, showError = false) {
    if (!(input instanceof HTMLInputElement) || !input.form?.classList.contains('auth-form')) return;
    if (input.name === 'confirm') {
      const password = input.form.elements.password;
      input.setCustomValidity(input.value && input.value !== password.value ? 'Password belum cocok.' : '');
    }
    const error = input.closest('.auth-field')?.querySelector('.auth-field-error');
    const invalid = showError && !input.validity.valid;
    input.setAttribute('aria-invalid', String(invalid));
    if (error) error.textContent = invalid ? authFieldMessage(input) : '';
  }

  function updatePasswordStrength(input) {
    const bar = document.querySelector('#auth-strength-bar');
    const label = document.querySelector('#auth-strength-label');
    if (!bar || !label || !input) return;
    const value = input.value;
    const score = value.length < 10 ? 0 : 1 + Number(/[a-z]/.test(value) && /[A-Z]/.test(value)) + Number(/\d/.test(value)) + Number(/[^A-Za-z0-9]/.test(value));
    const labels = ['Minimal 10 karakter', 'Cukup', 'Sedang', 'Kuat', 'Sangat kuat'];
    bar.style.setProperty('--strength', `${score * 25}%`);
    bar.dataset.strength = String(score);
    label.textContent = value ? (value.length < 10 ? 'Minimal 10 karakter' : labels[Math.min(score, labels.length - 1)]) : 'Minimal 10 karakter';
  }

  function validateAuthForm(form) {
    const inputs = [...form.querySelectorAll('input:not([type="checkbox"])')];
    inputs.forEach((input) => updateAuthField(input));
    if (form.dataset.mode === 'register') updatePasswordStrength(form.elements.password);
    const valid = inputs.every((input) => input.validity.valid);
    if (!valid) {
      inputs.forEach((input) => updateAuthField(input, true));
      form.querySelector(':invalid')?.focus({ preventScroll: false });
    }
    return valid;
  }

  function authErrorMessage(error, mode) {
    const message = error.message || '';
    if (/sudah terdaftar/i.test(message)) return 'Email ini sudah terdaftar. Coba masuk dengan akunmu.';
    if (/minimal 10 karakter/i.test(message)) return 'Password harus minimal 10 karakter dan cocok dengan konfirmasi.';
    if (/nomor indonesia|nomor.*tidak valid/i.test(message)) return 'Masukkan nama, email, nomor telepon Indonesia, dan password yang valid.';
    if (/email atau password|email atau username/i.test(message)) return 'Email atau username dan password belum cocok.';
    return mode === 'register' ? 'Pendaftaran belum berhasil. Periksa kembali data dan coba lagi.' : 'Belum berhasil masuk. Periksa email atau username dan password.';
  }

  function navigationItems(admin) {
    const userItems = [['dashboard','home','Dashboard'],['check','check','Periksa informasi'],['history','history','Riwayat pemeriksaan'],['reports','reports','Laporan saya'],['education','education','Edukasi digital'],['profile','user','Profil saya'],['settings','settings','Pengaturan']];
    const adminItems = [['admin','home','Dashboard admin'],['admin-users','users','Pengguna'],['admin-checks','history','Pemeriksaan'],['admin-reports','reports','Laporan masuk'],['admin-db','database','Database reputasi'],['admin-articles','articles','Manajemen artikel'],['admin-settings','settings','Pengaturan sistem']];
    return (admin ? adminItems : userItems).map(([route, ico, label]) => `<a href="#${route}" title="${label}" aria-label="${label}" ${state.route === route ? 'aria-current="page"' : ''}>${icon(ico)}<span class="sidebar-tooltip">${label}</span></a>`).join('');
  }
  function workspaceSections(admin) {
    return admin
      ? [['Overview','admin'],['Activity','admin-checks'],['Manage','admin-users'],['Reports','admin-reports'],['Education','admin-articles'],['Account','admin-settings']]
      : [['Overview','dashboard'],['Activity','history'],['Manage','settings'],['Reports','reports'],['Education','education'],['Account','profile']];
  }
  function sectionIsActive(name, admin) {
    const route = state.route;
    if (name === 'Overview') return route === 'dashboard' || route === 'admin';
    if (name === 'Activity') return ['history','check','admin-checks'].includes(route);
    if (name === 'Manage') return ['settings','admin-users','admin-db'].includes(route);
    if (name === 'Reports') return route === 'reports' || route === 'admin-reports';
    if (name === 'Education') return ['education','admin-articles'].includes(route) || route.startsWith('article/');
    return ['profile','admin-settings'].includes(route);
  }
  function localGreeting() {
    const hour = new Date().getHours();
    return hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 19 ? 'Selamat sore' : 'Selamat malam';
  }
  async function loadNotifications() {
    try {
      const { items, unread } = await api('notifications');
      const badge = document.querySelector('#notification-count');
      const panel = document.querySelector('#notification-content');
      if (badge) { badge.textContent = unread ? String(unread) : ''; badge.hidden = !unread; }
      if (panel) panel.innerHTML = items.length ? `${items.map((item) => `<article class="notification-item ${item.read_at ? '' : 'is-unread'}"><strong>${esc(item.title)}</strong><p>${esc(item.body)}</p><small>${formatDateTime(item.created_at)}</small></article>`).join('')}<button class="button button-quiet button-sm" data-action="mark-notifications-read" ${unread ? '' : 'disabled'}>Tandai semua dibaca</button>` : stateMessage('empty','Belum ada notifikasi','Pembaruan laporan akan muncul di sini.');
    } catch (error) {
      const panel = document.querySelector('#notification-content');
      if (panel) panel.innerHTML = stateMessage('error','Notifikasi tidak tersedia',error.message);
    }
  }
  function renderWorkspace() {
    const admin = state.user.role === 'admin';
    const mainMobile = admin ? [['admin','home','Admin'],['admin-reports','reports','Laporan'],['admin-users','users','Pengguna'],['admin-db','database','Database']] : [['dashboard','home','Beranda'],['check','check','Periksa'],['history','history','Riwayat'],['reports','reports','Laporan']];
    const moreMobile = admin ? [['admin-checks','history','Pemeriksaan'],['admin-articles','articles','Artikel'],['admin-settings','settings','Pengaturan sistem']] : [['education','education','Edukasi digital'],['profile','user','Profil saya'],['settings','settings','Pengaturan']];
    const sections = workspaceSections(admin);
    const otherItems = (admin ? [['check','check','Periksa informasi'],['admin-db','database','Database reputasi']] : [['check','check','Periksa informasi']]);
    const shortcuts = [...moreMobile, ...otherItems].filter((item, index, list) => list.findIndex((entry) => entry[0] === item[0]) === index);
    root.innerHTML = `<div class="workspace"><aside class="sidebar"><div class="sidebar-brand">${brand()}</div><nav class="side-nav" aria-label="Akses cepat ${admin ? 'admin' : 'pengguna'}">${navigationItems(admin)}</nav><div class="sidebar-bottom"><button class="side-rail-profile" type="button" data-action="profile-toggle" title="Akun ${esc(state.user.name)}" aria-label="Buka menu akun"><span class="avatar">${esc(state.user.name.slice(0,1).toUpperCase())}</span></button></div></aside><main class="workspace-main"><header class="topbar"><a class="topbar-brand" href="#${admin ? 'admin' : 'dashboard'}" aria-label="TRUSTIFY, overview">${brand()}</a><nav class="primary-nav" aria-label="Navigasi utama">${sections.map(([name, route]) => `<a href="#${route}" ${sectionIsActive(name, admin) ? 'aria-current="page"' : ''}>${name}</a>`).join('')}</nav><div class="topbar-actions"><form id="global-search-form" class="global-search" role="search"><label class="sr-only" for="global-search">Cari aktivitas</label>${icon('search')}<input id="global-search" type="search" placeholder="Cari aktivitas…" autocomplete="off"><kbd>↵</kbd></form><div class="topbar-popover-wrap"><button class="button button-icon notification-trigger" type="button" data-action="notifications-toggle" aria-label="Notifikasi" aria-expanded="false">${icon('bell')}<span id="notification-count" class="notification-count" hidden></span></button><section class="topbar-popover notification-popover" id="notification-menu" hidden><header><strong>Notifikasi</strong><button class="button button-icon button-sm" data-action="notifications-refresh" aria-label="Muat ulang notifikasi">${icon('refresh')}</button></header><div id="notification-content" class="notification-content">Memuat notifikasi…</div></section></div><button class="button button-icon theme-trigger" type="button" data-action="theme" aria-label="Ganti tema" title="Ganti tema">${icon(document.body.dataset.theme === 'dark' ? 'sun' : 'moon')}</button><div class="topbar-popover-wrap"><button class="profile-trigger" type="button" data-action="profile-toggle" aria-expanded="false"><span class="avatar">${esc(state.user.name.slice(0,1).toUpperCase())}</span><span class="profile-trigger-copy"><strong>${esc(state.user.name)}</strong><small>${admin ? 'Administrator' : 'Akun TRUSTIFY'}</small></span>${icon('chevron','icon-sm')}</button><nav class="topbar-popover profile-popover" id="profile-menu" hidden><a href="#profile">${icon('user')}Profil akun</a><a href="#settings">${icon('settings')}Preferensi</a><button type="button" data-action="logout">${icon('logout')}Keluar</button></nav></div></div></header><div class="workspace-content" id="page-content"><div class="loading-state" role="status">Memuat halaman...</div></div></main></div><nav class="mobile-bar" aria-label="Navigasi cepat">${mainMobile.map(([route, ico, name]) => `<a href="#${route}" ${state.route === route ? 'aria-current="page"' : ''}>${icon(ico)}<span>${name}</span></a>`).join('')}<button type="button" data-action="mobile-more" aria-expanded="false" aria-controls="mobile-more">${icon('menu')}<span>Lainnya</span></button></nav><nav id="mobile-more" class="mobile-more" aria-label="Navigasi lainnya" hidden>${shortcuts.map(([route, ico, name]) => `<a href="#${route}">${icon(ico)}<span>${name}</span></a>`).join('')}<button type="button" data-action="theme">${icon(document.body.dataset.theme === 'dark' ? 'sun' : 'moon')}<span>Ganti tema</span></button><button type="button" data-action="logout">${icon('logout')}<span>Keluar</span></button></nav>`;
    renderPageContent(document.querySelector('#page-content'));
    loadNotifications();
    enhance();
  }

  async function renderPageContent(host) {
    if (!host) return;
    const route = state.route;
    if (route === 'dashboard') return renderDashboard(host);
    if (route === 'check') return renderCheckPage(host);
    if (route === 'history') return renderHistory(host);
    if (route === 'global-search') return renderGlobalSearch(host);
    if (route === 'reports') return renderReports(host);
    if (route === 'education') return renderEducation(host);
    if (route.startsWith('article/')) return renderArticle(host, decodeURIComponent(route.slice(8)));
    if (route === 'profile') return renderProfile(host);
    if (route === 'settings') return renderSettings(host);
    if (route === 'admin') return renderAdminDashboard(host);
    if (route === 'admin-reports') return renderAdminReports(host);
    if (route === 'admin-users') return renderAdminUsers(host);
    if (route === 'admin-checks') return renderAdminChecks(host);
    if (route === 'admin-db') return renderAdminDatabase(host);
    if (route === 'admin-articles') return renderAdminArticles(host);
    if (route === 'admin-settings') return renderAdminSettings(host);
    host.innerHTML = `${pageHead('Halaman tidak ditemukan', 'Pilih salah satu bagian dari navigasi TRUSTIFY.')}<a class="button button-primary" href="#${state.user.role === 'admin' ? 'admin' : 'dashboard'}">Kembali ke dashboard</a>`;
  }

  async function renderDashboard(host) {
    return renderSecurityOverview(host);
    host.innerHTML = `${pageHead(`Selamat datang, ${state.user.name}`, 'Periksa informasi mencurigakan dan pantau aktivitas keamanan Anda.')}<div class="loading-state" role="status">Memuat pemeriksaan dan aktivitas terbaru...</div>`;
    try {
      const [{ summary, reports, recent }, articles] = await Promise.all([api('dashboard'), api('articles')]);
      if (!host.isConnected || state.route !== 'dashboard') return;
      const latest = recent.length ? `<div class="table-wrap"><table class="activity-table"><thead><tr><th>Jenis pemeriksaan</th><th>Informasi</th><th>Risiko</th><th>Waktu</th></tr></thead><tbody>${recent.map((item) => `<tr><td>${esc(typeNames[item.check_type])}</td><td><div class="table-subject">${esc(item.subject)}</div></td><td>${riskBadge(item.risk_status)}</td><td>${formatDate(item.created_at)}</td></tr>`).join('')}</tbody></table></div>` : stateMessage('empty', 'Belum ada pemeriksaan tersimpan', 'Hasil baru muncul di sini setelah Anda menyimpannya.', '<a class="button button-secondary button-sm" href="#check">Mulai pemeriksaan</a>');
      host.innerHTML = `${pageHead(`Selamat datang, ${state.user.name}`, 'Periksa informasi mencurigakan dan pantau aktivitas keamanan Anda.')}<section class="stats-strip" aria-label="Ringkasan akun"><div class="stat-cell"><div>${icon('check','stat-icon')}</div><div><span class="stat-value">${Number(summary.checks_total || 0).toLocaleString('id-ID')}</span><span class="stat-label">Pemeriksaan tersimpan</span></div></div><div class="stat-cell"><div>${icon('reports','stat-icon')}</div><div><span class="stat-value">${Number(reports).toLocaleString('id-ID')}</span><span class="stat-label">Laporan dikirim</span></div></div><div class="stat-cell"><div>${icon('alert','stat-icon')}</div><div><span class="stat-value">${Number(summary.high_total || 0).toLocaleString('id-ID')}</span><span class="stat-label">Risiko tinggi ditemukan</span></div></div><div class="stat-cell"><div>${icon('calendar','stat-icon')}</div><div><span class="stat-value">${recent.length ? formatShortDate(recent[0].created_at) : '—'}</span><span class="stat-label">Pemeriksaan terakhir</span></div></div></section><div class="dashboard-grid"><div><section class="panel quick-check"><div class="panel-head"><div><h2>Mulai pemeriksaan</h2><p>Pilih jenis informasi yang ingin diperiksa.</p></div><a class="text-link" href="#check">Buka semua ${icon('arrow')}</a></div><div class="panel-body"><div class="check-options">${[['message','message','Periksa pesan'],['phone','phone','Periksa nomor'],['bank','bank','Periksa rekening'],['url','url','Periksa tautan']].map(([type, ico, label]) => `<a class="check-option" href="#check" data-check-type="${type}">${icon(ico)}<span>${label}</span></a>`).join('')}</div></div></section><section class="panel" style="margin-top:20px"><div class="panel-head"><div><h2>Aktivitas terbaru</h2><p>Riwayat milik akun Anda.</p></div><a class="text-link" href="#history">Lihat riwayat ${icon('arrow')}</a></div>${latest}</section></div><aside class="panel education-rail"><div class="panel-head"><div><h2>Waspada digital</h2><p>Panduan yang bisa dibaca sekarang.</p></div></div><div class="panel-body">${articles.items.slice(0, 3).map((article) => `<a class="education-link" href="#article/${encodeURIComponent(article.slug)}"><small>${esc(article.category)}</small><strong>${esc(article.title)}</strong></a>`).join('') || stateMessage('empty', 'Belum ada artikel', 'Artikel baru akan tampil di sini.')}</div></aside></div>`;
      enhance();
    } catch (error) {
      host.innerHTML = `${pageHead(`Selamat datang, ${state.user.name}`, 'Periksa informasi mencurigakan dan pantau aktivitas keamanan Anda.')}<div class="error-state">Dashboard gagal dimuat: ${esc(error.message)} <button class="button button-secondary button-sm" data-action="retry">Coba lagi</button></div>`;
    }
  }

  function dashboardEducationMarkup(items) {
    if (!items.length) return stateMessage('empty', 'Belum ada artikel edukasi', 'Panduan akan muncul di sini setelah diterbitkan.', '<a class="button button-secondary button-sm" href="#education">Buka edukasi</a>');
    const [featured, ...related] = items.slice(0, 3);
    return `<article class="dashboard-education-feature"><div class="dashboard-education-art" aria-hidden="true">${icon('shieldAlert')}<span>CATATAN KEAMANAN</span></div><div class="dashboard-education-copy"><span class="article-category">${esc(featured.category)}</span><h3>${esc(featured.title)}</h3><p>${esc(featured.excerpt)}</p><a href="#article/${encodeURIComponent(featured.slug)}">Baca panduan ${icon('arrow')}</a></div></article>${related.length ? `<div class="dashboard-education-related">${related.map((item, index) => `<a class="dashboard-education-item" href="#article/${encodeURIComponent(item.slug)}"><span class="dashboard-education-number">${String(index + 2).padStart(2, '0')}</span><span><small>${esc(item.category)}</small><strong>${esc(item.title)}</strong></span>${icon('arrowUpRight')}</a>`).join('')}</div>` : ''}`;
  }

  function localizeSecurityOverview(host) {
    const pageDescription = host.querySelector('.page-head p');
    if (pageDescription) pageDescription.textContent = 'Pantau keamanan digital dan tinjau aktivitas pemeriksaan akun Anda.';
    const labels = [
      ['.security-overview .eyebrow', 'RINGKASAN KEAMANAN'],
      ['.threat-summary .eyebrow', 'RINGKASAN RISIKO'],
      ['.threat-summary .risk-donut small', 'risiko tinggi'],
      ['.analytics-panel .eyebrow', 'ANALITIK KEAMANAN'],
      ['.analytics-panel h2', 'Aktivitas pemeriksaan'],
      ['.analytics-summary span', 'pemeriksaan tersimpan'],
      ['.risk-monitor .eyebrow', 'PEMANTAUAN RISIKO'],
      ['.risk-monitor .panel-head h2', 'Distribusi hasil'],
      ['.risk-monitor .panel-head p', 'Ringkasan status dari pemeriksaan tersimpan.'],
      ['.recent-activities .eyebrow', 'AKTIVITAS TERBARU'],
      ['.recent-activities .panel-head h2', 'Pemeriksaan terbaru'],
      ['.recent-activities .panel-head p', 'Hasil yang telah disimpan pada akun Anda.'],
    ];
    labels.forEach(([selector, text]) => {
      const element = host.querySelector(selector);
      if (element) element.textContent = text;
    });
    const allActivityLink = host.querySelector('.recent-activities .panel-head a');
    if (allActivityLink?.firstChild) allActivityLink.firstChild.textContent = 'Lihat semua ';
  }

  async function renderSecurityOverview(host) {
    host.innerHTML = '<div class="loading-state" role="status">Memuat ringkasan keamanan...</div>';
    try {
      const [dashboardData, educationData] = await Promise.all([api('dashboard'), api('articles').catch(() => ({ items: [] }))]);
      const { summary, reports, report_counts: reportCounts, risk_counts: riskCounts, type_counts: typeCounts, trend, recent } = dashboardData;
      const educationItems = educationData.items;
      if (!host.isConnected || state.route !== 'dashboard') return;
      state.dashboardTrend = trend;
      const total = Number(summary.checks_total || 0);
      const statuses = ['low', 'medium', 'high', 'unknown'];
      const riskTotal = statuses.reduce((sum, key) => sum + Number(riskCounts[key] || 0), 0);
      const percent = (key) => riskTotal ? Math.round(Number(riskCounts[key] || 0) * 100 / riskTotal) : 0;
      const max = Math.max(1, ...trend.map((item) => Number(item.total)));
      const chart = (period = 'weekly') => {
        const bucketCount = period === 'daily' ? 7 : period === 'weekly' ? 4 : 6;
        const spanDays = period === 'daily' ? 1 : period === 'weekly' ? 7 : 30;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const buckets = Array.from({ length: bucketCount }, (_, index) => {
          const end = new Date(today);
          end.setDate(today.getDate() - (bucketCount - index - 1) * spanDays);
          const start = new Date(end);
          start.setDate(end.getDate() - spanDays + 1);
          const count = trend.filter((item) => {
            const date = new Date(`${String(item.day).slice(0, 10)}T00:00:00`);
            return date >= start && date <= end;
          }).reduce((sum, item) => sum + Number(item.total), 0);
          return { end, count, label: period === 'daily' ? new Intl.DateTimeFormat('id-ID', { weekday: 'short' }).format(end) : period === 'weekly' ? formatShortDate(start.toISOString().slice(0, 10)) : new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(end) };
        });
        const peak = Math.max(1, ...buckets.map((item) => item.count));
        return `<div class="analytics-chart">${buckets.map((item) => `<div class="analytics-column" tabindex="0" title="${esc(formatDate(item.end))}: ${item.count} pemeriksaan"><span class="analytics-tooltip">${item.count} pemeriksaan</span><span class="analytics-bar" style="--bar-height:${Math.max(3, Math.round(item.count / peak * 116))}px"></span><small>${esc(item.label)}</small></div>`).join('')}</div>`;
      };
      const categoryRows = [['message', 'message', 'Pesan'], ['phone', 'phone', 'Nomor telepon'], ['bank', 'bank', 'Rekening bank'], ['url', 'url', 'Tautan URL']].map(([key, ico, label]) => `<a class="overview-category" href="#check" data-check-type="${key}">${icon(ico)}<span>${label}</span><strong>${Number(typeCounts[key] || 0).toLocaleString('id-ID')}</strong>${icon('arrowUpRight', 'icon-sm')}</a>`).join('');
      const riskRows = statuses.map((key) => `<div class="risk-monitor-row">${riskBadge(key)}<span class="risk-meter"><i class="risk-meter-${key}" style="width:${percent(key)}%"></i></span><strong>${Number(riskCounts[key] || 0).toLocaleString('id-ID')}</strong><small>${percent(key)}%</small></div>`).join('');
      const rows = recent.map((item) => `<tr data-risk="${esc(item.risk_status)}"><td><span class="activity-type">${icon(item.check_type)}${esc(typeNames[item.check_type])}</span></td><td><span class="table-subject">${esc(item.subject)}</span></td><td>${riskBadge(item.risk_status)}</td><td>${formatDate(item.created_at)}</td><td><button class="button button-icon button-sm" data-action="history-detail" data-result="${esc(encodeURIComponent(item.result_json))}" aria-label="Detail pemeriksaan">${icon('arrowUpRight')}</button></td></tr>`).join('');
      const riskGradient = riskTotal ? `conic-gradient(var(--low) 0 ${percent('low')}%, var(--medium) ${percent('low')}% ${percent('low') + percent('medium')}%, var(--high) ${percent('low') + percent('medium')}% ${percent('low') + percent('medium') + percent('high')}%, #dce4ec ${percent('low') + percent('medium') + percent('high')}% 100%)` : 'conic-gradient(#dce4ec 0 100%)';
      host.innerHTML = `${pageHead(`${localGreeting()}, ${esc(state.user.name.split(' ')[0])}`, 'Monitor your digital security and stay protected from online threats.', '<a class="button button-primary button-sm" href="#check">'+icon('plus')+'Start new check</a>')}<section class="overview-top-grid"><article class="panel security-overview"><header class="panel-head"><div><span class="eyebrow">SECURITY OVERVIEW</span><h2>Aktivitas keamanan Anda</h2><p>Ringkasan dari pemeriksaan dan laporan akun.</p></div><span class="live-mark">${icon('shield')}Akun aktif</span></header><div class="overview-metrics"><div><span>Total pemeriksaan</span><strong>${total.toLocaleString('id-ID')}</strong></div><div><span>Total laporan</span><strong>${Number(reports).toLocaleString('id-ID')}</strong></div><div><span>Risiko tinggi</span><strong class="metric-risk">${Number(riskCounts.high || 0).toLocaleString('id-ID')}</strong></div><div><span>Laporan terverifikasi</span><strong>${Number(reportCounts.verified || 0).toLocaleString('id-ID')}</strong></div></div><div class="overview-category-list">${categoryRows}</div></article><article class="panel threat-summary"><header class="panel-head"><div><span class="eyebrow">THREAT SUMMARY</span><h2>Ringkasan risiko</h2></div></header><div class="threat-visual"><div class="risk-donut" style="--risk-chart:${riskGradient}"><span><strong>${Number(riskCounts.high || 0)}</strong><small>high risk</small></span></div><div class="threat-key">${statuses.map((key) => `<div><i class="risk-dot risk-dot-${key}"></i><span>${esc(riskNames[key])}</span><strong>${Number(riskCounts[key] || 0)}</strong></div>`).join('')}</div></div><div class="threat-footer"><span>${Number(reportCounts.pending || 0) + Number(reportCounts.reviewing || 0)} menunggu verifikasi</span><a href="#reports">Laporan ${icon('arrow')}</a></div></article><article class="panel analytics-panel"><header class="panel-head"><div><span class="eyebrow">SECURITY ANALYTICS</span><h2>Check activity</h2><p>Data riwayat database akun.</p></div></header><div class="analytics-summary"><strong>${total.toLocaleString('id-ID')}</strong><span>total checks</span></div><div id="dashboard-chart">${chart()}</div><div class="analytics-period"><button data-action="dashboard-period" data-period="daily">7D</button><button class="is-active" data-action="dashboard-period" data-period="weekly" aria-pressed="true">4W</button><button data-action="dashboard-period" data-period="monthly">6M</button></div></article></section><section class="overview-bottom-grid"><article class="panel risk-monitor"><header class="panel-head"><div><span class="eyebrow">RISK MONITORING</span><h2>Distribusi hasil</h2></div><a class="text-link" href="#history">Activity ${icon('arrow')}</a></header><div class="risk-monitor-list">${riskRows}</div><div class="risk-monitor-foot"><span>${Number(reportCounts.pending || 0) + Number(reportCounts.reviewing || 0)} pending verification</span><span>${Number(reportCounts.verified || 0)} verified</span></div></article><article class="panel recent-activities"><header class="panel-head"><div><span class="eyebrow">RECENT ACTIVITIES</span><h2>Pemeriksaan terbaru</h2></div><a class="text-link" href="#history">View all ${icon('arrow')}</a></header><div class="recent-filter-row"><label class="global-search">${icon('search')}<input id="dashboard-activity-search" type="search" placeholder="Cari informasi"></label><select id="dashboard-activity-risk" aria-label="Filter risiko"><option value="">Semua risiko</option>${statuses.map((key) => `<option value="${key}">${esc(riskNames[key])}</option>`).join('')}</select></div>${rows ? `<div class="table-wrap"><table class="activity-table"><thead><tr><th>Type</th><th>Information</th><th>Risk</th><th>Date</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>` : stateMessage('empty','Belum ada aktivitas','Simpan hasil pemeriksaan untuk mengisi daftar ini.', '<a class="button button-secondary button-sm" href="#check">Mulai pemeriksaan</a>')}<div class="dashboard-filter-empty" hidden>Tidak ada aktivitas yang cocok.</div></article></section>`;
      localizeSecurityOverview(host);
      host.insertAdjacentHTML('beforeend', `<section class="dashboard-education"><header class="dashboard-education-head"><div><span class="eyebrow">EDUKASI DIGITAL</span><h2>Bekali diri sebelum berbagi data</h2><p>Panduan ringkas dari artikel TRUSTIFY untuk mengenali taktik penipuan yang umum.</p></div><a class="dashboard-education-all" href="#education">Pusat edukasi ${icon('arrow')}</a></header>${dashboardEducationMarkup(educationItems)}</section>`);
      state.dashboardChart = chart;
      enhance();
    } catch (error) {
      host.innerHTML = `${pageHead('Overview', 'Ringkasan keamanan akun Anda.')}${stateMessage('error', 'Dashboard gagal dimuat', error.message, '<button class="button button-secondary button-sm" data-action="retry">Coba lagi</button>')}`;
    }
  }

  function checkFormMarkup(preview = false) {
    const prompt = state.type === 'message' ? 'Tempel pesan yang ingin diperiksa' : state.type === 'phone' ? 'Nomor telepon Indonesia' : state.type === 'bank' ? 'Nomor rekening' : 'Tautan lengkap, termasuk https://';
    const input = state.type === 'message' ? `<textarea name="subject" required minlength="5" maxlength="2048" placeholder="${prompt}"></textarea>` : `<input name="subject" ${state.type === 'phone' ? 'type="tel" autocomplete="tel" placeholder="0812 3456 7890"' : state.type === 'bank' ? 'inputmode="numeric" placeholder="5–24 digit"' : 'type="url" placeholder="https://contoh.domain"'} required>`;
    const help = state.type === 'message'
      ? 'Analisis dilakukan pada pesan yang Anda masukkan. Hindari memasukkan data rahasia.'
      : state.type === 'phone'
        ? 'Laporan terverifikasi dicari lebih dulu. Pola digit hanyalah sinyal lemah dan tidak mengidentifikasi pemilik nomor.'
        : state.type === 'bank'
          ? 'Laporan dicari berdasarkan bank dan rekening. Pola digit hanya petunjuk format, bukan bukti reputasi penerima.'
          : 'URL tidak dibuka oleh server. Analisis melihat pola domain dan database laporan lokal.';
    return `<label class="field"><span>${prompt}</span>${input}<small class="field-help">${help}</small><span class="field-error" data-error="subject"></span></label>${state.type === 'bank' ? `<label class="field"><span>Nama bank</span><select name="bank" required><option value="">Pilih bank</option>${['Bank Simulasi', 'BCA', 'BRI', 'BNI', 'Mandiri', 'BSI', 'Bank lainnya'].map((name) => `<option>${esc(name)}</option>`).join('')}</select><span class="field-error" data-error="bank"></span></label>` : ''}`;
  }

  function renderCheckPage(host) {
    const tabs = Object.entries(typeNames).map(([type, name]) => `<button type="button" role="tab" aria-selected="${type === state.type}" aria-pressed="${type === state.type}" class="${type === state.type ? 'is-selected' : ''}" data-action="select-type" data-type="${type}">${icon(type)}<span>${esc(name)}</span>${type === state.type ? icon('checkCircle', 'category-selected-mark') : ''}</button>`).join('');
    const result = state.result ? resultMarkup(state.result) : stateMessage('empty', 'Hasil analisis akan muncul di sini', 'Pilih kategori, masukkan informasi, lalu jalankan pemeriksaan. Jika sumber tidak memiliki data, hasil akan ditandai “Belum ada data”.');
    host.innerHTML = `${pageHead('Periksa informasi', 'Jalankan pemeriksaan keamanan pada pesan, nomor telepon, rekening, atau tautan. Tidak ada URL yang dibuka oleh server.')}<div class="check-layout"><section class="panel check-form"><div class="panel-head"><div><span class="eyebrow">NEW CHECK</span><h2>Informasi yang diperiksa</h2><p>Pilih jenis, lalu masukkan data yang ingin ditinjau.</p></div></div><div class="panel-body"><div class="segmented" role="tablist" aria-label="Kategori pemeriksaan">${tabs}</div><div class="category-note" id="category-note">${checkNote(state.type)}</div><form id="check-form" class="check-form" novalidate>${checkFormMarkup()}<div class="form-actions"><button class="button button-primary" type="submit" data-submit-check>${icon('check')}Analisis ${esc(typeNames[state.type])}</button><button class="button button-secondary" type="reset">Bersihkan</button></div><p class="field-help">Pemeriksaan lokal adalah bantuan awal, bukan jaminan keamanan atau pengganti konfirmasi melalui kanal resmi.</p></form></div></section><section class="panel result-panel" id="result-area" aria-live="polite">${result}</section></div>`;
    enhance();
  }
  function checkNote(type) {
    return ({ message: 'Pesan diperiksa terhadap kata kunci hadiah, ancaman, desakan, tautan, dan permintaan data rahasia.', phone: 'Laporan terverifikasi dan pola urutan digit diperiksa terpisah; pola angka bukan bukti penipuan.', bank: 'Kecocokan laporan memakai bank dan rekening; pola digit lokal hanya sinyal format yang lemah.', url: 'Pemeriksaan menilai pola domain dan URL secara lokal. Server tidak melakukan request ke tautan.' })[type];
  }
  function resultMarkup(result) {
    const status = result.status || 'unknown';
    const usesReputation = ['phone', 'bank', 'url'].includes(result.type);
    const hasReputation = !usesReputation || ['verified', 'simulated'].includes(result.reputation_status);
    const scoreStatus = usesReputation && !hasReputation ? (result.heuristic_status || 'unknown') : status;
    const displayTitle = usesReputation && !hasReputation ? 'Belum Ada Data' : riskNames[status];
    const number = result.score === null || result.score === undefined ? '—' : `${result.score}`;
    const progress = result.score == null ? 0 : Math.min(100, Math.max(0, Number(result.score)));
    const scoreLabel = usesReputation && !hasReputation ? 'Skor indikasi pola lokal, dari 100' : 'Skor risiko dari 100';
    const progressBar = `<div class="score-track" role="progressbar" aria-label="${scoreLabel}" aria-valuemin="0" aria-valuemax="100" ${result.score == null ? '' : `aria-valuenow="${progress}"`}><span class="score-fill score-fill-${esc(scoreStatus)}" style="width:${progress}%"></span></div>`;
    const localHint = usesReputation && !hasReputation && result.score !== null ? `<p class="heuristic-hint">Tingkat sinyal pola: <strong>${esc(signalNames[scoreStatus])}</strong>. Ini bukan status reputasi atau bukti penipuan.</p>` : '';
    const dataBadge = result.reputation_status === 'simulated' ? '<span class="simulation-badge">Data simulasi</span>' : usesReputation && !hasReputation ? '<span class="data-status-badge">Belum ada laporan terverifikasi</span>' : '';
    return `<div class="result-top"><div class="score-box ${esc(scoreStatus)}"><strong>${esc(number)}</strong><span>${result.score == null ? 'skor' : 'dari 100'}</span></div><div class="result-summary"><h2>${esc(displayTitle)}</h2><p>${esc(typeNames[result.type] || 'Pemeriksaan')} · ${esc(result.domain || result.subject)}</p>${dataBadge}${localHint}${progressBar}</div></div><section class="breakdown"><h3>Indikator ditemukan</h3>${result.indicators?.length ? `<div class="breakdown-list">${result.indicators.map((item) => `<div class="breakdown-row"><span>${esc(item.label || 'Indikator')}</span><strong>${item.count ? `${esc(item.count)} laporan` : item.weight ? `+${esc(item.weight)}` : ''}</strong></div>`).join('')}</div>` : '<p class="field-help">Tidak ada indikator lokal yang cocok.</p>'}<ul class="result-reasons" style="margin-top:12px">${(result.reasons || []).map((reason) => `<li>${esc(reason)}</li>`).join('')}</ul>${result.method ? `<details class="result-method"><summary>Cara analisis dan batasnya</summary><p>${esc(result.method)}</p></details>` : ''}</section><section class="recommendations"><h3>Langkah berikutnya</h3><ul>${(result.recommendations || []).map((item) => `<li>${esc(item)}</li>`).join('')}</ul></section><div class="result-meta">Sumber: ${esc(result.source || 'Tidak tersedia')}<br>Diperiksa: ${formatDateTime(new Date())}</div><div class="result-actions">${state.user ? button(`${icon('save')}Simpan hasil`, 'save-result', 'button-sm') : '<a class="button button-secondary button-sm" href="#login">Masuk untuk menyimpan</a>'}<button class="button button-secondary button-sm" data-action="share-result">Bagikan hasil</button><button class="button button-secondary button-sm" data-action="report-result">Laporkan informasi</button></div>`;
  }

  async function renderHistory(host) {
    return renderActivityWorkspace(host);
    host.innerHTML = `${pageHead('Riwayat pemeriksaan', 'Hanya hasil yang Anda simpan. Gunakan pencarian dan filter untuk menemukan pemeriksaan.')}<section class="panel"><div class="toolbar"><label class="field"><span>Status</span><select id="admin-report-filter"><option value="">Semua status</option>${Object.entries(reportNames).map(([key,name])=>`<option value="${key}">${name}</option>`).join('')}</select></label><label class="field field-search"><span>Cari target atau pelapor</span><input id="admin-report-search" type="search" placeholder="Ketik untuk mencari"></label></div><div id="admin-report-results" class="loading-state" role="status">Memuat laporan...</div></section>`;
    try {
      const { items } = await api('admin-reports');
      const list = document.querySelector('#admin-report-results');
      if (!host.isConnected || state.route !== 'history' || !list) return;
      list.innerHTML = items.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Jenis</th><th>Target</th><th>Pelapor</th><th>Status</th><th>Bukti</th><th>Diterima</th><th>Tindakan</th></tr></thead><tbody>${items.map((item)=>`<tr><td data-label="Jenis">${esc(typeNames[item.report_type])}</td><td data-label="Target"><div class="table-subject">${esc(item.target)}</div></td><td data-label="Pelapor">${esc(item.reporter_name || 'Akun dihapus')}</td><td data-label="Status">${reportBadge(item.status)}</td><td data-label="Bukti">${Number(item.evidence_count) ? `${item.evidence_count} file` : '—'}</td><td data-label="Diterima">${formatDate(item.created_at)}</td><td data-label="Tindakan"><span class="inline-actions"><button class="button button-secondary button-sm" data-action="report-detail" data-id="${item.id}">Tinjau</button>${item.status !== 'verified' ? `<button class="button button-primary button-sm" data-action="verify-report" data-status="verified" data-id="${item.id}">Verifikasi</button>` : ''}</span></td></tr>`).join('')}</tbody></table></div>` : stateMessage('empty', state.adminReports?.length ? 'Tidak ada laporan yang cocok' : 'Antrean laporan kosong', state.adminReports?.length ? 'Ubah status atau kata kunci pencarian.' : 'Laporan baru akan muncul setelah pengguna mengirimkannya.');
    } catch (error) {
      const list = document.querySelector('#admin-report-results');
      if (list) list.outerHTML = `<div id="admin-report-results">${stateMessage('error', 'Laporan gagal dimuat', error.message, '<button class="button button-secondary button-sm" data-action="retry">Coba lagi</button>')}</div>`;
    }
    enhance();
  }
  function paintUserReports() {
    const node = document.querySelector('#report-list');
    if (!node) return;
    const query = (document.querySelector('#reports-search')?.value || '').toLocaleLowerCase('id');
    const status = document.querySelector('#reports-status-filter')?.value || '';
    const items = (state.userReports || []).filter((item) => (!status || item.status === status) && `${item.target} ${item.report_type}`.toLocaleLowerCase('id').includes(query));
    node.innerHTML = items.length ? `<div class="table-wrap mobile-cards"><table class="data-table"><thead><tr><th>Report ID</th><th>Report type</th><th>Reported information</th><th>Risk level</th><th>Submission date</th><th>Verification status</th><th>Action</th></tr></thead><tbody>${items.map((item)=>`<tr><td data-label="Report ID">#${item.id}</td><td data-label="Report type">${esc(typeNames[item.report_type])}</td><td data-label="Reported information"><div class="table-subject">${esc(item.target)}</div></td><td data-label="Risk level">${reportBadge(item.status)}</td><td data-label="Submission date">${formatDate(item.created_at)}</td><td data-label="Verification status">${reportBadge(item.status)}</td><td data-label="Action"><span class="inline-actions"><button class="button button-secondary button-sm" data-action="report-detail" data-report="${esc(encodeURIComponent(JSON.stringify(item)))}">Detail</button></td></tr>`).join('')}</tbody></table></div>` : stateMessage('empty','Tidak ada laporan yang cocok','Coba kata kunci atau status lain.');
  }
  function reportFormMarkup() {
    const prefill = state.reportPrefill || {};
    return `<section class="panel" style="margin-bottom:16px"><div class="panel-head"><div><h2>Kirim laporan baru</h2><p>Admin akan meninjau informasi sebelum dapat digunakan sebagai sumber reputasi.</p></div><button class="button button-icon" data-action="toggle-report" aria-label="Tutup formulir">${icon('close')}</button></div><form id="report-form" class="panel-body form-grid" enctype="multipart/form-data"><label class="field"><span>Jenis informasi</span><select name="type" required>${[['phone','Nomor telepon'],['bank','Rekening bank'],['url','Tautan URL'],['message','Pesan']].map(([key,name])=>`<option value="${key}" ${prefill.type===key?'selected':''}>${name}</option>`).join('')}</select></label><label class="field" data-report-bank ${prefill.type==='bank'?'':'hidden'}><span>Nama bank</span><select name="bank_name"><option value="">Pilih bank</option>${['Bank Simulasi','BCA','BRI','BNI','Mandiri','BSI','Bank lainnya'].map((name)=>`<option ${prefill.bank===name?'selected':''}>${esc(name)}</option>`).join('')}</select></label><label class="field"><span>Informasi yang dilaporkan</span><input name="target" required maxlength="2048" value="${esc(prefill.subject || '')}" placeholder="Nomor, rekening, URL, atau pesan"></label><label class="field"><span>Nama pihak, jika diketahui</span><input name="target_name" maxlength="190"></label><label class="field"><span>Tanggal kejadian</span><input name="incident_date" type="date" max="${new Date().toISOString().slice(0,10)}"></label><label class="field field-full"><span>Kronologi kejadian</span><textarea name="chronology" required minlength="20" maxlength="5000" placeholder="Jelaskan apa yang terjadi, bagaimana informasi diterima, dan tindakan yang sudah dilakukan."></textarea></label><label class="field field-full"><span>Bukti (opsional, maks. 5 MB)</span><input name="evidence" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"><small class="field-help">Format yang diterima: JPG, PNG, WEBP, PDF. Bukti hanya dapat dilihat pemilik dan admin.</small></label><div class="field-full form-actions"><button class="button button-primary" type="submit">${icon('reports')}Kirim untuk ditinjau</button><button class="button button-secondary" type="button" data-action="toggle-report">Batal</button></div></form></section>`;
  }

  async function renderEducation(host) {
    host.innerHTML = `${pageHead('Education', 'Panduan praktis untuk mengenali ancaman digital dan menjaga informasi pribadi.')}<div class="education-layout"><aside class="education-sidebar"><span class="eyebrow">TOPICS</span><nav class="education-categories" aria-label="Kategori edukasi"><button class="is-active" type="button" data-action="education-category" data-education-category="">Semua topik</button>${categories.map((category)=>`<button type="button" data-action="education-category" data-education-category="${esc(category)}">${esc(category)}</button>`).join('')}</nav><label class="check-field education-popular"><input id="article-popular" type="checkbox">Artikel populer</label></aside><main class="education-main"><form id="education-search-form" class="education-search"><label class="global-search">${icon('search')}<input id="article-search" type="search" placeholder="Cari panduan keamanan"></label><button class="button button-secondary button-sm" type="submit">Cari</button></form><div id="education-results" class="loading-state" role="status">Memuat artikel...</div></main></div>`;
    try {
      const { items } = await api('articles');
      state.articles = items;
      if (!host.isConnected || state.route !== 'education') return;
      paintEducation(items);
    } catch (error) {
      document.querySelector('#education-results').innerHTML = stateMessage('error', 'Artikel tidak tersedia', error.message, '<button class="button button-secondary button-sm" data-action="retry">Coba lagi</button>');
    }
  }
  function paintEducation(items = state.articles || []) {
    const search = (document.querySelector('#article-search')?.value || '').toLocaleLowerCase('id');
    const category = document.querySelector('#article-category')?.value || state.educationCategory || '';
    const popular = document.querySelector('#article-popular')?.checked;
    const filtered = items.filter((item) => (!category || item.category === category) && (!popular || Number(item.is_popular) === 1) && `${item.title} ${item.excerpt} ${item.category}`.toLocaleLowerCase('id').includes(search));
    const result = document.querySelector('#education-results');
    if (!result) return;
    const featured = filtered[0];
    const latest = filtered.slice(1);
    result.innerHTML = featured ? `<section class="featured-article"><div class="featured-article-art" aria-hidden="true">${icon('shieldAlert')}</div><div class="featured-article-copy"><span class="eyebrow">FEATURED GUIDE · ${esc(featured.category)}</span><h2>${esc(featured.title)}</h2><p>${esc(featured.excerpt)}</p><a class="button button-primary button-sm" href="#article/${encodeURIComponent(featured.slug)}">Baca panduan ${icon('arrow')}</a></div></section><header class="latest-articles-head"><div><span class="eyebrow">LIBRARY</span><h2>Latest articles</h2></div><span>${filtered.length} panduan</span></header><div class="latest-articles-grid">${latest.map((item,index)=>`<article class="editorial-article"><span class="editorial-number">${String(index+2).padStart(2,'0')}</span><span class="article-category">${esc(item.category)}</span><h3>${esc(item.title)}</h3><p>${esc(item.excerpt)}</p><a class="text-link" href="#article/${encodeURIComponent(item.slug)}">Baca artikel ${icon('arrow')}</a></article>`).join('')}</div>` : stateMessage('empty', 'Tidak ada artikel yang cocok', 'Ubah kata kunci atau pilih kategori lain.');
    enhance();
  }
  async function renderArticle(host, slug) {
    host.innerHTML = `${pageHead('Artikel edukasi', 'Memuat isi panduan...')}<div class="loading-state" role="status">Memuat artikel...</div>`;
    try {
      const { item } = await api('article', { query: `slug=${encodeURIComponent(slug)}` });
      host.innerHTML = `${pageHead(item.category, 'Panduan keamanan digital.', '<a class="button button-secondary button-sm" href="#education">Kembali ke edukasi</a>')}<article class="article-reading"><h1>${esc(item.title)}</h1><p class="article-excerpt">${esc(item.excerpt)}</p><p>${esc(item.body).replace(/\n/g, '<br>')}</p><p class="field-help">Diterbitkan ${formatDate(item.published_at)}. Konfirmasi selalu melalui kanal resmi.</p></article>`;
    } catch (error) {
      host.innerHTML = `${pageHead('Artikel tidak ditemukan', error.message, '<a class="button button-secondary button-sm" href="#education">Kembali ke edukasi</a>')}`;
    }
  }

  async function renderProfile(host) {
    host.innerHTML = `${pageHead('Profil saya', 'Perbarui informasi kontak dan kredensial akun.')}${stateMessage('loading','Memuat profil','Mengambil informasi akun Anda.')}`;
    try {
      const { profile } = await api('profile');
      host.innerHTML = `${pageHead('Account', 'Kelola informasi pribadi, kredensial, dan keamanan akun.')}<div class="account-layout"><aside class="panel account-identity"><div class="account-avatar">${esc(profile.name.slice(0,1).toUpperCase())}</div><h2>${esc(profile.name)}</h2><p>${esc(profile.email)}</p><span class="status-badge status-verified">Akun aktif</span><div class="account-identity-meta"><span>${icon('phone')}${esc(profile.phone || 'Nomor belum ditambahkan')}</span><span>${icon('calendar')}Anggota TRUSTIFY</span></div></aside><div class="account-forms"><section class="panel"><header class="panel-head"><div><span class="eyebrow">PERSONAL INFORMATION</span><h2>Informasi pribadi</h2></div></header><form id="profile-form" class="panel-body form-grid"><label class="field"><span>Nama lengkap</span><input name="name" required minlength="2" maxlength="120" value="${esc(profile.name)}"></label><label class="field"><span>Email</span><input value="${esc(profile.email)}" readonly><small class="field-help">Email belum dapat diubah dari aplikasi.</small></label><label class="field"><span>Nomor telepon</span><input name="phone" type="tel" required value="${esc(profile.phone)}" placeholder="0812 3456 7890"></label><div class="field-full form-actions"><button class="button button-primary" type="submit">${icon('save')}Simpan perubahan</button></div><div class="form-message field-full" aria-live="polite"></div></form></section><section class="panel"><header class="panel-head"><div><span class="eyebrow">ACCOUNT SECURITY</span><h2>Change password</h2></div><a class="text-link" href="#settings">Preferensi keamanan ${icon('arrow')}</a></header><form id="password-form" class="panel-body password-form-grid">${passwordField('current_password', 'Password saat ini', 'current-password')}${passwordField('new_password', 'Password baru', 'new-password', 10)}<small class="field-help">Password baru minimal 10 karakter.</small><button class="button button-secondary" type="submit">${icon('shield')}Perbarui password</button><div class="form-message" aria-live="polite"></div></form></section><section class="panel account-preferences"><header class="panel-head"><div><span class="eyebrow">PRIVACY & NOTIFICATIONS</span><h2>Preferensi akun</h2></div></header><div class="panel-body"><p>Kelola notifikasi keamanan dan preferensi tampilan dari pengaturan.</p><a class="button button-secondary button-sm" href="#settings">Buka Manage security ${icon('arrow')}</a></div></section></div></div>`;
      enhance();
    } catch (error) { host.innerHTML = `${pageHead('Profil saya','Pengaturan akun.')}${stateMessage('error','Profil gagal dimuat',error.message,'<button class="button button-secondary button-sm" data-action="retry">Coba lagi</button>')}`;
    }
  }
  async function renderSettings(host) {
    host.innerHTML = `${pageHead('Manage security', 'Kelola notifikasi keamanan dan preferensi tampilan Anda.')}<div class="loading-state" role="status">Memuat preferensi keamanan...</div>`;
    try {
      const { preferences } = await api('user-preferences');
      if (!host.isConnected || state.route !== 'settings') return;
      const options = [['email_notifications','Email notifications','Notifikasi keamanan melalui email bila layanan email tersedia.'],['security_alerts','Security alerts','Pemberitahuan saat ada pembaruan keamanan akun.'],['login_notifications','Login notifications','Notifikasi untuk aktivitas masuk yang tercatat.'],['suspicious_activity_alerts','Suspicious activity alerts','Pemberitahuan aktivitas yang perlu ditinjau.']];
      host.innerHTML = `${pageHead('Manage security', 'Kelola notifikasi keamanan dan preferensi tampilan Anda.')}<div class="manage-grid"><section class="panel"><header class="panel-head"><div><h2>Profil keamanan</h2><p>Status dan informasi akun Anda.</p></div></header><div class="panel-body"><div class="security-profile-card"><span class="avatar avatar-large">${esc(state.user.name.slice(0,1).toUpperCase())}</span><div><h3>${esc(state.user.name)}</h3><p>${esc(state.user.email)}</p></div></div><div class="security-facts"><div><span>Email verification</span><strong>Belum tersedia</strong></div><div><span>Password security</span><strong class="security-status-good">${icon('checkCircle')}Password terlindungi</strong></div><div><span>Login activity</span><strong>Pencatatan tidak aktif</strong></div><div><span>Account protection</span><strong class="security-status-good">${icon('shield')}Perlindungan dasar aktif</strong></div></div><a class="button button-secondary button-sm" href="#profile">Kelola informasi akun ${icon('arrow')}</a></div></section><section class="panel"><header class="panel-head"><div><h2>Preferensi notifikasi</h2><p>Pengaturan tersimpan pada akun Anda.</p></div></header><form id="preferences-form" class="panel-body"><div class="preference-list">${options.map(([name,title,description])=>`<label class="preference-row"><span><strong>${title}</strong><small>${description}</small></span><input type="checkbox" name="${name}" role="switch" ${Number(preferences[name])?'checked':''}><span class="switch-ui" aria-hidden="true"></span></label>`).join('')}</div><div class="form-message" aria-live="polite"></div><button class="button button-primary" type="submit">${icon('save')}Simpan perubahan</button></form></section><section class="panel"><header class="panel-head"><div><h2>Tampilan</h2><p>Pengaturan tema dan tampilan aplikasi.</p></div></header><div class="panel-body"><div class="segmented theme-segmented"><button data-action="set-theme" data-theme="light" aria-pressed="${document.body.dataset.theme !== 'dark'}">${icon('sun')}Terang</button><button data-action="set-theme" data-theme="dark" aria-pressed="${document.body.dataset.theme === 'dark'}">${icon('moon')}Gelap</button></div></div></section><section class="panel"><header class="panel-head"><div><h2>Sesi akun</h2><p>Kelola aktivitas masuk dan keamanan sesi.</p></div></header><div class="panel-body"><button class="button button-secondary" data-action="logout">${icon('logout')}Keluar dari TRUSTIFY</button></div></section></div>`;
    } catch (error) {
      host.innerHTML = `${pageHead('Manage security','Pengaturan keamanan akun.')}${stateMessage('error','Pengaturan gagal dimuat',error.message,'<button class="button button-secondary button-sm" data-action="retry">Coba lagi</button>')}`;
    }
  }

  async function renderAdminDashboard(host) {
    host.innerHTML = `${pageHead('Dashboard admin', 'Pantau antrean verifikasi dan aktivitas yang tercatat di database.')}<div class="loading-state" role="status">Memuat data administrasi...</div>`;
    try {
      const { counts, trend, recent } = await api('admin-overview');
      if (!host.isConnected || state.route !== 'admin') return;
      const today = new Date();
      const days = Array.from({length:7}, (_, index) => {
        const date = new Date(today); date.setDate(today.getDate() - (6 - index));
        const key = date.toISOString().slice(0,10);
        return { key, count: Number(trend.find((item)=>String(item.day).slice(0,10) === key)?.total || 0), label: new Intl.DateTimeFormat('id-ID',{weekday:'short'}).format(date) };
      });
      const peak = Math.max(1, ...days.map((day)=>day.count));
      host.innerHTML = `${pageHead('Dashboard admin', 'Pantau antrean verifikasi dan aktivitas yang tercatat di database.')}<div class="stats-strip"><div class="stat-cell"><div>${icon('users','stat-icon')}</div><div><span class="stat-value">${counts.users}</span><span class="stat-label">Pengguna terdaftar</span></div></div><div class="stat-cell"><div>${icon('check','stat-icon')}</div><div><span class="stat-value">${counts.checks}</span><span class="stat-label">Pemeriksaan tersimpan</span></div></div><div class="stat-cell"><div>${icon('reports','stat-icon')}</div><div><span class="stat-value">${counts.reports}</span><span class="stat-label">Laporan masuk</span></div></div><div class="stat-cell"><div>${icon('alert','stat-icon')}</div><div><span class="stat-value">${counts.pending}</span><span class="stat-label">Menunggu tinjauan</span></div></div></div><div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h2>Pemeriksaan per hari</h2><p>7 hari terakhir, berdasarkan waktu tersimpan di database.</p></div></div>${counts.checks ? `<div class="admin-chart" role="img" aria-label="Pemeriksaan harian, tujuh hari terakhir">${days.map((day)=>`<div class="chart-column"><div class="chart-bar-wrap"><span class="chart-count">${day.count}</span><div class="chart-bar" style="height:${Math.max(2,Math.round(day.count/peak*105))}px"></div></div><span class="chart-day">${esc(day.label)}</span></div>`).join('')}</div>` : stateMessage('empty','Belum ada pemeriksaan tersimpan','Grafik akan tampil saat pengguna menyimpan hasil pemeriksaan.')}</section><section class="panel"><div class="panel-head"><div><h2>Status verifikasi</h2><p>Jumlah dari laporan tersimpan.</p></div></div><div class="panel-body"><div class="breakdown-list"><div class="breakdown-row"><span>Menunggu / ditinjau</span><strong>${counts.pending}</strong></div><div class="breakdown-row"><span>Terverifikasi</span><strong>${counts.verified}</strong></div><div class="breakdown-row"><span>Seluruh laporan</span><strong>${counts.reports}</strong></div></div><p class="field-help" style="margin-top:14px">Record simulasi selalu diberi label dan tidak dicampur dengan laporan nyata.</p><a class="button button-primary button-sm" href="#admin-reports">Buka antrean verifikasi</a></div></section></div><section class="panel" style="margin-top:20px"><div class="panel-head"><div><h2>Laporan terbaru</h2><p>Informasi yang dikirim pengguna.</p></div><a class="text-link" href="#admin-reports">Lihat semua ${icon('arrow')}</a></div>${recent.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Jenis</th><th>Informasi</th><th>Status</th><th>Diterima</th></tr></thead><tbody>${recent.map((item)=>`<tr><td>${esc(typeNames[item.report_type])}</td><td><div class="table-subject">${esc(item.target)}</div></td><td>${reportBadge(item.status)}</td><td>${formatDate(item.created_at)}</td></tr>`).join('')}</tbody></table></div>` : stateMessage('empty','Belum ada laporan masuk','Laporan pengguna akan tercatat di antrean setelah dikirim.')}</section>`;
      enhance();
    } catch (error) {
      host.innerHTML = `${pageHead('Dashboard admin', 'Ringkasan dari database lokal.')}<div class="error-state">${esc(error.message)} <button class="button button-secondary button-sm" data-action="retry">Coba lagi</button></div>`;
    }
  }

  async function renderAdminReports(host) {
    host.innerHTML = `${pageHead('Laporan masuk', 'Tinjau kronologi dan bukti sebelum menambahkan data ke reputasi publik.')}<section class="panel"><div class="toolbar"><label class="field"><span>Status</span><select id="admin-report-filter"><option value="">Semua status</option>${Object.entries(reportNames).map(([key,name])=>`<option value="${key}">${name}</option>`).join('')}</select></label><label class="field field-search"><span>Cari target atau pelapor</span><input id="admin-report-search" type="search" placeholder="Ketik untuk mencari"></label></div><div id="admin-report-results" class="loading-state" role="status">Memuat laporan...</div></section>`;
    try {
      const { items } = await api('admin-reports');
      const list = document.querySelector('#admin-report-results');
      if (!host.isConnected || state.route !== 'admin-reports' || !list) return;
      state.userReports = items;
      const counts = { total: items.length, pending: items.filter((item) => ['pending','reviewing'].includes(item.status)).length, verified: items.filter((item) => item.status === 'verified').length, rejected: items.filter((item) => item.status === 'rejected').length };
      document.querySelector('#report-summary').innerHTML = [['Total reports',counts.total],['Pending',counts.pending],['Verified',counts.verified],['Rejected',counts.rejected]].map(([label,value])=>`<div class="panel report-stat"><span>${label}</span><strong>${value}</strong></div>`).join('');
      paintUserReports();
    } catch (error) {
      const list = document.querySelector('#admin-report-results');
      if (list) list.outerHTML = `<div id="admin-report-results">${stateMessage('error', 'Laporan gagal dimuat', error.message, '<button class="button button-secondary button-sm" data-action="retry">Coba lagi</button>')}</div>`;
    }
    enhance();
  }

  async function renderAdminUsers(host) {
    host.innerHTML = `${pageHead('Manajemen pengguna', 'Akun terdaftar, role, dan status akses.') }<section class="panel"><div id="admin-users-results" class="loading-state" role="status">Memuat akun...</div></section>`;
    try {
      const { items } = await api('admin-users');
      const node = document.querySelector('#admin-users-results');
      if (!host.isConnected || state.route !== 'admin-users' || !node) return;
      node.innerHTML = items.length ? `<div class="table-wrap mobile-cards"><table class="data-table"><thead><tr><th>Nama</th><th>Email</th><th>Telepon</th><th>Peran</th><th>Daftar</th><th>Aksi</th></tr></thead><tbody>${items.map((user)=>`<tr><td data-label="Nama">${esc(user.name)} ${Number(user.is_demo) ? '<span class="simulation-badge">Demo</span>' : ''}</td><td data-label="Email">${esc(user.email)}</td><td data-label="Telepon">${esc(user.phone)}</td><td data-label="Peran">${user.role === 'admin' ? 'Admin' : 'User'}</td><td data-label="Daftar">${formatDate(user.created_at)}</td><td data-label="Aksi">${Number(user.id) === Number(state.user.id) ? 'Akun Anda' : `<span class="inline-actions"><button class="button button-secondary button-sm" data-action="change-user-role" data-id="${user.id}" data-role="${user.role==='admin'?'user':'admin'}">Jadikan ${user.role==='admin'?'user':'admin'}</button><button class="button button-danger button-sm" data-action="disable-user" data-id="${user.id}">Nonaktifkan</button></span>`}</td></tr>`).join('')}</tbody></table></div>` : stateMessage('empty','Belum ada pengguna','Akun pengguna akan muncul setelah registrasi.');
    } catch (error) { document.querySelector('#admin-users-results').innerHTML = stateMessage('error','Data akun gagal dimuat',error.message); }
  }

  async function renderAdminChecks(host) {
    host.innerHTML = `${pageHead('Data pemeriksaan', 'Hasil yang disimpan pengguna. Isi pesan dan data sensitif hanya untuk kebutuhan admin.')}<section class="panel"><div class="toolbar"><label class="global-search">${icon('search')}<input id="admin-check-search" type="search" value="${esc(state.globalQuery || '')}" placeholder="Cari pengguna atau informasi"></label></div><div id="admin-check-results" class="loading-state" role="status">Memuat pemeriksaan...</div></section>`;
    try {
      const { items } = await api('admin-checks');
      const node = document.querySelector('#admin-check-results');
      if (!host.isConnected || state.route !== 'admin-checks' || !node) return;
      state.adminChecks = items;
      paintAdminChecks();
    } catch (error) { document.querySelector('#admin-check-results').innerHTML = stateMessage('error','Pemeriksaan gagal dimuat',error.message); }
  }
  function paintAdminChecks() {
    const node = document.querySelector('#admin-check-results');
    if (!node) return;
    const query = (document.querySelector('#admin-check-search')?.value || state.globalQuery || '').toLocaleLowerCase('id');
    const items = (state.adminChecks || []).filter((item) => `${item.user_name || ''} ${item.check_type} ${item.subject}`.toLocaleLowerCase('id').includes(query));
    node.innerHTML = items.length ? `<div class="table-wrap mobile-cards"><table class="data-table"><thead><tr><th>Pengguna</th><th>Jenis</th><th>Informasi</th><th>Skor</th><th>Status</th><th>Waktu</th></tr></thead><tbody>${items.map((item)=>`<tr><td data-label="Pengguna">${esc(item.user_name || 'Anonim')}</td><td data-label="Jenis">${esc(typeNames[item.check_type])}</td><td data-label="Informasi"><div class="table-subject">${esc(item.subject)}</div>${Number(item.is_demo)?'<span class="simulation-badge">Simulasi</span>':''}</td><td data-label="Skor">${item.score == null ? '—' : `${item.score}/100`}</td><td data-label="Status">${riskBadge(item.risk_status)}</td><td data-label="Waktu">${formatDate(item.created_at)}</td></tr>`).join('')}</tbody></table></div>` : stateMessage('empty','Tidak ada pemeriksaan yang cocok','Coba kata kunci lain.');
  }

  async function renderAdminDatabase(host) {
    const type = state.dbType || 'phone';
    const title = { phone: 'Nomor telepon', bank: 'Rekening bank', url: 'Domain URL' }[type];
    host.innerHTML = `${pageHead('Database reputasi', 'Kelola sumber reputasi yang digunakan pada pemeriksaan. Data simulasi tetap ditandai.', button(`${icon('plus')}Tambah data`, 'add-record', 'button-sm'))}<section class="panel"><div class="toolbar"><label class="field"><span>Jenis data</span><select id="db-type">${[['phone','Nomor telepon'],['bank','Rekening bank'],['url','Domain URL']].map(([key,name])=>`<option value="${key}" ${type===key?'selected':''}>${name}</option>`).join('')}</select></label><p class="field-help">${esc(title)} · laporan terverifikasi dikelola terpisah dari record simulasi.</p></div><div id="admin-db-results" class="loading-state" role="status">Memuat database...</div></section>`;
    try {
      const { items } = await api('admin-records', { query: `type=${type}` });
      state.adminRecords = items;
      if (!host.isConnected || state.route !== 'admin-db') return;
      paintAdminDatabase(type, items);
    } catch (error) { document.querySelector('#admin-db-results').innerHTML = stateMessage('error','Database tidak tersedia',error.message,'<button class="button button-secondary button-sm" data-action="retry">Coba lagi</button>'); }
  }
  function paintAdminDatabase(type, items) {
    const node = document.querySelector('#admin-db-results');
    if (!node) return;
    const columns = type === 'phone' ? [['phone','Nomor'],['category','Kategori']] : type === 'bank' ? [['bank_name','Bank'],['account_number','Rekening'],['category','Kategori']] : [['domain','Domain'],['category','Kategori']];
    node.innerHTML = items.length ? `<div class="table-wrap mobile-cards"><table class="data-table"><thead><tr>${columns.map(([,label])=>`<th>${label}</th>`).join('')}<th>Laporan terverifikasi</th><th>Sumber</th><th>Aksi</th></tr></thead><tbody>${items.map((item)=>`<tr>${columns.map(([key,label])=>`<td data-label="${label}">${esc(item[key])}</td>`).join('')}<td data-label="Laporan terverifikasi">${Number(item.verified_reports)}</td><td data-label="Sumber">${Number(item.is_simulated)?'<span class="simulation-badge">Simulasi</span>':'Terverifikasi'}</td><td data-label="Aksi"><span class="inline-actions"><button class="button button-secondary button-sm" data-action="edit-record" data-record="${esc(encodeURIComponent(JSON.stringify(item)))}">Edit</button><button class="button button-danger button-sm" data-action="delete-record" data-id="${item.id}">Hapus</button></span></td></tr>`).join('')}</tbody></table></div>` : stateMessage('empty','Belum ada record reputasi','Tambahkan data yang sudah diverifikasi atau gunakan data simulasi yang ditandai.',button(`${icon('plus')}Tambah data`,'add-record','button-sm'));
    enhance();
  }

  async function renderAdminSettings(host) {
    host.innerHTML = `${pageHead('Pengaturan sistem', 'Batas dan integrasi aktif untuk pemeriksaan lokal.')}<div class="loading-state" role="status">Memuat konfigurasi...</div>`;
    try {
      const { settings, counts } = await api('admin-settings');
      if (!host.isConnected || state.route !== 'admin-settings') return;
      host.innerHTML = `${pageHead('Pengaturan sistem', 'Batas dan integrasi aktif untuk pemeriksaan lokal.')}<div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h2>Aturan risiko</h2><p>Skor dihitung secara deterministik.</p></div></div><div class="panel-body"><div class="breakdown-list"><div class="breakdown-row"><span>Risiko rendah</span><strong>0–${settings.score_low_max}</strong></div><div class="breakdown-row"><span>Risiko sedang</span><strong>30–${settings.score_medium_max}</strong></div><div class="breakdown-row"><span>Risiko tinggi</span><strong>70–100</strong></div><div class="breakdown-row"><span>Indikator lokal</span><strong>${counts.risk_indicators}</strong></div></div></div></section><section class="panel"><div class="panel-head"><div><h2>Batas permintaan</h2><p>Konfigurasi per sesi pada instalasi lokal ini.</p></div></div><div class="panel-body"><div class="breakdown-list"><div class="breakdown-row"><span>Pemeriksaan</span><strong>${settings.checks_per_minute} per menit</strong></div><div class="breakdown-row"><span>Bukti laporan</span><strong>Maks. ${settings.max_evidence_mb} MB</strong></div><div class="breakdown-row"><span>Record reputasi</span><strong>${counts.reputation_records} total, ${counts.simulated_records} simulasi</strong></div><div class="breakdown-row"><span>Laporan terverifikasi</span><strong>${counts.verified_reports}</strong></div></div></div></section></div><section class="panel" style="margin-top:20px"><div class="panel-head"><div><h2>Layanan eksternal</h2><p>Batas integrasi yang berlaku sekarang.</p></div></div><div class="panel-body"><div class="breakdown-list"><div class="breakdown-row"><span>Permintaan URL dari server</span><strong>${settings.url_fetching ? 'Aktif' : 'Nonaktif'}</strong></div><div class="breakdown-row"><span>API reputasi eksternal</span><strong>${settings.external_reputation_api ? 'Terhubung' : 'Belum dikonfigurasi'}</strong></div><div class="breakdown-row"><span>Email reset password</span><strong>${settings.password_reset_email ? 'Aktif' : 'Belum dikonfigurasi'}</strong></div></div><p class="field-help" style="margin-top:14px">Pemeriksaan URL bersifat lokal dan tidak melakukan request jaringan. Reset password email tidak mengirim pesan sampai mail transport disiapkan.</p></div></section>`;
    } catch (error) {
      host.innerHTML = `${pageHead('Pengaturan sistem', 'Batas dan integrasi aktif.')}<div class="error-state">${esc(error.message)} <button class="button button-secondary button-sm" data-action="retry">Coba lagi</button></div>`;
    }
  }

  async function renderAdminArticles(host) {
    host.innerHTML = `${pageHead('Manajemen artikel', 'Terbitkan panduan edukasi dan perbarui artikel yang tersedia untuk pengguna.', button(`${icon('plus')}Artikel baru`, 'add-article', 'button-sm'))}<section class="panel"><div id="admin-article-results" class="loading-state" role="status">Memuat artikel...</div></section>`;
    try {
      const { items } = await api('articles');
      const node = document.querySelector('#admin-article-results');
      if (!host.isConnected || state.route !== 'admin-articles' || !node) return;
      state.adminArticles = items;
      node.innerHTML = items.length ? `<div class="table-wrap mobile-cards"><table class="data-table"><thead><tr><th>Judul</th><th>Kategori</th><th>Diterbitkan</th><th>Aksi</th></tr></thead><tbody>${items.map((item)=>`<tr><td data-label="Judul">${esc(item.title)}</td><td data-label="Kategori">${esc(item.category)}</td><td data-label="Diterbitkan">${formatDate(item.published_at)}</td><td data-label="Aksi"><span class="inline-actions"><button class="button button-secondary button-sm" data-action="edit-article" data-id="${item.id}">Edit</button><button class="button button-danger button-sm" data-action="delete-article" data-id="${item.id}">Hapus</button></span></td></tr>`).join('')}</tbody></table></div>` : stateMessage('empty','Belum ada artikel','Terbitkan panduan pertama untuk mengisi halaman edukasi.',button(`${icon('plus')}Artikel baru`,'add-article','button-sm'));
    } catch (error) { document.querySelector('#admin-article-results').innerHTML = stateMessage('error','Artikel gagal dimuat',error.message,'<button class="button button-secondary button-sm" data-action="retry">Coba lagi</button>'); }
  }

  function showDialog(title, content, footer = '') {
    closeDialog();
    state.lastFocused = document.activeElement;
    const wrapper = document.createElement('div');
    wrapper.className = 'dialog-backdrop';
    wrapper.setAttribute('role', 'presentation');
    wrapper.innerHTML = `<section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><header class="dialog-header"><h2 id="dialog-title">${esc(title)}</h2><button class="button button-icon" data-action="close-dialog" aria-label="Tutup dialog">${icon('close')}</button></header><div class="dialog-content">${content}</div>${footer ? `<footer class="dialog-footer">${footer}</footer>` : ''}</section>`;
    wrapper.addEventListener('click', (event) => { if (event.target === wrapper) closeDialog(); });
    document.body.append(wrapper);
    enhance();
    wrapper.querySelector('button, input, select, textarea, a')?.focus();
  }
  function closeDialog() {
    document.querySelector('.dialog-backdrop')?.remove();
    state.lastFocused?.focus?.();
  }
  function showVerifyDialog(id, status) {
    const report = state.adminReports?.find((item) => Number(item.id) === Number(id));
    if (!report) return toast('Laporan tidak ditemukan.', true);
    const bankField = report.report_type === 'bank' ? '<label class="field"><span>Nama bank</span><input name="bank_name" required></label>' : '';
    showDialog('Tinjau laporan', `<form id="verify-form"><input type="hidden" name="id" value="${id}"><input type="hidden" name="status" value="${esc(status)}"><p><strong>${esc(typeNames[report.report_type])}:</strong> ${esc(report.target)}</p><p>${esc(report.chronology)}</p>${bankField}<label class="field"><span>Catatan verifikasi</span><textarea name="note" maxlength="2000" placeholder="Alasan keputusan atau sumber verifikasi"></textarea></label><p class="field-help">Hanya laporan berstatus terverifikasi yang menjadi sumber reputasi. Data simulasi tidak diterbitkan sebagai laporan nyata.</p></form>`, '<button class="button button-secondary" type="button" data-action="close-dialog">Batal</button><button class="button button-primary" type="submit" form="verify-form">Simpan keputusan</button>');
  }
  function recordFormMarkup(item = {}, type = state.dbType || 'phone') {
    const inputs = type === 'phone' ? [['phone','Nomor telepon','tel'],['category','Kategori','text']] : type === 'bank' ? [['bank_name','Nama bank','text'],['account_number','Nomor rekening','text'],['category','Kategori','text']] : [['domain','Domain','text'],['category','Kategori','text']];
    return `<form id="record-form"><input type="hidden" name="id" value="${esc(item.id || '')}"><input type="hidden" name="type" value="${type}"><div class="form-grid">${inputs.map(([name,label,inputType])=>`<label class="field"><span>${label}</span><input name="${name}" type="${inputType}" required maxlength="250" value="${esc(item[name] || '')}"></label>`).join('')}<label class="field"><span>Jumlah laporan terverifikasi</span><input name="verified_reports" type="number" min="0" max="100000" value="${esc(item.verified_reports ?? 0)}"></label><label class="field"><span>Catatan</span><input name="notes" maxlength="500" value="${esc(item.notes || '')}"></label><label class="field field-full check-field"><input name="is_simulated" type="checkbox" ${Number(item.is_simulated) ? 'checked' : ''}><span>Tandai sebagai data simulasi</span></label></div></form>`;
  }
  function articleFormMarkup(item = {}) {
    return `<form id="article-form"><input type="hidden" name="id" value="${esc(item.id || '')}"><div class="form-grid"><label class="field field-full"><span>Judul</span><input name="title" required maxlength="190" value="${esc(item.title || '')}"></label><label class="field"><span>Kategori</span><select name="category" required>${categories.map((category)=>`<option ${item.category===category?'selected':''}>${esc(category)}</option>`).join('')}</select></label><label class="field field-full"><span>Ringkasan</span><textarea name="excerpt" required minlength="10" maxlength="500">${esc(item.excerpt || '')}</textarea></label><label class="field field-full"><span>Isi artikel</span><textarea name="body" required minlength="30" maxlength="30000" rows="8">${esc(item.body || '')}</textarea></label></div></form>`;
  }

  async function submitCheck(form, preview = false) {
    const formData = new FormData(form);
    const payload = { type: state.type, subject: String(formData.get('subject') || ''), bank: String(formData.get('bank') || '') };
    const button = form.querySelector('[data-submit-check], button[type="submit"]');
    if (button) { button.disabled = true; button.textContent = 'Menganalisis...'; }
    const resultTarget = preview ? document.querySelector('#preview-response') : document.querySelector('#result-area');
    if (resultTarget) resultTarget.innerHTML = preview ? '<div class="loading-state" role="status">Menganalisis...</div>' : stateMessage('loading', 'Menganalisis informasi', 'Mencocokkan pola lokal dan data laporan yang tersedia.');
    try {
      const data = await api('check', { method: 'POST', body: JSON.stringify(payload) });
      state.result = data.result;
      if (preview) {
        resultTarget.innerHTML = resultMarkup(data.result);
        resultTarget.querySelector('.result-actions')?.remove();
        enhance();
        if (button) { button.disabled = false; button.innerHTML = `${icon('check')}Analisis sekarang`; enhance(); }
      } else {
        render();
      }
    } catch (error) {
      if (resultTarget) resultTarget.innerHTML = stateMessage('error', 'Pemeriksaan tidak berhasil', error.message);
      if (button) { button.disabled = false; button.innerHTML = `${icon('check')}Analisis ${esc(typeNames[state.type])}`; enhance(); }
    }
  }

  async function onSubmit(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const formId = form.getAttribute('id');
    if (formId === 'activity-filter-form') {
      event.preventDefault();
      state.page = 1;
      state.filters = { q: document.querySelector('#history-search')?.value || '', type: document.querySelector('#history-type')?.value || '', risk: document.querySelector('#history-risk')?.value || '' };
      Object.keys(state.filters).forEach((key) => !state.filters[key] && delete state.filters[key]);
      render();
      return;
    }
    if (formId === 'global-search-form') {
      event.preventDefault();
      const query = document.querySelector('#global-search')?.value.trim();
      if (!query) return toast('Masukkan kata kunci pencarian.', true);
      state.filters = { ...state.filters, q: query };
      state.page = 1;
      if (state.user.role === 'admin') {
        state.globalQuery = query;
        navigate('admin-checks');
      } else {
        state.globalQuery = query;
        navigate('global-search');
      }
      return;
    }
    if (formId === 'education-search-form') {
      event.preventDefault();
      paintEducation();
      return;
    }
    if (formId === 'preferences-form') {
      event.preventDefault();
      const payload = Object.fromEntries([...form.querySelectorAll('input[type="checkbox"]')].map((input) => [input.name, input.checked]));
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        const { message } = await api('update-preferences', { method: 'POST', body: JSON.stringify(payload) });
        form.querySelector('.form-message').innerHTML = `<div class="notice">${esc(message)}</div>`;
        toast(message);
      } catch (error) {
        form.querySelector('.form-message').innerHTML = `<div class="error-state">${esc(error.message)}</div>`;
        toast(error.message, true);
      } finally { submit.disabled = false; }
      return;
    }
    if (formId === 'preview-form' || formId === 'check-form') {
      event.preventDefault();
      if (!form.reportValidity()) return;
      return submitCheck(form, formId === 'preview-form');
    }
    if (form.classList.contains('auth-form')) {
      event.preventDefault();
      if (form.inert || !validateAuthForm(form)) return;
      const mode = form.dataset.mode;
      const payload = Object.fromEntries(new FormData(form));
      if (mode === 'login') payload.remember = Boolean(form.elements.remember?.checked);
      const button = form.querySelector('[type="submit"]');
      button.disabled = true;
      button.classList.add('is-loading');
      button.querySelector('.auth-submit-label').textContent = mode === 'register' ? 'Membuat akun...' : 'Memeriksa...';
      form.querySelector('.auth-message').textContent = '';
      try {
        const { user } = await api(mode === 'register' ? 'register' : 'login', { method: 'POST', body: JSON.stringify(payload) });
        state.user = user;
        state.result = null;
        toast(mode === 'register' ? 'Akun dibuat. Selamat datang di TRUSTIFY.' : 'Berhasil masuk.');
        if (state.pendingReport && state.reportPrefill) {
          state.pendingReport = false;
          state.reportForm = true;
          location.hash = '#reports';
        } else {
          location.hash = user.role === 'admin' ? '#admin' : '#dashboard';
        }
      } catch (error) {
        form.querySelector('.auth-message').innerHTML = `<div class="error-state" role="alert">${esc(authErrorMessage(error, mode))}</div>`;
        button.disabled = false;
        button.classList.remove('is-loading');
        button.querySelector('.auth-submit-label').textContent = mode === 'register' ? 'Buat Akun' : 'Masuk';
      }
      return;
    }
    if (formId === 'profile-form') {
      event.preventDefault();
      try {
        const { user, message } = await api('update-profile', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
        state.user = { ...state.user, ...user };
        form.querySelector('.form-message').innerHTML = `<div class="notice">${esc(message)}</div>`;
        toast(message);
      } catch (error) { form.querySelector('.form-message').innerHTML = `<div class="error-state" role="alert">${esc(error.message)}</div>`; }
      return;
    }
    if (formId === 'password-form') {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(form));
      try {
        const { message } = await api('change-password', { method: 'POST', body: JSON.stringify(payload) });
        form.reset();
        form.querySelector('.form-message').innerHTML = `<div class="notice">${esc(message)}</div>`;
        toast(message);
      } catch (error) { form.querySelector('.form-message').innerHTML = `<div class="error-state" role="alert">${esc(error.message)}</div>`; }
      return;
    }
    if (formId === 'report-form') {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const button = form.querySelector('[type="submit"]'); button.disabled = true;
      try {
        await api('submit-report', { method: 'POST', body: new FormData(form) });
        toast('Laporan terkirim dan menunggu verifikasi.');
        state.reportForm = false; state.reportPrefill = null; render();
      } catch (error) { toast(error.message, true); button.disabled = false; }
      return;
    }
    if (formId === 'verify-form') {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(form));
      try { await api('admin-verify', { method: 'POST', body: JSON.stringify(payload) }); closeDialog(); toast('Status laporan diperbarui.'); render(); }
      catch (error) { toast(error.message, true); }
      return;
    }
    if (formId === 'record-form') {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(form));
      payload.is_simulated = form.elements.is_simulated.checked;
      try { await api('admin-record-save', { method: 'POST', body: JSON.stringify(payload) }); closeDialog(); toast('Data reputasi tersimpan.'); render(); }
      catch (error) { toast(error.message, true); }
      return;
    }
    if (formId === 'article-form') {
      event.preventDefault();
      try { await api('article-save', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) }); closeDialog(); toast('Artikel tersimpan.'); render(); }
      catch (error) { toast(error.message, true); }
    }
  }
  function renderForgot() {
    root.innerHTML = `<main class="auth-wrap"><aside class="auth-aside">${brand(true)}<div><h1>Pulihkan akses akun.</h1><p>Tautan reset membutuhkan layanan email yang dikonfigurasi untuk instalasi ini.</p></div><a class="footer-links" href="#home">Kembali ke beranda</a></aside><section class="auth-form-wrap"><section class="auth-form"><h2>Reset password</h2><p>Pengiriman email belum diaktifkan pada lingkungan demo lokal. Hubungi administrator TRUSTIFY untuk mengatur ulang akun.</p><div class="notice">Untuk pengujian, gunakan akun demo yang ditampilkan pada halaman masuk. Jangan membagikan password demo di lingkungan produksi.</div><a class="button button-primary" href="#login">Kembali ke masuk</a></section></section></main>`;
  }
  async function renderPublicArticle(slug) {
    root.innerHTML = `<header class="public-nav">${brand()}<nav class="public-links" aria-label="Navigasi utama"><a href="#about">Tentang</a><a href="#features">Fitur</a><a href="#education">Edukasi</a></nav><div class="nav-actions"><a class="nav-text" href="#login">Masuk</a><a class="button button-primary" href="#register">Buat akun</a></div></header><main class="landing"><div id="public-article" class="section-inner article-reading" style="padding:45px 20px">${stateMessage('loading','Memuat artikel','Mengambil artikel dari database edukasi.')}</div></main>`;
    try {
      const { item } = await api('article', { query: `slug=${encodeURIComponent(slug)}` });
      const node = document.querySelector('#public-article');
      if (node) node.innerHTML = `<p class="article-category">${esc(item.category)}</p><h1>${esc(item.title)}</h1><p class="article-excerpt">${esc(item.excerpt)}</p><p>${esc(item.body).replace(/\n/g,'<br>')}</p><p class="field-help">Diterbitkan ${formatDate(item.published_at)}. Konfirmasi selalu melalui kanal resmi.</p><a class="button button-secondary" href="#home#education">Kembali to edukasi</a>`;
    } catch (error) {
      const node = document.querySelector('#public-article');
      if (node) node.innerHTML = stateMessage('error','Artikel tidak tersedia',error.message,'<a class="button button-secondary" href="#home">Kembali ke beranda</a>');
    }
  }

  async function onClick(event) {
    const anchor = event.target.closest('a[href^="#"]');
    const categoryShortcut = event.target.closest('[data-check-type]');
    if (categoryShortcut) state.type = categoryShortcut.dataset.checkType;
    const anchorTarget = anchor ? document.getElementById(anchor.getAttribute('href').slice(1)) : null;
    if (!state.user && anchorTarget && ['home','quick-check','about','how-it-works','features','risk-guide','stats','education'].includes(state.route)) {
      event.preventDefault();
      anchorTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const menu = document.querySelector('#landing-links');
      if (menu?.classList.contains('is-open')) {
        menu.classList.remove('is-open');
        const toggle = document.querySelector('[data-action="landing-menu"]');
        toggle?.setAttribute('aria-expanded', 'false');
        toggle?.setAttribute('aria-label', 'Buka navigasi');
        if (toggle) { toggle.innerHTML = icon('menu'); enhance(); }
      }
      return;
    }
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    if (action === 'auth-switch') {
      setAuthMode(target.dataset.mode);
    } else if (action === 'select-type') {
      const scrollPosition = window.scrollY;
      state.type = target.dataset.type;
      state.result = null;
      render();
      if (state.route === 'home') requestAnimationFrame(() => window.scrollTo({ top: scrollPosition, behavior: 'instant' }));
    } else if (action === 'landing-select-type') {
      state.type = target.dataset.type;
      state.result = null;
      render();
      requestAnimationFrame(() => document.querySelector('#quick-check')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } else if (action === 'landing-menu') {
      const menu = document.querySelector('#landing-links');
      const open = !menu?.classList.contains('is-open');
      menu?.classList.toggle('is-open', Boolean(open));
      target.setAttribute('aria-expanded', String(Boolean(open)));
      target.setAttribute('aria-label', open ? 'Tutup navigasi' : 'Buka navigasi');
      target.innerHTML = icon(open ? 'close' : 'menu');
      enhance();
    } else if (action === 'use-demo-message') {
      const scrollPosition = window.scrollY;
      state.type = 'message';
      render();
      if (state.route === 'home') requestAnimationFrame(() => window.scrollTo({ top: scrollPosition, behavior: 'instant' }));
      const field = document.querySelector('#preview-form [name="subject"]');
      if (field) { field.value = 'Anda menang hadiah. Kirim OTP segera.'; field.focus(); }
    } else if (action === 'retry') {
      render();
    } else if (action === 'theme') {
      const theme = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
      setTheme(theme);
      document.querySelectorAll('[data-action="theme"]').forEach((button) => { button.innerHTML = `${icon(theme === 'dark' ? 'sun' : 'moon')}${button.closest('#mobile-more') ? '<span>Ganti tema</span>' : ''}`; });
      if (state.route === 'settings') render();
    } else if (action === 'set-theme') {
      setTheme(target.dataset.theme);
      render();
    } else if (action === 'mobile-more') {
      const menu = document.querySelector('#mobile-more');
      const open = menu?.hidden;
      if (menu) menu.hidden = !open;
      target.setAttribute('aria-expanded', String(Boolean(open)));
    } else if (action === 'notifications-toggle' || action === 'profile-toggle') {
      const notification = document.querySelector('#notification-menu');
      const profile = document.querySelector('#profile-menu');
      const isNotification = action === 'notifications-toggle';
      const current = isNotification ? notification : profile;
      const other = isNotification ? profile : notification;
      const open = current?.hidden;
      if (current) current.hidden = !open;
      if (other) other.hidden = true;
      document.querySelector('[data-action="notifications-toggle"]')?.setAttribute('aria-expanded', String(Boolean(isNotification && open)));
      document.querySelectorAll('[data-action="profile-toggle"]').forEach((button) => button.setAttribute('aria-expanded', String(Boolean(!isNotification && open))));
      if (isNotification && open) loadNotifications();
    } else if (action === 'notifications-refresh') {
      loadNotifications();
      toast('Notifikasi diperbarui.');
    } else if (action === 'mark-notifications-read') {
      try { await api('notifications-read', { method: 'POST', body: '{}' }); await loadNotifications(); toast('Notifikasi ditandai sudah dibaca.'); }
      catch (error) { toast(error.message, true); }
    } else if (action === 'dashboard-period') {
      const chart = document.querySelector('#dashboard-chart');
      if (chart && state.dashboardChart) chart.innerHTML = state.dashboardChart(target.dataset.period);
      document.querySelectorAll('[data-action="dashboard-period"]').forEach((button) => {
        const active = button.dataset.period === target.dataset.period;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });
    } else if (action === 'dashboard-activity-detail') {
      try { showDialog('Detail pemeriksaan', resultMarkup(JSON.parse(decodeURIComponent(target.dataset.result)))); }
      catch { toast('Detail hasil tidak dapat dibaca.', true); }
    } else if (action === 'activity-select') {
      const item = state.historyItems?.find((row) => String(row.id) === String(target.dataset.id));
      if (!item) return;
      state.selectedHistory = String(item.id);
      document.querySelectorAll('[data-action="activity-select"]').forEach((button) => button.setAttribute('aria-current', String(button.dataset.id === String(item.id))));
      paintActivityDetail(item);
    } else if (action === 'education-category') {
      const category = target.dataset.educationCategory;
      state.educationCategory = category;
      const select = document.querySelector('#article-category');
      if (select) select.value = category;
      document.querySelectorAll('[data-education-category]').forEach((button) => button.classList.toggle('is-active', button.dataset.educationCategory === category));
      paintEducation();
    } else if (action === 'toggle-password') {
      const input = document.getElementById(target.dataset.target);
      if (!input) return;
      const visible = input.type === 'password';
      input.type = visible ? 'text' : 'password';
      target.setAttribute('aria-pressed', String(visible));
      target.setAttribute('aria-label', `${visible ? 'Sembunyikan' : 'Tampilkan'} ${target.dataset.label || 'password'}`);
      target.title = visible ? 'Sembunyikan password' : 'Tampilkan password';
      target.innerHTML = icon(visible ? 'eye-off' : 'eye');
      enhance();
    } else if (action === 'logout') {
      try {
        await api('logout', { method: 'POST', body: '{}' });
        state.user = null; state.result = null; state.reportForm = false;
        const fresh = await api('me'); state.csrf = fresh.csrf;
        location.hash = '#home'; toast('Anda telah keluar.');
      } catch (error) { toast(error.message, true); }
    } else if (action === 'save-result') {
      if (!state.result) return;
      target.disabled = true;
      try { await api('save-check', { method: 'POST', body: JSON.stringify({ result: state.result }) }); toast('Hasil tersimpan di riwayat.'); target.textContent = 'Tersimpan'; }
      catch (error) { toast(error.message, true); target.disabled = false; }
    } else if (action === 'share-result') {
      if (!state.result) return;
      const scoreText = state.result.score == null ? '' : ' (' + state.result.score + '/100)';
      const text = 'TRUSTIFY: ' + (riskNames[state.result.status] || 'Belum ada data') + scoreText + '. ' + (state.result.reasons?.[0] || '') + ' Sumber: ' + (state.result.source || 'Tidak tersedia') + '.';
      try {
        if (navigator.share) await navigator.share({ title: 'Hasil pemeriksaan TRUSTIFY', text });
        else { await navigator.clipboard.writeText(text); toast('Ringkasan hasil disalin.'); }
      } catch (error) { if (error.name !== 'AbortError') toast('Hasil tidak dapat dibagikan dari browser ini.', true); }
    } else if (action === 'report-result') {
      state.reportPrefill = state.result ? { type: state.result.type, subject: state.result.type === 'bank' ? state.result.subject.split(' · ').slice(1).join(' · ') : state.result.subject, bank: state.result.type === 'bank' ? state.result.subject.split(' · ')[0] : '' } : null;
      if (!state.user) {
        state.pendingReport = true;
        location.hash = '#login';
        return;
      }
      state.reportForm = true;
      navigate('reports');
    } else if (action === 'toggle-report') {
      state.reportForm = !state.reportForm;
      state.reportPrefill = null;
      render();
      if (state.reportForm) document.querySelector('#report-form')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } else if (action === 'history-page') {
      state.page = Number(target.dataset.page); render();
    } else if (action === 'apply-history') {
      state.page = 1;
      state.filters = { q: document.querySelector('#history-search')?.value || '', type: document.querySelector('#history-type')?.value || '', risk: document.querySelector('#history-risk')?.value || '', from: document.querySelector('#history-from')?.value || '', to: document.querySelector('#history-to')?.value || '' };
      Object.keys(state.filters).forEach((key)=>!state.filters[key] && delete state.filters[key]); render();
    } else if (action === 'activity-report') {
      const item = state.historyItems?.find((row) => String(row.id) === String(target.dataset.id));
      if (!item) return;
      let result = {};
      try { result = typeof item.result_json === 'string' ? JSON.parse(item.result_json) : item.result_json || {}; } catch {}
      state.reportPrefill = { type: item.check_type, subject: item.subject, bank: result.bank || '' };
      state.reportForm = true;
      navigate('reports');
    } else if (action === 'clear-history') {
      state.filters = {}; state.page = 1; render();
    } else if (action === 'delete-history') {
      if (!window.confirm('Hapus hasil ini dari riwayat akun Anda?')) return;
      try { await api('delete-check', { method: 'POST', body: JSON.stringify({ id: target.dataset.id }) }); toast('Hasil dihapus.'); render(); }
      catch (error) { toast(error.message, true); }
    } else if (action === 'history-detail') {
      try { showDialog('Detail pemeriksaan', resultMarkup(JSON.parse(decodeURIComponent(target.dataset.result)))); }
      catch { toast('Detail hasil tidak dapat dibaca.', true); }
    } else if (action === 'report-detail') {
      const report = JSON.parse(decodeURIComponent(target.dataset.report));
      const evidence = String(report.evidence_ids || '').split(',').filter(Boolean).map((id) => `<a class="text-link" href="api.php?action=evidence&id=${encodeURIComponent(id)}">Unduh bukti ${esc(id)} ${icon('download')}</a>`).join('<br>') || '<p>Tidak ada bukti lampiran.</p>';
      showDialog(`Laporan #${report.id}`, `<div class="breakdown-list"><div class="breakdown-row"><span>Jenis</span><strong>${esc(typeNames[report.report_type])}</strong></div><div class="breakdown-row"><span>Target</span><strong>${esc(report.target)}</strong></div><div class="breakdown-row"><span>Status</span><strong>${esc(reportNames[report.status])}</strong></div><div class="breakdown-row"><span>Dikirim</span><strong>${formatDate(report.created_at)}</strong></div></div><h3>Kronologi</h3><p>${esc(report.chronology)}</p><h3>Bukti</h3>${evidence}${report.verification_note ? `<h3>Catatan admin</h3><p>${esc(report.verification_note)}</p>` : ''}`);
    } else if (action === 'admin-report-detail') {
      const report = state.adminReports?.find((item)=>Number(item.id)===Number(target.dataset.id));
      if (!report) return;
      const evidence = String(report.evidence_ids || '').split(',').filter(Boolean).map((id) => `<a class="text-link" href="api.php?action=evidence&id=${encodeURIComponent(id)}">Unduh bukti ${esc(id)} ${icon('download')}</a>`).join('<br>') || '<p>Tidak ada file bukti.</p>';
      showDialog(`Tinjau laporan #${report.id}`, `<p><strong>${esc(typeNames[report.report_type])}:</strong> ${esc(report.target)}</p><p><strong>Pelapor:</strong> ${esc(report.reporter_name || 'Akun dihapus')} (${esc(report.reporter_email || '—')})</p><p><strong>Tanggal kejadian:</strong> ${formatDate(report.incident_date)}</p><h3>Kronologi</h3><p>${esc(report.chronology)}</p><h3>Bukti</h3>${evidence}<p><strong>Status:</strong> ${esc(reportNames[report.status])}</p>${report.verification_note ? `<p><strong>Catatan:</strong> ${esc(report.verification_note)}</p>` : ''}`, `<button class="button button-secondary" data-action="close-dialog">Tutup</button><button class="button button-primary" data-action="verify-report" data-id="${report.id}" data-status="verified">Verifikasi</button>`);
    } else if (action === 'verify-report') {
      showVerifyDialog(target.dataset.id, target.dataset.status || 'verified');
    } else if (action === 'close-dialog') {
      closeDialog();
    } else if (action === 'add-record') {
      showDialog('Tambah data reputasi', recordFormMarkup());
      document.querySelector('.dialog-footer')?.remove();
      document.querySelector('.dialog-content')?.insertAdjacentHTML('beforeend', '<div class="form-actions" style="margin-top:16px"><button class="button button-primary" type="submit" form="record-form">Simpan data</button></div>');
    } else if (action === 'edit-record') {
      const record = JSON.parse(decodeURIComponent(target.dataset.record));
      showDialog('Edit data reputasi', recordFormMarkup(record));
      document.querySelector('.dialog-content')?.insertAdjacentHTML('beforeend', '<div class="form-actions" style="margin-top:16px"><button class="button button-primary" type="submit" form="record-form">Simpan perubahan</button></div>');
    } else if (action === 'delete-record') {
      if (!window.confirm('Hapus record reputasi ini?')) return;
      try { await api('admin-record-delete', { method: 'POST', body: JSON.stringify({ type: state.dbType || 'phone', id: target.dataset.id }) }); toast('Record dihapus.'); render(); }
      catch (error) { toast(error.message, true); }
    } else if (action === 'add-article') {
      showDialog('Artikel baru', articleFormMarkup());
      document.querySelector('.dialog-content')?.insertAdjacentHTML('beforeend', '<div class="form-actions" style="margin-top:16px"><button class="button button-primary" type="submit" form="article-form">Terbitkan artikel</button></div>');
    } else if (action === 'edit-article') {
      const item = state.adminArticles?.find((article)=>Number(article.id)===Number(target.dataset.id));
      if (!item) return;
      try {
        const { item: full } = await api('article', { query: `slug=${encodeURIComponent(item.slug)}` });
        showDialog('Edit artikel', articleFormMarkup(full));
        document.querySelector('.dialog-content')?.insertAdjacentHTML('beforeend', '<div class="form-actions" style="margin-top:16px"><button class="button button-primary" type="submit" form="article-form">Simpan perubahan</button></div>');
      } catch (error) { toast(error.message, true); }
    } else if (action === 'delete-article') {
      if (!window.confirm('Hapus artikel ini dari halaman edukasi?')) return;
      try { await api('article-delete', { method: 'POST', body: JSON.stringify({ id: target.dataset.id }) }); toast('Artikel dihapus.'); render(); }
      catch (error) { toast(error.message, true); }
    } else if (action === 'change-user-role') {
      const role = target.dataset.role;
      if (!window.confirm(`Ubah peran pengguna menjadi ${role}?`)) return;
      try { await api('admin-user-role', { method: 'POST', body: JSON.stringify({ id: target.dataset.id, role }) }); toast('Peran pengguna diperbarui.'); render(); }
      catch (error) { toast(error.message, true); }
    } else if (action === 'disable-user') {
      if (!window.confirm('Nonaktifkan akun ini? Riwayat dan laporan tetap disimpan untuk audit.')) return;
      try { await api('admin-user-delete', { method: 'POST', body: JSON.stringify({ id: target.dataset.id }) }); toast('Akun dinonaktifkan.'); render(); }
      catch (error) { toast(error.message, true); }
    }
  }

  function setTheme(theme) {
    document.body.dataset.theme = theme;
    localStorage.setItem('trustify-theme', theme);
  }

  document.addEventListener('submit', onSubmit);
  document.addEventListener('click', onClick);
  document.addEventListener('reset', (event) => {
    if (event.target instanceof HTMLFormElement && event.target.getAttribute('id') === 'check-form') {
      event.preventDefault();
      state.result = null;
      render();
    }
  });
  root.addEventListener('input', (event) => {
    if (event.target.form?.classList.contains('auth-form')) {
      const input = event.target;
      updateAuthField(input, input.dataset.touched === 'true');
      if (input.name === 'password' && input.form.dataset.mode === 'register') {
        updatePasswordStrength(input);
        const confirm = input.form.elements.confirm;
        if (confirm.value) updateAuthField(confirm, confirm.dataset.touched === 'true');
      }
    }
    if (event.target.id === 'article-search' || event.target.id === 'admin-report-search') {
      event.target.id === 'article-search' ? paintEducation() : paintAdminReports();
    }
    if (event.target.id === 'reports-search') paintUserReports();
    if (event.target.id === 'admin-check-search') paintAdminChecks();
    if (event.target.id === 'dashboard-activity-search' || event.target.id === 'dashboard-activity-risk') filterDashboardActivities();
  });
  root.addEventListener('change', (event) => {
    if (event.target.id === 'article-category' || event.target.id === 'article-popular') paintEducation();
    if (event.target.id === 'admin-report-filter') paintAdminReports();
    if (event.target.id === 'reports-status-filter') paintUserReports();
    if (event.target.id === 'dashboard-activity-risk') filterDashboardActivities();
    if (event.target.id === 'db-type') { state.dbType = event.target.value; render(); }
    if (event.target.name === 'type' && event.target.form?.getAttribute('id') === 'report-form') {
      const bankField = event.target.form.querySelector('[data-report-bank]');
      const bankSelect = bankField?.querySelector('select');
      if (bankField) bankField.hidden = event.target.value !== 'bank';
      if (bankSelect) bankSelect.required = event.target.value === 'bank';
    }
  });
  document.addEventListener('focusout', (event) => {
    if (event.target instanceof HTMLInputElement && event.target.form?.classList.contains('auth-form')) {
      event.target.dataset.touched = 'true';
      updateAuthField(event.target, true);
    }
  });
  function filterDashboardActivities() {
    const query = (document.querySelector('#dashboard-activity-search')?.value || '').toLocaleLowerCase('id');
    const risk = document.querySelector('#dashboard-activity-risk')?.value || '';
    const rows = [...document.querySelectorAll('.recent-activities tbody tr')];
    let visible = 0;
    rows.forEach((row) => {
      const show = (!risk || row.dataset.risk === risk) && row.textContent.toLocaleLowerCase('id').includes(query);
      row.hidden = !show;
      if (show) visible += 1;
    });
    const empty = document.querySelector('.dashboard-filter-empty');
    if (empty) empty.hidden = visible > 0 || !rows.length;
  }
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.querySelector('.dialog-backdrop')) closeDialog();
    if (event.key === 'Escape') {
      const landingMenu = document.querySelector('#landing-links.is-open');
      if (landingMenu) {
        landingMenu.classList.remove('is-open');
        const toggle = document.querySelector('[data-action="landing-menu"]');
        toggle?.setAttribute('aria-expanded', 'false');
        toggle?.setAttribute('aria-label', 'Buka navigasi');
        if (toggle) { toggle.innerHTML = icon('menu'); enhance(); toggle.focus(); }
      }
      const menu = document.querySelector('#mobile-more');
      if (menu && !menu.hidden) {
        menu.hidden = true;
        document.querySelector('[data-action="mobile-more"]')?.setAttribute('aria-expanded', 'false');
        document.querySelector('[data-action="mobile-more"]')?.focus();
      }
    }
  });
  window.addEventListener('hashchange', () => {
    if (location.hash.startsWith('#home#')) {
      location.hash = '#home';
      requestAnimationFrame(() => document.querySelector('#education')?.scrollIntoView());
      return;
    }
    render();
  });
  window.addEventListener('popstate', () => render());
  const savedTheme = localStorage.getItem('trustify-theme');
  if (savedTheme === 'dark' || savedTheme === 'light') setTheme(savedTheme);
  render();
})();