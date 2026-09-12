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

  let currentRecipients = [];

  // Hiển thị Thông Báo Toast nổi bật
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

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
      showToast('Lỗi tải cấu hình ban đầu!', 'error');
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
      recipientsListContainer.innerHTML = '<p style="color: var(--text-muted); font-size: 13px; padding: 12px 0;">Chưa có người nhận nào. Vui lòng thêm username ở trên.</p>';
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

  // Lưu Cấu Hình
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
        statusMessage.textContent = 'Đã lưu cấu hình thành công!';
        showToast('Đã lưu cấu hình thành công!', 'success');
      } else {
        statusMessage.textContent = 'Lỗi lưu: ' + (data.error || 'Không xác định');
        showToast('Lỗi lưu cấu hình: ' + data.error, 'error');
      }
    } catch (err) {
      statusMessage.textContent = 'Lưu thất bại!';
      showToast('Không thể kết nối đến server!', 'error');
    }
  }

  // Lưu Cookies
  btnSaveCookies.addEventListener('click', async () => {
    const rawCookies = cookieJsonInput.value.trim();
    if (!rawCookies) {
      showToast('Vui lòng dán mã cookie JSON vào ô trước khi lưu!', 'error');
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
        showToast(`Đã cập nhật thành công ${data.count} cookie!`, 'success');
      } else {
        showToast('Lỗi lưu cookie: ' + data.error, 'error');
      }
    } catch (err) {
      showToast('Mã cookie không đúng định dạng JSON hợp lệ!', 'error');
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
    showToast(`Đã thêm @${cleanUsername} vào danh sách!`, 'success');
  });

  btnSelectAll.addEventListener('click', () => {
    document.querySelectorAll('.user-item-box input[type="checkbox"]').forEach((box) => (box.checked = true));
  });

  btnDeselectAll.addEventListener('click', () => {
    document.querySelectorAll('.user-item-box input[type="checkbox"]').forEach((box) => (box.checked = false));
  });

  btnSaveConfig.addEventListener('click', saveConfig);

  // Gửi Thử Tin Nhắn (Test Send)
  btnTestSend.addEventListener('click', async () => {
    const targetUser = testUsernameInput.value.trim().replace(/^@/, '');
    const videoUrl = testVideoUrlInput.value.trim();

    if (!targetUser) {
      showToast('Vui lòng nhập Username TikTok cần gửi thử!', 'error');
      return;
    }

    try {
      statusMessage.textContent = `Đang khởi động gửi tin nhắn thử tới @${targetUser}...`;
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

  // Bắt đầu gửi tự động
  btnStartSender.addEventListener('click', async () => {
    await saveConfig();
    try {
      const res = await fetch('/api/start', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        statusBadgeText.textContent = 'Đang chạy';
        statusPill.className = 'status-pill running';
        statusMessage.textContent = 'Đã khởi động tiến trình tự động gửi!';
        btnStartSender.disabled = true;
        btnStopSender.disabled = false;
        showToast('Đã khởi động tiến trình tự động gửi!', 'success');
      } else {
        showToast('Không thể chạy: ' + data.error, 'error');
      }
    } catch (err) {
      showToast('Lỗi khởi động!', 'error');
    }
  });

  // Dừng tiến trình
  btnStopSender.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/stop', { method: 'POST' });
      const data = await res.json();
      statusBadgeText.textContent = 'Đã dừng';
      statusPill.className = 'status-pill';
      statusMessage.textContent = 'Đã dừng tiến trình tự động gửi.';
      btnStartSender.disabled = false;
      btnStopSender.disabled = true;
      showToast('Đã dừng tiến trình!', 'info');
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
        statusPill.className = 'status-pill running';
        btnStartSender.disabled = true;
        btnStopSender.disabled = false;
      } else if (data.status === 'finished') {
        statusBadgeText.textContent = 'Hoàn thành';
        statusPill.className = 'status-pill';
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
