"""
Project: Accounts Team
Module: Backend API
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-08 11:53:28
"""
from models import db, Loan, RemainingAccount, RepaymentSchedule, User, Notification, ShortLoan, AccountName
from werkzeug.security import generate_password_hash, check_password_hash
from flask_cors import CORS
from flask_talisman import Talisman
from read_word import extract_word_data, build_final_output
from read_pdf import extract_pdf_data
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from google.oauth2.service_account import Credentials
from flask import Flask, request, jsonify, send_file
import preprocess_idfc
import pandas as pd
import threading
import datetime
import psycopg2
import gspread
import json
import os
import re
import logging
logging.getLogger("pdfminer").setLevel(logging.ERROR)

app = Flask(__name__, static_folder='../frontend/dist', static_url_path='')
CORS(app)

CONFIG_FILE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'app_config.json')

def load_system_config():
    default_config = {
        'require_secondary_approval': True,
        'require_admin_approval': True
    }
    if not os.path.exists(CONFIG_FILE_PATH):
        try:
            with open(CONFIG_FILE_PATH, 'w') as f:
                json.dump(default_config, f, indent=4)
        except Exception as e:
            print(f"Error writing default config: {e}")
        return default_config
    try:
        with open(CONFIG_FILE_PATH, 'r') as f:
            config = json.load(f)
            # Ensure all keys exist
            for k, v in default_config.items():
                if k not in config:
                    config[k] = v
            return config
    except Exception as e:
        print(f"Error reading config: {e}")
        return default_config

def save_system_config(config_data):
    try:
        with open(CONFIG_FILE_PATH, 'w') as f:
            json.dump(config_data, f, indent=4)
        return True
    except Exception as e:
        print(f"Error saving config: {e}")
        return False

# Security: Enforce HTTPS and add security headers
Talisman(app, force_https=True, content_security_policy=None)

# Database Configuration (PostgreSQL)
# Assuming default postgres user and localhost since only password was specified
app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://postgres:1234@localhost:5432/accounts_db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

def ensure_database_exists():
    try:
        # Connect to default postgres database to check/create accounts_db
        conn = psycopg2.connect(
            dbname='postgres',
            user='postgres',
            password='1234',
            host='localhost',
            port='5432'
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cur = conn.cursor()
        
        # Check if accounts_db exists
        cur.execute("SELECT 1 FROM pg_catalog.pg_database WHERE datname = 'accounts_db'")
        exists = cur.fetchone()
        if not exists:
            cur.execute('CREATE DATABASE accounts_db')
            print("Database 'accounts_db' created successfully.")
        else:
            print("Database 'accounts_db' already exists.")
            
        cur.close()
        conn.close()
    except Exception as e:
        print(f"PostgreSQL connection/creation error: {e}. Ensure PostgreSQL is running on port 5432.")

# Pre-flight check: Create database if not exists
ensure_database_exists()

db.init_app(app)

SCHEMA_VERIFIED = False

def verify_schema():
    global SCHEMA_VERIFIED
    if SCHEMA_VERIFIED:
        return
    try:
        from sqlalchemy import inspect, text
        inspector = inspect(db.engine)
        for table_name, table in db.Model.metadata.tables.items():
            if inspector.has_table(table_name):
                columns_in_db = {col['name'] for col in inspector.get_columns(table_name)}
                for column in table.columns:
                    if column.name not in columns_in_db:
                        col_type = column.type.compile(db.engine.dialect)
                        print(f"Auto-migrating: Adding column '{column.name}' ({col_type}) to table '{table_name}'")
                        alter_stmt = text(f"ALTER TABLE {table_name} ADD COLUMN {column.name} {col_type}")
                        try:
                            with db.engine.begin() as conn:
                                conn.execute(alter_stmt)
                        except Exception as e:
                            print(f"Error adding column {column.name}: {e}")
        SCHEMA_VERIFIED = True
    except Exception as e:
        print(f"Schema verification failed: {e}")

def migrate_existing_short_loans():
    try:
        acronyms = {
            'AS': 'AS',
            'ASQ': 'ASQ',
            'JC': 'JC',
            'NEXUS': 'NXS',
            'RE': 'RE',
            'SCS': 'SCS',
            'SENTHIL VADIVEL': 'SV',
            'SN': 'SN'
        }
        # Fetch all ShortLoan where loan_id is NULL or empty
        loans_to_migrate = ShortLoan.query.filter((ShortLoan.loan_id == None) | (ShortLoan.loan_id == '')).order_by(ShortLoan.id.asc()).all()
        if not loans_to_migrate:
            return
            
        print(f"Migrating {len(loans_to_migrate)} existing short loans to generate loan_id...")
        for l in loans_to_migrate:
            acc_name = l.account
            prefix = 'SL'
            if acc_name:
                acc_name_clean = str(acc_name).upper().strip()
                if acc_name_clean in acronyms:
                    prefix = acronyms[acc_name_clean]
                else:
                    clean_chars = re.sub(r'[^A-Z]', '', acc_name_clean)
                    prefix = clean_chars[:4] if clean_chars else 'SL'

            loan_date = l.loan_date
            year_val = ""
            if loan_date:
                if '-' in loan_date:
                    parts = loan_date.split('-')
                    if len(parts[0]) == 4:
                        year_val = parts[0][-2:]
                    elif len(parts[-1]) == 4:
                        year_val = parts[-1][-2:]
            if not year_val:
                year_val = str(datetime.datetime.now().year)[-2:]

            # Calculate next sequence number for this prefix and year
            pattern = f"SL{prefix}{year_val}%"
            last_loan = ShortLoan.query.filter(
                ShortLoan.loan_id.like(pattern),
                ShortLoan.id < l.id
            ).order_by(ShortLoan.loan_id.desc()).first()
            
            if last_loan and last_loan.loan_id:
                try:
                    seq = int(last_loan.loan_id[-4:])
                    next_seq = seq + 1
                except Exception:
                    next_seq = 1
            else:
                next_seq = 1
                
            l.loan_id = f"SL{prefix}{year_val}{next_seq:04d}"
            
        db.session.commit()
        print("Existing short loans migration completed successfully!")
    except Exception as e:
        db.session.rollback()
        print(f"Error migrating existing short loans: {e}")

def seed_default_accounts():
    try:
        if AccountName.query.first() is None:
            defaults = [
                { 'acronym': 'SCS', 'name': 'Surge Capital Solutions', 'color': 'blue' },
                { 'acronym': 'GC', 'name': 'Growth Capital', 'color': 'indigo' },
                { 'acronym': 'FC', 'name': 'Finova Capital', 'color': 'emerald' },
                { 'acronym': 'AS', 'name': 'Ascend Solutions', 'color': 'amber' },
                { 'acronym': 'ASE', 'name': 'AS Enterprises', 'color': 'rose' },
                { 'acronym': 'SCE', 'name': 'SC Enterprises', 'color': 'violet' },
                { 'acronym': 'ASQ', 'name': 'A Square Enterprises', 'color': 'cyan' },
                { 'acronym': 'SN', 'name': 'S Nirmala', 'color': 'teal' },
                { 'acronym': 'FE', 'name': 'Fortune Enterprises', 'color': 'orange' },
                { 'acronym': 'JC', 'name': 'Jubilant Capital', 'color': 'sky' },
                { 'acronym': 'RP', 'name': 'Raja Priya', 'color': 'pink' }
            ]
            for item in defaults:
                acc = AccountName(name=item['name'], acronym=item['acronym'], color=item['color'])
                db.session.add(acc)
            db.session.commit()
            print("Default accounts seeded successfully.")
        else:
            # Clean up existing database accounts suffix if present
            all_accounts = AccountName.query.all()
            updated = False
            for acc in all_accounts:
                suffix = f" - {acc.acronym}"
                if acc.name.endswith(suffix):
                    acc.name = acc.name[:-len(suffix)]
                    updated = True
            if updated:
                db.session.commit()
                print("Cleaned up acronym suffixes from existing database account names.")
    except Exception as e:
        db.session.rollback()
        print(f"Error seeding default accounts: {e}")

with app.app_context():
    try:
        db.create_all()
        verify_schema()
        migrate_existing_short_loans()
        seed_default_accounts()
        print("Connected to PostgreSQL and verified tables.")
        
        # Robust Seed Logic: Check for each user individually
        # 1. Requested Admin User
        admin_user = User.query.filter_by(employee_code='admin').first()
        if not admin_user:
            admin_user = User(
                employee_code='admin',
                password=generate_password_hash('Admin123'),
                name='System Admin',
                role='admin',
                is_initial_password=False
            )
            db.session.add(admin_user)
            print("Seeded admin user: Admin123")
        else:
            # Force update for current troubleshooting
            admin_user.password = generate_password_hash('Admin123')
            db.session.commit()
            print("Force updated admin password to: Admin123")

        # 2. Default E001 User (Reserved for recovery/initial setup)
        if not User.query.filter_by(employee_code='E001').first():
            e001_user = User(
                employee_code='E001',
                password=generate_password_hash('admin123'),
                name='Senior Administrator',
                role='admin',
                is_initial_password=True # Forces setup
            )
            db.session.add(e001_user)
            print("Seeded recovery user: E001 / admin123")

        db.session.commit()
    except Exception as e:
        print(f"PostgreSQL connection warning or seeding error: {e}")


UPLOAD_FOLDER = 'uploads'
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

TEMP_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'temp_folder')
if not os.path.exists(TEMP_FOLDER):
    os.makedirs(TEMP_FOLDER)

# Google Sheets Configuration
SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive'
]
KEY_FILE_PATH = "robust-shadow-471605-k1-6152c9ae90ff.json"
SPREADSHEET_TITLE = 'Software Testing Report'
WORKSHEET_INDEX = 7

def update_google_sheet(user_name, bank_file_name, cloud_file_name, total_entries, sw_categorized, remaining):
    try:
        credentials = Credentials.from_service_account_file(KEY_FILE_PATH, scopes=SCOPES)
        gc = gspread.authorize(credentials)
        sheet = gc.open(SPREADSHEET_TITLE).get_worksheet(WORKSHEET_INDEX)
        
        # Get next S.NO
        records = sheet.get_all_records(expected_headers=[])
        s_no = len(records) + 1 if records else 1
        
        # Calculate Date
        current_date = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        # Append row: [S.NO, date, user name, Bank file name, all cloud file name, total entries, s/w categorized, remaining columns]
        row_data = [s_no, current_date, user_name, bank_file_name, cloud_file_name, total_entries, sw_categorized, remaining]
        sheet.append_row(row_data)
        print("Successfully updated Google Sheet.")
    except Exception as e:
        print(f"Error updating Google Sheet: {e}")

def get_acronym(name):
    if not name:
        return '—'
    n = name.strip().lower()
    if 'surge capital' in n: return 'SCS'
    if 'growth capital enterprises' in n or 'growth capital corp' in n or 'gce' in n: return 'GCE'
    if 'growth capital' in n: return 'GC'
    if 'jubilant capital' in n: return 'JC'
    if 'finova capital' in n: return 'FC'
    if 'ascend solutions' in n: return 'AS'
    if 'as enterprises' in n: return 'ASE'
    if 'fortune enterprises' in n: return 'FE'
    if 'sc enterprises' in n: return 'SCE'
    if 'square enterprises' in n: return 'ASQ'
    if 'nirmala' in n: return 'SN'
    if 'raja priya' in n: return 'RP'
    return name.upper()

def format_loan_ref_id(ref_id):
    if not ref_id:
        return None
    ref_str = str(ref_id).strip()
    if not ref_str:
        return None
    if not ref_str.upper().startswith('JL'):
        ref_str = f"JL{ref_str}"
    if ref_str.lower().startswith('jl'):
        ref_str = f"JL{ref_str[2:]}"
    return ref_str[:11]

