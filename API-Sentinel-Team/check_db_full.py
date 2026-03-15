import sqlite3

def check_db():
    conn = sqlite3.connect('api_security.db')
    cursor = conn.cursor()
    
    with open('db_status.txt', 'w') as f:
        for table in ['api_endpoints', 'vulnerabilities']:
            f.write(f"\n--- {table} ---\n")
            cursor.execute(f"PRAGMA table_info({table})")
            for col in cursor.fetchall():
                f.write(f"{col[1]} ({col[2]})\n")
    conn.close()

if __name__ == "__main__":
    check_db()
