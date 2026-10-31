"""Observe Cookie Clicker and Cloudflare challenge transitions over time.

Run from the CookieClickerBot project root using its .venv Python.
Uses the bot's current Playwright persistent-context launch options but a fresh,
disposable profile. It does not read or modify config.json, browser_profile, or
save files. It does not solve challenges, retry, alter fingerprints, or bypass.

Unlike diagnose_ccbot_loading.py, this script NEVER stops just because
Game.ready becomes true. It continues observing for the full time window so a
challenge appearing a few seconds after initial game readiness is captured.
"""
from __future__ import annotations

import importlib.metadata
import tempfile
import time
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright
from ccbot.bridge import STEALTH_ARGS

GAME_URL = "https://orteil.dashnet.org/cookieclicker/"
GAME_HOST = "orteil.dashnet.org"
OBSERVE_SECONDS = 75
SAMPLE_INTERVAL = 2.0
RELEVANT_TYPES = {"document", "script", "xhr", "fetch"}


def safe_url(url: str) -> str:
    """Drop query and fragment so tokens are not printed."""
    try:
        p = urlsplit(url)
        return f"{p.scheme}://{p.netloc}{p.path}"
    except Exception:
        return "(unparseable URL)"


def get_host(url: str) -> str:
    try:
        return urlsplit(url).hostname or "(unknown host)"
    except Exception:
        return "(unknown host)"


def stamp(start: float) -> str:
    return f"+{time.monotonic() - start:6.1f}s"


