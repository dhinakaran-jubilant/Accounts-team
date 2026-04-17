import pdfplumber
import pandas as pd
import re

def extract_pdf_data(pdf_path):
    output = {
        "loan_number": None,
        "primary_account": None,
        "client_account": None,
        "loan_date": None,
        "loan_amount": None,
        "total_repayment": None, # total_amount in PDF
        "table": [] # schedule in PDF
    }

    with pdfplumber.open(pdf_path) as pdf:
        first_page = pdf.pages[0]
        text = first_page.extract_text()

        # 1. Loan Number
        loan_match = re.search(r"Loan Number\s+([A-Z0-9]+)", text)
        if loan_match:
            output["loan_number"] = loan_match.group(1)

        # 2. Branch (Primary Account Name)
        branch_match = re.search(r"Branch\s+(.+?)\s+Customer", text, re.S)
        if branch_match:
            output["primary_account"] = str(branch_match.group(1).strip()).upper()

        # 3. Customer Name
        cust_block = re.search(r"Customer Details\s*\n\s*([^\n]+)", text, re.S)
        if cust_block:
            output["client_account"] = (
                str(cust_block.group(1))
                .replace("No Image", "")
                .replace("S/o", "")
                .replace("S/O", "")
                .strip()
            )

        # 4. Agreement Table Extraction
        for page in pdf.pages:
            tables = page.extract_tables()
            for table in tables:
                df = pd.DataFrame(table)
                header_index = None
                for i, row in df.iterrows():
                    row_text = " ".join([str(x) for x in row if x])
                    if "Loan Date" in row_text and "Loan Amount" in row_text:
                        header_index = i
                        break
                
                if header_index is not None:
                    df.columns = df.iloc[header_index]
                    df = df[header_index + 1:].reset_index(drop=True)
                    df.columns = [str(col).strip().replace("\n", " ") for col in df.columns]

                    if not df.empty:
                        row = df.iloc[0]
                        output["loan_date"] = row.get("Loan Date")
                        output["loan_amount"] = float(row.get("Loan Amount"))
                        output["total_repayment"] = float(row.get("Total Amount"))
                        break

        # 5. Amortization Schedule
        start_extracting = False
        schedule = []
        for page in pdf.pages:
            text = page.extract_text()
            if "Amortization Schedule" in text:
                start_extracting = True
            if not start_extracting:
                continue
            
            tables = page.extract_tables()
            for table in tables:
                df = pd.DataFrame(table)
                header_index = None
                for i, row in df.iterrows():
                    row_text = " ".join([str(x) for x in row if x])
                    if "Due" in row_text and "EMI" in row_text and "Interest" in row_text:
                        header_index = i
                        break
                
                if header_index is not None:
                    df.columns = df.iloc[header_index]
                    df = df[header_index + 1:].reset_index(drop=True)
                    df.columns = [str(col).strip().replace("\n", " ") for col in df.columns]

                    if df.empty: continue

                    for _, row in df.iterrows():
                        try:
                            raw_date = str(row.get("Due Date") or row.get("Due") or "")
                            due_date = re.sub(r"\s+", "", raw_date)
                            emi = row.get("EMI")
                            emi = float(str(emi).replace(",", "").strip()) if emi else None
                            interest = row.get("Interest")
                            interest = float(str(interest).replace(",", "").strip()) if interest else None

                            if not due_date or emi is None:
                                continue

                            schedule.append({
                                "date": due_date,
                                "amount": emi,
                                "interest_amount": interest,
                                "cheque_no": "",
                                "received_date": None,
                                "payment_date": None
                            })
                        except:
                            continue

        # Remove duplicates and sort by date if needed
        unique_schedule = list({r["date"]: r for r in schedule}.values())
        output["table"] = unique_schedule

    return output
