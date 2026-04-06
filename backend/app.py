from models import db, Loan, RemainingAccount, RepaymentSchedule
from read_word import extract_word_data, build_final_output
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from google.oauth2.service_account import Credentials
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import preprocess_idfc
import pandas as pd
import threading
import datetime
import psycopg2
import gspread
import json
import os
import re

app = Flask(__name__, static_folder='../frontend/dist', static_url_path='')
CORS(app)

# Database Configuration (PostgreSQL)
# Assuming default postgres user and localhost since only password was specified
app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://postgres:1234@localhost:5432/accounts_db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)

with app.app_context():
    try:
        db.create_all()
        print("Connected to PostgreSQL and verified tables.")
    except Exception as e:
        print(f"PostgreSQL connection warning: {e}")


UPLOAD_FOLDER = 'uploads'
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

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

# Serve React frontend
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    if path and os.path.exists(os.path.join(app.static_folder, path)):
        return app.send_static_file(path)
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
        except Exception as e:
            print(f"Table creation error: {e}")

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
        loan_ref_id = request.form.get('loan_ref_id', '').strip()[:11] or None
        
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], file.filename)
        file.save(file_path)
        
        # Parse actual Document text inside read_word
        extracted_data = extract_word_data(file_path)
        final_output = build_final_output(extracted_data, remaining_accounts)
        
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
            total_interest=final_output['total_interest']
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
        return jsonify({'success': True, 'loan_id': loan.id, 'message': 'Data inserted correctly into PostgreSQL!'}), 200
        
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
                'splits': s.splits
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
        if not loan or loan.is_deleted:
            return jsonify({'error': 'Loan not found'}), 404

        total_i = loan.primary_account_interest + sum(a.interest_amount for a in loan.remaining_accounts)
        remaining = [
            {
                'id': acc.id,
                'account_name': acc.account_name,
                'share': acc.share,
                'interest_amount': acc.interest_amount,
                'percentage': acc.percentage,
                'interest_percentage': (acc.interest_amount / total_i * 100) if total_i > 0 else 0,
                'tds': acc.tds,
            }
            for acc in loan.remaining_accounts
        ]

        schedule = [
            {
                'id': s.id,
                'date': s.date,
                'cheque_no': s.cheque_no,
                'amount': s.amount,
                'received_date': s.received_date,
                'payment_date': s.payment_date,
                'remarks': s.remarks,
                'type': s.type,
                'splits': s.splits
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
            
            # Update Google Sheet in the background to avoid blocking the file download
            threading.Thread(
                target=update_google_sheet, 
                args=(user_name, bank_file.filename, cloud_file.filename, total_entries, sw_categorized, remaining)
            ).start()
            
            return send_file(output_file, as_attachment=True)
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    return jsonify({'error': 'Unknown error'}), 500

@app.route('/api/loans/<int:loan_id>/accounts', methods=['PATCH'])
def update_loan_accounts(loan_id):
    try:
        ensure_db_and_tables()
        loan = db.session.get(Loan, loan_id)
        if not loan:
            return jsonify({'error': 'Loan not found'}), 404
            
        data = request.json

        if 'loan_ref_id' in data:
            loan.loan_ref_id = (data['loan_ref_id'] or '').strip()[:11] or None

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

@app.route('/api/loans/<int:loan_id>/repayment-schedule', methods=['POST'])
def add_repayment_schedule(loan_id):
    try:
        ensure_db_and_tables()
        data = request.json
        
        new_entry = RepaymentSchedule(
            loan_id=loan_id,
            amount=float(data.get('amount', 0)),
            date=data.get('date', ''),
            cheque_no=data.get('cheque_no', ''),
            remarks=data.get('remarks', ''),
            type=data.get('type', 'others'),
            received_date=data.get('received_date'),
            payment_date=data.get('payment_date'),
            splits=data.get('splits')
        )
        
        db.session.add(new_entry)
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
        if 'received_date' in data:
            schedule_item.received_date = data['received_date']
        if 'payment_date' in data:
            schedule_item.payment_date = data['payment_date']
        if 'remarks' in data:
            schedule_item.remarks = data['remarks']
        if 'amount' in data:
            schedule_item.amount = float(data['amount'])
        if 'date' in data:
            schedule_item.date = data['date']
        if 'cheque_no' in data:
            schedule_item.cheque_no = data['cheque_no']
        if 'splits' in data:
            schedule_item.splits = data['splits']
            
        db.session.commit()
        return jsonify({'success': True, 'message': 'Schedule updated successfully'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

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

if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=1000)
