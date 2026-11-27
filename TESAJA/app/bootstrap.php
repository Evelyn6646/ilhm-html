<?php
declare(strict_types=1);

define('APP_ROOT', dirname(__DIR__));
define('UPLOAD_ROOT', sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'trustify-evidence');

if (session_status() !== PHP_SESSION_ACTIVE) {
    ini_set('session.use_strict_mode', '1');
    session_set_cookie_params([
        'httponly' => true,
        'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'samesite' => 'Lax',
        'path' => '/',
    ]);
    session_start();
}

if (empty($_SESSION['csrf'])) {
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $host = getenv('TRUSTIFY_DB_HOST') ?: '127.0.0.1';
    $port = getenv('TRUSTIFY_DB_PORT') ?: '3306';
    $name = getenv('TRUSTIFY_DB_NAME') ?: 'trustify';
    $user = getenv('TRUSTIFY_DB_USER') ?: 'root';
    $pass = getenv('TRUSTIFY_DB_PASS') ?: '';
    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];

    $server = new PDO("mysql:host={$host};port={$port};charset=utf8mb4", $user, $pass, $options);
    $safeName = preg_replace('/[^a-zA-Z0-9_]/', '', $name);
    $server->exec("CREATE DATABASE IF NOT EXISTS `{$safeName}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    $pdo = new PDO("mysql:host={$host};port={$port};dbname={$safeName};charset=utf8mb4", $user, $pass, $options);
    initialize_database($pdo);
    return $pdo;
}

