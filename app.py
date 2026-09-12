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

CONFIG_PATH = Path("config.json")
COOKIES_PATH = Path("cookies.json")

sender_status = {"state": "idle", "message": "Ready", "last_run": None}
active_thread: threading.Thread | None = None


def load_config() -> dict[str, Any]:
    if not CONFIG_PATH.exists():
        return {
            "schedule": {"time": "00:00", "timezone": "Asia/Ho_Chi_Minh", "run_on_start": True},
            "cookie_file": "cookies.json",
            "tiktok": {"message_delay_seconds": [8, 18], "headless": True},
            "recipients": [],
            "videos": [],
            "telegram": {"enabled": False, "bot_token": "", "chat_id": ""},
        }
    with CONFIG_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def save_config_file(data: dict[str, Any]) -> None:
    with CONFIG_PATH.open("w", encoding="utf-8") as file:
        json.dump(data, file, indent=2, ensure_ascii=False)


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
            return jsonify({"error": "Invalid payload"}), 400

        current_config = load_config()
        current_config.update(new_data)
        save_config_file(current_config)
        return jsonify({"message": "Configuration saved successfully", "config": current_config})
    except Exception as exc:
        logger.exception("Failed to update config")
        return jsonify({"error": str(exc)}), 500


@app.route("/api/cookies", methods=["POST"])
def save_cookies():
    try:
        payload = request.json
        cookies_data = payload.get("cookies")
        if not cookies_data:
            return jsonify({"error": "No cookies content provided"}), 400

        if isinstance(cookies_data, str):
            cookies_json = json.loads(cookies_data)
        else:
            cookies_json = cookies_data

        with COOKIES_PATH.open("w", encoding="utf-8") as file:
            json.dump(cookies_json, file, indent=2)

        config = load_config()
        config["cookie_file"] = str(COOKIES_PATH)
        save_config_file(config)

        is_valid = check_cookies_valid(COOKIES_PATH)
        return jsonify(
            {
                "message": "Cookies saved successfully",
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
    sender_status["message"] = "Sending daily streak video links..."
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        notifier = Notifier(config)
        video_pool = VideoPool(config)
        sender = TikTokSender(config, notifier, video_pool)

        loop.run_until_complete(sender.send_daily_links())
        loop.close()

        sender_status["state"] = "finished"
        sender_status["message"] = "Successfully sent streak links to recipients!"
    except Exception as exc:
        logger.exception("Worker error during send")
        sender_status["state"] = "failed"
        sender_status["message"] = f"Failed: {exc}"


@app.route("/api/start", methods=["POST"])
def start_sender():
    global active_thread, sender_status
    if active_thread and active_thread.is_alive():
        return jsonify({"error": "Sender is already running"}), 400

    config = load_config()
    if not check_cookies_valid(config.get("cookie_file", "cookies.json")):
        return jsonify({"error": "Cookies are expired or invalid. Please upload fresh cookies."}), 400

    if not config.get("recipients"):
        return jsonify({"error": "No recipients configured. Please select recipients."}), 400

    active_thread = threading.Thread(target=run_sender_worker, args=(config,), daemon=True)
    active_thread.start()
    return jsonify({"message": "Sender task started", "status": "running"})


@app.route("/api/stop", methods=["POST"])
def stop_sender():
    global sender_status
    sender_status["state"] = "stopped"
    sender_status["message"] = "Sender stopped by user"
    return jsonify({"message": "Sender process stopped"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
