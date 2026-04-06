import pandas as pd

def extract_tables(file_path):
    df = pd.read_excel(file_path, header=None)

    # Vectorized string conversion for blazing fast searches
    df_str = df.astype(str)
    
    # Pre-compute masks to avoid row-by-row iteration
    header_mask = df_str.apply(lambda c: c.str.contains("Transaction Date", case=False, na=False)).any(axis=1)
    
    # For constraints that only check the first 5 columns
    df_str_5 = df_str.iloc[:, :5]
    ob_mask = df_str_5.apply(lambda c: c.str.contains("Opening Balance", case=False, na=False)).any(axis=1)
    msg_mask = df_str_5.apply(lambda c: c.str.contains("IMPORTANT MESSAGE", case=False, na=False)).any(axis=1)
    
    header_indices = df[header_mask].index.tolist()
    ob_indices = set(df[ob_mask].index.tolist())
    msg_indices = df[msg_mask].index.tolist()
    
    # Table ends entirely if an important message is encountered
    end_idx = msg_indices[0] if msg_indices else len(df)
    
    all_tables = []
    first_table = True
    
    for idx_pos, h_idx in enumerate(header_indices):
        if h_idx >= end_idx:
            break
            
        header = [str(col).strip() if pd.notna(col) else "" for col in df.iloc[h_idx]]
        start_data = h_idx + 1
        
        # Chunk spans up to the next header or the absolute end_idx
        next_h = header_indices[idx_pos + 1] if idx_pos + 1 < len(header_indices) else len(df)
        end_data = min(next_h, end_idx)
        
        chunk_end = end_data
        for i in range(start_data, end_data):
            if i in ob_indices:
                if first_table and i == start_data:
                    # ✅ Include ONLY first row of FIRST table
                    pass 
                else:
                    chunk_end = i
                    break
                    
        table_df = df.iloc[start_data:chunk_end].copy()
        table_df.columns = header
        table_df = table_df.dropna(how='all')
        
        if not table_df.empty:
            all_tables.append(table_df)
            
        first_table = False
        
    final_df = pd.concat(all_tables, ignore_index=True) if all_tables else pd.DataFrame()
    
    if not final_df.empty:
        final_df = final_df.iloc[1:].reset_index(drop=True)
        expected_cols = ["Transaction Date", "Value Date", "Description", "Cheque No", "Debit", "Credit", "Balance"]
        # Normalize columns
        final_df.columns = [str(col).strip() for col in final_df.columns]
        final_df.rename(columns={'Particulars': 'Description'}, inplace=True)
        
        # Keep only existing expected columns
        applicable_cols = [c for c in expected_cols if c in final_df.columns]
        final_df = final_df[applicable_cols]
        
    return final_df
