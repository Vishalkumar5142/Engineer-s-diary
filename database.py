"""
Engineer's Diary - Secure Database & Storage Engine
SQLite with Role-Based Access Control, PBKDF2 Password Hashing & Audit Logging.
"""

import sqlite3
import hashlib
import secrets
import json
import os
from datetime import datetime, timedelta

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "engineers_diary.db")
PROTECTED_STORAGE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "protected_storage", "pdfs")
UPLOADED_MEDIA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "uploads")

os.makedirs(PROTECTED_STORAGE_DIR, exist_ok=True)
os.makedirs(UPLOADED_MEDIA_DIR, exist_ok=True)

# -------------------------------------------------------------
# CRYPTOGRAPHIC SECURITY HELPERS
# -------------------------------------------------------------

def hash_password(password: str) -> str:
    """Hash password using PBKDF2-HMAC-SHA256 with cryptographically random 16-byte salt."""
    salt = secrets.token_bytes(16)
    key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 100000)
    return f"{salt.hex()}:{key.hex()}"

def verify_password(stored_hash: str, provided_password: str) -> bool:
    """Verify password against stored salt:key hash."""
    try:
        salt_hex, key_hex = stored_hash.split(":")
        salt = bytes.fromhex(salt_hex)
        expected_key = bytes.fromhex(key_hex)
        new_key = hashlib.pbkdf2_hmac('sha256', provided_password.encode('utf-8'), salt, 100000)
        return secrets.compare_digest(expected_key, new_key)
    except Exception:
        return False

def generate_session_token() -> str:
    """Generate cryptographically secure 64-character hex session token."""
    return secrets.token_hex(32)

