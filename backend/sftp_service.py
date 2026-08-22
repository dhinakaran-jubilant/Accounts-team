"""
Project: Accounts Team
Module: sftp_service
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Description: SFTP Connection, Configuration, DayBook file download, and daily background synchronization service.
"""

import os
import json
import time
import datetime
import threading
import paramiko

CONFIG_FILE = os.path.join(os.path.dirname(__file__), 'sftp_config.json')

DEFAULT_CONFIG = {
    "enabled": False,
    "host": "",
    "port": 22,
    "username": "",
    "password": "",
    "key_path": "",
    "remote_dir": "/",
    "daily_sync_time": "09:00",
    "last_sync_time": None,
    "last_sync_status": None,
    "last_sync_details": None
}


def load_sftp_config(hide_password=False):
    """Load SFTP configuration from JSON file."""
    if not os.path.exists(CONFIG_FILE):
        save_sftp_config(DEFAULT_CONFIG)
        config = dict(DEFAULT_CONFIG)
    else:
        try:
            with open(CONFIG_FILE, 'r') as f:
                config = json.load(f)
        except Exception as e:
            print(f"Error loading SFTP config: {e}")
            config = dict(DEFAULT_CONFIG)

    # Fill any missing keys with defaults
    for key, value in DEFAULT_CONFIG.items():
        if key not in config:
            config[key] = value

    if hide_password and config.get("password"):
        config["password"] = "********"

    return config


def save_sftp_config(new_config):
    """Save SFTP configuration to JSON file."""
    existing_config = load_sftp_config(hide_password=False) if os.path.exists(CONFIG_FILE) else dict(DEFAULT_CONFIG)

    # If password is masked string, preserve existing password
    if new_config.get("password") == "********":
        new_config["password"] = existing_config.get("password", "")

    existing_config.update(new_config)

    with open(CONFIG_FILE, 'w') as f:
        json.dump(existing_config, f, indent=4)

    return load_sftp_config(hide_password=True)


def get_sftp_connection(config=None):
    """Establish SSH & SFTP client connection using provided or saved configuration."""
    if config is None:
        config = load_sftp_config(hide_password=False)

    host = config.get("host", "").strip()
    port = int(config.get("port", 22))
    username = config.get("username", "").strip()
    password = config.get("password", "")
    key_path = config.get("key_path", "").strip()

    if not host or not username:
        raise ValueError("SFTP Host and Username are required.")

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    connect_kwargs = {
        "hostname": host,
        "port": port,
        "username": username,
        "timeout": 20
    }

    if key_path and os.path.exists(key_path):
        connect_kwargs["key_filename"] = key_path
    elif password:
        connect_kwargs["password"] = password
    else:
        raise ValueError("Either Password or SSH Key Path must be provided.")

    ssh.connect(**connect_kwargs)
    sftp = ssh.open_sftp()
    return ssh, sftp


def test_sftp_connection(config_data=None):
    """Test SFTP connection with given or saved configuration."""
    ssh = None
    sftp = None
    try:
        if config_data and config_data.get("password") == "********":
            existing = load_sftp_config(hide_password=False)
            config_data["password"] = existing.get("password", "")

        ssh, sftp = get_sftp_connection(config_data)

        remote_dir = (config_data or load_sftp_config()).get("remote_dir", "/").strip() or "/"
        try:
            files = sftp.listdir(remote_dir)
        except Exception:
            # Fallback to root if remote_dir listing fails
            files = sftp.listdir(".")
            remote_dir = "."

        excel_files = [f for f in files if f.lower().endswith(('.xlsx', '.xls'))]

        return {
            "success": True,
            "message": f"SFTP connection successful! Found {len(excel_files)} Excel file(s) in '{remote_dir}'.",
            "remote_dir": remote_dir,
            "total_files": len(files),
            "excel_files": excel_files
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"SFTP connection failed: {str(e)}"
        }
    finally:
        if sftp:
            try:
                sftp.close()
            except Exception:
                pass
        if ssh:
            try:
                ssh.close()
            except Exception:
                pass


def download_sftp_daybooks(target_folder, config_data=None):
    """Download only the latest uploaded daybook Excel file from remote SFTP server to local target folder."""
    if not os.path.exists(target_folder):
        os.makedirs(target_folder)

    ssh, sftp = get_sftp_connection(config_data)
    config = config_data or load_sftp_config(hide_password=False)
    remote_dir = config.get("remote_dir", "/").strip() or "/"

    downloaded_files = []

    try:
        try:
            file_list = sftp.listdir_attr(remote_dir)
        except Exception:
            remote_dir = "."
            file_list = sftp.listdir_attr(remote_dir)

        # Filter valid Excel files (ignore hidden / temp files starting with . or ~$)
        excel_items = []
        for attr in file_list:
            fname = attr.filename
            if fname.startswith('.') or fname.startswith('~$'):
                continue
            if fname.lower().endswith(('.xlsx', '.xls')):
                excel_items.append(attr)

        if excel_items:
            # Sort by st_mtime descending to get the last uploaded file
            excel_items.sort(key=lambda a: getattr(a, 'st_mtime', 0), reverse=True)
            latest_attr = excel_items[0]
            fname = latest_attr.filename

            remote_path = fname if remote_dir in (".", "/") else f"{remote_dir.rstrip('/')}/{fname}"
            local_path = os.path.join(target_folder, fname)
            sftp.get(remote_path, local_path)
            downloaded_files.append((local_path, fname))

        return downloaded_files
    finally:
        if sftp:
            try: sftp.close()
            except Exception: pass
        if ssh:
            try: ssh.close()
            except Exception: pass


