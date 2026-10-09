/**
 * Engineer's Diary - Secure Private Admin Console Engine
 * Direct integration with FastAPI endpoints, Session Guard & Role Verification
 */

let currentAdminToken = localStorage.getItem('ed_admin_token') || null;
let currentAdminProfile = null;
let allNotesCache = [];
let allUsersCache = [];
let pendingDeleteId = null;
let pendingDeleteType = null;

// Determine backend API origin (seamless support for file:// and custom ports)
const API_BASE = (window.location.protocol === 'file:' || (window.location.port !== '8000' && !window.location.host.includes(':8000') && !window.location.host.includes('engineersdiary'))) ? 'http://127.0.0.1:8000' : '';

if (API_BASE) {
  const originalFetch = window.fetch;
  window.fetch = function(resource, init) {
    if (typeof resource === 'string' && resource.startsWith('/api/')) {
      resource = API_BASE + resource;
    }
    return originalFetch(resource, init);
  };
}

// -------------------------------------------------------------
// 1. INITIALIZATION & SESSION GUARD
// -------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  verifyAdminSession();
});

async function verifyAdminSession() {
  if (!currentAdminToken) {
    showLoginScreen();
    return;
  }

  try {
    const res = await fetch('/api/admin/me', {
      headers: {
        'Authorization': `Bearer ${currentAdminToken}`
      }
    });

    if (res.ok) {
      const data = await res.json();
      currentAdminProfile = data.admin;
      showAppLayout();
      loadDashboardMetrics();
    } else {
      // Session expired or invalid
      handleAdminLogout(false);
    }
  } catch (err) {
    console.error('Session verify error:', err);
    showLoginScreen();
  }
}

function showLoginScreen() {
  document.getElementById('adminLoginScreen').style.display = 'flex';
  document.getElementById('adminAppLayout').style.display = 'none';
  const upModal = document.getElementById('uploadPdfModal');
  if (upModal) { upModal.style.display = 'none'; upModal.classList.remove('active'); }
  const delModal = document.getElementById('confirmDeleteModal');
  if (delModal) { delModal.style.display = 'none'; delModal.classList.remove('active'); }
}

function showAppLayout() {
  document.getElementById('adminLoginScreen').style.display = 'none';
  document.getElementById('adminAppLayout').style.display = 'flex';

  if (currentAdminProfile) {
    document.getElementById('sidebarAdminName').innerText = currentAdminProfile.name || 'Owner';
    document.getElementById('sidebarAdminEmail').innerText = currentAdminProfile.email || 'admin@engineersdiary.com';
  }
}

// -------------------------------------------------------------
// 2. ADMIN AUTHENTICATION (LOGIN & LOGOUT)
// -------------------------------------------------------------

async function handleAdminLogin(e) {
  e.preventDefault();
  const alertBox = document.getElementById('loginAlertBox');
  const btn = document.getElementById('btnLoginSubmit');
  const email = document.getElementById('adminEmailInput').value.trim();
  const password = document.getElementById('adminPasswordInput').value;
  const mfaCode = document.getElementById('adminMfaInput').value.trim();

  alertBox.style.display = 'none';
  btn.querySelector('.btn-text').style.display = 'none';
  btn.querySelector('.btn-spinner').style.display = 'inline-block';
  btn.disabled = true;

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, mfa_code: mfaCode || null })
    });

    const data = await res.json();

    if (res.ok) {
      currentAdminToken = data.token;
      currentAdminProfile = data.admin;
      localStorage.setItem('ed_admin_token', data.token);
      showToast('Authentication successful. Welcome, Owner!', 'success');
      showAppLayout();
      loadDashboardMetrics();
    } else {
      // Check if 2FA code is needed
      if (data.detail && data.detail.includes('2FA')) {
        document.getElementById('mfaGroup').style.display = 'block';
      }
      alertBox.innerText = data.detail || 'Authentication failed. Please check credentials.';
      alertBox.style.display = 'block';
    }
  } catch (err) {
    alertBox.innerText = 'Network error. Please ensure the backend server is running.';
    alertBox.style.display = 'block';
  } finally {
    btn.querySelector('.btn-text').style.display = 'inline-block';
    btn.querySelector('.btn-spinner').style.display = 'none';
    btn.disabled = false;
  }
}

async function handleAdminLogout(callApi = true) {
  if (callApi && currentAdminToken) {
    try {
      await fetch('/api/admin/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${currentAdminToken}` }
      });
    } catch (e) {}
  }
  currentAdminToken = null;
  currentAdminProfile = null;
  localStorage.removeItem('ed_admin_token');
  showLoginScreen();
  showToast('Admin session closed securely.', 'success');
}

function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (input.type === 'password') {
    input.type = 'text';
    btn.innerText = '🔒';
  } else {
    input.type = 'password';
    btn.innerText = '👁️';
  }
}

// -------------------------------------------------------------
// 3. TAB NAVIGATION
// -------------------------------------------------------------

