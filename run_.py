#!/usr/bin/env python3
"""
Trigger Script to Run both Backend (Flask) and Frontend (Vite) concurrently.
Author: Antigravity AI
"""

import os
import sys
import subprocess
import threading
import time
import signal
import json
import datetime
from pathlib import Path

# ANSI color codes for premium console output
COLOR_HEADER = "\033[95m"
COLOR_BACKEND = "\033[96m"  # Cyan
COLOR_FRONTEND = "\033[92m"  # Green
COLOR_WARNING = "\033[93m"   # Yellow
COLOR_ERROR = "\033[91m"     # Red
COLOR_RESET = "\033[0m"
COLOR_BOLD = "\033[1m"

def stream_output(process, prefix, color):
    """Streams output from a subprocess to stdout with a colored prefix."""
    try:
        # Read line by line as it is outputted
        for line in iter(process.stdout.readline, ''):
            clean_line = line.strip()
            if clean_line:
                print(f"{color}{prefix}{COLOR_RESET} {clean_line}")
    except Exception as e:
        print(f"{COLOR_ERROR}[ERROR] Error reading output from {prefix}: {e}{COLOR_RESET}")
    finally:
        process.stdout.close()

def find_python():
    """Finds the appropriate python interpreter to use."""
    # 1. Check for virtual environment in backend/env
    venv_python_win = Path("backend/env/Scripts/python.exe")
    venv_python_unix = Path("backend/env/bin/python")
    
    if venv_python_win.exists():
        return str(venv_python_win)
    elif venv_python_unix.exists():
        return str(venv_python_unix)
    
    # 2. Fallback to system python
    return sys.executable or "python"

def trigger_daybook_sync(python_exe, backend_dir):
    """Triggers the SFTP DayBook sync directly via python process."""
    print(f"\n{COLOR_HEADER}[SFTP SYNCHRONIZER] Triggering DayBook SFTP Sync...{COLOR_RESET}")
    cmd = [
        python_exe, "-c",
        "import os, sys; sys.path.insert(0, '.'); from app import app, process_day_book_file_internal, send_sftp_sync_notification, TEMP_FOLDER; from sftp_service import run_sftp_sync; sftp_temp_dir = os.path.join(TEMP_FOLDER, 'sftp'); ctx = app.app_context(); ctx.push(); res = run_sftp_sync(process_day_book_file_internal, sftp_temp_dir); send_sftp_sync_notification(res); print(f'SYNC RESULT: success={res.get(\"success\")} | {res.get(\"message\")} | updated={res.get(\"updated_count\")}')"
    ]
    try:
        proc = subprocess.run(cmd, cwd=str(backend_dir), capture_output=True, text=True)
        if proc.returncode == 0:
            print(f"{COLOR_FRONTEND}[SFTP SYNCHRONIZER] DayBook Sync completed!{COLOR_RESET}")
            for line in proc.stdout.splitlines():
                if "SYNC RESULT" in line or "SFTP" in line:
                    print(f"  {COLOR_BOLD}{line}{COLOR_RESET}")
        else:
            print(f"{COLOR_ERROR}[SFTP SYNCHRONIZER] Error during sync: {proc.stderr}{COLOR_RESET}")
    except Exception as e:
        print(f"{COLOR_ERROR}[SFTP SYNCHRONIZER] Exception: {e}{COLOR_RESET}")

def sftp_scheduler_thread_func(python_exe, backend_dir):
    """Background thread in run.py that monitors daily sync time and triggers DayBook sync."""
    last_synced_date = None
    config_file = backend_dir / "sftp_config.json"
    print(f"{COLOR_HEADER}[SFTP SCHEDULER THREAD] Thread started in run.py. Monitoring daily sync schedule...{COLOR_RESET}")

    while True:
        try:
            time.sleep(30)
            if not config_file.exists():
                continue

            with open(config_file, "r", encoding="utf-8") as f:
                config = json.load(f)

            if not config.get("enabled", False):
                continue

            scheduled_time = config.get("daily_sync_time", "09:00").strip()
            now = datetime.datetime.now()
            current_time = now.strftime("%H:%M")
            today_date = now.strftime("%Y-%m-%d")

            if current_time == scheduled_time and last_synced_date != today_date:
                print(f"\n{COLOR_HEADER}[SFTP SCHEDULER THREAD] Scheduled time ({scheduled_time}) reached. Triggering daily SFTP DayBook Sync...{COLOR_RESET}")
                last_synced_date = today_date
                trigger_daybook_sync(python_exe, backend_dir)

        except Exception as e:
            pass

