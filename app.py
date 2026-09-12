import asyncio
import json
import logging
import os
import threading
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, render_template, request
from flask_cors import CORS

from notifier import Notifier
from sender import TikTokSender, check_cookies_valid
from video_pool import VideoPool

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = Flask(__name__, template_folder="templates", static_folder="static")
CORS(app)

import tempfile

CONFIG_PATH = Path("config.json")
COOKIES_PATH = Path("cookies.json")

sender_status = {"state": "idle", "message": "Sẵn sàng", "last_run": None}
active_thread: threading.Thread | None = None


def get_readable_config_path() -> Path:
    if CONFIG_PATH.exists():
        return CONFIG_PATH
    tmp_path = Path(tempfile.gettempdir()) / "config.json"
    if tmp_path.exists():
        return tmp_path
    return CONFIG_PATH


def get_readable_cookies_path(cookie_file: str | Path = "cookies.json") -> Path:
    p = Path(cookie_file)
    if p.exists():
        return p
    tmp_path = Path(tempfile.gettempdir()) / p.name
    if tmp_path.exists():
        return tmp_path
    return p


def load_config() -> dict[str, Any]:
    config_path = get_readable_config_path()
    if not config_path.exists():
        return {
            "schedule": {"time": "00:00", "timezone": "Asia/Ho_Chi_Minh", "run_on_start": True},
            "cookie_file": "cookies.json",
            "tiktok": {"message_delay_seconds": [8, 18], "headless": True},
            "recipients": [],
            "videos": [],
            "telegram": {"enabled": False, "bot_token": "", "chat_id": ""},
        }
    try:
        with config_path.open("r", encoding="utf-8") as file:
            return json.load(file)
    except Exception:
        logger.exception("Failed to load config from %s", config_path)
        return {
            "schedule": {"time": "00:00", "timezone": "Asia/Ho_Chi_Minh", "run_on_start": True},
            "cookie_file": "cookies.json",
            "tiktok": {"message_delay_seconds": [8, 18], "headless": True},
            "recipients": [],
            "videos": [],
            "telegram": {"enabled": False, "bot_token": "", "chat_id": ""},
        }


def save_config_file(data: dict[str, Any]) -> Path:
    try:
        with CONFIG_PATH.open("w", encoding="utf-8") as file:
            json.dump(data, file, indent=2, ensure_ascii=False)
        return CONFIG_PATH
    except (OSError, PermissionError):
        tmp_path = Path(tempfile.gettempdir()) / "config.json"
        with tmp_path.open("w", encoding="utf-8") as file:
            json.dump(data, file, indent=2, ensure_ascii=False)
        return tmp_path


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/config", methods=["GET"])
def get_config():
    config = load_config()
    cookies_valid = check_cookies_valid(config.get("cookie_file", "cookies.json"))
    return jsonify({"config": config, "cookies_valid": cookies_valid})


@app.route("/api/config", methods=["POST"])
def update_config():
    try:
        new_data = request.json
        if not new_data:
            return jsonify({"error": "Dữ liệu gửi lên không hợp lệ"}), 400

        current_config = load_config()
        current_config.update(new_data)
        save_config_file(current_config)
        return jsonify({"message": "Đã lưu cấu hình thành công", "config": current_config})
    except Exception as exc:
        logger.exception("Failed to update config")
        return jsonify({"error": str(exc)}), 500


@app.route("/api/cookies", methods=["POST"])
def save_cookies():
    try:
        payload = request.json
        cookies_data = payload.get("cookies")
        if not cookies_data:
            return jsonify({"error": "Không tìm thấy nội dung cookie"}), 400

        if isinstance(cookies_data, str):
            cookies_json = json.loads(cookies_data)
        else:
            cookies_json = cookies_data

        saved_path = COOKIES_PATH
        try:
            with COOKIES_PATH.open("w", encoding="utf-8") as file:
                json.dump(cookies_json, file, indent=2)
        except (OSError, PermissionError):
            saved_path = Path(tempfile.gettempdir()) / "cookies.json"
            with saved_path.open("w", encoding="utf-8") as file:
                json.dump(cookies_json, file, indent=2)

        config = load_config()
        config["cookie_file"] = str(saved_path)
        save_config_file(config)

        is_valid = check_cookies_valid(saved_path)
        return jsonify(
            {
                "message": "Đã lưu cookie thành công",
                "valid": is_valid,
                "count": len(cookies_json) if isinstance(cookies_json, list) else 0,
            }
        )
    except Exception as exc:
        logger.exception("Failed to save cookies")
        return jsonify({"error": str(exc)}), 500


