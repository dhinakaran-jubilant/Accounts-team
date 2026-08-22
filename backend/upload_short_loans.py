import pandas as pd
from app import app, db
from models import ShortLoan
import re
from datetime import datetime
import json

def import_data():
    with app.app_context():
        df = pd.read_excel('D:/Projects/AccountsTeam/ShortLoan.xlsx')
        count = 0
        for index, row in df.iterrows():
            client_name = str(row['Party Name'])
            loan_amount = float(row['Loan']) if pd.notna(row['Loan']) else 0.0
            
            int_per_day_str = str(row['P.D.Int'])
            int_match = re.search(r'\d+(\.\d+)?', int_per_day_str)
            int_per_day = float(int_match.group()) if int_match else 0.0
            
            loan_date = row['Date'].strftime('%Y-%m-%d') if pd.notna(row['Date']) else ''
            days = int(row['Days']) if pd.notna(row['Days']) else 0
            follower = str(row['Followers']) if pd.notna(row['Followers']) else None
            account = str(row['Acc']) if pd.notna(row['Acc']) else None
            
            # Check if loan already exists to avoid duplicates
            existing = ShortLoan.query.filter_by(client_name=client_name, loan_date=loan_date, loan_amount=loan_amount, follower=follower,account=account).first()
            
            if not existing:
                acronyms = {
                    'AS': 'AS', 'ASE': 'ASE', 'ASQ': 'ASQ',
                    'JC': 'JC', 'NAN': 'NAN', 'NEXUS': 'NEX', 'RE': 'RE',
                    'SCE': 'SCS', 'SCS': 'SCS', 'SENTHIL': 'SV', 'SN': 'SN'
                }
                
                prefix = 'SL'
                if account:
                    acc_name_clean = str(account).upper().strip()
                    if acc_name_clean in acronyms:
                        prefix = acronyms[acc_name_clean]
                    else:
                        clean_chars = re.sub(r'[^A-Z]', '', acc_name_clean)
                        prefix = clean_chars[:4] if clean_chars else 'SL'

                year_val = ""
                if loan_date:
                    if '-' in loan_date:
                        parts = loan_date.split('-')
                        if len(parts[0]) == 4:
                            year_val = parts[0][-2:]
                        elif len(parts[-1]) == 4:
                            year_val = parts[-1][-2:]
                if not year_val:
                    year_val = str(datetime.now().year)[-2:]

                pattern = f"SL{prefix}{year_val}%"
                last_loan = ShortLoan.query.filter(ShortLoan.loan_id.like(pattern)).order_by(ShortLoan.loan_id.desc()).first()
                if last_loan and last_loan.loan_id:
                    try:
                        seq = int(last_loan.loan_id[-3:])
                        next_seq = seq + 1
                    except Exception:
                        next_seq = 1
                else:
                    next_seq = 1

                generated_loan_id = f"SL{prefix}{year_val}{next_seq:03d}"

                creation_timestamp = datetime.now().strftime('%d %b %Y, %I:%M %p').replace('AM', 'am').replace('PM', 'pm')
                formatted_amount = "{:,.0f}".format(loan_amount)
                formatted_int = "{:,.0f}".format(int_per_day) if int_per_day.is_integer() else "{:,.2f}".format(int_per_day).rstrip('0').rstrip('.')
                history_log = f"Loan Created with Principal ₹ {formatted_amount}, Int/Day ₹ {formatted_int}, Tenure {days} days | {creation_timestamp}"

                new_loan = ShortLoan(
                    loan_id=generated_loan_id,
                    client_name=client_name,
                    loan_amount=loan_amount,
                    int_per_day=int_per_day,
                    loan_date=loan_date,
                    days=days,
                    days_received=0,
                    status='ACTIVE',
                    created_by='system',
                    created_at=datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                    follower=follower,
                    account=account,
                    renew_history=json.dumps([history_log])
                )
                db.session.add(new_loan)
                count += 1
            else:
                print(f"Skipping existing loan")
                
        db.session.commit()
        print(f"Successfully imported {count} new ShortLoans")

if __name__ == '__main__':
    import_data()
