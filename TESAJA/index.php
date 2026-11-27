<?php
require __DIR__ . '/app/bootstrap.php';
$user = current_user();
?><!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="csrf-token" content="<?= htmlspecialchars($_SESSION['csrf'], ENT_QUOTES, 'UTF-8') ?>">
  <meta name="theme-color" content="#101827">
  <title>TRUSTIFY | Think Before You Trust</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Sora:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="assets/app.css?v=27">
  <script defer src="https://unpkg.com/lucide@0.468.0/dist/umd/lucide.min.js"></script>
  <script defer src="assets/app.js?v=28"></script>
</head>
<body>
  <div id="app" data-user="<?= htmlspecialchars(json_encode($user, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP), ENT_QUOTES, 'UTF-8') ?>">
    <div class="boot-state" role="status">Menyiapkan TRUSTIFY...</div>
  </div>
  <div id="toast-region" class="toast-region" aria-live="polite" aria-atomic="true"></div>
</body>
</html>