def main():
    
    # Enable ANSI escape sequences on Windows if needed
    if os.name == 'nt':
        os.system('color')

    workspace_dir = Path(__file__).parent.resolve()
    backend_dir = workspace_dir / "backend"
    frontend_dir = workspace_dir / "frontend"
    
    python_exe = find_python()
    print(f"{COLOR_BOLD}Configuration:{COLOR_RESET}")
    print(f"  - Working Directory: {workspace_dir}")
    print(f"  - Python Interpreter: {python_exe}")
    print(f"  - Backend Path:      {backend_dir}")
    print(f"  - Frontend Path:     {frontend_dir}")
    print("-" * 70)

    # Check for direct DayBook sync CLI flag
    if any(arg in sys.argv for arg in ["--sync-daybook", "--sync", "--trigger-daybook", "sync"]):
        trigger_daybook_sync(python_exe, backend_dir)
        return

    # 1. Start Backend Process
    print(f"{COLOR_BACKEND}[SYSTEM] Launching Flask Backend...{COLOR_RESET}")
    backend_cmd = [python_exe, "app.py"]
    try:
        backend_process = subprocess.Popen(
            backend_cmd,
            cwd=str(backend_dir),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == 'nt' else 0
        )
    except Exception as e:
        print(f"{COLOR_ERROR}[SYSTEM] Failed to start Backend: {e}{COLOR_RESET}")
        sys.exit(1)

    # 2. Start Frontend Process
    print(f"{COLOR_FRONTEND}[SYSTEM] Launching Vite Frontend...{COLOR_RESET}")
    # Use shell=True for npm on Windows to handle batch file execution (.cmd) properly
    frontend_cmd = "npm.cmd run dev" if os.name == 'nt' else "npm run dev"
    try:
        frontend_process = subprocess.Popen(
            frontend_cmd,
            cwd=str(frontend_dir),
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == 'nt' else 0
        )
    except Exception as e:
        print(f"{COLOR_ERROR}[SYSTEM] Failed to start Frontend: {e}{COLOR_RESET}")
        # Terminate backend if frontend failed
        backend_process.terminate()
        sys.exit(1)

    # 3. Create Threads to stream outputs and monitor daily SFTP sync concurrently
    backend_thread = threading.Thread(
        target=stream_output, 
        args=(backend_process, "[BACKEND]", COLOR_BACKEND),
        daemon=True
    )
    frontend_thread = threading.Thread(
        target=stream_output, 
        args=(frontend_process, "[FRONTEND]", COLOR_FRONTEND),
        daemon=True
    )
    sftp_scheduler_thread = threading.Thread(
        target=sftp_scheduler_thread_func,
        args=(python_exe, backend_dir),
        daemon=True
    )
    
    backend_thread.start()
    frontend_thread.start()
    sftp_scheduler_thread.start()

    print(f"\n{COLOR_BOLD}{COLOR_HEADER}[SYSTEM] Both applications started! Press Ctrl+C to terminate both.{COLOR_RESET}\n")

    # Keep the main thread alive and monitor processes
    try:
        while True:
            # Check if backend terminated
            if backend_process.poll() is not None:
                print(f"\n{COLOR_WARNING}[SYSTEM] Backend process terminated unexpectedly.{COLOR_RESET}")
                break
                
            # Check if frontend terminated
            if frontend_process.poll() is not None:
                print(f"\n{COLOR_WARNING}[SYSTEM] Frontend process terminated unexpectedly.{COLOR_RESET}")
                break
                
            time.sleep(1)
            
    except KeyboardInterrupt:
        print(f"\n{COLOR_WARNING}[SYSTEM] KeyboardInterrupt received. Cleaning up processes...{COLOR_RESET}")
    finally:
        # Shutdown cleanly
        print(f"{COLOR_WARNING}[SYSTEM] Shutting down Backend...{COLOR_RESET}")
        try:
            if os.name == 'nt':
                # On Windows, terminating process groups is cleaner
                os.kill(backend_process.pid, signal.CTRL_BREAK_EVENT)
            else:
                backend_process.terminate()
        except Exception:
            pass

        print(f"{COLOR_WARNING}[SYSTEM] Shutting down Frontend...{COLOR_RESET}")
        try:
            if os.name == 'nt':
                os.kill(frontend_process.pid, signal.CTRL_BREAK_EVENT)
            else:
                frontend_process.terminate()
        except Exception:
            pass

        # Wait briefly for standard cleanup
        time.sleep(0.5)
        
        # Force kill if still running
        if backend_process.poll() is None:
            backend_process.kill()
        if frontend_process.poll() is None:
            frontend_process.kill()

        print(f"{COLOR_BOLD}{COLOR_HEADER}[SYSTEM] Cleanup complete. Goodbye!{COLOR_RESET}")

if __name__ == "__main__":
    main()