function switchAdminTab(tabName, clickedEl) {
  // Update nav links
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(el => el.classList.remove('active'));
  if (clickedEl) {
    clickedEl.classList.add('active');
  } else {
    const targetLink = document.querySelector(`.sidebar-nav .nav-item[href="#${tabName}"]`);
    if (targetLink) targetLink.classList.add('active');
  }

  // Update tab panes
  document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
  const targetPane = document.getElementById(`tab-${tabName}`);
  if (targetPane) targetPane.classList.add('active');

  // Header Title
  const titles = {
    dashboard: { title: 'Executive Dashboard', sub: 'Real-time overview of Engineer\'s Diary store, notes & revenue' },
    pdfs: { title: 'PDFs & Handwritten Notes', sub: 'Upload, edit, set prices, and control document distribution' },
    courses: { title: 'Engineering Masterclasses', sub: 'Create and organize multi-module technical courses' },
    orders: { title: 'Customer Transactions & Orders', sub: 'Live payment verification and access fulfillment' },
    users: { title: 'Student Directory', sub: 'View enrolled students, purchases, and account statuses' },
    content: { title: 'Live CMS & Website Copy', sub: 'Customize headlines, announcements, and links in real time' },
    media: { title: 'Media Assets & Banners', sub: 'Upload and manage image thumbnails, banners and visual assets' },
    security: { title: 'Owner Security & 2FA', sub: 'Multi-factor authentication, master password, and session policies' },
    logs: { title: 'System Audit Logs', sub: 'Tamper-evident log of administrative actions' },
    settings: { title: 'Store & Payment Settings', sub: 'Configure UPI payment VPA, auto-approval, and maintenance mode' }
  };

  const meta = titles[tabName] || { title: 'Admin Console', sub: 'Engineer\'s Diary Management' };
  document.getElementById('pageHeaderTitle').innerText = meta.title;
  document.getElementById('pageHeaderSubtitle').innerText = meta.sub;

  // Trigger data loaders
  if (tabName === 'dashboard') loadDashboardMetrics();
  else if (tabName === 'pdfs') loadAdminNotes();
  else if (tabName === 'courses') loadAdminCourses();
  else if (tabName === 'orders') loadAdminOrders();
  else if (tabName === 'users') loadAdminUsers();
  else if (tabName === 'content') loadCmsContent();
  else if (tabName === 'media') loadAdminMedia();
  else if (tabName === 'security') loadSecurityStatus();
  else if (tabName === 'logs') loadAuditLogs();
  else if (tabName === 'settings') loadStoreSettings();

  // Close mobile sidebar if open
  document.getElementById('adminSidebar').classList.remove('mobile-open');
}

function toggleMobileAdminSidebar() {
  document.getElementById('adminSidebar').classList.toggle('mobile-open');
}

// -------------------------------------------------------------
// 4. TAB 1: DASHBOARD METRICS
// -------------------------------------------------------------

async function loadDashboardMetrics() {
  try {
    const res = await fetch('/api/admin/dashboard', {
      headers: { 'Authorization': `Bearer ${currentAdminToken}` }
    });
    if (!res.ok) return;

    const data = await res.json();
    const kpi = data.kpi;

    document.getElementById('kpiTotalNotes').innerText = kpi.total_notes;
    document.getElementById('kpiPaidPdfs').innerText = `${kpi.paid_pdfs} Paid PDFs • ${kpi.total_notes - kpi.paid_pdfs} Free`;
    document.getElementById('kpiTotalCourses').innerText = kpi.total_courses;
    document.getElementById('kpiTotalUsers').innerText = kpi.total_users;
    document.getElementById('kpiTotalRevenue').innerText = `₹${kpi.total_revenue.toLocaleString('en-IN')}`;
    document.getElementById('kpiTotalOrders').innerText = `${kpi.total_orders} Completed Orders`;

    document.getElementById('badgeNotesCount').innerText = kpi.total_notes;
    document.getElementById('badgeOrdersCount').innerText = kpi.total_orders;

    // Render Recent Orders
    const ordersTbody = document.getElementById('dashRecentOrdersTbody');
    if (data.recent_orders && data.recent_orders.length > 0) {
      ordersTbody.innerHTML = data.recent_orders.map(o => `
        <tr>
          <td><strong>${escapeHtml(o.order_number)}</strong></td>
          <td>${escapeHtml(o.customer_name)}<br><small style="color:#64748B;">${escapeHtml(o.customer_phone)}</small></td>
          <td><strong>₹${o.total_amount}</strong></td>
          <td><span class="badge-status status-${o.payment_status.toLowerCase()}">${o.payment_status}</span></td>
          <td><small>${formatDate(o.created_at)}</small></td>
        </tr>
      `).join('');
    } else {
      ordersTbody.innerHTML = `<tr><td colspan="5" class="table-empty">No orders placed yet.</td></tr>`;
    }

    // Render Recent Uploads
    const uploadsTbody = document.getElementById('dashRecentUploadsTbody');
    if (data.recent_uploads && data.recent_uploads.length > 0) {
      uploadsTbody.innerHTML = data.recent_uploads.map(n => `
        <tr>
          <td><strong>${escapeHtml(n.title)}</strong></td>
          <td><span class="badge-status status-published">${escapeHtml(n.category)}</span></td>
          <td>${n.is_free ? '<strong style="color:#10B981;">FREE</strong>' : `₹${n.price}`}</td>
          <td>📥 ${n.downloads_count}</td>
          <td><span class="badge-status ${n.is_published ? 'status-paid' : 'status-draft'}">${n.is_published ? 'Published' : 'Draft'}</span></td>
        </tr>
      `).join('');
    } else {
      uploadsTbody.innerHTML = `<tr><td colspan="5" class="table-empty">No notes uploaded yet.</td></tr>`;
    }

    // Render Recent Logs
    const logsTbody = document.getElementById('dashRecentLogsTbody');
    if (data.recent_logs && data.recent_logs.length > 0) {
      logsTbody.innerHTML = data.recent_logs.map(l => `
        <tr>
          <td><small>${formatDate(l.created_at)}</small></td>
          <td><strong>${escapeHtml(l.action)}</strong></td>
          <td>${escapeHtml(l.object_type || '-')}</td>
          <td>${escapeHtml(l.details || '-')}</td>
          <td><small style="font-family:monospace;">${escapeHtml(l.ip_address || '127.0.0.1')}</small></td>
        </tr>
      `).join('');
    } else {
      logsTbody.innerHTML = `<tr><td colspan="5" class="table-empty">No activity recorded yet.</td></tr>`;
    }

  } catch (err) {
    console.error('Failed to load dashboard:', err);
  }
}