def find_secondary_manager(secondary_accounts):
    """
    Finds a user who manages one of the secondary accounts as their primary.
    Returns the first matching user's name, or 'System Admin' if no match.
    Only considers accounts where is_need_approval is enabled.
    """
    if not secondary_accounts:
        return 'System Admin'
    
    # Get acronyms for all secondary accounts
    sec_acronyms = [get_acronym(acc.get('name') or acc.get('account_name')).strip().upper() for acc in secondary_accounts]
    
    # Filter sec_acronyms to keep only those where is_need_approval is True
    approval_acronyms = []
    for acr in sec_acronyms:
        acc_name_obj = AccountName.query.filter_by(acronym=acr).first()
        if acc_name_obj is None or acc_name_obj.is_need_approval:
            approval_acronyms.append(acr)
            
    if not approval_acronyms:
        return 'System Admin'
    
    # Fetch all users who are not System Admin
    users = User.query.filter(User.name != 'System Admin').all()
    
    for acronym in approval_acronyms:
        for u in users:
            try:
                perms = json.loads(u.permissions) if u.permissions else []
                if acronym in perms:
                    return u.name
            except:
                continue
                
    return 'System Admin'

# Serve React frontend
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    if path and os.path.exists(os.path.join(app.static_folder, path)):
        return app.send_static_file(path)
    return app.send_static_file('index.html')

@app.errorhandler(404)
def page_not_found(e):
    if request.path.startswith('/api/'):
        return jsonify({'error': 'Not Found'}), 404
    return app.send_static_file('index.html')

def process_files(bank_path, cloud_path, output_folder):
    """
    Processes the bank statement and cloud file to identify matches.
    Generates 'Matched_Cheques.xlsx' in the output_folder.
    Returns the path to the generated file.
    """
    try:
        # Load DataFrames
        # df1 is Bank Statement, df2 is All Cloud File
        df1 = pd.read_excel(bank_path)
        df2 = pd.read_excel(cloud_path)

        if any('CUSTOMER NAME' in col for col in df1.columns):
            print('IDFC file detected, running preprocess...')
            df1 = preprocess_idfc.extract_tables(bank_path)

        # Validation: Check if the user accidentally uploaded the Cloud file as the Bank statement
        if 'Comments' in df1.columns:
            raise ValueError("The All Cloud and Bank Statement files were uploaded in the wrong fields. Please upload them correctly.")

        # --- Preprocessing ---

        # Clean 'Amount' to handle commas and dots before using it
        if 'Amount' in df1.columns:
            df1['Amount'] = pd.to_numeric(df1['Amount'].astype(str).str.replace(',', '', regex=False), errors='coerce')
            df1["Debit"] = df1["Amount"].where(df1["Dr / Cr"] == "DR")
            df1["Credit"] = df1["Amount"].where(df1["Dr / Cr"] == "CR")
        
        if 'Amount (INR)' in df1.columns:
            df1['Amount (INR)'] = pd.to_numeric(df1['Amount (INR)'].astype(str).str.replace(',', '', regex=False), errors='coerce')
            df1["Debit"] = df1["Amount (INR)"].where(df1["CR/DR"] == "Dr.")
            df1["Credit"] = df1["Amount (INR)"].where(df1["CR/DR"] == "Cr.")

        # Ensure Credit and Debit are numeric in df1
        if 'Credit' in df1.columns:
            df1['Credit'] = pd.to_numeric(df1['Credit'].astype(str).str.replace(',', '', regex=False), errors='coerce')
        if 'Debit' in df1.columns:
            df1['Debit'] = pd.to_numeric(df1['Debit'].astype(str).str.replace(',', '', regex=False), errors='coerce')

        # Ensure Credit and Debit are numeric in df2
        if 'Credit' in df2.columns:
            df2['Credit'] = pd.to_numeric(df2['Credit'].astype(str).str.replace(',', '', regex=False), errors='coerce')
        if 'Debit' in df2.columns:
            df2['Debit'] = pd.to_numeric(df2['Debit'].astype(str).str.replace(',', '', regex=False), errors='coerce')

        # Clean 'Value Date' in Bank Statement
        if 'Value Date' in df1.columns:
            df1['Value Date'] = pd.to_datetime(df1['Value Date'], format='%d-%m-%y', errors='coerce')

        # Initialize result columns in df1 if not present
        if 'Ledger' not in df1.columns:
            df1['Ledger'] = None
        if 'Value' not in df1.columns:
            df1['Value'] = None

        BANK_NAMES = ['KOTAK', 'ICICI', 'HDFC', 'AXIS', 'SBI', 'BOB', 'PNB', 'CANARA', 'IDFC', 'YES', 'IDIB']

        # -------------------------------------------------------------------
        # Matching Round 1: Receipt Vouchers (Cheque / Amount / Date match)
        # -------------------------------------------------------------------
        df2_receipts = pd.DataFrame()
        if 'Voucher Type' in df2.columns:
            df2_receipts = df2[df2['Voucher Type'].str.strip().str.lower() == 'receipt voucher'].copy()
            df2_receipts['Instrument No.'] = df2_receipts['Instrument No.'].astype(str).str.lstrip('0').str.strip()
            df2_receipts['Credit'] = pd.to_numeric(df2_receipts['Credit'], errors='coerce')
            df2_receipts['Transaction Date'] = pd.to_datetime(df2_receipts['Transaction Date'], format='%d-%m-%y', errors='coerce')

        for _, row in df2_receipts.iterrows():
            cheque_no, ledger, amount, txn_date = str(row.get('Instrument No.')).strip(), row.get('Particulars'), row.get('Credit'), row.get('Transaction Date')
            if pd.isna(cheque_no) or pd.isna(amount):
                continue
            matches = df1[
                (df1['Description'].str.contains(cheque_no, case=False, na=False)) & 
                (df1['Value Date'] == txn_date) & 
                (df1['Credit'] == amount)
            ]
            if len(matches) == 1:
                idx = matches.index[0]
                df1.at[idx, 'Ledger'] = ledger
                df1.at[idx, 'Value'] = amount
                df1.at[idx, 'Diff'] = df1.at[idx, 'Credit'] - amount

        # -------------------------------------------------------------------
        # Matching Round 2: Payment Vouchers with "new finance payment" comment
        # -------------------------------------------------------------------
        df2_payments = pd.DataFrame()
        if 'Voucher Type' in df2.columns and 'Comments' in df2.columns:
            df2_payments = df2[
                (df2['Voucher Type'].str.strip().str.lower() == 'payment voucher')
                # df2['Comments'].str.lower().str.startswith('new finance payment', na=False)
            ].copy()
            df2_payments['Instrument No.'] = df2_payments['Instrument No.'].astype(str).str.strip('-').str.strip()

        for _, row in df2_payments.iterrows():
            rtgs_no = str(row.get('Instrument No.')).strip()
            txn_date = row.get('Transaction Date')
            amount = row.get('Credit')
            if pd.isna(rtgs_no) or rtgs_no == '':
                continue
            matches = df1[
                (df1['Description'].str.contains(rtgs_no, case=False, na=False)) &
                (df1['Value Date'] == txn_date) &
                (df1['Credit'] == amount)
            ]
            ledger = row.get('Details') if any(bank in row.get('Particulars') for bank in BANK_NAMES) else row.get('Particulars')
            if len(matches) == 1:
                idx = matches.index[0]
                df1.at[idx, 'Ledger'] = ledger
                df1.at[idx, 'Value'] = row.get('Credit')
                df1.at[idx, 'Diff'] = df1.at[idx, 'Credit'] - row.get('Credit')
        
        # -------------------------------------------------------------------
        # Matching Round 3: Receipt Vouchers with "emi receipt" comment
        # -------------------------------------------------------------------
        df2_receipts = pd.DataFrame()
        if 'Voucher Type' in df2.columns and 'Comments' in df2.columns:
            df2_receipts = df2[
                (df2['Voucher Type'].str.strip().str.lower() == 'receipt voucher')
                # df2['Comments'].str.lower().str.startswith('emi receipt', na=False)
            ].copy()
            df2_receipts['Instrument No.'] = df2_receipts['Instrument No.'].astype(str).str.strip('-').str.strip()

        for _, row in df2_receipts.iterrows():
            rtgs_no = str(row.get('Instrument No.')).strip()
            txn_date = row.get('Transaction Date')
            amount = row.get('Credit')
            if pd.isna(rtgs_no) or rtgs_no == '':
                continue
            matches = df1[
                (df1['Description'].str.contains(rtgs_no, case=False, na=False)) &
                (df1['Value Date'] == txn_date) &
                (df1['Credit'] == amount)
            ]
            ledger = row.get('Details') if any(bank in row.get('Particulars') for bank in BANK_NAMES) else row.get('Particulars')
            if len(matches) == 1:
                idx = matches.index[0]
                df1.at[idx, 'Ledger'] = ledger
                df1.at[idx, 'Value'] = row.get('Credit')
                df1.at[idx, 'Diff'] = df1.at[idx, 'Credit'] - row.get('Credit')

        # -------------------------------------------------------------------
        # Matching Round 4: RTN transactions in Bank Statement -> Cloud File
        # -------------------------------------------------------------------
        df1_rtn = df1[df1['Description'].str.contains('rtn', case=False, na=False)] if 'Description' in df1.columns else pd.DataFrame()

        for idx, row in df1_rtn.iterrows():
            chq_no = re.search(r"RTN:(.*?):", row['Description'])
            date = pd.to_datetime(row['Value Date'], format='%d-%m-%Y', errors='coerce')
            debit = pd.to_numeric(row['Debit'], errors='coerce')
            if chq_no:
                chq_no = chq_no.group(1).strip()
                matches = df1[
                    (df1['Description'].str.contains(chq_no, case=False, na=False)) & 
                    (df1['Value Date'] == date) & 
                    (pd.to_numeric(df1['Credit'], errors='coerce') == debit) & 
                    (df1.index != idx)
                ]
                if not matches.empty:
                    val = matches['Credit'].iloc[0]
                    if matches['Ledger'].iloc[0]:
                        df1.at[idx, 'Ledger'] = matches['Ledger'].iloc[0]
                        df1.at[idx, 'Value'] = val
                        df1.at[idx, 'Diff'] = df1.at[idx, 'Debit'] - val

        # -------------------------------------------------------------------
        # Matching Round 5: SWEEP TRANSFER transactions in Bank Statement
        # -------------------------------------------------------------------
        df1_sweep = (
            df1[df1['Description'].str.upper().str.startswith('SWEEP', na=False)]
            if 'Description' in df1.columns
            else pd.DataFrame()
        )

        for idx, row in df1_sweep.iterrows():
            df1.at[idx, 'Ledger'] = "SWEEP TRANSFER"

        # --- Finalization ---
        df1['Value'] = pd.to_numeric(df1['Value'], errors='coerce')
        df1['Value Date'] = df1['Value Date'].dt.strftime('%d-%m-%Y')

        output_file_path = os.path.join(output_folder, 'Matched_Cheques.xlsx')
        df1.to_excel(output_file_path, index=False)

        # Calculate metrics for Google Sheet
        total_entries = len(df1)
        # Assuming finding a Ledger match means "s/w categorized"
        sw_categorized = int(df1['Ledger'].notna().sum())
        remaining = total_entries - sw_categorized

        return output_file_path, total_entries, sw_categorized, remaining

    except Exception as e:
        print(f"Error processing files: {e}")
        raise e

def get_windows_username_from_request(req):
    auth_header = req.headers.get('Authorization')
    if auth_header and auth_header.startswith('Negotiate '):
        import base64
        import struct
        try:

            token = base64.b64decode(auth_header[10:])
            # NTLM Type 3 message parsing to extract username
            if token.startswith(b'NTLMSSP\x00\x03\x00\x00\x00'):
                # Read Domain, User, Workstation lengths and offsets
                domain_len, domain_maxlen, domain_offset = struct.unpack('<HHL', token[28:36])
                user_len, user_maxlen, user_offset = struct.unpack('<HHL', token[36:44])
                
                # Extract username (usually UTF-16LE encoded)
                username_bytes = token[user_offset:user_offset + user_len]
                return username_bytes.decode('utf-16le')
        except Exception as e:
            print(f"Error parsing NTLM token: {e}")
            pass
            
    # For local testing if NTLM isn't fully set up but running on Windows
    return os.getlogin() if hasattr(os, 'getlogin') else 'Unknown'

