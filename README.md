# TikTok Automatic Sender (Web Dashboard Version)

Tự động gửi video TikTok hàng ngày đến danh sách bạn bè để duy trì streak với **Giao diện Web Dashboard hiện đại** (Tương thích Vercel & Ubuntu VPS).

## Tính năng

- **Web Dashboard UI (Flask & Glassmorphism Theme)**: Quản lý cấu hình, cookies, danh sách bạn bè và video ngay trên trình duyệt di động hoặc máy tính.
- **Tương thích Vercel Deployment**: Hỗ trợ triển khai nhanh lên Vercel Serverless Platform qua `vercel.json`.
- **Tự động gửi Streak**: Hỗ trợ đa nền tảng (Linux/Ubuntu, Windows, macOS).
- **Lên lịch tự động**: Gửi tự động hàng ngày theo giờ cố định.
- **Inject Cookie**: Hỗ trợ dán hoặc upload file `cookies.json` trực tiếp từ Web UI.
- **Telegram Notifier**: Gửi thông báo đến Telegram Bot khi gửi thành công hoặc cần xử lý Captcha.

## Yêu cầu

- Python 3.10+
- Google Chrome / Playwright Chromium
- Tài khoản TikTok đã đăng nhập

## Cài đặt

```bash
# Clone repo
git clone https://github.com/minhquan247/streak-tool-tiktok-v2.git
cd streak-tool-tiktok-v2

# Tạo virtual environment
python3 -m venv .venv
source .venv/bin/activate  # Linux/macOS
.venv\Scripts\activate     # Windows

# Cài dependencies
pip install -r requirements.txt
playwright install chromium
```

---

## 🌐 Chạy Web Dashboard tại Cục Bộ (Local Web App)

```bash
python3 app.py
```
Mở trình duyệt truy cập: `http://localhost:5000`

---

## ☁️ Triển khai Web Dashboard lên Vercel

1. Cài đặt Vercel CLI hoặc kết nối GitHub repo `minhquan247/streak-tool-tiktok-v2` với [Vercel Dashboard](https://vercel.com).
2. Khi import dự án vào Vercel, Vercel sẽ tự động phát hiện `vercel.json` và cấu hình Flask Serverless Function (`app.py`).
3. Nhấn **Deploy** để sở hữu trang Web Dashboard quản lý của riêng bạn.

---

## 🐧 Hướng dẫn chạy trên Ubuntu VPS (Headless / CLI 24/7)

### 💻 Cấu hình VPS đề xuất
- **CPU**: 1 vCPU
- **RAM**: 1 GB RAM (hoặc 2 GB)
- **Disk**: 10 GB - 15 GB SSD
- **OS**: Ubuntu 22.04 LTS / 24.04 LTS

### 💡 Mẹo nhỏ tối ưu khi thuê VPS 1GB RAM (Tạo Swap RAM)

Để phòng trường hợp Chromium ngốn bộ nhớ lúc tải trang làm văng script, hãy tạo 2GB Swap RAM bằng các lệnh sau:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 2. Cài đặt trên VPS Ubuntu

```bash
# Update hệ thống & cài thư viện cần thiết
sudo apt update && sudo apt install -y python3-pip python3-venv git tmux

# Clone repo & truy cập thư mục
git clone https://github.com/minhquan247/streak-tool-tiktok-v2.git
cd streak-tool-tiktok-v2

# Tạo môi trường ảo & cài đặt dependencies
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
playwright install-deps  # ⚠️ Cài đặt các thư viện phụ thuộc hệ thống cho Chromium trên Ubuntu
```

### 3. Thiết lập cho VPS (Headless mode)

Trong file `config.json` trên VPS, hãy đảm bảo đặt `"headless": true`:

```json
"tiktok": {
  "headless": true
}
```

Upload file `cookies.json` đã export từ máy cá nhân lên thư mục project trên VPS.

### 4. Chạy ngầm 24/7 với `tmux`

```bash
# Mở session tmux mới
tmux new -s tiktok

# Kích hoạt môi trường và chạy script
source .venv/bin/activate
python3 main.py

# Thoát màn hình tmux (script vẫn chạy ngầm): Nhấn Ctrl + B rồi nhấn D
# Khi muốn mở lại xem log: tmux attach -t tiktok
```

---

## Lưu ý

- `cookies.json` hết hạn sau vài tháng → cần export lại
- Không commit `cookies.json` và `config.json` chứa thông tin nhạy cảm lên GitHub
- Giữ process chạy liên tục để scheduler hoạt động (dùng `tmux` hoặc `screen` trên Linux)

> ⚠️ **Disclaimer:** This project is for educational purposes only. 
> Automated interaction with TikTok may violate their Terms of Service.
> Use at your own risk.