def run_sftp_sync(process_day_book_func, target_folder):
    """Execute complete SFTP sync: download daybook files and process each with process_day_book_func."""
    now_str = datetime.datetime.now().strftime("%d-%m-%Y %I:%M %p")
    config = load_sftp_config(hide_password=False)

    try:
        downloaded = download_sftp_daybooks(target_folder, config)

        if not downloaded:
            sync_result = {
                "success": True,
                "message": "Connected to SFTP, but no Excel (.xlsx/.xls) DayBook files were found.",
                "total_files": 0,
                "updated_count": 0,
                "updated_details": [],
                "skipped_details": ["No Excel files found on SFTP server"],
                "mismatch_details": []
            }
        else:
            total_updated = 0
            all_updated_details = []
            all_skipped_details = []
            all_mismatch_details = []

            for local_path, fname in downloaded:
                # Infer account_name from filename if formatted as "{AccountName}_DayBook.xlsx"
                acc_name = 'Unknown'
                if '_DayBook' in fname:
                    acc_name = fname.split('_DayBook')[0]
                elif '_' in fname:
                    acc_name = fname.split('_')[0]

                res = process_day_book_func(local_path, account_name=acc_name)

                if res.get('success'):
                    u_cnt = res.get('updated_count', 0)
                    total_updated += u_cnt
                    all_updated_details.extend([f"[{fname}] {d}" for d in res.get('updated_details', [])])
                    all_skipped_details.extend([f"[{fname}] {d}" for d in res.get('skipped_details', [])])
                    all_mismatch_details.extend([f"[{fname}] {d}" for d in res.get('mismatch_details', [])])
                else:
                    all_skipped_details.append(f"[{fname}] Processing failed: {res.get('error', 'Unknown error')}")

            msg = f"SFTP Sync Completed: Downloaded {len(downloaded)} file(s), updated {total_updated} installment(s)."
            sync_result = {
                "success": True,
                "message": msg,
                "total_files": len(downloaded),
                "updated_count": total_updated,
                "updated_details": all_updated_details,
                "skipped_details": all_skipped_details,
                "mismatch_details": all_mismatch_details
            }

        # Update last sync status in config
        config["last_sync_time"] = now_str
        config["last_sync_status"] = "SUCCESS" if sync_result["success"] else "FAILED"
        config["last_sync_details"] = sync_result
        save_sftp_config(config)

        return sync_result

    except Exception as e:
        err_msg = f"SFTP Sync Error: {str(e)}"
        sync_result = {
            "success": False,
            "error": err_msg,
            "total_files": 0,
            "updated_count": 0,
            "updated_details": [],
            "skipped_details": [err_msg],
            "mismatch_details": []
        }

        config["last_sync_time"] = now_str
        config["last_sync_status"] = "FAILED"
        config["last_sync_details"] = sync_result
        save_sftp_config(config)

        return sync_result


_scheduler_running = False
_last_run_date = None

def start_sftp_scheduler(app, process_day_book_func, target_folder, on_sync_complete=None):
    """Start background daemon thread that checks every minute for scheduled daily SFTP sync."""
    global _scheduler_running
    if _scheduler_running:
        return

    _scheduler_running = True

    def scheduler_loop():
        global _last_run_date
        print("[SFTP Scheduler] Background daily SFTP scheduler started.")

        while True:
            try:
                time.sleep(60)
                config = load_sftp_config(hide_password=False)

                if not config.get("enabled"):
                    continue

                scheduled_time = config.get("daily_sync_time", "09:00").strip()
                now = datetime.datetime.now()
                current_time = now.strftime("%H:%M")
                today_date = now.strftime("%Y-%m-%d")

                if current_time == scheduled_time and _last_run_date != today_date:
                    print(f"[SFTP Scheduler] Daily sync triggered at {now.strftime('%d-%m-%Y %H:%M:%S')}")
                    _last_run_date = today_date
                    with app.app_context():
                        sync_res = run_sftp_sync(process_day_book_func, target_folder)
                        if on_sync_complete:
                            try:
                                on_sync_complete(sync_res)
                            except Exception as _cb_err:
                                print(f"[SFTP Scheduler] Notification callback error: {_cb_err}")

            except Exception as e:
                print(f"[SFTP Scheduler] Error in loop: {e}")

    thread = threading.Thread(target=scheduler_loop, daemon=True)
    thread.start()
