<?php
declare(strict_types=1);
require __DIR__ . '/app/bootstrap.php';

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');

function api_input(): array
{
    $value = json_decode((string) file_get_contents('php://input'), true);
    return is_array($value) ? $value : $_POST;
}

function value(array $data, string $key, int $max = 2048): string
{
    $entry = $data[$key] ?? '';
    return is_string($entry) ? trim(mb_substr($entry, 0, $max)) : '';
}

function normalize_phone(string $phone): string
{
    $digits = preg_replace('/\D+/', '', $phone) ?? '';
    if (str_starts_with($digits, '0')) {
        $digits = '62' . substr($digits, 1);
    } elseif (str_starts_with($digits, '8')) {
        $digits = '62' . $digits;
    }
    return '+' . $digits;
}

function normalize_account(string $account): string
{
    return preg_replace('/\D+/', '', $account) ?? '';
}

function update_source_status(PDO $pdo, string $provider, string $type, string $status, bool $success, ?string $error = null): void
{
    $statement = $pdo->prepare("INSERT INTO data_sources (provider_name, source_type, connection_status, last_sync_at, last_sync_success, last_error)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
        ON DUPLICATE KEY UPDATE connection_status = VALUES(connection_status), last_sync_at = VALUES(last_sync_at), last_sync_success = VALUES(last_sync_success), last_error = VALUES(last_error)");
    $statement->execute([$provider, $type, $status, $success ? 1 : 0, $success ? null : mb_substr($error ?: 'Sumber tidak dapat diakses.', 0, 500)]);
}

function configured_http_get(PDO $pdo, string $provider, string $envUrl, array $params): array
{
    $baseUrl = trim((string) getenv($envUrl));
    if ($baseUrl === '') {
        update_source_status($pdo, $provider, 'external_api', 'not_configured', false, 'API belum dikonfigurasi');
        return ['available' => false, 'items' => []];
    }
    $separator = str_contains($baseUrl, '?') ? '&' : '?';
    $url = $baseUrl . $separator . http_build_query($params, '', '&', PHP_QUERY_RFC3986);
    $timeout = max(1, min(15, (int) (getenv('TRUSTIFY_EXTERNAL_TIMEOUT') ?: 5)));
    $headers = "Accept: application/json\r\n";
    $apiKey = trim((string) getenv('TRUSTIFY_EXTERNAL_API_KEY'));
    if ($apiKey !== '') $headers .= 'Authorization: Bearer ' . $apiKey . "\r\n";
    $context = stream_context_create(['http' => ['method' => 'GET', 'timeout' => $timeout, 'ignore_errors' => true, 'header' => $headers]]);
    $body = @file_get_contents($url, false, $context);
    if ($body === false) {
        update_source_status($pdo, $provider, 'external_api', 'failed', false, 'Permintaan API gagal atau melebihi batas waktu');
        return ['available' => false, 'items' => []];
    }
    $data = json_decode($body, true);
    if (!is_array($data)) {
        update_source_status($pdo, $provider, 'external_api', 'failed', false, 'Respons API bukan JSON yang valid');
        return ['available' => false, 'items' => []];
    }
    update_source_status($pdo, $provider, 'external_api', 'connected', true);
    $items = $data['items'] ?? $data['data'] ?? $data['results'] ?? [];
    return ['available' => true, 'items' => is_array($items) ? $items : []];
}

function AduanNomorService(PDO $pdo, string $phone): array
{
    return configured_http_get($pdo, 'AduanNomor.id', 'TRUSTIFY_ADUANNOMOR_URL', ['phone' => ltrim($phone, '+')]);
}

function CekRekeningService(PDO $pdo, string $bank, string $account): array
{
    return configured_http_get($pdo, 'CekRekening.id', 'TRUSTIFY_CEKREKENING_URL', ['bank' => $bank, 'account' => $account]);
}

function KredibelService(PDO $pdo, string $subject, string $type): array
{
    $envUrl = $type === 'phone' ? 'TRUSTIFY_KREDIBEL_PHONE_URL' : 'TRUSTIFY_KREDIBEL_BANK_URL';
    $params = $type === 'phone' ? ['phone' => ltrim($subject, '+')] : ['account' => $subject];
    return configured_http_get($pdo, 'Kredibel', $envUrl, $params);
}

function InternalDatabaseService(PDO $pdo, string $type, string $subject, ?string $bank = null): array
{
    if ($type === 'phone') {
        $query = $pdo->prepare("SELECT phone, category, chronology, source_name, source_url, report_date, verification_status, evidence_quality FROM phone_reports WHERE phone = ? AND verification_status IN ('verified','reviewing','pending') ORDER BY verification_status = 'verified' DESC, report_date DESC");
        $query->execute([$subject]);
        $rows = $query->fetchAll();
    } else {
        $query = $pdo->prepare("SELECT bank_name, account_number, category, chronology, source_name, source_url, report_date, verification_status, evidence_quality FROM bank_reports WHERE account_number = ? AND bank_name = ? AND verification_status IN ('verified','reviewing','pending') ORDER BY verification_status = 'verified' DESC, report_date DESC");
        $query->execute([$subject, $bank]);
        $rows = $query->fetchAll();
    }
    return ['available' => true, 'items' => $rows];
}

function risk_status(?int $score): string
{
    return $score === null ? 'unknown' : ($score < 30 ? 'low' : ($score < 70 ? 'medium' : 'high'));
}

function number_pattern_analysis(string $digits, string $kind): array
{
    $rules = [];
    if (preg_match('/(\d)\1{4,}/', $digits)) {
        $rules['repeat'] = ['label' => 'Rangkaian digit yang sama berulang', 'weight' => 16];
    }
    for ($index = 0, $limit = strlen($digits) - 4; $index < $limit; $index++) {
        $slice = substr($digits, $index, 5);
        $ascending = true;
        $descending = true;
        for ($offset = 1; $offset < 5; $offset++) {
            $ascending = $ascending && (int) $slice[$offset] === ((int) $slice[$offset - 1] + 1) % 10;
            $descending = $descending && (int) $slice[$offset] === ((int) $slice[$offset - 1] + 9) % 10;
        }
        if ($ascending || $descending) {
            $rules['sequence'] = ['label' => 'Urutan angka berurutan yang panjang', 'weight' => 12];
            break;
        }
    }
    if (preg_match('/(\d{2})\1{3,}/', $digits)) {
        $rules['alternating'] = ['label' => 'Pasangan digit berulang', 'weight' => 10];
    }
    if ($kind === 'rekening' && strlen($digits) >= 10 && count(array_unique(str_split($digits))) <= 3) {
        $rules['low-diversity'] = ['label' => 'Keragaman digit rekening sangat rendah', 'weight' => 12];
    }

    $indicators = array_values($rules);
    $score = min(29, array_sum(array_column($indicators, 'weight')));
    return [
        'score' => $score,
        'status' => risk_status($score),
        'indicators' => $indicators,
        'reasons' => $indicators
            ? array_map(static fn(array $item): string => $item['label'] . ' ditemukan; pola ini hanya petunjuk format, bukan bukti penipuan.', $indicators)
            : ['Tidak ada pola angka mencolok. Pemeriksaan pola tidak dapat memastikan pemilik atau reputasi nomor/rekening.'],
        'method' => 'Aturan pola digit lokal. Setiap keluarga pola dihitung satu kali; skor dibatasi ke 0–29 karena pola angka saja tidak cukup untuk menyimpulkan risiko penipuan.',
    ];
}

function url_pattern_analysis(string $url, array $parts, string $host): array
{
    $rules = [];
    $hostLabels = explode('.', $host);
    $full = mb_strtolower($host . ' ' . ($parts['path'] ?? '') . ' ' . ($parts['query'] ?? ''));

    if (filter_var($host, FILTER_VALIDATE_IP)) {
        $rules['ip-host'] = ['label' => 'Alamat IP digunakan sebagai host', 'weight' => 30];
    }
    if (str_contains($host, 'xn--')) {
        $rules['idn'] = ['label' => 'Domain memakai encoding internasional yang perlu diperiksa', 'weight' => 24];
    }
    if (preg_match('/(?:login|log-in|verify|verification|account|signin|sign-in|secure)/i', $full)) {
        $rules['credential-language'] = ['label' => 'Kata kunci akses atau verifikasi akun pada URL', 'weight' => 10];
    }
    if (preg_match('/(?:hadiah|claim|klaim|bonus|prize|winner|menang)/i', $full)) {
        $rules['reward-language'] = ['label' => 'Kata kunci hadiah atau klaim pada URL', 'weight' => 14];
    }
    if (preg_match('/\.(?:top|click|work|zip|mov|xyz|gq|tk|ml)$/i', $host)) {
        $rules['uncommon-tld'] = ['label' => 'Akhiran domain yang sering dipakai untuk situs sementara', 'weight' => 14];
    }
    if (strlen($host) > 45 || count($hostLabels) >= 5) {
        $rules['host-shape'] = ['label' => 'Host panjang atau memiliki banyak subdomain', 'weight' => 10];
    }
    if (substr_count($host, '-') >= 3) {
        $rules['hyphens'] = ['label' => 'Host memuat banyak tanda hubung', 'weight' => 8];
    }
    if (strtolower((string) ($parts['scheme'] ?? '')) !== 'https') {
        $rules['http'] = ['label' => 'Koneksi menggunakan HTTP, bukan HTTPS', 'weight' => 8];
    }
    if (preg_match('/(?:^|&)(?:redirect|redirect_url|return|next|continue|url)=/i', (string) ($parts['query'] ?? ''))) {
        $rules['redirect-param'] = ['label' => 'Parameter URL mengarahkan ke alamat lain', 'weight' => 8];
    }

    $brandDomains = [
        'bca' => 'bca.co.id', 'bri' => 'bri.co.id', 'bni' => 'bni.co.id',
        'mandiri' => 'bankmandiri.co.id', 'bsi' => 'bankbsi.co.id',
        'dana' => 'dana.id', 'ovo' => 'ovo.id', 'gopay' => 'gopay.co.id',
    ];
    foreach ($brandDomains as $brand => $officialDomain) {
        if (preg_match('/' . preg_quote($brand, '/') . '/i', $host)
            && $host !== $officialDomain
            && !str_ends_with($host, '.' . $officialDomain)) {
            $rules['brand-lookalike'] = ['label' => 'Nama layanan keuangan muncul di domain yang berbeda dari domain rujukannya', 'weight' => 24];
            break;
        }
    }

    $indicators = array_values($rules);
    $score = min(100, array_sum(array_column($indicators, 'weight')));
    return [
        'score' => $score,
        'status' => risk_status($score),
        'indicators' => $indicators,
        'reasons' => $indicators
            ? array_map(static fn(array $item): string => $item['label'] . '.', $indicators)
            : ['Tidak ada ciri URL yang ditandai aturan lokal. Reputasi situs tetap belum diketahui tanpa data terverifikasi.'],
        'method' => 'Skor heuristik menjumlahkan keluarga ciri URL yang berbeda dan dibatasi ke 100. Ciri seperti kata login, HTTP, atau domain pendek tidak membuktikan penipuan; tidak ada request jaringan yang dilakukan.',
    ];
}

function reputation_assessment(PDO $pdo, string $type, string $subject, ?string $bank = null): array
{
    $items = [];
    $sources = [];
    $internal = InternalDatabaseService($pdo, $type, $subject, $bank);
    foreach ($internal['items'] as $item) $items[] = $item;

    if ($type === 'phone') {
        if (count($internal['items']) === 0) {
            $legacy = $pdo->prepare("SELECT phone, category, verified_reports, is_simulated, notes FROM phone_numbers WHERE phone = ? AND is_simulated = 0 AND verified_reports > 0");
            $legacy->execute([$subject]);
            foreach ($legacy->fetchAll() as $row) {
                $items[] = ['category' => $row['category'], 'chronology' => $row['notes'], 'source_name' => 'Database internal TRUSTIFY', 'source_url' => null, 'report_date' => null, 'verification_status' => 'verified', 'evidence_quality' => 'strong'];
            }
        }
        foreach ([AduanNomorService($pdo, $subject), KredibelService($pdo, $subject, 'phone')] as $adapter) {
            if ($adapter['available']) foreach ($adapter['items'] as $item) if (is_array($item)) $items[] = $item;
        }
    } else {
        $legacy = $pdo->prepare("SELECT bank_name, account_number, category, verified_reports, is_simulated, notes FROM bank_accounts WHERE bank_name = ? AND account_number = ? AND is_simulated = 0 AND verified_reports > 0");
        $legacy->execute([$bank, $subject]);
        foreach ($legacy->fetchAll() as $row) {
            $items[] = ['category' => $row['category'], 'chronology' => $row['notes'], 'source_name' => 'Database internal TRUSTIFY', 'source_url' => null, 'report_date' => null, 'verification_status' => 'verified', 'evidence_quality' => 'strong'];
        }
        foreach ([CekRekeningService($pdo, (string) $bank, $subject), KredibelService($pdo, $subject, 'bank')] as $adapter) {
            if ($adapter['available']) foreach ($adapter['items'] as $item) if (is_array($item)) $items[] = $item;
        }
    }

    foreach ($items as $item) {
        $name = trim((string) ($item['source_name'] ?? $item['source'] ?? 'Sumber tidak disebutkan'));
        if ($name !== '') $sources[$name] = true;
    }

    $verified = 0;
    $pending = 0;
    $strong = 0;
    foreach ($items as $item) {
        $status = (string) ($item['verification_status'] ?? $item['status'] ?? 'pending');
        $quality = (string) ($item['evidence_quality'] ?? $item['quality'] ?? 'weak');
        if ($status === 'verified') $verified++;
        elseif (in_array($status, ['pending', 'reviewing', 'unverified', ''], true)) $pending++;
        if (in_array($quality, ['strong', 'high'], true)) $strong++;
    }

    if ($verified > 0 || $strong >= 2) {
        $assessment = 'TERINDIKASI PENIPUAN'; $risk = 'high';
    } elseif (count($items) > 0 || $pending > 0) {
        $assessment = 'PERLU DIWASPADAI'; $risk = 'medium';
    } else {
        $assessment = 'BELUM DITEMUKAN LAPORAN'; $risk = 'unknown';
    }

    return ['assessment' => $assessment, 'status' => $risk,
        'reputation_status' => $assessment === 'TERINDIKASI PENIPUAN' ? 'verified' : ($assessment === 'PERLU DIWASPADAI' ? 'unverified' : 'unknown'),
        'report_count' => count($items), 'verified_count' => $verified, 'sources' => array_keys($sources), 'items' => $items];
}

function analyze_check(string $type, string $subject, array $data, PDO $pdo): array
{
    $result = ['type' => $type, 'subject' => $subject, 'score' => null, 'status' => 'unknown', 'reputation_status' => 'unknown', 'heuristic_status' => 'unknown', 'method' => '', 'indicators' => [], 'reasons' => [], 'recommendations' => [], 'source' => '', 'simulated' => false];

    if ($type === 'message') {
        if (mb_strlen($subject) < 5) {
            json_response(['error' => 'Masukkan pesan yang ingin diperiksa, minimal 5 karakter.'], 422);
        }
        $score = 0;
        $matches = [];
        $categoryWeights = [];
        $categoryTokens = [];
        foreach ($pdo->query("SELECT token, weight, category FROM risk_indicators WHERE check_type = 'message'") as $rule) {
            if (mb_stripos($subject, $rule['token']) !== false) {
                $weight = (int) $rule['weight'];
                if (!isset($categoryWeights[$rule['category']]) || $weight > $categoryWeights[$rule['category']]) {
                    $categoryWeights[$rule['category']] = $weight;
                    $categoryTokens[$rule['category']] = $rule['token'];
                }
            }
        }
        foreach ($categoryWeights as $category => $weight) {
            $score += $weight;
            $matches[] = ['label' => $category, 'token' => $categoryTokens[$category], 'weight' => $weight];
        }
        $secret = preg_match('/\b(otp|kode|password|kata sandi|pin)\b/iu', $subject);
        $pressure = preg_match('/\b(segera|sekarang|dibatasi|diblokir|24 jam|hari ini)\b/iu', $subject);
        if ($secret && $pressure) {
            $score += 12;
            $matches[] = ['label' => 'tekanan dan permintaan informasi rahasia', 'weight' => 12];
        }
        if (preg_match('~https?://|www\.|\b[a-z0-9-]+\.(?:com|net|org|id|xyz|top)\b~iu', $subject)) {
            $score += 12;
            $matches[] = ['label' => 'tautan dalam pesan', 'weight' => 12];
        }
        $result['score'] = min(100, $score);
        $result['status'] = risk_status($result['score']);
        $result['indicators'] = $matches;
        $result['reasons'] = $matches ? array_values(array_unique(array_map(static fn($item) => 'Terindikasi ' . $item['label'] . '.', $matches))) : ['Aturan lokal tidak menemukan kata kunci yang dikenal. Ini bukan jaminan bahwa pesan aman.'];
        $result['recommendations'] = ['Jangan berikan OTP, PIN, atau kata sandi.', 'Verifikasi permintaan lewat kanal resmi yang Anda buka sendiri.', 'Jangan membuka tautan sebelum memeriksa domainnya.'];
        $result['source'] = 'Aturan lokal TRUSTIFY; bukan keputusan model atau verifikasi eksternal.';
        $result['method'] = 'Aturan pesan menjumlahkan bobot tertinggi per kategori indikator, menambah sinyal untuk desakan bersama permintaan rahasia dan tautan, lalu membatasi skor sampai 100.';
        return $result;
    }

    if ($type === 'phone') {
        $clean = preg_replace('/[\s().-]/', '', $subject) ?? '';
        if (!preg_match('/^(?:\+?62|0)?8[1-9][0-9]{7,11}$/', $clean)) {
            json_response(['error' => 'Format nomor tidak valid. Gunakan nomor seluler Indonesia, misalnya 0812 3456 7890.'], 422);
        }
        $normalized = normalize_phone($subject);
        $assessment = reputation_assessment($pdo, 'phone', $normalized);
        $phoneDigits = preg_replace('/\D+/', '', $normalized) ?? '';
        if (str_starts_with($phoneDigits, '62')) $phoneDigits = substr($phoneDigits, 2);
        $heuristic = number_pattern_analysis($phoneDigits, 'telepon');
        $result['subject'] = $normalized;
        $result['assessment'] = $assessment['assessment'];
        $result['status'] = $assessment['status'];
        $result['reputation_status'] = $assessment['reputation_status'];
        $result['heuristic_status'] = $heuristic['status'];
        $result['score'] = $assessment['status'] === 'unknown' ? $heuristic['score'] : ($assessment['status'] === 'medium' ? 55 : 85);
        $result['report_count'] = $assessment['report_count'];
        $result['verified_count'] = $assessment['verified_count'];
        $result['indicators'] = array_map(static fn($item) => ['label' => (string) ($item['category'] ?? 'Laporan masyarakat'), 'count' => 1, 'date' => $item['report_date'] ?? null, 'chronology' => $item['chronology'] ?? null, 'source' => $item['source_name'] ?? null, 'url' => $item['source_url'] ?? null], $assessment['items']);
        $result['reasons'] = $assessment['assessment'] === 'BELUM DITEMUKAN LAPORAN'
            ? ['Tidak ditemukan kecocokan laporan pada sumber yang berhasil diperiksa. Tidak ada laporan yang dapat dikonfirmasi sebagai bukti penipuan.']
            : (($assessment['assessment'] === 'TERINDIKASI PENIPUAN')
                ? ['Nomor ditemukan dalam laporan yang diverifikasi atau didukung bukti kuat.']
                : ['Nomor memiliki laporan masyarakat, tetapi bukti atau verifikasinya belum cukup kuat untuk menyatakan terbukti.']);
        $result['source'] = $assessment['sources'] ? implode(', ', $assessment['sources']) : 'Database internal TRUSTIFY dan sumber resmi yang dikonfigurasi.';
        $result['method'] = 'Penilaian menggabungkan laporan terverifikasi, kualitas bukti, jumlah laporan, dan kredibilitas sumber. Tidak ada penyataan “pasti aman” saat tidak ada laporan.';
        $result['recommendations'] = ['Jangan mengirim uang atau data pribadi hanya berdasarkan nomor penelepon.', 'Hubungi institusi melalui nomor resmi yang tercantum di situs atau aplikasi resminya.'];
        return $result;
    }

    if ($type === 'bank') {
        $bank = value($data, 'bank', 120);
        $account = normalize_account($subject);
        if ($bank === '' || !preg_match('/^[0-9]{5,24}$/', $account)) {
            json_response(['error' => 'Pilih bank dan masukkan nomor rekening 5–24 digit.'], 422);
        }
        $assessment = reputation_assessment($pdo, 'bank', $account, $bank);
        $heuristic = number_pattern_analysis($account, 'rekening');
        $masked = strlen($account) <= 4 ? str_repeat('*', max(0, strlen($account) - 2)) . substr($account, -2)
            : substr($account, 0, 2) . str_repeat('*', max(2, strlen($account) - 4)) . substr($account, -2);
        $result['subject'] = $bank . ' · ' . $masked;
        $result['bank'] = $bank;
        $result['account_masked'] = $masked;
        $result['assessment'] = $assessment['assessment'];
        $result['status'] = $assessment['status'];
        $result['reputation_status'] = $assessment['reputation_status'];
        $result['heuristic_status'] = $heuristic['status'];
        $result['score'] = $assessment['status'] === 'unknown' ? $heuristic['score'] : ($assessment['status'] === 'medium' ? 55 : 85);
        $result['report_count'] = $assessment['report_count'];
        $result['verified_count'] = $assessment['verified_count'];
        $result['indicators'] = array_map(static fn($item) => ['label' => (string) ($item['category'] ?? 'Laporan masyarakat'), 'count' => 1, 'date' => $item['report_date'] ?? null, 'chronology' => $item['chronology'] ?? null, 'source' => $item['source_name'] ?? null, 'url' => $item['source_url'] ?? null], $assessment['items']);
        $result['reasons'] = $assessment['assessment'] === 'BELUM DITEMUKAN LAPORAN'
            ? ['Tidak ditemukan kecocokan laporan untuk kombinasi bank dan rekening pada sumber yang berhasil diperiksa.']
            : (($assessment['assessment'] === 'TERINDIKASI PENIPUAN')
                ? ['Rekening ditemukan dalam laporan yang diverifikasi atau didukung bukti kuat.']
                : ['Rekening memiliki laporan masyarakat, tetapi bukti atau verifikasinya belum cukup kuat untuk menyatakan terbukti.']);
        $result['source'] = $assessment['sources'] ? implode(', ', $assessment['sources']) : 'Database internal TRUSTIFY dan sumber resmi yang dikonfigurasi.';
        $result['method'] = 'Pencocokan memakai nama bank dan nomor rekening yang dinormalisasi, lalu menilai jumlah, status verifikasi, kualitas bukti, dan kredibilitas sumber.';
        $result['recommendations'] = ['Cocokkan nama penerima pada kanal resmi bank.', 'Hindari transfer sebelum identitas penerima dan tujuan transaksi terverifikasi.'];
        return $result;
    }

    if ($type === 'url') {
        $parts = parse_url($subject);
        if (mb_strlen($subject) > 2048 || filter_var($subject, FILTER_VALIDATE_URL) === false || !$parts || !in_array(strtolower($parts['scheme'] ?? ''), ['http', 'https'], true) || empty($parts['host']) || isset($parts['user']) || isset($parts['pass'])) {
            json_response(['error' => 'Masukkan URL HTTP/HTTPS yang lengkap. URL tidak boleh berisi kredensial.'], 422);
        }
        $host = strtolower(rtrim((string) $parts['host'], '.'));
        $heuristic = url_pattern_analysis($subject, $parts, $host);
        $score = $heuristic['score'];
        $matches = $heuristic['indicators'];
        $query = $pdo->prepare('SELECT category, verified_reports, is_simulated, notes FROM suspicious_urls WHERE domain = ?');
        $query->execute([$host]);
        $record = $query->fetch();
        if ($record && (int) $record['verified_reports'] > 0) {
            $score = max($score, min(100, 30 + (int) $record['verified_reports'] * 10));
            $matches[] = ['label' => $record['category'], 'count' => (int) $record['verified_reports'], 'weight' => null];
            $result['simulated'] = (bool) $record['is_simulated'];
            $result['reputation_status'] = $result['simulated'] ? 'simulated' : 'verified';
            if ($record['notes']) $result['reasons'][] = $record['notes'];
            $result['source'] = $result['simulated'] ? 'Database demonstrasi TRUSTIFY, simulasi dan bukan reputasi nyata.' : 'Database laporan terverifikasi TRUSTIFY.';
            $result['method'] = 'Skor gabungan memakai nilai tertinggi antara pola URL lokal dan jumlah laporan terverifikasi; data simulasi diberi penanda.';
        } else {
            $result['reputation_status'] = 'unknown';
            $result['method'] = $heuristic['method'];
        }
        $result['score'] = min(100, $score);
        $result['heuristic_status'] = risk_status($result['score']);
        $result['status'] = $result['reputation_status'] === 'unknown' ? 'unknown' : risk_status($result['score']);
        $result['indicators'] = $matches;
        $result['reasons'] = array_merge($result['reasons'], $heuristic['reasons']);
        $result['domain'] = $host;
        $result['source'] = $result['source'] ?: 'Analisis karakteristik URL lokal; reputasi eksternal tidak diperiksa.';
        $result['recommendations'] = ['Jangan masukkan kredensial pada halaman dari tautan yang tidak diminta.', 'Buka situs resmi dengan mengetik alamatnya sendiri.', 'URL tidak dibuka atau diakses oleh server TRUSTIFY.'];
        return $result;
    }

    json_response(['error' => 'Jenis pemeriksaan tidak dikenal.'], 422);
}

function require_method_post(): array
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') json_response(['error' => 'Metode tidak diizinkan.'], 405);
    require_csrf();
    return api_input();
}

