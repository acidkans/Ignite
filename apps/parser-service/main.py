from fastapi import FastAPI, UploadFile, File, Form, HTTPException
import fitz  # PyMuPDF
import pdfplumber
import io
import logging

app = FastAPI()
logger = logging.getLogger("uvicorn")

@app.post("/parse")
async def parse_pdf(
    file: UploadFile = File(...),
    mode: str = Form("text")  # 'text' or 'table'
):
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="File must be a PDF")
    
    content = await file.read()
    
    try:
        text_output = ""
        
        if mode == "text":
            # PyMuPDF (fitz) - Fast and accurate for text
            with fitz.open(stream=content, filetype="pdf") as doc:
                for page in doc:
                    text_output += page.get_text() + "\n"
                    
        elif mode == "table":
            # Użyj PyMuPDF (fitz) do tekstu — wyższa jakość niż pdfplumber
            # Użyj pdfplumber TYLKO do tabel — bez duplikowania tekstu
            fitz_pages = {}
            with fitz.open(stream=content, filetype="pdf") as doc:
                for page_num, page in enumerate(doc):
                    fitz_pages[page_num] = page.get_text()

            with pdfplumber.open(io.BytesIO(content)) as pdf:
                for page_num, page in enumerate(pdf.pages):
                    # Tekst z PyMuPDF (lepsza jakość)
                    page_text = fitz_pages.get(page_num, "")
                    if page_text.strip():
                        text_output += page_text + "\n"

                    # Tabele z pdfplumber — tylko jeśli istnieją, bez duplikowania tekstu
                    tables = page.extract_tables()
                    for table in tables:
                        if not table:
                            continue
                        # Pierwsza niepusta kolumna jako nagłówki
                        headers = [str(cell).strip() if cell else f"Col{i}" for i, cell in enumerate(table[0])]
                        if not any(headers):
                            continue
                        text_output += f"[TABLE_HEADERS] {' | '.join(headers)}\n"
                        for row_idx, row in enumerate(table[1:], start=1):
                            cells = []
                            for col_idx, cell in enumerate(row):
                                col_name = headers[col_idx] if col_idx < len(headers) else f"Col{col_idx}"
                                cell_val = str(cell).strip() if cell else ""
                                if cell_val:
                                    cells.append(f"{col_name}: {cell_val}")
                            if cells:
                                text_output += f"[WIERSZ {row_idx}] {' | '.join(cells)}\n"
                        text_output += "\n"
        else:
             raise HTTPException(status_code=400, detail="Invalid mode. Use 'text' or 'table'")

        return {"text": text_output.strip(), "filename": file.filename}

    except Exception as e:
        logger.error(f"Error parsing PDF: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error parsing PDF: {str(e)}")

@app.get("/health")
def health_check():
    return {"status": "ok"}