@app.route("/api/status", methods=["GET"])
def get_status():
    config = load_config()
    cookies_valid = check_cookies_valid(config.get("cookie_file", "cookies.json"))
    return jsonify(
        {
            "status": sender_status["state"],
            "message": sender_status["message"],
            "last_run": sender_status["last_run"],
            "cookies_valid": cookies_valid,
        }
    )


def run_sender_worker(config: dict[str, Any]) -> None:
    global sender_status
    sender_status["state"] = "running"
    sender_status["message"] = "Đang gửi video streak TikTok đến danh sách bạn bè..."
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        notifier = Notifier(config)
        video_pool = VideoPool(config)
        sender = TikTokSender(config, notifier, video_pool)

        loop.run_until_complete(sender.send_daily_links())
        loop.close()

        sender_status["state"] = "finished"
        sender_status["message"] = "Đã gửi thành công video streak đến tất cả người nhận!"
    except Exception as exc:
        logger.exception("Worker error during send")
        sender_status["state"] = "failed"
        sender_status["message"] = f"Lỗi tiến trình: {exc}"


@app.route("/api/start", methods=["POST"])
def start_sender():
    global active_thread, sender_status
    if active_thread and active_thread.is_alive():
        return jsonify({"error": "Tiến trình gửi streak đang chạy"}), 400

    config = load_config()
    if not check_cookies_valid(config.get("cookie_file", "cookies.json")):
        return jsonify({"error": "Cookie đã hết hạn hoặc không hợp lệ. Vui lòng dán lại cookie mới."}), 400

    if not config.get("recipients"):
        return jsonify({"error": "Chưa có người nhận nào được chọn. Vui lòng chọn người nhận."}), 400

    active_thread = threading.Thread(target=run_sender_worker, args=(config,), daemon=True)
    active_thread.start()
    return jsonify({"message": "Đã khởi động tiến trình gửi streak", "status": "running"})


@app.route("/api/stop", methods=["POST"])
def stop_sender():
    global sender_status
    sender_status["state"] = "stopped"
    sender_status["message"] = "Đã dừng tiến trình theo yêu cầu của người dùng"
    return jsonify({"message": "Đã dừng tiến trình gửi streak"})


def run_test_send_worker(config: dict[str, Any], test_username: str, test_video: str) -> None:
    global sender_status
    sender_status["state"] = "running"
    sender_status["message"] = f"Đang gửi tin nhắn thử nghiệm tới @{test_username}..."
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        test_config = dict(config)
        test_config["recipients"] = [{"name": test_username, "username": test_username}]
        if test_video:
            test_config["videos"] = [test_video]

        notifier = Notifier(test_config)
        video_pool = VideoPool(test_config)
        sender = TikTokSender(test_config, notifier, video_pool)

        loop.run_until_complete(sender.send_daily_links())
        loop.close()

        sender_status["state"] = "finished"
        sender_status["message"] = f"Đã gửi thử tin nhắn thành công tới @{test_username}!"
    except Exception as exc:
        logger.exception("Test send worker error")
        sender_status["state"] = "failed"
        sender_status["message"] = f"Lỗi gửi thử: {exc}"


@app.route("/api/test-send", methods=["POST"])
def test_send():
    global active_thread, sender_status
    if active_thread and active_thread.is_alive():
        return jsonify({"error": "Đang có tiến trình khác đang chạy, vui lòng chờ"}), 400

    payload = request.json or {}
    target_user = payload.get("username", "").strip().lstrip("@")
    video_url = payload.get("video_url", "").strip()

    if not target_user:
        return jsonify({"error": "Vui lòng nhập TikTok username cần gửi thử"}), 400

    config = load_config()
    if not check_cookies_valid(config.get("cookie_file", "cookies.json")):
        return jsonify({"error": "Cookie hết hạn hoặc không hợp lệ. Vui lòng cập nhật cookie trước khi gửi thử."}), 400

    active_thread = threading.Thread(
        target=run_test_send_worker,
        args=(config, target_user, video_url),
        daemon=True,
    )
    active_thread.start()
    return jsonify({"message": f"Đang bắt đầu gửi tin nhắn thử nghiệm tới @{target_user}..."})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