try {
    $pdo = db();
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $action = $_GET['action'] ?? '';

    if ($method === 'GET') {
        if ($action === 'me') json_response(['user' => current_user(), 'csrf' => $_SESSION['csrf']]);
        if ($action === 'profile') {
            $user = require_user();
            $query = $pdo->prepare('SELECT name, email, phone, role FROM users WHERE id = ? AND deleted_at IS NULL');
            $query->execute([$user['id']]);
            json_response(['profile' => $query->fetch()]);
        }
        if ($action === 'notifications') {
            $user = require_user();
            $query = $pdo->prepare('SELECT id, title, body, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20');
            $query->execute([$user['id']]);
            $items = $query->fetchAll();
            $unread = $pdo->prepare('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read_at IS NULL');
            $unread->execute([$user['id']]);
            json_response(['items' => $items, 'unread' => (int) $unread->fetchColumn()]);
        }
        if ($action === 'user-preferences') {
            $user = require_user();
            $query = $pdo->prepare('SELECT email_notifications, security_alerts, login_notifications, suspicious_activity_alerts FROM user_preferences WHERE user_id = ?');
            $query->execute([$user['id']]);
            $preferences = $query->fetch();
            if (!$preferences) {
                $preferences = ['email_notifications' => 1, 'security_alerts' => 1, 'login_notifications' => 1, 'suspicious_activity_alerts' => 1];
            }
            json_response(['preferences' => $preferences]);
        }
        if ($action === 'stats') {
            json_response(['stats' => [
                'checks' => (int) $pdo->query('SELECT COUNT(*) FROM checks')->fetchColumn(),
                'reports' => (int) $pdo->query('SELECT COUNT(*) FROM reports')->fetchColumn(),
                'indicators' => (int) $pdo->query('SELECT COUNT(*) FROM risk_indicators')->fetchColumn(),
                'users' => (int) $pdo->query('SELECT COUNT(*) FROM users WHERE deleted_at IS NULL')->fetchColumn(),
            ], 'demo_data_present' => true]);
        }
        if ($action === 'dashboard') {
            $user = require_user();
            $query = $pdo->prepare("SELECT COUNT(*) checks_total, COALESCE(SUM(risk_status = 'high'), 0) high_total FROM checks WHERE user_id = ?");
            $query->execute([$user['id']]);
            $summary = $query->fetch();
            $riskQuery = $pdo->prepare('SELECT risk_status, COUNT(*) total FROM checks WHERE user_id = ? GROUP BY risk_status');
            $riskQuery->execute([$user['id']]);
            $riskCounts = ['low' => 0, 'medium' => 0, 'high' => 0, 'unknown' => 0];
            foreach ($riskQuery->fetchAll() as $row) $riskCounts[$row['risk_status']] = (int) $row['total'];
            $typeQuery = $pdo->prepare('SELECT check_type, COUNT(*) total FROM checks WHERE user_id = ? GROUP BY check_type');
            $typeQuery->execute([$user['id']]);
            $typeCounts = ['message' => 0, 'phone' => 0, 'bank' => 0, 'url' => 0];
            foreach ($typeQuery->fetchAll() as $row) $typeCounts[$row['check_type']] = (int) $row['total'];
            $count = $pdo->prepare('SELECT COUNT(*) FROM reports WHERE user_id = ?');
            $count->execute([$user['id']]);
            $reportStatuses = $pdo->prepare("SELECT status, COUNT(*) total FROM reports WHERE user_id = ? GROUP BY status");
            $reportStatuses->execute([$user['id']]);
            $reportCounts = ['pending' => 0, 'reviewing' => 0, 'verified' => 0, 'rejected' => 0];
            foreach ($reportStatuses->fetchAll() as $row) $reportCounts[$row['status']] = (int) $row['total'];
            $trend = $pdo->prepare('SELECT DATE(created_at) day, COUNT(*) total FROM checks WHERE user_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 179 DAY) GROUP BY DATE(created_at) ORDER BY day');
            $trend->execute([$user['id']]);
            $recent = $pdo->prepare('SELECT id, check_type, subject, score, risk_status, created_at, result_json FROM checks WHERE user_id = ? ORDER BY created_at DESC LIMIT 5');
            $recent->execute([$user['id']]);
            json_response(['summary' => $summary, 'reports' => (int) $count->fetchColumn(), 'report_counts' => $reportCounts, 'risk_counts' => $riskCounts, 'type_counts' => $typeCounts, 'trend' => $trend->fetchAll(), 'recent' => $recent->fetchAll()]);
        }
        if ($action === 'history') {
            $user = require_user();
            $page = max(1, (int) ($_GET['page'] ?? 1));
            $filters = ['user_id = ?'];
            $values = [$user['id']];
            if (in_array($_GET['type'] ?? '', ['message', 'phone', 'bank', 'url'], true)) {
                $filters[] = 'check_type = ?';
                $values[] = $_GET['type'];
            }
            if (in_array($_GET['risk'] ?? '', ['low', 'medium', 'high', 'unknown'], true)) {
                $filters[] = 'risk_status = ?';
                $values[] = $_GET['risk'];
            }
            if (!empty($_GET['q'])) {
                $filters[] = 'subject LIKE ?';
                $values[] = '%' . mb_substr((string) $_GET['q'], 0, 80) . '%';
            }
            if (!empty($_GET['from']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $_GET['from'])) {
                $filters[] = 'DATE(created_at) >= ?';
                $values[] = $_GET['from'];
            }
            if (!empty($_GET['to']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $_GET['to'])) {
                $filters[] = 'DATE(created_at) <= ?';
                $values[] = $_GET['to'];
            }
            $where = implode(' AND ', $filters);
            $count = $pdo->prepare("SELECT COUNT(*) FROM checks WHERE {$where}");
            $count->execute($values);
            $total = (int) $count->fetchColumn();
            $offset = ($page - 1) * 10;
            $query = $pdo->prepare("SELECT id, check_type, subject, score, risk_status, created_at, result_json FROM checks WHERE {$where} ORDER BY created_at DESC LIMIT 10 OFFSET {$offset}");
            $query->execute($values);
            json_response(['items' => $query->fetchAll(), 'total' => $total, 'page' => $page, 'pages' => max(1, (int) ceil($total / 10))]);
        }
        if ($action === 'reports') {
            $user = require_user();
            $query = $pdo->prepare('SELECT r.id, r.report_type, r.bank_name, r.target, r.target_name, r.chronology, r.incident_date, r.status, r.verification_note, r.created_at, r.updated_at, (SELECT GROUP_CONCAT(e.id) FROM report_evidence e WHERE e.report_id = r.id) evidence_ids FROM reports r WHERE r.user_id = ? ORDER BY r.created_at DESC');
            $query->execute([$user['id']]);
            json_response(['items' => $query->fetchAll()]);
        }
        if ($action === 'articles') {
            $items = $pdo->query('SELECT id, title, slug, category, excerpt, is_popular, published_at FROM articles ORDER BY published_at DESC')->fetchAll();
            json_response(['items' => $items]);
        }
        if ($action === 'article') {
            $query = $pdo->prepare('SELECT id, title, slug, category, excerpt, body, is_popular, published_at FROM articles WHERE slug = ?');
            $query->execute([value($_GET, 'slug', 210)]);
            $item = $query->fetch();
            $item ? json_response(['item' => $item]) : json_response(['error' => 'Artikel tidak ditemukan.'], 404);
        }
        if ($action === 'admin-overview') {
            require_user(true);
            $counts = [
                'users' => (int) $pdo->query('SELECT COUNT(*) FROM users WHERE deleted_at IS NULL')->fetchColumn(),
                'checks' => (int) $pdo->query('SELECT COUNT(*) FROM checks')->fetchColumn(),
                'reports' => (int) $pdo->query('SELECT COUNT(*) FROM reports')->fetchColumn(),
                'pending' => (int) $pdo->query("SELECT COUNT(*) FROM reports WHERE status IN ('pending','reviewing')")->fetchColumn(),
                'verified' => (int) $pdo->query("SELECT COUNT(*) FROM reports WHERE status = 'verified'")->fetchColumn(),
            ];
            $trend = $pdo->query("SELECT DATE(created_at) day, COUNT(*) total FROM checks WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) GROUP BY DATE(created_at) ORDER BY day")->fetchAll();
            $recent = $pdo->query('SELECT id, report_type, target, status, created_at FROM reports ORDER BY created_at DESC LIMIT 5')->fetchAll();
            json_response(['counts' => $counts, 'trend' => $trend, 'recent' => $recent]);
        }
        if ($action === 'admin-settings') {
            require_user(true);
            $counts = [
                'risk_indicators' => (int) $pdo->query('SELECT COUNT(*) FROM risk_indicators')->fetchColumn(),
                'reputation_records' => (int) $pdo->query('SELECT (SELECT COUNT(*) FROM phone_numbers) + (SELECT COUNT(*) FROM bank_accounts) + (SELECT COUNT(*) FROM suspicious_urls)')->fetchColumn(),
                'simulated_records' => (int) $pdo->query('SELECT (SELECT COUNT(*) FROM phone_numbers WHERE is_simulated = 1) + (SELECT COUNT(*) FROM bank_accounts WHERE is_simulated = 1) + (SELECT COUNT(*) FROM suspicious_urls WHERE is_simulated = 1)')->fetchColumn(),
                'verified_reports' => (int) $pdo->query("SELECT COUNT(*) FROM reports WHERE status = 'verified'")->fetchColumn(),
            ];
            json_response(['settings' => ['score_low_max' => 29, 'score_medium_max' => 69, 'checks_per_minute' => 25, 'max_evidence_mb' => 5, 'external_reputation_api' => false, 'url_fetching' => false, 'password_reset_email' => false], 'counts' => $counts]);
        }
        if ($action === 'admin-reports') {
            require_user(true);
            $items = $pdo->query('SELECT r.*, u.name reporter_name, u.email reporter_email, (SELECT COUNT(*) FROM report_evidence e WHERE e.report_id = r.id) evidence_count, (SELECT GROUP_CONCAT(e.id) FROM report_evidence e WHERE e.report_id = r.id) evidence_ids FROM reports r LEFT JOIN users u ON u.id = r.user_id ORDER BY r.created_at DESC')->fetchAll();
            json_response(['items' => $items]);
        }
        if ($action === 'admin-users') {
            require_user(true);
            json_response(['items' => $pdo->query('SELECT id, name, email, phone, role, is_demo, created_at FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC')->fetchAll()]);
        }
        if ($action === 'admin-checks') {
            require_user(true);
            json_response(['items' => $pdo->query('SELECT c.id, c.user_id, u.name user_name, c.check_type, c.subject, c.score, c.risk_status, c.is_demo, c.created_at FROM checks c LEFT JOIN users u ON u.id = c.user_id ORDER BY c.created_at DESC LIMIT 200')->fetchAll()]);
        }
        if ($action === 'admin-records') {
            require_user(true);
            $config = record_config((string) ($_GET['type'] ?? ''));
            json_response(['items' => $pdo->query('SELECT * FROM ' . $config['table'] . ' ORDER BY id DESC')->fetchAll()]);
        }
        if ($action === 'evidence') {
            $user = current_user();
            $query = $pdo->prepare('SELECT e.*, r.user_id FROM report_evidence e JOIN reports r ON r.id = e.report_id WHERE e.id = ?');
            $query->execute([(int) ($_GET['id'] ?? 0)]);
            $file = $query->fetch();
            if (!$user || !$file || ($user['role'] !== 'admin' && (int) $file['user_id'] !== (int) $user['id'])) {
                http_response_code(404);
                exit;
            }
            $path = UPLOAD_ROOT . DIRECTORY_SEPARATOR . $file['stored_name'];
            if (!is_file($path)) {
                http_response_code(404);
                exit;
            }
            header('Content-Type: ' . $file['mime_type']);
            header('X-Content-Type-Options: nosniff');
            header('Content-Disposition: attachment; filename="' . rawurlencode($file['original_name']) . '"');
            header('Content-Length: ' . filesize($path));
            readfile($path);
            exit;
        }
        json_response(['error' => 'Endpoint tidak ditemukan.'], 404);
    }

    $data = require_method_post();

    if ($action === 'update-profile') {
        $user = require_user();
        $name = value($data, 'name', 120);
        $phone = value($data, 'phone', 32);
        if (mb_strlen($name) < 2 || !preg_match('/^(?:\+?62|0)?8[1-9][0-9]{7,11}$/', preg_replace('/[\s().-]/', '', $phone) ?? '')) {
            json_response(['error' => 'Masukkan nama lengkap dan nomor telepon Indonesia yang valid.'], 422);
        }
        $update = $pdo->prepare('UPDATE users SET name = ?, phone = ? WHERE id = ? AND deleted_at IS NULL');
        $update->execute([$name, normalize_phone($phone), $user['id']]);
        $_SESSION['user']['name'] = $name;
        json_response(['message' => 'Profil diperbarui.', 'user' => $_SESSION['user']]);
    }

    if ($action === 'update-preferences') {
        $user = require_user();
        $keys = ['email_notifications', 'security_alerts', 'login_notifications', 'suspicious_activity_alerts'];
        $values = array_map(static fn(string $key): int => !empty($data[$key]) ? 1 : 0, $keys);
        $statement = $pdo->prepare('INSERT INTO user_preferences (user_id, email_notifications, security_alerts, login_notifications, suspicious_activity_alerts) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE email_notifications = VALUES(email_notifications), security_alerts = VALUES(security_alerts), login_notifications = VALUES(login_notifications), suspicious_activity_alerts = VALUES(suspicious_activity_alerts)');
        $statement->execute([$user['id'], ...$values]);
        json_response(['message' => 'Preferensi keamanan disimpan.']);
    }

    if ($action === 'notifications-read') {
        $user = require_user();
        $statement = $pdo->prepare('UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL');
        $statement->execute([$user['id']]);
        json_response(['message' => 'Notifikasi ditandai sudah dibaca.', 'updated' => $statement->rowCount()]);
    }

    if ($action === 'change-password') {
        $user = require_user();
        $current = $data['current_password'] ?? '';
        $next = $data['new_password'] ?? '';
        $query = $pdo->prepare('SELECT password_hash FROM users WHERE id = ? AND deleted_at IS NULL');
        $query->execute([$user['id']]);
        $hash = $query->fetchColumn();
        if (!is_string($current) || !is_string($next) || !is_string($hash) || !password_verify($current, $hash) || strlen($next) < 10) {
            json_response(['error' => 'Password saat ini tidak sesuai atau password baru kurang dari 10 karakter.'], 422);
        }
        $update = $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
        $update->execute([password_hash($next, PASSWORD_DEFAULT), $user['id']]);
        json_response(['message' => 'Password diperbarui.']);
    }

    if ($action === 'admin-user-role') {
        $admin = require_user(true);
        $id = (int) ($data['id'] ?? 0);
        $role = value($data, 'role', 20);
        if (!in_array($role, ['user', 'admin'], true) || $id === (int) $admin['id']) json_response(['error' => 'Peran tidak valid atau Anda tidak dapat mengubah peran sendiri.'], 422);
        $update = $pdo->prepare('UPDATE users SET role = ? WHERE id = ? AND deleted_at IS NULL');
        $update->execute([$role, $id]);
        admin_log((int) $admin['id'], 'user.role', 'user', $id, ['role' => $role]);
        json_response(['message' => 'Peran pengguna diperbarui.']);
    }

    if ($action === 'admin-user-delete') {
        $admin = require_user(true);
        $id = (int) ($data['id'] ?? 0);
        if ($id === (int) $admin['id']) json_response(['error' => 'Anda tidak dapat menonaktifkan akun sendiri.'], 422);
        $update = $pdo->prepare('UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL');
        $update->execute([$id]);
        admin_log((int) $admin['id'], 'user.disable', 'user', $id);
        json_response(['ok' => $update->rowCount() > 0]);
    }

    if ($action === 'register') {
        $name = value($data, 'name', 120);
        $email = mb_strtolower(value($data, 'email', 190));
        $phone = value($data, 'phone', 32);
        $password = $data['password'] ?? null;
        if (mb_strlen($name) < 2 || !filter_var($email, FILTER_VALIDATE_EMAIL) || !preg_match('/^(?:\+?62|0)?8[1-9][0-9]{7,11}$/', preg_replace('/[\s().-]/', '', $phone) ?? '') || !is_string($password) || strlen($password) < 10 || $password !== ($data['confirm'] ?? null)) {
            json_response(['error' => 'Periksa nama, email, nomor Indonesia, dan password (minimal 10 karakter serta harus cocok).'], 422);
        }
        try {
            $insert = $pdo->prepare('INSERT INTO users (name, email, phone, password_hash) VALUES (?, ?, ?, ?)');
            $insert->execute([$name, $email, normalize_phone($phone), password_hash($password, PASSWORD_DEFAULT)]);
        } catch (PDOException $error) {
            if ($error->getCode() === '23000') json_response(['error' => 'Email tersebut sudah terdaftar.'], 409);
            throw $error;
        }
        session_regenerate_id(true);
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        $_SESSION['user'] = ['id' => (int) $pdo->lastInsertId(), 'name' => $name, 'email' => $email, 'role' => 'user'];
        json_response(['user' => $_SESSION['user'], 'csrf' => $_SESSION['csrf']]);
    }

    if ($action === 'login') {
        $identifier = mb_strtolower(value($data, 'identifier', 190) ?: value($data, 'email', 190));
        $email = match ($identifier) {
            'admin' => 'admin@trustify.test',
            'user' => 'user@trustify.test',
            default => $identifier,
        };
        $password = $data['password'] ?? null;
        $query = $pdo->prepare('SELECT id, name, email, password_hash, role FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1');
        $query->execute([$email]);
        $record = $query->fetch();
        if (!$record || !is_string($password) || !password_verify($password, $record['password_hash'])) {
            json_response(['error' => 'Email atau password tidak sesuai.'], 401);
        }
        session_regenerate_id(true);
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        $_SESSION['user'] = ['id' => (int) $record['id'], 'name' => $record['name'], 'email' => $record['email'], 'role' => $record['role']];
        if (!empty($data['remember'])) {
            setcookie(session_name(), session_id(), ['expires' => time() + 2592000, 'path' => '/', 'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off', 'httponly' => true, 'samesite' => 'Lax']);
        }
        json_response(['user' => $_SESSION['user'], 'csrf' => $_SESSION['csrf']]);
    }

    if ($action === 'logout') {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
        }
        session_destroy();
        json_response(['ok' => true]);
    }

    if ($action === 'check') {
        $times = array_values(array_filter($_SESSION['check_times'] ?? [], static fn($time) => $time > time() - 60));
        if (count($times) >= 25) json_response(['error' => 'Batas pemeriksaan sementara tercapai. Coba lagi dalam satu menit.'], 429);
        $times[] = time();
        $_SESSION['check_times'] = $times;
        $result = analyze_check(value($data, 'type', 20), value($data, 'subject', 2048), $data, $pdo);
        json_response(['result' => $result, 'checked_at' => date(DATE_ATOM)]);
    }

    if ($action === 'save-check') {
        $user = require_user();
        $result = $data['result'] ?? null;
        if (!is_array($result) || !in_array($result['type'] ?? '', ['message', 'phone', 'bank', 'url'], true) || !in_array($result['status'] ?? '', ['low', 'medium', 'high', 'unknown'], true)) {
            json_response(['error' => 'Hasil pemeriksaan tidak valid. Jalankan pemeriksaan kembali.'], 422);
        }
        $score = isset($result['score']) ? min(100, max(0, (int) $result['score'])) : null;
        $insert = $pdo->prepare('INSERT INTO checks (user_id, check_type, subject, score, risk_status, result_json, is_demo) VALUES (?, ?, ?, ?, ?, ?, ?)');
        $insert->execute([$user['id'], $result['type'], mb_substr((string) ($result['subject'] ?? ''), 0, 2048), $score, $result['status'], json_encode($result, JSON_UNESCAPED_UNICODE), !empty($result['simulated']) ? 1 : 0]);
        json_response(['id' => (int) $pdo->lastInsertId(), 'message' => 'Hasil tersimpan di riwayat Anda.']);
    }

    if ($action === 'delete-check') {
        $user = require_user();
        $delete = $pdo->prepare('DELETE FROM checks WHERE id = ? AND user_id = ?');
        $delete->execute([(int) ($data['id'] ?? 0), $user['id']]);
        json_response(['ok' => $delete->rowCount() > 0]);
    }

    if ($action === 'submit-report') {
        $user = require_user();
        $type = value($data, 'type', 20);
        $target = value($data, 'target', 2048);
        $chronology = value($data, 'chronology', 5000);
        $date = value($data, 'incident_date', 10);
        if (!in_array($type, ['phone', 'bank', 'url', 'message'], true) || $target === '' || mb_strlen($chronology) < 20 || ($date !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date))) {
            json_response(['error' => 'Lengkapi jenis, informasi, dan kronologi minimal 20 karakter.'], 422);
        }
        if ($type === 'phone' && !preg_match('/^(?:\+?62|0)?8[1-9][0-9]{7,11}$/', preg_replace('/[\s().-]/', '', $target) ?? '')) {
            json_response(['error' => 'Format nomor Indonesia tidak valid.'], 422);
        }
        if ($type === 'url' && filter_var($target, FILTER_VALIDATE_URL) === false) json_response(['error' => 'URL laporan tidak valid.'], 422);
        if ($type === 'bank' && !preg_match('/^[0-9\s-]{5,32}$/', $target)) json_response(['error' => 'Masukkan nomor rekening yang valid.'], 422);

        $bankName = $type === 'bank' ? value($data, 'bank_name', 120) : null;
        if ($type === 'bank' && !$bankName) json_response(['error' => 'Pilih nama bank untuk laporan rekening.'], 422);
        $normalizedTarget = $type === 'phone' ? normalize_phone($target) : ($type === 'bank' ? normalize_account($target) : $target);
        $duplicate = $pdo->prepare('SELECT id FROM reports WHERE user_id = ? AND report_type = ? AND target = ? AND (? IS NULL OR bank_name = ?) AND status IN (\'pending\',\'reviewing\',\'verified\') LIMIT 1');
        $duplicate->execute([$user['id'], $type, $normalizedTarget, $bankName, $bankName]);
        if ($duplicate->fetch()) json_response(['error' => 'Laporan yang sama sudah pernah dikirim dan belum ditolak.'], 409);
        $insert = $pdo->prepare('INSERT INTO reports (user_id, report_type, bank_name, target, target_name, chronology, incident_date) VALUES (?, ?, ?, ?, ?, ?, ?)');
        $insert->execute([$user['id'], $type, $bankName, $normalizedTarget, value($data, 'target_name', 190) ?: null, $chronology, $date ?: null]);
        $reportId = (int) $pdo->lastInsertId();
        if (!empty($_FILES['evidence']['name'])) {
            $file = $_FILES['evidence'];
            if ($file['error'] !== UPLOAD_ERR_OK || $file['size'] > 5 * 1024 * 1024) json_response(['error' => 'Bukti gagal diunggah atau melebihi batas 5 MB.'], 422);
            $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
            if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'], true)) json_response(['error' => 'Bukti harus berupa JPG, PNG, WEBP, atau PDF.'], 422);
            if (!is_dir(UPLOAD_ROOT) && !mkdir(UPLOAD_ROOT, 0700, true) && !is_dir(UPLOAD_ROOT)) json_response(['error' => 'Penyimpanan bukti belum tersedia.'], 500);
            $stored = bin2hex(random_bytes(24));
            if (!move_uploaded_file($file['tmp_name'], UPLOAD_ROOT . DIRECTORY_SEPARATOR . $stored)) json_response(['error' => 'Bukti tidak dapat disimpan.'], 500);
            $evidence = $pdo->prepare('INSERT INTO report_evidence (report_id, stored_name, original_name, mime_type, file_size) VALUES (?, ?, ?, ?, ?)');
            $evidence->execute([$reportId, $stored, mb_substr(basename((string) $file['name']), 0, 255), $mime, (int) $file['size']]);
        }
        json_response(['id' => $reportId, 'message' => 'Laporan dikirim dan menunggu verifikasi admin.']);
    }

    if ($action === 'admin-verify') {
        $admin = require_user(true);
        $id = (int) ($data['id'] ?? 0);
        $status = value($data, 'status', 20);
        $note = value($data, 'note', 2000);
        if (!in_array($status, ['reviewing', 'verified', 'rejected'], true)) json_response(['error' => 'Status verifikasi tidak valid.'], 422);
        $pdo->beginTransaction();
        $query = $pdo->prepare('SELECT * FROM reports WHERE id = ? FOR UPDATE');
        $query->execute([$id]);
        $report = $query->fetch();
        if (!$report) {
            $pdo->rollBack();
            json_response(['error' => 'Laporan tidak ditemukan.'], 404);
        }
        $update = $pdo->prepare('UPDATE reports SET status = ?, verification_note = ? WHERE id = ?');
        $update->execute([$status, $note ?: null, $id]);
        if ($status === 'verified' && $report['status'] !== 'verified' && !(bool) $report['is_demo']) {
            if ($report['report_type'] === 'phone') {
                $phone = normalize_phone($report['target']);
                $save = $pdo->prepare("INSERT INTO phone_numbers (phone, category, verified_reports, notes) VALUES (?, 'Laporan terverifikasi', 1, ?) ON DUPLICATE KEY UPDATE verified_reports = verified_reports + 1, notes = VALUES(notes)");
                $save->execute([$phone, $note ?: 'Berdasarkan laporan yang telah diverifikasi.']);
                $detail = $pdo->prepare("INSERT INTO phone_reports (phone, category, chronology, source_name, report_date, verification_status, evidence_quality, idempotency_key)
                    VALUES (?, 'Laporan masyarakat terverifikasi', ?, 'Database internal TRUSTIFY', ?, 'verified', 'strong', ?)
                    ON DUPLICATE KEY UPDATE verification_status = 'verified', evidence_quality = 'strong', chronology = VALUES(chronology)");
                $key = hash('sha256', 'phone|' . $phone . '|internal-report|' . $id);
                $detail->execute([$phone, $report['chronology'], $report['incident_date'] ?: null, $key]);
            } elseif ($report['report_type'] === 'url') {
                $domain = strtolower((string) parse_url($report['target'], PHP_URL_HOST));
                if ($domain !== '') {
                    $save = $pdo->prepare("INSERT INTO suspicious_urls (domain, category, verified_reports, notes) VALUES (?, 'Laporan terverifikasi', 1, ?) ON DUPLICATE KEY UPDATE verified_reports = verified_reports + 1, notes = VALUES(notes)");
                    $save->execute([$domain, $note ?: 'Berdasarkan laporan yang telah diverifikasi.']);
                }
            } elseif ($report['report_type'] === 'bank') {
                $bank = (string) ($report['bank_name'] ?? '');
                $account = preg_replace('/\D/', '', $report['target']) ?? '';
                if ($bank !== '' && $account !== '') {
                    $save = $pdo->prepare("INSERT INTO bank_accounts (bank_name, account_number, category, verified_reports, notes) VALUES (?, ?, 'Laporan terverifikasi', 1, ?) ON DUPLICATE KEY UPDATE verified_reports = verified_reports + 1, notes = VALUES(notes)");
                    $save->execute([$bank, $account, $note ?: 'Berdasarkan laporan yang telah diverifikasi.']);
                    $detail = $pdo->prepare("INSERT INTO bank_reports (bank_name, account_number, category, chronology, source_name, report_date, verification_status, evidence_quality, idempotency_key)
                        VALUES (?, ?, 'Laporan masyarakat terverifikasi', ?, 'Database internal TRUSTIFY', ?, 'verified', 'strong', ?)
                        ON DUPLICATE KEY UPDATE verification_status = 'verified', evidence_quality = 'strong', chronology = VALUES(chronology)");
                    $key = hash('sha256', 'bank|' . $bank . '|' . $account . '|internal-report|' . $id);
                    $detail->execute([$bank, $account, $report['chronology'], $report['incident_date'] ?: null, $key]);
                }
            }
        }
        admin_log((int) $admin['id'], 'report.' . $status, 'report', $id, ['note' => $note]);
        if ($report['user_id']) {
            $notice = $pdo->prepare('INSERT INTO notifications (user_id, title, body) VALUES (?, ?, ?)');
            $notice->execute([$report['user_id'], 'Pembaruan laporan', 'Status laporan #' . $id . ' berubah menjadi ' . $status . '.']);
        }
        $pdo->commit();
        json_response(['message' => 'Status laporan diperbarui.']);
    }

    if ($action === 'article-save') {
        $admin = require_user(true);
        $id = (int) ($data['id'] ?? 0);
        $title = value($data, 'title', 190);
        $category = value($data, 'category', 100);
        $excerpt = value($data, 'excerpt', 500);
        $body = value($data, 'body', 30000);
        $slug = strtolower(trim(preg_replace('/[^a-z0-9]+/i', '-', $title) ?? '', '-'));
        if ($title === '' || $category === '' || mb_strlen($excerpt) < 10 || mb_strlen($body) < 30) json_response(['error' => 'Judul, kategori, ringkasan, dan isi artikel wajib dilengkapi.'], 422);
        if ($id) {
            $save = $pdo->prepare('UPDATE articles SET title = ?, slug = ?, category = ?, excerpt = ?, body = ? WHERE id = ?');
            $save->execute([$title, $slug, $category, $excerpt, $body, $id]);
        } else {
            $save = $pdo->prepare('INSERT INTO articles (title, slug, category, excerpt, body) VALUES (?, ?, ?, ?, ?)');
            $save->execute([$title, $slug, $category, $excerpt, $body]);
            $id = (int) $pdo->lastInsertId();
        }
        admin_log((int) $admin['id'], 'article.save', 'article', $id);
        json_response(['message' => 'Artikel tersimpan.']);
    }

    if ($action === 'article-delete') {
        $admin = require_user(true);
        $id = (int) ($data['id'] ?? 0);
        $delete = $pdo->prepare('DELETE FROM articles WHERE id = ?');
        $delete->execute([$id]);
        admin_log((int) $admin['id'], 'article.delete', 'article', $id);
        json_response(['ok' => $delete->rowCount() > 0]);
    }

    if ($action === 'admin-record-save') {
        $admin = require_user(true);
        $type = value($data, 'type', 20);
        $config = record_config($type);
        $fields = [];
        foreach ($config['required'] as $field) $fields[$field] = value($data, $field, 500);
        if ($type === 'phone' && !preg_match('/^(?:\+?62|0)?8[1-9][0-9]{7,11}$/', preg_replace('/\D/', '', $fields['phone']) ?? '')) json_response(['error' => 'Format nomor telepon tidak valid.'], 422);
        if ($type === 'bank' && !preg_match('/^[0-9]{5,24}$/', $fields['account_number'])) json_response(['error' => 'Nomor rekening harus 5–24 digit.'], 422);
        if ($type === 'url' && !preg_match('/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i', $fields['domain'])) json_response(['error' => 'Masukkan domain tanpa protokol.'], 422);
        if (in_array('', $fields, true)) json_response(['error' => 'Lengkapi semua kolom wajib.'], 422);
        if ($type === 'phone') $fields['phone'] = normalize_phone($fields['phone']);
        $fields['verified_reports'] = max(0, (int) ($data['verified_reports'] ?? 0));
        $fields['is_simulated'] = !empty($data['is_simulated']) ? 1 : 0;
        $fields['notes'] = value($data, 'notes', 500) ?: null;
        $columns = array_keys($fields);
        $id = (int) ($data['id'] ?? 0);
        if ($id) {
            $set = implode(', ', array_map(static fn($field) => "{$field} = ?", $columns));
            $save = $pdo->prepare('UPDATE ' . $config['table'] . " SET {$set} WHERE id = ?");
            $save->execute([...array_values($fields), $id]);
        } else {
            $save = $pdo->prepare('INSERT INTO ' . $config['table'] . ' (' . implode(', ', $columns) . ') VALUES (' . implode(', ', array_fill(0, count($columns), '?')) . ')');
            $save->execute(array_values($fields));
            $id = (int) $pdo->lastInsertId();
        }
        admin_log((int) $admin['id'], 'record.save', $type, $id);
        json_response(['message' => 'Data reputasi tersimpan.']);
    }

    if ($action === 'admin-record-delete') {
        $admin = require_user(true);
        $type = value($data, 'type', 20);
        $config = record_config($type);
        $id = (int) ($data['id'] ?? 0);
        $delete = $pdo->prepare('DELETE FROM ' . $config['table'] . ' WHERE id = ?');
        $delete->execute([$id]);
        admin_log((int) $admin['id'], 'record.delete', $type, $id);
        json_response(['ok' => $delete->rowCount() > 0]);
    }

    json_response(['error' => 'Endpoint tidak ditemukan.'], 404);
} catch (Throwable $error) {
    error_log('[TRUSTIFY] ' . $error->getMessage());
    json_response(['error' => 'Terjadi kendala pada server. Coba lagi beberapa saat.'], 500);
}

function record_config(string $type): array
{
    $records = [
        'phone' => ['table' => 'phone_numbers', 'required' => ['phone', 'category']],
        'bank' => ['table' => 'bank_accounts', 'required' => ['bank_name', 'account_number', 'category']],
        'url' => ['table' => 'suspicious_urls', 'required' => ['domain', 'category']],
    ];
    if (!isset($records[$type])) json_response(['error' => 'Jenis data tidak dikenal.'], 422);
    return $records[$type];
}