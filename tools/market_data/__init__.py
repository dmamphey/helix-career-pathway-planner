"""Helix market-data enrichment pipeline.

Runs outside the user's browser, reads approved official sources, and publishes one
static file the application can load: data/helix_market_data_uk_v1.json.

    python tools/market_data/enrich.py --help
"""