# -------------------------------------------------------------
# DATABASE CONNECTION & SCHEMA CREATION
# -------------------------------------------------------------

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def init_db():
    """Initialize all database tables with strict relationships and indexes."""
    conn = get_db()
    cursor = conn.cursor()

    # 1. Users Table (Role-based: 'user' or 'admin')
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        college TEXT,
        branch TEXT,
        role TEXT NOT NULL DEFAULT 'user',  -- 'user' or 'admin'
        is_blocked INTEGER NOT NULL DEFAULT 0,
        mfa_enabled INTEGER NOT NULL DEFAULT 0,
        mfa_secret TEXT,
        avatar_url TEXT DEFAULT 'assets/images/logo.jpg',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME
    );
    """)

    # 2. Admin & User Sessions Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT UNIQUE NOT NULL,
        user_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """)

    # 3. Products & Notes Table (PDFs, Notes)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS products_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        category TEXT NOT NULL,         -- 'CSE', 'Python', 'DSA', 'B.Tech', etc.
        subject TEXT,
        branch TEXT,                   -- 'CSE', 'IT', 'ECE', 'All'
        semester TEXT,                 -- '1st', '2nd', '3rd', etc.
        price REAL NOT NULL DEFAULT 0.0,
        original_price REAL DEFAULT 0.0,
        is_free INTEGER NOT NULL DEFAULT 0,
        is_published INTEGER NOT NULL DEFAULT 1,
        pdf_filename TEXT NOT NULL,
        pdf_filesize TEXT DEFAULT '12.4 MB',
        page_count INTEGER DEFAULT 85,
        thumbnail_url TEXT DEFAULT 'assets/images/logo.jpg',
        tags TEXT,                     -- Comma-separated or JSON string
        downloads_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 4. Courses Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS courses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        thumbnail_url TEXT DEFAULT 'assets/images/hero_study_room.jpg',
        price REAL NOT NULL DEFAULT 0.0,
        is_free INTEGER NOT NULL DEFAULT 0,
        is_published INTEGER NOT NULL DEFAULT 1,
        modules_json TEXT,             -- JSON array of chapters, video links, PDFs
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 5. Orders Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_number TEXT UNIQUE NOT NULL,
        user_id INTEGER,
        customer_name TEXT NOT NULL,
        customer_email TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        items_json TEXT NOT NULL,
        total_amount REAL NOT NULL,
        payment_status TEXT NOT NULL DEFAULT 'Pending', -- 'Pending', 'Paid', 'Failed', 'Cancelled', 'Refunded'
        payment_provider TEXT DEFAULT 'UPI_QR',
        transaction_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
    """)

    # 6. Purchases Table (Grants instant secure PDF access)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS purchases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        user_email TEXT NOT NULL,
        product_id INTEGER NOT NULL,
        order_id INTEGER NOT NULL,
        unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products_notes(id) ON DELETE CASCADE,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );
    """)

    # 7. Media Library Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS media (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        mime_type TEXT,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 8. Website Content CMS Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS website_content (
        content_key TEXT PRIMARY KEY,
        content_value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 9. Admin Activity Audit Logs Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS admin_activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_id INTEGER,
        admin_email TEXT NOT NULL,
        action TEXT NOT NULL,          -- 'LOGIN', 'LOGOUT', 'UPLOAD_PDF', 'DELETE_PDF', 'UPDATE_PRICE', etc.
        object_type TEXT,              -- 'PDF', 'NOTE', 'COURSE', 'USER', 'CONTENT', 'SETTINGS'
        object_id TEXT,
        details TEXT,
        ip_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 10. Login Attempts (Rate Limiting & Lockout)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS login_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip_address TEXT NOT NULL,
        email TEXT,
        attempts_count INTEGER NOT NULL DEFAULT 1,
        locked_until DATETIME,
        last_attempt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 11. Website & Payment Settings
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS admin_settings (
        setting_key TEXT PRIMARY KEY,
        setting_value TEXT NOT NULL
    );
    """)

    # Indexes for high performance
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_purchases_user ON purchases(user_id, product_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_orders_num ON orders(order_number);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_logs_created ON admin_activity_logs(created_at);")

    conn.commit()
    conn.close()

# -------------------------------------------------------------
# SEED INITIAL DATA (ADMIN, NOTES, CMS, SETTINGS)
# -------------------------------------------------------------

def create_sample_pdf(filepath: str, title: str):
    """Generate a clean, valid sample PDF file if it doesn't already exist."""
    if os.path.exists(filepath):
        return
    content = f"""%PDF-1.4
1 0 obj
<< /Title ({title} - Engineer's Diary) /Creator (Engineer's Diary Learning Platform) >>
endobj
2 0 obj
<< /Type /Catalog /Pages 3 0 R >>
endobj
3 0 obj
<< /Type /Pages /Kids [4 0 R] /Count 1 >>
endobj
4 0 obj
<< /Type /Page /Parent 3 0 R /MediaBox [0 0 612 792] /Contents 5 0 R /Resources << /Font << /F1 6 0 R >> >> >>
endobj
5 0 obj
<< /Length 280 >>
stream
BT
/F1 24 Tf
50 720 Td
(ENGINEER'S DIARY - OFFICIAL STUDY NOTES) Tj
/F1 16 Tf
0 -40 Td
({title}) Tj
/F1 12 Tf
0 -30 Td
(Verified handwritten notes, formulas, diagrams & solved exam questions.) Tj
0 -20 Td
(Authorized Student Copy - Instant Exam Preparation) Tj
0 -30 Td
(Visit: https://engineersdiary.com | Instagram: @engineers_diary) Tj
ET
endstream
endobj
6 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>
endobj
xref
0 7
0000000000 65535 f 
0000000009 00000 n 
0000000097 00000 n 
0000000148 00000 n 
0000000207 00000 n 
0000000331 00000 n 
0000000665 00000 n 
trailer
<< /Size 7 /Root 2 0 R /Info 1 0 R >>
startxref
750
%%EOF"""
    with open(filepath, "wb") as f:
        f.write(content.encode("latin1"))