def get_acronym(name):
    if not name:
        return ''
    n = name.strip().lower()
    if 'surge capital' in n:
        return 'SCS'
    if 'growth capital' in n:
        return 'GC'
    if 'finova capital' in n:
        return 'FC'
    if 'ascend solutions' in n:
        return 'AS'
    if 'as enterprises' in n:
        return 'ASE'
    if 'sc enterprises' in n:
        return 'SCE'
    if 'square enterprises' in n:
        return 'ASQ'
    if 'nirmala' in n:
        return 'SN'
    return name

def ensure_db_and_tables():
    try:
        conn = psycopg2.connect(dbname='postgres', user='postgres', password='1234', host='localhost', port='5432')
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM pg_catalog.pg_database WHERE datname = 'accounts_db'")
        if not cur.fetchone():
            cur.execute('CREATE DATABASE accounts_db')
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Database check/creation error: {e}")
        
    with app.app_context():
        try:
            db.create_all()
            verify_schema()
        except Exception as e:
            print(f"Table creation error: {e}")

@app.route('/api/system/config', methods=['GET'])
def get_system_config():
    try:
        config = load_system_config()
        return jsonify({'success': True, 'config': config}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/system/config', methods=['POST'])
def update_system_config():
    try:
        data = request.json or {}
        config = load_system_config()
        if 'require_secondary_approval' in data:
            config['require_secondary_approval'] = bool(data['require_secondary_approval'])
        if 'require_admin_approval' in data:
            config['require_admin_approval'] = bool(data['require_admin_approval'])
            
        if save_system_config(config):
            return jsonify({'success': True, 'message': 'Configuration updated successfully', 'config': config}), 200
        else:
            return jsonify({'error': 'Failed to save configuration'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/accounts-name', methods=['GET'])
def get_accounts_name():
    try:
        accounts = AccountName.query.order_by(AccountName.id.asc()).all()
        result = []
        for acc in accounts:
            result.append({
                'id': acc.id,
                'name': acc.name,
                'acronym': acc.acronym,
                'color': acc.color,
                'type': acc.type or 'jl_report',
                'is_need_approval': acc.is_need_approval if acc.is_need_approval is not None else True
            })
        return jsonify({"success": True, "accounts": result}), 200
    except Exception as e:
        print(f"Error fetching accounts name: {e}")
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/accounts-name', methods=['POST'])
def add_account_name():
    try:
        data = request.json or {}
        name = data.get('name')
        acronym = data.get('acronym')
        type_val = data.get('type', 'jl_report')
        is_need_approval = bool(data.get('is_need_approval', True))
        
        if not name or not acronym:
            return jsonify({"success": False, "message": "Name and acronym are required"}), 400
            
        # Clean inputs
        name = name.strip()
        acronym = acronym.strip().upper()
        
        # Select color based on count
        colors = ['blue', 'indigo', 'emerald', 'amber', 'rose', 'violet', 'cyan', 'teal', 'orange', 'sky', 'pink']
        existing_count = AccountName.query.count()
        color = colors[existing_count % len(colors)]
        
        # Check if acronym already exists
        existing = AccountName.query.filter_by(acronym=acronym).first()
        if existing:
            return jsonify({"success": False, "message": f"Account with acronym '{acronym}' already exists"}), 400
            
        new_acc = AccountName(
            name=name,
            acronym=acronym,
            color=color,
            type=type_val,
            is_need_approval=is_need_approval
        )
        db.session.add(new_acc)
        db.session.commit()
        
        return jsonify({
            "success": True, 
            "message": "Account name added successfully", 
            "account": {
                'id': new_acc.id,
                'name': new_acc.name,
                'acronym': new_acc.acronym,
                'color': new_acc.color,
                'type': new_acc.type,
                'is_need_approval': new_acc.is_need_approval
            }
        }), 201
    except Exception as e:
        db.session.rollback()
        print(f"Error adding account name: {e}")
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/accounts-name/<int:account_id>', methods=['PUT'])
def update_account_name(account_id):
    try:
        acc = AccountName.query.get(account_id)
        if not acc:
            return jsonify({"success": False, "message": "Account not found"}), 404
            
        data = request.json or {}
        name = data.get('name')
        acronym = data.get('acronym')
        type_val = data.get('type')
        is_need_approval = data.get('is_need_approval')
        
        if name:
            acc.name = name.strip()
        if acronym:
            acronym_clean = acronym.strip().upper()
            existing = AccountName.query.filter(AccountName.acronym == acronym_clean, AccountName.id != account_id).first()
            if existing:
                return jsonify({"success": False, "message": f"Account with acronym '{acronym_clean}' already exists"}), 400
            acc.acronym = acronym_clean
        if type_val:
            acc.type = type_val.strip()
        if is_need_approval is not None:
            acc.is_need_approval = bool(is_need_approval)
            
        db.session.commit()
        return jsonify({
            "success": True, 
            "message": "Account name updated successfully",
            "account": {
                'id': acc.id,
                'name': acc.name,
                'acronym': acc.acronym,
                'color': acc.color,
                'type': acc.type,
                'is_need_approval': acc.is_need_approval
            }
        }), 200
    except Exception as e:
        db.session.rollback()
        print(f"Error updating account name: {e}")
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/accounts-name/<int:account_id>', methods=['DELETE'])
def delete_account_name(account_id):
    try:
        acc = AccountName.query.get(account_id)
        if not acc:
            return jsonify({"success": False, "message": "Account not found"}), 404
            
        db.session.delete(acc)
        db.session.commit()
        return jsonify({"success": True, "message": "Account name deleted successfully"}), 200
    except Exception as e:
        db.session.rollback()
        print(f"Error deleting account name: {e}")
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/users/list', methods=['GET'])
def get_users_list():
    try:
        ensure_db_and_tables()
        users = User.query.with_entities(User.name).all()
        # Filter out 'System Admin' and 'Administrator'
        excluded_names = {'system admin', 'administrator'}
        user_names = [u.name for u in users if u.name and u.name.lower().strip() not in excluded_names]
        return jsonify({'success': True, 'users': sorted(list(set(user_names)))}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/approvals', methods=['GET'])
def get_approvals():
    try:
        ensure_db_and_tables()
        user_name = request.args.get('user_name')
        if not user_name:
            return jsonify({'error': 'User name is required'}), 400
        
        # Identify requester role
        user = User.query.filter_by(name=user_name).first()
        is_admin = user and user.role == 'admin'

        show_history = request.args.get('history') == 'true'
        is_requester_view = request.args.get('requester') == 'true'

        if is_requester_view:
            # Show all loans submitted by this user (including rejected ones which are marked is_deleted=True)
            loans = Loan.query.filter(
                Loan.requester_name == user_name,
                db.or_(Loan.is_deleted == False, Loan.approval_status == 'REJECTED')
            ).order_by(Loan.id.desc()).all()
        elif show_history:
            if is_admin:
                # Admins see everything they've actioned (including rejected ones)
                loans = Loan.query.filter(
                    Loan.actioned_by == user_name,
                    db.or_(Loan.is_deleted == False, Loan.approval_status == 'REJECTED')
                ).order_by(Loan.id.desc()).all()
            else:
                # Verifiers see loans they've verified or rejected
                loans = Loan.query.filter(
                    Loan.verified_by == user_name,
                    Loan.approval_status != 'PENDING',
                    db.or_(Loan.is_deleted == False, Loan.approval_status == 'REJECTED')
                ).order_by(Loan.id.desc()).all()
        else:
            if is_admin:
                # Admins only see loans that are VERIFIED (approved by secondary manager first)
                loans = Loan.query.filter(Loan.approval_status == 'VERIFIED', Loan.is_deleted == False).order_by(Loan.id.desc()).all()
            else:
                # Regular verifiers see PENDING loans assigned to them
                loans = Loan.query.filter_by(verified_by=user_name, approval_status='PENDING', is_deleted=False).all()
        
        results = [{
            'id': l.id,
            'client_name': l.client_account_name,
            'loan_amount': l.loan_amount,
            'loan_date': l.loan_date,
            'loan_ref_id': l.loan_ref_id,
            'verified_by': l.verified_by,
            'approval_status': l.approval_status,
            'requester_name': l.requester_name or 'System',
            'requested_at': l.requested_at or '—',
            'repayment_amount': l.total_repayment_amount,
            'actioned_by': l.actioned_by,
            'actioned_at': l.actioned_at
        } for l in loans]
        
        return jsonify({'success': True, 'approvals': results, 'user_role': user.role if user else 'user'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/approvals/<int:loan_id>/action', methods=['POST'])
def handle_approval_action(loan_id):
    try:
        ensure_db_and_tables()
        data = request.json
        action = data.get('action') # 'APPROVE' or 'REJECT'
        actioner_name = data.get('actioner_name')
        
        if action not in ['APPROVE', 'REJECT']:
            return jsonify({'error': 'Invalid action'}), 400
            
        loan = db.session.get(Loan, loan_id)
        if not loan:
            return jsonify({'error': 'Loan not found'}), 404
            
        # Verify actioner role
        user = User.query.filter_by(name=actioner_name).first()
        if not user:
            return jsonify({'error': 'User not found in system'}), 404
            
        if action == 'REJECT':
            loan.approval_status = 'REJECTED'
            loan.is_deleted = True # Remove from main report but keep for requester/actioner history
        else: # APPROVE
            sys_config = load_system_config()
            require_adm = sys_config.get('require_admin_approval', True)
            
            if (user and user.role == 'admin') or not require_adm:
                loan.approval_status = 'APPROVED'
            else:
                loan.approval_status = 'VERIFIED'
                loan.verified_by = 'System Admin'
                
        loan.actioned_by = actioner_name
        loan.actioned_at = datetime.datetime.now().strftime("%d-%m-%Y %I:%M %p")
        db.session.commit()
        
        if loan.approval_status == 'VERIFIED':
            threading.Thread(target=notify_admin_loan_verified, args=[loan.id, actioner_name]).start()
            threading.Timer(86400.0, check_admin_loan_approval_after_24h, args=[loan.id, actioner_name]).start()
        
        return jsonify({'success': True, 'message': f'Loan {action}D successfully', 'new_status': loan.approval_status}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/upload-docx', methods=['POST'])
def handle_docx_upload():
    # Guarantee DB and tables are present before attempting insertion
    ensure_db_and_tables()

    if 'docx_file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
        
    file = request.files['docx_file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
        
    try:
        # Parse dynamic arrays from the frontend popup
        accounts_str = request.form.get('remaining_accounts', '[]')
        remaining_accounts = json.loads(accounts_str)
        loan_ref_id_raw = request.form.get('loan_ref_id', '').strip()
        loan_ref_id = format_loan_ref_id(loan_ref_id_raw)
        
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], file.filename)
        file.save(file_path)
        
        # Parse actual Document text inside read_word
        extracted_data = extract_word_data(file_path)
        final_output = build_final_output(extracted_data, remaining_accounts)
        
        # --- PREVENT SAME PRIMARY AND SECONDARY ACRONYM ---
        primary_acc_name = final_output.get('primary_account_name', '')
        primary_acronym = get_acronym(primary_acc_name).strip().upper()
        
        for acc in remaining_accounts:
            sec_name = acc.get('name', '').strip().upper()
            if sec_name == primary_acronym:
                return jsonify({
                    'success': False,
                    'error': 'Primary and secondary account name is same, Please check and correct it.'
                }), 400
        # --------------------------------------------------
        
        # --- PERMISSION VALIDATION ---
        emp_code = request.form.get('employee_code')
        if emp_code:
            user = User.query.filter_by(employee_code=emp_code).first()
            if user and user.role != 'admin':
                primary_acc = final_output.get('primary_account_name')
                acronym = get_acronym(primary_acc)
                user_perms = json.loads(user.permissions) if user.permissions else []
                
                # If the acronym is not in the user's permission list, REJECT
                if acronym not in user_perms:
                    return jsonify({
                        'success': False, 
                        'error': f"Unauthorized: You do not have permission to upload loans for '{primary_acc}' ({acronym}). Please contact your administrator for access."
                    }), 403
        # -----------------------------
        
        # Determine status and verifier based on configuration
        sys_config = load_system_config()
        require_sec = sys_config.get('require_secondary_approval', True)
        require_adm = sys_config.get('require_admin_approval', True)

        loan_status = 'PENDING'
        target_verifier = 'System Admin'
        actioned_by = None
        actioned_at = None

        if user and user.role == 'admin':
            loan_status = 'APPROVED'
            actioned_by = user.name
            actioned_at = datetime.datetime.now().strftime("%d-%m-%Y %I:%M %p")
        else:
            sec_mgr = None
            if require_sec:
                sec_mgr = find_secondary_manager(final_output.get('remaining_accounts', []))
            
            if sec_mgr and sec_mgr != 'System Admin':
                target_verifier = sec_mgr
                loan_status = 'PENDING'
            else:
                if require_adm:
                    target_verifier = 'System Admin'
                    loan_status = 'VERIFIED'
                else:
                    loan_status = 'APPROVED'
                    actioned_by = 'System'
                    actioned_at = datetime.datetime.now().strftime("%d-%m-%Y %I:%M %p")

        duplicate_loan = Loan.query.filter_by(
            client_account_name=final_output['client_account_name'],
            loan_date=final_output['loan_date'],
            loan_amount=final_output['loan_amount'],
            total_repayment_amount=final_output['total_repayment_amount'],
            loan_ref_id=loan_ref_id,
            is_deleted=False
        ).first()

        if duplicate_loan:
            return jsonify({
                'success': False,
                'error': "The file already exists"
            }), 400
        # ----------------------------

        # Commit into Postgres utilizing our models!
        loan = Loan(
            loan_ref_id=loan_ref_id,
            client_account_name=final_output['client_account_name'],
            loan_amount=final_output['loan_amount'],
            loan_date=final_output['loan_date'],
            primary_account_amount=final_output['primary_account_amount'],
            primary_account_name=final_output['primary_account_name'],
            primary_account_share=final_output['primary_account_share'],
            primary_account_interest=final_output['primary_account_interest'],
            total_repayment_amount=final_output['total_repayment_amount'],
            total_interest=final_output['total_interest'],
            verified_by=target_verifier,
            approval_status=loan_status,
            requester_name=user.name if user else 'Anonymous',
            requested_at=datetime.datetime.now().strftime("%d-%m-%Y %I:%M %p"),
            actioned_by=actioned_by,
            actioned_at=actioned_at
        )
        db.session.add(loan)
        db.session.flush()
        
        for acc in final_output['remaining_accounts']:
            rem_acc = RemainingAccount(
                loan_id=loan.id,
                account_name=acc['account_name'],
                percentage=acc['percentage'],
                share=acc['share'],
                interest_amount=acc['interest_amount'],
                tds=acc['tds']
            )
            db.session.add(rem_acc)
            
        for entry in final_output['table']:
            schedule = RepaymentSchedule(
                loan_id=loan.id,
                amount=entry['amount'],
                cheque_no=entry['cheque_no'],
                date=entry['date'],
                received_date=entry.get('received_date'),
                payment_date=entry.get('payment_date')
            )
            db.session.add(schedule)
            
        db.session.commit()
        if loan.approval_status != 'APPROVED':
            threading.Thread(target=notify_loan_created, args=[loan.id]).start()
            threading.Timer(86400.0, check_loan_approval_after_24h, args=[loan.id]).start()
        return jsonify({'success': True, 'loan_id': loan.id, 'message': 'Data inserted correctly into PostgreSQL!'}), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/upload-pdf', methods=['POST'])
def handle_pdf_upload():
    ensure_db_and_tables()

    if 'docx_file' not in request.files: 
        return jsonify({'error': 'No file uploaded'}), 400
        
    file = request.files['docx_file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
        
    try:
        accounts_str = request.form.get('remaining_accounts', '[]')
        remaining_accounts = json.loads(accounts_str)
        loan_ref_id_raw = request.form.get('loan_ref_id', '').strip()
        loan_ref_id_input = format_loan_ref_id(loan_ref_id_raw)
        
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], file.filename)
        file.save(file_path)
        
        # Parse PDF
        pdf_data = extract_pdf_data(file_path)
        
        # If user didn't provide a Loan ID in modal, use the one from PDF if available
        extracted_id = format_loan_ref_id(pdf_data.get('loan_number')) if pdf_data.get('loan_number') else None
        final_loan_ref_id = loan_ref_id_input or extracted_id

        # Build final formatted output (shares, interest splits)
        final_output = build_final_output(pdf_data, remaining_accounts)
        
        # --- PREVENT SAME PRIMARY AND SECONDARY ACRONYM ---
        primary_acc_name = final_output.get('primary_account_name', '')
        primary_acronym = get_acronym(primary_acc_name).strip().upper()
        
        for acc in remaining_accounts:
            sec_name = acc.get('name', '').strip().upper()
            if sec_name == primary_acronym:
                return jsonify({
                    'success': False,
                    'error': 'Primary and secondary account name is same, please check and correct.'
                }), 400
        # --------------------------------------------------
        
        # --- PERMISSION VALIDATION ---
        emp_code = request.form.get('employee_code')
        if emp_code:
            user = User.query.filter_by(employee_code=emp_code).first()
            if user and user.role != 'admin':
                primary_acc = final_output.get('primary_account_name')
                acronym = get_acronym(primary_acc)
                user_perms = json.loads(user.permissions) if user.permissions else []
                if acronym not in user_perms:
                    return jsonify({
                        'success': False, 
                        'error': f"Unauthorized: You do not have permission to upload loans for '{primary_acc}' ({acronym})."
                    }), 403
        # -----------------------------
        
        # Determine status and verifier based on configuration
        sys_config = load_system_config()
        require_sec = sys_config.get('require_secondary_approval', True)
        require_adm = sys_config.get('require_admin_approval', True)

        loan_status = 'PENDING'
        target_verifier = 'System Admin'
        actioned_by = None
        actioned_at = None

        if user and user.role == 'admin':
            loan_status = 'APPROVED'
            actioned_by = user.name
            actioned_at = datetime.datetime.now().strftime("%d-%m-%Y %I:%M %p")
        else:
            sec_mgr = None
            if require_sec:
                sec_mgr = find_secondary_manager(final_output.get('remaining_accounts', []))
            
            if sec_mgr and sec_mgr != 'System Admin':
                target_verifier = sec_mgr
                loan_status = 'PENDING'
            else:
                if require_adm:
                    target_verifier = 'System Admin'
                    loan_status = 'VERIFIED'
                else:
                    loan_status = 'APPROVED'
                    actioned_by = 'System'
                    actioned_at = datetime.datetime.now().strftime("%d-%m-%Y %I:%M %p")

        # --- DUPLICATE LOAN CHECK ---
        duplicate_loan = Loan.query.filter_by(
            client_account_name=final_output['client_account_name'],
            loan_date=final_output['loan_date'],
            loan_amount=final_output['loan_amount'],
            total_repayment_amount=final_output['total_repayment_amount'],
            loan_ref_id=final_loan_ref_id,
            is_deleted=False
        ).first()

        if duplicate_loan:
            return jsonify({
                'success': False,
                'error': "The file already exists"
            }), 400
        # ----------------------------

        loan = Loan(
            loan_ref_id=final_loan_ref_id,
            client_account_name=final_output['client_account_name'],
            loan_amount=final_output['loan_amount'],
            loan_date=final_output['loan_date'],
            primary_account_amount=final_output['primary_account_amount'],
            primary_account_name=final_output['primary_account_name'],
            primary_account_share=final_output['primary_account_share'],
            primary_account_interest=final_output['primary_account_interest'],
            total_repayment_amount=final_output['total_repayment_amount'],
            total_interest=final_output['total_interest'],
            verified_by=target_verifier,
            approval_status=loan_status,
            requester_name=user.name if user else 'Anonymous',
            requested_at=datetime.datetime.now().strftime("%d-%m-%Y %I:%M %p"),
            actioned_by=actioned_by,
            actioned_at=actioned_at
        )
        db.session.add(loan)
        db.session.flush()
        
        for acc in final_output['remaining_accounts']:
            rem_acc = RemainingAccount(
                loan_id=loan.id,
                account_name=acc['account_name'],
                percentage=acc['percentage'],
                share=acc['share'],
                interest_amount=acc['interest_amount'],
                tds=acc['tds']
            )
            db.session.add(rem_acc)
            
        for entry in final_output['table']:
            schedule = RepaymentSchedule(
                loan_id=loan.id,
                amount=entry['amount'],
                interest_amount=entry.get('interest_amount', 0),
                cheque_no=entry['cheque_no'],
                date=entry['date'],
                received_date=entry.get('received_date'),
                payment_date=entry.get('payment_date')
            )
            db.session.add(schedule)
            
        db.session.commit()
        if loan.approval_status != 'APPROVED':
            threading.Thread(target=notify_loan_created, args=[loan.id]).start()
            threading.Timer(86400.0, check_loan_approval_after_24h, args=[loan.id]).start()
        return jsonify({'success': True, 'loan_id': loan.id, 'message': 'PDF data processed correctly!'}), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/loans', methods=['GET'])
def get_loans():
    try:
        ensure_db_and_tables()
        loans = Loan.query.filter_by(is_deleted=False).order_by(Loan.id.desc()).all()
        
        loans_data = []
        for index, loan in enumerate(loans, start=1):
            schedule = [{
                'id': s.id,
                'date': s.date,
                'received_date': s.received_date,
                'payment_date': s.payment_date,
                'amount': s.amount,
                'cheque_no': s.cheque_no,
                'remarks': s.remarks,
                'type': s.type,
                'splits': s.splits,
                'date_approval_status': s.date_approval_status or 'APPROVED',
                'date_editor_role': s.date_editor_role
            } for s in loan.repayment_schedule]
            
            loans_data.append({
                'id': loan.id,
                's_no': index,
                'loan_ref_id': loan.loan_ref_id or '—',
                'client_name': loan.client_account_name,
                'loan_amount': loan.loan_amount,
                'loan_date': loan.loan_date,
                'primary_account_name': loan.primary_account_name,
                'primary_account_amount': loan.primary_account_amount,
                'primary_account_interest': loan.primary_account_interest,
                'primary_account_share': loan.primary_account_share,
                'repayment_amount': loan.total_repayment_amount,
                'verified_by': loan.verified_by,
                'approval_status': loan.approval_status,
                'secondary_accounts': [{
                    'account_name': acc.account_name,
                    'percentage': acc.percentage,
                    'share': acc.share,
                    'interest_amount': acc.interest_amount
                } for acc in loan.remaining_accounts],
                'repayment_schedule': schedule
            })
            
        return jsonify({'success': True, 'loans': loans_data}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/loans/<int:loan_id>', methods=['GET'])
def get_loan_detail(loan_id):
    try:
        ensure_db_and_tables()
        loan = db.session.get(Loan, loan_id)
        if not loan or (loan.is_deleted and loan.approval_status != 'REJECTED'):
            return jsonify({'error': 'Loan not found'}), 404

        total_i = loan.primary_account_interest + sum(a.interest_amount for a in loan.remaining_accounts)
        remaining = []
        for acc in loan.remaining_accounts:
            acr = get_acronym(acc.account_name).strip().upper()
            acc_name_obj = AccountName.query.filter_by(acronym=acr).first()
            is_need_app = acc_name_obj.is_need_approval if acc_name_obj is not None else True
            
            remaining.append({
                'id': acc.id,
                'account_name': acc.account_name,
                'share': acc.share,
                'interest_amount': acc.interest_amount,
                'percentage': acc.percentage,
                'interest_percentage': (acc.interest_amount / total_i * 100) if total_i > 0 else 0,
                'tds': acc.tds,
                'is_need_approval': is_need_app
            })

        schedule = [
            {
                'id': s.id,
                'date': s.date,
                'cheque_no': s.cheque_no,
                'amount': s.amount,
                'interest_amount': s.interest_amount,
                'received_date': s.received_date,
                'payment_date': s.payment_date,
                'remarks': s.remarks,
                'type': s.type,
                'splits': s.splits,
                'date_approval_status': s.date_approval_status or 'APPROVED',
                'date_editor_role': s.date_editor_role
            }
            for s in loan.repayment_schedule
        ]

        data = {
            'id': loan.id,
            'loan_ref_id': loan.loan_ref_id or None,
            'client_name': loan.client_account_name,
            'loan_date': loan.loan_date,
            'loan_amount': loan.loan_amount,
            'primary_account_name': loan.primary_account_name,
            'primary_account_amount': loan.primary_account_amount,
            'primary_account_share': loan.primary_account_share,
            'primary_account_interest': loan.primary_account_interest,
            'total_repayment_amount': loan.total_repayment_amount,
            'total_interest': loan.total_interest,
            'verified_by': loan.verified_by,
            'approval_status': loan.approval_status,
            'edited_by': loan.edited_by,
            'remaining_accounts': remaining,
            'repayment_schedule': schedule,
        }
        return jsonify({'success': True, 'loan': data}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/upload', methods=['POST'])
def upload_files():
    if 'bank_file' not in request.files or 'cloud_file' not in request.files:
        return jsonify({'error': 'No file part'}), 400

    bank_file = request.files['bank_file']
    cloud_file = request.files['cloud_file']

    if bank_file.filename == '' or cloud_file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    allowed_ext = {'.xlsx', '.xls'}
    def is_valid(filename):
        return os.path.splitext(filename)[1].lower() in allowed_ext

    if not is_valid(bank_file.filename):
        return jsonify({'error': f'Bank file "{bank_file.filename}" is not a valid Excel file. Only .xlsx and .xls are allowed.'}), 400
    if not is_valid(cloud_file.filename):
        return jsonify({'error': f'Cloud file "{cloud_file.filename}" is not a valid Excel file. Only .xlsx and .xls are allowed.'}), 400

    if bank_file and cloud_file:
        user_name = get_windows_username_from_request(request)
        bank_path = os.path.join(app.config['UPLOAD_FOLDER'], bank_file.filename)
        cloud_path = os.path.join(app.config['UPLOAD_FOLDER'], cloud_file.filename)
        
        bank_file.save(bank_path)
        cloud_file.save(cloud_path)

        try:
            output_file, total_entries, sw_categorized, remaining = process_files(bank_path, cloud_path, app.config['UPLOAD_FOLDER'])
            
            response = send_file(output_file, as_attachment=True)
            response.headers['X-Total-Entries'] = str(total_entries)
            response.headers['X-SW-Categorized'] = str(sw_categorized)
            response.headers['X-Remaining'] = str(remaining)
            return response
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    return jsonify({'error': 'Unknown error'}), 500

def parse_date_robustly(date_val):
    if pd.isna(date_val):
        return None
    if isinstance(date_val, (datetime.datetime, datetime.date)):
        return date_val
    s = str(date_val).strip()
    if not s:
        return None
    if ' ' in s:
        s = s.split(' ')[0]
    s = s.replace('/', '-')
    for fmt in ("%d-%m-%Y", "%Y-%m-%d", "%d-%m-%y", "%y-%m-%d"):
        try:
            return datetime.datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None

@app.route('/api/upload-day-book', methods=['POST'])
def upload_day_book():
    account_name = request.form.get('account_name', 'Unknown')
    file = request.files.get('file')
    
    # Standardized filename
    staged_filename = f"{account_name}_DayBook.xlsx"
    file_path = os.path.join(TEMP_FOLDER, staged_filename)

    if file:
        # If a file is provided in the request, save/overwrite it
        if not os.path.exists(TEMP_FOLDER):
            os.makedirs(TEMP_FOLDER)
        file.save(file_path)
    elif not os.path.exists(file_path):
        # If no file in request and no staged file exists
        return jsonify({'error': f'No Day Book staged or provided for {account_name}'}), 400

    try:
        df = pd.read_excel(file_path)
        receipt_df = df[df["Voucher Type"] == "Receipt Voucher"].copy()
        
        # --- Pre-check for Reversals ---
        # Get set of Instrument Numbers and Voucher Numbers that were reversed (Payment Voucher + "Reversal EMI" in comments)
        reversed_instruments = set()
        reversed_vouchers = set()
        
        # Clean Instrument No: remove .0 and strip whitespace
        def clean_inst_val(v):
            if pd.isna(v): return None
            s = str(v).strip()
            if s.endswith('.0'): s = s[:-2]
            return s if s else None

        if "Voucher Type" in df.columns and "Comments" in df.columns:
            rev_mask = (df["Voucher Type"] == "Payment Voucher") & (df["Comments"].str.contains("Reversal EMI", na=False, case=False))
            
            if "Instrument No." in df.columns:
                reversed_instruments = {clean_inst_val(v) for v in df[rev_mask]["Instrument No."].dropna() if clean_inst_val(v)}
                
            if "Voucher Number" in df.columns:
                # Find all receipt voucher numbers in the daybook
                receipt_vcs = {str(v).strip() for v in df[df["Voucher Type"] == "Receipt Voucher"]["Voucher Number"].dropna() if str(v).strip()}
                
                # Check each reversal comment to see if it mentions any receipt voucher number
                rev_comments = df[rev_mask]["Comments"].dropna().astype(str).tolist()
                for comment in rev_comments:
                    for vnum in receipt_vcs:
                        if vnum and vnum in comment:
                            reversed_vouchers.add(vnum)
        # -------------------------------
        
        # --- Validation: Ensure file matches the account folder ---
        mismatch_found = False
        mismatch_acronym = ""
        valid_sample_count = 0
        
        # Skip validation for individual imports (where account_name is "Unknown")
        if account_name != 'Unknown':
            for _, row in receipt_df.iterrows():
                try:
                    p_text = str(row.get("Particulars", ""))
                    p_parts = p_text.split('-')
                    if len(p_parts) < 2: continue
                    l_ref = p_parts[-1].strip()
                    
                    loan_obj = Loan.query.filter_by(loan_ref_id=l_ref, is_deleted=False).first()
                    if not loan_obj and not l_ref.upper().startswith('JL'):
                        loan_obj = Loan.query.filter_by(loan_ref_id=f"JL{l_ref}", is_deleted=False).first()
                    if loan_obj:
                        loan_acronym = get_acronym(loan_obj.primary_account_name)
                        if loan_acronym != account_name:
                            mismatch_found = True
                            mismatch_acronym = loan_acronym
                            break
                        valid_sample_count += 1
                        if valid_sample_count >= 5: # Checked 5 and they all match
                            break
                except:
                    continue
                    
            if mismatch_found:
                return jsonify({
                    'success': False,
                    'error': f'Incorrect Folder: This file appears to contain data for {mismatch_acronym}, but was uploaded to the {account_name} folder. Please upload to the correct folder.'
                }), 400
        # ---------------------------------------------------------

        # Get all approved loans for substring matching (sorted by length descending for precision)
        all_approved_loans = [l for l in Loan.query.filter_by(approval_status='APPROVED', is_deleted=False).all() if l.loan_ref_id]
        all_approved_loans.sort(key=lambda x: len(x.loan_ref_id), reverse=True)

        updated_count = 0
        updated_details = []
        skipped_details = []
        mismatch_details = []

        for index, row in receipt_df.iterrows():
            try:
                # Robust cleaning for Instrument No
                inst_raw = row.get("Instrument No.")
                instrument_no = ""
                if pd.notna(inst_raw):
                    instrument_no = str(inst_raw).strip()
                    if instrument_no.endswith('.0'): instrument_no = instrument_no[:-2]

                if instrument_no and instrument_no in reversed_instruments:
                    skipped_details.append(f"Row {index+1}: Instrument No '{instrument_no}' is in Reversal Set")
                    continue

                vnum_raw = row.get("Voucher Number")
                vnum = str(vnum_raw).strip() if pd.notna(vnum_raw) else ""
                if vnum and vnum in reversed_vouchers:
                    skipped_details.append(f"Row {index+1}: Voucher Number '{vnum}' is in Reversal Set")
                    continue

                particulars = str(row.get("Particulars", ""))
                comments = str(row.get("Comments", ""))
                trans_date_raw = row.get("Transaction Date")
                
                # --- New Substring Matching Logic ---
                # Check which DB loan ID is present in the daybook particulars
                loan = None
                for l in all_approved_loans:
                    if l.loan_ref_id in particulars:
                        loan = l
                        break
                    if l.loan_ref_id.upper().startswith('JL') and l.loan_ref_id[2:] in particulars:
                        loan = l
                        break
                
                if not loan:
                    skipped_details.append(f"Row {index+1}: No matching Loan ID found in Particulars '{particulars}'")
                    continue
                
                loan_ref_id = loan.loan_ref_id
                # -------------------------------------
                
                emi_parts = comments.split('_')
                if len(emi_parts) < 2:
                    skipped_details.append(f"Row {index+1} ({loan_ref_id}): Comments '{comments}' missing '_'")
                    continue
                try:
                    emi_no = int(emi_parts[-1].strip())
                except ValueError:
                    skipped_details.append(f"Row {index+1} ({loan_ref_id}): EMI '{emi_parts[-1]}' not a number")
                    continue

                rec_dt = parse_date_robustly(trans_date_raw)
                if not rec_dt:
                    skipped_details.append(f"Row {index+1} ({loan_ref_id}): Missing or Invalid Transaction Date")
                    continue
                received_date = rec_dt.strftime("%d-%m-%Y")

                if loan.approval_status != 'APPROVED':
                    skipped_details.append(f"{loan_ref_id}: Status '{loan.approval_status}' is not APPROVED")
                    continue
                    
                system_schedule = [s for s in loan.repayment_schedule if s.type != 'manual']
                if emi_no < 1 or emi_no > len(system_schedule):
                    skipped_details.append(f"{loan_ref_id}: EMI {emi_no} out of range (Total {len(system_schedule)})")
                    continue
                
                target_installment = system_schedule[emi_no - 1]
                
                # Only update if received_date is not already filled
                if target_installment.received_date and str(target_installment.received_date).strip() and str(target_installment.received_date).strip() != 'dd-mm-yyyy':
                    skipped_details.append(f"{loan_ref_id} EMI {emi_no}: Already has date '{target_installment.received_date}'")
                    continue

                try:
                    today = datetime.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
                    due_dt = parse_date_robustly(target_installment.date)
                    
                    if not due_dt:
                        skipped_details.append(f"{loan_ref_id} EMI {emi_no}: Installment due date '{target_installment.date}' format invalid")
                        continue
                    
                    if due_dt > today:
                        skipped_details.append(f"{loan_ref_id} EMI {emi_no}: Future installment (Due {target_installment.date})")
                        continue
                        
                    if rec_dt < due_dt:
                        skipped_details.append(f"{loan_ref_id} EMI {emi_no}: Early payment ({received_date} < {target_installment.date})")
                        continue

                except Exception as e:
                    skipped_details.append(f"{loan_ref_id} EMI {emi_no}: Date Error ({str(e)})")
                    continue

                # Compare Credit with total installment amount - checked only after EMI number and Date checks pass
                expected_amount = target_installment.amount
                
                credit_val = row.get("Credit")
                try:
                    # Clean and parse Credit amount
                    credit_str = str(credit_val).replace(',', '').strip() if pd.notna(credit_val) else "0"
                    credit_amount = float(credit_str)
                except ValueError:
                    credit_amount = 0.0
                
                if round(abs(expected_amount - credit_amount), 2) > 0.05:
                    mismatch_details.append(
                        f"Row {index+1} ({loan_ref_id} EMI {emi_no}): Installment amount is {expected_amount:.2f}, but Credit column has {credit_amount:.2f}."
                    )
                    continue

                target_installment.received_date = received_date
                updated_count += 1
                updated_details.append(f"{loan.client_account_name} - EMI {emi_no}")
                
            except Exception:
                continue
        
        db.session.commit()
        message = f'Successfully updated {updated_count} installments from Day Book.' if updated_count > 0 else "No updates"
        return jsonify({
            'success': True, 
            'message': message,
            'updated_count': updated_count,
            'updated_details': updated_details,
            'skipped_details': skipped_details,
            'mismatch_details': mismatch_details
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/staged-folders', methods=['GET'])
def get_staged_folders():
    try:
        if not os.path.exists(TEMP_FOLDER):
            return jsonify({'success': True, 'folders': []})
        
        # Files are named like "{account_name}_DayBook.xlsx"
        files = os.listdir(TEMP_FOLDER)
        folders = []
        for f in files:
            if f.endswith('_DayBook.xlsx'):
                folders.append(f.replace('_DayBook.xlsx', ''))
        return jsonify({'success': True, 'folders': list(set(folders))})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/stage-day-book', methods=['POST'])
def stage_day_book():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    account_name = request.form.get('account_name')
    
    if not account_name:
        return jsonify({'error': 'Account name is required'}), 400
        
    try:
        if not os.path.exists(TEMP_FOLDER):
            os.makedirs(TEMP_FOLDER)
            
        # Standardize filename so other users can see it
        filename = f"{account_name}_DayBook.xlsx"
        file_path = os.path.join(TEMP_FOLDER, filename)
        file.save(file_path)
        
        return jsonify({'success': True, 'message': f'Staged {account_name} successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/clear-temp-folder', methods=['POST'])
def clear_temp_folder():
    try:
        if os.path.exists(TEMP_FOLDER):
            for filename in os.listdir(TEMP_FOLDER):
                file_path = os.path.join(TEMP_FOLDER, filename)
                try:
                    if os.path.isfile(file_path) or os.path.islink(file_path):
                        os.unlink(file_path)
                except Exception as e:
                    print(f'Failed to delete {file_path}. Reason: {e}')
        return jsonify({'success': True, 'message': 'Temp folder cleared'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/track-export', methods=['POST'])
def track_export():
    try:
        data = request.json
        report_type = data.get('report_type', 'Unknown Report')
        user_name = get_windows_username_from_request(request) or "Unknown"
        
        # Map frontend data to Google Sheet columns
        bank_file_name = report_type
        cloud_file_name = data.get('filters', 'N/A')
        total_entries = data.get('total_entries', 0)
        sw_categorized = data.get('sw_categorized', 0)
        remaining = data.get('remaining', 0)
        
        threading.Thread(
            target=update_google_sheet, 
            args=(user_name, bank_file_name, cloud_file_name, total_entries, sw_categorized, remaining)
        ).start()
        
        return jsonify({'success': True}), 200
    except Exception as e:
        print(f"Error in track_export: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/loans/<int:loan_id>/accounts', methods=['PATCH'])
def update_loan_accounts(loan_id):
    try:
        ensure_db_and_tables()
        loan = db.session.get(Loan, loan_id)
        if not loan:
            return jsonify({'error': 'Loan not found'}), 404
            
        data = request.json

        if 'loan_ref_id' in data:
            loan.loan_ref_id = format_loan_ref_id(data['loan_ref_id'])

        if 'edited_by' in data:
            loan.edited_by = data['edited_by']

        if 'primary' in data:
            loan.primary_account_amount = float(data['primary'].get('amount', loan.primary_account_amount))
            loan.primary_account_interest = float(data['primary'].get('interest', loan.primary_account_interest))
            
        if 'secondary' in data:
            for sec_data in data['secondary']:
                acc = db.session.get(RemainingAccount, sec_data['id'])
                if acc and acc.loan_id == loan_id:
                    acc.share = float(sec_data.get('amount', acc.share))
                    acc.interest_amount = float(sec_data.get('interest', acc.interest_amount))
        
        # Recalculate Totals
        total_p = loan.primary_account_amount + sum(acc.share for acc in loan.remaining_accounts)
        total_i = loan.primary_account_interest + sum(acc.interest_amount for acc in loan.remaining_accounts)
        
        loan.loan_amount = total_p
        loan.total_interest = total_i
        loan.total_repayment_amount = total_p + total_i

        
        # Recalculate Percentages
        if total_p > 0:
            loan.primary_account_share = (loan.primary_account_amount / total_p * 100)
            for acc in loan.remaining_accounts:
                acc.percentage = (acc.share / total_p * 100)
        else:
            loan.primary_account_share = 0
            for acc in loan.remaining_accounts:
                acc.percentage = 0

        # Recalculate Interest Percentages
        if total_i > 0:
            # We don't store primary_interest_percentage in DB, but we can compute it
            # For secondary accounts, we'll just send it in the JSON response
            for acc in loan.remaining_accounts:
                acc.interest_percentage = (acc.interest_amount / total_i * 100)
        else:
            for acc in loan.remaining_accounts:
                acc.interest_percentage = 0

        db.session.commit()
        return jsonify({'success': True, 'message': 'Accounts updated successfully'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/loans/<int:loan_id>', methods=['DELETE'])
def delete_loan(loan_id):
    try:
        ensure_db_and_tables()
        loan = db.session.get(Loan, loan_id)
        if not loan:
            return jsonify({'error': 'Loan not found'}), 404
            
        loan.is_deleted = True
        db.session.commit()
        return jsonify({'success': True, 'message': 'Loan soft-deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

def send_due_date_notification(loan, new_date, schedule_item=None, editor_name=None):
    if not loan or not new_date:
        return
    import json
    from datetime import datetime
    now_str = datetime.now().strftime("%d-%m-%Y %I:%M %p")
    
    # Determine acronyms
    pri_acronym = get_acronym(loan.primary_account_name)
    sec_acronyms = []
    for acc in loan.remaining_accounts:
        acr = get_acronym(acc.account_name).strip().upper()
        acc_name_obj = AccountName.query.filter_by(acronym=acr).first()
        if acc_name_obj is None or acc_name_obj.is_need_approval:
            sec_acronyms.append(acr)
    
    all_users = User.query.filter(User.role != 'admin').all()
    
    # Find primary managers and secondary managers
    primary_managers = []
    secondary_managers = []
    
    for u in all_users:
        try:
            u_perms = json.loads(u.permissions) if u.permissions else []
        except Exception:
            u_perms = []
            
        if pri_acronym in u_perms:
            primary_managers.append(u)
        elif any(acr in u_perms for acr in sec_acronyms):
            secondary_managers.append(u)
            
    # Check if editor is a secondary manager
    is_editor_sec_manager = False
    if editor_name:
        is_editor_sec_manager = any(u.name == editor_name for u in secondary_managers)
        
    if is_editor_sec_manager:
        # If edited by a secondary manager, send notification to primary manager(s)
        notified_users = primary_managers
    else:
        # Otherwise (edited by primary manager or admin), send to secondary manager(s)
        notified_users = secondary_managers
        
    # FALLBACK TO ADMIN: If notified_users is empty, send to admin users
    if not notified_users:
        admin_users = User.query.filter_by(role='admin').all()
        if not admin_users:
            class DummyUser:
                def __init__(self, name):
                    self.name = name
            notified_users = [DummyUser('System Admin')]
        else:
            notified_users = admin_users
        
    # Get all PENDING schedule items for this loan
    pending_items = [s for s in loan.repayment_schedule if s.date_approval_status == 'PENDING']
    if schedule_item and schedule_item not in pending_items:
        pending_items.append(schedule_item)
        
    system_schedule = [s for s in loan.repayment_schedule if s.type != 'manual']
    
    # Calculate EMI numbers for all pending items
    changed_emis = []
    for item in pending_items:
        try:
            e_no = system_schedule.index(item) + 1
            changed_emis.append((e_no, f"EMI {e_no}"))
        except ValueError:
            try:
                e_no = loan.repayment_schedule.index(item) + 1
                changed_emis.append((1000 + e_no, f"Row {e_no}"))
            except ValueError:
                pass
                
    # Sort by numeric order and keep unique values
    changed_emis = sorted(list(set(changed_emis)), key=lambda x: x[0])
    emis_str = ", ".join([x[1] for x in changed_emis])
    
    if emis_str:
        msg = f"Due date changes pending for {loan.client_account_name} ({emis_str})."
    else:
        msg = f"Due date changes pending for {loan.client_account_name}."
        
    # Create or update notification for each manager
    for u in notified_users:
        existing_notif = Notification.query.filter_by(
            user_name=u.name,
            link=f"/jl-due-report/{loan.id}",
            is_read=False
        ).first()
        
        if existing_notif:
            existing_notif.message = msg
            existing_notif.created_at = now_str
        else:
            notif = Notification(
                user_name=u.name,
                title="New Due Date Set",
                message=msg,
                link=f"/jl-due-report/{loan.id}",
                created_at=now_str,
                is_read=False
            )
            db.session.add(notif)

@app.route('/api/loans/<int:loan_id>/repayment-schedule', methods=['POST'])
def add_repayment_schedule(loan_id):
    try:
        ensure_db_and_tables()
        data = request.json
        
        loan = db.session.get(Loan, loan_id)
        if not loan:
            return jsonify({'error': 'Loan not found'}), 404
            
        due_date = data.get('date', '')
        payment_date = data.get('payment_date', '')
        
        new_entry = RepaymentSchedule(
            loan_id=loan_id,
            amount=float(data.get('amount', 0)),
            interest_amount=float(data.get('interest_amount', 0)),
            date=due_date,
            cheque_no=data.get('cheque_no', ''),
            remarks=data.get('remarks', ''),
            type=data.get('type', 'others'),
            received_date=data.get('received_date'),
            payment_date=payment_date,
            splits=data.get('splits'),
            date_approval_status='PENDING' if (due_date or payment_date) else 'APPROVED'
        )
        
        editor_name = data.get('editor_name')
        if due_date or payment_date:
            editor_role = 'PRIMARY'
            if editor_name:
                import json
                pri_acronym = get_acronym(loan.primary_account_name)
                sec_acronyms = [get_acronym(acc.account_name) for acc in loan.remaining_accounts]
                all_users = User.query.filter(User.role != 'admin').all()
                secondary_managers = []
                for u in all_users:
                    try:
                        u_perms = json.loads(u.permissions) if u.permissions else []
                    except Exception:
                        u_perms = []
                    if not pri_acronym in u_perms and any(acr in u_perms for acr in sec_acronyms):
                        secondary_managers.append(u)
                is_editor_sec_manager = any(u.name == editor_name for u in secondary_managers)
                if is_editor_sec_manager:
                    editor_role = 'SECONDARY'
            new_entry.date_editor_role = editor_role
            
        db.session.add(new_entry)
        
        if due_date:
            send_due_date_notification(loan, due_date, new_entry, editor_name)
        elif payment_date:
            send_due_date_notification(loan, payment_date, new_entry, editor_name)
            
        db.session.commit()
        return jsonify({'success': True, 'message': 'Entry added successfully'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/repayment-schedule/<int:schedule_id>', methods=['PATCH'])
def patch_repayment_schedule(schedule_id):
    try:
        ensure_db_and_tables()
        schedule_item = db.session.get(RepaymentSchedule, schedule_id)
        if not schedule_item:
            return jsonify({'error': 'Schedule item not found'}), 404
            
        data = request.json
        editor_name = data.get('editor_name')
        if 'received_date' in data:
            schedule_item.received_date = data['received_date']
        if 'payment_date' in data:
            old_payment_date = schedule_item.payment_date
            new_payment_date = data['payment_date']
            schedule_item.payment_date = new_payment_date
            
            # Send notification if new_payment_date is filled and is different
            if new_payment_date and new_payment_date != old_payment_date:
                loan = schedule_item.loan
                schedule_item.date_approval_status = 'PENDING'
                
                # Determine editor role
                editor_role = 'PRIMARY'
                if editor_name:
                    import json
                    pri_acronym = get_acronym(loan.primary_account_name)
                    sec_acronyms = [get_acronym(acc.account_name) for acc in loan.remaining_accounts]
                    all_users = User.query.filter(User.role != 'admin').all()
                    secondary_managers = []
                    for u in all_users:
                        try:
                            u_perms = json.loads(u.permissions) if u.permissions else []
                        except Exception:
                            u_perms = []
                        if not pri_acronym in u_perms and any(acr in u_perms for acr in sec_acronyms):
                            secondary_managers.append(u)
                    is_editor_sec_manager = any(u.name == editor_name for u in secondary_managers)
                    if is_editor_sec_manager:
                        editor_role = 'SECONDARY'
                schedule_item.date_editor_role = editor_role
                
                send_due_date_notification(loan, new_payment_date, schedule_item, editor_name)
        if 'remarks' in data:
            schedule_item.remarks = data['remarks']
        if 'amount' in data:
            schedule_item.amount = float(data['amount'])
        if 'interest_amount' in data:
            schedule_item.interest_amount = float(data['interest_amount'])
        if 'date' in data:
            old_date = schedule_item.date
            new_date = data['date']
            schedule_item.date = new_date
            
            # Send notification if new_date is filled and is different
            if new_date and new_date != old_date:
                loan = schedule_item.loan
                schedule_item.date_approval_status = 'PENDING'
                
                # Determine editor role
                editor_role = 'PRIMARY'
                if editor_name:
                    import json
                    pri_acronym = get_acronym(loan.primary_account_name)
                    sec_acronyms = [get_acronym(acc.account_name) for acc in loan.remaining_accounts]
                    all_users = User.query.filter(User.role != 'admin').all()
                    secondary_managers = []
                    for u in all_users:
                        try:
                            u_perms = json.loads(u.permissions) if u.permissions else []
                        except Exception:
                            u_perms = []
                        if not pri_acronym in u_perms and any(acr in u_perms for acr in sec_acronyms):
                            secondary_managers.append(u)
                    is_editor_sec_manager = any(u.name == editor_name for u in secondary_managers)
                    if is_editor_sec_manager:
                        editor_role = 'SECONDARY'
                schedule_item.date_editor_role = editor_role
                
                send_due_date_notification(loan, new_date, schedule_item, editor_name)
        if 'cheque_no' in data:
            schedule_item.cheque_no = data['cheque_no']
        if 'splits' in data:
            schedule_item.splits = data['splits']
            
        db.session.commit()
        return jsonify({'success': True, 'message': 'Schedule updated successfully'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/repayment-schedule/<int:schedule_id>/approve-date', methods=['POST'])
def approve_schedule_date(schedule_id):
    try:
        ensure_db_and_tables()
        schedule_item = db.session.get(RepaymentSchedule, schedule_id)
        if not schedule_item:
            return jsonify({'success': False, 'error': 'Schedule item not found'}), 404
            
        schedule_item.date_approval_status = 'APPROVED'
        db.session.commit()
        return jsonify({'success': True, 'message': 'Date approved successfully'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/repayment-schedule/<int:schedule_id>/reject-date', methods=['POST'])
def reject_schedule_date(schedule_id):
    try:
        ensure_db_and_tables()
        schedule_item = db.session.get(RepaymentSchedule, schedule_id)
        if not schedule_item:
            return jsonify({'success': False, 'error': 'Schedule item not found'}), 404
            
        schedule_item.date_approval_status = 'REJECTED'
        db.session.commit()
        return jsonify({'success': True, 'message': 'Date rejected successfully'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/repayment-schedule/<int:schedule_id>', methods=['DELETE'])
def delete_repayment_schedule(schedule_id):
    try:
        ensure_db_and_tables()
        schedule_item = db.session.get(RepaymentSchedule, schedule_id)
        if not schedule_item:
            return jsonify({'error': 'Schedule item not found'}), 404
            
        db.session.delete(schedule_item)
        db.session.commit()
        return jsonify({'success': True, 'message': 'Entry deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

# --- User Management API ---

@app.route('/api/users', methods=['GET'])
def get_users():
    try:
        # Exclude 'E001' which is reserved for system/recovery
        users = User.query.filter(User.employee_code != 'E001').all()
        return jsonify({
            'success': True,
            'users': [{
                'id': u.id,
                'employee_code': u.employee_code,
                'name': u.name,
                'role': u.role,
                'email': u.email,
                'mobile': u.mobile,
                'permissions': json.loads(u.permissions) if u.permissions else [],
                'allowed_menus': json.loads(u.allowed_menus) if u.allowed_menus else [],
                'is_initial_password': u.is_initial_password
            } for u in users]
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

def extract_due_interest(file_path):
    # Read without header
    df = pd.read_excel(file_path, header=None)

    start_row = None
    # Step 1: Find "Amortization Schedule" in column A (index 0)
    for i in range(len(df)):
        val = str(df.iloc[i, 0]).strip().lower()
        if "amortization schedule" in val:
            start_row = i + 1  # next row is table start
            break

    if start_row is None:
        raise Exception("Amortization Schedule not found")

    result = []
    # Step 2: Loop from start_row
    for i in range(start_row, len(df)):
        due_date = df.iloc[i, 1]   # Column B
        interest = df.iloc[i, 5]   # Column F

        # Stop if both empty
        if pd.isna(due_date) and pd.isna(interest):
            break

        # Skip invalid rows
        if pd.isna(due_date) or pd.isna(interest):
            continue

        # Format date
        try:
            # First try parsing with dayfirst=True for Indian formats
            dt = pd.to_datetime(due_date, dayfirst=True, errors='coerce')
            if pd.isna(dt):
                # Fallback to generic parsing
                dt = pd.to_datetime(due_date, errors='coerce')
            
            if pd.isna(dt):
                continue
                
            formatted_date = dt.strftime("%d-%m-%Y")
        except:
            continue

        result.append({
            "date": formatted_date,
            "interest": float(interest)
        })

    return result

@app.route('/api/loans/<int:loan_id>/import-interest', methods=['POST'])
def import_loan_interest(loan_id):
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    try:
        loan = db.session.get(Loan, loan_id)
        if not loan:
            return jsonify({'error': 'Loan not found'}), 404

        file_path = os.path.join(app.config['UPLOAD_FOLDER'], f"temp_interest_{loan_id}_{file.filename}")
        file.save(file_path)
        
        # Extract using the notebook logic
        data = extract_due_interest(file_path)
        
        # PRE-VALIDATE DATES
        unmatched_dates = []
        for entry in data:
            target_date = entry['date']
            existing = RepaymentSchedule.query.filter_by(loan_id=loan_id, date=target_date).first()
            if not existing:
                unmatched_dates.append(target_date)
                
        if unmatched_dates:
            os.remove(file_path)
            return jsonify({
                'success': False,
                'error': f'Due dates do not match please check and upload again.'
            }), 400

        # Process each entry
        updated_count = 0
        
        for entry in data:
            target_date = entry['date']
            target_amount = entry['interest']
            
            # Look for existing schedule entry by date (exact string match in DB)
            existing = RepaymentSchedule.query.filter_by(loan_id=loan_id, date=target_date).first()
            
            if existing:
                existing.interest_amount = target_amount
                updated_count += 1
                
        db.session.commit()
        os.remove(file_path) # Cleanup
        
        return jsonify({
            'success': True, 
            'message': f'Interest schedule imported. Updated Interest: {updated_count}'
        }), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/users', methods=['POST'])
def add_user():
    try:
        data = request.json
        emp_code = str(data.get('employee_code')).upper()
        name = data.get('name')
        email = data.get('email')
        mobile = data.get('mobile')
        if mobile:
            mobile = str(mobile).strip()
        else:
            mobile = None
        password = data.get('password') or 'Admin@123'
        permissions = data.get('permissions', [])
        allowed_menus = data.get('allowed_menus', [])
        role = data.get('role', 'user') # Default to user as requested

        # Check if already exists
        if User.query.filter_by(employee_code=emp_code).first():
            return jsonify({'success': False, 'message': f'User {emp_code} already exists'}), 400

        # Create user
        new_user = User(
            employee_code=emp_code,
            password=generate_password_hash(password),
            name=name,
            email=email,
            mobile=mobile,
            permissions=json.dumps(permissions),
            allowed_menus=json.dumps(allowed_menus),
            role=role,
            is_initial_password=True # Forces setup on first login
        )
        db.session.add(new_user)
        db.session.commit()
        return jsonify({'success': True, 'message': f'User {emp_code} created successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/users/<int:user_id>', methods=['PATCH'])
def update_user(user_id):
    try:
        data = request.json
        user = db.session.get(User, user_id)
        if not user:
            return jsonify({'success': False, 'message': 'User not found'}), 404
        
        # Don't allow renaming admin code or E001
        if user.employee_code in ['admin', 'E001'] and 'employee_code' in data:
            return jsonify({'success': False, 'message': 'Cannot modify system codes'}), 403

        if 'name' in data:
            user.name = data['name']
        if 'role' in data:
            user.role = data['role']
        if 'email' in data:
            user.email = data['email']
        if 'mobile' in data:
            user.mobile = str(data['mobile']).strip() if data['mobile'] else None
        if 'permissions' in data:
            user.permissions = json.dumps(data['permissions'])
        if 'allowed_menus' in data:
            user.allowed_menus = json.dumps(data['allowed_menus'])
        if 'password' in data and data['password'].strip():
            user.password = generate_password_hash(data['password'].strip())
            user.is_initial_password = True # Force re-setup if admin resets password
            
        db.session.commit()
        return jsonify({'success': True, 'message': 'User updated successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/users/<int:user_id>', methods=['DELETE'])
def delete_user(user_id):
    try:
        user = db.session.get(User, user_id)
        if not user:
            return jsonify({'success': False, 'message': 'User not found'}), 404
        
        # Prevent deleting system accounts
        if user.employee_code in ['admin', 'E001']:
            return jsonify({'success': False, 'message': 'Cannot delete system accounts'}), 403

        db.session.delete(user)
        db.session.commit()
        return jsonify({'success': True, 'message': 'User deleted successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

# --- Authentication & Security Flow ---

def normalize_emp_code(val):
    code = (val or '').strip()
    return 'admin' if code.lower() == 'admin' else code.upper()

@app.route('/api/login/', methods=['POST'])
def login():
    try:
        data = request.json
        emp_code = normalize_emp_code(data.get('employee_code'))
        password = data.get('password')
        
        user = User.query.filter_by(employee_code=emp_code).first()
        if user and check_password_hash(user.password, password):
            return jsonify({
                'success': True,
                'user': {
                    'employee_code': user.employee_code,
                    'name': user.name,
                    'role': user.role,
                    'is_initial_password': user.is_initial_password,
                    'permissions': json.loads(user.permissions) if user.permissions else [],
                    'allowed_menus': json.loads(user.allowed_menus) if user.allowed_menus else []
                }
            })
        return jsonify({'success': False, 'message': 'Invalid employee code or password'}), 401
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/users/initial-setup/', methods=['POST'])
def initial_setup():
    try:
        data = request.json
        emp_code = normalize_emp_code(data.get('employee_code'))
        new_password = data.get('new_password')
        question = data.get('q1')
        answer = data.get('a1')
        
        user = User.query.filter_by(employee_code=emp_code).first()
        if not user:
            return jsonify({'success': False, 'message': 'User not found'}), 404
            
        user.password = generate_password_hash(new_password)
        user.is_initial_password = False
        user.security_question = question
        user.security_answer = generate_password_hash(answer.lower().strip())
        
        db.session.commit()
        return jsonify({'success': True, 'message': 'Setup completed successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/forgot-password/request/', methods=['POST'])
def forgot_password_request():
    try:
        data = request.json
        emp_code = normalize_emp_code(data.get('employee_code'))
        
        user = User.query.filter_by(employee_code=emp_code).first()
        if user and user.security_question:
            return jsonify({'success': True, 'question': user.security_question})
        return jsonify({'success': False, 'message': 'User not found or security questions not set'}), 404
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/forgot-password/reset/', methods=['POST'])
def forgot_password_reset():
    try:
        data = request.json
        emp_code = normalize_emp_code(data.get('employee_code'))
        answer = data.get('answer', '').lower().strip()
        new_password = data.get('new_password')
        
        user = User.query.filter_by(employee_code=emp_code).first()
        if user and user.security_answer and check_password_hash(user.security_answer, answer):
            user.password = generate_password_hash(new_password)
            db.session.commit()
            return jsonify({'success': True, 'message': 'Password reset successful'})
        return jsonify({'success': False, 'message': 'Incorrect answer or user not found'}), 401
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/notifications', methods=['GET'])
def get_notifications():
    try:
        ensure_db_and_tables()
        user_name = request.args.get('user_name')
        if not user_name:
            return jsonify({'success': False, 'error': 'user_name is required'}), 400
            
        # 1. Fetch pending approvals (as before)
        user = User.query.filter_by(name=user_name).first()
        approvals_data = []
        if user:
            if user.role == 'admin':
                loans = Loan.query.filter_by(approval_status='PENDING', is_deleted=False).all()
            else:
                loans = Loan.query.filter_by(verified_by=user_name, approval_status='PENDING', is_deleted=False).all()
                
            for l in loans:
                approvals_data.append({
                    'id': f"approval_{l.id}",
                    'type': 'approval',
                    'title': 'Pending Approval',
                    'message': f"Clearance request for {l.client_account_name} (₹{int(l.loan_amount):,}) requires your approval.",
                    'time': l.requested_at,
                    'link': '/approvals'
                })
        
        # 2. Fetch notifications from Notification table for this user
        notifs = Notification.query.filter_by(user_name=user_name, is_read=False).order_by(Notification.id.desc()).all()
        db_notifications = []
        for n in notifs:
            link = n.link
            if link.startswith('/loans/'):
                link = link.replace('/loans/', '/jl-due-report/')
            db_notifications.append({
                'id': f"db_{n.id}",
                'db_id': n.id,
                'type': 'general',
                'title': n.title,
                'message': n.message,
                'time': n.created_at,
                'link': link
            })
            
        # Combine them
        combined = db_notifications + approvals_data
        
        return jsonify({
            'success': True,
            'notifications': combined,
            'count': len(combined)
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/notifications/<int:notif_id>/read', methods=['POST'])
def mark_notification_read(notif_id):
    try:
        ensure_db_and_tables()
        notif = db.session.get(Notification, notif_id)
        if notif:
            notif.is_read = True
            db.session.commit()
            return jsonify({'success': True}), 200
        return jsonify({'success': False, 'error': 'Notification not found'}), 404
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

def send_whatsapp_group_msg(group_id, message):
    import pywhatkit
    try:
        pywhatkit.sendwhatmsg_to_group_instantly(
            group_id=group_id,
            message=message,
            wait_time=15,
            tab_close=True
        )
        print("Group message sent successfully!")
    except Exception as e:
        print(f"Error sending WhatsApp group message: {e}")

def notify_loan_created(loan_id):
    with app.app_context():
        try:
            loan = db.session.get(Loan, loan_id)
            if loan:
                approver = loan.verified_by or "Approver"
                client = loan.client_account_name or "N/A"
                loan_id_val = loan.loan_ref_id or "N/A"
                requester = loan.requester_name or "N/A"
                
                message = (
                    f"Dear {approver},\n\n"
                    f"A Joint Loan request for {client} ({loan_id_val}) has been created by {requester}.\n\n"
                    f"Kindly review the details and approve the Joint Loan request.\n\n"
                    f"Thank you."
                )
                send_whatsapp_group_msg("KgiAguRqlkj6BFc35kyZfC", message)
        except Exception as e:
            print(f"Error in notify_loan_created: {e}")

def check_loan_approval_after_24h(loan_id):
    with app.app_context():
        try:
            loan = db.session.get(Loan, loan_id)
            if loan and loan.approval_status != 'APPROVED' and not loan.is_deleted:
                approver = loan.verified_by or "Approver"
                client = loan.client_account_name or "N/A"
                loan_id_val = loan.loan_ref_id or "N/A"
                requester = loan.requester_name or "N/A"
                
                message = (
                    f"Dear {approver},\n\n"
                    f"A Joint Loan request for {client} ({loan_id_val}) has been created by {requester}.\n\n"
                    f"Kindly review the details and approve the Joint Loan request.\n\n"
                    f"Thank you.\n\n"
                    f"```Please note that if this loan request is not reviewed or approved within 24 hours, the notification will be automatically forwarded to the management team for further action.```"
                )
                send_whatsapp_group_msg("KgiAguRqlkj6BFc35kyZfC", message)
        except Exception as e:
            print(f"Error in check_loan_approval_after_24h: {e}")

def notify_admin_loan_verified(loan_id, manager_name):
    with app.app_context():
        try:
            loan = db.session.get(Loan, loan_id)
            if loan:
                client = loan.client_account_name or "N/A"
                loan_id_val = loan.loan_ref_id or "N/A"
                
                message = (
                    f"Dear Admin,\n\n"
                    f"A Joint Loan request for {client} ({loan_id_val}) has been verified by {manager_name} and is now pending your final approval.\n\n"
                    f"Kindly review the details and approve the Joint Loan request.\n\n"
                    f"Thank you."
                )
                send_whatsapp_group_msg("KgiAguRqlkj6BFc35kyZfC", message)
        except Exception as e:
            print(f"Error in notify_admin_loan_verified: {e}")

def check_admin_loan_approval_after_24h(loan_id, manager_name):
    with app.app_context():
        try:
            loan = db.session.get(Loan, loan_id)
            if loan and loan.approval_status != 'APPROVED' and not loan.is_deleted:
                client = loan.client_account_name or "N/A"
                loan_id_val = loan.loan_ref_id or "N/A"
                
                message = (
                    f"Dear Admin,\n\n"
                    f"A Joint Loan request for {client} ({loan_id_val}) has been verified by {manager_name} and is now pending your final approval.\n\n"
                    f"Kindly review the details and approve the Joint Loan request.\n\n"
                    f"Thank you.\n\n"
                    f"```Please note that if this loan request is not reviewed or approved within 24 hours, the notification will be automatically forwarded to the management team for further action.```"
                )
                send_whatsapp_group_msg("KgiAguRqlkj6BFc35kyZfC", message)
        except Exception as e:
            print(f"Error in check_admin_loan_approval_after_24h: {e}")

@app.route('/api/short-loans', methods=['GET'])
def get_short_loans():
    try:
        loans = ShortLoan.query.order_by(ShortLoan.id.desc()).all()
        result = []
        for l in loans:
            status = l.status
            if status != 'CLOSED' and l.loan_date:
                try:
                    loan_date_obj = datetime.datetime.strptime(l.loan_date, '%Y-%m-%d').date()
                    today_obj = datetime.date.today()
                    days_recd = max(0, (today_obj - loan_date_obj).days)
                    os_days = days_recd - (l.days or 0)
                    if os_days > 0:
                        status = 'OVERDUE'
                except Exception:
                    pass

            result.append({
                'id': l.id,
                'loan_id': l.loan_id,
                'client_name': l.client_name,
                'loan_amount': l.loan_amount,
                'int_per_day': l.int_per_day,
                'loan_date': l.loan_date,
                'days': l.days,
                'days_received': l.days_received,
                'remarks': l.remarks,
                'status': status,
                'created_by': l.created_by,
                'created_at': l.created_at,
                'follower': l.follower,
                'account': l.account,
                'close_date': l.close_date,
                'renew_history': l.renew_history
            })
        return jsonify({"success": True, "loans": result}), 200
    except Exception as e:
        print(f"Error fetching short loans: {e}")
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/short-loans', methods=['POST'])
def create_short_loan():
    try:
        data = request.json
        
        acronyms = {
            'AS': 'AS',
            'ASQ': 'ASQ',
            'JC': 'JC',
            'NEXUS': 'NXS',
            'RE': 'RE',
            'SCS': 'SCS',
            'SENTHIL VADIVEL': 'SV',
            'SN': 'SN'
        }
        
        explicit_loan_id = data.get('loan_id')
        if explicit_loan_id and str(explicit_loan_id).strip():
            generated_loan_id = str(explicit_loan_id).strip()
        else:
            acc_name = data.get('account')
            prefix = 'SL'
            if acc_name:
                acc_name_clean = str(acc_name).upper().strip()
                if acc_name_clean in acronyms:
                    prefix = acronyms[acc_name_clean]
                else:
                    clean_chars = re.sub(r'[^A-Z]', '', acc_name_clean)
                    prefix = clean_chars[:4] if clean_chars else 'SL'

            loan_date = data.get('loan_date')
            year_val = ""
            if loan_date:
                if '-' in loan_date:
                    parts = loan_date.split('-')
                    if len(parts[0]) == 4:
                        year_val = parts[0][-2:]
                    elif len(parts[-1]) == 4:
                        year_val = parts[-1][-2:]
            if not year_val:
                year_val = str(datetime.datetime.now().year)[-2:]

            pattern = f"SL{prefix}{year_val}%"
            last_loan = ShortLoan.query.filter(ShortLoan.loan_id.like(pattern)).order_by(ShortLoan.loan_id.desc()).first()
            if last_loan and last_loan.loan_id:
                try:
                    seq = int(last_loan.loan_id[-4:])
                    next_seq = seq + 1
                except Exception:
                    next_seq = 1
            else:
                next_seq = 1

            generated_loan_id = f"SL{prefix}{year_val}{next_seq:04d}"

        new_loan = ShortLoan(
            loan_id=generated_loan_id,
            client_name=data.get('client_name'),
            loan_amount=float(data.get('loan_amount', 0)),
            int_per_day=float(data.get('int_per_day', 0)),
            loan_date=data.get('loan_date'),
            days=int(data.get('days', 0)),
            days_received=int(data.get('days_received', 0) if data.get('days_received') else 0),
            remarks=data.get('remarks'),
            created_by=data.get('created_by'),
            created_at=datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            follower=data.get('follower'),
            account=data.get('account'),
            close_date=data.get('close_date'),
            renew_history=data.get('renew_history')
        )
        db.session.add(new_loan)
        db.session.commit()
        return jsonify({"success": True, "message": "Short loan created"}), 201
    except Exception as e:
        db.session.rollback()
        print(f"Error creating short loan: {e}")
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/short-loans/<int:loan_id>', methods=['PUT'])
def update_short_loan(loan_id):
    try:
        loan = db.session.get(ShortLoan, loan_id)
        if not loan:
            return jsonify({"success": False, "message": "Loan not found"}), 404
            
        data = request.json
        if 'client_name' in data:
            loan.client_name = data['client_name']
        if 'loan_amount' in data:
            loan.loan_amount = float(data['loan_amount'] or 0)
        if 'int_per_day' in data:
            loan.int_per_day = float(data['int_per_day'] or 0)
        if 'loan_date' in data:
            loan.loan_date = data['loan_date']
        if 'days' in data:
            loan.days = int(data['days'] or 0)
        if 'days_received' in data:
            loan.days_received = int(data['days_received'] if data.get('days_received') else 0)
        if 'remarks' in data:
            loan.remarks = data['remarks']
        if 'status' in data:
            loan.status = data['status']
        if 'follower' in data:
            loan.follower = data['follower']
        if 'account' in data:
            loan.account = data['account']
        if 'close_date' in data:
            loan.close_date = data['close_date']
        if 'renew_history' in data:
            loan.renew_history = data['renew_history']
            
        db.session.commit()
        return jsonify({"success": True, "message": "Short loan updated successfully"}), 200
    except Exception as e:
        db.session.rollback()
        print(f"Error updating short loan: {e}")
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/short-loans/<int:loan_id>', methods=['DELETE'])
def delete_short_loan(loan_id):
    try:
        loan = db.session.get(ShortLoan, loan_id)
        if not loan:
            return jsonify({"success": False, "message": "Loan not found"}), 404
            
        db.session.delete(loan)
        db.session.commit()
        return jsonify({"success": True, "message": "Short loan deleted successfully"}), 200
    except Exception as e:
        db.session.rollback()
        print(f"Error deleting short loan: {e}")
        return jsonify({"success": False, "message": str(e)}), 500

if __name__ == '__main__':
    # Use self-signed certs for local development
    base_dir = os.path.dirname(os.path.abspath(__file__))
    cert_path = os.path.join(base_dir, 'cert.pem')
    key_path = os.path.join(base_dir, 'key.pem')
    if os.path.exists(cert_path) and os.path.exists(key_path):
        app.run(debug=True, host='0.0.0.0', port=1000, ssl_context=(cert_path, key_path))
    else:
        app.run(debug=True, host='0.0.0.0', port=1000)
