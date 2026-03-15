import sqlite3

def check_table(table_name):
    conn = sqlite3.connect('api_security.db')
    cursor = conn.cursor()
    print(f"\n--- Columns in {table_name} ---")
    cursor.execute(f"PRAGMA table_info({table_name})")
    columns = cursor.fetchall()
    for col in columns:
        print(f"ID: {col[0]}, Name: {col[1]}, Type: {col[2]}, Nullable: {col[3]}, Default: {col[4]}, PK: {col[5]}")
    conn.close()

if __name__ == "__main__":
    check_table('api_endpoints')
    check_table('vulnerabilities')