// -------------------------------------------------------------
// 5. TAB 2: PDFS & NOTES MANAGEMENT CRUD
// -------------------------------------------------------------

async function loadAdminNotes() {
  const tbody = document.getElementById('allNotesTbody');
  tbody.innerHTML = `<tr><td colspan="8" class="table-empty">Loading study notes catalog...</td></tr>`;

  try {
    const res = await fetch('/api/admin/notes', {
      headers: { 'Authorization': `Bearer ${currentAdminToken}` }
    });
    if (!res.ok) return;

    allNotesCache = await res.json();
    renderNotesTable(allNotesCache);
    document.getElementById('badgeNotesCount').innerText = allNotesCache.length;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="table-empty">Failed to load notes. Please check server.</td></tr>`;
  }
}

function renderNotesTable(notes) {
  const tbody = document.getElementById('allNotesTbody');
  if (!notes || notes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="table-empty">No study notes matching current filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = notes.map(n => `
    <tr>
      <td>
        <img src="${n.thumbnail_url || '/assets/images/logo.jpg'}" class="table-thumb" alt="Thumb" onerror="this.src='/assets/images/logo.jpg'">
      </td>
      <td>
        <strong>${escapeHtml(n.title)}</strong><br>
        <small style="color:#64748B;">Subject: ${escapeHtml(n.subject || 'Core Engineering')} • ${n.pdf_filesize || '10 MB'}</small>
      </td>
      <td><span class="badge-status status-published">${escapeHtml(n.category)}</span></td>
      <td><small>${escapeHtml(n.semester || 'All')} • ${escapeHtml(n.branch || 'CSE')}</small></td>
      <td>
        ${n.is_free ? '<strong style="color:#10B981;">100% FREE</strong>' : `<strong>₹${n.price}</strong> <small style="text-decoration:line-through; color:#94A3B8;">₹${n.original_price}</small>`}
      </td>
      <td>📥 ${n.downloads_count || 0}</td>
      <td>
        <button class="btn-table-action ${n.is_published ? 'status-paid' : 'status-draft'}" onclick="togglePublishNote(${n.id})" title="Click to Toggle Published / Draft">
          ${n.is_published ? '✓ Published' : 'Draft'}
        </button>
      </td>
      <td>
        <div class="table-actions">
          <button class="btn-table-action" onclick="openEditNoteModal(${n.id})" title="Edit Details &amp; Pricing">✏️ Edit</button>
          <a href="/api/downloads/${n.id}" class="btn-table-action" title="Download Authorized PDF">⬇️ PDF</a>
          <button class="btn-table-action btn-table-danger" onclick="confirmDeleteNote(${n.id}, '${escapeQuote(n.title)}')" title="Permanently Delete Note">🗑️</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function filterNotesTable() {
  const search = document.getElementById('notesSearchInput').value.toLowerCase().trim();
  const category = document.getElementById('notesCategoryFilter').value;
  const pricing = document.getElementById('notesPricingFilter').value;
  const sort = document.getElementById('notesSortSelect').value;

  let filtered = [...allNotesCache];

  if (search) {
    filtered = filtered.filter(n => 
      n.title.toLowerCase().includes(search) || 
      (n.subject && n.subject.toLowerCase().includes(search)) ||
      (n.tags && n.tags.toLowerCase().includes(search))
    );
  }

  if (category !== 'all') {
    filtered = filtered.filter(n => n.category === category);
  }

  if (pricing === 'free') {
    filtered = filtered.filter(n => n.is_free === 1);
  } else if (pricing === 'paid') {
    filtered = filtered.filter(n => n.is_free === 0);
  }

  if (sort === 'price_low') {
    filtered.sort((a, b) => a.price - b.price);
  } else if (sort === 'price_high') {
    filtered.sort((a, b) => b.price - a.price);
  } else if (sort === 'downloads') {
    filtered.sort((a, b) => (b.downloads_count || 0) - (a.downloads_count || 0));
  } else {
    // Newest
    filtered.sort((a, b) => b.id - a.id);
  }

  renderNotesTable(filtered);
}

function openUploadPdfModal() {
  document.getElementById('editNoteId').value = '';
  document.getElementById('modalPdfTitle').innerText = 'Upload New Study Note / PDF';
  document.getElementById('uploadPdfForm').reset();
  document.getElementById('notePriceInput').disabled = false;
  document.getElementById('pdfFileHelp').innerText = 'Stored privately in protected_storage/pdfs/. Never accessible without authorization.';
  document.getElementById('btnSaveNote').innerText = '💾 Save & Upload';
  const m = document.getElementById('uploadPdfModal');
  m.style.display = 'flex';
  m.classList.add('active');
}

function openEditNoteModal(id) {
  const note = allNotesCache.find(n => n.id === id);
  if (!note) return;

  document.getElementById('editNoteId').value = note.id;
  document.getElementById('modalPdfTitle').innerText = `Edit: ${note.title}`;
  document.getElementById('noteTitleInput').value = note.title;
  document.getElementById('noteCategorySelect').value = note.category;
  document.getElementById('noteSubjectInput').value = note.subject || '';
  document.getElementById('noteBranchSelect').value = note.branch || 'CSE / IT';
  document.getElementById('noteSemesterSelect').value = note.semester || '1st Semester';
  document.getElementById('notePriceInput').value = note.price;
  document.getElementById('noteOrigPriceInput').value = note.original_price || 0;
  document.getElementById('noteFreeToggle').value = note.is_free ? '1' : '0';
  document.getElementById('noteDescriptionInput').value = note.description || '';
  document.getElementById('noteTagsInput').value = note.tags || '';
  document.getElementById('notePublishToggle').value = note.is_published ? '1' : '0';

  togglePriceDisabled(note.is_free ? '1' : '0');
  document.getElementById('pdfFileHelp').innerText = `Current File: ${note.pdf_filename}. Uploading a new PDF will replace it.`;
  document.getElementById('btnSaveNote').innerText = '💾 Update Note';
  const m = document.getElementById('uploadPdfModal');
  m.style.display = 'flex';
  m.classList.add('active');
}

function closeUploadPdfModal() {
  const m = document.getElementById('uploadPdfModal');
  m.style.display = 'none';
  m.classList.remove('active');
}

function togglePriceDisabled(val) {
  const priceInput = document.getElementById('notePriceInput');
  if (val === '1') {
    priceInput.value = '0';
    priceInput.disabled = true;
  } else {
    priceInput.disabled = false;
    if (priceInput.value === '0') priceInput.value = '49';
  }
}

async function handleSaveNote(e) {
  e.preventDefault();
  const editId = document.getElementById('editNoteId').value;
  const btn = document.getElementById('btnSaveNote');
  btn.disabled = true;
  btn.innerText = 'Processing...';

  try {
    if (!editId) {
      // Create new note with FormData
      const formData = new FormData();
      formData.append('title', document.getElementById('noteTitleInput').value.trim());
      formData.append('category', document.getElementById('noteCategorySelect').value);
      formData.append('subject', document.getElementById('noteSubjectInput').value.trim());
      formData.append('branch', document.getElementById('noteBranchSelect').value);
      formData.append('semester', document.getElementById('noteSemesterSelect').value);
      formData.append('price', document.getElementById('notePriceInput').value);
      formData.append('original_price', document.getElementById('noteOrigPriceInput').value);
      formData.append('is_free', document.getElementById('noteFreeToggle').value);
      formData.append('description', document.getElementById('noteDescriptionInput').value.trim());
      formData.append('tags', document.getElementById('noteTagsInput').value.trim());
      formData.append('is_published', document.getElementById('notePublishToggle').value);

      const pdfFile = document.getElementById('notePdfFileInput').files[0];
      if (pdfFile) formData.append('pdf_file', pdfFile);

      const thumbFile = document.getElementById('noteThumbFileInput').files[0];
      if (thumbFile) formData.append('thumbnail_file', thumbFile);

      const res = await fetch('/api/admin/notes', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${currentAdminToken}` },
        body: formData
      });

      if (res.ok) {
        showToast('Study note created and PDF secured successfully!', 'success');
        closeUploadPdfModal();
        loadAdminNotes();
      } else {
        const err = await res.json();
        showToast(err.detail || 'Failed to create note', 'error');
      }
    } else {
      // Update existing note
      const payload = {
        title: document.getElementById('noteTitleInput').value.trim(),
        category: document.getElementById('noteCategorySelect').value,
        subject: document.getElementById('noteSubjectInput').value.trim(),
        branch: document.getElementById('noteBranchSelect').value,
        semester: document.getElementById('noteSemesterSelect').value,
        price: parseFloat(document.getElementById('notePriceInput').value),
        original_price: parseFloat(document.getElementById('noteOrigPriceInput').value),
        is_free: parseInt(document.getElementById('noteFreeToggle').value),
        description: document.getElementById('noteDescriptionInput').value.trim(),
        tags: document.getElementById('noteTagsInput').value.trim(),
        is_published: parseInt(document.getElementById('notePublishToggle').value)
      };

      const res = await fetch(`/api/admin/notes/${editId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentAdminToken}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        showToast('Note updated successfully!', 'success');
        closeUploadPdfModal();
        loadAdminNotes();
      } else {
        const err = await res.json();
        showToast(err.detail || 'Failed to update note', 'error');
      }
    }
  } catch (err) {
    showToast('Failed to save note due to network error.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerText = '💾 Save & Upload';
  }
}

async function togglePublishNote(id) {
  try {
    const res = await fetch(`/api/admin/notes/${id}/toggle-publish`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${currentAdminToken}` }
    });
    if (res.ok) {
      const data = await res.json();
      showToast(data.message, 'success');
      loadAdminNotes();
    }
  } catch (err) {
    showToast('Failed to toggle publish status.', 'error');
  }
}

function confirmDeleteNote(id, title) {
  pendingDeleteId = id;
  pendingDeleteType = 'note';
  document.getElementById('deleteModalMessage').innerText = `Are you sure you want to permanently delete "${title}"? This will permanently remove the PDF file from private storage.`;
  const m = document.getElementById('confirmDeleteModal');
  m.style.display = 'flex';
  m.classList.add('active');
  document.getElementById('btnConfirmDeleteAction').onclick = executeConfirmedDelete;
}

function closeConfirmDeleteModal() {
  const m = document.getElementById('confirmDeleteModal');
  m.style.display = 'none';
  m.classList.remove('active');
  pendingDeleteId = null;
  pendingDeleteType = null;
}

async function executeConfirmedDelete() {
  if (!pendingDeleteId) return;
  const btn = document.getElementById('btnConfirmDeleteAction');
  btn.disabled = true;
  btn.innerText = 'Deleting...';

  try {
    if (pendingDeleteType === 'note') {
      const res = await fetch(`/api/admin/notes/${pendingDeleteId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${currentAdminToken}` }
      });
      if (res.ok) {
        showToast('Note and PDF permanently deleted.', 'success');
        closeConfirmDeleteModal();
        loadAdminNotes();
      } else {
        showToast('Failed to delete note.', 'error');
      }
    }
  } catch (err) {
    showToast('Error during deletion.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerText = '🗑️ Yes, Delete Permanently';
  }
}

// -------------------------------------------------------------
// 6. TAB 3: COURSES MANAGEMENT
// -------------------------------------------------------------

async function loadAdminCourses() {
  const grid = document.getElementById('adminCoursesGrid');
  grid.innerHTML = '<p class="table-empty">Loading courses...</p>';

  try {
    const res = await fetch('/api/admin/courses', {
      headers: { 'Authorization': `Bearer ${currentAdminToken}` }
    });
    if (!res.ok) return;

    const courses = await res.json();
    if (courses.length === 0) {
      grid.innerHTML = '<p class="table-empty">No masterclasses created yet.</p>';
      return;
    }

    grid.innerHTML = courses.map(c => `
      <div class="panel-card" style="margin-bottom:1rem; padding:1.25rem;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <h4 style="font-size:1.1rem; font-weight:800; margin-bottom:0.25rem;">${escapeHtml(c.title)}</h4>
            <p style="font-size:0.82rem; color:#64748B;">${escapeHtml(c.description)}</p>
            <div style="margin-top:0.5rem; display:flex; gap:0.5rem;">
              <span class="badge-status status-paid">Price: ₹${c.price}</span>
              <span class="badge-status ${c.is_published ? 'status-published' : 'status-draft'}">${c.is_published ? 'Active' : 'Draft'}</span>
            </div>
          </div>
          <button class="btn-table-action btn-table-danger" onclick="deleteCourse(${c.id})">Delete</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    grid.innerHTML = '<p class="table-empty">Failed to load courses.</p>';
  }
}

async function deleteCourse(id) {
  if (!confirm('Are you sure you want to delete this course?')) return;
  try {
    const res = await fetch(`/api/admin/courses/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${currentAdminToken}` }
    });
    if (res.ok) {
      showToast('Course removed.', 'success');
      loadAdminCourses();
    }
  } catch (e) {}
}

function openCreateCourseModal() {
  const title = prompt('Enter Course Title:');
  if (!title) return;
  const price = prompt('Enter Course Price (₹):', '499');
  const description = prompt('Enter Course Description:', 'Comprehensive placement & engineering masterclass.');

  fetch('/api/admin/courses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${currentAdminToken}`
    },
    body: JSON.stringify({ title, price: parseFloat(price) || 0, description, modules: [] })
  }).then(res => {
    if (res.ok) {
      showToast('Course created successfully!', 'success');
      loadAdminCourses();
    }
  });
}

// -------------------------------------------------------------
// 7. TAB 4: ORDERS & PAYMENTS
// -------------------------------------------------------------

async function loadAdminOrders() {
  const tbody = document.getElementById('adminOrdersTbody');
  tbody.innerHTML = `<tr><td colspan="9" class="table-empty">Loading orders...</td></tr>`;

  try {
    const res = await fetch('/api/admin/orders', {
      headers: { 'Authorization': `Bearer ${currentAdminToken}` }
    });
    if (!res.ok) return;

    const orders = await res.json();
    const filter = document.getElementById('orderStatusFilter').value;
    const filtered = filter === 'all' ? orders : orders.filter(o => o.payment_status === filter);

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="table-empty">No orders found.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(o => {
      let itemsStr = 'Study Notes';
      try {
        const parsed = JSON.parse(o.items_json);
        itemsStr = parsed.map(i => i.title).join(', ');
      } catch (e) {}

      return `
        <tr>
          <td><strong>${escapeHtml(o.order_number)}</strong></td>
          <td>${escapeHtml(o.customer_name)}</td>
          <td>${escapeHtml(o.customer_email)}<br><small style="color:#64748B;">${escapeHtml(o.customer_phone)}</small></td>
          <td style="max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(itemsStr)}">
            ${escapeHtml(itemsStr)}
          </td>
          <td><strong>₹${o.total_amount}</strong></td>
          <td><span class="badge-status status-${o.payment_status.toLowerCase()}">${o.payment_status}</span></td>
          <td><small style="font-family:monospace;">${escapeHtml(o.transaction_id || 'N/A')}</small></td>
          <td><small>${formatDate(o.created_at)}</small></td>
          <td>
            <select onchange="changeOrderStatus(${o.id}, this.value)" style="padding:0.25rem; font-size:0.75rem; border-radius:4px; border:1px solid #CBD5E1;">
              <option value="Paid" ${o.payment_status === 'Paid' ? 'selected' : ''}>Set Paid</option>
              <option value="Pending" ${o.payment_status === 'Pending' ? 'selected' : ''}>Pending</option>
              <option value="Failed" ${o.payment_status === 'Failed' ? 'selected' : ''}>Failed</option>
              <option value="Cancelled" ${o.payment_status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
              <option value="Refunded" ${o.payment_status === 'Refunded' ? 'selected' : ''}>Refunded</option>
            </select>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" class="table-empty">Failed to load orders.</td></tr>`;
  }
}

async function changeOrderStatus(orderId, newStatus) {
  try {
    const res = await fetch(`/api/admin/orders/${orderId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentAdminToken}`
      },
      body: JSON.stringify({ payment_status: newStatus })
    });
    if (res.ok) {
      showToast(`Order status updated to ${newStatus}.`, 'success');
      loadAdminOrders();
    }
  } catch (e) {
    showToast('Failed to update status', 'error');
  }
}

// -------------------------------------------------------------
// 8. TAB 5: USERS & STUDENTS
// -------------------------------------------------------------

async function loadAdminUsers() {
  const tbody = document.getElementById('adminUsersTbody');
  tbody.innerHTML = `<tr><td colspan="9" class="table-empty">Loading student directory...</td></tr>`;

  try {
    const res = await fetch('/api/admin/users', {
      headers: { 'Authorization': `Bearer ${currentAdminToken}` }
    });
    if (!res.ok) return;

    allUsersCache = await res.json();
    renderUsersTable(allUsersCache);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" class="table-empty">Failed to load students.</td></tr>`;
  }
}

function renderUsersTable(users) {
  const tbody = document.getElementById('adminUsersTbody');
  if (users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="table-empty">No students found.</td></tr>`;
    return;
  }

  tbody.innerHTML = users.map(u => `
    <tr>
      <td><strong>${escapeHtml(u.name)}</strong></td>
      <td>${escapeHtml(u.email)}</td>
      <td>${escapeHtml(u.phone || '-')}</td>
      <td><small>${escapeHtml(u.college || '-')} • ${escapeHtml(u.branch || '-')}</small></td>
      <td><strong>${u.purchases_count || 0}</strong></td>
      <td>${u.orders_count || 0}</td>
      <td>
        <span class="badge-status ${u.is_blocked ? 'status-failed' : 'status-paid'}">
          ${u.is_blocked ? 'Blocked' : 'Active'}
        </span>
      </td>
      <td><small>${formatDate(u.created_at)}</small></td>
      <td>
        ${u.role === 'admin' ? '<small>Master Admin</small>' : `
          <button class="btn-table-action ${u.is_blocked ? 'status-paid' : 'btn-table-danger'}" onclick="toggleBlockStudent(${u.id})">
            ${u.is_blocked ? 'Unblock' : 'Block'}
          </button>
        `}
      </td>
    </tr>
  `).join('');
}

function filterUsersTable() {
  const q = document.getElementById('userSearchInput').value.toLowerCase().trim();
  const filtered = allUsersCache.filter(u => 
    u.name.toLowerCase().includes(q) || 
    u.email.toLowerCase().includes(q) || 
    (u.phone && u.phone.includes(q))
  );
  renderUsersTable(filtered);
}

async function toggleBlockStudent(id) {
  try {
    const res = await fetch(`/api/admin/users/${id}/toggle-block`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${currentAdminToken}` }
    });
    if (res.ok) {
      const data = await res.json();
      showToast(data.message, 'success');
      loadAdminUsers();
    }
  } catch (e) {
    showToast('Failed to toggle user block status', 'error');
  }
}

