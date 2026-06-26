"""
load_to_supabase.py
-------------------
Ensures the schema exists and loads import_files/*.csv into
public.test_records using a fast server-side COPY.

APPEND BY DEFAULT (so you never wipe data that's already loaded):
    py scripts/load_to_supabase.py import_NewSheet.csv     # add one new file
    py scripts/load_to_supabase.py a.csv b.csv             # add several
Full rebuild from the original three CSVs (truncates first):
    py scripts/load_to_supabase.py --replace

The database connection string is read from the environment variable
SUPABASE_DB_URL (or a local Postgres URL when self-hosting) -- it is NEVER
written to a file or printed, so no secret ends up in the repo.

Usage (PowerShell):
    $env:SUPABASE_DB_URL = "postgresql://postgres:...@host:5432/postgres"
    py scripts/load_to_supabase.py import_NewSheet.csv
"""

import os
import sys
import argparse
import psycopg2

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCHEMA = os.path.join(ROOT, "sql", "schema.sql")
IMPORT_DIR = os.path.join(ROOT, "import_files")

# The original three CSVs, used only for a --replace full rebuild.
DEFAULT_FILES = ["import_FLY.csv", "import_Boat.csv", "import_Hand_Held.csv"]

COPY_COLUMNS = ("source, record_date, product_model, station, result, "
                "bursts, power_dbm, burst_amps, standby_amps, details")


def resolve(path):
    """Accept a bare filename (looked up in import_files/) or a real path."""
    if os.path.isfile(path):
        return path
    candidate = os.path.join(IMPORT_DIR, path)
    if os.path.isfile(candidate):
        return candidate
    sys.exit(f"ERROR: file not found: {path}")


def main():
    ap = argparse.ArgumentParser(
        description="Load CSV(s) into public.test_records. Appends by default; "
                    "use --replace for a full rebuild.")
    ap.add_argument("files", nargs="*",
                    help="CSV file(s) to load (a filename in import_files/ or a path).")
    ap.add_argument("--replace", action="store_true",
                    help="Truncate the table first, then load (full rebuild). "
                         "WITHOUT this flag, rows are APPENDED.")
    args = ap.parse_args()

    dsn = os.environ.get("SUPABASE_DB_URL")
    if not dsn:
        sys.exit("ERROR: set SUPABASE_DB_URL environment variable first.")

    # Decide what to load.
    if args.files:
        files = [resolve(f) for f in args.files]
    elif args.replace:
        files = [resolve(f) for f in DEFAULT_FILES]
    else:
        sys.exit(
            "Nothing to load. Append mode needs you to name the CSV(s) to add, e.g.\n"
            "    py scripts/load_to_supabase.py import_NewSheet.csv\n"
            "Or rebuild the whole table from the original three CSVs:\n"
            "    py scripts/load_to_supabase.py --replace")

    conn = psycopg2.connect(dsn)
    conn.autocommit = False
    cur = conn.cursor()

    # 1) Schema -- safe/idempotent (IF NOT EXISTS + create-or-replace). Never drops data.
    print("Ensuring schema (schema.sql) ...")
    with open(SCHEMA, "r", encoding="utf-8") as fh:
        cur.execute(fh.read())
    conn.commit()

    # 2) Replace vs append
    if args.replace:
        print("--replace: truncating public.test_records ...")
        cur.execute("truncate public.test_records restart identity;")
        conn.commit()
    else:
        cur.execute("select count(*) from public.test_records;")
        before = cur.fetchone()[0]
        print(f"Appending to public.test_records ({before:,} rows already present) ...")
        print("  (each file is added once; loading the same file twice would duplicate it.)")

    # 3) Load each file (COPY appends)
    for path in files:
        name = os.path.basename(path)
        print(f"Loading {name} ...")
        sql = (f"COPY public.test_records ({COPY_COLUMNS}) "
               f"FROM STDIN WITH (FORMAT csv, HEADER true)")
        with open(path, "r", encoding="utf-8") as fh:
            cur.copy_expert(sql, fh)
        conn.commit()
        print(f"  done: {name}")

    # 4) Verify totals
    print("\nVerification (source / total / fails):")
    cur.execute("""
        select source, count(*) total,
               count(*) filter (where result = 'Fail') fails
        from public.test_records group by source order by source;
    """)
    grand = 0
    for source, total, fails in cur.fetchall():
        grand += total
        print(f"  {source:12s}  total={total:>9,}  fails={fails:>9,}")
    print(f"  {'TOTAL':12s}  total={grand:>9,}")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
