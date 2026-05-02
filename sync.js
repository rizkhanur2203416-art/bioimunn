/* ================================================================
   BIOIMUN E-MODULE — SYNC.JS
   Lapisan sinkronisasi antara website dan Google Sheets
   ================================================================
   CARA PAKAI:
   1. Jalankan Google Apps Script (lihat google-apps-script.gs)
   2. Tempel URL deployment di variabel SHEET_URL di bawah
   3. Tambahkan <script src="sync.js"></script> di dashboard.html
      SEBELUM <script src="script.js"></script>
   ================================================================ */

/* ───────────────────────────────────────────────────────────────
   ⚙️  KONFIGURASI — WAJIB DIISI SETELAH DEPLOY APPS SCRIPT
   ─────────────────────────────────────────────────────────────── */
const SHEET_URL = 'https://script.google.com/macros/s/AKfycbzBOHUUtlBo1YOgc673eM_QExj67Op43dBjX_UNRxaHJkTqZ-HOnZ0E3b8dxLm72TH6/exec';
// Contoh: 'https://script.google.com/macros/s/AKfycbx.../exec'

/* ───────────────────────────────────────────────────────────────
   🔧  CORE SEND FUNCTION
   Mengirim data ke Google Apps Script via fetch (no-cors)
   ─────────────────────────────────────────────────────────────── */
async function sendToSheet(action, payload) {
  if (!SHEET_URL || SHEET_URL === '' || SHEET_URL === 'BELUM_DIKONFIGURASI') {
    console.warn('[BioImun Sync] SHEET_URL belum dikonfigurasi.');
    return;
  }
  try {
    const body = JSON.stringify({ action, ...payload });
    // Gunakan no-cors karena Apps Script tidak support CORS penuh
    await fetch(SHEET_URL, {
      method : 'POST',
      headers: { 'Content-Type': 'text/plain' }, // text/plain agar no-cors lolos
      body,
    });
    console.log('[BioImun Sync] ✅ Terkirim:', action);
  } catch (err) {
    console.warn('[BioImun Sync] ⚠️ Gagal kirim:', action, err.message);
    // Simpan ke antrean lokal agar bisa dikirim ulang
    queueFailedSync(action, payload);
  }
}

/* ───────────────────────────────────────────────────────────────
   📦  ANTREAN OFFLINE
   Jika tidak ada internet, simpan dulu lalu kirim saat online
   ─────────────────────────────────────────────────────────────── */
function queueFailedSync(action, payload) {
  try {
    const key   = 'bioimun_sync_queue';
    const queue = JSON.parse(localStorage.getItem(key) || '[]');
    queue.push({ action, payload, ts: Date.now() });
    // Simpan maks 50 item antrean
    if (queue.length > 50) queue.splice(0, queue.length - 50);
    localStorage.setItem(key, JSON.stringify(queue));
  } catch (e) {}
}

async function flushSyncQueue() {
  try {
    const key   = 'bioimun_sync_queue';
    const queue = JSON.parse(localStorage.getItem(key) || '[]');
    if (!queue.length) return;
    const remaining = [];
    for (const item of queue) {
      try {
        await fetch(SHEET_URL, {
          method : 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body   : JSON.stringify({ action: item.action, ...item.payload }),
        });
        console.log('[BioImun Sync] 🔄 Antrean terkirim:', item.action);
      } catch (e) {
        remaining.push(item);
      }
    }
    localStorage.setItem(key, JSON.stringify(remaining));
    if (remaining.length === 0) console.log('[BioImun Sync] ✅ Semua antrean berhasil dikirim!');
  } catch (e) {}
}

// Kirim antrean saat koneksi kembali
window.addEventListener('online', () => {
  console.log('[BioImun Sync] 🌐 Koneksi kembali, mengirim antrean...');
  flushSyncQueue();
});

/* ───────────────────────────────────────────────────────────────
   👤  HELPER: ambil data user aktif
   ─────────────────────────────────────────────────────────────── */
function getSyncUser() {
  try {
    const u = JSON.parse(sessionStorage.getItem('bioimun_user') || '{}');
    return {
      username: u.username || 'unknown',
      nama    : u.name     || 'Unknown',
      role    : u.role     || 'siswa',
      kelas   : u.kelas    || '—',
    };
  } catch (e) {
    return { username:'unknown', nama:'Unknown', role:'siswa', kelas:'—' };
  }
}

/* ═══════════════════════════════════════════════════════════════
   📤  FUNGSI SYNC PER AKTIVITAS
   Setiap fungsi dipanggil otomatis dari titik-titik di script.js
   ═══════════════════════════════════════════════════════════════ */

/* ── 1. LOGIN ───────────────────────────────────────────────────
   Dipanggil: saat pengguna berhasil login (dari login.html)        */
function syncLogin(user) {
  sendToSheet('login', {
    username: user.username,
    nama    : user.name,
    role    : user.role,
    kelas   : user.kelas || '—',
  });
}

/* ── 2. PROGRESS BELAJAR ────────────────────────────────────────
   Dipanggil: setiap saveProgress() — setelah baca materi / kuis  */
function syncProgress(progressData) {
  const u = getSyncUser();
  sendToSheet('progress', {
    username: u.username,
    nama    : u.nama,
    progress: progressData,
  });
}

/* ── 3. HASIL KUIS ──────────────────────────────────────────────
   Dipanggil: setelah siswa submit kuis materi                     */
function syncKuis(materiIdx, skor, lulus) {
  const u = getSyncUser();
  sendToSheet('kuis', {
    username : u.username,
    nama     : u.nama,
    materiIdx,
    skor,
    lulus,
  });
}