// -------------------------------------------------------------
// 9. TAB 6: WEBSITE CONTENT CMS
// -------------------------------------------------------------

async function loadCmsContent() {
  try {
    const res = await fetch('/api/admin/content', {
      headers: { 'Authorization': `Bearer ${currentAdminToken}` }
    });
    if (!res.ok) return;

    const data = await res.json();
    document.getElementById('cms_hero_headline').value = data.hero_headline || '';
    document.getElementById('cms_hero_subheading').value = data.hero_subheading || '';
    document.getElementById('cms_tagline').value = data.tagline || '';
    document.getElementById('cms_announcement_text').value = data.announcement_text || '';
    document.getElementById('cms_announcement_active').value = data.announcement_active || 'true';
    document.getElementById('cms_about_text').value = data.about_text || '';
    document.getElementById('cms_instagram_url').value = data.instagram_url || '';
    document.getElementById('cms_telegram_url').value = data.telegram_url || '';
    document.getElementById('cms_contact_email').value = data.contact_email || '';
    document.getElementById('cms_contact_phone').value = data.contact_phone || '';
  } catch (err) {
    console.error('Failed to load CMS content:', err);
  }
}

async function saveCmsContent() {
  const content = {
    hero_headline: document.getElementById('cms_hero_headline').value.trim(),
    hero_subheading: document.getElementById('cms_hero_subheading').value.trim(),
    tagline: document.getElementById('cms_tagline').value.trim(),
    announcement_text: document.getElementById('cms_announcement_text').value.trim(),
    announcement_active: document.getElementById('cms_announcement_active').value,
    about_text: document.getElementById('cms_about_text').value.trim(),
    instagram_url: document.getElementById('cms_instagram_url').value.trim(),
    telegram_url: document.getElementById('cms_telegram_url').value.trim(),
    contact_email: document.getElementById('cms_contact_email').value.trim(),
    contact_phone: document.getElementById('cms_contact_phone').value.trim()
  };

  try {
    const res = await fetch('/api/admin/content', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentAdminToken}`
      },
      body: JSON.stringify({ content })
    });

    if (res.ok) {
      showToast('Live website copy updated! Public site reflects changes immediately.', 'success');
    } else {
      showToast('Failed to save website content.', 'error');
    }
  } catch (e) {
    showToast('Error saving CMS content.', 'error');
  }
}

// -------------------------------------------------------------
// 10. TAB 7: MEDIA ASSETS LIBRARY
// -------------------------------------------------------------

async function loadAdminMedia() {
  const grid = document.getElementById('mediaLibraryGrid');
  grid.innerHTML = '<p class="table-empty">Loading media assets...</p>';

  try {
    const res = await fetch('/api/admin/media', {
      headers: { 'Authorization': `Bearer ${currentAdminToken}` }
    });
    if (!res.ok) return;

    const items = await res.json();
    if (items.length === 0) {
      grid.innerHTML = '<p class="table-empty">No media uploaded yet. Use "Upload New Image" above.</p>';
      return;
    }

    grid.innerHTML = items.map(m => `
      <div class="media-item-card">
        <img src="/${m.file_path}" class="media-item-preview" alt="${escapeHtml(m.original_name)}">
        <div class="media-item-footer">
          <span class="media-item-name" title="${escapeHtml(m.original_name)}">${escapeHtml(m.original_name)}</span>
          <button class="btn-table-action" onclick="copyMediaUrl('/${m.file_path}')">📋 Copy</button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    grid.innerHTML = '<p class="table-empty">Failed to load media.</p>';
  }
}

