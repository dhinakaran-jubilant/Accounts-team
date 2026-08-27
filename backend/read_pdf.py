import pdfplumber
import pandas as pd
import re
import os

try:
    import pytesseract
    # Configure Tesseract path for Windows
    TESS_PATH = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    if os.path.exists(TESS_PATH):
        pytesseract.pytesseract.tesseract_cmd = TESS_PATH
    TESSERACT_AVAILABLE = os.path.exists(TESS_PATH)
except ImportError:
    TESSERACT_AVAILABLE = False

def extract_pdf_data(pdf_path):
    output = {
        "loan_number": None,
        "primary_account": None,
        "client_account": None,
        "loan_date": None,
        "loan_amount": None,
        "total_repayment": None,
        "table": []
    }

    with pdfplumber.open(pdf_path) as pdf:
        first_page = pdf.pages[0]
        text = first_page.extract_text() or ""
        
        # Check if PDF is an image/scanned document and run OCR if available
        is_scanned = not text.strip()
        if is_scanned:
            if TESSERACT_AVAILABLE:
                try:
                    img = first_page.to_image(resolution=300).original
                    text = pytesseract.image_to_string(img)
                except Exception:
                    pass
            if not text.strip():
                raise ValueError("The uploaded PDF appears to be a scanned image and no text could be extracted. Please upload a text-searchable PDF.")

        # 1. Loan Number
        loan_match = re.search(r"Loan Number\s+([$A-Z0-9]+)", text)
        if loan_match:
            output["loan_number"] = loan_match.group(1).replace('$', 'S')

        # 2. Branch (Primary Account Name)
        branch_match = re.search(r"Branch\s+(.+?)\s+Customer", text, re.S)
        if branch_match:
            raw = branch_match.group(1).strip()
            raw = re.sub(r"\s+", " ", raw)
            output["primary_account"] = raw.upper()

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
        if not is_scanned:
            for page in pdf.pages:
                tables = page.extract_tables()
                for table in tables:
                    df = pd.DataFrame(table)
                    header_index = None
                    for i, row in df.iterrows():
                        row_clean = [re.sub(r'\s+', ' ', str(x)).strip().lower() for x in row if pd.notna(x) and str(x).strip()]
                        row_text = " ".join(row_clean)
                        if "loan date" in row_text and "loan amount" in row_text:
                            header_index = i
                            break
                    
                    if header_index is not None:
                        df.columns = df.iloc[header_index]
                        df = df[header_index + 1:].reset_index(drop=True)
                        
                        def clean_col(c, idx):
                            base = re.sub(r'\s+', ' ', str(c)).strip().lower()
                            return base if base and base != 'none' else f"col_{idx}"
                        
                        df.columns = [clean_col(col, idx) for idx, col in enumerate(df.columns)]

                        if not df.empty:
                            row = df.iloc[0]
                            loan_date_col = next((c for c in df.columns if "loan date" in c), None)
                            loan_amt_col = next((c for c in df.columns if "loan amount" in c), None)
                            total_amt_col = next((c for c in df.columns if "total amount" in c), None)

                            if loan_date_col and loan_amt_col:
                                try:
                                    val_date = row.get(loan_date_col)
                                    val_date = val_date.iloc[0] if isinstance(val_date, pd.Series) else val_date
                                    output["loan_date"] = str(val_date).strip()
                                    
                                    val_amt = row.get(loan_amt_col)
                                    val_amt = val_amt.iloc[0] if isinstance(val_amt, pd.Series) else val_amt
                                    amt_str = str(val_amt).replace(",", "").strip()
                                    output["loan_amount"] = float(amt_str) if amt_str and amt_str != 'None' else None
                                    
                                    if total_amt_col:
                                        val_tot = row.get(total_amt_col)
                                        val_tot = val_tot.iloc[0] if isinstance(val_tot, pd.Series) else val_tot
                                        tot_str = str(val_tot).replace(",", "").strip()
                                        output["total_repayment"] = float(tot_str) if tot_str and tot_str != 'None' else None
                                except (ValueError, TypeError, AttributeError):
                                    pass
                            break
                if output["loan_amount"] is not None:
                    break
                
        # 4b. Fallback Agreement Extraction using text regex (essential for OCR/Scanned PDFs)
        if output["loan_amount"] is None:
            for page in pdf.pages:
                page_text = page.extract_text() or ""
                if not page_text.strip() and TESSERACT_AVAILABLE:
                    try:
                        img = page.to_image(resolution=300).original
                        page_text = pytesseract.image_to_string(img)
                    except Exception:
                        pass
                        
                if page_text:
                    # Match pattern: Date, EMI, Principal, Loan Amount, Total Amount
                    match = re.search(r'(\d{2}[-/]\d{2}[-/]\d{4})\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)', page_text)
                    if match:
                        output["loan_date"] = match.group(1)
                        output["loan_amount"] = float(match.group(4).replace(",", ""))
                        output["total_repayment"] = float(match.group(5).replace(",", ""))
                        break

        # 5. Amortization Schedule
        schedule = []
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            is_page_scanned = not page_text.strip()
            
            if is_page_scanned and TESSERACT_AVAILABLE:
                try:
                    img = page.to_image(resolution=300).original
                    page_text = pytesseract.image_to_string(img)
                except Exception:
                    pass

            if not is_page_scanned:
                tables = page.extract_tables()
                for table in tables:
                    df = pd.DataFrame(table)
                    header_index = None
                    for i, row in df.iterrows():
                        row_text = " ".join([str(x) for x in row if pd.notna(x)]).lower()
                        if "due" in row_text and "emi" in row_text and "interest" in row_text:
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
                                emi = float(str(emi).replace(",", "").strip()) if emi and emi != 'None' else None
                                interest = row.get("Interest")
                                interest = float(str(interest).replace(",", "").strip()) if interest and interest != 'None' else None

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
            else:
                # If it's scanned (OCR), extract_tables() won't work, so we fallback to Regex for Schedule rows
                if "Amortization" in page_text or "Due Date" in page_text or "EMI" in page_text or "Due" in page_text:
                    # Isolate text after 'Amortization' to prevent matching Agreement Details rows
                    schedule_text = page_text
                    if "Amortization" in page_text:
                        schedule_text = page_text.split("Amortization", 1)[1]
                    elif "Due Date" in page_text:
                        schedule_text = page_text.split("Due Date", 1)[1]
                        
                    matches = re.findall(r'(?:\d+\s+)?(\d{2}[-/]\d{2}[-/]\d{4})\s+[\d,]+\.?\d*\s+([\d,]+\.?\d*)\s+[\d,]+\.?\d*\s+([\d,]+\.?\d*)', schedule_text)
                    for match in matches:
                        schedule.append({
                            "date": match[0],
                            "amount": float(match[1].replace(",", "")),
                            "interest_amount": float(match[2].replace(",", "")),
                            "cheque_no": "",
                            "received_date": None,
                            "payment_date": None
                        })

        output["table"] = schedule
        
    return output
