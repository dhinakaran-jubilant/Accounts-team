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

    # 3. Create Threads to stream outputs concurrently
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
    
    backend_thread.start()
    frontend_thread.start()

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