async function handleMediaUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch('/api/admin/media/upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${currentAdminToken}` },
      body: formData
    });

    if (res.ok) {
      showToast('Image uploaded to media library!', 'success');
      loadAdminMedia();
    } else {
      showToast('Failed to upload image.', 'error');
    }
  } catch (err) {
    showToast('Upload failed due to network error.', 'error');
  }
}

function copyMediaUrl(url) {
  navigator.clipboard.writeText(window.location.origin + url);
  showToast('Image URL copied to clipboard!', 'success');
}

// -------------------------------------------------------------
// 11. TAB 8: SECURITY & 2FA
// -------------------------------------------------------------

async function loadSecurityStatus() {
  try {
    const res = await fetch('/api/admin/security', {
      headers: { 'Authorization': `Bearer ${currentAdminToken}` }
    });
    if (!res.ok) return;

    const data = await res.json();
    const badge = document.getElementById('mfaStatusBadge');
    badge.innerText = data.mfa_enabled ? 'Active / Enabled' : 'Disabled';
    badge.className = `badge-status ${data.mfa_enabled ? 'status-paid' : 'status-failed'}`;
    document.getElementById('currentPinDisplay').innerText = data.mfa_secret || '849201';
  } catch (err) {
    console.error('Failed to load security status:', err);
  }
}