def main() -> int:
    print("=" * 74)
    print("CookieClickerBot / loading-to-challenge timeline diagnostic")
    print("=" * 74)
    print("Fresh temporary profile; existing browser_profile/config/saves are untouched.")
    print("Same persistent-context launch style and flags as the current bot.")
    print("IMPORTANT: observation continues AFTER Game.ready for the full time window.")
    print("No challenge solving, retries, fingerprint changes, or bypass attempts.")
    print(f"Observation window: {OBSERVE_SECONDS}s; sample interval: {SAMPLE_INTERVAL:.0f}s\n")

    start = time.monotonic()
    counts = {"responses": 0, "http_errors": 0, "cf_challenges": 0, "request_failed": 0}
    seen: set[tuple[str, int, str, str]] = set()
    pages_seen: set[int] = set()

    with tempfile.TemporaryDirectory(prefix="ccbot_timeline_diag_") as profile_dir:
        with sync_playwright() as playwright:
            print("Playwright:", importlib.metadata.version("playwright"))
            print("Chromium executable:", playwright.chromium.executable_path)
            context = playwright.chromium.launch_persistent_context(
                user_data_dir=str(Path(profile_dir)),
                headless=False,
                args=list(STEALTH_ARGS),
                viewport={"width": 1440, "height": 900},
                locale="ja-JP",
                ignore_default_args=["--enable-automation"],
                no_viewport=False,
            )
            try:
                browser = context.browser
                print("Chromium version:", browser.version if browser else "unknown")

                def attach_page(page):
                    pid = id(page)
                    if pid in pages_seen:
                        return
                    pages_seen.add(pid)
                    print(stamp(start), "PAGE OPENED")

                    def on_response(response):
                        req = response.request
                        typ = req.resource_type
                        hst = get_host(response.url)
                        status = response.status
                        try:
                            headers = response.all_headers()
                        except Exception:
                            headers = {}
                        cf = headers.get("cf-mitigated", "")
                        path = urlsplit(response.url).path if response.url else ""
                        is_challenge_path = "/cdn-cgi/challenge-platform/" in path
                        relevant = (hst == GAME_HOST or is_challenge_path or cf == "challenge"
                                    or status >= 400)
                        # Ignore successful third-party ad/analytics traffic; retain game,
                        # Cloudflare challenge, and every HTTP error response.
                        if not relevant:
                            return
                        key = (safe_url(response.url), status, typ, cf)
                        if key in seen:
                            return
                        seen.add(key)
                        counts["responses"] += 1
                        if status >= 400:
                            counts["http_errors"] += 1
                        if cf == "challenge":
                            counts["cf_challenges"] += 1
                        ct = headers.get("content-type", "(absent)").split(";")[0]
                        ray = headers.get("cf-ray", "(absent)")
                        print(f"{stamp(start)} RESPONSE {status} {typ} {safe_url(response.url)}")
                        if hst == GAME_HOST or cf or status >= 400 or is_challenge_path:
                            print("   host:", hst, "content-type:", ct,
                                  "cf-mitigated:", cf or "(absent)", "cf-ray:", ray or "(absent)")

                    def on_request_failed(request):
                        typ = request.resource_type
                        hst = get_host(request.url)
                        path = urlsplit(request.url).path if request.url else ""
                        if hst == GAME_HOST or "/cdn-cgi/challenge-platform/" in path or typ == "document":
                            counts["request_failed"] += 1
                            print(f"{stamp(start)} REQUEST FAILED {typ} {safe_url(request.url)} :: {request.failure or '(no detail)'}")

                    def on_console(message):
                        if message.type == "error":
                            msg = message.text.replace("\n", " ")[:260]
                            print(f"{stamp(start)} CONSOLE ERROR: {msg}")

                    def on_page_error(error):
                        print(f"{stamp(start)} PAGE ERROR: {str(error).replace(chr(10), ' ')[:260]}")

                    def on_frame_navigated(frame):
                        if frame == page.main_frame:
                            print(f"{stamp(start)} MAIN FRAME NAVIGATION: {safe_url(frame.url)}")
                        else:
                            low = frame.url.lower()
                            if any(s in low for s in ("challenge", "turnstile", "cloudflare", "recaptcha")):
                                print(f"{stamp(start)} CHALLENGE-RELATED FRAME: {safe_url(frame.url)}")

                    page.on("response", on_response)
                    page.on("requestfailed", on_request_failed)
                    page.on("console", on_console)
                    page.on("pageerror", on_page_error)
                    page.on("framenavigated", on_frame_navigated)

                context.on("page", attach_page)
                page = context.pages[0] if context.pages else context.new_page()
                attach_page(page)

                try:
                    nav = page.goto(GAME_URL, wait_until="domcontentloaded", timeout=90000)
                    print(f"{stamp(start)} INITIAL NAVIGATION STATUS:", nav.status if nav else "no response")
                except Exception as exc:
                    print(f"{stamp(start)} INITIAL NAVIGATION ERROR: {type(exc).__name__}: {str(exc)[:280]}")

                deadline = time.monotonic() + OBSERVE_SECONDS
                sample_no = 0
                previous_signature = None
                while time.monotonic() < deadline:
                    time.sleep(SAMPLE_INTERVAL)
                    sample_no += 1
                    open_pages = [p for p in context.pages if not p.is_closed()]
                    if not open_pages:
                        print(f"{stamp(start)} NO OPEN PAGES; continuing until observation deadline")
                        continue
                    # Inspect the original game page where possible.
                    target = page if not page.is_closed() else open_pages[0]
                    try:
                        state = target.evaluate(r"""() => {
                          const body = document.body;
                          const text = (body?.innerText || '').slice(0, 520).replace(/\\s+/g, ' ');
                          const visible = (el) => !!el && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
                          const title = document.title || '';
                          const gameExists = typeof window.Game !== 'undefined';
                          const gameReady = !!(gameExists && window.Game.ready);
                          const cloudflareText = /just a moment|verify you are human|performing security verification|security check|checking your browser/i.test(title + ' ' + text);
                          const challengeDom = !!(
                            document.querySelector('input[name="cf-turnstile-response"]') ||
                            document.querySelector('#challenge-form') ||
                            document.querySelector('#cf-challenge-running') ||
                            document.querySelector('iframe[src*="challenges.cloudflare.com"]')
                          );
                          const scripts = Array.from(document.scripts).map(s => s.src).filter(Boolean)
                            .filter(s => /orteil|cloudflare|turnstile/i.test(s)).slice(0, 30);
                          const frames = Array.from(document.querySelectorAll('iframe')).map(f => f.src).filter(Boolean)
                            .filter(s => /challenge|turnstile|cloudflare|recaptcha/i.test(s)).slice(0, 20);
                          return {
                            href: location.href, title, readyState: document.readyState, text,
                            gameExists, gameReady,
                            gameVersion: gameExists ? (window.Game.version || '') : '',
                            loaderVisible: visible(document.querySelector('#loader')),
                            failedToLoadVisible: visible(document.querySelector('#failedToLoad')),
                            challengeDetected: cloudflareText || challengeDom,
                            challengeDom, scripts, frames
                          };
                        }""")
                        signature = (
                            state.get("title"), state.get("readyState"), state.get("gameReady"),
                            state.get("loaderVisible"), state.get("failedToLoadVisible"),
                            state.get("challengeDetected"), state.get("href")
                        )
                        changed = signature != previous_signature
                        previous_signature = signature
                        # Print each sample; annotate state transitions for easier timeline review.
                        flags = (
                            f"readyState={state.get('readyState')} gameExists={state.get('gameExists')} "
                            f"gameReady={state.get('gameReady')} loader={state.get('loaderVisible')} "
                            f"failedToLoad={state.get('failedToLoadVisible')} "
                            f"challenge={state.get('challengeDetected')} challengeDOM={state.get('challengeDom')}"
                        )
                        print(f"\n{stamp(start)} SAMPLE {sample_no:02d}: {flags}" + (" [STATE CHANGE]" if changed else ""))
                        print("   url:", safe_url(state.get("href", "")))
                        print("   title:", repr(state.get("title", "")))
                        print("   text:", repr(state.get("text", "")))
                        if state.get("scripts"):
                            print("   relevant scripts:")
                            for src in state["scripts"]:
                                print("    -", safe_url(src))
                        if state.get("frames"):
                            print("   challenge-related iframe URLs:")
                            for src in state["frames"]:
                                print("    -", safe_url(src))
                    except Exception as exc:
                        print(f"{stamp(start)} SAMPLE {sample_no:02d} INSPECTION ERROR: {type(exc).__name__}: {str(exc)[:220]}")
                        # Do not stop: a navigation/verification can destroy the context temporarily.
                        continue

                print("\nSUMMARY:")
                print("  responses recorded:", counts["responses"])
                print("  HTTP errors (status >= 400):", counts["http_errors"])
                print("  responses with cf-mitigated: challenge:", counts["cf_challenges"])
                print("  relevant request failures:", counts["request_failed"])
                print("  open pages at end:", sum(1 for p in context.pages if not p.is_closed()))
            finally:
                try:
                    context.close()
                except Exception as exc:
                    print("Context close warning:", type(exc).__name__, str(exc)[:180])

    print("Temporary profile removed. Existing browser_profile/config/save files were not touched.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
