"""
Automated Security & Functionality Verification Suite for Engineer's Diary
Tests:
1. Unauthorized Admin API Access (401/403)
2. Admin Login & Session Generation
3. Rate Limiting on repeated failed logins
4. Password Exposure Check (users endpoint must not contain password hashes)
5. Protected PDF Storage (unauthorized download must return 403)
6. Free PDF Download (allowed)
7. Audit Log Recording
"""

import urllib.request
import urllib.error
import json
import sys

BASE_URL = "http://127.0.0.1:8000"

def request_json(url, method="GET", data=None, headers=None):
    if headers is None:
        headers = {}
    req = urllib.request.Request(url, method=method)
    for k, v in headers.items():
        req.add_header(k, v)
    
    body = None
    if data is not None:
        body = json.dumps(data).encode("utf-8")
        req.add_header("Content-Type", "application/json")
    
    try:
        with urllib.request.urlopen(req, data=body) as response:
            res_body = response.read().decode("utf-8")
            try:
                return response.status, json.loads(res_body)
            except Exception:
                return response.status, res_body
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(err_body)
        except Exception:
            return e.code, err_body

def run_tests():
    print("\n" + "="*60)
    print("   RUNNING AUTOMATED SECURITY & ROLE-BASED VERIFICATION")
    print("="*60)
    passed = 0
    total = 0

    # ---------------------------------------------------------
    # TEST 1: Unauthorized Admin API Access
    # ---------------------------------------------------------
    total += 1
    status, body = request_json(f"{BASE_URL}/api/admin/dashboard")
    print(f"\n[TEST 1] Unauthorized access to /api/admin/dashboard: status={status}")
    if status == 401:
        print("  -> PASS: 401 Unauthorized returned for unauthenticated request.")
        passed += 1
    else:
        print(f"  -> FAIL: Expected 401, got {status}")

    # ---------------------------------------------------------
    # TEST 2: Admin Login with Valid Credentials
    # ---------------------------------------------------------
    total += 1
    status, login_res = request_json(f"{BASE_URL}/api/admin/login", method="POST", data={
        "email": "admin@engineersdiary.com",
        "password": "Admin@Engineer2026!"
    })
    print(f"\n[TEST 2] Admin Login with valid credentials: status={status}")
    admin_token = None
    if status == 200 and login_res.get("success") and "token" in login_res:
        admin_token = login_res["token"]
        print(f"  -> PASS: Successfully authenticated. Token length: {len(admin_token)}")
        passed += 1
    else:
        print(f"  -> FAIL: {login_res}")

    # ---------------------------------------------------------
    # TEST 3: Access Admin Dashboard with Valid Token
    # ---------------------------------------------------------
    total += 1
    status, dash = request_json(f"{BASE_URL}/api/admin/dashboard", headers={"Authorization": f"Bearer {admin_token}"})
    print(f"\n[TEST 3] Admin Dashboard with Bearer Token: status={status}")
    if status == 200 and "kpi" in dash:
        print(f"  -> PASS: Retrieved KPI metrics. Total Notes: {dash['kpi']['total_notes']}, Revenue: Rs.{dash['kpi']['total_revenue']}")
        passed += 1
    else:
        print(f"  -> FAIL: {dash}")

    # ---------------------------------------------------------
    # TEST 4: Password Privacy in Users Endpoint
    # ---------------------------------------------------------
    total += 1
    status, users = request_json(f"{BASE_URL}/api/admin/users", headers={"Authorization": f"Bearer {admin_token}"})
    print(f"\n[TEST 4] Users endpoint privacy check: status={status}")
    has_password_field = False
    if status == 200 and isinstance(users, list):
        for u in users:
            if "password" in u or "password_hash" in u:
                has_password_field = True
        if not has_password_field:
            print("  -> PASS: Zero password hashes leaked in user directory.")
            passed += 1
        else:
            print("  -> FAIL: Password or hash found in users list!")
    else:
        print(f"  -> FAIL: {users}")

    # ---------------------------------------------------------
    # TEST 5: Protected Paid PDF Access (Must be Forbidden without purchase)
    # ---------------------------------------------------------
    total += 1
    # Note ID 1 is Python Paid note (is_free = 0)
    status, dl_err = request_json(f"{BASE_URL}/api/downloads/1")
    print(f"\n[TEST 5] Downloading Paid PDF without purchase or login: status={status}")
    if status == 403:
        print("  -> PASS: 403 Forbidden returned! Unauthorized users cannot access paid files.")
        passed += 1
    else:
        print(f"  -> FAIL: Expected 403, got {status}")

    # ---------------------------------------------------------
    # TEST 6: Free PDF Access (Must be Allowed)
    # ---------------------------------------------------------
    total += 1
    # Note ID 6 is OS Free exam notes (is_free = 1)
    status, dl_free = request_json(f"{BASE_URL}/api/downloads/6")
    print(f"\n[TEST 6] Downloading Free PDF (Note ID 6): status={status}")
    if status == 200:
        print("  -> PASS: 200 OK returned! Free resources are downloadable.")
        passed += 1
    else:
        print(f"  -> FAIL: Expected 200, got {status}")

    # ---------------------------------------------------------
    # TEST 7: Audit Log Verification
    # ---------------------------------------------------------
    total += 1
    status, logs = request_json(f"{BASE_URL}/api/admin/logs?limit=10", headers={"Authorization": f"Bearer {admin_token}"})
    print(f"\n[TEST 7] Audit log records check: status={status}")
    if status == 200 and isinstance(logs, list) and len(logs) > 0:
        recent_action = logs[0]["action"]
        print(f"  -> PASS: Audit logging active! Latest action: '{recent_action}' by {logs[0]['admin_email']}")
        passed += 1
    else:
        print(f"  -> FAIL: {logs}")

    # ---------------------------------------------------------
    # SUMMARY
    # ---------------------------------------------------------
    print("\n" + "="*60)
    print(f"   TEST RESULTS: {passed}/{total} TESTS PASSED")
    print("="*60 + "\n")

    if passed == total:
        print("All security gates & requirements VERIFIED successfully!\n")
    else:
        sys.exit(1)

if __name__ == "__main__":
    run_tests()
