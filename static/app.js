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

  const statusDot = document.getElementById('statusDot');
  const statusBadgeText = document.getElementById('statusBadgeText');
  const cookieBadgeText = document.getElementById('cookieBadgeText');
  const statusMessage = document.getElementById('statusMessage');

  const btnSaveConfig = document.getElementById('btnSaveConfig');
  const btnSaveCookies = document.getElementById('btnSaveCookies');
  const btnAddRecipient = document.getElementById('btnAddRecipient');
  const btnSelectAll = document.getElementById('btnSelectAll');
  const btnDeselectAll = document.getElementById('btnDeselectAll');
  const btnStartSender = document.getElementById('btnStartSender');
  const btnStopSender = document.getElementById('btnStopSender');

  let currentRecipients = [];

  // Tải cấu hình ban đầu
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
      console.error('Lỗi nạp cấu hình:', err);
    }
  }

  function updateCookieBadge(isValid) {
    if (isValid) {
      cookieBadgeText.textContent = 'Hợp lệ';
      cookieBadgeText.className = 'valid';
    } else {
      cookieBadgeText.textContent = 'Hết hạn / Chưa có';
      cookieBadgeText.className = 'invalid';
    }
  }

  function renderRecipients() {
    recipientsListContainer.innerHTML = '';
    if (currentRecipients.length === 0) {
      recipientsListContainer.innerHTML = '<p style="color: var(--text-secondary); font-size: 13px;">Chưa có người nhận nào. Vui lòng thêm tài khoản ở trên.</p>';
      return;
    }

    currentRecipients.forEach((rec, idx) => {
      const item = document.createElement('div');
      item.className = 'recipient-card';
      const displayName = rec.name || rec.username;
      const handle = rec.username ? `@${rec.username}` : '(Chưa xác minh)';
      const initial = (displayName[0] || 'T').toUpperCase();

      item.innerHTML = `
        <div class="recipient-left">
          <input type="checkbox" checked data-index="${idx}" />
          <div class="avatar-circle">${initial}</div>
          <div class="user-names">
            <strong>${displayName}</strong>
            <small>${handle}</small>
          </div>
        </div>
        <button class="btn-delete" data-index="${idx}">&times;</button>
      `;
      recipientsListContainer.appendChild(item);
    });

    document.querySelectorAll('.btn-delete').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index);
        currentRecipients.splice(index, 1);
        renderRecipients();
      });
    });
  }

  // Lưu Cấu Hình
  async function saveConfig() {
    const videoList = videoLinksInput.value
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const checkedBoxes = document.querySelectorAll('.recipient-card input[type="checkbox"]:checked');
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
        statusMessage.textContent = 'Lỗi lưu: ' + (data.error || 'Không xác định');
      }
    } catch (err) {
      statusMessage.textContent = 'Lưu thất bại!';
      console.error(err);
    }
  }

  // Lưu Cookies
  btnSaveCookies.addEventListener('click', async () => {
    const rawCookies = cookieJsonInput.value.trim();
    if (!rawCookies) {
      alert('Vui lòng dán mã cookie JSON vào ô trước khi lưu!');
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
        statusMessage.textContent = `Đã cập nhật ${data.count} cookie thành công!`;
      } else {
        alert('Lỗi lưu cookie: ' + data.error);
      }
    } catch (err) {
      alert('Mã cookie không đúng định dạng JSON!');
    }
  });

  // Thêm người nhận
  btnAddRecipient.addEventListener('click', () => {
    const val = newRecipientInput.value.trim();
    if (!val) return;
    const cleanUsername = val.replace(/^@/, '');
    currentRecipients.push({ name: cleanUsername, username: cleanUsername });
    newRecipientInput.value = '';
    renderRecipients();
  });

  btnSelectAll.addEventListener('click', () => {
    document.querySelectorAll('.recipient-card input[type="checkbox"]').forEach((box) => (box.checked = true));
  });

  btnDeselectAll.addEventListener('click', () => {
    document.querySelectorAll('.recipient-card input[type="checkbox"]').forEach((box) => (box.checked = false));
  });

  btnSaveConfig.addEventListener('click', saveConfig);

  // Gửi Thử Tin Nhắn (Test Send)
  btnTestSend.addEventListener('click', async () => {
    const targetUser = testUsernameInput.value.trim().replace(/^@/, '');
    const videoUrl = testVideoUrlInput.value.trim();

    if (!targetUser) {
      alert('Vui lòng nhập Username TikTok cần gửi thử!');
      return;
    }

    try {
      statusMessage.textContent = `Đang bắt đầu gửi tin nhắn thử tới @${targetUser}...`;
      btnTestSend.disabled = true;

      const res = await fetch('/api/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: targetUser, video_url: videoUrl }),
      });
      const data = await res.json();

      if (res.ok) {
        statusMessage.textContent = data.message;
        statusBadgeText.textContent = 'Đang chạy';
        statusDot.parentElement.className = 'status-indicator running';
      } else {
        alert('Lỗi gửi thử: ' + data.error);
        statusMessage.textContent = 'Lỗi gửi thử: ' + data.error;
      }
    } catch (err) {
      alert('Lỗi kết nối khi gửi thử!');
    } finally {
      setTimeout(() => { btnTestSend.disabled = false; }, 3000);
    }
  });

  // Bắt đầu gửi tự động
  btnStartSender.addEventListener('click', async () => {
    await saveConfig();
    try {
      const res = await fetch('/api/start', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        statusBadgeText.textContent = 'Đang chạy';
        statusDot.parentElement.className = 'status-indicator running';
        statusMessage.textContent = 'Đã khởi động tiến trình tự động gửi!';
        btnStartSender.disabled = true;
        btnStopSender.disabled = false;
      } else {
        alert('Không thể chạy: ' + data.error);
      }
    } catch (err) {
      alert('Lỗi khởi động!');
    }
  });

  // Dừng tiến trình
  btnStopSender.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/stop', { method: 'POST' });
      const data = await res.json();
      statusBadgeText.textContent = 'Đã dừng';
      statusDot.parentElement.className = 'status-indicator';
      statusMessage.textContent = 'Đã dừng tiến trình tự động gửi.';
      btnStartSender.disabled = false;
      btnStopSender.disabled = true;
    } catch (err) {
      console.error(err);
    }
  });

  // Cập nhật trạng thái định kỳ
  setInterval(async () => {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      if (data.status === 'running') {
        statusBadgeText.textContent = 'Đang chạy';
        statusDot.parentElement.className = 'status-indicator running';
        btnStartSender.disabled = true;
        btnStopSender.disabled = false;
      } else if (data.status === 'finished') {
        statusBadgeText.textContent = 'Hoàn thành';
        statusDot.parentElement.className = 'status-indicator';
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