function initialize_database(PDO $pdo): void
{
    static $initialized = false;
    if ($initialized) {
        return;
    }
    $schema = file_get_contents(APP_ROOT . DIRECTORY_SEPARATOR . 'schema.sql');
    foreach (explode(';', (string) $schema) as $statement) {
        $statement = trim($statement);
        if ($statement !== '') {
            $pdo->exec($statement);
        }
    }

    $userCount = (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
    if ($userCount === 0) {
        $insertUser = $pdo->prepare('INSERT INTO users (name, email, phone, password_hash, role, is_demo) VALUES (?, ?, ?, ?, ?, 1)');
        $insertUser->execute(['Admin Trustify', 'admin@trustify.test', '+6281200000001', password_hash('admin123', PASSWORD_DEFAULT), 'admin']);
        $insertUser->execute(['Pengguna Demo', 'user@trustify.test', '+6281200000002', password_hash('user123', PASSWORD_DEFAULT), 'user']);
    }

    $demoPasswordUpdates = [
        ['admin@trustify.test', 'TrustifyAdmin!2026', 'admin123'],
        ['user@trustify.test', 'TrustifyUser!2026', 'user123'],
    ];
    $findDemo = $pdo->prepare('SELECT id, password_hash FROM users WHERE email = ? AND is_demo = 1 LIMIT 1');
    $updateDemo = $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
    foreach ($demoPasswordUpdates as [$email, $oldPassword, $newPassword]) {
        $findDemo->execute([$email]);
        $demo = $findDemo->fetch();
        if ($demo && password_verify($oldPassword, $demo['password_hash'])) {
            $updateDemo->execute([password_hash($newPassword, PASSWORD_DEFAULT), $demo['id']]);
        }
    }

    seed_rows($pdo, 'risk_indicators', 'SELECT COUNT(*) FROM risk_indicators', [
        ['message', 'kode otp', 34, 'permintaan data rahasia'],
        ['message', 'otp', 30, 'permintaan data rahasia'],
        ['message', 'password', 28, 'permintaan data rahasia'],
        ['message', 'pin', 25, 'permintaan data rahasia'],
        ['message', 'blokir', 18, 'ancaman akun'],
        ['message', 'diblokir', 18, 'ancaman akun'],
        ['message', 'hadiah', 17, 'iming-iming hadiah'],
        ['message', 'menang', 17, 'iming-iming hadiah'],
        ['message', 'transfer', 20, 'permintaan transaksi'],
        ['message', 'segera', 12, 'desakan waktu'],
        ['message', 'sekarang juga', 12, 'desakan waktu'],
        ['message', 'verifikasi akun', 14, 'rekayasa sosial'],
        ['message', 'klik link', 14, 'ajakan membuka tautan'],
        ['url', 'login', 12, 'kata kunci sensitif'],
        ['url', 'verify', 15, 'kata kunci sensitif'],
        ['url', 'account', 10, 'kata kunci sensitif'],
        ['url', 'hadiah', 12, 'kata kunci sensitif'],
    ], 'INSERT INTO risk_indicators (check_type, token, weight, category) VALUES (?, ?, ?, ?)');

    seed_rows($pdo, 'articles', 'SELECT COUNT(*) FROM articles', [
        ['Kenali pola phishing sebelum terlambat', 'kenali-pola-phishing', 'Phishing', 'Tanda sederhana yang bisa membantu mengenali tautan dan pesan phishing.', "Phishing adalah upaya memperoleh data dengan menyamar sebagai pihak tepercaya. Periksa alamat pengirim, ejaan domain, dan konteks pesan. Jangan membuka tautan dari pesan yang tidak diminta. Jika ragu, kunjungi layanan melalui aplikasi atau alamat resmi yang sudah Anda ketahui.", 1],
        ['Modus penipuan yang sering muncul di WhatsApp', 'modus-whatsapp', 'Penipuan WhatsApp', 'Waspadai pesan mendesak, hadiah, dan permintaan kode verifikasi.', "Kode OTP bersifat rahasia. Petugas resmi tidak akan meminta kode tersebut melalui chat atau telepon. Berhenti sejenak, hubungi orang atau layanan melalui nomor resmi, lalu laporkan akun yang mencurigakan.", 1],
        ['Belanja online dengan lebih aman', 'belanja-online-aman', 'Penipuan Online Shop', 'Langkah praktis memeriksa toko dan transaksi sebelum membayar.', "Periksa umur dan konsistensi akun toko, ulasan dari berbagai sumber, serta metode pembayaran. Hindari transfer di luar platform. Simpan bukti transaksi dan gunakan mekanisme perlindungan pembeli yang tersedia.", 0],
        ['Ciri tawaran investasi yang perlu diperiksa', 'investasi-perlu-diperiksa', 'Penipuan Investasi', 'Janji keuntungan pasti tinggi adalah sinyal untuk berhati-hati.', "Tidak ada investasi yang menjamin keuntungan tinggi tanpa risiko. Periksa legalitas penyelenggara melalui kanal regulator resmi. Jangan terburu-buru karena tekanan waktu atau ajakan merekrut orang lain.", 0],
        ['Lindungi rekening dan data pribadi', 'lindungi-rekening', 'Keamanan Rekening', 'Kebiasaan kecil untuk menjaga akses keuangan tetap aman.', "Gunakan kata sandi unik, aktifkan autentikasi berlapis, dan jangan membagikan PIN maupun OTP. Aktifkan notifikasi transaksi. Hubungi bank lewat nomor di kartu atau situs resmi bila ada aktivitas yang tidak dikenal.", 0],
        ['Data pribadi bukan untuk dibagikan sembarangan', 'jaga-data-pribadi', 'Keamanan Data Pribadi', 'Batasi data yang dibagikan dan pahami risiko setiap permintaan.', "Berikan data pribadi hanya saat benar-benar diperlukan dan melalui kanal yang terpercaya. Periksa izin aplikasi, jangan mengirim foto identitas lewat akun yang tidak terverifikasi, dan segera ganti kredensial bila terlanjur terekspos.", 0],
    ], 'INSERT INTO articles (title, slug, category, excerpt, body, is_popular) VALUES (?, ?, ?, ?, ?, ?)');
    $testPhones = [
        ['+6285133409356', 2], ['+62864526433', 1], ['+6281451673226', 1], ['+628285755364060905', 1],
        ['+62831620584420', 1], ['+628779869385', 3], ['+62815017033701', 3], ['+628199895171', 2],
        ['+6281524268987', 2], ['+6281617327195', 2]
    ];
    $phoneLegacy = $pdo->prepare("INSERT INTO phone_numbers (phone, category, verified_reports, is_simulated, notes) VALUES (?, 'Data pengujian Kredibel', ?, 1, 'Testing saja.') ON DUPLICATE KEY UPDATE category = VALUES(category), verified_reports = VALUES(verified_reports), is_simulated = 1, notes = VALUES(notes)");
    $phoneDetail = $pdo->prepare("INSERT INTO phone_reports (phone, category, chronology, source_name, source_url, verification_status, evidence_quality, idempotency_key) VALUES (?, 'Data pengujian penipuan', 'Data testing tangkapan layar Kredibel.', 'Kredibel (testing)', 'https://kredibel.com', 'verified', 'strong', ?) ON DUPLICATE KEY UPDATE verification_status = 'verified', evidence_quality = 'strong', category = VALUES(category)");
    foreach ($testPhones as [$phone, $count]) {
        $phoneLegacy->execute([$phone, $count]);
        $phoneDetail->execute([$phone, hash('sha256', 'test-kredibel-phone|' . $phone)]);
    }

    $testAccounts = [
        ['10817477590', 2], ['109055313826', 2], ['0942264923', 2],
        ['1300030796661', 2], ['001901132891500', 4]
    ];
    $bankLegacy = $pdo->prepare("INSERT INTO bank_accounts (bank_name, account_number, category, verified_reports, is_simulated, notes) VALUES ('BCA', ?, 'Data pengujian Kredibel', ?, 1, 'Testing saja.') ON DUPLICATE KEY UPDATE category = VALUES(category), verified_reports = VALUES(verified_reports), is_simulated = 1, notes = VALUES(notes)");
    $bankDetail = $pdo->prepare("INSERT INTO bank_reports (bank_name, account_number, category, chronology, source_name, source_url, verification_status, evidence_quality, idempotency_key) VALUES ('BCA', ?, 'Data pengujian penipuan', 'Data testing tangkapan layar Kredibel.', 'Kredibel (testing)', 'https://kredibel.com', 'verified', 'strong', ?) ON DUPLICATE KEY UPDATE verification_status = 'verified', evidence_quality = 'strong', category = VALUES(category)");
    foreach ($testAccounts as [$account, $count]) {
        $bankLegacy->execute([$account, $count]);
        $bankDetail->execute([$account, hash('sha256', 'test-kredibel-bank|BCA|' . $account)]);
    }
    $initialized = true;
}

function seed_rows(PDO $pdo, string $table, string $countSql, array $rows, string $insertSql): void
{
    if ((int) $pdo->query($countSql)->fetchColumn() !== 0) {
        return;
    }
    $insert = $pdo->prepare($insertSql);
    foreach ($rows as $row) {
        $insert->execute($row);
    }
}

function json_response(array $payload, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function current_user(): ?array
{
    return $_SESSION['user'] ?? null;
}

function require_user(bool $admin = false): array
{
    $user = current_user();
    if (!$user) {
        json_response(['error' => 'Masuk terlebih dahulu untuk melanjutkan.'], 401);
    }
    if ($admin && $user['role'] !== 'admin') {
        json_response(['error' => 'Akses khusus admin.'], 403);
    }
    return $user;
}

function require_csrf(): void
{
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($_POST['csrf'] ?? '');
    if (!is_string($token) || !hash_equals((string) $_SESSION['csrf'], $token)) {
        json_response(['error' => 'Sesi formulir kedaluwarsa. Muat ulang halaman dan coba lagi.'], 419);
    }
}

function admin_log(int $adminId, string $action, string $type, ?int $entityId, array $details = []): void
{
    $statement = db()->prepare('INSERT INTO admin_logs (admin_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)');
    $statement->execute([$adminId, $action, $type, $entityId, json_encode($details, JSON_UNESCAPED_UNICODE)]);
}

