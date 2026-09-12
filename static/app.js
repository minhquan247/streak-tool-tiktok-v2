document.addEventListener('DOMContentLoaded', () => {
  const scheduleTimeInput = document.getElementById('scheduleTime');
  const delayMinInput = document.getElementById('delayMin');
  const delayMaxInput = document.getElementById('delayMax');
  const videoLinksInput = document.getElementById('videoLinks');
  const cookieJsonInput = document.getElementById('cookieJsonInput');
  const telegramEnabledCheck = document.getElementById('telegramEnabled');
  const telegramBotTokenInput = document.getElementById('telegramBotToken');
  const telegramChatIdInput = document.getElementById('telegramChatId');
  const newRecipientInput = document.getElementById('newRecipientInput');
  const recipientsListContainer = document.getElementById('recipientsList');

  const testUsernameInput = document.getElementById('testUsername');
  const testVideoUrlInput = document.getElementById('testVideoUrl');
  const btnTestSend = document.getElementById('btnTestSend');

  const statusBadgeText = document.getElementById('statusBadgeText');
  const statusPill = document.getElementById('statusPill');
  const cookieBadgeText = document.getElementById('cookieBadgeText');
  const statusMessage = document.getElementById('statusMessage');

  const btnSaveConfig = document.getElementById('btnSaveConfig');
  const btnSaveCookies = document.getElementById('btnSaveCookies');
  const btnAddRecipient = document.getElementById('btnAddRecipient');
  const btnSelectAll = document.getElementById('btnSelectAll');
  const btnDeselectAll = document.getElementById('btnDeselectAll');
  const btnStartSender = document.getElementById('btnStartSender');
  const btnStopSender = document.getElementById('btnStopSender');
  const toastContainer = document.getElementById('toastContainer');

  const logConsole = document.getElementById('logConsole');
  const btnClearLogs = document.getElementById('btnClearLogs');

  // ===========================================
  // Light / Dark Theme Switcher
  // ===========================================
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const themeLabel = themeToggleBtn ? themeToggleBtn.querySelector('.theme-label') : null;

  function initTheme() {
    const savedTheme = localStorage.getItem('app-theme') || 'dark';
    applyTheme(savedTheme);
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('app-theme', theme);
    if (themeLabel) {
      themeLabel.textContent = theme === 'light' ? 'Sáng' : 'Tối';
    }
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      const newTheme = currentTheme === 'light' ? 'dark' : 'light';
      applyTheme(newTheme);
      showToast(`Đã chuyển sang Chế độ ${newTheme === 'light' ? 'Giao diện Sáng' : 'Giao diện Tối Dịu Mắt'}`, 'info');
    });
  }

  initTheme();

  // ===========================================
  // Toast Notification System
  // ===========================================
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.2s ease';
      setTimeout(() => toast.remove(), 200);
    }, 4000);
  }

  // ===========================================
  // Live Log Console Rendering
  // ===========================================
  function escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderLogs(logs) {
    if (!logConsole || !Array.isArray(logs)) return;
    if (logs.length === 0) {
      logConsole.innerHTML = '<div class="log-line info"><span class="log-time">[System]</span> Chưa có nhật ký tiến trình.</div>';
      return;
    }

    const isAtBottom = logConsole.scrollHeight - logConsole.clientHeight <= logConsole.scrollTop + 40;

    logConsole.innerHTML = logs.map(log => {
      const lvl = log.level || 'info';
      const timeStr = log.time ? `[${log.time}]` : '[Log]';
      return `<div class="log-line ${lvl}"><span class="log-time">${timeStr}</span> ${escapeHtml(log.text)}</div>`;
    }).join('');

    if (isAtBottom || currentProcessState === 'running') {
      logConsole.scrollTop = logConsole.scrollHeight;
    }
  }

  if (btnClearLogs) {
    btnClearLogs.addEventListener('click', async () => {
      try {
        await fetch('/api/clear-logs', { method: 'POST' });
        if (logConsole) {
          logConsole.innerHTML = '<div class="log-line info"><span class="log-time">[System]</span> Đã xóa lịch sử nhật ký.</div>';
        }
      } catch (e) {}
    });
  }

  // ===========================================
  // Load Config
  // ===========================================
  async function loadConfig() {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      if (data.config) {
        const config = data.config;
        scheduleTimeInput.value = config.schedule?.time || '00:00';
        const delay = config.tiktok?.message_delay_seconds || [8, 18];
        delayMinInput.value = delay[0] || 8;
        delayMaxInput.value = delay[1] || 18;
        videoLinksInput.value = (config.videos || []).join('\n');

        telegramEnabledCheck.checked = config.telegram?.enabled || false;
        telegramBotTokenInput.value = config.telegram?.bot_token || '';
        telegramChatIdInput.value = config.telegram?.chat_id || '';

        currentRecipients = config.recipients || [];
        renderRecipients();
      }

      updateCookieBadge(data.cookies_valid);
    } catch (err) {
      showToast('Lỗi tải cấu hình ban đầu!', 'error');
    }
  }

  function updateCookieBadge(isValid) {
    if (isValid) {
      cookieBadgeText.textContent = 'Hợp lệ';
      cookieBadgeText.className = 'valid';
    } else {
      cookieBadgeText.textContent = 'Chưa có / Hết hạn';
      cookieBadgeText.className = 'invalid';
    }
  }

  // ===========================================
  // Render Recipients
  // ===========================================
  function renderRecipients() {
    recipientsListContainer.innerHTML = '';
    if (currentRecipients.length === 0) {
      recipientsListContainer.innerHTML =
        '<p style="color: var(--text-muted); font-size: 12px; font-family: var(--font-mono); padding: 8px 0;">Chưa có người nhận nào. Hãy thêm Username TikTok ở trên.</p>';
      return;
    }

    currentRecipients.forEach((rec, idx) => {
      const item = document.createElement('div');
      item.className = 'user-item-box';
      const displayName = rec.name || rec.username;
      const handle = rec.username ? `@${rec.username}` : '(Chưa xác minh)';
      const initial = (displayName[0] || 'T').toUpperCase();

      item.innerHTML = `
        <div class="user-left-info">
          <input type="checkbox" checked data-index="${idx}" />
          <div class="user-avatar">${initial}</div>
          <div class="user-details">
            <strong>${displayName}</strong>
            <small>${handle}</small>
          </div>
        </div>
        <button class="btn-remove" data-index="${idx}">&times;</button>
      `;
      recipientsListContainer.appendChild(item);
    });

    document.querySelectorAll('.btn-remove').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index);
        currentRecipients.splice(index, 1);
        renderRecipients();
      });
    });
  }

  // ===========================================
  // Save Config
  // ===========================================
  async function saveConfig() {
    const videoList = videoLinksInput.value
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const checkedBoxes = document.querySelectorAll('.user-item-box input[type="checkbox"]:checked');
    const selectedRecipients = Array.from(checkedBoxes).map((box) => {
      const idx = parseInt(box.dataset.index);
      return currentRecipients[idx];
    });

    const payload = {
      schedule: {
        time: scheduleTimeInput.value || '00:00',
        timezone: 'Asia/Ho_Chi_Minh',
        run_on_start: true,
      },
      tiktok: {
        message_delay_seconds: [
          parseInt(delayMinInput.value || 8),
          parseInt(delayMaxInput.value || 18),
        ],
        headless: true,
      },
      videos: videoList,
      recipients: selectedRecipients,
      telegram: {
        enabled: telegramEnabledCheck.checked,
        bot_token: telegramBotTokenInput.value,
        chat_id: telegramChatIdInput.value,
      },
    };

    try {
      statusMessage.textContent = 'Đang lưu cấu hình...';
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        statusMessage.textContent = 'Đã lưu cấu hình!';
        showToast('Đã lưu cấu hình thành công!', 'success');
      } else {
        statusMessage.textContent = 'Lỗi: ' + (data.error || 'Không xác định');
        showToast('Lỗi lưu cấu hình: ' + data.error, 'error');
      }
    } catch (err) {
      statusMessage.textContent = 'Lưu thất bại!';
      showToast('Không thể kết nối đến server!', 'error');
    }
  }

  // ===========================================
  // Save Cookies
  // ===========================================
  btnSaveCookies.addEventListener('click', async () => {
    const rawCookies = cookieJsonInput.value.trim();
    if (!rawCookies) {
      showToast('Vui lòng dán mã cookie JSON trước khi lưu!', 'error');
      return;
    }

    try {
      statusMessage.textContent = 'Đang kiểm tra và lưu Cookie...';
      const res = await fetch('/api/cookies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookies: rawCookies }),
      });
      const data = await res.json();
      if (res.ok) {
        updateCookieBadge(data.valid);
        statusMessage.textContent = `Đã lưu ${data.count} cookie!`;
        showToast(`Đã cập nhật thành công ${data.count} cookie!`, 'success');
      } else {
        showToast('Lỗi lưu cookie: ' + data.error, 'error');
      }
    } catch (err) {
      showToast('Mã cookie không đúng định dạng JSON!', 'error');
    }
  });

  // ===========================================
  // Add Recipient
  // ===========================================
  btnAddRecipient.addEventListener('click', () => {
    const val = newRecipientInput.value.trim();
    if (!val) return;
    const cleanUsername = val.replace(/^@/, '');
    currentRecipients.push({ name: cleanUsername, username: cleanUsername });
    newRecipientInput.value = '';
    renderRecipients();
    showToast(`Đã thêm @${cleanUsername} vào danh sách!`, 'success');
  });

  newRecipientInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      btnAddRecipient.click();
    }
  });

  btnSelectAll.addEventListener('click', () => {
    document.querySelectorAll('.user-item-box input[type="checkbox"]').forEach((box) => (box.checked = true));
    showToast('Đã chọn tất cả', 'success');
  });

  btnDeselectAll.addEventListener('click', () => {
    document.querySelectorAll('.user-item-box input[type="checkbox"]').forEach((box) => (box.checked = false));
  });

  btnSaveConfig.addEventListener('click', saveConfig);

  // ===========================================
  // Test Send
  // ===========================================
  btnTestSend.addEventListener('click', async () => {
    const targetUser = testUsernameInput.value.trim().replace(/^@/, '');
    const videoUrl = testVideoUrlInput.value.trim();

    if (!targetUser) {
      showToast('Vui lòng nhập Username TikTok cần gửi thử!', 'error');
      return;
    }

    try {
      statusMessage.textContent = `Đang gửi thử tới @${targetUser}...`;
      btnTestSend.disabled = true;

      const res = await fetch('/api/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: targetUser, video_url: videoUrl }),
      });
      const data = await res.json();

      if (res.ok) {
        statusMessage.textContent = data.message;
        statusBadgeText.textContent = 'Running';
        statusPill.className = 'status-pill running';
        showToast(`Đang gửi tin nhắn thử tới @${targetUser}...`, 'success');
      } else {
        showToast('Lỗi gửi thử: ' + data.error, 'error');
        statusMessage.textContent = 'Lỗi gửi thử: ' + data.error;
      }
    } catch (err) {
      showToast('Lỗi kết nối khi gửi thử!', 'error');
    } finally {
      setTimeout(() => { btnTestSend.disabled = false; }, 3000);
    }
  });

  // ===========================================
  // Start / Stop Sender
  // ===========================================
  btnStartSender.addEventListener('click', async () => {
    await saveConfig();
    try {
      const res = await fetch('/api/start', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        statusBadgeText.textContent = 'Running';
        statusPill.className = 'status-pill running';
        statusMessage.textContent = 'Đã khởi động tiến trình gửi tự động!';
        btnStartSender.disabled = true;
        btnStopSender.disabled = false;
        showToast('Đã khởi động tiến trình!', 'success');
      } else {
        showToast('Không thể chạy: ' + data.error, 'error');
      }
    } catch (err) {
      showToast('Lỗi khởi động!', 'error');
    }
  });

  btnStopSender.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/stop', { method: 'POST' });
      const data = await res.json();
      statusBadgeText.textContent = 'Stopped';
      statusPill.className = 'status-pill';
      statusMessage.textContent = 'Đã dừng tiến trình tự động gửi.';
      btnStartSender.disabled = false;
      btnStopSender.disabled = true;
      showToast('Đã dừng tiến trình!', 'info');
    } catch (err) {
      console.error(err);
    }
  });

  // ===========================================
  // Real-time Status & Log Polling (Every 2 seconds)
  // ===========================================
  setInterval(async () => {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      currentProcessState = data.status;

      if (data.status === 'running') {
        statusBadgeText.textContent = 'Running';
        statusPill.className = 'status-pill running';
        btnStartSender.disabled = true;
        btnStopSender.disabled = false;
      } else if (data.status === 'finished') {
        statusBadgeText.textContent = 'Finished';
        statusPill.className = 'status-pill';
        btnStartSender.disabled = false;
        btnStopSender.disabled = true;
      } else if (data.status === 'failed') {
        statusBadgeText.textContent = 'Failed';
        statusPill.className = 'status-pill';
        btnStartSender.disabled = false;
        btnStopSender.disabled = true;
      }

      if (data.message) {
        statusMessage.textContent = data.message;
      }

      if (data.logs) {
        renderLogs(data.logs);
      }
    } catch (e) {
      // quiet
    }
  }, 2000);

  loadConfig();
});