/* ── 4. HASIL DRILL ─────────────────────────────────────────────
   Dipanggil: setelah drill selesai (showDrillResult)              */
function syncDrill(jumlahSoal, skor) {
  const u = getSyncUser();
  sendToSheet('drill', {
    username   : u.username,
    nama       : u.nama,
    jumlahSoal,
    skor,
  });
}

/* ── 5. PROGRESS LKPD ──────────────────────────────────────────
   Dipanggil: setiap tahap LKPD diselesaikan                      */
function syncLKPD(kelompok, tahap) {
  const u = getSyncUser();
  sendToSheet('lkpd', {
    username: u.username,
    nama    : u.nama,
    kelompok,
    tahap,
  });
}

/* ── 6. PRE-TEST ────────────────────────────────────────────────
   Dipanggil: saat siswa submit pre-test                           */
function syncPretest(jawaban) {
  const u = getSyncUser();
  sendToSheet('pretest', {
    username: u.username,
    nama    : u.nama,
    jawaban,                       // array 5 string
  });
}

/* ── 7. POST-TEST ───────────────────────────────────────────────
   Dipanggil: saat siswa submit post-test                          */
function syncPosttest(jawaban) {
  const u = getSyncUser();
  sendToSheet('posttest', {
    username: u.username,
    nama    : u.nama,
    jawaban,
  });
}

/* ── 8. ANGKET OWNERSHIP ────────────────────────────────────────
   Dipanggil: saat siswa submit angket                             */
function syncAngket(answers) {
  const u = getSyncUser();
  sendToSheet('angket', {
    username: u.username,
    nama    : u.nama,
    answers,                       // array 15 nilai (1-5)
  });
}

/* ── 9. ESAI REFLEKTIF ──────────────────────────────────────────
   Dipanggil: saat siswa submit esai reflektif                     */
function syncReflektif(esai) {
  const u = getSyncUser();
  sendToSheet('reflektif', {
    username: u.username,
    nama    : u.nama,
    esai,                          // array 5 string
  });
}

/* ═══════════════════════════════════════════════════════════════
   🪝  MONKEY-PATCH — menyisipkan sync ke fungsi script.js
   Dilakukan SETELAH script.js dimuat (via defer / DOMContentLoaded)
   ═══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

  /* Kirim antrean offline yang tertunda */
  flushSyncQueue();

  /* ── PATCH saveProgress ─────────────────────────────────────── */
  const _origSaveProgress = window.saveProgress;
  window.saveProgress = function () {
    _origSaveProgress?.();
    // Throttle: tidak kirim lebih dari sekali per 10 detik
    clearTimeout(window._syncProgressTimer);
    window._syncProgressTimer = setTimeout(() => {
      if (window.progress) syncProgress(window.progress);
    }, 10000);
  };

  /* ── PATCH submitKuis ───────────────────────────────────────── */
  const _origSubmitKuis = window.submitKuis;
  window.submitKuis = function () {
    _origSubmitKuis?.();
    // Baca hasil dari progress yang baru disimpan
    const idx    = window.currentMateri ?? 0;
    const skor   = window.progress?.kuisScore?.[idx] ?? 0;
    const lulus  = window.progress?.kuisPassed?.[idx] ?? false;
    syncKuis(idx, skor, lulus);
  };

  /* ── PATCH showDrillResult ──────────────────────────────────── */
  const _origShowDrillResult = window.showDrillResult;
  window.showDrillResult = function () {
    _origShowDrillResult?.();
    const num  = window.drillNum ?? 5;
    const ans  = window.drillAnswers ?? [];
    const qs   = window.drillQuestions ?? [];
    let   skor = 0;
    qs.forEach((q, i) => { if (ans[i] === q.ans) skor++; });
    syncDrill(num, skor);
  };

  /* ── PATCH submitPBLDetail (LKPD per kelompok) ─────────────── */
  const _origSubmitPBLDetail = window.submitPBLDetail;
  window.submitPBLDetail = function (idx, textareaId) {
    _origSubmitPBLDetail?.(idx, textareaId);
    const grp = window.currentLKPDGroup ?? 1;
    syncLKPD(grp, idx);
  };

  /* ── PATCH submitTest (pretest / posttest / reflektif) ─────── */
  const _origSubmitTest = window.submitTest;
  window.submitTest = function (type) {
    _origSubmitTest?.(type);
    const idMap = {
      pretest  : ['pre-q1','pre-q2','pre-q3','pre-q4','pre-q5'],
      posttest : ['post-q1','post-q2','post-q3','post-q4','post-q5'],
      reflektif: ['ref-q1','ref-q2','ref-q3','ref-q4','ref-q5'],
    };
    const ids     = idMap[type] || [];
    const jawaban = ids.map(id => document.getElementById(id)?.value || '');

    if (type === 'pretest')   syncPretest(jawaban);
    if (type === 'posttest')  syncPosttest(jawaban);
    if (type === 'reflektif') syncReflektif(jawaban);
  };

  /* ── PATCH submitAngket ─────────────────────────────────────── */
  const _origSubmitAngket = window.submitAngket;
  window.submitAngket = function () {
    _origSubmitAngket?.();
    const answers = [];
    for (let i = 0; i < 15; i++) {
      const sel = document.querySelector(`input[name="angket-${i}"]:checked`);
      answers.push(sel ? parseInt(sel.value) : 0);
    }
    syncAngket(answers);
  };

  console.log('[BioImun Sync] ✅ Semua patch aktif. Siap sinkronisasi ke Google Sheets.');
});
