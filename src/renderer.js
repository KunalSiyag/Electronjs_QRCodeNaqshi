const QRCode = require('qrcode');
const $ = id => document.getElementById(id);

class NaqshiGoldManager {
    constructor() {
        this.inventory = [];
        this.settings = { lastItemId: 0, storeName: 'Naqshi Gold & Pearls' };
        this.currentEditingId = null;
        this.currentPage = 1;
        this.itemsPerPage = 10;
        this.filteredInventory = [];
        this.init();
    }

    async init() {
        await this.loadData();
        this.setupEventListeners();
        this.setupTabNavigation();
        this.renderInventory();
        this.updateStats();
        this.generateNextItemId();
        this.setupFilters();
    }

    setupEventListeners() {
        const form = document.getElementById('itemForm');
        const clearBtn = document.getElementById('clearForm');
        const saveQRBtn = document.getElementById('saveQR');
        const printQRBtn = document.getElementById('printQR');
        const copyQRBtn = document.getElementById('copyQR');
        const searchBtn = document.getElementById('searchBtn');
        const exportBtn = document.getElementById('exportBtn');
        const newItemBtn = document.getElementById('newItemBtn');
        const cancelEditBtn = document.getElementById('cancelEdit');
        const calculatePriceBtn = document.getElementById('calculatePrice');
        const searchInput = document.getElementById('searchInput');

        // Form events
        form.addEventListener('submit', (e) => this.handleFormSubmit(e));
        clearBtn.addEventListener('click', () => this.clearForm());
        cancelEditBtn.addEventListener('click', () => this.cancelEdit());
        calculatePriceBtn.addEventListener('click', () => this.calculatePrice());

        // QR events
        saveQRBtn.addEventListener('click', () => this.saveQRCode());
        printQRBtn.addEventListener('click', () => this.printQRCode());
        copyQRBtn.addEventListener('click', () => this.copyQRData());

        // Search and navigation
        searchBtn.addEventListener('click', () => this.searchInventory());
        exportBtn.addEventListener('click', () => this.exportData());
        newItemBtn.addEventListener('click', () => this.switchToGenerator());
        searchInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') this.searchInventory();
        });
        searchInput.addEventListener('input', () => this.debounceSearch());

        // Item type change
        document.getElementById('itemType').addEventListener('change', (e) => {
            this.handleTypeChange(e.target.value);
        });

        // Price calculation inputs
        ['goldRate', 'weight', 'makingCharges', 'stoneValue'].forEach(id => {
            document.getElementById(id).addEventListener('input', () => this.autoCalculatePrice());
        });

        // Menu events
        window.electronAPI.onExportData(() => this.exportData());
        window.electronAPI.onImportData((event, filePath) => this.importData(filePath));

        // Pagination
        document.getElementById('prevPage').addEventListener('click', () => this.changePage(-1));
        document.getElementById('nextPage').addEventListener('click', () => this.changePage(1));

        // Filters
        document.getElementById('typeFilter').addEventListener('change', () => this.applyFilters());
        document.getElementById('purityFilter').addEventListener('change', () => this.applyFilters());
        document.getElementById('clearFilters').addEventListener('click', () => this.clearFilters());
    }

    setupTabNavigation() {
        const navItems = document.querySelectorAll('.nav-item');
        const tabContents = document.querySelectorAll('.tab-content');

        navItems.forEach(nav => {
            nav.addEventListener('click', () => {
                const targetTab = nav.dataset.tab;
                
                // Update nav active state
                navItems.forEach(n => n.classList.remove('active'));
                nav.classList.add('active');
                
                // Update tab content
                tabContents.forEach(tab => tab.classList.remove('active'));
                document.getElementById(targetTab).classList.add('active');
                
                // Update header
                this.updateHeader(targetTab);
                
                // Load tab-specific data
                if (targetTab === 'analytics') {
                    this.renderAnalytics();
                }
            });
        });
    }

    updateHeader(tab) {
        const titleMap = {
            generator: 'QR Code Generator',
            inventory: 'Inventory Management',
            analytics: 'Analytics Dashboard',
            settings: 'Settings'
        };
        
        const subtitleMap = {
            generator: 'Generate QR codes for your jewelry items',
            inventory: 'Manage your jewelry inventory',
            analytics: 'View business insights and statistics',
            settings: 'Configure application settings'
        };

        document.getElementById('pageTitle').textContent = titleMap[tab];
        document.getElementById('pageSubtitle').textContent = subtitleMap[tab];
    }

    handleTypeChange(type) {
  const grp = $('customTypeGroup');
  if (type === 'Other') {
    grp.style.display = 'block';
    $('customType').required = true;
  } else {
    grp.style.display = 'none';
    $('customType').required = false;
    $('customType').value = '';
  }
}

    generateNextItemId() {
        this.settings.lastItemId += 1;
        const paddedId = String(this.settings.lastItemId).padStart(4, '0');
        document.getElementById('itemId').value = `NGP${paddedId}`;
    }

    async handleFormSubmit(e) {
        e.preventDefault();
        
        const formData = this.getFormData();
        if (!formData) return;

        formData.dateCreated = this.currentEditingId 
            ? this.inventory.find(item => item.id === this.currentEditingId).dateCreated
            : new Date().toISOString();
        formData.dateModified = new Date().toISOString();
        formData.id = formData.itemId;

        if (this.currentEditingId) {
            // Update existing item
            const index = this.inventory.findIndex(item => item.id === this.currentEditingId);
            this.inventory[index] = formData;
            this.showMessage('Item updated successfully!', 'success');
        } else {
            // Add new item
            this.inventory.push(formData);
            this.showMessage('New item added successfully!', 'success');
        }

        await this.saveData();
        await this.generateQRCode(formData);
        this.renderInventory();
        this.updateStats();
        
        if (!this.currentEditingId) {
            this.generateNextItemId();
        }
    }

    getFormData() {
  const required = ['storeName','itemId','itemType','weight','purity','totalPrice'];
  const f = {};
  for (const r of required) {
    const el = $(r);
    if (!el.value.trim()) { this.showMessage(`Fill ${r}`,'error'); el.focus(); return null; }
    f[r] = el.value.trim();
  }
  if (f.itemType === 'Other') {
    const custom = $('customType').value.trim();
    if (!custom) { this.showMessage('Enter custom type','error'); $('customType').focus(); return null; }
    f.itemType = custom;
  }
  /* … keep old optional‐field code here … */
  return f;
}

    formatFieldName(field) {
        return field.replace(/([A-Z])/g, ' $1').toLowerCase().replace(/^\w/, c => c.toUpperCase());
    }

    calculatePrice() {
        const weight = parseFloat(document.getElementById('weight').value) || 0;
        const goldRate = parseFloat(document.getElementById('goldRate').value) || 0;
        const makingCharges = parseFloat(document.getElementById('makingCharges').value) || 0;
        const stoneValue = parseFloat(document.getElementById('stoneValue').value) || 0;

        if (weight > 0 && goldRate > 0) {
            const goldValue = weight * goldRate;
            const totalPrice = goldValue + makingCharges + stoneValue;
            document.getElementById('totalPrice').value = totalPrice.toFixed(2);
            this.showMessage('Price calculated automatically', 'info');
        } else {
            this.showMessage('Please enter weight and gold rate first', 'warning');
        }
    }

    autoCalculatePrice() {
        const weight = parseFloat(document.getElementById('weight').value) || 0;
        const goldRate = parseFloat(document.getElementById('goldRate').value) || 0;
        
        if (weight > 0 && goldRate > 0) {
            setTimeout(() => this.calculatePrice(), 500);
        }
    }

    async generateQRCode(item) {
  const qrContainer = $('qrcode');
  const qrActions   = $('qrActions');
  const qrInfo      = $('qrInfo');
  const qrStatus    = $('qrStatus');

  const payload = { ...item, dateCreated:new Date(item.dateCreated).toLocaleDateString() };
  const canvas  = await QRCode.toCanvas(JSON.stringify(payload), { width:300, errorCorrectionLevel:'M' });

  qrContainer.innerHTML = '';
  qrContainer.appendChild(canvas);
  qrInfo.style.display = 'block';
  qrInfo.innerHTML = `<strong>QR Data</strong><pre>${JSON.stringify(payload,null,2)}</pre>`;
  qrActions.style.display = 'flex';
  qrStatus.textContent = 'Generated';
  qrStatus.style.background = 'var(--success-color)';

  this.currentQRData = { canvas, data:payload };
}

    async saveQRCode() {
        if (!this.currentQRData) {
            this.showMessage('No QR code to save', 'error');
            return;
        }

        try {
            const canvas = this.currentQRData.canvas;
            const dataURL = canvas.toDataURL('image/png');
            const filename = `${this.currentQRData.data.itemId}_QR.png`;

            const result = await window.electronAPI.saveQRImage(dataURL, filename);
            
            if (result.success) {
                this.showMessage('QR code saved successfully!', 'success');
            }
        } catch (error) {
            console.error('Error saving QR code:', error);
            this.showMessage('Error saving QR code', 'error');
        }
    }

    printQRCode() {
        if (!this.currentQRData) {
            this.showMessage('No QR code to print', 'error');
            return;
        }

        const printWindow = window.open('', '_blank');
        const canvas = this.currentQRData.canvas;
        const dataURL = canvas.toDataURL('image/png');
        const data = this.currentQRData.data;
        const itemData = this.currentQRData.itemData;

        printWindow.document.write(`
            <html>
                <head>
                    <title>Print QR Label - ${data.itemId}</title>
                    <style>
                        body { 
                            font-family: Arial, sans-serif; 
                            margin: 0; 
                            padding: 20px;
                            background: white;
                        }
                        .label-container {
                            width: 4in;
                            margin: 0 auto;
                            border: 2px solid #333;
                            padding: 15px;
                            text-align: center;
                        }
                        .store-header {
                            font-size: 16px;
                            font-weight: bold;
                            margin-bottom: 5px;
                            color: #d4af37;
                        }
                        .store-tagline {
                            font-size: 12px;
                            color: #666;
                            margin-bottom: 15px;
                        }
                        .qr-code {
                            margin: 15px 0;
                        }
                        .item-info {
                            text-align: left;
                            margin: 15px 0;
                        }
                        .item-info div {
                            margin: 3px 0;
                            font-size: 11px;
                        }
                        .item-id {
                            font-weight: bold;
                            font-size: 14px;
                            color: #333;
                            text-align: center;
                            margin: 10px 0;
                        }
                        .footer {
                            font-size: 10px;
                            color: #666;
                            margin-top: 15px;
                            text-align: center;
                        }
                        @media print { 
                            body { 
                                margin: 0; 
                                padding: 10px;
                            }
                            .label-container {
                                border: 2px solid #333;
                            }
                        }
                    </style>
                </head>
                <body>
                    <div class="label-container">
                        <div class="store-header">NAQSHI GOLD & PEARLS</div>
                        <div class="store-tagline">Premium Jewelry Collection</div>
                        
                        <div class="item-id">${data.itemId}</div>
                        
                        <div class="qr-code">
                            <img src="${dataURL}" alt="QR Code" style="width: 120px; height: 120px;" />
                        </div>
                        
                        <div class="item-info">
                            <div><strong>Type:</strong> ${data.type}</div>
                            <div><strong>Weight:</strong> ${data.weight}</div>
                            <div><strong>Purity:</strong> ${data.purity}</div>
                            ${data.size ? `<div><strong>Size:</strong> ${data.size}</div>` : ''}
                            ${data.color ? `<div><strong>Color:</strong> ${data.color}</div>` : ''}
                            <div><strong>Price:</strong> ${data.totalPrice}</div>
                            ${data.hallmark ? `<div><strong>Hallmark:</strong> ${data.hallmark}</div>` : ''}
                        </div>
                        
                        <div class="footer">
                            Scan QR code for complete item details<br>
                            Generated: ${new Date().toLocaleDateString()}
                        </div>
                    </div>
                </body>
            </html>
        `);

        printWindow.document.close();
        setTimeout(() => {
            printWindow.print();
        }, 500);
    }

    copyQRData() {
        if (!this.currentQRData) {
            this.showMessage('No QR code data to copy', 'error');
            return;
        }

        const dataText = JSON.stringify(this.currentQRData.data, null, 2);
        navigator.clipboard.writeText(dataText).then(() => {
            this.showMessage('QR code data copied to clipboard!', 'success');
        }).catch(() => {
            this.showMessage('Failed to copy data', 'error');
        });
    }

    editItem(itemId) {
        const item = this.inventory.find(i => i.id === itemId);
        if (!item) return;

        // Switch to generator tab
        this.switchToGenerator();
        
        // Set form mode
        this.currentEditingId = itemId;
        document.getElementById('formMode').textContent = 'Edit Mode';
        document.getElementById('cancelEdit').style.display = 'inline-block';
        document.getElementById('submitBtnText').textContent = 'Update Item';

        // Populate form
        Object.keys(item).forEach(key => {
            const element = document.getElementById(key);
            if (element) {
                element.value = item[key];
            }
        });

        // Handle custom type
        if (!['Ring', 'Necklace', 'Bracelet', 'Earrings', 'Chain', 'Pendant', 'Bangle', 'Anklet', 'Nose Pin', 'Toe Ring', 'Pearls', 'Set'].includes(item.itemType)) {
            document.getElementById('itemType').value = 'Other';
            document.getElementById('customType').value = item.itemType;
            this.handleTypeChange('Other');
        }

        // Generate QR for existing item
        this.generateQRCode(item);
        
        document.querySelector('.form-section').scrollIntoView({ behavior: 'smooth' });
    }

    cancelEdit() {
        this.currentEditingId = null;
        document.getElementById('formMode').textContent = 'Add New';
        document.getElementById('cancelEdit').style.display = 'none';
        document.getElementById('submitBtnText').textContent = 'Generate QR Code';
        this.clearForm();
    }

    deleteItem(itemId) {
        const item = this.inventory.find(i => i.id === itemId);
        if (!item) return;

        if (confirm(`Are you sure you want to delete item ${item.itemId}?`)) {
            this.inventory = this.inventory.filter(item => item.id !== itemId);
            this.saveData();
            this.renderInventory();
            this.updateStats();
            this.showMessage('Item deleted successfully', 'success');
        }
    }

    async regenerateQR(itemId) {
        const item = this.inventory.find(i => i.id === itemId);
        if (item) {
            await this.generateQRCode(item);
            this.switchToGenerator();
            document.querySelector('.qr-section').scrollIntoView({ behavior: 'smooth' });
        }
    }

    switchToGenerator() {
        document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
        document.querySelector('.nav-item[data-tab="generator"]').classList.add('active');
        
        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
        document.getElementById('generator').classList.add('active');
        
        this.updateHeader('generator');
    }

    setupFilters() {
  const uniq = (arr) => [...new Set(arr)].filter(Boolean).sort();
  $('typeFilter').innerHTML   = '<option value="">All Types</option>'   + uniq(this.inventory.map(i=>i.itemType)).map(t=>`<option>${t}</option>`).join('');
  $('purityFilter').innerHTML = '<option value="">All Purities</option>' + uniq(this.inventory.map(i=>i.purity)).map(p=>`<option>${p}</option>`).join('');
}
    applyFilters() {
        const typeFilter = document.getElementById('typeFilter').value;
        const purityFilter = document.getElementById('purityFilter').value;
        const searchTerm = document.getElementById('searchInput').value.toLowerCase();

        this.filteredInventory = this.inventory.filter(item => {
            const matchesType = !typeFilter || item.itemType === typeFilter;
            const matchesPurity = !purityFilter || item.purity === purityFilter;
            const matchesSearch = !searchTerm || 
                item.itemId.toLowerCase().includes(searchTerm) ||
                item.itemType.toLowerCase().includes(searchTerm) ||
                item.description.toLowerCase().includes(searchTerm) ||
                item.hallmark.toLowerCase().includes(searchTerm);

            return matchesType && matchesPurity && matchesSearch;
        });

        this.currentPage = 1;
        this.renderInventory();
    }

    clearFilters() {
        document.getElementById('typeFilter').value = '';
        document.getElementById('purityFilter').value = '';
        document.getElementById('searchInput').value = '';
        this.filteredInventory = [];
        this.renderInventory();
    }

    searchInventory() {
        this.applyFilters();
    }

    debounceSearch() {
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            this.applyFilters();
        }, 300);
    }

    changePage(direction) {
        const totalPages = this.getTotalPages();
        this.currentPage += direction;
        
        if (this.currentPage < 1) this.currentPage = 1;
        if (this.currentPage > totalPages) this.currentPage = totalPages;
        
        this.renderInventory();
    }

    getTotalPages() {
        const itemsToRender = this.filteredInventory.length > 0 ? this.filteredInventory : this.inventory;
        return Math.ceil(itemsToRender.length / this.itemsPerPage);
    }

    renderInventory() {
        const inventoryList = document.getElementById('inventoryList');
        const itemsToRender = this.filteredInventory.length > 0 ? this.filteredInventory : this.inventory;
        
        if (itemsToRender.length === 0) {
            inventoryList.innerHTML = `
                <div style="text-align: center; padding: 60px 20px; color: #6c757d;">
                    <h3>No items found</h3>
                    <p>Start by adding your first jewelry item</p>
                </div>
            `;
            this.updatePagination(0, 0);
            return;
        }

        // Pagination
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const paginatedItems = itemsToRender.slice(startIndex, endIndex);

        inventoryList.innerHTML = paginatedItems.map(item => `
            <div class="inventory-item">
                <div class="item-header">
                    <h4>${item.itemType}</h4>
                    <span class="item-id">${item.itemId}</span>
                </div>
                <div class="item-content">
                    <div class="item-details">
                        <div class="detail-group">
                            <h5>Weight & Purity</h5>
                            <p>${item.weight}g • ${item.purity}</p>
                        </div>
                        <div class="detail-group">
                            <h5>Price</h5>
                            <p>$${item.totalPrice}</p>
                        </div>
                        <div class="detail-group">
                            <h5>Size & Color</h5>
                            <p>${item.size || 'N/A'} • ${item.color || 'N/A'}</p>
                        </div>
                        <div class="detail-group">
                            <h5>Hallmark</h5>
                            <p>${item.hallmark || 'Not specified'}</p>
                        </div>
                        <div class="detail-group">
                            <h5>Created</h5>
                            <p>${new Date(item.dateCreated).toLocaleDateString()}</p>
                        </div>
                        <div class="detail-group">
                            <h5>Description</h5>
                            <p>${item.description || 'No description'}</p>
                        </div>
                    </div>
                    <div class="item-actions">
                        <button class="action-btn edit-btn" onclick="naqshiGold.editItem('${item.id}')">
                            ✏️ Edit
                        </button>
                        <button class="action-btn qr-btn" onclick="naqshiGold.regenerateQR('${item.id}')">
                            📱 QR Code
                        </button>
                        <button class="action-btn delete-btn" onclick="naqshiGold.deleteItem('${item.id}')">
                            🗑️ Delete
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

        this.updatePagination(itemsToRender.length, paginatedItems.length);
        this.setupFilters();
    }

    updatePagination(totalItems, currentPageItems) {
        const totalPages = this.getTotalPages();
        document.getElementById('pageInfo').textContent = 
            `Page ${this.currentPage} of ${totalPages} (${currentPageItems} of ${totalItems} items)`;
        
        document.getElementById('prevPage').disabled = this.currentPage === 1;
        document.getElementById('nextPage').disabled = this.currentPage === totalPages || totalPages === 0;
    }

    renderAnalytics() {
        const summary = document.getElementById('inventorySummary');
        const valueDistribution = document.getElementById('valueDistribution');

        // Inventory summary
        const typeCount = {};
        const purityCount = {};
        let totalValue = 0;

        this.inventory.forEach(item => {
            typeCount[item.itemType] = (typeCount[item.itemType] || 0) + 1;
            purityCount[item.purity] = (purityCount[item.purity] || 0) + 1;
            totalValue += parseFloat(item.totalPrice) || 0;
        });

        summary.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px;">
                <div style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 8px;">
                    <h4 style="color: #d4af37; font-size: 2em; margin-bottom: 10px;">${this.inventory.length}</h4>
                    <p>Total Items</p>
                </div>
                <div style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 8px;">
                    <h4 style="color: #27ae60; font-size: 2em; margin-bottom: 10px;">$${totalValue.toFixed(2)}</h4>
                    <p>Total Value</p>
                </div>
                <div style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 8px;">
                    <h4 style="color: #3498db; font-size: 2em; margin-bottom: 10px;">${Object.keys(typeCount).length}</h4>
                    <p>Item Types</p>
                </div>
            </div>
            
            <h4 style="margin: 30px 0 15px 0;">Items by Type</h4>
            <div style="display: grid; gap: 10px;">
                ${Object.entries(typeCount).map(([type, count]) => `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #f8f9fa; border-radius: 6px;">
                        <span>${type}</span>
                        <strong>${count}</strong>
                    </div>
                `).join('')}
            </div>
        `;

        valueDistribution.innerHTML = `
            <h4 style="margin: 0 0 15px 0;">Items by Purity</h4>
            <div style="display: grid; gap: 10px;">
                ${Object.entries(purityCount).map(([purity, count]) => `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #f8f9fa; border-radius: 6px;">
                        <span>${purity}</span>
                        <strong>${count}</strong>
                    </div>
                `).join('')}
            </div>
        `;
    }

    updateStats() {
        const totalItems = this.inventory.length;
        const totalValue = this.inventory.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0);

        document.getElementById('totalItems').textContent = totalItems;
        document.getElementById('totalValue').textContent = `$${totalValue.toFixed(2)}`;
    }

    clearForm() {
        document.getElementById('itemForm').reset();
        document.getElementById('storeName').value = this.settings.storeName;
        document.getElementById('qrcode').innerHTML = `
            <div class="qr-placeholder">
                <span class="qr-icon">📱</span>
                <p>QR code will appear here</p>
            </div>
        `;
        document.getElementById('qrInfo').style.display = 'none';
        document.getElementById('qrActions').style.display = 'none';
        document.getElementById('qrStatus').textContent = 'Ready to generate';
        document.getElementById('qrStatus').style.background = 'var(--info-color)';
        document.getElementById('customTypeGroup').style.display = 'none';
        
        this.currentQRData = null;
        
        if (!this.currentEditingId) {
            this.generateNextItemId();
        }
    }

    async exportData() {
        const exportData = {
            inventory: this.inventory,
            settings: this.settings,
            exportDate: new Date().toISOString(),
            version: '1.0.0'
        };

        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `naqshi-gold-backup-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        this.showMessage('Data exported successfully!', 'success');
    }
async saveData() {
        try {
            await window.electronAPI.saveData({
                inventory: this.inventory,
                settings: this.settings
            });
        } catch (error) {
            console.error('Error saving data:', error);
        }
    }

    async loadData() {
        try {
            const result = await window.electronAPI.loadData();
            this.inventory = Array.isArray(result.inventory) ? result.inventory : [];
            this.settings  = result.settings || { lastItemId: 0, storeName: 'Naqshi Gold & Pearls' };
            
            // Make sure the ID generator starts at the right place
            if (!this.currentEditingId) {
                this.generateNextItemId();
            }
        } catch (error) {
            console.error('Error loading data:', error);
            this.inventory = [];
            this.settings  = { lastItemId: 0, storeName: 'Naqshi Gold & Pearls' };
        }
    }

    async importData(filePath) {
        try {
            const response = await fetch(`file://${filePath}`);
            const json     = await response.json();

            if (json.inventory && Array.isArray(json.inventory))  this.inventory = json.inventory;
            if (json.settings)                                    this.settings  = json.settings;

            await this.saveData();
            this.renderInventory();
            this.updateStats();
            this.showMessage('Data imported successfully!', 'success');
        } catch (err) {
            console.error('Import failed:', err);
            this.showMessage('Failed to import data', 'error');
        }
    }

    showMessage(message, type = 'info') {
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            toast.style.transform = 'translateX(0)';
        });

        setTimeout(() => {
            toast.style.transform = 'translateX(120%)';
            toast.addEventListener('transitionend', () => toast.remove(), { once: true });
        }, 3500);
    }
}

/* ------------------------------------------------------------------ */
/*  INITIALISE APP (make global for HTML inline handlers)             */
/* ------------------------------------------------------------------ */

const naqshiGold = new NaqshiGoldManager();
window.naqshiGold = naqshiGold;   // allow HTML buttons like onclick="naqshiGold.editItem(id)"