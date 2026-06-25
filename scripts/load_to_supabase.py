"""
load_to_supabase.py
-------------------
Applies sql/schema.sql and bulk-loads the import_files/*.csv into
public.test_records using a fast server-side COPY.

The database connection string is read from the environment variable
SUPABASE_DB_URL -- it is NEVER written to a file or printed, so no secret
ends up in the repo.

Usage (PowerShell):
    $env:SUPABASE_DB_URL = "postgresql://postgres:...@...supabase.com:5432/postgres"
    python scripts/load_to_supabase.py
"""

import os
import sys
import psycopg2

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCHEMA = os.path.join(ROOT, "sql", "schema.sql")
IMPORT_DIR = os.path.join(ROOT, "import_files")

# (filename, expected row count) -- expected counts are just a sanity check
FILES = [
    ("import_FLY.csv", 4712),
    ("import_Boat.csv", 121797),
    ("import_Hand_Held.csv", 390935),
]

COPY_COLUMNS = ("source, record_date, product_model, station, result, "
                "bursts, power_dbm, burst_amps, standby_amps, details")


def main():
    dsn = os.environ.get("SUPABASE_DB_URL")
    if not dsn:
        sys.exit("ERROR: set SUPABASE_DB_URL environment variable first.")

    conn = psycopg2.connect(dsn)
    conn.autocommit = False
    cur = conn.cursor()

    # 1) schema
    print("Applying schema.sql ...")
    with open(SCHEMA, "r", encoding="utf-8") as fh:
        cur.execute(fh.read())
    conn.commit()
    print("  schema applied.")

    # 2) start clean so re-runs don't duplicate
    print("Truncating public.test_records ...")
    cur.execute("truncate public.test_records restart identity;")
    conn.commit()

    # 3) bulk load each file
    for fname, expected in FILES:
        path = os.path.join(IMPORT_DIR, fname)
        print(f"Loading {fname} (expected ~{expected:,}) ...")
        sql = (f"COPY public.test_records ({COPY_COLUMNS}) "
               f"FROM STDIN WITH (FORMAT csv, HEADER true)")
        with open(path, "r", encoding="utf-8") as fh:
            cur.copy_expert(sql, fh)
        conn.commit()
        print(f"  done: {fname}")

    # 4) verify
    print("\nVerification (source / total / fails):")
    cur.execute("""
        select source, count(*) total,
               count(*) filter (where result = 'Fail') fails
        from public.test_records group by source order by source;
    """)
    grand = 0
    for source, total, fails in cur.fetchall():
        grand += total
        print(f"  {source:10s}  total={total:>7,}  fails={fails:>7,}")
    print(f"  {'TOTAL':10s}  total={grand:>7,}")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
