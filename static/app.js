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

  const statusBadge = document.getElementById('statusBadge');
  const cookieBadge = document.getElementById('cookieBadge');
  const statusMessage = document.getElementById('statusMessage');

  const btnSaveConfig = document.getElementById('btnSaveConfig');
  const btnSaveCookies = document.getElementById('btnSaveCookies');
  const btnAddRecipient = document.getElementById('btnAddRecipient');
  const btnSelectAll = document.getElementById('btnSelectAll');
  const btnDeselectAll = document.getElementById('btnDeselectAll');
  const btnStartSender = document.getElementById('btnStartSender');
  const btnStopSender = document.getElementById('btnStopSender');

  let currentRecipients = [];

  // Fetch initial config and status
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
      console.error('Failed to load config:', err);
    }
  }

  function updateCookieBadge(isValid) {
    if (isValid) {
      cookieBadge.textContent = 'Cookie Hợp lệ';
      cookieBadge.className = 'badge cookie-valid';
    } else {
      cookieBadge.textContent = 'Cookie Hết hạn / Chưa có';
      cookieBadge.className = 'badge cookie-invalid';
    }
  }

  function renderRecipients() {
    recipientsListContainer.innerHTML = '';
    if (currentRecipients.length === 0) {
      recipientsListContainer.innerHTML = '<p style="color: var(--text-muted); font-size: 13px;">Chưa có người nhận nào. Hãy thêm ở trên.</p>';
      return;
    }

    currentRecipients.forEach((rec, idx) => {
      const item = document.createElement('div');
      item.className = 'recipient-item';
      const displayName = rec.name || rec.username;
      const handle = rec.username ? `@${rec.username}` : '(Chưa resolve)';

      item.innerHTML = `
        <div class="recipient-info">
          <input type="checkbox" checked data-index="${idx}" />
          <span><strong>${displayName}</strong> <small style="color: var(--text-muted);">${handle}</small></span>
        </div>
        <button class="remove-btn" data-index="${idx}">&times;</button>
      `;
      recipientsListContainer.appendChild(item);
    });

    // Add remove handlers
    document.querySelectorAll('.remove-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index);
        currentRecipients.splice(index, 1);
        renderRecipients();
      });
    });
  }

  // Save Config
  async function saveConfig() {
    const videoList = videoLinksInput.value
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const checkedBoxes = document.querySelectorAll('.recipient-item input[type="checkbox"]:checked');
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
        statusMessage.textContent = 'Đã lưu cấu hình thành công!';
      } else {
        statusMessage.textContent = 'Lỗi lưu: ' + (data.error || 'Unknown');
      }
    } catch (err) {
      statusMessage.textContent = 'Lưu thất bại!';
      console.error(err);
    }
  }

  // Save Cookies
  btnSaveCookies.addEventListener('click', async () => {
    const rawCookies = cookieJsonInput.value.trim();
    if (!rawCookies) {
      alert('Vui lòng dán nội dung cookies.json!');
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
        statusMessage.textContent = `Đã lưu ${data.count} cookies thành công!`;
      } else {
        alert('Lỗi lưu cookie: ' + data.error);
      }
    } catch (err) {
      alert('Cookie không đúng định dạng JSON hợp lệ!');
    }
  });

  // Add Recipient
  btnAddRecipient.addEventListener('click', () => {
    const val = newRecipientInput.value.trim();
    if (!val) return;
    const cleanUsername = val.replace(/^@/, '');
    currentRecipients.push({ name: cleanUsername, username: cleanUsername });
    newRecipientInput.value = '';
    renderRecipients();
  });

  btnSelectAll.addEventListener('click', () => {
    document.querySelectorAll('.recipient-item input[type="checkbox"]').forEach((box) => (box.checked = true));
  });

  btnDeselectAll.addEventListener('click', () => {
    document.querySelectorAll('.recipient-item input[type="checkbox"]').forEach((box) => (box.checked = false));
  });

  btnSaveConfig.addEventListener('click', saveConfig);

  // Start Sender
  btnStartSender.addEventListener('click', async () => {
    await saveConfig();
    try {
      const res = await fetch('/api/start', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        statusBadge.textContent = 'Đang chạy (Running)';
        statusBadge.className = 'badge status-running';
        statusMessage.textContent = 'Đã khởi động tiến trình gửi Streak!';
        btnStartSender.disabled = true;
        btnStopSender.disabled = false;
      } else {
        alert('Không thể chạy: ' + data.error);
      }
    } catch (err) {
      alert('Lỗi khởi động sender!');
    }
  });

  // Stop Sender
  btnStopSender.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/stop', { method: 'POST' });
      const data = await res.json();
      statusBadge.textContent = 'Đã dừng (Stopped)';
      statusBadge.className = 'badge status-idle';
      statusMessage.textContent = 'Đã dừng gửi Streak.';
      btnStartSender.disabled = false;
      btnStopSender.disabled = true;
    } catch (err) {
      console.error(err);
    }
  });

  // Poll status periodically
  setInterval(async () => {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      if (data.status === 'running') {
        statusBadge.textContent = 'Đang chạy (Running)';
        statusBadge.className = 'badge status-running';
        btnStartSender.disabled = true;
        btnStopSender.disabled = false;
      } else if (data.status === 'finished') {
        statusBadge.textContent = 'Hoàn thành (Finished)';
        statusBadge.className = 'badge status-idle';
        btnStartSender.disabled = false;
        btnStopSender.disabled = true;
      }
      if (data.message) {
        statusMessage.textContent = data.message;
      }
    } catch (e) {
      // quiet
    }
  }, 5000);

  loadConfig();
});