async function toggle2FA(enable) {
  const secret = document.getElementById('new2faPinInput').value.trim() || document.getElementById('currentPinDisplay').innerText;
  try {
    const res = await fetch('/api/admin/security/2fa', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentAdminToken}`
      },
      body: JSON.stringify({ enable, secret })
    });

    if (res.ok) {
      showToast(`2FA ${enable ? 'Enabled' : 'Disabled'} successfully.`, 'success');
      loadSecurityStatus();
    }
  } catch (e) {
    showToast('Failed to toggle 2FA.', 'error');
  }
}

async function handleAdminPasswordChange(e) {
  e.preventDefault();
  const currentPassword = document.getElementById('currentAdminPwdInput').value;
  const newPassword = document.getElementById('newAdminPwdInput').value;
  const confirm = document.getElementById('confirmAdminPwdInput').value;

  if (newPassword !== confirm) {
    showToast('New passwords do not match.', 'error');
    return;
  }

  try {
    const res = await fetch('/api/admin/security/password', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentAdminToken}`
      },
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
    });

    if (res.ok) {
      showToast('Master password updated successfully! Please re-login on next visit.', 'success');
      e.target.reset();
    } else {
      const err = await res.json();
      showToast(err.detail || 'Password update failed.', 'error');
    }
  } catch (err) {
    showToast('Error updating password.', 'error');
  }
}

