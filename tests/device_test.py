"""On-device test for the APK. Run on a machine with adb and one emulator attached.

Drives the app's WebView over the Chrome DevTools protocol (test builds only) and
checks that it loads, keeps data across restarts, and hands files to Android.
"""
import json
import subprocess
import sys
import time
import urllib.request

import websocket

PKG = 'com.danni.peppylog'
ACTIVITY = f'{PKG}/.MainActivity'
START_URL = 'https://appassets.androidplatform.net/assets/www/index.html'
PORT = 9222
MARKER = 'device-test-marker'

failures = []


def adb(*args, check=True):
    return subprocess.run(['adb', *args], capture_output=True, text=True, check=check).stdout.strip()


def check(name, ok, detail=''):
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f'  ({detail})' if detail and not ok else ''))
    if not ok:
        failures.append(name)


def resumed_activity():
    out = adb('shell', 'dumpsys', 'activity', 'activities')
    for line in out.splitlines():
        if 'topResumedActivity' in line or 'mResumedActivity' in line:
            return line.strip()
    return ''


class Page:
    def __init__(self):
        self.ws = None
        self.msg_id = 0

    def connect(self, timeout=60):
        deadline = time.time() + timeout
        last = None
        while time.time() < deadline:
            try:
                pid = adb('shell', 'pidof', PKG)
                adb('forward', '--remove-all', check=False)
                adb('forward', f'tcp:{PORT}', f'localabstract:webview_devtools_remote_{pid}')
                targets = json.load(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json', timeout=5))
                page = next(t for t in targets if t.get('type') == 'page')
                self.ws = websocket.create_connection(page['webSocketDebuggerUrl'], timeout=30, suppress_origin=True)
                # Wait for init() to finish rendering.
                if self.eval("document.readyState === 'complete' && !!document.querySelector('#todayList')"):
                    time.sleep(2)
                    return
            except Exception as e:  # app still starting
                last = e
            time.sleep(2)
        raise RuntimeError(f'could not attach to WebView: {last}')

    def eval(self, expr):
        self.msg_id += 1
        self.ws.send(json.dumps({'id': self.msg_id, 'method': 'Runtime.evaluate', 'params': {
            'expression': expr, 'awaitPromise': True, 'returnByValue': True, 'userGesture': True}}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get('id') == self.msg_id:
                res = msg['result']
                if 'exceptionDetails' in res:
                    raise RuntimeError(res['exceptionDetails'].get('exception', {}).get('description', res['exceptionDetails']))
                return res['result'].get('value')

    def close(self):
        if self.ws:
            self.ws.close()


def launch():
    adb('shell', 'am', 'start', '-W', '-n', ACTIVITY)
    page = Page()
    page.connect()
    return page


def back_to_app():
    adb('shell', 'input', 'keyevent', 'KEYCODE_BACK')
    time.sleep(1.5)
    if PKG not in resumed_activity():
        adb('shell', 'am', 'start', '-n', ACTIVITY)
        time.sleep(2)


def main():
    adb('logcat', '-c')
    adb('shell', 'pm', 'clear', PKG)

    # --- first launch ---
    page = launch()
    check('loads from the in-app https origin', page.eval('location.href') == START_URL, page.eval('location.href'))
    title = page.eval("document.getElementById('title').textContent")
    check('opens on the Log screen', title == 'Log a dose', title)
    storage_err = page.eval("document.body.innerText.includes('Could not open storage')")
    check('IndexedDB storage opens', not storage_err)
    names = page.eval("DB.all('peptides').then(ps => ps.map(p => p.name).sort())")
    check('seeds the four starter peptides', names == ['BPC-157', 'GHK-Cu', 'KPV', 'TB-500'], names)
    check('native backup bridge is present', page.eval('typeof window.AndroidBridge?.saveFile') == 'function')
    regs = page.eval("navigator.serviceWorker ? navigator.serviceWorker.getRegistrations().then(r => r.length) : 0")
    check('service worker is not registered in the APK', regs == 0, regs)

    page.eval(f"DB.put('entries', {{id: '{MARKER}', peptideName: 'TB-500', dose: 2, doseUnit: 'mg', "
              f"takenAt: new Date().toISOString(), status: 'taken'}}).then(() => true)")
    subprocess.run('adb exec-out screencap -p > screenshot-log.png', shell=True)

    # --- backup button opens the Android share sheet ---
    page.eval("document.getElementById('backupBtn').click()")
    time.sleep(3)
    act = resumed_activity()
    subprocess.run('adb exec-out screencap -p > screenshot-share.png', shell=True)
    check('Save backup opens the Android share sheet', 'Chooser' in act or 'Resolver' in act or 'intentresolver' in act, act)
    back_to_app()
    last = page.eval("document.getElementById('lastBackup').textContent")
    check('backup is recorded in the app', 'just now' in (last or ''), last)

    # --- restore button opens a file picker ---
    page.eval("document.getElementById('importBtn').click()")
    time.sleep(3)
    act = resumed_activity()
    check('Choose file opens a file picker', PKG not in act, act)
    back_to_app()
    check('app survives cancelling the picker', page.eval("document.getElementById('title').textContent") == 'Log a dose')

    # --- external links leave the app instead of replacing it ---
    page.eval("document.querySelector('a[href^=\"https://peptiderobot\"]').click()")
    time.sleep(3)
    page.close()
    adb('shell', 'am', 'start', '-n', ACTIVITY)
    time.sleep(2)
    page = Page()
    page.connect()
    check('external link does not replace the app', page.eval('location.href') == START_URL, page.eval('location.href'))
    page.close()

    # --- data survives a full restart ---
    adb('shell', 'am', 'force-stop', PKG)
    time.sleep(1)
    page = launch()
    kept = page.eval(f"DB.get('entries', '{MARKER}').then(e => e ? e.peptideName : null)")
    check('logged dose persists after the app is killed', kept == 'TB-500', kept)
    seeded_once = page.eval("DB.all('peptides').then(ps => ps.length)")
    check('starter peptides are not duplicated on relaunch', seeded_once == 4, seeded_once)
    subprocess.run('adb exec-out screencap -p > screenshot-relaunch.png', shell=True)
    page.close()

    # --- no JavaScript errors ---
    log = adb('logcat', '-d', '-s', 'chromium:*', check=False)
    errors = [l for l in log.splitlines() if 'Uncaught' in l]
    check('no uncaught JavaScript errors', not errors, '; '.join(errors[:3]))
    with open('logcat.txt', 'w', encoding='utf-8') as f:
        f.write(adb('logcat', '-d', check=False))

    print()
    if failures:
        print(f'{len(failures)} check(s) failed: ' + ', '.join(failures))
        sys.exit(1)
    print('All checks passed.')


if __name__ == '__main__':
    main()
