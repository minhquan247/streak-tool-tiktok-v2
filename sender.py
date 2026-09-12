import asyncio
import json
import logging
import platform
import random
import time
from pathlib import Path
from typing import Any

from playwright.async_api import BrowserContext, Page, async_playwright

from captcha import handle_screen_time_popup, handle_sleep_hours_popup, wait_for_captcha_if_present
from notifier import Notifier
from video_pool import VideoPool


logger = logging.getLogger(__name__)


def get_chrome_path() -> str:
    system = platform.system()
    if system == "Windows":
        return r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    if system == "Darwin":
        return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    return "/usr/bin/google-chrome"


def get_default_user_data_dir() -> str:
    system = platform.system()
    if system == "Windows":
        return str(Path.home() / "AppData/Local/chrome-debug")
    if system == "Darwin":
        return str(Path.home() / "Library/Application Support/chrome-debug")
    return str(Path.home() / ".config/chrome-debug")


def get_user_data_dir_key() -> str:
    system = platform.system()
    if system == "Windows":
        return "user_data_dir_windows"
    if system == "Darwin":
        return "user_data_dir_macos"
    return "user_data_dir_linux"


import tempfile

logger = logging.getLogger(__name__)


def resolve_cookie_path(cookie_file: str | Path) -> Path:
    path = Path(cookie_file)
    if path.exists():
        return path
    tmp_path = Path(tempfile.gettempdir()) / path.name
    if tmp_path.exists():
        return tmp_path
    return path


def check_cookies_valid(cookie_file: str | Path) -> bool:
    cookie_path = resolve_cookie_path(cookie_file)
    if not cookie_path.exists():
        return False

    try:
        with cookie_path.open("r", encoding="utf-8") as file:
            cookies = json.load(file)
    except Exception:
        logger.exception("Failed to load cookies from %s", cookie_path)
        return False

    for cookie in cookies:
        if cookie.get("name") != "sessionid":
            continue

        if not cookie.get("value"):
            return False

        expires = cookie.get("expires", cookie.get("expirationDate"))
        if expires is None:
            return True

        try:
            return time.time() < float(expires)
        except (TypeError, ValueError):
            logger.warning("Invalid sessionid expiry timestamp in %s: %r", cookie_path, expires)
            return False

    return False


def show_cookie_warning_if_ui_running() -> None:
    try:
        import tkinter
        from tkinter import messagebox

        root = tkinter._default_root
        if root:
            root.after(
                0,
                lambda: messagebox.showwarning(
                    "Cookies expired",
                    "Cookies expired or invalid. Please re-export from EditThisCookie.",
                ),
            )
    except Exception:
        logger.debug("Could not show cookie expiry warning in UI", exc_info=True)


def log_duration(step: str, start_time: float) -> None:
    logger.info("%s took %.2fs", step, time.time() - start_time)


async def timed_await(step: str, awaitable: Any) -> Any:
    start_time = time.time()
    try:
        result = await awaitable
    except Exception:
        logger.exception("%s failed after %.2fs", step, time.time() - start_time)
        raise
    logger.info("%s took %.2fs", step, time.time() - start_time)
    return result