// -------------------------------------------------------------
// 12. TAB 9: AUDIT LOGS
// -------------------------------------------------------------

async function loadAuditLogs() {
  const tbody = document.getElementById('fullAuditLogsTbody');
  tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Loading audit trail...</td></tr>`;

  try {
    const res = await fetch('/api/admin/logs?limit=100', {
      headers: { 'Authorization': `Bearer ${currentAdminToken}` }
    });
    if (!res.ok) return;

    const logs = await res.json();
    if (logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="table-empty">No audit events recorded yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = logs.map(l => `
      <tr>
        <td>#${l.id}</td>
        <td><small>${formatDate(l.created_at)}</small></td>
        <td><strong>${escapeHtml(l.action)}</strong></td>
        <td>${escapeHtml(l.object_type || '-')} (#${l.object_id})</td>
        <td>${escapeHtml(l.details || '-')}</td>
        <td><small style="font-family:monospace;">${escapeHtml(l.ip_address || '127.0.0.1')}</small></td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Failed to load audit logs.</td></tr>`;
  }
}

// -------------------------------------------------------------
// 13. TAB 10: STORE SETTINGS
// -------------------------------------------------------------

async function loadStoreSettings() {
  try {
    const res = await fetch('/api/admin/settings', {
      headers: { 'Authorization': `Bearer ${currentAdminToken}` }
    });
    if (!res.ok) return;

    const s = await res.json();
    document.getElementById('set_upi_id').value = s.upi_id || 'engineersdiary@upi';
    document.getElementById('set_upi_name').value = s.upi_name || "Engineer's Diary Official";
    document.getElementById('set_currency_symbol').value = s.currency_symbol || '₹';
    document.getElementById('set_auto_approve_orders').value = s.auto_approve_orders || 'true';
    document.getElementById('set_maintenance_mode').value = s.maintenance_mode || 'false';
  } catch (e) {}
}

async function saveStoreSettings() {
  const settings = {
    upi_id: document.getElementById('set_upi_id').value.trim(),
    upi_name: document.getElementById('set_upi_name').value.trim(),
    currency_symbol: document.getElementById('set_currency_symbol').value.trim(),
    auto_approve_orders: document.getElementById('set_auto_approve_orders').value,
    maintenance_mode: document.getElementById('set_maintenance_mode').value
  };

  try {
    const res = await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentAdminToken}`
      },
      body: JSON.stringify(settings)
    });

    if (res.ok) {
      showToast('Store settings saved successfully.', 'success');
    }
  } catch (e) {
    showToast('Failed to save settings.', 'error');
  }
}

// -------------------------------------------------------------
// 14. UTILITIES & TOASTS
// -------------------------------------------------------------

function showToast(msg, type = 'success') {
  const container = document.getElementById('adminToastContainer');
  const toast = document.createElement('div');
  toast.className = `admin-toast toast-${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✓' : '⚠️'}</span>
    <span>${escapeHtml(msg)}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeQuote(str) {
  if (!str) return '';
  return String(str).replace(/'/g, "\\'");
}

function formatDate(isoStr) {
  if (!isoStr) return '-';
  try {
    const d = new Date(isoStr);
    return d.toLocaleString('en-IN', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  } catch (e) {
    return isoStr;
  }
}
