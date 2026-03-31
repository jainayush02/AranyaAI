"""
🚀 Aranya AI - One-Click Launcher
===================================
Starts all 4 services with a single command:
  1. Python AI Model         (port 8005)
  2. Chiron Embedding Service (port 8006)
  3. Node.js Backend         (port 5000)
  4. React Frontend          (port 5173)

Usage:  python start_all.py
Stop:   Press Ctrl+C (stops everything)
"""

import subprocess
import sys
import os
import signal
import time
import threading

# ── Paths ──────────────────────────────────────────────
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
CLIENT_DIR = os.path.join(ROOT_DIR, "src", "client")
SERVER_DIR = os.path.join(ROOT_DIR, "src", "server")
AI_DIR = os.path.join(ROOT_DIR, "src", "server", "ai_model")
CHIRON_DIR = os.path.join(ROOT_DIR, "src", "server", "ai_model")
VENV_PYTHON = os.path.join(AI_DIR, "venv", "Scripts", "python.exe")
AI_LOG = os.path.join(AI_DIR, "ai_server.log")
CHIRON_LOG = os.path.join(CHIRON_DIR, "chiron_server.log")

# ── Colors ─────────────────────────────────────────────
RESET = "\033[0m"
GREEN = "\033[92m"
CYAN = "\033[96m"
YELLOW = "\033[93m"
RED = "\033[91m"
MAGENTA = "\033[95m"
BOLD = "\033[1m"
DIM = "\033[2m"

processes = []
shutting_down = False

def log(color, tag, msg):
    if not shutting_down:
        print(f"{color}[{tag}]{RESET} {msg}")

def stream_output(proc, tag, color):
    """Read output from a subprocess and print with colored tag."""
    try:
        while True:
            line = proc.stdout.readline()
            if not line:
                break
            stripped = line.strip()
            if stripped:
                log(color, tag, stripped)
    except Exception:
        pass

def tail_log(filepath, tag, color):
    """Tail a log file and print new lines with colored tag."""
    try:
        while not os.path.exists(filepath):
            time.sleep(0.5)
        with open(filepath, 'r') as f:
            # Go to end
            f.seek(0)
            while not shutting_down:
                line = f.readline()
                if line:
                    stripped = line.strip()
                    if stripped:
                        log(color, tag, stripped)
                else:
                    time.sleep(0.3)
    except Exception:
        pass

def cleanup(signum=None, frame=None):
    global shutting_down
    if shutting_down:
        return
    shutting_down = True

    print(f"\n{YELLOW}{BOLD}🛑 Shutting down all services...{RESET}")

    for proc in processes:
        try:
            proc.terminate()
        except Exception:
            pass

    time.sleep(2)

    for proc in processes:
        try:
            if proc.poll() is None:
                proc.kill()
        except Exception:
            pass

    print(f"{GREEN}{BOLD}✅ All services stopped.{RESET}")
    os._exit(0)

signal.signal(signal.SIGINT, cleanup)
signal.signal(signal.SIGTERM, cleanup)

def main():
    print(f"""
{CYAN}{BOLD}╔══════════════════════════════════════════════╗
║        🐄  ARANYA AI - Full Stack Launcher   ║
╚══════════════════════════════════════════════╝{RESET}
""")

    # ── 1. AI Microservice (port 8005) ─────────────────
    # TensorFlow doesn't play well with piped stdout on Windows,
    # so we redirect AI output to a log file and tail it.
    ai_python = VENV_PYTHON if os.path.exists(VENV_PYTHON) else sys.executable
    ai_script = os.path.join(AI_DIR, "ai_server.py")
    log(MAGENTA, "AI ", f"Python: {ai_python}")
    log(MAGENTA, "AI ", "Starting AI Microservice (port 8005)...")

    # Clear old log
    with open(AI_LOG, 'w') as f:
        f.write("")

    ai_log_handle = open(AI_LOG, 'w')
    ai_proc = subprocess.Popen(
        [ai_python, ai_script],
        cwd=AI_DIR,
        stdout=ai_log_handle,
        stderr=subprocess.STDOUT,
        text=True
    )
    processes.append(ai_proc)

    # Tail the AI log in background
    t_ai = threading.Thread(target=tail_log, args=(AI_LOG, "AI ", MAGENTA), daemon=True)
    t_ai.start()

    log(MAGENTA, "AI ", "Loading TensorFlow + LSTM model (~15s)...")
    time.sleep(18)

    # ── 2. Chiron Embedding Service (Node.js in main backend) ───────
    log(YELLOW, "RAG", "Chiron Embedding Service is now handled by Node.js backend (port 5000).")
    log(YELLOW, "RAG", "Skipping Python-based service startup to avoid double process.")
    # No Python process to start; Node process handles Chiron routes.
    time.sleep(1)

    # ── 3. Node.js Backend (port 5000) ─────────────────
    log(GREEN, "API", "Starting Node.js Backend (port 5000)...")
    api_proc = subprocess.Popen(
        "npx nodemon server.js",
        cwd=SERVER_DIR,
        shell=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )
    processes.append(api_proc)
    t_api = threading.Thread(target=stream_output, args=(api_proc, "API", GREEN), daemon=True)
    t_api.start()
    time.sleep(3)

    # ── 4. React Frontend (port 5173) ──────────────────
    log(CYAN, "UI ", "Starting React Frontend (port 5173)...")
    ui_proc = subprocess.Popen(
        "npm run dev",
        cwd=CLIENT_DIR,
        shell=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )
    processes.append(ui_proc)
    t_ui = threading.Thread(target=stream_output, args=(ui_proc, "UI ", CYAN), daemon=True)
    t_ui.start()
    time.sleep(2)

    print(f"""
{BOLD}{'='*50}
  {MAGENTA}🧠 AI Model   →  http://localhost:8005{RESET}
  {YELLOW}🔍 Chiron RAG →  http://localhost:8006{RESET}
  {GREEN}{BOLD}🔧 Backend    →  http://localhost:5000{RESET}
  {CYAN}{BOLD}🌐 Frontend   →  http://localhost:5173{RESET}
{BOLD}{'='*50}{RESET}

  {DIM}Press Ctrl+C to stop all services{RESET}
""")

    # Keep alive
    try:
        while not shutting_down:
            time.sleep(5)
    except KeyboardInterrupt:
        cleanup()

if __name__ == "__main__":
    main()
