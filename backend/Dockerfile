FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    tesseract-ocr \
    tesseract-ocr-kor \
    poppler-utils \
    nodejs npm \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir --no-deps "scrapling[fetchers]>=0.4.2" \
    && pip install --no-cache-dir cssselect orjson tld w3lib curl_cffi msgspec browserforge apify-fingerprint-datapoints "lxml>=6.0.2" \
    && python -m patchright install chromium --with-deps \
    && crawl4ai-setup \
    && scrapling install

# Copy application code
COPY . .

# Expose port
EXPOSE 8000

# Run with uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
