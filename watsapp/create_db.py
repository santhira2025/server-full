import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

conn = psycopg2.connect(user="postgres", password="postgres", host="127.0.0.1", port="54322")
conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
cursor = conn.cursor()
try:
    cursor.execute("CREATE DATABASE whatsapp_agent")
    print("Database created successfully")
except Exception as e:
    print(f"Error: {e}")
finally:
    cursor.close()
    conn.close()