def seed_default_data():
    """Seed initial authorized Owner/Admin, realistic study notes, CMS content & settings."""
    conn = get_db()
    cursor = conn.cursor()

    # 1. Authoritative Admin Owner Account
    admin_email = os.environ.get("ADMIN_EMAIL", "raovishalyadav6143@gmail.com").lower()
    admin_pass = os.environ.get("ADMIN_PASSWORD", "VISHALYADAV@7518")

    cursor.execute("SELECT id FROM users WHERE role = 'admin' LIMIT 1;")
    admin_exists = cursor.fetchone()

    if not admin_exists:
        hashed = hash_password(admin_pass)
        cursor.execute("""
            INSERT INTO users (email, password_hash, name, phone, role, mfa_enabled, mfa_secret, avatar_url)
            VALUES (?, ?, ?, ?, 'admin', 0, '849201', 'assets/images/logo.jpg');
        """, (admin_email, hashed, "Website Owner / Chief Admin", "+91 7839827154"))
        print(f"[SECURITY] Initial Admin Created: {admin_email} / {admin_pass}")

    # 2. Default Student Demo Account
    cursor.execute("SELECT id FROM users WHERE email = 'student@btech.ac.in';")
    if not cursor.fetchone():
        hashed_student = hash_password("student123")
        cursor.execute("""
            INSERT INTO users (email, password_hash, name, phone, college, branch, role, avatar_url)
            VALUES ('student@btech.ac.in', ?, 'Vishal Kumar', '+91 7839827154', 'B.Tech CSE College', 'Computer Science', 'user', 'assets/images/student_avatar.jpg');
        """, (hashed_student,))

    # 3. Seed Realistic Engineering Notes / PDFs
    cursor.execute("SELECT COUNT(*) as cnt FROM products_notes;")
    if cursor.fetchone()["cnt"] == 0:
        default_notes = [
            {
                "title": "Python Programming Complete Handwritten Notes",
                "description": "Comprehensive handwritten Python notes covering basics, OOPs, data structures, file handling, libraries & top 50 coding problems.",
                "category": "Python",
                "subject": "Programming in Python",
                "branch": "CSE / IT",
                "semester": "2nd Semester",
                "price": 49.0,
                "original_price": 199.0,
                "is_free": 0,
                "pdf_filename": "python_handwritten_complete.pdf",
                "pdf_filesize": "14.2 MB",
                "page_count": 92,
                "thumbnail_url": "assets/images/cover_python.jpg",
                "tags": "Python, OOPs, DSA, Handwritten, B.Tech, CSE",
                "downloads": 1420
            },
            {
                "title": "Data Structures & Algorithms (DSA) Master Notes",
                "description": "Complete DSA guide with step-by-step illustrations: Arrays, Linked Lists, Stacks, Queues, Trees, Graphs, DP & LeetCode patterns.",
                "category": "DSA",
                "subject": "Data Structures & Algorithms",
                "branch": "CSE / IT",
                "semester": "3rd Semester",
                "price": 79.0,
                "original_price": 299.0,
                "is_free": 0,
                "pdf_filename": "dsa_master_handwritten_notes.pdf",
                "pdf_filesize": "22.6 MB",
                "page_count": 145,
                "thumbnail_url": "assets/images/cover_dsa.jpg",
                "tags": "DSA, Algorithms, LeetCode, Placement, Trees, Graphs",
                "downloads": 2840
            },
            {
                "title": "Database Management Systems (DBMS) Handwritten Guide",
                "description": "Exam-ready DBMS notes: ER diagrams, Normalization (1NF to BCNF), SQL queries, Indexing, Transactions & Concurrency Control.",
                "category": "DBMS",
                "subject": "Database Management Systems",
                "branch": "CSE / IT",
                "semester": "4th Semester",
                "price": 59.0,
                "original_price": 249.0,
                "is_free": 0,
                "pdf_filename": "dbms_handwritten_complete.pdf",
                "pdf_filesize": "16.8 MB",
                "page_count": 108,
                "thumbnail_url": "assets/images/cover_dbms.jpg",
                "tags": "DBMS, SQL, Normalization, Transactions, B.Tech, CSE",
                "downloads": 1890
            },
            {
                "title": "Java Core & Advanced Handwritten Notes",
                "description": "Complete Java roadmap notes: OOPs, Exception Handling, Collections Framework, Multithreading, Streams & Spring Boot overview.",
                "category": "Java",
                "subject": "Java Programming",
                "branch": "CSE",
                "semester": "3rd Semester",
                "price": 59.0,
                "original_price": 249.0,
                "is_free": 0,
                "pdf_filename": "java_complete_handwritten.pdf",
                "pdf_filesize": "18.1 MB",
                "page_count": 115,
                "thumbnail_url": "assets/images/cover_java.jpg",
                "tags": "Java, OOPs, Collections, Multithreading, CSE",
                "downloads": 1650
            },
            {
                "title": "C & C++ Programming Complete Formula & Code Book",
                "description": "Pointers, memory management, templates, STL containers, class design and 100+ solved university exam questions.",
                "category": "C++",
                "subject": "Programming in C & C++",
                "branch": "All Branches",
                "semester": "1st Semester",
                "price": 39.0,
                "original_price": 149.0,
                "is_free": 0,
                "pdf_filename": "cpp_stl_handwritten_notes.pdf",
                "pdf_filesize": "13.5 MB",
                "page_count": 88,
                "thumbnail_url": "assets/images/cover_cpp.jpg",
                "tags": "C++, STL, Pointers, B.Tech, 1st Year",
                "downloads": 2100
            },
            {
                "title": "Operating Systems (OS) Simplified Exam Notes",
                "description": "Process scheduling, Deadlocks, Memory Management, Paging, Virtual Memory, File Systems and solved previous year papers.",
                "category": "Operating System",
                "subject": "Operating Systems",
                "branch": "CSE / IT",
                "semester": "4th Semester",
                "price": 0.0,
                "original_price": 149.0,
                "is_free": 1,
                "pdf_filename": "os_free_exam_handwritten.pdf",
                "pdf_filesize": "11.2 MB",
                "page_count": 76,
                "thumbnail_url": "assets/images/book_stack.jpg",
                "tags": "OS, Deadlock, Paging, Free, Exam Notes",
                "downloads": 3900
            },
            {
                "title": "Computer Networks (CN) High-Yield Revision Sheet",
                "description": "OSI 7 Layers, TCP/IP, Subnetting formulas, Routing algorithms, HTTP/HTTPS, DNS & Network Security key concepts.",
                "category": "Computer Networks",
                "subject": "Computer Networks",
                "branch": "CSE / IT",
                "semester": "5th Semester",
                "price": 0.0,
                "original_price": 99.0,
                "is_free": 1,
                "pdf_filename": "cn_quick_revision_notes.pdf",
                "pdf_filesize": "9.5 MB",
                "page_count": 64,
                "thumbnail_url": "assets/images/hero_study_room.jpg",
                "tags": "CN, Subnetting, OSI Layer, Free, Revision",
                "downloads": 4120
            },
            {
                "title": "Artificial Intelligence & Machine Learning Complete Roadmap",
                "description": "Math for ML (Linear Algebra, Calculus), Supervised & Unsupervised Learning, Neural Networks, PyTorch & OpenCV handwritten guide.",
                "category": "AI/ML",
                "subject": "Artificial Intelligence & ML",
                "branch": "CSE / AI-ML",
                "semester": "6th Semester",
                "price": 89.0,
                "original_price": 349.0,
                "is_free": 0,
                "pdf_filename": "aiml_handwritten_complete.pdf",
                "pdf_filesize": "24.0 MB",
                "page_count": 160,
                "thumbnail_url": "assets/images/logo.jpg",
                "tags": "AI, ML, Python, Neural Networks, PyTorch, CSE",
                "downloads": 1780
            }
        ]

        for n in default_notes:
            # Generate sample protected PDF
            pdf_path = os.path.join(PROTECTED_STORAGE_DIR, n["pdf_filename"])
            create_sample_pdf(pdf_path, n["title"])

            cursor.execute("""
                INSERT INTO products_notes 
                (title, description, category, subject, branch, semester, price, original_price, is_free, is_published, pdf_filename, pdf_filesize, page_count, thumbnail_url, tags, downloads_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?);
            """, (
                n["title"], n["description"], n["category"], n["subject"], n["branch"], n["semester"],
                n["price"], n["original_price"], n["is_free"], n["pdf_filename"], n["pdf_filesize"],
                n["page_count"], n["thumbnail_url"], n["tags"], n["downloads"]
            ))

    # 4. Seed Courses
    cursor.execute("SELECT COUNT(*) as cnt FROM courses;")
    if cursor.fetchone()["cnt"] == 0:
        modules = [
            {"title": "Module 1: Foundations & Core Logic", "duration": "4 Hours", "lessons": ["Syntax & Variables", "Control Flow", "Functions & Scope"]},
            {"title": "Module 2: Object-Oriented Architecture", "duration": "6 Hours", "lessons": ["Classes & Objects", "Inheritance & Polymorphism", "Clean Code Best Practices"]},
            {"title": "Module 3: Placement DSA & Projects", "duration": "10 Hours", "lessons": ["Key Interview Problems", "Live Industry Project", "Resume Review"]}
        ]
        cursor.execute("""
            INSERT INTO courses (title, description, thumbnail_url, price, is_free, is_published, modules_json)
            VALUES (?, ?, ?, ?, 0, 1, ?);
        """, (
            "Complete DSA & Placement Masterclass 2026",
            "From zero to top product companies. Master DSA, LeetCode patterns, System Design basics and build real engineering projects.",
            "assets/images/notes_tablet_showcase.jpg",
            499.0,
            json.dumps(modules)
        ))

    # 5. Seed Website Content (CMS)
    cms_defaults = {
        "hero_headline": "Learn. Build. Become an Engineer.",
        "hero_subheading": "Programming Notes, B.Tech Resources, Roadmaps & Projects — All in One Place.",
        "brand_name": "Engineer's Diary",
        "tagline": "LEARN • CODE • BUILD • GET PLACED",
        "announcement_text": "🚀 SPECIAL OFFER: Flat 60% OFF on all Handwritten B.Tech & CSE Notes Bundles!",
        "announcement_active": "true",
        "about_text": "Engineer's Diary is India's leading digital education community for B.Tech, CSE, and engineering students. Founded to provide top-quality handwritten notes, semester roadmaps, coding problem sets, and placement guides that simplify difficult concepts.",
        "instagram_url": "https://instagram.com/engineers_diary",
        "telegram_url": "https://t.me/engineers_diary",
        "youtube_url": "https://youtube.com/@engineers_diary",
        "contact_email": "contact@engineersdiary.com",
        "contact_phone": "+91 7839827154",
        "upi_id": "engineersdiary@upi",
        "upi_name": "Engineer's Diary Official",
        "maintenance_mode": "false"
    }

    for k, v in cms_defaults.items():
        cursor.execute("""
            INSERT OR IGNORE INTO website_content (content_key, content_value)
            VALUES (?, ?);
        """, (k, v))

    # 6. Seed Settings
    settings_defaults = {
        "store_status": "active",
        "currency_symbol": "₹",
        "razorpay_key_id": "rzp_test_ed2026_demo",
        "razorpay_webhook_secret": "whsec_demo_secret_2026",
        "two_factor_auth_required": "false",
        "auto_approve_orders": "true"
    }

    for k, v in settings_defaults.items():
        cursor.execute("""
            INSERT OR IGNORE INTO admin_settings (setting_key, setting_value)
            VALUES (?, ?);
        """, (k, v))

    # 7. Seed Initial Purchase for Demo Student
    cursor.execute("SELECT id FROM users WHERE email = 'student@btech.ac.in';")
    student_row = cursor.fetchone()
    if student_row:
        student_id = student_row["id"]
        cursor.execute("SELECT COUNT(*) as cnt FROM purchases WHERE user_id = ?;", (student_id,))
        if cursor.fetchone()["cnt"] == 0:
            cursor.execute("""
                INSERT INTO orders (order_number, user_id, customer_name, customer_email, customer_phone, items_json, total_amount, payment_status, payment_provider, transaction_id)
                VALUES ('ORD-2026-1001', ?, 'Vishal Kumar', 'student@btech.ac.in', '+91 7839827154', '[{"id":1,"title":"Python Complete Notes","price":49}]', 49.0, 'Paid', 'UPI_QR', 'UPI-TXN-8492019');
            """, (student_id,))
            order_id = cursor.lastrowid
            cursor.execute("""
                INSERT INTO purchases (user_id, user_email, product_id, order_id)
                VALUES (?, 'student@btech.ac.in', 1, ?);
            """, (student_id, order_id))

    conn.commit()
    conn.close()

# Initialize DB on module import
init_db()
seed_default_data()