class TikTokSender:
    def __init__(
        self,
        config: dict[str, Any],
        notifier: Notifier,
        video_pool: VideoPool,
        status_cb: Any = None,
    ) -> None:
        self.config = config
        self.notifier = notifier
        self.video_pool = video_pool
        self.tiktok_config = config.get("tiktok", {})
        self.recipients = config.get("recipients", [])
        self.status_cb = status_cb

    def log_status(self, message: str, level: str = "info") -> None:
        logger.info(message)
        if self.status_cb:
            try:
                self.status_cb(message, level)
            except Exception:
                pass

    async def send_daily_links(self) -> None:
        if not self.recipients:
            self.log_status("Chưa có tài khoản nhận nào trong danh sách.", "warn")
            return

        cookie_file = self.config.get("cookie_file", "cookies.json")
        if not check_cookies_valid(cookie_file):
            self.log_status("Cookie hết hạn hoặc không hợp lệ. Vui lòng cập nhật mã Cookie mới.", "error")
            show_cookie_warning_if_ui_running()
            return

        self.log_status(f"Bắt đầu tiến trình gửi streak đến {len(self.recipients)} người nhận...")
        self.log_status("Đang khởi tạo trình duyệt Playwright...")

        async with async_playwright() as playwright:
            is_headless = self.tiktok_config.get("headless", True)
            launch_args = [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-blink-features=AutomationControlled",
            ]

            browser = None
            context = None
            custom_exec = self.tiktok_config.get("executable_path")
            
            if custom_exec and Path(custom_exec).exists():
                self.log_status(f"Mở trình duyệt tùy chỉnh (Headless={is_headless})...")
                browser = await playwright.chromium.launch(
                    executable_path=custom_exec,
                    headless=is_headless,
                    args=launch_args,
                )
            else:
                self.log_status(f"Mở trình duyệt Chromium (Headless={is_headless})...")
                try:
                    browser = await playwright.chromium.launch(
                        headless=is_headless,
                        args=launch_args,
                    )
                except Exception as launch_err:
                    chrome_path = get_chrome_path()
                    if Path(chrome_path).exists():
                        self.log_status(f"Thử mở Google Chrome hệ thống tại {chrome_path}...", "warn")
                        browser = await playwright.chromium.launch(
                            executable_path=chrome_path,
                            headless=is_headless,
                            args=launch_args,
                        )
                    else:
                        raise launch_err

            context = await browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            )
            context.set_default_timeout(int(self.tiktok_config.get("navigation_timeout_ms", 60000)))

            try:
                page = await context.new_page()
                self.log_status("Đang nạp Cookie TikTok vào trình duyệt...")
                cookies_loaded = await self._load_cookies(context)

                self.log_status("Đang kiểm tra trang đăng nhập TikTok...")
                await self._ensure_logged_in(page, cookies_loaded=cookies_loaded)

                success_count = 0
                fail_count = 0

                for idx, recipient in enumerate(self.recipients, 1):
                    username = recipient.get("username") or recipient.get("name")
                    self.log_status(f"[{idx}/{len(self.recipients)}] Tiến hành gửi streak tới @{username}...")
                    try:
                        await self._send_to_recipient(context, recipient)
                        success_count += 1
                        self.log_status(f"✓ Đã gửi thành công tới @{username}!", "success")
                    except Exception as exc:
                        fail_count += 1
                        logger.exception("Lỗi khi gửi tới @%s", username)
                        self.log_status(f"✗ Thất bại gửi tới @{username}: {exc}", "error")

                    if idx < len(self.recipients):
                        await self._sleep_between_messages()

                total_msg = f"Hoàn tất gửi streak! Thành công: {success_count}/{len(self.recipients)}, Thất bại: {fail_count}."
                self.log_status(total_msg, "success" if fail_count == 0 else "warn")
            finally:
                if context:
                    await context.close()
                if browser:
                    await browser.close()

    async def _load_cookies(self, context: BrowserContext) -> bool:
        cookie_file = resolve_cookie_path(self.config.get("cookie_file", "cookies.json"))
        if not cookie_file.exists():
            return False

        with cookie_file.open("r", encoding="utf-8") as file:
            cookies = json.load(file)

        if any("expirationDate" in cookie for cookie in cookies):
            same_site_map = {
                "unspecified": "None",
                "no_restriction": "None",
                "lax": "Lax",
                "strict": "Strict",
            }
            converted = []
            for cookie in cookies:
                if cookie.get("session", False):
                    continue
                exp_val = cookie.get("expirationDate") or cookie.get("expires")
                try:
                    exp_timestamp = int(float(exp_val)) if exp_val is not None else int(time.time() + 86400 * 30)
                except (ValueError, TypeError):
                    exp_timestamp = int(time.time() + 86400 * 30)

                converted.append(
                    {
                        "name": cookie["name"],
                        "value": cookie["value"],
                        "domain": cookie["domain"],
                        "path": cookie.get("path", "/"),
                        "expires": exp_timestamp,
                        "httpOnly": cookie.get("httpOnly", False),
                        "secure": cookie.get("secure", False),
                        "sameSite": same_site_map.get(
                            cookie.get("sameSite", "unspecified"),
                            "None",
                        ),
                    }
                )
            cookies = converted
            cookie_format = "EditThisCookie"
        elif any("expires" in cookie for cookie in cookies):
            cookie_format = "Playwright"
        else:
            cookie_format = "unknown"

        await context.add_cookies(cookies)
        logger.info(
            "Detected %s cookie format and loaded %d cookies from %s",
            cookie_format,
            len(cookies),
            cookie_file,
        )
        return True

    async def _ensure_logged_in(self, page: Page, cookies_loaded: bool = False) -> None:
        self.log_status("Đang kiểm tra giao diện tin nhắn TikTok...")
        await page.goto("https://www.tiktok.com/messages", wait_until="domcontentloaded", timeout=30000)
        await handle_screen_time_popup(page)
        await handle_sleep_hours_popup(page)
        await wait_for_captcha_if_present(page, self.notifier)
        await handle_screen_time_popup(page)
        await handle_sleep_hours_popup(page)

        if "login" in page.url.lower():
            if cookies_loaded:
                logger.error("Cookie expired or invalid")
            await self.notifier.telegram(
                "Yêu cầu đăng nhập TikTok. Vui lòng cập nhật lại cookie mới."
            )
            self.notifier.desktop(
                "Yêu cầu đăng nhập TikTok",
                "Vui lòng cập nhật lại cookie để tiếp tục gửi streak.",
            )
            err_msg = "TikTok bị điều hướng sang trang đăng nhập. Cookie đã hết hạn hoặc không hợp lệ, vui lòng cập nhật lại Cookie!"
            self.log_status(err_msg, "error")
            raise RuntimeError(err_msg)
        else:
            self.log_status("Đã đăng nhập thành công vào TikTok!", "success")

    async def _send_to_recipient(self, context: BrowserContext, recipient: dict[str, Any]) -> None:
        name = recipient.get("name", "recipient")
        username = recipient.get("username")
        if not username:
            logger.warning("Skipping %s because username is missing.", name)
            return

        send_method = self.config.get("send_method", "video")
        message_to_send = ""

        if send_method == "text":
            texts = [
                t.strip()
                for t in self.config.get("text_messages", [])
                if isinstance(t, str) and t.strip()
            ]
            if not texts:
                self.log_status(f"⚠️ Không có nội dung text nào được thiết lập. Bỏ qua @{username}.", "warn")
                return
            message_to_send = random.choice(texts)
            logger.info("Selected text for %s (@%s): %s", name, username, message_to_send)
        else:
            videos = [
                video.strip()
                for video in self.config.get("videos", [])
                if isinstance(video, str) and video.strip()
            ]
            if not videos:
                message_to_send = "https://www.tiktok.com/@tiktok"
            else:
                message_to_send = random.choice(videos)
            logger.info("Selected video for %s (@%s): %s", name, username, message_to_send)

        page = await timed_await(f"new page for @{username}", context.new_page())
        try:
            total_start = time.time()
            logger.info("Selecting recipient for %s (@%s)", name, username)
            await timed_await(f"select recipient for @{username}", self._select_recipient(page, username))
            await timed_await(
                f"post-select captcha wait for @{username}",
                wait_for_captcha_if_present(page, self.notifier),
            )
            await timed_await(
                f"post-select screen time popup check for @{username}",
                handle_screen_time_popup(page),
            )
            await timed_await(
                f"post-select sleep hours popup check for @{username}",
                handle_sleep_hours_popup(page),
            )
            send_start = time.time()
            await timed_await(f"message send call for @{username}", self._send_message(page, message_to_send))
            log_duration(f"message send for @{username}", send_start)
            await timed_await(
                f"post-send captcha wait for @{username}",
                wait_for_captcha_if_present(page, self.notifier),
            )
            await timed_await(
                f"post-send screen time popup check for @{username}",
                handle_screen_time_popup(page),
            )
            await timed_await(
                f"post-send sleep hours popup check for @{username}",
                handle_sleep_hours_popup(page),
            )
            logger.info("Sent message to %s: %s", name, message_to_send)
            log_duration(f"total send flow for @{username}", total_start)
            self.log_status(
                f"✅ Đã gửi streak thành công đến {name} (@{username})", "success"
            )
        finally:
            await timed_await(f"close page for @{username}", page.close())

    async def _select_recipient(self, page: Page, username: str) -> None:
        normalized_username = username.lstrip("@")

        # Bước 1: Lấy Display Name từ Profile
        self.log_status(f"Mở trang cá nhân TikTok của @{normalized_username}...")
        try:
            await page.goto(f"https://www.tiktok.com/@{normalized_username}", wait_until="domcontentloaded", timeout=25000)
            await handle_screen_time_popup(page)
            await handle_sleep_hours_popup(page)
            await wait_for_captcha_if_present(page, self.notifier)

            display_name_locator = page.locator("h1[data-e2e='user-title']").first
            if await display_name_locator.count() == 0:
                display_name_locator = page.locator("[data-e2e='user-title']").first
            
            await display_name_locator.wait_for(state="visible", timeout=10000)
            display_name = (await display_name_locator.inner_text()).strip()
            self.log_status(f"Đã trích xuất tên hiển thị: '{display_name}'")
        except Exception as exc:
            raise ValueError(f"Không thể truy cập trang cá nhân hoặc lấy Tên hiển thị của @{normalized_username}: {exc}")

        # Bước 2: Vào trang Messages và cuộn tìm
        self.log_status("Mở trang TikTok Messages...")
        await page.goto("https://www.tiktok.com/messages", wait_until="domcontentloaded", timeout=25000)
        await handle_screen_time_popup(page)
        await handle_sleep_hours_popup(page)
        await wait_for_captcha_if_present(page, self.notifier)
        
        conversation_list = page.locator("[data-e2e='dm-new-conversation-list']").first
        conversation_items = page.locator("[data-e2e='dm-new-conversation-item']")
        
        try:
            await conversation_items.first.wait_for(state="visible", timeout=15000)
        except Exception:
            raise ValueError("Không thể load danh sách cuộc trò chuyện.")

        normalized_display_name = display_name.casefold()
        
        self.log_status(f"Đang quét danh sách tìm '{display_name}'...")
        for scroll_index in range(10):
            item_count = await conversation_items.count()
            for index in range(item_count):
                item = conversation_items.nth(index)
                nickname_locator = item.locator("[data-e2e='dm-new-conversation-nickname']")
                if await nickname_locator.count() > 0:
                    nickname_text = (await nickname_locator.inner_text()).strip()
                    if nickname_text.casefold() == normalized_display_name:
                        self.log_status(f"Đã chọn đúng cuộc trò chuyện với '{nickname_text}'!")
                        await item.click()
                        await page.wait_for_timeout(1000)
                        await handle_screen_time_popup(page)
                        await handle_sleep_hours_popup(page)
                        return

            # Nếu chưa tìm thấy thì scroll xuống
            self.log_status(f"Cuộn danh sách tìm kiếm (Lần {scroll_index + 1})...")
            try:
                await conversation_list.evaluate("(element) => element.scrollBy(0, 400)")
            except Exception:
                pass
            await page.wait_for_timeout(1000)
            
        raise ValueError(f"Không tìm thấy người nhận '{display_name}' trong danh sách tin nhắn sau 10 lần cuộn.")

    async def _send_message(self, page: Page, message: str) -> None:
        self.log_status("Đang tìm ô nhập tin nhắn...")
        input_locator = page.locator(
            ".public-DraftEditor-content, "
            "div[contenteditable='true'][placeholder*='Send' i], "
            "div[contenteditable='true'][placeholder*='message' i], "
            "div[contenteditable='true'][placeholder*='Nhắn' i], "
            "div[contenteditable='true'], "
            "[contenteditable='true'][aria-label*='Send' i], "
            "[contenteditable='true'][aria-label*='message' i], "
            "[contenteditable='true']"
        ).first

        await input_locator.wait_for(state="visible", timeout=10000)
        await input_locator.click()
        await page.wait_for_timeout(300)
        self.log_status("Đang nhập nội dung tin nhắn...")
        await page.keyboard.type(message)
        await page.wait_for_timeout(500)
        self.log_status("Đang gửi tin nhắn (bấm Enter)...")
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(1000)
        
        # Fallback: Click the send button if Enter didn't work
        try:
            send_btn = page.locator("svg[data-e2e='send-icon'], button[data-e2e='send-message-button'], div[data-e2e='chat-send-button'], [data-e2e='send-icon']").first
            if await send_btn.is_visible(timeout=500):
                self.log_status("Bấm nút Gửi (Send)...")
                await send_btn.click()
                await page.wait_for_timeout(1000)
        except Exception:
            pass

    async def _sleep_between_messages(self) -> None:
        delay_range = self.tiktok_config.get("message_delay_seconds", [8, 18])
        if not isinstance(delay_range, list) or len(delay_range) != 2:
            delay_range = [8, 18]
        low, high = sorted(int(value) for value in delay_range)
        await asyncio.sleep(random.randint(low, high))
